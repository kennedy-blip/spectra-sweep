import { motion } from 'framer-motion';
import { Fingerprint, Gauge, ScanLine, ShieldCheck, Waves } from 'lucide-react';
import { useApp } from '../state/store';
import type { ModuleKey } from '../types';
import { SPRING } from './ui/Glass';

export const NAV: { key: ModuleKey; label: string; short: string; Icon: typeof ScanLine }[] = [
  { key: 'optical', label: 'Optical Lens Finder', short: 'Optical', Icon: ScanLine },
  { key: 'ultrasonic', label: 'Ultrasonic Shield', short: 'Ultrasonic', Icon: Waves },
  { key: 'emf', label: 'EMF Bug Sweeper', short: 'EMF', Icon: Gauge },
  { key: 'footprint', label: 'Digital Footprint', short: 'Footprint', Icon: Fingerprint },
  { key: 'vault', label: 'Safe-Room Vault', short: 'Vault', Icon: ShieldCheck },
];

export function MetaballDock({ compact = false }: { compact?: boolean }) {
  const { state, setModule } = useApp();
  const activeIdx = Math.max(0, NAV.findIndex((n) => n.key === state.module));

  if (compact) {
    // ---- Mobile: floating bottom gooey dock with safe-area inset ----
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-2.5 pb-[max(10px,env(safe-area-inset-bottom))]">
        <div className="pointer-events-auto relative w-full max-w-md">
          <div
            className="absolute inset-x-4 -bottom-1 h-12 rounded-full opacity-50 blur-2xl"
            style={{ background: 'radial-gradient(60% 100% at 50% 50%, var(--halo), transparent)' }}
          />
          <div
            className="relative flex items-stretch justify-between rounded-[26px] border border-white/[0.15] p-1.5"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.14), rgba(8,12,20,0.78))',
              backdropFilter: 'blur(26px) saturate(180%)',
              WebkitBackdropFilter: 'blur(26px) saturate(180%)',
              boxShadow: '0 24px 60px -22px rgba(0,0,0,0.92), inset 0 1px 1px rgba(255,255,255,0.34)',
            }}
          >
            {/* gooey blob layer — 5 equal cells, translateX in own widths */}
            <div className="pointer-events-none absolute inset-1.5 flex" style={{ filter: 'url(#gooey-indicator)' }}>
              <motion.div
                className="h-full w-1/5 rounded-2xl"
                animate={{ x: `${activeIdx * 100}%` }}
                transition={SPRING}
                style={{
                  background:
                    'radial-gradient(65% 130% at 50% 50%, color-mix(in srgb, var(--accent) 62%, transparent), transparent 74%)',
                }}
              />
            </div>

            {NAV.map((n) => {
              const active = state.module === n.key;
              return (
                <motion.button
                  key={n.key}
                  onClick={() => setModule(n.key)}
                  className="relative z-10 flex flex-1 flex-col items-center gap-1 rounded-2xl py-1.5"
                  whileTap={{ scale: 0.9 }}
                  transition={SPRING}
                  aria-label={n.label}
                  aria-current={active ? 'page' : undefined}
                >
                  <n.Icon
                    size={17}
                    strokeWidth={active ? 2.4 : 1.9}
                    style={{ color: active ? 'rgb(var(--ink))' : 'rgb(var(--faint))' }}
                  />
                  <span
                    className="text-[8.5px] font-semibold uppercase leading-none tracking-[0.06em]"
                    style={{ color: active ? 'rgb(var(--ink))' : 'rgb(var(--faint))' }}
                  >
                    {n.short}
                  </span>
                  {active && (
                    <motion.span
                      layoutId="dock-dot-mobile"
                      className="absolute -bottom-[1px] h-1 w-1 rounded-full"
                      style={{ background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }}
                      transition={SPRING}
                    />
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ---- Desktop: horizontal gooey dock ----
  return (
    <div className="relative z-30 mx-auto mt-3 w-full max-w-[1680px] px-3 sm:px-5">
      <div className="relative inline-flex max-w-full overflow-x-auto scrollbar-none">
        <div
          className="relative flex items-stretch gap-1 rounded-2xl border border-white/[0.12] p-1.5"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.075), rgba(8,12,20,0.35))',
            backdropFilter: 'blur(20px) saturate(160%)',
            WebkitBackdropFilter: 'blur(20px) saturate(160%)',
            boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.26), 0 16px 44px -26px rgba(0,0,0,0.9)',
          }}
        >
          {/* active blob: absolute overlay matching the gap-1 grid exactly */}
          <div className="pointer-events-none absolute inset-1.5 flex gap-1" style={{ filter: 'url(#gooey-metaball)' }}>
            {NAV.map((n, i) => (
              <div key={n.key} className="relative flex-1">
                {i === activeIdx && (
                  <motion.div
                    layoutId="dock-blob"
                    className="absolute inset-0 rounded-xl"
                    transition={SPRING}
                    style={{
                      background:
                        'linear-gradient(160deg, color-mix(in srgb, var(--accent) 38%, transparent), color-mix(in srgb, var(--accent-2) 24%, transparent))',
                      border: '1px solid color-mix(in srgb, var(--accent) 34%, transparent)',
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          {NAV.map((n) => {
            const active = state.module === n.key;
            return (
              <motion.button
                key={n.key}
                onClick={() => setModule(n.key)}
                className="relative z-10 flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-[12px] font-semibold transition-colors"
                style={{ color: active ? 'rgb(var(--ink))' : 'rgb(var(--dim))' }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                transition={SPRING}
                aria-current={active ? 'page' : undefined}
              >
                <n.Icon size={14} strokeWidth={active ? 2.5 : 2} />
                <span className="hidden md:inline">{n.short}</span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
