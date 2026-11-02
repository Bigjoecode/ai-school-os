// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-bio-ecology.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BIO_ECOLOGY,
  ECO_PRACTICAL_TASKS,
  QUAD_AREA,
  QUAD_HERBS,
  SOIL_DRAIN_TIMES,
  bioEcologyStateSchema,
  bioEcologyVariant,
  capFirstCatch,
  capModelState,
  capSecondCatch,
  emptyBioEcologyState,
  facModelState,
  facRH,
  facShown,
  facSix,
  facRain,
  quadCount,
  quadCover,
  quadModelState,
  rubricTotal,
  soilAirFinal,
  soilConstant,
  soilCrucibleMass,
  soilDrained,
  soilJarNow,
  soilModelState,
  type BioEcologyState,
  type EcoTask,
} from '@aischool/shared';
import { bioEcologyGrader } from '../src/practicals/graders/bio-ecology';
import { GRADERS } from '../src/practicals/graders';

type Out = ReturnType<typeof bioEcologyGrader.grade>;
const by = (out: Out, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: Out) => out.auto.reduce((t, c) => t + c.awarded, 0);
const AUTO_MAX = BIO_ECOLOGY.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const WRITTEN = { precautions: 'Quadrats were placed at random; the same time of day.', explain: 'Random sampling avoids bias and gives a representative sample.' };
const MODEL: Record<EcoTask, (seed: number) => BioEcologyState> = {
  QUADRAT: (seed) => ({ ...quadModelState(bioEcologyVariant(seed, 'QUADRAT')), written: WRITTEN }),
  CAPTURE: (seed) => ({ ...capModelState(bioEcologyVariant(seed, 'CAPTURE')), written: WRITTEN }),
  FACTORS: (seed) => ({ ...facModelState(bioEcologyVariant(seed, 'FACTORS')), written: WRITTEN }),
  SOIL: (seed) => ({ ...soilModelState(bioEcologyVariant(seed, 'SOIL')), written: WRITTEN }),
};
const detail = (out: Out) => out.auto.map((c) => `${c.id} ${c.awarded}/${c.max} ${c.note}`).join(' | ');

test('the rubric is 20 marks, registered, lessons mapped and the variant is the same for a seed', () => {
  assert.equal(rubricTotal(BIO_ECOLOGY.rubric), 20);
  assert.equal(GRADERS['bio-ecology'], bioEcologyGrader);
  assert.deepEqual(ECO_PRACTICAL_TASKS, { 'pr-bio-quadrat-sampling': 'QUADRAT', 'pr-bio-capture-recapture': 'CAPTURE', 'pr-bio-ecological-factors': 'FACTORS', 'pr-bio-soil-properties': 'SOIL' });
  assert.equal(JSON.stringify(bioEcologyVariant(777, 'SOIL')), JSON.stringify(bioEcologyVariant(777, 'SOIL')));
  assert.notEqual(JSON.stringify(bioEcologyVariant(777, 'SOIL').quad.plants.TRIDAX.slice(0, 5)), JSON.stringify(bioEcologyVariant(778, 'SOIL').quad.plants.TRIDAX.slice(0, 5)));
});

test('quadrat: clumped plants — densities in range, quadrat counts vary a lot, the edge rule brackets the count', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const v = bioEcologyVariant(seed * 31, 'QUADRAT').quad;
    const d = (h: (typeof QUAD_HERBS)[number]) => v.plants[h].length / QUAD_AREA;
    assert.ok(d('TRIDAX') > 1.2 && d('TRIDAX') < 4.5, `seed ${seed} tridax ${d('TRIDAX')}`);
    assert.ok(d('SIDA') > 0.3 && d('SIDA') < 1.6, `sida ${d('SIDA')}`);
    // Clumped: the variance of quadrat counts is well above the mean (Poisson would be equal).
    const counts: number[] = [];
    for (let x = 0; x < 20; x++) for (let y = 0; y < 20; y++) counts.push(quadCount(v, 'SIDA', x, y).exact);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length;
    assert.ok(variance > 2.5 * mean, `seed ${seed}: sida variance ${variance} mean ${mean}`);
    const c = quadCount(v, 'TRIDAX', 7, 9);
    assert.ok(c.strict <= c.exact && c.exact <= c.loose);
    const cov = quadCover(v, 3, 4);
    assert.ok(cov >= 0 && cov <= 100 && Number.isInteger(cov));
  }
});

test('capture–recapture: binomial samples; too soon underestimates; bright marks and a week overestimate', () => {
  let ok = 0;
  let soon = 0;
  let bright = 0;
  let week = 0;
  const runs = 60;
  for (let seed = 1; seed <= runs; seed++) {
    const v = bioEcologyVariant(seed * 101, 'CAPTURE').cap;
    assert.ok(v.N >= 150 && v.N <= 350);
    const n1 = capFirstCatch(v, 10);
    assert.ok(n1 > 0.15 * v.N && n1 < 0.45 * v.N, `n1 ${n1} of ${v.N}`);
    const est = (o: Partial<Parameters<typeof capSecondCatch>[1]>) => {
      const c = capSecondCatch(v, { firstEffort: 10, mark: 'DOT', release: 'SCATTER', effort: 10, t: 24, ...o });
      return (c.n1 * c.n2) / Math.max(1, c.m) / v.N;
    };
    ok += est({});
    soon += est({ t: 1 });
    bright += est({ mark: 'BRIGHT' });
    week += est({ t: 168 });
  }
  ok /= runs;
  soon /= runs;
  bright /= runs;
  week /= runs;
  assert.ok(ok > 0.92 && ok < 1.15, `proper method ratio ${ok}`);
  assert.ok(soon < 0.6, `too soon ${soon}`);
  assert.ok(bright > 1.2, `bright ${bright}`);
  assert.ok(week > 1.25, `week ${week}`);
});

test('factors: open warmer, brighter, windier, drier; sun on the bulb reads high; the humidity table; Six’s and rain accumulate if not reset', () => {
  assert.equal(Math.round(facRH(30, 26)), 73);
  for (let seed = 1; seed <= 20; seed++) {
    const v = bioEcologyVariant(seed * 13, 'FACTORS').fac;
    const at = (site: 'OPEN' | 'SHADE', inst: 'AIR' | 'LIGHT' | 'WIND' | 'HYGRO', shaded = true) => facShown(v, { day: 1, h: 11, site, inst, shaded }, 0);
    assert.ok(at('OPEN', 'AIR').value > at('SHADE', 'AIR').value);
    assert.ok(at('OPEN', 'LIGHT').value > 5 * at('SHADE', 'LIGHT').value);
    assert.ok(at('OPEN', 'WIND').value > at('SHADE', 'WIND').value);
    const ho = at('OPEN', 'HYGRO');
    const hs = at('SHADE', 'HYGRO');
    assert.ok(facRH(hs.dry!, hs.wet!) > facRH(ho.dry!, ho.wet!));
    assert.ok(at('OPEN', 'AIR', false).value >= at('OPEN', 'AIR').value + 1);
    const six2 = facSix(v, 2, [1]);
    const six2stuck = facSix(v, 2, []);
    assert.ok(six2stuck.max >= six2.max && six2stuck.min <= six2.min);
    assert.ok(facRain(v, 3, []) >= facRain(v, 3, [1, 2]));
  }
});

test('soil: layers settle by size; drainage sand > loam > clay; air and humus; constant mass after heating', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const v = bioEcologyVariant(seed * 17, 'SOIL').soil;
    const jar = { soil: 'LOAM' as const, shakenAt: 0 };
    const early = soilJarNow(v, jar, 0.5);
    const late = soilJarNow(v, jar, 24);
    assert.ok(early.layers.GRAVEL > 0.95 * late.layers.GRAVEL);
    assert.ok(early.layers.CLAY < 0.2 * late.layers.CLAY);
    assert.ok(early.cloudy > 0.9 && late.cloudy < 0.1);
    const f = (soil: 'SAND' | 'LOAM' | 'CLAY', t: number) => soilDrained(v, { soil, mass: 100, cotton: true }, t);
    assert.ok(f('SAND', 5) > f('LOAM', 5) && f('LOAM', 5) > f('CLAY', 5));
    assert.ok(f('SAND', 30) > f('LOAM', 30) && f('LOAM', 30) > f('CLAY', 30));
    assert.ok(soilAirFinal(v, { soil: 'CLAY', stirred: false, added: true }) > soilAirFinal(v, { soil: 'CLAY', stirred: true, added: true }));
    const cr = { soil: 'LOAM' as const, dried: true, soilIn: true, heats: 0, hot: false };
    const m = (k: number, hot = false) => soilCrucibleMass(v, 0, cr, { k, soilIn: true, hot });
    assert.ok(m(1) < m(0) && m(2) <= m(1) && m(3) <= m(2));
    assert.ok(m(2, true) < m(2));
    const damp = soilCrucibleMass(v, 0, { ...cr, dried: false }, { k: 0, soilIn: true, hot: false }) - soilCrucibleMass(v, 0, { ...cr, dried: false }, { k: 3, soilIn: true, hot: false });
    assert.ok(damp > m(0) - m(3) + 0.3, 'damp soil loses its water as well');
  }
});

for (const task of ['QUADRAT', 'CAPTURE', 'FACTORS', 'SOIL'] as const) {
  test(`${task}: the model answer earns every AUTO mark across 40 seeds and validates`, () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = MODEL[task](seed * 7919);
      const parsed = bioEcologyStateSchema.safeParse(s);
      assert.ok(parsed.success, `seed ${seed}: schema ${parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 2))}`);
      const out = bioEcologyGrader.grade(s, seed * 7919);
      assert.equal(autoTotal(out), AUTO_MAX, `${task} seed ${seed}: ${detail(out)}`);
      assert.equal(out.ai.length, 2);
      assert.ok(out.solution.length >= 3);
    }
  });
}

test('QUADRAT: sampling mistakes lose the right marks', () => {
  const seed = 4242;
  const base = MODEL.QUADRAT(seed);
  const g = (s: BioEcologyState) => bioEcologyGrader.grade(s, seed);
  // Placed by eye.
  const eye = clone(base);
  eye.quad.quads = eye.quad.quads.map((q) => ({ ...q, how: 'CHOSEN' as const }));
  assert.equal(by(g(eye), 'procedure').awarded, 2.5);
  assert.match(by(g(eye), 'procedure').note, /random/);
  // Too few quadrats (5): procedure and readings both suffer.
  const few = clone(MODEL.QUADRAT(seed));
  const v = bioEcologyVariant(seed, 'QUADRAT');
  const five = quadModelState(v, 5);
  few.quad = five.quad;
  assert.ok(by(g(few), 'procedure').awarded <= 2.5);
  assert.ok(by(g(few), 'readings').awarded <= 2);
  // Frequency worked out over only the quadrats with the herb.
  const freq = clone(base);
  for (const h of QUAD_HERBS) freq.quad.res[h].freq = '100';
  assert.ok(by(g(freq), 'results').awarded <= 4);
  // Density divided by the quadrats where it grew.
  const dens = clone(base);
  for (const h of QUAD_HERBS) {
    const counts = dens.quad.rows.map((r) => Number(r[h]));
    dens.quad.res[h].density = String(counts.reduce((a, b) => a + b, 0) / Math.max(1, counts.filter((c) => c > 0).length));
  }
  assert.ok(by(g(dens), 'results').awarded < 5);
  // Not examined: no credit for the counts.
  const blind = clone(base);
  blind.quad.looked = [];
  assert.equal(by(g(blind), 'readings').awarded, 0);
});

test('CAPTURE: harmful or visible marks, recapture too soon, wrong formula', () => {
  const seed = 9090;
  const v = bioEcologyVariant(seed, 'CAPTURE');
  const g = (s: BioEcologyState) => bioEcologyGrader.grade(s, seed);
  const w = (s: BioEcologyState) => ({ ...s, written: WRITTEN });
  assert.equal(by(g(w(capModelState(v, { mark: 'BRIGHT' }))), 'procedure').awarded, 3);
  assert.match(by(g(w(capModelState(v, { mark: 'BRIGHT' }))), 'procedure').note, /predator|birds/);
  assert.equal(by(g(w(capModelState(v, { mark: 'CLIP' }))), 'procedure').awarded, 3);
  assert.equal(by(g(w(capModelState(v, { wait: 1 }))), 'procedure').awarded, 3);
  assert.match(by(g(w(capModelState(v, { wait: 1 }))), 'procedure').note, /too soon/);
  assert.equal(by(g(w(capModelState(v, { wait: 168 }))), 'procedure').awarded, 3);
  assert.equal(by(g(w(capModelState(v, { release: 'CORNER' }))), 'procedure').awarded, 3.5);
  const wrong = w(capModelState(v));
  wrong.cap.formula = 'B';
  wrong.cap.N = String(Math.round((Number(wrong.cap.n1) * Number(wrong.cap.m)) / Number(wrong.cap.n2)));
  assert.ok(by(g(wrong), 'presentation').awarded <= 0.5);
  const assume = w(capModelState(v));
  assume.cap.assume = ['EASIER', 'GROWING'];
  assert.equal(by(g(assume), 'results').awarded, 3);
  const miscount = w(capModelState(v));
  miscount.cap.m = String(Number(miscount.cap.m) + 4);
  assert.ok(by(g(miscount), 'readings').awarded <= 3);
});

test('FACTORS: thermometers in the sun, readings hours apart, Six’s not reset', () => {
  const seed = 5151;
  const g = (s: BioEcologyState) => bioEcologyGrader.grade(s, seed);
  const base = MODEL.FACTORS(seed);
  const sun = clone(base);
  sun.fac.reads = sun.fac.reads.map((r) => (r.site === 'OPEN' ? { ...r, shaded: false } : r));
  assert.equal(by(g(sun), 'procedure').awarded, 3);
  assert.match(by(g(sun), 'procedure').note, /direct sunlight/);
  assert.ok(by(g(sun), 'readings').awarded < 4, 'the recorded values were not what the sunny thermometer showed');
  const apart = clone(base);
  apart.fac.reads = apart.fac.reads.map((r) => (r.site === 'SHADE' ? { ...r, h: r.h + 4 } : r));
  assert.equal(by(g(apart), 'procedure').awarded, 3);
  const stuck = clone(base);
  stuck.fac.resets = [];
  assert.equal(by(g(stuck), 'procedure').awarded, 3.5);
  const badRH = clone(base);
  for (const site of ['OPEN', 'SHADE'] as const) badRH.fac.rows[site] = badRH.fac.rows[site].map((r) => (r.rh ? { ...r, rh: String(Number(r.dry) - Number(r.wet)) } : r));
  assert.ok(by(g(badRH), 'presentation').awarded <= 1.5);
});

test('SOIL: unequal masses, no cotton wool, damp soil, not to constant mass, retained confused with drained', () => {
  const seed = 6262;
  const g = (s: BioEcologyState) => bioEcologyGrader.grade(s, seed);
  const base = MODEL.SOIL(seed);
  const mass = clone(base);
  mass.soil.funnels[0]!.mass = 50;
  assert.equal(by(g(mass), 'procedure').awarded, 3.5);
  const cotton = clone(base);
  cotton.soil.funnels = cotton.soil.funnels.map((f) => ({ ...f, cotton: false }));
  assert.equal(by(g(cotton), 'procedure').awarded, 3.5);
  const damp = clone(base);
  damp.soil.crucibles = damp.soil.crucibles.map((c) => ({ ...c, dried: false }));
  assert.ok(by(g(damp), 'procedure').awarded <= 3.5);
  const once = clone(base);
  once.soil.weighs = once.soil.weighs.filter((x) => x.k <= 1);
  once.soil.hRows = once.soil.hRows.map((r) => ({ ...r, after: r.after.slice(0, 1) }));
  assert.equal(by(g(once), 'procedure').awarded, 3);
  const confused = clone(base);
  confused.soil.retained = confused.soil.dRows.map((r) => r[SOIL_DRAIN_TIMES.length - 1]!);
  assert.equal(by(g(confused), 'results').awarded, 4);
  const v = bioEcologyVariant(seed, 'SOIL');
  assert.ok(soilConstant(v.soil, base.soil, 0));
});

test('the state schema rejects garbage', () => {
  assert.ok(bioEcologyStateSchema.safeParse(emptyBioEcologyState()).success);
  const bad = (f: (s: BioEcologyState) => unknown) => {
    const s = clone(emptyBioEcologyState()) as unknown as BioEcologyState;
    f(s);
    return bioEcologyStateSchema.safeParse(s).success;
  };
  assert.equal(bad((s) => ((s as unknown as { task: string }).task = 'POTATO')), false);
  assert.equal(bad((s) => s.quad.quads.push({ x: 25, y: 3, how: 'RANDOM' })), false);
  assert.equal(bad((s) => (s.cap.first = { effort: 7 })), false);
  assert.equal(bad((s) => (s.fac.day = 9)), false);
  assert.equal(bad((s) => s.soil.funnels.push({ soil: 'SAND', mass: 75, cotton: true })), false);
  assert.equal(bad((s) => (s.written.explain = 'x'.repeat(3000))), false);
  assert.equal(bad((s) => s.soil.dRows.push(['1', '2'])), false);
});
