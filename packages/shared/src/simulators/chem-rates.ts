import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { phyAnswerSchema, phyFit, phyGraphLineSchema, type PhyAnswer, type PhyGraphLine } from './phy-common';
import { labBetween, labPick, labRandom } from './seeded';

/**
 * chem-rates: WAEC rates of reaction. Two tasks:
 *  - MG (magnesium and hydrochloric acid, gas syringe): a cleaned, weighed
 *    piece of magnesium ribbon is dropped into 50 cm³ of HCl in a conical
 *    flask, the bung (connected to a gas syringe) is replaced at once and the
 *    stopwatch started; the volume of hydrogen is read every 30 s until no more
 *    gas comes off. Run 1 uses 1.0 mol dm⁻³ acid, run 2 0.50 mol dm⁻³. Plot V
 *    against t for both, draw smooth curves and the tangent at t = 0 of each:
 *    its gradient is the initial rate. Mg + 2HCl → MgCl₂ + H₂, so the final
 *    volume is n(Mg) × 24 000 cm³ (r.t.p.).
 *  - CROSS (sodium thiosulphate and HCl, the disappearing cross): 50, 40, 30,
 *    20 and 10 cm³ of 0.15 mol dm⁻³ Na₂S₂O₃, each made up to 50 cm³ with
 *    water, on a paper cross; 5 cm³ of 2.0 mol dm⁻³ HCl is added, the watch
 *    started and the flask swirled; looking down through the solution, the
 *    watch is stopped when the cross can no longer be seen. Then 10 cm³ of
 *    thiosulphate + 40 cm³ water is warmed to about 30, 40, 50 and 60 °C in a
 *    water bath. 1/t (a measure of rate) is plotted against the volume of
 *    thiosulphate: a straight line through the origin (rate ∝ concentration).
 *
 * Kinetics. MG: the ribbon dissolves from its surface, so for a shrinking
 * piece dn/dt = −(3/τ) n₀^⅓ n^⅔ ([H⁺]/1 mol dm⁻³)^order · e^(−Eₐ/R (1/T − 1/298 K)),
 * with the acid used up as it goes (2 mol per mol of Mg), the flask warming
 * from the reaction's heat (ΔH = −462 kJ mol⁻¹) and cooling back to the room,
 * and an uncleaned ribbon's oxide layer delaying the start. Hydrogen produced
 * before the bung goes in is lost; the syringe plunger sticks a little while
 * the gas comes quickly. V = nRT/p at room temperature. CROSS: sulphur forms
 * at a rate k c^a e^(−Eₐ/RT) after a short induction; the cross vanishes when
 * the sulphur seen through the depth of liquid reaches a threshold (so the
 * total volume matters), with the mixture cooling slowly towards the room.
 * Every attempt's seed gives different rate constants, masses, room
 * temperature and per-run scatter; the measuring cylinders read to ±0.4 cm³.
 */

export const RATES_TASKS = ['MG', 'CROSS'] as const;
export type RatesTask = (typeof RATES_TASKS)[number];

const GAS_R = 8.314;
const P_ATM = 101_325;
const K0 = 273.15;
const T_REF = 298.15;

// ------------------------------------------------------------------ MG: magnesium and HCl
/** cm³ of acid per run, the acid of each run (mol dm⁻³), the reading interval (s), the syringe (cm³). */
export const RATES_MG_ACID = 50;
export const RATES_MG_CONCS = [1.0, 0.5] as const;
export const RATES_INTERVAL = 30;
export const RATES_SYRINGE = 100;
/** Given on the card: molar volume at r.t.p. (cm³ mol⁻¹) and Mg = 24. */
export const RATES_VM = 24_000;
export const RATES_MG_AR = 24;
const MG_MASSES = [0.036, 0.042, 0.048, 0.054, 0.06];
const MG_DH = 462_000;
/** J K⁻¹ of the 50 cm³ of acid and the flask; the flask's cooling time constant (s). */
const MG_HEAT_CAP = 240;
const MG_COOL = 300;
/** The plunger sticks by up to `stick` cm³ while gas comes faster than this (cm³ s⁻¹). */
const STICK_RATE = 0.3;

// ------------------------------------------------------------------ CROSS: thiosulphate and HCl
export const RATES_THIO = 0.15;
export const RATES_HCL = 2.0;
/** Each run: thiosulphate + water made up to this (cm³), plus this much acid. */
export const RATES_CROSS_MADE_UP = 50;
export const RATES_CROSS_ACID = 5;
/** Volumes of thiosulphate on the card (cm³), and the temperature part: thiosulphate volume and bath settings (°C). */
export const RATES_CROSS_CARD = [50, 40, 30, 20, 10];
export const RATES_TEMP_THIO = 10;
export const RATES_TEMP_CARD = [30, 40, 50, 60];
/** What the measuring cylinders offer (cm³). */
export const RATES_THIO_VOLS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
export const RATES_WATER_VOLS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45];
export const RATES_ACID_VOLS = [5, 10];
export const RATES_BATHS = [30, 40, 50, 60, 70];
/** The cross is out of sight when x reaches 1; a stop between these counts as "just disappeared". */
export const RATES_X_EARLY = 0.85;
export const RATES_X_LATE = 1.3;
/** Time-lapse rates the lab clock offers. */
export const RATES_SPEEDS = [1, 2, 5] as const;

export interface ChemRatesVariant {
  seed: number;
  /** Room temperature (°C). */
  room: number;
  /** MG: the mass on the card (g) and what is really in the piece (g). */
  mgMass: number;
  mgTrue: number;
  /** s for a clean ribbon to dissolve completely in 1.0 mol dm⁻³ acid at 25 °C. */
  tau: number;
  /** Order of reaction in H⁺. */
  order: number;
  eaMg: number;
  /** s: an uncleaned ribbon's oxide layer holds the reaction back this long. */
  oxide: number;
  /** cm³: the plunger's sticking while gas comes fast. */
  stick: number;
  /** Powdered magnesium (the sandbox): six times the surface. */
  powder?: boolean;
  /** CROSS: s for the cross to vanish with 50 cm³ thiosulphate + 5 cm³ acid at 25 °C. */
  t50: number;
  thioOrder: number;
  induction: number;
  eaThio: number;
  /** (ii): the volume of thiosulphate whose time is read from the graph. */
  queryVol: number;
}

export function chemRatesVariant(seed: number): ChemRatesVariant {
  const r = labRandom(seed, 'chem-rates');
  const mgMass = labPick(r, MG_MASSES);
  return {
    seed,
    room: labBetween(r, 24, 30, 1),
    mgMass,
    mgTrue: mgMass + labBetween(r, -0.0005, 0.0005, 4),
    tau: labBetween(r, 150, 210, 0),
    order: labBetween(r, 0.9, 1.2, 2),
    eaMg: labBetween(r, 35_000, 45_000, -3),
    oxide: labBetween(r, 20, 35, 0),
    stick: labBetween(r, 0.2, 0.8, 2),
    t50: labBetween(r, 16, 24, 1),
    thioOrder: labBetween(r, 0.95, 1.05, 2),
    induction: labBetween(r, 0.5, 1.5, 2),
    eaThio: labBetween(r, 48_000, 60_000, -3),
    queryVol: labPick(r, [15, 25, 35, 45]),
  };
}

const arrhenius = (ea: number, tC: number) => Math.exp((-ea / GAS_R) * (1 / (tC + K0) - 1 / T_REF));
const molarGasCm3 = (roomC: number) => ((GAS_R * (roomC + K0)) / P_ATM) * 1e6;

// ---- MG curve (integrated once per variant and run settings, then interpolated)
const MG_STEP = 0.25;
const MG_MAX = 2400;
interface MgCurve {
  gas: Float64Array;
  temp: Float64Array;
  end: number;
}
const mgCache = new Map<string, MgCurve>();
function mgCurve(v: ChemRatesVariant, conc: number, cleaned: boolean): MgCurve {
  const key = [v.seed, v.room, v.mgTrue, v.tau, v.order, v.eaMg, v.oxide, v.powder ? 1 : 0, conc, cleaned ? 1 : 0].join('|');
  const hit = mgCache.get(key);
  if (hit) return hit;
  const n0 = v.mgTrue / 24.3;
  const vol = RATES_MG_ACID / 1000;
  const k3 = 3 / (v.tau / (v.powder ? 6 : 1));
  const cbrt0 = Math.cbrt(n0);
  const samples = Math.round(MG_MAX / MG_STEP) + 1;
  const gas = new Float64Array(samples);
  const temp = new Float64Array(samples);
  const dt = 0.05;
  const per = Math.round(MG_STEP / dt);
  let n = n0;
  let T = v.room;
  let made = 0;
  let end = MG_MAX;
  const vm = molarGasCm3(v.room);
  temp[0] = T;
  for (let i = 1; i < samples; i++) {
    for (let k = 0; k < per; k++) {
      const t = (i - 1) * MG_STEP + k * dt;
      if (n > 0) {
        const h = Math.max(0, (conc * vol - 2 * (n0 - n)) / vol);
        const ox = cleaned ? 1 : Math.min(1, 0.03 + t / v.oxide);
        const rate = k3 * cbrt0 * n ** (2 / 3) * h ** v.order * arrhenius(v.eaMg, T) * ox;
        const dn = Math.min(n, rate * dt);
        n -= dn;
        made += dn;
        T += (MG_DH * dn) / MG_HEAT_CAP;
        if (n <= n0 * 1e-7) {
          made += n;
          n = 0;
          end = Math.min(end, t + dt);
        }
      }
      T -= ((T - v.room) / MG_COOL) * dt;
    }
    gas[i] = made * vm;
    temp[i] = T;
  }
  const out = { gas, temp, end };
  if (mgCache.size > 64) mgCache.clear();
  mgCache.set(key, out);
  return out;
}
const lerp = (a: Float64Array, t: number) => {
  const x = Math.max(0, Math.min(a.length - 1, t / MG_STEP));
  const i = Math.floor(x);
  const f = x - i;
  return i >= a.length - 1 ? a[a.length - 1]! : a[i]! * (1 - f) + a[i + 1]! * f;
};
/** Hydrogen produced (cm³ at room temperature) τ s after the magnesium went in. */
export const ratesMgGas = (v: ChemRatesVariant, conc: number, cleaned: boolean, tau: number) => (tau <= 0 ? 0 : lerp(mgCurve(v, conc, cleaned).gas, tau));
/** Temperature of the flask's contents (°C) τ s after the magnesium went in. */
export const ratesMgTemp = (v: ChemRatesVariant, conc: number, cleaned: boolean, tau: number) => lerp(mgCurve(v, conc, cleaned).temp, Math.max(0, tau));
/** When the last of the magnesium has gone (s). */
export const ratesMgEnd = (v: ChemRatesVariant, conc: number, cleaned: boolean) => mgCurve(v, conc, cleaned).end;
/** Moles of magnesium left (fraction of the piece) τ s after it went in. */
export const ratesMgLeft = (v: ChemRatesVariant, conc: number, cleaned: boolean, tau: number) => {
  const c = mgCurve(v, conc, cleaned);
  const total = c.gas[c.gas.length - 1]!;
  return total > 0 ? Math.max(0, 1 - ratesMgGas(v, conc, cleaned, tau) / total) : 1;
};
/** The rate at which gas comes off (cm³ s⁻¹) at τ. */
export const ratesMgRate = (v: ChemRatesVariant, conc: number, cleaned: boolean, tau: number) => (ratesMgGas(v, conc, cleaned, tau + 0.5) - ratesMgGas(v, conc, cleaned, Math.max(0, tau - 0.5))) / (tau < 0.5 ? tau + 0.5 : 1);
/** The true initial rate (cm³ s⁻¹) for a cleaned ribbon in acid of `conc`. */
export const ratesMgInitialRate = (v: ChemRatesVariant, conc: number) => ratesMgGas(v, conc, true, 2) / 2;
/** The theoretical volume of hydrogen (cm³ at r.t.p.) from the mass on the card. */
export const ratesMgTheory = (v: ChemRatesVariant) => (v.mgMass / RATES_MG_AR) * RATES_VM;

export interface RatesMgRun {
  /** mol dm⁻³ of the acid poured in. */
  conc: number;
  weighed: boolean;
  /** Rubbed with sandpaper (the oxide layer off). */
  cleaned: boolean;
  /** The syringe checked airtight. */
  checked: boolean;
  /** The plunger's reading before the run (cm³; 0 when pushed fully in). */
  start: number;
  dropped: boolean;
  /** s from the magnesium going in to the bung going in (gas made before is lost). */
  bungLag: number | null;
  /** s from the magnesium going in to the stopwatch starting. */
  watchLag: number | null;
  done: boolean;
}
/** The syringe reading (cm³) τ s after the magnesium went in. */
export function ratesMgSyringe(v: ChemRatesVariant, run: Pick<RatesMgRun, 'conc' | 'cleaned' | 'bungLag' | 'start'>, tau: number): number {
  if (run.bungLag === null || tau <= run.bungLag) return run.start;
  const inside = ratesMgGas(v, run.conc, run.cleaned, tau) - ratesMgGas(v, run.conc, run.cleaned, run.bungLag);
  const lag = v.stick * Math.min(1, ratesMgRate(v, run.conc, run.cleaned, tau) / STICK_RATE);
  return Math.max(run.start, Math.min(RATES_SYRINGE, run.start + Math.max(0, inside - lag)));
}

// ---- CROSS
export interface RatesCrossRun {
  /** A number that stays with the run (its scatter and cylinder readings). */
  n: number;
  kind: 'CONC' | 'TEMP';
  /** cm³ measured: thiosulphate, water, acid. */
  thio: number;
  water: number;
  acid: number;
  /** °C the flask was warmed to in the water bath (null: room temperature). */
  bath: number | null;
  /** The flask was rinsed with water before this run. */
  rinsed: boolean;
  swirled: boolean;
  /** s from the acid going in to the watch starting. */
  watchLag: number | null;
  /** The stopwatch reading when stopped (s). */
  elapsed: number | null;
  /** Looking down through the solution when the watch was stopped. */
  top: boolean;
  /** °C on the thermometer when it was read (true value), and whether that was after the acid went in. */
  temp: number | null;
  tempAfter: boolean;
  done: boolean;
}
const crossNoise = (v: ChemRatesVariant, n: number) => {
  if (n < 0) return { thio: 0, water: 0, acid: 0, scatter: 0, bath: 0 };
  const r = labRandom(v.seed, `cross-${n}`);
  return { thio: labBetween(r, -0.4, 0.4, 2), water: labBetween(r, -0.4, 0.4, 2), acid: labBetween(r, -0.15, 0.15, 2), scatter: labBetween(r, -0.025, 0.025, 4), bath: labBetween(r, -1.5, 0.5, 2) };
};
/** The flask's temperature before the acid goes in (°C). */
export const ratesCrossTpre = (v: ChemRatesVariant, run: Pick<RatesCrossRun, 'n' | 'bath'>) => (run.bath === null ? v.room : run.bath + crossNoise(v, run.n).bath);
/** The mixture's temperature (°C) t s after the acid went in (it cools slowly towards the room). */
export function ratesCrossTemp(v: ChemRatesVariant, run: Pick<RatesCrossRun, 'n' | 'bath' | 'thio' | 'water' | 'acid'>, t: number): number {
  const pre = ratesCrossTpre(v, run);
  if (t < 0) return pre;
  const body = run.thio + run.water;
  const mix = (body * pre + run.acid * v.room) / Math.max(1, body + run.acid);
  return v.room + (mix - v.room) * Math.exp(-t / 400);
}
const C50 = (RATES_THIO * 50) / 55;
const X_STEP = 0.1;
const X_MAX = 900;
const xCache = new Map<string, Float64Array>();
function crossCurve(v: ChemRatesVariant, run: Pick<RatesCrossRun, 'n' | 'bath' | 'thio' | 'water' | 'acid' | 'rinsed' | 'swirled'>): Float64Array {
  const key = [v.seed, v.room, v.t50, v.thioOrder, v.induction, v.eaThio, run.n, run.bath, run.thio, run.water, run.acid, run.rinsed ? 1 : 0, run.swirled ? 1 : 0].join('|');
  const hit = xCache.get(key);
  if (hit) return hit;
  const z = crossNoise(v, run.n);
  const thio = Math.max(0, run.thio + (run.thio ? z.thio : 0));
  const water = Math.max(0, run.water + (run.water ? z.water : 0));
  const acid = Math.max(0, run.acid + z.acid);
  const total = thio + water + acid;
  const c = total > 0 ? (RATES_THIO * thio) / total : 0;
  // the sulphur needs time to nucleate: longer in dilute mixtures
  const ind = (v.induction * C50) / Math.max(c, 0.005) + (run.swirled ? 0 : 2);
  const k0 = (1 / (v.t50 - v.induction * 1.1)) * (c / C50) ** v.thioOrder * (total / 55) * (1 + z.scatter) * (run.rinsed ? 1 : 1.12) * (acid > 0.5 ? 1 : 0);
  const samples = Math.round(X_MAX / X_STEP) + 1;
  const out = new Float64Array(samples);
  let x = 0;
  const dt = 0.05;
  const per = Math.round(X_STEP / dt);
  const temps = { thio, water, acid, n: run.n, bath: run.bath };
  for (let i = 1; i < samples; i++) {
    // well past the vanishing point nothing more is needed: the cross is long gone
    if (x > 4) {
      out.fill(x, i);
      break;
    }
    for (let k = 0; k < per; k++) {
      const t = (i - 1) * X_STEP + k * dt;
      if (t >= ind) x += k0 * arrhenius(v.eaThio, ratesCrossTemp(v, temps, t)) * dt;
    }
    out[i] = x;
  }
  if (xCache.size > 128) xCache.clear();
  xCache.set(key, out);
  return out;
}
/** How far the cross has gone (1 = just out of sight) t s after the acid went in. */
export function ratesCrossX(v: ChemRatesVariant, run: Pick<RatesCrossRun, 'n' | 'bath' | 'thio' | 'water' | 'acid' | 'rinsed' | 'swirled'>, t: number): number {
  if (t <= 0) return 0;
  const a = crossCurve(v, run);
  const p = Math.min(a.length - 1, t / X_STEP);
  const i = Math.floor(p);
  return i >= a.length - 1 ? a[a.length - 1]! : a[i]! + (a[i + 1]! - a[i]!) * (p - i);
}
/** s after the acid went in when the cross just disappears (Infinity: it never does in 900 s). */
export function ratesCrossVanish(v: ChemRatesVariant, run: Pick<RatesCrossRun, 'n' | 'bath' | 'thio' | 'water' | 'acid' | 'rinsed' | 'swirled'>): number {
  const a = crossCurve(v, run);
  if (a[a.length - 1]! < 1) return Infinity;
  let lo = 0;
  let hi = a.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (a[m]! >= 1) hi = m;
    else lo = m;
  }
  return (lo + (1 - a[lo]!) / Math.max(1e-12, a[hi]! - a[lo]!)) * X_STEP;
}
/** How visible the cross is (1 = clear, 0 = gone) for progress x: it fades, slowly at first. */
export const ratesCrossVisibility = (x: number) => Math.max(0, (Math.exp(-3 * x) - Math.exp(-3)) / (1 - Math.exp(-3)));
/** An ideal run of the card at room temperature (no cylinder error or scatter): for the true line and the worked solution. */
const ideal = (thio: number, bath: number | null): Pick<RatesCrossRun, 'n' | 'bath' | 'thio' | 'water' | 'acid' | 'rinsed' | 'swirled'> => ({ n: -1, bath, thio, water: RATES_CROSS_MADE_UP - thio, acid: RATES_CROSS_ACID, rinsed: true, swirled: true });
export function ratesCrossIdealTime(v: ChemRatesVariant, thio: number, bath: number | null = null): number {
  return ratesCrossVanish(v, ideal(thio, bath));
}
/** The true line of 1/t (s⁻¹) against the volume of thiosulphate (cm³) for the card's volumes. */
export function ratesCrossTrueLine(v: ChemRatesVariant): { slope: number; intercept: number } {
  const pts = RATES_CROSS_CARD.map((x) => ({ x, y: 1 / ratesCrossIdealTime(v, x) }));
  return phyFit(pts) ?? { slope: 0, intercept: 0 };
}
/** How many times faster the reaction goes for a 10 °C rise (30 → 40 °C). */
export const ratesFactor10 = (v: ChemRatesVariant) => arrhenius(v.eaThio, 40) / arrhenius(v.eaThio, 30);

// ------------------------------------------------------------------ the student's work

/** A syringe reading as taken (the volume follows from the run and the time). */
export interface RatesReading {
  /** 0: run 1, 1: run 2. */
  run: number;
  /** The stopwatch reading when it was read (s). */
  at: number;
}
export interface RatesMgRow {
  t: string;
  v1: string;
  v2: string;
}
export interface RatesCrossRow {
  /** Thiosulphate and water (cm³): concentration runs; temperature (°C): temperature runs. */
  v: string;
  w: string;
  th: string;
  t: string;
  inv: string;
}
export type RatesCurve = 'SMOOTH' | 'STRAIGHT';
export type RatesAnswerId = 'rateA' | 'rateB' | 'vTheory' | 'slope' | 'tQuery' | 'factor';
export const RATES_ANSWER_IDS: RatesAnswerId[] = ['rateA', 'rateB', 'vTheory', 'slope', 'tQuery', 'factor'];
export interface ChemRatesState {
  v: 1;
  task: RatesTask | null;
  /** MG: run 1 and run 2 (null until started). */
  mgRuns: (RatesMgRun | null)[];
  readings: RatesReading[];
  /** The nominal time (s) of each table row. */
  mgRows: number[];
  mg: RatesMgRow[];
  /** How each run's points are joined on the graph, and its tangent at t = 0. */
  curves: { a: RatesCurve | null; b: RatesCurve | null };
  tangents: { a: PhyGraphLine | null; b: PhyGraphLine | null };
  /** CROSS: the runs (same order as `cross`) and how many have ever been started. */
  crossRuns: RatesCrossRun[];
  cross: RatesCrossRow[];
  made: number;
  line: PhyGraphLine | null;
  answers: Record<RatesAnswerId, PhyAnswer>;
  written: { explanation: string; precautions: string };
  log: { t: number; a: string }[];
}

export function emptyChemRatesState(): ChemRatesState {
  const blank = () => ({ value: '', unit: '' });
  return {
    v: 1,
    task: null,
    mgRuns: [null, null],
    readings: [],
    mgRows: [],
    mg: [],
    curves: { a: null, b: null },
    tangents: { a: null, b: null },
    crossRuns: [],
    cross: [],
    made: 0,
    line: null,
    answers: { rateA: blank(), rateB: blank(), vTheory: blank(), slope: blank(), tQuery: blank(), factor: blank() },
    written: { explanation: '', precautions: '' },
    log: [],
  };
}

const short = z.string().max(40);
const secs = z.number().min(-60).max(3600);
const mgRun = z.object({
  conc: z.number().min(0).max(5),
  weighed: z.boolean(),
  cleaned: z.boolean(),
  checked: z.boolean(),
  start: z.number().min(0).max(RATES_SYRINGE),
  dropped: z.boolean(),
  bungLag: secs.nullable(),
  watchLag: secs.nullable(),
  done: z.boolean(),
});
const crossRun = z.object({
  n: z.number().int().min(0).max(1000),
  kind: z.enum(['CONC', 'TEMP']),
  thio: z.number().min(0).max(100),
  water: z.number().min(0).max(100),
  acid: z.number().min(0).max(50),
  bath: z.number().min(0).max(100).nullable(),
  rinsed: z.boolean(),
  swirled: z.boolean(),
  watchLag: secs.nullable(),
  elapsed: z.number().min(0).max(3600).nullable(),
  top: z.boolean(),
  temp: z.number().min(-10).max(110).nullable(),
  tempAfter: z.boolean(),
  done: z.boolean(),
});
const curve = z.enum(['SMOOTH', 'STRAIGHT']).nullable();
export const chemRatesStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(RATES_TASKS).nullable(),
  mgRuns: z.array(mgRun.nullable()).max(2),
  readings: z.array(z.object({ run: z.number().int().min(0).max(1), at: z.number().min(0).max(3600) })).max(100),
  mgRows: z.array(z.number().min(0).max(3600)).max(50),
  mg: z.array(z.object({ t: short, v1: short, v2: short })).max(50),
  curves: z.object({ a: curve, b: curve }),
  tangents: z.object({ a: phyGraphLineSchema.nullable(), b: phyGraphLineSchema.nullable() }),
  crossRuns: z.array(crossRun).max(16),
  cross: z.array(z.object({ v: short, w: short, th: short, t: short, inv: short })).max(16),
  made: z.number().int().min(0).max(1000),
  line: phyGraphLineSchema.nullable(),
  answers: z.object({ rateA: phyAnswerSchema, rateB: phyAnswerSchema, vTheory: phyAnswerSchema, slope: phyAnswerSchema, tQuery: phyAnswerSchema, factor: phyAnswerSchema }),
  written: z.object({ explanation: z.string().max(2000), precautions: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<ChemRatesState>;

export const CHEM_RATES: SimulatorSpec = {
  id: 'chem-rates',
  subject: 'Chemistry',
  title: 'Rates of reaction',
  topicNames: ['Rate of reactions', 'Rates of reaction', 'Factors affecting rates', 'Chemical kinetics', 'Reaction rates'],
  minutes: 50,
  rubric: [
    { id: 'setup', label: 'Apparatus and setting up', marks: 3, how: 'AUTO', guide: 'Magnesium: the ribbon cleaned with sandpaper (1); the syringe pushed in to zero and checked airtight before each run (1); the bung replaced at once, within about 3 s of dropping the magnesium in (1). Thiosulphate: every run made up to the same total volume (50 cm³ + acid) (1); the same volume of acid each time (1); the flask rinsed with water between runs (1).' },
    { id: 'procedure', label: 'Procedure', marks: 4, how: 'AUTO', guide: 'Magnesium: the stopwatch started as the magnesium went in (1); readings every 30 s from the start (1) until no more gas came off (1); a second run with 0.50 mol dm⁻³ acid and a fresh, weighed piece of magnesium (1). Thiosulphate: at least five volumes spread from 10 to 50 cm³ (1); the watch started as the acid went in and the flask swirled (1); the watch stopped just as the cross disappeared, looking down through the solution (1); at least three temperatures over 20 °C apart with the same mixture (1).' },
    { id: 'readings', label: 'Table of results', marks: 5, how: 'AUTO', guide: 'Magnesium: volumes that match the syringe (±0.6 cm³) (2); readings taken on time (within 3 s of each 30 s mark) (1); times at equal 30 s intervals (1); volumes to the nearest 0.5 or 1 cm³ (1). Thiosulphate: times that match the stopwatch (±0.3 s) (2); temperatures that match the thermometer (±1 °C) (1); 1/t worked out correctly (1) to 2–3 significant figures (1).' },
    { id: 'graph', label: 'Graph', marks: 3, how: 'AUTO', guide: 'Magnesium: both runs plotted (V against t) (1) as smooth curves, not straight lines (1); a tangent at t = 0 that touches the curve (1). Thiosulphate: 1/t against the volume of thiosulphate plotted (1) with a straight line (1) that is a good fit through the origin (1).' },
    { id: 'calculations', label: 'Calculations', marks: 4, how: 'AUTO', guide: 'Magnesium: the initial rate of run 1 from your own tangent (1) within 20 % of the true rate (1); the initial rate of run 2 (1); the theoretical volume of hydrogen = (mass ÷ 24) × 24 000 cm³ (1). Thiosulphate: the slope from your own line (1) within 10 % of the true line (1); the time for the stated volume read from your line (1); the rate increase for a 10 °C rise from your results (1).' },
    { id: 'units', label: 'Units', marks: 1, how: 'AUTO', guide: 'Rates in cm³ s⁻¹ and volumes in cm³ (magnesium); the slope in s⁻¹ cm⁻³ and times in s (thiosulphate); the factor has no unit.' },
    { id: 'explanation', label: 'Explanation', marks: 2, how: 'AI', guide: 'Magnesium: the rate is fastest at the start and falls as the magnesium (and acid) are used up; the curve levels off when the magnesium is used up; with the more concentrated acid the particles collide more often, so the initial rate is higher (the final volume is the same). Thiosulphate: a higher concentration means more frequent collisions; at a higher temperature the particles move faster and more of them have energy ≥ the activation energy, so more collisions are successful.' },
    { id: 'precautions', label: 'Precautions', marks: 2, how: 'AI', guide: 'Two correct precautions (1 mark each). Magnesium: bung replaced immediately; magnesium cleaned of its oxide layer; acid in excess; syringe barrel free to move; apparatus airtight; readings taken at exact times. Thiosulphate: total volume kept the same; same cross and the same observer; looking down vertically through the solution; flask washed between runs; stopwatch started as the acid is added; temperature read during the run.' },
  ],
};
