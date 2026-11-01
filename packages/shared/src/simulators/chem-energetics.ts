import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { labBetween, labPick, labRandom, roundDp } from './seeded';

/**
 * chem-energetics: WAEC energy changes and solubility. Three tasks, one per lesson:
 *  - NEUT (pr-chem-heat-of-neutralisation): 50.0 cm³ of 1.00 mol dm⁻³ HCl in a
 *         polystyrene cup (supported in a beaker), its steady temperature read;
 *         50.0 cm³ of 1.00 mol dm⁻³ NaOH measured and its temperature read; the
 *         alkali poured quickly in, the cup covered, stirred with the
 *         thermometer and the highest temperature recorded. Q = 100 × 4.2 × ΔT,
 *         n(H₂O) = 0.0500 mol, ΔH = −Q/n (about −57 kJ mol⁻¹).
 *  - SOLN (pr-chem-heat-of-solution): 50.0 cm³ of water in the cup, its
 *         temperature read; 4.00 g of NH₄NO₃ stirred in until dissolved and the
 *         lowest temperature recorded. Q = 50.0 × 4.2 × ΔT, n = 4.00/80,
 *         ΔH = +Q/n (endothermic). Then 2.00 g of NaOH pellets in fresh water
 *         for comparison: the temperature rises (exothermic).
 *  - SOLY (pr-chem-solubility-curve): 4.0 g of KNO₃ and 5.0 cm³ of water in a
 *         boiling tube, warmed in a water bath until dissolved, cooled while
 *         stirring and the temperature at which crystals first appear recorded;
 *         1.0 cm³ more water each time. Solubility = 4.0 × 100 / water (g per
 *         100 g of water) against temperature: a smooth, rising curve.
 *
 * Thermochemistry. The cup's contents are one lumped body: heat released as the
 * solutions mix (or the solid dissolves: a shrinking-particle rate, much slower
 * unstirred), the cup's own heat capacity, Newton's-law heat exchange with the
 * room (a lidded polystyrene cup loses slowly, an open one faster, a glass
 * beaker much faster and soaks up more heat), and a thermometer that lags the
 * liquid (more when the liquid is not stirred). The highest (or lowest)
 * temperature the thermometer shows is therefore a little short of the ideal.
 * Solubility follows real KNO₃ data (13.3 g at 0 °C … 110 g at 60 °C) with a
 * seeded few-per-cent scatter; crystals appear a little below the saturation
 * temperature (supercooling, more without stirring); water evaporates from a
 * hot tube; the tube cools by Newton's law and the thermometer lags it.
 */

export const ENERGETICS_TASKS = ['NEUT', 'SOLN', 'SOLY'] as const;
export type EnergeticsTask = (typeof ENERGETICS_TASKS)[number];
export const ENERGETICS_LESSONS: Record<string, EnergeticsTask> = {
  'pr-chem-heat-of-neutralisation': 'NEUT',
  'pr-chem-heat-of-solution': 'SOLN',
  'pr-chem-solubility-curve': 'SOLY',
};
export const energeticsLessonTask = (practicalId?: string | null): EnergeticsTask => (practicalId && ENERGETICS_LESSONS[practicalId]) || 'NEUT';

/** Given on the paper. */
export const EN_C = 4.2;
export const EN_VOL = 50.0;
export const EN_CONC = 1.0;
export const EN_SOLID = 4.0;
export const EN_NAOH = 2.0;
export const EN_M = { NH4NO3: 80, NAOH: 40, KNO3: 101 } as const;
/** What the measuring cylinders and the balance offer. */
export const EN_VOLS = [25, 50, 100] as const;
export const EN_MASSES = [2.0, 4.0, 8.0] as const;
/** Time-lapse rates of the lab clock. */
export const EN_SPEEDS = [1, 2, 5, 10] as const;
/** A lid within this many seconds of mixing, a first stir within this many, count as "at once". */
export const EN_LID_OK = 10;
export const EN_STIR_OK = 5;
/** The run is watched until at least this long after the temperature turned. */
export const EN_WATCH_PAST = 5;
/** How long a run's curve is computed (s). */
export const EN_MAX_T = 900;
/** SOLY: mass of KNO₃, the first volume of water, the step (cm³), and the water added options. */
export const SOLY_MASS = 4.0;
export const SOLY_WATER0 = 5.0;
export const SOLY_STEP = 1.0;
export const SOLY_ADDS = [0.5, 1.0, 2.0] as const;
/** Temperatures (°C): the water bath, and a direct flame (boiling). */
export const SOLY_BATH = 80;
export const SOLY_FLAME = 100;
/** A temperature recorded within this many seconds of the first crystals counts as "at first appearance". */
export const SOLY_PROMPT = 10;

export type EnVessel = 'CUP' | 'BEAKER';
export type EnRunKind = 'NEUT' | 'SALT' | 'NAOH';
export type SolyHeat = 'BATH' | 'FLAME';
export type EnNature = 'EXO' | 'ENDO';

export type EnAnswerId = 'q' | 'n' | 'dH' | 'sHi' | 'sLo' | 'mass' | 'molal';
export const EN_ANSWER_IDS: EnAnswerId[] = ['q', 'n', 'dH', 'sHi', 'sLo', 'mass', 'molal'];
export type EnUnit = 'J' | 'mol' | 'kJ/mol' | 'g/100g' | 'g' | 'mol/kg';
export interface EnTaskDef {
  id: EnAnswerId;
  label: string;
  unit: EnUnit;
}

/** Real KNO₃ solubility (g per 100 g water) at 0, 10 … 80 °C, and two others for the sandbox. */
export const SOLY_TABLES = {
  KNO3: [13.3, 20.9, 31.6, 45.8, 63.9, 85.5, 110, 138, 169],
  NH4CL: [29.4, 33.3, 37.2, 41.4, 45.8, 50.4, 55.2, 60.2, 65.6],
  NACL: [35.7, 35.8, 36.0, 36.3, 36.6, 37.0, 37.3, 37.8, 38.4],
} as const;
export type SolySalt = keyof typeof SOLY_TABLES;

/** The neutralisation pairs (the sandbox can change them), ΔH per mole of water (J mol⁻¹). */
export const NEUT_PAIRS = {
  'HCL+NAOH': { acid: 'Hydrochloric acid (HCl)', base: 'Sodium hydroxide (NaOH)', dH: -57_100 },
  'HNO3+KOH': { acid: 'Trioxonitrate(V) acid (HNO₃)', base: 'Potassium hydroxide (KOH)', dH: -57_300 },
  'CH3COOH+NAOH': { acid: 'Ethanoic acid (CH₃COOH, weak)', base: 'Sodium hydroxide (NaOH)', dH: -55_500 },
  'HCL+NH3': { acid: 'Hydrochloric acid (HCl)', base: 'Aqueous ammonia (NH₃, weak)', dH: -52_200 },
} as const;
export type NeutPair = keyof typeof NEUT_PAIRS;
/** Salts that can be dissolved (the sandbox): molar mass, ΔH of solution (J mol⁻¹), specific heat of the solid (J g⁻¹ K⁻¹), s to dissolve 4 g stirred. */
export const SALTS = {
  NH4NO3: { name: 'Ammonium trioxonitrate(V)', formula: 'NH₄NO₃', M: 80, dH: 25_700, cs: 1.74, tau: 34 },
  NH4CL: { name: 'Ammonium chloride', formula: 'NH₄Cl', M: 53.5, dH: 14_800, cs: 1.57, tau: 40 },
  KNO3: { name: 'Potassium trioxonitrate(V)', formula: 'KNO₃', M: 101, dH: 34_900, cs: 0.95, tau: 46 },
  NAOH: { name: 'Sodium hydroxide', formula: 'NaOH', M: 40, dH: -44_500, cs: 1.49, tau: 80 },
  CACL2: { name: 'Calcium chloride (anhydrous)', formula: 'CaCl₂', M: 111, dH: -81_300, cs: 0.67, tau: 55 },
} as const;
export type SaltId = keyof typeof SALTS;

export interface ChemEnergeticsVariant {
  seed: number;
  task: EnergeticsTask;
  /** Room temperature (°C). */
  room: number;
  /** Steady temperatures (°C) of the acid, the alkali and the distilled water standing in the lab. */
  tA: number;
  tB: number;
  tW: number;
  /** NEUT: the pair and its true ΔH (J per mol of water); the true concentrations (mol dm⁻³). */
  pair: NeutPair;
  dHneut: number;
  cAcid: number;
  cBase: number;
  /** SOLN: the salt dissolved (marked part) and the comparison (NaOH). */
  salt: SaltId;
  dHsalt: number;
  dHnaoh: number;
  /** J K⁻¹: the polystyrene cup (+ thermometer), and a glass beaker. */
  cupC: number;
  beakerC: number;
  /** s⁻¹: Newton's-law constants of a lidded cup, an open cup and a glass beaker. */
  kLid: number;
  kOpen: number;
  kBeaker: number;
  /** s: the thermometer's time constant in stirred liquid. */
  lag: number;
  /** s: mixing time constant of stirred solutions. */
  mixTau: number;
  /** s: the time for the solid to dissolve completely when stirred (salt; NaOH pellets). */
  saltTau: number;
  naohTau: number;
  /** SOLY: the salt's solubility table and this attempt's scatter factor. */
  solySalt: SolySalt;
  solFactor: number;
  /** °C below the saturation temperature at which crystals appear when stirred. */
  superStir: number;
  /** s: the tube's cooling time constant in air, and the thermometer's lag in it. */
  coolTau: number;
  tubeLag: number;
  /** SOLY questions: read the solubility at these temperatures from the curve. */
  tHi: number;
  tLo: number;
  given: string[];
  tasks: EnTaskDef[];
}

function tasksFor(task: EnergeticsTask, v: Pick<ChemEnergeticsVariant, 'tHi' | 'tLo'>): EnTaskDef[] {
  if (task === 'NEUT')
    return [
      { id: 'q', label: 'Heat given out, Q = mcΔT (take the mixture as 100 g, c = 4.2 J g⁻¹ K⁻¹)', unit: 'J' },
      { id: 'n', label: 'Amount (moles) of water formed', unit: 'mol' },
      { id: 'dH', label: 'Heat of neutralisation, ΔH, in kJ mol⁻¹ (with its sign)', unit: 'kJ/mol' },
    ];
  if (task === 'SOLN')
    return [
      { id: 'q', label: 'Heat absorbed, Q = mcΔT (50.0 g of water, c = 4.2 J g⁻¹ K⁻¹)', unit: 'J' },
      { id: 'n', label: 'Amount (moles) of NH₄NO₃ dissolved (NH₄NO₃ = 80 g mol⁻¹)', unit: 'mol' },
      { id: 'dH', label: 'Heat of solution of NH₄NO₃, ΔH, in kJ mol⁻¹ (with its sign)', unit: 'kJ/mol' },
    ];
  return [
    { id: 'sHi', label: `Solubility of KNO₃ at ${v.tHi} °C, read from your curve`, unit: 'g/100g' },
    { id: 'sLo', label: `Solubility of KNO₃ at ${v.tLo} °C, read from your curve`, unit: 'g/100g' },
    { id: 'mass', label: `Mass of crystals deposited when a solution saturated in 100 g of water at ${v.tHi} °C cools to ${v.tLo} °C`, unit: 'g' },
    { id: 'molal', label: `Solubility at ${v.tLo} °C in mol per kg of water (KNO₃ = 101 g mol⁻¹)`, unit: 'mol/kg' },
  ];
}

const GIVEN: Record<EnergeticsTask, string[]> = {
  NEUT: ['A is 1.00 mol dm⁻³ hydrochloric acid (HCl).', 'B is 1.00 mol dm⁻³ sodium hydroxide (NaOH).', 'Take the density of the mixture as 1.00 g cm⁻³ and its specific heat capacity as 4.2 J g⁻¹ K⁻¹.'],
  SOLN: ['C is solid ammonium trioxonitrate(V), NH₄NO₃ (N = 14, H = 1, O = 16).', 'D is sodium hydroxide pellets (corrosive: use the spatula, never fingers).', 'Take the specific heat capacity of water as 4.2 J g⁻¹ K⁻¹ and 1.00 cm³ of water as 1.00 g.'],
  SOLY: ['E is solid potassium trioxonitrate(V), KNO₃ (K = 39, N = 14, O = 16).', 'Distilled water from a burette; 1.0 cm³ of water has a mass of 1.0 g.'],
};

/** The hidden truth of one attempt (same on the web and the API). */
export function chemEnergeticsVariant(seed: number, task: EnergeticsTask = 'NEUT'): ChemEnergeticsVariant {
  const r = labRandom(seed, `chem-energetics-${task}`);
  const room = labBetween(r, 24, 28, 1);
  const tHi = labPick(r, [42, 43, 44]);
  const tLo = labPick(r, [35, 36, 37]);
  const v: ChemEnergeticsVariant = {
    seed,
    task,
    room,
    tA: roundDp(room + labBetween(r, -0.6, 0.2, 2), 2),
    tB: roundDp(room + labBetween(r, -0.9, 0.3, 2), 2),
    tW: roundDp(room + labBetween(r, -0.7, 0.1, 2), 2),
    pair: 'HCL+NAOH',
    dHneut: labBetween(r, -57_600, -56_600, -1),
    cAcid: EN_CONC * (1 + labBetween(r, -0.004, 0.004, 4)),
    cBase: EN_CONC * (1 + labBetween(r, -0.004, 0.004, 4)),
    salt: 'NH4NO3',
    dHsalt: labBetween(r, 25_200, 26_200, -1),
    dHnaoh: labBetween(r, -45_000, -44_000, -1),
    cupC: labBetween(r, 8, 15, 1),
    beakerC: labBetween(r, 85, 110, 0),
    kLid: 1 / labBetween(r, 1300, 1800, 0),
    kOpen: 1 / labBetween(r, 600, 800, 0),
    kBeaker: 1 / labBetween(r, 330, 420, 0),
    lag: labBetween(r, 6, 9, 1),
    mixTau: labBetween(r, 1.2, 2.0, 2),
    saltTau: labBetween(r, 28, 40, 0),
    naohTau: labBetween(r, 70, 95, 0),
    solySalt: 'KNO3',
    solFactor: 1 + labBetween(r, -0.025, 0.025, 4),
    superStir: labBetween(r, 0.3, 0.9, 2),
    coolTau: labBetween(r, 140, 180, 0),
    tubeLag: labBetween(r, 3, 5, 1),
    tHi,
    tLo,
    given: GIVEN[task],
    tasks: [],
  };
  v.tasks = tasksFor(task, v);
  return v;
}

/** A variant from the sandbox's choices (unmarked): the room, the neutralisation pair, the salt, the solubility table. */
export function chemEnergeticsCustomVariant(seed: number, task: EnergeticsTask, o: { room: number; pair?: NeutPair; conc?: number; salt?: SaltId; solySalt?: SolySalt }): ChemEnergeticsVariant {
  const v = chemEnergeticsVariant(seed, task);
  const salt = o.salt ?? v.salt;
  return {
    ...v,
    room: o.room,
    tA: o.room,
    tB: o.room,
    tW: o.room,
    pair: o.pair ?? v.pair,
    dHneut: NEUT_PAIRS[o.pair ?? v.pair].dH,
    cAcid: o.conc ?? EN_CONC,
    cBase: o.conc ?? EN_CONC,
    salt,
    dHsalt: SALTS[salt].dH,
    saltTau: SALTS[salt].tau,
    solySalt: o.solySalt ?? 'KNO3',
    solFactor: 1,
  };
}

// ------------------------------------------------------------------ the cup: heat of neutralisation and of solution

/** What the curve of one run depends on. */
export interface EnCurveRun {
  kind: EnRunKind;
  /** Index of the run (its measuring scatter). */
  n: number;
  vessel: EnVessel;
  /** cm³: acid (NEUT) or water (SOLN); alkali (NEUT, else 0). */
  volA: number;
  volB: number;
  /** g of solid (SOLN). */
  solid: number;
  /** s after mixing when stirring started / the lid went on (null: never). */
  stirAt: number | null;
  lidAt: number | null;
}
const STEP = 0.25;
const DT = 0.05;
interface CupCurve {
  T: Float32Array;
  th: Float32Array;
  dis: Float32Array;
  T0: number;
}
const cupCache = new Map<string, CupCurve>();
const scatter = (v: ChemEnergeticsVariant, n: number) => {
  const r = labRandom(v.seed, `en-run-${n}`);
  return { a: labBetween(r, -0.25, 0.25, 2), b: labBetween(r, -0.25, 0.25, 2), m: labBetween(r, -0.004, 0.004, 3) };
};
/** The starting temperature of the cup's contents when mixing (°C). */
export function enStartTemp(v: ChemEnergeticsVariant, run: Pick<EnCurveRun, 'kind' | 'n' | 'vessel' | 'volA' | 'volB' | 'solid'>): number {
  return cupCurve(v, { ...run, stirAt: 0, lidAt: 0 }).T0;
}
function cupCurve(v: ChemEnergeticsVariant, run: EnCurveRun): CupCurve {
  const key = [v.seed, v.task, v.room, v.tA, v.tB, v.tW, v.dHneut, v.dHsalt, v.dHnaoh, v.salt, v.cAcid, run.kind, run.n, run.vessel, run.volA, run.volB, run.solid, run.stirAt, run.lidAt].join('|');
  const hit = cupCache.get(key);
  if (hit) return hit;
  const z = scatter(v, run.n);
  const Cv = run.vessel === 'CUP' ? v.cupC : v.beakerC;
  let C: number;
  let Q: number;
  let T0: number;
  let tauD = 0;
  if (run.kind === 'NEUT') {
    const a = Math.max(0, run.volA + (run.volA ? z.a : 0));
    const b = Math.max(0, run.volB + (run.volB ? z.b : 0));
    const n = Math.min((v.cAcid * a) / 1000, (v.cBase * b) / 1000);
    Q = -v.dHneut * n;
    // 0.5 mol dm⁻³ NaCl solution: 1.02 g cm⁻³, 4.02 J g⁻¹ K⁻¹
    const ca = a * 4.1;
    const cb = b * 4.1;
    C = ca + cb + Cv;
    T0 = (ca * v.tA + cb * v.tB + Cv * v.tA) / Math.max(1e-9, C);
  } else {
    const salt = run.kind === 'NAOH' ? SALTS.NAOH : SALTS[v.salt];
    const dH = run.kind === 'NAOH' ? v.dHnaoh : v.dHsalt;
    const w = Math.max(0, run.volA + (run.volA ? z.a : 0));
    const m = Math.max(0, run.solid + (run.solid ? z.m : 0));
    Q = (-dH * m) / salt.M;
    const cw = w * 4.18;
    const cs = m * salt.cs;
    C = cw + cs + Cv;
    T0 = (cw * v.tW + Cv * v.tW + cs * v.room) / Math.max(1e-9, C);
    // bigger pieces take longer: time ∝ (mass)^(1/3) of a pile of particles
    tauD = (run.kind === 'NAOH' ? v.naohTau : v.saltTau) * Math.cbrt(Math.max(0.25, m) / (run.kind === 'NAOH' ? EN_NAOH : EN_SOLID));
  }
  const samples = Math.round(EN_MAX_T / STEP) + 1;
  const T = new Float32Array(samples);
  const th = new Float32Array(samples);
  const dis = new Float32Array(samples);
  let t = 0;
  let temp = T0;
  let theta = T0;
  let f = 0;
  T[0] = T0;
  th[0] = T0;
  const per = Math.round(STEP / DT);
  for (let i = 1; i < samples; i++) {
    for (let k = 0; k < per; k++) {
      const stirred = run.stirAt !== null && t >= run.stirAt;
      let df: number;
      if (run.kind === 'NEUT') df = ((1 - f) / (stirred ? v.mixTau : 9)) * DT;
      else df = f >= 1 ? 0 : ((3 * Math.cbrt((1 - f) ** 2)) / (tauD * (stirred ? 1 : 5))) * DT;
      df = Math.min(1 - f, df);
      f += df;
      const lid = run.lidAt !== null && t >= run.lidAt;
      const kLoss = run.vessel === 'BEAKER' ? v.kBeaker * (lid ? 0.85 : 1) : lid ? v.kLid : v.kOpen;
      temp += (Q * df) / C - kLoss * (temp - v.room) * DT;
      theta += ((temp - theta) / (v.lag * (stirred ? 1 : 2.5))) * DT;
      t += DT;
    }
    T[i] = temp;
    th[i] = theta;
    dis[i] = f;
  }
  const out = { T, th, dis, T0 };
  if (cupCache.size > 96) cupCache.clear();
  cupCache.set(key, out);
  return out;
}
const at = (a: Float32Array, t: number) => {
  const x = Math.max(0, Math.min(a.length - 1, t / STEP));
  const i = Math.floor(x);
  return i >= a.length - 1 ? a[a.length - 1]! : a[i]! + (a[i + 1]! - a[i]!) * (x - i);
};
/** The cup's liquid temperature (°C) t s after mixing. */
export const enTemp = (v: ChemEnergeticsVariant, run: EnCurveRun, t: number) => at(cupCurve(v, run).T, t);
/** What the thermometer in the cup shows (°C) t s after mixing (it lags the liquid). */
export const enThermo = (v: ChemEnergeticsVariant, run: EnCurveRun, t: number) => at(cupCurve(v, run).th, t);
/** Fraction mixed (NEUT) or dissolved (SOLN) t s after mixing. */
export const enDissolved = (v: ChemEnergeticsVariant, run: EnCurveRun, t: number) => at(cupCurve(v, run).dis, t);
/** The extreme the thermometer shows in [0, until] s (highest, or lowest for an endothermic salt), and when. */
export function enExtreme(v: ChemEnergeticsVariant, run: EnCurveRun, until = EN_MAX_T): { value: number; at: number; T0: number } {
  const c = cupCurve(v, run);
  const low = run.kind === 'SALT' && v.dHsalt > 0;
  const n = Math.min(c.th.length - 1, Math.floor(Math.max(0, until) / STEP));
  let best = c.th[0]!;
  let when = 0;
  for (let i = 1; i <= n; i++) {
    const x = c.th[i]!;
    if (low ? x < best : x > best) {
      best = x;
      when = i * STEP;
    }
  }
  return { value: best, at: when, T0: c.T0 };
}
/** The run done right: polystyrene cup, the card's volumes and mass, stirred at once, covered at once. */
export function enIdealRun(kind: EnRunKind, n = 0): EnCurveRun {
  return { kind, n, vessel: 'CUP', volA: EN_VOL, volB: kind === 'NEUT' ? EN_VOL : 0, solid: kind === 'NEUT' ? 0 : kind === 'NAOH' ? EN_NAOH : EN_SOLID, stirAt: 0.5, lidAt: 3 };
}
/** The steady temperature the thermometer settles to in a liquid standing on the bench. */
export const enSteady = (v: ChemEnergeticsVariant, what: 'A' | 'B' | 'W') => (what === 'A' ? v.tA : what === 'B' ? v.tB : v.tW);

// ------------------------------------------------------------------ the boiling tube: solubility

/** Solubility (g per 100 g of water) at T °C. */
export function solySolubility(v: Pick<ChemEnergeticsVariant, 'solySalt' | 'solFactor'>, T: number): number {
  const tab = SOLY_TABLES[v.solySalt];
  const x = Math.max(0, Math.min(tab.length - 1.0001, T / 10));
  const i = Math.floor(x);
  const f = x - i;
  // Catmull–Rom between the tabulated points (smooth, through every point)
  const p0 = tab[Math.max(0, i - 1)]!;
  const p1 = tab[i]!;
  const p2 = tab[i + 1]!;
  const p3 = tab[Math.min(tab.length - 1, i + 2)]!;
  const s = 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
  return s * v.solFactor;
}
/** The saturation temperature (°C) of a solution of S g per 100 g of water (rising curves only); null when it would be outside 0–80 °C. */
export function solySatTemp(v: Pick<ChemEnergeticsVariant, 'solySalt' | 'solFactor'>, S: number): number | null {
  if (S < solySolubility(v, 0) || S > solySolubility(v, 79.99)) return null;
  let lo = 0;
  let hi = 79.99;
  for (let k = 0; k < 50; k++) {
    const m = (lo + hi) / 2;
    if (solySolubility(v, m) < S) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}
/** g of water evaporating per second from the hot tube at T °C (a direct flame makes it boil and spit). */
export const solyEvaporation = (T: number, heat: SolyHeat) => (T < 50 ? 0 : 0.0006 * Math.exp((Math.min(T, 100) - 80) / 10) * (heat === 'FLAME' ? 3 : 1));
/** s for the tube to warm from T0 towards the bath. */
export const SOLY_HEAT_TAU = 25;
/** The tube's temperature t s after it went into the bath at T0. */
export const solyHeatTemp = (T0: number, heat: SolyHeat, t: number) => {
  const Tb = heat === 'FLAME' ? SOLY_FLAME : SOLY_BATH;
  return Tb + (T0 - Tb) * Math.exp(-t / (heat === 'FLAME' ? 15 : SOLY_HEAT_TAU));
};
/** Cooling in air from T0 (stirred): the liquid and the lagging thermometer (θ = T0 at the start). */
export function solyCool(v: ChemEnergeticsVariant, T0: number, stirred: boolean, t: number): { T: number; theta: number } {
  const A = T0 - v.room;
  const tc = v.coolTau * (stirred ? 1 : 1.25);
  const tl = v.tubeLag * (stirred ? 1 : 2);
  const T = v.room + A * Math.exp(-t / tc);
  const theta = v.room + (A * (tc * Math.exp(-t / tc) - tl * Math.exp(-t / tl))) / (tc - tl);
  return { T, theta };
}
/** The temperature at which crystals first appear on cooling (supercooling below saturation; more without stirring). */
export function solyAppearTemp(v: ChemEnergeticsVariant, water: number, lost: number, stirred: boolean, mass = SOLY_MASS): number | null {
  const sat = solySatTemp(v, (mass * 100) / Math.max(0.5, water - lost));
  if (sat === null) return null;
  return sat - v.superStir - (stirred ? 0 : 2.5);
}
/** s after the tube leaves the bath at T0 when crystals first appear (Infinity: it never gets that cool). */
export function solyAppearTime(v: ChemEnergeticsVariant, T0: number, appear: number | null, stirred: boolean): number {
  if (appear === null || appear <= v.room + 0.05) return Infinity;
  if (T0 <= appear) return 0;
  return -v.coolTau * (stirred ? 1 : 1.25) * Math.log((appear - v.room) / (T0 - v.room));
}
/** The true saturation temperature of a run (from what is really in the tube). */
export const solyTrueSat = (v: ChemEnergeticsVariant, water: number, lost: number, mass = SOLY_MASS) => solySatTemp(v, (mass * 100) / Math.max(0.5, water - lost));
/** Solubility from the curve by interpolation of a set of (T, S) points (sorted by T; linear between them; null outside). */
export function solyFromPoints(points: { x: number; y: number }[], T: number): number | null {
  const p = [...points].sort((a, b) => a.x - b.x);
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i]!;
    const b = p[i + 1]!;
    if (T >= a.x - 1e-9 && T <= b.x + 1e-9) return b.x === a.x ? a.y : a.y + ((b.y - a.y) * (T - a.x)) / (b.x - a.x);
  }
  return null;
}

/** True answers for the calculation tasks (from the ideal run). */
export function chemEnergeticsAnswers(v: ChemEnergeticsVariant): Record<EnAnswerId, number> {
  const kind: EnRunKind = v.task === 'SOLN' ? 'SALT' : 'NEUT';
  const ideal = enIdealRun(kind);
  const ex = enExtreme(v, ideal);
  const init = v.task === 'NEUT' ? (v.tA + v.tB) / 2 : v.tW;
  const dT = Math.abs(ex.value - init);
  const mass = v.task === 'NEUT' ? 2 * EN_VOL : EN_VOL;
  const q = mass * EN_C * dT;
  const n = v.task === 'NEUT' ? (EN_CONC * EN_VOL) / 1000 : EN_SOLID / EN_M.NH4NO3;
  const sHi = solySolubility(v, v.tHi);
  const sLo = solySolubility(v, v.tLo);
  return { q, n, dH: ((v.task === 'NEUT' ? -1 : 1) * q) / n / 1000, sHi, sLo, mass: sHi - sLo, molal: (sLo * 10) / EN_M.KNO3 };
}

// ------------------------------------------------------------------ the student's work

export interface EnRun {
  kind: EnRunKind;
  vessel: EnVessel;
  /** The cup stood in a beaker for support. */
  supported: boolean;
  /** cm³ measured: acid or water; alkali (NEUT). */
  volA: number;
  volB: number;
  /** g of solid weighed (SOLN). */
  solid: number;
  /** The starting temperature(s) read before mixing: A (acid or water), B (alkali). */
  readA: boolean;
  readB: boolean;
  mixed: boolean;
  /** s after mixing: the first stir and the lid going on (null: never). */
  stirAt: number | null;
  lidAt: number | null;
  /** s from mixing until the run was finished (the window the thermometer was watched). */
  elapsed: number | null;
  done: boolean;
}
export interface SolyRun {
  /** Total cm³ of water added, and g evaporated so far, when this run's crystals were watched for. */
  water: number;
  lost: number;
  heat: SolyHeat | null;
  /** All the solid dissolved before cooling. */
  dissolved: boolean;
  /** Stirring when the crystals appeared. */
  stirred: boolean;
  /** What the thermometer showed when the student saw the first crystals, and how long after they first appeared (s). */
  seen: number | null;
  delay: number | null;
  done: boolean;
}
export interface EnRow {
  /** Acid (NEUT) or water (SOLN) temperature; alkali (NEUT); the initial (mean); the highest or lowest; ΔT. */
  a: string;
  b: string;
  initial: string;
  extreme: string;
  dT: string;
}
export interface SolyRow {
  water: string;
  temp: string;
  sol: string;
}
export type EnCurve = 'SMOOTH' | 'STRAIGHT';
export interface EnAnswer {
  value: string;
  unit: string;
}
export interface ChemEnergeticsState {
  v: 1;
  task: EnergeticsTask | null;
  /** NEUT / SOLN: the vessel chosen and whether it stands in a beaker. */
  setup: { vessel: EnVessel | null; support: boolean };
  runs: EnRun[];
  table: EnRow[];
  /** SOLY: the KNO₃ weighed (g), the water and evaporation so far, and the runs. */
  soly: { mass: number | null; water: number; lost: number; runs: SolyRun[] };
  solyTable: SolyRow[];
  curve: EnCurve | null;
  /** Exothermic or endothermic: the main reaction, and the comparison (SOLN: NaOH). */
  nature: { main: EnNature | null; other: EnNature | null };
  answers: Record<EnAnswerId, EnAnswer>;
  written: { explanation: string; precautions: string };
  log: { t: number; a: string }[];
}

export function emptyChemEnergeticsState(): ChemEnergeticsState {
  const blank = () => ({ value: '', unit: '' });
  return {
    v: 1,
    task: null,
    setup: { vessel: null, support: false },
    runs: [],
    table: [],
    soly: { mass: null, water: 0, lost: 0, runs: [] },
    solyTable: [],
    curve: null,
    nature: { main: null, other: null },
    answers: { q: blank(), n: blank(), dH: blank(), sHi: blank(), sLo: blank(), mass: blank(), molal: blank() },
    written: { explanation: '', precautions: '' },
    log: [],
  };
}

const short = z.string().max(40);
const answer = z.object({ value: short, unit: short });
const secs = z.number().min(0).max(3600);
const nature = z.enum(['EXO', 'ENDO']).nullable();
export const chemEnergeticsStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(ENERGETICS_TASKS).nullable(),
  setup: z.object({ vessel: z.enum(['CUP', 'BEAKER']).nullable(), support: z.boolean() }),
  runs: z
    .array(
      z.object({
        kind: z.enum(['NEUT', 'SALT', 'NAOH']),
        vessel: z.enum(['CUP', 'BEAKER']),
        supported: z.boolean(),
        volA: z.number().min(0).max(200),
        volB: z.number().min(0).max(200),
        solid: z.number().min(0).max(50),
        readA: z.boolean(),
        readB: z.boolean(),
        mixed: z.boolean(),
        stirAt: secs.nullable(),
        lidAt: secs.nullable(),
        elapsed: secs.nullable(),
        done: z.boolean(),
      }),
    )
    .max(8),
  table: z.array(z.object({ a: short, b: short, initial: short, extreme: short, dT: short })).max(8),
  soly: z.object({
    mass: z.number().min(0).max(50).nullable(),
    water: z.number().min(0).max(100),
    lost: z.number().min(0).max(50),
    runs: z
      .array(
        z.object({
          water: z.number().min(0).max(100),
          lost: z.number().min(0).max(50),
          heat: z.enum(['BATH', 'FLAME']).nullable(),
          dissolved: z.boolean(),
          stirred: z.boolean(),
          seen: z.number().min(-10).max(110).nullable(),
          delay: z.number().min(0).max(3600).nullable(),
          done: z.boolean(),
        }),
      )
      .max(12),
  }),
  solyTable: z.array(z.object({ water: short, temp: short, sol: short })).max(12),
  curve: z.enum(['SMOOTH', 'STRAIGHT']).nullable(),
  nature: z.object({ main: nature, other: nature }),
  answers: z.object({ q: answer, n: answer, dH: answer, sHi: answer, sLo: answer, mass: answer, molal: answer }),
  written: z.object({ explanation: z.string().max(2000), precautions: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<ChemEnergeticsState>;

export const CHEM_ENERGETICS: SimulatorSpec = {
  id: 'chem-energetics',
  subject: 'Chemistry',
  title: 'Energy changes and solubility',
  topicNames: ['Energy changes and their effects', 'Energy and enthalpy', 'Energy changes', 'Thermochemistry', 'General principles of solubility', 'Solubility', 'Solubility curves'],
  minutes: 50,
  rubric: [
    { id: 'setup', label: 'Apparatus and setting up', marks: 3, how: 'AUTO', guide: 'Heat of neutralisation / solution: a polystyrene cup, not a glass beaker (1); the cup stood in a beaker for support (1); the card’s quantities measured — 50.0 cm³ of each solution, or 50.0 cm³ of water and 4.00 g of NH₄NO₃ (1). Solubility: 4.0 g of KNO₃ weighed (1); 5.0 cm³ of water to start (1); warmed in a water bath, not over a naked flame (1).' },
    { id: 'procedure', label: 'Procedure', marks: 4, how: 'AUTO', guide: 'Heat changes: the starting temperature(s) read before mixing (1); the cup covered at once (1); stirred at once and throughout (1); the thermometer watched until the temperature had stopped rising (or falling) (1). Solubility: all the solid dissolved before each cooling (1); stirred while cooling (1); at least four different volumes of water (1); the temperature read as the first crystals appeared (1).' },
    { id: 'readings', label: 'Table of readings', marks: 5, how: 'AUTO', guide: 'Heat changes: every temperature to one decimal place, read to the nearest 0.5 °C (1); the starting temperature(s) matching the thermometer within ±0.5 °C (1–2); the highest (lowest) temperature matching the thermometer within ±0.5 °C (1); a temperature change within ±0.7 °C of what careful technique gives (1). Solubility: temperatures to one decimal place (1); matching the thermometer within ±0.5 °C (2); the volumes of water recorded (1); solubility = 4.0 × 100 ÷ volume of water for every row (1).' },
    { id: 'results', label: 'Results and graph', marks: 3, how: 'AUTO', guide: 'Neutralisation: initial temperature = mean of the acid and alkali temperatures (1); ΔT = highest − initial (1); the reaction identified as exothermic (1). Solution: ΔT = initial − lowest (1); the NaOH comparison done with its temperature rise recorded (1); NH₄NO₃ identified as endothermic and NaOH as exothermic (1). Solubility: at least four points plotted, solubility against temperature (1), joined by a smooth curve (1), saturation temperatures within ±2 °C of the true curve (1).' },
    { id: 'calculations', label: 'Calculations', marks: 4, how: 'AUTO', guide: 'Heat changes: Q = mcΔT with the right mass — 100 g of mixture, or 50.0 g of water (1); the moles of water formed, or of NH₄NO₃ dissolved (1); ΔH = Q ÷ n in kJ mol⁻¹ (1) with the right sign — negative for neutralisation, positive for NH₄NO₃ (1). Solubility: the solubilities at the two temperatures read from your curve (1 + 1); the mass of crystals deposited (1); the solubility in mol per kg of water (1). Errors carried forward are not penalised twice.' },
    { id: 'units', label: 'Units', marks: 1, how: 'AUTO', guide: 'Every answer with its unit: J, mol, kJ mol⁻¹; g per 100 g of water, g, mol kg⁻¹.' },
    { id: 'explanation', label: 'Explanation', marks: 1, how: 'AI', guide: 'Neutralisation: every strong acid–strong base reaction is H⁺ + OH⁻ → H₂O, so ΔH is about −57 kJ mol⁻¹; a weak acid gives a less negative value because some energy is used to ionise it. Solution: NH₄NO₃ absorbs heat from the water as it dissolves (endothermic, temperature falls, ΔH positive); NaOH gives out heat (exothermic, temperature rises). Solubility: solubility is the maximum mass of solute that saturates 100 g of solvent at a given temperature; KNO₃ is much more soluble hot, so crystals form as the solution cools.' },
    { id: 'precautions', label: 'Precautions', marks: 1, how: 'AI', guide: 'Two correct precautions, e.g. a polystyrene cup with a lid to reduce heat loss; both solutions at the same starting temperature; mixed quickly and stirred; the highest (lowest) steady temperature recorded; stirred until all the solid dissolved; thermometer read at eye level; stirred continuously while cooling; the temperature recorded as the crystals first appeared; water measured accurately with a burette; warmed in a water bath, not overheated (evaporation).' },
  ],
};
