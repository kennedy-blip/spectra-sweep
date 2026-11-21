import { describe, expect, it } from 'vitest';
import { OPTICAL_SCENES, PROC_H, PROC_W, detectGlints } from './opticalGlintEngine';

const W = PROC_W;
const H = PROC_H;

/** Builds a synthetic luma plane with a single round specular blob. */
function planeWithBlob(opts: {
  cx: number;
  cy: number;
  radius: number;
  level: number;
  background?: number;
}): Uint8ClampedArray {
  const plane = new Uint8ClampedArray(W * H);
  plane.fill(opts.background ?? 40);
  const { cx, cy, radius, level } = opts;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) plane[y * W + x] = level;
    }
  }
  return plane;
}

const CUTOFF = 150 + (1 - 0.55) * 92; // 191.4 at default sensitivity

describe('detectGlints — specular micro-cluster detector', () => {
  it('locks onto a tiny saturated round blob and reports its centroid', () => {
    const hit = detectGlints(planeWithBlob({ cx: 120, cy: 80, radius: 2, level: 255 }), CUTOFF);
    expect(hit).toHaveLength(1);
    expect(hit[0].x).toBeCloseTo(120 / W, 2);
    expect(hit[0].y).toBeCloseTo(80 / H, 2);
    // a quantised 5-px disc tops out just under 1.0 — still a strong specular return
    expect(hit[0].intensity).toBeGreaterThan(0.85);
    expect(hit[0].luma).toBe(255);
  });

  it('ignores an empty frame', () => {
    expect(detectGlints(new Uint8ClampedArray(W * H).fill(30), CUTOFF)).toHaveLength(0);
  });

  it('ignores a dim blob below the cutoff', () => {
    expect(detectGlints(planeWithBlob({ cx: 60, cy: 60, radius: 2, level: 120 }), CUTOFF)).toHaveLength(0);
  });

  it('rejects a large lamp highlight (area ceiling)', () => {
    // radius 14 → ~615 px, well past the 260-pixel pinhole ceiling
    expect(detectGlints(planeWithBlob({ cx: 200, cy: 120, radius: 14, level: 255 }), CUTOFF)).toHaveLength(0);
  });

  it('rejects a thin bright line (fill / aspect gate)', () => {
    const plane = new Uint8ClampedArray(W * H).fill(20);
    for (let x = 40; x < 160; x++) plane[100 * W + x] = 255;
    expect(detectGlints(plane, CUTOFF)).toHaveLength(0);
  });

  it('caps the result set at 12 candidates to protect the frame budget', () => {
    const plane = new Uint8ClampedArray(W * H).fill(20);
    let placed = 0;
    for (let gy = 0; gy < 4 && placed < 30; gy++) {
      for (let gx = 0; gx < 8 && placed < 30; gx++) {
        const cx = 30 + gx * 52;
        const cy = 30 + gy * 60;
        for (let y = -1; y <= 1; y++) {
          for (let x = -1; x <= 1; x++) plane[(cy + y) * W + (cx + x)] = 255;
        }
        placed++;
      }
    }
    const found = detectGlints(plane, CUTOFF);
    // 32 planted blobs, hard-capped at 12 by the frame-budget sort.
    expect(found.length).toBe(12);
  });

  it('is ordered by descending specular strength', () => {
    const plane = planeWithBlob({ cx: 90, cy: 90, radius: 2, level: 252 });
    // second, weaker blob elsewhere
    for (let y = 179; y <= 181; y++) for (let x = 299; x <= 301; x++) plane[y * W + x] = 232;
    const found = detectGlints(plane, CUTOFF);
    expect(found.length).toBe(2);
    expect(found[0].intensity).toBeGreaterThanOrEqual(found[1].intensity);
  });

  it('accepts a Float32Array luma plane (engine passes Uint8ClampedArray)', () => {
    const src = planeWithBlob({ cx: 40, cy: 40, radius: 2, level: 250 });
    const f = new Float32Array(src.length);
    for (let i = 0; i < src.length; i++) f[i] = src[i];
    expect(detectGlints(f, CUTOFF)).toHaveLength(1);
  });

  it('higher cutoff suppresses candidates a lower cutoff would find', () => {
    const plane = planeWithBlob({ cx: 200, cy: 60, radius: 2, level: 205 });
    expect(detectGlints(plane, 195)).toHaveLength(1);
    expect(detectGlints(plane, 225)).toHaveLength(0);
  });
});

describe('fixture catalogue', () => {
  it('exposes exactly the four documented scenes', () => {
    expect(OPTICAL_SCENES.map((s) => s.id)).toEqual(['smoke', 'clock', 'mirror', 'outlet']);
  });

  it('pinhole coordinates are inside the frame and sub-4px', () => {
    for (const s of OPTICAL_SCENES) {
      if (!s.pinhole) {
        expect(s.threat).toBe('clean');
        continue;
      }
      expect(s.pinhole.x).toBeGreaterThan(0.1);
      expect(s.pinhole.x).toBeLessThan(0.9);
      expect(s.pinhole.y).toBeGreaterThan(0.1);
      expect(s.pinhole.y).toBeLessThan(0.9);
      expect(s.pinhole.r).toBeGreaterThan(1);
      expect(s.pinhole.r).toBeLessThan(4);
    }
  });

  it('only the outlet is clean', () => {
    expect(OPTICAL_SCENES.filter((s) => s.threat === 'clean').map((s) => s.id)).toEqual(['outlet']);
  });
});
