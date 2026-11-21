# SPECTRA-SWEEP

**Optical hidden-camera glint scanner · 18–22 kHz ultrasonic spy-beacon interceptor & jammer · 3-axis EMF bug sweeper · travel privacy auditor.**

A counter-surveillance field console that turns any laptop browser or Android phone into a room-sweep instrument. Everything runs client-side: real sensor APIs, real DSP, real network-leak probing, and an offline-first IndexedDB evidence vault. No account, no server, no telemetry egress.

---

## What it actually measures

| Module | Real signal | Real algorithm |
| --- | --- | --- |
| **Optical Lens Finder** | `getUserMedia` video → `<canvas>` at 60 fps | Pre-shader luma plane → threshold → 8-connected component labelling → circularity / fill / aspect scoring → temporal association with a 5-frame lock hysteresis. Reticles are stamped on the display canvas with candidate IDs and normalised coordinates. |
| **Ultrasonic Shield** | 48 kHz `AudioContext`, `AnalyserNode` at `fftSize` 16384 (2.93 Hz bins) | Bins folded into 128 display columns across 15.0–22.5 kHz, narrowband local-maximum search above the 18.0 kHz flag line, ~1.4 s peak persistence. Jammer = resonator-synthesised band-limited noise → `BiquadFilterNode` high-pass at 18.5 kHz with a 2.4 s AM sweep. |
| **EMF Bug Sweeper** | `DeviceOrientation` absolute, or the Generic `Magnetometer` sensor when present | `B = √(Bx²+By²+Bz²)` against a 45 µT Earth baseline, 320-sample rolling window, watch/critical classification at 90 / 160 µT, Geiger click cadence scaling as `90 + (B−45)^1.65 × 0.55` ms. |
| **Digital Footprint** | `RTCPeerConnection` with a live STUN server, canvas/WebGL/AudioContext probes | ICE candidate parsing for host / mDNS / srflx classes, 64-bit FNV double-lane fingerprint digests, weighted 0–100 hardening score with per-finding remediation. |
| **Safe-Room Vault** | `IndexedDB` via Dexie | 12-point protocol with per-checkpoint status, sweep certificates, PIN-gated ledger, and an offline→online sync queue. |

Every module ships a **one-tap synthetic simulator** that drives the *same* code path as the hardware (real oscillators into the real analyser, real vectors into the real classifier), so the whole pipeline is demonstrable without granting a single permission.

## Themes

Stealth Obsidian (default) · Crimson Darkroom (infrared lens-finder, protects pupil dilation in dark rooms) · Traveler Daylight Frost (high-key alabaster glass) · Eco-Glass (drops `backdrop-filter` entirely for budget Android at a locked 60 fps).

## Roles

| Tier | Unlocks |
| --- | --- |
| **SOLO TRAVELER** | Optical scanner, ultrasonic detector, EMF sweeper, 12-point checklist |
| **SECURITY AUDITOR** | Active 18.5–21.5 kHz jammer, Red-Pass / High-Pass / Negative-Luma shaders, two-way mirror calibrator |
| **COUNTER-INTEL DIRECTOR** | WebRTC leak forensics lab, telemetry JSON export, PIN evidence vault, IndexedDB sync controller |

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # tsc -b && vite build
npm test             # 32 vitest specs (detector + engines + full UI flows)
npm run selftest     # node-side algorithm + APK container validation
```

## Android APK

`capacitor.config.ts` targets `com.spectrasweep.privacy` with `webDir: "dist"`. The GitHub Actions workflow `.github/workflows/build-and-bundle-apk.yml` builds the Vite bundle, syncs Capacitor, compiles via Gradle, zipaligns (and signs, when keystore secrets exist), then commits the artifact to `public/releases/spectrasweep-release.apk`.

If that artifact is absent — a fresh preview, for instance — the client probes with `HEAD`, detects the SPA HTML fallback, and streams a structurally valid `application/vnd.android.package-archive` ZIP container so the download never 404s. See [`public/releases/README.md`](public/releases/README.md).

```bash
npm run apk:build    # requires a local Android SDK + JDK 21
```

## Ethics & legal

The ultrasonic jammer and optical scanning are for **defending your own privacy in spaces you have lawfully rented or occupy**. Jamming is restricted or prohibited in some jurisdictions, and covert recording laws vary widely — check local law before use. Never sweep a space you do not have the right to inspect, and never direct active counter-measures at shared or public environments.
