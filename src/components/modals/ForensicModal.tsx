import { motion } from 'framer-motion';
import {
  Aperture,
  Camera,
  Check,
  Clock,
  Download,
  Fingerprint,
  MapPin,
  Radio,
  ShieldAlert,
  Sparkles,
  Waves,
  X,
  Zap,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApp } from '../../state/store';
import type { ThreatEvent } from '../../types';
import { Glass, GlassInset, SectionLabel, SPRING } from '../ui/Glass';

const KIND_META = {
  optical: { Icon: Aperture, label: 'Optical Glint', color: '#ef4444', action: 'optical' as const },
  ultrasonic: { Icon: Waves, label: 'Ultrasonic Beacon', color: '#06b6d4', action: 'ultrasonic' as const },
  emf: { Icon: Zap, label: 'EMF Anomaly', color: '#f59e0b', action: 'emf' as const },
  privacy: { Icon: Fingerprint, label: 'Privacy Leak', color: '#8b5cf6', action: 'footprint' as const },
};

const COUNTERMEASURES: Record<ThreatEvent['kind'], { title: string; steps: string[] }> = {
  optical: {
    title: 'Optical countermeasure',
    steps: [
      'Do not touch the fixture — photograph it first for evidence.',
      'Re-sweep at 15 cm with the strobe shader and capture a second frame.',
      'Cover the lens with opaque tape and contact the host in writing.',
      'If the fixture is not in the listing photos, vacate and report to the platform.',
    ],
  },
  ultrasonic: {
    title: 'Acoustic countermeasure',
    steps: [
      'Engage the 18.5–21.5 kHz curtain while you remain in the room.',
      'Power down the TV and any streaming box at the wall.',
      'Identify the carrier frequency and log it before jamming.',
      'Keep the phone in a Faraday pouch when not actively sweeping.',
    ],
  },
  emf: {
    title: 'Magnetic countermeasure',
    steps: [
      'Move at 5 cm/s — magnetic flux falls off with the cube of distance.',
      'Photograph the fixture, then physically inspect the wheel well or frame.',
      'Do not remove a suspected tracker until you have documented it.',
      'Report any active tracker on a vehicle to local authorities immediately.',
    ],
  },
  privacy: {
    title: 'Digital countermeasure',
    steps: [
      'Block WebRTC for this origin or switch to a hardened browser profile.',
      'Rotate to cellular tethering for any authenticated session.',
      'Clear site data and cookies before checkout.',
      'Re-run the audit and confirm the score improved by 20+ points.',
    ],
  },
};

export function ForensicModal({ eventId }: { eventId: string }) {
  const { state, dispatch, toast, can } = useApp();
  const event = useMemo(() => state.events.find((e) => e.id === eventId), [state.events, eventId]);
  const [resolved, setResolved] = useState(false);

  if (!event) {
    return (
      <div className="py-8 text-center">
        <p className="font-mono text-[11px] text-faint">evidence record not found</p>
        <button onClick={() => dispatch({ type: 'modal', modal: null })} className="btn mt-3 !py-1.5 text-[11px]">
          Close
        </button>
      </div>
    );
  }

  const meta = KIND_META[event.kind];
  const cm = COUNTERMEASURES[event.kind];
  const evidenceFrame = sessionStorage.getItem(`evidence:${event.id}`);
  const isDirector = can('director');

  const exportEvidence = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            evidenceId: event.id,
            craftedAt: new Date().toISOString(),
            event,
            countermeasures: cm.steps,
            hasFrame: !!evidenceFrame,
            chain: 'local-only · no network egress',
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spectra-evidence-${event.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Evidence exported', tone: 'ok' });
  };

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* left: record */}
      <div>
        <div className="flex items-start gap-2.5">
          <motion.span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border"
            style={{
              borderColor: `color-mix(in srgb, ${meta.color} 55%, transparent)`,
              background: `color-mix(in srgb, ${meta.color} 16%, transparent)`,
            }}
            animate={{ boxShadow: [`0 0 0 0 ${meta.color}55`, `0 0 22px 3px ${meta.color}18`, `0 0 0 0 ${meta.color}55`] }}
            transition={{ duration: 2.6, repeat: Infinity }}
          >
            <meta.Icon size={19} style={{ color: meta.color }} />
          </motion.span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[8.5px] uppercase tracking-[0.14em]" style={{ color: meta.color }}>
                {meta.label}
              </span>
              <span
                className={`chip ${
                  event.severity === 'critical'
                    ? 'chip-danger'
                    : event.severity === 'high'
                      ? 'chip-warn'
                      : 'chip-live'
                }`}
              >
                {event.severity}
              </span>
              <span className="chip">{event.source}</span>
            </div>
            <h3 className="mt-0.5 text-[14px] font-bold leading-snug text-ink">{event.title}</h3>
          </div>
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-dim">{event.detail}</p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {[
            { Icon: Fingerprint, k: 'Evidence ID', v: event.id },
            { Icon: Clock, k: 'Captured', v: new Date(event.at).toISOString().replace('T', ' ').slice(0, 19) },
            { Icon: Camera, k: 'Metric', v: event.metric ?? '—' },
            { Icon: MapPin, k: 'Location', v: event.location ?? state.room.name },
          ].map((r) => (
            <div key={r.k} className="rounded-lg border border-white/[0.07] bg-black/30 px-2 py-1.5">
              <div className="flex items-center gap-1">
                <r.Icon size={9} className="text-faint" />
                <span className="label-xs !text-[8px]">{r.k}</span>
              </div>
              <div className="truncate-mono mt-0.5 text-dim">{r.v}</div>
            </div>
          ))}
        </div>

        {evidenceFrame ? (
          <div className="mt-2.5 overflow-hidden rounded-xl border border-white/12">
            <img src={evidenceFrame} alt={`Captured optical frame for ${event.id}`} className="block w-full" />
            <div className="flex items-center justify-between bg-black/60 px-2 py-1">
              <span className="font-mono text-[8px] text-faint">CAPTURED FRAME · JPEG 72%</span>
              <span className="font-mono text-[8px] text-emerald-300">SHA-LOCKED</span>
            </div>
          </div>
        ) : (
          <GlassInset className="mt-2.5 !p-2">
            <div className="flex items-center gap-1.5">
              <Sparkles size={10} className="shrink-0 text-faint" />
              <p className="text-[9px] leading-snug text-faint">
                No image frame is attached to this record — sweep telemetry, sensor vectors and
                countermeasure guidance are preserved.
              </p>
            </div>
          </GlassInset>
        )}
      </div>

      {/* right: countermeasures */}
      <div>
        <SectionLabel right={<ShieldAlert size={11} className="text-faint" />}>{cm.title}</SectionLabel>
        <div className="space-y-1.5">
          {cm.steps.map((s, i) => (
            <motion.div
              key={s}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, ...SPRING }}
              className="flex items-start gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] px-2 py-1.5"
            >
              <span className="mt-px grid h-4 w-4 shrink-0 place-items-center rounded border border-emerald-400/35 bg-emerald-400/12 font-mono text-[8px] font-bold text-emerald-300">
                {i + 1}
              </span>
              <p className="text-[10px] leading-snug text-dim">{s}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-3 rounded-xl border border-white/[0.08] bg-black/30 p-2.5">
          <div className="flex items-center justify-between">
            <span className="label-xs">Chain of custody</span>
            <span className="font-mono text-[8.5px] text-emerald-300/80">LOCAL ONLY</span>
          </div>
          <p className="mt-1 text-[9px] leading-snug text-faint">
            Evidence never leaves this browser. Records live in IndexedDB and are only exported when
            you explicitly download them.
          </p>
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <button
            onClick={() => {
              dispatch({ type: 'module', module: meta.action });
              dispatch({ type: 'modal', modal: null });
            }}
            className="btn !py-1.5 text-[10px]"
          >
            <Radio size={11} /> Open Scanner
          </button>
          <button
            onClick={() => (isDirector ? exportEvidence() : dispatch({ type: 'modal', modal: { type: 'privileges' } }))}
            className="btn !py-1.5 text-[10px]"
          >
            {isDirector ? <Download size={11} /> : <ShieldAlert size={11} />} Export
          </button>
        </div>
        <motion.button
          onClick={() => {
            setResolved(true);
            toast({ title: 'Marked resolved', detail: event.id, tone: 'ok' });
            setTimeout(() => dispatch({ type: 'modal', modal: null }), 500);
          }}
          whileTap={{ scale: 0.97 }}
          className={`btn mt-1.5 w-full !py-1.5 text-[10px] ${resolved ? 'btn-accent' : ''}`}
        >
          <Check size={11} /> {resolved ? 'Resolved' : 'Mark Countermeasure Applied'}
        </motion.button>
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

export { Glass };
