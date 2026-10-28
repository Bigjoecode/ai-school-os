// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-phy-circuits.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CIRCUITS_RHEOSTAT_MAX,
  PHY_CIRCUITS,
  bridgeBalance,
  circuitsCheck,
  circuitsMeters,
  circuitsOpenCircuit,
  circuitsReadingSettings,
  circuitsWireKey,
  emptyPhyCircuitsState,
  phyCircuitsStateSchema,
  phyCircuitsVariant,
  phyFit,
  rboxPlugs,
  rubricTotal,
  type CircuitsReading,
  type CircuitsTerminal,
  type PhyCircuitsState,
  type SeriesArrangement,
} from '@aischool/shared';
import { phyCircuitsGrader } from '../src/practicals/graders/phy-circuits';
import type { GraderOutput } from '../src/practicals/graders/types';

const by = (out: GraderOutput, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: GraderOutput) => out.auto.reduce((t, c) => t + c.awarded, 0);
const autoMax = PHY_CIRCUITS.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
const lost = (out: GraderOutput) => out.auto.filter((c) => c.awarded < c.max).map((c) => `${c.id}: ${c.note}`).join(' | ');
const k = (a: CircuitsTerminal, b: CircuitsTerminal) => circuitsWireKey(a, b);
const lineThrough = (pts: { x: number; y: number }[]) => {
  const f = phyFit(pts)!;
  const xs = pts.map((p) => p.x);
  const x1 = Math.min(...xs);
  const x2 = Math.max(...xs);
  return { x1, y1: f.intercept + f.slope * x1, x2, y2: f.intercept + f.slope * x2 };
};
const reading = (wires: string[], o: Partial<CircuitsReading> = {}): CircuitsReading => ({ wires, rheostat: 1, jockey: 50, rbox: 0, swap: false, heat: 0, ...o });

// ------------------------------------------------------------------ metre bridge

const BRIDGE_WIRES = [k('cell+', 'key-a'), k('key-b', 'mb-a'), k('mb-c', 'cell-'), k('mb-d', 'g-a'), k('g-b', 'mb-j')];
/** R values that balance between 30 and 70 cm, as a careful student would choose them. */
function bridgeRs(X: number): number[] {
  const out: number[] = [];
  for (let R = 1; R <= 20 && out.length < 5; R++) {
    const l = (100 * X) / (X + R);
    if (l >= 32 && l <= 68) out.push(R);
  }
  return out;
}
function bridge(seed: number, o: { wires?: string[]; noSwap?: boolean; off?: number; scrapes?: number; heat?: number; swapFormula?: boolean; rs?: number[]; noUnits?: boolean } = {}): PhyCircuitsState {
  const v = phyCircuitsVariant(seed);
  const s = emptyPhyCircuitsState();
  s.task = 'BRIDGE';
  s.wires = o.wires ?? BRIDGE_WIRES;
  s.scrapes = o.scrapes ?? 0;
  const Rs = o.rs ?? bridgeRs(v.X);
  const plan = [...Rs.map((R) => ({ R, swap: false })), ...(o.noSwap ? [] : [{ R: Math.max(1, Math.min(20, Math.round(v.X))), swap: true }])];
  for (const { R, swap } of plan) {
    const heat = o.heat ?? 0;
    const l = Math.round((bridgeBalance(v, { rbox: R, swap, heat }) + (o.off ?? 0)) * 10) / 10;
    s.readings.push(reading(s.wires, { jockey: l, rbox: R, swap, heat }));
    const X = swap && !o.swapFormula ? (R * (100 - l)) / l : (R * l) / (100 - l);
    s.bridge.push({ R: String(R), l: l.toFixed(1), m: (100 - l).toFixed(1), q: swap ? '' : ((100 - l) / l).toFixed(3), X: X.toFixed(3) });
  }
  const pts = s.bridge.filter((_, i) => !s.readings[i]!.swap).map((r) => ({ x: Number(r.q), y: Number(r.R) }));
  s.line = lineThrough(pts);
  const Xs = s.bridge.map((r) => Number(r.X));
  s.answers.mean = { value: (Xs.reduce((a, b) => a + b, 0) / Xs.length).toFixed(2), unit: o.noUnits ? '' : 'Ω' };
  s.answers.slope = { value: phyFit(pts)!.slope.toPrecision(3), unit: 'ohm' };
  s.written.conclusion = `The unknown resistance X = ${s.answers.mean.value} Ω; the check with X and R interchanged agrees.`;
  s.written.precautions = 'I tapped the jockey instead of sliding it. I chose R so the balance point was near the middle of the wire.';
  return s;
}

// ------------------------------------------------------------------ e.m.f. and internal resistance

const EMF_WIRES = [k('cell+', 'key-a'), k('key-b', 'am+'), k('am-', 'rh-a'), k('rh-s', 'cell-'), k('vm+', 'cell+'), k('vm-', 'cell-')];
function emf(seed: number, o: { wires?: string[]; currents?: number[]; heat?: number; overloads?: number; positiveSlope?: boolean; misreadV?: number; noE0?: boolean } = {}): PhyCircuitsState {
  const v = phyCircuitsVariant(seed);
  const s = emptyPhyCircuitsState();
  s.task = 'EMF';
  s.wires = o.wires ?? EMF_WIRES;
  s.overloads = o.overloads ?? 0;
  for (const I of o.currents ?? [0.2, 0.35, 0.5, 0.65, 0.8]) {
    const rheostat = Math.max(0, Math.min(1, Math.round(((v.emf / I - v.internal - 0.06) / CIRCUITS_RHEOSTAT_MAX) * 200) / 200));
    const r = reading(s.wires, { rheostat, heat: o.heat ?? 0 });
    const m = circuitsMeters(v, circuitsReadingSettings('EMF', r), s.readings.length);
    s.readings.push(r);
    s.emf.push({ I: m.I.toFixed(2), V: (m.V + (o.misreadV ?? 0)).toFixed(2) });
  }
  const open = circuitsMeters(v, { ...circuitsReadingSettings('EMF', s.readings[0]!), key: false, heat: 0 }, 'open');
  if (!o.noE0) s.answers.e0 = { value: open.V.toFixed(2), unit: 'V' };
  const pts = s.emf.map((r) => ({ x: Number(r.I), y: Number(r.V) }));
  s.line = lineThrough(pts);
  const f = phyFit(pts)!;
  s.answers.slope = { value: (o.positiveSlope ? -f.slope : f.slope).toPrecision(3), unit: 'V/A' };
  s.answers.emf = { value: f.intercept.toFixed(2), unit: 'V' };
  s.answers.r = { value: (-f.slope).toPrecision(3), unit: 'Ω' };
  s.written.conclusion = 'The terminal p.d. decreases linearly as the current increases: V = E − Ir, with the e.m.f. as the intercept.';
  s.written.precautions = 'I opened the key between readings so the cell did not polarise. I read the meters from directly in front to avoid parallax.';
  return s;
}

// ------------------------------------------------------------------ series and parallel

const LOOP = [k('cell+', 'key-a'), k('key-b', 'am+')];
const SERIES_WIRES: Record<SeriesArrangement, string[]> = {
  R1: [...LOOP, k('am-', 'r1-a'), k('r1-b', 'cell-'), k('vm+', 'r1-a'), k('vm-', 'r1-b')],
  R2: [...LOOP, k('am-', 'r2-a'), k('r2-b', 'cell-'), k('vm+', 'r2-a'), k('vm-', 'r2-b')],
  S: [...LOOP, k('am-', 'r1-a'), k('r1-b', 'r2-a'), k('r2-b', 'cell-'), k('vm+', 'r1-a'), k('vm-', 'r2-b')],
  P: [...LOOP, k('am-', 'r1-a'), k('r1-a', 'r2-a'), k('r1-b', 'r2-b'), k('r2-b', 'cell-'), k('vm+', 'r1-a'), k('vm-', 'r1-b')],
};
function series(seed: number, o: { skip?: SeriesArrangement; mislabel?: boolean; parallelAdded?: boolean; vmAcrossAmmeter?: boolean } = {}): PhyCircuitsState {
  const v = phyCircuitsVariant(seed);
  const s = emptyPhyCircuitsState();
  s.task = 'SERIES';
  const R: Partial<Record<SeriesArrangement, number>> = {};
  for (const arr of ['R1', 'R2', 'S', 'P'] as const) {
    if (o.skip === arr) continue;
    let wires = SERIES_WIRES[arr];
    if (o.vmAcrossAmmeter && arr === 'S') wires = wires.map((w) => (w === k('vm+', 'r1-a') ? k('vm+', 'am+') : w));
    const r = reading(wires);
    const m = circuitsMeters(v, circuitsReadingSettings('SERIES', r), s.readings.length);
    s.readings.push(r);
    const I = m.I.toFixed(2);
    const V = m.V.toFixed(2);
    R[arr] = Number(V) / Number(I);
    s.series.push({ arr: o.mislabel && arr === 'S' ? 'P' : o.mislabel && arr === 'P' ? 'S' : arr, V, I, R: R[arr]!.toFixed(2) });
    s.wires = wires;
  }
  const f = (x: number | undefined) => ({ value: x === undefined ? '' : x.toFixed(2), unit: 'Ω' });
  s.answers.r1 = f(R.R1);
  s.answers.r2 = f(R.R2);
  s.answers.rs = f(o.mislabel ? R.P : R.S);
  s.answers.rp = f(o.mislabel ? R.S : R.P);
  if (R.R1 !== undefined && R.R2 !== undefined) {
    s.answers.rsCalc = f(R.R1 + R.R2);
    s.answers.rpCalc = f(o.parallelAdded ? R.R1 + R.R2 : (R.R1 * R.R2) / (R.R1 + R.R2));
  }
  s.written.conclusion = 'The series resistance is larger than either resistor and equals R1 + R2; the parallel resistance is smaller than either.';
  s.written.precautions = 'I opened the key between readings and made the connections clean and tight.';
  return s;
}

test('circuits: rubric 20; the hidden values are fixed per seed and in range; the circuit physics', () => {
  assert.equal(rubricTotal(PHY_CIRCUITS.rubric), 20);
  const a = phyCircuitsVariant(11);
  assert.deepEqual(a, phyCircuitsVariant(11));
  assert.notDeepEqual(a, phyCircuitsVariant(12));
  for (let seed = 1; seed < 400; seed += 7) {
    const v = phyCircuitsVariant(seed);
    assert.ok(v.emf >= 1.48 && v.emf <= 1.6 && v.internal >= 0.4 && v.internal <= 1.1 && v.X >= 2.5 && v.X <= 9 && v.r1 >= 2 && v.r2 <= 5.6);
    // The metre bridge balances where X/R = (l + α)/(100 − l + β); the galvanometer reverses there.
    const set = { task: 'BRIDGE' as const, wires: BRIDGE_WIRES, key: true, rheostat: 1, pressed: true, swap: false, heat: 0 };
    for (const R of bridgeRs(v.X)) {
      const l = bridgeBalance(v, { rbox: R, swap: false, heat: 0 });
      const ideal = (100 * v.X + v.X * v.beta - R * v.alpha) / (v.X + R);
      assert.ok(Math.abs(l - ideal) < 0.5, `seed ${seed} R ${R}: ${l} vs ${ideal}`);
      const g = (x: number) => circuitsMeters(v, { ...set, rbox: R, jockey: x }, 0).galvo;
      assert.ok(Math.abs(g(l)) < 0.3 && g(l - 0.5) * g(l + 0.5) < 0 && Math.abs(g(l + 0.5)) > 2, `seed ${seed} galvo`);
      // Interchanging X and R moves the balance to about 100 − l.
      assert.ok(Math.abs(bridgeBalance(v, { rbox: R, swap: true, heat: 0 }) - (100 - l)) < 1.5);
    }
    assert.ok(bridgeRs(v.X).length >= 4, `seed ${seed}: four R values balance mid-wire`);
    // The jockey lifted: no galvanometer current.
    assert.equal(circuitsMeters(v, { ...set, rbox: 3, jockey: 10, pressed: false }, 0).galvo, 0);
    const c = circuitsCheck(v, { ...set, rbox: 0, jockey: 50 });
    assert.ok(c.supplyAcross && c.galvoBridge && c.keySeries);
    // E.m.f.: V = E − Ir; the open-circuit reading is (almost) E; zero rheostat overloads the ammeter.
    const e = { task: 'EMF' as const, wires: EMF_WIRES, key: true, jockey: 50, pressed: false, rbox: 0, swap: false, heat: 0 };
    for (const rh of [0.6, 0.3, 0.15]) {
      const m = circuitsMeters(v, { ...e, rheostat: rh }, 1);
      assert.ok(Math.abs(m.V - (v.emf - m.I * v.internal)) < 0.02 * v.emf, `seed ${seed} rh ${rh}`);
    }
    assert.ok(circuitsMeters(v, { ...e, rheostat: 0 }, 1).overI);
    assert.ok(Math.abs(circuitsOpenCircuit(v) - v.emf) < 0.001);
    assert.ok(circuitsCheck(v, { ...e, rheostat: 0.5 }).voltmeterAcross);
    // Series and parallel: the arrangement is recognised from the wiring; V/I gives the combination.
    for (const arr of ['R1', 'R2', 'S', 'P'] as const) {
      const st = { task: 'SERIES' as const, wires: SERIES_WIRES[arr], key: true, rheostat: 1, jockey: 50, pressed: false, rbox: 0, swap: false, heat: 0 };
      const ch = circuitsCheck(v, st);
      assert.equal(ch.arrangement, arr);
      assert.ok(ch.polarity && ch.voltmeterAcross && ch.keySeries);
      const m = circuitsMeters(v, st, 0);
      const want = { R1: v.r1, R2: v.r2, S: v.r1 + v.r2, P: (v.r1 * v.r2) / (v.r1 + v.r2) }[arr];
      assert.ok(Math.abs(m.V / m.I - want) < 0.02 * want && !m.overI, `seed ${seed} ${arr}`);
    }
  }
  assert.deepEqual(rboxPlugs(13), [true, false, true, false, true]);
  assert.deepEqual(rboxPlugs(20), [true, true, true, true, true]);
});

test('circuits: exact work earns every AUTO mark in all three tasks across 40 seeds', () => {
  for (let i = 0; i < 40; i++) {
    const seed = 5 + i * 7919;
    for (const s of [bridge(seed), emf(seed), series(seed)]) {
      assert.ok(phyCircuitsStateSchema.safeParse(s).success, `${s.task} schema`);
      const out = phyCircuitsGrader.grade(s, seed);
      assert.equal(autoTotal(out), autoMax, `${s.task} ${seed}: ${lost(out)}`);
      assert.equal(out.ai.length, 2);
      assert.equal(out.auto.length, PHY_CIRCUITS.rubric.filter((c) => c.how === 'AUTO').length);
    }
  }
});

test('circuits: metre bridge — typical mistakes lose the right marks', () => {
  const seed = 42;
  const g = (s: PhyCircuitsState) => phyCircuitsGrader.grade(s, seed);
  assert.equal(by(g(bridge(seed, { noSwap: true })), 'procedure').awarded, 2);
  const sc = g(bridge(seed, { scrapes: 3 }));
  assert.equal(by(sc, 'care').awarded, 1, by(sc, 'care').note);
  assert.equal(by(g(bridge(seed, { heat: 2 })), 'care').awarded, 1);
  // Readings taken off balance (the galvanometer still deflecting).
  const off = g(bridge(seed, { off: 1.5 }));
  assert.equal(by(off, 'readings').awarded, 2, by(off, 'readings').note);
  // The interchanged reading worked out with the wrong formula.
  assert.equal(by(g(bridge(seed, { swapFormula: true })), 'readings').awarded, 3);
  // R chosen so the balance is near an end.
  const ends = g(bridge(seed, { rs: [1, 18, 19, 20] }));
  assert.equal(by(ends, 'procedure').awarded, 2, by(ends, 'procedure').note);
  // Galvanometer across the cell instead of to the jockey.
  const bad = g(bridge(seed, { wires: [k('cell+', 'key-a'), k('key-b', 'mb-a'), k('mb-c', 'cell-'), k('mb-d', 'g-a'), k('g-b', 'mb-c')] }));
  assert.equal(by(bad, 'circuit').awarded, 2);
  // No key in the circuit.
  const nokey = g(bridge(seed, { wires: [k('cell+', 'mb-a'), k('mb-c', 'cell-'), k('mb-d', 'g-a'), k('g-b', 'mb-j')] }));
  assert.equal(by(nokey, 'circuit').awarded, 2);
  assert.equal(by(g(bridge(seed, { noUnits: true })), 'units').awarded, 0);
});

test('circuits: e.m.f. — typical mistakes lose the right marks', () => {
  const seed = 42;
  const g = (s: PhyCircuitsState) => phyCircuitsGrader.grade(s, seed);
  // Few, bunched readings.
  const few = g(emf(seed, { currents: [0.3, 0.4, 0.5] }));
  assert.equal(by(few, 'procedure').awarded, 1, by(few, 'procedure').note);
  // Key left closed; the cell short-circuited at some point.
  assert.equal(by(g(emf(seed, { heat: 1 })), 'care').awarded, 1);
  assert.equal(by(g(emf(seed, { overloads: 1 })), 'care').awarded, 1);
  // The slope written as positive.
  assert.equal(by(g(emf(seed, { positiveSlope: true })), 'calculations').awarded, 2);
  // Misread voltmeter by 0.1 V (the currents still match: one of the two marks).
  assert.equal(by(g(emf(seed, { misreadV: 0.1 })), 'readings').awarded, 3);
  // No open-circuit reading.
  const ne = g(emf(seed, { noE0: true }));
  assert.equal(by(ne, 'procedure').awarded, 2);
  assert.equal(by(ne, 'readings').awarded, 3);
  // The voltmeter across the rheostat instead of the cell.
  const vr = g(emf(seed, { wires: [k('cell+', 'key-a'), k('key-b', 'am+'), k('am-', 'rh-a'), k('rh-s', 'cell-'), k('vm+', 'rh-a'), k('vm-', 'rh-s')] }));
  assert.ok(by(vr, 'circuit').awarded <= 2);
});

test('circuits: series and parallel — typical mistakes lose the right marks', () => {
  const seed = 42;
  const g = (s: PhyCircuitsState) => phyCircuitsGrader.grade(s, seed);
  assert.equal(by(g(series(seed, { skip: 'P' })), 'procedure').awarded, 2);
  assert.equal(by(g(series(seed, { skip: 'R2' })), 'procedure').awarded, 2);
  const ml = g(series(seed, { mislabel: true }));
  assert.equal(by(ml, 'readings').awarded, 3, by(ml, 'readings').note);
  // Adding the resistances for the parallel arrangement.
  const pa = g(series(seed, { parallelAdded: true }));
  assert.equal(by(pa, 'analysis').awarded, 1);
  assert.equal(by(pa, 'calculations').awarded, 2);
  // The voltmeter across the ammeter and the resistors together.
  const va = g(series(seed, { vmAcrossAmmeter: true }));
  assert.equal(by(va, 'circuit').awarded, 1, by(va, 'circuit').note);
});

test('circuits: the state schema rejects garbage', () => {
  const ok = bridge(7);
  assert.ok(phyCircuitsStateSchema.safeParse(ok).success);
  assert.ok(phyCircuitsStateSchema.safeParse(emptyPhyCircuitsState()).success);
  assert.ok(!phyCircuitsStateSchema.safeParse({ ...ok, task: 'OHM' }).success);
  assert.ok(!phyCircuitsStateSchema.safeParse({ ...ok, rbox: 21 }).success);
  assert.ok(!phyCircuitsStateSchema.safeParse({ ...ok, rbox: 2.5 }).success);
  assert.ok(!phyCircuitsStateSchema.safeParse({ ...ok, wires: ['cell+;drop'] }).success);
  assert.ok(!phyCircuitsStateSchema.safeParse({ ...ok, series: [{ arr: 'Q', V: '1', I: '1', R: '1' }] }).success);
  assert.ok(!phyCircuitsStateSchema.safeParse({ ...ok, answers: { ...ok.answers, mean: { value: 'x'.repeat(41), unit: 'Ω' } } }).success);
  assert.ok(!phyCircuitsStateSchema.safeParse({ ...ok, readings: Array.from({ length: 17 }, () => ok.readings[0]) }).success);
  assert.ok(!phyCircuitsStateSchema.safeParse({ ...ok, v: 2 }).success);
  assert.ok(!phyCircuitsStateSchema.safeParse(undefined).success);
  // An empty attempt marks without throwing.
  for (const task of ['BRIDGE', 'EMF', 'SERIES'] as const) {
    const out = phyCircuitsGrader.grade({ ...emptyPhyCircuitsState(), task }, 3);
    assert.equal(autoTotal(out), 0, `${task}: ${lost(out)}`);
  }
});
