// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-chem-acids.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ACIDS_TASKS,
  CHEM_ACIDS,
  HARD_BOILABLE,
  HARD_SAMPLES,
  IND_SOLS,
  PH_SAMPLES,
  SIMULATOR_STATE_SCHEMAS,
  acidBalance,
  acidChips,
  acidsLessonTask,
  chemAcidsStateSchema,
  chemAcidsVariant,
  emptyChemAcidsState,
  hardIdeal,
  hardLather,
  indEndpoint,
  indPh,
  phClassOf,
  phReading,
  rubricTotal,
  zoboNames,
  PH_CLASS_LABEL,
  type AcidsTask,
  type ChemAcidsState,
  type ChemAcidsVariant,
  type HardRun,
  type IndIndicator,
  type IndRun,
} from '@aischool/shared';
import { chemAcidsGrader } from '../src/practicals/graders/chem-acids';
import { GRADERS } from '../src/practicals/graders';

const AUTO_MAX = CHEM_ACIDS.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
type G = ReturnType<typeof chemAcidsGrader.grade>;
const by = (out: G, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: G) => out.auto.reduce((t, c) => t + c.awarded, 0);
const why = (out: G) => out.auto.filter((c) => c.awarded < c.max).map((c) => `${c.id} ${c.awarded}/${c.max}: ${c.note}`).join(' | ');
const p3 = (x: number) => x.toPrecision(3);
const r2 = (x: number) => Math.round(x * 100) / 100;

/** An ideal titration run: drop by drop to the first permanent colour change. */
function idealRun(v: ChemAcidsVariant, ind: IndIndicator, start: number, drops = 3): IndRun {
  const r: IndRun = { ind, drops, start, added: 0, done: true, dilA: false, dilB: false };
  r.added = r2(Math.ceil((indEndpoint(v, r) - 1e-9) / 0.05) * 0.05);
  return r;
}
function hardRun(v: ChemAcidsVariant, sample: HardRun['sample'], boiled: boolean, start: number): HardRun {
  return { sample, boiled, vol: 50, start, added: hardIdeal(v, sample, boiled), big: false, swirled: false, watched: true, done: true };
}

/** A model student's lab for each task: the lesson's procedure, readings exact, answers right. */
function perfect(seed: number, task: AcidsTask, tweak?: (s: ChemAcidsState, v: ChemAcidsVariant) => void): ChemAcidsState {
  const v = chemAcidsVariant(seed, task);
  const s = emptyChemAcidsState();
  s.task = task;
  s.written = { observation: 'x', explain: 'x', precautions: 'x' };
  if (task === 'PH') {
    s.ph.rinsed = true;
    s.ph.tile = true;
    for (const k of PH_SAMPLES) s.ph.tubes[k] = { vol: 'TWO', drops: 2, shaken: true, compared: true };
    tweak?.(s, v);
    for (const k of PH_SAMPLES) {
      const p = phReading(v, s.ph, k);
      s.rec[`ph${k}`] = String(p);
      s.rec[`cl${k}`] = PH_CLASS_LABEL[phClassOf(p)];
    }
    const a = Number(s.rec.phHCL);
    const b = Number(s.rec.phETH);
    s.answers.hplus = { value: String(v.ph.cHcl), unit: 'mol dm⁻³' };
    s.answers.phHcl = { value: String(-Math.log10(v.ph.cHcl)), unit: '' };
    s.answers.phNaoh = { value: String(14 + Math.log10(v.ph.cNaoh)), unit: '' };
    s.answers.ratio = { value: String(10 ** (b - a)), unit: '' };
    s.answers.ionised = { value: p3((10 ** -b / 0.1) * 100), unit: '%' };
  } else if (task === 'IND') {
    const w = s.ind;
    Object.assign(w, { solvent: 'WATER', heat: 'BATH', filtered: true, burRinsed: true, pipRinsed: true, fills: 4 });
    for (const x of IND_SOLS) w.tests[x] = { ext: true, ui: true };
    w.runs = [idealRun(v, 'MO', v.ind.fills[0]!), idealRun(v, 'MO', v.ind.fills[1]!), idealRun(v, 'ZOBO', v.ind.fills[2]!), idealRun(v, 'ZOBO', v.ind.fills[3]!)];
    w.burette = r2(w.runs.at(-1)!.start + w.runs.at(-1)!.added);
    tweak?.(s, v);
    for (const x of IND_SOLS) {
      s.rec[`ex${x}`] = zoboNames(v.ind.pH[x])[0]!;
      s.rec[`ui${x}`] = String(Math.round(v.ind.pH[x]));
    }
    s.rec.rangeLo = '4';
    s.rec.rangeHi = '9';
    const t: Record<IndIndicator, number[]> = { MO: [], ZOBO: [] };
    for (const ind of ['MO', 'ZOBO'] as const)
      w.runs
        .filter((r) => r.done && r.ind === ind)
        .slice(0, 3)
        .forEach((r, i) => {
          const p = `${ind === 'MO' ? 'mo' : 'z'}${i + 1}`;
          s.rec[`${p}i`] = r.start.toFixed(2);
          s.rec[`${p}f`] = (r.start + r.added).toFixed(2);
          s.rec[`${p}t`] = r.added.toFixed(2);
          t[ind].push(r.added);
        });
    const mean = (xs: number[]) => xs.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
    const mo = mean(t.MO);
    const z = mean(t.ZOBO);
    s.answers.meanMo = { value: mo.toFixed(2), unit: 'cm³' };
    s.answers.meanZobo = { value: z.toFixed(2), unit: 'cm³' };
    s.answers.diff = { value: (z - mo).toFixed(2), unit: 'cm³' };
    s.answers.pctDiff = { value: p3(((z - mo) / mo) * 100), unit: '%' };
  } else if (task === 'ACID') {
    const w = s.acid;
    for (const x of ['MG', 'ZN', 'CU', 'CUO', 'CACO3'] as const) w.tubes[x] = { acid: true, warmed: null, tests: [] };
    w.tubes.MG.tests = ['BURNING'];
    w.tubes.ZN.tests = ['BURNING'];
    w.tubes.CU.tests = ['BURNING'];
    w.tubes.CUO.warmed = 'GENTLE';
    w.tubes.CACO3.tests = ['LIME'];
    w.zeroed = true;
    while (acidChips(v, w) < 1.92) w.chips++;
    Object.assign(w, { acidVol: 50, plug: true, flaskWeighed: true, added: true, weighings: [900, 960] });
    tweak?.(s, v);
    s.rec.gasMG = 'hydrogen';
    s.rec.gasZN = 'hydrogen';
    s.rec.gasCU = 'none';
    s.rec.gasCACO3 = 'carbon dioxide';
    s.rec.cuo = 'blue-green';
    const m1 = acidBalance(v, w, 'flask');
    const m2 = acidBalance(v, w, 'chips');
    const m3 = acidBalance(v, w, 'total', w.weighings.at(-1)!);
    s.rec.m1 = m1.toFixed(2);
    s.rec.m2 = m2.toFixed(2);
    s.rec.m3 = m3.toFixed(2);
    const n = m2 / 100;
    const lost = r2(m1 + m2 - m3);
    s.answers.molCaco3 = { value: p3(n), unit: 'mol' };
    s.answers.massCo2 = { value: p3(n * 44), unit: 'g' };
    s.answers.lost = { value: lost.toFixed(2), unit: 'g' };
    s.answers.pctCo2 = { value: p3((lost / (n * 44)) * 100), unit: '%' };
  } else {
    const w = s.hard;
    w.burRinsed = true;
    for (const x of ['TAP', 'X', 'Y'] as const) w.boiled[x] = 'FULL';
    let k = 0;
    w.runs = [...HARD_SAMPLES.map((x) => hardRun(v, x, false, v.hard.fills[k++ % 14]!)), ...(['TAP', 'X', 'Y'] as const).map((x) => hardRun(v, x, true, v.hard.fills[k++ % 14]!))];
    w.burette = 10;
    w.fills = 8;
    tweak?.(s, v);
    for (const r of w.runs.filter((q) => q.done)) s.rec[`${r.boiled ? 'b' : 'v'}${r.sample}`] = r.added.toFixed(1);
    if (!s.rec.bRAIN) s.rec.bRAIN = s.rec.vRAIN!;
    const tot = (x: 'TAP' | 'X' | 'Y') => hardIdeal(v, x, false);
    s.rec.hardest = (['TAP', 'X', 'Y'] as const).reduce((a, b) => (tot(b) > tot(a) ? b : a));
    s.rec.permSample = v.hard.tempSample === 'X' ? 'Y' : 'X';
    const vx = Number(s.rec.vX);
    const bx = Number(s.rec.bX);
    const vd = Number(s.rec.vDIST);
    s.answers.tempX = { value: (vx - bx).toFixed(1), unit: 'cm³' };
    s.answers.permX = { value: (bx - vd).toFixed(1), unit: 'cm³' };
    s.answers.totalX = { value: (vx - vd).toFixed(1), unit: 'cm³' };
    s.answers.pctTemp = { value: p3(((vx - bx) / (vx - vd)) * 100), unit: '%' };
  }
  return s;
}

test('rubric, registration, lesson tasks, chemistry of the lessons', () => {
  assert.equal(rubricTotal(CHEM_ACIDS.rubric), 24);
  assert.ok(GRADERS['chem-acids']);
  assert.ok(SIMULATOR_STATE_SCHEMAS['chem-acids']);
  assert.equal(acidsLessonTask('pr-chem-ph-universal-indicator'), 'PH');
  assert.equal(acidsLessonTask('pr-chem-indicator-from-hibiscus'), 'IND');
  assert.equal(acidsLessonTask('pr-chem-acids-with-carbonates'), 'ACID');
  assert.equal(acidsLessonTask('pr-chem-hardness-of-water'), 'HARD');
  assert.equal(acidsLessonTask(null), 'PH');
  for (let seed = 1; seed <= 40; seed++) {
    const v = chemAcidsVariant(seed, 'PH');
    // strong acid red, water green, NaOH violet; ethanoic acid weaker than HCl of the same concentration
    assert.ok(phReading(v, { rinsed: true }, 'HCL') <= 2);
    assert.equal(phReading(v, { rinsed: true }, 'WATER'), 7);
    assert.equal(phReading(v, { rinsed: false }, 'WATER'), 8);
    assert.ok(phReading(v, { rinsed: true }, 'NAOH') >= 11);
    assert.ok(v.ph.pH.ETH > 2.5 && v.ph.pH.ETH < 3.2);
    const vi = chemAcidsVariant(seed, 'IND');
    const mo = indEndpoint(vi, { ind: 'MO', drops: 3, dilA: false, dilB: false });
    const zo = indEndpoint(vi, { ind: 'ZOBO', drops: 3, dilA: false, dilB: false });
    const eq = (25 * vi.ind.cBase) / vi.ind.cAcid;
    assert.ok(mo > eq && mo - eq < 0.1, `MO end ${mo} vs eq ${eq}`);
    assert.ok(zo - mo > 0.04 && zo - mo < 0.16, `zobo ${zo} − MO ${mo}`);
    assert.ok(indPh(vi, { ind: 'MO', drops: 3, dilA: false, dilB: false }, 0) > 12.5);
    // too much extract: its own acids lower the titre
    assert.ok(indEndpoint(vi, { ind: 'ZOBO', drops: 40, dilA: false, dilB: false }) < zo - 0.08);
    const vh = chemAcidsVariant(seed, 'HARD');
    assert.ok(hardIdeal(vh, 'DIST', false) <= 1);
    const temp = vh.hard.tempSample;
    assert.ok(hardIdeal(vh, temp, false) - hardIdeal(vh, temp, true) >= 5, 'boiling removes the temporary hardness');
    const permS = temp === 'X' ? 'Y' : 'X';
    assert.ok(hardIdeal(vh, permS, false) - hardIdeal(vh, permS, true) <= 1.5);
    const va = chemAcidsVariant(seed, 'ACID');
    const w = { ...emptyChemAcidsState().acid, zeroed: true, acidVol: 50, plug: true, chips: 8 };
    const lost = acidBalance(va, w, 'flask') + acidBalance(va, w, 'chips') - acidBalance(va, w, 'total', 5000);
    const theo = (acidChips(va, w) / 100) * 44;
    assert.ok(lost / theo > 0.93 && lost / theo < 1.0, `CO₂ ${lost} of ${theo}`);
  }
});

test('an ideal lab gets every AUTO mark across 40 seeds, for every task', () => {
  for (const task of ACIDS_TASKS)
    for (let seed = 1; seed <= 40; seed++) {
      const s = perfect(seed, task);
      assert.equal(chemAcidsStateSchema.safeParse(s).success, true, `${task} ${seed} schema`);
      const out = chemAcidsGrader.grade(s, seed);
      assert.equal(autoTotal(out), AUTO_MAX, `${task} seed ${seed}: ${why(out)}`);
      assert.equal(out.ai.length, 3);
      assert.ok(out.solution.length >= 3);
    }
});

test('PH mistakes lose the right marks', () => {
  const seed = 11;
  const g = (t: (s: ChemAcidsState, v: ChemAcidsVariant) => void) => chemAcidsGrader.grade(perfect(seed, 'PH', t), seed);
  const unrinsed = g((s) => (s.ph.rinsed = false));
  assert.equal(by(unrinsed, 'setup').awarded, 1);
  const full = g((s) => (s.ph.tubes.SOAP.vol = 'FULL'));
  assert.equal(by(full, 'setup').awarded, 1);
  const uneven = g((s) => (s.ph.tubes.ASH.drops = 6));
  assert.equal(by(uneven, 'technique').awarded, 2);
  const noTile = g((s) => (s.ph.tile = false));
  assert.equal(by(noTile, 'technique').awarded, 2);
  const missing = g((s) => {
    s.ph.tubes.COLA = { vol: null, drops: 0, shaken: false, compared: false };
    s.ph.tubes.LIME = { vol: null, drops: 0, shaken: false, compared: false };
  });
  assert.equal(by(missing, 'procedure').awarded, 3);
  const s = perfect(seed, 'PH');
  s.rec.phWATER = '6.5';
  s.rec.clSOAP = 'strongly alkaline';
  s.answers.phNaoh = { value: String(-Math.log10(chemAcidsVariant(seed, 'PH').ph.cNaoh)), unit: '' };
  s.answers.hplus.unit = '';
  const out = chemAcidsGrader.grade(s, seed);
  assert.equal(by(out, 'readings').awarded, 2);
  assert.equal(by(out, 'calculations').awarded, 4);
  assert.match(by(out, 'calculations').note, /pOH/);
  assert.equal(by(out, 'units').awarded, 0);
});

test('IND mistakes lose the right marks', () => {
  const seed = 5;
  const g = (t: (s: ChemAcidsState, v: ChemAcidsVariant) => void) => chemAcidsGrader.grade(perfect(seed, 'IND', t), seed);
  const flame = g((s) => {
    s.ind.solvent = 'ETHANOL';
    s.ind.heat = 'FLAME';
  });
  assert.equal(by(flame, 'technique').awarded, 2);
  const unfiltered = g((s) => (s.ind.filtered = false));
  assert.equal(by(unfiltered, 'setup').awarded, 1);
  const lots = g((s, v) => (s.ind.runs = [idealRun(v, 'MO', 0.5), idealRun(v, 'MO', 1.0), idealRun(v, 'ZOBO', 0.3, 40), idealRun(v, 'ZOBO', 0.2, 40)]));
  assert.equal(by(lots, 'technique').awarded, 2);
  const overshoot = g((s, v) => {
    const r = idealRun(v, 'ZOBO', 0.4);
    r.added = r2(r.added + 0.6);
    s.ind.runs = [idealRun(v, 'MO', 0.5), idealRun(v, 'MO', 1.0), idealRun(v, 'ZOBO', 0.3), r];
  });
  assert.equal(by(overshoot, 'technique').awarded, 2);
  const unrinsed = g((s) => (s.ind.burRinsed = false));
  assert.equal(by(unrinsed, 'procedure').awarded, 4);
  const oneZ = g((s, v) => (s.ind.runs = [idealRun(v, 'MO', 0.5), idealRun(v, 'MO', 1.0), idealRun(v, 'ZOBO', 0.3)]));
  assert.ok(by(oneZ, 'procedure').awarded <= 4);
  const s = perfect(seed, 'IND');
  s.rec.exNAOH = 'red';
  s.rec.mo1f = '30.00';
  s.answers.pctDiff = { value: '40', unit: '%' };
  const out = chemAcidsGrader.grade(s, seed);
  assert.equal(by(out, 'readings').awarded, 2);
  assert.equal(by(out, 'calculations').awarded, 3);
});

test('ACID mistakes lose the right marks', () => {
  const seed = 9;
  const g = (t: (s: ChemAcidsState, v: ChemAcidsVariant) => void) => chemAcidsGrader.grade(perfect(seed, 'ACID', t), seed);
  const little = g((s) => (s.acid.acidVol = 10));
  assert.equal(by(little, 'setup').awarded, 1);
  const noPlug = g((s) => (s.acid.plug = false));
  assert.equal(by(noPlug, 'setup').awarded, 1);
  const notZero = g((s) => (s.acid.zeroed = false));
  assert.equal(by(notZero, 'technique').awarded, 2);
  assert.equal(autoTotal(notZero), AUTO_MAX - 1, why(notZero));
  const early = g((s) => (s.acid.weighings = [60]));
  assert.equal(by(early, 'technique').awarded, 2);
  const strong = g((s) => (s.acid.tubes.CUO.warmed = 'STRONG'));
  assert.equal(by(strong, 'technique').awarded, 2);
  const noLime = g((s) => (s.acid.tubes.CACO3.tests = ['BURNING']));
  assert.equal(by(noLime, 'procedure').awarded, 4);
  const s = perfect(seed, 'ACID');
  s.rec.gasCU = 'hydrogen';
  s.answers.lost = { value: '0.10', unit: 'g' };
  s.answers.pctCo2 = { value: '95', unit: 'grams' };
  const out = chemAcidsGrader.grade(s, seed);
  assert.equal(by(out, 'readings').awarded, 3);
  assert.ok(by(out, 'calculations').awarded <= 3);
  assert.equal(by(out, 'units').awarded, 0);
});

test('HARD mistakes lose the right marks', () => {
  const seed = 21;
  const g = (t: (s: ChemAcidsState, v: ChemAcidsVariant) => void) => chemAcidsGrader.grade(perfect(seed, 'HARD', t), seed);
  const short = g((s) => (s.hard.boiled.X = 'SHORT'));
  assert.equal(by(short, 'procedure').awarded, 4);
  const swirl = g((s) => (s.hard.runs[3]!.swirled = true));
  assert.equal(by(swirl, 'technique').awarded, 1, 'a swirl: less lather, and it did not last at that volume');
  const froth = g((s, v) => {
    const r = s.hard.runs[3]!;
    r.added = Math.max(0.5, r.added - 0.5);
    assert.notEqual(hardLather(v, s.hard, r), 'LASTING');
  });
  assert.equal(by(froth, 'technique').awarded, 2);
  const noBlank = g((s) => (s.hard.runs = s.hard.runs.filter((r) => r.sample !== 'DIST')));
  assert.ok(by(noBlank, 'procedure').awarded <= 4);
  const rough = g((s) => (s.hard.runs[1]!.vol = 45));
  assert.equal(by(rough, 'setup').awarded, 1);
  const s = perfect(seed, 'HARD');
  s.answers.permX = { value: s.rec.bX!, unit: 'cm³' };
  const out = chemAcidsGrader.grade(s, seed);
  assert.equal(by(out, 'calculations').awarded, 4);
  assert.match(by(out, 'calculations').note, /blank/);
  void HARD_BOILABLE;
});

test('the state schema rejects garbage; an empty lab grades without crashing', () => {
  assert.equal(chemAcidsStateSchema.safeParse({}).success, false);
  assert.equal(chemAcidsStateSchema.safeParse({ ...emptyChemAcidsState(), task: 'NOPE' }).success, false);
  const bad = emptyChemAcidsState();
  (bad.ph.tubes.HCL as { drops: number }).drops = -3;
  assert.equal(chemAcidsStateSchema.safeParse(bad).success, false);
  const big = emptyChemAcidsState();
  big.rec.phHCL = 'x'.repeat(200);
  assert.equal(chemAcidsStateSchema.safeParse(big).success, false);
  assert.equal(chemAcidsStateSchema.safeParse(emptyChemAcidsState()).success, true);
  for (const task of ACIDS_TASKS) {
    const s = emptyChemAcidsState();
    s.task = task;
    const out = chemAcidsGrader.grade(s, 3);
    assert.equal(out.auto.length, 6);
    assert.ok(autoTotal(out) <= 2, `${task} empty ${autoTotal(out)}: ${why(out)}`);
  }
});
