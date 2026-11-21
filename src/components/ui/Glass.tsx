import { motion, type HTMLMotionProps } from 'framer-motion';
import { forwardRef, type ReactNode } from 'react';
import { useSpecular } from '../../hooks/useSpecular';
import { useApp } from '../../state/store';

const SPRING = { type: 'spring', stiffness: 320, damping: 26, mass: 0.8 } as const;

interface GlassProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children: ReactNode;
  interactive?: boolean;
  prism?: boolean;
  specular?: boolean;
  padded?: boolean;
  tone?: 'default' | 'danger' | 'warn' | 'ok' | 'violet';
  className?: string;
}

const TONE_RING: Record<string, string> = {
  default: '',
  danger: 'shadow-[0_0_0_1px_rgba(239,68,68,0.35),0_0_44px_-14px_rgba(239,68,68,0.6)]',
  warn: 'shadow-[0_0_0_1px_rgba(245,158,11,0.32),0_0_44px_-16px_rgba(245,158,11,0.5)]',
  ok: 'shadow-[0_0_0_1px_rgba(16,185,129,0.3),0_0_44px_-16px_rgba(16,185,129,0.45)]',
  violet: 'shadow-[0_0_0_1px_rgba(139,92,246,0.32),0_0_44px_-16px_rgba(139,92,246,0.5)]',
};

export const Glass = forwardRef<HTMLDivElement, GlassProps>(function Glass(
  {
    children,
    interactive = false,
    prism = true,
    specular = true,
    padded = true,
    tone = 'default',
    className = '',
    ...rest
  },
  _ref,
) {
  const { state } = useApp();
  const specRef = useSpecular<HTMLDivElement>();
  const matte = state.lowGpu || state.theme === 'eco';

  return (
    <motion.div
      ref={specRef}
      className={[
        'relative overflow-hidden',
        matte ? 'glass glass-matte' : 'glass',
        prism ? 'prism-edge' : '',
        TONE_RING[tone],
        padded ? 'p-5' : '',
        className,
      ].join(' ')}
      whileHover={
        interactive ? { scale: 1.015, y: -2, transition: SPRING } : undefined
      }
      whileTap={interactive ? { scale: 0.96, transition: SPRING } : undefined}
      transition={SPRING}
      {...rest}
    >
      {specular && !matte && <div className="specular" aria-hidden="true" />}
      <div className="relative z-[1]">{children}</div>
    </motion.div>
  );
});

export function GlassInset({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.07] bg-black/25 p-3 ${className}`}
      style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)' }}
    >
      {children}
    </div>
  );
}

export function SectionLabel({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="h-3 w-[2px] rounded-full bg-[var(--accent)]" />
        <span className="label-xs">{children}</span>
      </div>
      {right}
    </div>
  );
}

export function Stat({
  label,
  value,
  unit,
  tone = 'default',
  hint,
}: {
  label: string;
  value: string | number;
  unit?: string;
  tone?: 'default' | 'ok' | 'warn' | 'danger' | 'violet';
  hint?: string;
}) {
  const color =
    tone === 'danger'
      ? 'var(--danger)'
      : tone === 'warn'
        ? 'var(--warn)'
        : tone === 'ok'
          ? 'var(--accent)'
          : tone === 'violet'
            ? 'var(--violet)'
            : 'rgb(var(--ink))';
  return (
    <div className="min-w-0">
      <div className="label-xs mb-1 truncate">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="mono-num text-[19px] font-semibold leading-none" style={{ color }}>
          {value}
        </span>
        {unit && <span className="mono-num text-[10px] text-faint">{unit}</span>}
      </div>
      {hint && <div className="mt-1 truncate text-[10px] text-faint">{hint}</div>}
    </div>
  );
}

export { SPRING };
