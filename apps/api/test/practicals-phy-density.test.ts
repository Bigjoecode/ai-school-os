// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-phy-density.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FLOAT_CARD,
  PHY_DENSITY,
  SIMULATOR_STATE_SCHEMAS,
  ballVolume,
  bottleMass,
  calIndicated,
  calRead,
  densityUpthrust,
  densityWaterAt,
  emptyBottle,
  emptyPhyDensityState,
  floatDepth,
  floatLine,
  floatReading,
  floatSinks,
  phyDensityStateSchema,
  phyDensityVariant,
  phyFit,
  rubricTotal,
  sbReading,
  stoneRD,
  stoneWeight,
  tubeArea,
  type BottleSnap,
  type CalObj,
  type CalTool,
  type PhyDensityState,
  type SbRead,
} from '@aischool/shared';
import { densityUnit, phyDensityGrader } from '../src/practicals/graders/phy-density';
import type { GraderOutput } from '../src/practicals/graders/types';

const by = (out: GraderOutput, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: GraderOutput) => out.auto.reduce((t, c) => t + c.awarded, 0);
const autoMax = PHY_DENSITY.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
const lost = (out: GraderOutput) => out.auto.filter((c) => c.awarded < c.max).map((c) => `${c.id}: ${c.note}`).join(' | ');
const r1 = (x: number) => Math.round(x * 10) / 10;
const lineThrough = (pts: { x: number; y: number }[]) => {
  const f = phyFit(pts)!;
  const xs = pts.map((p) => p.x);
  const x1 = Math.min(...xs);
  const x2 = Math.max(...xs);
  return { x1, y1: f.intercept + f.slope * x1, x2, y2: f.intercept + f.slope * x2 };
};
const mean = (xs: number[]) => xs.reduce((t, x) => t + x, 0) / xs.length;

// ------------------------------------------------------------------ calipers

function cal(seed: number, o: { forced?: boolean; parallax?: boolean; addZero?: boolean; halfMm?: boolean; places?: number; noZero?: boolean } = {}): PhyDensityState {
  const v = phyDensityVariant(seed);
  const s = emptyPhyDensityState();
  s.task = 'CAL';
  const R = (tool: CalTool, obj: CalObj | null, pos: number, forced = false) => ({ tool, obj, pos, forced, eyeOk: !o.parallax, inside: false });
  const places = Array.from({ length: 3 }, (_, i) => i % (o.places ?? 3));
  if (!o.noZero) s.cal.push(R('V', null, 0));
  s.cal.push(...places.map((p) => R('V', 'cyl', p)));
  s.cal.push(R('M', null, 0));
  s.cal.push(...places.map((p) => R('M', 'ball', p, !!o.forced)));
  const c = places.map((p) => calRead(calIndicated(v, 'V', 'cyl', p)));
  const b = places.map((p) => calRead(calIndicated(v, 'M', 'ball', p, !!o.forced)) - (o.halfMm ? 0.5 : 0));
  const zv = o.noZero ? 0 : calRead(v.zv);
  const zm = calRead(v.zm);
  s.cells = { zv: zv.toFixed(2), zm: zm.toFixed(2), c1: c[0]!.toFixed(2), c2: c[1]!.toFixed(2), c3: c[2]!.toFixed(2), cm: mean(c).toFixed(3), b1: b[0]!.toFixed(2), b2: b[1]!.toFixed(2), b3: b[2]!.toFixed(2), bm: mean(b).toFixed(3) };
  const sign = o.addZero ? -1 : 1;
  const dc = mean(c) - sign * zv;
  const db = mean(b) - sign * zm;
  s.answers.dcyl = { value: dc.toFixed(3), unit: 'cm' };
  s.answers.dball = { value: db.toFixed(3), unit: 'mm' };
  s.answers.vol = { value: ballVolume(db).toPrecision(3), unit: 'cm³' };
  s.written.precautions = 'I corrected for the zero error and used the ratchet so the ball was not squeezed. I read the scales with my eye perpendicular to avoid parallax.';
  return s;
}

// ------------------------------------------------------------------ Archimedes

function arch(seed: number, o: { touch?: boolean; bubbles?: boolean; noZero?: boolean; wet?: boolean; lowCan?: boolean; byW2?: boolean; rdUnit?: string } = {}): PhyDensityState {
  const v = phyDensityVariant(seed);
  const s = emptyPhyDensityState();
  s.task = 'ARCH';
  s.zeroed = !o.noZero;
  const rd = (where: SbRead['where']): SbRead => ({ where, depth: where !== 'air' && o.touch ? 'touch' : 'full', bubbles: where !== 'air' && !!o.bubbles, zeroed: !o.noZero, eyeOk: true, wet: where === 'salt' && !!o.wet });
  s.sb = [rd('air'), rd('water'), rd('salt')];
  const [w1, w2, w3] = s.sb.map((r) => Math.round(sbReading(v, r) * 100) / 100) as [number, number, number];
  const water = o.lowCan ? v.stoneV - v.deficit : v.stoneV;
  const mb = r1(v.beakerG);
  const mbw = r1(v.beakerG + (water * v.rhoW) / 1000);
  s.weighs = [
    { item: 'beaker', riders: mb, water: 0, bottle: null },
    { item: 'beaker', riders: mbw, water, bottle: null },
  ];
  s.cells = { w1: w1.toFixed(2), w2: w2.toFixed(2), w3: w3.toFixed(2), mb: mb.toFixed(1), mbw: mbw.toFixed(1) };
  s.answers.up = { value: (w1 - w2).toFixed(2), unit: 'N' };
  s.answers.wdisp = { value: (((mbw - mb) / 1000) * 9.8).toFixed(2), unit: 'N' };
  s.answers.rds = { value: (w1 / (o.byW2 ? w2 : w1 - w2)).toFixed(3), unit: o.rdUnit ?? '' };
  s.answers.rdl = { value: ((w1 - w3) / (w1 - w2)).toFixed(3), unit: '' };
  s.written.precautions = 'The stone was fully immersed and not touching the can. The eureka can was filled to the spout and allowed to stop dripping.';
  return s;
}

// ------------------------------------------------------------------ flotation

function float(seed: number, o: { touch?: number; parallax?: boolean; inner?: boolean; meniscusTop?: boolean; loads?: number[]; noWeigh?: boolean } = {}): PhyDensityState {
  const v = phyDensityVariant(seed);
  const s = emptyPhyDensityState();
  s.task = 'FLOAT';
  s.cal = [
    { tool: 'V', obj: null, pos: 0, forced: false, eyeOk: true, inside: false },
    { tool: 'V', obj: 'tube', pos: 0, forced: false, eyeOk: true, inside: !!o.inner },
  ];
  const D = calRead(calIndicated(v, 'V', 'tube', 0, false, !!o.inner)) - calRead(v.zv);
  if (!o.noWeigh) s.weighs = [{ item: 'tube', riders: r1(v.tubeM), water: 0, bottle: null }];
  s.cells = { D: D.toFixed(2), mt: r1(v.tubeM).toFixed(1) };
  for (const load of o.loads ?? FLOAT_CARD) {
    const touching = o.touch === load;
    s.depths.push({ load, touching, eyeOk: !o.parallax });
    s.rows.push(load);
    s.float.push({ m: String(load * 10), h: (floatReading(v, load, touching) + (o.meniscusTop ? v.meniscus : 0)).toFixed(1) });
  }
  const pts = s.float.map((r) => ({ x: Number(r.m), y: Number(r.h) }));
  s.line = lineThrough(pts);
  const fit = phyFit(pts)!;
  const A = (Math.PI * D ** 2) / 4;
  const slope = Number(fit.slope.toPrecision(3));
  const rho = 1 / (Number(A.toFixed(2)) * slope);
  s.answers.area = { value: A.toFixed(2), unit: 'cm²' };
  s.answers.slope = { value: String(slope), unit: 'cm g⁻¹' };
  s.answers.rho = { value: rho.toFixed(3), unit: 'g cm⁻³' };
  s.answers.mtube = { value: (rho * A * fit.intercept).toFixed(1), unit: 'g' };
  s.written.precautions = 'The tube floated upright without touching the sides. I read the depth with my eye level with the bottom of the meniscus.';
  return s;
}

// ------------------------------------------------------------------ density bottle

function bottle(seed: number, o: { grains?: boolean; wetInside?: boolean; notCap?: boolean; wetOutside?: boolean; noTemp?: boolean; rdUnit?: string; bubble?: boolean } = {}): PhyDensityState {
  const v = phyDensityVariant(seed);
  const s = emptyPhyDensityState();
  s.task = 'BOTTLE';
  s.sample = o.grains ? 'grains' : 'liquid';
  s.tempRead = !o.noTemp;
  const B = (p: Partial<BottleSnap>): BottleSnap => ({ ...emptyBottle(), ...p });
  const fullOk = { toCap: !o.notCap, outsideWet: !!o.wetOutside, bubble: !!o.bubble };
  const snaps: Record<string, BottleSnap> = o.grains
    ? { m1: B({}), m2: B({ sand: 3 }), m3: B({ sand: 3, fill: 'water', ...fullOk }), m4: B({ fill: 'water', ...fullOk }) }
    : { m1: B({}), m2: B({ fill: 'water', ...fullOk }), m3: B({ fill: 'liquid', film: o.wetInside ? 'water' : 'none', ...fullOk }) };
  const m: Record<string, number> = {};
  for (const [id, b] of Object.entries(snaps)) {
    m[id] = r1(bottleMass(v, b));
    s.weighs.push({ item: 'bottle', riders: m[id]!, water: 0, bottle: b });
    s.cells[id] = m[id]!.toFixed(1);
  }
  s.cells.T = v.tempC.toFixed(1);
  const mw = o.grains ? m.m4! - m.m1! - (m.m3! - m.m2!) : m.m2! - m.m1!;
  const ml = o.grains ? m.m2! - m.m1! : m.m3! - m.m1!;
  const rd = Number((ml / mw).toFixed(3));
  s.answers.mw = { value: mw.toFixed(1), unit: 'g' };
  s.answers.ml = { value: ml.toFixed(1), unit: 'g' };
  s.answers.rd = { value: rd.toFixed(3), unit: o.rdUnit ?? '' };
  s.answers.rho = { value: (rd * 1000).toFixed(0), unit: 'kg m⁻³' };
  s.written.precautions = 'The bottle was dried before each filling and the outside wiped dry before weighing. It was filled to the capillary with no air bubbles.';
  return s;
}

test('density: rubric 20; seeded variants; the physics', () => {
  assert.equal(rubricTotal(PHY_DENSITY.rubric), 20);
  assert.deepEqual(phyDensityVariant(9), phyDensityVariant(9));
  assert.notDeepEqual(phyDensityVariant(9), phyDensityVariant(10));
  // water: 997.05 at 25 °C, 995.65 at 30 °C
  assert.ok(Math.abs(densityWaterAt(25) - 997.05) < 0.05 && Math.abs(densityWaterAt(30) - 995.65) < 0.05 && Math.abs(densityWaterAt(4) - 999.97) < 0.02);
  for (let seed = 1; seed < 600; seed += 13) {
    const v = phyDensityVariant(seed);
    assert.ok(v.zv !== 0 && v.zm !== 0 && Math.abs(v.zv) <= 0.04 && Math.abs(v.zm) <= 0.04);
    assert.ok(Math.abs(calIndicated(v, 'V', null, 0) - v.zv) < 1e-12 && Math.abs(calIndicated(v, 'M', 'ball', 2) - (v.ball[2]! + v.zm)) < 1e-12);
    assert.ok(calIndicated(v, 'M', 'ball', 1, true) < calIndicated(v, 'M', 'ball', 1));
    // Archimedes: upthrust = weight of water displaced; the loss in salt solution is RD times larger
    const W = stoneWeight(v);
    assert.ok(W > 4 && W < 8 && Math.abs(densityUpthrust(v, 'salt') / densityUpthrust(v, 'water') - v.saltRD) < 1e-9);
    assert.ok(Math.abs(W / densityUpthrust(v, 'water') - stoneRD(v)) < 1e-9);
    const free = sbReading(v, { where: 'water', depth: 'full', bubbles: false, zeroed: true });
    assert.ok(sbReading(v, { where: 'water', depth: 'touch', bubbles: false, zeroed: true }) < free && sbReading(v, { where: 'water', depth: 'full', bubbles: true, zeroed: true }) < free);
    assert.ok(Math.abs(sbReading(v, { where: 'air', depth: 'full', bubbles: false, zeroed: false }) - W - v.sbZero) < 1e-9);
    // flotation: ρAh = M, linear in the load; the card's loads float, eight scoops sink
    const L = floatLine(v);
    for (const load of FLOAT_CARD) {
      assert.ok(Math.abs(floatDepth(v, load) * (v.rhoW / 1000) * tubeArea(v) - (v.tubeM + v.shots.slice(0, load).reduce((t, x) => t + x, 0))) < 1e-9);
      assert.ok(!floatSinks(v, load), `seed ${seed} load ${load} ${floatDepth(v, load)}`);
      assert.ok(Math.abs(floatDepth(v, load) - (L.intercept + L.slope * load * 10)) < 0.1);
    }
    assert.ok(floatSinks(v, 10));
    // bottle: the capillary, a film of water, drops outside and a bubble each change the mass the right way
    const water = bottleMass(v, { ...emptyBottle(), fill: 'water', toCap: true });
    assert.ok(Math.abs(water - v.bottleM - (v.bottleV * v.rhoW) / 1000) < 1e-9);
    assert.ok(bottleMass(v, { ...emptyBottle(), fill: 'water', toCap: false }) < water && bottleMass(v, { ...emptyBottle(), fill: 'water', toCap: true, outsideWet: true }) > water && bottleMass(v, { ...emptyBottle(), fill: 'water', toCap: true, bubble: true }) < water);
    const kero = bottleMass(v, { ...emptyBottle(), fill: 'liquid', toCap: true });
    assert.ok(bottleMass(v, { ...emptyBottle(), fill: 'liquid', toCap: true, film: 'water' }) > kero);
    assert.ok(Math.abs((kero - v.bottleM) / (water - v.bottleM) - v.liquidRD) < 1e-9);
  }
});

test('density: units as students write them', () => {
  for (const u of ['cm³', 'cm3', 'cm^3', 'ml']) assert.equal(densityUnit(u), 'cm3', u);
  for (const u of ['g cm⁻³', 'g/cm3', 'gcm-3', 'g/ml']) assert.equal(densityUnit(u), 'g/cm3', u);
  for (const u of ['kg m⁻³', 'kg/m3', 'kgm-3']) assert.equal(densityUnit(u), 'kg/m3', u);
  for (const u of ['cm g⁻¹', 'cm/g']) assert.equal(densityUnit(u), 'cm/g', u);
  assert.equal(densityUnit('cm²'), 'cm2');
  assert.equal(densityUnit('mm'), 'mm');
  assert.equal(densityUnit('N'), 'N');
  assert.equal(densityUnit('no unit'), 'none');
});

test('density: exact work earns every AUTO mark in all four tasks across 40 seeds', () => {
  for (let i = 0; i < 40; i++) {
    const seed = 5 + i * 7919;
    for (const s of [cal(seed), arch(seed), float(seed), bottle(seed), bottle(seed, { grains: true })]) {
      assert.ok(phyDensityStateSchema.safeParse(s).success, `${s.task} schema ${JSON.stringify(phyDensityStateSchema.safeParse(s).error?.issues?.[0])}`);
      assert.ok(SIMULATOR_STATE_SCHEMAS['phy-density'].safeParse(s).success);
      const out = phyDensityGrader.grade(s, seed);
      assert.equal(autoTotal(out), autoMax, `seed ${seed} ${s.task}: ${lost(out)}`);
      assert.equal(out.ai.length, 1);
      assert.ok(out.solution.length >= 2);
    }
  }
});

test('density: typical mistakes lose the right marks', () => {
  const seed = 4242;
  const g = (s: PhyDensityState) => phyDensityGrader.grade(s, seed);
  // calipers
  assert.equal(by(g(cal(seed, { forced: true })), 'care').awarded, 1);
  assert.equal(by(g(cal(seed, { parallax: true })), 'care').awarded, 1);
  const added = g(cal(seed, { addZero: true }));
  assert.equal(by(added, 'analysis').awarded, 1);
  assert.ok(by(added, 'calculations').awarded <= 2, lost(added));
  assert.equal(by(g(cal(seed, { halfMm: true })), 'readings').awarded, 3);
  assert.equal(by(g(cal(seed, { places: 2 })), 'procedure').awarded, 2);
  assert.equal(by(g(cal(seed, { noZero: true })), 'procedure').awarded, 3);
  // Archimedes
  const touch = g(arch(seed, { touch: true }));
  assert.equal(by(touch, 'care').awarded, 1);
  assert.ok(by(touch, 'calculations').awarded <= 3);
  assert.equal(by(g(arch(seed, { bubbles: true })), 'care').awarded, 1);
  assert.equal(by(g(arch(seed, { wet: true })), 'care').awarded, 1);
  assert.equal(by(g(arch(seed, { noZero: true })), 'procedure').awarded, 3);
  const low = g(arch(seed, { lowCan: true }));
  assert.equal(by(low, 'procedure').awarded, 3);
  assert.equal(by(low, 'analysis').awarded, 1);
  assert.equal(by(g(arch(seed, { byW2: true })), 'calculations').awarded, 2);
  assert.equal(by(g(arch(seed, { rdUnit: 'kg/m3' })), 'units').awarded, 0);
  // flotation
  assert.equal(by(g(float(seed, { touch: 3 })), 'care').awarded, 1);
  assert.equal(by(g(float(seed, { parallax: true })), 'care').awarded, 1);
  const inner = g(float(seed, { inner: true }));
  assert.ok(by(inner, 'calculations').awarded <= 2, lost(inner));
  assert.equal(by(g(float(seed, { meniscusTop: true })), 'readings').awarded, 4);
  assert.equal(by(g(float(seed, { loads: [1, 2, 3, 4] })), 'procedure').awarded, 2);
  assert.equal(by(g(float(seed, { noWeigh: true })), 'procedure').awarded, 3);
  // density bottle
  assert.equal(by(g(bottle(seed, { wetInside: true })), 'care').awarded, 1);
  const notCap = g(bottle(seed, { notCap: true }));
  assert.equal(by(notCap, 'care').awarded, 1);
  assert.ok(by(notCap, 'calculations').awarded <= 3);
  assert.equal(by(g(bottle(seed, { wetOutside: true })), 'care').awarded, 1);
  assert.equal(by(g(bottle(seed, { grains: true, bubble: true })), 'care').awarded, 1);
  const noT = g(bottle(seed, { noTemp: true }));
  assert.equal(by(noT, 'procedure').awarded, 3);
  assert.equal(by(g(bottle(seed, { rdUnit: 'g/cm3' })), 'units').awarded, 0);
  // empty attempts score nothing and do not throw
  for (const task of ['CAL', 'ARCH', 'FLOAT', 'BOTTLE'] as const) {
    const out = g({ ...emptyPhyDensityState(), task });
    assert.equal(autoTotal(out), 0, `${task}: ${lost(out)}`);
  }
  assert.equal(autoTotal(g(emptyPhyDensityState())), 0);
});

test('density: the state schema rejects garbage', () => {
  const ok = bottle(5);
  assert.ok(phyDensityStateSchema.safeParse(ok).success);
  for (const bad of [
    { ...ok, v: 2 },
    { ...ok, task: 'SINK' },
    { ...ok, load: 99 },
    { ...ok, pos: 7 },
    { ...ok, tool: 'X' },
    { ...ok, cal: [{ tool: 'V', obj: 'cyl' }] },
    { ...ok, bottle: { ...ok.bottle, fill: 'mercury' } },
    { ...ok, weighs: [{ item: 'bottle', riders: 999, water: 0, bottle: null }] },
    { ...ok, cells: { m1: 'x'.repeat(50) } },
    { ...ok, cells: { 'bad key!': '1' } },
    { ...ok, answers: { ...ok.answers, rd: { value: 3 } } },
    { ...ok, log: [{ t: -1, a: 'x' }] },
  ])
    assert.equal(phyDensityStateSchema.safeParse(bad).success, false, JSON.stringify(bad).slice(0, 80));
});
