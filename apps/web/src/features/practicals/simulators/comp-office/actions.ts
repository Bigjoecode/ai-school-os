import { CO_PRACTICAL_TASKS, coChecks, coStartState, compOfficeVariant, type CoApp, type CoCheck, type CoTask, type CompOfficeState, type CompOfficeVariant } from '@aischool/shared';
import { useEffect, useMemo, useRef } from 'react';
import type { SimulatorProps } from '../types';

/**
 * The computer-room lab's state changes, shared by the 2D and 3D views so both
 * produce exactly the same `CompOfficeState`. The apps call the shared pure
 * operations through `set`, which appends to the action log.
 */
export const lessonTask = (practicalId?: string): CoTask => (practicalId ? CO_PRACTICAL_TASKS[practicalId] : undefined) ?? 'CST_RESULTS';

type Part = 'sheet' | 'doc' | 'db' | 'deck' | 'fs' | 'web' | 'mail' | 'cloud';

export function useOffice({ seed, state, onChange, readOnly, startedAt, practicalId, variant }: Pick<SimulatorProps<'comp-office'>, 'seed' | 'state' | 'onChange' | 'readOnly' | 'startedAt' | 'practicalId'> & { variant?: CompOfficeVariant }) {
  const task: CoTask = state.task ?? variant?.task ?? lessonTask(practicalId);
  const v = useMemo(() => variant ?? compOfficeVariant(seed, task), [variant, seed, task]);
  const t0 = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const ref = useRef(state);
  ref.current = state;
  const update = (fn: (s: CompOfficeState) => CompOfficeState, log?: string) => {
    if (readOnly) return;
    let next = fn(ref.current);
    if (log) next = { ...next, log: [...next.log, { t: Math.max(0, Date.now() - t0), a: log.slice(0, 80) }].slice(-700) };
    ref.current = next;
    onChange(next);
  };
  useEffect(() => {
    if (!readOnly && !ref.current.task && !variant) update(() => ({ ...coStartState(v), log: ref.current.log }), 'task:auto');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, practicalId]);
  const note = (a: string) => update((s) => s, a);
  /** Changes one app's data. */
  const set = <K extends Part>(k: K, fn: (x: CompOfficeState[K]) => CompOfficeState[K], log?: string) => update((s) => ({ ...s, [k]: fn(s[k]) }), log);
  const chooseTask = (t: CoTask) => update((s) => ({ ...coStartState(compOfficeVariant(seed, t)), log: s.log }), `task:${t}`);
  const setAnswer = (id: string, value: string) => update((s) => ({ ...s, answers: { ...s.answers, [id]: value.slice(0, 200) } }));
  const setWritten = (k: 'precautions' | 'explain', value: string) => update((s) => ({ ...s, written: { ...s.written, [k]: value.slice(0, 2000) } }));
  return { v, task, ref, s: state, readOnly, update, note, set, chooseTask, setAnswer, setWritten };
}
export type Office = ReturnType<typeof useOffice>;

/** What is left to do, for the hint, the checklist and the hand-in check. */
export const useChecks = (v: CompOfficeVariant, s: CompOfficeState): CoCheck[] => useMemo(() => (s.task ? coChecks(v, s) : []), [v, s]);
export const nextApp = (checks: CoCheck[]): CoApp | null => checks.find((c) => !c.done)?.app ?? null;
export function nextHint(checks: CoCheck[]): string {
  const c = checks.find((x) => !x.done);
  if (!c) return 'Everything on the task card is done. Check your notebook, then hand in.';
  return c.crit === 'calculation' ? `Notebook: ${c.label}.` : `${c.label}.${c.why ? ` ${c.why}` : ''}`;
}
