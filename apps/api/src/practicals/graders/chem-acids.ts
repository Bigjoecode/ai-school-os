import {
  ACID_TUBES,
  CHEM_ACIDS,
  HARD_BOILABLE,
  HARD_LABEL,
  HARD_SAMPLES,
  HARD_VOL,
  IND_SOLS,
  IND_SOL_LABEL,
  M_CACO3,
  M_CO2,
  PH_CLASS_LABEL,
  PH_ETH_C,
  PH_INFO,
  PH_LETTER,
  PH_SAMPLES,
  acidBalance,
  acidChips,
  acidExcess,
  acidExtent,
  acidGasOf,
  chemAcidsVariant,
  hardLather,
  hardNeed,
  indConcordantMeans,
  indEndpoint,
  parsePhClass,
  phClassOf,
  phReading,
  zoboNames,
  type AcidsAnswerId,
  type AcidsUnit,
  type ChemAcidsState,
  type ChemAcidsVariant,
  type CriterionScore,
  type HardRun,
  type HardSample,
  type IndIndicator,
  type IndRun,
} from '@aischool/shared';
import { decimalPlaces, normaliseUnit, parseNumber, score, sf, withinAbs, withinRel } from './helpers';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

const crit = (id: string) => CHEM_ACIDS.rubric.find((c) => c.id === id)!;
const UNIT_TEXT: Record<AcidsUnit, string> = { 'mol/dm3': 'mol dm⁻³', none: 'no unit', '%': '%', cm3: 'cm³', mol: 'mol', g: 'g' };
type Out = { auto: CriterionScore[]; ai: AiItem[]; solution: string[]; facts: string[] };

/**
 * Marks the acids, bases and water lab the way a WAEC examiner's scheme does:
 * the setting up and procedure of the lesson's experiment (the marked
 * mistakes: unrinsed tubes, a full tube, uneven drops, no white background,
 * an unfiltered extract, ethanol over a flame, unrinsed burette or pipette,
 * too much extract, too little acid, no cotton-wool plug, an unzeroed balance,
 * CuO boiled hard, weighing before the reaction is over, soap run in a lot at
 * once, a swirl instead of a shake, reading before the lather has lasted,
 * boiling too short or not making up the volume…), the readings against the
 * simulated colour chart, burette and balance, the calculations with errors
 * carried forward, and units. Observations, explanation and precautions go to
 * AI.
 */
export const chemAcidsGrader: SimulatorGrader<'chem-acids'> = {
  id: 'chem-acids',
  grade(state: ChemAcidsState, seed: number): GraderOutput {
    const task = state.task ?? 'PH';
    const v = chemAcidsVariant(seed, task);
    const out = task === 'PH' ? gradePh(state, v) : task === 'IND' ? gradeInd(state, v) : task === 'ACID' ? gradeAcid(state, v) : gradeHard(state, v);
    out.auto.push(unitsScore(state, v));
    return out;
  },
};

// ------------------------------------------------------------------ helpers

const rec = (s: ChemAcidsState, k: string) => parseNumber(s.rec[k]);
const val = (s: ChemAcidsState, id: AcidsAnswerId) => parseNumber(s.answers[id]?.value);
/** Is the written unit the expected one? pH values and ratios have none. */
export function unitOk(expected: AcidsUnit, raw: string): boolean {
  const u = raw.trim();
  if (expected === 'none') return !u || /^(none|no units?|nil|-+|—|n\/?a|dimensionless|ph|times|x|×)$/i.test(u);
  if (!u) return false;
  return normaliseUnit(u) === expected;
}
function unitsScore(s: ChemAcidsState, v: ChemAcidsVariant): CriterionScore {
  const tasks = v.tasks;
  const blank = tasks.filter((t) => !s.answers[t.id]?.value.trim());
  const wrong = tasks.filter((t) => s.answers[t.id]?.value.trim() && !unitOk(t.unit, s.answers[t.id]?.unit ?? ''));
  const n: string[] = [];
  if (blank.length === tasks.length) n.push('No answers to check the units of.');
  if (wrong.length) n.push(`Units: ${wrong.map((t) => `${t.label.split(' (')[0]!.split(',')[0]!.split(':')[0]!.toLowerCase()} — ${UNIT_TEXT[t.unit]}`).join('; ')}.`);
  return score(crit('units'), blank.length === tasks.length || wrong.length ? 0 : 1, n);
}
const near = (x: number | null, targets: number[], rel = 0.015) => targets.some((t) => withinRel(x, t, rel));
const nearAbs = (x: number | null, targets: number[], tol: number) => targets.some((t) => withinAbs(x, t, tol));
const dp = (raw: string | undefined, n: number) => !!raw?.trim() && parseNumber(raw) !== null && decimalPlaces(raw) === n;
const pos = (...xs: (number | null | undefined)[]) => xs.filter((x): x is number => x !== null && x !== undefined && x > 0);
const fin = (...xs: (number | null | undefined)[]) => xs.filter((x): x is number => x !== null && x !== undefined && Number.isFinite(x));

// ------------------------------------------------------------------ PH

function gradePh(s: ChemAcidsState, v: ChemAcidsVariant): Out {
  const w = s.ph;
  const auto: CriterionScore[] = [];
  const tested = PH_SAMPLES.filter((k) => w.tubes[k].vol && w.tubes[k].drops > 0);
  {
    const n: string[] = [];
    let k = 0;
    if (w.rinsed) k++;
    else n.push('Rinse the test tubes with distilled water first: a trace of soap left in them turned the distilled water blue-green (pH 8).');
    const full = PH_SAMPLES.filter((x) => w.tubes[x].vol === 'FULL');
    if (tested.length && !full.length) k++;
    else n.push(full.length ? `Use about 2 cm³ of each sample: in a full tube (${full.map((x) => PH_LETTER[x]).join(', ')}) two drops of indicator are too dilute to match the chart.` : 'Put about 2 cm³ of each sample in its own labelled test tube.');
    auto.push(score(crit('setup'), k, n));
  }
  {
    const n: string[] = [];
    const t = tested.length;
    let k = t >= 9 ? 4 : t >= 8 ? 3 : t >= 6 ? 2 : t >= 3 ? 1 : 0;
    if (t < 9) n.push(`Test every sample with the indicator: ${PH_SAMPLES.filter((x) => !tested.includes(x)).map((x) => PH_LETTER[x]).join(', ')} not tested.`);
    if (t && tested.every((x) => w.tubes[x].compared)) k++;
    else if (t) n.push('Compare each tube’s colour with the chart.');
    auto.push(score(crit('procedure'), k, n));
  }
  {
    const n: string[] = [];
    let k = 0;
    const drops = new Set(tested.map((x) => w.tubes[x].drops));
    if (tested.length && drops.size === 1 && [...drops][0]! <= 3) k++;
    else if (tested.length) n.push(drops.size > 1 ? 'Use the same number of drops (2) in every tube, so the colours can be compared fairly.' : 'Two drops are enough: more indicator makes the colour too deep to match.');
    if (tested.length && tested.every((x) => w.tubes[x].shaken)) k++;
    else if (tested.length) n.push('Shake each tube after adding the indicator: unmixed, the colour is streaky.');
    if (w.tile) k++;
    else n.push('Compare the colours in good light against a white background (the white tile).');
    auto.push(score(crit('technique'), k, n));
  }
  const recPh = (x: (typeof PH_SAMPLES)[number]) => rec(s, `ph${x}`);
  {
    const n: string[] = [];
    let k = 0;
    const good = PH_SAMPLES.filter((x) => w.tubes[x].drops > 0 && w.tubes[x].vol && withinAbs(recPh(x), phReading(v, w, x), 1));
    if (good.length === 9) k += 2;
    else if (good.length >= 7) {
      k += 1;
      n.push(`Some pH values do not match the colours (${PH_SAMPLES.filter((x) => !good.includes(x)).map((x) => `${PH_LETTER[x]} ≈ ${phReading(v, w, x)}`).join(', ')}).`);
    } else n.push(`Read each tube against the chart: ${PH_SAMPLES.map((x) => `${PH_LETTER[x]} ${phReading(v, w, x)}`).join(', ')}.`);
    const written = PH_SAMPLES.filter((x) => s.rec[`ph${x}`]?.trim());
    if (written.length === 9 && written.every((x) => Number.isInteger(recPh(x)))) k++;
    else n.push('Record each pH as a whole number from the chart.');
    const cons = PH_SAMPLES.filter((x) => recPh(x) !== null && parsePhClass(s.rec[`cl${x}`] ?? '') === phClassOf(recPh(x)!));
    if (cons.length === 9) k++;
    else n.push('Classify each sample from its pH: strongly acidic 0–3, weakly acidic 4–6, neutral 7, weakly alkaline 8–10, strongly alkaline 11–14 (a pH of 6 is only weakly acidic).');
    auto.push(score(crit('readings'), k, n));
  }
  const chain = { phA: -Math.log10(v.ph.cHcl), phI: 14 + Math.log10(v.ph.cNaoh) };
  {
    const n: string[] = [];
    let k = 0;
    const h = val(s, 'hplus');
    if (withinRel(h, v.ph.cHcl, 0.02)) k++;
    else n.push(`HCl is fully ionised: [H⁺] = ${v.ph.cHcl} mol dm⁻³.`);
    const pA = val(s, 'phHcl');
    if (nearAbs(pA, fin(chain.phA, h !== null && h > 0 ? -Math.log10(h) : null), 0.06)) k++;
    else n.push(`pH = −log[H⁺] = −log(${v.ph.cHcl}) = ${chain.phA.toFixed(0)}.`);
    const pI = val(s, 'phNaoh');
    if (withinAbs(pI, chain.phI, 0.06)) k++;
    else n.push(withinAbs(pI, -Math.log10(v.ph.cNaoh), 0.06) ? `That is the pOH. pH = 14 − pOH = ${chain.phI.toFixed(0)}.` : `[OH⁻] = ${v.ph.cNaoh}: pOH = ${(-Math.log10(v.ph.cNaoh)).toFixed(0)}, pH = 14 − pOH = ${chain.phI.toFixed(0)}.`);
    const As = fin(recPh('HCL'), phReading(v, w, 'HCL'));
    const Bs = fin(recPh('ETH'), phReading(v, w, 'ETH'));
    const ratios = As.flatMap((a) => Bs.map((b) => 10 ** (b - a)));
    const r = val(s, 'ratio');
    if (near(r, ratios, 0.05)) k++;
    else n.push(`Each unit of pH is a tenfold change in [H⁺]: 10^(pH of B − pH of A)${As[0] !== undefined && Bs[0] !== undefined ? ` = 10^(${Bs[0]} − ${As[0]}) = ${sf(10 ** (Bs[0] - As[0]))}` : ''}.`);
    const ion = val(s, 'ionised');
    if (near(ion, Bs.map((b) => (10 ** -b / PH_ETH_C) * 100), 0.05)) k++;
    else n.push(`[H⁺] in B = 10^(−pH); percentage ionised = [H⁺] ÷ 0.10 × 100${Bs[0] !== undefined ? ` = ${sf((10 ** -Bs[0] / PH_ETH_C) * 100)} %` : ''}.`);
    auto.push(score(crit('calculations'), k, n));
  }
  return {
    auto,
    ai: [
      {
        criterionId: 'observation',
        question: 'State the colour of universal indicator in each sample and what it shows.',
        answer: s.written.observation.trim(),
        guide: '2 marks: HCl red (½), ethanoic acid/vinegar orange (½), distilled water green (½), soap/wood-ash blue and NaOH violet/purple (½).',
        keywords: [['red'], ['orange'], ['green'], ['blue', 'violet', 'purple']],
        need: 3,
      },
      {
        criterionId: 'explain',
        question: 'Why do 0.1 mol dm⁻³ HCl and 0.1 mol dm⁻³ ethanoic acid have different pH values?',
        answer: s.written.explain.trim(),
        guide: '1 mark: HCl is a strong acid, fully ionised; ethanoic acid is weak, only partly ionised, so its [H⁺] is lower and its pH higher. Half for "strong/weak" without ionisation.',
        keywords: [['strong', 'fully', 'completely'], ['weak', 'partly', 'partially', 'slightly'], ['ionis', 'ioniz', 'dissociat']],
        need: 2,
      },
      {
        criterionId: 'precautions',
        question: 'State two precautions taken in this experiment.',
        answer: s.written.precautions.trim(),
        guide: `1 mark for two correct precautions (half for one). ${crit('precautions').guide}`,
        keywords: [['same number', 'drops'], ['clean', 'rinse', 'distilled'], ['white', 'daylight', 'light'], ['taste'], ['goggles'], ['shake']],
        need: 2,
      },
    ],
    solution: [
      `Chart readings: ${PH_SAMPLES.map((x) => `${PH_LETTER[x]} (${PH_INFO[x].label.toLowerCase()}) ${phReading(v, { rinsed: true }, x)} — ${PH_CLASS_LABEL[phClassOf(phReading(v, { rinsed: true }, x))]}`).join('; ')}.`,
      `A: [H⁺] = ${v.ph.cHcl} mol dm⁻³ (fully ionised), pH = −log ${v.ph.cHcl} = ${chain.phA.toFixed(0)}. I: [OH⁻] = ${v.ph.cNaoh}, pOH = ${(-Math.log10(v.ph.cNaoh)).toFixed(0)}, pH = ${chain.phI.toFixed(0)}.`,
      `B (0.10 mol dm⁻³ ethanoic acid) reads about pH ${phReading(v, w, 'ETH')}: [H⁺] ≈ 10^−${phReading(v, w, 'ETH')} mol dm⁻³, about ${sf((10 ** -phReading(v, w, 'ETH') / PH_ETH_C) * 100)} % ionised — a weak acid. Each pH unit is a tenfold change in [H⁺].`,
    ],
    facts: [
      `Task PH: rinsed ${w.rinsed ? 'yes' : 'NO'}; tile ${w.tile ? 'yes' : 'no'}; tested ${tested.map((x) => `${PH_LETTER[x]}(${w.tubes[x].vol === 'FULL' ? 'full, ' : ''}${w.tubes[x].drops}d${w.tubes[x].shaken ? '' : ', unshaken'}${w.tubes[x].compared ? '' : ', not compared'})`).join(' ') || '—'}.`,
      `Recorded pH ${PH_SAMPLES.map((x) => `${PH_LETTER[x]} ${s.rec[`ph${x}`] || '—'}/${phReading(v, w, x)}`).join(', ')}.`,
      `Answers: [H⁺] ${s.answers.hplus.value || '—'}, pH(A) ${s.answers.phHcl.value || '—'}, pH(I) ${s.answers.phNaoh.value || '—'}, ratio ${s.answers.ratio.value || '—'}, ionised ${s.answers.ionised.value || '—'} %.`,
    ],
  };
}

// ------------------------------------------------------------------ IND

/** The done runs of an indicator, in order. */
const runsOf = (s: ChemAcidsState, ind: IndIndicator) => s.ind.runs.filter((r) => r.done && r.ind === ind);
const indPrefix = (ind: IndIndicator) => (ind === 'MO' ? 'mo' : 'z');

function gradeInd(s: ChemAcidsState, v: ChemAcidsVariant): Out {
  const w = s.ind;
  const auto: CriterionScore[] = [];
  const mo = runsOf(s, 'MO');
  const zo = runsOf(s, 'ZOBO');
  {
    const n: string[] = [];
    let k = 0;
    if (w.solvent) k++;
    else n.push('Crush the calyces with a little warm water or ethanol to extract the colour.');
    if (w.filtered) k++;
    else n.push('Filter the extract: bits of calyx cloud the colours.');
    auto.push(score(crit('setup'), k, n));
  }
  {
    const n: string[] = [];
    let k = 0;
    const ext = IND_SOLS.filter((x) => w.tests[x].ext);
    const ui = IND_SOLS.filter((x) => w.tests[x].ui);
    if (ext.length === 5) k++;
    else n.push(`Test the extract in all five solutions (${IND_SOLS.filter((x) => !w.tests[x].ext).map((x) => IND_SOL_LABEL[x].toLowerCase()).join(', ')} missing).`);
    if (ui.length === 5) k++;
    else n.push('Test universal indicator in the same five solutions, to know their pH.');
    if (w.burRinsed && w.pipRinsed) k++;
    else n.push(!w.burRinsed ? 'Rinse the burette with the acid before filling it: water left in it dilutes the acid.' : 'Rinse the pipette with the NaOH before using it.');
    if (mo.length >= 2) k++;
    else n.push('Do at least two accurate titrations with methyl orange.');
    if (zo.length >= 2) k++;
    else n.push('Do at least two accurate titrations with the zobo extract.');
    auto.push(score(crit('procedure'), k, n));
  }
  {
    const n: string[] = [];
    let k = 0;
    if (w.heat !== 'FLAME') k++;
    else n.push('Never warm ethanol over a naked flame: it is flammable. Use a water bath.');
    const all = [...mo, ...zo];
    if (all.length && all.every((r) => r.drops >= 2 && r.drops <= 3)) k++;
    else if (all.length) n.push('Use only 2–3 drops of indicator: too much extract masks the colour change, and its own acids change the titre.');
    const ok = (rs: IndRun[]) => indConcordantMeans(rs.map((r) => r.added)).length > 0;
    if (ok(mo) && ok(zo)) k++;
    else n.push('Repeat the titrations until two titres agree within 0.10 cm³ for each indicator (add the acid drop by drop near the end point).');
    auto.push(score(crit('technique'), k, n));
  }
  {
    const n: string[] = [];
    let k = 0;
    const colOk = IND_SOLS.filter((x) => w.tests[x].ext && zoboNames(v.ind.pH[x]).some((c) => (s.rec[`ex${x}`] ?? '').toLowerCase().includes(c)));
    if (colOk.length === 5) k++;
    else n.push(`Extract colours: ${IND_SOLS.map((x) => `${IND_SOL_LABEL[x].toLowerCase()} ${zoboNames(v.ind.pH[x]).join('/')}`).join(', ')}.`);
    const uiOk = IND_SOLS.filter((x) => w.tests[x].ui && withinAbs(rec(s, `ui${x}`), Math.round(v.ind.pH[x]), 1));
    if (uiOk.length === 5) k++;
    else n.push(`Universal indicator: ${IND_SOLS.map((x) => `${IND_SOL_LABEL[x].toLowerCase()} pH ${Math.round(v.ind.pH[x])}`).join(', ')}.`);
    const lo = rec(s, 'rangeLo');
    const hi = rec(s, 'rangeHi');
    if (lo !== null && hi !== null && lo >= 3 && lo <= 7 && hi >= 7 && hi <= 10 && hi > lo) k++;
    else n.push('From the two sets of results, the extract changes from red/pink to green between about pH 4 and pH 9.');
    const rows = [...(['MO', 'ZOBO'] as const).flatMap((ind) => runsOf(s, ind).slice(0, 3).map((r, i) => ({ r, key: `${indPrefix(ind)}${i + 1}` })))];
    const match = rows.filter(({ r, key }) => dp(s.rec[`${key}i`], 2) && dp(s.rec[`${key}f`], 2) && withinAbs(rec(s, `${key}i`), r.start, 0.011) && withinAbs(rec(s, `${key}f`), r.start + r.added, 0.011));
    if (rows.length >= 4 && match.length === rows.length) k++;
    else n.push(rows.length ? `Record the burette readings to 2 d.p. exactly as the burette showed them (${rows.map(({ r }) => `${r.start.toFixed(2)} → ${(r.start + r.added).toFixed(2)}`).join('; ')}).` : 'No titrations were recorded.');
    auto.push(score(crit('readings'), k, n));
  }
  const truthMeans = (rs: IndRun[]) => indConcordantMeans(rs.map((r) => r.added));
  const recTitres = (ind: IndIndicator) => [1, 2, 3].map((i) => rec(s, `${indPrefix(ind)}${i}t`) ?? (rec(s, `${indPrefix(ind)}${i}f`) !== null && rec(s, `${indPrefix(ind)}${i}i`) !== null ? rec(s, `${indPrefix(ind)}${i}f`)! - rec(s, `${indPrefix(ind)}${i}i`)! : null)).filter((x): x is number => x !== null && x > 0);
  const meanTargets = (ind: IndIndicator, rs: IndRun[]) => {
    const t = [...truthMeans(rs), ...indConcordantMeans(recTitres(ind))];
    if (!t.length && rs.length >= 2) t.push((rs.at(-1)!.added + rs.at(-2)!.added) / 2);
    return t;
  };
  {
    const n: string[] = [];
    let k = 0;
    const mMo = val(s, 'meanMo');
    const mZ = val(s, 'meanZobo');
    const tMo = meanTargets('MO', mo);
    const tZ = meanTargets('ZOBO', zo);
    if (nearAbs(mMo, tMo, 0.02)) k++;
    else n.push(tMo.length ? `Mean methyl-orange titre = the average of the concordant titres (≈ ${tMo[0]!.toFixed(2)} cm³).` : 'Average your concordant methyl-orange titres.');
    if (nearAbs(mZ, tZ, 0.02)) k++;
    else n.push(tZ.length ? `Mean zobo titre ≈ ${tZ[0]!.toFixed(2)} cm³ (concordant titres only).` : 'Average your concordant zobo titres.');
    const diffs = [...(mMo !== null && mZ !== null ? [Math.abs(mZ - mMo)] : []), ...tMo.flatMap((a) => tZ.map((b) => Math.abs(b - a)))];
    const d = val(s, 'diff');
    if (d !== null && nearAbs(Math.abs(d), diffs, 0.011)) k++;
    else n.push('Difference = zobo titre − methyl-orange titre.');
    const refs = pos(mMo, ...tMo);
    const ds = [...pos(d !== null ? Math.abs(d) : null), ...diffs];
    const pcts = refs.flatMap((r) => ds.map((x) => (x / r) * 100));
    const p = val(s, 'pctDiff');
    if (p !== null && pcts.some((t) => withinAbs(Math.abs(p), t, Math.max(0.02, t * 0.03)))) k += 2;
    else n.push('Percentage difference = difference ÷ methyl-orange titre × 100.');
    auto.push(score(crit('calculations'), k, n));
  }
  const endMo = indEndpoint(v, { ind: 'MO', drops: 3, dilA: false, dilB: false });
  const endZ = indEndpoint(v, { ind: 'ZOBO', drops: 3, dilA: false, dilB: false });
  return {
    auto,
    ai: [
      {
        criterionId: 'observation',
        question: 'State the colours of the zobo extract in the acids, water and the alkalis, and the colour changes at the end points.',
        answer: s.written.observation.trim(),
        guide: '2 marks: red in HCl and vinegar (½), pink-purple in water (½), green/blue-green in baking soda and yellow(-green) in NaOH (½), end points — methyl orange yellow → orange, extract green/blue → red/pink (½).',
        keywords: [['red'], ['purple', 'violet', 'pink', 'mauve'], ['green', 'blue'], ['yellow'], ['orange', 'end point', 'endpoint']],
        need: 4,
      },
      {
        criterionId: 'explain',
        question: 'How does a natural indicator such as zobo extract work, and is it suitable for an HCl–NaOH titration?',
        answer: s.written.explain.trim(),
        guide: '1 mark: an indicator is a weak acid (or base) whose ionised and un-ionised forms have different colours (½); suitable for a strong acid–strong base titration because the pH jump at the end point covers its colour change; the titres differ by under 1 % (½).',
        keywords: [['weak acid', 'weak base', 'ionised', 'unionised', 'un ionised', 'dissociat', 'forms'], ['suitable', 'strong acid', 'jump', 'sharp', 'close', 'agree']],
        need: 2,
      },
      {
        criterionId: 'precautions',
        question: 'State two precautions taken in this experiment.',
        answer: s.written.precautions.trim(),
        guide: `1 mark for two correct precautions (half for one). ${crit('precautions').guide}`,
        keywords: [['filter'], ['fresh'], ['same volume', 'same number', 'drops', '2 3 drops'], ['water bath', 'flame'], ['rinse'], ['goggles'], ['white tile', 'tile'], ['dropwise', 'drop by drop']],
        need: 2,
      },
    ],
    solution: [
      `Zobo extract: ${IND_SOLS.map((x) => `${IND_SOL_LABEL[x].toLowerCase()} (pH ${Math.round(v.ind.pH[x])}) ${zoboNames(v.ind.pH[x])[0]}`).join(', ')}. It changes from red/pink to purple near pH 7 and green above pH 9.`,
      `Titration: 25.0 cm³ of ${v.ind.cBase} mol dm⁻³ NaOH needs ${sf((25 * v.ind.cBase) / v.ind.cAcid, 4)} cm³ of the HCl to neutralise it exactly; methyl orange turns orange at about ${endMo.toFixed(2)} cm³, the extract turns red at about ${endZ.toFixed(2)} cm³.`,
      `Difference ≈ ${(endZ - endMo).toFixed(2)} cm³ = ${sf(((endZ - endMo) / endMo) * 100, 2)} % of the methyl-orange titre — small: the extract is suitable for a strong acid–strong base titration.`,
    ],
    facts: [
      `Task IND: solvent ${w.solvent ?? '—'}, heat ${w.heat ?? '—'}, filtered ${w.filtered ? 'yes' : 'no'}; extract tested ${IND_SOLS.filter((x) => w.tests[x].ext).length}/5, UI ${IND_SOLS.filter((x) => w.tests[x].ui).length}/5; burette rinsed ${w.burRinsed ? 'yes' : 'no'}, pipette rinsed ${w.pipRinsed ? 'yes' : 'no'}.`,
      `Runs: ${w.runs.map((r) => `${r.ind}${r.drops}d ${r.start.toFixed(2)}→${(r.start + r.added).toFixed(2)}${r.done ? '' : ' (open)'}`).join(', ') || '—'}.`,
      `Answers: MO ${s.answers.meanMo.value || '—'}, zobo ${s.answers.meanZobo.value || '—'}, diff ${s.answers.diff.value || '—'}, % ${s.answers.pctDiff.value || '—'}.`,
    ],
  };
}

// ------------------------------------------------------------------ ACID

function gradeAcid(s: ChemAcidsState, v: ChemAcidsVariant): Out {
  const w = s.acid;
  const t = w.tubes;
  const auto: CriterionScore[] = [];
  const chips = acidChips(v, w);
  const lastT = w.weighings.at(-1) ?? null;
  const shown = { m1: w.flaskWeighed ? acidBalance(v, w, 'flask') : null, m2: w.chips > 0 ? acidBalance(v, w, 'chips') : null, m3: w.added && lastT !== null ? acidBalance(v, w, 'total', lastT) : null };
  {
    const n: string[] = [];
    let k = 0;
    if (w.acidVol !== null && acidExcess(v, w) && chips >= 1.8 && chips <= 2.2) k++;
    else n.push(w.acidVol !== null && !acidExcess(v, w) ? `${w.acidVol} cm³ of acid is not an excess for ${chips.toFixed(2)} g of marble: use 50 cm³ so all the CaCO₃ reacts.` : chips < 1.8 || chips > 2.2 ? `Weigh about 2.00 g of marble chips (you used ${chips.toFixed(2)} g).` : 'Measure the acid into the flask.');
    if (w.plug) k++;
    else n.push('Put a cotton-wool plug in the flask: it stops acid spray escaping but lets the CO₂ out.');
    auto.push(score(crit('setup'), k, n));
  }
  {
    const n: string[] = [];
    let k = 0;
    if (t.MG.acid && t.ZN.acid && t.CU.acid) k++;
    else n.push('Add dilute HCl to the magnesium, zinc and copper.');
    if (t.MG.tests.includes('BURNING') && t.ZN.tests.includes('BURNING')) k++;
    else n.push('Test the gas from magnesium and zinc with a burning splint.');
    if (t.CUO.acid && t.CUO.warmed) k++;
    else n.push('Warm the copper(II) oxide with the acid: it dissolves only when warm.');
    if (t.CACO3.acid && t.CACO3.tests.includes('LIME')) k++;
    else n.push('Pass the gas from the marble into limewater.');
    if (w.flaskWeighed && w.added && w.weighings.length) k++;
    else n.push('Weigh the flask and acid (with the plug) and the marble before, and the flask again after the reaction.');
    auto.push(score(crit('procedure'), k, n));
  }
  {
    const n: string[] = [];
    let k = 0;
    if (w.zeroed) k++;
    else n.push(`Zero (tare) the balance before weighing: it read ${v.acid.offset.toFixed(2)} g with nothing on it, which made your mass loss too big.`);
    if (t.CUO.warmed === 'GENTLE') k++;
    else if (t.CUO.warmed === 'STRONG') n.push('Warm gently: boiling the acid hard makes it spit out of the tube.');
    else n.push('Warm the CuO and acid gently.');
    const prev = w.weighings.length >= 2 ? w.weighings.at(-2)! : null;
    if (lastT !== null && prev !== null && acidExtent(v, w, lastT) >= 0.99 && Math.abs(acidBalance(v, w, 'total', prev) - acidBalance(v, w, 'total', lastT)) < 0.005) k++;
    else n.push(lastT !== null && acidExtent(v, w, lastT) < 0.99 ? `You weighed it ${Math.round(lastT)} s after adding the marble, before the fizzing had stopped. Weigh again until two readings agree.` : 'Weigh the flask again a minute later: two readings that agree show the reaction is over.');
    auto.push(score(crit('technique'), k, n));
  }
  const m1 = rec(s, 'm1');
  const m2 = rec(s, 'm2');
  const m3 = rec(s, 'm3');
  {
    const n: string[] = [];
    let k = 0;
    const gases = (['MG', 'ZN', 'CU', 'CACO3'] as const).filter((x) => (s.rec[`gas${x}`] ?? '').trim().toLowerCase().replace('co2', 'carbon dioxide').replace('h2', 'hydrogen').startsWith(acidGasOf(x) === 'none' ? 'no' : acidGasOf(x)));
    if (gases.length === 4) k++;
    else n.push('Gases: Mg and Zn give hydrogen (pop), copper gives none, marble gives carbon dioxide (limewater milky).');
    if (['m1', 'm2', 'm3'].every((x) => dp(s.rec[x], 2))) k++;
    else n.push('Record each mass to 2 decimal places, as the balance shows it.');
    const good = (['m1', 'm2', 'm3'] as const).filter((x) => shown[x] !== null && withinAbs(rec(s, x), shown[x]!, 0.011)).length;
    if (good === 3) k += 2;
    else if (good === 2) {
      k += 1;
      n.push(`One mass does not match the balance (${shown.m1?.toFixed(2) ?? '—'}, ${shown.m2?.toFixed(2) ?? '—'}, ${shown.m3?.toFixed(2) ?? '—'} g).`);
    } else n.push(`Your masses do not match the balance (flask + acid ${shown.m1?.toFixed(2) ?? '—'} g, chips ${shown.m2?.toFixed(2) ?? '—'} g, after ${shown.m3?.toFixed(2) ?? '—'} g).`);
    auto.push(score(crit('readings'), k, n));
  }
  {
    const n: string[] = [];
    let k = 0;
    const ms = pos(chips, m2, shown.m2);
    const mol = val(s, 'molCaco3');
    if (near(mol, ms.map((x) => x / M_CACO3), 0.02)) k++;
    else n.push(`Moles of CaCO₃ = mass ÷ 100 = ${sf(chips / M_CACO3)} mol.`);
    const mols = [...ms.map((x) => x / M_CACO3), ...pos(mol)];
    const co2 = val(s, 'massCo2');
    if (near(co2, mols.map((x) => x * M_CO2), 0.02)) k++;
    else n.push(`1 mol CaCO₃ gives 1 mol CO₂: mass = moles × 44 = ${sf((chips / M_CACO3) * M_CO2)} g.`);
    const lostT = [...(m1 !== null && m2 !== null && m3 !== null ? [m1 + m2 - m3] : []), ...(shown.m1 !== null && shown.m2 !== null && shown.m3 !== null ? [shown.m1 + shown.m2 - shown.m3] : [])];
    const lost = val(s, 'lost');
    if (nearAbs(lost, lostT, 0.011)) k++;
    else n.push('Mass lost = (flask + acid) + marble − final mass.');
    const theo = [...mols.map((x) => x * M_CO2), ...pos(co2)];
    const ls = [...pos(lost), ...lostT.filter((x) => x > 0)];
    const p = val(s, 'pctCo2');
    if (near(p, theo.flatMap((th) => ls.map((l) => (l / th) * 100)), 0.02)) k += 2;
    else n.push('Percentage = mass lost ÷ expected mass of CO₂ × 100.');
    auto.push(score(crit('calculations'), k, n));
  }
  const theo = (chips / M_CACO3) * M_CO2;
  return {
    auto,
    ai: [
      {
        criterionId: 'observation',
        question: 'State what you observed with Mg, Zn, Cu, CuO and marble, and in the gas tests.',
        answer: s.written.observation.trim(),
        guide: '2 marks: Mg and Zn effervesce (Mg faster) and the gas gives a squeaky pop (½); copper: no reaction (½); CuO dissolves on warming to a blue/blue-green solution (½); marble effervesces and the gas turns limewater milky (½).',
        keywords: [['efferves', 'bubbl', 'fizz'], ['pop'], ['copper', 'no reaction', 'no change', 'no gas'], ['blue', 'green'], ['milky', 'cloudy', 'turbid', 'white precipitate']],
        need: 4,
      },
      {
        criterionId: 'explain',
        question: 'Why does copper not react with dilute HCl? Write the general equations for the three types of reaction.',
        answer: s.written.explain.trim(),
        guide: '1 mark: copper is below hydrogen in the activity (electrochemical) series, so it cannot displace hydrogen (½); acid + metal → salt + hydrogen, acid + base → salt + water, acid + carbonate → salt + water + carbon dioxide (½).',
        keywords: [['below hydrogen', 'less reactive', 'activity series', 'reactivity series', 'electrochemical series'], ['salt'], ['carbon dioxide', 'co2', 'water']],
        need: 2,
      },
      {
        criterionId: 'precautions',
        question: 'State two precautions taken in this experiment.',
        answer: s.written.precautions.trim(),
        guide: `1 mark for two correct precautions (half for one). ${crit('precautions').guide}`,
        keywords: [['cotton', 'plug'], ['excess'], ['zero', 'tare'], ['small', 'small volume'], ['goggles'], ['gently', 'warm'], ['constant mass', 'two readings']],
        need: 2,
      },
    ],
    solution: [
      'Mg + 2HCl → MgCl₂ + H₂ (fast fizzing, pop); Zn + 2HCl → ZnCl₂ + H₂ (slower); Cu: no reaction (below hydrogen); CuO + 2HCl → CuCl₂ + H₂O (blue-green on warming); CaCO₃ + 2HCl → CaCl₂ + H₂O + CO₂ (limewater milky).',
      `Marble ${chips.toFixed(2)} g = ${sf(chips / M_CACO3)} mol → ${sf(theo)} g of CO₂ expected.`,
      shown.m1 !== null && shown.m2 !== null && shown.m3 !== null ? `Your balance: ${shown.m1.toFixed(2)} + ${shown.m2.toFixed(2)} − ${shown.m3.toFixed(2)} = ${(shown.m1 + shown.m2 - shown.m3).toFixed(2)} g lost = ${sf(((shown.m1 + shown.m2 - shown.m3) / theo) * 100)} % of the expected (some CO₂ stays dissolved${w.plug ? '' : '; acid spray escaped without the plug'}${w.zeroed ? '' : '; the unzeroed balance added its offset'}).` : 'The flask was not weighed before and after.',
    ],
    facts: [
      `Task ACID: tubes ${ACID_TUBES.map((x) => `${x}${t[x].acid ? '' : '(no acid)'}${t[x].warmed ? `(${t[x].warmed.toLowerCase()})` : ''}[${t[x].tests.join(',')}]`).join(' ')}.`,
      `Flask: acid ${w.acidVol ?? '—'} cm³ (${acidExcess(v, w) ? 'excess' : 'NOT excess'}), chips ${chips.toFixed(2)} g, plug ${w.plug ? 'yes' : 'no'}, zeroed ${w.zeroed ? 'yes' : 'no'}; weighed at ${w.weighings.map((x) => `${Math.round(x)} s`).join(', ') || '—'}.`,
      `Recorded m1 ${s.rec.m1 || '—'}, m2 ${s.rec.m2 || '—'}, m3 ${s.rec.m3 || '—'}; lost ${s.answers.lost.value || '—'} g, ${s.answers.pctCo2.value || '—'} %.`,
    ],
  };
}

// ------------------------------------------------------------------ HARD

/** The last finished run of a sample (boiled or not). */
const lastRun = (s: ChemAcidsState, sample: HardSample, boiled: boolean): HardRun | null => [...s.hard.runs].reverse().find((r) => r.done && r.sample === sample && r.boiled === boiled) ?? null;

function gradeHard(s: ChemAcidsState, v: ChemAcidsVariant): Out {
  const w = s.hard;
  const auto: CriterionScore[] = [];
  const done = w.runs.filter((r) => r.done);
  {
    const n: string[] = [];
    let k = 0;
    if (done.length && done.every((r) => Math.abs(r.vol - HARD_VOL) < 0.01)) k++;
    else n.push(done.length ? 'Measure exactly 50.0 cm³ of every sample with the measuring cylinder: the soap needed depends on the volume.' : 'Test the samples.');
    if (w.burRinsed && w.burette !== null) k++;
    else n.push('Rinse the burette with the soap solution, then fill it.');
    auto.push(score(crit('setup'), k, n));
  }
  {
    const n: string[] = [];
    let k = 0;
    const tested = HARD_SAMPLES.filter((x) => lastRun(s, x, false));
    k += tested.length === 5 ? 2 : tested.length >= 3 ? 1 : 0;
    if (tested.length < 5) n.push(`Test all five samples, with distilled water as the blank (${HARD_SAMPLES.filter((x) => !tested.includes(x)).map((x) => HARD_LABEL[x].toLowerCase()).join(', ')} missing).`);
    if ((['X', 'Y', 'TAP'] as const).every((x) => w.boiled[x] === 'FULL')) k++;
    else n.push((['X', 'Y', 'TAP'] as const).some((x) => w.boiled[x] === 'SHORT') ? 'Boil for the full 5 minutes: a short boil leaves much of the temporary hardness.' : (['X', 'Y', 'TAP'] as const).some((x) => w.boiled[x] === 'NOMAKEUP') ? 'After boiling, cool and make the volume back up to 50 cm³ with distilled water (water boils away and concentrates the hardness), then filter.' : 'Boil 50 cm³ of tap water, X and Y for 5 minutes, cool, make up to 50 cm³ and filter.');
    if (lastRun(s, 'X', true) && lastRun(s, 'Y', true)) k++;
    else n.push('Test the boiled samples of X and Y.');
    if (lastRun(s, 'TAP', true)) k++;
    else n.push('Test the boiled tap water too.');
    auto.push(score(crit('procedure'), k, n));
  }
  {
    const n: string[] = [];
    let k = 0;
    if (done.length && !done.some((r) => r.big)) k++;
    else if (done.length) n.push('Add the soap 0.5 cm³ at a time: a large portion overshoots the end point.');
    if (done.length && !done.some((r) => r.swirled)) k++;
    else if (done.length) n.push('Stopper the flask and shake it the same way after each addition; a gentle swirl makes less lather, so more soap seems to be needed.');
    if (done.length && done.every((r) => r.watched && hardLather(v, w, r) === 'LASTING')) k++;
    else if (done.length) n.push('Before reading the burette, make sure the lather lasts 2 minutes: the first froth in hard water soon collapses.');
    auto.push(score(crit('technique'), k, n));
  }
  const keys: { key: string; run: HardRun | null }[] = [...HARD_SAMPLES.map((x) => ({ key: `v${x}`, run: lastRun(s, x, false) })), ...HARD_BOILABLE.map((x) => ({ key: `b${x}`, run: lastRun(s, x, true) }))];
  const totalOf = (x: HardSample) => hardNeed(v, w, { sample: x, boiled: false, vol: HARD_VOL, swirled: false });
  const hardest = (['TAP', 'X', 'Y'] as const).reduce((a, b) => (totalOf(b) > totalOf(a) ? b : a));
  const permS = v.hard.tempSample === 'X' ? 'Y' : 'X';
  {
    const n: string[] = [];
    let k = 0;
    const present = keys.filter((x) => x.run);
    const good = present.filter((x) => withinAbs(rec(s, x.key), x.run!.added, 0.06));
    if (present.length >= 8 && good.length === present.length) k += 2;
    else if (good.length >= 6) {
      k += 1;
      n.push(`Some volumes of soap do not match the burette (${present.filter((x) => !good.includes(x)).map((x) => `${x.key.slice(0, 1) === 'b' ? 'boiled ' : ''}${HARD_LABEL[x.key.slice(1) as HardSample].toLowerCase()} ${x.run!.added.toFixed(1)}`).join(', ')} cm³).`);
    } else n.push(present.length ? `Volume of soap = final − initial burette reading (${present.map((x) => `${x.key}: ${x.run!.added.toFixed(1)}`).join(', ')}).` : 'No titrations to record.');
    const written = keys.filter((x) => s.rec[x.key]?.trim());
    if (written.length >= 6 && written.every((x) => decimalPlaces(s.rec[x.key]!) >= 1)) k++;
    else n.push('Record each volume to 1 decimal place (e.g. 12.0 cm³).');
    if ((s.rec.hardest ?? '').toUpperCase().includes(hardest === 'TAP' ? 'TAP' : hardest) && (s.rec.permSample ?? '').toUpperCase().includes(permS)) k++;
    else n.push(`The hardest sample was ${HARD_LABEL[hardest].toLowerCase()}; sample ${permS} kept most of its hardness on boiling — mainly permanent.`);
    auto.push(score(crit('readings'), k, n));
  }
  {
    const n: string[] = [];
    let k = 0;
    const vx = lastRun(s, 'X', false)?.added ?? null;
    const bx = lastRun(s, 'X', true)?.added ?? null;
    const vd = lastRun(s, 'DIST', false)?.added ?? null;
    const VX = fin(rec(s, 'vX'), vx);
    const BX = fin(rec(s, 'bX'), bx);
    const VD = fin(rec(s, 'vDIST'), vd);
    const temp = val(s, 'tempX');
    const perm = val(s, 'permX');
    const total = val(s, 'totalX');
    const tT = VX.flatMap((a) => BX.map((b) => a - b));
    const pT = BX.flatMap((b) => VD.map((d) => b - d));
    const totT = VX.flatMap((a) => VD.map((d) => a - d));
    if (nearAbs(temp, tT, 0.06)) k++;
    else n.push('Temporary hardness = soap for X before boiling − after boiling.');
    if (nearAbs(perm, pT, 0.06)) k++;
    else n.push(nearAbs(perm, BX, 0.06) ? 'Subtract the distilled-water blank: pure water itself needs a little soap to lather.' : 'Permanent hardness = soap for boiled X − the blank.');
    if (nearAbs(total, totT, 0.06)) k++;
    else n.push('Total hardness = soap for X before boiling − the blank.');
    const ts = [...fin(temp), ...tT];
    const tots = [...pos(total), ...totT.filter((x) => x > 0)];
    const pct = val(s, 'pctTemp');
    if (near(pct, tots.flatMap((tt) => ts.map((x) => (x / tt) * 100)), 0.02)) k += 2;
    else n.push('Percentage temporary = temporary ÷ total × 100.');
    auto.push(score(crit('calculations'), k, n));
  }
  const ideal = (x: HardSample, b: boolean) => Math.ceil((hardNeed(v, { boiled: { ...w.boiled, [x]: b ? 'FULL' : null } }, { sample: x, boiled: b, vol: HARD_VOL, swirled: false }) - 1e-9) / 0.5) * 0.5;
  const iX = ideal('X', false);
  const iXb = ideal('X', true);
  const iD = ideal('DIST', false);
  return {
    auto,
    ai: [
      {
        criterionId: 'observation',
        question: 'State how each sample behaved with the soap solution, before and after boiling.',
        answer: s.written.observation.trim(),
        guide: '2 marks: distilled and rain water lather at once with very little soap (½); hard samples form a white scum and need much more soap (½); boiling reduces the soap needed for the temporarily hard sample (½) but not for the permanently hard one (½).',
        keywords: [['distilled', 'rain', 'soft'], ['scum', 'curd', 'precipitate'], ['more soap', 'much soap', 'large volume', 'more'], ['boil', 'boiling'], ['less', 'reduce', 'decrease', 'fewer']],
        need: 4,
      },
      {
        criterionId: 'explain',
        question: 'Explain why boiling removes temporary but not permanent hardness.',
        answer: s.written.explain.trim(),
        guide: '1 mark: temporary hardness is calcium (magnesium) hydrogentrioxocarbonate(IV), which boiling decomposes: Ca(HCO₃)₂ → CaCO₃ + H₂O + CO₂ — the insoluble CaCO₃ is filtered off (½); permanent hardness is CaSO₄/MgSO₄ (or chlorides), not decomposed by boiling — removed by washing soda, ion exchange or distillation (½).',
        keywords: [['hco3', 'hydrogencarbonate', 'hydrogen carbonate', 'bicarbonate', 'hydrogentrioxocarbonate'], ['caco3', 'precipitat', 'insoluble', 'decompos'], ['caso4', 'sulphate', 'sulfate', 'chloride', 'not removed', 'washing soda']],
        need: 2,
      },
      {
        criterionId: 'precautions',
        question: 'State two precautions taken in this experiment.',
        answer: s.written.precautions.trim(),
        guide: `1 mark for two correct precautions (half for one). ${crit('precautions').guide}`,
        keywords: [['same volume', '50'], ['shak'], ['blank', 'distilled'], ['0 5', 'small portions', 'little at a time'], ['2 minutes', 'two minutes', 'lasting', 'permanent lather'], ['goggles'], ['made up', 'make up'], ['hot', 'careful']],
        need: 2,
      },
    ],
    solution: [
      `Soap for 50.0 cm³ (0.5 cm³ steps): distilled ${iD.toFixed(1)}, rain ${ideal('RAIN', false).toFixed(1)}, tap ${ideal('TAP', false).toFixed(1)} → ${ideal('TAP', true).toFixed(1)} boiled, X ${iX.toFixed(1)} → ${iXb.toFixed(1)}, Y ${ideal('Y', false).toFixed(1)} → ${ideal('Y', true).toFixed(1)} cm³.`,
      `For X: temporary = ${iX.toFixed(1)} − ${iXb.toFixed(1)} = ${(iX - iXb).toFixed(1)} cm³; permanent = ${iXb.toFixed(1)} − ${iD.toFixed(1)} = ${(iXb - iD).toFixed(1)} cm³; total = ${(iX - iD).toFixed(1)} cm³; ${sf(((iX - iXb) / (iX - iD)) * 100)} % temporary.`,
      `Sample ${permS} is mainly permanently hard (CaSO₄/MgSO₄): boiling hardly changes it. Ca(HCO₃)₂ → CaCO₃ + H₂O + CO₂ on boiling removes temporary hardness.`,
    ],
    facts: [
      `Task HARD: burette rinsed ${w.burRinsed ? 'yes' : 'no'}; boiled ${HARD_BOILABLE.map((x) => `${x}:${w.boiled[x] ?? '—'}`).join(' ')}.`,
      `Runs: ${w.runs.map((r) => `${r.sample}${r.boiled ? '(b)' : ''} ${r.vol}cm³ ${r.added.toFixed(1)}${r.big ? ' big' : ''}${r.swirled ? ' swirl' : ''}${r.watched ? '' : ' unwatched'}${r.done ? '' : ' open'}`).join(', ') || '—'}.`,
      `Answers: temp ${s.answers.tempX.value || '—'}, perm ${s.answers.permX.value || '—'}, total ${s.answers.totalX.value || '—'}, % ${s.answers.pctTemp.value || '—'}; hardest ${s.rec.hardest || '—'}, permanent ${s.rec.permSample || '—'}.`,
    ],
  };
}
