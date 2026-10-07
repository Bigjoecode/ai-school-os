import type { MeResponse } from '@aischool/shared';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { queryClient } from '@/lib/query-client';
import { reconnectSavedSession } from './session';
import { isStandalone, usePwaStore, type BeforeInstallPromptEvent } from './store';

/**
 * Wires the installable app: registers the service worker (production only), offers updates,
 * tracks the connection, keeps the worker's saved data tied to whoever is signed in, and captures
 * the browser's install offer.
 */

const HOUR = 60 * 60 * 1000;
const supported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
let registration: ServiceWorkerRegistration | null = null;
let reloadRequested = false;

function post(message: object) {
  if (!supported) return;
  void navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage(message)).catch(() => undefined);
}

function ask<T>(worker: ServiceWorker, message: object, timeoutMs = 1500): Promise<T | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => resolve(null), timeoutMs);
    channel.port1.onmessage = (e) => {
      window.clearTimeout(timer);
      resolve(e.data as T);
    };
    worker.postMessage(message, [channel.port2]);
  });
}

// ---------------------------------------------------------------- install offer (listen early: it fires once, soon after load)

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Our own "Install the app" button replaces the browser's mini-bar.
    e.preventDefault();
    usePwaStore.getState().set({ installEvent: e as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => usePwaStore.getState().set({ installEvent: null, installed: true }));
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', () => usePwaStore.getState().set({ installed: isStandalone() }));
}

// ---------------------------------------------------------------- connection

function watchConnection() {
  const set = usePwaStore.getState().set;
  window.addEventListener('online', () => {
    set({ online: true, troubleAt: 0, savedAt: null });
    void reconnectSavedSession();
  });
  window.addEventListener('offline', () => set({ online: false }));

  // A request that couldn't reach the server at all (ApiError status 0).
  const trouble = (error: unknown) => {
    if (error instanceof ApiError && error.status === 0) set({ troubleAt: Date.now() });
  };
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'updated' && (event.action.type === 'error' || event.action.type === 'failed')) trouble(event.action.error);
  });
  queryClient.getMutationCache().subscribe((event) => {
    if (event.type === 'updated' && event.action.type === 'error') trouble(event.action.error);
  });

  if (supported) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      const data = event.data as { type?: string; savedAt?: string | null } | null;
      if (data?.type !== 'ais:saved-data') return;
      const prev = usePwaStore.getState().savedAt;
      const savedAt = data.savedAt && (!prev || data.savedAt < prev) ? data.savedAt : prev;
      set({ troubleAt: Date.now(), savedAt });
    });
  }
}

// ---------------------------------------------------------------- saved data belongs to one sign-in

let lastKey: string | null | undefined;
let lastMe: MeResponse | null = null;

function syncSession() {
  const s = useAuthStore.getState();
  const pwa = usePwaStore.getState();
  if (s.status === 'anonymous') {
    // Signed out, or the sign-in ended: nothing of theirs stays on the device.
    if (lastKey !== null) post({ type: 'CLEAR_SESSION' });
    lastKey = null;
    lastMe = null;
    if (pwa.savedSession) pwa.set({ savedSession: false });
    return;
  }
  // The saved-copy start (no token) must not overwrite what the worker holds.
  if (s.status !== 'authenticated' || !s.me || !s.accessToken) return;
  if (pwa.savedSession) {
    pwa.set({ savedSession: false, savedAt: null, troubleAt: 0 });
    void queryClient.invalidateQueries();
  }
  const key = `${s.me.user.id}:${s.me.tenant?.id ?? ''}`;
  if (key === lastKey && s.me === lastMe) return;
  lastKey = key;
  lastMe = s.me;
  post({ type: 'SESSION', key, me: s.me });
}

// ---------------------------------------------------------------- updates

/** The script this page started from; if the waiting worker already has it, this page *is* the new version. */
function entryScript(): string | null {
  return document.querySelector<HTMLScriptElement>('script[type="module"][src^="/assets/"]')?.getAttribute('src') ?? null;
}

async function onWaiting(reg: ServiceWorkerRegistration) {
  const waiting = reg.waiting;
  if (!waiting || !navigator.serviceWorker.controller) return;
  const entry = entryScript();
  if (entry && (await ask<boolean>(waiting, { type: 'HAS_URL', url: entry }))) {
    // Already running the new code (the page itself came from the network): switch quietly.
    waiting.postMessage({ type: 'SKIP_WAITING' });
    return;
  }
  usePwaStore.getState().set({ updateReady: true });
}

/** "Reload" on the update notice: start the new version in this tab. */
export function applyUpdate() {
  reloadRequested = true;
  const waiting = registration?.waiting;
  if (!waiting) {
    window.location.reload();
    return;
  }
  waiting.postMessage({ type: 'SKIP_WAITING' });
  // If the switch is slow, reload anyway — the network copy of the page is the new version.
  window.setTimeout(() => window.location.reload(), 4000);
}

function cacheLoadedCode() {
  const urls = performance
    .getEntriesByType('resource')
    .map((e) => e.name)
    .filter((u) => u.startsWith(`${window.location.origin}/assets/`));
  if (urls.length) post({ type: 'CACHE_URLS', urls });
}

async function register() {
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    registration = reg;
    if (reg.waiting) void onWaiting(reg);
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed') void onWaiting(reg);
      });
    });
    // Look for a new version now and then (the worker file is small and never cached).
    let lastCheck = Date.now();
    const check = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      if (Date.now() - lastCheck < HOUR / 2) return;
      lastCheck = Date.now();
      void reg.update().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', check);
    window.setInterval(check, HOUR);
    if (navigator.serviceWorker.controller) cacheLoadedCode();
  } catch {
    /* private mode or blocked: the app works as an ordinary website */
  }
}

// ---------------------------------------------------------------- start

/** Called once by main.tsx for the portal (not on schools' own website domains). */
export function initPwa() {
  watchConnection();
  syncSession();
  useAuthStore.subscribe(syncSession);
  // Offline exam hand-ins waiting on this device: send them in the background (small, loaded after start-up).
  window.setTimeout(() => void import('@/features/cbt/offline/sync').then((m) => m.startOfflineSync()).catch(() => undefined), 3000);
  if (!supported) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Only the tab that asked reloads: an exam in another tab is never interrupted.
    if (reloadRequested) {
      window.location.reload();
      return;
    }
    lastKey = undefined;
    syncSession();
    cacheLoadedCode();
  });

  if (!import.meta.env.PROD) return;
  // After the page has loaded, so the worker never competes with the first screen for data.
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register(), { once: true });
}
