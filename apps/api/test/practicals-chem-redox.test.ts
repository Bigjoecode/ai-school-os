// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-chem-redox.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHEM_REDOX,
  REDOX_MENISCUS,
  REDOX_TASKS,
  SIMULATOR_STATE_SCHEMAS,
  chemRedoxAnswers,
  chemRedoxStateSchema,
  chemRedoxVariant,
  emptyChemRedoxState,
  redoxChain,
  redoxEndpoint,
  redoxFillLevel,
  redoxLessonTask,
  redoxReading,
  redoxTrueEnd,
  rubricTotal,
  type ChemRedoxState,
  type RedoxRun,
  type RedoxTask,
} from '@aischool/shared';
import { chemRedoxGrader } from '../src/practicals/graders/chem-redox';
import { GRADERS } from '../src/practicals/graders';

const AUTO_MAX = CHEM_REDOX.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
const by = (out: ReturnType<typeof chemRedoxGrader.grade>, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: ReturnType<typeof chemRedoxGrader.grade>) => out.auto.reduce((t, c) => t + c.awarded, 0);
const why = (out: ReturnType<typeof chemRedoxGrader.grade>) => out.auto.filter((c) => c.awarded < c.max).map((c) => `${c.id} ${c.awarded}/${c.max}: ${c.note}`).join(' | ');

interface Opts {
  offsets?: number[];
  run?: (r: RedoxRun, i: number) => void;
}
/** A model student's lab: rinsed right, the task's technique, rough then two accurate titrations stopped at the end point, readings and answers exact. */
function perfect(seed: number, task: RedoxTask, opts: Opts = {}): ChemRedoxState {
  const v = chemRedoxVariant(seed, task);
  const s = emptyChemRedoxState();
  s.task = task;
  s.setup = { burette: 'A', pipette: 'B', flask: 'WATER' };
  const offsets = [0.3, ...(opts.offsets ?? [0, 0])];
  offsets.forEach((extra, i) => {
    const run: RedoxRun = {
      kind: i === 0 ? 'ROUGH' : 'ACCURATE',
      acid: task === 'IOD' ? null : 'H2SO4',
      indicators: task === 'IOD' ? ['STARCH'] : [],
      starchAt: null,
      warm: task === 'OX' ? 67 : null,
      startTemp: task === 'OX' ? 64 : null,
      initial: null,
      final: null,
      swirls: 14,
      funnelRemoved: true,
      done: true,
    };
    if (task === 'IOD') run.starchAt = Math.round(redoxTrueEnd(v, i, run) * 0.9 * 100) / 100;
    opts.run?.(run, i);
    const initial = redoxFillLevel(seed, i);
    const final = Math.round((initial + redoxEndpoint(v, i, run) + extra) * 100) / 100;
    run.initial = initial;
    run.final = final;
    s.runs.push(run);
    const ri = redoxReading(v, initial);
    const rf = redoxReading(v, final);
    s.table.push({ initial: ri.toFixed(2), final: rf.toFixed(2), titre: (Number(rf.toFixed(2)) - Number(ri.toFixed(2))).toFixed(2) });
  });
  s.fills = offsets.length;
  const titres = s.table.slice(1).map((r) => Number(r.titre));
  const meanTitre = titres.reduce((a, b) => a + b, 0) / titres.length;
  const c = redoxChain(v, meanTitre);
  s.answers = {
    meanTitre: { value: meanTitre.toFixed(2), unit: 'cm³' },
    molesKnown: { value: c.known.toPrecision(3), unit: 'mol' },
    molesUnknown: { value: c.unknown.toPrecision(3), unit: 'moles' },
    conc: { value: c.conc.toPrecision(3), unit: 'mol dm⁻³' },
    massConc: { value: c.massConc.toPrecision(3), unit: 'g dm-3' },
  };
  s.written = { endpoint: task === 'IOD' ? 'blue-black to colourless' : 'colourless to pale pink', explain: 'x', precautions: 'I read the meniscus at eye level and swirled the flask.' };
  return s;
}

test('rubric, registration, lesson tasks and seeded variants', () => {
  assert.equal(rubricTotal(CHEM_REDOX.rubric), 26);
  assert.ok(GRADERS['chem-redox']);
  assert.ok(SIMULATOR_STATE_SCHEMAS['chem-redox']);
  assert.equal(redoxLessonTask('pr-chem-redox-permanganate-iron'), 'FE');
  assert.equal(redoxLessonTask('pr-chem-redox-permanganate-oxalate'), 'OX');
  assert.equal(redoxLessonTask('pr-chem-iodine-thiosulphate'), 'IOD');
  for (const task of REDOX_TASKS) {
    assert.deepEqual(chemRedoxVariant(4242, task), chemRedoxVariant(4242, task));
    assert.notEqual(chemRedoxVariant(1, task).trueTitre, chemRedoxVariant(2, task).trueTitre);
    for (let s = 1; s <= 200; s++) {
      const v = chemRedoxVariant(s, task);
      assert.ok(v.trueTitre > 15 && v.trueTitre < 30, `${task} ${s} titre ${v.trueTitre}`);
      assert.ok(v.drop >= 0.04 && v.drop <= 0.05);
    }
  }
  // The lessons' worked examples: the same maths.
  const fe = chemRedoxVariant(7, 'FE');
  const a = chemRedoxAnswers(fe);
  assert.ok(Math.abs(a.molesUnknown - a.molesKnown * 5) < 1e-12);
  assert.ok(Math.abs(a.conc - (a.molesUnknown * 1000) / 25) < 1e-12);
  assert.ok(Math.abs(a.massConc - a.conc * 278) < 1e-9);
  const ox = chemRedoxAnswers(chemRedoxVariant(7, 'OX'));
  assert.ok(Math.abs(ox.molesUnknown - (ox.molesKnown * 2) / 5) < 1e-12);
  const iod = chemRedoxAnswers(chemRedoxVariant(7, 'IOD'));
  assert.ok(Math.abs(iod.molesUnknown - iod.molesKnown / 2) < 1e-12);
  // Lesson example: 0.0200 KMnO₄, 24.50 cm³ → 0.0980 mol dm⁻³ Fe²⁺, 27.2 g dm⁻³.
  const ex = redoxChain({ ...fe, A: { ...fe.A, given: 0.02 } }, 24.5);
  assert.equal(ex.conc.toPrecision(3), '0.0980');
  assert.equal(ex.massConc.toPrecision(3), '27.2');
});

test('an ideal lab earns every AUTO mark, every task, 40 seeds each', () => {
  for (const task of REDOX_TASKS)
    for (let seed = 1; seed <= 40; seed++) {
      const state = perfect(seed * 7919, task);
      assert.ok(chemRedoxStateSchema.safeParse(state).success);
      const out = chemRedoxGrader.grade(state, seed * 7919);
      assert.equal(autoTotal(out), AUTO_MAX, `${task} seed ${seed * 7919}: ${why(out)}`);
      assert.equal(out.ai.length, 3);
      assert.ok(out.solution.length >= 5);
    }
});

test('KMnO₄: reading the bottom of the meniscus loses the reading marks, titres unchanged', () => {
  const seed = 101;
  const v = chemRedoxVariant(seed, 'FE');
  const s = perfect(seed, 'FE');
  s.table = s.runs.map((r) => ({ initial: r.initial!.toFixed(2), final: r.final!.toFixed(2), titre: (r.final! - r.initial!).toFixed(2) }));
  const out = chemRedoxGrader.grade(s, seed);
  assert.equal(by(out, 'readings').awarded, 4, by(out, 'readings').note);
  assert.match(by(out, 'readings').note, /top of the meniscus|top of it/i);
  assert.equal(by(out, 'calculations').awarded, 6);
  assert.ok(REDOX_MENISCUS > READING_TOL_TEST && v.dark);
  // Thiosulphate is colourless: the bottom of the meniscus is right.
  assert.equal(chemRedoxVariant(seed, 'IOD').dark, false);
});
const READING_TOL_TEST = 0.05;

test('FE: HCl or no acid, and adding an indicator, are marked mistakes that change the titre', () => {
  const seed = 202;
  const hcl = perfect(seed, 'FE', { run: (r) => (r.acid = 'HCL') });
  const o = chemRedoxGrader.grade(hcl, seed);
  assert.equal(by(o, 'technique').awarded, 1);
  assert.match(by(o, 'technique').note, /HCl/);
  // The titre followed the chemistry: about 4 % high, so the end-point accuracy mark goes.
  assert.equal(by(o, 'readings').awarded, 5);
  assert.match(by(o, 'readings').note, /HCl is oxidised/);
  const none = perfect(seed, 'FE', { run: (r) => (r.acid = null) });
  assert.match(by(chemRedoxGrader.grade(none, seed), 'technique').note, /MnO₂/);
  const ind = perfect(seed, 'FE', { run: (r) => (r.indicators = ['PHENOLPHTHALEIN']) });
  const oi = chemRedoxGrader.grade(ind, seed);
  assert.equal(by(oi, 'technique').awarded, 1);
  assert.match(by(oi, 'technique').note, /self-indicating/);
});

test('OX: a cold or boiled portion loses the warming mark', () => {
  const seed = 303;
  const cold = perfect(seed, 'OX', { run: (r, i) => i === 2 && ((r.warm = null), (r.startTemp = 28)) });
  const o = chemRedoxGrader.grade(cold, seed);
  assert.equal(by(o, 'technique').awarded, 1);
  assert.match(by(o, 'technique').note, /60–70 °C/);
  const boiled = perfect(seed, 'OX', { run: (r) => ((r.warm = 96), (r.startTemp = 90)) });
  const b = chemRedoxGrader.grade(boiled, seed);
  assert.equal(by(b, 'technique').awarded, 1);
  assert.match(by(b, 'technique').note, /decomposes/);
  assert.equal(by(b, 'readings').awarded, 5); // the decomposed acid needs less KMnO₄
});

test('IOD: starch too early, or never, are marked; pale yellow is not the end point', () => {
  const seed = 404;
  const early = perfect(seed, 'IOD', { run: (r) => (r.starchAt = 2) });
  const o = chemRedoxGrader.grade(early, seed);
  assert.equal(by(o, 'technique').awarded, 1);
  assert.match(by(o, 'technique').note, /too early/);
  // The blue lingered past the true end point: the titres are about 0.3 cm³ high.
  assert.equal(by(o, 'readings').awarded, 5);
  const none = perfect(seed, 'IOD', { run: (r) => ((r.starchAt = null), (r.indicators = [])) });
  assert.equal(by(chemRedoxGrader.grade(none, seed), 'technique').awarded, 0);
  // Stopping at pale straw (0.4 cm³ short) in every accurate run.
  const short = perfect(seed, 'IOD', { offsets: [-0.4, -0.4] });
  const sh = chemRedoxGrader.grade(short, seed);
  assert.match(by(sh, 'procedure').note, /blue-black/);
  assert.equal(by(sh, 'readings').awarded, 5);
});

test('mole-ratio slip, carried-forward errors and units', () => {
  for (const task of REDOX_TASKS) {
    const seed = 505;
    const v = chemRedoxVariant(seed, task);
    const s = perfect(seed, task);
    const k = Number(s.answers.molesKnown.value);
    s.answers.molesUnknown.value = k.toPrecision(3); // a 1 : 1 ratio
    // The rest carried forward from the wrong moles: not penalised again.
    const c = redoxChain(v, Number(s.answers.meanTitre.value), k, k);
    s.answers.conc.value = c.conc.toPrecision(3);
    s.answers.massConc.value = c.massConc.toPrecision(3);
    const out = chemRedoxGrader.grade(s, seed);
    assert.equal(by(out, 'calculations').awarded, 5, `${task}: ${by(out, 'calculations').note}`);
    assert.match(by(out, 'calculations').note, /mole ratio/);
  }
  const s = perfect(606, 'FE');
  s.answers.molesKnown.unit = 'mol dm-3';
  const o = chemRedoxGrader.grade(s, 606);
  assert.equal(by(o, 'units').awarded, 0);
  assert.equal(by(o, 'calculations').awarded, 5);
  const m = perfect(606, 'FE');
  m.answers.conc.unit = '';
  const om = chemRedoxGrader.grade(m, 606);
  assert.equal(by(om, 'units').awarded, 0);
  assert.equal(by(om, 'calculations').awarded, 6);
});

test('procedure: non-concordant, overshoot, no rough, no swirl; empty state scores nothing', () => {
  const s = perfect(707, 'FE', { offsets: [0, 0.5] });
  const out = chemRedoxGrader.grade(s, 707);
  assert.match(by(out, 'readings').note, /agree within ±0\.10/);
  assert.equal(by(out, 'procedure').awarded, 4);
  const bad = perfect(707, 'OX');
  bad.runs[0]!.kind = 'ACCURATE';
  bad.runs.forEach((r) => (r.swirls = 0));
  bad.setup = { burette: 'WATER', pipette: 'A', flask: 'B' };
  const b = chemRedoxGrader.grade(bad, 707);
  assert.equal(by(b, 'setup').awarded, 0);
  assert.ok(by(b, 'procedure').awarded <= 3);
  assert.equal(autoTotal(chemRedoxGrader.grade(emptyChemRedoxState(), 707)), 0);
});

test('the state schema rejects garbage', () => {
  assert.equal(chemRedoxStateSchema.safeParse({}).success, false);
  assert.equal(chemRedoxStateSchema.safeParse({ ...emptyChemRedoxState(), task: 'NOPE' }).success, false);
  assert.equal(chemRedoxStateSchema.safeParse({ ...emptyChemRedoxState(), burette: 999 }).success, false);
  const s = perfect(1, 'IOD');
  assert.equal(chemRedoxStateSchema.safeParse({ ...s, runs: [{ ...s.runs[0], indicators: ['LITMUS'] }] }).success, false);
  assert.equal(chemRedoxStateSchema.safeParse({ ...s, runs: [{ ...s.runs[0], startTemp: 500 }] }).success, false);
  assert.equal(chemRedoxStateSchema.safeParse({ ...s, written: { endpoint: 'x' } }).success, false);
  assert.equal(chemRedoxStateSchema.safeParse({ ...s, runs: Array(9).fill(s.runs[0]) }).success, false);
  assert.ok(chemRedoxStateSchema.safeParse(s).success);
});
