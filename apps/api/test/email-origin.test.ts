// Links in sign-up and ambassador code emails point only at the platform's own address, whatever Origin a caller sends.
// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/email-origin.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.JWT_SECRET ??= 'local-test-secret-local-test-secret';
process.env.DATABASE_URL ??= 'postgresql://x:y@localhost:5432/none';
process.env.CORS_ORIGINS = 'https://portal.example.ng/';
process.env.PLATFORM_DOMAIN_TARGET = 'sites.example.ng';

/* eslint-disable @typescript-eslint/no-require-imports */
const { emailLinkOrigin } = require('../src/common/email-origin') as typeof import('../src/common/email-origin');

const req = (headers: Record<string, string>) => ({ headers, protocol: 'https' }) as never;

test('a forged Origin or X-Forwarded-Host is replaced by the platform address', () => {
  assert.equal(emailLinkOrigin(req({ origin: 'https://evil.example', host: 'portal.example.ng' })), 'https://portal.example.ng');
  assert.equal(emailLinkOrigin(req({ 'x-forwarded-host': 'evil.example', host: 'portal.example.ng' })), 'https://portal.example.ng');
});

test("the platform's own addresses are kept", () => {
  assert.equal(emailLinkOrigin(req({ origin: 'https://portal.example.ng' })), 'https://portal.example.ng');
  assert.equal(emailLinkOrigin(req({ origin: 'https://sites.example.ng' })), 'https://sites.example.ng');
});
