// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-phy-sound.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PHY_SOUND,
  SIMULATOR_STATE_SCHEMAS,
  SOUND_CARD,
  emptyPhySoundState,
  phyFit,
  phySoundStateSchema,
  phySoundVariant,
  rubricTotal,
  sonoBand,
  sonoResonance,
  sonoRider,
  sonoTension,
  sonoWaveSpeed,
  soundTrueF,
  tubeHalfWidth,
  tubeResonance,
  tubeResponse,
  type PhySoundState,
} from '@aischool/shared';
import { phySoundGrader } from '../src/practicals/graders/phy-sound';
import { phyUnit } from '../src/practicals/graders/phy-common';
import type { GraderOutput } from '../src/practicals/graders/types';

const by = (out: GraderOutput, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: GraderOutput) => out.auto.reduce((t, c) => t + c.awarded, 0);
const autoMax = PHY_SOUND.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
const lost = (out: GraderOutput) => out.auto.filter((c) => c.awarded < c.max).map((c) => `${c.id}: ${c.note}`).join(' | ');
const r1 = (x: number) => Math.round(x * 10) / 10;
const lineThrough = (pts: { x: number; y: number }[]) => {
  const f = phyFit(pts)!;
  const xs = pts.map((p) => p.x);
  const x1 = Math.min(...xs);
  const x2 = Math.max(...xs);
  return { x1, y1: f.intercept + f.slope * x1, x2, y2: f.intercept + f.slope * x2 };
};

// ------------------------------------------------------------------ resonance tube

function tube(seed: number, o: { benched?: number; silent?: boolean; secondAs?: number; noL2?: boolean; off?: number; ms?: boolean; vUnit?: string; noIntercept?: boolean } = {}): PhySoundState {
  const v = phySoundVariant(seed);
  const s = emptyPhySoundState();
  s.task = 'TUBE';
  s.benched = o.benched ?? 0;
  for (const f of SOUND_CARD.TUBE) {
    const l1 = r1(tubeResonance(v, f, o.secondAs === f ? 2 : 1) + (f === 320 ? (o.off ?? 0) : 0));
    s.readings.push({ fork: f, len: l1, load: 0, sounding: !o.silent, jumped: false });
    let l2 = '';
    if (f === 512 && !o.noL2) {
      const L2 = r1(tubeResonance(v, f, 2));
      s.readings.push({ fork: f, len: L2, load: 0, sounding: !o.silent, jumped: false });
      l2 = L2.toFixed(1);
    }
    s.rows.push(f);
    s.tube.push({ f: String(f), inv: o.ms ? (1000 / f).toFixed(3) : (1 / f).toPrecision(3), l1: l1.toFixed(1), l2 });
  }
  const pts = s.tube.map((r) => ({ x: Number(r.inv), y: Number(r.l1) }));
  s.line = lineThrough(pts);
  const fit = phyFit(pts)!;
  const cmps = o.ms ? fit.slope * 1000 : fit.slope;
  s.answers.slope = { value: cmps.toPrecision(3), unit: 'cm s⁻¹' };
  s.answers.v = { value: ((4 * Number(cmps.toPrecision(3))) / 100).toFixed(1), unit: o.vUnit ?? 'm s⁻¹' };
  if (!o.noIntercept) s.answers.intercept = { value: fit.intercept.toFixed(2), unit: 'cm' };
  s.answers.e = { value: (-fit.intercept).toFixed(2), unit: 'cm' };
  const row = s.tube[s.tube.length - 1]!;
  if (row.l2) s.answers.v2 = { value: ((2 * 512 * (Number(row.l2) - Number(row.l1))) / 100).toFixed(1), unit: 'm/s' };
  s.written.precautions = 'I struck the fork on a rubber pad and held it just above the mouth without touching the tube. I approached resonance from short lengths and moved the tube up and down to find the loudest sound.';
  return s;
}

// ------------------------------------------------------------------ sonometer

function sono(seed: number, o: { load?: number; changeLoad?: boolean; noJump?: boolean; harmonic?: number; inCm?: boolean; g?: number; benched?: number } = {}): PhySoundState {
  const v = phySoundVariant(seed);
  const s = emptyPhySoundState();
  s.task = 'SONO';
  s.benched = o.benched ?? 0;
  const load = o.load ?? 4;
  s.load = load;
  SOUND_CARD.SONO.forEach((f, i) => {
    const kg = o.changeLoad && i === 3 ? load + 1 : load;
    const len = r1(sonoResonance(v, f, kg) * (o.harmonic === f ? 2 : 1));
    s.readings.push({ fork: f, len, load: kg, sounding: true, jumped: !o.noJump && o.harmonic !== f });
    s.rows.push(f);
    s.sono.push(o.inCm ? { f: String(f), l: len.toFixed(1), inv: (1 / len).toPrecision(3) } : { f: String(f), l: (len / 100).toFixed(3), inv: (100 / len).toPrecision(3) });
  });
  const pts = s.sono.map((r) => ({ x: Number(r.inv), y: Number(r.f) }));
  s.line = lineThrough(pts);
  const fit = phyFit(pts)!;
  const hzm = o.inCm ? fit.slope / 100 : fit.slope;
  s.answers.slope = { value: hzm.toPrecision(3), unit: 'Hz m' };
  const vv = 2 * Number(hzm.toPrecision(3));
  s.answers.v = { value: vv.toFixed(1), unit: 'm s⁻¹' };
  const T = load * (o.g ?? 9.8);
  s.answers.T = { value: T.toFixed(1), unit: 'N' };
  s.answers.mu = { value: (T / Number(vv.toFixed(1)) ** 2).toPrecision(3), unit: 'kg m⁻¹' };
  s.written.precautions = 'The tension was kept constant with the same load. The paper rider was placed at the middle of the wire and the stem of the fork pressed on the box.';
  return s;
}

test('sound: rubric 20; seeded hidden values; the physics of the tube and the wire', () => {
  assert.equal(rubricTotal(PHY_SOUND.rubric), 20);
  assert.deepEqual(phySoundVariant(9), phySoundVariant(9));
  assert.notDeepEqual(phySoundVariant(9), phySoundVariant(10));
  for (let seed = 1; seed < 500; seed += 11) {
    const v = phySoundVariant(seed);
    assert.ok(v.tempC >= 24 && v.tempC <= 32 && Math.abs(v.speed - 331 * Math.sqrt((273 + v.tempC) / 273)) < 1e-9);
    assert.ok(Math.abs(v.endCorr - 0.3 * v.diameter) < 1e-12 && v.mu >= 4e-4 && v.mu <= 7e-4);
    for (const f of SOUND_CARD.TUBE) {
      // l + e = λ/4 at the first resonance and 3λ/4 at the second: the response peaks there.
      const L1 = tubeResonance(v, f);
      const lambda = (v.speed * 100) / soundTrueF(v, f);
      assert.ok(Math.abs(L1 + v.endCorr - lambda / 4) < 1e-9 && Math.abs(tubeResonance(v, f, 2) - L1 - lambda / 2) < 1e-9);
      assert.ok(tubeResponse(v, f, L1) > 0.999);
      const hw = tubeHalfWidth(v, f);
      assert.ok(hw > 0.3 && hw < 1.2, `seed ${seed} ${f} hw ${hw}`);
      assert.ok(Math.abs(tubeResponse(v, f, L1 + hw) - Math.SQRT1_2) < 0.05);
      assert.ok(tubeResponse(v, f, L1 + 4 * hw) < 0.3 && tubeResponse(v, f, 3) < 0.1);
    }
    for (const f of SOUND_CARD.SONO) {
      // f = (1/2l)√(T/μ): the rider jumps at the fundamental, not at 2l (the middle is a node), and fl is constant.
      const L = sonoResonance(v, f, 4);
      assert.ok(Math.abs((soundTrueF(v, f) * 2 * L) / 100 - sonoWaveSpeed(v, 4)) < 1e-6);
      assert.ok(sonoRider(v, f, L, 4) > 0.999 && sonoRider(v, f, L + sonoBand(v, f, 4) * 0.9, 4) > 0.6 && sonoRider(v, f, L + sonoBand(v, f, 4) * 1.3, 4) < 0.6);
      assert.ok(sonoRider(v, f, 2 * L, 4) < 0.1);
      assert.ok(L > 15 && L < 90, `seed ${seed} ${f}: ${L}`);
    }
    assert.ok(Math.abs(sonoTension(v, 4) - 4 * 9.81) < 0.2);
  }
});

test('sound: units as students write them', () => {
  for (const u of ['m/s', 'm s⁻¹', 'ms-1', 'Hz m', 'm Hz']) assert.equal(phyUnit(u), 'm/s', u);
  for (const u of ['cm/s', 'cm s⁻¹', 'cm Hz']) assert.equal(phyUnit(u), 'cm/s', u);
  for (const u of ['kg/m', 'kg m⁻¹', 'kgm-1']) assert.equal(phyUnit(u), 'kg/m', u);
  assert.equal(phyUnit('Hz'), 'Hz');
  assert.equal(phyUnit('N'), 'N');
});

test('sound: exact work earns every AUTO mark in both tasks across 40 seeds', () => {
  for (let i = 0; i < 40; i++) {
    const seed = 3 + i * 7919;
    for (const s of [tube(seed), tube(seed, { ms: true }), sono(seed), sono(seed, { inCm: true }), sono(seed, { g: 10 })]) {
      assert.ok(phySoundStateSchema.safeParse(s).success, `${s.task} schema`);
      assert.ok(SIMULATOR_STATE_SCHEMAS['phy-sound'].safeParse(s).success);
      const out = phySoundGrader.grade(s, seed);
      assert.equal(autoTotal(out), autoMax, `seed ${seed} ${s.task}: ${lost(out)}`);
      assert.equal(out.ai.length, 1);
    }
  }
});

test('sound: typical mistakes lose the right marks', () => {
  const seed = 4242;
  const g = (s: PhySoundState) => phySoundGrader.grade(s, seed);
  // tube
  assert.equal(by(g(tube(seed, { benched: 2 })), 'care').awarded, 1);
  assert.equal(by(g(tube(seed, { silent: true })), 'care').awarded, 1);
  const second = g(tube(seed, { secondAs: 384 }));
  assert.equal(by(second, 'procedure').awarded, 3);
  assert.ok(by(second, 'readings').awarded <= 4);
  assert.equal(by(g(tube(seed, { noL2: true })), 'procedure').awarded, 3);
  assert.equal(by(g(tube(seed, { off: 2.5 })), 'readings').awarded, 4);
  assert.equal(by(g(tube(seed, { vUnit: 'cm/s' })), 'units').awarded, 0);
  const noInt = g(tube(seed, { noIntercept: true }));
  assert.equal(by(noInt, 'calculations').awarded, 4, lost(noInt));
  // v from the slope without the factor 4
  const s4 = tube(seed);
  s4.answers.v = { value: (Number(s4.answers.slope.value) / 100).toFixed(1), unit: 'm/s' };
  assert.equal(by(g(s4), 'calculations').awarded, 2);
  // e given with the intercept's sign
  const se = tube(seed);
  se.answers.e = { value: se.answers.intercept.value, unit: 'cm' };
  assert.equal(by(g(se), 'calculations').awarded, 3);
  // l against f (a curve) instead of 1/f
  const sf = tube(seed);
  sf.tube = sf.tube.map((r) => ({ ...r, inv: r.f }));
  assert.ok(by(g(sf), 'readings').awarded <= 4);
  // sonometer
  assert.equal(by(g(sono(seed, { changeLoad: true })), 'care').awarded, 1);
  assert.equal(by(g(sono(seed, { benched: 1 })), 'care').awarded, 1);
  assert.equal(by(g(sono(seed, { noJump: true })), 'procedure').awarded, 3);
  const harm = g(sono(seed, { harmonic: 384 }));
  assert.equal(by(harm, 'procedure').awarded, 2);
  assert.ok(by(harm, 'readings').awarded <= 4);
  const sT = sono(seed);
  sT.answers.T = { value: '4.0', unit: 'N' };
  assert.equal(by(g(sT), 'calculations').awarded, 3);
  const sv = sono(seed);
  sv.answers.v = { value: sv.answers.slope.value, unit: 'm/s' };
  assert.ok(by(g(sv), 'calculations').awarded <= 2);
  const su = sono(seed);
  su.answers.mu = { ...su.answers.mu, unit: 'kg' };
  assert.equal(by(g(su), 'units').awarded, 0);
  // an empty attempt scores nothing and does not throw
  for (const task of ['TUBE', 'SONO'] as const) {
    const out = g({ ...emptyPhySoundState(), task });
    assert.equal(autoTotal(out), 0, lost(out));
  }
});

test('sound: the state schema rejects garbage', () => {
  const ok = tube(5);
  assert.ok(phySoundStateSchema.safeParse(ok).success);
  for (const bad of [
    { ...ok, v: 2 },
    { ...ok, task: 'PIPE' },
    { ...ok, len: 500 },
    { ...ok, load: -1 },
    { ...ok, fork: 9999 },
    { ...ok, readings: [{ fork: 256, len: 20 }] },
    { ...ok, tube: [{ f: 'x'.repeat(50), inv: '', l1: '', l2: '' }] },
    { ...ok, answers: { ...ok.answers, mu: { value: 3 } } },
    { ...ok, rows: Array.from({ length: 20 }, () => 256) },
    { ...ok, log: [{ t: -1, a: 'x' }] },
  ])
    assert.equal(phySoundStateSchema.safeParse(bad).success, false, JSON.stringify(bad).slice(0, 80));
});
