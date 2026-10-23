import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { phyAnswerSchema, phyGraphLineSchema, type PhyAnswer, type PhyGraphLine } from './phy-common';
import { labBetween, labPick, labRandom, roundDp } from './seeded';

/**
 * phy-ohms-law: WAEC current electricity on a circuit board. The student wires
 * a battery (two 1.5 V cells), a key, a rheostat, an ammeter, a voltmeter and
 * either a standard resistor (task OHM: vary the rheostat, tabulate I and V,
 * slope of V against I = R) or a resistance wire on a metre rule with a jockey
 * (task WIRE: vary the length L, R = V/I, slope of R against L = ρ/A, so
 * ρ = slope × A from the given diameter). The circuit is solved by nodal
 * analysis from the student's own wires, so a meter in the wrong place, the
 * wrong way round or a missing key gives zero or strange readings.
 */

export const OHMS_TASKS = ['OHM', 'WIRE'] as const;
export type OhmsTask = (typeof OHMS_TASKS)[number];

/** Every terminal on the board. The test element is the resistor (OHM) or the wire (WIRE). */
export const OHMS_TERMINALS = ['cell+', 'cell-', 'key-a', 'key-b', 'rh-a', 'rh-s', 'am+', 'am-', 'vm+', 'vm-', 'res-a', 'res-b', 'w-0', 'w-j', 'w-100'] as const;
export type OhmsTerminal = (typeof OHMS_TERMINALS)[number];
export const isOhmsTerminal = (x: string): x is OhmsTerminal => (OHMS_TERMINALS as readonly string[]).includes(x);
/** The terminals each task's board shows. */
export const OHMS_BOARD: Record<OhmsTask, OhmsTerminal[]> = {
  OHM: ['cell+', 'cell-', 'key-a', 'key-b', 'rh-a', 'rh-s', 'am+', 'am-', 'vm+', 'vm-', 'res-a', 'res-b'],
  WIRE: ['cell+', 'cell-', 'key-a', 'key-b', 'rh-a', 'rh-s', 'am+', 'am-', 'vm+', 'vm-', 'w-0', 'w-j', 'w-100'],
};

export const OHMS_EMF = 3.0;
export const OHMS_RHEOSTAT_MAX = 20;
export const OHMS_AMMETER_FSD = 1.0;
export const OHMS_VOLTMETER_FSD = 3.0;
const AMMETER_R = 0.05;
const VOLTMETER_R = 10_000;
const KEY_R = 0.01;
const LEAK = 1e-9;
/** Fractional rise in resistance per reading taken without opening the key (heating). */
export const OHMS_HEATING = 0.006;

export interface PhyOhmsVariant {
  seed: number;
  /** Battery internal resistance (Ω). */
  internal: number;
  /** OHM: the standard resistor (Ω). */
  resistor: number;
  /** WIRE: material, true resistivity (Ω m), diameter given (mm, 2 d.p.), area (m²) and resistance per metre (Ω m⁻¹). */
  wire: { material: string; rho: number; diameterMm: number; area: number; perMetre: number };
  /** Meter calibration (fractional gain). */
  ammeterGain: number;
  voltmeterGain: number;
}

const MATERIALS = [
  { material: 'constantan (eureka)', rho: [4.7e-7, 5.1e-7], d: [0.28, 0.4] },
  { material: 'nichrome', rho: [1.0e-6, 1.12e-6], d: [0.4, 0.56] },
] as const;

export function phyOhmsVariant(seed: number): PhyOhmsVariant {
  const r = labRandom(seed, 'phy-ohms-law');
  const internal = labBetween(r, 0.3, 0.8, 2);
  const resistor = labBetween(r, 3.0, 8.0, 2);
  const m = labPick(r, MATERIALS);
  const rho = labBetween(r, m.rho[0] * 1e9, m.rho[1] * 1e9, 0) / 1e9;
  const diameterMm = labBetween(r, m.d[0], m.d[1], 2);
  const area = (Math.PI * (diameterMm / 1000) ** 2) / 4;
  return {
    seed,
    internal,
    resistor,
    wire: { material: m.material, rho, diameterMm, area, perMetre: rho / area },
    ammeterGain: labBetween(r, -0.008, 0.008, 4),
    voltmeterGain: labBetween(r, -0.008, 0.008, 4),
  };
}

/** A wire between two terminals, stored as "a|b" with a < b. */
export const ohmsWireKey = (a: OhmsTerminal, b: OhmsTerminal) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export interface OhmsSettings {
  task: OhmsTask;
  wires: string[];
  key: boolean;
  /** Rheostat slider, 0 (no resistance) … 1 (full 20 Ω). */
  rheostat: number;
  /** Jockey position along the wire (cm from the 0 end). */
  jockey: number;
  /** Readings taken since the key was last closed (heating). */
  heat: number;
}

export interface OhmsSolution {
  /** Current through the ammeter, + to − (A); and p.d. across the voltmeter, + minus − (V). Unclamped, without calibration. */
  ammeter: number;
  voltmeter: number;
  /** Current through the test element and p.d. across it (true values). */
  testCurrent: number;
  testVoltage: number;
  rheostatCurrent: number;
}

interface Element {
  a: OhmsTerminal;
  b: OhmsTerminal;
  r: number;
  /** Norton source: current pushed from a to b inside the element (A). */
  src?: number;
  name: string;
}

/** The test element's resistance now (heated a little by readings taken without opening the key). */
export function ohmsTestResistance(v: PhyOhmsVariant, s: Pick<OhmsSettings, 'task' | 'jockey' | 'heat'>): { whole: number; toJockey: number; beyond: number } {
  const warm = 1 + OHMS_HEATING * Math.max(0, s.heat);
  if (s.task === 'OHM') return { whole: v.resistor * warm, toJockey: 0, beyond: 0 };
  const L = Math.max(0, Math.min(100, s.jockey)) / 100;
  return { whole: v.wire.perMetre * warm, toJockey: Math.max(1e-4, v.wire.perMetre * L * warm), beyond: Math.max(1e-4, v.wire.perMetre * (1 - L) * warm) };
}

/** Solves the student's circuit (nodal analysis over the wired terminals). */
export function ohmsSolve(v: PhyOhmsVariant, s: OhmsSettings): OhmsSolution {
  const board = OHMS_BOARD[s.task];
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
  const test = ohmsTestResistance(v, s);
  const els: Element[] = [
    { a: 'cell-', b: 'cell+', r: v.internal, src: OHMS_EMF / v.internal, name: 'cell' },
    { a: 'rh-a', b: 'rh-s', r: Math.max(1e-3, OHMS_RHEOSTAT_MAX * Math.max(0, Math.min(1, s.rheostat))), name: 'rheostat' },
    { a: 'am+', b: 'am-', r: AMMETER_R, name: 'ammeter' },
    { a: 'vm+', b: 'vm-', r: VOLTMETER_R, name: 'voltmeter' },
  ];
  if (s.key) els.push({ a: 'key-a', b: 'key-b', r: KEY_R, name: 'key' });
  if (s.task === 'OHM') els.push({ a: 'res-a', b: 'res-b', r: test.whole, name: 'test' });
  else els.push({ a: 'w-0', b: 'w-j', r: test.toJockey, name: 'test' }, { a: 'w-j', b: 'w-100', r: test.beyond, name: 'beyond' });

  const roots = [...new Set(board.map(find))];
  const idx = new Map(roots.map((r, i) => [r, i]));
  const n = roots.length;
  const G = Array.from({ length: n }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i < n; i++) G[i]![i]! += LEAK;
  for (const e of els) {
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
      // Current pushed from a to b inside the cell leaves node b into the circuit.
      G[i]![n]! -= e.src;
      G[j]![n]! += e.src;
    }
  }
  // Ground the cell's negative terminal.
  const g0 = idx.get(find('cell-'))!;
  for (let c = 0; c <= n; c++) G[g0]![c] = c === g0 ? 1 : 0;
  // Gaussian elimination with partial pivoting.
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
  const volt = (t: OhmsTerminal) => V[idx.get(find(t))!]!;
  const through = (e: Element) => (find(e.a) === find(e.b) ? 0 : (volt(e.a) - volt(e.b)) / e.r);
  const el = (name: string) => els.find((e) => e.name === name)!;
  return {
    ammeter: through(el('ammeter')),
    voltmeter: volt('vm+') - volt('vm-'),
    testCurrent: Math.abs(through(el('test'))),
    testVoltage: Math.abs(volt(el('test').a) - volt(el('test').b)),
    rheostatCurrent: Math.abs(through(el('rheostat'))),
  };
}

/** What the two meters show: calibrated, with tiny seeded scatter, pinned at 0 (reversed) or full scale (over-range). */
export function ohmsMeters(v: PhyOhmsVariant, s: OhmsSettings, index: number): { I: number; V: number; overI: boolean; overV: boolean; backI: boolean; backV: boolean } {
  const sol = ohmsSolve(v, s);
  const rand = labRandom(v.seed, `reading-${index}`);
  const I = sol.ammeter * (1 + v.ammeterGain) * (1 + labBetween(rand, -0.002, 0.002, 4));
  const V = sol.voltmeter * (1 + v.voltmeterGain) * (1 + labBetween(rand, -0.002, 0.002, 4));
  const clampI = Math.max(0, Math.min(OHMS_AMMETER_FSD * 1.04, I));
  const clampV = Math.max(0, Math.min(OHMS_VOLTMETER_FSD * 1.04, V));
  return { I: roundDp(clampI, 4), V: roundDp(clampV, 4), overI: I > OHMS_AMMETER_FSD * 1.04, overV: V > OHMS_VOLTMETER_FSD * 1.04, backI: I < -0.005, backV: V < -0.02 };
}

/** How the circuit is wired (judged by solving it, so any layout that works counts). */
export function ohmsCheck(v: PhyOhmsVariant, s: OhmsSettings): { ammeterSeries: boolean; voltmeterAcross: boolean; polarity: boolean; rheostatSeries: boolean; keySeries: boolean; works: boolean } {
  const on = ohmsSolve(v, { ...s, key: true, heat: 0 });
  const works = on.testCurrent > 0.02;
  const ammeterSeries = works && Math.abs(Math.abs(on.ammeter) - on.testCurrent) <= 0.01 * on.testCurrent + 1e-4;
  const voltmeterAcross = works && Math.abs(Math.abs(on.voltmeter) - on.testVoltage) <= 0.01 * on.testVoltage + 1e-4;
  const polarity = ammeterSeries && voltmeterAcross && on.ammeter > 0 && on.voltmeter > 0;
  const low = ohmsSolve(v, { ...s, key: true, heat: 0, rheostat: 0.1 });
  const high = ohmsSolve(v, { ...s, key: true, heat: 0, rheostat: 0.9 });
  const rheostatSeries = works && Math.abs(on.rheostatCurrent - on.testCurrent) <= 0.01 * on.testCurrent + 1e-4 && low.testCurrent > high.testCurrent * 1.2;
  const off = ohmsSolve(v, { ...s, key: false, heat: 0 });
  const keySeries = works && off.testCurrent < 1e-3;
  return { ammeterSeries, voltmeterAcross, polarity, rheostatSeries, keySeries, works };
}

// ------------------------------------------------------------------ the student's work

/** The board at the moment the student took a reading (the meters' values are recomputed from it). */
export interface OhmsReading {
  wires: string[];
  rheostat: number;
  jockey: number;
  heat: number;
}
/** A row of the table as written: L (cm, WIRE only), I (A), V (V), V/I (Ω). */
export interface OhmsRow {
  L: string;
  I: string;
  V: string;
  R: string;
}
export type OhmsAnswerId = 'area' | 'slope' | 'result';
export interface PhyOhmsState {
  v: 1;
  task: OhmsTask | null;
  wires: string[];
  key: boolean;
  rheostat: number;
  jockey: number;
  heat: number;
  readings: OhmsReading[];
  table: OhmsRow[];
  line: PhyGraphLine | null;
  answers: Record<OhmsAnswerId, PhyAnswer>;
  written: { conclusion: string; precautions: string };
  log: { t: number; a: string }[];
}

export function emptyPhyOhmsState(): PhyOhmsState {
  const blank = () => ({ value: '', unit: '' });
  return { v: 1, task: null, wires: [], key: false, rheostat: 1, jockey: 50, heat: 0, readings: [], table: [], line: null, answers: { area: blank(), slope: blank(), result: blank() }, written: { conclusion: '', precautions: '' }, log: [] };
}

/** The reading's full settings. */
export const ohmsReadingSettings = (task: OhmsTask, r: OhmsReading): OhmsSettings => ({ task, wires: r.wires, key: true, rheostat: r.rheostat, jockey: r.jockey, heat: r.heat });

const short = z.string().max(40);
const wire = z.string().max(24).regex(/^[a-z0-9+-]+\|[a-z0-9+-]+$/);
export const phyOhmsStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(OHMS_TASKS).nullable(),
  wires: z.array(wire).max(24),
  key: z.boolean(),
  rheostat: z.number().min(0).max(1),
  jockey: z.number().min(0).max(100),
  heat: z.number().int().min(0).max(100),
  readings: z.array(z.object({ wires: z.array(wire).max(24), rheostat: z.number().min(0).max(1), jockey: z.number().min(0).max(100), heat: z.number().int().min(0).max(100) })).max(14),
  table: z.array(z.object({ L: short, I: short, V: short, R: short })).max(14),
  line: phyGraphLineSchema.nullable(),
  answers: z.object({ area: phyAnswerSchema, slope: phyAnswerSchema, result: phyAnswerSchema }),
  written: z.object({ conclusion: z.string().max(1000), precautions: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<PhyOhmsState>;

export const PHY_OHMS_LAW: SimulatorSpec = {
  id: 'phy-ohms-law',
  subject: 'Physics',
  title: "Ohm's law and resistivity",
  topicNames: ['Potential difference and electric current', 'Resistivity and conductivity', "Ohm's law", 'Electric circuit'],
  minutes: 45,
  rubric: [
    { id: 'circuit', label: 'Circuit', marks: 4, how: 'AUTO', guide: 'Ammeter in series with the resistor/wire (1); voltmeter in parallel across the resistor/wire only (1); both meters with + towards the positive of the battery (1); rheostat and key in series in the circuit (1).' },
    { id: 'procedure', label: 'Procedure', marks: 3, how: 'AUTO', guide: 'At least five readings at different rheostat settings (Ohm’s law) or different lengths (wire) (1); readings spread over a good range (current range at least 0.15 A, or lengths over at least 50 cm) (1); the key opened between readings to avoid heating (1).' },
    { id: 'readings', label: 'Table of readings', marks: 4, how: 'AUTO', guide: 'Meter readings that match the meters (ammeter ±0.01 A, voltmeter ±0.05 V; lengths ±0.2 cm) (2); recorded to 2 decimal places (1); V/I worked out correctly (1).' },
    { id: 'graph', label: 'Graph', marks: 2, how: 'AUTO', guide: 'V against I (or R against L) plotted with a straight line drawn across the points (1); the line is a good best fit (slope within 6 % of the points’ best fit) (1).' },
    { id: 'calculations', label: 'Calculations', marks: 4, how: 'AUTO', guide: 'Ohm’s law: slope from your own data or line (2), R stated from the slope (1), R within 4 % of the true resistance (1). Wire: A = πd²/4 in m² (1), slope from your own data (1), ρ = slope × A from your values (1), ρ within 5 % of the true resistivity (1).' },
    { id: 'units', label: 'Units', marks: 1, how: 'AUTO', guide: 'Every answer with its unit: Ω for the slope and R; m² for A, Ω m⁻¹ (or Ω cm⁻¹) for the slope and Ω m for ρ.' },
    { id: 'conclusion', label: 'Conclusion', marks: 1, how: 'AI', guide: 'Ohm’s law: V is directly proportional to I (straight line through the origin), so the resistor obeys Ohm’s law. Wire: R is directly proportional to L (straight line through the origin).' },
    { id: 'precautions', label: 'Precautions', marks: 1, how: 'AI', guide: 'Two correct precautions (half a mark each), e.g. open the key between readings to avoid heating; tight/clean connections; ammeter in series and voltmeter in parallel with + to +; avoid parallax when reading the meters; check/correct zero errors; measure the diameter at several points (wire); avoid sliding the jockey along the wire.' },
  ],
};
