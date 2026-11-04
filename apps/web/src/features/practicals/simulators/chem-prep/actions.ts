import {
  PREP_MAX_EVENTS,
  PREP_PRACTICAL_TASKS,
  chemPrepVariant,
  emptyChemPrepState,
  prepBlocked,
  type ChemPrepState,
  type ChemPrepVariant,
  type PrepActionDef,
  type PrepClaim,
  type PrepTask,
} from '@aischool/shared';
import { useEffect, useMemo, useRef } from 'react';
import type { SimulatorProps } from '../types';

/**
 * The chem-prep bench's actions, shared by the 2D and the 3D lab so both
 * produce exactly the same `ChemPrepState`. Every marked step is an event
 * (PREP_ACTIONS in the shared module); every change goes through `update`,
 * which appends to the action log.
 */

export type PrepUpdate = (fn: (s: ChemPrepState) => ChemPrepState, log?: string) => void;
export const lessonTask = (practicalId?: string): PrepTask => (practicalId ? PREP_PRACTICAL_TASKS[practicalId] : undefined) ?? 'STANDARD';

/** `variant`: use these values instead of the seed's (the 3D lab's demo and sandbox). */
export function usePrep({ seed, state, onChange, readOnly, startedAt, practicalId, variant }: Pick<SimulatorProps<'chem-prep'>, 'seed' | 'state' | 'onChange' | 'readOnly' | 'startedAt' | 'practicalId'> & { variant?: ChemPrepVariant }) {
  const task: PrepTask = state.task ?? variant?.task ?? lessonTask(practicalId);
  const v = useMemo(() => variant ?? chemPrepVariant(seed, task), [variant, seed, task]);
  const t0 = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const ref = useRef(state);
  ref.current = state;

  const update: PrepUpdate = (fn, log) => {
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
  const chooseTask = (t: PrepTask) => update((s) => ({ ...emptyChemPrepState(), log: s.log, task: t }), `task:${t}`);
  /** Does one bench action (tube actions on tube `tube`). Returns false when it is blocked. */
  const act = (d: PrepActionDef, tube = -1): boolean => {
    if (ref.current.events.length >= PREP_MAX_EVENTS) return false;
    if (prepBlocked(v, ref.current.events, d, tube)) return false;
    const n = d.tube ? Math.max(0, tube) : (d.n ?? 0);
    update((s) => ({ ...s, events: [...s.events, { a: d.a, x: d.x ?? '', n }] }), `ev:${d.a}${d.x ? `:${d.x}` : ''}${d.tube ? `#${tube}` : d.n ? `:${d.n}` : ''}`);
    return true;
  };
  const setRecord = (row: string, patch: { observation?: string; claims?: PrepClaim[] }) => update((s) => ({ ...s, records: { ...s.records, [row]: { ...(s.records[row] ?? { observation: '', claims: [] }), ...patch } } }));
  const setReading = (id: string, value: string) => update((s) => ({ ...s, readings: { ...s.readings, [id]: value.slice(0, 40) } }));
  const toggleChoice = (id: string, i: number, multi: boolean) =>
    update((s) => {
      const cur = s.choices[id] ?? [];
      const next = multi ? (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].sort()) : cur.includes(i) ? [] : [i];
      return { ...s, choices: { ...s.choices, [id]: next } };
    });
  const blocked = (d: PrepActionDef, tube = -1) => prepBlocked(v, ref.current.events, d, tube);
  return { v, task, ref, update, note, chooseTask, act, setRecord, setReading, toggleChoice, blocked };
}
export type Prep = ReturnType<typeof usePrep>;
