// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-phy-thermal.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PHY_THERMAL,
  THERM_TASKS,
  THERM_TIMES,
  emptyPhyThermalState,
  phyFit,
  phyThermalStateSchema,
  phyThermalVariant,
  thermColumn,
  thermCRef,
  thermExpansion,
  thermIdealExpansion,
  thermIndicates,
  thermSim,
  type PhyThermalState,
  type ThermEventCode,
  type ThermInstrument,
  type ThermTask,
} from '@aischool/shared';
import { phyThermalGrader } from '../src/practicals/graders/phy-thermal';
import type { GraderOutput } from '../src/practicals/graders/types';

const by = (out: GraderOutput, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: GraderOutput) => out.auto.reduce((t, c) => t + c.awarded, 0);
const autoMax = PHY_THERMAL.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
const lineOf = (pts: { x: number; y: number }[]) => {
  const fit = phyFit(pts)!;
  const xs = pts.map((p) => p.x);
  const a = Math.min(...xs);
  const b = Math.max(...xs);
  return { fit, line: { x1: a, y1: fit.intercept + fit.slope * a, x2: b, y2: fit.intercept + fit.slope * b } };
};
const r1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1);
const r2 = (x: number) => (Math.round(x * 100) / 100).toFixed(2);

/** Builds an attempt step by step on the lab clock: events, and reads whose value the "student" writes down. */
function bench(seed: number, task: ThermTask) {
  const v = phyThermalVariant(seed);
  const s = emptyPhyThermalState();
  s.task = task;
  s.log = [{ t: 0, a: `task:${task}` }];
  const ev = (t: number, e: ThermEventCode) => (s.events.push({ t, e }), s.log.push({ t: t * 1000, a: e }));
  let cache = { n: -1, sim: thermSim(v, []) };
  const phys = (t: number) => {
    if (cache.n !== s.events.length) cache = { n: s.events.length, sim: thermSim(v, s.events) };
    return cache.sim.at(t);
  };
  const read = (t: number, k: ThermInstrument) => {
    s.reads.push({ k, t });
    s.log.push({ t: t * 1000, a: `read:${k}` });
    return thermIndicates(v, phys(t), k, task, t);
  };
  return { v, s, ev, read, phys };
}

// ------------------------------------------------------------------ ideal builders

function expansion(seed: number, o: { thimble?: boolean; noBack?: boolean; early?: boolean; metres?: boolean } = {}): PhyThermalState {
  const { v, s, ev, read, phys } = bench(seed, 'EXPANSION');
  const touch = o.thimble ? 'micro:thimble' : 'micro:ratchet';
  const l0 = read(5, 'rule');
  s.cells.l0 = (Math.round(l0 * 2) / 2).toFixed(1);
  s.cells.th1 = r1(read(10, 'thermo'));
  ev(15, touch);
  s.cells.r1 = r2(read(16, 'micro'));
  if (!o.noBack) ev(20, 'micro:back');
  ev(25, 'boiler:on');
  const ideal = thermIdealExpansion(v);
  let t = 30;
  const want = o.early ? 0.85 : 0.998;
  // the rod's expansion with the micrometer backed off (the sim's expansion does not depend on it)
  while (thermExpansion(v, phys(t)) < want * ideal && t < 3000) t += 5;
  s.cells.th2 = r1(read(t, 'thermo'));
  if (o.noBack) ev(t + 1, 'micro:back');
  ev(t + 2, touch);
  s.cells.r2 = r2(read(t + 3, 'micro'));
  ev(t + 4, 'micro:back');
  ev(t + 60, touch);
  s.cells.r2b = r2(read(t + 61, 'micro'));
  ev(t + 62, 'micro:back');
  ev(t + 70, 'boiler:off');
  const e = Number(s.cells.r1) - Number(s.cells.r2);
  const dth = Number(s.cells.th2) - Number(s.cells.th1);
  s.cells.e = e.toFixed(2);
  s.cells.dth = dth.toFixed(1);
  const a = Number(s.cells.e) / ((o.metres ? Number(s.cells.l0) / 1000 : Number(s.cells.l0)) * Number(s.cells.dth));
  s.answers.alpha = { value: a.toPrecision(3), unit: 'K-1' };
  s.written.precautions = 'I waited until the thermometer reading was steady before the final reading. I used the ratchet of the micrometer to avoid over-tightening.';
  return s;
}

function charles(seed: number, o: { part?: boolean; hot?: boolean; few?: boolean; kelvin?: boolean } = {}): PhyThermalState {
  const { v, s, ev, read, phys } = bench(seed, 'CHARLES');
  ev(2, o.part ? 'immerse:part' : 'immerse:full');
  ev(3, 'stir');
  let t = 150;
  const row = () => {
    const th = read(t, 'thermo');
    const l = read(t + 2, 'column');
    const T = Number(r1(th)) + 273;
    s.rows.push({ key: s.rows.length, c: { th: r1(th), l: r2(l), T: T.toFixed(1), lT: (Number(r2(l)) / T).toPrecision(3) } });
  };
  ev(t - 20, 'stir');
  row();
  const targets = (o.few ? [50, 75] : [42, 57, 72, 87]).map((x) => x + (v.room - 28));
  for (const target of targets) {
    t += 5;
    ev(t, 'bunsen:on');
    while (phys(t).tw < target - 1.2 && t < 5000) t += 2;
    if (o.hot) {
      t += 2;
      ev(t, 'stir');
      t += 3;
      row();
      ev(t + 3, 'bunsen:off');
      t += 3;
      continue;
    }
    ev(t, 'bunsen:off');
    for (let k = 0; k <= 6; k++) ev(t + 2 + k * 10, 'stir');
    t += 80;
    row();
  }
  const pts = s.rows.map((r) => ({ x: Number(r.c.th), y: Number(r.c.l) }));
  const { fit, line } = lineOf(pts);
  s.line = line;
  s.answers.slope = { value: fit.slope.toPrecision(3), unit: 'cm/K' };
  s.answers.zero = { value: (-fit.intercept / fit.slope).toFixed(0), unit: '°C' };
  const lts = s.rows.map((r) => Number(r.c.l) / (Number(r.c.th) + 273));
  s.answers.ratio = { value: (lts.reduce((a, b) => a + b, 0) / lts.length).toPrecision(3), unit: 'cm K-1' };
  s.written.precautions = 'I removed the flame and stirred the water and waited for a steady temperature before each reading. The whole air column was immersed.';
  return s;
}

function electric(seed: number, o: { dry?: boolean; bare?: boolean; minutes?: boolean; grams?: boolean; noStir?: boolean; early?: boolean } = {}): PhyThermalState {
  const { s, ev, read } = bench(seed, 'ELECTRIC');
  ev(2, 'pan:on');
  s.cells.mc = r1(read(3, 'balance'));
  ev(4, 'pan:off');
  ev(6, 'pour');
  ev(8, 'pan:on');
  s.cells.mcw = r1(read(9, 'balance'));
  ev(10, 'pan:off');
  if (!o.bare) ev(12, 'lag:on');
  if (o.dry) {
    ev(12.5, 'wire:ok');
    ev(12.6, 'switch:on');
    ev(13.5, 'switch:off');
  }
  ev(14, 'heater:in');
  if (!o.bare) ev(15, 'lid:on');
  ev(16, 'wire:ok');
  if (!o.noStir) ev(17, 'stir:on');
  s.cells.th0 = r1(read(45, 'thermo'));
  const t0 = 50;
  ev(t0, 'switch:on');
  ev(t0, 'watch:start');
  for (const tt of THERM_TIMES) {
    const th = read(t0 + tt, 'thermo');
    s.rows.push({ key: tt, c: { th: r1(th) } });
  }
  s.cells.V = r1(read(t0 + 30, 'voltmeter'));
  s.cells.I = r2(read(t0 + 31, 'ammeter'));
  const tOff = t0 + (o.early ? 240 : 300);
  ev(tOff, 'switch:off');
  s.cells.t = read(tOff, 'watch').toFixed(0);
  let peak = -Infinity;
  for (let tt = tOff + 3; tt <= tOff + 150; tt += 3) peak = Math.max(peak, read(tt, 'thermo'));
  s.cells.thmax = r1(peak);
  if (!o.noStir) ev(tOff + 160, 'stir:off');
  const m = Number(s.cells.mcw) - Number(s.cells.mc);
  const dth = Number(s.cells.thmax) - Number(s.cells.th0);
  s.cells.m = m.toFixed(1);
  s.cells.dth = dth.toFixed(1);
  const V = Number(s.cells.V);
  const I = Number(s.cells.I);
  const t = Number(s.cells.t) / (o.minutes ? 60 : 1);
  const E = V * I * t;
  s.answers.energy = { value: E.toFixed(0), unit: 'J' };
  s.answers.power = { value: (V * I).toFixed(1), unit: 'W' };
  s.answers.c = { value: (E / ((o.grams ? Number(s.cells.m) : Number(s.cells.m) / 1000) * Number(s.cells.dth))).toPrecision(3), unit: 'J kg-1 K-1' };
  const pts = s.rows.map((r) => ({ x: r.key, y: Number(r.c.th) }));
  s.line = lineOf(pts).line;
  s.written.precautions = 'The calorimeter was lagged and covered with a lid. The water was stirred continuously and the highest temperature was recorded.';
  return s;
}

const IDEAL: Record<ThermTask, (seed: number) => PhyThermalState> = { EXPANSION: (x) => expansion(x), CHARLES: (x) => charles(x), ELECTRIC: (x) => electric(x) };

// ------------------------------------------------------------------ tests

test('ideal work gets full auto marks across 40 seeds, every task', () => {
  for (const task of THERM_TASKS) {
    for (let seed = 1; seed <= 40; seed++) {
      const s = IDEAL[task](seed);
      const parsed = phyThermalStateSchema.safeParse(s);
      assert.ok(parsed.success, `${task} schema seed ${seed}: ${parsed.success ? '' : parsed.error.message.slice(0, 300)}`);
      const out = phyThermalGrader.grade(s, seed);
      assert.equal(autoTotal(out), autoMax, `${task} seed ${seed}: ${out.auto.filter((c) => c.awarded < c.max).map((c) => `${c.id} ${c.awarded}/${c.max}: ${c.note}`).join(' | ')}`);
      assert.equal(out.ai.length, 1);
      assert.ok(out.solution.length >= 4);
    }
  }
});

test('variant and physics: deterministic, physical ranges', () => {
  assert.deepEqual(phyThermalVariant(7), phyThermalVariant(7));
  assert.notDeepEqual(phyThermalVariant(7), phyThermalVariant(8));
  for (let seed = 1; seed <= 25; seed++) {
    const v = phyThermalVariant(seed);
    const e = thermIdealExpansion(v);
    assert.ok(e > 0.45 && e < 1.1, `expansion ${e}`);
    // the thermometer is steady long before the rod stops expanding
    const sim = thermSim(v, [{ t: 0, e: 'micro:back' }, { t: 1, e: 'boiler:on' }]);
    let tTh = -1;
    let tRod = -1;
    for (let t = 0; t < 2000 && tRod < 0; t += 1) {
      const p = sim.at(t);
      if (tTh < 0 && p.thJ >= v.boil - 0.3) tTh = t;
      if (tRod < 0 && thermExpansion(v, p) >= 0.99 * e) tRod = t;
    }
    assert.ok(tTh > 0 && tRod - tTh > 120, `thermometer steady ${tTh} s, rod ${tRod} s`);
    // Charles: the column grows with temperature, l/T about constant
    const c = thermSim(v, [{ t: 0, e: 'immerse:full' }]);
    const l0 = thermColumn(v, c.at(200));
    const ch = thermSim(v, [{ t: 0, e: 'immerse:full' }, { t: 1, e: 'bunsen:on' }, { t: 400, e: 'bunsen:off' }, ...Array.from({ length: 8 }, (_, k) => ({ t: 402 + k * 10, e: 'stir' as const }))]);
    const p2 = ch.at(560);
    const l2 = thermColumn(v, p2);
    assert.ok(l2 > l0 && p2.tw > v.room + 30, `l ${l0} → ${l2} at ${p2.tw}`);
    assert.ok(Math.abs(l2 / (p2.air + 273.15) - l0 / (c.at(200).air + 273.15)) / (l0 / 300) < 0.03);
    // the heater keeps warming the water just after switching off
    const el = thermSim(v, [{ t: 0, e: 'pour' }, { t: 1, e: 'heater:in' }, { t: 1, e: 'wire:ok' }, { t: 1, e: 'lag:on' }, { t: 1, e: 'lid:on' }, { t: 2, e: 'stir:on' }, { t: 5, e: 'switch:on' }, { t: 305, e: 'switch:off' }]);
    const atOff = el.at(305).te;
    const later = el.at(330).te;
    assert.ok(later > atOff, 'temperature rises after switch-off');
    assert.ok(thermCRef(v) > 4186 && thermCRef(v) < 4500);
  }
});

test('expansion: thimble, no back-off, an early reading and mixed units lose the right marks', () => {
  const seed = 5;
  assert.equal(autoTotal(phyThermalGrader.grade(expansion(seed), seed)), autoMax);
  const th = phyThermalGrader.grade(expansion(seed, { thimble: true }), seed);
  assert.equal(by(th, 'care').awarded, 1);
  assert.match(by(th, 'care').note, /ratchet/);
  const nb = phyThermalGrader.grade(expansion(seed, { noBack: true }), seed);
  assert.equal(by(nb, 'care').awarded, 1);
  assert.match(by(nb, 'care').note, /strained/);
  const early = phyThermalGrader.grade(expansion(seed, { early: true }), seed);
  assert.ok(by(early, 'procedure').awarded <= 3);
  assert.ok(by(early, 'calculations').awarded <= 2);
  const m = phyThermalGrader.grade(expansion(seed, { metres: true }), seed);
  assert.ok(by(m, 'calculations').awarded === 0);
  assert.match(by(m, 'calculations').note, /same unit/);
  const s = expansion(seed);
  s.answers.alpha.unit = 'm';
  assert.equal(by(phyThermalGrader.grade(s, seed), 'units').awarded, 0);
});

test('Charles: a part-immersed column, reading while heating and too few readings', () => {
  const seed = 9;
  const part = phyThermalGrader.grade(charles(seed, { part: true }), seed);
  assert.equal(by(part, 'care').awarded, 1);
  assert.match(by(part, 'care').note, /whole air column/);
  const hot = phyThermalGrader.grade(charles(seed, { hot: true }), seed);
  assert.equal(by(hot, 'care').awarded, 1);
  assert.match(by(hot, 'care').note, /flame/);
  assert.ok(by(hot, 'procedure').awarded <= 3);
  const few = phyThermalGrader.grade(charles(seed, { few: true }), seed);
  assert.ok(by(few, 'procedure').awarded <= 3);
  const s = charles(seed);
  s.answers.zero = { value: '273', unit: '°C' };
  assert.ok(by(phyThermalGrader.grade(s, seed), 'calculations').awarded <= 2);
});

test('electrical heating: dry switching, no lagging, minutes, grams, no stirring', () => {
  const seed = 13;
  const dry = phyThermalGrader.grade(electric(seed, { dry: true }), seed);
  assert.equal(by(dry, 'care').awarded, 1);
  assert.match(by(dry, 'care').note, /under the water/);
  const bare = phyThermalGrader.grade(electric(seed, { bare: true }), seed);
  assert.equal(by(bare, 'care').awarded, 1);
  const mins = phyThermalGrader.grade(electric(seed, { minutes: true }), seed);
  assert.match(by(mins, 'calculations').note, /seconds/);
  const g = phyThermalGrader.grade(electric(seed, { grams: true }), seed);
  assert.match(by(g, 'calculations').note, /kilograms/);
  const ns = phyThermalGrader.grade(electric(seed, { noStir: true }), seed);
  assert.ok(by(ns, 'procedure').awarded <= 3);
  const early = phyThermalGrader.grade(electric(seed, { early: true }), seed);
  assert.ok(by(early, 'procedure').awarded <= 3);
});

test('an empty state marks zero without throwing, for every task', () => {
  for (const task of [...THERM_TASKS, null]) {
    const s = { ...emptyPhyThermalState(), task };
    const out = phyThermalGrader.grade(s, 3);
    assert.equal(autoTotal(out), 0, `${task}: ${out.auto.filter((c) => c.awarded).map((c) => `${c.id}: ${c.note}`).join(',')}`);
  }
});

test('the state schema rejects garbage', () => {
  const ok = electric(2);
  assert.ok(phyThermalStateSchema.safeParse(ok).success);
  assert.ok(!phyThermalStateSchema.safeParse({ ...ok, task: 'BOYLE' }).success);
  assert.ok(!phyThermalStateSchema.safeParse({ ...ok, events: [{ t: 1, e: 'explode' }] }).success);
  assert.ok(!phyThermalStateSchema.safeParse({ ...ok, reads: [{ k: 'thermo', t: -1 }] }).success);
  assert.ok(!phyThermalStateSchema.safeParse({ ...ok, rows: Array.from({ length: 13 }, () => ok.rows[0]) }).success);
  assert.ok(!phyThermalStateSchema.safeParse({ ...ok, cells: { 'bad key!': '1' } }).success);
  assert.ok(!phyThermalStateSchema.safeParse({ ...ok, answers: { ...ok.answers, c: { value: 'x'.repeat(41), unit: '' } } }).success);
  assert.ok(!phyThermalStateSchema.safeParse({ ...ok, v: 2 }).success);
  assert.ok(!phyThermalStateSchema.safeParse(undefined).success);
});

test('grading is deterministic', () => {
  for (const task of THERM_TASKS) {
    const s = IDEAL[task](17);
    assert.deepEqual(phyThermalGrader.grade(s, 17), phyThermalGrader.grade(structuredClone(s), 17));
  }
});
