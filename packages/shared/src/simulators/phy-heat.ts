import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { phyAnswerSchema, phyGraphLineSchema, type PhyAnswer, type PhyGraphLine } from './phy-common';
import { labBetween, labPick, labRandom } from './seeded';

/**
 * phy-heat: heat in the physics lab, three WAEC practicals on one bench.
 *  - MIX (specific heat capacity by the method of mixtures): weigh the copper
 *    calorimeter and stirrer empty (m_c), then two-thirds full of water (m₁);
 *    weigh the metal block (m); hang it by its thread in boiling water for
 *    several minutes (θ₁ from the thermometer in the bath); read the
 *    calorimeter water (θ₂); transfer the block quickly without splashing,
 *    cover, stir and record the highest steady temperature θ₃. Heat lost by
 *    the block = heat gained by the water + calorimeter, so
 *    c = (m_w c_w + m_c c_c)(θ₃ − θ₂) / (m (θ₁ − θ₃)).
 *  - LATENT (specific latent heat of fusion of ice): weigh the calorimeter
 *    empty and with warm water; read θ₁; add dried melting ice one piece at a
 *    time, stirring, until the temperature is as far below room temperature as
 *    it started above it (the cooling correction); read the lowest steady
 *    temperature θ₂ once all the ice has melted; reweigh for the mass of ice:
 *    (m_w c_w + m_c c_c)(θ₁ − θ₂) = m_i L + m_i c_w θ₂.
 *  - COOL (cooling curve of naphthalene): melt it in a boiling tube in a water
 *    bath to about 90 °C, clamp it in air and read the thermometer every 30 s,
 *    stirring gently while it is liquid, until solid and below about 65 °C.
 *    Plot θ against t: the flat part is the freezing (melting) point.
 *
 * Physics: everything the student does is an event at a time on the lab's
 * clock (seconds); `heatSim` integrates the bench on a fixed 0.1 s grid from
 * those events (both the web and the grader run it, so they agree exactly).
 * Heat balance with the calorimeter's own heat capacity, Newton's law of
 * cooling to the room (less with the lagging and lid on), block–water and
 * ice–water heat transfer that is much faster when stirred, carried-over
 * boiling water and splashes, wet or sub-zero ice, an enthalpy model of
 * freezing with supercooling (less when stirred) and an impurity that lowers
 * and tilts the plateau, and thermometers that lag behind the liquid and are
 * each a little off. The student reads the thermometers (to 0.5 °C, at eye
 * level) and the beam balance (to 0.1 g) and writes the values themselves.
 */

export const HEAT_TASKS = ['MIX', 'LATENT', 'COOL'] as const;
export type HeatTask = (typeof HEAT_TASKS)[number];

/** Values given on the task card (J kg⁻¹ K⁻¹; J kg⁻¹). */
export const HEAT_C_WATER = 4200;
export const HEAT_C_CAL = 400;
export const HEAT_L_ICE = 3.34e5;
/** The true values the bench runs on. */
const CW = 4186;
const C_ICE = 2100;
const L_NAPH = 1.47e5;
const C_NAPH_L = 1720;
const C_NAPH_S = 1300;
/** Integration step (s of lab time). */
export const HEAT_DT = 0.1;
/** Cooling curve: the reading interval (s). */
export const HEAT_INTERVAL = 30;
/** Warm water offered for the latent heat (nominal °C). */
export const HEAT_WARM = [35, 40, 45, 50] as const;
/** Calorimeter fill levels: a third, two-thirds, full. */
export const HEAT_LEVELS = [1, 2, 3] as const;
export const HEAT_LEVEL_NAME: Record<number, string> = { 1: 'a third full', 2: 'two-thirds full', 3: 'full to the brim' };
/** The thermometers: in the boiling-water bath (MIX), in the calorimeter, on the bench in air (room), in the boiling tube (COOL). */
export const HEAT_THERMOS = ['bath', 'cal', 'room', 'tube'] as const;
export type HeatThermo = (typeof HEAT_THERMOS)[number];
/** The thermometer's scale (°C). */
export const HEAT_SCALE = { min: -10, max: 110 };

export const HEAT_METALS = [
  { id: 'copper', name: 'copper', c: 385, rho: 8960, colour: '#b8663a' },
  { id: 'aluminium', name: 'aluminium', c: 900, rho: 2700, colour: '#c9ccd1' },
  { id: 'brass', name: 'brass', c: 380, rho: 8500, colour: '#c9a640' },
  { id: 'iron', name: 'iron', c: 450, rho: 7870, colour: '#6d6f73' },
] as const;
export type HeatMetalId = (typeof HEAT_METALS)[number]['id'];

/** Everything the student can do to the bench, as logged events. */
export const HEAT_EVENTS = [
  'bunsen:on',
  'bunsen:off',
  'lag:on',
  'lag:off',
  'lid:on',
  'lid:off',
  'stir:on',
  'stir:off',
  'thstir',
  'fill:1',
  'fill:2',
  'fill:3',
  'warm:35',
  'warm:40',
  'warm:45',
  'warm:50',
  'block:bath',
  'block:lift',
  'block:gentle',
  'block:drop',
  'ice:dry:melt',
  'ice:wet:melt',
  'ice:dry:freezer',
  'ice:wet:freezer',
  'tube:bath',
  'tube:flame',
  'tube:air',
  'th:pull',
  'watch:start',
  'watch:stop',
] as const;
export type HeatEventCode = (typeof HEAT_EVENTS)[number];
export interface HeatEvent {
  /** Lab clock (s). */
  t: number;
  e: HeatEventCode;
}

export interface PhyHeatVariant {
  seed: number;
  /** Room temperature (°C). */
  room: number;
  /** The bath boils at this (°C). */
  boil: number;
  /** Tap water in the calorimeter (°C). */
  tap: number;
  /** Each thermometer's error (°C): it reads this much high. */
  off: Record<HeatThermo, number>;
  /** Calorimeter and stirrer (kg) and its specific heat capacity (copper). */
  calMass: number;
  calC: number;
  metal: HeatMetalId;
  /** The block's specific heat capacity (J kg⁻¹ K⁻¹) and mass (kg). */
  c: number;
  blockMass: number;
  /** Water that fills the calorimeter two-thirds (kg); a third is half of it, full is 1.5×. */
  twoThirds: number;
  /** Boiling water carried over on the block (kg) and water lost if it is dropped in (kg). */
  carry: number;
  splash: number;
  /** The kettle's warm water is this far from its nominal temperature (°C). */
  warmDev: number;
  /** Ice pieces (kg) in the order they go in; water clinging to each if not dried (kg); freezer ice (°C). */
  ice: number[];
  wet: number[];
  freezer: number;
  /** Naphthalene: mass (kg), freezing point of the pure substance (°C), impurity depression across the plateau (°C), supercooling (°C), heat loss to air (W K⁻¹). */
  naph: number;
  tf: number;
  impurity: number;
  supercool: number;
  hAir: number;
}

export function phyHeatVariant(seed: number): PhyHeatVariant {
  const r = labRandom(seed, 'phy-heat');
  const room = labBetween(r, 26, 31, 1);
  const boil = labBetween(r, 99.0, 99.8, 2);
  const tap = Math.round((room - labBetween(r, 0.5, 2.0, 2)) * 100) / 100;
  const off = { bath: labBetween(r, -0.2, 0.2, 2), cal: labBetween(r, -0.2, 0.2, 2), room: labBetween(r, -0.2, 0.2, 2), tube: labBetween(r, -0.2, 0.2, 2) };
  const calMass = labBetween(r, 0.045, 0.065, 5);
  const calC = labBetween(r, 385, 392, 1);
  const m = labPick(r, HEAT_METALS);
  const c = Math.round(m.c * (1 + labBetween(r, -0.015, 0.015, 4)) * 10) / 10;
  const blockMass = m.id === 'aluminium' ? labBetween(r, 0.08, 0.13, 5) : labBetween(r, 0.15, 0.25, 5);
  const twoThirds = labBetween(r, 0.09, 0.12, 5);
  const carry = labBetween(r, 0.0001, 0.0004, 5);
  const splash = labBetween(r, 0.002, 0.006, 5);
  const warmDev = labBetween(r, -1.5, 1.0, 2);
  const ice = Array.from({ length: 20 }, () => labBetween(r, 0.003, 0.0055, 5));
  const wet = Array.from({ length: 20 }, () => labBetween(r, 0.0004, 0.0009, 5));
  const freezer = labBetween(r, -14, -8, 1);
  const naph = labBetween(r, 0.0035, 0.0045, 5);
  const tf = labBetween(r, 79.6, 80.4, 2);
  const impurity = labBetween(r, 0.2, 0.9, 2);
  const supercool = labBetween(r, 0.8, 1.8, 2);
  const hAir = labBetween(r, 0.04, 0.048, 4);
  return { seed, room, boil, tap, off, calMass, calC, metal: m.id, c, blockMass, twoThirds, carry, splash, warmDev, ice, wet, freezer, naph, tf, impurity, supercool, hAir };
}
export const heatMetal = (v: PhyHeatVariant) => HEAT_METALS.find((m) => m.id === v.metal)!;

// ------------------------------------------------------------------ the bench's physics

/** The bench at one instant (true values; thermometers before their calibration error). */
export interface HeatPhys {
  t: number;
  bunsen: boolean;
  /** Bath water (°C). */
  bath: number;
  lagged: boolean;
  lid: boolean;
  stirring: boolean;
  /** Stirring with the thermometer (a few seconds) until this time. */
  thStirUntil: number;
  /** Calorimeter water (kg; 0 = empty) and its temperature with the calorimeter (°C). */
  mw: number;
  tw: number;
  level: number;
  block: 'bench' | 'bath' | 'air' | 'cal';
  tb: number;
  liftedAt: number | null;
  inAt: number | null;
  /** Ice pieces in the calorimeter (kg left, kg at the start, °C). */
  ice: { m: number; m0: number; T: number }[];
  /** All the ice (and water carried with it) put in (kg). */
  iceIn: number;
  lastIceAt: number | null;
  meltedAt: number | null;
  /** Boiling tube: where it is; naphthalene's enthalpy above the start of melting (J) and temperature (°C), solid fraction. */
  tube: 'rack' | 'bath' | 'air';
  H: number;
  tn: number;
  fs: number;
  nucleated: boolean;
  nucleatedAt: number | null;
  /** The thermometer was forced through solid naphthalene, or pulled out of it. */
  forced: boolean;
  /** Each thermometer's bulb (°C). */
  th: Record<HeatThermo, number>;
  /** The stopwatch (lab time it started, stopped). */
  watchStart: number | null;
  watchStop: number | null;
}

const GLASS_C = 29.4; // the boiling tube (J K⁻¹)
const naphCs = (v: PhyHeatVariant) => v.naph * C_NAPH_S + GLASS_C;
const naphCl = (v: PhyHeatVariant) => v.naph * C_NAPH_L + GLASS_C;
const naphML = (v: PhyHeatVariant) => v.naph * L_NAPH;
/** Enthalpy (J, 0 = solid just starting to melt) → temperature (equilibrium). */
function naphT(v: PhyHeatVariant, H: number): { T: number; fs: number } {
  const mL = naphML(v);
  const lo = v.tf - v.impurity;
  if (H < 0) return { T: lo + H / naphCs(v), fs: 1 };
  if (H <= mL) {
    const fs = 1 - H / mL;
    return { T: v.tf - v.impurity * fs, fs };
  }
  return { T: v.tf + (H - mL) / naphCl(v), fs: 0 };
}
const naphH = (v: PhyHeatVariant, T: number) => (T >= v.tf ? naphML(v) + (T - v.tf) * naphCl(v) : T <= v.tf - v.impurity ? (T - (v.tf - v.impurity)) * naphCs(v) : 0);
/** The bath beaker's heat capacity (J K⁻¹): 250 cm³ of water and the glass. */
const BATH_C = 0.25 * CW + 120;
const calC = (v: PhyHeatVariant, mw: number) => mw * CW + v.calMass * v.calC;
/** Calorimeter heat loss to the room (W K⁻¹). */
const lossU = (p: HeatPhys) => (p.lagged ? (p.lid ? 0.03 : 0.06) : p.lid ? 0.09 : 0.14);
export const heatLevelMass = (v: PhyHeatVariant, level: number) => (v.twoThirds * level) / 2;

function initial(v: PhyHeatVariant): HeatPhys {
  return {
    t: 0,
    bunsen: false,
    bath: v.room,
    lagged: false,
    lid: false,
    stirring: false,
    thStirUntil: -1,
    mw: 0,
    tw: v.room,
    level: 0,
    block: 'bench',
    tb: v.room,
    liftedAt: null,
    inAt: null,
    ice: [],
    iceIn: 0,
    lastIceAt: null,
    meltedAt: null,
    tube: 'rack',
    H: naphH(v, v.room),
    tn: v.room,
    fs: 1,
    nucleated: true,
    nucleatedAt: null,
    forced: false,
    th: { bath: v.room, cal: v.room, room: v.room, tube: v.room },
    watchStart: null,
    watchStop: null,
  };
}

/** Pour water at `T` (kg `m`) into the calorimeter's water (mixing; 0 °C water adds mass only). */
function mixIn(v: PhyHeatVariant, p: HeatPhys, m: number, T: number) {
  const E = calC(v, p.mw) * p.tw + m * CW * T;
  p.mw += m;
  p.tw = E / calC(v, p.mw);
}

function apply(v: PhyHeatVariant, p: HeatPhys, e: HeatEventCode, t: number) {
  const [verb, arg, extra] = e.split(':') as [string, string | undefined, string | undefined];
  switch (verb) {
    case 'bunsen':
      p.bunsen = arg === 'on';
      break;
    case 'lag':
      p.lagged = arg === 'on';
      break;
    case 'lid':
      p.lid = arg === 'on';
      break;
    case 'stir':
      p.stirring = arg === 'on';
      break;
    case 'thstir':
      p.thStirUntil = t + 5;
      break;
    case 'fill': {
      if (p.mw > 0) break;
      const level = Number(arg);
      p.level = level;
      p.mw = heatLevelMass(v, level);
      p.tw = v.tap;
      break;
    }
    case 'warm': {
      if (p.mw > 0) break;
      p.level = 2;
      p.mw = heatLevelMass(v, 2);
      p.tw = Number(arg) + v.warmDev;
      break;
    }
    case 'block':
      if (arg === 'bath' && p.block !== 'cal') p.block = 'bath';
      else if (arg === 'lift' && p.block === 'bath') (p.block = 'air'), (p.liftedAt = t);
      else if ((arg === 'gentle' || arg === 'drop') && p.block !== 'cal' && p.mw > 0) {
        const fromBath = p.block === 'bath' || (p.block === 'air' && p.liftedAt !== null && t - p.liftedAt < 15);
        // a full calorimeter overflows as the block goes in
        if (p.level >= 3) p.mw = Math.max(0, p.mw - v.blockMass / heatMetal(v).rho * 1000);
        if (arg === 'drop') p.mw = Math.max(0, p.mw - v.splash);
        if (fromBath) mixIn(v, p, v.carry, p.tb);
        p.block = 'cal';
        p.inAt = t;
      }
      break;
    case 'ice': {
      if (p.mw <= 0) break;
      const i = p.ice.length;
      if (i >= v.ice.length) break;
      const m0 = v.ice[i]!;
      const wet = arg === 'wet' ? v.wet[i]! : 0;
      p.ice.push({ m: m0, m0, T: extra === 'freezer' ? v.freezer : 0 });
      if (wet) mixIn(v, p, wet, 0);
      p.iceIn += m0 + wet;
      p.lastIceAt = t;
      p.meltedAt = null;
      break;
    }
    case 'tube':
      if (arg === 'bath') p.tube = 'bath';
      else if (arg === 'air') p.tube = 'air';
      break;
    case 'th':
      if (arg === 'pull' && p.fs > 0.3) p.forced = true;
      break;
    case 'watch':
      if (arg === 'start') (p.watchStart = t), (p.watchStop = null);
      else if (p.watchStart !== null && p.watchStop === null) p.watchStop = t;
      break;
  }
}

function step(v: PhyHeatVariant, p: HeatPhys) {
  const dt = HEAT_DT;
  const room = v.room;
  const stirred = p.stirring || p.t < p.thStirUntil;
  // the bath: the Bunsen heats it to boiling; it loses heat to the room
  let dBath = (p.bunsen ? 0.3 : 0) - 0.002 * (p.bath - room);
  // the block
  const Cb = v.blockMass * v.c;
  if (p.block === 'bath') {
    const q = 3.0 * (p.bath - p.tb);
    p.tb += (q * dt) / Cb;
    dBath -= q / BATH_C;
  } else if (p.block === 'air' || p.block === 'bench') p.tb += ((room - p.tb) * dt) / 600;
  // the boiling tube
  if (p.tube === 'bath') {
    const q = 0.5 * (p.bath - p.tn);
    p.H += q * dt;
    dBath -= q / BATH_C;
  } else p.H -= v.hAir * (stirred ? 1.1 : 1) * (p.tn - room) * dt;
  p.bath = Math.min(v.boil, p.bath + dBath * dt);
  // naphthalene: equilibrium, or a supercooled liquid until crystals form
  {
    const mL = naphML(v);
    if (p.H > mL + 1e-6) p.nucleated = false;
    if (!p.nucleated) {
      const T = v.tf + (p.H - mL) / naphCl(v);
      if (T <= v.tf - v.supercool * (stirred ? 0.3 : 1)) {
        p.nucleated = true;
        p.nucleatedAt = p.t;
        const eq = naphT(v, p.H);
        p.tn = eq.T;
        p.fs = eq.fs;
      } else (p.tn = T), (p.fs = 0);
    } else {
      const eq = naphT(v, p.H);
      p.tn = eq.T;
      p.fs = eq.fs;
    }
    if (p.tube === 'air' && stirred && p.fs > 0.6) p.forced = true;
  }
  // the calorimeter
  if (p.mw > 0) {
    const C = calC(v, p.mw);
    let q = lossU(p) * (room - p.tw);
    if (p.block === 'cal') {
      const h = Cb / (stirred ? 8 : 30);
      const qb = h * (p.tb - p.tw);
      p.tb -= (qb * dt) / Cb;
      q += qb;
    }
    // ice: warms to 0 °C, then melts; the melt joins the water at 0 °C
    let melted = 0;
    for (const piece of p.ice) {
      if (piece.m <= 0) continue;
      const P = (stirred ? 4.5 : 1.2) * (piece.m / piece.m0) ** (2 / 3) * (p.tw - piece.T);
      q -= P;
      if (piece.T < 0) piece.T = Math.min(0, piece.T + (P * dt) / (piece.m * C_ICE));
      else {
        const dm = Math.min(piece.m, Math.max(0, (P * dt) / HEAT_L_ICE));
        piece.m -= dm;
        if (piece.m < 1e-7) piece.m = 0;
        melted += dm;
      }
    }
    const E = C * p.tw + q * dt;
    p.mw += melted;
    p.tw = E / calC(v, p.mw);
    if (p.ice.length && p.meltedAt === null && p.ice.every((x) => x.m <= 0)) p.meltedAt = p.t;
  } else p.tw += ((room - p.tw) * dt) / 300;
  // thermometers follow their liquid
  const lag = (th: HeatThermo, T: number, tau: number) => (p.th[th] += ((T - p.th[th]) * dt) / tau);
  lag('bath', p.bath, 3);
  lag('cal', p.mw > 0 ? p.tw : room, stirred ? 2.5 : 6);
  lag('room', room, 20);
  lag('tube', p.tn, p.fs < 0.05 ? (stirred ? 2.5 : 4) : 6);
  p.t = Math.round((p.t + dt) * 1e6) / 1e6;
}

/** The bench simulated from the events (sorted by time); `at(t)` moves forward (or restarts for an earlier t). */
export function heatSim(v: PhyHeatVariant, events: readonly HeatEvent[]) {
  const evs = [...events].sort((a, b) => a.t - b.t);
  let p = initial(v);
  let k = 0;
  let ei = 0;
  const advance = () => {
    while (ei < evs.length && evs[ei]!.t <= k * HEAT_DT + 1e-9) apply(v, p, evs[ei]!.e, evs[ei++]!.t);
    step(v, p);
    k++;
  };
  return {
    /** The bench at lab time t (the grid point at or just after t). */
    at(t: number): HeatPhys {
      if (k * HEAT_DT > t + HEAT_DT + 1e-9) {
        p = initial(v);
        k = 0;
        ei = 0;
      }
      while (k * HEAT_DT < t - 1e-9) advance();
      return p;
    },
  };
}
export type HeatSim = ReturnType<typeof heatSim>;

/** A thermometer's reading (°C) as it shows: the bulb's temperature plus its error. */
export const heatReading = (v: PhyHeatVariant, p: HeatPhys, th: HeatThermo) => p.th[th] + v.off[th];
/** What the balance pan carries (kg) for an item at the instant `p`. */
export function heatMass(v: PhyHeatVariant, p: HeatPhys, item: HeatItem): number {
  if (item === 'block') return v.blockMass;
  return v.calMass + p.mw + (p.block === 'cal' ? v.blockMass : 0) + p.ice.reduce((t, x) => t + x.m, 0);
}

// ------------------------------------------------------------------ the student's work

export const HEAT_ITEMS = ['cal', 'block'] as const;
export type HeatItem = (typeof HEAT_ITEMS)[number];
/** A balance reading as it was taken (the true mass follows from the bench at that time). */
export interface HeatWeigh {
  item: HeatItem;
  t: number;
}
/** A thermometer reading as it was taken. */
export interface HeatRead {
  th: HeatThermo;
  t: number;
}
/** The record for the mixtures and latent-heat tables (as typed; each lab shows its own). */
export const HEAT_FIELDS = ['mc', 'm1', 'mw', 'mb', 'th1', 'th2', 'th3', 'm2', 'mi', 'room'] as const;
export type HeatField = (typeof HEAT_FIELDS)[number];
export const HEAT_TABLE: Record<'MIX' | 'LATENT', HeatField[]> = { MIX: ['mc', 'm1', 'mw', 'mb', 'th1', 'th2', 'th3'], LATENT: ['mc', 'm1', 'mw', 'room', 'th1', 'th2', 'm2', 'mi'] };
/** Cooling curve row: time on the stopwatch (s) and temperature (°C). */
export interface CoolRow {
  t: string;
  th: string;
}
export type HeatAnswerId = 'q1' | 'q2' | 'result';
export interface PhyHeatState {
  v: 1;
  task: HeatTask | null;
  events: HeatEvent[];
  weighs: HeatWeigh[];
  reads: HeatRead[];
  table: Record<HeatField, string>;
  /** Cooling curve: one row per reading of the tube thermometer while the watch ran (the read's index). */
  coolRows: number[];
  cool: CoolRow[];
  /** A smooth curve drawn through the points; the plateau marked as a line. */
  curve: boolean;
  line: PhyGraphLine | null;
  answers: Record<HeatAnswerId, PhyAnswer>;
  written: { precautions: string };
  log: { t: number; a: string }[];
}

export const emptyHeatTable = (): Record<HeatField, string> => Object.fromEntries(HEAT_FIELDS.map((f) => [f, ''])) as Record<HeatField, string>;
export function emptyPhyHeatState(): PhyHeatState {
  const blank = () => ({ value: '', unit: '' });
  return { v: 1, task: null, events: [], weighs: [], reads: [], table: emptyHeatTable(), coolRows: [], cool: [], curve: false, line: null, answers: { q1: blank(), q2: blank(), result: blank() }, written: { precautions: '' }, log: [] };
}
/** The lab clock to resume from (s): the last thing recorded. */
export const heatLastTime = (s: PhyHeatState) => Math.max(0, ...s.events.map((e) => e.t), ...s.weighs.map((w) => w.t), ...s.reads.map((r) => r.t));

const short = z.string().max(40);
const time = z.number().min(0).max(36_000);
export const phyHeatStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(HEAT_TASKS).nullable(),
  events: z.array(z.object({ t: time, e: z.enum(HEAT_EVENTS) })).max(400),
  weighs: z.array(z.object({ item: z.enum(HEAT_ITEMS), t: time })).max(20),
  reads: z.array(z.object({ th: z.enum(HEAT_THERMOS), t: time })).max(120),
  table: z.object(Object.fromEntries(HEAT_FIELDS.map((f) => [f, short])) as Record<HeatField, typeof short>),
  coolRows: z.array(z.number().int().min(0).max(119)).max(80),
  cool: z.array(z.object({ t: short, th: short })).max(80),
  curve: z.boolean(),
  line: phyGraphLineSchema.nullable(),
  answers: z.object({ q1: phyAnswerSchema, q2: phyAnswerSchema, result: phyAnswerSchema }),
  written: z.object({ precautions: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<PhyHeatState>;

export const PHY_HEAT: SimulatorSpec = {
  id: 'phy-heat',
  subject: 'Physics',
  title: 'Heat: specific heat capacity, latent heat and cooling curves',
  topicNames: ['Measurement of heat energy', 'Heat capacity', 'Specific heat capacity', 'Latent heat', 'Change of state', 'Effects of heat on matter', 'Melting and freezing'],
  minutes: 50,
  rubric: [
    {
      id: 'care',
      label: 'Care and safety',
      marks: 2,
      how: 'AUTO',
      guide: 'Mixtures: the hot block lowered gently by its thread, not dropped (1); the stirrer used, never the thermometer (1). Latent heat: every piece of ice dried before adding (1); the stirrer used, never the thermometer (1). Cooling curve: the naphthalene heated only in a water bath, never over the flame (1); the thermometer never forced through or pulled out of the solid (1).',
    },
    {
      id: 'procedure',
      label: 'Procedure',
      marks: 4,
      how: 'AUTO',
      guide: 'Mixtures: calorimeter weighed empty and with water (1); block in boiling water long enough to reach its temperature (1); transferred quickly into a lagged calorimeter and covered (1); stirred and the highest temperature recorded (1). Latent heat: weighed empty, with warm water and at the end (1); melting ice at 0 °C used (1); stirred and the lowest temperature read once all the ice had melted (1); finished about as far below room temperature as it started above it (1). Cooling curve: completely melted and heated to at least 85 °C (1); readings every 30 s (1); continued until solid and below about 66 °C (1); stirred gently while liquid (1).',
    },
    {
      id: 'readings',
      label: 'Table of readings',
      marks: 5,
      how: 'AUTO',
      guide: 'Mixtures and latent heat: masses that match the balance (±0.2 g) (2); temperatures that match the thermometers (±0.5 °C) (1); masses to 0.1 g and temperatures to 1 decimal place (1); masses by difference worked out (1). Cooling curve: temperatures that match the thermometer (±0.5 °C) (2); times that match the stopwatch (1); temperatures to 1 decimal place (1); at least 15 readings, with the plateau covered (1).',
    },
    {
      id: 'analysis',
      label: 'Heat terms / graph',
      marks: 2,
      how: 'AUTO',
      guide: 'Mixtures: heat gained by the water m_w c_w (θ₃ − θ₂) (1) and by the calorimeter m_c c_c (θ₃ − θ₂) (1) from your readings, masses in kg. Latent heat: heat lost by the water and calorimeter (m_w c_w + m_c c_c)(θ₁ − θ₂) (1) and heat to warm the melted ice m_i c_w (θ₂ − 0) (1). Cooling curve: a smooth curve through the points with the plateau marked by a horizontal line at its temperature (1) spanning the flat part (1).',
    },
    {
      id: 'calculations',
      label: 'Result',
      marks: 4,
      how: 'AUTO',
      guide: 'Mixtures: c = (heat gained) ÷ (m (θ₁ − θ₃)) from your values (2); within 10 % (1) and 4 % (1) of the true value. Latent heat: L = (heat lost − heat to warm the melt) ÷ m_i from your values (2); within 10 % (1) and 4 % (1) of 3.34 × 10⁵ J kg⁻¹. Cooling curve: the melting point from your plateau (1) and within 1 °C of the true value (1); the cooling rate before the plateau from your readings (1) and within 20 % of the true rate (1).',
    },
    { id: 'units', label: 'Units', marks: 1, how: 'AUTO', guide: 'Heat in J; c in J kg⁻¹ K⁻¹ (or J kg⁻¹ °C⁻¹); L in J kg⁻¹; the melting point in °C and the cooling rate in °C min⁻¹ (or °C s⁻¹).' },
    {
      id: 'precautions',
      label: 'Precautions',
      marks: 2,
      how: 'AI',
      guide: 'Two correct precautions (1 mark each), e.g. the calorimeter lagged and covered; the block transferred quickly without splashing; stirred before reading; eye level with the mercury meniscus (no parallax); ice dried with blotting paper; melting ice at 0 °C used; started as far above room temperature as it finished below; naphthalene heated in a water bath; the thermometer bulb fully immersed and not touching the glass; readings at regular intervals; stirred gently until solidification began.',
    },
  ],
};

// ------------------------------------------------------------------ the true values the grader (and the sandbox) use

/** The thermometer's reading at each grid step over [t0, t1] (every `every` s). */
export function heatTrace(v: PhyHeatVariant, events: readonly HeatEvent[], th: HeatThermo, t0: number, t1: number, every = 0.5): { t: number; T: number }[] {
  const sim = heatSim(v, events);
  const out: { t: number; T: number }[] = [];
  for (let t = Math.max(0, t0); t <= t1 + 1e-9; t += every) out.push({ t, T: heatReading(v, sim.at(t), th) });
  return out;
}
/** Mixtures: what a perfect experiment gives — the true c of the block. */
export const heatTrueC = (v: PhyHeatVariant) => v.c;
/** Cooling curve: the true plateau temperature as the thermometer shows it (mid-plateau). */
export const heatTruePlateau = (v: PhyHeatVariant) => v.tf - v.impurity / 2 + v.off.tube;
/** The longest run of consecutive points within ±0.6 °C of its own mean (at least three points): the plateau of a cooling curve. */
export function heatPlateau(points: { x: number; y: number }[]): { level: number; from: number; to: number; i0: number; i1: number } | null {
  let best: { level: number; from: number; to: number; i0: number; i1: number } | null = null;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 2; j < points.length; j++) {
      const ys = points.slice(i, j + 1).map((p) => p.y);
      const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
      if (ys.some((y) => Math.abs(y - mean) > 0.6)) break;
      if (!best || j - i > best.i1 - best.i0) best = { level: mean, from: points[i]!.x, to: points[j]!.x, i0: i, i1: j };
    }
  }
  return best;
}
export { CW as HEAT_CW_TRUE };
