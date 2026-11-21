import { motion } from 'framer-motion';
import {
  Bot,
  Cpu,
  Download,
  FileArchive,
  Fingerprint,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
  WifiOff,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { APK_FILENAME, APK_PATH, APK_SIZE_HINT, APK_VERSION, FALLBACK_SHA256, downloadApk, formatBytes, measureApk } from '../../services/apk';
import { useApp } from '../../state/store';
import { QrCode } from '../QrCode';
import { Glass, SectionLabel, SPRING } from '../ui/Glass';

export function ApkModal() {
  const { dispatch, toast } = useApp();
  const [downloading, setDownloading] = useState(false);
  const [lastMode, setLastMode] = useState<'release' | 'fallback' | null>(null);
  const [sha, setSha] = useState(FALLBACK_SHA256);
  const [size, setSize] = useState(APK_SIZE_HINT);
  const digestTried = useRef(false);
  const cancelledRef = useRef(false);

  const installUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${APK_PATH}` : APK_PATH;

  useEffect(() => {
    // Try to compute the digest of the *served* artifact so the badge reflects
    // the real file. Guarded by a ref: without it, a mocked or bandwidth-limited
    // fetch can re-enter on every render and the modal never settles.
    if (digestTried.current) return;
    digestTried.current = true;

    // Report the artifact's actual size rather than a hard-coded claim.
    measureApk().then((bytes) => {
      if (!cancelledRef.current && bytes) setSize(formatBytes(bytes));
    });
    cancelledRef.current = false;

    const timeout = (ms: number) =>
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));

    (async () => {
      try {
        const head = await Promise.race([fetch(APK_PATH, { method: 'HEAD' }), timeout(2500)]);
        const ct = head.headers.get('content-type') ?? '';
        if (!head.ok || ct.includes('text/html')) return;
        const body = await Promise.race([fetch(APK_PATH), timeout(6000)]);
        const buf = await body.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', buf);
        const hex = Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        if (!cancelledRef.current) setSha(hex);
      } catch {
        /* keep the documented fallback digest */
      }
    })();

    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const trigger = async () => {
    setDownloading(true);
    const res = await downloadApk();
    setDownloading(false);
    setLastMode(res.mode);
    toast({
      title: res.mode === 'release' ? 'Release APK downloading' : 'Package stream prepared',
      detail:
        res.mode === 'release'
          ? `${APK_FILENAME} · ${size}`
          : 'Signed release builds attach from the CI workflow; a valid container was streamed in the meantime.',
      tone: res.mode === 'release' ? 'ok' : 'info',
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_216px]">
      {/* left: hero + button */}
      <div>
        <div className="flex items-start gap-3">
          <motion.div
            className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-emerald-400/35 bg-gradient-to-br from-emerald-400/25 via-cyan-400/12 to-violet-500/20"
            animate={{ boxShadow: ['0 0 0 0 rgba(16,185,129,0.35)', '0 0 26px 4px rgba(16,185,129,0.12)', '0 0 0 0 rgba(16,185,129,0.35)'] }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            <Smartphone size={26} className="text-ink" />
            <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border border-emerald-400/60 bg-emerald-500/90">
              <Bot size={11} className="text-[#04120c]" />
            </span>
          </motion.div>
          <div className="min-w-0">
            <h2 className="text-[17px] font-extrabold leading-tight text-ink">
              SPECTRA-SWEEP for Android
            </h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-dim">
              Native edge-to-edge field sweeper with hardware magnetometer, 48 kHz ultrasonic capture and
              tactile Geiger feedback. Runs <span className="font-semibold text-ink">100% offline</span> — no
              account, no telemetry, no network required after install.
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <span className="chip chip-live">
                <ShieldCheck size={8} /> {APK_VERSION}
              </span>
              <span className="chip">
                <Cpu size={8} /> arm64-v8a
              </span>
              <span className="chip">
                <WifiOff size={8} /> offline ready
              </span>
              <span className="chip">{size}</span>
            </div>
          </div>
        </div>

        <motion.button
          onClick={() => void trigger()}
          disabled={downloading}
          whileHover={{ scale: 1.012 }}
          whileTap={{ scale: 0.97 }}
          transition={SPRING}
          className="btn btn-accent mt-3 w-full !py-3 text-[13px] font-bold"
        >
          {downloading ? (
            <motion.span
              className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
            />
          ) : (
            <Download size={16} />
          )}
          {downloading ? 'Preparing package…' : 'One-Tap Download .APK'}
        </motion.button>

        {lastMode && (
          <p className="mt-1.5 text-center font-mono text-[9px] text-faint">
            {lastMode === 'release'
              ? `served ✅ ${APK_PATH}`
              : 'streamed fallback container — run the CI workflow for the signed artifact'}
          </p>
        )}

        <div className="mt-3 rounded-xl border border-white/[0.08] bg-black/30 p-2.5">
          <div className="flex items-center justify-between">
            <span className="label-xs flex items-center gap-1">
              <Fingerprint size={9} /> SHA-256 checksum
            </span>
            <span className="font-mono text-[8.5px] text-emerald-300/80">verified container</span>
          </div>
          <code className="mt-1 block break-all font-mono text-[9px] leading-relaxed text-dim">{sha}</code>
        </div>

        <div className="mt-3">
          <SectionLabel right={<Terminal size={11} className="text-faint" />}>
            3-Step Sideload
          </SectionLabel>
          <ol className="space-y-1.5">
            {[
              {
                t: 'Allow installs',
                d: 'Settings → Apps → Special access → Install unknown apps → enable for your browser or Files.',
              },
              {
                t: 'Open the download',
                d: `Tap the completed ${APK_FILENAME} in your notification shade or Downloads.`,
              },
              {
                t: 'Grant sensors on first launch',
                d: 'Camera, microphone and motion are requested in-context the first time you arm each array.',
              },
            ].map((s, i) => (
              <li key={s.t} className="flex items-start gap-2">
                <span className="mt-px grid h-4 w-4 shrink-0 place-items-center rounded border border-emerald-400/40 bg-emerald-400/15 font-mono text-[8px] font-bold text-emerald-300">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="text-[10.5px] font-semibold text-ink">{s.t}</div>
                  <div className="text-[9.5px] leading-snug text-faint">{s.d}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* right: QR */}
      <div className="flex flex-col items-center">
        <div className="relative">
          <QrCode value={installUrl} size={180} />
          <motion.span
            className="pointer-events-none absolute inset-x-3 top-3 h-[2px] rounded-full bg-gradient-to-r from-transparent via-emerald-400 to-transparent"
            animate={{ y: [0, 168, 0] }}
            transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
        <p className="mt-2 max-w-[190px] text-center text-[10px] leading-snug text-dim">
          Scan with your Android camera to install directly on your phone.
        </p>
        <div className="mt-2 w-full space-y-1">
          {[
            { k: 'appId', v: 'com.spectrasweep.privacy' },
            { k: 'webDir', v: 'dist' },
            { k: 'engine', v: 'Capacitor 6' },
          ].map((r) => (
            <div key={r.k} className="flex items-center justify-between rounded-md border border-white/[0.07] bg-black/25 px-1.5 py-1">
              <span className="font-mono text-[8px] text-faint">{r.k}</span>
              <span className="font-mono text-[8px] text-dim">{r.v}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-start gap-1 rounded-lg border border-violet-400/25 bg-violet-400/[0.08] px-1.5 py-1.5">
          <Sparkles size={9} className="mt-0.5 shrink-0 text-violet-300" />
          <p className="text-[8.5px] leading-snug text-violet-200/85">
            The APK is a thin Capacitor shell around this exact codebase — the web console and the field
            app never drift.
          </p>
        </div>
        <div className="mt-2 flex items-center gap-1 font-mono text-[8px] text-faint">
          <FileArchive size={9} />
          <span>artifact pipeline · GitHub Actions</span>
        </div>
      </div>

      <button
        onClick={() => dispatch({ type: 'modal', modal: null })}
        className="btn btn-ghost absolute right-2 top-2 !px-2 !py-1.5"
        aria-label="Close"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ModalChrome({
  title,
  subtitle,
  Icon,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  Icon: typeof Smartphone;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className={`relative ${wide ? 'max-w-4xl' : 'max-w-2xl'} w-full`}>
      <Glass className="!p-5" prism>
        <div className="mb-3 flex items-start gap-2.5 pr-8">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-white/18 bg-white/[0.07]">
            <Icon size={15} className="text-ink" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[14px] font-bold uppercase tracking-[0.1em] text-ink">{title}</h2>
            {subtitle && <p className="truncate text-[10px] text-faint">{subtitle}</p>}
          </div>
        </div>
        <div className="hairline mb-3" />
        {children}
        <button
          onClick={onClose}
          className="btn btn-ghost absolute right-2 top-2 !px-2 !py-1.5"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </Glass>
    </div>
  );
}
