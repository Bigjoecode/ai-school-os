import {
  MOMENTS_KNOWN,
  MOMENTS_SPREAD,
  PHY_MOMENTS,
  momentsBalanced,
  momentsGTol,
  momentsMassBalance,
  momentsOtherBalance,
  momentsTrueMass,
  phyMomentsVariant,
  type CriterionScore,
  type MomentsTask,
  type PhyMomentsState,
} from '@aischool/shared';
import { decimalPlaces, parseNumber, score, sf, withinAbs, withinRel } from './helpers';
import { gradeGraph, phyUnit, slopeAccepted, type XY } from './phy-common';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

const POS_TOL = 0.2;
const D_TOL = 0.15;
const crit = (id: string) => PHY_MOMENTS.rubric.find((c) => c.id === id)!;
/** A mass as written → grams (kg converted; a bare number is taken as grams). */
const grams = (raw: string, unit: string) => {
  const x = parseNumber(raw);
  if (x === null) return null;
  return phyUnit(unit) === 'kg' ? x * 1000 : x;
};

/**
 * Marks the metre rule on the knife edge (principle of moments, or the mass of
 * the rule): the procedure (G found by balancing the rule alone, the pivot at
 * G or G found first, enough well-spread positions), whether the rule really
 * balanced for each reading (from the torque about the knife edge and its
 * friction), the table against the rule (distances from the pivot, not the
 * zero end), the graph of d₁ against d₂, the slope and M = m × slope, M from
 * each row averaged, accuracy and units. The precautions go to AI.
 */
export const phyMomentsGrader: SimulatorGrader<'phy-moments'> = {
  id: 'phy-moments',
  grade(state: PhyMomentsState, seed: number): GraderOutput {
    const v = phyMomentsVariant(seed);
    const task: MomentsTask = state.task ?? 'MOMENTS';
    const mass = task === 'MASS';
    const m = MOMENTS_KNOWN[task];
    const truth = momentsTrueMass(v, task);
    const what = mass ? 'the mass of the rule' : 'the unknown mass M';
    const readings = state.readings.map((r, i) => ({ ...r, i, row: state.table[i], balanced: r.known !== null && (mass || r.other !== null) && momentsBalanced(v, task, r) }));
    const auto: CriterionScore[] = [];
    const gWritten = parseNumber(state.answers.g.value);
    const gWrittenCm = gWritten === null ? null : phyUnit(state.answers.g.unit) === 'm' ? gWritten * 100 : gWritten;
    /** The student's own G (what their distances should be measured from). */
    const gOwn = gWrittenCm ?? state.g;

    // ---- procedure (4)
    {
      const n: string[] = [];
      let k = 0;
      const gTol = momentsGTol(v);
      const gAt = state.log.findIndex((e) => e.a.startsWith('g:'));
      const firstReading = state.log.findIndex((e) => e.a.startsWith('reading:'));
      if (state.g !== null && Math.abs(state.g - v.g) <= gTol && withinAbs(gWrittenCm, state.g, 0.1)) k++;
      else if (state.g === null) n.push('Find the centre of gravity G first: balance the rule alone on the knife edge and record the balance point.');
      else if (Math.abs(state.g - v.g) > gTol) n.push(`The rule was not balanced when you recorded G at ${state.g.toFixed(1)} cm: it balances alone at about ${v.g.toFixed(1)} cm.`);
      else n.push('Write down the balance point G (the rule alone), to 0.1 cm.');
      if (!readings.length) n.push('No readings were taken.');
      else {
        if (mass) {
          if (gAt >= 0 && (firstReading < 0 || gAt < firstReading)) k++;
          else n.push('Find G before you hang the mass: the rule’s weight acts at G, and you need it to take moments.');
        } else if (readings.every((r) => Math.abs(r.pivot - v.g) <= gTol)) k++;
        else n.push('Keep the knife edge at G for every reading: then the rule’s own weight has no moment about the pivot.');
        const xs = readings.map((r) => r.known).filter((x): x is number => x !== null);
        const distinct: number[] = [];
        for (const x of xs) if (!distinct.some((d) => Math.abs(d - x) < 1)) distinct.push(x);
        if (distinct.length >= 5) k++;
        else n.push(`Take readings with the ${m} g mass at five or more different positions (you used ${distinct.length}).`);
        const spreadOf = mass ? xs : readings.filter((r) => r.known !== null).map((r) => Math.abs(r.pivot - r.known!));
        if (spreadOf.length && Math.max(...spreadOf) - Math.min(...spreadOf) >= MOMENTS_SPREAD[task] - 0.05) k++;
        else n.push(mass ? `Spread the mass’s positions out (at least ${MOMENTS_SPREAD.MASS} cm between the first and the last), so the points are well spaced.` : `Spread the values of d₁ out (at least ${MOMENTS_SPREAD.MOMENTS} cm between the smallest and the largest).`);
      }
      auto.push(score(crit('procedure'), k, n));
    }

    // ---- balancing (3)
    {
      const n: string[] = [];
      const good = readings.filter((r) => r.balanced).length;
      const k = readings.length ? (3 * good) / readings.length : 0;
      if (!readings.length) n.push('No balance positions were found.');
      else if (good < readings.length) {
        const bad = readings.find((r) => !r.balanced);
        const hint =
          bad && bad.known !== null
            ? mass
              ? ` (with the mass at ${bad.known.toFixed(1)} cm the rule balances at about ${momentsMassBalance(v, bad.known).toFixed(1)} cm; you had ${bad.pivot.toFixed(1)} cm)`
              : bad.other !== null
                ? ` (with the 50 g at ${bad.known.toFixed(1)} cm, M balances at about ${momentsOtherBalance(v, bad.pivot, bad.known).toFixed(1)} cm; you had ${bad.other.toFixed(1)} cm)`
                : ' (the unknown mass was not hung)'
            : '';
        n.push(`${readings.length - good} of your ${readings.length} readings were taken with the rule not balanced${hint}. Release the rule level and check it stays horizontal against the reference mark before you read.`);
      }
      auto.push(score(crit('balancing'), Math.floor(k * 2) / 2, n));
    }

    // ---- table of readings (4)
    {
      const n: string[] = [];
      let k = 0;
      if (readings.length) {
        if (readings.some((r) => !r.row || !r.row.x1.trim() || !r.row.x2.trim() || !r.row.d1.trim() || !r.row.d2.trim())) n.push('Fill in every column for every reading.');
        const tests = readings.flatMap((r) => [withinAbs(parseNumber(r.row?.x1), r.known ?? -99, POS_TOL), withinAbs(parseNumber(r.row?.x2), (mass ? r.pivot : r.other) ?? -99, POS_TOL)]);
        const good = tests.filter(Boolean).length;
        const where = mass ? 'the mass’s thread loop and the knife edge' : 'each thread loop';
        if (good === tests.length) k += 2;
        else if (good >= tests.length / 2) {
          k += 1;
          n.push(`${tests.length - good} of your marks did not match the rule: read ${where} against the scale from directly in front, to 0.1 cm.`);
        } else n.push(`Most of your marks did not match the rule: read ${where} at eye level, to 0.1 cm.`);
        if (readings.every((r) => ['x1', 'x2', 'd1', 'd2'].every((c) => r.row?.[c as 'x1']?.trim() && decimalPlaces(r.row[c as 'x1']) === 1))) k++;
        else n.push('Record the marks and the distances in cm to 1 decimal place (e.g. 30.0 cm, 24.6 cm).');
        const dOk = readings.every((r) => {
          const x1 = parseNumber(r.row?.x1);
          const x2 = parseNumber(r.row?.x2);
          const d1 = parseNumber(r.row?.d1);
          const d2 = parseNumber(r.row?.d2);
          if (x1 === null || x2 === null || d1 === null || d2 === null || gOwn === null) return false;
          return mass ? withinAbs(d1, Math.abs(x2 - x1), D_TOL) && withinAbs(d2, Math.abs(gOwn - x2), D_TOL) : withinAbs(d1, Math.abs(gOwn - x1), D_TOL) && withinAbs(d2, Math.abs(x2 - gOwn), D_TOL);
        });
        if (dOk) k++;
        else n.push(mass ? 'Measure the distances from the pivot P: d₁ = P − (mass’s mark), d₂ = G − P — not from the zero end of the rule.' : 'Measure the distances from the pivot (at G): d₁ = G − (50 g mark), d₂ = (M’s mark) − G — not from the zero end of the rule.');
      } else n.push('There are no readings to mark.');
      auto.push(score(crit('readings'), k, n));
    }

    // ---- graph (2): d₁ (up) against d₂ (along)
    const points: XY[] = readings.map((r) => ({ x: parseNumber(r.row?.d2), y: parseNumber(r.row?.d1) })).filter((p): p is XY => p.x !== null && p.y !== null && p.x > 0);
    const graph = gradeGraph(points, state.line, 'd₁ against d₂');
    auto.push(score(crit('graph'), graph.marks, graph.notes));

    // ---- slope and mass (4)
    const slope = parseNumber(state.answers.slope.value);
    const fromGraph = grams(state.answers.mass.value, state.answers.mass.unit);
    const mean = grams(state.answers.mean.value, state.answers.mean.unit);
    // The best line through the origin of the student's own points (the expected relation d₁ = (M/m) d₂).
    const originSlope = points.length ? points.reduce((t, p) => t + p.x * p.y, 0) / Math.max(1e-9, points.reduce((t, p) => t + p.x * p.x, 0)) : null;
    {
      const n: string[] = [];
      let k = 0;
      const okSlope = slope !== null && (slopeAccepted(slope, graph.fit?.slope ?? null, state.line, graph.lineOk) || (originSlope !== null && withinRel(slope, originSlope, 0.05)));
      if (okSlope) k++;
      else if (slope === null) n.push('Work out the slope of your graph from two points far apart on your line.');
      else n.push(graph.fit ? `Your slope does not fit your own points (their best line has a slope of about ${sf(graph.fit.slope, 3)}).` : 'A slope needs your points first.');
      if (slope !== null && withinRel(fromGraph, m * slope, 0.02)) k++;
      else if (fromGraph === null) n.push(`Work out ${what}: M = m × slope = ${m} g × slope.`);
      else if (slope !== null) n.push(`M = m × slope: from your slope, M ≈ ${sf(m * slope, 3)} g.`);
      else n.push('Find the slope first, then M = m × slope.');
      const rowMs = readings.map((r) => {
        const d1 = parseNumber(r.row?.d1);
        const d2 = parseNumber(r.row?.d2);
        return { said: grams(r.row?.m ?? '', 'g'), calc: d1 !== null && d2 !== null && d2 > 0 ? (m * d1) / d2 : null };
      });
      const rowsOk = rowMs.length > 0 && rowMs.every((x) => x.calc !== null && withinRel(x.said, x.calc, 0.02));
      const said = rowMs.map((x) => x.said).filter((x): x is number => x !== null);
      const avg = said.length ? said.reduce((t, x) => t + x, 0) / said.length : null;
      if (rowsOk && avg !== null && withinRel(mean, avg, 0.02)) k++;
      else if (!rowsOk) n.push(`Work out M for each row: M = ${m} × d₁ ÷ d₂ (in g).`);
      else n.push(`Average the masses from your rows: their mean is about ${sf(avg!, 3)} g.`);
      const best = fromGraph ?? mean;
      if (withinRel(best, truth, 0.05)) k++;
      else if (best !== null) n.push(`Your mass is more than 5 % from the true value here (${truth.toFixed(1)} g).`);
      auto.push(score(crit('calculations'), k, n));
    }

    // ---- units (1)
    {
      const un: string[] = [];
      let u = 1;
      const given = [state.answers.g, state.answers.slope, state.answers.mass, state.answers.mean].filter((a) => a.value.trim());
      if (!given.length) {
        u = 0;
        un.push('No answers to check the units of.');
      }
      if (state.answers.g.value.trim() && !['cm', 'm'].includes(phyUnit(state.answers.g.unit))) {
        u = 0;
        un.push('Give G its unit (cm).');
      }
      for (const [a, label] of [
        [state.answers.mass, 'the mass from the graph'],
        [state.answers.mean, 'the mean mass'],
      ] as const) {
        if (a.value.trim() && !['g', 'kg'].includes(phyUnit(a.unit))) {
          u = 0;
          un.push(`Give ${label} its unit (g).`);
        }
      }
      if (state.answers.slope.value.trim() && !['', 'none'].includes(phyUnit(state.answers.slope.unit))) {
        u = 0;
        un.push('The slope d₁/d₂ is a ratio of two lengths: it has no unit.');
      }
      auto.push(score(crit('units'), u, [...new Set(un)]));
    }

    // ---- written answers (AI)
    const ai: AiItem[] = [
      {
        criterionId: 'precautions',
        question: `State two precautions taken to obtain accurate results when ${mass ? 'finding the mass of a metre rule by moments' : 'verifying the principle of moments with a metre rule'}.`,
        answer: state.written.precautions.trim(),
        guide: `2 marks: one for each of two correct precautions. ${crit('precautions').guide}`,
        keywords: [
          ['horizontal', 'balanced', 'level'],
          ['thread', 'loop', 'vertical', 'thin'],
          ['from the pivot', 'pivot', 'knife edge'],
          ['friction', 'sharp'],
          ['draught', 'draft', 'wind', 'fan'],
          ['parallax', 'eye level', 'perpendicular', 'directly'],
          ['repeat', 'repeated', 'average'],
          ['low', 'close to the bench'],
        ],
        need: 2,
      },
    ];

    // ---- worked solution and facts
    const solution = mass
      ? [
          `The rule alone balances at G ≈ ${v.g.toFixed(1)} cm: its weight acts there (a real rule is not exactly uniform, so G is not exactly 50.0 cm).`,
          `With the 100 g at x, take moments about the balance point P: 100 × (P − x) = M × (G − P), so d₁ = (M/100) × d₂.`,
          `For example: mass at 5.0 cm → P ≈ ${momentsMassBalance(v, 5).toFixed(1)} cm; mass at 20.0 cm → P ≈ ${momentsMassBalance(v, 20).toFixed(1)} cm.`,
          `The graph of d₁ against d₂ is a straight line through the origin of slope M/100 = ${(v.ruleMass / 100).toFixed(3)}.`,
          `M = 100 g × slope = ${v.ruleMass.toFixed(1)} g (true mass of this rule).`,
          graph.fit ? `From your own points the best line has slope ${sf(graph.fit.slope, 3)}, giving M ≈ ${sf(graph.fit.slope * 100, 3)} g.` : 'Plot d₁ against d₂ from your table to find the slope.',
        ]
      : [
          `The rule alone balances at G ≈ ${v.g.toFixed(1)} cm. With the knife edge at G the rule’s own weight has no moment about the pivot.`,
          `Anticlockwise moment = clockwise moment: 50 × d₁ = M × d₂, so d₁ = (M/50) × d₂.`,
          `For example, with the 50 g at 30.0 cm (d₁ ≈ ${(v.g - 30).toFixed(1)} cm) M balances at d₂ ≈ ${(momentsOtherBalance(v, v.g, 30) - v.g).toFixed(1)} cm.`,
          `The graph of d₁ against d₂ is a straight line through the origin of slope M/m = ${(v.unknown / 50).toFixed(3)}.`,
          `M = 50 g × slope = ${v.unknown.toFixed(1)} g (the true unknown mass).`,
          graph.fit ? `From your own points the best line has slope ${sf(graph.fit.slope, 3)}, giving M ≈ ${sf(graph.fit.slope * 50, 3)} g.` : 'Plot d₁ against d₂ from your table to find the slope.',
        ];
    const facts = [
      `Task: ${mass ? 'mass of a metre rule' : 'principle of moments (unknown mass)'} (true M ${truth.toFixed(1)} g, G ${v.g.toFixed(2)} cm); readings ${readings.length}, ${readings.filter((r) => r.balanced).length} balanced; G recorded ${state.g === null ? 'not done' : `${state.g.toFixed(1)} cm`}.`,
      `Student's slope ${state.answers.slope.value || '—'}; M from graph ${state.answers.mass.value || '—'} ${state.answers.mass.unit}; mean M ${state.answers.mean.value || '—'} ${state.answers.mean.unit}.`,
    ];
    return { auto, ai, solution, facts };
  },
};
