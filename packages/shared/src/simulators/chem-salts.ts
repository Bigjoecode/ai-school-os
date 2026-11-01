import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { labBetween, labRandom, roundDp } from './seeded';

/**
 * chem-salts: preparing and purifying substances (WAEC practical chemistry).
 * Four tasks, one per lesson:
 *  - SOL   (pr-chem-preparing-soluble-salt): CuSO₄·5H₂O from excess CuO and
 *          warm dilute H₂SO₄. CuO + H₂SO₄ → CuSO₄ + H₂O. Filter off the excess
 *          base, evaporate to the crystallisation point (crystals on a cold
 *          glass rod), cool, filter, wash with a little cold water, dry between
 *          filter papers, weigh; percentage yield. The crystals that form follow
 *          the real solubility of CuSO₄ in water (14 g/100 g at 0 °C to 75 g at
 *          100 °C) and the water bound in the pentahydrate; evaporating to
 *          dryness leaves white anhydrous CuSO₄.
 *  - PPT   (pr-chem-preparing-insoluble-salt): CaCO₃ by double decomposition,
 *          CaCl₂ + Na₂CO₃ (in excess) → CaCO₃ + 2NaCl; weigh the dry filter
 *          paper, filter, wash, dry to constant mass; percentage yield. The
 *          sandbox also has Pb(NO₃)₂ + 2KI → PbI₂ (yellow) and
 *          BaCl₂ + Na₂SO₄ → BaSO₄ (white).
 *  - CHROM (pr-chem-paper-chromatography): pencil baseline, spots of the ink
 *          and the pure dyes A and B, solvent below the baseline, tank covered.
 *          The front rises by capillarity (Lucas–Washburn: h² = Kt), each dye
 *          moves at its seeded Rf and its spot spreads by diffusion; measure from
 *          the baseline, Rf = spot ÷ solvent; identify the dyes in the ink.
 *  - MP    (pr-chem-recrystallisation-melting-point): impure benzoic acid
 *          (with sand/charcoal and a soluble impurity) dissolved in the minimum
 *          boiling water (5.6 g/100 cm³ at 100 °C, 0.17 g at 0 °C), filtered hot
 *          through a warmed funnel, cooled slowly then in ice, filtered, washed
 *          with ice-cold water, dried, weighed; melting ranges in a capillary in
 *          an oil bath. The impure sample melts lower and over a wider range (a
 *          seeded depression); heating fast makes the thermometer run ahead of
 *          the sample, so the recorded range is too high.
 */

export const SALTS_TASKS = ['SOL', 'PPT', 'CHROM', 'MP'] as const;
export type SaltsTask = (typeof SALTS_TASKS)[number];
export const SALTS_LESSONS: Record<string, SaltsTask> = {
  'pr-chem-preparing-soluble-salt': 'SOL',
  'pr-chem-preparing-insoluble-salt': 'PPT',
  'pr-chem-paper-chromatography': 'CHROM',
  'pr-chem-recrystallisation-melting-point': 'MP',
};
export const saltsLessonTask = (practicalId?: string | null): SaltsTask => (practicalId && SALTS_LESSONS[practicalId]) || 'SOL';

const sf3 = (x: number) => Number(x.toPrecision(3));
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
/** Piecewise-linear interpolation in a [x, y][] table. */
function interp(table: [number, number][], x: number): number {
  if (x <= table[0]![0]) return table[0]![1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i]!;
    const [x0, y0] = table[i - 1]!;
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return table.at(-1)![1];
}

// ================================================================== SOL: CuSO₄·5H₂O

export const SOL_M = { CuO: 79.5, CuSO4: 159.5, hydrate: 249.5, H2O: 18 } as const;
/** Solubility of CuSO₄ (anhydrous) in g per 100 g of water against °C. */
const CUSO4_SOLUBILITY: [number, number][] = [
  [0, 14.3], [10, 17.2], [20, 20.7], [30, 25.0], [40, 28.5], [50, 33.3], [60, 40.0], [70, 47.0], [80, 55.0], [90, 64.0], [100, 75.4],
];
export const cuso4Solubility = (T: number) => interp(CUSO4_SOLUBILITY, T);
/** Volumes the measuring cylinder can be filled to (cm³); the lesson uses 50.0. */
export const SOL_ACID_VOLS = [25, 50, 100] as const;
export const SOL_ACID_VOL = 50;
/** Acid "warm" range (°C): enough to dissolve the CuO quickly, short of spitting. */
export const SOL_WARM = { min: 45, max: 85, boil: 95 } as const;
/** Water evaporated per second of real heating in the dish (g s⁻¹) and the dish's cooling time constant (s). */
export const SOL_EVAP_RATE = 0.09;
export const SOL_COOL_TAU = 240;

export interface SolVariant {
  acidConc: number;
  acidVol: number;
  /** g of CuO in one spatula measure. */
  portion: number;
  /** Fraction of the solution lost in the filter paper (each filtration). */
  filterLoss: number;
  room: number;
}

// ================================================================== PPT: precipitation

export const PPT_PAIRS = ['CACO3', 'PBI2', 'BASO4'] as const;
export type PptPair = (typeof PPT_PAIRS)[number];
export interface PptPairInfo {
  cation: { name: string; formula: string };
  anion: { name: string; formula: string };
  product: { name: string; formula: string; M: number; colour: string; colourName: string };
  /** mol of the anion salt per mol of the cation salt. */
  ratio: number;
  equation: string;
  spectator: string;
  toxic: boolean;
}
export const PPT_INFO: Record<PptPair, PptPairInfo> = {
  CACO3: {
    cation: { name: 'calcium chloride', formula: 'CaCl₂' },
    anion: { name: 'sodium trioxocarbonate(IV)', formula: 'Na₂CO₃' },
    product: { name: 'calcium trioxocarbonate(IV)', formula: 'CaCO₃', M: 100, colour: '#f4f3ee', colourName: 'white' },
    ratio: 1,
    equation: 'CaCl₂ + Na₂CO₃ → CaCO₃ + 2NaCl',
    spectator: 'NaCl',
    toxic: false,
  },
  PBI2: {
    cation: { name: 'lead(II) trioxonitrate(V)', formula: 'Pb(NO₃)₂' },
    anion: { name: 'potassium iodide', formula: 'KI' },
    product: { name: 'lead(II) iodide', formula: 'PbI₂', M: 461, colour: '#f3c614', colourName: 'bright yellow' },
    ratio: 2,
    equation: 'Pb(NO₃)₂ + 2KI → PbI₂ + 2KNO₃',
    spectator: 'KNO₃',
    toxic: true,
  },
  BASO4: {
    cation: { name: 'barium chloride', formula: 'BaCl₂' },
    anion: { name: 'sodium tetraoxosulphate(VI)', formula: 'Na₂SO₄' },
    product: { name: 'barium tetraoxosulphate(VI)', formula: 'BaSO₄', M: 233, colour: '#f7f7f7', colourName: 'white' },
    ratio: 1,
    equation: 'BaCl₂ + Na₂SO₄ → BaSO₄ + 2NaCl',
    spectator: 'NaCl',
    toxic: true,
  },
};
export const PPT_CAT_VOLS = [20, 25, 30] as const;
export const PPT_AN_VOLS = [20, 25, 30, 40] as const;
export const PPT_CAT_VOL = 25;
export const PPT_AN_VOL = 30;

export interface PptVariant {
  pair: PptPair;
  catConc: number;
  anConc: number;
  /** Dry filter paper (g, as the 2 d.p. balance reads it). */
  paper: number;
  /** Moisture left after one drying (g). */
  moisture: number;
  /** Fraction of the precipitate lost: with the beaker rinsed into the funnel, and without. */
  lossRinsed: number;
  lossUnrinsed: number;
}

// ================================================================== CHROM: paper chromatography

export const CHROM_DYES = ['YELLOW', 'BLUE', 'RED', 'PURPLE'] as const;
export type ChromDye = (typeof CHROM_DYES)[number];
export const CHROM_SOLVENTS = ['WATER', 'ETHANOL'] as const;
export type ChromSolvent = (typeof CHROM_SOLVENTS)[number];
export const CHROM_DYE_INFO: Record<ChromDye, { name: string; hex: string; rf: Record<ChromSolvent, [number, number]> }> = {
  YELLOW: { name: 'yellow', hex: '#e9b800', rf: { WATER: [0.74, 0.8], ETHANOL: [0.55, 0.62] } },
  BLUE: { name: 'blue', hex: '#2457c5', rf: { WATER: [0.38, 0.44], ETHANOL: [0.7, 0.78] } },
  RED: { name: 'red', hex: '#cf2338', rf: { WATER: [0.18, 0.24], ETHANOL: [0.3, 0.36] } },
  PURPLE: { name: 'purple', hex: '#7a3fb0', rf: { WATER: [0.55, 0.62], ETHANOL: [0.12, 0.18] } },
};
export const CHROM_LANES = ['INK', 'A', 'B'] as const;
export type ChromLane = (typeof CHROM_LANES)[number];
/** Paper strip length (cm); the solvent runs off the top past CHROM_TOP. */
export const CHROM_PAPER = 15;
export const CHROM_TOP = 14.5;
export const CHROM_LINE_AT = [1, 1.5, 2, 3] as const;
export const CHROM_DEPTHS = [0.5, 1, 2] as const;

export interface ChromVariant {
  ink: ChromDye[];
  A: ChromDye;
  B: ChromDye;
  rf: Record<ChromSolvent, Record<ChromDye, number>>;
  /** Lucas–Washburn constant (cm² s⁻¹) per solvent. */
  K: Record<ChromSolvent, number>;
  /** The solvent the paper names. */
  solvent: ChromSolvent;
}

// ================================================================== MP: recrystallisation + melting point

/** Benzoic acid: literature melting point (°C), solubility in water (g per 100 cm³) at 100 °C, 25 °C and 0 °C. */
export const MP_LIT = 122;
export const MP_TRUE = 122.4;
export const MP_SOL = { hot: 5.6, room: 0.34, ice: 0.17 } as const;
export const MP_WATER_STEP = 10;
/** The thermometer runs ahead of the sample by rate × lag (min). */
export const MP_LAG_MIN = 0.3;
/** Heating faster than this (°C min⁻¹) near the melting point is "too fast". */
export const MP_SLOW_MAX = 3;
export const MP_RATES = { HIGH: 12, LOW: 2, OFF: -1.5 } as const;
export type MpFlame = keyof typeof MP_RATES;

export interface MpVariant {
  impure: number;
  purity: number;
  /** Share of the impurity that is insoluble (sand, charcoal). */
  insoluble: number;
  /** Impure sample: melting starts this far below MP_TRUE, over this range (°C). */
  depImpure: number;
  widthImpure: number;
  /** Recrystallised (done well): small depression and range. */
  depPure: number;
  widthPure: number;
  /** Fraction lost on the filter papers and glass. */
  handling: number;
  room: number;
}

// ================================================================== the variant

export type SaltsAnswerId = 'molesAcid' | 'molesSalt' | 'molarMass' | 'theoretical' | 'yield' | 'rfA' | 'rfB' | 'recovery' | 'impureWidth' | 'pureWidth' | 'depression';
export const SALTS_ANSWER_IDS: SaltsAnswerId[] = ['molesAcid', 'molesSalt', 'molarMass', 'theoretical', 'yield', 'rfA', 'rfB', 'recovery', 'impureWidth', 'pureWidth', 'depression'];
export type SaltsUnit = 'mol' | 'g/mol' | 'g' | '%' | '' | 'C';
export interface SaltsTaskDef {
  id: SaltsAnswerId;
  label: string;
  unit: SaltsUnit;
}

export interface ChemSaltsVariant {
  seed: number;
  task: SaltsTask;
  sol: SolVariant;
  ppt: PptVariant;
  chrom: ChromVariant;
  mp: MpVariant;
  tasks: SaltsTaskDef[];
  given: string[];
}

function tasksFor(task: SaltsTask, pair: PptPair): SaltsTaskDef[] {
  if (task === 'SOL')
    return [
      { id: 'molesAcid', label: 'Amount (moles) of H₂SO₄ used', unit: 'mol' },
      { id: 'molesSalt', label: 'Maximum amount (moles) of CuSO₄·5H₂O that can form', unit: 'mol' },
      { id: 'molarMass', label: 'Molar mass of CuSO₄·5H₂O', unit: 'g/mol' },
      { id: 'theoretical', label: 'Theoretical (maximum) mass of CuSO₄·5H₂O', unit: 'g' },
      { id: 'yield', label: 'Percentage yield', unit: '%' },
    ];
  if (task === 'PPT') {
    const i = PPT_INFO[pair];
    return [
      { id: 'molesAcid', label: `Amount (moles) of ${i.cation.formula} used`, unit: 'mol' },
      { id: 'molesSalt', label: `Maximum amount (moles) of ${i.product.formula} that can form`, unit: 'mol' },
      { id: 'molarMass', label: `Molar mass of ${i.product.formula}`, unit: 'g/mol' },
      { id: 'theoretical', label: `Theoretical (maximum) mass of ${i.product.formula}`, unit: 'g' },
      { id: 'yield', label: 'Percentage yield', unit: '%' },
    ];
  }
  if (task === 'CHROM')
    return [
      { id: 'rfA', label: 'Rf value of dye A', unit: '' },
      { id: 'rfB', label: 'Rf value of dye B', unit: '' },
    ];
  return [
    { id: 'recovery', label: 'Percentage recovery of benzoic acid', unit: '%' },
    { id: 'impureWidth', label: 'Melting range of the impure sample (how many °C wide)', unit: 'C' },
    { id: 'pureWidth', label: 'Melting range of the recrystallised sample (how many °C wide)', unit: 'C' },
    { id: 'depression', label: 'How far below the literature value (122 °C) the impure sample finished melting', unit: 'C' },
  ];
}

export interface SaltsOverrides {
  pair?: PptPair;
  acidConc?: number;
  catConc?: number;
  A?: ChromDye;
  B?: ChromDye;
  purity?: number;
}

function build(seed: number, task: SaltsTask, o: SaltsOverrides = {}): ChemSaltsVariant {
  const r = labRandom(seed, `chem-salts-${task}`);
  const room = labBetween(r, 25, 30, 1);
  const sol: SolVariant = {
    acidConc: o.acidConc ?? sf3(labBetween(r, 0.95, 1.1, 3)),
    acidVol: SOL_ACID_VOL,
    portion: labBetween(r, 0.8, 1.0, 2),
    filterLoss: labBetween(r, 0.02, 0.045, 3),
    room,
  };
  const pair = o.pair ?? 'CACO3';
  const ppt: PptVariant = {
    pair,
    catConc: o.catConc ?? sf3(labBetween(r, 0.18, 0.22, 3)),
    anConc: pair === 'PBI2' ? 0.4 : 0.2,
    paper: labBetween(r, 0.88, 1.18, 2),
    moisture: labBetween(r, 0.02, 0.05, 2),
    lossRinsed: labBetween(r, 0.015, 0.035, 3),
    lossUnrinsed: labBetween(r, 0.07, 0.1, 3),
  };
  // Chromatography: the ink holds three of the four dyes; A is always one of them, B is in it about 60 % of the time.
  const r2 = labRandom(seed, 'chem-salts-chrom');
  const shuffle = <T,>(xs: readonly T[]): T[] => {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r2() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  };
  const missing = shuffle(CHROM_DYES)[0]!;
  const ink = CHROM_DYES.filter((d) => d !== missing);
  const inkShuffled = shuffle(ink);
  const A = o.A ?? inkShuffled[0]!;
  const B = o.B ?? (r2() < 0.6 ? inkShuffled[1]! : missing);
  const rf = { WATER: {} as Record<ChromDye, number>, ETHANOL: {} as Record<ChromDye, number> };
  for (const s of CHROM_SOLVENTS) for (const d of CHROM_DYES) rf[s][d] = labBetween(r2, CHROM_DYE_INFO[d].rf[s][0], CHROM_DYE_INFO[d].rf[s][1], 3);
  const chrom: ChromVariant = { ink, A, B, rf, K: { WATER: labBetween(r2, 0.045, 0.06, 4), ETHANOL: labBetween(r2, 0.03, 0.04, 4) }, solvent: 'WATER' };
  const r3 = labRandom(seed, 'chem-salts-mp');
  const mp: MpVariant = {
    impure: labBetween(r3, 4.9, 5.1, 2),
    purity: o.purity ?? labBetween(r3, 0.86, 0.93, 3),
    insoluble: labBetween(r3, 0.5, 0.7, 2),
    depImpure: labBetween(r3, 4, 7.5, 1),
    widthImpure: labBetween(r3, 3, 5, 1),
    depPure: labBetween(r3, 0.3, 1.0, 1),
    widthPure: labBetween(r3, 0.6, 1.2, 1),
    handling: labBetween(r3, 0.02, 0.04, 3),
    room,
  };
  const pi = PPT_INFO[pair];
  const given =
    task === 'SOL'
      ? [`You are provided with copper(II) oxide (a black powder) and ${sol.acidConc.toFixed(2)} mol dm⁻³ dilute tetraoxosulphate(VI) acid, H₂SO₄.`, 'Prepare crystals of copper(II) tetraoxosulphate(VI), CuSO₄·5H₂O, from 50.0 cm³ of the acid and excess CuO, and calculate the percentage yield.', 'CuO + H₂SO₄ → CuSO₄ + H₂O. (Cu = 63.5, S = 32, O = 16, H = 1)']
      : task === 'PPT'
        ? [`You are provided with ${ppt.catConc.toFixed(2)} mol dm⁻³ ${pi.cation.formula} and ${ppt.anConc.toFixed(2)} mol dm⁻³ ${pi.anion.formula}.`, `Prepare ${pi.product.name} by mixing 25.0 cm³ of the ${pi.cation.formula} with an excess of the ${pi.anion.formula}; weigh the dry precipitate and calculate the percentage yield.`, `${pi.equation}. (${pair === 'CACO3' ? 'Ca = 40, C = 12, O = 16' : pair === 'PBI2' ? 'Pb = 207, I = 127' : 'Ba = 137, S = 32, O = 16'})`]
        : task === 'CHROM'
          ? ['You are provided with a black ink and two pure food dyes, A and B, and a strip of chromatography paper.', `Separate the ink by paper chromatography using ${chrom.solvent === 'WATER' ? 'water' : 'ethanol'} as the solvent. Measure the distances moved, calculate the Rf values and state which of A and B the ink contains.`, 'Rf = distance moved by the spot ÷ distance moved by the solvent (both from the baseline).']
          : [`You are provided with about 5 g of impure benzoic acid (it contains sand, charcoal and a soluble impurity).`, 'Purify it by recrystallisation from the minimum volume of boiling water, weigh the dry product and calculate the percentage recovery.', 'Find the melting range of the impure and the recrystallised samples in a capillary tube in an oil bath. (Literature melting point of benzoic acid: 122 °C.)'];
  return { seed, task, sol, ppt, chrom, mp, tasks: tasksFor(task, pair), given };
}

/** The hidden truth of one attempt (same on the web and the API). */
export function chemSaltsVariant(seed: number, task: SaltsTask = 'SOL'): ChemSaltsVariant {
  return build(seed, task);
}
/** A variant from the sandbox's own choices (unmarked). */
export function chemSaltsCustomVariant(seed: number, task: SaltsTask, o: SaltsOverrides): ChemSaltsVariant {
  return build(seed, task, o);
}

// ================================================================== the student's work

export const SOL_WASH = ['COLD', 'HOT', 'NONE'] as const;
export const SOL_DRY = ['PAPER', 'HEAT', 'NONE'] as const;
export interface SolWork {
  /** cm³ of acid measured into the beaker (null: none yet). */
  acid: number | null;
  /** Highest temperature the acid reached before the first CuO went in, and overall (°C). */
  warmAtAdd: number | null;
  warmMax: number | null;
  /** g of CuO added, in spatula portions. */
  cuo: number;
  portions: number;
  stirs: number;
  /** The excess CuO was filtered off; the blue filtrate is in the evaporating dish. */
  filtered: boolean;
  /** g of water left in the dish when heating stopped (null: not heated yet). */
  water: number | null;
  /** Heated on to dryness (white anhydrous CuSO₄). */
  dry: boolean;
  /** g of water left at each glass-rod test. */
  rod: number[];
  /** °C of the dish when the crystals were filtered off (null: not yet). */
  filteredAt: number | null;
  wash: (typeof SOL_WASH)[number] | null;
  drying: (typeof SOL_DRY)[number] | null;
  weighed: boolean;
}
export interface PptWork {
  cat: number | null;
  an: number | null;
  mixed: boolean;
  stirred: boolean;
  /** The dry filter paper was weighed before filtering. */
  paper: boolean;
  filtered: boolean;
  rinsed: boolean;
  washes: number;
  /** Times dried in the warm oven; dried over a flame (chars the paper). */
  dried: number;
  flame: boolean;
  /** Weighings after drying (and the number of dryings each was after). */
  weighings: number[];
}
export interface ChromSpot {
  lane: ChromLane;
  /** Applications, and how many went on while the spot was still wet (a big spot). */
  n: number;
  wet: number;
  dry: boolean;
}
export interface ChromWork {
  line: 'PENCIL' | 'INK' | null;
  lineAt: number | null;
  spots: ChromSpot[];
  solvent: ChromSolvent | null;
  /** Depth of the solvent in the tank (cm). */
  depth: number | null;
  covered: boolean;
  /** Seconds (lab clock) the paper stood in the solvent, and whether it was covered the whole time. */
  developed: number | null;
  coveredThroughout: boolean;
  inTank: boolean;
  frontMarked: boolean;
  dried: boolean;
}
export interface MpRun {
  sample: 'IMPURE' | 'PURE';
  /** The capillary was fastened to the thermometer with the sample level with the bulb. */
  attached: boolean;
  /** Thermometer readings (°C) when the student saw melting start and finish; the heating rate then (°C min⁻¹). */
  start: number | null;
  end: number | null;
  rateStart: number | null;
  rateEnd: number | null;
  done: boolean;
}
export interface MpWork {
  weighedImpure: boolean;
  /** cm³ of boiling water added (in 10 cm³ portions). */
  water: number;
  boiled: boolean;
  funnelWarm: boolean;
  hotFiltered: boolean;
  cooling: 'SLOW' | 'FAST' | null;
  iced: boolean;
  collected: boolean;
  washed: boolean;
  dried: boolean;
  weighedPure: boolean;
  runs: MpRun[];
}

export const SALTS_REC_KEYS = ['acidVol', 'mass', 'catVol', 'anVol', 'paper', 'total1', 'total2', 'ppt', 'solvent', 'spotA', 'spotB', 'ink1', 'ink2', 'ink3', 'ink4', 'rf1', 'rf2', 'rf3', 'rf4', 'hasA', 'hasB', 'nComp', 'impure', 'pure', 'iStart', 'iEnd', 'pStart', 'pEnd'] as const;
export type SaltsRecKey = (typeof SALTS_REC_KEYS)[number];

export interface SaltsAnswer {
  value: string;
  unit: string;
}
export interface ChemSaltsState {
  v: 1;
  task: SaltsTask | null;
  sol: SolWork;
  ppt: PptWork;
  chrom: ChromWork;
  mp: MpWork;
  rec: Record<SaltsRecKey, string>;
  answers: Record<SaltsAnswerId, SaltsAnswer>;
  written: { observation: string; explain: string; precautions: string };
  log: { t: number; a: string }[];
}

export function emptyChemSaltsState(): ChemSaltsState {
  const blank = () => ({ value: '', unit: '' });
  return {
    v: 1,
    task: null,
    sol: { acid: null, warmAtAdd: null, warmMax: null, cuo: 0, portions: 0, stirs: 0, filtered: false, water: null, dry: false, rod: [], filteredAt: null, wash: null, drying: null, weighed: false },
    ppt: { cat: null, an: null, mixed: false, stirred: false, paper: false, filtered: false, rinsed: false, washes: 0, dried: 0, flame: false, weighings: [] },
    chrom: { line: null, lineAt: null, spots: [], solvent: null, depth: null, covered: false, developed: null, coveredThroughout: true, inTank: false, frontMarked: false, dried: false },
    mp: { weighedImpure: false, water: 0, boiled: false, funnelWarm: false, hotFiltered: false, cooling: null, iced: false, collected: false, washed: false, dried: false, weighedPure: false, runs: [] },
    rec: Object.fromEntries(SALTS_REC_KEYS.map((k) => [k, ''])) as Record<SaltsRecKey, string>,
    answers: Object.fromEntries(SALTS_ANSWER_IDS.map((k) => [k, blank()])) as Record<SaltsAnswerId, SaltsAnswer>,
    written: { observation: '', explain: '', precautions: '' },
    log: [],
  };
}

// ================================================================== SOL model

/** mol of H₂SO₄ in the acid measured. */
export const solAcidMoles = (v: ChemSaltsVariant, w: Pick<SolWork, 'acid'>) => (v.sol.acidConc * (w.acid ?? 0)) / 1000;
/** mol of CuSO₄ made (limited by the acid, or by the CuO when it is not in excess). */
export const solMade = (v: ChemSaltsVariant, w: Pick<SolWork, 'acid' | 'cuo'>) => Math.min(solAcidMoles(v, w), w.cuo / SOL_M.CuO);
/** Undissolved CuO left in the beaker (g). */
export const solExcess = (v: ChemSaltsVariant, w: Pick<SolWork, 'acid' | 'cuo'>) => Math.max(0, w.cuo - solAcidMoles(v, w) * SOL_M.CuO);
/** Is CuO in excess (some left undissolved)? A trace counts once a whole portion stays. */
export const solBaseExcess = (v: ChemSaltsVariant, w: Pick<SolWork, 'acid' | 'cuo'>) => solExcess(v, w) > 0.05;
/** The filtrate in the dish: mol of CuSO₄ and g of water (the filter paper keeps a little). */
export function solFiltrate(v: ChemSaltsVariant, w: Pick<SolWork, 'acid' | 'cuo'>) {
  const n = solMade(v, w);
  const keep = 1 - v.sol.filterLoss;
  return { n: n * keep, water: ((w.acid ?? 0) * 0.98 + n * SOL_M.H2O) * keep };
}
/** Crystallisation point: the water left when a drop on a cold rod crystallises (the hot solution saturated near 80 °C). */
export const solCrystalPoint = (n: number) => (n * SOL_M.CuSO4 * 100) / cuso4Solubility(80);
/** Below this much water crystals already crust in the hot dish (evaporated too far). */
export const solOverPoint = (n: number) => n * 5 * SOL_M.H2O * 0.55 + 1.5;
export type SolRod = 'NONE' | 'CRYSTALS' | 'CRUST' | 'DRY';
export function solRodResult(n: number, water: number): SolRod {
  if (water <= 0.001) return 'DRY';
  if (water <= solOverPoint(n)) return 'CRUST';
  if (water <= solCrystalPoint(n)) return 'CRYSTALS';
  return 'NONE';
}
/** mol of CuSO₄·5H₂O crystallised from n mol in `water` g of water at T °C (each mole of crystals takes 90 g of water with it). */
export function solCrystals(n: number, water: number, T: number): number {
  const S = cuso4Solubility(T) / 100;
  const x = (n * SOL_M.CuSO4 - S * water) / (SOL_M.CuSO4 - S * 5 * SOL_M.H2O);
  return clamp(x, 0, n);
}
export interface SolProduct {
  mass: number;
  /** blue crystals / white powder (anhydrous) / blue with black specks / none */
  look: 'BLUE' | 'WHITE' | 'SPECKS' | 'NONE';
  crystals: number;
}
/** What ends up on the balance from the student's procedure. */
export function solProduct(v: ChemSaltsVariant, w: SolWork): SolProduct {
  const f = solFiltrate(v, w);
  const specks = !w.filtered ? solExcess(v, w) : 0;
  if (w.dry) return { mass: roundDp(f.n * SOL_M.CuSO4 * 0.98 + specks, 2), look: 'WHITE', crystals: 0 };
  if (w.water === null || w.filteredAt === null) return { mass: 0, look: 'NONE', crystals: 0 };
  let x = solCrystals(f.n, w.water, w.filteredAt);
  if (w.wash === 'COLD') x *= 0.975;
  else if (w.wash === 'HOT') x *= 0.68;
  let mass = x * SOL_M.hydrate * (1 - v.sol.filterLoss);
  if (w.wash === 'NONE' || w.wash === null) mass += 0.22; // mother liquor drying on the crystals
  if (w.drying === 'NONE' || w.drying === null) mass += 0.55; // still wet
  let look: SolProduct['look'] = x > 0.0005 ? 'BLUE' : 'NONE';
  if (w.drying === 'HEAT' && x > 0) {
    mass = x * SOL_M.CuSO4 * (1 - v.sol.filterLoss);
    look = 'WHITE';
  }
  if (specks > 0 && look !== 'NONE') look = look === 'BLUE' ? 'SPECKS' : look;
  return { mass: roundDp(mass + specks, 2), look, crystals: x };
}
/** True answers (with the student's own acid volume and mass where the chain uses them). */
export function solChain(v: ChemSaltsVariant, acidVol: number, mass: number | null, moles?: number | null, molar?: number | null, theo?: number | null) {
  const molesAcid = (v.sol.acidConc * acidVol) / 1000;
  const molesSalt = moles ?? molesAcid;
  const molarMass = SOL_M.hydrate;
  const theoretical = molesSalt * (molar ?? molarMass);
  const yieldPct = mass === null ? null : (mass / (theo ?? theoretical)) * 100;
  return { molesAcid, molesSalt: molesAcid, molarMass, theoretical, yield: yieldPct };
}

// ================================================================== PPT model

export const pptCatMoles = (v: ChemSaltsVariant, w: Pick<PptWork, 'cat'>) => (v.ppt.catConc * (w.cat ?? 0)) / 1000;
export const pptAnMoles = (v: ChemSaltsVariant, w: Pick<PptWork, 'an'>) => (v.ppt.anConc * (w.an ?? 0)) / 1000;
/** Is the anion salt in excess (all of the cation precipitated)? */
export const pptExcess = (v: ChemSaltsVariant, w: Pick<PptWork, 'cat' | 'an'>) => pptAnMoles(v, w) > PPT_INFO[v.ppt.pair].ratio * pptCatMoles(v, w) * 1.02;
/** mol of precipitate formed. */
export const pptFormed = (v: ChemSaltsVariant, w: Pick<PptWork, 'cat' | 'an'>) => Math.min(pptCatMoles(v, w), pptAnMoles(v, w) / PPT_INFO[v.ppt.pair].ratio);
/** The balance reading for paper + precipitate after `dried` dryings. */
export function pptTotal(v: ChemSaltsVariant, w: PptWork, dried = w.dried): number {
  const i = PPT_INFO[v.ppt.pair];
  const solid = pptFormed(v, w) * i.product.M * (1 - (w.rinsed ? v.ppt.lossRinsed : v.ppt.lossUnrinsed));
  // soluble salts left in the liquid soaking the paper: each wash removes about 85 % of them
  const residue = 0.022 * 0.15 ** w.washes;
  const water = dried <= 0 ? 1.3 : dried === 1 ? v.ppt.moisture : 0;
  const charred = w.flame ? -0.18 : 0;
  return roundDp(v.ppt.paper + solid + residue + water + charred, 2);
}
export function pptChain(v: ChemSaltsVariant, catVol: number, mass: number | null, moles?: number | null, molar?: number | null, theo?: number | null) {
  const i = PPT_INFO[v.ppt.pair];
  const molesAcid = (v.ppt.catConc * catVol) / 1000;
  const molarMass = i.product.M;
  const theoretical = (moles ?? molesAcid) * (molar ?? molarMass);
  return { molesAcid, molesSalt: molesAcid, molarMass, theoretical, yield: mass === null ? null : (mass / (theo ?? theoretical)) * 100 };
}

// ================================================================== CHROM model

/** How far the solvent front has risen above the bottom of the paper after t s (cm). */
export function chromFront(v: ChemSaltsVariant, w: Pick<ChromWork, 'solvent' | 'depth' | 'coveredThroughout'>, t: number): number {
  if (!w.solvent || w.depth === null) return 0;
  const K = v.chrom.K[w.solvent] * (w.coveredThroughout ? 1 : 0.8);
  return Math.min(CHROM_PAPER, w.depth + Math.sqrt(Math.max(0, K * t)));
}
/** The solvent ran off the top of the paper. */
export const chromRanOff = (v: ChemSaltsVariant, w: ChromWork) => w.developed !== null && chromFront(v, w, w.developed) >= CHROM_TOP;
export const chromAboveLine = (w: Pick<ChromWork, 'depth' | 'lineAt'>) => w.depth !== null && w.lineAt !== null && w.depth >= w.lineAt - 0.05;
/** The effective Rf of a dye in this run (an uncovered tank dries the paper: spots lag a little). */
export const chromRf = (v: ChemSaltsVariant, w: Pick<ChromWork, 'solvent' | 'coveredThroughout'>, d: ChromDye) => v.chrom.rf[w.solvent ?? 'WATER'][d] * (w.coveredThroughout ? 1 : 0.95);
export interface ChromSpotTruth {
  lane: ChromLane;
  dye: ChromDye;
  /** Spot centre above the baseline (cm), and its radius (cm). */
  dist: number;
  r: number;
}
/** The dyes in a lane. */
export const chromLaneDyes = (v: ChemSaltsVariant, lane: ChromLane): ChromDye[] => (lane === 'INK' ? v.chrom.ink : [v.chrom[lane]]);
/** Where every spot is on the developed paper (empty when the spots washed off into the solvent). */
export function chromSpots(v: ChemSaltsVariant, w: ChromWork, t = w.developed ?? 0): ChromSpotTruth[] {
  if (w.lineAt === null || chromAboveLine(w) || !w.solvent) return [];
  const front = chromFront(v, w, t);
  const run = Math.max(0, Math.min(front, CHROM_TOP) - w.lineAt);
  const out: ChromSpotTruth[] = [];
  for (const sp of w.spots) {
    if (sp.n < 1) continue;
    for (const dye of chromLaneDyes(v, sp.lane)) {
      const dist = chromRf(v, w, dye) * run;
      const r = 0.12 + 0.06 * Math.sqrt(dist) + (sp.wet ? 0.16 : 0) + (w.coveredThroughout ? 0 : 0.05);
      out.push({ lane: sp.lane, dye, dist, r });
    }
  }
  return out;
}
/** The true solvent distance from the baseline (cm), null if it ran off the top. */
export function chromSolventDist(v: ChemSaltsVariant, w: ChromWork): number | null {
  if (w.developed === null || w.lineAt === null || chromRanOff(v, w)) return null;
  return chromFront(v, w, w.developed) - w.lineAt;
}

// ================================================================== MP model

/** The water needed to dissolve the benzoic acid at the boil (cm³). */
export const mpMinWater = (v: ChemSaltsVariant) => (v.mp.impure * v.mp.purity * 100) / MP_SOL.hot;
export const mpDissolved = (v: ChemSaltsVariant, w: Pick<MpWork, 'water' | 'boiled'>) => w.boiled && w.water >= mpMinWater(v) - 0.01;
/** Too much water: more than about a third over the minimum (two extra portions). */
export const mpTooMuch = (v: ChemSaltsVariant, w: Pick<MpWork, 'water'>) => w.water > Math.ceil(mpMinWater(v) / MP_WATER_STEP) * MP_WATER_STEP + 2 * MP_WATER_STEP - 0.01;
/** Mass of dry recrystallised product (g) and whether insoluble impurities came through. */
export function mpProduct(v: ChemSaltsVariant, w: MpWork): { mass: number; dirty: boolean; wet: boolean } {
  if (!w.collected) return { mass: 0, dirty: false, wet: false };
  const pure = v.mp.impure * v.mp.purity;
  const insol = v.mp.impure * (1 - v.mp.purity) * v.mp.insoluble;
  const dissolved = mpDissolved(v, w) ? pure : Math.min(pure, (w.water * MP_SOL.hot) / 100);
  const cold = (w.water * (w.iced ? MP_SOL.ice : MP_SOL.room)) / 100;
  let m = Math.max(0, dissolved - cold);
  if (w.hotFiltered && !w.funnelWarm) m *= 0.86; // crystallised in the cold funnel
  m *= 1 - v.mp.handling;
  if (w.washed) m -= 0.03;
  let total = m + (w.hotFiltered ? 0 : insol);
  if (!w.dried) total += 0.6;
  return { mass: roundDp(Math.max(0, total), 2), dirty: !w.hotFiltered, wet: !w.dried };
}
/** True melting range of a sample (°C): start, end. */
export function mpRange(v: ChemSaltsVariant, w: MpWork, sample: 'IMPURE' | 'PURE'): [number, number] {
  if (sample === 'IMPURE') {
    const s = MP_TRUE - v.mp.depImpure;
    return [s, s + v.mp.widthImpure];
  }
  let dep = v.mp.depPure;
  let width = v.mp.widthPure;
  if (w.cooling === 'FAST') (dep += 1.2), (width += 0.8);
  if (!w.washed) (dep += 0.5), (width += 0.4);
  if (!w.dried) (dep += 2.5), (width += 1.5);
  if (!w.hotFiltered) width += 0.2;
  const s = MP_TRUE - dep;
  return [s, Math.min(MP_TRUE + 0.2, s + width)];
}
/** What the thermometer reads when the sample is at T, heating at `rate` °C min⁻¹ (it runs ahead of the sample); a capillary hanging loose away from the bulb sits in cooler oil higher up. */
export const mpThermoFor = (T: number, rate: number, attached = true) => T + Math.max(0, rate) * MP_LAG_MIN + (attached ? 0 : 3.5);

// ================================================================== schema

const short = z.string().max(40);
const num = (a: number, b: number) => z.number().min(a).max(b);
const answer = z.object({ value: short, unit: short });
export const chemSaltsStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(SALTS_TASKS).nullable(),
  sol: z.object({
    acid: num(0, 200).nullable(),
    warmAtAdd: num(-10, 120).nullable(),
    warmMax: num(-10, 120).nullable(),
    cuo: num(0, 50),
    portions: z.number().int().min(0).max(60),
    stirs: z.number().int().min(0).max(10_000),
    filtered: z.boolean(),
    water: num(0, 250).nullable(),
    dry: z.boolean(),
    rod: z.array(num(0, 250)).max(40),
    filteredAt: num(-10, 120).nullable(),
    wash: z.enum(SOL_WASH).nullable(),
    drying: z.enum(SOL_DRY).nullable(),
    weighed: z.boolean(),
  }),
  ppt: z.object({
    cat: num(0, 100).nullable(),
    an: num(0, 100).nullable(),
    mixed: z.boolean(),
    stirred: z.boolean(),
    paper: z.boolean(),
    filtered: z.boolean(),
    rinsed: z.boolean(),
    washes: z.number().int().min(0).max(20),
    dried: z.number().int().min(0).max(20),
    flame: z.boolean(),
    weighings: z.array(z.number().int().min(0).max(20)).max(20),
  }),
  chrom: z.object({
    line: z.enum(['PENCIL', 'INK']).nullable(),
    lineAt: num(0, 15).nullable(),
    spots: z.array(z.object({ lane: z.enum(CHROM_LANES), n: z.number().int().min(0).max(20), wet: z.number().int().min(0).max(20), dry: z.boolean() })).max(3),
    solvent: z.enum(CHROM_SOLVENTS).nullable(),
    depth: num(0, 15).nullable(),
    covered: z.boolean(),
    developed: num(0, 100_000).nullable(),
    coveredThroughout: z.boolean(),
    inTank: z.boolean(),
    frontMarked: z.boolean(),
    dried: z.boolean(),
  }),
  mp: z.object({
    weighedImpure: z.boolean(),
    water: num(0, 1000),
    boiled: z.boolean(),
    funnelWarm: z.boolean(),
    hotFiltered: z.boolean(),
    cooling: z.enum(['SLOW', 'FAST']).nullable(),
    iced: z.boolean(),
    collected: z.boolean(),
    washed: z.boolean(),
    dried: z.boolean(),
    weighedPure: z.boolean(),
    runs: z.array(z.object({ sample: z.enum(['IMPURE', 'PURE']), attached: z.boolean(), start: num(-10, 400).nullable(), end: num(-10, 400).nullable(), rateStart: num(-50, 100).nullable(), rateEnd: num(-50, 100).nullable(), done: z.boolean() })).max(8),
  }),
  rec: z.object(Object.fromEntries(SALTS_REC_KEYS.map((k) => [k, short])) as Record<SaltsRecKey, typeof short>),
  answers: z.object(Object.fromEntries(SALTS_ANSWER_IDS.map((k) => [k, answer])) as Record<SaltsAnswerId, typeof answer>),
  written: z.object({ observation: z.string().max(2000), explain: z.string().max(2000), precautions: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(800),
}) satisfies z.ZodType<ChemSaltsState>;

export const CHEM_SALTS: SimulatorSpec = {
  id: 'chem-salts',
  subject: 'Chemistry',
  title: 'Salts, chromatography and purification',
  topicNames: ['Salts', 'Standard Separation Techniques for Mixtures', 'General practical skills and principles', 'Acids, bases and salts'],
  minutes: 50,
  rubric: [
    { id: 'setup', label: 'Setting up', marks: 2, how: 'AUTO', guide: 'Soluble salt: 50.0 cm³ of acid measured (1), warmed gently, not boiled, before the base goes in (1). Insoluble salt: 25.0 cm³ of the first solution (1), the second in excess (1). Chromatography: the baseline in pencil, never ink (1), about 1–2 cm up with the spots on it (1). Recrystallisation: the impure sample weighed (1), dissolved in the minimum of boiling water (1).' },
    { id: 'procedure', label: 'Procedure', marks: 5, how: 'AUTO', guide: 'Soluble salt: base added a little at a time with stirring (1), in excess — some left undissolved (1), excess filtered off before evaporating (1), crystallisation point tested with a glass rod (1), cooled before the crystals were filtered off (1). Insoluble salt: mixed and stirred (1), dry filter paper weighed first (1), filtered (1), washed with distilled water (1), dried before weighing (1). Chromatography: small spots dried between applications (1), solvent below the baseline (1), tank covered (1), paper removed before the solvent reached the top (1), front marked at once (1). Recrystallisation: dissolved at the boil (1), filtered hot (1) through a warmed funnel (1), cooled slowly then in ice (1), crystals filtered, washed with ice-cold water and dried (1).' },
    { id: 'technique', label: 'Technique', marks: 3, how: 'AUTO', guide: 'Soluble salt: never evaporated to dryness (1); stopped at the crystallisation point, not too early or too far (1); crystals washed with a little cold water and dried between filter papers, not by heating (1). Insoluble salt: the beaker rinsed into the funnel (1); dried in a warm place, never over a flame (1); dried and weighed again to constant mass (1). Chromatography: distances measured from the baseline, not the paper edge (1), to the centres of the spots (1), ink and both dyes run side by side on the same paper (1). Melting point: heated slowly (≤ 3 °C per minute) near the melting point (1), both samples tested (1), the sample dry (1).' },
    { id: 'readings', label: 'Measurements', marks: 4, how: 'AUTO', guide: 'Soluble salt: volume recorded (1), mass to 2 d.p. (1) matching the balance (1), blue crystals in a sensible yield (1). Insoluble salt: masses to 2 d.p. (1) matching the balance (2), mass of precipitate subtracted correctly (1). Chromatography: solvent distance within ±0.1 cm (1), spot distances within ±0.15 cm (2), to 1 d.p. (1). Recrystallisation: masses to 2 d.p. matching the balance (1), melting readings as the thermometer showed (1), within ±1.5 °C of the true range (2).' },
    { id: 'calculations', label: 'Calculations', marks: 5, how: 'AUTO', guide: 'Salts: moles of the reagent (1), moles of salt by the 1 : 1 ratio (1), the molar mass — 249.5 g mol⁻¹ for CuSO₄·5H₂O, with its water (1), the theoretical mass (1), the percentage yield (1); errors carried forward. Chromatography: Rf of A (1) and B (1), Rf of the ink spots (1), the dyes the ink contains (1), how many components (1). Recrystallisation: percentage recovery (2), the two range widths (2), the depression below 122 °C (1).' },
    { id: 'units', label: 'Units', marks: 1, how: 'AUTO', guide: 'Every answer with its correct unit (mol, g mol⁻¹, g, %, °C); Rf has no unit.' },
    { id: 'observation', label: 'Observations', marks: 2, how: 'AI', guide: 'Soluble salt: black CuO dissolves to a blue solution; blue crystals on cooling. Insoluble salt: a white precipitate forms at once. Chromatography: the ink separates into coloured spots; spots at the same height as A (and B) show they are in the ink. Melting point: white needle crystals; the impure sample melts lower and over a wider range than the pure one.' },
    { id: 'explain', label: 'Explanation', marks: 1, how: 'AI', guide: 'Soluble salt: excess base so all the acid is used (and is easily filtered off); not to dryness, which destroys the water of crystallisation (white powder). Insoluble salt: washing removes the soluble NaCl that would add mass. Chromatography: pencil (graphite) does not dissolve or run in the solvent; ink would separate. Recrystallisation: minimum hot solvent so most of the solid crystallises on cooling; impurities lower and broaden the melting point.' },
    { id: 'precautions', label: 'Precautions', marks: 1, how: 'AI', guide: 'Two correct precautions from the lesson, e.g. excess base; not evaporating to dryness; drying with filter paper; washing the precipitate with distilled water; drying to constant mass; pencil baseline; solvent below the spots; covering the tank; small concentrated spots; minimum hot solvent; slow cooling; heating the oil bath slowly near the melting point; goggles; no flames near ethanol.' },
  ],
};
