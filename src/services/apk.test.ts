import { afterEach, describe, expect, it, vi } from 'vitest';
import { APK_FILENAME, APK_PATH, downloadApk } from './apk';

const realCreate = URL.createObjectURL;

function stubAnchorClicks() {
  const clicked: string[] = [];
  const orig = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function patched(this: HTMLAnchorElement) {
    clicked.push(this.getAttribute('href') ?? '');
  };
  return { clicked, restore: () => (HTMLAnchorElement.prototype.click = orig) };
}

afterEach(() => {
  URL.createObjectURL = realCreate;
  vi.restoreAllMocks();
});

describe('downloadApk', () => {
  it('serves the real artifact when the release file exists', async () => {
    const { clicked, restore } = stubAnchorClicks();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', {
        status: 200,
        headers: { 'content-type': 'application/vnd.android.package-archive' },
      }));

    const res = await downloadApk();
    expect(res).toEqual({ mode: 'release', ok: true });
    expect(clicked[0]).toBe(APK_PATH);

    restore();
    fetchSpy.mockRestore();
  });

  it('streams a fallback container when the server answers with SPA HTML', async () => {
    const { clicked, restore } = stubAnchorClicks();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('<html></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }));

    const res = await downloadApk();
    expect(res.mode).toBe('fallback');
    expect(res.ok).toBe(true);
    expect(clicked[0]).toMatch(/^blob:|^data:/);

    restore();
    fetchSpy.mockRestore();
  });

  it('does NOT throw when URL.createObjectURL is unavailable (older WebViews)', async () => {
    // Regression: this used to escape the try/catch and break the UI.
    // @ts-expect-error deliberately removing a platform API
    URL.createObjectURL = undefined;
    const { clicked, restore } = stubAnchorClicks();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('not found', { status: 404 }));

    const res = await downloadApk();
    expect(res.ok).toBe(true);
    expect(res.mode).toBe('fallback');
    // base64 data URL fallback, and it must carry the APK mime type
    expect(clicked[0]).toMatch(/^data:application\/vnd\.android\.package-archive;base64,/);
    expect(clicked[0].length).toBeGreaterThan(200);

    restore();
    fetchSpy.mockRestore();
  });

  it('returns ok:false instead of rejecting when the DOM write fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => {
      throw new Error('blocked');
    });
    const res = await downloadApk();
    expect(res.ok).toBe(false);
  });

  it('keeps the documented filename', () => {
    expect(APK_FILENAME).toBe('SpectraSweep-Privacy-v1.0.0.apk');
  });
});

describe('one-tap artifact link', () => {
  it('exposes the exact filename the header anchor downloads as', () => {
    // The header renders <a href={APK_PATH} download={APK_FILENAME}>, so these
    // two constants are the whole one-tap contract. If either drifts the
    // browser saves the file under a different name.
    expect(APK_PATH).toBe('/releases/spectrasweep-release.apk');
    expect(APK_FILENAME.endsWith('.apk')).toBe(true);
    expect(APK_FILENAME).toContain('v1.0.0');
  });
});
