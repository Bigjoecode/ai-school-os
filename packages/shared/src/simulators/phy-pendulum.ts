import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { phyAnswerSchema, phyGraphLineSchema, type PhyAnswer, type PhyGraphLine } from './phy-common';
import { labBetween, labRandom } from './seeded';

/**
 * phy-pendulum: WAEC simple pendulum. The bob hangs from a split cork on a
 * retort stand; the student sets the thread length (read on the metre rule to
 * the top of the bob, so the effective length l adds the bob's radius),
 * displaces the bob, starts and stops a stopwatch for n oscillations, and
 * repeats for at least five lengths. They tabulate l, t, T, T², draw the best
 * line of T² against l and find g = 4π²/slope. Each seed gives a different
 * local g, bob size and swing scatter; the times come from the student's own
 * stopwatch presses.
 */

export const PENDULUM_THREAD_MIN = 20;
export const PENDULUM_THREAD_MAX = 110;
export const PENDULUM_OSCILLATIONS = [10, 20, 30] as const;
/** Amplitudes above this (degrees) are not "small". */
export const PENDULUM_SMALL_ANGLE = 10;
/** The stopwatch was started as the bob passed the mean position: |θ|/θ₀ below this at the press. */
export const PENDULUM_MEAN_ZONE = 0.35;

export interface PhyPendulumVariant {
  seed: number;
  /** True g here (m s⁻²). */
  g: number;
  /** Bob diameter given on the paper (cm, 1 d.p.). */
  bobDiameter: number;
  bobRadius: number;
  /** Lengths the paper suggests (thread to the top of the bob, cm). */
  suggested: number[];
}

export function phyPendulumVariant(seed: number): PhyPendulumVariant {
  const r = labRandom(seed, 'phy-pendulum');
  const g = labBetween(r, 9.76, 9.84, 3);
  const bobDiameter = labBetween(r, 1.6, 3.0, 1);
  const start = 30 + 10 * Math.floor(r() * 3); // 30, 40 or 50
  const suggested = [0, 1, 2, 3, 4, 5].map((k) => start + 10 * k);
  return { seed, g, bobDiameter, bobRadius: bobDiameter / 2, suggested };
}

/**
 * The true period (s) of swing `index` (0-based, in order of timing): 2π√(l/g)
 * with the large-amplitude correction, a tiny seeded scatter, and a larger one
 * in a draught (window open).
 */
export function pendulumPeriod(v: PhyPendulumVariant, threadCm: number, amplitudeDeg: number, index: number, shielded: boolean): number {
  const l = (threadCm + v.bobRadius) / 100;
  const th = (amplitudeDeg * Math.PI) / 180;
  const base = 2 * Math.PI * Math.sqrt(l / v.g) * (1 + th ** 2 / 16 + (11 * th ** 4) / 3072);
  const rand = labRandom(v.seed, `swing-${index}`);
  const scatter = labBetween(rand, -0.0015, 0.0015, 5);
  const draught = shielded ? 0 : labBetween(rand, -0.025, 0.025, 4);
  return base * (1 + scatter + draught);
}

// ------------------------------------------------------------------ the student's work

/** One timing as it happened (written when the student records the stopwatch). */
export interface PendulumRun {
  /** Thread length to the top of the bob (cm). */
  thread: number;
  amplitude: number;
  /** Oscillations the student chose to time. */
  n: number;
  shielded: boolean;
  /** Stopwatch reading (s, 2 d.p.). */
  elapsed: number;
  /** |θ|/θ₀ when the stopwatch was started (0 = mean position, 1 = extreme). */
  startPhase: number;
}
export interface PendulumRow {
  l: string;
  t: string;
  T: string;
  T2: string;
}
export type PendulumTaskId = 'slope' | 'g';
export interface PhyPendulumState {
  v: 1;
  /** Current settings. */
  thread: number;
  amplitude: number;
  n: number;
  shielded: boolean;
  runs: PendulumRun[];
  /** Same order as `runs`. */
  table: PendulumRow[];
  line: PhyGraphLine | null;
  answers: Record<PendulumTaskId, PhyAnswer>;
  written: { precautions: string };
  log: { t: number; a: string }[];
}

export function emptyPhyPendulumState(): PhyPendulumState {
  return {
    v: 1,
    thread: 50,
    amplitude: 20,
    n: 20,
    shielded: false,
    runs: [],
    table: [],
    line: null,
    answers: { slope: { value: '', unit: '' }, g: { value: '', unit: '' } },
    written: { precautions: '' },
    log: [],
  };
}

const short = z.string().max(40);
export const phyPendulumStateSchema = z.object({
  v: z.literal(1),
  thread: z.number().min(PENDULUM_THREAD_MIN).max(PENDULUM_THREAD_MAX),
  amplitude: z.number().min(1).max(60),
  n: z.number().int().min(1).max(100),
  shielded: z.boolean(),
  runs: z
    .array(z.object({ thread: z.number().min(PENDULUM_THREAD_MIN).max(PENDULUM_THREAD_MAX), amplitude: z.number().min(1).max(60), n: z.number().int().min(1).max(100), shielded: z.boolean(), elapsed: z.number().min(0).max(3600), startPhase: z.number().min(0).max(1) }))
    .max(16),
  table: z.array(z.object({ l: short, t: short, T: short, T2: short })).max(16),
  line: phyGraphLineSchema.nullable(),
  answers: z.object({ slope: phyAnswerSchema, g: phyAnswerSchema }),
  written: z.object({ precautions: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<PhyPendulumState>;

export const PHY_PENDULUM: SimulatorSpec = {
  id: 'phy-pendulum',
  subject: 'Physics',
  title: 'Simple pendulum',
  topicNames: ['Period, frequency and amplitude of S.H.M.', 'Simple harmonic motion', 'Oscillations'],
  minutes: 45,
  rubric: [
    { id: 'setup', label: 'Setting up', marks: 2, how: 'AUTO', guide: 'The length l measured to the centre of the bob (thread length plus the radius of the bob) (1); a small angle of displacement, 10° or less, every time (1).' },
    { id: 'procedure', label: 'Procedure', marks: 4, how: 'AUTO', guide: 'At least five different lengths spread over at least 30 cm (1); at least 20 oscillations timed each time (1); the stopwatch started as the bob passed the mean (rest) position (1); the pendulum shielded from draughts (1).' },
    { id: 'readings', label: 'Table of readings', marks: 5, how: 'AUTO', guide: 'Times that match the stopwatch within ±0.05 s (2); times recorded to at least 1 decimal place (1); exactly the stated number of oscillations timed (1); T = t/n and T² worked out correctly (1).' },
    { id: 'graph', label: 'Graph', marks: 2, how: 'AUTO', guide: 'T² against l plotted with a straight line drawn across the points (1); the line is a good best fit (slope within 6 % of the points’ best fit) (1).' },
    { id: 'calculations', label: 'Slope and g', marks: 4, how: 'AUTO', guide: 'Slope of T² against l from your own data or your own line (2); g = 4π²/slope worked out from your slope (1); g within 3 % of the true value (1).' },
    { id: 'units', label: 'Units', marks: 1, how: 'AUTO', guide: 'Slope in s² m⁻¹ (or s² cm⁻¹) and g in m s⁻² (or cm s⁻²), consistent with the values.' },
    { id: 'precautions', label: 'Precautions', marks: 2, how: 'AI', guide: 'Two correct precautions (1 mark each), e.g. small angle of displacement (less than 10°); count/time from the mean (rest) position using a fiducial mark; avoid draughts (close windows, switch off fans); rigid support (split cork); measure l to the centre of the bob; time many oscillations and repeat; bob swings in a vertical plane without spinning; avoid parallax when reading the metre rule.' },
  ],
};
