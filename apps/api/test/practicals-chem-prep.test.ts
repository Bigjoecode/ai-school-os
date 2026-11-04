// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-chem-prep.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHEM_PREP,
  PREP_PRACTICAL_TASKS,
  PREP_TASKS,
  amRun,
  chemPrepStateSchema,
  chemPrepVariant,
  dsRun,
  emptyChemPrepState,
  fescnEq,
  hlResult,
  prepModelEvents,
  prepModelState,
  prepTubes,
  rubricTotal,
  stdAtMark,
  stdRun,
  type ChemPrepState,
  type PrepEvent,
  type PrepTask,
} from '@aischool/shared';
import { chemPrepGrader } from '../src/practicals/graders/chem-prep';
import { GRADERS } from '../src/practicals/graders';

type Out = ReturnType<typeof chemPrepGrader.grade>;
const by = (out: Out, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: Out) => out.auto.reduce((t, c) => t + c.awarded, 0);
const AUTO_MAX = CHEM_PREP.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const grade = (s: ChemPrepState, seed: number) => chemPrepGrader.grade(s, seed);
function perfect(seed: number, task: PrepTask): ChemPrepState {
  const s = prepModelState(chemPrepVariant(seed, task));
  s.written = { precautions: 'The meniscus was read at eye level and the rinsings were transferred.', explain: 'It shifts to oppose the change.' };
  return s;
}
const swap = (s: ChemPrepState, from: (e: PrepEvent) => boolean, to: Partial<PrepEvent>) => {
  s.events = s.events.map((e) => (from(e) ? { ...e, ...to } : e));
  return s;
};

test('the rubric is 20 marks, registered, every lesson mapped, and the variant is fixed by the seed', () => {
  assert.equal(rubricTotal(CHEM_PREP.rubric), 20);
  assert.equal(GRADERS['chem-prep'], chemPrepGrader);
  assert.deepEqual(Object.values(PREP_PRACTICAL_TASKS).sort(), [...PREP_TASKS].sort());
  for (const t of PREP_TASKS) assert.equal(JSON.stringify(chemPrepVariant(99, t)), JSON.stringify(chemPrepVariant(99, t)));
  const masses = new Set(Array.from({ length: 30 }, (_, i) => chemPrepVariant(i + 1, 'DISTIL').ds.dish));
  assert.ok(masses.size >= 20, 'readings differ per attempt');
});

for (const task of PREP_TASKS)
  test(`${task}: the model answer gets full auto marks across 40 seeds`, () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = perfect(seed, task);
      const out = grade(s, seed);
      assert.equal(autoTotal(out), AUTO_MAX, `seed ${seed}: ${JSON.stringify(out.auto.filter((c) => c.awarded < c.max))}`);
      assert.equal(out.ai.length, 2);
      assert.ok(out.solution.length >= 3);
      assert.ok(chemPrepStateSchema.safeParse(s).success, JSON.stringify(chemPrepStateSchema.safeParse(s).error?.issues?.slice(0, 2)));
    }
  });

test('chemistry: by difference, Le Chatelier shifts, halogen order, distillation at 100 °C, ammonia fills the jar', () => {
  const v = chemPrepVariant(3, 'STANDARD');
  const r = stdRun(v, prepModelEvents(v));
  assert.ok(r.m1! - r.m2! >= 2.55 && r.m1! - r.m2! <= 2.75 && stdAtMark(r.f1) && stdAtMark(r.f2));
  assert.ok(Math.abs((r.f2.mol / 0.25) * 10 - r.f1.mol / 0.25) / (r.f1.mol / 0.25) < 0.01, 'diluted ten times');
  const base = { stock: 'DILUTE' as const, temp: 'ROOM' as const, sec: 0 };
  const ctl = fescnEq({ ...base, adds: [] }).I;
  assert.ok(fescnEq({ ...base, adds: ['FECL3'] }).I > ctl + 0.1);
  assert.ok(fescnEq({ ...base, adds: ['NH4CL'] }).I < ctl - 0.05);
  assert.ok(fescnEq({ ...base, adds: [], temp: 'HOT', sec: 60 }).I < ctl - 0.05);
  assert.ok(fescnEq({ ...base, adds: [], temp: 'ICE', sec: 60 }).I > ctl + 0.05);
  const t = (sys: 'KBR' | 'KCL' | 'KI', hal: 'CL2' | 'BR2' | 'I2') => hlResult({ sys, stock: '', adds: [hal], temp: 'ROOM', sec: 0, shaken: true, hexShaken: true, hal });
  assert.ok(t('KBR', 'CL2').react && t('KI', 'BR2').react && !t('KCL', 'BR2').react && !t('KBR', 'I2').react);
  const d = chemPrepVariant(4, 'DISTIL');
  const dr = dsRun(d, prepModelEvents(d));
  assert.ok(dr.distT! >= 99 && dr.distT! <= 100.5 && dr.distillate >= 5);
  const a = chemPrepVariant(4, 'AMMONIA');
  assert.ok(amRun(a, prepModelEvents(a)).jar >= 0.8);
});

test('STANDARD mistakes: no rinsing, overshooting, mouth pipetting, dissolving in the flask, wrong sums', () => {
  const seed = 7;
  const noRinse = perfect(seed, 'STANDARD');
  noRinse.events = noRinse.events.filter((e) => e.a !== 'RINSE');
  assert.equal(by(grade(noRinse, seed), 'procedure').awarded, 4);
  const over = perfect(seed, 'STANDARD');
  const i = over.events.findIndex((e) => e.a === 'EYE');
  over.events.splice(i, 0, { a: 'DROP', n: 5, x: '' });
  assert.ok(by(grade(over, seed), 'procedure').awarded <= 4);
  const mouth = swap(perfect(seed, 'STANDARD'), (e) => e.a === 'PIPETTE', { x: 'MOUTH' });
  assert.equal(by(grade(mouth, seed), 'procedure').awarded, 4.5);
  const flask = swap(perfect(seed, 'STANDARD'), (e) => e.a === 'TIP', { x: 'FLASK' });
  assert.ok(by(grade(flask, seed), 'procedure').awarded <= 3.5);
  const sums = perfect(seed, 'STANDARD');
  sums.readings.c2 = sums.readings.c1!;
  sums.readings.mneed = '2.5';
  assert.equal(by(grade(sums, seed), 'calculation').awarded, 2);
});

test('LECHAT mistakes: a concentrated stock hides the changes; no control; wrong inference', () => {
  const seed = 9;
  const conc = swap(perfect(seed, 'LECHAT'), (e) => e.a === 'STOCK', { x: 'CONC' });
  const out = grade(conc, seed);
  assert.ok(by(out, 'procedure').awarded <= 4);
  assert.ok(by(out, 'readings').awarded < 3 && by(out, 'deductions').awarded < 2.5);
  const wrong = perfect(seed, 'LECHAT');
  wrong.records.t1 = { ...wrong.records.t1!, claims: ['LEFT'] };
  assert.ok(by(grade(wrong, seed), 'deductions').awarded < 3);
  const noObs = perfect(seed, 'LECHAT');
  for (const k of Object.keys(noObs.records)) noObs.records[k] = { ...noObs.records[k]!, observation: 'it changed' };
  assert.equal(by(grade(noObs, seed), 'readings').awarded, 0);
});

test('DISTIL mistakes: thermometer in the liquid, water in at the top, no granules, spitting, weighed hot', () => {
  const seed = 11;
  const liquid = swap(perfect(seed, 'DISTIL'), (e) => e.a === 'THERMO', { x: 'LIQUID' });
  const out = grade(liquid, seed);
  assert.equal(by(out, 'procedure').awarded, 4.5);
  const top = swap(perfect(seed, 'DISTIL'), (e) => e.a === 'CONDENSER', { x: 'TOP' });
  assert.equal(by(grade(top, seed), 'procedure').awarded, 4.5);
  const chips = perfect(seed, 'DISTIL');
  chips.events = chips.events.filter((e) => e.a !== 'CHIPS');
  assert.equal(by(grade(chips, seed), 'procedure').awarded, 4.5);
  const spit = swap(perfect(seed, 'DISTIL'), (e) => e.a === 'BATH_DISH', { a: 'HEAT_DISH' });
  const so = grade(spit, seed);
  assert.ok(by(so, 'procedure').awarded <= 4 && by(so, 'calculation').awarded <= 3);
  const hot = perfect(seed, 'DISTIL');
  hot.events = hot.events.filter((e) => e.a !== 'COOL');
  assert.ok(by(grade(hot, seed), 'procedure').awarded <= 4.5);
});

test('HALOGEN and AMMONIA mistakes', () => {
  const seed = 13;
  const old = swap(perfect(seed, 'HALOGEN'), (e) => e.a === 'ADD' && e.x === 'CL2', { x: 'CL2OLD' });
  assert.ok(by(grade(old, seed), 'procedure').awarded <= 4.5);
  const order = perfect(seed, 'HALOGEN');
  order.choices['hl-order'] = [1];
  assert.equal(by(grade(order, seed), 'calculation').awarded, 3);
  const noHex = perfect(seed, 'HALOGEN');
  noHex.events = noHex.events.filter((e) => !(e.a === 'ADD' && e.x === 'HEXANE'));
  assert.ok(by(grade(noHex, seed), 'procedure').awarded <= 3);
  const up = swap(perfect(seed, 'AMMONIA'), (e) => e.a === 'CLAMP', { x: 'UP' });
  assert.ok(by(grade(up, seed), 'procedure').awarded <= 3.5);
  const acid = swap(perfect(seed, 'AMMONIA'), (e) => e.a === 'DRYER', { x: 'H2SO4' });
  const ao = grade(acid, seed);
  assert.ok(by(ao, 'procedure').awarded <= 3 && by(ao, 'readings').awarded < 4);
  const water = swap(perfect(seed, 'AMMONIA'), (e) => e.a === 'COLLECT', { x: 'WATER' });
  assert.ok(by(grade(water, seed), 'procedure').awarded <= 3);
});

test('empty attempts score nothing and the schema rejects garbage', () => {
  for (const task of PREP_TASKS) {
    const s = { ...emptyChemPrepState(), task };
    assert.equal(autoTotal(grade(s, 5)), 0, task);
    assert.ok(chemPrepStateSchema.safeParse(s).success);
  }
  const bad = clone(perfect(3, 'HALOGEN'));
  assert.equal(chemPrepStateSchema.safeParse({ ...bad, events: [{ a: 'EXPLODE', n: 0, x: '' }] }).success, false);
  assert.equal(chemPrepStateSchema.safeParse({ ...bad, events: [{ a: 'HEAT', n: 99999, x: '' }] }).success, false);
  assert.equal(chemPrepStateSchema.safeParse({ ...bad, records: { 'bad key!': { observation: '', claims: [] } } }).success, false);
  assert.equal(chemPrepStateSchema.safeParse({ ...bad, records: { t0: { observation: '', claims: ['MAGIC'] } } }).success, false);
  assert.equal(chemPrepStateSchema.safeParse({ ...bad, readings: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, '1'])) }).success, false);
  assert.equal(chemPrepStateSchema.safeParse({ ...bad, task: 'SOAP' }).success, false);
  assert.equal(chemPrepStateSchema.safeParse({ ...bad, v: 2 }).success, false);
  assert.ok(prepTubes('HALOGEN', bad.events).length >= 8);
});
