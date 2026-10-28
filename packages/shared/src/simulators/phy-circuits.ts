import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { phyAnswerSchema, phyGraphLineSchema, type PhyAnswer, type PhyGraphLine } from './phy-common';
import { labBetween, labRandom, roundDp } from './seeded';

/**
 * phy-circuits: three WAEC current-electricity practicals on the circuit
 * board of phy-ohms-law (cells, plug key, rheostat, analogue meters, brass
 * terminal posts, wires the student joins terminal to terminal):
 *  - BRIDGE (metre bridge): a dry cell and key across the ends of the bridge
 *    wire, the unknown X in one gap and a resistance box R in the other, a
 *    centre-zero galvanometer between the centre strip and the jockey. Tap the
 *    jockey along the wire to find the balance length l (from the left end).
 *    X/R = l/(100 − l), so X = R l/(100 − l) for each R (and X = R(100 − l)/l
 *    with X and R interchanged); mean X. Graph: R against (100 − l)/l is a
 *    straight line through the origin with slope X.
 *  - EMF (e.m.f. and internal resistance): the cell, key, ammeter and a 0–10 Ω
 *    rheostat in series, the voltmeter straight across the cell. Read V with
 *    the key open (≈ E), then V and I for several rheostat settings. V = E − Ir:
 *    V against I is a straight line, intercept E, slope −r.
 *  - SERIES (resistors in series and parallel): V and I for R₁ alone, R₂ alone,
 *    R₁ and R₂ in series and in parallel (the voltmeter across the
 *    arrangement), R = V/I for each; compare with R₁ + R₂ and R₁R₂/(R₁ + R₂).
 *
 * The circuit is solved by nodal analysis from the student's own wires (so a
 * meter in the wrong place, the wrong way round or a missing key gives zero,
 * backwards or strange readings). The cell has a seeded e.m.f. and internal
 * resistance, the meters a small calibration error and per-reading scatter.
 * The bridge wire has end resistances (α, β, as lengths of wire) and a slight
 * non-uniformity; the galvanometer (40 Ω, 10 µA a division) deflects only
 * while the jockey touches the wire.
 */

export const CIRCUITS_TASKS = ['BRIDGE', 'EMF', 'SERIES'] as const;
export type CircuitsTask = (typeof CIRCUITS_TASKS)[number];

export const CIRCUITS_TERMINALS = ['cell+', 'cell-', 'key-a', 'key-b', 'rh-a', 'rh-s', 'am+', 'am-', 'vm+', 'vm-', 'mb-a', 'mb-d', 'mb-c', 'mb-j', 'g-a', 'g-b', 'r1-a', 'r1-b', 'r2-a', 'r2-b'] as const;
export type CircuitsTerminal = (typeof CIRCUITS_TERMINALS)[number];
export const isCircuitsTerminal = (x: string): x is CircuitsTerminal => (CIRCUITS_TERMINALS as readonly string[]).includes(x);
/** The terminals on each task's board. */
export const CIRCUITS_BOARD: Record<CircuitsTask, CircuitsTerminal[]> = {
  BRIDGE: ['cell+', 'cell-', 'key-a', 'key-b', 'mb-a', 'mb-d', 'mb-c', 'mb-j', 'g-a', 'g-b'],
  EMF: ['cell+', 'cell-', 'key-a', 'key-b', 'rh-a', 'rh-s', 'am+', 'am-', 'vm+', 'vm-'],
  SERIES: ['cell+', 'cell-', 'key-a', 'key-b', 'am+', 'am-', 'vm+', 'vm-', 'r1-a', 'r1-b', 'r2-a', 'r2-b'],
};
/** A wire between two terminals, stored as "a|b" with a < b. */
export const circuitsWireKey = (a: CircuitsTerminal, b: CircuitsTerminal) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export const CIRCUITS_RHEOSTAT_MAX = 10;
export const CIRCUITS_AMMETER_FSD = 1.0;
export const CIRCUITS_VOLTMETER_FSD = 3.0;
/** Ammeter 0–1 A in 0.02 A divisions; voltmeter 0–3 V in 0.05 V divisions. */
export const CIRCUITS_AMMETER_MINOR = 0.02;
export const CIRCUITS_VOLTMETER_MINOR = 0.05;
/** The galvanometer: resistance (Ω), current per division (A), divisions each side of the centre zero. */
export const GALVO_R = 40;
export const GALVO_PER_DIV = 10e-6;
export const GALVO_DIVS = 30;
/** The resistance box's plugs (Ω): pulling plugs out puts their resistance in the gap (any whole number 0–20 Ω). */
export const RBOX_PLUGS = [10, 5, 2, 2, 1] as const;
export const RBOX_MAX = 20;
const AMMETER_R = 0.05;
const VOLTMETER_R = 10_000;
const KEY_R = 0.01;
const LEAK = 1e-9;
/** Fractional rise in a resistor's resistance per reading taken without opening the key. */
export const CIRCUITS_HEATING = 0.004;
/** Fractional fall in the cell's e.m.f. per reading taken without opening the key (polarisation). */
export const CIRCUITS_POLARISE = 0.004;

/** The plugs pulled out of the box for a value (one entry per plug in RBOX_PLUGS order: true = out). */
export function rboxPlugs(value: number): boolean[] {
  let left = Math.max(0, Math.min(RBOX_MAX, Math.round(value)));
  return RBOX_PLUGS.map((p) => {
    if (p <= left) {
      left -= p;
      return true;
    }
    return false;
  });
}

export interface PhyCircuitsVariant {
  seed: number;
  /** The dry cell: e.m.f. (V) and internal resistance (Ω). */
  emf: number;
  internal: number;
  /** BRIDGE: the unknown X (Ω), the bridge wire's whole resistance (Ω), end resistances as lengths of wire (cm), non-uniformity. */
  X: number;
  wire: number;
  alpha: number;
  beta: number;
  ripple: number;
  ripplePhase: number;
  /** SERIES: the two resistors (Ω). */
  r1: number;
  r2: number;
  /** Meter calibration (fractional gain). */
  ammeterGain: number;
  voltmeterGain: number;
}

export function phyCircuitsVariant(seed: number): PhyCircuitsVariant {
  const r = labRandom(seed, 'phy-circuits');
  return {
    seed,
    emf: labBetween(r, 1.48, 1.6, 3),
    internal: labBetween(r, 0.4, 1.1, 2),
    X: labBetween(r, 2.5, 9.0, 2),
    wire: labBetween(r, 1.5, 3.0, 2),
    alpha: labBetween(r, 0.1, 0.6, 2),
    beta: labBetween(r, 0.1, 0.6, 2),
    ripple: labBetween(r, -0.008, 0.008, 4),
    ripplePhase: labBetween(r, 0, 6.28, 2),
    r1: labBetween(r, 2.0, 3.3, 2),
    r2: labBetween(r, 3.0, 5.6, 2),
    ammeterGain: labBetween(r, -0.006, 0.006, 4),
    voltmeterGain: labBetween(r, -0.006, 0.006, 4),
  };
}

export interface CircuitsSettings {
  task: CircuitsTask;
  wires: string[];
  key: boolean;
  /** EMF: rheostat slider 0 (no resistance) … 1 (all 10 Ω). */
  rheostat: number;
  /** BRIDGE: jockey position (cm from the left end), whether it is touching the wire, the box value (Ω), X in the right gap. */
  jockey: number;
  pressed: boolean;
  rbox: number;
  swap: boolean;
  /** Readings taken since the key was last closed (heating, polarisation). */
  heat: number;
}

/** BRIDGE: the fraction of the wire's resistance between the left end and x cm (slightly non-uniform). */
export function bridgeWireFraction(v: PhyCircuitsVariant, x: number): number {
  const c = Math.max(0, Math.min(100, x));
  const k = (2 * Math.PI) / 100;
  return (c + (v.ripple / k) * (Math.sin(k * c + v.ripplePhase) - Math.sin(v.ripplePhase))) / 100;
}
/** The two gap resistances now: left (A–D) and right (D–C). */
export function bridgeGaps(v: PhyCircuitsVariant, s: Pick<CircuitsSettings, 'rbox' | 'swap' | 'heat'>): { left: number; right: number; X: number; R: number } {
  const X = v.X * (1 + CIRCUITS_HEATING * Math.max(0, s.heat));
  const R = Math.max(1e-3, Math.round(s.rbox));
  return s.swap ? { left: R, right: X, X, R } : { left: X, right: R, X, R };
}
/** The true balance length (cm from the left end) with the circuit correctly connected. */
export function bridgeBalance(v: PhyCircuitsVariant, s: Pick<CircuitsSettings, 'rbox' | 'swap' | 'heat'>): number {
  const g = bridgeGaps(v, s);
  const target = g.left / (g.left + g.right);
  const total = 1 + (v.alpha + v.beta) / 100;
  const at = (x: number) => (v.alpha / 100 + bridgeWireFraction(v, x)) / total - target;
  let lo = 0;
  let hi = 100;
  if (at(lo) >= 0) return 0;
  if (at(hi) <= 0) return 100;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

interface Element {
  a: CircuitsTerminal;
  b: CircuitsTerminal;
  r: number;
  /** Norton source: current pushed from a to b inside the element (A). */
  src?: number;
  name: string;
}

export interface CircuitsSolution {
  /** Current through the ammeter, + to − (A); p.d. across the voltmeter, + minus − (V); current through the galvanometer, a to b (A). */
  ammeter: number;
  voltmeter: number;
  galvo: number;
  /** Current out of the cell's + terminal and its terminal p.d. */
  cellCurrent: number;
  cellVoltage: number;
  rheostatCurrent: number;
  /** BRIDGE: p.d. between the two ends of the wire (A minus C). */
  wireVoltage: number;
  /** SERIES: current through and p.d. across each resistor. */
  i1: number;
  i2: number;
  v1: number;
  v2: number;
}

const heatEmf = (v: PhyCircuitsVariant, heat: number) => v.emf * (1 - CIRCUITS_POLARISE * Math.max(0, heat));

/** Solves the student's circuit (nodal analysis over the wired terminals). */
export function circuitsSolve(v: PhyCircuitsVariant, s: CircuitsSettings): CircuitsSolution {
  const board = CIRCUITS_BOARD[s.task];
  const parent = new Map<string, string>(board.map((t) => [t, t]));
  const find = (x: string): string => {
    let p = parent.get(x)!;
    while (p !== parent.get(p)) p = parent.get(p)!;
    parent.set(x, p);
    return p;
  };
  for (const w of s.wires) {
    const [a, b] = w.split('|');
    if (!a || !b || !parent.has(a) || !parent.has(b)) continue;
    parent.set(find(a), find(b));
  }
  const E = heatEmf(v, s.heat);
  const els: Element[] = [{ a: 'cell-', b: 'cell+', r: v.internal, src: E / v.internal, name: 'cell' }];
  if (s.key) els.push({ a: 'key-a', b: 'key-b', r: KEY_R, name: 'key' });
  if (s.task === 'EMF') els.push({ a: 'rh-a', b: 'rh-s', r: Math.max(1e-3, CIRCUITS_RHEOSTAT_MAX * Math.max(0, Math.min(1, s.rheostat))), name: 'rheostat' });
  if (s.task !== 'BRIDGE') els.push({ a: 'am+', b: 'am-', r: AMMETER_R, name: 'ammeter' }, { a: 'vm+', b: 'vm-', r: VOLTMETER_R, name: 'voltmeter' });
  if (s.task === 'SERIES') {
    const warm = 1 + CIRCUITS_HEATING * Math.max(0, s.heat);
    els.push({ a: 'r1-a', b: 'r1-b', r: v.r1 * warm, name: 'r1' }, { a: 'r2-a', b: 'r2-b', r: v.r2 * warm, name: 'r2' });
  }
  if (s.task === 'BRIDGE') {
    const g = bridgeGaps(v, s);
    const f = bridgeWireFraction(v, s.jockey);
    els.push(
      { a: 'mb-a', b: 'mb-d', r: g.left, name: 'gapL' },
      { a: 'mb-d', b: 'mb-c', r: g.right, name: 'gapR' },
      { a: 'mb-a', b: 'mb-j', r: Math.max(1e-4, v.wire * (v.alpha / 100 + f)), name: 'wireL' },
      { a: 'mb-j', b: 'mb-c', r: Math.max(1e-4, v.wire * (1 - f + v.beta / 100)), name: 'wireR' },
      { a: 'g-a', b: 'g-b', r: GALVO_R, name: 'galvo' },
    );
  }

  const roots = [...new Set(board.map(find))];
  const idx = new Map(roots.map((r, i) => [r, i]));
  const n = roots.length;
  const G = Array.from({ length: n }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i < n; i++) G[i]![i]! += LEAK;
  // The jockey only connects the galvanometer to the wire while pressed: otherwise its contact is open.
  const live = els.filter((e) => !(s.task === 'BRIDGE' && !s.pressed && (e.name === 'wireL' || e.name === 'wireR')));
  const jockeyLifted = s.task === 'BRIDGE' && !s.pressed;
  const solveEls = jockeyLifted
    ? [...live, { a: 'mb-a' as CircuitsTerminal, b: 'mb-c' as CircuitsTerminal, r: v.wire * (1 + (v.alpha + v.beta) / 100), name: 'wire' }]
    : live;
  for (const e of solveEls) {
    const i = idx.get(find(e.a))!;
    const j = idx.get(find(e.b))!;
    if (i !== j) {
      const g = 1 / e.r;
      G[i]![i]! += g;
      G[j]![j]! += g;
      G[i]![j]! -= g;
      G[j]![i]! -= g;
    }
    if (e.src && i !== j) {
      G[i]![n]! -= e.src;
      G[j]![n]! += e.src;
    }
  }
  const g0 = idx.get(find('cell-'))!;
  for (let c = 0; c <= n; c++) G[g0]![c] = c === g0 ? 1 : 0;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(G[r]![c]!) > Math.abs(G[p]![c]!)) p = r;
    [G[c], G[p]] = [G[p]!, G[c]!];
    const piv = G[c]![c]!;
    if (Math.abs(piv) < 1e-15) continue;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = G[r]![c]! / piv;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) G[r]![k]! -= f * G[c]![k]!;
    }
  }
  const V = roots.map((_, i) => (Math.abs(G[i]![i]!) < 1e-15 ? 0 : G[i]![n]! / G[i]![i]!));
  const volt = (t: CircuitsTerminal) => (parent.has(t) ? V[idx.get(find(t))!]! : 0);
  const el = (name: string) => solveEls.find((e) => e.name === name);
  const through = (name: string) => {
    const e = el(name);
    return !e || find(e.a) === find(e.b) ? 0 : (volt(e.a) - volt(e.b)) / e.r;
  };
  const across = (name: string) => {
    const e = el(name);
    return e ? volt(e.a) - volt(e.b) : 0;
  };
  const cellV = volt('cell+') - volt('cell-');
  return {
    ammeter: through('ammeter'),
    voltmeter: s.task === 'BRIDGE' ? 0 : volt('vm+') - volt('vm-'),
    galvo: through('galvo'),
    // Current out of + = (E − terminal p.d.)/r.
    cellCurrent: (E - cellV) / v.internal,
    cellVoltage: cellV,
    rheostatCurrent: Math.abs(through('rheostat')),
    wireVoltage: s.task === 'BRIDGE' ? volt('mb-a') - volt('mb-c') : 0,
    i1: Math.abs(through('r1')),
    i2: Math.abs(through('r2')),
    v1: Math.abs(across('r1')),
    v2: Math.abs(across('r2')),
  };
}

export interface CircuitsMeters {
  I: number;
  V: number;
  overI: boolean;
  overV: boolean;
  backI: boolean;
  backV: boolean;
  /** Galvanometer deflection in divisions (+ to the right), clamped at the end stops; pinned when off the scale. */
  galvo: number;
  galvoPinned: boolean;
}

/** What the meters show: calibrated, with tiny seeded scatter, pinned at 0 (reversed) or full scale (over-range). */
export function circuitsMeters(v: PhyCircuitsVariant, s: CircuitsSettings, index: number | string): CircuitsMeters {
  const sol = circuitsSolve(v, s);
  const rand = labRandom(v.seed, `circuits-reading-${index}`);
  const I = sol.ammeter * (1 + v.ammeterGain) * (1 + labBetween(rand, -0.0015, 0.0015, 5));
  const V = sol.voltmeter * (1 + v.voltmeterGain) * (1 + labBetween(rand, -0.0015, 0.0015, 5));
  const clampI = Math.max(0, Math.min(CIRCUITS_AMMETER_FSD * 1.04, I));
  const clampV = Math.max(0, Math.min(CIRCUITS_VOLTMETER_FSD * 1.04, V));
  const div = sol.galvo / GALVO_PER_DIV;
  const lim = GALVO_DIVS * 1.06;
  return {
    I: roundDp(clampI, 4),
    V: roundDp(clampV, 4),
    overI: I > CIRCUITS_AMMETER_FSD * 1.04,
    overV: V > CIRCUITS_VOLTMETER_FSD * 1.04,
    backI: I < -0.005,
    backV: V < -0.02,
    galvo: roundDp(Math.max(-lim, Math.min(lim, div)), 2),
    galvoPinned: Math.abs(div) > lim,
  };
}

export type SeriesArrangement = 'R1' | 'R2' | 'S' | 'P';
export const SERIES_ARRANGEMENTS: SeriesArrangement[] = ['R1', 'R2', 'S', 'P'];
export const SERIES_LABEL: Record<SeriesArrangement, string> = { R1: 'R₁ alone', R2: 'R₂ alone', S: 'R₁ and R₂ in series', P: 'R₁ and R₂ in parallel' };

export interface CircuitsCheck {
  works: boolean;
  /** EMF/SERIES: the ammeter carries the whole current; the voltmeter across the cell (EMF) or the arrangement (SERIES); + to +. */
  ammeterSeries: boolean;
  voltmeterAcross: boolean;
  polarity: boolean;
  rheostatSeries: boolean;
  keySeries: boolean;
  /** BRIDGE: the cell (through the key) across the wire's two ends; the galvanometer between the centre strip and the jockey. */
  supplyAcross: boolean;
  galvoBridge: boolean;
  /** SERIES: which arrangement of the resistors carries the current (null: none of the four). */
  arrangement: SeriesArrangement | null;
}

/** How the circuit is wired (judged by solving it, so any layout that works counts). */
export function circuitsCheck(v: PhyCircuitsVariant, s: CircuitsSettings): CircuitsCheck {
  const base = { ...s, heat: 0 };
  const on = circuitsSolve(v, { ...base, key: true });
  const off = circuitsSolve(v, { ...base, key: false });
  const out: CircuitsCheck = { works: false, ammeterSeries: false, voltmeterAcross: false, polarity: false, rheostatSeries: false, keySeries: false, supplyAcross: false, galvoBridge: false, arrangement: null };
  const near = (a: number, b: number, rel = 0.01, abs = 1e-4) => Math.abs(a - b) <= rel * Math.abs(b) + abs;
  if (s.task === 'BRIDGE') {
    out.supplyAcross = Math.abs(on.wireVoltage) > 0.2 && near(Math.abs(on.wireVoltage), Math.abs(on.cellVoltage), 0.02, 0.005);
    out.keySeries = out.supplyAcross && Math.abs(off.wireVoltage) < 0.005;
    // With a box value that balances near the middle, the galvanometer must deflect opposite ways near the two ends.
    const mid = { ...base, key: true, pressed: true, rbox: Math.max(1, Math.min(RBOX_MAX, Math.round(v.X))) };
    const lo = circuitsSolve(v, { ...mid, jockey: 3 }).galvo;
    const hi = circuitsSolve(v, { ...mid, jockey: 97 }).galvo;
    out.galvoBridge = Math.abs(lo) > 2e-6 && Math.abs(hi) > 2e-6 && Math.sign(lo) !== Math.sign(hi);
    out.works = out.supplyAcross && out.galvoBridge;
    out.polarity = out.works;
    return out;
  }
  const I = on.ammeter;
  const cellI = on.cellCurrent;
  out.works = cellI > 0.02 && Math.abs(I) > 0.02;
  out.keySeries = out.works && Math.abs(off.cellCurrent) < 1e-3;
  out.ammeterSeries = out.works && near(Math.abs(I), cellI, 0.01, 2e-4);
  if (s.task === 'EMF') {
    out.voltmeterAcross = out.works && near(Math.abs(on.voltmeter), on.cellVoltage, 0.005, 1e-4);
    const low = circuitsSolve(v, { ...base, key: true, rheostat: 0.1 });
    const high = circuitsSolve(v, { ...base, key: true, rheostat: 0.9 });
    out.rheostatSeries = out.works && near(on.rheostatCurrent, cellI, 0.01, 2e-4) && low.cellCurrent > high.cellCurrent * 1.2;
  } else {
    const { i1, i2, v1, v2 } = on;
    const a = Math.abs(I);
    const lit = (x: number) => x > 0.01;
    let arr: SeriesArrangement | null = null;
    let vComb = 0;
    if (lit(i1) && !lit(i2) && near(a, i1)) (arr = 'R1'), (vComb = v1);
    else if (lit(i2) && !lit(i1) && near(a, i2)) (arr = 'R2'), (vComb = v2);
    else if (lit(i1) && lit(i2) && near(i1, i2) && near(a, i1)) (arr = 'S'), (vComb = v1 + v2);
    else if (lit(i1) && lit(i2) && near(a, i1 + i2) && near(v1, v2)) (arr = 'P'), (vComb = v1);
    out.arrangement = out.ammeterSeries ? arr : null;
    out.voltmeterAcross = !!out.arrangement && near(Math.abs(on.voltmeter), vComb, 0.005, 1e-4);
    out.rheostatSeries = true;
  }
  out.polarity = out.ammeterSeries && out.voltmeterAcross && I > 0 && on.voltmeter > 0;
  return out;
}

// ------------------------------------------------------------------ the student's work

/** The board at the moment the student took a reading (the meters' values are recomputed from it). */
export interface CircuitsReading {
  wires: string[];
  rheostat: number;
  jockey: number;
  rbox: number;
  swap: boolean;
  heat: number;
}
/** BRIDGE row: R (Ω), l (cm), 100 − l (cm), (100 − l)/l, X (Ω). */
export interface BridgeRow {
  R: string;
  l: string;
  m: string;
  q: string;
  X: string;
}
/** EMF row: I (A), V (V). */
export interface EmfRow {
  I: string;
  V: string;
}
/** SERIES row: the arrangement the student says it is, V (V), I (A), R = V/I (Ω). */
export interface SeriesRow {
  arr: '' | SeriesArrangement;
  V: string;
  I: string;
  R: string;
}
export const CIRCUITS_ANSWER_IDS = ['mean', 'slope', 'e0', 'emf', 'r', 'r1', 'r2', 'rs', 'rp', 'rsCalc', 'rpCalc'] as const;
export type CircuitsAnswerId = (typeof CIRCUITS_ANSWER_IDS)[number];
export interface PhyCircuitsState {
  v: 1;
  task: CircuitsTask | null;
  wires: string[];
  key: boolean;
  rheostat: number;
  jockey: number;
  pressed: boolean;
  rbox: number;
  swap: boolean;
  heat: number;
  /** BRIDGE: times the jockey was slid along the wire while touching it. */
  scrapes: number;
  /** EMF/SERIES: times the key was closed (or the circuit changed) with the ammeter over its full scale. */
  overloads: number;
  readings: CircuitsReading[];
  /** The task's table: one row per reading, in order. */
  bridge: BridgeRow[];
  emf: EmfRow[];
  series: SeriesRow[];
  line: PhyGraphLine | null;
  answers: Record<CircuitsAnswerId, PhyAnswer>;
  written: { conclusion: string; precautions: string };
  log: { t: number; a: string }[];
}

export function emptyPhyCircuitsState(): PhyCircuitsState {
  const answers = Object.fromEntries(CIRCUITS_ANSWER_IDS.map((id) => [id, { value: '', unit: '' }])) as Record<CircuitsAnswerId, PhyAnswer>;
  return {
    v: 1,
    task: null,
    wires: [],
    key: false,
    rheostat: 1,
    jockey: 50,
    pressed: false,
    rbox: 0,
    swap: false,
    heat: 0,
    scrapes: 0,
    overloads: 0,
    readings: [],
    bridge: [],
    emf: [],
    series: [],
    line: null,
    answers,
    written: { conclusion: '', precautions: '' },
    log: [],
  };
}

/** The reading's full settings (key closed, the jockey touching the wire). */
export const circuitsReadingSettings = (task: CircuitsTask, r: CircuitsReading): CircuitsSettings => ({ task, wires: r.wires, key: true, rheostat: r.rheostat, jockey: r.jockey, pressed: true, rbox: r.rbox, swap: r.swap, heat: r.heat });

const short = z.string().max(40);
const wire = z.string().max(24).regex(/^[a-z0-9+-]+\|[a-z0-9+-]+$/);
const MAX_ROWS = 16;
export const phyCircuitsStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(CIRCUITS_TASKS).nullable(),
  wires: z.array(wire).max(24),
  key: z.boolean(),
  rheostat: z.number().min(0).max(1),
  jockey: z.number().min(0).max(100),
  pressed: z.boolean(),
  rbox: z.number().int().min(0).max(RBOX_MAX),
  swap: z.boolean(),
  heat: z.number().int().min(0).max(100),
  scrapes: z.number().int().min(0).max(10_000),
  overloads: z.number().int().min(0).max(10_000),
  readings: z.array(z.object({ wires: z.array(wire).max(24), rheostat: z.number().min(0).max(1), jockey: z.number().min(0).max(100), rbox: z.number().int().min(0).max(RBOX_MAX), swap: z.boolean(), heat: z.number().int().min(0).max(100) })).max(MAX_ROWS),
  bridge: z.array(z.object({ R: short, l: short, m: short, q: short, X: short })).max(MAX_ROWS),
  emf: z.array(z.object({ I: short, V: short })).max(MAX_ROWS),
  series: z.array(z.object({ arr: z.enum(['', 'R1', 'R2', 'S', 'P']), V: short, I: short, R: short })).max(MAX_ROWS),
  line: phyGraphLineSchema.nullable(),
  answers: z.object(Object.fromEntries(CIRCUITS_ANSWER_IDS.map((id) => [id, phyAnswerSchema])) as Record<CircuitsAnswerId, typeof phyAnswerSchema>),
  written: z.object({ conclusion: z.string().max(1000), precautions: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<PhyCircuitsState>;
export const CIRCUITS_MAX_ROWS = MAX_ROWS;

export const PHY_CIRCUITS: SimulatorSpec = {
  id: 'phy-circuits',
  subject: 'Physics',
  title: 'Current electricity: metre bridge, e.m.f. and internal resistance, series and parallel',
  topicNames: ['Measurement of electric current, p.d., resistance, e.m.f. and internal resistance of a cell', 'Electric circuit', 'Wheatstone bridge', 'Electromotive force', 'Potential difference and electric current'],
  minutes: 45,
  rubric: [
    { id: 'circuit', label: 'Circuit', marks: 3, how: 'AUTO', guide: 'Metre bridge: the cell and key in series across the two ends of the bridge wire (1); the galvanometer between the centre strip (junction of X and R) and the jockey (1); the key in series with the cell (1). E.m.f.: the ammeter and rheostat in series with the cell (1); the voltmeter directly across the cell terminals (1); the key in series and both meters with + towards the + of the cell (1). Series/parallel: the ammeter in series with the resistors (1); the voltmeter across the resistor arrangement only (1); the key in series and both meters + to + (1).' },
    { id: 'procedure', label: 'Procedure', marks: 3, how: 'AUTO', guide: 'Metre bridge: balance found for at least four different values of R (1); R chosen so the balance points lie between 30 cm and 70 cm (1); X and R interchanged and the balance found again (1). E.m.f.: at least four readings at different currents (1) spread over at least 0.4 A (1); the voltmeter (directly across the cell) read with the key open and recorded: the open-circuit p.d. ≈ E (1). Series/parallel: each resistor measured on its own (1); the series arrangement measured (1); the parallel arrangement measured (1).' },
    { id: 'care', label: 'Care with the apparatus', marks: 2, how: 'AUTO', guide: 'Metre bridge: the jockey tapped on the wire, never slid along it while pressed (1); the key opened between readings (1). E.m.f. and series/parallel: the key opened between readings so the cell does not run down or the resistors warm up (1); the cell never short-circuited — the ammeter never driven past its full scale (1).' },
    { id: 'readings', label: 'Table of readings', marks: 4, how: 'AUTO', guide: 'Metre bridge: each balance length taken where the galvanometer reads zero and read correctly from the left end (±0.3 cm) (2); l to 1 decimal place in cm (1); 100 − l, (100 − l)/l and X worked out for every row (1). E.m.f.: meter readings that match the meters (ammeter ±0.01 A, voltmeter ±0.03 V) (2); recorded to 2 decimal places (1); the open-circuit p.d. matching the voltmeter with the key open, to 2 decimal places (1). Series/parallel: readings that match the meters (2); to 2 decimal places (1); each row labelled with the arrangement actually connected, and R = V/I worked out (1).' },
    { id: 'analysis', label: 'Graph or comparison', marks: 2, how: 'AUTO', guide: 'Metre bridge: R against (100 − l)/l, or e.m.f.: V against I, plotted with a straight line drawn across the points (1) that is a good best fit (1). Series/parallel: R₁ + R₂ (1) and R₁R₂/(R₁ + R₂) (1) worked out from your own measured R₁ and R₂.' },
    { id: 'calculations', label: 'Results', marks: 3, how: 'AUTO', guide: 'Metre bridge: the mean of your X values (1); the slope of your graph (1); X within 4 % of the true value (1). E.m.f.: E from the intercept on the V-axis (1); r = −slope (1); E within 2 % and r within 12 % of the true values (1). Series/parallel: R₁, R₂, the series and parallel resistances from your own V/I (1); the measured and calculated series and parallel values agree within 5 % (1); R₁ and R₂ within 4 % of the true values (1).' },
    { id: 'units', label: 'Units', marks: 1, how: 'AUTO', guide: 'Every answer with its unit: Ω for resistances and the slope of R against (100 − l)/l; V for E and the open-circuit p.d., Ω (or V A⁻¹) for r and the slope of V against I.' },
    { id: 'conclusion', label: 'Conclusion', marks: 1, how: 'AI', guide: 'Metre bridge: the value of X found (and that the check with X and R interchanged agrees). E.m.f.: the terminal p.d. falls in a straight line as the current rises, V = E − Ir, with E and r stated. Series/parallel: the series resistance is larger than either resistor and equals R₁ + R₂; the parallel resistance is smaller than either and 1/R = 1/R₁ + 1/R₂.' },
    { id: 'precautions', label: 'Precautions', marks: 1, how: 'AI', guide: 'Two correct precautions (half a mark each), e.g. the key opened between readings; tight, clean connections; avoid parallax when reading the meters/the scale; check the meter zero; (metre bridge) tap the jockey, do not slide it; balance point near the middle of the wire; interchange X and R to cancel end errors; (e.m.f.) the voltmeter connected directly across the cell; current kept small and for a short time so the cell does not polarise.' },
  ],
};

/** The true quantities each task finds. */
export const circuitsTrue = (v: PhyCircuitsVariant) => ({ X: v.X, E: v.emf, r: v.internal, r1: v.r1, r2: v.r2, rs: v.r1 + v.r2, rp: (v.r1 * v.r2) / (v.r1 + v.r2) });
/** EMF: the open-circuit voltmeter reading (voltmeter straight across the cell, key open). */
export const circuitsOpenCircuit = (v: PhyCircuitsVariant) => (v.emf * VOLTMETER_R) / (VOLTMETER_R + v.internal);
