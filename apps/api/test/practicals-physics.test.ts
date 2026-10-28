// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-physics.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  OPTICS_CARD_U,
  PHY_GLASS_BLOCK,
  PHY_OPTICS,
  PHY_OHMS_LAW,
  PHY_PENDULUM,
  emptyPhyGlassState,
  emptyPhyOhmsState,
  emptyPhyOpticsState,
  emptyPhyPendulumState,
  glassConstruction,
  glassRay,
  ohmsMeters,
  ohmsReadingSettings,
  ohmsWireKey,
  opticsBlur,
  opticsF,
  opticsImage,
  opticsScreenAt,
  opticsV,
  opticsWindowImage,
  pendulumPeriod,
  phyFit,
  phyGlassStateSchema,
  phyGlassVariant,
  phyOhmsStateSchema,
  phyOhmsVariant,
  phyOpticsStateSchema,
  phyOpticsVariant,
  phyPendulumStateSchema,
  phyPendulumVariant,
  phySin,
  rubricTotal,
  type OhmsTask,
  type OhmsTerminal,
  type OpticsTask,
  type PhyGlassState,
  type PhyOhmsState,
  type PhyOpticsState,
  type PhyPendulumState,
  type SimulatorSpec,
} from '@aischool/shared';
import {
  MOMENTS_CARD_X,
  MOMENTS_KNOWN,
  MOMENTS_TASKS,
  PHY_MOMENTS,
  emptyPhyMomentsState,
  momentsBalanced,
  momentsMassBalance,
  momentsOtherBalance,
  momentsRest,
  momentsStep,
  momentsStop,
  momentsTorque,
  phyMomentsStateSchema,
  phyMomentsVariant,
  type MomentsTask,
  type PhyMomentsState,
} from '@aischool/shared';
import { phyGlassGrader } from '../src/practicals/graders/phy-glass-block';
import { phyMomentsGrader } from '../src/practicals/graders/phy-moments';
import { phyOhmsGrader } from '../src/practicals/graders/phy-ohms-law';
import { phyOpticsGrader } from '../src/practicals/graders/phy-optics';
import { phyPendulumGrader } from '../src/practicals/graders/phy-pendulum';
import { phyUnit } from '../src/practicals/graders/phy-common';
import type { GraderOutput } from '../src/practicals/graders/types';

const by = (out: GraderOutput, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: GraderOutput) => out.auto.reduce((t, c) => t + c.awarded, 0);
const autoMax = (spec: SimulatorSpec) => spec.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
const lost = (out: GraderOutput) => out.auto.filter((c) => c.awarded < c.max).map((c) => `${c.id}: ${c.note}`).join(' | ');
const lineThrough = (pts: { x: number; y: number }[]) => {
  const f = phyFit(pts.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  if (!f) return null;
  const xs = pts.map((p) => p.x);
  const x1 = Math.min(...xs);
  const x2 = Math.max(...xs);
  return { x1, y1: f.intercept + f.slope * x1, x2, y2: f.intercept + f.slope * x2 };
};

// ------------------------------------------------------------------ pendulum

function pendulum(seed: number, o: { amplitude?: number; n?: number; shielded?: boolean; countExtra?: number; toTop?: boolean } = {}): PhyPendulumState {
  const v = phyPendulumVariant(seed);
  const s = emptyPhyPendulumState();
  const n = o.n ?? 20;
  v.suggested.forEach((thread, k) => {
    const amplitude = o.amplitude ?? 5;
    const shielded = o.shielded ?? true;
    const T = pendulumPeriod(v, thread, amplitude, k, shielded);
    const elapsed = Math.round((n + (o.countExtra ?? 0)) * T * 100) / 100;
    s.runs.push({ thread, amplitude, n, shielded, elapsed, startPhase: 0.1 });
    const t = elapsed.toFixed(2);
    const Tv = Number(t) / n;
    s.table.push({ l: (thread + (o.toTop ? 0 : v.bobRadius)).toFixed(1), t, T: Tv.toFixed(3), T2: (Tv * Tv).toFixed(3) });
  });
  const pts = s.table.map((r) => ({ x: Number(r.l), y: Number(r.T2) }));
  s.line = lineThrough(pts);
  const slopeCm = phyFit(pts)!.slope;
  s.answers = { slope: { value: (slopeCm * 100).toPrecision(3), unit: 's² m⁻¹' }, g: { value: ((4 * Math.PI ** 2) / (slopeCm * 100)).toPrecision(3), unit: 'm s⁻²' } };
  s.written.precautions = 'Small angle of displacement; started timing at the mean position with a fiducial mark.';
  return s;
}

test('pendulum: rubric 20, variant fixed per seed, exact work earns every AUTO mark', () => {
  assert.equal(rubricTotal(PHY_PENDULUM.rubric), 20);
  assert.deepEqual(phyPendulumVariant(99), phyPendulumVariant(99));
  for (const seed of [3, 17, 4242]) {
    const s = pendulum(seed);
    assert.ok(phyPendulumStateSchema.safeParse(s).success);
    const out = phyPendulumGrader.grade(s, seed);
    assert.equal(autoTotal(out), autoMax(PHY_PENDULUM), `seed ${seed}: ${lost(out)}`);
    assert.equal(out.ai.length, 1);
    assert.ok(out.solution.length >= 5);
  }
});

test('pendulum: slope in s² cm⁻¹ and g in cm s⁻² are accepted; within tolerance still scores', () => {
  const s = pendulum(3);
  const slopeM = Number(s.answers.slope.value);
  s.answers.slope = { value: (slopeM / 100 * 1.03).toPrecision(3), unit: 's2/cm' };
  s.answers.g = { value: ((4 * Math.PI ** 2) / (slopeM * 1.03) * 100).toPrecision(3), unit: 'cm s^-2' };
  s.table[0]!.t = (Number(s.table[0]!.t) + 0.04).toFixed(2); // stopwatch copied 0.04 s out
  s.table[0]!.T = (Number(s.table[0]!.t) / 20).toFixed(3);
  s.table[0]!.T2 = (Number(s.table[0]!.T) ** 2).toFixed(3);
  const out = phyPendulumGrader.grade(s, 3);
  assert.equal(by(out, 'calculations').awarded, 4, by(out, 'calculations').note);
  assert.equal(by(out, 'readings').awarded, 5, by(out, 'readings').note);
  assert.equal(by(out, 'units').awarded, 1, by(out, 'units').note);
});

test('pendulum: outside tolerance and wrong/missing units lose marks', () => {
  const s = pendulum(3);
  s.answers.slope.value = (Number(s.answers.slope.value) * 1.2).toPrecision(3);
  s.answers.g = { value: '9.81', unit: 'm/s' };
  const out = phyPendulumGrader.grade(s, 3);
  const c = by(out, 'calculations');
  // Slope wrong (0/2), g not from the slope (0), but 9.81 is within 3 % of the true g (1).
  assert.equal(c.awarded, 1, c.note);
  assert.equal(by(out, 'units').awarded, 0);
  const m = pendulum(3);
  m.answers.slope.unit = '';
  const mo = phyPendulumGrader.grade(m, 3);
  assert.equal(by(mo, 'units').awarded, 0);
  assert.equal(by(mo, 'calculations').awarded, 4);
});

test('pendulum: procedure errors — big swing, draught, wrong count, length to the top of the bob, too few lengths', () => {
  const big = phyPendulumGrader.grade(pendulum(3, { amplitude: 30, shielded: false }), 3);
  assert.equal(by(big, 'setup').awarded, 1);
  assert.match(by(big, 'setup').note, /small angle/);
  assert.equal(by(big, 'procedure').awarded, 3);
  assert.match(by(big, 'procedure').note, /window/);
  const miscount = phyPendulumGrader.grade(pendulum(3, { countExtra: 1 }), 3);
  assert.equal(by(miscount, 'readings').awarded, 4);
  assert.match(by(miscount, 'readings').note, /exactly 20 oscillations/);
  const top = phyPendulumGrader.grade(pendulum(3, { toTop: true }), 3);
  assert.equal(by(top, 'setup').awarded, 1);
  assert.match(by(top, 'setup').note, /centre of the bob/);
  const few = pendulum(3, { n: 10 });
  few.runs = few.runs.slice(0, 3);
  few.table = few.table.slice(0, 3);
  const fo = phyPendulumGrader.grade(few, 3);
  assert.equal(by(fo, 'procedure').awarded, 2, by(fo, 'procedure').note);
  const empty = phyPendulumGrader.grade(emptyPhyPendulumState(), 3);
  assert.equal(autoTotal(empty), 0);
});

// ------------------------------------------------------------------ Ohm's law / resistivity

const W = (a: OhmsTerminal, b: OhmsTerminal) => ohmsWireKey(a, b);
const OHM_WIRES = [W('cell+', 'key-a'), W('key-b', 'rh-a'), W('rh-s', 'am+'), W('am-', 'res-a'), W('res-b', 'cell-'), W('vm+', 'res-a'), W('vm-', 'res-b')];
const WIRE_WIRES = [W('cell+', 'key-a'), W('key-b', 'rh-a'), W('rh-s', 'am+'), W('am-', 'w-0'), W('w-j', 'cell-'), W('vm+', 'w-0'), W('vm-', 'w-j')];

function ohms(seed: number, task: OhmsTask, o: { wires?: string[]; heat?: boolean } = {}): PhyOhmsState {
  const v = phyOhmsVariant(seed);
  const s = emptyPhyOhmsState();
  s.task = task;
  s.wires = o.wires ?? (task === 'OHM' ? OHM_WIRES : WIRE_WIRES);
  const settings = task === 'OHM' ? [0, 0.2, 0.4, 0.6, 0.8, 1].map((rh) => ({ rheostat: rh, jockey: 50 })) : [20, 40, 60, 80, 100].map((L) => ({ rheostat: 0.3, jockey: L }));
  settings.forEach((st, k) => {
    const r = { wires: s.wires, rheostat: st.rheostat, jockey: st.jockey, heat: o.heat ? k : 0 };
    s.readings.push(r);
    const m = ohmsMeters(v, ohmsReadingSettings(task, r), k);
    const I = m.I.toFixed(2);
    const V = m.V.toFixed(2);
    s.table.push({ L: task === 'WIRE' ? st.jockey.toFixed(1) : '', I, V, R: (Number(V) / Number(I)).toFixed(3) });
  });
  const pts = s.table.map((r) => (task === 'OHM' ? { x: Number(r.I), y: Number(r.V) } : { x: Number(r.L), y: Number(r.R) }));
  s.line = lineThrough(pts);
  const slope = phyFit(pts)?.slope ?? 0;
  if (task === 'OHM') {
    s.answers.slope = { value: slope.toPrecision(3), unit: 'Ω' };
    s.answers.result = { value: slope.toPrecision(3), unit: 'ohms' };
  } else {
    const A = (Math.PI * (v.wire.diameterMm / 1000) ** 2) / 4;
    s.answers.area = { value: A.toExponential(3), unit: 'm²' };
    s.answers.slope = { value: (slope * 100).toPrecision(3), unit: 'Ω m⁻¹' };
    s.answers.result = { value: (slope * 100 * A).toExponential(2), unit: 'Ω m' };
  }
  s.written = { conclusion: 'V is directly proportional to I, a straight line through the origin, so Ohm’s law is obeyed.', precautions: 'Opened the key between readings; tight connections.' };
  return s;
}

test('ohms: rubric 20; exact work earns every AUTO mark in both tasks', () => {
  assert.equal(rubricTotal(PHY_OHMS_LAW.rubric), 20);
  for (const seed of [7, 21, 913]) {
    for (const task of ['OHM', 'WIRE'] as const) {
      const s = ohms(seed, task);
      assert.ok(phyOhmsStateSchema.safeParse(s).success);
      const out = phyOhmsGrader.grade(s, seed);
      assert.equal(autoTotal(out), autoMax(PHY_OHMS_LAW), `seed ${seed} ${task}: ${lost(out)}`);
      assert.equal(out.ai.length, 2);
    }
  }
});

test('ohms: within tolerance scores, outside tolerance does not', () => {
  const s = ohms(7, 'OHM');
  s.answers.slope.value = (Number(s.answers.slope.value) * 1.02).toPrecision(3);
  s.answers.result.value = s.answers.slope.value;
  s.table[0]!.V = (Number(s.table[0]!.V) + 0.04).toFixed(2);
  s.table[0]!.R = (Number(s.table[0]!.V) / Number(s.table[0]!.I)).toFixed(3);
  const out = phyOhmsGrader.grade(s, 7);
  assert.equal(by(out, 'calculations').awarded, 4, by(out, 'calculations').note);
  assert.equal(by(out, 'readings').awarded, 4, by(out, 'readings').note);
  const bad = ohms(7, 'OHM');
  bad.answers.slope.value = (Number(bad.answers.slope.value) * 1.15).toPrecision(3);
  bad.answers.result.value = bad.answers.slope.value;
  bad.table[2]!.I = (Number(bad.table[2]!.I) + 0.05).toFixed(2);
  const bo = phyOhmsGrader.grade(bad, 7);
  // Slope 0/2; R equals the student's slope (1); R is 15 % out (0).
  assert.equal(by(bo, 'calculations').awarded, 1, by(bo, 'calculations').note);
  assert.ok(by(bo, 'readings').awarded < 4);
});

test('ohms: wrong and missing units; resistivity slope in Ω cm⁻¹ accepted', () => {
  const s = ohms(7, 'WIRE');
  s.answers.slope = { value: (Number(s.answers.slope.value) / 100).toPrecision(3), unit: 'ohm/cm' };
  const out = phyOhmsGrader.grade(s, 7);
  assert.equal(by(out, 'calculations').awarded, 4, by(out, 'calculations').note);
  assert.equal(by(out, 'units').awarded, 1, by(out, 'units').note);
  const w = ohms(7, 'WIRE');
  w.answers.result.unit = 'Ω/m';
  assert.equal(by(phyOhmsGrader.grade(w, 7), 'units').awarded, 0);
  const area = ohms(7, 'WIRE');
  area.answers.area = { value: String((Math.PI * phyOhmsVariant(7).wire.diameterMm ** 2) / 4), unit: '' }; // mm² value, no unit
  const ao = phyOhmsGrader.grade(area, 7);
  assert.equal(by(ao, 'calculations').awarded, 3, by(ao, 'calculations').note);
  assert.equal(by(ao, 'units').awarded, 0);
});

test('ohms: wrong connections — meters swapped, ammeter reversed, no key; heating', () => {
  const swapped = [W('cell+', 'key-a'), W('key-b', 'rh-a'), W('rh-s', 'vm+'), W('vm-', 'res-a'), W('res-b', 'cell-'), W('am+', 'res-a'), W('am-', 'res-b')];
  const v = phyOhmsVariant(7);
  const m = ohmsMeters(v, { task: 'OHM', wires: swapped, key: true, rheostat: 0.5, jockey: 50, heat: 0 }, 0);
  assert.ok(m.I < 0.01 && m.V > 2.5, 'voltmeter in series: no current, the voltmeter reads about the e.m.f.');
  const s = ohms(7, 'OHM', { wires: swapped });
  assert.ok(by(phyOhmsGrader.grade(s, 7), 'circuit').awarded <= 1);
  const reversed = [W('cell+', 'key-a'), W('key-b', 'rh-a'), W('rh-s', 'am-'), W('am+', 'res-a'), W('res-b', 'cell-'), W('vm+', 'res-a'), W('vm-', 'res-b')];
  const rm = ohmsMeters(v, { task: 'OHM', wires: reversed, key: true, rheostat: 0.5, jockey: 50, heat: 0 }, 0);
  assert.ok(rm.backI && rm.I === 0);
  const r = phyOhmsGrader.grade(ohms(7, 'OHM', { wires: reversed }), 7);
  assert.equal(by(r, 'circuit').awarded, 3, by(r, 'circuit').note);
  const noKey = [W('cell+', 'rh-a'), W('rh-s', 'am+'), W('am-', 'res-a'), W('res-b', 'cell-'), W('vm+', 'res-a'), W('vm-', 'res-b')];
  const nk = phyOhmsGrader.grade(ohms(7, 'OHM', { wires: noKey }), 7);
  assert.equal(by(nk, 'circuit').awarded, 3);
  assert.match(by(nk, 'circuit').note, /key/);
  const hot = phyOhmsGrader.grade(ohms(7, 'OHM', { heat: true }), 7);
  assert.equal(by(hot, 'procedure').awarded, 2);
  assert.match(by(hot, 'procedure').note, /Open the key/);
});

// ------------------------------------------------------------------ glass block

function glass(seed: number, o: { angles?: number[]; p2?: number; misalign?: number; noNormal?: boolean } = {}): PhyGlassState {
  const v = phyGlassVariant(seed);
  const s = emptyPhyGlassState();
  for (const i of o.angles ?? [20, 30, 40, 50, 60, 70]) {
    const ray = glassRay(v, i);
    const at = (d: number) => ({ x: ray.exit.x + d * ray.dir.x + (o.misalign ?? 0), y: ray.exit.y + d * ray.dir.y });
    const t = { i, normal: !o.noNormal, p1: 2, p2: o.p2 ?? 8, p3: at(2), p4: at(8), joined: true };
    s.traces.push(t);
    const r = glassConstruction(v, t.p3, t.p4)!.r;
    const rr = Number(r.toFixed(0));
    s.table.push({ i: String(i), r: String(rr), sini: phySin(i).toFixed(3), sinr: phySin(rr).toFixed(3) });
  }
  const pts = s.table.map((r) => ({ x: Number(r.sinr), y: Number(r.sini) }));
  s.line = lineThrough(pts);
  const slope = phyFit(pts)!.slope;
  s.answers = { slope: { value: slope.toFixed(2), unit: '' }, n: { value: slope.toFixed(2), unit: '' } };
  s.written.precautions = 'Pins upright and far apart; I looked at the bases of the pins.';
  return s;
}

test('glass: rubric 20; exact work earns every AUTO mark', () => {
  assert.equal(rubricTotal(PHY_GLASS_BLOCK.rubric), 20);
  for (const seed of [3, 11, 777]) {
    const s = glass(seed);
    assert.ok(phyGlassStateSchema.safeParse(s).success);
    const out = phyGlassGrader.grade(s, seed);
    assert.equal(autoTotal(out), autoMax(PHY_GLASS_BLOCK), `seed ${seed}: ${lost(out)}`);
  }
});

test('glass: tolerance, units on n, misaligned pins and procedure errors', () => {
  const s = glass(3);
  s.table[0]!.r = (glassConstruction(phyGlassVariant(3), s.traces[0]!.p3, s.traces[0]!.p4)!.r + 0.9).toFixed(1); // 0.9° out of the drawing: still accepted
  s.table[0]!.sinr = phySin(Number(s.table[0]!.r)).toFixed(3);
  const ok = phyGlassGrader.grade(s, 3);
  assert.equal(by(ok, 'readings').awarded, 4, by(ok, 'readings').note);
  const units = glass(3);
  units.answers.n.unit = 'degrees';
  assert.equal(by(phyGlassGrader.grade(units, 3), 'figures').awarded, 0);
  const none = glass(3);
  none.answers.n.unit = 'no unit';
  assert.equal(by(phyGlassGrader.grade(none, 3), 'figures').awarded, 1);
  const off = phyGlassGrader.grade(glass(3, { misalign: 0.6 }), 3);
  assert.equal(by(off, 'tracing').awarded, 0);
  assert.ok(by(off, 'readings').awarded <= 3);
  const close = phyGlassGrader.grade(glass(3, { p2: 4, noNormal: true, angles: [30, 40, 50] }), 3);
  assert.equal(by(close, 'procedure').awarded, 1, by(close, 'procedure').note);
  assert.equal(by(close, 'tracing').awarded, 2); // 3 of the 5 traces needed
  const wrongN = glass(3);
  wrongN.answers.n.value = '1.70';
  const wo = phyGlassGrader.grade(wrongN, 3);
  assert.equal(by(wo, 'calculations').awarded, 2, by(wo, 'calculations').note);
});

test('every physics task earns every AUTO mark across 40 seeds (glass pins placed to the 0.01 cm the lab stores)', () => {
  const seeds = Array.from({ length: 40 }, (_, k) => 5 + k * 7919);
  const r2 = (x: number) => Math.round(x * 100) / 100; // glass-block/actions.ts: pinAt / dragPin
  for (const seed of seeds) {
    const p = phyPendulumGrader.grade(pendulum(seed), seed);
    assert.equal(autoTotal(p), autoMax(PHY_PENDULUM), `pendulum ${seed}: ${lost(p)}`);
    for (const task of ['OHM', 'WIRE'] as const) {
      const o = phyOhmsGrader.grade(ohms(seed, task), seed);
      assert.equal(autoTotal(o), autoMax(PHY_OHMS_LAW), `ohms ${task} ${seed}: ${lost(o)}`);
    }
    // The glass block as the lab records it: P₃/P₄ rounded to 0.01 cm, r read to the nearest degree from that drawing.
    const v = phyGlassVariant(seed);
    const s = glass(seed);
    s.traces.forEach((t, k) => {
      t.p3 = { x: r2(t.p3!.x), y: r2(t.p3!.y) };
      t.p4 = { x: r2(t.p4!.x), y: r2(t.p4!.y) };
      const rr = Number(glassConstruction(v, t.p3, t.p4)!.r.toFixed(0));
      s.table[k] = { ...s.table[k]!, r: String(rr), sinr: phySin(rr).toFixed(3) };
    });
    const pts = s.table.map((r) => ({ x: Number(r.sinr), y: Number(r.sini) }));
    s.line = lineThrough(pts);
    const slope = phyFit(pts)!.slope;
    s.answers = { slope: { value: slope.toFixed(2), unit: '' }, n: { value: slope.toFixed(2), unit: '' } };
    assert.ok(phyGlassStateSchema.safeParse(s).success);
    const g = phyGlassGrader.grade(s, seed);
    assert.equal(autoTotal(g), autoMax(PHY_GLASS_BLOCK), `glass ${seed}: ${lost(g)}`);
  }
});

test('phyUnit reads the physics units', () => {
  assert.equal(phyUnit('s² m⁻¹'), 's2/m');
  assert.equal(phyUnit('s^2/cm'), 's2/cm');
  assert.equal(phyUnit('m s-2'), 'm/s2');
  assert.equal(phyUnit('ms⁻²'), 'm/s2');
  assert.equal(phyUnit('Ω'), 'ohm');
  assert.equal(phyUnit('ohms'), 'ohm');
  assert.equal(phyUnit('Ω m'), 'ohm.m');
  assert.equal(phyUnit('ohm-metre'), 'ohm.m');
  assert.equal(phyUnit('Ωm⁻¹'), 'ohm/m');
  assert.equal(phyUnit('m²'), 'm2');
  assert.equal(phyUnit('no unit'), 'none');
  assert.equal(phyUnit(''), '');
});

// ------------------------------------------------------------------ optical bench (lens and concave mirror)

const r1 = (x: number) => Math.round(x * 10) / 10;
/** Exact work on the optical bench as the lab records it (positions to 0.1 cm); options introduce typical mistakes. */
function optics(seed: number, task: OpticsTask, o: { rough?: boolean; aligned?: boolean; offFocus?: number; us?: number[]; roughLate?: boolean } = {}): PhyOpticsState {
  const v = phyOpticsVariant(seed);
  const s = emptyPhyOpticsState();
  s.task = task;
  s.aligned = o.aligned ?? true;
  s.log.push({ t: 0, a: `task:${task}` });
  const rough = r1(opticsWindowImage(v, task));
  const doRough = () => {
    s.rough = rough;
    s.log.push({ t: 1, a: `rough:${rough}` });
    s.answers.rough = { value: rough.toFixed(1), unit: 'cm' };
  };
  if (o.rough !== false && !o.roughLate) doRough();
  for (const u of o.us ?? OPTICS_CARD_U[task]) {
    const img = opticsImage(v, task, u);
    const at = img === null ? 40 : img + (o.offFocus ?? 0);
    const screen = r1(opticsScreenAt(task, u, at));
    s.readings.push({ u, screen, aligned: s.aligned });
    const vr = opticsV(task, u, screen);
    s.table.push({ u: u.toFixed(1), v: vr.toFixed(1), iu: (1 / u).toFixed(4), iv: (1 / vr).toFixed(4) });
    s.log.push({ t: 2, a: `reading:${u}:${screen}` });
  }
  if (o.roughLate) doRough();
  const pts = s.table.map((r) => ({ x: Number(r.iu), y: Number(r.iv) }));
  const fit = phyFit(pts)!;
  const xi = -fit.intercept / fit.slope;
  s.line = { x1: 0, y1: Number(fit.intercept.toPrecision(4)), x2: Number(xi.toPrecision(4)), y2: 0 };
  s.answers.xint = { value: xi.toPrecision(3), unit: 'cm⁻¹' };
  s.answers.yint = { value: fit.intercept.toPrecision(3), unit: 'cm⁻¹' };
  s.answers.f = { value: (2 / (xi + fit.intercept)).toFixed(1), unit: 'cm' };
  s.written.precautions = 'The centres of the object, lens and screen were on the same horizontal axis. The screen was moved to and fro to find the sharpest image.';
  return s;
}

test('optics: rubric 20; the hidden focal lengths are fixed per seed and in range; the image physics', () => {
  assert.equal(rubricTotal(PHY_OPTICS.rubric), 20);
  const a = phyOpticsVariant(11);
  assert.deepEqual(a, phyOpticsVariant(11));
  assert.notDeepEqual(a, phyOpticsVariant(12));
  for (let seed = 1; seed < 200; seed += 7) {
    const v = phyOpticsVariant(seed);
    assert.ok(v.lensF >= 10 && v.lensF <= 15 && v.mirrorF >= 8 && v.mirrorF <= 12);
    for (const task of ['LENS', 'MIRROR'] as const) {
      // Every u on the card gives a real image that fits on the metre rule.
      for (const u of OPTICS_CARD_U[task]) assert.ok(opticsScreenAt(task, u, opticsImage(v, task, u)!) <= 100, `${task} ${seed} u=${u}`);
      // Best focus is within 0.4 % of the thin-lens value; blur grows either side of it.
      const f = opticsF(v, task);
      const img = opticsImage(v, task, 30)!;
      assert.ok(Math.abs(img / ((30 * f) / (30 - f)) - 1) <= 0.004);
      assert.ok(opticsBlur(v, task, 30, img) < 1e-9);
      assert.ok(opticsBlur(v, task, 30, img + 2) > opticsBlur(v, task, 30, img + 1));
      assert.ok(opticsBlur(v, task, 30, img - 2) > opticsBlur(v, task, 30, img - 1));
      // No real image inside f.
      assert.equal(opticsImage(v, task, f - 1), null);
    }
  }
});

test('optics: exact work earns every AUTO mark in both tasks across 40 seeds', () => {
  for (let k = 0; k < 40; k++) {
    const seed = 3 + k * 7919;
    for (const task of ['LENS', 'MIRROR'] as const) {
      const s = optics(seed, task);
      assert.ok(phyOpticsStateSchema.safeParse(s).success);
      const out = phyOpticsGrader.grade(s, seed);
      assert.equal(autoTotal(out), autoMax(PHY_OPTICS), `${task} ${seed}: ${lost(out)}`);
      assert.equal(out.ai.length, 1);
    }
  }
});

test('optics: typical mistakes lose the right marks', () => {
  const seed = 42;
  const v = phyOpticsVariant(seed);
  // No rough focal length; found only after the readings.
  assert.equal(by(phyOpticsGrader.grade(optics(seed, 'LENS', { rough: false }), seed), 'procedure').awarded, 3);
  assert.equal(by(phyOpticsGrader.grade(optics(seed, 'LENS', { roughLate: true }), seed), 'procedure').awarded, 3);
  // Centres not lined up.
  assert.equal(by(phyOpticsGrader.grade(optics(seed, 'MIRROR', { aligned: false }), seed), 'procedure').awarded, 3);
  // Too few values of u, too close together.
  const few = phyOpticsGrader.grade(optics(seed, 'LENS', { us: [30, 32, 34] }), seed);
  assert.equal(by(few, 'procedure').awarded, 2, by(few, 'procedure').note);
  // An object inside f (no real image) among the readings.
  const inside = phyOpticsGrader.grade(optics(seed, 'MIRROR', { us: [Math.floor(v.mirrorF) - 1, 15, 20, 25, 30, 35] }), seed);
  assert.equal(by(inside, 'procedure').awarded, 3, by(inside, 'procedure').note);
  assert.ok(by(inside, 'focusing').awarded < 3);
  // The screen left 3 cm from the sharpest image every time.
  const blurred = phyOpticsGrader.grade(optics(seed, 'LENS', { offFocus: 3 }), seed);
  assert.equal(by(blurred, 'focusing').awarded, 0, by(blurred, 'focusing').note);
  // Small focusing errors within the depth of focus still score.
  assert.equal(by(phyOpticsGrader.grade(optics(seed, 'LENS', { offFocus: 0.2 }), seed), 'focusing').awarded, 3);
  // Misread v, wrong decimal places, wrong reciprocals.
  const bad = optics(seed, 'LENS');
  bad.table[0]!.v = (Number(bad.table[0]!.v) + 1.5).toFixed(1);
  bad.table[1]!.u = '25';
  bad.table[2]!.iu = '0.0300';
  const bo = phyOpticsGrader.grade(bad, seed);
  assert.equal(by(bo, 'readings').awarded, 1, by(bo, 'readings').note);
  // Wrong intercept, f not from the intercepts, f far from the truth, units missing.
  const calc = optics(seed, 'MIRROR');
  calc.answers.xint.value = (Number(calc.answers.xint.value) * 1.2).toPrecision(3);
  calc.answers.f = { value: (v.mirrorF * 1.25).toFixed(1), unit: '' };
  const co = phyOpticsGrader.grade(calc, seed);
  assert.equal(by(co, 'calculations').awarded, 1, by(co, 'calculations').note);
  assert.equal(by(co, 'units').awarded, 0);
  // Answers in metres are accepted.
  const metres = optics(seed, 'LENS');
  metres.answers.xint = { value: (Number(metres.answers.xint.value) * 100).toPrecision(3), unit: 'm⁻¹' };
  metres.answers.f = { value: (Number(metres.answers.f.value) / 100).toFixed(3), unit: 'm' };
  const mo = phyOpticsGrader.grade(metres, seed);
  assert.equal(by(mo, 'calculations').awarded, 4, by(mo, 'calculations').note);
  assert.equal(by(mo, 'units').awarded, 1);
  // No line: no graph marks; the intercepts still fit the points.
  const noLine = optics(seed, 'LENS');
  noLine.line = null;
  const nl = phyOpticsGrader.grade(noLine, seed);
  assert.equal(by(nl, 'graph').awarded, 0);
  assert.equal(by(nl, 'calculations').awarded, 4);
  // An empty attempt scores nothing and does not throw.
  const empty = phyOpticsGrader.grade(emptyPhyOpticsState(), seed);
  assert.equal(autoTotal(empty), 0, lost(empty));
});

test('optics: the state schema rejects garbage; reciprocal units', () => {
  const ok = optics(5, 'LENS');
  assert.ok(phyOpticsStateSchema.safeParse(ok).success);
  assert.ok(!phyOpticsStateSchema.safeParse({ ...ok, task: 'PRISM' }).success);
  assert.ok(!phyOpticsStateSchema.safeParse({ ...ok, u: 150 }).success);
  assert.ok(!phyOpticsStateSchema.safeParse({ ...ok, screen: -3 }).success);
  assert.ok(!phyOpticsStateSchema.safeParse({ ...ok, rough: 400 }).success);
  assert.ok(!phyOpticsStateSchema.safeParse({ ...ok, readings: Array.from({ length: 13 }, () => ok.readings[0]) }).success);
  assert.ok(!phyOpticsStateSchema.safeParse({ ...ok, table: [{ u: '1', v: '2' }] }).success);
  assert.ok(!phyOpticsStateSchema.safeParse({ ...ok, answers: { ...ok.answers, f: { value: 'x'.repeat(41), unit: 'cm' } } }).success);
  assert.ok(!phyOpticsStateSchema.safeParse({ ...ok, v: 2 }).success);
  assert.ok(!phyOpticsStateSchema.safeParse(null).success);
  assert.equal(phyUnit('cm⁻¹'), 'cm-1');
  assert.equal(phyUnit('cm^-1'), 'cm-1');
  assert.equal(phyUnit('/cm'), 'cm-1');
  assert.equal(phyUnit('m-1'), 'm-1');
});

// ------------------------------------------------------------------ metre rule on a knife edge (principle of moments, mass of the rule)

/** Exact work on the knife edge as the lab records it (marks to 0.1 cm); options introduce typical mistakes. */
function moments(seed: number, task: MomentsTask, o: { noG?: boolean; pivot?: number; xs?: number[]; offBalance?: number; fromZero?: boolean; gLate?: boolean } = {}): PhyMomentsState {
  const v = phyMomentsVariant(seed);
  const s = emptyPhyMomentsState();
  const m = MOMENTS_KNOWN[task];
  s.task = task;
  s.log.push({ t: 0, a: `task:${task}` });
  const g = r1(v.g);
  const doG = () => {
    s.g = g;
    s.log.push({ t: 1, a: `g:${g}` });
    s.answers.g = { value: g.toFixed(1), unit: 'cm' };
  };
  if (!o.noG && !o.gLate) doG();
  for (const x of o.xs ?? MOMENTS_CARD_X[task]) {
    let pivot: number;
    let other: number | null = null;
    if (task === 'MASS') pivot = r1(momentsMassBalance(v, x) + (o.offBalance ?? 0));
    else {
      pivot = o.pivot ?? g;
      other = r1(momentsOtherBalance(v, pivot, x) + (o.offBalance ?? 0));
    }
    s.pivot = pivot;
    s.known = x;
    s.other = other;
    s.readings.push({ pivot, known: x, other });
    const x2 = task === 'MASS' ? pivot : other!;
    const ref = o.pivot ?? g;
    const d1 = o.fromZero ? x : task === 'MASS' ? pivot - x : ref - x;
    const d2 = o.fromZero ? x2 : task === 'MASS' ? g - pivot : x2 - ref;
    s.table.push({ x1: x.toFixed(1), x2: x2.toFixed(1), d1: d1.toFixed(1), d2: d2.toFixed(1), m: ((m * r1(d1)) / r1(d2)).toFixed(1) });
    s.log.push({ t: 2, a: `reading:${x}:${pivot}` });
  }
  if (o.gLate) doG();
  const pts = s.table.map((r) => ({ x: Number(r.d2), y: Number(r.d1) }));
  s.line = lineThrough(pts);
  const fit = phyFit(pts)!;
  const slope = Number(fit.slope.toPrecision(3));
  s.answers.slope = { value: String(slope), unit: '' };
  s.answers.mass = { value: (m * slope).toFixed(1), unit: 'g' };
  const ms = s.table.map((r) => Number(r.m));
  s.answers.mean = { value: (ms.reduce((t, x) => t + x, 0) / ms.length).toFixed(1), unit: 'g' };
  s.written.precautions = 'The rule was balanced horizontally before each reading. The thread loops were thin and the distances measured from the pivot.';
  return s;
}

test('moments: rubric 20; the hidden rule is fixed per seed and in range; the knife-edge physics', () => {
  assert.equal(rubricTotal(PHY_MOMENTS.rubric), 20);
  const a = phyMomentsVariant(11);
  assert.deepEqual(a, phyMomentsVariant(11));
  assert.notDeepEqual(a, phyMomentsVariant(12));
  for (let seed = 1; seed < 300; seed += 7) {
    const v = phyMomentsVariant(seed);
    assert.ok(v.g >= 49.6 && v.g <= 50.6 && v.ruleMass >= 95 && v.ruleMass <= 130 && v.unknown >= 30 && v.unknown <= 70);
    // The rule alone balances at G (to the nearest mm), and not 1 cm away.
    assert.ok(momentsBalanced(v, 'MOMENTS', { pivot: r1(v.g), known: null, other: null }));
    assert.ok(!momentsBalanced(v, 'MOMENTS', { pivot: r1(v.g) + 1, known: null, other: null }));
    // Every card position has a balance point on the rule, reachable to 0.1 cm.
    for (const x of MOMENTS_CARD_X.MOMENTS) {
      const o2 = momentsOtherBalance(v, r1(v.g), x);
      assert.ok(o2 > r1(v.g) && o2 < 99.5, `seed ${seed} x ${x}: ${o2}`);
      assert.ok(momentsBalanced(v, 'MOMENTS', { pivot: r1(v.g), known: x, other: r1(o2) }));
      assert.ok(!momentsBalanced(v, 'MOMENTS', { pivot: r1(v.g), known: x, other: r1(o2) + 1 }));
    }
    for (const x of MOMENTS_CARD_X.MASS) assert.ok(momentsBalanced(v, 'MASS', { pivot: r1(momentsMassBalance(v, x)), known: x, other: null }));
  }
  // Unbalanced, the rule tips towards the heavier side and comes to rest on the bench there.
  const v = phyMomentsVariant(5);
  const l = { pivot: r1(v.g), known: 30, other: null };
  assert.ok(momentsTorque(v, 'MOMENTS', l) < 0);
  assert.ok(momentsRest(v, 'MOMENTS', l) < 0);
  let th = 0;
  let om = 0;
  for (let i = 0; i < 400; i++) ({ th, om } = momentsStep(v, 'MOMENTS', l, th, om, 0.02));
  assert.ok(Math.abs(th - momentsRest(v, 'MOMENTS', l)) < 1e-9);
  assert.ok(momentsStop(v, 'MOMENTS', l, -1) > 0.03 && momentsStop(v, 'MOMENTS', l, -1) < 0.3);
  // Balanced, it stays level.
  const b = { pivot: r1(v.g), known: 30, other: r1(momentsOtherBalance(v, r1(v.g), 30)) };
  ({ th } = momentsStep(v, 'MOMENTS', b, 0, 0, 0.02));
  assert.equal(th, 0);
});

test('moments: exact work earns every AUTO mark in both tasks across 40 seeds', () => {
  for (let k = 0; k < 40; k++) {
    const seed = 3 + k * 7919;
    for (const task of MOMENTS_TASKS) {
      const s = moments(seed, task);
      assert.ok(phyMomentsStateSchema.safeParse(s).success);
      const out = phyMomentsGrader.grade(s, seed);
      assert.equal(autoTotal(out), autoMax(PHY_MOMENTS), `${task} ${seed}: ${lost(out)}`);
      assert.equal(out.ai.length, 1);
    }
  }
});

test('moments: typical mistakes lose the right marks', () => {
  const seed = 42;
  const v = phyMomentsVariant(seed);
  // No G found; G found only after the readings (the mass of the rule needs it first).
  const noG = phyMomentsGrader.grade(moments(seed, 'MOMENTS', { noG: true }), seed);
  assert.equal(by(noG, 'procedure').awarded, 3, by(noG, 'procedure').note);
  assert.equal(by(phyMomentsGrader.grade(moments(seed, 'MASS', { gLate: true }), seed), 'procedure').awarded, 3);
  // The knife edge left at the 45.0 cm mark (not G): the rule's weight then has a moment the student ignores.
  const off = phyMomentsGrader.grade(moments(seed, 'MOMENTS', { pivot: 45 }), seed);
  assert.equal(by(off, 'procedure').awarded, 3, by(off, 'procedure').note);
  assert.equal(by(off, 'balancing').awarded, 3);
  assert.equal(by(off, 'calculations').awarded, 3, by(off, 'calculations').note);
  // Too few positions, close together.
  const few = phyMomentsGrader.grade(moments(seed, 'MASS', { xs: [10, 12, 14] }), seed);
  assert.equal(by(few, 'procedure').awarded, 2, by(few, 'procedure').note);
  // Read off balance: the rule was tipped.
  const tipped = phyMomentsGrader.grade(moments(seed, 'MOMENTS', { offBalance: 2 }), seed);
  assert.equal(by(tipped, 'balancing').awarded, 0, by(tipped, 'balancing').note);
  assert.equal(by(phyMomentsGrader.grade(moments(seed, 'MASS', { offBalance: 1.5 }), seed), 'balancing').awarded, 0);
  // Distances from the zero end instead of the pivot.
  const zero = phyMomentsGrader.grade(moments(seed, 'MOMENTS', { fromZero: true }), seed);
  assert.equal(by(zero, 'readings').awarded, 3, by(zero, 'readings').note);
  // A misread mark and a mark to the wrong number of decimal places.
  const bad = moments(seed, 'MASS');
  bad.table[0]!.x2 = (Number(bad.table[0]!.x2) + 1.5).toFixed(1);
  bad.table[1]!.x1 = '10';
  const bo = phyMomentsGrader.grade(bad, seed);
  assert.equal(by(bo, 'readings').awarded, 1, by(bo, 'readings').note);
  // Slope wrong, M not m × slope, the mean not worked, units missing.
  const calc = moments(seed, 'MOMENTS');
  calc.answers.slope.value = (Number(calc.answers.slope.value) * 1.2).toPrecision(3);
  calc.answers.mass = { value: (v.unknown * 1.3).toFixed(1), unit: '' };
  calc.answers.mean.value = '1';
  const co = phyMomentsGrader.grade(calc, seed);
  assert.equal(by(co, 'calculations').awarded, 0, by(co, 'calculations').note);
  assert.equal(by(co, 'units').awarded, 0);
  // Masses in kg are accepted; a unit on the slope is not.
  const kg = moments(seed, 'MASS');
  kg.answers.mass = { value: (Number(kg.answers.mass.value) / 1000).toFixed(4), unit: 'kg' };
  const ko = phyMomentsGrader.grade(kg, seed);
  assert.equal(by(ko, 'calculations').awarded, 4, by(ko, 'calculations').note);
  assert.equal(by(ko, 'units').awarded, 1);
  kg.answers.slope.unit = 'cm';
  assert.equal(by(phyMomentsGrader.grade(kg, seed), 'units').awarded, 0);
  // No line: no graph marks; the slope from the points still counts.
  const noLine = moments(seed, 'MOMENTS');
  noLine.line = null;
  const nl = phyMomentsGrader.grade(noLine, seed);
  assert.equal(by(nl, 'graph').awarded, 0);
  assert.equal(by(nl, 'calculations').awarded, 4, by(nl, 'calculations').note);
  // An empty attempt scores nothing and does not throw.
  const empty = phyMomentsGrader.grade(emptyPhyMomentsState(), seed);
  assert.equal(autoTotal(empty), 0, lost(empty));
});

test('moments: the state schema rejects garbage; mass units', () => {
  const ok = moments(5, 'MOMENTS');
  assert.ok(phyMomentsStateSchema.safeParse(ok).success);
  assert.ok(!phyMomentsStateSchema.safeParse({ ...ok, task: 'LEVER' }).success);
  assert.ok(!phyMomentsStateSchema.safeParse({ ...ok, pivot: 120 }).success);
  assert.ok(!phyMomentsStateSchema.safeParse({ ...ok, known: -1 }).success);
  assert.ok(!phyMomentsStateSchema.safeParse({ ...ok, g: 'fifty' }).success);
  assert.ok(!phyMomentsStateSchema.safeParse({ ...ok, readings: Array.from({ length: 13 }, () => ok.readings[0]) }).success);
  assert.ok(!phyMomentsStateSchema.safeParse({ ...ok, table: [{ x1: '1', x2: '2' }] }).success);
  assert.ok(!phyMomentsStateSchema.safeParse({ ...ok, answers: { ...ok.answers, mass: { value: 'x'.repeat(41), unit: 'g' } } }).success);
  assert.ok(!phyMomentsStateSchema.safeParse({ ...ok, v: 2 }).success);
  assert.ok(!phyMomentsStateSchema.safeParse(undefined).success);
  assert.equal(phyUnit('g'), 'g');
  assert.equal(phyUnit('grams'), 'g');
  assert.equal(phyUnit('kg'), 'kg');
  assert.equal(phyUnit('cm'), 'cm');
});
