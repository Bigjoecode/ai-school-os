import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { labBetween, labPick, labRandom, roundDp } from './seeded';

/**
 * bio-food-tests: WAEC food tests and the action of salivary amylase. The one
 * source of truth for the chemistry of both: the web shows these outcomes and
 * the API marks against them.
 *
 * FOOD (pr-bio-food-tests): food samples P, Q and R (seeded per attempt, from
 * a library of real foods) are tested for starch (iodine), reducing sugar
 * (Benedict's, heated in a boiling water bath: blue → green → yellow → orange →
 * brick-red with concentration, developing over the heating time),
 * non-reducing sugar (boiled with dilute HCl, neutralised with NaHCO₃, then
 * Benedict's), protein (Biuret or Millon's) and fat (Sudan III, the
 * grease-spot or the emulsion test). The student records TEST | OBSERVATION |
 * INFERENCE and names the food substances in each sample.
 *
 * AMYLASE (pr-bio-salivary-amylase): starch and saliva in water baths (ice,
 * room, 37 °C, 45 °C, boiling) and a boiled-saliva control; after mixing, a
 * drop of each mixture is spotted on iodine on a spotting tile at intervals
 * until the iodine no longer turns blue-black (the end point). The student
 * records the end-point times, works out 1000/t, names the optimum
 * temperature and tests a digested mixture with Benedict's solution.
 */

export const FOOD_TASKS = ['FOOD', 'AMYLASE'] as const;
export type FoodTask = (typeof FOOD_TASKS)[number];
/** The lessons that open this lab, and the task each one sets. */
export const FOOD_PRACTICAL_TASKS: Record<string, FoodTask> = { 'pr-bio-food-tests': 'FOOD', 'pr-bio-salivary-amylase': 'AMYLASE' };
export const FOOD_TASK_TITLE: Record<FoodTask, string> = { FOOD: 'Food tests on samples P, Q and R', AMYLASE: 'Salivary amylase and temperature' };

export const NUTRIENTS = ['STARCH', 'REDUCING', 'NONREDUCING', 'PROTEIN', 'FAT'] as const;
export type Nutrient = (typeof NUTRIENTS)[number];
export const NUTRIENT_LABEL: Record<Nutrient, string> = { STARCH: 'Starch', REDUCING: 'Reducing sugar', NONREDUCING: 'Non-reducing sugar', PROTEIN: 'Protein', FAT: 'Fat / oil' };

/** P, Q, R: the food samples; '1'…'6': the amylase task's tube mixtures (for Benedict's tests on them). */
export const FOOD_SAMPLES = ['P', 'Q', 'R', '1', '2', '3', '4', '5', '6'] as const;
export type FoodSample = (typeof FOOD_SAMPLES)[number];
export const FOOD_LETTERS = ['P', 'Q', 'R'] as const;
export type FoodLetter = (typeof FOOD_LETTERS)[number];

export const FOOD_TESTS = ['IODINE', 'BENEDICT', 'NONREDUCING', 'BIURET', 'MILLON', 'SUDAN', 'GREASE', 'EMULSION'] as const;
export type FoodTestId = (typeof FOOD_TESTS)[number];
export const FOOD_STEPS = ['ACID', 'NEUTRALISE', 'BENEDICT', 'NAOH', 'CUSO4', 'DRY', 'ETHANOL', 'WATER'] as const;
export type FoodStep = (typeof FOOD_STEPS)[number];

export interface FoodTestInfo {
  label: string;
  /** Short name (rack, chips). */
  short: string;
  nutrient: Nutrient;
  /** Additions after the first reagent, in order. */
  steps: { id: FoodStep; label: string }[];
  /** Heated in the water bath (seconds in `heat`). */
  heats: boolean;
}
export const FOOD_TEST_INFO: Record<FoodTestId, FoodTestInfo> = {
  IODINE: { label: 'Iodine solution (2–3 drops)', short: 'Iodine', nutrient: 'STARCH', steps: [], heats: false },
  BENEDICT: { label: "Benedict's solution, then heat in a boiling water bath", short: "Benedict's", nutrient: 'REDUCING', steps: [], heats: true },
  NONREDUCING: {
    label: "Non-reducing sugar: boil with dilute HCl, neutralise, then Benedict's",
    short: 'Non-reducing',
    nutrient: 'NONREDUCING',
    steps: [
      { id: 'ACID', label: 'Add 1 cm³ dilute HCl and boil in the water bath (2 min)' },
      { id: 'NEUTRALISE', label: 'Cool; add NaHCO₃ until the fizzing stops' },
      { id: 'BENEDICT', label: "Add an equal volume of Benedict's solution" },
    ],
    heats: true,
  },
  BIURET: {
    label: 'Biuret test: NaOH(aq), then 1% CuSO₄',
    short: 'Biuret',
    nutrient: 'PROTEIN',
    steps: [
      { id: 'NAOH', label: 'Add 1 cm³ NaOH(aq)' },
      { id: 'CUSO4', label: 'Add 2 drops of 1% CuSO₄ and shake' },
    ],
    heats: false,
  },
  MILLON: { label: "Millon's reagent, then warm gently in the water bath", short: "Millon's", nutrient: 'PROTEIN', steps: [], heats: true },
  SUDAN: { label: 'Sudan III solution (a few drops), shake', short: 'Sudan III', nutrient: 'FAT', steps: [], heats: false },
  GREASE: { label: 'Grease-spot test: rub on filter paper', short: 'Grease spot', nutrient: 'FAT', steps: [{ id: 'DRY', label: 'Let the paper dry; hold it up to the light' }], heats: false },
  EMULSION: {
    label: 'Emulsion test: ethanol, then water',
    short: 'Emulsion',
    nutrient: 'FAT',
    steps: [
      { id: 'ETHANOL', label: 'Shake with 2 cm³ ethanol' },
      { id: 'WATER', label: 'Pour the ethanol into a tube of water' },
    ],
    heats: false,
  },
};
/** Tests that can be done on an amylase tube's mixture. */
export const AMY_SAMPLE_TESTS: FoodTestId[] = ['BENEDICT', 'IODINE'];

// ------------------------------------------------------------------ observation parts

/** One observable fact: its text, and keyword groups a written observation must contain (any word of each group; `not` words spoil a clause). Same shape as chem-qualitative's parts. */
export interface FoodPart {
  text: string;
  kw: string[][];
  not?: string[];
}
const P = (text: string, ...kw: string[][]): FoodPart => ({ text, kw });
const Pn = (text: string, not: string[], ...kw: string[][]): FoodPart => ({ text, kw, not });
const PPT = ['precipitate', 'ppt', 'suspension', 'solid', 'sediment', 'deposit'];
const STAY = ['remain', 'stay', 'still', 'no change', 'no colour change', 'no color change', 'unchanged', 'persist', 'no visible'];

export const FOOD_COL = {
  benedict: ['#2f6fd6', '#5d9a3c', '#d4b32c', '#d9731f', '#a33a22'] as const,
  iodine: '#c08a3a',
  blueBlack: '#1c1d44',
  biuretBlue: '#5e93d8',
  violet: '#7b3f9e',
  lilac: '#a77cc4',
  white: '#f2efe6',
  millonRed: '#b0442c',
  sudanRed: '#c62a2a',
  sudanPink: '#e7a3a0',
  milky: '#f1f0ea',
  water: '#e8f0f6',
  oil: '#e3c457',
};
export const BENEDICT_STAGE_NAME = ['blue', 'green', 'yellow', 'orange', 'brick-red'] as const;

const hexRgb = (h: string) => {
  const n = parseInt(h.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};
const rgbHex = (r: number, g: number, b: number) => `#${[r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('')}`;
/** Mixes two colours (f = 0: a, 1: b). */
export function mixColour(a: string, b: string, f: number): string {
  const x = hexRgb(a);
  const y = hexRgb(b);
  const k = Math.max(0, Math.min(1, f));
  return rgbHex(x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k);
}

// ------------------------------------------------------------------ Benedict's test

/** Reducing sugar (% w/v, as glucose) → the colour stage it reaches with full heating (0 blue … 4 brick-red, continuous). */
export function benedictFinal(c: number): number {
  const pts: [number, number][] = [
    [0, 0],
    [0.05, 0],
    [0.1, 1],
    [0.25, 2],
    [0.6, 3],
    [1.2, 4],
  ];
  if (c >= 1.2) return 4;
  for (let i = 1; i < pts.length; i++) {
    const [c1, x1] = pts[i]!;
    const [c0, x0] = pts[i - 1]!;
    if (c <= c1) return x0 + ((c - c0) / (c1 - c0)) * (x1 - x0);
  }
  return 4;
}
/** Seconds for the colour to develop (time constant) in a boiling water bath; heating directly over the flame is faster. */
export const BENEDICT_TAU = 50;
/** The colour index after `heat` seconds (0 blue … 4 brick-red). */
export function benedictIndex(c: number, heat: number, direct = false): number {
  if (heat <= 0) return 0;
  const tau = direct ? BENEDICT_TAU / 2 : BENEDICT_TAU;
  return benedictFinal(c) * (1 - Math.exp(-heat / tau));
}
/** The colour stage named (0 … 4) for an index. */
export const benedictStage = (x: number) => Math.max(0, Math.min(4, Math.floor(x + 0.25)));
/** The solution's colour for an index (blended between the stages). */
export function benedictColour(x: number): string {
  const k = Math.max(0, Math.min(4, x));
  const i = Math.min(3, Math.floor(k));
  return mixColour(FOOD_COL.benedict[i]!, FOOD_COL.benedict[i + 1]!, k - i);
}
/** Benedict's colours a student may see, by stage, for the observation. */
function benedictParts(stage: number, heated: boolean): FoodPart[] {
  if (stage <= 0) return [Pn(heated ? 'the solution remains blue (no precipitate)' : 'not heated: the solution stays blue', ['turns green', 'turned green', 'precipitate forms'], ['blue'], STAY.concat(['no precipitate', 'no ppt', 'no red']))];
  const name = BENEDICT_STAGE_NAME[stage]!;
  if (stage === 1) return [Pn('on heating, the blue solution turns green', ['remains blue', 'stays blue', 'no change'], ['green'])];
  const kw = stage === 4 ? ['brick', 'red'] : [name];
  return [
    Pn(`on heating, the blue solution turns green, then ${stage === 2 ? 'yellow' : stage === 3 ? 'yellow, then orange' : 'yellow, then orange, then brick-red'}`, ['remains blue', 'stays blue', 'no change'], kw),
    P(`a ${name} precipitate forms`, PPT),
  ];
}

// ------------------------------------------------------------------ the foods

export interface FoodContent {
  /** Starch (0: none; 1: about 1 %). */
  starch: number;
  /** Reducing sugar (% w/v, as glucose). */
  reducing: number;
  /** Non-reducing sugar (sucrose, %). */
  sucrose: number;
  protein: boolean;
  fat: boolean;
  /** How the sample looks in a test tube. */
  look: { hex: string; cloudy: boolean; oily: boolean };
}
export interface FoodDef {
  id: string;
  name: string;
  /** What the sample is called on the bench (the identity is hidden). */
  describe: string;
  content: (r: () => number) => FoodContent;
}
const look = (hex: string, cloudy = false, oily = false) => ({ hex, cloudy, oily });
export const FOODS: FoodDef[] = [
  { id: 'yam', name: 'yam slurry', describe: 'a cream-coloured cloudy suspension', content: () => ({ starch: 1, reducing: 0, sucrose: 0, protein: false, fat: false, look: look('#ece6d6', true) }) },
  { id: 'garri', name: 'garri suspension', describe: 'a cream-coloured cloudy suspension', content: () => ({ starch: 1, reducing: 0, sucrose: 0, protein: false, fat: false, look: look('#f0e8cf', true) }) },
  { id: 'glucose', name: 'glucose solution', describe: 'a clear, colourless solution', content: (r) => ({ starch: 0, reducing: labBetween(r, 0.08, 2.0, 2), sucrose: 0, protein: false, fat: false, look: look(FOOD_COL.water) }) },
  { id: 'sucrose', name: 'sucrose (table sugar) solution', describe: 'a clear, colourless solution', content: (r) => ({ starch: 0, reducing: 0, sucrose: labBetween(r, 1.5, 5, 1), protein: false, fat: false, look: look(FOOD_COL.water) }) },
  { id: 'egg', name: 'egg white (albumen) solution', describe: 'a slightly cloudy, colourless solution', content: () => ({ starch: 0, reducing: 0, sucrose: 0, protein: true, fat: false, look: look('#eeefe6', true) }) },
  { id: 'oil', name: 'groundnut oil', describe: 'a pale yellow oily liquid', content: () => ({ starch: 0, reducing: 0, sucrose: 0, protein: false, fat: true, look: look(FOOD_COL.oil, false, true) }) },
  { id: 'milk', name: 'milk', describe: 'a white, opaque liquid', content: (r) => ({ starch: 0, reducing: labBetween(r, 0.3, 0.7, 2), sucrose: 0, protein: true, fat: true, look: look('#f7f6f0', true) }) },
  { id: 'honey', name: 'honey solution', describe: 'a clear, pale golden solution', content: (r) => ({ starch: 0, reducing: labBetween(r, 1.3, 2.5, 2), sucrose: 0, protein: false, fat: false, look: look('#efd9a0') }) },
  { id: 'cane', name: 'sugar-cane juice', describe: 'a clear, very pale straw-coloured liquid', content: (r) => ({ starch: 0, reducing: labBetween(r, 0.07, 0.12, 2), sucrose: labBetween(r, 3, 6, 1), protein: false, fat: false, look: look('#ece6c4') }) },
  { id: 'beans', name: 'bean (cowpea) flour suspension', describe: 'a beige cloudy suspension', content: () => ({ starch: 1, reducing: 0, sucrose: 0, protein: true, fat: false, look: look('#e6d8bb', true) }) },
  { id: 'groundnut', name: 'groundnut paste suspension', describe: 'a light brown cloudy suspension', content: () => ({ starch: 0, reducing: 0, sucrose: 0, protein: true, fat: true, look: look('#d9c49a', true, true) }) },
  { id: 'starch-glucose', name: 'starch and glucose solution', describe: 'a slightly cloudy, colourless solution', content: (r) => ({ starch: 1, reducing: labBetween(r, 0.2, 1.0, 2), sucrose: 0, protein: false, fat: false, look: look('#ecebe2', true) }) },
];
export const FOOD_BY_ID: Record<string, FoodDef> = Object.fromEntries(FOODS.map((f) => [f.id, f]));

/** The food substances truly in a content (what a perfect test series shows). */
export function contentNutrients(c: FoodContent): Nutrient[] {
  const out: Nutrient[] = [];
  if (c.starch > 0) out.push('STARCH');
  if (benedictStage(benedictFinal(c.reducing)) > 0) out.push('REDUCING');
  if (c.sucrose > 0) out.push('NONREDUCING');
  if (c.protein) out.push('PROTEIN');
  if (c.fat) out.push('FAT');
  return out;
}

// ------------------------------------------------------------------ salivary amylase

export const AMY_BATHS = ['ICE', 'ROOM', 'BODY', 'WARM', 'BOILING'] as const;
export type AmyBath = (typeof AMY_BATHS)[number];
export const AMY_BATH_LABEL: Record<AmyBath, string> = { ICE: 'Ice-water bath (about 10 °C)', ROOM: 'Room temperature (about 28 °C)', BODY: 'Water bath at 37 °C', WARM: 'Water bath at 45 °C', BOILING: 'Boiling water bath' };
export const AMY_BATH_SHORT: Record<AmyBath, string> = { ICE: 'Ice ~10 °C', ROOM: 'Room ~28 °C', BODY: '37 °C', WARM: '45 °C', BOILING: 'Boiling' };
/** Room temperature in the lab (°C): an unequilibrated tube starts here. */
export const AMY_ROOM_T = 28;
export const AMY_MAX_TUBES = 6;
/** The stopwatch stops at this (s). */
export const AMY_MAX_CLOCK = 1200;

export const AMY_CLAIMS = ['DIGESTED', 'NOT_DIGESTED', 'SLOWED', 'DENATURED', 'OPTIMUM'] as const;
export type AmyClaim = (typeof AMY_CLAIMS)[number];
export const AMY_CLAIM_LABEL: Record<AmyClaim, string> = {
  DIGESTED: 'Starch digested by amylase',
  NOT_DIGESTED: 'Starch not digested',
  SLOWED: 'Enzyme less active (slow)',
  DENATURED: 'Enzyme denatured',
  OPTIMUM: 'Fastest: near the optimum',
};

/** Amylase activity relative to 37 °C (Q₁₀ ≈ 2 below the optimum; falling quickly above it; none from 60 °C). */
export function amyRelRate(T: number): number {
  if (T <= 37) return 2 ** ((T - 37) / 10);
  return Math.max(0, 1 - ((T - 37) / 23) ** 2);
}

/** Iodine spot stages: what a drop of the mixture does to the iodine on the tile, by the fraction of starch left. */
export const AMY_SPOT_NAME = ['blue-black', 'dark blue', 'purple', 'reddish-brown', 'yellow-brown'] as const;
export const AMY_SPOT_HEX = ['#1c1d44', '#2a3d8f', '#5b3a8c', '#8a4a2a', '#c08a3a'] as const;
export function amySpotStage(starchLeft: number): number {
  if (starchLeft > 0.65) return 0;
  if (starchLeft > 0.35) return 1;
  if (starchLeft > 0.15) return 2;
  if (starchLeft > 0.0501) return 3;
  return 4;
}

// ------------------------------------------------------------------ variant

export interface FoodBenchSample {
  letter: FoodLetter;
  food: FoodDef;
  content: FoodContent;
}
export interface AmyVariant {
  /** End-point time at exactly 37 °C for this saliva (s). */
  t37: number;
  /** The baths' real temperatures (°C). */
  temps: Record<AmyBath, number>;
  /** Per-tube scatter of the end-point time (by bath; the boiled-saliva control has none). */
  jitter: Record<AmyBath, number>;
}
export interface BioFoodVariant {
  seed: number;
  task: FoodTask;
  samples: FoodBenchSample[];
  amy: AmyVariant;
  /** WAEC would expect about this many rows (distinct tests) for full marks. */
  minRows: number;
}

const FOOD_COVER: Nutrient[] = ['STARCH', 'REDUCING', 'PROTEIN', 'FAT'];

function pickSamples(seed: number): FoodBenchSample[] {
  const r = labRandom(seed, 'bio-food-tests-food');
  for (let k = 0; k < 400; k++) {
    const ids: string[] = [];
    while (ids.length < 3) {
      const f = labPick(r, FOODS).id;
      if (!ids.includes(f)) ids.push(f);
    }
    const samples = ids.map((id, i) => ({ letter: FOOD_LETTERS[i]!, food: FOOD_BY_ID[id]!, content: FOOD_BY_ID[id]!.content(r) }));
    const all = new Set(samples.flatMap((s) => contentNutrients(s.content)));
    // Every class shows somewhere, at least one sample has no reducing sugar (so the non-reducing test is needed), and no two samples give the same results.
    const sigs = new Set(samples.map((s) => contentNutrients(s.content).join(',')));
    if (FOOD_COVER.every((n) => all.has(n)) && samples.some((s) => !contentNutrients(s.content).includes('REDUCING')) && sigs.size === 3) return samples;
  }
  // Fallback (never reached in practice): a fixed, valid bench.
  return (['beans', 'glucose', 'groundnut'] as const).map((id, i) => ({ letter: FOOD_LETTERS[i]!, food: FOOD_BY_ID[id]!, content: FOOD_BY_ID[id]!.content(() => 0.5) }));
}

function pickAmy(seed: number): AmyVariant {
  const r = labRandom(seed, 'bio-food-tests-amylase');
  const t37 = Math.round(labBetween(r, 60, 120, 0));
  const temps: Record<AmyBath, number> = { ICE: labBetween(r, 8, 12, 1), ROOM: labBetween(r, 26, 31, 1), BODY: labBetween(r, 36.5, 37.5, 1), WARM: labBetween(r, 44, 46, 1), BOILING: labBetween(r, 97, 99.5, 1) };
  const jitter = Object.fromEntries(AMY_BATHS.map((b) => [b, roundDp(labBetween(r, 0.97, 1.03, 3), 3)])) as Record<AmyBath, number>;
  return { t37, temps, jitter };
}

/** The hidden truth of one attempt (same on the web and the API). */
export function bioFoodVariant(seed: number, task: FoodTask): BioFoodVariant {
  const samples = pickSamples(seed);
  const amy = pickAmy(seed);
  const nr = samples.filter((s) => !contentNutrients(s.content).includes('REDUCING')).length;
  return { seed, task, samples, amy, minRows: task === 'FOOD' ? 12 + nr : 5 };
}

// ------------------------------------------------------------------ amylase digestion

const AMY_DT = 2;
/** The enzyme's rate (per s, as a fraction of the starch) over one step starting at x. */
function amyStep(Tb: number, tau: number, x: number, dt: number, equilibrated: boolean) {
  const mid = x + dt / 2;
  // An unequilibrated tube starts at room temperature and approaches its bath's.
  const T = equilibrated ? Tb : Tb + (AMY_ROOM_T - Tb) * Math.exp(-mid / 90);
  return (amyRelRate(T) * dt) / tau;
}
/** Starch left (fraction) in a tube at time t after mixing: integrates the enzyme's rate at the tube's temperature. */
export function amyStarchLeft(v: BioFoodVariant, tube: AmyTube, t: number, equilibrated: boolean): number {
  if (tube.boiled) return 1;
  const Tb = v.amy.temps[tube.bath];
  const tau = v.amy.t37 * v.amy.jitter[tube.bath];
  let acc = 0;
  for (let x = 0; x < t; x += AMY_DT) acc += amyStep(Tb, tau, x, Math.min(AMY_DT, t - x), equilibrated);
  return Math.max(0, 1 - 0.95 * acc);
}
/** The true end point (s) of a tube: when the iodine first stays yellow-brown (null: never within the stopwatch's range). */
export function amyTrueEnd(v: BioFoodVariant, tube: AmyTube, equilibrated: boolean): number | null {
  if (tube.boiled) return null;
  const Tb = v.amy.temps[tube.bath];
  const tau = v.amy.t37 * v.amy.jitter[tube.bath];
  let acc = 0;
  for (let t = AMY_DT; t <= AMY_MAX_CLOCK; t += AMY_DT) {
    acc += amyStep(Tb, tau, t - AMY_DT, AMY_DT, equilibrated);
    if (amySpotStage(Math.max(0, 1 - 0.95 * acc)) === 4) return amySpotStage(amyStarchLeft(v, tube, t - 1, equilibrated)) === 4 ? t - 1 : t;
  }
  return null;
}
/** The enzyme in this tube works at all at its bath temperature. */
export const amyActive = (v: BioFoodVariant, tube: AmyTube) => !tube.boiled && amyRelRate(v.amy.temps[tube.bath]) > 0;

// ------------------------------------------------------------------ the student's work

export interface FoodTest {
  sample: FoodSample;
  test: FoodTestId;
  /** Additions after the first reagent, in the order made. */
  steps: FoodStep[];
  /** Seconds heated (in the water bath, or directly when `direct`). */
  heat: number;
  /** Heated directly over the flame instead of in a water bath (unsafe: the tube can spurt). */
  direct: boolean;
  /** Amylase tubes: when the sample was taken from the mixture (s after mixing); 0 for P, Q, R. */
  at: number;
}
/** A row of the TEST | OBSERVATION | INFERENCE table (the TEST column is written from what was done). */
export interface FoodRecord {
  observation: string;
  present: Nutrient[];
  absent: Nutrient[];
  note: string;
}
export interface AmyTube {
  bath: AmyBath;
  /** Boiled saliva (the control). */
  boiled: boolean;
}
/** One amylase tube's row: what was seen, the end point, the rate and the inference. */
export interface AmyRecord {
  observation: string;
  claims: AmyClaim[];
  end: string;
  rate: string;
}
export interface BioFoodState {
  v: 1;
  task: FoodTask | null;
  tests: FoodTest[];
  /** Same order as `tests`. */
  table: FoodRecord[];
  /** FOOD: the food substances named in each sample. */
  conclusion: Record<FoodLetter, Nutrient[]>;
  /** AMYLASE: iodine drops put in the spotting tile's wells. */
  tile: boolean;
  tubes: AmyTube[];
  /** The starch and saliva tubes stood in their baths to reach the temperature before mixing. */
  equilibrated: boolean;
  /** Stopwatch since mixing (s); null before mixing. */
  clock: number | null;
  /** Drops spotted onto iodine: tube index and time (s after mixing). */
  spots: { tube: number; t: number }[];
  /** Same order as `tubes`. */
  amy: AmyRecord[];
  optimum: AmyBath | null;
  written: { precautions: string; explain: string };
  log: { t: number; a: string }[];
}

export const FOOD_MAX_TESTS = 30;
export const AMY_MAX_SPOTS = 300;
export const emptyFoodRecord = (): FoodRecord => ({ observation: '', present: [], absent: [], note: '' });
export const emptyAmyRecord = (): AmyRecord => ({ observation: '', claims: [], end: '', rate: '' });
export function emptyBioFoodState(): BioFoodState {
  return { v: 1, task: null, tests: [], table: [], conclusion: { P: [], Q: [], R: [] }, tile: false, tubes: [], equilibrated: false, clock: null, spots: [], amy: [], optimum: null, written: { precautions: '', explain: '' }, log: [] };
}

const nutrient = z.enum(NUTRIENTS);
export const bioFoodStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(FOOD_TASKS).nullable(),
  tests: z.array(z.object({ sample: z.enum(FOOD_SAMPLES), test: z.enum(FOOD_TESTS), steps: z.array(z.enum(FOOD_STEPS)).max(6), heat: z.number().min(0).max(900), direct: z.boolean(), at: z.number().min(0).max(AMY_MAX_CLOCK) })).max(FOOD_MAX_TESTS),
  table: z.array(z.object({ observation: z.string().max(600), present: z.array(nutrient).max(5), absent: z.array(nutrient).max(5), note: z.string().max(300) })).max(FOOD_MAX_TESTS),
  conclusion: z.object({ P: z.array(nutrient).max(5), Q: z.array(nutrient).max(5), R: z.array(nutrient).max(5) }),
  tile: z.boolean(),
  tubes: z.array(z.object({ bath: z.enum(AMY_BATHS), boiled: z.boolean() })).max(AMY_MAX_TUBES),
  equilibrated: z.boolean(),
  clock: z.number().min(0).max(AMY_MAX_CLOCK).nullable(),
  spots: z.array(z.object({ tube: z.number().int().min(0).max(AMY_MAX_TUBES - 1), t: z.number().min(0).max(AMY_MAX_CLOCK) })).max(AMY_MAX_SPOTS),
  amy: z.array(z.object({ observation: z.string().max(600), claims: z.array(z.enum(AMY_CLAIMS)).max(5), end: z.string().max(40), rate: z.string().max(40) })).max(AMY_MAX_TUBES),
  optimum: z.enum(AMY_BATHS).nullable(),
  written: z.object({ precautions: z.string().max(2000), explain: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<BioFoodState>;

export const BIO_FOOD_TESTS: SimulatorSpec = {
  id: 'bio-food-tests',
  subject: 'Biology',
  title: 'Food tests and salivary amylase',
  topicNames: ['Food tests', 'Food substances', 'Classes of food', 'Digestive enzymes', 'Enzymes', 'Digestion'],
  minutes: 45,
  rubric: [
    {
      id: 'procedure',
      label: 'Procedure',
      marks: 4,
      how: 'AUTO',
      guide:
        'Food tests: each sample tested for starch, reducing sugar, protein and fat (2); the non-reducing sugar test (boil with dilute HCl, neutralise with NaHCO₃, then Benedict’s) on each sample whose Benedict’s test was negative (1); every Benedict’s test heated in a boiling water bath — never directly over the flame — for at least 3 minutes (1). Amylase: iodine on the spotting tile and the tubes left in their baths to reach the temperature before mixing (1); the ice bath, 37 °C and at least one other temperature (1); a boiled-saliva control (1); drops tested at regular intervals of 30 s (at most 1 min) until the 37 °C end point, and a digested mixture tested with Benedict’s in a water bath (1).',
    },
    { id: 'observations', label: 'Observations', marks: 5, how: 'AUTO', guide: 'Each observation states what was actually seen, with the colour: blue-black (iodine); the Benedict’s colour reached on heating and a precipitate (green, yellow, orange or brick-red — “red colour” is not enough); violet (Biuret); a red-stained oily layer, a translucent spot or a milky emulsion (fats); effervescence on neutralising. Amylase: blue-black at first, then the iodine staying yellow-brown at the end point, or the blue-black colour persisting.' },
    { id: 'inferences', label: 'Inferences', marks: 4, how: 'AUTO', guide: 'Each inference follows from its own observation: the food substance the test is for, present or absent — never one a test cannot show, and nothing inferred from an unfinished test (Benedict’s not heated, the acid not neutralised). Amylase: starch digested; or not digested because the enzyme was denatured (boiling, boiled saliva) or slowed (cold — low temperature does not denature it).' },
    { id: 'results', label: 'Identification and results', marks: 3, how: 'AUTO', guide: 'Food tests: the food substances present in each sample (1 each). Amylase: each end-point time read from your own iodine spots (1); the rate 1000 ÷ t worked out (1); the optimum temperature — the one with the shortest end-point time (1).' },
    { id: 'precautions', label: 'Precautions', marks: 2, how: 'AI', guide: 'Two correct precautions (1 mark each). Food tests: clean test tubes for each test; heat Benedict’s in a water bath, not directly; only a little copper(II) sulphate in the Biuret test; neutralise the acid before Benedict’s; point tubes away from people; keep ethanol away from flames. Amylase: the solutions at the bath temperature before mixing; a clean dropper each time; the same volumes and concentrations in every tube; drops tested at regular intervals; each student uses only their own saliva.' },
    { id: 'explanation', label: 'Explanation', marks: 2, how: 'AI', guide: 'Food tests: acid boiling hydrolyses the non-reducing sugar (sucrose) into reducing sugars (glucose and fructose) (1); the acid is neutralised because Benedict’s solution works only in alkaline conditions (1). Amylase: the enzyme works fastest near its optimum (about 37 °C) and slowly in the cold, where molecules have little kinetic energy (1); boiling denatures it — the shape of its active site is destroyed — so starch is not digested (1).' },
  ],
};

// ------------------------------------------------------------------ outcomes

export interface FoodVisual {
  /** Liquid colour in the tube (the test's reagent mixed with the sample). */
  liquid: string;
  /** Precipitate at the bottom (colour), if any. */
  ppt: string | null;
  /** An oily layer on top (colour), if any. */
  layer: string | null;
  emulsion: boolean;
  /** Fizzing (neutralising the acid). */
  bubbles: boolean;
  /** The grease-spot test's filter paper. */
  paper: 'wet' | 'translucent' | 'dry' | null;
  /** Benedict's colour index (0 … 4), when the test uses Benedict's. */
  benedict: number | null;
}
export interface FoodOutcome {
  parts: FoodPart[];
  visual: FoodVisual;
  /** The test was done completely (an inference can be drawn). */
  complete: boolean;
  /** The test gave a positive result (meaningful only when complete). */
  positive: boolean;
}

/** What is in a sample (P, Q, R; or an amylase tube's mixture, digested to the time it was taken). */
export function foodSampleContent(v: BioFoodVariant, s: Pick<BioFoodState, 'tubes' | 'equilibrated'>, sample: FoodSample, at: number): FoodContent {
  const bench = v.samples.find((x) => x.letter === sample);
  if (bench) return bench.content;
  const tube = s.tubes[Number(sample) - 1];
  if (!tube) return { starch: 1, reducing: 0, sucrose: 0, protein: false, fat: false, look: look(FOOD_COL.water, true) };
  const left = amyStarchLeft(v, tube, at, s.equilibrated);
  // 1 % starch digests to about 1 % maltose (a reducing sugar). Saliva brings a trace of protein (too little to show).
  return { starch: left, reducing: roundDp(1.2 * (1 - left), 3), sucrose: 0, protein: false, fat: false, look: look('#eceae2', true) };
}

const stepIdx = (t: FoodTest, s: FoodStep) => t.steps.indexOf(s);
const before = (t: FoodTest, a: FoodStep, b: FoodStep) => stepIdx(t, a) >= 0 && stepIdx(t, b) >= 0 && stepIdx(t, a) < stepIdx(t, b);

/** The outcome of a test on a content (a pure function: the grader marks against it). */
export function foodObserveContent(t: FoodTest, c: FoodContent): FoodOutcome {
  const base = c.look.oily && !c.look.cloudy ? FOOD_COL.water : c.look.hex;
  const vis: FoodVisual = { liquid: base, ppt: null, layer: c.look.oily ? FOOD_COL.oil : null, emulsion: false, bubbles: false, paper: null, benedict: null };
  const parts: FoodPart[] = [];
  let complete = true;
  let positive = false;
  const has = (s: FoodStep) => t.steps.includes(s);
  switch (t.test) {
    case 'IODINE': {
      positive = c.starch > 0.35;
      if (positive) {
        parts.push(Pn('a blue-black colour forms', ['remain', 'stays', 'persist', 'no change', 'no blue'], ['blue black', 'blue', 'black']));
        vis.liquid = FOOD_COL.blueBlack;
      } else if (c.starch > 0.05) {
        parts.push(Pn('a faint purple-blue colour forms', ['no change'], ['purple', 'violet', 'blue']));
        vis.liquid = AMY_SPOT_HEX[2];
        positive = true;
      } else {
        parts.push(Pn('no blue-black colour: the iodine remains yellow-brown', ['turns blue', 'turned blue', 'becomes blue', 'became blue'], ['brown', 'yellow', 'orange', 'no blue', 'not blue', 'remain', 'no change']));
        vis.liquid = mixColour(base, FOOD_COL.iodine, 0.75);
      }
      break;
    }
    case 'BENEDICT':
    case 'NONREDUCING': {
      const nr = t.test === 'NONREDUCING';
      let conc = c.reducing;
      let works = true;
      if (nr) {
        if (has('NEUTRALISE')) {
          parts.push(P('effervescence (fizzing) as the sodium hydrogencarbonate is added', ['efferves', 'fizz', 'bubbl', 'gas']));
          vis.bubbles = !has('BENEDICT');
        }
        const hydrolysed = has('ACID') && (!has('BENEDICT') || before(t, 'ACID', 'BENEDICT'));
        if (hydrolysed) conc += c.sucrose * 1.05;
        // Benedict's added to the acid (not neutralised first): the alkaline reagent is destroyed and nothing happens.
        if (has('ACID') && has('BENEDICT') && !before(t, 'NEUTRALISE', 'BENEDICT')) works = false;
        complete = has('ACID') && has('NEUTRALISE') && has('BENEDICT') && before(t, 'ACID', 'NEUTRALISE') && before(t, 'NEUTRALISE', 'BENEDICT');
        if (!has('BENEDICT')) {
          if (!has('NEUTRALISE')) parts.push(P(has('ACID') ? 'no visible change on boiling with the acid' : 'the sample is in the tube', ['no change', 'no visible', 'nothing', 'clear', 'colourless', 'remain']));
          vis.liquid = base;
          complete = false;
          break;
        }
      }
      const x = works ? benedictIndex(conc, t.heat, t.direct) : 0;
      const stage = benedictStage(x);
      vis.benedict = x;
      vis.liquid = benedictColour(x);
      vis.ppt = stage >= 2 ? mixColour(benedictColour(x), '#3a1a10', 0.12) : null;
      parts.push(...benedictParts(stage, t.heat > 0));
      positive = stage > 0;
      // A negative result needs a full minute in the bath; a positive one shows already.
      if (t.heat <= 0 || (!positive && t.heat < 60)) complete = false;
      if (vis.layer) vis.layer = FOOD_COL.oil;
      break;
    }
    case 'BIURET': {
      complete = has('NAOH') && has('CUSO4');
      if (!has('CUSO4')) {
        parts.push(P('no colour change with sodium hydroxide alone', ['no change', 'no colour', 'colourless', 'nothing', 'remain', 'no visible']));
        vis.liquid = base;
        break;
      }
      if (!has('NAOH')) {
        parts.push(P('a pale blue colour (no violet)', ['blue']));
        vis.liquid = FOOD_COL.biuretBlue;
        break;
      }
      positive = c.protein;
      if (positive) {
        parts.push(Pn('a violet (purple) colour forms', ['remain', 'stays blue', 'no violet', 'no purple', 'no change'], ['violet', 'purple', 'lilac', 'mauve']));
        vis.liquid = FOOD_COL.violet;
      } else {
        parts.push(Pn('the solution remains blue (no violet colour)', ['turns violet', 'turned violet', 'turns purple', 'turned purple'], ['blue', 'no violet', 'no purple', 'no change', 'remain']));
        vis.liquid = FOOD_COL.biuretBlue;
      }
      break;
    }
    case 'MILLON': {
      positive = c.protein;
      if (!positive) {
        parts.push(P('no precipitate; no red colour, even on warming', ['no precipitate', 'no ppt', 'no red', 'no change', 'no white', 'nothing', 'remain', 'no colour']));
        complete = t.heat > 0;
        break;
      }
      parts.push(P('a white precipitate forms', ['white'], PPT));
      vis.ppt = FOOD_COL.white;
      if (t.heat >= 30) {
        parts.push(Pn('on warming, the precipitate turns brick-red', ['no red', 'not red', 'remains white', 'stays white'], ['red', 'brick', 'pink']));
        vis.ppt = mixColour(FOOD_COL.white, FOOD_COL.millonRed, Math.min(1, t.heat / 60));
      } else complete = false;
      break;
    }
    case 'SUDAN': {
      positive = c.fat;
      if (positive) {
        parts.push(Pn('a red-stained oily layer forms on top', ['no red', 'no layer', 'no oil'], ['red'], ['layer', 'oil', 'droplet', 'globule', 'top', 'surface', 'separat', 'float']));
        vis.layer = FOOD_COL.sudanRed;
        vis.liquid = c.look.oily && !c.look.cloudy ? FOOD_COL.water : mixColour(base, FOOD_COL.sudanPink, 0.35);
      } else {
        parts.push(Pn('no red-stained oily layer: the red dye mixes evenly through the liquid', ['red layer forms', 'red oily layer forms'], ['no red', 'no oil', 'no layer', 'evenly', 'mix', 'no separate', 'no droplet', 'no globule', 'no change', 'not separate']));
        vis.liquid = mixColour(base, FOOD_COL.sudanPink, 0.8);
        vis.layer = null;
      }
      break;
    }
    case 'GREASE': {
      positive = c.fat;
      if (!has('DRY')) {
        parts.push(P('a wet mark on the filter paper', ['wet', 'mark', 'spot', 'stain', 'damp']));
        vis.paper = 'wet';
        complete = false;
        break;
      }
      if (positive) {
        parts.push(Pn('a translucent spot remains on the paper after drying', ['disappear', 'dries off', 'no translucent', 'not translucent', 'opaque'], ['translucent', 'greasy', 'grease spot', 'light passes', 'transparent', 'oily spot', 'see through', 'shiny']));
        vis.paper = 'translucent';
      } else {
        parts.push(P('the wet mark dries off: no translucent spot', ['no translucent', 'not translucent', 'disappear', 'dries', 'dried', 'no spot', 'no grease', 'opaque', 'no change', 'evaporat']));
        vis.paper = 'dry';
      }
      break;
    }
    case 'EMULSION': {
      positive = c.fat;
      complete = has('ETHANOL') && has('WATER') && before(t, 'ETHANOL', 'WATER');
      if (!has('WATER')) {
        parts.push(P('the sample mixes with the ethanol', ['mix', 'dissolv', 'clear', 'no change', 'shake', 'colourless']));
        vis.liquid = mixColour(base, FOOD_COL.water, 0.5);
        break;
      }
      if (positive && complete) {
        parts.push(Pn('a milky-white emulsion forms', ['clear', 'no milky', 'not milky', 'no emulsion'], ['milky', 'cloudy', 'emulsion', 'white', 'turbid']));
        vis.liquid = FOOD_COL.milky;
        vis.emulsion = true;
        vis.layer = null;
      } else {
        parts.push(P('the mixture stays clear (no milky emulsion)', ['clear', 'no emulsion', 'no milky', 'not milky', 'no change', 'colourless', 'remain', 'transparent']));
        vis.liquid = c.look.cloudy ? mixColour(base, FOOD_COL.water, 0.6) : FOOD_COL.water;
        vis.layer = null;
      }
      break;
    }
  }
  return { parts, visual: vis, complete, positive };
}

export function foodObserve(v: BioFoodVariant, s: Pick<BioFoodState, 'tubes' | 'equilibrated'>, t: FoodTest): FoodOutcome {
  return foodObserveContent(t, foodSampleContent(v, s, t.sample, t.at));
}

// ------------------------------------------------------------------ inference key

export interface FoodInferenceKey {
  /** The food substance the test is about. */
  nutrient: Nutrient;
  complete: boolean;
  /** What a full inference states. */
  need: { present: Nutrient[]; absent: Nutrient[] };
  /** What may be stated without losing the row. */
  allowPresent: Nutrient[];
  allowAbsent: Nutrient[];
}

/** What a test's result allows the student to infer (from its own outcome, and for the non-reducing test the sample's direct Benedict's result). */
export function foodInferenceKey(v: BioFoodVariant, s: Pick<BioFoodState, 'tubes' | 'equilibrated'>, t: FoodTest): FoodInferenceKey {
  const o = foodObserve(v, s, t);
  const nutrient = FOOD_TEST_INFO[t.test].nutrient;
  const none = { nutrient, complete: false, need: { present: [], absent: [] }, allowPresent: [], allowAbsent: [] };
  if (!o.complete) return none;
  if (t.test === 'NONREDUCING') {
    const c = foodSampleContent(v, s, t.sample, t.at);
    const direct = benedictStage(benedictFinal(c.reducing));
    const after = benedictStage(benedictIndex(c.reducing + c.sucrose * 1.05, t.heat, t.direct));
    if (direct === 0) return o.positive ? { nutrient, complete: true, need: { present: ['NONREDUCING'], absent: [] }, allowPresent: ['NONREDUCING'], allowAbsent: ['REDUCING'] } : { nutrient, complete: true, need: { present: [], absent: ['NONREDUCING'] }, allowPresent: [], allowAbsent: ['NONREDUCING', 'REDUCING'] };
    // A reducing sugar is there anyway: only a deeper colour than the direct test shows a non-reducing sugar too.
    if (after > direct) return { nutrient, complete: true, need: { present: ['NONREDUCING'], absent: [] }, allowPresent: ['NONREDUCING', 'REDUCING'], allowAbsent: [] };
    if (direct >= 4) return { nutrient, complete: true, need: { present: [], absent: [] }, allowPresent: ['REDUCING'], allowAbsent: [] };
    return { nutrient, complete: true, need: { present: [], absent: ['NONREDUCING'] }, allowPresent: ['REDUCING'], allowAbsent: ['NONREDUCING'] };
  }
  return o.positive ? { nutrient, complete: true, need: { present: [nutrient], absent: [] }, allowPresent: [nutrient], allowAbsent: [] } : { nutrient, complete: true, need: { present: [], absent: [nutrient] }, allowPresent: [], allowAbsent: [nutrient] };
}

// ------------------------------------------------------------------ amylase records

/** The spots a tube's drops made, in time order (stage per spot). */
export function amySpots(v: BioFoodVariant, s: Pick<BioFoodState, 'tubes' | 'equilibrated' | 'spots'>, i: number): { t: number; stage: number }[] {
  const tube = s.tubes[i];
  if (!tube) return [];
  return s.spots
    .filter((x) => x.tube === i)
    .map((x) => x.t)
    .sort((a, b) => a - b)
    .map((t) => ({ t, stage: amySpotStage(amyStarchLeft(v, tube, t, s.equilibrated)) }));
}
/** The end point the student's own spots show (s), or null if none of them stayed yellow-brown. */
export function amyObservedEnd(v: BioFoodVariant, s: Pick<BioFoodState, 'tubes' | 'equilibrated' | 'spots'>, i: number): number | null {
  return amySpots(v, s, i).find((x) => x.stage === 4)?.t ?? null;
}

/** What a tube's spots showed, as observation parts. */
export function amyTubeParts(v: BioFoodVariant, s: Pick<BioFoodState, 'tubes' | 'equilibrated' | 'spots'>, i: number): FoodPart[] {
  const sp = amySpots(v, s, i);
  if (!sp.length) return [];
  const end = sp.find((x) => x.stage === 4);
  const first = sp[0]!;
  const out: FoodPart[] = [];
  const last = sp[sp.length - 1]!;
  if (first.stage === 0 && (end || last.stage > 0)) out.push(P('at first the iodine turns blue-black', ['blue']));
  if (end) {
    out.push(Pn(`by ${end.t} s the iodine stays yellow-brown (no blue-black colour): the end point`, ['still blue', 'remains blue', 'stays blue', 'persist'], ['brown', 'yellow', 'no blue', 'no longer', 'not blue', 'orange', 'end point', 'endpoint', 'did not turn', 'does not turn']));
    return out;
  }
  if (last.stage === 0) out.push(P(`the iodine turns blue-black every time, up to ${last.t} s (the blue-black colour persists)`, ['blue'], ['remain', 'persist', 'stay', 'throughout', 'every', 'still', 'always', 'all', 'no change', 'unchanged', 'continu', 'no end']));
  else out.push(P(`the blue-black colour slowly fades to ${AMY_SPOT_NAME[last.stage]} by ${last.t} s, but has not gone`, [last.stage === 1 ? 'blue' : last.stage === 2 ? 'purple' : 'brown'], ['fade', 'lighter', 'slow', 'gradual', 'less', 'pale', 'chang', 'turn', 'not gone', 'still', 'no end']));
  return out;
}

export interface AmyInferenceKey {
  need: AmyClaim[];
  /** Any one of these is a half answer (need not met). */
  half: AmyClaim[];
  allow: AmyClaim[];
}
/** What a tube's result allows the student to infer. */
export function amyInferenceKey(v: BioFoodVariant, s: Pick<BioFoodState, 'tubes' | 'equilibrated' | 'spots'>, i: number): AmyInferenceKey {
  const tube = s.tubes[i]!;
  const end = amyObservedEnd(v, s, i);
  if (end !== null) {
    const ends = s.tubes.map((_, k) => amyObservedEnd(v, s, k));
    const fastest = Math.min(...ends.filter((x): x is number => x !== null));
    return { need: ['DIGESTED'], half: [], allow: end === fastest ? ['DIGESTED', 'OPTIMUM', 'SLOWED'] : ['DIGESTED', 'SLOWED'] };
  }
  if (!amyActive(v, tube)) return { need: ['DENATURED'], half: ['NOT_DIGESTED'], allow: ['DENATURED', 'NOT_DIGESTED'] };
  // Still working (cold, or the drops stopped too soon): slowed, never denatured.
  return { need: ['SLOWED'], half: ['NOT_DIGESTED'], allow: ['SLOWED', 'NOT_DIGESTED'] };
}

// ------------------------------------------------------------------ texts

const mins = (sec: number) => {
  const m = Math.floor(sec / 60);
  const r = Math.round(sec % 60);
  return m && r ? `${m} min ${r} s` : m ? `${m} min` : `${r} s`;
};
/** How a sample is named in the TEST column. */
export function foodSampleName(s: Pick<BioFoodState, 'tubes'>, sample: FoodSample): string {
  if ((FOOD_LETTERS as readonly string[]).includes(sample)) return sample;
  const tube = s.tubes[Number(sample) - 1];
  return tube ? `Mixture from tube ${sample} (${tube.boiled ? 'boiled saliva, ' : ''}${AMY_BATH_SHORT[tube.bath]})` : `Tube ${sample}`;
}
/** The TEST column for a test (what was done). */
export function foodTestText(s: Pick<BioFoodState, 'tubes'>, t: FoodTest): string {
  const n = foodSampleName(s, t.sample);
  const has = (x: FoodStep) => t.steps.includes(x);
  const heated = t.heat > 0 ? (t.direct ? `heated directly over the flame for ${mins(t.heat)}` : `heated in a boiling water bath for ${mins(t.heat)}`) : 'not heated';
  const at = (FOOD_LETTERS as readonly string[]).includes(t.sample) ? '' : ` taken at ${t.at} s`;
  switch (t.test) {
    case 'IODINE':
      return `${n}${at} + 2–3 drops of iodine solution`;
    case 'BENEDICT':
      return `2 cm³ of ${n}${at} + equal volume of Benedict's solution; ${heated}`;
    case 'NONREDUCING': {
      const bits = [has('ACID') ? 'boiled with dilute HCl' : 'not boiled with acid', has('NEUTRALISE') ? 'cooled and neutralised with NaHCO₃' : 'not neutralised', has('BENEDICT') ? `Benedict's solution added${before(t, 'NEUTRALISE', 'BENEDICT') ? '' : ' before neutralising'}; ${heated}` : "no Benedict's yet"];
      return `${n}: ${bits.join(', ')}`;
    }
    case 'BIURET':
      return `${n} + ${has('NAOH') ? '1 cm³ NaOH(aq)' : ''}${has('NAOH') && has('CUSO4') ? ', then ' : ''}${has('CUSO4') ? '2 drops of 1% CuSO₄, shaken' : ''}${!has('NAOH') && !has('CUSO4') ? 'nothing yet' : ''}`;
    case 'MILLON':
      return `${n} + Millon's reagent; ${t.heat > 0 ? `warmed in the water bath for ${mins(t.heat)}` : 'not warmed'}`;
    case 'SUDAN':
      return `${n} + a few drops of Sudan III solution, shaken`;
    case 'GREASE':
      return `${n} rubbed on filter paper${has('DRY') ? ', left to dry and held up to the light' : ''}`;
    case 'EMULSION':
      return `${n} shaken with ethanol${has('WATER') ? ', then poured into water' : ''}`;
  }
}

// ------------------------------------------------------------------ model answers

/** The tests a model WAEC candidate does on the food samples (the worked solution, the demo, the tests). */
export function foodModelTests(v: BioFoodVariant): FoodTest[] {
  const out: FoodTest[] = [];
  const t = (sample: FoodSample, test: FoodTestId, steps: FoodStep[] = [], heat = 0): FoodTest => ({ sample, test, steps, heat, direct: false, at: 0 });
  for (const sm of v.samples) {
    out.push(t(sm.letter, 'IODINE'));
    out.push(t(sm.letter, 'BENEDICT', [], 300));
    if (benedictStage(benedictFinal(sm.content.reducing)) === 0) out.push(t(sm.letter, 'NONREDUCING', ['ACID', 'NEUTRALISE', 'BENEDICT'], 300));
    out.push(t(sm.letter, 'BIURET', ['NAOH', 'CUSO4']));
    out.push(t(sm.letter, 'SUDAN'));
  }
  return out;
}
/** The record a model candidate writes for a test. */
export function foodIdealRecord(v: BioFoodVariant, s: Pick<BioFoodState, 'tubes' | 'equilibrated'>, t: FoodTest): FoodRecord {
  const k = foodInferenceKey(v, s, t);
  const o = foodObserve(v, s, t);
  return { observation: o.parts.map((p) => p.text).join('; '), present: [...k.need.present], absent: [...k.need.absent], note: '' };
}

/** A model amylase run: iodine tile, five tubes (ice, room, 37 °C, boiling, boiled saliva at 37 °C), equilibrated, drops every 30 s until every working tube has reached its end point, then Benedict's on the 37 °C mixture. */
export function amyModelState(v: BioFoodVariant): BioFoodState {
  const s = emptyBioFoodState();
  s.task = 'AMYLASE';
  s.tile = true;
  s.tubes = [
    { bath: 'ICE', boiled: false },
    { bath: 'ROOM', boiled: false },
    { bath: 'BODY', boiled: false },
    { bath: 'BOILING', boiled: false },
    { bath: 'BODY', boiled: true },
  ];
  s.equilibrated = true;
  s.clock = 0;
  const active = s.tubes.map((tb, i) => ({ i, end: amyTrueEnd(v, tb, true) })).filter((x) => x.end !== null);
  const stopAt = Math.min(AMY_MAX_CLOCK, Math.ceil((Math.max(...active.map((x) => x.end!)) + 1) / 30) * 30 + 30);
  for (let t = 0; t <= stopAt; t += 30) for (let i = 0; i < s.tubes.length; i++) if (s.spots.length < AMY_MAX_SPOTS) s.spots.push({ tube: i, t });
  s.clock = stopAt;
  s.amy = s.tubes.map((_, i) => {
    const end = amyObservedEnd(v, s, i);
    const key = amyInferenceKey(v, s, i);
    return { observation: amyTubeParts(v, s, i).map((p) => p.text).join('; '), claims: [...key.need, ...(key.allow.includes('OPTIMUM') ? (['OPTIMUM'] as AmyClaim[]) : [])], end: end === null ? 'no end point' : String(end), rate: end === null ? '0' : String(roundDp(1000 / end, 1)) };
  });
  s.optimum = amyOptimum(v, s);
  s.tests = [
    { sample: '3', test: 'BENEDICT', steps: [], heat: 300, direct: false, at: stopAt },
    { sample: '5', test: 'BENEDICT', steps: [], heat: 300, direct: false, at: stopAt },
  ];
  s.table = s.tests.map((t) => foodIdealRecord(v, s, t));
  return s;
}

/** The optimum among the tubes set up: the working bath with the shortest true end-point time (null: none). */
export function amyOptimum(v: BioFoodVariant, s: Pick<BioFoodState, 'tubes' | 'equilibrated'>): AmyBath | null {
  let best: { bath: AmyBath; end: number } | null = null;
  for (const tb of s.tubes) {
    if (tb.boiled) continue;
    const end = amyTrueEnd(v, tb, s.equilibrated);
    if (end !== null && (!best || end < best.end)) best = { bath: tb.bath, end };
  }
  return best?.bath ?? null;
}
