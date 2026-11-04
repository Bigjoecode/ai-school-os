import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { phyAnswerSchema, phyGraphLineSchema, type PhyAnswer, type PhyGraphLine } from './phy-common';
import { labBetween, labRandom } from './seeded';

/**
 * phy-magnetism: magnetic fields, the electromagnet, electromagnetic
 * induction and the junction diode. Four tasks, each one WAEC practical
 * (picked from the lesson):
 *  - FIELD (plotting field lines and neutral points): a sheet of paper on the
 *    drawing board, its edges along the magnetic meridian (found first with
 *    the compass alone), a bar magnet in the middle, N pole pointing north
 *    (later reversed). A small plotting compass is stepped dot to dot from
 *    the N pole round to the S pole; where its needle rests in any direction
 *    the magnet's field cancels the Earth's horizontal field — the neutral
 *    points, on the east–west line (N pointing north) or on the axis (N
 *    pointing south). Two magnets (like or unlike poles facing) can be
 *    explored too.
 *  - ELECTROMAGNET (its strength): an iron-nail core wound with 30 (then 60)
 *    turns, in series with the cells, a key, a rheostat and an ammeter. The
 *    number of steel paper clips it lifts against the current; core vs no core.
 *  - INDUCTION: a coil of 200 or 600 turns joined to a centre-zero
 *    galvanometer; a bar magnet pushed in, held still and pulled out, slowly
 *    and quickly, N or S pole first, one or two magnets. The size and the
 *    direction of each deflection (Faraday's and Lenz's laws).
 *  - DIODE (I–V characteristic): a silicon diode with a 100 Ω protective
 *    resistor, a potentiometer across three cells, a milliammeter and a
 *    voltmeter across the diode; forward bias in small steps through the
 *    knee, then reverse bias. I against V; the knee (turn-on) voltage; the
 *    dynamic and static resistance.
 *
 * Physics: the bar magnet as two poles (inverse-square fields) plus a uniform
 * Earth field of 1 unit (northwards on the paper) and, when they are left on
 * the bench, a bunch of steel keys (a small induced dipole); a misaligned
 * paper turns the magnet off the meridian. The electromagnet's pull
 * saturates: clips ≈ A tanh(N I μ / NIs) with a seeded chain scatter; the
 * coil warms if the key is left closed. Induction: the peak e.m.f. ∝ N × the
 * flux change × the speed (the hand varies), through the coil's resistance
 * and the galvanometer's; Lenz's law sets the sign. The diode: Shockley's
 * equation with a series resistance, its p.d. falling 2 mV per kelvin as it
 * warms; the potentiometer as a Thévenin source. Units in the state: cm, A,
 * mA, V, divisions — the instruments' own.
 */

export const MAG_TASKS = ['FIELD', 'ELECTROMAGNET', 'INDUCTION', 'DIODE'] as const;
export type MagTask = (typeof MAG_TASKS)[number];

const gauss = (r: () => number) => {
  const u = Math.max(1e-9, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
};
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const DEG = Math.PI / 180;
type P2 = { x: number; y: number };

// ------------------------------------------------------------------ FIELD

/** The sheet's half-width (east–west) and half-height (north–south), cm; origin at the magnet's centre, x east, y north. */
export const FIELD_PAPER = { w: 21, h: 16 };
/** The bar magnet (cm). */
export const FIELD_MAGNET = { len: 10, w: 1.6 };
/** The plotting compasses' needle lengths (cm). */
export const FIELD_COMPASS = { small: 1.4, large: 3.0 } as const;
export type FieldCompass = keyof typeof FIELD_COMPASS;
/** Where the field lines start round the N end: (cm along the magnet from its centre, cm across it, + to its right). */
export const FIELD_STARTS: [number, number][] = [
  [5.5, -0.3],
  [5.5, 0.3],
  [4.6, -1.1],
  [4.6, 1.1],
  [3.7, -1.1],
  [3.7, 1.1],
  [3.1, -1.1],
  [3.1, 1.1],
  [2.4, -1.1],
  [2.4, 1.1],
];
/** The steel keys and the phone left on the bench beside the paper (cm). */
export const FIELD_KEYS: P2 = { x: 13, y: -8 };
/** Below this resultant (units of the Earth's horizontal field) the needle rests in any direction. */
export const FIELD_LOOSE = 0.1;
/** Two magnets: their centres sit this far either side of the middle, along the east–west line (cm). */
export const FIELD_PAIR_X = 8;
export const FIELD_MAX_DOTS = 70;
export type FieldFacing = 'north' | 'south';
export type FieldArr = 'one' | 'like' | 'unlike';

// ------------------------------------------------------------------ ELECTROMAGNET

export type EmCore = 'iron' | 'steel' | 'none';
/** The task card's currents (A) and turns. */
export const EM_CARD = [0.5, 1.0, 1.5, 2.0];
export const EM_TURNS = [30, 60];
/** The ammeter (A): full scale, divisions. */
export const EM_AMMETER = { fsd: 3, minor: 0.1, major: 0.5 };
/** The rheostat's full resistance (Ω). */
export const EM_RHEO = 15;
export const EM_CLIPS = 30;

// ------------------------------------------------------------------ INDUCTION

export const IND_DIVS = 30;
export const IND_COILS = [200, 600] as const;
export type IndCoil = (typeof IND_COILS)[number];
export type IndKind = 'in' | 'still' | 'out';
/** The Faraday's-law example on the card: N turns (ΔΦ and Δt are seeded). */
export const IND_CARD_N = 200;

// ------------------------------------------------------------------ DIODE

/** The protective resistor's nominal value (Ω); the milliammeter (mA) and the voltmeter's two ranges (V). */
export const DIODE_R = 100;
export const DIODE_MA = { fsd: 50, minor: 1, major: 10 };
export const DIODE_V: Record<1 | 10, { fsd: number; minor: number; major: number }> = { 1: { fsd: 1, minor: 0.02, major: 0.2 }, 10: { fsd: 10, minor: 0.2, major: 2 } };
/** The card's forward p.d.s (V) and reverse p.d.s. */
export const DIODE_CARD_FWD = [0.1, 0.2, 0.3, 0.4, 0.5, 0.55, 0.6, 0.65, 0.7, 0.72];
export const DIODE_CARD_REV = [1, 2, 3, 4];
/** Above this current (A) the diode overheats and fails open. */
export const DIODE_BURN = 0.2;
const VT = 0.02585;

export interface PhyMagnetismVariant {
  seed: number;
  // FIELD
  /** Pole strength (Earth-field units × cm²) and the distance between the poles (cm). */
  Q: number;
  lm: number;
  /** The angle (°) the magnet sits off the meridian when the paper was not lined up first. */
  misalign: number;
  /** The keys' induced dipole (Earth units × cm³). */
  keysP: number;
  /** The needle's stickiness when the compass is not tapped (° standard deviation). */
  stick: number;
  // ELECTROMAGNET
  emE: number;
  emR: number;
  /** clips ≈ A tanh(N I μ / NIs); μ of a steel core relative to soft iron; the steel's retained fraction. */
  clipA: number;
  clipNIs: number;
  steelMu: number;
  // INDUCTION
  /** Peak deflection (divisions) for the 200-turn coil, one magnet, a slow push; fast ÷ slow; two magnets ÷ one; the wiring's sign. */
  indK: number;
  indFast: number;
  indTwo: number;
  indSign: 1 | -1;
  /** The card's flux change (Wb) and its time (s). */
  cardPhi: number;
  cardDt: number;
  // DIODE
  dE: number;
  dRp: number;
  dN: number;
  dIs: number;
  dRs: number;
}

/** The equatorial neutral distance (cm) for pole strength Q and pole separation lm (N pointing north, no disturbance). */
const equatorialD = (Q: number, lm: number) => {
  let d = 8;
  for (let i = 0; i < 60; i++) d = Math.sqrt(Math.max(0.1, (Q * lm) ** (2 / 3) - (lm * lm) / 4));
  return d;
};

export function phyMagnetismVariant(seed: number): PhyMagnetismVariant {
  const r = labRandom(seed, 'phy-magnetism');
  const lm = labBetween(r, 8.2, 8.8, 2);
  const dE0 = labBetween(r, 7.0, 8.6, 2);
  const Q = Number((((dE0 * dE0 + (lm * lm) / 4) ** 1.5) / lm).toFixed(2));
  const misalign = (r() < 0.5 ? -1 : 1) * labBetween(r, 7, 12, 1);
  const keysP = labBetween(r, 45, 75, 1);
  const stick = labBetween(r, 4, 6.5, 2);
  const emE = labBetween(r, 2.9, 3.1, 3);
  const emR = labBetween(r, 0.3, 0.5, 3);
  const clipA = labBetween(r, 14, 18, 2);
  const clipNIs = labBetween(r, 72, 95, 1);
  const steelMu = labBetween(r, 0.5, 0.65, 3);
  const indK = labBetween(r, 4.6, 6.0, 2);
  const indFast = labBetween(r, 2.2, 2.6, 2);
  const indTwo = labBetween(r, 1.75, 1.92, 2);
  const indSign = r() < 0.5 ? 1 : -1;
  const cardPhi = labBetween(r, 2.0, 4.0, 1) * 1e-4;
  const cardDt = labBetween(r, 0.08, 0.2, 2);
  const dE = labBetween(r, 4.4, 4.6, 3);
  const dRp = labBetween(r, 98, 102, 1);
  const dN = labBetween(r, 1.7, 1.95, 3);
  const dRs = labBetween(r, 0.8, 1.8, 2);
  const Iref = labBetween(r, 0.008, 0.014, 4);
  const dIs = Iref / Math.exp((0.65 - Iref * dRs) / (dN * VT));
  return { seed, Q, lm, misalign, keysP, stick, emE, emR, clipA, clipNIs, steelMu, indK, indFast, indTwo, indSign, cardPhi, cardDt, dE, dRp, dN, dIs, dRs };
}

// ------------------------------------------------------------------ FIELD physics

export interface FieldLine {
  /** Which start point round the N end (index into FIELD_STARTS). */
  start: number;
  /** Dots marked after the first. */
  dots: number;
  /** The compass was tapped before each dot. */
  tapped: boolean;
  compass: FieldCompass;
}
export interface FieldSheet {
  facing: FieldFacing;
  arr: FieldArr;
  /** The paper was lined up with the meridian before the magnet went on. */
  aligned: boolean;
  /** Steel (keys, phone) still on the bench beside the board. */
  steel: boolean;
  lines: FieldLine[];
  /** Neutral points marked (cm). */
  neutrals: P2[];
  /** Arrows drawn on the lines (N to S). */
  arrows: boolean;
  /** Finished: the magnet was turned or changed; the next mark starts a fresh sheet. */
  closed: boolean;
}
export type FieldCfg = Pick<FieldSheet, 'facing' | 'arr' | 'aligned' | 'steel'>;
export interface FieldMagnet {
  c: P2;
  /** Unit vector from S to N. */
  u: P2;
}
const rot = (p: P2, a: number): P2 => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });
/** The magnets on the sheet: one in the middle along the meridian (N north or south), or two on the east–west line with like or unlike poles facing. A paper not lined up turns everything by the misalignment. */
export function fieldMagnets(v: PhyMagnetismVariant, cfg: FieldCfg): FieldMagnet[] {
  const a = cfg.aligned ? 0 : -v.misalign * DEG;
  const one = (c: P2, u: P2): FieldMagnet => ({ c: rot(c, a), u: rot(u, a) });
  if (cfg.arr === 'like') return [one({ x: -FIELD_PAIR_X, y: 0 }, { x: 1, y: 0 }), one({ x: FIELD_PAIR_X, y: 0 }, { x: -1, y: 0 })];
  if (cfg.arr === 'unlike') return [one({ x: -FIELD_PAIR_X, y: 0 }, { x: 1, y: 0 }), one({ x: FIELD_PAIR_X, y: 0 }, { x: 1, y: 0 })];
  return [one({ x: 0, y: 0 }, { x: 0, y: cfg.facing === 'north' ? 1 : -1 })];
}
/** The resultant horizontal field at p (units of the Earth's horizontal field; the Earth's points north, +y). */
export function fieldAt(v: PhyMagnetismVariant, cfg: FieldCfg, p: P2): P2 {
  let bx = 0;
  let by = 1;
  for (const m of fieldMagnets(v, cfg)) {
    for (const [q, s] of [
      [v.Q, 1],
      [-v.Q, -1],
    ] as const) {
      const px = m.c.x + (s * m.u.x * v.lm) / 2;
      const py = m.c.y + (s * m.u.y * v.lm) / 2;
      const dx = p.x - px;
      const dy = p.y - py;
      const r2 = dx * dx + dy * dy + 0.05;
      const r3 = r2 * Math.sqrt(r2);
      bx += (q * dx) / r3;
      by += (q * dy) / r3;
    }
  }
  if (cfg.steel) {
    const dx = p.x - FIELD_KEYS.x;
    const dy = p.y - FIELD_KEYS.y;
    const r2 = dx * dx + dy * dy + 0.5;
    const r = Math.sqrt(r2);
    const ux = dx / r;
    const uy = dy / r;
    const k = v.keysP / (r2 * r);
    bx += k * 3 * uy * ux;
    by += k * (3 * uy * uy - 1);
  }
  return { x: bx, y: by };
}
const mag = (b: P2) => Math.hypot(b.x, b.y);
/** True when p is under a magnet (its outline, a little enlarged). */
export function underMagnet(v: PhyMagnetismVariant, cfg: FieldCfg, p: P2, pad = 0.3): boolean {
  return fieldMagnets(v, cfg).some((m) => {
    const dx = p.x - m.c.x;
    const dy = p.y - m.c.y;
    const along = dx * m.u.x + dy * m.u.y;
    const across = -dx * m.u.y + dy * m.u.x;
    return Math.abs(along) <= FIELD_MAGNET.len / 2 + pad && Math.abs(across) <= FIELD_MAGNET.w / 2 + pad;
  });
}
export const onFieldPaper = (p: P2) => Math.abs(p.x) <= FIELD_PAPER.w - 0.3 && Math.abs(p.y) <= FIELD_PAPER.h - 0.3;
/** The neutral points near the guesses (Newton's method on the resultant field). */
function solveNeutral(v: PhyMagnetismVariant, cfg: FieldCfg, guess: P2): P2 | null {
  let p = { ...guess };
  for (let i = 0; i < 60; i++) {
    const b = fieldAt(v, cfg, p);
    if (mag(b) < 1e-9) break;
    const h = 1e-3;
    const bx = fieldAt(v, cfg, { x: p.x + h, y: p.y });
    const byy = fieldAt(v, cfg, { x: p.x, y: p.y + h });
    const j11 = (bx.x - b.x) / h;
    const j21 = (bx.y - b.y) / h;
    const j12 = (byy.x - b.x) / h;
    const j22 = (byy.y - b.y) / h;
    const det = j11 * j22 - j12 * j21;
    if (Math.abs(det) < 1e-12) return null;
    let dx = (j22 * b.x - j12 * b.y) / det;
    let dy = (-j21 * b.x + j11 * b.y) / det;
    const step = Math.hypot(dx, dy);
    if (step > 2) (dx *= 2 / step), (dy *= 2 / step);
    p = { x: p.x - dx, y: p.y - dy };
    if (step < 1e-7) break;
  }
  return mag(fieldAt(v, cfg, p)) < 1e-4 && onFieldPaper(p) ? p : null;
}
/** The neutral points on a sheet (cm): two for one magnet; for two magnets, the one between them if any. */
export function fieldNeutrals(v: PhyMagnetismVariant, cfg: FieldCfg): P2[] {
  const a = cfg.aligned ? 0 : -v.misalign * DEG;
  const dE = equatorialD(v.Q, v.lm);
  const guesses: P2[] = cfg.arr !== 'one' ? [{ x: 0, y: 0 }, { x: 0, y: 4 }, { x: 0, y: -4 }] : cfg.facing === 'north' ? [{ x: dE, y: 0 }, { x: -dE, y: 0 }] : [{ x: 0, y: 1.26 * dE }, { x: 0, y: -1.26 * dE }];
  const out: P2[] = [];
  for (const g of guesses) {
    const p = solveNeutral(v, cfg, rot(g, a));
    if (p && !underMagnet(v, cfg, p, 0) && !out.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.5)) out.push(p);
  }
  return out;
}
/** The undisturbed neutral distances (cm) from the magnet's centre: on the east–west line (N north) and on the axis (N south). */
export function fieldTrueDistances(v: PhyMagnetismVariant): { eq: number; ax: number } {
  const n = fieldNeutrals(v, { facing: 'north', arr: 'one', aligned: true, steel: false });
  const s = fieldNeutrals(v, { facing: 'south', arr: 'one', aligned: true, steel: false });
  const d = (ps: P2[]) => ps.reduce((t, p) => t + Math.hypot(p.x, p.y), 0) / (ps.length || 1);
  return { eq: d(n), ax: d(s) };
}
/** The geometric N and S ends of a magnet. */
export const magnetEnds = (m: FieldMagnet) => ({ n: { x: m.c.x + (m.u.x * FIELD_MAGNET.len) / 2, y: m.c.y + (m.u.y * FIELD_MAGNET.len) / 2 }, s: { x: m.c.x - (m.u.x * FIELD_MAGNET.len) / 2, y: m.c.y - (m.u.y * FIELD_MAGNET.len) / 2 } });
/** Where field line `start` begins (cm): just off the first magnet's N end. */
export function fieldStart(v: PhyMagnetismVariant, cfg: FieldCfg, start: number): P2 {
  const m = fieldMagnets(v, cfg)[0]!;
  const [a, c] = FIELD_STARTS[clamp(start, 0, FIELD_STARTS.length - 1)]!;
  return { x: m.c.x + m.u.x * a + m.u.y * c, y: m.c.y + m.u.y * a - m.u.x * c };
}
export interface FieldTrace {
  /** The pencil dots (cm), the first at the start. */
  dots: P2[];
  /** The line has ended: at an S pole, off the paper or at a neutral point (where the needle is loose). */
  ended: boolean;
  reachedS: boolean;
}
/**
 * The dots of field line `k` on sheet `si` as the student marks them: the
 * compass's tail on the last dot, a dot at the needle's head; the needle
 * lines up with the field at its middle, give or take its stickiness (much
 * less when tapped). `want` dots after the first (null: to the end).
 */
export function fieldTrace(v: PhyMagnetismVariant, cfg: FieldCfg, si: number, k: number, line: FieldLine, want: number | null = null): FieldTrace {
  const r = labRandom(v.seed, `line-${si}-${k}`);
  const len = FIELD_COMPASS[line.compass];
  let p = fieldStart(v, cfg, line.start);
  const dots = [p];
  const n = want === null ? FIELD_MAX_DOTS : Math.min(FIELD_MAX_DOTS, want);
  const sEnds = fieldMagnets(v, cfg).map((m) => magnetEnds(m).s);
  for (let i = 0; i < n; i++) {
    const b1 = fieldAt(v, cfg, p);
    if (mag(b1) < FIELD_LOOSE) return { dots, ended: true, reachedS: false };
    const mid = { x: p.x + (b1.x / mag(b1)) * (len / 2), y: p.y + (b1.y / mag(b1)) * (len / 2) };
    const b2 = fieldAt(v, cfg, mid);
    const sd = line.tapped ? 0.6 : v.stick;
    const err = clamp(gauss(r) * sd, -2.5 * sd, 2.5 * sd) * DEG;
    const u = rot({ x: b2.x / mag(b2), y: b2.y / mag(b2) }, err);
    p = { x: p.x + u.x * len, y: p.y + u.y * len };
    dots.push(p);
    if (sEnds.some((s) => Math.hypot(p.x - s.x, p.y - s.y) < Math.max(0.9, len * 0.6)) || underMagnet(v, cfg, p, 0.1)) return { dots, ended: true, reachedS: true };
    if (!onFieldPaper(p)) return { dots, ended: true, reachedS: false };
  }
  return { dots, ended: want === null || dots.length - 1 >= FIELD_MAX_DOTS, reachedS: false };
}
/** What the compass needle does at p: its direction (radians from north, clockwise) or loose. */
export function compassAt(v: PhyMagnetismVariant, cfg: FieldCfg, p: P2): { loose: boolean; heading: number; strength: number } {
  const b = fieldAt(v, cfg, p);
  const s = mag(b);
  return { loose: s < FIELD_LOOSE, heading: Math.atan2(b.x, b.y), strength: s };
}
export const sheetCfg = (s: FieldSheet): FieldCfg => ({ facing: s.facing, arr: s.arr, aligned: s.aligned, steel: s.steel });

// ------------------------------------------------------------------ ELECTROMAGNET physics

export interface EmLift {
  turns: number;
  mixed: boolean;
  core: EmCore;
  rheo: number;
  /** Lifts since the key was closed (0: the first). */
  heat: number;
}
/** The coil's turns that count: some wound the other way cancel as many. */
export const emEffTurns = (turns: number, mixed: boolean) => (mixed ? Math.round(turns / 3) : turns);
/** The current (A) with the key closed. */
export function emCurrent(v: PhyMagnetismVariant, s: Pick<EmLift, 'turns' | 'rheo' | 'heat'>): number {
  const R = v.emR + 0.25 + 0.006 * s.turns + 0.05 + EM_RHEO * clamp(s.rheo, 0, 1);
  return v.emE / (R * (1 + 0.04 * Math.max(0, s.heat)));
}
/** The rheostat setting (0…1) for a current I (A) with the key just closed. */
export const emRheoFor = (v: PhyMagnetismVariant, turns: number, I: number) => clamp((v.emE / Math.max(1e-6, I) - (v.emR + 0.25 + 0.006 * turns + 0.05)) / EM_RHEO, 0, 1);
const MU: Record<EmCore, (v: PhyMagnetismVariant) => number> = { iron: () => 1, steel: (v) => v.steelMu, none: () => 0.03 };
/** The clips the core would hold on average at a current (no scatter). */
export const emClipsMean = (v: PhyMagnetismVariant, turns: number, mixed: boolean, core: EmCore, I: number) => v.clipA * Math.tanh((emEffTurns(turns, mixed) * I * MU[core](v)) / v.clipNIs);
/** Lift k: the ammeter (A) and the clips held. */
export function emLift(v: PhyMagnetismVariant, k: number, l: EmLift): { I: number; clips: number; left: number } {
  const r = labRandom(v.seed, `lift-${k}`);
  const I = emCurrent(v, l);
  const f = emClipsMean(v, l.turns, l.mixed, l.core, I);
  const clips = clamp(Math.round(f + clamp(gauss(r) * 0.42, -1.1, 1.1)), 0, EM_CLIPS);
  const left = l.core === 'steel' ? Math.round(clips * 0.45) : l.core === 'iron' && clips > 8 && r() < 0.35 ? 1 : 0;
  return { I, clips, left };
}
/** Setting identity of a lift (a new table row each time it changes). */
export const emSettingKey = (l: Pick<EmLift, 'turns' | 'mixed' | 'core' | 'rheo'>) => `${l.turns}|${l.mixed ? 1 : 0}|${l.core}|${l.rheo.toFixed(4)}`;

// ------------------------------------------------------------------ INDUCTION physics

export interface IndMove {
  kind: IndKind;
  coil: IndCoil;
  pole: 'N' | 'S';
  magnets: 1 | 2;
  speed: 'slow' | 'fast';
  /** Moved along the coil's axis (else at an angle, from the side). */
  axis: boolean;
  /** The galvanometer stood well away from the magnet. */
  galvoFar: boolean;
}
const COIL_R: Record<IndCoil, number> = { 200: 4, 600: 12 };
const GALVO_R = 40;
/** The peak deflection (divisions, + to the right) of move k, before the stop. */
export function indDeflection(v: PhyMagnetismVariant, k: number, m: IndMove): number {
  const r = labRandom(v.seed, `move-${k}`);
  const near = m.galvoFar ? 0 : (m.pole === 'N' ? 1 : -1) * v.indSign * 2.5 * (m.magnets === 2 ? 1.6 : 1);
  if (m.kind === 'still') return near;
  const hand = 1 + clamp(gauss(r) * 0.08, -0.2, 0.2);
  const speed = m.speed === 'fast' ? v.indFast : 1;
  const two = m.magnets === 2 ? v.indTwo : 1;
  const turns = (m.coil / 200) * ((GALVO_R + COIL_R[200]) / (GALVO_R + COIL_R[m.coil]));
  const side = m.axis ? 1 : 0.55 * (1 + clamp(gauss(r) * 0.25, -0.5, 0.5));
  const over = m.speed === 'fast' ? 1.04 : 1;
  const sign = (m.pole === 'N' ? 1 : -1) * (m.kind === 'in' ? 1 : -1) * v.indSign;
  return sign * v.indK * hand * speed * two * turns * side * over + near;
}
/** What the student can read: the swing, hard against the stop beyond ±IND_DIVS. */
export const indShown = (d: number) => clamp(d, -IND_DIVS * 1.06, IND_DIVS * 1.06);
/** The undisturbed mean deflection (no hand scatter) for a move. */
export function indIdeal(v: PhyMagnetismVariant, m: Omit<IndMove, 'kind' | 'axis' | 'galvoFar'>): number {
  const turns = (m.coil / 200) * ((GALVO_R + COIL_R[200]) / (GALVO_R + COIL_R[m.coil]));
  return v.indK * (m.speed === 'fast' ? v.indFast * 1.04 : 1) * (m.magnets === 2 ? v.indTwo : 1) * turns;
}
/** The card's Faraday's-law example: E = NΔΦ/Δt (V). */
export const indCardEmf = (v: PhyMagnetismVariant) => (IND_CARD_N * v.cardPhi) / v.cardDt;

// ------------------------------------------------------------------ DIODE physics

export interface DiodeCircuit {
  bias: 'fwd' | 'rev';
  pot: number;
  resistor: boolean;
  vm: 'diode' | 'both';
  /** Readings taken since the key was closed (the diode warms). */
  heat: number;
}
export interface DiodeRead extends DiodeCircuit {
  range: 1 | 10;
  /** The diode had burnt out (open circuit). */
  open: boolean;
}
/** The diode's p.d. (V) at a forward current I (A) and a rise in temperature dT (K). */
export const diodeVd = (v: PhyMagnetismVariant, I: number, dT = 0) => v.dN * VT * Math.log(Math.max(0, I) / v.dIs + 1) + I * v.dRs - 0.002 * dT;
/** The diode's slope resistance dV/dI (Ω) at I (A). */
export const diodeRdyn = (v: PhyMagnetismVariant, I: number) => (v.dN * VT) / (Math.max(0, I) + v.dIs) + v.dRs;
/** The potentiometer as a source: open-circuit p.d. and resistance. */
const POT_R = 50;
const thevenin = (v: PhyMagnetismVariant, pot: number) => ({ Vth: v.dE * clamp(pot, 0, 1), Rth: POT_R * clamp(pot, 0, 1) * (1 - clamp(pot, 0, 1)) + 0.6 * clamp(pot, 0, 1) });
/**
 * The circuit: the current (A; negative in reverse) and the p.d. across the
 * diode (V, magnitude), and what the voltmeter shows (V). A burnt diode is
 * open: no current, the whole p.d. across it.
 */
export function diodeSolve(v: PhyMagnetismVariant, c: DiodeCircuit, burnt = false): { I: number; Vd: number; Vm: number } {
  const { Vth, Rth } = thevenin(v, c.pot);
  const R = Rth + 2.5 + (c.resistor ? v.dRp : 0);
  const dT = 3 * Math.max(0, c.heat);
  if (burnt || Vth <= 0) return { I: 0, Vd: Vth, Vm: Vth };
  if (c.bias === 'rev') {
    const Ir = v.dIs * 2 + Vth / 5e7;
    return { I: -Ir, Vd: Vth - Ir * R, Vm: Vth - (c.vm === 'diode' ? Ir * R : Ir * 2.5) };
  }
  let lo = 0;
  let hi = Vth / R;
  for (let i = 0; i < 80; i++) {
    const m = (lo + hi) / 2;
    if (Vth - m * R - diodeVd(v, m, dT) > 0) lo = m;
    else hi = m;
  }
  const I = (lo + hi) / 2;
  const Vd = diodeVd(v, I, dT);
  return { I, Vd, Vm: c.vm === 'diode' ? Vd : Vd + I * (c.resistor ? v.dRp : 0) };
}
/** Reading k as the meters show it: voltmeter (V, magnitude; null if off the range) and milliammeter (mA, signed; null if off the scale). */
export function diodeReading(v: PhyMagnetismVariant, r: DiodeRead): { V: number | null; mA: number | null; Vtrue: number; mAtrue: number } {
  const x = diodeSolve(v, r, r.open);
  const mA = x.I * 1000;
  return { V: x.Vm > DIODE_V[r.range].fsd * 1.02 ? null : x.Vm, mA: Math.abs(mA) > DIODE_MA.fsd * 1.04 ? null : mA, Vtrue: x.Vm, mAtrue: mA };
}
/** The pot setting (0…1) that puts `target` volts across the diode (forward, with the resistor), or on the voltmeter in general. */
export function diodePotFor(v: PhyMagnetismVariant, c: Omit<DiodeCircuit, 'pot'>, target: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 50; i++) {
    const m = (lo + hi) / 2;
    if (diodeSolve(v, { ...c, pot: m }).Vm < target) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

// ------------------------------------------------------------------ the student's work

export interface MagRow {
  /** ELECTROMAGNET: the setting; INDUCTION: the move; DIODE: the reading. */
  key: number;
  c: Record<string, string>;
}
export const MAG_COLS: Record<MagTask, string[]> = {
  FIELD: [],
  ELECTROMAGNET: ['N', 'I', 'c1', 'c2', 'c'],
  INDUCTION: ['dir', 'size'],
  DIODE: ['V', 'I'],
};
export const MAG_CELLS: Record<MagTask, string[]> = {
  FIELD: ['xe', 'yw', 'an', 'as'],
  ELECTROMAGNET: ['nc'],
  INDUCTION: [],
  DIODE: [],
};
export type MagAnswerId = 'me' | 'ma' | 'ratio' | 'slope' | 'rturns' | 'emf' | 'emf2' | 'rspeed' | 'lenz' | 'knee' | 'rdyn' | 'rstat';
export const MAG_ANSWER_IDS: MagAnswerId[] = ['me', 'ma', 'ratio', 'slope', 'rturns', 'emf', 'emf2', 'rspeed', 'lenz', 'knee', 'rdyn', 'rstat'];
export const MAG_MAX_ROWS = 20;

export interface PhyMagnetismState {
  v: 1;
  task: MagTask | null;
  // ---- FIELD
  meridian: boolean;
  steelAway: boolean;
  facing: FieldFacing;
  arr: FieldArr;
  compass: FieldCompass;
  tapEach: boolean;
  /** The plotting compass's position on the paper (cm). */
  cx: number;
  cy: number;
  sheets: FieldSheet[];
  // ---- ELECTROMAGNET
  turns: number;
  mixed: boolean;
  core: EmCore;
  rheo: number;
  /** The key (ELECTROMAGNET and DIODE) and the lifts / readings since it was closed. */
  key: boolean;
  heat: number;
  lifts: EmLift[];
  // ---- INDUCTION
  coil: IndCoil;
  pole: 'N' | 'S';
  magnets: 1 | 2;
  speed: 'slow' | 'fast';
  axis: boolean;
  galvoFar: boolean;
  /** The magnet is inside the coil. */
  magIn: boolean;
  moves: IndMove[];
  // ---- DIODE
  bias: 'fwd' | 'rev';
  resistor: boolean;
  vm: 'diode' | 'both';
  range: 1 | 10;
  pot: number;
  burnt: boolean;
  reads: DiodeRead[];
  // ---- the notebook
  rows: MagRow[];
  cells: Record<string, string>;
  line: PhyGraphLine | null;
  answers: Record<MagAnswerId, PhyAnswer>;
  written: { precautions: string };
  log: { t: number; a: string }[];
}

export function emptyPhyMagnetismState(): PhyMagnetismState {
  const answers = Object.fromEntries(MAG_ANSWER_IDS.map((id) => [id, { value: '', unit: '' }])) as Record<MagAnswerId, PhyAnswer>;
  return {
    v: 1,
    task: null,
    meridian: false,
    steelAway: false,
    facing: 'north',
    arr: 'one',
    compass: 'small',
    tapEach: false,
    cx: 0,
    cy: 9,
    sheets: [],
    turns: 30,
    mixed: false,
    core: 'iron',
    rheo: 0.5,
    key: false,
    heat: 0,
    lifts: [],
    coil: 200,
    pole: 'N',
    magnets: 1,
    speed: 'slow',
    axis: true,
    galvoFar: false,
    magIn: false,
    moves: [],
    bias: 'fwd',
    resistor: true,
    vm: 'diode',
    range: 1,
    pot: 0,
    burnt: false,
    reads: [],
    rows: [],
    cells: {},
    line: null,
    answers,
    written: { precautions: '' },
    log: [],
  };
}

const short = z.string().max(40);
const coord = z.number().min(-40).max(40);
const pt = z.object({ x: coord, y: coord });
const compassE = z.enum(['small', 'large']);
const facingE = z.enum(['north', 'south']);
const arrE = z.enum(['one', 'like', 'unlike']);
const coreE = z.enum(['iron', 'steel', 'none']);
const turnsN = z.number().int().min(0).max(120);
const unit01 = z.number().min(0).max(1);
const heatN = z.number().int().min(0).max(100);
const coilE = z.union([z.literal(200), z.literal(600)]);
const poleE = z.enum(['N', 'S']);
const magnetsE = z.union([z.literal(1), z.literal(2)]);
const speedE = z.enum(['slow', 'fast']);
const biasE = z.enum(['fwd', 'rev']);
const vmE = z.enum(['diode', 'both']);
const rangeE = z.union([z.literal(1), z.literal(10)]);
const answerShape = Object.fromEntries(MAG_ANSWER_IDS.map((id) => [id, phyAnswerSchema])) as Record<MagAnswerId, typeof phyAnswerSchema>;
const cellKey = z.string().regex(/^[a-zA-Z0-9]{1,5}$/);
export const phyMagnetismStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(MAG_TASKS).nullable(),
  meridian: z.boolean(),
  steelAway: z.boolean(),
  facing: facingE,
  arr: arrE,
  compass: compassE,
  tapEach: z.boolean(),
  cx: coord,
  cy: coord,
  sheets: z
    .array(
      z.object({
        facing: facingE,
        arr: arrE,
        aligned: z.boolean(),
        steel: z.boolean(),
        lines: z.array(z.object({ start: z.number().int().min(0).max(FIELD_STARTS.length - 1), dots: z.number().int().min(0).max(FIELD_MAX_DOTS), tapped: z.boolean(), compass: compassE })).max(16),
        neutrals: z.array(pt).max(6),
        arrows: z.boolean(),
        closed: z.boolean(),
      }),
    )
    .max(6),
  turns: turnsN,
  mixed: z.boolean(),
  core: coreE,
  rheo: unit01,
  key: z.boolean(),
  heat: heatN,
  lifts: z.array(z.object({ turns: turnsN, mixed: z.boolean(), core: coreE, rheo: unit01, heat: heatN })).max(60),
  coil: coilE,
  pole: poleE,
  magnets: magnetsE,
  speed: speedE,
  axis: z.boolean(),
  galvoFar: z.boolean(),
  magIn: z.boolean(),
  moves: z.array(z.object({ kind: z.enum(['in', 'still', 'out']), coil: coilE, pole: poleE, magnets: magnetsE, speed: speedE, axis: z.boolean(), galvoFar: z.boolean() })).max(40),
  bias: biasE,
  resistor: z.boolean(),
  vm: vmE,
  range: rangeE,
  pot: unit01,
  burnt: z.boolean(),
  reads: z.array(z.object({ bias: biasE, pot: unit01, resistor: z.boolean(), vm: vmE, range: rangeE, heat: heatN, open: z.boolean() })).max(40),
  rows: z.array(z.object({ key: z.number().int().min(0).max(60), c: z.record(cellKey, short).refine((c) => Object.keys(c).length <= 8, 'too many cells') })).max(MAG_MAX_ROWS),
  cells: z.record(cellKey, short).refine((c) => Object.keys(c).length <= 12, 'too many cells'),
  line: phyGraphLineSchema.nullable(),
  answers: z.object(answerShape),
  written: z.object({ precautions: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<PhyMagnetismState>;

export const PHY_MAGNETISM: SimulatorSpec = {
  id: 'phy-magnetism',
  subject: 'Physics',
  title: 'Magnetism, electromagnetism and the diode',
  topicNames: ['Concept of magnetic field', 'Magnetic field', 'Magnetism', 'Use of electromagnets', 'Electromagnetic induction', 'Electromagnetism', 'Electrical conduction through materials (electronics)', 'Electronics', 'Semiconductors'],
  minutes: 45,
  rubric: [
    { id: 'care', label: 'Care and technique', marks: 2, how: 'AUTO', guide: 'Field: the meridian marked with the compass alone before the magnet went on, and steel (keys, phone) cleared from the board (1); the compass tapped gently before every dot, and the small compass used (1). Electromagnet: a soft-iron core with every turn wound the same way (1); the key opened between readings (at most two lifts each time it is closed) (1). Induction: the magnet moved along the axis of the coil (1); the galvanometer kept well away from the magnet (1). Diode: the protective resistor in the circuit for every reading (1); the voltmeter across the diode alone (1).' },
    { id: 'procedure', label: 'Procedure', marks: 4, how: 'AUTO', guide: 'Field: at least four field lines plotted with the N pole pointing north (1), with arrows from N to S (1); both neutral points located (1); the magnet reversed and both neutral points located again (1). Electromagnet: at least four currents with 30 turns (1), each lift done twice (1); 60 turns at one of the same currents (1); the coil tried without its core (1). Induction: the N pole pushed in, held still and pulled out (1); a faster push too (1); the S pole and two magnets (1); the coil of more turns (1). Diode: at least eight forward readings (1) with at least three in small steps through the knee, 0.55–0.75 V (1); at least three reverse readings up to 3 V or more (1); the key opened between readings so the diode does not warm (1).' },
    { id: 'readings', label: 'Table of readings', marks: 5, how: 'AUTO', guide: 'Readings that match the instruments and the sheet: neutral points within 0.5 cm and their distances ±0.2 cm, the ammeter ±0.05 A and the clips counted exactly, each swing of the galvanometer ±0.5 division with its direction, the voltmeter ±half a division and the milliammeter ±0.5 mA (3); recorded to the instrument’s precision — 0.1 cm, 0.05 A, 0.5 division, 0.01 V, 0.5 mA (1); the derived values worked out — means, every row complete with direction and size, reverse readings written negative (1).' },
    { id: 'graph', label: 'Graph or diagram', marks: 2, how: 'AUTO', guide: 'Field: the lines run from N round to S (1); the neutral points on the right lines — the east–west line with N pointing north, the axis with N pointing south (1). Electromagnet: clips against current plotted with a line drawn (1) along the straight first part of the curve (1). Induction: your directions show Lenz’s law — reversed on pulling out and on changing the pole (1); the face of the coil an approaching N pole meets is an N pole (1). Diode: forward and reverse points plotted on the same axes (1); the tangent drawn along the steep part above the knee (1).' },
    { id: 'calculations', label: 'Results', marks: 4, how: 'AUTO', guide: 'Field: the mean distance of the equatorial neutral points within 6 % of the true value (1), of the axial ones within 6 % (1); the ratio axial ÷ equatorial from your means (1), within 8 % of the true ratio (1). Electromagnet: the initial slope (clips per ampere) from your own points (1), within 25 % of the true slope (1); the ratio for 60 and 30 turns at the same current from your own readings (1), within 35 % of the true ratio (1). Induction: E = NΔΦ/Δt from the card (1); E for twice the speed (1); the ratio fast ÷ slow from your own readings (1); the ratio 600 turns ÷ 200 turns from your own readings (1). Diode: the knee voltage where your tangent meets the V axis (1), within 0.04 V of the true value and between 0.5 and 0.75 V (1); the dynamic resistance ΔV/ΔI from your tangent (1); the static resistance V/I from one of your readings (1).' },
    { id: 'units', label: 'Units', marks: 1, how: 'AUTO', guide: 'Distances in cm and the ratio with no unit; the slope in clips per ampere (A⁻¹) and the ratio with no unit; E in V and the ratios with no unit; the knee voltage in V and the resistances in Ω.' },
    { id: 'precautions', label: 'Precautions', marks: 2, how: 'AI', guide: 'Two correct precautions (1 mark each), e.g. field: the board far from iron objects and wires; the compass tapped before marking; a small compass; dots marked carefully at the needle’s ends; the paper lined up with the meridian. Electromagnet: same-size clips; the key opened between readings; the turns wound the same way and tightly; the clips returned to the pile each time; a soft-iron core. Induction: firm connections; the magnet moved along the axis; the galvanometer kept away from the magnet; the same speed when comparing; the needle allowed to settle. Diode: the protective resistor used; small steps near the knee; the key opened between readings; the voltmeter across the diode only; the meters read at eye level.' },
  ],
};
