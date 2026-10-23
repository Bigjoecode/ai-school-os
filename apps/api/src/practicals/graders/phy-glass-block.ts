import { GLASS_PIN_SPACING, PHY_GLASS_BLOCK, glassConstruction, glassOffEmergent, glassRay, phyGlassVariant, phySin, type CriterionScore, type PhyGlassState } from '@aischool/shared';
import { decimalPlaces, parseNumber, score, sf, sigFigs, withinAbs, withinRel } from './helpers';
import { gradeGraph, phyUnit, slopeAccepted, type XY } from './phy-common';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

/** P₃ and P₄ count as on the emergent ray within this (cm). */
const ALIGN_TOL = 0.15;
const R_TOL = 1;
const TRUE_R_TOL = 1.5;
const SIN_TOL = 0.005;

const crit = (id: string) => PHY_GLASS_BLOCK.rubric.find((c) => c.id === id)!;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Marks the glass-block lab: procedure (angles, pin spacing, normals), how well
 * P₃P₄ follow the true emergent ray, the table (r against the student's own
 * construction, sines, construction accuracy), the graph of sin i against
 * sin r, the slope and n (own data, then accuracy) and significant figures.
 * Precautions go to AI.
 */
export const phyGlassGrader: SimulatorGrader<'phy-glass-block'> = {
  id: 'phy-glass-block',
  grade(state: PhyGlassState, seed: number): GraderOutput {
    const v = phyGlassVariant(seed);
    const traces = state.traces
      .map((t, k) => ({ ...t, k, row: state.table[k], built: glassConstruction(v, t.p3, t.p4), truth: glassRay(v, t.i) }))
      .filter((t) => t.joined && t.p1 !== null && t.p2 !== null && t.p3 && t.p4);
    const auto: CriterionScore[] = [];

    // ---- procedure (4)
    {
      const n: string[] = [];
      let m = 0;
      if (!traces.length) n.push('No ray was traced through the block.');
      else {
        const angles = [...new Set(traces.map((t) => t.i))];
        const range = Math.max(...angles) - Math.min(...angles);
        if (angles.length >= 5 && range >= 30) m++;
        else n.push(angles.length < 5 ? `Trace rays for at least five angles of incidence (you used ${angles.length}).` : 'Spread your angles of incidence (e.g. 20° to 70°).');
        if (traces.every((t) => Math.abs(t.p1! - t.p2!) >= GLASS_PIN_SPACING - 0.05)) m++;
        else n.push(`Place P₁ and P₂ far apart (at least ${GLASS_PIN_SPACING} cm): the direction of the ray is then fixed more accurately.`);
        if (traces.every((t) => dist(t.p3!, t.p4!) >= GLASS_PIN_SPACING - 0.05)) m++;
        else n.push(`Place P₃ and P₄ far apart too (at least ${GLASS_PIN_SPACING} cm).`);
        if (traces.every((t) => t.normal)) m++;
        else n.push('Draw the normal at the point of incidence O before marking the angle of incidence.');
      }
      auto.push(score(crit('procedure'), m, n));
    }

    // ---- ray tracing (3)
    {
      const n: string[] = [];
      const aligned = traces.filter((t) => glassOffEmergent(v, t.i, t.p3!) <= ALIGN_TOL && glassOffEmergent(v, t.i, t.p4!) <= ALIGN_TOL);
      const m = traces.length ? (3 * aligned.length) / Math.max(5, traces.length) : 0;
      if (!traces.length) n.push('No ray was traced.');
      else if (aligned.length < traces.length) {
        const worst = traces.reduce((w, t) => Math.max(w, glassOffEmergent(v, t.i, t.p3!), glassOffEmergent(v, t.i, t.p4!)), 0);
        n.push(`${traces.length - aligned.length} trace${traces.length - aligned.length === 1 ? '' : 's'} had P₃/P₄ off the emergent ray (up to ${sf(worst, 2)} cm): move your eye until the images of P₁ and P₂ are exactly one behind the other, then cover them with P₃ and P₄.`);
      } else if (traces.length < 5) n.push('Trace at least five rays for full marks.');
      auto.push(score(crit('tracing'), m, n));
    }

    // ---- table of readings (4)
    {
      const n: string[] = [];
      let m = 0;
      if (traces.length) {
        const cells = traces.flatMap((t) => [t.row?.i ?? '', t.row?.r ?? '', t.row?.sini ?? '', t.row?.sinr ?? '']);
        if (cells.some((c) => !c.trim())) n.push('Fill in i, r, sin i and sin r for every trace.');
        const tests = traces.flatMap((t) => [withinAbs(parseNumber(t.row?.i), t.i, 0.01), !!t.built && withinAbs(parseNumber(t.row?.r), t.built.r, R_TOL)]);
        const good = tests.filter(Boolean).length;
        if (good === tests.length) m += 2;
        else if (good >= tests.length / 2) {
          m += 1;
          n.push(`${tests.length - good} angle${tests.length - good === 1 ? '' : 's'} did not match your own drawing (measure r between the refracted ray OE and the normal, to the nearest degree).`);
        } else n.push('Most angles did not match your drawing: measure r with the protractor centred on O, from the normal to the refracted ray OE.');
        const sines = traces.filter((t) => {
          const i = parseNumber(t.row?.i);
          const r = parseNumber(t.row?.r);
          const si = parseNumber(t.row?.sini);
          const sr = parseNumber(t.row?.sinr);
          return i !== null && r !== null && si !== null && sr !== null && withinAbs(si, phySin(i), SIN_TOL) && withinAbs(sr, phySin(r), SIN_TOL) && decimalPlaces(t.row!.sini) >= 2 && decimalPlaces(t.row!.sinr) >= 2;
        }).length;
        if (sines === traces.length) m++;
        else n.push('Work out sin i and sin r from your angles, to 3 decimal places.');
        const off = traces.filter((t) => !t.built || Math.abs(t.built.r - t.truth.r) > TRUE_R_TOL);
        if (!off.length) m++;
        else n.push(`${off.length} of your constructed angles of refraction were more than ${TRUE_R_TOL}° from the true value (e.g. i = ${off[0]!.i}°: true r = ${off[0]!.truth.r.toFixed(1)}°).`);
      } else n.push('There are no readings to mark.');
      auto.push(score(crit('readings'), m, n));
    }

    // ---- graph (2)
    const points: XY[] = traces.map((t) => ({ x: parseNumber(t.row?.sinr), y: parseNumber(t.row?.sini) })).filter((p): p is XY => p.x !== null && p.y !== null);
    const graph = gradeGraph(points, state.line, 'sin i against sin r');
    auto.push(score(crit('graph'), graph.marks, graph.notes));

    // ---- slope and n (4), figures (1)
    const slope = parseNumber(state.answers.slope.value);
    const nVal = parseNumber(state.answers.n.value);
    {
      const notes: string[] = [];
      let m = 0;
      if (slopeAccepted(slope, graph.fit?.slope ?? null, state.line, graph.lineOk)) m += 2;
      else if (slope === null) notes.push('Give the slope of your graph of sin i against sin r.');
      else notes.push(graph.fit ? `Your slope does not fit your own points (their best line has slope ${sf(graph.fit.slope, 3)}): Δ(sin i) ÷ Δ(sin r) from two points far apart on your line.` : 'A slope needs your points first.');
      const from = [slope, graph.fit?.slope ?? null].filter((x): x is number => x !== null);
      if (nVal !== null && from.some((s) => withinRel(nVal, s, 0.01))) m++;
      else if (nVal === null) notes.push('State the refractive index n.');
      else notes.push('n = sin i ÷ sin r, the slope of your graph.');
      if (withinRel(nVal, v.n, 0.03)) m++;
      else if (nVal !== null) notes.push(`Your n is more than 3 % from the true refractive index of this block (${v.n.toFixed(2)}).`);
      auto.push(score(crit('calculations'), m, notes));

      const fn: string[] = [];
      const raw = state.answers.n.value.trim();
      const figs = raw ? sigFigs(raw) : null;
      const unit = phyUnit(state.answers.n.unit);
      let f = 1;
      if (nVal === null) {
        f = 0;
        fn.push('No refractive index to check.');
      } else {
        if (figs === null || figs < 2 || figs > 4) {
          f = 0;
          fn.push('Give n to 2 or 3 significant figures (e.g. 1.52).');
        }
        if (unit && unit !== 'none') {
          f = 0;
          fn.push('Refractive index is a ratio of two sines: it has no unit.');
        }
      }
      auto.push(score(crit('figures'), f, fn));
    }

    // ---- precautions (AI)
    const ai: AiItem[] = [
      {
        criterionId: 'precautions',
        question: 'State two precautions taken to obtain accurate results in tracing rays through the glass block.',
        answer: state.written.precautions.trim(),
        guide: `2 marks: one for each of two correct precautions. ${crit('precautions').guide}`,
        keywords: [['upright', 'vertical', 'vertically', 'erect'], ['far apart', 'wide apart', 'apart', 'spaced'], ['base', 'bases', 'bottom', 'feet'], ['block not moved', 'not moved', 'not shifted', 'outline', 'trace the block'], ['sharp pencil', 'thin line', 'fine line'], ['parallax', 'eye level', 'protractor']],
        need: 2,
      },
    ];

    // ---- worked solution and facts
    const sample = [20, 30, 40, 50, 60, 70].map((i) => ({ i, r: glassRay(v, i).r }));
    const solution = [
      `This block: thickness ${v.thickness.toFixed(1)} cm, refractive index n = ${v.n.toFixed(3)}.`,
      `Snell's law: sin i ÷ sin r = n. True angles of refraction: ${sample.map((s) => `i = ${s.i}° → r = ${s.r.toFixed(1)}°`).join('; ')}.`,
      `For example i = 40°: sin i = ${phySin(40).toFixed(3)}, sin r = ${phySin(sample[2]!.r).toFixed(3)}, ratio ${(phySin(40) / phySin(sample[2]!.r)).toFixed(2)}.`,
      `The emergent ray is parallel to the incident ray, shifted sideways (lateral displacement d = t sin(i − r)/cos r, e.g. ${sf(glassRay(v, 40).lateral, 2)} cm at 40°).`,
      'A graph of sin i (vertical) against sin r (horizontal) is a straight line through the origin; its slope is n.',
      graph.fit ? `From your own points the best line has slope ${sf(graph.fit.slope, 3)}.` : 'Plot sin i against sin r from your table to find the slope.',
    ];
    const facts = [
      `Glass block: n = ${v.n.toFixed(3)}, thickness ${v.thickness.toFixed(1)} cm; traces completed ${traces.length} (angles ${traces.map((t) => t.i).join(', ') || '—'}°).`,
      `Student's slope ${state.answers.slope.value || '—'}; n ${state.answers.n.value || '—'} (true ${v.n.toFixed(2)}).`,
    ];
    return { auto, ai, solution, facts };
  },
};
