import { AnimatePresence, motion } from 'framer-motion';
import {
  Aperture,
  Camera,
  CameraOff,
  CircleDot,
  Crosshair,
  Eye,
  Gauge,
  Info,
  Layers,
  Lightbulb,
  Lock,
  Maximize2,
  GlassWater,
  ScanLine,
  Sparkles,
  TriangleAlert,
  Video,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Glass, GlassInset, SectionLabel, SPRING, Stat } from '../components/ui/Glass';
import { OpticalGlintEngine, OPTICAL_SCENES, type OpticalFrameStats } from '../services/opticalGlintEngine';
import { useApp } from '../state/store';
import type { OpticalShader } from '../types';

const SHADERS: { key: OpticalShader; label: string; hint: string; tier: 'traveler' | 'auditor' }[] = [
  { key: 'highpass', label: 'High-Pass Specular', hint: '>96% luma micro-clusters', tier: 'traveler' },
  { key: 'redpass', label: 'Ruby Red-Pass', hint: 'coated lens retro-reflection', tier: 'auditor' },
  { key: 'negative', label: 'Negative Luma', hint: 'inverted pinhole contrast', tier: 'auditor' },
  { key: 'strobe', label: 'Strobe Illuminator', hint: 'cyan border bounce-light', tier: 'auditor' },
  { key: 'raw', label: 'Unfiltered Feed', hint: 'sensor passthrough', tier: 'traveler' },
];

export function OpticalLensFinder() {
  const { dispatch, toast, logEvent, can, setModule } = useApp();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const engineRef = useRef<OpticalGlintEngine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [stats, setStats] = useState<OpticalFrameStats>({
    fps: 0,
    meanLuma: 0,
    peakLuma: 0,
    candidates: [],
    lockedCount: 0,
    threatScore: 0,
    scanTimeMs: 0,
  });
  const [shader, setShader] = useState<OpticalShader>('highpass');
  const [sensitivity, setSensitivity] = useState(0.55);
  const [scene, setScene] = useState<string>('smoke');
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [detect, setDetect] = useState(true);
  const [showOverlay, setShowOverlay] = useState(true);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');

  const isPro = can('auditor');
  const activeScene = useMemo(() => OPTICAL_SCENES.find((s) => s.id === scene), [scene]);

  // ---------------- engine lifecycle ----------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(640, Math.round(rect.width * dpr));
    canvas.height = Math.round(canvas.width * (9 / 16));

    const engine = new OpticalGlintEngine(canvas);
    engine.onStats = (s) => setStats(s);
    engineRef.current = engine;
    engine.start();

    return () => {
      engine.dispose();
      engineRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.configure({ shader, sensitivity, detect });
  }, [shader, sensitivity, detect]);

  useEffect(() => {
    if (!cameraOn) engineRef.current?.setScene(scene);
  }, [scene, cameraOn]);

  // threat telemetry → global store
  const lastLogged = useRef(0);
  useEffect(() => {
    const score = activeScene && !cameraOn
      ? activeScene.threat === 'critical'
        ? Math.max(stats.threatScore, 68)
        : activeScene.threat === 'watch'
          ? Math.max(stats.threatScore, 34)
          : Math.min(stats.threatScore, 12)
      : stats.threatScore;
    dispatch({ type: 'telemetry', key: 'opticalThreat', value: score });

    if (score >= 55 && Date.now() - lastLogged.current > 9000) {
      lastLogged.current = Date.now();
      logEvent({
        kind: 'optical',
        title: stats.lockedCount ? 'Pinhole lens glint locked' : 'Specular anomaly under watch',
        detail: stats.lockedCount
          ? `Target lock on ${stats.lockedCount} retro-reflective micro-cluster${stats.lockedCount > 1 ? 's' : ''} — circularity and intensity consistent with a coated camera lens.`
          : 'High-luma specular return detected without full lock. Increase strobe illumination and re-sweep at 15 cm.',
        severity: score >= 68 ? 'critical' : 'high',
        metric: `${stats.lockedCount} lock · ${Math.round(stats.threatScore)} threat`,
        location: activeScene?.fixture ?? 'Live camera field',
        source: cameraOn ? 'sensor' : 'simulator',
      });
      dispatch({
        type: 'sensor',
        id: 'camera',
        patch: { status: cameraOn ? 'active' : 'simulator' },
      });
    }
  }, [stats.threatScore, stats.lockedCount, dispatch, logEvent, activeScene, cameraOn]);

  // ---------------- camera ----------------
  const toggleCamera = useCallback(async () => {
    if (cameraOn) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      engineRef.current?.attachVideo(null);
      setCameraOn(false);
      dispatch({ type: 'sensor', id: 'camera', patch: { status: 'off' } });
      return;
    }
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 60, max: 60 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => undefined);
      }
      if (v) engineRef.current?.attachVideo(v);
      setCameraOn(true);
      dispatch({ type: 'sensor', id: 'camera', patch: { status: 'active' } });
      toast({ title: 'Optical sensor online', detail: 'Rear camera streaming at 60 fps', tone: 'ok' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Camera unavailable';
      setCameraError(msg);
      dispatch({ type: 'sensor', id: 'camera', patch: { status: 'denied' } });
      toast({
        title: 'Camera restricted',
        detail: 'Fixture simulator remains fully functional.',
        tone: 'warn',
      });
    }
  }, [cameraOn, facing, dispatch, toast]);

  const flipCamera = useCallback(async () => {
    const next = facing === 'environment' ? 'user' : 'environment';
    setFacing(next);
    if (!cameraOn) return;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: next, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch {
      /* keep previous stream */
    }
  }, [cameraOn, facing]);

  const captureEvidence = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const data = canvas.toDataURL('image/jpeg', 0.72);
      const ev = logEvent({
        kind: 'optical',
        title: 'Optical evidence frame captured',
        detail: `Frame #${Date.now().toString(36).toUpperCase()} — ${stats.lockedCount} locked candidate(s), shader ${shader}.`,
        severity: stats.lockedCount ? 'critical' : 'low',
        metric: `${Math.round(stats.threatScore)} threat · ${canvas.width}×${canvas.height}`,
        location: activeScene?.fixture ?? 'Live camera field',
        source: cameraOn ? 'sensor' : 'simulator',
      });
      sessionStorage.setItem(`evidence:${ev.id}`, data);
      toast({ title: 'Evidence frame stored', detail: `Ref ${ev.id}`, tone: 'ok' });
    } catch {
      toast({ title: 'Capture blocked', detail: 'Canvas is tainted by the video source.', tone: 'warn' });
    }
  }, [stats, logEvent, shader, activeScene, cameraOn, toast]);

  const shaderLocked = !isPro && (shader === 'redpass' || shader === 'negative' || shader === 'strobe');

  return (
    <div className="space-y-3">
      {/* ===== control strip ===== */}
      <Glass className="!p-3" prism>
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg border border-white/15 bg-emerald-400/10">
              <ScanLine size={13} className="accent-text" />
            </span>
            <div>
              <div className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink">Optical Lens Finder</div>
              <div className="text-[9.5px] text-faint">Specular retro-reflection · two-way mirror test</div>
            </div>
          </div>

          <div className="flex-1" />

          <motion.button
            onClick={toggleCamera}
            whileTap={{ scale: 0.96 }}
            transition={SPRING}
            className={`btn !py-1.5 text-[11px] ${cameraOn ? 'btn-danger' : 'btn-accent'}`}
          >
            {cameraOn ? <CameraOff size={13} /> : <Camera size={13} />}
            {cameraOn ? 'Stop Camera' : 'Live Camera'}
          </motion.button>

          <button onClick={flipCamera} className="btn !px-2 !py-1.5" aria-label="Flip camera">
            <Video size={13} />
          </button>

          <button
            onClick={() => setDetect((d) => !d)}
            className={`btn !py-1.5 text-[11px] ${detect ? '' : 'opacity-70'}`}
            aria-pressed={detect}
          >
            <Crosshair size={13} />
            Detect {detect ? 'On' : 'Off'}
          </button>

          <button onClick={captureEvidence} className="btn !py-1.5 text-[11px]">
            <Aperture size={13} /> Capture
          </button>

          <button
            onClick={() => dispatch({ type: 'modal', modal: { type: 'mirror-guide' } })}
            className="btn !py-1.5 text-[11px]"
          >
            <GlassWater size={13} /> Mirror Guide
          </button>
        </div>
      </Glass>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.62fr)_minmax(300px,1fr)]">
        {/* ================= viewport ================= */}
        <Glass className="!p-3" prism>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`chip ${cameraOn ? 'chip-live' : 'chip-warn'}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {cameraOn ? 'LIVE SENSOR' : 'SIMULATOR'}
              </span>
              <span className="chip">{SHADERS.find((s) => s.key === shader)?.label}</span>
              {stats.lockedCount > 0 && (
                <motion.span
                  className="chip chip-danger"
                  animate={{ opacity: [1, 0.55, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                >
                  <CircleDot size={9} /> {stats.lockedCount} LOCK
                </motion.span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="label-xs hidden sm:block">
                {stats.fps.toFixed(0)} FPS · {stats.scanTimeMs.toFixed(1)} MS
              </span>
              <button
                onClick={() => setShowOverlay((v) => !v)}
                className={`btn !px-1.5 !py-1`}
                aria-label="Toggle HUD"
              >
                <Maximize2 size={12} />
              </button>
            </div>
          </div>

          <div
            className="relative overflow-hidden rounded-2xl border border-white/10 bg-black"
            style={{ boxShadow: 'inset 0 0 60px rgba(0,0,0,0.8)' }}
          >
            {/* hidden video source */}
            <video
              ref={videoRef}
              muted
              playsInline
              className="pointer-events-none absolute h-0 w-0 opacity-0"
              aria-hidden
            />

            <canvas ref={canvasRef} className="block w-full" style={{ aspectRatio: '16 / 9' }} />

            {/* strobe ring */}
            {shader === 'strobe' && isPro && (
              <motion.div
                className="pointer-events-none absolute inset-0 rounded-2xl"
                animate={{ boxShadow: [
                  'inset 0 0 0 3px rgba(6,182,212,0.85), inset 0 0 40px rgba(255,255,255,0.35)',
                  'inset 0 0 0 12px rgba(6,182,212,0.15), inset 0 0 90px rgba(255,255,255,0.06)',
                  'inset 0 0 0 3px rgba(6,182,212,0.85), inset 0 0 40px rgba(255,255,255,0.35)',
                ] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}

            {/* HUD corners + metadata */}
            {showOverlay && (
              <>
                <div className="pointer-events-none absolute left-2.5 top-2.5 flex items-center gap-1.5">
                  <span className="rounded bg-black/55 px-1.5 py-0.5 font-mono text-[9px] text-emerald-300/90 backdrop-blur">
                    SPECTRA•SCAN
                  </span>
                  <span className="rounded bg-black/55 px-1.5 py-0.5 font-mono text-[9px] text-white/60 backdrop-blur">
                    {cameraOn ? 'CAM-0' : activeScene?.id.toUpperCase()}
                  </span>
                </div>
                <div className="pointer-events-none absolute bottom-2.5 left-2.5 flex flex-wrap gap-1">
                  <span className="rounded bg-black/55 px-1.5 py-0.5 font-mono text-[9px] text-white/60 backdrop-blur">
                    LUMA μ{(stats.meanLuma / 255).toFixed(3)} · PEAK {Math.round(stats.peakLuma)}
                  </span>
                  <span className="rounded bg-black/55 px-1.5 py-0.5 font-mono text-[9px] text-white/60 backdrop-blur">
                    CAND {stats.candidates.length}
                  </span>
                </div>
                <div className="pointer-events-none absolute bottom-2.5 right-2.5">
                  <span
                    className="rounded px-1.5 py-0.5 font-mono text-[9px] backdrop-blur"
                    style={{
                      background: stats.lockedCount ? 'rgba(239,68,68,0.75)' : 'rgba(0,0,0,0.55)',
                      color: stats.lockedCount ? '#fff' : 'rgba(255,255,255,0.6)',
                    }}
                  >
                    {stats.lockedCount ? 'LENS LOCK ACTIVE' : 'FIELD NOMINAL'}
                  </span>
                </div>
              </>
            )}

            {!cameraOn && (
              <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 px-4 text-center">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="inline-flex flex-col items-center gap-1 rounded-xl border border-white/15 bg-black/45 px-3 py-2 backdrop-blur-md"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/70">
                    Fixture Simulator
                  </span>
                  <span className="text-[11px] font-semibold text-white/95">{activeScene?.name}</span>
                  <span className="text-[9.5px] text-white/50">{activeScene?.fixture}</span>
                </motion.div>
              </div>
            )}
          </div>

          {/* scene selector */}
          <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
            <span className="label-xs shrink-0">Fixture</span>
            {OPTICAL_SCENES.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setScene(s.id);
                  if (cameraOn) {
                    streamRef.current?.getTracks().forEach((t) => t.stop());
                    streamRef.current = null;
                    engineRef.current?.attachVideo(null);
                    setCameraOn(false);
                    dispatch({ type: 'sensor', id: 'camera', patch: { status: 'simulator' } });
                  }
                  toast({ title: s.name, detail: s.note, tone: s.threat === 'critical' ? 'danger' : s.threat === 'watch' ? 'warn' : 'ok' });
                }}
                className={`shrink-0 rounded-lg border px-2 py-1 text-[10px] font-medium transition-colors ${
                  scene === s.id
                    ? 'border-emerald-400/50 bg-emerald-400/15 text-ink'
                    : 'border-white/10 bg-white/[0.03] text-faint hover:text-dim'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>

          {cameraError && (
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5">
              <TriangleAlert size={12} className="mt-0.5 shrink-0 text-amber-400" />
              <p className="text-[10px] leading-snug text-amber-200/90">
                Camera restricted ({cameraError.slice(0, 60)}). The fixture simulator runs the identical
                computer-vision pipeline, so the detector is fully testable offline.
              </p>
            </div>
          )}
        </Glass>

        {/* ================= right rail ================= */}
        <div className="space-y-3">
          {/* shader matrix */}
          <Glass>
            <SectionLabel right={<Layers size={12} className="text-faint" />}>
              Optical Filter Matrix
            </SectionLabel>
            <div className="space-y-1.5">
              {SHADERS.map((s) => {
                const locked = s.tier === 'auditor' && !isPro;
                return (
                  <button
                    key={s.key}
                    onClick={() => {
                      if (locked) {
                        toast({
                          title: 'Security Auditor required',
                          detail: 'Multi-spectrum optical filters unlock at Pro tier.',
                          tone: 'warn',
                        });
                        dispatch({ type: 'modal', modal: { type: 'privileges' } });
                        return;
                      }
                      setShader(s.key);
                    }}
                    className={`group relative flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all ${
                      shader === s.key
                        ? 'border-emerald-400/45 bg-emerald-400/[0.12]'
                        : 'border-white/[0.08] bg-white/[0.025] hover:border-white/20'
                    }`}
                  >
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border ${
                        shader === s.key ? 'border-emerald-400/50 bg-emerald-400/20' : 'border-white/12 bg-white/5'
                      }`}
                    >
                      {locked ? <Lock size={11} className="text-amber-400" /> : <Eye size={11} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] font-semibold text-ink">{s.label}</span>
                      <span className="block truncate text-[9.5px] text-faint">{s.hint}</span>
                    </span>
                    {s.tier === 'auditor' && (
                      <span className="shrink-0 rounded border border-amber-400/30 bg-amber-400/10 px-1 py-px font-mono text-[8px] text-amber-300">
                        PRO
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="label-xs">Glint Threshold</span>
                <span className="mono-num text-[10px] text-dim">
                  {Math.round(150 + (1 - sensitivity) * 92)} luma
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={sensitivity}
                onChange={(e) => setSensitivity(Number(e.target.value))}
                aria-label="Glint detection threshold"
              />
              <div className="flex justify-between font-mono text-[8.5px] text-faint">
                <span>STRICT</span>
                <span>SENSITIVE</span>
              </div>
            </div>
          </Glass>

          {/* telemetry */}
          <Glass>
            <SectionLabel right={<Gauge size={12} className="text-faint" />}>
              Detection Telemetry
            </SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Frame Rate" value={stats.fps.toFixed(0)} unit="fps" tone={stats.fps > 45 ? 'ok' : 'warn'} />
              <Stat label="Candidate Clusters" value={stats.candidates.length} tone={stats.candidates.length ? 'warn' : 'ok'} />
              <Stat label="Locked Targets" value={stats.lockedCount} tone={stats.lockedCount ? 'danger' : 'ok'} />
              <Stat
                label="Threat Index"
                value={Math.round(stats.threatScore)}
                unit="/100"
                tone={stats.threatScore >= 60 ? 'danger' : stats.threatScore >= 25 ? 'warn' : 'ok'}
              />
            </div>

            <div className="mt-3 space-y-1">
              <div className="label-xs mb-1">Live Candidates</div>
              <GlassInset className="!p-2">
                <div className="max-h-[104px] space-y-1 overflow-y-auto scrollbar-none">
                  <AnimatePresence initial={false}>
                    {stats.candidates.length === 0 && (
                      <p className="py-2 text-center font-mono text-[10px] text-faint">
                        no specular micro-cluster above threshold
                      </p>
                    )}
                    {stats.candidates.slice(0, 6).map((c) => (
                      <motion.div
                        key={c.id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-1.5 font-mono text-[9.5px]"
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{
                            background: c.locked ? 'var(--danger)' : 'var(--warn)',
                            boxShadow: `0 0 6px ${c.locked ? 'var(--danger)' : 'var(--warn)'}`,
                          }}
                        />
                        <span className="text-dim">{c.id}</span>
                        <span className="text-faint">
                          {(c.x * 100).toFixed(1)},{(c.y * 100).toFixed(1)}
                        </span>
                        <span className="ml-auto" style={{ color: c.locked ? 'var(--danger)' : 'var(--warn)' }}>
                          {c.locked ? 'LOCK' : 'CAND'} {Math.round(c.intensity * 100)}%
                        </span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </GlassInset>
            </div>

            {shaderLocked && (
              <button
                onClick={() => dispatch({ type: 'modal', modal: { type: 'privileges' } })}
                className="mt-2.5 flex w-full items-center gap-1.5 rounded-lg border border-amber-400/25 bg-amber-400/10 px-2 py-1.5 text-[10px] text-amber-200"
              >
                <Lock size={10} /> Shader locked — unlock with Security Auditor
              </button>
            )}
          </Glass>

          {/* two-way mirror quick test */}
          <Glass>
            <SectionLabel right={<GlassWater size={12} className="text-faint" />}>
              Two-Way Mirror Verdict
            </SectionLabel>
            <div className="space-y-2">
              <GlassInset>
                <div className="flex items-start gap-2">
                  <Info size={12} className="mt-0.5 shrink-0 text-cyan-400" />
                  <div>
                    <div className="text-[11px] font-semibold text-ink">
                      {activeScene?.threat === 'watch' ? 'Refraction gap abnormal' : 'Standard glass confirmed'}
                    </div>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-dim">
                      {activeScene?.threat === 'watch'
                        ? 'Second-surface offset measured at 4.1 mm — outside the 3 mm tolerance for standard mirrors. Verify with the fingernail depth test before assuming a spy mirror.'
                        : 'A real mirror reflects your fingertip with a visible 2–4 mm air gap. Touch the glass: if your nail meets its reflection exactly, the reflective coating is on the front surface.'}
                    </p>
                  </div>
                </div>
              </GlassInset>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setScene('mirror');
                    setModule('optical');
                  }}
                  className="btn !py-1.5 text-[10.5px]"
                >
                  <Sparkles size={11} /> Load Mirror Scene
                </button>
                <button
                  onClick={() => dispatch({ type: 'modal', modal: { type: 'mirror-guide' } })}
                  className="btn !py-1.5 text-[10.5px]"
                >
                  <Lightbulb size={11} /> Calibrator
                </button>
              </div>
            </div>
          </Glass>
        </div>
      </div>

      {/* ===== evidence strip ===== */}
      <Glass className="!p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SectionLabel>Capture Protocol</SectionLabel>
          <div className="flex flex-1 flex-wrap items-center gap-3">
            {[
              { n: '01', t: 'Darken the room', d: 'Lenses retro-reflect best under low ambient light' },
              { n: '02', t: 'Strobe the border', d: 'Bounce cyan light across the fixture at 15 cm' },
              { n: '03', t: 'Sweep slowly', d: 'Hold 4 s per fixture — lock needs 5 consecutive frames' },
              { n: '04', t: 'Capture & log', d: 'Frame is stored with a reference for your vault' },
            ].map((s) => (
              <div key={s.n} className="flex min-w-[150px] flex-1 items-start gap-2">
                <span className="mono-num text-[10px] font-bold text-[var(--accent)]">{s.n}</span>
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-semibold text-ink">{s.t}</div>
                  <div className="truncate text-[9.5px] text-faint">{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Glass>
    </div>
  );
}
