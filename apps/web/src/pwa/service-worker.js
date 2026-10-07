/* AI School OS service worker.
 *
 *  - Keeps the app shell (index.html, the start-up code, icons) so the app opens with no connection.
 *  - Keeps hashed code files as they are used (they never change), so pages opened before work offline.
 *  - Keeps a copy of a short list of the signed-in person's own read-only data (their timetable,
 *    homework, results, notices…) for weak connections. Saved data belongs to one sign-in at a time
 *    and is wiped on sign-out or when someone else signs in. Nothing that sends data, signs in,
 *    pays or sits an online exam is ever touched.
 *  - Shows push notifications.
 *
 * The build fills in VERSION and PRECACHE (see src/pwa/vite-plugin.ts). Plain JS: it is served as-is.
 */

const VERSION = '__AIS_VERSION__';
/** @type {string[]} */
const PRECACHE = __AIS_PRECACHE__;

const SHELL_CACHE = `ais-shell-${VERSION}`;
const ASSET_CACHE = 'ais-assets-v1';
const FONT_CACHE = 'ais-fonts-v1';
const API_CACHE = 'ais-api-v1';
const META_CACHE = 'ais-meta-v1';
const SHELL_URL = '/index.html';
const SESSION_KEY = '/__ais/session';
const SAVED_PREFIX = '/__ais/saved/';

/** Wait this long for the network before opening the saved copy instead (only when one exists). */
const NAV_TIMEOUT_MS = 3500;
const API_TIMEOUT_MS = 6000;
const MAX_ASSETS = 160;
const MAX_FONTS = 30;
const MAX_API = 250;

/**
 * Read-only data that is safe to keep for the signed-in person. Anything not listed goes straight
 * to the network untouched — in particular /auth (except /auth/me), /cbt, /online-exams, payments
 * and fees, uploads and downloads, AI streams and every POST/PUT/PATCH/DELETE.
 */
const SAVABLE = [
  /^\/api\/auth\/me$/,
  /^\/api\/dashboard\/overview$/,
  /^\/api\/portal\/(me|settings|downloads)$/,
  /^\/api\/portal\/students\/[^/]+\/(overview|attendance|results|calendar|welfare)$/,
  /^\/api\/portal\/students\/[^/]+\/results\/[^/]+$/,
  /^\/api\/learning\/(mine|me|plans|flashcards|mastery|conversations|exams)$/,
  /^\/api\/learning\/homework\/[^/]+$/,
  /^\/api\/learning\/conversations\/[^/]+$/,
  /^\/api\/materials\/library$/,
  /^\/api\/my-lessons(\/[^/]+)?$/,
  /^\/api\/family$/,
  /^\/api\/family\/children\/[^/]+\/(progress|homework)$/,
  /^\/api\/timetables\/today$/,
  /^\/api\/attendance\/me$/,
  /^\/api\/(noticeboard|announcements|events|notifications)$/,
  /^\/api\/homework$/,
];
const isSavable = (pathname) => SAVABLE.some((re) => re.test(pathname));

const precached = new Set(PRECACHE);

// ---------------------------------------------------------------- install / activate

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.all(
        PRECACHE.map(async (url) => {
          // Hashed code files were just downloaded by the page: reuse the browser's copy instead of
          // spending the data twice. Everything else is checked with the server.
          const hashed = url.startsWith('/assets/');
          try {
            const res = await fetch(new Request(url, { cache: hashed ? 'force-cache' : 'no-cache', credentials: 'same-origin' }));
            if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
            await cache.put(url, res);
          } catch (err) {
            // Icons are nice to have; the shell and its code are not optional.
            if (url === SHELL_URL || hashed) throw err;
          }
        }),
      );
      // The older notifications-only worker had no offline features to keep consistent, so there is
      // nothing to protect by waiting: take over at once. Later updates wait for the person to agree.
      const keys = await caches.keys();
      if (!keys.some((k) => k.startsWith('ais-shell-') && k !== SHELL_CACHE)) await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE, FONT_CACHE, API_CACHE, META_CACHE]);
      for (const key of await caches.keys()) if (key.startsWith('ais-') && !keep.has(key)) await caches.delete(key);
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => undefined);
      await trim(ASSET_CACHE, MAX_ASSETS);
      await self.clients.claim();
    })(),
  );
});

/** Drops the oldest entries (Cache Storage keeps insertion order). */
async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

// ---------------------------------------------------------------- fetch

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/')) {
      if (isSavable(url.pathname) && !req.headers.has('range')) event.respondWith(apiNetworkFirst(event, url));
      return;
    }
    if (req.mode === 'navigate') {
      event.respondWith(navigation(event));
      return;
    }
    if (url.pathname.startsWith('/assets/')) {
      event.respondWith(assetCacheFirst(event));
      return;
    }
    if (precached.has(url.pathname)) event.respondWith(networkThenShell(req, url.pathname));
    return;
  }

  if (url.hostname === 'fonts.gstatic.com') event.respondWith(fontCacheFirst(event));
  else if (url.hostname === 'fonts.googleapis.com') event.respondWith(fontCssStaleWhileRevalidate(event));
});

function timeout(ms) {
  return new Promise((resolve) => setTimeout(() => resolve(undefined), ms));
}

/** Pages: the network first, so a deploy shows at once; the saved shell when offline or very slow. */
async function navigation(event) {
  const shell = await caches.match(SHELL_URL, { cacheName: SHELL_CACHE });
  const network = (async () => {
    const preloaded = await event.preloadResponse;
    return preloaded || fetch(event.request);
  })();
  event.waitUntil(network.catch(() => undefined));
  try {
    const res = await (shell ? Promise.race([network, timeout(NAV_TIMEOUT_MS)]) : network);
    if (res) return res;
  } catch {
    /* offline */
  }
  return shell || Response.error();
}

/** Hashed code files never change: the saved copy if there is one, else the network (and keep it). */
async function assetCacheFirst(event) {
  const req = event.request;
  const hit = (await caches.match(req.url, { cacheName: SHELL_CACHE })) || (await caches.match(req, { cacheName: ASSET_CACHE }));
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.status === 200) {
    const copy = res.clone();
    event.waitUntil(caches.open(ASSET_CACHE).then((c) => c.put(req, copy)));
  }
  return res;
}

async function networkThenShell(req, pathname) {
  try {
    const res = await fetch(req);
    if (res.ok) return res;
    return (await caches.match(pathname, { cacheName: SHELL_CACHE })) || res;
  } catch {
    return (await caches.match(pathname, { cacheName: SHELL_CACHE })) || Response.error();
  }
}

async function fontCacheFirst(event) {
  const hit = await caches.match(event.request, { cacheName: FONT_CACHE });
  if (hit) return hit;
  const res = await fetch(event.request);
  if (res.ok || res.type === 'opaque') {
    const copy = res.clone();
    event.waitUntil(caches.open(FONT_CACHE).then(async (c) => { await c.put(event.request, copy); await trim(FONT_CACHE, MAX_FONTS); }));
  }
  return res;
}

async function fontCssStaleWhileRevalidate(event) {
  const cache = await caches.open(FONT_CACHE);
  const hit = await cache.match(event.request);
  const network = fetch(event.request).then((res) => {
    if (res.ok) return cache.put(event.request, res.clone()).then(() => res);
    return res;
  });
  if (hit) {
    event.waitUntil(network.catch(() => undefined));
    return hit;
  }
  return network;
}

// ---------------------------------------------------------------- saved data (per sign-in)

let session; // { key, me, savedAt } | null — undefined until read from the cache

async function readSession() {
  if (session !== undefined) return session;
  const res = await caches.match(SESSION_KEY, { cacheName: META_CACHE });
  session = res ? await res.json().catch(() => null) : null;
  return session;
}

/** "userId:schoolId" from the access token. The token isn't verified here — the server does that; this only files the copy. */
function keyFromToken(header) {
  const m = /^Bearer\s+([^.]+)\.([^.]+)\./i.exec(header || '');
  if (!m) return null;
  try {
    const json = atob(m[2].replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json);
    return typeof claims.sub === 'string' ? `${claims.sub}:${claims.tid || ''}` : null;
  } catch {
    return null;
  }
}

const savedKey = (who, url) => `${self.location.origin}${SAVED_PREFIX}${encodeURIComponent(who)}${url.pathname}${url.search}`;

async function apiNetworkFirst(event, url) {
  const req = event.request;
  const auth = req.headers.get('authorization');
  const current = await readSession();
  // With a token the copy is filed under that person. Without one (opened offline from the saved
  // sign-in) only the saved sign-in's copy may be shown.
  const who = auth ? keyFromToken(auth) : current && current.key;
  if (!who) return fetch(req);
  const key = savedKey(who, url);
  const cache = await caches.open(API_CACHE);
  const saved = await cache.match(key);

  const network = fetch(req).then((res) => {
    const json = (res.headers.get('content-type') || '').includes('application/json');
    if (auth && res.status === 200 && json) event.waitUntil(save(cache, key, who, res.clone()).catch(() => undefined));
    return res;
  });

  const useSaved = (why) => {
    notify(event.clientId, saved.headers.get('x-ais-saved-at'), why);
    return saved;
  };

  if (!saved) return network;
  event.waitUntil(network.catch(() => undefined));
  try {
    const res = await Promise.race([network, timeout(API_TIMEOUT_MS)]);
    if (!res) return useSaved('slow');
    // Server down or restarting: the saved copy is more useful than an error page.
    if (res.status >= 500) return useSaved('server');
    return res;
  } catch {
    return useSaved('offline');
  }
}

async function save(cache, key, who, res) {
  const s = await readSession();
  // Only keep data for the sign-in this browser currently has.
  if (s && s.key !== who) return;
  const headers = new Headers(res.headers);
  headers.set('x-ais-saved-at', new Date().toISOString());
  const body = await res.blob();
  await cache.put(key, new Response(body, { status: 200, statusText: 'OK', headers }));
  if (Math.random() < 0.05) await trim(API_CACHE, MAX_API);
}

async function notify(clientId, savedAt, why) {
  const client = clientId && (await self.clients.get(clientId));
  if (client) client.postMessage({ type: 'ais:saved-data', savedAt, why });
}

async function clearSaved(exceptKey) {
  const cache = await caches.open(API_CACHE);
  const keep = exceptKey ? `${self.location.origin}${SAVED_PREFIX}${encodeURIComponent(exceptKey)}/` : null;
  for (const req of await cache.keys()) if (!keep || !req.url.startsWith(keep)) await cache.delete(req);
}

// ---------------------------------------------------------------- messages from the app

self.addEventListener('message', (event) => {
  const data = event.data || {};
  const reply = (value) => event.ports[0] && event.ports[0].postMessage(value);
  switch (data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
    case 'HAS_URL':
      reply(precached.has(data.url));
      break;
    case 'GET_SESSION':
      event.waitUntil(readSession().then((s) => reply(s || null)));
      break;
    case 'SESSION':
      // Someone signed in (or switched school): keep their sign-in, drop anyone else's saved data.
      event.waitUntil(
        (async () => {
          if (!data.key) return;
          const next = { key: data.key, me: data.me, savedAt: new Date().toISOString() };
          const meta = await caches.open(META_CACHE);
          await meta.put(SESSION_KEY, new Response(JSON.stringify(next), { headers: { 'content-type': 'application/json' } }));
          session = next;
          await clearSaved(data.key);
          reply(true);
        })(),
      );
      break;
    case 'CLEAR_SESSION':
      event.waitUntil(
        (async () => {
          session = null;
          await caches.delete(META_CACHE);
          await caches.delete(API_CACHE);
          reply(true);
        })(),
      );
      break;
    case 'CACHE_URLS':
      // Code the page loaded before this worker was in charge: keep it too (from the browser's own copy).
      event.waitUntil(
        (async () => {
          const cache = await caches.open(ASSET_CACHE);
          for (const u of Array.isArray(data.urls) ? data.urls.slice(0, 80) : []) {
            const url = new URL(u, self.location.origin);
            if (url.origin !== self.location.origin || !url.pathname.startsWith('/assets/')) continue;
            if (precached.has(url.pathname) || (await cache.match(url.href))) continue;
            try {
              const res = await fetch(new Request(url.href, { cache: 'force-cache', credentials: 'same-origin' }));
              if (res.ok && res.status === 200) await cache.put(url.href, res);
            } catch {
              /* next time */
            }
          }
        })(),
      );
      break;
    default:
  }
});

// ---------------------------------------------------------------- push notifications

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }
  const title = data.title || 'AI School OS';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: data.tag || undefined,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if ('navigate' in client && client.url !== target) {
          try {
            await client.navigate(target);
          } catch {
            /* not controlled by this worker yet: it is focused, which is the next best thing */
          }
        }
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
