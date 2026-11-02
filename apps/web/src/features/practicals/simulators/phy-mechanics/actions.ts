import {
  FORCES_DOT,
  FORCES_PIECES,
  FRICTION_SLOTS,
  INCLINE_BLOCKS_MAX,
  INCLINE_STOP_MAX,
  INCLINE_STOP_MIN,
  MECH_MAX_ROWS,
  VISC_BAND_MAX,
  VISC_BAND_MIN,
  VISC_BALLS,
  frictionPull,
  frictionTilt,
  frictionWeight,
  inclineReadings,
  phyMechanicsVariant,
  sbShows,
  viscReadings,
  type ForceSet,
  type ForceThread,
  type MechAnswerId,
  type MechTask,
  type PhyMechanicsState,
  type PhyMechanicsVariant,
  type ViscLiquid,
} from '@aischool/shared';
import { useEffect, useMemo } from 'react';
import { useLabUpdate } from '../phy-common';

/**
 * The mechanics lab's state transitions, shared by the 2D and the 3D lab so
 * both produce exactly the same state and action log: the friction block and
 * spring balance, the viscosity cylinder and stop-clock, the incline, and the
 * force board. Each measurement is appended to the state when it is made; the
 * instrument's reading comes from the shared physics (the same numbers the
 * grader checks).
 */

/** Lessons → tasks. */
export const LESSON_TASK: Record<string, MechTask> = {
  'pr-phy-coefficient-of-friction': 'FRICTION',
  'pr-phy-viscosity-terminal-velocity': 'VISCOSITY',
  'pr-phy-inclined-plane-acceleration': 'INCLINE',
  'pr-phy-parallelogram-of-forces': 'FORCES',
};
export const lessonTask = (practicalId?: string): MechTask => (practicalId && LESSON_TASK[practicalId]) || 'FRICTION';
export const TASK_NAME: Record<MechTask, string> = {
  FRICTION: 'Coefficient of static friction',
  VISCOSITY: 'Terminal velocity in a viscous liquid',
  INCLINE: 'Uniform acceleration down an incline',
  FORCES: 'Parallelogram of forces',
};
export const r1 = (x: number) => Math.round(x * 10) / 10;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const half = (x: number) => Math.round(x * 2) / 2;

/** The sheet on the board now (null: none, or the last one has been taken off). */
export const boardSheet = (s: PhyMechanicsState): { set: ForceSet; i: number } | null => {
  const i = s.sets.length - 1;
  const set = s.sets[i];
  return set && !set.off ? { set, i } : null;
};
/** The stop-clock's display now (s): 0 after a reset, else the last timing (added on, if it was not reset). */
export function clockShows(v: PhyMechanicsVariant, s: PhyMechanicsState): number {
  if (s.reset) return 0;
  const xs = s.task === 'INCLINE' ? inclineReadings(v, s.runs) : viscReadings(v, s.drops);
  return xs[xs.length - 1] ?? 0;
}
/** The last pull's two readings (limiting, sliding) and the last weighing (N, as the balance shows). */
export function lastPull(v: PhyMechanicsVariant, s: PhyMechanicsState) {
  const k = s.pulls.length - 1;
  return k < 0 ? null : { k, load: s.pulls[k]!.load, ...frictionPull(v, k, s.pulls[k]!) };
}
export function lastWeigh(v: PhyMechanicsVariant, s: PhyMechanicsState) {
  const w = s.weighs[s.weighs.length - 1];
  return w ? { load: w.load, reading: sbShows(v, frictionWeight(v, w.load), w.zeroed) } : null;
}
export const lastTilt = (v: PhyMechanicsVariant, s: PhyMechanicsState) => {
  const k = s.tilts.length - 1;
  return k < 0 ? null : frictionTilt(v, k, s.tilts[k]!);
};

export function mechHint(s: PhyMechanicsState): string {
  switch (s.task) {
    case 'FRICTION':
      if (!s.zeroed) return 'Check the spring balance’s zero first, and adjust it.';
      if (!s.wiped) return 'Wipe the plank clean and dry.';
      if (s.tilt) return s.tilts.length < 2 ? `Raise the plank slowly until the block just slips; read the angle. ${s.tilts.length} of at least 2.` : 'Fill in θ, its mean and μ = tan θ.';
      if (s.pulls.length < 8) return `Weigh the block with its load (R), then pull slowly and read the balance just as it starts to move. Loads done: ${new Set(s.pulls.map((p) => p.load)).size} of at least 4, each twice.`;
      return 'Raise the plank to find the angle of slipping, then plot F against R and find μ.';
    case 'VISCOSITY':
      if (s.top < 6) return 'Move the upper band down to about 8 cm below the surface, and the lower one 20 cm below it.';
      if (!s.cells.L?.trim()) return 'Measure the distance between the bands with the metre rule and write it down.';
      if (!s.measured.includes(s.ball)) return 'Measure this ball’s diameter with the micrometer.';
      return `Reset the stop-clock, drop the ball at the centre and read the time between the bands. Balls timed: ${new Set(s.drops.filter((d) => d.liquid === 'glycerine').map((d) => d.ball)).size} of at least 4, each twice.`;
    case 'INCLINE':
      return `Reset the stop-clock, let the ball go from rest at the start line and read the time to the stopping block. Distances: ${new Set(s.runs.map((r) => r.stop)).size} of at least 4, each three times.`;
    case 'FORCES': {
      const sh = boardSheet(s);
      if (!s.tapped) return 'Hang the loads, then tap the board gently so the knot settles.';
      if (sh && sh.set.dots.length < 6) return 'Mark two dots, well apart, under each thread.';
      if (sh) return 'Take the paper off and draw the lines through the dots.';
      return 'Draw OA and OB to your scale, complete the parallelogram, then measure the diagonal.';
    }
    default:
      return 'Choose the experiment first.';
  }
}

export function useMechanics({
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
  state: PhyMechanicsState;
  onChange: (next: PhyMechanicsState) => void;
  readOnly: boolean;
  startedAt: string;
  practicalId?: string;
  /** A custom variant (the sandbox). */
  variant?: PhyMechanicsVariant;
  /** Pre-select the experiment from the lesson on opening (the attempt; not the demo or sandbox). */
  autoTask?: boolean;
}) {
  const seeded = useMemo(() => phyMechanicsVariant(seed), [seed]);
  const v = variant ?? seeded;
  const { update, ref } = useLabUpdate(state, onChange, readOnly, startedAt);
  useEffect(() => {
    if (autoTask && !readOnly && !ref.current.task && ref.current.log.length < 3) {
      const t = lessonTask(practicalId);
      update((s) => (s.task ? s : { ...s, task: t }), 'task:auto');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, practicalId]);
  const task: MechTask = state.task ?? 'FRICTION';
  /** A table row for the key (added at the first measurement with it). */
  const withRow = (s: PhyMechanicsState, key: number, c: Record<string, string> = {}): PhyMechanicsState =>
    s.rows.some((r) => r.key === key) || s.rows.length >= MECH_MAX_ROWS ? s : { ...s, rows: [...s.rows, { key, c }] };
  const o = {
    v,
    update,
    ref,
    task,
    chooseTask: (t: MechTask) => update((s) => ({ ...s, task: t, line: null }), `task:${t}`),
    /** A step with no field in the state (collecting apparatus, the briefing): written to the action log only. */
    note: (a: string) => update((s) => s, a),
    // ---------------------------------------------------------------- FRICTION
    zero: () => update((s) => ({ ...s, zeroed: true }), 'zero'),
    wipe: () => update((s) => ({ ...s, wiped: true }), 'wipe'),
    setLoad: (n: number) => {
      const L = clamp(Math.round(n), 0, FRICTION_SLOTS);
      if (L !== ref.current.load) update((s) => ({ ...s, load: L }), `load:${L}`);
    },
    setJerk: (b: boolean) => update((s) => ({ ...s, jerk: b }), `pull-style:${b ? 'jerk' : 'slow'}`),
    setFast: (b: boolean) => update((s) => ({ ...s, fast: b }), `raise-style:${b ? 'fast' : 'slow'}`),
    setTilt: (b: boolean) => update((s) => ({ ...s, tilt: b }), b ? 'plank:tilt' : 'plank:flat'),
    weigh: () => {
      const s0 = ref.current;
      if (s0.weighs.length >= 40) return;
      update((s) => withRow({ ...s, weighs: [...s.weighs, { load: s.load, zeroed: s.zeroed }] }, s.load, { m: String(s.load * 100) }), `weigh:${s0.load}`);
    },
    pull: (): number | null => {
      const s0 = ref.current;
      if (s0.tilt || s0.pulls.length >= 40) return null;
      update((s) => withRow({ ...s, pulls: [...s.pulls, { load: s.load, zeroed: s.zeroed, jerk: s.jerk, wiped: s.wiped }] }, s.load, { m: String(s.load * 100) }), `pull:${s0.load}`);
      return s0.pulls.length;
    },
    raise: (): number | null => {
      const s0 = ref.current;
      if (!s0.tilt || s0.tilts.length >= 20) return null;
      update((s) => ({ ...s, tilts: [...s.tilts, { load: s.load, fast: s.fast, wiped: s.wiped }] }), `tilt:${s0.load}`);
      return s0.tilts.length;
    },
    // ---------------------------------------------------------------- VISCOSITY
    chooseBall: (b: number) => update((s) => ({ ...s, ball: clamp(b, 0, VISC_BALLS.length - 1) }), `ball:${b}`),
    measure: () => {
      const b = ref.current.ball;
      update((s) => withRow({ ...s, measured: s.measured.includes(b) ? s.measured : [...s.measured, b].slice(-20) }, b), `measure:${b}`);
    },
    setLiquid: (l: ViscLiquid) => update((s) => ({ ...s, liquid: l }), `liquid:${l}`),
    setBand: (which: 'top' | 'bot', cm: number) => update((s) => ({ ...s, [which]: clamp(half(cm), VISC_BAND_MIN, VISC_BAND_MAX) })),
    moveBand: (which: 'top' | 'bot', d: number) => o.setBand(which, ref.current[which] + d),
    setCentre: (b: boolean) => update((s) => ({ ...s, centre: b }), `release:${b ? 'centre' : 'wall'}`),
    setEyeLevel: (b: boolean) => update((s) => ({ ...s, eyeLevel: b }), `eye:${b ? 'level' : 'fixed'}`),
    resetClock: () => update((s) => ({ ...s, reset: true }), 'reset'),
    drop: (): number | null => {
      const s0 = ref.current;
      if (s0.drops.length >= 40) return null;
      update((s) => {
        const next = { ...s, reset: false, drops: [...s.drops, { ball: s.ball, liquid: s.liquid, centre: s.centre, eyeLevel: s.eyeLevel, top: s.top, bot: s.bot, reset: s.reset }] };
        return s.liquid === 'glycerine' ? withRow(next, s.ball) : next;
      }, `drop:${s0.ball}:${s0.liquid}`);
      return s0.drops.length;
    },
    // ---------------------------------------------------------------- INCLINE
    setBlocks: (n: number) => update((s) => ({ ...s, blocks: clamp(Math.round(n), 0, INCLINE_BLOCKS_MAX) }), `blocks:${clamp(Math.round(n), 0, INCLINE_BLOCKS_MAX)}`),
    setStop: (cm: number) => update((s) => ({ ...s, stop: clamp(Math.round(cm), INCLINE_STOP_MIN, INCLINE_STOP_MAX) })),
    moveStop: (d: number) => o.setStop(ref.current.stop + d),
    setPush: (b: boolean) => update((s) => ({ ...s, push: b }), `release:${b ? 'push' : 'rest'}`),
    roll: (): number | null => {
      const s0 = ref.current;
      if (s0.runs.length >= 40 || s0.blocks < 1) return null;
      update((s) => withRow({ ...s, reset: false, runs: [...s.runs, { blocks: s.blocks, stop: s.stop, push: s.push, reset: s.reset }] }, s.stop, { s: (s.stop / 100).toFixed(2) }), `run:${s0.stop}`);
      return s0.runs.length;
    },
    // ---------------------------------------------------------------- FORCES
    setMass: (th: ForceThread, n: number) => {
      const k = clamp(Math.round(n), 0, FORCES_PIECES);
      if (ref.current.masses[th] === k) return;
      update((s) => {
        const sh = boardSheet(s);
        const sets = sh && sh.set.dots.length ? s.sets.map((x, i) => (i === sh.i ? { ...x, moved: true } : x)) : sh ? s.sets.map((x, i) => (i === sh.i ? { ...x, ...s.masses, [th]: k } : x)) : s.sets;
        return { ...s, masses: { ...s.masses, [th]: k }, tapped: false, sets };
      }, `mass:${th}:${k}`);
    },
    tap: () => update((s) => ({ ...s, tapped: true }), 'tap'),
    /** A pencil dot under a thread, near the knot or far from it (a fresh sheet goes on the board if needed). */
    dot: (th: ForceThread, far: boolean): string | null => {
      const s0 = ref.current;
      const sh = boardSheet(s0);
      if (!sh && s0.sets.length >= 4) return 'Four sheets is the most.';
      if (sh && sh.set.dots.length >= 12) return 'That is plenty of dots on this sheet.';
      const d = far ? FORCES_DOT.far : FORCES_DOT.near;
      update((s) => {
        const cur = boardSheet(s);
        const sets = cur ? s.sets : [...s.sets, { ...s.masses, dots: [], moved: false, off: false, built: false }];
        const i = cur ? cur.i : sets.length - 1;
        return { ...s, sets: sets.map((x, j) => (j === i ? { ...x, dots: [...x.dots, { th, d, tapped: s.tapped }] } : x)) };
      }, `dot:${th}:${d}`);
      return null;
    },
    paperOff: (): string | null => {
      const s0 = ref.current;
      const sh = boardSheet(s0);
      if (!sh) return 'There is no marked sheet on the board.';
      update((s) => withRow({ ...s, sets: s.sets.map((x, i) => (i === sh.i ? { ...x, off: true } : x)) }, sh.i), 'paper-off');
      return null;
    },
    /** OA and OB along the lines (from the row) and the parallelogram completed. */
    build: (i: number): string | null => {
      const s0 = ref.current;
      const set = s0.sets[i];
      const row = s0.rows.find((r) => r.key === i);
      if (!set || !set.off) return 'Take the sheet off the board and draw the lines first.';
      const oa = Number(row?.c.OA);
      const ob = Number(row?.c.OB);
      if (!row?.c.OA?.trim() || !row?.c.OB?.trim() || !(oa > 0) || !(ob > 0)) return 'Write the lengths OA and OB (cm, from your scale) in the table first.';
      update((s) => ({ ...s, sets: s.sets.map((x, j) => (j === i ? { ...x, built: true } : x)) }), `build:${i}`);
      return null;
    },
    // ---------------------------------------------------------------- the notebook
    setRowCell: (key: number, col: string, value: string) => update((s) => ({ ...s, rows: s.rows.map((r) => (r.key === key ? { ...r, c: { ...r.c, [col]: value.slice(0, 40) } } : r)) })),
    removeRow: (key: number) => update((s) => ({ ...s, rows: s.rows.filter((r) => r.key !== key) }), `remove-row:${key}`),
    setCell: (id: string, value: string) => update((s) => ({ ...s, cells: { ...s.cells, [id]: value.slice(0, 40) } })),
    setAnswer: (id: MechAnswerId, key: 'value' | 'unit', value: string) => update((s) => ({ ...s, answers: { ...s.answers, [id]: { ...s.answers[id], [key]: value.slice(0, 40) } } })),
  };
  return o;
}
export type Mechanics = ReturnType<typeof useMechanics>;
