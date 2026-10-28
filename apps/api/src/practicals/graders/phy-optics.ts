import {
  OPTICS_U_SPREAD,
  PHY_OPTICS,
  opticsF,
  opticsFocusTol,
  opticsImage,
  opticsRoughTol,
  opticsV,
  opticsWindowImage,
  phyFit,
  phyLineSlope,
  phyOpticsVariant,
  type CriterionScore,
  type OpticsTask,
  type PhyGraphLine,
  type PhyOpticsState,
} from '@aischool/shared';
import { decimalPlaces, parseNumber, score, sf, withinAbs, withinRel } from './helpers';
import { gradeGraph, phyUnit, type XY } from './phy-common';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

const POS_TOL = 0.2;
const crit = (id: string) => PHY_OPTICS.rubric.find((c) => c.id === id)!;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
};

/** Where a straight line meets the axes: x-intercept (y = 0) and y-intercept (x = 0); null when it never does. */
export function lineIntercepts(line: PhyGraphLine | null): { x: number; y: number } | null {
  const m = phyLineSlope(line);
  if (!line || m === null || Math.abs(m) < 1e-12) return null;
  const y = line.y1 - m * line.x1;
  return { x: -y / m, y };
}

/**
 * Marks the optical bench (converging lens or concave mirror): the procedure
 * (rough focal length first, enough well-spread values of u, centres lined up),
 * how well each image was focused (against the true best focus for that u),
 * the table against the bench, the graph of 1/v against 1/u, the two
 * intercepts read from the student's own line or points, f = 1/intercept with
 * a separate accuracy mark, and units. The precautions go to AI.
 */
export const phyOpticsGrader: SimulatorGrader<'phy-optics'> = {
  id: 'phy-optics',
  grade(state: PhyOpticsState, seed: number): GraderOutput {
    const v = phyOpticsVariant(seed);
    const task: OpticsTask = state.task ?? 'LENS';
    const mirror = task === 'MIRROR';
    const f = opticsF(v, task);
    const what = mirror ? 'mirror' : 'lens';
    const readings = state.readings.map((r, i) => {
      const img = opticsImage(v, task, r.u);
      const at = opticsV(task, r.u, r.screen);
      return { ...r, i, row: state.table[i], img, at, focused: img !== null && Math.abs(at - img) <= opticsFocusTol(img) };
    });
    const auto: CriterionScore[] = [];

    // ---- procedure (4)
    {
      const n: string[] = [];
      let m = 0;
      const roughAt = state.log.findIndex((e) => e.a.startsWith('rough:'));
      const firstReading = state.log.findIndex((e) => e.a.startsWith('reading:'));
      const roughOk = state.rough !== null && Math.abs(state.rough - opticsWindowImage(v, task)) <= opticsRoughTol(v, task);
      const written = parseNumber(state.answers.rough.value);
      const writtenCm = written === null ? null : phyUnit(state.answers.rough.unit) === 'm' ? written * 100 : written;
      const first = roughAt >= 0 && (firstReading < 0 || roughAt < firstReading);
      if (roughOk && first && state.rough !== null && withinAbs(writtenCm, state.rough, 0.5)) m++;
      else if (state.rough === null) n.push(`Find a rough focal length first: focus a distant window on the screen with the ${what} and measure the distance.`);
      else if (!roughOk) n.push(`Your rough focus was not sharp: the window’s image is sharp about ${opticsWindowImage(v, task).toFixed(1)} cm from the ${what} here.`);
      else if (!first) n.push('Find the rough focal length before you take your readings: it tells you which values of u give a real image.');
      else n.push('Write down your rough focal length (the distance at which the window was sharp).');
      const real = readings.filter((r) => r.img !== null);
      const distinct: number[] = [];
      for (const r of real) if (!distinct.some((x) => Math.abs(x - r.u) < 2)) distinct.push(r.u);
      if (!readings.length) n.push('No readings were taken.');
      else {
        if (distinct.length >= 5 && real.length === readings.length) m++;
        else if (real.length < readings.length) n.push(`Some readings used u ≤ f: then the ${what} gives no real image to catch on the screen. Use u well beyond your rough focal length.`);
        else n.push(`Take readings for at least five different values of u (you used ${distinct.length}).`);
        const us = readings.map((r) => r.u);
        if (Math.max(...us) - Math.min(...us) >= OPTICS_U_SPREAD[task] - 0.05) m++;
        else n.push(`Spread the values of u out (at least ${OPTICS_U_SPREAD[task]} cm between the smallest and the largest), so the graph’s points are well spaced.`);
        if (readings.every((r) => r.aligned)) m++;
        else n.push(`Line up the centres of the object, the ${what} and the screen on the same axis before you take readings.`);
      }
      auto.push(score(crit('procedure'), m, n));
    }

    // ---- locating the image (3)
    {
      const n: string[] = [];
      const good = readings.filter((r) => r.focused).length;
      const m = readings.length ? (3 * good) / readings.length : 0;
      if (!readings.length) n.push('No images were located.');
      else if (good < readings.length) {
        const worst = readings.filter((r) => !r.focused && r.img !== null).sort((a, b) => Math.abs(b.at - b.img!) - Math.abs(a.at - a.img!))[0];
        n.push(`${readings.length - good} of your ${readings.length} images were not at the sharpest focus${worst ? ` (at u = ${worst.u.toFixed(1)} cm the image is sharpest at v ≈ ${worst.img!.toFixed(1)} cm; your screen was at ${worst.at.toFixed(1)} cm)` : ''}. Move the screen to and fro and stop where the cross-wire is sharpest.`);
      }
      auto.push(score(crit('focusing'), Math.floor(m * 2) / 2, n));
    }

    // ---- table of readings (4)
    {
      const n: string[] = [];
      let m = 0;
      if (readings.length) {
        if (readings.some((r) => !r.row || !r.row.u.trim() || !r.row.v.trim() || !r.row.iu.trim() || !r.row.iv.trim())) n.push('Fill in u, v, 1/u and 1/v for every reading.');
        const tests = readings.flatMap((r) => [withinAbs(parseNumber(r.row?.u), r.u, POS_TOL), withinAbs(parseNumber(r.row?.v), r.at, POS_TOL)]);
        const good = tests.filter(Boolean).length;
        if (good === tests.length) m += 2;
        else if (good >= tests.length / 2) {
          m += 1;
          n.push(`${tests.length - good} of your u and v values did not match the bench: read each holder’s mark on the metre rule from directly in front of it (v ${mirror ? 'is the screen’s reading' : '= screen reading − lens reading'}).`);
        } else n.push(`Most of your u and v values did not match the bench: read the marks on the metre rule at eye level${mirror ? '' : ', and v = screen reading − lens reading'}.`);
        if (readings.every((r) => r.row?.u.trim() && r.row.v.trim() && decimalPlaces(r.row.u) === 1 && decimalPlaces(r.row.v) === 1)) m++;
        else n.push('Record u and v in cm to 1 decimal place (e.g. 25.0 cm, 37.6 cm).');
        const recip = (raw: string | undefined, of: string | undefined) => {
          const y = parseNumber(raw);
          const x = parseNumber(of);
          return y !== null && x !== null && x > 0 && (withinRel(y, 1 / x, 0.012) || withinAbs(y, 1 / x, 0.0002) || withinRel(y, 100 / x, 0.012));
        };
        if (readings.every((r) => recip(r.row?.iu, r.row?.u) && recip(r.row?.iv, r.row?.v))) m++;
        else n.push('Work out 1/u and 1/v for every row, to 3 significant figures (e.g. 1/25.0 = 0.0400 cm⁻¹).');
      } else n.push('There are no readings to mark.');
      auto.push(score(crit('readings'), m, n));
    }

    // ---- graph (2)
    const points: XY[] = readings
      .map((r) => {
        const u = parseNumber(r.row?.u);
        const vv = parseNumber(r.row?.v);
        const x = parseNumber(r.row?.iu) ?? (u ? 1 / u : null);
        const y = parseNumber(r.row?.iv) ?? (vv ? 1 / vv : null);
        return { x, y };
      })
      .filter((p): p is XY => p.x !== null && p.y !== null);
    const graph = gradeGraph(points, state.line, '1/v against 1/u');
    auto.push(score(crit('graph'), graph.marks, graph.notes));

    // ---- intercepts and f (4), units (1)
    const perM = points.length > 0 && median(points.map((p) => p.x)) > 0.5;
    const toPoints = (raw: string, unit: string) => {
      const x = parseNumber(raw);
      if (x === null) return null;
      const u = phyUnit(unit);
      if (u === 'cm-1' && perM) return x * 100;
      if (u === 'm-1' && !perM) return x / 100;
      return x;
    };
    const toCmInv = (x: number | null) => (x === null ? null : perM ? x / 100 : x);
    const fitInt = graph.fit && Math.abs(graph.fit.slope) > 1e-9 ? { x: -graph.fit.intercept / graph.fit.slope, y: graph.fit.intercept } : null;
    const own = graph.lineOk ? lineIntercepts(state.line) : null;
    const xint = toPoints(state.answers.xint.value, state.answers.xint.unit);
    const yint = toPoints(state.answers.yint.value, state.answers.yint.unit);
    const fRaw = parseNumber(state.answers.f.value);
    const fUnit = phyUnit(state.answers.f.unit);
    const fCm = fRaw === null ? null : fUnit === 'm' ? fRaw * 100 : fRaw;
    const accepted = (val: number | null, axis: 'x' | 'y') => val !== null && [fitInt?.[axis], own?.[axis]].some((t) => t !== undefined && t !== null && t > 0 && withinRel(val, t, 0.03));
    {
      const n: string[] = [];
      let m = 0;
      if (accepted(xint, 'x')) m++;
      else if (xint === null) n.push('Give the intercept of your line on the 1/u axis (extend the line to meet it).');
      else n.push(fitInt ? `Your intercept on the 1/u axis does not fit your own points (their best line meets it at ${sf(fitInt.x, 3)}).` : 'An intercept needs your points first.');
      if (accepted(yint, 'y')) m++;
      else if (yint === null) n.push('Give the intercept of your line on the 1/v axis.');
      else n.push(fitInt ? `Your intercept on the 1/v axis does not fit your own points (their best line meets it at ${sf(fitInt.y, 3)}).` : 'An intercept needs your points first.');
      const ints = [toCmInv(xint), toCmInv(yint)].filter((x): x is number => x !== null && x > 0);
      const fromInts = [...ints.map((x) => 1 / x), ...(ints.length === 2 ? [2 / (ints[0]! + ints[1]!), (1 / ints[0]! + 1 / ints[1]!) / 2] : [])];
      if (fCm !== null && fromInts.some((c) => withinRel(fCm, c, 0.02))) m++;
      else if (fCm === null) n.push('Work out the focal length f = 1 ÷ intercept.');
      else n.push(ints.length ? `f = 1 ÷ intercept: from your intercepts f ≈ ${sf(fromInts.at(-1) ?? fromInts[0]!, 3)} cm.` : 'Work out f from your intercepts (f = 1 ÷ intercept).');
      if (withinRel(fCm, f, 0.04)) m++;
      else if (fCm !== null) n.push(`Your f is more than 4 % from the true focal length of this ${what} (${f.toFixed(1)} cm).`);
      auto.push(score(crit('calculations'), m, n));
    }
    {
      const un: string[] = [];
      let u = 1;
      const given = [state.answers.xint, state.answers.yint, state.answers.f].filter((a) => a.value.trim());
      if (!given.length) {
        u = 0;
        un.push('No answers to check the units of.');
      }
      for (const [a, label] of [
        [state.answers.xint, 'the intercept on the 1/u axis'],
        [state.answers.yint, 'the intercept on the 1/v axis'],
      ] as const) {
        if (a.value.trim() && !['cm-1', 'm-1'].includes(phyUnit(a.unit))) {
          u = 0;
          un.push(`Give ${label} its unit (cm⁻¹).`);
        }
      }
      if (state.answers.f.value.trim() && fUnit !== 'cm' && fUnit !== 'm') {
        u = 0;
        un.push('Give the focal length its unit (cm).');
      }
      auto.push(score(crit('units'), u, [...new Set(un)]));
    }

    // ---- written answers (AI)
    const ai: AiItem[] = [
      {
        criterionId: 'precautions',
        question: `State two precautions taken to obtain accurate results when finding the focal length of a ${mirror ? 'concave mirror' : 'converging lens'}.`,
        answer: state.written.precautions.trim(),
        guide: `2 marks: one for each of two correct precautions. ${crit('precautions').guide}`,
        keywords: [
          ['axis', 'same height', 'centres', 'centre', 'aligned', 'line'],
          ['sharp', 'sharpest', 'focus', 'to and fro'],
          ['rough', 'distant'],
          ['optical centre', 'pole', 'from the centre'],
          ['clean', 'dust'],
          ['parallax', 'eye level', 'directly'],
          ['dark', 'stray', 'shield'],
          ['repeat', 'repeated', 'average'],
        ],
        need: 2,
      },
    ];

    // ---- worked solution and facts
    const lo = (task === 'LENS' ? [20, 30, 40, 50] : [15, 20, 25, 30]).map((u) => {
      const img = opticsImage(v, task, u)!;
      return `u = ${u.toFixed(1)} cm → v ≈ ${img.toFixed(1)} cm`;
    });
    const solution = [
      `Rough focal length: the window (about ${(v.window / 100).toFixed(1)} m away) is focused about ${opticsWindowImage(v, task).toFixed(1)} cm from the ${what}.`,
      mirror ? 'The mirror stands at the 0 cm mark: the object’s reading is u and the screen’s reading is v (object and screen side by side, slightly off the axis).' : 'The object stands at the 0 cm mark: the lens’s reading is u, and v = screen reading − lens reading.',
      `True focal length here: f = ${f.toFixed(1)} cm. For example ${lo.join('; ')}.`,
      '1/u + 1/v = 1/f, so the graph of 1/v against 1/u is a straight line of slope −1 meeting each axis at 1/f.',
      `Each intercept = 1/f = ${(1 / f).toFixed(4)} cm⁻¹, so f = 1 ÷ intercept = ${f.toFixed(1)} cm.`,
      fitInt ? `From your own points the best line meets the axes at ${sf(fitInt.x, 3)} and ${sf(fitInt.y, 3)}${perM ? ' m⁻¹' : ' cm⁻¹'}.` : 'Plot 1/v against 1/u from your table to find the intercepts.',
    ];
    const facts = [
      `Task: focal length of a ${mirror ? 'concave mirror' : 'converging lens'} (true f ${f.toFixed(1)} cm); readings ${readings.length}, ${readings.filter((r) => r.focused).length} sharply focused; rough focus ${state.rough === null ? 'not done' : `${state.rough.toFixed(1)} cm`}.`,
      `Student's intercepts ${state.answers.xint.value || '—'} ${state.answers.xint.unit} and ${state.answers.yint.value || '—'} ${state.answers.yint.unit}; f ${state.answers.f.value || '—'} ${state.answers.f.unit}.`,
    ];
    return { auto, ai, solution, facts };
  },
};
