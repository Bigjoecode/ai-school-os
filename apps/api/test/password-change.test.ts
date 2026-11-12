// Changing your own password, an admin resetting a member's, and ended sessions stopping at once —
// with no database (Prisma, audit and the access lookup are stand-ins).
// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/password-change.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PASSWORD_CHANGE_REQUIRED } from '@aischool/shared';

process.env.JWT_SECRET ??= 'local-test-secret-local-test-secret';
process.env.DATABASE_URL ??= 'postgresql://x:y@localhost:5432/none';

/* eslint-disable @typescript-eslint/no-require-imports */
const { PasswordService, WRONG_CURRENT_PASSWORD_LIMIT, generatePassword } = require('../src/auth/password.service') as typeof import('../src/auth/password.service');
const { AuthGuard } = require('../src/auth/auth.guard') as typeof import('../src/auth/auth.guard');
const { hashPassword, verifyPassword } = require('../src/auth/password') as typeof import('../src/auth/password');
const { RequestContextStore } = require('../src/common/request-context') as typeof import('../src/common/request-context');

const status = (err: unknown) => (err as { getStatus?: () => number }).getStatus?.();

interface Session {
  id: string;
  userId: string;
  familyId: string;
  revokedAt: Date | null;
}
interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  platformRole: string | null;
  mustChangePassword: boolean;
}

function world(opts: { users: User[]; sessions: Session[]; memberships?: { id: string; tenantId: string; userId: string; perms: string[] }[]; ambassadors?: string[] }) {
  const { users, sessions } = opts;
  const memberships = opts.memberships ?? [];
  const audits: { action: string; metadata?: unknown }[] = [];
  const prisma = {
    root: {
      user: {
        findUnique: async ({ where }: { where: { id: string } }) => users.find((u) => u.id === where.id) ?? null,
        update: async ({ where, data }: { where: { id: string }; data: Partial<User> }) => Object.assign(users.find((u) => u.id === where.id)!, data),
      },
      authSession: {
        findUnique: async ({ where }: { where: { id: string } }) => sessions.find((s) => s.id === where.id) ?? null,
        updateMany: async ({ where, data }: { where: { userId: string; revokedAt: null; familyId?: { not: string } }; data: { revokedAt: Date } }) => {
          const hit = sessions.filter((s) => s.userId === where.userId && !s.revokedAt && (!where.familyId || s.familyId !== where.familyId.not));
          hit.forEach((s) => (s.revokedAt = data.revokedAt));
          return { count: hit.length };
        },
      },
      membership: {
        findFirst: async ({ where }: { where: { id: string; tenantId: string } }) => {
          const m = memberships.find((x) => x.id === where.id && x.tenantId === where.tenantId);
          if (!m) return null;
          return { ...m, user: users.find((u) => u.id === m.userId)!, roles: [{ role: { name: 'Their role', permissions: m.perms } }] };
        },
        count: async ({ where }: { where: { userId: string; tenantId: { not: string } } }) =>
          memberships.filter((m) => m.userId === where.userId && m.tenantId !== where.tenantId.not).length,
      },
      ambassador: { count: async ({ where }: { where: { userId: string } }) => (opts.ambassadors ?? []).filter((u) => u === where.userId).length },
      notification: { create: async () => ({}) },
      $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
    },
  };
  const audit = { log: async (e: { action: string; metadata?: unknown }) => void audits.push(e) };
  const svc = new PasswordService(prisma as never, audit as never);
  return { svc, audits, users, sessions };
}

async function person(id: string, password: string, over: Partial<User> = {}): Promise<User> {
  return { id, email: `${id}@school.ng`, firstName: id, lastName: 'Test', passwordHash: await hashPassword(password), platformRole: null, mustChangePassword: false, ...over };
}

const live = (s: Session[]) => s.filter((x) => !x.revokedAt).map((x) => x.id);

test('a wrong current password is refused, and repeated guesses are capped', async () => {
  const u = await person('teacher', 'old-password-123');
  const { svc, users, audits } = world({ users: [u], sessions: [] });
  const before = u.passwordHash;
  await assert.rejects(
    svc.changeOwn({ userId: 'teacher', sessionId: undefined, tenantId: 't1' }, { currentPassword: 'wrong-guess', newPassword: 'brand-new-password' }),
    (e) => status(e) === 400,
  );
  assert.equal(users[0].passwordHash, before, 'nothing changed');
  assert.equal(audits[0].action, 'auth.password_change_failed');
  for (let i = 1; i < WRONG_CURRENT_PASSWORD_LIMIT; i++) {
    await assert.rejects(svc.changeOwn({ userId: 'teacher', sessionId: undefined, tenantId: 't1' }, { currentPassword: `guess-${i}`, newPassword: 'brand-new-password' }));
  }
  // Even the right password waits once the limit is reached.
  await assert.rejects(
    svc.changeOwn({ userId: 'teacher', sessionId: undefined, tenantId: 't1' }, { currentPassword: 'old-password-123', newPassword: 'brand-new-password' }),
    (e) => status(e) === 429,
  );
});

test('changing the password ends every other session but keeps the current one', async () => {
  const u = await person('bursar', 'old-password-123', { mustChangePassword: true });
  const sessions: Session[] = [
    { id: 's-current', userId: 'bursar', familyId: 'f-here', revokedAt: null },
    { id: 's-current-older', userId: 'bursar', familyId: 'f-here', revokedAt: null },
    { id: 's-phone', userId: 'bursar', familyId: 'f-phone', revokedAt: null },
    { id: 's-laptop', userId: 'bursar', familyId: 'f-laptop', revokedAt: null },
    { id: 's-someone-else', userId: 'other', familyId: 'f-x', revokedAt: null },
  ];
  const { svc, audits, users } = world({ users: [u], sessions });
  const r = await svc.changeOwn({ userId: 'bursar', sessionId: 's-current', tenantId: 't1' }, { currentPassword: 'old-password-123', newPassword: 'a-much-better-passphrase' });
  assert.equal(r.otherSessionsEnded, 2);
  assert.deepEqual(live(sessions), ['s-current', 's-current-older', 's-someone-else']);
  assert.ok(await verifyPassword('a-much-better-passphrase', users[0].passwordHash));
  assert.equal(users[0].mustChangePassword, false, 'an admin-reset flag is cleared');
  assert.equal(audits.at(-1)!.action, 'auth.password_changed');
});

test('the new password may not be the account email', async () => {
  const u = await person('head', 'old-password-123');
  const { svc } = world({ users: [u], sessions: [] });
  await assert.rejects(svc.changeOwn({ userId: 'head', sessionId: undefined, tenantId: null }, { currentPassword: 'old-password-123', newPassword: 'head@school.ng' }), (e) => status(e) === 400);
});

const ADMIN_PERMS = ['users.read', 'users.manage', 'school.manage', 'finance.manage', 'students.read'];

test('an admin reset sets a new password, ends all the member’s sessions and asks them to change it', async () => {
  const target = await person('teacher', 'old-password-123');
  const sessions: Session[] = [
    { id: 'a', userId: 'teacher', familyId: 'f1', revokedAt: null },
    { id: 'b', userId: 'teacher', familyId: 'f2', revokedAt: null },
    { id: 'c', userId: 'admin', familyId: 'f3', revokedAt: null },
  ];
  const { svc, users, audits } = world({ users: [target], sessions, memberships: [{ id: 'm1', tenantId: 't1', userId: 'teacher', perms: ['students.read'] }] });
  const actor = { userId: 'admin', tenantId: 't1', permissions: new Set(ADMIN_PERMS) };

  const typed = await svc.adminReset(actor, 'm1', 'typed-by-admin-123');
  assert.equal(typed.generatedPassword, null);
  assert.equal(typed.sessionsEnded, 2);
  assert.deepEqual(live(sessions), ['c'], 'only the admin’s own session is left');
  assert.equal(users[0].mustChangePassword, true);
  assert.ok(await verifyPassword('typed-by-admin-123', users[0].passwordHash));
  assert.equal(audits.at(-1)!.action, 'auth.password_reset');

  const gen = await svc.adminReset(actor, 'm1', undefined);
  assert.match(gen.generatedPassword!, /^[A-Za-z2-9]{5}-[A-Za-z2-9]{5}-[A-Za-z2-9]{5}$/);
  assert.ok(await verifyPassword(gen.generatedPassword!, users[0].passwordHash));
  assert.notEqual(generatePassword(), generatePassword());
});

test('an under-privileged manager cannot reset an admin; nobody resets themselves, platform staff or shared accounts here', async () => {
  const admin = await person('admin', 'admin-password-123');
  const me = await person('manager', 'manager-password-1');
  const staff = await person('support', 'support-password-1', { platformRole: 'SUPPORT_ADMIN' });
  const twoSchools = await person('parent', 'parent-password-1');
  const sessions: Session[] = [{ id: 'adm', userId: 'admin', familyId: 'fa', revokedAt: null }];
  const { svc, users } = world({
    users: [admin, me, staff, twoSchools],
    sessions,
    memberships: [
      { id: 'm-admin', tenantId: 't1', userId: 'admin', perms: ADMIN_PERMS },
      { id: 'm-me', tenantId: 't1', userId: 'manager', perms: ['users.read', 'users.manage'] },
      { id: 'm-staff', tenantId: 't1', userId: 'support', perms: [] },
      { id: 'm-parent', tenantId: 't1', userId: 'parent', perms: ['portal.read'] },
      { id: 'm-parent-2', tenantId: 't2', userId: 'parent', perms: ['portal.read'] },
    ],
  });
  const manager = { userId: 'manager', tenantId: 't1', permissions: new Set(['users.read', 'users.manage', 'portal.read']) };
  const before = admin.passwordHash;

  await assert.rejects(svc.adminReset(manager, 'm-admin', 'takeover-pass-123'), (e) => status(e) === 403);
  assert.equal(users[0].passwordHash, before);
  assert.deepEqual(live(sessions), ['adm'], 'the admin stays signed in');

  await assert.rejects(svc.adminReset(manager, 'm-me', 'my-own-pass-123'), (e) => status(e) === 400);
  await assert.rejects(svc.adminReset(manager, 'm-staff', 'staff-pass-1234'), (e) => status(e) === 403);
  await assert.rejects(svc.adminReset(manager, 'm-parent', 'parent-pass-123'), (e) => status(e) === 403);
  // A membership of another school is not found from this one.
  await assert.rejects(svc.adminReset(manager, 'm-parent-2', 'parent-pass-123'), (e) => status(e) === 404);
});

// ------------------------------------------------------------------ guard

function guardFor(sessions: Session[], userOver: { mustChangePassword?: boolean } = {}, allowWithout2fa = false) {
  const reflector = { getAllAndOverride: (key: string) => (key === 'allowWithoutTwoFactor' ? allowWithout2fa : undefined) };
  const jwt = { verifyAsync: async (t: string) => JSON.parse(t) };
  const access = {
    resolve: async (userId: string, tenantId: string | null, sessionId?: string) => ({
      user: { id: userId, email: 'x@school.ng', firstName: 'X', lastName: 'Y', avatarUrl: null, platformRole: null, status: 'ACTIVE', twoFactorEnabled: false, mustChangePassword: !!userOver.mustChangePassword },
      tenant: { id: tenantId ?? 't1', status: 'ACTIVE' },
      roles: [],
      permissions: new Set(),
      ...(sessionId !== undefined ? { sessionLive: sessions.some((s) => s.id === sessionId && s.userId === userId && !s.revokedAt) } : {}),
    }),
  };
  const ok = { allows: async () => true, assert: async () => undefined, mustEnrolFirst: async () => false, assertRequest: async () => undefined, assertWritable: async () => undefined };
  const guard = new AuthGuard(reflector as never, jwt as never, access as never, ok as never, ok as never, ok as never, ok as never, ok as never);
  const run = (payload: Record<string, unknown>) => {
    const req = { headers: { authorization: `Bearer ${JSON.stringify(payload)}` }, path: '/api/students', method: 'GET' };
    const context = { getHandler: () => undefined, getClass: () => undefined, switchToHttp: () => ({ getRequest: () => req }) };
    return RequestContextStore.run({ permissions: new Set() }, () => guard.canActivate(context as never));
  };
  return run;
}

test('the guard rejects an access token whose session was ended (or is missing), and lets a live one through', async () => {
  const sessions: Session[] = [
    { id: 's-live', userId: 'u1', familyId: 'f1', revokedAt: null },
    { id: 's-ended', userId: 'u1', familyId: 'f2', revokedAt: new Date() },
  ];
  const run = guardFor(sessions);
  const token = (sid?: string, sub = 'u1') => ({ sub, tid: 't1', sid, typ: 'access' });
  assert.equal(await run(token('s-live')), true);
  await assert.rejects(run(token('s-ended')), (e) => status(e) === 401);
  await assert.rejects(run(token('s-gone')), (e) => status(e) === 401);
  await assert.rejects(run(token(undefined)), (e) => status(e) === 401, 'a token with no session is refused');
  await assert.rejects(run(token('s-live', 'u2')), (e) => status(e) === 401, "someone else's session is refused");

  // Signing out (or a password change) ends the session: the same token stops at once.
  sessions[0].revokedAt = new Date();
  await assert.rejects(run(token('s-live')), (e) => status(e) === 401);
});

test('after an admin reset only the allowed routes stay open until the password is changed', async () => {
  const sessions: Session[] = [{ id: 's', userId: 'u1', familyId: 'f', revokedAt: null }];
  const token = { sub: 'u1', tid: 't1', sid: 's', typ: 'access' };
  await assert.rejects(guardFor(sessions, { mustChangePassword: true })(token), (e) => {
    const err = e as { getStatus: () => number; getResponse: () => { code?: string } };
    return err.getStatus() === 403 && err.getResponse().code === PASSWORD_CHANGE_REQUIRED;
  });
  assert.equal(await guardFor(sessions, { mustChangePassword: true }, true)(token), true, 'change-password and profile routes stay open');
});
