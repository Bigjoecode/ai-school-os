import type { OfflinePack, OfflineSyncResult } from '@aischool/shared';

/**
 * IndexedDB for offline exams (survives reloads, restarts and sign-outs):
 *  - packs: the encrypted downloads
 *  - sittings: a student's sitting in progress or handed in (answers saved on every change)
 *  - outbox: signed hand-ins and progress reports waiting to be uploaded
 *
 * Nothing here is deleted on sign-out: a hand-in that hasn't reached the server must never be lost.
 */

export interface StoredPack {
  /** `${examId}:${mode}:${ownerUserId}` — downloading again replaces it. */
  key: string;
  pack: OfflinePack;
  ownerUserId: string;
  tenantId: string | null;
  savedAt: string;
}

export type AnswerValue = number | string | null;

export interface Sitting {
  /** `${packKey}:${seatId}` */
  key: string;
  packKey: string;
  examId: string;
  packVersion: number;
  seatId: string;
  studentId: string;
  studentName: string;
  admissionNumber: string;
  status: 'IN_PROGRESS' | 'SUBMITTED';
  /** Device clock (ms) at start. */
  startedWall: number;
  /** Monotonic time used so far (performance.now, summed over page loads). */
  monoMs: number;
  /** Device clock at the last save, to notice it going backwards. */
  lastWall: number;
  answers: Record<string, AnswerValue>;
  flags: string[];
  pos: number;
  focusLosses: number;
  clockIssues: string[];
  /** Non-extractable keys, so a personal device can resume after a reload without the code. */
  contentKey: CryptoKey;
  signingKey: CryptoKey;
  items: { id: string; order: number[] }[];
  submittedWall: number | null;
  submissionId: string | null;
  elapsedSeconds: number | null;
}

export interface OutboxItem {
  /** `${submissionId}:${kind}` */
  id: string;
  kind: 'progress' | 'final';
  sittingKey: string;
  examId: string;
  seatId: string;
  title: string;
  studentName: string;
  payload: string;
  signature: string;
  createdAt: string;
  status: 'PENDING' | 'SYNCED' | 'HELD' | 'FAILED';
  tries: number;
  lastTriedAt: string | null;
  lastError: string | null;
  result: OfflineSyncResult | null;
}

const DB_NAME = 'ais-offline-exams';
type StoreName = 'packs' | 'sittings' | 'outbox';
let dbp: Promise<IDBDatabase> | null = null;

export const idbAvailable = () => typeof indexedDB !== 'undefined';

function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('packs')) d.createObjectStore('packs', { keyPath: 'key' });
        if (!d.objectStoreNames.contains('sittings')) d.createObjectStore('sittings', { keyPath: 'key' });
        if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbp = null;
        reject(req.error ?? new Error('This browser can’t store offline exams'));
      };
    });
  }
  return dbp;
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(stores: StoreName[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => Promise<T> | T): Promise<T> {
  const d = await db();
  const t = d.transaction(stores, mode);
  const finished = new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('Saving on this device failed'));
  });
  const out = await fn(t);
  await finished;
  return out;
}

export const idb = {
  get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return tx([store], 'readonly', (t) => done(t.objectStore(store).get(key) as IDBRequest<T | undefined>));
  },
  all<T>(store: StoreName): Promise<T[]> {
    return tx([store], 'readonly', (t) => done(t.objectStore(store).getAll() as IDBRequest<T[]>));
  },
  put(store: StoreName, value: unknown): Promise<void> {
    return tx([store], 'readwrite', (t) => {
      t.objectStore(store).put(value);
    });
  },
  delete(store: StoreName, key: string): Promise<void> {
    return tx([store], 'readwrite', (t) => {
      t.objectStore(store).delete(key);
    });
  },
  /** Hand-in: the sitting is closed and its signed copy queued in one go (both or neither). */
  handIn(sitting: Sitting, items: OutboxItem[]): Promise<void> {
    return tx(['sittings', 'outbox'], 'readwrite', (t) => {
      t.objectStore('sittings').put(sitting);
      for (const i of items) t.objectStore('outbox').put(i);
    });
  },
};

export const packKeyOf = (examId: string, mode: string, ownerUserId: string) => `${examId}:${mode}:${ownerUserId}`;
