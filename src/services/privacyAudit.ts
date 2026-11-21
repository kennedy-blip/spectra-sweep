// ============================================================
// SPECTRA-SWEEP — Digital Footprint & WebRTC Shield
// Real client-side privacy audit:
//   · RTCPeerConnection ICE candidate harvesting (localhost/STUN leak)
//   · Canvas / WebGL / AudioContext fingerprint entropy
//   · Hardware + permission surface exposure
//   · 0–100 hardening score with remediation steps
// ============================================================

import type { PrivacyFinding, PrivacyReport } from '../types';

const isLocalIp = (ip: string) =>
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|127\.|fe80:|fc|fd)/i.test(ip);

export async function harvestIceCandidates(timeoutMs = 2400): Promise<{
  host: string | null;
  mdns: string | null;
  srflx: string | null;
  total: number;
  unsupported: boolean;
}> {
  if (typeof RTCPeerConnection === 'undefined') {
    return { host: null, mdns: null, srflx: null, total: 0, unsupported: true };
  }
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  });
  const found = { host: null as string | null, mdns: null as string | null, srflx: null as string | null, count: 0 };

  const parse = (cand: string) => {
    // candidate:foundation component transport priority address port typ type ...
    const parts = cand.split(' ');
    const addr = parts[4];
    const typIdx = parts.indexOf('typ');
    const typ = typIdx >= 0 ? parts[typIdx + 1] : '';
    if (!addr) return;
    if (typ === 'srflx' || typ === 'relay') {
      if (!found.srflx) found.srflx = addr;
    } else if (/\.local$/i.test(addr)) {
      if (!found.mdns) found.mdns = addr;
    } else if (isLocalIp(addr)) {
      if (!found.host) found.host = addr;
    } else if (!found.srflx) {
      found.srflx = addr;
    }
  };

  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    pc.onicecandidate = (e) => {
      if (!e.candidate) return done();
      found.count++;
      parse(e.candidate.candidate);
    };
    try {
      const dc = pc.createDataChannel('probe');
      void dc;
      pc.createOffer()
        .then((o) => pc.setLocalDescription(o))
        .catch(() => done());
    } catch {
      done();
    }
    setTimeout(done, timeoutMs);
  });

  pc.close();
  return {
    host: found.host,
    mdns: found.mdns,
    srflx: found.srflx,
    total: found.count,
    unsupported: false,
  };
}

/** 64-bit string hash (two 32-bit FNV lanes) for entropy reporting. */
function hash64(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = (Math.imul(h2 + c, 2246822519) ^ (h2 >>> 13)) >>> 0;
  }
  const a = h1.toString(16).padStart(8, '0');
  const b = h2.toString(16).padStart(8, '0');
  return (a + b).slice(0, 16);
}

function canvasHash(): string {
  try {
    const c = document.createElement('canvas');
    c.width = 260;
    c.height = 60;
    const ctx = c.getContext('2d');
    if (!ctx) return '';
    ctx.textBaseline = 'top';
    ctx.font = '16px "Arial"';
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 260, 60);
    ctx.fillStyle = '#069';
    ctx.fillText('SPECTRA-SWEEP 🛡 0123456789', 8, 8);
    ctx.fillStyle = 'rgba(102,204,0,0.7)';
    ctx.fillText('fingerprint entropy probe', 8, 30);
    ctx.beginPath();
    ctx.arc(210, 30, 18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,0,80,0.55)';
    ctx.fill();
    ctx.strokeStyle = '#0af';
    ctx.lineWidth = 2;
    ctx.stroke();
    return hash64(c.toDataURL());
  } catch {
    return '';
  }
}

function webglInfo(): { renderer: string; vendor: string } {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl') ||
      c.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return { renderer: 'unavailable', vendor: 'unavailable' };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer:
        (dbg && (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string)) ||
        gl.getParameter(gl.RENDERER) ||
        'masked',
      vendor:
        (dbg && (gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) as string)) ||
        gl.getParameter(gl.VENDOR) ||
        'masked',
    };
  } catch {
    return { renderer: 'blocked', vendor: 'blocked' };
  }
}

async function audioHash(): Promise<string> {
  try {
    const AC: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return '';
    const ctx = new AC({ sampleRate: 48000 });
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 10000;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -50;
    comp.knee.value = 40;
    comp.ratio.value = 12;
    comp.attack.value = 0;
    comp.release.value = 0.25;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    osc.connect(comp).connect(gain).connect(analyser).connect(ctx.destination);
    osc.start();
    await new Promise((r) => setTimeout(r, 60));
    const buf = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(buf);
    osc.stop();
    void ctx.close();
    const s = Array.from(buf.slice(0, 64))
      .map((v) => v.toFixed(3))
      .join(',');
    return hash64(s);
  } catch {
    return '';
  }
}

export async function runPrivacyAudit(): Promise<PrivacyReport> {
  const findings: PrivacyFinding[] = [];

  // ---- WebRTC ----
  const ice = await harvestIceCandidates();
  const webrtcLeak = !!ice.host && !ice.mdns;
  findings.push({
    id: 'webrtc',
    label: 'WebRTC Local IP Leak',
    value: ice.unsupported
      ? 'RTCPeerConnection blocked'
      : webrtcLeak
        ? ice.host!
        : ice.mdns
          ? `mDNS-masked (${ice.mdns})`
          : ice.srflx
            ? `STUN only (${ice.srflx})`
            : 'No candidates leaked',
    risk: ice.unsupported ? 0 : webrtcLeak ? 92 : ice.mdns ? 12 : 22,
    exposed: webrtcLeak,
    remediation:
      'Disable WebRTC or force mDNS candidate obfuscation. In Firefox set media.peerconnection.ice.obfuscate_host_addresses=true; in Chrome use an extension or a VPN with WebRTC protection.',
    detail: webrtcLeak
      ? 'Your browser handed a raw private LAN address to a peer connection object — any page can repeat this and geolocate your network.'
      : 'Host candidates are masked behind an mDNS .local name, so the LAN address is not directly exposed.',
  });

  // ---- Public egress ----
  const srflx = ice.srflx;
  findings.push({
    id: 'stun',
    label: 'Public Egress (STUN)',
    value: srflx ?? 'Not resolved',
    risk: srflx ? 34 : 0,
    exposed: !!srflx,
    remediation:
      'A STUN-reflexive address reveals your real egress IP even behind a VPN if the tunnel leaks. Test with your VPN enabled and confirm the address changes.',
    detail: srflx
      ? 'Your public egress address is resolvable by unauthenticated STUN — this is expected but confirms the network path.'
      : 'No STUN-reflexive candidate returned; egress address is not resolvable via WebRTC.',
  });

  // ---- Canvas ----
  const cHash = canvasHash();
  findings.push({
    id: 'canvas',
    label: 'Canvas Fingerprint',
    value: cHash ? `#${cHash.slice(0, 10)}` : 'blocked',
    risk: cHash ? 82 : 8,
    exposed: !!cHash,
    remediation:
      'Enable fingerprint randomisation (Firefox resistFingerprinting, Brave Shields "Strict", or Tor Browser). A stable canvas hash links every site you visit.',
    detail: cHash
      ? 'Your GPU rasteriser produced a deterministic texture hash. This is one of the strongest cross-site identifiers available to scripts.'
      : 'Canvas readback returned noise or was blocked — good.',
  });

  // ---- WebGL ----
  const gl = webglInfo();
  const glExposed = gl.renderer !== 'unavailable' && gl.renderer !== 'blocked' && gl.renderer !== 'masked';
  findings.push({
    id: 'webgl',
    label: 'WebGL Renderer',
    value: glExposed ? gl.renderer : gl.renderer,
    risk: glExposed ? 74 : 14,
    exposed: glExposed,
    remediation:
      'Disable WebGL debug-renderer-info or use a browser that masks it. The exact GPU string narrows your device model to a handful of units.',
    detail: glExposed
      ? `Vendor "${gl.vendor}" reports an unmasked GPU identity — a high-entropy hardware tell.`
      : 'GPU identity is masked or WebGL is unavailable.',
  });

  // ---- Audio ----
  const aHash = await audioHash();
  findings.push({
    id: 'audio',
    label: 'AudioContext Fingerprint',
    value: aHash ? `#${aHash.slice(0, 10)}` : 'blocked',
    risk: aHash ? 66 : 8,
    exposed: !!aHash,
    remediation:
      'Audio fingerprinting is defeated by resistFingerprinting or by denying AudioContext until a user gesture. It survives cookie clearing.',
    detail: aHash
      ? 'DynamicsCompressor output sampled identically across sessions — a device-level audio stack signature.'
      : 'Audio graph did not produce a stable signature.',
  });

  // ---- Hardware surface ----
  const hw: string[] = [];
  if (navigator.hardwareConcurrency) hw.push(`${navigator.hardwareConcurrency} cores`);
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (nav.deviceMemory) hw.push(`${nav.deviceMemory} GB RAM`);
  if (screen.width) hw.push(`${screen.width}×${screen.height}`);
  if (navigator.maxTouchPoints) hw.push(`${navigator.maxTouchPoints} touch`);
  const hwRisk = Math.min(88, hw.length * 17);
  findings.push({
    id: 'hardware',
    label: 'Hardware Surface',
    value: hw.join(' · ') || 'unavailable',
    risk: hwRisk,
    exposed: hw.length > 0,
    remediation:
      'Screen + core + memory combinations alone can single out ~1 in 1,500 devices. Reduce with a standardised browser profile or anti-fingerprinting build.',
    detail: 'Enumerated without any permission prompt — this data is free to every script on every page.',
  });

  // ---- Device sensors / APIs ----
  const sensors: string[] = [];
  if ('DeviceOrientationEvent' in window) sensors.push('orientation');
  if ('Magnetometer' in window) sensors.push('magnetometer');
  if ('BatteryManager' in navigator || 'getBattery' in navigator) sensors.push('battery');
  if ('bluetooth' in navigator) sensors.push('bluetooth');
  if ('usb' in navigator) sensors.push('usb');
  if ('serial' in navigator) sensors.push('serial');
  if ('credentials' in navigator) sensors.push('credentials');
  findings.push({
    id: 'sensors',
    label: 'Sensor / API Exposure',
    value: sensors.join(', ') || 'none',
    risk: Math.min(80, sensors.length * 11),
    exposed: sensors.length > 0,
    remediation:
      'Revoke WebUSB/WebSerial/WebBluetooth site permissions in chrome://settings/content. These APIs expand the attack surface far beyond a fingerprint.',
    detail: `${sensors.length} powerful platform APIs are visible to this origin without a permission prompt.`,
  });

  // ---- Timezone / locale ----
  let tz = 'unknown';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    /* noop */
  }
  findings.push({
    id: 'locale',
    label: 'Timezone & Locale',
    value: `${tz} · ${navigator.language}`,
    risk: 42,
    exposed: true,
    remediation:
      'Timezone is required for correct clocks, but combined with locale it narrows your region to a city-scale band. Pair with a VPN region that matches.',
    detail: 'Leaks your approximate geography with zero prompts — always cross-check with your VPN exit.',
  });

  // ---- Storage persistence ----
  let persisted = false;
  try {
    persisted = (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    /* noop */
  }
  findings.push({
    id: 'storage',
    label: 'Persistent Storage',
    value: persisted ? 'persisted (durable)' : 'best-effort',
    risk: 18,
    exposed: persisted,
    remediation:
      'Persistent storage is desirable for SPECTRA-SWEEP offline sweeps, but clear site data after checkout on a shared or rental device.',
    detail: persisted
      ? 'This origin holds eviction-proof storage — clear it before leaving a rental.'
      : 'Storage is evictable; the vault may be reclaimed under disk pressure.',
  });

  const weighted = findings.reduce((acc, f) => acc + f.risk, 0) / findings.length;
  const score = Math.max(0, Math.min(100, Math.round(100 - weighted * 0.86)));

  return {
    findings,
    score,
    gradedAt: Date.now(),
    stunLeak: webrtcLeak,
    hostCandidate: ice.host,
    mdnsCandidate: ice.mdns,
    publicCandidate: ice.srflx,
  };
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* noop */
  }
  return false;
}
