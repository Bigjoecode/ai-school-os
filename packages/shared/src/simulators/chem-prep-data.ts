import { z } from 'zod';
import { labBetween, labPick, labRandom, roundDp } from './seeded';

/**
 * chem-prep: the constants, the attempt state and its schema, and the seeded
 * variant. The chemistry (what each action does, what is seen, what earns the
 * marks) is in chem-prep.ts, which re-exports this file.
 *
 * STANDARD (pr-chem-standard-solution-and-dilution): weigh anhydrous Na₂CO₃
 * by difference, dissolve in a beaker, transfer with rinsings into a 250 cm³
 * volumetric flask, make up to the mark dropwise at eye level, invert; then
 * pipette 25.0 cm³ (with a filler) into a second flask and make that up.
 * LECHAT (pr-chem-le-chatelier): Fe³⁺ + SCN⁻ ⇌ FeSCN²⁺ shifted by FeCl₃, KSCN,
 * NH₄Cl, hot and iced water against a control; CrO₄²⁻/Cr₂O₇²⁻ with acid then
 * alkali; Kc from given data.
 * DISTIL (pr-chem-evaporation-distillation): salt from 50.0 cm³ of filtered
 * sea water (evaporate, finish on a water bath, weigh to constant mass) and
 * pure water by simple distillation (thermometer at the side arm, water in at
 * the bottom, anti-bumping granules, receiver open).
 * HALOGEN (pr-chem-halogen-displacement): chlorine, bromine and iodine water
 * with KCl, KBr and KI; hexane layer colours; starch; reactivity order.
 * AMMONIA (pr-chem-preparation-of-ammonia): NH₄Cl + Ca(OH)₂ heated in a tube
 * sloping down, dried over CaO, collected by upward delivery; damp red
 * litmus, conc. HCl fumes and the fountain experiment.
 */

export const PREP_TASKS = ['STANDARD', 'LECHAT', 'DISTIL', 'HALOGEN', 'AMMONIA'] as const;
export type PrepTask = (typeof PREP_TASKS)[number];
export const PREP_PRACTICAL_TASKS: Record<string, PrepTask> = {
  'pr-chem-standard-solution-and-dilution': 'STANDARD',
  'pr-chem-le-chatelier': 'LECHAT',
  'pr-chem-evaporation-distillation': 'DISTIL',
  'pr-chem-halogen-displacement': 'HALOGEN',
  'pr-chem-preparation-of-ammonia': 'AMMONIA',
};
export const PREP_TASK_TITLE: Record<PrepTask, string> = {
  STANDARD: 'A standard Na₂CO₃ solution and its dilution',
  LECHAT: "Le Chatelier's principle: shifting equilibria",
  DISTIL: 'Salt and pure water from sea water',
  HALOGEN: 'Halogen displacement reactions',
  AMMONIA: 'Preparing and testing ammonia',
};
/** Tube tasks keep one record per tube (t0, t1, …); the others have fixed rows. */
export const prepTubeTask = (t: PrepTask) => t === 'LECHAT' || t === 'HALOGEN';

export const PREP_ACTS = [
  // STANDARD
  'SCOOP', 'UNSCOOP', 'WEIGH1', 'TIP', 'WEIGH2', 'WATER100', 'STIR', 'POUR', 'RINSE', 'FILL', 'DROP', 'EYE', 'MIX', 'PIP_RINSE', 'PIPETTE', 'RESTART',
  // LECHAT / HALOGEN
  'STOCK', 'TUBE', 'ADD', 'BATH', 'SHAKE',
  // DISTIL
  'FILTER', 'WEIGH_DISH', 'MEASURE', 'HEAT_DISH', 'BATH_DISH', 'COOL', 'THERMO', 'CONDENSER', 'CHIPS', 'FILL_FLASK', 'RECEIVER', 'WATER_ON', 'HEAT', 'STOP', 'TEST_DIST',
  // AMMONIA
  'WEIGH_NH4CL', 'WEIGH_CAOH2', 'MIXSOLID', 'LOAD', 'CLAMP', 'DRYER', 'COLLECT', 'HEAT_GAS', 'LITMUS', 'HCL_ROD', 'WAFT', 'FOUNTAIN',
] as const;
export type PrepAct = (typeof PREP_ACTS)[number];
export const PREP_ITEMS = [
  '', 'BIG', 'SMALL', 'BEAKER', 'FLASK', 'WATER', 'SOL', 'FILLER', 'MOUTH', 'ALL', 'DILUTE', 'CONC',
  'FESCN', 'CHROMATE', 'FECL3', 'KSCN', 'NH4CL', 'HCL', 'NAOH', 'HOT', 'ICE',
  'KCL', 'KBR', 'KI', 'CL2', 'CL2OLD', 'BR2', 'I2', 'HEXANE', 'STARCH',
  'SIDEARM', 'LIQUID', 'TOP', 'BOTTOM', 'OPEN', 'STOPPERED', 'EVAP', 'BP', 'AGNO3',
  'DOWN', 'UP', 'CAO', 'H2SO4', 'CACL2', 'NONE', 'UPWARD', 'DOWNWARD', 'DAMP', 'DRY',
] as const;
export type PrepItem = (typeof PREP_ITEMS)[number];
export interface PrepEvent {
  a: PrepAct;
  /** Tube index (ADD, BATH, SHAKE), drops (DROP), inversions (MIX) or seconds (heating). */
  n: number;
  x: PrepItem;
}

/** What a row's inference can claim. */
export const PREP_CLAIMS = ['RIGHT', 'LEFT', 'NO_SHIFT', 'EXOTHERMIC', 'BR2_FORMED', 'I2_FORMED', 'NO_REACTION', 'NONVOLATILE', 'CONDENSED', 'PURE_WATER', 'ALKALINE', 'NH3', 'SOLUBLE'] as const;
export type PrepClaim = (typeof PREP_CLAIMS)[number];
export const PREP_CLAIM_LABEL: Record<PrepClaim, string> = {
  RIGHT: 'Equilibrium shifts to the right',
  LEFT: 'Equilibrium shifts to the left',
  NO_SHIFT: 'No shift (control)',
  EXOTHERMIC: 'Forward reaction is exothermic',
  BR2_FORMED: 'Bromine (Br₂) liberated: displacement',
  I2_FORMED: 'Iodine (I₂) liberated: displacement',
  NO_REACTION: 'No displacement (no reaction)',
  NONVOLATILE: 'The salt is non-volatile: it stays behind',
  CONDENSED: 'Steam condenses back to liquid water',
  PURE_WATER: 'The distillate is pure water',
  ALKALINE: 'The gas is alkaline',
  NH3: 'The gas is ammonia (NH₄Cl fumes)',
  SOLUBLE: 'Ammonia is very soluble in water',
};
export const PREP_TASK_CLAIMS: Record<PrepTask, PrepClaim[]> = {
  STANDARD: [],
  LECHAT: ['RIGHT', 'LEFT', 'NO_SHIFT', 'EXOTHERMIC'],
  DISTIL: ['NONVOLATILE', 'CONDENSED', 'PURE_WATER'],
  HALOGEN: ['BR2_FORMED', 'I2_FORMED', 'NO_REACTION'],
  AMMONIA: ['ALKALINE', 'NH3', 'SOLUBLE'],
};

/** The fixed observation rows of the procedure tasks. */
export const PREP_ROWS: Record<PrepTask, string[]> = {
  STANDARD: ['DISSOLVE', 'FLASK', 'DILUTE'],
  LECHAT: [],
  DISTIL: ['EVAP', 'DISTIL', 'TEST'],
  HALOGEN: [],
  AMMONIA: ['GAS', 'LITMUS', 'HCL', 'FOUNTAIN'],
};
export const PREP_ROW_LABEL: Record<string, string> = {
  DISSOLVE: 'The Na₂CO₃ stirred with about 100 cm³ of distilled water',
  FLASK: 'The flask made up to the mark and inverted',
  DILUTE: 'The 25.0 cm³ portion made up to 250 cm³',
  EVAP: '50.0 cm³ of filtered sea water evaporated to dryness',
  DISTIL: 'Sea water heated in the distillation apparatus',
  TEST: 'The distillate tested',
  GAS: 'The gas collected in the jar (colour and smell)',
  LITMUS: 'Damp red litmus paper at the mouth of the jar',
  HCL: 'A glass rod dipped in conc. HCl held at the mouth',
  FOUNTAIN: 'The fountain experiment (water with phenolphthalein)',
};

/** Reading and answer boxes for each task. */
export const PREP_READINGS: Record<PrepTask, { id: string; label: string; unit: string }[]> = {
  STANDARD: [
    { id: 'mneed', label: 'Mass of Na₂CO₃ needed for 250 cm³ of 0.100 mol dm⁻³ (M = 106)', unit: 'g' },
    { id: 'm1', label: 'Mass of weighing bottle + Na₂CO₃ (before)', unit: 'g' },
    { id: 'm2', label: 'Mass of weighing bottle after tipping out', unit: 'g' },
    { id: 'mass', label: 'Mass of Na₂CO₃ transferred', unit: 'g' },
    { id: 'c1', label: 'Concentration of the standard solution', unit: 'mol dm⁻³' },
    { id: 'c2', label: 'Concentration of the diluted solution', unit: 'mol dm⁻³' },
    { id: 'v1', label: 'Volume of stock needed (the question on the task card)', unit: 'cm³' },
  ],
  LECHAT: [
    { id: 'kc', label: 'Kc for Fe³⁺ + SCN⁻ ⇌ FeSCN²⁺ from the data on the task card', unit: '' },
    { id: 'kcunit', label: 'Unit of Kc', unit: '' },
  ],
  DISTIL: [
    { id: 'dish', label: 'Mass of the empty evaporating dish', unit: 'g' },
    { id: 'dishsalt', label: 'Mass of dish + dry salt (constant mass)', unit: 'g' },
    { id: 'salt', label: 'Mass of salt from 50.0 cm³', unit: 'g' },
    { id: 'conc', label: 'Concentration of salt in the sea water', unit: 'g dm⁻³' },
    { id: 'bp', label: 'Thermometer reading while the distillate collects', unit: '°C' },
  ],
  HALOGEN: [
    { id: 'mol', label: 'Moles of I₂ formed (task-card question)', unit: 'mol' },
    { id: 'mass', label: 'Mass of iodine formed (I₂ = 254)', unit: 'g' },
  ],
  AMMONIA: [
    { id: 'nh4', label: 'Mass of NH₄Cl used', unit: 'g' },
    { id: 'ca', label: 'Mass of Ca(OH)₂ used', unit: 'g' },
    { id: 'mol', label: 'Moles of NH₄Cl (M = 53.5)', unit: 'mol' },
    { id: 'vol', label: 'Volume of NH₃ at r.t.p. (24.0 dm³ mol⁻¹)', unit: 'dm³' },
    { id: 'need', label: 'Mass of Ca(OH)₂ needed to react with it (M = 74)', unit: 'g' },
  ],
};

/** Multiple-choice deductions. `answer`: every right option (tick all of them when there are several). */
export interface PrepMcq {
  id: string;
  q: string;
  options: string[];
  answer: number[];
  /** Marked under deductions, or with the results. */
  crit: 'deductions' | 'calculation';
}
export const PREP_MCQ: Record<PrepTask, PrepMcq[]> = {
  STANDARD: [
    { id: 'std-def', crit: 'deductions', q: 'A standard solution is one', options: ['whose concentration is accurately known', 'of concentration 1.00 mol dm⁻³', 'made only with distilled water', 'that never changes colour'], answer: [0] },
    { id: 'std-primary', crit: 'deductions', q: 'Tick every quality of a good primary standard', options: ['pure', 'stable in air', 'not hygroscopic', 'high molar mass', 'soluble in water', 'hygroscopic', 'volatile', 'coloured'], answer: [0, 1, 2, 3, 4] },
    { id: 'std-flask', crit: 'deductions', q: 'A volumetric flask is used because it', options: ['contains one accurately known volume', 'measures any volume', 'can be heated', 'dissolves solids faster'], answer: [0] },
  ],
  LECHAT: [
    { id: 'lc-principle', crit: 'deductions', q: 'When a system at equilibrium is disturbed, it', options: ['shifts so as to oppose the change', 'stops reacting', 'shifts to increase the change', 'always shifts to the right'], answer: [0] },
    { id: 'lc-catalyst', crit: 'deductions', q: 'A catalyst added to an equilibrium mixture', options: ['speeds up attainment of equilibrium only', 'shifts it to the right', 'increases Kc', 'increases the yield'], answer: [0] },
    { id: 'lc-kc', crit: 'calculation', q: 'Raising the temperature of this (exothermic) equilibrium makes Kc', options: ['smaller', 'larger', 'unchanged'], answer: [0] },
  ],
  DISTIL: [
    { id: 'ds-water', crit: 'deductions', q: 'Water enters the Liebig condenser at the bottom because', options: ['the jacket stays full of cold water, so cooling is efficient', 'water flows faster downhill', 'the steam enters at the bottom', 'it stops bumping'], answer: [0] },
    { id: 'ds-thermo', crit: 'deductions', q: 'The thermometer bulb is level with the side arm to', options: ['read the temperature of the vapour that distils over', 'measure the boiling salty liquid', 'stop the liquid bumping', 'cool the vapour'], answer: [0] },
    { id: 'ds-ethanol', crit: 'deductions', q: 'Ethanol is separated from water (e.g. palm wine) by', options: ['fractional distillation', 'filtration', 'evaporation to dryness', 'sublimation'], answer: [0] },
  ],
  HALOGEN: [
    { id: 'hl-trend', crit: 'deductions', q: 'Oxidising power decreases from Cl₂ to I₂ because', options: ['the atomic radius increases, so the attraction for an extra electron decreases', 'the relative atomic mass increases', 'the number of outer electrons increases', 'the halogens become more soluble'], answer: [0] },
    { id: 'hl-order', crit: 'calculation', q: 'Order of reactivity deduced', options: ['Cl₂ > Br₂ > I₂', 'I₂ > Br₂ > Cl₂', 'Br₂ > Cl₂ > I₂', 'Cl₂ > I₂ > Br₂'], answer: [0] },
    { id: 'hl-eq', crit: 'calculation', q: 'The ionic equation for one displacement you saw', options: ['Cl₂ + 2Br⁻ → 2Cl⁻ + Br₂', 'I₂ + 2Br⁻ → 2I⁻ + Br₂', 'Br₂ + 2Cl⁻ → 2Br⁻ + Cl₂', 'I₂ + 2Cl⁻ → 2I⁻ + Cl₂'], answer: [0] },
  ],
  AMMONIA: [
    { id: 'am-dry', crit: 'deductions', q: 'Ammonia is dried with quicklime (CaO) because', options: ['it is basic and does not react with ammonia; conc. H₂SO₄ and CaCl₂ do', 'it is the cheapest drying agent', 'conc. H₂SO₄ dries too slowly', 'it makes more ammonia'], answer: [0] },
    { id: 'am-collect', crit: 'deductions', q: 'Tick both reasons ammonia is collected by upward delivery in a dry jar', options: ['it is less dense than air', 'it is very soluble in water', 'it is denser than air', 'it does not dissolve in water'], answer: [0, 1] },
    { id: 'am-slope', crit: 'deductions', q: 'The tube is clamped with its mouth sloping downwards so that', options: ['condensed water does not run back on to the hot glass and crack it', 'the gas comes out faster', 'the solids mix better', 'no ammonia is lost'], answer: [0] },
  ],
};

// ------------------------------------------------------------------ state

export interface PrepRecord {
  observation: string;
  claims: PrepClaim[];
}
export interface ChemPrepState {
  v: 1;
  task: PrepTask | null;
  events: PrepEvent[];
  /** Fixed rows (DISSOLVE, EVAP, GAS…) or one per tube (t0, t1…). */
  records: Record<string, PrepRecord>;
  readings: Record<string, string>;
  /** MCQ id → the option indices ticked. */
  choices: Record<string, number[]>;
  written: { precautions: string; explain: string };
  log: { t: number; a: string }[];
}
export const PREP_MAX_EVENTS = 400;
export const PREP_MAX_TUBES = 20;
export const emptyPrepRecord = (): PrepRecord => ({ observation: '', claims: [] });
export function emptyChemPrepState(): ChemPrepState {
  return { v: 1, task: null, events: [], records: {}, readings: {}, choices: {}, written: { precautions: '', explain: '' }, log: [] };
}

const key = z.string().regex(/^[A-Za-z0-9-]{1,16}$/);
const capped = <T extends z.ZodTypeAny>(schema: z.ZodRecord<z.ZodString, T>, max: number) => schema.refine((o) => Object.keys(o).length <= max, { message: 'too many entries' });
export const chemPrepStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(PREP_TASKS).nullable(),
  events: z.array(z.object({ a: z.enum(PREP_ACTS), n: z.number().min(0).max(1800), x: z.enum(PREP_ITEMS) })).max(PREP_MAX_EVENTS),
  records: capped(z.record(key, z.object({ observation: z.string().max(600), claims: z.array(z.enum(PREP_CLAIMS)).max(6) })), 30),
  readings: capped(z.record(key, z.string().max(40)), 20),
  choices: capped(z.record(key, z.array(z.number().int().min(0).max(9)).max(9)), 12),
  written: z.object({ precautions: z.string().max(2000), explain: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<ChemPrepState>;

// ------------------------------------------------------------------ variant

export interface ChemPrepVariant {
  seed: number;
  task: PrepTask;
  std: {
    /** Empty weighing bottle (g). */
    bottle: number;
    /** What each spatula adds (g), in order. */
    big: number[];
    small: number[];
    /** Solid that stays in the bottle when tipped out (g). */
    residue: number;
    /** The wash bottle fills the flask to here (cm³) before dropwise. */
    bulkTo: number;
    /** Task-card dilution question: make vt cm³ of ct from a cs stock. */
    q: { ct: number; vt: number; cs: number; acid: string };
  };
  lc: { fe: number; scn: number; cx: number };
  ds: { salt: number; dish: number; sand: number; bpWater: number; offset: number };
  hl: { c: number; vol: number };
  am: { nh4: number; ca: number };
}

const STD_Q = [
  { ct: 0.1, vt: 250, cs: 1.0, acid: 'HCl' },
  { ct: 0.2, vt: 250, cs: 2.0, acid: 'HCl' },
  { ct: 0.1, vt: 500, cs: 2.0, acid: 'H₂SO₄' },
  { ct: 0.05, vt: 250, cs: 0.5, acid: 'HCl' },
  { ct: 0.1, vt: 100, cs: 0.5, acid: 'HNO₃' },
  { ct: 0.2, vt: 100, cs: 1.0, acid: 'HCl' },
  { ct: 0.25, vt: 100, cs: 1.0, acid: 'H₂SO₄' },
];

export function chemPrepVariant(seed: number, task: PrepTask): ChemPrepVariant {
  const r = labRandom(seed, 'chem-prep-std');
  const big = Array.from({ length: 24 }, () => labBetween(r, 0.42, 0.78, 3));
  const small = Array.from({ length: 40 }, () => labBetween(r, 0.04, 0.13, 3));
  const std = { bottle: labBetween(r, 12.2, 16.8, 2), big, small, residue: labBetween(r, 0.008, 0.03, 3), bulkTo: labBetween(r, 248.6, 249.5, 2), q: labPick(r, STD_Q) };
  const rl = labRandom(seed, 'chem-prep-lc');
  const fe = labPick(rl, [1.2, 1.4, 1.5, 1.6, 1.8, 2.0]) * 1e-3;
  const scn = labPick(rl, [1.5, 2.0, 2.5, 3.0]) * 1e-4;
  const kc = labBetween(rl, 100, 160, 0);
  const cx = Number((kc * fe * scn).toPrecision(2));
  const rd = labRandom(seed, 'chem-prep-ds');
  const ds = { salt: labBetween(rd, 31, 38, 1), dish: labBetween(rd, 38.2, 46.6, 2), sand: labBetween(rd, 0.08, 0.2, 2), bpWater: labBetween(rd, 99.6, 100.0, 1), offset: labBetween(rd, -0.4, 0.4, 1) };
  const rh = labRandom(seed, 'chem-prep-hl');
  const hl = { c: labPick(rh, [0.01, 0.015, 0.02, 0.025, 0.03]), vol: labPick(rh, [20.0, 25.0]) };
  const ra = labRandom(seed, 'chem-prep-am');
  const am = { nh4: labBetween(ra, 4.8, 5.6, 2), ca: labBetween(ra, 3.9, 4.6, 2) };
  return { seed, task, std, lc: { fe: roundDp(fe, 6), scn: roundDp(scn, 7), cx }, ds, hl, am };
}

// ------------------------------------------------------------------ observation parts and keys

/** One observable fact (the chem-qualitative marker reads this shape). */
export interface PrepPart {
  text: string;
  kw: string[][];
  not?: string[];
}
export const prepP = (text: string, ...kw: string[][]): PrepPart => ({ text, kw });
export const prepPn = (text: string, not: string[], ...kw: string[][]): PrepPart => ({ text, kw, not });
export const PREP_STAY = ['remain', 'stay', 'still', 'no change', 'no colour change', 'no color change', 'unchanged', 'persist', 'no visible', 'same'];
/** What a row's inference must and may claim; `complete: false`: nothing can be inferred yet. */
export interface PrepKey {
  complete: boolean;
  need: PrepClaim[];
  allow: PrepClaim[];
  why?: string;
}
export const prepKeyOf = (need: PrepClaim[], allow: PrepClaim[] = need): PrepKey => ({ complete: true, need, allow: [...new Set([...need, ...allow])] });
export const prepNotReady = (why: string): PrepKey => ({ complete: false, need: [], allow: [], why });

/** MCQ credit: 1 when exactly right; 0.5 for a multi-answer item with most right and none wrong. */
export function prepMcqCredit(task: PrepTask, id: string, ticked: number[] | undefined): number {
  const q = PREP_MCQ[task].find((x) => x.id === id);
  if (!q || !ticked?.length) return 0;
  const right = ticked.filter((i) => q.answer.includes(i)).length;
  const wrong = ticked.length - right;
  if (!wrong && right === q.answer.length) return 1;
  if (q.answer.length > 2 && !wrong && right >= q.answer.length - 2) return 0.5;
  return 0;
}

export const prepLastOf = (ev: PrepEvent[], a: PrepAct) => {
  for (let i = ev.length - 1; i >= 0; i--) if (ev[i]!.a === a) return i;
  return -1;
};
export const prepEv = (a: PrepAct, x: PrepItem = '', n = 0): PrepEvent => ({ a, n, x });
export const prepR2 = (x: number) => roundDp(x, 2);
export const prepSig = (x: number, n = 3) => Number(x.toPrecision(n));

