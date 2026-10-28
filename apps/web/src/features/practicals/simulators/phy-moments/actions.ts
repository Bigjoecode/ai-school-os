import {
  MOMENTS_KNOWN,
  MOMENTS_LOOP_MAX,
  MOMENTS_LOOP_MIN,
  MOMENTS_PIVOT_MAX,
  MOMENTS_PIVOT_MIN,
  momentsStep,
  phyMomentsVariant,
  type MomentsLoad,
  type MomentsTask,
  type PhyMomentsState,
  type PhyMomentsVariant,
} from '@aischool/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLabUpdate } from '../phy-common';

/**
 * The knife edge's state transitions, shared by the 2D and the 3D lab so both
 * produce exactly the same state and action log: choose the task, slide the
 * rule over the knife edge, record the balance point G (rule alone), hang and
 * slide the thread loops, take a reading, remove one. Also the tilt of the
 * rule (not saved): released level after every change, it stays level or tips
 * by the shared physics.
 */

/** Lessons that open on the mass of the rule (every other lesson starts on the principle of moments). */
export const MASS_LESSONS = ['pr-phy-mass-of-metre-rule'];
export const lessonTask = (practicalId?: string): MomentsTask => (practicalId && MASS_LESSONS.includes(practicalId) ? 'MASS' : 'MOMENTS');
export const MAX_READINGS = 12;
export const r1 = (x: number) => Math.round(x * 10) / 10;
export type LoopId = 'known' | 'other';
export const KNOWN_NAME: Record<MomentsTask, string> = { MOMENTS: '50 g mass', MASS: '100 g mass' };
export const LOOP_NAME = (task: MomentsTask, id: LoopId) => (id === 'known' ? KNOWN_NAME[task] : 'unknown mass M');
const clampPivot = (x: number) => r1(Math.max(MOMENTS_PIVOT_MIN, Math.min(MOMENTS_PIVOT_MAX, x)));
const clampLoop = (x: number) => r1(Math.max(MOMENTS_LOOP_MIN, Math.min(MOMENTS_LOOP_MAX, x)));
/** What hangs on the rule now. */
export const loadOf = (s: PhyMomentsState): MomentsLoad => ({ pivot: s.pivot, known: s.known, other: s.task === 'MASS' ? null : s.other });
/** Everything needed for a reading is hung. */
export const readyToRead = (s: PhyMomentsState) => s.known !== null && (s.task === 'MASS' || s.other !== null);

export function momentsHint(s: PhyMomentsState): string {
  if (!s.task) return 'Choose the experiment first.';
  const known = KNOWN_NAME[s.task];
  if (s.g === null) return s.known !== null || s.other !== null ? 'Take the masses off: find G with the rule alone first.' : 'Slide the rule over the knife edge until it balances alone (level against the reference mark), then record G.';
  if (s.task === 'MOMENTS') {
    if (Math.abs(s.pivot - s.g) > 0.05) return `Put the knife edge back at G (${s.g.toFixed(1)} cm) and keep it there.`;
    if (s.known === null) return `Hang the ${known} on the left of G, at a mark on the task card.`;
    if (s.other === null) return 'Hang the unknown mass M on the right of G.';
    if (s.readings.length < 5) return `Slide M until the rule balances, read both thread loops, take the reading. ${s.readings.length} of at least 5.`;
  } else {
    if (s.known === null) return `Hang the ${known} at a mark near the 0 end (as on the task card).`;
    if (s.readings.length < 5) return `Slide the rule over the knife edge until it balances, read P and the mass’s mark, take the reading. ${s.readings.length} of at least 5.`;
  }
  return 'Fill in the table, plot d₁ against d₂, find the slope and M; also M from each row, averaged.';
}

export function useMoments({
  seed,
  state,
  onChange,
  readOnly,
  startedAt,
  practicalId,
  variant,
  autoTask = true,
}: {
  seed: number;
  state: PhyMomentsState;
  onChange: (next: PhyMomentsState) => void;
  readOnly: boolean;
  startedAt: string;
  practicalId?: string;
  /** A custom variant (the sandbox). */
  variant?: PhyMomentsVariant;
  /** Pre-select the experiment from the lesson on opening (the attempt; not the demo or sandbox). */
  autoTask?: boolean;
}) {
  const seeded = useMemo(() => phyMomentsVariant(seed), [seed]);
  const v = variant ?? seeded;
  const { update, ref } = useLabUpdate(state, onChange, readOnly, startedAt);
  useEffect(() => {
    if (autoTask && !readOnly && !ref.current.task && !ref.current.readings.length) {
      const t = lessonTask(practicalId);
      update((s) => (s.task ? s : { ...s, task: t, pivot: v.start.pivot }), 'task:auto');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, practicalId]);
  const task: MomentsTask = state.task ?? 'MOMENTS';
  const loopAt = (s: PhyMomentsState, id: LoopId) => (id === 'known' ? s.known : s.other);
  const o = {
    v,
    update,
    ref,
    task,
    /** The known mass for the task (g). */
    m: MOMENTS_KNOWN[task],
    chooseTask: (t: MomentsTask) => update((s) => ({ ...s, task: t, pivot: v.start.pivot, known: null, other: null, g: null, line: null }), `task:${t}`),
    setPivot: (x: number) => update((s) => ({ ...s, pivot: clampPivot(x) })),
    movePivot: (d: number) => o.setPivot(ref.current.pivot + d),
    /** Records the balance point of the rule alone (refused while anything hangs on it). */
    recordG: (): string | null => {
      const s0 = ref.current;
      if (s0.known !== null || s0.other !== null) return 'Take the masses off first: G is the balance point of the rule alone.';
      update((s) => ({ ...s, g: s.pivot }), `g:${s0.pivot}`);
      return null;
    },
    hang: (id: LoopId) => {
      const s0 = ref.current;
      if (id === 'other' && (s0.task ?? 'MOMENTS') === 'MASS') return;
      if (loopAt(s0, id) !== null) return;
      update((s) => ({ ...s, [id]: id === 'known' ? v.start.known : v.start.other }), `hang:${id}`);
    },
    unhang: (id: LoopId) => {
      if (loopAt(ref.current, id) === null) return;
      update((s) => ({ ...s, [id]: null }), `unhang:${id}`);
    },
    setLoop: (id: LoopId, x: number) => update((s) => (loopAt(s, id) === null ? s : { ...s, [id]: clampLoop(x) })),
    moveLoop: (id: LoopId, d: number) => {
      const at = loopAt(ref.current, id);
      if (at !== null) o.setLoop(id, at + d);
    },
    takeReading: () => {
      const s0 = ref.current;
      if (!s0.task || s0.readings.length >= MAX_READINGS || !readyToRead(s0)) return;
      const other = s0.task === 'MASS' ? null : s0.other;
      update(
        (s) => ({ ...s, readings: [...s.readings, { pivot: s.pivot, known: s.known, other }].slice(0, MAX_READINGS), table: [...s.table, { x1: '', x2: '', d1: '', d2: '', m: '' }].slice(0, MAX_READINGS) }),
        `reading:${s0.known}:${s0.task === 'MASS' ? s0.pivot : other}`,
      );
    },
    removeReading: (i: number) => update((s) => ({ ...s, readings: s.readings.filter((_, k) => k !== i), table: s.table.filter((_, k) => k !== i) }), `remove-reading:${i}`),
    /** A step with no field in the state (collecting apparatus, the briefing): written to the action log only. */
    note: (a: string) => update((s) => s, a),
  };
  return o;
}
export type Moments = ReturnType<typeof useMoments>;

/**
 * The rule's tilt (rad, + = right end down), stepped by the shared physics:
 * released level whenever the load changes, then it stays level (balanced)
 * or tips and comes to rest on the bench. `nudge` re-releases it level.
 */
export class Tilt {
  th = 0;
  om = 0;
  resting = true;
  private key = '';
  sync(v: PhyMomentsVariant, task: MomentsTask, l: MomentsLoad, force = false) {
    const k = `${v.seed}|${v.ruleMass}|${v.g}|${task}|${l.pivot}|${l.known}|${l.other}`;
    if (k === this.key && !force) return false;
    this.key = k;
    this.th = 0;
    this.om = 0;
    this.resting = false;
    return true;
  }
  step(v: PhyMomentsVariant, task: MomentsTask, l: MomentsLoad, dt: number) {
    if (this.resting) return false;
    let left = Math.min(0.1, dt);
    while (left > 0 && !this.resting) {
      const h = Math.min(0.005, left);
      const r = momentsStep(v, task, l, this.th, this.om, h);
      this.th = r.th;
      this.om = r.om;
      this.resting = r.resting;
      left -= h;
    }
    return true;
  }
}

/** The tilt for a React view (2D): re-renders while the rule moves. */
export function useTilt(v: PhyMomentsVariant, task: MomentsTask, l: MomentsLoad): { th: number; resting: boolean; release: () => void } {
  const tilt = useRef(new Tilt());
  const [, setTick] = useState(0);
  const [kick, setKick] = useState(0);
  const key = `${l.pivot}|${l.known}|${l.other}|${task}|${v.seed}|${v.ruleMass}|${kick}`;
  useEffect(() => {
    const t = tilt.current;
    t.sync(v, task, l, true);
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const moved = t.step(v, task, l, (now - last) / 1000);
      last = now;
      setTick((n) => n + 1);
      if (moved && !t.resting) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { th: tilt.current.th, resting: tilt.current.resting, release: () => setKick((k) => k + 1) };
}
