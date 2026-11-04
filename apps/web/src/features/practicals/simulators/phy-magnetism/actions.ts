import {
  DIODE_BURN,
  FIELD_MAX_DOTS,
  FIELD_PAPER,
  MAG_MAX_ROWS,
  diodeSolve,
  emLift,
  emSettingKey,
  fieldTrace,
  phyMagnetismVariant,
  sheetCfg,
  type DiodeCircuit,
  type EmCore,
  type EmLift,
  type FieldArr,
  type FieldCompass,
  type FieldFacing,
  type FieldSheet,
  type IndCoil,
  type IndKind,
  type IndMove,
  type MagAnswerId,
  type MagTask,
  type PhyMagnetismState,
  type PhyMagnetismVariant,
} from '@aischool/shared';
import { useEffect, useMemo } from 'react';
import { useLabUpdate } from '../phy-common';

/**
 * The magnetism lab's state transitions, shared by the 2D and the 3D lab so
 * both produce exactly the same state and action log: the plotting compass
 * on the field sheet, the electromagnet's circuit and clips, the coil and
 * magnet with the galvanometer, and the diode's circuit. Each measurement is
 * appended when it is made; what the instruments show comes from the shared
 * physics (the numbers the grader checks).
 */

export const LESSON_TASK: Record<string, MagTask> = {
  'pr-phy-magnetic-field-plotting': 'FIELD',
  'pr-phy-electromagnet-strength': 'ELECTROMAGNET',
  'pr-phy-electromagnetic-induction': 'INDUCTION',
  'pr-phy-diode-characteristics': 'DIODE',
};
export const lessonTask = (practicalId?: string): MagTask => (practicalId && LESSON_TASK[practicalId]) || 'FIELD';
export const TASK_NAME: Record<MagTask, string> = {
  FIELD: 'Field lines and neutral points',
  ELECTROMAGNET: 'Strength of an electromagnet',
  INDUCTION: 'Electromagnetic induction',
  DIODE: 'Characteristic of a junction diode',
};
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const r1 = (x: number) => Math.round(x * 10) / 10;

// ------------------------------------------------------------------ read-only helpers

/** The sheet the next mark goes on (null: a fresh one is needed). */
export function openSheet(s: PhyMagnetismState): { sheet: FieldSheet; i: number } | null {
  const i = s.sheets.length - 1;
  const sh = s.sheets[i];
  return sh && !sh.closed && sh.facing === s.facing && sh.arr === s.arr ? { sheet: sh, i } : null;
}
/** The sheet to show: the open one, else the last. */
export function shownSheet(s: PhyMagnetismState): { sheet: FieldSheet; i: number } | null {
  const o = openSheet(s);
  if (o) return o;
  const i = s.sheets.length - 1;
  return i >= 0 ? { sheet: s.sheets[i]!, i } : null;
}
/** The config the magnet is in now (for an empty paper). */
export const fieldCfgNow = (s: PhyMagnetismState) => ({ facing: s.facing, arr: s.arr, aligned: s.meridian, steel: !s.steelAway });
/** The electromagnet's settings in order (the table rows). */
export function emSettings(s: PhyMagnetismState): { key: string; l: EmLift; lifts: number[] }[] {
  const out: { key: string; l: EmLift; lifts: number[] }[] = [];
  s.lifts.forEach((l, k) => {
    const key = emSettingKey(l);
    const x = out.find((o) => o.key === key);
    if (x) x.lifts.push(k);
    else out.push({ key, l, lifts: [k] });
  });
  return out;
}
export const lastLift = (v: PhyMagnetismVariant, s: PhyMagnetismState) => {
  const k = s.lifts.length - 1;
  return k < 0 ? null : { k, l: s.lifts[k]!, ...emLift(v, k, s.lifts[k]!) };
};
export const diodeNow = (s: PhyMagnetismState): DiodeCircuit => ({ bias: s.bias, pot: s.pot, resistor: s.resistor, vm: s.vm, heat: s.heat });
export const moveLabel = (m: IndMove) => `${m.pole} ${m.kind === 'in' ? 'pushed in' : m.kind === 'out' ? 'pulled out' : 'held still'}${m.kind === 'still' ? '' : `, ${m.speed}`}${m.magnets === 2 ? ', 2 magnets' : ''}, ${m.coil} turns`;
export const CORE_NAME: Record<EmCore, string> = { iron: 'soft-iron nail', steel: 'steel rod', none: 'no core' };

export function magHint(s: PhyMagnetismState): string {
  switch (s.task) {
    case 'FIELD': {
      if (!s.meridian) return 'Mark the magnetic meridian with the compass alone first, and line the paper up with it.';
      if (!s.steelAway) return 'Clear the keys and the phone off the bench: steel distorts the field.';
      const o = openSheet(s);
      const lines = o?.sheet.lines.length ?? 0;
      if (lines < 4) return `Start a field line beside the N pole and mark it dot to dot (tap the compass each time) round to the S pole. Lines: ${lines} of at least 4.`;
      if (!o?.sheet.arrows) return 'Draw arrows on your lines, from N to S.';
      if ((o?.sheet.neutrals.length ?? 0) < 2) return s.facing === 'north' ? 'Move the compass along the east–west line until the needle rests in any direction: mark both neutral points.' : 'Move the compass along the axis beyond each end until the needle rests in any direction: mark both neutral points.';
      return s.facing === 'north' ? 'Now turn the magnet round (N pointing south) and find the neutral points again on a fresh sheet.' : 'Measure each neutral point’s distance from the centre and work out the means.';
    }
    case 'ELECTROMAGNET':
      if (s.turns < 30) return 'Wind 30 turns on the nail.';
      return `Set the current with the rheostat, close the key, lift the clips and count them, then open the key. Settings: ${emSettings(s).length}.`;
    case 'INDUCTION':
      return s.magIn ? 'Hold the magnet still and watch, or pull it out.' : 'Push the magnet into the coil and watch the galvanometer: the size and direction of the swing.';
    case 'DIODE':
      if (s.burnt) return 'The diode has burnt out: replace it, and keep the protective resistor in.';
      return `Set the p.d. across the diode with the potentiometer, close the key, read both meters, open the key. Readings: ${s.reads.length}.`;
    default:
      return 'Choose the experiment first.';
  }
}

export function useMagnetism({
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
  state: PhyMagnetismState;
  onChange: (next: PhyMagnetismState) => void;
  readOnly: boolean;
  startedAt: string;
  practicalId?: string;
  variant?: PhyMagnetismVariant;
  autoTask?: boolean;
}) {
  const seeded = useMemo(() => phyMagnetismVariant(seed), [seed]);
  const v = variant ?? seeded;
  const { update, ref } = useLabUpdate(state, onChange, readOnly, startedAt);
  useEffect(() => {
    if (autoTask && !readOnly && !ref.current.task && ref.current.log.length < 3) {
      const t = lessonTask(practicalId);
      update((s) => (s.task ? s : { ...s, task: t }), 'task:auto');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, practicalId]);
  const task: MagTask = state.task ?? 'FIELD';
  const withRow = (s: PhyMagnetismState, key: number, c: Record<string, string> = {}): PhyMagnetismState =>
    s.rows.some((r) => r.key === key) || s.rows.length >= MAG_MAX_ROWS ? s : { ...s, rows: [...s.rows, { key, c }] };
  /** Closes the open sheet if it has marks on it. */
  const closeSheet = (s: PhyMagnetismState): PhyMagnetismState => {
    const o = openSheet(s);
    return o && (o.sheet.lines.length || o.sheet.neutrals.length) ? { ...s, sheets: s.sheets.map((x, i) => (i === o.i ? { ...x, closed: true } : x)) } : s;
  };
  /** The open sheet (a fresh one goes on if needed): its index, in the returned state. */
  const ensureSheet = (s: PhyMagnetismState): [PhyMagnetismState, number] => {
    const o = openSheet(s);
    if (o) return [s, o.i];
    const sheets = [...s.sheets.map((x) => ({ ...x, closed: true })), { facing: s.facing, arr: s.arr, aligned: s.meridian, steel: !s.steelAway, lines: [], neutrals: [], arrows: false, closed: false }].slice(-6);
    return [{ ...s, sheets }, sheets.length - 1];
  };
  const mapSheet = (s: PhyMagnetismState, i: number, fn: (x: FieldSheet) => FieldSheet) => ({ ...s, sheets: s.sheets.map((x, j) => (j === i ? fn(x) : x)) });
  /** A burnt diode when the current is too large (the key closed). */
  const burnCheck = (s: PhyMagnetismState): PhyMagnetismState => (s.task === 'DIODE' && s.key && !s.burnt && diodeSolve(v, diodeNow(s)).I > DIODE_BURN ? { ...s, burnt: true } : s);
  const burnUpdate = (fn: (s: PhyMagnetismState) => PhyMagnetismState, log?: string) => {
    const before = ref.current.burnt;
    update((s) => burnCheck(fn(s)), log);
    if (!before && ref.current.burnt) update((s) => s, 'burnt');
  };

  const o = {
    v,
    update,
    ref,
    task,
    chooseTask: (t: MagTask) => update((s) => ({ ...s, task: t, line: null }), `task:${t}`),
    note: (a: string) => update((s) => s, a),
    // ---------------------------------------------------------------- FIELD
    markMeridian: () => update((s) => ({ ...closeSheet(s), meridian: true }), 'meridian'),
    clearSteel: () => update((s) => ({ ...closeSheet(s), steelAway: true }), 'clear-steel'),
    setFacing: (f: FieldFacing) => ref.current.facing !== f && update((s) => ({ ...closeSheet(s), facing: f }), `facing:${f}`),
    setArr: (a: FieldArr) => ref.current.arr !== a && update((s) => ({ ...closeSheet(s), arr: a }), `arr:${a}`),
    setCompass: (c: FieldCompass) => update((s) => ({ ...s, compass: c }), `compass:${c}`),
    setTapEach: (b: boolean) => update((s) => ({ ...s, tapEach: b }), `tap:${b ? 'each' : 'no'}`),
    freshSheet: () => update((s) => closeSheet(s), 'fresh-sheet'),
    /** A new field line from start point `start` (its first dot). */
    startLine: (start: number): string | null => {
      const s0 = ref.current;
      if (s0.arr === 'one' && (openSheet(s0)?.sheet.lines.length ?? 0) >= 16) return 'That is plenty of lines on this sheet.';
      update((s) => {
        const [x, i] = ensureSheet(s);
        return mapSheet(x, i, (sh) => ({ ...sh, lines: [...sh.lines, { start, dots: 0, tapped: s.tapEach, compass: s.compass }].slice(0, 16) }));
      }, `line:${start}`);
      return null;
    },
    /** The next dot on the last line (or to the end of the line). */
    nextDot: (toEnd = false): string | null => {
      const s0 = ref.current;
      const o0 = openSheet(s0);
      const line = o0?.sheet.lines[o0.sheet.lines.length - 1];
      if (!o0 || !line) return 'Start a field line first.';
      const k = o0.sheet.lines.length - 1;
      const full = fieldTrace(v, sheetCfg(o0.sheet), o0.i, k, line, null);
      const max = full.dots.length - 1;
      if (line.dots >= max) return full.reachedS ? 'This line has reached the S pole: start another.' : 'This line has run off the paper (or to a point where the needle is loose): start another.';
      const dots = toEnd ? max : Math.min(max, line.dots + 1, FIELD_MAX_DOTS);
      update((s) => mapSheet(s, o0.i, (sh) => ({ ...sh, lines: sh.lines.map((l, j) => (j === k ? { ...l, dots } : l)) })), toEnd ? 'line-end' : 'dot');
      return null;
    },
    arrows: (): string | null => {
      const o0 = openSheet(ref.current);
      if (!o0 || !o0.sheet.lines.length) return 'Plot some field lines first.';
      update((s) => mapSheet(s, o0.i, (sh) => ({ ...sh, arrows: true })), 'arrows');
      return null;
    },
    setCompassAt: (x: number, y: number) => update((s) => ({ ...s, cx: r1(clamp(x, -FIELD_PAPER.w + 1, FIELD_PAPER.w - 1)), cy: r1(clamp(y, -FIELD_PAPER.h + 1, FIELD_PAPER.h - 1)) })),
    moveCompass: (dx: number, dy: number) => o.setCompassAt(ref.current.cx + dx, ref.current.cy + dy),
    markNeutral: (): string | null => {
      const s0 = ref.current;
      if ((openSheet(s0)?.sheet.neutrals.length ?? 0) >= 6) return 'That is enough marks on this sheet.';
      update((s) => {
        const [x, i] = ensureSheet(s);
        return mapSheet(x, i, (sh) => ({ ...sh, neutrals: [...sh.neutrals, { x: s.cx, y: s.cy }] }));
      }, 'neutral');
      return null;
    },
    unmark: () => {
      const o0 = openSheet(ref.current);
      if (o0?.sheet.neutrals.length) update((s) => mapSheet(s, o0.i, (sh) => ({ ...sh, neutrals: sh.neutrals.slice(0, -1) })), 'unmark');
    },
    // ---------------------------------------------------------------- ELECTROMAGNET
    wind: (n: number) => update((s) => ({ ...s, turns: clamp(n, 0, 120), key: false }), `wind:${n}`),
    setMixed: (b: boolean) => update((s) => ({ ...s, mixed: b }), `winding:${b ? 'mixed' : 'same'}`),
    setCore: (c: EmCore) => update((s) => ({ ...s, core: c }), `core:${c}`),
    setRheo: (x: number) => update((s) => ({ ...s, rheo: Math.round(clamp(x, 0, 1) * 10000) / 10000 })),
    moveRheo: (d: number) => o.setRheo(ref.current.rheo + d),
    closeKey: () => !ref.current.key && burnUpdate((s) => ({ ...s, key: true, heat: 0 }), 'key:on'),
    openKey: () => ref.current.key && update((s) => ({ ...s, key: false, heat: 0 }), 'key:off'),
    lift: (): number | null => {
      const s0 = ref.current;
      if (!s0.key || s0.lifts.length >= 60) return null;
      const l: EmLift = { turns: s0.turns, mixed: s0.mixed, core: s0.core, rheo: s0.rheo, heat: s0.heat };
      update((s) => {
        const lifts = [...s.lifts, l];
        const keys = [...new Set(lifts.map(emSettingKey))];
        const idx = keys.indexOf(emSettingKey(l));
        return withRow({ ...s, lifts, heat: s.heat + 1 }, idx, { N: String(l.turns) });
      }, `lift:${l.turns}:${l.core}`);
      return s0.lifts.length;
    },
    // ---------------------------------------------------------------- INDUCTION
    setCoil: (c: IndCoil) => !ref.current.magIn && update((s) => ({ ...s, coil: c }), `coil:${c}`),
    setPole: (p: 'N' | 'S') => !ref.current.magIn && update((s) => ({ ...s, pole: p }), `pole:${p}`),
    setMagnets: (n: 1 | 2) => !ref.current.magIn && update((s) => ({ ...s, magnets: n }), `magnets:${n}`),
    setSpeed: (sp: 'slow' | 'fast') => update((s) => ({ ...s, speed: sp }), `speed:${sp}`),
    setAxis: (b: boolean) => update((s) => ({ ...s, axis: b }), `axis:${b ? 'on' : 'side'}`),
    setGalvoFar: (b: boolean) => update((s) => ({ ...s, galvoFar: b }), `galvo:${b ? 'far' : 'near'}`),
    move: (kind: IndKind): number | null => {
      const s0 = ref.current;
      if (s0.moves.length >= 40 || (kind === 'in' ? s0.magIn : !s0.magIn)) return null;
      const m: IndMove = { kind, coil: s0.coil, pole: s0.pole, magnets: s0.magnets, speed: s0.speed, axis: s0.axis, galvoFar: s0.galvoFar };
      const k = s0.moves.length;
      update((s) => withRow({ ...s, moves: [...s.moves, m], magIn: kind === 'in' ? true : kind === 'out' ? false : s.magIn }, k), `move:${kind}`);
      return k;
    },
    // ---------------------------------------------------------------- DIODE
    setBias: (b: 'fwd' | 'rev') => burnUpdate((s) => ({ ...s, bias: b }), `bias:${b}`),
    setResistor: (b: boolean) => burnUpdate((s) => ({ ...s, resistor: b }), `resistor:${b ? 'in' : 'out'}`),
    setVm: (x: 'diode' | 'both') => update((s) => ({ ...s, vm: x }), `vm:${x}`),
    setRange: (x: 1 | 10) => update((s) => ({ ...s, range: x }), `range:${x}`),
    setPot: (x: number) => burnUpdate((s) => ({ ...s, pot: Math.round(clamp(x, 0, 1) * 10000) / 10000 })),
    movePot: (d: number) => o.setPot(ref.current.pot + d),
    replaceDiode: () => update((s) => ({ ...s, burnt: false }), 'replace'),
    read: (): number | null => {
      const s0 = ref.current;
      if (!s0.key || s0.reads.length >= 40) return null;
      const k = s0.reads.length;
      update((s) => withRow({ ...s, reads: [...s.reads, { ...diodeNow(s), range: s.range, open: s.burnt }], heat: s.heat + 1 }, k), `read:${s0.bias}`);
      return k;
    },
    // ---------------------------------------------------------------- the notebook
    setRowCell: (key: number, col: string, value: string) => update((s) => ({ ...s, rows: s.rows.map((r) => (r.key === key ? { ...r, c: { ...r.c, [col]: value.slice(0, 40) } } : r)) })),
    removeRow: (key: number) => update((s) => ({ ...s, rows: s.rows.filter((r) => r.key !== key) }), `remove-row:${key}`),
    setCell: (id: string, value: string) => update((s) => ({ ...s, cells: { ...s.cells, [id]: value.slice(0, 40) } })),
    setAnswer: (id: MagAnswerId, key: 'value' | 'unit', value: string) => update((s) => ({ ...s, answers: { ...s.answers, [id]: { ...s.answers[id], [key]: value.slice(0, 40) } } })),
  };
  return o;
}
export type Magnetism = ReturnType<typeof useMagnetism>;
