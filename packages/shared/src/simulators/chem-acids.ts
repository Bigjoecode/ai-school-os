import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { labBetween, labRandom, roundDp } from './seeded';

/**
 * chem-acids: acids, bases and water (WAEC practical chemistry).
 * Four tasks, one per lesson:
 *  - PH  (pr-chem-ph-universal-indicator): nine samples A–I (HCl, ethanoic
 *         acid, lime juice, cola, distilled water, NaHCO₃, soap, wood-ash
 *         extract, NaOH), 2 cm³ each in rinsed, labelled tubes, two drops of
 *         universal indicator, shaken, compared with the colour chart against
 *         a white tile. The tube's colour is the indicator's colour at the
 *         sample's true pH (mixed with the sample's own colour; paler in a
 *         full tube; unrinsed tubes carry a trace of soap that turns the
 *         distilled water blue-green). The student reads whole pH numbers and
 *         classifies each sample; pH = −log[H⁺], 14 + log[OH⁻], the tenfold
 *         rule and the degree of ionisation of ethanoic acid follow.
 *  - IND (pr-chem-indicator-from-hibiscus): crush zobo calyces with warm
 *         water or ethanol (water bath — never a flame), filter, test the
 *         extract and universal indicator in HCl, vinegar, water, baking soda
 *         and NaOH (the anthocyanin is red in acid, purple near neutral,
 *         blue-green to green in alkali, yellow in strong alkali), then titrate
 *         25.0 cm³ of NaOH with HCl from a burette using methyl orange (end
 *         point at pH ≈ 4) and the extract (red at pH ≈ 3.5, so a slightly
 *         larger titre; its own acids lower the titre when too much is used).
 *  - ACID (pr-chem-acids-with-carbonates): dilute HCl on Mg and Zn (H₂: a
 *         squeaky pop), Cu (nothing), warm CuO (blue-green CuCl₂) and marble
 *         (CO₂: limewater milky); then about 2 g of marble in excess HCl in a
 *         plugged flask on a zeroed balance: the mass falls as
 *         m(t) = m₀ − (44 n − dissolved)(1 − e^(−t/τ)) and steadies.
 *  - HARD (pr-chem-hardness-of-water): soap from a burette into 50.0 cm³ of
 *         distilled, rain, tap water and samples X and Y, 0.5 cm³ at a time,
 *         stoppered and shaken, until a lather lasts 2 minutes; the soap
 *         needed is blank + temporary + permanent hardness. Boiling for
 *         5 minutes (cooled, made up to 50 cm³, filtered) removes almost all
 *         the temporary hardness, so before − after is the temporary hardness.
 */

export const ACIDS_TASKS = ['PH', 'IND', 'ACID', 'HARD'] as const;
export type AcidsTask = (typeof ACIDS_TASKS)[number];
export const ACIDS_LESSONS: Record<string, AcidsTask> = {
  'pr-chem-ph-universal-indicator': 'PH',
  'pr-chem-indicator-from-hibiscus': 'IND',
  'pr-chem-acids-with-carbonates': 'ACID',
  'pr-chem-hardness-of-water': 'HARD',
};
export const acidsLessonTask = (practicalId?: string | null): AcidsTask => (practicalId && ACIDS_LESSONS[practicalId]) || 'PH';

const sf3 = (x: number) => Number(x.toPrecision(3));
type RGB = [number, number, number];
const hexOf = (c: RGB) => `#${c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')}`;
const rgbOf = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** Mix two #rrggbb colours (f = 0 → a, 1 → b). */
export function mixHex(a: string, b: string, f: number): string {
  const p = rgbOf(a);
  const q = rgbOf(b);
  const k = Math.max(0, Math.min(1, f));
  return hexOf([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k]);
}

// ================================================================== the universal indicator colour chart

/** The colour chart, pH 0 … 14. */
export const UI_CHART = ['#d7191c', '#e8331f', '#f06523', '#f59a22', '#f8c51f', '#f1e12a', '#bcd534', '#62b847', '#22a36e', '#2189bf', '#2a5aa6', '#40419a', '#592f8c', '#69237f', '#56196b'] as const;
/** The indicator's colour at a pH (between the chart's colours). */
export function uiColour(pH: number): string {
  const x = Math.max(0, Math.min(14, pH));
  const i = Math.min(13, Math.floor(x));
  return mixHex(UI_CHART[i]!, UI_CHART[i + 1]!, x - i);
}
export const UI_NAMES = ['red', 'red', 'orange-red', 'orange', 'yellow-orange', 'yellow', 'yellow-green', 'green', 'blue-green', 'blue', 'blue', 'indigo', 'violet', 'violet', 'purple'] as const;
export const PH_CLASSES = ['SA', 'WA', 'N', 'WB', 'SB'] as const;
export type PhClass = (typeof PH_CLASSES)[number];
export const PH_CLASS_LABEL: Record<PhClass, string> = { SA: 'strongly acidic', WA: 'weakly acidic', N: 'neutral', WB: 'weakly alkaline', SB: 'strongly alkaline' };
/** The lesson's bands: strongly acidic 0–3, weakly acidic 4–6, neutral 7, weakly alkaline 8–10, strongly alkaline 11–14. */
export function phClassOf(pH: number): PhClass {
  const p = Math.round(pH);
  return p <= 3 ? 'SA' : p <= 6 ? 'WA' : p === 7 ? 'N' : p <= 10 ? 'WB' : 'SB';
}
/** A class as the student wrote it → its code (null when not recognised). */
export function parsePhClass(raw: string): PhClass | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  if ((PH_CLASSES as readonly string[]).includes(raw.trim().toUpperCase())) return raw.trim().toUpperCase() as PhClass;
  if (/neutral/.test(t)) return 'N';
  const strong = /strong/.test(t);
  const weak = /weak|mild|slight/.test(t);
  if (/acid/.test(t)) return strong ? 'SA' : weak ? 'WA' : null;
  if (/alkal|basic|base/.test(t)) return strong ? 'SB' : weak ? 'WB' : null;
  return null;
}

// ================================================================== PH

export const PH_SAMPLES = ['HCL', 'ETH', 'LIME', 'COLA', 'WATER', 'BICARB', 'SOAP', 'ASH', 'NAOH'] as const;
export type PhSample = (typeof PH_SAMPLES)[number];
export const PH_LETTER: Record<PhSample, string> = { HCL: 'A', ETH: 'B', LIME: 'C', COLA: 'D', WATER: 'E', BICARB: 'F', SOAP: 'G', ASH: 'H', NAOH: 'I' };
/** Each sample's name and its own colour (most are colourless; lime juice is cloudy yellow-green, cola dark brown, wood-ash extract pale straw). */
export const PH_INFO: Record<PhSample, { label: string; own: string }> = {
  HCL: { label: 'Hydrochloric acid', own: '#eef3f6' },
  ETH: { label: 'Ethanoic acid (vinegar)', own: '#eef2f2' },
  LIME: { label: 'Lime juice', own: '#e4e7b8' },
  COLA: { label: 'Coca-Cola', own: '#5a2a14' },
  WATER: { label: 'Distilled water', own: '#eef4f8' },
  BICARB: { label: 'Sodium hydrogentrioxocarbonate(IV) solution', own: '#eef3f6' },
  SOAP: { label: 'Soap solution', own: '#eeeee6' },
  ASH: { label: 'Wood-ash extract', own: '#e6dcb8' },
  NAOH: { label: 'Sodium hydroxide', own: '#eef3f6' },
};
export const PH_ETH_C = 0.1;
export const KA_ETH = 1.8e-5;
/** pH of ethanoic acid at c mol dm⁻³ (weak: [H⁺] = √(Ka·c)). */
export const ethanoicPh = (c: number) => -Math.log10((-KA_ETH + Math.sqrt(KA_ETH * KA_ETH + 4 * KA_ETH * c)) / 2);

export interface PhVariant {
  /** The true pH of each sample. */
  pH: Record<PhSample, number>;
  cHcl: number;
  cNaoh: number;
  /** pH that a trace of soap left in unrinsed tubes gives the distilled water. */
  residue: number;
}

// ================================================================== IND

export const IND_SOLS = ['HCL', 'VINEGAR', 'WATER', 'SODA', 'NAOH'] as const;
export type IndSol = (typeof IND_SOLS)[number];
export const IND_SOL_LABEL: Record<IndSol, string> = { HCL: 'Dilute HCl', VINEGAR: 'Vinegar', WATER: 'Water', SODA: 'Baking-soda solution', NAOH: 'Dilute NaOH' };
export type IndIndicator = 'MO' | 'ZOBO';
export const IND_PIPETTE = 25.0;
export const IND_BURETTE = 50;
/** The colour names a student can record for the extract. */
export const ZOBO_NAMES = ['red', 'pink', 'purple', 'blue', 'green', 'yellow', 'colourless'] as const;
/** Hibiscus anthocyanin: red in acid, pink, purple near neutral, blue-green, green, yellow in strong alkali. */
const ZOBO_STOPS: [number, string][] = [
  [1, '#b0102e'],
  [3, '#c41f45'],
  [4.5, '#c8457a'],
  [6, '#a24f8f'],
  [7, '#7a4a92'],
  [8.3, '#4c6f9a'],
  [9.5, '#3f8a6e'],
  [11, '#5c9a3a'],
  [12.5, '#b4b23a'],
  [14, '#d6be2c'],
];
export function zoboColour(pH: number): string {
  if (pH <= ZOBO_STOPS[0]![0]) return ZOBO_STOPS[0]![1];
  for (let i = 0; i + 1 < ZOBO_STOPS.length; i++) {
    const [a, ca] = ZOBO_STOPS[i]!;
    const [b, cb] = ZOBO_STOPS[i + 1]!;
    if (pH <= b) return mixHex(ca, cb, (pH - a) / (b - a));
  }
  return ZOBO_STOPS.at(-1)![1];
}
/** Colour words a WAEC examiner accepts for the extract at a pH. */
export function zoboNames(pH: number): string[] {
  if (pH < 3.2) return ['red'];
  if (pH < 4.6) return ['red', 'pink'];
  if (pH < 6) return ['pink', 'purple'];
  if (pH < 7.6) return ['purple', 'pink'];
  if (pH < 9.6) return ['blue', 'green'];
  if (pH < 11.8) return ['green'];
  return ['yellow', 'green'];
}
/** Methyl orange: red below 3.1, orange around 3.7, yellow above 4.4. */
export function moColour(pH: number): string {
  if (pH <= 3.1) return '#d6342a';
  if (pH <= 3.8) return mixHex('#d6342a', '#ef7f26', (pH - 3.1) / 0.7);
  if (pH <= 4.4) return mixHex('#ef7f26', '#f3c21d', (pH - 3.8) / 0.6);
  return '#f3c21d';
}
/** The pH at which each indicator shows its end-point colour when acid is run into alkali. */
export const IND_END_PH = { MO: 4.0 } as const;

export interface IndVariant {
  pH: Record<IndSol, number>;
  /** HCl in the burette and NaOH in the pipette (mol dm⁻³). */
  cAcid: number;
  cBase: number;
  /** Initial burette readings after each refill. */
  fills: number[];
  /** Water left in an unrinsed pipette / burette dilutes the solution by this fraction. */
  pipLoss: number;
  burDil: number;
  /** HCl-equivalent (cm³ of the burette acid) of the extract's own acids, per drop. */
  extractAcid: number;
  /** pH at which the zobo extract has turned red (its end point). */
  zoboEnd: number;
}

// ================================================================== ACID

export const ACID_TUBES = ['MG', 'ZN', 'CU', 'CUO', 'CACO3'] as const;
export type AcidTube = (typeof ACID_TUBES)[number];
export const ACID_TUBE_LABEL: Record<AcidTube, string> = { MG: 'Magnesium ribbon', ZN: 'Zinc granules', CU: 'Copper turnings', CUO: 'Copper(II) oxide', CACO3: 'Marble chips (CaCO₃)' };
export const ACID_TESTS = ['BURNING', 'GLOWING', 'LIME'] as const;
export type AcidTest = (typeof ACID_TESTS)[number];
export const ACID_GASES = ['hydrogen', 'carbon dioxide', 'oxygen', 'none'] as const;
export const ACID_VOLS = [10, 20, 50] as const;
export const M_CACO3 = 100;
export const M_CO2 = 44;
export const ACID_MARBLE_TARGET = 2.0;

export interface AcidVariant {
  /** HCl (mol dm⁻³). */
  conc: number;
  /** g of marble added by each tap of the spatula. */
  chips: number[];
  /** Empty flask (g), cotton-wool plug (g). */
  flask: number;
  plugMass: number;
  /** Reading of an unzeroed balance with nothing on it (g). */
  offset: number;
  /** Time constant of the marble reaction in excess acid (s); CO₂ that stays dissolved (g); acid spray lost without a plug (g). */
  tau: number;
  retained: number;
  spray: number;
  room: number;
}

// ================================================================== HARD

export const HARD_SAMPLES = ['DIST', 'RAIN', 'TAP', 'X', 'Y'] as const;
export type HardSample = (typeof HARD_SAMPLES)[number];
export const HARD_LABEL: Record<HardSample, string> = { DIST: 'Distilled water', RAIN: 'Rain water', TAP: 'Tap water', X: 'Sample X (borehole)', Y: 'Sample Y (well)' };
export const HARD_BOILABLE: HardSample[] = ['RAIN', 'TAP', 'X', 'Y'];
export type HardBoil = 'FULL' | 'SHORT' | 'NOMAKEUP';
export const HARD_VOL = 50.0;
export const HARD_STEP = 0.5;

export interface HardVariant {
  /** Soap (cm³) that makes a lasting lather in 50 cm³ of pure water. */
  blank: number;
  /** Soap (cm³ per 50 cm³) used by each sample's temporary and permanent hardness. */
  temp: Record<HardSample, number>;
  perm: Record<HardSample, number>;
  /** Fraction of the temporary hardness removed by 5 minutes' boiling, and by 1 minute. */
  removal: number;
  short: number;
  /** Fraction of the water boiled away (left un-made-up it concentrates the hardness). */
  evap: number;
  /** Burette readings after each refill. */
  fills: number[];
  /** Extra soap (cm³) needed when the flask is only swirled; how far before the lasting lather a short-lived froth first appears. */
  swirl: number;
  froth: number;
  /** Volume (cm³) poured roughly instead of measured. */
  rough: number;
  /** Which sample's hardness is mainly temporary. */
  tempSample: 'X' | 'Y';
}

// ================================================================== the variant

export type AcidsAnswerId = 'hplus' | 'phHcl' | 'phNaoh' | 'ratio' | 'ionised' | 'meanMo' | 'meanZobo' | 'diff' | 'pctDiff' | 'molCaco3' | 'massCo2' | 'lost' | 'pctCo2' | 'tempX' | 'permX' | 'totalX' | 'pctTemp';
export const ACIDS_ANSWER_IDS: AcidsAnswerId[] = ['hplus', 'phHcl', 'phNaoh', 'ratio', 'ionised', 'meanMo', 'meanZobo', 'diff', 'pctDiff', 'molCaco3', 'massCo2', 'lost', 'pctCo2', 'tempX', 'permX', 'totalX', 'pctTemp'];
export type AcidsUnit = 'mol/dm3' | 'none' | '%' | 'cm3' | 'mol' | 'g';
export interface AcidsTaskDef {
  id: AcidsAnswerId;
  label: string;
  unit: AcidsUnit;
}

export interface ChemAcidsVariant {
  seed: number;
  task: AcidsTask;
  ph: PhVariant;
  ind: IndVariant;
  acid: AcidVariant;
  hard: HardVariant;
  tasks: AcidsTaskDef[];
  given: string[];
}

function tasksFor(task: AcidsTask, v: { cHcl: number; cNaoh: number }): AcidsTaskDef[] {
  if (task === 'PH')
    return [
      { id: 'hplus', label: `[H⁺] in sample A (${v.cHcl} mol dm⁻³ HCl, fully ionised)`, unit: 'mol/dm3' },
      { id: 'phHcl', label: 'Calculated pH of sample A, pH = −log[H⁺] (no unit)', unit: 'none' },
      { id: 'phNaoh', label: `Calculated pH of sample I (${v.cNaoh} mol dm⁻³ NaOH): pOH = −log[OH⁻], pH = 14 − pOH (no unit)`, unit: 'none' },
      { id: 'ratio', label: 'How many times greater [H⁺] is in A than in B, from your measured pH values (no unit)', unit: 'none' },
      { id: 'ionised', label: 'Percentage of the 0.10 mol dm⁻³ ethanoic acid (B) that is ionised, from your measured pH', unit: '%' },
    ];
  if (task === 'IND')
    return [
      { id: 'meanMo', label: 'Mean titre with methyl orange (concordant titres)', unit: 'cm3' },
      { id: 'meanZobo', label: 'Mean titre with the zobo extract (concordant titres)', unit: 'cm3' },
      { id: 'diff', label: 'Difference between the two mean titres', unit: 'cm3' },
      { id: 'pctDiff', label: 'Percentage difference = difference ÷ methyl-orange titre × 100', unit: '%' },
    ];
  if (task === 'ACID')
    return [
      { id: 'molCaco3', label: 'Amount (moles) of CaCO₃ in your marble chips (CaCO₃ = 100)', unit: 'mol' },
      { id: 'massCo2', label: 'Mass of CO₂ expected (CaCO₃ + 2HCl → CaCl₂ + H₂O + CO₂; CO₂ = 44)', unit: 'g' },
      { id: 'lost', label: 'Mass lost (measured) = (flask + acid) + chips − final mass', unit: 'g' },
      { id: 'pctCo2', label: 'Mass lost as a percentage of the expected mass of CO₂', unit: '%' },
    ];
  return [
    { id: 'tempX', label: 'Soap used by the temporary hardness of sample X (before − after boiling)', unit: 'cm3' },
    { id: 'permX', label: 'Soap used by the permanent hardness of X (after boiling − distilled-water blank)', unit: 'cm3' },
    { id: 'totalX', label: 'Soap used by the total hardness of X (before boiling − blank)', unit: 'cm3' },
    { id: 'pctTemp', label: 'Percentage of the hardness of X that is temporary', unit: '%' },
  ];
}

export interface AcidsOverrides {
  cHcl?: number;
  cNaoh?: number;
  cAcid?: number;
  acidConc?: number;
  tempX?: number;
  permX?: number;
}

function build(seed: number, task: AcidsTask, o: AcidsOverrides = {}): ChemAcidsVariant {
  const room = labBetween(labRandom(seed, 'chem-acids-room'), 25, 30, 1);
  const r1 = labRandom(seed, 'chem-acids-ph');
  const cHcl = o.cHcl ?? (r1() < 0.5 ? 0.1 : 0.01);
  const nb = r1();
  const cNaoh = o.cNaoh ?? (nb < 0.4 ? 0.1 : nb < 0.75 ? 0.01 : 0.001);
  const ph: PhVariant = {
    pH: {
      HCL: roundDp(-Math.log10(cHcl), 2),
      ETH: roundDp(ethanoicPh(PH_ETH_C), 2),
      LIME: labBetween(r1, 2.1, 2.6, 2),
      COLA: labBetween(r1, 2.4, 2.8, 2),
      WATER: labBetween(r1, 6.7, 7.0, 2),
      BICARB: labBetween(r1, 8.2, 8.5, 2),
      SOAP: labBetween(r1, 9.3, 10.2, 2),
      ASH: labBetween(r1, 10.3, 11.3, 2),
      NAOH: roundDp(14 + Math.log10(cNaoh), 2),
    },
    cHcl,
    cNaoh,
    residue: labBetween(r1, 8.0, 8.4, 2),
  };
  const r2 = labRandom(seed, 'chem-acids-ind');
  const cBase = sf3(labBetween(r2, 0.096, 0.104, 4));
  const ind: IndVariant = {
    pH: { HCL: labBetween(r2, 1.0, 1.3, 2), VINEGAR: labBetween(r2, 2.8, 3.1, 2), WATER: labBetween(r2, 6.8, 7.0, 2), SODA: labBetween(r2, 8.2, 8.5, 2), NAOH: labBetween(r2, 12.8, 13.1, 2) },
    cAcid: o.cAcid ?? sf3(labBetween(r2, 0.096, 0.106, 4)),
    cBase,
    fills: Array.from({ length: 12 }, () => roundDp(Math.round(labBetween(r2, 0, 1.6, 2) * 10) / 10, 2)),
    pipLoss: labBetween(r2, 0.006, 0.012, 4),
    burDil: labBetween(r2, 0.006, 0.012, 4),
    extractAcid: labBetween(r2, 0.003, 0.005, 4),
    zoboEnd: labBetween(r2, 3.4, 3.6, 2),
  };
  const r3 = labRandom(seed, 'chem-acids-acid');
  const acid: AcidVariant = {
    conc: o.acidConc ?? sf3(labBetween(r3, 1.95, 2.05, 3)),
    chips: Array.from({ length: 24 }, () => labBetween(r3, 0.17, 0.33, 2)),
    flask: labBetween(r3, 88, 108, 2),
    plugMass: labBetween(r3, 0.4, 0.7, 2),
    offset: labBetween(r3, 0.04, 0.12, 2),
    tau: labBetween(r3, 70, 110, 0),
    retained: labBetween(r3, 0.01, 0.03, 3),
    spray: labBetween(r3, 0.03, 0.06, 3),
    room,
  };
  const r4 = labRandom(seed, 'chem-acids-hard');
  const tempSample: 'X' | 'Y' = r4() < 0.5 ? 'X' : 'Y';
  const mainlyTemp = { temp: labBetween(r4, 7.5, 9.5, 2), perm: labBetween(r4, 2.5, 3.8, 2) };
  const mainlyPerm = { temp: labBetween(r4, 0.6, 1.4, 2), perm: labBetween(r4, 3.6, 5.5, 2) };
  const X = tempSample === 'X' ? mainlyTemp : mainlyPerm;
  const Y = tempSample === 'X' ? mainlyPerm : mainlyTemp;
  const hard: HardVariant = {
    blank: labBetween(r4, 0.3, 0.48, 2),
    temp: { DIST: 0, RAIN: 0, TAP: labBetween(r4, 1.2, 2.2, 2), X: o.tempX ?? X.temp, Y: Y.temp },
    perm: { DIST: 0, RAIN: labBetween(r4, 0.0, 0.2, 2), TAP: labBetween(r4, 0.6, 1.2, 2), X: o.permX ?? X.perm, Y: Y.perm },
    removal: labBetween(r4, 0.93, 0.98, 3),
    short: labBetween(r4, 0.45, 0.6, 2),
    evap: labBetween(r4, 0.1, 0.15, 3),
    fills: Array.from({ length: 14 }, () => roundDp(Math.round(labBetween(r4, 0, 1.6, 2) * 10) / 10, 2)),
    swirl: labBetween(r4, 0.8, 1.3, 2),
    froth: labBetween(r4, 0.7, 1.2, 2),
    rough: labBetween(r4, 40, 62, 0),
    tempSample,
  };
  const given =
    task === 'PH'
      ? [`You are provided with samples A–I: A ${cHcl} mol dm⁻³ HCl, B 0.10 mol dm⁻³ ethanoic acid, C lime juice, D Coca-Cola, E distilled water, F NaHCO₃ solution, G soap solution, H wood-ash extract, I ${cNaoh} mol dm⁻³ NaOH; universal indicator and its colour chart.`, 'Put about 2 cm³ of each in a clean, labelled test tube, add 2 drops of universal indicator, shake, and compare the colour with the chart against a white background. Record the pH and classify each sample.', 'Classes: strongly acidic 0–3, weakly acidic 4–6, neutral 7, weakly alkaline 8–10, strongly alkaline 11–14.']
      : task === 'IND'
        ? ['You are provided with dried zobo (hibiscus) calyces, ethanol, warm water, dilute HCl, vinegar, baking-soda solution, dilute NaOH, universal indicator, methyl orange and a titration set.', 'Extract the colour of the calyces and filter. Test the extract and universal indicator in each of the five solutions. Titrate 25.0 cm³ of the NaOH with the HCl, first with methyl orange, then with 2–3 drops of the extract, and compare the titres.', 'Ethanol is flammable: warm it only in a water bath.']
        : task === 'ACID'
          ? [`You are provided with ${acid.conc.toFixed(2)} mol dm⁻³ HCl, magnesium ribbon, zinc granules, copper turnings, copper(II) oxide, marble chips, limewater and wooden splints.`, 'Add dilute HCl to Mg, Zn and Cu and test any gas with a burning splint; warm CuO with HCl; pass the gas from marble into limewater.', 'Weigh a flask of excess HCl (with a cotton-wool plug) and about 2.00 g of marble chips; add the marble and weigh again when the reaction is over. (CaCO₃ = 100, CO₂ = 44)']
          : ['You are provided with standard soap solution in a burette, distilled water, rain water, tap water and samples X and Y.', 'Run soap solution, 0.5 cm³ at a time, into 50.0 cm³ of each sample in a stoppered flask, shaking after each addition, until a lather lasts 2 minutes. Boil 50 cm³ of each hard sample for 5 minutes, cool, make up to 50 cm³ with distilled water, filter and repeat.', 'Distilled water is the blank.'];
  return { seed, task, ph, ind, acid, hard, tasks: tasksFor(task, ph), given };
}

/** The hidden truth of one attempt (same on the web and the API). */
export function chemAcidsVariant(seed: number, task: AcidsTask = 'PH'): ChemAcidsVariant {
  return build(seed, task);
}
/** A variant from the sandbox's own choices (unmarked). */
export function chemAcidsCustomVariant(seed: number, task: AcidsTask, o: AcidsOverrides): ChemAcidsVariant {
  return build(seed, task, o);
}

// ================================================================== the student's work

export interface PhTube {
  vol: 'TWO' | 'FULL' | null;
  drops: number;
  shaken: boolean;
  compared: boolean;
}
export interface PhWork {
  rinsed: boolean;
  /** The white tile stood behind the rack, in good light. */
  tile: boolean;
  tubes: Record<PhSample, PhTube>;
}
export interface IndRun {
  ind: IndIndicator;
  drops: number;
  /** Burette reading when the run began, and the acid run in since. */
  start: number;
  added: number;
  done: boolean;
  /** Burette filled before it was rinsed with the acid; pipette not rinsed with the alkali. */
  dilA: boolean;
  dilB: boolean;
}
export interface IndWork {
  solvent: 'ETHANOL' | 'WATER' | null;
  heat: 'BATH' | 'FLAME' | 'NONE' | null;
  filtered: boolean;
  tests: Record<IndSol, { ext: boolean; ui: boolean }>;
  burRinsed: boolean;
  pipRinsed: boolean;
  /** Burette reading (null: empty); fills so far; whether the present fill is diluted. */
  burette: number | null;
  fills: number;
  fillDilute: boolean;
  /** A flask of 25.0 cm³ NaOH waiting for its indicator. */
  flask: boolean;
  flaskDilute: boolean;
  runs: IndRun[];
}
export interface AcidTubeWork {
  acid: boolean;
  warmed: 'GENTLE' | 'STRONG' | null;
  tests: AcidTest[];
}
export interface AcidWork {
  tubes: Record<AcidTube, AcidTubeWork>;
  zeroed: boolean;
  /** Taps of marble chips onto the balance. */
  chips: number;
  acidVol: number | null;
  plug: boolean;
  /** Flask + acid (+ plug) weighed before the chips went in. */
  flaskWeighed: boolean;
  added: boolean;
  /** Seconds after the chips went in at which the flask was weighed. */
  weighings: number[];
}
export interface HardRun {
  sample: HardSample;
  boiled: boolean;
  /** cm³ of sample in the flask. */
  vol: number;
  start: number;
  added: number;
  /** More than 0.5 cm³ added at once; a swirl instead of stoppering and shaking. */
  big: boolean;
  swirled: boolean;
  /** Watched for 2 minutes (and the lather lasted) before reading. */
  watched: boolean;
  done: boolean;
}
export interface HardWork {
  burRinsed: boolean;
  burette: number | null;
  fills: number;
  fillDilute: boolean;
  boiled: Record<HardSample, HardBoil | null>;
  runs: HardRun[];
}

const PH_REC = PH_SAMPLES.flatMap((s) => [`ph${s}`, `cl${s}`]);
const IND_REC = [...IND_SOLS.flatMap((s) => [`ex${s}`, `ui${s}`]), 'rangeLo', 'rangeHi', ...['mo', 'z'].flatMap((p) => [1, 2, 3].flatMap((n) => [`${p}${n}i`, `${p}${n}f`, `${p}${n}t`]))];
const ACID_REC = ['gasMG', 'gasZN', 'gasCU', 'gasCACO3', 'cuo', 'm1', 'm2', 'm3'];
const HARD_REC = [...HARD_SAMPLES.map((s) => `v${s}`), ...HARD_BOILABLE.map((s) => `b${s}`), 'hardest', 'permSample'];
export const ACIDS_REC_KEYS = [...PH_REC, ...IND_REC, ...ACID_REC, ...HARD_REC] as readonly string[];
export type AcidsRecKey = string;

export interface AcidsAnswer {
  value: string;
  unit: string;
}
export interface ChemAcidsState {
  v: 1;
  task: AcidsTask | null;
  ph: PhWork;
  ind: IndWork;
  acid: AcidWork;
  hard: HardWork;
  rec: Record<string, string>;
  answers: Record<AcidsAnswerId, AcidsAnswer>;
  written: { observation: string; explain: string; precautions: string };
  log: { t: number; a: string }[];
}

const emptyTube = (): PhTube => ({ vol: null, drops: 0, shaken: false, compared: false });
export function emptyChemAcidsState(): ChemAcidsState {
  const blank = () => ({ value: '', unit: '' });
  return {
    v: 1,
    task: null,
    ph: { rinsed: false, tile: false, tubes: Object.fromEntries(PH_SAMPLES.map((s) => [s, emptyTube()])) as Record<PhSample, PhTube> },
    ind: { solvent: null, heat: null, filtered: false, tests: Object.fromEntries(IND_SOLS.map((s) => [s, { ext: false, ui: false }])) as IndWork['tests'], burRinsed: false, pipRinsed: false, burette: null, fills: 0, fillDilute: false, flask: false, flaskDilute: false, runs: [] },
    acid: { tubes: Object.fromEntries(ACID_TUBES.map((t): [AcidTube, AcidTubeWork] => [t, { acid: false, warmed: null, tests: [] }])) as AcidWork['tubes'], zeroed: false, chips: 0, acidVol: null, plug: false, flaskWeighed: false, added: false, weighings: [] },
    hard: { burRinsed: false, burette: null, fills: 0, fillDilute: false, boiled: Object.fromEntries(HARD_SAMPLES.map((s) => [s, null])) as HardWork['boiled'], runs: [] },
    rec: Object.fromEntries(ACIDS_REC_KEYS.map((k) => [k, ''])),
    answers: Object.fromEntries(ACIDS_ANSWER_IDS.map((k) => [k, blank()])) as Record<AcidsAnswerId, AcidsAnswer>,
    written: { observation: '', explain: '', precautions: '' },
    log: [],
  };
}

// ================================================================== PH model

/** The pH the tube's contents really have (unrinsed tubes carry a trace of soap that the unbuffered distilled water feels). */
export function phEffective(v: ChemAcidsVariant, w: Pick<PhWork, 'rinsed'>, s: PhSample): number {
  if (!w.rinsed && s === 'WATER') return v.ph.residue;
  return v.ph.pH[s];
}
/** The whole-number pH the chart gives for a tube (what a careful student records). */
export const phReading = (v: ChemAcidsVariant, w: Pick<PhWork, 'rinsed'>, s: PhSample) => Math.round(phEffective(v, w, s));
/** What the tube looks like: the sample's own colour, the indicator's colour, paler in a full tube; streaky before shaking. */
export function phTubeColour(v: ChemAcidsVariant, w: Pick<PhWork, 'rinsed'>, s: PhSample, t: PhTube): string | null {
  if (!t.vol) return null;
  const own = PH_INFO[s].own;
  if (t.drops <= 0) return own;
  const perCm3 = t.drops / (t.vol === 'FULL' ? 10 : 2);
  const f = Math.min(1, 0.4 + 0.6 * Math.min(1, perCm3)) * (s === 'COLA' ? 0.55 : s === 'LIME' || s === 'ASH' ? 0.85 : 1);
  const c = mixHex(own, uiColour(phEffective(v, w, s)), f);
  return t.shaken ? c : mixHex(own, c, 0.6);
}
/** pH answers: −log c, 14 + log c, the tenfold rule and the degree of ionisation. */
export function phChain(cHcl: number, cNaoh: number, phA: number, phB: number) {
  return { hplus: cHcl, phHcl: -Math.log10(cHcl), phNaoh: 14 + Math.log10(cNaoh), ratio: 10 ** (phB - phA), ionised: (10 ** -phB / PH_ETH_C) * 100 };
}

// ================================================================== IND model

const KW = 1e-14;
/** pH in the titration flask with `vol` cm³ of acid run into 25.0 cm³ of alkali (exact, with water's own ions). */
export function indPh(v: ChemAcidsVariant, r: Pick<IndRun, 'ind' | 'drops' | 'dilA' | 'dilB'>, vol: number): number {
  const i = v.ind;
  const nB = (IND_PIPETTE / 1000) * i.cBase * (r.dilB ? 1 - i.pipLoss : 1);
  const cA = i.cAcid * (r.dilA ? 1 - i.burDil : 1);
  const extra = r.ind === 'ZOBO' ? r.drops * i.extractAcid : 0;
  const nA = ((vol + extra) / 1000) * cA;
  const V = (IND_PIPETTE + vol + r.drops * 0.05) / 1000;
  const d = (nA - nB) / V;
  const h = (d + Math.sqrt(d * d + 4 * KW)) / 2;
  return -Math.log10(h);
}
/** The end-point pH of each indicator in this variant. */
export const indEndPh = (v: ChemAcidsVariant, ind: IndIndicator) => (ind === 'MO' ? IND_END_PH.MO : v.ind.zoboEnd);
/** The acid volume (cm³) at which the colour first reaches the end point (exact). */
export function indEndpoint(v: ChemAcidsVariant, r: Pick<IndRun, 'ind' | 'drops' | 'dilA' | 'dilB'>): number {
  const target = indEndPh(v, r.ind);
  let lo = 0;
  let hi = IND_BURETTE;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (indPh(v, r, mid) > target) lo = mid;
    else hi = mid;
  }
  return hi;
}
/** The flask's colour now. */
export function indFlaskColour(v: ChemAcidsVariant, r: Pick<IndRun, 'ind' | 'drops' | 'dilA' | 'dilB'>, vol: number): string {
  const pH = indPh(v, r, vol);
  if (r.ind === 'MO') return mixHex('#f3f6f8', moColour(pH), Math.min(0.9, 0.3 + r.drops * 0.2));
  const deep = Math.min(0.95, 0.25 + r.drops * 0.09);
  return mixHex('#f3f6f8', zoboColour(pH), deep);
}
/** The extract's colour in a test solution (deeper with ethanol and warming). */
export function extractColour(v: ChemAcidsVariant, w: Pick<IndWork, 'solvent' | 'heat'>, sol: IndSol): string {
  const strength = (w.solvent === 'ETHANOL' ? 0.85 : 0.75) * (w.heat === 'NONE' ? 0.75 : 1);
  return mixHex('#eef3f6', zoboColour(v.ind.pH[sol]), strength);
}
export const indOpenRun = (w: Pick<IndWork, 'runs'>) => {
  const r = w.runs.at(-1);
  return r && !r.done ? r : null;
};
/** Concordant titres (within 0.10 cm³) of one indicator → their mean (null: none). */
export function indConcordantMeans(titres: number[], tol = 0.1): number[] {
  const out: number[] = [];
  for (let a = 0; a < titres.length; a++)
    for (let b = a + 1; b < titres.length; b++) {
      if (Math.abs(titres[a]! - titres[b]!) <= tol + 1e-9) out.push((titres[a]! + titres[b]!) / 2);
      for (let c = b + 1; c < titres.length; c++) {
        const xs = [titres[a]!, titres[b]!, titres[c]!];
        if (Math.max(...xs) - Math.min(...xs) <= tol + 1e-9) out.push((xs[0]! + xs[1]! + xs[2]!) / 3);
      }
    }
  return out;
}

// ================================================================== ACID model

export const acidChips = (v: ChemAcidsVariant, w: Pick<AcidWork, 'chips'>) => roundDp(v.acid.chips.slice(0, w.chips).reduce((t, x) => t + x, 0), 2);
const acidMolHcl = (v: ChemAcidsVariant, w: Pick<AcidWork, 'acidVol'>) => ((w.acidVol ?? 0) * v.acid.conc) / 1000;
/** Is the acid in excess (at least 1.5 times what the marble needs)? */
export const acidExcess = (v: ChemAcidsVariant, w: Pick<AcidWork, 'acidVol' | 'chips'>) => acidMolHcl(v, w) >= ((2 * acidChips(v, w)) / M_CACO3) * 1.5;
const acidTau = (v: ChemAcidsVariant, w: Pick<AcidWork, 'acidVol' | 'chips'>) => v.acid.tau * (acidExcess(v, w) ? 1 : 1.8);
/** Fraction of the reaction done t s after the chips went in. */
export const acidExtent = (v: ChemAcidsVariant, w: Pick<AcidWork, 'acidVol' | 'chips'>, t: number) => 1 - Math.exp(-Math.max(0, t) / acidTau(v, w));
/** Moles of CaCO₃ that can react (the acid may run out). */
export const acidReacting = (v: ChemAcidsVariant, w: Pick<AcidWork, 'acidVol' | 'chips'>) => Math.min(acidChips(v, w) / M_CACO3, acidMolHcl(v, w) / 2);
/** True mass of flask + acid (+ plug if used). */
export const acidFlaskMass = (v: ChemAcidsVariant, w: Pick<AcidWork, 'acidVol' | 'plug'>) => v.acid.flask + (w.acidVol ?? 0) * 1.03 + (w.plug ? v.acid.plugMass : 0);
/** Mass lost t s after the chips went in (g): CO₂ out of the flask (less what stays dissolved) and, with no plug, acid spray. */
export function acidLoss(v: ChemAcidsVariant, w: Pick<AcidWork, 'acidVol' | 'chips' | 'plug'>, t: number): number {
  const e = acidExtent(v, w, t);
  const co2 = acidReacting(v, w) * M_CO2;
  return e * Math.max(0, co2 - v.acid.retained * Math.min(1, co2 / 0.5)) + (w.plug ? 0 : v.acid.spray * e);
}
/** What the balance shows (g, 2 d.p.): flask, flask + chips reacting, or the chips. */
export function acidBalance(v: ChemAcidsVariant, w: AcidWork, what: 'chips' | 'flask' | 'total', t = 0): number {
  const off = w.zeroed ? 0 : v.acid.offset;
  if (what === 'chips') return roundDp(acidChips(v, w) + off, 2);
  if (what === 'flask') return roundDp(acidFlaskMass(v, w) + off, 2);
  return roundDp(acidFlaskMass(v, w) + acidChips(v, w) - acidLoss(v, w, t) + off, 2);
}
/** Does the marble effervesce / the metal react? What each gas test shows. */
export function acidTestResult(tube: AcidTube, test: AcidTest, w: Pick<AcidTubeWork, 'acid' | 'warmed'>): string {
  if (!w.acid) return 'There is no acid in the tube yet.';
  const gasH2 = tube === 'MG' || tube === 'ZN';
  if (test === 'BURNING') return gasH2 ? 'A squeaky “pop”: hydrogen.' : tube === 'CACO3' ? 'The splint goes out.' : 'The splint keeps burning: no gas.';
  if (test === 'GLOWING') return tube === 'CACO3' ? 'The glowing splint goes out.' : 'The splint is not relit: not oxygen.';
  return tube === 'CACO3' ? 'The limewater turns milky.' : 'The limewater stays clear.';
}
export const acidGasOf = (tube: AcidTube): (typeof ACID_GASES)[number] => (tube === 'MG' || tube === 'ZN' ? 'hydrogen' : tube === 'CACO3' ? 'carbon dioxide' : 'none');
export const acidChain = (m: number, lost: number | null) => {
  const n = m / M_CACO3;
  return { molCaco3: n, massCo2: n * M_CO2, pctCo2: lost === null ? null : (lost / (n * M_CO2)) * 100 };
};

// ================================================================== HARD model

export const hardOpenRun = (w: Pick<HardWork, 'runs'>) => {
  const r = w.runs.at(-1);
  return r && !r.done ? r : null;
};
/** Soap (cm³) a run's flask needs for a lather that lasts 2 minutes. */
export function hardNeed(v: ChemAcidsVariant, w: Pick<HardWork, 'boiled'>, r: Pick<HardRun, 'sample' | 'boiled' | 'vol' | 'swirled'>, dilute = false): number {
  const h = v.hard;
  const how = r.boiled ? (w.boiled[r.sample] ?? 'FULL') : null;
  const keep = how === 'SHORT' ? 1 - h.short : how ? 1 - h.removal : 1;
  const conc = how === 'NOMAKEUP' ? 1 / (1 - h.evap) : 1;
  const hardness = (h.temp[r.sample] * keep + h.perm[r.sample]) * conc;
  return ((h.blank + hardness) * r.vol) / HARD_VOL * (dilute ? 1.03 : 1) + (r.swirled ? h.swirl : 0);
}
export type HardLather = 'NONE' | 'FROTH' | 'LASTING';
export function hardLather(v: ChemAcidsVariant, w: Pick<HardWork, 'boiled' | 'fillDilute'>, r: HardRun): HardLather {
  const need = hardNeed(v, w, r, w.fillDilute);
  return r.added >= need - 1e-9 ? 'LASTING' : r.added >= need - v.hard.froth ? 'FROTH' : 'NONE';
}
/** The soap a careful student records for a sample (0.5 cm³ steps). */
export const hardIdeal = (v: ChemAcidsVariant, sample: HardSample, boiled: boolean) => Math.ceil((hardNeed(v, { boiled: { ...emptyBoil(), [sample]: boiled ? 'FULL' : null } }, { sample, boiled, vol: HARD_VOL, swirled: false }) - 1e-9) / HARD_STEP) * HARD_STEP;
const emptyBoil = () => Object.fromEntries(HARD_SAMPLES.map((s) => [s, null])) as Record<HardSample, HardBoil | null>;
/** Scum appears in a hard sample as the soap goes in. */
export const hardScum = (v: ChemAcidsVariant, r: HardRun) => v.hard.temp[r.sample] + v.hard.perm[r.sample] > 0.8 && r.added > 0;
export const hardChain = (before: number, after: number, blank: number) => {
  const temp = before - after;
  const perm = after - blank;
  const total = before - blank;
  return { tempX: temp, permX: perm, totalX: total, pctTemp: total > 0 ? (temp / total) * 100 : 0 };
};

// ================================================================== schema

const short = z.string().max(40);
const num = (a: number, b: number) => z.number().min(a).max(b);
const answer = z.object({ value: short, unit: short });
const phTube = z.object({ vol: z.enum(['TWO', 'FULL']).nullable(), drops: z.number().int().min(0).max(40), shaken: z.boolean(), compared: z.boolean() });
const indRun = z.object({ ind: z.enum(['MO', 'ZOBO']), drops: z.number().int().min(0).max(60), start: num(0, 50), added: num(0, 50), done: z.boolean(), dilA: z.boolean(), dilB: z.boolean() });
const acidTube = z.object({ acid: z.boolean(), warmed: z.enum(['GENTLE', 'STRONG']).nullable(), tests: z.array(z.enum(ACID_TESTS)).max(12) });
const hardRun = z.object({ sample: z.enum(HARD_SAMPLES), boiled: z.boolean(), vol: num(0, 100), start: num(0, 50), added: num(0, 50), big: z.boolean(), swirled: z.boolean(), watched: z.boolean(), done: z.boolean() });
export const chemAcidsStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(ACIDS_TASKS).nullable(),
  ph: z.object({ rinsed: z.boolean(), tile: z.boolean(), tubes: z.object(Object.fromEntries(PH_SAMPLES.map((s) => [s, phTube])) as Record<PhSample, typeof phTube>) }),
  ind: z.object({
    solvent: z.enum(['ETHANOL', 'WATER']).nullable(),
    heat: z.enum(['BATH', 'FLAME', 'NONE']).nullable(),
    filtered: z.boolean(),
    tests: z.object(Object.fromEntries(IND_SOLS.map((s) => [s, z.object({ ext: z.boolean(), ui: z.boolean() })])) as Record<IndSol, z.ZodObject<{ ext: z.ZodBoolean; ui: z.ZodBoolean }>>),
    burRinsed: z.boolean(),
    pipRinsed: z.boolean(),
    burette: num(0, 50).nullable(),
    fills: z.number().int().min(0).max(12),
    fillDilute: z.boolean(),
    flask: z.boolean(),
    flaskDilute: z.boolean(),
    runs: z.array(indRun).max(12),
  }),
  acid: z.object({
    tubes: z.object(Object.fromEntries(ACID_TUBES.map((t) => [t, acidTube])) as Record<AcidTube, typeof acidTube>),
    zeroed: z.boolean(),
    chips: z.number().int().min(0).max(24),
    acidVol: num(0, 100).nullable(),
    plug: z.boolean(),
    flaskWeighed: z.boolean(),
    added: z.boolean(),
    weighings: z.array(num(0, 100_000)).max(40),
  }),
  hard: z.object({
    burRinsed: z.boolean(),
    burette: num(0, 50).nullable(),
    fills: z.number().int().min(0).max(14),
    fillDilute: z.boolean(),
    boiled: z.object(Object.fromEntries(HARD_SAMPLES.map((s) => [s, z.enum(['FULL', 'SHORT', 'NOMAKEUP']).nullable()])) as Record<HardSample, z.ZodNullable<z.ZodEnum<{ FULL: 'FULL'; SHORT: 'SHORT'; NOMAKEUP: 'NOMAKEUP' }>>>),
    runs: z.array(hardRun).max(14),
  }),
  rec: z.object(Object.fromEntries(ACIDS_REC_KEYS.map((k) => [k, short])) as Record<string, typeof short>),
  answers: z.object(Object.fromEntries(ACIDS_ANSWER_IDS.map((k) => [k, answer])) as Record<AcidsAnswerId, typeof answer>),
  written: z.object({ observation: z.string().max(2000), explain: z.string().max(2000), precautions: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(1200),
}) satisfies z.ZodType<ChemAcidsState>;

export const CHEM_ACIDS: SimulatorSpec = {
  id: 'chem-acids',
  subject: 'Chemistry',
  title: 'Acids, bases and water',
  topicNames: ['Concept of pH', 'Acid-base indicators', 'Reactions of acids with metals, oxides and trioxocarbonates (IV)', 'Water and solution', 'Acids, bases and salts'],
  minutes: 50,
  rubric: [
    { id: 'setup', label: 'Setting up', marks: 2, how: 'AUTO', guide: 'pH: test tubes rinsed with distilled water (1); about 2 cm³ of each sample in its own labelled tube (1). Indicator: calyces crushed with warm water or ethanol (1); extract filtered (1). Acids: excess acid (50 cm³) and about 2.00 g of marble (1); cotton-wool plug (1). Hardness: 50.0 cm³ of every sample measured (1); burette rinsed with soap solution and filled (1).' },
    { id: 'procedure', label: 'Procedure', marks: 5, how: 'AUTO', guide: 'pH: every sample tested with indicator (4), each compared with the chart (1). Indicator: extract tested in all five solutions (1), universal indicator in the same five (1), burette rinsed with acid and pipette with alkali (1), titrations with methyl orange (1) and with the extract (1). Acids: HCl on Mg, Zn and Cu (1), gas tested with a burning splint (1), CuO warmed with acid (1), marble gas into limewater (1), flask weighed before and after (1). Hardness: the five samples including the blank (2), hard samples boiled 5 min, cooled, made up and filtered (1), boiled X and Y tested (1), boiled tap water tested (1).' },
    { id: 'technique', label: 'Technique', marks: 3, how: 'AUTO', guide: 'pH: the same 2 drops in every tube (1), shaken (1), compared against a white background (1). Indicator: no naked flame near ethanol (1), 2–3 drops of indicator in each titration (1), concordant titres for each indicator (1). Acids: balance zeroed (1), CuO warmed gently (1), weighed until the mass stopped changing (1). Hardness: 0.5 cm³ at a time (1), stoppered and shaken each time (1), lather lasting 2 minutes before reading (1).' },
    { id: 'readings', label: 'Measurements', marks: 4, how: 'AUTO', guide: 'pH: pH of each sample within 1 of the chart (2), whole numbers (1), classes consistent with the pH (1). Indicator: extract colours (1), universal-indicator pH (1), the extract’s colour-change range (1), burette readings to 2 d.p. matching the burette (1). Acids: gases identified (1), masses to 2 d.p. (1) matching the balance (2). Hardness: soap volumes as the burette showed (2), to 1 d.p. (1), hardest and mainly-permanent samples (1).' },
    { id: 'calculations', label: 'Calculations', marks: 5, how: 'AUTO', guide: 'pH: [H⁺] (1), pH = −log[H⁺] (1), pH of the NaOH = 14 − pOH (1), tenfold ratio (1), percentage ionised (1). Indicator: mean titres (1 + 1), difference (1), percentage difference (2). Acids: moles of CaCO₃ (1), mass of CO₂ (1), mass lost (1), percentage (2). Hardness: temporary (1), permanent (1), total (1), percentage temporary (2). Errors carried forward.' },
    { id: 'units', label: 'Units', marks: 1, how: 'AUTO', guide: 'Every answer with its correct unit (mol dm⁻³, cm³, mol, g, %; pH and ratios have none).' },
    { id: 'observation', label: 'Observations', marks: 2, how: 'AI', guide: 'pH: the colours (red for HCl, orange for ethanoic acid, green for water, blue for soap, violet for NaOH). Indicator: red in acids, purple near neutral, green to yellow in alkali; the end-point colours. Acids: effervescence with Mg and Zn and a pop; no change with Cu; CuO dissolves to a blue-green solution; marble effervesces and limewater turns milky. Hardness: distilled and rain water lather at once; hard samples form scum and need more soap; boiling reduces the soap for temporary hardness.' },
    { id: 'explain', label: 'Explanation', marks: 1, how: 'AI', guide: 'pH: strong acids are fully ionised, weak acids partly. Indicator: a weak acid whose ionised and un-ionised forms differ in colour. Acids: copper is below hydrogen in the activity series; acid + carbonate → salt + water + CO₂. Hardness: boiling decomposes Ca(HCO₃)₂ to CaCO₃; CaSO₄ (permanent) is not removed by boiling.' },
    { id: 'precautions', label: 'Precautions', marks: 1, how: 'AI', guide: 'Two correct precautions from the lesson, e.g. same number of drops; clean rinsed tubes; daylight and a white background; filtered fresh extract; same volume of indicator; no flame near ethanol; cotton-wool plug; acid in excess; balance zeroed; same volume of each sample; the same shaking; a distilled-water blank; goggles; never taste.' },
  ],
};
