import { normaliseStartCode, type OfflinePack, type OfflinePackContent, type OfflineSeatEntry, type OfflineSeatSecret } from '@aischool/shared';

/**
 * WebCrypto for offline exam packs. Keys are made non-extractable: the device can use them
 * (decrypt the paper, sign the hand-in) but script can't read them out as bytes.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export function fromB64u(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

export function toB64u(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const byte of bytes) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const cryptoAvailable = () => typeof crypto !== 'undefined' && !!crypto.subtle;

async function pbkdf2Key(secret: string, salt: string, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: fromB64u(salt), iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
}

async function open<T>(key: CryptoKey, iv: string, ciphertext: string, aad: string): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64u(iv), additionalData: enc.encode(aad) }, key, fromB64u(ciphertext));
  return JSON.parse(dec.decode(plain)) as T;
}

export class WrongCodeError extends Error {}

/** The pack's content key from the invigilator's start code (PBKDF2, slow on purpose). */
export function deriveContentKey(pack: OfflinePack, code: string) {
  return pbkdf2Key(normaliseStartCode(code), pack.kdf.salt, pack.kdf.iterations);
}

/** The paper. A wrong code fails the AES-GCM check, so it throws WrongCodeError. */
export async function openContent(pack: OfflinePack, key: CryptoKey): Promise<OfflinePackContent> {
  try {
    return await open<OfflinePackContent>(key, pack.iv, pack.ciphertext, pack.packId);
  } catch {
    throw new WrongCodeError('That start code is not right for this exam.');
  }
}

/** One student's seat: with the content key (personal pack) or the start code + their exam PIN (exam device). */
export async function openSeat(pack: OfflinePack, entry: OfflineSeatEntry, contentKey: CryptoKey, code?: string, pin?: string): Promise<OfflineSeatSecret> {
  let key = contentKey;
  if (entry.salt) {
    if (!code || !pin) throw new WrongCodeError('Enter your exam PIN.');
    key = await pbkdf2Key(`${normaliseStartCode(code)}:${pin.trim()}`, entry.salt, pack.seatKdf?.iterations ?? 150_000);
  }
  try {
    return await open<OfflineSeatSecret>(key, entry.iv, entry.ciphertext, `seat:${entry.seatId}`);
  } catch {
    throw new WrongCodeError(entry.salt ? 'That PIN is not right. Check your PIN slip or ask the invigilator.' : 'This exam could not be opened.');
  }
}

export function importSigningKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromB64u(b64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

export async function sign(key: CryptoKey, payload: string): Promise<string> {
  return toB64u(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
}

export function randomId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : toB64u(crypto.getRandomValues(new Uint8Array(18)));
}
