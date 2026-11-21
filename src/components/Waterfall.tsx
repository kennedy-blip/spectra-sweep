import { useEffect, useRef } from 'react';

/**
 * Scrolling 15.0–22.5 kHz waterfall spectrogram.
 * Each animation frame shifts the accumulated column buffer left by one and
 * paints the newest FFT column on the right edge.
 */
export function Waterfall({
  bins,
  flagged,
  peakHz,
  active,
  height = 190,
}: {
  bins: Float32Array | null;
  flagged: { hz: number; db: number }[];
  peakHz: number;
  active: boolean;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<ImageData | null>(null);
  const lastPush = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      historyRef.current = null;
      ctx.fillStyle = '#04070c';
      ctx.fillRect(0, 0, w, h);
    }

    const now = performance.now();
    if (now - lastPush.current < 33) return; // cap at 30 columns/s
    lastPush.current = now;

    // shift left by 2 device px
    const shift = Math.max(1, Math.round(2 * dpr));
    if (historyRef.current) {
      ctx.putImageData(historyRef.current, -shift, 0);
      // clear the newly exposed strip on the right
      ctx.fillStyle = '#04070c';
      ctx.fillRect(w - shift, 0, shift, h);
    }

    const data = bins ?? new Float32Array(128);
    const cols = data.length;
    const colW = Math.max(1, Math.ceil(w / 160));
    const x0 = w - colW;

    for (let c = 0; c < cols; c++) {
      const v = active ? data[c] : 0;
      const yTop = h - v * h;
      // heat ramp: cyan → emerald → amber → red
      const hue = 168 - v * 168; // 168 (cyan) → 0 (red)
      const sat = 55 + v * 40;
      const light = 12 + v * 52;
      ctx.fillStyle = `hsl(${hue} ${sat}% ${light}%)`;
      const cw = Math.max(1, Math.round((x0 * c) / cols + colW / cols));
      const cx = Math.round((x0 * c) / cols);
      ctx.fillRect(cx, yTop, Math.max(cw, 1), h - yTop);
    }

    // flag line at 18 kHz
    const flagY = h - (0.32) * h;
    ctx.fillStyle = 'rgba(239,68,68,0.35)';
    ctx.fillRect(x0 - 2, flagY, colW + 2, Math.max(1, dpr));

    historyRef.current = ctx.getImageData(0, 0, w, h);
    void flagged;
    void peakHz;
  }, [bins, flagged, peakHz, active, height]);

  return (
    <canvas
      ref={canvasRef}
      className="block w-full rounded-xl"
      style={{ height, background: '#04070c' }}
    />
  );
}

/** Real-time FFT line plot for the same band (mirror view). */
export function SpectrumTrace({
  bins,
  flagged,
  active,
  height = 120,
}: {
  bins: Float32Array | null;
  flagged: { hz: number; db: number }[];
  active: boolean;
  height?: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.clearRect(0, 0, w, h);

    // grid
    ctx.strokeStyle = 'rgba(148,163,184,0.1)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo((w * i) / 5, 0);
      ctx.lineTo((w * i) / 5, h);
      ctx.stroke();
    }
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (h * i) / 4);
      ctx.lineTo(w, (h * i) / 4);
      ctx.stroke();
    }

    // 18 kHz flag line
    const flagX = w * ((18000 - 15000) / (22500 - 15000));
    ctx.strokeStyle = 'rgba(239,68,68,0.45)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(flagX, 0);
    ctx.lineTo(flagX, h);
    ctx.stroke();
    ctx.setLineDash([]);

    const data = bins ?? new Float32Array(128);
    const n = data.length;

    // fill
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(16,185,129,0.42)');
    grad.addColorStop(1, 'rgba(6,182,212,0.02)');
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < n; i++) {
      const v = active ? data[i] : 0.03;
      ctx.lineTo((i / (n - 1)) * w, h - v * h * 0.95);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // trace
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const v = active ? data[i] : 0.03;
      const x = (i / (n - 1)) * w;
      const y = h - v * h * 0.95;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = active ? '#34d399' : 'rgba(148,163,184,0.4)';
    ctx.lineWidth = 1.6 * dpr;
    ctx.shadowColor = '#10b981';
    ctx.shadowBlur = active ? 10 : 0;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // flagged markers
    for (const f of flagged) {
      const x = ((f.hz - 15000) / (22500 - 15000)) * w;
      ctx.fillStyle = 'rgba(239,68,68,0.9)';
      ctx.beginPath();
      ctx.arc(x, h * 0.14, 3 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(239,68,68,0.5)';
      ctx.beginPath();
      ctx.moveTo(x, h * 0.14);
      ctx.lineTo(x, h * 0.3);
      ctx.stroke();
    }
  }, [bins, flagged, active, height]);

  return <canvas ref={ref} className="block w-full" style={{ height }} />;
}
