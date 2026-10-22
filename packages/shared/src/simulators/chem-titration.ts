import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { roundDp, labBetween, labPick, labRandom } from './seeded';

/**
 * chem-titration: WAEC acid–base volumetric analysis. The acid (A) is in the
 * burette, 25.0 cm³ of the base (B) is pipetted into a conical flask. The
 * student rinses the apparatus, picks an indicator, does a rough titration and
 * accurate ones, records the burette readings, works out the mean of the
 * concordant titres and the WAEC calculations, and states the end-point colour
 * change and precautions. Every attempt's seed gives a different pair,
 * concentrations and titre.
 */

export const TITRATION_INDICATORS = ['METHYL_ORANGE', 'PHENOLPHTHALEIN', 'LITMUS'] as const;
export type TitrationIndicator = (typeof TITRATION_INDICATORS)[number];
/** Colours: in the base (start), at the end point, and with excess acid. */
export const TITRATION_INDICATOR_INFO: Record<TitrationIndicator, { label: string; base: string; end: string; acid: string; baseName: string; endName: string }> = {
  METHYL_ORANGE: { label: 'Methyl orange', base: '#f2c400', end: '#f08a24', acid: '#e0453a', baseName: 'yellow', endName: 'orange (pink/red with excess acid)' },
  PHENOLPHTHALEIN: { label: 'Phenolphthalein', base: '#e04ba3', end: '#f5eef4', acid: '#eef3f8', baseName: 'pink', endName: 'colourless' },
  LITMUS: { label: 'Litmus', base: '#4a63c9', end: '#8a4fb0', acid: '#c8434d', baseName: 'blue', endName: 'purple, then red' },
};

/** What a piece of glassware was last rinsed with. */
export const TITRATION_RINSES = ['ACID', 'BASE', 'WATER', 'NONE'] as const;
export type TitrationRinse = (typeof TITRATION_RINSES)[number];

interface Chemical {
  name: string;
  formula: string;
  molarMass: number;
}
const ACIDS = {
  HCL: { name: 'hydrochloric acid', formula: 'HCl', molarMass: 36.5 },
  H2SO4: { name: 'tetraoxosulphate(VI) acid', formula: 'H₂SO₄', molarMass: 98 },
  HNO3: { name: 'trioxonitrate(V) acid', formula: 'HNO₃', molarMass: 63 },
  CH3COOH: { name: 'ethanoic acid', formula: 'CH₃COOH', molarMass: 60 },
} satisfies Record<string, Chemical>;
const BASES = {
  NAOH: { name: 'sodium hydroxide', formula: 'NaOH', molarMass: 40 },
  KOH: { name: 'potassium hydroxide', formula: 'KOH', molarMass: 56 },
  NA2CO3: { name: 'sodium trioxocarbonate(IV)', formula: 'Na₂CO₃', molarMass: 106 },
} satisfies Record<string, Chemical>;

interface Pair {
  acid: keyof typeof ACIDS;
  base: keyof typeof BASES;
  /** Mole ratio in the equation: a acid : b base. */
  a: number;
  b: number;
  equation: string;
  indicators: TitrationIndicator[];
}
const BOTH: TitrationIndicator[] = ['METHYL_ORANGE', 'PHENOLPHTHALEIN'];
export const TITRATION_PAIRS: Pair[] = [
  { acid: 'HCL', base: 'NAOH', a: 1, b: 1, equation: 'HCl + NaOH → NaCl + H₂O', indicators: BOTH },
  { acid: 'HCL', base: 'KOH', a: 1, b: 1, equation: 'HCl + KOH → KCl + H₂O', indicators: BOTH },
  { acid: 'HCL', base: 'NA2CO3', a: 2, b: 1, equation: '2HCl + Na₂CO₃ → 2NaCl + H₂O + CO₂', indicators: ['METHYL_ORANGE'] },
  { acid: 'H2SO4', base: 'NAOH', a: 1, b: 2, equation: 'H₂SO₄ + 2NaOH → Na₂SO₄ + 2H₂O', indicators: BOTH },
  { acid: 'H2SO4', base: 'NA2CO3', a: 1, b: 1, equation: 'H₂SO₄ + Na₂CO₃ → Na₂SO₄ + H₂O + CO₂', indicators: ['METHYL_ORANGE'] },
  { acid: 'HNO3', base: 'KOH', a: 1, b: 1, equation: 'HNO₃ + KOH → KNO₃ + H₂O', indicators: BOTH },
  { acid: 'CH3COOH', base: 'NAOH', a: 1, b: 1, equation: 'CH₃COOH + NaOH → CH₃COONa + H₂O', indicators: ['PHENOLPHTHALEIN'] },
];

export const TITRATION_PIPETTE = 25.0;
export const BURETTE_CAPACITY = 50.0;
/** Concordant titres agree within this (cm³). */
export const CONCORDANT = 0.1;

export type TitrationTaskId = 'meanTitre' | 'concA' | 'concB' | 'final';
export type TitrationUnit = 'cm3' | 'mol/dm3' | 'g/dm3' | '%';
export interface TitrationTask {
  id: TitrationTaskId;
  label: string;
  unit: TitrationUnit;
}

export interface ChemTitrationVariant {
  seed: number;
  acid: Chemical;
  base: Chemical;
  a: number;
  b: number;
  equation: string;
  /** Suitable indicators for this pair. */
  indicators: TitrationIndicator[];
  /** Given on the paper: A contains this many g of acid per dm³. */
  acidMassConc: number;
  /** mol dm⁻³ (exact, from the mass concentration). */
  acidConc: number;
  pipette: number;
  /** The true titre (cm³) for a correct indicator. */
  trueTitre: number;
  /** mol dm⁻³ (exact). */
  baseConc: number;
  /** g dm⁻³ of the pure base (exact). */
  baseMassConc: number;
  /** The last calculation asked for: B in g dm⁻³, or the percentage purity of an impure sample. */
  finalTask: 'MASS_CONC' | 'PURITY';
  /** PURITY: B was made with this many g of the impure base per dm³. */
  impureMassConc: number | null;
  /** PURITY: the true percentage purity. */
  purity: number | null;
  /** The paper's statements about A and B. */
  given: { A: string; B: string };
  tasks: TitrationTask[];
}

/** The hidden truth of one attempt (same on the web and the API). */
export function chemTitrationVariant(seed: number): ChemTitrationVariant {
  const r = labRandom(seed, 'chem-titration');
  const pair = labPick(r, TITRATION_PAIRS);
  const acid = ACIDS[pair.acid];
  const base = BASES[pair.base];
  // A's concentration is given in g dm⁻³, to 2 d.p. (around 0.05–0.15 mol dm⁻³).
  const acidMassConc = roundDp(labBetween(r, 0.05, 0.15, 3) * acid.molarMass, 2);
  const acidConc = acidMassConc / acid.molarMass;
  const trueTitre = labBetween(r, 19.5, 27.5, 2);
  const baseConc = (acidConc * trueTitre * pair.b) / (pair.a * TITRATION_PIPETTE);
  const baseMassConc = baseConc * base.molarMass;
  const purityTask = pair.base !== 'KOH' && r() < 0.4;
  const purity = purityTask ? labBetween(r, 78, 96, 1) : null;
  const impureMassConc = purity ? roundDp((baseMassConc * 100) / purity, 2) : null;
  const truePurity = impureMassConc ? (baseMassConc / impureMassConc) * 100 : null;
  const tasks: TitrationTask[] = [
    { id: 'meanTitre', label: 'Average (mean) volume of A used, from your concordant titres', unit: 'cm3' },
    { id: 'concA', label: `Concentration of A in mol dm⁻³`, unit: 'mol/dm3' },
    { id: 'concB', label: `Concentration of B in mol dm⁻³`, unit: 'mol/dm3' },
    purityTask ? { id: 'final', label: `Percentage purity of the ${base.formula} used to make B`, unit: '%' } : { id: 'final', label: `Concentration of B in g dm⁻³`, unit: 'g/dm3' },
  ];
  return {
    seed,
    acid,
    base,
    a: pair.a,
    b: pair.b,
    equation: pair.equation,
    indicators: pair.indicators,
    acidMassConc,
    acidConc,
    pipette: TITRATION_PIPETTE,
    trueTitre,
    baseConc,
    baseMassConc,
    finalTask: purityTask ? 'PURITY' : 'MASS_CONC',
    impureMassConc,
    purity: truePurity,
    given: {
      A: `A is a solution of ${acid.name} (${acid.formula}) containing ${acidMassConc.toFixed(2)} g dm⁻³.`,
      B: purityTask
        ? `B is a solution made by dissolving ${impureMassConc!.toFixed(2)} g of impure ${base.name} (${base.formula}) in distilled water to make 1.00 dm³ of solution.`
        : `B is a solution of ${base.name} (${base.formula}) of unknown concentration.`,
    },
    tasks,
  };
}

/** True answers for the calculation tasks. */
export function chemTitrationAnswers(v: ChemTitrationVariant): Record<TitrationTaskId, number> {
  return { meanTitre: v.trueTitre, concA: v.acidConc, concB: v.baseConc, final: v.finalTask === 'PURITY' ? v.purity! : v.baseMassConc };
}

/**
 * The burette volume at which run `index` (0-based, in order of pipetting)
 * reaches its end point with `indicator`: the true titre plus a small seeded
 * scatter (±0.04 cm³). An unsuitable indicator changes colour at the wrong
 * point (phenolphthalein with a carbonate: about half way; methyl orange with
 * a weak acid: early and gradually).
 */
export function titrationEndpoint(v: ChemTitrationVariant, index: number, indicator: TitrationIndicator | null): number {
  const noise = labBetween(labRandom(v.seed, `run-${index}`), -0.04, 0.04, 2);
  const carbonate = v.base.formula === BASES.NA2CO3.formula;
  const weakAcid = v.acid.formula === ACIDS.CH3COOH.formula;
  const factor = indicator === 'PHENOLPHTHALEIN' && carbonate ? 0.5 : indicator === 'METHYL_ORANGE' && weakAcid ? 0.82 : 1;
  return roundDp(v.trueTitre * factor + noise, 2);
}

/** Where the acid level stands after the burette's `fill`-th filling (0-based): near, not exactly at, the zero mark. */
export function titrationFillLevel(seed: number, fill: number): number {
  return labBetween(labRandom(seed, `fill-${fill}`), 0, 1.6, 2);
}

// ------------------------------------------------------------------ the student's work

export interface TitrationRun {
  kind: 'ROUGH' | 'ACCURATE';
  indicator: TitrationIndicator | null;
  /** True burette level (cm³) when the first acid went in; null until then. */
  initial: number | null;
  /** True burette level when the run was finished; null while it is open. */
  final: number | null;
  /** Swirls of the flask while adding acid. */
  swirls: number;
  /** The filter funnel was out of the burette when titrating began. */
  funnelRemoved: boolean;
  done: boolean;
}
/** A row of the results table as the student wrote it. */
export interface TitrationRecord {
  initial: string;
  final: string;
  titre: string;
}
export interface TitrationAnswer {
  value: string;
  unit: string;
}
export interface ChemTitrationState {
  v: 1;
  setup: { burette: TitrationRinse | null; pipette: TitrationRinse | null; flask: TitrationRinse | null; indicator: TitrationIndicator | null };
  /** True acid level in the burette now (null: not filled yet). */
  burette: number | null;
  /** Times the burette has been filled (drives the seeded fill level). */
  fills: number;
  funnelIn: boolean;
  runs: TitrationRun[];
  /** Same order as `runs`. */
  table: TitrationRecord[];
  answers: Record<TitrationTaskId, TitrationAnswer>;
  written: { endpoint: string; precautions: string };
  /** What the student did, in order (ms since the lab opened). */
  log: { t: number; a: string }[];
}

export function emptyChemTitrationState(): ChemTitrationState {
  const blank = { value: '', unit: '' };
  return {
    v: 1,
    setup: { burette: null, pipette: null, flask: null, indicator: null },
    burette: null,
    fills: 0,
    funnelIn: false,
    runs: [],
    table: [],
    answers: { meanTitre: { ...blank }, concA: { ...blank }, concB: { ...blank }, final: { ...blank } },
    written: { endpoint: '', precautions: '' },
    log: [],
  };
}

const vol = z.number().min(-1).max(60);
const short = z.string().max(40);
const answer = z.object({ value: short, unit: short });
export const chemTitrationStateSchema = z.object({
  v: z.literal(1),
  setup: z.object({ burette: z.enum(TITRATION_RINSES).nullable(), pipette: z.enum(TITRATION_RINSES).nullable(), flask: z.enum(TITRATION_RINSES).nullable(), indicator: z.enum(TITRATION_INDICATORS).nullable() }),
  burette: vol.nullable(),
  fills: z.number().int().min(0).max(100),
  funnelIn: z.boolean(),
  runs: z
    .array(z.object({ kind: z.enum(['ROUGH', 'ACCURATE']), indicator: z.enum(TITRATION_INDICATORS).nullable(), initial: vol.nullable(), final: vol.nullable(), swirls: z.number().int().min(0).max(10_000), funnelRemoved: z.boolean(), done: z.boolean() }))
    .max(8),
  table: z.array(z.object({ initial: short, final: short, titre: short })).max(8),
  answers: z.object({ meanTitre: answer, concA: answer, concB: answer, final: answer }),
  written: z.object({ endpoint: z.string().max(1000), precautions: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<ChemTitrationState>;

export const CHEM_TITRATION: SimulatorSpec = {
  id: 'chem-titration',
  subject: 'Chemistry',
  title: 'Acid–base titration',
  topicNames: ['Volumetric analysis', 'Acids, bases and salts', 'Quantitative analysis'],
  minutes: 45,
  rubric: [
    { id: 'setup', label: 'Apparatus and setting up', marks: 4, how: 'AUTO', guide: 'Burette rinsed with the acid (A), pipette rinsed with the base (B), conical flask rinsed with distilled water only, a suitable indicator.' },
    { id: 'procedure', label: 'Procedure', marks: 5, how: 'AUTO', guide: 'A rough titration first, at least two accurate titrations, no overshooting in the accurate ones (dropwise near the end point), the flask swirled throughout, the funnel removed before titrating.' },
    { id: 'readings', label: 'Table of burette readings', marks: 6, how: 'AUTO', guide: 'Every reading to 2 decimal places (2), readings that match the burette within ±0.05 cm³ (2), titres subtracted correctly, two accurate titres within ±0.10 cm³ of each other, and an end point within ±0.20 cm³ of the true titre.' },
    { id: 'calculations', label: 'Calculations', marks: 5, how: 'AUTO', guide: 'Mean of the concordant titres (1), A in mol dm⁻³ (1), B in mol dm⁻³ using the mole ratio (2), the last answer (1). Errors carried forward are not penalised twice.' },
    { id: 'units', label: 'Units', marks: 1, how: 'AUTO', guide: 'Every answer with its correct unit (cm³, mol dm⁻³, g dm⁻³, %).' },
    { id: 'endpoint', label: 'End-point colour change', marks: 1, how: 'AI', guide: 'The colour of the indicator used, from its colour in the base to its colour at the end point (methyl orange: yellow to orange/pink; phenolphthalein: pink to colourless).' },
    { id: 'precautions', label: 'Precautions', marks: 1, how: 'AI', guide: 'Two correct precautions for this titration, e.g. remove the funnel before reading; read the bottom of the meniscus at eye level; swirl the flask; add acid dropwise near the end point; rinse the burette with the acid and the pipette with the base; remove air bubbles from the burette jet; use a white tile.' },
  ],
};
