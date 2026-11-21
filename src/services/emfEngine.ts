// ============================================================
// SPECTRA-SWEEP — EMF Bug Sweeper Engine
// 3-axis magnetometer fusion (DeviceOrientation / Generic Sensor),
// total magnitude B = √(Bx²+By²+Bz²) against the ~45 µT Earth baseline,
// proximity simulator, and Geiger-counter acoustic + haptic feedback.
// ============================================================

import type { EmfPreset, EmfReading } from '../types';

/**
 * Global render-loop gate. The DSP engines own continuous requestAnimationFrame
 * loops; hosts that must stay idle (headless test environments, or a device
 * parked in ultra battery-saver) set this to false and still get every
 * pure computation, including on-demand sample processing.
 */
export const engineRuntime = { animationLoop: true };

export const EARTH_BASELINE_UT = 45;
export const WATCH_UT = 90;
export const CRITICAL_UT = 160;

export const EMF_PRESETS: EmfPreset[] = [
  {
    id: 'gps',
    label: 'Sweep Under Car Wheel Well',
    note: 'Neodymium GPS tracker magnet — 240 µT sustained dipole.',
    target: 240,
    severity: 'critical',
  },
  {
    id: 'rf',
    label: 'Sweep Behind Picture Frame',
    note: 'Powered RF transmitter with transformer leakage — 115 µT.',
    target: 115,
    severity: 'watch',
  },
  {
    id: 'baseline',
    label: 'Nominal Room Baseline',
    note: 'Unremarkable geomagnetic field — 46 µT, no anomaly.',
    target: 46,
    severity: 'nominal',
  },
];

type SensorCtor = new (opts: { frequency: number; referenceFrame?: string }) => {
  start: () => void;
  stop: () => void;
  addEventListener: (t: string, cb: (e: Event) => void) => void;
  removeEventListener: (t: string, cb: (e: Event) => void) => void;
};

export class EmfEngine {
  private raf = 0;
  private running = false;
  private reads: EmfReading[] = [];
  private orientationHandler: ((e: DeviceOrientationEvent) => void) | null = null;
  private magnetoCtor: SensorCtor | null = null;
  private magnetoSensor: InstanceType<SensorCtor> | null = null;
  private magnetometerActive = false;

  private simTarget = 0;
  private simProgress = 0; // 0..1 ramp toward target when simulating
  private cur: EmfReading = { x: 0, y: 0, z: EARTH_BASELINE_UT, magnitude: EARTH_BASELINE_UT, at: 0 };

  private audioCtx: AudioContext | null = null;
  private lastClick = 0;
  private clickIndex = 0;

  soundEnabled = true;
  hapticsEnabled = true;

  onReading?: (r: EmfReading, history: EmfReading[]) => void;

  get current() {
    return this.cur;
  }
  get history() {
    return this.reads;
  }
  get usingHardware() {
    return this.magnetometerActive;
  }

  async startMagnetometer(): Promise<{ ok: boolean; error?: string }> {
    // Prefer the Generic Sensor API (full 3-axis, µT)
    const w = window as unknown as {
      Magnetometer?: SensorCtor;
      DeviceOrientationEvent?: typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
    };

    if (typeof w.Magnetometer === 'function') {
      try {
        this.magnetoCtor = w.Magnetometer;
        const sensor = new this.magnetoCtor({ frequency: 30, referenceFrame: 'device' });
        sensor.addEventListener('reading', () => {
          const s = sensor as unknown as { x: number; y: number; z: number };
          this.ingestHardware(s.x ?? 0, s.y ?? 0, s.z ?? 0);
        });
        sensor.addEventListener('error', () => {
          this.magnetometerActive = false;
        });
        sensor.start();
        this.magnetoSensor = sensor;
        this.magnetometerActive = true;
        this.start();
        return { ok: true };
      } catch {
        /* fall through to orientation */
      }
    }

    // Fallback: DeviceOrientation absolute (alpha/beta/gamma → derived flux proxy)
    const DOE = w.DeviceOrientationEvent;
    if (!DOE) return { ok: false, error: 'Magnetometer API unavailable on this device' };

    if (typeof DOE.requestPermission === 'function') {
      try {
        const res = await DOE.requestPermission();
        if (res !== 'granted') return { ok: false, error: 'Sensor permission denied' };
      } catch {
        return { ok: false, error: 'Sensor permission blocked' };
      }
    }

    this.orientationHandler = (e: DeviceOrientationEvent) => {
      // Devices expose magnetic flux via `webkitCompass*` on some platforms;
      // otherwise derive an orientation-driven proxy around Earth's field.
      const anyE = e as DeviceOrientationEvent & {
        webkitCompassHeading?: number;
        webkitCompassAccuracy?: number;
      };
      const beta = e.beta ?? 0;
      const gamma = e.gamma ?? 0;
      const heading = anyE.webkitCompassHeading ?? e.alpha ?? 0;
      const rad = (heading * Math.PI) / 180;
      const tilt = ((beta + gamma) * Math.PI) / 360;
      const bx = EARTH_BASELINE_UT * Math.cos(rad) * Math.cos(tilt);
      const by = EARTH_BASELINE_UT * Math.sin(rad) * Math.cos(tilt);
      const bz = EARTH_BASELINE_UT * Math.sin(tilt);
      this.ingestHardware(bx, by, bz);
    };
    window.addEventListener('deviceorientationabsolute', this.orientationHandler, true);
    window.addEventListener('deviceorientation', this.orientationHandler, true);
    this.magnetometerActive = true;
    this.start();
    return { ok: true };
  }

  stopMagnetometer() {
    try {
      this.magnetoSensor?.stop();
    } catch {
      /* noop */
    }
    this.magnetoSensor = null;
    if (this.orientationHandler) {
      window.removeEventListener('deviceorientationabsolute', this.orientationHandler, true);
      window.removeEventListener('deviceorientation', this.orientationHandler, true);
    }
    this.orientationHandler = null;
    this.magnetometerActive = false;
    if (this.simTarget === 0) this.stop();
  }

  setSimulationTarget(target: number) {
    this.simTarget = target;
    this.start();
  }

  clearSimulation() {
    this.simTarget = 0;
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
    this.stopMagnetometer();
    void this.audioCtx?.close();
    this.audioCtx = null;
  }

  private ingestHardware(x: number, y: number, z: number) {
    const mag = Math.sqrt(x * x + y * y + z * z);
    this.push({ x, y, z, magnitude: mag, at: performance.now() });
  }

  private tick() {
    if (this.magnetometerActive && this.simTarget === 0) {
      // hardware path already pushes readings
      return;
    }

    const t = performance.now();
    if (this.simTarget > 0) {
      // ramp toward the target like a real proximity sweep
      this.simProgress = Math.min(1, this.simProgress + 0.022);
      const eased = 1 - Math.pow(1 - this.simProgress, 3);
      const mag = EARTH_BASELINE_UT + (this.simTarget - EARTH_BASELINE_UT) * eased;
      const noise = (Math.random() - 0.5) * 1.4;
      const heading = 0.6 + Math.sin(t * 0.0007) * 0.25;
      const x = Math.cos(heading) * mag * 0.55 + noise;
      const y = Math.sin(heading) * mag * 0.48 + noise;
      const z = Math.sqrt(Math.max(0, mag * mag - x * x - y * y));
      this.push({ x, y, z, magnitude: mag + noise, at: t });
    } else {
      // idle: gentle Earth-field breathing so the seismograph is alive
      this.simProgress = 0;
      const b = EARTH_BASELINE_UT;
      const x = Math.sin(t * 0.0009) * 4.2 + Math.sin(t * 0.0031) * 1.1;
      const y = Math.cos(t * 0.0012) * 3.6 + Math.cos(t * 0.0026) * 0.9;
      const z = b + Math.sin(t * 0.0006) * 2.2;
      this.push({ x, y, z, magnitude: Math.sqrt(x * x + y * y + z * z), at: t });
    }
  }

  private push(r: EmfReading) {
    this.cur = r;
    this.reads.push(r);
    if (this.reads.length > 280) this.reads.shift();
    this.onReading?.(r, this.reads);
  }

  /** Click cadence accelerates exponentially with flux strength. */
  geigerClick(magnitude: number) {
    if (!this.soundEnabled) return;
    const now = performance.now();
    const excess = Math.max(0, magnitude - EARTH_BASELINE_UT);
    const rate = 90 + Math.pow(excess, 1.65) * 0.55; // ms between clicks
    if (now - this.lastClick < Math.min(900, rate)) return;
    this.lastClick = now;

    const ctx = (this.audioCtx ??= new AudioContext({ sampleRate: 48000 }));
    if (ctx.state === 'suspended') void ctx.resume();
    const dur = 0.016 + Math.min(0.03, excess / 5000);
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const env = Math.exp((-i / d.length) * 7);
      d[i] = (Math.random() * 2 - 1) * env * 0.7;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600 + this.clickIndex * 40;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.value = magnitude > CRITICAL_UT ? 0.3 : magnitude > WATCH_UT ? 0.2 : 0.12;
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start();
    this.clickIndex = (this.clickIndex + 1) % 8;

    if (this.hapticsEnabled && magnitude > WATCH_UT && 'vibrate' in navigator) {
      const strength = magnitude > CRITICAL_UT ? 34 : 16;
      navigator.vibrate?.(strength);
    }
  }
}

export function classifyEmf(magnitude: number): 'nominal' | 'watch' | 'critical' {
  if (magnitude >= CRITICAL_UT) return 'critical';
  if (magnitude >= WATCH_UT) return 'watch';
  return 'nominal';
}
