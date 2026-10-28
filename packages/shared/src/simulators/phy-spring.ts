import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { phyAnswerSchema, phyGraphLineSchema, type PhyAnswer, type PhyGraphLine } from './phy-common';
import { labBetween, labRandom } from './seeded';

/**
 * phy-spring: a spiral (helical) spring clamped on a retort stand, a pointer
 * at its lower end moving over a vertical metre rule (0 at the top), a 50 g
 * mass hanger and 50 g slotted masses. Two tasks:
 *  - HOOKE (Hooke's law): read the pointer with no load (R₀), then load the
 *    hanger in 50 g steps, reading the pointer at eye level each time (to
 *    0.1 cm, the spring at rest); unload one at a time and read again. Tabulate
 *    m, W = mg, the loading and unloading readings and e = mean R − R₀. Plot e
 *    against W (the lesson's way): slope = 1/k, so k = 1/slope.
 *  - OSC (oscillations of a loaded spring): hang a mass, pull it down a little
 *    and release; time n oscillations from the fiducial (rest) position, twice;
 *    repeat for five masses. Tabulate m, t₁, t₂, mean t, T = t/n and T². Plot T²
 *    against m: T² = (4π²/k)(m + mₛ/3), so k = 4π²/slope and the small
 *    intercept comes from the spring's own mass.
 *
 * Physics: the true load is the hanger plus the slotted masses actually on it
 * (each a little off 50 g, seeded). Within the elastic limit the extension is
 * F/k; beyond it the spring yields: e = F/k + 1.5 (Fₘ − F_el)/k, where Fₘ is
 * the largest load it has ever carried (so it keeps a permanent set when
 * unloaded). The oscillation is damped SHM with T = 2π√((M + mₛ/3)/k). Units in
 * the state: loads in g, readings in cm, times in s.
 */

export const SPRING_TASKS = ['HOOKE', 'OSC'] as const;
export type SpringTask = (typeof SPRING_TASKS)[number];

/** g used by the spring's physics (m s⁻²). Students may take 9.8 or 10. */
export const SPRING_G = 9.81;
/** The hanger and each slotted mass (nominal, g); how many slotted masses there are. */
export const SPRING_STEP = 50;
export const SPRING_SLOTS = 13;
/** The heaviest load the hanger takes (g): the hanger and every slotted mass. */
export const SPRING_MAX_LOAD = SPRING_STEP * (SPRING_SLOTS + 1);
/** The loads on each task's card (g, hanger included). */
export const SPRING_CARD: Record<SpringTask, number[]> = { HOOKE: [50, 100, 150, 200, 250, 300], OSC: [100, 150, 200, 300, 400] };
/** Oscillations a timing can cover; displacements offered (cm). */
export const SPRING_OSCILLATIONS = [10, 20] as const;
export const SPRING_AMPS = [1, 1.5, 2, 3, 5] as const;
/** A displacement above this (cm) is not "small" (the lesson: 1–2 cm). */
export const SPRING_SMALL_AMP = 2;
/**
 * The watch was started as the mass passed the rest position: |x|/A below this at the press (within about
 * an eighth of a period of the pass — a spring oscillates quickly, so this allows for a real reaction time;
 * starting at the bottom or top of the swing gives about 1).
 */
export const SPRING_MEAN_ZONE = 0.7;
/** The pointer is "at rest" when its oscillation is smaller than this (cm). */
export const SPRING_STILL = 0.05;
/** The rule's length (cm). */
export const SPRING_RULE = 100;
const FOUR_PI2 = 4 * Math.PI ** 2;

export interface PhySpringVariant {
  seed: number;
  /** Spring constant (N m⁻¹). */
  k: number;
  /** The spring's own mass (kg): a third of it moves with the load. */
  springMass: number;
  /** Pointer reading with no load (cm on the rule, 0 at the top). */
  r0: number;
  /** True masses (kg): the hanger, then the slotted masses in the order they go on. */
  hanger: number;
  slots: number[];
  /** Elastic limit (N). */
  limit: number;
  /** Amplitude decay time (s): the oscillation dies away as e^(−t/τ). */
  tau: number;
}

export function phySpringVariant(seed: number): PhySpringVariant {
  const r = labRandom(seed, 'phy-spring');
  const k = labBetween(r, 18, 40, 1);
  const springMass = labBetween(r, 0.015, 0.045, 3);
  const r0 = labBetween(r, 22, 34, 2);
  const hanger = labBetween(r, 0.0496, 0.0504, 5);
  const slots = Array.from({ length: SPRING_SLOTS }, () => labBetween(r, 0.0495, 0.0505, 5));
  const limit = labBetween(r, 5.0, 5.6, 2);
  const tau = labBetween(r, 30, 60, 1);
  return { seed, k, springMass, r0, hanger, slots, limit, tau };
}

/** Load in g (a multiple of 50, the hanger included) → how many pieces are on the hook. */
const pieces = (loadG: number) => Math.max(0, Math.min(SPRING_SLOTS + 1, Math.round(loadG / SPRING_STEP)));
/** The true mass on the hook (kg) for a nominal load (g): the hanger and the first slotted masses. */
export function springTrueMass(v: PhySpringVariant, loadG: number): number {
  const n = pieces(loadG);
  if (!n) return 0;
  return v.hanger + v.slots.slice(0, n - 1).reduce((t, x) => t + x, 0);
}
/** The weight (N) of a nominal load. */
export const springForce = (v: PhySpringVariant, loadG: number) => springTrueMass(v, loadG) * SPRING_G;
/**
 * The extension (m) under force F (N) when the largest load the spring has
 * ever carried weighed `peakF`: elastic up to the limit, then it yields and
 * keeps a permanent set.
 */
export function springExtension(v: PhySpringVariant, F: number, peakF: number): number {
  const Fm = Math.max(F, peakF);
  return F / v.k + (1.5 * Math.max(0, Fm - v.limit)) / v.k;
}
/** The pointer's rest reading (cm) with `loadG` on, after `peakG` has been the heaviest load so far. */
export const springReading = (v: PhySpringVariant, loadG: number, peakG: number) => v.r0 + 100 * springExtension(v, springForce(v, loadG), springForce(v, Math.max(peakG, loadG)));
/** A load beyond the elastic limit (N), statically or at the bottom of an oscillation of amplitude `ampCm`. */
export const springOverLimit = (v: PhySpringVariant, loadG: number, ampCm = 0) => springForce(v, loadG) + (v.k * ampCm) / 100 > v.limit + 1e-9;
/** The effective oscillating mass (kg): the load and a third of the spring. */
export const springEffMass = (v: PhySpringVariant, loadG: number) => springTrueMass(v, loadG) + v.springMass / 3;
/** The slotted masses jump off the hanger at the top of the swing: the acceleration there exceeds g. */
export const springMassesFly = (v: PhySpringVariant, loadG: number, ampCm: number) => loadG > 0 && ((v.k / springEffMass(v, loadG)) * ampCm) / 100 > SPRING_G;

/** The true period (s) of timing `index` (in order of timing): 2π√((M + mₛ/3)/k) with a tiny seeded scatter. */
export function springPeriod(v: PhySpringVariant, loadG: number, index: number): number {
  const base = 2 * Math.PI * Math.sqrt(springEffMass(v, loadG) / v.k);
  const rand = labRandom(v.seed, `spring-run-${index}`);
  return base * (1 + labBetween(rand, -0.0012, 0.0012, 5));
}
/** The slope of T² against m (s² kg⁻¹) and the intercept (s²) for this spring. */
export const springOscLine = (v: PhySpringVariant) => ({ slope: FOUR_PI2 / v.k, intercept: (FOUR_PI2 * v.springMass) / 3 / v.k });
/**
 * Displacement from the rest position (cm, + = down) at time t (s) after the
 * motion began with amplitude a0 (cm) and phase: damped SHM.
 */
export const springOffset = (v: PhySpringVariant, a0: number, T: number, t: number) => a0 * Math.exp(-t / v.tau) * Math.cos((2 * Math.PI * t) / T);

// ------------------------------------------------------------------ the student's work

/** HOOKE: a pointer reading as the student took it (the true reading follows from load and peak). */
export interface SpringReading {
  /** Nominal load (g; 0 = nothing on the spring). */
  load: number;
  /** The heaviest load so far (g): unloading when it is above `load`. */
  peak: number;
  /** The pointer was still oscillating when read. */
  moving: boolean;
}
/** OSC: one timing as it happened. */
export interface SpringRun {
  load: number;
  /** Displacement before release (cm). */
  amp: number;
  /** Oscillations the student chose to time. */
  n: number;
  /** Stopwatch reading (s, 2 d.p.). */
  elapsed: number;
  /** |x|/A when the watch was started (0 = the rest position). */
  startPhase: number;
}
/** HOOKE row: mass, weight, loading and unloading readings, extension. */
export interface HookeRow {
  m: string;
  W: string;
  Rl: string;
  Ru: string;
  e: string;
}
/** OSC row: mass, two times, mean, period, period squared. */
export interface OscRow {
  m: string;
  t1: string;
  t2: string;
  t: string;
  T: string;
  T2: string;
}
export type SpringAnswerId = 'r0' | 'slope' | 'k';
export interface PhySpringState {
  v: 1;
  task: SpringTask | null;
  /** Nominal load on the spring (g; 0: the hanger is off). */
  load: number;
  /** The heaviest load the spring has carried (g). */
  peak: number;
  /** OSC settings: the displacement (cm) and the oscillations to time. */
  amp: number;
  n: number;
  readings: SpringReading[];
  runs: SpringRun[];
  /** The load (g) of each table row (same order as the rows). */
  rows: number[];
  hooke: HookeRow[];
  osc: OscRow[];
  line: PhyGraphLine | null;
  answers: Record<SpringAnswerId, PhyAnswer>;
  written: { precautions: string };
  log: { t: number; a: string }[];
}

export function emptyPhySpringState(): PhySpringState {
  const blank = () => ({ value: '', unit: '' });
  return {
    v: 1,
    task: null,
    load: 0,
    peak: 0,
    amp: 1.5,
    n: 20,
    readings: [],
    runs: [],
    rows: [],
    hooke: [],
    osc: [],
    line: null,
    answers: { r0: blank(), slope: blank(), k: blank() },
    written: { precautions: '' },
    log: [],
  };
}

const short = z.string().max(40);
const load = z.number().min(0).max(SPRING_MAX_LOAD);
export const phySpringStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(SPRING_TASKS).nullable(),
  load,
  peak: load,
  amp: z.number().min(0.5).max(10),
  n: z.number().int().min(1).max(100),
  readings: z.array(z.object({ load, peak: load, moving: z.boolean() })).max(40),
  runs: z.array(z.object({ load, amp: z.number().min(0.5).max(10), n: z.number().int().min(1).max(100), elapsed: z.number().min(0).max(3600), startPhase: z.number().min(0).max(1) })).max(24),
  rows: z.array(load).max(14),
  hooke: z.array(z.object({ m: short, W: short, Rl: short, Ru: short, e: short })).max(14),
  osc: z.array(z.object({ m: short, t1: short, t2: short, t: short, T: short, T2: short })).max(14),
  line: phyGraphLineSchema.nullable(),
  answers: z.object({ r0: phyAnswerSchema, slope: phyAnswerSchema, k: phyAnswerSchema }),
  written: z.object({ precautions: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<PhySpringState>;

export const PHY_SPRING: SimulatorSpec = {
  id: 'phy-spring',
  subject: 'Physics',
  title: 'The spiral spring: Hooke’s law and oscillations',
  topicNames: ['Elastic properties of solids', 'Elasticity', "Hooke's law", 'Period, frequency and amplitude of S.H.M.', 'Simple harmonic motion', 'Oscillations'],
  minutes: 45,
  rubric: [
    { id: 'care', label: 'Care with the spring', marks: 2, how: 'AUTO', guide: 'Hooke’s law: the elastic limit never exceeded (1); every reading taken with the spring at rest (1). Oscillations: small displacements (2 cm or less) every time (1); the stopwatch started as the mass passed the fiducial (rest) position (1).' },
    { id: 'procedure', label: 'Procedure', marks: 4, how: 'AUTO', guide: 'Hooke’s law: R₀ read with no load before loading (1); at least five loads (1) up to at least 250 g (1); readings repeated on unloading (1). Oscillations: at least five masses spread over at least 0.25 kg (1); at least 10 oscillations timed each time (1); each timing repeated (1); the elastic limit never exceeded (1).' },
    { id: 'readings', label: 'Table of readings', marks: 5, how: 'AUTO', guide: 'Hooke’s law: pointer readings that match the scale (±0.2 cm) (2); recorded to 1 decimal place in cm (1); W = mg worked out (g = 9.8 or 10 m s⁻²) (1); e = R − R₀ from your readings (1). Oscillations: times that match the stopwatch (±0.05 s) (2); to at least 1 decimal place (1); exactly the stated number of oscillations (1); mean t, T = t/n and T² worked out (1).' },
    { id: 'graph', label: 'Graph', marks: 2, how: 'AUTO', guide: 'e against W (Hooke’s law) or T² against m (oscillations) plotted with a straight line drawn across the points (1); the line is a good best fit (slope within 6 % of the points’ best fit) (1).' },
    { id: 'calculations', label: 'Slope and k', marks: 4, how: 'AUTO', guide: 'The slope read from your own line or points (2); k from your slope — k = 1/slope (Hooke’s law), k = 4π²/slope (oscillations) — with the units converted (1); k within 5 % of the true value (1).' },
    { id: 'units', label: 'Units', marks: 1, how: 'AUTO', guide: 'R₀ in cm; the slope in cm N⁻¹ or m N⁻¹ (Hooke’s law), s² kg⁻¹ (oscillations); k in N m⁻¹.' },
    { id: 'precautions', label: 'Precautions', marks: 2, how: 'AI', guide: 'Two correct precautions (1 mark each), e.g. the pointer read with the eye level with it (no parallax); the spring allowed to come to rest before each reading; readings checked on unloading so the elastic limit is not exceeded; the metre rule clamped vertical; small vertical oscillations without sideways swing; many oscillations timed and repeated; timing from the fiducial (rest) position; the stand kept stable.' },
  ],
};

/** The true answer the task finds: k (N m⁻¹). */
export const springTrueK = (v: PhySpringVariant) => v.k;
/** HOOKE: the true slope of e (cm) against W (N). */
export const springHookeSlopeCmPerN = (v: PhySpringVariant) => 100 / v.k;
export { FOUR_PI2 as SPRING_FOUR_PI2 };
