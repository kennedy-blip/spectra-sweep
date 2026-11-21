import { motion } from 'framer-motion';
import {
  Activity,
  BatteryCharging,
  Car,
  Crosshair,
  Gauge as GaugeIcon,
  Magnet,
  Radar,
  RotateCcw,
  ShieldAlert,
  Signal,
  Smartphone,
  Sparkles,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Glass, GlassInset, SectionLabel, SPRING } from '../components/ui/Glass';
import {
  CRITICAL_UT,
  EARTH_BASELINE_UT,
  EMF_PRESETS,
  EmfEngine,
  WATCH_UT,
  classifyEmf,
} from '../services/emfEngine';
import { useApp } from '../state/store';
import type { EmfReading } from '../types';

const AXES = [
  { key: 'x' as const, label: 'Bx', color: '#f59e0b' },
  { key: 'y' as const, label: 'By', color: '#06b6d4' },
  { key: 'z' as const, label: 'Bz', color: '#10b981' },
];

export function EmfBugSweeper() {
  const { dispatch, toast, logEvent } = useApp();
  const engineRef = useRef<EmfEngine | null>(null);
  const [reading, setReading] = useState<EmfReading>({
    x: 0,
    y: 0,
    z: EARTH_BASELINE_UT,
    magnitude: EARTH_BASELINE_UT,
    at: 0,
  });
  const [history, setHistory] = useState<EmfReading[]>([]);
  const [preset, setPreset] = useState<string>('baseline');
  const [hardware, setHardware] = useState(false);
  const [sound, setSound] = useState(true);
  const [proximity, setProximity] = useState(0);
  const lastLog = useRef(0);
  const lastClickMag = useRef(0);

  useEffect(() => {
    const engine = new EmfEngine();
    engine.onReading = (r, hist) => {
      setReading(r);
      setHistory([...hist]);
      engine.geigerClick(r.magnitude);
    };
    engineRef.current = engine;
    engine.start();
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (engineRef.current) engineRef.current.soundEnabled = sound;
  }, [sound]);

  // telemetry + event logging
  useEffect(() => {
    const cls = classifyEmf(reading.magnitude);
    const value =
      cls === 'critical'
        ? Math.min(100, 62 + ((reading.magnitude - CRITICAL_UT) / 200) * 38)
        : cls === 'watch'
          ? 22 + ((reading.magnitude - WATCH_UT) / (CRITICAL_UT - WATCH_UT)) * 38
          : Math.max(0, ((reading.magnitude - EARTH_BASELINE_UT) / WATCH_UT) * 20);
    dispatch({ type: 'telemetry', key: 'emfThreat', value });

    engineRef.current?.geigerClick(reading.magnitude);

    if (cls !== 'nominal' && Date.now() - lastLog.current > 9000) {
      lastLog.current = Date.now();
      lastClickMag.current = reading.magnitude;
      logEvent({
        kind: 'emf',
        title: cls === 'critical' ? 'Ferromagnetic anomaly (tracker-class)' : 'Magnetic flux excursion',
        detail: `Total field ${reading.magnitude.toFixed(1)} µT against a 45.0 µT baseline — ${(reading.magnitude / EARTH_BASELINE_UT).toFixed(1)}× Earth normal. Vector: Bx ${reading.x.toFixed(1)}, By ${reading.y.toFixed(1)}, Bz ${reading.z.toFixed(1)} µT.`,
        severity: cls === 'critical' ? 'critical' : 'medium',
        metric: `${reading.magnitude.toFixed(0)} µT`,
        location: EMF_PRESETS.find((p) => p.id === preset)?.label ?? 'Manual sweep',
        source: hardware ? 'sensor' : 'simulator',
      });
    }
  }, [reading, dispatch, logEvent, preset, hardware]);

  const armHardware = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (hardware) {
      engine.stopMagnetometer();
      setHardware(false);
      dispatch({ type: 'sensor', id: 'magnetometer', patch: { status: 'off' } });
      return;
    }
    const res = await engine.startMagnetometer();
    if (res.ok) {
      setHardware(true);
      dispatch({ type: 'sensor', id: 'magnetometer', patch: { status: 'active' } });
      toast({ title: 'Magnetometer armed', detail: 'Live 3-axis flux in µT', tone: 'ok' });
    } else {
      dispatch({ type: 'sensor', id: 'magnetometer', patch: { status: 'restricted' } });
      toast({ title: 'Magnetometer restricted', detail: res.error ?? 'Use the proximity simulator.', tone: 'warn' });
    }
  }, [hardware, dispatch, toast]);

  const applyPreset = useCallback(
    (id: string) => {
      const engine = engineRef.current;
      if (!engine) return;
      setPreset(id);
      const p = EMF_PRESETS.find((x) => x.id === id);
      if (!p) return;
      engine.setSimulationTarget(p.target);
      dispatch({ type: 'sensor', id: 'magnetometer', patch: { status: 'simulator' } });
      toast({
        title: p.label,
        detail: `${p.note} → target ${p.target} µT`,
        tone: p.severity === 'critical' ? 'danger' : p.severity === 'watch' ? 'warn' : 'ok',
      });
    },
    [dispatch, toast],
  );

  const onProximity = useCallback(
    (v: number) => {
      setProximity(v);
      const target = EARTH_BASELINE_UT + v * 235;
      engineRef.current?.setSimulationTarget(target);
      setPreset('manual');
      dispatch({ type: 'sensor', id: 'magnetometer', patch: { status: 'simulator' } });
    },
    [dispatch],
  );

  const magnitude = reading.magnitude;
  const cls = classifyEmf(magnitude);
  const tone = cls === 'critical' ? 'danger' : cls === 'watch' ? 'warn' : 'ok';
  const ratio = magnitude / EARTH_BASELINE_UT;

  return (
    <div className="space-y-3">
      {/* control bar */}
      <Glass className="!p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg border border-white/15 bg-amber-400/10">
              <Magnet size={13} className="text-amber-300" />
            </span>
            <div>
              <div className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink">EMF Bug Sweeper</div>
              <div className="text-[9.5px] text-faint">3-axis µT flux · Geiger radar · tracker detection</div>
            </div>
          </div>
          <div className="flex-1" />
          <span className={`chip ${hardware ? 'chip-live' : 'chip-warn'}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {hardware ? 'HARDWARE' : 'SIMULATOR'}
          </span>
          <button onClick={() => setSound((s) => !s)} className="btn !px-2 !py-1.5" aria-label="Toggle Geiger audio">
            {sound ? <Volume2 size={13} /> : <VolumeX size={13} />}
          </button>
          <button onClick={() => void armHardware()} className={`btn !py-1.5 text-[11px] ${hardware ? 'btn-danger' : 'btn-accent'}`}>
            <Smartphone size={13} /> {hardware ? 'Disarm Sensor' : 'Arm Magnetometer'}
          </button>
        </div>
      </Glass>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(310px,1fr)]">
        <div className="space-y-3">
          {/* magnitude gauge + radar */}
          <Glass className="!p-3" tone={tone}>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px]">
              <div>
                <SectionLabel right={<Activity size={12} className="text-faint" />}>
                  Total Flux Magnitude · B = √(Bx²+By²+Bz²)
                </SectionLabel>
                <div className="flex items-end gap-3">
                  <motion.div
                    className="mono-num text-[44px] font-bold leading-none sm:text-[54px]"
                    style={{
                      color: cls === 'critical' ? 'var(--danger)' : cls === 'watch' ? 'var(--warn)' : 'rgb(var(--ink))',
                      textShadow: `0 0 34px ${cls === 'critical' ? 'rgba(239,68,68,0.5)' : 'rgba(16,185,129,0.3)'}`,
                    }}
                  >
                    {magnitude.toFixed(1)}
                  </motion.div>
                  <div className="pb-1.5">
                    <div className="font-mono text-[13px] text-dim">µT</div>
                    <div className="font-mono text-[9px] text-faint">{ratio.toFixed(2)}× Earth</div>
                  </div>
                  <div className="ml-auto pb-1.5 text-right">
                    <span className={`chip ${cls === 'critical' ? 'chip-danger' : cls === 'watch' ? 'chip-warn' : 'chip-live'}`}>
                      {cls === 'critical' ? 'TRACKER CLASS' : cls === 'watch' ? 'ANOMALY' : 'NOMINAL'}
                    </span>
                    <div className="mt-1 font-mono text-[8.5px] text-faint">
                      baseline {EARTH_BASELINE_UT} µT · watch {WATCH_UT} · crit {CRITICAL_UT}
                    </div>
                  </div>
                </div>

                {/* magnitude bar with thresholds */}
                <div className="relative mt-3 h-3 overflow-hidden rounded-full border border-white/10 bg-black/40">
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full"
                    animate={{ width: `${Math.min(100, (magnitude / 320) * 100)}%` }}
                    transition={SPRING}
                    style={{
                      background:
                        cls === 'critical'
                          ? 'linear-gradient(90deg,#f59e0b,#ef4444,#ff2d55)'
                          : cls === 'watch'
                            ? 'linear-gradient(90deg,#10b981,#f59e0b)'
                            : 'linear-gradient(90deg,#06b6d4,#10b981)',
                      boxShadow: '0 0 18px rgba(239,68,68,0.45)',
                    }}
                  />
                  <div className="absolute inset-y-0 border-l border-white/25" style={{ left: `${(WATCH_UT / 320) * 100}%` }} />
                  <div className="absolute inset-y-0 border-l border-rose-400/60" style={{ left: `${(CRITICAL_UT / 320) * 100}%` }} />
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {AXES.map((a) => (
                    <div key={a.key} className="rounded-lg border border-white/[0.08] bg-black/25 px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: a.color }} />
                        <span className="font-mono text-[9px] text-faint">{a.label}</span>
                      </div>
                      <div className="mono-num mt-0.5 text-[13px] font-semibold" style={{ color: a.color }}>
                        {reading[a.key].toFixed(1)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* radar */}
              <div className="relative mx-auto grid aspect-square w-full max-w-[190px] place-items-center">
                <div
                  className="absolute inset-0 rounded-full border border-white/10"
                  style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.08), transparent 68%)' }}
                />
                {[0.32, 0.58, 0.84].map((r) => (
                  <div
                    key={r}
                    className="absolute rounded-full border border-white/[0.08]"
                    style={{ width: `${r * 100}%`, height: `${r * 100}%` }}
                  />
                ))}
                <div className="absolute inset-x-0 top-1/2 h-px bg-white/[0.07]" />
                <div className="absolute inset-y-0 left-1/2 w-px bg-white/[0.07]" />

                <div className="radar-sweep absolute inset-0 rounded-full" style={{
                  background:
                    'conic-gradient(from 0deg, rgba(16,185,129,0) 0deg, rgba(16,185,129,0.32) 42deg, rgba(16,185,129,0) 76deg)',
                }} />

                {/* blips scale with distance from baseline */}
                {[
                  { a: 0.7, d: 0.55, s: 1 },
                  { a: 2.4, d: 0.34, s: 0.7 },
                  { a: 4.1, d: 0.72, s: 0.85 },
                  { a: 5.5, d: 0.24, s: 0.55 },
                ].map((b, i) => {
                  const intensity = Math.min(1, (magnitude - EARTH_BASELINE_UT) / 160);
                  const x = 50 + Math.cos(b.a) * b.d * 46;
                  const y = 50 + Math.sin(b.a) * b.d * 46;
                  return (
                    <motion.span
                      key={i}
                      className="absolute rounded-full"
                      style={{
                        left: `${x}%`,
                        top: `${y}%`,
                        width: 5 * b.s,
                        height: 5 * b.s,
                        background: cls === 'critical' ? '#ef4444' : '#10b981',
                        boxShadow: `0 0 8px ${cls === 'critical' ? '#ef4444' : '#10b981'}`,
                      }}
                      animate={{ opacity: [0.2, 0.25 + intensity * 0.75, 0.2] }}
                      transition={{ duration: 2.4 + i * 0.4, repeat: Infinity, delay: i * 0.3 }}
                    />
                  );
                })}
                <div className="relative z-10 text-center">
                  <Radar size={16} className="mx-auto text-emerald-300/70" />
                  <div className="mono-num mt-0.5 text-[9px] text-faint">
                    {(reading.at / 1000).toFixed(1)}s
                  </div>
                </div>
              </div>
            </div>
          </Glass>

          {/* seismograph */}
          <Glass className="!p-3">
            <SectionLabel right={<Signal size={12} className="text-faint" />}>
              3-Axis Magnetic Flux Seismograph
            </SectionLabel>
            <Seismograph history={history} />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {AXES.map((a) => (
                <div key={a.key} className="flex items-center gap-1.5">
                  <span className="h-1.5 w-4 rounded-full" style={{ background: a.color }} />
                  <span className="font-mono text-[9px] text-faint">{a.label}</span>
                </div>
              ))}
              <div className="ml-auto font-mono text-[9px] text-faint">
                {history.length} samples @ 60 Hz · window 4.6 s
              </div>
            </div>
          </Glass>
        </div>

        {/* right rail */}
        <div className="space-y-3">
          <Glass>
            <SectionLabel right={<Car size={12} className="text-faint" />}>Physical Sweep Simulator</SectionLabel>
            <div className="space-y-1.5">
              {EMF_PRESETS.map((p) => {
                const on = preset === p.id;
                return (
                  <motion.button
                    key={p.id}
                    onClick={() => applyPreset(p.id)}
                    whileTap={{ scale: 0.97 }}
                    transition={SPRING}
                    className={`flex w-full items-start gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors ${
                      on
                        ? p.severity === 'critical'
                          ? 'border-rose-400/50 bg-rose-500/12'
                          : 'border-emerald-400/45 bg-emerald-400/12'
                        : 'border-white/[0.08] bg-white/[0.025] hover:border-white/20'
                    }`}
                  >
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-white/12 bg-white/5">
                      {p.severity === 'critical' ? (
                        <ShieldAlert size={11} className="text-rose-400" />
                      ) : p.severity === 'watch' ? (
                        <Zap size={11} className="text-amber-400" />
                      ) : (
                        <Sparkles size={11} className="text-emerald-400" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] font-semibold text-ink">{p.label}</span>
                      <span className="block text-[9.5px] leading-snug text-faint">{p.note}</span>
                    </span>
                    <span className="mono-num shrink-0 text-[10px] font-semibold text-dim">{p.target}</span>
                  </motion.button>
                );
              })}
            </div>

            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="label-xs">Proximity Sweep</span>
                <span className="mono-num text-[10px] text-dim">
                  {(EARTH_BASELINE_UT + proximity * 235).toFixed(0)} µT
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.005}
                value={proximity}
                onChange={(e) => onProximity(Number(e.target.value))}
                aria-label="Proximity simulator"
              />
              <div className="flex justify-between font-mono text-[8.5px] text-faint">
                <span>FAR</span>
                <span>CONTACT</span>
              </div>
            </div>

            <button
              onClick={() => {
                engineRef.current?.clearSimulation();
                setPreset('baseline');
                setProximity(0);
                dispatch({ type: 'sensor', id: 'magnetometer', patch: { status: hardware ? 'active' : 'off' } });
                toast({ title: 'Baseline restored', detail: '46 µT nominal field', tone: 'ok' });
              }}
              className="btn mt-2.5 w-full !py-1.5 text-[10.5px]"
            >
              <RotateCcw size={11} /> Reset to Earth Baseline
            </button>
          </Glass>

          <Glass>
            <SectionLabel right={<GaugeIcon size={12} className="text-faint" />}>Threat Classification</SectionLabel>
            <div className="space-y-1.5">
              {[
                { r: '0 – 90 µT', t: 'Nominal / room wiring', tone: 'ok', icon: Crosshair },
                { r: '90 – 160 µT', t: 'Powered RF transmitter', tone: 'warn', icon: Zap },
                { r: '160 – 300 µT', t: 'Neodymium GPS tracker', tone: 'danger', icon: ShieldAlert },
                { r: '> 300 µT', t: 'Industrial magnet / NDA ring', tone: 'danger', icon: Magnet },
              ].map((row) => (
                <div key={row.r} className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] px-2 py-1.5">
                  <row.icon
                    size={11}
                    className={
                      row.tone === 'danger' ? 'text-rose-400' : row.tone === 'warn' ? 'text-amber-400' : 'text-emerald-400'
                    }
                  />
                  <span className="mono-num text-[10px] text-dim">{row.r}</span>
                  <span className="ml-auto truncate text-[10px] text-faint">{row.t}</span>
                </div>
              ))}
            </div>
            <GlassInset className="mt-2 !p-2">
              <div className="flex items-start gap-1.5">
                <BatteryCharging size={10} className="mt-0.5 shrink-0 text-cyan-400" />
                <p className="text-[9px] leading-snug text-faint">
                  Geiger clicks accelerate exponentially past 90 µT and haptics pulse on critical
                  hits. Sweep slowly — 5 cm/s gives the sensor time to average.
                </p>
              </div>
            </GlassInset>
          </Glass>
        </div>
      </div>
    </div>
  );
}

function Seismograph({ history }: { history: EmfReading[] }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(140 * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);

    // grid
    ctx.strokeStyle = 'rgba(148,163,184,0.09)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (h * i) / 6);
      ctx.lineTo(w, (h * i) / 6);
      ctx.stroke();
    }

    const MAX = 320;
    const data = history.slice(-260);
    const draw = (key: 'x' | 'y' | 'z' | 'magnitude', color: string, width: number, glow: boolean) => {
      ctx.beginPath();
      data.forEach((r, i) => {
        const x = (i / Math.max(1, data.length - 1)) * w;
        const v = Math.max(-MAX, Math.min(MAX, r[key] + (key === 'magnitude' ? 0 : 120)));
        const y = h - (v / MAX) * h;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = width * dpr;
      ctx.shadowColor = glow ? color : 'transparent';
      ctx.shadowBlur = glow ? 10 : 0;
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    // axis traces are offset into middle band for readability
    draw('x', '#f59e0b', 1.5, false);
    draw('y', '#06b6d4', 1.5, false);
    draw('z', '#10b981', 1.5, false);
    draw('magnitude', '#e2e8f0', 2, true);

    // baseline
    const baseY = h - (EARTH_BASELINE_UT / MAX) * h * 0.55;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    ctx.lineTo(w, baseY);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [history]);

  return <canvas ref={ref} className="block w-full" style={{ height: 140 }} />;
}
