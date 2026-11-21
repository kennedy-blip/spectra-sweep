// ============================================================
// SPECTRA-SWEEP — Ultrasonic Beacon Engine
// 48 kHz Web Audio capture → 15.0–22.5 kHz high-resolution FFT,
// narrowband beacon lock-on, and an active 18.5–21.5 kHz acoustic
// masking curtain synthesized from band-limited noise.
//
// Critical: the capture graph disables echoCancellation,
// noiseSuppression and autoGainControl, otherwise the browser DSP
// notch-filters everything above ~16 kHz and beacons vanish.
// ============================================================

import type { UltrasonicPeak } from '../types';

/**
 * Global render-loop gate. The DSP engines own continuous requestAnimationFrame
 * loops; hosts that must stay idle (headless test environments, or a device
 * parked in ultra battery-saver) set this to false and still get every
 * pure computation, including on-demand sample processing.
 */
export const engineRuntime = { animationLoop: true };

export const FFT_SIZE = 16384;
export const SCAN_LOW_HZ = 15000;
export const SCAN_HIGH_HZ = 22500;
export const FLAG_HZ = 18000;

export interface UltrasonicFrame {
  bins: Float32Array; // normalised dB per scanned band column (0..1)
  peakHz: number;
  peakDb: number;
  flagged: UltrasonicPeak[];
  floorDb: number;
  sampleRate: number;
  binsPerHz: number;
  bands: { hz: number; level: number }[];
  snr: number;
}

export interface BeaconPreset {
  id: string;
  label: string;
  hz: number;
  note: string;
  source: string;
}

export const BEACON_PRESETS: BeaconPreset[] = [
  {
    id: 'smarttv',
    label: 'Smart-TV 19.2 kHz Spy Beacon',
    hz: 19200,
    note: 'Cross-device pairing tone emitted by always-on TVs to handshake with nearby phones.',
    source: 'Samsung / LG cross-device protocol',
  },
  {
    id: 'retail',
    label: 'Retail 20.1 kHz Ultrasonic Tracker',
    hz: 20100,
    note: 'In-store beacon used to correlate your phone with foot traffic analytics.',
    source: 'Retail analytics beacon',
  },
  {
    id: 'sdk',
    label: 'Ad-SDK 18.4 kHz FSK Pairing',
    hz: 18400,
    note: 'Frequency-shift-keyed pair token broadcast by embedded ad SDKs.',
    source: 'Mobile ad SDK',
  },
];

const COLUMNS = 128;

export class UltrasonicEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  /** Zero-gain sink keeps the analyser in the render graph without audible output. */
  private silentSink: GainNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private freqData: Float32Array | null = null;

  // simulation + jammer nodes
  private simOsc: OscillatorNode | null = null;
  private simLfo: OscillatorNode | null = null;
  private simGain: GainNode | null = null;
  private simHz = 0;
  private jamSource: AudioBufferSourceNode | null = null;
  private jamGain: GainNode | null = null;
  private jamFilter: BiquadFilterNode | null = null;
  private jammerActive = false;

  private raf = 0;
  private running = false;
  private peakHistory: UltrasonicPeak[] = [];
  private sampleRate = 48000;

  onFrame?: (f: UltrasonicFrame) => void;
  onStateChange?: (s: UltrasonicState) => void;

  get audioContext() {
    return this.ctx;
  }
  get isLive() {
    return !!this.analyser;
  }
  get simFrequency() {
    return this.simHz;
  }
  get isJamming() {
    return this.jammerActive;
  }

  /** Shared context; created lazily after a user gesture. */
  private ensureContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AC: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC({ sampleRate: 48000, latencyHint: 'interactive' });
      this.sampleRate = this.ctx.sampleRate;
    }
    return this.ctx;
  }

  getAnalyser(fft = FFT_SIZE): AnalyserNode {
    const ctx = this.ensureContext();
    if (!this.analyser) {
      const a = ctx.createAnalyser();
      a.fftSize = fft;
      a.smoothingTimeConstant = 0.55;
      a.minDecibels = -125;
      a.maxDecibels = -6;
      // An AnalyserNode passes its input through. Route it into a 0-gain sink so the
      // node is guaranteed to be rendered (no dead-branch pruning) without ever
      // monitoring the microphone back out to the speakers.
      this.silentSink = ctx.createGain();
      this.silentSink.gain.value = 0;
      a.connect(this.silentSink).connect(ctx.destination);
      this.analyser = a;
    }
    if (this.freqData?.length !== this.analyser.frequencyBinCount) {
      this.freqData = new Float32Array(this.analyser.frequencyBinCount);
    }
    return this.analyser;
  }

  async startMicrophone(): Promise<{ ok: boolean; error?: string }> {
    try {
      const ctx = this.ensureContext();
      if (ctx.state === 'suspended') await ctx.resume();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
        video: false,
      });
      this.stream = stream;
      const a = this.getAnalyser();
      this.sourceNode = ctx.createMediaStreamSource(stream);
      this.sourceNode.connect(a);
      this.sampleRate = ctx.sampleRate;
      this.start();
      this.emitState();
      return { ok: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'microphone unavailable';
      this.emitState();
      return { ok: false, error };
    }
  }

  stopMicrophone() {
    this.sourceNode?.disconnect();
    this.sourceNode = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (!this.simOsc) this.stop();
    this.emitState();
  }

  async resume() {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') await ctx.resume();
  }

  /** Inject a *real* oscillator into the shared analyser graph. */
  async startSimulator(hz: number) {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') await ctx.resume();
    this.stopSimulator();

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = hz;

    const g = ctx.createGain();
    g.gain.value = 0.0001;
    // FSK wobble makes it read like a real beacon, not a test tone
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 4;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 45;
    lfo.connect(lfoGain).connect(osc.frequency);
    lfo.start();
    this.simLfo = lfo;

    // route to analyser *and* to a near-silent monitoring tap
    const analyser = this.getAnalyser();
    const tap = ctx.createGain();
    tap.gain.value = 0.012; // quiet; ultrasonic anyway
    osc.connect(g);
    g.connect(analyser);
    g.connect(tap).connect(ctx.destination);
    osc.start();
    g.gain.exponentialRampToValueAtTime(0.32, ctx.currentTime + 0.25);

    this.simOsc = osc;
    this.simGain = g;
    this.simHz = hz;
    this.start();
    this.emitState();
  }

  stopSimulator() {
    if (this.simOsc) {
      try {
        this.simGain?.gain.cancelScheduledValues(this.ctx?.currentTime ?? 0);
        this.simGain?.gain.setValueAtTime(0.0001, this.ctx?.currentTime ?? 0);
        this.simOsc.stop((this.ctx?.currentTime ?? 0) + 0.05);
        this.simLfo?.stop((this.ctx?.currentTime ?? 0) + 0.05);
      } catch {
        /* already stopped */
      }
      this.simOsc.disconnect();
      this.simLfo?.disconnect();
      this.simGain?.disconnect();
    }
    this.simOsc = null;
    this.simLfo = null;
    this.simGain = null;
    this.simHz = 0;
    this.emitState();
  }

  /**
   * Active ultrasonic masking curtain.
   * Band-pass limited white noise at 18.5–21.5 kHz with a slow AM sweep —
   * scrambles ultrasonic receivers while staying effectively inaudible.
   */
  async toggleJammer(on: boolean, intensity = 0.5): Promise<boolean> {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') await ctx.resume();

    if (!on) {
      this.jammerActive = false;
      if (this.jamGain) {
        this.jamGain.gain.cancelScheduledValues(ctx.currentTime);
        this.jamGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
      }
      const src = this.jamSource;
      const gain = this.jamGain;
      setTimeout(() => {
        try {
          src?.stop();
          src?.disconnect();
          gain?.disconnect();
        } catch {
          /* noop */
        }
      }, 400);
      this.jamSource = null;
      this.emitState();
      return false;
    }

    const seconds = 3;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Band-limited noise via a 2-pole resonator at center 20 kHz keeps CPU low
    const center = 20000;
    const q = 24;
    const w0 = (2 * Math.PI * center) / ctx.sampleRate;
    const alpha = Math.sin(w0) / (2 * q);
    const b0 = alpha;
    const b2 = -alpha;
    const a0 = 1 + alpha;
    const a1 = -2 * Math.cos(w0);
    const a2 = 1 - alpha;
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < data.length; i++) {
      const x0 = Math.random() * 2 - 1;
      const y0 = (b0 * x0 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1;
      x1 = x0;
      y2 = y1;
      y1 = y0;
      data[i] = y0;
    }
    // slow AM sweep so the curtain covers 18.5–21.5 kHz
    const sweepPeriod = 2.4;
    for (let i = 0; i < data.length; i++) {
      const s = Math.sin((i / ctx.sampleRate / sweepPeriod) * Math.PI * 2);
      data[i] *= 0.55 + 0.45 * s;
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 18500;
    filter.Q.value = 0.85;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;

    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    gain.gain.setTargetAtTime(0.14 * intensity + 0.03, ctx.currentTime, 0.15);

    this.jamSource = src;
    this.jamGain = gain;
    this.jamFilter = filter;
    this.jammerActive = true;
    this.start();
    this.emitState();
    return true;
  }

  setJammerIntensity(v: number) {
    if (!this.jamGain || !this.ctx) return;
    this.jamGain.gain.setTargetAtTime(0.14 * v + 0.03, this.ctx.currentTime, 0.12);
  }

  get jammerFilterNode() {
    return this.jamFilter;
  }

  start() {
    if (!engineRuntime.animationLoop) return;
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.tick();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose() {
    this.stop();
    this.stopSimulator();
    void this.toggleJammer(false);
    this.stopMicrophone();
    try {
      this.sourceNode?.disconnect();
      this.analyser?.disconnect();
      void this.ctx?.close();
    } catch {
      /* noop */
    }
    this.ctx = null;
    this.analyser = null;
  }

  private tick() {
    if (!this.analyser || !this.freqData) return;
    this.analyser.getFloatFrequencyData(this.freqData);
    const sr = this.sampleRate;
    const binHz = sr / this.analyser.fftSize;
    const bins = this.freqData;

    const loBin = Math.floor(SCAN_LOW_HZ / binHz);
    const hiBin = Math.min(bins.length - 1, Math.ceil(SCAN_HIGH_HZ / binHz));

    // fold bins into fixed display columns, taking the max in each column
    const col = new Float32Array(COLUMNS).fill(-125);
    const bands: { hz: number; level: number }[] = [];
    const span = hiBin - loBin;
    for (let i = loBin; i <= hiBin; i++) {
      const c = Math.min(COLUMNS - 1, Math.floor(((i - loBin) / Math.max(1, span)) * COLUMNS));
      if (bins[i] > col[c]) col[c] = bins[i];
    }

    // dB → normalised 0..1
    let floorSum = 0;
    let floorCount = 0;
    const norm = new Float32Array(COLUMNS);
    for (let c = 0; c < COLUMNS; c++) {
      const db = col[c];
      const n = Math.max(0, Math.min(1, (db + 112) / 78));
      norm[c] = n;
      bands.push({ hz: SCAN_LOW_HZ + ((c + 0.5) / COLUMNS) * (SCAN_HIGH_HZ - SCAN_LOW_HZ), level: n });
      if (n < 0.35) {
        floorSum += db;
        floorCount++;
      }
    }
    const floorDb = floorCount ? floorSum / floorCount : -110;

    // narrowband peak search above the 18 kHz flag line
    let peakHz = 0;
    let peakDb = -Infinity;
    const candidates: UltrasonicPeak[] = [];
    const flagBin = Math.ceil(FLAG_HZ / binHz);
    for (let i = flagBin; i <= hiBin; i++) {
      const v = bins[i];
      if (v > peakDb) {
        peakDb = v;
        peakHz = i * binHz;
      }
      if (v > floorDb + 16 && v > -78) {
        // local maximum check to keep only narrowband spikes
        if (v >= bins[i - 1] && v >= bins[i + 1]) {
          candidates.push({ hz: Math.round(i * binHz), db: Math.round(v), flagged: true, age: 0 });
        }
      }
    }

    // merge into persistent peak history (age out after ~1.4s)
    const now = performance.now();
    for (const c of candidates) {
      const existing = this.peakHistory.find((p) => Math.abs(p.hz - c.hz) < 28);
      if (existing) {
        existing.db = existing.db * 0.6 + c.db * 0.4;
        existing.age = now;
      } else if (this.peakHistory.length < 8) {
        this.peakHistory.push({ ...c, age: now });
      }
    }
    this.peakHistory = this.peakHistory.filter((p) => now - p.age < 1400);
    this.peakHistory.sort((a, b) => b.db - a.db);

    const snr = peakDb - floorDb;

    this.onFrame?.({
      bins: norm,
      peakHz,
      peakDb,
      flagged: [...this.peakHistory],
      floorDb,
      sampleRate: sr,
      binsPerHz: binHz,
      bands,
      snr,
    });
  }

  private emitState() {
    this.onStateChange?.({
      live: !!this.analyser,
      simulator: !!this.simOsc,
      simHz: this.simHz,
      jamming: this.jammerActive,
      context: this.ctx?.state ?? 'closed',
      sampleRate: this.ctx?.sampleRate ?? 0,
    });
  }
}

export interface UltrasonicState {
  live: boolean;
  simulator: boolean;
  simHz: number;
  jamming: boolean;
  context: string;
  sampleRate: number;
}
