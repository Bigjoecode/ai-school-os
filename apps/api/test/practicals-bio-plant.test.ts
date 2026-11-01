// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-bio-plant.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BIO_PLANT,
  LEAF_KINDS,
  PLANT_PRACTICAL_TASKS,
  STARCH_LABELS,
  bioPlantStateSchema,
  bioPlantVariant,
  emptyBioPlantState,
  leafCellColour,
  oxyIntensity,
  oxyModelState,
  oxyNet,
  oxyRate,
  oxySplint,
  oxyTemp,
  potoModelState,
  potoRunMinutes,
  potoSpeed,
  potoTarget,
  rubricTotal,
  starchIn,
  starchModelState,
  type BioPlantState,
} from '@aischool/shared';
import { bioPlantGrader } from '../src/practicals/graders/bio-plant';
import { GRADERS } from '../src/practicals/graders';

type Out = ReturnType<typeof bioPlantGrader.grade>;
const by = (out: Out, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: Out) => out.auto.reduce((t, c) => t + c.awarded, 0);
const AUTO_MAX = BIO_PLANT.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const WRITTEN = { precautions: 'The shoot was cut under water; the joints were sealed with Vaseline.', explain: 'Wind removes water vapour so the diffusion gradient stays steep; light opens the stomata.' };

const perfect = {
  POTOMETER: (seed: number) => ({ ...potoModelState(bioPlantVariant(seed, 'POTOMETER')), written: WRITTEN }),
  OXYGEN: (seed: number) => ({ ...oxyModelState(bioPlantVariant(seed, 'OXYGEN')), written: WRITTEN }),
  STARCH: (seed: number) => ({ ...starchModelState(bioPlantVariant(seed, 'STARCH')), written: WRITTEN }),
};

test('the rubric is 20 marks, registered, and the variant is the same for a seed', () => {
  assert.equal(rubricTotal(BIO_PLANT.rubric), 20);
  assert.equal(GRADERS['bio-plant'], bioPlantGrader);
  assert.deepEqual(PLANT_PRACTICAL_TASKS, { 'pr-bio-potometer-transpiration': 'POTOMETER', 'pr-bio-oxygen-evolution': 'OXYGEN', 'pr-bio-starch-test-leaf': 'STARCH' });
  assert.equal(JSON.stringify(bioPlantVariant(777, 'OXYGEN')), JSON.stringify(bioPlantVariant(777, 'OXYGEN')));
  for (let seed = 1; seed <= 200; seed++) {
    const v = bioPlantVariant(seed, 'OXYGEN');
    assert.ok(v.oxy.dComp >= 55 && v.oxy.dComp <= 85, `seed ${seed}: compensation ${v.oxy.dComp}`);
    const green = v.starch.cells.VARIEGATED.filter((c) => c.green).length;
    assert.ok(green >= 15 && green <= v.starch.cells.VARIEGATED.length - 12, `seed ${seed}: variegated ${green}`);
  }
});

test('potometer: wind and light raise the rate, dark and humid air lower it; an air lock cuts it; changes settle exponentially', () => {
  const v = bioPlantVariant(42, 'POTOMETER').poto;
  const ok = { cut: 'WATER' as const, fit: 'WATER' as const, sealed: true };
  const still = potoTarget(v, ok, 'STILL');
  assert.ok(potoTarget(v, ok, 'FAN') > still * 1.8);
  assert.ok(potoTarget(v, ok, 'LAMP') > still * 1.3);
  assert.ok(potoTarget(v, ok, 'DARK') < still * 0.3);
  assert.ok(potoTarget(v, ok, 'HUMID') < still * 0.5);
  assert.ok(potoTarget(v, { ...ok, cut: 'AIR' }, 'STILL') < still * 0.4, 'cut in air: air lock');
  // After switching on the fan the speed rises towards the new value, not at once.
  const w = { ...ok, conds: [{ cond: 'STILL' as const, at: 0 }, { cond: 'FAN' as const, at: 10 }] };
  assert.ok(Math.abs(potoSpeed(v, w, 9.9) - still) < 1e-6);
  const s1 = potoSpeed(v, w, 11);
  const s10 = potoSpeed(v, w, 20);
  assert.ok(s1 > still && s1 < s10 && s10 <= potoTarget(v, ok, 'FAN') + 1e-9);
  // Time over 30 mm ≈ 30 ÷ speed when steady.
  assert.ok(Math.abs(potoRunMinutes(v, w, 60) - 30 / potoTarget(v, ok, 'FAN')) < 1e-3);
});

test('oxygen: intensity ∝ 1/d², a saturating curve with a compensation point; heat and CO₂ matter; the gas relights a splint', () => {
  const v = bioPlantVariant(9, 'OXYGEN').oxy;
  assert.equal(oxyIntensity(10), 100);
  assert.equal(oxyIntensity(20), 25);
  const T = v.T0;
  const r = (d: number) => oxyNet(v, oxyIntensity(d), T);
  assert.ok(r(10) > r(20) && r(20) > r(40) && r(40) > r(50));
  // Saturating: quadrupling the intensity from 25 to 100 much less than quadruples the rate.
  assert.ok(r(10) / r(20) < 2.5);
  // Compensation point: none beyond it, some just inside it.
  assert.equal(oxyNet(v, oxyIntensity(v.dComp + 3), T), 0);
  assert.ok(oxyNet(v, oxyIntensity(v.dComp - 8), T) > 0);
  // CO₂ limits: no NaHCO₃ lowers the plateau.
  assert.ok(oxyNet(v, 100, T, { p: 0.35, k: 0.5 }) < r(10) * 0.5);
  const s = oxyModelState(bioPlantVariant(9, 'OXYGEN')).oxy;
  // A heat filter keeps the water near room temperature; without it the lamp warms it and the rate rises.
  assert.ok(oxyTemp(v, s, 30) - v.T0 < 1);
  const hot = { ...s, shield: false, moves: [{ d: 10, at: 0 }] };
  assert.ok(oxyTemp(v, hot, 40) - v.T0 > 3);
  assert.ok(oxyRate(v, hot, 40) > oxyRate(v, { ...hot, shield: true }, 40));
  // Room light keeps it bubbling where a dark room would not.
  const far = { ...s, moves: [{ d: 100, at: 0 }] };
  assert.equal(oxyRate(v, far, 20), 0);
  assert.ok(oxyRate(v, { ...far, dark: false }, 20) > 0);
  assert.equal(oxySplint(v, s)?.relit, true);
  assert.equal(oxySplint(v, { ...s, splintAt: 1 })?.relit, false);
});

test('starch: blue-black only where chlorophyll, light and CO₂ were; an undestarched plant has starch everywhere green', () => {
  const v = bioPlantVariant(5, 'STARCH');
  const w = { plant: 'DESTARCHED' as const };
  const leaf = (kind: (typeof LEAF_KINDS)[number]) => ({ kind, at: 6 });
  for (const c of v.starch.cells.VARIEGATED) assert.equal(starchIn(v.starch, w, leaf('VARIEGATED'), c) >= 0.5, c.green);
  for (const c of v.starch.cells.FOIL) if (c.light === 0) assert.equal(starchIn(v.starch, w, leaf('FOIL'), c), 0);
  for (const c of v.starch.cells.NOCO2) assert.ok(starchIn(v.starch, w, leaf('NOCO2'), c) < 0.25);
  for (const c of v.starch.cells.FOIL) assert.ok(starchIn(v.starch, { plant: 'WINDOW' }, leaf('FOIL'), c) >= 0.5);
  // Colours: blue-black where starch, yellow-brown where none, once boiled and decolourised.
  const done = { kind: 'FOIL' as const, at: 6, boiled: 60, boiledFirst: true, eth: 5, ethFlame: false, direct: false, soft: true, tile: true, iodine: true };
  const lit = v.starch.cells.FOIL.find((c) => c.light === 1)!;
  const dark = v.starch.cells.FOIL.find((c) => c.light === 0)!;
  const lum = (h: string) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
  assert.ok(lum(leafCellColour(v.starch, w, done, lit)) < 200, 'blue-black');
  assert.ok(lum(leafCellColour(v.starch, w, done, dark)) > 350, 'yellow-brown');
});

for (const task of ['POTOMETER', 'OXYGEN', 'STARCH'] as const) {
  test(`${task}: the model answer earns every AUTO mark across 40 seeds and validates`, () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = perfect[task](seed * 7919);
      assert.ok(bioPlantStateSchema.safeParse(s).success, `seed ${seed}: schema`);
      const out = bioPlantGrader.grade(s, seed * 7919);
      assert.equal(autoTotal(out), AUTO_MAX, `${task} seed ${seed}: ${out.auto.map((c) => `${c.id} ${c.awarded}/${c.max} ${c.note}`).join(' | ')}`);
      assert.equal(out.ai.length, 2);
      assert.ok(out.solution.length >= 3);
    }
  });
}

test('POTOMETER: typical mistakes lose the right marks', () => {
  const seed = 1234;
  const base = perfect.POTOMETER(seed);
  const g = (s: BioPlantState) => bioPlantGrader.grade(s, seed);
  // Cut in air: an air lock (procedure; the claims still hold).
  const air = clone(base);
  air.poto.cut = 'AIR';
  assert.equal(by(g(air), 'procedure').awarded, 3);
  // Not sealed: a leaking joint.
  const leak = clone(base);
  leak.poto.sealed = false;
  assert.equal(by(g(leak), 'procedure').awarded, 3);
  assert.ok(by(g(leak), 'readings').awarded < 4, 'the times recorded were never shown with a leak');
  // Timed straight after each change (no time to adjust).
  const soon = clone(base);
  soon.poto.runs = soon.poto.runs.map((r, i) => (i % 3 === 0 ? { ...r, at: soon.poto.conds.find((c) => c.cond === r.cond)!.at + 1 } : r));
  assert.equal(by(g(soon), 'procedure').awarded, 3);
  // Rate worked out from seconds, not minutes.
  const secs = clone(base);
  secs.poto.rows = secs.poto.rows.map((r) => (r.mean ? { ...r, rate: (30 / Number(r.mean)).toFixed(3) } : r));
  assert.equal(by(g(secs), 'presentation').awarded, 2);
  // Humid air "increases" transpiration; the uptake claim missing.
  const claims = clone(base);
  claims.poto.claims = ['WIND_UP', 'LIGHT_UP', 'DARK_DOWN', 'HUMID_UP'];
  assert.ok(by(g(claims), 'results').awarded <= 2.5);
  // No bar chart.
  const bars = clone(base);
  bars.poto.bars = [];
  assert.equal(by(g(bars), 'presentation').awarded, 2);
});

test('OXYGEN: typical mistakes lose the right marks', () => {
  const seed = 2468;
  const base = perfect.OXYGEN(seed);
  const g = (s: BioPlantState) => bioPlantGrader.grade(s, seed);
  // No heat filter: the counts change (the lamp warms the water) and the procedure mark goes.
  const hot = clone(base);
  hot.oxy.shield = false;
  assert.equal(by(g(hot), 'procedure').awarded, 3);
  assert.ok(by(g(hot), 'readings').awarded < 4);
  // Counted straight after moving the lamp.
  const soon = clone(base);
  soon.oxy.counts = soon.oxy.counts.map((c) => ({ at: c.at - 4 }));
  assert.ok(by(g(soon), 'procedure').awarded <= 3);
  // Dot to dot.
  const dot = clone(base);
  dot.oxy.curve = 'DOT';
  assert.equal(by(g(dot), 'presentation').awarded, 2);
  // 1/d instead of 1/d².
  const inv = clone(base);
  inv.oxy.rows = inv.oxy.rows.map((r) => ({ ...r, li: String(100 / r.d) }));
  assert.equal(by(g(inv), 'presentation').awarded, 2);
  // The gas is carbon dioxide.
  const co2 = clone(base);
  co2.oxy.claims = ['LIGHT_LIMITS_LOW', 'OTHER_LIMITS_HIGH', 'COMPENSATION', 'GAS_CO2'];
  assert.equal(by(g(co2), 'results').awarded, 4);
  // No splint test.
  const nosplint = clone(base);
  nosplint.oxy.splintAt = null;
  assert.ok(by(g(nosplint), 'results').awarded <= 3.5);
});

test('STARCH: typical mistakes lose the right marks', () => {
  const seed = 3579;
  const base = perfect.STARCH(seed);
  const g = (s: BioPlantState) => bioPlantGrader.grade(s, seed);
  // Ethanol put into the bath with the flame still lit: the safety mark.
  const flame = clone(base);
  flame.starch.leaves[0]!.ethFlame = true;
  assert.equal(by(g(flame), 'procedure').awarded, 3);
  const direct = clone(base);
  direct.starch.leaves[1]!.direct = true;
  assert.equal(by(g(direct), 'procedure').awarded, 3);
  // Not boiled: the iodine barely gets in; the observation and inference of that leaf go.
  const raw = clone(base);
  raw.starch.leaves[1]!.boiled = 0;
  raw.starch.leaves[1]!.boiledFirst = false;
  const o = g(raw);
  assert.equal(by(o, 'procedure').awarded, 3);
  assert.ok(by(o, 'results').awarded < 5);
  // The plant was not destarched: the foil-strip leaf turns blue-black all over.
  const win = clone(base);
  win.starch.plant = 'WINDOW';
  assert.ok(by(g(win), 'procedure').awarded <= 3);
  assert.ok(by(g(win), 'results').awarded < 5, 'the old inferences no longer follow');
  // Ethanol removes starch (misconception).
  const eth = clone(base);
  eth.starch.rows[1]!.claims = ['ETHANOL_STARCH'];
  assert.ok(by(g(eth), 'results').awarded <= 4.5);
  // Labels swapped; grid miscounted.
  const lab = clone(base);
  lab.starch.labels = [...STARCH_LABELS].reverse();
  lab.starch.grid.blue = String(Number(lab.starch.grid.blue) + 10);
  assert.equal(by(g(lab), 'presentation').awarded, 1);
  assert.equal(by(g(lab), 'readings').awarded, 1.5);
});

test('an empty attempt scores nothing and the schema rejects garbage', () => {
  for (const task of ['POTOMETER', 'OXYGEN', 'STARCH'] as const) {
    const s = { ...emptyBioPlantState(), task };
    assert.equal(autoTotal(bioPlantGrader.grade(s, 11)), 0, task);
  }
  const bad = (f: (s: BioPlantState) => unknown) => {
    const s = clone(perfect.OXYGEN(3)) as unknown as BioPlantState;
    f(s);
    return bioPlantStateSchema.safeParse(s).success;
  };
  assert.equal(bad(() => undefined), true);
  assert.equal(bad((s) => ((s as { task: string }).task = 'BOIL')), false);
  assert.equal(bad((s) => (s.oxy.moves[0]!.d = 33)), false);
  assert.equal(bad((s) => (s.oxy.clock = 9999)), false);
  assert.equal(bad((s) => ((s.poto as { cut: string }).cut = 'OIL')), false);
  assert.equal(bad((s) => (s.poto.rows = [])), false);
  assert.equal(bad((s) => ((s.starch.leaves as unknown[]) = [{ kind: 'ROOT' }])), false);
  assert.equal(bad((s) => (s.written.explain = 'x'.repeat(5000))), false);
  assert.equal(bioPlantStateSchema.safeParse({ v: 2 }).success, false);
});
