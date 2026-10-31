import {
  HEAT_C_CAL,
  HEAT_C_WATER,
  HEAT_INTERVAL,
  HEAT_L_ICE,
  PHY_HEAT,
  heatMass,
  heatMetal,
  heatPlateau,
  heatReading,
  heatSim,
  heatTruePlateau,
  phyHeatVariant,
  type CriterionScore,
  type HeatEvent,
  type HeatPhys,
  type PhyHeatState,
  type PhyHeatVariant,
} from '@aischool/shared';
import { decimalPlaces, parseNumber, score, sf, withinAbs, withinRel } from './helpers';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

/** A balance reading matches within this (g); a thermometer reading within this (°C). */
const MASS_TOL = 0.2;
const TEMP_TOL = 0.55;
const crit = (id: string) => PHY_HEAT.rubric.find((c) => c.id === id)!;

/** A heat unit as written → 'J', 'kJ', 'J/kgK', 'J/kg', 'kJ/kg', 'C', 'C/min', 'C/s', '' or 'other:…'. */
export function heatUnit(raw: string | null | undefined): string {
  const SUP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁻': '-', '⁺': '+' };
  const s = (raw ?? '')
    .replace(/[⁰¹²³⁻⁺]/g, (c) => SUP[c]!)
    .replace(/[−–—]/g, '-')
    .toLowerCase()
    .replace(/degrees?|deg|celsius|centigrade/g, 'c')
    .replace(/kelvin/g, 'k')
    .replace(/joules?/g, 'j')
    .replace(/kilograms?/g, 'kg')
    .replace(/minutes?|mins?/g, 'min')
    .replace(/seconds?|secs?/g, 's')
    .replace(/per/g, '/')
    .replace(/[°º˚()\s^·.*×]/g, '')
    .replace(/oc/g, 'c');
  if (!s) return '';
  if (/^j$/.test(s)) return 'J';
  if (/^kj$/.test(s)) return 'kJ';
  if (/^j(\/kg\/?|kg-1)(k|c)(-1)?$/.test(s) || /^j\/kg(k|c)$/.test(s)) return 'J/kgK';
  if (/^j(\/kg|kg-1)$/.test(s)) return 'J/kg';
  if (/^kj(\/kg|kg-1)$/.test(s)) return 'kJ/kg';
  if (/^c$/.test(s)) return 'C';
  if (/^(c|k)(\/min|min-1)$/.test(s)) return 'C/min';
  if (/^(c|k)(\/s|s-1)$/.test(s)) return 'C/s';
  return `other:${s}`;
}

/** Copies of the bench at each of the times (in one forward pass). */
function snapshots(v: PhyHeatVariant, events: readonly HeatEvent[], times: number[]): Map<number, HeatPhys> {
  const sim = heatSim(v, events);
  const out = new Map<number, HeatPhys>();
  for (const t of [...new Set(times)].sort((a, b) => a - b)) out.set(t, JSON.parse(JSON.stringify(sim.at(t))) as HeatPhys);
  return out;
}
/** The highest (or lowest) thermometer reading over [t0, t1]. */
function extreme(v: PhyHeatVariant, events: readonly HeatEvent[], th: 'cal' | 'tube', t0: number, t1: number, max: boolean) {
  const sim = heatSim(v, events);
  let best = max ? -Infinity : Infinity;
  let at = t0;
  for (let t = t0; t <= t1 + 1e-9; t += 0.5) {
    const T = heatReading(v, sim.at(t), th);
    if (max ? T > best : T < best) (best = T), (at = t);
  }
  return { T: best, t: at };
}
/** The fraction of [t0, t1] spent stirring (the stirrer, or a few seconds' stir with the thermometer). */
function stirFraction(events: readonly HeatEvent[], t0: number, t1: number): number {
  if (t1 <= t0) return 0;
  const evs = [...events].sort((a, b) => a.t - b.t);
  let on = false;
  let total = 0;
  let last = t0;
  for (const e of evs) {
    if (e.e !== 'stir:on' && e.e !== 'stir:off') continue;
    if (e.t <= t0) {
      on = e.e === 'stir:on';
      continue;
    }
    if (e.t >= t1) break;
    if (on) total += e.t - last;
    last = e.t;
    on = e.e === 'stir:on';
  }
  if (on) total += t1 - last;
  return total / (t1 - t0);
}
const lastOf = (events: readonly HeatEvent[], pred: (e: HeatEvent) => boolean) => [...events].sort((a, b) => a.t - b.t).filter(pred).at(-1) ?? null;
const firstOf = (events: readonly HeatEvent[], pred: (e: HeatEvent) => boolean) => [...events].sort((a, b) => a.t - b.t).find(pred) ?? null;
/** A mass as typed → g (values under 2 are taken as kg). */
const grams = (raw: string | undefined) => {
  const x = parseNumber(raw);
  return x === null ? null : x < 2 ? x * 1000 : x;
};
const massDp = (raw: string) => {
  const x = parseNumber(raw);
  return x !== null && (x < 2 ? decimalPlaces(raw) >= 4 : decimalPlaces(raw) === 1);
};
/** Heat as typed → J (kJ when the unit says so). */
const joules = (a: { value: string; unit: string }) => {
  const x = parseNumber(a.value);
  return x === null ? null : heatUnit(a.unit) === 'kJ' ? x * 1000 : x;
};
const matches = (typed: number | null, truths: number[], tol: number) => typed !== null && truths.some((t) => withinAbs(typed, t, tol));
const pct = (x: number, ref: number) => `${(((x - ref) / ref) * 100).toFixed(1)} %`;

/**
 * Marks the heat lab: the method of mixtures (c of a metal), the latent heat
 * of fusion of ice, or a cooling curve. The bench is re-simulated from the
 * attempt's events, so every balance and thermometer reading is checked
 * against what the instrument showed at that moment, the technique (lagging,
 * lid, stirring, quick transfer, dried 0 °C ice, the cooling correction, a
 * water bath, 30 s readings) from what was done, and the answers against the
 * student's own numbers and the true values. Precautions go to AI.
 */
export const phyHeatGrader: SimulatorGrader<'phy-heat'> = {
  id: 'phy-heat',
  grade(state: PhyHeatState, seed: number): GraderOutput {
    const v = phyHeatVariant(seed);
    return state.task === 'COOL' ? gradeCool(state, v) : state.task === 'LATENT' ? gradeLatent(state, v) : gradeMix(state, v);
  },
};

// ------------------------------------------------------------------ the method of mixtures

function gradeMix(state: PhyHeatState, v: PhyHeatVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const ev = state.events;
  const tIn = firstOf(ev, (e) => e.e === 'block:gentle' || e.e === 'block:drop');
  const tLift = tIn ? lastOf(ev, (e) => e.e === 'block:lift' && e.t <= tIn.t) : null;
  const snap = snapshots(v, ev, [...state.weighs.map((w) => w.t), ...state.reads.map((r) => r.t), ...(tIn ? [tIn.t] : []), ...(tLift ? [tLift.t] : [])]);
  const weigh = state.weighs.map((w) => {
    const p = snap.get(w.t)!;
    const kind = w.item === 'block' ? 'block' : p.mw <= 0 ? 'empty' : p.block === 'cal' ? 'withBlock' : 'water';
    return { kind, g: heatMass(v, p, w.item) * 1000 };
  });
  const reads = state.reads.map((r) => ({ ...r, T: heatReading(v, snap.get(r.t)!, r.th), before: !tIn || r.t < tIn.t }));
  const T = state.table;
  const mc = grams(T.mc);
  const m1 = grams(T.m1);
  const mw = grams(T.mw);
  const mb = grams(T.mb);
  const th1 = parseNumber(T.th1);
  const th2 = parseNumber(T.th2);
  const th3 = parseNumber(T.th3);
  const of = (k: string) => weigh.filter((w) => w.kind === k).map((w) => w.g);
  const okMc = matches(mc, of('empty'), MASS_TOL);
  const okM1 = matches(m1, of('water'), MASS_TOL);
  const okMb = matches(mb, of('block'), MASS_TOL);
  const bathReads = reads.filter((r) => r.th === 'bath' && r.before).map((r) => r.T);
  const before = reads.filter((r) => r.th === 'cal' && r.before && snap.get(r.t)!.mw > 0).map((r) => r.T);
  const after = reads.filter((r) => r.th === 'cal' && !r.before);
  const peak = tIn ? extreme(v, ev, 'cal', tIn.t, tIn.t + 600, true) : null;

  // ---- care (2)
  {
    const n: string[] = [];
    let k = 0;
    if (tIn?.e === 'block:gentle') k++;
    else n.push(tIn ? 'You dropped the hot block in: water splashed out (and hot water can scald). Lower it in gently by its thread.' : 'The block never went into the calorimeter.');
    if (!ev.some((e) => e.e === 'thstir')) k++;
    else n.push('You stirred with the thermometer: it is not a stirrer and its thin bulb breaks easily (and mercury is poisonous). Use the stirrer.');
    auto.push(score(crit('care'), k, n));
  }

  // ---- procedure (4)
  {
    const n: string[] = [];
    let k = 0;
    if (of('empty').length && of('water').length) k++;
    else n.push('Weigh the calorimeter and stirrer empty (m_c), then again two-thirds full of water: the difference is the mass of water.');
    const lifted = tLift ?? tIn;
    const pl = lifted ? snap.get(lifted.t)! : null;
    if (pl && pl.bath >= v.boil - 0.3 && pl.tb >= pl.bath - 0.5) k++;
    else n.push(pl && pl.bath < v.boil - 0.3 ? 'The water was not yet boiling when the block came out: heat it until it boils.' : 'Leave the block in the boiling water for several minutes so that it reaches the temperature of the water (θ₁).');
    const air = tIn && tLift ? tIn.t - tLift.t : 0;
    const pin = tIn ? snap.get(tIn.t)! : null;
    const lidOn = tIn ? ev.some((e) => e.e === 'lid:on' && e.t >= tIn.t - 30 && e.t <= tIn.t + 30) || !!pin?.lid : false;
    if (tIn && air <= 6 && pin?.lagged && lidOn) k++;
    else n.push(!tIn ? 'Transfer the hot block into the calorimeter.' : air > 6 ? `The block was in the air for ${air.toFixed(0)} s: transfer it quickly so it loses little heat on the way.` : !pin?.lagged ? 'Stand the calorimeter in its lagging (cotton wool) so it loses less heat to the room.' : 'Cover the calorimeter with its lid as soon as the block is in.');
    const t3 = after.find((r) => withinAbs(th3, r.T, TEMP_TOL));
    const stirred = tIn && t3 ? stirFraction(ev, tIn.t, t3.t) : 0;
    if (t3 && stirred >= 0.6 && peak && withinAbs(th3, peak.T, 0.5)) k++;
    else n.push(stirred < 0.6 ? 'Stir the water gently and continuously after the block goes in, so the heat spreads evenly and the thermometer reads the true mixture.' : `Record the highest steady temperature θ₃ (the thermometer rose to ${peak ? peak.T.toFixed(1) : '—'} °C).`);
    auto.push(score(crit('procedure'), k, n));
  }

  // ---- readings (5)
  {
    const n: string[] = [];
    let k = 0;
    const masses = [okMc, okM1, okMb].filter(Boolean).length;
    if (masses === 3) k += 2;
    else if (masses === 2) k++, n.push('One of your masses does not match the balance: balance the riders until the pointer is on zero, then read all three beams.');
    else n.push('Your masses do not match the balance readings: weigh m_c, m_c + water and the block, and read the beams to 0.1 g.');
    const temps = [matches(th1, bathReads, TEMP_TOL), matches(th2, before, TEMP_TOL), matches(th3, after.map((r) => r.T), TEMP_TOL)];
    if (temps.every(Boolean)) k++;
    else n.push(`${temps.filter((x) => !x).length} of θ₁, θ₂, θ₃ did not match the thermometer: read it with your eye level with the mercury, to 0.5 °C.`);
    const cells = ['mc', 'm1', 'mb'] as const;
    if (cells.every((c) => massDp(T[c])) && [T.th1, T.th2, T.th3].every((c) => c.trim() && decimalPlaces(c) === 1)) k++;
    else n.push('Masses to 0.1 g (e.g. 52.4 g) and temperatures to 1 decimal place (e.g. 28.5 °C).');
    if (mc !== null && m1 !== null && withinAbs(mw, m1 - mc, 0.15)) k++;
    else n.push('The mass of water m_w = (calorimeter + water) − (empty calorimeter).');
    auto.push(score(crit('readings'), k, n));
  }

  // ---- heat terms (2)
  const dT = th3 !== null && th2 !== null ? th3 - th2 : null;
  const q1 = joules(state.answers.q1);
  const q2 = joules(state.answers.q2);
  const wantQ1 = mw !== null && dT !== null ? (mw / 1000) * HEAT_C_WATER * dT : null;
  const wantQ2 = mc !== null && dT !== null ? (mc / 1000) * HEAT_C_CAL * dT : null;
  const okQ1 = wantQ1 !== null && q1 !== null && [4180, 4186, 4190, 4200].some((c) => withinRel(q1, (wantQ1 / HEAT_C_WATER) * c, 0.02));
  const okQ2 = wantQ2 !== null && q2 !== null && [380, 385, 390, 400].some((c) => withinRel(q2, (wantQ2 / HEAT_C_CAL) * c, 0.03));
  {
    const n: string[] = [];
    let k = 0;
    if (okQ1) k++;
    else n.push(q1 !== null && wantQ1 !== null && withinRel(q1, wantQ1 * 1000, 0.02) ? 'Heat gained by the water: the mass must be in kg (divide grams by 1000).' : `Heat gained by the water = m_w × 4200 × (θ₃ − θ₂)${wantQ1 !== null ? ` = ${sf(wantQ1, 3)} J from your readings` : ''}.`);
    if (okQ2) k++;
    else n.push(`Heat gained by the calorimeter = m_c × 400 × (θ₃ − θ₂)${wantQ2 !== null ? ` = ${sf(wantQ2, 3)} J` : ''}: leaving it out is a common mistake.`);
    auto.push(score(crit('analysis'), k, n));
  }

  // ---- c (4)
  const cTyped = parseNumber(state.answers.result.value);
  {
    const n: string[] = [];
    let k = 0;
    const gained = (okQ1 ? q1! : wantQ1 ?? NaN) + (okQ2 ? q2! : wantQ2 ?? NaN);
    const fall = th1 !== null && th3 !== null ? th1 - th3 : null;
    const own = mb !== null && fall ? gained / ((mb / 1000) * fall) : null;
    const ownTyped = mb !== null && fall && q1 !== null && q2 !== null ? (q1 + q2) / ((mb / 1000) * fall) : null;
    if (cTyped !== null && ((own !== null && withinRel(cTyped, own, 0.02)) || (ownTyped !== null && withinRel(cTyped, ownTyped, 0.02)))) k += 2;
    else if (cTyped === null) n.push('Work out c = (heat gained by water + calorimeter) ÷ (m × (θ₁ − θ₃)).');
    else n.push(own !== null && Number.isFinite(own) ? `From your values c = ${sf(gained, 4)} ÷ (${sf((mb ?? 0) / 1000, 3)} × ${sf(fall ?? 0, 3)}) = ${sf(own, 3)} J kg⁻¹ K⁻¹. The block's temperature fell by θ₁ − θ₃.` : 'c = heat gained ÷ (m (θ₁ − θ₃)), with m in kg.');
    if (withinRel(cTyped, v.c, 0.1)) k++;
    if (withinRel(cTyped, v.c, 0.04)) k++;
    else if (cTyped !== null) n.push(`The true c of this ${heatMetal(v).name} block is ${v.c.toFixed(0)} J kg⁻¹ K⁻¹ (yours is ${pct(cTyped, v.c)} off): heat lost in the transfer, an unlagged or open calorimeter, too little stirring or a misread thermometer all move it.`);
    auto.push(score(crit('calculations'), k, n));
  }

  // ---- units (1)
  {
    const un: string[] = [];
    let u = 1;
    if (![state.answers.q1, state.answers.q2, state.answers.result].some((a) => a.value.trim())) (u = 0), un.push('No answers to check the units of.');
    for (const a of [state.answers.q1, state.answers.q2]) if (a.value.trim() && !['J', 'kJ'].includes(heatUnit(a.unit))) (u = 0), un.push('Heat is in joules (J).');
    if (state.answers.result.value.trim() && heatUnit(state.answers.result.unit) !== 'J/kgK') (u = 0), un.push('c is in J kg⁻¹ K⁻¹ (or J kg⁻¹ °C⁻¹).');
    auto.push(score(crit('units'), u, [...new Set(un)]));
  }

  const ai = precautionsItem(state, 'determining the specific heat capacity of a metal by the method of mixtures', MIX_KEYS);
  const m = heatMetal(v);
  const solution = [
    `Heat lost by the block = heat gained by the water + heat gained by the calorimeter: m c (θ₁ − θ₃) = m_w c_w (θ₃ − θ₂) + m_c c_c (θ₃ − θ₂).`,
    `Here the block was ${m.name}, ${(v.blockMass * 1000).toFixed(1)} g; the calorimeter and stirrer ${(v.calMass * 1000).toFixed(1)} g; the bath boiled at ${v.boil.toFixed(1)} °C.`,
    peak ? `After the transfer the thermometer rose to a highest steady ${peak.T.toFixed(1)} °C.` : 'The block was not transferred.',
    `The true specific heat capacity of this block is ${v.c.toFixed(0)} J kg⁻¹ K⁻¹ (${m.name}: about ${m.c} J kg⁻¹ K⁻¹).`,
    `Heat lost to the surroundings makes the water gain less heat than the block lost, so c comes out low; boiling water carried over on the block makes it high.`,
  ];
  const facts = [
    `Task: method of mixtures (${m.name} block, true c ${v.c}); weighings ${state.weighs.length}, readings ${state.reads.length}; transfer ${tIn ? tIn.e.split(':')[1] : 'not done'}${tIn && tLift ? ` after ${(tIn.t - tLift.t).toFixed(1)} s in air` : ''}.`,
    `Student's c ${state.answers.result.value || '—'} ${state.answers.result.unit}.`,
  ];
  return { auto, ai, solution, facts };
}

// ------------------------------------------------------------------ latent heat of fusion of ice

function gradeLatent(state: PhyHeatState, v: PhyHeatVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const ev = state.events;
  const ices = ev.filter((e) => e.e.startsWith('ice:'));
  const firstIce = ices.length ? Math.min(...ices.map((e) => e.t)) : null;
  const lastIce = ices.length ? Math.max(...ices.map((e) => e.t)) : null;
  const tEnd = Math.max(0, ...state.reads.map((r) => r.t), ...state.weighs.map((w) => w.t), ...ev.map((e) => e.t));
  const snap = snapshots(v, ev, [...state.weighs.map((w) => w.t), ...state.reads.map((r) => r.t), tEnd + 1200]);
  const final = snap.get(tEnd + 1200)!;
  const meltedAt = final.meltedAt;
  const weigh = state.weighs.map((w) => {
    const p = snap.get(w.t)!;
    return { kind: w.item === 'block' ? 'block' : p.mw <= 0 ? 'empty' : p.ice.length ? 'final' : 'warm', g: heatMass(v, p, w.item) * 1000, t: w.t };
  });
  const reads = state.reads.map((r) => ({ ...r, T: heatReading(v, snap.get(r.t)!, r.th), p: snap.get(r.t)! }));
  const T = state.table;
  const mc = grams(T.mc);
  const m1 = grams(T.m1);
  const mw = grams(T.mw);
  const m2 = grams(T.m2);
  const mi = grams(T.mi);
  const room = parseNumber(T.room);
  const th1 = parseNumber(T.th1);
  const th2 = parseNumber(T.th2);
  const of = (k: string) => weigh.filter((w) => w.kind === k).map((w) => w.g);
  const roomReads = reads.filter((r) => r.th === 'room').map((r) => r.T);
  const startReads = reads.filter((r) => r.th === 'cal' && r.p.mw > 0 && !r.p.ice.length);
  const endReads = reads.filter((r) => r.th === 'cal' && r.p.ice.length > 0);
  const low = meltedAt !== null ? extreme(v, ev, 'cal', meltedAt, meltedAt + 600, false) : null;

  // ---- care (2)
  {
    const n: string[] = [];
    let k = 0;
    if (ices.length && ices.every((e) => e.e.includes(':dry:'))) k++;
    else n.push(ices.length ? 'Some ice went in without being dried: the water clinging to it is counted as ice but needs no latent heat, so L comes out too low. Dry each piece with blotting paper.' : 'No ice was added.');
    if (!ev.some((e) => e.e === 'thstir')) k++;
    else n.push('You stirred with the thermometer: use the stirrer — the thermometer’s bulb breaks easily.');
    auto.push(score(crit('care'), k, n));
  }

  // ---- procedure (4)
  {
    const n: string[] = [];
    let k = 0;
    if (of('empty').length && of('warm').length && of('final').length) k++;
    else n.push('Weigh the calorimeter empty, then with the warm water, and again at the end: the last two give the mass of ice.');
    if (ices.length && ices.every((e) => e.e.endsWith(':melt'))) k++;
    else n.push(ices.length ? 'Use melting ice (already at 0 °C), not ice straight from the freezer: colder ice also takes heat to warm up to 0 °C.' : 'Add the ice.');
    const t2 = endReads.find((r) => meltedAt !== null && r.t >= meltedAt && withinAbs(th2, r.T, TEMP_TOL));
    const stirred = firstIce !== null && t2 ? stirFraction(ev, firstIce, t2.t) : 0;
    if (t2 && low && withinAbs(th2, low.T, 0.5) && stirred >= 0.6) k++;
    else n.push(meltedAt === null ? 'Wait until every piece of ice has melted before you read θ₂.' : stirred < 0.6 ? 'Stir continuously while the ice melts.' : `Record the lowest steady temperature once all the ice has melted (the thermometer fell to ${low ? low.T.toFixed(1) : '—'} °C).`);
    const t1r = startReads.find((r) => withinAbs(th1, r.T, TEMP_TOL));
    const above = t1r ? t1r.T - v.room : null;
    const below = low ? v.room - low.T : null;
    if (above !== null && below !== null && above > 2 && Math.abs(above - below) <= 3) k++;
    else n.push(above !== null && below !== null ? `You started ${above.toFixed(1)} °C above room temperature (${v.room.toFixed(1)} °C) and finished ${below.toFixed(1)} °C below it: add ice until it is about as far below as it started above, so the heat gained and lost to the room roughly cancel.` : 'Start a few degrees above room temperature and finish about the same amount below it (read the room thermometer).');
    auto.push(score(crit('procedure'), k, n));
  }

  // ---- readings (5)
  {
    const n: string[] = [];
    let k = 0;
    const masses = [matches(mc, of('empty'), MASS_TOL), matches(m1, of('warm'), MASS_TOL), matches(m2, of('final'), MASS_TOL)].filter(Boolean).length;
    if (masses === 3) k += 2;
    else if (masses === 2) k++, n.push('One of your masses does not match the balance.');
    else n.push('Your masses do not match the balance: balance the riders, then read all three beams to 0.1 g.');
    const temps = [matches(room, roomReads, TEMP_TOL), matches(th1, startReads.map((r) => r.T), TEMP_TOL), matches(th2, endReads.map((r) => r.T), TEMP_TOL)];
    if (temps.every(Boolean)) k++;
    else n.push(`${temps.filter((x) => !x).length} of room temperature, θ₁ and θ₂ did not match the thermometers: eye level with the mercury, to 0.5 °C.`);
    if ((['mc', 'm1', 'm2'] as const).every((c) => massDp(T[c])) && [T.room, T.th1, T.th2].every((c) => c.trim() && decimalPlaces(c) === 1)) k++;
    else n.push('Masses to 0.1 g and temperatures to 1 decimal place.');
    if (mc !== null && m1 !== null && m2 !== null && withinAbs(mw, m1 - mc, 0.15) && withinAbs(mi, m2 - m1, 0.15)) k++;
    else n.push('m_w = m₁ − m_c and the mass of ice m_i = m₂ − m₁.');
    auto.push(score(crit('readings'), k, n));
  }

  // ---- heat terms (2)
  const q1 = joules(state.answers.q1);
  const q2 = joules(state.answers.q2);
  const wantQ1 = mw !== null && mc !== null && th1 !== null && th2 !== null ? ((mw / 1000) * HEAT_C_WATER + (mc / 1000) * HEAT_C_CAL) * (th1 - th2) : null;
  const wantQ2 = mi !== null && th2 !== null ? (mi / 1000) * HEAT_C_WATER * th2 : null;
  const okQ1 = wantQ1 !== null && withinRel(q1, wantQ1, 0.02);
  const okQ2 = wantQ2 !== null && withinRel(q2, wantQ2, 0.03);
  {
    const n: string[] = [];
    let k = 0;
    if (okQ1) k++;
    else n.push(`Heat lost by the warm water and calorimeter = (m_w × 4200 + m_c × 400)(θ₁ − θ₂)${wantQ1 !== null ? ` = ${sf(wantQ1, 3)} J from your readings` : ''}, masses in kg.`);
    if (okQ2) k++;
    else n.push(`Heat to warm the melted ice from 0 °C to θ₂ = m_i × 4200 × θ₂${wantQ2 !== null ? ` = ${sf(wantQ2, 3)} J` : ''}: forgetting it is the commonest mistake.`);
    auto.push(score(crit('analysis'), k, n));
  }

  // ---- L (4)
  const L = (() => {
    const x = parseNumber(state.answers.result.value);
    return x === null ? null : heatUnit(state.answers.result.unit) === 'kJ/kg' ? x * 1000 : x;
  })();
  {
    const n: string[] = [];
    let k = 0;
    const own = mi ? ((okQ1 ? q1! : wantQ1 ?? NaN) - (okQ2 ? q2! : wantQ2 ?? NaN)) / (mi / 1000) : null;
    const ownTyped = mi && q1 !== null && q2 !== null ? (q1 - q2) / (mi / 1000) : null;
    if (L !== null && ((own !== null && withinRel(L, own, 0.02)) || (ownTyped !== null && withinRel(L, ownTyped, 0.02)))) k += 2;
    else if (L === null) n.push('Work out L = (heat lost − heat to warm the melted ice) ÷ m_i.');
    else n.push(own !== null && Number.isFinite(own) ? `From your values L = ${sf(own, 3)} J kg⁻¹ (mass of ice in kg).` : 'L = (heat lost − m_i c_w θ₂) ÷ m_i, with m_i in kg.');
    if (withinRel(L, HEAT_L_ICE, 0.1)) k++;
    if (withinRel(L, HEAT_L_ICE, 0.04)) k++;
    else if (L !== null) n.push(`The accepted value is 3.34 × 10⁵ J kg⁻¹ (yours is ${pct(L, HEAT_L_ICE)} off): wet ice, ice below 0 °C, too little stirring or no cooling correction all move it.`);
    auto.push(score(crit('calculations'), k, n));
  }

  // ---- units (1)
  {
    const un: string[] = [];
    let u = 1;
    if (![state.answers.q1, state.answers.q2, state.answers.result].some((a) => a.value.trim())) (u = 0), un.push('No answers to check the units of.');
    for (const a of [state.answers.q1, state.answers.q2]) if (a.value.trim() && !['J', 'kJ'].includes(heatUnit(a.unit))) (u = 0), un.push('Heat is in joules (J).');
    if (state.answers.result.value.trim() && !['J/kg', 'kJ/kg'].includes(heatUnit(state.answers.result.unit))) (u = 0), un.push('L is in J kg⁻¹.');
    auto.push(score(crit('units'), u, [...new Set(un)]));
  }

  const ai = precautionsItem(state, 'determining the specific latent heat of fusion of ice by the method of mixtures', LATENT_KEYS);
  const solution = [
    'Heat lost by the warm water and calorimeter = heat to melt the ice + heat to warm the melted ice from 0 °C to θ₂: (m_w c_w + m_c c_c)(θ₁ − θ₂) = m_i L + m_i c_w θ₂.',
    `Room temperature was ${v.room.toFixed(1)} °C; ${final.ice.length} piece${final.ice.length === 1 ? '' : 's'} of ice (${(final.iceIn * 1000).toFixed(1)} g with any water clinging to them) went in.`,
    low ? `After all the ice melted the thermometer fell to a lowest steady ${low.T.toFixed(1)} °C, then crept up as the room warmed it.` : 'The ice had not all melted when the readings stopped.',
    'The accepted value of L for ice is 3.34 × 10⁵ J kg⁻¹. Starting as far above room temperature as you finish below it makes the heat lost to the room and gained from it roughly cancel (the cooling correction).',
  ];
  const facts = [
    `Task: latent heat of fusion (room ${v.room} °C); pieces ${ices.length} (${ices.filter((e) => e.e.includes('wet')).length} wet, ${ices.filter((e) => e.e.includes('freezer')).length} from the freezer); all melted ${meltedAt !== null ? 'yes' : 'no'}.`,
    `Student's L ${state.answers.result.value || '—'} ${state.answers.result.unit}.`,
  ];
  return { auto, ai, solution, facts };
}

// ------------------------------------------------------------------ cooling curve

/** The plateau of the student's own points (shared with the web's demo). */
export const coolPlateau = heatPlateau;

function gradeCool(state: PhyHeatState, v: PhyHeatVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const ev = state.events;
  const w0 = lastOf(ev, (e) => e.e === 'watch:start');
  const tAir = w0 ? lastOf(ev, (e) => e.e === 'tube:air' && e.t <= w0.t + 30) : lastOf(ev, (e) => e.e === 'tube:air');
  const rows = state.coolRows.map((ri, i) => ({ read: state.reads[ri], row: state.cool[i] })).filter((r): r is { read: { th: 'tube'; t: number }; row: { t: string; th: string } } => !!r.read && !!r.row && r.read.th === 'tube');
  const tLast = Math.max(0, ...rows.map((r) => r.read.t));
  const snap = snapshots(v, ev, [...rows.map((r) => r.read.t), ...(tAir ? [tAir.t] : []), tLast]);
  const live = rows.map((r) => ({ ...r, s: w0 ? r.read.t - w0.t : NaN, T: heatReading(v, snap.get(r.read.t)!, 'tube'), p: snap.get(r.read.t)! }));
  const timed = live.filter((r) => w0 && r.read.t >= w0.t - 0.01);
  // times as typed: seconds, or minutes when they all look like minutes
  const tTyped = timed.map((r) => parseNumber(r.row.t));
  const inMin = tTyped.length > 2 && tTyped.every((x) => x !== null && x <= 30) && Math.max(...(tTyped as number[])) > 0;
  const tSec = (x: number | null) => (x === null ? null : inMin ? x * 60 : x);
  const points = timed.map((r) => ({ x: parseNumber(r.row.t), y: parseNumber(r.row.th) })).filter((p): p is { x: number; y: number } => p.x !== null && p.y !== null);
  const plat = coolPlateau(points);
  const truePlat = heatTruePlateau(v);
  const pEnd = snap.get(tLast);

  // ---- care (2)
  {
    const n: string[] = [];
    let k = 0;
    if (!ev.some((e) => e.e === 'tube:flame')) k++;
    else n.push('You tried to heat the naphthalene straight over the flame: its vapour is flammable. Heat it only in a water bath.');
    if (pEnd && !pEnd.forced) k++;
    else n.push('The thermometer was forced through (or pulled out of) solidifying naphthalene: stop stirring once crystals form, and leave the thermometer in the solid.');
    auto.push(score(crit('care'), k, n));
  }

  // ---- procedure (4)
  {
    const n: string[] = [];
    let k = 0;
    const pa = tAir ? snap.get(tAir.t)! : null;
    if (pa && pa.tn >= 85 && pa.fs <= 0.001) k++;
    else n.push(pa ? `When you took the tube out the naphthalene was at ${pa.tn.toFixed(0)} °C${pa.fs > 0.001 ? ' and not all melted' : ''}: melt it completely and heat it to about 90 °C first.` : 'Take the tube out of the bath and clamp it in air to cool.');
    const ks = timed.map((r) => r.s / HEAT_INTERVAL);
    const onMark = ks.every((x) => Math.abs(x - Math.round(x)) * HEAT_INTERVAL <= 3);
    const idx = ks.map((x) => Math.round(x));
    const gaps = idx.slice(1).reduce((g, x, i) => g + Math.max(0, x - idx[i]! - 1), 0) + (idx.length ? Math.max(0, idx[0]! - 1) : 0);
    if (timed.length >= 5 && onMark && gaps <= 1) k++;
    else n.push('Read the thermometer every 30 s on the stopwatch (0, 30, 60 … s), without missing readings.');
    const last = timed.at(-1);
    if (last && last.p.fs >= 0.99 && last.T <= 66) k++;
    else n.push('Carry on until the naphthalene is solid and below about 65 °C, so the curve shows the solid cooling too.');
    const nuc = pEnd?.nucleatedAt ?? null;
    const stirred = tAir && nuc !== null && nuc > tAir.t ? stirFraction(ev, tAir.t, nuc) : 0;
    if (stirred >= 0.6) k++;
    else n.push('Stir gently with the thermometer while the naphthalene is liquid: it keeps the temperature even and stops it supercooling.');
    auto.push(score(crit('procedure'), k, n));
  }

  // ---- readings (5)
  {
    const n: string[] = [];
    let k = 0;
    const good = timed.filter((r) => withinAbs(parseNumber(r.row.th), r.T, TEMP_TOL)).length;
    if (timed.length && good === timed.length) k += 2;
    else if (timed.length && good >= timed.length / 2) k++, n.push(`${timed.length - good} of your temperatures did not match the thermometer: eye level with the mercury, to 0.5 °C.`);
    else n.push(timed.length ? 'Most temperatures did not match the thermometer.' : 'No readings were taken while the stopwatch ran.');
    if (timed.length && timed.every((r, i) => withinAbs(tSec(tTyped[i] ?? null), r.s, 1.5))) k++;
    else n.push('Write each time as the stopwatch showed it (0, 30, 60 … s).');
    if (timed.length && timed.every((r) => decimalPlaces(r.row.th) === 1)) k++;
    else n.push('Temperatures to 1 decimal place (e.g. 80.0 °C).');
    const onPlat = timed.filter((r) => Math.abs(r.T - truePlat) <= 0.8 && r.p.nucleated).length;
    if (timed.length >= 15 && onPlat >= 4) k++;
    else n.push(`Take at least 15 readings, with several on the flat part (you have ${timed.length}, ${onPlat} on the plateau).`);
    auto.push(score(crit('readings'), k, n));
  }

  // ---- graph (2)
  {
    const n: string[] = [];
    let k = 0;
    const l = state.line;
    const level = l ? (l.y1 + l.y2) / 2 : null;
    if (state.curve && l && plat && Math.abs(l.y2 - l.y1) <= 0.6 && withinAbs(level, plat.level, 0.6)) k++;
    else n.push(!state.curve ? 'Draw a smooth curve through your points (not straight lines from point to point).' : !l ? 'Mark the flat part of the curve with a horizontal line at its temperature.' : !plat ? 'Your points need a flat part (several readings at the same temperature).' : 'The plateau line should be horizontal, at the temperature of the flat part.');
    if (l && plat && Math.min(l.x1, l.x2) <= plat.from + 0.3 * (plat.to - plat.from) && Math.max(l.x1, l.x2) >= plat.to - 0.3 * (plat.to - plat.from) && Math.min(l.x1, l.x2) >= plat.from - (inMin ? 0.75 : 45) && Math.max(l.x1, l.x2) <= plat.to + (inMin ? 0.75 : 45)) k++;
    else n.push('Make the plateau line span the flat part of the curve, from where it starts to where it ends.');
    auto.push(score(crit('analysis'), k, n));
  }

  // ---- melting point and cooling rate (4)
  const mp = parseNumber(state.answers.result.value);
  const rate = parseNumber(state.answers.q1.value);
  const rUnit = heatUnit(state.answers.q1.unit);
  {
    const n: string[] = [];
    let k = 0;
    if (plat && withinAbs(mp, plat.level, 0.6)) k++;
    else n.push(mp === null ? 'Give the melting (freezing) point: the temperature of the flat part.' : `Your plateau is at about ${plat ? plat.level.toFixed(1) : '—'} °C: that is the melting point.`);
    if (withinAbs(mp, truePlat, 1.0)) k++;
    else if (mp !== null) n.push(`The thermometer showed the plateau at ${truePlat.toFixed(1)} °C (pure naphthalene melts at 80 °C; impurity lowers it).`);
    const first = points[0];
    const startS = plat ? (inMin ? plat.from * 60 : plat.from) : null;
    const t0s = first ? (inMin ? first.x * 60 : first.x) : null;
    const own = first && plat && startS !== null && t0s !== null && startS > t0s ? (first.y - plat.level) / ((startS - t0s) / 60) : null;
    const asMin = rate === null ? null : rUnit === 'C/s' ? rate * 60 : rate;
    if (own !== null && withinRel(asMin, own, 0.1)) k++;
    else n.push(own !== null ? `Cooling rate before the plateau = (first temperature − plateau) ÷ time to reach it = ${sf(own, 3)} °C per minute from your readings.` : 'Work out the cooling rate before the plateau: (first reading − plateau temperature) ÷ the time taken, in minutes.');
    const nuc = pEnd?.nucleatedAt ?? null;
    let trueRate: number | null = null;
    if (w0 && nuc !== null) {
      const sim = heatSim(v, ev);
      const T0 = heatReading(v, sim.at(w0.t), 'tube');
      let tp = w0.t;
      while (tp < w0.t + 3600 && heatReading(v, sim.at(tp), 'tube') > truePlat + 0.5) tp += 0.5;
      if (tp > w0.t) trueRate = (T0 - truePlat) / ((tp - w0.t) / 60);
    }
    if (trueRate !== null && withinRel(asMin, trueRate, 0.2)) k++;
    else if (asMin !== null && trueRate !== null) n.push(`The true cooling rate before the plateau was about ${trueRate.toFixed(1)} °C per minute.`);
    auto.push(score(crit('calculations'), k, n));
  }

  // ---- units (1)
  {
    const un: string[] = [];
    let u = 1;
    if (!state.answers.result.value.trim() && !state.answers.q1.value.trim()) (u = 0), un.push('No answers to check the units of.');
    if (state.answers.result.value.trim() && heatUnit(state.answers.result.unit) !== 'C') (u = 0), un.push('The melting point is in °C.');
    if (state.answers.q1.value.trim() && !['C/min', 'C/s'].includes(rUnit)) (u = 0), un.push('The cooling rate is in °C min⁻¹.');
    auto.push(score(crit('units'), u, [...new Set(un)]));
  }

  const ai = precautionsItem(state, 'plotting the cooling curve of naphthalene to find its melting point', COOL_KEYS);
  const solution = [
    'As the liquid cools the temperature falls; while it freezes the latent heat given out balances the heat lost, so the temperature stays almost constant (the plateau); then the solid cools.',
    `Here the plateau was at about ${truePlat.toFixed(1)} °C on the thermometer: the melting (freezing) point of this naphthalene (pure naphthalene: 80 °C; impurities lower it and make the plateau slope).`,
    plat ? `Your own readings are flat at ${plat.level.toFixed(1)} °C from ${plat.from} to ${plat.to} ${inMin ? 'min' : 's'}.` : 'Your readings do not show a flat part yet.',
    'Stirring while it is liquid keeps the temperature even and reduces supercooling (a small dip below the plateau before crystals form).',
  ];
  const facts = [
    `Task: cooling curve (true plateau ${truePlat.toFixed(2)} °C on the thermometer); readings ${timed.length}; heated to ${tAir ? snap.get(tAir.t)!.tn.toFixed(1) : '—'} °C; forced ${pEnd?.forced ? 'yes' : 'no'}.`,
    `Student's melting point ${state.answers.result.value || '—'} ${state.answers.result.unit}; rate ${state.answers.q1.value || '—'} ${state.answers.q1.unit}.`,
  ];
  return { auto, ai, solution, facts };
}

const COMMON_KEYS = [
  ['parallax', 'eye level', 'eye in line', 'level with the meniscus', 'meniscus', 'perpendicular'],
  ['stir', 'stirred', 'stirring'],
];
const MIX_KEYS = [...COMMON_KEYS, ['lag', 'lagged', 'lagging', 'cotton wool', 'insulat'], ['cover', 'covered', 'lid'], ['quick', 'quickly', 'rapid'], ['splash'], ['highest', 'maximum', 'steady']];
const LATENT_KEYS = [...COMMON_KEYS, ['dry', 'dried', 'blotting'], ['melting ice', '0 c', 'zero', 'already at 0'], ['above room', 'below room', 'room temperature', 'cancel'], ['lag', 'lagged', 'lagging', 'insulat'], ['lowest', 'minimum', 'all the ice']];
const COOL_KEYS = [...COMMON_KEYS, ['water bath', 'bath'], ['immersed', 'bulb', 'not touching'], ['regular', 'interval', 'every 30'], ['draught', 'still air'], ['smooth curve']];

function precautionsItem(state: PhyHeatState, what: string, keywords: string[][]): AiItem[] {
  return [
    {
      criterionId: 'precautions',
      question: `State two precautions taken to obtain accurate results when ${what}.`,
      answer: state.written.precautions.trim(),
      guide: `2 marks: one for each of two correct precautions. ${crit('precautions').guide}`,
      keywords,
      need: 2,
    },
  ];
}
