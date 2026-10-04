// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/totp.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  base32Decode,
  base32Encode,
  generateRecoveryCode,
  generateTotpSecret,
  hashRecoveryCode,
  hotp,
  totpCode,
  verifyTotp,
} from '../src/auth/totp';

const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii');
const RFC_SECRET_B32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('base32 round trip and RFC secret encoding', () => {
  assert.equal(base32Encode(RFC_SECRET), RFC_SECRET_B32);
  assert.deepEqual(base32Decode(RFC_SECRET_B32), RFC_SECRET);
  const s = generateTotpSecret();
  assert.equal(s.length, 32);
  assert.equal(base32Decode(s).length, 20);
});

test('RFC 4226 appendix D HOTP vectors', () => {
  const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  expected.forEach((code, counter) => assert.equal(hotp(RFC_SECRET, counter), code));
});

test('RFC 6238 appendix B TOTP vectors (SHA-1, 8 digits)', () => {
  const vectors: [number, string][] = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];
  for (const [t, code] of vectors) assert.equal(totpCode(RFC_SECRET_B32, t * 1000, 8), code);
});

test('verifyTotp accepts ±1 step and rejects others', () => {
  const now = 1_700_000_000_000;
  const step = Math.floor(now / 30_000);
  assert.equal(verifyTotp(RFC_SECRET_B32, totpCode(RFC_SECRET_B32, now), now), step);
  assert.equal(verifyTotp(RFC_SECRET_B32, totpCode(RFC_SECRET_B32, now - 30_000), now), step - 1);
  assert.equal(verifyTotp(RFC_SECRET_B32, totpCode(RFC_SECRET_B32, now + 30_000), now), step + 1);
  assert.equal(verifyTotp(RFC_SECRET_B32, totpCode(RFC_SECRET_B32, now - 90_000), now), null);
  assert.equal(verifyTotp(RFC_SECRET_B32, 'abcdef', now), null);
  assert.equal(verifyTotp(RFC_SECRET_B32, '12345', now), null);
});

test('recovery codes are formatted and hashed per user', () => {
  const c = generateRecoveryCode();
  assert.match(c, /^[a-z2-9]{5}-[a-z2-9]{5}$/);
  assert.equal(hashRecoveryCode('u1', c), hashRecoveryCode('u1', c.toUpperCase().replace('-', ' ')));
  assert.notEqual(hashRecoveryCode('u1', c), hashRecoveryCode('u2', c));
});
