import {
  FORCES_CARD_G,
  PHY_MECHANICS,
  VISC_OIL_BALL,
  VISC_RHO_GLY,
  VISC_RHO_STEEL,
  VISC_SPACING,
  VISC_TOP_OK,
  forceConstruction,
  forceEquilibrium,
  forceLine,
  forceNewton,
  frictionPull,
  frictionTilt,
  frictionWeight,
  inclineAccel,
  inclineReadings,
  phyLineSlope,
  phyMechanicsVariant,
  sbShows,
  viscEtaFromSlope,
  viscIdealSlope,
  viscReadings,
  type CriterionScore,
  type MechRow,
  type MechTask,
  type PhyAnswer,
  type PhyMechanicsState,
  type PhyMechanicsVariant,
} from '@aischool/shared';
import { decimalPlaces, parseNumber, score, sf, withinAbs, withinRel } from './helpers';
import { gradeGraph, phyUnit, slopeAccepted, type XY } from './phy-common';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

const crit = (id: string) => PHY_MECHANICS.rubric.find((c) => c.id === id)!;
const num = (raw: string | undefined) => parseNumber(raw);
const filled = (raw: string | undefined) => !!raw && raw.trim().length > 0;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const avg = (xs: number[]) => xs.reduce((t, x) => t + x, 0) / (xs.length || 1);
const DEG = Math.PI / 180;

/** This lab's units (viscosity, its slope, the scale), then the physics table. */
export function mechUnit(raw: string | null | undefined): string {
  const s = (raw ?? '')
    .replace(/[²]/g, '2')
    .replace(/[⁻−–—]/g, '-')
    .replace(/[¹]/g, '1')
    .toLowerCase()
    .replace(/\^/g, '')
    .replace(/newtons?/g, 'n')
    .replace(/pascals?/g, 'pa')
    .replace(/seconds?/g, 's')
    .replace(/[\s·.*×]/g, '')
    .replace(/[()]/g, '');
  const table: [RegExp, string][] = [
    [/^(pas|pa-s|nsm-2|ns\/m2|nm-2s|kgm-1s-1|kg\/ms|kg\/m\/s|kg\/sm|kgs-1m-1)$/, 'Pa.s'],
    [/^(cms-1mm-2|cm\/s\/mm2|cms-1\/mm2|cm\/smm2|cm\/mm2s|cmmm-2s-1)$/, 'cm/s/mm2'],
    [/^(m-1s-1|s-1m-1|\/ms|1\/ms|\/sm|ms-1m-2|m\/s\/m2)$/, '/m/s'],
    [/^(n\/cm|ncm-1|npercm)$/, 'N/cm'],
    [/^(cm\/n|cmn-1|cmpern)$/, 'cm/N'],
    [/^(°|deg|degrees?|o)$/, 'deg'],
  ];
  for (const [re, u] of table) if (re.test(s)) return u;
  return phyUnit(raw);
}
const noUnit = (a: PhyAnswer) => ['', 'none'].includes(mechUnit(a.unit));

/** Cells of a row as numbers. */
const rc = (row: MechRow | undefined, id: string) => num(row?.c[id]);
/** Match each written value to a distinct instrument value within tol (greedy, closest first). */
function matchAll(written: (number | null)[], truth: number[], tol: number): boolean[] {
  const used = new Set<number>();
  return written.map((w) => {
    if (w === null) return false;
    let best = -1;
    for (let k = 0; k < truth.length; k++) if (!used.has(k) && Math.abs(truth[k]! - w) <= tol + 1e-9 && (best < 0 || Math.abs(truth[k]! - w) < Math.abs(truth[best]! - w))) best = k;
    if (best < 0) return false;
    used.add(best);
    return true;
  });
}
/** Three marks in proportion to the tests passed (all: 3, two thirds: 2, half: 1). */
const prop3 = (good: number, all: number) => (all === 0 ? 0 : good === all ? 3 : good >= (2 * all) / 3 ? 2 : good >= all / 2 ? 1 : 0);
/** The best line through the origin of the points (slope), or null. */
const originSlope = (pts: XY[]) => (pts.length ? pts.reduce((t, p) => t + p.x * p.y, 0) / Math.max(1e-12, pts.reduce((t, p) => t + p.x * p.x, 0)) : null);

type Part = { auto: CriterionScore[]; ai: AiItem[]; solution: string[]; facts: string[] };

// ================================================================== FRICTION

function gradeFriction(s: PhyMechanicsState, v: PhyMechanicsVariant): Part {
  const auto: CriterionScore[] = [];
  const pulls = s.pulls.map((p, k) => ({ ...p, k, ...frictionPull(v, k, p) }));
  const tilts = s.tilts.map((t, k) => ({ ...t, k, angle: frictionTilt(v, k, t) }));
  const rows = s.rows;
  const firstPull = s.log.findIndex((e) => e.a.startsWith('pull:'));
  const loads = [...new Set(pulls.map((p) => p.load))];

  // ---- care (2)
  {
    const n: string[] = [];
    let k = 0;
    const zeroAt = s.log.findIndex((e) => e.a === 'zero');
    const wipeAt = s.log.findIndex((e) => e.a === 'wipe');
    const weighed0 = s.weighs.length > 0 && s.weighs.every((w) => w.zeroed);
    if (pulls.length && pulls.every((p) => p.zeroed && p.wiped) && (s.weighs.length === 0 || weighed0) && zeroAt >= 0 && wipeAt >= 0 && (firstPull < 0 || (zeroAt < firstPull && wipeAt < firstPull))) k++;
    else if (!pulls.length) n.push('No pulls were made.');
    else {
      if (pulls.some((p) => !p.zeroed) || !weighed0) n.push(`Check the spring balance’s zero before you use it: this one read ${v.sbZero > 0 ? '+' : ''}${v.sbZero.toFixed(2)} N with nothing on it, and every reading carried that error.`);
      if (pulls.some((p) => !p.wiped)) n.push('Wipe the plank clean and dry before you start: the chalk dust on it lowered the friction and made it vary.');
    }
    if (pulls.length && pulls.every((p) => !p.jerk) && tilts.every((t) => !t.fast)) k++;
    else if (pulls.length) {
      if (pulls.some((p) => p.jerk)) n.push('Increase the pull slowly and steadily: a jerk carries the pointer past the limiting friction, so the reading is too high.');
      if (tilts.some((t) => t.fast)) n.push('Raise the plank slowly: raised quickly, it goes past the angle of slipping before the block starts to move.');
    }
    auto.push(score(crit('care'), k, n));
  }

  // ---- procedure (4)
  {
    const n: string[] = [];
    let k = 0;
    const rowLoads = rows.map((r) => r.key);
    if (rowLoads.length && rowLoads.every((L) => s.weighs.some((w) => w.load === L))) k++;
    else n.push('Weigh the block with its load on the spring balance for every row: that weight is the normal reaction R on a level plank.');
    if (loads.length >= 4) k++;
    else n.push(`Pull with at least four different loads on the block (you used ${loads.length}).`);
    if (loads.length && loads.every((L) => pulls.filter((p) => p.load === L).length >= 2)) k++;
    else n.push('Pull at least twice for each load and average the two readings.');
    if (tilts.length >= 2) k++;
    else n.push('Find the angle at which the block just slips at least twice (raise the plank slowly each time).');
    auto.push(score(crit('procedure'), k, n));
  }

  // ---- readings (5)
  const pts: XY[] = [];
  {
    const n: string[] = [];
    let k = 0;
    let good = 0;
    let all = 0;
    let slidingSeen = false;
    for (const row of rows) {
      const L = row.key;
      const lp = pulls.filter((p) => p.load === L);
      const weighed = s.weighs.filter((w) => w.load === L).map((w) => sbShows(v, frictionWeight(v, L), w.zeroed));
      const R = rc(row, 'R');
      all++;
      if (R !== null && (weighed.some((x) => Math.abs(x - R) <= 0.1 + 1e-9) || Math.abs(R - frictionWeight(v, L)) <= 0.1)) good++;
      const fs = [rc(row, 'F1'), rc(row, 'F2')].filter((x, i) => x !== null || i < lp.length);
      const m = matchAll(fs, lp.map((p) => p.limit), 0.1);
      all += fs.length;
      good += m.filter(Boolean).length;
      if (fs.some((f, i) => !m[i] && f !== null && lp.some((p) => Math.abs(p.sliding - f) <= 0.1))) slidingSeen = true;
    }
    const ths = ['th1', 'th2', 'th3'].map((id) => num(s.cells[id])).filter((x, i) => x !== null || i < tilts.length);
    const mt = matchAll(ths, tilts.map((t) => t.angle), 1.0);
    all += ths.length;
    good += mt.filter(Boolean).length;
    k += prop3(good, all);
    if (!rows.length) n.push('There are no rows in your table.');
    else if (good < all) n.push(`${all - good} of your ${all} readings do not match the instruments: read the spring balance to the nearest half division (0.05 N) just as the block starts to move, and the protractor to 1°.`);
    if (slidingSeen) n.push('Some of your F values are the readings while the block was already sliding (kinetic friction, smaller): record the reading just as it starts to move.');
    const precise = rows.length > 0 && rows.every((r) => ['R', 'F1', 'F2', 'F'].every((c) => filled(r.c[c]) && decimalPlaces(r.c[c]!) >= 1 && decimalPlaces(r.c[c]!) <= 2)) && ['th1', 'th2'].every((c) => filled(s.cells[c]));
    if (precise) k++;
    else n.push('Record the forces in N to 1 or 2 decimal places (the balance reads to 0.05 N), and every angle.');
    const means = rows.length > 0 && rows.every((r) => {
      const f = [rc(r, 'F1'), rc(r, 'F2')].filter((x): x is number => x !== null);
      return f.length > 0 && withinAbs(rc(r, 'F'), avg(f), 0.03);
    });
    const thv = ths.filter((x): x is number => x !== null);
    if (means && thv.length > 0 && withinAbs(num(s.cells.th), avg(thv), 0.3)) k++;
    else n.push('Work out the mean F for each row and the mean angle θ.');
    auto.push(score(crit('readings'), k, n));
    for (const r of rows) {
      const R = rc(r, 'R');
      const F = rc(r, 'F');
      if (R !== null && F !== null) pts.push({ x: R, y: F });
    }
  }

  // ---- graph (2)
  const graph = gradeGraph(pts, s.line, 'F against R');
  auto.push(score(crit('graph'), graph.marks, graph.notes));

  // ---- results (4)
  const slope = num(s.answers.slope.value);
  const mutan = num(s.answers.mutan.value);
  const th = num(s.cells.th);
  {
    const n: string[] = [];
    let k = 0;
    const os = originSlope(pts);
    if (slope !== null && (slopeAccepted(slope, graph.fit?.slope ?? null, s.line, graph.lineOk) || (os !== null && withinRel(slope, os, 0.05)))) k++;
    else if (slope === null) n.push('Find μ, the slope of your graph of F against R, from two points far apart on your line.');
    else n.push(graph.fit ? `Your μ does not fit your own points (their best line has a slope of about ${sf(graph.fit.slope, 3)}).` : 'The slope needs your points first.');
    if (withinRel(slope, v.muS, 0.08)) k++;
    else if (slope !== null) n.push(`Your μ from the graph is more than 8 % from the true value here (${v.muS.toFixed(3)}).`);
    if (mutan !== null && th !== null && withinRel(mutan, Math.tan(th * DEG), 0.02)) k++;
    else if (mutan === null) n.push('Work out μ = tan θ from your mean angle.');
    else if (th !== null && withinRel(mutan, Math.sin(th * DEG), 0.02)) n.push('μ = tan θ, not sin θ.');
    else n.push(th !== null ? `μ = tan θ: from your mean angle, tan ${th}° = ${sf(Math.tan(th * DEG), 3)}.` : 'Write down your mean angle θ first.');
    if (withinRel(mutan, v.muS, 0.08)) k++;
    else if (mutan !== null) n.push(`Your tan θ is more than 8 % from the true μ (${v.muS.toFixed(3)}).`);
    auto.push(score(crit('calculations'), k, n));
  }

  // ---- units (1)
  {
    const un: string[] = [];
    let u = 1;
    if (!s.answers.slope.value.trim() && !s.answers.mutan.value.trim()) (u = 0), un.push('No answers to check the units of.');
    if (s.answers.slope.value.trim() && !noUnit(s.answers.slope)) (u = 0), un.push('μ = F/R is a ratio of two forces: it has no unit.');
    if (s.answers.mutan.value.trim() && !noUnit(s.answers.mutan)) (u = 0), un.push('tan θ has no unit.');
    auto.push(score(crit('units'), u, [...new Set(un)]));
  }

  const ai: AiItem[] = [
    {
      criterionId: 'precautions',
      question: 'State two precautions taken to obtain accurate results when determining the coefficient of static friction between a block and a plane.',
      answer: s.written.precautions.trim(),
      guide: `2 marks: one for each of two correct precautions. ${crit('precautions').guide}`,
      keywords: [
        ['slowly', 'gradually', 'gently', 'steadily', 'jerk'],
        ['horizontal', 'parallel'],
        ['clean', 'dry', 'dust', 'wipe'],
        ['zero error', 'zero'],
        ['just starts', 'starts to move', 'just begins', 'about to move', 'limiting'],
        ['repeat', 'repeated', 'average'],
        ['parallax', 'eye level', 'perpendicular'],
        ['raised slowly', 'raise', 'lifted slowly'],
      ],
      need: 2,
    },
  ];
  const th0 = (Math.atan(v.muS) * 180) / Math.PI;
  const solution = [
    `The block weighs ${frictionWeight(v, 0).toFixed(2)} N; each 100 g mass adds about 0.98 N to the normal reaction R.`,
    `Limiting friction F = μR with μ = ${v.muS.toFixed(3)} on the clean, dry plank: e.g. R = ${frictionWeight(v, 2).toFixed(2)} N needs F ≈ ${(v.muS * frictionWeight(v, 2)).toFixed(2)} N just as it starts to move. Once sliding, the balance reads less (kinetic friction, μk ≈ ${v.muK.toFixed(2)}).`,
    `The graph of F against R is a straight line through the origin of slope μ = ${v.muS.toFixed(3)}.`,
    `On the raised plank the block just slips at θ ≈ ${th0.toFixed(1)}°, whatever the load: μ = tan θ = ${v.muS.toFixed(3)}.`,
    graph.fit ? `From your own points the best line has slope ${sf(graph.fit.slope, 3)}.` : 'Plot F against R from your table to find the slope.',
  ];
  const facts = [
    `Task: coefficient of static friction (true μ ${v.muS.toFixed(3)}, balance zero error ${v.sbZero.toFixed(2)} N); ${plural(pulls.length, 'pull')} at ${plural(loads.length, 'load')}, ${plural(tilts.length, 'tilt')}; zeroed ${s.zeroed ? 'yes' : 'no'}, wiped ${s.wiped ? 'yes' : 'no'}.`,
    `Student's μ (slope) ${s.answers.slope.value || '—'}; tan θ ${s.answers.mutan.value || '—'} (θ ${s.cells.th || '—'}°).`,
  ];
  return { auto, ai, solution, facts };
}

// ================================================================== VISCOSITY

function gradeViscosity(s: PhyMechanicsState, v: PhyMechanicsVariant): Part {
  const auto: CriterionScore[] = [];
  const readings = viscReadings(v, s.drops);
  const drops = s.drops.map((d, k) => ({ ...d, k, t: readings[k]! }));
  const gly = drops.filter((d) => d.liquid === 'glycerine');
  const oil = drops.filter((d) => d.liquid === 'oil');
  const balls = [...new Set(gly.map((d) => d.ball))];
  const rows = s.rows;
  const L = num(s.cells.L);

  // ---- care (2)
  {
    const n: string[] = [];
    let k = 0;
    if (drops.length && drops.every((d) => d.centre)) k++;
    else if (!drops.length) n.push('No balls were dropped.');
    else n.push('Release every ball at the centre of the surface, along the axis: near the wall the glass slows it down.');
    if (drops.length && drops.every((d) => d.eyeLevel)) k++;
    else if (drops.length) n.push('Move your eye level with each band as the ball passes it: seen from one height between them, the bands appear closer together and the time is short.');
    auto.push(score(crit('care'), k, n));
  }

  // ---- procedure (4)
  {
    const n: string[] = [];
    let k = 0;
    if (gly.length && gly.every((d) => Math.min(d.top, d.bot) >= VISC_TOP_OK - 1e-9)) k++;
    else if (gly.length) n.push(`Put the upper band well below the surface (at least ${VISC_TOP_OK} cm; the card says about 8 cm): just below the surface the ball is not yet at its terminal velocity.`);
    else n.push('No balls were timed in the glycerine.');
    const sep = gly.length ? Math.abs(gly[0]!.bot - gly[0]!.top) : 0;
    if (gly.length && gly.every((d) => Math.abs(Math.abs(d.bot - d.top) - sep) < 1e-6) && sep >= 15 && L !== null && withinAbs(L, sep, 0.2)) k++;
    else if (gly.length) n.push(gly.some((d) => Math.abs(Math.abs(d.bot - d.top) - sep) > 1e-6) ? 'Keep the bands in the same places for every drop.' : sep < 15 ? `Put the bands about ${VISC_SPACING} cm apart: a short fall makes your reaction time a large error.` : 'Measure the distance between the bands with the metre rule and write it down (to 0.1 cm).');
    if (balls.length >= 4 && balls.every((b) => s.measured.includes(b))) k++;
    else n.push(balls.length < 4 ? `Time at least four sizes of ball (you timed ${balls.length}).` : 'Measure the diameter of every ball you time with the micrometer.');
    if (balls.length && balls.every((b) => gly.filter((d) => d.ball === b).length >= 2)) k++;
    else if (balls.length) n.push('Time each ball size at least twice and average.');
    auto.push(score(crit('procedure'), k, n));
  }

  // ---- readings (5)
  const pts: XY[] = [];
  {
    const n: string[] = [];
    let k = 0;
    let good = 0;
    let all = 0;
    for (const row of rows) {
      const b = row.key;
      all++;
      if (s.measured.includes(b) && withinAbs(rc(row, 'd'), v.balls[b]!, 0.011)) good++;
      const ts = [rc(row, 't1'), rc(row, 't2')].filter((x, i) => x !== null || i < gly.filter((d) => d.ball === b).length);
      const m = matchAll(ts, gly.filter((d) => d.ball === b).map((d) => d.t), 0.05);
      all += ts.length;
      good += m.filter(Boolean).length;
    }
    if (oil.length) {
      all += 2;
      if (withinAbs(num(s.cells.od), v.balls[oil[0]!.ball]!, 0.011) && s.measured.includes(oil[0]!.ball)) good++;
      if (oil.some((d) => withinAbs(num(s.cells.ot), d.t, 0.05))) good++;
    }
    k += prop3(good, all);
    if (!rows.length) n.push('There are no rows in your table.');
    else if (good < all) n.push(`${all - good} of your ${all} readings do not match the instruments: read the micrometer to 0.01 mm and the stop-clock to 0.01 s (reset it before every drop).`);
    const precise = rows.length > 0 && rows.every((r) => filled(r.c.d) && decimalPlaces(r.c.d!) === 2 && ['t1', 't2'].every((c) => filled(r.c[c]) && decimalPlaces(r.c[c]!) >= 1));
    if (precise) k++;
    else n.push('Record the diameters to 0.01 mm and the times to 0.01 s (or 0.1 s).');
    const derived =
      rows.length > 0 &&
      L !== null &&
      rows.every((r) => {
        const d = rc(r, 'd');
        const t = [rc(r, 't1'), rc(r, 't2')].filter((x): x is number => x !== null);
        if (d === null || !t.length) return false;
        const tm = rc(r, 't');
        return withinRel(rc(r, 'r'), d / 2, 0.01) && withinRel(rc(r, 'r2'), (d / 2) ** 2, 0.02) && withinAbs(tm, avg(t), 0.02) && tm !== null && withinRel(rc(r, 'v'), L / tm, 0.02);
      });
    if (derived) k++;
    else n.push('Work out r = d/2, r², the mean time and v = distance ÷ mean time (in cm s⁻¹) for each ball.');
    auto.push(score(crit('readings'), k, n));
    for (const r of rows) {
      const x = rc(r, 'r2');
      const y = rc(r, 'v');
      if (x !== null && y !== null && x > 0) pts.push({ x, y });
    }
  }

  // ---- graph (2)
  const graph = gradeGraph(pts, s.line, 'v against r²');
  auto.push(score(crit('graph'), graph.marks, graph.notes));

  // ---- results (4)
  const slopeRaw = num(s.answers.slope.value);
  const su = mechUnit(s.answers.slope.unit);
  /** The slope in the graph's units (cm s⁻¹ mm⁻²), converting an SI slope. */
  const slope = slopeRaw === null ? null : su === '/m/s' || (slopeRaw > 200 && su !== 'cm/s/mm2') ? slopeRaw / 1e4 : slopeRaw;
  const eta = num(s.answers.eta.value);
  const ratio = num(s.answers.ratio.value);
  const etaCareful = viscEtaFromSlope(viscIdealSlope(v));
  {
    const n: string[] = [];
    let k = 0;
    const os = originSlope(pts);
    if (slope !== null && (slopeAccepted(slope, graph.fit?.slope ?? null, s.line, graph.lineOk) || (os !== null && withinRel(slope, os, 0.05)))) k++;
    else if (slope === null) n.push('Find the slope of your graph of v against r² from two points far apart on your line.');
    else n.push(graph.fit ? `Your slope does not fit your own points (their best line has a slope of about ${sf(graph.fit.slope, 3)} cm s⁻¹ mm⁻²).` : 'The slope needs your points first.');
    const fromSlope = slope !== null ? [9.8, 9.81, 10].map((g) => viscEtaFromSlope(slope, g)) : [];
    if (eta !== null && fromSlope.some((e) => withinRel(eta, e, 0.03))) k++;
    else if (eta === null) n.push('Work out η = 2(ρs − ρl)g ÷ (9 × slope), with the slope in SI units (m s⁻¹ per m²: × 10⁴ from cm s⁻¹ mm⁻²).');
    else if (slope !== null && fromSlope.some((e) => withinRel(eta, e * 1e4, 0.03) || withinRel(eta, e / 1e4, 0.03))) n.push('Convert the slope to SI units first: v in m s⁻¹ and r² in m², so the slope in cm s⁻¹ mm⁻² × 10⁴.');
    else if (slope !== null && fromSlope.some((e) => withinRel(eta, e / 4, 0.03) || withinRel(eta, e * 4, 0.03))) n.push('Use the radius, not the diameter, in Stokes’s law.');
    else if (slope !== null) n.push(`From your slope, η = 2 × ${VISC_RHO_STEEL - VISC_RHO_GLY} × 9.8 ÷ (9 × ${sf(slope * 1e4, 3)}) ≈ ${sf(viscEtaFromSlope(slope, 9.8), 3)} Pa s.`);
    if (withinRel(eta, etaCareful, 0.12)) k++;
    else if (eta !== null) n.push(`Your η is more than 12 % from what careful readings give here (about ${sf(etaCareful, 3)} Pa s).`);
    const ov = num(s.cells.ov);
    const ob = oil[0]?.ball ?? VISC_OIL_BALL;
    const gRow = rows.find((r) => r.key === ob);
    const gv = rc(gRow, 'v');
    if (oil.length && ratio !== null && ov !== null && gv !== null && withinRel(ratio, ov / gv, 0.05)) k++;
    else if (!oil.length) n.push('Time the same size of ball in the palm oil too, to compare the two liquids.');
    else if (ratio === null) n.push('Work out η(glycerine) ÷ η(oil) = v(oil) ÷ v(glycerine) for the same ball.');
    else n.push(ov !== null && gv !== null ? `For the same ball, η(glycerine)/η(oil) = v(oil)/v(glycerine) = ${sf(ov, 3)} ÷ ${sf(gv, 3)} ≈ ${sf(ov / gv, 3)}.` : 'Work out v in the oil and in glycerine for the same ball first.');
    auto.push(score(crit('calculations'), k, n));
  }

  // ---- units (1)
  {
    const un: string[] = [];
    let u = 1;
    if (!s.answers.slope.value.trim() && !s.answers.eta.value.trim()) (u = 0), un.push('No answers to check the units of.');
    if (s.answers.slope.value.trim() && !['cm/s/mm2', '/m/s'].includes(su)) (u = 0), un.push('Give the slope its unit: cm s⁻¹ mm⁻² (or m⁻¹ s⁻¹ in SI).');
    if (s.answers.eta.value.trim() && mechUnit(s.answers.eta.unit) !== 'Pa.s') (u = 0), un.push('Viscosity is in Pa s (N s m⁻² or kg m⁻¹ s⁻¹).');
    if (s.answers.ratio.value.trim() && !noUnit(s.answers.ratio)) (u = 0), un.push('A ratio of two viscosities has no unit.');
    auto.push(score(crit('units'), u, [...new Set(un)]));
  }

  const ai: AiItem[] = [
    {
      criterionId: 'precautions',
      question: 'State two precautions taken to obtain accurate results when timing a ball bearing falling at its terminal velocity through glycerine.',
      answer: s.written.precautions.trim(),
      guide: `2 marks: one for each of two correct precautions. ${crit('precautions').guide}`,
      keywords: [
        ['below the surface', 'terminal', 'well below'],
        ['axis', 'centre', 'center', 'middle', 'walls', 'wall'],
        ['eye level', 'parallax', 'level with'],
        ['temperature'],
        ['repeat', 'repeated', 'average'],
        ['gently', 'dropped gently', 'without splash'],
        ['reset'],
        ['dry', 'clean'],
      ],
      need: 2,
    },
  ];
  const solution = [
    `Glycerine here: η = ${v.eta.toFixed(3)} Pa s, ρl = ${v.rhoL} kg m⁻³; steel ρs = ${v.rhoS} kg m⁻³ (the card's rounded values: 7800 and 1260).`,
    `At terminal velocity weight = upthrust + viscous drag: (4/3)πr³(ρs − ρl)g = 6πηrv, so v = 2r²(ρs − ρl)g/(9η): v is proportional to r².`,
    `Just below the surface the ball drags air and has not settled: the upper band at about 8 cm keeps that out of the timing.`,
    `The walls of the cylinder (diameter ${v.cylD.toFixed(1)} cm) slow the larger balls a little (Faxén's factor), so careful readings give a slope of about ${sf(viscIdealSlope(v), 3)} cm s⁻¹ mm⁻² and η ≈ ${sf(etaCareful, 3)} Pa s — a little above the true value.`,
    `In palm oil (η ≈ ${v.oilEta.toFixed(3)} Pa s) the same ball falls far faster: glycerine is about ${Math.round(v.eta / v.oilEta)} times as viscous.`,
    graph.fit ? `From your own points the best line has slope ${sf(graph.fit.slope, 3)} cm s⁻¹ mm⁻², giving η ≈ ${sf(viscEtaFromSlope(graph.fit.slope), 3)} Pa s.` : 'Plot v against r² from your table to find the slope.',
  ];
  const facts = [
    `Task: terminal velocity in glycerine (η ${v.eta.toFixed(3)} Pa s; careful-reading η ${sf(etaCareful, 3)}); ${plural(gly.length, 'drop')} in glycerine of ${plural(balls.length, 'ball size')}, ${plural(oil.length, 'drop')} in oil; bands ${s.top}–${s.bot} cm.`,
    `Student's slope ${s.answers.slope.value || '—'} ${s.answers.slope.unit}; η ${s.answers.eta.value || '—'} ${s.answers.eta.unit}; ratio ${s.answers.ratio.value || '—'}.`,
  ];
  return { auto, ai, solution, facts };
}

// ================================================================== INCLINE

function gradeIncline(s: PhyMechanicsState, v: PhyMechanicsVariant): Part {
  const auto: CriterionScore[] = [];
  const readings = inclineReadings(v, s.runs);
  const runs = s.runs.map((r, k) => ({ ...r, k, t: readings[k]! }));
  const stops = [...new Set(runs.map((r) => r.stop))];
  const rows = s.rows;
  const blocks = runs[0]?.blocks ?? s.blocks;

  // ---- care (2)
  {
    const n: string[] = [];
    let k = 0;
    if (runs.length && runs.every((r) => !r.push)) k++;
    else if (!runs.length) n.push('No runs were timed.');
    else n.push('Let the ball go from rest at the start line: a push gives it a starting speed, so the times are short and s against t² misses the origin.');
    if (runs.length && runs.every((r) => r.blocks === blocks)) k++;
    else if (runs.length) n.push('Keep the angle of the plank the same for every run: changing the blocks changes the acceleration.');
    auto.push(score(crit('care'), k, n));
  }

  // ---- procedure (4)
  {
    const n: string[] = [];
    let k = 0;
    if (stops.length >= 4) k++;
    else n.push(`Time the ball to at least four distances (you used ${stops.length}).`);
    if (stops.length && Math.max(...stops) - Math.min(...stops) >= 100 - 1e-9) k++;
    else n.push('Spread the distances out (at least 1.0 m between the shortest and the longest, e.g. 0.40 m to 1.60 m).');
    if (stops.length && stops.every((x) => runs.filter((r) => r.stop === x).length >= 3)) k++;
    else n.push('Time each distance three times and average.');
    if (runs.length && runs.every((r) => r.reset)) k++;
    else if (runs.length) n.push('Reset the stop-clock to zero before every timing: otherwise it adds on to the last time.');
    auto.push(score(crit('procedure'), k, n));
  }

  // ---- readings (5)
  const pts: XY[] = [];
  {
    const n: string[] = [];
    let k = 0;
    let good = 0;
    let all = 0;
    for (const row of rows) {
      const lr = runs.filter((r) => r.stop === row.key);
      all++;
      if (withinAbs(rc(row, 's'), row.key / 100, 0.005)) good++;
      const ts = [rc(row, 't1'), rc(row, 't2'), rc(row, 't3')].filter((x, i) => x !== null || i < lr.length);
      const m = matchAll(ts, lr.map((r) => r.t), 0.05);
      all += ts.length;
      good += m.filter(Boolean).length;
    }
    k += prop3(good, all);
    if (!rows.length) n.push('There are no rows in your table.');
    else if (good < all) n.push(`${all - good} of your ${all} readings do not match: s is the stopping block’s distance from the start line (in m), and each time is what the stop-clock showed.`);
    const precise = rows.length > 0 && rows.every((r) => filled(r.c.s) && decimalPlaces(r.c.s!) === 2 && ['t1', 't2', 't3'].every((c) => filled(r.c[c]) && decimalPlaces(r.c[c]!) === 2));
    if (precise) k++;
    else n.push('Record s in m to 2 decimal places (0.40 m) and the times to 0.01 s, as the stop-clock shows.');
    const derived =
      rows.length > 0 &&
      rows.every((r) => {
        const t = [rc(r, 't1'), rc(r, 't2'), rc(r, 't3')].filter((x): x is number => x !== null);
        const tm = rc(r, 't');
        return t.length > 0 && withinAbs(tm, avg(t), 0.011) && tm !== null && withinRel(rc(r, 'tt'), tm * tm, 0.01);
      });
    if (derived) k++;
    else n.push('Work out the mean time and t² for each distance.');
    auto.push(score(crit('readings'), k, n));
    for (const r of rows) {
      const x = rc(r, 'tt');
      const y = rc(r, 's');
      if (x !== null && y !== null) pts.push({ x, y });
    }
  }

  // ---- graph (2)
  const graph = gradeGraph(pts, s.line, 's against t²');
  auto.push(score(crit('graph'), graph.marks, graph.notes));

  // ---- results (4)
  const slope = num(s.answers.slope.value);
  const a = num(s.answers.accel.value);
  const aTrue = inclineAccel(v, blocks);
  {
    const n: string[] = [];
    let k = 0;
    const os = originSlope(pts);
    if (slope !== null && (slopeAccepted(slope, graph.fit?.slope ?? null, s.line, graph.lineOk) || (os !== null && withinRel(slope, os, 0.05)))) k++;
    else if (slope === null) n.push('Find the slope of your graph of s against t² from two points far apart on your line.');
    else n.push(graph.fit ? `Your slope does not fit your own points (their best line has a slope of about ${sf(graph.fit.slope, 3)} m s⁻²).` : 'The slope needs your points first.');
    if (slope !== null && withinRel(a, 2 * slope, 0.02)) k++;
    else if (a === null) n.push('Work out a = 2 × slope (s = ½at², so the slope is ½a).');
    else if (slope !== null && withinRel(a, slope, 0.02)) n.push('Do not forget the ½: the slope is ½a, so a = 2 × slope.');
    else if (slope !== null) n.push(`a = 2 × slope = ${sf(2 * slope, 3)} m s⁻² from your slope.`);
    if (withinRel(a, aTrue, 0.08)) k++;
    else if (a !== null) n.push(`Your acceleration is more than 8 % from the true value here (${aTrue.toFixed(3)} m s⁻²).`);
    const ls = phyLineSlope(s.line);
    const cut = s.line && ls !== null ? s.line.y1 - ls * s.line.x1 : (graph.fit?.intercept ?? null);
    const smax = Math.max(0.4, ...pts.map((p) => p.y));
    if (cut !== null && Math.abs(cut) <= 0.05 * smax + 0.02) k++;
    else if (cut !== null) n.push(`Your line cuts the s axis at ${sf(cut, 2)} m: from rest, s = ½at² goes through the origin (a push, or a late start, moves it).`);
    auto.push(score(crit('calculations'), k, n));
  }

  // ---- units (1)
  {
    const un: string[] = [];
    let u = 1;
    if (!s.answers.slope.value.trim() && !s.answers.accel.value.trim()) (u = 0), un.push('No answers to check the units of.');
    for (const [ans, label] of [
      [s.answers.slope, 'the slope'],
      [s.answers.accel, 'the acceleration'],
    ] as const)
      if (ans.value.trim() && !['m/s2', 'cm/s2'].includes(mechUnit(ans.unit))) (u = 0), un.push(`Give ${label} its unit: m s⁻².`);
    auto.push(score(crit('units'), u, [...new Set(un)]));
  }

  const ai: AiItem[] = [
    {
      criterionId: 'precautions',
      question: 'State two precautions taken to obtain accurate results when timing a ball rolling down an inclined plane to find its acceleration.',
      answer: s.written.precautions.trim(),
      guide: `2 marks: one for each of two correct precautions. ${crit('precautions').guide}`,
      keywords: [
        ['from rest', 'without pushing', 'not pushed', 'released gently', 'no push'],
        ['angle', 'constant', 'same height', 'inclination'],
        ['repeat', 'repeated', 'average', 'mean'],
        ['reset', 'zero'],
        ['parallax', 'eye level', 'perpendicular'],
        ['straight', 'groove'],
        ['clean', 'dust'],
      ],
      need: 2,
    },
  ];
  const solution = [
    `The plank on ${plural(blocks, 'block')} (${(blocks * v.blockH).toFixed(1)} cm high over 2.00 m): sin θ = ${(blocks * v.blockH / 200).toFixed(4)}.`,
    `A ball rolling in the groove: a = g sin θ/(1 + k) (part of the energy goes into spinning it), less a little rolling resistance: a = ${aTrue.toFixed(3)} m s⁻².`,
    `From rest, s = ½at²: s against t² is a straight line through the origin of slope ½a = ${(aTrue / 2).toFixed(3)} m s⁻².`,
    `e.g. s = 1.60 m takes t = ${Math.sqrt(3.2 / aTrue).toFixed(2)} s; your stop-clock times include your reaction at each press — so repeat and average.`,
    graph.fit ? `From your own points the best line has slope ${sf(graph.fit.slope, 3)} m s⁻², giving a ≈ ${sf(2 * graph.fit.slope, 3)} m s⁻².` : 'Plot s against t² from your table to find the slope.',
  ];
  const facts = [
    `Task: uniform acceleration down an incline (true a ${aTrue.toFixed(3)} m s⁻² on ${blocks} blocks); ${plural(runs.length, 'run')} at ${plural(stops.length, 'distance')}; pushed ${runs.filter((r) => r.push).length}, not reset ${runs.filter((r) => !r.reset).length}.`,
    `Student's slope ${s.answers.slope.value || '—'} ${s.answers.slope.unit}; a ${s.answers.accel.value || '—'} ${s.answers.accel.unit}.`,
  ];
  return { auto, ai, solution, facts };
}

// ================================================================== FORCES

function gradeForces(s: PhyMechanicsState, v: PhyMechanicsVariant): Part {
  const auto: CriterionScore[] = [];
  const kRaw = num(s.answers.scale.value);
  const ku = mechUnit(s.answers.scale.unit);
  /** The scale in N per cm. */
  const k = kRaw === null || kRaw <= 0 ? null : ku === 'cm/N' ? 1 / kRaw : kRaw;
  const sets = s.sets.map((set, i) => {
    const row = s.rows.find((r) => r.key === i);
    const oa = rc(row, 'OA');
    const ob = rc(row, 'OB');
    const con = set.built ? forceConstruction(v, set, i, oa, ob) : null;
    return { set, i, row, oa, ob, con };
  });
  const used = sets.filter((x) => x.set.dots.length > 0);

  // ---- care (2)
  {
    const n: string[] = [];
    let c = 0;
    if (used.length && used.every((x) => x.set.dots.every((d) => d.tapped))) c++;
    else if (!used.length) n.push('No threads were marked.');
    else n.push('Tap the board gently before you mark the threads, so the pulleys turn freely and the knot settles where the forces really balance.');
    if (used.length && used.every((x) => x.oa !== null && x.ob !== null && x.oa >= 5 && x.ob >= 5)) c++;
    else if (used.length) n.push('Choose a large scale, so OA and OB are each at least 5 cm long: a small drawing magnifies the pencil errors.');
    auto.push(score(crit('care'), c, n));
  }

  // ---- procedure (4)
  {
    const n: string[] = [];
    let c = 0;
    const two = (x: (typeof sets)[number]) => (['P', 'Q', 'W'] as const).every((th) => x.set.dots.filter((d) => d.th === th).length >= 2);
    if (used.length && used.every(two)) c++;
    else n.push('Mark two dots under each of the three threads (well apart), so each line of action can be drawn.');
    if (used.length && used.every((x) => x.set.off)) c++;
    else n.push('Take the paper off the board and draw the lines through the dots, so they meet at the junction O.');
    if (used.length && used.every((x) => x.set.built && x.con)) c++;
    else n.push('Mark OA and OB to your scale along the lines of P and Q, and complete the parallelogram.');
    if (used.length && used.every((x) => filled(x.row?.c.OC) && filled(x.row?.c.ang))) c++;
    else n.push('Measure the diagonal OC (its length and its angle from the line of W) and record them.');
    auto.push(score(crit('procedure'), c, n));
  }

  // ---- readings (5)
  {
    const n: string[] = [];
    let c = 0;
    const rows = used.filter((x) => x.row);
    if (!rows.length) n.push('There are no rows in your table.');
    else {
      const ocOk = rows.every((x) => x.con && withinAbs(rc(x.row, 'OC'), x.con.oc, 0.1));
      const angOk = rows.every((x) => x.con && withinAbs(rc(x.row, 'ang'), x.con.angle, 1.0));
      const one = rows.every((x) => !x.set.moved && new Set(x.set.dots.map((d) => d.tapped)).size === 1);
      if (ocOk) c++;
      else n.push('Your diagonal OC does not match your drawing: lay the rule along it from O and read to 0.1 cm.');
      if (angOk) c++;
      else n.push('Your angle does not match the drawing: put the protractor’s centre on O and its base line along the line of W produced upwards; read to 1°.');
      if (one) c++;
      else n.push('Mark every dot on a sheet with the knot in one place: changing the loads, or tapping the board halfway, moves the knot, so the dots no longer belong to one set of forces.');
      if (rows.every((x) => filled(x.row!.c.OC) && decimalPlaces(x.row!.c.OC!) === 1 && filled(x.row!.c.OA) && filled(x.row!.c.OB))) c++;
      else n.push('Record the lengths in cm to 0.1 cm.');
      if (rows.every((x) => withinAbs(rc(x.row, 'P'), forceNewton(x.set.P), 0.05) && withinAbs(rc(x.row, 'Q'), forceNewton(x.set.Q), 0.05) && withinAbs(rc(x.row, 'W'), forceNewton(x.set.W), 0.05))) c++;
      else n.push(`Convert each load to newtons: mass in kg × ${FORCES_CARD_G} N kg⁻¹ (the hanger counts: 50 g).`);
    }
    auto.push(score(crit('readings'), c, n));
  }

  // ---- construction (2)
  {
    const n: string[] = [];
    let c = 0;
    const spreadOk = used.length > 0 && used.every((x) => (['P', 'Q', 'W'] as const).every((th) => (forceLine(v, x.set, x.i, th)?.spread ?? 0) >= 6));
    if (spreadOk) c++;
    else n.push('Put the two dots on each thread well apart (at least 6 cm): dots close together give an uncertain direction.');
    if (k !== null && used.length && used.every((x) => withinAbs(x.oa, forceNewton(x.set.P) / k, 0.1) && withinAbs(x.ob, forceNewton(x.set.Q) / k, 0.1))) c++;
    else if (k === null) n.push('State your scale (e.g. 0.5 N per cm) and draw OA and OB to it.');
    else n.push(`Draw OA = P ÷ scale and OB = Q ÷ scale: with ${sf(k, 3)} N per cm, P = ${used[0] ? forceNewton(used[0].set.P).toFixed(1) : '—'} N is ${used[0] ? (forceNewton(used[0].set.P) / k).toFixed(1) : '—'} cm.`);
    auto.push(score(crit('graph'), c, n));
  }

  // ---- results (4)
  {
    const n: string[] = [];
    let c = 0;
    const rows = used.filter((x) => x.row);
    const Rok = k !== null && rows.length > 0 && rows.every((x) => {
      const oc = rc(x.row, 'OC');
      return oc !== null && withinRel(rc(x.row, 'R'), oc * k, 0.02);
    });
    if (Rok) c++;
    else n.push('Work out R = OC × your scale (in N).');
    const dOk = rows.length > 0 && rows.every((x) => {
      const R = rc(x.row, 'R');
      const W = rc(x.row, 'W');
      const d = rc(x.row, 'diff');
      return R !== null && W !== null && W > 0 && d !== null && (withinAbs(Math.abs(d), (Math.abs(R - W) / W) * 100, 0.3) || withinAbs(Math.abs(d), (Math.abs(R - W) / R) * 100, 0.3));
    });
    if (dOk) c++;
    else n.push('Work out the percentage difference = (R − W) ÷ W × 100 %.');
    const close = rows.length > 0 && rows.every((x) => withinRel(rc(x.row, 'R'), forceNewton(x.set.W), 0.05));
    if (close) c++;
    else if (rows.length) n.push('Your R is more than 5 % from W: check the dots, the scale and the parallelogram.');
    const vert = rows.length > 0 && rows.every((x) => x.con && x.con.angle <= 3);
    if (vert) c++;
    else if (rows.length) n.push('Your diagonal is more than 3° from the vertical: the resultant of P and Q should point straight up, opposite to W.');
    auto.push(score(crit('calculations'), c, n));
  }

  // ---- units (1)
  {
    const un: string[] = [];
    let u = 1;
    if (!s.answers.scale.value.trim()) (u = 0), un.push('State your scale.');
    else if (!['N/cm', 'cm/N'].includes(ku)) (u = 0), un.push('Give the scale its unit: N per cm (e.g. 0.5 N cm⁻¹).');
    auto.push(score(crit('units'), u, un));
  }

  const ai: AiItem[] = [
    {
      criterionId: 'precautions',
      question: 'State two precautions taken to obtain accurate results when verifying the parallelogram law of forces with pulleys and weights.',
      answer: s.written.precautions.trim(),
      guide: `2 marks: one for each of two correct precautions. ${crit('precautions').guide}`,
      keywords: [
        ['friction', 'frictionless', 'tap', 'tapped', 'pulleys free'],
        ['well separated', 'far apart', 'apart', 'well spaced'],
        ['sharp pencil', 'fine', 'thin line'],
        ['large scale', 'suitable scale', 'scale'],
        ['not touching', 'touch the board', 'free'],
        ['settle', 'rest', 'equilibrium'],
        ['parallax', 'directly', 'perpendicular'],
      ],
      need: 2,
    },
  ];
  const eq = forceEquilibrium(v, s.sets[0] ?? s.masses, true, 0);
  const l0 = s.sets[0] ?? s.masses;
  const P = forceNewton(l0.P);
  const Q = forceNewton(l0.Q);
  const W = forceNewton(l0.W);
  const angPQ = eq.ok ? (Math.acos(eq.dir.P.x * eq.dir.Q.x + eq.dir.P.y * eq.dir.Q.y) * 180) / Math.PI : null;
  const solution = [
    `Loads: P = ${P.toFixed(1)} N, Q = ${Q.toFixed(1)} N, W = ${W.toFixed(1)} N (g = ${FORCES_CARD_G} N kg⁻¹; the hanger counts).`,
    `At rest the knot is in equilibrium: the resultant of P and Q is equal and opposite to W — vertical, upwards, ${W.toFixed(1)} N.`,
    angPQ !== null ? `The threads of P and Q settle at ${angPQ.toFixed(1)}° to each other; by calculation R = √(P² + Q² + 2PQ cos θ) = ${Math.sqrt(P * P + Q * Q + 2 * P * Q * Math.cos(angPQ * DEG)).toFixed(2)} N.` : 'With these loads the knot does not settle inside the paper.',
    'Drawn to scale along the lines of P and Q, the parallelogram’s diagonal from O represents R: measure it and compare with W.',
    `The pulleys’ friction (about ${(v.pulleyF * 100).toFixed(1)} % of the tension) shifts the knot; a gentle tap lets it settle where the forces really balance.`,
  ];
  const facts = [
    `Task: parallelogram of forces; ${plural(used.length, 'sheet')} marked; scale ${s.answers.scale.value || '—'} ${s.answers.scale.unit}.`,
    ...used.slice(0, 2).map((x) => `Sheet ${x.i + 1}: P ${forceNewton(x.set.P)} N, Q ${forceNewton(x.set.Q)} N, W ${forceNewton(x.set.W)} N; OC ${x.row?.c.OC || '—'} cm (drawn ${x.con ? x.con.oc.toFixed(2) : '—'}), angle ${x.row?.c.ang || '—'}° (drawn ${x.con ? x.con.angle.toFixed(1) : '—'}).`),
  ];
  return { auto, ai, solution, facts };
}

/**
 * Marks the mechanics lab (friction, viscosity, the incline, the
 * parallelogram of forces): the care taken (the instrument's zero, a clean
 * plank, slow pulls; the ball at the axis and the eye at each band; release
 * from rest at a constant angle; a settled knot and a large scale), the
 * procedure, every reading against what the instrument really showed (each
 * pull's limiting force, each stop-clock reading with the student's own
 * reaction, the drawing), the graph or the construction, the results against
 * the truth and units. The precautions go to AI.
 */
export const phyMechanicsGrader: SimulatorGrader<'phy-mechanics'> = {
  id: 'phy-mechanics',
  grade(state: PhyMechanicsState, seed: number): GraderOutput {
    const v = phyMechanicsVariant(seed);
    const task: MechTask = state.task ?? 'FRICTION';
    const part = task === 'VISCOSITY' ? gradeViscosity(state, v) : task === 'INCLINE' ? gradeIncline(state, v) : task === 'FORCES' ? gradeForces(state, v) : gradeFriction(state, v);
    // keep the rubric's order
    const order = PHY_MECHANICS.rubric.filter((c) => c.how === 'AUTO').map((c) => c.id);
    part.auto.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    return part;
  },
};
