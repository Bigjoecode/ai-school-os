import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { labBetween, labRandom, roundDp } from './seeded';

/**
 * chem-electro: electrochemistry and corrosion (WAEC practical chemistry).
 * Four tasks, one per lesson:
 *  - ELEC (pr-chem-electrolysis-copper-sulphate): CuSO₄(aq) between copper
 *         plates. Sand, weigh, connect (plate to the − terminal is the
 *         cathode, ammeter in series, plates apart), switch on and hold the
 *         current at 0.50 A with the rheostat for 40 min. The current follows
 *         I = (E − E_back) ÷ (R_rheostat + r_supply + r_cell), and the cell's
 *         resistance falls slowly as the solution warms, so an unattended
 *         current creeps up. Copper deposited = Q·M ÷ (nF) × efficiency; the
 *         anode loses that much plus a little anode sludge; the blue colour
 *         stays the same. Rinse gently with water then propanone, dry away
 *         from flames, reweigh. (Sandbox: carbon electrodes — a back e.m.f.,
 *         oxygen at the anode, the blue fades.)
 *  - CELL (pr-chem-daniell-cell): Zn | ZnSO₄ || CuSO₄ | Cu with a KNO₃
 *         salt bridge and a high-resistance voltmeter: E = E° − (RT/2F)·
 *         ln([Zn²⁺]/[Cu²⁺]) less a seeded junction/oxide loss (more with
 *         unsanded strips); zero with the bridge out or dry; negative with the
 *         leads reversed; low on an ordinary (low-resistance) voltmeter.
 *  - DISP (pr-chem-iron-copper-displacement): weighed iron filings in excess
 *         CuSO₄: Fe + Cu²⁺ → Fe²⁺ + Cu, first order in time, faster stirred;
 *         ΔH = −154 kJ mol⁻¹ heats the solution (a peak, then Newton cooling);
 *         blue fades to green as Fe²⁺ replaces Cu²⁺; filter onto a weighed
 *         paper, wash with water then propanone, dry, weigh.
 *  - RUST (pr-chem-rusting-conditions): nails in tubes A (tap water), B
 *         (boiled water under oil), C (anhydrous CaCl₂, stoppered), D (salt
 *         water) over days; and moist iron wool in a graduated tube of 50 cm³
 *         of air over water, the volume falling as the oxygen is used,
 *         V(t) = V₀(1 − 0.209·f·(1 − e^(−t/τ))) at the day's temperature, read
 *         with the levels inside and outside equal.
 */

export const ELECTRO_TASKS = ['ELEC', 'CELL', 'DISP', 'RUST'] as const;
export type ElectroTask = (typeof ELECTRO_TASKS)[number];
export const ELECTRO_LESSONS: Record<string, ElectroTask> = {
  'pr-chem-electrolysis-copper-sulphate': 'ELEC',
  'pr-chem-daniell-cell': 'CELL',
  'pr-chem-iron-copper-displacement': 'DISP',
  'pr-chem-rusting-conditions': 'RUST',
};
export const electroLessonTask = (practicalId?: string | null): ElectroTask => (practicalId && ELECTRO_LESSONS[practicalId]) || 'ELEC';

const sf3 = (x: number) => Number(x.toPrecision(3));
export const FARADAY = 96500;
export const M_CU = 63.5;
export const M_FE = 56;

// ================================================================== ELEC: electrolysis with copper electrodes

/** Rheostat: 0–30 Ω in 0.25 Ω steps; where its slider starts. */
export const ELEC_STEP_OHM = 0.25;
export const ELEC_STEPS = 120;
export const ELEC_RHEO0 = 80;
export const ELEC_TARGET = 0.5;
/** The lesson's run (s), and the shortest run that still gives a weighable deposit. */
export const ELEC_RUN = 2400;
export const ELEC_MIN_RUN = 1800;
/** Ammeter: 0–1 A, 0.02 A divisions. */
export const ELEC_AMMETER = { fsd: 1, minor: 0.02, major: 0.2 } as const;
/** How far from 0.50 A still counts as "kept constant" (A), and after how long (s) it must be set. */
export const ELEC_TOL = 0.015;
export const ELEC_SETTLE = 120;
export type ElecElectrode = 'CU' | 'C';

export interface ElecVariant {
  /** Supply e.m.f. (V) and internal resistance (Ω). */
  emf: number;
  rInt: number;
  /** Cell resistance at the start (Ω) and its fractional fall over 40 min as the solution warms. */
  rCell: number;
  drift: number;
  /** Plate masses as supplied (g): P1 is the plate meant to be the cathode. */
  p1: number;
  p2: number;
  /** Metal removed by sanding each plate (g). */
  sand1: number;
  sand2: number;
  /** Current efficiency of the deposition, and the extra mass the anode sheds (sludge, g). */
  eff: number;
  sludge: number;
  /** Fraction of the deposit lost by rubbing; flaking from an unsanded (oxide-coated) cathode. */
  rubLoss: number;
  flake: number;
  /** Liquid left on a plate not dried (g); oxide gained when dried over a flame (g). */
  wet: number;
  ox: number;
  electrodes: ElecElectrode;
  conc: number;
}

// ================================================================== CELL: the Daniell cell

export const E_CU = 0.34;
export const E_ZN = -0.76;
export const CELL_E0 = E_CU - E_ZN;
/** Voltmeter resistances (Ω): a high-resistance (digital) voltmeter and an ordinary moving-coil one. */
export const CELL_RV = { HIGH: 1e7, LOW: 2000 } as const;
export type CellMeter = keyof typeof CELL_RV;

export interface CellVariant {
  /** Junction / oxide-film loss (V) with clean strips, and the extra with unsanded strips. */
  loss: number;
  dirty: number;
  /** Internal resistance of the cell with a paper salt bridge (Ω). */
  rInt: number;
  /** The e.m.f. of the mixed-up cell (zinc in CuSO₄ coats with copper at once). */
  swapped: number;
  cZn: number;
  cCu: number;
  room: number;
}

// ================================================================== DISP: iron displaces copper

export const DISP_DH = -153.9; // kJ mol⁻¹, Fe(s) + Cu²⁺(aq) → Fe²⁺(aq) + Cu(s)
export const DISP_VOLS = [10, 20, 50] as const;
export const DISP_VOL = 50;
export const DISP_FE_TARGET = 0.56;
/** Rate constants (s⁻¹): stirred, left standing; cooling of the beaker (s⁻¹); heat capacity of the glass (J K⁻¹). */
export const DISP_K = { STIR: 1 / 45, NONE: 1 / 420 } as const;
export const DISP_COOL = 1 / 700;
export const DISP_GLASS = 40;
export type DispFilings = 'CLEAN' | 'RUSTY';

export interface DispVariant {
  conc: number;
  /** g added by each tap of the spatula (the balance shows the running total). */
  taps: number[];
  paper: number;
  /** Fraction of the copper lost in the funnel; liquid left unwashed (g); damp after water only (g); oxide from flame drying (g); a wet product (g). */
  loss: number;
  unwashed: number;
  damp: number;
  ox: number;
  wet: number;
  /** Rusty filings: the share of the iron that reacts, and how much slower. */
  rustyDone: number;
  room: number;
}

// ================================================================== RUST

export const RUST_TUBES = ['A', 'B', 'C', 'D'] as const;
export type RustTube = (typeof RUST_TUBES)[number];
export const RUST_CONTENT = ['TAP', 'BOILED', 'CACL2', 'SALT'] as const;
export type RustContent = (typeof RUST_CONTENT)[number];
/** What each tube should hold (the lesson's set-up). */
export const RUST_PLAN: Record<RustTube, RustContent> = { A: 'TAP', B: 'BOILED', C: 'CACL2', D: 'SALT' };
export const RUST_WEEK = 7;
export const RUST_MIN_DAYS = 5;
export const RUST_V0 = 50;
/** Graduated tube: 1 cm³ divisions, read to the nearest 0.5 cm³. */
export const RUST_SEEN = 0.05;

export interface RustVariant {
  /** Rust index per day for a clean nail in tap water; salt water's factor. */
  rate: number;
  salt: number;
  /** Fraction of the air's oxygen the wool uses, the time constant (days), the tube's bore (cm²), daily temperature swing (°C) and phase. */
  f: number;
  tau: number;
  bore: number;
  swing: number;
  phase: number;
  room: number;
}

// ================================================================== the variant

export type ElectroAnswerId = 'charge' | 'molesCu' | 'massCalc' | 'gain' | 'loss' | 'ecell' | 'pctDiff' | 'molesFe' | 'massCu' | 'yield' | 'dT' | 'o2Vol' | 'o2Pct';
export const ELECTRO_ANSWER_IDS: ElectroAnswerId[] = ['charge', 'molesCu', 'massCalc', 'gain', 'loss', 'ecell', 'pctDiff', 'molesFe', 'massCu', 'yield', 'dT', 'o2Vol', 'o2Pct'];
export type ElectroUnit = 'C' | 'mol' | 'g' | 'V' | '%' | 'degC' | 'cm3';
export interface ElectroTaskDef {
  id: ElectroAnswerId;
  label: string;
  unit: ElectroUnit;
}

export interface ChemElectroVariant {
  seed: number;
  task: ElectroTask;
  elec: ElecVariant;
  cell: CellVariant;
  disp: DispVariant;
  rust: RustVariant;
  tasks: ElectroTaskDef[];
  given: string[];
}

function tasksFor(task: ElectroTask): ElectroTaskDef[] {
  if (task === 'ELEC')
    return [
      { id: 'charge', label: 'Quantity of electricity passed, Q = It', unit: 'C' },
      { id: 'molesCu', label: 'Amount (moles) of copper that Q deposits (Cu²⁺ + 2e⁻ → Cu)', unit: 'mol' },
      { id: 'massCalc', label: 'Calculated mass of copper deposited, m = QM/(nF)', unit: 'g' },
      { id: 'gain', label: 'Mass gained by the cathode (measured)', unit: 'g' },
      { id: 'loss', label: 'Mass lost by the anode (measured)', unit: 'g' },
    ];
  if (task === 'CELL')
    return [
      { id: 'ecell', label: 'E°cell from the standard electrode potentials', unit: 'V' },
      { id: 'pctDiff', label: 'Percentage difference between E°cell and your measured e.m.f.', unit: '%' },
    ];
  if (task === 'DISP')
    return [
      { id: 'molesFe', label: 'Amount (moles) of iron used', unit: 'mol' },
      { id: 'massCu', label: 'Theoretical mass of copper (Fe + CuSO₄ → FeSO₄ + Cu)', unit: 'g' },
      { id: 'yield', label: 'Percentage of the theoretical mass obtained', unit: '%' },
      { id: 'dT', label: 'Temperature rise', unit: 'degC' },
    ];
  return [
    { id: 'o2Vol', label: 'Volume of oxygen used by the iron wool', unit: 'cm3' },
    { id: 'o2Pct', label: 'Percentage of oxygen in the air', unit: '%' },
  ];
}

export interface ElectroOverrides {
  electrodes?: ElecElectrode;
  elecConc?: number;
  cZn?: number;
  cCu?: number;
  dispConc?: number;
  salt?: number;
}

function build(seed: number, task: ElectroTask, o: ElectroOverrides = {}): ChemElectroVariant {
  const r = labRandom(seed, `chem-electro-${task}`);
  const room = labBetween(r, 25, 30, 1);
  const elec: ElecVariant = {
    emf: labBetween(r, 5.9, 6.1, 2),
    rInt: labBetween(r, 0.2, 0.4, 2),
    rCell: labBetween(r, 3.4, 4.6, 2),
    drift: labBetween(r, 0.11, 0.16, 3),
    p1: labBetween(r, 11.8, 13.2, 2),
    p2: labBetween(r, 12.0, 13.4, 2),
    sand1: labBetween(r, 0.01, 0.03, 2),
    sand2: labBetween(r, 0.01, 0.03, 2),
    eff: labBetween(r, 0.988, 0.998, 3),
    sludge: labBetween(r, 0.003, 0.009, 3),
    rubLoss: labBetween(r, 0.12, 0.22, 3),
    flake: labBetween(r, 0.03, 0.06, 3),
    wet: labBetween(r, 0.03, 0.06, 2),
    ox: labBetween(r, 0.01, 0.03, 2),
    electrodes: o.electrodes ?? 'CU',
    conc: o.elecConc ?? 1,
  };
  const r2 = labRandom(seed, 'chem-electro-cell');
  const cell: CellVariant = {
    loss: labBetween(r2, 0.006, 0.032, 3),
    dirty: labBetween(r2, 0.05, 0.11, 3),
    rInt: labBetween(r2, 300, 600, 0),
    swapped: labBetween(r2, 0.02, 0.07, 2),
    cZn: o.cZn ?? 1,
    cCu: o.cCu ?? 1,
    room,
  };
  const r3 = labRandom(seed, 'chem-electro-disp');
  const disp: DispVariant = {
    conc: o.dispConc ?? sf3(labBetween(r3, 0.48, 0.52, 3)),
    taps: Array.from({ length: 24 }, () => labBetween(r3, 0.05, 0.13, 2)),
    paper: labBetween(r3, 0.85, 1.15, 2),
    loss: labBetween(r3, 0.015, 0.04, 3),
    unwashed: labBetween(r3, 0.03, 0.06, 2),
    damp: labBetween(r3, 0.01, 0.03, 2),
    ox: labBetween(r3, 0.02, 0.04, 2),
    wet: labBetween(r3, 0.1, 0.16, 2),
    rustyDone: labBetween(r3, 0.84, 0.9, 2),
    room,
  };
  const r4 = labRandom(seed, 'chem-electro-rust');
  const rust: RustVariant = {
    rate: labBetween(r4, 0.15, 0.21, 3),
    salt: o.salt ?? labBetween(r4, 2.2, 3.0, 2),
    f: labBetween(r4, 0.93, 0.985, 3),
    tau: labBetween(r4, 0.9, 1.4, 2),
    bore: labBetween(r4, 0.85, 1.1, 2),
    swing: labBetween(r4, 0.8, 1.8, 1),
    phase: labBetween(r4, 0, 6.28, 2),
    room,
  };
  const given =
    task === 'ELEC'
      ? ['You are provided with 1.0 mol dm⁻³ copper(II) tetraoxosulphate(VI) solution, two copper plates, an ammeter, a rheostat, a key and a d.c. supply.', `Electrolyse the solution with the copper plates as electrodes at a steady current of 0.50 A for 40 minutes. Weigh both plates before and after, and compare the mass gained by the cathode with the mass calculated from Faraday's first law.`, 'Cu²⁺ + 2e⁻ → Cu. (Cu = 63.5; F = 96 500 C mol⁻¹)']
      : task === 'CELL'
        ? ['You are provided with zinc and copper strips, 1.0 mol dm⁻³ ZnSO₄ and 1.0 mol dm⁻³ CuSO₄, filter paper, saturated KNO₃ and a voltmeter.', 'Construct a zinc–copper cell, measure its e.m.f. with and without the salt bridge, and compare it with the value from the standard electrode potentials.', 'E°(Zn²⁺/Zn) = −0.76 V; E°(Cu²⁺/Cu) = +0.34 V.']
        : task === 'DISP'
          ? [`You are provided with iron filings and ${disp.conc.toFixed(2)} mol dm⁻³ copper(II) tetraoxosulphate(VI) solution.`, 'Add about 0.56 g of iron filings to 50 cm³ of the solution (an excess), stirring. Note the temperature change and the colours, then filter off, wash, dry and weigh the copper formed.', 'Fe + CuSO₄ → FeSO₄ + Cu. (Fe = 56, Cu = 63.5)']
          : ['You are provided with clean iron nails, test tubes, anhydrous calcium chloride, oil, salt, iron wool and a graduated tube.', 'Set up tubes A (tap water), B (boiled water under a layer of oil), C (anhydrous CaCl₂, stoppered) and D (salt water); observe them over a week. Find the percentage of oxygen in air from the volume of air used up by moist iron wool.', 'Initial volume of air in the graduated tube: 50.0 cm³.'];
  return { seed, task, elec, cell, disp, rust, tasks: tasksFor(task), given };
}

/** The hidden truth of one attempt (same on the web and the API). */
export function chemElectroVariant(seed: number, task: ElectroTask = 'ELEC'): ChemElectroVariant {
  return build(seed, task);
}
/** A variant from the sandbox's own choices (unmarked). */
export function chemElectroCustomVariant(seed: number, task: ElectroTask, o: ElectroOverrides): ChemElectroVariant {
  return build(seed, task, o);
}

// ================================================================== the student's work

export interface ElecAdjust {
  /** Run time (s on the stopwatch) at which the rheostat was moved, and the slider's step then. */
  t: number;
  step: number;
}
export interface ElecWork {
  sanded: boolean;
  /** Weighed before sanding (so the "before" masses include metal sanded off). */
  sandedAfterWeigh: boolean;
  weighedBefore: boolean;
  /** Which terminal of the supply the plate marked "cathode" was joined to. */
  cathodeTo: 'NEG' | 'POS' | null;
  gap: 'APART' | 'TOUCH' | null;
  connected: boolean;
  /** The rheostat's slider (step 0–120, 0.25 Ω each) and every move of it. */
  rheo: number;
  adjust: ElecAdjust[];
  /** The key is closed (current flowing); seconds it has been closed in all (the stopwatch). */
  closed: boolean;
  ran: number;
  /** Closed with the plates touching: a short circuit. */
  shorted: boolean;
  removed: boolean;
  rinse: 'GENTLE' | 'RUB' | null;
  dry: 'AIR' | 'FLAME' | 'NONE' | null;
  weighedAfter: boolean;
}
export interface CellReading {
  bridge: boolean;
  soaked: boolean;
  sanded: boolean;
  placed: 'RIGHT' | 'SWAPPED';
  meter: CellMeter;
  leads: 'CORRECT' | 'REVERSED';
}
export interface CellWork {
  sanded: boolean;
  placed: 'RIGHT' | 'SWAPPED' | null;
  soaked: boolean;
  bridge: boolean;
  /** The bridge was taken out after a reading with it, and put back afterwards. */
  removedOnce: boolean;
  replaced: boolean;
  meter: CellMeter | null;
  leads: 'CORRECT' | 'REVERSED' | null;
  readings: CellReading[];
}
export interface DispWork {
  filings: DispFilings | null;
  /** Taps of filings on the balance (its reading is the running total). */
  taps: number;
  cuso4: number | null;
  /** The thermometer stood in the solution before the iron went in (the initial temperature can be read). */
  thermo: boolean;
  added: boolean;
  stir: 'STIR' | 'NONE' | null;
  /** Seconds from adding the iron to filtering. */
  elapsed: number | null;
  /** Thermometer left in the beaker throughout the reaction (so the highest temperature was seen). */
  watched: boolean;
  paper: boolean;
  filtered: boolean;
  wash: 'PROPANONE' | 'WATER' | 'NONE' | null;
  dry: 'AIR' | 'FLAME' | 'NONE' | null;
  weighed: boolean;
}
export interface RustTubeWork {
  nail: boolean;
  content: RustContent | null;
  /** Water boiled first (tube B); an oil layer on top; stoppered. */
  boiled: boolean;
  oil: boolean;
  stopper: boolean;
}
export interface RustReading {
  day: number;
  levelled: boolean;
}
export interface RustWork {
  sanded: boolean;
  tubes: Record<RustTube, RustTubeWork>;
  /** The iron wool: moist (or dry), in the graduated tube with 50.0 cm³ of air, inverted in the trough. */
  wool: 'MOIST' | 'DRY' | null;
  /** The week has started (nothing can be changed after); days elapsed so far (lab clock). */
  started: boolean;
  days: number;
  /** Days at which the tubes were looked at. */
  observed: number[];
  readings: RustReading[];
}

export const ELECTRO_REC_KEYS = ['current', 'time', 'cath1', 'cath2', 'an1', 'an2', 'emf', 'emfNo', 'negative', 'fe', 't1', 't2', 'paper', 'paperCu', 'cu', 'rustA', 'rustB', 'rustC', 'rustD', 'most', 'v0', 'vFinal'] as const;
export type ElectroRecKey = (typeof ELECTRO_REC_KEYS)[number];

export interface ElectroAnswer {
  value: string;
  unit: string;
}
export interface ChemElectroState {
  v: 1;
  task: ElectroTask | null;
  elec: ElecWork;
  cell: CellWork;
  disp: DispWork;
  rust: RustWork;
  rec: Record<ElectroRecKey, string>;
  answers: Record<ElectroAnswerId, ElectroAnswer>;
  written: { observation: string; explain: string; precautions: string };
  log: { t: number; a: string }[];
}

const emptyTube = (): RustTubeWork => ({ nail: false, content: null, boiled: false, oil: false, stopper: false });
export function emptyChemElectroState(): ChemElectroState {
  const blank = () => ({ value: '', unit: '' });
  return {
    v: 1,
    task: null,
    elec: { sanded: false, sandedAfterWeigh: false, weighedBefore: false, cathodeTo: null, gap: null, connected: false, rheo: ELEC_RHEO0, adjust: [], closed: false, ran: 0, shorted: false, removed: false, rinse: null, dry: null, weighedAfter: false },
    cell: { sanded: false, placed: null, soaked: false, bridge: false, removedOnce: false, replaced: false, meter: null, leads: null, readings: [] },
    disp: { filings: null, taps: 0, cuso4: null, thermo: false, added: false, stir: null, elapsed: null, watched: false, paper: false, filtered: false, wash: null, dry: null, weighed: false },
    rust: { sanded: false, tubes: { A: emptyTube(), B: emptyTube(), C: emptyTube(), D: emptyTube() }, wool: null, started: false, days: 0, observed: [], readings: [] },
    rec: Object.fromEntries(ELECTRO_REC_KEYS.map((k) => [k, ''])) as Record<ElectroRecKey, string>,
    answers: Object.fromEntries(ELECTRO_ANSWER_IDS.map((k) => [k, blank()])) as Record<ElectroAnswerId, ElectroAnswer>,
    written: { observation: '', explain: '', precautions: '' },
    log: [],
  };
}

// ================================================================== ELEC model

export const elecOhms = (step: number) => step * ELEC_STEP_OHM;
/** Back e.m.f. (V): copper electrodes ≈ 0 (the anode dissolves); carbon electrodes decompose water (O₂ at the anode). */
export const elecBack = (v: ChemElectroVariant) => (v.elec.electrodes === 'C' ? 1.7 : 0.02);
const elecRc = (v: ChemElectroVariant, t: number) => (v.elec.rCell / Math.max(0.2, v.elec.conc)) * (1 - (v.elec.drift * t) / ELEC_RUN);
/** The current (A) at run time t (s) with the slider at `step`. */
export function elecCurrent(v: ChemElectroVariant, step: number, t: number): number {
  const Vn = Math.max(0, v.elec.emf - elecBack(v));
  return Vn / (elecOhms(step) + v.elec.rInt + elecRc(v, t));
}
/** The slider's step in effect at run time t. */
export function elecStepAt(w: Pick<ElecWork, 'adjust'>, t: number): number {
  let step = ELEC_RHEO0;
  for (const a of w.adjust) if (a.t <= t + 1e-9) step = a.step;
  return step;
}
/** Run-time segments [a, b) with one slider setting each. */
export function elecSegments(w: Pick<ElecWork, 'adjust' | 'ran'>): { a: number; b: number; step: number }[] {
  const cuts = [...new Set([0, ...w.adjust.map((x) => x.t).filter((t) => t > 0 && t < w.ran), w.ran])].sort((p, q) => p - q);
  const out: { a: number; b: number; step: number }[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) out.push({ a: cuts[i]!, b: cuts[i + 1]!, step: elecStepAt(w, cuts[i]!) });
  return out;
}
/** Charge passed (C): ∫ I dt in closed form over each segment (I = Vn ÷ (α − βt)). */
export function elecCharge(v: ChemElectroVariant, w: Pick<ElecWork, 'adjust' | 'ran'>): number {
  const Vn = Math.max(0, v.elec.emf - elecBack(v));
  const rc0 = v.elec.rCell / Math.max(0.2, v.elec.conc);
  const beta = (rc0 * v.elec.drift) / ELEC_RUN;
  let q = 0;
  for (const s of elecSegments(w)) {
    const alpha = elecOhms(s.step) + v.elec.rInt + rc0;
    q += (Vn / beta) * Math.log((alpha - beta * s.a) / (alpha - beta * s.b));
  }
  return q;
}
/** Lowest and highest current from `from` s to the end of the run (the current only creeps within a segment). */
export function elecCurrentRange(v: ChemElectroVariant, w: Pick<ElecWork, 'adjust' | 'ran'>, from = ELEC_SETTLE): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const s of elecSegments(w)) {
    const a = Math.max(s.a, from);
    if (a >= s.b) continue;
    for (const t of [a, s.b - 1e-6]) {
      const i = elecCurrent(v, s.step, t);
      min = Math.min(min, i);
      max = Math.max(max, i);
    }
  }
  return min === Infinity ? null : { min, max };
}
/** g of copper deposited on the cathode by the charge passed. */
export const elecDeposit = (v: ChemElectroVariant, w: Pick<ElecWork, 'adjust' | 'ran'>) => ((elecCharge(v, w) * M_CU) / (2 * FARADAY)) * v.elec.eff;
export interface ElecMasses {
  /** Balance readings for the plate marked cathode (P1) and the one marked anode (P2), before and after. */
  cath1: number;
  an1: number;
  cath2: number;
  an2: number;
  /** P1 was really the cathode (joined to −). */
  p1Cathode: boolean;
  deposit: number;
}
export function elecMasses(v: ChemElectroVariant, w: ElecWork): ElecMasses {
  const e = v.elec;
  const s1 = w.sanded ? e.sand1 : 0;
  const s2 = w.sanded ? e.sand2 : 0;
  // what the balance showed at the first weighing, and the true masses going into the cell
  const cath1 = roundDp(e.p1 - (w.sanded && !w.sandedAfterWeigh ? s1 : 0), 2);
  const an1 = roundDp(e.p2 - (w.sanded && !w.sandedAfterWeigh ? s2 : 0), 2);
  const in1 = e.p1 - s1;
  const in2 = e.p2 - s2;
  const dep = w.shorted && w.ran === 0 ? 0 : elecDeposit(v, w);
  const p1Cathode = w.cathodeTo !== 'POS';
  const kept = dep * (1 - (w.sanded ? 0 : e.flake)) * (w.rinse === 'RUB' ? 1 - e.rubLoss : 1);
  const extra = w.dry === 'NONE' || w.dry === null ? e.wet : w.dry === 'FLAME' ? e.ox : 0;
  // copper electrodes: the anode dissolves; carbon: it is not attacked
  const anodeLoss = e.electrodes === 'CU' ? dep + (dep > 0 ? e.sludge : 0) : 0;
  const cathAfter = in1 + (p1Cathode ? kept : -anodeLoss) + extra;
  const anAfter = in2 + (p1Cathode ? -anodeLoss : kept) + extra;
  return { cath1, an1, cath2: roundDp(cathAfter, 2), an2: roundDp(anAfter, 2), p1Cathode, deposit: dep };
}
/** Faraday chain from the student's own current and time. */
export function elecChain(I: number, t: number) {
  const charge = I * t;
  const molesCu = charge / (2 * FARADAY);
  return { charge, molesCu, massCalc: molesCu * M_CU };
}
/** Cu²⁺ left (mol dm⁻³) — constant with copper electrodes, falling with carbon. */
export function elecCopperConc(v: ChemElectroVariant, w: Pick<ElecWork, 'adjust' | 'ran'>): number {
  if (v.elec.electrodes === 'CU') return v.elec.conc;
  const n = elecCharge(v, w) / (2 * FARADAY);
  return Math.max(0, v.elec.conc - n / 0.15);
}

// ================================================================== CELL model

/** The cell's true e.m.f. (V) under its conditions. */
export function cellEmf(v: ChemElectroVariant, r: Pick<CellReading, 'sanded' | 'placed'>): number {
  if (r.placed === 'SWAPPED') return v.cell.swapped;
  const T = 273 + v.cell.room;
  const nernst = ((8.314 * T) / (2 * FARADAY)) * Math.log(v.cell.cZn / v.cell.cCu);
  return CELL_E0 - nernst - v.cell.loss - (r.sanded ? 0 : v.cell.dirty);
}
/** What the voltmeter shows for reading i (V, 2 d.p.; the last digit flickers between readings). */
export function cellReading(v: ChemElectroVariant, r: CellReading, i: number): number {
  if (!r.bridge || !r.soaked) return 0;
  const E = cellEmf(v, r);
  const Rv = CELL_RV[r.meter];
  const shown = (E * Rv) / (Rv + v.cell.rInt);
  const flick = Math.round((labRandom(v.seed, `cell-read-${i}`)() - 0.5) * 2) * 0.01;
  return roundDp((r.leads === 'REVERSED' ? -1 : 1) * (shown + flick), 2);
}

// ================================================================== DISP model

export const dispFe = (v: ChemElectroVariant, w: Pick<DispWork, 'taps'>) => roundDp(v.disp.taps.slice(0, w.taps).reduce((t, x) => t + x, 0), 2);
export const dispCuMoles = (v: ChemElectroVariant, w: Pick<DispWork, 'cuso4'>) => (v.disp.conc * (w.cuso4 ?? 0)) / 1000;
/** Is the CuSO₄ in excess (at least 20 % more Cu²⁺ than the iron needs)? */
export const dispExcess = (v: ChemElectroVariant, w: Pick<DispWork, 'cuso4' | 'taps'>) => dispCuMoles(v, w) >= (dispFe(v, w) / M_FE) * 1.2;
const dispK = (w: Pick<DispWork, 'stir' | 'filings'>) => (w.stir === 'STIR' ? DISP_K.STIR : DISP_K.NONE) * (w.filings === 'RUSTY' ? 0.6 : 1);
/** mol of iron that can react: limited by the Cu²⁺, and by a rust coat. */
export function dispReactable(v: ChemElectroVariant, w: Pick<DispWork, 'cuso4' | 'taps' | 'filings'>): number {
  const nFe = (dispFe(v, w) / M_FE) * (w.filings === 'RUSTY' ? v.disp.rustyDone : 1);
  return Math.min(nFe, dispCuMoles(v, w));
}
/** Fraction of the reaction done after t s. */
export const dispExtent = (w: Pick<DispWork, 'stir' | 'filings'>, t: number) => 1 - Math.exp(-dispK(w) * Math.max(0, t));
/** Adiabatic temperature rise for the whole reaction (°C). */
export const dispRiseMax = (v: ChemElectroVariant, w: Pick<DispWork, 'cuso4' | 'taps' | 'filings'>) => (dispReactable(v, w) * -DISP_DH * 1000) / ((w.cuso4 ?? 50) * 4.18 + DISP_GLASS);
/** The solution's temperature t s after the iron went in (heat released at rate k, Newton cooling). */
export function dispTemp(v: ChemElectroVariant, w: Pick<DispWork, 'cuso4' | 'taps' | 'filings' | 'stir'>, t: number): number {
  const k = dispK(w);
  const l = DISP_COOL;
  const A = dispRiseMax(v, w);
  if (t <= 0) return v.disp.room;
  return v.disp.room + ((A * k) / (k - l)) * (Math.exp(-l * t) - Math.exp(-k * t));
}
/** The highest temperature reached up to `until` s. */
export function dispPeak(v: ChemElectroVariant, w: Pick<DispWork, 'cuso4' | 'taps' | 'filings' | 'stir'>, until: number): number {
  const k = dispK(w);
  const tStar = Math.log(k / DISP_COOL) / (k - DISP_COOL);
  return dispTemp(v, w, Math.min(until, tStar));
}
/** Cu²⁺ and Fe²⁺ left in solution t s after adding (mol dm⁻³) — for the colour. */
export function dispIons(v: ChemElectroVariant, w: DispWork, t: number): { cu: number; fe: number } {
  const vol = (w.cuso4 ?? 50) / 1000;
  const n = w.added ? dispReactable(v, w) * dispExtent(w, t) : 0;
  return { cu: Math.max(0, dispCuMoles(v, w) - n) / vol, fe: n / vol };
}
export interface DispProduct {
  /** g of copper and unreacted iron on the paper, and the balance reading of paper + solid. */
  cu: number;
  fe: number;
  total: number;
}
export function dispProduct(v: ChemElectroVariant, w: DispWork): DispProduct {
  const t = w.elapsed ?? 0;
  const n = dispReactable(v, w) * dispExtent(w, t);
  const nFe = dispFe(v, w) / M_FE;
  const cu = n * M_CU * (1 - v.disp.loss);
  const fe = Math.max(0, nFe - n) * M_FE * (1 - v.disp.loss);
  let extra = 0;
  if (w.wash === 'NONE' || w.wash === null) extra += v.disp.unwashed;
  if (w.dry === 'NONE' || w.dry === null) extra += v.disp.wet;
  else if (w.wash === 'WATER' && w.dry === 'AIR') extra += v.disp.damp;
  if (w.dry === 'FLAME') extra += v.disp.ox;
  return { cu, fe, total: roundDp(v.disp.paper + cu + fe + extra, 2) };
}
export function dispChain(fe: number, cu: number | null, molesFe?: number | null, massCu?: number | null) {
  const n = fe / M_FE;
  const theo = (molesFe ?? n) * M_CU;
  return { molesFe: n, massCu: n * M_CU, yield: cu === null ? null : (cu / (massCu ?? theo)) * 100 };
}

// ================================================================== RUST model

/** How strongly each tube's set-up lets the nail rust (1 = tap water). */
export function rustFactor(v: ChemElectroVariant, t: RustTubeWork): number {
  if (!t.nail || !t.content) return 0;
  switch (t.content) {
    case 'TAP':
      return t.oil ? 0.25 : 1;
    case 'SALT':
      return v.rust.salt * (t.oil ? 0.25 : 1);
    case 'BOILED':
      // boiled water under oil: no dissolved oxygen, none can get in
      return t.boiled ? (t.oil ? 0 : 0.5) : t.oil ? 0.35 : 1;
    case 'CACL2':
      return t.stopper ? 0 : 0.3;
  }
}
/** Rust index of a tube's nail after `day` days (≥ RUST_SEEN shows as rust); unsanded nails start late and rust patchily. */
export function rustIndex(v: ChemElectroVariant, w: Pick<RustWork, 'sanded' | 'tubes'>, tube: RustTube, day: number): number {
  const f = rustFactor(v, w.tubes[tube]);
  const d = Math.max(0, day - (w.sanded ? 0 : 1));
  return f * v.rust.rate * d * (w.sanded ? 1 : 0.6);
}
export const rustSeen = (x: number) => x >= RUST_SEEN;
export type RustLook = 'NONE' | 'SLIGHT' | 'MUCH' | 'HEAVY';
export const rustLook = (x: number): RustLook => (x < RUST_SEEN ? 'NONE' : x < 0.45 ? 'SLIGHT' : x < 1.4 ? 'MUCH' : 'HEAVY');
/** Day temperature (°C) of the room. */
export const rustTemp = (v: ChemElectroVariant, day: number) => v.rust.room + v.rust.swing * Math.sin(2 * Math.PI * day + v.rust.phase) - v.rust.swing * Math.sin(v.rust.phase);
/** The air left in the graduated tube at room pressure and the starting temperature (cm³). */
export function woolGas(v: ChemElectroVariant, w: Pick<RustWork, 'wool'>, day: number): number {
  if (!w.wool) return RUST_V0;
  const k = w.wool === 'MOIST' ? 1 : 0.12;
  return RUST_V0 * (1 - 0.209 * v.rust.f * (1 - Math.exp((-k * Math.max(0, day)) / v.rust.tau)));
}
/** What the graduated tube's scale shows at `day` (cm³): warmer days expand the gas, and an unlevelled tube holds it below atmospheric pressure. */
export function woolReading(v: ChemElectroVariant, w: Pick<RustWork, 'wool'>, day: number, levelled: boolean): number {
  const g = woolGas(v, w, day);
  const T = (273 + rustTemp(v, day)) / (273 + v.rust.room);
  let V = g * T;
  if (!levelled) {
    const h = (RUST_V0 - V) / v.rust.bore; // cm of water standing above the trough's level
    V = (V * 1013) / (1013 - 0.981 * h);
  }
  return V;
}
/** Has the level stopped rising (within the last day less than 0.5 cm³)? */
export const woolSettled = (v: ChemElectroVariant, w: Pick<RustWork, 'wool'>, day: number) => w.wool === 'MOIST' && woolGas(v, w, day - 1) - woolGas(v, w, day) < 0.25;
export const rustChain = (v0: number, v1: number) => ({ o2Vol: v0 - v1, o2Pct: ((v0 - v1) / v0) * 100 });

// ================================================================== schema

const short = z.string().max(40);
const num = (a: number, b: number) => z.number().min(a).max(b);
const answer = z.object({ value: short, unit: short });
const tubeSchema = z.object({ nail: z.boolean(), content: z.enum(RUST_CONTENT).nullable(), boiled: z.boolean(), oil: z.boolean(), stopper: z.boolean() });
export const chemElectroStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(ELECTRO_TASKS).nullable(),
  elec: z.object({
    sanded: z.boolean(),
    sandedAfterWeigh: z.boolean(),
    weighedBefore: z.boolean(),
    cathodeTo: z.enum(['NEG', 'POS']).nullable(),
    gap: z.enum(['APART', 'TOUCH']).nullable(),
    connected: z.boolean(),
    rheo: z.number().int().min(0).max(ELEC_STEPS),
    adjust: z.array(z.object({ t: num(0, 20_000), step: z.number().int().min(0).max(ELEC_STEPS) })).max(400),
    closed: z.boolean(),
    ran: num(0, 20_000),
    shorted: z.boolean(),
    removed: z.boolean(),
    rinse: z.enum(['GENTLE', 'RUB']).nullable(),
    dry: z.enum(['AIR', 'FLAME', 'NONE']).nullable(),
    weighedAfter: z.boolean(),
  }),
  cell: z.object({
    sanded: z.boolean(),
    placed: z.enum(['RIGHT', 'SWAPPED']).nullable(),
    soaked: z.boolean(),
    bridge: z.boolean(),
    removedOnce: z.boolean(),
    replaced: z.boolean(),
    meter: z.enum(['HIGH', 'LOW']).nullable(),
    leads: z.enum(['CORRECT', 'REVERSED']).nullable(),
    readings: z.array(z.object({ bridge: z.boolean(), soaked: z.boolean(), sanded: z.boolean(), placed: z.enum(['RIGHT', 'SWAPPED']), meter: z.enum(['HIGH', 'LOW']), leads: z.enum(['CORRECT', 'REVERSED']) })).max(40),
  }),
  disp: z.object({
    filings: z.enum(['CLEAN', 'RUSTY']).nullable(),
    taps: z.number().int().min(0).max(24),
    cuso4: num(0, 200).nullable(),
    thermo: z.boolean(),
    added: z.boolean(),
    stir: z.enum(['STIR', 'NONE']).nullable(),
    elapsed: num(0, 100_000).nullable(),
    watched: z.boolean(),
    paper: z.boolean(),
    filtered: z.boolean(),
    wash: z.enum(['PROPANONE', 'WATER', 'NONE']).nullable(),
    dry: z.enum(['AIR', 'FLAME', 'NONE']).nullable(),
    weighed: z.boolean(),
  }),
  rust: z.object({
    sanded: z.boolean(),
    tubes: z.object({ A: tubeSchema, B: tubeSchema, C: tubeSchema, D: tubeSchema }),
    wool: z.enum(['MOIST', 'DRY']).nullable(),
    started: z.boolean(),
    days: num(0, 60),
    observed: z.array(num(0, 60)).max(60),
    readings: z.array(z.object({ day: num(0, 60), levelled: z.boolean() })).max(60),
  }),
  rec: z.object(Object.fromEntries(ELECTRO_REC_KEYS.map((k) => [k, short])) as Record<ElectroRecKey, typeof short>),
  answers: z.object(Object.fromEntries(ELECTRO_ANSWER_IDS.map((k) => [k, answer])) as Record<ElectroAnswerId, typeof answer>),
  written: z.object({ observation: z.string().max(2000), explain: z.string().max(2000), precautions: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(800),
}) satisfies z.ZodType<ChemElectroState>;

export const CHEM_ELECTRO: SimulatorSpec = {
  id: 'chem-electro',
  subject: 'Chemistry',
  title: 'Electrochemistry and corrosion',
  topicNames: ['Electrolysis', 'Electrochemical cells', 'Reactivity of iron and aluminium', 'Corrosion of metals', 'Redox reactions'],
  minutes: 50,
  rubric: [
    { id: 'setup', label: 'Setting up', marks: 2, how: 'AUTO', guide: 'Electrolysis: plates cleaned with sandpaper before weighing (1); the cathode joined to the − terminal, ammeter in series, plates apart (1). Cell: strips cleaned (1); zinc in ZnSO₄ and copper in CuSO₄ (1). Displacement: about 0.56 g of clean iron filings weighed (1), CuSO₄ in excess (1). Rusting: nails cleaned (1); B boiled under oil and C dry and stoppered (1).' },
    { id: 'procedure', label: 'Procedure', marks: 5, how: 'AUTO', guide: 'Electrolysis: both plates weighed (1), current set to 0.50 A (1), run for about 40 min (1), plates rinsed gently with water then propanone (1), dried and reweighed (1). Cell: bridge soaked in KNO₃ (1) and joining the beakers (1), voltmeter + to copper, − to zinc (1), e.m.f. read (1), read again with the bridge removed (1). Displacement: initial temperature read (1), stirred (1), left until the reaction was complete (1), filter paper weighed first (1), copper washed, dried and weighed (1). Rusting: tubes A, B, C and D set up as the lesson says (4), left about a week and observed (1).' },
    { id: 'technique', label: 'Technique', marks: 3, how: 'AUTO', guide: 'Electrolysis: current kept constant with the rheostat (1); deposit not rubbed off or heated (1); no short circuit, no flame near propanone (1). Cell: high-resistance voltmeter (1), bridge well soaked (1), readings with the bridge repeatable (1). Displacement: washed with water then propanone (1), dried away from flames (1), thermometer left in to catch the highest temperature (1). Rusting: moist iron wool (1), read when the level had stopped rising (1), levels inside and outside equal (1).' },
    { id: 'readings', label: 'Measurements', marks: 4, how: 'AUTO', guide: 'Electrolysis: masses to 2 d.p. (1) matching the balance (2), current and time as used (1). Cell: e.m.f. as the voltmeter showed (2), to 2 d.p. (1), zero without the bridge (1). Displacement: masses to 2 d.p. (1) matching the balance (1), temperatures to 0.5 °C (1), mass of copper subtracted correctly (1). Rusting: initial volume (1), final volume as the scale showed (1) to 1 d.p. (1), which tubes rusted (1).' },
    { id: 'calculations', label: 'Calculations', marks: 5, how: 'AUTO', guide: 'Electrolysis: Q = It in seconds (1), moles of Cu = Q ÷ 2F (1), mass = moles × 63.5 (1), cathode gain (1) and anode loss (1); errors carried forward. Cell: E°cell = 0.34 − (−0.76) = 1.10 V (2), percentage difference (2), zinc is the negative electrode (1). Displacement: moles of Fe (1), theoretical mass of Cu (1), percentage (2), temperature rise (1). Rusting: volume of oxygen (2), percentage of oxygen (2), the tube that rusted most (1).' },
    { id: 'units', label: 'Units', marks: 1, how: 'AUTO', guide: 'Every answer with its correct unit (C, mol, g, V, %, °C, cm³).' },
    { id: 'observation', label: 'Observations', marks: 2, how: 'AI', guide: 'Electrolysis: pink-brown copper on the cathode; the anode is eaten away; the blue colour stays the same. Cell: about 1.1 V with the bridge, zero without. Displacement: reddish-brown copper forms; blue fades to pale green; the beaker warms. Rusting: reddish-brown rust in A and most in D, none in B and C; water rises in the graduated tube.' },
    { id: 'explain', label: 'Explanation', marks: 1, how: 'AI', guide: 'Electrolysis: Cu → Cu²⁺ + 2e⁻ at the anode replaces the Cu²⁺ + 2e⁻ → Cu removed at the cathode. Cell: zinc is oxidised (negative electrode); the salt bridge completes the circuit and keeps the solutions neutral. Displacement: iron is above copper in the activity series. Rusting: both water and oxygen are needed; salt speeds it up.' },
    { id: 'precautions', label: 'Precautions', marks: 1, how: 'AI', guide: 'Two correct precautions from the lesson, e.g. constant current; washing and drying the deposit gently; electrodes apart; clean metal surfaces; high-resistance voltmeter; bridge well soaked; excess CuSO₄; clean filings; washing and drying the copper; boiling the water; tubes stoppered tightly; levels compared at the same temperature; goggles; no flames near propanone.' },
  ],
};
