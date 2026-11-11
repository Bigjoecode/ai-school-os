// Nobody hands out more than they hold: users.manage alone must not mint a School Admin.
// No database: the controller runs against an in-memory stand-in for Prisma.
// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/rbac-grant.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { ALL_PERMISSIONS, type Permission } from '@aischool/shared';

process.env.JWT_SECRET ??= 'local-test-secret-local-test-secret';

/* eslint-disable @typescript-eslint/no-require-imports */
const { assertCanGrant } = require('../src/rbac/grant') as typeof import('../src/rbac/grant');
const { UsersController } = require('../src/rbac/users.controller') as typeof import('../src/rbac/users.controller');
const { RequestContextStore } = require('../src/common/request-context') as typeof import('../src/common/request-context');

const admin = { id: 'r-admin', key: 'school_admin', name: 'School Admin', permissions: [...ALL_PERMISSIONS] as string[] };
const teacher = { id: 'r-teacher', key: 'teacher', name: 'Teacher', permissions: ['school.read', 'students.read'] };

function fakePrisma(memberRoles: (typeof admin)[] = [teacher]) {
  const writes: string[] = [];
  const roles = [admin, teacher];
  const db = {
    role: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => roles.filter((r) => where.id.in.includes(r.id)) },
    membership: {
      findUniqueOrThrow: async () => ({ id: 'm-1', userId: 'someone-else', user: { firstName: 'A', lastName: 'B' }, roles: memberRoles.map((role) => ({ role })) }),
      update: async () => writes.push('membership.update'),
    },
  };
  const root = {
    $transaction: async () => {
      writes.push('transaction');
      return { id: 'm-new' };
    },
    membershipRole: { deleteMany: () => writes.push('deleteMany'), createMany: () => writes.push('createMany') },
  };
  return { prisma: { db, root } as never, writes };
}

const audit = { log: async () => undefined } as never;

function as<T>(permissions: Permission[], fn: () => Promise<T>) {
  return RequestContextStore.run({ userId: 'me', tenantId: 't-1', permissions: new Set(permissions) }, fn);
}

test('assertCanGrant: only roles whose permissions you hold', () => {
  assert.doesNotThrow(() => assertCanGrant(new Set(['school.read', 'students.read']), [teacher]));
  assert.throws(() => assertCanGrant(new Set(['users.manage']), [admin]), ForbiddenException);
  // Retired permission names on a role don't block (sign-in ignores them too).
  assert.doesNotThrow(() => assertCanGrant(new Set(['school.read']), [{ name: 'Old', permissions: ['school.read', 'retired.thing'] }]));
});

test('users.manage alone cannot invite a School Admin', async () => {
  const { prisma, writes } = fakePrisma();
  const c = new UsersController(prisma, audit);
  await assert.rejects(
    as(['users.read', 'users.manage'], () => c.invite({ email: 'x@example.com', firstName: 'X', lastName: 'Y', password: 'Password123!', roleIds: ['r-admin'] } as never)),
    ForbiddenException,
  );
  assert.deepEqual(writes, []);
});

test('users.manage alone cannot promote someone to School Admin', async () => {
  const { prisma, writes } = fakePrisma();
  const c = new UsersController(prisma, audit);
  await assert.rejects(as(['users.read', 'users.manage', 'school.read', 'students.read'], () => c.update('m-1', { roleIds: ['r-admin'] })), ForbiddenException);
  assert.deepEqual(writes, []);
});

test('users.manage alone cannot disable or demote a School Admin', async () => {
  const { prisma, writes } = fakePrisma([admin]);
  const c = new UsersController(prisma, audit);
  await assert.rejects(as(['users.read', 'users.manage', 'school.read', 'students.read'], () => c.update('m-1', { status: 'DISABLED' })), ForbiddenException);
  await assert.rejects(as(['users.read', 'users.manage', 'school.read', 'students.read'], () => c.update('m-1', { roleIds: ['r-teacher'] })), ForbiddenException);
  assert.deepEqual(writes, []);
});

test('a School Admin can still give any role', async () => {
  const { prisma, writes } = fakePrisma();
  const c = new UsersController(prisma, audit);
  await as([...ALL_PERMISSIONS], () => c.update('m-1', { roleIds: ['r-admin'] }));
  assert.ok(writes.includes('transaction'));
  const r = await as([...ALL_PERMISSIONS], () => c.invite({ email: 'x@example.com', firstName: 'X', lastName: 'Y', password: 'Password123!', roleIds: ['r-teacher'] } as never));
  assert.equal(r.membershipId, 'm-new');
});

test('someone with the permissions of the role can give it', async () => {
  const { prisma, writes } = fakePrisma();
  const c = new UsersController(prisma, audit);
  await as(['users.manage', 'school.read', 'students.read'], () => c.update('m-1', { roleIds: ['r-teacher'] }));
  assert.ok(writes.includes('transaction'));
});
