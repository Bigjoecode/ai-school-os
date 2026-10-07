import type { OfflineSyncResult } from '@aischool/shared';
import { create } from 'zustand';
import { ApiError, api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { idb, idbAvailable, type OutboxItem } from './db';

/**
 * Uploads queued offline hand-ins: on start-up, whenever the connection comes back, every minute
 * while something is waiting, and on "Sync now". The server ignores a hand-in it already has,
 * so sending one twice is harmless.
 */

interface SyncState {
  running: boolean;
  pending: number;
  /** A hand-in is waiting but nobody is signed in on this device. */
  needsSignIn: boolean;
  lastSyncAt: number | null;
  lastError: string | null;
  /** Bumped after every change, so lists re-read IndexedDB. */
  version: number;
  set: (p: Partial<Omit<SyncState, 'set'>>) => void;
}

export const useOfflineSync = create<SyncState>((set) => ({
  running: false,
  pending: 0,
  needsSignIn: false,
  lastSyncAt: null,
  lastError: null,
  version: 0,
  set: (p) => set(p),
}));

const bump = (p: Partial<SyncState> = {}) => useOfflineSync.getState().set({ ...p, version: useOfflineSync.getState().version + 1 });

const waiting = (i: OutboxItem) => i.status === 'PENDING';

export async function refreshPending() {
  if (!idbAvailable()) return 0;
  const items = await idb.all<OutboxItem>('outbox').catch(() => [] as OutboxItem[]);
  const pending = items.filter((i) => waiting(i) && i.kind === 'final').length;
  bump({ pending });
  return pending;
}

let inflight: Promise<void> | null = null;

/** Sends everything waiting. Resolves when done (or when the network or sign-in stops it). */
export function syncNow(opts: { includeFailed?: boolean } = {}): Promise<void> {
  if (!inflight) inflight = run(opts).finally(() => (inflight = null));
  return inflight;
}

async function run({ includeFailed }: { includeFailed?: boolean }) {
  if (!idbAvailable()) return;
  const store = useOfflineSync.getState();
  let items = (await idb.all<OutboxItem>('outbox')).filter((i) => waiting(i) || (includeFailed && i.status === 'FAILED'));
  if (!items.length) {
    await refreshPending();
    return;
  }
  const auth = useAuthStore.getState();
  if (auth.status === 'anonymous') {
    bump({ needsSignIn: items.some((i) => i.kind === 'final') });
    return;
  }
  store.set({ running: true, lastError: null, needsSignIn: false });
  // Hand-ins first; a progress report is pointless once its hand-in is queued.
  const finals = new Set(items.filter((i) => i.kind === 'final').map((i) => i.sittingKey));
  for (const i of items.filter((x) => x.kind === 'progress' && finals.has(x.sittingKey))) await idb.delete('outbox', i.id);
  items = items.filter((i) => i.kind === 'final' || !finals.has(i.sittingKey)).sort((a, b) => (a.kind === b.kind ? a.createdAt.localeCompare(b.createdAt) : a.kind === 'final' ? -1 : 1));
  try {
    for (const item of items) {
      const tried = { ...item, tries: item.tries + 1, lastTriedAt: new Date().toISOString() };
      try {
        const r = await api.post<OfflineSyncResult>('/cbt/offline/sync', { payload: item.payload, signature: item.signature, deviceNow: new Date().toISOString() });
        if (item.kind === 'progress') await idb.delete('outbox', item.id);
        else await idb.put('outbox', { ...tried, status: r.status === 'HELD' ? 'HELD' : 'SYNCED', result: r, lastError: null } satisfies OutboxItem);
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        if (err.status === 0) {
          // No connection: stop here, try again later.
          await idb.put('outbox', { ...tried, lastError: 'No connection' });
          store.set({ lastError: 'No connection — will try again' });
          return;
        }
        if (err.status === 401) {
          bump({ needsSignIn: true, lastError: 'Sign in to send the answers' });
          return;
        }
        if (err.status === 429 || err.status >= 500) {
          await idb.put('outbox', { ...tried, lastError: err.message });
          store.set({ lastError: err.message });
          return;
        }
        if (item.kind === 'progress') {
          await idb.delete('outbox', item.id);
          continue;
        }
        // Refused (wrong school, someone else's sign-in…): kept on the device; staff can retry after fixing it.
        await idb.put('outbox', { ...tried, status: 'FAILED', lastError: err.message } satisfies OutboxItem);
        store.set({ lastError: err.message });
      }
    }
    store.set({ lastSyncAt: Date.now() });
  } finally {
    store.set({ running: false });
    await refreshPending();
  }
}

let started = false;

/** Background retry, started once by the app. */
export function startOfflineSync() {
  if (started || typeof window === 'undefined' || !idbAvailable()) return;
  started = true;
  const kick = () => {
    if (navigator.onLine) void syncNow().catch(() => undefined);
  };
  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && kick());
  // Sign-in finished (or the saved sign-in was restored): send anything waiting.
  useAuthStore.subscribe((s, prev) => {
    if (s.accessToken && s.accessToken !== prev.accessToken) kick();
  });
  window.setInterval(() => {
    if (useOfflineSync.getState().pending > 0) kick();
  }, 60_000);
  void refreshPending().then((n) => n > 0 && kick());
}
