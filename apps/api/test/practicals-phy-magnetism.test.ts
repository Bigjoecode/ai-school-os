// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-phy-magnetism.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DIODE_CARD_FWD,
  DIODE_CARD_REV,
  EM_CARD,
  MAG_TASKS,
  PHY_MAGNETISM,
  diodePotFor,
  diodeReading,
  emClipsMean,
  emLift,
  emRheoFor,
  emptyPhyMagnetismState,
  emSettingKey,
  fieldNeutrals,
  fieldTrace,
  fieldTrueDistances,
  indCardEmf,
  indDeflection,
  indShown,
  phyFit,
  phyMagnetismStateSchema,
  phyMagnetismVariant,
  sheetCfg,
  type DiodeRead,
  type EmCore,
  type EmLift,
  type FieldFacing,
  type FieldSheet,
  type IndMove,
  type MagTask,
  type PhyMagnetismState,
} from '@aischool/shared';
import { phyMagnetismGrader } from '../src/practicals/graders/phy-magnetism';
import type { GraderOutput } from '../src/practicals/graders/types';

const by = (out: GraderOutput, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: GraderOutput) => out.auto.reduce((t, c) => t + c.awarded, 0);
const autoMax = PHY_MAGNETISM.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
const log = (...a: string[]) => a.map((x, i) => ({ t: i * 1000, a: x }));
const lineOf = (pts: { x: number; y: number }[]) => {
  const fit = phyFit(pts)!;
  const xs = pts.map((p) => p.x);
  const a = Math.min(...xs);
  const b = Math.max(...xs);
  return { fit, line: { x1: a, y1: fit.intercept + fit.slope * a, x2: b, y2: fit.intercept + fit.slope * b } };
};
const half = (x: number) => Math.round(x * 2) / 2;

// ------------------------------------------------------------------ ideal builders

function field(seed: number, o: { noMeridian?: boolean; steel?: boolean; untapped?: boolean; large?: boolean; noArrows?: boolean; noReverse?: boolean; badRatio?: boolean } = {}): PhyMagnetismState {
  const v = phyMagnetismVariant(seed);
  const s = emptyPhyMagnetismState();
  s.task = 'FIELD';
  s.meridian = !o.noMeridian;
  s.steelAway = !o.steel;
  s.tapEach = !o.untapped;
  s.compass = o.large ? 'large' : 'small';
  const sheet = (facing: FieldFacing): FieldSheet => {
    const sh: FieldSheet = { facing, arr: 'one', aligned: s.meridian, steel: !s.steelAway, lines: [], neutrals: [], arrows: !o.noArrows, closed: true };
    const cfg = sheetCfg(sh);
    const i = s.sheets.length;
    for (let st = 2; st < 10; st++) {
      const l = { start: st, dots: 0, tapped: !o.untapped, compass: s.compass };
      const tr = fieldTrace(v, cfg, i, sh.lines.length, l, null);
      sh.lines.push({ ...l, dots: tr.dots.length - 1 });
    }
    sh.neutrals = fieldNeutrals(v, cfg).map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
    return sh;
  };
  s.sheets.push(sheet('north'));
  if (!o.noReverse) s.sheets.push(sheet('south'));
  const d = (p: { x: number; y: number } | undefined) => (p ? Math.hypot(p.x, p.y).toFixed(1) : '');
  const N = s.sheets[0]!;
  const S = s.sheets[1];
  s.cells = { xe: d(N.neutrals.find((p) => p.x > 0)), yw: d(N.neutrals.find((p) => p.x < 0)), an: d(S?.neutrals.find((p) => p.y > 0)), as: d(S?.neutrals.find((p) => p.y < 0)) };
  const me = (Number(s.cells.xe) + Number(s.cells.yw)) / 2;
  const ma = (Number(s.cells.an) + Number(s.cells.as)) / 2;
  s.answers.me = { value: me.toFixed(2), unit: 'cm' };
  s.answers.ma = { value: ma.toFixed(2), unit: 'cm' };
  s.answers.ratio = { value: (o.badRatio ? me / ma : ma / me).toPrecision(3), unit: '' };
  s.written.precautions = 'The board was far from iron objects. The compass was tapped gently before marking each dot.';
  s.log = log('task:FIELD', ...(s.meridian ? ['meridian'] : []), 'line');
  return s;
}

function electromagnet(seed: number, o: { core?: EmCore; noOpen?: boolean; mixed?: boolean; noNone?: boolean; slopeAll?: boolean } = {}): PhyMagnetismState {
  const v = phyMagnetismVariant(seed);
  const s = emptyPhyMagnetismState();
  s.task = 'ELECTROMAGNET';
  const core = o.core ?? 'iron';
  let heat = 0;
  const add = (turns: number, I: number, c: EmCore, n = 2) => {
    for (let i = 0; i < n; i++) {
      const l: EmLift = { turns, mixed: !!o.mixed, core: c, rheo: Number(emRheoFor(v, turns, I).toFixed(4)), heat: o.noOpen ? heat++ : 0 };
      s.lifts.push(l);
    }
  };
  for (const I of EM_CARD) add(30, I, core);
  add(60, 1.0, core);
  if (!o.noNone) add(30, 1.0, 'none');
  const keys = [...new Set(s.lifts.map(emSettingKey))];
  keys.forEach((key, i) => {
    const ls = s.lifts.map((l, k) => ({ l, k })).filter((x) => emSettingKey(x.l) === key);
    const r = ls.map((x) => emLift(v, x.k, x.l));
    const c1 = r[0]!.clips;
    const c2 = r[1]!.clips;
    s.rows.push({ key: i, c: { N: String(ls[0]!.l.turns), I: (Math.round(r[0]!.I * 20) / 20).toFixed(2), c1: String(c1), c2: String(c2), c: ((c1 + c2) / 2).toFixed(1) } });
  });
  if (!o.noNone) s.cells.nc = s.rows[5]!.c.c1!;
  const pts = s.rows.slice(0, 4).map((r) => ({ x: Number(r.c.I), y: Number(r.c.c) }));
  const { fit, line } = lineOf(o.slopeAll ? pts : pts.slice(0, 3));
  s.line = line;
  s.answers.slope = { value: fit.slope.toPrecision(3), unit: 'A-1' };
  s.answers.rturns = { value: (Number(s.rows[4]!.c.c) / Number(s.rows[1]!.c.c)).toPrecision(3), unit: '' };
  s.written.precautions = 'Clips of the same size were used. The key was opened between readings so the coil did not heat up.';
  s.log = log('task:ELECTROMAGNET', ...s.lifts.map(() => 'lift'));
  return s;
}

function induction(seed: number, o: { side?: boolean; near?: boolean; no600?: boolean; lenzS?: boolean } = {}): PhyMagnetismState {
  const v = phyMagnetismVariant(seed);
  const s = emptyPhyMagnetismState();
  s.task = 'INDUCTION';
  const base: Omit<IndMove, 'kind'> = { coil: 200, pole: 'N', magnets: 1, speed: 'slow', axis: !o.side, galvoFar: !o.near };
  const seq: IndMove[] = [
    { ...base, kind: 'in' },
    { ...base, kind: 'still' },
    { ...base, kind: 'out' },
    { ...base, speed: 'fast', kind: 'in' },
    { ...base, speed: 'fast', kind: 'out' },
    { ...base, pole: 'S', kind: 'in' },
    { ...base, pole: 'S', kind: 'out' },
    { ...base, magnets: 2, kind: 'in' },
    { ...base, magnets: 2, kind: 'out' },
    ...(o.no600 ? [] : [{ ...base, coil: 600, kind: 'in' } as IndMove, { ...base, coil: 600, kind: 'out' } as IndMove]),
  ];
  s.moves = seq;
  seq.forEach((m, k) => {
    const d = indShown(indDeflection(v, k, m));
    s.rows.push({ key: k, c: { dir: Math.abs(d) < 0.75 ? '0' : d > 0 ? 'R' : 'L', size: Math.abs(half(Math.abs(d)) < 0.75 ? 0 : half(Math.abs(d))).toFixed(1) } });
  });
  const sz = (k: number) => Number(s.rows[k]!.c.size);
  const E = indCardEmf(v);
  s.answers.emf = { value: E.toPrecision(3), unit: 'V' };
  s.answers.emf2 = { value: (2 * E).toPrecision(3), unit: 'V' };
  s.answers.rspeed = { value: (sz(3) / sz(0)).toPrecision(3), unit: '' };
  if (!o.no600) s.answers.rturns = { value: (sz(9) / sz(0)).toPrecision(3), unit: '' };
  s.answers.lenz = { value: o.lenzS ? 'S' : 'N', unit: '' };
  s.written.precautions = 'The connections were firm. The magnet was moved along the axis of the coil and the galvanometer was kept away from the magnet.';
  s.log = log('task:INDUCTION', ...seq.map((m) => `move:${m.kind}`));
  return s;
}

function diode(seed: number, o: { noR?: boolean; both?: boolean; warm?: boolean; revPositive?: boolean; mA?: boolean } = {}): PhyMagnetismState {
  const v = phyMagnetismVariant(seed);
  const s = emptyPhyMagnetismState();
  s.task = 'DIODE';
  let heat = 0;
  const take = (bias: 'fwd' | 'rev', target: number) => {
    const c = { bias, resistor: !o.noR, vm: o.both ? ('both' as const) : ('diode' as const), heat: o.warm ? heat++ : 0 };
    const pot = Number(diodePotFor(v, c, target).toFixed(4));
    const r: DiodeRead = { ...c, pot, range: bias === 'fwd' && target < 1 ? 1 : 10, open: false };
    const k = s.reads.length;
    s.reads.push(r);
    const x = diodeReading(v, r);
    const V = x.V ?? 0;
    s.rows.push({ key: k, c: { V: bias === 'fwd' ? V.toFixed(2) : `${o.revPositive ? '' : '-'}${V.toFixed(1)}`, I: bias === 'fwd' ? half(x.mA ?? 0).toFixed(1) : '0.0' } });
  };
  for (const t of DIODE_CARD_FWD) take('fwd', t);
  for (const t of DIODE_CARD_REV) take('rev', t);
  const pts = s.rows.map((r) => ({ x: Number(r.c.V), y: Number(r.c.I) }));
  const f = pts.filter((p) => p.x > 0);
  const Imax = Math.max(...f.map((p) => p.y));
  const steep = f.filter((p) => p.y >= 0.3 * Imax && p.y > 2);
  const { fit, line } = steep.length >= 2 ? lineOf(steep) : { fit: { slope: 1, intercept: 0 }, line: null };
  s.line = line;
  s.answers.knee = { value: (-fit.intercept / fit.slope).toFixed(2), unit: 'V' };
  s.answers.rdyn = { value: ((o.mA ? 1 : 1000) / fit.slope).toPrecision(3), unit: 'Ω' };
  const r70 = s.rows[8]!;
  s.answers.rstat = { value: (Number(r70.c.V) / (Number(r70.c.I) / 1000)).toPrecision(3), unit: 'ohm' };
  s.written.precautions = 'A protective resistor was used. Small steps were taken near the knee and the key was opened between readings.';
  s.log = log('task:DIODE', ...s.reads.map(() => 'read'));
  return s;
}

const IDEAL: Record<MagTask, (seed: number) => PhyMagnetismState> = { FIELD: (x) => field(x), ELECTROMAGNET: (x) => electromagnet(x), INDUCTION: (x) => induction(x), DIODE: (x) => diode(x) };

// ------------------------------------------------------------------ tests

test('ideal work gets full auto marks across 40 seeds, every task', () => {
  for (const task of MAG_TASKS) {
    for (let seed = 1; seed <= 40; seed++) {
      const s = IDEAL[task](seed);
      const p = phyMagnetismStateSchema.safeParse(s);
      assert.ok(p.success, `${task} schema seed ${seed}: ${p.success ? '' : JSON.stringify(p.error.issues.slice(0, 2))}`);
      const out = phyMagnetismGrader.grade(s, seed);
      assert.equal(autoTotal(out), autoMax, `${task} seed ${seed}: ${out.auto.filter((c) => c.awarded < c.max).map((c) => `${c.id} ${c.awarded}/${c.max}: ${c.note}`).join(' | ')}`);
      assert.equal(out.ai.length, 1);
      assert.ok(out.solution.length >= 4);
    }
  }
});

test('variant: deterministic, physical ranges', () => {
  assert.deepEqual(phyMagnetismVariant(7), phyMagnetismVariant(7));
  assert.notDeepEqual(phyMagnetismVariant(7), phyMagnetismVariant(8));
  for (let seed = 1; seed <= 30; seed++) {
    const v = phyMagnetismVariant(seed);
    const t = fieldTrueDistances(v);
    assert.ok(t.eq > 6 && t.eq < 10, `eq ${t.eq}`);
    assert.ok(t.ax > t.eq * 1.2 && t.ax < 15, `ax ${t.ax}`);
    // N north: on the east–west line; N south: on the axis
    const nN = fieldNeutrals(v, { facing: 'north', arr: 'one', aligned: true, steel: false });
    assert.equal(nN.length, 2);
    assert.ok(nN.every((p) => Math.abs(p.y) < 0.01));
    const nS = fieldNeutrals(v, { facing: 'south', arr: 'one', aligned: true, steel: false });
    assert.ok(nS.every((p) => Math.abs(p.x) < 0.01));
    // the electromagnet saturates; no core holds nothing
    const c = EM_CARD.map((I) => emClipsMean(v, 30, false, 'iron', I));
    assert.ok(c.every((x, i) => i === 0 || x > c[i - 1]!));
    assert.ok(c[3]! - c[2]! < c[1]! - c[0]!, 'the curve bends over');
    assert.ok(emClipsMean(v, 30, false, 'none', 2) < 0.6);
    // induction: Lenz reverses; still gives nothing; more turns more
    const m: IndMove = { kind: 'in', coil: 200, pole: 'N', magnets: 1, speed: 'slow', axis: true, galvoFar: true };
    assert.ok(Math.sign(indDeflection(v, 0, m)) === -Math.sign(indDeflection(v, 0, { ...m, kind: 'out' })));
    assert.ok(Math.sign(indDeflection(v, 0, m)) === -Math.sign(indDeflection(v, 0, { ...m, pole: 'S' })));
    assert.equal(indDeflection(v, 0, { ...m, kind: 'still' }), 0);
    assert.ok(Math.abs(indDeflection(v, 0, { ...m, coil: 600 })) > 2 * Math.abs(indDeflection(v, 0, m)));
    // the diode: little current below 0.5 V, steep above; reverse ≈ 0
    const c0 = { bias: 'fwd' as const, resistor: true, vm: 'diode' as const, heat: 0 };
    const at = (V: number) => diodeReading(v, { ...c0, pot: diodePotFor(v, c0, V), range: 1, open: false }).mA!;
    assert.ok(at(0.5) < 1.5 && at(0.7) > 12 && at(0.7) < 35, `${at(0.5)} ${at(0.7)}`);
    assert.ok(Math.abs(diodeReading(v, { ...c0, bias: 'rev', pot: 0.9, range: 10, open: false }).mA!) < 0.01);
  }
});

test('field: no meridian, steel, an untapped or large compass, no arrows, no reversal', () => {
  const seed = 5;
  const nm = phyMagnetismGrader.grade(field(seed, { noMeridian: true }), seed);
  assert.equal(by(nm, 'care').awarded, 1);
  assert.match(by(nm, 'care').note, /meridian/);
  assert.ok(by(nm, 'graph').awarded <= 1);
  const st = phyMagnetismGrader.grade(field(seed, { steel: true }), seed);
  assert.equal(by(st, 'care').awarded, 1);
  const un = phyMagnetismGrader.grade(field(seed, { untapped: true }), seed);
  assert.equal(by(un, 'care').awarded, 1);
  const lg = phyMagnetismGrader.grade(field(seed, { large: true }), seed);
  assert.equal(by(lg, 'care').awarded, 1);
  const na = phyMagnetismGrader.grade(field(seed, { noArrows: true }), seed);
  assert.equal(by(na, 'procedure').awarded, 3);
  const nr = phyMagnetismGrader.grade(field(seed, { noReverse: true }), seed);
  assert.equal(by(nr, 'procedure').awarded, 3);
  const br = phyMagnetismGrader.grade(field(seed, { badRatio: true }), seed);
  assert.equal(by(br, 'calculations').awarded, 2);
});

test('electromagnet: steel core, key left closed, mixed winding, no core test, the slope over all points', () => {
  const seed = 9;
  const st = phyMagnetismGrader.grade(electromagnet(seed, { core: 'steel' }), seed);
  assert.equal(by(st, 'care').awarded, 1);
  assert.match(by(st, 'care').note, /soft-iron/);
  const no = phyMagnetismGrader.grade(electromagnet(seed, { noOpen: true, noNone: true }), seed);
  assert.equal(by(no, 'care').awarded, 1);
  assert.equal(by(no, 'procedure').awarded, 3);
  const mx = phyMagnetismGrader.grade(electromagnet(seed, { mixed: true }), seed);
  assert.equal(by(mx, 'care').awarded, 1);
  const s = electromagnet(seed);
  s.answers.slope.unit = 'A';
  assert.equal(by(phyMagnetismGrader.grade(s, seed), 'units').awarded, 0);
});

test('induction: from the side, galvanometer near, no 600 turns, Lenz wrong', () => {
  const seed = 13;
  const side = phyMagnetismGrader.grade(induction(seed, { side: true }), seed);
  assert.equal(by(side, 'care').awarded, 1);
  const near = phyMagnetismGrader.grade(induction(seed, { near: true }), seed);
  assert.equal(by(near, 'care').awarded, 1);
  assert.match(by(near, 'care').note, /away/);
  const no6 = phyMagnetismGrader.grade(induction(seed, { no600: true }), seed);
  assert.equal(by(no6, 'procedure').awarded, 3);
  assert.equal(by(no6, 'calculations').awarded, 3);
  const lz = phyMagnetismGrader.grade(induction(seed, { lenzS: true }), seed);
  assert.equal(by(lz, 'graph').awarded, 1);
  const s = induction(seed);
  s.answers.emf.unit = 'A';
  assert.equal(by(phyMagnetismGrader.grade(s, seed), 'units').awarded, 0);
});

test('diode: no resistor, voltmeter across both, warming, reverse written positive, mA in r', () => {
  const seed = 21;
  const both = phyMagnetismGrader.grade(diode(seed, { both: true }), seed);
  assert.equal(by(both, 'care').awarded, 1);
  const warm = phyMagnetismGrader.grade(diode(seed, { warm: true }), seed);
  assert.equal(by(warm, 'procedure').awarded, 3);
  const rp = phyMagnetismGrader.grade(diode(seed, { revPositive: true }), seed);
  assert.equal(by(rp, 'readings').awarded, 4);
  const ma = phyMagnetismGrader.grade(diode(seed, { mA: true }), seed);
  assert.match(by(ma, 'calculations').note, /amperes/);
  const noR = phyMagnetismGrader.grade(diode(seed, { noR: true }), seed);
  assert.equal(by(noR, 'care').awarded, 1);
});

test('an empty state marks zero without throwing, for every task', () => {
  for (const task of [...MAG_TASKS, null]) {
    const s = { ...emptyPhyMagnetismState(), task };
    const out = phyMagnetismGrader.grade(s, 3);
    assert.equal(autoTotal(out), 0, `${task}: ${out.auto.filter((c) => c.awarded).map((c) => c.id).join(',')}`);
  }
});

test('the state schema rejects garbage', () => {
  const ok = diode(2);
  assert.ok(phyMagnetismStateSchema.safeParse(ok).success);
  assert.ok(!phyMagnetismStateSchema.safeParse({ ...ok, task: 'MOTOR' }).success);
  assert.ok(!phyMagnetismStateSchema.safeParse({ ...ok, pot: 2 }).success);
  assert.ok(!phyMagnetismStateSchema.safeParse({ ...ok, coil: 400 }).success);
  assert.ok(!phyMagnetismStateSchema.safeParse({ ...ok, reads: [{ bias: 'fwd' }] }).success);
  assert.ok(!phyMagnetismStateSchema.safeParse({ ...ok, rows: Array.from({ length: 21 }, () => ok.rows[0]) }).success);
  assert.ok(!phyMagnetismStateSchema.safeParse({ ...ok, cells: { 'bad key!': '1' } }).success);
  assert.ok(!phyMagnetismStateSchema.safeParse({ ...ok, sheets: [{ facing: 'east' }] }).success);
  assert.ok(!phyMagnetismStateSchema.safeParse({ ...ok, v: 2 }).success);
  assert.ok(!phyMagnetismStateSchema.safeParse(undefined).success);
});

test('grading is deterministic', () => {
  for (const task of MAG_TASKS) {
    const s = IDEAL[task](17);
    assert.deepEqual(phyMagnetismGrader.grade(s, 17), phyMagnetismGrader.grade(structuredClone(s), 17));
  }
});
