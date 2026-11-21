import { motion } from 'framer-motion';
import {
  Camera,
  Check,
  CircleSlash,
  Fingerprint,
  Gauge,
  Lock,
  Shield,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Vibrate,
  X,
  Zap,
} from 'lucide-react';
import { ROLE_META, useApp } from '../../state/store';
import type { Role, SensorId, SensorStatus } from '../../types';
import { SectionLabel, SPRING } from '../ui/Glass';

const ROLES: Role[] = ['traveler', 'auditor', 'director'];

const SENSOR_ICON: Record<SensorId, typeof Camera> = {
  camera: Camera,
  microphone: Sparkles,
  magnetometer: Gauge,
  haptics: Vibrate,
};

const STATUS_STYLE: Record<SensorStatus, { label: string; cls: string }> = {
  off: { label: 'STANDBY', cls: 'chip' },
  active: { label: 'ACTIVE', cls: 'chip chip-live' },
  simulator: { label: 'SIMULATOR ACTIVE', cls: 'chip chip-warn' },
  restricted: { label: 'RESTRICTED', cls: 'chip chip-danger' },
  denied: { label: 'DENIED', cls: 'chip chip-danger' },
};

export function PrivilegesModal() {
  const { state, dispatch, toast } = useApp();

  return (
    <div className="max-h-[78vh] space-y-4 overflow-y-auto pr-1">
      {/* ---------------- RBAC ---------------- */}
      <div>
        <SectionLabel right={<Lock size={11} className="text-faint" />}>
          Role-Based Access Control
        </SectionLabel>
        <div className="grid gap-2 sm:grid-cols-3">
          {ROLES.map((r) => {
            const meta = ROLE_META[r];
            const active = state.role === r;
            return (
              <motion.button
                key={r}
                onClick={() => {
                  dispatch({ type: 'role', role: r });
                  toast({ title: `${meta.name} authorised`, detail: meta.tier, tone: 'ok' });
                }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                transition={SPRING}
                className="relative overflow-hidden rounded-xl border p-2.5 text-left transition-colors"
                style={{
                  borderColor: active ? `color-mix(in srgb, ${meta.accent} 60%, transparent)` : 'rgba(255,255,255,0.09)',
                  background: active
                    ? `linear-gradient(160deg, color-mix(in srgb, ${meta.accent} 16%, transparent), rgba(255,255,255,0.02))`
                    : 'rgba(255,255,255,0.02)',
                }}
              >
                {active && (
                  <motion.span
                    layoutId="role-glow"
                    className="absolute inset-x-0 top-0 h-[2px]"
                    style={{ background: meta.accent, boxShadow: `0 0 14px ${meta.accent}` }}
                  />
                )}
                <div className="flex items-center gap-1.5">
                  {r === 'director' ? (
                    <Fingerprint size={12} style={{ color: meta.accent }} />
                  ) : r === 'auditor' ? (
                    <Gauge size={12} style={{ color: meta.accent }} />
                  ) : (
                    <Shield size={12} style={{ color: meta.accent }} />
                  )}
                  <span className="font-mono text-[9px] font-bold tracking-wide" style={{ color: meta.accent }}>
                    {meta.name}
                  </span>
                </div>
                <div className="mt-0.5 text-[9.5px] text-faint">{meta.tier}</div>
                <p className="mt-1 text-[9.5px] leading-snug text-dim">{meta.blurb}</p>
                <ul className="mt-1.5 space-y-0.5">
                  {meta.unlocks.slice(0, 3).map((u) => (
                    <li key={u} className="flex items-start gap-1 text-[9px] leading-snug text-faint">
                      <Check size={8} className="mt-0.5 shrink-0" style={{ color: meta.accent }} />
                      <span className="truncate">{u}</span>
                    </li>
                  ))}
                  {meta.unlocks.length > 3 && (
                    <li className="pl-2.5 font-mono text-[8.5px] text-faint">+{meta.unlocks.length - 3} more</li>
                  )}
                </ul>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ---------------- sensor matrix ---------------- */}
      <div>
        <SectionLabel right={<ShieldAlert size={11} className="text-faint" />}>
          Hardware & OS Sensor Permission Matrix
        </SectionLabel>
        <div className="space-y-1.5">
          {Object.values(state.sensors).map((s) => {
            const Icon = SENSOR_ICON[s.id];
            const st = STATUS_STYLE[s.status];
            return (
              <div
                key={s.id}
                className="flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] px-2.5 py-2"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/12 bg-white/5">
                  <Icon size={12} className="text-dim" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-semibold text-ink">{s.label}</div>
                  <div className="truncate text-[9px] text-faint">{s.detail}</div>
                </div>
                <span className={st.cls}>
                  {s.status === 'active' ? <Zap size={8} /> : s.status === 'off' ? <CircleSlash size={8} /> : null}
                  {st.label}
                </span>
                <div
                  className="ml-1 flex shrink-0 gap-1"
                  role="group"
                  aria-label={`${s.label} mode`}
                >
                  {(['off', 'simulator'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => {
                        dispatch({ type: 'sensor', id: s.id, patch: { status: mode } });
                        toast({
                          title: `${s.label} → ${mode === 'off' ? 'standby' : 'simulator'}`,
                          detail:
                            mode === 'off'
                              ? 'A hardware stream may still be running in its module.'
                              : 'Synthetic data is driving the DSP pipeline.',
                          tone: 'info',
                        });
                      }}
                      className={`rounded-md border px-1.5 py-0.5 font-mono text-[8px] uppercase transition-colors ${
                        s.status === mode
                          ? 'border-emerald-400/45 bg-emerald-400/15 text-emerald-200'
                          : 'border-white/10 text-faint hover:border-white/25 hover:text-dim'
                      }`}
                    >
                      {mode === 'off' ? 'off' : 'sim'}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-1.5 flex items-start gap-1 font-mono text-[8.5px] leading-snug text-faint">
          <Smartphone size={9} className="mt-px shrink-0" />
          Real hardware status is set by each module when you arm it — the toggles let you force a
          restricted array into simulator mode for offline demos.
        </p>
      </div>

      {/* ---------------- capability gates ---------------- */}
      <div>
        <SectionLabel right={<Lock size={11} className="text-faint" />}>
          Capability Gates
        </SectionLabel>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {[
            { t: 'Optical Glint Scanner', req: 'traveler' as Role },
            { t: 'Ultrasonic Beacon Detector', req: 'traveler' as Role },
            { t: 'EMF Bug Sweeper', req: 'traveler' as Role },
            { t: '12-Point Room Checklist', req: 'traveler' as Role },
            { t: 'Multi-Spectrum Optical Filters', req: 'auditor' as Role },
            { t: 'Two-Way Mirror Calibrator', req: 'auditor' as Role },
            { t: 'Active Ultrasonic Jammer', req: 'auditor' as Role },
            { t: 'WebRTC Leak Forensics Lab', req: 'director' as Role },
            { t: 'Telemetry JSON Exporter', req: 'director' as Role },
            { t: 'PIN Evidence Vault + Sync', req: 'director' as Role },
          ].map((c) => {
            const unlocked =
              ROLE_META[state.role] && ROLES.indexOf(state.role) >= ROLES.indexOf(c.req);
            return (
              <div
                key={c.t}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2 py-1.5"
              >
                {unlocked ? (
                  <Check size={10} className="shrink-0 text-emerald-400" />
                ) : (
                  <Lock size={10} className="shrink-0 text-amber-400" />
                )}
                <span className={`min-w-0 flex-1 truncate text-[10px] ${unlocked ? 'text-dim' : 'text-faint'}`}>
                  {c.t}
                </span>
                <span className="shrink-0 font-mono text-[8px] text-faint">{c.req.toUpperCase()}</span>
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => dispatch({ type: 'modal', modal: null })}
        className="btn btn-ghost absolute right-2 top-2 !px-2 !py-1.5"
        aria-label="Close"
      >
        <X size={14} />
      </button>
    </div>
  );
}
