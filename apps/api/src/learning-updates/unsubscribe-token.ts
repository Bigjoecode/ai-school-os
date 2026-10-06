import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';

/**
 * Signed "stop these updates" links for emails and text messages: the
 * guardian's id plus a short HMAC, so the link works without signing in and
 * can't be forged for someone else.
 */
const sign = (guardianId: string) => createHmac('sha256', env().JWT_SECRET).update(`learning-updates-stop:${guardianId}`).digest('base64url').slice(0, 16);

export function stopToken(guardianId: string): string {
  return `${guardianId}.${sign(guardianId)}`;
}

/** The guardian id, or null for a bad or tampered token. */
export function readStopToken(token: string): string | null {
  const [id, sig] = token.split('.');
  if (!id || !sig || !/^[a-z0-9]{10,40}$/i.test(id)) return null;
  const want = Buffer.from(sign(id));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}
