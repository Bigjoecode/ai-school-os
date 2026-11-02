import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { phyAnswerSchema, phyGraphLineSchema, type PhyAnswer, type PhyGraphLine } from './phy-common';
import { labBetween, labPick, labRandom } from './seeded';

/**
 * phy-thermal: expansion, the gas laws and electrical heating — three WAEC
 * practicals on one bench.
 *  - EXPANSION (linear expansivity of a metal rod): measure the rod's length
 *    l₀ with the metre rule; put it in the steam jacket, one end against the
 *    fixed stop and the other against the micrometer screw gauge; read the
 *    thermometer in the jacket (θ₁) and the micrometer as its ratchet just
 *    touches (r₁); back the micrometer off and pass steam from the can over
 *    the Bunsen until the rod stops expanding; read θ₂ and screw the
 *    micrometer in again (r₂, repeated until steady). e = r₁ − r₂ and
 *    α = e / (l₀ (θ₂ − θ₁)).
 *  - CHARLES (Charles's law with a capillary tube): air trapped below a thread
 *    of concentrated sulphuric acid in a capillary sealed at the bottom, tied
 *    with the thermometer to a ruler in a large beaker of water. Heat in steps;
 *    at each, remove the flame, stir, wait and read θ and the air column's
 *    length l. Plot l against θ (°C) and extend the line back to l = 0: about
 *    −273 °C. l/T is constant.
 *  - ELECTRIC (specific heat capacity of water by electrical heating): weigh
 *    the copper calorimeter empty and with water (m); stand it in its lagging
 *    with the lid, the 12 V immersion heater fully in the water, the ammeter in
 *    series and the voltmeter across the heater; read θ₀, switch on and start
 *    the stopwatch; stir; read V, I and θ every 60 s; switch off at 300 s and
 *    record the highest temperature. E = VIt = mcΔθ.
 *
 * Physics: every step is an event at a time on the lab clock (s); `thermSim`
 * integrates the bench on a fixed 0.1 s grid (the web and the grader run the
 * same code). The steam can heats to its boiling point, steam fills the
 * jacket and the rod follows it with its own time constant (so it is still
 * expanding after the thermometer is steady); a little of the rod is outside
 * the jacket and the frame expands too; the micrometer's ratchet gives a true
 * contact, the thimble screwed tight over-reads, and a micrometer left
 * touching while the rod expands strains the rod. The water bath has a hot
 * gauze that goes on heating after the flame is removed, stratifies when not
 * stirred, and the air column lags behind the thermometer; a column only
 * partly under the water reads short; the bore is a little uneven. The
 * heater's own body stores heat (the water goes on warming just after it is
 * switched off), heat leaks to the room (much less lagged and covered), the
 * calorimeter takes its share, the supply sags slowly and the current
 * flickers; a voltmeter across the heater and ammeter reads the ammeter's
 * drop too. Thermometers lag and are each a little off.
 */

export const THERM_TASKS = ['EXPANSION', 'CHARLES', 'ELECTRIC'] as const;
export type ThermTask = (typeof THERM_TASKS)[number];

export const THERM_DT = 0.1;
/** Electrical heating: the reading interval and the heating time on the card (s). */
export const THERM_INTERVAL = 60;
export const THERM_HEAT_TIME = 300;
export const THERM_TIMES = [0, 60, 120, 180, 240, 300];
/** The thermometers' scale (°C). */
export const THERM_SCALE = { min: -10, max: 110 };
/** The specific heat capacity of water the card gives (J kg⁻¹ K⁻¹). */
export const THERM_C_WATER = 4200;
const CW = 4186;

export const THERM_METALS = [
  { id: 'brass', name: 'brass', alpha: 1.9e-5, colour: '#c9a640' },
  { id: 'copper', name: 'copper', alpha: 1.7e-5, colour: '#b8663a' },
  { id: 'aluminium', name: 'aluminium', alpha: 2.3e-5, colour: '#c9ccd1' },
  { id: 'steel', name: 'steel', alpha: 1.2e-5, colour: '#8a8d91' },
] as const;
export type ThermMetalId = (typeof THERM_METALS)[number]['id'];

/** Everything the student can do to the bench, as logged events. */
export const THERM_EVENTS = [
  // expansion
  'boiler:on',
  'boiler:off',
  'micro:back',
  'micro:ratchet',
  'micro:thimble',
  // Charles's law
  'bunsen:on',
  'bunsen:off',
  'stir',
  'immerse:full',
  'immerse:part',
  'ice',
  // electrical heating
  'pour',
  'pan:on',
  'pan:off',
  'lag:on',
  'lag:off',
  'lid:on',
  'lid:off',
  'heater:in',
  'heater:out',
  'wire:ok',
  'wire:wide',
  'switch:on',
  'switch:off',
  'stir:on',
  'stir:off',
  'watch:start',
  'watch:stop',
  'watch:reset',
] as const;
export type ThermEventCode = (typeof THERM_EVENTS)[number];
export interface ThermEvent {
  t: number;
  e: ThermEventCode;
}
/** The instruments the student reads (and writes down). */
export const THERM_INSTRUMENTS = ['thermo', 'micro', 'rule', 'column', 'ammeter', 'voltmeter', 'balance', 'watch'] as const;
export type ThermInstrument = (typeof THERM_INSTRUMENTS)[number];
export interface ThermRead {
  k: ThermInstrument;
  t: number;
}

export interface PhyThermalVariant {
  seed: number;
  /** Room temperature (°C); water boils (and the steam is) at `boil` (°C). */
  room: number;
  boil: number;
  /** Each thermometer's error (°C, it reads this much high): in the steam jacket, the water bath, the calorimeter. */
  off: { jacket: number; bath: number; cal: number };
  // EXPANSION
  metal: ThermMetalId;
  /** The rod's true linear expansivity (K⁻¹) and length at room temperature (mm). */
  alpha: number;
  L0: number;
  /** The micrometer's reading at contact with the cold rod (mm). */
  G: number;
  /** The fraction of the expansion the micrometer sees (the ends outside the jacket, the frame's own expansion). */
  eff: number;
  /** The rod's time constant (s) in steam; the thimble screwed tight over-reads by this (mm); the can's heating rate (K s⁻¹). */
  tauRod: number;
  tight: number;
  boilRate: number;
  // CHARLES
  /** The air column's length (cm) at room temperature in a perfectly uniform bore; the bore's taper (fraction over 10 cm). */
  lRef: number;
  bore: number;
  /** The fraction of the column above the water when it is only partly immersed; the air's time constant (s). */
  partFrac: number;
  tauAir: number;
  /** The Bunsen's heat into the gauze (W); the tap water (°C); iced water (°C). */
  bunsenW: number;
  tap: number;
  iceT: number;
  // ELECTRIC
  /** The heater (Ω), the supply's e.m.f. (V) and internal resistance (Ω), the ammeter's resistance (Ω), the supply's sag over 10 min (fraction). */
  R: number;
  emf: number;
  rInt: number;
  rA: number;
  sag: number;
  /** Heat capacity (J K⁻¹) of the calorimeter, stirrer and thermometer; of the heater's body. */
  cCal: number;
  cHeater: number;
  /** The calorimeter and stirrer (kg); the water poured in (kg); its temperature (°C). */
  cupMass: number;
  pour: number;
  tapE: number;
}

export function phyThermalVariant(seed: number): PhyThermalVariant {
  const r = labRandom(seed, 'phy-thermal');
  const room = labBetween(r, 26, 31, 1);
  const boil = labBetween(r, 99.0, 99.8, 2);
  const off = { jacket: labBetween(r, -0.2, 0.2, 2), bath: labBetween(r, -0.2, 0.2, 2), cal: labBetween(r, -0.2, 0.2, 2) };
  const m = labPick(r, THERM_METALS);
  const alpha = Math.round(m.alpha * (1 + labBetween(r, -0.02, 0.02, 4)) * 1e9) / 1e9;
  const L0 = labBetween(r, 598, 603, 1);
  const G = labBetween(r, 4.2, 8.8, 3);
  const eff = labBetween(r, 0.985, 0.995, 4);
  const tauRod = labBetween(r, 55, 80, 1);
  const tight = labBetween(r, 0.02, 0.05, 3);
  const boilRate = labBetween(r, 0.26, 0.34, 3);
  const lRef = labBetween(r, 9.0, 11.0, 3);
  const bore = labBetween(r, -0.04, 0.04, 4);
  const partFrac = labBetween(r, 0.22, 0.32, 3);
  const tauAir = labBetween(r, 12, 20, 1);
  const bunsenW = labBetween(r, 430, 520, 0);
  const tap = Math.round((room - labBetween(r, 0.5, 2.0, 2)) * 100) / 100;
  const iceT = labBetween(r, 3.5, 6, 2);
  const R = labBetween(r, 5.5, 6.2, 3);
  const emf = labBetween(r, 12.1, 12.6, 3);
  const rInt = labBetween(r, 0.15, 0.3, 3);
  const rA = labBetween(r, 0.04, 0.06, 3);
  const sag = labBetween(r, 0.005, 0.015, 4);
  const cCal = labBetween(r, 22, 32, 1);
  const cHeater = labBetween(r, 16, 24, 1);
  const cupMass = labBetween(r, 0.055, 0.07, 5);
  const pour = labBetween(r, 0.196, 0.204, 5);
  const tapE = Math.round((room - labBetween(r, 0.5, 2.0, 2)) * 100) / 100;
  return { seed, room, boil, off, metal: m.id, alpha, L0, G, eff, tauRod, tight, boilRate, lRef, bore, partFrac, tauAir, bunsenW, tap, iceT, R, emf, rInt, rA, sag, cCal, cHeater, cupMass, pour, tapE };
}
export const thermMetal = (v: PhyThermalVariant) => THERM_METALS.find((m) => m.id === v.metal)!;

// ------------------------------------------------------------------ the bench's physics

export interface ThermPhys {
  t: number;
  // EXPANSION
  boiler: boolean;
  /** Water in the steam can, the steam jacket, the rod (°C); the jacket thermometer's bulb. */
  can: number;
  jacket: number;
  rod: number;
  thJ: number;
  /** The micrometer's reading (mm); touching the rod; the rod's expansion when it last touched (mm); strained (left touching while it expanded). */
  spindle: number;
  contact: boolean;
  xTouch: number;
  strained: boolean;
  touches: number;
  // CHARLES
  bunsen: boolean;
  /** Gauze (°C), bath water (°C), stratification (K, top warmer than the bulb's level), stirred until (s). */
  gauze: number;
  tw: number;
  strat: number;
  stirUntil: number;
  immersed: 'none' | 'full' | 'part';
  /** Air in the column under the water, the part above it (°C); the bath thermometer's bulb. */
  air: number;
  top: number;
  thB: number;
  // ELECTRIC
  /** Water in the calorimeter (kg), its temperature (°C), the heater's body (°C). */
  mw: number;
  te: number;
  th: number;
  lagged: boolean;
  lid: boolean;
  heaterIn: boolean;
  wire: 'none' | 'ok' | 'wide';
  on: boolean;
  /** Time the heater has been on (s); it was switched on out of the water (dry). */
  onTime: number;
  dry: boolean;
  stirring: boolean;
  /** Stratification the calorimeter thermometer sees (K, it reads this much low); its bulb. */
  sC: number;
  thC: number;
  /** The current and the voltmeter's reading now. */
  amps: number;
  volts: number;
  pan: boolean;
  /** The stopwatch: running since `wStart`, plus what it held before. */
  wRun: boolean;
  wStart: number;
  wAcc: number;
}

function initial(v: PhyThermalVariant): ThermPhys {
  const room = v.room;
  return {
    t: 0,
    boiler: false,
    can: room,
    jacket: room,
    rod: room,
    thJ: room,
    spindle: Math.round((v.G - 1.0) * 1000) / 1000,
    contact: false,
    xTouch: 0,
    strained: false,
    touches: 0,
    bunsen: false,
    gauze: room,
    tw: v.tap,
    strat: 0,
    stirUntil: -1,
    immersed: 'none',
    air: room,
    top: room,
    thB: room,
    mw: 0,
    te: room,
    th: room,
    lagged: false,
    lid: false,
    heaterIn: false,
    wire: 'none',
    on: false,
    onTime: 0,
    dry: false,
    stirring: false,
    sC: 0,
    thC: room,
    amps: 0,
    volts: 0,
    pan: false,
    wRun: false,
    wStart: 0,
    wAcc: 0,
  };
}

/** The rod's expansion as the micrometer sees it (mm). */
export const thermExpansion = (v: PhyThermalVariant, p: ThermPhys) => v.alpha * v.L0 * v.eff * (p.rod - v.room);
/** The air column's length (cm) for an ideal length `li` in a uniform bore, with the bore's taper. */
export function thermBore(v: PhyThermalVariant, li: number): number {
  const b = v.bore;
  if (Math.abs(b) < 1e-9) return li;
  const a = b / 20;
  return (-(1 - b) + Math.sqrt((1 - b) ** 2 + 4 * a * li)) / (2 * a);
}
/** The air column's length (cm) now. */
export function thermColumn(v: PhyThermalVariant, p: ThermPhys): number {
  const Tref = v.room + 273.15;
  const li = p.immersed === 'part' ? (v.lRef * ((1 - v.partFrac) * (p.air + 273.15) + v.partFrac * (p.top + 273.15))) / Tref : (v.lRef * (p.air + 273.15)) / Tref;
  return thermBore(v, li);
}
/** The supply's e.m.f. after the heater has been on for `onTime` s, with its flicker at lab time t. */
const emfNow = (v: PhyThermalVariant, onTime: number, t: number) => v.emf * (1 - (v.sag * onTime) / 600) * (1 + 0.0018 * Math.sin(t * 0.71 + (v.seed % 7)) + 0.0012 * Math.sin(t * 2.3 + (v.seed % 5)));
/** Heat lost from the calorimeter to the room (W K⁻¹). */
const lossU = (p: ThermPhys) => (p.lagged ? (p.lid ? 0.06 : 0.15) : p.lid ? 0.3 : 0.5);
const BATH_C = 0.75 * CW + 250;
const GAUZE_C = 150;
const GAUZE_K = 12;

function apply(v: PhyThermalVariant, p: ThermPhys, e: ThermEventCode, t: number) {
  const [verb, arg] = e.split(':') as [string, string | undefined];
  switch (verb) {
    case 'boiler':
      p.boiler = arg === 'on';
      break;
    case 'micro': {
      const x = thermExpansion(v, p);
      const at = v.G - x;
      if (arg === 'back') {
        p.spindle = Math.round((Math.min(p.spindle, at) - 1.0) * 1000) / 1000;
        p.contact = false;
      } else {
        const r = labRandom(v.seed, `touch-${p.touches}`);
        p.touches++;
        p.spindle = at + (arg === 'ratchet' ? (r() - 0.5) * 0.004 : v.tight * (0.7 + 0.6 * r()));
        p.contact = true;
        p.xTouch = x;
      }
      break;
    }
    case 'bunsen':
      p.bunsen = arg === 'on';
      break;
    case 'stir':
      if (!arg) p.stirUntil = t + 8;
      else p.stirring = arg === 'on';
      break;
    case 'immerse':
      p.immersed = arg === 'part' ? 'part' : 'full';
      break;
    case 'ice':
      if (!p.bunsen && p.tw < 40) (p.tw = v.iceT), (p.gauze = Math.min(p.gauze, v.room)), (p.strat = 0);
      break;
    case 'pour':
      if (p.mw <= 0) (p.mw = v.pour), (p.te = v.tapE);
      break;
    case 'pan':
      p.pan = arg === 'on';
      break;
    case 'lag':
      p.lagged = arg === 'on';
      break;
    case 'lid':
      p.lid = arg === 'on';
      break;
    case 'heater':
      p.heaterIn = arg === 'in';
      break;
    case 'wire':
      p.wire = arg === 'wide' ? 'wide' : 'ok';
      break;
    case 'switch':
      if (arg === 'on' && !p.on && !(p.heaterIn && p.mw > 0)) p.dry = true;
      p.on = arg === 'on';
      break;
    case 'watch':
      if (arg === 'start' && !p.wRun) (p.wRun = true), (p.wStart = t);
      else if (arg === 'stop' && p.wRun) (p.wAcc += t - p.wStart), (p.wRun = false);
      else if (arg === 'reset' && !p.wRun) p.wAcc = 0;
      break;
  }
}

function step(v: PhyThermalVariant, p: ThermPhys) {
  const dt = THERM_DT;
  const room = v.room;
  // ---- EXPANSION: the can boils; steam fills the jacket; the rod follows; the thermometer follows the steam.
  if (p.boiler) p.can = Math.min(v.boil, p.can + v.boilRate * dt);
  else p.can += ((room - p.can) * dt) / 900;
  const steam = p.boiler && p.can >= v.boil - 0.02;
  p.jacket += steam ? ((v.boil - p.jacket) * dt) / 12 : ((room - p.jacket) * dt) / 160;
  p.rod += ((p.jacket - p.rod) * dt) / v.tauRod;
  p.thJ += ((p.jacket - p.thJ) * dt) / 5;
  if (p.contact) {
    const x = thermExpansion(v, p);
    if (x > p.xTouch + 0.02) p.strained = true;
    else if (x < p.xTouch - 0.004) p.contact = false;
  }
  // ---- CHARLES: flame → gauze → water; losses grow with temperature (evaporation); stratification unless stirred.
  const stirred = p.t < p.stirUntil;
  p.gauze += (((p.bunsen ? v.bunsenW : 0) - GAUZE_K * (p.gauze - p.tw)) * dt) / GAUZE_C;
  const h = 0.9 + 0.012 * Math.max(0, p.tw - room);
  p.tw = Math.min(v.boil, p.tw + ((GAUZE_K * (p.gauze - p.tw) - h * (p.tw - room)) * dt) / BATH_C);
  const sTarget = p.bunsen && !stirred ? 1.6 : 0;
  p.strat += ((sTarget - p.strat) * dt) / (stirred ? 2 : p.bunsen ? 40 : 90);
  const envCol = p.immersed === 'none' ? room : p.tw + 0.2 * p.strat;
  p.air += ((envCol - p.air) * dt) / v.tauAir;
  const envTop = p.immersed === 'part' ? room + 0.35 * (p.tw - room) : envCol;
  p.top += ((envTop - p.top) * dt) / 30;
  const bulb = p.immersed === 'none' ? room : p.tw - 0.4 * p.strat;
  p.thB += ((bulb - p.thB) * dt) / (stirred ? 3 : 5);
  // ---- ELECTRIC: supply → heater body → water → room.
  const I = p.on && p.wire !== 'none' ? emfNow(v, p.onTime, p.t) / (v.R + v.rInt + v.rA) : 0;
  p.amps = I;
  p.volts = I * (p.wire === 'wide' ? v.R + v.rA : v.R);
  if (p.on) p.onTime += dt;
  const P = I * I * v.R;
  const wet = p.heaterIn && p.mw > 0;
  const qh = wet ? (p.stirring ? 5 : 2.5) * (p.th - p.te) : 0.4 * (p.th - room);
  p.th += ((P - qh) * dt) / v.cHeater;
  if (p.mw > 0) {
    const C = p.mw * CW + v.cCal;
    p.te += (((wet ? qh : 0) - lossU(p) * (p.te - room)) * dt) / C;
  }
  const scT = p.on && !p.stirring && wet ? (0.7 * P) / 24 : 0;
  p.sC += ((scT - p.sC) * dt) / (p.stirring ? 3 : 40);
  p.thC += (((p.mw > 0 ? p.te - p.sC : room) - p.thC) * dt) / (p.stirring ? 3 : 6);
  p.t = Math.round((p.t + dt) * 1e6) / 1e6;
}

/** The bench simulated from the events; `at(t)` moves forward (or restarts for an earlier t); events at or before t are applied. */
export function thermSim(v: PhyThermalVariant, events: readonly ThermEvent[]) {
  const evs = [...events].sort((a, b) => a.t - b.t);
  let p = initial(v);
  let k = 0;
  let ei = 0;
  const pending = (upTo: number) => {
    while (ei < evs.length && evs[ei]!.t <= upTo + 1e-9) apply(v, p, evs[ei]!.e, evs[ei++]!.t);
  };
  return {
    at(t: number): ThermPhys {
      if (k * THERM_DT > t + THERM_DT + 1e-9) {
        p = initial(v);
        k = 0;
        ei = 0;
      }
      while (k * THERM_DT < t - 1e-9) {
        pending(k * THERM_DT);
        step(v, p);
        k++;
      }
      pending(t);
      return p;
    },
  };
}
export type ThermSim = ReturnType<typeof thermSim>;

/** The stopwatch at lab time t (s). */
export const thermWatch = (p: ThermPhys, t: number) => p.wAcc + (p.wRun ? Math.max(0, t - p.wStart) : 0);
/** The task's thermometer, as it reads (°C). */
export function thermThermo(v: PhyThermalVariant, p: ThermPhys, task: ThermTask): number {
  return task === 'EXPANSION' ? p.thJ + v.off.jacket : task === 'CHARLES' ? p.thB + v.off.bath : p.thC + v.off.cal;
}
/** What the balance shows (g, to 0.1 g). */
export const thermBalance = (v: PhyThermalVariant, p: ThermPhys) => (p.pan ? Math.round((v.cupMass + p.mw) * 10000) / 10 : 0);
/** What an instrument indicates at the instant p (lab time t): the student reads it from the scale. */
export function thermIndicates(v: PhyThermalVariant, p: ThermPhys, k: ThermInstrument, task: ThermTask, t: number): number {
  switch (k) {
    case 'thermo':
      return thermThermo(v, p, task);
    case 'micro':
      return p.spindle;
    case 'rule':
      return v.L0;
    case 'column':
      return thermColumn(v, p);
    case 'ammeter':
      return p.amps;
    case 'voltmeter':
      return p.volts;
    case 'balance':
      return thermBalance(v, p);
    case 'watch':
      return thermWatch(p, t);
  }
}
/** Copies of the bench at each of the times (one forward pass). */
export function thermSnapshots(v: PhyThermalVariant, events: readonly ThermEvent[], times: number[]): Map<number, ThermPhys> {
  const sim = thermSim(v, events);
  const out = new Map<number, ThermPhys>();
  for (const t of [...new Set(times)].sort((a, b) => a - b)) out.set(t, { ...sim.at(t) });
  return out;
}

/** EXPANSION: the expansion a perfect experiment sees from room temperature to the steam (mm), and the α it gives. */
export const thermIdealExpansion = (v: PhyThermalVariant) => v.alpha * v.L0 * v.eff * (v.boil - v.room);
/** ELECTRIC: the c a perfect, loss-free experiment gives with this calorimeter (the water's c plus the share of the calorimeter and the heater). */
export const thermCRef = (v: PhyThermalVariant) => CW + (v.cCal + v.cHeater) / v.pour;
export const thermPower = (v: PhyThermalVariant) => {
  const I = v.emf / (v.R + v.rInt + v.rA);
  return I * I * v.R;
};

// ------------------------------------------------------------------ the student's work

export interface ThermRow {
  /** CHARLES: the row number; ELECTRIC: the time on the stopwatch (s). */
  key: number;
  c: Record<string, string>;
}
export const THERM_COLS: Record<ThermTask, string[]> = { EXPANSION: [], CHARLES: ['th', 'l', 'T', 'lT'], ELECTRIC: ['th'] };
export const THERM_CELLS: Record<ThermTask, string[]> = {
  EXPANSION: ['l0', 'th1', 'r1', 'th2', 'r2', 'r2b', 'e', 'dth'],
  CHARLES: [],
  ELECTRIC: ['mc', 'mcw', 'm', 'V', 'I', 't', 'th0', 'thmax', 'dth'],
};
export type ThermAnswerId = 'alpha' | 'slope' | 'zero' | 'ratio' | 'energy' | 'power' | 'c';
export const THERM_ANSWER_IDS: ThermAnswerId[] = ['alpha', 'slope', 'zero', 'ratio', 'energy', 'power', 'c'];
export const THERM_ANSWERS: Record<ThermTask, ThermAnswerId[]> = { EXPANSION: ['alpha'], CHARLES: ['slope', 'zero', 'ratio'], ELECTRIC: ['energy', 'power', 'c'] };
export const THERM_MAX_ROWS = 12;
export const THERM_MAX_READS = 160;
export const THERM_MAX_EVENTS = 400;

export interface PhyThermalState {
  v: 1;
  task: ThermTask | null;
  events: ThermEvent[];
  reads: ThermRead[];
  rows: ThermRow[];
  cells: Record<string, string>;
  line: PhyGraphLine | null;
  answers: Record<ThermAnswerId, PhyAnswer>;
  written: { precautions: string };
  log: { t: number; a: string }[];
}

export function emptyPhyThermalState(): PhyThermalState {
  const answers = Object.fromEntries(THERM_ANSWER_IDS.map((id) => [id, { value: '', unit: '' }])) as Record<ThermAnswerId, PhyAnswer>;
  return { v: 1, task: null, events: [], reads: [], rows: [], cells: {}, line: null, answers, written: { precautions: '' }, log: [] };
}
/** The lab clock to resume from (s): the last thing recorded. */
export const thermLastTime = (s: PhyThermalState) => Math.max(0, ...s.events.map((e) => e.t), ...s.reads.map((r) => r.t));

const short = z.string().max(40);
const time = z.number().min(0).max(36_000);
const cellKey = z.string().regex(/^[a-zA-Z0-9]{1,6}$/);
const answerShape = Object.fromEntries(THERM_ANSWER_IDS.map((id) => [id, phyAnswerSchema])) as Record<ThermAnswerId, typeof phyAnswerSchema>;
export const phyThermalStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(THERM_TASKS).nullable(),
  events: z.array(z.object({ t: time, e: z.enum(THERM_EVENTS) })).max(THERM_MAX_EVENTS),
  reads: z.array(z.object({ k: z.enum(THERM_INSTRUMENTS), t: time })).max(THERM_MAX_READS),
  rows: z.array(z.object({ key: z.number().min(0).max(3600), c: z.record(cellKey, short).refine((c) => Object.keys(c).length <= 8, 'too many cells') })).max(THERM_MAX_ROWS),
  cells: z.record(cellKey, short).refine((c) => Object.keys(c).length <= 16, 'too many cells'),
  line: phyGraphLineSchema.nullable(),
  answers: z.object(answerShape),
  written: z.object({ precautions: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<PhyThermalState>;

export const PHY_THERMAL: SimulatorSpec = {
  id: 'phy-thermal',
  subject: 'Physics',
  title: 'Thermal physics: linear expansivity, Charles’s law and electrical heating',
  topicNames: ['Thermal expansion', 'Expansion of solids', 'Linear expansivity', 'The gas laws', 'Gas laws', 'Charles’s law', 'Electric energy and power', 'Electrical energy', 'Heat energy', 'Specific heat capacity'],
  minutes: 50,
  rubric: [
    {
      id: 'care',
      label: 'Care and technique',
      marks: 2,
      how: 'AUTO',
      guide: 'Expansivity: the micrometer backed off before the steam was passed, so the rod was free to expand (1); the ratchet used for every reading, never screwed tight by the thimble (1). Charles’s law: the whole air column under the water for every reading (1); the flame removed and the water stirred before every reading (1). Electrical heating: the heater fully immersed before it was switched on (1); the calorimeter lagged and covered while heating (1).',
    },
    {
      id: 'procedure',
      label: 'Procedure',
      marks: 4,
      how: 'AUTO',
      guide: 'Expansivity: l₀ measured with the metre rule (1); θ₁ and the first micrometer reading taken before the steam (1); θ₂ read once the thermometer was steady (1); the final micrometer reading taken only when the rod had stopped expanding (1). Charles’s law: at least five readings (1) over at least 50 °C (1); each reading steady — the air at the water’s temperature (1); θ and l read together (1). Electrical heating: the mass of water found by weighing (1); the stopwatch started as the heater was switched on and the heater switched off at 300 s (1); stirred all the time while heating (1); the highest temperature after switching off recorded (1).',
    },
    {
      id: 'readings',
      label: 'Table of readings',
      marks: 5,
      how: 'AUTO',
      guide: 'Readings that match the instruments: metre rule ±1 mm, micrometer ±0.01 mm, thermometers ±0.5 °C, the air column ±0.1 cm, balance ±0.2 g, ammeter ±0.05 A, voltmeter ±0.1 V, stopwatch ±1 s (3); recorded to the instrument’s precision (1); the derived values worked out — e and θ₂ − θ₁ (or the final reading repeated until steady), T = θ + 273 and l/T, m by difference and θ_max − θ₀ (1).',
    },
    {
      id: 'graph',
      label: 'Graph or working',
      marks: 2,
      how: 'AUTO',
      guide: 'Expansivity: θ₂ − θ₁ from your readings (1) and e = r₁ − r₂ from your micrometer readings (1). Charles’s law: l against θ, and electrical heating: θ against t — plotted with a straight line drawn across the points (1) that is a good best fit (1).',
    },
    {
      id: 'calculations',
      label: 'Results',
      marks: 4,
      how: 'AUTO',
      guide: 'Expansivity: α = e ÷ (l₀ (θ₂ − θ₁)) from your values, e and l₀ in the same unit (2); within 10 % (1) and 5 % (1) of the true value. Charles’s law: the slope from your line or points (1); absolute zero where your line meets l = 0 (1), within 25 °C of −273 °C (1); l/T from your readings, about constant (1). Electrical heating: E = VIt and P = VI from your values, t in seconds (1); c = E ÷ (m Δθ) from your values, m in kg (1); within 10 % (1) and 5 % (1) of the value careful work gives with this calorimeter.',
    },
    { id: 'units', label: 'Units', marks: 1, how: 'AUTO', guide: 'α in K⁻¹ (or °C⁻¹); the slope in cm K⁻¹ (cm °C⁻¹), absolute zero in °C, l/T in cm K⁻¹; E in J, P in W, c in J kg⁻¹ K⁻¹.' },
    {
      id: 'precautions',
      label: 'Precautions',
      marks: 2,
      how: 'AI',
      guide: 'Two correct precautions (1 mark each), e.g. expansivity: waited until the thermometer (and the micrometer) reading was steady; used the ratchet so the micrometer was not over-tightened; the rod fixed firmly at one end; the steam outlet directed away from people. Charles’s law: stirred and waited for a steady temperature before each reading; the flame removed before reading; the whole air column immersed; eye level with the index (no parallax). Electrical heating: the calorimeter lagged and covered; stirred continuously; the heater fully immersed before switching on; the highest temperature recorded after switching off; V and I kept steady.',
    },
  ],
};
