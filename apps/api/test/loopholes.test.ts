// Pre-launch loophole fixes, each against in-memory stand-ins (no database).
// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/loopholes.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NotFoundException } from '@nestjs/common';

process.env.JWT_SECRET ??= 'local-test-secret-local-test-secret';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.CORS_ORIGINS ??= 'https://portal.example.ng';

/* eslint-disable @typescript-eslint/no-require-imports */
const { FilesService } = require('../src/files/files.service') as typeof import('../src/files/files.service');
const { RequestContextStore } = require('../src/common/request-context') as typeof import('../src/common/request-context');

type Perm = never;
const as = <T>(userId: string, perms: string[], fn: () => Promise<T>) => RequestContextStore.run({ userId, tenantId: 't1', permissions: new Set(perms as Perm[]) } as never, fn);

// ------------------------------------------------------------------ 1. private files

function filesWith(refs: Record<string, number>) {
  const counter = (name: string) => ({ count: async () => refs[name] ?? 0 });
  const db = {
    fileObject: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === 'f1' ? { id: 'f1', uploadedById: 'parent-1' } : null) },
    ...Object.fromEntries(['reportCardTemplate', 'admissionApplication', 'homeworkSubmission', 'authorisedPickup', 'pickupNotice', 'homework', 'studyMaterial', 'learningModuleStep', 'curriculum', 'schemeOfWork', 'kbDocument'].map((n) => [n, counter(n)])),
  };
  const svc = new FilesService({ db } as never);
  // Stop before the disk read: reaching read() means access was granted.
  (svc as unknown as { read: () => Promise<string> }).read = async () => 'granted';
  return svc;
}

test("a teacher cannot open a parent's private upload that isn't attached to anything they can see", async () => {
  await assert.rejects(as('teacher', ['school.read', 'homework.manage'], () => filesWith({}).readPrivate('f1')), NotFoundException);
});

test('the uploader and admins can open it', async () => {
  assert.equal(await as('parent-1', [], () => filesWith({}).readPrivate('f1')), 'granted');
  assert.equal(await as('principal', ['school.read', 'school.manage'], () => filesWith({}).readPrivate('f1')), 'granted');
});

test('admission documents need admissions.read', async () => {
  const svc = filesWith({ admissionApplication: 1 });
  await assert.rejects(as('teacher', ['school.read'], () => svc.readPrivate('f1')), NotFoundException);
  assert.equal(await as('registrar', ['school.read', 'admissions.read'], () => svc.readPrivate('f1')), 'granted');
});

test('homework submissions need homework.manage; teaching attachments any staff', async () => {
  await assert.rejects(as('bursar', ['school.read'], () => filesWith({ homeworkSubmission: 1 }).readPrivate('f1')), NotFoundException);
  assert.equal(await as('teacher', ['school.read', 'homework.manage'], () => filesWith({ homeworkSubmission: 1 }).readPrivate('f1')), 'granted');
  assert.equal(await as('teacher', ['school.read'], () => filesWith({ homework: 1 }).readPrivate('f1')), 'granted');
  assert.equal(await as('teacher', ['school.read'], () => filesWith({ reportCardTemplate: 1 }).readPrivate('f1')).catch(() => 'denied'), 'denied');
  assert.equal(await as('teacher', ['school.read', 'results.read'], () => filesWith({ reportCardTemplate: 1 }).readPrivate('f1')), 'granted');
});

test('students and parents only open their own uploads directly', async () => {
  await assert.rejects(as('student-2', ['learning.use'], () => filesWith({ homework: 1 }).readPrivate('f1')), NotFoundException);
});

// ------------------------------------------------------------------ 2. attachments

const { LiveController } = require('../src/live/live.controller') as typeof import('../src/live/live.controller');
const x = undefined as never;

function homeworkWith(fileOwner: string, beforeAttachments: unknown[] = []) {
  let saved: unknown = null;
  const files = new FilesService({ db: { ...filesWithDb() } } as never);
  const prisma = {
    db: {
      homework: {
        findUniqueOrThrow: async () => ({ id: 'h1', classArmId: 'jss1a', subjectId: 'maths', status: 'DRAFT', attachments: beforeAttachments }),
        update: async ({ data }: { data: { attachments: unknown } }) => {
          saved = data.attachments;
          throw new Error('saved');
        },
      },
      fileObject: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id, uploadedById: fileOwner })) },
    },
  };
  const live = { viewer: async () => ({ manage: false }), canHost: () => true, school: async () => ({ today: '2026-11-11' }) };
  const c = new LiveController(prisma as never, live as never, x, x, x, x, x, x, files);
  const body = { title: 'T', instructions: '', questions: [], kind: 'UPLOAD', subjectId: 'maths', topicId: null, submissionTypes: [], attachments: [{ type: 'FILE', fileId: 'f9', url: '', name: 'a.pdf', mimeType: 'application/pdf' }], maxScore: 10, markingGuide: null, allowLate: true, countEarlierLabs: false, dueDate: '2026-11-20', publish: false, notifyParents: [] };
  return { run: () => as('teacher', ['school.read', 'homework.manage'], () => c.updateHomework('h1', body as never)), saved: () => saved };
}
function filesWithDb() {
  const zero = { count: async () => 0 };
  return Object.fromEntries(['reportCardTemplate', 'admissionApplication', 'homeworkSubmission', 'authorisedPickup', 'pickupNotice', 'homework', 'studyMaterial', 'learningModuleStep', 'curriculum', 'schemeOfWork', 'kbDocument'].map((n) => [n, zero]));
}

test("a teacher cannot attach a parent's private upload to homework by id", async () => {
  const h = homeworkWith('parent-1');
  await assert.rejects(h.run(), /Upload the attachment again/);
  assert.equal(h.saved(), null);
});

test('a teacher can attach their own upload, and files already on the homework stay', async () => {
  await assert.rejects(homeworkWith('teacher').run(), /saved/);
  await assert.rejects(homeworkWith('parent-1', [{ type: 'FILE', fileId: 'f9' }]).run(), /saved/);
});

// ------------------------------------------------------------------ 3. offline exam device packs

const { OfflineExamsStaffController } = require('../src/cbt/offline-exams.controller') as typeof import('../src/cbt/offline-exams.controller');
const { CbtService } = require('../src/cbt/cbt.service') as typeof import('../src/cbt/cbt.service');

function devicePackFor(all: boolean) {
  let enrolledArms: string[] | null = null;
  const exam = { id: 'e1', title: 'Maths', classArmIds: ['jss1a', 'jss1b'], createdById: 'other' };
  const scope = { userId: 'teacher', all, manage: false, teaches: new Set(['jss1a|maths']), leads: new Set<string>() };
  const cbt = Object.assign(Object.create(CbtService.prototype), { staffExam: async () => ({ exam, paper: { subjectId: 'maths' }, scope, canManage: false }) });
  const offline = {
    checkDownloadable: () => {},
    enrolled: async (_e: unknown, arms: string[]) => ((enrolledArms = arms), []),
    ensureSeats: async () => [],
    buildPack: async () => ({}),
  };
  const c = new OfflineExamsStaffController(cbt as never, offline as never, { log: async () => {} } as never);
  return { c, arms: () => enrolledArms };
}

test('a teacher of one class only gets a device pack for that class', async () => {
  const d = devicePackFor(false);
  await d.c.devicePack('e1', {} as never);
  assert.deepEqual(d.arms(), ['jss1a']);
  await assert.rejects(devicePackFor(false).c.devicePack('e1', { classArmIds: ['jss1b'] } as never), /classes you teach/);
  await assert.rejects(devicePackFor(false).c.devicePack('e1', { classArmIds: ['jss1a', 'jss1b'] } as never), /classes you teach/);
});

test('an academic manager gets every class', async () => {
  const d = devicePackFor(true);
  await d.c.devicePack('e1', {} as never);
  assert.deepEqual(d.arms(), ['jss1a', 'jss1b']);
});

// ------------------------------------------------------------------ 4. joining a live class

const { LiveService } = require('../src/live/live.service') as typeof import('../src/live/live.service');

function liveJoin(staff: { id: string; classSubjects?: { classArmId: string; subjectId: string }[]; classesLed?: { id: string }[] } | null, perms: string[] = ['live.read']) {
  const now = Date.now();
  const cls = { id: 'lc1', classArmId: 'jss1a', subjectId: 'maths', teacherId: 'st-maths', status: 'SCHEDULED', startsAt: new Date(now - 60_000), endsAt: new Date(now + 3_600_000), provider: 'EXTERNAL', joinUrl: 'https://meet.example/abc', providerData: {} };
  const db = {
    liveClass: { findUniqueOrThrow: async () => cls },
    student: { findFirst: async () => null },
    staff: { findFirst: async () => (staff ? { classSubjects: [], classesLed: [], ...staff } : null) },
  };
  const root = { user: { findUniqueOrThrow: async () => ({ firstName: 'A', lastName: 'B' }) } };
  const svc = new LiveService({ db, root } as never, x, x, x, x);
  return as('u', perms, () => svc.join('lc1'));
}

test('a member of staff who does not teach the class cannot join it', async () => {
  await assert.rejects(liveJoin({ id: 'st-bursar' }), /students and teachers/);
});

test("the class's teachers and leadership can", async () => {
  assert.equal((await liveJoin({ id: 'st-co', classSubjects: [{ classArmId: 'jss1a', subjectId: 'maths' }] })).role, 'ATTENDEE');
  assert.equal((await liveJoin({ id: 'st-form', classesLed: [{ id: 'jss1a' }] })).role, 'ATTENDEE');
  assert.equal((await liveJoin({ id: 'st-vp' }, ['live.read', 'live.manage'])).role, 'HOST');
});

// ------------------------------------------------------------------ 5. push subscriptions

const { NotificationsController } = require('../src/comms/notifications.controller') as typeof import('../src/comms/notifications.controller');

function pushWith(row: { userId: string; p256dh: string; auth: string } | null) {
  const writes: unknown[] = [];
  const root = {
    pushSubscription: {
      findUnique: async () => row,
      create: async (a: unknown) => writes.push(['create', a]),
      update: async (a: unknown) => writes.push(['update', a]),
    },
  };
  return { c: new NotificationsController({ root } as never, x, x), writes };
}
const sub = (p256dh: string) => ({ endpoint: 'https://push.example/abc', keys: { p256dh, auth: 'auth-1' } });

test("knowing another person's push endpoint doesn't move it to your account", async () => {
  const p = pushWith({ userId: 'victim', p256dh: 'victim-key', auth: 'auth-1' });
  await as('attacker', [], () => p.c.subscribe(sub('attacker-key') as never));
  assert.equal(p.writes.length, 0);
});

test('a shared browser (same keys) moves to whoever signs in; your own and new ones are saved', async () => {
  const shared = pushWith({ userId: 'sibling', p256dh: 'k', auth: 'auth-1' });
  await as('me', [], () => shared.c.subscribe(sub('k') as never));
  assert.equal((shared.writes[0] as [string])[0], 'update');
  const mine = pushWith({ userId: 'me', p256dh: 'old', auth: 'old' });
  await as('me', [], () => mine.c.subscribe(sub('new') as never));
  assert.equal((mine.writes[0] as [string])[0], 'update');
  const fresh = pushWith(null);
  await as('me', [], () => fresh.c.subscribe(sub('k') as never));
  assert.equal((fresh.writes[0] as [string])[0], 'create');
});

// ------------------------------------------------------------------ 6. ID card and calendar feed tokens

const { DocumentsController, idCardExpiry } = require('../src/operations/documents.controller') as typeof import('../src/operations/documents.controller');
const { CommunityController } = require('../src/comms/community.controller') as typeof import('../src/comms/community.controller');
const { JwtService } = require('@nestjs/jwt') as typeof import('@nestjs/jwt');
const jwt = new JwtService({ secret: 'local-test-secret-local-test-secret', signOptions: { algorithm: 'HS256' } });

test('ID cards expire at the end of the session (or the school date) and a re-issued card stops the old one', async () => {
  assert.equal(idCardExpiry('2027-07-31', null), Date.parse('2027-08-02T00:00:00Z') / 1000);
  assert.equal(idCardExpiry(null, new Date('2027-07-20T00:00:00Z')), Date.parse('2027-09-20T00:00:00Z') / 1000);
  let version = 1;
  const root = {
    tenant: { findUnique: async () => ({ name: 'School', timezone: 'Africa/Lagos', operationsSettings: {} }) },
    student: { findFirst: async () => ({ id: 's1', firstName: 'Ada', lastName: 'Obi', status: 'ACTIVE', idCardVersion: version, classArm: { name: 'A', classLevel: { name: 'JSS1' } } }) },
  };
  const c = new DocumentsController({ root } as never, x, jwt, x, x);
  const old = await jwt.signAsync({ typ: 'idcard', tid: 't1', k: 'S', id: 's1', v: 0, exp: Math.floor(Date.now() / 1000) + 3600 });
  const current = await jwt.signAsync({ typ: 'idcard', tid: 't1', k: 'S', id: 's1', v: 1, exp: Math.floor(Date.now() / 1000) + 3600 });
  await assert.rejects(c.verifyId(old), NotFoundException);
  assert.equal((await c.verifyId(current)).valid, true);
  const expired = await jwt.signAsync({ typ: 'idcard', tid: 't1', k: 'S', id: 's1', v: 1, exp: Math.floor(Date.now() / 1000) - 10 });
  const r = await c.verifyId(expired);
  assert.equal(r.valid, false);
  assert.equal(r.message, 'This card has expired.');
  version = 0;
  // Cards printed before versions existed (no v) still verify until re-issued.
  assert.equal((await c.verifyId(await jwt.signAsync({ typ: 'idcard', tid: 't1', k: 'S', id: 's1' }))).valid, true);
});

test('a calendar feed link stops when its owner leaves or resets it; old unbound links are refused', async () => {
  let owner: { id: string } | null = { id: 'u1' };
  let asked: Record<string, unknown> = {};
  const root = {
    tenant: { findUnique: async () => ({ name: 'School', timezone: 'Africa/Lagos', slug: 's' }) },
    user: { findFirst: async ({ where }: { where: Record<string, unknown> }) => ((asked = where), owner) },
    schoolEvent: { findMany: async () => [] },
  };
  const c = new CommunityController({ root } as never, x, jwt, x);
  const token = await jwt.signAsync({ typ: 'ical', tid: 't1', aud: ['ALL'], cls: null, sub: 'u1', v: 2 });
  assert.match(await c.ics(token), /BEGIN:VCALENDAR/);
  assert.equal(asked.calendarFeedVersion, 2);
  assert.deepEqual(asked.memberships, { some: { tenantId: 't1', status: 'ACTIVE' } });
  owner = null;
  await assert.rejects(c.ics(token), NotFoundException);
  await assert.rejects(c.ics(await jwt.signAsync({ typ: 'ical', tid: 't1', aud: ['ALL'], cls: null })), NotFoundException);
});

// ------------------------------------------------------------------ 7. parents' child views need an ACTIVE student

const { GamesService } = require('../src/games/games.service') as typeof import('../src/games/games.service');
const { CheckInService } = require('../src/lesson-modules/checkin.service') as typeof import('../src/lesson-modules/checkin.service');

test("a parent can't open games or lesson check-ins of a withdrawn child", async () => {
  const asked: unknown[] = [];
  const db = { student: { findFirst: async ({ where }: { where: { status?: string } }) => (asked.push(where), where.status === 'ACTIVE' ? null : { id: 's1' }) }, studentGuardian: { count: async () => 1 } };
  const games = new GamesService({ db } as never, x, x, x);
  const checkin = new CheckInService({ prisma: { db } } as never, x, x, x);
  await assert.rejects(as('parent', ['family.manage'], () => games.child('s1')), NotFoundException);
  await assert.rejects(as('parent', ['family.manage'], () => checkin.child('s1')), NotFoundException);
  assert.equal(asked.length, 2);
});

// ------------------------------------------------------------------ 8. exam access codes

const { accessCodeField } = require('@aischool/shared') as typeof import('@aischool/shared');
const { accessCodeLimiter, accessCodeKey, assertNotLockedOut } = require('../src/cbt/access-code-limiter') as typeof import('../src/cbt/access-code-limiter');

test('new access codes must be at least 6 characters and not an obvious run', () => {
  for (const bad of ['AB12', '123456', 'AAAAAA', 'abcdef', 'ABABAB', 'FEDCBA']) assert.equal(accessCodeField.safeParse(bad).success, false, bad);
  assert.equal(accessCodeField.parse('mx7-q2k'), 'MX7-Q2K');
  assert.equal(accessCodeField.parse(''), null);
  assert.equal(accessCodeField.parse(null), null);
});

test('10 wrong codes lock a pupil out of that exam (only that exam) for 10 minutes', () => {
  const key = accessCodeKey('cbt', 'exam-1', 'pupil-1');
  for (let i = 0; i < 9; i++) accessCodeLimiter.fail(key);
  assert.doesNotThrow(() => assertNotLockedOut(key));
  accessCodeLimiter.fail(key);
  assert.throws(() => assertNotLockedOut(key), /Too many wrong access codes/);
  assert.doesNotThrow(() => assertNotLockedOut(accessCodeKey('cbt', 'exam-2', 'pupil-1')));
  assert.equal(accessCodeLimiter.blockedFor(key, Date.now() + 10 * 60_000 + 1), 0);
});

// ------------------------------------------------------------------ 9. admin-entered servers (SSRF)

const { isPublicIp, resolvePublicHost, PrivateHostError } = require('../src/common/public-host') as typeof import('../src/common/public-host');
const { LiveProvidersService } = require('../src/live/providers.service') as typeof import('../src/live/providers.service');
const { ChannelsService } = require('../src/comms/channels.service') as typeof import('../src/comms/channels.service');

test('private, loopback, link-local and mapped addresses are not public', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:a9fe:a9fe', '224.0.0.1']) assert.equal(isPublicIp(ip), false, ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '41.58.1.1', '2606:4700:4700::1111']) assert.equal(isPublicIp(ip), true, ip);
});

test('a host name that resolves to an inside address is refused (any of its addresses)', async () => {
  const fake = (addrs: string[]) => (async () => addrs.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))) as never;
  await assert.rejects(resolvePublicHost('bbb.evil.example', fake(['93.184.216.34', '10.0.0.5'])), PrivateHostError);
  await assert.rejects(resolvePublicHost('localhost'), PrivateHostError);
  assert.deepEqual(await resolvePublicHost('bbb.school.example', fake(['93.184.216.34'])), ['93.184.216.34']);
});

test('connecting BBB or SMTP to an internal address gives the same generic error and sends nothing', async () => {
  let fetched = false;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => ((fetched = true), new Response('x'))) as never;
  try {
    const live = new LiveProvidersService({ root: {} } as never);
    await assert.rejects(live.bbbConnect('t1', { url: 'http://127.0.0.1:8080/bigbluebutton/', secret: 's' }), /Couldn't connect to a BigBlueButton server at that address/);
    await assert.rejects(live.bbbConnect('t1', { url: 'http://169.254.169.254/latest/', secret: 's' }), /Couldn't connect to a BigBlueButton server at that address/);
    assert.equal(fetched, false);
  } finally {
    globalThis.fetch = realFetch;
  }
  const ch = new ChannelsService({ root: {} } as never);
  await assert.rejects(ch.saveSmtp('t1', { host: '127.0.0.1', port: 25, secure: false, username: 'u', password: 'p', fromEmail: 'a@b.c', fromName: null } as never), /Couldn't connect to a mail server at that address/);
});

// ------------------------------------------------------------------ 10. password length at sign-in

const shared = require('@aischool/shared') as typeof import('@aischool/shared');

test('sign-in refuses a huge password before any hashing; new passwords are capped at 200', () => {
  assert.equal(shared.loginSchema.safeParse({ email: 'a@b.co', password: 'x'.repeat(501) }).success, false);
  assert.equal(shared.loginSchema.safeParse({ email: 'a@b.co', password: 'x'.repeat(500) }).success, true);
  assert.equal(shared.inviteUserSchema.safeParse({ firstName: 'Ada', lastName: 'Obi', email: 'a@b.co', roleIds: ['r'], password: 'x'.repeat(201) }).success, false);
});

// ------------------------------------------------------------------ 11. inviting an email that already has an account

const { UsersController } = require('../src/rbac/users.controller') as typeof import('../src/rbac/users.controller');

function inviteWith(existingUser: { id: string; email: string; firstName: string } | null) {
  const writes: { op: string; data: unknown }[] = [];
  const tx = {
    user: {
      findUnique: async () => existingUser,
      create: async ({ data }: { data: unknown }) => (writes.push({ op: 'user.create', data }), { id: 'new', email: 'a@b.co', firstName: 'Ada' }),
      update: async ({ data }: { data: unknown }) => (writes.push({ op: 'user.update', data }), existingUser),
      upsert: async ({ update }: { update: unknown }) => (writes.push({ op: 'user.upsert', data: update }), existingUser),
    },
    membership: { findUnique: async () => null, create: async () => ({ id: 'm1' }) },
    membershipRole: { createMany: async () => ({ count: 1 }) },
  };
  const notes: unknown[] = [];
  const prisma = {
    db: { role: { findMany: async () => [{ id: 'r1', name: 'Teacher', permissions: ['school.read'] }] } },
    root: { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx), tenant: { findUnique: async () => ({ name: 'Green School' }) }, notification: { create: async (a: unknown) => (notes.push(a), {}) } },
  };
  const c = new UsersController(prisma as never, { log: async () => {} } as never, x);
  const body = { firstName: 'Ada', lastName: 'Obi', email: 'a@b.co', roleIds: ['r1'], password: 'admin-chosen-pass' };
  return { run: () => as('admin', ['users.manage', 'school.read'], () => c.invite(body as never)), writes, notes };
}

test("inviting an existing account adds the membership without touching its password, tells the admin and the person", async () => {
  const i = inviteWith({ id: 'u-other-school', email: 'a@b.co', firstName: 'Ada' });
  const r = (await i.run()) as { existingAccount: boolean; message?: string };
  assert.equal(r.existingAccount, true);
  assert.match(r.message!, /password you typed was not used/);
  assert.deepEqual(i.writes, []);
  await new Promise((res) => setImmediate(res));
  assert.equal(i.notes.length, 1);
});

test('a new email gets an account with the typed password', async () => {
  const i = inviteWith(null);
  const r = (await i.run()) as { existingAccount: boolean };
  assert.equal(r.existingAccount, false);
  assert.equal(i.writes[0]!.op, 'user.create');
  assert.ok((i.writes[0]!.data as { passwordHash: string }).passwordHash);
});

// ------------------------------------------------------------------ 13. forged Origin / X-Forwarded-Host

const { siteOrigin } = require('../src/finance/finance.controller') as typeof import('../src/finance/finance.controller');
const { schoolLinkOrigin } = require('../src/common/email-origin') as typeof import('../src/common/email-origin');

test('payment callbacks and Google sign-in use the platform address, not a forged header', () => {
  const req = (headers: Record<string, string>) => ({ headers, protocol: 'https' }) as never;
  assert.equal(siteOrigin(req({ 'x-forwarded-host': 'evil.example', host: 'portal.example.ng' })), 'https://portal.example.ng');
  assert.equal(siteOrigin(req({ origin: 'https://evil.example' })), 'https://portal.example.ng');
  assert.equal(siteOrigin(req({ origin: 'https://portal.example.ng' })), 'https://portal.example.ng');
});

test("a school's own verified domain is kept for its website's payments; anything else is not", async () => {
  const req = (origin: string) => ({ headers: { origin }, protocol: 'https' }) as never;
  const verified = async (tid: string, host: string) => tid === 't1' && host === 'greenschool.edu.ng';
  assert.equal(await schoolLinkOrigin(req('https://greenschool.edu.ng'), 't1', verified), 'https://greenschool.edu.ng');
  assert.equal(await schoolLinkOrigin(req('https://greenschool.edu.ng'), 't2', verified), 'https://portal.example.ng');
  assert.equal(await schoolLinkOrigin(req('https://evil.example'), 't1', verified), 'https://portal.example.ng');
  assert.equal(await schoolLinkOrigin(req('http://greenschool.edu.ng'), 't1', verified), 'https://portal.example.ng');
});
