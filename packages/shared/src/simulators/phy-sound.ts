import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { phyAnswerSchema, phyGraphLineSchema, type PhyAnswer, type PhyGraphLine } from './phy-common';
import { labBetween, labRandom } from './seeded';

/**
 * phy-sound: resonance of air columns and strings with tuning forks. Two tasks:
 *  - TUBE (the resonance tube): a tube closed at the bottom by the water in a
 *    tall jar; its length above the water l is varied. A fork struck on the
 *    rubber pad is held over the mouth; at l + e = λ/4 the air column
 *    resonates and the sound is loudest (first resonance; the second is at
 *    3λ/4). For forks of 256–512 Hz the student finds the first resonance l₁
 *    (and l₂ for 512 Hz). Since l + e = v/(4f), l against 1/f is a straight line
 *    of slope v/4 and intercept −e. Physics: v = 331√(T/273) m s⁻¹ at a seeded
 *    room temperature; end correction e = 0.3d; the driven column's response is
 *    sinh α / √(cos²(k(l + e)) + sinh² α), k = 2πf/v, with a small damping α
 *    (larger for a longer column), so the peak has a real width.
 *  - SONO (the sonometer): a wire over two bridges, its tension T = Mg from a
 *    hanger of masses over a pulley. A paper rider sits on the middle of the
 *    wire; a fork struck on the pad is pressed on the box and the bridges are
 *    moved until the rider is thrown off (the wire's fundamental equals the
 *    fork: f = (1/2l)√(T/μ)). Repeat for four forks at fixed tension; plot f
 *    against 1/l (the lesson): slope = fl = v/2, v = 2 × slope, and μ = T/v².
 *    Physics: seeded μ and quality factor Q; each harmonic n of the wire
 *    responds as a resonance of width f/(2Q); a rider at the middle is moved by
 *    odd harmonics only (the middle is a node for the even ones).
 * Units in the state: lengths in cm, loads in kg, frequencies in Hz.
 */

export const SOUND_TASKS = ['TUBE', 'SONO'] as const;
export type SoundTask = (typeof SOUND_TASKS)[number];

/** The set of tuning forks (nominal frequency stamped on each, Hz). */
export const SOUND_FORKS = [256, 288, 320, 341, 384, 426, 480, 512] as const;
/** The forks on each task's card. */
export const SOUND_CARD: Record<SoundTask, number[]> = { TUBE: [256, 288, 320, 384, 512], SONO: [256, 320, 384, 512] };
/** g in the physics (m s⁻²); students may use 9.8 or 10. */
export const SOUND_G = 9.81;
/** The resonance tube's length above the water can be set between these (cm). */
export const TUBE_MIN = 3;
export const TUBE_MAX = 95;
/** The bridges can be set this far apart (cm). */
export const SONO_MIN = 8;
export const SONO_MAX = 100;
/** Sonometer load: the hanger (kg), each slotted mass (kg), how many. */
export const SONO_HANGER = 1;
export const SONO_STEP = 0.5;
export const SONO_SLOTS = 10;
export const SONO_MAX_LOAD = SONO_HANGER + SONO_STEP * SONO_SLOTS;
/** The load on the task card (kg). */
export const SONO_CARD_LOAD = 4;
/** A struck fork's sound dies away as e^(−t/τ) (s); it still sounds for this long (s). */
export const FORK_TAU = 8;
export const FORK_SOUNDING = 16;
/** The rider is thrown off when the wire's motion at the middle reaches this fraction of its full resonance. */
export const SONO_JUMP = 0.6;
/** Half-power response for the tube's "loudest" band. */
export const TUBE_LOUD = Math.SQRT1_2;

export interface PhySoundVariant {
  seed: number;
  /** Room temperature (°C) and the speed of sound in it (m s⁻¹). */
  tempC: number;
  speed: number;
  /** The tube's internal diameter (cm) and end correction 0.3d (cm). */
  diameter: number;
  endCorr: number;
  /** The air column's damping (at 384 Hz, first resonance). */
  alpha: number;
  /** The forks' true frequencies (Hz), in the order of SOUND_FORKS. */
  forks: number[];
  /** The sonometer wire's mass per unit length (kg m⁻¹) and quality factor. */
  mu: number;
  q: number;
  /** True masses (kg): the hanger, then the slotted masses in the order they go on. */
  hanger: number;
  slots: number[];
}

export function phySoundVariant(seed: number): PhySoundVariant {
  const r = labRandom(seed, 'phy-sound');
  const tempC = labBetween(r, 24, 32, 1);
  const speed = 331 * Math.sqrt((273 + tempC) / 273);
  const diameter = labBetween(r, 2.0, 3.5, 2);
  const alpha = labBetween(r, 0.035, 0.055, 3);
  const forks = SOUND_FORKS.map((f) => f * (1 + labBetween(r, -0.0015, 0.0015, 5)));
  const mu = labBetween(r, 4.0e-4, 7.0e-4, 6);
  const q = labBetween(r, 45, 75, 0);
  const hanger = labBetween(r, 0.996, 1.004, 4);
  const slots = Array.from({ length: SONO_SLOTS }, () => labBetween(r, 0.498, 0.502, 4));
  return { seed, tempC, speed, diameter, endCorr: 0.3 * diameter, alpha, forks, mu, q, hanger, slots };
}

/** The true frequency (Hz) of the fork stamped `nominal`. */
export function soundTrueF(v: PhySoundVariant, nominal: number): number {
  const i = SOUND_FORKS.indexOf(nominal as (typeof SOUND_FORKS)[number]);
  return i >= 0 ? v.forks[i]! : nominal;
}

// ------------------------------------------------------------------ the resonance tube

/** The column's damping at frequency f and length l (cm): wall losses grow with √f and with the column's length. */
function tubeAlpha(v: PhySoundVariant, f: number, l: number): number {
  const quarter = (v.speed * 100) / (4 * f);
  return v.alpha * Math.sqrt(f / 384) * (0.6 + 0.4 * Math.max(0, l + v.endCorr) / quarter);
}
/** The air column's response (0–1, 1 at a resonance) to the fork `nominal` with l cm above the water. */
export function tubeResponse(v: PhySoundVariant, nominal: number, l: number): number {
  const f = soundTrueF(v, nominal);
  const k = (2 * Math.PI * f) / (v.speed * 100);
  const s = Math.sinh(tubeAlpha(v, f, l));
  const c = Math.cos(k * (l + v.endCorr));
  return s / Math.sqrt(c * c + s * s);
}
/** The length (cm) of the n-th resonance (n = 1: first, at λ/4 − e). */
export const tubeResonance = (v: PhySoundVariant, nominal: number, n = 1) => ((2 * n - 1) * v.speed * 100) / (4 * soundTrueF(v, nominal)) - v.endCorr;
/** Half the width (cm) of the n-th resonance's half-power band (how precisely "loudest" can be judged). */
export function tubeHalfWidth(v: PhySoundVariant, nominal: number, n = 1): number {
  const f = soundTrueF(v, nominal);
  const k = (2 * Math.PI * f) / (v.speed * 100);
  return tubeAlpha(v, f, tubeResonance(v, nominal, n)) / k;
}
/** The true slope (v/4, cm s⁻¹) and intercept (−e, cm) of l (cm) against 1/f (s). */
export const tubeLine = (v: PhySoundVariant) => ({ slope: (v.speed * 100) / 4, intercept: -v.endCorr });

// ------------------------------------------------------------------ the sonometer

const loadPieces = (kg: number) => (kg < SONO_HANGER - 1e-9 ? 0 : 1 + Math.max(0, Math.min(SONO_SLOTS, Math.round((kg - SONO_HANGER) / SONO_STEP))));
/** The true mass (kg) on the hanger for a nominal load (kg). */
export function sonoTrueMass(v: PhySoundVariant, kg: number): number {
  const n = loadPieces(kg);
  return n ? v.hanger + v.slots.slice(0, n - 1).reduce((t, x) => t + x, 0) : 0;
}
/** The wire's tension (N) under a nominal load (kg): T = Mg over a frictionless pulley. */
export const sonoTension = (v: PhySoundVariant, kg: number) => sonoTrueMass(v, kg) * SOUND_G;
/** The fundamental (Hz) of l cm of wire between the bridges at tension T (N). */
export const sonoF1 = (v: PhySoundVariant, l: number, T: number) => (T > 0 && l > 0 ? (100 / (2 * l)) * Math.sqrt(T / v.mu) : 0);
/** The length (cm) whose fundamental is the fork's frequency (at load kg). */
export const sonoResonance = (v: PhySoundVariant, nominal: number, kg: number) => (100 / (2 * soundTrueF(v, nominal))) * Math.sqrt(sonoTension(v, kg) / v.mu);
const lorentz = (v: PhySoundVariant, fn: number, f: number) => 1 / Math.sqrt(1 + (2 * v.q * (fn - f) / f) ** 2);
/** How hard the middle of the wire moves (0–1): odd harmonics only, the higher ones weaker. Above SONO_JUMP the rider is thrown off. */
export function sonoRider(v: PhySoundVariant, nominal: number, l: number, kg: number): number {
  const f = soundTrueF(v, nominal);
  const f1 = sonoF1(v, l, sonoTension(v, kg));
  if (!f1) return 0;
  return Math.max(lorentz(v, f1, f), lorentz(v, 3 * f1, f) / 3, lorentz(v, 5 * f1, f) / 5);
}
/** How much the wire adds to the sound from the box (0–1): every harmonic. */
export function sonoLoud(v: PhySoundVariant, nominal: number, l: number, kg: number): number {
  const f = soundTrueF(v, nominal);
  const f1 = sonoF1(v, l, sonoTension(v, kg));
  if (!f1) return 0;
  return Math.max(...[1, 2, 3, 4].map((n) => lorentz(v, n * f1, f) / n));
}
/** Half the width (cm) of the band of lengths where the rider is thrown off (fundamental). */
export const sonoBand = (v: PhySoundVariant, nominal: number, kg: number) => (sonoResonance(v, nominal, kg) * Math.sqrt(1 / SONO_JUMP ** 2 - 1)) / (2 * v.q);
/** The speed of the transverse wave on the wire (m s⁻¹) at load kg: √(T/μ). */
export const sonoWaveSpeed = (v: PhySoundVariant, kg: number) => Math.sqrt(sonoTension(v, kg) / v.mu);

// ------------------------------------------------------------------ the student's work

/** A length taken as the student took it. */
export interface SoundReading {
  /** The fork (nominal Hz). */
  fork: number;
  /** The air column / bridge separation (cm, 2 d.p.). */
  len: number;
  /** SONO: the load on the hanger (kg). */
  load: number;
  /** The fork was still sounding. */
  sounding: boolean;
  /** SONO: the rider had just been thrown off by this fork near this length. */
  jumped: boolean;
}
/** TUBE row: frequency, 1/f, first and second resonance lengths. */
export interface TubeRow {
  f: string;
  inv: string;
  l1: string;
  l2: string;
}
/** SONO row: frequency, vibrating length, 1/l. */
export interface SonoRow {
  f: string;
  l: string;
  inv: string;
}
export type SoundAnswerId = 'slope' | 'v' | 'intercept' | 'e' | 'v2' | 'T' | 'mu';
export const SOUND_ANSWER_IDS: SoundAnswerId[] = ['slope', 'v', 'intercept', 'e', 'v2', 'T', 'mu'];
export interface PhySoundState {
  v: 1;
  task: SoundTask | null;
  /** The fork in hand (nominal Hz), or null. */
  fork: number | null;
  /** TUBE: length of air above the water (cm); SONO: the bridges' separation (cm). */
  len: number;
  /** SONO: the load on the hanger (kg; 0 = no hanger, the wire slack). */
  load: number;
  /** SONO: the paper rider is on the middle of the wire. */
  rider: boolean;
  /** Times a fork was struck on the bench (or glass) instead of the rubber pad. */
  benched: number;
  /** SONO: the last time the rider was thrown off (fork, length cm). */
  jump: { fork: number; len: number } | null;
  /** Every load the wire has carried in a reading (kg). */
  readings: SoundReading[];
  /** The fork (nominal Hz) of each table row. */
  rows: number[];
  tube: TubeRow[];
  sono: SonoRow[];
  line: PhyGraphLine | null;
  answers: Record<SoundAnswerId, PhyAnswer>;
  written: { precautions: string };
  log: { t: number; a: string }[];
}

export const soundDefaultLen = (task: SoundTask | null) => (task === 'SONO' ? 30 : 10);

export function emptyPhySoundState(): PhySoundState {
  const blank = () => ({ value: '', unit: '' });
  return {
    v: 1,
    task: null,
    fork: null,
    len: soundDefaultLen(null),
    load: 0,
    rider: false,
    benched: 0,
    jump: null,
    readings: [],
    rows: [],
    tube: [],
    sono: [],
    line: null,
    answers: { slope: blank(), v: blank(), intercept: blank(), e: blank(), v2: blank(), T: blank(), mu: blank() },
    written: { precautions: '' },
    log: [],
  };
}

const short = z.string().max(40);
const fork = z.number().int().min(100).max(1100);
const len = z.number().min(0).max(SONO_MAX);
const kg = z.number().min(0).max(SONO_MAX_LOAD);
export const phySoundStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(SOUND_TASKS).nullable(),
  fork: fork.nullable(),
  len,
  load: kg,
  rider: z.boolean(),
  benched: z.number().int().min(0).max(1000),
  jump: z.object({ fork, len }).nullable(),
  readings: z.array(z.object({ fork, len, load: kg, sounding: z.boolean(), jumped: z.boolean() })).max(40),
  rows: z.array(fork).max(10),
  tube: z.array(z.object({ f: short, inv: short, l1: short, l2: short })).max(10),
  sono: z.array(z.object({ f: short, l: short, inv: short })).max(10),
  line: phyGraphLineSchema.nullable(),
  answers: z.object({ slope: phyAnswerSchema, v: phyAnswerSchema, intercept: phyAnswerSchema, e: phyAnswerSchema, v2: phyAnswerSchema, T: phyAnswerSchema, mu: phyAnswerSchema }),
  written: z.object({ precautions: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<PhySoundState>;

export const PHY_SOUND: SimulatorSpec = {
  id: 'phy-sound',
  subject: 'Physics',
  title: 'Resonance: the resonance tube and the sonometer',
  topicNames: ['Vibration of air in pipes: open and closed pipes', 'Vibration in strings', 'Resonance', 'Sound waves', 'Speed of sound', 'Stationary waves'],
  minutes: 45,
  rubric: [
    { id: 'care', label: 'Care with the forks', marks: 2, how: 'AUTO', guide: 'Every fork struck on the rubber pad, never on the bench or the glass (1). Resonance tube: every length read while the fork was still sounding (1). Sonometer: the tension kept constant (the same load) for every reading (1).' },
    { id: 'procedure', label: 'Procedure', marks: 4, how: 'AUTO', guide: 'Resonance tube: at least five forks (1) from 256 Hz to 512 Hz (1); the first resonance found each time, not the second (1); the second resonance l₂ found for the 512 Hz fork and v = 2f(l₂ − l₁) worked out (1). Sonometer: at least four forks (1) from 256 Hz to 512 Hz (1); the rider placed on the middle of the wire and thrown off for every length (1); the fundamental each time, not a harmonic (1).' },
    { id: 'readings', label: 'Table of readings', marks: 5, how: 'AUTO', guide: 'Lengths that match the rule (±0.2 cm) (1); at the true resonance — the loudest sound, or the rider thrown off (2); recorded to 0.1 cm (or 0.001 m) (1); 1/f (tube) or 1/l (sonometer) worked out (1).' },
    { id: 'graph', label: 'Graph', marks: 2, how: 'AUTO', guide: 'l against 1/f (tube) or f against 1/l (sonometer) plotted with a straight line drawn across the points (1); the line a good best fit (slope within 6 % of the points’ best fit) (1).' },
    { id: 'calculations', label: 'Slope and deductions', marks: 4, how: 'AUTO', guide: 'Resonance tube: the slope read from your own line or points (1); v = 4 × slope in m s⁻¹ (1); v within 3 % of the true speed of sound at the room temperature (1); e = −(intercept on the l-axis), read from your graph and within 1 cm of the true end correction (1). Sonometer: the slope from your own line or points (1); v = 2 × slope (1); T = Mg and μ = T/v² from your values (1); μ within 8 % of the true value (1).' },
    { id: 'units', label: 'Units', marks: 1, how: 'AUTO', guide: 'Tube: slope in cm s⁻¹ or m s⁻¹, v in m s⁻¹, e in cm. Sonometer: slope in Hz m (m s⁻¹), v in m s⁻¹, T in N, μ in kg m⁻¹.' },
    { id: 'precautions', label: 'Precautions', marks: 2, how: 'AI', guide: 'Two correct precautions (1 mark each), e.g. the fork struck on a rubber pad (not the bench); the fork held just above the mouth, not touching the tube; resonance approached from short lengths and checked by moving back and forth; the tube kept vertical; the tension kept constant; the rider placed at the middle of the vibrating length; the fork’s stem pressed on the box, not touching the wire; the bridges moved slowly; readings repeated; parallax avoided when reading the rule.' },
  ],
};
