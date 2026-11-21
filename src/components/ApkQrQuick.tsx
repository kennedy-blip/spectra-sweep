import { AnimatePresence, motion } from 'framer-motion';
import { Download, QrCode as QrIcon, X } from 'lucide-react';
import { useState } from 'react';
import { APK_FILENAME, APK_PATH, downloadApk } from '../services/apk';
import { QrCode } from './QrCode';
import { SPRING } from './ui/Glass';

/**
 * One-tap APK hand-off.
 *
 * Primary action is a plain `<a download>` pointing straight at the published
 * artifact, so on a normal browser it is a single tap with zero JavaScript in
 * the path: no probe, no anchor synthesis, nothing to race. `downloadApk()` is
 * only used as the fallback for hosts that answer the release path with SPA
 * HTML (a dev server) or where `URL.createObjectURL` is missing.
 *
 * The QR is for the hotel-wifi case: the user is on a phone, the app is on a
 * laptop, and they need the package *on the phone*. Scanning beats typing a URL.
 */
export function ApkQrQuick() {
  const [showQr, setShowQr] = useState(false);
  const [busy, setBusy] = useState(false);

  const installUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${APK_PATH}` : APK_PATH;

  const handleFallback = async () => {
    setBusy(true);
    try {
      await downloadApk();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex items-center gap-1">
      {/* one tap -> the artifact itself */}
      <a
        href={APK_PATH}
        download={APK_FILENAME}
        onClick={(e) => {
          // If the link cannot do the job (SPA fallback serving HTML), step in.
          const target = e.currentTarget;
          if (target.getAttribute('data-blocked') === '1') {
            e.preventDefault();
            void handleFallback();
          }
        }}
        className="btn btn-accent !px-2.5 !py-1.5 text-[11px]"
        aria-label="Download Android APK"
      >
        <Download size={14} />
        <span className="hidden sm:inline">.APK</span>
      </a>

      {/* scan on the phone instead */}
      <button
        onClick={() => setShowQr((v) => !v)}
        className="btn !px-2 !py-1.5 text-[11px]"
        aria-label="Show APK download QR code"
        aria-expanded={showQr}
      >
        <QrIcon size={14} />
      </button>

      <AnimatePresence>
        {showQr && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={SPRING}
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-[228px] rounded-2xl border border-white/12 p-3"
            style={{
              background: 'rgba(8,12,20,0.94)',
              backdropFilter: 'blur(26px)',
              WebkitBackdropFilter: 'blur(26px)',
              boxShadow: '0 26px 70px -24px rgba(0,0,0,0.95)',
            }}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="label-xs">Scan to install</span>
              <button
                onClick={() => setShowQr(false)}
                aria-label="Close QR code"
                className="text-faint hover:text-ink"
              >
                <X size={12} />
              </button>
            </div>
            <div className="grid place-items-center rounded-xl bg-white/[0.06] p-2">
              <QrCode value={installUrl} size={180} />
            </div>
            <p className="mt-2 break-all font-mono text-[8.5px] leading-relaxed text-faint">
              {installUrl}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {busy && (
        <span className="absolute -left-1 -top-1 h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
      )}
    </div>
  );
}
