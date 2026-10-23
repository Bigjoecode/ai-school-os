import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { labPick, labRandom } from './seeded';

/**
 * chem-qualitative: WAEC qualitative analysis. The student is given C, a single
 * salt or a mixture of a soluble salt and an insoluble trioxocarbonate(IV),
 * chooses tests from a reagent shelf (on the solid, its solution, the filtrate
 * or the residue), tests any gas given off, and fills a TEST | OBSERVATION |
 * INFERENCE table before naming the ions and writing an ionic equation. The
 * chemistry below is the one source of truth: the web shows these outcomes and
 * the API marks against them. It also covers the effect of heat on salts
 * (gases given off, residues hot and cold, water of crystallisation).
 */

export const QUAL_CATIONS = ['NH4', 'CA', 'PB', 'CU', 'FE2', 'FE3', 'ZN', 'AL', 'NA', 'K'] as const;
export type QualCation = (typeof QUAL_CATIONS)[number];
export const QUAL_ANIONS = ['CL', 'SO4', 'SO3', 'CO3', 'NO3', 'S'] as const;
export type QualAnion = (typeof QUAL_ANIONS)[number];
export type QualIon = QualCation | QualAnion;
export const QUAL_IONS = [...QUAL_CATIONS, ...QUAL_ANIONS] as const;
export const QUAL_GASES = ['NH3', 'CO2', 'SO2', 'H2S', 'HCL', 'NO2', 'O2', 'H2', 'H2O'] as const;
export type QualGas = (typeof QUAL_GASES)[number];

export const QUAL_ION_LABEL: Record<QualIon, string> = {
  NH4: 'NH₄⁺', CA: 'Ca²⁺', PB: 'Pb²⁺', CU: 'Cu²⁺', FE2: 'Fe²⁺', FE3: 'Fe³⁺', ZN: 'Zn²⁺', AL: 'Al³⁺', NA: 'Na⁺', K: 'K⁺',
  CL: 'Cl⁻', SO4: 'SO₄²⁻', SO3: 'SO₃²⁻', CO3: 'CO₃²⁻', NO3: 'NO₃⁻', S: 'S²⁻',
};
export const QUAL_GAS_LABEL: Record<QualGas, string> = { NH3: 'NH₃', CO2: 'CO₂', SO2: 'SO₂', H2S: 'H₂S', HCL: 'HCl', NO2: 'NO₂', O2: 'O₂', H2: 'H₂', H2O: 'H₂O (water vapour)' };

/** Where a test is done. Solid-type samples take solid tests; the others are solutions. */
export const QUAL_SAMPLES = ['SOLID', 'SOLUTION', 'FILTRATE', 'RESIDUE', 'RESIDUE_SOLN'] as const;
export type QualSample = (typeof QUAL_SAMPLES)[number];
export const QUAL_SAMPLE_LABEL: Record<QualSample, string> = { SOLID: 'C (solid)', SOLUTION: 'Solution of C', FILTRATE: 'Filtrate', RESIDUE: 'Residue', RESIDUE_SOLN: 'Residue in dil. HNO₃' };
export const isSolidSample = (s: QualSample) => s === 'SOLID' || s === 'RESIDUE';

export const QUAL_REAGENTS = [
  'WATER', 'DIL_HNO3', 'HEAT', 'FLAME', 'DIL_HCL', 'CONC_H2SO4', 'CONC_H2SO4_CU', 'NAOH_WARM', 'DEVARDA',
  'NAOH', 'NH3', 'AGNO3', 'BACL2', 'KMNO4', 'K2CR2O7', 'BROWN_RING', 'KI', 'KSCN', 'OXALATE', 'LITMUS',
] as const;
export type QualReagent = (typeof QUAL_REAGENTS)[number];
/** Follow-up additions to the same test tube. */
export const QUAL_STEPS = ['EXCESS', 'WARM', 'ADD_HCL', 'ADD_NH3'] as const;
export type QualStep = (typeof QUAL_STEPS)[number];
export const QUAL_GAS_TESTS = ['LIME_WATER', 'RED_LITMUS', 'BLUE_LITMUS', 'GLOWING_SPLINT', 'BURNING_SPLINT', 'DICHROMATE', 'PERMANGANATE', 'LEAD_ACETATE', 'HCL_ROD', 'NH3_ROD', 'COBALT_PAPER'] as const;
export type QualGasTest = (typeof QUAL_GAS_TESTS)[number];

export interface QualReagentInfo {
  /** On the shelf. */
  label: string;
  on: 'SOLID' | 'SOLUTION' | 'BOTH';
  steps: { id: QualStep; label: string }[];
  /** A gas may be given off (gas tests are offered). */
  gas: boolean;
}
export const QUAL_REAGENT_INFO: Record<QualReagent, QualReagentInfo> = {
  WATER: { label: 'Distilled water (shake; filter if needed)', on: 'SOLID', steps: [], gas: false },
  DIL_HNO3: { label: 'Dissolve in dilute HNO₃', on: 'SOLID', steps: [], gas: true },
  HEAT: { label: 'Heat in a dry test tube', on: 'SOLID', steps: [], gas: true },
  FLAME: { label: 'Flame test', on: 'SOLID', steps: [], gas: false },
  DIL_HCL: { label: 'Dilute HCl', on: 'BOTH', steps: [{ id: 'WARM', label: 'Warm' }], gas: true },
  CONC_H2SO4: { label: 'Conc. H₂SO₄, warm', on: 'SOLID', steps: [], gas: true },
  CONC_H2SO4_CU: { label: 'Cu turnings + conc. H₂SO₄, warm', on: 'SOLID', steps: [], gas: true },
  NAOH_WARM: { label: 'NaOH(aq), warm', on: 'SOLID', steps: [], gas: true },
  DEVARDA: { label: "NaOH(aq) + Devarda's alloy, warm", on: 'BOTH', steps: [], gas: true },
  NAOH: { label: 'NaOH(aq) dropwise', on: 'SOLUTION', steps: [{ id: 'EXCESS', label: 'Add NaOH(aq) in excess' }, { id: 'WARM', label: 'Warm the mixture' }], gas: true },
  NH3: { label: 'NH₃(aq) dropwise', on: 'SOLUTION', steps: [{ id: 'EXCESS', label: 'Add NH₃(aq) in excess' }], gas: false },
  AGNO3: { label: 'Dil. HNO₃ then AgNO₃(aq)', on: 'SOLUTION', steps: [{ id: 'ADD_NH3', label: 'Add NH₃(aq) in excess' }], gas: true },
  BACL2: { label: 'BaCl₂(aq)', on: 'SOLUTION', steps: [{ id: 'ADD_HCL', label: 'Add dilute HCl' }], gas: true },
  KMNO4: { label: 'Acidified KMnO₄(aq)', on: 'SOLUTION', steps: [], gas: false },
  K2CR2O7: { label: 'Acidified K₂Cr₂O₇(aq)', on: 'SOLUTION', steps: [], gas: false },
  BROWN_RING: { label: 'Brown-ring test (FeSO₄ + conc. H₂SO₄)', on: 'SOLUTION', steps: [], gas: false },
  KI: { label: 'KI(aq)', on: 'SOLUTION', steps: [], gas: false },
  KSCN: { label: 'KSCN(aq)', on: 'SOLUTION', steps: [], gas: false },
  OXALATE: { label: '(NH₄)₂C₂O₄(aq)', on: 'SOLUTION', steps: [], gas: false },
  LITMUS: { label: 'Red and blue litmus paper', on: 'SOLUTION', steps: [], gas: false },
};
export const QUAL_GAS_TEST_LABEL: Record<QualGasTest, string> = {
  LIME_WATER: 'Lime water',
  RED_LITMUS: 'Damp red litmus',
  BLUE_LITMUS: 'Damp blue litmus',
  GLOWING_SPLINT: 'Glowing splint',
  BURNING_SPLINT: 'Burning splint',
  DICHROMATE: 'Acidified K₂Cr₂O₇ paper',
  PERMANGANATE: 'Acidified KMnO₄ paper',
  LEAD_ACETATE: 'Lead(II) ethanoate paper',
  HCL_ROD: 'Rod dipped in conc. HCl',
  NH3_ROD: 'Rod dipped in conc. NH₃',
  COBALT_PAPER: 'Cobalt(II) chloride paper',
};
/** The test that confirms each gas (WAEC's standard ones). */
export const QUAL_GAS_CONFIRM: Record<QualGas, QualGasTest[]> = {
  CO2: ['LIME_WATER'],
  NH3: ['RED_LITMUS', 'HCL_ROD'],
  SO2: ['DICHROMATE', 'PERMANGANATE'],
  H2S: ['LEAD_ACETATE'],
  HCL: ['NH3_ROD', 'BLUE_LITMUS'],
  NO2: ['BLUE_LITMUS'],
  O2: ['GLOWING_SPLINT'],
  H2: ['BURNING_SPLINT'],
  H2O: ['COBALT_PAPER'],
};

// ------------------------------------------------------------------ observations

/** One observable fact: its text, and keyword groups a written observation must contain (any word of each group; `not` words spoil it). */
export interface QualPart {
  text: string;
  kw: string[][];
  not?: string[];
}
export interface QualVisual {
  /** Liquid in the tube (null: dry solid). */
  liquid: string | null;
  ppt: string | null;
  /** Solid in a dry tube (heating, solid tests). */
  solid: string | null;
  /** Residue colour when cold (heating), if it differs. */
  solidCold?: string | null;
  bubbles: boolean;
  fumes: string | null;
  ring: string | null;
  flame: string | null;
  deposit: string | null;
  droplets: boolean;
  sublimate: boolean;
  /** Gas-test papers / reagents and the colour they end up. */
  probes: { test: QualGasTest; colour: string; text: string }[];
}
export interface QualOutcome {
  parts: QualPart[];
  gases: QualGas[];
  visual: QualVisual;
}

const PPT = ['precipitate', 'ppt', 'gelatinous', 'suspension', 'solid', 'residue'];
const NO_PPT = ['no precipitate', 'no ppt', 'no visible', 'no change', 'no reaction', 'no observ', 'nothing', 'none', 'no white', 'no colour'];
const DISSOLVES = ['dissolv', 'soluble', 'clear', 'colourless solution', 'colorless solution', 'disappear'];
const DISS_NOT = ['insoluble', 'not dissolv', 'not soluble', 'does not', 'doesn t', 'did not', 'persist', 'no change', 'undissolved'];
const INSOL = ['insoluble', 'not dissolv', 'not soluble', 'persist', 'remain', 'no change', 'undissolved', 'doesn t dissolv', 'does not dissolv', 'did not dissolv', 'stays'];
const NOCHANGE = ['no change', 'no visible', 'no reaction', 'no observ', 'nothing', 'remain', 'stays', 'unchanged', 'no effect', 'none', 'not', 'no gas', 'no efferves'];
const NOGAS = ['no gas', 'no efferves', 'no bubbl', 'no smell', 'no change', 'no visible', 'nothing', 'no reaction', 'none'];
const P = (text: string, ...kw: string[][]): QualPart => ({ text, kw });
const Pn = (text: string, not: string[], ...kw: string[][]): QualPart => ({ text, kw, not });

const COL = {
  white: '#f3f2ec', blue: '#3f7fd0', paleBlue: '#8fc3ea', dirtyGreen: '#6f8f4a', rust: '#9a4a22', yellow: '#f2cf1d', deepBlue: '#2340a8',
  water: '#e6eff8', paleGreen: '#cfe5ae', yellowBrown: '#d39a3c', brown: '#7a4a1c', purple: '#8a2f9e', orange: '#f08a24', green: '#3f9a52',
  milky: '#f1f1ea', red: '#c8343c', litmusBlue: '#4a63c9', black: '#26221f', pink: '#e88fb8', cobaltBlue: '#3b5bd6', bloodRed: '#8f1020',
  brownGas: '#a8562a', misty: '#e8eef2', black2: '#1c1c1c', cream: '#efe6c8', sulphur: '#e9d24a', greenSolid: '#4f9a6b',
};

/** Colour of the cation's aqueous solution. */
function solnColour(c: QualCation | 'NONE'): { name: string; hex: string; kw: string[][] } {
  if (c === 'CU') return { name: 'blue', hex: '#6aaee6', kw: [['blue']] };
  if (c === 'FE2') return { name: 'pale green', hex: COL.paleGreen, kw: [['green']] };
  if (c === 'FE3') return { name: 'yellow-brown', hex: COL.yellowBrown, kw: [['yellow', 'brown', 'orange']] };
  return { name: 'colourless', hex: COL.water, kw: [['colourless', 'colorless', 'clear']] };
}

interface Ppt {
  name: string;
  hex: string;
  kw: string[];
}
const PPT_NAOH: Partial<Record<QualCation, Ppt>> = {
  CA: { name: 'white', hex: COL.white, kw: ['white'] },
  PB: { name: 'white', hex: COL.white, kw: ['white'] },
  ZN: { name: 'white', hex: COL.white, kw: ['white'] },
  AL: { name: 'white', hex: COL.white, kw: ['white'] },
  CU: { name: 'blue gelatinous', hex: COL.blue, kw: ['blue'] },
  FE2: { name: 'dirty-green gelatinous', hex: COL.dirtyGreen, kw: ['green'] },
  FE3: { name: 'reddish-brown gelatinous', hex: COL.rust, kw: ['brown', 'reddish', 'rust'] },
};
const PPT_NH3: Partial<Record<QualCation, Ppt>> = {
  PB: PPT_NAOH.PB!,
  ZN: PPT_NAOH.ZN!,
  AL: PPT_NAOH.AL!,
  CU: { name: 'pale blue', hex: COL.paleBlue, kw: ['blue'] },
  FE2: PPT_NAOH.FE2!,
  FE3: PPT_NAOH.FE3!,
};
const FLAME: Partial<Record<QualCation, { name: string; hex: string; kw: string[] }>> = {
  CA: { name: 'brick-red', hex: '#d2462b', kw: ['brick', 'orange red', 'red'] },
  CU: { name: 'bluish-green', hex: '#2fb59a', kw: ['green'] },
  NA: { name: 'golden-yellow', hex: '#f5b400', kw: ['yellow', 'golden'] },
  K: { name: 'lilac', hex: '#b18be0', kw: ['lilac', 'purple', 'violet', 'pink'] },
  PB: { name: 'pale bluish-white', hex: '#c9d6f0', kw: ['blue', 'white', 'grey', 'gray'] },
};

/** How each gas shows itself when it is given off (smell and colour are noted without a special test). */
function gasPart(g: QualGas, heating: boolean): QualPart | null {
  switch (g) {
    case 'CO2':
      return heating ? P('a colourless, odourless gas is given off', ['gas', 'efferves', 'bubbl', 'evolved']) : P('effervescence: a colourless, odourless gas is given off', ['efferves', 'bubbl', 'fizz', 'gas']);
    case 'SO2':
      return P('a colourless gas with a choking, irritating smell is given off', ['gas', 'fume', 'efferves', 'bubbl'], ['chok', 'irritat', 'pungent', 'sharp', 'suffocat']);
    case 'H2S':
      return P('a colourless gas with a rotten-egg smell is given off', ['gas', 'efferves', 'bubbl', 'fume'], ['rotten', 'bad egg']);
    case 'NH3':
      return P('a colourless gas with a pungent smell is given off', ['gas', 'fume'], ['pungent', 'chok', 'irritat', 'sharp', 'ammonia']);
    case 'HCL':
      return P('misty white fumes with a choking smell are given off', ['fume', 'misty', 'steamy', 'gas']);
    case 'NO2':
      return P('reddish-brown fumes are given off', ['brown']);
    case 'O2':
      return P('a colourless, odourless gas is given off', ['gas', 'bubbl', 'efferves', 'evolved']);
    case 'H2':
      return P('effervescence: a colourless, odourless gas is given off', ['efferves', 'bubbl', 'fizz', 'gas']);
    case 'H2O':
      return P('colourless droplets of liquid condense on the cooler part of the test tube', ['droplet', 'liquid', 'condens', 'water', 'moisture', 'vapour', 'steam']);
  }
}
function gasParts(gases: QualGas[], heating: boolean): QualPart[] {
  const out: QualPart[] = [];
  for (const g of gases) {
    if (g === 'O2' && gases.includes('NO2')) continue; // O2 is hidden in the brown fumes
    if (g === 'H2' && gases.includes('CO2')) continue;
    const p = gasPart(g, heating);
    if (p && !out.some((x) => x.text === p.text)) out.push(p);
  }
  return out;
}

/** The result of a gas test on whatever gases the tube gives off. */
export function qualGasTestResult(t: QualGasTest, gases: QualGas[]): { part: QualPart; colour: string } {
  const has = (g: QualGas) => gases.includes(g);
  const none = (text: string, colour: string): { part: QualPart; colour: string } => ({ part: P(text, NOCHANGE), colour });
  switch (t) {
    case 'LIME_WATER':
      return has('CO2') || has('SO2') ? { part: Pn('lime water turns milky', ['not milky', 'no change', 'remains clear', 'stays clear'], ['milky', 'turbid', 'chalky', 'cloudy', 'white precipitate', 'white ppt']), colour: COL.milky } : none('lime water: no change (stays clear)', COL.water);
    case 'RED_LITMUS':
      return has('NH3') ? { part: Pn(has('HCL') ? 'damp red litmus paper turns blue (then red)' : 'damp red litmus paper turns blue', ['no change'], ['blue']), colour: COL.litmusBlue } : none('damp red litmus paper: no change', COL.red);
    case 'BLUE_LITMUS':
      if (has('HCL') || has('SO2') || has('NO2') || has('H2S')) return { part: Pn('damp blue litmus paper turns red', ['no change'], ['red', 'pink']), colour: COL.red };
      if (has('CO2')) return { part: Pn('damp blue litmus paper turns faintly red', ['no change'], ['red', 'pink']), colour: '#b0607e' };
      return none('damp blue litmus paper: no change', COL.litmusBlue);
    case 'GLOWING_SPLINT':
      return has('O2') ? { part: Pn('the glowing splint is rekindled (relights)', ['not relight', 'does not', 'doesn t', 'did not', 'no change', 'extinguish', 'goes out', 'went out'], ['relight', 'rekindl', 're light', 'burst', 'glows brighter', 'flame']), colour: '#f59e0b' } : none('the glowing splint is not rekindled (goes out)', '#6b5a4a');
    case 'BURNING_SPLINT':
      if (has('H2')) return { part: Pn('the gas burns with a squeaky "pop"', ['no pop'], ['pop', 'squeak', 'explo']), colour: '#f59e0b' };
      if (has('O2') && !has('NO2')) return { part: P('the splint burns more brightly (no pop)', ['bright', 'no pop', 'more']), colour: '#f59e0b' };
      return gases.length ? none('the burning splint is extinguished (no pop)', '#6b5a4a') : none('the splint keeps burning: no change (no pop)', '#f59e0b');
    case 'DICHROMATE':
      return has('SO2') || has('H2S') ? { part: Pn('acidified K₂Cr₂O₇ paper turns from orange to green', ['no change'], ['green']), colour: COL.green } : none('acidified K₂Cr₂O₇ paper: no change (stays orange)', COL.orange);
    case 'PERMANGANATE':
      return has('SO2') || has('H2S') ? { part: Pn('acidified KMnO₄ paper is decolourised (purple to colourless)', ['no change', 'not decolour'], ['decolour', 'decolor', 'colourless', 'colorless', 'fade', 'bleach', 'discharg']), colour: '#f3eef4' } : none('acidified KMnO₄ paper: no change (stays purple)', COL.purple);
    case 'LEAD_ACETATE':
      return has('H2S') ? { part: Pn('lead(II) ethanoate paper turns black', ['no change'], ['black', 'dark', 'silvery']), colour: COL.black } : none('lead(II) ethanoate paper: no change', '#f4f1e8');
    case 'HCL_ROD':
      return has('NH3') ? { part: Pn('dense white fumes form at the rod', ['no fume', 'no white', 'no change'], ['white fume', 'dense white', 'white smoke', 'white cloud', 'fume']), colour: '#ffffff' } : none('no white fumes at the rod', '#e8eef2');
    case 'NH3_ROD':
      return has('HCL') ? { part: Pn('dense white fumes form at the rod', ['no fume', 'no white', 'no change'], ['white fume', 'dense white', 'white smoke', 'white cloud', 'fume']), colour: '#ffffff' } : none('no white fumes at the rod', '#e8eef2');
    case 'COBALT_PAPER':
      return has('H2O') ? { part: Pn('blue cobalt(II) chloride paper turns pink', ['no change'], ['pink']), colour: COL.pink } : none('cobalt(II) chloride paper: no change (stays blue)', COL.cobaltBlue);
  }
}

// ------------------------------------------------------------------ the salts

export interface QualSalt {
  id: string;
  formula: string;
  name: string;
  cation: QualCation;
  anion: QualAnion;
  soluble: boolean;
  solid: { name: string; hex: string };
  heat: { change: QualPart[]; gases: QualGas[]; hot: string | null; cold: string | null; sublimes?: boolean; implies: QualIon[]; note: string };
}

const S = (id: string, formula: string, name: string, cation: QualCation, anion: QualAnion, soluble: boolean, solid: [string, string], heat: QualSalt['heat']): QualSalt => ({ id, formula, name, cation, anion, soluble, solid: { name: solid[0], hex: solid[1] }, heat });
const NO_HEAT_CHANGE = (hex: string, note: string): QualSalt['heat'] => ({ change: [P('no visible change on heating', NOCHANGE)], gases: [], hot: hex, cold: hex, implies: [], note });

export const QUAL_SALTS: QualSalt[] = [
  S('NH4CL', 'NH₄Cl', 'ammonium chloride', 'NH4', 'CL', true, ['white', COL.white], { change: [P('the white solid disappears from the bottom of the tube and a white sublimate forms on the cooler part', ['sublim', 'white deposit', 'white solid', 'cooler part', 'disappear'])], gases: ['NH3', 'HCL'], hot: null, cold: null, sublimes: true, implies: ['NH4'], note: 'NH₄Cl ⇌ NH₃ + HCl (it sublimes: the gases recombine on the cooler part).' }),
  S('NH42SO4', '(NH₄)₂SO₄', 'ammonium tetraoxosulphate(VI)', 'NH4', 'SO4', true, ['white', COL.white], { change: [P('the white solid melts', ['melt', 'liquid', 'decompos'])], gases: ['NH3'], hot: COL.water, cold: COL.white, implies: ['NH4'], note: 'An ammonium salt gives NH₃ on heating.' }),
  S('NH42CO3', '(NH₄)₂CO₃', 'ammonium trioxocarbonate(IV)', 'NH4', 'CO3', true, ['white', COL.white], { change: [P('the white solid disappears completely, leaving no residue', ['disappear', 'no residue', 'sublim', 'vanish', 'completely'])], gases: ['NH3', 'CO2', 'H2O'], hot: null, cold: null, implies: ['NH4', 'CO3'], note: '(NH₄)₂CO₃ → 2NH₃ + CO₂ + H₂O.' }),
  S('CACL2', 'CaCl₂', 'calcium chloride', 'CA', 'CL', true, ['white', COL.white], NO_HEAT_CHANGE(COL.white, 'CaCl₂ is stable to heat.')),
  S('CANO32', 'Ca(NO₃)₂', 'calcium trioxonitrate(V)', 'CA', 'NO3', true, ['white', COL.white], { change: [P('the solid melts and leaves a white residue', ['white'])], gases: ['NO2', 'O2'], hot: COL.white, cold: COL.white, implies: ['NO3'], note: '2Ca(NO₃)₂ → 2CaO + 4NO₂ + O₂.' }),
  S('PBNO32', 'Pb(NO₃)₂', 'lead(II) trioxonitrate(V)', 'PB', 'NO3', true, ['white crystals', COL.white], { change: [P('the crystals crackle (decrepitate)', ['crackl', 'decrepit', 'spurt', 'crack']), P('the residue is reddish-brown when hot and yellow when cold', ['yellow'], ['brown', 'red', 'orange'])], gases: ['NO2', 'O2'], hot: '#a5481e', cold: COL.yellow, implies: ['NO3', 'PB'], note: '2Pb(NO₃)₂ → 2PbO + 4NO₂ + O₂.' }),
  S('CUSO4', 'CuSO₄·5H₂O', 'copper(II) tetraoxosulphate(VI) pentahydrate', 'CU', 'SO4', true, ['blue crystals', '#2f74d0'], { change: [P('the blue crystals turn to a white powder', ['white'])], gases: ['H2O'], hot: COL.white, cold: COL.white, implies: [], note: 'CuSO₄·5H₂O → CuSO₄ + 5H₂O (water of crystallisation driven off).' }),
  S('CUNO32', 'Cu(NO₃)₂·3H₂O', 'copper(II) trioxonitrate(V)', 'CU', 'NO3', true, ['blue crystals', '#2f74d0'], { change: [P('the blue solid leaves a black residue', ['black'])], gases: ['H2O', 'NO2', 'O2'], hot: COL.black, cold: COL.black, implies: ['NO3', 'CU'], note: '2Cu(NO₃)₂ → 2CuO + 4NO₂ + O₂ (black CuO).' }),
  S('FESO4', 'FeSO₄·7H₂O', 'iron(II) tetraoxosulphate(VI) heptahydrate', 'FE2', 'SO4', true, ['pale green crystals', '#a9cf86'], { change: [P('the pale green crystals turn white, then a reddish-brown residue is left', ['brown', 'red'])], gases: ['H2O', 'SO2'], hot: COL.rust, cold: COL.rust, implies: [], note: '2FeSO₄ → Fe₂O₃ + SO₂ + SO₃ after the water of crystallisation is lost.' }),
  S('FECL3', 'FeCl₃·6H₂O', 'iron(III) chloride', 'FE3', 'CL', true, ['yellow-brown solid', '#c8902f'], { change: [P('a reddish-brown residue is left', ['brown', 'red'])], gases: ['H2O', 'HCL'], hot: COL.rust, cold: COL.rust, implies: [], note: 'Hydrated FeCl₃ loses water and HCl (hydrolysis), leaving Fe₂O₃.' }),
  S('ZNSO4', 'ZnSO₄·7H₂O', 'zinc tetraoxosulphate(VI) heptahydrate', 'ZN', 'SO4', true, ['white crystals', COL.white], { change: [P('the crystals leave a white residue', ['white'])], gases: ['H2O'], hot: COL.white, cold: COL.white, implies: [], note: 'ZnSO₄·7H₂O loses its water of crystallisation.' }),
  S('ZNNO32', 'Zn(NO₃)₂', 'zinc trioxonitrate(V)', 'ZN', 'NO3', true, ['white', COL.white], { change: [P('the residue is yellow when hot and white when cold', ['yellow'], ['white'])], gases: ['NO2', 'O2'], hot: COL.yellow, cold: COL.white, implies: ['NO3', 'ZN'], note: '2Zn(NO₃)₂ → 2ZnO + 4NO₂ + O₂ (ZnO yellow hot, white cold).' }),
  S('AL2SO43', 'Al₂(SO₄)₃·18H₂O', 'aluminium tetraoxosulphate(VI)', 'AL', 'SO4', true, ['white crystals', COL.white], { change: [P('the crystals leave a white residue', ['white'])], gases: ['H2O'], hot: COL.white, cold: COL.white, implies: [], note: 'The hydrated salt loses its water of crystallisation.' }),
  S('ALNO33', 'Al(NO₃)₃·9H₂O', 'aluminium trioxonitrate(V)', 'AL', 'NO3', true, ['white crystals', COL.white], { change: [P('a white residue is left', ['white'])], gases: ['H2O', 'NO2', 'O2'], hot: COL.white, cold: COL.white, implies: ['NO3'], note: '4Al(NO₃)₃ → 2Al₂O₃ + 12NO₂ + 3O₂ after the water is lost.' }),
  S('NA2SO3', 'Na₂SO₃', 'sodium trioxosulphate(IV)', 'NA', 'SO3', true, ['white', COL.white], NO_HEAT_CHANGE(COL.white, 'Na₂SO₃ shows no visible change on heating.')),
  S('NA2S', 'Na₂S', 'sodium sulphide', 'NA', 'S', true, ['pale yellow', '#f1e7b8'], NO_HEAT_CHANGE('#f1e7b8', 'Na₂S is stable to heat.')),
  S('NA2CO3', 'Na₂CO₃', 'sodium trioxocarbonate(IV)', 'NA', 'CO3', true, ['white', COL.white], NO_HEAT_CHANGE(COL.white, 'Na₂CO₃ is not decomposed by a Bunsen flame (Group 1 trioxocarbonates(IV) are stable).')),
  S('KNO3', 'KNO₃', 'potassium trioxonitrate(V)', 'K', 'NO3', true, ['white', COL.white], { change: [P('the solid melts to a colourless liquid and leaves a pale yellow residue on cooling', ['melt', 'liquid'])], gases: ['O2'], hot: COL.water, cold: '#f3e9a8', implies: ['NO3'], note: '2KNO₃ → 2KNO₂ + O₂ (oxygen only: a Group 1 trioxonitrate(V)).' }),
  // insoluble trioxocarbonates(IV)
  S('CUCO3', 'CuCO₃', 'copper(II) trioxocarbonate(IV)', 'CU', 'CO3', false, ['green', COL.greenSolid], { change: [P('the green solid turns black', ['black'])], gases: ['CO2'], hot: COL.black, cold: COL.black, implies: ['CO3', 'CU'], note: 'CuCO₃ → CuO + CO₂ (black CuO).' }),
  S('ZNCO3', 'ZnCO₃', 'zinc trioxocarbonate(IV)', 'ZN', 'CO3', false, ['white', COL.white], { change: [P('the residue is yellow when hot and white when cold', ['yellow'], ['white'])], gases: ['CO2'], hot: COL.yellow, cold: COL.white, implies: ['CO3', 'ZN'], note: 'ZnCO₃ → ZnO + CO₂ (ZnO yellow hot, white cold).' }),
  S('PBCO3', 'PbCO₃', 'lead(II) trioxocarbonate(IV)', 'PB', 'CO3', false, ['white', COL.white], { change: [P('the residue is reddish-brown when hot and yellow when cold', ['yellow'], ['brown', 'red', 'orange'])], gases: ['CO2'], hot: '#a5481e', cold: COL.yellow, implies: ['CO3', 'PB'], note: 'PbCO₃ → PbO + CO₂ (PbO red-brown hot, yellow cold).' }),
  S('CACO3', 'CaCO₃', 'calcium trioxocarbonate(IV)', 'CA', 'CO3', false, ['white', COL.white], { change: [P('on strong heating the white solid stays white', ['white', 'no change', 'no visible'])], gases: ['CO2'], hot: COL.white, cold: COL.white, implies: ['CO3'], note: 'CaCO₃ → CaO + CO₂ on strong heating.' }),
];
export const QUAL_SALT_BY_ID: Record<string, QualSalt> = Object.fromEntries(QUAL_SALTS.map((s) => [s.id, s]));

const SINGLE = ['NH4CL', 'NH42SO4', 'NH42CO3', 'CACL2', 'CANO32', 'PBNO32', 'CUSO4', 'CUNO32', 'FESO4', 'FECL3', 'ZNSO4', 'ZNNO32', 'AL2SO43', 'ALNO33', 'NA2SO3', 'NA2S', 'NA2CO3', 'KNO3', 'CUCO3', 'ZNCO3', 'PBCO3', 'CACO3'];
const MIX_SOLUBLE = ['NH4CL', 'NH42SO4', 'CACL2', 'CUSO4', 'FESO4', 'ZNSO4', 'AL2SO43', 'PBNO32', 'KNO3', 'NA2SO3', 'FECL3'];
const MIX_INSOLUBLE = ['CUCO3', 'ZNCO3', 'PBCO3', 'CACO3'];

// ------------------------------------------------------------------ variant

export interface ChemQualitativeVariant {
  seed: number;
  kind: 'SALT' | 'MIXTURE';
  /** The salt (SALT), or the soluble salt of the mixture (it ends up in the filtrate). */
  main: QualSalt;
  /** MIXTURE: the insoluble trioxocarbonate(IV) (the residue). */
  partner: QualSalt | null;
  /** The paper's description of C. */
  given: string;
  /** The answer slots: A is the salt (or the filtrate's salt), B the residue's salt. */
  slots: { A: QualSalt; B: QualSalt | null };
  /** WAEC would expect about this many tests (rows) for full marks. */
  minRows: number;
}

/** The hidden truth of one attempt (same on the web and the API). */
export function chemQualitativeVariant(seed: number): ChemQualitativeVariant {
  const r = labRandom(seed, 'chem-qualitative');
  const mixture = r() < 0.35;
  if (!mixture) {
    const main = QUAL_SALT_BY_ID[labPick(r, SINGLE)]!;
    return {
      seed,
      kind: 'SALT',
      main,
      partner: null,
      given: `C is a single ${main.solid.name} salt. It contains one cation and one anion from those in the WAEC syllabus.`,
      slots: { A: main, B: null },
      minRows: 5,
    };
  }
  const main = QUAL_SALT_BY_ID[labPick(r, MIX_SOLUBLE)]!;
  const partner = QUAL_SALT_BY_ID[labPick(r, MIX_INSOLUBLE.filter((id) => QUAL_SALT_BY_ID[id]!.cation !== main.cation))]!;
  return {
    seed,
    kind: 'MIXTURE',
    main,
    partner,
    given: 'C is a mixture of two salts: one soluble in water and one insoluble. Each salt contains one cation and one anion from those in the WAEC syllabus.',
    slots: { A: main, B: partner },
    minRows: 8,
  };
}

/** What is in a sample, as the chemistry sees it. `fromAcid`: dissolved in dilute HNO₃, so NO₃⁻ (and H⁺) come from the acid. */
export interface QualComponent {
  salt: QualSalt | null;
  cation: QualCation | 'NONE';
  anion: QualAnion | 'NONE';
  fromAcid: boolean;
}
const comp = (s: QualSalt): QualComponent => ({ salt: s, cation: s.cation, anion: s.anion, fromAcid: false });
const acidComp = (s: QualSalt): QualComponent => ({ salt: s, cation: s.cation, anion: 'NO3', fromAcid: true });

/** The samples the student can test now (the solution, filtrate and residue appear once prepared). */
export function qualSamples(v: ChemQualitativeVariant, tests: { sample: QualSample; reagent: QualReagent }[]): QualSample[] {
  const did = (sample: QualSample, reagent: QualReagent) => tests.some((t) => t.sample === sample && t.reagent === reagent);
  const out: QualSample[] = ['SOLID'];
  if (v.kind === 'SALT') {
    if (v.main.soluble ? did('SOLID', 'WATER') : did('SOLID', 'DIL_HNO3')) out.push('SOLUTION');
  } else {
    if (did('SOLID', 'WATER')) out.push('FILTRATE', 'RESIDUE');
    if (did('RESIDUE', 'DIL_HNO3')) out.push('RESIDUE_SOLN');
  }
  return out;
}

export function qualComponents(v: ChemQualitativeVariant, sample: QualSample): QualComponent[] {
  switch (sample) {
    case 'SOLID':
      return v.partner ? [comp(v.main), comp(v.partner)] : [comp(v.main)];
    case 'SOLUTION':
      return [v.main.soluble ? comp(v.main) : acidComp(v.main)];
    case 'FILTRATE':
      return [comp(v.main)];
    case 'RESIDUE':
      return [comp(v.partner ?? v.main)];
    case 'RESIDUE_SOLN':
      return [acidComp(v.partner ?? v.main)];
  }
}

/** How a sample is described in the TEST column. */
export function qualSampleName(v: ChemQualitativeVariant, sample: QualSample): string {
  if (sample === 'SOLUTION') return v.main.soluble ? 'Solution of C' : 'Solution of C in dil. HNO₃';
  return sample === 'SOLID' ? 'C' : QUAL_SAMPLE_LABEL[sample];
}

export interface QualTest {
  sample: QualSample;
  reagent: QualReagent;
  steps: QualStep[];
  gasTests: QualGasTest[];
}

/** The TEST column for a test (what was done). */
export function qualTestText(v: ChemQualitativeVariant, t: QualTest): string {
  const s = qualSampleName(v, t.sample);
  const has = (x: QualStep) => t.steps.includes(x);
  let text: string;
  switch (t.reagent) {
    case 'WATER':
      text = `${s} + distilled water; shake${v.kind === 'MIXTURE' && t.sample === 'SOLID' ? ' and filter' : ''}`;
      break;
    case 'DIL_HNO3':
      text = `${s} + dilute HNO₃`;
      break;
    case 'HEAT':
      text = `Heat ${s} in a dry test tube, gently then strongly`;
      break;
    case 'FLAME':
      text = `Flame test on ${s} (nichrome wire moistened with conc. HCl)`;
      break;
    case 'DIL_HCL':
      text = `${s} + dilute HCl${has('WARM') ? ', then warm' : ''}`;
      break;
    case 'CONC_H2SO4':
      text = `${s} + conc. H₂SO₄, warm`;
      break;
    case 'CONC_H2SO4_CU':
      text = `${s} + copper turnings + conc. H₂SO₄, warm`;
      break;
    case 'NAOH_WARM':
      text = `${s} + NaOH(aq), warm`;
      break;
    case 'DEVARDA':
      text = `${s} + NaOH(aq) + Devarda's alloy, warm`;
      break;
    case 'NAOH':
      text = `${s} + NaOH(aq) in drops${has('EXCESS') ? ', then in excess' : ''}${has('WARM') ? ', then warm' : ''}`;
      break;
    case 'NH3':
      text = `${s} + NH₃(aq) in drops${has('EXCESS') ? ', then in excess' : ''}`;
      break;
    case 'AGNO3':
      text = `${s} + dilute HNO₃, then AgNO₃(aq)${has('ADD_NH3') ? ', then NH₃(aq) in excess' : ''}`;
      break;
    case 'BACL2':
      text = `${s} + BaCl₂(aq)${has('ADD_HCL') ? ', then dilute HCl' : ''}`;
      break;
    case 'KMNO4':
      text = `${s} + acidified KMnO₄(aq)`;
      break;
    case 'K2CR2O7':
      text = `${s} + acidified K₂Cr₂O₇(aq)`;
      break;
    case 'BROWN_RING':
      text = `${s} + freshly prepared FeSO₄(aq), then conc. H₂SO₄ poured carefully down the side`;
      break;
    case 'KI':
      text = `${s} + KI(aq)`;
      break;
    case 'KSCN':
      text = `${s} + KSCN(aq)`;
      break;
    case 'OXALATE':
      text = `${s} + (NH₄)₂C₂O₄(aq)`;
      break;
    case 'LITMUS':
      text = `${s} tested with red and blue litmus paper`;
      break;
  }
  if (t.gasTests.length) text += `; gas tested with ${t.gasTests.map((g) => QUAL_GAS_TEST_LABEL[g].charAt(0).toLowerCase() + QUAL_GAS_TEST_LABEL[g].slice(1)).join(', ')}`;
  return text;
}

/** A test may be done on this sample with this reagent. */
export function qualReagentFits(reagent: QualReagent, sample: QualSample): boolean {
  const on = QUAL_REAGENT_INFO[reagent].on;
  const solid = isSolidSample(sample);
  if (reagent === 'WATER') return sample === 'SOLID';
  if (reagent === 'DIL_HNO3') return solid;
  return on === 'BOTH' || (on === 'SOLID') === solid;
}

const blankVisual = (): QualVisual => ({ liquid: null, ppt: null, solid: null, bubbles: false, fumes: null, ring: null, flame: null, deposit: null, droplets: false, sublimate: false, probes: [] });
const GAS_FUME: Partial<Record<QualGas, string>> = { NO2: COL.brownGas, HCL: COL.misty };
const acidGas = (a: QualAnion | 'NONE'): QualGas | null => (a === 'CO3' ? 'CO2' : a === 'SO3' ? 'SO2' : a === 'S' ? 'H2S' : null);
const uniq = <T,>(xs: T[]) => [...new Set(xs)];

/**
 * The outcome of a test on some components (a pure function: the grader also
 * calls it with one ion swapped to find which ions an observation allows).
 */
export function qualObserveComponents(t: QualTest, comps: QualComponent[]): QualOutcome {
  const parts: QualPart[] = [];
  let gases: QualGas[] = [];
  const vis = blankVisual();
  const has = (x: QualStep) => t.steps.includes(x);
  const solidHex = comps[0]?.salt?.solid.hex ?? COL.white;
  const one = comps[0] ?? { salt: null, cation: 'NONE', anion: 'NONE', fromAcid: false };
  const c = one.cation;
  const a = one.anion;
  const noReaction = (text = 'no visible change') => parts.push(P(text, NOCHANGE));

  switch (t.reagent) {
    // ---------------------------------------------------------- solid tests
    case 'WATER': {
      if (comps.length > 1) {
        const sol = comps.find((x) => x.salt?.soluble) ?? comps[0]!;
        const ins = comps.find((x) => x !== sol) ?? comps[1]!;
        const col = solnColour(sol.cation);
        parts.push(P('C partly dissolves; on filtering, a residue is left', ['partly', 'partially', 'some', 'residue', 'part of']));
        parts.push(P(`the filtrate is ${col.name}`, ...col.kw));
        const res = ins.cation === 'CU' ? { name: 'green', hex: COL.greenSolid } : ins.cation === 'FE2' ? { name: 'pale green', hex: COL.paleGreen } : ins.cation === 'FE3' ? { name: 'reddish-brown', hex: COL.rust } : { name: 'white', hex: COL.white };
        parts.push(P(`the residue is ${res.name}`, [res.name === 'reddish-brown' ? 'brown' : res.name.split(' ').at(-1)!]));
        vis.liquid = col.hex;
        vis.ppt = res.hex;
      } else if (one.salt && !one.salt.soluble) {
        parts.push(P(`C does not dissolve; the ${one.salt.solid.name} solid remains`, INSOL));
        vis.liquid = COL.water;
        vis.ppt = one.salt.solid.hex;
      } else {
        const col = solnColour(c);
        parts.push(Pn(`C dissolves to give a ${col.name} solution`, ['insoluble', 'not dissolv', 'does not', 'not soluble', 'partly', 'partially'], ['dissolv', 'soluble'], ...col.kw));
        vis.liquid = col.hex;
      }
      break;
    }
    case 'DIL_HNO3': {
      const g = uniq(comps.map((x) => (x.fromAcid ? null : acidGas(x.anion))).filter((x): x is QualGas => !!x));
      const col = solnColour(c);
      parts.push(P(`the solid dissolves${g.length ? ' with effervescence' : ''} to give a ${col.name} solution`, ['dissolv', 'soluble'], ...col.kw));
      gases = g;
      parts.push(...gasParts(g, false));
      vis.liquid = col.hex;
      vis.bubbles = g.length > 0;
      break;
    }
    case 'HEAT': {
      for (const x of comps) if (x.salt) parts.push(...x.salt.heat.change);
      gases = uniq(comps.flatMap((x) => x.salt?.heat.gases ?? []));
      parts.push(...gasParts(gases, true));
      const main = comps.find((x) => x.salt?.heat.gases.length) ?? comps[0];
      vis.solid = main?.salt?.heat.sublimes ? null : main?.salt?.heat.hot ?? solidHex;
      vis.solidCold = main?.salt?.heat.sublimes ? null : main?.salt?.heat.cold ?? solidHex;
      vis.droplets = gases.includes('H2O');
      vis.sublimate = comps.some((x) => x.salt?.heat.sublimes);
      vis.fumes = gases.map((g) => GAS_FUME[g]).find(Boolean) ?? null;
      break;
    }
    case 'FLAME': {
      const flames = uniq(comps.map((x) => (x.cation === 'NONE' ? null : FLAME[x.cation])).filter((f): f is NonNullable<typeof f> => !!f));
      const shown = flames.some((f) => f.name === 'golden-yellow') ? flames.filter((f) => f.name === 'golden-yellow') : flames;
      if (shown.length) for (const f of shown) parts.push(Pn(`a ${f.name} flame`, ['no colour', 'no characteristic'], f.kw));
      else parts.push(P('no characteristic flame colour', ['no characteristic', 'no colour', 'no change', 'no distinct', 'no flame', 'nothing', 'none']));
      vis.flame = shown[0]?.hex ?? '#6fa8ff';
      vis.solid = solidHex;
      break;
    }
    case 'DIL_HCL': {
      if (t.sample === 'SOLID' || t.sample === 'RESIDUE') {
        gases = uniq(comps.map((x) => acidGas(x.anion)).filter((x): x is QualGas => !!x));
        if (gases.length) parts.push(...gasParts(gases, false));
        else parts.push(P('no effervescence; no gas is given off', NOGAS));
        if (comps.some((x) => x.cation === 'PB')) parts.push(P('a white solid (PbCl₂) remains in the tube', ['white']));
        vis.liquid = solnColour(comps.find((x) => x.cation === 'CU' || x.cation === 'FE2' || x.cation === 'FE3')?.cation ?? 'NONE').hex;
        vis.ppt = comps.some((x) => x.cation === 'PB') ? COL.white : null;
        vis.bubbles = gases.length > 0;
      } else {
        const g = one.fromAcid ? null : acidGas(a);
        gases = g ? [g] : [];
        parts.push(...gasParts(gases, false));
        vis.liquid = solnColour(c).hex;
        vis.bubbles = !!g;
        if (c === 'PB') {
          parts.push(P('a white precipitate forms', ['white'], PPT));
          vis.ppt = COL.white;
          if (has('WARM')) {
            parts.push(Pn('the white precipitate dissolves on warming', DISS_NOT, DISSOLVES));
            vis.ppt = null;
          }
        } else if (!g) noReaction();
        if (has('WARM') && c !== 'PB') parts.push(P('no further change on warming', NOCHANGE));
      }
      break;
    }
    case 'CONC_H2SO4':
    case 'CONC_H2SO4_CU': {
      const cu = t.reagent === 'CONC_H2SO4_CU';
      for (const x of comps) {
        if (x.anion === 'CL') gases.push('HCL');
        if (x.anion === 'NO3') gases.push('NO2');
        const g = acidGas(x.anion);
        if (g) gases.push(g);
      }
      gases = uniq(gases);
      if (gases.includes('NO2') && !cu) parts.push(P('pale brown fumes are given off', ['brown']));
      parts.push(...gasParts(gases.filter((g) => cu || g !== 'NO2'), false));
      if (cu && comps.some((x) => x.anion === 'NO3')) parts.push(P('dense reddish-brown fumes; the solution turns blue-green', ['blue', 'green']));
      if (comps.some((x) => x.anion === 'S')) {
        parts.push(P('a yellow deposit (sulphur) forms', ['yellow']));
        vis.deposit = COL.sulphur;
      }
      if (!gases.length) noReaction('no visible reaction; no gas is given off');
      vis.liquid = cu && comps.some((x) => x.anion === 'NO3') ? '#3d9c8c' : '#f3efe2';
      vis.bubbles = gases.length > 0;
      vis.fumes = gases.map((g) => GAS_FUME[g]).find(Boolean) ?? null;
      break;
    }
    case 'NAOH_WARM': {
      if (comps.some((x) => x.cation === 'NH4')) {
        gases = ['NH3'];
        parts.push(...gasParts(gases, false));
      } else parts.push(P('no gas is given off on warming (no smell)', NOGAS));
      vis.liquid = COL.water;
      vis.ppt = comps.map((x) => (x.cation === 'NONE' ? null : PPT_NAOH[x.cation]?.hex)).find(Boolean) ?? null;
      break;
    }
    case 'DEVARDA': {
      gases = ['H2'];
      if (comps.some((x) => x.anion === 'NO3' || x.cation === 'NH4')) gases.push('NH3');
      parts.push(...gasParts(gases, false));
      vis.liquid = COL.water;
      vis.bubbles = true;
      break;
    }

    // ---------------------------------------------------------- solution tests
    case 'NAOH':
    case 'NH3': {
      const naoh = t.reagent === 'NAOH';
      const ppt = c === 'NONE' ? undefined : (naoh ? PPT_NAOH : PPT_NH3)[c];
      const name = naoh ? 'NaOH(aq)' : 'NH₃(aq)';
      vis.liquid = solnColour(c).hex;
      if (ppt) {
        parts.push(P(`a ${ppt.name} precipitate forms`, ppt.kw, PPT));
        vis.ppt = ppt.hex;
      } else parts.push(P('no precipitate', NO_PPT));
      if (has('EXCESS')) {
        if (!ppt) parts.push(P(`no precipitate even with excess ${name}`, NO_PPT));
        else if (naoh && (c === 'PB' || c === 'ZN' || c === 'AL')) {
          parts.push(Pn(`the precipitate dissolves in excess ${name} to give a colourless solution`, DISS_NOT, DISSOLVES));
          vis.ppt = null;
          vis.liquid = COL.water;
        } else if (!naoh && c === 'ZN') {
          parts.push(Pn(`the precipitate dissolves in excess ${name} to give a colourless solution`, DISS_NOT, DISSOLVES));
          vis.ppt = null;
          vis.liquid = COL.water;
        } else if (!naoh && c === 'CU') {
          parts.push(P(`the precipitate dissolves in excess ${name} to give a deep blue solution`, ['deep blue', 'dark blue', 'intense blue', 'royal blue', 'inky', 'blue solution']));
          vis.ppt = null;
          vis.liquid = COL.deepBlue;
        } else parts.push(P(`the precipitate is insoluble in excess ${name}`, INSOL));
      }
      if (naoh && has('WARM')) {
        if (c === 'NH4') {
          gases = ['NH3'];
          parts.push(...gasParts(gases, false));
          vis.bubbles = true;
        } else parts.push(P('on warming, no gas is given off', NOGAS));
      }
      break;
    }
    case 'AGNO3': {
      const g = one.fromAcid ? null : acidGas(a);
      gases = g ? [g] : [];
      parts.push(...gasParts(gases, false));
      vis.liquid = solnColour(c).hex;
      vis.bubbles = !!g;
      if (a === 'CL') {
        parts.push(P('a white (curdy) precipitate forms', ['white'], PPT));
        vis.ppt = COL.white;
      } else parts.push(P('no precipitate with AgNO₃(aq)', NO_PPT));
      if (has('ADD_NH3')) {
        if (a === 'CL') {
          parts.push(Pn('the white precipitate dissolves in excess NH₃(aq)', DISS_NOT, DISSOLVES));
          vis.ppt = null;
        } else parts.push(P('no change with excess NH₃(aq)', NOCHANGE));
        const hyd = c === 'NONE' ? undefined : PPT_NH3[c];
        if (c === 'CU') {
          parts.push(P('the solution turns deep blue', ['deep blue', 'dark blue', 'intense blue', 'royal blue', 'blue']));
          vis.liquid = COL.deepBlue;
        } else if (hyd && c !== 'ZN') {
          parts.push(P(`a ${hyd.name} precipitate of the metal hydroxide forms`, hyd.kw, PPT));
          vis.ppt = hyd.hex;
        }
      }
      break;
    }
    case 'BACL2': {
      const anionPpt = !one.fromAcid && (a === 'SO4' || a === 'SO3' || a === 'CO3');
      vis.liquid = solnColour(c).hex;
      if (anionPpt || c === 'PB') {
        parts.push(P('a white precipitate forms', ['white'], PPT));
        vis.ppt = COL.white;
      } else parts.push(P('no precipitate', NO_PPT));
      if (has('ADD_HCL')) {
        if (a === 'SO4' && !one.fromAcid) parts.push(P('the white precipitate is insoluble in dilute HCl', INSOL));
        else if ((a === 'SO3' || a === 'CO3') && !one.fromAcid) {
          parts.push(Pn('the white precipitate dissolves in dilute HCl', DISS_NOT, DISSOLVES));
          gases = [acidGas(a)!];
          parts.push(...gasParts(gases, false));
          vis.ppt = c === 'PB' ? COL.white : null;
          vis.bubbles = true;
        } else if (c === 'PB') parts.push(P('the white precipitate is insoluble in dilute HCl', INSOL));
        else if (a === 'S' && !one.fromAcid) {
          gases = ['H2S'];
          parts.push(...gasParts(gases, false));
          vis.bubbles = true;
        } else parts.push(P('no change on adding dilute HCl', NOCHANGE));
      }
      break;
    }
    case 'KMNO4':
    case 'K2CR2O7': {
      const mn = t.reagent === 'KMNO4';
      const reduces = c === 'FE2' || (!one.fromAcid && (a === 'SO3' || a === 'S'));
      if (reduces) {
        parts.push(
          mn
            ? Pn('the purple colour of the acidified KMnO₄(aq) is discharged (decolourised)', ['remain', 'no change', 'stays', 'still purple', 'not decolour'], ['decolour', 'decolor', 'colourless', 'colorless', 'discharg', 'fade', 'disappear', 'pale yellow'])
            : Pn('the orange acidified K₂Cr₂O₇(aq) turns green', ['remain', 'no change', 'stays', 'still orange'], ['green']),
        );
        vis.liquid = mn ? (c === 'FE2' ? '#f3ead0' : '#f1eef2') : COL.green;
      } else {
        parts.push(mn ? P('the solution stays purple (no change)', ['remain', 'no change', 'stays', 'still purple', 'persist', 'not decolour', 'unchanged']) : P('the solution stays orange (no change)', ['remain', 'no change', 'stays', 'still orange', 'persist', 'unchanged']));
        vis.liquid = mn ? COL.purple : COL.orange;
      }
      if (!one.fromAcid && a === 'S') {
        parts.push(P('a yellow deposit (sulphur) forms', ['yellow']));
        vis.deposit = COL.sulphur;
      }
      break;
    }
    case 'BROWN_RING': {
      vis.liquid = solnColour(c).hex;
      if (a === 'NO3') {
        parts.push(Pn('a brown ring forms at the junction of the two layers', ['no brown', 'no ring'], ['brown']));
        vis.ring = COL.brown;
      } else parts.push(P('no brown ring forms', ['no brown', 'no ring', 'no change', 'no visible', 'nothing', 'none']));
      break;
    }
    case 'KI': {
      vis.liquid = solnColour(c).hex;
      if (c === 'PB') {
        parts.push(P('a yellow precipitate forms', ['yellow'], PPT));
        vis.ppt = COL.yellow;
      } else if (c === 'CU') {
        parts.push(P('a white precipitate forms in a brown solution', ['brown'], ['white', 'cream', 'buff', 'precipitate', 'ppt']));
        vis.ppt = COL.cream;
        vis.liquid = COL.brown;
      } else if (c === 'FE3') {
        parts.push(P('the solution turns brown (iodine is liberated)', ['brown']));
        vis.liquid = COL.brown;
      } else noReaction();
      break;
    }
    case 'KSCN': {
      vis.liquid = solnColour(c).hex;
      if (c === 'FE3') {
        parts.push(Pn('a blood-red colouration', ['no red', 'no blood'], ['red', 'blood']));
        vis.liquid = COL.bloodRed;
      } else parts.push(P('no blood-red colouration', ['no red', 'no blood', 'no change', 'no visible', 'nothing', 'no colour', 'none']));
      break;
    }
    case 'OXALATE': {
      vis.liquid = solnColour(c).hex;
      const ox: Partial<Record<QualCation, Ppt>> = { CA: PPT_NAOH.CA!, PB: PPT_NAOH.PB!, ZN: { name: 'white', hex: COL.white, kw: ['white'] }, CU: { name: 'pale blue', hex: COL.paleBlue, kw: ['blue', 'white'] }, FE2: { name: 'yellow', hex: COL.yellow, kw: ['yellow'] } };
      const p = c === 'NONE' ? undefined : ox[c];
      if (p) {
        parts.push(P(`a ${p.name} precipitate forms`, p.kw, PPT));
        vis.ppt = p.hex;
      } else parts.push(P('no precipitate', NO_PPT));
      break;
    }
    case 'LITMUS': {
      vis.liquid = solnColour(c).hex;
      if (!one.fromAcid && (a === 'CO3' || a === 'SO3' || a === 'S')) {
        parts.push(Pn('red litmus turns blue (the solution is alkaline)', ['no change'], ['blue', 'alkaline']));
        vis.probes.push({ test: 'RED_LITMUS', colour: COL.litmusBlue, text: 'red litmus turns blue' });
      } else if (one.fromAcid || ['CU', 'FE2', 'FE3', 'AL', 'ZN', 'PB', 'NH4'].includes(c)) {
        parts.push(Pn('blue litmus turns red (the solution is acidic)', ['no change'], ['red', 'pink', 'acid']));
        vis.probes.push({ test: 'BLUE_LITMUS', colour: COL.red, text: 'blue litmus turns red' });
      } else {
        parts.push(P('no change to red or blue litmus (neutral)', ['no change', 'neutral', 'remain', 'unchanged', 'stays']));
        vis.probes.push({ test: 'BLUE_LITMUS', colour: COL.litmusBlue, text: 'no change' });
      }
      break;
    }
  }
  for (const g of t.gasTests) {
    const r = qualGasTestResult(g, gases);
    parts.push(r.part);
    vis.probes.push({ test: g, colour: r.colour, text: r.part.text });
  }
  if (!vis.fumes) vis.fumes = gases.map((g) => GAS_FUME[g]).find(Boolean) ?? null;
  if (gases.length && t.reagent !== 'HEAT') vis.bubbles = true;
  return { parts, gases, visual: vis };
}

export function qualObserve(v: ChemQualitativeVariant, t: QualTest): QualOutcome {
  return qualObserveComponents(t, qualComponents(v, t.sample));
}




// ------------------------------------------------------------------ inference key

export interface QualCategoryKey {
  /** Ions that the observation allows (none of these may be written "absent"; only these may be written "present"). */
  allowed: QualIon[];
  /** For each ion slot that gave a positive result: the ions it allows (WAEC wants all of them named). */
  positive: QualIon[][];
  /** The test tells you something about this category. */
  informative: boolean;
}
export interface QualInferenceKey {
  cation: QualCategoryKey;
  anion: QualCategoryKey;
  gases: QualGas[];
  /** HEAT: the ions the change on heating points to. */
  heat: QualIon[] | null;
}

const sig = (o: QualOutcome) => o.parts.map((p) => p.text).join('|');

/** Which ions are consistent with what a test showed (by swapping one ion of the sample at a time). */
export function qualInferenceKey(v: ChemQualitativeVariant, t: QualTest): QualInferenceKey {
  const comps = qualComponents(v, t.sample);
  const actual = sig(qualObserveComponents(t, comps));
  const category = (kind: 'cation' | 'anion'): QualCategoryKey => {
    const universe: readonly QualIon[] = kind === 'cation' ? QUAL_CATIONS : QUAL_ANIONS;
    const allowed = new Set<QualIon>();
    const positive: QualIon[][] = [];
    let informative = false;
    comps.forEach((x, i) => {
      if (kind === 'anion' && x.fromAcid) {
        // NO₃⁻ came from the acid: nothing to infer about C's anion from it.
        universe.forEach((ion) => allowed.add(ion));
        return;
      }
      const swap = (ion: QualIon | 'NONE') => sig(qualObserveComponents(t, comps.map((y, k) => (k === i ? { ...y, [kind]: ion } : y))));
      const ok = universe.filter((ion) => swap(ion) === actual);
      ok.forEach((ion) => allowed.add(ion));
      if (ok.length < universe.length) informative = true;
      if (swap('NONE') !== actual) positive.push(ok);
    });
    return { allowed: [...allowed], positive, informative };
  };
  const gases = qualObserve(v, t).gases;
  return {
    cation: category('cation'),
    anion: category('anion'),
    gases,
    heat: t.reagent === 'HEAT' ? uniq(comps.flatMap((x) => x.salt?.heat.implies ?? [])) : null,
  };
}

// ------------------------------------------------------------------ the student's work

/** A row of the TEST | OBSERVATION | INFERENCE table (the TEST column is written for them from what they did). */
export interface QualRecord {
  observation: string;
  /** Ions inferred present (or possibly present). */
  present: QualIon[];
  /** Ions inferred absent. */
  absent: QualIon[];
  /** Gases identified. */
  gases: QualGas[];
  /** Anything else (e.g. "water of crystallisation", "stable to heat"). */
  note: string;
}
export interface QualSlotAnswer {
  cation: QualCation | null;
  anion: QualAnion | null;
}
export interface ChemQualitativeState {
  v: 1;
  tests: QualTest[];
  /** Same order as `tests`. */
  table: QualRecord[];
  /** A: the salt (or the filtrate's salt); B: the residue's salt (mixtures only). */
  answer: { A: QualSlotAnswer; B: QualSlotAnswer; equation: string };
  log: { t: number; a: string }[];
}

export const QUAL_MAX_TESTS = 30;
export const emptyQualRecord = (): QualRecord => ({ observation: '', present: [], absent: [], gases: [], note: '' });
export function emptyChemQualitativeState(): ChemQualitativeState {
  return { v: 1, tests: [], table: [], answer: { A: { cation: null, anion: null }, B: { cation: null, anion: null }, equation: '' }, log: [] };
}

const ion = z.enum(QUAL_IONS);
const slot = z.object({ cation: z.enum(QUAL_CATIONS).nullable(), anion: z.enum(QUAL_ANIONS).nullable() });
export const chemQualitativeStateSchema = z.object({
  v: z.literal(1),
  tests: z.array(z.object({ sample: z.enum(QUAL_SAMPLES), reagent: z.enum(QUAL_REAGENTS), steps: z.array(z.enum(QUAL_STEPS)).max(4), gasTests: z.array(z.enum(QUAL_GAS_TESTS)).max(11) })).max(QUAL_MAX_TESTS),
  table: z.array(z.object({ observation: z.string().max(600), present: z.array(ion).max(16), absent: z.array(ion).max(16), gases: z.array(z.enum(QUAL_GASES)).max(9), note: z.string().max(300) })).max(QUAL_MAX_TESTS),
  answer: z.object({ A: slot, B: slot, equation: z.string().max(1000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<ChemQualitativeState>;

export const CHEM_QUALITATIVE: SimulatorSpec = {
  id: 'chem-qualitative',
  subject: 'Chemistry',
  title: 'Qualitative analysis',
  topicNames: ['Qualitative analysis', 'Salts', 'Acids, bases and salts', 'Effect of heat on salts', 'Tests for gases'],
  minutes: 40,
  rubric: [
    { id: 'tests', label: 'Choice of tests', marks: 4, how: 'AUTO', guide: 'NaOH(aq) and NH₃(aq) each added dropwise and then in excess to the solution (and to the residue’s solution for a mixture) (1); a confirmatory test for each anion (1); every gas given off identified with its proper test — lime water for CO₂, damp red litmus for NH₃, acidified K₂Cr₂O₇ for SO₂, lead(II) ethanoate for H₂S, glowing splint for O₂, burning splint for H₂ (1); the solid heated, and every test recorded (1).' },
    { id: 'observations', label: 'Observations', marks: 5, how: 'AUTO', guide: 'Each observation states what was actually seen: colour of a precipitate and whether it dissolves in excess, effervescence, the colour and smell of a gas and what it does to the test reagent, colour changes and residues (hot and cold). Marked against what happened in your test tubes.' },
    { id: 'inferences', label: 'Inferences', marks: 4, how: 'AUTO', guide: 'Each inference follows from its observation: every ion the observation allows (e.g. a white precipitate soluble in excess NaOH → Zn²⁺, Al³⁺ or Pb²⁺), ions it rules out, and every gas given off. Inferring an ion the observation rules out loses the row.' },
    { id: 'identity', label: 'Ions identified', marks: 4, how: 'AUTO', guide: 'The cation and the anion of C (for a mixture: of the soluble salt in the filtrate and of the insoluble residue).' },
    { id: 'equation', label: 'Ionic equation', marks: 2, how: 'AI', guide: 'A correct, balanced ionic equation (with state symbols welcome) for a confirmatory test of the cation and one for the anion, e.g. Zn²⁺ + 2OH⁻ → Zn(OH)₂; Ba²⁺ + SO₄²⁻ → BaSO₄; Ag⁺ + Cl⁻ → AgCl; CO₃²⁻ + 2H⁺ → CO₂ + H₂O.' },
  ],
};

/** Model ionic equations for each ion (used for the worked solution and to guide the marker). */
export const QUAL_ION_EQUATION: Record<QualIon, string> = {
  NH4: 'NH₄⁺(aq) + OH⁻(aq) → NH₃(g) + H₂O(l)',
  CA: 'Ca²⁺(aq) + 2OH⁻(aq) → Ca(OH)₂(s)',
  PB: 'Pb²⁺(aq) + 2OH⁻(aq) → Pb(OH)₂(s)  (or Pb²⁺ + 2I⁻ → PbI₂(s), yellow)',
  CU: 'Cu²⁺(aq) + 2OH⁻(aq) → Cu(OH)₂(s)',
  FE2: 'Fe²⁺(aq) + 2OH⁻(aq) → Fe(OH)₂(s)',
  FE3: 'Fe³⁺(aq) + 3OH⁻(aq) → Fe(OH)₃(s)',
  ZN: 'Zn²⁺(aq) + 2OH⁻(aq) → Zn(OH)₂(s)',
  AL: 'Al³⁺(aq) + 3OH⁻(aq) → Al(OH)₃(s)',
  NA: 'No precipitate test: Na⁺ is shown by its golden-yellow flame.',
  K: 'No precipitate test: K⁺ is shown by its lilac flame.',
  CL: 'Ag⁺(aq) + Cl⁻(aq) → AgCl(s)',
  SO4: 'Ba²⁺(aq) + SO₄²⁻(aq) → BaSO₄(s)',
  SO3: 'SO₃²⁻(aq) + 2H⁺(aq) → SO₂(g) + H₂O(l)',
  CO3: 'CO₃²⁻ + 2H⁺(aq) → CO₂(g) + H₂O(l)',
  NO3: 'NO₃⁻ with Fe²⁺ and conc. H₂SO₄ gives the brown complex [Fe(H₂O)₅NO]²⁺ (or Cu + 4H⁺ + 2NO₃⁻ → Cu²⁺ + 2NO₂ + 2H₂O)',
  S: 'S²⁻(aq) + 2H⁺(aq) → H₂S(g)',
};

// ------------------------------------------------------------------ model answers

const FIRST_CONFIRM = (g: QualGas): QualGasTest => QUAL_GAS_CONFIRM[g][0]!;
const ANION_TEST: Record<QualAnion, Omit<QualTest, 'sample'>> = {
  CL: { reagent: 'AGNO3', steps: ['ADD_NH3'], gasTests: [] },
  SO4: { reagent: 'BACL2', steps: ['ADD_HCL'], gasTests: [] },
  SO3: { reagent: 'BACL2', steps: ['ADD_HCL'], gasTests: ['DICHROMATE'] },
  CO3: { reagent: 'DIL_HCL', steps: [], gasTests: ['LIME_WATER'] },
  NO3: { reagent: 'BROWN_RING', steps: [], gasTests: [] },
  S: { reagent: 'DIL_HCL', steps: [], gasTests: ['LEAD_ACETATE'] },
};
const CATION_CONFIRM: Partial<Record<QualCation, QualReagent>> = { PB: 'KI', FE3: 'KSCN', FE2: 'KMNO4', CA: 'OXALATE' };

/** The tests a model WAEC candidate would do on this C (used for the worked solution). */
export function qualModelTests(v: ChemQualitativeVariant): QualTest[] {
  const out: QualTest[] = [];
  const add = (sample: QualSample, reagent: QualReagent, steps: QualStep[] = [], gasTests: QualGasTest[] = []) => out.push({ sample, reagent, steps, gasTests });
  const cationTests = (sample: QualSample, s: QualSalt) => {
    add(sample, 'NAOH', s.cation === 'NH4' ? ['EXCESS', 'WARM'] : ['EXCESS'], s.cation === 'NH4' ? ['RED_LITMUS'] : []);
    add(sample, 'NH3', ['EXCESS']);
    const c = CATION_CONFIRM[s.cation];
    if (c) add(sample, c);
  };
  const heatGases = uniq(qualComponents(v, 'SOLID').flatMap((x) => x.salt?.heat.gases ?? []));
  add('SOLID', 'WATER');
  if (v.kind === 'SALT') {
    const s = v.main;
    if (s.soluble) {
      cationTests('SOLUTION', s);
      const at = ANION_TEST[s.anion];
      add('SOLUTION', at.reagent, at.steps, at.gasTests);
    } else {
      add('SOLID', 'DIL_HNO3', [], ['LIME_WATER']);
      cationTests('SOLUTION', s);
    }
    if (s.cation === 'NA' || s.cation === 'K' || s.cation === 'CA') add('SOLID', 'FLAME');
  } else {
    cationTests('FILTRATE', v.main);
    const at = ANION_TEST[v.main.anion];
    add('FILTRATE', at.reagent, at.steps, at.gasTests);
    if (v.main.cation === 'K') add('SOLID', 'FLAME');
    add('RESIDUE', 'DIL_HNO3', [], ['LIME_WATER']);
    cationTests('RESIDUE_SOLN', v.partner!);
  }
  add('SOLID', 'HEAT', [], uniq(heatGases.filter((g) => g !== 'H2O' || heatGases.length === 1).map(FIRST_CONFIRM)));
  return out;
}

/** The record a model candidate writes for a test: every ion the observation allows, ions it rules out, the gases. */
export function qualIdealRecord(v: ChemQualitativeVariant, t: QualTest): QualRecord {
  const key = qualInferenceKey(v, t);
  const o = qualObserve(v, t);
  const present: QualIon[] = [];
  const absent: QualIon[] = [];
  if (key.heat) present.push(...key.heat);
  else
    for (const kind of ['cation', 'anion'] as const) {
      const k = key[kind];
      if (!k.informative) continue;
      const need = uniq(k.positive.flat());
      const universe: readonly QualIon[] = kind === 'cation' ? QUAL_CATIONS : QUAL_ANIONS;
      if (k.positive.length && need.length <= QUAL_SMALL_SET) present.push(...need);
      else if (!k.positive.length) absent.push(...universe.filter((x) => !k.allowed.includes(x) && (kind === 'anion' || !['NA', 'K'].includes(x))));
    }
  const heatSalts = t.reagent === 'HEAT' ? qualComponents(v, t.sample).map((x) => x.salt?.heat.note ?? '') : [];
  return { observation: o.parts.map((p) => p.text).join('; '), present: uniq(present), absent: uniq(absent), gases: key.gases, note: heatSalts.join(' ') || (key.gases.length || present.length || absent.length ? '' : 'no reaction') };
}
/** A positive result allowing more ions than this is too vague to demand them all. */
export const QUAL_SMALL_SET = 4;
