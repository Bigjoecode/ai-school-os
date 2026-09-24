import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions } from 'express';
import { isProduction } from '../config/env';

export interface AccessTokenPayload {
  sub: string;
  tid: string | null;
  sid: string;
  typ: 'access';
}

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const REFRESH_COOKIE = 'ais_rt';

export function newRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

/** Only the hash is stored, so a database leak doesn't leak live sessions. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: REFRESH_TOKEN_TTL_MS,
  };
}
