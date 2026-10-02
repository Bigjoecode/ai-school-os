/**
 * Host mode: a school's own website domain (e.g. www.greenfield.sch.ng) points
 * at this app. At startup we ask the API which site lives at this hostname; if
 * one does, the public website renders at the root instead of the portal.
 */
const CACHE_KEY = 'aischool.siteHost';
const TIMEOUT_MS = 2500;

function readCache(host: string): string | null | undefined {
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const v = JSON.parse(raw) as { host: string; slug: string | null };
    return v.host === host ? v.slug : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(host: string, slug: string | null) {
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ host, slug }));
  } catch {
    /* storage unavailable */
  }
}

/** The website slug served at this hostname, or null for the portal. Never throws. */
export async function detectWebsiteHost(): Promise<string | null> {
  const host = window.location.hostname.toLowerCase();
  const portal = (import.meta.env.VITE_PORTAL_HOST as string | undefined)?.toLowerCase();
  if (!host || (portal && host === portal)) return null;
  const cached = readCache(host);
  if (cached !== undefined) return cached;

  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let slug: string | null = null;
  try {
    const res = await fetch(`/api/public/site-by-host?host=${encodeURIComponent(host)}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (res.ok) {
      const body = (await res.json()) as { slug?: unknown };
      slug = typeof body.slug === 'string' && body.slug ? body.slug : null;
    }
    writeCache(host, slug);
  } catch {
    // Timeout or network error: treat as the portal, and ask again next visit.
    slug = null;
  } finally {
    window.clearTimeout(timer);
  }
  return slug;
}
