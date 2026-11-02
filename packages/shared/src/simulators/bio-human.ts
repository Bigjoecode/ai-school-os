import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { labBetween, labRandom, roundDp } from './seeded';

/**
 * bio-human: WAEC human physiology on a partner (a classmate). The one source
 * of truth for all four tasks: the web shows these readings and the API marks
 * against them.
 *
 * PULSE (pr-bio-pulse-exercise): the partner's radial pulse, felt with two
 * fingertips (never the thumb, which has its own pulse), counted for 15, 30
 * or 60 s. The partner arrives a little out of breath, so the rate settles
 * over the first minutes of sitting quietly (rest 5 minutes first). Step-ups
 * for 1–3 minutes raise the rate towards a seeded peak; after stopping it
 * falls back exponentially (the partner's fitness sets the time constant).
 * The student counts immediately, then every minute until the rate is back
 * to rest, tabulates beats → beats/min, plots pulse against time, works out
 * the % increase and the recovery time.
 *
 * BREATH (pr-bio-exhaled-air): the two-tube apparatus — breathing in draws
 * room air (0.04 % CO₂) through lime water A, breathing out bubbles exhaled
 * air (about 4 % CO₂) through lime water B, which turns milky about 100 times
 * sooner. Breath on a dry mirror mists it and turns cobalt chloride paper
 * pink; breath on a thermometer bulb reads warmer than the room. The resting
 * breathing rate is counted for a minute three times; ventilation = rate ×
 * 500 cm³.
 *
 * REACTION (pr-bio-reaction-time): the knee-jerk (tap below the kneecap with
 * the side of the hand) and the ruler-drop test: the catcher's forearm on the
 * bench edge, finger and thumb at the 0 cm mark; the distance fallen d gives
 * t = √(2d/g). The partner's reaction time is seeded, slower with the
 * non-dominant hand and with eyes closed (the cue is the word "now"), and
 * improves with practice; a drop that is signalled is anticipated.
 *
 * SKIN (pr-bio-skin-two-point): the blindfolded partner is touched with two
 * blunt points at a separation, or with one point as a control, and says
 * "one" or "two". Each area has a seeded two-point threshold (fingertip
 * smallest, back of the neck largest) and the responses follow a smooth
 * psychometric curve, with occasional guesses. The student finds the
 * smallest separation still felt as two on each area, counts correct
 * responses, ranks the areas and relates the threshold to receptor density.
 */

export const HUMAN_TASKS = ['PULSE', 'BREATH', 'REACTION', 'SKIN'] as const;
export type HumanTask = (typeof HUMAN_TASKS)[number];
/** The lessons that open this lab, and the task each one sets. */
export const HUMAN_PRACTICAL_TASKS: Record<string, HumanTask> = { 'pr-bio-pulse-exercise': 'PULSE', 'pr-bio-exhaled-air': 'BREATH', 'pr-bio-reaction-time': 'REACTION', 'pr-bio-skin-two-point': 'SKIN' };
export const HUMAN_TASK_TITLE: Record<HumanTask, string> = { PULSE: 'Effect of exercise on pulse rate', BREATH: 'Comparing inhaled and exhaled air', REACTION: 'Reflex and voluntary actions: reaction time', SKIN: 'Sensitivity of the skin: two-point discrimination' };

/** One observable fact and the keyword groups a written observation must contain (the same shape as the other biology labs' parts). */
export interface HumanPart {
  text: string;
  kw: string[][];
  not?: string[];
}
const P = (text: string, ...kw: string[][]): HumanPart => ({ text, kw });
const Pn = (text: string, not: string[], ...kw: string[][]): HumanPart => ({ text, kw, not });
const norm = (r: () => number) => (r() + r() + r() + r() - 2) * 1.732;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// ================================================================== PULSE

export const PULSE_DURS = [15, 30, 60] as const;
export type PulseDur = (typeof PULSE_DURS)[number];
export const PULSE_CLOCK_MAX = 40;
/** Sit quietly this long before the resting counts (min). */
export const PULSE_MIN_REST = 5;
export const PULSE_EX_MINS = [1, 2, 3] as const;
/** The lesson's exercise: step-ups for 2 minutes. */
export const PULSE_EX_LESSON = 2;
export const PULSE_MAX_COUNTS = 40;
/** "Back to the resting rate": within this many beats/min of it (one beat in a 15 s count). */
export const PULSE_BACK = 4;

export const PULSE_CLAIMS = ['RISES', 'RETURNS', 'O2_GLUCOSE', 'CO2', 'COOL', 'AT_ONCE', 'THUMB'] as const;
export type PulseClaim = (typeof PULSE_CLAIMS)[number];
export const PULSE_CLAIM_LABEL: Record<PulseClaim, string> = {
  RISES: 'The pulse rate rose sharply with exercise',
  RETURNS: 'After exercise it fell gradually back to the resting rate',
  O2_GLUCOSE: 'Active muscles respire faster and need more oxygen and glucose, so the heart beats faster',
  CO2: 'The faster blood flow also removes carbon dioxide from the muscles faster',
  COOL: 'The pulse rises mainly to cool the body',
  AT_ONCE: 'The pulse returned to the resting rate as soon as the exercise stopped',
  THUMB: 'The thumb is the best finger for feeling the pulse',
};
export const PULSE_NEED: PulseClaim[] = ['RISES', 'RETURNS', 'O2_GLUCOSE'];
export const PULSE_WRONG: PulseClaim[] = ['COOL', 'AT_ONCE', 'THUMB'];
export const PULSE_AXES = ['TIME_X', 'TIME_Y'] as const;
export type PulseAxis = (typeof PULSE_AXES)[number];
export const PULSE_AXIS_LABEL: Record<PulseAxis, string> = { TIME_X: 'Time on the x-axis, pulse rate on the y-axis', TIME_Y: 'Pulse rate on the x-axis, time on the y-axis' };
export const PULSE_CURVES = ['SMOOTH', 'RULED'] as const;
export type PulseCurve = (typeof PULSE_CURVES)[number];
export const PULSE_CURVE_LABEL: Record<PulseCurve, string> = { SMOOTH: 'A smooth curve through the points', RULED: 'Ruled straight lines from point to point' };

export interface PulseVariant {
  /** True resting rate (beats/min). */
  rest: number;
  /** Extra beats/min on sitting down (walked in), fading with time constant 1.5 min. */
  walkIn: number;
  /** Rise above rest after long enough step-ups (beats/min). */
  rise: number;
  /** Time constant of the rise during exercise (min). */
  onTau: number;
  /** Time constant of the recovery (min): smaller for a fitter partner. */
  offTau: number;
}
function pickPulse(seed: number): PulseVariant {
  const r = labRandom(seed, 'bio-human-pulse');
  return { rest: labBetween(r, 62, 80, 1), walkIn: labBetween(r, 10, 18, 1), rise: labBetween(r, 50, 66, 1), onTau: labBetween(r, 0.5, 0.75, 2), offTau: labBetween(r, 1.35, 2.15, 2) };
}

export interface PulseCount {
  /** Clock when the count started (min after the partner sat down). */
  at: number;
  dur: PulseDur;
  /** Felt with the thumb (it has its own pulse). */
  thumb: boolean;
}
export interface PulseRow {
  beats: string;
  bpm: string;
}
export interface PulseWork {
  /** Asked the partner about asthma, heart or sickle-cell conditions before the exercise. */
  screened: boolean;
  /** Time-lapse clock (min since the partner sat down). */
  clock: number;
  exercise: { at: number; min: number } | null;
  counts: PulseCount[];
  /** One row per count (same order). */
  rows: PulseRow[];
  restMean: string;
  increase: string;
  recovery: string;
  axis: PulseAxis | null;
  curve: PulseCurve | null;
  claims: PulseClaim[];
}

export const pulseExEnd = (w: Pick<PulseWork, 'exercise'>) => (w.exercise ? w.exercise.at + w.exercise.min : null);
/** The partner's heart rate at time t (beats/min). */
export function pulseRate(v: PulseVariant, w: Pick<PulseWork, 'exercise'>, t: number): number {
  let hr = v.rest + v.walkIn * Math.exp(-t / 1.5);
  const ex = w.exercise;
  if (ex && t > ex.at) {
    const inEx = Math.min(t, ex.at + ex.min) - ex.at;
    const top = v.rise * (1 - Math.exp(-inEx / v.onTau));
    hr += t <= ex.at + ex.min ? top : top * Math.exp(-(t - ex.at - ex.min) / v.offTau);
  }
  return hr;
}
/** The beats counted in a count (an integer: the true beats in the window, with the moment of starting and an occasional miscount; the thumb adds its own pulse). */
export function pulseCountShown(v: PulseVariant, w: Pick<PulseWork, 'exercise'>, c: PulseCount, n: number, seed: number): number {
  const r = labRandom(seed, `bio-human-pulse-count-${n}`);
  const span = c.dur / 60;
  let beats = 0;
  const k = 12;
  for (let i = 0; i < k; i++) beats += (pulseRate(v, w, c.at + ((i + 0.5) * span) / k) * span) / k;
  beats += norm(r) * 1.1 * span;
  let shown = Math.floor(beats + r());
  const m = r();
  if (m < 0.07) shown -= 1;
  else if (m > 0.95) shown += 1;
  if (c.thumb) shown += 1 + Math.round(Math.abs(norm(r)) * 2.2);
  return Math.max(0, shown);
}
export const pulseBpm = (beats: number, dur: PulseDur) => beats * (60 / dur);
export const emptyPulseRow = (): PulseRow => ({ beats: '', bpm: '' });
/** The counts with what they showed: resting (before the exercise) and recovery (after it, with minutes since stopping). */
export function pulseSeen(v: PulseVariant, w: Pick<PulseWork, 'exercise' | 'counts'>, seed: number) {
  const end = pulseExEnd(w);
  return w.counts.map((c, n) => {
    const beats = pulseCountShown(v, w, c, n, seed);
    const after = end !== null && c.at >= end - 1e-9 ? roundDp(c.at - end, 2) : null;
    return { n, c, beats, bpm: pulseBpm(beats, c.dur), rest: end === null || c.at + c.dur / 60 <= (w.exercise?.at ?? Infinity) + 1e-9, settled: c.at >= PULSE_MIN_REST - 1e-9, after };
  });
}
/** The resting counts to average: those after 5 minutes' rest (else all the resting counts). */
export function pulseRestSet<T extends { rest: boolean; settled: boolean }>(seen: T[]): T[] {
  const rest = seen.filter((x) => x.rest);
  const settled = rest.filter((x) => x.settled);
  return settled.length ? settled : rest;
}
/** Recovery time from these readings: minutes after stopping of the first reading back within PULSE_BACK of the resting mean (null: never). */
export function pulseRecoveryFrom(pts: { after: number; bpm: number }[], restMean: number): number | null {
  const back = [...pts].sort((a, b) => a.after - b.after).find((p) => p.after > 0.01 && p.bpm <= restMean + PULSE_BACK + 1e-9);
  return back ? back.after : null;
}

// ================================================================== BREATH

export const BREATH_BATCH = 5;
/** Gentle breaths needed through the apparatus (the lesson: about 10). */
export const BREATH_MIN = 8;
export const BREATH_MAX = 60;
export const BREATH_TIDAL = 500;
/** CO₂ in inhaled and exhaled air (%). */
export const CO2_IN = 0.04;
export const CO2_OUT = 4;
export const BREATH_MAX_COUNTS = 6;

export const BREATH_CLAIMS = ['CO2_MORE', 'WATER_MORE', 'WARMER', 'O2_LEFT', 'RESPIRATION', 'NO_O2', 'CO2_LESS', 'COOLER'] as const;
export type BreathClaim = (typeof BREATH_CLAIMS)[number];
export const BREATH_CLAIM_LABEL: Record<BreathClaim, string> = {
  CO2_MORE: 'Exhaled air contains more carbon dioxide than inhaled air',
  WATER_MORE: 'Exhaled air contains more water vapour',
  WARMER: 'Exhaled air is warmer than inhaled air',
  O2_LEFT: 'Exhaled air still contains oxygen (about 16 %)',
  RESPIRATION: 'The extra carbon dioxide comes from tissue respiration',
  NO_O2: 'Exhaled air contains no oxygen',
  CO2_LESS: 'Exhaled air contains less carbon dioxide',
  COOLER: 'Exhaled air is cooler than room air',
};
export const BREATH_NEED: BreathClaim[] = ['CO2_MORE', 'WATER_MORE', 'WARMER', 'O2_LEFT'];
export const BREATH_WRONG: BreathClaim[] = ['NO_O2', 'CO2_LESS', 'COOLER'];

export interface BreathVariant {
  /** Breaths for lime water B (exhaled air) to turn milky. */
  kB: number;
  /** The same for lime water A (inhaled air): about 100 times as many. */
  kA: number;
  /** Room temperature (°C). */
  room: number;
  /** A thermometer bulb breathed on (°C). */
  breath: number;
  /** Resting breathing rate (breaths/min). */
  rate: number;
  /** The mirror had a little condensation on it before it was wiped. */
  damp: boolean;
}
function pickBreath(seed: number): BreathVariant {
  const r = labRandom(seed, 'bio-human-breath');
  const kB = labBetween(r, 4, 7, 1);
  return { kB, kA: roundDp(kB * labBetween(r, 80, 120, 0), 1), room: labBetween(r, 25.5, 30.5, 1), breath: labBetween(r, 33.5, 35.5, 1), rate: labBetween(r, 13, 19, 1), damp: r() < 0.6 };
}
export interface BreathWork {
  /** A clean mouthpiece fitted. */
  mouthpiece: boolean;
  /** Lime water poured into both tubes: equal volumes, or roughly. */
  lime: 'EQUAL' | 'UNEQUAL' | null;
  /** Batches of breaths through the apparatus (hard: blowing and sucking hard). */
  breaths: { n: number; hard: boolean }[];
  firstMilky: 'A' | 'B' | null;
  obsA: string;
  obsB: string;
  /** The mirror wiped dry, breathed on (and whether it was dry then), tested with cobalt chloride paper. */
  wiped: boolean;
  breathed: boolean;
  wipedFirst: boolean;
  cobalt: boolean;
  mirrorObs: string;
  /** The room temperature read before or after breathing on the bulb; the bulb breathed on. */
  troom: 'BEFORE' | 'AFTER' | null;
  tbreath: boolean;
  roomT: string;
  breathT: string;
  rise: string;
  /** One-minute counts of the partner's breaths at rest. */
  counts: number;
  rows: string[];
  meanRate: string;
  vent: string;
  ratio: string;
  claims: BreathClaim[];
}
export const breathTotal = (w: Pick<BreathWork, 'breaths'>) => w.breaths.reduce((a, b) => a + b.n, 0);
/** How milky a tube is (0 clear … 1 very milky); milky from 0.5. */
export function limeTurbidity(v: BreathVariant, w: Pick<BreathWork, 'breaths' | 'lime'>, tube: 'A' | 'B'): number {
  if (!w.lime) return 0;
  const n = breathTotal(w);
  return 1 - Math.exp((-n * Math.LN2) / (tube === 'A' ? v.kA : v.kB));
}
/** The thermometer readings as shown (°C, to 0.5 °C). */
export const breathRoomShown = (v: BreathVariant, w: Pick<BreathWork, 'troom'>) => (w.troom === null ? null : Math.round((v.room + (w.troom === 'AFTER' ? 1.5 : 0)) * 2) / 2);
export const breathBulbShown = (v: BreathVariant, w: Pick<BreathWork, 'tbreath'>) => (w.tbreath ? Math.round(v.breath * 2) / 2 : null);
/** One-minute count n of the partner's breaths. */
export function breathCountShown(v: BreathVariant, n: number, seed: number): number {
  const r = labRandom(seed, `bio-human-breath-count-${n}`);
  return Math.max(8, Math.round(v.rate + norm(r) * 0.9));
}
/** Whether cobalt chloride paper on the mirror turns pink. */
export const cobaltPink = (v: BreathVariant, w: Pick<BreathWork, 'breathed' | 'wiped'>) => w.breathed || (!w.wiped && v.damp);
export function limeParts(v: BreathVariant, w: Pick<BreathWork, 'breaths' | 'lime'>, tube: 'A' | 'B'): HumanPart[] {
  const t = limeTurbidity(v, w, tube);
  const MILKY = ['milky', 'cloudy', 'white', 'chalky', 'turbid', 'precipitate'];
  if (t >= 0.5) return [Pn(tube === 'B' ? 'the lime water turns milky (a white precipitate) quickly' : 'the lime water turns milky', ['stays clear', 'remains clear', 'no change', 'not milky', 'did not'], MILKY)];
  if (t >= 0.2) return [P('the lime water goes only slightly cloudy', ['slight', 'little', 'faint', 'slowly', 'bit'], MILKY)];
  return [Pn('the lime water stays clear (no change)', ['turns milky', 'turned milky', 'became milky', 'goes milky'], ['clear', 'no change', 'unchanged', 'colourless', 'not milky', 'did not'])];
}
export function mirrorParts(v: BreathVariant, w: Pick<BreathWork, 'breathed' | 'wiped' | 'cobalt'>): HumanPart[] {
  const out: HumanPart[] = [];
  if (w.breathed) out.push(P('a mist (water droplets) forms on the mirror', ['mist', 'condens', 'droplet', 'moist', 'fog', 'water', 'wet', 'steam']));
  if (w.cobalt) out.push(cobaltPink(v, w) ? Pn('the cobalt chloride paper turns from blue to pink', ['stays blue', 'remains blue'], ['pink']) : P('the cobalt chloride paper stays blue', ['blue', 'no change']));
  return out;
}

// ================================================================== REACTION

export const REACT_CONDS = ['DOM', 'NONDOM', 'EYES'] as const;
export type ReactCond = (typeof REACT_CONDS)[number];
export const REACT_COND_LABEL: Record<ReactCond, string> = { DOM: 'Dominant hand, eyes open', NONDOM: 'Non-dominant hand, eyes open', EYES: 'Dominant hand, eyes closed (you say “now” as you drop it)' };
export const REACT_COND_SHORT: Record<ReactCond, string> = { DOM: 'Dominant hand', NONDOM: 'Non-dominant hand', EYES: 'Eyes closed' };
export const REACT_G = 9.8;
/** Drops of the dominant hand (the lesson: ten) and of each other condition. */
export const REACT_MIN_DOM = 10;
export const REACT_MIN_OTHER = 5;
export const REACT_MAX_PER = 12;
/** The metre rule is read at the top of the thumb to the nearest 0.5 cm. */
export const REACT_READ = 0.5;
export const reactTime = (dCm: number) => Math.sqrt((2 * (dCm / 100)) / REACT_G);

export const REACT_CLAIMS = ['VOLUNTARY', 'REFLEX_SPINAL', 'CATCH_REFLEX', 'KNEE_VOLUNTARY', 'LONGER_FASTER'] as const;
export type ReactClaim = (typeof REACT_CLAIMS)[number];
export const REACT_CLAIM_LABEL: Record<ReactClaim, string> = {
  VOLUNTARY: 'Catching the ruler is a voluntary action: the brain decides and sends the impulse',
  REFLEX_SPINAL: 'The knee-jerk is a simple reflex coordinated by the spinal cord, without thinking',
  CATCH_REFLEX: 'Catching the ruler is a reflex action',
  KNEE_VOLUNTARY: 'The knee-jerk is a voluntary action',
  LONGER_FASTER: 'A longer catch distance means a faster reaction',
};
export const REACT_NEED: ReactClaim[] = ['VOLUNTARY', 'REFLEX_SPINAL'];
export const REACT_WRONG: ReactClaim[] = ['CATCH_REFLEX', 'KNEE_VOLUNTARY', 'LONGER_FASTER'];
export const REACT_FASTER = ['DOM', 'NONDOM', 'SAME'] as const;
export type ReactFaster = (typeof REACT_FASTER)[number];
export const REACT_TREND = ['SHORTER', 'LONGER', 'SAME'] as const;
export type ReactTrend = (typeof REACT_TREND)[number];

export interface ReactVariant {
  /** Reaction time, dominant hand, before practice (s). */
  tDom: number;
  nondomExtra: number;
  eyesExtra: number;
  /** Fraction the time falls with practice, and over how many drops. */
  practice: number;
  practiceTau: number;
  /** Trial-to-trial spread (s). */
  sd: number;
}
function pickReact(seed: number): ReactVariant {
  const r = labRandom(seed, 'bio-human-react');
  return { tDom: labBetween(r, 0.175, 0.215, 3), nondomExtra: labBetween(r, 0.018, 0.035, 3), eyesExtra: labBetween(r, 0.02, 0.04, 3), practice: labBetween(r, 0.12, 0.17, 3), practiceTau: labBetween(r, 2.5, 3.5, 2), sd: labBetween(r, 0.007, 0.01, 4) };
}
export interface ReactDrop {
  cond: ReactCond;
  /** Signalled ("ready… go"): the catcher anticipates. */
  warn: boolean;
}
export interface ReactRow {
  ds: string[];
  mean: string;
  m: string;
  t: string;
}
export interface ReactWork {
  /** How the knee was tapped: the side of the hand, or a hard object. */
  knee: 'HAND' | 'HARD' | null;
  kneeObs: string;
  /** The catcher's forearm rests on the bench edge; finger and thumb level with the 0 cm mark. */
  arm: boolean;
  zero: boolean;
  drops: ReactDrop[];
  /** One row per condition (REACT_CONDS order); `ds` follows that condition's drops. */
  rows: ReactRow[];
  faster: ReactFaster | null;
  trend: ReactTrend | null;
  eyes: 'SLOWER' | 'FASTER' | 'SAME' | null;
  claims: ReactClaim[];
}
/** What the rule showed at the top of the thumb for drop n (cm, to 0.5 cm). */
export function reactDropShown(v: ReactVariant, w: Pick<ReactWork, 'drops' | 'arm' | 'zero'>, n: number, seed: number): number {
  const d = w.drops[n]!;
  const r = labRandom(seed, `bio-human-react-drop-${n}`);
  const k = w.drops.slice(0, n).filter((x) => x.cond === d.cond && !x.warn).length;
  const base = v.tDom + (d.cond === 'NONDOM' ? v.nondomExtra : d.cond === 'EYES' ? v.eyesExtra : 0);
  let t = base * (1 - v.practice * (1 - Math.exp(-k / v.practiceTau))) + norm(r) * v.sd;
  if (d.warn) t = 0.035 + r() * 0.045;
  let cm = 0.5 * REACT_G * t * t * 100;
  if (!w.arm) cm -= 2.5 + r() * 2; // the hand drops to meet the rule
  if (!w.zero) cm += 3; // fingers started above the 0 cm mark
  return Math.max(0.5, Math.min(99.5, Math.round(cm / REACT_READ) * REACT_READ));
}
/** Each condition's drops with what the rule showed. */
export function reactSeen(v: ReactVariant, w: Pick<ReactWork, 'drops' | 'arm' | 'zero'>, seed: number): Record<ReactCond, number[]> {
  const out: Record<ReactCond, number[]> = { DOM: [], NONDOM: [], EYES: [] };
  w.drops.forEach((d, n) => out[d.cond].push(reactDropShown(v, w, n, seed)));
  return out;
}
export const emptyReactRow = (): ReactRow => ({ ds: [], mean: '', m: '', t: '' });
/** The trend with practice in these distances: the mean of the first three against the last three. */
export function reactTrendOf(ds: number[]): ReactTrend | null {
  if (ds.length < 6) return null;
  const a = mean(ds.slice(0, 3));
  const b = mean(ds.slice(-3));
  return Math.abs(a - b) < 0.5 ? 'SAME' : b < a ? 'SHORTER' : 'LONGER';
}
export const kneeParts = (w: Pick<ReactWork, 'knee'>): HumanPart[] => (w.knee ? [P('the lower leg kicks forward at once, automatically', ['kick', 'jerk', 'swing', 'move', 'rais', 'lift', 'straighten', 'forward', 'up']), P('without the partner thinking about it', ['automatic', 'without thinking', 'involuntar', 'immediate', 'at once', 'quick', 'sudden', 'instant', 'reflex', 'cannot stop', 'not control'])] : []);

// ================================================================== SKIN

export const SKIN_AREAS = ['FINGERTIP', 'PALM', 'BACK_HAND', 'FOREARM', 'NECK'] as const;
export type SkinArea = (typeof SKIN_AREAS)[number];
export const SKIN_AREA_LABEL: Record<SkinArea, string> = { FINGERTIP: 'Fingertip', PALM: 'Palm', BACK_HAND: 'Back of the hand', FOREARM: 'Forearm', NECK: 'Back of the neck' };
export const SKIN_MAX_SEP = 60;
export const SKIN_MAX_TRIALS = 200;
export const SKIN_CLAIMS = ['DENSITY', 'NOT_NONE', 'CONTROL', 'FOREARM_NONE', 'BIGGER_MORE', 'PAIN_ONLY'] as const;
export type SkinClaim = (typeof SKIN_CLAIMS)[number];
export const SKIN_CLAIM_LABEL: Record<SkinClaim, string> = {
  DENSITY: 'A smaller separation means the touch receptors are closer together (more per unit area)',
  NOT_NONE: 'The forearm and neck have touch receptors too, but fewer and further apart',
  CONTROL: 'The single-point touches check that the subject is not guessing',
  FOREARM_NONE: 'The forearm has no touch receptors',
  BIGGER_MORE: 'A bigger separation means more receptors',
  PAIN_ONLY: 'The skin only has pain receptors',
};
export const SKIN_NEED: SkinClaim[] = ['DENSITY', 'NOT_NONE', 'CONTROL'];
export const SKIN_WRONG: SkinClaim[] = ['FOREARM_NONE', 'BIGGER_MORE', 'PAIN_ONLY'];

export interface SkinVariant {
  /** True two-point threshold of each area (mm). */
  thr: Record<SkinArea, number>;
  /** Chance of saying "two" to a single point (guessing). */
  guess: number;
}
function pickSkin(seed: number): SkinVariant {
  const r = labRandom(seed, 'bio-human-skin');
  return { thr: { FINGERTIP: labBetween(r, 2.2, 4, 1), PALM: labBetween(r, 8, 13, 1), BACK_HAND: labBetween(r, 18, 27, 1), FOREARM: labBetween(r, 32, 44, 1), NECK: labBetween(r, 36, 47, 1) }, guess: labBetween(r, 0.03, 0.08, 3) };
}
export interface SkinTrial {
  area: SkinArea;
  /** Separation of the points (mm); 0: a single point. */
  sep: number;
  /** The subject was blindfolded. */
  blind: boolean;
  /** One point touched slightly after the other (not together). */
  stag: boolean;
}
export interface SkinRow {
  thr: string;
  n: string;
  ok: string;
  pct: string;
}
export interface SkinWork {
  blind: boolean;
  /** The points wiped with alcohol before starting. */
  cleaned: boolean;
  /** Both points pressed together (otherwise one lands slightly after the other). */
  together: boolean;
  trials: SkinTrial[];
  /** One row per area (SKIN_AREAS order). */
  rows: SkinRow[];
  bars: SkinArea[];
  /** Areas from the most to the least sensitive. */
  rank: SkinArea[];
  /** Forearm threshold ÷ fingertip threshold. */
  ratio: string;
  most: SkinArea | null;
  claims: SkinClaim[];
}
/** The chance the subject says "two" for a touch. */
export function skinPTwo(v: SkinVariant, t: SkinTrial): number {
  if (!t.blind) return t.sep > 0 ? 1 : 0;
  if (t.sep <= 0) return v.guess;
  if (t.stag) return 0.9;
  const th = v.thr[t.area];
  const wd = 0.07 * th + 0.3;
  // Guesses below the threshold; only rare lapses above it.
  return v.guess + (1 - v.guess - 0.015) / (1 + Math.exp(-(t.sep - th) / wd));
}
/** What the subject said for trial n. */
export function skinResponse(v: SkinVariant, w: Pick<SkinWork, 'trials'>, n: number, seed: number): 'ONE' | 'TWO' {
  const r = labRandom(seed, `bio-human-skin-${n}`);
  return r() < skinPTwo(v, w.trials[n]!) ? 'TWO' : 'ONE';
}
export interface SkinAreaSeen {
  area: SkinArea;
  n: number;
  ok: number;
  singles: number;
  /** Separations tested with the majority answer at each. */
  seps: { sep: number; two: number; all: number }[];
  /** The smallest separation from which every larger one tested was felt as two (null: none). */
  thr: number | null;
}
export function skinSeen(v: SkinVariant, w: Pick<SkinWork, 'trials'>, seed: number): Record<SkinArea, SkinAreaSeen> {
  const out = Object.fromEntries(SKIN_AREAS.map((a) => [a, { area: a, n: 0, ok: 0, singles: 0, seps: [], thr: null } as SkinAreaSeen])) as Record<SkinArea, SkinAreaSeen>;
  w.trials.forEach((t, n) => {
    const e = out[t.area];
    const said = skinResponse(v, w, n, seed);
    e.n++;
    if ((t.sep > 0) === (said === 'TWO')) e.ok++;
    if (t.sep <= 0) {
      e.singles++;
      return;
    }
    let s = e.seps.find((x) => x.sep === t.sep);
    if (!s) e.seps.push((s = { sep: t.sep, two: 0, all: 0 }));
    s.all++;
    if (said === 'TWO') s.two++;
  });
  for (const a of SKIN_AREAS) {
    const e = out[a];
    e.seps.sort((x, y) => y.sep - x.sep);
    let thr: number | null = null;
    for (const s of e.seps) {
      if (s.two * 2 >= s.all) thr = s.sep;
      else break;
    }
    e.thr = thr;
  }
  return out;
}
/** The tolerance on a threshold read from the data (mm). */
export const skinTol = (thr: number) => Math.max(1, 0.1 * thr);
/** The step allowed just below the threshold when narrowing it down (mm): 1 mm on sensitive skin. */
export const skinStep = (thr: number) => Math.max(1, Math.round(0.12 * thr));

// ================================================================== variant, state, spec

export interface BioHumanVariant {
  seed: number;
  task: HumanTask;
  pulse: PulseVariant;
  breath: BreathVariant;
  react: ReactVariant;
  skin: SkinVariant;
}
/** The hidden truth of one attempt (same on the web and the API). */
export function bioHumanVariant(seed: number, task: HumanTask): BioHumanVariant {
  return { seed, task, pulse: pickPulse(seed), breath: pickBreath(seed), react: pickReact(seed), skin: pickSkin(seed) };
}

export interface BioHumanState {
  v: 1;
  task: HumanTask | null;
  pulse: PulseWork;
  breath: BreathWork;
  react: ReactWork;
  skin: SkinWork;
  written: { precautions: string; explain: string };
  log: { t: number; a: string }[];
}
export const emptySkinRow = (): SkinRow => ({ thr: '', n: '', ok: '', pct: '' });
export function emptyBioHumanState(): BioHumanState {
  return {
    v: 1,
    task: null,
    pulse: { screened: false, clock: 0, exercise: null, counts: [], rows: [], restMean: '', increase: '', recovery: '', axis: null, curve: null, claims: [] },
    breath: { mouthpiece: false, lime: null, breaths: [], firstMilky: null, obsA: '', obsB: '', wiped: false, breathed: false, wipedFirst: false, cobalt: false, mirrorObs: '', troom: null, tbreath: false, roomT: '', breathT: '', rise: '', counts: 0, rows: [], meanRate: '', vent: '', ratio: '', claims: [] },
    react: { knee: null, kneeObs: '', arm: false, zero: false, drops: [], rows: REACT_CONDS.map(() => emptyReactRow()), faster: null, trend: null, eyes: null, claims: [] },
    skin: { blind: false, cleaned: false, together: true, trials: [], rows: SKIN_AREAS.map(() => emptySkinRow()), bars: [], rank: [], ratio: '', most: null, claims: [] },
    written: { precautions: '', explain: '' },
    log: [],
  };
}

const short = z.string().max(40);
const text = z.string().max(600);
const clockN = (max: number) => z.number().min(0).max(max);
export const bioHumanStateSchema = z.object({
  v: z.literal(1),
  task: z.enum(HUMAN_TASKS).nullable(),
  pulse: z.object({
    screened: z.boolean(),
    clock: clockN(PULSE_CLOCK_MAX),
    exercise: z.object({ at: clockN(PULSE_CLOCK_MAX), min: z.number().refine((x) => (PULSE_EX_MINS as readonly number[]).includes(x), 'not an exercise time') }).nullable(),
    counts: z.array(z.object({ at: clockN(PULSE_CLOCK_MAX), dur: z.union([z.literal(15), z.literal(30), z.literal(60)]), thumb: z.boolean() })).max(PULSE_MAX_COUNTS),
    rows: z.array(z.object({ beats: short, bpm: short })).max(PULSE_MAX_COUNTS),
    restMean: short,
    increase: short,
    recovery: short,
    axis: z.enum(PULSE_AXES).nullable(),
    curve: z.enum(PULSE_CURVES).nullable(),
    claims: z.array(z.enum(PULSE_CLAIMS)).max(PULSE_CLAIMS.length),
  }),
  breath: z.object({
    mouthpiece: z.boolean(),
    lime: z.enum(['EQUAL', 'UNEQUAL']).nullable(),
    breaths: z.array(z.object({ n: z.number().int().min(1).max(BREATH_BATCH * 2), hard: z.boolean() })).max(BREATH_MAX),
    firstMilky: z.enum(['A', 'B']).nullable(),
    obsA: text,
    obsB: text,
    wiped: z.boolean(),
    breathed: z.boolean(),
    wipedFirst: z.boolean(),
    cobalt: z.boolean(),
    mirrorObs: text,
    troom: z.enum(['BEFORE', 'AFTER']).nullable(),
    tbreath: z.boolean(),
    roomT: short,
    breathT: short,
    rise: short,
    counts: z.number().int().min(0).max(BREATH_MAX_COUNTS),
    rows: z.array(short).max(BREATH_MAX_COUNTS),
    meanRate: short,
    vent: short,
    ratio: short,
    claims: z.array(z.enum(BREATH_CLAIMS)).max(BREATH_CLAIMS.length),
  }),
  react: z.object({
    knee: z.enum(['HAND', 'HARD']).nullable(),
    kneeObs: text,
    arm: z.boolean(),
    zero: z.boolean(),
    drops: z.array(z.object({ cond: z.enum(REACT_CONDS), warn: z.boolean() })).max(REACT_MAX_PER * REACT_CONDS.length),
    rows: z.array(z.object({ ds: z.array(short).max(REACT_MAX_PER), mean: short, m: short, t: short })).length(REACT_CONDS.length),
    faster: z.enum(REACT_FASTER).nullable(),
    trend: z.enum(REACT_TREND).nullable(),
    eyes: z.enum(['SLOWER', 'FASTER', 'SAME']).nullable(),
    claims: z.array(z.enum(REACT_CLAIMS)).max(REACT_CLAIMS.length),
  }),
  skin: z.object({
    blind: z.boolean(),
    cleaned: z.boolean(),
    together: z.boolean(),
    trials: z.array(z.object({ area: z.enum(SKIN_AREAS), sep: z.number().int().min(0).max(SKIN_MAX_SEP), blind: z.boolean(), stag: z.boolean() })).max(SKIN_MAX_TRIALS),
    rows: z.array(z.object({ thr: short, n: short, ok: short, pct: short })).length(SKIN_AREAS.length),
    bars: z.array(z.enum(SKIN_AREAS)).max(SKIN_AREAS.length),
    rank: z.array(z.enum(SKIN_AREAS)).max(SKIN_AREAS.length),
    ratio: short,
    most: z.enum(SKIN_AREAS).nullable(),
    claims: z.array(z.enum(SKIN_CLAIMS)).max(SKIN_CLAIMS.length),
  }),
  written: z.object({ precautions: z.string().max(2000), explain: z.string().max(2000) }),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<BioHumanState>;

export const BIO_HUMAN: SimulatorSpec = {
  id: 'bio-human',
  subject: 'Biology',
  title: 'Human physiology on a partner',
  topicNames: ['Transport in animals', 'Respiratory System', 'Types of nervous actions', 'Skin (sense organ)', 'Nervous coordination', 'Circulatory system', 'Respiration'],
  minutes: 45,
  rubric: [
    {
      id: 'procedure',
      label: 'Procedure',
      marks: 4,
      how: 'AUTO',
      guide:
        'Pulse: the partner asked about asthma, heart or sickle-cell conditions and rested 5 minutes before the resting counts (1); the pulse felt with two fingertips, never the thumb (1); three resting counts and 2 minutes of step-ups (1); the first count immediately after stopping, then every minute until back to rest (1). Exhaled air: a clean mouthpiece and equal volumes of lime water (1); at least 8 gentle breaths, never blowing or sucking hard (1); the mirror wiped dry before breathing on it, then cobalt chloride paper (1); the room temperature read before breathing on the bulb, and three one-minute breathing counts (1). Reaction time: the knee tapped gently with the side of the hand (1); the forearm on the bench edge with the fingers at 0 cm (1); ten unsignalled drops with the dominant hand (1); five with the non-dominant hand (1). Skin: the subject blindfolded, both points pressed together (1); single-point checks on every area (1); all five areas (1); narrowed down to within 1 mm (or 12 %) below each threshold (1).',
    },
    { id: 'readings', label: 'Readings', marks: 4, how: 'AUTO', guide: 'Pulse: every count as you counted it — the resting counts and the recovery counts. Exhaled air: the two thermometer readings (2) and the breathing counts (2). Reaction time: each distance as the rule showed it, to 0.5 cm. Skin: the smallest separation felt as two on each area, from your own trials (2.5), and the touches and correct answers on each area (1.5).' },
    { id: 'presentation', label: 'Table and graph', marks: 3, how: 'AUTO', guide: 'Pulse: beats/min = count × 60 ÷ seconds counted (1); time on the x-axis (1) and a smooth curve through at least five points (1). Exhaled air: the mean breathing rate (1); ventilation = rate × 500 cm³ (1); the temperature rise and 4 ÷ 0.04 = 100 (1). Reaction time: the mean distance of each condition (1) and t = √(2d/g) with d in metres (2). Skin: % correct = correct ÷ touches × 100 (1); a bar chart of the thresholds (1); the areas ranked from your own thresholds (1).' },
    { id: 'results', label: 'Results and conclusions', marks: 5, how: 'AUTO', guide: 'Pulse: the mean resting rate (1); the % increase (1) and the recovery time (1) from your own readings; the conclusions (2). Exhaled air: which tube turned milky first (1); what each lime water did (1); the mirror and cobalt chloride paper (1); the conclusions (2). Reaction time: the knee-jerk observation (1); which hand was faster (1) and the effect of practice (1) from your own data; reflex and voluntary (2). Skin: forearm ÷ fingertip from your own thresholds (1); the most sensitive area (1); the conclusions about receptor density and the controls (3).' },
    { id: 'precautions', label: 'Precautions', marks: 2, how: 'AI', guide: 'Two correct precautions (1 mark each). Pulse: rest before the resting count; fingertips not the thumb; count immediately after exercise; the same exercise intensity; repeat and average. Exhaled air: breathe gently; equal volumes of lime water; the same number of breaths; a clean mouthpiece; wipe the mirror dry first. Reaction time: the same starting position; drop without warning; many readings averaged; read at the same part of the thumb. Skin: blindfold the subject; press both points together with the same light pressure; include random single-point touches; clean the points with alcohol.' },
    { id: 'explanation', label: 'Explanation', marks: 2, how: 'AI', guide: 'Pulse: active muscles respire faster and need more oxygen and glucose and must lose carbon dioxide, so the heart beats faster; afterwards it falls gradually as the oxygen debt is repaid. Exhaled air: tissue respiration adds carbon dioxide, water vapour and heat; carbon dioxide turns lime water milky (calcium carbonate). Reaction time: catching is voluntary (eye → sensory neurone → brain → motor neurone → muscle) and takes longer than the knee-jerk, a spinal reflex arc (receptor, sensory, relay, motor neurone, effector). Skin: where receptors are close together two points stimulate two separate receptors and are felt as two; where they are far apart both points fall on one receptor field.' },
  ],
};

// ================================================================== model answers (the worked solution, the demo and the tests)

const fx = (x: number, dp: number) => String(roundDp(x, dp));

/** Ideal pulse records for a state: beats and beats/min as counted, the resting mean, increase, recovery and the graph. */
export function pulseIdealRecords(v: BioHumanVariant, s: BioHumanState): PulseWork {
  const w = s.pulse;
  const seen = pulseSeen(v.pulse, w, v.seed);
  const rows = seen.map((x) => ({ beats: String(x.beats), bpm: fx(x.bpm, 1) }));
  const rm = roundDp(mean(pulseRestSet(seen).map((x) => x.bpm)), 1);
  const rec = seen.filter((x) => x.after !== null);
  const peak = rec.find((x) => (x.after ?? 9) < 0.3);
  const recovery = pulseRecoveryFrom(rec.map((x) => ({ after: x.after!, bpm: x.bpm })), rm);
  return { ...w, rows, restMean: seen.some((x) => x.rest) ? String(rm) : '', increase: peak && rm ? fx(((peak.bpm - rm) / rm) * 100, 1) : '', recovery: recovery === null ? '' : String(roundDp(recovery, 1)), axis: 'TIME_X', curve: 'SMOOTH', claims: [...PULSE_NEED, 'CO2'] };
}
/** A model pulse run: screened, rest 5 min, three 15 s counts, 2 min step-ups, counts at once and every minute for 8 minutes. */
export function pulseModelState(v: BioHumanVariant, after = 8): BioHumanState {
  const s = emptyBioHumanState();
  s.task = 'PULSE';
  const w = s.pulse;
  w.screened = true;
  let clock = 5;
  for (let k = 0; k < 3; k++) {
    w.counts.push({ at: clock, dur: 15, thumb: false });
    clock = roundDp(clock + 0.5, 2);
  }
  w.exercise = { at: clock, min: 2 };
  const end = clock + 2;
  // Every minute for at least `after` minutes, and on until the pulse is back to rest.
  let m = 0;
  for (; m <= 16; m++) {
    w.counts.push({ at: roundDp(end + m, 2), dur: 15, thumb: false });
    if (m < after) continue;
    const seen = pulseSeen(v.pulse, w, v.seed);
    const rm = mean(pulseRestSet(seen).map((x) => x.bpm));
    if (pulseRecoveryFrom(seen.filter((x) => x.after !== null).map((x) => ({ after: x.after!, bpm: x.bpm })), rm) !== null) break;
  }
  w.clock = roundDp(end + m + 0.25, 2);
  w.rows = w.counts.map(() => emptyPulseRow());
  s.pulse = pulseIdealRecords(v, s);
  return s;
}

/** Ideal records for the exhaled-air state. */
export function breathIdealRecords(v: BioHumanVariant, s: BioHumanState): BreathWork {
  const w = s.breath;
  const rows = Array.from({ length: w.counts }, (_, n) => String(breathCountShown(v.breath, n, v.seed)));
  const three = rows.slice(0, 3).map(Number);
  const mr = three.length ? roundDp(mean(three), 1) : null;
  const room = breathRoomShown(v.breath, w);
  const bulb = breathBulbShown(v.breath, w);
  const tA = limeTurbidity(v.breath, w, 'A');
  const tB = limeTurbidity(v.breath, w, 'B');
  return {
    ...w,
    rows,
    meanRate: mr === null ? '' : String(mr),
    vent: mr === null ? '' : String(roundDp(mr * BREATH_TIDAL, 0)),
    roomT: room === null ? '' : room.toFixed(1),
    breathT: bulb === null ? '' : bulb.toFixed(1),
    rise: room !== null && bulb !== null ? (bulb - room).toFixed(1) : '',
    ratio: String(CO2_OUT / CO2_IN),
    firstMilky: tB >= 0.5 || tA >= 0.5 ? (tB >= tA ? 'B' : 'A') : null,
    obsA: limeParts(v.breath, w, 'A').map((p) => p.text).join('; '),
    obsB: limeParts(v.breath, w, 'B').map((p) => p.text).join('; '),
    mirrorObs: mirrorParts(v.breath, w).map((p) => p.text).join('; '),
    claims: [...BREATH_NEED, 'RESPIRATION'],
  };
}
export function breathModelState(v: BioHumanVariant): BioHumanState {
  const s = emptyBioHumanState();
  s.task = 'BREATH';
  Object.assign(s.breath, { mouthpiece: true, lime: 'EQUAL', breaths: [{ n: 5, hard: false }, { n: 5, hard: false }], wiped: true, breathed: true, wipedFirst: true, cobalt: true, troom: 'BEFORE', tbreath: true, counts: 3 });
  s.breath = breathIdealRecords(v, s);
  return s;
}

/** Ideal records for the reaction-time state: the distances as shown, means, metres, times and the conclusions. */
export function reactIdealRecords(v: BioHumanVariant, s: BioHumanState): ReactWork {
  const w = s.react;
  const seen = reactSeen(v.react, w, v.seed);
  const rows = REACT_CONDS.map((c) => {
    const ds = seen[c].slice(0, REACT_MAX_PER);
    if (!ds.length) return emptyReactRow();
    const mn = roundDp(mean(ds), 1);
    return { ds: ds.map((x) => x.toFixed(1)), mean: String(mn), m: String(roundDp(mn / 100, 3)), t: String(roundDp(reactTime(mn), 3)) };
  });
  const t = (c: ReactCond) => Number(rows[REACT_CONDS.indexOf(c)]!.t);
  const faster: ReactFaster | null = seen.DOM.length && seen.NONDOM.length ? (Math.abs(t('DOM') - t('NONDOM')) < 0.003 ? 'SAME' : t('DOM') < t('NONDOM') ? 'DOM' : 'NONDOM') : null;
  const eyes = seen.EYES.length && seen.DOM.length ? (Math.abs(t('EYES') - t('DOM')) < 0.003 ? 'SAME' : t('EYES') > t('DOM') ? 'SLOWER' : 'FASTER') : null;
  return { ...w, rows, faster, trend: reactTrendOf(seen.DOM.slice(0, REACT_MAX_PER)), eyes, kneeObs: kneeParts(w).map((p) => p.text).join(', '), claims: [...REACT_NEED] };
}
export function reactModelState(v: BioHumanVariant, other: ReactCond[] = ['NONDOM', 'EYES']): BioHumanState {
  const s = emptyBioHumanState();
  s.task = 'REACTION';
  Object.assign(s.react, { knee: 'HAND', arm: true, zero: true });
  for (let k = 0; k < REACT_MIN_DOM; k++) s.react.drops.push({ cond: 'DOM', warn: false });
  for (const c of other) for (let k = 0; k < REACT_MIN_OTHER; k++) s.react.drops.push({ cond: c, warn: false });
  s.react = reactIdealRecords(v, s);
  return s;
}

/** Ideal records for the skin state: thresholds from the trials, counts, %, bars, ranking, ratio and claims. */
export function skinIdealRecords(v: BioHumanVariant, s: BioHumanState): SkinWork {
  const w = s.skin;
  const seen = skinSeen(v.skin, w, v.seed);
  const rows = SKIN_AREAS.map((a) => {
    const e = seen[a];
    if (!e.n) return emptySkinRow();
    return { thr: e.thr === null ? '' : String(e.thr), n: String(e.n), ok: String(e.ok), pct: fx((e.ok / e.n) * 100, 1) };
  });
  const used = SKIN_AREAS.filter((a) => seen[a].thr !== null);
  const rank = [...used].sort((a, b) => seen[a].thr! - seen[b].thr! || SKIN_AREAS.indexOf(a) - SKIN_AREAS.indexOf(b));
  const ft = seen.FINGERTIP.thr;
  const fa = seen.FOREARM.thr;
  return { ...w, rows, bars: used, rank, most: rank[0] ?? null, ratio: ft && fa ? fx(fa / ft, 1) : '', claims: [...SKIN_NEED] };
}
/** The model's touches on one area: two single-point checks and a descending series that narrows to the threshold. */
export function skinModelSeps(thr: number): number[] {
  const step = skinStep(thr);
  const start = Math.min(SKIN_MAX_SEP, Math.max(6, Math.ceil(thr * 1.6)));
  const coarse = Math.max(step, Math.round(thr * 0.25));
  const seps: number[] = [];
  let x = start;
  while (x > thr + coarse) {
    seps.push(x);
    x -= coarse;
  }
  x = Math.min(x, Math.ceil(thr + 2 * step));
  // Near the threshold each separation is tried twice (a single stray answer does not decide it).
  while (x >= Math.max(1, Math.floor(thr - 3 * step))) {
    seps.push(x, x);
    x -= step;
  }
  return seps;
}
export function skinModelState(v: BioHumanVariant): BioHumanState {
  const s = emptyBioHumanState();
  s.task = 'SKIN';
  Object.assign(s.skin, { blind: true, cleaned: true, together: true });
  for (const a of SKIN_AREAS) {
    const seps = skinModelSeps(v.skin.thr[a]);
    const mid = Math.floor(seps.length / 2);
    seps.forEach((sep, k) => {
      if (k === 1 || k === mid) s.skin.trials.push({ area: a, sep: 0, blind: true, stag: false });
      s.skin.trials.push({ area: a, sep, blind: true, stag: false });
    });
    // Like a careful student: if the step just below the threshold found was too big (or nothing below it was felt as one), fill in the separations below it.
    for (let guard = 0; guard < 12; guard++) {
      const e = skinSeen(v.skin, s.skin, v.seed)[a];
      if (e.thr === null) {
        s.skin.trials.push({ area: a, sep: e.seps[0]?.sep ?? SKIN_MAX_SEP, blind: true, stag: false });
        continue;
      }
      const below = e.seps.filter((x) => x.sep < e.thr! && x.two * 2 < x.all).map((x) => x.sep);
      const lo = below.length ? Math.max(...below) : 0;
      if (below.length && e.thr - lo <= skinStep(e.thr)) break;
      const next = e.thr - 1;
      if (next < 1) break;
      s.skin.trials.push({ area: a, sep: next, blind: true, stag: false });
    }
  }
  s.skin = skinIdealRecords(v, s);
  return s;
}
