import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * Instant SVG QR code, generated client-side (no network round trip).
 */
export function QrCode({
  value,
  size = 168,
  light = '#eef4ff',
  dark = '#06101a',
}: {
  value: string;
  size?: number;
  light?: string;
  dark?: string;
}) {
  const [svg, setSvg] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: size,
      color: { light, dark },
    })
      .then((s) => {
        if (!cancelled) setSvg(s);
      })
      .catch(() => {
        if (!cancelled) setSvg('');
      });
    return () => {
      cancelled = true;
    };
  }, [value, size, light, dark]);

  return (
    <div
      className="relative grid place-items-center overflow-hidden rounded-2xl bg-white/95 p-2"
      style={{ width: size + 16, height: size + 16 }}
    >
      {svg ? (
        <div
          style={{ width: size, height: size }}
          dangerouslySetInnerHTML={{ __html: svg }}
          aria-label={`QR code for ${value}`}
          role="img"
        />
      ) : (
        <div className="h-full w-full animate-pulse rounded-lg bg-slate-200" />
      )}
      <span className="pointer-events-none absolute inset-0 rounded-2xl border border-white/60" />
    </div>
  );
}
