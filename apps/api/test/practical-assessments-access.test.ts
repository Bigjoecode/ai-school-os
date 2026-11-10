// Who may see and do what with a practical test, through the real services and the tenant scope, on the LOCAL
// dev database. Two throw-away schools are created here and deleted at the end; nothing else is touched.
// Skipped unless DATABASE_URL points at this machine and the database is up.
// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practical-assessments-access.test.ts
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, afterEach, before, test } from 'node:test';
import { emptyChemTitrationState, type Permission } from '@aischool/shared';

try {
  process.loadEnvFile('.env');
} catch {
  /* the environment may carry them */
}
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? '');
process.env.JWT_SECRET ??= 'local-test-secret-local-test-secret';

/* eslint-disable @typescript-eslint/no-require-imports */
const load = () => ({
  ...(require('../src/prisma/prisma.service') as typeof import('../src/prisma/prisma.service')),
  ...(require('../src/common/request-context') as typeof import('../src/common/request-context')),
  ...(require('../src/cbt/cbt.service') as typeof import('../src/cbt/cbt.service')),
  ...(require('../src/audit/audit.service') as typeof import('../src/audit/audit.service')),
  ...(require('../src/assessment/assessment-settings.service') as typeof import('../src/assessment/assessment-settings.service')),
  ...(require('../src/practicals/practicals.service') as typeof import('../src/practicals/practicals.service')),
  ...(require('../src/practicals/practical-assessments.service') as typeof import('../src/practicals/practical-assessments.service')),
  ...(require('../src/practicals/practicals-teacher.service') as typeof import('../src/practicals/practicals-teacher.service')),
  ...(require('../src/portal/portal.controller') as typeof import('../src/portal/portal.controller')),
});

type Loaded = ReturnType<typeof load>;
let m: Loaded;
let prisma: InstanceType<Loaded['PrismaService']>;
let tests: InstanceType<Loaded['PracticalAssessmentsService']>;
let labs: InstanceType<Loaded['PracticalsService']>;
let teaching: InstanceType<Loaded['PracticalsTeacherService']>;
let portal: InstanceType<Loaded['PortalController']>;
let skip: string | false = local ? false : 'DATABASE_URL is not local';

const stamp = randomBytes(5).toString('hex');
const tenants: string[] = [];
const users: string[] = [];
let lessonId = '';
let otherLessonId = '';

interface School {
  tenantId: string;
  subjectId: string;
  termId: string;
  armA: string;
  armB: string;
}
let school: School;
let otherSchool: School;

const MANAGE: Permission[] = ['assessment.read', 'assessment.manage', 'homework.manage'];
const ALL_SCHOOL: Permission[] = [...MANAGE, 'academics.manage', 'results.publish', 'academics.read'];
const as = <T>(tenantId: string, userId: string, permissions: Permission[], fn: () => Promise<T>) => m.RequestContextStore.run({ tenantId, userId, permissions: new Set(permissions), ip: '10.0.0.9' }, fn);

const user = async (who: string) => {
  const u = await prisma.root.user.create({ data: { email: `pa-${who}-${stamp}@test.invalid`, passwordHash: 'x', firstName: who, lastName: 'Test' } });
  users.push(u.id);
  return u.id;
};

async function makeSchool(tag: string): Promise<School> {
  const db = prisma.root;
  const t = await db.tenant.create({ data: { slug: `pa-${tag}-${stamp}`, name: `Test school ${tag}` } });
  tenants.push(t.id);
  const tenantId = t.id;
  const level = await db.classLevel.create({ data: { tenantId, name: 'SS 2', code: 'SS2' } });
  const a = await db.classArm.create({ data: { tenantId, classLevelId: level.id, name: 'A' } });
  const b = await db.classArm.create({ data: { tenantId, classLevelId: level.id, name: 'B' } });
  const subject = await db.subject.create({ data: { tenantId, name: 'Chemistry', code: 'CHM' } });
  await db.classSubject.createMany({ data: [a, b].map((x) => ({ tenantId, classArmId: x.id, subjectId: subject.id })) });
  const session = await db.academicSession.create({ data: { tenantId, name: '2026/2027', startsOn: new Date('2026-09-01'), endsOn: new Date('2027-07-30') } });
  const term = await db.term.create({ data: { tenantId, sessionId: session.id, name: 'First Term', order: 1, startsOn: new Date('2026-09-01'), endsOn: new Date('2026-12-15') } });
  return { tenantId, subjectId: subject.id, termId: term.id, armA: a.id, armB: b.id };
}

const staffUser = async (s: School, who: string, teachesArm?: string) => {
  const userId = await user(who);
  const st = await prisma.root.staff.create({ data: { tenantId: s.tenantId, userId, staffNumber: who, firstName: who, lastName: 'Test', jobTitle: 'Teacher', gender: 'FEMALE' } });
  if (teachesArm) await prisma.root.classSubject.updateMany({ where: { tenantId: s.tenantId, classArmId: teachesArm, subjectId: s.subjectId }, data: { teacherId: st.id } });
  return userId;
};

const studentUser = async (s: School, who: string, classArmId: string) => {
  const userId = await user(who);
  const st = await prisma.root.student.create({ data: { tenantId: s.tenantId, userId, admissionNumber: who, firstName: who, lastName: 'Test', classArmId, gender: 'FEMALE' } });
  return { userId, studentId: st.id, access: { studentId: st.id, tenantId: s.tenantId, exams: ['WAEC'], windowStart: new Date(0).toISOString() } as never };
};

const parentUser = async (s: School, who: string, studentId: string) => {
  const userId = await user(who);
  const g = await prisma.root.guardian.create({ data: { tenantId: s.tenantId, userId, firstName: who, lastName: 'Test', relationship: 'Mother', phone: '08000000000' } });
  await prisma.root.studentGuardian.create({ data: { tenantId: s.tenantId, studentId, guardianId: g.id } });
  return userId;
};

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    const err = e as { getStatus?: () => number; getResponse?: () => { code?: string } };
    return err.getResponse?.()?.code ?? err.getStatus?.() ?? (e as Error).message;
  }
};

let teacher: string;
let bystander: string;
let manager: string;
let outsider: string;
let kid: Awaited<ReturnType<typeof studentUser>>;
let otherArmKid: Awaited<ReturnType<typeof studentUser>>;
let outsiderKid: Awaited<ReturnType<typeof studentUser>>;
let parent: string;
let strangerParent: string;

before(async () => {
  if (skip) return;
  try {
    m = load();
    prisma = new m.PrismaService();
    await prisma.root.$queryRaw`select 1`;
    const lessons = await prisma.root.practicalLesson.findMany({ where: { subject: 'Chemistry' }, select: { id: true, simulator: true } });
    const lab = lessons.find((l) => l.simulator === 'chem-titration');
    if (!lab) throw new Error('the practical lessons are not installed');
    lessonId = lab.id;
    otherLessonId = lessons.find((l) => l.simulator && l.id !== lab.id)?.id ?? lab.id;
  } catch (e) {
    skip = `no local database: ${(e as Error).message}`;
    return;
  }
  const audit = { log: async () => undefined } as never;
  const settings = new m.AssessmentSettingsService(prisma);
  const cbt = new m.CbtService(prisma, settings, {} as never);
  const noWork = { record: async () => undefined, replaceEvidence: async () => undefined, handIn: async () => 0 } as never;
  labs = new m.PracticalsService(prisma, {} as never, { withAllowance: async () => { throw new Error('no AI in tests'); } } as never, noWork, noWork, cbt);
  // A real audit log here: whether results were released before decides whether anyone is told again.
  tests = new m.PracticalAssessmentsService(prisma, cbt, settings, {} as never, labs, new m.AuditService(prisma));
  const insights = { scope: () => undefined } as never;
  teaching = new m.PracticalsTeacherService(prisma, insights, labs, audit, noWork);
  // The real rule for who may review, from the real scope code (it needs only the database).
  const { ClassInsightsService } = require('../src/class-insights/class-insights.service') as typeof import('../src/class-insights/class-insights.service');
  (teaching as unknown as { insights: unknown }).insights = new ClassInsightsService(prisma, {} as never, {} as never, {} as never, audit);
  portal = new m.PortalController(prisma, {} as never, {} as never, {} as never, audit, {} as never, {} as never, {} as never, {} as never);

  school = await makeSchool('one');
  otherSchool = await makeSchool('two');
  teacher = await staffUser(school, `T1${stamp}`, school.armA);
  bystander = await staffUser(school, `T2${stamp}`);
  manager = await staffUser(school, `M1${stamp}`);
  outsider = await staffUser(otherSchool, `TX${stamp}`, otherSchool.armA);
  kid = await studentUser(school, `S1${stamp}`, school.armA);
  otherArmKid = await studentUser(school, `S2${stamp}`, school.armB);
  outsiderKid = await studentUser(otherSchool, `SX${stamp}`, otherSchool.armA);
  parent = await parentUser(school, `P1${stamp}`, kid.studentId);
  strangerParent = await parentUser(school, `P2${stamp}`, otherArmKid.studentId);
});

after(async () => {
  if (!prisma) return;
  await prisma.root.tenant.deleteMany({ where: { id: { in: tenants } } }).catch(() => undefined);
  await prisma.root.user.deleteMany({ where: { id: { in: users } } }).catch(() => undefined);
  await prisma.root.$disconnect();
});

// Each test leaves nothing running: a sitting left open would lock the practical for the next.
afterEach(async () => {
  if (skip) return;
  const open = await prisma.root.practicalAssessment.findMany({ where: { tenantId: school.tenantId, status: 'SCHEDULED' }, select: { id: true } });
  for (const r of open) await as(school.tenantId, manager, ALL_SCHOOL, () => tests.close(r.id));
});

const body = (over: Record<string, unknown> = {}) => ({
  practicalId: lessonId,
  subjectId: school.subjectId,
  termId: school.termId,
  title: `Access check ${randomBytes(3).toString('hex')}`,
  kind: 'EXAM' as const,
  classArmIds: [school.armA],
  opensAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  closesAt: new Date(Date.now() + 2 * 3_600_000).toISOString(),
  durationMinutes: 45,
  showResults: 'NEVER' as const,
  componentKey: null,
  accessCode: null,
  publish: true,
  ...over,
});
const schedule = (over?: Record<string, unknown>) => as(school.tenantId, teacher, MANAGE, () => tests.create(body(over) as never));
const sit = (id: string, s = kid) => as(school.tenantId, s.userId, ['learning.use'], () => tests.start(id, null));
const asKid = <T>(fn: () => Promise<T>, s = kid, tenantId = school.tenantId) => as(tenantId, s.userId, ['learning.use'], fn);
const asParent = <T>(fn: () => Promise<T>, userId = parent) => as(school.tenantId, userId, ['family.manage'], fn);
const handIn = async (attemptId: string, score = 17) => {
  await asKid(() => labs.submit(kid.access, attemptId, emptyChemTitrationState() as never, 0));
  const stored = await prisma.root.practicalAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  await prisma.root.practicalAttempt.update({ where: { id: attemptId }, data: { score, scores: [{ id: 'setup', label: 'Setting up', awarded: score, max: stored.maxScore, how: 'AUTO', note: 'A secret detail' }], aiFeedback: 'Feedback in detail' } });
};

test('a member of staff at another school can neither see nor act on a practical test or its sittings', async (t) => {
  if (skip) return t.skip(skip);
  const pa = await schedule();
  const sitting = await sit(pa.id);
  const other = (fn: () => Promise<unknown>) => code(as(otherSchool.tenantId, outsider, ALL_SCHOOL, fn as () => Promise<never>));
  assert.deepEqual(await as(otherSchool.tenantId, outsider, ALL_SCHOOL, () => tests.list()), []);
  for (const fn of [() => tests.results(pa.id), () => tests.csv(pa.id), () => tests.update(pa.id, { title: 'Hijacked' } as never), () => tests.publish(pa.id), () => tests.unpublish(pa.id), () => tests.close(pa.id), () => tests.release(pa.id, true), () => tests.remove(pa.id), () => tests.scoresPreview(pa.id), () => tests.sendScores(pa.id, [])]) {
    assert.equal(await other(fn), 404);
  }
  assert.equal(await other(() => teaching.attempt(sitting.id)), 404);
  assert.equal(await other(() => teaching.override(sitting.id, { score: 20, note: 'Hijacked' })), 404);
  // Nor can they aim one of their own at this school's classes.
  assert.equal(await other(() => tests.create({ ...body(), subjectId: otherSchool.subjectId, termId: otherSchool.termId, classArmIds: [school.armA] } as never)), 400);
  // A student at the other school can't sit it either.
  assert.equal(await code(asKid(() => tests.start(pa.id, null), outsiderKid, otherSchool.tenantId)), 404);
  const row = await prisma.root.practicalAssessment.findUniqueOrThrow({ where: { id: pa.id } });
  assert.equal(row.title, pa.title);
  assert.equal(row.status, 'SCHEDULED');
});

test('a teacher who does not teach the class and subject is refused', async (t) => {
  if (skip) return t.skip(skip);
  const pa = await schedule();
  const sitting = await sit(pa.id);
  const not = (fn: () => Promise<unknown>, perms = MANAGE) => code(as(school.tenantId, bystander, perms, fn as () => Promise<never>));
  assert.equal(await not(() => tests.create(body() as never)), 400);
  assert.equal(await not(() => tests.results(pa.id)), 404);
  assert.equal(await not(() => tests.close(pa.id)), 404);
  assert.equal(await not(() => tests.release(pa.id, true)), 404);
  assert.equal(await not(() => teaching.attempt(sitting.id)), 403);
  assert.deepEqual(await as(school.tenantId, bystander, MANAGE, () => tests.list()), []);
  assert.deepEqual((await as(school.tenantId, bystander, MANAGE, () => tests.options())).subjects, []);
  // The class's teacher who may only read can look but not run it; an academic manager can do both.
  assert.equal(await code(as(school.tenantId, teacher, ['assessment.read'], () => tests.close(pa.id))), 403);
  assert.equal(await code(as(school.tenantId, manager, ALL_SCHOOL, () => tests.results(pa.id))), 'OK');
});

test('a student who is not in the class arm can’t start it or see it', async (t) => {
  if (skip) return t.skip(skip);
  const pa = await schedule();
  assert.equal(await code(sit(pa.id, otherArmKid)), 404);
  assert.equal((await asKid(() => tests.mine(), otherArmKid)).some((x) => x.id === pa.id), false);
  const draft = await schedule({ publish: false });
  assert.equal(await code(sit(draft.id)), 404);
  assert.equal((await asKid(() => tests.mine())).some((x) => x.id === draft.id), false);
});

test('a student and their parents can’t read a hidden result; nobody else’s parents can read one at all', async (t) => {
  if (skip) return t.skip(skip);
  const pa = await schedule();
  const sitting = await sit(pa.id);
  await handIn(sitting.id);
  const view = await asKid(() => labs.attempt(kid.access, sitting.id));
  assert.equal(view.result, null);
  assert.ok(view.assessment?.resultNote);
  const mine = (await asKid(() => tests.mine())).find((x) => x.id === pa.id)!;
  assert.equal(mine.result, null);
  const list = await asParent(() => portal.practicalTests(kid.studentId));
  const row = list.tests.find((x) => x.id === pa.id)!;
  assert.deepEqual([row.score, row.total, row.percent, row.classAverage, row.canReview], [null, null, null, null, false]);
  assert.match(row.note!, /teacher releases/);
  const review = await asParent(() => portal.practicalTest(kid.studentId, pa.id));
  assert.deepEqual([review.criteria, review.feedback, review.teacherNote], [null, null, null]);
  assert.equal(JSON.stringify(review).includes('secret'), false);
  // Not told yet, and strangers are refused.
  assert.equal(await prisma.root.notification.count({ where: { userId: parent, link: { contains: pa.id } } }), 0);
  assert.equal(await code(asParent(() => portal.practicalTests(kid.studentId), strangerParent)), 403);
  assert.equal(await code(asParent(() => portal.practicalTest(kid.studentId, pa.id), strangerParent)), 403);

  // Released: the student, then the parent (told once, without the score), see it.
  await as(school.tenantId, teacher, MANAGE, () => tests.release(pa.id, true));
  assert.equal((await asKid(() => labs.attempt(kid.access, sitting.id))).result?.score, 17);
  const told = await prisma.root.notification.findMany({ where: { userId: parent, link: { contains: pa.id } } });
  assert.equal(told.length, 1);
  assert.doesNotMatch(`${told[0]!.title} ${told[0]!.body}`, /17/);
  assert.equal(told[0]!.link, `/school/results/${kid.studentId}?tab=online&practical=${pa.id}`);
  const open = await asParent(() => portal.practicalTest(kid.studentId, pa.id));
  assert.equal(open.test.score, 17);
  assert.equal(open.criteria?.[0]?.note, 'A secret detail');
  // Withdrawn again: hidden again.
  await as(school.tenantId, teacher, MANAGE, () => tests.release(pa.id, false));
  assert.equal((await asParent(() => portal.practicalTests(kid.studentId))).tests.find((x) => x.id === pa.id)!.score, null);
  assert.equal((await asKid(() => labs.attempt(kid.access, sitting.id))).result, null);
  // Released a second time: shown again, but nobody is told twice.
  await as(school.tenantId, teacher, MANAGE, () => tests.release(pa.id, true));
  assert.equal((await asKid(() => labs.attempt(kid.access, sitting.id))).result?.score, 17);
  assert.equal(await prisma.root.notification.count({ where: { userId: parent, link: { contains: pa.id } } }), 1);
  assert.equal(await prisma.root.notification.count({ where: { userId: kid.userId, title: { startsWith: 'Results are out' }, link: { contains: sitting.id } } }), 1);
});

test('results straight away: the score shows, parents are told once, the detail waits until it closes', async (t) => {
  if (skip) return t.skip(skip);
  const pa = await schedule({ showResults: 'IMMEDIATE' });
  const sitting = await sit(pa.id);
  await asKid(() => labs.submit(kid.access, sitting.id, emptyChemTitrationState() as never, 0));
  assert.equal(await prisma.root.notification.count({ where: { userId: parent, link: { contains: pa.id } } }), 1);
  await prisma.root.practicalAttempt.update({ where: { id: sitting.id }, data: { aiFeedback: 'Feedback in detail', scores: [{ id: 'setup', label: 'Setting up', awarded: 3, max: 4, how: 'AUTO', note: 'A secret detail' }] } });
  const view = await asKid(() => labs.attempt(kid.access, sitting.id));
  assert.ok(view.result);
  assert.deepEqual([view.result!.criteria, view.result!.solution, view.result!.feedback], [[], [], null]);
  assert.equal(view.assessment?.review, false);
  const staff = await as(school.tenantId, teacher, MANAGE, () => teaching.attempt(sitting.id));
  assert.equal(staff.result?.criteria.length, 1);
  const during = await asParent(() => portal.practicalTest(kid.studentId, pa.id));
  assert.equal(during.criteria, null);
  assert.equal(during.test.canReview, false);
  assert.match(during.test.note!, /once the test has closed/);
  // Released results don't tell the parents a second time.
  await as(school.tenantId, teacher, MANAGE, () => tests.release(pa.id, true));
  assert.equal(await prisma.root.notification.count({ where: { userId: parent, link: { contains: pa.id } } }), 1);
  assert.equal((await asKid(() => labs.attempt(kid.access, sitting.id))).result?.criteria.length, 1);
});

test('a parent’s notice follows the school’s setting: no results in the portal, no notice', async (t) => {
  if (skip) return t.skip(skip);
  await prisma.root.tenant.update({ where: { id: school.tenantId }, data: { portalSettings: { showResults: false } } });
  try {
    const pa = await schedule({ showResults: 'IMMEDIATE' });
    const sitting = await sit(pa.id);
    await asKid(() => labs.submit(kid.access, sitting.id, emptyChemTitrationState() as never, 0));
    assert.equal(await prisma.root.notification.count({ where: { userId: parent, link: { contains: pa.id } } }), 0);
    assert.equal(await code(asParent(() => portal.practicalTests(kid.studentId))), 403);
  } finally {
    await prisma.root.tenant.update({ where: { id: school.tenantId }, data: { portalSettings: {} } });
  }
});

test('during a sitting the practical is locked (lesson, check, practice, labs, past results) and it opens again afterwards', async (t) => {
  if (skip) return t.skip(skip);
  // An earlier practice attempt, with its worked solution, from before the test.
  const practice = await asKid(() => labs.startLab(kid.access, { practicalId: lessonId, mode: 'LAB' }));
  const kidLabs = kid.access as unknown as { studentId: string };
  const pa = await schedule({ kind: 'TEST' });
  const sitting = await sit(pa.id);
  const refused = 'SITTING_OPEN';
  assert.equal(await code(asKid(() => labs.lessonView(kid.access, lessonId))), refused);
  assert.equal(await code(asKid(() => labs.check(kid.access, lessonId, [0]))), refused);
  assert.equal(await code(asKid(() => labs.check(kid.access, lessonId, [0], [0]))), refused);
  assert.equal(await code(asKid(() => labs.startLab(kid.access, { practicalId: lessonId, mode: 'LAB' }))), refused);
  assert.equal(await code(asKid(() => labs.startLab(kid.access, { practicalId: lessonId, mode: 'EXAM' }))), refused);
  assert.equal(await code(asKid(() => labs.attempt(kid.access, practice.id))), refused);
  assert.equal(await code(asKid(() => labs.saveDraft(kid.access, practice.id, emptyChemTitrationState() as never))), refused);
  assert.equal(await code(asKid(() => labs.submit(kid.access, practice.id, emptyChemTitrationState() as never))), refused);
  assert.equal(await code(labs.refuseDuringSitting(kidLabs.studentId, lessonId)), refused);
  // The sitting itself, and other practicals, still work.
  assert.equal(await code(asKid(() => labs.attempt(kid.access, sitting.id))), 'OK');
  assert.equal(await code(asKid(() => labs.saveDraft(kid.access, sitting.id, emptyChemTitrationState() as never))), 'OK');
  if (otherLessonId !== lessonId) assert.equal(await code(asKid(() => labs.lessonView(kid.access, otherLessonId))), 'OK');
  // A classmate who hasn't started is not locked out of their own revision.
  assert.equal(await code(asKid(() => labs.lessonView(otherArmKid.access, lessonId), otherArmKid)), 'OK');

  await asKid(() => labs.submit(kid.access, sitting.id, emptyChemTitrationState() as never));
  assert.equal(await code(asKid(() => labs.lessonView(kid.access, lessonId))), 'OK');
  assert.equal(await code(asKid(() => labs.attempt(kid.access, practice.id))), 'OK');

  // Time up with nobody handing in: the lock lifts by itself.
  const other = await schedule({ kind: 'TEST' });
  const left = await sit(other.id);
  assert.equal(await code(asKid(() => labs.lessonView(kid.access, lessonId))), refused);
  await prisma.root.practicalAttempt.update({ where: { id: left.id }, data: { endsAt: new Date(Date.now() - 3 * 60_000) } });
  assert.equal(await code(asKid(() => labs.lessonView(kid.access, lessonId))), 'OK');
});

test('focus losses: counted for exams only, only ever up, shown to the teacher, and never hand anything in', async (t) => {
  if (skip) return t.skip(skip);
  const pa = await schedule();
  const sitting = await sit(pa.id);
  const state = emptyChemTitrationState() as never;
  await asKid(() => labs.saveDraft(kid.access, sitting.id, state, 3));
  await asKid(() => labs.saveDraft(kid.access, sitting.id, state, 2));
  let stored = await prisma.root.practicalAttempt.findUniqueOrThrow({ where: { id: sitting.id } });
  assert.equal(stored.focusLosses, 3);
  assert.equal(stored.submittedAt, null);
  assert.equal(stored.ip, '10.0.0.9');
  assert.ok(stored.lastSeenAt);
  const row = (await as(school.tenantId, teacher, MANAGE, () => tests.results(pa.id))).rows.find((r) => r.attemptId === sitting.id)!;
  assert.deepEqual([row.focusLosses, row.ip], [3, '10.0.0.9']);
  assert.match(await as(school.tenantId, teacher, MANAGE, () => tests.csv(pa.id)), /Focus losses/);
  await asKid(() => labs.submit(kid.access, sitting.id, state, 5));
  stored = await prisma.root.practicalAttempt.findUniqueOrThrow({ where: { id: sitting.id } });
  assert.equal(stored.focusLosses, 5);
  assert.equal(stored.score, (await asKid(() => labs.submit(kid.access, sitting.id, state, 9))) && stored.score);

  // A class test isn't watched; nor is a practice lab.
  const test2 = await schedule({ kind: 'TEST' });
  const s2 = await sit(test2.id);
  await asKid(() => labs.saveDraft(kid.access, s2.id, state, 4));
  assert.equal((await prisma.root.practicalAttempt.findUniqueOrThrow({ where: { id: s2.id } })).focusLosses, 0);
  assert.equal((await as(school.tenantId, teacher, MANAGE, () => tests.csv(test2.id))).includes('Focus losses'), false);
});

test('an ended test can still be edited: the form sends its times back unchanged', async (t) => {
  if (skip) return t.skip(skip);
  const pa = await schedule({ accessCode: 'LAB-7' });
  await as(school.tenantId, kid.userId, ['learning.use'], () => tests.start(pa.id, 'lab-7'));
  const closed = await as(school.tenantId, teacher, MANAGE, () => tests.close(pa.id));
  const minute = new Date(Math.floor(Date.parse(closed.closesAt) / 60_000) * 60_000).toISOString();
  const edited = await as(school.tenantId, teacher, MANAGE, () => tests.update(pa.id, { title: 'New title', closesAt: minute } as never));
  assert.equal(edited.title, 'New title');
  assert.equal(edited.status, 'CLOSED');
  assert.equal(edited.accessCode, 'LAB-7');
});

test('teachers still can’t move a started test’s closing time into the past', async (t) => {
  if (skip) return t.skip(skip);
  const pa = await schedule();
  await sit(pa.id);
  assert.equal(await code(as(school.tenantId, teacher, MANAGE, () => tests.update(pa.id, { closesAt: new Date(Date.now() - 10 * 60_000).toISOString() } as never))), 400);
});

test('a time-up hand-in with nothing saved is marked as empty work, not refused', async (t) => {
  if (skip) return t.skip(skip);
  const pa = await schedule();
  const sitting = await sit(pa.id);
  await prisma.root.practicalAttempt.update({ where: { id: sitting.id }, data: { endsAt: new Date(Date.now() - 3 * 60_000) } });
  await asKid(() => labs.submit(kid.access, sitting.id, {}));
  const stored = await prisma.root.practicalAttempt.findUniqueOrThrow({ where: { id: sitting.id } });
  assert.ok(stored.submittedAt);
  assert.equal(stored.score, 0);
});
