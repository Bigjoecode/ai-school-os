import {
  AGAR_CLOCK_MAX,
  AGAR_LOOK,
  AGAR_MAX_CUBES,
  OSMO_PRACTICAL_TASKS,
  PLAS_CLOCK_MAX,
  POTATO_CLOCK_MAX,
  POTATO_MAX_CYL,
  agarClearTime,
  bioOsmosisVariant,
  emptyAgarRow,
  emptyBioOsmosisState,
  emptyPotatoRow,
  potatoPhase,
  roundDp,
  type AgarAcid,
  type AgarSize,
  type BioOsmosisState,
  type BioOsmosisVariant,
  type OsmoTask,
  type PlasMedium,
  type PlasObjective,
} from '@aischool/shared';
import { useEffect, useMemo, useRef } from 'react';
import type { SimulatorProps } from '../types';

/**
 * The osmosis bench's actions, shared by the 2D and the 3D lab so both
 * produce exactly the same `BioOsmosisState`. Every change goes through
 * `update`, which appends to the action log.
 */

export type OsmoUpdate = (fn: (s: BioOsmosisState) => BioOsmosisState, log?: string) => void;
export const lessonTask = (practicalId?: string): OsmoTask => (practicalId ? OSMO_PRACTICAL_TASKS[practicalId] : undefined) ?? 'POTATO';

/** What to do next (practice mode only). */
export function nextHint(_v: BioOsmosisVariant, s: BioOsmosisState): string {
  const task = s.task ?? 'POTATO';
  if (task === 'POTATO') {
    const w = s.potato;
    if (w.cyl.length < 5) return 'Bore cylinders from the potato with the cork borer: one for distilled water and one for each sucrose solution (at least five).';
    if (w.cyl.some((c) => !c.trimmed)) return 'Trim every cylinder to exactly 50 mm with the scalpel on the tile.';
    const before = w.cyl.map((c, i) => ({ c, i })).filter((x) => potatoPhase(x.c) === 'B');
    if (before.length) {
      const x = before.find((y) => !w.measures.some((m) => m.cyl === y.i && m.phase === 'B') || !w.weighs.some((m) => m.cyl === y.i && m.phase === 'B'));
      if (x) return x.c.blotB ? `Measure cylinder ${x.i + 1}'s length on the ruler and weigh it.` : `Blot cylinder ${x.i + 1} dry with filter paper, then measure and weigh it.`;
      return 'Put every cylinder into its solution at the same time, then start the soak.';
    }
    if (w.cyl.some((c) => potatoPhase(c) === 'SOAK')) return w.clock - (w.cyl[0]!.placedAt ?? 0) < 30 ? 'Leave the cylinders to soak for at least 30 minutes (better an hour).' : 'Take all the cylinders out together with forceps.';
    const x = w.cyl.map((c, i) => ({ c, i })).find((y) => !w.measures.some((m) => m.cyl === y.i && m.phase === 'A') || !w.weighs.some((m) => m.cyl === y.i && m.phase === 'A'));
    if (x) return x.c.blotA ? `Measure and weigh cylinder ${x.i + 1} again, and feel whether it is firm or soft.` : `Blot cylinder ${x.i + 1} gently with filter paper before measuring and weighing it.`;
    if (!w.line) return 'Work out each % change, then plot % change in mass against concentration and draw the best line.';
    return 'Read the isotonic concentration where your line crosses 0 %, then write your precautions and explanation.';
  }
  if (task === 'PLASMOLYSIS') {
    const w = s.plas;
    if (!w.peeled) return 'Peel a thin strip of the coloured epidermis with forceps.';
    if (!w.mount) return 'Mount it flat in a drop of distilled water on a slide.';
    if (!w.coverslip) return 'Lower a cover slip onto it at an angle with a mounted needle.';
    if (!w.onStage) return 'Put the slide on the microscope stage.';
    if (!w.captures.length) return 'Look at it under low power (×10) and record the view.';
    if (!w.irrigations.length) return w.captures.some((c) => c.objective === 40) ? 'Put a drop of strong salt or sucrose solution at one edge of the cover slip and draw it under with filter paper at the other.' : 'Turn to high power (×40) and record a view of the turgid cells.';
    return 'Wait 5–10 minutes, record the view and count the cells; then draw water under and look again after 10 minutes.';
  }
  const w = s.agar;
  if (w.cubes.length < 3) return 'Cut cubes of pink agar with sides 1 cm, 2 cm and 3 cm on the tile — and a spare cube to cut open later.';
  if (w.cubes.some((_, i) => !w.measured.includes(i))) return 'Measure the side of each cube with the ruler.';
  if (!w.acid) return 'Pour enough dilute hydrochloric acid into the beaker to cover all the cubes.';
  if (w.cubes.some((c) => c.placedAt === null)) return 'Put all the cubes into the acid at the same moment and start the stopwatch.';
  if (!w.cubes.some((c) => c.cutAt !== null)) return 'After about 5 minutes take the spare cube out, cut it in half and measure the depth of the colourless zone.';
  return 'Watch the cubes and note the time when each becomes completely colourless.';
}

/** `variant`: use these values instead of the seed's (the 3D lab's demo and sandbox). */
export function useOsmosis({ seed, state, onChange, readOnly, startedAt, practicalId, variant }: Pick<SimulatorProps<'bio-osmosis'>, 'seed' | 'state' | 'onChange' | 'readOnly' | 'startedAt' | 'practicalId'> & { variant?: BioOsmosisVariant }) {
  const task: OsmoTask = state.task ?? lessonTask(practicalId);
  const v = useMemo(() => variant ?? bioOsmosisVariant(seed, task), [variant, seed, task]);
  const t0 = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const ref = useRef(state);
  ref.current = state;

  const update: OsmoUpdate = (fn, log) => {
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
  const chooseTask = (t: OsmoTask) => update((s) => ({ ...emptyBioOsmosisState(), log: s.log, task: t }), `task:${t}`);
  const pot = (fn: (w: BioOsmosisState['potato']) => BioOsmosisState['potato'], log: string) => update((s) => ({ ...s, potato: fn(s.potato) }), log);
  const plas = (fn: (w: BioOsmosisState['plas']) => BioOsmosisState['plas'], log: string) => update((s) => ({ ...s, plas: fn(s.plas) }), log);
  const agar = (fn: (w: BioOsmosisState['agar']) => BioOsmosisState['agar'], log: string) => update((s) => ({ ...s, agar: fn(s.agar) }), log);
  const P = () => ref.current.potato;
  const L = () => ref.current.plas;
  const A = () => ref.current.agar;

  // ---------------------------------------------------------------- potato
  const potato = {
    /** Bores a cylinder for the solution `conc` (−1 at the limit, or once soaking has started). */
    bore: (conc: number): number => {
      const w = P();
      if (w.cyl.length >= POTATO_MAX_CYL || w.cyl.some((c) => c.placedAt !== null)) return -1;
      pot((x) => ({ ...x, cyl: [...x.cyl, { conc, trimmed: false, placedAt: null, removedAt: null, blotB: false, blotA: false }], rows: [...x.rows, emptyPotatoRow()] }), `bore:${conc}`);
      return w.cyl.length;
    },
    discard: (i: number) => {
      const w = P();
      if (w.cyl[i]?.placedAt !== null || w.measures.some((m) => m.cyl === i) || w.weighs.some((m) => m.cyl === i)) return;
      pot((x) => ({ ...x, cyl: x.cyl.filter((_, k) => k !== i), rows: x.rows.filter((_, k) => k !== i) }), `discard#${i + 1}`);
    },
    trim: (i: number) => {
      const c = P().cyl[i];
      if (!c || c.trimmed || c.placedAt !== null || P().measures.some((m) => m.cyl === i)) return;
      pot((x) => ({ ...x, cyl: x.cyl.map((y, k) => (k === i ? { ...y, trimmed: true } : y)) }), `trim#${i + 1}`);
    },
    trimAll: () => {
      const idx = P().cyl.map((c, i) => ({ c, i })).filter((x) => !x.c.trimmed && x.c.placedAt === null && !P().measures.some((m) => m.cyl === x.i));
      if (!idx.length) return;
      pot((x) => ({ ...x, cyl: x.cyl.map((y, k) => (idx.some((z) => z.i === k) ? { ...y, trimmed: true } : y)) }), 'trim:all');
    },
    blot: (i: number) => {
      const c = P().cyl[i];
      if (!c) return;
      const ph = potatoPhase(c);
      if (ph === 'SOAK') return;
      pot((x) => ({ ...x, cyl: x.cyl.map((y, k) => (k === i ? (ph === 'B' ? { ...y, blotB: true } : { ...y, blotA: true }) : y)) }), `blot#${i + 1}`);
    },
    measure: (i: number) => {
      const c = P().cyl[i];
      if (!c) return;
      const ph = potatoPhase(c);
      if (ph === 'SOAK' || P().measures.length >= 120) return;
      pot((x) => ({ ...x, measures: [...x.measures, { cyl: i, phase: ph }] }), `measure#${i + 1}`);
    },
    weigh: (i: number) => {
      const c = P().cyl[i];
      if (!c) return;
      const ph = potatoPhase(c);
      if (ph === 'SOAK' || P().weighs.length >= 120) return;
      pot((x) => ({ ...x, weighs: [...x.weighs, { cyl: i, phase: ph, blotted: ph === 'B' ? c.blotB : c.blotA }] }), `weigh#${i + 1}`);
    },
    place: (i: number) => {
      const c = P().cyl[i];
      if (!c || c.placedAt !== null) return;
      pot((x) => ({ ...x, cyl: x.cyl.map((y, k) => (k === i ? { ...y, placedAt: x.clock, blotA: false } : y)) }), `place#${i + 1}`);
    },
    placeAll: () => {
      if (!P().cyl.some((c) => c.placedAt === null)) return;
      pot((x) => ({ ...x, cyl: x.cyl.map((y) => (y.placedAt === null ? { ...y, placedAt: x.clock, blotA: false } : y)) }), 'place:all');
    },
    wait: (min: number) => {
      if (!P().cyl.some((c) => potatoPhase(c) === 'SOAK') || P().clock >= POTATO_CLOCK_MAX) return;
      pot((x) => ({ ...x, clock: Math.min(POTATO_CLOCK_MAX, x.clock + min) }), `wait:${min}`);
    },
    remove: (i: number) => {
      const c = P().cyl[i];
      if (!c || potatoPhase(c) !== 'SOAK') return;
      pot((x) => ({ ...x, cyl: x.cyl.map((y, k) => (k === i ? { ...y, removedAt: x.clock } : y)) }), `remove#${i + 1}`);
    },
    removeAll: () => {
      if (!P().cyl.some((c) => potatoPhase(c) === 'SOAK')) return;
      pot((x) => ({ ...x, cyl: x.cyl.map((y) => (potatoPhase(y) === 'SOAK' ? { ...y, removedAt: x.clock } : y)) }), 'remove:all');
    },
  };

  // ---------------------------------------------------------------- plasmolysis
  const plasmolysis = {
    peel: () => !L().peeled && plas((x) => ({ ...x, peeled: true }), 'peel'),
    mount: (m: PlasMedium) => L().peeled && !L().mount && plas((x) => ({ ...x, mount: m }), `mount:${m}`),
    coverslip: () => !!L().mount && !L().coverslip && plas((x) => ({ ...x, coverslip: true }), 'coverslip'),
    toStage: () => L().coverslip && !L().onStage && plas((x) => ({ ...x, onStage: true }), 'stage'),
    objective: (o: PlasObjective) => L().objective !== o && plas((x) => ({ ...x, objective: o }), `obj:${o}`),
    /** A drop of `to` at one edge of the cover slip (not yet drawn under). */
    drop: (to: PlasMedium) => {
      const w = L();
      if (!w.coverslip || w.irrigations.length >= 12) return;
      plas((x) => ({ ...x, irrigations: [...x.irrigations, { to, at: x.clock, drawn: false }] }), `drop:${to}`);
    },
    /** Filter paper at the opposite edge: draws the last drop under the cover slip (straight after the drop). */
    drawThrough: () => {
      const w = L();
      const last = w.irrigations.at(-1);
      if (!last || last.drawn || last.at !== w.clock) return;
      plas((x) => ({ ...x, irrigations: x.irrigations.map((y, k) => (k === x.irrigations.length - 1 ? { ...y, drawn: true } : y)) }), 'draw');
    },
    wait: (min: number) => {
      const w = L();
      if (!w.mount || w.clock >= PLAS_CLOCK_MAX) return;
      plas((x) => ({ ...x, clock: roundDp(Math.min(PLAS_CLOCK_MAX, x.clock + min), 2) }), `wait:${min}`);
    },
    capture: () => {
      const w = L();
      if (!w.onStage || w.captures.length >= 40 || w.captures.some((c) => c.at === w.clock && c.objective === w.objective)) return;
      plas((x) => ({ ...x, captures: [...x.captures, { at: x.clock, objective: x.objective }] }), `capture@${w.clock}x${w.objective}`);
    },
  };

  // ---------------------------------------------------------------- agar
  const agarActs = {
    cut: (size: AgarSize): number => {
      const w = A();
      if (w.cubes.length >= AGAR_MAX_CUBES || w.cubes.some((c) => c.placedAt !== null)) return -1;
      agar((x) => ({ ...x, cubes: [...x.cubes, { size, placedAt: null, cutAt: null }], rows: [...x.rows, emptyAgarRow()] }), `cube:${size}`);
      return w.cubes.length;
    },
    discard: (i: number) => {
      const w = A();
      if (w.cubes[i]?.placedAt !== null) return;
      agar((x) => ({ ...x, cubes: x.cubes.filter((_, k) => k !== i), rows: x.rows.filter((_, k) => k !== i), measured: x.measured.filter((k) => k !== i).map((k) => (k > i ? k - 1 : k)) }), `discard-cube#${i + 1}`);
    },
    measure: (i: number) => A().cubes[i] && A().measured.length < AGAR_MAX_CUBES * 4 && agar((x) => ({ ...x, measured: x.measured.includes(i) ? x.measured : [...x.measured, i] }), `measure-cube#${i + 1}`),
    pour: (acid: AgarAcid) => !A().cubes.some((c) => c.placedAt !== null) && agar((x) => ({ ...x, acid }), `acid:${acid}`),
    place: (i: number) => {
      const w = A();
      if (!w.acid || w.cubes[i]?.placedAt !== null) return;
      agar((x) => ({ ...x, cubes: x.cubes.map((c, k) => (k === i ? { ...c, placedAt: x.clock } : c)) }), `place-cube#${i + 1}`);
    },
    placeAll: () => {
      const w = A();
      if (!w.acid || !w.cubes.some((c) => c.placedAt === null)) return;
      agar((x) => ({ ...x, cubes: x.cubes.map((c) => (c.placedAt === null ? { ...c, placedAt: x.clock } : c)) }), 'place-cube:all');
    },
    /** Watches the beaker for `min` minutes (time-lapse); `away`: leaves it unwatched. */
    wait: (min: number, away = false) => {
      const w = A();
      if (!w.cubes.some((c) => c.placedAt !== null) || w.clock >= AGAR_CLOCK_MAX) return;
      let to = Math.min(AGAR_CLOCK_MAX, w.clock + min);
      // Watching, the time-lapse stops at the look when a cube is first seen completely colourless.
      if (!away)
        w.cubes.forEach((c, i) => {
          if (c.placedAt === null || c.cutAt !== null) return;
          const seen = Math.ceil((c.placedAt + agarClearTime(v.agar, i, c, w) - 1e-9) / AGAR_LOOK) * AGAR_LOOK;
          if (seen > w.clock + 1e-9 && seen < to - 1e-9) to = roundDp(seen, 2);
        });
      agar((x) => ({ ...x, clock: to, away: away ? [...x.away, [x.clock, to] as [number, number]].slice(-60) : x.away }), `${away ? 'away' : 'wait'}:${min}`);
    },
    cutOpen: (i: number) => {
      const c = A().cubes[i];
      if (!c || c.placedAt === null || c.cutAt !== null) return;
      agar((x) => ({ ...x, cubes: x.cubes.map((y, k) => (k === i ? { ...y, cutAt: x.clock } : y)) }), `cutopen#${i + 1}`);
    },
    measureDepth: (i: number) => {
      const c = A().cubes[i];
      if (!c || c.cutAt === null) return;
      agar((x) => ({ ...x, depthMeasured: x.depthMeasured.includes(i) ? x.depthMeasured : [...x.depthMeasured, i], depth: { ...x.depth, cube: i } }), `depth#${i + 1}`);
    },
  };

  return { v, task, ref, update, note, chooseTask, potato, plasmolysis, agar: agarActs };
}
export type Osmosis = ReturnType<typeof useOsmosis>;
