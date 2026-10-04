import type { MeResponse } from '@aischool/shared';
import { refreshSession } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { queryClient } from '@/lib/query-client';
import { usePwaStore } from './store';

/**
 * Offline start-up. The access token lives only in memory, so with no connection the app can't
 * restore the session from the refresh cookie. Instead it opens with the saved copy of the last
 * sign-in on this device (kept by the service worker, wiped on sign-out) and shows that person's
 * saved data. No token is held: as soon as the network is back, the normal refresh takes over —
 * and if that sign-in has ended meanwhile, the first request signs the person out as usual.
 */

/** Asks the active service worker something and waits briefly for the answer. */
export async function askWorker<T>(message: object, timeoutMs = 1500): Promise<T | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration('/').catch(() => undefined);
  const worker = reg?.active;
  if (!worker) return null;
  return new Promise<T | null>((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => resolve(null), timeoutMs);
    channel.port1.onmessage = (e) => {
      window.clearTimeout(timer);
      resolve((e.data ?? null) as T | null);
    };
    worker.postMessage(message, [channel.port2]);
  });
}

/** True when the API can't be reached at all (as opposed to answering "not signed in"). */
async function apiUnreachable(): Promise<boolean> {
  if (!navigator.onLine) return true;
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 5000);
  try {
    await fetch('/api/health', { cache: 'no-store', signal: ctrl.signal });
    return false;
  } catch {
    return true;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Opens the app as the saved sign-in. `verifyOffline`: only when the API really can't be reached
 * (a refresh that failed because the sign-in ended must not fall back to the saved copy).
 */
export async function openSavedSession(opts: { verifyOffline?: boolean } = {}): Promise<boolean> {
  if (useAuthStore.getState().status !== 'booting') return false;
  const saved = await askWorker<{ key: string; me: MeResponse } | null>({ type: 'GET_SESSION' });
  if (!saved?.me?.user) return false;
  if (opts.verifyOffline && !(await apiUnreachable())) return false;
  if (useAuthStore.getState().status !== 'booting') return false;
  useAuthStore.setState({ status: 'authenticated', accessToken: null, me: saved.me });
  usePwaStore.getState().set({ savedSession: true, troubleAt: Date.now() });
  return true;
}

let reconnecting = false;

/** Back online after an offline start: restore the real session and refresh what's on screen. */
export async function reconnectSavedSession(): Promise<void> {
  if (reconnecting || !usePwaStore.getState().savedSession) return;
  if (useAuthStore.getState().accessToken) return;
  reconnecting = true;
  try {
    const session = await refreshSession();
    if (session) {
      usePwaStore.getState().set({ savedSession: false, savedAt: null, troubleAt: 0 });
      void queryClient.invalidateQueries();
    }
  } finally {
    reconnecting = false;
  }
}
