// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-chem-salts.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHEM_SALTS,
  MP_LIT,
  SALTS_TASKS,
  SIMULATOR_STATE_SCHEMAS,
  chemSaltsStateSchema,
  chemSaltsVariant,
  chromFront,
  chromSolventDist,
  chromSpots,
  cuso4Solubility,
  emptyChemSaltsState,
  mpMinWater,
  mpProduct,
  mpRange,
  mpThermoFor,
  pptChain,
  pptTotal,
  rubricTotal,
  saltsLessonTask,
  solChain,
  solCrystalPoint,
  solCrystals,
  solFiltrate,
  solProduct,
  type ChemSaltsState,
  type SaltsTask,
} from '@aischool/shared';
import { chemSaltsGrader } from '../src/practicals/graders/chem-salts';
import { GRADERS } from '../src/practicals/graders';

const AUTO_MAX = CHEM_SALTS.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
type G = ReturnType<typeof chemSaltsGrader.grade>;
const by = (out: G, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: G) => out.auto.reduce((t, c) => t + c.awarded, 0);
const why = (out: G) => out.auto.filter((c) => c.awarded < c.max).map((c) => `${c.id} ${c.awarded}/${c.max}: ${c.note}`).join(' | ');
const p3 = (x: number) => x.toPrecision(3);

/** A model student's lab for each task: the lesson's procedure, readings exact, answers right. */
function perfect(seed: number, task: SaltsTask, tweak?: (s: ChemSaltsState) => void): ChemSaltsState {
  const v = chemSaltsVariant(seed, task);
  const s = emptyChemSaltsState();
  s.task = task;
  s.written = { observation: 'x', explain: 'x', precautions: 'x' };
  if (task === 'SOL') {
    const w = s.sol;
    w.acid = 50;
    w.warmAtAdd = 60;
    w.warmMax = 62;
    const need = (v.sol.acidConc * 50 * 79.5) / 1000;
    w.portions = Math.ceil((need + 0.3) / v.sol.portion);
    w.cuo = w.portions * v.sol.portion;
    w.stirs = w.portions;
    w.filtered = true;
    const cp = solCrystalPoint(solFiltrate(v, w).n);
    w.rod = [cp * 1.3, cp * 0.85];
    w.water = cp * 0.85;
    w.filteredAt = v.sol.room + 2;
    w.wash = 'COLD';
    w.drying = 'PAPER';
    w.weighed = true;
    tweak?.(s);
    const prod = solProduct(v, w);
    s.rec.acidVol = (w.acid ?? 0).toFixed(1);
    s.rec.mass = prod.mass.toFixed(2);
    const c = solChain(v, w.acid ?? 50, prod.mass);
    s.answers.molesAcid = { value: p3(c.molesAcid), unit: 'mol' };
    s.answers.molesSalt = { value: p3(c.molesSalt), unit: 'mol' };
    s.answers.molarMass = { value: '249.5', unit: 'g mol⁻¹' };
    s.answers.theoretical = { value: p3(c.theoretical), unit: 'g' };
    s.answers.yield = { value: p3(c.yield!), unit: '%' };
  } else if (task === 'PPT') {
    const w = s.ppt;
    Object.assign(w, { cat: 25, an: 30, mixed: true, stirred: true, paper: true, filtered: true, rinsed: true, washes: 2, dried: 3, flame: false, weighings: [1, 2, 3] });
    tweak?.(s);
    s.rec.catVol = '25.0';
    s.rec.anVol = '30.0';
    s.rec.paper = v.ppt.paper.toFixed(2);
    const t1 = pptTotal(v, w, w.weighings[0] ?? 0);
    const t2 = pptTotal(v, w, w.weighings.at(-1) ?? 0);
    s.rec.total1 = t1.toFixed(2);
    s.rec.total2 = w.weighings.length > 1 ? t2.toFixed(2) : '';
    const mass = Number((t2 - Number(s.rec.paper)).toFixed(2));
    s.rec.ppt = mass.toFixed(2);
    const c = pptChain(v, 25, mass);
    s.answers.molesAcid = { value: p3(c.molesAcid), unit: 'mol' };
    s.answers.molesSalt = { value: p3(c.molesSalt), unit: 'mol' };
    s.answers.molarMass = { value: String(c.molarMass), unit: 'g/mol' };
    s.answers.theoretical = { value: p3(c.theoretical), unit: 'g' };
    s.answers.yield = { value: p3(c.yield!), unit: '%' };
  } else if (task === 'CHROM') {
    const w = s.chrom;
    w.line = 'PENCIL';
    w.lineAt = 1.5;
    w.spots = (['INK', 'A', 'B'] as const).map((lane) => ({ lane, n: 2, wet: 0, dry: true }));
    w.solvent = 'WATER';
    w.depth = 1;
    w.covered = true;
    w.coveredThroughout = true;
    w.developed = (11 * 11) / v.chrom.K.WATER;
    w.frontMarked = true;
    w.dried = true;
    tweak?.(s);
    const sd = chromSolventDist(v, w);
    const sp = chromSpots(v, w);
    const solv = Number((sd ?? 0).toFixed(1));
    s.rec.solvent = solv.toFixed(1);
    const dA = sp.find((x) => x.lane === 'A')?.dist ?? 0;
    const dB = sp.find((x) => x.lane === 'B')?.dist ?? 0;
    s.rec.spotA = dA.toFixed(1);
    s.rec.spotB = dB.toFixed(1);
    const ink = sp.filter((x) => x.lane === 'INK').sort((a, b) => a.dist - b.dist);
    ink.forEach((x, i) => {
      const k = (['ink1', 'ink2', 'ink3', 'ink4'] as const)[i]!;
      s.rec[k] = x.dist.toFixed(1);
      s.rec[(['rf1', 'rf2', 'rf3', 'rf4'] as const)[i]!] = (Number(x.dist.toFixed(1)) / solv).toFixed(2);
    });
    s.answers.rfA = { value: (Number(s.rec.spotA) / solv).toFixed(2), unit: '' };
    s.answers.rfB = { value: (Number(s.rec.spotB) / solv).toFixed(2), unit: 'no unit' };
    s.rec.hasA = 'yes';
    s.rec.hasB = v.chrom.ink.includes(v.chrom.B) ? 'yes' : 'no';
    s.rec.nComp = String(v.chrom.ink.length);
  } else {
    const w = s.mp;
    Object.assign(w, { weighedImpure: true, water: Math.ceil(mpMinWater(v) / 10) * 10, boiled: true, funnelWarm: true, hotFiltered: true, cooling: 'SLOW', iced: true, collected: true, washed: true, dried: true, weighedPure: true });
    const rate = { r: 2 };
    tweak?.(s);
    if (!w.runs.length)
      for (const sample of ['IMPURE', 'PURE'] as const) {
        const [a, b] = mpRange(v, w, sample);
        w.runs.push({ sample, attached: true, start: mpThermoFor(a, rate.r), end: mpThermoFor(b, rate.r), rateStart: rate.r, rateEnd: rate.r, done: true });
      }
    const pure = mpProduct(v, w).mass;
    s.rec.impure = v.mp.impure.toFixed(2);
    s.rec.pure = pure.toFixed(2);
    const ri = w.runs.find((r) => r.sample === 'IMPURE')!;
    const rp = w.runs.find((r) => r.sample === 'PURE')!;
    s.rec.iStart = ri.start!.toFixed(1);
    s.rec.iEnd = ri.end!.toFixed(1);
    s.rec.pStart = rp.start!.toFixed(1);
    s.rec.pEnd = rp.end!.toFixed(1);
    s.answers.recovery = { value: p3((pure / v.mp.impure) * 100), unit: '%' };
    s.answers.impureWidth = { value: (Number(s.rec.iEnd) - Number(s.rec.iStart)).toFixed(1), unit: '°C' };
    s.answers.pureWidth = { value: (Number(s.rec.pEnd) - Number(s.rec.pStart)).toFixed(1), unit: '°C' };
    s.answers.depression = { value: (MP_LIT - Number(s.rec.iEnd)).toFixed(1), unit: '°C' };
  }
  return s;
}

test('rubric, registration, lesson tasks, chemistry of the lessons', () => {
  assert.equal(rubricTotal(CHEM_SALTS.rubric), 24);
  assert.ok(GRADERS['chem-salts']);
  assert.ok(SIMULATOR_STATE_SCHEMAS['chem-salts']);
  assert.equal(saltsLessonTask('pr-chem-preparing-soluble-salt'), 'SOL');
  assert.equal(saltsLessonTask('pr-chem-preparing-insoluble-salt'), 'PPT');
  assert.equal(saltsLessonTask('pr-chem-paper-chromatography'), 'CHROM');
  assert.equal(saltsLessonTask('pr-chem-recrystallisation-melting-point'), 'MP');
  for (const task of SALTS_TASKS) assert.deepEqual(chemSaltsVariant(4242, task), chemSaltsVariant(4242, task));
  // The lessons' worked examples.
  const v = chemSaltsVariant(7, 'SOL');
  const c = solChain({ ...v, sol: { ...v.sol, acidConc: 1 } }, 50, 9.8);
  assert.equal(c.molesAcid.toFixed(4), '0.0500');
  assert.equal(c.theoretical.toPrecision(3), '12.5');
  assert.equal(c.yield!.toPrecision(3), '78.6');
  const pv = chemSaltsVariant(7, 'PPT');
  const pc = pptChain({ ...pv, ppt: { ...pv.ppt, catConc: 0.2 } }, 25, 0.47);
  assert.equal(pc.theoretical.toFixed(2), '0.50');
  assert.equal(Math.round(pc.yield!), 94);
  // CuSO₄ solubility rises with temperature; crystals form on cooling a saturated solution.
  assert.ok(cuso4Solubility(20) < cuso4Solubility(80));
  assert.equal(solCrystals(0.05, 50, 25), 0); // 8 g in 50 g water at 25 °C: not saturated, no crystals
  assert.ok(solCrystals(0.05, 12, 25) > 0.03);
  let withB = 0;
  for (let s = 1; s <= 200; s++) {
    const cv = chemSaltsVariant(s, 'CHROM').chrom;
    assert.ok(cv.ink.includes(cv.A), 'dye A is always in the ink');
    assert.equal(cv.ink.length, 3);
    assert.notEqual(cv.A, cv.B);
    if (cv.ink.includes(cv.B)) withB++;
    const mv = chemSaltsVariant(s, 'MP');
    assert.ok(mpMinWater(mv) > 70 && mpMinWater(mv) < 90, `min water ${mpMinWater(mv)}`);
    const sv = chemSaltsVariant(s, 'SOL');
    assert.ok(sv.sol.acidConc >= 0.95 && sv.sol.acidConc <= 1.1);
  }
  assert.ok(withB > 60 && withB < 180, `B in the ink ${withB}/200`);
  // The solvent front slows down as it rises (h² = Kt).
  const cv = chemSaltsVariant(3, 'CHROM');
  const w = { solvent: 'WATER' as const, depth: 1, coveredThroughout: true };
  const h1 = chromFront(cv, w, 600) - 1;
  const h4 = chromFront(cv, w, 2400) - 1;
  assert.ok(Math.abs(h4 / h1 - 2) < 1e-9);
});

test('an ideal lab earns every AUTO mark, every task, 40 seeds each', () => {
  for (const task of SALTS_TASKS)
    for (let seed = 1; seed <= 40; seed++) {
      const state = perfect(seed * 7919, task);
      const parsed = chemSaltsStateSchema.safeParse(state);
      assert.ok(parsed.success, `${task} schema: ${parsed.success ? '' : parsed.error.message}`);
      const out = chemSaltsGrader.grade(state, seed * 7919);
      assert.equal(autoTotal(out), AUTO_MAX, `${task} seed ${seed * 7919}: ${why(out)}`);
      assert.equal(out.ai.length, 3);
      assert.ok(out.solution.length >= 4);
    }
});

test('SOL: evaporating to dryness and not using excess base are marked mistakes', () => {
  const seed = 101;
  const dry = perfect(seed, 'SOL', (s) => ((s.sol.dry = true), (s.sol.water = 0)));
  const o = chemSaltsGrader.grade(dry, seed);
  assert.ok(by(o, 'technique').awarded <= 1, by(o, 'technique').note);
  assert.match(by(o, 'technique').note, /dryness/);
  assert.match(by(o, 'readings').note, /white anhydrous/i);
  assert.equal(solProduct(chemSaltsVariant(seed, 'SOL'), dry.sol).look, 'WHITE');
  const few = perfect(seed, 'SOL', (s) => {
    const v = chemSaltsVariant(seed, 'SOL');
    s.sol.portions = 3;
    s.sol.cuo = ((v.sol.acidConc * 50 * 79.5) / 1000) * 0.8;
  });
  const of = chemSaltsGrader.grade(few, seed);
  assert.equal(by(of, 'procedure').awarded, 4, by(of, 'procedure').note);
  assert.match(by(of, 'procedure').note, /not in excess/);
  // Stopping too early: no rod test positive, few crystals.
  const early = perfect(seed, 'SOL', (s) => (s.sol.water = 40));
  assert.match(by(chemSaltsGrader.grade(early, seed), 'technique').note, /too early/);
  // Drying by heat turns them white; the anhydrous molar mass is a slip.
  const slip = perfect(seed, 'SOL');
  slip.answers.molarMass.value = '159.5';
  assert.match(by(chemSaltsGrader.grade(slip, seed), 'calculations').note, /water of crystallisation/);
});

test('PPT: no excess, no washing, flame drying, no constant mass', () => {
  const seed = 202;
  const o = chemSaltsGrader.grade(perfect(seed, 'PPT', (s) => (s.ppt.an = 20)), seed);
  assert.equal(by(o, 'setup').awarded, 1);
  assert.match(by(o, 'setup').note, /not an excess/);
  const nw = chemSaltsGrader.grade(perfect(seed, 'PPT', (s) => (s.ppt.washes = 0)), seed);
  assert.equal(by(nw, 'procedure').awarded, 4);
  const fl = chemSaltsGrader.grade(perfect(seed, 'PPT', (s) => (s.ppt.flame = true)), seed);
  assert.match(by(fl, 'technique').note, /flame/);
  const once = chemSaltsGrader.grade(perfect(seed, 'PPT', (s) => ((s.ppt.dried = 1), (s.ppt.weighings = [1]))), seed);
  assert.match(by(once, 'technique').note, /constant mass/);
  const wet = perfect(seed, 'PPT', (s) => ((s.ppt.dried = 0), (s.ppt.weighings = [0])));
  assert.ok(Number(wet.answers.yield.value) > 150, 'a wet precipitate weighs far too much');
});

test('CHROM: ink baseline and solvent above the baseline are marked; measuring from the edge is caught', () => {
  const seed = 303;
  const ink = chemSaltsGrader.grade(perfect(seed, 'CHROM', (s) => (s.chrom.line = 'INK')), seed);
  assert.equal(by(ink, 'setup').awarded, 1);
  assert.match(by(ink, 'setup').note, /ink/);
  const above = perfect(seed, 'CHROM', (s) => (s.chrom.depth = 2));
  assert.equal(chromSpots(chemSaltsVariant(seed, 'CHROM'), above.chrom).length, 0);
  const oa = chemSaltsGrader.grade(above, seed);
  assert.match(by(oa, 'procedure').note, /above the baseline/);
  assert.ok(by(oa, 'readings').awarded <= 2);
  const edge = perfect(seed, 'CHROM');
  edge.rec.solvent = (Number(edge.rec.solvent) + 1.5).toFixed(1);
  assert.match(by(chemSaltsGrader.grade(edge, seed), 'technique').note, /bottom edge/);
  const open = chemSaltsGrader.grade(perfect(seed, 'CHROM', (s) => ((s.chrom.covered = false), (s.chrom.coveredThroughout = false))), seed);
  assert.match(by(open, 'procedure').note, /Cover the tank/);
  const unit = perfect(seed, 'CHROM');
  unit.answers.rfA.unit = 'cm';
  assert.equal(by(chemSaltsGrader.grade(unit, seed), 'units').awarded, 0);
  const off = perfect(seed, 'CHROM', (s) => (s.chrom.developed = 1e5));
  assert.match(by(chemSaltsGrader.grade(off, seed), 'procedure').note, /ran off/);
});

test('MP: heating the capillary too fast reads high; too much water; cold funnel', () => {
  const seed = 404;
  const v = chemSaltsVariant(seed, 'MP');
  const fast = perfect(seed, 'MP', (s) => {
    for (const sample of ['IMPURE', 'PURE'] as const) {
      const [a, b] = mpRange(v, s.mp, sample);
      s.mp.runs.push({ sample, attached: true, start: mpThermoFor(a, 12), end: mpThermoFor(b, 12), rateStart: 12, rateEnd: 12, done: true });
    }
  });
  const o = chemSaltsGrader.grade(fast, seed);
  assert.equal(by(o, 'technique').awarded, 2);
  assert.match(by(o, 'technique').note, /too fast/);
  assert.equal(by(o, 'readings').awarded, 2, by(o, 'readings').note);
  const much = chemSaltsGrader.grade(perfect(seed, 'MP', (s) => (s.mp.water = 200)), seed);
  assert.match(by(much, 'setup').note, /Too much water/);
  const cold = perfect(seed, 'MP', (s) => (s.mp.funnelWarm = false));
  assert.ok(mpProduct(v, cold.mp).mass < mpProduct(v, perfect(seed, 'MP').mp).mass);
  assert.match(by(chemSaltsGrader.grade(cold, seed), 'procedure').note, /funnel/);
  // The impure sample melts lower and over a wider range than the recrystallised one.
  const w = perfect(seed, 'MP').mp;
  const [i0, i1] = mpRange(v, w, 'IMPURE');
  const [p0, p1] = mpRange(v, w, 'PURE');
  assert.ok(i0 < p0 && i1 - i0 > p1 - p0);
});

test('empty state scores nothing; the state schema rejects garbage', () => {
  for (const task of SALTS_TASKS) {
    const s = emptyChemSaltsState();
    s.task = task;
    assert.equal(autoTotal(chemSaltsGrader.grade(s, 9)), 0, `${task}: ${why(chemSaltsGrader.grade(s, 9))}`);
  }
  assert.equal(chemSaltsStateSchema.safeParse({}).success, false);
  assert.equal(chemSaltsStateSchema.safeParse({ ...emptyChemSaltsState(), task: 'NOPE' }).success, false);
  const s = perfect(1, 'CHROM');
  assert.equal(chemSaltsStateSchema.safeParse({ ...s, chrom: { ...s.chrom, line: 'CRAYON' } }).success, false);
  assert.equal(chemSaltsStateSchema.safeParse({ ...s, sol: { ...s.sol, water: 9999 } }).success, false);
  assert.equal(chemSaltsStateSchema.safeParse({ ...s, rec: { ...s.rec, extra: 1, solvent: 5 } }).success, false);
  assert.equal(chemSaltsStateSchema.safeParse({ ...s, written: { observation: 'x' } }).success, false);
  assert.ok(chemSaltsStateSchema.safeParse(s).success);
});
