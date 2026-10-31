// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-bio-osmosis.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BIO_OSMOSIS,
  OSMO_PRACTICAL_TASKS,
  PLAS_LABELS,
  agarClearTime,
  agarDepth,
  agarModelState,
  bioOsmosisStateSchema,
  bioOsmosisVariant,
  emptyBioOsmosisState,
  plasConc,
  plasCount,
  plasModelState,
  potatoEqPct,
  potatoModelState,
  potatoReading,
  potatoTruth,
  rubricTotal,
  type BioOsmosisState,
} from '@aischool/shared';
import { bioOsmosisGrader } from '../src/practicals/graders/bio-osmosis';
import { GRADERS } from '../src/practicals/graders';

type Out = ReturnType<typeof bioOsmosisGrader.grade>;
const by = (out: Out, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: Out) => out.auto.reduce((t, c) => t + c.awarded, 0);
const AUTO_MAX = BIO_OSMOSIS.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const WRITTEN = { precautions: 'All cylinders were cut from the same tuber; each was blotted before weighing.', explain: 'Water enters by osmosis through the partially permeable membrane so the cells become turgid; at the isotonic point there is no net movement.' };

const perfect = {
  POTATO: (seed: number) => ({ ...potatoModelState(bioOsmosisVariant(seed, 'POTATO')), written: WRITTEN }),
  PLASMOLYSIS: (seed: number) => ({ ...plasModelState(bioOsmosisVariant(seed, 'PLASMOLYSIS')), written: WRITTEN }),
  AGAR: (seed: number) => ({ ...agarModelState(bioOsmosisVariant(seed, 'AGAR')), written: WRITTEN }),
};

test('the rubric is 20 marks, registered, and the variant is the same for a seed', () => {
  assert.equal(rubricTotal(BIO_OSMOSIS.rubric), 20);
  assert.equal(GRADERS['bio-osmosis'], bioOsmosisGrader);
  assert.deepEqual(OSMO_PRACTICAL_TASKS, { 'pr-bio-osmosis-potato': 'POTATO', 'pr-bio-plasmolysis': 'PLASMOLYSIS', 'pr-bio-diffusion-agar-cubes': 'AGAR' });
  assert.equal(JSON.stringify(bioOsmosisVariant(777, 'POTATO')), JSON.stringify(bioOsmosisVariant(777, 'POTATO')));
  for (let seed = 1; seed <= 200; seed++) {
    const v = bioOsmosisVariant(seed, 'POTATO');
    assert.ok(v.potato.iso >= 0.25 && v.potato.iso <= 0.35, `seed ${seed}: iso ${v.potato.iso}`);
  }
});

test('potato: Δmass ∝ (ψ_cell − ψ_solution), approaching equilibrium with time, read to 1 mm and 0.01 g', () => {
  const v = bioOsmosisVariant(42, 'POTATO').potato;
  // Gains below the isotonic point, losses above it, none at it.
  assert.ok(potatoEqPct(v, 0, 0) > 5);
  assert.ok(potatoEqPct(v, 0, 0.8) < -10);
  assert.ok(Math.abs(potatoEqPct(v, 0, v.iso + v.cyl[0]!.isoShift)) < 1e-9);
  // Proportional to the difference (nearly linear): twice as far → about twice the change.
  const a = potatoEqPct(v, 0, v.iso + 0.1);
  const b = potatoEqPct(v, 0, v.iso + 0.2);
  assert.ok(b / a > 1.8 && b / a < 2.05);
  const c = { conc: 0, trimmed: true, placedAt: 0, removedAt: null, blotB: true, blotA: true };
  const at = (t: number) => potatoTruth(v, 0, c, t).pm;
  assert.ok(at(30) < at(60) && at(60) < at(120) && at(120) <= potatoEqPct(v, 0, 0) + 1e-9);
  assert.equal(at(0), 0);
  // Precision: whole millimetres and hundredths of a gram; an unblotted cylinder weighs more.
  const out = { ...c, removedAt: 60 };
  const r = potatoReading(v, 0, out, 60, 'A', true);
  assert.equal(r.length, Math.round(r.length));
  assert.equal(r.mass, Math.round(r.mass * 100) / 100);
  assert.ok(potatoReading(v, 0, out, 60, 'A', false).mass > r.mass + 0.05);
  // The trimmed cylinder is about 50 mm; the untrimmed one is not.
  assert.equal(potatoReading(v, 0, out, 60, 'B', true).length, 50);
  assert.ok(potatoReading(v, 0, { ...out, trimmed: false }, 60, 'B', true).length > 54);
});

test('plasmolysis: the strong solution mixes in over minutes; cells plasmolyse and recover', () => {
  const v = bioOsmosisVariant(9, 'PLASMOLYSIS');
  const s = plasModelState(v).plas;
  assert.ok(plasConc(v.plas, s, 3.5) < 0.3);
  assert.ok(plasConc(v.plas, s, 12) > 0.9);
  const early = plasCount(v.plas, s, 3.5);
  const late = plasCount(v.plas, s, 13);
  assert.ok(early.plasmolysed < late.plasmolysed);
  assert.ok(late.total >= 20 && late.total <= 45, `${late.total} cells counted`);
  assert.ok(late.plasmolysed / late.alive > 0.8);
  assert.ok(plasCount(v.plas, s, 26).plasmolysed < late.plasmolysed / 3);
  // A drop at the edge, not drawn under: little of it gets under the cover slip.
  const dropped = { ...s, irrigations: [{ to: 'SUCROSE' as const, at: 3, drawn: false }] };
  assert.ok(plasConc(v.plas, dropped, 13) < 0.5);
});

test('agar: depth ∝ √t; a cube clears at (a/k)²', () => {
  const v = bioOsmosisVariant(5, 'AGAR').agar;
  const cube = { size: 3 as const, placedAt: 0, cutAt: null };
  const d4 = agarDepth(v, 0, cube, 4);
  const d16 = agarDepth(v, 0, cube, 16);
  assert.ok(Math.abs(d16 / d4 - 2) < 1e-9);
  const w = { acid: 'FULL' as const };
  const t1 = agarClearTime(v, 0, { size: 1, placedAt: 0, cutAt: null }, w);
  const t2 = agarClearTime(v, 1, { size: 2, placedAt: 0, cutAt: null }, w);
  assert.ok(t2 / t1 > 3 && t2 / t1 < 5.5, `ratio ${t2 / t1}`);
  assert.ok(agarClearTime(v, 1, { size: 2, placedAt: 0, cutAt: null }, { acid: 'SHALLOW' }) > t2);
});

for (const task of ['POTATO', 'PLASMOLYSIS', 'AGAR'] as const) {
  test(`${task}: the model answer earns every AUTO mark across 40 seeds and validates`, () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = perfect[task](seed * 7919);
      assert.ok(bioOsmosisStateSchema.safeParse(s).success, `seed ${seed}: schema`);
      const out = bioOsmosisGrader.grade(s, seed * 7919);
      assert.equal(autoTotal(out), AUTO_MAX, `${task} seed ${seed}: ${out.auto.map((c) => `${c.id} ${c.awarded}/${c.max} ${c.note}`).join(' | ')}`);
      assert.equal(out.ai.length, 2);
      assert.ok(out.solution.length >= 3);
    }
  });
}

test('POTATO: typical mistakes lose the right marks', () => {
  const seed = 1234;
  const base = perfect.POTATO(seed);
  const g = (s: BioOsmosisState) => bioOsmosisGrader.grade(s, seed);
  // Not blotted after soaking: the procedure mark (and the readings stay right only as the balance showed them).
  const wet = clone(base);
  wet.potato.weighs = wet.potato.weighs.map((x) => (x.phase === 'A' ? { ...x, blotted: false } : x));
  assert.equal(by(g(wet), 'procedure').awarded, 3);
  assert.ok(by(g(wet), 'readings').awarded < 4, 'the blotted masses were never shown');
  // Using the final mass as the denominator.
  const denom = clone(base);
  denom.potato.rows = denom.potato.rows.map((r) => ({ ...r, pm: (((Number(r.m1) - Number(r.m0)) / Number(r.m1)) * 100).toFixed(1) }));
  assert.ok(by(g(denom), 'results').awarded <= 4.5);
  // Dropping the minus sign on the losses.
  const sign = clone(base);
  sign.potato.rows = sign.potato.rows.map((r) => ({ ...r, pm: r.pm.replace('-', '') }));
  assert.ok(by(g(sign), 'results').awarded < 5);
  assert.ok(by(g(sign), 'presentation').awarded < 3);
  // Soaked only 15 minutes.
  const quick = clone(base);
  quick.potato.cyl = quick.potato.cyl.map((c) => ({ ...c, removedAt: 15 }));
  assert.equal(by(g(quick), 'procedure').awarded, 3.5);
  // No line, no isotonic reading.
  const noLine = clone(base);
  noLine.potato.line = null;
  noLine.potato.iso = '';
  assert.equal(by(g(noLine), 'presentation').awarded, 1);
  assert.equal(by(g(noLine), 'results').awarded, 3.5);
  // Lengths written in cm, not mm.
  const cm = clone(base);
  cm.potato.rows = cm.potato.rows.map((r) => ({ ...r, l0: String(Number(r.l0) / 10), l1: String(Number(r.l1) / 10) }));
  assert.equal(by(g(cm), 'readings').awarded, 2);
  // Only three solutions, no water control.
  const few = clone(base);
  for (const k of ['cyl', 'rows'] as const) (few.potato[k] as unknown[]).splice(0, 3);
  few.potato.weighs = few.potato.weighs.filter((x) => x.cyl >= 3).map((x) => ({ ...x, cyl: x.cyl - 3 }));
  few.potato.measures = few.potato.measures.filter((x) => x.cyl >= 3).map((x) => ({ ...x, cyl: x.cyl - 3 }));
  assert.ok(by(g(few), 'procedure').awarded <= 3);
});

test('PLASMOLYSIS: typical mistakes lose the right marks', () => {
  const seed = 2468;
  const base = perfect.PLASMOLYSIS(seed);
  const g = (s: BioOsmosisState) => bioOsmosisGrader.grade(s, seed);
  // Not drawn under with filter paper.
  const drop = clone(base);
  drop.plas.irrigations[0]!.drawn = false;
  assert.ok(by(g(drop), 'procedure').awarded <= 3);
  // Counted too soon (1 minute after the strong solution).
  const soon = clone(base);
  soon.plas.captures[2]!.at = 4;
  assert.ok(by(g(soon), 'procedure').awarded <= 3);
  // The wall shrank (misconception) and wrong counts.
  const wall = clone(base);
  wall.plas.rows[1]!.claims = ['WALL_SHRANK'];
  wall.plas.count.plasmolysed = '3';
  const o = g(wall);
  assert.ok(by(o, 'results').awarded <= 4.5);
  assert.ok(by(o, 'readings').awarded <= 2.5);
  // Labels swapped.
  const labels = clone(base);
  labels.plas.labels = [...PLAS_LABELS].reverse();
  assert.equal(by(g(labels), 'presentation').awarded, 1);
  // No deplasmolysis step.
  const noBack = clone(base);
  noBack.plas.irrigations.pop();
  noBack.plas.captures.pop();
  assert.ok(by(g(noBack), 'procedure').awarded <= 3);
  assert.ok(by(g(noBack), 'results').awarded <= 3.5);
});

test('AGAR: typical mistakes lose the right marks', () => {
  const seed = 3579;
  const base = perfect.AGAR(seed);
  const g = (s: BioOsmosisState) => bioOsmosisGrader.grade(s, seed);
  // The larger cube has the larger ratio (misconception).
  const ratio = clone(base);
  ratio.agar.claims = ['LARGE_RATIO', 'RATIO_FASTER'];
  assert.equal(by(g(ratio), 'results').awarded, 3);
  // Ratios inverted (V : SA).
  const inv = clone(base);
  inv.agar.rows = inv.agar.rows.map((r) => ({ ...r, ratio: `1 : ${r.ratio.split(':')[0]!.trim()}` }));
  assert.equal(by(g(inv), 'presentation').awarded, 2);
  // Shallow acid (the 2 and 3 cm cubes not covered).
  const shallow = clone(base);
  shallow.agar.acid = 'SHALLOW';
  assert.equal(by(g(shallow), 'procedure').awarded, 3);
  // Times guessed rather than watched.
  const guess = clone(base);
  guess.agar.rows = guess.agar.rows.map((r) => ({ ...r, time: r.time ? String(Number(r.time) + 4) : '' }));
  assert.equal(by(g(guess), 'readings').awarded, 2);
  // Rate worked out as time ÷ depth.
  const rate = clone(base);
  rate.agar.depth.rate = String(Number(rate.agar.depth.time) / Number(rate.agar.depth.depth));
  assert.equal(by(g(rate), 'results').awarded, 4);
});

test('an empty attempt scores nothing and the schema rejects garbage', () => {
  for (const task of ['POTATO', 'PLASMOLYSIS', 'AGAR'] as const) {
    const s = { ...emptyBioOsmosisState(), task };
    assert.equal(autoTotal(bioOsmosisGrader.grade(s, 11)), 0, task);
  }
  const bad = (f: (s: BioOsmosisState) => unknown) => {
    const s = clone(perfect.POTATO(3)) as unknown as BioOsmosisState;
    f(s);
    return bioOsmosisStateSchema.safeParse(s).success;
  };
  assert.equal(bad(() => undefined), true);
  assert.equal(bad((s) => ((s as { task: string }).task = 'BOIL')), false);
  assert.equal(bad((s) => (s.potato.cyl[0]!.conc = 0.33)), false);
  assert.equal(bad((s) => (s.potato.clock = 999)), false);
  assert.equal(bad((s) => ((s.plas as { objective: number }).objective = 100)), false);
  assert.equal(bad((s) => ((s.agar as { cubes: unknown[] }).cubes = [{ size: 7, placedAt: 0, cutAt: null }])), false);
  assert.equal(bad((s) => (s.plas.rows = [])), false);
  assert.equal(bad((s) => (s.written.explain = 'x'.repeat(5000))), false);
  assert.equal(bioOsmosisStateSchema.safeParse({ v: 2 }).success, false);
});
