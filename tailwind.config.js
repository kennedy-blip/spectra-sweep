/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'SF Pro Display', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'ui-monospace', 'monospace'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: 'rgb(var(--ink) / <alpha-value>)',
        dim: 'rgb(var(--dim) / <alpha-value>)',
        faint: 'rgb(var(--faint) / <alpha-value>)',
        glass: 'rgb(var(--glass) / <alpha-value>)',
        ember: '#F59E0B',
        ultraviolet: '#8B5CF6',
        hotpink: '#EC4899',
        crimson: '#EF4444',
        thermal: '#F97316',
        cyber: '#06B6D4',
        emeraldx: '#10B981',
      },
      boxShadow: {
        prism: '0 18px 60px -22px rgba(0,0,0,.65)',
        spec: 'inset 0 1px 1px rgba(255,255,255,0.28)',
        glowTeal: '0 0 30px -6px rgba(16,185,129,.55)',
        glowRose: '0 0 34px -6px rgba(239,68,68,.6)',
      },
      transitionTimingFunction: {
        liquid: 'cubic-bezier(.22,1,.36,1)',
      },
    },
  },
  plugins: [],
};
