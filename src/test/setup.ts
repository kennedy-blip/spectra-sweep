// jsdom shims for APIs the app touches but jsdom does not implement.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';

class MockObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockObserver;
(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = MockObserver;

// canvas: every 2D context call is a no-op, getImageData returns a real buffer so
// the glint engine's per-pixel loop executes end-to-end.
const makeCtx = (canvas: HTMLCanvasElement) => {
  const gradient = { addColorStop: () => {} };
  return {
    canvas,
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    ellipse: () => {},
    roundRect: () => {},
    fill: () => {},
    stroke: () => {},
    clip: () => {},
    fillText: () => {},
    setLineDash: () => {},
    drawImage: () => {},
    putImageData: () => {},
    measureText: () => ({ width: 40 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
    imageSmoothingEnabled: true,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
  };
};

HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement, kind: string) {
  if (kind === '2d') return makeCtx(this) as unknown as CanvasRenderingContext2D;
  return null;
} as unknown as HTMLCanvasElement['getContext'];

HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,iVBORw0KGgo=';

// requestAnimationFrame is supported (framer-motion needs it to complete
// layout animations) but the DSP engines' continuous loops are switched off via
// `engineRuntime`, otherwise their per-frame setState starves `act()`.
import { engineRuntime } from '../services/opticalGlintEngine';
engineRuntime.animationLoop = false;

const makeMql = (query: string, matches: boolean) => ({
  matches,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
});

// NOTE: plain functions (not vi.fn) so `restoreMocks` cannot strip the
// implementation between tests.
window.matchMedia = ((query: string) => {
  const min = query.match(/min-width:\s*(\d+)px/);
  const max = query.match(/max-width:\s*(\d+)px/);
  let matches = false;
  if (min) matches = 1024 >= Number(min[1]);
  if (max) matches = 1024 <= Number(max[1]);
  if (query.includes('pointer: coarse')) matches = false;
  if (query.includes('prefers-reduced-motion')) matches = true;
  return makeMql(query, matches);
}) as typeof window.matchMedia;

if (!navigator.mediaDevices) {
  Object.defineProperty(navigator, 'mediaDevices', {
    writable: true,
    value: { getUserMedia: vi.fn() },
  });
}

if (!window.HTMLMediaElement.prototype.play) {
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
}
window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
window.HTMLMediaElement.prototype.pause = vi.fn();

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  // RTL's auto-cleanup runs on its own afterEach (registered after this hook),
  // so this must NOT unmount manually — doing so empties the DOM before RTL
  // records the container, which leaks a stale root into the next test.
  // reset every piece of global state the app writes outside React
  document.documentElement.dataset.theme = 'obsidian';
  document.documentElement.classList.remove('low-gpu');
  document.documentElement.style.removeProperty('--px');
  document.documentElement.style.removeProperty('--py');
  sessionStorage.clear();
});

// ---------------------------------------------------------------------------
// Web Audio stub — a complete-enough graph for the ultrasonic + EMF engines.
// ---------------------------------------------------------------------------
class StubParam {
  value = 0;
  setValueAtTime() {}
  setTargetAtTime() {}
  exponentialRampToValueAtTime() {}
  cancelScheduledValues() {}
  linearRampToValueAtTime() {}
}

const chainable = () => {
  const node: Record<string, unknown> = {};
  node.connect = () => node;
  node.disconnect = () => {};
  return node;
};

class StubAudioContext {
  state = 'running';
  sampleRate = 48000;
  currentTime = 0;
  destination = chainable();

  createAnalyser() {
    return {
      ...chainable(),
      fftSize: 16384,
      get frequencyBinCount() {
        return this.fftSize / 2;
      },
      smoothingTimeConstant: 0,
      minDecibels: -125,
      maxDecibels: -6,
      getFloatFrequencyData(arr: Float32Array) {
        arr.fill(-104);
      },
      getByteFrequencyData() {},
    };
  }
  createGain() {
    return { ...chainable(), gain: new StubParam() };
  }
  createOscillator() {
    return { ...chainable(), type: 'sine', frequency: new StubParam(), start() {}, stop() {} };
  }
  createBiquadFilter() {
    return { ...chainable(), type: 'highpass', frequency: new StubParam(), Q: new StubParam(), gain: new StubParam() };
  }
  createBufferSource() {
    return { ...chainable(), buffer: null, loop: false, playbackRate: new StubParam(), start() {}, stop() {} };
  }
  createBuffer(_channels: number, length: number) {
    return { length, getChannelData: () => new Float32Array(length) };
  }
  createMediaStreamSource() {
    return chainable();
  }
  createDynamicsCompressor() {
    return {
      ...chainable(),
      threshold: new StubParam(),
      knee: new StubParam(),
      ratio: new StubParam(),
      attack: new StubParam(),
      release: new StubParam(),
    };
  }
  createMediaStreamDestination() {
    return chainable();
  }
  resume() {
    return Promise.resolve();
  }
  suspend() {
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
}

(globalThis as unknown as { AudioContext: unknown }).AudioContext = StubAudioContext;
(window as unknown as { webkitAudioContext: unknown }).webkitAudioContext = StubAudioContext;

// WebRTC + sensor entries used by the privacy audit and EMF engine.
if (!('RTCPeerConnection' in globalThis)) {
  class StubPeerConnection {
    onicecandidate: ((e: { candidate: unknown }) => void) | null = null;
    createDataChannel() {
      return {};
    }
    createOffer() {
      return Promise.resolve({ type: 'offer', sdp: 'v=0' });
    }
    setLocalDescription() {
      return Promise.resolve();
    }
    close() {}
  }
  (globalThis as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = StubPeerConnection;
}

if (!('vibrate' in navigator)) {
  Object.defineProperty(navigator, 'vibrate', { writable: true, value: () => true });
}

if (!navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    writable: true,
    value: { writeText: () => Promise.resolve() },
  });
}

if (!globalThis.storage?.persisted) {
  Object.defineProperty(globalThis, 'storage', {
    writable: true,
    value: {
      persisted: () => Promise.resolve(false),
      persist: () => Promise.resolve(true),
    },
  });
}
