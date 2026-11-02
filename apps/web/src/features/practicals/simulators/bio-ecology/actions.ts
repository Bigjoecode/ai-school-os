import {
  CAP_CLOCK_MAX,
  ECO_PRACTICAL_TASKS,
  FAC_DAYS,
  FAC_DAY_END,
  FAC_DAY_START,
  FAC_MIN_DAYS,
  FAC_SITES,
  QUAD_MAX,
  QUAD_MIN,
  SOIL_CLOCK_MAX,
  SOIL_DRAIN_MAX,
  SOIL_DRAIN_TIMES,
  SOIL_MAX_HEATS,
  bioEcologyVariant,
  emptyBioEcologyState,
  emptyQuadRow,
  emptySoilAirRow,
  emptySoilHumusRow,
  emptySoilJarRow,
  quadNextRandom,
  roundDp,
  type BioEcologyState,
  type BioEcologyVariant,
  type CapMark,
  type CapRelease,
  type EcoTask,
  type FacInst,
  type FacPlace,
  type FacSite,
  type FacStationInst,
  type SoilType,
} from '@aischool/shared';
import { useEffect, useMemo, useRef } from 'react';
import type { SimulatorProps } from '../types';

/**
 * The ecology lab's actions, shared by the 2D and the 3D lab so both produce
 * exactly the same `BioEcologyState`. Every change goes through `update`,
 * which appends to the action log.
 */

export type EcoUpdate = (fn: (s: BioEcologyState) => BioEcologyState, log?: string) => void;
export const lessonTask = (practicalId?: string): EcoTask => (practicalId ? ECO_PRACTICAL_TASKS[practicalId] : undefined) ?? 'QUADRAT';
const hh = (x: number) => roundDp(Math.min(FAC_DAY_END, x), 2);
/** "10:24" for a clock in hours. */
export const clockText = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

/** What to do next (practice mode only). */
export function nextHint(_v: BioEcologyVariant, s: BioEcologyState): string {
  const task = s.task ?? 'QUADRAT';
  if (task === 'QUADRAT') {
    const w = s.quad;
    if (!w.pegged) return 'Mark out the 20 m × 20 m plot with pegs and the two tapes: they are the axes for your coordinates.';
    if (w.quads.length < QUAD_MIN) return `Read the next two numbers (00–19) from the random-number table and place quadrat ${w.quads.length + 1} there (at least ${QUAD_MIN}).`;
    const notLooked = w.quads.findIndex((_, i) => !w.looked.includes(i));
    if (notLooked >= 0) return `Kneel at quadrat ${notLooked + 1}: count each herb (two-sides rule for the frame) and the grass squares.`;
    if (!w.res.TRIDAX.density.trim()) return 'Add up each column, then work out density, frequency and the estimated population of each herb.';
    if (w.bars.TRIDAX === null) return 'Draw the bar chart of density for the three herbs.';
    return 'Name the most frequent and the most dense herb, then write your precautions and explanation.';
  }
  if (task === 'CAPTURE') {
    const w = s.cap;
    if (!w.first) return 'Sweep the plot with the net for a fixed time (e.g. 10 minutes) and keep the catch in the box.';
    if (!w.counted1) return 'Tip the catch gently onto the white tray and count them: n₁.';
    if (!w.mark) return 'Mark each grasshopper so it is not harmed and not easier for predators to see.';
    if (!w.release) return 'Release them where they were caught.';
    if (!w.second) return w.clock < 24 ? 'Leave them about a day to mix with the others.' : 'Sweep again in the same way, for the same time: the second sample.';
    if (!w.examined) return 'Look over each grasshopper of the second catch for your mark: count n₂ and m.';
    if (!w.freed) return 'Release the second catch where you caught it.';
    return 'Work out N = n₁ × n₂ ÷ m, the % marked and the density; choose the assumptions and sources of error.';
  }
  if (task === 'FACTORS') {
    const w = s.fac;
    const today = (site: FacSite) => w.reads.filter((r) => r.day === w.day && r.site === site);
    if (!w.station.some((x) => x.day === w.day && x.inst === 'SIX')) return `Day ${w.day}, 9 am: read the Six’s thermometer, the rain gauge and the wind vane at the weather station.`;
    if (!w.resets.includes(w.day) || !w.empties.includes(w.day)) return 'Reset the Six’s thermometer with the magnet and empty the rain gauge.';
    if (w.day <= FAC_MIN_DAYS && FAC_SITES.some((site) => today(site).length < 5)) return 'Read every instrument at the open field and under the canopy, at about the same time — thermometers in the shade.';
    if (!w.secchiRead) return 'Lower the Secchi disc at the pond (keep back from the edge).';
    if (w.day < FAC_DAYS) return 'Go on to the next day.';
    return 'Fill in the means, the humidity, the Six’s and rain calculations, and relate the readings to the organisms.';
  }
  const w = s.soil;
  if (!w.jars.length) return 'Put a sample of loam in a jar, add water and shake it.';
  if (!w.funnels.length) return 'Set up three funnels plugged with cotton wool, each with 100 g of one dry soil, over measuring cylinders.';
  if (w.pouredAt === null) return 'Pour 100 cm³ of water onto each soil at the same time and start the stopwatch.';
  if (w.dclock < 30) return 'Read each cylinder at 1, 2, 5, 10, 20 and 30 minutes.';
  if (w.airs.length < 3) return 'Air content: 50 cm³ of each dry soil into 50 cm³ of water; stir until no more bubbles; read the volume.';
  if (w.crucibles.length < 3) return 'Humus: weigh a crucible, add oven-dried soil and weigh again, then heat strongly.';
  if (w.jars.some((j) => j.shakenAt !== null && w.hours - j.shakenAt < 24)) return 'Leave the jar for a day, then measure each layer.';
  return 'Heat, cool and weigh to constant mass; then fill in the tables, label the jar and conclude.';
}

/** `variant`: use these values instead of the seed's (the 3D lab's demo and sandbox). */
export function useEcology({ seed, state, onChange, readOnly, startedAt, practicalId, variant }: Pick<SimulatorProps<'bio-ecology'>, 'seed' | 'state' | 'onChange' | 'readOnly' | 'startedAt' | 'practicalId'> & { variant?: BioEcologyVariant }) {
  const task: EcoTask = state.task ?? lessonTask(practicalId);
  const v = useMemo(() => variant ?? bioEcologyVariant(seed, task), [variant, seed, task]);
  const t0 = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const ref = useRef(state);
  ref.current = state;

  const update: EcoUpdate = (fn, log) => {
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
  const chooseTask = (t: EcoTask) => update((s) => ({ ...emptyBioEcologyState(), log: s.log, task: t }), `task:${t}`);
  const Q = () => ref.current.quad;
  const C = () => ref.current.cap;
  const F = () => ref.current.fac;
  const S = () => ref.current.soil;
  const quadU = (fn: (w: BioEcologyState['quad']) => BioEcologyState['quad'], log: string) => update((s) => ({ ...s, quad: fn(s.quad) }), log);
  const capU = (fn: (w: BioEcologyState['cap']) => BioEcologyState['cap'], log: string) => update((s) => ({ ...s, cap: fn(s.cap) }), log);
  const facU = (fn: (w: BioEcologyState['fac']) => BioEcologyState['fac'], log: string) => update((s) => ({ ...s, fac: fn(s.fac) }), log);
  const soilU = (fn: (w: BioEcologyState['soil']) => BioEcologyState['soil'], log: string) => update((s) => ({ ...s, soil: fn(s.soil) }), log);

  // ---------------------------------------------------------------- quadrats
  const quad = {
    peg: () => !Q().pegged && quadU((w) => ({ ...w, pegged: true }), 'peg'),
    /** The next quadrat at coordinates from the random-number table (−1: none left, or at the limit). */
    placeRandom: (): number => {
      const w = Q();
      if (w.quads.length >= QUAD_MAX) return -1;
      const nx = quadNextRandom(v.quad, w.randIdx);
      if (!nx) return -1;
      quadU((x) => ({ ...x, quads: [...x.quads, { x: nx.x, y: nx.y, how: 'RANDOM' }], rows: [...x.rows, emptyQuadRow()], randIdx: nx.next }), `quad:${nx.x},${nx.y}`);
      return w.quads.length;
    },
    /** A quadrat put down where the student chooses (by eye: biased). */
    placeAt: (x: number, y: number): number => {
      const w = Q();
      if (w.quads.length >= QUAD_MAX) return -1;
      const cx = Math.max(0, Math.min(19, Math.floor(x)));
      const cy = Math.max(0, Math.min(19, Math.floor(y)));
      quadU((q) => ({ ...q, quads: [...q.quads, { x: cx, y: cy, how: 'CHOSEN' }], rows: [...q.rows, emptyQuadRow()] }), `quad-chosen:${cx},${cy}`);
      return w.quads.length;
    },
    look: (i: number) => {
      const w = Q();
      if (!w.quads[i] || w.looked.length >= QUAD_MAX * 3) return;
      quadU((x) => ({ ...x, looked: x.looked.includes(i) ? x.looked : [...x.looked, i] }), `look#${i + 1}`);
    },
    /** Lifts the last quadrat (before it is examined). */
    undo: () => {
      const w = Q();
      const i = w.quads.length - 1;
      if (i < 0 || w.looked.includes(i)) return;
      quadU((x) => ({ ...x, quads: x.quads.slice(0, -1), rows: x.rows.slice(0, -1) }), `unquad#${i + 1}`);
    },
  };

  // ---------------------------------------------------------------- capture–recapture
  const cap = {
    sweep1: (effort: number) => !C().first && capU((w) => ({ ...w, first: { effort } }), `sweep1:${effort}`),
    count1: () => !!C().first && !C().counted1 && capU((w) => ({ ...w, counted1: true }), 'tray1'),
    mark: (m: CapMark) => C().counted1 && !C().mark && capU((w) => ({ ...w, mark: m }), `mark:${m}`),
    release: (r: CapRelease) => !!C().mark && !C().release && capU((w) => ({ ...w, release: r }), `release:${r}`),
    wait: (h: number) => {
      const w = C();
      if (!w.release || w.second || w.clock >= CAP_CLOCK_MAX) return;
      capU((x) => ({ ...x, clock: Math.min(CAP_CLOCK_MAX, x.clock + h) }), `wait:${h}h`);
    },
    sweep2: (effort: number) => {
      const w = C();
      if (!w.release || w.second || w.clock <= 0) return;
      capU((x) => ({ ...x, second: { effort, at: x.clock } }), `sweep2:${effort}@${w.clock}`);
    },
    examine: () => !!C().second && !C().examined && capU((w) => ({ ...w, examined: true }), 'examine'),
    free: () => !!C().second && !C().freed && capU((w) => ({ ...w, freed: true }), 'free'),
  };

  // ---------------------------------------------------------------- factors
  const fac = {
    go: (place: FacPlace) => {
      const w = F();
      if (w.at === place) return;
      facU((x) => ({ ...x, at: place, h: hh(x.h + 0.2) }), `go:${place}`);
    },
    /** Reads an instrument at the current site (`shaded`: the thermometer kept out of direct sun). */
    read: (inst: FacInst, shaded = true): number => {
      const w = F();
      if ((w.at !== 'OPEN' && w.at !== 'SHADE') || w.reads.length >= 240) return -1;
      const site = w.at as FacSite;
      facU((x) => ({ ...x, reads: [...x.reads, { day: x.day, h: x.h, site, inst, shaded }], h: hh(x.h + 0.05) }), `read:${inst}${shaded ? '' : '-sun'}@${site}`);
      return w.reads.length;
    },
    station: (inst: FacStationInst) => {
      const w = F();
      if (w.at !== 'STATION' || w.station.length >= 60 || w.station.some((x) => x.day === w.day && x.inst === inst)) return;
      facU((x) => ({ ...x, station: [...x.station, { day: x.day, inst }] }), `station:${inst}`);
    },
    reset: () => {
      const w = F();
      if (w.at !== 'STATION' || w.resets.includes(w.day)) return;
      facU((x) => ({ ...x, resets: [...x.resets, x.day] }), 'reset-six');
    },
    empty: () => {
      const w = F();
      if (w.at !== 'STATION' || w.empties.includes(w.day)) return;
      facU((x) => ({ ...x, empties: [...x.empties, x.day] }), 'empty-rain');
    },
    secchi: () => {
      const w = F();
      if (w.at !== 'POND' || w.secchiRead) return;
      facU((x) => ({ ...x, secchiRead: true, h: hh(x.h + 0.1) }), 'secchi');
    },
    wait: (min: number) => {
      if (F().h >= FAC_DAY_END) return;
      facU((x) => ({ ...x, h: hh(x.h + min / 60) }), `wait:${min}m`);
    },
    nextDay: () => {
      if (F().day >= FAC_DAYS) return;
      facU((x) => ({ ...x, day: x.day + 1, h: FAC_DAY_START, at: 'STATION' }), 'next-day');
    },
  };

  // ---------------------------------------------------------------- soil
  const soil = {
    jar: (t: SoilType): number => {
      const w = S();
      if (w.jars.length >= 3) return -1;
      soilU((x) => ({ ...x, jars: [...x.jars, { soil: t, shakenAt: null }], jarRows: [...x.jarRows, emptySoilJarRow()], jarPct: [...x.jarPct, emptySoilJarRow()] }), `jar:${t}`);
      return w.jars.length;
    },
    shake: (i: number) => {
      const j = S().jars[i];
      if (!j || j.shakenAt !== null) return;
      soilU((x) => ({ ...x, jars: x.jars.map((y, k) => (k === i ? { ...y, shakenAt: x.hours } : y)) }), `shake#${i + 1}`);
    },
    waitJar: (h: number) => {
      const w = S();
      if (!w.jars.some((j) => j.shakenAt !== null) || w.hours >= SOIL_CLOCK_MAX) return;
      soilU((x) => ({ ...x, hours: Math.min(SOIL_CLOCK_MAX, x.hours + h) }), `wait-jar:${h}h`);
    },
    measureJar: (i: number) => {
      const w = S();
      if (w.jars[i]?.shakenAt === null || !w.jars[i] || w.jarReads.length >= 40) return;
      soilU((x) => ({ ...x, jarReads: [...x.jarReads, { jar: i, at: x.hours }] }), `measure-jar#${i + 1}`);
    },
    funnel: (t: SoilType, mass: number, cotton: boolean): number => {
      const w = S();
      if (w.funnels.length >= 3 || w.pouredAt !== null) return -1;
      soilU((x) => ({ ...x, funnels: [...x.funnels, { soil: t, mass, cotton }], dRows: [...x.dRows, SOIL_DRAIN_TIMES.map(() => '')], retained: [...x.retained, ''] }), `funnel:${t}:${mass}${cotton ? '' : ':nocotton'}`);
      return w.funnels.length;
    },
    unfunnel: (i: number) => {
      if (S().pouredAt !== null || !S().funnels[i]) return;
      soilU((x) => ({ ...x, funnels: x.funnels.filter((_, k) => k !== i), dRows: x.dRows.filter((_, k) => k !== i), retained: x.retained.filter((_, k) => k !== i) }), `unfunnel#${i + 1}`);
    },
    pour: () => {
      const w = S();
      if (!w.funnels.length || w.pouredAt !== null) return;
      soilU((x) => ({ ...x, pouredAt: 0, dclock: 0 }), 'pour');
    },
    /** Runs the drainage clock on to the next reading time (or by `min`). */
    waitDrain: (min?: number) => {
      const w = S();
      if (w.pouredAt === null || w.dclock >= SOIL_DRAIN_MAX) return;
      const next = min ?? SOIL_DRAIN_TIMES.find((t) => t > w.dclock + 1e-9) ?? w.dclock + 5;
      const to = Math.min(SOIL_DRAIN_MAX, min ? w.dclock + min : next);
      soilU((x) => ({ ...x, dclock: roundDp(to, 2) }), `wait-drain:${roundDp(to, 2)}`);
    },
    readDrain: (f: number) => {
      const w = S();
      if (w.pouredAt === null || !w.funnels[f] || w.dReads.length >= 80) return;
      soilU((x) => ({ ...x, dReads: [...x.dReads, { f, t: x.dclock }] }), `read-drain#${f + 1}@${w.dclock}`);
    },
    /** Reads all the cylinders now. */
    readAllDrain: () => {
      const w = S();
      if (w.pouredAt === null || w.dReads.length + w.funnels.length > 80) return;
      soilU((x) => ({ ...x, dReads: [...x.dReads, ...x.funnels.map((_, f) => ({ f, t: x.dclock }))] }), `read-drain:all@${w.dclock}`);
    },
    air: (t: SoilType): number => {
      const w = S();
      if (w.airs.length >= 3) return -1;
      soilU((x) => ({ ...x, airs: [...x.airs, { soil: t, stirred: false, added: false }], airRows: [...x.airRows, emptySoilAirRow()] }), `air:${t}`);
      return w.airs.length;
    },
    addSoil: (i: number) => {
      const a = S().airs[i];
      if (!a || a.added) return;
      soilU((x) => ({ ...x, airs: x.airs.map((y, k) => (k === i ? { ...y, added: true } : y)) }), `air-add#${i + 1}`);
    },
    stir: (i: number) => {
      const a = S().airs[i];
      if (!a || !a.added || a.stirred) return;
      soilU((x) => ({ ...x, airs: x.airs.map((y, k) => (k === i ? { ...y, stirred: true } : y)) }), `stir#${i + 1}`);
    },
    readAir: (i: number) => {
      const w = S();
      if (!w.airs[i]?.added || w.airReads.length >= 30) return;
      soilU((x) => ({ ...x, airReads: [...x.airReads, i] }), `read-air#${i + 1}`);
    },
    crucible: (t: SoilType, dried: boolean): number => {
      const w = S();
      if (w.crucibles.length >= 3) return -1;
      soilU((x) => ({ ...x, crucibles: [...x.crucibles, { soil: t, dried, soilIn: false, heats: 0, hot: false }], hRows: [...x.hRows, emptySoilHumusRow()] }), `crucible:${t}:${dried ? 'dried' : 'damp'}`);
      return w.crucibles.length;
    },
    addSample: (c: number) => {
      const cr = S().crucibles[c];
      if (!cr || cr.soilIn) return;
      soilU((x) => ({ ...x, crucibles: x.crucibles.map((y, k) => (k === c ? { ...y, soilIn: true } : y)) }), `sample#${c + 1}`);
    },
    weigh: (c: number) => {
      const w = S();
      const cr = w.crucibles[c];
      if (!cr || w.weighs.length >= 60) return;
      soilU((x) => ({ ...x, weighs: [...x.weighs, { c, k: cr.heats, soilIn: cr.soilIn, hot: cr.hot }] }), `weigh#${c + 1}`);
    },
    /** Heats every crucible that has soil in it strongly for 20 minutes. */
    heatAll: () => {
      const w = S();
      if (!w.crucibles.some((c) => c.soilIn && c.heats < SOIL_MAX_HEATS)) return;
      soilU((x) => ({ ...x, crucibles: x.crucibles.map((c) => (c.soilIn && c.heats < SOIL_MAX_HEATS ? { ...c, heats: c.heats + 1, hot: true } : c)) }), 'heat:all');
    },
    /** Cools the crucibles in the desiccator. */
    coolAll: () => {
      if (!S().crucibles.some((c) => c.hot)) return;
      soilU((x) => ({ ...x, crucibles: x.crucibles.map((c) => ({ ...c, hot: false })) }), 'cool:all');
    },
  };

  return { v, task, ref, update, note, chooseTask, quad, cap, fac, soil };
}
export type Ecology = ReturnType<typeof useEcology>;
