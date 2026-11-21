import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { useApp } from '../state/store';
import { SPRING } from './ui/Glass';
import { ApkModal, ModalChrome } from './modals/ApkModal';
import { ForensicModal } from './modals/ForensicModal';
import { MirrorGuide } from './modals/MirrorGuide';
import { PrivilegesModal } from './modals/PrivilegesModal';
import { Download, Fingerprint, GlassWater, ShieldAlert, Smartphone, X } from 'lucide-react';

export function ModalHost() {
  const { state, dispatch } = useApp();
  const modal = state.modal;
  const close = () => dispatch({ type: 'modal', modal: null });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modal) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal]);

  return (
    <AnimatePresence>
      {modal && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto p-3 pt-[7vh] sm:p-6 sm:pt-[8vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          role="dialog"
          aria-modal="true"
        >
          {/* depth push backdrop */}
          <motion.div
            className="fixed inset-0"
            style={{
              background:
                'radial-gradient(110% 80% at 50% 0%, rgba(6,12,20,0.55) 0%, rgba(2,5,10,0.86) 72%)',
              backdropFilter: 'blur(14px) saturate(130%)',
              WebkitBackdropFilter: 'blur(14px) saturate(130%)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          />

          <motion.div
            className="relative w-full"
            initial={{ opacity: 0, y: 26, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            transition={SPRING}
          >
            {modal.type === 'apk' && (
              <div className="relative mx-auto w-full max-w-3xl">
                <div className="glass prism-edge relative !p-5">
                  <div className="mb-3 flex items-center gap-2 pr-8">
                    <span className="grid h-8 w-8 place-items-center rounded-xl border border-white/18 bg-white/[0.07]">
                      <Smartphone size={15} className="text-ink" />
                    </span>
                    <div>
                      <h2 className="text-[14px] font-bold uppercase tracking-[0.1em] text-ink">
                        APK Distribution Center
                      </h2>
                      <p className="text-[10px] text-faint">One-tap install · no 404s · offline field sweep ready</p>
                    </div>
                  </div>
                  <div className="hairline mb-3" />
                  <ApkModal />
                </div>
              </div>
            )}

            {modal.type === 'privileges' && (
              <div className="relative mx-auto w-full max-w-3xl">
                <ModalChrome
                  title="Privileges & Sensor Permissions"
                  subtitle="Instant RBAC switching · live hardware telemetry · capability gates"
                  Icon={ShieldAlert}
                  onClose={close}
                >
                  <PrivilegesModal />
                </ModalChrome>
              </div>
            )}

            {modal.type === 'forensic' && (
              <div className="relative mx-auto w-full max-w-4xl">
                <ModalChrome
                  title="Forensic Threat Evidence"
                  subtitle="Captured telemetry · countermeasure protocol · local chain of custody"
                  Icon={Fingerprint}
                  wide
                  onClose={close}
                >
                  <ForensicModal eventId={modal.eventId} />
                </ModalChrome>
              </div>
            )}

            {modal.type === 'mirror-guide' && (
              <div className="relative mx-auto w-full max-w-3xl">
                <ModalChrome
                  title="Two-Way Mirror Refraction Calibrator"
                  subtitle="Angle of incidence · fingernail depth test · first vs second surface"
                  Icon={GlassWater}
                  onClose={close}
                >
                  <MirrorGuide />
                </ModalChrome>
              </div>
            )}

            {modal.type === 'vault-unlock' && (
              <div className="relative mx-auto w-full max-w-md">
                <ModalChrome title="Evidence Vault" subtitle="PIN required" Icon={Download} onClose={close}>
                  <p className="text-[11px] text-dim">Open the Safe-Room vault module to unseal the ledger.</p>
                  <button
                    onClick={() => {
                      dispatch({ type: 'module', module: 'vault' });
                      close();
                    }}
                    className="btn btn-accent mt-3 w-full !py-2 text-[11px]"
                  >
                    Go to Vault
                  </button>
                </ModalChrome>
              </div>
            )}

            <button
              onClick={close}
              className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-lg border border-white/15 bg-white/[0.07] text-dim transition-colors hover:text-ink"
              aria-label="Close modal"
            >
              <X size={13} />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ToastHost() {
  const { state, dispatch } = useApp();
  return (
    <div className="pointer-events-none fixed right-3 top-3 z-[80] flex w-[calc(100%-24px)] max-w-[340px] flex-col gap-2 sm:top-4 sm:right-4">
      <AnimatePresence>
        {state.toasts.slice(-4).map((t) => {
          const color =
            t.tone === 'danger' ? '#ef4444' : t.tone === 'warn' ? '#f59e0b' : t.tone === 'ok' ? '#10b981' : '#06b6d4';
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.94 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 30, scale: 0.95 }}
              transition={SPRING}
              className="glass prism-edge pointer-events-auto !rounded-2xl !p-0"
              style={{ borderColor: `color-mix(in srgb, ${color} 40%, transparent)` }}
            >
              <div className="flex items-start gap-2 p-2.5">
                <span
                  className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: color, boxShadow: `0 0 10px ${color}` }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11.5px] font-semibold text-ink">{t.title}</div>
                  {t.detail && (
                    <div className="mt-0.5 line-clamp-2 text-[9.5px] leading-snug text-faint">{t.detail}</div>
                  )}
                </div>
                <button
                  onClick={() => dispatch({ type: 'dismissToast', id: t.id })}
                  className="shrink-0 text-faint transition-colors hover:text-ink"
                  aria-label="Dismiss"
                >
                  <X size={11} />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
