// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-geo-maps.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DRAINAGE_PATTERNS,
  GEO_CRITERIA,
  GEO_MAPS,
  GEO_PRACTICAL_TASKS,
  GEO_TASKS,
  contourCrossings,
  dist,
  emptyGeoMapsState,
  geoContours,
  geoFieldOk,
  geoHeight,
  geoMapsStateSchema,
  geoMapsVariant,
  geoModelState,
  geoSheet,
  polyLength,
  rubricTotal,
  type GeoMapsState,
  type GeoTask,
} from '@aischool/shared';
import { GRADERS } from '../src/practicals/graders';
import { geoMapsGrader } from '../src/practicals/graders/geo-maps';

type Out = ReturnType<typeof geoMapsGrader.grade>;
const by = (o: Out, id: string) => o.auto.find((c) => c.id === id)!;
const autoTotal = (o: Out) => o.auto.reduce((t, c) => t + c.awarded, 0);
const AUTO_MAX = GEO_MAPS.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const SEEDS = Array.from({ length: 40 }, (_, i) => 1000 + i * 7919);
const SEED = 424242;
function perfect(seed: number, task: GeoTask): GeoMapsState {
  const s = geoModelState(seed, task);
  s.written = { precautions: 'A sharp pencil was used and the ruler was read with zero on the point stated.', explain: 'Because of the reasons given.' };
  return s;
}
const grade = (s: GeoMapsState, seed = SEED) => geoMapsGrader.grade(s, seed);

test('the rubric totals 20 and the grader is registered', () => {
  assert.equal(rubricTotal(GEO_MAPS.rubric), 20);
  assert.equal(GRADERS['geo-maps'], geoMapsGrader);
  assert.deepEqual([...new Set(Object.values(GEO_PRACTICAL_TASKS))].sort(), [...GEO_TASKS].sort());
});

for (const task of GEO_TASKS) {
  test(`${task}: every task's marks add up to the rubric`, () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const { def } = geoMapsVariant(seed, task);
      for (const crit of GEO_CRITERIA) {
        const sum = [...def.builds, ...def.fields, ...def.choices].filter((x) => x.crit === crit).reduce((t, x) => t + x.marks, 0);
        assert.ok(Math.abs(sum - GEO_MAPS.rubric.find((c) => c.id === crit)!.marks) < 1e-6, `${task} ${crit}: ${sum}`);
      }
    }
  });
  test(`${task}: the model answer earns every mark over 40 seeds`, () => {
    for (const seed of SEEDS) {
      const s = perfect(seed, task);
      assert.equal(geoMapsStateSchema.safeParse(s).success, true, `${task} ${seed} schema: ${JSON.stringify(geoMapsStateSchema.safeParse(s).error?.issues[0])}`);
      const o = grade(s, seed);
      assert.equal(autoTotal(o), AUTO_MAX, `${task} ${seed}: ${JSON.stringify(o.auto.filter((c) => c.awarded < c.max))}`);
      assert.equal(o.ai.length, 2);
      const v = geoMapsVariant(seed, task);
      for (const st of v.def.steps) assert.equal(st.done(s), true, `${task} ${seed}: step ${st.id}`);
    }
  });
  test(`${task}: an empty attempt earns nothing and is the same every time`, () => {
    const s = emptyGeoMapsState();
    s.task = task;
    assert.equal(autoTotal(grade(s)), 0);
    assert.deepEqual(grade(perfect(SEED, task)).auto, grade(perfect(SEED, task)).auto);
  });
}

// ------------------------------------------------------------------ the land

test('the sheet is the same for a seed, differs between seeds, and every sheet has its landforms', () => {
  assert.deepEqual(geoSheet(77).roads[0]!.pts.slice(0, 5), geoSheet(77).roads[0]!.pts.slice(0, 5));
  assert.notDeepEqual(geoSheet(77).streams[0]!.pts[0], geoSheet(78).streams[0]!.pts[0]);
  for (const seed of SEEDS) {
    const s = geoSheet(seed);
    assert.ok(s.forest.length > 10 && s.roads.length >= 2 && s.settlements.length >= 6, `seed ${seed}`);
    for (const k of ['CONICAL', 'HILL', 'SADDLE', 'RIDGE', 'SPUR', 'PLATEAU', 'ESCARPMENT'] as const) assert.ok(s.relief[k], `${seed} ${k}`);
    // A summit is higher than the ground around it, and a saddle is a pass: lower than both summits.
    const c = s.relief.CONICAL!;
    const h = (p: [number, number]) => geoHeight(s, p[0], p[1]);
    for (const [dx, dy] of [[0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]] as const) assert.ok(h([c[0] + dx, c[1] + dy]) < h(c), `${seed} summit`);
    assert.ok(h(s.relief.SADDLE!) < h(c) && h(s.relief.SADDLE!) < h(s.relief.HILL!), `${seed} saddle`);
  }
});

test('rivers run downhill, in every drainage pattern', () => {
  for (const pattern of DRAINAGE_PATTERNS) {
    for (const seed of SEEDS.slice(0, 20)) {
      const s = geoSheet(seed, pattern);
      assert.ok(s.streams.some((x) => x.main), `${pattern} ${seed}`);
      for (const st of s.streams) {
        let low = Infinity;
        for (const p of st.pts) {
          const z = geoHeight(s, p[0], p[1]);
          assert.ok(z <= low + 6, `${pattern} ${seed}: a stream climbs ${z - low} m`);
          low = Math.min(low, z);
        }
      }
    }
  }
});

test('contours are drawn from the height function they claim to show', () => {
  const s = geoSheet(SEED);
  const c = geoContours(s);
  assert.ok(c.lines.length >= 5);
  for (const line of c.lines) {
    assert.equal(line.level % s.interval, 0);
    for (const path of line.paths.slice(0, 3)) for (const p of path.slice(0, 40)) assert.ok(Math.abs(geoHeight(s, p[0], p[1]) - line.level) < s.interval / 2, 'contour is off its level');
  }
  const a: [number, number] = [2, 3];
  const b: [number, number] = [17, 13];
  for (const x of contourCrossings(s, a, b)) {
    const t = x.d / dist(a, b);
    assert.ok(Math.abs(geoHeight(s, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) - x.h) < 2);
  }
  assert.ok(polyLength(s.roads[0]!.pts) > 10);
});

// ------------------------------------------------------------------ typical mistakes lose the right marks

const swapEntry = (task: GeoTask, id: string, fn: (raw: string) => string, seed = SEED) => {
  const s = perfect(seed, task);
  s.entries[id] = fn(s.entries[id]!);
  return s;
};

test('DISTANCE: an answer left in cm loses the calculation mark, not the reading; a wrong reading carries forward', () => {
  const v = geoMapsVariant(SEED, 'DISTANCE');
  const s = swapEntry('DISTANCE', 'st_km', () => perfect(SEED, 'DISTANCE').entries.st_cm!);
  if (v.sheet!.kmPerCm !== 1) {
    const o = grade(s);
    assert.equal(by(o, 'calculation').awarded, 3);
    assert.equal(by(o, 'readings').awarded, 4);
  }
  const t = perfect(SEED, 'DISTANCE');
  const wrong = Number(t.entries.st_cm) + 1;
  t.entries.st_cm = wrong.toFixed(1);
  t.entries.st_km = (wrong * v.sheet!.kmPerCm).toFixed(2);
  t.entries.sin = (Number(t.entries.rd_cm) / wrong).toFixed(2);
  t.entries.pct = ((Number(t.entries.rd_cm) / wrong - 1) * 100).toFixed(0);
  const o = grade(t);
  assert.equal(by(o, 'readings').awarded, 2, 'the bad reading loses its marks');
  assert.equal(by(o, 'calculation').awarded, 4, 'working from your own reading keeps its marks');
});

test('DISTANCE: typing the answers without laying the thread loses the construction marks', () => {
  const s = perfect(SEED, 'DISTANCE');
  s.runs = [];
  assert.equal(by(grade(s), 'construction').awarded, 2);
  s.rulers = [];
  assert.equal(by(grade(s), 'construction').awarded, 0);
  assert.equal(by(grade(s), 'readings').awarded, 4);
});

test('BEARING: anticlockwise, the wrong point and two-figure bearings all lose marks', () => {
  const clockwise = perfect(SEED, 'BEARING');
  const anti = (Math.round(360 - Number(clockwise.entries.ab)) + 360) % 360;
  let s = swapEntry('BEARING', 'ab', () => String(anti).padStart(3, '0'));
  assert.equal(by(grade(s), 'readings').awarded, 2);
  s = perfect(SEED, 'BEARING');
  s.entries.ab = s.entries.back_ab!;
  assert.equal(by(grade(s), 'readings').awarded, 2);
  s = perfect(SEED, 'BEARING');
  s.entries.ac = '65';
  const near = geoMapsVariant(SEED, 'BEARING').def.fields.find((f) => f.id === 'ac')!;
  near.truth = 65;
  assert.equal(geoFieldOk(near, s, []), false, 'three figures are required');
  near.truth = Number(clockwise.entries.ac);
  s = perfect(SEED, 'BEARING');
  s.protractors = s.protractors.map((p) => ({ c: p.t, t: p.c }));
  assert.equal(by(grade(s), 'construction').awarded, 0, 'the protractor must be centred on A');
  s = swapEntry('BEARING', 'back_ab', (x) => String((Number(x) + 40) % 360));
  assert.equal(by(grade(s), 'calculation').awarded, 2);
});

test('GRIDAREA: reversed references and a forgotten part-square rule lose marks', () => {
  let s = swapEntry('GRIDAREA', 'g6a', (x) => x.slice(3) + x.slice(0, 3));
  assert.equal(by(grade(s), 'readings').awarded, 2.5);
  s = perfect(SEED, 'GRIDAREA');
  s.entries.sq = String(Number(s.entries.full) + Number(s.entries.part));
  s.entries.area = '0.01';
  assert.equal(by(grade(s), 'calculation').awarded, 2);
  s = perfect(SEED, 'GRIDAREA');
  s.squares = {};
  assert.equal(by(grade(s), 'construction').awarded, 2);
});

test('GRADIENT: HE left in km, an upside-down gradient and the contour interval as VI lose marks', () => {
  const v = geoMapsVariant(SEED, 'GRADIENT');
  const p = perfect(SEED, 'GRADIENT');
  let s = swapEntry('GRADIENT', 'he', (x) => String(Number(x) / 1000));
  s.entries.one_in = p.entries.one_in!;
  s.entries.angle = p.entries.angle!;
  assert.ok(by(grade(s), 'calculation').awarded <= 3);
  s = swapEntry('GRADIENT', 'one_in', (x) => x.replace(/^1 in (.+)$/, '$1 in 1'));
  assert.equal(by(grade(s), 'calculation').awarded, 3);
  s = swapEntry('GRADIENT', 'vi', () => String(v.sheet!.interval));
  assert.equal(by(grade(s), 'calculation').awarded, 3);
  assert.ok(grade(swapEntry('GRADIENT', 'one_in', (x) => x.replace('1 in ', ''))).auto.every((c) => c.awarded === c.max), 'plain "n" is accepted');
});

test('PROFILE: missing contours, a ruled line and no labels lose marks; VE follows the student’s own scale', () => {
  let s = perfect(SEED, 'PROFILE');
  s.ticks = s.ticks.slice(0, Math.floor(s.ticks.length / 2));
  assert.ok(by(grade(s), 'construction').awarded < 4);
  s = perfect(SEED, 'PROFILE');
  s.sets.smooth = false;
  s.checks = [];
  assert.equal(by(grade(s), 'construction').awarded, 3.5);
  s = perfect(SEED, 'PROFILE');
  const v = geoMapsVariant(SEED, 'PROFILE');
  s.sets.vscale = 40;
  s.entries.ve = String(v.sheet!.denom / 4000);
  assert.equal(by(grade(s), 'calculation').awarded, 4);
  s = perfect(SEED, 'PROFILE');
  s.choices.vis = s.choices.vis === 'YES' ? 'NO' : 'YES';
  assert.equal(by(grade(s), 'interpretation').awarded, 1);
});

test('REDUCE: halving the area instead of the length, and an unfinished copy, lose marks', () => {
  const v = geoMapsVariant(SEED, 'REDUCE');
  const k = v.copy!.k;
  let s = perfect(SEED, 'REDUCE');
  s.entries.new_w = String(v.copy!.frame.w * Math.sqrt(k) );
  assert.equal(by(grade(s), 'readings').awarded, 3);
  s = perfect(SEED, 'REDUCE');
  s.entries.new_rf = `1:${v.sheet!.denom * k}`;
  assert.equal(by(grade(s), 'calculation').awarded, 2);
  s = perfect(SEED, 'REDUCE');
  s.lines.copy = s.lines.copy!.map(([x, y]) => [x + 3, y + 3]);
  s.checks = ['title'];
  assert.equal(by(grade(s), 'construction').awarded, 0.5);
});

test('BARS: a false zero, wrong bars and no labels lose construction marks', () => {
  let s = perfect(SEED, 'BARS');
  s.sets['ax:line:a:min'] = 100;
  assert.equal(by(grade(s), 'construction').awarded, 4.5);
  s = perfect(SEED, 'BARS');
  s.series['line.out'] = s.series['line.out']!.map((x) => x + 100);
  assert.equal(by(grade(s), 'construction').awarded, 3.5);
  s = perfect(SEED, 'BARS');
  s.checks = [];
  assert.equal(by(grade(s), 'construction').awarded, 4);
});

test('PIE: radius proportional to the value and sectors out of order lose marks', () => {
  const v = geoMapsVariant(SEED, 'PIE');
  let s = perfect(SEED, 'PIE');
  s.sets.r_a = v.pie!.radiusB * (v.pie!.placeA.value / v.pie!.placeB.value);
  s.entries.rad_a = String(s.sets.r_a);
  const o = grade(s);
  assert.equal(by(o, 'construction').awarded, 4);
  assert.equal(by(o, 'calculation').awarded, 2);
  s = perfect(SEED, 'PIE');
  s.seq.pie = [...s.seq.pie!].reverse();
  assert.ok(by(grade(s), 'construction').awarded < 3);
});

test('DOTS: dots in the swamp, and shading in the wrong class, lose marks', () => {
  const v = geoMapsVariant(SEED, 'DOTS');
  let s = perfect(SEED, 'DOTS');
  const r = v.outline!.regions[0]!;
  const i = s.pins.findIndex((p) => p.k === `dot:${r.id}`);
  s.pins[i]!.p = r.empty[0]!.map((x, k) => (x + (r.empty[4]![k]! - x) * 0.5)) as [number, number];
  assert.equal(by(grade(s), 'construction').awarded, 4.5);
  s = perfect(SEED, 'DOTS');
  for (const x of v.outline!.regions) s.sets[`shade:${x.id}`] = (Number(s.sets[`shade:${x.id}`]) + 1) % 4;
  assert.equal(by(grade(s), 'construction').awarded, 3.5);
});

test('CLIMATE: rainfall range for temperature range and a missing bar lose marks', () => {
  let s = swapEntry('CLIMATE', 'range', () => '300');
  assert.equal(by(grade(s), 'calculation').awarded, 3);
  s = perfect(SEED, 'CLIMATE');
  s.series['climo.rain'] = s.series['climo.rain']!.slice(0, 6);
  assert.equal(by(grade(s), 'construction').awarded, 4);
});

test('POPULATION: males on the wrong side of the data and per-1000 for per-cent lose marks', () => {
  let s = perfect(SEED, 'POPULATION');
  const m = s.series['pyr.m']!;
  s.series['pyr.m'] = s.series['pyr.m']!.map((x) => x * 2);
  assert.ok(by(grade(s), 'construction').awarded <= 3.5);
  s.series['pyr.m'] = m;
  s = swapEntry('POPULATION', 'ni', (x) => String(Number(x) * 10));
  s.entries.dbl = String(70 / (Number(s.entries.ni) || 1));
  assert.equal(by(grade(s), 'calculation').awarded, 3);
});

test('LONGTIME: subtracting for a place to the east, and pins in the wrong place, lose marks', () => {
  const s = perfect(SEED, 'LONGTIME');
  const v = geoMapsVariant(SEED, 'LONGTIME');
  const right = v.def.fields.find((f) => f.id === 'time')!;
  s.entries.time = `${String(Math.floor(((right.truth + 300) % 1440) / 60)).padStart(2, '0')}:00`;
  assert.equal(by(grade(s), 'calculation').awarded, 2);
  s.pins = s.pins.map((p) => ({ ...p, p: [p.p[0] + 40, p.p[1]] }));
  assert.equal(by(grade(s), 'construction').awarded, 2);
});

test('a time and a grid reference are read as students write them', () => {
  const s = perfect(SEED, 'LONGTIME');
  const v = geoMapsVariant(SEED, 'LONGTIME');
  const f = v.def.fields.find((x) => x.id === 'time')!;
  const h = Math.floor(f.truth / 60);
  const m = String(f.truth % 60).padStart(2, '0');
  for (const w of [`${h}:${m}`, `${h}.${m}`, `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${m} ${h >= 12 ? 'pm' : 'am'}`]) {
    s.entries.time = w;
    assert.equal(geoFieldOk(f, s, v.def.fields), true, w);
  }
});

// ------------------------------------------------------------------ the schema

test('the state schema rejects garbage', () => {
  const ok = perfect(SEED, 'DISTANCE');
  assert.equal(geoMapsStateSchema.safeParse(ok).success, true);
  const bad: ((s: Record<string, unknown>) => void)[] = [
    (s) => (s.v = 2),
    (s) => (s.task = 'FISHING'),
    (s) => (s.entries = { a: 1 }),
    (s) => (s.rulers = [{ a: [0, 0], b: [Number.NaN, 0] }]),
    (s) => (s.rulers = [{ a: [0, 0], b: [1e9, 0] }]),
    (s) => (s.runs = [{ tool: 'LASER', pts: [] }]),
    (s) => (s.squares = { '1,1': 'X' }),
    (s) => (s.pins = Array.from({ length: 500 }, () => ({ k: 'x', p: [0, 0] }))),
    (s) => (s.ticks = [{ d: -1, h: 0 }]),
    (s) => (s.written = { precautions: 'x'.repeat(5000), explain: '' }),
    (s) => (s.series = { a: ['1'] }),
    (s) => (s.sets = { a: { b: 1 } }),
    (s) => (s.entries = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`k${i}`, 'x']))),
    (s) => (s.lines = { a: Array.from({ length: 500 }, () => [0, 0]) }),
  ];
  for (const f of bad) {
    const s = clone(ok) as unknown as Record<string, unknown>;
    f(s);
    assert.equal(geoMapsStateSchema.safeParse(s).success, false, f.toString());
  }
});
