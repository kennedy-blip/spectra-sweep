export function SvgFilters() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        {/* Liquid gooey metaball filter for the navigation dock */}
        <filter id="gooey-metaball">
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>

        {/* Softer goo for the active indicator only */}
        <filter id="gooey-indicator">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4.5" result="b" />
          <feColorMatrix
            in="b"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
          />
        </filter>

        {/* Chromatic aberration for alert states */}
        <filter id="chroma-aberr">
          <feOffset in="SourceGraphic" dx="1.6" dy="0" result="r" />
          <feOffset in="SourceGraphic" dx="-1.6" dy="0" result="b" />
          <feColorMatrix
            in="r"
            type="matrix"
            values="0.9 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="rm"
          />
          <feColorMatrix
            in="b"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0.9 0 0  0 0 0 1 0"
            result="bm"
          />
          <feBlend in="SourceGraphic" in2="rm" mode="screen" result="m1" />
          <feBlend in="m1" in2="bm" mode="screen" />
        </filter>

        {/* Specular glow for lens reticles */}
        <filter id="specular-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.4" result="g" />
          <feMerge>
            <feMergeNode in="g" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Prism refraction sheen for modal chrome */}
        <linearGradient id="prism-sheen" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.5" />
          <stop offset="42%" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="68%" stopColor="#8b5cf6" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0.42" />
        </linearGradient>

        {/* Radial threat gauge gradient */}
        <radialGradient id="threat-core">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.85" />
          <stop offset="60%" stopColor="#f97316" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
        </radialGradient>

        {/* Ultrasonic waterfall gradient */}
        <linearGradient id="waterfall-heat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="34%" stopColor="#f59e0b" />
          <stop offset="62%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#0e7490" />
        </linearGradient>
      </defs>
    </svg>
  );
}
