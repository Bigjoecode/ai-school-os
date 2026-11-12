import type { Request } from 'express';
import { env } from '../config/env';

const bare = (o: string) => o.trim().replace(/\/+$/, '').toLowerCase();

/** The address the request says it came from (Origin, else X-Forwarded-Proto/Host, else Host). Caller-controlled: never trust it alone. */
export function requestOrigin(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? req.protocol;
  const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host;
  return (req.headers.origin as string | undefined) ?? `${proto}://${host}`;
}

/**
 * The platform's own web addresses: CORS_ORIGINS, then PLATFORM_DOMAIN_TARGET.
 * In production only public https addresses count, so a leftover development entry
 * (e.g. http://localhost:5173 copied from .env.example) can never become a payment
 * callback or an email link.
 */
export function platformOrigins(): string[] {
  const e = env();
  const all = [...e.CORS_ORIGINS, ...(e.PLATFORM_DOMAIN_TARGET ? [`https://${e.PLATFORM_DOMAIN_TARGET}`] : [])].map(bare).filter(Boolean);
  if (e.NODE_ENV !== 'production') return all;
  return all.filter((o) => {
    try {
      const u = new URL(o);
      return u.protocol === 'https:' && !/^(localhost|127\.|10\.|192\.168\.|\[?::1\]?$)/.test(u.hostname) && !u.hostname.endsWith('.localhost');
    } catch {
      return false;
    }
  });
}

/**
 * Where links go in an email sent to an address someone typed without signing
 * in (sign-up and ambassador confirmation codes). The Origin and
 * X-Forwarded-Host headers are whatever the caller sends, so a script could
 * otherwise have the platform email a stranger a code link to its own site.
 * Only the platform's own addresses are used; the request's address only when
 * it is one of them, or when none are configured (local development).
 */
export function emailLinkOrigin(req: Request): string {
  const allowed = platformOrigins();
  const asked = bare(requestOrigin(req));
  if (!allowed.length) {
    if (env().NODE_ENV !== 'production') return asked;
    // Production with nothing configured: the Host header (Apache only routes this site's own names here).
    const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? req.protocol;
    return `${proto}://${req.headers.host ?? ''}`;
  }
  return allowed.includes(asked) ? asked : allowed[0]!;
}

/**
 * Like emailLinkOrigin, but also keeps a verified web address of the school itself (its own
 * domain), for flows that start on the school's website or pay page: payment callbacks there
 * must come back to the same site. Any other address is replaced by the platform's.
 */
export async function schoolLinkOrigin(req: Request, tenantId: string, verifiedHosts: (tenantId: string, host: string) => Promise<boolean>): Promise<string> {
  const asked = bare(requestOrigin(req));
  const safe = emailLinkOrigin(req);
  if (safe === asked) return safe;
  let url: URL;
  try {
    url = new URL(asked);
  } catch {
    return safe;
  }
  if (url.protocol !== 'https:' || url.port || url.pathname !== '/') return safe;
  return (await verifiedHosts(tenantId, url.hostname)) ? `https://${url.hostname}` : safe;
}
