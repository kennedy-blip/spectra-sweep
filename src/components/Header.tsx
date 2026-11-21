import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  ChevronDown,
  Cpu,
  Fingerprint,
  Gauge,
  Lock,
  Monitor,
  Radio,
  ScanLine,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Moon,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { ROLE_META, useApp } from '../state/store';
import type { Role, ThemeKey } from '../types';
import { SPRING } from './ui/Glass';
import { ApkQrQuick } from './ApkQrQuick';

const THEMES: { key: ThemeKey; label: string; Icon: typeof Sun; hint: string }[] = [
  { key: 'obsidian', label: 'Stealth Obsidian', Icon: Moon, hint: 'Default dark glass' },
  { key: 'crimson', label: 'Crimson Darkroom', Icon: Sparkles, hint: 'Infrared lens-finder' },
  { key: 'daylight', label: 'Daylight Frost', Icon: Sun, hint: 'High-key alabaster' },
  { key: 'eco', label: 'Eco-Glass', Icon: Cpu, hint: 'Low-GPU matte' },
];

const ROLES: Role[] = ['traveler', 'auditor', 'director'];

export function Header({ onOpenApk }: { onOpenApk: () => void }) {
  const { state, dispatch, toast } = useApp();
  const [themeOpen, setThemeOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);

  const level = state.threatLevel;
  const levelColor =
    level === 'critical' ? 'var(--danger)' : level === 'elevated' ? 'var(--warn)' : 'var(--accent)';
  const LevelIcon = level === 'critical' ? ShieldAlert : level === 'elevated' ? Shield : ShieldCheck;

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-5 sm:pt-4">
      <div
        className="glass prism-edge relative mx-auto flex max-w-[1680px] flex-col gap-2 overflow-visible px-3 py-2.5 sm:px-4"
        style={{ borderRadius: 20 }}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          {/* ---------- brand ---------- */}
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/20 bg-gradient-to-br from-emerald-400/30 via-cyan-400/15 to-rose-500/25 sm:h-10 sm:w-10">
              <ScanLine size={18} className="text-ink" strokeWidth={2.2} />
              <motion.span
                className="absolute inset-0 rounded-xl border"
                style={{ borderColor: levelColor }}
                animate={{ opacity: [0.25, 0.9, 0.25], scale: [1, 1.06, 1] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="truncate text-[15px] font-extrabold uppercase leading-none tracking-[0.16em] text-ink sm:text-[16px]">
                  Spectra<span className="accent-text">Sweep</span>
                </h1>
                <span className="hidden rounded border border-white/15 px-1 py-[1px] font-mono text-[8px] text-faint sm:inline">
                  v1.0.0
                </span>
              </div>
              <p className="mt-1 hidden truncate text-[10px] leading-none text-faint sm:block">
                Optical · Ultrasonic · EMF · Privacy —
                <span className="ml-1 text-dim">field console</span>
              </p>
            </div>
          </div>

          {/* ---------- threat pill ---------- */}
          <motion.div
            layout
            className="ml-1 hidden items-center gap-2 rounded-full border px-2.5 py-1 lg:flex"
            style={{
              borderColor: `color-mix(in srgb, ${levelColor} 45%, transparent)`,
              background: `color-mix(in srgb, ${levelColor} 12%, transparent)`,
            }}
          >
            <LevelIcon size={13} style={{ color: levelColor }} className={level === 'critical' ? 'flicker' : ''} />
            <span
              className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: levelColor }}
            >
              {level === 'critical' ? 'THREAT LOCK' : level === 'elevated' ? 'ANOMALY' : 'SECURE'}
            </span>
            <span className="max-w-[240px] truncate text-[10px] text-dim">{state.threatReason}</span>
          </motion.div>

          <div className="flex-1" />

          {/* ---------- desktop / mobile view toggle ---------- */}
          <div className="hidden items-center rounded-xl border border-white/10 bg-black/25 p-0.5 md:flex">
            {(
              [
                { key: 'desktop', label: 'Desktop Console', Icon: Monitor },
                { key: 'mobile', label: 'Mobile APK', Icon: Smartphone },
              ] as const
            ).map(({ key, label, Icon }) => {
              const active = state.view === key;
              return (
                <button
                  key={key}
                  onClick={() => dispatch({ type: 'view', view: key })}
                  className="relative flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[11px] font-semibold transition-colors"
                  style={{ color: active ? 'rgb(var(--ink))' : 'rgb(var(--faint))' }}
                  aria-pressed={active}
                >
                  {active && (
                    <motion.span
                      layoutId="view-pill"
                      className="absolute inset-0 rounded-[10px] border border-white/15 bg-white/[0.09]"
                      transition={SPRING}
                    />
                  )}
                  <Icon size={13} className="relative z-10" />
                  <span className="relative z-10 hidden xl:inline">{label}</span>
                </button>
              );
            })}
          </div>

          {/* ---------- theme switcher ---------- */}
          <div className="relative">
            <button
              onClick={() => {
                setThemeOpen((v) => !v);
                setRoleOpen(false);
              }}
              className="btn !px-2 !py-1.5"
              aria-label="Theme switcher"
              aria-expanded={themeOpen}
            >
              {(() => {
                const T = THEMES.find((t) => t.key === state.theme) ?? THEMES[0];
                return <T.Icon size={14} />;
              })()}
              <ChevronDown size={12} className="hidden text-faint sm:block" />
            </button>
            <AnimatePresence>
              {themeOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setThemeOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={SPRING}
                    className="glass prism-edge absolute right-0 top-[calc(100%+8px)] z-50 w-64 p-1.5"
                    style={{ borderRadius: 18 }}
                  >
                    <div className="label-xs px-2 py-1.5">Tactical Environment</div>
                    {THEMES.map((t) => (
                      <button
                        key={t.key}
                        onClick={() => {
                          dispatch({ type: 'theme', theme: t.key });
                          setThemeOpen(false);
                          toast({
                            title: `${t.label} engaged`,
                            detail: t.hint,
                            tone: 'info',
                          });
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.07]"
                        style={{
                          background:
                            state.theme === t.key ? 'rgba(255,255,255,0.08)' : undefined,
                        }}
                      >
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/15 bg-white/5">
                          <t.Icon size={13} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-semibold text-ink">
                            {t.label}
                          </span>
                          <span className="block truncate text-[10px] text-faint">{t.hint}</span>
                        </span>
                        {state.theme === t.key && (
                          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                        )}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* ---------- role switcher ---------- */}
          <div className="relative">
            <button
              onClick={() => {
                setRoleOpen((v) => !v);
                setThemeOpen(false);
              }}
              className="btn !px-2 !py-1.5"
              aria-label="Privilege tier"
              aria-expanded={roleOpen}
            >
              <Lock size={14} />
              <span className="hidden font-mono text-[10px] uppercase tracking-wider md:inline">
                {state.role === 'traveler' ? 'Solo' : state.role === 'auditor' ? 'Auditor' : 'Director'}
              </span>
              <ChevronDown size={12} className="hidden text-faint md:block" />
            </button>
            <AnimatePresence>
              {roleOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setRoleOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={SPRING}
                    className="glass prism-edge absolute right-0 top-[calc(100%+8px)] z-50 w-72 p-1.5"
                    style={{ borderRadius: 18 }}
                  >
                    <div className="label-xs px-2 py-1.5">Privilege Tier</div>
                    {ROLES.map((r) => {
                      const meta = ROLE_META[r];
                      return (
                        <button
                          key={r}
                          onClick={() => {
                            const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                            // Close the dropdown first so the depth-push modal and the
                            // menu exit never race; the toast lands after the role swap.
                            setRoleOpen(false);
                            window.setTimeout(
                              () => {
                                dispatch({ type: 'role', role: r });
                                toast({
                                  title: `${meta.name} authorised`,
                                  detail: meta.tier,
                                  tone: 'ok',
                                });
                              },
                              reduced ? 0 : 90,
                            );
                          }}
                          className="flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.07]"
                          style={{
                            background: state.role === r ? 'rgba(255,255,255,0.08)' : undefined,
                          }}
                        >
                          <span
                            className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border"
                            style={{
                              borderColor: `color-mix(in srgb, ${meta.accent} 55%, transparent)`,
                              background: `color-mix(in srgb, ${meta.accent} 18%, transparent)`,
                            }}
                          >
                            {r === 'director' ? (
                              <Fingerprint size={13} style={{ color: meta.accent }} />
                            ) : r === 'auditor' ? (
                              <Gauge size={13} style={{ color: meta.accent }} />
                            ) : (
                              <Shield size={13} style={{ color: meta.accent }} />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-mono text-[10px] font-bold tracking-wider" style={{ color: meta.accent }}>
                              {meta.name}
                            </span>
                            <span className="mt-0.5 block text-[10px] leading-snug text-faint">
                              {meta.tier}
                            </span>
                          </span>
                          {state.role === r && (
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                          )}
                        </button>
                      );
                    })}
                    <div className="mt-1 border-t border-white/10 px-2 pt-1.5">
                      <button
                        onClick={() => {
                          dispatch({ type: 'modal', modal: { type: 'privileges' } });
                          setRoleOpen(false);
                        }}
                        className="flex w-full items-center gap-1.5 py-1.5 text-[10px] text-faint transition-colors hover:text-ink"
                      >
                        <ShieldAlert size={11} /> Open full permission matrix
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* ---------- APK: one tap downloads, the info panel stays one
               long-press (or the info icon in the modal) away ---------- */}
          <div className="relative">
            <ApkQrQuick />
            <button
              onClick={onOpenApk}
              className="absolute -right-1 -top-1 grid h-3.5 w-3.5 place-items-center rounded-full border border-black/40 bg-emerald-400 text-[7px] font-black text-[#04120c]"
              aria-label="APK build details"
              title="Build details, SHA-256 and sideload guide"
            >
              i
            </button>
          </div>

          <button
            onClick={() => dispatch({ type: 'modal', modal: { type: 'privileges' } })}
            className="btn !hidden !px-2 !py-1.5 sm:!inline-flex"
            aria-label="Sensor permissions"
          >
            <Activity size={14} />
          </button>
        </div>

        {/* ---------- mobile-only second row: status ticker ---------- */}
        <div className="flex items-center gap-2 overflow-hidden lg:hidden">
          <span
            className="chip shrink-0"
            style={{
              borderColor: `color-mix(in srgb, ${levelColor} 45%, transparent)`,
              color: levelColor,
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: levelColor }} />
            {level === 'critical' ? 'THREAT' : level === 'elevated' ? 'ANOMALY' : 'SECURE'}
          </span>
          <span className="truncate text-[10px] text-faint">{state.threatReason}</span>
          <div className="ml-auto flex shrink-0 items-center gap-1 md:hidden">
            <button
              onClick={() => dispatch({ type: 'view', view: state.view === 'mobile' ? 'desktop' : 'mobile' })}
              className="chip"
            >
              {state.view === 'mobile' ? <Monitor size={10} /> : <Smartphone size={10} />}
              {state.view === 'mobile' ? 'Console' : 'APK'}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

export function StatusBar() {
  const { state } = useApp();
  const level = state.threatLevel;
  const items = [
    {
      label: 'OPTICAL',
      value: `${Math.round(state.opticalThreat)}`,
      Icon: ScanLine,
      active: state.sensors.camera?.status === 'active' || state.sensors.camera?.status === 'simulator',
    },
    {
      label: 'ULTRA',
      value: `${Math.round(state.ultrasonicThreat)}`,
      Icon: Radio,
      active: state.sensors.microphone?.status === 'active' || state.sensors.microphone?.status === 'simulator',
    },
    {
      label: 'EMF',
      value: `${Math.round(state.emfThreat)}`,
      Icon: Zap,
      active: state.sensors.magnetometer?.status === 'active' || state.sensors.magnetometer?.status === 'simulator',
    },
    {
      label: 'PRIVACY',
      value: `${Math.round(state.privacyThreat)}`,
      Icon: Fingerprint,
      active: state.privacyThreat > 0,
    },
  ];
  return (
    <div className="hidden items-center gap-3 px-1 xl:flex">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-1.5">
          <i.Icon size={11} className={i.active ? 'accent-text' : 'text-faint'} />
          <span className="label-xs !text-[9px]">{i.label}</span>
          <span
            className="mono-num text-[11px] font-semibold"
            style={{
              color: Number(i.value) >= 60 ? 'var(--danger)' : Number(i.value) >= 25 ? 'var(--warn)' : 'rgb(var(--ink))',
            }}
          >
            {i.value}
          </span>
        </div>
      ))}
      <span className="chip" style={{ color: level === 'critical' ? 'var(--danger)' : undefined }}>
        {state.view === 'mobile' ? 'FIELD' : 'CONSOLE'}
      </span>
    </div>
  );
}
