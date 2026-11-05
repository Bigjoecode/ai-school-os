// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/neco-waec-past.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MOCK_PAPERS, waecPastLabel, waecPastStartSchema } from '@aischool/shared';
import { ExamService, WAEC_PAST_POOL } from '../src/learning/exam.service';
import { SittingService } from '../src/learning/sitting.service';
import { StudyService } from '../src/learning/study.service';

// An in-memory Prisma that really applies each `where`, so these tests exercise the filters themselves.
type Row = Record<string, any>;
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v === undefined) return true;
    if (k === 'OR') return (v as Row[]).some((w) => matches(row, w));
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      if ('in' in v) return v.in.includes(row[k]);
      if ('notIn' in v) return !v.notIn.includes(row[k]);
      if ('not' in v) return row[k] !== v.not;
      if ('gte' in v) return row[k] >= v.gte;
      if ('isEmpty' in v) return (row[k] ?? []).length === 0 === v.isEmpty;
      throw new Error(`unhandled filter on ${k}`);
    }
    return (row[k] ?? null) === v;
  });
}

let seq = 0;
function q(over: Row): Row {
  seq++;
  return { id: `q${seq}`, exam: 'WAEC', subject: 'Mathematics', type: 'OBJECTIVE', source: 'LICENSED', status: 'PUBLISHED', year: 2011, topicId: 'alg', topic: { name: 'Algebra' }, stem: `Question ${seq}`, options: ['a', 'b', 'c', 'd'], answer: 0, explanation: 'Because.', marks: 1, markingGuide: null, bankRef: `b${String(seq).padStart(4, '0')}`, createdAt: new Date(seq), ...over };
}

function world() {
  seq = 0;
  const bank = [
    ...Array.from({ length: 6 }, () => q({})),
    ...Array.from({ length: 3 }, () => q({ year: 2008, topicId: 'sub', topic: { name: 'Quadratics' } })),
    q({ year: null, topicId: 'geo', topic: { name: 'Geometry' } }),
    ...Array.from({ length: 4 }, () => q({ year: 2013, status: 'DRAFT', stem: 'DRAFT past' })),
    q({ year: 2010, status: 'RETIRED', stem: 'RETIRED past' }),
    ...Array.from({ length: 4 }, () => q({ source: 'AUTHORED', year: null, stem: 'AUTHORED waec' })),
    q({ type: 'THEORY', options: [], stem: 'THEORY past', markingGuide: 'x' }),
    ...Array.from({ length: 3 }, () => q({ subject: 'Physics', status: 'DRAFT', stem: 'DRAFT physics' })),
    ...Array.from({ length: 12 }, () => q({ exam: 'NECO', source: 'AUTHORED', year: null, stem: 'NECO own' })),
    q({ exam: 'NECO', type: 'THEORY', source: 'AUTHORED', year: null, options: [], stem: 'NECO own theory', markingGuide: 'x' }),
  ];
  const topics: Row[] = [
    { id: 'alg', name: 'Algebra', parentId: null, parent: null, subject: 'Mathematics' },
    { id: 'sub', name: 'Quadratics', parentId: 'alg', parent: { name: 'Algebra' }, subject: 'Mathematics' },
    { id: 'geo', name: 'Geometry', parentId: null, parent: null, subject: 'Mathematics' },
  ];
  const attempts: Row[] = [];
  const sittings: Row[] = [];
  const group = (rows: Row[], by: string[]) => {
    const out = new Map<string, Row>();
    for (const r of rows) {
      const key = by.map((b) => r[b]).join('|');
      const g = out.get(key) ?? { ...Object.fromEntries(by.map((b) => [b, r[b] ?? null])), _count: { _all: 0 } };
      g._count._all++;
      out.set(key, g);
    }
    return [...out.values()];
  };
  const root = {
    examQuestion: {
      findMany: async ({ where }: Row) => bank.filter((r) => matches(r, where)).map((r) => ({ ...r })),
      count: async ({ where }: Row) => bank.filter((r) => matches(r, where)).length,
      groupBy: async ({ by, where }: Row) => group(bank.filter((r) => matches(r, where)), by).sort((a, b) => String(a.subject).localeCompare(String(b.subject)) || (b.year ?? 0) - (a.year ?? 0)),
    },
    syllabusTopic: {
      findMany: async ({ where }: Row) => topics.filter((t) => matches(t, where)),
      findUnique: async ({ where }: Row) => topics.find((t) => t.id === where.id) ?? null,
    },
    student: { findUnique: async () => null },
    practiceAttempt: {
      count: async ({ where }: Row) => attempts.filter((a) => matches(a, where)).length,
      create: async ({ data }: Row) => {
        const a = { id: `a${attempts.length + 1}`, answers: null, score: null, perTopic: null, review: null, submittedAt: null, startedAt: new Date(), endsAt: null, ...data };
        attempts.push(a);
        return a;
      },
      findFirst: async ({ where }: Row) => attempts.find((a) => matches(a, where)) ?? null,
      findMany: async ({ where }: Row) => attempts.filter((a) => matches(a, where)),
      updateMany: async ({ where, data }: Row) => {
        const hit = attempts.filter((a) => matches(a, where));
        hit.forEach((a) => Object.assign(a, data));
        return { count: hit.length };
      },
      findUniqueOrThrow: async ({ where }: Row) => attempts.find((a) => a.id === where.id),
    },
    examSitting: {
      create: async ({ data }: Row) => {
        const s = { id: `s${sittings.length + 1}`, result: null, finishedAt: null, startedAt: new Date(), ...data };
        sittings.push(s);
        return s;
      },
      findFirst: async ({ where }: Row) => sittings.find((s) => matches(s, where)) ?? null,
      update: async () => ({}),
    },
  };
  const prisma = { root } as any;
  const evidence: Row[] = [];
  const mastery = {
    record: async (_t: string, _s: string, topicId: string, correct: number, total: number, e: Row) => void evidence.push({ topicId, correct, total, ...e }),
    topicFor: async (_s: string, _sub: string, name: string) => ({ id: topics.find((t) => t.name === name)?.id ?? name }),
  } as any;
  const study = new StudyService(prisma, null as any, null as any, mastery);
  const exams = new ExamService(prisma, null as any, null as any, study, null as any, mastery);
  const sitting = new SittingService(prisma, study, exams);
  return { bank, attempts, evidence, study, exams, sitting };
}

const access = (...held: string[]) => ({ studentId: 'st', tenantId: 't', exams: held, windowStart: new Date(0).toISOString(), remaining: 0 }) as any;
const neco = access('NECO');
const none = access();
const refused = (code = 'EXAM_NOT_INCLUDED') => (e: any) => {
  assert.equal(e.status, 403);
  assert.equal(e.getResponse().code, code);
  return true;
};

// ---------------------------------------------------------- labelling

test('what the API returns says WAEC past question, with the year, and keeps exam WAEC', async () => {
  const w = world();
  const v = w.study.view(await w.exams.startWaecPast(neco, { subject: 'maths', year: 2011, questions: 20 }));
  assert.equal(v.exam, 'WAEC');
  assert.equal(v.mode, 'WAEC_PAST');
  assert.equal(v.title, 'WAEC past questions 2011 — Mathematics');
  assert.equal(v.questions.length, 6);
  for (const x of v.questions) {
    assert.equal(x.sourceLabel, 'WAEC past question 2011');
    assert.equal(x.year, 2011);
  }
  assert.ok(!/NECO/i.test(JSON.stringify(v)), 'nothing in the attempt mentions NECO');
});

test('a mixed set labels each question with its own year, and a question without one says so plainly', async () => {
  const w = world();
  const v = w.study.view(await w.exams.startWaecPast(neco, { subject: 'Mathematics', questions: 100 }));
  assert.equal(v.title, 'WAEC past questions: Mathematics');
  assert.deepEqual([...new Set(v.questions.map((x) => x.sourceLabel))].sort(), ['WAEC past question', 'WAEC past question 2008', 'WAEC past question 2011']);
  assert.equal(waecPastLabel(null), 'WAEC past question');
});

test('the label stays in attempt history and in the marked results', async () => {
  const w = world();
  const a = await w.exams.startWaecPast(neco, { subject: 'Mathematics', year: 2008, questions: 10 });
  const marked = await w.study.submit('st', a.id, [0, 0, 1]);
  const v = w.study.view(marked);
  assert.ok(v.submittedAt);
  assert.ok(v.questions.every((x) => x.sourceLabel === 'WAEC past question 2008'));
  const row = w.study.row(marked);
  assert.equal(row.title, 'WAEC past questions 2008 — Mathematics');
  assert.equal(row.exam, 'WAEC');
  assert.equal(row.mode, 'WAEC_PAST');
});

test('a topic set names the topic and takes in its subtopics', async () => {
  const w = world();
  const v = w.study.view(await w.exams.startWaecPast(neco, { subject: 'Mathematics', topicId: 'alg', questions: 100 }));
  assert.equal(v.title, 'WAEC past questions: Mathematics (Algebra)');
  assert.equal(v.questions.length, 9);
});

test('a year keeps the original order and options as set', async () => {
  const w = world();
  const a = await w.exams.startWaecPast(neco, { subject: 'Mathematics', year: 2011, questions: 5 });
  assert.equal((a.questions as Row[]).length, 6, 'the whole year, whatever the set size');
  assert.deepEqual((a.questions as Row[]).map((x) => x.stem), ['Question 1', 'Question 2', 'Question 3', 'Question 4', 'Question 5', 'Question 6']);
  assert.ok((a.questions as Row[]).every((x) => x.options.join() === 'a,b,c,d' && x.answer === 0));
});

// ---------------------------------------------------------- what is served

test('only published WAEC past objectives are served: no drafts, retired, our own or theory questions', async () => {
  const w = world();
  const a = await w.exams.startWaecPast(neco, { subject: 'Mathematics', questions: 100 });
  const ids = new Set((a.questions as Row[]).map((x) => x.questionId));
  assert.equal(ids.size, 10);
  for (const r of w.bank.filter((x) => ids.has(x.id))) {
    assert.equal(r.exam, 'WAEC');
    assert.equal(r.source, 'LICENSED');
    assert.equal(r.status, 'PUBLISHED');
    assert.equal(r.type, 'OBJECTIVE');
  }
  await assert.rejects(w.exams.startWaecPast(neco, { subject: 'Mathematics', year: 2013, questions: 10 }), /no published WAEC past questions/);
});

test('a subject with only drafts says so, and the catalog leaves it out', async () => {
  const w = world();
  await assert.rejects(w.exams.startWaecPast(neco, { subject: 'Physics', questions: 10 }), /There are no published WAEC past questions for Physics yet/);
  const cat = await w.exams.catalog(neco);
  const entry = cat.exams.find((e) => e.exam === 'NECO')!;
  assert.deepEqual(entry.waecPast, [{ subject: 'Mathematics', questions: 10, years: [{ year: 2011, questions: 6 }, { year: 2008, questions: 3 }] }]);
  assert.equal(cat.exams.find((e) => e.exam === 'WAEC')!.waecPast, undefined);
});

test('the catalog offers nothing when no WAEC past question is published', async () => {
  const w = world();
  w.bank.forEach((r) => r.exam === 'WAEC' && (r.status = 'DRAFT'));
  const entry = (await w.exams.catalog(neco)).exams.find((e) => e.exam === 'NECO')!;
  assert.equal(entry.waecPast, undefined);
});

// ---------------------------------------------------------- never measures NECO

test('a NECO mock paper draws only on NECO questions', async () => {
  const w = world();
  assert.equal((await w.exams.poolWhere('NECO', 'Mathematics', MOCK_PAPERS.NECO.Mathematics![0]!)).exam, 'NECO');
  await w.exams.startWaecPast(neco, { subject: 'Mathematics', questions: 10 });
  const s = await w.sitting.create(neco, { exam: 'NECO', subject: 'Mathematics' });
  const obj = s.papers.find((p) => p.kind === 'OBJECTIVE')!;
  const paper = await w.sitting.startPaper(neco, s.id, obj.paper);
  const qs = paper.questions as Row[];
  assert.ok(qs.length > 0);
  for (const x of qs) assert.equal(w.bank.find((r) => r.id === x.questionId)!.exam, 'NECO');
  assert.ok(!qs.some((x) => x.sourceLabel));
});

test('a marked WAEC past attempt is no part of any NECO sitting or result', async () => {
  const w = world();
  const a = await w.exams.startWaecPast(neco, { subject: 'Mathematics', questions: 10 });
  await w.study.submit('st', a.id, (a.questions as Row[]).map(() => 0));
  assert.equal(a.sittingId, null);
  const s = await w.sitting.create(neco, { exam: 'NECO', subject: 'Mathematics' });
  assert.ok(s.papers.every((p) => p.attemptId === null));
  assert.equal(s.result, null);
  // Even a finished sitting only ever reads the attempts tied to it.
  const obj = s.papers.find((p) => p.kind === 'OBJECTIVE')!;
  const paper = await w.sitting.startPaper(neco, s.id, obj.paper);
  assert.notEqual(paper.id, a.id);
  const after = await w.sitting.view(neco, s.id);
  assert.equal(after.papers.find((p) => p.paper === obj.paper)!.attemptId, paper.id);
  assert.equal(after.papers.find((p) => p.paper === obj.paper)!.status, 'IN_PROGRESS');
});

test('NECO practice and timed mocks stay NECO', async () => {
  const w = world();
  for (const mode of ['PRACTICE', 'MOCK'] as const) {
    const a = await w.exams.start(neco, { mode, exam: 'NECO', subjects: ['Mathematics'], questions: 40 });
    for (const x of a.questions as Row[]) assert.equal(w.bank.find((r) => r.id === x.questionId)!.exam, 'NECO');
  }
});

test('mastery evidence goes to the syllabus topic as ordinary practice, as WAEC practice does', async () => {
  const w = world();
  const a = await w.exams.startWaecPast(neco, { subject: 'Mathematics', year: 2011, questions: 10 });
  await w.study.submit('st', a.id, [0, 0, 0, 1, 1, 1]);
  assert.deepEqual(w.evidence, [{ topicId: 'alg', correct: 3, total: 6, source: 'PRACTICE', sourceId: a.id }]);
});

// ---------------------------------------------------------- access

test('NECO Prep is the key; neither product, or WAEC Prep alone, gets nothing new', async () => {
  const w = world();
  assert.ok(await w.exams.startWaecPast(neco, { subject: 'Mathematics', questions: 10 }));
  assert.ok((await w.exams.waecPastTopics(neco, 'Mathematics')).length > 0);
  for (const who of [none, access('WAEC'), access('JAMB', 'BECE')]) {
    await assert.rejects(w.exams.startWaecPast(who, { subject: 'Mathematics', questions: 10 }), refused());
    await assert.rejects(w.exams.waecPastTopics(who, 'Mathematics'), refused());
    assert.equal((await w.exams.catalog(who)).exams.find((e) => e.exam === 'NECO')!.waecPast, undefined);
  }
});

test('the topic list counts only published past questions', async () => {
  const w = world();
  assert.deepEqual((await w.exams.waecPastTopics(neco, 'Mathematics')).map((t) => [t.topic, t.questions]), [['Algebra', 6], ['Quadratics', 3], ['Geometry', 1]]);
});

test('NECO Prep unlocks no other part of WAEC Prep', async () => {
  const w = world();
  await assert.rejects(w.sitting.create(neco, { exam: 'WAEC', subject: 'Mathematics' }), refused());
  await assert.rejects(w.exams.start(neco, { mode: 'MOCK', exam: 'WAEC', subjects: ['Mathematics'], questions: 20 }), refused());
  await assert.rejects(w.exams.startTheory(neco, { exam: 'WAEC', subject: 'Mathematics', questions: 2 }), refused());
  await assert.rejects(w.exams.startTheory(neco, { exam: 'WAEC', subject: 'Mathematics', questions: 2, type: 'PRACTICAL' }), refused());
  await assert.rejects(w.exams.startUtme(neco, { subjects: ['Physics', 'Chemistry', 'Biology'], allowShort: true }), refused());
  // Ordinary WAEC practice is still the free taste: five questions.
  const free = await w.exams.start(neco, { mode: 'PRACTICE', exam: 'WAEC', subjects: ['Mathematics'], questions: 20 });
  assert.equal((free.questions as Row[]).length, 5);
});

test('the request cannot change what it reaches: the exam, type and source are not parameters', async () => {
  const w = world();
  const body = waecPastStartSchema.parse({ subject: 'Mathematics', exam: 'NECO', type: 'THEORY', source: 'AUTHORED', status: 'DRAFT', mode: 'MOCK', sittingId: 'x', questions: 40 });
  assert.deepEqual(Object.keys(body).sort(), ['questions', 'subject']);
  const a = await w.exams.startWaecPast(neco, { ...body, exam: 'NECO', type: 'THEORY', status: 'DRAFT' } as any);
  assert.equal(a.exam, 'WAEC');
  assert.equal(a.durationMinutes, null);
  assert.ok((a.questions as Row[]).every((x) => w.bank.find((r) => r.id === x.questionId)!.status === 'PUBLISHED'));
  assert.deepEqual(WAEC_PAST_POOL, { exam: 'WAEC', source: 'LICENSED', status: 'PUBLISHED', type: 'OBJECTIVE' });
});

test('included with NECO Prep: it neither uses up the free WAEC sets nor gets past them', async () => {
  const w = world();
  for (let i = 0; i < 4; i++) await w.exams.startWaecPast(neco, { subject: 'Mathematics', questions: 10 });
  assert.equal((await w.exams.catalog(neco)).freePractice.used, 0);
  for (let i = 0; i < 3; i++) await w.exams.start(neco, { mode: 'PRACTICE', exam: 'WAEC', subjects: ['Mathematics'], questions: 5 });
  assert.equal((await w.exams.catalog(neco)).freePractice.used, 3);
  await assert.rejects(w.exams.start(neco, { mode: 'PRACTICE', exam: 'WAEC', subjects: ['Mathematics'], questions: 5 }), refused());
  await assert.rejects(w.exams.startPastPaper(neco, { exam: 'WAEC', subject: 'Mathematics', year: 2011 }), refused());
  assert.ok(await w.exams.startWaecPast(neco, { subject: 'Mathematics', questions: 10 }), 'still open to the holder');
});
