import {
  CHEM_SALTS,
  CHROM_DYE_INFO,
  MP_LIT,
  MP_SLOW_MAX,
  PPT_AN_VOL,
  PPT_CAT_VOL,
  PPT_INFO,
  SOL_ACID_VOL,
  SOL_M,
  SOL_WARM,
  chemSaltsVariant,
  chromAboveLine,
  chromRanOff,
  chromRf,
  chromSolventDist,
  chromSpots,
  mpDissolved,
  mpMinWater,
  mpProduct,
  mpRange,
  mpThermoFor,
  mpTooMuch,
  pptChain,
  pptExcess,
  pptTotal,
  solBaseExcess,
  solChain,
  solCrystalPoint,
  solFiltrate,
  solOverPoint,
  solProduct,
  type ChemSaltsState,
  type ChemSaltsVariant,
  type CriterionScore,
  type SaltsAnswerId,
} from '@aischool/shared';
import { decimalPlaces, normaliseUnit, parseNumber, score, sf, withinAbs, withinRel } from './helpers';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

const crit = (id: string) => CHEM_SALTS.rubric.find((c) => c.id === id)!;
const UNIT_TEXT: Record<string, string> = { mol: 'mol', 'g/mol': 'g mol⁻¹', g: 'g', '%': '%', C: '°C', '': 'no unit' };
type Out = { auto: CriterionScore[]; ai: AiItem[]; solution: string[]; facts: string[] };

/**
 * Marks the salts / chromatography / recrystallisation lab the way a WAEC
 * examiner's scheme does: the setting up, the procedure and the technique of
 * the task (the marked mistakes: not using excess base, evaporating to
 * dryness, a baseline in ink, the solvent above the baseline, heating the
 * melting-point tube too fast…), the measurements against the simulated
 * balance, ruler and thermometer, the calculations with errors carried
 * forward, and units. Observations, the explanation and precautions go to AI.
 */
export const chemSaltsGrader: SimulatorGrader<'chem-salts'> = {
  id: 'chem-salts',
  grade(state: ChemSaltsState, seed: number): GraderOutput {
    const task = state.task ?? 'SOL';
    const v = chemSaltsVariant(seed, task);
    const out = task === 'SOL' ? gradeSol(state, v) : task === 'PPT' ? gradePpt(state, v) : task === 'CHROM' ? gradeChrom(state, v) : gradeMp(state, v);
    out.auto.push(unitsScore(state, v));
    return out;
  },
};

// ------------------------------------------------------------------ shared helpers

const rec = (s: ChemSaltsState, k: keyof ChemSaltsState['rec']) => parseNumber(s.rec[k]);
const val = (s: ChemSaltsState, id: SaltsAnswerId) => parseNumber(s.answers[id]?.value);
/** The unit as written, normalised; "no unit" spellings become ''. */
function unitOf(s: ChemSaltsState, id: SaltsAnswerId): string {
  const raw = (s.answers[id]?.unit ?? '').trim().toLowerCase();
  if (!raw || /^(-|–|none|no unit|nil|no units|unitless|dimensionless)$/.test(raw)) return '';
  if (/^(°\s*c|deg(rees?)?\s*c(elsius)?|c|celsius|degc|oc|0c)$/.test(raw)) return 'C';
  if (/^(%|percent|per cent)$/.test(raw)) return '%';
  if (/^g\s*\/\s*mol$|^g\s*mol\s*(-1|⁻¹|\^-1)$|^gmol(-1|⁻¹)$/.test(raw)) return 'g/mol';
  const n = normaliseUnit(raw);
  return n;
}
function unitsScore(s: ChemSaltsState, v: ChemSaltsVariant): CriterionScore {
  const tasks = v.tasks;
  const blank = tasks.filter((t) => !s.answers[t.id]?.value.trim());
  const wrong = tasks.filter((t) => s.answers[t.id]?.value.trim() && unitOf(s, t.id) !== t.unit);
  const n: string[] = [];
  if (blank.length === tasks.length) n.push('No answers to check the units of.');
  if (wrong.length) n.push(`Units: ${wrong.map((t) => `${t.label.split(' (')[0]!.toLowerCase()} — ${t.unit ? UNIT_TEXT[t.unit] : 'Rf has no unit'}`).join('; ')}.`);
  return score(crit('units'), blank.length === tasks.length || wrong.length ? 0 : 1, n);
}
const ok2 = (x: number | null, targets: number[], rel = 0.015) => targets.some((t) => withinRel(x, t, rel));
const dp2 = (raw: string) => !!raw.trim() && parseNumber(raw) !== null && decimalPlaces(raw) === 2;

/** Salts calculations (5), shared by SOL and PPT: moles, 1 : 1 ratio, molar mass, theoretical mass, yield — errors carried forward. */
function saltCalc(s: ChemSaltsState, chain: (vol: number, mass: number | null, moles?: number | null, molar?: number | null, theo?: number | null) => { molesAcid: number; molarMass: number; theoretical: number; yield: number | null }, volTrue: number, volRec: number | null, massTrue: number, massRec: number | null, what: { reagent: string; salt: string; slip?: number }): { m: number; n: string[] } {
  const n: string[] = [];
  let m = 0;
  const vols = [volTrue, ...(volRec !== null && volRec > 0 ? [volRec] : [])];
  const masses = [massTrue, ...(massRec !== null && massRec > 0 ? [massRec] : [])];
  const t = chain(volTrue, massTrue);
  const ma = val(s, 'molesAcid');
  const maT = vols.map((x) => chain(x, null).molesAcid);
  if (ok2(ma, maT, 0.02)) m++;
  else n.push(ma === null ? `Work out the moles of ${what.reagent} (concentration × volume ÷ 1000).` : `Moles of ${what.reagent} = concentration × volume (cm³) ÷ 1000 = ${sf(t.molesAcid)} mol.`);
  const msUsed = [...maT, ...(ma !== null && ma > 0 ? [ma] : [])];
  const ms = val(s, 'molesSalt');
  if (ok2(ms, msUsed)) m++;
  else n.push(ms === null ? `Give the maximum moles of ${what.salt}.` : `From the equation the mole ratio is 1 : 1, so moles of ${what.salt} = moles of ${what.reagent}.`);
  const mm = val(s, 'molarMass');
  if (withinAbs(mm, t.molarMass, 0.6)) m++;
  else n.push(mm !== null && what.slip !== undefined && withinAbs(mm, what.slip, 0.6) ? `The crystals are ${what.salt}: include the water of crystallisation — molar mass ${t.molarMass} g mol⁻¹, not ${what.slip}.` : `Molar mass of ${what.salt} = ${t.molarMass} g mol⁻¹.`);
  const mmUsed = [t.molarMass, ...(mm !== null && mm > 0 ? [mm] : [])];
  const msAll = [...msUsed, ...(ms !== null && ms > 0 ? [ms] : [])];
  const th = val(s, 'theoretical');
  const thT = msAll.flatMap((a) => mmUsed.map((b) => a * b));
  if (ok2(th, thT)) m++;
  else n.push(th === null ? 'Work out the theoretical mass.' : `Theoretical mass = moles × molar mass = ${sf(t.theoretical)} g.`);
  const yv = val(s, 'yield');
  const thUsed = [...thT, ...(th !== null && th > 0 ? [th] : [])];
  const yT = masses.flatMap((ms2) => thUsed.map((x) => (ms2 / x) * 100));
  if (ok2(yv, yT, 0.02)) m++;
  else n.push(yv === null ? 'Work out the percentage yield.' : 'Percentage yield = actual mass ÷ theoretical mass × 100.');
  return { m, n };
}

// ------------------------------------------------------------------ SOL

function gradeSol(s: ChemSaltsState, v: ChemSaltsVariant): Out {
  const w = s.sol;
  const auto: CriterionScore[] = [];
  const f = solFiltrate(v, w);
  const cp = solCrystalPoint(f.n);
  const over = solOverPoint(f.n);
  const prod = solProduct(v, w);
  const started = w.acid !== null;
  {
    const n: string[] = [];
    let m = 0;
    if (w.acid !== null && withinAbs(w.acid, SOL_ACID_VOL, 0.5)) m++;
    else n.push(w.acid === null ? 'Measure 50.0 cm³ of the dilute acid into the beaker.' : `Measure 50.0 cm³ of the acid, not ${w.acid} cm³.`);
    if (w.warmMax !== null && w.warmMax >= SOL_WARM.boil) n.push('The acid was heated to boiling: hot acid spits. Warm it gently (to about 60 °C).');
    else if (w.warmAtAdd === null || w.warmAtAdd < SOL_WARM.min) n.push(started ? 'Warm the acid gently before adding the CuO: it dissolves much faster in warm acid.' : 'No acid was measured.');
    else m++;
    auto.push(score(crit('setup'), m, n));
  }
  {
    const n: string[] = [];
    let m = 0;
    if (w.portions >= 3 && w.stirs > 0) m++;
    else n.push(!w.portions ? 'No copper(II) oxide was added.' : w.stirs === 0 ? 'Stir after each portion of CuO so it can dissolve.' : 'Add the CuO a little at a time (several spatula measures), stirring, until some stays undissolved.');
    if (solBaseExcess(v, w)) m++;
    else if (w.portions) n.push('The base was not in excess: all the CuO dissolved, so acid was left over. Keep adding CuO until some remains undissolved — excess base makes sure all the acid is used.');
    if (w.filtered) m++;
    else if (w.portions) n.push('Filter off the excess black CuO before evaporating, or it ends up in your crystals.');
    if (w.rod.length) m++;
    else if (w.water !== null) n.push('Test for the crystallisation point: dip a cold glass rod in the solution and see whether crystals form on it.');
    if (w.filteredAt !== null && w.filteredAt <= v.sol.room + 8) m++;
    else if (w.filteredAt !== null) n.push(`The crystals were filtered off while the solution was still warm (${Math.round(w.filteredAt)} °C): leave it to cool so more crystallises.`);
    else if (w.water !== null && !w.dry) n.push('Leave the solution to cool and crystallise, then filter off the crystals.');
    auto.push(score(crit('procedure'), m, n));
  }
  {
    const n: string[] = [];
    let m = 0;
    if (w.water === null) n.push('The filtrate was never evaporated.');
    else {
      if (!w.dry) m++;
      else n.push('You evaporated to dryness: the heat drives off the water of crystallisation and leaves white anhydrous CuSO₄ powder instead of blue crystals. Stop at the crystallisation point.');
      if (!w.dry && w.water <= cp + 0.01 && w.water > over) m++;
      else if (!w.dry && w.water > cp) n.push(`You stopped heating too early (about ${Math.round(w.water)} g of water left; the crystallisation point was near ${Math.round(cp)} g): few or no crystals form on cooling.`);
      else if (!w.dry) n.push('You evaporated too far: crystals were already crusting in the hot dish. Stop as soon as crystals form on the cold rod.');
    }
    if (w.wash === 'COLD' && w.drying === 'PAPER') m++;
    else if (w.filteredAt !== null)
      n.push(w.drying === 'HEAT' ? 'Never dry the crystals by heating: they lose their water of crystallisation and turn white. Press them dry between filter papers.' : w.wash === 'HOT' ? 'Wash the crystals with a little COLD distilled water: hot water dissolves them.' : w.wash !== 'COLD' ? 'Wash the crystals with a little cold distilled water to remove the solution on them.' : 'Dry the crystals between filter papers before weighing.');
    auto.push(score(crit('technique'), m, n));
  }
  const massRec = rec(s, 'mass');
  const volRec = rec(s, 'acidVol');
  const theo = solChain(v, w.acid ?? SOL_ACID_VOL, prod.mass).theoretical;
  const yieldTrue = theo > 0 ? (prod.mass / theo) * 100 : 0;
  {
    const n: string[] = [];
    let m = 0;
    if (w.acid !== null && withinAbs(volRec, w.acid, 0.5)) m++;
    else n.push('Record the volume of acid you used.');
    if (dp2(s.rec.mass)) m++;
    else n.push('Record the mass of the crystals to 2 decimal places, as the balance shows it.');
    if (w.weighed && withinAbs(massRec, prod.mass, 0.011)) m++;
    else n.push(w.weighed ? `Your mass does not match the balance (${prod.mass.toFixed(2)} g).` : 'Weigh the dry crystals.');
    if (prod.look === 'BLUE' && yieldTrue >= 40 && yieldTrue <= 95) m++;
    else n.push(prod.look === 'WHITE' ? 'The product was white anhydrous CuSO₄, not blue crystals.' : prod.look === 'SPECKS' ? 'The crystals were mixed with black CuO.' : prod.look === 'NONE' ? 'No crystals were obtained.' : `A yield of ${Math.round(yieldTrue)} % is outside the sensible range (about 40–95 %): ${yieldTrue > 95 ? 'the crystals were still wet or impure' : 'too much salt stayed in solution'}.`);
    auto.push(score(crit('readings'), m, n));
  }
  const c = saltCalc(s, (vol, mass, mo, mm, th) => solChain(v, vol, mass, mo, mm, th), w.acid ?? SOL_ACID_VOL, volRec, prod.mass, massRec, { reagent: 'H₂SO₄', salt: 'CuSO₄·5H₂O', slip: SOL_M.CuSO4 });
  auto.push(score(crit('calculations'), c.m, c.n));
  const t = solChain(v, SOL_ACID_VOL, null);
  return {
    auto,
    ai: [
      {
        criterionId: 'observation',
        question: 'State what you observed (a) when the copper(II) oxide was added to the warm acid and (b) when the evaporated solution cooled.',
        answer: s.written.observation.trim(),
        guide: '2 marks: (a) the black solid dissolves to give a blue solution (1); (b) blue crystals form (1).',
        keywords: [['black', 'dissolve', 'disappear'], ['blue solution', 'blue'], ['crystal']],
        need: 2,
      },
      {
        criterionId: 'explain',
        question: 'Why was excess copper(II) oxide used, and why must the solution not be evaporated to dryness?',
        answer: s.written.explain.trim(),
        guide: '1 mark: excess base makes sure all the acid reacts (the excess is easily filtered off); evaporating to dryness drives off the water of crystallisation (gives white anhydrous powder). Half for one reason.',
        keywords: [['all the acid', 'acid is used', 'acid reacts', 'neutralis', 'no acid'], ['water of crystallisation', 'anhydrous', 'white', 'crystal structure', 'decompos']],
        need: 2,
      },
      {
        criterionId: 'precautions',
        question: 'State two precautions taken in this preparation.',
        answer: s.written.precautions.trim(),
        guide: `1 mark for two correct precautions (half for one). ${crit('precautions').guide}`,
        keywords: [['excess'], ['dryness', 'dry ness', 'not evaporate'], ['filter paper', 'between filter'], ['goggles'], ['gently', 'warm', 'spit'], ['stir'], ['cold water', 'wash'], ['glass rod', 'crystallisation point']],
        need: 2,
      },
    ],
    solution: [
      'CuO + H₂SO₄ → CuSO₄ + H₂O; the crystals are CuSO₄·5H₂O (blue).',
      `Moles of H₂SO₄ = ${v.sol.acidConc.toFixed(2)} × 50.0 ÷ 1000 = ${sf(t.molesAcid)} mol = maximum moles of CuSO₄·5H₂O (1 : 1).`,
      `Molar mass CuSO₄·5H₂O = 63.5 + 32 + 4(16) + 5(18) = 249.5 g mol⁻¹; theoretical mass = ${sf(t.molesAcid)} × 249.5 = ${sf(t.theoretical)} g.`,
      `Your crystals: ${prod.mass.toFixed(2)} g → yield = ${prod.mass.toFixed(2)} ÷ ${sf(theo)} × 100 = ${sf(yieldTrue)} %.`,
      `Crystallisation point for your filtrate: about ${Math.round(cp)} g of water left (about a third of the volume).`,
    ],
    facts: [
      `Task SOL: acid ${w.acid ?? '—'} cm³ warmed to ${w.warmAtAdd === null ? '—' : Math.round(w.warmAtAdd)} °C; CuO ${w.cuo.toFixed(2)} g in ${w.portions} portions (${solBaseExcess(v, w) ? 'excess' : 'NOT excess'}); filtered ${w.filtered ? 'yes' : 'no'}.`,
      `Evaporated to ${w.water === null ? '—' : `${w.water.toFixed(1)} g water`}${w.dry ? ' (to dryness)' : ''}; rod tests ${w.rod.length}; filtered at ${w.filteredAt === null ? '—' : `${Math.round(w.filteredAt)} °C`}; wash ${w.wash ?? '—'}, dry ${w.drying ?? '—'}.`,
      `Product ${prod.look.toLowerCase()} ${prod.mass.toFixed(2)} g (recorded ${s.rec.mass || '—'}); yield ${sf(yieldTrue)} %.`,
    ],
  };
}

// ------------------------------------------------------------------ PPT

function gradePpt(s: ChemSaltsState, v: ChemSaltsVariant): Out {
  const w = s.ppt;
  const i = PPT_INFO[v.ppt.pair];
  const auto: CriterionScore[] = [];
  {
    const n: string[] = [];
    let m = 0;
    if (w.cat !== null && withinAbs(w.cat, PPT_CAT_VOL, 0.5)) m++;
    else n.push(`Measure 25.0 cm³ of the ${i.cation.formula} solution${w.cat !== null ? `, not ${w.cat} cm³` : ''}.`);
    if (w.an !== null && pptExcess(v, w)) m++;
    else n.push(w.an === null ? `Add the ${i.anion.formula} solution.` : `${w.an} cm³ of ${i.anion.formula} is not an excess: some ${i.cation.formula} stayed in solution. Use more (the lesson uses ${PPT_AN_VOL} cm³) so all of it precipitates.`);
    auto.push(score(crit('setup'), m, n));
  }
  {
    const n: string[] = [];
    let m = 0;
    if (w.mixed && w.stirred) m++;
    else n.push(w.mixed ? 'Stir the mixture so the two solutions react completely.' : 'Mix the two solutions.');
    if (w.paper) m++;
    else n.push('Weigh the dry filter paper before filtering: you need its mass to find the mass of precipitate.');
    if (w.filtered) m++;
    else n.push('Filter off the precipitate.');
    if (w.washes >= 1) m++;
    else if (w.filtered) n.push(`Wash the precipitate with distilled water: soluble ${i.spectator} left on it adds to the mass.`);
    if (w.dried >= 1 && w.weighings.length) m++;
    else if (w.filtered) n.push('Dry the paper and precipitate in a warm place before weighing: water adds to the mass.');
    auto.push(score(crit('procedure'), m, n));
  }
  {
    const n: string[] = [];
    let m = 0;
    if (w.rinsed) m++;
    else if (w.filtered) n.push('Rinse the beaker with distilled water into the funnel so no precipitate is left behind.');
    if (w.dried >= 1 && !w.flame) m++;
    else if (w.flame) n.push('Never dry the filter paper over a flame: it chars and burns. Use a warm oven (about 100 °C) or a warm place.');
    const last = w.weighings.length >= 2 ? [w.weighings.at(-2)!, w.weighings.at(-1)!] : null;
    if (last && last[1] > last[0] && pptTotal(v, w, last[0]) === pptTotal(v, w, last[1])) m++;
    else if (w.dried >= 1) n.push('Dry and weigh again until two weighings agree (constant mass): then all the water has gone.');
    if (!w.filtered && !n.length) n.push('Nothing was filtered and dried.');
    auto.push(score(crit('technique'), m, n));
  }
  const paperRec = rec(s, 'paper');
  const t1 = rec(s, 'total1');
  const t2 = rec(s, 'total2');
  const totRec = t2 ?? t1;
  const pptRec = rec(s, 'ppt');
  const finalTrue = w.weighings.length ? pptTotal(v, w, w.weighings.at(-1)!) : null;
  const massTrue = finalTrue === null ? 0 : roundTo(finalTrue - v.ppt.paper);
  {
    const n: string[] = [];
    let m = 0;
    const cells = [s.rec.paper, s.rec.total1, ...(s.rec.total2.trim() ? [s.rec.total2] : []), s.rec.ppt];
    if (cells.every(dp2)) m++;
    else n.push('Record every mass to 2 decimal places, as the balance shows it.');
    if (w.paper && withinAbs(paperRec, v.ppt.paper, 0.011)) m++;
    else n.push(w.paper ? `The mass of the filter paper does not match the balance (${v.ppt.paper.toFixed(2)} g).` : 'The filter paper was not weighed.');
    const firstTrue = w.weighings.length ? pptTotal(v, w, w.weighings[0]!) : null;
    const secondTrue = w.weighings.length >= 2 ? pptTotal(v, w, w.weighings.at(-1)!) : null;
    const totalOk = firstTrue !== null && withinAbs(t1, firstTrue, 0.011) && (t2 === null || secondTrue === null || withinAbs(t2, secondTrue, 0.011));
    if (totalOk) m++;
    else n.push(firstTrue === null ? 'The dried precipitate was not weighed.' : `Your paper + precipitate mass does not match the balance (${firstTrue.toFixed(2)} g${secondTrue !== null ? ` then ${secondTrue.toFixed(2)} g` : ''}).`);
    if (pptRec !== null && paperRec !== null && totRec !== null && withinAbs(pptRec, totRec - paperRec, 0.011)) m++;
    else n.push('Mass of precipitate = (paper + precipitate) − paper, using your final weighing.');
    auto.push(score(crit('readings'), m, n));
  }
  const c = saltCalc(s, (vol, mass, mo, mm, th) => pptChain(v, vol, mass, mo, mm, th), w.cat ?? PPT_CAT_VOL, rec(s, 'catVol'), massTrue, pptRec, { reagent: i.cation.formula, salt: i.product.formula });
  auto.push(score(crit('calculations'), c.m, c.n));
  const t = pptChain(v, PPT_CAT_VOL, massTrue);
  return {
    auto,
    ai: [
      {
        criterionId: 'observation',
        question: `State what you observed when the ${i.cation.formula} and ${i.anion.formula} solutions were mixed.`,
        answer: s.written.observation.trim(),
        guide: `2 marks: a ${i.product.colourName} precipitate (1) forms immediately / at once (1).`,
        keywords: [[i.product.colourName.split(' ').at(-1)!], ['precipitate', 'solid', 'ppt'], ['immediately', 'at once', 'instantly', 'quickly']],
        need: 2,
      },
      {
        criterionId: 'explain',
        question: 'Why is the precipitate washed with distilled water before drying?',
        answer: s.written.explain.trim(),
        guide: `1 mark: to remove the soluble ${i.spectator} (and excess ${i.anion.formula}) — it would add to the mass (the yield would be too high).`,
        keywords: [['soluble', 'nacl', 'sodium chloride', 'impurit', 'spectator', i.spectator.toLowerCase()], ['mass', 'weigh', 'yield', 'remove']],
        need: 2,
      },
      {
        criterionId: 'precautions',
        question: 'State two precautions taken in this preparation.',
        answer: s.written.precautions.trim(),
        guide: `1 mark for two correct precautions (half for one). ${crit('precautions').guide}`,
        keywords: [['excess'], ['wash', 'distilled'], ['dry', 'constant mass'], ['weigh'], ['rinse'], ['goggles'], ['stir']],
        need: 2,
      },
    ],
    solution: [
      `${i.equation}: 1 mol ${i.cation.formula} gives 1 mol ${i.product.formula} (${i.product.colourName} precipitate).`,
      `Moles of ${i.cation.formula} = ${v.ppt.catConc.toFixed(2)} × 25.0 ÷ 1000 = ${sf(t.molesAcid)} mol; theoretical mass = ${sf(t.molesAcid)} × ${i.product.M} = ${sf(t.theoretical)} g.`,
      `Your precipitate: ${massTrue.toFixed(2)} g → yield = ${sf(t.yield ?? 0)} %.`,
      `${PPT_AN_VOL} cm³ of ${v.ppt.anConc.toFixed(2)} mol dm⁻³ ${i.anion.formula} is ${sf((v.ppt.anConc * PPT_AN_VOL) / 1000)} mol — an excess.`,
    ],
    facts: [
      `Task PPT: ${w.cat ?? '—'} cm³ ${i.cation.formula} + ${w.an ?? '—'} cm³ ${i.anion.formula} (${pptExcess(v, w) ? 'excess' : 'NOT excess'}); stirred ${w.stirred ? 'yes' : 'no'}; paper weighed first ${w.paper ? 'yes' : 'no'}.`,
      `Filtered ${w.filtered ? 'yes' : 'no'}, beaker rinsed ${w.rinsed ? 'yes' : 'no'}, washes ${w.washes}, dried ${w.dried}×${w.flame ? ' (over a flame)' : ''}, weighings ${w.weighings.length}.`,
      `Paper ${v.ppt.paper.toFixed(2)} g; final total ${finalTrue?.toFixed(2) ?? '—'} g; precipitate ${massTrue.toFixed(2)} g (recorded ${s.rec.ppt || '—'}).`,
    ],
  };
}
const roundTo = (x: number) => Math.round(x * 100) / 100;

// ------------------------------------------------------------------ CHROM

function gradeChrom(s: ChemSaltsState, v: ChemSaltsVariant): Out {
  const w = s.chrom;
  const auto: CriterionScore[] = [];
  const lanes = new Set(w.spots.filter((x) => x.n > 0).map((x) => x.lane));
  {
    const n: string[] = [];
    let m = 0;
    if (w.line === 'PENCIL') m++;
    else n.push(w.line === 'INK' ? 'The baseline was drawn in ink: ink dissolves in the solvent and separates itself, spoiling the chromatogram. Use a pencil — graphite does not dissolve.' : 'Draw a baseline in pencil.');
    if (w.lineAt !== null && w.lineAt >= 1 && w.lineAt <= 2 && lanes.size === 3) m++;
    else n.push(w.lineAt !== null && (w.lineAt < 1 || w.lineAt > 2) ? `Draw the baseline about 1.5 cm from the bottom (yours was ${w.lineAt} cm).` : 'Spot the ink and both pure dyes on the baseline.');
    auto.push(score(crit('setup'), m, n));
  }
  const above = chromAboveLine(w);
  const ranOff = chromRanOff(v, w);
  {
    const n: string[] = [];
    let m = 0;
    const spots = w.spots.filter((x) => x.n > 0);
    if (spots.length === 3 && spots.every((x) => x.n >= 2 && x.wet === 0)) m++;
    else n.push(spots.some((x) => x.wet > 0) ? 'A spot was re-spotted while still wet: it spreads into a big spot. Let each application dry first.' : 'Make small, concentrated spots: apply each one, let it dry and spot again.');
    if (w.depth !== null && !above) m++;
    else if (w.depth !== null) n.push('The solvent was above the baseline: the spots dissolved straight into the solvent instead of being carried up the paper. Keep the solvent level below the baseline.');
    else n.push('The paper was never stood in the solvent.');
    if (w.developed !== null && w.covered && w.coveredThroughout) m++;
    else if (w.developed !== null) n.push('Cover the tank: the air inside stays saturated with solvent vapour, so the solvent does not evaporate from the paper and the front rises evenly.');
    if (w.developed !== null && !ranOff) m++;
    else if (ranOff) n.push('The solvent ran off the top of the paper: you cannot measure how far it went. Remove the paper when the front is near the top.');
    if (w.frontMarked) m++;
    else if (w.developed !== null) n.push('Mark the solvent front with a pencil as soon as you take the paper out — it disappears as the paper dries.');
    auto.push(score(crit('procedure'), m, n));
  }
  const truthSolvent = chromSolventDist(v, w);
  const spots = chromSpots(v, w);
  const distOf = (lane: 'A' | 'B') => spots.find((x) => x.lane === lane)?.dist ?? null;
  const inkTrue = spots.filter((x) => x.lane === 'INK').sort((a, b) => a.dist - b.dist);
  const solvRec = rec(s, 'solvent');
  const inkKeys = ['ink1', 'ink2', 'ink3', 'ink4'] as const;
  const rfKeys = ['rf1', 'rf2', 'rf3', 'rf4'] as const;
  const inkRec = inkKeys.map((k) => rec(s, k));
  const inkPairs = inkKeys.map((k, i) => ({ d: inkRec[i]!, rf: rec(s, rfKeys[i]!) })).filter((x) => x.d !== null) as { d: number; rf: number | null }[];
  const inkSorted = [...inkPairs].sort((a, b) => a.d - b.d);
  {
    const n: string[] = [];
    let m = 0;
    const fromEdge = truthSolvent !== null && w.lineAt !== null && withinAbs(solvRec, truthSolvent + w.lineAt, 0.15);
    if (truthSolvent !== null && !fromEdge && (withinAbs(solvRec, truthSolvent, 0.2) || withinAbs(rec(s, 'spotA'), distOf('A') ?? -99, 0.2))) m++;
    else if (fromEdge) n.push('You measured from the bottom edge of the paper: measure every distance from the baseline, where the spots started.');
    else if (truthSolvent === null) n.push('There was no usable chromatogram to measure.');
    else n.push('Measure from the baseline to the solvent front and to each spot.');
    const centres = (['A', 'B'] as const).every((l) => {
      const t = spots.find((x) => x.lane === l);
      const r = rec(s, l === 'A' ? 'spotA' : 'spotB');
      return t && r !== null && withinAbs(r, t.dist, 0.15);
    });
    const edges = (['A', 'B'] as const).some((l) => {
      const t = spots.find((x) => x.lane === l);
      const r = rec(s, l === 'A' ? 'spotA' : 'spotB');
      return t && r !== null && !withinAbs(r, t.dist, 0.15) && withinAbs(Math.abs(r - t.dist), t.r, 0.12);
    });
    if (centres) m++;
    else if (edges) n.push('Measure to the centre of each spot, not to its top or bottom edge.');
    else if (spots.length) n.push('Measure from the baseline to the centre of each spot.');
    if (lanes.size === 3) m++;
    else n.push('Run the ink and both pure dyes side by side on the same paper, so they can be compared directly.');
    auto.push(score(crit('technique'), m, n));
  }
  {
    const n: string[] = [];
    let m = 0;
    if (truthSolvent === null) n.push(ranOff ? 'The solvent front ran off the paper, so its distance is unknown.' : 'There is no solvent front to measure.');
    else if (withinAbs(solvRec, truthSolvent, 0.1)) m++;
    else n.push(`Your solvent distance is not right (it moved ${truthSolvent.toFixed(1)} cm from the baseline).`);
    const want = [distOf('A'), distOf('B'), ...inkTrue.map((x) => x.dist)];
    const got = [rec(s, 'spotA'), rec(s, 'spotB'), ...inkTrue.map((_, k) => inkSorted[k]?.d ?? null)];
    const good = want.filter((x, k) => x !== null && withinAbs(got[k] ?? null, x, 0.15)).length;
    const total = want.filter((x) => x !== null).length;
    if (total && good === total) m += 2;
    else if (total && good >= total / 2) {
      m += 1;
      n.push(`${total - good} spot distance${total - good === 1 ? '' : 's'} did not match the paper (measure to ±0.1 cm from the baseline to each spot's centre).`);
    } else if (total) n.push('Most spot distances did not match the paper.');
    else n.push(above ? 'The spots washed into the solvent, so there were no spots to measure.' : 'There were no spots to measure.');
    const cells = [s.rec.solvent, s.rec.spotA, s.rec.spotB, ...inkKeys.map((k) => s.rec[k]).filter((x) => x.trim())];
    if (cells.every((c) => c.trim() && parseNumber(c) !== null && decimalPlaces(c) === 1)) m++;
    else n.push('Record every distance in cm to 1 decimal place (the nearest mm), e.g. 6.4.');
    auto.push(score(crit('readings'), m, n));
  }
  {
    const n: string[] = [];
    let m = 0;
    const solvUse = [...(truthSolvent !== null ? [truthSolvent] : []), ...(solvRec !== null && solvRec > 0 ? [solvRec] : [])];
    const rfOk = (x: number | null, lane: 'A' | 'B', recD: number | null) => {
      const dye = v.chrom[lane];
      const t = chromRf(v, w, dye);
      if (withinAbs(x, t, 0.03)) return true;
      return recD !== null && solvUse.some((sv) => withinAbs(x, recD / sv, 0.02));
    };
    for (const lane of ['A', 'B'] as const) {
      const x = val(s, lane === 'A' ? 'rfA' : 'rfB');
      if (rfOk(x, lane, rec(s, lane === 'A' ? 'spotA' : 'spotB'))) m++;
      else n.push(x === null ? `Work out the Rf of dye ${lane}.` : x > 1 ? `Rf of ${lane} cannot be more than 1: divide the spot's distance by the solvent's.` : `Rf of ${lane} = distance moved by the spot ÷ distance moved by the solvent (${sf(chromRf(v, w, v.chrom[lane]), 2)}).`);
    }
    const inkOk = inkSorted.length > 0 && inkSorted.every((p) => p.rf !== null && solvUse.some((sv) => withinAbs(p.rf, p.d / sv, 0.02)));
    if (inkOk) m++;
    else n.push('Work out the Rf of every ink spot (its distance ÷ the solvent distance).');
    const hasB = v.chrom.ink.includes(v.chrom.B);
    const yes = (x: string) => /^(y|yes|present|true)/i.test(x.trim());
    const no = (x: string) => /^(n|no|absent|false|not)/i.test(x.trim());
    if (yes(s.rec.hasA) && (hasB ? yes(s.rec.hasB) : no(s.rec.hasB))) m++;
    else n.push(`The ink contains A${hasB ? ' and B' : ' but not B'}: a dye is present when an ink spot has the same colour and Rf (the same height) as the pure dye.`);
    if (rec(s, 'nComp') === v.chrom.ink.length) m++;
    else n.push(`The ink separated into ${v.chrom.ink.length} spots: it has ${v.chrom.ink.length} components.`);
    auto.push(score(crit('calculations'), m, n));
  }
  const solv = w.solvent ?? v.chrom.solvent;
  return {
    auto,
    ai: [
      {
        criterionId: 'observation',
        question: 'Describe what you observed on the chromatogram, comparing the ink with the pure dyes A and B.',
        answer: s.written.observation.trim(),
        guide: `2 marks: the ink separated into several (${v.chrom.ink.length}) coloured spots (1); an ink spot is level with (same Rf as) A${v.chrom.ink.includes(v.chrom.B) ? ' and one with B' : ', none with B'}, so the ink contains A${v.chrom.ink.includes(v.chrom.B) ? ' and B' : ' only'} (1).`,
        keywords: [['spots', 'separat', 'components', 'colours'], ['same height', 'same rf', 'level', 'same distance', 'matches'], ['dye a', ' a ', 'contains']],
        need: 2,
      },
      {
        criterionId: 'explain',
        question: 'Why is the baseline drawn in pencil and not in ink?',
        answer: s.written.explain.trim(),
        guide: '1 mark: pencil (graphite) is insoluble in the solvent and does not move/separate; ink would dissolve and separate, mixing with the spots.',
        keywords: [['graphite', 'pencil'], ['insoluble', 'not dissolve', "doesn't dissolve", 'does not dissolve', 'not move', 'would separate', 'run', 'dissolve']],
        need: 2,
      },
      {
        criterionId: 'precautions',
        question: 'State two precautions taken in this experiment.',
        answer: s.written.precautions.trim(),
        guide: `1 mark for two correct precautions (half for one). ${crit('precautions').guide}`,
        keywords: [['pencil'], ['below', 'solvent level'], ['cover', 'lid'], ['small', 'concentrated', 'dry'], ['flame', 'flammable'], ['front'], ['baseline']],
        need: 2,
      },
    ],
    solution: [
      `Solvent: ${solv === 'WATER' ? 'water' : 'ethanol'}. Rf = distance moved by spot ÷ distance moved by solvent, both measured from the baseline; Rf has no unit and is less than 1.`,
      `Dye A (${CHROM_DYE_INFO[v.chrom.A].name}) Rf ${sf(chromRf(v, w, v.chrom.A), 2)}; dye B (${CHROM_DYE_INFO[v.chrom.B].name}) Rf ${sf(chromRf(v, w, v.chrom.B), 2)}.`,
      `The ink has ${v.chrom.ink.length} components: ${v.chrom.ink.map((d) => `${CHROM_DYE_INFO[d].name} (Rf ${sf(chromRf(v, w, d), 2)})`).join(', ')}. It contains A${v.chrom.ink.includes(v.chrom.B) ? ' and B' : ' but not B'}.`,
      truthSolvent !== null ? `Your solvent front moved ${truthSolvent.toFixed(1)} cm from the baseline.` : 'Your chromatogram had no measurable solvent front.',
    ],
    facts: [
      `Task CHROM: baseline ${w.line ?? '—'} at ${w.lineAt ?? '—'} cm; spots ${w.spots.map((x) => `${x.lane}×${x.n}${x.wet ? ` (${x.wet} wet)` : ''}`).join(', ') || '—'}; solvent ${w.solvent ?? '—'} ${w.depth ?? '—'} cm deep${above ? ' (ABOVE the baseline)' : ''}; covered ${w.covered && w.coveredThroughout ? 'yes' : 'no'}.`,
      `Developed ${w.developed === null ? '—' : `${Math.round(w.developed / 60)} min`}${ranOff ? ' (ran off the top)' : ''}; front marked ${w.frontMarked ? 'yes' : 'no'}; solvent ${truthSolvent?.toFixed(1) ?? '—'} cm (recorded ${s.rec.solvent || '—'}).`,
      `Rf A ${s.answers.rfA.value || '—'}, B ${s.answers.rfB.value || '—'}; A in ink: ${s.rec.hasA || '—'}, B: ${s.rec.hasB || '—'} (true ${v.chrom.ink.includes(v.chrom.B) ? 'yes' : 'no'}); components ${s.rec.nComp || '—'}.`,
    ],
  };
}

// ------------------------------------------------------------------ MP

function gradeMp(s: ChemSaltsState, v: ChemSaltsVariant): Out {
  const w = s.mp;
  const auto: CriterionScore[] = [];
  const minW = mpMinWater(v);
  {
    const n: string[] = [];
    let m = 0;
    if (w.weighedImpure) m++;
    else n.push('Weigh the impure sample first.');
    if (mpDissolved(v, w) && !mpTooMuch(v, w)) m++;
    else n.push(mpTooMuch(v, w) ? `Too much water (${w.water} cm³; about ${Math.ceil(minW / 10) * 10} cm³ was enough): more benzoic acid stays dissolved when cold, so the yield is poor. Use the minimum of boiling water.` : 'Add boiling water a little at a time until the benzoic acid has just dissolved at the boil.');
    auto.push(score(crit('setup'), m, n));
  }
  {
    const n: string[] = [];
    let m = 0;
    if (mpDissolved(v, w)) m++;
    else n.push('The benzoic acid was not fully dissolved at the boil.');
    if (w.hotFiltered) m++;
    else n.push('Filter the hot solution to remove the insoluble sand and charcoal.');
    if (w.hotFiltered && w.funnelWarm) m++;
    else if (w.hotFiltered) n.push('Warm the funnel first: in a cold funnel the benzoic acid crystallises in the stem and paper and is lost.');
    if (w.cooling === 'SLOW' && w.iced) m++;
    else n.push(w.cooling === 'FAST' ? 'Cool slowly first (then in ice): fast cooling gives tiny crystals that trap impurities.' : !w.iced && w.cooling ? 'Finish the cooling in an ice bath: less benzoic acid stays dissolved.' : 'Cool the filtrate slowly, then in ice, to crystallise.');
    if (w.collected && w.washed && w.dried) m++;
    else n.push(!w.collected ? 'Filter off the crystals.' : !w.washed ? 'Wash the crystals with a little ice-cold water.' : 'Dry the crystals before weighing.');
    auto.push(score(crit('procedure'), m, n));
  }
  const runs = w.runs.filter((r) => r.done && r.start !== null && r.end !== null);
  {
    const n: string[] = [];
    let m = 0;
    const fast = runs.filter((r) => (r.rateStart ?? 0) > MP_SLOW_MAX || (r.rateEnd ?? 0) > MP_SLOW_MAX);
    if (runs.length && !fast.length) m++;
    else if (fast.length) n.push(`The oil bath was heated too fast near the melting point (${Math.round(Math.max(...fast.map((r) => Math.max(r.rateStart ?? 0, r.rateEnd ?? 0))))} °C per minute): the thermometer runs ahead of the sample, so the melting range you read is too high. Heat quickly to about 110 °C, then 1–2 °C per minute.`);
    else n.push('No melting point was measured.');
    const samples = new Set(runs.map((r) => r.sample));
    if (samples.size === 2) m++;
    else if (runs.length) n.push(`Measure the melting range of ${samples.has('IMPURE') ? 'the recrystallised' : 'the impure'} sample too, to compare them.`);
    if (runs.length && runs.every((r) => r.attached)) m++;
    else if (runs.length) n.push('Fasten the capillary to the thermometer with the sample level with the bulb, so the thermometer reads the temperature of the sample.');
    auto.push(score(crit('technique'), m, n));
  }
  const prod = mpProduct(v, w);
  const impRec = rec(s, 'impure');
  const pureRec = rec(s, 'pure');
  const lastRun = (sample: 'IMPURE' | 'PURE') => [...runs].reverse().find((r) => r.sample === sample) ?? null;
  const ri = lastRun('IMPURE');
  const rp = lastRun('PURE');
  const rangeI = mpRange(v, w, 'IMPURE');
  const rangeP = mpRange(v, w, 'PURE');
  const recI: [number | null, number | null] = [rec(s, 'iStart'), rec(s, 'iEnd')];
  const recP: [number | null, number | null] = [rec(s, 'pStart'), rec(s, 'pEnd')];
  {
    const n: string[] = [];
    let m = 0;
    if (dp2(s.rec.impure) && dp2(s.rec.pure) && w.weighedImpure && w.weighedPure && withinAbs(impRec, v.mp.impure, 0.011) && withinAbs(pureRec, prod.mass, 0.011)) m++;
    else n.push(!w.weighedPure ? 'Weigh the dry recrystallised benzoic acid.' : `Record both masses to 2 d.p. as the balance shows them (${v.mp.impure.toFixed(2)} g and ${prod.mass.toFixed(2)} g).`);
    const matches = (r: typeof ri, x: [number | null, number | null]) => !!r && withinAbs(x[0], r.start!, 0.6) && withinAbs(x[1], r.end!, 0.6);
    if (ri && rp && matches(ri, recI) && matches(rp, recP)) m++;
    else n.push(ri && rp ? 'Write down the thermometer readings you took when melting started and when it was complete.' : 'Record the melting range of both samples.');
    for (const [r, range, name] of [[ri, rangeI, 'impure'], [rp, rangeP, 'recrystallised']] as const) {
      if (r && withinAbs(r.start, range[0], 1.5) && withinAbs(r.end, range[1], 1.5)) m++;
      else if (r) n.push(`Your ${name} range (${r.start!.toFixed(1)}–${r.end!.toFixed(1)} °C) is not the sample's (${range[0].toFixed(1)}–${range[1].toFixed(1)} °C)${(r.rateStart ?? 0) > MP_SLOW_MAX ? ': heating too fast made it read high' : !r.attached ? ': the capillary was not level with the bulb' : ': read the thermometer the moment melting starts and when the last solid goes'}.`);
    }
    auto.push(score(crit('readings'), m, n));
  }
  {
    const n: string[] = [];
    let m = 0;
    const recov = val(s, 'recovery');
    const pairs: [number, number][] = [[prod.mass, v.mp.impure], ...(impRec && pureRec ? ([[pureRec, impRec]] as [number, number][]) : [])];
    if (ok2(recov, pairs.map(([p, i]) => (p / i) * 100), 0.02)) m += 2;
    else n.push(recov === null ? 'Work out the percentage recovery.' : `Percentage recovery = mass of pure product ÷ mass of impure sample × 100 (${sf((prod.mass / v.mp.impure) * 100)} %).`);
    const width = (x: [number | null, number | null], r: typeof ri) => [...(x[0] !== null && x[1] !== null ? [x[1] - x[0]] : []), ...(r ? [r.end! - r.start!] : [])];
    const iw = val(s, 'impureWidth');
    if (width(recI, ri).some((t) => withinAbs(iw, t, 0.3))) m++;
    else n.push('The width of the impure range = the temperature it finished melting − the temperature it started.');
    const pw = val(s, 'pureWidth');
    if (width(recP, rp).some((t) => withinAbs(pw, t, 0.3))) m++;
    else n.push('The width of the recrystallised range = finish − start.');
    const dep = val(s, 'depression');
    const depT = [...(recI[1] !== null ? [MP_LIT - recI[1]] : []), ...(ri ? [MP_LIT - ri.end!] : [])];
    if (depT.some((t) => withinAbs(dep, t, 0.3))) m++;
    else n.push(`Depression = 122 °C − the temperature at which the impure sample finished melting.`);
    auto.push(score(crit('calculations'), m, n));
  }
  return {
    auto,
    ai: [
      {
        criterionId: 'observation',
        question: 'Describe the crystals that formed on cooling, and compare how the impure and recrystallised samples melted.',
        answer: s.written.observation.trim(),
        guide: '2 marks: white (needle-like) crystals (1); the impure sample melts at a lower temperature and over a wider range; the recrystallised one sharply near 122 °C (1).',
        keywords: [['white', 'needle', 'crystals'], ['lower', 'below', 'depress'], ['wider', 'range', 'broad', 'sharp']],
        need: 2,
      },
      {
        criterionId: 'explain',
        question: 'Why is the minimum volume of hot water used, and why does the impure sample melt lower and over a range?',
        answer: s.written.explain.trim(),
        guide: '1 mark: the minimum hot solvent so that most of the solid crystallises out on cooling (little stays dissolved — better yield); impurities lower (depress) the melting point and broaden the range. Half for one.',
        keywords: [['minimum', 'less water', 'too much', 'stays dissolved', 'yield', 'saturated'], ['impurit'], ['lower', 'depress', 'broad', 'wider', 'range']],
        need: 2,
      },
      {
        criterionId: 'precautions',
        question: 'State two precautions taken in this experiment.',
        answer: s.written.precautions.trim(),
        guide: `1 mark for two correct precautions (half for one). ${crit('precautions').guide}`,
        keywords: [['minimum'], ['slowly', 'slow'], ['warm', 'funnel', 'pre-warm'], ['dry'], ['ice'], ['goggles'], ['oil', 'bath'], ['bulb', 'level']],
        need: 2,
      },
    ],
    solution: [
      `Minimum boiling water for your sample: about ${Math.ceil(minW / 10) * 10} cm³ (benzoic acid dissolves about 5.6 g per 100 cm³ at 100 °C, only 0.17 g in ice-cold water).`,
      `Recovery = ${prod.mass.toFixed(2)} ÷ ${v.mp.impure.toFixed(2)} × 100 = ${sf((prod.mass / v.mp.impure) * 100)} %.`,
      `Impure sample melts ${rangeI[0].toFixed(1)}–${rangeI[1].toFixed(1)} °C (${(rangeI[1] - rangeI[0]).toFixed(1)} °C wide); your recrystallised sample ${rangeP[0].toFixed(1)}–${rangeP[1].toFixed(1)} °C — purer: higher and sharper, close to 122 °C.`,
      'Heat fast to about 110 °C, then 1–2 °C per minute: at 12 °C per minute the thermometer reads about 3–4 °C ahead of the sample.',
    ],
    facts: [
      `Task MP: water ${w.water} cm³ (min ${Math.round(minW)}); boiled ${w.boiled ? 'yes' : 'no'}; hot filtered ${w.hotFiltered ? (w.funnelWarm ? 'warm funnel' : 'COLD funnel') : 'no'}; cooling ${w.cooling ?? '—'}${w.iced ? ' + ice' : ''}; washed ${w.washed ? 'yes' : 'no'}, dried ${w.dried ? 'yes' : 'no'}.`,
      `Product ${prod.mass.toFixed(2)} g (recorded ${s.rec.pure || '—'}); runs ${runs.map((r) => `${r.sample} ${r.start?.toFixed(1)}–${r.end?.toFixed(1)} °C at ${Math.round(r.rateStart ?? 0)} °C/min${r.attached ? '' : ' (loose)'}`).join('; ') || '—'}.`,
      `True ranges: impure ${rangeI[0].toFixed(1)}–${rangeI[1].toFixed(1)}, pure ${rangeP[0].toFixed(1)}–${rangeP[1].toFixed(1)} °C; thermometer lead at 2 °C/min ${(mpThermoFor(0, 2) - 0).toFixed(1)} °C.`,
    ],
  };
}
