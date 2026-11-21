import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AudioLines,
  Ban,
  BellRing,
  CircleAlert,
  Gauge,
  Headphones,
  Lock,
  Mic,
  MicOff,
  Pause,
  Play,
  Radio,
  ShieldOff,
  Signal,
  Volume2,
  Waves,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SpectrumTrace, Waterfall } from '../components/Waterfall';
import { Glass, GlassInset, SectionLabel, SPRING, Stat } from '../components/ui/Glass';
import {
  BEACON_PRESETS,
  FLAG_HZ,
  UltrasonicEngine,
  type UltrasonicFrame,
  type UltrasonicState,
} from '../services/ultrasonicEngine';
import { useApp } from '../state/store';

export function UltrasonicShield() {
  const { dispatch, toast, logEvent, can } = useApp();
  const engineRef = useRef<UltrasonicEngine | null>(null);
  const [frame, setFrame] = useState<UltrasonicFrame | null>(null);
  const [engineState, setEngineState] = useState<UltrasonicState>({
    live: false,
    simulator: false,
    simHz: 0,
    jamming: false,
    context: 'closed',
    sampleRate: 0,
  });
  const [jamming, setJamming] = useState(false);
  const [intensity, setIntensity] = useState(0.55);
  const [micError, setMicError] = useState<string | null>(null);
  const [simPreset, setSimPreset] = useState<string | null>(null);

  const isPro = can('auditor');
  const lastLog = useRef(0);

  useEffect(() => {
    const engine = new UltrasonicEngine();
    engine.onFrame = (f) => setFrame(f);
    engine.onStateChange = (s) => setEngineState(s);
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // threat telemetry
  useEffect(() => {
    if (!frame) return;
    const flagged = frame.flagged.filter((f) => f.hz >= FLAG_HZ);
    const level = flagged.length
      ? Math.min(100, 40 + Math.max(...flagged.map((f) => (f.db + 100) * 1.4)))
      : Math.max(0, Math.min(24, (frame.snr - 8) * 2));
    dispatch({ type: 'telemetry', key: 'ultrasonicThreat', value: level });

    if (flagged.length && Date.now() - lastLog.current > 8000) {
      lastLog.current = Date.now();
      const top = flagged[0];
      logEvent({
        kind: 'ultrasonic',
        title: 'Ultrasonic spy beacon intercepted',
        detail: `Narrowband carrier at ${(top.hz / 1000).toFixed(2)} kHz, ${top.db} dBFS, ${Math.round(frame.snr)} dB above noise floor. Consistent with cross-device tracking infrastructure.`,
        severity: level > 68 ? 'critical' : 'high',
        metric: `${(top.hz / 1000).toFixed(2)} kHz · SNR ${Math.round(frame.snr)} dB`,
        source: engineState.simulator ? 'simulator' : 'sensor',
      });
    }
  }, [frame, dispatch, logEvent, engineState.simulator]);

  const toggleMic = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engineState.live) {
      engine.stopMicrophone();
      dispatch({ type: 'sensor', id: 'microphone', patch: { status: 'off' } });
      return;
    }
    const res = await engine.startMicrophone();
    if (res.ok) {
      dispatch({ type: 'sensor', id: 'microphone', patch: { status: 'active' } });
      toast({
        title: '48 kHz DSP microphone online',
        detail: 'AEC / NS / AGC disabled — ultrasonic band preserved',
        tone: 'ok',
      });
    } else {
      setMicError(res.error ?? 'unavailable');
      dispatch({ type: 'sensor', id: 'microphone', patch: { status: 'denied' } });
      toast({ title: 'Microphone restricted', detail: 'Beacon simulator still injects real oscillators.', tone: 'warn' });
    }
  }, [engineState.live, dispatch, toast]);

  const simulate = useCallback(
    async (id: string) => {
      const engine = engineRef.current;
      if (!engine) return;
      if (simPreset === id) {
        engine.stopSimulator();
        setSimPreset(null);
        dispatch({ type: 'sensor', id: 'microphone', patch: { status: engineState.live ? 'active' : 'off' } });
        toast({ title: 'Beacon simulator stopped', tone: 'info' });
        return;
      }
      const preset = BEACON_PRESETS.find((p) => p.id === id);
      if (!preset) return;
      await engine.startSimulator(preset.hz);
      setSimPreset(id);
      dispatch({ type: 'sensor', id: 'microphone', patch: { status: 'simulator' } });
      toast({
        title: preset.label,
        detail: `${preset.note}`,
        tone: 'danger',
      });
    },
    [simPreset, dispatch, toast, engineState.live],
  );

  const toggleJammer = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!isPro) {
      toast({ title: 'Security Auditor required', detail: 'Active jammer unlocks at Pro tier.', tone: 'warn' });
      dispatch({ type: 'modal', modal: { type: 'privileges' } });
      return;
    }
    const on = await engine.toggleJammer(!jamming, intensity);
    setJamming(on);
    toast({
      title: on ? 'Acoustic curtain engaged' : 'Jammer disengaged',
      detail: on
        ? '18.5–21.5 kHz band-limited noise is now masking ultrasonic receivers'
        : 'Ultrasonic band returned to passive monitoring',
      tone: on ? 'ok' : 'info',
    });
    if (on) {
      logEvent({
        kind: 'ultrasonic',
        title: 'Active acoustic jammer engaged',
        detail:
          'High-pass BiquadFilter at 18.5 kHz with a modulated 20 kHz noise curtain is neutralizing nearby ultrasonic microphones.',
        severity: 'low',
        metric: '18.5–21.5 kHz curtain',
        source: 'sensor',
      });
    }
  }, [isPro, jamming, intensity, toast, dispatch, logEvent]);

  useEffect(() => {
    engineRef.current?.setJammerIntensity(intensity);
  }, [intensity]);

  // band power summary
  const flaggedBand = frame?.flagged.filter((f) => f.hz >= FLAG_HZ) ?? [];
  const peakKhz = frame ? frame.peakHz / 1000 : 0;
  const bandLevel = frame ? Math.round(frame.flagged.reduce((a, f) => Math.max(a, f.db), -120)) : -120;
  const active = engineState.live || engineState.simulator;

  return (
    <div className="space-y-3">
      {/* control bar */}
      <Glass className="!p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg border border-white/15 bg-cyan-400/10">
              <Waves size={13} className="text-cyan-300" />
            </span>
            <div>
              <div className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink">Ultrasonic Shield</div>
              <div className="text-[9.5px] text-faint">15.0 – 22.5 kHz beacon interceptor · active jammer</div>
            </div>
          </div>
          <div className="flex-1" />
          <span className={`chip ${engineState.live ? 'chip-live' : engineState.simulator ? 'chip-danger' : 'chip-warn'}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {engineState.live ? '48kHz LIVE' : engineState.simulator ? 'SIM INJECT' : 'IDLE'}
          </span>
          <span className="chip">
            <Gauge size={9} /> {engineState.sampleRate ? (engineState.sampleRate / 1000).toFixed(1) : '48.0'} kHz
          </span>
          <button onClick={toggleMic} className={`btn !py-1.5 text-[11px] ${engineState.live ? 'btn-danger' : 'btn-accent'}`}>
            {engineState.live ? <MicOff size={13} /> : <Mic size={13} />}
            {engineState.live ? 'Stop Mic' : 'Arm Microphone'}
          </button>
        </div>
      </Glass>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
        {/* waterfall */}
        <Glass className="!p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <SectionLabel right={
              <div className="flex items-center gap-2">
                <span className="chip chip-live">
                  <Activity size={9} /> WATERFALL
                </span>
                <span className="chip">Δ{frame ? Math.round(frame.snr) : 0} dB</span>
              </div>
            }>
              High-Frequency Waterfall Spectrogram
            </SectionLabel>
          </div>

          <div className="relative overflow-hidden rounded-xl border border-white/10">
            <Waterfall bins={frame?.bins ?? null} flagged={frame?.flagged ?? []} peakHz={frame?.peakHz ?? 0} active={active} height={210} />
            {/* frequency ruler */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/75 to-transparent px-2 pb-1 pt-4 font-mono text-[8.5px] text-white/45">
              {['15.0', '16.5', '18.0', '19.5', '21.0', '22.5'].map((hz) => (
                <span key={hz}>{hz}k</span>
              ))}
            </div>
            <div
              className="pointer-events-none absolute inset-y-0 border-l border-dashed border-rose-500/60"
              style={{ left: `${((FLAG_HZ - 15000) / 7500) * 100}%` }}
            >
              <span className="absolute -top-0 left-1 whitespace-nowrap rounded bg-rose-500/25 px-1 font-mono text-[8px] text-rose-200">
                18.0k FLAG
              </span>
            </div>
            {!active && (
              <div className="absolute inset-0 grid place-items-center bg-black/45 backdrop-blur-[1px]">
                <div className="text-center">
                  <AudioLines size={22} className="mx-auto mb-1 text-white/40" />
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/55">Array dormant</p>
                  <p className="mt-0.5 text-[9.5px] text-white/35">Arm the mic or inject a beacon</p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-2 overflow-hidden rounded-xl border border-white/[0.08] bg-black/25 p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="label-xs">Instantaneous Spectrum</span>
              <span className="mono-num text-[9px] text-faint">
                PEAK {(peakKhz || 0).toFixed(2)} kHz · BIN {(frame?.binsPerHz ?? 0).toFixed(2)} Hz
              </span>
            </div>
            <SpectrumTrace bins={frame?.bins ?? null} flagged={flaggedBand} active={active} height={104} />
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Peak Carrier" value={peakKhz.toFixed(2)} unit="kHz" tone={peakKhz >= 18 ? 'danger' : 'ok'} />
            <Stat label="Peak Level" value={Math.round(bandLevel)} unit="dBFS" tone={bandLevel > -60 ? 'warn' : 'default'} />
            <Stat label="Signal / Noise" value={Math.round(frame?.snr ?? 0)} unit="dB" tone={(frame?.snr ?? 0) > 16 ? 'warn' : 'ok'} />
            <Stat label="Flagged Bands" value={flaggedBand.length} tone={flaggedBand.length ? 'danger' : 'ok'} />
          </div>
        </Glass>

        {/* right rail: detection + sim + jammer */}
        <div className="space-y-3">
          <Glass tone={flaggedBand.length ? 'danger' : 'default'}>
            <SectionLabel right={<Radio size={12} className="text-faint" />}>Beacon Lock-On</SectionLabel>
            <GlassInset className="!p-2">
              <div className="max-h-[130px] space-y-1 overflow-y-auto scrollbar-none">
                <AnimatePresence initial={false}>
                  {flaggedBand.length === 0 && (
                    <p className="py-3 text-center font-mono text-[10px] text-faint">
                      no narrowband carrier above 18 kHz
                    </p>
                  )}
                  {flaggedBand.map((f) => (
                    <motion.div
                      key={`${Math.round(f.hz)}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-2 py-1.5"
                    >
                      <motion.span
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400"
                        animate={{ opacity: [1, 0.3, 1], scale: [1, 1.4, 1] }}
                        transition={{ duration: 1.1, repeat: Infinity }}
                      />
                      <span className="mono-num text-[11px] font-semibold text-rose-200">
                        {(f.hz / 1000).toFixed(2)} kHz
                      </span>
                      <span className="ml-auto font-mono text-[9px] text-rose-300/70">{Math.round(f.db)} dB</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </GlassInset>

            <div className="mt-2.5">
              <div className="label-xs mb-1.5">1-Tap Synthetic Beacon</div>
              <div className="space-y-1.5">
                {BEACON_PRESETS.map((p) => {
                  const on = simPreset === p.id;
                  return (
                    <motion.button
                      key={p.id}
                      onClick={() => void simulate(p.id)}
                      whileTap={{ scale: 0.97 }}
                      transition={SPRING}
                      className={`flex w-full items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition-colors ${
                        on
                          ? 'border-rose-400/55 bg-rose-500/15'
                          : 'border-white/[0.08] bg-white/[0.025] hover:border-white/20'
                      }`}
                    >
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-white/12 bg-white/5">
                        {on ? <Pause size={10} className="text-rose-300" /> : <Play size={10} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-semibold text-ink">{p.label}</span>
                        <span className="block truncate text-[9px] text-faint">{p.source}</span>
                      </span>
                      <span className="mono-num shrink-0 text-[9px] text-cyan-300">{(p.hz / 1000).toFixed(1)}k</span>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </Glass>

          <Glass tone={jamming ? 'ok' : 'default'}>
            <SectionLabel right={isPro ? <ShieldOff size={12} className="text-faint" /> : <Lock size={12} className="text-amber-400" />}>
              Active Jammer
            </SectionLabel>

            <div className="flex items-center gap-3">
              <button
                onClick={() => void toggleJammer()}
                className={`relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl border transition-colors ${
                  jamming
                    ? 'border-emerald-400/60 bg-emerald-400/20'
                    : 'border-white/15 bg-white/5 hover:border-white/30'
                }`}
                aria-pressed={jamming}
                aria-label="Toggle ultrasonic jammer"
              >
                {jamming && (
                  <>
                    <motion.span
                      className="absolute inset-0 rounded-2xl border border-emerald-400/40"
                      animate={{ scale: [1, 1.35], opacity: [0.7, 0] }}
                      transition={{ duration: 1.8, repeat: Infinity }}
                    />
                    <motion.span
                      className="absolute inset-0 rounded-2xl border border-cyan-400/30"
                      animate={{ scale: [1, 1.65], opacity: [0.5, 0] }}
                      transition={{ duration: 2.4, repeat: Infinity, delay: 0.4 }}
                    />
                  </>
                )}
                {jamming ? <Volume2 size={22} className="accent-text" /> : <Ban size={22} className="text-faint" />}
              </button>
              <div className="min-w-0">
                <div className="text-[12px] font-bold text-ink">
                  {jamming ? 'CURTAIN ACTIVE' : 'CURTAIN IDLE'}
                </div>
                <p className="mt-0.5 text-[10px] leading-snug text-dim">
                  18.5–21.5 kHz band-limited noise scrambles ultrasonic receivers while staying
                  effectively inaudible to human hearing.
                </p>
                <span className="mt-1 inline-flex items-center gap-1 chip">
                  <Zap size={8} /> {isPro ? 'PRO UNLOCKED' : 'AUDITOR TIER'}
                </span>
              </div>
            </div>

            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="label-xs">Curtain Intensity</span>
                <span className="mono-num text-[10px] text-dim">{Math.round(intensity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.01}
                value={intensity}
                onChange={(e) => setIntensity(Number(e.target.value))}
                aria-label="Jammer intensity"
              />
            </div>
            <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1.5">
              <CircleAlert size={10} className="mt-0.5 shrink-0 text-amber-400" />
              <p className="text-[9px] leading-snug text-faint">
                Jamming is legal for personal privacy defence in most jurisdictions but not everywhere.
                Never direct it at shared public spaces.
              </p>
            </div>
          </Glass>
        </div>
      </div>

      {/* reference band table */}
      <Glass className="!p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SectionLabel>Known Beacon Fingerprints</SectionLabel>
          <div className="grid flex-1 grid-cols-2 gap-1.5 lg:grid-cols-4">
            {[
              { hz: '18.4 kHz', who: 'Ad SDK pairing', tone: 'warn' as const },
              { hz: '19.2 kHz', who: 'Smart-TV handshake', tone: 'danger' as const },
              { hz: '20.1 kHz', who: 'Retail tracking', tone: 'danger' as const },
              { hz: '21.6 kHz', who: 'App proximity beacon', tone: 'warn' as const },
            ].map((b) => (
              <div key={b.hz} className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-2 py-1.5">
                <div className="flex items-center gap-1.5">
                  <Headphones size={10} className={b.tone === 'danger' ? 'text-rose-400' : 'text-amber-400'} />
                  <span className="mono-num text-[10.5px] font-semibold text-ink">{b.hz}</span>
                </div>
                <div className="mt-0.5 truncate text-[9px] text-faint">{b.who}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Signal size={11} className="accent-text" />
            <span className="font-mono text-[9px] text-faint">AEC/NS/AGC OFF</span>
          </div>
        </div>
        {micError && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5">
            <BellRing size={11} className="mt-0.5 shrink-0 text-amber-400" />
            <p className="text-[10px] leading-snug text-amber-200/90">
              Microphone unavailable ({micError.slice(0, 48)}). Use the synthetic beacons — they inject a real
              oscillator into the same analyser graph the hardware path uses.
            </p>
          </div>
        )}
      </Glass>
    </div>
  );
}
