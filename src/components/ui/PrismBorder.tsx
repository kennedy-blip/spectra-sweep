import type { ReactNode } from 'react';

/**
 * 1px diagonal prism border + inner specular top-edge illumination.
 * Uses a masked gradient ring so it renders crisply on any radius.
 */
export function PrismBorder({
  children,
  radius = 24,
  angle = '135deg',
  intensity = 1,
  className = '',
}: {
  children: ReactNode;
  radius?: number;
  angle?: string;
  intensity?: number;
  className?: string;
}) {
  return (
    <div
      className={`relative ${className}`}
      style={{ borderRadius: radius }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          borderRadius: radius,
          padding: 1,
          background: `linear-gradient(${angle}, rgba(16,185,129,${0.42 * intensity}) 0%, rgba(255,255,255,${0.3 * intensity}) 38%, rgba(255,255,255,${0.06 * intensity}) 58%, rgba(236,72,153,${0.3 * intensity}) 82%, rgba(239,68,68,${0.4 * intensity}) 100%)`,
          WebkitMask:
            'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          WebkitMaskComposite: 'xor',
          mask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          maskComposite: 'exclude',
        }}
      />
      {children}
    </div>
  );
}
