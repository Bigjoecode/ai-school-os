import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { bioDrawingPick, type BioDrawingStatement } from './bio-common';
import { labBetween, labPick, labRandom, roundDp } from './seeded';

/**
 * bio-plant: WAEC plant physiology. The one source of truth for all three
 * tasks: the web shows these readings and the API marks against them.
 *
 * POTOMETER (pr-bio-potometer-transpiration): a leafy shoot cut under water,
 * fitted into a bubble potometer under water, the joint sealed with Vaseline
 * and one air bubble let into the capillary. The bubble is timed over a fixed
 * 30 mm in still air (the control), with a fan, under a bright lamp, in the
 * dark and in humid air (a polythene bag over the shoot), three times each.
 * The rate of water uptake rises with wind and light and falls in the dark and
 * in humid air; after each change it approaches its new value exponentially
 * (slowest in and out of the dark, as the stomata close or open). A shoot cut
 * or fitted in air has an air lock in its xylem (uptake much reduced); an
 * unsealed joint leaks (the bubble moves erratically). The student tabulates
 * the times, the mean, the rate (mm/min) and the volume (rate × πr²), plots a
 * bar chart of the rates and concludes.
 *
 * OXYGEN (pr-bio-oxygen-evolution): Elodea under a funnel in water with
 * sodium hydrogencarbonate (CO₂), a test tube of water over the funnel stem,
 * a bench lamp at distance d. Light intensity ∝ 1/d² (10 000 ÷ d², arbitrary
 * units). Gross photosynthesis saturates, P = Pmax·I/(I + K); oxygen bubbles
 * come from P − R (respiration), so bubbling stops at the light-compensation
 * point (seeded, 55–85 cm in a darkened room; room light keeps it going).
 * Without NaHCO₃, CO₂ limits the rate; without a heat filter the lamp warms
 * the water and speeds the dark reactions. Bubbles are counted for a minute,
 * three times, after 5 minutes to adjust; the gas collected relights a
 * glowing splint once enough has collected.
 *
 * STARCH (pr-bio-starch-test-leaf): a destarched (48 h dark) potted plant with
 * a foil strip across one leaf, a variegated leaf and a leaf sealed in a flask
 * with potassium hydroxide (no CO₂), lit for hours. Each leaf is boiled in
 * water (kills the cells, lets iodine in), decolourised in ethanol standing in
 * the hot water bath with the flame turned off (ethanol is flammable), softened
 * in warm water, spread on a tile and tested with iodine: blue-black only
 * where there was chlorophyll, light and CO₂; yellow-brown elsewhere. The
 * student records observation and inference for each leaf and counts the
 * blue-black squares of a leaf on a 1 cm² grid.
 */

export const PLANT_TASKS = ['POTOMETER', 'OXYGEN', 'STARCH'] as const;
export type PlantTask = (typeof PLANT_TASKS)[number];
/** The lessons that open this lab, and the task each one sets. */
export const PLANT_PRACTICAL_TASKS: Record<string, PlantTask> = { 'pr-bio-potometer-transpiration': 'POTOMETER', 'pr-bio-oxygen-evolution': 'OXYGEN', 'pr-bio-starch-test-leaf': 'STARCH' };
export const PLANT_TASK_TITLE: Record<PlantTask, string> = { POTOMETER: 'Rate of transpiration with a potometer', OXYGEN: 'Light intensity and oxygen from a water plant', STARCH: 'Testing a leaf for starch' };

/** One observable fact and the keyword groups a written observation must contain (the same shape as the other biology labs' parts). */
export interface PlantPart {
  text: string;
  kw: string[][];
  not?: string[];
}
const P = (text: string, ...kw: string[][]): PlantPart => ({ text, kw });
const Pn = (text: string, not: string[], ...kw: string[][]): PlantPart => ({ text, kw, not });
const norm = (r: () => number) => (r() + r() + r() + r() - 2) * 1.732;

// ================================================================== POTOMETER

export const POTO_CONDS = ['STILL', 'FAN', 'LAMP', 'DARK', 'HUMID'] as const;
export type PotoCond = (typeof POTO_CONDS)[number];
export const POTO_COND_LABEL: Record<PotoCond, string> = {
  STILL: 'Still air, room light (the control)',
  FAN: 'Fan blowing on the shoot (moving air)',
  LAMP: 'Bright lamp shining on the shoot',
  DARK: 'In the dark (black bag over the shoot)',
  HUMID: 'Humid air (clear polythene bag over the shoot)',
};
export const POTO_COND_SHORT: Record<PotoCond, string> = { STILL: 'Still air', FAN: 'Fan', LAMP: 'Bright lamp', DARK: 'Dark', HUMID: 'Humid' };
/** The bubble is timed over this distance along the capillary scale (mm). */
export const POTO_DIST = 30;
/** The capillary scale's length (mm). */
export const POTO_SCALE = 100;
export const POTO_CLOCK_MAX = 480;
/** Let the shoot adjust this long after each change before timing (min). */
export const POTO_MIN_WAIT = 5;
export const POTO_MAX_RUNS = 30;
export const POTO_RADII = [0.4, 0.5, 0.6] as const;

export const POTO_CLAIMS = ['WIND_UP', 'LIGHT_UP', 'DARK_DOWN', 'HUMID_DOWN', 'UPTAKE', 'MEASURES_LOSS', 'HUMID_UP', 'DARK_UP'] as const;
export type PotoClaim = (typeof POTO_CLAIMS)[number];
export const POTO_CLAIM_LABEL: Record<PotoClaim, string> = {
  WIND_UP: 'Moving air (the fan) increased the rate',
  LIGHT_UP: 'Bright light increased the rate',
  DARK_DOWN: 'Darkness reduced the rate (stomata close)',
  HUMID_DOWN: 'Humid air reduced the rate',
  UPTAKE: 'The potometer measures water uptake, assumed equal to water lost',
  MEASURES_LOSS: 'The potometer measures exactly the water lost by the leaves',
  HUMID_UP: 'Humid air increased the rate',
  DARK_UP: 'Darkness increased the rate',
};
/** The claim each condition's comparison with still air supports. */
export const POTO_COND_CLAIM: Record<Exclude<PotoCond, 'STILL'>, PotoClaim> = { FAN: 'WIND_UP', LAMP: 'LIGHT_UP', DARK: 'DARK_DOWN', HUMID: 'HUMID_DOWN' };
export const POTO_WRONG: PotoClaim[] = ['MEASURES_LOSS', 'HUMID_UP', 'DARK_UP'];

export interface PotoVariant {
  /** Bubble speed in still air and room light (mm/min). */
  base: number;
  /** Each condition's rate relative to still air. */
  f: Record<PotoCond, number>;
  /** Time constant of the change after a new condition (min); `tauDark` when going into or out of the dark. */
  tau: number;
  tauDark: number;
  /** Capillary bore radius (mm). */
  r: number;
  /** An air lock in the xylem (cut or fitted in air) leaves this fraction of the uptake. */
  airLock: number;
}
function pickPoto(seed: number): PotoVariant {
  const r = labRandom(seed, 'bio-plant-poto');
  return {
    base: labBetween(r, 4.5, 7, 2),
    f: { STILL: 1, FAN: labBetween(r, 2.0, 2.8, 2), LAMP: labBetween(r, 1.4, 1.9, 2), DARK: labBetween(r, 0.16, 0.28, 2), HUMID: labBetween(r, 0.3, 0.45, 2) },
    tau: labBetween(r, 1.6, 2.6, 2),
    tauDark: labBetween(r, 3.5, 5, 2),
    r: labPick(r, POTO_RADII),
    airLock: labBetween(r, 0.2, 0.35, 2),
  };
}

export interface PotoRun {
  cond: PotoCond;
  /** Clock when the bubble passed the zero mark (min). */
  at: number;
  /** Index of the run (its own measurement noise). */
  n: number;
}
export interface PotoRow {
  t1: string;
  t2: string;
  t3: string;
  mean: string;
  rate: string;
  vol: string;
}
export interface PotoWork {
  /** Where the shoot was cut. */
  cut: 'WATER' | 'AIR' | null;
  /** Where it was fitted into the potometer. */
  fit: 'WATER' | 'AIR' | null;
  /** The joint smeared with Vaseline (airtight). */
  sealed: boolean;
  /** An air bubble let into the capillary. */
  bubble: boolean;
  /** Clock when the bubble was last put back at the zero mark (let in, or reset with the reservoir tap); null: no bubble yet. */
  zeroAt: number | null;
  /** Time-lapse clock (min). */
  clock: number;
  /** Condition changes (the first, still air, is set when the bubble goes in). */
  conds: { cond: PotoCond; at: number }[];
  runs: PotoRun[];
  /** One row per condition (POTO_CONDS order). */
  rows: PotoRow[];
  /** Conditions plotted on the bar chart. */
  bars: PotoCond[];
  fastest: PotoCond | null;
  claims: PotoClaim[];
}

export const potoAirLocked = (w: Pick<PotoWork, 'cut' | 'fit'>) => w.cut === 'AIR' || w.fit === 'AIR';
/** The condition at time t. */
export function potoCondAt(w: Pick<PotoWork, 'conds'>, t: number): PotoCond {
  let c: PotoCond = 'STILL';
  for (const x of w.conds) if (x.at <= t + 1e-9) c = x.cond;
  return c;
}
/** When the condition in force at t was set (min; 0 when none). */
export function potoCondSince(w: Pick<PotoWork, 'conds'>, t: number): number {
  let since = 0;
  for (const x of w.conds) if (x.at <= t + 1e-9) since = x.at;
  return since;
}
/** The steady bubble speed under a condition (mm/min), including a set-up fault. */
export function potoTarget(v: PotoVariant, w: Pick<PotoWork, 'cut' | 'fit' | 'sealed'>, c: PotoCond): number {
  let r = v.base * v.f[c];
  if (potoAirLocked(w)) r *= v.airLock;
  if (!w.sealed) r *= 1.35;
  return r;
}
/** The segment in force at t: its start, the speed at its start, its target and time constant. */
function potoSegment(v: PotoVariant, w: Pick<PotoWork, 'cut' | 'fit' | 'sealed' | 'conds'>, t: number) {
  const segs = [...w.conds].sort((a, b) => a.at - b.at);
  let prev: PotoCond = 'STILL';
  let start = 0;
  let r0 = potoTarget(v, w, 'STILL');
  let target = r0;
  let tau = v.tau;
  for (const s of segs) {
    if (s.at > t + 1e-9) break;
    const rAt = target + (r0 - target) * Math.exp(-(s.at - start) / tau);
    tau = prev === 'DARK' || s.cond === 'DARK' ? v.tauDark : v.tau;
    start = s.at;
    r0 = rAt;
    target = potoTarget(v, w, s.cond);
    prev = s.cond;
  }
  return { start, r0, target, tau };
}
/** The bubble's speed at time t (mm/min). */
export function potoSpeed(v: PotoVariant, w: Pick<PotoWork, 'cut' | 'fit' | 'sealed' | 'conds'>, t: number): number {
  const s = potoSegment(v, w, t);
  return s.target + (s.r0 - s.target) * Math.exp(-(t - s.start) / s.tau);
}
/** The true time (min) for the bubble to move POTO_DIST mm from the zero mark at clock `at`. */
export function potoRunMinutes(v: PotoVariant, w: Pick<PotoWork, 'cut' | 'fit' | 'sealed' | 'conds'>, at: number): number {
  const s = potoSegment(v, w, at);
  const ra = s.target + (s.r0 - s.target) * Math.exp(-(at - s.start) / s.tau);
  const dist = (d: number) => s.target * d + (ra - s.target) * s.tau * (1 - Math.exp(-d / s.tau));
  let lo = 0;
  let hi = 1;
  while (dist(hi) < POTO_DIST && hi < 1e4) hi *= 2;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (dist(mid) < POTO_DIST) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
/** What the stopwatch showed for a run (s, to 0.1 s): the true time with natural fluctuation and reaction time (a leaking joint makes it erratic). */
export function potoRunShown(v: PotoVariant, w: Pick<PotoWork, 'cut' | 'fit' | 'sealed' | 'conds'>, run: PotoRun, seed: number): number {
  const r = labRandom(seed, `bio-plant-poto-run-${run.n}`);
  const sd = w.sealed ? 0.022 : 0.16;
  const t = potoRunMinutes(v, w, run.at) * 60 * (1 + sd * norm(r)) + (r() - 0.5) * 0.6;
  return roundDp(Math.max(1, t), 1);
}
export const emptyPotoRow = (): PotoRow => ({ t1: '', t2: '', t3: '', mean: '', rate: '', vol: '' });
/** How far the bubble is along the scale now (mm from the zero mark; capped at the end of the scale). */
export function potoBubblePos(v: PotoVariant, w: Pick<PotoWork, 'cut' | 'fit' | 'sealed' | 'conds' | 'zeroAt' | 'clock'>): number {
  if (w.zeroAt === null) return 0;
  let d = 0;
  const dt = 0.1;
  for (let x = w.zeroAt; x < w.clock - 1e-9 && d < POTO_SCALE; x += dt) d += potoSpeed(v, w, x + Math.min(dt, w.clock - x) / 2) * Math.min(dt, w.clock - x);
  return Math.min(POTO_SCALE, d);
}
/** Cross-section of the capillary (mm²). */
export const potoArea = (v: PotoVariant) => Math.PI * v.r * v.r;

// ================================================================== OXYGEN

/** Lamp distances on the metre rule (cm). */
export const OXY_DISTS = [10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100] as const;
export const OXY_CLOCK_MAX = 300;
export const OXY_MIN_WAIT = 5;
export const OXY_MAX_COUNTS = 90;
/** Gas needed in the tube to test it with a glowing splint (cm³). */
export const OXY_GAS_TEST = 1.5;
/** Relative light intensity at d cm (10 000 ÷ d²). */
export const oxyIntensity = (d: number) => 10000 / (d * d);

export const OXY_CLAIMS = ['LIGHT_LIMITS_LOW', 'OTHER_LIMITS_HIGH', 'COMPENSATION', 'GAS_OXYGEN', 'GAS_CO2', 'RATE_UP_DISTANCE', 'ALWAYS_PROPORTIONAL'] as const;
export type OxyClaim = (typeof OXY_CLAIMS)[number];
export const OXY_CLAIM_LABEL: Record<OxyClaim, string> = {
  LIGHT_LIMITS_LOW: 'At low light intensity, light is the limiting factor: the rate rises as the lamp comes closer',
  OTHER_LIMITS_HIGH: 'At high light intensity the rate levels off: another factor (CO₂ or temperature) limits it',
  COMPENSATION: 'Where bubbling stops, photosynthesis only balances respiration (the compensation point)',
  GAS_OXYGEN: 'The gas collected is mainly oxygen',
  GAS_CO2: 'The gas collected is carbon dioxide',
  RATE_UP_DISTANCE: 'The further the lamp, the faster the bubbling',
  ALWAYS_PROPORTIONAL: 'The rate is always directly proportional to the light intensity',
};
export const OXY_NEED: OxyClaim[] = ['LIGHT_LIMITS_LOW', 'OTHER_LIMITS_HIGH', 'COMPENSATION', 'GAS_OXYGEN'];
export const OXY_WRONG: OxyClaim[] = ['GAS_CO2', 'RATE_UP_DISTANCE', 'ALWAYS_PROPORTIONAL'];
export const OXY_CURVES = ['SMOOTH', 'DOT', 'STRAIGHT'] as const;
export type OxyCurve = (typeof OXY_CURVES)[number];
export const OXY_CURVE_LABEL: Record<OxyCurve, string> = { SMOOTH: 'A smooth curve of best fit', DOT: 'Ruled lines from point to point', STRAIGHT: 'One straight line of best fit' };
export const OXY_AXES = ['INTENSITY', 'DISTANCE'] as const;
export type OxyAxis = (typeof OXY_AXES)[number];

export interface OxyVariant {
  /** Gross photosynthesis at saturating light, CO₂ plentiful (bubbles/min). */
  pmax: number;
  /** Light intensity giving half of pmax. */
  K: number;
  /** Respiration (bubbles/min equivalent). */
  R: number;
  /** Light-compensation distance in a darkened room (cm). */
  dComp: number;
  /** Background room light (intensity units) when the room is not darkened. */
  bg: number;
  /** Room temperature (°C). */
  T0: number;
  /** Volume of one bubble (cm³). */
  bubbleVol: number;
  /** Time constant of the rate after the lamp moves (min). */
  tau: number;
}
function pickOxy(seed: number): OxyVariant {
  const r = labRandom(seed, 'bio-plant-oxy');
  const pmax = labBetween(r, 46, 62, 1);
  const K = labBetween(r, 12, 24, 1);
  const dComp = labBetween(r, 55, 85, 1);
  const Ic = oxyIntensity(dComp);
  const R = roundDp((pmax * Ic) / (K + Ic), 3);
  const bg = roundDp(Ic * labBetween(r, 1.1, 1.6, 2), 3);
  return { pmax, K, R, dComp, bg, T0: labBetween(r, 26, 29, 1), bubbleVol: labBetween(r, 0.012, 0.02, 3), tau: labBetween(r, 1.2, 2, 2) };
}

export interface OxyRow {
  /** Lamp distance (cm). */
  d: number;
  c1: string;
  c2: string;
  c3: string;
  mean: string;
  /** Light intensity = 10 000 ÷ d². */
  li: string;
}
export interface OxyWork {
  /** A pinch of sodium hydrogencarbonate in the water at the start. */
  nahco3: boolean;
  /** The cut plant under the inverted funnel. */
  plant: boolean;
  /** A test tube full of water over the funnel stem since (min); null: none. */
  tubeAt: number | null;
  /** A water trough (heat filter) between the lamp and the beaker. */
  shield: boolean;
  /** The room darkened (lights off, blinds drawn). */
  dark: boolean;
  clock: number;
  /** Lamp moves (null: switched off). */
  moves: { d: number | null; at: number }[];
  /** Another pinch of NaHCO₃ added (min). */
  co2At: number | null;
  /** One-minute bubble counts, each starting at `at`. */
  counts: { at: number }[];
  /** Thermometer readings taken (min). */
  temps: number[];
  /** Glowing splint test at (min). */
  splintAt: number | null;
  /** One row per lamp distance used, in order of first use. */
  rows: OxyRow[];
  axis: OxyAxis | null;
  curve: OxyCurve | null;
  /** The distance at which bubbling stopped (cm), from the student's own counts. */
  compD: string;
  splintObs: string;
  claims: OxyClaim[];
}

/** The lamp's distance at time t (null: off). */
export function oxyLampAt(w: Pick<OxyWork, 'moves'>, t: number): number | null {
  let d: number | null = null;
  for (const m of w.moves) if (m.at <= t + 1e-9) d = m.d;
  return d;
}
export function oxyLampSince(w: Pick<OxyWork, 'moves'>, t: number): number {
  let s = 0;
  for (const m of w.moves) if (m.at <= t + 1e-9) s = m.at;
  return s;
}
/** Light intensity on the plant at t (with the room's light unless darkened). */
export function oxyLight(v: OxyVariant, w: Pick<OxyWork, 'moves' | 'dark'>, t: number): number {
  const d = oxyLampAt(w, t);
  return (d ? oxyIntensity(d) : 0) + (w.dark ? 0 : v.bg);
}
/** Water temperature at t (°C): the lamp warms it without a heat filter. */
export function oxyTemp(v: OxyVariant, w: Pick<OxyWork, 'moves' | 'shield'>, t: number): number {
  // Integrate the warming towards each lamp position's equilibrium (time constant 12 min).
  let T = v.T0;
  const dt = 0.5;
  for (let x = 0; x < t - 1e-9; x += dt) {
    const step = Math.min(dt, t - x);
    const d = oxyLampAt(w, x + step / 2);
    const eq = v.T0 + (d ? oxyIntensity(d) * (w.shield ? 0.006 : 0.06) : 0);
    T = eq + (T - eq) * Math.exp(-step / 12);
  }
  return T;
}
/** CO₂ factor on pmax and K at t. */
function oxyCo2(w: Pick<OxyWork, 'nahco3' | 'co2At'>, t: number): { p: number; k: number } {
  const low = { p: 0.35, k: 0.5 };
  const high = { p: 1, k: 1 };
  const extra = w.co2At !== null && t >= w.co2At ? 1 - Math.exp(-(t - w.co2At) / 2) : 0;
  const base = w.nahco3 ? high : low;
  const top = w.nahco3 ? { p: 1.08, k: 1.04 } : high;
  return { p: base.p + (top.p - base.p) * extra, k: base.k + (top.k - base.k) * extra };
}
/** The steady net oxygen rate (bubbles/min) at light I, temperature T and CO₂ factors. */
export function oxyNet(v: OxyVariant, I: number, T: number, co2: { p: number; k: number } = { p: 1, k: 1 }): number {
  const pm = v.pmax * co2.p * 2 ** ((T - v.T0) / 10);
  const K = v.K * co2.k;
  const R = v.R * 2 ** ((T - v.T0) / 10);
  return Math.max(0, (pm * I) / (I + K) - R);
}
/** The net oxygen rate at time t (bubbles/min): approaching the new steady rate after each lamp move. */
export function oxyRate(v: OxyVariant, w: Pick<OxyWork, 'moves' | 'dark' | 'shield' | 'nahco3' | 'co2At' | 'plant'>, t: number): number {
  if (!w.plant) return 0;
  const since = oxyLampSince(w, t);
  const steady = (x: number) => oxyNet(v, oxyLight(v, w, x), oxyTemp(v, w, x), oxyCo2(w, x));
  const now = steady(t);
  if (since <= 0 && w.moves.every((m) => m.at > t + 1e-9)) return now;
  const before = steady(Math.max(0, since - 1e-6) - 1e-6);
  return now + (before - now) * Math.exp(-(t - since) / v.tau);
}
/** The bubbles counted in the minute starting at `at` (an integer; bubble sizes and timing vary). */
export function oxyCountShown(v: OxyVariant, w: Pick<OxyWork, 'moves' | 'dark' | 'shield' | 'nahco3' | 'co2At' | 'plant'>, at: number, n: number, seed: number): number {
  const expected = (oxyRate(v, w, at) + oxyRate(v, w, at + 0.5) * 2 + oxyRate(v, w, at + 1)) / 4;
  if (expected < 0.35) return 0;
  const r = labRandom(seed, `bio-plant-oxy-count-${n}`);
  return Math.max(0, Math.round(expected * (1 + 0.06 * norm(r)) + (r() - 0.5) * 1.2));
}
/** Gas collected in the tube by time t (cm³). */
export function oxyGas(v: OxyVariant, w: OxyWork, t: number): number {
  if (w.tubeAt === null || t <= w.tubeAt) return 0;
  let g = 0;
  const dt = 0.5;
  for (let x = w.tubeAt; x < t - 1e-9; x += dt) {
    const step = Math.min(dt, t - x);
    g += oxyRate(v, w, x + step / 2) * step * v.bubbleVol;
  }
  return g;
}
/** What the glowing splint did (and the observation parts). */
export function oxySplint(v: OxyVariant, w: OxyWork): { relit: boolean; gas: number; parts: PlantPart[] } | null {
  if (w.splintAt === null) return null;
  const gas = oxyGas(v, w, w.splintAt);
  return gas >= OXY_GAS_TEST
    ? { relit: true, gas, parts: [Pn('the glowing splint relights (bursts into flame)', ['does not relight', 'did not relight', 'goes out', 'went out', 'extinguish', 'pop'], ['relight', 'rekindle', 're-light', 're light', 'burst into flame', 'bursts into flame', 'flame', 'ignite'])] }
    : { relit: false, gas, parts: [P('too little gas: the splint glows a little brighter but does not relight', ['brighter', 'little', 'not relight', 'does not relight', 'did not relight', 'too little', 'not enough'])] };
}
/** The distances the student counted at, with their true mean count (from the shown counts). */
export function oxyCountsAt(v: OxyVariant, w: OxyWork, seed: number): { d: number; shown: number[]; firstAt: number; since: number }[] {
  const out = new Map<number, { d: number; shown: number[]; firstAt: number; since: number }>();
  w.counts.forEach((c, n) => {
    const d = oxyLampAt(w, c.at);
    if (d === null) return;
    const e = out.get(d) ?? { d, shown: [], firstAt: c.at, since: oxyLampSince(w, c.at) };
    e.shown.push(oxyCountShown(v, w, c.at, n, seed));
    out.set(d, e);
  });
  return [...out.values()];
}
export const emptyOxyRow = (d: number): OxyRow => ({ d, c1: '', c2: '', c3: '', mean: '', li: '' });

// ================================================================== STARCH

export const LEAF_KINDS = ['LIGHT', 'FOIL', 'VARIEGATED', 'NOCO2'] as const;
export type LeafKind = (typeof LEAF_KINDS)[number];
export const LEAF_LABEL: Record<LeafKind, string> = {
  LIGHT: 'Green leaf left in the light (the control)',
  FOIL: 'Leaf with a strip of foil across it (both sides)',
  VARIEGATED: 'Variegated (green and white) leaf',
  NOCO2: 'Leaf sealed in a flask with potassium hydroxide (no CO₂)',
};
export const LEAF_SHORT: Record<LeafKind, string> = { LIGHT: 'Green leaf', FOIL: 'Foil-strip leaf', VARIEGATED: 'Variegated leaf', NOCO2: 'Leaf without CO₂' };
export const STARCH_PLANTS = ['DESTARCHED', 'WINDOW'] as const;
export type StarchPlant = (typeof STARCH_PLANTS)[number];
export const STARCH_PLANT_LABEL: Record<StarchPlant, string> = { DESTARCHED: 'Plant A: kept in a dark cupboard for 48 hours (destarched)', WINDOW: 'Plant B: straight from the sunny window' };
export const STARCH_MAX_HOURS = 8;
/** Hours of bright light for a clear result. */
export const STARCH_MIN_HOURS = 4;
/** The leaf on the grid: 12 × 8 squares of 1 cm². */
export const LEAF_W = 12;
export const LEAF_H = 8;
/** Minutes in hot ethanol to decolourise a leaf fully. */
export const ETH_FULL = 5;

export const STARCH_CLAIMS = ['STARCH', 'NO_STARCH', 'NEEDS_LIGHT', 'NEEDS_CHLOROPHYLL', 'NEEDS_CO2', 'NOT_DESTARCHED', 'ETHANOL_STARCH', 'GLUCOSE'] as const;
export type StarchClaim = (typeof STARCH_CLAIMS)[number];
export const STARCH_CLAIM_LABEL: Record<StarchClaim, string> = {
  STARCH: 'Starch present (photosynthesis took place there)',
  NO_STARCH: 'No starch: no photosynthesis there',
  NEEDS_LIGHT: 'Light is needed for photosynthesis',
  NEEDS_CHLOROPHYLL: 'Chlorophyll is needed for photosynthesis',
  NEEDS_CO2: 'Carbon dioxide is needed for photosynthesis',
  NOT_DESTARCHED: 'The starch was there before: the plant was not destarched',
  ETHANOL_STARCH: 'The ethanol removed the starch',
  GLUCOSE: 'Iodine shows that glucose is present',
};
/** The labels of the before-and-after drawing of the variegated leaf (in target order). */
export const STARCH_LABELS = ['Green part (chlorophyll)', 'White part (no chlorophyll)', 'Blue-black (starch)', 'Yellow-brown (no starch)'] as const;
const STARCH_DISTRACTORS = ['Chlorophyll stained by iodine', 'Glucose present'];
/** The label targets in the drawing's 0–200 × 0–120 box (same order as STARCH_LABELS). */
export const STARCH_DRAWING_TARGETS: { x: number; y: number }[] = [
  { x: 48, y: 62 },
  { x: 20, y: 40 },
  { x: 152, y: 62 },
  { x: 182, y: 82 },
];

export interface LeafCell {
  i: number;
  j: number;
  /** Has chlorophyll. */
  green: boolean;
  /** Light reaching it (1; 0 under the foil; a little where light leaked under the edge). */
  light: number;
}
export interface StarchVariant {
  /** The squares the leaf covers (more than half), per kind. */
  cells: Record<LeafKind, LeafCell[]>;
  /** First column of the foil strip (3 columns wide). */
  foil0: number;
  /** Starch made in full light per hour, relative to a clear blue-black (≥ 1 after STARCH_MIN_HOURS). */
  perHour: number;
  /** Starch left in a plant that was not destarched. */
  residual: number;
}
/** Half-width of the leaf (in squares) at x along it. */
const leafHalf = (x: number, scale: number) => 3.75 * scale * Math.max(0, Math.sin((Math.PI * x) / LEAF_W)) ** 0.7;
function pickStarch(seed: number): StarchVariant {
  const r = labRandom(seed, 'bio-plant-starch');
  const scale = labBetween(r, 0.95, 1.05, 3);
  const foil0 = 4 + Math.floor(r() * 3);
  const a = labBetween(r, 0.9, 1.3, 2);
  const b = labBetween(r, 0.3, 0.6, 2);
  const ph = labBetween(r, 0, 6.28, 2);
  const leak = Array.from({ length: LEAF_W * LEAF_H }, () => r() < 0.25);
  const cy = LEAF_H / 2;
  const cells = Object.fromEntries(
    LEAF_KINDS.map((k) => {
      const out: LeafCell[] = [];
      for (let i = 0; i < LEAF_W; i++)
        for (let j = 0; j < LEAF_H; j++) {
          const x = i + 0.5;
          const hw = leafHalf(x, scale);
          const dy = Math.abs(j + 0.5 - cy);
          if (dy > hw) continue;
          let green = true;
          if (k === 'VARIEGATED') {
            const margin = a + b * Math.sin(i * 1.3 + ph);
            green = hw - dy >= margin && x > 1.4 && x < LEAF_W - 1.2;
          }
          let light = 1;
          if (k === 'FOIL' && i >= foil0 && i < foil0 + 3) light = (i === foil0 || i === foil0 + 2) && leak[i * LEAF_H + j] ? 0.35 : 0;
          out.push({ i, j, green, light });
        }
      return [k, out];
    }),
  ) as Record<LeafKind, LeafCell[]>;
  return { cells, foil0, perHour: labBetween(r, 0.28, 0.34, 3), residual: labBetween(r, 0.85, 1, 2) };
}

export interface StarchLeaf {
  kind: LeafKind;
  /** Hours of light when it was picked. */
  at: number;
  /** Seconds in boiling water. */
  boiled: number;
  /** Boiled before the ethanol. */
  boiledFirst: boolean;
  /** Minutes in hot ethanol. */
  eth: number;
  /** Ethanol put into the water bath while the flame was still lit (a fire risk). */
  ethFlame: boolean;
  /** The ethanol heated directly over the flame (it caught fire). */
  direct: boolean;
  /** Dipped in warm water to soften it after the ethanol. */
  soft: boolean;
  /** Spread on the white tile. */
  tile: boolean;
  iodine: boolean;
}
export interface StarchRow {
  observation: string;
  claims: StarchClaim[];
}
export interface StarchWork {
  plant: StarchPlant | null;
  /** Treatments set up before the light: a foil strip on a leaf, a leaf in a flask with KOH. */
  foil: boolean;
  koh: boolean;
  /** Hours in bright light (time-lapse). */
  hours: number;
  /** The variegated leaf's green and white pattern drawn before the test. */
  drawn: boolean;
  /** The Bunsen flame under the water bath. */
  flame: boolean;
  /** The water bath has boiled (it stays hot enough for the ethanol). */
  hot: boolean;
  leaves: StarchLeaf[];
  /** Same order as `leaves`. */
  rows: StarchRow[];
  /** The leaf laid on the 1 cm² grid and the student's count. */
  grid: { leaf: number | null; total: string; blue: string; pct: string };
  labels: string[];
  drawing: string[];
}

export const STARCH_COL = { green: '#3f8f3a', white: '#eef2d8', boiled: '#62783a', cream: '#efe8c8', blueBlack: '#1c1d44', purple: '#3b2f6b', brown: '#c08a3a' };
const hexRgb = (h: string) => {
  const n = parseInt(h.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};
export function plantMix(a: string, b: string, f: number): string {
  const x = hexRgb(a);
  const y = hexRgb(b);
  const k = Math.max(0, Math.min(1, f));
  return `#${[0, 1, 2].map((i) => Math.round(x[i]! + (y[i]! - x[i]!) * k).toString(16).padStart(2, '0')).join('')}`;
}
/** Starch in a square of a leaf (0 none … 1 plenty). */
export function starchIn(v: StarchVariant, w: Pick<StarchWork, 'plant'>, leaf: Pick<StarchLeaf, 'kind' | 'at'>, c: LeafCell): number {
  if (!c.green) return 0;
  const co2 = leaf.kind === 'NOCO2' ? 0.05 : 1;
  const made = Math.min(1, v.perHour * leaf.at) * c.light * co2;
  const before = w.plant === 'WINDOW' ? v.residual : 0;
  return Math.max(before, made);
}
/** Iodine's colour on a square with this much starch. */
export const iodineColour = (s: number) => (s >= 0.5 ? STARCH_COL.blueBlack : s >= 0.25 ? STARCH_COL.purple : STARCH_COL.brown);
/** How decolourised the leaf is (0 still green … 1 all the chlorophyll out). */
export const leafDecolour = (leaf: Pick<StarchLeaf, 'eth' | 'boiled'>) => (leaf.eth <= 0 ? 0 : (1 - Math.exp(-leaf.eth / 1.6)) * (leaf.boiled > 0 ? 1 : 0.7));
/** The colour of one square as it looks now. */
export function leafCellColour(v: StarchVariant, w: Pick<StarchWork, 'plant'>, leaf: StarchLeaf, c: LeafCell): string {
  const base = c.green ? (leaf.boiled > 0 ? STARCH_COL.boiled : STARCH_COL.green) : STARCH_COL.white;
  const dec = leafDecolour(leaf);
  const now = plantMix(base, STARCH_COL.cream, c.green ? dec : Math.min(1, dec * 1.5));
  if (!leaf.iodine) return now;
  // Boiling breaks the membranes: without it the iodine barely gets in.
  const enter = leaf.boiled > 0 ? 1 : 0.28;
  const tint = plantMix(now, iodineColour(starchIn(v, w, leaf, c)), enter);
  // Chlorophyll left in it masks the colour.
  return c.green ? plantMix(tint, STARCH_COL.green, (1 - dec) * 0.55) : tint;
}
/** The true grid count of a tested leaf: squares covered and squares blue-black. */
export function starchGridTruth(v: StarchVariant, w: Pick<StarchWork, 'plant'>, leaf: StarchLeaf): { total: number; blue: number } {
  const cells = v.cells[leaf.kind];
  return { total: cells.length, blue: cells.filter((c) => starchIn(v, w, leaf, c) >= 0.5).length };
}
/** The leaf was taken through the whole test (an inference can be drawn). */
export const leafComplete = (leaf: StarchLeaf) => leaf.iodine && leaf.boiled > 0 && leafDecolour(leaf) >= 0.85;

/** What a tested leaf shows, as observation parts. */
export function leafParts(v: StarchVariant, w: Pick<StarchWork, 'plant'>, leaf: StarchLeaf): PlantPart[] {
  if (!leaf.iodine) return [];
  if (leaf.boiled <= 0) return [P('only a faint, patchy colour: the iodine did not get into the unboiled cells', ['faint', 'patchy', 'pale', 'little', 'unclear', 'not clear', 'hard to see', 'uneven'])];
  if (leafDecolour(leaf) < 0.85) return [P('the leaf is still green, so the iodine colour is hard to see', ['green', 'hard', 'unclear', 'not clear', 'dark', 'masked', 'difficult'])];
  const BB = ['blue black', 'blue-black', 'blue', 'black'];
  const BR = ['brown', 'yellow', 'orange', 'no blue', 'not blue', 'no colour change', 'no change'];
  const cells = v.cells[leaf.kind];
  const s = cells.map((c) => ({ c, s: starchIn(v, w, leaf, c) }));
  const all = s.every((x) => x.s >= 0.5);
  const none = s.every((x) => x.s < 0.25);
  if (all) return [Pn(leaf.kind === 'FOIL' ? 'the whole leaf turns blue-black, even the part under the foil' : leaf.kind === 'NOCO2' ? 'the whole leaf turns blue-black, even without carbon dioxide' : 'the whole leaf turns blue-black', ['brown', 'yellow', 'no blue', 'not blue'], BB)];
  if (none) return [Pn('the whole leaf stays yellow-brown: no blue-black colour', ['turns blue', 'turned blue', 'becomes blue', 'became blue'], BR)];
  if (leaf.kind === 'FOIL') return [Pn('the parts that were uncovered turn blue-black', ['remain brown'], BB, ['uncover', 'not covered', 'exposed', 'outside', 'rest', 'edges', 'ends', 'either side', 'both sides', 'light']), P('the strip that was under the foil stays yellow-brown', BR, ['foil', 'cover', 'strip', 'band', 'middle', 'centre', 'center'])];
  if (leaf.kind === 'VARIEGATED') return [Pn('the parts that were green turn blue-black', ['white parts turn blue'], BB, ['green']), P('the white parts stay yellow-brown', BR, ['white', 'pale', 'margin', 'edge', 'border', 'colourless'])];
  return [P('parts of the leaf turn blue-black and parts stay yellow-brown', BB, BR)];
}
export interface StarchInferenceKey {
  complete: boolean;
  need: StarchClaim[];
  allow: StarchClaim[];
}
/** What a tested leaf's result allows the student to infer. */
export function leafInferenceKey(v: StarchVariant, w: Pick<StarchWork, 'plant'>, leaf: StarchLeaf): StarchInferenceKey {
  if (!leafComplete(leaf)) return { complete: false, need: [], allow: [] };
  const s = v.cells[leaf.kind].map((c) => starchIn(v, w, leaf, c));
  const all = s.every((x) => x >= 0.5);
  const none = s.every((x) => x < 0.25);
  if (w.plant === 'WINDOW' && leaf.kind !== 'LIGHT' && leaf.kind !== 'VARIEGATED') return { complete: true, need: ['NOT_DESTARCHED'], allow: ['NOT_DESTARCHED', 'STARCH'] };
  if (none) return leaf.kind === 'NOCO2' ? { complete: true, need: ['NEEDS_CO2'], allow: ['NEEDS_CO2', 'NO_STARCH'] } : { complete: true, need: ['NO_STARCH'], allow: ['NO_STARCH'] };
  if (all) return { complete: true, need: ['STARCH'], allow: w.plant === 'WINDOW' ? ['STARCH', 'NOT_DESTARCHED'] : ['STARCH'] };
  if (leaf.kind === 'FOIL') return { complete: true, need: ['STARCH', 'NEEDS_LIGHT'], allow: ['STARCH', 'NO_STARCH', 'NEEDS_LIGHT'] };
  if (leaf.kind === 'VARIEGATED') return { complete: true, need: ['STARCH', 'NEEDS_CHLOROPHYLL'], allow: ['STARCH', 'NO_STARCH', 'NEEDS_CHLOROPHYLL', ...(w.plant === 'WINDOW' ? (['NOT_DESTARCHED'] as StarchClaim[]) : [])] };
  return { complete: true, need: ['STARCH'], allow: ['STARCH', 'NO_STARCH'] };
}
export const STARCH_WRONG: StarchClaim[] = ['ETHANOL_STARCH', 'GLUCOSE'];
export const emptyStarchRow = (): StarchRow => ({ observation: '', claims: [] });

// ================================================================== variant, state, spec

export interface BioPlantVariant {
  seed: number;
  task: PlantTask;
  poto: PotoVariant;
  oxy: OxyVariant;
  starch: StarchVariant;
  drawing: BioDrawingStatement[];
  /** Label chips for the starch drawing (the labels and two distractors), seeded order. */
  labelOptions: string[];
}

/** The hidden truth of one attempt (same on the web and the API). */
export function bioPlantVariant(seed: number, task: PlantTask): BioPlantVariant {
  const r = labRandom(seed, 'bio-plant-labels');
  const opts = [...STARCH_LABELS, ...STARCH_DISTRACTORS];
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [opts[i], opts[j]] = [opts[j]!, opts[i]!];
  }
  return { seed, task, poto: pickPoto(seed), oxy: pickOxy(seed), starch: pickStarch(seed), drawing: bioDrawingPick(seed, 'bio-plant'), labelOptions: opts };
}

export interface BioPlantState {
  v: 1;
  task: PlantTask | null;
  poto: PotoWork;
  oxy: OxyWork;
  starch: StarchWork;
  written: { precautions: string; explain: string };
  log: { t: number; a: string }[];
}

export function emptyBioPlantState(): BioPlantState {
  return {
    v: 1,
    task: null,
    poto: { cut: null, fit: null, sealed: false, bubble: false, zeroAt: null, clock: 0, conds: [], runs: [], rows: POTO_CONDS.map(() => emptyPotoRow()), bars: [], fastest: null, claims: [] },
    oxy: { nahco3: false, plant: false, tubeAt: null, shield: false, dark: false, clock: 0, moves: [], co2At: null, counts: [], temps: [], splintAt: null, rows: [], axis: null, curve: null, compD: '', splintObs: '', claims: [] },
    starch: { plant: null, foil: false, koh: false, hours: 0, drawn: false, flame: false, hot: false, leaves: [], rows: [], grid: { leaf: null, total: '', blue: '', pct: '' }, labels: [], drawing: [] },
    written: { precautions: '', explain: '' },
    log: [],
  };
}

const short = z.string().max(40);
const clockN = (max: number) => z.number().min(0).max(max);
const dist = z.number().refine((x) => (OXY_DISTS as readonly number[]).includes(x), 'not a distance on the rule');
export const bioPlantStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(PLANT_TASKS).nullable(),
  poto: z.object({
    cut: z.enum(['WATER', 'AIR']).nullable(),
    fit: z.enum(['WATER', 'AIR']).nullable(),
    sealed: z.boolean(),
    bubble: z.boolean(),
    zeroAt: clockN(POTO_CLOCK_MAX).nullable(),
    clock: clockN(POTO_CLOCK_MAX),
    conds: z.array(z.object({ cond: z.enum(POTO_CONDS), at: clockN(POTO_CLOCK_MAX) })).max(40),
    runs: z.array(z.object({ cond: z.enum(POTO_CONDS), at: clockN(POTO_CLOCK_MAX), n: z.number().int().min(0).max(POTO_MAX_RUNS) })).max(POTO_MAX_RUNS),
    rows: z.array(z.object({ t1: short, t2: short, t3: short, mean: short, rate: short, vol: short })).length(POTO_CONDS.length),
    bars: z.array(z.enum(POTO_CONDS)).max(POTO_CONDS.length),
    fastest: z.enum(POTO_CONDS).nullable(),
    claims: z.array(z.enum(POTO_CLAIMS)).max(POTO_CLAIMS.length),
  }),
  oxy: z.object({
    nahco3: z.boolean(),
    plant: z.boolean(),
    tubeAt: clockN(OXY_CLOCK_MAX).nullable(),
    shield: z.boolean(),
    dark: z.boolean(),
    clock: clockN(OXY_CLOCK_MAX),
    moves: z.array(z.object({ d: dist.nullable(), at: clockN(OXY_CLOCK_MAX) })).max(60),
    co2At: clockN(OXY_CLOCK_MAX).nullable(),
    counts: z.array(z.object({ at: clockN(OXY_CLOCK_MAX) })).max(OXY_MAX_COUNTS),
    temps: z.array(clockN(OXY_CLOCK_MAX)).max(60),
    splintAt: clockN(OXY_CLOCK_MAX).nullable(),
    rows: z.array(z.object({ d: dist, c1: short, c2: short, c3: short, mean: short, li: short })).max(OXY_DISTS.length),
    axis: z.enum(OXY_AXES).nullable(),
    curve: z.enum(OXY_CURVES).nullable(),
    compD: short,
    splintObs: z.string().max(600),
    claims: z.array(z.enum(OXY_CLAIMS)).max(OXY_CLAIMS.length),
  }),
  starch: z.object({
    plant: z.enum(STARCH_PLANTS).nullable(),
    foil: z.boolean(),
    koh: z.boolean(),
    hours: clockN(STARCH_MAX_HOURS),
    drawn: z.boolean(),
    flame: z.boolean(),
    hot: z.boolean(),
    leaves: z
      .array(z.object({ kind: z.enum(LEAF_KINDS), at: clockN(STARCH_MAX_HOURS), boiled: z.number().min(0).max(600), boiledFirst: z.boolean(), eth: z.number().min(0).max(30), ethFlame: z.boolean(), direct: z.boolean(), soft: z.boolean(), tile: z.boolean(), iodine: z.boolean() }))
      .max(8),
    rows: z.array(z.object({ observation: z.string().max(600), claims: z.array(z.enum(STARCH_CLAIMS)).max(STARCH_CLAIMS.length) })).max(8),
    grid: z.object({ leaf: z.number().int().min(0).max(7).nullable(), total: short, blue: short, pct: short }),
    labels: z.array(z.string().max(40)).max(STARCH_LABELS.length),
    drawing: z.array(z.string().max(20)).max(20),
  }),
  written: z.object({ precautions: z.string().max(2000), explain: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<BioPlantState>;

export const BIO_PLANT: SimulatorSpec = {
  id: 'bio-plant',
  subject: 'Biology',
  title: 'Transpiration and photosynthesis',
  topicNames: ['Transpiration', 'Photosynthesis', 'Plant nutrition', 'Water relations of plants', 'Limiting factors'],
  minutes: 45,
  rubric: [
    {
      id: 'procedure',
      label: 'Procedure',
      marks: 4,
      how: 'AUTO',
      guide:
        'Potometer: the shoot cut under water (1); fitted under water and the joint sealed with Vaseline so it is airtight (1); still air (the control) and at least two other conditions, each timed three times (1); at least 5 minutes for the shoot to adjust after every change before timing (1). Oxygen: sodium hydrogencarbonate in the water and the room darkened (1); a heat filter (water trough) between the lamp and the beaker (1); at least five lamp distances from 15 cm or nearer to 50 cm or further (1); at least 5 minutes after each move before counting (1). Starch: a destarched plant lit for at least 4 hours (1); each leaf boiled in water before the ethanol (1); the ethanol warmed only in the water bath with the flame turned off — never near a naked flame (1); the brittle leaf softened in warm water before spreading it, and at least one leaf testing light, chlorophyll or CO₂ (1).',
    },
    { id: 'readings', label: 'Readings', marks: 4, how: 'AUTO', guide: 'Potometer: each time as the stopwatch showed it, to 0.1 s, three for each condition. Oxygen: each one-minute count as you saw it (3), three counts at each distance (1). Starch: the squares the leaf covers on the grid (1.5), the blue-black squares (1.5) and the percentage that made starch (1).' },
    { id: 'presentation', label: 'Table, graph or drawing', marks: 3, how: 'AUTO', guide: 'Potometer: the mean time of each condition (1), the rate = 30 mm ÷ mean time in minutes (1) and a bar chart of the rates including still air (1). Oxygen: light intensity = 10 000 ÷ d² (1); at least five points plotted (1) joined by a smooth curve of best fit — never dot to dot (1). Starch: the before-and-after drawing of the variegated leaf labelled (2) and the drawing rules (1).' },
    { id: 'results', label: 'Results and conclusions', marks: 5, how: 'AUTO', guide: 'Potometer: volume = rate × πr² (1); the condition with the fastest uptake (1); a conclusion for each condition compared with still air (2); that the potometer measures uptake, assumed equal to loss (1). Oxygen: the mean counts (1); the distance at which bubbling stopped, from your own counts (1); what the glowing splint did (1); the conclusions about limiting factors, the compensation point and the gas (2). Starch: what each leaf showed with iodine, with the colours (3), and the inference from each (2).' },
    { id: 'precautions', label: 'Precautions', marks: 2, how: 'AI', guide: 'Two correct precautions (1 mark each). Potometer: cut and fit the shoot under water; airtight joints (Vaseline); let the shoot adjust 5 minutes after each change; keep the bubble on the scale; repeat and average. Oxygen: keep the temperature constant (heat filter, thermometer); allow time to adjust at each distance; the same piece of plant; darken the room; count three times and average. Starch: destarch the plant fully; turn off the flame before using ethanol; never heat ethanol directly; handle hot leaves with forceps; soften the leaf before spreading it.' },
    { id: 'explanation', label: 'Explanation', marks: 2, how: 'AI', guide: 'Potometer: wind removes water vapour from around the leaf, keeping the diffusion gradient steep; light opens the stomata; humid air reduces the gradient; in the dark the stomata close. Oxygen: light provides the energy for photosynthesis, so the rate rises with light intensity until another factor (CO₂, temperature) limits it; at the compensation point photosynthesis only balances respiration. Starch: boiling kills the cells and breaks the membranes so iodine can enter; ethanol dissolves the chlorophyll so the colour shows; starch (blue-black) is made only where chlorophyll, light and carbon dioxide were all present.' },
  ],
};

// ================================================================== model answers (the worked solution, the demo and the tests)

/** Ideal records for a potometer state: the times as shown, means, rates, volumes, the bar chart and conclusions. */
export function potoIdealRecords(v: BioPlantVariant, s: BioPlantState): BioPlantState['poto'] {
  const w = s.poto;
  const rows = POTO_CONDS.map((c) => {
    const shown = w.runs.filter((r) => r.cond === c).map((r) => potoRunShown(v.poto, w, r, v.seed));
    if (shown.length < 1) return emptyPotoRow();
    const t = shown.slice(0, 3);
    const mean = roundDp(t.reduce((a, b) => a + b, 0) / t.length, 1);
    const rate = roundDp(POTO_DIST / (mean / 60), 2);
    return { t1: t[0] !== undefined ? t[0].toFixed(1) : '', t2: t[1] !== undefined ? t[1].toFixed(1) : '', t3: t[2] !== undefined ? t[2].toFixed(1) : '', mean: mean.toFixed(1), rate: rate.toFixed(2), vol: roundDp(rate * potoArea(v.poto), 2).toFixed(2) };
  });
  const used = POTO_CONDS.filter((c) => w.runs.some((r) => r.cond === c));
  const fastest = used.length ? used.reduce((a, b) => (Number(rows[POTO_CONDS.indexOf(b)]!.rate) > Number(rows[POTO_CONDS.indexOf(a)]!.rate) ? b : a)) : null;
  const claims: PotoClaim[] = [...used.filter((c): c is Exclude<PotoCond, 'STILL'> => c !== 'STILL').map((c) => POTO_COND_CLAIM[c]), 'UPTAKE'];
  return { ...w, rows, bars: used, fastest, claims };
}
/** A model potometer run: cut and fitted under water, sealed, a bubble; still air, fan, lamp, dark and humid, 10 min to adjust, three timings each. */
export function potoModelState(v: BioPlantVariant, conds: PotoCond[] = ['STILL', 'FAN', 'LAMP', 'DARK', 'HUMID'], wait = 10): BioPlantState {
  const s = emptyBioPlantState();
  s.task = 'POTOMETER';
  const w = s.poto;
  Object.assign(w, { cut: 'WATER', fit: 'WATER', sealed: true, bubble: true, zeroAt: 0 });
  let clock = 0;
  for (const c of conds) {
    if (c !== 'STILL' || w.conds.length) w.conds.push({ cond: c, at: clock });
    else w.conds.push({ cond: 'STILL', at: 0 });
    clock += wait;
    for (let k = 0; k < 3; k++) {
      w.zeroAt = roundDp(clock, 2);
      const run = { cond: c, at: roundDp(clock, 2), n: w.runs.length };
      w.runs.push(run);
      clock = roundDp(clock + Math.ceil(potoRunMinutes(v.poto, w, run.at) * 10) / 10 + 0.5, 2);
    }
  }
  w.clock = Math.min(POTO_CLOCK_MAX, clock);
  s.poto = potoIdealRecords(v, s);
  return s;
}

/** Ideal oxygen records: counts as shown, means, intensities, curve, the compensation distance, the splint and conclusions. */
export function oxyIdealRecords(v: BioPlantVariant, s: BioPlantState): BioPlantState['oxy'] {
  const w = s.oxy;
  const at = oxyCountsAt(v.oxy, w, v.seed);
  const rows = w.rows.map((r) => {
    const e = at.find((x) => x.d === r.d);
    const c = e?.shown.slice(0, 3) ?? [];
    const mean = c.length ? roundDp(c.reduce((a, b) => a + b, 0) / c.length, 1) : null;
    return { d: r.d, c1: c[0] !== undefined ? String(c[0]) : '', c2: c[1] !== undefined ? String(c[1]) : '', c3: c[2] !== undefined ? String(c[2]) : '', mean: mean === null ? '' : String(mean), li: String(roundDp(oxyIntensity(r.d), 2)) };
  });
  const pos = rows.filter((r) => Number(r.mean) > 0).map((r) => r.d);
  const zero = rows.filter((r) => r.mean !== '' && Number(r.mean) === 0).map((r) => r.d);
  const lastPos = pos.length ? Math.max(...pos) : null;
  const firstZero = zero.filter((d) => lastPos === null || d > lastPos);
  const comp = lastPos !== null && firstZero.length ? roundDp((lastPos + Math.min(...firstZero)) / 2, 0) : null;
  const sp = oxySplint(v.oxy, w);
  return { ...w, rows, axis: 'INTENSITY', curve: 'SMOOTH', compD: comp === null ? '' : String(comp), splintObs: sp ? sp.parts.map((p) => p.text).join('; ') : '', claims: [...OXY_NEED] };
}
/** A model oxygen run: NaHCO₃, plant, tube, heat filter, dark room; seven distances, 5 min to adjust, three one-minute counts each; the splint at the end. */
export function oxyModelState(v: BioPlantVariant, dists: number[] = [10, 20, 30, 40, 50, 70, 100], wait = 5): BioPlantState {
  const s = emptyBioPlantState();
  s.task = 'OXYGEN';
  const w = s.oxy;
  Object.assign(w, { nahco3: true, plant: true, tubeAt: 0, shield: true, dark: true });
  let clock = 0;
  for (const d of dists) {
    w.moves.push({ d, at: clock });
    w.rows.push(emptyOxyRow(d));
    clock += wait;
    w.temps.push(clock);
    for (let k = 0; k < 3; k++) {
      w.counts.push({ at: clock });
      clock += 1;
    }
  }
  w.moves.push({ d: 10, at: clock });
  clock += 20;
  w.splintAt = clock;
  w.clock = clock;
  s.oxy = oxyIdealRecords(v, s);
  return s;
}

/** Ideal starch records for a state: observation and inference for each leaf, the grid count. */
export function starchIdealRecords(v: BioPlantVariant, s: BioPlantState, gridLeaf: number | null = null): BioPlantState['starch'] {
  const w = s.starch;
  const rows = w.leaves.map((l) => ({ observation: leafParts(v.starch, w, l).map((p) => p.text).join('; '), claims: [...leafInferenceKey(v.starch, w, l).need] }));
  const gi = gridLeaf ?? w.leaves.findIndex((l) => l.kind === 'FOIL' && l.iodine);
  const gl = gi >= 0 ? w.leaves[gi] : undefined;
  const g = gl ? starchGridTruth(v.starch, w, gl) : null;
  return { ...w, rows, grid: g ? { leaf: gi, total: String(g.total), blue: String(g.blue), pct: String(roundDp((g.blue / g.total) * 100, 1)) } : w.grid, labels: [...STARCH_LABELS], drawing: v.drawing.filter((d) => d.good).map((d) => d.id) };
}
/** A model starch test: destarched plant, foil strip and KOH flask, 6 h of light; four leaves boiled, flame off, ethanol, softened, tiled, iodine. */
export function starchModelState(v: BioPlantVariant, kinds: LeafKind[] = ['LIGHT', 'FOIL', 'VARIEGATED', 'NOCO2'], hours = 6): BioPlantState {
  const s = emptyBioPlantState();
  s.task = 'STARCH';
  const w = s.starch;
  Object.assign(w, { plant: 'DESTARCHED', foil: true, koh: true, hours, drawn: true, flame: false, hot: true });
  w.leaves = kinds.map((kind) => ({ kind, at: hours, boiled: 60, boiledFirst: true, eth: ETH_FULL, ethFlame: false, direct: false, soft: true, tile: true, iodine: true }));
  s.starch = starchIdealRecords(v, s);
  return s;
}
