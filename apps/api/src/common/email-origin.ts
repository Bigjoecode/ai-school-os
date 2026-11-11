import type { Request } from 'express';
import { env } from '../config/env';
import { siteOrigin } from '../finance/finance.controller';

const bare = (o: string) => o.trim().replace(/\/+$/, '').toLowerCase();

/** The platform's own web addresses: CORS_ORIGINS, then PLATFORM_DOMAIN_TARGET. */
export function platformOrigins(): string[] {
  const e = env();
  return [...e.CORS_ORIGINS, ...(e.PLATFORM_DOMAIN_TARGET ? [`https://${e.PLATFORM_DOMAIN_TARGET}`] : [])].map(bare).filter(Boolean);
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
  const asked = bare(siteOrigin(req));
  if (!allowed.length) {
    if (env().NODE_ENV !== 'production') return asked;
    // Production with nothing configured: the Host header (Apache only routes this site's own names here).
    const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? req.protocol;
    return `${proto}://${req.headers.host ?? ''}`;
  }
  return allowed.includes(asked) ? asked : allowed[0]!;
}
