import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  BatteryFull,
  Bell,
  ChevronLeft,
  CircleDot,
  Download,
  Fingerprint,
  Menu,
  Moon,
  ScanLine,
  ShieldCheck,
  Signal,
  Smartphone,
  Wifi,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Header, StatusBar } from './components/Header';
import { MetaballDock, NAV } from './components/MetaballDock';
import { ModalHost, ToastHost } from './components/ModalHost';
import { Glass, SPRING } from './components/ui/Glass';
import { MeshBackground, NoiseOverlay } from './components/ui/MeshBackground';
import { SvgFilters } from './components/ui/SvgFilters';
import { EmfBugSweeper } from './modules/EmfBugSweeper';
import { DigitalFootprint } from './modules/DigitalFootprint';
import { OpticalLensFinder } from './modules/OpticalLensFinder';
import { UltrasonicShield } from './modules/UltrasonicShield';
import { SafeRoomVault } from './modules/SafeRoomVault';
import { downloadApk } from './services/apk';
import { AppProvider, ROLE_META, useApp } from './state/store';

const MODULES = {
  optical: OpticalLensFinder,
  ultrasonic: UltrasonicShield,
  emf: EmfBugSweeper,
  footprint: DigitalFootprint,
  vault: SafeRoomVault,
} as const;

function ModuleHeader({ compact = false }: { compact?: boolean }) {
  const { state } = useApp();
  const nav = NAV.find((n) => n.key === state.module) ?? NAV[0];
  const meta = ROLE_META[state.role];
  const level = state.threatLevel;
  const color = level === 'critical' ? 'var(--danger)' : level === 'elevated' ? 'var(--warn)' : 'var(--accent)';

  return (
    <div className={`flex items-end justify-between gap-3 ${compact ? 'mb-2' : 'mb-3'}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className={`truncate font-extrabold tracking-tight text-ink ${compact ? 'text-[17px]' : 'text-[22px]'}`}>
            {nav.label}
          </h2>
          <span
            className="hidden shrink-0 rounded-full border px-1.5 py-px font-mono text-[8.5px] sm:block"
            style={{
              borderColor: `color-mix(in srgb, ${meta.accent} 45%, transparent)`,
              color: meta.accent,
            }}
          >
            {meta.name}
          </span>
        </div>
        <p className={`mt-0.5 truncate text-dim ${compact ? 'text-[10px]' : 'text-[11.5px]'}`}>
          {state.threatReason}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className="hidden items-center gap-1.5 rounded-full border px-2 py-1 sm:flex"
          style={{
            borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
            background: `color-mix(in srgb, ${color} 10%, transparent)`,
          }}
        >
          <motion.span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: color }}
            animate={{ opacity: [1, 0.25, 1] }}
            transition={{ duration: 1.8, repeat: Infinity }}
          />
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color }}>
            {level}
          </span>
        </span>
        <span className="font-mono text-[9px] text-faint">
          {state.room.venue} · {state.room.name}
        </span>
      </div>
    </div>
  );
}

function DesktopConsole() {
  const { state, dispatch } = useApp();
  const Active = MODULES[state.module];

  useEffect(() => {
    if (state.view !== 'desktop' && window.innerWidth >= 900) {
      // no-op; kept for symmetry
    }
  }, [state.view]);

  return (
    <div className="relative z-10 mx-auto w-full max-w-[1680px] px-3 pb-8 sm:px-5">
      <Header
        onOpenApk={() => {
          // Spec: one tap downloads the artifact *and* opens the distribution modal.
          void downloadApk();
          dispatch({ type: 'modal', modal: { type: 'apk' } });
        }}
      />
      <div className="flex items-center justify-between gap-3">
        <MetaballDock />
        <div className="hidden shrink-0 pt-4 xl:block">
          <StatusBar />
        </div>
      </div>

      <main className="mt-3">
        <ModuleHeader />
        <AnimatePresence mode="wait">
          <motion.div
            key={state.module}
            initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
            transition={{ ...SPRING, filter: { duration: 0.28 } }}
          >
            <Active />
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-3">
        <div className="flex items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded-md border border-white/12 bg-white/5">
            <ScanLine size={10} className="text-faint" />
          </span>
          <span className="font-mono text-[9px] text-faint">
            SPECTRA-SWEEP v1.0.0 · offline-first · zero telemetry egress
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[9px] text-faint">
          <span className="flex items-center gap-1">
            <ShieldCheck size={9} /> IndexedDB vault
          </span>
          <span className="hidden items-center gap-1 sm:flex">
            <Activity size={9} /> 60 fps optical
          </span>
          <span className="flex items-center gap-1">
            <Fingerprint size={9} /> local-only audit
          </span>
        </div>
      </footer>
    </div>
  );
}

function MobileShell({ embedded = false }: { embedded?: boolean }) {
  const { state, dispatch } = useApp();
  const Active = MODULES[state.module];
  const nav = NAV.find((n) => n.key === state.module) ?? NAV[0];

  return (
    <div className={`relative flex h-full flex-col overflow-hidden ${embedded ? '' : 'min-h-screen'}`}>
      {/* status bar */}
      <div className="flex items-center justify-between px-4 pb-1 pt-2.5">
        <span className="font-mono text-[10px] font-semibold text-ink">
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
        </span>
        <div className="flex items-center gap-1 text-ink">
          <Signal size={10} />
          <Wifi size={10} />
          <BatteryFull size={12} />
        </div>
      </div>

      {/* app bar */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="relative grid h-8 w-8 place-items-center rounded-xl border border-white/18 bg-gradient-to-br from-emerald-400/28 via-cyan-400/12 to-rose-500/22">
          <ScanLine size={15} className="text-ink" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-extrabold uppercase tracking-[0.14em] text-ink">
            Spectra<span className="accent-text">Sweep</span>
          </div>
          <div className="truncate font-mono text-[8.5px] text-faint">{nav.label}</div>
        </div>
        <button
          onClick={() => dispatch({ type: 'modal', modal: { type: 'privileges' } })}
          className="grid h-7 w-7 place-items-center rounded-lg border border-white/12 bg-white/5 text-dim"
          aria-label="Permissions"
        >
          <Bell size={12} />
        </button>
        <button
          onClick={() => dispatch({ type: 'modal', modal: { type: 'apk' } })}
          className="grid h-7 w-7 place-items-center rounded-lg border border-emerald-400/40 bg-emerald-400/15 text-emerald-300"
          aria-label="APK"
        >
          <Download size={12} />
        </button>
        {!embedded && (
          <button
            onClick={() => dispatch({ type: 'view', view: 'desktop' })}
            className="grid h-7 w-7 place-items-center rounded-lg border border-white/12 bg-white/5 text-dim"
            aria-label="Exit mobile preview"
          >
            <ChevronLeft size={13} />
          </button>
        )}
      </div>

      {/* scrolling content */}
      <div className="flex-1 overflow-y-auto px-2.5 pb-28 pt-1">
        <div className="mb-2 flex items-center justify-between px-0.5">
          <div className="flex items-center gap-1.5">
            <span
              className="rounded-full border px-1.5 py-px font-mono text-[8px] font-bold uppercase"
              style={{
                borderColor: `color-mix(in srgb, ${ROLE_META[state.role].accent} 45%, transparent)`,
                color: ROLE_META[state.role].accent,
              }}
            >
              {state.role}
            </span>
            <span
              className={`rounded-full border px-1.5 py-px font-mono text-[8px] font-bold uppercase ${
                state.threatLevel === 'critical'
                  ? 'border-rose-500/50 text-rose-300'
                  : state.threatLevel === 'elevated'
                    ? 'border-amber-500/50 text-amber-300'
                    : 'border-emerald-500/50 text-emerald-300'
              }`}
            >
              {state.threatLevel}
            </span>
          </div>
          <span className="truncate font-mono text-[8px] text-faint">
            {state.room.name}
          </span>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={state.module}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={SPRING}
          >
            <Active />
          </motion.div>
        </AnimatePresence>
      </div>

      <MetaballDock compact />

      {/* home indicator */}
      <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center">
        <span className="h-1 w-24 rounded-full bg-white/25" />
      </div>
    </div>
  );
}

function MobilePreview() {
  const { dispatch, state } = useApp();
  const [wide, setWide] = useState(false);

  // simulate a phone viewport by overriding the theme container
  return (
    <div className="relative z-10 mx-auto w-full max-w-[1680px] px-3 pb-8 sm:px-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 pt-3">
        <div className="flex items-center gap-2">
          <button onClick={() => dispatch({ type: 'view', view: 'desktop' })} className="btn !py-1.5 text-[11px]">
            <ChevronLeft size={13} /> Back to Console
          </button>
          <span className="chip chip-live">
            <Smartphone size={8} /> FIELD APK PREVIEW
          </span>
          <span className="chip">384 × 832</span>
          <span className="chip hidden sm:flex">
            <Menu size={8} /> bottom gooey dock
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setWide((w) => !w)} className="btn !px-2 !py-1.5 text-[10px]">
            {wide ? 'Standard' : 'Large Frame'}
          </button>
          <button
            onClick={() => dispatch({ type: 'theme', theme: state.theme === 'daylight' ? 'obsidian' : 'daylight' })}
            className="btn !px-2 !py-1.5"
            aria-label="Toggle daylight"
          >
            <Moon size={13} />
          </button>
          <button onClick={() => void downloadApk()} className="btn btn-accent !py-1.5 text-[10.5px]">
            <Download size={12} /> Download .APK
          </button>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-start lg:justify-center">
        <motion.div
          layout
          transition={SPRING}
          className="device-chassis relative shrink-0"
          style={{
            width: wide ? 420 : 372,
          }}
        >
          {/* notch / camera punch-hole */}
          <div className="pointer-events-none absolute left-1/2 top-2 z-20 h-4 w-16 -translate-x-1/2 rounded-full bg-black/70" />
          <div
            className="device-screen"
            style={{ height: wide ? 880 : 780 }}
          >
            <MobileShell embedded />
          </div>
        </motion.div>

        {/* side explainer */}
        <div className="max-w-sm space-y-3">
          <Glass className="!p-3">
            <div className="label-xs mb-1.5">Native Field Build</div>
            <p className="text-[11px] leading-relaxed text-dim">
              This frame is the exact Capacitor web view shipped inside the Android APK — same
              components, same DSP engines, same IndexedDB vault. Interact with it directly to
              verify the edge-to-edge field layout before you install.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {[
                { k: 'Bottom dock', v: 'gooey metaball' },
                { k: 'Safe area', v: 'env(safe-area-inset)' },
                { k: 'Haptics', v: 'Capacitor' },
                { k: 'Orientation', v: 'gyro specular' },
              ].map((r) => (
                <div key={r.k} className="rounded-lg border border-white/[0.07] bg-black/25 px-2 py-1">
                  <div className="font-mono text-[8px] text-faint">{r.k}</div>
                  <div className="truncate text-[9.5px] text-dim">{r.v}</div>
                </div>
              ))}
            </div>
          </Glass>

          <Glass className="!p-3">
            <div className="label-xs mb-1.5">Module Jump</div>
            <div className="grid grid-cols-2 gap-1.5">
              {NAV.map((n) => (
                <button
                  key={n.key}
                  onClick={() => dispatch({ type: 'module', module: n.key })}
                  className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left transition-colors ${
                    state.module === n.key
                      ? 'border-emerald-400/45 bg-emerald-400/12'
                      : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20'
                  }`}
                >
                  <n.Icon size={11} className={state.module === n.key ? 'accent-text' : 'text-faint'} />
                  <span className="truncate text-[10px] font-medium text-ink">{n.short}</span>
                </button>
              ))}
            </div>
          </Glass>

          <Glass className="!p-3">
            <div className="flex items-start gap-2">
              <CircleDot size={12} className="mt-0.5 shrink-0 accent-text" />
              <p className="text-[10px] leading-relaxed text-faint">
                On a real Android device this shell auto-launches edge-to-edge with the status bar
                overlaid and the navigation dock pinned above the system gesture bar.
              </p>
            </div>
          </Glass>
        </div>
      </div>
    </div>
  );
}

function Shell() {
  const { state, dispatch } = useApp();
  const isModalOpen = !!state.modal;
  const mobile = state.view === 'mobile';
  const [narrow, setNarrow] = useState(() => window.innerWidth < 900);

  // Real phones and narrow windows always get the edge-to-edge field layout.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px)');
    const handler = () => {
      setNarrow(mq.matches);
      if (mq.matches && state.view === 'desktop') dispatch({ type: 'view', view: 'mobile' });
    };
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const content = useMemo(() => {
    if (narrow) return <MobileShell />;
    return mobile ? <MobilePreview /> : <DesktopConsole />;
  }, [mobile, narrow]);

  return (
    <>
      <SvgFilters />
      <MeshBackground />
      <motion.div
        className={`app-shell ${isModalOpen ? 'shell-pushed' : ''}`}
        animate={{
          scale: isModalOpen ? 0.94 : 1,
          y: isModalOpen ? 6 : 0,
          filter: isModalOpen ? 'blur(6px) saturate(0.82) brightness(0.74)' : 'blur(0px) saturate(1) brightness(1)',
          borderRadius: isModalOpen ? 28 : 0,
        }}
        style={{ borderRadius: 0 }}
        transition={SPRING}
      >
        {content}
      </motion.div>
      <NoiseOverlay />
      <ModalHost />
      <ToastHost />
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
