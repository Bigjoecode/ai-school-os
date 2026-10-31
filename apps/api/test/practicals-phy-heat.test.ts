// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-phy-heat.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HEAT_L_ICE,
  PHY_HEAT,
  emptyPhyHeatState,
  heatMass,
  heatReading,
  heatSim,
  phyHeatStateSchema,
  phyHeatVariant,
  rubricTotal,
  type HeatEventCode,
  type HeatThermo,
  type PhyHeatState,
} from '@aischool/shared';
import { coolPlateau, heatUnit, phyHeatGrader } from '../src/practicals/graders/phy-heat';
import type { GraderOutput } from '../src/practicals/graders/types';

const by = (out: GraderOutput, id: string) => out.auto.find((c) => c.id === id)!;
const autoTotal = (out: GraderOutput) => out.auto.reduce((t, c) => t + c.awarded, 0);
const autoMax = PHY_HEAT.rubric.filter((c) => c.how === 'AUTO').reduce((t, c) => t + c.marks, 0);
const lost = (out: GraderOutput) => out.auto.filter((c) => c.awarded < c.max).map((c) => `${c.id}: ${c.note}`).join(' | ');
/** A thermometer read as a careful student reads it: to 0.1 °C (an estimate between the marks) or to the nearest 0.5 °C. */
const rd = (x: number, half = false) => (half ? Math.round(x * 2) / 2 : Math.round(x * 10) / 10).toFixed(1);
const g1 = (kg: number) => (Math.round(kg * 10000) / 10).toFixed(1);

/** The bench's true values for the state's weighings and readings, in time order. */
function truths(seed: number, s: PhyHeatState) {
  const v = phyHeatVariant(seed);
  const sim = heatSim(v, s.events);
  const items = [...s.weighs.map((w, i) => ({ t: w.t, k: `w${i}`, f: () => heatMass(v, sim.at(w.t), w.item) })), ...s.reads.map((r, i) => ({ t: r.t, k: `r${i}`, f: () => heatReading(v, sim.at(r.t), r.th) }))].sort((a, b) => a.t - b.t);
  const out: Record<string, number> = {};
  for (const x of items) out[x.k] = x.f();
  return { v, w: (i: number) => out[`w${i}`]!, r: (i: number) => out[`r${i}`]! };
}

// ------------------------------------------------------------------ the method of mixtures

interface MixOpts {
  drop?: boolean;
  noLag?: boolean;
  thStir?: boolean;
  liftAt?: number;
  noCal?: boolean;
  half?: boolean;
  wrongFall?: boolean;
}
function mix(seed: number, o: MixOpts = {}): PhyHeatState {
  const s = emptyPhyHeatState();
  s.task = 'MIX';
  const E = (t: number, e: HeatEventCode) => s.events.push({ t, e });
  if (!o.noLag) E(1, 'lag:on');
  s.weighs.push({ item: 'cal', t: 2 });
  E(5, 'fill:2');
  s.weighs.push({ item: 'cal', t: 8 }, { item: 'block', t: 10 });
  E(12, 'bunsen:on');
  E(14, 'block:bath');
  const lift = o.liftAt ?? 480;
  s.reads.push({ th: 'cal', t: lift - 80 }, { th: 'bath', t: lift - 10 });
  E(lift, 'block:lift');
  E(lift + 2, o.drop ? 'block:drop' : 'block:gentle');
  E(lift + 3, 'lid:on');
  E(lift + 3, o.thStir ? 'thstir' : 'stir:on');
  for (let t = lift + 10; t <= lift + 200; t += 10) s.reads.push({ th: 'cal', t });
  const T = truths(seed, s);
  const mc = g1(T.w(0));
  const m1 = g1(T.w(1));
  const mb = g1(T.w(2));
  const mw = (Number(m1) - Number(mc)).toFixed(1);
  const th2 = rd(T.r(0), o.half);
  const th1 = rd(T.r(1), o.half);
  const th3 = rd(Math.max(...s.reads.slice(2).map((_, i) => T.r(i + 2))), o.half);
  s.table = { ...s.table, mc, m1, mw, mb, th1, th2, th3 };
  const dT = Number(th3) - Number(th2);
  const q1 = (Number(mw) / 1000) * 4200 * dT;
  const q2 = (Number(mc) / 1000) * 400 * dT;
  const fall = o.wrongFall ? dT : Number(th1) - Number(th3);
  const c = ((o.noCal ? q1 : q1 + q2) / ((Number(mb) / 1000) * fall)).toFixed(0);
  s.answers = { q1: { value: q1.toFixed(0), unit: 'J' }, q2: o.noCal ? { value: '', unit: '' } : { value: q2.toFixed(0), unit: 'J' }, result: { value: c, unit: 'J kg⁻¹ K⁻¹' } };
  s.written.precautions = 'The calorimeter was lagged with cotton wool and covered. I transferred the block quickly and stirred before reading the highest temperature.';
  return s;
}

test('phy-heat: the rubric is 20 marks and the schema accepts a real state', () => {
  assert.equal(rubricTotal(PHY_HEAT.rubric), 20);
  assert.ok(phyHeatStateSchema.safeParse(mix(5)).success);
  assert.ok(phyHeatStateSchema.safeParse(emptyPhyHeatState()).success);
});

test('phy-heat MIX: a careful run gets full AUTO marks across 40 seeds', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const out = phyHeatGrader.grade(mix(seed), seed);
    assert.equal(autoTotal(out), autoMax, `seed ${seed}: ${lost(out)}`);
    assert.equal(out.ai.length, 1);
  }
});

test('phy-heat MIX: thermometer read to 0.5 °C still marks well', () => {
  let total = 0;
  for (let seed = 1; seed <= 20; seed++) total += autoTotal(phyHeatGrader.grade(mix(seed, { half: true }), seed));
  assert.ok(total >= 20 * (autoMax - 1), `total ${total}`);
});

test('phy-heat MIX: typical mistakes lose the right marks', () => {
  const seed = 11;
  const drop = phyHeatGrader.grade(mix(seed, { drop: true }), seed);
  assert.equal(by(drop, 'care').awarded, 1, lost(drop));
  const lag = phyHeatGrader.grade(mix(seed, { noLag: true }), seed);
  assert.equal(by(lag, 'procedure').awarded, 3, lost(lag));
  const th = phyHeatGrader.grade(mix(seed, { thStir: true }), seed);
  assert.equal(by(th, 'care').awarded, 1, lost(th));
  const noCal = phyHeatGrader.grade(mix(seed, { noCal: true }), seed);
  assert.equal(by(noCal, 'analysis').awarded, 1, lost(noCal));
  assert.ok(by(noCal, 'calculations').awarded <= 2, lost(noCal));
  const early = phyHeatGrader.grade(mix(seed, { liftAt: 150 }), seed);
  assert.ok(by(early, 'procedure').awarded <= 3, lost(early));
  const fall = phyHeatGrader.grade(mix(seed, { wrongFall: true }), seed);
  assert.equal(by(fall, 'calculations').awarded, 0, lost(fall));
  const wrongMass = mix(seed);
  wrongMass.table.mb = (Number(wrongMass.table.mb) + 5).toFixed(1);
  assert.equal(by(phyHeatGrader.grade(wrongMass, seed), 'readings').awarded, 4);
  const badUnit = mix(seed);
  badUnit.answers.result.unit = 'J/kg';
  assert.equal(by(phyHeatGrader.grade(badUnit, seed), 'units').awarded, 0);
});

// ------------------------------------------------------------------ latent heat

interface LatOpts {
  wet?: boolean;
  freezer?: boolean;
  noWarmMelt?: boolean;
  early?: boolean;
  tooMuch?: number;
}
function latent(seed: number, o: LatOpts = {}): PhyHeatState {
  const v = phyHeatVariant(seed);
  const s = emptyPhyHeatState();
  s.task = 'LATENT';
  const E = (t: number, e: HeatEventCode) => s.events.push({ t, e });
  E(1, 'lag:on');
  s.weighs.push({ item: 'cal', t: 2 });
  E(5, 'warm:40');
  E(6, 'stir:on');
  s.weighs.push({ item: 'cal', t: 10 });
  s.reads.push({ th: 'room', t: 12 }, { th: 'cal', t: 20 });
  const t1 = heatReading(v, heatSim(v, s.events).at(20), 'cal');
  const target = v.room - (t1 - v.room);
  // add a piece at a time while the water, once that ice melted, would stay above the target
  let t = 30;
  let pieces = 0;
  for (;;) {
    const p = heatSim(v, s.events).at(t);
    const left = p.ice.reduce((a, x) => a + x.m, 0);
    const C = p.mw * 4186 + v.calMass * v.calC;
    const fin = (C * p.tw - left * 3.34e5) / (C + left * 4186);
    if (fin <= target + 1.5 + (o.tooMuch ?? 0) * -8 || pieces >= 19) break;
    E(t, `ice:${o.wet ? 'wet' : 'dry'}:${o.freezer ? 'freezer' : 'melt'}` as HeatEventCode);
    pieces++;
    t += 30;
  }
  const last = t;
  // too early: read straight after the last piece went in, before it has melted
  const from = o.early ? last - 28 : last + 10;
  const to = o.early ? last - 22 : last + 420;
  for (let r = from; r <= to; r += o.early ? 3 : 10) s.reads.push({ th: 'cal', t: r });
  s.weighs.push({ item: 'cal', t: to + 10 });
  const T = truths(seed, s);
  const mc = g1(T.w(0));
  const m1 = g1(T.w(1));
  const m2 = g1(T.w(2));
  const mw = (Number(m1) - Number(mc)).toFixed(1);
  const mi = (Number(m2) - Number(m1)).toFixed(1);
  const room = rd(T.r(0));
  const th1 = rd(T.r(1));
  const th2 = rd(Math.min(...s.reads.slice(2).map((_, i) => T.r(i + 2))));
  s.table = { ...s.table, mc, m1, mw, room, th1, th2, m2, mi };
  const q1 = ((Number(mw) / 1000) * 4200 + (Number(mc) / 1000) * 400) * (Number(th1) - Number(th2));
  const q2 = (Number(mi) / 1000) * 4200 * Number(th2);
  const L = ((o.noWarmMelt ? q1 : q1 - q2) / (Number(mi) / 1000)).toPrecision(3);
  s.answers = { q1: { value: q1.toFixed(0), unit: 'J' }, q2: o.noWarmMelt ? { value: '', unit: '' } : { value: q2.toFixed(0), unit: 'J' }, result: { value: L, unit: 'J/kg' } };
  s.written.precautions = 'The ice was dried with blotting paper before adding. I started as far above room temperature as I finished below it.';
  return s;
}

test('phy-heat LATENT: a careful run gets full AUTO marks across 40 seeds', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const out = phyHeatGrader.grade(latent(seed), seed);
    assert.equal(autoTotal(out), autoMax, `seed ${seed}: ${lost(out)}`);
  }
});

test('phy-heat LATENT: typical mistakes lose the right marks', () => {
  const seed = 7;
  const wet = phyHeatGrader.grade(latent(seed, { wet: true }), seed);
  assert.equal(by(wet, 'care').awarded, 1, lost(wet));
  assert.ok(Number(latent(seed, { wet: true }).answers.result.value) < HEAT_L_ICE * 0.99, 'wet ice gives a low L');
  const fr = phyHeatGrader.grade(latent(seed, { freezer: true }), seed);
  assert.equal(by(fr, 'procedure').awarded, 3, lost(fr));
  const nw = phyHeatGrader.grade(latent(seed, { noWarmMelt: true }), seed);
  assert.equal(by(nw, 'analysis').awarded, 1, lost(nw));
  assert.ok(by(nw, 'calculations').awarded <= 2, lost(nw));
  const early = phyHeatGrader.grade(latent(seed, { early: true }), seed);
  assert.ok(by(early, 'procedure').awarded <= 3, lost(early));
  const much = phyHeatGrader.grade(latent(seed, { tooMuch: 1 }), seed);
  assert.ok(by(much, 'procedure').awarded <= 3, `cooling correction: ${lost(much)}`);
});

// ------------------------------------------------------------------ cooling curve

interface CoolOpts {
  flame?: boolean;
  keepStirring?: boolean;
  noStir?: boolean;
  stopEarly?: boolean;
  noCurve?: boolean;
  perSecond?: boolean;
}
function cool(seed: number, o: CoolOpts = {}): PhyHeatState {
  const v = phyHeatVariant(seed);
  const s = emptyPhyHeatState();
  s.task = 'COOL';
  const E = (t: number, e: HeatEventCode) => s.events.push({ t, e });
  E(1, 'bunsen:on');
  if (o.flame) E(2, 'tube:flame');
  E(2, 'tube:bath');
  let t0 = 2;
  {
    const sim = heatSim(v, s.events);
    while (heatReading(v, sim.at(t0), 'tube') < 90.5 && t0 < 3000) t0 += 1;
  }
  E(t0, 'tube:air');
  E(t0, 'watch:start');
  if (!o.noStir) E(t0, 'stir:on');
  if (!o.noStir && !o.keepStirring) {
    const nuc = heatSim(v, s.events).at(t0 + 1500).nucleatedAt!;
    E(nuc + 20, 'stir:off');
  }
  const sim = heatSim(v, s.events);
  for (let k = 0; k < 80; k++) {
    const t = t0 + 30 * k;
    const p = sim.at(t);
    const T = heatReading(v, p, 'tube');
    s.reads.push({ th: 'tube' as HeatThermo, t });
    s.coolRows.push(s.reads.length - 1);
    s.cool.push({ t: String(30 * k), th: rd(T) });
    if (o.stopEarly && k >= 12) break;
    if (k > 0 && p.fs >= 0.999 && T < 65) break;
  }
  const pts = s.cool.map((r) => ({ x: Number(r.t), y: Number(r.th) }));
  const plat = coolPlateau(pts)!;
  s.curve = !o.noCurve;
  s.line = { x1: plat.from, y1: Number(plat.level.toFixed(1)), x2: plat.to, y2: Number(plat.level.toFixed(1)) };
  const rate = (pts[0]!.y - plat.level) / (plat.from / 60);
  s.answers = { q1: o.perSecond ? { value: (rate / 60).toPrecision(3), unit: '°C/s' } : { value: rate.toFixed(2), unit: '°C/min' }, q2: { value: '', unit: '' }, result: { value: plat.level.toFixed(1), unit: '°C' } };
  s.written.precautions = 'I heated the naphthalene in a water bath. The thermometer bulb was fully immersed and I took readings at regular 30 s intervals.';
  return s;
}

test('phy-heat COOL: a careful run gets full AUTO marks across 40 seeds', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const out = phyHeatGrader.grade(cool(seed), seed);
    assert.equal(autoTotal(out), autoMax, `seed ${seed}: ${lost(out)}`);
  }
});

test('phy-heat COOL: typical mistakes lose the right marks', () => {
  const seed = 3;
  const flame = phyHeatGrader.grade(cool(seed, { flame: true }), seed);
  assert.equal(by(flame, 'care').awarded, 1, lost(flame));
  const forced = phyHeatGrader.grade(cool(seed, { keepStirring: true }), seed);
  assert.equal(by(forced, 'care').awarded, 1, lost(forced));
  const noStir = phyHeatGrader.grade(cool(seed, { noStir: true }), seed);
  assert.equal(by(noStir, 'procedure').awarded, 3, lost(noStir));
  const early = phyHeatGrader.grade(cool(seed, { stopEarly: true }), seed);
  assert.ok(by(early, 'procedure').awarded <= 3, lost(early));
  const noCurve = phyHeatGrader.grade(cool(seed, { noCurve: true }), seed);
  assert.equal(by(noCurve, 'analysis').awarded, 1, lost(noCurve));
  const perS = phyHeatGrader.grade(cool(seed, { perSecond: true }), seed);
  assert.equal(autoTotal(perS), autoMax, `a rate in °C/s is accepted: ${lost(perS)}`);
  const badTemps = cool(seed);
  badTemps.cool = badTemps.cool.map((r) => ({ ...r, th: (Number(r.th) + 1.5).toFixed(1) }));
  assert.equal(by(phyHeatGrader.grade(badTemps, seed), 'readings').awarded <= 3, true);
});

test('phy-heat: units as students write them', () => {
  assert.equal(heatUnit('J kg⁻¹ K⁻¹'), 'J/kgK');
  assert.equal(heatUnit('J/kg°C'), 'J/kgK');
  assert.equal(heatUnit('Jkg-1K-1'), 'J/kgK');
  assert.equal(heatUnit('J/(kg K)'), 'J/kgK');
  assert.equal(heatUnit('J kg-1'), 'J/kg');
  assert.equal(heatUnit('joules'), 'J');
  assert.equal(heatUnit('°C'), 'C');
  assert.equal(heatUnit('oC'), 'C');
  assert.equal(heatUnit('°C/min'), 'C/min');
  assert.equal(heatUnit('°C min⁻¹'), 'C/min');
});

test('phy-heat: the state schema rejects garbage', () => {
  assert.equal(phyHeatStateSchema.safeParse({}).success, false);
  assert.equal(phyHeatStateSchema.safeParse({ ...emptyPhyHeatState(), task: 'BOIL' }).success, false);
  assert.equal(phyHeatStateSchema.safeParse({ ...emptyPhyHeatState(), events: [{ t: 1, e: 'explode' }] }).success, false);
  assert.equal(phyHeatStateSchema.safeParse({ ...emptyPhyHeatState(), reads: [{ th: 'cal', t: -5 }] }).success, false);
  assert.equal(phyHeatStateSchema.safeParse({ ...emptyPhyHeatState(), table: { mc: 'x'.repeat(50) } }).success, false);
  assert.equal(phyHeatStateSchema.safeParse({ ...emptyPhyHeatState(), weighs: Array.from({ length: 30 }, () => ({ item: 'cal', t: 1 })) }).success, false);
});

test('phy-heat: the bench is deterministic and the physics is right', () => {
  const v = phyHeatVariant(99);
  const ev = mix(99).events;
  const a = heatSim(v, ev).at(700);
  const b = heatSim(v, ev);
  b.at(300);
  assert.equal(JSON.stringify(b.at(700)), JSON.stringify(a));
  // a lagged, covered calorimeter loses less heat than an open one
  const open = heatSim(v, mix(99, { noLag: true }).events.filter((e) => e.e !== 'lid:on')).at(900).tw;
  assert.ok(open < a.tw + 0.5 && heatSim(v, ev).at(900).tw > open);
  // a stirred calorimeter reaches its peak sooner
  const stirred = heatSim(v, ev).at(510).th.cal;
  const unstirred = heatSim(v, ev.filter((e) => e.e !== 'stir:on')).at(510).th.cal;
  assert.ok(stirred > unstirred);
});
