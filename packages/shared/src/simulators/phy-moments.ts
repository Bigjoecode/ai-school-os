import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { phyAnswerSchema, phyGraphLineSchema, type PhyAnswer, type PhyGraphLine } from './phy-common';
import { labBetween, labRandom } from './seeded';

/**
 * phy-moments: a metre rule balanced on a knife edge. Two tasks:
 *  - MOMENTS (principle of moments): balance the rule alone to find its
 *    centre of gravity G, keep the knife edge at G, hang the 50 g mass at a
 *    distance d₁ on one side and slide the unknown mass M along the other side
 *    until the rule balances; read d₂. Repeat for five values of d₁, plot d₁
 *    against d₂ (a straight line through the origin of slope M/m) and find
 *    M = m × slope; also M from each pair, averaged.
 *  - MASS (mass of the rule): find G the same way, hang the 100 g mass at a
 *    mark near one end and slide the rule over the knife edge until it
 *    balances at P. Taking moments about P: m × (P − x) = M × (G − P). Repeat
 *    for five marks, plot d₁ = P − x against d₂ = G − P (slope M/m) and find
 *    the rule's mass M; also from each pair, averaged.
 * Units: cm and g.
 *
 * Physics: the torque about the pivot p (g·cm, positive turns the right-hand
 * end down) is Mr(G − p) + Σ m(x − p). The knife edge holds the rule still
 * while |torque| ≤ k × (total load) — friction at the edge (k, a fraction of a
 * mm, seeded) gives a small band of balance positions, as on a real knife
 * edge. Outside it the rule tips towards the heavier side, damped, until its
 * low end or a hanging mass comes to rest on the bench.
 */

export const MOMENTS_TASKS = ['MOMENTS', 'MASS'] as const;
export type MomentsTask = (typeof MOMENTS_TASKS)[number];

/** The rule's length (cm); the knife edge's height above the bench (cm); the rule's thickness (cm). */
export const MOMENTS_RULE = 100;
export const MOMENTS_EDGE_H = 10;
export const MOMENTS_RULE_T = 0.6;
/** A hanging mass's thread and its slotted mass/hanger (cm): the bottom of the mass hangs this far below the rule. */
export const MOMENTS_HANG = { thread: 3, body: 4 };
/** The known mass (g) for each task. */
export const MOMENTS_KNOWN: Record<MomentsTask, number> = { MOMENTS: 50, MASS: 100 };
/** Limits for the knife edge's mark and for a thread loop (cm on the rule). */
export const MOMENTS_PIVOT_MIN = 5;
export const MOMENTS_PIVOT_MAX = 95;
export const MOMENTS_LOOP_MIN = 0.5;
export const MOMENTS_LOOP_MAX = 99.5;
/** The marks on each task's card for the known mass (cm). */
export const MOMENTS_CARD_X: Record<MomentsTask, number[]> = { MOMENTS: [26, 30, 34, 38, 42], MASS: [5, 10, 15, 20, 25] };
/** The spread a good set of readings covers (cm): of d₁ (MOMENTS) or of the mass's mark (MASS). */
export const MOMENTS_SPREAD: Record<MomentsTask, number> = { MOMENTS: 12, MASS: 15 };
const G_CM = 981;

export interface PhyMomentsVariant {
  seed: number;
  /** The rule's mass (g) and its centre of gravity (cm mark): a real rule is not quite uniform. */
  ruleMass: number;
  g: number;
  /** MOMENTS: the unknown mass M (g). */
  unknown: number;
  /** Knife-edge friction (cm): the rule stays put while |torque| ≤ friction × total load. */
  friction: number;
  /** Where the rule first lies on the knife edge and where the thread loops are first hung (cm marks). */
  start: { pivot: number; known: number; other: number };
}

export function phyMomentsVariant(seed: number): PhyMomentsVariant {
  const r = labRandom(seed, 'phy-moments');
  const ruleMass = labBetween(r, 95, 130, 1);
  const g = labBetween(r, 49.6, 50.6, 2);
  const unknown = labBetween(r, 30, 70, 1);
  const friction = labBetween(r, 0.055, 0.07, 3);
  const left = r() < 0.5;
  return {
    seed,
    ruleMass,
    g,
    unknown,
    friction,
    start: { pivot: left ? labBetween(r, 43, 46.5, 1) : labBetween(r, 53.5, 57, 1), known: labBetween(r, 18, 32, 1), other: labBetween(r, 66, 82, 1) },
  };
}

/** What hangs on the rule: the known mass and (MOMENTS) the unknown, at their marks (null: not hung). */
export interface MomentsLoad {
  pivot: number;
  known: number | null;
  other: number | null;
}
const loads = (v: PhyMomentsVariant, task: MomentsTask, l: MomentsLoad) => {
  const out: { m: number; x: number }[] = [];
  if (l.known !== null) out.push({ m: MOMENTS_KNOWN[task], x: l.known });
  if (task === 'MOMENTS' && l.other !== null) out.push({ m: v.unknown, x: l.other });
  return out;
};

/** The torque about the knife edge (g·cm; positive turns the right-hand, 100 cm, end down). */
export function momentsTorque(v: PhyMomentsVariant, task: MomentsTask, l: MomentsLoad): number {
  return v.ruleMass * (v.g - l.pivot) + loads(v, task, l).reduce((t, a) => t + a.m * (a.x - l.pivot), 0);
}
/** The largest torque the knife edge's friction holds (g·cm). */
export function momentsHold(v: PhyMomentsVariant, task: MomentsTask, l: MomentsLoad): number {
  return v.friction * (v.ruleMass + loads(v, task, l).reduce((t, a) => t + a.m, 0));
}
/** The rule stays horizontal when released (the torque is within the knife edge's friction). */
export const momentsBalanced = (v: PhyMomentsVariant, task: MomentsTask, l: MomentsLoad) => Math.abs(momentsTorque(v, task, l)) <= momentsHold(v, task, l) + 1e-9;

/** Moment of inertia about the knife edge (g·cm²). */
function inertia(v: PhyMomentsVariant, task: MomentsTask, l: MomentsLoad) {
  return v.ruleMass * (MOMENTS_RULE ** 2 / 12 + (v.g - l.pivot) ** 2) + loads(v, task, l).reduce((t, a) => t + a.m * (a.x - l.pivot) ** 2, 0);
}

/**
 * The angle (rad, positive: right end down) at which the rule comes to rest on
 * that side: its end touches the bench, or a hanging mass does first.
 */
export function momentsStop(v: PhyMomentsVariant, task: MomentsTask, l: MomentsLoad, side: 1 | -1): number {
  const end = side === 1 ? MOMENTS_RULE - l.pivot : l.pivot;
  let stop = Math.asin(Math.min(1, MOMENTS_EDGE_H / Math.max(1, end)));
  const clear = MOMENTS_EDGE_H - MOMENTS_RULE_T - MOMENTS_HANG.thread - MOMENTS_HANG.body;
  for (const a of loads(v, task, l)) {
    const d = (a.x - l.pivot) * side;
    if (d > 0.5) stop = Math.min(stop, Math.asin(Math.min(1, clear / d)));
  }
  return stop;
}

/** Sliding friction at the edge as a fraction of the static hold (stick–slip: once it moves, it keeps going). */
const SLIDING = 0.6;
/**
 * The tilt as the rule moves: one time step (s) of the damped motion from
 * (θ, ω), coming to rest on the bench. At rest the edge holds any torque up to
 * its static friction; once moving only the smaller sliding friction acts, so
 * a rule that is not balanced tips promptly and visibly.
 */
export function momentsStep(v: PhyMomentsVariant, task: MomentsTask, l: MomentsLoad, th: number, om: number, dt: number): { th: number; om: number; resting: boolean } {
  const tau = momentsTorque(v, task, l);
  const hold = momentsHold(v, task, l);
  const side: 1 | -1 = Math.abs(om) > 1e-9 ? (om > 0 ? 1 : -1) : tau >= 0 ? 1 : -1;
  const stop = momentsStop(v, task, l, side);
  if (Math.abs(om) <= 1e-9 && (Math.abs(tau) <= hold || (Math.abs(th) >= stop - 1e-9 && Math.sign(th) === side))) return { th, om: 0, resting: true };
  const I = inertia(v, task, l);
  const alpha = (G_CM * (tau - side * SLIDING * hold)) / I - 0.8 * om;
  let nom = om + alpha * dt;
  let nth = th + nom * dt;
  if (Math.abs(nth) >= momentsStop(v, task, l, nth >= 0 ? 1 : -1) && Math.sign(nth) === side) return { th: side * stop, om: 0, resting: true };
  // Swinging back past zero speed: the edge grips again if it can.
  if (Math.sign(nom) !== Math.sign(om) && Math.abs(om) > 1e-9) nom = 0;
  return { th: nth, om: nom, resting: false };
}

/** The level the rule hangs at once released and settled: 0 when balanced, else resting on the low side. */
export function momentsRest(v: PhyMomentsVariant, task: MomentsTask, l: MomentsLoad): number {
  if (momentsBalanced(v, task, l)) return 0;
  const side: 1 | -1 = momentsTorque(v, task, l) > 0 ? 1 : -1;
  return side * momentsStop(v, task, l, side);
}

/** MASS: the pivot mark that balances the rule with the mass at x (the middle of the balance band). */
export const momentsMassBalance = (v: PhyMomentsVariant, x: number) => (MOMENTS_KNOWN.MASS * x + v.ruleMass * v.g) / (MOMENTS_KNOWN.MASS + v.ruleMass);
/** MOMENTS: with the pivot at p and the 50 g at x1, the mark for the unknown mass that balances the rule exactly. */
export const momentsOtherBalance = (v: PhyMomentsVariant, p: number, x1: number) => p + (MOMENTS_KNOWN.MOMENTS * (p - x1) - v.ruleMass * (v.g - p)) / v.unknown;
/** The true mass the task finds (g): the unknown (MOMENTS) or the rule's own (MASS). */
export const momentsTrueMass = (v: PhyMomentsVariant, task: MomentsTask) => (task === 'MASS' ? v.ruleMass : v.unknown);
/** How far (cm) a recorded G may be from the true one and still count as "found by balancing". */
export const momentsGTol = (v: PhyMomentsVariant) => v.friction + 0.05;

// ------------------------------------------------------------------ the student's work

/** The rule at the moment the student recorded a reading. */
export interface MomentsReading {
  pivot: number;
  known: number | null;
  other: number | null;
}
/**
 * A row of the table as written. MOMENTS: x1 = the 50 g's mark, x2 = the unknown's mark, d1 = G − x1, d2 = x2 − G.
 * MASS: x1 = the 100 g's mark, x2 = the balance point P, d1 = P − x1, d2 = G − P. m = the mass worked out from the row.
 */
export interface MomentsRow {
  x1: string;
  x2: string;
  d1: string;
  d2: string;
  m: string;
}
export type MomentsAnswerId = 'g' | 'slope' | 'mass' | 'mean';
export interface PhyMomentsState {
  v: 1;
  task: MomentsTask | null;
  /** The rule's mark resting on the knife edge (cm). */
  pivot: number;
  /** The known mass's thread loop (cm mark; null: not hung). */
  known: number | null;
  /** MOMENTS: the unknown mass's thread loop (cm mark; null: not hung). */
  other: number | null;
  /** The balance point of the rule alone as the student recorded it (cm; null: not yet). */
  g: number | null;
  readings: MomentsReading[];
  table: MomentsRow[];
  line: PhyGraphLine | null;
  answers: Record<MomentsAnswerId, PhyAnswer>;
  written: { precautions: string };
  log: { t: number; a: string }[];
}

export function emptyPhyMomentsState(): PhyMomentsState {
  const blank = () => ({ value: '', unit: '' });
  return {
    v: 1,
    task: null,
    pivot: 45,
    known: null,
    other: null,
    g: null,
    readings: [],
    table: [],
    line: null,
    answers: { g: blank(), slope: blank(), mass: blank(), mean: blank() },
    written: { precautions: '' },
    log: [],
  };
}

const short = z.string().max(40);
const pos = z.number().min(0).max(MOMENTS_RULE);
export const phyMomentsStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(MOMENTS_TASKS).nullable(),
  pivot: pos,
  known: pos.nullable(),
  other: pos.nullable(),
  g: pos.nullable(),
  readings: z.array(z.object({ pivot: pos, known: pos.nullable(), other: pos.nullable() })).max(12),
  table: z.array(z.object({ x1: short, x2: short, d1: short, d2: short, m: short })).max(12),
  line: phyGraphLineSchema.nullable(),
  answers: z.object({ g: phyAnswerSchema, slope: phyAnswerSchema, mass: phyAnswerSchema, mean: phyAnswerSchema }),
  written: z.object({ precautions: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<PhyMomentsState>;

export const PHY_MOMENTS: SimulatorSpec = {
  id: 'phy-moments',
  subject: 'Physics',
  title: 'Moments: the metre rule on a knife edge',
  topicNames: ['Principle of moments', 'Moments', 'Equilibrium of forces', 'Centre of gravity and stability', 'Centre of gravity'],
  minutes: 45,
  rubric: [
    { id: 'procedure', label: 'Procedure', marks: 4, how: 'AUTO', guide: 'The balance point G of the rule alone found by balancing it (within the knife edge’s balance range) and written to 0.1 cm (1); principle of moments: the knife edge kept at G for every reading — mass of the rule: G found before the mass was hung (1); at least five readings at different positions (1); the positions well spread (d₁ over at least 12 cm; the mass’s marks over at least 15 cm) (1).' },
    { id: 'balancing', label: 'Balancing', marks: 3, how: 'AUTO', guide: 'The rule balanced horizontally (it stays level when released) for each reading — marks in proportion to the readings balanced.' },
    { id: 'readings', label: 'Table of readings', marks: 4, how: 'AUTO', guide: 'The marks of the thread loops and the knife edge that match the rule (±0.2 cm) (2); recorded to 1 decimal place in cm (1); d₁ and d₂ measured from the pivot (principle of moments: from G; mass of the rule: P − x and G − P) and worked out correctly (1).' },
    { id: 'graph', label: 'Graph', marks: 2, how: 'AUTO', guide: 'd₁ against d₂ plotted with a straight line drawn across the points (1); the line is a good best fit (slope within 6 % of the points’ best fit) (1).' },
    { id: 'calculations', label: 'Slope and mass', marks: 4, how: 'AUTO', guide: 'The slope read from your own line or points (within 5 %) (1); M = m × slope from your slope (1); M worked out from each row (M = m d₁/d₂) and averaged (1); M within 5 % of the true mass (1).' },
    { id: 'units', label: 'Units', marks: 1, how: 'AUTO', guide: 'G in cm, the masses in g (or kg), the slope with no unit.' },
    { id: 'precautions', label: 'Precautions', marks: 2, how: 'AI', guide: 'Two correct precautions (1 mark each), e.g. the rule balanced horizontally before each reading; the thread loops thin and vertical, distances measured to their centres; distances measured from the pivot (not the zero end); the knife edge sharp / friction kept small; draughts avoided; readings taken with the eye perpendicular to the scale (no parallax); readings repeated and averaged; the masses kept low over the bench.' },
  ],
};
