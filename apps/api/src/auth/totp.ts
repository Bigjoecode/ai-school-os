import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Time-based one-time passwords (RFC 6238 over RFC 4226), as used by Google
 * Authenticator, Microsoft Authenticator, Authy and 1Password: HMAC-SHA1,
 * 30-second steps, 6 digits. Built on node:crypto so there is nothing to
 * install on shared hosting.
 */
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Accept the previous and next step too, for phones whose clocks drift a little. */
export const TOTP_WINDOW = 1;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret (the size RFC 4226 recommends for SHA-1), base32-encoded. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** HOTP (RFC 4226) for one counter value. */
export function hotp(key: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', key).update(msg).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin =
    ((mac[offset]! & 0x7f) << 24) | ((mac[offset + 1]! & 0xff) << 16) | ((mac[offset + 2]! & 0xff) << 8) | (mac[offset + 3]! & 0xff);
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export function totpStep(atMs = Date.now()): number {
  return Math.floor(atMs / 1000 / TOTP_STEP_SECONDS);
}

/** The code an app would show for a base32 secret at a moment in time. */
export function totpCode(secretBase32: string, atMs = Date.now(), digits = TOTP_DIGITS): string {
  return hotp(base32Decode(secretBase32), totpStep(atMs), digits);
}

/**
 * Checks a code within ±TOTP_WINDOW steps. Returns the matching step (so the
 * caller can refuse to accept the same step twice) or null.
 */
export function verifyTotp(secretBase32: string, code: string, atMs = Date.now()): number | null {
  const clean = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const key = base32Decode(secretBase32);
  const now = totpStep(atMs);
  let match: number | null = null;
  // Check every step in the window (no early exit) so timing doesn't reveal which one matched.
  for (let step = now - TOTP_WINDOW; step <= now + TOTP_WINDOW; step++) {
    const expected = Buffer.from(hotp(key, step));
    if (timingSafeEqual(expected, Buffer.from(clean)) && match === null) match = step;
  }
  return match;
}

/** otpauth:// URI understood by authenticator apps (and turned into the QR code). */
export function otpauthUrl(secretBase32: string, accountName: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ------------------------------------------------------------ recovery codes

// No 0/o/1/l/i so codes read back cleanly from paper.
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** A 10-character code shown as "abcde-fghjk". About 49 bits of randomness each. */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(10);
  let out = '';
  for (const b of bytes) out += RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

export function normaliseRecoveryCode(code: string): string {
  return code.replace(/[\s-]+/g, '').toLowerCase();
}

/**
 * Recovery codes are random and single use, so a keyed SHA-256 is enough
 * (scrypt would make checking ten of them on every attempt slow). The user ID
 * is mixed in so identical codes never share a hash.
 */
export function hashRecoveryCode(userId: string, code: string): string {
  return createHash('sha256').update(`recovery:${userId}:${normaliseRecoveryCode(code)}`).digest('hex');
}
