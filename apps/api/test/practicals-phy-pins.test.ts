// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-phy-pins.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DISP_COLOUR_IDS,
  PHY_PINS,
  depthNoParallaxH,
  depthStack,
  dispDmin,
  dispIMin,
  emptyPhyPinsState,
  mirrorConstruction,
  phyFit,
  phyPinsStateSchema,
  phyPinsVariant,
  pinsAlignedPhi,
  pinsEye,
  pinsImage,
  pinsInLine,
  pinsPrism,
  prismConstruction,
  type PhyPinsState,
  type PinsTrace,
} from '@aischool/shared';
import { curveMinimum, phyPinsGrader } from '../src/practicals/graders/phy-pins';
import type { GraderOutput } from '../src/practicals/graders/types';

const by = (out: GraderOutput, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: GraderOutput) => out.auto.reduce((t, c) => t + c.awarded, 0);
const autoMax = PHY_PINS.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
const lost = (out: GraderOutput) => out.auto.filter((c) => c.awarded < c.max).map((c) => `${c.id}: ${c.note}`).join(' | ');
const r2 = (x: number) => Math.round(x * 100) / 100;
const sinD = (d: number) => Math.sin((d * Math.PI) / 180);
const SEEDS = Array.from({ length: 40 }, (_, k) => 1000 + k * 7919);

/** A trace as a careful student makes it: eye moved in 0.1° steps to line up the images, pins pushed in line and stuck to 0.01 cm. */
function trace(seed: number, task: 'MIRROR' | 'PRISM', i: number, eyeOff = 0, p1 = 10, p2 = 3, near = 3, far = 10): PinsTrace {
  const v = phyPinsVariant(seed);
  const phi = Math.round((pinsAlignedPhi(v, task, i)! + eyeOff) * 10) / 10;
  const E = pinsEye(v, task, phi);
  const I2 = pinsImage(v, task, i, p2)!;
  const C = task === 'MIRROR' ? { x: 0, y: 0 } : pinsPrism(v).M2;
  const a = pinsInLine(E, I2, C, near)!;
  const b = pinsInLine(E, I2, C, far)!;
  return { i, normal: true, p1, p2, p3: { x: r2(a.x), y: r2(a.y) }, p4: { x: r2(b.x), y: r2(b.y) }, joined: true };
}
function withLine(s: PhyPinsState, pts: { x: number; y: number }[]): PhyPinsState {
  const fit = phyFit(pts)!;
  const xs = pts.map((p) => p.x);
  const x1 = Math.min(...xs);
  const x2 = Math.max(...xs);
  return { ...s, line: { x1, y1: Number((fit.intercept + fit.slope * x1).toFixed(4)), x2, y2: Number((fit.intercept + fit.slope * x2).toFixed(4)) } };
}

function idealMirror(seed: number, opts: { eyeOff?: number; gap?: number; surface?: boolean } = {}): PhyPinsState {
  const angles = [20, 30, 40, 50, 60];
  const traces = angles.map((i) => trace(seed, 'MIRROR', i, opts.eyeOff ?? 0, 10, opts.gap ? 10 - opts.gap : 3));
  const table = traces.map((t) => {
    const r = Math.round(mirrorConstruction(t)!.r);
    return { i: String(t.i), a: String(opts.surface ? 90 - r : r) };
  });
  let s: PhyPinsState = { ...emptyPhyPinsState(), task: 'MIRROR', traces, table };
  s = withLine(s, table.map((r) => ({ x: Number(r.i), y: Number(r.a) })));
  const slope = ((s.line!.y2 - s.line!.y1) / (s.line!.x2 - s.line!.x1)).toFixed(2);
  return { ...s, answers: { ...s.answers, slope: { value: slope, unit: '' } }, written: { precautions: 'Pins upright and far apart; looked at the bases of the images.', conclusion: 'The angle of reflection equals the angle of incidence, r = i.' } };
}

function idealPrism(seed: number, opts: { straight?: boolean; overA?: boolean; eyeOff?: number } = {}): PhyPinsState {
  const v = phyPinsVariant(seed);
  const sh = pinsPrism(v);
  const angles = [35, 40, 45, 50, 55, 60, 65];
  const traces = angles.map((i) => trace(seed, 'PRISM', i, opts.eyeOff ?? 0));
  const table = traces.map((t) => ({ i: String(t.i), a: prismConstruction(sh, t)!.D.toFixed(1) }));
  const pts = table.map((r) => ({ x: Number(r.i), y: Number(r.a) }));
  const low = curveMinimum(pts)!;
  const dmin = Math.round(low.y * 10) / 10;
  const n = opts.overA ? sinD((60 + dmin) / 2) / sinD(60) : sinD((60 + dmin) / 2) / sinD(30);
  let s: PhyPinsState = { ...emptyPhyPinsState(), task: 'PRISM', traces, table, curve: !opts.straight };
  s = opts.straight ? withLine(s, pts) : { ...s, line: { x1: low.x - 6, y1: dmin, x2: low.x + 6, y2: dmin } };
  return { ...s, answers: { ...s.answers, dmin: { value: dmin.toFixed(1), unit: '°' }, n: { value: n.toFixed(3), unit: '' } }, written: { precautions: 'Pins upright and well spaced; prism outline traced and not moved.', conclusion: '' } };
}

function idealDepth(seed: number, opts: { fromBottom?: boolean; unchecked?: boolean; pinOff?: number; inverted?: boolean } = {}): PhyPinsState {
  const v = phyPinsVariant(seed);
  const readings = [1, 2, 3, 4].map((b) => ({ blocks: b, h: Math.round((depthNoParallaxH(v, b) + (opts.pinOff ?? 0)) * 20) / 20, checked: !opts.unchecked }));
  const rows = readings.map((r) => {
    const top = Math.round(depthStack(v, r.blocks) * 10) / 10;
    const pin = Math.round(r.h * 10) / 10;
    return { real: top.toFixed(1), app: (opts.fromBottom ? pin : top - pin).toFixed(1) };
  });
  let s: PhyPinsState = { ...emptyPhyPinsState(), task: 'DEPTH', depth: { blocks: 4, h: readings[3]!.h, eyeX: 0, readings, rows } };
  const pts = rows.map((r) => ({ x: Number(r.app), y: Number(r.real) }));
  s = withLine(s, pts);
  const slope = (s.line!.y2 - s.line!.y1) / (s.line!.x2 - s.line!.x1);
  const sl = opts.inverted ? 1 / slope : slope;
  return { ...s, answers: { ...s.answers, slope: { value: sl.toFixed(3), unit: '' }, n: { value: sl.toFixed(2), unit: '' } }, written: { precautions: 'Viewed vertically from above; parallax removed by moving my eye from side to side.', conclusion: '' } };
}

function idealDisp(seed: number, opts: { wideOnly?: boolean; reversedMost?: boolean; noFilter?: boolean } = {}): PhyPinsState {
  const v = phyPinsVariant(seed);
  const iG = Math.round(dispIMin(v, 'green'));
  const slit = opts.wideOnly ? ('wide' as const) : ('narrow' as const);
  const looks = [
    { i: iG, slit, dark: true, filter: 'none' as const, dist: 60 },
    ...(opts.noFilter ? [] : [{ i: iG, slit, dark: true, filter: 'red' as const, dist: 60 }]),
  ];
  const dr = Math.round(dispDmin(v, 'red') * 10) / 10;
  const dv = Math.round(dispDmin(v, 'violet') * 10) / 10;
  const s = emptyPhyPinsState();
  return {
    ...s,
    task: 'DISP',
    disp: { ...s.disp, dark: true, slit, i: iG, dist: 60, looks, order: [...DISP_COLOUR_IDS], most: opts.reversedMost ? 'red' : 'violet', least: opts.reversedMost ? 'violet' : 'red', filterObs: opts.noFilter ? '' : 'one-colour', ray: 'violet-more' },
    answers: { ...s.answers, dred: { value: dr.toFixed(1), unit: '°' }, dviol: { value: dv.toFixed(1), unit: '°' }, disp: { value: (dv - dr).toFixed(1), unit: '°' }, n: { value: (sinD((60 + dr) / 2) / sinD(30)).toFixed(3), unit: '' } },
    written: { precautions: 'The room was darkened and a narrow slit was used.', conclusion: 'Each colour has a different refractive index (speed) in glass, so it is refracted by a different amount.' },
    log: [{ t: 1, a: 'look' }, { t: 2, a: 'order' }],
  };
}

test('ideal work gets full auto marks across 40 seeds, every task', () => {
  for (const seed of SEEDS) {
    for (const [name, s] of [
      ['MIRROR', idealMirror(seed)],
      ['PRISM', idealPrism(seed)],
      ['DEPTH', idealDepth(seed)],
      ['DISP', idealDisp(seed)],
    ] as const) {
      assert.ok(phyPinsStateSchema.safeParse(s).success, `${name} schema ${seed}`);
      const out = phyPinsGrader.grade(s, seed);
      assert.equal(autoTotal(out), autoMax, `${name} seed ${seed}: ${lost(out)}`);
      assert.equal(out.ai.length, 1);
      assert.ok(out.solution.length > 2);
    }
  }
});

test('variant: crown glass, 60° ± small prism, blocks', () => {
  for (const seed of SEEDS) {
    const v = phyPinsVariant(seed);
    assert.ok(v.n >= 1.5 && v.n <= 1.54);
    assert.ok(Math.abs(v.A - 60) <= 0.6 + 1e-9);
    assert.equal(v.blocks.length, 4);
  }
});

test('mirror: angles from the surface, pins too close and pins not in line lose the right marks', () => {
  const seed = 4242;
  const surf = phyPinsGrader.grade(idealMirror(seed, { surface: true }), seed);
  assert.ok(by(surf, 'readings').awarded <= 2);
  assert.match(by(surf, 'readings').note, /normal/);
  const close = phyPinsGrader.grade(idealMirror(seed, { gap: 2 }), seed);
  assert.equal(by(close, 'procedure').awarded, 3);
  assert.match(by(close, 'procedure').note, /too close/);
  const off = phyPinsGrader.grade(idealMirror(seed, { eyeOff: 3 }), seed);
  assert.ok(by(off, 'tracing').awarded < 3, lost(off));
  assert.match(by(off, 'tracing').note, /not in line/);
});

test('prism: a straight line and A instead of A/2 are marked down', () => {
  const seed = 777;
  const straight = phyPinsGrader.grade(idealPrism(seed, { straight: true }), seed);
  assert.equal(by(straight, 'graph').awarded, 0);
  const overA = phyPinsGrader.grade(idealPrism(seed, { overA: true }), seed);
  assert.equal(by(overA, 'calculations').awarded, 2);
  assert.match(by(overA, 'calculations').note, /sin\(A\/2\)/);
  const off = phyPinsGrader.grade(idealPrism(seed, { eyeOff: 4 }), seed);
  assert.ok(by(off, 'tracing').awarded < 3);
});

test('depth: from the bottom, no parallax check, pin off and n inverted', () => {
  const seed = 31337;
  const bottom = phyPinsGrader.grade(idealDepth(seed, { fromBottom: true }), seed);
  assert.match(by(bottom, 'readings').note, /from the bottom/);
  const un = phyPinsGrader.grade(idealDepth(seed, { unchecked: true }), seed);
  assert.equal(by(un, 'procedure').awarded, 3);
  const off = phyPinsGrader.grade(idealDepth(seed, { pinOff: 0.6 }), seed);
  assert.equal(by(off, 'tracing').awarded, 0);
  assert.match(by(off, 'tracing').note, /too high/);
  const inv = phyPinsGrader.grade(idealDepth(seed, { inverted: true }), seed);
  assert.match(by(inv, 'calculations').note, /real ÷ apparent/);
});

test('dispersion: wide slit, reversed deviation and no filter test', () => {
  const seed = 99;
  const wide = phyPinsGrader.grade(idealDisp(seed, { wideOnly: true }), seed);
  assert.equal(by(wide, 'procedure').awarded, 3);
  assert.ok(by(wide, 'tracing').awarded <= 1);
  const rev = phyPinsGrader.grade(idealDisp(seed, { reversedMost: true }), seed);
  assert.equal(by(rev, 'readings').awarded, 2);
  const nf = phyPinsGrader.grade(idealDisp(seed, { noFilter: true }), seed);
  assert.equal(by(nf, 'procedure').awarded, 3);
  assert.equal(by(nf, 'graph').awarded, 1);
});

test('an empty state marks zero without throwing, for every task', () => {
  for (const task of ['MIRROR', 'PRISM', 'DEPTH', 'DISP'] as const) {
    const out = phyPinsGrader.grade({ ...emptyPhyPinsState(), task }, 5);
    assert.equal(autoTotal(out), 0, `${task}: ${lost(out)}`);
    assert.equal(out.auto.length, PHY_PINS.rubric.filter((c) => c.how === 'AUTO').length);
  }
});

test('the state schema rejects garbage', () => {
  assert.ok(phyPinsStateSchema.safeParse(emptyPhyPinsState()).success);
  assert.equal(phyPinsStateSchema.safeParse({ ...emptyPhyPinsState(), task: 'LENS' }).success, false);
  assert.equal(phyPinsStateSchema.safeParse({ ...emptyPhyPinsState(), traces: [{ i: 30, normal: true, p1: 'x', p2: null, p3: null, p4: null, joined: false }] }).success, false);
  assert.equal(phyPinsStateSchema.safeParse({ ...emptyPhyPinsState(), disp: { ...emptyPhyPinsState().disp, order: ['pink'] } }).success, false);
  assert.equal(phyPinsStateSchema.safeParse({ ...emptyPhyPinsState(), depth: { ...emptyPhyPinsState().depth, blocks: 9 } }).success, false);
  assert.equal(phyPinsStateSchema.safeParse({ ...emptyPhyPinsState(), log: Array.from({ length: 601 }, () => ({ t: 0, a: 'x' })) }).success, false);
});

test('grading is deterministic', () => {
  const s = idealPrism(123);
  assert.deepEqual(phyPinsGrader.grade(s, 123), phyPinsGrader.grade(s, 123));
});
