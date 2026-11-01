import {
  DEPTH_BLOCKS,
  DEPTH_EYE_MAX,
  DEPTH_PIN_MAX,
  DISP_DIST,
  DISP_I,
  PINS_ANGLE,
  PINS_LESSON_TASK,
  PINS_SHEET,
  phyPinsVariant,
  pinsDist,
  pinsIncident,
  pinsPrism,
  prismInDir,
  type DispColour,
  type DispFilter,
  type DispFilterObs,
  type DispRay,
  type PhyPinsState,
  type PhyPinsVariant,
  type PinsPoint,
  type PinsTask,
  type PinsTrace,
} from '@aischool/shared';
import { useEffect, useMemo, useRef } from 'react';
import { useLabUpdate } from '../phy-common';

/**
 * The pin-method optics labs' state transitions, shared by the 2D and the 3D
 * lab so both produce exactly the same state and action log. Board tasks
 * (mirror, prism): start a trace at i (a fresh sheet), draw the normal, stick
 * P₁…P₄, move P₃/P₄ (no log), remove the mirror/prism and join. Depth: stack
 * blocks, move the search pin and the eye, take a reading (parallax checked
 * if the eye was moved from side to side since the pin last moved). Dispersion:
 * the room lights, the slit, the turntable, the screen, the filter, looking
 * at the screen and the observations.
 */

export type PinId = 'p1' | 'p2' | 'p3' | 'p4';
export const PIN_LABEL: Record<PinId, string> = { p1: 'P₁', p2: 'P₂', p3: 'P₃', p4: 'P₄' };
export const lessonTask = (practicalId?: string): PinsTask => (practicalId && PINS_LESSON_TASK[practicalId]) || 'MIRROR';
export const TASK_NAME: Record<PinsTask, string> = { MIRROR: 'Plane mirror', PRISM: 'Triangular prism', DEPTH: 'Real and apparent depth', DISP: 'Dispersion' };
export const r2 = (x: number) => Math.round(x * 100) / 100;
/** The angles the card asks for. */
export const CARD_ANGLES: Record<'MIRROR' | 'PRISM', number[]> = { MIRROR: [20, 30, 40, 50, 60], PRISM: [35, 40, 45, 50, 55, 60, 65] };
export const firstAngle = (task: 'MIRROR' | 'PRISM') => CARD_ANGLES[task][0]!;
export const nextAngle = (task: 'MIRROR' | 'PRISM', i: number) => Math.min(PINS_ANGLE[task].max, i + (task === 'PRISM' ? 5 : 10));
export const boardTask = (t: PinsTask | null): t is 'MIRROR' | 'PRISM' => t === 'MIRROR' || t === 'PRISM';
/** The centre the "push in line" distances are measured from (O for the mirror, the middle of the second face for the prism). */
export const pushCentre = (v: PhyPinsVariant, task: 'MIRROR' | 'PRISM'): PinsPoint => (task === 'MIRROR' ? { x: 0, y: 0 } : pinsPrism(v).M2);
/** How far along the incident ray a pin can go before leaving the sheet. */
export function maxS(v: PhyPinsVariant, task: 'MIRROR' | 'PRISM', i: number): number {
  const S = PINS_SHEET[task];
  let s = 0.5;
  while (s < 40) {
    const p = pinsIncident(v, task, i, s + 0.5);
    if (p.x < S.left + 0.5 || p.x > S.right - 0.5 || p.y < S.bottom + 0.5 || p.y > S.top - 0.5) break;
    s += 0.5;
  }
  return s;
}
/** Is p on the viewing side (where P₃ and P₄ go)? */
export function viewingSide(v: PhyPinsVariant, task: 'MIRROR' | 'PRISM', p: PinsPoint): boolean {
  if (task === 'MIRROR') return p.y > 0.3;
  const sh = pinsPrism(v);
  const e = { x: sh.C.x - sh.T.x, y: sh.C.y - sh.T.y };
  const w = { x: p.x - sh.T.x, y: p.y - sh.T.y };
  return (e.x * w.y - e.y * w.x) / Math.hypot(e.x, e.y) > 0.3;
}

/** Where a tap at p (cm) puts the pin on trace t, or why it can't go there. */
export function pinAt(v: PhyPinsVariant, task: 'MIRROR' | 'PRISM', t: PinsTrace, pin: PinId, p: PinsPoint): { patch: Partial<PinsTrace> } | { error: string } {
  if (pin === 'p1' || pin === 'p2') {
    const O = task === 'MIRROR' ? { x: 0, y: 0 } : pinsPrism(v).O;
    const d = task === 'MIRROR' ? { x: Math.sin((t.i * Math.PI) / 180), y: -Math.cos((t.i * Math.PI) / 180) } : prismInDir(pinsPrism(v), t.i);
    const w = { x: p.x - O.x, y: p.y - O.y };
    const s = -(w.x * d.x + w.y * d.y);
    const perp = Math.abs(w.x * d.y - w.y * d.x);
    if (perp > 0.8 || s < 0.5 || s > maxS(v, task, t.i)) return { error: 'P₁ and P₂ go on the incident ray you drew.' };
    return { patch: { [pin]: r2(s) } };
  }
  if (!viewingSide(v, task, p)) return { error: task === 'MIRROR' ? 'P₃ and P₄ go in front of the mirror, on the side you look from.' : 'P₃ and P₄ go beyond the second face of the prism, on the side you look from.' };
  return { patch: { [pin]: { x: r2(p.x), y: r2(p.y) } } };
}

export function usePins({ seed, state, onChange, readOnly, startedAt, practicalId, variant, autoTask = true }: { seed: number; state: PhyPinsState; onChange: (s: PhyPinsState) => void; readOnly: boolean; startedAt: string; practicalId?: string; variant?: PhyPinsVariant; autoTask?: boolean }) {
  const seeded = useMemo(() => phyPinsVariant(seed), [seed]);
  const v = variant ?? seeded;
  const { update, ref } = useLabUpdate(state, onChange, readOnly, startedAt);
  useEffect(() => {
    if (autoTask && !readOnly && !ref.current.task && !ref.current.traces.length) {
      const t = lessonTask(practicalId);
      update((s) => (s.task ? s : { ...s, task: t }), 'task:auto');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, practicalId]);
  const task: PinsTask = state.task ?? lessonTask(practicalId);
  const bt: 'MIRROR' | 'PRISM' = task === 'PRISM' ? 'PRISM' : 'MIRROR';
  const openIndexOf = (s: PhyPinsState) => s.traces.findIndex((t) => !t.joined);
  const openIndex = openIndexOf(state);
  const open = openIndex >= 0 ? state.traces[openIndex]! : null;
  const setTrace = (patch: Partial<PinsTrace>, log?: string) =>
    update((s) => {
      const k = openIndexOf(s);
      return { ...s, traces: s.traces.map((t, j) => (j === k ? { ...t, ...patch } : t)) };
    }, log);
  /** The eye's sideways range (cm) since the search pin last moved (depth: the parallax check). */
  const eyeRange = useRef<{ lo: number; hi: number }>({ lo: state.depth.eyeX, hi: state.depth.eyeX });
  const resetRange = (x: number) => (eyeRange.current = { lo: x, hi: x });
  const setDisp = (patch: Partial<PhyPinsState['disp']>, log?: string) => update((s) => ({ ...s, disp: { ...s.disp, ...patch } }), log);

  const g = {
    v,
    task,
    bt,
    update,
    ref,
    openIndex,
    open,
    done: state.traces.filter((t) => t.joined).length,
    note: (a: string) => update((s) => s, a),
    // ---- board (mirror, prism)
    newTrace: (i: number) =>
      update((s) => ({ ...s, traces: [...s.traces, { i, normal: false, p1: null, p2: null, p3: null, p4: null, joined: false }].slice(0, 12), table: [...s.table, { i: '', a: '' }].slice(0, 12) }), `trace:${i}`),
    removeTrace: (k: number) => update((s) => ({ ...s, traces: s.traces.filter((_, j) => j !== k), table: s.table.filter((_, j) => j !== k) }), `remove-trace:${k}`),
    drawNormal: () => setTrace({ normal: true }, 'normal'),
    placePin: (pin: PinId, p: PinsPoint): string | null => {
      const t = ref.current.traces[openIndexOf(ref.current)];
      if (!t) return 'Start a trace first.';
      const r = pinAt(v, bt, t, pin, p);
      if ('error' in r) return r.error;
      setTrace(r.patch, `pin-${pin}`);
      return null;
    },
    pushOnRay: (pin: 'p1' | 'p2', s: number): string | null => {
      const t = ref.current.traces[openIndexOf(ref.current)];
      if (!t) return 'Start a trace first.';
      return g.placePin(pin, pinsIncident(v, bt, t.i, s));
    },
    nudge: (pin: 'p3' | 'p4', dx: number, dy: number) => {
      const t = ref.current.traces[openIndexOf(ref.current)];
      const p = t?.[pin];
      if (!p) return;
      const q = { x: r2(p.x + dx), y: r2(p.y + dy) };
      if (viewingSide(v, bt, q)) setTrace({ [pin]: q });
    },
    dragPin: (pin: 'p3' | 'p4', p: PinsPoint) => {
      const q = { x: r2(p.x), y: r2(p.y) };
      if (viewingSide(v, bt, q)) setTrace({ [pin]: q });
    },
    join: () => setTrace({ joined: true }, 'join'),
    // ---- depth
    setBlocks: (b: number) => {
      const blocks = Math.max(0, Math.min(DEPTH_BLOCKS, Math.round(b)));
      if (blocks === ref.current.depth.blocks) return;
      resetRange(ref.current.depth.eyeX);
      update((s) => ({ ...s, depth: { ...s.depth, blocks } }), `blocks:${blocks}`);
    },
    setPin: (h: number) => {
      const x = Math.round(Math.max(0, Math.min(DEPTH_PIN_MAX, h)) * 100) / 100;
      if (x === ref.current.depth.h) return;
      resetRange(ref.current.depth.eyeX);
      update((s) => ({ ...s, depth: { ...s.depth, h: x } }));
    },
    setEye: (x: number) => {
      const e = Math.round(Math.max(-DEPTH_EYE_MAX, Math.min(DEPTH_EYE_MAX, x)) * 100) / 100;
      eyeRange.current = { lo: Math.min(eyeRange.current.lo, e), hi: Math.max(eyeRange.current.hi, e) };
      update((s) => ({ ...s, depth: { ...s.depth, eyeX: e } }));
    },
    /** The eye has been moved from side to side (≥ 4 cm) since the pin last moved. */
    checked: () => eyeRange.current.hi - eyeRange.current.lo >= 4 - 1e-6,
    takeDepth: (): string | null => {
      const s0 = ref.current;
      if (s0.depth.blocks < 1) return 'Put at least one block on the cross first.';
      if (s0.depth.readings.length >= 12) return 'The record is full.';
      const r = { blocks: s0.depth.blocks, h: s0.depth.h, checked: g.checked() };
      update((s) => ({ ...s, depth: { ...s.depth, readings: [...s.depth.readings, r], rows: [...s.depth.rows, { real: '', app: '' }] } }), `depth-read:${r.blocks}:${r.h}${r.checked ? '' : ':unchecked'}`);
      return null;
    },
    removeDepth: (k: number) => update((s) => ({ ...s, depth: { ...s.depth, readings: s.depth.readings.filter((_, j) => j !== k), rows: s.depth.rows.filter((_, j) => j !== k) } }), `remove-depth:${k}`),
    // ---- dispersion
    setDark: (dark: boolean) => setDisp({ dark }, dark ? 'lights:off' : 'lights:on'),
    setSlit: (slit: 'narrow' | 'wide') => setDisp({ slit }, `slit:${slit}`),
    setI: (i: number) => setDisp({ i: Math.round(Math.max(DISP_I.min, Math.min(DISP_I.max, i)) * 2) / 2 }),
    setDist: (d: number) => setDisp({ dist: Math.round(Math.max(DISP_DIST.min, Math.min(DISP_DIST.max, d))) }),
    setFilter: (filter: DispFilter) => setDisp({ filter }, `filter:${filter}`),
    look: () => {
      const d = ref.current.disp;
      if (d.looks.length >= 60) return;
      update((s) => ({ ...s, disp: { ...s.disp, looks: [...s.disp.looks, { i: d.i, slit: d.slit, dark: d.dark, filter: d.filter, dist: d.dist }] } }), `look:${d.i}:${d.slit}:${d.dark ? 'dark' : 'lit'}:${d.filter}`);
    },
    setOrder: (order: DispColour[]) => setDisp({ order: order.slice(0, 7) }, 'order'),
    setMost: (most: DispColour | '') => setDisp({ most }, 'most'),
    setLeast: (least: DispColour | '') => setDisp({ least }, 'least'),
    setFilterObs: (filterObs: DispFilterObs) => setDisp({ filterObs }, 'filter-obs'),
    setRay: (ray: DispRay) => setDisp({ ray }, 'ray'),
  };
  return g;
}
export type Pins = ReturnType<typeof usePins>;

/** P₁P₂ / P₃P₄ separations (cm). */
export const gap12 = (t: PinsTrace) => (t.p1 !== null && t.p2 !== null ? Math.abs(t.p1 - t.p2) : 0);
export const gap34 = (t: PinsTrace) => (t.p3 && t.p4 ? pinsDist(t.p3, t.p4) : 0);
