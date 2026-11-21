import { motion } from 'framer-motion';
import { useApp } from '../../state/store';

const PALETTES = {
  secure: [
    'radial-gradient(circle, rgba(16,185,129,0.75), rgba(16,185,129,0) 68%)',
    'radial-gradient(circle, rgba(6,182,212,0.7), rgba(6,182,212,0) 68%)',
    'radial-gradient(circle, rgba(30,64,175,0.6), rgba(30,64,175,0) 70%)',
    'radial-gradient(circle, rgba(139,92,246,0.45), rgba(139,92,246,0) 70%)',
  ],
  elevated: [
    'radial-gradient(circle, rgba(245,158,11,0.72), rgba(245,158,11,0) 68%)',
    'radial-gradient(circle, rgba(139,92,246,0.72), rgba(139,92,246,0) 68%)',
    'radial-gradient(circle, rgba(236,72,153,0.6), rgba(236,72,153,0) 70%)',
    'radial-gradient(circle, rgba(6,182,212,0.5), rgba(6,182,212,0) 70%)',
  ],
  critical: [
    'radial-gradient(circle, rgba(239,68,68,0.85), rgba(239,68,68,0) 66%)',
    'radial-gradient(circle, rgba(249,115,22,0.75), rgba(249,115,22,0) 68%)',
    'radial-gradient(circle, rgba(190,18,60,0.7), rgba(190,18,60,0) 70%)',
    'radial-gradient(circle, rgba(255,45,85,0.5), rgba(255,45,85,0) 70%)',
  ],
} as const;

const SUN = ['#10b981', '#06b6d4', '#1d4ed8', '#8b5cf6'];
const STORM = ['#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
const ALERT = ['#ef4444', '#f97316', '#be123c', '#ff2d55'];

export function MeshBackground() {
  const { state } = useApp();
  const level = state.threatLevel;
  const palette = PALETTES[level];
  const theme = state.theme;

  const blobPos = [
    { left: '-12%', top: '-18%', w: '62vw', h: '62vw' },
    { right: '-16%', top: '2%', w: '58vw', h: '58vw' },
    { left: '18%', bottom: '-24%', w: '66vw', h: '66vw' },
    { right: '4%', bottom: '-10%', w: '44vw', h: '44vw' },
  ];

  const accents = level === 'critical' ? ALERT : level === 'elevated' ? STORM : SUN;

  return (
    <div className="mesh-root" aria-hidden="true">
      <div className="mesh-grid" />
      {blobPos.map((p, i) => (
        <motion.div
          key={i}
          className={`mesh-blob ${['blob-a', 'blob-b', 'blob-c', 'blob-d'][i]}`}
          style={{
            ...p,
            background: palette[i],
            opacity: theme === 'daylight' ? 0.42 : undefined,
          }}
          animate={{
            backgroundColor: accents[i],
          }}
          transition={{ duration: 2.4, ease: 'easeInOut' }}
        />
      ))}

      {/* threat flash overlay on critical */}
      {level === 'critical' && (
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.06, 0.2, 0.06] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background:
              'radial-gradient(120% 90% at 50% 120%, rgba(239,68,68,0.55) 0%, transparent 62%)',
          }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(90% 60% at 50% -8%, transparent 0%, rgba(0,0,0,0.42) 100%)',
          opacity: theme === 'daylight' ? 0.15 : 1,
        }}
      />
    </div>
  );
}

export function NoiseOverlay() {
  return <div className="noise-layer" aria-hidden="true" />;
}
