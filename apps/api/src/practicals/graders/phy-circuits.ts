import {
  PHY_CIRCUITS,
  SERIES_LABEL,
  bridgeBalance,
  circuitsCheck,
  circuitsMeters,
  circuitsOpenCircuit,
  circuitsReadingSettings,
  circuitsTrue,
  phyCircuitsVariant,
  type CircuitsCheck,
  type CircuitsSettings,
  type CircuitsTask,
  type CriterionScore,
  type PhyCircuitsState,
  type SeriesArrangement,
} from '@aischool/shared';
import { decimalPlaces, mean, parseNumber, score, sf, withinAbs, withinRel } from './helpers';
import { gradeGraph, phyUnit, slopeAccepted, type XY } from './phy-common';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

const I_TOL = 0.01;
const V_TOL = 0.03;
/** A balance length within this of the true balance (cm) was taken where the galvanometer read zero. */
const L_TOL = 0.3;

const crit = (id: string) => PHY_CIRCUITS.rubric.find((c) => c.id === id)!;
const derivedOk = (got: number | null, want: number) => got !== null && Number.isFinite(want) && (withinRel(got, want, 0.015) || withinAbs(got, want, 0.006));

/**
 * Marks the current-electricity lab (metre bridge, e.m.f. and internal
 * resistance, resistors in series and parallel): the circuit (solved from the
 * student's own wiring at every reading), procedure, care, the table against
 * the meters (or the true balance point), the graph or the calculated
 * combinations, the results from the student's own data with a separate
 * accuracy mark, and units. The conclusion and the precautions go to AI.
 */
export const phyCircuitsGrader: SimulatorGrader<'phy-circuits'> = {
  id: 'phy-circuits',
  grade(state: PhyCircuitsState, seed: number): GraderOutput {
    const v = phyCircuitsVariant(seed);
    const task: CircuitsTask = state.task ?? 'BRIDGE';
    const truth = circuitsTrue(v);
    const readings = state.readings.map((r, i) => {
      const settings = circuitsReadingSettings(task, r);
      return { ...r, i, settings, meters: circuitsMeters(v, settings, i), check: circuitsCheck(v, settings) };
    });
    const current: CircuitsSettings = { task, wires: state.wires, key: true, rheostat: state.rheostat, jockey: state.jockey, pressed: true, rbox: state.rbox, swap: state.swap, heat: 0 };
    const checks: CircuitsCheck[] = readings.length ? readings.map((r) => r.check) : [circuitsCheck(v, current)];
    const all = (k: keyof CircuitsCheck) => checks.every((c) => !!c[k]);
    const cool = readings.filter((r) => r.heat === 0).length >= Math.ceil(readings.length * 0.8);
    const auto: CriterionScore[] = [];
    const ans = state.answers;
    const num = (id: keyof typeof ans) => parseNumber(ans[id].value);
    const unit = (id: keyof typeof ans) => phyUnit(ans[id].unit);
    const solution: string[] = [];
    const facts: string[] = [];
    let ai: AiItem[] = [];
    const careKey = (n: string[]) => {
      if (readings.length && cool) return 1;
      n.push(readings.length ? 'Open the key between readings: a steady current runs the cell down and warms the resistors.' : 'No readings were taken.');
      return 0;
    };

    if (task === 'BRIDGE') {
      const rows = readings.map((r) => ({ r, row: state.bridge[r.i], bal: bridgeBalance(v, r) }));
      // ---- circuit (3)
      {
        const n: string[] = [];
        let m = 0;
        if (all('supplyAcross')) m++;
        else n.push('Connect the cell (through the key) across the two ends of the bridge wire, A and C.');
        if (all('galvoBridge')) m++;
        else n.push('Connect the galvanometer between the centre strip (the junction of X and R) and the jockey.');
        if (all('keySeries')) m++;
        else n.push('Put the key in series with the cell so the current can be switched off between readings.');
        auto.push(score(crit('circuit'), m, n));
      }
      // ---- procedure (3)
      {
        const n: string[] = [];
        let m = 0;
        const Rs = new Set(rows.map((x) => x.r.rbox));
        if (Rs.size >= 4) m++;
        else n.push(`Find the balance point for at least four different values of R (you used ${Rs.size}).`);
        const mid = rows.filter((x) => x.bal >= 30 && x.bal <= 70).length;
        if (rows.length && mid >= Math.ceil(rows.length * 0.75)) m++;
        else if (rows.length) n.push('Choose R so that the balance point is near the middle of the wire (between 30 cm and 70 cm): the percentage error in l is then smallest.');
        if (rows.some((x) => x.r.swap) && rows.some((x) => !x.r.swap)) m++;
        else n.push('Interchange X and R and find the balance point again, to check the result and cancel the end errors.');
        auto.push(score(crit('procedure'), m, n));
      }
      // ---- care (2)
      {
        const n: string[] = [];
        let m = 0;
        if (state.scrapes === 0 && rows.length) m++;
        else n.push('Tap the jockey on the wire; sliding it along while pressed scrapes the wire and makes it non-uniform.');
        m += careKey(n);
        auto.push(score(crit('care'), m, n));
      }
      // ---- readings (4)
      {
        const n: string[] = [];
        let m = 0;
        if (rows.length) {
          if (rows.some((x) => !x.row || !x.row.R.trim() || !x.row.l.trim() || !x.row.m.trim() || !x.row.X.trim() || (!x.r.swap && !x.row.q.trim()))) n.push('Fill in R, l, 100 − l, (100 − l)/l and X for every balance point.');
          const good = rows.filter((x) => x.r.check.works && Math.abs(x.r.jockey - x.bal) <= L_TOL && withinAbs(parseNumber(x.row?.l), x.r.jockey, 0.15) && withinAbs(parseNumber(x.row?.R), x.r.rbox, 0.01)).length;
          if (good === rows.length) m += 2;
          else if (good >= rows.length / 2) {
            m += 1;
            n.push(`${rows.length - good} balance length${rows.length - good === 1 ? ' was' : 's were'} not where the galvanometer reads zero, or not recorded as set (tap on both sides until there is no deflection; read l from the left end).`);
          } else n.push('Most balance lengths were not at the true balance point: tap the jockey until the galvanometer shows no deflection, then read l from the left (A) end.');
          if (rows.every((x) => x.row && decimalPlaces(x.row.l) === 1)) m++;
          else n.push('Record each balance length to 1 decimal place in cm (e.g. 48.6 cm).');
          const derived = rows.filter(({ r, row }) => {
            const l = parseNumber(row?.l);
            const R = parseNumber(row?.R);
            if (l === null || R === null || l <= 0 || l >= 100) return false;
            const X = r.swap ? (R * (100 - l)) / l : (R * l) / (100 - l);
            return derivedOk(parseNumber(row?.m), 100 - l) && derivedOk(parseNumber(row?.X), X) && (r.swap || derivedOk(parseNumber(row?.q), (100 - l) / l));
          }).length;
          if (derived === rows.length) m++;
          else n.push('Work out 100 − l, (100 − l)/l and X for every row: X = R l/(100 − l), or X = R(100 − l)/l with X in the right-hand gap.');
        } else n.push('There are no readings to mark.');
        auto.push(score(crit('readings'), m, n));
      }
      // ---- graph (2)
      const points: XY[] = rows
        .filter((x) => !x.r.swap)
        .map(({ row }) => {
          const l = parseNumber(row?.l);
          const q = parseNumber(row?.q) ?? (l && l < 100 ? (100 - l) / l : null);
          return { x: q, y: parseNumber(row?.R) };
        })
        .filter((p): p is XY => p.x !== null && p.y !== null);
      const graph = gradeGraph(points, state.line, 'R against (100 − l)/l');
      auto.push(score(crit('analysis'), graph.marks, graph.notes));
      // ---- results (3), units (1)
      {
        const n: string[] = [];
        let m = 0;
        const Xs = rows.map((x) => parseNumber(x.row?.X)).filter((x): x is number => x !== null);
        const meanX = num('mean');
        const slope = num('slope');
        if (Xs.length && withinRel(meanX, mean(Xs), 0.015)) m++;
        else if (meanX === null) n.push('Give the mean of your values of X.');
        else n.push(Xs.length ? `The mean of your X column is ${sf(mean(Xs), 3)} Ω.` : 'Work out X for each row first.');
        if (slopeAccepted(slope, graph.fit?.slope ?? null, state.line, graph.lineOk)) m++;
        else if (slope === null) n.push('Give the slope of your graph of R against (100 − l)/l (it equals X).');
        else n.push(graph.fit ? `Your slope does not fit your own points (their best line has slope ${sf(graph.fit.slope, 3)} Ω).` : 'A slope needs your points first.');
        if (withinRel(meanX, truth.X, 0.04) || withinRel(slope, truth.X, 0.04)) m++;
        else if (meanX !== null || slope !== null) n.push(`Your X is more than 4 % from the true value (${truth.X.toFixed(2)} Ω).`);
        auto.push(score(crit('calculations'), m, n));
        const un: string[] = [];
        let u = 1;
        if (meanX === null && slope === null) (u = 0), un.push('No answers to check the units of.');
        if (meanX !== null && unit('mean') !== 'ohm') (u = 0), un.push('Resistance is in ohms (Ω): give the mean X its unit.');
        if (slope !== null && unit('slope') !== 'ohm') (u = 0), un.push('The slope of R (Ω) against (100 − l)/l (no unit) is in ohms (Ω).');
        auto.push(score(crit('units'), u, un));
      }
      solution.push(
        'Cell and key in series across the ends A and C of the bridge wire; X in the left gap, the resistance box R in the right; galvanometer from the centre strip to the jockey.',
        'Tap the jockey along the wire until the galvanometer shows no deflection; read the balance length l from the left end.',
        'At balance X/R = l/(100 − l), so X = R l/(100 − l). With X and R interchanged, X = R(100 − l)/l.',
        'R = X (100 − l)/l, so R against (100 − l)/l is a straight line through the origin with slope X.',
        `True X here: ${truth.X.toFixed(2)} Ω (the wire's end resistances are equivalent to ${v.alpha.toFixed(1)} cm and ${v.beta.toFixed(1)} cm of wire; interchanging cancels them).`,
      );
      facts.push(`Task: metre bridge; balance points: ${rows.length} (${rows.filter((x) => x.r.swap).length} interchanged); scrapes: ${state.scrapes}.`, `True X ${truth.X.toFixed(2)} Ω; student's mean X ${ans.mean.value || '—'} ${ans.mean.unit}, slope ${ans.slope.value || '—'} ${ans.slope.unit}.`);
      ai = [
        {
          criterionId: 'conclusion',
          question: 'State your result for the unknown resistance X.',
          answer: state.written.conclusion.trim(),
          guide: `1 mark: the value of X with its unit (about ${truth.X.toFixed(1)} Ω here), and that the check with X and R interchanged agrees; half a mark for the value alone.`,
          keywords: [['unknown', 'resistance', 'x '], ['ohm', 'agree', 'interchang', 'same', 'consistent', 'equal', 'check']],
          need: 2,
        },
      ];
    } else if (task === 'EMF') {
      const rows = readings.map((r) => ({ r, row: state.emf[r.i] }));
      const open = circuitsMeters(v, { ...(readings[0]?.settings ?? current), key: false, heat: 0 }, 'open');
      const across = all('voltmeterAcross');
      // ---- circuit (3)
      {
        const n: string[] = [];
        let m = 0;
        if (all('ammeterSeries') && all('rheostatSeries')) m++;
        else n.push(!all('ammeterSeries') ? 'Connect the ammeter in series with the cell, so it carries the whole current.' : 'Put the rheostat in series so it controls the current.');
        if (across) m++;
        else n.push('Connect the voltmeter directly across the cell’s two terminals (it measures the terminal p.d.).');
        if (all('keySeries') && all('polarity')) m++;
        else n.push(!all('keySeries') ? 'Put the key in series so the circuit can be switched off between readings.' : 'Connect each meter’s + terminal towards the + of the cell.');
        auto.push(score(crit('circuit'), m, n));
      }
      const e0 = num('e0');
      // ---- procedure (3)
      {
        const n: string[] = [];
        let m = 0;
        const Is: number[] = [];
        for (const r of rows) if (!Is.some((x) => Math.abs(x - r.r.meters.I) < 0.03)) Is.push(r.r.meters.I);
        if (Is.length >= 4) m++;
        else n.push(`Take readings at least four different currents (you used ${Is.length}).`);
        if (rows.length && Math.max(...rows.map((r) => r.r.meters.I)) - Math.min(...rows.map((r) => r.r.meters.I)) >= 0.4) m++;
        else if (rows.length) n.push('Spread the currents over at least 0.4 A (e.g. 0.20 A to 0.80 A).');
        if (e0 !== null && across) m++;
        else n.push('With the key open, read the voltmeter across the cell: that is (almost exactly) the e.m.f.');
        auto.push(score(crit('procedure'), m, n));
      }
      // ---- care (2)
      {
        const n: string[] = [];
        let m = careKey(n);
        if (state.overloads === 0 && rows.length) m++;
        else n.push('The ammeter was driven past its full scale: with the rheostat at zero the cell is almost short-circuited. Keep some resistance in the circuit.');
        auto.push(score(crit('care'), m, n));
      }
      // ---- readings (4)
      {
        const n: string[] = [];
        let m = 0;
        if (rows.length) {
          if (rows.some((x) => !x.row?.I.trim() || !x.row?.V.trim())) n.push('Fill in I and V for every reading.');
          const tests = rows.flatMap(({ r, row }) => [withinAbs(parseNumber(row?.I), r.meters.I, I_TOL), withinAbs(parseNumber(row?.V), r.meters.V, V_TOL)]);
          const good = tests.filter(Boolean).length;
          if (good === tests.length) m += 2;
          else if (good >= tests.length / 2) {
            m += 1;
            n.push(`${tests.length - good} reading${tests.length - good === 1 ? '' : 's'} did not match the meters (read the pointer from directly in front, to half a division).`);
          } else n.push('Most readings did not match the meters: read the pointer against the scale from directly in front of it.');
          if (rows.every(({ row }) => row && decimalPlaces(row.I) === 2 && decimalPlaces(row.V) === 2)) m++;
          else n.push('Record I and V to 2 decimal places (e.g. 0.40 A, 1.30 V).');
        } else n.push('There are no readings to mark.');
        if (e0 !== null && across && withinAbs(e0, open.V, V_TOL) && decimalPlaces(ans.e0.value) === 2) m++;
        else if (e0 !== null) n.push(`The open-circuit voltmeter reading (key open) was ${open.V.toFixed(2)} V, to 2 decimal places.`);
        auto.push(score(crit('readings'), m, n));
      }
      // ---- graph (2)
      const points: XY[] = rows.map(({ row }) => ({ x: parseNumber(row?.I), y: parseNumber(row?.V) })).filter((p): p is XY => p.x !== null && p.y !== null);
      const graph = gradeGraph(points, state.line, 'V against I');
      auto.push(score(crit('analysis'), graph.marks, graph.notes));
      // ---- results (3), units (1)
      const E = num('emf');
      const r = num('r');
      const slope = num('slope');
      {
        const n: string[] = [];
        let m = 0;
        const line = state.line;
        const lineIntercept = line && Math.abs(line.x2 - line.x1) > 1e-9 ? line.y1 - ((line.y2 - line.y1) / (line.x2 - line.x1)) * line.x1 : null;
        const intercepts = [...(graph.fit ? [{ y: graph.fit.intercept, tol: 0.02 }] : []), ...(graph.lineOk && lineIntercept !== null ? [{ y: lineIntercept, tol: 0.015 }] : [])];
        if (E !== null && intercepts.some((c) => withinRel(E, c.y, c.tol))) m++;
        else if (E === null) n.push('Give E, the intercept of your line on the V-axis (where I = 0).');
        else n.push(graph.fit ? `E is the intercept on the V-axis: your own points give about ${sf(graph.fit.intercept, 3)} V.` : 'E needs your graph first.');
        const okSlope = slope !== null && slope < 0 && slopeAccepted(slope, graph.fit?.slope ?? null, state.line, graph.lineOk);
        if (okSlope && r !== null && r > 0 && withinRel(r, -slope!, 0.02)) m++;
        else if (slope === null || r === null) n.push('Give the slope of your graph (it is negative) and r = −slope.');
        else if (slope >= 0) n.push('V falls as I rises, so the slope is negative: r is the magnitude, −slope.');
        else n.push(graph.fit ? `Your slope does not fit your own points (their best line has slope ${sf(graph.fit.slope, 3)} V A⁻¹); r = −slope.` : 'A slope needs your points first.');
        if (withinRel(E, truth.E, 0.02) && withinRel(r, truth.r, 0.12)) m++;
        else if (E !== null || r !== null) n.push(`Your E or r is off: the true values are E = ${truth.E.toFixed(2)} V and r = ${truth.r.toFixed(2)} Ω (E within 2 %, r within 12 %).`);
        auto.push(score(crit('calculations'), m, n));
        const un: string[] = [];
        let u = 1;
        if (E === null && r === null && slope === null) (u = 0), un.push('No answers to check the units of.');
        if (e0 !== null && unit('e0') !== 'V') (u = 0), un.push('The open-circuit p.d. is in volts (V).');
        if (E !== null && unit('emf') !== 'V') (u = 0), un.push('The e.m.f. is in volts (V).');
        if (slope !== null && unit('slope') !== 'ohm') (u = 0), un.push('The slope of V (volts) against I (amperes) is in V A⁻¹, i.e. ohms (Ω).');
        if (r !== null && unit('r') !== 'ohm') (u = 0), un.push('Internal resistance is in ohms (Ω).');
        auto.push(score(crit('units'), u, un));
      }
      solution.push(
        'Cell, key, ammeter and rheostat in series; voltmeter directly across the cell; + terminals towards the + of the cell.',
        `With the key open the voltmeter reads ${open.V.toFixed(2)} V — almost exactly the e.m.f., as hardly any current flows.`,
        'V = E − Ir: V against I is a straight line; the intercept on the V-axis is E and the slope is −r.',
        `True values here: E = ${truth.E.toFixed(3)} V, r = ${truth.r.toFixed(2)} Ω.`,
        graph.fit ? `From your own points the best line has intercept ${sf(graph.fit.intercept, 3)} V and slope ${sf(graph.fit.slope, 3)} V A⁻¹.` : 'Plot V against I from your table to find the intercept and slope.',
      );
      facts.push(`Task: e.m.f. and internal resistance; readings: ${rows.length}; overloads: ${state.overloads}.`, `True E ${truth.E.toFixed(3)} V, r ${truth.r.toFixed(2)} Ω; student's E ${ans.emf.value || '—'} ${ans.emf.unit}, r ${ans.r.value || '—'} ${ans.r.unit}.`);
      ai = [
        {
          criterionId: 'conclusion',
          question: 'What does your graph of V against I show?',
          answer: state.written.conclusion.trim(),
          guide: '1 mark: the terminal p.d. decreases linearly as the current increases (V = E − Ir), with E and r stated; half a mark for "V falls as I rises" only.',
          keywords: [['decrease', 'falls', 'drops', 'reduces', 'negative', 'straight line', 'linear'], ['e mf', 'emf', 'internal', 'e ir', 'lost volt', 'intercept']],
          need: 2,
        },
      ];
    } else {
      const rows = readings.map((r) => ({ r, row: state.series[r.i], arr: r.check.arrangement }));
      // ---- circuit (3)
      {
        const n: string[] = [];
        let m = 0;
        if (all('ammeterSeries')) m++;
        else n.push('Connect the ammeter in series with the resistor(s), so it carries the whole current.');
        if (all('voltmeterAcross')) m++;
        else n.push('Connect the voltmeter across the resistor arrangement only (not across the ammeter as well).');
        if (all('keySeries') && all('polarity')) m++;
        else n.push(!all('keySeries') ? 'Put the key in series so the circuit can be switched off between readings.' : 'Connect each meter’s + terminal towards the + of the cell.');
        auto.push(score(crit('circuit'), m, n));
      }
      const has = (a: SeriesArrangement) => rows.some((x) => x.arr === a);
      // ---- procedure (3)
      {
        const n: string[] = [];
        let m = 0;
        if (has('R1') && has('R2')) m++;
        else n.push('Measure each resistor on its own first (V and I for R₁, then for R₂).');
        if (has('S')) m++;
        else n.push('Connect R₁ and R₂ in series (end to end, one path) and measure V and I.');
        if (has('P')) m++;
        else n.push('Connect R₁ and R₂ in parallel (side by side, both ends joined) and measure V and I.');
        auto.push(score(crit('procedure'), m, n));
      }
      // ---- care (2)
      {
        const n: string[] = [];
        let m = careKey(n);
        if (state.overloads === 0 && rows.length) m++;
        else n.push('The ammeter was driven past its full scale: never connect it (or a wire) straight across the cell.');
        auto.push(score(crit('care'), m, n));
      }
      // ---- readings (4)
      {
        const n: string[] = [];
        let m = 0;
        if (rows.length) {
          if (rows.some((x) => !x.row?.arr || !x.row.I.trim() || !x.row.V.trim() || !x.row.R.trim())) n.push('Fill in the arrangement, V, I and R = V/I for every reading.');
          const tests = rows.flatMap(({ r, row }) => [withinAbs(parseNumber(row?.I), r.meters.I, I_TOL), withinAbs(parseNumber(row?.V), r.meters.V, V_TOL)]);
          const good = tests.filter(Boolean).length;
          if (good === tests.length) m += 2;
          else if (good >= tests.length / 2) {
            m += 1;
            n.push(`${tests.length - good} reading${tests.length - good === 1 ? '' : 's'} did not match the meters (read the pointer from directly in front, to half a division).`);
          } else n.push('Most readings did not match the meters: read the pointer against the scale from directly in front of it.');
          if (rows.every(({ row }) => row && decimalPlaces(row.I) === 2 && decimalPlaces(row.V) === 2)) m++;
          else n.push('Record I and V to 2 decimal places (e.g. 0.30 A, 1.50 V).');
          const labelled = rows.filter(({ row, arr }) => {
            const I = parseNumber(row?.I);
            const V = parseNumber(row?.V);
            return !!arr && row?.arr === arr && I !== null && V !== null && I > 0 && derivedOk(parseNumber(row?.R), V / I);
          }).length;
          if (labelled === rows.length) m++;
          else n.push(rows.some(({ row, arr }) => row?.arr && row.arr !== arr) ? 'A row is labelled with the wrong arrangement: check how the resistors were connected for that reading.' : 'Work out R = V ÷ I for every row.');
        } else n.push('There are no readings to mark.');
        auto.push(score(crit('readings'), m, n));
      }
      // The student's measured value for each arrangement: the mean V/I of their rows labelled with it.
      const fromRows = (a: SeriesArrangement) => {
        const xs = rows
          .filter((x) => x.row?.arr === a)
          .map(({ row }) => {
            const I = parseNumber(row?.I);
            const V = parseNumber(row?.V);
            return I && V !== null ? V / I : null;
          })
          .filter((x): x is number => x !== null);
        return xs.length ? mean(xs) : null;
      };
      const r1 = num('r1');
      const r2 = num('r2');
      const rs = num('rs');
      const rp = num('rp');
      const rsCalc = num('rsCalc');
      const rpCalc = num('rpCalc');
      // ---- comparison (2)
      {
        const n: string[] = [];
        let m = 0;
        const a = r1 ?? fromRows('R1');
        const b = r2 ?? fromRows('R2');
        if (a !== null && b !== null && withinRel(rsCalc, a + b, 0.015)) m++;
        else n.push(a !== null && b !== null ? `R₁ + R₂ from your values = ${sf(a + b, 3)} Ω.` : 'Work out R₁ + R₂ from your measured R₁ and R₂.');
        if (a !== null && b !== null && withinRel(rpCalc, (a * b) / (a + b), 0.015)) m++;
        else n.push(a !== null && b !== null ? `R₁R₂/(R₁ + R₂) from your values = ${sf((a * b) / (a + b), 3)} Ω (take the reciprocal at the end of 1/R = 1/R₁ + 1/R₂).` : 'Work out R₁R₂/(R₁ + R₂) from your measured R₁ and R₂.');
        auto.push(score(crit('analysis'), m, n));
      }
      // ---- results (3), units (1)
      {
        const n: string[] = [];
        let m = 0;
        const pairs: [number | null, SeriesArrangement][] = [
          [r1, 'R1'],
          [r2, 'R2'],
          [rs, 'S'],
          [rp, 'P'],
        ];
        const own = pairs.filter(([x, a]) => {
          const f = fromRows(a);
          return x !== null && f !== null && withinRel(x, f, 0.02);
        }).length;
        if (own === 4) m++;
        else n.push('Give R₁, R₂ and the series and parallel resistances, each = V ÷ I from your own readings for that arrangement.');
        if (rs !== null && rp !== null && rsCalc !== null && rpCalc !== null && withinRel(rs, rsCalc, 0.05) && withinRel(rp, rpCalc, 0.05)) m++;
        else if (rs !== null && rp !== null) n.push('Your measured and calculated values should agree within experimental error (about 5 %): check your readings and the formulas.');
        if (withinRel(r1, truth.r1, 0.04) && withinRel(r2, truth.r2, 0.04)) m++;
        else if (r1 !== null || r2 !== null) n.push(`Your R₁ or R₂ is more than 4 % from the true values (${truth.r1.toFixed(2)} Ω and ${truth.r2.toFixed(2)} Ω).`);
        auto.push(score(crit('calculations'), m, n));
        const un: string[] = [];
        let u = 1;
        const given = (['r1', 'r2', 'rs', 'rp', 'rsCalc', 'rpCalc'] as const).filter((id) => num(id) !== null);
        if (!given.length) (u = 0), un.push('No answers to check the units of.');
        if (given.some((id) => unit(id) !== 'ohm')) (u = 0), un.push('Every resistance is in ohms (Ω).');
        auto.push(score(crit('units'), u, un));
      }
      solution.push(
        'Cell, key, ammeter and the resistor arrangement in series; the voltmeter across the arrangement only.',
        `For each arrangement R = V ÷ I. True values here: R₁ = ${truth.r1.toFixed(2)} Ω, R₂ = ${truth.r2.toFixed(2)} Ω.`,
        `Series: R = R₁ + R₂ = ${truth.rs.toFixed(2)} Ω — larger than either.`,
        `Parallel: 1/R = 1/R₁ + 1/R₂, R = R₁R₂/(R₁ + R₂) = ${truth.rp.toFixed(2)} Ω — smaller than either.`,
      );
      facts.push(`Task: resistors in series and parallel; readings: ${rows.length} (${rows.map((x) => (x.arr ? SERIES_LABEL[x.arr] : 'unrecognised')).join(', ') || 'none'}).`, `True R₁ ${truth.r1.toFixed(2)} Ω, R₂ ${truth.r2.toFixed(2)} Ω; student's series ${ans.rs.value || '—'}, parallel ${ans.rp.value || '—'}.`);
      ai = [
        {
          criterionId: 'conclusion',
          question: 'Compare your measured series and parallel resistances with R₁ + R₂ and R₁R₂/(R₁ + R₂). What do you conclude?',
          answer: state.written.conclusion.trim(),
          guide: '1 mark: the series resistance is larger than either resistor and agrees with R₁ + R₂; the parallel resistance is smaller than either and agrees with 1/R = 1/R₁ + 1/R₂ (half a mark for one of the two).',
          keywords: [['series'], ['parallel'], ['larger', 'greater', 'bigger', 'more', 'smaller', 'less', 'agree', 'equal', 'same']],
          need: 3,
        },
      ];
    }

    ai.push({
      criterionId: 'precautions',
      question: `State two precautions taken to obtain accurate results in this ${task === 'BRIDGE' ? 'metre bridge' : task === 'EMF' ? 'e.m.f. and internal resistance' : 'series and parallel resistors'} experiment.`,
      answer: state.written.precautions.trim(),
      guide: `1 mark for two correct precautions (half a mark for one). ${crit('precautions').guide}`,
      keywords: [['key', 'switch', 'heating', 'heat', 'warm', 'polaris', 'run down'], ['tight', 'clean', 'firm', 'terminals', 'connections'], ['parallax', 'directly', 'eye level', 'perpendicular'], ['zero error', 'zero'], ['jockey', 'tap', 'slide', 'sliding', 'scrape'], ['middle', 'centre', 'center', 'interchang', 'end error'], ['across the cell', 'directly across', 'small current']],
      need: 2,
    });
    return { auto, ai, solution, facts };
  },
};
