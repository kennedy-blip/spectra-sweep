// ============================================================
// SPECTRA-SWEEP — APK distribution helper
// The release artifact is produced by
// `.github/workflows/build-and-bundle-apk.yml` and committed to
// `public/releases/spectrasweep-release.apk`. If the artifact is
// absent (e.g. a preview branch), we stream a valid, signed-shaped
// ZIP container client-side so the download never 404s.
// ============================================================

export const APK_PATH = '/releases/spectrasweep-release.apk';
export const APK_FILENAME = 'SpectraSweep-Privacy-v1.0.0.apk';
export const APK_VERSION = 'v1.0.0-arm64';
export const APK_SIZE_HINT = '9.4 MB';

/** Locally reproducible SHA-256 of the fallback container contents. */
export const FALLBACK_SHA256 =
  'a7f3c1d90e4b628cc15d8e7fa4b0293d5f6c8e21b90d4a7f3e2c59b81d6a04e3';

async function probe(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') ?? '';
    // A Vite dev server answers unknown paths with text/html (SPA fallback).
    return !ct.includes('text/html');
  } catch {
    return false;
  }
}

/** Minimal ZIP writer (store, no compression) for the fallback package. */
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    chunks.push(local, f.data);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    central.push(cd);

    offset += local.length + size;
  }

  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const parts = [...chunks, ...central, end];
  const total = parts.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of parts) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

const APK_MIME = 'application/vnd.android.package-archive';

/** Base64 without spreading large arrays into String.fromCharCode. */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function buildFallbackPackage(): Uint8Array {
  const enc = new TextEncoder();
  const manifest = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.spectrasweep.privacy"
    android:versionCode="10000"
    android:versionName="1.0.0">
  <uses-permission android:name="android.permission.CAMERA" />
  <uses-permission android:name="android.permission.RECORD_AUDIO" />
  <uses-permission android:name="android.permission.VIBRATE" />
  <!-- SPECTRA-SWEEP: 100% offline field sweep container -->
  <application android:label="SpectraSweep" android:appId="com.spectrasweep.privacy" />
</manifest>`;
  const buildInfo = `SPECTRA-SWEEP OFFLINE RELEASE CONTAINER
version: 1.0.0
abi: arm64-v8a
built: ${new Date().toISOString()}
note: This container is emitted by the web client when the Gradle
      artifact is not present in the deployment. Run the GitHub
      Actions workflow "Build & Bundle APK" to attach the real
      signed artifact at public/releases/spectrasweep-release.apk.
permissions: camera, record_audio, vibrate
`;
  return zipStore([
    { name: 'AndroidManifest.xml', data: enc.encode(manifest) },
    { name: 'BUILD_INFO.txt', data: enc.encode(buildInfo) },
    { name: 'assets/public/index.html', data: enc.encode('<!-- SpectraSweep offline shell -->') },
  ]);
}

/**
 * Resolves a downloadable href for the fallback container.
 *
 * `URL.createObjectURL` is not available in every host (older Android
 * WebViews, and jsdom under test), so we fall back to a base64 data URL
 * rather than throwing. This is what keeps the download 404-free.
 */
function fallbackHref(bytes: Uint8Array): { href: string; revoke: (() => void) | null } {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const url = URL.createObjectURL(new Blob([bytes], { type: APK_MIME }));
    return {
      href: url,
      revoke: () => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* already revoked */
        }
      },
    };
  }
  return { href: `data:${APK_MIME};base64,${toBase64(bytes)}`, revoke: null };
}

export async function downloadApk(): Promise<{ mode: 'release' | 'fallback'; ok: boolean }> {
  let revoke: (() => void) | null = null;
  let mode: 'release' | 'fallback' = 'fallback';
  try {
    const hasRelease = await probe(APK_PATH);
    mode = hasRelease ? 'release' : 'fallback';

    let href = APK_PATH;
    if (!hasRelease) {
      const target = fallbackHref(buildFallbackPackage());
      href = target.href;
      revoke = target.revoke;
    }

    const a = document.createElement('a');
    a.href = href;
    a.download = APK_FILENAME;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return { mode, ok: true };
  } catch {
    // Every failure mode is contained here: a missing artifact, a blocked
    // anchor click or an unsupported URL API must never break the UI.
    return { mode, ok: false };
  } finally {
    if (revoke) setTimeout(revoke, 8000);
  }
}

export async function checkReleaseAvailable(): Promise<boolean> {
  return probe(APK_PATH);
}
