import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { phyAnswerSchema, phyGraphLineSchema, type PhyAnswer, type PhyGraphLine } from './phy-common';
import { labBetween, labRandom } from './seeded';

/**
 * phy-mechanics: friction, viscosity, uniform acceleration and the
 * parallelogram of forces. Four tasks, each one WAEC practical (picked from
 * the lesson):
 *  - FRICTION (coefficient of static friction): a wooden block with a hook on
 *    a smooth plank. The 0–10 N spring balance (0.1 N divisions; its zero
 *    checked first) weighs the block and its load of 100 g slotted masses (R),
 *    then pulls it horizontally, increasing the pull slowly, until it just
 *    starts to move: the reading then is the limiting friction F (afterwards,
 *    sliding, it reads the smaller kinetic friction). F against R is a
 *    straight line through the origin of slope μ. Then the plank is raised
 *    slowly until the block just slips: μ = tan θ, whatever the load.
 *  - VISCOSITY (terminal velocity): steel ball bearings of five sizes, each
 *    measured with the micrometer, released at the axis of a tall cylinder of
 *    glycerine; two rubber bands, the upper well below the surface, the lower
 *    20 cm below it; the stop-clock started and stopped as the ball passes
 *    each band (eye level with it). v = distance/time; v against r² is a
 *    straight line of slope 2(ρs − ρl)g/(9η) (Stokes's law). One ball is also
 *    timed in palm oil: η(glycerine)/η(oil) ≈ v(oil)/v(glycerine).
 *  - INCLINE (uniform acceleration): a steel ball rolls from rest down a 2 m
 *    grooved plank raised on wooden blocks, timed with a stop-clock to a
 *    stopping block at s = 0.40 … 1.60 m, three times each. s = ½at², so s
 *    against t² is a straight line through the origin of slope a/2.
 *  - FORCES (parallelogram of forces): three threads tied at a knot, two over
 *    pulleys on a vertical drawing board carrying P and Q, the third carrying
 *    W. The knot settles (tapping the board frees the pulleys); pencil dots
 *    under each thread give its line; P and Q are drawn to a scale along their
 *    lines, the parallelogram completed, and the diagonal R measured and
 *    compared with W (equal and opposite).
 *
 * Physics: static and kinetic friction with a seeded scatter from pull to
 * pull; a jerk overshoots; a dusty plank lowers μ. Drag on a sphere by the
 * Schiller–Naumann law (Stokes's law at low Reynolds number) with Faxén's
 * wall factor for the cylinder, the extra drag near a wall, and an entry zone
 * (the air the ball drags in) just below the surface. A ball rolling in a
 * groove: a = g sin θ/(1 + k) less rolling resistance. Equilibrium of three
 * forces with friction in the pulleys. The stop-clock: the student's seeded
 * reaction at each press; it adds on if not reset. Units in the state: cm,
 * the instruments' own.
 */

export const MECH_TASKS = ['FRICTION', 'VISCOSITY', 'INCLINE', 'FORCES'] as const;
export type MechTask = (typeof MECH_TASKS)[number];
/** g used by the physics (m s⁻²). */
export const MECH_G = 9.81;

const gauss = (r: () => number) => {
  const u = Math.max(1e-9, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
};
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

// ------------------------------------------------------------------ FRICTION

/** 100 g slotted masses there are; the loads on the task card (number of masses). */
export const FRICTION_SLOTS = 6;
export const FRICTION_CARD = [0, 1, 2, 3, 4, 5];
export const FRICTION_SB_MAX = 10;

// ------------------------------------------------------------------ VISCOSITY

/** Nominal ball diameters (mm). */
export const VISC_BALLS = [2.0, 2.5, 3.0, 3.5, 4.0];
/** The ball the card says to time in palm oil (index into VISC_BALLS). */
export const VISC_OIL_BALL = 2;
/** The steel's density and the card's liquid densities (kg m⁻³) as printed. */
export const VISC_RHO_STEEL = 7800;
export const VISC_RHO_GLY = 1260;
export const VISC_RHO_OIL = 910;
/** Band limits (cm below the surface) and the card's spacing. */
export const VISC_BAND_MIN = 1;
export const VISC_BAND_MAX = 34;
export const VISC_SPACING = 20;
/** The upper band must be at least this deep (cm) for the ball to be at terminal velocity. */
export const VISC_TOP_OK = 6;
export type ViscLiquid = 'glycerine' | 'oil';

// ------------------------------------------------------------------ INCLINE

/** The plank's length (cm) and the marks on the card (cm from the start line). */
export const INCLINE_LEN = 200;
export const INCLINE_CARD = [40, 80, 120, 160];
export const INCLINE_STOP_MIN = 20;
export const INCLINE_STOP_MAX = 185;
export const INCLINE_BLOCKS_MAX = 4;

// ------------------------------------------------------------------ FORCES

/** A hanger is 50 g; up to 9 slotted 50 g masses go on it. g on the card (N kg⁻¹). */
export const FORCES_STEP = 50;
export const FORCES_PIECES = 9;
export const FORCES_CARD_G = 10;
/** The card's loads (pieces on each hanger): P 300 g, Q 400 g, W 500 g. */
export const FORCES_CARD = { P: 5, Q: 7, W: 9 };
/** Board coordinates (cm): origin at the middle of the paper's bottom edge, y up. The pulleys' top points; the paper's half-width and height. */
export const FORCES_PULLEY = { x: 26, y: 40 };
export const FORCES_PAPER = { w: 23, h: 36 };
export type ForceThread = 'P' | 'Q' | 'W';
/** Dots near (cm from the knot) and far. */
export const FORCES_DOT = { near: 3, far: 11 };

export interface PhyMechanicsVariant {
  seed: number;
  // FRICTION
  /** The block (kg) and the true masses of the six 100 g slotted masses (kg). */
  blockM: number;
  slots: number[];
  muS: number;
  muK: number;
  /** The spring balance's zero error (N, + when it reads above zero with nothing on it). */
  sbZero: number;
  /** μ on the dusty plank as a fraction of μ on the wiped plank. */
  dust: number;
  /** A jerked pull overshoots the limiting force by this fraction; a fast raise overshoots the angle (°). */
  jerk: number;
  tiltLag: number;
  // VISCOSITY
  /** Glycerine's and palm oil's viscosity (Pa s) and density (kg m⁻³) at the room temperature; the steel's density. */
  eta: number;
  rhoL: number;
  oilEta: number;
  oilRho: number;
  rhoS: number;
  /** The five balls' true diameters (mm). */
  balls: number[];
  /** The cylinder's internal diameter (cm), the liquid's depth (cm) and the entry zone (cm) the ball needs to settle. */
  cylD: number;
  depth: number;
  entry: number;
  // INCLINE
  /** One wooden block's height (cm); the ball's rolling factor k (a = g sin θ/(1 + k)); rolling resistance; the speed a push gives (m s⁻¹). */
  blockH: number;
  kRoll: number;
  rollRes: number;
  push: number;
  // FORCES
  /** The three hangers' and their pieces' true masses (g): [P, Q, W]. */
  hangers: number[];
  pieces: number[][];
  /** Pulley friction: a fraction of the tension. */
  pulleyF: number;
}

export function phyMechanicsVariant(seed: number): PhyMechanicsVariant {
  const r = labRandom(seed, 'phy-mechanics');
  const blockM = labBetween(r, 0.28, 0.38, 4);
  const slots = Array.from({ length: FRICTION_SLOTS }, () => labBetween(r, 0.0995, 0.1005, 5));
  const muS = labBetween(r, 0.33, 0.47, 3);
  const muK = muS * labBetween(r, 0.72, 0.82, 3);
  const sbZero = (r() < 0.5 ? -1 : 1) * labBetween(r, 0.1, 0.2, 2);
  const dust = labBetween(r, 0.82, 0.9, 3);
  const jerk = labBetween(r, 0.1, 0.16, 3);
  const tiltLag = labBetween(r, 2.0, 3.5, 2);
  const eta = labBetween(r, 0.9, 1.5, 3);
  const rhoL = labBetween(r, 1252, 1262, 0);
  const oilEta = labBetween(r, 0.05, 0.075, 4);
  const oilRho = labBetween(r, 905, 915, 0);
  const rhoS = labBetween(r, 7780, 7850, 0);
  const balls = VISC_BALLS.map((d) => d + labBetween(r, -0.012, 0.012, 3));
  const cylD = labBetween(r, 6.3, 6.7, 2);
  const depth = labBetween(r, 36, 38, 1);
  const entry = labBetween(r, 3, 4.5, 2);
  const blockH = labBetween(r, 4.8, 5.2, 2);
  const kRoll = labBetween(r, 0.42, 0.55, 3);
  const rollRes = labBetween(r, 0.001, 0.0025, 4);
  const push = labBetween(r, 0.12, 0.2, 3);
  const hangers = [0, 1, 2].map(() => labBetween(r, 49.6, 50.4, 2));
  const pieces = [0, 1, 2].map(() => Array.from({ length: FORCES_PIECES }, () => labBetween(r, 49.6, 50.4, 2)));
  const pulleyF = labBetween(r, 0.02, 0.035, 4);
  return { seed, blockM, slots, muS, muK, sbZero, dust, jerk, tiltLag, eta, rhoL, oilEta, oilRho, rhoS, balls, cylD, depth, entry, blockH, kRoll, rollRes, push, hangers, pieces, pulleyF };
}

// ------------------------------------------------------------------ FRICTION physics

export interface FrictionPull {
  load: number;
  zeroed: boolean;
  jerk: boolean;
  wiped: boolean;
}
export interface FrictionTilt {
  load: number;
  fast: boolean;
  wiped: boolean;
}
export interface FrictionWeigh {
  load: number;
  zeroed: boolean;
}
/** The block and its load (N, true). */
export const frictionWeight = (v: PhyMechanicsVariant, load: number) => (v.blockM + v.slots.slice(0, clamp(load, 0, FRICTION_SLOTS)).reduce((t, x) => t + x, 0)) * MECH_G;
/** What the spring balance shows for a true force: plus its zero error if not adjusted. */
export const sbShows = (v: PhyMechanicsVariant, trueN: number, zeroed: boolean) => trueN + (zeroed ? 0 : v.sbZero);
/** Pull number k (0-based, in order): the balance just as the block starts to move (limiting friction) and while it slides (kinetic). */
export function frictionPull(v: PhyMechanicsVariant, k: number, p: FrictionPull): { limit: number; sliding: number } {
  const r = labRandom(v.seed, `pull-${k}`);
  const R = frictionWeight(v, p.load);
  const surf = p.wiped ? 1 : v.dust;
  const scatter = p.wiped ? 0.018 : 0.05;
  const mu = v.muS * surf * (1 + clamp(gauss(r) * scatter, -2.5 * scatter, 2.5 * scatter));
  const over = p.jerk ? v.jerk * (0.8 + 0.4 * r()) : 0;
  const limit = mu * R * (1 + over);
  const sliding = v.muK * surf * R * (1 + clamp(gauss(r) * 0.02, -0.05, 0.05));
  return { limit: sbShows(v, limit, p.zeroed), sliding: sbShows(v, sliding, p.zeroed) };
}
/** Tilt number k: the plank's angle (°) when the block just slips. Independent of the load. */
export function frictionTilt(v: PhyMechanicsVariant, k: number, t: FrictionTilt): number {
  const r = labRandom(v.seed, `tilt-${k}`);
  const scatter = t.wiped ? 0.018 : 0.05;
  const mu = v.muS * (t.wiped ? 1 : v.dust) * (1 + clamp(gauss(r) * scatter, -2.5 * scatter, 2.5 * scatter));
  return (Math.atan(mu) * 180) / Math.PI + (t.fast ? v.tiltLag * (0.7 + 0.6 * r()) : 0);
}

// ------------------------------------------------------------------ VISCOSITY physics

export interface ViscDrop {
  ball: number;
  liquid: ViscLiquid;
  /** Released at the axis (else near the wall). */
  centre: boolean;
  /** The eye moved level with each band (else read from one height between them). */
  eyeLevel: boolean;
  /** The bands (cm below the surface). */
  top: number;
  bot: number;
  /** The stop-clock was reset before this drop. */
  reset: boolean;
}
const liquidOf = (v: PhyMechanicsVariant, l: ViscLiquid) => (l === 'oil' ? { eta: v.oilEta, rho: v.oilRho } : { eta: v.eta, rho: v.rhoL });
/** Faxén's wall factor for a sphere on the axis of a tube (λ = d/D). */
export const faxen = (lam: number) => 1 - 2.104 * lam + 2.09 * lam ** 3 - 0.95 * lam ** 5;
/** Terminal velocity (m s⁻¹) of ball `b` in a liquid, on the axis or near the wall (its centre 1 cm from the glass). */
export function viscTerminal(v: PhyMechanicsVariant, b: number, liquid: ViscLiquid, centre = true): number {
  const d = (v.balls[clamp(b, 0, v.balls.length - 1)]! / 1000);
  const { eta, rho } = liquidOf(v, liquid);
  const stokes = ((v.rhoS - rho) * MECH_G * d * d) / (18 * eta);
  const wall = faxen(d / (v.cylD / 100)) * (centre ? 1 : 1 - (9 / 16) * (d / 2 / 0.01));
  let u = stokes * wall;
  for (let i = 0; i < 60; i++) {
    const Re = (rho * u * d) / eta;
    u = (stokes * wall) / (1 + 0.15 * Re ** 0.687);
  }
  return u;
}
/** The ball's speed (m s⁻¹) at depth y (cm): slower in the entry zone, where it drags air down with it. */
export const viscSpeedAt = (v: PhyMechanicsVariant, vt: number, y: number) => vt * (y < v.entry ? 0.55 + 0.45 * Math.max(0, y) / v.entry : 1);
/** The true time (s) between the bands. */
export function viscBandTime(v: PhyMechanicsVariant, d: Pick<ViscDrop, 'ball' | 'liquid' | 'centre' | 'top' | 'bot'>): number {
  const vt = viscTerminal(v, d.ball, d.liquid, d.centre);
  const a = Math.min(d.top, d.bot);
  const b = Math.max(d.top, d.bot);
  const n = 200;
  let t = 0;
  for (let i = 0; i < n; i++) {
    const y = a + ((i + 0.5) / n) * (b - a);
    t += (b - a) / n / 100 / viscSpeedAt(v, vt, y);
  }
  return t;
}
/** Read from one height between the bands, each band appears this far (cm) towards the eye: the timed distance is shorter by twice it. */
export const VISC_PARALLAX_CM = 0.9;
/** The stop-clock's readings for each drop, in order (s, to 0.01 s): your reaction at each press; it adds on if not reset. */
export function viscReadings(v: PhyMechanicsVariant, drops: ViscDrop[]): number[] {
  const out: number[] = [];
  let prev = 0;
  drops.forEach((d, k) => {
    const r = labRandom(v.seed, `drop-${k}`);
    const vt = viscTerminal(v, d.ball, d.liquid, d.centre);
    let t = viscBandTime(v, d) - (d.eyeLevel ? 0 : (2 * VISC_PARALLAX_CM) / 100 / vt);
    t += clamp(gauss(r) * 0.06, -0.16, 0.16) - clamp(gauss(r) * 0.06, -0.16, 0.16);
    const shown = Math.round(((d.reset ? 0 : prev) + Math.max(0.05, t)) * 100) / 100;
    out.push(shown);
    prev = shown;
  });
  return out;
}
/** The true slope of v (cm s⁻¹) against r² (mm²) for balls on the axis (from the true terminal velocities, Faxén included): the line a perfect experiment gives. */
export function viscIdealSlope(v: PhyMechanicsVariant): number {
  const pts = v.balls.map((d, b) => ({ x: (d / 2) ** 2, y: viscTerminal(v, b, 'glycerine') * 100 }));
  return pts.reduce((t, p) => t + p.x * p.y, 0) / pts.reduce((t, p) => t + p.x * p.x, 0);
}
/** η from a slope of v (cm s⁻¹) against r² (mm²), with the card's densities (Pa s). */
export const viscEtaFromSlope = (slopeCmPerMm2: number, g = MECH_G) => (2 * (VISC_RHO_STEEL - VISC_RHO_GLY) * g) / (9 * slopeCmPerMm2 * 1e4);

// ------------------------------------------------------------------ INCLINE physics

export interface InclineRun {
  blocks: number;
  /** The stopping block's position (cm from the start line). */
  stop: number;
  push: boolean;
  reset: boolean;
}
/** sin θ of the plank on `blocks` wooden blocks. */
export const inclineSin = (v: PhyMechanicsVariant, blocks: number) => (blocks * v.blockH) / INCLINE_LEN;
/** The ball's acceleration down the plank (m s⁻²). */
export function inclineAccel(v: PhyMechanicsVariant, blocks: number): number {
  const s = inclineSin(v, blocks);
  const c = Math.sqrt(1 - s * s);
  return Math.max(0, (MECH_G * s) / (1 + v.kRoll) - v.rollRes * MECH_G * c);
}
/** The true time (s) from release to the stopping block. */
export function inclineTime(v: PhyMechanicsVariant, r: Pick<InclineRun, 'blocks' | 'stop' | 'push'>): number {
  const a = inclineAccel(v, r.blocks);
  const u = r.push ? v.push : 0;
  const s = r.stop / 100;
  if (a <= 1e-6) return u > 0 ? s / u : 99;
  return (-u + Math.sqrt(u * u + 2 * a * s)) / a;
}
/** The stop-clock's readings for each run (s, to 0.01 s): started as you let go, stopped at the click; it adds on if not reset. */
export function inclineReadings(v: PhyMechanicsVariant, runs: InclineRun[]): number[] {
  const out: number[] = [];
  let prev = 0;
  runs.forEach((run, k) => {
    const r = labRandom(v.seed, `run-${k}`);
    const err = -clamp(0.02 + gauss(r) * 0.03, -0.04, 0.08) + clamp(0.03 + gauss(r) * 0.03, -0.03, 0.09);
    const shown = Math.round(((run.reset ? 0 : prev) + Math.max(0.05, inclineTime(v, run) + err)) * 100) / 100;
    out.push(shown);
    prev = shown;
  });
  return out;
}

// ------------------------------------------------------------------ FORCES physics

export interface ForceLoads {
  P: number;
  Q: number;
  W: number;
}
export interface ForceDot {
  th: ForceThread;
  /** Distance from the knot along the thread (cm). */
  d: number;
  /** The board was tapped (the knot settled) when this dot was marked. */
  tapped: boolean;
}
export interface ForceSet extends ForceLoads {
  dots: ForceDot[];
  /** The loads were changed while this sheet had dots on it. */
  moved: boolean;
  /** The sheet is off the board and the lines drawn. */
  off: boolean;
  /** OA and OB drawn and the parallelogram completed. */
  built: boolean;
}
const IDX: Record<ForceThread, number> = { P: 0, Q: 1, W: 2 };
/** The true mass (g) on a hanger with n pieces. */
export const forceMass = (v: PhyMechanicsVariant, th: ForceThread, n: number) => v.hangers[IDX[th]]! + v.pieces[IDX[th]]!.slice(0, clamp(n, 0, FORCES_PIECES)).reduce((t, x) => t + x, 0);
/** The nominal mass (g) and the force the card's g gives (N). */
export const forceNominal = (n: number) => FORCES_STEP * (n + 1);
export const forceNewton = (n: number) => (forceNominal(n) * FORCES_CARD_G) / 1000;
type P2 = { x: number; y: number };
export interface ForceEquilibrium {
  ok: boolean;
  /** Why not (the knot runs up to a pulley, or the load drops to the bench). */
  why?: string;
  knot: P2;
  /** Unit vectors from the knot along each thread. */
  dir: Record<ForceThread, P2>;
}
/**
 * Where the knot settles (board cm): the threads' directions from the triangle
 * of forces, P and Q changed by the pulleys' friction (less after a tap), then
 * the lines from the pulleys meet at the knot. `set` picks the friction's
 * seeded direction for that sheet.
 */
export function forceEquilibrium(v: PhyMechanicsVariant, l: ForceLoads, tapped: boolean, set: number): ForceEquilibrium {
  const r = labRandom(v.seed, `forces-${set}-${tapped ? 't' : 'u'}-${l.P}-${l.Q}-${l.W}`);
  const f = v.pulleyF * (tapped ? 0.12 : 1);
  const P = forceMass(v, 'P', l.P) * (1 + f * (2 * r() - 1));
  const Q = forceMass(v, 'Q', l.Q) * (1 + f * (2 * r() - 1));
  const W = forceMass(v, 'W', l.W);
  const fail = (why: string): ForceEquilibrium => ({ ok: false, why, knot: { x: 0, y: FORCES_PAPER.h / 2 }, dir: { P: { x: -0.7, y: 0.7 }, Q: { x: 0.7, y: 0.7 }, W: { x: 0, y: -1 } } });
  const ca = (W * W + P * P - Q * Q) / (2 * W * P);
  const cb = (W * W + Q * Q - P * P) / (2 * W * Q);
  if (ca >= 0.995 || cb >= 0.995 || ca <= -0.2 || cb <= -0.2 || P + Q <= W * 1.02) return fail(P + Q <= W * 1.02 ? 'W is too heavy for P and Q: the knot drops and W lands on the bench.' : 'One load is too heavy: the knot runs up to a pulley.');
  const sa = Math.sqrt(1 - ca * ca);
  const sb = Math.sqrt(1 - cb * cb);
  const dP = { x: -sa, y: ca };
  const dQ = { x: sb, y: cb };
  // knot K = pulleyL − t1 dP = pulleyR − t2 dQ
  const L = { x: -FORCES_PULLEY.x, y: FORCES_PULLEY.y };
  const R = { x: FORCES_PULLEY.x, y: FORCES_PULLEY.y };
  // L − t1 dP = R − t2 dQ  →  t1 dP − t2 dQ = L − R
  const det = dP.x * -dQ.y - -dQ.x * dP.y;
  if (Math.abs(det) < 1e-6) return fail('The threads are parallel.');
  const bx = L.x - R.x;
  const by = L.y - R.y;
  const t1 = (bx * -dQ.y - -dQ.x * by) / det;
  const knot = { x: L.x - t1 * dP.x, y: L.y - t1 * dP.y };
  if (t1 < 4 || knot.y > FORCES_PULLEY.y - 4) return fail('One load is too heavy: the knot runs up to a pulley.');
  if (knot.y < 6) return fail('The knot sits too low: W lands on the bench.');
  return { ok: true, knot, dir: { P: dP, Q: dQ, W: { x: 0, y: -1 } } };
}
/** The pencil dot k of a sheet (board cm): on the thread, with a tiny seeded slip of the pencil across it. */
export function forceDotAt(v: PhyMechanicsVariant, set: ForceLoads, setIndex: number, dot: ForceDot, k: number): P2 {
  const eq = forceEquilibrium(v, set, dot.tapped, setIndex);
  const u = eq.dir[dot.th];
  const r = labRandom(v.seed, `dot-${setIndex}-${k}`);
  const slip = clamp(gauss(r) * 0.035, -0.09, 0.09);
  return { x: eq.knot.x + u.x * dot.d - u.y * slip, y: eq.knot.y + u.y * dot.d + u.x * slip };
}
export const onPaper = (p: P2) => Math.abs(p.x) <= FORCES_PAPER.w - 0.3 && p.y >= 0.3 && p.y <= FORCES_PAPER.h - 0.3;
/** The line drawn through a thread's dots: a point and a unit direction pointing away from the knot (null with fewer than two dots). */
export function forceLine(v: PhyMechanicsVariant, s: ForceSet, setIndex: number, th: ForceThread): { p: P2; u: P2; spread: number } | null {
  const pts = s.dots.map((d, k) => ({ d, p: forceDotAt(v, s, setIndex, d, k) })).filter((x) => x.d.th === th);
  if (pts.length < 2) return null;
  const near = pts.reduce((a, b) => (b.d.d < a.d.d ? b : a));
  const far = pts.reduce((a, b) => (b.d.d > a.d.d ? b : a));
  const dx = far.p.x - near.p.x;
  const dy = far.p.y - near.p.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.3) return null;
  return { p: near.p, u: { x: dx / len, y: dy / len }, spread: len };
}
/** The construction on sheet s with OA and OB as drawn (cm): O where the P and Q lines meet, C the far corner, OC and its angle (°) from the upward line of W. */
export function forceConstruction(v: PhyMechanicsVariant, s: ForceSet, setIndex: number, oa: number | null, ob: number | null): { O: P2; A: P2; B: P2; C: P2; oc: number; angle: number; wUp: P2 } | null {
  const lp = forceLine(v, s, setIndex, 'P');
  const lq = forceLine(v, s, setIndex, 'Q');
  const lw = forceLine(v, s, setIndex, 'W');
  if (!lp || !lq || !lw || oa === null || ob === null) return null;
  const det = lp.u.x * -lq.u.y - -lq.u.x * lp.u.y;
  if (Math.abs(det) < 1e-6) return null;
  const bx = lq.p.x - lp.p.x;
  const by = lq.p.y - lp.p.y;
  const t = (bx * -lq.u.y - -lq.u.x * by) / det;
  const O = { x: lp.p.x + t * lp.u.x, y: lp.p.y + t * lp.u.y };
  const A = { x: O.x + lp.u.x * oa, y: O.y + lp.u.y * oa };
  const B = { x: O.x + lq.u.x * ob, y: O.y + lq.u.y * ob };
  const C = { x: A.x + B.x - O.x, y: A.y + B.y - O.y };
  const oc = Math.hypot(C.x - O.x, C.y - O.y);
  const wUp = { x: -lw.u.x, y: -lw.u.y };
  const cos = ((C.x - O.x) * wUp.x + (C.y - O.y) * wUp.y) / Math.max(1e-9, oc);
  const angle = (Math.acos(clamp(cos, -1, 1)) * 180) / Math.PI;
  return { O, A, B, C, oc, angle, wUp };
}

// ------------------------------------------------------------------ the student's work

export interface MechRow {
  /** FRICTION: the load (masses); VISCOSITY: the ball; INCLINE: the stopping block (cm); FORCES: the sheet. */
  key: number;
  c: Record<string, string>;
}
/** Each task's table columns. */
export const MECH_COLS: Record<MechTask, string[]> = {
  FRICTION: ['m', 'R', 'F1', 'F2', 'F'],
  VISCOSITY: ['d', 'r', 'r2', 't1', 't2', 't', 'v'],
  INCLINE: ['s', 't1', 't2', 't3', 't', 'tt'],
  FORCES: ['P', 'Q', 'W', 'OA', 'OB', 'OC', 'R', 'ang', 'diff'],
};
/** Each task's single cells outside the table. */
export const MECH_CELLS: Record<MechTask, string[]> = {
  FRICTION: ['th1', 'th2', 'th3', 'th'],
  VISCOSITY: ['L', 'od', 'ot', 'ov'],
  INCLINE: [],
  FORCES: [],
};
export type MechAnswerId = 'slope' | 'mutan' | 'eta' | 'ratio' | 'accel' | 'scale';
export const MECH_ANSWER_IDS: MechAnswerId[] = ['slope', 'mutan', 'eta', 'ratio', 'accel', 'scale'];
export const MECH_MAX_ROWS = 8;

export interface PhyMechanicsState {
  v: 1;
  task: MechTask | null;
  // ---- FRICTION
  /** The spring balance's zero adjusted; the plank wiped clean; the masses on the block; the plank raised (tilt) or flat. */
  zeroed: boolean;
  wiped: boolean;
  load: number;
  tilt: boolean;
  /** How the student pulls / raises: jerkily or slowly. */
  jerk: boolean;
  fast: boolean;
  weighs: FrictionWeigh[];
  pulls: FrictionPull[];
  tilts: FrictionTilt[];
  // ---- VISCOSITY
  ball: number;
  liquid: ViscLiquid;
  top: number;
  bot: number;
  centre: boolean;
  eyeLevel: boolean;
  /** Balls measured with the micrometer (index; once each counts). */
  measured: number[];
  drops: ViscDrop[];
  // ---- INCLINE
  blocks: number;
  stop: number;
  push: boolean;
  runs: InclineRun[];
  /** The stop-clock was reset since its last timing (VISCOSITY and INCLINE). */
  reset: boolean;
  // ---- FORCES
  masses: ForceLoads;
  tapped: boolean;
  sets: ForceSet[];
  // ---- the notebook
  rows: MechRow[];
  cells: Record<string, string>;
  line: PhyGraphLine | null;
  answers: Record<MechAnswerId, PhyAnswer>;
  written: { precautions: string };
  log: { t: number; a: string }[];
}

export function emptyPhyMechanicsState(): PhyMechanicsState {
  const answers = Object.fromEntries(MECH_ANSWER_IDS.map((id) => [id, { value: '', unit: '' }])) as Record<MechAnswerId, PhyAnswer>;
  return {
    v: 1,
    task: null,
    zeroed: false,
    wiped: false,
    load: 0,
    tilt: false,
    jerk: false,
    fast: false,
    weighs: [],
    pulls: [],
    tilts: [],
    ball: 0,
    liquid: 'glycerine',
    top: 2,
    bot: 22,
    centre: true,
    eyeLevel: false,
    measured: [],
    drops: [],
    blocks: 3,
    stop: 40,
    push: false,
    runs: [],
    reset: true,
    masses: { P: 1, Q: 1, W: 1 },
    tapped: false,
    sets: [],
    rows: [],
    cells: {},
    line: null,
    answers,
    written: { precautions: '' },
    log: [],
  };
}

const short = z.string().max(40);
const loadN = z.number().int().min(0).max(FRICTION_SLOTS);
const ballN = z.number().int().min(0).max(VISC_BALLS.length - 1);
const band = z.number().min(0).max(40);
const liquid = z.enum(['glycerine', 'oil']);
const stopCm = z.number().min(0).max(INCLINE_LEN);
const blocksN = z.number().int().min(0).max(INCLINE_BLOCKS_MAX);
const pieceN = z.number().int().min(0).max(FORCES_PIECES);
const thread = z.enum(['P', 'Q', 'W']);
const answerShape = Object.fromEntries(MECH_ANSWER_IDS.map((id) => [id, phyAnswerSchema])) as Record<MechAnswerId, typeof phyAnswerSchema>;
const cellKey = z.string().regex(/^[a-zA-Z0-9]{1,5}$/);
export const phyMechanicsStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(MECH_TASKS).nullable(),
  zeroed: z.boolean(),
  wiped: z.boolean(),
  load: loadN,
  tilt: z.boolean(),
  jerk: z.boolean(),
  fast: z.boolean(),
  weighs: z.array(z.object({ load: loadN, zeroed: z.boolean() })).max(40),
  pulls: z.array(z.object({ load: loadN, zeroed: z.boolean(), jerk: z.boolean(), wiped: z.boolean() })).max(40),
  tilts: z.array(z.object({ load: loadN, fast: z.boolean(), wiped: z.boolean() })).max(20),
  ball: ballN,
  liquid,
  top: band,
  bot: band,
  centre: z.boolean(),
  eyeLevel: z.boolean(),
  measured: z.array(ballN).max(20),
  drops: z.array(z.object({ ball: ballN, liquid, centre: z.boolean(), eyeLevel: z.boolean(), top: band, bot: band, reset: z.boolean() })).max(40),
  blocks: blocksN,
  stop: stopCm,
  push: z.boolean(),
  runs: z.array(z.object({ blocks: blocksN, stop: stopCm, push: z.boolean(), reset: z.boolean() })).max(40),
  reset: z.boolean(),
  masses: z.object({ P: pieceN, Q: pieceN, W: pieceN }),
  tapped: z.boolean(),
  sets: z
    .array(z.object({ P: pieceN, Q: pieceN, W: pieceN, dots: z.array(z.object({ th: thread, d: z.number().min(0).max(40), tapped: z.boolean() })).max(12), moved: z.boolean(), off: z.boolean(), built: z.boolean() }))
    .max(4),
  rows: z.array(z.object({ key: z.number().min(0).max(INCLINE_LEN), c: z.record(cellKey, short).refine((c) => Object.keys(c).length <= 12, 'too many cells') })).max(MECH_MAX_ROWS),
  cells: z.record(cellKey, short).refine((c) => Object.keys(c).length <= 12, 'too many cells'),
  line: phyGraphLineSchema.nullable(),
  answers: z.object(answerShape),
  written: z.object({ precautions: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<PhyMechanicsState>;

export const PHY_MECHANICS: SimulatorSpec = {
  id: 'phy-mechanics',
  subject: 'Physics',
  title: 'Mechanics: friction, viscosity, acceleration and forces',
  topicNames: ['Solid friction', 'Friction', 'Viscosity (friction in fluids)', 'Viscosity', 'Uniform and non-uniform acceleration', 'Motion', 'Addition of vectors', 'Vectors', 'Equilibrium of forces'],
  minutes: 45,
  rubric: [
    { id: 'care', label: 'Care and technique', marks: 2, how: 'AUTO', guide: 'Friction: the spring balance’s zero checked and adjusted and the plank wiped clean before the readings (1); every pull increased slowly (no jerks) and the plank raised slowly every time (1). Viscosity: every ball released at the centre of the cylinder, away from the walls (1); the eye level with each band when timing (1). Incline: the ball released from rest, not pushed, every time (1); the angle of the plank kept the same for every run (1). Forces: the board tapped so the knot settled before the threads were marked (1); a large scale, with OA and OB at least 5 cm (1).' },
    { id: 'procedure', label: 'Procedure', marks: 4, how: 'AUTO', guide: 'Friction: R found by weighing the block and its load for each row (1); at least four loads (1), each pulled at least twice (1); the angle of slipping found at least twice (1). Viscosity: the upper band at least 6 cm below the surface (1) and the bands about 20 cm apart, their distance measured (1); at least four sizes of ball, each measured with the micrometer (1) and timed at least twice (1). Incline: at least four distances (1) spread over at least 1.0 m (1); each timed three times (1); the stop-clock reset before every timing (1). Forces: two dots under each of the three threads (1); the sheet taken off and the lines drawn to meet at O (1); OA and OB drawn and the parallelogram completed (1); the diagonal measured in size and direction (1).' },
    { id: 'readings', label: 'Table of readings', marks: 5, how: 'AUTO', guide: 'Readings that match the instruments: spring balance ±0.1 N, protractor ±1°, micrometer ±0.01 mm, stop-clock ±0.05 s, plank marks ±0.5 cm, the diagonal ±0.1 cm and its angle ±1° (3); recorded to the instrument’s precision — 0.05 N, 1°, 0.01 mm, 0.01 s, 0.01 m, 0.1 cm (1); the derived columns worked out correctly — means, r², v, t², R = OC × scale, the percentage difference (1).' },
    { id: 'graph', label: 'Graph or construction', marks: 2, how: 'AUTO', guide: 'Friction: F against R; viscosity: v against r²; incline: s against t² — plotted with a straight line drawn across the points (1) that is a good best fit (1). Forces: dots well apart on every thread (at least 6 cm), so the lines are accurate (1); OA and OB drawn to your stated scale (±0.1 cm) (1).' },
    { id: 'calculations', label: 'Results', marks: 4, how: 'AUTO', guide: 'Friction: μ from the slope of your own line or points (1), within 8 % of the true value (1); μ = tan θ from your mean angle (1), within 8 % (1). Viscosity: the slope from your own line or points (1); η = 2(ρs − ρl)g/(9 × slope) from your slope, in SI units (1), within 12 % of the value careful readings give (1); η(glycerine)/η(oil) = v(oil)/v(glycerine) from your own times (1). Incline: the slope from your own line or points (1); a = 2 × slope (1); a within 8 % of the true value (1); the line passes through the origin (uniform acceleration from rest) (1). Forces: R = OC × scale (1); the percentage difference from your own R and W (1); R within 5 % of W (1); R vertical (within 3°), opposite to W (1).' },
    { id: 'units', label: 'Units', marks: 1, how: 'AUTO', guide: 'μ with no unit; the slope of v against r² in cm s⁻¹ mm⁻² (or m⁻¹ s⁻¹) and η in Pa s (N s m⁻², kg m⁻¹ s⁻¹), the ratio with no unit; the slope and a in m s⁻²; the scale in N cm⁻¹ (N per cm).' },
    { id: 'precautions', label: 'Precautions', marks: 2, how: 'AI', guide: 'Two correct precautions (1 mark each), e.g. friction: pulled horizontally and gradually; the reading taken just as the block starts to move; the plank clean and dry; the zero error checked; the plank raised slowly; readings repeated and averaged. Viscosity: the upper band well below the surface so the ball is at terminal velocity; the ball dropped along the axis, away from the walls; the eye level with each band; the temperature kept constant; each time repeated. Incline: the ball released from rest without pushing; the angle kept constant; each time repeated and averaged; the stop-clock reset; parallax avoided at the marks. Forces: pulleys free from friction (board tapped); dots well separated; a sharp pencil; a large scale; the knot not touching the board.' },
  ],
};
