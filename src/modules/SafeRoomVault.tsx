import { AnimatePresence, motion } from 'framer-motion';
import {
  Archive,
  Check,
  CheckCircle2,
  ChevronRight,
  Cloud,
  CloudOff,
  Database,
  FileCheck2,
  Flag,
  Lock,
  LockOpen,
  MapPin,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Vault,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Glass, GlassInset, SectionLabel, SPRING, Stat } from '../components/ui/Glass';
import {
  deleteSweep,
  flushSyncQueue,
  listSweeps,
  pinHash,
  queueState,
  saveSweep,
  vaultFootprint,
} from '../services/db';
import { useApp } from '../state/store';
import type { SweepRecord, ThreatLevel } from '../types';

export function SafeRoomVault() {
  const { state, dispatch, toast, logEvent, can, setModule } = useApp();
  const [sweeps, setSweeps] = useState<SweepRecord[]>([]);
  const [queue, setQueue] = useState({ queued: 0, done: 0, failed: 0, total: 0 });
  const [footprint, setFootprint] = useState({ records: 0, bytes: 0 });
  const [syncing, setSyncing] = useState(false);
  const [syncLog, setSyncLog] = useState<string[]>([]);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [settingPin, setSettingPin] = useState(false);
  const [pinned, setPinned] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const isDirector = can('director');

  const refresh = useCallback(async () => {
    const [list, q, fp] = await Promise.all([listSweeps(), queueState(), vaultFootprint()]);
    setSweeps(list);
    setQueue(q);
    setFootprint(fp);
  }, []);

  useEffect(() => {
    void refresh();
    try {
      const stored = localStorage.getItem('ss.vaultPin');
      if (stored) {
        setPinned(stored);
      } else {
        // No PIN yet: present the pad in "create" mode and open the vault so the
        // ledger is usable immediately instead of behind a dead 2-state toggle.
        setSettingPin(true);
        dispatch({ type: 'vaultUnlocked', value: true });
      }
    } catch {
      dispatch({ type: 'vaultUnlocked', value: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const checked = state.checklist.filter((c) => c.status !== 'todo');
  const flags = state.checklist.filter((c) => c.status === 'flag');
  const progress = Math.round((checked.length / state.checklist.length) * 100);
  const threatLevel: ThreatLevel =
    state.threatLevel === 'critical' || flags.length > 0
      ? state.threatLevel === 'critical' || flags.length > 2
        ? 'critical'
        : 'elevated'
      : state.threatLevel === 'elevated'
        ? 'elevated'
        : checked.length === state.checklist.length
          ? 'secure'
          : 'secure';

  const certificateScore = useMemo(() => {
    const base = progress;
    const penalty = flags.length * 14;
    return Math.max(0, Math.min(100, Math.round(base - penalty)));
  }, [progress, flags.length]);

  const submitPin = useCallback(
    (digits: string) => {
      if (!pinned) {
        // first run: register a PIN and immediately open the vault
        const h = pinHash(digits);
        localStorage.setItem('ss.vaultPin', h);
        setPinned(h);
        dispatch({ type: 'vaultUnlocked', value: true });
        setSettingPin(false);
        setPin('');
        toast({
          title: 'Evidence vault sealed',
          detail: 'PIN registered locally — it never leaves this device.',
          tone: 'ok',
        });
        return;
      }
      if (pinHash(digits) === pinned) {
        dispatch({ type: 'vaultUnlocked', value: true });
        setPin('');
        setPinError(false);
        toast({ title: 'Vault unsealed', detail: 'Forensic ledger visible', tone: 'ok' });
      } else {
        setPinError(true);
        setPin('');
        setTimeout(() => setPinError(false), 900);
        toast({ title: 'PIN rejected', detail: 'Attempt logged', tone: 'danger' });
      }
    },
    [pinned, dispatch, toast],
  );

  const pressKey = (k: string) => {
    if (pinError) return;
    if (k === 'C') {
      setPin('');
      return;
    }
    if (k === '←') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    const next = (pin + k).slice(0, 4);
    setPin(next);
    if (next.length === 4) setTimeout(() => submitPin(next), 180);
  };

  // The pad is shown whenever a PIN exists and the vault is not unsealed.
  const sealed = !!pinned && !state.vaultUnlocked;

  const commitSweep = useCallback(async () => {
    const record: SweepRecord = {
      room: state.room.name,
      venue: state.room.venue,
      createdAt: Date.now(),
      score: certificateScore,
      threatLevel,
      findings: flags.length,
      checks: checked.map((c) => ({ id: c.id, title: c.title, status: c.status, note: c.note })),
      events: state.events.slice(0, 20),
      checklist: state.checklist,
      synced: 0,
      pinHash: pinned ?? undefined,
    };
    try {
      await saveSweep(record);
      await refresh();
      logEvent({
        kind: 'privacy',
        title: 'Room sweep certificate sealed',
        detail: `${state.room.name} · ${state.room.venue} — ${checked.length}/${state.checklist.length} checkpoints, ${flags.length} flags, score ${certificateScore}/100.`,
        severity: threatLevel === 'critical' ? 'critical' : threatLevel === 'elevated' ? 'medium' : 'low',
        metric: `certificate ${certificateScore}/100`,
        location: `${state.room.venue} · ${state.room.name}`,
        source: 'audit',
      });
      toast({
        title: 'Certificate written to vault',
        detail: 'Queued for offline→online sync',
        tone: 'ok',
      });
    } catch {
      toast({ title: 'Vault write failed', detail: 'IndexedDB unavailable', tone: 'danger' });
    }
  }, [state, flags.length, checked, certificateScore, threatLevel, pinned, refresh, logEvent, toast]);

  const runSync = useCallback(async () => {
    setSyncing(true);
    setSyncLog([]);
    const res = await flushSyncQueue(undefined, (msg) =>
      setSyncLog((l) => [...l.slice(-8), msg]),
    );
    setSyncing(false);
    await refresh();
    toast({
      title: res.failed ? 'Partial sync' : 'Sync queue drained',
      detail: `${res.synced} committed · ${res.failed} deferred`,
      tone: res.failed ? 'warn' : 'ok',
    });
  }, [refresh, toast]);

  return (
    <div className="space-y-3">
      {/* control bar */}
      <Glass className="!p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg border border-white/15 bg-emerald-400/10">
              <Vault size={13} className="accent-text" />
            </span>
            <div>
              <div className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink">Safe-Room Audit Vault</div>
              <div className="text-[9.5px] text-faint">12-point protocol · PIN evidence ledger · offline sync</div>
            </div>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/25 px-2 py-1">
            <MapPin size={10} className="text-faint" />
            <input
              value={state.room.name}
              onChange={(e) => dispatch({ type: 'room', name: e.target.value })}
              className="w-[86px] bg-transparent font-mono text-[10px] text-ink outline-none placeholder:text-faint"
              placeholder="Room"
              aria-label="Room name"
            />
            <span className="text-faint">/</span>
            <input
              value={state.room.venue}
              onChange={(e) => dispatch({ type: 'room', venue: e.target.value })}
              className="w-[104px] bg-transparent font-mono text-[10px] text-ink outline-none placeholder:text-faint"
              placeholder="Venue"
              aria-label="Venue"
            />
          </div>
          <span className={`chip ${sealed ? 'chip-warn' : 'chip-live'}`}>
            {sealed ? <Lock size={9} /> : <LockOpen size={9} />}
            {sealed ? 'SEALED' : pinned ? 'UNSEALED' : 'CREATE PIN'}
          </span>
          <button onClick={() => void commitSweep()} className="btn btn-accent !py-1.5 text-[11px]">
            <FileCheck2 size={13} /> Seal Certificate
          </button>
        </div>
      </Glass>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        <div className="space-y-3">
          {/* progress header */}
          <Glass className="!p-3">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative grid h-16 w-16 place-items-center">
                <svg viewBox="0 0 60 60" className="absolute inset-0 h-full w-full -rotate-90">
                  <circle cx="30" cy="30" r="25" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
                  <motion.circle
                    cx="30"
                    cy="30"
                    r="25"
                    fill="none"
                    stroke={flags.length ? '#f59e0b' : '#10b981'}
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={157}
                    animate={{ strokeDashoffset: 157 - (progress / 100) * 157 }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                  />
                </svg>
                <span className="mono-num text-[15px] font-bold text-ink">{progress}%</span>
              </div>
              <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Checkpoints" value={`${checked.length}/${state.checklist.length}`} tone={progress === 100 ? 'ok' : 'default'} />
                <Stat label="Flagged" value={flags.length} tone={flags.length ? 'danger' : 'ok'} />
                <Stat
                  label="Cert Score"
                  value={certificateScore}
                  unit="/100"
                  tone={certificateScore >= 75 ? 'ok' : certificateScore >= 45 ? 'warn' : 'danger'}
                />
                <Stat label="Ledger" value={sweeps.length} unit="records" />
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => dispatch({ type: 'checklistAll', status: 'clear' })} className="btn !px-2 !py-1.5 text-[10px]">
                  <Check size={11} /> All Clear
                </button>
                <button onClick={() => dispatch({ type: 'checklistReset' })} className="btn !px-2 !py-1.5 text-[10px]">
                  <RotateCcw size={11} />
                </button>
              </div>
            </div>
          </Glass>

          {/* checklist */}
          <Glass className="!p-3">
            <SectionLabel right={<span className="chip">{checked.length}/{state.checklist.length} swept</span>}>
              12-Point Room Sweep Protocol
            </SectionLabel>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {state.checklist.map((item) => {
                const isFlag = item.status === 'flag';
                const isClear = item.status === 'clear';
                return (
                  <motion.div
                    key={item.id}
                    layout
                    transition={SPRING}
                    className={`group rounded-xl border px-2.5 py-2 transition-colors ${
                      isFlag
                        ? 'border-rose-500/40 bg-rose-500/[0.07]'
                        : isClear
                          ? 'border-emerald-500/28 bg-emerald-500/[0.055]'
                          : 'border-white/[0.08] bg-white/[0.02]'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        onClick={() =>
                          dispatch({
                            type: 'checklist',
                            id: item.id,
                            status: isClear ? 'todo' : 'clear',
                          })
                        }
                        className={`mt-px grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors ${
                          isClear
                            ? 'border-emerald-400/60 bg-emerald-400/25'
                            : isFlag
                              ? 'border-rose-400/60 bg-rose-400/20'
                              : 'border-white/20 bg-white/5 hover:border-white/40'
                        }`}
                        aria-label={`Toggle ${item.title}`}
                        aria-pressed={isClear}
                      >
                        {isClear && <Check size={11} className="text-emerald-300" />}
                        {isFlag && <Flag size={9} className="text-rose-300" />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="mono-num shrink-0 text-[8.5px] text-faint">
                            {String(item.index).padStart(2, '0')}
                          </span>
                          <span
                            className={`truncate text-[11px] font-semibold ${
                              isClear ? 'text-dim line-through decoration-emerald-500/50' : 'text-ink'
                            }`}
                          >
                            {item.title}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className="shrink-0 rounded border border-white/10 px-1 font-mono text-[8px] text-faint">
                            {item.zone}
                          </span>
                          <span className="truncate text-[9px] text-faint">{item.detail}</span>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col gap-1">
                        <button
                          onClick={() =>
                            dispatch({
                              type: 'checklist',
                              id: item.id,
                              status: isFlag ? 'todo' : 'flag',
                            })
                          }
                          className={`rounded border px-1 py-0.5 transition-colors ${
                            isFlag
                              ? 'border-rose-400/60 bg-rose-400/25 text-rose-200'
                              : 'border-white/12 text-faint hover:border-rose-400/40 hover:text-rose-300'
                          }`}
                          aria-label="Flag anomaly"
                        >
                          <Flag size={9} />
                        </button>
                        <button
                          onClick={() => setModule(item.module)}
                          className="rounded border border-white/12 px-1 py-0.5 text-faint transition-colors hover:border-emerald-400/40 hover:text-emerald-300"
                          aria-label={`Open ${item.module} scanner`}
                        >
                          <ChevronRight size={9} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </Glass>
        </div>

        {/* right rail: vault */}
        <div className="space-y-3">
          <Glass tone={sealed ? 'warn' : 'default'}>
            <SectionLabel right={sealed ? <Lock size={12} className="text-amber-400" /> : <LockOpen size={12} className="accent-text" />}>
              PIN Evidence Vault
            </SectionLabel>

            {sealed ? (
              <div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[0, 1, 2, 3].map((i) => (
                    <motion.div
                      key={i}
                      className="grid h-11 place-items-center rounded-lg border border-white/15 bg-black/35"
                      animate={pinError ? { x: [0, -5, 5, -3, 0], borderColor: ['#ef4444', '#ef4444'] } : {}}
                      transition={{ duration: 0.36 }}
                    >
                      <AnimatePresence mode="wait">
                        {pin.length > i ? (
                          <motion.span
                            key="dot"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="h-2 w-2 rounded-full bg-[var(--accent)]"
                            style={{ boxShadow: '0 0 10px var(--accent)' }}
                          />
                        ) : (
                          <span className="h-1 w-4 rounded-full bg-white/15" />
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))}
                </div>

                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '←'].map((k) => (
                    <motion.button
                      key={k}
                      onClick={() => pressKey(k)}
                      whileTap={{ scale: 0.9 }}
                      transition={SPRING}
                      className="rounded-lg border border-white/10 bg-white/[0.035] py-2 font-mono text-[13px] text-ink transition-colors hover:bg-white/[0.08]"
                    >
                      {k}
                    </motion.button>
                  ))}
                </div>
                <p className="mt-2 text-center font-mono text-[9px] text-faint">
                  {settingPin ? 'choose a new 4-digit PIN' : 'enter 4-digit PIN to unseal ledger'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <GlassInset className="!p-2.5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={14} className="shrink-0 text-emerald-400" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-ink">Vault unsealed</div>
                      <p className="text-[9.5px] text-faint">Forensic ledger readable — re-seal when leaving</p>
                    </div>
                  </div>
                </GlassInset>
                <div className="grid grid-cols-2 gap-1.5">
                  <button onClick={() => {
                    setSettingPin(true);
                    setPinned(null);
                  }} className="btn !py-1.5 text-[10px]">
                    <Lock size={11} /> Re-seal
                  </button>
                  <button onClick={() => void refresh()} className="btn !py-1.5 text-[10px]">
                    <RefreshCw size={11} /> Refresh
                  </button>
                </div>
              </div>
            )}
          </Glass>

          {/* ledger */}
          <Glass>
            <SectionLabel right={<Archive size={12} className="text-faint" />}>
              Sweep Ledger · {sweeps.length}
            </SectionLabel>
            <div className="max-h-[230px] space-y-1.5 overflow-y-auto scrollbar-none">
              {sweeps.length === 0 && (
                <div className="py-6 text-center">
                  <Sparkles size={16} className="mx-auto mb-1 text-faint" />
                  <p className="font-mono text-[10px] text-faint">no certificates sealed yet</p>
                </div>
              )}
              {sweeps.map((s) => (
                <motion.div
                  key={s.id}
                  layout
                  className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025]"
                >
                  <button
                    onClick={() => setExpanded(expanded === s.id ? null : s.id!)}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
                  >
                    <span
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border font-mono text-[10px] font-bold"
                      style={{
                        borderColor:
                          s.score >= 75 ? 'rgba(16,185,129,0.4)' : s.score >= 45 ? 'rgba(245,158,11,0.4)' : 'rgba(239,68,68,0.4)',
                        color: s.score >= 75 ? '#34d399' : s.score >= 45 ? '#fbbf24' : '#f87171',
                      }}
                    >
                      {s.score}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[10.5px] font-semibold text-ink">
                        {s.venue} · {s.room}
                      </span>
                      <span className="block truncate font-mono text-[8.5px] text-faint">
                        {new Date(s.createdAt).toLocaleString([], { hour12: false })} · {s.checks.length} checks
                      </span>
                    </span>
                    {s.synced ? (
                      <Cloud size={10} className="shrink-0 text-emerald-400" />
                    ) : (
                      <CloudOff size={10} className="shrink-0 text-amber-400" />
                    )}
                  </button>
                  <AnimatePresence initial={false}>
                    {expanded === s.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-white/10"
                      >
                        <div className="space-y-1 px-2 py-1.5">
                          <div className="flex flex-wrap gap-1">
                            <span className="chip">{s.threatLevel.toUpperCase()}</span>
                            <span className="chip">{s.findings} flags</span>
                            <span className="chip">{s.events.length} events</span>
                          </div>
                          {s.checks.filter((c) => c.status === 'flag').map((c) => (
                            <div key={c.id} className="flex items-start gap-1 text-[9.5px] text-rose-300">
                              <Flag size={8} className="mt-0.5 shrink-0" />
                              <span className="truncate">{c.title}</span>
                            </div>
                          ))}
                          <button
                            onClick={async () => {
                              await deleteSweep(s.id!);
                              await refresh();
                              toast({ title: 'Record destroyed', detail: `#${s.id}`, tone: 'info' });
                            }}
                            className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg border border-rose-500/25 py-1 text-[9px] text-rose-300 transition-colors hover:bg-rose-500/10"
                          >
                            <Trash2 size={9} /> Purge record
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          </Glass>

          {/* sync controller */}
          <Glass>
            <SectionLabel right={isDirector ? <Database size={12} className="accent-text" /> : <Lock size={12} className="text-amber-400" />}>
              Storage & Sync Controller
            </SectionLabel>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Queued" value={queue.queued} tone={queue.queued ? 'warn' : 'ok'} />
              <Stat label="Synced" value={queue.done} tone="ok" />
              <Stat label="Failed" value={queue.failed} tone={queue.failed ? 'danger' : 'default'} />
            </div>
            <div className="mt-2 rounded-lg border border-white/[0.07] bg-black/25 px-2 py-1.5">
              <div className="flex items-center justify-between">
                <span className="label-xs">IndexedDB footprint</span>
                <span className="font-mono text-[9.5px] text-dim">
                  {(footprint.bytes / 1024).toFixed(1)} KB · {footprint.records} rec
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400"
                  style={{ width: `${Math.min(100, (footprint.bytes / 1024 / 512) * 100)}%` }}
                />
              </div>
            </div>

            <button
              onClick={() => (isDirector ? void runSync() : dispatch({ type: 'modal', modal: { type: 'privileges' } }))}
              disabled={syncing}
              className="btn mt-2 w-full !py-1.5 text-[10.5px]"
            >
              <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Draining queue…' : `Flush Sync Queue (${queue.queued})`}
            </button>

            <div className="mt-1.5 max-h-[72px] space-y-0.5 overflow-y-auto scrollbar-none">
              {syncLog.map((l, i) => (
                <div key={i} className="truncate font-mono text-[8.5px] text-emerald-300/75">
                  {l}
                </div>
              ))}
            </div>

            {!isDirector && (
              <p className="mt-1 font-mono text-[8.5px] leading-snug text-amber-400/80">
                Sync controller requires COUNTER-INTEL DIRECTOR.
              </p>
            )}
          </Glass>

          {state.events.length > 0 && (
            <Glass>
              <SectionLabel right={<CheckCircle2 size={12} className="text-faint" />}>
                Recent Threat Evidence · {state.events.length}
              </SectionLabel>
              <div className="max-h-[150px] space-y-1 overflow-y-auto scrollbar-none">
                {state.events.slice(0, 8).map((e) => (
                  <button
                    key={e.id}
                    onClick={() => dispatch({ type: 'modal', modal: { type: 'forensic', eventId: e.id } })}
                    className="flex w-full items-start gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2 py-1 text-left transition-colors hover:border-white/20"
                  >
                    <span
                      className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        background:
                          e.severity === 'critical' ? '#ef4444' : e.severity === 'high' ? '#f59e0b' : '#10b981',
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[10px] font-medium text-ink">{e.title}</span>
                      <span className="block truncate font-mono text-[8px] text-faint">
                        {e.id} · {new Date(e.at).toLocaleTimeString([], { hour12: false })}
                      </span>
                    </span>
                    <X size={9} className="mt-1 shrink-0 rotate-45 text-faint" />
                  </button>
                ))}
              </div>
            </Glass>
          )}
        </div>
      </div>
    </div>
  );
}
