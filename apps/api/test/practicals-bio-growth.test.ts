// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-bio-growth.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BIO_GROWTH,
  GERM_TUBES,
  GROWTH_PRACTICAL_TASKS,
  TROP_N,
  bioGrowthStateSchema,
  bioGrowthVariant,
  emptyBioGrowthState,
  germCount,
  germModelState,
  germSwollen,
  respFlaskT,
  respModelState,
  rubricTotal,
  seedLength,
  seedModelState,
  seedTrueLen,
  tropCtrlAngle,
  tropDown,
  tropModelState,
  tropTestAngle,
  type BioGrowthState,
  type GermTube,
  type GrowthTask,
} from '@aischool/shared';
import { bioGrowthGrader } from '../src/practicals/graders/bio-growth';
import { GRADERS } from '../src/practicals/graders';

type Out = ReturnType<typeof bioGrowthGrader.grade>;
const by = (out: Out, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: Out) => out.auto.reduce((t, c) => t + c.awarded, 0);
const AUTO_MAX = BIO_GROWTH.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const WRITTEN = { precautions: 'Seeds of the same size; the same number in each tube.', explain: 'Water activates enzymes; oxygen for respiration.' };
const perfect: Record<GrowthTask, (seed: number) => BioGrowthState> = {
  GERM: (seed) => ({ ...germModelState(bioGrowthVariant(seed, 'GERM')), written: WRITTEN }),
  SEEDLING: (seed) => ({ ...seedModelState(bioGrowthVariant(seed, 'SEEDLING')), written: WRITTEN }),
  RESP: (seed) => ({ ...respModelState(bioGrowthVariant(seed, 'RESP')), written: WRITTEN }),
  TROPISM: (seed) => ({ ...tropModelState(bioGrowthVariant(seed, 'TROPISM')), written: WRITTEN }),
};

test('the rubric is 20 marks, registered, and the variant is the same for a seed', () => {
  assert.equal(rubricTotal(BIO_GROWTH.rubric), 20);
  assert.equal(GRADERS['bio-growth'], bioGrowthGrader);
  assert.deepEqual(GROWTH_PRACTICAL_TASKS, { 'pr-bio-germination-conditions': 'GERM', 'pr-bio-epigeal-hypogeal': 'SEEDLING', 'pr-bio-respiration-germinating-seeds': 'RESP', 'pr-bio-tropisms': 'TROPISM' });
  assert.equal(JSON.stringify(bioGrowthVariant(777, 'RESP')), JSON.stringify(bioGrowthVariant(777, 'RESP')));
  assert.notEqual(JSON.stringify(bioGrowthVariant(777, 'RESP').resp), JSON.stringify(bioGrowthVariant(778, 'RESP').resp));
});

test('germination: the control germinates (a few seeds fail), dry and oxygen-free tubes do not, the cold tube barely; swollen seeds are not germinated', () => {
  let ctrl = 0;
  let cold = 0;
  let noOil = 0;
  let failing = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const v = bioGrowthVariant(seed, 'GERM');
    const s = germModelState(v);
    const w = s.germ;
    const [a, b, c, d] = w.tubes as [GermTube, GermTube, GermTube, GermTube];
    const ca = germCount(v.germ, w, a, 0, 5);
    ctrl += ca;
    if (ca < 10) failing++;
    assert.ok(ca >= 5, `seed ${seed}: control ${ca}`);
    assert.equal(germCount(v.germ, w, b, 1, 7), 0, 'dry');
    assert.equal(germCount(v.germ, w, c, 2, 7), 0, 'boiled water and oil');
    assert.ok(germCount(v.germ, w, d, 3, 5) <= 4, 'cold');
    cold += germCount(v.germ, w, d, 3, 5);
    // Counts never go down.
    for (let day = 1; day < 7; day++) assert.ok(germCount(v.germ, w, a, 0, day + 1) >= germCount(v.germ, w, a, 0, day));
    // Seeds with water swell before the radicle shows; dry ones do not.
    assert.ok(germSwollen(v.germ, w, c, 2, 2) >= 8);
    assert.equal(germSwollen(v.germ, w, b, 1, 2), 0);
    noOil += germCount(v.germ, w, { ...c, oil: false }, 2, 7);
  }
  assert.ok(ctrl / 200 > 8 && ctrl / 200 < 9.9, `mean control ${ctrl / 200}`);
  assert.ok(failing > 40, 'some seeds fail to germinate');
  assert.ok(cold / 200 > 0.2 && cold / 200 < 1.5, `mean cold ${cold / 200}`);
  assert.ok(noOil / 200 > 1, 'without oil, oxygen dissolves back: a few germinate');
});

test('seedlings: S-shaped growth, slow when the medium dries, soaking saves a day; lesson-like lengths', () => {
  const v = bioGrowthVariant(5, 'SEEDLING').seedling;
  const g = v.grow.COWPEA;
  const L = [2, 4, 6, 8, 10].map((t) => seedLength(g, t));
  for (let i = 1; i < L.length; i++) assert.ok(L[i]! > L[i - 1]!);
  assert.ok(L[1]! - L[0]! < L[3]! - L[2]!, 'speeds up');
  assert.ok(L[3]! > 50 && L[3]! < 120, `day 8 ${L[3]}`);
  const wet = { soaked: true, waters: [0, 1, 2, 3, 4, 5, 6, 7, 8] };
  const dry = { soaked: true, waters: [0] };
  assert.ok(seedTrueLen(v, dry, 'COWPEA', 8) < seedTrueLen(v, wet, 'COWPEA', 8) * 0.5);
  assert.ok(seedTrueLen(v, { ...wet, soaked: false }, 'MAIZE', 6) < seedTrueLen(v, wet, 'MAIZE', 6));
});

test('respiration: flask A warms about 1.5–2.2 °C a day, B stays at room temperature; undisinfected or bunged flasks go wrong', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const v = bioGrowthVariant(seed, 'RESP');
    const w = respModelState(v).resp;
    const rise = respFlaskT(v.resp, w, w.A, 72) - respFlaskT(v.resp, w, w.A, 0);
    assert.ok(rise > 4 && rise < 7.2, `seed ${seed}: rise ${rise}`);
    assert.ok(Math.abs(respFlaskT(v.resp, w, w.B, 72) - respFlaskT(v.resp, w, w.B, 0)) < 0.4);
    assert.ok(respFlaskT(v.resp, { ...w, disBoiled: false }, w.B, 72) - respFlaskT(v.resp, w, w.B, 72) > 1, 'microbes warm B');
    assert.ok(respFlaskT(v.resp, w, { ...w.A, plug: 'BUNG' }, 72) < respFlaskT(v.resp, w, w.A, 72) - 1.5, 'oxygen runs out');
  }
});

test('tropisms: the boxed shoot bends towards the slit, the control stays straight; most radicles turn down', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const v = bioGrowthVariant(seed, 'TROPISM');
    const w = tropModelState(v).trop;
    const a1 = tropTestAngle(v.trop, w, 1);
    const a3 = tropTestAngle(v.trop, w, 3);
    assert.ok(a1 > 4 && a1 < 22 && a3 > 28 && a3 < 55, `seed ${seed}: ${a1}, ${a3}`);
    assert.ok(tropCtrlAngle(v.trop, w, 3) < 4);
    assert.ok(tropCtrlAngle(v.trop, { ...w, klinoOn: false }, 3) > 15, 'a stopped clinostat bends the control');
    assert.ok(tropTestAngle(v.trop, { ...w, taped: false }, 3) < a3 * 0.7, 'light leaks');
    const d = tropDown(v.trop, w, 3);
    assert.ok(d >= TROP_N - 2 && d <= TROP_N);
  }
});

test('a model answer earns every AUTO mark in each task over 40 seeds', () => {
  for (const task of ['GERM', 'SEEDLING', 'RESP', 'TROPISM'] as GrowthTask[])
    for (let seed = 1; seed <= 40; seed++) {
      const s = perfect[task](seed * 7919);
      assert.ok(bioGrowthStateSchema.safeParse(s).success, `${task} schema`);
      const out = bioGrowthGrader.grade(s, seed * 7919);
      assert.equal(autoTotal(out), AUTO_MAX, `${task} seed ${seed}: ${JSON.stringify(out.auto.map((c) => [c.id, c.awarded, c.notes]))}`);
      assert.equal(out.ai.length, 2);
      assert.ok(out.solution.length >= 3);
    }
});

test('germination mistakes: no oil, swollen counts, unequal seeds, early count, wrong claims', () => {
  const seed = 4242;
  const v = bioGrowthVariant(seed, 'GERM');
  const ok = perfect.GERM(seed);
  const noOil = clone(ok);
  noOil.germ.tubes[2]!.oil = false;
  assert.ok(by(bioGrowthGrader.grade(noOil, seed), 'procedure').awarded <= 3.5);
  const swollen = clone(ok);
  swollen.germ.rows[2]!.c[3] = '10';
  swollen.germ.rows[2]!.c[4] = '10';
  assert.ok(by(bioGrowthGrader.grade(swollen, seed), 'readings').awarded < 4);
  const unequal = clone(ok);
  unequal.germ.tubes[1]!.seeds = 7;
  unequal.germ.batch = 'MIXED';
  assert.equal(by(bioGrowthGrader.grade(unequal, seed), 'procedure').awarded, 3);
  const early = clone(ok);
  early.germ.looks = [1, 2];
  assert.ok(by(bioGrowthGrader.grade(early, seed), 'procedure').awarded <= 3.5);
  const claims = clone(ok);
  claims.germ.claims = [...claims.germ.claims.filter((c) => c !== 'OIL'), 'LIGHT', 'SWOLLEN'];
  assert.equal(by(bioGrowthGrader.grade(claims, seed), 'results').awarded, 3);
  const pct = clone(ok);
  pct.germ.rows[0]!.pct = String(Number(pct.germ.rows[0]!.germ) * 1);
  if (pct.germ.rows[0]!.germ !== '10') assert.ok(by(bioGrowthGrader.grade(pct, seed), 'presentation').awarded < 3);
  assert.equal(GERM_TUBES.length, v.germ ? 4 : 0);
});

test('seedling mistakes: not watered, mixed reference points, wrong table, wrong rate', () => {
  const seed = 99;
  const ok = perfect.SEEDLING(seed);
  const dry = clone(ok);
  dry.seedling.waters = [0, 1, 2];
  assert.ok(by(bioGrowthGrader.grade(dry, seed), 'procedure').awarded <= 3);
  const refs = clone(ok);
  refs.seedling.measures[3]!.ref = 'SOIL';
  assert.ok(by(bioGrowthGrader.grade(refs, seed), 'procedure').awarded <= 3);
  const table = clone(ok);
  table.seedling.table.MAIZE = { type: 'EPIGEAL', cot: 'ABOVE', part: 'HYPOCOTYL' };
  table.seedling.claims = [...table.seedling.claims, 'MAIZE_EPI'];
  assert.equal(by(bioGrowthGrader.grade(table, seed), 'results').awarded, 3);
  const rate = clone(ok);
  rate.seedling.rateCow = String(Number(rate.seedling.rateCow) + 3);
  rate.seedling.first = 'PLUMULE';
  assert.equal(by(bioGrowthGrader.grade(rate, seed), 'results').awarded, 4.5);
  assert.equal(by(bioGrowthGrader.grade(rate, seed), 'readings').awarded, 3);
});

test('respiration mistakes: no disinfectant, bung, not inverted, misread thermometers, sun claim', () => {
  const seed = 31337;
  const ok = perfect.RESP(seed);
  const bad = clone(ok);
  Object.assign(bad.resp, { disBoiled: false });
  bad.resp.A.plug = 'BUNG';
  bad.resp.B.inverted = false;
  assert.equal(by(bioGrowthGrader.grade(bad, seed), 'procedure').awarded, 2.5);
  const misread = clone(ok);
  misread.resp.rows[1]!.a = String(Number(misread.resp.rows[1]!.a) + 1);
  misread.resp.rows[2]!.b = String(Number(misread.resp.rows[2]!.b) - 0.5);
  assert.ok(by(bioGrowthGrader.grade(misread, seed), 'readings').awarded < 4);
  const sun = clone(ok);
  sun.resp.claims = ['HEAT', 'CO2', 'SUN'];
  sun.resp.eq = 'PHOTO';
  assert.equal(by(bioGrowthGrader.grade(sun, seed), 'results').awarded, 1.5);
});

test('tropism mistakes: unsealed box, stopped clinostat, wrong count, auxin on the lit side', () => {
  const seed = 2024;
  const ok = perfect.TROPISM(seed);
  const bad = clone(ok);
  bad.trop.taped = false;
  bad.trop.klinoOn = false;
  const out = bioGrowthGrader.grade(bad, seed);
  assert.equal(by(out, 'procedure').awarded, 1.5);
  const count = clone(ok);
  count.trop.down = String(TROP_N + 1);
  count.trop.claims = [...count.trop.claims.filter((c) => c !== 'AUXIN'), 'AUXIN_LIT'];
  assert.equal(by(bioGrowthGrader.grade(count, seed), 'readings').awarded, 3);
  assert.equal(by(bioGrowthGrader.grade(count, seed), 'results').awarded, 3.5);
});

test('an empty attempt earns little, and the schema rejects garbage', () => {
  for (const task of ['GERM', 'SEEDLING', 'RESP', 'TROPISM'] as GrowthTask[]) {
    const s = { ...emptyBioGrowthState(), task };
    assert.ok(bioGrowthStateSchema.safeParse(s).success);
    assert.ok(autoTotal(bioGrowthGrader.grade(s, 5)) <= 2, `${task} empty: ${autoTotal(bioGrowthGrader.grade(s, 5))}`);
  }
  const s = emptyBioGrowthState();
  assert.equal(bioGrowthStateSchema.safeParse({ ...s, task: 'NOPE' }).success, false);
  assert.equal(bioGrowthStateSchema.safeParse({ ...s, germ: { ...s.germ, tubes: [] } }).success, false);
  assert.equal(bioGrowthStateSchema.safeParse({ ...s, resp: { ...s.resp, clock: 500 } }).success, false);
  assert.equal(bioGrowthStateSchema.safeParse({ ...s, trop: { ...s.trop, measures: [{ day: 9, pot: 'TEST' }] } }).success, false);
  assert.equal(bioGrowthStateSchema.safeParse({ ...s, seedling: { ...s.seedling, labels: Array(20).fill('x') } }).success, false);
  assert.equal(bioGrowthStateSchema.safeParse({ ...s, v: 2 }).success, false);
});
