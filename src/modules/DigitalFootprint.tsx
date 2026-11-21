import { AnimatePresence, motion } from 'framer-motion';
import {
  BadgeCheck,
  ChevronRight,
  CircleAlert,
  Copy,
  Download,
  Eye,
  Fingerprint,
  Globe,
  HardDriveDownload,
  Lock,
  Network,
  RefreshCw,
  Shield,
  ShieldCheck,
  ShieldHalf,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Glass, GlassInset, SectionLabel, Stat } from '../components/ui/Glass';
import { requestPersistentStorage, runPrivacyAudit } from '../services/privacyAudit';
import { useApp } from '../state/store';
import type { PrivacyFinding, PrivacyReport } from '../types';

export function DigitalFootprint() {
  const { state, dispatch, toast, logEvent, can } = useApp();
  const [report, setReport] = useState<PrivacyReport | null>(null);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState('');
  const [selected, setSelected] = useState<PrivacyFinding | null>(null);
  const isDirector = can('director');

  const audit = useCallback(async () => {
    setRunning(true);
    setSelected(null);
    const stages = [
      'Harvesting ICE candidates…',
      'Probing STUN reflexivity…',
      'Rasterising canvas entropy…',
      'Fingerprinting audio stack…',
      'Enumerating hardware surface…',
      'Scoring hardening posture…',
    ];
    for (const s of stages) {
      setStage(s);
      await new Promise((r) => setTimeout(r, 210));
    }
    try {
      const r = await runPrivacyAudit();
      setReport(r);
      dispatch({ type: 'telemetry', key: 'privacyThreat', value: 100 - r.score });
      logEvent({
        kind: 'privacy',
        title: r.stunLeak ? 'WebRTC local IP leak confirmed' : 'Privacy posture audited',
        detail: r.stunLeak
          ? `Raw LAN address ${r.hostCandidate} was handed to an RTCPeerConnection without mDNS masking.`
          : `Hardening score ${r.score}/100 across ${r.findings.length} signals. ${r.findings.filter((f) => f.exposed).length} exposed vectors.`,
        severity: r.stunLeak ? 'critical' : r.score < 55 ? 'medium' : 'low',
        metric: `score ${r.score}/100`,
        source: 'audit',
      });
      toast({
        title: `Privacy score ${r.score}/100`,
        detail: r.stunLeak ? 'Local IP leak confirmed — remediate now' : 'Audit complete',
        tone: r.stunLeak ? 'danger' : r.score < 55 ? 'warn' : 'ok',
      });
    } catch {
      toast({ title: 'Audit failed', detail: 'Browser blocked the probe', tone: 'warn' });
    }
    setStage('');
    setRunning(false);
  }, [dispatch, logEvent, toast]);

  useEffect(() => {
    const t = setTimeout(() => void audit(), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exposed = report?.findings.filter((f) => f.exposed) ?? [];
  const score = report?.score ?? 0;
  const scoreTone = score >= 75 ? 'ok' : score >= 50 ? 'warn' : 'danger';
  const ScoreIcon = score >= 75 ? ShieldCheck : score >= 50 ? ShieldHalf : Shield;

  const exportJson = useCallback(() => {
    if (!report) return;
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), report }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spectra-privacy-audit-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Audit exported', detail: 'Raw telemetry JSON downloaded', tone: 'ok' });
  }, [report, toast]);

  const gauge = useMemo(() => Math.max(0, Math.min(100, score)), [score]);

  return (
    <div className="space-y-3">
      {/* control bar */}
      <Glass className="!p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg border border-white/15 bg-violet-400/10">
              <Fingerprint size={13} className="text-violet-300" />
            </span>
            <div>
              <div className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink">
                Digital Footprint & WebRTC Shield
              </div>
              <div className="text-[9.5px] text-faint">Live ICE leak probe · canvas/audio entropy · hardening score</div>
            </div>
          </div>
          <div className="flex-1" />
          <span className="chip">
            <Wifi size={9} /> {report ? 'PROBE COMPLETE' : 'READY'}
          </span>
          <button onClick={() => void audit()} disabled={running} className="btn btn-accent !py-1.5 text-[11px]">
            <RefreshCw size={13} className={running ? 'animate-spin' : ''} />
            {running ? 'Auditing…' : 'Re-run Audit'}
          </button>
          <button
            onClick={() =>
              isDirector ? exportJson() : dispatch({ type: 'modal', modal: { type: 'privileges' } })
            }
            disabled={!report}
            className="btn !py-1.5 text-[11px]"
            title={isDirector ? 'Download raw telemetry' : 'Requires COUNTER-INTEL DIRECTOR'}
          >
            {isDirector ? <Download size={13} /> : <Lock size={13} />} Export JSON
          </button>
        </div>
        {running && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-violet-400/25 bg-violet-400/[0.08] px-2.5 py-1.5">
            <motion.span
              className="h-1.5 w-1.5 rounded-full bg-violet-400"
              animate={{ opacity: [1, 0.2, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
            <span className="font-mono text-[10px] text-violet-200">{stage}</span>
          </div>
        )}
      </Glass>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
        <div className="space-y-3">
          {/* score hero */}
          <Glass tone={scoreTone === 'danger' ? 'danger' : scoreTone === 'warn' ? 'warn' : 'ok'} className="!p-3">
            <div className="grid gap-4 sm:grid-cols-[168px_minmax(0,1fr)]">
              <div className="relative mx-auto grid aspect-square w-[150px] place-items-center sm:w-[168px]">
                <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full -rotate-90">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="9" />
                  <motion.circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke={
                      scoreTone === 'danger' ? '#ef4444' : scoreTone === 'warn' ? '#f59e0b' : '#10b981'
                    }
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray={314}
                    initial={{ strokeDashoffset: 314 }}
                    animate={{ strokeDashoffset: 314 - (gauge / 100) * 314 }}
                    transition={{ duration: 1.1, ease: 'easeOut' }}
                    style={{ filter: 'drop-shadow(0 0 8px currentColor)' }}
                  />
                </svg>
                <div className="relative text-center">
                  <ScoreIcon
                    size={18}
                    className="mx-auto mb-0.5"
                    style={{ color: scoreTone === 'danger' ? 'var(--danger)' : scoreTone === 'warn' ? 'var(--warn)' : 'var(--accent)' }}
                  />
                  <div className="mono-num text-[34px] font-bold leading-none text-ink">{gauge}</div>
                  <div className="label-xs mt-0.5">/ 100</div>
                </div>
              </div>

              <div className="min-w-0">
                <SectionLabel right={<BadgeCheck size={12} className="text-faint" />}>
                  Privacy Hardening Score
                </SectionLabel>
                <div className="flex items-center gap-2">
                  <span className={`chip ${scoreTone === 'danger' ? 'chip-danger' : scoreTone === 'warn' ? 'chip-warn' : 'chip-live'}`}>
                    {score >= 75 ? 'HARDENED' : score >= 50 ? 'PARTIAL' : 'EXPOSED'}
                  </span>
                  <span className="font-mono text-[10px] text-faint">
                    {exposed.length}/{report?.findings.length ?? 0} vectors exposed
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-dim">
                  {score >= 75
                    ? 'Your browser is presenting a narrow, mostly-masked fingerprint. Keep the anti-fingerprinting profile enabled while travelling.'
                    : score >= 50
                      ? 'Several stable identifiers are readable by any script on this rental Wi-Fi. Remediate the red rows first — they survive cookie clearing.'
                      : 'Your device is highly identifiable and leaking a network address. Treat this network as hostile and close personal tabs before you log in.'}
                </p>

                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="Local IP" value={report?.stunLeak ? 'LEAK' : 'MASKED'} tone={report?.stunLeak ? 'danger' : 'ok'} />
                  <Stat label="Egress" value={report?.publicCandidate ? 'RESOLVED' : 'HIDDEN'} tone={report?.publicCandidate ? 'warn' : 'ok'} />
                  <Stat label="Entropy Vectors" value={exposed.length} tone={exposed.length > 4 ? 'danger' : exposed.length > 2 ? 'warn' : 'ok'} />
                  <Stat label="Probe Time" value={report ? new Date(report.gradedAt).toLocaleTimeString([], { hour12: false }) : '—'} />
                </div>
              </div>
            </div>
          </Glass>

          {/* findings */}
          <Glass className="!p-3">
            <SectionLabel right={<Network size={12} className="text-faint" />}>
              Exposure Matrix · select a row for remediation
            </SectionLabel>
            <div className="space-y-1.5">
              {!report && (
                <div className="py-8 text-center">
                  <motion.div
                    className="mx-auto h-9 w-9 rounded-full border-2 border-dashed border-white/20"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                  />
                  <p className="mt-2 font-mono text-[10px] text-faint">probing browser surface…</p>
                </div>
              )}
              {report?.findings.map((f) => {
                const active = selected?.id === f.id;
                const tone = f.risk >= 65 ? 'danger' : f.risk >= 35 ? 'warn' : 'ok';
                return (
                  <motion.button
                    key={f.id}
                    onClick={() => setSelected(active ? null : f)}
                    whileTap={{ scale: 0.995 }}
                    className={`w-full overflow-hidden rounded-xl border text-left transition-colors ${
                      active
                        ? 'border-violet-400/45 bg-violet-400/[0.1]'
                        : tone === 'danger'
                          ? 'border-rose-500/25 bg-rose-500/[0.05] hover:border-rose-500/45'
                          : tone === 'warn'
                            ? 'border-amber-500/22 bg-amber-500/[0.04] hover:border-amber-500/40'
                            : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 px-2.5 py-2">
                      <span
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border"
                        style={{
                          borderColor:
                            tone === 'danger'
                              ? 'rgba(239,68,68,0.4)'
                              : tone === 'warn'
                                ? 'rgba(245,158,11,0.35)'
                                : 'rgba(16,185,129,0.35)',
                          background:
                            tone === 'danger'
                              ? 'rgba(239,68,68,0.12)'
                              : tone === 'warn'
                                ? 'rgba(245,158,11,0.1)'
                                : 'rgba(16,185,129,0.1)',
                        }}
                      >
                        {f.exposed ? (
                          <Eye
                            size={11}
                            className={tone === 'danger' ? 'text-rose-400' : tone === 'warn' ? 'text-amber-400' : 'text-emerald-400'}
                          />
                        ) : (
                          <ShieldCheck size={11} className="text-emerald-400" />
                        )}
                      </span>
                      <span className="w-[132px] shrink-0 truncate text-[11px] font-semibold text-ink">
                        {f.label}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-dim">{f.value}</span>
                      <span className="hidden w-16 shrink-0 sm:block">
                        <span className="block h-1.5 overflow-hidden rounded-full bg-white/10">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${f.risk}%`,
                              background:
                                tone === 'danger' ? '#ef4444' : tone === 'warn' ? '#f59e0b' : '#10b981',
                            }}
                          />
                        </span>
                      </span>
                      <span
                        className="mono-num w-7 shrink-0 text-right text-[10px] font-semibold"
                        style={{
                          color: tone === 'danger' ? 'var(--danger)' : tone === 'warn' ? 'var(--warn)' : 'var(--accent)',
                        }}
                      >
                        {f.risk}
                      </span>
                      <ChevronRight
                        size={12}
                        className={`shrink-0 text-faint transition-transform ${active ? 'rotate-90' : ''}`}
                      />
                    </div>
                    <AnimatePresence initial={false}>
                      {active && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="border-t border-white/10 px-2.5 py-2">
                            <div className="label-xs mb-1">Technical read</div>
                            <p className="text-[10.5px] leading-relaxed text-dim">{f.detail}</p>
                            <div className="label-xs mb-1 mt-2">Remediation</div>
                            <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.07] px-2 py-1.5 text-[10.5px] leading-relaxed text-emerald-100/90">
                              {f.remediation}
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.button>
                );
              })}
            </div>
          </Glass>
        </div>

        {/* right rail */}
        <div className="space-y-3">
          <Glass tone={report?.stunLeak ? 'danger' : 'default'}>
            <SectionLabel right={<Network size={12} className="text-faint" />}>WebRTC Leak Forensics</SectionLabel>
            <div className="space-y-1.5">
              {[
                { label: 'Host candidate', value: report?.hostCandidate ?? '—', leak: !!report?.stunLeak },
                { label: 'mDNS mask', value: report?.mdnsCandidate ?? 'not applied', leak: false },
                { label: 'STUN reflexive', value: report?.publicCandidate ?? 'not resolved', leak: false },
              ].map((r) => (
                <div key={r.label} className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-black/25 px-2 py-1.5">
                  <span className="w-[92px] shrink-0 text-[9.5px] text-faint">{r.label}</span>
                  <span className={`truncate-mono flex-1 ${r.leak ? 'text-rose-300' : 'text-dim'}`}>{r.value}</span>
                  {r.leak && <CircleAlert size={10} className="shrink-0 text-rose-400" />}
                </div>
              ))}
            </div>
            <GlassInset className="mt-2 !p-2">
              <div className="flex items-start gap-1.5">
                {report?.stunLeak ? (
                  <WifiOff size={11} className="mt-0.5 shrink-0 text-rose-400" />
                ) : (
                  <Wifi size={11} className="mt-0.5 shrink-0 text-emerald-400" />
                )}
                <p className="text-[9.5px] leading-snug text-faint">
                  {report?.stunLeak
                    ? 'An RTCPeerConnection returned your raw LAN address. Every ad frame on this page could have done the same — block WebRTC for this origin.'
                    : 'Peer-connection probing did not yield a raw host address. Your LAN is not directly enumerable from this page.'}
                </p>
              </div>
            </GlassInset>
          </Glass>

          <Glass>
            <SectionLabel right={<Globe size={12} className="text-faint" />}>Rental Network Posture</SectionLabel>
            <div className="space-y-1.5">
              {[
                'Open a private window before logging into anything',
                'Prefer cellular tethering over rental Wi-Fi for banking',
                'Check the router label matches the listing photos',
                'Log out of streaming apps before checkout',
                'Clear site data after leaving the property',
              ].map((t, i) => (
                <div key={t} className="flex items-start gap-2">
                  <span className="mono-num mt-px shrink-0 text-[9px] font-bold text-[var(--accent)]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="text-[10px] leading-snug text-dim">{t}</span>
                </div>
              ))}
            </div>
          </Glass>

          <Glass>
            <SectionLabel right={<HardDriveDownload size={12} className="text-faint" />}>
              Storage & Export
            </SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={async () => {
                  const ok = await requestPersistentStorage();
                  toast({
                    title: ok ? 'Persistent storage granted' : 'Storage remains best-effort',
                    detail: ok ? 'Vault survives eviction pressure' : 'Browser declined persistence',
                    tone: ok ? 'ok' : 'warn',
                  });
                }}
                className="btn !py-1.5 text-[10px]"
              >
                <HardDriveDownload size={11} /> Persist
              </button>
              <button
                onClick={() => {
                  const text = report?.findings.map((f) => `${f.exposed ? '⚠' : '✓'} ${f.label}: ${f.value} (risk ${f.risk})`).join('\n') ?? '';
                  void navigator.clipboard?.writeText(text);
                  toast({ title: 'Findings copied', detail: 'Clipboard updated', tone: 'ok' });
                }}
                disabled={!report}
                className="btn !py-1.5 text-[10px]"
              >
                <Copy size={11} /> Copy
              </button>
            </div>
            <div className="mt-2 rounded-lg border border-white/[0.07] bg-black/25 px-2 py-1.5">
              <div className="flex items-center justify-between">
                <span className="label-xs">Vault auth tier</span>
                <span className="font-mono text-[9.5px] text-dim">
                  {state.role === 'director' ? 'DIRECTOR' : state.role === 'auditor' ? 'AUDITOR' : 'TRAVELER'}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="label-xs">JSON export</span>
                <span className={`font-mono text-[9.5px] ${isDirector ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {isDirector ? 'UNLOCKED' : 'DIRECTOR ONLY'}
                </span>
              </div>
            </div>
          </Glass>
        </div>
      </div>
    </div>
  );
}
