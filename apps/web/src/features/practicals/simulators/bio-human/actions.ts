import {
  BREATH_BATCH,
  BREATH_MAX,
  BREATH_MAX_COUNTS,
  BREATH_MIN,
  HUMAN_PRACTICAL_TASKS,
  PULSE_CLOCK_MAX,
  PULSE_MAX_COUNTS,
  PULSE_MIN_REST,
  REACT_CONDS,
  REACT_MAX_PER,
  REACT_MIN_DOM,
  REACT_MIN_OTHER,
  SKIN_AREAS,
  SKIN_MAX_SEP,
  SKIN_MAX_TRIALS,
  bioHumanVariant,
  breathCountShown,
  emptyBioHumanState,
  emptyPulseRow,
  pulseCountShown,
  pulseExEnd,
  reactDropShown,
  roundDp,
  skinResponse,
  type BioHumanState,
  type BioHumanVariant,
  type HumanTask,
  type PulseDur,
  type ReactCond,
  type SkinArea,
} from '@aischool/shared';
import { useEffect, useMemo, useRef } from 'react';
import type { SimulatorProps } from '../types';

/**
 * The human physiology bench's actions, shared by the 2D and the 3D lab so
 * both produce exactly the same `BioHumanState`. Every change goes through
 * `update`, which appends to the action log.
 */

export type HumanUpdate = (fn: (s: BioHumanState) => BioHumanState, log?: string) => void;
export const lessonTask = (practicalId?: string): HumanTask => (practicalId ? HUMAN_PRACTICAL_TASKS[practicalId] : undefined) ?? 'PULSE';
const min1 = (x: number) => Math.round(x * 10) / 10;

/** What to do next (practice mode only). */
export function nextHint(_v: BioHumanVariant, s: BioHumanState): string {
  const task = s.task ?? 'PULSE';
  if (task === 'PULSE') {
    const w = s.pulse;
    const end = pulseExEnd(w);
    if (!w.screened) return 'Ask your partner whether they have asthma, a heart problem or sickle-cell disease before any exercise.';
    if (w.clock < PULSE_MIN_REST && !w.exercise) return `Let your partner sit quietly for ${PULSE_MIN_REST} minutes (${min1(w.clock)} so far).`;
    const rest = w.counts.filter((c) => !w.exercise || c.at < w.exercise.at).length;
    if (!w.exercise && rest < 3) return 'Feel the pulse at the wrist with two fingertips and count it for 15 seconds — three times.';
    if (!w.exercise) return 'Now your partner does step-ups for 2 minutes.';
    const after = w.counts.filter((c) => end !== null && c.at >= end - 1e-9).length;
    if (!after) return 'Count the pulse for 15 seconds immediately — the rate starts falling at once.';
    if (after < 6) return 'Wait to the next minute mark and count again; keep going until the pulse is back to the resting rate.';
    if (w.rows.some((r) => !r.beats.trim())) return 'Write every count in the table, then work out beats per minute (× 4 for 15 seconds).';
    return 'Plot pulse rate against time, then work out the mean resting rate, the % increase and the recovery time.';
  }
  if (task === 'BREATH') {
    const w = s.breath;
    if (!w.mouthpiece) return 'Fit a clean mouthpiece to the apparatus.';
    if (!w.lime) return 'Pour equal volumes of lime water into tubes A and B.';
    if (w.breaths.reduce((a, b) => a + b.n, 0) < BREATH_MIN) return 'Your partner breathes gently in and out through the mouthpiece — about 10 times.';
    if (!w.wiped && !w.breathed) return 'Wipe the mirror dry, then your partner breathes on it.';
    if (!w.breathed) return 'Your partner breathes on the cool, dry mirror.';
    if (!w.cobalt) return 'Touch the mist with a piece of cobalt chloride paper.';
    if (!w.troom) return 'Read the thermometer in the room air first.';
    if (!w.tbreath) return 'Now your partner breathes onto the thermometer bulb; read it.';
    if (w.counts < 3) return 'Count your partner’s breaths for one minute, three times, while they sit at rest.';
    return 'Record what each lime water did, the mirror test, the temperatures, the mean breathing rate and the ventilation.';
  }
  if (task === 'REACTION') {
    const w = s.react;
    if (!w.knee) return 'Knee-jerk first: your partner crosses one leg loosely; tap just below the kneecap with the side of your hand.';
    if (!w.arm || !w.zero) return 'Your partner rests the forearm on the bench edge, finger and thumb apart, level with the 0 cm mark.';
    const n = (c: ReactCond) => w.drops.filter((d) => d.cond === c).length;
    if (n('DOM') < REACT_MIN_DOM) return `Drop the rule without warning; read the distance at the top of the thumb (${n('DOM')} of ${REACT_MIN_DOM}, dominant hand).`;
    if (n('NONDOM') < REACT_MIN_OTHER) return `Now the non-dominant hand (${n('NONDOM')} of ${REACT_MIN_OTHER}).`;
    if (w.rows.some((r) => r.ds.some((d) => !d.trim()))) return 'Write each distance in the table.';
    return 'Work out each mean distance, convert it to metres and t = √(2d ÷ g); compare the hands and the effect of practice.';
  }
  const w = s.skin;
  if (!w.blind) return 'Blindfold your partner so they cannot see the points.';
  const done = SKIN_AREAS.filter((a) => w.trials.some((t) => t.area === a));
  if (!done.length) return 'Start on the fingertip with the points 10 mm apart. Mix in single-point touches.';
  if (done.length < SKIN_AREAS.length) return 'Reduce the separation step by step until only one point is felt; then move on to the next area.';
  return 'Record the smallest separation felt as two on each area, the touches and correct answers, then the bar chart and conclusions.';
}

/** `variant`: use these values instead of the seed's (the 3D lab's demo and sandbox). */
export function useHuman({ seed, state, onChange, readOnly, startedAt, practicalId, variant }: Pick<SimulatorProps<'bio-human'>, 'seed' | 'state' | 'onChange' | 'readOnly' | 'startedAt' | 'practicalId'> & { variant?: BioHumanVariant }) {
  const task: HumanTask = state.task ?? lessonTask(practicalId);
  const v = useMemo(() => variant ?? bioHumanVariant(seed, task), [variant, seed, task]);
  const t0 = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const ref = useRef(state);
  ref.current = state;

  const update: HumanUpdate = (fn, log) => {
    if (readOnly) return;
    let next = fn(ref.current);
    if (log) next = { ...next, log: [...next.log, { t: Math.max(0, Date.now() - t0), a: log.slice(0, 80) }].slice(-600) };
    ref.current = next;
    onChange(next);
  };
  useEffect(() => {
    if (!readOnly && !ref.current.task && !variant) update((s) => (s.task ? s : { ...s, task: lessonTask(practicalId) }), 'task:auto');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, practicalId]);

  const note = (a: string) => update((s) => s, a);
  const chooseTask = (t: HumanTask) => update((s) => ({ ...emptyBioHumanState(), log: s.log, task: t }), `task:${t}`);
  const PW = () => ref.current.pulse;
  const BW = () => ref.current.breath;
  const RW = () => ref.current.react;
  const SW = () => ref.current.skin;
  const pw = (fn: (w: BioHumanState['pulse']) => BioHumanState['pulse'], log: string) => update((s) => ({ ...s, pulse: fn(s.pulse) }), log);
  const bw = (fn: (w: BioHumanState['breath']) => BioHumanState['breath'], log: string) => update((s) => ({ ...s, breath: fn(s.breath) }), log);
  const rw = (fn: (w: BioHumanState['react']) => BioHumanState['react'], log: string) => update((s) => ({ ...s, react: fn(s.react) }), log);
  const sw = (fn: (w: BioHumanState['skin']) => BioHumanState['skin'], log: string) => update((s) => ({ ...s, skin: fn(s.skin) }), log);

  // ---------------------------------------------------------------- pulse
  const pulse = {
    screen: () => !PW().screened && pw((w) => ({ ...w, screened: true }), 'screen'),
    wait: (min: number) => PW().clock < PULSE_CLOCK_MAX && pw((w) => ({ ...w, clock: roundDp(Math.min(PULSE_CLOCK_MAX, w.clock + min), 2) }), `wait:${min}`),
    /** On to the next whole minute (after the exercise: the next minute since stopping). */
    nextMinute: () => {
      const w = PW();
      const end = pulseExEnd(w);
      const base = end !== null && w.clock >= end - 1e-9 ? end : 0;
      const to = roundDp(base + Math.floor(w.clock - base + 1e-6) + 1, 2);
      if (to > PULSE_CLOCK_MAX) return;
      pw((x) => ({ ...x, clock: to }), 'wait:minute');
    },
    /** Counts the pulse for `dur` seconds; returns the count's index or −1. */
    count: (dur: PulseDur, thumb = false): number => {
      const w = PW();
      if (w.counts.length >= PULSE_MAX_COUNTS || w.clock + dur / 60 > PULSE_CLOCK_MAX) return -1;
      pw((x) => ({ ...x, counts: [...x.counts, { at: x.clock, dur, thumb }], rows: [...x.rows, emptyPulseRow()], clock: roundDp(x.clock + dur / 60, 2) }), `count${thumb ? '-thumb' : ''}:${dur}`);
      return w.counts.length;
    },
    exercise: (min: number) => {
      const w = PW();
      if (w.exercise || w.clock + min > PULSE_CLOCK_MAX) return;
      pw((x) => ({ ...x, exercise: { at: x.clock, min }, clock: roundDp(x.clock + min, 2) }), `exercise:${min}`);
    },
  };

  // ---------------------------------------------------------------- breath
  const breath = {
    mouthpiece: () => !BW().mouthpiece && bw((w) => ({ ...w, mouthpiece: true }), 'mouthpiece'),
    lime: (how: 'EQUAL' | 'UNEQUAL') => !BW().lime && bw((w) => ({ ...w, lime: how }), `lime:${how}`),
    breathe: (hard = false) => {
      const w = BW();
      if (!w.lime || w.breaths.length >= BREATH_MAX) return;
      bw((x) => ({ ...x, breaths: [...x.breaths, { n: BREATH_BATCH, hard }] }), `breathe${hard ? ':hard' : ''}`);
    },
    wipe: () => !BW().breathed && !BW().wiped && bw((w) => ({ ...w, wiped: true }), 'wipe'),
    mirror: () => !BW().breathed && bw((w) => ({ ...w, breathed: true, wipedFirst: w.wiped }), 'mirror'),
    cobalt: () => !BW().cobalt && bw((w) => ({ ...w, cobalt: true }), 'cobalt'),
    room: () => !BW().troom && bw((w) => ({ ...w, troom: w.tbreath ? 'AFTER' : 'BEFORE' }), 'troom'),
    bulb: () => !BW().tbreath && bw((w) => ({ ...w, tbreath: true }), 'tbreath'),
    count: (): number => {
      const w = BW();
      if (w.counts >= BREATH_MAX_COUNTS) return -1;
      bw((x) => ({ ...x, counts: x.counts + 1, rows: [...x.rows, ''] }), `bcount#${w.counts + 1}`);
      return w.counts;
    },
  };

  // ---------------------------------------------------------------- reaction
  const react = {
    knee: (how: 'HAND' | 'HARD') => !RW().knee && rw((w) => ({ ...w, knee: how }), `knee:${how}`),
    arm: (on: boolean) => RW().arm !== on && rw((w) => ({ ...w, arm: on }), `arm:${on ? 'on' : 'off'}`),
    zero: (on: boolean) => RW().zero !== on && rw((w) => ({ ...w, zero: on }), `zero:${on ? 'on' : 'off'}`),
    /** Drops the rule for a condition (`warn`: signalled); returns the drop's index or −1. */
    drop: (cond: ReactCond, warn = false): number => {
      const w = RW();
      if (w.drops.filter((d) => d.cond === cond).length >= REACT_MAX_PER) return -1;
      const k = REACT_CONDS.indexOf(cond);
      rw((x) => ({ ...x, drops: [...x.drops, { cond, warn }], rows: x.rows.map((r, i) => (i === k ? { ...r, ds: [...r.ds, ''] } : r)) }), `drop${warn ? '-warn' : ''}:${cond}`);
      return w.drops.length;
    },
  };

  // ---------------------------------------------------------------- skin
  const skin = {
    blind: (on: boolean) => SW().blind !== on && sw((w) => ({ ...w, blind: on }), `blind:${on ? 'on' : 'off'}`),
    clean: () => !SW().cleaned && sw((w) => ({ ...w, cleaned: true }), 'clean'),
    together: (on: boolean) => SW().together !== on && sw((w) => ({ ...w, together: on }), `together:${on ? 'on' : 'off'}`),
    /** Touches an area with two points `sep` mm apart (0: one point); returns the trial index or −1. */
    touch: (area: SkinArea, sep: number): number => {
      const w = SW();
      const sp = Math.max(0, Math.min(SKIN_MAX_SEP, Math.round(sep)));
      if (w.trials.length >= SKIN_MAX_TRIALS) return -1;
      sw((x) => ({ ...x, trials: [...x.trials, { area, sep: sp, blind: x.blind, stag: !x.together }] }), `touch:${area}:${sp}`);
      return w.trials.length;
    },
  };

  return { v, task, ref, update, note, chooseTask, pulse, breath, react, skin };
}
export type Human = ReturnType<typeof useHuman>;

// ------------------------------------------------------------------ what the bench shows now (2D and 3D)

export function lastPulse(v: BioHumanVariant, s: BioHumanState) {
  const n = s.pulse.counts.length - 1;
  const c = s.pulse.counts[n];
  return c ? { n, c, beats: pulseCountShown(v.pulse, s.pulse, c, n, v.seed) } : null;
}
export function lastBreathCount(v: BioHumanVariant, s: BioHumanState) {
  const n = s.breath.counts - 1;
  return n >= 0 ? { n, breaths: breathCountShown(v.breath, n, v.seed) } : null;
}
export function lastDrop(v: BioHumanVariant, s: BioHumanState) {
  const n = s.react.drops.length - 1;
  const d = s.react.drops[n];
  return d ? { n, d, cm: reactDropShown(v.react, s.react, n, v.seed) } : null;
}
export function lastTouch(v: BioHumanVariant, s: BioHumanState) {
  const n = s.skin.trials.length - 1;
  const t = s.skin.trials[n];
  return t ? { n, t, said: skinResponse(v.skin, s.skin, n, v.seed) } : null;
}
export const fmtMin = (x: number) => {
  const m = Math.floor(x + 1e-6);
  const sec = Math.round((x - m) * 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};
