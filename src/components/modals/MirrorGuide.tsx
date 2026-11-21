import { motion } from 'framer-motion';
import { Fingerprint, GlassWater, Info, Lightbulb, Ruler, X } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../../state/store';
import { SectionLabel } from '../ui/Glass';

/**
 * Angle-of-incidence tool.
 * Standard mirror = second-surface: reflective coating is BEHIND the glass,
 * so there is a visible depth offset and a doubled edge reflection.
 * Spy mirror = first-surface: the coating is on the front, so the reflected
 * fingertip touches the finger with zero offset.
 */
export function MirrorGuide() {
  const { dispatch, toast } = useApp();
  const [gap, setGap] = useState(3.2);
  const [angle, setAngle] = useState(35);

  const isFirstSurface = gap < 0.8;
  const verdict = isFirstSurface
    ? { label: 'FIRST-SURFACE — INSPECT FURTHER', tone: '#ef4444', note: 'No glass depth offset. Front-coated mirrors are used in observation rooms. Escalate immediately.' }
    : gap < 2
      ? { label: 'AMBIGUOUS — RE-TEST', tone: '#f59e0b', note: 'Offset is thinner than standard glass. Clean the surface, re-measure at a second point, and check for a camera behind it.' }
      : { label: 'SECOND-SURFACE — STANDARD GLASS', tone: '#10b981', note: 'Consistent with ordinary silvered glass. The coating sits behind a glass layer, which is what a household mirror should do.' };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <SectionLabel right={<GlassWater size={11} className="text-faint" />}>Refraction Calibrator</SectionLabel>

        <div className="relative overflow-hidden rounded-xl border border-white/12 bg-black/40 p-2">
          <svg viewBox="0 0 300 170" className="w-full">
            {/* wall */}
            <rect x="0" y="0" width="300" height="170" fill="#0a0f16" />
            <rect x="0" y="140" width="300" height="30" fill="#1b232d" />
            <line x1="0" y1="140" x2="300" y2="140" stroke="rgba(255,255,255,0.12)" />

            {/* mirror */}
            <rect x="40" y="18" width="220" height="118" rx="5" fill="#273440" stroke="rgba(255,255,255,0.2)" />
            {!isFirstSurface && (
              <rect
                x="40"
                y="18"
                width="220"
                height="118"
                rx="5"
                fill="none"
                stroke="rgba(120,200,255,0.55)"
                strokeWidth={Math.max(1, gap * 1.1)}
                strokeDasharray="3 3"
              />
            )}

            {/* reflected finger (mirror image) */}
            <g opacity="0.85">
              <rect x="132" y="72" width="26" height="54" rx="12" fill="#e8cba8" opacity="0.6" />
              <circle cx="145" cy="72" r="13" fill="#f0d5b5" opacity="0.65" />
            </g>

            {/* the coating layer position */}
            <line
              x1="40"
              y1={18 + gap * 9}
              x2="260"
              y2={18 + gap * 9}
              stroke={verdict.tone}
              strokeWidth="2"
              opacity="0.9"
            />

            {/* actual finger */}
            <rect x="132" y="86" width="26" height="48" rx="12" fill="#f3dcc0" />
            <circle cx="145" cy="86" r="13" fill="#fdf0e0" />
            <path d="M138 90 q7 -10 14 0" stroke="#c9a987" strokeWidth="1.4" fill="none" />

            {/* incident / reflected ray for angle tool */}
            {(() => {
              const rad = (angle * Math.PI) / 180;
              const ox = 250;
              const oy = 150;
              const len = 90;
              const tx = ox - Math.sin(rad) * len;
              const ty = oy - Math.cos(rad) * len;
              return (
                <g>
                  <line x1={ox} y1={oy} x2={tx} y2={ty} stroke="#06b6d4" strokeWidth="1.4" strokeDasharray="4 3" />
                  <line x1={ox} y1={oy} x2={tx + 6} y2={ty - 4} stroke="#f59e0b" strokeWidth="1.4" strokeDasharray="4 3" />
                  <path
                    d={`M ${ox - 26} ${oy} A 26 26 0 0 0 ${ox - Math.sin(rad) * 26} ${oy - Math.cos(rad) * 26}`}
                    fill="none"
                    stroke="rgba(255,255,255,0.35)"
                  />
                  <text x={ox - 44} y={oy - 8} fill="rgba(255,255,255,0.55)" fontSize="8" fontFamily="monospace">
                    {angle}°
                  </text>
                </g>
              );
            })()}

            <text x="46" y="132" fill="rgba(255,255,255,0.35)" fontSize="7" fontFamily="monospace">
              COATING
            </text>
            <text x="176" y="96" fill="rgba(255,255,255,0.3)" fontSize="7" fontFamily="monospace">
              REFLECTION
            </text>
            <text x="176" y="112" fill="rgba(255,255,255,0.45)" fontSize="7" fontFamily="monospace">
              FINGER
            </text>
          </svg>
        </div>

        <div className="mt-2.5 space-y-2">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="label-xs flex items-center gap-1">
                <Ruler size={9} /> Measured glass gap
              </span>
              <span className="mono-num text-[10px] text-dim">{gap.toFixed(1)} mm</span>
            </div>
            <input
              type="range"
              min={0}
              max={8}
              step={0.1}
              value={gap}
              onChange={(e) => setGap(Number(e.target.value))}
              aria-label="Glass gap in millimetres"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="label-xs flex items-center gap-1">
                <Lightbulb size={9} /> Angle of incidence
              </span>
              <span className="mono-num text-[10px] text-dim">{angle}°</span>
            </div>
            <input
              type="range"
              min={5}
              max={75}
              step={1}
              value={angle}
              onChange={(e) => setAngle(Number(e.target.value))}
              aria-label="Angle of incidence"
            />
          </div>
        </div>
      </div>

      <div>
        <SectionLabel right={<Fingerprint size={11} className="text-faint" />}>Verdict</SectionLabel>
        <motion.div
          key={verdict.label}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border px-2.5 py-2"
          style={{
            borderColor: `color-mix(in srgb, ${verdict.tone} 45%, transparent)`,
            background: `color-mix(in srgb, ${verdict.tone} 12%, transparent)`,
          }}
        >
          <div className="font-mono text-[10px] font-bold tracking-wide" style={{ color: verdict.tone }}>
            {verdict.label}
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-dim">{verdict.note}</p>
        </motion.div>

        <div className="mt-3 space-y-1.5">
          <div className="text-[11px] font-semibold text-ink">The fingernail test</div>
          {[
            'Press your fingertip directly against the glass.',
            'You should see a small gap between your nail and its reflection — that gap is the glass thickness.',
            'If the reflection touches your finger with zero offset, the reflective coating is on the front surface.',
            'Repeat at the centre and two corners — spy mirrors are often only glazed in one section.',
          ].map((s, i) => (
            <div key={s} className="flex items-start gap-1.5">
              <span className="mt-px grid h-4 w-4 shrink-0 place-items-center rounded border border-white/15 bg-white/5 font-mono text-[8px] text-dim">
                {i + 1}
              </span>
              <p className="text-[10px] leading-snug text-dim">{s}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-cyan-400/22 bg-cyan-400/[0.07] px-2 py-1.5">
          <Info size={10} className="mt-0.5 shrink-0 text-cyan-300" />
          <p className="text-[9px] leading-snug text-cyan-100/80">
            A dark room behind the mirror is the other tell: cup your hands around your eyes and look
            for a faint room glow through the glass. The optical scanner&apos;s mirror fixture can
            verify the refraction gap numerically.
          </p>
        </div>

        <button
          onClick={() => {
            dispatch({ type: 'module', module: 'optical' });
            dispatch({ type: 'modal', modal: null });
            toast({ title: 'Mirror scene loaded', detail: 'Sweep the glass with the high-pass shader', tone: 'info' });
          }}
          className="btn btn-accent mt-2.5 w-full !py-2 text-[11px]"
        >
          <GlassWater size={12} /> Open Optical Mirror Scan
        </button>
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
