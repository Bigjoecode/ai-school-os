import { PHY_OHMS_LAW, ohmsCheck, ohmsMeters, ohmsReadingSettings, phyOhmsVariant, type CriterionScore, type OhmsSettings, type OhmsTask, type PhyOhmsState } from '@aischool/shared';
import { decimalPlaces, parseNumber, score, sf, withinAbs, withinRel } from './helpers';
import { gradeGraph, phyUnit, slopeAccepted, type XY } from './phy-common';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

const I_TOL = 0.01;
const V_TOL = 0.05;
const L_TOL = 0.2;

const crit = (id: string) => PHY_OHMS_LAW.rubric.find((c) => c.id === id)!;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
};

/**
 * Marks the Ohm's law / resistivity lab: the circuit (solved from the
 * student's own wiring at every reading), procedure, the table against the
 * meters, the graph, the slope and R (or A, slope and ρ) from the student's own
 * data with a separate accuracy mark, and units. The conclusion and the
 * precautions go to AI.
 */
export const phyOhmsGrader: SimulatorGrader<'phy-ohms-law'> = {
  id: 'phy-ohms-law',
  grade(state: PhyOhmsState, seed: number): GraderOutput {
    const v = phyOhmsVariant(seed);
    const task: OhmsTask = state.task ?? 'OHM';
    const wire = task === 'WIRE';
    const readings = state.readings.map((r, i) => {
      const settings = ohmsReadingSettings(task, r);
      return { ...r, i, row: state.table[i], settings, meters: ohmsMeters(v, settings, i), check: ohmsCheck(v, settings) };
    });
    const current: OhmsSettings = { task, wires: state.wires, key: true, rheostat: state.rheostat, jockey: state.jockey, heat: 0 };
    const checks = readings.length ? readings.map((r) => r.check) : [ohmsCheck(v, current)];
    const all = (k: keyof (typeof checks)[number]) => checks.every((c) => c[k]);
    const test = wire ? 'the length of wire' : 'the resistor';
    const auto: CriterionScore[] = [];

    // ---- circuit (4)
    {
      const n: string[] = [];
      let m = 0;
      if (!state.task) n.push('Choose the experiment and wire the circuit.');
      if (all('ammeterSeries')) m++;
      else n.push(`Connect the ammeter in series with ${test}, so the same current flows through both.`);
      if (all('voltmeterAcross')) m++;
      else n.push(`Connect the voltmeter in parallel, across ${test} only.`);
      if (all('polarity')) m++;
      else n.push('Connect each meter’s + terminal towards the + of the battery (a meter wired the wrong way round reads backwards).');
      if (all('rheostatSeries') && all('keySeries')) m++;
      else n.push(!all('rheostatSeries') ? 'Put the rheostat in series in the circuit so it controls the current.' : 'Put the key in series so the circuit can be switched off between readings.');
      auto.push(score(crit('circuit'), m, n));
    }

    // ---- procedure (3)
    {
      const n: string[] = [];
      let m = 0;
      if (!readings.length) n.push('No readings were taken.');
      else {
        const distinct: number[] = [];
        const key = (r: (typeof readings)[number]) => (wire ? r.jockey : r.rheostat * 100);
        for (const r of readings) if (!distinct.some((x) => Math.abs(x - key(r)) < 2)) distinct.push(key(r));
        if (distinct.length >= 5) m++;
        else n.push(wire ? `Take readings for at least five different lengths of wire (you used ${distinct.length}).` : `Take readings at least five different rheostat settings (you used ${distinct.length}).`);
        if (wire) {
          const range = Math.max(...readings.map((r) => r.jockey)) - Math.min(...readings.map((r) => r.jockey));
          if (range >= 50) m++;
          else n.push('Spread the lengths over most of the wire (at least 50 cm between the shortest and the longest).');
        } else {
          const Is = readings.map((r) => r.meters.I);
          if (Math.max(...Is) - Math.min(...Is) >= 0.15) m++;
          else n.push('Use the rheostat over its range so the currents are well spread (at least 0.15 A apart).');
        }
        const cool = readings.filter((r) => r.heat === 0).length;
        if (cool >= Math.ceil(readings.length * 0.8)) m++;
        else n.push('Open the key between readings: a steady current warms the conductor and its resistance rises.');
      }
      auto.push(score(crit('procedure'), m, n));
    }

    // ---- table of readings (4)
    const Ls = readings.map((r) => parseNumber(r.row?.L)).filter((x): x is number => x !== null);
    const inMetres = wire && Ls.length > 0 && median(Ls) < 2;
    const lCm = (raw: string | undefined) => {
      const x = parseNumber(raw);
      return x === null ? null : inMetres ? x * 100 : x;
    };
    {
      const n: string[] = [];
      let m = 0;
      if (readings.length) {
        const cells = readings.flatMap((r) => [...(wire ? [r.row?.L ?? ''] : []), r.row?.I ?? '', r.row?.V ?? '', r.row?.R ?? '']);
        if (cells.some((c) => !c.trim())) n.push(`Fill in ${wire ? 'L, ' : ''}I, V and V/I for every reading.`);
        const tests = readings.flatMap((r) => [withinAbs(parseNumber(r.row?.I), r.meters.I, I_TOL), withinAbs(parseNumber(r.row?.V), r.meters.V, V_TOL), ...(wire ? [withinAbs(lCm(r.row?.L), r.jockey, L_TOL)] : [])]);
        const good = tests.filter(Boolean).length;
        if (good === tests.length) m += 2;
        else if (good >= tests.length / 2) {
          m += 1;
          n.push(`${tests.length - good} reading${tests.length - good === 1 ? '' : 's'} did not match the meters${wire ? ' or the jockey' : ''} (read the needle from directly in front, to half a division).`);
        } else n.push('Most readings did not match the meters: read the pointer against the scale from directly in front of it.');
        if (readings.every((r) => r.row?.I.trim() && r.row.V.trim() && decimalPlaces(r.row.I) === 2 && decimalPlaces(r.row.V) === 2)) m++;
        else n.push('Record I and V to 2 decimal places (e.g. 0.36 A, 1.25 V).');
        const derived = readings.filter((r) => {
          const I = parseNumber(r.row?.I);
          const V = parseNumber(r.row?.V);
          const R = parseNumber(r.row?.R);
          return I !== null && V !== null && R !== null && I > 0 && (withinRel(R, V / I, 0.015) || withinAbs(R, V / I, 0.01));
        }).length;
        if (derived === readings.length) m++;
        else n.push('Work out V ÷ I for every row.');
      } else n.push('There are no readings to mark.');
      auto.push(score(crit('readings'), m, n));
    }

    // ---- graph (2)
    const rowR = (r: (typeof readings)[number]) => {
      const R = parseNumber(r.row?.R);
      if (R !== null) return R;
      const I = parseNumber(r.row?.I);
      const V = parseNumber(r.row?.V);
      return I && V !== null ? V / I : null;
    };
    const points: XY[] = readings.map((r) => (wire ? { x: parseNumber(r.row?.L), y: rowR(r) } : { x: parseNumber(r.row?.I), y: parseNumber(r.row?.V) })).filter((p): p is XY => p.x !== null && p.y !== null);
    const graph = gradeGraph(points, state.line, wire ? 'R against L' : 'V against I');
    auto.push(score(crit('graph'), graph.marks, graph.notes));

    // ---- calculations (4), units (1)
    const ans = state.answers;
    const slope = parseNumber(ans.slope.value);
    const slopeU = phyUnit(ans.slope.unit);
    const result = parseNumber(ans.result.value);
    const resultU = phyUnit(ans.result.unit);
    const area = parseNumber(ans.area.value);
    const areaU = phyUnit(ans.area.unit);
    const n: string[] = [];
    let m = 0;
    const un: string[] = [];
    let u = 1;
    if (!wire) {
      const okSlope = slopeAccepted(slope, graph.fit?.slope ?? null, state.line, graph.lineOk);
      if (okSlope) m += 2;
      else if (slope === null) n.push('Give the slope of your graph of V against I.');
      else n.push(graph.fit ? `Your slope does not fit your own points (their best line has slope ${sf(graph.fit.slope, 3)} Ω): slope = ΔV ÷ ΔI from two points far apart on your line.` : 'A slope needs your points first.');
      const fromSlope = [slope, ...(graph.fit ? [graph.fit.slope] : [])].filter((x): x is number => x !== null);
      if (result !== null && fromSlope.some((s) => withinRel(result, s, 0.01))) m++;
      else if (result === null) n.push('State the resistance R of the resistor.');
      else n.push('R is the slope of the graph of V against I.');
      if (withinRel(result, v.resistor, 0.04)) m++;
      else if (result !== null) n.push(`Your R is more than 4 % from the true resistance (${v.resistor.toFixed(2)} Ω).`);
      if (slope === null && result === null) {
        u = 0;
        un.push('No answers to check the units of.');
      }
      if (slope !== null && slopeU !== 'ohm') {
        u = 0;
        un.push(slopeU ? 'The slope of V (volts) against I (amperes) is in ohms (Ω).' : 'Give the slope its unit (Ω).');
      }
      if (result !== null && resultU !== 'ohm') {
        u = 0;
        un.push(resultU ? 'Resistance is measured in ohms (Ω).' : 'Give R its unit (Ω).');
      }
    } else {
      const xUnit = inMetres ? 'm' : 'cm';
      // A in m².
      const areaM2 = area === null ? null : areaU === 'mm2' ? area / 1e6 : areaU === 'cm2' ? area / 1e4 : area;
      if (withinRel(areaM2, v.wire.area, 0.015)) m++;
      else if (area === null) n.push('Work out the cross-sectional area A = πd²/4 in m².');
      else n.push(`A = πd²/4 = 3.142 × (${(v.wire.diameterMm / 1000).toExponential(2)} m)² ÷ 4 = ${v.wire.area.toExponential(3)} m² (convert mm to m first).`);
      // The slope, per x-unit as the student plotted it, converted from what they wrote.
      const perX: number[] = [];
      if (slope !== null && slope > 0) {
        const asPerM = slopeU === 'ohm/m' ? [slope] : slopeU === 'ohm/cm' ? [slope * 100] : [slope, slope * 100];
        for (const s of asPerM) perX.push(xUnit === 'm' ? s : s / 100);
      }
      const okX = perX.find((s) => slopeAccepted(s, graph.fit?.slope ?? null, state.line, graph.lineOk));
      if (okX !== undefined) m++;
      else if (slope === null) n.push('Give the slope of your graph of R against L.');
      else n.push(graph.fit ? `Your slope does not fit your own points (their best line has slope ${sf(graph.fit.slope, 3)} Ω ${xUnit}⁻¹).` : 'A slope needs your points first.');
      const slopePerM = okX !== undefined ? (xUnit === 'm' ? okX : okX * 100) : perX.length ? (xUnit === 'm' ? perX[0]! : perX[0]! * 100) : null;
      const areas = [v.wire.area, ...(areaM2 && areaM2 > 0 ? [areaM2] : [])];
      if (slopePerM !== null && result !== null && areas.some((a) => withinRel(result, slopePerM * a, 0.02))) m++;
      else if (result === null) n.push('Work out ρ = slope × A.');
      else n.push(slopePerM ? `ρ = slope (Ω m⁻¹) × A (m²) = ${sf(slopePerM, 3)} × ${(areaM2 ?? v.wire.area).toExponential(3)} = ${sf(slopePerM * (areaM2 ?? v.wire.area), 3)} Ω m.` : 'ρ = slope × A, with the slope in Ω m⁻¹ and A in m².');
      if (withinRel(result, v.wire.rho, 0.05)) m++;
      else if (result !== null) n.push(`Your ρ is more than 5 % from the true resistivity of ${v.wire.material} here (${v.wire.rho.toExponential(2)} Ω m).`);
      if (area === null && slope === null && result === null) {
        u = 0;
        un.push('No answers to check the units of.');
      }
      if (area !== null && areaU !== 'm2') {
        u = 0;
        un.push(areaU ? 'Give A in m².' : 'Give A its unit (m²).');
      }
      if (slope !== null && slopeU !== 'ohm/m' && slopeU !== 'ohm/cm') {
        u = 0;
        un.push(slopeU ? 'The slope of R against L is in Ω m⁻¹ (or Ω cm⁻¹).' : 'Give the slope its unit (Ω m⁻¹).');
      }
      if (result !== null && resultU !== 'ohm.m') {
        u = 0;
        un.push(resultU ? 'Resistivity is in ohm metres (Ω m).' : 'Give ρ its unit (Ω m).');
      }
    }
    auto.push(score(crit('calculations'), m, n));
    auto.push(score(crit('units'), u, un));

    // ---- written answers (AI)
    const ai: AiItem[] = [
      {
        criterionId: 'conclusion',
        question: wire ? 'What do you conclude from your graph of R against L?' : 'What do you conclude from your graph of V against I?',
        answer: state.written.conclusion.trim(),
        guide: wire ? '1 mark: the resistance R is directly proportional to the length L (straight line through the origin); half a mark for "R increases with L" only.' : '1 mark: V is directly proportional to I (a straight line through the origin), so the resistor obeys Ohm’s law (at constant temperature); half a mark for "V increases with I" only.',
        keywords: wire ? [['proportional', 'directly', 'straight line', 'linear'], ['length', 'longer'], ['resistance']] : [['proportional', 'directly', 'straight line', 'linear'], ['ohm', 'current', 'voltage', 'p d', 'potential']],
        need: wire ? 3 : 2,
      },
      {
        criterionId: 'precautions',
        question: `State two precautions taken to obtain accurate results in this ${wire ? 'resistivity' : "Ohm's law"} experiment.`,
        answer: state.written.precautions.trim(),
        guide: `1 mark for two correct precautions (half a mark for one). ${crit('precautions').guide}`,
        keywords: [['key', 'switch', 'heating', 'heat', 'warm'], ['tight', 'clean', 'firm', 'terminals', 'connections'], ['parallax', 'directly', 'eye level', 'perpendicular'], ['zero error', 'zero'], ['series', 'parallel', 'polarity', 'positive'], ['diameter', 'micrometer', 'several points'], ['jockey', 'slide', 'sliding', 'scrape']],
        need: 2,
      },
    ];

    // ---- worked solution and facts
    const solution = wire
      ? [
          `Wire: ${v.wire.material}, diameter d = ${v.wire.diameterMm.toFixed(2)} mm = ${(v.wire.diameterMm / 1000).toExponential(2)} m.`,
          `A = πd²/4 = ${v.wire.area.toExponential(3)} m².`,
          `For each length, R = V ÷ I. R = ρL/A, so R against L is a straight line through the origin with slope ρ/A.`,
          `True resistance per length here: ${sf(v.wire.perMetre, 3)} Ω m⁻¹ (${sf(v.wire.perMetre / 100, 3)} Ω cm⁻¹).`,
          `ρ = slope × A = ${sf(v.wire.perMetre, 3)} × ${v.wire.area.toExponential(3)} = ${v.wire.rho.toExponential(2)} Ω m.`,
          graph.fit ? `From your own points the best line has slope ${sf(graph.fit.slope, 3)} Ω ${inMetres ? 'm' : 'cm'}⁻¹.` : 'Plot R against L from your table to find the slope.',
        ]
      : [
          'Circuit: battery, key, rheostat, ammeter and resistor in series; voltmeter in parallel across the resistor; + terminals towards the + of the battery.',
          'Vary the rheostat for at least five currents, opening the key between readings.',
          'V = IR, so V against I is a straight line through the origin with slope R.',
          `True resistance here: ${v.resistor.toFixed(2)} Ω (the meters read within about 1 % of the true values).`,
          graph.fit ? `From your own points the best line has slope ${sf(graph.fit.slope, 3)} Ω.` : 'Plot V against I from your table to find the slope.',
        ];
    const facts = [
      `Task: ${wire ? `resistivity of ${v.wire.material} (d = ${v.wire.diameterMm.toFixed(2)} mm)` : "Ohm's law"}; readings taken: ${readings.length}; circuit ${checks.every((c) => c.polarity && c.rheostatSeries && c.keySeries) ? 'correct' : 'with faults'}.`,
      wire
        ? `True ρ ${v.wire.rho.toExponential(2)} Ω m; student's A ${ans.area.value || '—'} ${ans.area.unit}, slope ${ans.slope.value || '—'} ${ans.slope.unit}, ρ ${ans.result.value || '—'} ${ans.result.unit}.`
        : `True R ${v.resistor.toFixed(2)} Ω; student's slope ${ans.slope.value || '—'} ${ans.slope.unit}, R ${ans.result.value || '—'} ${ans.result.unit}.`,
    ];
    return { auto, ai, solution, facts };
  },
};
