import {
  CHEM_RATES,
  RATES_CROSS_MADE_UP,
  RATES_INTERVAL,
  RATES_MG_AR,
  RATES_MG_CONCS,
  RATES_VM,
  RATES_X_EARLY,
  RATES_X_LATE,
  chemRatesVariant,
  phyFit,
  phyLineSlope,
  ratesCrossIdealTime,
  ratesCrossTrueLine,
  ratesCrossX,
  ratesFactor10,
  ratesMgEnd,
  ratesMgInitialRate,
  ratesMgSyringe,
  ratesMgTheory,
  type ChemRatesState,
  type ChemRatesVariant,
  type CriterionScore,
  type PhyGraphLine,
  type RatesMgRun,
} from '@aischool/shared';
import { decimalPlaces, parseNumber, score, sf, sigFigs, withinAbs, withinRel } from './helpers';
import { gradeGraph, slopeAccepted, type XY } from './phy-common';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

/** A syringe reading matches within this (cm³: the scale reads to 1 cm³, judged to 0.5). */
const VOL_TOL = 0.6;
/** A reading is "on time" within this of its 30 s mark (s). */
const ON_TIME = 3;
/** The bung went in "at once" / the watch started "with" the magnesium (s). */
const BUNG_TOL = 3;
const WATCH_TOL = 2;
/** A written time matches the stopwatch within this (s); a thermometer reading within this (°C). */
const TIME_TOL = 0.3;
const TEMP_TOL = 1;
const crit = (id: string) => CHEM_RATES.rubric.find((c) => c.id === id)!;

const SUP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+' };
/** A rates unit as written → 'cm3/s', 'cm3/min', 'cm3', 's', 'min', '/s/cm3', '/s', 'none', '' or 'other:…'. */
export function ratesUnit(raw: string | null | undefined): string {
  const s = (raw ?? '')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]/g, (c) => SUP[c]!)
    .replace(/[−–—]/g, '-')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\^/g, '')
    .replace(/[()·.*×]/g, '')
    .replace(/seconds?|secs?/g, 's')
    .replace(/minutes?|mins?/g, 'min')
    .replace(/ml|cc/g, 'cm3')
    .replace(/per/g, '/');
  if (!s) return '';
  if (/^(nounits?|none|nil|n\/a|-+|unitless|dimensionless|hasnounit)$/.test(s)) return 'none';
  const table: [RegExp, string][] = [
    [/^(cm3\/s|cm3s-1|cm3\/sec)$/, 'cm3/s'],
    [/^(cm3\/min|cm3min-1)$/, 'cm3/min'],
    [/^cm3$/, 'cm3'],
    [/^s$/, 's'],
    [/^min$/, 'min'],
    [/^(s-1cm-3|cm-3s-1|\/s\/cm3|s-1\/cm3|1\/scm3|1\/cm3s|\/cm3\/s|\/scm3|\/cm3s|1\/s\/cm3)$/, '/s/cm3'],
    [/^(s-1|\/s|1\/s)$/, '/s'],
  ];
  for (const [re, u] of table) if (re.test(s)) return u;
  return `other:${s}`;
}

/**
 * Marks rates of reaction. Magnesium and HCl: the setting up (cleaned ribbon,
 * syringe at zero and airtight, bung in at once), the readings every 30 s
 * against the simulated syringe, both runs, the V–t curves, the tangent at
 * t = 0, the initial rates and the theoretical volume. The disappearing
 * cross: constant total volume and acid, the cross judged looking down, the
 * stopwatch and thermometer against the simulation, 1/t, the line of 1/t
 * against the volume of thiosulphate, its slope, a time read from it and the
 * effect of a 10 °C rise. The explanation and the precautions go to AI.
 */
export const chemRatesGrader: SimulatorGrader<'chem-rates'> = {
  id: 'chem-rates',
  grade(state: ChemRatesState, seed: number): GraderOutput {
    const v = chemRatesVariant(seed);
    return state.task === 'CROSS' ? gradeCross(state, v) : gradeMg(state, v);
  },
};

// ------------------------------------------------------------------ magnesium and HCl

/** The syringe reading of one recorded reading. */
const readingTrue = (v: ChemRatesVariant, run: RatesMgRun, at: number) => ratesMgSyringe(v, run, at + (run.watchLag ?? 0));
const slotOf = (at: number) => Math.round(at / RATES_INTERVAL) * RATES_INTERVAL;
const lineAt = (l: PhyGraphLine, x: number) => {
  const m = phyLineSlope(l);
  return m === null ? null : l.y1 + m * (x - l.x1);
};
/** A rate as written → cm³ s⁻¹ (per minute converted). */
const rateOf = (a: { value: string; unit: string }) => {
  const x = parseNumber(a.value);
  if (x === null) return null;
  return ratesUnit(a.unit) === 'cm3/min' ? x / 60 : x;
};

function gradeMg(state: ChemRatesState, v: ChemRatesVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const runs = state.mgRuns.map((r, i) => ({ r, i })).filter((x): x is { r: RatesMgRun; i: number } => !!x.r);
  const dropped = runs.filter((x) => x.r.dropped);
  const reads = (i: number) => state.readings.filter((e) => e.run === i);
  const col = (i: number) => (i === 0 ? 'v1' : 'v2') as 'v1' | 'v2';
  const pointsOf = (i: number): XY[] =>
    state.mg
      .map((row, k) => ({ x: parseNumber(row.t) ?? state.mgRows[k] ?? null, y: parseNumber(row[col(i)]) }))
      .filter((p): p is XY => p.x !== null && p.y !== null);

  // ---- setup (3)
  {
    const n: string[] = [];
    let k = 0;
    if (!runs.length) n.push('No run was set up.');
    else {
      if (runs.every((x) => x.r.cleaned)) k++;
      else n.push('Clean the magnesium ribbon with sandpaper first: the dull oxide layer on it slows the start of the reaction.');
      if (runs.every((x) => x.r.start === 0 && x.r.checked)) k++;
      else n.push(runs.some((x) => x.r.start !== 0) ? 'Push the syringe plunger fully in (to 0 cm³) before each run, or every reading is off by the air left in it.' : 'Check the apparatus is airtight before each run: pull the plunger out a little and see it spring back.');
      if (dropped.length && dropped.every((x) => x.r.bungLag !== null && x.r.bungLag <= BUNG_TOL)) k++;
      else n.push('Replace the bung at once after dropping the magnesium in: hydrogen made before the bung is in escapes and is never measured.');
    }
    auto.push(score(crit('setup'), k, n));
  }

  // ---- procedure (4)
  {
    const n: string[] = [];
    let k = 0;
    if (!dropped.length) n.push('No magnesium was reacted.');
    else {
      if (dropped.every((x) => x.r.watchLag !== null && Math.abs(x.r.watchLag) <= WATCH_TOL)) k++;
      else n.push('Start the stopwatch as the magnesium goes into the acid: t = 0 is the start of the reaction.');
      const regular = dropped.every((x) => {
        const slots = new Set(reads(x.i).map((e) => slotOf(e.at) / RATES_INTERVAL));
        const top = Math.max(0, ...slots);
        if (top < 4) return false;
        for (let s = 1; s <= top; s++) if (!slots.has(s)) return false;
        return true;
      });
      if (regular) k++;
      else n.push('Read the syringe every 30 s from the start, without gaps (at least four readings).');
      const toEnd = dropped.every((x) => x.r.done && reads(x.i).some((e) => e.at + (x.r.watchLag ?? 0) >= ratesMgEnd(v, x.r.conc, x.r.cleaned)));
      if (toEnd) k++;
      else n.push('Keep reading until no more gas is produced (the volume stays the same for two readings): the final volume shows all the magnesium has reacted.');
      const r1 = state.mgRuns[0];
      const r2 = state.mgRuns[1];
      if (r1 && r2 && r1.dropped && r2.dropped && r2.done && Math.abs(r1.conc - RATES_MG_CONCS[0]) < 0.01 && Math.abs(r2.conc - RATES_MG_CONCS[1]) < 0.01 && r1.weighed && r2.weighed) k++;
      else n.push(!r2?.dropped ? 'Repeat with 0.50 mol dm⁻³ acid (run 2) to see the effect of concentration.' : 'Run 1 with 1.0 mol dm⁻³ and run 2 with 0.50 mol dm⁻³ acid, each with a fresh, weighed piece of magnesium: change only the concentration.');
    }
    auto.push(score(crit('procedure'), k, n));
  }

  // ---- table of results (5)
  {
    const n: string[] = [];
    let k = 0;
    const tests: boolean[] = [];
    let cells = 0;
    for (const [k2, slot] of state.mgRows.entries()) {
      const row = state.mg[k2];
      for (const x of dropped) {
        const typed = parseNumber(row?.[col(x.i)]);
        const ev = [...reads(x.i)].reverse().find((e) => slotOf(e.at) === slot);
        if (!ev) {
          // t = 0: nothing has come off yet (no reading needed); any other volume needs a reading.
          if (typed !== null && !(slot === 0 && typed === 0)) tests.push(false);
          continue;
        }
        if (typed === null) continue;
        cells++;
        const shown = readingTrue(v, x.r, ev.at);
        tests.push(withinAbs(typed, shown, VOL_TOL) || withinAbs(typed, shown - x.r.start, VOL_TOL));
      }
    }
    if (!tests.length) n.push('There are no syringe readings in the table to mark.');
    else {
      const good = tests.filter(Boolean).length;
      if (good === tests.length) k += 2;
      else if (good >= tests.length / 2) {
        k++;
        n.push(`${tests.length - good} volume${tests.length - good === 1 ? '' : 's'} did not match the syringe: read the scale at the inner end of the plunger, at eye level.`);
      } else n.push('Most volumes did not match the syringe: read where the plunger’s inner end is on the scale, at eye level, and write it at once.');
      const allReads = dropped.flatMap((x) => reads(x.i));
      if (allReads.length && allReads.every((e) => Math.abs(e.at - slotOf(e.at)) <= ON_TIME)) k++;
      else n.push('Take each reading as the stopwatch reaches the 30 s mark, not some seconds later.');
      const tOk = state.mgRows.length > 0 && state.mg.every((row, i) => withinAbs(parseNumber(row.t), state.mgRows[i]!, 0.01));
      if (tOk) k++;
      else n.push('Write the time of each reading in the t column: 0, 30, 60, 90 … s (equal intervals).');
      const vcells = state.mg.flatMap((r) => [r.v1, r.v2]).filter((c) => c.trim());
      if (cells && vcells.every((c) => decimalPlaces(c) <= 1 && Number.isInteger(Math.round((parseNumber(c) ?? 0.3) * 2 * 1000) / 1000))) k++;
      else n.push('The syringe reads to 1 cm³: record volumes to the nearest 0.5 or 1 cm³ (e.g. 23 or 23.5), not to many decimals.');
    }
    auto.push(score(crit('readings'), k, n));
  }

  // ---- graph (3)
  const pa = pointsOf(0);
  const pb = pointsOf(1);
  const hasB = !!state.mgRuns[1]?.dropped;
  const tangentOk = (line: PhyGraphLine | null, pts: XY[]) => {
    if (!line) return false;
    const m = phyLineSlope(line);
    const first = pts.filter((p) => p.x > 0).sort((a, b) => a.x - b.x)[0];
    const y0 = lineAt(line, 0);
    if (m === null || !first || y0 === null) return false;
    const chord = first.y / first.x;
    const vmax = Math.max(...pts.map((p) => p.y));
    return m >= chord * 0.98 && m <= chord * 1.8 && Math.abs(y0) <= Math.max(2, 0.06 * vmax);
  };
  {
    const n: string[] = [];
    let k = 0;
    if (pa.length >= 5 && (!hasB || pb.length >= 5)) k++;
    else n.push('Plot V against t for every reading of both runs (at least five points each).');
    if (state.curves.a === 'SMOOTH' && (!hasB || state.curves.b === 'SMOOTH')) k++;
    else n.push(state.curves.a === 'STRAIGHT' || state.curves.b === 'STRAIGHT' ? 'The points lie on a curve: join them with a smooth curve, not a straight line.' : 'Draw a smooth curve through each run’s points.');
    if (tangentOk(state.tangents.a, pa)) k++;
    else n.push(state.tangents.a ? 'Your tangent at t = 0 does not touch the curve: it should start at the origin and run along the curve’s first, steepest part (steeper than the line to your first point).' : 'Draw the tangent to the run 1 curve at t = 0.');
    auto.push(score(crit('graph'), k, n));
  }

  // ---- calculations (4)
  const rA = rateOf(state.answers.rateA);
  const rB = rateOf(state.answers.rateB);
  const trueA = ratesMgInitialRate(v, RATES_MG_CONCS[0]);
  const trueB = ratesMgInitialRate(v, RATES_MG_CONCS[1]);
  const theory = ratesMgTheory(v);
  {
    const n: string[] = [];
    let k = 0;
    const sA = phyLineSlope(state.tangents.a);
    if (rA !== null && sA !== null && withinRel(rA, sA, 0.05)) k++;
    else n.push(sA === null ? 'Draw the tangent at t = 0 and work out its gradient: ΔV ÷ Δt from two points far apart on it.' : `The initial rate is the gradient of your tangent: ${sf(sA, 3)} cm³ s⁻¹ from the line you drew.`);
    if (withinRel(rA, trueA, 0.2)) k++;
    else if (rA !== null) n.push(`Your initial rate for run 1 is more than 20 % from the true rate (about ${sf(trueA, 2)} cm³ s⁻¹): the tangent should follow the first, steepest part of the curve.`);
    const sB = phyLineSlope(state.tangents.b);
    if (rB !== null && ((sB !== null && withinRel(rB, sB, 0.05)) || withinRel(rB, trueB, 0.25))) k++;
    else n.push(rB === null ? 'Work out the initial rate of run 2 from a tangent at t = 0 on its curve.' : `Your initial rate for run 2 does not fit a tangent at t = 0 (about ${sf(trueB, 2)} cm³ s⁻¹).`);
    const vt = parseNumber(state.answers.vTheory.value);
    if (withinRel(vt, theory, 0.01) || withinRel(vt, (v.mgMass / 24.3) * RATES_VM, 0.01)) k++;
    else n.push(`Theoretical volume: Mg + 2HCl → MgCl₂ + H₂, so moles H₂ = moles Mg = ${v.mgMass.toFixed(3)} ÷ ${RATES_MG_AR} = ${(v.mgMass / RATES_MG_AR).toFixed(5)} mol → × 24 000 = ${sf(theory, 3)} cm³.`);
    auto.push(score(crit('calculations'), k, n));
  }

  // ---- units (1)
  {
    const un: string[] = [];
    let u = 1;
    const given = [state.answers.rateA, state.answers.rateB, state.answers.vTheory].filter((a) => a.value.trim());
    if (!given.length) (u = 0), un.push('No answers to check the units of.');
    for (const a of [state.answers.rateA, state.answers.rateB]) if (a.value.trim() && !['cm3/s', 'cm3/min'].includes(ratesUnit(a.unit))) (u = 0), un.push('A rate is a volume per unit time: cm³ s⁻¹.');
    if (state.answers.vTheory.value.trim() && ratesUnit(state.answers.vTheory.unit) !== 'cm3') (u = 0), un.push('Give the volume of hydrogen in cm³.');
    auto.push(score(crit('units'), u, [...new Set(un)]));
  }

  const ai: AiItem[] = [
    {
      criterionId: 'explanation',
      question: 'Explain the shape of your graph of the volume of hydrogen against time, and the effect of using 0.50 mol dm⁻³ instead of 1.0 mol dm⁻³ acid.',
      answer: state.written.explanation.trim(),
      guide: `2 marks: one for the shape (fastest at the start; slows as the magnesium/acid is used up; levels off when the magnesium is used up), one for the effect of concentration (more concentrated acid: more frequent collisions, a higher initial rate; the same final volume because the magnesium is the limiting reactant). ${crit('explanation').guide}`,
      keywords: [
        ['used up', 'runs out', 'run out', 'exhausted', 'limiting', 'less magnesium', 'decreases as'],
        ['collision', 'collide', 'more particles', 'crowded'],
        ['levels off', 'level off', 'constant', 'stops', 'no more gas', 'flat'],
        ['same final', 'same volume', 'same amount'],
      ],
      need: 2,
    },
    precautionsItem(state, 'following the reaction of magnesium with dilute hydrochloric acid with a gas syringe', [
      ['bung', 'immediately', 'at once', 'quickly'],
      ['sandpaper', 'clean', 'oxide'],
      ['excess'],
      ['airtight', 'leak'],
      ['friction', 'free to move', 'stick'],
      ['eye level', 'parallax'],
      ['exact', 'on time', 'every 30', 'regular'],
    ]),
  ];
  const endA = ratesMgEnd(v, 1, true);
  const solution = [
    `Mg + 2HCl → MgCl₂ + H₂. Moles of Mg = ${v.mgMass.toFixed(3)} ÷ 24 = ${(v.mgMass / 24).toFixed(5)} mol, so the theoretical volume of H₂ = ${(v.mgMass / 24).toFixed(5)} × 24 000 = ${sf(theory, 3)} cm³ at r.t.p. (slightly more at this room's ${v.room.toFixed(0)} °C).`,
    `The acid is in excess (50 cm³ × 1.0 mol dm⁻³ = 0.050 mol HCl; only ${((2 * v.mgMass) / 24).toFixed(4)} mol is needed), so the magnesium is used up: with 1.0 mol dm⁻³ acid it was all gone after about ${Math.round(endA)} s.`,
    `The rate is greatest at the start and falls as the magnesium is used up; the curve levels off when no magnesium is left.`,
    `True initial rates (gradient of the tangent at t = 0): about ${sf(trueA, 2)} cm³ s⁻¹ with 1.0 mol dm⁻³ and ${sf(trueB, 2)} cm³ s⁻¹ with 0.50 mol dm⁻³ — halving the concentration makes the initial rate about ${(trueA / trueB).toFixed(1)} times smaller; the final volume is the same.`,
  ];
  const facts = [
    `Task: Mg + HCl (true mass ${v.mgTrue} g, tau ${v.tau} s, order ${v.order}); runs ${runs.map((x) => `${x.r.conc}M${x.r.cleaned ? '' : ' uncleaned'} bung ${x.r.bungLag ?? '—'}s watch ${x.r.watchLag ?? '—'}s`).join('; ') || '—'}; readings ${state.readings.length}.`,
    `Student's rates ${state.answers.rateA.value || '—'} / ${state.answers.rateB.value || '—'} ${state.answers.rateA.unit}; theoretical ${state.answers.vTheory.value || '—'} ${state.answers.vTheory.unit}.`,
  ];
  return { auto, ai, solution, facts };
}

// ------------------------------------------------------------------ the disappearing cross

function gradeCross(state: ChemRatesState, v: ChemRatesVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const all = state.crossRuns.map((r, i) => ({ r, i, row: state.cross[i] }));
  const done = all.filter((x) => x.r.done && x.r.elapsed !== null);
  const conc = done.filter((x) => x.r.kind === 'CONC');
  const temp = done.filter((x) => x.r.kind === 'TEMP');
  const xAt = (x: (typeof done)[number]) => ratesCrossX(v, x.r, x.r.elapsed! + (x.r.watchLag ?? 0));

  // ---- setup (3)
  {
    const n: string[] = [];
    let k = 0;
    if (!done.length) n.push('No run was timed.');
    else {
      if (done.every((x) => Math.abs(x.r.thio + x.r.water - RATES_CROSS_MADE_UP) < 0.01)) k++;
      else n.push('Make every mixture up to 50 cm³ with water: the depth of liquid you look through, and the concentration, must change only because of the thiosulphate.');
      if (done.every((x) => x.r.acid === done[0]!.r.acid)) k++;
      else n.push('Add the same volume of acid (5 cm³) in every run.');
      if (done.every((x) => x.r.rinsed)) k++;
      else n.push('Rinse the flask with water between runs: sulphur left in it makes the next mixture cloud sooner.');
    }
    auto.push(score(crit('setup'), k, n));
  }

  // ---- procedure (4)
  {
    const n: string[] = [];
    let k = 0;
    if (!done.length) n.push('No run was timed.');
    else {
      const vols = [...new Set(conc.map((x) => x.r.thio))];
      if (vols.length >= 5 && Math.min(...vols) <= 15 && Math.max(...vols) >= 45) k++;
      else n.push(`Time at least five different volumes of thiosulphate from 10 to 50 cm³ (you have ${vols.length}).`);
      if (done.every((x) => x.r.watchLag !== null && Math.abs(x.r.watchLag) <= WATCH_TOL && x.r.swirled)) k++;
      else n.push(done.some((x) => !x.r.swirled) ? 'Swirl the flask as soon as the acid goes in, so it mixes at once.' : 'Start the stopwatch as you add the acid.');
      const judged = done.filter((x) => x.r.top && xAt(x) >= RATES_X_EARLY && xAt(x) <= RATES_X_LATE).length;
      if (judged === done.length) k++;
      else n.push(done.some((x) => !x.r.top) ? 'Look down through the solution from above to watch the cross: from the side you cannot judge when it disappears.' : `${done.length - judged} time${done.length - judged === 1 ? ' was' : 's were'} stopped too early or too late: stop the watch just as the cross can no longer be seen.`);
      const temps = temp.map((x) => x.r.temp ?? ratesCrossTempOf(v, x.r));
      if (temp.length >= 3 && temp.every((x) => x.r.thio === temp[0]!.r.thio && x.r.water === temp[0]!.r.water) && Math.max(...temps) - Math.min(...temps) >= 20) k++;
      else n.push(temp.length < 3 ? `Repeat with the same mixture (10 cm³ thiosulphate + 40 cm³ water) at least at three temperatures (you have ${temp.length}).` : 'Use the same mixture at temperatures spread over at least 20 °C (about 30, 40, 50 and 60 °C).');
    }
    auto.push(score(crit('procedure'), k, n));
  }

  // ---- table of results (5)
  {
    const n: string[] = [];
    let k = 0;
    if (!done.length) n.push('There are no results to mark.');
    else {
      const good = done.filter((x) => withinAbs(parseNumber(x.row?.t), x.r.elapsed!, TIME_TOL)).length;
      if (good === done.length) k += 2;
      else if (good >= done.length / 2) {
        k++;
        n.push(`${done.length - good} time${done.length - good === 1 ? '' : 's'} did not match the stopwatch.`);
      } else n.push('Most times did not match the stopwatch: copy the reading when you stop it.');
      if (temp.length && temp.every((x) => x.r.temp !== null && x.r.tempAfter && withinAbs(parseNumber(x.row?.th), x.r.temp, TEMP_TOL))) k++;
      else n.push(!temp.length ? 'There are no temperature runs to mark.' : temp.some((x) => x.r.temp === null || !x.r.tempAfter) ? 'Read the thermometer in the mixture after adding the acid, and record that temperature.' : 'Some temperatures did not match the thermometer: read it at eye level to 1 °C.');
      const invOk = done.every((x) => {
        const t = parseNumber(x.row?.t);
        const inv = parseNumber(x.row?.inv);
        return t !== null && t > 0 && inv !== null && withinRel(inv, 1 / t, 0.02);
      });
      if (invOk) k++;
      else n.push('Work out 1/t for every run: e.g. t = 25 s gives 1/t = 1 ÷ 25 = 0.040 s⁻¹.');
      const cells = done.map((x) => (x.row?.inv ?? '').trim()).filter(Boolean);
      const sfOk = cells.length === done.length && cells.every((c) => {
        const n2 = sigFigs(c);
        return n2 === null ? parseNumber(c) !== null : n2 >= 2 && n2 <= 4;
      });
      if (sfOk) k++;
      else n.push('Give 1/t to 2 or 3 significant figures (e.g. 0.0400 or 4.00 × 10⁻²).');
    }
    auto.push(score(crit('readings'), k, n));
  }

  // ---- graph (3): 1/t (up) against the volume of thiosulphate (along)
  const points: XY[] = conc.map((x) => ({ x: parseNumber(x.row?.v), y: parseNumber(x.row?.inv) })).filter((p): p is XY => p.x !== null && p.y !== null && p.x > 0);
  const graph = gradeGraph(points, state.line, '1/t against the volume of thiosulphate');
  {
    const n: string[] = [];
    let k = 0;
    if (points.length >= 5) k++;
    else n.push('Plot 1/t against the volume of thiosulphate for every concentration run (five points).');
    k += graph.marks;
    n.push(...graph.notes);
    auto.push(score(crit('graph'), k, n));
  }

  // ---- calculations (4)
  const trueLine = ratesCrossTrueLine(v);
  const slope = parseNumber(state.answers.slope.value);
  {
    const n: string[] = [];
    let k = 0;
    if (slopeAccepted(slope, graph.fit?.slope ?? null, state.line, graph.lineOk)) k++;
    else n.push(slope === null ? 'Work out the slope of your line: Δ(1/t) ÷ ΔV from two points far apart on it.' : graph.fit ? `Your slope does not fit your own points (their best line has a slope of about ${sf(graph.fit.slope, 3)} s⁻¹ cm⁻³).` : 'A slope needs your points first.');
    if (withinRel(slope, trueLine.slope, 0.1)) k++;
    else if (slope !== null) n.push(`Your slope is more than 10 % from the true one (about ${sf(trueLine.slope, 2)} s⁻¹ cm⁻³): check the timings.`);
    const tq = parseNumber(state.answers.tQuery.value);
    const fromLine = state.line ? lineAt(state.line, v.queryVol) : null;
    const fromFit = graph.fit ? graph.fit.intercept + graph.fit.slope * v.queryVol : null;
    const ok = [fromLine, fromFit].some((y) => y !== null && y > 0 && withinRel(tq, 1 / y, 0.08));
    if (ok) k++;
    else n.push(fromLine ? `Read 1/t at ${v.queryVol} cm³ from your line (about ${sf(fromLine, 3)} s⁻¹), then t = 1 ÷ that = ${sf(1 / fromLine, 3)} s.` : `Read 1/t at ${v.queryVol} cm³ from your line, then t = 1 ÷ (1/t).`);
    const own = factorFromTable(temp);
    const fac = parseNumber(state.answers.factor.value);
    if (own !== null && fac !== null && withinRel(fac, own, 0.2) && fac >= 1.3 && fac <= 3.2) k++;
    else n.push(own === null ? 'Time the mixture at three or more temperatures to find how much faster it goes for each 10 °C.' : `From your own results the rate goes up about ${sf(own, 2)} times for every 10 °C (compare 1/t at temperatures 10 °C apart).`);
    auto.push(score(crit('calculations'), k, n));
  }

  // ---- units (1)
  {
    const un: string[] = [];
    let u = 1;
    if (![state.answers.slope, state.answers.tQuery, state.answers.factor].some((a) => a.value.trim())) (u = 0), un.push('No answers to check the units of.');
    if (state.answers.slope.value.trim() && ratesUnit(state.answers.slope.unit) !== '/s/cm3') (u = 0), un.push('The slope of 1/t (s⁻¹) against volume (cm³) is in s⁻¹ cm⁻³.');
    if (state.answers.tQuery.value.trim() && ratesUnit(state.answers.tQuery.unit) !== 's') (u = 0), un.push('Give the time in s.');
    if (state.answers.factor.value.trim() && !['', 'none'].includes(ratesUnit(state.answers.factor.unit))) (u = 0), un.push('A factor (how many times faster) has no unit.');
    auto.push(score(crit('units'), u, [...new Set(un)]));
  }

  const ai: AiItem[] = [
    {
      criterionId: 'explanation',
      question: 'Use the collision theory to explain the effect of (a) concentration and (b) temperature on the rate of the reaction between sodium thiosulphate and hydrochloric acid.',
      answer: state.written.explanation.trim(),
      guide: `2 marks: (a) a higher concentration gives more particles in the same volume, so more frequent collisions (1); (b) at a higher temperature the particles move faster and more of them have energy equal to or greater than the activation energy, so more collisions are successful (1). ${crit('explanation').guide}`,
      keywords: [
        ['collision', 'collide'],
        ['activation energy', 'enough energy', 'energy'],
        ['more frequent', 'more often', 'frequency', 'more particles'],
        ['faster', 'kinetic energy', 'move more'],
      ],
      need: 2,
    },
    precautionsItem(state, 'timing the disappearing cross for the reaction of sodium thiosulphate with hydrochloric acid', [
      ['total volume', 'same volume', '50 cm', 'made up'],
      ['same cross', 'same observer', 'same person'],
      ['look down', 'vertically', 'from above'],
      ['wash', 'rinse', 'clean'],
      ['start the watch', 'started the stopwatch', 'as the acid', 'immediately'],
      ['temperature', 'thermometer'],
      ['swirl', 'mix'],
    ]),
  ];
  const ideal = [50, 30, 10].map((x) => `${x} cm³: about ${ratesCrossIdealTime(v, x).toFixed(0)} s`);
  const fit = graph.fit;
  const solution = [
    'Na₂S₂O₃ + 2HCl → 2NaCl + SO₂ + S + H₂O: the pale yellow sulphur hides the cross. 1/t is a measure of the rate.',
    `Times for this attempt's solutions at room temperature (${v.room.toFixed(0)} °C): ${ideal.join('; ')}.`,
    `1/t against the volume of thiosulphate is a straight line through (nearly) the origin, slope about ${sf(trueLine.slope, 2)} s⁻¹ cm⁻³: the rate is proportional to the concentration.`,
    `At ${v.queryVol} cm³ the true line gives 1/t ≈ ${sf(trueLine.intercept + trueLine.slope * v.queryVol, 3)} s⁻¹, t ≈ ${sf(1 / (trueLine.intercept + trueLine.slope * v.queryVol), 3)} s.${fit ? ` Your own line gives t ≈ ${sf(1 / (fit.intercept + fit.slope * v.queryVol), 3)} s.` : ''}`,
    `A 10 °C rise makes this reaction about ${ratesFactor10(v).toFixed(1)} times faster: more particles have energy ≥ the activation energy.`,
  ];
  const facts = [
    `Task: disappearing cross (t50 ${v.t50} s, room ${v.room} °C, Ea ${v.eaThio}); runs ${done.length} (${conc.length} concentration, ${temp.length} temperature); stops at x = ${done.map((x) => xAt(x).toFixed(2)).join(', ') || '—'}.`,
    `Student's slope ${state.answers.slope.value || '—'} ${state.answers.slope.unit}; t(${v.queryVol}) ${state.answers.tQuery.value || '—'} ${state.answers.tQuery.unit}; factor ${state.answers.factor.value || '—'}.`,
  ];
  return { auto, ai, solution, facts };
}

/** The mixture's temperature at the end of a run when the thermometer was never read. */
const ratesCrossTempOf = (v: ChemRatesVariant, r: ChemRatesState['crossRuns'][number]) => (r.bath ?? v.room) - 2;

/** The rate's increase for 10 °C from the student's own temperature rows: ln(1/t) against θ is a straight line. */
function factorFromTable(rows: { row?: { th: string; t: string } }[]): number | null {
  const pts = rows.map((x) => ({ x: parseNumber(x.row?.th), t: parseNumber(x.row?.t) })).filter((p): p is { x: number; t: number } => p.x !== null && p.t !== null && p.t > 0).map((p) => ({ x: p.x, y: Math.log(1 / p.t) }));
  if (pts.length < 2) return null;
  const fit = phyFit(pts);
  return fit ? Math.exp(10 * fit.slope) : null;
}

function precautionsItem(state: ChemRatesState, what: string, keywords: string[][]): AiItem {
  return {
    criterionId: 'precautions',
    question: `State two precautions taken when ${what}.`,
    answer: state.written.precautions.trim(),
    guide: `2 marks: one for each of two correct precautions. ${crit('precautions').guide}`,
    keywords,
    need: 2,
  };
}
