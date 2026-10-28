import { OPTICS_HOLDER_GAP, OPTICS_ROUGH_MAX, OPTICS_ROUGH_MIN, OPTICS_RULE, OPTICS_START, OPTICS_U_MAX, OPTICS_U_MIN, opticsV, phyOpticsVariant, type OpticsTask, type PhyOpticsState, type PhyOpticsVariant } from '@aischool/shared';
import { useEffect, useMemo } from 'react';
import { useLabUpdate } from '../phy-common';

/**
 * The optical bench's state transitions, shared by the 2D and the 3D lab so
 * both produce exactly the same state and action log: choose the task, line
 * up the centres, set u, move the screen, record the rough focus (the window),
 * take a reading, remove one.
 */

/** Lessons that open the bench on the concave mirror (every other lesson starts on the converging lens). */
export const MIRROR_LESSONS = ['pr-phy-concave-mirror-focal-length'];
export const lessonTask = (practicalId?: string): OpticsTask => (practicalId && MIRROR_LESSONS.includes(practicalId) ? 'MIRROR' : 'LENS');
export const MAX_READINGS = 12;
export const r1 = (x: number) => Math.round(x * 10) / 10;
export const OPTIC_NAME: Record<OpticsTask, string> = { LENS: 'lens', MIRROR: 'mirror' };

/** The screen's lowest mark for the bench as set (LENS: just beyond the lens holder). */
export const screenMin = (task: OpticsTask, u: number) => (task === 'MIRROR' ? 3 : u + OPTICS_HOLDER_GAP);
export const clampScreen = (task: OpticsTask, u: number, x: number) => r1(Math.max(screenMin(task, u), Math.min(OPTICS_RULE, x)));
export const clampRough = (x: number) => r1(Math.max(OPTICS_ROUGH_MIN, Math.min(OPTICS_ROUGH_MAX, x)));

export function opticsHint(s: PhyOpticsState, rough: boolean): string {
  const what = OPTIC_NAME[s.task ?? 'LENS'];
  if (!s.task) return 'Choose the experiment first.';
  if (s.rough === null) return rough ? `Move the screen until the distant window is sharp on it, then record the distance from the ${what}.` : `First find a rough focal length: point the ${what} at the window and focus it on the screen.`;
  if (!s.aligned) return `Line up the centres of the object, the ${what} and the screen on the same axis.`;
  if (s.readings.length < 5) return `Set u (well beyond your rough focal length), move the screen to and fro until the cross-wire is sharpest, read v on the rule and take the reading. ${s.readings.length} of at least 5.`;
  return 'Fill in the table, plot 1/v against 1/u, extend your line to both axes and work out f.';
}

export function useOptics({
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
  state: PhyOpticsState;
  onChange: (next: PhyOpticsState) => void;
  readOnly: boolean;
  startedAt: string;
  practicalId?: string;
  /** A custom variant (the sandbox). */
  variant?: PhyOpticsVariant;
  /** Pre-select the experiment from the lesson on opening (the attempt; not the demo or sandbox). */
  autoTask?: boolean;
}) {
  const seeded = useMemo(() => phyOpticsVariant(seed), [seed]);
  const v = variant ?? seeded;
  const { update, ref } = useLabUpdate(state, onChange, readOnly, startedAt);
  useEffect(() => {
    if (autoTask && !readOnly && !ref.current.task && !ref.current.readings.length) {
      const t = lessonTask(practicalId);
      update((s) => (s.task ? s : { ...s, task: t, ...OPTICS_START[t] }), 'task:auto');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, practicalId]);
  const task: OpticsTask = state.task ?? 'LENS';
  const o = {
    v,
    update,
    ref,
    task,
    /** The screen's distance from the lens or mirror now (cm). */
    sNow: opticsV(task, state.u, state.screen),
    chooseTask: (t: OpticsTask) => update((s) => ({ ...s, task: t, aligned: false, rough: null, ...OPTICS_START[t], line: null }), `task:${t}`),
    align: () => update((s) => ({ ...s, aligned: true }), 'align'),
    setU: (x: number) =>
      update((s) => {
        const t = s.task ?? 'LENS';
        const u = r1(Math.max(OPTICS_U_MIN, Math.min(OPTICS_U_MAX, x)));
        // LENS: the screen is pushed along by the lens holder.
        return { ...s, u, screen: t === 'LENS' ? Math.max(s.screen, clampScreen(t, u, s.screen)) : s.screen };
      }),
    setScreen: (x: number) => update((s) => ({ ...s, screen: clampScreen(s.task ?? 'LENS', s.u, x) })),
    moveScreen: (dx: number) => {
      const s = ref.current;
      o.setScreen(s.screen + dx);
    },
    /** The rough focus: the window was sharpest with the screen `s` cm from the lens or mirror. */
    recordRough: (sCm: number) => update((s) => ({ ...s, rough: clampRough(sCm) }), `rough:${clampRough(sCm)}`),
    takeReading: () => {
      const s0 = ref.current;
      if (!s0.task || s0.readings.length >= MAX_READINGS) return;
      update(
        (s) => ({ ...s, readings: [...s.readings, { u: s.u, screen: s.screen, aligned: s.aligned }].slice(0, MAX_READINGS), table: [...s.table, { u: '', v: '', iu: '', iv: '' }].slice(0, MAX_READINGS) }),
        `reading:${s0.u}:${s0.screen}`,
      );
    },
    removeReading: (i: number) => update((s) => ({ ...s, readings: s.readings.filter((_, k) => k !== i), table: s.table.filter((_, k) => k !== i) }), `remove-reading:${i}`),
    /** A step with no field in the state (collecting apparatus, placing it on the rule, the briefing): written to the action log only. */
    note: (a: string) => update((s) => s, a),
  };
  return o;
}
export type Optics = ReturnType<typeof useOptics>;
