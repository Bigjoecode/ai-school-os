import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { BENEDICT_STAGE_NAME, benedictColour, benedictFinal, benedictIndex, benedictStage, mixColour } from './bio-food-tests';
import { labBetween, labPick, labRandom, roundDp } from './seeded';

/**
 * chem-organic: WAEC chemistry organic tests and soap making. The one source
 * of truth for the chemistry: the web shows these outcomes and the API marks
 * against them.
 *
 * GROUPS (pr-chem-functional-group-tests): four unknown organic liquids A–D
 * (seeded: one alkene, one alkane, one alkanol, one alkanoic acid) are tested
 * with bromine water and acidified KMnO₄ (C=C), warm acidified K₂Cr₂O₇ and
 * sodium (alkanol –OH; H₂ pops), NaHCO₃ (–COOH; CO₂ turns lime water milky)
 * and esterification (warm with the partner and conc. H₂SO₄ in a water bath,
 * pour into water, waft: fruity smell). TEST | OBSERVATION | INFERENCE, each
 * liquid named, and the ester yield worked out.
 *
 * CARBS (pr-chem-tests-for-carbohydrates): samples W–Z (glucose, sucrose,
 * starch and a local food, shuffled) — Benedict's or Fehling's in a boiling
 * water bath, iodine, and acid hydrolysis (boil with dilute HCl, iodine
 * portions at intervals, neutralise with NaHCO₃, then Benedict's). The
 * carbohydrates in each sample and the molarity of the glucose solution.
 *
 * PROTEINS (pr-chem-tests-for-proteins): P, Q, R and water as a control —
 * Biuret (NaOH, then 1% CuSO₄ drop by drop), Millon's, xanthoproteic (conc.
 * HNO₃, warm → yellow; NH₃ → orange), ninhydrin and heat coagulation. Protein
 * present or not in each sample, and the % nitrogen of an amino acid.
 *
 * SOAP (pr-chem-saponification): palm oil boiled with 20% NaOH (stirring,
 * topping up water), salted out with brine, filtered, washed, dried and
 * weighed, then lather in distilled and in hard water. The yield is worked
 * out from the student's own weighings.
 */

export const ORG_TASKS = ['GROUPS', 'CARBS', 'PROTEINS', 'SOAP'] as const;
export type OrgTask = (typeof ORG_TASKS)[number];
export const ORG_PRACTICAL_TASKS: Record<string, OrgTask> = {
  'pr-chem-functional-group-tests': 'GROUPS',
  'pr-chem-tests-for-carbohydrates': 'CARBS',
  'pr-chem-tests-for-proteins': 'PROTEINS',
  'pr-chem-saponification': 'SOAP',
};
export const ORG_TASK_TITLE: Record<OrgTask, string> = {
  GROUPS: 'Functional-group tests on liquids A–D',
  CARBS: 'Tests for sugars and starch on W–Z',
  PROTEINS: 'Tests for proteins on P, Q and R',
  SOAP: 'Making soap from palm oil',
};

/** A–D (GROUPS), W–Z (CARBS), P, Q, R and the water control (PROTEINS). */
export const ORG_SAMPLES = ['A', 'B', 'C', 'D', 'W', 'X', 'Y', 'Z', 'P', 'Q', 'R', 'H2O'] as const;
export type OrgSample = (typeof ORG_SAMPLES)[number];
export const ORG_TASK_SAMPLES: Record<Exclude<OrgTask, 'SOAP'>, OrgSample[]> = { GROUPS: ['A', 'B', 'C', 'D'], CARBS: ['W', 'X', 'Y', 'Z'], PROTEINS: ['P', 'Q', 'R', 'H2O'] };
export const orgSampleName = (x: OrgSample) => (x === 'H2O' ? 'Water (control)' : x);

export const ORG_TESTS = ['BROMINE', 'KMNO4', 'DICHROMATE', 'SODIUM', 'NAHCO3', 'ESTER', 'BENEDICT', 'FEHLING', 'IODINE', 'HYDROLYSIS', 'BIURET', 'MILLON', 'XANTHO', 'NINHYDRIN', 'COAGULATE'] as const;
export type OrgTestId = (typeof ORG_TESTS)[number];
export const ORG_STEPS = ['SPLINT', 'LIMEWATER', 'ACID_PARTNER', 'ETHANOL_PARTNER', 'H2SO4', 'POUR', 'ACID', 'NEUTRALISE', 'BENEDICT', 'NAOH', 'CUSO4', 'HNO3', 'NH3'] as const;
export type OrgStep = (typeof ORG_STEPS)[number];

export interface OrgTestInfo {
  label: string;
  short: string;
  task: Exclude<OrgTask, 'SOAP'>;
  steps: { id: OrgStep; label: string }[];
  /** Warmed or heated in the water bath (`heat`, s). */
  heats: boolean;
  /** Only the teacher does it (sodium, conc. acids, Millon's). */
  teacher?: boolean;
}
export const ORG_TEST_INFO: Record<OrgTestId, OrgTestInfo> = {
  BROMINE: { label: 'Bromine water (a few drops), shake', short: 'Bromine water', task: 'GROUPS', steps: [], heats: false },
  KMNO4: { label: 'Acidified KMnO₄ (a few drops), shake', short: 'KMnO₄', task: 'GROUPS', steps: [], heats: false },
  DICHROMATE: { label: 'Acidified K₂Cr₂O₇, warm in the water bath', short: 'K₂Cr₂O₇', task: 'GROUPS', steps: [], heats: true },
  SODIUM: { label: 'A tiny piece of sodium (teacher)', short: 'Sodium', task: 'GROUPS', steps: [{ id: 'SPLINT', label: 'Test the gas with a burning splint' }], heats: false, teacher: true },
  NAHCO3: { label: 'Solid NaHCO₃ (a spatula-tip)', short: 'NaHCO₃', task: 'GROUPS', steps: [{ id: 'LIMEWATER', label: 'Pass the gas into lime water' }], heats: false },
  ESTER: {
    label: 'Esterification: partner + conc. H₂SO₄, warm, pour into water',
    short: 'Ester',
    task: 'GROUPS',
    steps: [
      { id: 'ACID_PARTNER', label: 'Add 1 cm³ of ethanoic acid' },
      { id: 'ETHANOL_PARTNER', label: 'Add 1 cm³ of ethanol' },
      { id: 'H2SO4', label: 'Teacher adds 3 drops of conc. H₂SO₄' },
      { id: 'POUR', label: 'Pour into a beaker of cold water and waft the smell' },
    ],
    heats: true,
  },
  BENEDICT: { label: "Benedict's solution (equal volume), boiling water bath", short: "Benedict's", task: 'CARBS', steps: [], heats: true },
  FEHLING: { label: "Fehling's A + B (equal volume), boiling water bath", short: "Fehling's", task: 'CARBS', steps: [], heats: true },
  IODINE: { label: 'Iodine in KI (2 drops)', short: 'Iodine', task: 'CARBS', steps: [], heats: false },
  HYDROLYSIS: {
    label: "Acid hydrolysis: boil with dilute HCl, neutralise, then Benedict's",
    short: 'Hydrolysis',
    task: 'CARBS',
    steps: [
      { id: 'ACID', label: 'Add a few drops of dilute HCl (then boil in the water bath)' },
      { id: 'NEUTRALISE', label: 'Cool; add NaHCO₃ until the fizzing stops' },
      { id: 'BENEDICT', label: "Add an equal volume of Benedict's solution" },
    ],
    heats: true,
  },
  BIURET: {
    label: 'Biuret: 2 cm³ NaOH, then 1% CuSO₄ drop by drop',
    short: 'Biuret',
    task: 'PROTEINS',
    steps: [
      { id: 'NAOH', label: 'Add 2 cm³ of NaOH(aq)' },
      { id: 'CUSO4', label: 'Add 1 drop of 1% CuSO₄ and shake' },
    ],
    heats: false,
  },
  MILLON: { label: "Millon's reagent (teacher), warm gently", short: "Millon's", task: 'PROTEINS', steps: [], heats: true, teacher: true },
  XANTHO: {
    label: 'Xanthoproteic: conc. HNO₃ (teacher), warm, cool, then NH₃(aq)',
    short: 'Xanthoproteic',
    task: 'PROTEINS',
    steps: [
      { id: 'HNO3', label: 'Teacher adds 1 cm³ of conc. HNO₃' },
      { id: 'NH3', label: 'Cool, then add NH₃(aq) dropwise' },
    ],
    heats: true,
    teacher: true,
  },
  NINHYDRIN: { label: 'Ninhydrin (a few drops), warm in the water bath', short: 'Ninhydrin', task: 'PROTEINS', steps: [], heats: true },
  COAGULATE: { label: 'Heat in the boiling water bath (coagulation)', short: 'Heat', task: 'PROTEINS', steps: [], heats: true },
};
export const orgTestsFor = (task: OrgTask): OrgTestId[] => ORG_TESTS.filter((t) => task !== 'SOAP' && ORG_TEST_INFO[t].task === task);

/** What a row can infer (present or absent). */
export const ORG_CLAIMS = ['CC', 'OH', 'COOH', 'STARCH', 'REDUCING', 'NONREDUCING', 'PROTEIN', 'DENATURED'] as const;
export type OrgClaim = (typeof ORG_CLAIMS)[number];
export const ORG_CLAIM_LABEL: Record<OrgClaim, string> = {
  CC: 'C=C (alkene)',
  OH: '–OH (alkanol)',
  COOH: '–COOH (alkanoic acid)',
  STARCH: 'Starch',
  REDUCING: 'Reducing sugar',
  NONREDUCING: 'Non-reducing sugar',
  PROTEIN: 'Protein',
  DENATURED: 'Protein coagulated (denatured)',
};
export const ORG_TASK_CLAIMS: Record<Exclude<OrgTask, 'SOAP'>, OrgClaim[]> = { GROUPS: ['CC', 'OH', 'COOH'], CARBS: ['STARCH', 'REDUCING', 'NONREDUCING'], PROTEINS: ['PROTEIN', 'DENATURED'] };

/** What a sample is said to be (the conclusion). GROUPS: one class; CARBS: every carbohydrate in it; PROTEINS: protein or not. */
export const ORG_IDENTS = ['ALKENE', 'ALKANE', 'ALKANOL', 'ACID', 'STARCH', 'REDUCING', 'NONREDUCING', 'PROTEIN', 'NO_PROTEIN'] as const;
export type OrgIdent = (typeof ORG_IDENTS)[number];
export const ORG_IDENT_LABEL: Record<OrgIdent, string> = {
  ALKENE: 'Alkene',
  ALKANE: 'Alkane',
  ALKANOL: 'Alkanol',
  ACID: 'Alkanoic acid',
  STARCH: 'Starch',
  REDUCING: 'Reducing sugar',
  NONREDUCING: 'Non-reducing sugar',
  PROTEIN: 'Protein present',
  NO_PROTEIN: 'No protein',
};
export const ORG_TASK_IDENTS: Record<Exclude<OrgTask, 'SOAP'>, OrgIdent[]> = { GROUPS: ['ALKENE', 'ALKANE', 'ALKANOL', 'ACID'], CARBS: ['STARCH', 'REDUCING', 'NONREDUCING'], PROTEINS: ['PROTEIN', 'NO_PROTEIN'] };
/** GROUPS and PROTEINS name one answer per sample; CARBS ticks every carbohydrate present. */
export const orgSingleIdent = (task: OrgTask) => task !== 'CARBS';

// ------------------------------------------------------------------ observation parts

/** One observable fact (same shape as chem-qualitative's parts, so its observation marker reads it). */
export interface OrgPart {
  text: string;
  kw: string[][];
  not?: string[];
}
const P = (text: string, ...kw: string[][]): OrgPart => ({ text, kw });
const Pn = (text: string, not: string[], ...kw: string[][]): OrgPart => ({ text, kw, not });
const PPT = ['precipitate', 'ppt', 'suspension', 'solid', 'sediment', 'deposit'];
const STAY = ['remain', 'stay', 'still', 'no change', 'no colour change', 'no color change', 'unchanged', 'persist', 'not decolouri', 'not decolori', 'no decolouri', 'no decolori'];
const DECOL = ['decolouri', 'decolori', 'colourless', 'colorless', 'discharged', 'disappear'];

export const ORG_COL = {
  water: '#e8f0f6',
  organic: '#f1f4f6',
  bromine: '#e08a2c',
  bromineLayer: '#d9731f',
  paleBromine: '#f0d6a8',
  kmno4: '#6f1d78',
  kmno4Fading: '#c99ac4',
  dichromate: '#e8791c',
  chromium: '#3f8c55',
  limeMilky: '#eeeee6',
  limeClear: '#e9f2f7',
  sodium: '#c9cbc6',
  iodine: '#c08a3a',
  blueBlack: '#1c1d44',
  fehling: '#1f4fb8',
  biuretBlue: '#5e93d8',
  deepBlue: '#2b5fc0',
  violet: '#7b3f9e',
  white: '#f2efe6',
  millonRed: '#b0442c',
  yellow: '#e8c21e',
  orange: '#e07818',
  ninhydrin: '#5b3fa8',
  ninhydrinPale: '#e9e6f0',
  palmOil: '#d9601c',
  soap: '#efe4c0',
  brine: '#e3edf2',
};
/** Iodine portions during acid hydrolysis of starch: blue-black → … → yellow-brown. */
export const ORG_IODINE_NAME = ['blue-black', 'dark blue', 'purple', 'reddish-brown', 'yellow-brown'] as const;
export const ORG_IODINE_HEX = ['#1c1d44', '#2a3d8f', '#5b3a8c', '#8a4a2a', '#c08a3a'] as const;
export function orgIodineStage(starchLeft: number): number {
  if (starchLeft > 0.65) return 0;
  if (starchLeft > 0.35) return 1;
  if (starchLeft > 0.15) return 2;
  if (starchLeft > 0.05) return 3;
  return 4;
}

// ------------------------------------------------------------------ samples

export const GROUP_KINDS = ['ALKENE', 'ALKANE', 'ALKANOL', 'ACID'] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];

export interface OrgContent {
  /** GROUPS: the homologous series. */
  kind: GroupKind | null;
  starch: number;
  reducing: number;
  sucrose: number;
  protein: boolean;
  /** What heat does to it: a white solid clot (egg albumen), a little flocculent precipitate, a skin on top (milk), nothing. */
  coag: 'SOLID' | 'FLOC' | 'SKIN' | null;
  look: { hex: string; cloudy: boolean; immiscible: boolean };
}
export interface OrgSampleDef {
  id: string;
  task: Exclude<OrgTask, 'SOAP'>;
  name: string;
  formula?: string;
  describe: string;
  content: (r: () => number) => OrgContent;
}
const look = (hex: string, cloudy = false, immiscible = false) => ({ hex, cloudy, immiscible });
const NONE = { kind: null, starch: 0, reducing: 0, sucrose: 0, protein: false, coag: null } as const;
const grp = (kind: GroupKind, immiscible: boolean, hex = ORG_COL.organic): OrgContent => ({ ...NONE, kind, look: look(hex, false, immiscible) });
export const ORG_SAMPLE_DEFS: OrgSampleDef[] = [
  // GROUPS
  { id: 'hexene', task: 'GROUPS', name: 'hex-1-ene (an alkene)', formula: 'C₆H₁₂', describe: 'a colourless liquid', content: () => grp('ALKENE', true) },
  { id: 'cyclohexene', task: 'GROUPS', name: 'cyclohexene (an alkene)', formula: 'C₆H₁₀', describe: 'a colourless liquid', content: () => grp('ALKENE', true) },
  { id: 'hexane', task: 'GROUPS', name: 'hexane (an alkane)', formula: 'C₆H₁₄', describe: 'a colourless liquid', content: () => grp('ALKANE', true) },
  { id: 'kerosene', task: 'GROUPS', name: 'kerosene (mainly alkanes)', describe: 'a very pale yellow liquid', content: () => grp('ALKANE', true, '#f3eed6') },
  { id: 'ethanol', task: 'GROUPS', name: 'ethanol (an alkanol)', formula: 'C₂H₅OH', describe: 'a colourless liquid', content: () => grp('ALKANOL', false) },
  { id: 'propanol', task: 'GROUPS', name: 'propan-1-ol (an alkanol)', formula: 'C₃H₇OH', describe: 'a colourless liquid', content: () => grp('ALKANOL', false) },
  { id: 'ethanoic', task: 'GROUPS', name: 'ethanoic acid (an alkanoic acid)', formula: 'CH₃COOH', describe: 'a colourless liquid', content: () => grp('ACID', false) },
  { id: 'propanoic', task: 'GROUPS', name: 'propanoic acid (an alkanoic acid)', formula: 'C₂H₅COOH', describe: 'a colourless liquid', content: () => grp('ACID', false) },
  // CARBS
  { id: 'glucose', task: 'CARBS', name: 'glucose solution', describe: 'a clear, colourless solution', content: (r) => ({ ...NONE, reducing: labBetween(r, 0.8, 1.8, 2), look: look(ORG_COL.water) }) },
  { id: 'sucrose', task: 'CARBS', name: 'sucrose solution', describe: 'a clear, colourless solution', content: (r) => ({ ...NONE, sucrose: labBetween(r, 3, 6, 1), look: look(ORG_COL.water) }) },
  { id: 'starch', task: 'CARBS', name: 'cassava starch solution', describe: 'a cloudy, colourless liquid', content: () => ({ ...NONE, starch: 1, look: look('#eceae2', true) }) },
  { id: 'orange', task: 'CARBS', name: 'orange juice', describe: 'a cloudy, pale orange liquid', content: (r) => ({ ...NONE, reducing: labBetween(r, 1.5, 3, 2), sucrose: labBetween(r, 3, 5, 1), look: look('#f2c879', true) }) },
  { id: 'cane', task: 'CARBS', name: 'sugar-cane juice', describe: 'a clear, very pale straw-coloured liquid', content: (r) => ({ ...NONE, reducing: labBetween(r, 0.07, 0.12, 2), sucrose: labBetween(r, 4, 7, 1), look: look('#ece6c4') }) },
  { id: 'bread', task: 'CARBS', name: 'bread soaked in water', describe: 'a cream-coloured cloudy suspension', content: (r) => ({ ...NONE, starch: 1, reducing: labBetween(r, 0.3, 0.6, 2), look: look('#ebe1c8', true) }) },
  // PROTEINS
  { id: 'egg', task: 'PROTEINS', name: 'egg albumen (egg white in water)', describe: 'a slightly cloudy, colourless liquid', content: () => ({ ...NONE, protein: true, coag: 'SOLID', look: look('#eeefe6', true) }) },
  { id: 'milk', task: 'PROTEINS', name: 'milk', describe: 'a white, opaque liquid', content: () => ({ ...NONE, protein: true, coag: 'SKIN', reducing: 0.5, look: look('#f7f6f0', true) }) },
  { id: 'beans', task: 'PROTEINS', name: 'bean (cowpea) extract', describe: 'a beige, cloudy liquid', content: () => ({ ...NONE, protein: true, coag: 'FLOC', look: look('#e6d8bb', true) }) },
  { id: 'groundnut', task: 'PROTEINS', name: 'groundnut extract', describe: 'a light brown, cloudy liquid', content: () => ({ ...NONE, protein: true, coag: 'FLOC', look: look('#d9c49a', true) }) },
  { id: 'gsol', task: 'PROTEINS', name: 'glucose solution', describe: 'a clear, colourless solution', content: () => ({ ...NONE, reducing: 1, look: look(ORG_COL.water) }) },
  { id: 'ssol', task: 'PROTEINS', name: 'starch solution', describe: 'a cloudy, colourless liquid', content: () => ({ ...NONE, starch: 1, look: look('#eceae2', true) }) },
];
export const ORG_SAMPLE_BY_ID: Record<string, OrgSampleDef> = Object.fromEntries(ORG_SAMPLE_DEFS.map((d) => [d.id, d]));
const WATER_CONTROL: OrgSampleDef = { id: 'water', task: 'PROTEINS', name: 'distilled water (the control)', describe: 'distilled water', content: () => ({ ...NONE, look: look(ORG_COL.water) }) };

/** The carbohydrates truly in a content. */
export function orgCarbs(c: OrgContent): OrgIdent[] {
  const out: OrgIdent[] = [];
  if (c.starch > 0) out.push('STARCH');
  if (benedictStage(benedictFinal(c.reducing)) > 0) out.push('REDUCING');
  if (c.sucrose > 0) out.push('NONREDUCING');
  return out;
}
/** The true answer for a sample's conclusion. */
export function orgTruth(task: OrgTask, c: OrgContent): OrgIdent[] {
  if (task === 'GROUPS') return c.kind ? [c.kind] : [];
  if (task === 'CARBS') return orgCarbs(c);
  return [c.protein ? 'PROTEIN' : 'NO_PROTEIN'];
}

// ------------------------------------------------------------------ variant

export interface OrgBenchSample {
  letter: OrgSample;
  def: OrgSampleDef;
  content: OrgContent;
}
export const ORG_AMINO = [
  { name: 'glycine', formula: 'H₂NCH₂COOH (C₂H₅NO₂)', M: 75, n: 1 },
  { name: 'alanine', formula: 'CH₃CH(NH₂)COOH (C₃H₇NO₂)', M: 89, n: 1 },
  { name: 'glycylglycine (a dipeptide)', formula: 'C₄H₈N₂O₃', M: 132, n: 2 },
  { name: 'serine', formula: 'HOCH₂CH(NH₂)COOH (C₃H₇NO₃)', M: 105, n: 1 },
] as const;
export interface OrgCalcVariant {
  /** GROUPS: ethanoic acid used (g, excess ethanol) and ethyl ethanoate obtained (g). */
  acidMass: number;
  esterMass: number;
  /** CARBS: glucose dissolved (g) and the solution's volume (cm³). */
  glucoseMass: number;
  glucoseVol: number;
  /** PROTEINS: the amino acid (or dipeptide) whose % nitrogen is worked out. */
  amino: number;
}
export interface SoapVariant {
  /** The 10 cm³ of palm oil weighs this (g, the balance reading). */
  oilMass: number;
  /** Water boiled off (cm³ per minute of boiling). */
  evap: number;
  /** Saponification time constant with stirring (s). */
  tau: number;
  /** Fraction of the soap recovered after salting out and filtering. */
  recovery: number;
}
export interface ChemOrganicVariant {
  seed: number;
  task: OrgTask;
  samples: OrgBenchSample[];
  calc: OrgCalcVariant;
  soap: SoapVariant;
  minRows: number;
}

function shuffle<T>(r: () => number, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
const defs = (task: Exclude<OrgTask, 'SOAP'>, ids: string[]) => ids.map((id) => ORG_SAMPLE_BY_ID[id]!).filter((d) => d.task === task);

function pickSamples(seed: number, task: OrgTask): OrgBenchSample[] {
  if (task === 'SOAP') return [];
  const r = labRandom(seed, `chem-organic-${task}`);
  const letters = ORG_TASK_SAMPLES[task];
  let chosen: OrgSampleDef[];
  if (task === 'GROUPS') {
    const by = (k: GroupKind) => ORG_SAMPLE_DEFS.filter((d) => d.task === 'GROUPS' && d.content(() => 0.5).kind === k);
    chosen = shuffle(r, GROUP_KINDS.map((k) => labPick(r, by(k))));
  } else if (task === 'CARBS') {
    chosen = shuffle(r, [...defs('CARBS', ['glucose', 'sucrose', 'starch']), ORG_SAMPLE_BY_ID[labPick(r, ['orange', 'cane', 'bread'])]!]);
  } else {
    const others = shuffle(r, defs('PROTEINS', ['milk', 'beans', 'groundnut', 'gsol', 'ssol']));
    // Egg albumen (heat coagulation) is always one of them; at least one has protein and one has none.
    const rest = [others.find((d) => d.content(() => 0.5).protein)!, others.find((d) => !d.content(() => 0.5).protein)!];
    chosen = [...shuffle(r, [ORG_SAMPLE_BY_ID.egg!, ...rest]), WATER_CONTROL];
  }
  return chosen.map((def, i) => ({ letter: letters[i]!, def, content: def.content(r) }));
}

export function chemOrganicVariant(seed: number, task: OrgTask): ChemOrganicVariant {
  const samples = pickSamples(seed, task);
  const r = labRandom(seed, 'chem-organic-calc');
  const acidMass = labPick(r, [4.8, 5.4, 6.0, 6.6, 7.2, 9.0]);
  const esterMass = roundDp((acidMass / 60) * 88 * labBetween(r, 0.55, 0.72, 3), 2);
  const glucoseMass = labBetween(r, 0.9, 3.6, 2);
  const glucoseVol = labPick(r, [100, 250]);
  const amino = Math.floor(r() * ORG_AMINO.length) % ORG_AMINO.length;
  const rs = labRandom(seed, 'chem-organic-soap');
  const soap: SoapVariant = { oilMass: roundDp(10 * labBetween(rs, 0.89, 0.92, 3), 2), evap: labBetween(rs, 1.0, 1.4, 2), tau: Math.round(labBetween(rs, 240, 330, 0)), recovery: labBetween(rs, 0.86, 0.94, 3) };
  const minRows = task === 'GROUPS' ? 12 : task === 'CARBS' ? 8 + samples.filter((s) => benedictStage(benedictFinal(s.content.reducing)) === 0).length : task === 'PROTEINS' ? 8 : 4;
  return { seed, task, samples, calc: { acidMass, esterMass, glucoseMass, glucoseVol, amino }, soap, minRows };
}

// ------------------------------------------------------------------ the student's work

export interface OrgTest {
  sample: OrgSample;
  test: OrgTestId;
  /** Additions after the first reagent, in the order made. */
  steps: OrgStep[];
  /** Seconds in the water bath (for HYDROLYSIS: after Benedict's). */
  heat: number;
  /** Heated directly over the flame (unsafe: organic liquids catch fire; tubes spurt). */
  direct: boolean;
  /** HYDROLYSIS: seconds boiled with the acid. */
  boil: number;
  /** HYDROLYSIS: iodine portions taken at these boiling times (s). */
  portions: number[];
  /** BIURET: drops of CuSO₄. */
  drops: number;
}
export interface OrgRecord {
  observation: string;
  present: OrgClaim[];
  absent: OrgClaim[];
  note: string;
}

export const SOAP_ACTS = ['OIL', 'WEIGH_OIL', 'NAOH', 'BOIL', 'BOIL_NOSTIR', 'WATER', 'BRINE', 'COOL', 'FILTER', 'WASH', 'DRY', 'WEIGH_SOAP', 'LATHER_SOFT', 'LATHER_HARD'] as const;
export type SoapAct = (typeof SOAP_ACTS)[number];
export interface SoapEvent {
  a: SoapAct;
  /** BOIL: seconds; WATER: cm³. */
  n: number;
}
export const SOAP_ROWS = ['BOIL', 'BRINE', 'SOFT', 'HARD'] as const;
export type SoapRow = (typeof SOAP_ROWS)[number];
export const SOAP_ROW_LABEL: Record<SoapRow, string> = { BOIL: 'Palm oil boiled with NaOH(aq), stirring', BRINE: 'Saturated brine added to the hot mixture', SOFT: 'A piece of soap shaken with distilled (soft) water', HARD: 'A piece of soap shaken with hard water' };
export const SOAP_CLAIMS = ['SAPONIFIED', 'INCOMPLETE', 'SALTED_OUT', 'LATHER', 'SCUM'] as const;
export type SoapClaim = (typeof SOAP_CLAIMS)[number];
export const SOAP_CLAIM_LABEL: Record<SoapClaim, string> = {
  SAPONIFIED: 'Fat hydrolysed by the alkali (saponified)',
  INCOMPLETE: 'Saponification incomplete',
  SALTED_OUT: 'Soap salted out (less soluble in brine)',
  LATHER: 'Soap lathers in soft water',
  SCUM: 'Ca²⁺/Mg²⁺ in hard water form scum',
};
export interface SoapRecord {
  observation: string;
  claims: SoapClaim[];
}
export const SOAP_BYPRODUCTS = ['glycerol', 'ethanol', 'water only', 'ethanoic acid'] as const;

export interface ChemOrganicState {
  v: 1;
  task: OrgTask | null;
  tests: OrgTest[];
  /** Same order as `tests`. */
  table: OrgRecord[];
  conclusion: Partial<Record<OrgSample, OrgIdent[]>>;
  soap: SoapEvent[];
  soapRows: Record<SoapRow, SoapRecord>;
  /** SOAP: mass of oil, mass of soap, theoretical mass of soap, % yield, the by-product. */
  readings: { oil: string; soap: string; theory: string; yield: string; byproduct: string };
  /** GROUPS: mol of acid, max mass of ester, % yield. CARBS: mol of glucose, concentration. PROTEINS: M, % N. */
  calc: { a: string; b: string; c: string };
  written: { precautions: string; explain: string };
  log: { t: number; a: string }[];
}

export const ORG_MAX_TESTS = 40;
export const SOAP_MAX_EVENTS = 200;
export const emptyOrgRecord = (): OrgRecord => ({ observation: '', present: [], absent: [], note: '' });
export const emptySoapRows = (): Record<SoapRow, SoapRecord> => ({ BOIL: { observation: '', claims: [] }, BRINE: { observation: '', claims: [] }, SOFT: { observation: '', claims: [] }, HARD: { observation: '', claims: [] } });
export function emptyChemOrganicState(): ChemOrganicState {
  return { v: 1, task: null, tests: [], table: [], conclusion: {}, soap: [], soapRows: emptySoapRows(), readings: { oil: '', soap: '', theory: '', yield: '', byproduct: '' }, calc: { a: '', b: '', c: '' }, written: { precautions: '', explain: '' }, log: [] };
}

const claim = z.enum(ORG_CLAIMS);
const soapRow = z.object({ observation: z.string().max(600), claims: z.array(z.enum(SOAP_CLAIMS)).max(5) });
export const chemOrganicStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(ORG_TASKS).nullable(),
  tests: z
    .array(
      z.object({
        sample: z.enum(ORG_SAMPLES),
        test: z.enum(ORG_TESTS),
        steps: z.array(z.enum(ORG_STEPS)).max(8),
        heat: z.number().min(0).max(900),
        direct: z.boolean(),
        boil: z.number().min(0).max(1800),
        portions: z.array(z.number().min(0).max(1800)).max(20),
        drops: z.number().int().min(0).max(30),
      }),
    )
    .max(ORG_MAX_TESTS),
  table: z.array(z.object({ observation: z.string().max(600), present: z.array(claim).max(8), absent: z.array(claim).max(8), note: z.string().max(300) })).max(ORG_MAX_TESTS),
  conclusion: z.partialRecord(z.enum(ORG_SAMPLES), z.array(z.enum(ORG_IDENTS)).max(4)),
  soap: z.array(z.object({ a: z.enum(SOAP_ACTS), n: z.number().min(0).max(1800) })).max(SOAP_MAX_EVENTS),
  soapRows: z.object({ BOIL: soapRow, BRINE: soapRow, SOFT: soapRow, HARD: soapRow }),
  readings: z.object({ oil: z.string().max(40), soap: z.string().max(40), theory: z.string().max(40), yield: z.string().max(40), byproduct: z.string().max(40) }),
  calc: z.object({ a: z.string().max(40), b: z.string().max(40), c: z.string().max(40) }),
  written: z.object({ precautions: z.string().max(2000), explain: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<ChemOrganicState>;

export const CHEM_ORGANIC: SimulatorSpec = {
  id: 'chem-organic',
  subject: 'Chemistry',
  title: 'Organic tests and soap making',
  topicNames: ['Functional groups', 'Carbohydrates', 'Proteins', 'Fats and oils', 'Organic chemistry', 'Soaps and detergents'],
  minutes: 50,
  rubric: [
    {
      id: 'procedure',
      label: 'Procedure',
      marks: 4,
      how: 'AUTO',
      guide:
        'Test-tube tasks: every sample tested for each class the practical covers, each test finished (2). Functional groups: the ester made properly (conc. H₂SO₄, warmed in a water bath, poured into water) (1); organic liquids never heated over a flame (0.5); each gas identified — H₂ with a burning splint, CO₂ with lime water (0.5). Carbohydrates: acid hydrolysis, neutralised before Benedict’s, on every sample that gave no reducing sugar (1); starch hydrolysis followed with iodine portions (0.5); every Benedict’s or Fehling’s test in a boiling water bath for at least 3 minutes, never the flame (0.5). Proteins: the water control (0.5); CuSO₄ added drop by drop (at most 5 drops) (0.5); the heat-coagulation test (0.5); the xanthoproteic test finished with NH₃ (0.5). Soap: oil and NaOH measured, boiled 15–20 minutes, stirred all the time, water topped up so it never boiled dry, salted out with brine, filtered and washed, and the lather tested in soft and hard water.',
    },
    { id: 'observations', label: 'Observations', marks: 5, how: 'AUTO', guide: 'Each observation states what was actually seen: decolourised rapidly / remains orange or purple; orange to green; effervescence and the gas test (pop, milky lime water); a fruity smell; the Benedict’s colour and a precipitate; blue-black; violet; white precipitate turning brick-red; yellow then orange; blue-violet; a white coagulum. Soap: thick and creamy, a solid layer floating on the brine, lather in soft water, scum in hard water.' },
    { id: 'inferences', label: 'Inferences', marks: 4, how: 'AUTO', guide: 'Each inference follows from its own observation: the group or food substance present or absent — never one the test cannot show, and nothing from an unfinished test (dichromate not warmed, the ester not poured out, Benedict’s not heated, the acid not neutralised, too much CuSO₄). Soap: saponified (or not finished), salted out, lathers in soft water, Ca²⁺/Mg²⁺ form scum.' },
    { id: 'results', label: 'Identification and results', marks: 3, how: 'AUTO', guide: 'Each sample identified: the series of A–D, the carbohydrates in W–Z, protein present or not in P, Q and R (2); the calculation from the given data — ester yield, glucose concentration or % nitrogen (1). Soap: the mass of oil and of soap read from the balance, the theoretical mass (oil ÷ 806 × 3 × 278), the % yield and glycerol as the by-product (3).' },
    { id: 'precautions', label: 'Precautions', marks: 2, how: 'AI', guide: 'Two correct precautions (1 each): goggles; heating organic liquids only in a water bath, away from flames; small quantities; comparing with a control; waft, never sniff; equal volumes; CuSO₄ dropwise; neutralise the acid before Benedict’s; soap — stir continuously, keep the volume up with water, wash the soap to remove the alkali.' },
    { id: 'explanation', label: 'Explanation', marks: 2, how: 'AI', guide: 'Functional groups: addition across C=C decolourises bromine (1); esterification is a reversible condensation of an acid and an alkanol catalysed by conc. H₂SO₄ (1). Carbohydrates: acid hydrolyses sucrose/starch to reducing sugars (1); Benedict’s needs alkaline conditions (1). Proteins: Biuret detects peptide links (1); heat denatures (coagulates) proteins (1). Soap: brine salts the soap out because it is less soluble in salt water (1); the hydrophobic tail dissolves grease and the hydrophilic head dissolves in water (1).' },
  ],
};

// ------------------------------------------------------------------ outcomes

export interface OrgVisual {
  liquid: string;
  /** A separate organic layer on top (immiscible liquids), coloured. */
  layer: string | null;
  ppt: string | null;
  /** A solid in the tube (sodium, NaHCO₃). */
  solid: string | null;
  bubbles: boolean;
  /** A white clot of coagulated protein. */
  coag: boolean;
  /** The gas tests at the mouth of the tube. */
  probes: { test: 'BURNING_SPLINT' | 'LIME_WATER'; colour: string; text: string }[];
  benedict: number | null;
  /** The ester poured into water (a beaker shows it). */
  poured: boolean;
}
export interface OrgOutcome {
  parts: OrgPart[];
  visual: OrgVisual;
  complete: boolean;
  positive: boolean;
}

/** What is in a sample. */
export function orgSampleContent(v: ChemOrganicVariant, sample: OrgSample): OrgContent {
  return v.samples.find((x) => x.letter === sample)?.content ?? { ...NONE, look: look(ORG_COL.water) };
}

const has = (t: OrgTest, s: OrgStep) => t.steps.includes(s);
const before = (t: OrgTest, a: OrgStep, b: OrgStep) => t.steps.indexOf(a) >= 0 && t.steps.indexOf(b) >= 0 && t.steps.indexOf(a) < t.steps.indexOf(b);
/** Dichromate needs this long in the bath (s). */
export const ORG_WARM_MIN = 60;
/** Acid hydrolysis: the boiling a negative result needs (s). */
export const ORG_BOIL_MIN = 120;
/** Biuret: more drops of CuSO₄ than this hide the violet. */
export const BIURET_MAX_DROPS = 5;

/** Starch and sucrose left, and reducing sugar formed, after `boil` s with acid. */
export function orgHydrolysed(c: OrgContent, boil: number) {
  const starchLeft = c.starch * Math.exp(-boil / 200);
  const sucroseLeft = c.sucrose * Math.exp(-boil / 45);
  return { starchLeft, sucroseLeft, reducing: c.reducing + 1.05 * (c.sucrose - sucroseLeft) + 1.1 * (c.starch - starchLeft) };
}

function benParts(stage: number, heated: boolean): OrgPart[] {
  if (stage <= 0) return [Pn(heated ? 'the solution remains blue (no precipitate)' : 'not heated: the solution stays blue', ['turns green', 'turned green', 'precipitate forms'], ['blue'], STAY.concat(['no precipitate', 'no ppt', 'no red']))];
  const name = BENEDICT_STAGE_NAME[stage]!;
  if (stage === 1) return [Pn('on heating, the blue solution turns green', ['remains blue', 'stays blue', 'no change'], ['green'])];
  return [Pn(`on heating, the blue solution turns green, then ${stage === 2 ? 'yellow' : stage === 3 ? 'yellow, then orange' : 'yellow, then orange, then brick-red'}`, ['remains blue', 'stays blue', 'no change'], stage === 4 ? ['brick', 'red'] : [name]), P(`a ${name} precipitate forms`, PPT)];
}

const blank = (c: OrgContent): OrgVisual => ({ liquid: c.look.immiscible ? ORG_COL.water : c.look.hex, layer: c.look.immiscible ? c.look.hex : null, ppt: null, solid: null, bubbles: false, coag: false, probes: [], benedict: null, poured: false });

/** The outcome of a test on a content (pure: the grader marks against it). */
export function orgObserveContent(t: OrgTest, c: OrgContent): OrgOutcome {
  const vis = blank(c);
  const parts: OrgPart[] = [];
  let complete = true;
  let positive = false;
  const k = c.kind;
  const imm = c.look.immiscible;
  switch (t.test) {
    case 'BROMINE': {
      positive = k === 'ALKENE';
      if (positive) {
        parts.push(Pn('the orange (yellow-brown) bromine water is decolourised rapidly on shaking', STAY, DECOL));
        vis.liquid = ORG_COL.water;
        vis.layer = ORG_COL.organic;
      } else if (imm) {
        parts.push(Pn('the orange colour is not decolourised; the bromine colour passes into the upper (organic) layer', ['decolourised rapidly', 'decolorised rapidly', 'turns colourless', 'becomes colourless'], ['orange', 'brown', 'yellow', 'remain', 'not decolouri', 'no decolouri', 'not decolori', 'no decolori', 'persist', 'no change', 'stay', 'upper layer']));
        vis.liquid = ORG_COL.paleBromine;
        vis.layer = ORG_COL.bromineLayer;
      } else {
        parts.push(Pn('the orange colour remains (no decolourisation)', ['decolourised rapidly', 'decolorised rapidly', 'turns colourless', 'becomes colourless'], ['orange', 'brown', 'yellow', ...STAY]));
        vis.liquid = ORG_COL.bromine;
      }
      break;
    }
    case 'KMNO4': {
      positive = k === 'ALKENE';
      if (positive) {
        parts.push(Pn('the purple colour is decolourised rapidly on shaking', STAY.concat(['slow']), DECOL));
        vis.liquid = ORG_COL.water;
        vis.layer = ORG_COL.organic;
      } else if (k === 'ALKANOL') {
        parts.push(Pn('the purple colour fades only slowly (it is not decolourised at once)', ['rapid', 'immediately', 'at once'], ['slow', 'gradual', 'fade', 'pale', 'slight', 'pink', 'gradually']));
        vis.liquid = ORG_COL.kmno4Fading;
      } else {
        parts.push(Pn('the purple colour remains (no decolourisation)', ['decolourised rapidly', 'decolorised rapidly', 'turns colourless', 'becomes colourless'], ['purple', 'pink', 'violet', ...STAY]));
        vis.liquid = imm ? '#d9c3dc' : ORG_COL.kmno4;
        if (imm) vis.layer = ORG_COL.organic;
        if (imm) vis.liquid = ORG_COL.kmno4;
      }
      break;
    }
    case 'DICHROMATE': {
      const x = k === 'ALKANOL' ? 1 - Math.exp(-t.heat / 30) : 0;
      positive = k === 'ALKANOL' && t.heat >= 20;
      vis.liquid = mixColour(ORG_COL.dichromate, ORG_COL.chromium, x);
      if (imm) vis.layer = ORG_COL.organic;
      if (t.heat <= 0) {
        parts.push(P('not warmed yet: the solution is orange', ['orange']));
        complete = false;
      } else if (positive) parts.push(Pn('on warming, the orange solution turns green', ['remains orange', 'stays orange', 'no change'], ['green']));
      else parts.push(Pn('the orange colour remains on warming (no green)', ['turns green', 'turned green', 'becomes green'], ['orange', ...STAY, 'no green']));
      if (!positive && t.heat < ORG_WARM_MIN) complete = false;
      break;
    }
    case 'SODIUM': {
      positive = k === 'ALKANOL' || k === 'ACID';
      vis.solid = positive ? null : ORG_COL.sodium;
      if (positive) {
        parts.push(Pn(k === 'ACID' ? 'vigorous effervescence: the sodium fizzes and dissolves' : 'effervescence: the sodium fizzes steadily and slowly dissolves', ['no efferves', 'no fizz', 'no bubbl', 'no gas'], ['efferves', 'fizz', 'bubbl', 'gas']));
        vis.bubbles = true;
        if (has(t, 'SPLINT')) {
          parts.push(P('the gas burns with a squeaky pop (hydrogen)', ['pop', 'explo']));
          vis.probes.push({ test: 'BURNING_SPLINT', colour: '#ffb347', text: 'pop' });
        }
      } else {
        parts.push(Pn('no effervescence: the sodium stays shiny and sinks', ['fizzes', 'effervescence occurs', 'bubbles form'], ['no efferves', 'no fizz', 'no bubbl', 'no gas', 'no reaction', 'no change', 'shiny', 'sink', 'nothing']));
        if (has(t, 'SPLINT')) vis.probes.push({ test: 'BURNING_SPLINT', colour: '#ffb347', text: 'no gas' });
      }
      break;
    }
    case 'NAHCO3': {
      positive = k === 'ACID';
      vis.solid = positive ? null : '#f4f2ec';
      if (positive) {
        parts.push(Pn('effervescence (fizzing): a colourless gas is given off', ['no efferves', 'no fizz', 'no bubbl'], ['efferves', 'fizz', 'bubbl', 'gas']));
        vis.bubbles = true;
        if (has(t, 'LIMEWATER')) {
          parts.push(P('the gas turns lime water milky (CO₂)', ['milky', 'chalky', 'cloudy', 'white precipitate', 'turbid']));
          vis.probes.push({ test: 'LIME_WATER', colour: ORG_COL.limeMilky, text: 'milky' });
        }
      } else {
        parts.push(Pn('no effervescence', ['fizzes', 'effervescence occurs'], ['no efferves', 'no fizz', 'no bubbl', 'no gas', 'no reaction', 'no change', 'nothing']));
        if (has(t, 'LIMEWATER')) vis.probes.push({ test: 'LIME_WATER', colour: ORG_COL.limeClear, text: 'clear' });
      }
      break;
    }
    case 'ESTER': {
      const acid = has(t, 'ACID_PARTNER');
      const alc = has(t, 'ETHANOL_PARTNER');
      const forms = (acid && k === 'ALKANOL') || (alc && k === 'ACID');
      if (imm) vis.layer = ORG_COL.organic;
      complete = (acid || alc) && has(t, 'H2SO4') && t.heat >= ORG_WARM_MIN && has(t, 'POUR');
      if (!has(t, 'POUR')) {
        parts.push(P(t.heat > 0 ? 'warmed: the mixture smells of the reactants' : 'the liquids are mixed in the tube', ['smell', 'mix', 'colourless', 'no change', 'clear', 'vinegar', 'alcohol']));
        complete = false;
        break;
      }
      vis.poured = true;
      positive = forms && has(t, 'H2SO4') && t.heat >= ORG_WARM_MIN;
      if (positive) {
        parts.push(Pn('a sweet, fruity smell (of an ester)', ['no fruity', 'no sweet', 'not fruity', 'not sweet'], ['fruit', 'sweet', 'pleasant', 'pear', 'banana', 'glue', 'nail varnish', 'ester']));
        parts.push(P('an oily layer floats on the water', ['oily', 'layer', 'float', 'droplet', 'separat', 'top', 'surface', 'immiscible']));
      } else parts.push(Pn('no fruity smell: only the sharp smell of the reactants', ['fruity smell is', 'sweet smell is', 'smells fruity', 'smells sweet'], ['no fruity', 'no sweet', 'not fruity', 'not sweet', 'vinegar', 'alcohol', 'sharp', 'no ester', 'no pleasant', 'no change', 'pungent']));
      break;
    }
    case 'BENEDICT':
    case 'FEHLING': {
      const x = benedictIndex(c.reducing, t.heat, t.direct);
      const stage = benedictStage(x);
      vis.benedict = x;
      vis.liquid = t.test === 'FEHLING' && x < 0.5 ? mixColour(ORG_COL.fehling, benedictColour(x), x * 2) : benedictColour(x);
      vis.ppt = stage >= 2 ? mixColour(benedictColour(x), '#3a1a10', 0.12) : null;
      parts.push(...benParts(stage, t.heat > 0).map((p) => (t.test === 'FEHLING' ? { ...p, text: p.text.replace('blue solution', 'deep blue solution') } : p)));
      positive = stage > 0;
      if (t.heat <= 0 || (!positive && t.heat < 60)) complete = false;
      break;
    }
    case 'IODINE': {
      positive = c.starch > 0.35;
      if (positive && t.heat > 0) {
        parts.push(P('blue-black at first, but the colour disappears on heating (it returns on cooling)', ['disappear', 'fade', 'goes', 'lost', 'decolouri', 'colourless']));
        vis.liquid = mixColour(c.look.hex, ORG_COL.iodine, 0.6);
        complete = false;
      } else if (positive) {
        parts.push(Pn('a blue-black colour forms', ['no blue', 'remains brown', 'no change'], ['blue black', 'blue', 'black']));
        vis.liquid = ORG_COL.blueBlack;
      } else {
        parts.push(Pn('no blue-black colour: the iodine remains yellow-brown', ['turns blue', 'turned blue', 'becomes blue', 'became blue'], ['brown', 'yellow', 'orange', 'no blue', 'not blue', 'remain', 'no change']));
        vis.liquid = mixColour(c.look.hex, ORG_COL.iodine, 0.75);
      }
      break;
    }
    case 'HYDROLYSIS': {
      const h = orgHydrolysed(c, has(t, 'ACID') && (!has(t, 'NEUTRALISE') || before(t, 'ACID', 'NEUTRALISE')) ? t.boil : 0);
      if (t.portions.length) {
        const st = [...t.portions].sort((a, b) => a - b).map((b) => orgIodineStage(orgHydrolysed(c, b).starchLeft));
        if (c.starch > 0 && st[0] === 0 && st.at(-1) === 4) parts.push(P('the iodine portions are blue-black at first, then purple and red-brown, and finally stay yellow-brown', ['blue'], ['brown', 'yellow', 'no blue', 'no longer', 'disappear']));
        else if (c.starch > 0 && st[0]! <= 1) parts.push(P(`the iodine portions are still ${ORG_IODINE_NAME[st.at(-1)!]} (the starch is not yet all hydrolysed)`, ['blue', 'purple', 'brown', 'black']));
        else if (c.starch > 0) parts.push(P('the iodine portions stay yellow-brown', ['brown', 'yellow', 'no blue']));
        else parts.push(P('the iodine portions stay yellow-brown (no starch)', ['brown', 'yellow', 'no blue', 'no change', 'remain']));
      }
      if (has(t, 'NEUTRALISE')) {
        parts.push(P('effervescence as the sodium hydrogencarbonate neutralises the acid', ['efferves', 'fizz', 'bubbl', 'gas']));
        vis.bubbles = !has(t, 'BENEDICT');
      }
      complete = has(t, 'ACID') && has(t, 'NEUTRALISE') && has(t, 'BENEDICT') && before(t, 'ACID', 'NEUTRALISE') && before(t, 'NEUTRALISE', 'BENEDICT');
      if (!has(t, 'BENEDICT')) {
        if (!has(t, 'NEUTRALISE') && !t.portions.length) parts.push(P(has(t, 'ACID') ? (t.boil > 0 ? 'no visible change on boiling with the acid' : 'acid added: no visible change') : 'the sample is in the tube', ['no change', 'no visible', 'nothing', 'clear', 'colourless', 'remain', 'cloudy']));
        vis.liquid = c.look.hex;
        complete = false;
        break;
      }
      const works = !(has(t, 'ACID') && !before(t, 'NEUTRALISE', 'BENEDICT'));
      const x = works ? benedictIndex(h.reducing, t.heat, t.direct) : 0;
      const stage = benedictStage(x);
      vis.benedict = x;
      vis.liquid = benedictColour(x);
      vis.ppt = stage >= 2 ? mixColour(benedictColour(x), '#3a1a10', 0.12) : null;
      parts.push(...benParts(stage, t.heat > 0));
      positive = stage > 0;
      if (t.heat <= 0 || (!positive && t.heat < 60) || (!positive && t.boil < ORG_BOIL_MIN)) complete = false;
      break;
    }
    case 'BIURET': {
      complete = has(t, 'NAOH') && t.drops > 0 && t.drops <= BIURET_MAX_DROPS;
      if (!t.drops) {
        parts.push(P(has(t, 'NAOH') ? 'no colour change with sodium hydroxide alone' : 'the sample is in the tube', ['no change', 'no colour', 'colourless', 'nothing', 'remain', 'no visible', 'cloudy']));
        complete = false;
        break;
      }
      if (!has(t, 'NAOH')) {
        parts.push(P('a pale blue colour (no violet)', ['blue']));
        vis.liquid = ORG_COL.biuretBlue;
        complete = false;
        break;
      }
      positive = c.protein;
      if (t.drops > BIURET_MAX_DROPS) {
        parts.push(P('a deep blue colour: the excess copper(II) sulphate masks any violet', ['blue']));
        vis.liquid = positive ? mixColour(ORG_COL.deepBlue, ORG_COL.violet, 0.25) : ORG_COL.deepBlue;
        break;
      }
      if (positive) {
        parts.push(Pn('a violet (purple) colour forms', ['remain', 'stays blue', 'no violet', 'no purple', 'no change'], ['violet', 'purple', 'lilac', 'mauve']));
        vis.liquid = ORG_COL.violet;
      } else {
        parts.push(Pn('the solution remains blue (no violet colour)', ['turns violet', 'turned violet', 'turns purple', 'turned purple'], ['blue', 'no violet', 'no purple', 'no change', 'remain']));
        vis.liquid = ORG_COL.biuretBlue;
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
      vis.ppt = ORG_COL.white;
      if (t.heat >= 30) {
        parts.push(Pn('on warming, the precipitate turns brick-red', ['no red', 'not red', 'remains white', 'stays white'], ['red', 'brick', 'pink']));
        vis.ppt = mixColour(ORG_COL.white, ORG_COL.millonRed, Math.min(1, t.heat / 60));
      } else complete = false;
      break;
    }
    case 'XANTHO': {
      positive = c.protein;
      complete = has(t, 'HNO3') && t.heat >= 30;
      if (!has(t, 'HNO3')) {
        parts.push(P('the sample is in the tube', ['no change', 'clear', 'cloudy', 'nothing']));
        complete = false;
        break;
      }
      if (!positive) {
        parts.push(Pn('no yellow colour, even on warming', ['turns yellow', 'turned yellow'], ['no yellow', 'no change', 'colourless', 'remain', 'no colour', 'nothing']));
        if (has(t, 'NH3')) parts.push(P('no orange colour with ammonia', ['no orange', 'no change', 'colourless', 'remain', 'no colour']));
        vis.liquid = ORG_COL.water;
        break;
      }
      parts.push(P('a white precipitate forms with the acid', ['white'], PPT));
      vis.ppt = ORG_COL.white;
      if (t.heat >= 30) {
        parts.push(Pn('on warming, it turns yellow', ['no yellow'], ['yellow']));
        vis.ppt = ORG_COL.yellow;
        vis.liquid = mixColour(ORG_COL.water, ORG_COL.yellow, 0.5);
        if (has(t, 'NH3')) {
          parts.push(Pn('with ammonia solution the yellow turns orange', ['no orange'], ['orange']));
          vis.ppt = ORG_COL.orange;
          vis.liquid = mixColour(ORG_COL.water, ORG_COL.orange, 0.5);
        }
      }
      break;
    }
    case 'NINHYDRIN': {
      positive = c.protein && t.heat >= 30;
      if (t.heat <= 0) {
        parts.push(P('not warmed yet: no colour', ['no colour', 'colourless', 'no change', 'nothing']));
        complete = false;
      } else if (positive) {
        parts.push(Pn('on warming, a blue-violet colour forms', ['no blue', 'no violet', 'no colour'], ['blue', 'violet', 'purple']));
        vis.liquid = ORG_COL.ninhydrin;
      } else {
        parts.push(Pn('no blue-violet colour, even on warming', ['turns blue', 'turns violet', 'turns purple'], ['no blue', 'no violet', 'no purple', 'no colour', 'colourless', 'no change', 'remain']));
        vis.liquid = ORG_COL.ninhydrinPale;
      }
      if (!positive && t.heat < ORG_WARM_MIN) complete = false;
      break;
    }
    case 'COAGULATE': {
      positive = c.coag === 'SOLID' || c.coag === 'FLOC';
      if (t.heat < 60) {
        parts.push(P(t.heat > 0 ? 'warming: no change yet' : 'not heated yet', ['no change', 'nothing', 'not', 'cloudy', 'liquid']));
        complete = false;
        break;
      }
      if (c.coag === 'SOLID') {
        parts.push(Pn('a white solid forms: the egg white sets (coagulates)', ['no solid', 'no coagul', 'not coagul', 'remains liquid'], ['white'], ['solid', 'coagul', 'clot', 'set', 'curd', 'precipitate', 'opaque']));
        vis.coag = true;
        vis.liquid = ORG_COL.white;
      } else if (c.coag === 'FLOC') {
        parts.push(Pn('it turns cloudier: a little white flocculent precipitate forms', ['no precipitate', 'no change'], ['cloud', 'precipitate', 'floc', 'curd', 'coagul', 'solid', 'clot']));
        vis.ppt = ORG_COL.white;
      } else if (c.coag === 'SKIN') parts.push(Pn('it does not set; only a thin skin forms on the surface', ['sets solid', 'coagulates'], ['skin', 'no coagul', 'not coagul', 'does not set', 'no solid', 'remains liquid', 'no clot']));
      else parts.push(P('no change on heating', ['no change', 'no solid', 'no coagul', 'not coagul', 'remain', 'nothing', 'no precipitate', 'clear']));
      break;
    }
  }
  if (t.direct && ORG_TEST_INFO[t.test].task === 'GROUPS') vis.layer = vis.layer ?? null;
  return { parts, visual: vis, complete, positive };
}

export const orgObserve = (v: ChemOrganicVariant, t: OrgTest) => orgObserveContent(t, orgSampleContent(v, t.sample));

// ------------------------------------------------------------------ inference key

export interface OrgInferenceKey {
  complete: boolean;
  needPresent: OrgClaim[];
  /** At least one of these stated present (e.g. sodium: an –OH, in an alkanol or an acid). */
  needAny: OrgClaim[];
  needAbsent: OrgClaim[];
  allowPresent: OrgClaim[];
  allowAbsent: OrgClaim[];
}
const key = (needPresent: OrgClaim[], needAbsent: OrgClaim[], allowPresent: OrgClaim[] = needPresent, allowAbsent: OrgClaim[] = needAbsent, needAny: OrgClaim[] = []): OrgInferenceKey => ({ complete: true, needPresent, needAbsent, allowPresent, allowAbsent, needAny });

/** What a test's result allows the student to infer. */
export function orgInferenceKey(v: ChemOrganicVariant, t: OrgTest): OrgInferenceKey {
  const o = orgObserve(v, t);
  const c = orgSampleContent(v, t.sample);
  if (!o.complete) return { ...key([], []), complete: false };
  switch (t.test) {
    case 'BROMINE':
      return o.positive ? key(['CC'], []) : key([], ['CC']);
    case 'KMNO4':
      return o.positive ? key(['CC'], []) : c.kind === 'ALKANOL' ? key([], ['CC'], ['OH'], ['CC']) : key([], ['CC']);
    case 'DICHROMATE':
      return o.positive ? key(['OH'], []) : key([], ['OH']);
    case 'SODIUM':
      return o.positive ? key([], [], ['OH', 'COOH'], [], ['OH', 'COOH']) : key([], ['OH'], [], ['OH', 'COOH']);
    case 'NAHCO3':
      return o.positive ? key(['COOH'], []) : key([], ['COOH']);
    case 'ESTER': {
      const acidPartner = t.steps.includes('ACID_PARTNER');
      const g: OrgClaim = acidPartner ? 'OH' : 'COOH';
      return o.positive ? key([g], [], [g]) : key([], [g]);
    }
    case 'BENEDICT':
    case 'FEHLING':
      return o.positive ? key(['REDUCING'], []) : key([], ['REDUCING']);
    case 'IODINE':
      return o.positive ? key(['STARCH'], []) : key([], ['STARCH']);
    case 'HYDROLYSIS': {
      const direct = benedictStage(benedictFinal(c.reducing));
      const after = benedictStage(benedictIndex(orgHydrolysed(c, t.boil).reducing, t.heat, t.direct));
      // Starch is a non-reducing carbohydrate too: hydrolysis of a starchy sample may show either.
      const nr: OrgClaim[] = c.starch > 0 ? ['STARCH', 'NONREDUCING'] : ['NONREDUCING'];
      if (direct === 0) return o.positive ? { ...key([], [], nr, ['REDUCING']), needAny: nr } : key([], ['NONREDUCING'], [], ['NONREDUCING', 'REDUCING', 'STARCH']);
      if (after > direct) return { ...key([], [], [...nr, 'REDUCING'], []), needAny: nr };
      if (direct >= 4) return key([], [], ['REDUCING'], []);
      return key([], ['NONREDUCING'], ['REDUCING'], ['NONREDUCING']);
    }
    case 'BIURET':
    case 'MILLON':
    case 'XANTHO':
    case 'NINHYDRIN':
      return o.positive ? key(['PROTEIN'], []) : key([], ['PROTEIN']);
    case 'COAGULATE':
      // A clot shows a heat-coagulable protein; no clot does not rule protein out (milk does not set).
      return o.positive ? key(['DENATURED'], [], ['DENATURED', 'PROTEIN']) : key([], ['DENATURED']);
  }
}

// ------------------------------------------------------------------ texts

const mins = (sec: number) => {
  const m = Math.floor(sec / 60);
  const r = Math.round(sec % 60);
  return m && r ? `${m} min ${r} s` : m ? `${m} min` : `${r} s`;
};
/** The TEST column for a test (what was done). */
export function orgTestText(t: OrgTest): string {
  const n = orgSampleName(t.sample);
  const bath = (verb: string) => (t.heat > 0 ? (t.direct ? `heated directly over the flame for ${mins(t.heat)}` : `${verb} in the water bath for ${mins(t.heat)}`) : `not ${verb}`);
  switch (t.test) {
    case 'BROMINE':
      return `${n} + bromine water, shaken`;
    case 'KMNO4':
      return `${n} + acidified KMnO₄, shaken`;
    case 'DICHROMATE':
      return `${n} + acidified K₂Cr₂O₇; ${bath('warmed')}`;
    case 'SODIUM':
      return `${n} + a tiny piece of sodium (teacher)${has(t, 'SPLINT') ? '; gas tested with a burning splint' : ''}`;
    case 'NAHCO3':
      return `${n} + solid NaHCO₃${has(t, 'LIMEWATER') ? '; gas passed into lime water' : ''}`;
    case 'ESTER': {
      const partner = has(t, 'ACID_PARTNER') ? 'ethanoic acid' : has(t, 'ETHANOL_PARTNER') ? 'ethanol' : 'no partner';
      return `${n} + ${partner}${has(t, 'H2SO4') ? ' + conc. H₂SO₄' : ' (no catalyst)'}; ${bath('warmed')}${has(t, 'POUR') ? '; poured into water and smelt (wafted)' : ''}`;
    }
    case 'BENEDICT':
      return `2 cm³ of ${n} + 2 cm³ Benedict's solution; ${bath('heated')}`;
    case 'FEHLING':
      return `2 cm³ of ${n} + Fehling's A and B; ${bath('heated')}`;
    case 'IODINE':
      return `${n} + 2 drops of iodine solution${t.heat > 0 ? ' (then heated)' : ''}`;
    case 'HYDROLYSIS': {
      const bits = [has(t, 'ACID') ? `boiled with dilute HCl for ${mins(t.boil)}` : 'not boiled with acid', t.portions.length ? `iodine portions at ${t.portions.map((x) => mins(x)).join(', ')}` : '', has(t, 'NEUTRALISE') ? 'neutralised with NaHCO₃' : 'not neutralised', has(t, 'BENEDICT') ? `Benedict's added${before(t, 'NEUTRALISE', 'BENEDICT') ? '' : ' before neutralising'}; ${bath('heated')}` : "no Benedict's yet"].filter(Boolean);
      return `${n}: ${bits.join(', ')}`;
    }
    case 'BIURET':
      return `2 cm³ of ${n} + ${has(t, 'NAOH') ? '2 cm³ NaOH(aq)' : 'no NaOH'}${t.drops ? `, then ${t.drops} drop${t.drops === 1 ? '' : 's'} of 1% CuSO₄, shaken` : ''}`;
    case 'MILLON':
      return `${n} + Millon's reagent (teacher); ${bath('warmed')}`;
    case 'XANTHO':
      return `${n} + conc. HNO₃ (teacher)${has(t, 'HNO3') ? '' : ' — not added yet'}; ${bath('warmed')}${has(t, 'NH3') ? '; cooled, NH₃(aq) added' : ''}`;
    case 'NINHYDRIN':
      return `${n} + ninhydrin solution; ${bath('warmed')}`;
    case 'COAGULATE':
      return `${n} ${bath('heated')}`;
  }
}

// ------------------------------------------------------------------ calculations

export interface OrgCalcAnswer {
  /** [a, b, c]: the values expected (null: not asked). */
  values: [number, number, number | null];
  labels: [string, string, string | null];
  units: [string, string, string | null];
}
export function orgCalcAnswer(v: ChemOrganicVariant): OrgCalcAnswer {
  const c = v.calc;
  if (v.task === 'GROUPS') {
    const mol = c.acidMass / 60;
    const max = mol * 88;
    return { values: [roundDp(mol, 4), roundDp(max, 2), roundDp((c.esterMass / max) * 100, 1)], labels: ['Moles of ethanoic acid', 'Maximum mass of ethyl ethanoate', 'Percentage yield'], units: ['mol', 'g', '%'] };
  }
  if (v.task === 'CARBS') {
    const mol = c.glucoseMass / 180;
    return { values: [roundDp(mol, 5), roundDp(mol / (c.glucoseVol / 1000), 4), null], labels: ['Moles of glucose', 'Concentration of the solution', null], units: ['mol', 'mol dm⁻³', null] };
  }
  const a = ORG_AMINO[c.amino]!;
  return { values: [a.M, roundDp(((14 * a.n) / a.M) * 100, 1), null], labels: ['Relative molecular mass, M', 'Percentage of nitrogen', null], units: ['', '%', null] };
}
/** The calculation's question for this attempt. */
export function orgCalcQuestion(v: ChemOrganicVariant): string {
  const c = v.calc;
  if (v.task === 'GROUPS') return `${c.acidMass.toFixed(1)} g of ethanoic acid (CH₃COOH, M = 60) was warmed with excess ethanol and a few drops of conc. H₂SO₄; ${c.esterMass.toFixed(2)} g of ethyl ethanoate (M = 88) was obtained. CH₃COOH + C₂H₅OH ⇌ CH₃COOC₂H₅ + H₂O. Work out the moles of acid, the maximum mass of ester and the percentage yield.`;
  if (v.task === 'CARBS') return `The glucose test solution was made by dissolving ${c.glucoseMass.toFixed(2)} g of glucose (C₆H₁₂O₆, M = 180) in water and making it up to ${c.glucoseVol} cm³. Work out the moles of glucose and the concentration in mol dm⁻³.`;
  const a = ORG_AMINO[c.amino]!;
  return `Proteins are polymers of amino acids. For ${a.name}, ${a.formula}, work out the relative molecular mass (H = 1, C = 12, N = 14, O = 16) and the percentage by mass of nitrogen.`;
}

// ------------------------------------------------------------------ soap

export interface SoapRun {
  oil: boolean;
  naoh: boolean;
  /** Water in the mixture (cm³). */
  water: number;
  boiled: number;
  stirred: number;
  /** Unstirred boiling events (the mixture spat). */
  spat: number;
  charred: boolean;
  extent: number;
  watered: number;
  brine: boolean;
  /** Brine added before any boiling (or before saponification got going). */
  brineEarly: boolean;
  separated: boolean;
  cooled: boolean;
  filtered: boolean;
  washed: boolean;
  dried: boolean;
  oilWeighed: boolean;
  /** The balance's reading of the soap at the last weighing (g), null if not weighed. */
  soapMass: number | null;
  /** What the soap weighs now (g). */
  massNow: number;
  soft: boolean;
  hard: boolean;
  theory: number;
}
/** Soap from fat: oil ÷ 806 × 3 × 278 (glyceryl tripalmitate → sodium palmitate). */
export const soapTheory = (oilMass: number) => roundDp(((oilMass / 806) * 3 * 278), 2);
/** Water in 20 cm³ of 20% NaOH (cm³). */
export const SOAP_NAOH_WATER = 16;
/** Below this the mixture boils dry and chars (cm³). */
export const SOAP_DRY = 5;

/** Plays the soap events forward (pure: the web shows it and the API marks it). */
export function soapRun(v: ChemOrganicVariant, events: SoapEvent[]): SoapRun {
  const sv = v.soap;
  const r: SoapRun = { oil: false, naoh: false, water: 0, boiled: 0, stirred: 0, spat: 0, charred: false, extent: 0, watered: 0, brine: false, brineEarly: false, separated: false, cooled: false, filtered: false, washed: false, dried: false, oilWeighed: false, soapMass: null, massNow: 0, soft: false, hard: false, theory: soapTheory(sv.oilMass) };
  let eff = 0;
  const mass = () => {
    if (!r.filtered) return 0;
    const rec = r.brine && !r.brineEarly ? sv.recovery : 0.3;
    let m = r.theory * r.extent * rec + (1 - r.extent) * sv.oilMass * 0.55;
    if (!r.washed) m += 0.05 * r.theory;
    if (!r.dried) m *= 1.14;
    if (r.charred) m *= 0.92;
    return roundDp(m, 2);
  };
  for (const e of events) {
    switch (e.a) {
      case 'OIL':
        r.oil = true;
        break;
      case 'WEIGH_OIL':
        r.oilWeighed = r.oilWeighed || r.oil;
        break;
      case 'NAOH':
        if (!r.naoh) r.water += SOAP_NAOH_WATER;
        r.naoh = true;
        break;
      case 'BOIL':
      case 'BOIL_NOSTIR': {
        if (r.brine || r.filtered) break;
        const sec = e.n;
        r.boiled += sec;
        if (e.a === 'BOIL') r.stirred += sec;
        else r.spat += 1;
        r.water = Math.max(0, r.water - (sv.evap * sec) / 60);
        if (r.naoh && r.water < SOAP_DRY) r.charred = true;
        if (r.oil && r.naoh && !r.charred) eff += e.a === 'BOIL' ? sec : sec / 2.5;
        else if (r.oil && r.naoh) eff += sec / 4;
        r.extent = r.oil && r.naoh ? 1 - Math.exp(-eff / sv.tau) : 0;
        break;
      }
      case 'WATER':
        r.water = Math.min(60, r.water + e.n);
        r.watered += e.n;
        break;
      case 'BRINE':
        if (!r.brine) r.brineEarly = r.extent < 0.3;
        r.brine = true;
        r.separated = r.extent >= 0.3;
        break;
      case 'COOL':
        r.cooled = true;
        break;
      case 'FILTER':
        r.filtered = r.oil && r.naoh && r.boiled > 0;
        break;
      case 'WASH':
        r.washed = r.washed || r.filtered;
        break;
      case 'DRY':
        r.dried = r.dried || r.filtered;
        break;
      case 'WEIGH_SOAP':
        if (r.filtered) r.soapMass = mass();
        break;
      case 'LATHER_SOFT':
        r.soft = r.soft || r.filtered;
        break;
      case 'LATHER_HARD':
        r.hard = r.hard || r.filtered;
        break;
    }
  }
  r.massNow = mass();
  return r;
}
/** Saponification counts as finished from this extent. */
export const SOAP_DONE = 0.85;

/** What each soap row shows, as observation parts. */
export function soapParts(v: ChemOrganicVariant, events: SoapEvent[], row: SoapRow): OrgPart[] {
  const r = soapRun(v, events);
  const out: OrgPart[] = [];
  if (row === 'BOIL') {
    if (!r.boiled || !r.oil || !r.naoh) return [];
    if (r.extent >= 0.6) out.push(Pn('the mixture becomes thick and creamy (a smooth paste)', ['oily layer', 'two layers'], ['thick', 'cream', 'paste', 'viscous', 'smooth', 'homogen', 'porridge']));
    else out.push(P('an oily layer still floats on the alkali (not yet saponified)', ['oil', 'layer', 'float', 'separate', 'two layers']));
    if (r.spat) out.push(P('unstirred, the mixture spits and froths up', ['spit', 'spurt', 'splash', 'bump', 'froth', 'foam']));
    if (r.charred) out.push(P('it boils dry: it darkens and smells burnt', ['burn', 'brown', 'dark', 'char', 'black', 'scorch']));
  } else if (row === 'BRINE') {
    if (!r.brine) return [];
    if (r.separated) out.push(P('a solid layer of soap separates and floats on top of the brine', ['solid', 'soap', 'curd', 'layer', 'separat', 'precipitat', 'lump'], ['top', 'float', 'surface', 'above', 'upper']));
    else out.push(P('little solid separates: oily drops float on the brine', ['oil', 'drop', 'little', 'no solid', 'float']));
  } else if (row === 'SOFT') {
    if (!r.soft) return [];
    out.push(Pn('a lot of lather (foam) forms easily', ['no lather', 'little lather', 'scum', 'hardly'], ['lather', 'foam', 'froth', 'sud', 'bubbl']));
  } else {
    if (!r.hard) return [];
    out.push(Pn('a white scum (curdy precipitate) forms', ['no scum'], ['scum', 'curd', 'precipitate', 'white solid', 'insoluble', 'cloudy', 'turbid', 'milky']));
    out.push(Pn('little lather forms', ['a lot of lather', 'much lather', 'lathers easily', 'lathers freely'], ['little', 'no lather', 'less', 'poor', 'hardly', 'not lather', 'small', 'few', 'does not lather', "doesn't lather"]));
  }
  return out;
}
export interface SoapKey {
  need: SoapClaim[];
  allow: SoapClaim[];
}
export function soapKey(v: ChemOrganicVariant, events: SoapEvent[], row: SoapRow): SoapKey | null {
  const r = soapRun(v, events);
  if (!soapParts(v, events, row).length) return null;
  if (row === 'BOIL') return r.extent >= SOAP_DONE ? { need: ['SAPONIFIED'], allow: ['SAPONIFIED'] } : { need: ['INCOMPLETE'], allow: ['INCOMPLETE', 'SAPONIFIED'] };
  if (row === 'BRINE') return r.separated ? { need: ['SALTED_OUT'], allow: ['SALTED_OUT', 'SAPONIFIED'] } : { need: ['INCOMPLETE'], allow: ['INCOMPLETE'] };
  if (row === 'SOFT') return { need: ['LATHER'], allow: ['LATHER'] };
  return { need: ['SCUM'], allow: ['SCUM'] };
}

// ------------------------------------------------------------------ model answers

const T = (sample: OrgSample, test: OrgTestId, steps: OrgStep[] = [], heat = 0, extra: Partial<OrgTest> = {}): OrgTest => ({ sample, test, steps, heat, direct: false, boil: 0, portions: [], drops: 0, ...extra });

/** The tests a model WAEC candidate does (the worked solution, the demo, the tests). */
export function orgModelTests(v: ChemOrganicVariant): OrgTest[] {
  const out: OrgTest[] = [];
  if (v.task === 'GROUPS') {
    for (const sm of v.samples) {
      out.push(T(sm.letter, 'BROMINE'));
      out.push(T(sm.letter, 'DICHROMATE', [], 120));
      out.push(T(sm.letter, 'NAHCO3', ['LIMEWATER']));
    }
    const alc = v.samples.find((s) => s.content.kind === 'ALKANOL')!;
    out.push(T(alc.letter, 'ESTER', ['ACID_PARTNER', 'H2SO4', 'POUR'], 120));
    out.push(T(alc.letter, 'SODIUM', ['SPLINT']));
  } else if (v.task === 'CARBS') {
    for (const sm of v.samples) {
      out.push(T(sm.letter, 'IODINE'));
      out.push(T(sm.letter, 'BENEDICT', [], 300));
      if (benedictStage(benedictFinal(sm.content.reducing)) === 0) out.push(T(sm.letter, 'HYDROLYSIS', ['ACID', 'NEUTRALISE', 'BENEDICT'], 300, { boil: 600, portions: sm.content.starch > 0 ? [0, 120, 240, 360, 480, 600] : [] }));
    }
  } else if (v.task === 'PROTEINS') {
    for (const sm of v.samples) {
      out.push(T(sm.letter, 'BIURET', ['NAOH', 'CUSO4'], 0, { drops: 2 }));
      if (sm.letter === 'H2O') continue;
      out.push(T(sm.letter, 'XANTHO', ['HNO3', 'NH3'], 60));
      out.push(T(sm.letter, 'COAGULATE', [], 180));
    }
  }
  return out;
}
/** The record a model candidate writes for a test. */
export function orgIdealRecord(v: ChemOrganicVariant, t: OrgTest): OrgRecord {
  const k = orgInferenceKey(v, t);
  const o = orgObserve(v, t);
  const present = [...k.needPresent, ...(k.needAny.length && !k.needPresent.some((x) => k.needAny.includes(x)) ? [k.needAny[0]!] : [])];
  return { observation: o.parts.map((p) => p.text).join('; '), present, absent: [...k.needAbsent], note: '' };
}
/** A model soap run: 10 cm³ oil weighed, 20 cm³ NaOH, 18 min boiling with stirring and water topped up, brine, cool, filter, wash, dry, weigh, lather. */
export function soapModelEvents(): SoapEvent[] {
  const e: SoapEvent[] = [{ a: 'OIL', n: 0 }, { a: 'WEIGH_OIL', n: 0 }, { a: 'NAOH', n: 0 }];
  for (let m = 0; m < 18; m++) {
    e.push({ a: 'BOIL', n: 60 });
    if (m % 4 === 3) e.push({ a: 'WATER', n: 5 });
  }
  e.push({ a: 'BRINE', n: 0 }, { a: 'COOL', n: 0 }, { a: 'FILTER', n: 0 }, { a: 'WASH', n: 0 }, { a: 'DRY', n: 0 }, { a: 'WEIGH_SOAP', n: 0 }, { a: 'LATHER_SOFT', n: 0 }, { a: 'LATHER_HARD', n: 0 });
  return e;
}
/** A complete model state for a task (the tests, the demo's ending, the solution). */
export function orgModelState(v: ChemOrganicVariant): ChemOrganicState {
  const s = emptyChemOrganicState();
  s.task = v.task;
  if (v.task === 'SOAP') {
    s.soap = soapModelEvents();
    const r = soapRun(v, s.soap);
    for (const row of SOAP_ROWS) s.soapRows[row] = { observation: soapParts(v, s.soap, row).map((p) => p.text).join('; '), claims: [...(soapKey(v, s.soap, row)?.need ?? [])] };
    s.readings = { oil: v.soap.oilMass.toFixed(2), soap: (r.soapMass ?? 0).toFixed(2), theory: r.theory.toFixed(2), yield: (((r.soapMass ?? 0) / r.theory) * 100).toFixed(1), byproduct: 'glycerol' };
    return s;
  }
  s.tests = orgModelTests(v);
  s.table = s.tests.map((t) => orgIdealRecord(v, t));
  for (const sm of v.samples) if (sm.letter !== 'H2O') s.conclusion[sm.letter] = orgTruth(v.task, sm.content);
  const a = orgCalcAnswer(v);
  s.calc = { a: String(a.values[0]), b: String(a.values[1]), c: a.values[2] === null ? '' : String(a.values[2]) };
  return s;
}
