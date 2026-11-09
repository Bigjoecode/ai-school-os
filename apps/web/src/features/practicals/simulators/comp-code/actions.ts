import { COMP_MAX_EVENTS, COMP_PRACTICAL_TASKS, compCodeVariant, compFamily, crimpBlocked, emptyCompCodeState, maintBlocked, type CompAct, type CompCodeState, type CompCodeVariant, type CompTask, type FlowChart } from '@aischool/shared';
import { useEffect, useMemo, useRef } from 'react';
import type { SimulatorProps } from '../types';

/**
 * The comp-code lab's state changes, shared by the 2D and the 3D view so both
 * produce exactly the same `CompCodeState`. Every change goes through
 * `update`; `log` adds to the attempt's action log.
 */

export type CompUpdate = (fn: (s: CompCodeState) => CompCodeState, log?: string) => void;
export const lessonTask = (practicalId?: string): CompTask => (practicalId ? COMP_PRACTICAL_TASKS[practicalId] : undefined) ?? 'BASIC_IO';

/** `variant`: use these values instead of the seed's (the 3D lab's demo and sandbox). */
export function useComp({ seed, state, onChange, readOnly, startedAt, practicalId, variant }: Pick<SimulatorProps<'comp-code'>, 'seed' | 'state' | 'onChange' | 'readOnly' | 'startedAt' | 'practicalId'> & { variant?: CompCodeVariant }) {
  const task: CompTask = state.task ?? variant?.task ?? lessonTask(practicalId);
  const v = useMemo(() => variant ?? compCodeVariant(seed, task), [variant, seed, task]);
  const t0 = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const ref = useRef(state);
  ref.current = state;

  const update: CompUpdate = (fn, log) => {
    if (readOnly) return;
    let next = fn(ref.current);
    if (log) next = { ...next, log: [...next.log, { t: Math.max(0, Date.now() - t0), a: log.slice(0, 100) }].slice(-800) };
    ref.current = next;
    onChange(next);
  };
  useEffect(() => {
    if (!readOnly && !ref.current.task && !variant) update((s) => (s.task ? s : { ...s, task: lessonTask(practicalId) }), 'task:auto');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, practicalId]);

  const note = (a: string) => update((s) => s, a);
  const chooseTask = (t: CompTask) => update((s) => ({ ...emptyCompCodeState(), log: s.log, task: t }), `task:${t}`);
  const setSource = (id: string, text: string) => update((s) => ({ ...s, programs: { ...s.programs, [id]: text.slice(0, 8000) } }));
  const saveAs = (id: string, name: string) => update((s) => ({ ...s, names: { ...s.names, [id]: name.slice(0, 40) } }), `save:${id}`);
  const setChart = (id: string, chart: FlowChart, log?: string) => update((s) => ({ ...s, charts: { ...s.charts, [id]: chart } }), log);
  const blocked = (a: CompAct, x = '') => (task === 'CRIMP' ? crimpBlocked(ref.current.events, a, x) : task === 'MAINT' ? maintBlocked(ref.current.events, a) : undefined);
  /** Does one bench step. Returns false when it is blocked. */
  const act = (a: CompAct, x = '', n = 0): boolean => {
    if (ref.current.events.length >= COMP_MAX_EVENTS || blocked(a, x)) return false;
    update((s) => ({ ...s, events: [...s.events, { a, x, n }] }), `ev:${a}:${x.slice(0, 8)}:${n}`);
    return true;
  };
  const setReading = (id: string, value: string) => update((s) => ({ ...s, readings: { ...s.readings, [id]: value.slice(0, 60) } }));
  const setTrace = (id: string, r: number, c: number, value: string) =>
    update((s) => {
      const t = (s.trace[id] ?? []).map((x) => [...x]);
      while (t.length <= r) t.push([]);
      const row = t[r]!;
      while (row.length <= c) row.push('');
      row[c] = value.slice(0, 24);
      return { ...s, trace: { ...s.trace, [id]: t } };
    });
  const toggleChoice = (id: string, i: number) => update((s) => ({ ...s, choices: { ...s.choices, [id]: (s.choices[id] ?? []).includes(i) ? [] : [i] } }));
  const setWritten = (k: 'precautions' | 'explain', value: string) => update((s) => ({ ...s, written: { ...s.written, [k]: value.slice(0, 2000) } }));
  return { v, task, family: compFamily(task), ref, update, note, chooseTask, setSource, saveAs, setChart, act, blocked, setReading, setTrace, toggleChoice, setWritten };
}
export type Comp = ReturnType<typeof useComp>;
