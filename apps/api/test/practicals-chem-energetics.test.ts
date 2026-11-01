// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-chem-energetics.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHEM_ENERGETICS,
  EN_C,
  EN_MAX_T,
  ENERGETICS_TASKS,
  SIMULATOR_STATE_SCHEMAS,
  chemEnergeticsAnswers,
  chemEnergeticsStateSchema,
  chemEnergeticsVariant,
  emptyChemEnergeticsState,
  enDissolved,
  enExtreme,
  enIdealRun,
  energeticsLessonTask,
  rubricTotal,
  solyAppearTemp,
  solyAppearTime,
  solyCool,
  solyFromPoints,
  solySolubility,
  type ChemEnergeticsState,
  type EnRun,
  type EnergeticsTask,
  type SolyRun,
} from '@aischool/shared';
import { chemEnergeticsGrader, energeticsUnit } from '../src/practicals/graders/chem-energetics';
import { GRADERS } from '../src/practicals/graders';

const AUTO_MAX = CHEM_ENERGETICS.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
type Out = ReturnType<typeof chemEnergeticsGrader.grade>;
const by = (out: Out, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: Out) => out.auto.reduce((t, c) => t + c.awarded, 0);
const why = (out: Out) => out.auto.filter((c) => c.awarded < c.max).map((c) => `${c.id} ${c.awarded}/${c.max}: ${c.note}`).join(' | ');
const f1 = (x: number) => x.toFixed(1);

interface CupOpts {
  run?: (r: EnRun) => void;
  /** Override what the student wrote as the extreme (default: what the thermometer showed). */
  naoh?: boolean;
}
/** A model student's cup lab: polystyrene cup in a beaker, the card's quantities, stirred and covered at once, watched past the turn, readings and answers exact. */
function perfectCup(seed: number, task: 'NEUT' | 'SOLN', opts: CupOpts = {}): ChemEnergeticsState {
  const v = chemEnergeticsVariant(seed, task);
  const s = emptyChemEnergeticsState();
  s.task = task;
  s.setup = { vessel: 'CUP', support: true };
  const kinds = task === 'NEUT' ? (['NEUT'] as const) : opts.naoh === false ? (['SALT'] as const) : (['SALT', 'NAOH'] as const);
  kinds.forEach((kind, i) => {
    const ideal = enIdealRun(kind, i);
    const run: EnRun = { kind, vessel: 'CUP', supported: true, volA: ideal.volA, volB: ideal.volB, solid: ideal.solid, readA: true, readB: task === 'NEUT', mixed: true, stirAt: 0.5, lidAt: 3, elapsed: 240, done: true };
    if (i === 0) opts.run?.(run);
    s.runs.push(run);
    const ex = enExtreme(v, { kind, n: i, vessel: run.vessel, volA: run.volA, volB: run.volB, solid: run.solid, stirAt: run.stirAt, lidAt: run.lidAt }, run.elapsed ?? EN_MAX_T);
    if (task === 'NEUT') {
      const a = f1(v.tA);
      const b = f1(v.tB);
      const initial = f1((Number(a) + Number(b)) / 2);
      const extreme = f1(ex.value);
      s.table.push({ a, b, initial, extreme, dT: f1(Number(extreme) - Number(initial)) });
    } else {
      const a = f1(v.tW);
      const extreme = f1(ex.value);
      s.table.push({ a, b: '', initial: '', extreme, dT: f1(Math.abs(Number(extreme) - Number(a))) });
    }
  });
  const dT = Number(s.table[0]!.dT);
  const q = (task === 'NEUT' ? 100 : 50) * EN_C * dT;
  s.answers.q = { value: q.toFixed(0), unit: 'J' };
  s.answers.n = { value: '0.0500', unit: 'mol' };
  s.answers.dH = { value: ((task === 'NEUT' ? -1 : 1) * (q / 0.05 / 1000)).toFixed(1), unit: 'kJ mol⁻¹' };
  s.nature = task === 'NEUT' ? { main: 'EXO', other: null } : { main: 'ENDO', other: 'EXO' };
  s.written = { explanation: 'x', precautions: 'A polystyrene cup with a lid; stirred.' };
  return s;
}

interface SolyOpts {
  waters?: number[];
  run?: (r: SolyRun, i: number) => void;
}
/** A model student's solubility lab: 4.0 g, 5.0 cm³ then +1.0 cm³, water bath, dissolved, stirred, the temperature as the first crystals appear. */
function perfectSoly(seed: number, opts: SolyOpts = {}): ChemEnergeticsState {
  const v = chemEnergeticsVariant(seed, 'SOLY');
  const s = emptyChemEnergeticsState();
  s.task = 'SOLY';
  s.soly.mass = 4.0;
  const waters = opts.waters ?? [5, 6, 7, 8];
  waters.forEach((water, i) => {
    const run: SolyRun = { water, lost: 0.02 * (i + 1), heat: 'BATH', dissolved: true, stirred: true, seen: null, delay: 1, done: true };
    opts.run?.(run, i);
    const app = solyAppearTemp(v, run.water, run.lost, run.stirred);
    const t = solyAppearTime(v, 80, app, run.stirred) + (run.delay ?? 0);
    run.seen = Math.round(solyCool(v, 80, run.stirred, t).theta * 100) / 100;
    s.soly.runs.push(run);
    s.solyTable.push({ water: water.toFixed(1), temp: f1(run.seen), sol: ((4.0 * 100) / water).toFixed(1) });
  });
  s.soly.water = waters.at(-1)!;
  s.soly.lost = 0.02 * waters.length;
  s.curve = 'SMOOTH';
  const pts = s.solyTable.map((r) => ({ x: Number(r.temp), y: Number(r.sol) }));
  const truth = chemEnergeticsAnswers(v);
  const sHi = solyFromPoints(pts, v.tHi) ?? truth.sHi;
  const sLo = solyFromPoints(pts, v.tLo) ?? truth.sLo;
  s.answers.sHi = { value: sHi.toFixed(1), unit: 'g/100 g water' };
  s.answers.sLo = { value: sLo.toFixed(1), unit: 'g per 100 g of water' };
  s.answers.mass = { value: (Number(sHi.toFixed(1)) - Number(sLo.toFixed(1))).toFixed(1), unit: 'g' };
  s.answers.molal = { value: ((Number(sLo.toFixed(1)) * 10) / 101).toFixed(2), unit: 'mol kg⁻¹' };
  s.written = { explanation: 'x', precautions: 'Stirred while cooling.' };
  return s;
}

test('rubric, registration, lesson tasks and seeded variants', () => {
  assert.equal(rubricTotal(CHEM_ENERGETICS.rubric), 22);
  assert.ok(GRADERS['chem-energetics']);
  assert.ok(SIMULATOR_STATE_SCHEMAS['chem-energetics']);
  assert.equal(energeticsLessonTask('pr-chem-heat-of-neutralisation'), 'NEUT');
  assert.equal(energeticsLessonTask('pr-chem-heat-of-solution'), 'SOLN');
  assert.equal(energeticsLessonTask('pr-chem-solubility-curve'), 'SOLY');
  for (const task of ENERGETICS_TASKS) {
    const a = chemEnergeticsVariant(11, task);
    assert.deepEqual(a, chemEnergeticsVariant(11, task));
    assert.notDeepEqual(a.tA, chemEnergeticsVariant(12, task).tA);
    assert.ok(a.room >= 24 && a.room <= 28);
  }
});

test('thermochemistry behaves like the real thing', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const v = chemEnergeticsVariant(seed, 'NEUT');
    const ideal = enIdealRun('NEUT');
    const ex = enExtreme(v, ideal);
    const rise = ex.value - ex.T0;
    // ΔH about −57 kJ: an adiabatic rise of about 6.8 K, a little less seen
    assert.ok(rise > 6.0 && rise < 6.9, `rise ${rise}`);
    const dH = chemEnergeticsAnswers(v).dH;
    assert.ok(dH < -52 && dH > -58, `ΔH ${dH}`);
    // a glass beaker and no lid: a smaller rise; heat is lost after the peak
    const glass = enExtreme(v, { ...ideal, vessel: 'BEAKER', lidAt: null });
    assert.ok(glass.value < ex.value - 0.8);
    assert.ok(enExtreme(v, ideal, ex.at + 300).value === ex.value);
    // the peak comes after the mixing (thermometer lag), within a minute
    assert.ok(ex.at > 5 && ex.at < 90, `peak at ${ex.at}`);
    const s = chemEnergeticsVariant(seed, 'SOLN');
    const salt = enIdealRun('SALT');
    const low = enExtreme(s, salt);
    assert.ok(low.T0 - low.value > 4.8 && low.T0 - low.value < 6.2, `fall ${low.T0 - low.value}`);
    // unstirred, the salt dissolves far more slowly
    assert.ok(enDissolved(s, salt, 20) > enDissolved(s, { ...salt, stirAt: null }, 20) + 0.3);
    const naoh = enExtreme(s, enIdealRun('NAOH'));
    assert.ok(naoh.value - naoh.T0 > 8.5 && naoh.value - naoh.T0 < 11.5, `NaOH rise ${naoh.value - naoh.T0}`);
  }
});

test('solubility follows real KNO₃ data; supercooling and lag', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const v = chemEnergeticsVariant(seed, 'SOLY');
    assert.ok(Math.abs(solySolubility(v, 0) - 13.3) < 0.5);
    assert.ok(Math.abs(solySolubility(v, 60) - 110) < 3.5);
    assert.ok(Math.abs(solySolubility(v, 40) - 63.9) < 2);
    const stirred = solyAppearTemp(v, 5, 0, true)!;
    const still = solyAppearTemp(v, 5, 0, false)!;
    assert.ok(still < stirred - 2);
    // 4.0 g in 5.0 cm³ (80 g per 100 g) saturates near 47–48 °C
    assert.ok(stirred > 44 && stirred < 49, `appear ${stirred}`);
    // the thermometer lags the cooling liquid: it reads a little high
    const t = solyAppearTime(v, 80, stirred, true);
    const c = solyCool(v, 80, true, t);
    assert.ok(c.theta > c.T && c.theta - c.T < 1);
    // more water: crystals at a lower temperature
    assert.ok(solyAppearTemp(v, 8, 0, true)! < stirred - 8);
  }
});

test('ideal work gets full AUTO marks for every task across 40 seeds', () => {
  for (let seed = 1; seed <= 40; seed++) {
    for (const task of ['NEUT', 'SOLN'] as const) {
      const out = chemEnergeticsGrader.grade(perfectCup(seed, task), seed);
      assert.equal(autoTotal(out), AUTO_MAX, `${task} seed ${seed}: ${why(out)}`);
      assert.equal(out.ai.length, 2);
    }
    const out = chemEnergeticsGrader.grade(perfectSoly(seed), seed);
    assert.equal(autoTotal(out), AUTO_MAX, `SOLY seed ${seed}: ${why(out)}`);
  }
});

test('neutralisation mistakes lose the right marks', () => {
  const seed = 4242;
  const v = chemEnergeticsVariant(seed, 'NEUT');
  // a glass beaker: setup −1 and the temperature change is too small
  const glass = chemEnergeticsGrader.grade(perfectCup(seed, 'NEUT', { run: (r) => (r.vessel = 'BEAKER') }), seed);
  assert.equal(by(glass, 'setup').awarded, 2);
  assert.equal(by(glass, 'readings').awarded, 4, why(glass));
  // never covered, never stirred, stopped watching too soon
  const sloppy = chemEnergeticsGrader.grade(perfectCup(seed, 'NEUT', { run: (r) => ((r.lidAt = null), (r.stirAt = null), (r.elapsed = 6)) }), seed);
  assert.equal(by(sloppy, 'procedure').awarded, 1, why(sloppy));
  // the alkali temperature never read
  const noB = chemEnergeticsGrader.grade(perfectCup(seed, 'NEUT', { run: (r) => (r.readB = false) }), seed);
  assert.equal(by(noB, 'procedure').awarded, 3);
  // 50 g instead of 100 g in Q (ΔH follows from it: carried forward), and a positive ΔH
  const s = perfectCup(seed, 'NEUT');
  const dT = Number(s.table[0]!.dT);
  s.answers.q = { value: (50 * 4.2 * dT).toFixed(0), unit: 'J' };
  s.answers.dH = { value: ((50 * 4.2 * dT) / 0.05 / 1000).toFixed(1), unit: 'kJ/mol' };
  const half = chemEnergeticsGrader.grade(s, seed);
  assert.equal(by(half, 'calculations').awarded, 2, why(half));
  // readings: the initial not the mean, a wrong highest, readings to whole degrees
  const r = perfectCup(seed, 'NEUT');
  r.table[0]!.initial = f1(v.tA);
  r.table[0]!.dT = f1(Number(r.table[0]!.extreme) - v.tA);
  if (Math.abs(v.tA - (Number(f1(v.tA)) + Number(f1(v.tB))) / 2) > 0.06) {
    const out = chemEnergeticsGrader.grade(r, seed);
    assert.equal(by(out, 'results').awarded, 2, why(out));
  }
  const w = perfectCup(seed, 'NEUT');
  w.table[0]!.extreme = (Number(w.table[0]!.extreme) - 1.5).toFixed(1);
  assert.equal(by(chemEnergeticsGrader.grade(w, seed), 'readings').awarded, 4);
  const whole = perfectCup(seed, 'NEUT');
  whole.table[0]!.a = String(Math.round(Number(whole.table[0]!.a)));
  assert.equal(by(chemEnergeticsGrader.grade(whole, seed), 'readings').awarded, 4);
  // exothermic not recognised; units missing; kJ accepted for Q
  const x = perfectCup(seed, 'NEUT');
  x.nature.main = 'ENDO';
  x.answers.n.unit = '';
  const xo = chemEnergeticsGrader.grade(x, seed);
  assert.equal(by(xo, 'results').awarded, 2);
  assert.equal(by(xo, 'units').awarded, 0);
  const k = perfectCup(seed, 'NEUT');
  k.answers.q = { value: (Number(k.answers.q.value) / 1000).toFixed(3), unit: 'kJ' };
  assert.equal(autoTotal(chemEnergeticsGrader.grade(k, seed)), AUTO_MAX);
});

test('heat of solution mistakes lose the right marks', () => {
  const seed = 777;
  // no NaOH comparison: readings −1, results −1
  const noNa = chemEnergeticsGrader.grade(perfectCup(seed, 'SOLN', { naoh: false }), seed);
  assert.equal(by(noNa, 'readings').awarded, 4, why(noNa));
  assert.equal(by(noNa, 'results').awarded, 2, why(noNa));
  // a negative ΔH for a temperature fall; Q with the mass of the solid
  const s = perfectCup(seed, 'SOLN');
  s.answers.dH.value = `-${s.answers.dH.value}`;
  assert.equal(by(chemEnergeticsGrader.grade(s, seed), 'calculations').awarded, 3);
  const m = perfectCup(seed, 'SOLN');
  m.answers.q.value = (4 * 4.2 * Number(m.table[0]!.dT)).toFixed(0);
  assert.equal(by(chemEnergeticsGrader.grade(m, seed), 'calculations').awarded, 3);
  // 8.00 g instead of 4.00 g (setup −1; the fall is doubled, so the change is not what careful technique gives)
  const big = chemEnergeticsGrader.grade(perfectCup(seed, 'SOLN', { run: (r) => (r.solid = 8) }), seed);
  assert.equal(by(big, 'setup').awarded, 2);
  assert.equal(by(big, 'readings').awarded, 4, why(big));
  // the wrong natures
  const n = perfectCup(seed, 'SOLN');
  n.nature = { main: 'EXO', other: 'ENDO' };
  assert.equal(by(chemEnergeticsGrader.grade(n, seed), 'results').awarded, 2);
});

test('solubility mistakes lose the right marks', () => {
  const seed = 31337;
  // a naked flame: setup −1
  const flame = chemEnergeticsGrader.grade(perfectSoly(seed, { run: (r) => (r.heat = 'FLAME') }), seed);
  assert.equal(by(flame, 'setup').awarded, 2);
  // not stirred while cooling: procedure −1 (crystals late and the readings off the curve)
  const still = chemEnergeticsGrader.grade(perfectSoly(seed, { run: (r) => (r.stirred = false) }), seed);
  assert.equal(by(still, 'procedure').awarded, 3, why(still));
  assert.equal(by(still, 'results').awarded, 2, why(still));
  // only three volumes: procedure −1, results (four points) −1
  const three = chemEnergeticsGrader.grade(perfectSoly(seed, { waters: [5, 6, 7] }), seed);
  assert.equal(by(three, 'procedure').awarded, 3);
  assert.ok(by(three, 'results').awarded <= 2);
  // a straight line; solubility not scaled to 100 g; slow to note the crystals
  const st = perfectSoly(seed);
  st.curve = 'STRAIGHT';
  assert.equal(by(chemEnergeticsGrader.grade(st, seed), 'results').awarded, 2);
  const sc = perfectSoly(seed);
  sc.solyTable = sc.solyTable.map((r) => ({ ...r, sol: (4 / Number(r.water)).toFixed(2) }));
  assert.equal(by(chemEnergeticsGrader.grade(sc, seed), 'readings').awarded, 4);
  const late = chemEnergeticsGrader.grade(perfectSoly(seed, { run: (r) => (r.delay = 40) }), seed);
  assert.equal(by(late, 'procedure').awarded, 3);
  // the wrong deposited mass and molality
  const c = perfectSoly(seed);
  c.answers.mass.value = '5.0';
  c.answers.molal.value = (Number(c.answers.sLo.value) / 101).toFixed(3);
  assert.equal(by(chemEnergeticsGrader.grade(c, seed), 'calculations').awarded, 2);
  // units
  const u = perfectSoly(seed);
  u.answers.sHi.unit = 'g';
  assert.equal(by(chemEnergeticsGrader.grade(u, seed), 'units').awarded, 0);
});

test('units are read in their usual forms', () => {
  assert.deepEqual(energeticsUnit('kJ mol⁻¹'), { u: 'J/mol', f: 1000 });
  assert.deepEqual(energeticsUnit('J/mol'), { u: 'J/mol', f: 1 });
  assert.deepEqual(energeticsUnit('g/100g of water'), { u: 'g/100g', f: 1 });
  assert.deepEqual(energeticsUnit('mol/kg'), { u: 'mol/kg', f: 1 });
  assert.equal(energeticsUnit('moles').u, 'mol');
  assert.equal(energeticsUnit('furlongs').u, 'other');
});

test('empty and partial attempts grade without throwing', () => {
  for (const task of ENERGETICS_TASKS as readonly EnergeticsTask[]) {
    const s = emptyChemEnergeticsState();
    s.task = task;
    const out = chemEnergeticsGrader.grade(s, 5);
    assert.equal(autoTotal(out), 0, `${task}: ${why(out)}`);
    assert.equal(out.auto.length, CHEM_ENERGETICS.rubric.filter((c) => c.how === 'AUTO').length);
  }
});

test('the state schema accepts real states and rejects garbage', () => {
  assert.ok(chemEnergeticsStateSchema.safeParse(emptyChemEnergeticsState()).success);
  assert.ok(chemEnergeticsStateSchema.safeParse(perfectCup(3, 'NEUT')).success);
  assert.ok(chemEnergeticsStateSchema.safeParse(perfectCup(3, 'SOLN')).success);
  assert.ok(chemEnergeticsStateSchema.safeParse(perfectSoly(3)).success);
  assert.ok(!chemEnergeticsStateSchema.safeParse({}).success);
  assert.ok(!chemEnergeticsStateSchema.safeParse({ ...emptyChemEnergeticsState(), task: 'BOIL' }).success);
  const bad = perfectCup(3, 'NEUT');
  (bad.runs[0] as unknown as { vessel: string }).vessel = 'BUCKET';
  assert.ok(!chemEnergeticsStateSchema.safeParse(bad).success);
  const big = emptyChemEnergeticsState();
  big.runs = Array.from({ length: 9 }, () => perfectCup(3, 'NEUT').runs[0]!);
  assert.ok(!chemEnergeticsStateSchema.safeParse(big).success);
  assert.ok(!chemEnergeticsStateSchema.safeParse({ ...emptyChemEnergeticsState(), written: { explanation: 'x'.repeat(3000), precautions: '' } }).success);
});
