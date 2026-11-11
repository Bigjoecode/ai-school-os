// Authorization fixes found in the pre-launch audit, each against in-memory stand-ins (no database):
//  - a school's website preview link must not open another school's draft news posts;
//  - a teacher may not move homework into a subject they don't teach;
//  - a sponsorship keeps only the school's own classes (another school's class names were listed back).
// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/authz-scope.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException } from '@nestjs/common';

process.env.JWT_SECRET ??= 'local-test-secret-local-test-secret';

/* eslint-disable @typescript-eslint/no-require-imports */
const { PublicSiteController } = require('../src/website/public-site.controller') as typeof import('../src/website/public-site.controller');
const { LiveController } = require('../src/live/live.controller') as typeof import('../src/live/live.controller');
const { CommerceService } = require('../src/commerce/commerce.service') as typeof import('../src/commerce/commerce.service');
const { RequestContextStore } = require('../src/common/request-context') as typeof import('../src/common/request-context');

const x = undefined as never;

function siteWith(previewTid: string | null, slugTenant: string) {
  const asked: Record<string, unknown>[] = [];
  const prisma = { db: { websitePost: { findFirst: async ({ where }: { where: Record<string, unknown> }) => (asked.push(where), { slug: 'p', title: 'T', body: '', status: 'DRAFT', publishedAt: null, createdAt: new Date(), updatedAt: new Date() }) } } };
  const site = { siteTenant: async () => ({ id: slugTenant }) };
  const jwt = { verifyAsync: async () => ({ typ: 'site-preview', tid: previewTid }) };
  return { c: new PublicSiteController(prisma as never, site as never, x, x, jwt as never, x, x, x), asked };
}

test("another school's preview link only sees published posts", async () => {
  const { c, asked } = siteWith('school-A', 'school-B');
  await RequestContextStore.run({ permissions: new Set() }, () => c.post('school-b', 'fee-increase', 'token-of-A').catch(() => null));
  assert.equal(asked[0]?.status, 'PUBLISHED');
});

test("the school's own preview link still shows drafts", async () => {
  const { c, asked } = siteWith('school-B', 'school-B');
  await RequestContextStore.run({ permissions: new Set() }, () => c.post('school-b', 'fee-increase', 'token-of-B').catch(() => null));
  assert.equal(asked[0]?.status, undefined);
});

test('a teacher cannot move homework into a subject they do not teach', async () => {
  let updated = false;
  const prisma = { db: { homework: { findUniqueOrThrow: async () => ({ id: 'h1', classArmId: 'jss1a', subjectId: 'maths', status: 'DRAFT' }), update: async () => ((updated = true), {}) } } };
  const live = {
    viewer: async () => ({ manage: false }),
    canHost: (_v: unknown, c: { classArmId: string; subjectId: string | null }) => c.classArmId === 'jss1a' && c.subjectId === 'maths',
    school: async () => ({ today: '2026-11-11' }),
  };
  const c = new LiveController(prisma as never, live as never, x, x, x, x, x, x);
  await assert.rejects(
    RequestContextStore.run({ userId: 'u1', tenantId: 't1', permissions: new Set(['homework.manage'] as never) }, () => c.updateHomework('h1', { subjectId: 'english', topicId: 'eng-topic' } as never)),
    ForbiddenException,
  );
  assert.equal(updated, false);
});

test("a sponsorship keeps only the school's own classes", async () => {
  let saved: { classArmIds?: string[] } | null = null;
  const arms = [{ id: 'mine', tenantId: 't1' }, { id: 'theirs', tenantId: 't2' }];
  const root = {
    product: { findUnique: async () => ({ id: 'p1', name: 'AI', isActive: true, isPublic: true, schoolPriceKobo: 100, periodMonths: 1, entitlements: [], aiSessions: null }) },
    classArm: { findMany: async ({ where }: { where: { tenantId?: string; id: { in: string[] } } }) => arms.filter((a) => where.id.in.includes(a.id) && (!where.tenantId || a.tenantId === where.tenantId)) },
    student: { findMany: async () => [{ id: 's1' }] },
    sponsorship: {
      create: async ({ data }: { data: { classArmIds: string[] } }) => {
        saved = data;
        throw new Error('stop here');
      },
    },
  };
  const svc = new CommerceService({ root } as never, x, x, x, x, x);
  await assert.rejects(svc.sponsor('t1', 'u1', { productCode: 'AI', classArmIds: ['mine', 'theirs'], title: 'T', startsOn: '2026-11-11', months: 1 }), /stop here/);
  assert.deepEqual(saved!.classArmIds, ['mine']);
});
