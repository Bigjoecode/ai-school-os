// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-chem-electro.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CELL_E0,
  CHEM_ELECTRO,
  ELECTRO_TASKS,
  ELEC_STEPS,
  ELEC_TARGET,
  SIMULATOR_STATE_SCHEMAS,
  cellReading,
  chemElectroStateSchema,
  chemElectroVariant,
  dispFe,
  dispPeak,
  dispProduct,
  dispTemp,
  elecChain,
  elecCharge,
  elecCurrent,
  elecMasses,
  emptyChemElectroState,
  electroLessonTask,
  rubricTotal,
  rustIndex,
  woolGas,
  woolReading,
  type ChemElectroState,
  type ChemElectroVariant,
  type ElectroTask,
} from '@aischool/shared';
import { chemElectroGrader } from '../src/practicals/graders/chem-electro';
import { GRADERS } from '../src/practicals/graders';

const AUTO_MAX = CHEM_ELECTRO.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
type G = ReturnType<typeof chemElectroGrader.grade>;
const by = (out: G, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: G) => out.auto.reduce((t, c) => t + c.awarded, 0);
const why = (out: G) => out.auto.filter((c) => c.awarded < c.max).map((c) => `${c.id} ${c.awarded}/${c.max}: ${c.note}`).join(' | ');
const p3 = (x: number) => x.toPrecision(3);
const half = (x: number) => (Math.round(x * 2) / 2).toFixed(1);

/** The rheostat step that gives the current closest to 0.50 A at run time t. */
function bestStep(v: ChemElectroVariant, t: number): number {
  let best = 0;
  for (let s = 0; s <= ELEC_STEPS; s++) if (Math.abs(elecCurrent(v, s, t) - ELEC_TARGET) < Math.abs(elecCurrent(v, best, t) - ELEC_TARGET)) best = s;
  return best;
}

/** A model student's lab for each task: the lesson's procedure, readings exact, answers right. */
function perfect(seed: number, task: ElectroTask, tweak?: (s: ChemElectroState, v: ChemElectroVariant) => void): ChemElectroState {
  const v = chemElectroVariant(seed, task);
  const s = emptyChemElectroState();
  s.task = task;
  s.written = { observation: 'x', explain: 'x', precautions: 'x' };
  if (task === 'ELEC') {
    const w = s.elec;
    Object.assign(w, { sanded: true, weighedBefore: true, cathodeTo: 'NEG', gap: 'APART', connected: true, ran: 2400, removed: true, rinse: 'GENTLE', dry: 'AIR', weighedAfter: true });
    for (let t = 0; t < 2400; t += 300) w.adjust.push({ t, step: bestStep(v, t + 150) });
    w.rheo = w.adjust.at(-1)!.step;
    tweak?.(s, v);
    const m = elecMasses(v, w);
    const I = w.ran ? elecCharge(v, w) / w.ran : 0;
    s.rec.current = I.toFixed(2);
    s.rec.time = String(Math.round(w.ran));
    s.rec.cath1 = m.cath1.toFixed(2);
    s.rec.cath2 = m.cath2.toFixed(2);
    s.rec.an1 = m.an1.toFixed(2);
    s.rec.an2 = m.an2.toFixed(2);
    const c = elecChain(Number(s.rec.current), Number(s.rec.time));
    s.answers.charge = { value: String(Math.round(c.charge)), unit: 'C' };
    s.answers.molesCu = { value: p3(c.molesCu), unit: 'mol' };
    s.answers.massCalc = { value: p3(c.massCalc), unit: 'g' };
    s.answers.gain = { value: (m.cath2 - m.cath1).toFixed(2), unit: 'g' };
    s.answers.loss = { value: (m.an1 - m.an2).toFixed(2), unit: 'g' };
  } else if (task === 'CELL') {
    const w = s.cell;
    Object.assign(w, { sanded: true, placed: 'RIGHT', soaked: true, bridge: true, meter: 'HIGH', leads: 'CORRECT', removedOnce: true, replaced: true });
    const good = { bridge: true, soaked: true, sanded: true, placed: 'RIGHT' as const, meter: 'HIGH' as const, leads: 'CORRECT' as const };
    w.readings = [good, { ...good, bridge: false }, good];
    tweak?.(s, v);
    const first = w.readings.findIndex((r) => r.bridge);
    const e = first >= 0 ? cellReading(v, w.readings[first]!, first) : 0;
    s.rec.emf = e.toFixed(2);
    s.rec.emfNo = '0.00';
    s.rec.negative = 'zinc';
    s.answers.ecell = { value: '1.10', unit: 'V' };
    s.answers.pctDiff = { value: (((CELL_E0 - Math.abs(e)) / CELL_E0) * 100).toFixed(2), unit: '%' };
  } else if (task === 'DISP') {
    const w = s.disp;
    w.filings = 'CLEAN';
    while (dispFe(v, w) < 0.5) w.taps++;
    Object.assign(w, { cuso4: 50, thermo: true, added: true, stir: 'STIR', elapsed: 420, watched: true, paper: true, filtered: true, wash: 'PROPANONE', dry: 'AIR', weighed: true });
    tweak?.(s, v);
    const fe = dispFe(v, w);
    const tot = dispProduct(v, w).total;
    s.rec.fe = fe.toFixed(2);
    s.rec.t1 = half(v.disp.room);
    s.rec.t2 = half(dispPeak(v, w, w.elapsed ?? 0));
    s.rec.paper = v.disp.paper.toFixed(2);
    s.rec.paperCu = tot.toFixed(2);
    const cu = Number((tot - v.disp.paper).toFixed(2));
    s.rec.cu = cu.toFixed(2);
    s.answers.molesFe = { value: p3(fe / 56), unit: 'mol' };
    s.answers.massCu = { value: p3((fe / 56) * 63.5), unit: 'g' };
    s.answers.yield = { value: p3((cu / ((fe / 56) * 63.5)) * 100), unit: '%' };
    s.answers.dT = { value: (Number(s.rec.t2) - Number(s.rec.t1)).toFixed(1), unit: '°C' };
  } else {
    const w = s.rust;
    w.sanded = true;
    w.tubes = {
      A: { nail: true, content: 'TAP', boiled: false, oil: false, stopper: false },
      B: { nail: true, content: 'BOILED', boiled: true, oil: true, stopper: false },
      C: { nail: true, content: 'CACL2', boiled: false, oil: false, stopper: true },
      D: { nail: true, content: 'SALT', boiled: false, oil: false, stopper: false },
    };
    Object.assign(w, { wool: 'MOIST', started: true, days: 7, observed: [7], readings: [{ day: 1, levelled: true }, { day: 7, levelled: true }] });
    tweak?.(s, v);
    const last = w.readings.at(-1)!;
    const vf = Math.round(woolReading(v, w, last.day, last.levelled) * 2) / 2;
    s.rec.v0 = '50.0';
    s.rec.vFinal = vf.toFixed(1);
    const day = Math.max(...w.observed);
    const seen = (t: 'A' | 'B' | 'C' | 'D') => (rustIndex(v, w, t, day) >= 0.05 ? 'yes' : 'no');
    s.rec.rustA = seen('A');
    s.rec.rustB = seen('B');
    s.rec.rustC = seen('C');
    s.rec.rustD = seen('D');
    s.rec.most = 'D';
    s.answers.o2Vol = { value: (50 - vf).toFixed(1), unit: 'cm³' };
    s.answers.o2Pct = { value: (((50 - vf) / 50) * 100).toFixed(1), unit: '%' };
  }
  return s;
}

test('rubric, registration, lesson tasks, chemistry of the lessons', () => {
  assert.equal(rubricTotal(CHEM_ELECTRO.rubric), 24);
  assert.ok(GRADERS['chem-electro']);
  assert.ok(SIMULATOR_STATE_SCHEMAS['chem-electro']);
  assert.equal(electroLessonTask('pr-chem-electrolysis-copper-sulphate'), 'ELEC');
  assert.equal(electroLessonTask('pr-chem-daniell-cell'), 'CELL');
  assert.equal(electroLessonTask('pr-chem-iron-copper-displacement'), 'DISP');
  assert.equal(electroLessonTask('pr-chem-rusting-conditions'), 'RUST');
  for (const task of ELECTRO_TASKS) assert.deepEqual(chemElectroVariant(4242, task), chemElectroVariant(4242, task));
  // The lessons' worked examples.
  const c = elecChain(0.5, 2400);
  assert.equal(c.charge, 1200);
  assert.equal(c.massCalc.toFixed(3), '0.395');
  assert.equal(CELL_E0.toFixed(2), '1.10');
  assert.equal(((0.56 / 56) * 63.5).toFixed(3), '0.635');
  for (let seed = 1; seed <= 60; seed++) {
    const v = chemElectroVariant(seed, 'ELEC');
    // the rheostat can reach 0.50 A, and the current creeps up as the cell warms
    const st = bestStep(v, 0);
    assert.ok(Math.abs(elecCurrent(v, st, 0) - 0.5) < 0.008, `seed ${seed} best ${elecCurrent(v, st, 0)}`);
    assert.ok(elecCurrent(v, st, 2400) > elecCurrent(v, st, 0));
    // charge at a fixed setting is the integral of the creeping current
    const q = elecCharge(v, { adjust: [{ t: 0, step: st }], ran: 2400 });
    let num = 0;
    for (let t = 0; t < 2400; t += 1) num += elecCurrent(v, st, t + 0.5);
    assert.ok(Math.abs(q - num) < 0.01, `closed form ${q} vs numeric ${num}`);
    // the cell reads close to 1.1 V and the iron wool uses about a fifth of the air
    const cv = chemElectroVariant(seed, 'CELL');
    const e = cellReading(cv, { bridge: true, soaked: true, sanded: true, placed: 'RIGHT', meter: 'HIGH', leads: 'CORRECT' }, 0);
    assert.ok(e >= 1.05 && e <= 1.1, `emf ${e}`);
    const rv = chemElectroVariant(seed, 'RUST');
    const pct = ((50 - woolGas(rv, { wool: 'MOIST' }, 7)) / 50) * 100;
    assert.ok(pct > 19 && pct < 21, `O2 ${pct}`);
    // the displacement warms the solution by a few degrees, then it cools
    const dv = chemElectroVariant(seed, 'DISP');
    const dw = { ...emptyChemElectroState().disp, filings: 'CLEAN' as const, taps: 6, cuso4: 50, stir: 'STIR' as const };
    const rise = dispPeak(dv, dw, 1e9) - dv.disp.room;
    assert.ok(rise > 2.5 && rise < 7, `rise ${rise}`);
    assert.ok(dispTemp(dv, dw, 3000) < dispPeak(dv, dw, 1e9));
  }
  // concentration effects are modest (Nernst): 0.1 M Cu²⁺ lowers it by about 0.03 V
  const strong = chemElectroVariant(5, 'CELL');
  const r = { bridge: true, soaked: true, sanded: true, placed: 'RIGHT' as const, meter: 'HIGH' as const, leads: 'CORRECT' as const };
  const weak = { ...strong, cell: { ...strong.cell, cCu: 0.1 } };
  const d = cellReading(strong, r, 0) - cellReading(weak, r, 0);
  assert.ok(d > 0.01 && d < 0.05, `nernst ${d}`);
  assert.equal(cellReading(strong, { ...r, bridge: false }, 0), 0);
  assert.ok(cellReading(strong, { ...r, leads: 'REVERSED' }, 0) < -1);
  assert.ok(cellReading(strong, { ...r, meter: 'LOW' }, 0) < 0.97);
});

test('an ideal lab earns every AUTO mark, every task, 40 seeds each', () => {
  for (const task of ELECTRO_TASKS)
    for (let seed = 1; seed <= 40; seed++) {
      const state = perfect(seed * 7919, task);
      const parsed = chemElectroStateSchema.safeParse(state);
      assert.ok(parsed.success, `${task} schema: ${parsed.success ? '' : parsed.error.message}`);
      const out = chemElectroGrader.grade(state, seed * 7919);
      assert.equal(autoTotal(out), AUTO_MAX, `${task} seed ${seed * 7919}: ${why(out)}`);
      assert.equal(out.ai.length, 3);
      assert.ok(out.solution.length >= 4);
    }
});

test('ELEC: drifting current, cathode on +, minutes in Q = It, n = 1, rubbing, sanding after weighing', () => {
  const seed = 101;
  const drift = chemElectroGrader.grade(perfect(seed, 'ELEC', (s, v) => (s.elec.adjust = [{ t: 0, step: bestStep(v, 0) }])), seed);
  assert.match(by(drift, 'technique').note, /drifted/);
  const rev = perfect(seed, 'ELEC', (s) => (s.elec.cathodeTo = 'POS'));
  assert.ok(Number(rev.rec.cath2) < Number(rev.rec.cath1), 'the plate on + loses copper');
  assert.match(by(chemElectroGrader.grade(rev, seed), 'setup').note, /\+ terminal/);
  const mins = perfect(seed, 'ELEC');
  mins.answers.charge.value = String(Math.round(Number(mins.rec.current) * 40));
  assert.match(by(chemElectroGrader.grade(mins, seed), 'calculations').note, /SECONDS/);
  const n1 = perfect(seed, 'ELEC');
  n1.answers.molesCu.value = p3((Number(n1.rec.current) * Number(n1.rec.time)) / 96500);
  assert.match(by(chemElectroGrader.grade(n1, seed), 'calculations').note, /2 electrons/);
  const rub = perfect(seed, 'ELEC', (s) => (s.elec.rinse = 'RUB'));
  assert.ok(Number(rub.answers.gain.value) < Number(perfect(seed, 'ELEC').answers.gain.value));
  assert.match(by(chemElectroGrader.grade(rub, seed), 'technique').note, /Rubbing/);
  const late = chemElectroGrader.grade(perfect(seed, 'ELEC', (s) => ((s.elec.sanded = true), (s.elec.sandedAfterWeigh = true))), seed);
  assert.match(by(late, 'setup').note, /after weighing/);
  const flame = chemElectroGrader.grade(perfect(seed, 'ELEC', (s) => (s.elec.dry = 'FLAME')), seed);
  assert.match(by(flame, 'technique').note, /flammable/);
  // the anode loses slightly more than the cathode gains; both near the Faraday mass
  const ok = perfect(seed, 'ELEC');
  const calc = Number(ok.answers.massCalc.value);
  assert.ok(Math.abs(Number(ok.answers.gain.value) - calc) <= 0.02, `${ok.answers.gain.value} vs ${calc}`);
  assert.ok(Number(ok.answers.loss.value) >= Number(ok.answers.gain.value));
});

test('CELL: reversed leads, low-resistance meter, dry bridge, sum instead of difference', () => {
  const seed = 202;
  const good = { bridge: true, soaked: true, sanded: true, placed: 'RIGHT' as const, meter: 'HIGH' as const };
  const rev = chemElectroGrader.grade(perfect(seed, 'CELL', (s) => (s.cell.readings = [{ ...good, leads: 'REVERSED' }, { ...good, bridge: false, leads: 'REVERSED' }])), seed);
  assert.match(by(rev, 'procedure').note, /wrong way round/);
  const low = chemElectroGrader.grade(perfect(seed, 'CELL', (s) => (s.cell.readings = s.cell.readings.map((r) => ({ ...r, meter: 'LOW' })))), seed);
  assert.match(by(low, 'technique').note, /high-resistance/);
  const dry = perfect(seed, 'CELL', (s) => ((s.cell.soaked = false), (s.cell.readings = s.cell.readings.map((r) => ({ ...r, soaked: false })))));
  assert.equal(dry.rec.emf, '0.00');
  assert.match(by(chemElectroGrader.grade(dry, seed), 'procedure').note, /Soak/);
  const sum = perfect(seed, 'CELL');
  sum.answers.ecell.value = '-0.42';
  assert.match(by(chemElectroGrader.grade(sum, seed), 'calculations').note, /not 0\.34 \+/);
  const neg = perfect(seed, 'CELL');
  neg.rec.negative = 'copper';
  assert.equal(by(chemElectroGrader.grade(neg, seed), 'calculations').awarded, 4);
});

test('DISP: rusty filings, filtering too soon, not in excess, flame drying', () => {
  const seed = 303;
  const rusty = perfect(seed, 'DISP', (s) => (s.disp.filings = 'RUSTY'));
  assert.match(by(chemElectroGrader.grade(rusty, seed), 'setup').note, /rusty/);
  assert.ok(Number(rusty.answers.yield.value) < Number(perfect(seed, 'DISP').answers.yield.value));
  const soon = perfect(seed, 'DISP', (s) => (s.disp.elapsed = 30));
  assert.match(by(chemElectroGrader.grade(soon, seed), 'procedure').note, /before the reaction had finished/);
  const few = perfect(seed, 'DISP', (s) => (s.disp.cuso4 = 10));
  assert.match(by(chemElectroGrader.grade(few, seed), 'setup').note, /not an excess/);
  assert.ok(dispProduct(chemElectroVariant(seed, 'DISP'), few.disp).fe > 0.1, 'unreacted iron is left in the "copper"');
  const fl = chemElectroGrader.grade(perfect(seed, 'DISP', (s) => (s.disp.dry = 'FLAME')), seed);
  assert.match(by(fl, 'technique').note, /flame/);
  const still = perfect(seed, 'DISP', (s) => (s.disp.stir = 'NONE'));
  assert.ok(Number(still.rec.t2) <= Number(perfect(seed, 'DISP').rec.t2), 'unstirred: a lower peak');
});

test('RUST: unboiled water in B, unstoppered C, dry wool, unlevelled and early readings', () => {
  const seed = 404;
  const v = chemElectroVariant(seed, 'RUST');
  const unb = perfect(seed, 'RUST', (s) => (s.rust.tubes.B.boiled = false));
  assert.equal(unb.rec.rustB, 'yes', 'dissolved air rusts the nail in B');
  assert.match(by(chemElectroGrader.grade(unb, seed), 'setup').note, /boiled first/);
  const open = perfect(seed, 'RUST', (s) => (s.rust.tubes.C.stopper = false));
  assert.match(by(chemElectroGrader.grade(open, seed), 'setup').note, /stopper/);
  const dry = perfect(seed, 'RUST', (s) => (s.rust.wool = 'DRY'));
  assert.match(by(chemElectroGrader.grade(dry, seed), 'technique').note, /dry/);
  const unlev = perfect(seed, 'RUST', (s) => (s.rust.readings = [{ day: 7, levelled: false }]));
  assert.match(by(chemElectroGrader.grade(unlev, seed), 'technique').note, /same level/);
  assert.ok(woolReading(v, { wool: 'MOIST' }, 7, false) > woolReading(v, { wool: 'MOIST' }, 7, true));
  const early = perfect(seed, 'RUST', (s) => (s.rust.readings = [{ day: 1.5, levelled: true }]));
  assert.match(by(chemElectroGrader.grade(early, seed), 'technique').note, /stopped rising/);
  const look = perfect(seed, 'RUST', (s) => (s.rust.observed = [2]));
  assert.match(by(chemElectroGrader.grade(look, seed), 'procedure').note, /about a week/);
  // salt water rusts fastest
  const w = perfect(seed, 'RUST').rust;
  assert.ok(rustIndex(v, w, 'D', 7) > rustIndex(v, w, 'A', 7) && rustIndex(v, w, 'B', 7) === 0 && rustIndex(v, w, 'C', 7) === 0);
});

test('empty state scores nothing; the state schema rejects garbage', () => {
  for (const task of ELECTRO_TASKS) {
    const s = emptyChemElectroState();
    s.task = task;
    assert.equal(autoTotal(chemElectroGrader.grade(s, 9)), 0, `${task}: ${why(chemElectroGrader.grade(s, 9))}`);
  }
  assert.equal(chemElectroStateSchema.safeParse({}).success, false);
  assert.equal(chemElectroStateSchema.safeParse({ ...emptyChemElectroState(), task: 'NOPE' }).success, false);
  const s = perfect(1, 'ELEC');
  assert.equal(chemElectroStateSchema.safeParse({ ...s, elec: { ...s.elec, rheo: 999 } }).success, false);
  assert.equal(chemElectroStateSchema.safeParse({ ...s, cell: { ...s.cell, leads: 'SIDEWAYS' } }).success, false);
  assert.equal(chemElectroStateSchema.safeParse({ ...s, rec: { ...s.rec, extra: 1, emf: 5 } }).success, false);
  assert.equal(chemElectroStateSchema.safeParse({ ...s, written: { observation: 'x' } }).success, false);
  assert.ok(chemElectroStateSchema.safeParse(s).success);
});
