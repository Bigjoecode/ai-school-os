// In production a leftover development CORS entry (http://localhost:5173 from .env.example) must never
// become a payment callback or an email link: only public https platform addresses count.
// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/email-origin-prod.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.JWT_SECRET ??= 'local-test-secret-local-test-secret';
process.env.DATABASE_URL ??= 'postgresql://x:y@localhost:5432/none';
process.env.NODE_ENV = 'production';
process.env.CORS_ORIGINS = 'http://localhost:5173,https://portal.example.ng';
delete process.env.PLATFORM_DOMAIN_TARGET;

/* eslint-disable @typescript-eslint/no-require-imports */
const { emailLinkOrigin, platformOrigins } = require('../src/common/email-origin') as typeof import('../src/common/email-origin');

const req = (headers: Record<string, string>) => ({ headers, protocol: 'https' }) as never;

test('production ignores local and plain-http entries', () => {
  assert.deepEqual(platformOrigins(), ['https://portal.example.ng']);
  assert.equal(emailLinkOrigin(req({ origin: 'http://localhost:5173', host: 'portal.example.ng' })), 'https://portal.example.ng');
  assert.equal(emailLinkOrigin(req({ origin: 'https://evil.example', host: 'portal.example.ng' })), 'https://portal.example.ng');
});
