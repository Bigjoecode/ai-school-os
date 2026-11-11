// Sign-in and input hardening, with no database: per-account limits on passwords and two-step codes,
// refresh-token rotation under a race, formula-safe CSV cells, and links that must be web links.
// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/auth-hardening.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { liveClassSchema, pushSubscriptionSchema, submitHomeworkSchema } from '@aischool/shared';

process.env.JWT_SECRET ??= 'local-test-secret-local-test-secret';
process.env.DATABASE_URL ??= 'postgresql://x:y@localhost:5432/none';

/* eslint-disable @typescript-eslint/no-require-imports */
const { AuthService, LOGIN_FAILURES_PER_ACCOUNT, TWO_FACTOR_FAILURES_PER_ACCOUNT } = require('../src/auth/auth.service') as typeof import('../src/auth/auth.service');
const { AttemptLimiter } = require('../src/auth/attempt-limiter') as typeof import('../src/auth/attempt-limiter');
const { hashPassword } = require('../src/auth/password') as typeof import('../src/auth/password');
const { hashToken } = require('../src/auth/tokens') as typeof import('../src/auth/tokens');
const { csvCell } = require('../src/onboarding/csv') as typeof import('../src/onboarding/csv');

const status = (err: unknown) => (err as { getStatus?: () => number }).getStatus?.();

function makeAuth(over: { users?: Record<string, unknown>[]; sessions?: Record<string, unknown>[]; rotateCounts?: number[] } = {}) {
  const users = over.users ?? [];
  const sessions = over.sessions ?? [];
  const rotateCounts = [...(over.rotateCounts ?? [])];
  const revoked: unknown[] = [];
  const audits: string[] = [];
  const prisma = {
    root: {
      user: {
        findUnique: async ({ where }: { where: { email?: string; id?: string } }) => users.find((u) => (where.email ? u.email === where.email : u.id === where.id)) ?? null,
        update: async () => ({}),
      },
      authSession: {
        findUnique: async ({ where }: { where: { tokenHash: string } }) => sessions.find((s) => s.tokenHash === where.tokenHash) ?? null,
        updateMany: async (args: { where: { id?: string; familyId?: string } }) => {
          if (args.where.familyId) {
            revoked.push(args.where.familyId);
            return { count: 1 };
          }
          return { count: rotateCounts.length ? rotateCounts.shift()! : 1 };
        },
        create: async () => ({ id: 'new-session' }),
      },
      tenantDomain: { findUnique: async () => null },
      membership: { findFirst: async () => ({ tenantId: 't1' }) },
    },
  };
  const jwt = { signAsync: async () => 'access-token' };
  const access = { me: async () => ({ user: { platformRole: null }, tenant: { id: 't1', name: 'School' } }) };
  const audit = { log: async (e: { action: string }) => void audits.push(e.action) };
  const twoFactor = {
    issueChallenge: async () => 'challenge',
    readChallenge: async () => ({ sub: 'u1', tid: 't1', jti: `j${Math.random()}`, typ: '2fa' }),
    checkSecondFactor: async (_u: unknown, input: { code?: string }) => (input.code === '123456' ? 'totp' : null),
    noteFailedAttempt: () => undefined,
    markChallengeUsed: () => undefined,
  };
  const demo = { allows: async () => true, closedTenantIds: async () => [] };
  const svc = new AuthService(prisma as never, jwt as never, access as never, audit as never, twoFactor as never, demo as never);
  return { svc, revoked, audits };
}

test('AttemptLimiter blocks after the limit and opens again when the window passes', () => {
  const l = new AttemptLimiter(3, 1000);
  for (let i = 0; i < 3; i++) {
    assert.equal(l.blockedFor('a', 0), 0);
    l.fail('a', 0);
  }
  assert.ok(l.blockedFor('a', 10) > 0);
  assert.equal(l.blockedFor('b', 10), 0, 'other accounts are unaffected');
  assert.equal(l.blockedFor('a', 1000), 0, 'the window ends');
});

test('password guesses for one account are capped across IPs, the same for unknown and known accounts', async () => {
  const passwordHash = await hashPassword('correct horse battery');
  const user = { id: 'u1', email: 'head@school.ng', passwordHash, status: 'ACTIVE', platformRole: null, totpEnabledAt: null, firstName: 'A', lastName: 'B' };
  const { svc } = makeAuth({ users: [user] });

  for (let i = 0; i < LOGIN_FAILURES_PER_ACCOUNT; i++) {
    await assert.rejects(svc.login({ email: user.email, password: `guess-${i}` }, { ip: `10.0.0.${i}` }), (e) => status(e) === 401);
  }
  // Now even the right password is refused for a while (a guesser can't tell when they hit it).
  await assert.rejects(svc.login({ email: user.email, password: 'correct horse battery' }, { ip: '10.9.9.9' }), (e) => status(e) === 429);

  // An account that doesn't exist behaves exactly the same.
  const ghost = 'nobody@school.ng';
  for (let i = 0; i < LOGIN_FAILURES_PER_ACCOUNT; i++) {
    await assert.rejects(svc.login({ email: ghost, password: `guess-${i}` }, {}), (e) => status(e) === 401);
  }
  await assert.rejects(svc.login({ email: ghost, password: 'x' }, {}), (e) => status(e) === 429);
});

test('a right password clears the count; other accounts sign in normally', async () => {
  const passwordHash = await hashPassword('correct horse battery');
  const user = { id: 'u2', email: 'bursar@school.ng', passwordHash, status: 'ACTIVE', platformRole: null, totpEnabledAt: null, firstName: 'A', lastName: 'B' };
  const { svc } = makeAuth({ users: [user] });
  for (let i = 0; i < 5; i++) await assert.rejects(svc.login({ email: user.email, password: 'nope' }, {}));
  const ok = await svc.login({ email: user.email, password: 'correct horse battery' }, {});
  assert.ok('refreshToken' in ok);
});

test('wrong two-step codes are capped per account across fresh challenges', async () => {
  const user = { id: 'u1', email: 'head@school.ng', status: 'ACTIVE', totpEnabledAt: new Date(), totpSecret: 'x', recoveryCodes: [], firstName: 'A', lastName: 'B' };
  const { svc } = makeAuth({ users: [user] });
  for (let i = 0; i < TWO_FACTOR_FAILURES_PER_ACCOUNT; i++) {
    await assert.rejects(svc.completeTwoFactor({ challenge: `c${i}`, code: '000000' } as never, {}), (e) => status(e) === 401);
  }
  // Even the right code is refused until the window ends.
  await assert.rejects(svc.completeTwoFactor({ challenge: 'fresh', code: '123456' } as never, {}), (e) => status(e) === 429);
});

test('refresh: a token rotated by a racing request counts as reuse and ends the whole family', async () => {
  const token = 'refresh-token-value';
  const session = { id: 's1', userId: 'u1', tenantId: 't1', familyId: 'fam1', tokenHash: hashToken(token), revokedAt: null, rotatedAt: null, expiresAt: new Date(Date.now() + 60_000) };
  // First request claims the rotation (count 1); the racing second finds it already claimed (count 0).
  const { svc, revoked, audits } = makeAuth({ sessions: [session], rotateCounts: [1, 0] });
  const first = await svc.refresh(token, {});
  assert.ok(first.refreshToken);
  await assert.rejects(svc.refresh(token, {}), (e) => status(e) === 401);
  assert.deepEqual(revoked, ['fam1']);
  assert.ok(audits.includes('auth.token_reuse'));
});

test('CSV cells: text that looks like a formula is kept as text', () => {
  assert.equal(csvCell('=HYPERLINK("http://evil","Click")'), `"'=HYPERLINK(""http://evil"",""Click"")"`);
  assert.equal(csvCell('+2348012345678'), '+2348012345678', 'a phone number stays a number');
  assert.equal(csvCell('@SUM(A1)'), `'@SUM(A1)`);
  assert.equal(csvCell('-cmd'), `'-cmd`);
  assert.equal(csvCell('-12.5'), '-12.5');
  assert.equal(csvCell(-3), '-3');
  assert.equal(csvCell('Ada Obi'), 'Ada Obi');
});

test('meeting and homework links must be web links', () => {
  const base = { title: 'Maths', classArmId: 'arm', provider: 'EXTERNAL', startsAt: '2026-11-20T09:00:00+01:00', durationMinutes: 40 };
  assert.equal(liveClassSchema.safeParse({ ...base, joinUrl: 'javascript:fetch("/api/auth/refresh")' }).success, false);
  assert.equal(liveClassSchema.safeParse({ ...base, joinUrl: 'data:text/html,<script>1</script>' }).success, false);
  assert.equal(liveClassSchema.safeParse({ ...base, joinUrl: 'https://meet.jit.si/maths-ss2' }).success, true);
  assert.equal(submitHomeworkSchema.safeParse({ links: ['javascript:alert(1)'] }).success, false);
  assert.equal(submitHomeworkSchema.safeParse({ links: ['https://docs.google.com/x'] }).success, true);
});

test('push endpoints must be public https push services', () => {
  const keys = { p256dh: 'BOr5aVvYc2c1aJmH', auth: 'abcdefgh' };
  for (const endpoint of ['http://fcm.googleapis.com/fcm/send/x', 'https://127.0.0.1:8080/x', 'https://localhost/x', 'https://[::1]/x', 'https://169.254.169.254/latest', 'https://intranet/x', 'https://db.internal/x']) {
    assert.equal(pushSubscriptionSchema.safeParse({ endpoint, keys }).success, false, endpoint);
  }
  for (const endpoint of ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/abc', 'https://web.push.apple.com/abc']) {
    assert.equal(pushSubscriptionSchema.safeParse({ endpoint, keys }).success, true, endpoint);
  }
});
