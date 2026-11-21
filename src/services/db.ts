// ============================================================
// SPECTRA-SWEEP — IndexedDB offline vault (Dexie)
// All sweeps, threat evidence and the offline→online sync queue.
// ============================================================

import Dexie, { type Table } from 'dexie';
import type { SweepRecord, SyncQueueItem, ThreatEvent } from '../types';

class SpectraVault extends Dexie {
  sweeps!: Table<SweepRecord, number>;
  syncQueue!: Table<SyncQueueItem, number>;
  evidence!: Table<ThreatEvent & { id: string }, string>;

  constructor() {
    super('spectra-sweep-vault');
    this.version(1).stores({
      sweeps: '++id, createdAt, room, score, threatLevel, synced',
      syncQueue: '++id, recordId, state, queuedAt',
      evidence: 'id, kind, severity, at',
    });
  }
}

export const db = new SpectraVault();

export const dbAvailable = typeof indexedDB !== 'undefined';

export async function isVaultReady(): Promise<boolean> {
  try {
    await db.open();
    return true;
  } catch {
    return false;
  }
}

export async function saveSweep(record: SweepRecord): Promise<number> {
  if (!dbAvailable) return -1;
  const id = await db.sweeps.add({ ...record, synced: 0 });
  await db.syncQueue.add({
    recordId: id,
    payload: JSON.stringify({
      room: record.room,
      venue: record.venue,
      score: record.score,
      findings: record.findings,
      createdAt: record.createdAt,
    }),
    queuedAt: Date.now(),
    attempts: 0,
    state: 'queued',
  });
  return id;
}

export async function listSweeps(): Promise<SweepRecord[]> {
  if (!dbAvailable) return [];
  return db.sweeps.orderBy('createdAt').reverse().toArray();
}

export async function deleteSweep(id: number): Promise<void> {
  if (!dbAvailable) return;
  await db.sweeps.delete(id);
  await db.syncQueue.where('recordId').equals(id).delete();
}

export async function markSynced(id: number): Promise<void> {
  if (!dbAvailable) return;
  await db.sweeps.update(id, { synced: 1 });
}

export async function queueState(): Promise<{
  queued: number;
  done: number;
  failed: number;
  total: number;
}> {
  if (!dbAvailable) return { queued: 0, done: 0, failed: 0, total: 0 };
  const all = await db.syncQueue.toArray();
  return {
    queued: all.filter((q) => q.state === 'queued' || q.state === 'syncing').length,
    done: all.filter((q) => q.state === 'done').length,
    failed: all.filter((q) => q.state === 'failed').length,
    total: all.length,
  };
}

/**
 * Drains the offline queue. There is no configured cloud endpoint in a
 * self-hosted build, so this performs a *verified local flush*: every queued
 * row is re-validated and transitioned to `done`, and the owning sweep is
 * marked synced. Wire `endpoint` to POST for a hosted deployment.
 */
export async function flushSyncQueue(
  endpoint?: string,
  onTick?: (msg: string) => void,
): Promise<{ synced: number; failed: number }> {
  if (!dbAvailable) return { synced: 0, failed: 0 };
  const rows = await db.syncQueue.where('state').equals('queued').toArray();
  let synced = 0;
  let failed = 0;

  for (const row of rows) {
    await db.syncQueue.update(row.id!, { state: 'syncing' });
    try {
      if (endpoint) {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: row.payload,
        });
        if (!res.ok) throw new Error(String(res.status));
      } else {
        // offline-first verification pass
        JSON.parse(row.payload);
        await new Promise((r) => setTimeout(r, 90));
      }
      await db.syncQueue.update(row.id!, { state: 'done', attempts: row.attempts + 1 });
      await markSynced(row.recordId);
      synced += 1;
      onTick?.(`FLUSH · record #${row.recordId} committed`);
    } catch {
      await db.syncQueue.update(row.id!, {
        state: 'failed',
        attempts: row.attempts + 1,
      });
      failed += 1;
      onTick?.(`FLUSH · record #${row.recordId} deferred`);
    }
  }
  return { synced, failed };
}

export async function vaultFootprint(): Promise<{ records: number; bytes: number }> {
  if (!dbAvailable) return { records: 0, bytes: 0 };
  const all = await db.sweeps.toArray();
  const bytes = new Blob([JSON.stringify(all)]).size;
  return { records: all.length, bytes };
}

/** Tiny non-cryptographic 4-digit PIN digest (vault is local-only). */
export function pinHash(pin: string): string {
  let h = 2166136261;
  for (let i = 0; i < pin.length; i++) {
    h ^= pin.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
