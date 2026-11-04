import {
  CROSS_BATCH,
  CROSS_MAX,
  CROSS_N,
  DISC_MAX_TRIES,
  DISC_TRIES,
  FOOD_SPOTS,
  GEN_PRACTICAL_TASKS,
  HEIGHT_MAX_MEASURES,
  bioGeneticsVariant,
  crossPairs,
  discAttempt,
  discRoll,
  emptyBioGeneticsState,
  emptyCrossRow,
  heightShown,
  type BioGeneticsState,
  type BioGeneticsVariant,
  type CrossFill,
  type DiscRecord,
  type FoodSpot,
  type GenTask,
} from '@aischool/shared';
import { useEffect, useMemo, useRef } from 'react';
import type { SimulatorProps } from '../types';

/**
 * The variation / genetics / food-web bench's actions, shared by the 2D and
 * the 3D lab so both produce exactly the same `BioGeneticsState`. Every change
 * goes through `update`, which appends to the action log.
 */

export type GenUpdate = (fn: (s: BioGeneticsState) => BioGeneticsState, log?: string) => void;
export const lessonTask = (practicalId?: string): GenTask => (practicalId ? GEN_PRACTICAL_TASKS[practicalId] : undefined) ?? 'HEIGHT';
const pad = <T>(xs: T[], n: number, fill: () => T) => (xs.length >= n ? xs : [...xs, ...Array.from({ length: n - xs.length }, fill)]);

/** What to do next (practice mode only). */
export function nextHint(v: BioGeneticsVariant, s: BioGeneticsState): string {
  const task = s.task ?? 'HEIGHT';
  if (task === 'HEIGHT') {
    const w = s.height;
    const willing = v.height.people.filter((p) => !p.declines).length;
    const hDone = new Set(w.measures.filter((m) => m.kind === 'H').map((m) => m.who)).size;
    const sDone = new Set(w.measures.filter((m) => m.kind === 'S').map((m) => m.who)).size;
    if (!w.shoesOff || !w.square) return 'Before measuring: shoes off, and a set square ready to rest flat on the head. Read the board at eye level.';
    if (hDone < willing || sDone < willing) return `Call each classmate to the board in turn: height, then hand span with fingers spread (${hDone} heights, ${sDone} spans of ${willing}). Respect anyone who declines.`;
    if (w.rows.some((r, i) => !v.height.people[i]?.declines && (!r.h.trim() || !r.s.trim()))) return 'Write every height and hand span in the record sheet.';
    if (!w.scheme) return 'Group the heights into classes of equal width (150–154, 155–159 …) and count the frequency of each.';
    return 'Draw the histogram (bars touching), then the mean, the modal class, the range and the hand-span mean and range.';
  }
  if (task === 'DISCRETE') {
    const w = s.disc;
    const asked = w.tries.filter((t) => t > 0).length;
    if (!w.recordBy) return 'Decide how to record the survey: anonymously, by number.';
    if (asked < v.disc.n) return `Ask each classmate to roll the tongue into a U. If they cannot, let them try again — three attempts (${asked} of ${v.disc.n}).`;
    if (w.cards.filter(Boolean).length < v.disc.n) return 'Read each classmate’s blood group from their health card (with consent — no blood is taken).';
    if (w.rows.length < v.disc.n || w.rows.some((r) => !r.roll || !r.group)) return 'Record R or N and the blood group for every classmate.';
    return 'Tally the results; work out the percentages and the pie-chart angles; draw the pie chart and the bar chart.';
  }
  if (task === 'CROSS') {
    const w = s.cross;
    if (!w.fill) return 'Put 50 red (T) and 50 white (t) beads in each beaker: each beaker is a Tt parent.';
    if (!w.blind || !w.back) return 'Draw without looking, and return the beads and shake after every draw.';
    if (w.draws.length < CROSS_N) return `Draw one bead from each beaker; record the pair (${w.draws.length} of ${CROSS_N}).`;
    if (w.rows.some((r) => !r.TT.trim() || !r.Tt.trim() || !r.tt.trim())) return 'Count TT, Tt and tt in each batch of ten draws.';
    return 'Totals, dominant and recessive, the ratio, the expected numbers and the class totals.';
  }
  const w = s.food;
  if (!w.gloves) return 'Covered shoes and gloves on before you collect anything.';
  if (w.visited.length < FOOD_SPOTS.length) return `Survey each field spot: count the organisms and note who eats what (${w.visited.length} of ${FOOD_SPOTS.length}).`;
  if (w.chains.length < 3) return 'Build at least three food chains, starting with the grass, arrows from the eaten to the eater.';
  return 'Draw the food web, give the trophic levels, and draw both pyramids to a stated scale.';
}

/** `variant`: use these values instead of the seed's (the 3D lab's demo and sandbox). */
export function useGenetics({ seed, state, onChange, readOnly, startedAt, practicalId, variant }: Pick<SimulatorProps<'bio-genetics'>, 'seed' | 'state' | 'onChange' | 'readOnly' | 'startedAt' | 'practicalId'> & { variant?: BioGeneticsVariant }) {
  const task: GenTask = state.task ?? lessonTask(practicalId);
  const v = useMemo(() => variant ?? bioGeneticsVariant(seed, task), [variant, seed, task]);
  const t0 = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const ref = useRef(state);
  ref.current = state;
  const vRef = useRef(v);
  vRef.current = v;

  const update: GenUpdate = (fn, log) => {
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
  const chooseTask = (t: GenTask) => update((s) => ({ ...emptyBioGeneticsState(), log: s.log, task: t }), `task:${t}`);
  const HW = () => ref.current.height;
  const DW = () => ref.current.disc;
  const CW = () => ref.current.cross;
  const FW = () => ref.current.food;
  const hw = (fn: (w: BioGeneticsState['height']) => BioGeneticsState['height'], log: string) => update((s) => ({ ...s, height: fn(s.height) }), log);
  const dw = (fn: (w: BioGeneticsState['disc']) => BioGeneticsState['disc'], log: string) => update((s) => ({ ...s, disc: fn(s.disc) }), log);
  const cw = (fn: (w: BioGeneticsState['cross']) => BioGeneticsState['cross'], log: string) => update((s) => ({ ...s, cross: fn(s.cross) }), log);
  const fw = (fn: (w: BioGeneticsState['food']) => BioGeneticsState['food'], log: string) => update((s) => ({ ...s, food: fn(s.food) }), log);

  // ---------------------------------------------------------------- height
  const height = {
    call: (i: number) => {
      const n = vRef.current.height.n;
      const k = Math.max(0, Math.min(n - 1, i));
      if (HW().at !== k) hw((w) => ({ ...w, at: k }), `call:${k}`);
    },
    next: () => height.call(HW().at + 1),
    prev: () => height.call(HW().at - 1),
    shoes: (off: boolean) => HW().shoesOff !== off && hw((w) => ({ ...w, shoesOff: off }), `shoes:${off ? 'off' : 'on'}`),
    square: (on: boolean) => HW().square !== on && hw((w) => ({ ...w, square: on }), `square:${on ? 'on' : 'off'}`),
    spread: (on: boolean) => HW().spread !== on && hw((w) => ({ ...w, spread: on }), `spread:${on ? 'on' : 'off'}`),
    /** Measures the classmate at the board; returns the reading, 'DECLINED' or null (no room). */
    measure: (kind: 'H' | 'S'): number | 'DECLINED' | null => {
      const w = HW();
      const vv = vRef.current;
      if (vv.height.people[w.at]?.declines) {
        note(`declined:${w.at}`);
        return 'DECLINED';
      }
      if (w.measures.length >= HEIGHT_MAX_MEASURES) return null;
      const m = { who: w.at, kind, shoes: !w.shoesOff, square: w.square, spread: w.spread };
      hw((x) => ({ ...x, measures: [...x.measures, m], rows: pad(x.rows, x.at + 1, () => ({ h: '', s: '' })) }), `measure:${kind}:${w.at}`);
      return heightShown(vv.height, m, w.measures.length, vv.seed);
    },
  };

  // ---------------------------------------------------------------- discontinuous
  const disc = {
    call: (i: number) => {
      const n = vRef.current.disc.n;
      const k = Math.max(0, Math.min(n - 1, i));
      if (DW().at !== k) dw((w) => ({ ...w, at: k }), `call:${k}`);
    },
    next: () => disc.call(DW().at + 1),
    prev: () => disc.call(DW().at - 1),
    recordBy: (x: DiscRecord) => DW().recordBy !== x && dw((w) => ({ ...w, recordBy: x }), `record:${x}`),
    /** One attempt at rolling the tongue; returns whether it worked (null: no more attempts). */
    roll: (): boolean | null => {
      const w = DW();
      const vv = vRef.current;
      const t = w.tries[w.at] ?? 0;
      if (t >= DISC_MAX_TRIES || discRoll(vv.disc, w, w.at) === 'R') return null;
      dw((x) => ({ ...x, tries: pad(x.tries, x.at + 1, () => 0).map((k, i) => (i === x.at ? k + 1 : k)), rows: pad(x.rows, x.at + 1, () => ({ roll: '' as const, group: '' as const })) }), `roll:${w.at}`);
      return discAttempt(vv.disc, w.at, t + 1);
    },
    card: () => {
      const w = DW();
      if (w.cards[w.at]) return;
      dw((x) => ({ ...x, cards: pad(x.cards, x.at + 1, () => false).map((k, i) => (i === x.at ? true : k)), rows: pad(x.rows, x.at + 1, () => ({ roll: '' as const, group: '' as const })) }), `card:${w.at}`);
    },
  };

  // ---------------------------------------------------------------- cross
  const cross = {
    fill: (f: CrossFill) => !CW().fill && cw((w) => ({ ...w, fill: f }), `fill:${f}`),
    blind: (on: boolean) => CW().blind !== on && cw((w) => ({ ...w, blind: on }), `blind:${on ? 'on' : 'off'}`),
    back: (on: boolean) => CW().back !== on && cw((w) => ({ ...w, back: on }), `back:${on ? 'on' : 'off'}`),
    /** Draws `k` pairs; returns how many were drawn. */
    draw: (k: number): number => {
      const w = CW();
      if (!w.fill) return 0;
      const kept = w.draws.filter((d) => !d.back).length;
      const room = Math.min(CROSS_MAX - w.draws.length, w.back ? Infinity : 100 - kept);
      const n = Math.max(0, Math.min(k, room));
      if (!n) return 0;
      cw((x) => {
        const draws = [...x.draws, ...Array.from({ length: n }, () => ({ blind: x.blind, back: x.back }))];
        return { ...x, draws, rows: pad(x.rows, Math.ceil(draws.length / CROSS_BATCH), emptyCrossRow) };
      }, `draw:${n}`);
      return n;
    },
  };

  // ---------------------------------------------------------------- food
  const food = {
    gloves: () => !FW().gloves && fw((w) => ({ ...w, gloves: true, glovedAt: w.visited.length }), 'gloves'),
    survey: (spot: FoodSpot) => !FW().visited.includes(spot) && fw((w) => ({ ...w, visited: [...w.visited, spot] }), `survey:${spot}`),
  };

  return { v, task, ref, update, note, chooseTask, height, disc, cross, food };
}
export type Genetics = ReturnType<typeof useGenetics>;

// ------------------------------------------------------------------ what the bench shows now (2D and 3D)

/** The latest reading of the classmate at the board. */
export function heightNow(v: BioGeneticsVariant, s: BioGeneticsState) {
  const w = s.height;
  let h: number | null = null;
  let sp: number | null = null;
  w.measures.forEach((m, n) => {
    if (m.who !== w.at) return;
    if (m.kind === 'H') h = heightShown(v.height, m, n, v.seed);
    else sp = heightShown(v.height, m, n, v.seed);
  });
  return { who: w.at, h: h as number | null, s: sp as number | null, declines: !!v.height.people[w.at]?.declines };
}
export function discNow(v: BioGeneticsVariant, s: BioGeneticsState) {
  const w = s.disc;
  const tries = w.tries[w.at] ?? 0;
  return { who: w.at, tries, roll: discRoll(v.disc, w, w.at), card: w.cards[w.at] ? v.disc.people[w.at]!.group : null, needMore: tries > 0 && tries < DISC_TRIES && discRoll(v.disc, w, w.at) === 'N' };
}
export function lastPair(s: BioGeneticsState, seed: number) {
  const ps = crossPairs(s.cross, seed);
  return ps.length ? { n: ps.length, p: ps[ps.length - 1]! } : null;
}
