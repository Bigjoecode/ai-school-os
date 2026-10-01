import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { env } from '../config/env';

/**
 * Encrypts secrets at rest (AES-256-GCM). Format: "v1:<iv>:<tag>:<ciphertext>",
 * base64url parts. The key comes from APP_ENCRYPTION_KEY, which must never
 * change once secrets have been saved with it.
 */
function key(): Buffer {
  const secret = env().APP_ENCRYPTION_KEY;
  if (!secret) {
    throw new ServiceUnavailableException('The server has no APP_ENCRYPTION_KEY set, so it cannot store payment keys yet');
  }
  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join(':');
}

export function decryptSecret(box: string): string {
  const [v, iv, tag, data] = box.split(':');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Unrecognised secret format');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
