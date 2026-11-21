// ============================================================
// SPECTRA-SWEEP — Optical Glint Engine
// 60fps specular retro-reflection detector for pinhole lenses.
//
// Pipeline per frame:
//   1. Composite source (live <video> or synthetic fixture) into an
//      off-screen buffer at 448×252 for cheap per-pixel math.
//   2. Apply the selected optical inspection shader in-place.
//   3. Threshold luma → connected-component labelling → circularity,
//      intensity and area scoring → temporal candidate tracking.
//   4. Blit to the display canvas and stamp automated target-lock
//      reticles with normalised coordinates.
// ============================================================

import type { GlintCandidate, OpticalScene, OpticalShader } from '../types';

/**
 * Global render-loop gate. The DSP engines own continuous requestAnimationFrame
 * loops; hosts that must stay idle (headless test environments, or a device
 * parked in ultra battery-saver) set this to false and still get every
 * pure computation, including on-demand sample processing.
 */
export const engineRuntime = { animationLoop: true };

export const PROC_W = 448;
export const PROC_H = 252;

export interface OpticalFrameStats {
  fps: number;
  meanLuma: number;
  peakLuma: number;
  candidates: GlintCandidate[];
  lockedCount: number;
  threatScore: number; // 0..100
  scanTimeMs: number;
}

export interface OpticalEngineConfig {
  shader: OpticalShader;
  sensitivity: number; // 0..1 (1 = most sensitive)
  detect: boolean;
  crosshair: boolean;
  strobe: boolean;
  scene: string | null; // null = live camera
}

export const OPTICAL_SCENES: OpticalScene[] = [
  {
    id: 'smoke',
    name: 'Airbnb Smoke Detector',
    fixture: 'Ceiling · Photoelectric Housing',
    pinhole: { x: 0.635, y: 0.415, r: 1.9 },
    threat: 'critical',
    note: '1.2 mm pinhole drilled beside the test button — lens retro-reflects at 96.4% specular.',
  },
  {
    id: 'clock',
    name: 'Bedside Digital Clock',
    fixture: 'Nightstand · IR Camera Behind Glass',
    pinhole: { x: 0.352, y: 0.512, r: 2.3 },
    threat: 'critical',
    note: 'Infrared emitter concealed in the bezel between the LED digits and the alarm switch.',
  },
  {
    id: 'mirror',
    name: 'Hotel Bathroom Mirror',
    fixture: 'Wall · Two-Way Refraction Test',
    pinhole: { x: 0.548, y: 0.388, r: 1.6 },
    threat: 'watch',
    note: 'Second-surface gap reads 4.1 mm — beyond the 3 mm standard-glass tolerance. Verify by nail test.',
  },
  {
    id: 'outlet',
    name: 'Clean Wall Outlet',
    fixture: 'Wall · Duplex Receptacle',
    pinhole: null,
    threat: 'clean',
    note: 'No specular micro-cluster above threshold. Fixture is nominal — no lens candidate.',
  },
];

interface Track {
  id: string;
  x: number;
  y: number;
  radius: number;
  intensity: number;
  luma: number;
  circularity: number;
  hits: number;
  lastSeen: number;
  locked: boolean;
}

/** Draws an animated synthetic room fixture into a 2D context. */
export function drawFixture(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sceneId: string,
  t: number,
): void {
  const drift = Math.sin(t * 0.00042) * 3.2;
  const driftY = Math.cos(t * 0.00035) * 2.4;
  ctx.save();
  ctx.translate(drift, driftY);

  // ---- ambient wall / surface ----
  const wall = ctx.createLinearGradient(0, 0, w, h);
  if (sceneId === 'mirror') {
    wall.addColorStop(0, '#20272f');
    wall.addColorStop(0.45, '#39434e');
    wall.addColorStop(1, '#151a20');
  } else if (sceneId === 'clock') {
    wall.addColorStop(0, '#0d1117');
    wall.addColorStop(1, '#1b2129');
  } else {
    wall.addColorStop(0, '#3a3f45');
    wall.addColorStop(0.5, '#4a5057');
    wall.addColorStop(1, '#262b31');
  }
  ctx.fillStyle = wall;
  ctx.fillRect(-20, -20, w + 40, h + 40);

  // faint wall texture
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 60; i++) {
    const px = ((i * 977) % w) + Math.sin(t * 0.0002 + i) * 2;
    const py = ((i * 613) % h) + Math.cos(t * 0.00017 + i) * 2;
    ctx.fillStyle = i % 3 === 0 ? '#ffffff' : '#000000';
    ctx.fillRect(px, py, 2, 1);
  }
  ctx.globalAlpha = 1;

  if (sceneId === 'smoke') {
    // ceiling haze
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, 0, w, h * 0.22);

    const cx = w * 0.5;
    const cy = h * 0.46;
    const R = h * 0.31;

    // housing shadow
    const shadow = ctx.createRadialGradient(cx, cy + R * 0.4, R * 0.2, cx, cy + R * 0.3, R * 1.35);
    shadow.addColorStop(0, 'rgba(0,0,0,0.55)');
    shadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(0, 0, w, h);

    // body
    const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.45, R * 0.1, cx, cy, R);
    body.addColorStop(0, '#f4f6f8');
    body.addColorStop(0.62, '#d6dade');
    body.addColorStop(1, '#9aa1a8');
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();

    // grille
    ctx.strokeStyle = 'rgba(120,128,136,0.7)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.62, a, a + 0.55);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.52, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(150,158,166,0.8)';
    ctx.stroke();

    // test button
    ctx.beginPath();
    ctx.arc(cx + R * 0.66, cy + R * 0.5, R * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = '#b9c0c6';
    ctx.fill();

    // red status LED (blinking)
    const ledOn = Math.sin(t * 0.0022) > 0.82;
    ctx.beginPath();
    ctx.arc(cx - R * 0.52, cy + R * 0.36, R * 0.055, 0, Math.PI * 2);
    ctx.fillStyle = ledOn ? '#ff5555' : '#5a1b1b';
    ctx.shadowColor = ledOn ? '#ff2222' : 'transparent';
    ctx.shadowBlur = ledOn ? 12 : 0;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  if (sceneId === 'clock') {
    // nightstand wood
    const table = ctx.createLinearGradient(0, h * 0.62, 0, h);
    table.addColorStop(0, '#4a3524');
    table.addColorStop(1, '#241a12');
    ctx.fillStyle = table;
    ctx.fillRect(0, h * 0.62, w, h * 0.38);

    const bx = w * 0.18;
    const by = h * 0.26;
    const bw = w * 0.5;
    const bh = h * 0.34;

    // body
    const bodyG = ctx.createLinearGradient(bx, by, bx, by + bh);
    bodyG.addColorStop(0, '#1a1d21');
    bodyG.addColorStop(0.5, '#0c0e11');
    bodyG.addColorStop(1, '#05070a');
    ctx.fillStyle = bodyG;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // LED digits
    ctx.fillStyle = '#ff2d3a';
    ctx.shadowColor = '#ff2d3a';
    ctx.shadowBlur = 10;
    ctx.font = `600 ${Math.round(bh * 0.6)}px "JetBrains Mono", monospace`;
    const mins = String(new Date().getMinutes()).padStart(2, '0');
    const hrs = String(new Date().getHours() % 12 || 12).padStart(2, '0');
    ctx.fillText(`${hrs}:${mins}`, bx + bw * 0.09, by + bh * 0.7);
    ctx.shadowBlur = 0;

    // bezel IR window (slightly recessed dark glass)
    ctx.fillStyle = 'rgba(10,12,16,0.92)';
    ctx.beginPath();
    ctx.roundRect(bx + bw * 0.34, by + bh * 0.42, bw * 0.06, bh * 0.16, 2);
    ctx.fill();
  }

  if (sceneId === 'mirror') {
    // tiled bathroom wall
    ctx.fillStyle = '#cfd6dd';
    const tw = w / 8;
    const th = h / 5;
    for (let yy = 0; yy < 6; yy++) {
      for (let xx = 0; xx < 9; xx++) {
        const g = 205 + ((xx * 7 + yy * 13) % 22);
        ctx.fillStyle = `rgb(${g},${g + 4},${g + 8})`;
        ctx.fillRect(xx * tw + 1.5, yy * th + 1.5, tw - 3, th - 3);
      }
    }

    // mirror frame
    const mx = w * 0.14;
    const my = h * 0.08;
    const mw = w * 0.72;
    const mh = h * 0.82;
    ctx.fillStyle = '#2b3238';
    ctx.beginPath();
    ctx.roundRect(mx - 8, my - 8, mw + 16, mh + 16, 10);
    ctx.fill();

    // mirrored surface
    const mg = ctx.createLinearGradient(mx, my, mx + mw, my + mh);
    mg.addColorStop(0, '#7f8b96');
    mg.addColorStop(0.42, '#aeb9c2');
    mg.addColorStop(0.5, '#93a0ab');
    mg.addColorStop(0.72, '#c3ccd4');
    mg.addColorStop(1, '#6d7883');
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.roundRect(mx, my, mw, mh, 6);
    ctx.fill();

    // reflected room smear
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#e8eef3';
    ctx.beginPath();
    ctx.ellipse(mx + mw * 0.3, my + mh * 0.7, mw * 0.22, mh * 0.3, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (sceneId === 'outlet') {
    // wall panel seams
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += w / 6) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    const ox = w * 0.38;
    const oy = h * 0.28;
    const ow = w * 0.24;
    const oh = h * 0.44;

    const plate = ctx.createLinearGradient(ox, oy, ox + ow, oy + oh);
    plate.addColorStop(0, '#fbfcfd');
    plate.addColorStop(1, '#c8ced4');
    ctx.fillStyle = plate;
    ctx.beginPath();
    ctx.roundRect(ox, oy, ow, oh, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.stroke();

    for (let s = 0; s < 2; s++) {
      const sy = oy + oh * (0.28 + s * 0.44);
      ctx.fillStyle = '#8e969d';
      ctx.beginPath();
      ctx.roundRect(ox + ow * 0.32, sy - 7, 4, 9, 1.5);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(ox + ow * 0.6, sy - 7, 4, 9, 1.5);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ox + ow * 0.46, sy + 6, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#0d0f11';
      ctx.fill();
    }
  }

  // ---- the concealed pinhole lens: bright specular micro-cluster ----
  const scene = OPTICAL_SCENES.find((s) => s.id === sceneId);
  if (scene?.pinhole) {
    const px = w * scene.pinhole.x;
    const py = h * scene.pinhole.y;
    const r = scene.pinhole.r;
    const shimmer = 0.82 + Math.sin(t * 0.004) * 0.12 + Math.random() * 0.06;

    // lens coating bloom
    const bloom = ctx.createRadialGradient(px, py, 0, px, py, r * 6.5);
    bloom.addColorStop(0, `rgba(255,255,255,${0.9 * shimmer})`);
    bloom.addColorStop(0.25, `rgba(200,235,255,${0.35 * shimmer})`);
    bloom.addColorStop(1, 'rgba(120,180,255,0)');
    ctx.fillStyle = bloom;
    ctx.beginPath();
    ctx.arc(px, py, r * 6.5, 0, Math.PI * 2);
    ctx.fill();

    // saturated core (>96% luma)
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, 0.94 * shimmer)})`;
    ctx.fill();

    // chromatic fringe of coated optics
    ctx.beginPath();
    ctx.arc(px - r * 0.3, py - r * 0.3, r * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,250,235,0.9)';
    ctx.fill();
  }

  // global vignette for realism
  const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 1.02);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(-20, -20, w + 40, h + 40);
  ctx.restore();
}

/**
 * Pure specular micro-cluster detector.
 *
 * Thresholds a pre-shader luma plane, labels 8-connected components, then keeps
 * only those whose shape and intensity are consistent with a coated pinhole lens
 * retro-reflection: tiny, near-fully-filled, round-ish, and saturated above the
 * cutoff. Sorting caps the result so a frame never blows the budget.
 */
export function detectGlints(
  luma: Uint8ClampedArray | Float32Array,
  cutoff: number,
  w = PROC_W,
  h = PROC_H,
): GlintCandidate[] {
  const mask = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    mask[p] = luma[p] >= cutoff ? 1 : 0;
  }

  const visited = new Uint8Array(w * h);
  const out: GlintCandidate[] = [];
  const stack: number[] = [];
  const thr = cutoff;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (!mask[idx] || visited[idx]) continue;

      // flood fill 8-connected
      stack.length = 0;
      stack.push(idx);
      visited[idx] = 1;
      let count = 0;
      let sx = 0;
      let sy = 0;
      let peak = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let perimeter = 0;

      while (stack.length) {
        const cur = stack.pop()!;
        const cx = cur % w;
        const cy = (cur - cx) / w;
        count++;
        sx += cx;
        sy += cy;
        const lv = luma[cur];
        if (lv > peak) peak = lv;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        let boundary = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const ni = ny * w + nx;
            if (mask[ni]) {
              if (!visited[ni]) {
                visited[ni] = 1;
                stack.push(ni);
              }
            } else {
              boundary = true;
            }
          }
        }
        if (boundary) perimeter++;
      }

      // a pinhole glint is a handful of pixels, never a lamp highlight
      if (count < 2 || count > 260) continue;
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      // A disc can only ever occupy π/4 ≈ 78.5% of its bounding box, and pixel
      // quantisation makes that far worse on 1–3 px clusters — a true 1.2 mm
      // pinhole glint. Normalising by the circle-packing ratio keeps tiny
      // candidates from being filtered out as "sparse", while still rejecting
      // rings, hollow shapes and scattered noise.
      const rawFill = count / (bw * bh);
      const fill = Math.min(1, rawFill / (Math.PI / 4));
      const circularity = Math.min(1, (4 * Math.PI * count) / Math.max(12, perimeter * perimeter));
      const aspect = Math.min(bw, bh) / Math.max(bw, bh);

      if (peak < thr + 4 || fill < 0.62 || aspect < 0.55) continue;
      if (circularity < 0.35 && fill < 0.9) continue;

      const intensity = Math.min(1, (peak / 255) * (0.7 + fill * 0.3));

      out.push({
        id: 'tmp',
        x: sx / count / w,
        y: sy / count / h,
        radius: (Math.max(bw, bh) / 2 / w) * 1.6,
        intensity,
        luma: peak,
        circularity: Math.max(circularity, rawFill * 0.6),
        age: 0,
        locked: false,
      });
    }
  }

  out.sort((a, b) => b.intensity + b.circularity - (a.intensity + a.circularity));
  return out.slice(0, 12);
}

export class OpticalGlintEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private buffer: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private video: HTMLVideoElement | null = null;
  private scene: string | null = null;

  private raf = 0;
  private running = false;
  private lastFrame = 0;
  private fpsAcc: number[] = [];
  private tracks = new Map<string, Track>();
  private trackSeq = 0;
  /** Pre-shader luma plane (1 byte per pixel) captured each frame. */
  private maskSource = new Uint8ClampedArray(PROC_W * PROC_H);

  private cfg: OpticalEngineConfig = {
    shader: 'highpass',
    sensitivity: 0.55,
    detect: true,
    crosshair: true,
    strobe: false,
    scene: null,
  };

  onStats?: (s: OpticalFrameStats) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;

    this.buffer = document.createElement('canvas');
    this.buffer.width = PROC_W;
    this.buffer.height = PROC_H;
    const bctx = this.buffer.getContext('2d', { willReadFrequently: true });
    if (!bctx) throw new Error('2D buffer unavailable');
    this.bctx = bctx;
  }

  configure(patch: Partial<OpticalEngineConfig>) {
    this.cfg = { ...this.cfg, ...patch };
  }

  attachVideo(video: HTMLVideoElement | null) {
    this.video = video;
    if (video) this.cfg.scene = null;
  }

  setScene(scene: string | null) {
    this.scene = scene;
    this.cfg.scene = scene;
    this.tracks.clear();
  }

  start() {
    if (!engineRuntime.animationLoop) return;
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      this.frame(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose() {
    this.stop();
    this.tracks.clear();
    this.video = null;
  }

  // ------------------------------------------------------------
  private frame(t: number) {
    const dt = Math.max(1, t - this.lastFrame);
    this.lastFrame = t;
    this.fpsAcc.push(1000 / dt);
    if (this.fpsAcc.length > 45) this.fpsAcc.shift();
    const fps = this.fpsAcc.reduce((a, b) => a + b, 0) / this.fpsAcc.length;

    const started = performance.now();
    const { shader, sensitivity, detect, scene } = this.cfg;
    void this.scene;

    // ---- 1. composite source ----
    this.bctx.save();
    this.bctx.clearRect(0, 0, PROC_W, PROC_H);
    const usingLive = !scene && this.video && this.video.readyState >= 2;
    if (usingLive && this.video) {
      const vw = this.video.videoWidth || PROC_W;
      const vh = this.video.videoHeight || PROC_H;
      this.bctx.fillStyle = '#000';
      this.bctx.fillRect(0, 0, PROC_W, PROC_H);
      this.drawCover(this.bctx, this.video, vw, vh, PROC_W, PROC_H);
    } else {
      drawFixture(this.bctx, PROC_W, PROC_H, scene ?? 'smoke', t);
    }
    this.bctx.restore();

    // ---- 2. shader + statistics ----
    const img = this.bctx.getImageData(0, 0, PROC_W, PROC_H);
    const d = img.data;
    const cutoff = 150 + (1 - sensitivity) * 92; // luma threshold
    let sumLuma = 0;
    let peak = 0;

    // Capture pre-shader luma once — the detector must always analyse the
    // raw optical signal, never the filtered view.
    const mask = this.maskSource;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      mask[p] = lum;
    }

    if (shader !== 'raw') {
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        sumLuma += luma;
        if (luma > peak) peak = luma;

        let nr = r;
        let ng = g;
        let nb = b;

        switch (shader) {
          case 'redpass': {
            // strip blue/green, amplify specular red channel
            const spec = Math.max(0, luma - cutoff) * 2.6;
            nr = Math.min(255, r * 0.35 + spec * 1.15);
            ng = g * 0.06 + spec * 0.12;
            nb = b * 0.06 + spec * 0.2;
            break;
          }
          case 'highpass': {
            // crush ambient, isolate >cutoff micro-clusters
            if (luma > cutoff) {
              const k = Math.min(1, (luma - cutoff) / (255 - cutoff));
              const boost = 0.35 + k * 0.65;
              nr = 40 + 215 * boost;
              ng = 250 * boost + 5;
              nb = 210 * boost + 25;
            } else {
              const g0 = luma * 0.16;
              nr = g0 * 0.5;
              ng = g0 * 0.95;
              nb = g0 * 0.85;
            }
            break;
          }
          case 'negative': {
            const k = Math.min(1, luma / 255);
            nr = 255 - r * 0.85 + k * 20;
            ng = 255 - g * 0.9;
            nb = 255 - b * 0.85;
            break;
          }
          case 'strobe': {
            const glow = luma > cutoff ? 1 : 0.25;
            nr = r * 0.5 + 40 * glow;
            ng = g * 0.55 + 60 * glow;
            nb = b * 0.6 + 70 * glow;
            break;
          }
          default:
            break;
        }

        d[i] = nr;
        d[i + 1] = ng;
        d[i + 2] = nb;
      }
    } else {
      for (let i = 0; i < d.length; i += 4) {
        const luma = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        sumLuma += luma;
        if (luma > peak) peak = luma;
      }
    }

    const meanLuma = sumLuma / (PROC_W * PROC_H);

    // ---- 3. detection on the pre-shader luma plane ----
    let candidates: GlintCandidate[] = [];
    if (detect) {
      candidates = this.detect(mask, cutoff, t);
    }

    // ---- 4. blit + chrome ----
    this.bctx.putImageData(img, 0, 0);
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    this.ctx.save();
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.drawImage(this.buffer, 0, 0, PROC_W, PROC_H, 0, 0, cw, ch);

    this.drawChrome(candidates, cw, ch, t);

    const lockedCount = candidates.filter((c) => c.locked).length;
    const threatScore = Math.min(
      100,
      Math.round(
        candidates.reduce(
          (acc, c) => acc + c.intensity * (c.locked ? 62 : 26) * Math.min(1.4, c.circularity + 0.35),
          0,
        ),
      ),
    );
    this.ctx.restore();

    const scanTimeMs = performance.now() - started;
    this.onStats?.({
      fps,
      meanLuma,
      peakLuma: peak,
      candidates,
      lockedCount,
      threatScore,
      scanTimeMs,
    });
  }

  private detect(luma: Uint8ClampedArray, cutoff: number, t: number): GlintCandidate[] {
    const top = detectGlints(luma, cutoff);

    // ---- temporal tracking ----
    const seen = new Set<string>();
    for (const c of top) {
      let best: Track | undefined;
      let bestDist = 0.045;
      for (const tr of this.tracks.values()) {
        if (seen.has(tr.id)) continue;
        const dist = Math.hypot(tr.x - c.x, tr.y - c.y);
        if (dist < bestDist) {
          bestDist = dist;
          best = tr;
        }
      }
      if (best) {
        best.x = best.x * 0.55 + c.x * 0.45;
        best.y = best.y * 0.55 + c.y * 0.45;
        best.radius = best.radius * 0.6 + c.radius * 0.4;
        best.intensity = best.intensity * 0.65 + c.intensity * 0.35;
        best.circularity = c.circularity;
        best.luma = c.luma;
        best.hits += 1;
        best.lastSeen = t;
        best.locked = best.hits >= 5;
        seen.add(best.id);
        c.id = best.id;
        c.age = best.hits;
        c.locked = best.locked;
        c.x = best.x;
        c.y = best.y;
      } else {
        const id = `GX-${(++this.trackSeq).toString().padStart(3, '0')}`;
        this.tracks.set(id, {
          id,
          x: c.x,
          y: c.y,
          radius: c.radius,
          intensity: c.intensity,
          luma: c.luma,
          circularity: c.circularity,
          hits: 1,
          lastSeen: t,
          locked: false,
        });
        c.id = id;
      }
    }

    // expire stale tracks
    for (const [id, tr] of this.tracks) {
      if (t - tr.lastSeen > 620) this.tracks.delete(id);
    }

    return top;
  }

  private drawCover(
    ctx: CanvasRenderingContext2D,
    src: HTMLVideoElement,
    sw: number,
    sh: number,
    dw: number,
    dh: number,
  ) {
    const sAsp = sw / sh;
    const dAsp = dw / dh;
    let rw = dw;
    let rh = dh;
    let rx = 0;
    let ry = 0;
    if (sAsp > dAsp) {
      rh = dh;
      rw = dh * sAsp;
      rx = (dw - rw) / 2;
    } else {
      rw = dw;
      rh = dw / sAsp;
      ry = (dh - rh) / 2;
    }
    ctx.drawImage(src, rx, ry, rw, rh);
  }

  private drawChrome(cands: GlintCandidate[], cw: number, ch: number, t: number) {
    const ctx = this.ctx;

    // subtle sensor scanlines
    ctx.save();
    ctx.globalAlpha = 0.09;
    ctx.fillStyle = '#000';
    for (let y = 0; y < ch; y += 3) ctx.fillRect(0, y, cw, 1);
    ctx.restore();

    // vignette
    const vg = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.25, cw / 2, ch / 2, ch * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, cw, ch);

    // scan bar
    const sy = ((t * 0.06) % (ch + 120)) - 60;
    const bar = ctx.createLinearGradient(0, sy - 50, 0, sy + 50);
    bar.addColorStop(0, 'rgba(16,185,129,0)');
    bar.addColorStop(0.5, 'rgba(16,185,129,0.16)');
    bar.addColorStop(1, 'rgba(16,185,129,0)');
    ctx.fillStyle = bar;
    ctx.fillRect(0, sy - 50, cw, 100);

    if (this.cfg.crosshair) {
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo((cw * i) / 4, 0);
        ctx.lineTo((cw * i) / 4, ch);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, (ch * i) / 4);
        ctx.lineTo(cw, (ch * i) / 4);
        ctx.stroke();
      }
    }

    // corner brackets
    const pad = Math.max(14, cw * 0.03);
    const len = Math.max(18, cw * 0.045);
    ctx.strokeStyle = 'rgba(16,185,129,0.65)';
    ctx.lineWidth = 2;
    const corners: [number, number, number, number][] = [
      [pad, pad, 1, 1],
      [cw - pad, pad, -1, 1],
      [pad, ch - pad, 1, -1],
      [cw - pad, ch - pad, -1, -1],
    ];
    for (const [x, y, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x + dx * len, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * len);
      ctx.stroke();
    }

    // reticles
    for (const c of cands) {
      const px = c.x * cw;
      const py = c.y * ch;
      const r = Math.max(16, c.radius * cw * 1.9);
      const col = c.locked ? '#ef4444' : '#f59e0b';

      if (c.locked) {
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(px, py, r * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.strokeStyle = col;
      ctx.lineWidth = 1.6;
      ctx.setLineDash(c.locked ? [] : [4, 5]);
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // tick marks
      for (let a = 0; a < 4; a++) {
        const ang = (a * Math.PI) / 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(ang) * r * 0.72, py + Math.sin(ang) * r * 0.72);
        ctx.lineTo(px + Math.cos(ang) * r * 1.18, py + Math.sin(ang) * r * 1.18);
        ctx.stroke();
      }

      // label
      const label = c.locked ? 'LENS GLINT LOCK' : 'CANDIDATE';
      ctx.font = '600 10px "JetBrains Mono", monospace';
      const textW = ctx.measureText(label).width;
      const bx = Math.min(cw - textW - 18, Math.max(6, px + r + 8));
      const by = Math.max(12, py - r - 16);
      ctx.fillStyle = 'rgba(4,8,14,0.82)';
      ctx.beginPath();
      ctx.roundRect(bx - 5, by - 10, textW + 10, 17, 4);
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.fillText(label, bx, by + 2);

      ctx.font = '500 9px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(226,244,255,0.85)';
      ctx.fillText(
        `${c.id} · ${(c.x * 100).toFixed(1)},${(c.y * 100).toFixed(1)} · ${Math.round(c.intensity * 100)}%`,
        bx,
        by + 15,
      );
    }
  }

}
