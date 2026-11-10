import { GEO_LIMIT, GEO_MAP_TASKS, GEO_PRACTICAL_TASKS, emptyGeoMapsState, geoMapsVariant, type GeoMapsState, type GeoRun, type GeoSet, type GeoStep, type GeoTask, type GeoVariant, type P } from '@aischool/shared';
import { useEffect, useMemo, useRef } from 'react';
import type { SimulatorProps } from '../types';

/**
 * The map bench's actions, shared by the 2D and the 3D lab so both produce
 * exactly the same `GeoMapsState`. Every instrument placed is recorded in the
 * state (that record is what the construction marks read), and every change
 * goes through `update`, which appends to the action log.
 */

export type GeoUpdate = (fn: (s: GeoMapsState) => GeoMapsState, log?: string) => void;
export const lessonTask = (practicalId?: string): GeoTask => (practicalId ? GEO_PRACTICAL_TASKS[practicalId] : undefined) ?? 'DISTANCE';
export const isMapTask = (t: GeoTask) => GEO_MAP_TASKS.includes(t);
const r2 = (x: number) => Math.round(x * 100) / 100;
export const pt2 = (p: P): P => [r2(p[0]), r2(p[1])];

/** `variant`: use these values instead of the seed's (the 3D lab's demo and sandbox). */
export function useGeo({ seed, state, onChange, readOnly, startedAt, practicalId, variant }: Pick<SimulatorProps<'geo-maps'>, 'seed' | 'state' | 'onChange' | 'readOnly' | 'startedAt' | 'practicalId'> & { variant?: GeoVariant }) {
  const task: GeoTask = state.task ?? variant?.task ?? lessonTask(practicalId);
  const v = useMemo(() => variant ?? geoMapsVariant(seed, task), [variant, seed, task]);
  const t0 = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const ref = useRef(state);
  ref.current = state;

  const update: GeoUpdate = (fn, log) => {
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
  const chooseTask = (t: GeoTask) => update((s) => ({ ...emptyGeoMapsState(), log: s.log, task: t }), `task:${t}`);
  const setEntry = (id: string, value: string) => update((s) => ({ ...s, entries: { ...s.entries, [id]: value.slice(0, 60) } }));
  const setChoice = (id: string, value: string) => update((s) => ({ ...s, choices: { ...s.choices, [id]: value } }), `choice:${id}`);
  const toggleCheck = (id: string) => update((s) => ({ ...s, checks: s.checks.includes(id) ? s.checks.filter((c) => c !== id) : [...s.checks, id] }), `check:${id}`);
  const setSets = (patch: Record<string, GeoSet>, log?: string) => update((s) => ({ ...s, sets: { ...s.sets, ...patch } }), log);
  const setSeries = (id: string, values: number[], log?: string) => update((s) => ({ ...s, series: { ...s.series, [id]: values.map((x) => Math.round(x * 100) / 100) } }), log);
  const setSeq = (id: string, order: string[]) => update((s) => ({ ...s, seq: { ...s.seq, [id]: order } }), `order:${id}`);
  const setWritten = (patch: Partial<GeoMapsState['written']>) => update((s) => ({ ...s, written: { ...s.written, ...patch } }));

  const addRuler = (a: P, b: P) => update((s) => ({ ...s, rulers: [...s.rulers, { a: pt2(a), b: pt2(b) }].slice(-GEO_LIMIT.rulers) }), 'ruler');
  const moveLastRuler = (a: P, b: P) => update((s) => (s.rulers.length ? { ...s, rulers: [...s.rulers.slice(0, -1), { a: pt2(a), b: pt2(b) }] } : s));
  const addProtractor = (c: P, t: P) => update((s) => ({ ...s, protractors: [...s.protractors, { c: pt2(c), t: pt2(t) }].slice(-GEO_LIMIT.protractors) }), 'protractor');
  const moveLastProtractor = (c: P, t: P) => update((s) => (s.protractors.length ? { ...s, protractors: [...s.protractors.slice(0, -1), { c: pt2(c), t: pt2(t) }] } : s));
  const startRun = (tool: GeoRun['tool'], p: P) => update((s) => ({ ...s, runs: [...s.runs, { tool, pts: [pt2(p)] }].slice(-GEO_LIMIT.runs) }), `run:${tool}`);
  const extendRun = (p: P) => update((s) => (s.runs.length ? { ...s, runs: [...s.runs.slice(0, -1), { ...s.runs[s.runs.length - 1]!, pts: [...s.runs[s.runs.length - 1]!.pts, pt2(p)].slice(0, 400) }] } : s));
  const toggleSquare = (key: string) =>
    update((s) => {
      const cur = s.squares[key];
      const squares = { ...s.squares };
      if (!cur) squares[key] = 'F';
      else if (cur === 'F') squares[key] = 'P';
      else delete squares[key];
      return { ...s, squares };
    }, `square:${key}`);
  const addPin = (k: string, p: P) => update((s) => ({ ...s, pins: [...s.pins, { k, p: pt2(p) }].slice(-GEO_LIMIT.pins) }), `pin:${k}`);
  const removePin = (i: number) => update((s) => ({ ...s, pins: s.pins.filter((_, x) => x !== i) }), 'pin-off');
  const addTick = (d: number, h: number) => update((s) => ({ ...s, ticks: [...s.ticks, { d: r2(d), h }].sort((a, b) => a.d - b.d).slice(0, GEO_LIMIT.ticks) }), 'tick');
  const removeTick = (i: number) => update((s) => ({ ...s, ticks: s.ticks.filter((_, x) => x !== i) }), 'tick-off');
  const addVertex = (id: string, p: P) => update((s) => ({ ...s, lines: { ...s.lines, [id]: [...(s.lines[id] ?? []), pt2(p)].slice(0, GEO_LIMIT.linePts) } }), `vertex:${id}`);
  const undoVertex = (id: string) => update((s) => ({ ...s, lines: { ...s.lines, [id]: (s.lines[id] ?? []).slice(0, -1) } }), `undo:${id}`);
  const clearLine = (id: string) => update((s) => ({ ...s, lines: { ...s.lines, [id]: [] } }), `clear:${id}`);
  const undo = (what: 'rulers' | 'runs' | 'protractors') => update((s) => ({ ...s, [what]: s[what].slice(0, -1) }), `undo:${what}`);
  /** Does a step the model way (the demo). */
  const doStep = (st: GeoStep) =>
    update((s) => {
      const c = JSON.parse(JSON.stringify(s)) as GeoMapsState;
      st.apply(c);
      return c;
    }, `step:${st.id}`);
  return { v, task, ref, update, note, chooseTask, setEntry, setChoice, toggleCheck, setSets, setSeries, setSeq, setWritten, addRuler, moveLastRuler, addProtractor, moveLastProtractor, startRun, extendRun, toggleSquare, addPin, removePin, addTick, removeTick, addVertex, undoVertex, clearLine, undo, doStep };
}
export type Geo = ReturnType<typeof useGeo>;

export const nextStep = (v: GeoVariant, s: GeoMapsState) => v.def.steps.find((x) => !x.done(s)) ?? null;
export const nextHint = (v: GeoVariant, s: GeoMapsState) => {
  const n = nextStep(v, s);
  if (n) return `${n.label}. ${n.why}`;
  return !s.written.precautions.trim() || !s.written.explain.trim() ? 'Write your precautions and explanation in the notebook.' : 'Everything is recorded: check it, then hand in.';
};
