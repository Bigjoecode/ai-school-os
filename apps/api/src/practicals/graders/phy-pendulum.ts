import { PENDULUM_MEAN_ZONE, PENDULUM_SMALL_ANGLE, PHY_PENDULUM, pendulumPeriod, phyPendulumVariant, type CriterionScore, type PhyPendulumState } from '@aischool/shared';
import { decimalPlaces, parseNumber, score, sf, withinAbs, withinRel } from './helpers';
import { gradeGraph, phyUnit, slopeAccepted, type XY } from './phy-common';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

/** A written time matches the stopwatch within this (s). */
const TIME_TOL = 0.05;
/** Timed the right number of oscillations: within this fraction of an oscillation. */
const COUNT_TOL = 0.25;
const FOUR_PI2 = 4 * Math.PI ** 2;

const crit = (id: string) => PHY_PENDULUM.rubric.find((c) => c.id === id)!;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
};

/**
 * Marks a simple-pendulum lab: setting up (length to the centre of the bob,
 * small amplitude), procedure (five or more lengths, 20 oscillations, timing
 * from the mean position, no draughts), the table against the stopwatch and the
 * true swing, the graph of T² against l, the slope and g (from the student's own
 * data, then accuracy against the true g) and units. Precautions go to AI.
 */
export const phyPendulumGrader: SimulatorGrader<'phy-pendulum'> = {
  id: 'phy-pendulum',
  grade(state: PhyPendulumState, seed: number): GraderOutput {
    const v = phyPendulumVariant(seed);
    const runs = state.runs.map((r, i) => ({ ...r, i, row: state.table[i], period: pendulumPeriod(v, r.thread, r.amplitude, i, r.shielded) }));
    const auto: CriterionScore[] = [];

    // How the student wrote l: metres if the numbers look like metres.
    const ls = runs.map((r) => parseNumber(r.row?.l)).filter((x): x is number => x !== null);
    const inMetres = ls.length > 0 && median(ls) < 3;
    const lCm = (raw: string | undefined) => {
      const x = parseNumber(raw);
      return x === null ? null : inMetres ? x * 100 : x;
    };

    // ---- setting up (2)
    {
      const n: string[] = [];
      let m = 0;
      if (!runs.length) n.push('No timings were recorded.');
      else {
        const centre = runs.filter((r) => withinAbs(lCm(r.row?.l), r.thread + v.bobRadius, 0.25)).length;
        if (centre === runs.length) m++;
        else {
          const toTop = runs.filter((r) => withinAbs(lCm(r.row?.l), r.thread, 0.25)).length;
          n.push(toTop ? `l is the length to the centre of the bob: add the radius (${v.bobDiameter.toFixed(1)} ÷ 2 = ${v.bobRadius.toFixed(2)} cm) to the thread length you read on the rule.` : 'Record l, the length from the point of suspension to the centre of the bob, for every timing.');
        }
        const big = runs.filter((r) => r.amplitude > PENDULUM_SMALL_ANGLE).length;
        if (!big) m++;
        else n.push(`${big} timing${big === 1 ? ' was' : 's were'} made with a large swing: displace the bob through a small angle (${PENDULUM_SMALL_ANGLE}° or less) so the motion is simple harmonic.`);
      }
      auto.push(score(crit('setup'), m, n));
    }

    // ---- procedure (4)
    {
      const n: string[] = [];
      let m = 0;
      if (runs.length) {
        const lengths: number[] = [];
        for (const r of runs) if (!lengths.some((x) => Math.abs(x - r.thread) < 2)) lengths.push(r.thread);
        const range = lengths.length ? Math.max(...lengths) - Math.min(...lengths) : 0;
        if (lengths.length >= 5 && range >= 30) m++;
        else n.push(lengths.length < 5 ? `Time the pendulum at five or more different lengths (you used ${lengths.length}).` : 'Spread your lengths out (at least 30 cm between the shortest and the longest).');
        if (runs.every((r) => r.n >= 20)) m++;
        else n.push('Time at least 20 oscillations each time: the reaction-time error is then shared over many swings.');
        const fromMean = runs.filter((r) => r.startPhase <= PENDULUM_MEAN_ZONE).length;
        if (fromMean >= Math.ceil(runs.length * 0.8)) m++;
        else n.push('Start the stopwatch as the bob passes the mean (rest) position, using the fiducial mark: it moves fastest there, so the instant is sharp.');
        if (runs.every((r) => r.shielded)) m++;
        else n.push('Close the window (or switch off the fan): draughts disturb the swing and scatter your times.');
      } else n.push('No timings were recorded.');
      auto.push(score(crit('procedure'), m, n));
    }

    // ---- table of readings (5)
    {
      const n: string[] = [];
      let m = 0;
      if (runs.length) {
        const cells = runs.flatMap((r) => [r.row?.l ?? '', r.row?.t ?? '', r.row?.T ?? '', r.row?.T2 ?? '']);
        if (cells.some((c) => !c.trim())) n.push('Fill in l, t, T and T² for every timing.');
        const good = runs.filter((r) => withinAbs(parseNumber(r.row?.t), r.elapsed, TIME_TOL)).length;
        if (good === runs.length) m += 2;
        else if (good >= runs.length / 2) {
          m += 1;
          n.push(`${runs.length - good} time${runs.length - good === 1 ? '' : 's'} did not match the stopwatch reading.`);
        } else n.push('Most times did not match the stopwatch: copy the stopwatch reading exactly.');
        if (runs.every((r) => r.row?.t.trim() && decimalPlaces(r.row.t) >= 1)) m++;
        else n.push('Record each time to at least 1 decimal place (the stopwatch reads to 0.01 s).');
        const miscounted = runs.filter((r) => Math.abs(r.elapsed / r.period - r.n) > COUNT_TOL);
        if (!miscounted.length) m++;
        else {
          const k = miscounted[0]!;
          n.push(`${miscounted.length} timing${miscounted.length === 1 ? '' : 's'} did not cover exactly ${k.n} oscillations (e.g. ${sf(k.elapsed / k.period, 3)} were timed): count "0" as you start, then each return to the mark in the same direction.`);
        }
        const derived = runs.filter((r) => {
          const t = parseNumber(r.row?.t);
          const T = parseNumber(r.row?.T);
          const T2 = parseNumber(r.row?.T2);
          return t !== null && T !== null && T2 !== null && withinRel(T, t / r.n, 0.005) && withinRel(T2, T * T, 0.01);
        }).length;
        if (derived === runs.length) m++;
        else n.push('T = t ÷ n (the number of oscillations) and T² = T × T for every row.');
      } else n.push('There are no readings to mark.');
      auto.push(score(crit('readings'), m, n));
    }

    // ---- graph (2)
    const points: XY[] = runs
      .map((r) => ({ x: parseNumber(r.row?.l), y: parseNumber(r.row?.T2) }))
      .filter((p): p is XY => p.x !== null && p.y !== null);
    const graph = gradeGraph(points, state.line, 'T² against l');
    auto.push(score(crit('graph'), graph.marks, graph.notes));

    // ---- slope and g (4), units (1)
    const xUnit = inMetres ? 'm' : 'cm';
    const slopeRaw = parseNumber(state.answers.slope.value);
    const slopeUnit = phyUnit(state.answers.slope.unit);
    const gRaw = parseNumber(state.answers.g.value);
    const gUnit = phyUnit(state.answers.g.unit);
    const slopeCandidates: { perX: number; perM: number }[] = [];
    if (slopeRaw !== null && slopeRaw > 0) {
      const asPerCm = slopeUnit === 's2/m' ? [slopeRaw / 100] : slopeUnit === 's2/cm' ? [slopeRaw] : [slopeRaw, slopeRaw / 100];
      for (const c of asPerCm) slopeCandidates.push({ perX: xUnit === 'cm' ? c : c * 100, perM: c * 100 });
    }
    {
      const n: string[] = [];
      let m = 0;
      const okSlope = slopeCandidates.find((c) => slopeAccepted(c.perX, graph.fit?.slope ?? null, state.line, graph.lineOk));
      if (okSlope) m += 2;
      else if (slopeRaw === null) n.push('Give the slope of your graph of T² against l.');
      else if (!graph.fit) n.push('A slope needs your points first.');
      else n.push(`Your slope does not fit your own points (their best line has slope ${sf(graph.fit.slope, 3)} s² ${xUnit}⁻¹): use two points far apart on your line, Δ(T²) ÷ Δl.`);
      // g from the student's own slope (in s² m⁻¹).
      const slopeM = okSlope?.perM ?? slopeCandidates[0]?.perM ?? null;
      const gTargets = slopeM ? [FOUR_PI2 / slopeM] : [];
      const gAsM = gRaw === null ? [] : gUnit === 'm/s2' ? [gRaw] : gUnit === 'cm/s2' ? [gRaw / 100] : [gRaw, gRaw / 100];
      if (gAsM.some((g) => gTargets.some((t) => withinRel(g, t, 0.02)))) m++;
      else if (gRaw === null) n.push('Work out g = 4π² ÷ slope.');
      else n.push(slopeM ? `g = 4π² ÷ slope = 39.48 ÷ ${sf(slopeM, 3)} = ${sf(FOUR_PI2 / slopeM, 3)} m s⁻² from your slope (in s² m⁻¹).` : 'g = 4π² ÷ slope, with the slope in s² m⁻¹.');
      if (gAsM.some((g) => withinRel(g, v.g, 0.03))) m++;
      else if (gRaw !== null) n.push(`Your g is more than 3 % from the true value here (${v.g.toFixed(2)} m s⁻²): check the length to the centre of the bob, the counting and the line.`);
      auto.push(score(crit('calculations'), m, n));

      const un: string[] = [];
      let u = 1;
      if (slopeRaw === null && gRaw === null) {
        u = 0;
        un.push('No answers to check the units of.');
      }
      if (slopeRaw !== null && slopeUnit !== 's2/m' && slopeUnit !== 's2/cm') {
        u = 0;
        un.push(slopeUnit ? 'The slope of T² against l is in s² m⁻¹ (or s² cm⁻¹).' : 'Give the slope its unit (s² m⁻¹ or s² cm⁻¹).');
      }
      if (gRaw !== null && gUnit !== 'm/s2' && gUnit !== 'cm/s2') {
        u = 0;
        un.push(gUnit ? 'g is an acceleration, in m s⁻².' : 'Give g its unit (m s⁻²).');
      }
      if (u && gRaw !== null && gUnit === 'cm/s2' && gRaw < 50) {
        u = 0;
        un.push('Your g value is in m s⁻², not cm s⁻².');
      }
      auto.push(score(crit('units'), u, un));
    }

    // ---- precautions (AI)
    const ai: AiItem[] = [
      {
        criterionId: 'precautions',
        question: 'State two precautions taken to obtain accurate results with the simple pendulum.',
        answer: state.written.precautions.trim(),
        guide: `2 marks: one for each of two correct precautions. ${crit('precautions').guide}`,
        keywords: [['small angle', 'small amplitude', 'small displacement', 'less than 10', 'small angles'], ['mean position', 'rest position', 'equilibrium', 'fiducial', 'reference mark'], ['draught', 'draughts', 'draft', 'drafts', 'wind', 'fan', 'window'], ['split cork', 'rigid', 'firm', 'clamp'], ['centre of the bob', 'center of the bob', 'centre of bob', 'center of bob', 'radius'], ['vertical plane', 'spin', 'spinning', 'twist'], ['parallax', 'eye level'], ['repeat', 'repeated', 'many oscillations', '20 oscillations', 'twenty']],
        need: 2,
      },
    ];

    // ---- worked solution and facts
    const sampleL = v.suggested.map((t) => t + v.bobRadius);
    const sampleT2 = sampleL.map((l) => (FOUR_PI2 * (l / 100)) / v.g);
    const trueSlopeM = FOUR_PI2 / v.g;
    const solution = [
      `l = thread length + radius of the bob = thread + ${v.bobRadius.toFixed(2)} cm (bob diameter ${v.bobDiameter.toFixed(1)} cm).`,
      `For each length: T = t ÷ n, then T². For example l = ${sampleL[0]!.toFixed(2)} cm gives T² ≈ ${sampleT2[0]!.toFixed(3)} s² and l = ${sampleL[5]!.toFixed(2)} cm gives T² ≈ ${sampleT2[5]!.toFixed(3)} s².`,
      `T² = (4π²/g) l, so the graph of T² against l is a straight line through the origin with slope 4π²/g.`,
      `True slope here: ${sf(trueSlopeM, 3)} s² m⁻¹ (${sf(trueSlopeM / 100, 3)} s² cm⁻¹).`,
      `g = 4π² ÷ slope = 39.48 ÷ ${sf(trueSlopeM, 3)} = ${v.g.toFixed(2)} m s⁻².`,
      graph.fit ? `From your own points the best line has slope ${sf(graph.fit.slope, 3)} s² ${xUnit}⁻¹, giving g = ${sf(FOUR_PI2 / (xUnit === 'cm' ? graph.fit.slope * 100 : graph.fit.slope), 3)} m s⁻².` : 'Plot your own T² against l to find the slope.',
    ];
    const facts = [
      `Simple pendulum: bob ${v.bobDiameter.toFixed(1)} cm; ${runs.length} timing${runs.length === 1 ? '' : 's'} at ${new Set(runs.map((r) => Math.round(r.thread))).size} lengths; largest amplitude ${runs.length ? Math.max(...runs.map((r) => r.amplitude)) : '—'}°; window ${runs.every((r) => r.shielded) ? 'closed' : 'open for some timings'}.`,
      `True g ${v.g.toFixed(2)} m s⁻²; student's slope ${state.answers.slope.value || '—'} ${state.answers.slope.unit}; g ${state.answers.g.value || '—'} ${state.answers.g.unit}.`,
    ];
    return { auto, ai, solution, facts };
  },
};
