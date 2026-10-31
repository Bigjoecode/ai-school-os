import {
  FORK_SOUNDING,
  FORK_TAU,
  SONO_CARD_LOAD,
  SONO_HANGER,
  SONO_JUMP,
  SONO_MAX,
  SONO_MAX_LOAD,
  SONO_MIN,
  SONO_STEP,
  TUBE_MAX,
  TUBE_MIN,
  phySoundVariant,
  sonoLoud,
  sonoRider,
  soundDefaultLen,
  soundTrueF,
  tubeResponse,
  type PhySoundState,
  type PhySoundVariant,
  type SoundTask,
} from '@aischool/shared';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { useLabUpdate } from '../phy-common';
import { forkLevel, forkStop, forkStrike } from './synth';

/**
 * The resonance labs' state transitions, shared by the 2D and the 3D lab so
 * both produce exactly the same state and action log: choose the task, take a
 * fork from the set, strike it on the rubber pad (or, wrongly, the bench),
 * raise or lower the tube (or move the bridge), hang the load and place the
 * paper rider (sonometer), and take a length. The fork's ringing, the sound's
 * loudness and the wire's motion are live (not saved); the rider being thrown
 * off is saved as it happens, and a length only when taken.
 */

export const SONO_LESSONS = ['pr-phy-sonometer'];
export const lessonTask = (practicalId?: string): SoundTask => (practicalId && SONO_LESSONS.includes(practicalId) ? 'SONO' : 'TUBE');
export const MAX_READINGS = 40;
export const MAX_ROWS = 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
export const loadName = (kg: number) => (kg <= 0 ? 'no load (the wire is slack)' : kg === SONO_HANGER ? 'the 1.0 kg hanger' : `${kg.toFixed(1)} kg (hanger + ${(kg - SONO_HANGER).toFixed(1)} kg)`);
export const lenLimits = (task: SoundTask) => (task === 'SONO' ? { min: SONO_MIN, max: SONO_MAX } : { min: TUBE_MIN, max: TUBE_MAX });

/** The fork ringing now (not saved). */
export interface Strike {
  /** Clock time (ms) it was struck. */
  at: number;
  fork: number;
  hard: boolean;
}

/** The fork's strength now (1 just struck, dying away as e^(−t/τ)). */
export const forkEnv = (st: Strike | null, now: number) => (st ? Math.exp(-Math.max(0, now - st.at) / 1000 / FORK_TAU) : 0);
/** The column's or the wire's response (0–1) to the fork with the length `len`. */
export function soundResponse(v: PhySoundVariant, task: SoundTask, fork: number, len: number, load: number): number {
  return task === 'SONO' ? sonoLoud(v, fork, len, load) : tubeResponse(v, fork, len);
}
/** How loud it sounds (0–1): the fork's strength times the resonance (a little always reaches the ear). */
export function heardLevel(v: PhySoundVariant, task: SoundTask, st: Strike | null, len: number, load: number, now: number): number {
  if (!st) return 0;
  const r = soundResponse(v, task, st.fork, len, load);
  return forkEnv(st, now) * (task === 'SONO' ? 0.3 + 0.7 * r : 0.03 + 0.97 * r);
}
/** The loudness meter's reading: the heard level with the small flicker of judging by ear (±2.5 %). */
export function meterLevel(level: number, now: number): number {
  const k = Math.floor(now / 110);
  const n = Math.sin(k * 12.9898 + 78.233) * 43758.5453;
  return Math.max(0, level * (1 + 0.05 * (n - Math.floor(n) - 0.5)));
}

export function soundHint(s: PhySoundState, st: Strike | null, now: number): string {
  if (!s.task) return 'Choose the experiment first.';
  const ringing = !!st && now - st.at < FORK_SOUNDING * 1000;
  const forks = new Set(s.readings.map((r) => r.fork));
  if (s.task === 'TUBE') {
    if (!s.fork) return 'Take a tuning fork from the set: start with 512 Hz.';
    if (!ringing) return `Strike the ${s.fork} Hz fork on the rubber pad and hold it over the mouth of the tube.`;
    if (!forks.has(s.fork)) return 'Start with a short air column and raise the tube slowly: stop where the sound is loudest (watch the loudness meter). Read l at the water level.';
    if (s.fork === 512 && s.readings.filter((r) => r.fork === 512).length < 2) return 'For 512 Hz, raise the tube on to the second resonance (about three times as long) and take l₂ too.';
    if (forks.size < 5) return `Change to another fork and find its first resonance. ${forks.size} of 5 forks.`;
    return 'Fill in 1/f, plot l against 1/f, find the slope (v/4) and the intercept (−e).';
  }
  if (s.load === 0) return `Hang the hanger and masses: ${SONO_CARD_LOAD} kg in all (the tension stays the same throughout).`;
  if (!s.fork) return 'Take a tuning fork from the set: start with 256 Hz.';
  if (!s.rider) return 'Place the paper rider on the middle of the wire.';
  if (!ringing) return `Strike the ${s.fork} Hz fork on the rubber pad and press its stem on the box.`;
  if (!forks.has(s.fork)) return 'Move the bridge slowly (from close together outwards) until the rider is thrown off, then take the length.';
  if (forks.size < 4) return `Change to another fork. ${forks.size} of 4 forks.`;
  return 'Fill in 1/l, plot f against 1/l, find the slope (v/2), then T = Mg and μ = T/v².';
}

export function useSound({
  seed,
  state,
  onChange,
  readOnly,
  startedAt,
  practicalId,
  variant,
  autoTask = true,
  clock = () => performance.now(),
  audible = true,
}: {
  seed: number;
  state: PhySoundState;
  onChange: (next: PhySoundState) => void;
  readOnly: boolean;
  startedAt: string;
  practicalId?: string;
  /** A custom variant (the sandbox). */
  variant?: PhySoundVariant;
  /** Pre-select the experiment from the lesson (the attempt; not the demo or sandbox). */
  autoTask?: boolean;
  /** The clock the fork's ringing runs on (ms). */
  clock?: () => number;
  /** This bench makes the sound you hear (only the one on screen does). */
  audible?: boolean;
}) {
  const seeded = useMemo(() => phySoundVariant(seed), [seed]);
  const v = variant ?? seeded;
  const { update, ref } = useLabUpdate(state, onChange, readOnly, startedAt);
  const strikeRef = useRef<Strike | null>(null);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const now = () => clockRef.current();
  const audibleRef = useRef(audible);
  audibleRef.current = audible;
  useEffect(() => {
    if (autoTask && !readOnly && !ref.current.task && !ref.current.readings.length) {
      const t = lessonTask(practicalId);
      update((s) => (s.task ? s : { ...s, task: t, len: soundDefaultLen(t) }), 'task:auto');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, practicalId]);
  const task: SoundTask = state.task ?? 'TUBE';

  const level = (t = now()) => {
    const s = ref.current;
    return heardLevel(v, s.task ?? 'TUBE', strikeRef.current, s.len, s.load, t);
  };
  /** How hard the middle of the wire moves now (0–1, sonometer). */
  const riderDrive = (t = now()) => {
    const s = ref.current;
    const st = strikeRef.current;
    if (!st || (s.task ?? 'TUBE') !== 'SONO') return 0;
    return forkEnv(st, t) * sonoRider(v, st.fork, s.len, s.load);
  };
  /** The rider is thrown off the moment the wire's middle moves hard enough. */
  const checkRider = () => {
    const s = ref.current;
    const st = strikeRef.current;
    if ((s.task ?? 'TUBE') !== 'SONO' || !s.rider || !st) return;
    if (riderDrive() >= SONO_JUMP) update((x) => ({ ...x, rider: false, jump: { fork: st.fork, len: r2(x.len) } }), `rider:jump:${st.fork}:${r2(s.len)}`);
  };
  const syncSound = () => {
    if (!audibleRef.current) return;
    forkLevel(level() / Math.max(1e-6, forkEnv(strikeRef.current, now())));
  };
  // While the fork rings: the rider can jump, the sound follows the resonance, and the fork dies away.
  const ringing = !!strikeRef.current;
  useEffect(() => {
    if (!ringing) return;
    const id = setInterval(() => {
      checkRider();
      syncSound();
      const st = strikeRef.current;
      if (st && now() - st.at > FORK_SOUNDING * 1500) {
        strikeRef.current = null;
        bump();
      }
    }, 50);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ringing]);
  useEffect(() => {
    if (!audible && strikeRef.current) forkStop();
  }, [audible]);
  useEffect(() => () => void (audibleRef.current && forkStop()), []);

  const damp = () => {
    if (strikeRef.current && audibleRef.current) forkStop();
    strikeRef.current = null;
    bump();
  };
  const setLen = (x: number) => {
    const s = ref.current;
    const { min, max } = lenLimits(s.task ?? 'TUBE');
    const len = r2(Math.max(min, Math.min(max, x)));
    if (len === s.len) return;
    update((y) => ({ ...y, len }));
    checkRider();
    syncSound();
  };
  const setLoad = (kg: number) => {
    const s0 = ref.current;
    const load = kg < SONO_HANGER - 1e-9 ? 0 : Math.max(SONO_HANGER, Math.min(SONO_MAX_LOAD, SONO_HANGER + Math.round((kg - SONO_HANGER) / SONO_STEP) * SONO_STEP));
    if (load === s0.load) return;
    damp();
    update((s) => ({ ...s, load }), `load:${load}`);
  };
  const o = {
    v,
    update,
    ref,
    task,
    strikeRef,
    now,
    level,
    riderDrive,
    chooseTask: (t: SoundTask) => {
      damp();
      update((s) => ({ ...s, task: t, line: null, len: soundDefaultLen(t) }), `task:${t}`);
    },
    /** Take a fork from the set (the one in hand goes back, silenced). */
    pickFork: (f: number) => {
      if (ref.current.fork === f) return;
      damp();
      update((s) => ({ ...s, fork: f }), `fork:${f}`);
    },
    /** Strike the fork: on the rubber pad, or (wrongly) on the bench. */
    strike: (on: 'pad' | 'bench' = 'pad'): string | null => {
      const s = ref.current;
      if (!s.fork) return 'Take a fork from the set first.';
      const hard = on === 'bench';
      strikeRef.current = { at: now(), fork: s.fork, hard };
      if (audibleRef.current) forkStrike(soundTrueF(v, s.fork), hard, level() / Math.max(1e-6, forkEnv(strikeRef.current, now())));
      bump();
      update((x) => (hard ? { ...x, benched: x.benched + 1 } : x), `strike:${s.fork}:${on}`);
      checkRider();
      return null;
    },
    damp,
    setLen,
    nudge: (d: number) => setLen(ref.current.len + d),
    setLoad,
    hangHanger: () => ref.current.load === 0 && setLoad(SONO_HANGER),
    addMass: () => ref.current.load > 0 && setLoad(ref.current.load + SONO_STEP),
    removeMass: () => (ref.current.load > SONO_HANGER ? setLoad(ref.current.load - SONO_STEP) : ref.current.load > 0 && setLoad(0)),
    placeRider: () => {
      if (ref.current.rider) return;
      update((s) => ({ ...s, rider: true }), 'rider:on');
      checkRider();
    },
    /** Take the length now (a row appears for a new fork). */
    takeReading: (): string | null => {
      const s0 = ref.current;
      if (!s0.fork) return 'Take a fork from the set first.';
      if (s0.readings.length >= MAX_READINGS) return 'The record is full.';
      const st = strikeRef.current;
      const sounding = !!st && st.fork === s0.fork && now() - st.at < FORK_SOUNDING * 1000;
      const jumped = (s0.task ?? 'TUBE') === 'SONO' && !s0.rider && !!s0.jump && s0.jump.fork === s0.fork && Math.abs(s0.jump.len - s0.len) <= 0.6;
      const r = { fork: s0.fork, len: r2(s0.len), load: s0.load, sounding, jumped };
      const newRow = !s0.rows.includes(s0.fork) && s0.rows.length < MAX_ROWS;
      update(
        (s) => ({
          ...s,
          readings: [...s.readings, r],
          rows: newRow ? [...s.rows, s0.fork!] : s.rows,
          tube: newRow ? [...s.tube, { f: '', inv: '', l1: '', l2: '' }] : s.tube,
          sono: newRow ? [...s.sono, { f: '', l: '', inv: '' }] : s.sono,
        }),
        `reading:${s0.fork}:${r.len}${sounding ? '' : ':silent'}${jumped ? ':jumped' : ''}`,
      );
      return null;
    },
    /** Delete a table row and every length taken with its fork. */
    removeRow: (i: number) =>
      update((s) => {
        const f = s.rows[i];
        return { ...s, rows: s.rows.filter((_, k) => k !== i), tube: s.tube.filter((_, k) => k !== i), sono: s.sono.filter((_, k) => k !== i), readings: s.readings.filter((r) => r.fork !== f) };
      }, `remove-row:${i}`),
    /** A step with no field in the state (collecting apparatus, the briefing): written to the log only. */
    note: (a: string) => update((s) => s, a),
  };
  const struck = strikeRef.current;
  return { ...o, struck, ringing: !!struck && now() - struck.at < FORK_SOUNDING * 1000 };
}
export type Sound = ReturnType<typeof useSound>;

/** Re-renders on a timer while `on` (the 2D view, the meter and the dock). */
export function useLive(on: boolean, ms = 60) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(tick, ms);
    return () => clearInterval(id);
  }, [on, ms]);
}
