import {
  PHY_SPRING,
  SPRING_FOUR_PI2,
  SPRING_MEAN_ZONE,
  SPRING_SMALL_AMP,
  phySpringVariant,
  springOscLine,
  springOverLimit,
  springPeriod,
  springReading,
  type CriterionScore,
  type PhySpringState,
  type PhySpringVariant,
} from '@aischool/shared';
import { decimalPlaces, parseNumber, score, sf, withinAbs, withinRel } from './helpers';
import { gradeGraph, phyUnit, slopeAccepted, type XY } from './phy-common';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

/** A pointer reading matches the scale within this (cm). */
const READ_TOL = 0.2;
/** e worked out from the student's own readings within this (cm). */
const E_TOL = 0.15;
/** A written time matches the stopwatch within this (s). */
const TIME_TOL = 0.05;
/** Timed the right number of oscillations: within this fraction of an oscillation. */
const COUNT_TOL = 0.25;
const crit = (id: string) => PHY_SPRING.rubric.find((c) => c.id === id)!;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
};
/** The mass column as written → g (kg when the numbers look like kilograms, or the unit says so). */
const massCol = (raws: string[]) => {
  const xs = raws.map((r) => parseNumber(r)).filter((x): x is number => x !== null);
  const inKg = xs.length > 0 && median(xs) < 5;
  return { inKg, grams: (raw: string | undefined) => (parseNumber(raw) === null ? null : parseNumber(raw)! * (inKg ? 1000 : 1)) };
};
const kOf = (a: { value: string; unit: string }) => {
  const x = parseNumber(a.value);
  if (x === null) return null;
  const u = phyUnit(a.unit);
  return u === 'other:n/cm' || u === 'other:ncm-1' ? x * 100 : x;
};

/**
 * Marks the spiral spring: Hooke's law (R₀ and the pointer readings against
 * the true scale, loading and unloading, the spring at rest, within the
 * elastic limit, W = mg and e, the graph of e against W, slope and k = 1/slope)
 * or the loaded spring's oscillations (small displacements, timing from the
 * rest position, five masses timed twice, the stopwatch against the true
 * period, T² against m, k = 4π²/slope). Precautions go to AI.
 */
export const phySpringGrader: SimulatorGrader<'phy-spring'> = {
  id: 'phy-spring',
  grade(state: PhySpringState, seed: number): GraderOutput {
    const v = phySpringVariant(seed);
    return state.task === 'OSC' ? gradeOsc(state, v) : gradeHooke(state, v);
  },
};

// ------------------------------------------------------------------ Hooke's law

function gradeHooke(state: PhySpringState, v: PhySpringVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const reads = state.readings;
  const r0Read = reads.find((r) => r.load === 0 && r.peak === 0) ?? null;
  const rows = state.rows.map((load, i) => {
    const row = state.hooke[i];
    const at = reads.filter((r) => r.load === load);
    const up = [...at].reverse().find((r) => r.peak <= r.load) ?? null;
    const down = [...at].reverse().find((r) => r.peak > r.load) ?? null;
    return { load, row, up, down };
  });
  const r0Typed = (() => {
    const x = parseNumber(state.answers.r0.value);
    return x === null ? null : phyUnit(state.answers.r0.unit) === 'm' ? x * 100 : x;
  })();
  const mc = massCol(rows.map((r) => r.row?.m ?? ''));
  const es = rows.map((r) => parseNumber(r.row?.e)).filter((x): x is number => x !== null);
  const eInM = es.length > 0 && median(es) < 0.5;

  // ---- care (2)
  {
    const n: string[] = [];
    let k = 0;
    const over = springOverLimit(v, state.peak) || reads.some((r) => springOverLimit(v, r.peak));
    if (reads.length && !over) k++;
    else if (over) n.push(`The spring was loaded beyond its elastic limit (about ${sf(v.limit / 9.81 * 1000, 2)} g here): it no longer returns to its original length, and Hooke’s law fails. Stop adding masses once the extensions stop going up in equal steps.`);
    const moving = reads.filter((r) => r.moving).length;
    if (reads.length && !moving) k++;
    else if (moving) n.push(`${moving} reading${moving === 1 ? ' was' : 's were'} taken while the spring was still bouncing: steady the hanger and wait for the pointer to come to rest before you read it.`);
    else n.push('No pointer readings were taken.');
    auto.push(score(crit('care'), k, n));
  }

  // ---- procedure (4)
  const loaded = rows.filter((r) => r.load > 0 && r.up);
  {
    const n: string[] = [];
    let k = 0;
    const firstLoad = reads.findIndex((r) => r.load > 0);
    const r0First = r0Read !== null && reads.indexOf(r0Read) >= 0 && (firstLoad < 0 || reads.indexOf(r0Read) < firstLoad);
    if (r0First && r0Typed !== null) k++;
    else n.push(r0Read === null || !r0First ? 'Read the pointer with no load on the spring (R₀) before you hang anything: every extension is measured from it.' : 'Write down R₀, the pointer reading with no load.');
    const loads = [...new Set(loaded.map((r) => r.load))];
    if (loads.length >= 5) k++;
    else n.push(`Load the spring in 50 g steps and read the pointer for at least five loads (you have ${loads.length}).`);
    if (loads.length && Math.max(...loads) >= 250) k++;
    else n.push('Go up to at least 250 g so the points cover a good range.');
    const unloaded = loaded.filter((r) => r.down).length;
    // every load but the heaviest is read again on the way down
    if (loaded.length && unloaded >= Math.max(1, loaded.length - 1)) k++;
    else n.push('Take the masses off one at a time and read the pointer again: the readings on unloading should agree, showing the elastic limit was not passed.');
    auto.push(score(crit('procedure'), k, n));
  }

  // ---- table of readings (5)
  {
    const n: string[] = [];
    let k = 0;
    if (rows.length) {
      if (rows.some((r) => !r.row || !r.row.m.trim() || !r.row.W.trim() || !r.row.Rl.trim() || !r.row.e.trim())) n.push('Fill in m, W, the reading and e for every load.');
      const tests: boolean[] = [];
      if (r0Read) tests.push(withinAbs(r0Typed, springReading(v, 0, r0Read.peak), READ_TOL));
      for (const r of rows) {
        if (r.up) tests.push(withinAbs(parseNumber(r.row?.Rl), springReading(v, r.load, r.up.peak), READ_TOL));
        if (r.down && r.row?.Ru.trim()) tests.push(withinAbs(parseNumber(r.row?.Ru), springReading(v, r.load, r.down.peak), READ_TOL));
      }
      const good = tests.filter(Boolean).length;
      if (tests.length && good === tests.length) k += 2;
      else if (good >= tests.length / 2 && tests.length) {
        k += 1;
        n.push(`${tests.length - good} of your pointer readings did not match the scale: read the pointer with your eye level with it (no parallax), to 0.1 cm.`);
      } else n.push('Most of your pointer readings did not match the scale: put your eye level with the pointer and read the rule to 0.1 cm.');
      const cells = [state.answers.r0.value, ...rows.flatMap((r) => [r.row?.Rl ?? '', r.row?.Ru ?? ''])].filter((c) => c.trim());
      if (cells.length && cells.every((c) => decimalPlaces(c) === 1)) k++;
      else n.push('Record the pointer readings in cm to 1 decimal place (e.g. 27.0 cm, 31.4 cm): the rule reads to 0.1 cm.');
      const wOk = rows.every((r) => {
        const m = mc.grams(r.row?.m);
        const W = parseNumber(r.row?.W);
        return m !== null && W !== null && withinRel(m, r.load, 0.001) && [9.8, 9.81, 10].some((g) => withinRel(W, (m / 1000) * g, 0.02));
      });
      if (wOk) k++;
      else n.push('W = mg with m in kg: e.g. 150 g → 0.150 kg × 10 m s⁻² = 1.50 N (or with g = 9.8).');
      const eOk =
        r0Typed !== null &&
        rows.every((r) => {
          const Rl = parseNumber(r.row?.Rl);
          const Ru = parseNumber(r.row?.Ru);
          const e = parseNumber(r.row?.e);
          if (Rl === null || e === null) return false;
          const eCm = eInM ? e * 100 : e;
          const want = [Rl - r0Typed, ...(Ru !== null ? [(Rl + Ru) / 2 - r0Typed] : [])];
          return want.some((w) => withinAbs(eCm, w, E_TOL));
        });
      if (eOk) k++;
      else n.push('The extension e is the (mean) reading minus R₀ — not the pointer reading itself.');
    } else n.push('There are no readings to mark.');
    auto.push(score(crit('readings'), k, n));
  }

  // ---- graph (2): e (up) against W (along)
  const points: XY[] = rows.map((r) => ({ x: parseNumber(r.row?.W), y: parseNumber(r.row?.e) })).filter((p): p is XY => p.x !== null && p.y !== null && p.x > 0);
  const graph = gradeGraph(points, state.line, 'e against W');
  auto.push(score(crit('graph'), graph.marks, graph.notes));

  // ---- slope and k (4)
  const slopeRaw = parseNumber(state.answers.slope.value);
  const sUnit = phyUnit(state.answers.slope.unit);
  const graphUnit = eInM ? 'm/N' : 'cm/N';
  // The slope as the student's graph has it (e-units per N), and in m N⁻¹.
  const cands: { perGraph: number; perM: number }[] = [];
  if (slopeRaw !== null && slopeRaw > 0) {
    const asCm = sUnit === 'm/N' ? [slopeRaw * 100] : sUnit === 'cm/N' ? [slopeRaw] : [slopeRaw, slopeRaw * 100];
    for (const c of asCm) cands.push({ perGraph: eInM ? c / 100 : c, perM: c / 100 });
  }
  const originSlope = points.length ? points.reduce((t, p) => t + p.x * p.y, 0) / Math.max(1e-9, points.reduce((t, p) => t + p.x * p.x, 0)) : null;
  const kTyped = kOf(state.answers.k);
  {
    const n: string[] = [];
    let k = 0;
    const ok = cands.find((c) => slopeAccepted(c.perGraph, graph.fit?.slope ?? null, state.line, graph.lineOk) || (originSlope !== null && withinRel(c.perGraph, originSlope, 0.05)));
    if (ok) k += 2;
    else if (slopeRaw === null) n.push('Work out the slope of your graph of e against W from two points far apart on your line.');
    else n.push(graph.fit ? `Your slope does not fit your own points (their best line has a slope of about ${sf(graph.fit.slope, 3)} ${graphUnit.replace('/N', ' N⁻¹')}).` : 'A slope needs your points first.');
    const perM = ok?.perM ?? cands[0]?.perM ?? null;
    if (perM && withinRel(kTyped, 1 / perM, 0.02)) k++;
    else if (kTyped === null) n.push('Work out k = 1/slope, with the slope in m N⁻¹ (divide a slope in cm N⁻¹ by 100 first).');
    else n.push(perM ? `k = 1/slope = 1 ÷ ${sf(perM, 3)} m N⁻¹ = ${sf(1 / perM, 3)} N m⁻¹ from your slope.` : 'k = 1/slope, with the slope in m N⁻¹.');
    if (withinRel(kTyped, v.k, 0.05)) k++;
    else if (kTyped !== null) n.push(`Your k is more than 5 % from the true value of this spring (${v.k.toFixed(1)} N m⁻¹).`);
    auto.push(score(crit('calculations'), k, n));
  }

  // ---- units (1)
  {
    const un: string[] = [];
    let u = 1;
    const given = [state.answers.r0, state.answers.slope, state.answers.k].filter((a) => a.value.trim());
    if (!given.length) (u = 0), un.push('No answers to check the units of.');
    if (state.answers.r0.value.trim() && !['cm', 'm'].includes(phyUnit(state.answers.r0.unit))) (u = 0), un.push('Give R₀ its unit (cm).');
    if (state.answers.slope.value.trim() && !['cm/N', 'm/N'].includes(sUnit)) (u = 0), un.push('The slope of e against W is in cm N⁻¹ (or m N⁻¹).');
    if (state.answers.k.value.trim() && phyUnit(state.answers.k.unit) !== 'N/m') (u = 0), un.push('Give k in N m⁻¹.');
    auto.push(score(crit('units'), u, [...new Set(un)]));
  }

  const ai = precautionsItem(state, 'verifying Hooke’s law and finding the spring constant of a spiral spring');
  const e1 = springReading(v, 100, 100) - springReading(v, 0, 0);
  const solution = [
    `With no load the pointer reads R₀ = ${v.r0.toFixed(1)} cm.`,
    `Each 50 g (0.49 N) stretches this spring by about ${(0.49 / v.k * 100).toFixed(2)} cm: e.g. 100 g gives e ≈ ${e1.toFixed(1)} cm.`,
    `Within the elastic limit e = W/k: the graph of e against W is a straight line through the origin of slope 1/k = ${(100 / v.k).toFixed(2)} cm N⁻¹ = ${(1 / v.k).toFixed(4)} m N⁻¹.`,
    `k = 1/slope = ${v.k.toFixed(1)} N m⁻¹ (true value of this spring). Its elastic limit is about ${v.limit.toFixed(1)} N (${Math.round((v.limit / 9.81) * 1000)} g).`,
    graph.fit ? `From your own points the best line has slope ${sf(graph.fit.slope, 3)} ${graphUnit.replace('/N', ' N⁻¹')}, giving k ≈ ${sf(1 / (eInM ? graph.fit.slope : graph.fit.slope / 100), 3)} N m⁻¹.` : 'Plot e against W from your table to find the slope.',
  ];
  const facts = [
    `Task: Hooke's law (true k ${v.k} N/m, R0 ${v.r0} cm, limit ${v.limit} N); readings ${reads.length} (${reads.filter((r) => r.moving).length} moving), rows ${rows.length}, peak load ${state.peak} g.`,
    `Student's R0 ${state.answers.r0.value || '—'} ${state.answers.r0.unit}; slope ${state.answers.slope.value || '—'} ${state.answers.slope.unit}; k ${state.answers.k.value || '—'} ${state.answers.k.unit}.`,
  ];
  return { auto, ai, solution, facts };
}

// ------------------------------------------------------------------ oscillations

function gradeOsc(state: PhySpringState, v: PhySpringVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const runs = state.runs.map((r, i) => ({ ...r, i, period: springPeriod(v, r.load, i) }));
  const rows = state.rows.map((load, i) => ({ load, row: state.osc[i], runs: runs.filter((r) => r.load === load) }));
  const mc = massCol(rows.map((r) => r.row?.m ?? ''));

  // ---- care (2)
  {
    const n: string[] = [];
    let k = 0;
    if (!runs.length) n.push('No timings were recorded.');
    else {
      const big = runs.filter((r) => r.amp > SPRING_SMALL_AMP + 1e-9).length;
      if (!big) k++;
      else n.push(`${big} timing${big === 1 ? ' was' : 's were'} made with a large displacement: pull the mass down only 1–2 cm, so the motion stays simple harmonic and the masses stay on the hanger.`);
      const fromRest = runs.filter((r) => r.startPhase <= SPRING_MEAN_ZONE).length;
      if (fromRest >= Math.ceil(runs.length * 0.8)) k++;
      else n.push('Start the stopwatch as the mass passes the fiducial mark at its rest position: it moves fastest there, so the instant is sharp.');
    }
    auto.push(score(crit('care'), k, n));
  }

  // ---- procedure (4)
  {
    const n: string[] = [];
    let k = 0;
    if (runs.length) {
      const loads = [...new Set(runs.map((r) => r.load))];
      if (loads.length >= 5 && Math.max(...loads) - Math.min(...loads) >= 250) k++;
      else n.push(loads.length < 5 ? `Time the spring with at least five different masses (you used ${loads.length}).` : 'Spread the masses out (at least 0.25 kg between the lightest and the heaviest).');
      if (runs.every((r) => r.n >= 10)) k++;
      else n.push('Time at least 10 (better 20) oscillations each time: the reaction-time error is then shared over many oscillations.');
      if (rows.length && rows.every((r) => r.runs.length >= 2)) k++;
      else n.push('Time each mass twice and take the mean time.');
      if (!springOverLimit(v, state.peak) && !runs.some((r) => springOverLimit(v, r.load, r.amp))) k++;
      else n.push(`The spring was stretched beyond its elastic limit (about ${v.limit.toFixed(1)} N here): use lighter masses and small displacements.`);
    } else n.push('No timings were recorded.');
    auto.push(score(crit('procedure'), k, n));
  }

  // ---- table of readings (5)
  {
    const n: string[] = [];
    let k = 0;
    if (rows.length) {
      if (rows.some((r) => !r.row || !r.row.m.trim() || !r.row.t1.trim() || !r.row.t.trim() || !r.row.T.trim() || !r.row.T2.trim())) n.push('Fill in m, the times, t, T and T² for every mass.');
      let need = 0;
      let good = 0;
      for (const r of rows) {
        const typed = [r.row?.t1, r.row?.t2].map((x) => parseNumber(x));
        const free = [...r.runs];
        for (let j = 0; j < Math.min(2, r.runs.length); j++) {
          need++;
          const t = typed[j];
          const hit = free.findIndex((x) => withinAbs(t ?? null, x.elapsed, TIME_TOL));
          if (hit >= 0) good++, free.splice(hit, 1);
        }
      }
      if (need && good === need) k += 2;
      else if (need && good >= need / 2) {
        k++;
        n.push(`${need - good} time${need - good === 1 ? '' : 's'} did not match the stopwatch reading.`);
      } else n.push('Most times did not match the stopwatch: copy the stopwatch reading exactly.');
      const tcells = rows.flatMap((r) => [r.row?.t1 ?? '', r.row?.t2 ?? '']).filter((c) => c.trim());
      if (tcells.length && tcells.every((c) => decimalPlaces(c) >= 1)) k++;
      else n.push('Record each time to at least 1 decimal place (the stopwatch reads to 0.01 s).');
      const miscounted = runs.filter((r) => Math.abs(r.elapsed / r.period - r.n) > COUNT_TOL);
      if (!miscounted.length) k++;
      else {
        const x = miscounted[0]!;
        n.push(`${miscounted.length} timing${miscounted.length === 1 ? '' : 's'} did not cover exactly ${x.n} oscillations (e.g. ${sf(x.elapsed / x.period, 3)} were timed): count "0" as you start at the mark, then each time the mass passes it going the same way.`);
      }
      const derived = rows.every((r) => {
        const t1 = parseNumber(r.row?.t1);
        const t2 = parseNumber(r.row?.t2);
        const t = parseNumber(r.row?.t);
        const T = parseNumber(r.row?.T);
        const T2 = parseNumber(r.row?.T2);
        const nOsc = r.runs[0]?.n ?? state.n;
        if (t1 === null || t === null || T === null || T2 === null) return false;
        const mean = t2 === null ? t1 : (t1 + t2) / 2;
        return withinRel(t, mean, 0.005) && withinRel(T, t / nOsc, 0.01) && withinRel(T2, T * T, 0.02);
      });
      if (derived) k++;
      else n.push('Mean t = (t₁ + t₂)/2, T = t ÷ n (the number of oscillations) and T² = T × T for every row.');
    } else n.push('There are no readings to mark.');
    auto.push(score(crit('readings'), k, n));
  }

  // ---- graph (2): T² (up) against m (along)
  const points: XY[] = rows.map((r) => ({ x: parseNumber(r.row?.m), y: parseNumber(r.row?.T2) })).filter((p): p is XY => p.x !== null && p.y !== null && p.x > 0);
  const graph = gradeGraph(points, state.line, 'T² against m');
  auto.push(score(crit('graph'), graph.marks, graph.notes));

  // ---- slope and k (4)
  const xKg = mc.inKg;
  const slopeRaw = parseNumber(state.answers.slope.value);
  const sUnit = phyUnit(state.answers.slope.unit);
  const cands: { perGraph: number; perKg: number }[] = [];
  if (slopeRaw !== null && slopeRaw > 0) {
    const asKg = sUnit === 's2/kg' ? [slopeRaw] : sUnit === 's2/g' ? [slopeRaw * 1000] : [slopeRaw, slopeRaw * 1000];
    for (const c of asKg) cands.push({ perGraph: xKg ? c : c / 1000, perKg: c });
  }
  const kTyped = kOf(state.answers.k);
  {
    const n: string[] = [];
    let k = 0;
    const ok = cands.find((c) => slopeAccepted(c.perGraph, graph.fit?.slope ?? null, state.line, graph.lineOk));
    if (ok) k += 2;
    else if (slopeRaw === null) n.push('Give the slope of your graph of T² against m.');
    else if (!graph.fit) n.push('A slope needs your points first.');
    else n.push(`Your slope does not fit your own points (their best line has slope ${sf(graph.fit.slope, 3)} s² ${xKg ? 'kg' : 'g'}⁻¹): use two points far apart on your line, Δ(T²) ÷ Δm.`);
    const perKg = ok?.perKg ?? cands[0]?.perKg ?? null;
    if (perKg && withinRel(kTyped, SPRING_FOUR_PI2 / perKg, 0.02)) k++;
    else if (kTyped === null) n.push('Work out k = 4π² ÷ slope (slope in s² kg⁻¹).');
    else n.push(perKg ? `k = 4π² ÷ slope = 39.48 ÷ ${sf(perKg, 3)} = ${sf(SPRING_FOUR_PI2 / perKg, 3)} N m⁻¹ from your slope (in s² kg⁻¹).` : 'k = 4π² ÷ slope, with the slope in s² kg⁻¹.');
    if (withinRel(kTyped, v.k, 0.05)) k++;
    else if (kTyped !== null) n.push(`Your k is more than 5 % from the true value of this spring (${v.k.toFixed(1)} N m⁻¹): check the counting, the masses in kg and the line.`);
    auto.push(score(crit('calculations'), k, n));
  }

  // ---- units (1)
  {
    const un: string[] = [];
    let u = 1;
    const given = [state.answers.slope, state.answers.k].filter((a) => a.value.trim());
    if (!given.length) (u = 0), un.push('No answers to check the units of.');
    if (state.answers.slope.value.trim() && !['s2/kg', 's2/g'].includes(sUnit)) (u = 0), un.push('The slope of T² against m is in s² kg⁻¹.');
    if (state.answers.k.value.trim() && phyUnit(state.answers.k.unit) !== 'N/m') (u = 0), un.push('Give k in N m⁻¹.');
    auto.push(score(crit('units'), u, [...new Set(un)]));
  }

  const ai = precautionsItem(state, 'timing the vertical oscillations of a loaded spring to find its spring constant');
  const line = springOscLine(v);
  const T100 = springPeriod(v, 100, 0);
  const solution = [
    `T = 2π√((m + mₛ/3)/k), so T² = (4π²/k) m + (4π²/k)(mₛ/3): a straight line of T² against m.`,
    `For example, 0.100 kg gives T ≈ ${T100.toFixed(3)} s (20 oscillations ≈ ${(20 * T100).toFixed(1)} s), T² ≈ ${(T100 * T100).toFixed(3)} s².`,
    `Slope = 4π²/k = ${line.slope.toFixed(3)} s² kg⁻¹; the small intercept ${line.intercept.toFixed(4)} s² comes from the spring’s own mass (mₛ ≈ ${(v.springMass * 1000).toFixed(0)} g: intercept = 4π² mₛ/(3k)).`,
    `k = 4π² ÷ slope = ${v.k.toFixed(1)} N m⁻¹ (true value of this spring).`,
    graph.fit ? `From your own points the best line has slope ${sf(graph.fit.slope, 3)} s² ${xKg ? 'kg' : 'g'}⁻¹, giving k ≈ ${sf(SPRING_FOUR_PI2 / (xKg ? graph.fit.slope : graph.fit.slope * 1000), 3)} N m⁻¹.` : 'Plot T² against m from your table to find the slope.',
  ];
  const facts = [
    `Task: oscillations of a loaded spring (true k ${v.k} N/m, spring mass ${(v.springMass * 1000).toFixed(0)} g); timings ${runs.length} over ${new Set(runs.map((r) => r.load)).size} masses; displacements ${[...new Set(runs.map((r) => r.amp))].join(', ') || '—'} cm.`,
    `Student's slope ${state.answers.slope.value || '—'} ${state.answers.slope.unit}; k ${state.answers.k.value || '—'} ${state.answers.k.unit}.`,
  ];
  return { auto, ai, solution, facts };
}

function precautionsItem(state: PhySpringState, what: string): AiItem[] {
  return [
    {
      criterionId: 'precautions',
      question: `State two precautions taken to obtain accurate results when ${what}.`,
      answer: state.written.precautions.trim(),
      guide: `2 marks: one for each of two correct precautions. ${crit('precautions').guide}`,
      keywords: [
        ['parallax', 'eye level', 'eye in line', 'level with the pointer', 'perpendicular'],
        ['rest', 'steady', 'stop oscillating', 'settle', 'still'],
        ['elastic limit', 'unloading', 'unload', 'return'],
        ['vertical', 'plumb'],
        ['small', 'amplitude', 'displacement', 'sideways', 'swing'],
        ['repeat', 'repeated', 'average', 'mean', 'many oscillations'],
        ['fiducial', 'reference mark', 'rest position', 'mean position'],
        ['stable', 'firm', 'clamp'],
      ],
      need: 2,
    },
  ];
}
