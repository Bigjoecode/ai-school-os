// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-phy-mechanics.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FORCES_CARD,
  FRICTION_CARD,
  INCLINE_CARD,
  MECH_TASKS,
  PHY_MECHANICS,
  VISC_BALLS,
  VISC_OIL_BALL,
  emptyPhyMechanicsState,
  forceConstruction,
  forceEquilibrium,
  forceNewton,
  frictionPull,
  frictionTilt,
  frictionWeight,
  inclineAccel,
  inclineReadings,
  phyFit,
  phyMechanicsStateSchema,
  phyMechanicsVariant,
  sbShows,
  viscEtaFromSlope,
  viscReadings,
  viscTerminal,
  type ForceSet,
  type MechTask,
  type PhyMechanicsState,
} from '@aischool/shared';
import { phyMechanicsGrader } from '../src/practicals/graders/phy-mechanics';
import type { GraderOutput } from '../src/practicals/graders/types';

const by = (out: GraderOutput, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: GraderOutput) => out.auto.reduce((t, c) => t + c.awarded, 0);
const autoMax = PHY_MECHANICS.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
const r05 = (x: number) => (Math.round(x * 20) / 20).toFixed(2);
const log = (...a: string[]) => a.map((x, i) => ({ t: i * 1000, a: x }));
const lineOf = (pts: { x: number; y: number }[]) => {
  const fit = phyFit(pts)!;
  const xs = pts.map((p) => p.x);
  const a = Math.min(...xs);
  const b = Math.max(...xs);
  return { fit, line: { x1: a, y1: fit.intercept + fit.slope * a, x2: b, y2: fit.intercept + fit.slope * b } };
};
const PREC = 'The pull was increased slowly and gradually, and the reading taken just as the block starts to move. Readings were repeated and averaged.';

// ------------------------------------------------------------------ ideal builders

function friction(seed: number, o: { noZero?: boolean; jerk?: boolean; sliding?: boolean; sinTheta?: boolean; fast?: boolean; dusty?: boolean } = {}): PhyMechanicsState {
  const v = phyMechanicsVariant(seed);
  const s = emptyPhyMechanicsState();
  s.task = 'FRICTION';
  const entries = ['task:FRICTION'];
  if (!o.noZero) (s.zeroed = true), entries.push('zero');
  if (!o.dusty) (s.wiped = true), entries.push('wipe');
  const loads = FRICTION_CARD.slice(0, 5);
  for (const L of loads) {
    s.weighs.push({ load: L, zeroed: s.zeroed });
    entries.push(`weigh:${L}`);
    const F: number[] = [];
    for (let i = 0; i < 2; i++) {
      const p = { load: L, zeroed: s.zeroed, jerk: !!o.jerk, wiped: s.wiped };
      const k = s.pulls.length;
      s.pulls.push(p);
      entries.push(`pull:${L}`);
      const r = frictionPull(v, k, p);
      F.push(Number(r05(o.sliding ? r.sliding : r.limit)));
    }
    const R = r05(sbShows(v, frictionWeight(v, L), s.zeroed));
    s.rows.push({ key: L, c: { m: String(L * 100), R, F1: F[0]!.toFixed(2), F2: F[1]!.toFixed(2), F: ((F[0]! + F[1]!) / 2).toFixed(2) } });
  }
  const th: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t = { load: 0, fast: !!o.fast, wiped: s.wiped };
    s.tilts.push(t);
    entries.push('tilt:0');
    th.push(Math.round(frictionTilt(v, i, t)));
  }
  const thm = th.reduce((a, b) => a + b, 0) / 3;
  s.cells = { th1: String(th[0]), th2: String(th[1]), th3: String(th[2]), th: thm.toFixed(1) };
  const pts = s.rows.map((r) => ({ x: Number(r.c.R), y: Number(r.c.F) }));
  const { fit, line } = lineOf(pts);
  s.line = line;
  s.answers.slope = { value: fit.slope.toPrecision(3), unit: '' };
  const t = Number(thm.toFixed(1)) * (Math.PI / 180);
  s.answers.mutan = { value: (o.sinTheta ? Math.sin(t) : Math.tan(t)).toPrecision(3), unit: '' };
  s.written.precautions = PREC;
  s.log = log(...entries);
  return s;
}

function viscosity(seed: number, o: { wall?: boolean; eyeFixed?: boolean; topAt?: number; diameter?: boolean; noOil?: boolean; siSlope?: boolean } = {}): PhyMechanicsState {
  const v = phyMechanicsVariant(seed);
  const s = emptyPhyMechanicsState();
  s.task = 'VISCOSITY';
  const top = o.topAt ?? 8;
  const bot = top + 20;
  Object.assign(s, { top, bot, centre: !o.wall, eyeLevel: !o.eyeFixed });
  const entries = ['task:VISCOSITY'];
  for (let b = 0; b < VISC_BALLS.length; b++) {
    s.measured.push(b);
    entries.push(`measure:${b}`);
    for (let i = 0; i < 2; i++) s.drops.push({ ball: b, liquid: 'glycerine', centre: !o.wall, eyeLevel: !o.eyeFixed, top, bot, reset: true });
  }
  if (!o.noOil) s.drops.push({ ball: VISC_OIL_BALL, liquid: 'oil', centre: !o.wall, eyeLevel: !o.eyeFixed, top, bot, reset: true });
  const t = viscReadings(v, s.drops);
  for (let b = 0; b < VISC_BALLS.length; b++) {
    const d = v.balls[b]!.toFixed(2);
    const r = Number(d) / 2;
    const t1 = t[2 * b]!;
    const t2 = t[2 * b + 1]!;
    const tm = Number(((t1 + t2) / 2).toFixed(2));
    s.rows.push({ key: b, c: { d, r: r.toFixed(3), r2: (r * r).toFixed(3), t1: t1.toFixed(2), t2: t2.toFixed(2), t: tm.toFixed(2), v: (20 / tm).toPrecision(3) } });
  }
  s.cells.L = '20.0';
  if (!o.noOil) {
    const ot = t[t.length - 1]!;
    s.cells.od = v.balls[VISC_OIL_BALL]!.toFixed(2);
    s.cells.ot = ot.toFixed(2);
    s.cells.ov = (20 / ot).toPrecision(3);
    s.answers.ratio = { value: (Number(s.cells.ov) / Number(s.rows[VISC_OIL_BALL]!.c.v)).toPrecision(3), unit: '' };
  }
  const pts = s.rows.map((r) => ({ x: Number(r.c.r2), y: Number(r.c.v) }));
  const { fit, line } = lineOf(pts);
  s.line = line;
  const slope = Number(fit.slope.toPrecision(3));
  s.answers.slope = o.siSlope ? { value: String(slope * 1e4), unit: 'm-1 s-1' } : { value: String(slope), unit: 'cm s-1 mm-2' };
  s.answers.eta = { value: viscEtaFromSlope(o.diameter ? slope * 4 : slope, 9.81).toPrecision(3), unit: 'Pa s' };
  s.written.precautions = 'The upper band was well below the surface so the ball had reached terminal velocity. The ball was dropped along the axis, away from the walls.';
  s.log = log(...entries);
  return s;
}

function incline(seed: number, o: { push?: boolean; noReset?: boolean; noHalf?: boolean; mixedBlocks?: boolean; stops?: number[] } = {}): PhyMechanicsState {
  const v = phyMechanicsVariant(seed);
  const s = emptyPhyMechanicsState();
  s.task = 'INCLINE';
  const stops = o.stops ?? INCLINE_CARD;
  stops.forEach((stop, j) => {
    for (let i = 0; i < 3; i++) s.runs.push({ blocks: o.mixedBlocks && j >= 2 ? 2 : 3, stop, push: !!o.push, reset: !o.noReset });
  });
  const t = inclineReadings(v, s.runs);
  stops.forEach((stop, j) => {
    const ts = [t[3 * j]!, t[3 * j + 1]!, t[3 * j + 2]!];
    const tm = Number((ts.reduce((a, b) => a + b, 0) / 3).toFixed(2));
    s.rows.push({ key: stop, c: { s: (stop / 100).toFixed(2), t1: ts[0]!.toFixed(2), t2: ts[1]!.toFixed(2), t3: ts[2]!.toFixed(2), t: tm.toFixed(2), tt: (tm * tm).toFixed(3) } });
  });
  const pts = s.rows.map((r) => ({ x: Number(r.c.tt), y: Number(r.c.s) }));
  const { fit, line } = lineOf(pts);
  s.line = line;
  const slope = Number(fit.slope.toPrecision(3));
  s.answers.slope = { value: String(slope), unit: 'm s-2' };
  s.answers.accel = { value: (o.noHalf ? slope : 2 * slope).toPrecision(3), unit: 'm s-2' };
  s.written.precautions = 'The ball was released from rest without pushing. The angle of the plank was kept constant and each time was repeated and averaged.';
  s.log = log('task:INCLINE', ...s.runs.map((r) => `run:${r.stop}`));
  return s;
}

function forces(seed: number, o: { untapped?: boolean; near?: boolean; scale?: number; wrongLen?: boolean } = {}): PhyMechanicsState {
  const v = phyMechanicsVariant(seed);
  const s = emptyPhyMechanicsState();
  s.task = 'FORCES';
  s.masses = { ...FORCES_CARD };
  s.tapped = !o.untapped;
  const dots = (['P', 'Q', 'W'] as const).flatMap((th) => [
    { th, d: 3, tapped: !o.untapped },
    { th, d: o.near ? 5 : 11, tapped: !o.untapped },
  ]);
  const set: ForceSet = { ...FORCES_CARD, dots, moved: false, off: true, built: true };
  s.sets = [set];
  const k = o.scale ?? 0.5;
  const P = forceNewton(set.P);
  const Q = forceNewton(set.Q);
  const W = forceNewton(set.W);
  const oa = Number((P / k + (o.wrongLen ? 1 : 0)).toFixed(1));
  const ob = Number((Q / k).toFixed(1));
  const con = forceConstruction(v, set, 0, oa, ob)!;
  const oc = Number(con.oc.toFixed(1));
  const R = oc * k;
  s.rows = [{ key: 0, c: { P: P.toFixed(1), Q: Q.toFixed(1), W: W.toFixed(1), OA: oa.toFixed(1), OB: ob.toFixed(1), OC: oc.toFixed(1), R: R.toFixed(2), ang: Math.round(con.angle).toString(), diff: (((R - W) / W) * 100).toFixed(1) } }];
  s.answers.scale = { value: String(k), unit: 'N/cm' };
  s.written.precautions = 'The board was tapped so the pulleys were free from friction. The dots were well separated and a large scale was used.';
  s.log = log('task:FORCES', 'tap', ...dots.map((d) => `dot:${d.th}`), 'paper-off', 'build');
  return s;
}

const IDEAL: Record<MechTask, (seed: number) => PhyMechanicsState> = { FRICTION: (x) => friction(x), VISCOSITY: (x) => viscosity(x), INCLINE: (x) => incline(x), FORCES: (x) => forces(x) };

// ------------------------------------------------------------------ tests

test('ideal work gets full auto marks across 40 seeds, every task', () => {
  for (const task of MECH_TASKS) {
    for (let seed = 1; seed <= 40; seed++) {
      const s = IDEAL[task](seed);
      assert.ok(phyMechanicsStateSchema.safeParse(s).success, `${task} schema seed ${seed}`);
      const out = phyMechanicsGrader.grade(s, seed);
      assert.equal(autoTotal(out), autoMax, `${task} seed ${seed}: ${out.auto.filter((c) => c.awarded < c.max).map((c) => `${c.id} ${c.awarded}/${c.max}: ${c.note}`).join(' | ')}`);
      assert.equal(out.ai.length, 1);
      assert.ok(out.solution.length >= 4);
    }
  }
});

test('variant: deterministic, physical ranges', () => {
  assert.deepEqual(phyMechanicsVariant(7), phyMechanicsVariant(7));
  assert.notDeepEqual(phyMechanicsVariant(7), phyMechanicsVariant(8));
  for (let seed = 1; seed <= 30; seed++) {
    const v = phyMechanicsVariant(seed);
    assert.ok(v.muK < v.muS);
    assert.ok(frictionWeight(v, 5) < 10, 'the loaded block fits the 0–10 N balance');
    const p = frictionPull(v, 0, { load: 2, zeroed: true, jerk: false, wiped: true });
    assert.ok(p.sliding < p.limit, 'kinetic friction is less than limiting');
    assert.ok(Math.abs(frictionTilt(v, 0, { load: 0, fast: false, wiped: true }) - frictionTilt(v, 0, { load: 4, fast: false, wiped: true })) < 1e-9, 'the angle does not depend on the load');
    // v ∝ r² nearly (Stokes), larger balls faster, the wall slows
    const vs = VISC_BALLS.map((_, b) => viscTerminal(v, b, 'glycerine'));
    assert.ok(vs.every((x, i) => i === 0 || x > vs[i - 1]!));
    assert.ok(viscTerminal(v, 2, 'glycerine', false) < vs[2]!);
    assert.ok(viscTerminal(v, 2, 'oil') > 5 * vs[2]!);
    const a = inclineAccel(v, 3);
    assert.ok(a > 0.4 && a < 0.62, `a ${a}`);
    assert.ok(forceEquilibrium(v, FORCES_CARD, true, 0).ok);
  }
});

test('friction: zero error, jerks, kinetic readings and sin θ lose the right marks', () => {
  const seed = 5;
  const ok = phyMechanicsGrader.grade(friction(seed), seed);
  assert.equal(autoTotal(ok), autoMax);
  const noZero = phyMechanicsGrader.grade(friction(seed, { noZero: true }), seed);
  assert.equal(by(noZero, 'care').awarded, 1);
  assert.match(by(noZero, 'care').note, /zero/);
  const jerk = phyMechanicsGrader.grade(friction(seed, { jerk: true }), seed);
  assert.equal(by(jerk, 'care').awarded, 1);
  assert.ok(by(jerk, 'calculations').awarded < 4);
  const sliding = phyMechanicsGrader.grade(friction(seed, { sliding: true }), seed);
  assert.ok(by(sliding, 'readings').awarded <= 3);
  assert.match(by(sliding, 'readings').note, /sliding/);
  const sin = phyMechanicsGrader.grade(friction(seed, { sinTheta: true }), seed);
  assert.ok(by(sin, 'calculations').awarded <= 3);
  assert.match(by(sin, 'calculations').note, /tan θ, not sin θ/);
  const dusty = phyMechanicsGrader.grade(friction(seed, { dusty: true }), seed);
  assert.equal(by(dusty, 'care').awarded, 1);
  const s = friction(seed);
  s.answers.slope.unit = 'N';
  assert.equal(by(phyMechanicsGrader.grade(s, seed), 'units').awarded, 0);
});

test('viscosity: near the wall, the band at the surface, diameter for radius, SI slope', () => {
  const seed = 9;
  const wall = phyMechanicsGrader.grade(viscosity(seed, { wall: true }), seed);
  assert.equal(by(wall, 'care').awarded, 1);
  const eye = phyMechanicsGrader.grade(viscosity(seed, { eyeFixed: true }), seed);
  assert.equal(by(eye, 'care').awarded, 1);
  const top = phyMechanicsGrader.grade(viscosity(seed, { topAt: 2 }), seed);
  assert.equal(by(top, 'procedure').awarded, 3);
  const dia = phyMechanicsGrader.grade(viscosity(seed, { diameter: true }), seed);
  assert.ok(by(dia, 'calculations').awarded <= 2);
  assert.match(by(dia, 'calculations').note, /radius/);
  const si = phyMechanicsGrader.grade(viscosity(seed, { siSlope: true }), seed);
  assert.equal(autoTotal(si), autoMax);
  const noOil = phyMechanicsGrader.grade(viscosity(seed, { noOil: true }), seed);
  assert.equal(by(noOil, 'calculations').awarded, 3);
});

test('incline: a push, no reset, the missing ½ and a changed angle', () => {
  const seed = 13;
  const push = phyMechanicsGrader.grade(incline(seed, { push: true }), seed);
  assert.equal(by(push, 'care').awarded, 1);
  assert.ok(by(push, 'calculations').awarded <= 3);
  const noReset = phyMechanicsGrader.grade(incline(seed, { noReset: true }), seed);
  assert.equal(by(noReset, 'procedure').awarded, 3);
  assert.ok(by(noReset, 'calculations').awarded <= 2);
  const half = phyMechanicsGrader.grade(incline(seed, { noHalf: true }), seed);
  assert.match(by(half, 'calculations').note, /½/);
  const mixed = phyMechanicsGrader.grade(incline(seed, { mixedBlocks: true }), seed);
  assert.equal(by(mixed, 'care').awarded, 1);
  const few = phyMechanicsGrader.grade(incline(seed, { stops: [40, 60, 80] }), seed);
  assert.equal(by(few, 'procedure').awarded, 2);
});

test('forces: an untapped board, close dots, a small scale and wrong lengths', () => {
  const seed = 21;
  const un = phyMechanicsGrader.grade(forces(seed, { untapped: true }), seed);
  assert.equal(by(un, 'care').awarded, 1);
  const near = phyMechanicsGrader.grade(forces(seed, { near: true }), seed);
  assert.equal(by(near, 'graph').awarded, 1);
  const small = phyMechanicsGrader.grade(forces(seed, { scale: 1 }), seed);
  assert.equal(by(small, 'care').awarded, 1);
  const wrong = phyMechanicsGrader.grade(forces(seed, { wrongLen: true }), seed);
  assert.equal(by(wrong, 'graph').awarded, 1);
  assert.ok(by(wrong, 'calculations').awarded < 4);
  const cmPerN = forces(seed);
  cmPerN.answers.scale = { value: '2', unit: 'cm/N' };
  assert.equal(autoTotal(phyMechanicsGrader.grade(cmPerN, seed)), autoMax);
});

test('an empty state marks zero without throwing, for every task', () => {
  for (const task of [...MECH_TASKS, null]) {
    const s = { ...emptyPhyMechanicsState(), task };
    const out = phyMechanicsGrader.grade(s, 3);
    assert.equal(autoTotal(out), 0, `${task}: ${out.auto.filter((c) => c.awarded).map((c) => c.id).join(',')}`);
  }
});

test('the state schema rejects garbage', () => {
  const ok = friction(2);
  assert.ok(phyMechanicsStateSchema.safeParse(ok).success);
  assert.ok(!phyMechanicsStateSchema.safeParse({ ...ok, task: 'PULLEY' }).success);
  assert.ok(!phyMechanicsStateSchema.safeParse({ ...ok, load: 9 }).success);
  assert.ok(!phyMechanicsStateSchema.safeParse({ ...ok, pulls: [{ load: 1 }] }).success);
  assert.ok(!phyMechanicsStateSchema.safeParse({ ...ok, rows: Array.from({ length: 9 }, () => ok.rows[0]) }).success);
  assert.ok(!phyMechanicsStateSchema.safeParse({ ...ok, cells: { 'bad key!': '1' } }).success);
  assert.ok(!phyMechanicsStateSchema.safeParse({ ...ok, answers: { ...ok.answers, slope: { value: 'x'.repeat(41), unit: '' } } }).success);
  assert.ok(!phyMechanicsStateSchema.safeParse({ ...ok, masses: { P: 12, Q: 1, W: 1 } }).success);
  assert.ok(!phyMechanicsStateSchema.safeParse({ ...ok, v: 2 }).success);
  assert.ok(!phyMechanicsStateSchema.safeParse(undefined).success);
});

test('grading is deterministic', () => {
  for (const task of MECH_TASKS) {
    const s = IDEAL[task](17);
    assert.deepEqual(phyMechanicsGrader.grade(s, 17), phyMechanicsGrader.grade(structuredClone(s), 17));
  }
});
