import {
  PHY_SOUND,
  SOUND_G,
  phySoundVariant,
  sonoBand,
  sonoResonance,
  sonoTension,
  sonoWaveSpeed,
  soundTrueF,
  tubeHalfWidth,
  tubeLine,
  tubeResonance,
  type CriterionScore,
  type PhySoundState,
  type PhySoundVariant,
} from '@aischool/shared';
import { decimalPlaces, parseNumber, score, sf, withinAbs, withinRel } from './helpers';
import { gradeGraph, phyUnit, slopeAccepted, type XY } from './phy-common';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

/** A length matches the rule within this (cm). */
const READ_TOL = 0.2;
/** Judging the loudest sound / the rider: allowed beyond the physical band (cm). */
const JUDGE_TOL = 0.15;
const crit = (id: string) => PHY_SOUND.rubric.find((c) => c.id === id)!;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
};
const nums = (raws: (string | undefined)[]) => raws.map((r) => parseNumber(r)).filter((x): x is number => x !== null);
/** A speed as written → m s⁻¹ (cm s⁻¹ converted). */
const speedOf = (a: { value: string; unit: string }) => {
  const x = parseNumber(a.value);
  if (x === null) return null;
  return phyUnit(a.unit) === 'cm/s' ? x / 100 : x;
};

/**
 * Marks the resonance labs: the resonance tube (forks struck on the pad, the
 * first resonance for five forks found by the loudest sound, the second for
 * 512 Hz, 1/f, l against 1/f, v = 4 × slope against the speed of sound at the
 * room's temperature, e = −intercept against 0.3d) or the sonometer (constant
 * tension, the rider thrown off at the fundamental for four forks, 1/l, f
 * against 1/l, v = 2 × slope, T = Mg, μ = T/v² against the wire). Precautions go to AI.
 */
export const phySoundGrader: SimulatorGrader<'phy-sound'> = {
  id: 'phy-sound',
  grade(state: PhySoundState, seed: number): GraderOutput {
    const v = phySoundVariant(seed);
    return state.task === 'SONO' ? gradeSono(state, v) : gradeTube(state, v);
  },
};

// ------------------------------------------------------------------ the resonance tube

function gradeTube(state: PhySoundState, v: PhySoundVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const reads = state.readings;
  const rows = state.rows.map((f, i) => {
    const row = state.tube[i];
    return { f, row, reads: reads.filter((r) => r.fork === f), L1: tubeResonance(v, f, 1), L2: tubeResonance(v, f, 2), hw1: tubeHalfWidth(v, f, 1), hw2: tubeHalfWidth(v, f, 2), l1: parseNumber(row?.l1), l2: parseNumber(row?.l2) };
  });
  const done = rows.filter((r) => r.l1 !== null && r.reads.length);

  // ---- care (2)
  {
    const n: string[] = [];
    let k = 0;
    if (!reads.length) n.push('No lengths were taken.');
    else {
      if (!state.benched) k++;
      else n.push(`A fork was struck on the bench ${state.benched} time${state.benched === 1 ? '' : 's'}: strike it only on the rubber pad. A hard surface damages the fork and makes it ring with overtones.`);
      const silent = reads.filter((r) => !r.sounding).length;
      if (!silent) k++;
      else n.push(`${silent} length${silent === 1 ? ' was' : 's were'} taken after the fork had died away: strike it again and judge the loudest sound while it is ringing.`);
    }
    auto.push(score(crit('care'), k, n));
  }

  // ---- procedure (4)
  {
    const n: string[] = [];
    let k = 0;
    const forks = [...new Set(done.map((r) => r.f))];
    if (forks.length >= 5) k++;
    else n.push(`Find the first resonance for at least five forks (you have ${forks.length}).`);
    if (forks.length && Math.min(...forks) <= 256 && Math.max(...forks) >= 512) k++;
    else n.push('Use forks right across the set, from 256 Hz up to 512 Hz, so the points spread out along 1/f.');
    const second = done.filter((r) => r.l1! > (r.L1 + r.L2) / 2);
    if (done.length && !second.length) k++;
    else if (second.length) n.push(`For ${second.map((r) => `${r.f} Hz`).join(', ')} you recorded the second resonance (about 3λ/4) as l₁: start with the tube low (a short column) and raise it slowly — the first loud sound is the first resonance.`);
    else n.push('No first resonances recorded.');
    const r512 = rows.find((r) => r.f === 512);
    const v2 = speedOf(state.answers.v2);
    const l2ok = !!r512 && r512.l2 !== null && withinAbs(r512.l2, r512.L2, r512.hw2 + 0.5);
    const v2ok = l2ok && r512!.l1 !== null && withinRel(v2, (2 * soundTrueF(v, 512) * (r512!.l2! - r512!.l1!)) / 100, 0.03) && withinRel(v2, (2 * 512 * (r512!.l2! - r512!.l1!)) / 100, 0.035);
    if (v2ok) k++;
    else if (!r512 || r512.l2 === null) n.push('With the 512 Hz fork, raise the tube on past the first resonance to the second (about three times as far) and record l₂: then v = 2f(l₂ − l₁), with no end correction.');
    else if (!l2ok) n.push(`Your l₂ for 512 Hz is not at the second resonance (it is near ${sf(r512.L2, 3)} cm).`);
    else n.push(`v = 2f(l₂ − l₁) = 2 × 512 × (${r512.l2} − ${r512.l1}) cm = ${sf((2 * 512 * (r512.l2! - r512.l1!)) / 100, 3)} m s⁻¹ from your lengths.`);
    auto.push(score(crit('procedure'), k, n));
  }

  // ---- table (5)
  {
    const n: string[] = [];
    let k = 0;
    if (rows.length) {
      if (rows.some((r) => !r.row || !r.row.f.trim() || !r.row.inv.trim() || !r.row.l1.trim())) n.push('Fill in f, 1/f and l₁ for every fork.');
      const typed = rows.flatMap((r) => [
        ...(r.l1 !== null ? [{ l: r.l1, r }] : []),
        ...(r.l2 !== null ? [{ l: r.l2, r }] : []),
      ]);
      const matched = typed.filter((t) => t.r.reads.some((x) => withinAbs(t.l, x.len, READ_TOL)));
      if (typed.length && matched.length === typed.length) k++;
      else n.push(`${typed.length - matched.length} length${typed.length - matched.length === 1 ? '' : 's'} in your table do not match any length you set: read the rule at the water level, to 0.1 cm.`);
      const withL1 = rows.filter((r) => r.l1 !== null);
      const atRes = withL1.filter((r) => withinAbs(r.l1, r.L1, r.hw1 + JUDGE_TOL));
      if (withL1.length && atRes.length === withL1.length) k += 2;
      else if (withL1.length && atRes.length >= withL1.length / 2) {
        k++;
        const bad = withL1.find((r) => !atRes.includes(r))!;
        n.push(`${withL1.length - atRes.length} length${withL1.length - atRes.length === 1 ? ' was' : 's were'} not at the loudest sound (e.g. ${bad.f} Hz resonates near ${sf(bad.L1, 3)} cm): move the tube slowly up and down through the loud region and stop where it is loudest.`);
      } else n.push('Most lengths were not at resonance: the sound is loudest only over a narrow range of lengths. Approach it slowly from a short column and check by moving back and forth.');
      const cells = rows.flatMap((r) => [r.row?.l1 ?? '', r.row?.l2 ?? '']).filter((c) => c.trim());
      if (cells.length && cells.every((c) => decimalPlaces(c) === 1)) k++;
      else n.push('Record each length in cm to 1 decimal place (e.g. 32.6 cm): the metre rule reads to 0.1 cm.');
      const invOk = rows.every((r) => {
        const inv = parseNumber(r.row?.inv);
        const f = parseNumber(r.row?.f);
        return inv !== null && f !== null && withinRel(f, r.f, 0.001) && (withinRel(inv, 1 / r.f, 0.01) || withinRel(inv, 1000 / r.f, 0.01));
      });
      if (invOk) k++;
      else n.push('1/f for each fork, in s (e.g. 1/256 = 0.00391 s) or in units of 10⁻³ s (3.91).');
    } else n.push('There are no readings to mark.');
    auto.push(score(crit('readings'), k, n));
  }

  // ---- graph (2): l₁ (up) against 1/f (along)
  const points: XY[] = rows.map((r) => ({ x: parseNumber(r.row?.inv), y: r.l1 })).filter((p): p is XY => p.x !== null && p.y !== null && p.x > 0);
  const graph = gradeGraph(points, state.line, 'l against 1/f');
  auto.push(score(crit('graph'), graph.marks, graph.notes));
  const xInMs = points.length > 0 && median(points.map((p) => p.x)) > 0.1;

  // ---- calculations (4)
  const slopeRaw = parseNumber(state.answers.slope.value);
  const sUnit = phyUnit(state.answers.slope.unit);
  // Candidates for the slope in cm s⁻¹, from what was written.
  const cands: number[] = [];
  if (slopeRaw !== null && slopeRaw > 0) {
    if (sUnit === 'cm/s') cands.push(slopeRaw);
    else if (sUnit === 'm/s') cands.push(slopeRaw * 100);
    else cands.push(slopeRaw, slopeRaw * 100, slopeRaw * 1000);
    if (xInMs) cands.push(slopeRaw * 1000); // cm per 10⁻³ s, as read off the graph
  }
  const perGraph = (cmps: number) => (xInMs ? cmps / 1000 : cmps);
  const vTyped = speedOf(state.answers.v);
  const eTyped = (() => {
    const x = parseNumber(state.answers.e.value);
    return x === null ? null : phyUnit(state.answers.e.unit) === 'm' ? x * 100 : x;
  })();
  const intTyped = (() => {
    const x = parseNumber(state.answers.intercept.value);
    return x === null ? null : phyUnit(state.answers.intercept.unit) === 'm' ? x * 100 : x;
  })();
  const lineIntercept = state.line && Math.abs(state.line.x2 - state.line.x1) > 1e-12 ? state.line.y1 - ((state.line.y2 - state.line.y1) / (state.line.x2 - state.line.x1)) * state.line.x1 : null;
  {
    const n: string[] = [];
    let k = 0;
    const ok = cands.find((c) => slopeAccepted(perGraph(c), graph.fit?.slope ?? null, state.line, graph.lineOk));
    if (ok !== undefined) k++;
    else if (slopeRaw === null) n.push('Work out the slope of your graph of l against 1/f from two points far apart on your line.');
    else n.push(graph.fit ? `Your slope does not fit your own points (their best line has a slope of about ${sf(xInMs ? graph.fit.slope * 1000 : graph.fit.slope, 3)} cm s⁻¹).` : 'A slope needs your points first.');
    const cmps = ok ?? cands[0] ?? null;
    if (cmps && withinRel(vTyped, (4 * cmps) / 100, 0.02)) k++;
    else if (vTyped === null) n.push('Work out v = 4 × slope, in m s⁻¹ (a slope in cm s⁻¹ ÷ 100).');
    else n.push(cmps ? `v = 4 × slope = 4 × ${sf(cmps / 100, 3)} m s⁻¹ = ${sf((4 * cmps) / 100, 3)} m s⁻¹ from your slope.` : 'v = 4 × slope.');
    if (withinRel(vTyped, v.speed, 0.03)) k++;
    else if (vTyped !== null) n.push(`Your v is more than 3 % from the speed of sound in the room (${v.speed.toFixed(0)} m s⁻¹ at ${v.tempC.toFixed(0)} °C).`);
    const ownInt = [graph.fit?.intercept, lineIntercept].filter((x): x is number => x !== null && x !== undefined);
    const eFromGraph = eTyped !== null && ownInt.some((c) => withinAbs(eTyped, -c, 0.4)) && (intTyped === null || withinAbs(intTyped, -eTyped, 0.1));
    if (eFromGraph && withinAbs(eTyped, v.endCorr, 1.0)) k++;
    else if (eTyped === null) n.push('Read the intercept on the l-axis (where 1/f = 0): it is −e, so the end correction e is the intercept with its sign changed.');
    else if (!eFromGraph) n.push(`e = −(intercept on the l-axis) of your own line${graph.fit ? ` (about ${sf(-graph.fit.intercept, 2)} cm)` : ''}.`);
    else n.push(`Your end correction is far from this tube’s (0.3 × diameter = ${v.endCorr.toFixed(1)} cm): check the line near 1/f = 0.`);
    auto.push(score(crit('calculations'), k, n));
  }

  // ---- units (1)
  {
    const un: string[] = [];
    let u = 1;
    const a = state.answers;
    if (![a.slope, a.v, a.e].some((x) => x.value.trim())) (u = 0), un.push('No answers to check the units of.');
    if (a.slope.value.trim() && !['cm/s', 'm/s'].includes(sUnit)) (u = 0), un.push('The slope of l against 1/f is in cm s⁻¹ (or m s⁻¹).');
    if (a.v.value.trim() && phyUnit(a.v.unit) !== 'm/s') (u = 0), un.push('Give v in m s⁻¹.');
    if (a.e.value.trim() && !['cm', 'm'].includes(phyUnit(a.e.unit))) (u = 0), un.push('Give e in cm.');
    if (a.v2.value.trim() && phyUnit(a.v2.unit) !== 'm/s') (u = 0), un.push('Give v from the two resonances in m s⁻¹.');
    auto.push(score(crit('units'), u, [...new Set(un)]));
  }

  const ai = precautionsItem(state, 'finding the speed of sound in air with a resonance tube');
  const tl = tubeLine(v);
  const solution = [
    `Room temperature ${v.tempC.toFixed(1)} °C: v = 331√(T/273) = ${v.speed.toFixed(1)} m s⁻¹. The tube’s diameter is ${v.diameter.toFixed(1)} cm, so e = 0.3d = ${v.endCorr.toFixed(2)} cm.`,
    `First resonance: l₁ + e = λ/4 = v/(4f). E.g. 512 Hz resonates at l₁ ≈ ${tubeResonance(v, 512).toFixed(1)} cm and 256 Hz at ≈ ${tubeResonance(v, 256).toFixed(1)} cm; the second resonance for 512 Hz is at 3λ/4 − e ≈ ${tubeResonance(v, 512, 2).toFixed(1)} cm.`,
    `l = (v/4)(1/f) − e: the graph of l against 1/f is a straight line of slope v/4 = ${tl.slope.toFixed(0)} cm s⁻¹ (${(tl.slope / 100).toFixed(1)} m s⁻¹) and intercept −e = ${tl.intercept.toFixed(2)} cm.`,
    `v = 4 × slope = ${v.speed.toFixed(0)} m s⁻¹; from the two resonances v = 2f(l₂ − l₁) = ${((2 * soundTrueF(v, 512) * (tubeResonance(v, 512, 2) - tubeResonance(v, 512, 1))) / 100).toFixed(0)} m s⁻¹, with no end correction.`,
    graph.fit ? `From your own points the best line has slope ${sf(xInMs ? graph.fit.slope * 1000 : graph.fit.slope, 3)} cm s⁻¹ (v ≈ ${sf(((xInMs ? graph.fit.slope * 1000 : graph.fit.slope) * 4) / 100, 3)} m s⁻¹) and intercept ${sf(graph.fit.intercept, 2)} cm.` : 'Plot l against 1/f from your table to find the slope.',
  ];
  const facts = [
    `Task: resonance tube (true v ${v.speed.toFixed(1)} m/s at ${v.tempC} C, e ${v.endCorr.toFixed(2)} cm); lengths taken ${reads.length} (${reads.filter((r) => !r.sounding).length} silent), forks struck on the bench ${state.benched}; rows ${rows.length}.`,
    `Student's slope ${state.answers.slope.value || '—'} ${state.answers.slope.unit}; v ${state.answers.v.value || '—'} ${state.answers.v.unit}; intercept ${state.answers.intercept.value || '—'}; e ${state.answers.e.value || '—'} ${state.answers.e.unit}; v (two resonances) ${state.answers.v2.value || '—'}.`,
  ];
  return { auto, ai, solution, facts };
}

// ------------------------------------------------------------------ the sonometer

function gradeSono(state: PhySoundState, v: PhySoundVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const reads = state.readings;
  const loads = reads.map((r) => r.load);
  const load = loads.length ? median(loads) : state.load;
  const lRaw = nums(state.sono.map((r) => r.l));
  const lInM = lRaw.length > 0 && median(lRaw) < 2;
  const toCm = (x: number | null) => (x === null ? null : lInM ? x * 100 : x);
  const rows = state.rows.map((f, i) => {
    const row = state.sono[i];
    const rr = reads.filter((r) => r.fork === f);
    const kgUsed = rr.length ? rr[rr.length - 1]!.load : load;
    return { f, row, reads: rr, l: toCm(parseNumber(row?.l)), L: sonoResonance(v, f, kgUsed), band: sonoBand(v, f, kgUsed) };
  });
  const done = rows.filter((r) => r.l !== null && r.reads.length);

  // ---- care (2)
  {
    const n: string[] = [];
    let k = 0;
    if (!reads.length) n.push('No lengths were taken.');
    else {
      if (!state.benched) k++;
      else n.push(`A fork was struck on the bench ${state.benched} time${state.benched === 1 ? '' : 's'}: strike it only on the rubber pad.`);
      if (new Set(loads).size === 1 && loads[0]! > 0) k++;
      else n.push('The load on the hanger changed between readings: keep the tension constant (the same masses) for the whole experiment, or the lengths cannot be compared.');
    }
    auto.push(score(crit('care'), k, n));
  }

  // ---- procedure (4)
  {
    const n: string[] = [];
    let k = 0;
    const forks = [...new Set(done.map((r) => r.f))];
    if (forks.length >= 4) k++;
    else n.push(`Find the resonant length for at least four forks (you have ${forks.length}).`);
    if (forks.length && Math.min(...forks) <= 256 && Math.max(...forks) >= 512) k++;
    else n.push('Use forks from 256 Hz up to 512 Hz so the points spread out along 1/l.');
    const thrown = done.filter((r) => r.reads.some((x) => x.jumped));
    if (done.length && thrown.length === done.length) k++;
    else n.push('For every fork, put the paper rider on the middle of the wire and move the bridge until the rider is thrown off — that is resonance. Take the length then.');
    const harmonic = done.filter((r) => r.l! > 1.5 * r.L);
    if (done.length && !harmonic.length) k++;
    else if (harmonic.length) n.push(`For ${harmonic.map((r) => `${r.f} Hz`).join(', ')} the length was about twice the fundamental’s (the wire vibrating in two loops): start with the bridges close together and move them apart slowly.`);
    else n.push('No lengths recorded.');
    auto.push(score(crit('procedure'), k, n));
  }

  // ---- table (5)
  {
    const n: string[] = [];
    let k = 0;
    if (rows.length) {
      if (rows.some((r) => !r.row || !r.row.f.trim() || !r.row.l.trim() || !r.row.inv.trim())) n.push('Fill in f, l and 1/l for every fork.');
      const typed = rows.filter((r) => r.l !== null);
      const matched = typed.filter((r) => r.reads.some((x) => withinAbs(r.l, x.len, READ_TOL)));
      if (typed.length && matched.length === typed.length) k++;
      else n.push(`${typed.length - matched.length} length${typed.length - matched.length === 1 ? '' : 's'} in your table do not match the bridge separation you set: read the rule between the bridges to 0.1 cm.`);
      const atRes = typed.filter((r) => withinAbs(r.l, r.L, r.band + JUDGE_TOL));
      if (typed.length && atRes.length === typed.length) k += 2;
      else if (typed.length && atRes.length >= typed.length / 2) {
        k++;
        const bad = typed.find((r) => !atRes.includes(r))!;
        n.push(`${typed.length - atRes.length} length${typed.length - atRes.length === 1 ? ' was' : 's were'} not at resonance (e.g. ${bad.f} Hz resonates near ${sf(bad.L, 3)} cm): move the bridge slowly until the rider is thrown off.`);
      } else n.push('Most lengths were not at resonance: the rider is thrown off only over a narrow range of lengths.');
      const cells = state.sono.map((r) => r.l).filter((c) => c.trim());
      if (cells.length && cells.every((c) => decimalPlaces(c) === (lInM ? 3 : 1))) k++;
      else n.push('Record each length to 0.1 cm: 0.001 m (e.g. 0.602 m) or 1 decimal place in cm.');
      const invOk = rows.every((r) => {
        const inv = parseNumber(r.row?.inv);
        const f = parseNumber(r.row?.f);
        const l = parseNumber(r.row?.l);
        return inv !== null && f !== null && l !== null && l > 0 && withinRel(f, r.f, 0.001) && (withinRel(inv, 1 / l, 0.01) || withinRel(inv, lInM ? 1 / (l * 100) : 100 / l, 0.01));
      });
      if (invOk) k++;
      else n.push('1/l for each length: e.g. l = 0.602 m gives 1/l = 1.66 m⁻¹.');
    } else n.push('There are no readings to mark.');
    auto.push(score(crit('readings'), k, n));
  }

  // ---- graph (2): f (up) against 1/l (along)
  const points: XY[] = rows.map((r) => ({ x: parseNumber(r.row?.inv), y: parseNumber(r.row?.f) })).filter((p): p is XY => p.x !== null && p.y !== null && p.x > 0);
  const graph = gradeGraph(points, state.line, 'f against 1/l');
  auto.push(score(crit('graph'), graph.marks, graph.notes));
  // 1/l in cm⁻¹ when its values are small (< 0.2): the slope is then in Hz cm.
  const invPerCm = points.length > 0 && median(points.map((p) => p.x)) < 0.2;

  // ---- calculations (4)
  const slopeRaw = parseNumber(state.answers.slope.value);
  const sUnit = phyUnit(state.answers.slope.unit);
  const cands: number[] = []; // slope in Hz m = m s⁻¹
  if (slopeRaw !== null && slopeRaw > 0) {
    if (sUnit === 'm/s') cands.push(slopeRaw);
    else if (sUnit === 'cm/s') cands.push(slopeRaw / 100);
    else cands.push(slopeRaw, slopeRaw / 100);
  }
  const perGraph = (ms: number) => (invPerCm ? ms * 100 : ms);
  const vTyped = speedOf(state.answers.v);
  const tTyped = parseNumber(state.answers.T.value);
  const muTyped = (() => {
    const x = parseNumber(state.answers.mu.value);
    return x === null ? null : phyUnit(state.answers.mu.unit) === 'g/m' ? x / 1000 : x;
  })();
  {
    const n: string[] = [];
    let k = 0;
    const ok = cands.find((c) => slopeAccepted(perGraph(c), graph.fit?.slope ?? null, state.line, graph.lineOk));
    if (ok !== undefined) k++;
    else if (slopeRaw === null) n.push('Work out the slope of your graph of f against 1/l: it is f × l, in Hz m.');
    else n.push(graph.fit ? `Your slope does not fit your own points (their best line has a slope of about ${sf(invPerCm ? graph.fit.slope / 100 : graph.fit.slope, 3)} Hz m).` : 'A slope needs your points first.');
    const ms = ok ?? cands[0] ?? null;
    if (ms && withinRel(vTyped, 2 * ms, 0.02)) k++;
    else if (vTyped === null) n.push('Work out v = 2 × slope (slope in Hz m = m s⁻¹): f = v/(2l).');
    else n.push(ms ? `v = 2 × slope = 2 × ${sf(ms, 3)} = ${sf(2 * ms, 3)} m s⁻¹ from your slope.` : 'v = 2 × slope.');
    const M = load;
    const tOk = tTyped !== null && M > 0 && [9.8, 9.81, 10].some((g) => withinRel(tTyped, M * g, 0.02));
    const muOk = tOk && vTyped !== null && vTyped > 0 && withinRel(muTyped, tTyped! / vTyped ** 2, 0.03);
    if (muOk) k++;
    else if (!tOk) n.push(`The tension is the weight on the hanger: T = Mg = ${M} kg × 10 m s⁻² = ${sf(M * 10, 3)} N (or with g = 9.8).`);
    else n.push(`μ = T/v² = ${sf(tTyped!, 3)} ÷ ${vTyped ? sf(vTyped, 3) : 'v'}² = ${vTyped ? sf(tTyped! / vTyped ** 2, 3) : '…'} kg m⁻¹ from your values.`);
    const trueMu = v.mu;
    if (withinRel(muTyped, trueMu, 0.08)) k++;
    else if (muTyped !== null) n.push(`Your μ is more than 8 % from this wire’s (${trueMu.toExponential(2)} kg m⁻¹).`);
    auto.push(score(crit('calculations'), k, n));
  }

  // ---- units (1)
  {
    const un: string[] = [];
    let u = 1;
    const a = state.answers;
    if (![a.slope, a.v, a.T, a.mu].some((x) => x.value.trim())) (u = 0), un.push('No answers to check the units of.');
    if (a.slope.value.trim() && !['m/s', 'cm/s'].includes(sUnit)) (u = 0), un.push('The slope of f against 1/l is in Hz m (= m s⁻¹).');
    if (a.v.value.trim() && phyUnit(a.v.unit) !== 'm/s') (u = 0), un.push('Give v in m s⁻¹.');
    if (a.T.value.trim() && phyUnit(a.T.unit) !== 'N') (u = 0), un.push('Give the tension in N.');
    if (a.mu.value.trim() && !['kg/m', 'g/m'].includes(phyUnit(a.mu.unit))) (u = 0), un.push('Give μ in kg m⁻¹.');
    auto.push(score(crit('units'), u, [...new Set(un)]));
  }

  const ai = precautionsItem(state, 'finding the resonant lengths of a sonometer wire with tuning forks');
  const T = sonoTension(v, load || 4);
  const c = sonoWaveSpeed(v, load || 4);
  const solution = [
    `With ${load || 4} kg on the hanger T = Mg ≈ ${T.toFixed(1)} N. The wire’s μ is ${v.mu.toExponential(2)} kg m⁻¹, so the wave speed √(T/μ) = ${c.toFixed(0)} m s⁻¹.`,
    `The rider is thrown off when the fundamental f = (1/2l)√(T/μ) equals the fork: 256 Hz at l ≈ ${sonoResonance(v, 256, load || 4).toFixed(1)} cm, 512 Hz at ≈ ${sonoResonance(v, 512, load || 4).toFixed(1)} cm. f × l is constant.`,
    `f against 1/l is a straight line through the origin of slope fl = v/2 = ${(c / 2).toFixed(0)} Hz m; v = 2 × slope = ${c.toFixed(0)} m s⁻¹ and μ = T/v² = ${v.mu.toExponential(2)} kg m⁻¹.`,
    graph.fit ? `From your own points the best line has slope ${sf(invPerCm ? graph.fit.slope / 100 : graph.fit.slope, 3)} Hz m (v ≈ ${sf(2 * (invPerCm ? graph.fit.slope / 100 : graph.fit.slope), 3)} m s⁻¹).` : 'Plot f against 1/l from your table to find the slope.',
  ];
  const facts = [
    `Task: sonometer (true mu ${v.mu.toExponential(3)} kg/m, Q ${v.q}); load ${load} kg (${new Set(loads).size} different), lengths taken ${reads.length} (${reads.filter((r) => r.jumped).length} with the rider thrown), benched ${state.benched}; rows ${rows.length}; g ${SOUND_G}.`,
    `Student's slope ${state.answers.slope.value || '—'} ${state.answers.slope.unit}; v ${state.answers.v.value || '—'} ${state.answers.v.unit}; T ${state.answers.T.value || '—'} ${state.answers.T.unit}; mu ${state.answers.mu.value || '—'} ${state.answers.mu.unit}.`,
  ];
  return { auto, ai, solution, facts };
}

function precautionsItem(state: PhySoundState, what: string): AiItem[] {
  return [
    {
      criterionId: 'precautions',
      question: `State two precautions taken to obtain accurate results when ${what}.`,
      answer: state.written.precautions.trim(),
      guide: `2 marks: one for each of two correct precautions. ${crit('precautions').guide}`,
      keywords: [
        ['rubber pad', 'rubber', 'pad', 'not on the bench', 'cork'],
        ['not touching', 'just above', 'mouth', 'close to'],
        ['back and forth', 'up and down', 'slowly', 'short length', 'gradually'],
        ['vertical', 'upright'],
        ['tension', 'constant load', 'same load'],
        ['rider', 'middle', 'centre', 'center'],
        ['stem', 'box', 'not touching the wire'],
        ['parallax', 'eye level', 'eye in line', 'perpendicular'],
        ['repeat', 'repeated', 'average', 'mean'],
      ],
      need: 2,
    },
  ];
}
