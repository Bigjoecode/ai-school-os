import {
  DISP_COLOUR_IDS,
  PHY_PINS,
  PINS_ALIGN_TOL,
  PINS_SPACING,
  depthNoParallaxH,
  depthStack,
  dispDmin,
  dispIMin,
  mirrorConstruction,
  phyPinsVariant,
  phyToRad,
  pinsDist,
  pinsOff,
  pinsPrism,
  prismConstruction,
  prismDmin,
  prismRay,
  pinsCurveMinimum,
  type CriterionScore,
  type PhyPinsState,
  type PhyPinsVariant,
  type PinsTrace,
} from '@aischool/shared';
import { decimalPlaces, parseNumber, score, sf, sigFigs, withinAbs, withinRel } from './helpers';
import { gradeGraph, phyUnit, slopeAccepted, type XY } from './phy-common';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

const A_TOL = 1;
const TRUE_TOL = 1.5;
const DEPTH_NP_TOL = 0.2;
const crit = (id: string) => PHY_PINS.rubric.find((c) => c.id === id)!;
const sinD = (deg: number) => Math.sin(phyToRad(deg));
/** n from minimum deviation for apex A. */
const nFromD = (A: number, D: number) => sinD((A + D) / 2) / sinD(A / 2);
const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`;

/** The vertex of the parabola through the lowest points (shared with the web lab). */
export const curveMinimum = pinsCurveMinimum;

/**
 * Marks the pin-method optics labs: the plane mirror (r against i, slope 1,
 * r = i), the prism (D against i, a smooth curve, Dₘ and n), real and apparent
 * depth (no parallax, real against apparent, n) and dispersion (the spectrum
 * produced properly, its order, the filter test, D at minimum deviation for red
 * and violet). Precautions (and, for dispersion, the explanation) go to AI.
 */
export const phyPinsGrader: SimulatorGrader<'phy-pins'> = {
  id: 'phy-pins',
  grade(state: PhyPinsState, seed: number): GraderOutput {
    const v = phyPinsVariant(seed);
    if (state.task === 'DEPTH') return gradeDepth(state, v);
    if (state.task === 'DISP') return gradeDisp(state, v);
    return gradeBoard(state, v, state.task === 'PRISM' ? 'PRISM' : 'MIRROR');
  },
};

// ------------------------------------------------------------------ mirror and prism

function gradeBoard(state: PhyPinsState, v: PhyPinsVariant, task: 'MIRROR' | 'PRISM'): GraderOutput {
  const sh = pinsPrism(v);
  const prism = task === 'PRISM';
  const traces = state.traces
    .map((t, k) => {
      const built = prism ? prismConstruction(sh, t) : mirrorConstruction(t);
      const value = built ? ('D' in built ? built.D : built.r) : null;
      const truth = prism ? prismRay(sh, v.n, t.i).D : t.i;
      return { ...t, k, row: state.table[k], value, truth };
    })
    .filter((t) => t.joined && t.p1 !== null && t.p2 !== null && t.p3 && t.p4);
  const auto: CriterionScore[] = [];
  const what = prism ? 'D' : 'r';
  const gap12 = (t: PinsTrace) => Math.abs(t.p1! - t.p2!);

  // ---- procedure (4)
  {
    const n: string[] = [];
    let m = 0;
    if (!traces.length) n.push('No ray was traced.');
    else {
      const angles = [...new Set(traces.map((t) => t.i))];
      if (prism) {
        if (angles.length >= 6 && Math.min(...angles) <= 40 && Math.max(...angles) >= 60) m++;
        else n.push(angles.length < 6 ? `Trace rays for at least six angles of incidence, 35° to 65° (you used ${angles.length}).` : 'Spread the angles from 35° (or 40°) to 65°, so the minimum of the curve lies between them.');
      } else if (angles.length >= 5 && Math.max(...angles) - Math.min(...angles) >= 30) m++;
      else n.push(angles.length < 5 ? `Trace rays for at least five angles of incidence (you used ${angles.length}).` : 'Spread your angles of incidence (20° to 60°).');
      if (traces.every((t) => gap12(t) >= PINS_SPACING - 0.05)) m++;
      else n.push(`P₁ and P₂ were too close together on ${plural(traces.filter((t) => gap12(t) < PINS_SPACING - 0.05).length, 'trace')}: place them at least ${PINS_SPACING} cm apart so the direction of the ray is fixed accurately.`);
      if (traces.every((t) => pinsDist(t.p3!, t.p4!) >= PINS_SPACING - 0.05)) m++;
      else n.push(`P₃ and P₄ were too close together: at least ${PINS_SPACING} cm apart.`);
      if (traces.every((t) => t.normal)) m++;
      else n.push(`Draw the normal at the point of incidence before marking the angle of incidence${prism ? ' (on the first face)' : ''}.`);
    }
    auto.push(score(crit('procedure'), m, n));
  }

  // ---- tracing (3)
  {
    const n: string[] = [];
    const offs = traces.map((t) => pinsOff(v, task, t) ?? 99);
    const good = offs.filter((o) => o <= PINS_ALIGN_TOL).length;
    const need = prism ? 6 : 5;
    const m = traces.length ? (3 * good) / Math.max(need, traces.length) : 0;
    if (!traces.length) n.push('No ray was traced.');
    else if (good < traces.length)
      n.push(`${plural(traces.length - good, 'trace')} had P₃/P₄ not in line with the images of P₁ and P₂ (up to ${sf(Math.max(...offs), 2)} cm off the true ray): move your eye until the image of P₂ exactly hides the image of P₁ — look at the bases — then push P₃ and P₄ in so that they hide both.`);
    else if (traces.length < need) n.push(`Trace at least ${need} rays for full marks.`);
    auto.push(score(crit('tracing'), m, n));
  }

  // ---- readings (4)
  {
    const n: string[] = [];
    let m = 0;
    if (traces.length) {
      if (traces.some((t) => !t.row?.i.trim() || !t.row?.a.trim())) n.push(`Fill in i and ${what} for every trace.`);
      const aOk = traces.filter((t) => t.value !== null && withinAbs(parseNumber(t.row?.a), t.value, A_TOL)).length;
      if (aOk === traces.length) m += 2;
      else {
        if (aOk >= traces.length / 2) m += 1;
        const surface = traces.filter((t) => t.value !== null && withinAbs(parseNumber(t.row?.a), 90 - t.value, 1.5)).length;
        if (!prism && surface) n.push(`${plural(surface, 'angle')} of reflection were measured from the mirror line, not from the normal: r is the angle between the reflected ray and the NORMAL (90° minus what you wrote).`);
        else n.push(prism ? `${plural(traces.length - aOk, 'deviation')} did not match your own drawing: produce the incident ray forward and the emergent ray backward until they meet, and measure the angle between them.` : `${plural(traces.length - aOk, 'angle')} did not match your drawing: centre the protractor where P₄P₃ meets MM', 0° on the normal.`);
      }
      const iOk = traces.filter((t) => withinAbs(parseNumber(t.row?.i), t.i, 0.01)).length;
      if (iOk === traces.length) m++;
      else {
        const surf = traces.filter((t) => withinAbs(parseNumber(t.row?.i), 90 - t.i, 0.01)).length;
        n.push(surf ? 'Some angles of incidence were written as measured from the surface: i is measured from the normal.' : 'Write each angle of incidence as you drew it.');
      }
      const off = traces.filter((t) => t.value === null || t.truth === null || Math.abs(t.value - t.truth) > TRUE_TOL);
      if (!off.length) m++;
      else n.push(`${plural(off.length, 'constructed angle')} were more than ${TRUE_TOL}° from the true value (e.g. i = ${off[0]!.i}°: true ${what} = ${off[0]!.truth?.toFixed(1) ?? '—'}°).`);
    } else n.push('There are no readings to mark.');
    auto.push(score(crit('readings'), m, n));
  }

  const points: XY[] = traces.map((t) => ({ x: parseNumber(t.row?.i), y: parseNumber(t.row?.a) })).filter((p): p is XY => p.x !== null && p.y !== null);
  const solution: string[] = [];
  const facts: string[] = [];
  let ai: AiItem[];

  if (!prism) {
    // ---- graph (2)
    const graph = gradeGraph(points, state.line, 'r against i');
    auto.push(score(crit('graph'), graph.marks, graph.notes));
    // ---- calculations (4)
    const slope = parseNumber(state.answers.slope.value);
    {
      const notes: string[] = [];
      let m = 0;
      if (slopeAccepted(slope, graph.fit?.slope ?? null, state.line, graph.lineOk)) m += 2;
      else notes.push(slope === null ? 'Give the slope of your graph of r against i.' : 'Your slope does not fit your own points: Δr ÷ Δi from two points far apart on your line.');
      if (withinRel(slope, 1, 0.04)) m++;
      else if (slope !== null) notes.push('The slope should be very close to 1 (r = i).');
      const c = state.written.conclusion.toLowerCase();
      if (/\br\s*=\s*i\b|\bi\s*=\s*r\b|equal|same as/.test(c)) m++;
      else notes.push('State the conclusion: the angle of reflection equals the angle of incidence (r = i), and both rays and the normal lie in one plane.');
      auto.push(score(crit('calculations'), m, notes));
    }
    auto.push(figuresFor(state.answers.slope, 'slope'));
    ai = [
      {
        criterionId: 'precautions',
        question: 'State two precautions taken to obtain accurate results when tracing rays with a plane mirror.',
        answer: state.written.precautions.trim(),
        guide: `2 marks: one for each of two correct precautions. ${crit('precautions').guide}`,
        keywords: [['upright', 'vertical', 'vertically', 'erect'], ['far apart', 'wide apart', 'apart', 'spaced'], ['base', 'bases', 'bottom', 'feet'], ['silvered', 'reflecting surface', 'back of the mirror'], ['sharp pencil', 'thin line', 'fine line'], ['parallax', 'eye level'], ['not moved', 'not shifted', 'fixed']],
        need: 2,
      },
    ];
    solution.push('For every angle the reflected ray leaves at r = i (laws of reflection): the images of P₁, P₂ lie as far behind the mirror as the pins are in front.', `A graph of r against i is a straight line through the origin with slope 1.${graph.fit ? ` From your points: slope ${sf(graph.fit.slope, 3)}.` : ''}`, 'Source of error: the mirror glass has thickness — reflection takes place at the silvered back, so the line MM’ is drawn along that surface.');
    facts.push(`Plane mirror: traces ${traces.length} (angles ${traces.map((t) => t.i).join(', ') || '—'}°); slope ${state.answers.slope.value || '—'}.`);
  } else {
    // ---- graph (2)
    const gn: string[] = [];
    let gm = 0;
    const low = curveMinimum(points);
    const line = state.line;
    const level = !!line && Math.abs(line.y1 - line.y2) <= 0.3;
    if (points.length >= 5 && state.curve) gm++;
    else gn.push(points.length < 5 ? 'Plot at least five points of D against i.' : 'Draw a smooth curve through the points: D against i is U-shaped, not a straight line.');
    if (low && line && level && Math.abs((line.y1 + line.y2) / 2 - low.y) <= 0.6) gm++;
    else if (line && !level) gn.push('Your line is not horizontal: D against i is a curve — mark the minimum with a short horizontal line touching its lowest point.');
    else gn.push('Mark the lowest point of the curve with a horizontal line and read Dₘ there.');
    auto.push(score(crit('graph'), gm, gn));
    // ---- calculations (4)
    const dmin = parseNumber(state.answers.dmin.value);
    const nVal = parseNumber(state.answers.n.value);
    const trueDmin = prismDmin(v.n, v.A);
    {
      const notes: string[] = [];
      let m = 0;
      if (low && withinAbs(dmin, low.y, 0.6)) m++;
      else notes.push(dmin === null ? 'Read the minimum deviation Dₘ from your curve.' : low ? `Your Dₘ does not match the lowest point of your own curve (about ${low.y.toFixed(1)}°).` : 'Plot your points first.');
      if (withinAbs(dmin, trueDmin, 1)) m++;
      else if (dmin !== null) notes.push(`Dₘ is more than 1° from the true minimum deviation of this prism (${trueDmin.toFixed(1)}°).`);
      const fromD = dmin !== null && [60, v.A].some((A) => withinAbs(nVal, nFromD(A, dmin), 0.006));
      if (fromD) m++;
      else if (nVal === null) notes.push('Work out n = sin((A + Dₘ)/2) ÷ sin(A/2) with A = 60°.');
      else if (dmin !== null && withinAbs(nVal, sinD((60 + dmin) / 2) / sinD(60), 0.006)) notes.push('You divided by sin A: the formula has sin(A/2) = sin 30° = 0.5 underneath.');
      else notes.push('n = sin((A + Dₘ)/2) ÷ sin(A/2), from your own Dₘ.');
      if (withinRel(nVal, v.n, 0.02)) m++;
      else if (nVal !== null) notes.push(`Your n is more than 2 % from the true refractive index (${v.n.toFixed(3)}).`);
      auto.push(score(crit('calculations'), m, notes));
    }
    auto.push(figuresFor(state.answers.n, 'n'));
    ai = [
      {
        criterionId: 'precautions',
        question: 'State two precautions taken to obtain accurate results when tracing rays through the triangular prism.',
        answer: state.written.precautions.trim(),
        guide: `2 marks: one for each of two correct precautions. ${crit('precautions').guide}`,
        keywords: [['upright', 'vertical', 'vertically', 'erect'], ['far apart', 'wide apart', 'apart', 'spaced', 'well spaced'], ['base', 'bases', 'bottom', 'feet'], ['outline', 'not moved', 'not shifted'], ['smooth curve'], ['sharp pencil', 'thin line'], ['parallax', 'eye level', 'protractor']],
        need: 2,
      },
    ];
    const iMin = (Math.asin(v.n * sinD(v.A / 2)) * 180) / Math.PI;
    solution.push(
      `This prism: A = ${v.A.toFixed(1)}°, n = ${v.n.toFixed(3)}.`,
      `True deviations: ${[35, 40, 45, 50, 55, 60, 65].map((i) => `i = ${i}° → D = ${prismRay(sh, v.n, i).D?.toFixed(1) ?? '—'}°`).join('; ')}.`,
      `Minimum deviation Dₘ = ${trueDmin.toFixed(1)}° at i ≈ ${iMin.toFixed(1)}° (the ray passes symmetrically, r₁ = r₂ = A/2, i = e).`,
      `n = sin((A + Dₘ)/2) ÷ sin(A/2) = sin(${((v.A + trueDmin) / 2).toFixed(2)}°) ÷ sin(${(v.A / 2).toFixed(2)}°) = ${v.n.toFixed(3)}.`,
      low ? `From your own points the curve's lowest point is about D = ${low.y.toFixed(1)}° at i = ${low.x.toFixed(0)}°.` : 'Plot D against i to find the minimum.',
    );
    facts.push(`Prism: A ${v.A.toFixed(1)}°, n ${v.n.toFixed(3)}, Dₘ ${trueDmin.toFixed(1)}°; traces ${traces.length}; student Dₘ ${state.answers.dmin.value || '—'}, n ${state.answers.n.value || '—'}.`);
  }
  return { auto, ai, solution, facts };
}

function figuresFor(ans: { value: string; unit: string }, name: string): CriterionScore {
  const fn: string[] = [];
  const raw = ans.value.trim();
  const unit = phyUnit(ans.unit);
  let f = 1;
  if (parseNumber(raw) === null) {
    f = 0;
    fn.push(`No ${name} to check.`);
  } else {
    const figs = sigFigs(raw);
    if (figs === null || figs < 2 || figs > 4) {
      f = 0;
      fn.push(`Give the ${name} to 2 or 3 significant figures.`);
    }
    if (unit && unit !== 'none') {
      f = 0;
      fn.push(`The ${name} is a ratio: it has no unit.`);
    }
  }
  return score(crit('figures'), f, fn);
}

// ------------------------------------------------------------------ real and apparent depth

function gradeDepth(state: PhyPinsState, v: PhyPinsVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const reads = state.depth.readings.map((r, k) => ({ ...r, k, row: state.depth.rows[k], T: depthStack(v, r.blocks), np: depthNoParallaxH(v, r.blocks) })).filter((r) => r.blocks > 0);

  // ---- procedure (4)
  {
    const n: string[] = [];
    let m = 0;
    const depths = [...new Set(reads.map((r) => r.blocks))];
    if (depths.length >= 4) m++;
    else n.push(`Take readings for at least four different depths (you used ${depths.length}).`);
    if (depths.length && Math.min(...depths) === 1 && Math.max(...depths) === 4) m++;
    else n.push('Use from one block up to all four, so the depths spread out.');
    if (reads.length && reads.every((r) => r.checked)) m++;
    else n.push(reads.length ? `${plural(reads.filter((r) => !r.checked).length, 'reading')} were taken without checking for parallax: move your eye from side to side — the pin and the image must move together.` : 'No readings were taken.');
    if (reads.length && reads.every((r) => withinAbs(parseNumber(r.row?.real), r.T, 0.1))) m++;
    else n.push('Measure the real depth (the height of the top face above the cross) on the rule for every reading.');
    auto.push(score(crit('procedure'), m, n));
  }

  // ---- no parallax (3)
  {
    const n: string[] = [];
    const good = reads.filter((r) => Math.abs(r.h - r.np) <= DEPTH_NP_TOL).length;
    const m = reads.length ? (3 * good) / Math.max(4, reads.length) : 0;
    if (!reads.length) n.push('No readings were taken.');
    else if (good < reads.length) {
      const worst = reads.reduce((w, r) => (Math.abs(r.h - r.np) > Math.abs(w.h - w.np) ? r : w));
      n.push(`${plural(reads.length - good, 'search-pin position')} showed parallax (e.g. ${worst.blocks} block${worst.blocks === 1 ? '' : 's'}: ${sf(Math.abs(worst.h - worst.np), 2)} cm ${worst.h > worst.np ? 'too high' : 'too low'}): if the pin moves the same way as your eye it is nearer you than the image — lower it; if it moves the opposite way, raise it.`);
    } else if (reads.length < 4) n.push('Take at least four readings for full marks.');
    auto.push(score(crit('tracing'), m, n));
  }

  // ---- readings (4)
  {
    const n: string[] = [];
    let m = 0;
    if (reads.length) {
      if (reads.some((r) => !r.row?.real.trim() || !r.row?.app.trim())) n.push('Fill in the real and apparent depth for every reading.');
      if (reads.every((r) => withinAbs(parseNumber(r.row?.real), r.T, 0.1))) m++;
      else n.push('Some real depths do not match the rule: read the height of the top face of the stack.');
      const appOk = reads.filter((r) => withinAbs(parseNumber(r.row?.app), r.T - r.h, 0.15)).length;
      if (appOk === reads.length) m += 2;
      else {
        if (appOk >= reads.length / 2) m++;
        const fromBottom = reads.filter((r) => withinAbs(parseNumber(r.row?.app), r.h, 0.15)).length;
        n.push(fromBottom ? 'The apparent depth was measured from the bottom: it is measured from the TOP face down to the search pin (top-face reading minus pin reading).' : `${plural(reads.length - appOk, 'apparent depth')} did not match your pin: apparent depth = top-face reading − pin reading.`);
      }
      if (reads.every((r) => decimalPlaces(r.row?.real ?? '') >= 1 && decimalPlaces(r.row?.app ?? '') >= 1)) m++;
      else n.push('Record depths to 0.1 cm (the rule reads to 1 mm).');
    } else n.push('There are no readings to mark.');
    auto.push(score(crit('readings'), m, n));
  }

  // ---- graph (2) and calculations (4)
  const points: XY[] = reads.map((r) => ({ x: parseNumber(r.row?.app), y: parseNumber(r.row?.real) })).filter((p): p is XY => p.x !== null && p.y !== null);
  const graph = gradeGraph(points, state.line, 'real depth against apparent depth');
  auto.push(score(crit('graph'), graph.marks, graph.notes));
  const slope = parseNumber(state.answers.slope.value);
  const nVal = parseNumber(state.answers.n.value);
  {
    const notes: string[] = [];
    let m = 0;
    if (slopeAccepted(slope, graph.fit?.slope ?? null, state.line, graph.lineOk)) m += 2;
    else if (slope !== null && graph.fit && withinRel(slope, 1 / graph.fit.slope, 0.05)) notes.push('You divided apparent by real depth: n = real ÷ apparent, the slope of REAL (vertical) against APPARENT (horizontal).');
    else notes.push(slope === null ? 'Give the slope of your graph of real against apparent depth.' : 'Your slope does not fit your own points.');
    const from = [slope, graph.fit?.slope ?? null].filter((x): x is number => x !== null);
    if (nVal !== null && from.some((s) => withinRel(nVal, s, 0.01))) m++;
    else notes.push(nVal === null ? 'State the refractive index n.' : 'n = real ÷ apparent depth = the slope.');
    if (withinRel(nVal, v.n, 0.03)) m++;
    else if (nVal !== null) notes.push(`Your n is more than 3 % from the true refractive index (${v.n.toFixed(3)}).`);
    auto.push(score(crit('calculations'), m, notes));
  }
  auto.push(figuresFor(state.answers.n, 'n'));
  const ai: AiItem[] = [
    {
      criterionId: 'precautions',
      question: 'State two precautions taken to obtain accurate results in the real and apparent depth experiment.',
      answer: state.written.precautions.trim(),
      guide: `2 marks: one for each of two correct precautions. ${crit('precautions').guide}`,
      keywords: [['vertically', 'vertical', 'directly above', 'from above'], ['parallax', 'no parallax', 'side to side'], ['repeated', 'average', 'averaged', 'mean'], ['eye level', 'rule'], ['upright', 'steady', 'not moved', 'clamped']],
      need: 2,
    },
  ];
  const solution = [
    `This glass: n = ${v.n.toFixed(3)}; block thicknesses ${v.blocks.map((b) => b.toFixed(2)).join(', ')} cm.`,
    ...[1, 2, 3, 4].map((b) => `${b} block${b === 1 ? '' : 's'}: real depth ${depthStack(v, b).toFixed(2)} cm, apparent depth ${(depthStack(v, b) - depthNoParallaxH(v, b)).toFixed(2)} cm (no-parallax pin at ${depthNoParallaxH(v, b).toFixed(2)} cm on the rule).`),
    'n = real ÷ apparent depth: the slope of real (vertical) against apparent (horizontal) depth. The image is raised by t(1 − 1/n).',
    graph.fit ? `From your own points the best line has slope ${sf(graph.fit.slope, 3)}.` : 'Plot real against apparent depth to find the slope.',
  ];
  const facts = [`Real and apparent depth: n ${v.n.toFixed(3)}; readings ${reads.length}; student slope ${state.answers.slope.value || '—'}, n ${state.answers.n.value || '—'}.`];
  return { auto, ai, solution, facts };
}

// ------------------------------------------------------------------ dispersion

const DEG_UNITS = /^(°|deg|degs|degree|degrees|o)$/i;
function gradeDisp(state: PhyPinsState, v: PhyPinsVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const d = state.disp;
  const looks = d.looks;
  const iGreen = dispIMin(v, 'green');
  const clear = looks.filter((l) => l.dark && l.slit === 'narrow' && l.filter === 'none');

  // ---- procedure (4)
  {
    const n: string[] = [];
    let m = 0;
    if (looks.some((l) => l.dark)) m++;
    else n.push('Darken the room (close the curtains, lights off) before you look: stray light washes the spectrum out.');
    if (looks.some((l) => l.slit === 'narrow')) m++;
    else n.push('Use a narrow slit: with a wide beam the colours overlap and the spectrum is impure.');
    if (looks.some((l) => l.filter === 'none' && Math.abs(l.i - iGreen) <= 8)) m++;
    else n.push(`Rotate the prism until the spectrum is clearest and stops moving — near minimum deviation (i about ${Math.round(iGreen)}°) — and catch it on the screen.`);
    if (looks.some((l) => l.filter !== 'none')) m++;
    else n.push('Put a coloured filter (e.g. red) in the beam and look again.');
    auto.push(score(crit('procedure'), m, n));
  }

  // ---- a pure spectrum (3)
  {
    const n: string[] = [];
    let m = 0;
    if (clear.length) m++;
    else n.push('Look at the spectrum with the room dark, a narrow slit and no filter.');
    if (clear.some((l) => l.dist >= 40)) m++;
    else n.push('Move the screen further away (at least 40 cm) so that the colours spread out.');
    const firstLook = state.log.findIndex((e) => e.a.startsWith('look'));
    const lastOrder = state.log.map((e) => e.a).lastIndexOf('order');
    if (d.order.length === 7 && firstLook >= 0 && lastOrder > firstLook) m++;
    else n.push('Record the order of the colours after you have looked at the screen.');
    auto.push(score(crit('tracing'), m, n));
  }

  // ---- observations (4)
  {
    const n: string[] = [];
    let m = 0;
    const right = DISP_COLOUR_IDS;
    const same = d.order.length === 7 && d.order.every((c, k) => c === right[k]);
    const reversed = d.order.length === 7 && d.order.every((c, k) => c === right[6 - k]);
    if (same || reversed) m += 2;
    else if (d.order.filter((c, k) => c === right[k]).length >= 5) {
      m += 1;
      n.push('The order is nearly right: red, orange, yellow, green, blue, indigo, violet.');
    } else n.push('The colours are in the order red, orange, yellow, green, blue, indigo, violet (ROYGBIV).');
    if (reversed) n.push('(You listed them from violet; that order is accepted.)');
    if (d.most === 'violet') m++;
    else n.push(d.most === 'red' ? 'You reversed it: violet is deviated MOST (it has the highest refractive index), red least.' : 'Violet is deviated most.');
    if (d.least === 'red') m++;
    else n.push('Red is deviated least.');
    auto.push(score(crit('readings'), m, n));
  }

  // ---- diagram and filter (2)
  {
    const n: string[] = [];
    let m = 0;
    if (d.ray === 'violet-more') m++;
    else n.push('In the ray diagram the violet ray is bent further towards the base of the prism than the red.');
    if (d.filterObs === 'one-colour' && looks.some((l) => l.filter !== 'none')) m++;
    else n.push('With a filter only that colour reaches the screen, and it is not split any further: the prism does not add colours to light.');
    auto.push(score(crit('graph'), m, n));
  }

  // ---- calculations (4)
  const dr = parseNumber(state.answers.dred.value);
  const dv = parseNumber(state.answers.dviol.value);
  const disp = parseNumber(state.answers.disp.value);
  const nVal = parseNumber(state.answers.n.value);
  const trueR = dispDmin(v, 'red');
  const trueV = dispDmin(v, 'violet');
  {
    const n: string[] = [];
    let m = 0;
    if (withinAbs(dr, trueR, 0.4)) m++;
    else n.push(dr === null ? 'Read the deviation of the red light on the screen scale at minimum deviation.' : `Your D for red is not its minimum deviation (rotate the prism until the red band stops and turns back: about ${trueR.toFixed(1)}°).`);
    if (withinAbs(dv, trueV, 0.4)) m++;
    else n.push(dv === null ? 'Read the deviation of the violet light at minimum deviation.' : `Your D for violet is not its minimum deviation (about ${trueV.toFixed(1)}°).`);
    if (dr !== null && dv !== null && withinAbs(disp, dv - dr, 0.15)) m++;
    else n.push('Angular dispersion = D(violet) − D(red), from your own readings.');
    if (dr !== null && [60, v.dispA].some((A) => withinAbs(nVal, nFromD(A, dr), 0.006))) m++;
    else n.push('n for red = sin((A + D_red)/2) ÷ sin(A/2), with A = 60°.');
    auto.push(score(crit('calculations'), m, n));
  }
  {
    const fn: string[] = [];
    let f = 1;
    if (disp === null || nVal === null) {
      f = 0;
      fn.push('Give the angular dispersion and n.');
    } else {
      const u = state.answers.disp.unit.trim();
      if (u && !DEG_UNITS.test(u)) {
        f = 0;
        fn.push('Angular dispersion is an angle: in degrees.');
      }
      const nu = phyUnit(state.answers.n.unit);
      if (nu && nu !== 'none') {
        f = 0;
        fn.push('n is a ratio: it has no unit.');
      }
    }
    auto.push(score(crit('figures'), f, fn));
  }
  const ai: AiItem[] = [
    {
      criterionId: 'precautions',
      question: 'Explain why white light is dispersed by a glass prism, and state one precaution taken to obtain a clear spectrum.',
      answer: [state.written.conclusion.trim(), state.written.precautions.trim()].filter(Boolean).join(' '),
      guide: `2 marks: 1 for the explanation, 1 for a precaution. ${crit('precautions').guide}`,
      keywords: [['refractive index', 'speed', 'speeds', 'wavelength', 'refracted by different', 'different amounts'], ['dark', 'darkened', 'narrow slit', 'narrow beam', 'distance', 'sun']],
      need: 2,
    },
  ];
  const solution = [
    `This prism: A = ${v.dispA.toFixed(1)}°, n(red) = ${(nFromD(v.dispA, trueR)).toFixed(4)}, n(violet) = ${(nFromD(v.dispA, trueV)).toFixed(4)}.`,
    'White light is a mixture of colours. Each colour travels at a different speed in glass (a different refractive index), so each is refracted by a different amount: violet most, red least. The spectrum reads red, orange, yellow, green, blue, indigo, violet.',
    `At minimum deviation: D(red) = ${trueR.toFixed(1)}°, D(violet) = ${trueV.toFixed(1)}°, angular dispersion ${(trueV - trueR).toFixed(1)}°.`,
    'A filter passes one colour; the prism deviates it but does not split it further — the prism separates colours already in white light, it does not add them.',
  ];
  const facts = [`Dispersion: looks ${looks.length} (${clear.length} dark + narrow); order ${d.order.join(' ') || '—'}; D red ${state.answers.dred.value || '—'}, violet ${state.answers.dviol.value || '—'}.`];
  return { auto, ai, solution, facts };
}

