import {
  PHY_MAGNETISM,
  diodeRdyn,
  diodeReading,
  diodeVd,
  emClipsMean,
  emCurrent,
  emLift,
  emSettingKey,
  fieldNeutrals,
  fieldTrace,
  fieldTrueDistances,
  indCardEmf,
  indDeflection,
  indShown,
  phyFit,
  phyLineSlope,
  phyMagnetismVariant,
  sheetCfg,
  type CriterionScore,
  type IndMove,
  type MagRow,
  type MagTask,
  type PhyAnswer,
  type PhyMagnetismState,
  type PhyMagnetismVariant,
} from '@aischool/shared';
import { decimalPlaces, parseNumber, score, sf, withinAbs, withinRel } from './helpers';
import { phyUnit, type XY } from './phy-common';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

const crit = (id: string) => PHY_MAGNETISM.rubric.find((c) => c.id === id)!;
const num = (raw: string | undefined) => parseNumber(raw);
const filled = (raw: string | undefined) => !!raw && raw.trim().length > 0;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const avg = (xs: number[]) => xs.reduce((t, x) => t + x, 0) / (xs.length || 1);
const rc = (row: MagRow | undefined, id: string) => num(row?.c[id]);
/** Three marks in proportion to the tests passed (all: 3, two thirds: 2, half: 1). */
const prop3 = (good: number, all: number) => (all === 0 ? 0 : good === all ? 3 : good >= (2 * all) / 3 ? 2 : good >= all / 2 ? 1 : 0);

/** This lab's units (clips per ampere), then the physics table. */
export function magUnit(raw: string | null | undefined): string {
  const s = (raw ?? '')
    .replace(/[¹]/g, '1')
    .replace(/[⁻−–—]/g, '-')
    .toLowerCase()
    .replace(/\^/g, '')
    .replace(/[\s.·*×()]/g, '');
  if (/^(a-1|\/a|1\/a|pera|perampere|clips\/a|clipsa-1|clipsper(a|amp|ampere)|clip\/a|clipsperamp|\/amp|\/ampere|clips\/amp|clips\/ampere)$/.test(s)) return 'A-1';
  if (/^(ω|Ω|ohms?)$/i.test(s)) return 'ohm';
  return phyUnit(raw);
}
const noUnit = (a: PhyAnswer) => ['', 'none'].includes(magUnit(a.unit));

type Part = { auto: CriterionScore[]; ai: AiItem[]; solution: string[]; facts: string[] };
const precaution = (question: string, keywords: string[][], answer: string): AiItem => ({
  criterionId: 'precautions',
  question,
  answer: answer.trim(),
  guide: `2 marks: one for each of two correct precautions. ${crit('precautions').guide}`,
  keywords,
  need: 2,
});

// ================================================================== FIELD

function gradeField(s: PhyMagnetismState, v: PhyMagnetismVariant): Part {
  const auto: CriterionScore[] = [];
  const sheets = s.sheets.map((sh, i) => {
    const cfg = sheetCfg(sh);
    return { sh, i, cfg, traces: sh.lines.map((l, k) => fieldTrace(v, cfg, i, k, l, l.dots)), truth: fieldNeutrals(v, cfg) };
  });
  type Sh = (typeof sheets)[number];
  const pick = (xs: Sh[]) => [...xs].reverse().find((x) => x.sh.neutrals.length >= 2) ?? [...xs].reverse().find((x) => x.sh.lines.length > 0) ?? xs[xs.length - 1];
  const N = pick(sheets.filter((x) => x.sh.arr === 'one' && x.sh.facing === 'north'));
  const S = pick(sheets.filter((x) => x.sh.arr === 'one' && x.sh.facing === 'south'));
  const used = sheets.filter((x) => x.sh.lines.length > 0 || x.sh.neutrals.length > 0);
  const lines = used.flatMap((x) => x.sh.lines);
  const real = (x: Sh | undefined) => (x ? x.sh.lines.filter((l, k) => l.dots >= 3 && x.traces[k]!.dots.length >= 4) : []);

  // ---- care (2)
  {
    const n: string[] = [];
    let k = 0;
    if (used.length && used.every((x) => x.sh.aligned && !x.sh.steel)) k++;
    else if (!used.length) n.push('Nothing was plotted.');
    else {
      if (used.some((x) => !x.sh.aligned)) n.push(`Mark the magnetic meridian with the compass alone before you put the magnet on, and line the paper up with it: your magnet sat about ${Math.abs(v.misalign).toFixed(0)}° off the meridian, so the neutral points moved off the lines they belong on.`);
      if (used.some((x) => x.sh.steel)) n.push('Clear the keys and the phone off the bench before you plot: the steel in them distorted the field near the paper and shifted a neutral point.');
    }
    if (lines.length && lines.every((l) => l.tapped && l.compass === 'small')) k++;
    else if (lines.length) {
      if (lines.some((l) => !l.tapped)) n.push('Tap the compass gently before you mark each dot: a sticking needle points a few degrees off, and the errors add up along the line.');
      if (lines.some((l) => l.compass !== 'small')) n.push('Use the small plotting compass: a long needle takes big steps and smooths the curves away.');
    }
    auto.push(score(crit('care'), k, n));
  }

  // ---- procedure (4)
  {
    const n: string[] = [];
    let k = 0;
    if (real(N).length >= 4) k++;
    else n.push(`Plot at least four field lines with the N pole pointing north (you have ${real(N).length}).`);
    if (N?.sh.arrows) k++;
    else n.push('Put arrows on your field lines, from N to S.');
    const two = (x: Sh | undefined, axis: 'x' | 'y') => !!x && x.sh.neutrals.some((p) => p[axis] > 2) && x.sh.neutrals.some((p) => p[axis] < -2);
    if (two(N, 'x')) k++;
    else n.push('Find both neutral points with the N pole pointing north — one east and one west of the magnet.');
    if (two(S, 'y')) k++;
    else n.push('Reverse the magnet (N pole pointing south) on a fresh sheet and find both neutral points again — beyond its two ends.');
    auto.push(score(crit('procedure'), k, n));
  }

  // ---- readings (5)
  const dist = (p: { x: number; y: number }) => Math.hypot(p.x, p.y);
  {
    const n: string[] = [];
    let k = 0;
    let good = 0;
    let all = 0;
    const check = (x: Sh | undefined, cells: [string, (p: { x: number; y: number }) => boolean][]) => {
      for (const [id, side] of cells) {
        all += 2;
        const truth = x?.truth.find(side);
        const mark = x?.sh.neutrals.filter(side).sort((a, b) => (truth ? Math.hypot(a.x - truth.x, a.y - truth.y) - Math.hypot(b.x - truth.x, b.y - truth.y) : 0))[0];
        if (truth && mark && Math.hypot(mark.x - truth.x, mark.y - truth.y) <= 0.5) good++;
        if (mark && withinAbs(num(s.cells[id]), dist(mark), 0.2)) good++;
      }
    };
    check(N, [
      ['xe', (p) => p.x > 0],
      ['yw', (p) => p.x < 0],
    ]);
    check(S, [
      ['an', (p) => p.y > 0],
      ['as', (p) => p.y < 0],
    ]);
    k += prop3(good, all);
    if (good < all) n.push(`${all - good} of ${all} checks fail: a neutral point is where the needle rests in any direction (move the compass in small steps and watch it swing round), and each distance is from the centre of the magnet to your mark, read to 0.1 cm.`);
    if (['xe', 'yw', 'an', 'as'].every((c) => filled(s.cells[c]) && decimalPlaces(s.cells[c]!) === 1)) k++;
    else n.push('Record all four distances in cm to 0.1 cm.');
    const xe = num(s.cells.xe);
    const yw = num(s.cells.yw);
    const an = num(s.cells.an);
    const as = num(s.cells.as);
    if (xe !== null && yw !== null && an !== null && as !== null && withinAbs(num(s.answers.me.value), (xe + yw) / 2, 0.06) && withinAbs(num(s.answers.ma.value), (an + as) / 2, 0.06)) k++;
    else n.push('Work out the mean distance of the two equatorial neutral points and of the two axial ones.');
    auto.push(score(crit('readings'), k, n));
  }

  // ---- graph: the drawing (2)
  {
    const n: string[] = [];
    let k = 0;
    const toS = N ? N.traces.filter((t) => t.reachedS).length : 0;
    if (toS >= 3) k++;
    else n.push(`Plot lines that run from the N pole right round to the S pole (${toS} of yours reach it; start close to the sides of the N end).`);
    const onLine = (x: Sh | undefined, axis: 'x' | 'y') => !!x && x.sh.neutrals.length >= 2 && x.sh.neutrals.every((p) => Math.abs(p[axis]) <= 0.6);
    if (onLine(N, 'y') && onLine(S, 'x')) k++;
    else n.push('With N pointing north the neutral points lie on the east–west line through the centre of the magnet; with N pointing south they lie on its axis, beyond the ends.');
    auto.push(score(crit('graph'), k, n));
  }

  // ---- results (4)
  const t = fieldTrueDistances(v);
  const me = num(s.answers.me.value);
  const ma = num(s.answers.ma.value);
  const ratio = num(s.answers.ratio.value);
  {
    const n: string[] = [];
    let k = 0;
    if (withinRel(me, t.eq, 0.06)) k++;
    else n.push(me === null ? 'Work out the mean distance of the equatorial neutral points.' : `Your mean equatorial distance is more than 6 % from the true value here (${t.eq.toFixed(1)} cm).`);
    if (withinRel(ma, t.ax, 0.06)) k++;
    else n.push(ma === null ? 'Work out the mean distance of the axial neutral points.' : `Your mean axial distance is more than 6 % from the true value here (${t.ax.toFixed(1)} cm).`);
    if (ratio !== null && me !== null && ma !== null && me > 0 && withinRel(ratio, ma / me, 0.02)) k++;
    else n.push(ratio === null ? 'Work out the ratio: mean axial distance ÷ mean equatorial distance.' : me && ma ? `From your means, ${sf(ma, 3)} ÷ ${sf(me, 3)} = ${sf(ma / me, 3)}.` : 'Work out both means first.');
    if (withinRel(ratio, t.ax / t.eq, 0.08)) k++;
    else if (ratio !== null) n.push(`Your ratio is more than 8 % from the true one here (${(t.ax / t.eq).toFixed(2)}).`);
    auto.push(score(crit('calculations'), k, n));
  }

  // ---- units (1)
  {
    const un: string[] = [];
    let u = 1;
    if (!s.answers.me.value.trim() && !s.answers.ma.value.trim()) (u = 0), un.push('No answers to check the units of.');
    for (const [a, l] of [
      [s.answers.me, 'the mean equatorial distance'],
      [s.answers.ma, 'the mean axial distance'],
    ] as const)
      if (a.value.trim() && magUnit(a.unit) !== 'cm') (u = 0), un.push(`Give ${l} its unit: cm.`);
    if (s.answers.ratio.value.trim() && !noUnit(s.answers.ratio)) (u = 0), un.push('A ratio of two distances has no unit.');
    auto.push(score(crit('units'), u, [...new Set(un)]));
  }

  const ai = [
    precaution(
      'State two precautions taken when plotting the magnetic field lines of a bar magnet with a plotting compass.',
      [
        ['iron', 'steel', 'magnetic materials', 'keys', 'away from'],
        ['tap', 'tapped'],
        ['small compass', 'small plotting'],
        ['meridian', 'lined up', 'north-south'],
        ['dots', 'carefully', 'ends of the needle', 'sharp pencil'],
        ['wires', 'current'],
        ['smooth curve', 'smooth'],
      ],
      s.written.precautions,
    ),
  ];
  const solution = [
    `This magnet: poles about ${v.lm.toFixed(1)} cm apart; the Earth's horizontal field points north along the meridian.`,
    `N pole pointing north: on the east–west line through the centre the magnet's field points south (from N round to S), so it cancels the Earth's field at about ${t.eq.toFixed(1)} cm from the centre — two neutral points, X (east) and Y (west).`,
    `N pole pointing south: beyond each end, on the axis, the magnet's field points south and cancels the Earth's at about ${t.ax.toFixed(1)} cm from the centre.`,
    `So the axial neutral points are further out: ratio ≈ ${(t.ax / t.eq).toFixed(2)} (a short dipole would give 1.26; the finite length of the magnet makes it larger).`,
    'Lines leave the N pole and enter the S pole, never cross, and the compass rests in any direction at a neutral point (zero resultant flux density).',
  ];
  const facts = [
    `Task: field lines and neutral points (true equatorial ${t.eq.toFixed(2)} cm, axial ${t.ax.toFixed(2)} cm); ${plural(used.length, 'sheet')} used, ${plural(lines.length, 'line')}; meridian ${s.meridian ? 'yes' : 'no'}, steel cleared ${s.steelAway ? 'yes' : 'no'}.`,
    `Student's distances X ${s.cells.xe || '—'}, Y ${s.cells.yw || '—'}, axial ${s.cells.an || '—'} / ${s.cells.as || '—'} cm; means ${s.answers.me.value || '—'}, ${s.answers.ma.value || '—'}; ratio ${s.answers.ratio.value || '—'}.`,
  ];
  return { auto, ai, solution, facts };
}

// ================================================================== ELECTROMAGNET

function gradeElectromagnet(s: PhyMagnetismState, v: PhyMagnetismVariant): Part {
  const auto: CriterionScore[] = [];
  const lifts = s.lifts.map((l, k) => ({ ...l, k, ...emLift(v, k, l), key: emSettingKey(l) }));
  const keys = [...new Set(lifts.map((l) => l.key))];
  const settings = keys.map((key, i) => {
    const ls = lifts.filter((l) => l.key === key);
    return { i, key, ls, l0: ls[0]!, I0: emCurrent(v, { ...ls[0]!, heat: 0 }), row: s.rows.find((r) => r.key === i) };
  });
  const iron30 = settings.filter((x) => x.l0.core === 'iron' && x.l0.turns === 30 && !x.l0.mixed);
  const iron60 = settings.filter((x) => x.l0.core === 'iron' && x.l0.turns === 60 && !x.l0.mixed);
  const none = settings.filter((x) => x.l0.core === 'none');

  // ---- care (2)
  {
    const n: string[] = [];
    let k = 0;
    if (lifts.length && lifts.every((l) => l.core !== 'steel' && !l.mixed)) k++;
    else if (!lifts.length) n.push('No clips were lifted.');
    else {
      if (lifts.some((l) => l.core === 'steel')) n.push('Use a soft-iron core: steel is harder to magnetise and keeps its magnetism, so clips stay on after you switch off.');
      if (lifts.some((l) => l.mixed)) n.push('Wind every turn the same way: turns wound the opposite way make fields that cancel, so the magnet is much weaker.');
    }
    if (lifts.length && lifts.every((l) => l.heat <= 1)) k++;
    else if (lifts.length) n.push('Open the key between readings: left closed, the coil and the cells warm up and the current falls.');
    auto.push(score(crit('care'), k, n));
  }

  // ---- procedure (4)
  {
    const n: string[] = [];
    let k = 0;
    const currents = [...new Set(iron30.map((x) => x.I0.toFixed(2)))];
    if (currents.length >= 4) k++;
    else n.push(`Use at least four different currents with 30 turns (you used ${currents.length}).`);
    if (iron30.length && iron30.every((x) => x.ls.length >= 2)) k++;
    else n.push('Lift the clips twice at each current and take the mean.');
    if (iron60.some((x) => iron30.some((y) => Math.abs(y.I0 - x.I0) <= 0.06))) k++;
    else n.push('Wind 60 turns and lift at one of the same currents as before, so the turns are the only thing changed.');
    if (none.length) k++;
    else n.push('Try the coil without its core (slide the nail out) at the same current: almost no clips are held.');
    auto.push(score(crit('procedure'), k, n));
  }

  // ---- readings (5)
  const pts: XY[] = [];
  {
    const n: string[] = [];
    let k = 0;
    let good = 0;
    let all = 0;
    for (const x of settings) {
      const row = x.row;
      if (!row) continue;
      all += 2;
      if (withinAbs(rc(row, 'N'), x.l0.turns, 0)) good++;
      if (x.ls.some((l) => withinAbs(rc(row, 'I'), l.I, 0.05))) good++;
      const cs = [rc(row, 'c1'), rc(row, 'c2')].filter((c, i) => c !== null || i < x.ls.length);
      const used = new Set<number>();
      for (const c of cs) {
        all++;
        const hit = x.ls.findIndex((l, j) => !used.has(j) && c !== null && l.clips === c);
        if (hit >= 0) used.add(hit), good++;
      }
    }
    if (none.length) {
      all++;
      if (none.some((x) => x.ls.some((l) => withinAbs(num(s.cells.nc), l.clips, 0)))) good++;
    }
    k += prop3(good, all);
    if (!s.rows.length) n.push('There are no rows in your table.');
    else if (good < all) n.push(`${all - good} of your ${all} readings do not match: read the ammeter to 0.05 A at the moment you lift, and count every clip held.`);
    const rows = s.rows;
    if (rows.length && rows.every((r) => filled(r.c.I) && decimalPlaces(r.c.I!) === 2 && ['c1', 'c2'].every((c) => filled(r.c[c]) && Number.isInteger(Number(r.c[c]))))) k++;
    else n.push('Record each current to 0.05 A (two decimal places) and each count as a whole number.');
    if (rows.length && rows.every((r) => {
      const c = [rc(r, 'c1'), rc(r, 'c2')].filter((x): x is number => x !== null);
      return c.length > 0 && withinAbs(rc(r, 'c'), avg(c), 0.05);
    })) k++;
    else n.push('Work out the mean number of clips for each row.');
    auto.push(score(crit('readings'), k, n));
    for (const x of iron30) {
      const I = rc(x.row, 'I');
      const c = rc(x.row, 'c');
      if (I !== null && c !== null) pts.push({ x: I, y: c });
    }
  }

  // ---- graph (2)
  const low = [...pts].sort((a, b) => a.x - b.x).slice(0, 3);
  const lowFit = low.length >= 2 ? phyFit(low) : null;
  const ls = phyLineSlope(s.line);
  {
    const n: string[] = [];
    let k = 0;
    if (pts.length >= 4 && s.line && ls !== null) k++;
    else n.push(pts.length < 4 ? 'Plot at least four points of clips against current (30 turns) from your table.' : 'Draw a straight line along the first, straight part of your graph.');
    if (s.line && ls !== null && lowFit && Math.abs(ls - lowFit.slope) <= 0.15 * Math.abs(lowFit.slope)) {
      const mx = avg(low.map((p) => p.x));
      const my = avg(low.map((p) => p.y));
      if (Math.abs(s.line.y1 + ls * (mx - s.line.x1) - my) <= Math.max(1, 0.15 * my)) k++;
      else n.push('Your line should pass through the first three points (the straight part, before the core saturates).');
    } else if (s.line) n.push('Draw the line along the straight first part (the lowest three currents): at higher currents the curve bends over as the core saturates.');
    auto.push(score(crit('graph'), k, n));
  }

  // ---- results (4)
  const slope = num(s.answers.slope.value);
  const rt = num(s.answers.rturns.value);
  {
    const n: string[] = [];
    let k = 0;
    if (slope !== null && ((ls !== null && withinRel(slope, ls, 0.1)) || (lowFit && withinRel(slope, lowFit.slope, 0.1)))) k++;
    else n.push(slope === null ? 'Work out the initial slope (clips per ampere) from your line.' : `Your slope does not fit your own line or points${lowFit ? ` (about ${sf(lowFit.slope, 3)} clips per ampere)` : ''}.`);
    const lowI = iron30.map((x) => x.I0).sort((a, b) => a - b).slice(0, 3);
    const trueFit = lowI.length >= 2 ? phyFit(lowI.map((I) => ({ x: I, y: emClipsMean(v, 30, false, 'iron', I) }))) : null;
    if (trueFit && withinRel(slope, trueFit.slope, 0.25)) k++;
    else if (slope !== null) n.push(trueFit ? `Your slope is more than 25 % from the true initial slope here (about ${sf(trueFit.slope, 3)} clips per ampere).` : 'Lift at several currents first.');
    const pair = iron60.map((x) => ({ x, y: iron30.find((y) => Math.abs(y.I0 - x.I0) <= 0.06) })).find((p) => p.y);
    const own = pair ? (rc(pair.x.row, 'c') ?? 0) / Math.max(1e-9, rc(pair.y!.row, 'c') ?? 0) : null;
    if (rt !== null && own !== null && Number.isFinite(own) && withinRel(rt, own, 0.05)) k++;
    else n.push(!pair ? 'Compare 60 turns with 30 turns at the same current.' : rt === null ? 'Work out the ratio: clips with 60 turns ÷ clips with 30 turns, at the same current.' : `From your rows, ${rc(pair.x.row, 'c') ?? '—'} ÷ ${rc(pair.y!.row, 'c') ?? '—'} = ${own !== null && Number.isFinite(own) ? sf(own, 3) : '—'}.`);
    const trueRatio = pair ? emClipsMean(v, 60, false, 'iron', pair.x.I0) / Math.max(1e-9, emClipsMean(v, 30, false, 'iron', pair.x.I0)) : null;
    if (trueRatio !== null && withinRel(rt, trueRatio, 0.35)) k++;
    else if (rt !== null && trueRatio !== null) n.push(`Your ratio is more than 35 % from the true one at that current (about ${trueRatio.toFixed(2)}: a little under 2, as the core begins to saturate).`);
    auto.push(score(crit('calculations'), k, n));
  }

  // ---- units (1)
  {
    const un: string[] = [];
    let u = 1;
    if (!s.answers.slope.value.trim() && !s.answers.rturns.value.trim()) (u = 0), un.push('No answers to check the units of.');
    if (s.answers.slope.value.trim() && magUnit(s.answers.slope.unit) !== 'A-1') (u = 0), un.push('Give the slope its unit: clips per ampere (A⁻¹).');
    if (s.answers.rturns.value.trim() && !noUnit(s.answers.rturns)) (u = 0), un.push('A ratio of two counts has no unit.');
    auto.push(score(crit('units'), u, [...new Set(un)]));
  }

  const ai = [
    precaution(
      'State two precautions taken when investigating how the strength of an electromagnet depends on the current.',
      [
        ['same size', 'identical', 'same type'],
        ['key opened', 'open the key', 'switch off', 'briefly', 'heating', 'warm'],
        ['same direction', 'tightly', 'wound'],
        ['soft iron', 'soft-iron'],
        ['returned', 'pile', 'remove the clips', 'fresh'],
        ['repeat', 'repeated', 'average', 'mean'],
        ['constant current', 'ammeter', 'rheostat'],
      ],
      s.written.precautions,
    ),
  ];
  const I1 = 1.0;
  const solution = [
    `The core's strength grows with the ampere-turns NI and levels off as the iron saturates: here clips ≈ ${v.clipA.toFixed(1)} × tanh(NI ÷ ${v.clipNIs.toFixed(0)}).`,
    `With 30 turns: 0.5 A → ${emClipsMean(v, 30, false, 'iron', 0.5).toFixed(1)}, 1.0 A → ${emClipsMean(v, 30, false, 'iron', 1).toFixed(1)}, 1.5 A → ${emClipsMean(v, 30, false, 'iron', 1.5).toFixed(1)}, 2.0 A → ${emClipsMean(v, 30, false, 'iron', 2).toFixed(1)} clips on average (each lift varies by about one clip: clips cling to each other).`,
    `Initial slope ≈ ${(emClipsMean(v, 30, false, 'iron', 1.5) - emClipsMean(v, 30, false, 'iron', 0.5)).toFixed(1)} clips per ampere; 60 turns at ${I1.toFixed(1)} A hold ${emClipsMean(v, 60, false, 'iron', I1).toFixed(1)} — nearly twice as many.`,
    'Without the core the coil alone holds no clips; a steel core keeps some after the current is switched off, soft iron almost none.',
  ];
  const facts = [
    `Task: strength of an electromagnet; ${plural(lifts.length, 'lift')} in ${plural(settings.length, 'setting')} (30 turns iron ${iron30.length}, 60 turns ${iron60.length}, no core ${none.length}); max heat ${Math.max(0, ...lifts.map((l) => l.heat))}.`,
    `Student's slope ${s.answers.slope.value || '—'} ${s.answers.slope.unit}; ratio 60:30 ${s.answers.rturns.value || '—'}.`,
  ];
  return { auto, ai, solution, facts };
}

// ================================================================== INDUCTION

/** A direction as written: +1 right, −1 left, 0 none (null: unreadable). */
export function dirOf(raw: string | undefined): number | null {
  const t = (raw ?? '').trim().toLowerCase();
  if (!t) return null;
  if (/^(r|right|\+|clockwise|cw|→)/.test(t)) return 1;
  if (/^(l|left|-|−|anticlockwise|anti-clockwise|acw|←)/.test(t)) return -1;
  if (/^(0|none|no|nil|zero|no deflection|—|-)$/.test(t)) return 0;
  return null;
}

function gradeInduction(s: PhyMagnetismState, v: PhyMagnetismVariant): Part {
  const auto: CriterionScore[] = [];
  const moves = s.moves.map((m, k) => ({ ...m, k, d: indShown(indDeflection(v, k, m)), row: s.rows.find((r) => r.key === k) }));
  type Mv = (typeof moves)[number];
  const base = (m: IndMove) => m.coil === 200 && m.pole === 'N' && m.magnets === 1;

  // ---- care (2)
  {
    const n: string[] = [];
    let k = 0;
    if (moves.length && moves.every((m) => m.axis)) k++;
    else if (!moves.length) n.push('The magnet was never moved.');
    else n.push('Move the magnet straight along the axis of the coil: from the side, less of its flux threads the turns and the swing is smaller and erratic.');
    if (moves.length && moves.every((m) => m.galvoFar)) k++;
    else if (moves.length) n.push('Stand the galvanometer well away from the magnet: close to it, the magnet pulls the needle directly, so it reads even when the magnet is still.');
    auto.push(score(crit('care'), k, n));
  }

  // ---- procedure (4)
  {
    const n: string[] = [];
    let k = 0;
    const b = moves.filter((m) => base(m) && m.speed === 'slow');
    if ((['in', 'still', 'out'] as const).every((kind) => b.some((m) => m.kind === kind))) k++;
    else n.push('With the 200-turn coil, push the N pole in slowly, hold it still inside, then pull it out — recording each.');
    if (moves.some((m) => base(m) && m.speed === 'fast' && m.kind !== 'still')) k++;
    else n.push('Repeat with a faster push (or pull).');
    if (moves.some((m) => m.pole === 'S' && m.kind !== 'still') && moves.some((m) => m.magnets === 2 && m.kind !== 'still')) k++;
    else n.push('Repeat with the S pole first, and with two magnets together.');
    if (moves.some((m) => m.coil === 600 && m.kind !== 'still')) k++;
    else n.push('Repeat with the coil of more turns (600).');
    auto.push(score(crit('procedure'), k, n));
  }

  // ---- readings (5)
  {
    const n: string[] = [];
    let k = 0;
    let good = 0;
    let all = 0;
    for (const m of moves) {
      if (!m.row) continue;
      all += 2;
      const want = Math.abs(m.d) < 0.75 ? 0 : Math.sign(m.d);
      if (dirOf(m.row.c.dir) === want) good++;
      if (withinAbs(rc(m.row, 'size'), Math.abs(m.d), 0.5)) good++;
    }
    k += prop3(good, all);
    if (!s.rows.length) n.push('There are no rows in your table.');
    else if (good < all) n.push(`${all - good} of your ${all} entries do not match the galvanometer: note which way the needle swings (left or right of the centre zero) and how far, to the nearest half division.`);
    if (moves.length && moves.every((m) => m.row && filled(m.row.c.dir) && filled(m.row.c.size))) k++;
    else n.push('Record the direction and the size of the deflection for every movement — including none (0) while the magnet is still.');
    if (s.rows.length && s.rows.every((r) => {
      const x = rc(r, 'size');
      return x !== null && decimalPlaces(r.c.size!) <= 1 && Math.abs(x * 2 - Math.round(x * 2)) < 1e-6;
    })) k++;
    else n.push('Read each swing to the nearest half division (e.g. 6.5).');
    auto.push(score(crit('readings'), k, n));
  }

  // ---- Lenz's law (2)
  const dir = (pred: (m: Mv) => boolean) => moves.filter((m) => pred(m) && m.row).map((m) => dirOf(m.row!.c.dir)).find((d) => d !== null && d !== 0) ?? null;
  {
    const n: string[] = [];
    let k = 0;
    const nIn = dir((m) => m.coil === 200 && m.pole === 'N' && m.kind === 'in');
    const nOut = dir((m) => m.coil === 200 && m.pole === 'N' && m.kind === 'out');
    const sIn = dir((m) => m.coil === 200 && m.pole === 'S' && m.kind === 'in');
    if (nIn !== null && nOut !== null && sIn !== null && nIn !== nOut && sIn !== nIn) k++;
    else n.push('Your directions should show that the deflection reverses when the magnet is pulled out instead of pushed in, and when the S pole is used instead of the N pole (Lenz’s law).');
    if (/^\s*(n|north)/i.test(s.answers.lenz.value)) k++;
    else n.push('As an N pole approaches, the induced current makes that face of the coil an N pole, so it repels the magnet and opposes the change (Lenz’s law).');
    auto.push(score(crit('graph'), k, n));
  }

  // ---- results (4)
  const E = indCardEmf(v);
  const emf = num(s.answers.emf.value);
  const emf2 = num(s.answers.emf2.value);
  const rs = num(s.answers.rspeed.value);
  const rt = num(s.answers.rturns.value);
  const size = (pred: (m: Mv) => boolean) => {
    const xs = moves.filter((m) => pred(m) && m.row && m.kind !== 'still').map((m) => rc(m.row, 'size')).filter((x): x is number => x !== null);
    return xs.length ? avg(xs) : null;
  };
  {
    const n: string[] = [];
    let k = 0;
    if (withinRel(emf, E, 0.02)) k++;
    else n.push(emf === null ? 'Work out E = NΔΦ/Δt from the card.' : `E = NΔΦ/Δt = ${200} × ${(v.cardPhi * 1e4).toFixed(1)} × 10⁻⁴ ÷ ${v.cardDt.toFixed(2)} = ${sf(E, 3)} V.`);
    if (withinRel(emf2, 2 * E, 0.02)) k++;
    else n.push(emf2 === null ? 'Work out E when the magnet moves twice as fast (Δt halved).' : `Twice as fast halves Δt, so E doubles: ${sf(2 * E, 3)} V.`);
    const slow = size((m) => base(m) && m.speed === 'slow' && m.kind === 'in');
    const fast = size((m) => base(m) && m.speed === 'fast' && m.kind === 'in') ?? size((m) => base(m) && m.speed === 'fast');
    const slow2 = slow ?? size((m) => base(m) && m.speed === 'slow');
    if (rs !== null && slow2 && fast !== null && withinRel(rs, fast / slow2, 0.05)) k++;
    else n.push(!fast || !slow2 ? 'Push the N pole in slowly and quickly (200 turns, one magnet) to compare.' : rs === null ? 'Work out the ratio: fast swing ÷ slow swing.' : `From your table, ${sf(fast, 3)} ÷ ${sf(slow2, 3)} = ${sf(fast / slow2, 3)}.`);
    const m600 = moves.find((m) => m.coil === 600 && m.kind !== 'still' && m.row && rc(m.row, 'size') !== null);
    const same = m600 ? size((m) => m.coil === 200 && m.pole === m600.pole && m.magnets === m600.magnets && m.speed === m600.speed && m.kind === m600.kind) : null;
    const big = m600 ? size((m) => m.coil === 600 && m.pole === m600.pole && m.magnets === m600.magnets && m.speed === m600.speed && m.kind === m600.kind) : null;
    if (rt !== null && big !== null && same && withinRel(rt, big / same, 0.05)) k++;
    else n.push(!m600 || !same ? 'Compare the 600-turn coil with the 200-turn coil for the same movement.' : rt === null ? 'Work out the ratio: swing with 600 turns ÷ swing with 200 turns.' : `From your table, ${sf(big!, 3)} ÷ ${sf(same, 3)} = ${sf(big! / same, 3)}.`);
    auto.push(score(crit('calculations'), k, n));
  }

  // ---- units (1)
  {
    const un: string[] = [];
    let u = 1;
    if (!s.answers.emf.value.trim() && !s.answers.emf2.value.trim()) (u = 0), un.push('No answers to check the units of.');
    for (const [a, l] of [
      [s.answers.emf, 'E'],
      [s.answers.emf2, 'E at twice the speed'],
    ] as const)
      if (a.value.trim() && magUnit(a.unit) !== 'V') (u = 0), un.push(`Give ${l} its unit: V.`);
    for (const a of [s.answers.rspeed, s.answers.rturns]) if (a.value.trim() && !noUnit(a)) (u = 0), un.push('A ratio of two deflections has no unit.');
    auto.push(score(crit('units'), u, [...new Set(un)]));
  }

  const ai = [
    precaution(
      'State two precautions taken when investigating electromagnetic induction with a coil, a magnet and a galvanometer.',
      [
        ['firm', 'tight', 'connections', 'connected firmly'],
        ['axis', 'along the axis', 'straight'],
        ['away from the magnet', 'galvanometer away', 'far from'],
        ['same speed', 'steady', 'uniform speed'],
        ['settle', 'zero', 'rest'],
        ['repeat', 'repeated'],
        ['drop', 'dropped'],
      ],
      s.written.precautions,
    ),
  ];
  const solution = [
    'The needle moves only while the magnet moves: a changing flux linkage induces an e.m.f. (Faraday); held still inside the coil, nothing.',
    `Here the N pole pushed in slowly swings it about ${indShown(v.indK * v.indSign).toFixed(0)} divisions ${v.indSign > 0 ? 'right' : 'left'}; pulling it out, or using the S pole, reverses the swing (Lenz: the current opposes the change).`,
    `Faster (about ${v.indFast.toFixed(1)} ×), two magnets (about ${v.indTwo.toFixed(1)} ×) and more turns give bigger swings; 600 turns give a little under 3 × the 200-turn swing because the extra wire adds resistance.`,
    `The card: E = NΔΦ/Δt = 200 × ${(v.cardPhi * 1e4).toFixed(1)} × 10⁻⁴ ÷ ${v.cardDt.toFixed(2)} = ${sf(E, 3)} V; twice as fast, ${sf(2 * E, 3)} V.`,
  ];
  const facts = [
    `Task: electromagnetic induction; ${plural(moves.length, 'movement')}; along the axis ${moves.filter((m) => m.axis).length}, galvanometer away ${moves.filter((m) => m.galvoFar).length}; card E ${sf(E, 3)} V.`,
    `Student's E ${s.answers.emf.value || '—'} ${s.answers.emf.unit}; twice as fast ${s.answers.emf2.value || '—'}; ratios ${s.answers.rspeed.value || '—'} (speed), ${s.answers.rturns.value || '—'} (turns); Lenz face ${s.answers.lenz.value || '—'}.`,
  ];
  return { auto, ai, solution, facts };
}

// ================================================================== DIODE

function gradeDiode(s: PhyMagnetismState, v: PhyMagnetismVariant): Part {
  const auto: CriterionScore[] = [];
  const reads = s.reads.map((r, k) => ({ ...r, k, ...diodeReading(v, r), row: s.rows.find((x) => x.key === k) }));
  const fwd = reads.filter((r) => r.bias === 'fwd');
  const rev = reads.filter((r) => r.bias === 'rev');

  // ---- care (2)
  {
    const n: string[] = [];
    let k = 0;
    if (reads.length && reads.every((r) => r.resistor)) k++;
    else if (!reads.length) n.push('No readings were taken.');
    else n.push('Keep the protective resistor in the circuit for every reading: without it a forward-biased diode draws a damaging current.');
    if (fwd.length && fwd.every((r) => r.vm === 'diode')) k++;
    else if (fwd.length) n.push('Connect the voltmeter across the diode alone: across the diode and the resistor it adds the p.d. across the resistor.');
    auto.push(score(crit('care'), k, n));
  }

  // ---- procedure (4)
  {
    const n: string[] = [];
    let k = 0;
    if (fwd.length >= 8) k++;
    else n.push(`Take at least eight forward readings (you took ${fwd.length}).`);
    if (fwd.filter((r) => r.V !== null && r.V >= 0.55 && r.V <= 0.75).length >= 3) k++;
    else n.push('Near the knee take small steps (0.05 V) between 0.55 V and 0.75 V: that is where the current rises steeply.');
    if (rev.length >= 3 && rev.some((r) => (r.V ?? 0) >= 3 - 1e-9)) k++;
    else n.push('Reverse the diode and take at least three readings, up to 3 V or more.');
    if (reads.length && reads.every((r) => r.heat === 0)) k++;
    else if (reads.length) n.push('Open the key between readings: left closed, the diode warms and its p.d. falls (about 2 mV per kelvin), so the curve shifts.');
    auto.push(score(crit('procedure'), k, n));
  }

  // ---- readings (5)
  const pts: XY[] = [];
  {
    const n: string[] = [];
    let k = 0;
    let good = 0;
    let all = 0;
    for (const r of reads) {
      if (!r.row) continue;
      all += 2;
      const V = rc(r.row, 'V');
      const I = rc(r.row, 'I');
      const tolV = r.range === 1 ? 0.015 : 0.15;
      if (V !== null && r.V !== null && withinAbs(Math.abs(V), r.V, tolV)) good++;
      if (I !== null && r.mA !== null && withinAbs(Math.abs(I), Math.abs(r.mA), 0.6)) good++;
    }
    k += prop3(good, all);
    if (!s.rows.length) n.push('There are no rows in your table.');
    else if (good < all) n.push(`${all - good} of your ${all} readings do not match the meters: read the voltmeter to half a division (0.01 V on the 1 V range) and the milliammeter to 0.5 mA.`);
    const rowsOk = reads.filter((r) => r.row);
    if (rowsOk.length && rowsOk.every((r) => filled(r.row!.c.V) && filled(r.row!.c.I) && decimalPlaces(r.row!.c.V!) >= (r.range === 1 ? 2 : 1) && decimalPlaces(r.row!.c.I!) >= 1)) k++;
    else n.push('Record the p.d. to 0.01 V (0.1 V on the 10 V range) and the current to 0.5 mA (one decimal place).');
    const revRows = rev.filter((r) => r.row);
    if (revRows.length && revRows.every((r) => (rc(r.row, 'V') ?? 0) < 0)) k++;
    else n.push('Write the reverse-bias p.d.s as negative values, so the reverse characteristic plots to the left of the origin.');
    auto.push(score(crit('readings'), k, n));
    for (const r of reads) {
      const V = rc(r.row, 'V');
      const I = rc(r.row, 'I');
      if (V !== null && I !== null) pts.push({ x: V, y: I });
    }
  }

  // ---- graph (2)
  const fpts = pts.filter((p) => p.x > 0);
  const Imax = Math.max(0, ...fpts.map((p) => p.y));
  const steep = fpts.filter((p) => p.y >= 0.3 * Imax && p.y > 2);
  const steepFit = steep.length >= 2 ? phyFit(steep) : null;
  const ls = phyLineSlope(s.line);
  const lineOk = (() => {
    if (!s.line || ls === null || !steepFit || ls <= 0) return false;
    const mx = avg(steep.map((p) => p.x));
    const my = avg(steep.map((p) => p.y));
    return Math.abs(ls - steepFit.slope) <= 0.25 * steepFit.slope && Math.abs(s.line.y1 + ls * (mx - s.line.x1) - my) <= Math.max(1.5, 0.12 * my);
  })();
  {
    const n: string[] = [];
    let k = 0;
    if (fpts.length >= 8 && pts.filter((p) => p.x < 0).length >= 3) k++;
    else n.push('Plot the forward and the reverse readings on the same axes (reverse p.d.s negative).');
    if (lineOk) k++;
    else n.push(s.line ? 'Draw your tangent along the steep, straight part of the curve above the knee.' : 'Draw a straight line (the tangent) along the steep part of the forward curve.');
    auto.push(score(crit('graph'), k, n));
  }

  // ---- results (4)
  const knee = num(s.answers.knee.value);
  const rdyn = num(s.answers.rdyn.value);
  const rstat = num(s.answers.rstat.value);
  {
    const n: string[] = [];
    let k = 0;
    const own = s.line && ls ? s.line.x1 - s.line.y1 / ls : steepFit ? -steepFit.intercept / steepFit.slope : null;
    if (knee !== null && own !== null && withinAbs(knee, own, 0.012)) k++;
    else n.push(knee === null ? 'Read the knee voltage where your tangent meets the V axis (I = 0).' : own !== null ? `Your tangent meets the V axis at ${own.toFixed(2)} V.` : 'Draw the tangent first.');
    const Im = (s.line ? (s.line.y1 + s.line.y2) / 2 : steep.length ? avg(steep.map((p) => p.y)) : 20) / 1000;
    const trueKnee = diodeVd(v, Im) - Im * diodeRdyn(v, Im);
    if (knee !== null && withinAbs(knee, trueKnee, 0.04) && knee >= 0.5 && knee <= 0.75) k++;
    else if (knee !== null) n.push(`The true tangent there meets the axis at about ${trueKnee.toFixed(2)} V (a silicon diode turns on at about 0.6–0.7 V).`);
    const ownR = s.line && ls ? 1000 / ls : steepFit ? 1000 / steepFit.slope : null;
    if (rdyn !== null && ownR !== null && withinRel(rdyn, ownR, 0.05)) k++;
    else n.push(rdyn === null ? 'Work out the dynamic resistance ΔV ÷ ΔI from your tangent (I in A).' : ownR !== null ? (withinRel(rdyn, ownR / 1000, 0.05) ? 'Convert the current to amperes: ΔI in mA ÷ 1000.' : `From your tangent, ΔV ÷ ΔI = ${sf(ownR, 3)} Ω.`) : 'Draw the tangent first.');
    const sOk = rstat !== null && fwd.some((r) => {
      const V = rc(r.row, 'V');
      const I = rc(r.row, 'I');
      return V !== null && I !== null && I >= 5 && withinRel(rstat, V / (I / 1000), 0.02);
    });
    if (sOk) k++;
    else n.push(rstat === null ? 'Work out the static resistance V ÷ I at one of your readings on the steep part (I in A).' : 'Your static resistance does not match V ÷ I for any of your readings above 5 mA.');
    auto.push(score(crit('calculations'), k, n));
  }

  // ---- units (1)
  {
    const un: string[] = [];
    let u = 1;
    if (!s.answers.knee.value.trim() && !s.answers.rdyn.value.trim()) (u = 0), un.push('No answers to check the units of.');
    if (s.answers.knee.value.trim() && magUnit(s.answers.knee.unit) !== 'V') (u = 0), un.push('Give the knee voltage its unit: V.');
    for (const a of [s.answers.rdyn, s.answers.rstat]) if (a.value.trim() && magUnit(a.unit) !== 'ohm') (u = 0), un.push('Give the resistances their unit: Ω.');
    auto.push(score(crit('units'), u, [...new Set(un)]));
  }

  const ai = [
    precaution(
      'State two precautions taken when obtaining the I–V characteristic of a junction diode.',
      [
        ['protective resistor', 'resistor', 'limit the current'],
        ['small steps', 'small intervals', 'near the knee', 'small increments'],
        ['key', 'switch off', 'opened between', 'heating', 'warm'],
        ['across the diode', 'voltmeter across'],
        ['parallax', 'eye level', 'perpendicular'],
        ['rated', 'do not exceed', 'maximum current'],
        ['zero', 'zero error'],
      ],
      s.written.precautions,
    ),
  ];
  const vd = (mA: number) => diodeVd(v, mA / 1000).toFixed(3);
  const Iref = 0.02;
  const solution = [
    `This diode: I = Is(e^(V/nV_T) − 1) with n ≈ ${v.dN.toFixed(2)} and a small series resistance ${v.dRs.toFixed(1)} Ω; below about 0.5 V almost no current flows.`,
    `It passes 1 mA at ${vd(1)} V, 10 mA at ${vd(10)} V and 25 mA at ${vd(25)} V: the steep rise is the "knee".`,
    `A tangent at 20 mA meets the V axis at about ${(diodeVd(v, Iref) - Iref * diodeRdyn(v, Iref)).toFixed(2)} V (the turn-on voltage); its slope gives a dynamic resistance of about ${diodeRdyn(v, Iref).toFixed(1)} Ω there, while the static resistance V/I at 20 mA is ${(diodeVd(v, Iref) / Iref).toFixed(0)} Ω.`,
    'In reverse bias the current is far below what the milliammeter can show: practically zero. The protective resistor limits the forward current.',
  ];
  const facts = [
    `Task: diode characteristic; ${plural(fwd.length, 'forward reading')}, ${plural(rev.length, 'reverse reading')}; without resistor ${reads.filter((r) => !r.resistor).length}, voltmeter across both ${reads.filter((r) => r.vm !== 'diode').length}, warm ${reads.filter((r) => r.heat > 0).length}; burnt ${s.burnt ? 'yes' : 'no'}.`,
    `Student's knee ${s.answers.knee.value || '—'} ${s.answers.knee.unit}; r_dyn ${s.answers.rdyn.value || '—'} ${s.answers.rdyn.unit}; r_static ${s.answers.rstat.value || '—'} ${s.answers.rstat.unit}.`,
  ];
  return { auto, ai, solution, facts };
}

/**
 * Marks the magnetism lab (field lines and neutral points, the
 * electromagnet, induction, the diode): the care taken (the meridian and no
 * steel, a tapped small compass; a soft-iron core and the key opened; the
 * magnet along the axis and the galvanometer away; the protective resistor
 * and the voltmeter across the diode), the procedure, every reading against
 * what the instrument or the sheet really showed, the drawing, graph or
 * Lenz's-law directions, the results against the truth, and units. The
 * precautions go to AI.
 */
export const phyMagnetismGrader: SimulatorGrader<'phy-magnetism'> = {
  id: 'phy-magnetism',
  grade(state: PhyMagnetismState, seed: number): GraderOutput {
    const v = phyMagnetismVariant(seed);
    const task: MagTask = state.task ?? 'FIELD';
    const part = task === 'ELECTROMAGNET' ? gradeElectromagnet(state, v) : task === 'INDUCTION' ? gradeInduction(state, v) : task === 'DIODE' ? gradeDiode(state, v) : gradeField(state, v);
    const order = PHY_MAGNETISM.rubric.filter((c) => c.how === 'AUTO').map((c) => c.id);
    part.auto.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    return part;
  },
};
