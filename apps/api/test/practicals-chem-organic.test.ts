// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-chem-organic.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHEM_ORGANIC,
  ORG_PRACTICAL_TASKS,
  ORG_TASKS,
  chemOrganicStateSchema,
  chemOrganicVariant,
  emptyChemOrganicState,
  orgIdealRecord,
  orgModelState,
  orgObserve,
  rubricTotal,
  soapModelEvents,
  soapRun,
  type ChemOrganicState,
  type OrgTask,
} from '@aischool/shared';
import { chemOrganicGrader } from '../src/practicals/graders/chem-organic';
import { GRADERS } from '../src/practicals/graders';

type Out = ReturnType<typeof chemOrganicGrader.grade>;
const by = (out: Out, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: Out) => out.auto.reduce((t, c) => t + c.awarded, 0);
const AUTO_MAX = CHEM_ORGANIC.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function perfect(seed: number, task: OrgTask): ChemOrganicState {
  const s = orgModelState(chemOrganicVariant(seed, task));
  s.written = { precautions: 'Goggles were worn; the tubes were heated in a water bath.', explain: 'Addition across the double bond; hydrolysis to glucose; peptide links.' };
  return s;
}
const grade = (s: ChemOrganicState, seed: number) => chemOrganicGrader.grade(s, seed);

test('the rubric is 20 marks, registered, lessons mapped, and the variant is fixed by the seed', () => {
  assert.equal(rubricTotal(CHEM_ORGANIC.rubric), 20);
  assert.equal(GRADERS['chem-organic'], chemOrganicGrader);
  assert.deepEqual(Object.values(ORG_PRACTICAL_TASKS).sort(), [...ORG_TASKS].sort());
  for (const t of ORG_TASKS) assert.equal(JSON.stringify(chemOrganicVariant(99, t)), JSON.stringify(chemOrganicVariant(99, t)));
  const v = chemOrganicVariant(5, 'GROUPS');
  assert.deepEqual(v.samples.map((s) => s.content.kind).sort(), ['ACID', 'ALKANE', 'ALKANOL', 'ALKENE']);
  const orders = new Set(Array.from({ length: 60 }, (_, i) => chemOrganicVariant(i + 1, 'GROUPS').samples.map((s) => s.content.kind).join()));
  assert.ok(orders.size >= 10, 'the unknowns are shuffled per attempt');
  const p = chemOrganicVariant(5, 'PROTEINS');
  assert.ok(p.samples.some((s) => s.def.id === 'egg') && p.samples.some((s) => s.content.protein) && p.samples.some((s) => s.letter !== 'H2O' && !s.content.protein));
});

for (const task of ORG_TASKS)
  test(`${task}: the model answer gets full auto marks across 40 seeds`, () => {
    for (let seed = 1; seed <= 40; seed++) {
      const out = grade(perfect(seed, task), seed);
      assert.equal(autoTotal(out), AUTO_MAX, `seed ${seed}: ${JSON.stringify(out.auto.filter((c) => c.awarded < c.max))}`);
      assert.equal(out.ai.length, 2);
      assert.ok(out.solution.length >= 2);
      assert.ok(chemOrganicStateSchema.safeParse(perfect(seed, task)).success);
    }
  });

test('chemistry: alkene decolourises bromine, alkanol turns dichromate green, acid fizzes with NaHCO₃', () => {
  const v = chemOrganicVariant(11, 'GROUPS');
  const of = (k: string) => v.samples.find((s) => s.content.kind === k)!.letter;
  const T = (sample: ReturnType<typeof of>, test: 'BROMINE' | 'DICHROMATE' | 'NAHCO3', heat = 0) => orgObserve(v, { sample: sample as never, test, steps: [], heat, direct: false, boil: 0, portions: [], drops: 0 });
  assert.ok(T(of('ALKENE'), 'BROMINE').positive);
  assert.ok(!T(of('ALKANE'), 'BROMINE').positive);
  assert.ok(T(of('ALKANOL'), 'DICHROMATE', 120).positive);
  assert.ok(!T(of('ALKANOL'), 'DICHROMATE', 0).complete, 'unwarmed dichromate is not finished');
  assert.ok(T(of('ACID'), 'NAHCO3').positive);
});

test('GROUPS mistakes: no catalyst, direct heating, a wrong identification', () => {
  const seed = 7;
  const s = perfect(seed, 'GROUPS');
  const i = s.tests.findIndex((t) => t.test === 'ESTER');
  s.tests[i]!.steps = s.tests[i]!.steps.filter((x) => x !== 'H2SO4');
  const out = grade(s, seed);
  assert.ok(by(out, 'procedure').awarded <= 3.5);
  const d = perfect(seed, 'GROUPS');
  d.tests.forEach((t) => t.test === 'DICHROMATE' && (t.direct = true));
  assert.equal(by(grade(d, seed), 'procedure').awarded, 3.5);
  const w = perfect(seed, 'GROUPS');
  const alkene = chemOrganicVariant(seed, 'GROUPS').samples.find((x) => x.content.kind === 'ALKENE')!.letter;
  w.conclusion[alkene] = ['ALKANE'];
  assert.equal(by(grade(w, seed), 'results').awarded, 2.5);
  // inferring from an unfinished test
  const u = perfect(seed, 'GROUPS');
  const k = u.tests.findIndex((t) => t.test === 'DICHROMATE');
  u.tests[k]!.heat = 0;
  assert.ok(by(grade(u, seed), 'inferences').awarded < 4);
});

test('CARBS mistakes: no hydrolysis, Benedict’s not heated long enough, iodine heated', () => {
  const seed = 3;
  const s = perfect(seed, 'CARBS');
  const n = clone(s);
  const keep = n.tests.map((t, i) => ({ t, i })).filter((x) => x.t.test !== 'HYDROLYSIS');
  n.tests = keep.map((x) => x.t);
  n.table = keep.map((x) => s.table[x.i]!);
  assert.ok(by(grade(n, seed), 'procedure').awarded <= 2.5);
  const h = clone(s);
  h.tests.forEach((t) => t.test === 'BENEDICT' && (t.heat = 60));
  assert.ok(by(grade(h, seed), 'procedure').awarded <= 3.5);
  const io = clone(s);
  const v = chemOrganicVariant(seed, 'CARBS');
  io.tests.forEach((t, i) => {
    if (t.test === 'IODINE') {
      t.heat = 60;
      io.table[i] = { ...orgIdealRecord(v, { ...t, heat: 0 }) };
    }
  });
  assert.ok(by(grade(io, seed), 'inferences').awarded < 4);
});

test('PROTEINS mistakes: excess CuSO₄, no water control, wrong calculation', () => {
  const seed = 9;
  const s = perfect(seed, 'PROTEINS');
  s.tests.forEach((t) => t.test === 'BIURET' && (t.drops = 12));
  const out = grade(s, seed);
  assert.ok(by(out, 'procedure').awarded <= 3.5);
  assert.ok(by(out, 'inferences').awarded < 4);
  const c = perfect(seed, 'PROTEINS');
  const keep = c.tests.map((t, i) => ({ t, i })).filter((x) => x.t.sample !== 'H2O');
  const tab = c.table;
  c.tests = keep.map((x) => x.t);
  c.table = keep.map((x) => tab[x.i]!);
  assert.equal(by(grade(c, seed), 'procedure').awarded, 3.5);
  const w = perfect(seed, 'PROTEINS');
  w.calc = { a: '60', b: '50', c: '' };
  assert.equal(by(grade(w, seed), 'results').awarded, 2);
});

test('SOAP: the run, and the mistakes cost the right marks', () => {
  const seed = 4;
  const v = chemOrganicVariant(seed, 'SOAP');
  const r = soapRun(v, soapModelEvents());
  assert.ok(r.extent > 0.95 && !r.charred && r.separated && r.soapMass! > 0);
  assert.ok(r.soapMass! / r.theory > 0.75 && r.soapMass! / r.theory < 1);
  // unstirred
  const u = perfect(seed, 'SOAP');
  u.soap = u.soap.map((e) => (e.a === 'BOIL' ? { ...e, a: 'BOIL_NOSTIR' } : e));
  assert.ok(by(grade(u, seed), 'procedure').awarded <= 3.5);
  // never topped up and boiled 25 minutes: chars
  const d = perfect(seed, 'SOAP');
  d.soap = [{ a: 'OIL', n: 0 }, { a: 'NAOH', n: 0 }, ...Array.from({ length: 25 }, () => ({ a: 'BOIL' as const, n: 60 })), { a: 'BRINE', n: 0 }, { a: 'FILTER', n: 0 }];
  assert.ok(soapRun(v, d.soap).charred);
  // only 5 minutes: incomplete
  const short = soapRun(v, [{ a: 'OIL', n: 0 }, { a: 'NAOH', n: 0 }, ...Array.from({ length: 5 }, () => ({ a: 'BOIL' as const, n: 60 }))]);
  assert.ok(short.extent < 0.85);
  // the yield from their own numbers (error carried forward), and a wrong by-product
  const y = perfect(seed, 'SOAP');
  y.readings.byproduct = 'ethanol';
  assert.equal(by(grade(y, seed), 'results').awarded, 2.5);
});

test('the state schema rejects garbage and accepts the empty state', () => {
  assert.ok(chemOrganicStateSchema.safeParse(emptyChemOrganicState()).success);
  assert.ok(!chemOrganicStateSchema.safeParse({ ...emptyChemOrganicState(), task: 'MAGIC' }).success);
  assert.ok(!chemOrganicStateSchema.safeParse({ ...emptyChemOrganicState(), tests: [{ sample: 'Q9', test: 'BROMINE', steps: [], heat: 0, direct: false, boil: 0, portions: [], drops: 0 }] }).success);
  assert.ok(!chemOrganicStateSchema.safeParse({ ...emptyChemOrganicState(), soap: Array.from({ length: 300 }, () => ({ a: 'BOIL', n: 60 })) }).success);
  assert.ok(!chemOrganicStateSchema.safeParse({ ...emptyChemOrganicState(), conclusion: { A: ['UNICORN'] } }).success);
  const empty = grade(emptyChemOrganicState(), 1);
  assert.equal(autoTotal(empty), 0);
});
