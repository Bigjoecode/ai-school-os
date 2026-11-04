import {
  AIR_MIN,
  DISSECT_PRACTICAL_TASKS,
  EOSIN_CLOCK_MAX,
  EOSIN_MAX_READS,
  EOSIN_MAX_SECTIONS,
  EOSIN_MIN_READS,
  MICRO_DAYS_MAX,
  PLATES,
  RAT_MAX_MEASURES,
  bioDissectionVariant,
  emptyBioDissectionState,
  roundDp,
  type BioDissectionState,
  type BioDissectionVariant,
  type DissectTask,
  type EosinPlace,
  type IncTemp,
  type Plate,
  type RatHow,
  type RatPart,
} from '@aischool/shared';
import { useEffect, useMemo, useRef } from 'react';
import type { SimulatorProps } from '../types';

/**
 * The dissection bench's actions, shared by the 2D and the 3D lab so both
 * produce exactly the same `BioDissectionState`. Every change goes through
 * `update`, which appends to the action log.
 */

export type DissectUpdate = (fn: (s: BioDissectionState) => BioDissectionState, log?: string) => void;
export const lessonTask = (practicalId?: string): DissectTask => (practicalId ? DISSECT_PRACTICAL_TASKS[practicalId] : undefined) ?? 'EOSIN';
export const plateName = (k: number) => `the ${['control', 'air', 'unwashed-finger', 'washed-finger'][k]} plate`;

/** What to do next (practice mode only). */
export function nextHint(_v: BioDissectionVariant, s: BioDissectionState): string {
  const task = s.task ?? 'EOSIN';
  if (task === 'EOSIN') {
    const w = s.eosin;
    if (!w.wash) return 'Wash the roots of the balsam seedling gently, free of soil.';
    if (!w.dye) return 'Stand the roots in the beaker of eosin and start the stopwatch.';
    if (!w.place) return 'Put it in a well-lit, airy place.';
    if (!w.sections.length) {
      if (w.clock < 10) return 'Leave it a while (time-lapse), then read the height of the red line with the ruler.';
      if (!w.reads.includes(w.clock)) return `${w.clock} min: read the height of the red line from the dye surface.`;
      if (w.reads.length < EOSIN_MIN_READS + 1 || w.clock < 100) return 'Leave it another 20 minutes and read again.';
      if (w.leafLook === null) return 'Look at the leaves: have the veins turned red?';
      return 'Now cut thin transverse sections at different heights — one low down, one above the red line — and a longitudinal one.';
    }
    if (w.views.length < w.sections.length) return 'Examine each section with the hand lens or under the microscope.';
    return 'Record what each section shows, work out the rate, label the drawing and choose your conclusions.';
  }
  if (task === 'RAT') {
    const w = s.rat;
    if (!w.gloves) return 'Put on gloves.';
    if (!w.pinned) return 'Pin the rat on its back (ventral side up) by its four limbs.';
    if (!w.measures.some((m) => m.what === 'BODY')) return 'Measure the body from the snout to the anus.';
    if (!w.skin) return 'Lift the skin of the lower abdomen with forceps and cut along the midline up to the jaw.';
    if (!w.skinPinned) return 'Make the side cuts and pin the skin back.';
    if (!w.wall) return 'Lift the muscle wall with forceps and cut it the same way.';
    if (!w.moist) return 'Keep the specimen moist: wet it with water.';
    if (!w.display) return 'Displace the gut gently to one side with the seeker.';
    if (!w.unravelled) return 'Unravel the gut with the seeker without tearing the mesentery.';
    if (!w.measures.some((m) => m.what === 'SI')) return 'Measure the small intestine with a damp thread.';
    if (!w.measures.some((m) => m.what === 'LI')) return 'Measure the large intestine with a damp thread.';
    if (!w.cleaned) return 'Disinfect the tools and the board.';
    return 'Label the drawing, work out the ratio and choose your conclusions.';
  }
  const w = s.micro;
  if (!w.wiped) return 'Wipe the bench with disinfectant.';
  if (w.incAt === null) {
    if (w.plates.some((p) => p.label !== 'BASE')) return 'Label each plate on its base: control, air, unwashed finger, washed finger.';
    if (!w.plates[1]!.airMin) return `Take the lid off the air plate for ${AIR_MIN} minutes.`;
    if (!w.plates[2]!.touch) return 'Lift the lid of the unwashed-finger plate slightly and touch the agar lightly.';
    if (!w.soaped) return 'Wash your hands with soap and water.';
    if (!w.plates[3]!.touch) return 'Touch the washed-finger plate the same way.';
    if (w.plates.some((p) => !p.tape)) return 'Tape each lid with two short strips.';
    if (!w.inverted) return 'Turn the plates upside down.';
    return 'Put them in the incubator at 25–30 °C.';
  }
  if (w.breadAt === null) {
    if (!w.breadExposed) return 'Expose the moist bread to the air for 30 minutes.';
    if (w.slices.some((x) => x.moist === null || x.place === null)) return 'Slice A: moist, warm. Slice B: dry, warm. Slice C: moist, in the refrigerator.';
    return 'Put the bread in polythene bags in a warm, dark place.';
  }
  if (w.day - w.incAt < 3) return 'Leave them a day (time-lapse).';
  if (w.countAt === null) return 'Count the colonies on each plate without opening it.';
  if (w.lensAt === null) return 'Examine the bread with the hand lens.';
  if (!w.slide) return 'Look at the teacher’s slide of the mould under the microscope.';
  if (!w.dispose) return 'Soak the taped plates in strong disinfectant.';
  return 'Work out the % reduction, label Rhizopus and choose your conclusions.';
}

/** `variant`: use these values instead of the seed's (the 3D lab's demo and sandbox). */
export function useDissect({ seed, state, onChange, readOnly, startedAt, practicalId, variant }: Pick<SimulatorProps<'bio-dissection'>, 'seed' | 'state' | 'onChange' | 'readOnly' | 'startedAt' | 'practicalId'> & { variant?: BioDissectionVariant }) {
  const task: DissectTask = state.task ?? lessonTask(practicalId);
  const v = useMemo(() => variant ?? bioDissectionVariant(seed, task), [variant, seed, task]);
  const t0 = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const ref = useRef(state);
  ref.current = state;

  const update: DissectUpdate = (fn, log) => {
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
  const chooseTask = (t: DissectTask) => update((s) => ({ ...emptyBioDissectionState(), log: s.log, task: t }), `task:${t}`);
  const E = () => ref.current.eosin;
  const R = () => ref.current.rat;
  const M = () => ref.current.micro;
  const ew = (fn: (w: BioDissectionState['eosin']) => BioDissectionState['eosin'], log: string) => update((s) => ({ ...s, eosin: fn(s.eosin) }), log);
  const rw = (fn: (w: BioDissectionState['rat']) => BioDissectionState['rat'], log: string) => update((s) => ({ ...s, rat: fn(s.rat) }), log);
  const mw = (fn: (w: BioDissectionState['micro']) => BioDissectionState['micro'], log: string) => update((s) => ({ ...s, micro: fn(s.micro) }), log);

  // ---------------------------------------------------------------- eosin
  const eosin = {
    wash: (how: 'GENTLE' | 'ROUGH') => !E().wash && ew((w) => ({ ...w, wash: how }), `wash:${how}`),
    dye: () => !!E().wash && !E().dye && ew((w) => ({ ...w, dye: true }), 'dye'),
    place: (p: EosinPlace) => E().clock === 0 && E().place !== p && ew((w) => ({ ...w, place: p }), `place:${p}`),
    wait: (min: number) => {
      const w = E();
      if (!w.dye || w.sections.length || w.clock >= EOSIN_CLOCK_MAX) return false;
      ew((x) => ({ ...x, clock: Math.min(EOSIN_CLOCK_MAX, x.clock + min) }), `wait:${min}m`);
      return true;
    },
    read: () => {
      const w = E();
      if (!w.dye || w.sections.length || w.clock < 1 || w.reads.includes(w.clock) || w.reads.length >= EOSIN_MAX_READS) return false;
      ew((x) => ({ ...x, reads: [...x.reads, x.clock], rows: [...x.rows, ''] }), `read:${w.clock}`);
      return true;
    },
    leaves: () => {
      const w = E();
      if (!w.dye || w.leafLook === w.clock) return false;
      ew((x) => ({ ...x, leafLook: x.clock }), `leaves:${w.clock}`);
      return true;
    },
    /** Cuts a section (the stem is cut: the dye stops rising); returns its index or −1. */
    cut: (kind: 'TS' | 'LS', at: number, thin = true, tile = true): number => {
      const w = E();
      if (!w.dye || w.clock < 1 || w.sections.length >= EOSIN_MAX_SECTIONS) return -1;
      ew((x) => ({ ...x, sections: [...x.sections, { kind, at: roundDp(Math.max(0.5, at), 1), thin, tile }], secRows: [...x.secRows, ''] }), `cut:${kind}:${roundDp(at, 1)}:${thin ? 'thin' : 'thick'}:${tile ? 'tile' : 'hand'}`);
      return w.sections.length;
    },
    view: (n: number, tool: 'LENS' | 'MICRO') => {
      const w = E();
      if (!w.sections[n] || w.views.some((x) => x.n === n && x.tool === tool)) return false;
      ew((x) => ({ ...x, views: [...x.views, { n, tool }] }), `view#${n + 1}:${tool}`);
      return true;
    },
  };

  // ---------------------------------------------------------------- rat
  const rat = {
    gloves: () => !R().gloves && rw((w) => ({ ...w, gloves: true }), 'gloves'),
    pin: (side: 'VENTRAL' | 'DORSAL') => !R().pinned && rw((w) => ({ ...w, pinned: side }), `pin:${side}`),
    unpin: () => !!R().pinned && !R().skin && rw((w) => ({ ...w, pinned: null }), 'unpin'),
    skin: (how: 'LIFTED' | 'DEEP') => R().pinned === 'VENTRAL' && !R().skin && rw((w) => ({ ...w, skin: how }), `skin:${how}`),
    pinSkin: () => !!R().skin && !R().skinPinned && rw((w) => ({ ...w, skinPinned: true }), 'pinskin'),
    wall: (how: 'LIFTED' | 'DEEP') => R().skinPinned && !R().wall && rw((w) => ({ ...w, wall: how }), `wall:${how}`),
    ribs: () => !!R().wall && !R().ribs && rw((w) => ({ ...w, ribs: true }), 'ribs'),
    moisten: () => !!R().skin && rw((w) => ({ ...w, moist: true }), 'moisten'),
    display: (how: 'SEEKER' | 'FORCEPS') => !!R().wall && !R().display && rw((w) => ({ ...w, display: how }), `display:${how}`),
    unravel: () => !!R().display && !R().unravelled && rw((w) => ({ ...w, unravelled: true }), 'unravel'),
    /** Measures a length; returns the measure's index or −1. */
    measure: (what: RatPart, how: RatHow = 'THREAD'): number => {
      const w = R();
      if (w.measures.length >= RAT_MAX_MEASURES || !w.pinned) return -1;
      if (what !== 'BODY' && !w.unravelled) return -1;
      rw((x) => ({ ...x, measures: [...x.measures, { what, how: what === 'BODY' ? 'THREAD' : how }] }), `measure:${what}:${how}`);
      return w.measures.length;
    },
    clean: () => !!R().pinned && !R().cleaned && rw((w) => ({ ...w, cleaned: true }), 'clean'),
  };

  // ---------------------------------------------------------------- microorganisms
  const setPlate = (k: number, ok: (p: Plate) => boolean, patch: (p: Plate) => Partial<Plate>, log: string) => {
    const w = M();
    const p = w.plates[k];
    if (!p || w.incAt !== null || !ok(p)) return false;
    mw((x) => ({ ...x, plates: x.plates.map((y, j) => (j === k ? { ...y, ...patch(y) } : y)) }), log);
    return true;
  };
  const micro = {
    wipe: () => !M().wiped && mw((w) => ({ ...w, wiped: true }), 'wipe'),
    label: (k: number, where: 'BASE' | 'LID') => setPlate(k, (p) => p.label !== where, () => ({ label: where }), `label#${k + 1}:${where}`),
    expose: (k: number, min: number) => setPlate(k, (p) => p.airMin === 0, () => ({ airMin: min }), `expose#${k + 1}:${min}`),
    touch: (k: number, lid: 'SLIGHT' | 'WIDE') => {
      const washed = M().soaped;
      return setPlate(k, (p) => !p.touch, () => ({ touch: washed ? 'WASHED' : 'UNWASHED', lid }), `touch#${k + 1}:${washed ? 'WASHED' : 'UNWASHED'}:${lid}`);
    },
    soap: () => !M().soaped && mw((w) => ({ ...w, soaped: true }), 'soap'),
    tape: (k: number, how: 'STRIPS' | 'SEALED') => setPlate(k, (p) => p.tape !== how, () => ({ tape: how }), `tape#${k + 1}:${how}`),
    tapeAll: (how: 'STRIPS' | 'SEALED') => {
      const w = M();
      if (w.incAt !== null || w.plates.every((p) => p.tape === how)) return false;
      mw((x) => ({ ...x, plates: x.plates.map((p) => ({ ...p, tape: how })) }), `tape:all:${how}`);
      return true;
    },
    invert: () => M().incAt === null && !M().inverted && mw((w) => ({ ...w, inverted: true }), 'invert'),
    incubate: (t: IncTemp) => M().incAt === null && mw((w) => ({ ...w, temp: t, incAt: w.day }), `incubate:${t}`),
    exposeBread: () => M().breadAt === null && !M().breadExposed && mw((w) => ({ ...w, breadExposed: true }), 'bread:expose'),
    slice: (k: number, moist: boolean, place: 'WARM' | 'COLD') => {
      const w = M();
      if (w.breadAt !== null || !w.slices[k]) return false;
      mw((x) => ({ ...x, slices: x.slices.map((y, j) => (j === k ? { moist, place } : y)) }), `slice#${k + 1}:${moist ? 'moist' : 'dry'}:${place}`);
      return true;
    },
    bag: (bagged = true) => {
      const w = M();
      if (w.breadAt !== null || w.slices.every((x) => x.moist === null)) return false;
      mw((x) => ({ ...x, bagged, breadAt: x.day }), bagged ? 'bread:bag' : 'bread:open');
      return true;
    },
    wait: () => {
      const w = M();
      if ((w.incAt === null && w.breadAt === null) || w.day >= MICRO_DAYS_MAX) return false;
      mw((x) => ({ ...x, day: Math.min(MICRO_DAYS_MAX, x.day + 1) }), 'wait:1d');
      return true;
    },
    count: () => {
      const w = M();
      if (w.incAt === null || w.day <= w.incAt || w.countAt === w.day) return false;
      mw((x) => ({ ...x, countAt: x.day }), `count:d${w.day}`);
      return true;
    },
    lens: () => {
      const w = M();
      if (w.breadAt === null || w.day <= w.breadAt || w.lensAt === w.day) return false;
      mw((x) => ({ ...x, lensAt: x.day }), `lens:d${w.day}`);
      return true;
    },
    slide: () => !M().slide && mw((w) => ({ ...w, slide: true }), 'slide'),
    openAfter: () => M().incAt !== null && M().day > M().incAt! && !M().openedAfter && mw((w) => ({ ...w, openedAfter: true }), 'open-plate'),
    dispose: (how: 'DISINFECT' | 'BIN') => M().countAt !== null && !M().dispose && mw((w) => ({ ...w, dispose: how }), `dispose:${how}`),
  };

  return { v, task, ref, update, note, chooseTask, eosin, rat, micro, plates: PLATES };
}
export type Dissect = ReturnType<typeof useDissect>;
