// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-bio-food-tests.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BIO_FOOD_TESTS,
  BENEDICT_STAGE_NAME,
  FOOD_PRACTICAL_TASKS,
  amyModelState,
  amyObservedEnd,
  amyTrueEnd,
  benedictIndex,
  benedictStage,
  bioFoodStateSchema,
  bioFoodVariant,
  contentNutrients,
  emptyBioFoodState,
  foodIdealRecord,
  foodModelTests,
  foodObserve,
  rubricTotal,
  type BioFoodState,
  type FoodTest,
} from '@aischool/shared';
import { bioFoodGrader } from '../src/practicals/graders/bio-food-tests';
import { GRADERS } from '../src/practicals/graders';

type Out = ReturnType<typeof bioFoodGrader.grade>;
const by = (out: Out, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: Out) => out.auto.reduce((t, c) => t + c.awarded, 0);
const AUTO_MAX = BIO_FOOD_TESTS.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function perfectFood(seed: number): BioFoodState {
  const v = bioFoodVariant(seed, 'FOOD');
  const s = emptyBioFoodState();
  s.task = 'FOOD';
  s.tests = foodModelTests(v);
  s.table = s.tests.map((t) => foodIdealRecord(v, s, t));
  for (const sm of v.samples) s.conclusion[sm.letter] = contentNutrients(sm.content);
  s.written = { precautions: 'Clean test tubes were used for each test; Benedict’s was heated in a water bath.', explain: 'Boiling with acid hydrolyses sucrose into glucose and fructose, which are reducing sugars; the acid is neutralised because Benedict’s works only in alkaline conditions.' };
  return s;
}
function perfectAmylase(seed: number): BioFoodState {
  const v = bioFoodVariant(seed, 'AMYLASE');
  const s = amyModelState(v);
  s.written = { precautions: 'The tubes were equilibrated to the bath temperature before mixing; a clean dropper each time.', explain: 'At the optimum, 37 °C, the enzyme is most active; in the cold there is little kinetic energy so it is slow; boiling denatures the active site.' };
  return s;
}
const seedWhere = (ok: (s: number) => boolean) => {
  for (let s = 1; s < 5000; s++) if (ok(s)) return s;
  throw new Error('no seed');
};

test('the rubric is 20 marks, registered, and the variant is the same for a seed', () => {
  assert.equal(rubricTotal(BIO_FOOD_TESTS.rubric), 20);
  assert.equal(GRADERS['bio-food-tests'], bioFoodGrader);
  assert.deepEqual(FOOD_PRACTICAL_TASKS, { 'pr-bio-food-tests': 'FOOD', 'pr-bio-salivary-amylase': 'AMYLASE' });
  assert.deepEqual(JSON.stringify(bioFoodVariant(777, 'FOOD')), JSON.stringify(bioFoodVariant(777, 'FOOD')));
  const foods = new Set(Array.from({ length: 300 }, (_, i) => bioFoodVariant(i + 1, 'FOOD').samples.map((x) => x.food.id)).flat());
  assert.ok(foods.size >= 11, `only ${foods.size} foods drawn`);
  for (let seed = 1; seed <= 200; seed++) {
    const v = bioFoodVariant(seed, 'FOOD');
    const all = new Set(v.samples.flatMap((x) => contentNutrients(x.content)));
    for (const n of ['STARCH', 'REDUCING', 'PROTEIN', 'FAT'] as const) assert.ok(all.has(n), `seed ${seed}: no ${n}`);
    assert.ok(v.samples.some((x) => !contentNutrients(x.content).includes('REDUCING')));
  }
});

test("Benedict's colour is graded with concentration and develops with heating time", () => {
  const stage = (c: number, t: number) => BENEDICT_STAGE_NAME[benedictStage(benedictIndex(c, t))];
  assert.equal(stage(0, 300), 'blue');
  assert.equal(stage(0.04, 300), 'blue');
  assert.equal(stage(0.12, 300), 'green');
  assert.equal(stage(0.3, 300), 'yellow');
  assert.equal(stage(0.8, 300), 'orange');
  assert.equal(stage(2, 300), 'brick-red');
  // Over time in the bath: blue → … → brick-red.
  assert.deepEqual([0, 15, 30, 60, 180].map((t) => stage(2, t)), ['blue', 'green', 'yellow', 'orange', 'brick-red']);
  // Not heated: no change.
  assert.equal(stage(2, 0), 'blue');
});

test('ideal work gets full AUTO marks across 40 seeds (both tasks)', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const f = bioFoodGrader.grade(perfectFood(seed), seed);
    assert.equal(autoTotal(f), AUTO_MAX, `FOOD seed ${seed}: ${JSON.stringify(f.auto)}`);
    assert.equal(f.ai.length, 2);
    assert.ok(f.solution.length > 5);
    const a = bioFoodGrader.grade(perfectAmylase(seed), seed);
    assert.equal(autoTotal(a), AUTO_MAX, `AMYLASE seed ${seed}: ${JSON.stringify(a.auto)}`);
    assert.ok(bioFoodStateSchema.safeParse(perfectFood(seed)).success);
    assert.ok(bioFoodStateSchema.safeParse(perfectAmylase(seed)).success);
  }
});

test('FOOD: an unheated Benedict test, heating directly, and “red colour” lose the right marks', () => {
  const seed = 3;
  const v = bioFoodVariant(seed, 'FOOD');
  const s = perfectFood(seed);
  // Find a sample with a strong reducing sugar.
  const k = s.tests.findIndex((t) => t.test === 'BENEDICT' && benedictStage(benedictIndex(v.samples.find((x) => x.letter === t.sample)!.content.reducing, 300)) === 4);
  assert.ok(k >= 0);
  // "red colour" instead of "brick-red precipitate": half the observation for that row.
  const red = clone(s);
  red.table[k]!.observation = 'red colour';
  const outRed = bioFoodGrader.grade(red, seed);
  assert.ok(by(outRed, 'observations').awarded < 5 && by(outRed, 'observations').awarded >= 4.5, JSON.stringify(by(outRed, 'observations')));
  // Not heated: blue, and nothing can be inferred.
  const cold = clone(s);
  cold.tests[k]!.heat = 0;
  const outCold = bioFoodGrader.grade(cold, seed);
  assert.ok(foodObserve(v, cold, cold.tests[k]!).parts[0]!.text.includes('stays blue'));
  assert.ok(by(outCold, 'inferences').awarded < 4);
  assert.ok(by(outCold, 'procedure').awarded <= 3.5);
  assert.match(by(outCold, 'inferences').note, /not heated long enough/);
  // Heated directly over the flame.
  const direct = clone(s);
  direct.tests[k]!.direct = true;
  const outDirect = bioFoodGrader.grade(direct, seed);
  assert.equal(by(outDirect, 'procedure').awarded, 3.5);
  assert.match(by(outDirect, 'procedure').note, /directly/);
});

test('FOOD: the non-reducing test without neutralising, and inferring the wrong thing', () => {
  const seed = seedWhere((x) => bioFoodVariant(x, 'FOOD').samples.some((sm) => sm.content.sucrose > 0 && sm.content.reducing === 0));
  const v = bioFoodVariant(seed, 'FOOD');
  const s = perfectFood(seed);
  const sm = v.samples.find((x) => x.content.sucrose > 0 && x.content.reducing === 0)!;
  const k = s.tests.findIndex((t) => t.test === 'NONREDUCING' && t.sample === sm.letter);
  assert.ok(k >= 0);
  assert.deepEqual(s.table[k]!.present, ['NONREDUCING']);
  const bad = clone(s);
  bad.tests[k]!.steps = ['ACID', 'BENEDICT'];
  const o = foodObserve(v, bad, bad.tests[k]!);
  assert.equal(o.complete, false);
  assert.equal(o.visual.benedict, 0);
  bad.table[k] = { observation: 'the solution remains blue', present: [], absent: ['NONREDUCING'], note: '' };
  const out = bioFoodGrader.grade(bad, seed);
  assert.ok(by(out, 'inferences').awarded < 4);
  assert.ok(by(out, 'procedure').awarded < 4);
  // Inferring starch from a Biuret test: that row's inference is lost.
  const wrong = clone(s);
  const b = wrong.tests.findIndex((t) => t.test === 'BIURET');
  wrong.table[b] = { ...wrong.table[b]!, present: [...wrong.table[b]!.present, 'STARCH'] };
  assert.match(by(bioFoodGrader.grade(wrong, seed), 'inferences').note, /does not show starch/);
  // A wrong conclusion for one sample.
  const concl = clone(s);
  concl.conclusion.P = concl.conclusion.P.includes('FAT') ? concl.conclusion.P.filter((x) => x !== 'FAT') : [...concl.conclusion.P, 'FAT'];
  assert.equal(by(bioFoodGrader.grade(concl, seed), 'results').awarded, 2.5);
});

test('FOOD: missing tests and an empty attempt', () => {
  const seed = 9;
  const s = perfectFood(seed);
  const noFat = clone(s);
  const keep = noFat.tests.map((t, i) => (t.test === 'SUDAN' ? -1 : i)).filter((i) => i >= 0);
  noFat.tests = keep.map((i) => s.tests[i]!);
  noFat.table = keep.map((i) => s.table[i]!);
  const out = bioFoodGrader.grade(noFat, seed);
  assert.ok(by(out, 'procedure').awarded <= 3.5);
  assert.ok(by(out, 'observations').awarded < 5);
  const empty = bioFoodGrader.grade({ ...emptyBioFoodState(), task: 'FOOD' }, seed);
  assert.equal(autoTotal(empty), 0);
});

test('AMYLASE: digestion model — 37 °C fastest, ice slow, boiled saliva and boiling never reach an end point', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const v = bioFoodVariant(seed, 'AMYLASE');
    const end = (bath: 'ICE' | 'ROOM' | 'BODY' | 'WARM' | 'BOILING', boiled = false) => amyTrueEnd(v, { bath, boiled }, true);
    const body = end('BODY')!;
    assert.ok(body >= 50 && body <= 140, `seed ${seed} body ${body}`);
    assert.ok(end('ICE')! > 4 * body, `seed ${seed} ice ${end('ICE')} body ${body}`);
    assert.ok(end('ROOM')! > body && end('WARM')! > body);
    assert.equal(end('BOILING'), null);
    assert.equal(end('BODY', true), null);
  }
});

test('AMYLASE: no equilibration, no control, “cold denatures” and a wrong optimum lose the right marks', () => {
  const seed = 5;
  const v = bioFoodVariant(seed, 'AMYLASE');
  const s = perfectAmylase(seed);
  const noEq = clone(s);
  noEq.equilibrated = false;
  // Records re-read from the new (unequilibrated) spots.
  noEq.amy = noEq.amy.map((r, i) => {
    const e = amyObservedEnd(v, noEq, i);
    return { ...r, end: e === null ? 'no end point' : String(e), rate: e === null ? '0' : (1000 / e).toFixed(1) };
  });
  assert.equal(by(bioFoodGrader.grade(noEq, seed), 'procedure').awarded, 3.5);

  const noControl = clone(s);
  noControl.tubes = noControl.tubes.slice(0, 4);
  noControl.amy = noControl.amy.slice(0, 4);
  noControl.spots = noControl.spots.filter((x) => x.tube < 4);
  noControl.tests = noControl.tests.slice(0, 1);
  noControl.table = noControl.table.slice(0, 1);
  assert.equal(by(bioFoodGrader.grade(noControl, seed), 'procedure').awarded, 3);

  // Stopping early: the ice tube has no end point yet; calling it denatured is wrong.
  const early = clone(s);
  early.spots = early.spots.filter((x) => x.t <= 240);
  early.clock = 240;
  const ice = 0;
  assert.equal(amyObservedEnd(v, early, ice), null);
  early.amy[ice] = { observation: 'the iodine turned blue-black and faded slowly', claims: ['DENATURED'], end: 'no end point', rate: '0' };
  const out = bioFoodGrader.grade(early, seed);
  assert.match(by(out, 'inferences').note, /does not denature/);
  assert.ok(by(out, 'procedure').awarded <= 4);

  const wrongOpt = clone(s);
  wrongOpt.optimum = 'ICE';
  assert.equal(by(bioFoodGrader.grade(wrongOpt, seed), 'results').awarded, 2);
  // End points not read from the spots.
  const wrongEnd = clone(s);
  wrongEnd.amy = wrongEnd.amy.map((r) => ({ ...r, end: r.end === 'no end point' ? r.end : String(Number(r.end) + 45) }));
  assert.ok(by(bioFoodGrader.grade(wrongEnd, seed), 'results').awarded < 3);
});

test('the state schema rejects garbage', () => {
  const ok = perfectFood(2);
  assert.ok(bioFoodStateSchema.safeParse(ok).success);
  assert.ok(!bioFoodStateSchema.safeParse({ ...ok, v: 2 }).success);
  assert.ok(!bioFoodStateSchema.safeParse({ ...ok, task: 'COOKING' }).success);
  assert.ok(!bioFoodStateSchema.safeParse({ ...ok, tests: [{ sample: 'Z', test: 'IODINE', steps: [], heat: 0, direct: false, at: 0 } as unknown as FoodTest] }).success);
  assert.ok(!bioFoodStateSchema.safeParse({ ...ok, tests: [{ ...ok.tests[0]!, heat: 99999 }] }).success);
  assert.ok(!bioFoodStateSchema.safeParse({ ...ok, conclusion: { P: ['VITAMIN'], Q: [], R: [] } }).success);
  assert.ok(!bioFoodStateSchema.safeParse({ ...ok, spots: Array.from({ length: 400 }, () => ({ tube: 0, t: 0 })) }).success);
  assert.ok(!bioFoodStateSchema.safeParse({ ...ok, clock: -5 }).success);
  assert.ok(!bioFoodStateSchema.safeParse({ ...ok, tubes: [{ bath: 'SAUNA', boiled: false }] }).success);
  assert.ok(!bioFoodStateSchema.safeParse('nonsense').success);
});
