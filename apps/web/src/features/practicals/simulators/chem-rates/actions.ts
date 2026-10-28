import {
  RATES_CROSS_ACID,
  RATES_INTERVAL,
  chemRatesVariant,
  labBetween,
  labRandom,
  ratesCrossTemp,
  ratesCrossTpre,
  ratesCrossVisibility,
  ratesCrossX,
  ratesMgEnd,
  ratesMgLeft,
  ratesMgRate,
  ratesMgSyringe,
  ratesMgTemp,
  type ChemRatesState,
  type ChemRatesVariant,
  type RatesCrossRun,
  type RatesMgRun,
  type RatesTask,
} from '@aischool/shared';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useLabUpdate } from '../phy-common';

/**
 * The rates bench's state transitions, shared by the 2D and the 3D lab (and
 * the demo and sandbox) so all of them produce the same state and log.
 * Magnesium: pour the acid, weigh and clean the ribbon, push the syringe in
 * and check it is airtight, drop the magnesium in, bung it, start the watch,
 * read the syringe every 30 s, finish. Thiosulphate: measure thiosulphate and
 * water (warm them in the water bath for the temperature part), add the
 * acid, start the watch, swirl, look down through the flask and stop the
 * watch when the cross disappears, read the thermometer, record, empty and
 * rinse the flask. The reaction and the stopwatch run on a live clock (not
 * saved): readings, lags and times are written to the state when taken.
 */

export const CROSS_LESSONS = ['pr-chem-thiosulphate-cross'];
export const lessonTask = (practicalId?: string): RatesTask => (practicalId && CROSS_LESSONS.includes(practicalId) ? 'CROSS' : 'MG');
export const MAX_READINGS = 100;
export const MAX_CROSS = 16;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** A clock that can run faster than real time (time-lapse; the demo). */
export function makeClock() {
  let base = 0;
  let at = performance.now();
  let rate = 1;
  const now = () => base + (performance.now() - at) * rate;
  return {
    now,
    rate: () => rate,
    /** Jump the clock forward (the demo skips ahead). */
    shift(ms: number) {
      base += ms;
    },
    setRate(r: number) {
      if (r === rate) return;
      base = now();
      at = performance.now();
      rate = r;
    },
  };
}
export type Clock = ReturnType<typeof makeClock>;

export interface Watch {
  start: number | null;
  stop: number | null;
}
const IDLE_WATCH: Watch = { start: null, stop: null };

/** The run in progress (MG: not done; CROSS: not recorded). */
export const openMg = (s: ChemRatesState) => {
  const i = s.mgRuns.findIndex((r) => r && !r.done);
  return i >= 0 ? { i, r: s.mgRuns[i]! } : null;
};
export const openCross = (s: ChemRatesState) => {
  const i = s.crossRuns.findIndex((r) => !r.done);
  return i >= 0 ? { i, r: s.crossRuns[i]! } : null;
};
/** The flask still holds a mixture (measured since it was last emptied). */
export const crossFlaskFull = (s: ChemRatesState) => {
  const last = [...s.log].reverse().find((e) => e.a.startsWith('measure:') || e.a === 'cross-empty');
  return !!last && last.a.startsWith('measure:');
};
/** The flask was emptied and not rinsed since. */
export const crossFlaskDirty = (s: ChemRatesState) => {
  const last = [...s.log].reverse().find((e) => e.a === 'cross-empty' || e.a === 'rinse-flask');
  return last?.a === 'cross-empty';
};
export const MG_RUN_LABEL = ['Run 1 (1.0 mol dm⁻³ HCl)', 'Run 2 (0.50 mol dm⁻³ HCl)'];

export function ratesHint(s: ChemRatesState, o: Rates): string {
  if (!s.task) return 'Choose the experiment first.';
  const w = o.watch;
  if (s.task === 'MG') {
    const open = openMg(s);
    const done = s.mgRuns.filter((r) => r?.done).length;
    if (!open) return done >= 2 ? 'Both runs are done: fill in the table, draw the curves and tangents, and work out the answers.' : `Measure 50 cm³ of ${done ? '0.50' : '1.0'} mol dm⁻³ HCl into the flask for run ${done + 1}.`;
    const r = open.r;
    if (!r.weighed) return 'Weigh the magnesium ribbon on the balance.';
    if (!r.cleaned) return 'Rub the ribbon with sandpaper until it is shiny: the oxide layer slows the start.';
    if (r.start !== 0) return 'Push the syringe plunger fully in, to 0 cm³.';
    if (!r.checked) return 'Check the apparatus is airtight: pull the plunger out a little and let go — it should spring back.';
    if (!r.dropped) return 'Drop the magnesium into the acid, replace the bung at once and start the stopwatch.';
    if (!o.mgLive) return 'This run was interrupted (the page was reloaded): pour it away and start it again.';
    if (r.bungLag === null) return 'Replace the bung NOW — gas is escaping.';
    if (w.start === null) return 'Start the stopwatch.';
    const t = o.elapsed();
    if (o.mgGone()) return 'No more gas is coming off: take one more reading, then finish the run.';
    return `Read the syringe at every 30 s mark (next: ${Math.ceil((t + 0.01) / RATES_INTERVAL) * RATES_INTERVAL} s).`;
  }
  const open = openCross(s);
  const concRuns = s.crossRuns.filter((r) => r.done && r.kind === 'CONC').length;
  const tempRuns = s.crossRuns.filter((r) => r.done && r.kind === 'TEMP').length;
  if (!open) {
    if (crossFlaskFull(s)) return 'Pour the mixture away into the sink with plenty of water.';
    if (crossFlaskDirty(s)) return 'Rinse the flask with water before the next run.';
    if (concRuns < 5) return `Measure the next thiosulphate volume (50, 40, 30, 20, 10 cm³) and make it up to 50 cm³ with water. ${concRuns} of 5 done.`;
    if (tempRuns < 4) return `Temperature part: 10 cm³ thiosulphate + 40 cm³ water, warmed in the water bath to about ${[30, 40, 50, 60][tempRuns]} °C.`;
    return 'Fill in 1/t, plot 1/t against the volume of thiosulphate and work out the answers.';
  }
  const r = open.r;
  if (!o.crossLive) return r.kind === 'TEMP' && r.bath !== null ? 'Read the thermometer if you like, then add 5 cm³ of the acid and start the stopwatch at once.' : 'Stand the flask on the cross, then add 5 cm³ of the acid and start the stopwatch at once.';
  if (w.start === null) return 'Start the stopwatch.';
  if (!r.swirled) return 'Swirl the flask to mix.';
  if (w.stop === null) return 'Look down through the solution: stop the watch the moment the cross can no longer be seen.';
  if (r.kind === 'TEMP' && r.temp === null) return 'Read the temperature of the mixture on the thermometer.';
  return 'Record this time.';
}

export function useRates({
  seed,
  state,
  onChange,
  readOnly,
  startedAt,
  practicalId,
  variant,
  autoTask = true,
  clock: givenClock,
}: {
  seed: number;
  state: ChemRatesState;
  onChange: (next: ChemRatesState) => void;
  readOnly: boolean;
  startedAt: string;
  practicalId?: string;
  variant?: ChemRatesVariant;
  autoTask?: boolean;
  clock?: Clock;
}) {
  const seeded = useMemo(() => chemRatesVariant(seed), [seed]);
  const v = variant ?? seeded;
  const { update, ref } = useLabUpdate(state, onChange, readOnly, startedAt);
  const own = useRef<Clock | null>(null);
  if (!own.current) own.current = makeClock();
  const clock = givenClock ?? own.current;
  const now = () => clock.now();
  const mgLiveRef = useRef<{ run: number; dropAt: number } | null>(null);
  const crossLiveRef = useRef<{ run: number; acidAt: number } | null>(null);
  const watchRef = useRef<Watch>(IDLE_WATCH);
  const [speed, setSpeedState] = useState(1);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (autoTask && !readOnly && !ref.current.task && !ref.current.log.some((e) => !e.a.startsWith('safety'))) {
      const t = lessonTask(practicalId);
      update((s) => (s.task ? s : { ...s, task: t }), 'task:auto');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, practicalId]);
  const task: RatesTask = state.task ?? 'MG';

  const elapsed = (t = now()) => {
    const w = watchRef.current;
    return w.start === null ? 0 : ((w.stop ?? t) - w.start) / 1000;
  };
  const setMg = (s: ChemRatesState, i: number, patch: Partial<RatesMgRun>): ChemRatesState => ({ ...s, mgRuns: s.mgRuns.map((r, k) => (k === i && r ? { ...r, ...patch } : r)) });
  const setCross = (s: ChemRatesState, i: number, patch: Partial<RatesCrossRun>): ChemRatesState => ({ ...s, crossRuns: s.crossRuns.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  /** Adds a row for the 30 s slot (sorted) if it is not there. */
  const withRow = (s: ChemRatesState, slot: number): ChemRatesState => {
    if (s.mgRows.includes(slot) || s.mgRows.length >= 50) return s;
    const at = s.mgRows.findIndex((x) => x > slot);
    const k = at < 0 ? s.mgRows.length : at;
    return { ...s, mgRows: [...s.mgRows.slice(0, k), slot, ...s.mgRows.slice(k)], mg: [...s.mg.slice(0, k), { t: '', v1: '', v2: '' }, ...s.mg.slice(k)] };
  };
  const resetLive = () => {
    mgLiveRef.current = null;
    crossLiveRef.current = null;
    watchRef.current = IDLE_WATCH;
    bump();
  };

  // ---- the live reaction (not saved)
  const mgTau = (t = now()) => (mgLiveRef.current ? (t - mgLiveRef.current.dropAt) / 1000 : 0);
  const mgRunLive = () => {
    const l = mgLiveRef.current;
    return l ? ref.current.mgRuns[l.run] ?? null : null;
  };
  const crossT = (t = now()) => (crossLiveRef.current ? (t - crossLiveRef.current.acidAt) / 1000 : -1);
  const crossRunLive = () => {
    const l = crossLiveRef.current;
    return l ? ref.current.crossRuns[l.run] ?? null : null;
  };

  const o = {
    v,
    update,
    ref,
    task,
    now,
    clock,
    watchRef,
    speed,
    setSpeed: (x: number) => setSpeedState(x),
    chooseTask: (t: RatesTask) => {
      resetLive();
      update((s) => ({ ...s, task: t }), `task:${t}`);
    },
    elapsed,
    note: (a: string) => update((s) => s, a),
    // ---- the stopwatch
    startWatch: (at?: number) => {
      const t = at ?? now();
      if (watchRef.current.start !== null && watchRef.current.stop === null) return;
      watchRef.current = { start: t, stop: null };
      const s = ref.current;
      if (s.task === 'MG') {
        const m = openMg(s);
        const live = mgLiveRef.current;
        if (m) {
          update((x) => withRow(live ? setMg(x, m.i, { watchLag: r2((t - live.dropAt) / 1000) }) : x, 0), live ? `watch:${r2((t - live.dropAt) / 1000)}` : 'watch:early');
        }
      } else {
        const c = openCross(s);
        const live = crossLiveRef.current;
        if (c && live) update((x) => setCross(x, c.i, { watchLag: r2((t - live.acidAt) / 1000) }), `watch:${r2((t - live.acidAt) / 1000)}`);
      }
      bump();
    },
    stopWatch: (top = true, at?: number) => {
      const w = watchRef.current;
      if (w.start === null || w.stop !== null) return;
      const t = at ?? now();
      watchRef.current = { ...w, stop: t };
      const c = openCross(ref.current);
      if (ref.current.task === 'CROSS' && c && crossLiveRef.current) update((x) => setCross(x, c.i, { elapsed: r2((t - w.start!) / 1000), top }), `stop:${r2((t - w.start!) / 1000)}${top ? '' : ':side'}`);
      bump();
    },
    resetWatch: () => {
      watchRef.current = IDLE_WATCH;
      bump();
    },
    // ---- MG
    mgLive: mgLiveRef.current,
    mgTau,
    /** The syringe reading now (cm³). */
    syringeNow: (t = now()) => {
      const s = ref.current;
      const m = openMg(s) ?? (() => {
        const i = [...s.mgRuns].map((r, k) => ({ r, k })).reverse().find((x) => x.r)?.k ?? -1;
        return i >= 0 ? { i, r: s.mgRuns[i]! } : null;
      })();
      if (!m) return 0;
      const live = mgLiveRef.current;
      if (live && live.run === m.i) return ratesMgSyringe(v, m.r, mgTau(t));
      if (m.r.done && m.r.bungLag !== null) return ratesMgSyringe(v, m.r, 3000);
      return m.r.start;
    },
    /** What is left of the ribbon (1 = all), the bubbling rate (cm³ s⁻¹) and the flask's temperature now. */
    mgLeft: (t = now()) => {
      const r = mgRunLive();
      return r ? ratesMgLeft(v, r.conc, r.cleaned, mgTau(t)) : 1;
    },
    mgBubbling: (t = now()) => {
      const r = mgRunLive();
      return r ? ratesMgRate(v, r.conc, r.cleaned, mgTau(t)) : 0;
    },
    mgTemp: (t = now()) => {
      const r = mgRunLive();
      return r ? ratesMgTemp(v, r.conc, r.cleaned, mgTau(t)) : v.room;
    },
    mgGone: (t = now()) => {
      const r = mgRunLive();
      return !!r && mgTau(t) > ratesMgEnd(v, r.conc, r.cleaned);
    },
    pourAcid: (conc: number): string | null => {
      const s = ref.current;
      if (openMg(s)) return 'A run is already set up.';
      const i = s.mgRuns.findIndex((r) => !r);
      if (i < 0) return 'Both runs are done (discard one to repeat it).';
      const start = labBetween(labRandom(v.seed, `plunger-${s.log.length}`), 2, 6, 0);
      update((x) => ({ ...x, mgRuns: x.mgRuns.map((r, k) => (k === i ? { conc, weighed: false, cleaned: false, checked: false, start, dropped: false, bungLag: null, watchLag: null, done: false } : r)) }), `mg-acid:${conc}`);
      return null;
    },
    weigh: () => {
      const m = openMg(ref.current);
      if (m) update((x) => setMg(x, m.i, { weighed: true }), 'weigh');
    },
    clean: () => {
      const m = openMg(ref.current);
      if (m && !m.r.dropped) update((x) => setMg(x, m.i, { cleaned: true }), 'clean-mg');
    },
    zero: () => {
      const m = openMg(ref.current);
      if (m && !m.r.dropped) update((x) => setMg(x, m.i, { start: 0 }), 'zero-syringe');
    },
    check: () => {
      const m = openMg(ref.current);
      if (m && !m.r.dropped) update((x) => setMg(x, m.i, { checked: true }), 'check-airtight');
    },
    drop: (at?: number) => {
      const m = openMg(ref.current);
      if (!m || m.r.dropped) return;
      const t = at ?? now();
      mgLiveRef.current = { run: m.i, dropAt: t };
      const w = watchRef.current;
      const early = w.start !== null && w.stop === null ? r2((w.start - t) / 1000) : null;
      update((x) => setMg(x, m.i, { dropped: true, ...(early !== null ? { watchLag: early } : {}) }), 'drop-mg');
      bump();
    },
    bung: (at?: number) => {
      const m = openMg(ref.current);
      const live = mgLiveRef.current;
      if (!m || !live || m.r.bungLag !== null) return;
      const lag = r2(((at ?? now()) - live.dropAt) / 1000);
      update((x) => setMg(x, m.i, { bungLag: lag }), `bung:${lag}`);
    },
    /** Read the syringe now: a reading (and a table row for its 30 s mark). */
    read: (at?: number): string | null => {
      const s = ref.current;
      const m = openMg(s);
      const w = watchRef.current;
      if (!m || !mgLiveRef.current) return 'No run is going.';
      if (w.start === null) return 'Start the stopwatch first: each reading needs its time.';
      if (s.readings.length >= MAX_READINGS) return 'The record is full.';
      const tw = r2(((w.stop ?? at ?? now()) - w.start) / 1000);
      const slot = Math.round(tw / RATES_INTERVAL) * RATES_INTERVAL;
      update((x) => withRow({ ...x, readings: [...x.readings, { run: m.i, at: tw }] }, slot), `read:${m.i}:${tw}`);
      return null;
    },
    finish: () => {
      const m = openMg(ref.current);
      if (!m || !m.r.dropped) return;
      update((x) => setMg(x, m.i, { done: true }), 'finish-run');
      resetLive();
    },
    /** Pour run i away (the open one by default): its readings go too. */
    discard: (i?: number) => {
      const k = i ?? openMg(ref.current)?.i;
      if (k === undefined || k < 0) return;
      if (mgLiveRef.current?.run === k) resetLive();
      update((x) => ({ ...x, mgRuns: x.mgRuns.map((r, j) => (j === k ? null : r)), readings: x.readings.filter((e) => e.run !== k) }), `pour-away:${k}`);
    },
    // ---- CROSS
    crossLive: crossLiveRef.current,
    crossT,
    /** How far the cross has gone (0 clear … 1 just gone) and its visibility now. */
    crossX: (t = now()) => {
      const r = crossRunLive();
      return r ? ratesCrossX(v, r, crossT(t)) : 0;
    },
    crossVisible: (t = now()) => {
      const r = crossRunLive();
      return r ? ratesCrossVisibility(ratesCrossX(v, r, crossT(t))) : 1;
    },
    /** The thermometer in the flask now (°C). */
    thermoNow: (t = now()) => {
      const s = ref.current;
      const c = openCross(s);
      const r = c?.r ?? (crossFlaskFull(s) ? s.crossRuns.at(-1) : undefined);
      if (!r) return v.room;
      if (crossLiveRef.current && c && crossLiveRef.current.run === c.i) return ratesCrossTemp(v, r, crossT(t));
      return ratesCrossTpre(v, r);
    },
    measure: (thio: number, water: number): string | null => {
      const s = ref.current;
      if (openCross(s)) return 'Finish the run in the flask first.';
      if (crossFlaskFull(s)) return 'Empty the flask first.';
      if (s.crossRuns.length >= MAX_CROSS) return 'The table is full.';
      const run: RatesCrossRun = { n: s.made, kind: 'CONC', thio, water, acid: RATES_CROSS_ACID, bath: null, rinsed: !crossFlaskDirty(s), swirled: false, watchLag: null, elapsed: null, top: true, temp: null, tempAfter: false, done: false };
      update((x) => ({ ...x, crossRuns: [...x.crossRuns, run], cross: [...x.cross, { v: '', w: '', th: '', t: '', inv: '' }], made: x.made + 1 }), `measure:${thio}:${water}`);
      return null;
    },
    setAcid: (ml: number) => {
      const c = openCross(ref.current);
      if (c && !crossLiveRef.current) update((x) => setCross(x, c.i, { acid: ml }), `acid-vol:${ml}`);
    },
    warm: (bath: number) => {
      const c = openCross(ref.current);
      if (c && !crossLiveRef.current) update((x) => setCross(x, c.i, { bath, kind: 'TEMP' }), `warm:${bath}`);
    },
    addAcid: (at?: number) => {
      const c = openCross(ref.current);
      if (!c || crossLiveRef.current) return;
      const t = at ?? now();
      crossLiveRef.current = { run: c.i, acidAt: t };
      const w = watchRef.current;
      const early = w.start !== null && w.stop === null ? r2((w.start - t) / 1000) : null;
      update((x) => setCross(x, c.i, early !== null ? { watchLag: early } : {}), 'add-acid');
      bump();
    },
    swirl: () => {
      const c = openCross(ref.current);
      if (c && crossLiveRef.current) update((x) => setCross(x, c.i, { swirled: true }), 'swirl');
    },
    readThermo: (at?: number) => {
      const s = ref.current;
      const c = openCross(s) ?? (crossFlaskFull(s) && s.crossRuns.length ? { i: s.crossRuns.length - 1, r: s.crossRuns.at(-1)! } : null);
      if (!c) return;
      const after = !!crossLiveRef.current && crossLiveRef.current.run === c.i;
      const temp = r2(after ? ratesCrossTemp(v, c.r, crossT(at ?? now())) : ratesCrossTpre(v, c.r));
      update((x) => setCross(x, c.i, { temp, tempAfter: after || c.r.done }), `thermo:${temp}`);
    },
    /** Record the stopped time: the run is finished. */
    record: (): string | null => {
      const c = openCross(ref.current);
      if (!c) return 'No run is going.';
      if (c.r.elapsed === null) return 'Stop the stopwatch first.';
      // the thermometer stays in the mixture: a reading taken at the stop
      update((x) => setCross(x, c.i, { done: true }), 'record');
      crossLiveRef.current = null;
      watchRef.current = IDLE_WATCH;
      bump();
      return null;
    },
    empty: () => {
      const s = ref.current;
      const c = openCross(s);
      if (c) {
        crossLiveRef.current = null;
        watchRef.current = IDLE_WATCH;
        bump();
        update((x) => ({ ...x, crossRuns: x.crossRuns.filter((_, k) => k !== c.i), cross: x.cross.filter((_, k) => k !== c.i) }), 'cross-empty');
      } else if (crossFlaskFull(s)) update((x) => x, 'cross-empty');
    },
    rinse: () => update((x) => x, 'rinse-flask'),
    removeCross: (i: number) => update((x) => ({ ...x, crossRuns: x.crossRuns.filter((_, k) => k !== i), cross: x.cross.filter((_, k) => k !== i) }), `remove-run:${i}`),
    resetLive,
  };
  // Time-lapse: the clock eases back to real time near each 30 s mark (magnesium) and as the cross fades.
  useEffect(() => {
    if (givenClock) return;
    const id = setInterval(() => {
      const w = watchRef.current;
      // only while the stopwatch runs (the hands always work in real time)
      let r = 1;
      if (speed > 1 && w.start !== null && w.stop === null) {
        r = speed;
        const e = elapsed() % RATES_INTERVAL;
        if (ref.current.task === 'MG' && (e > RATES_INTERVAL - 4 || e < 1.5)) r = 1;
        if (ref.current.task === 'CROSS' && o.crossX() > 0.6) r = 1;
      }
      clock.setRate(r);
    }, 40);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed, givenClock]);
  return { ...o, watch: watchRef.current, mgLive: mgLiveRef.current, crossLive: crossLiveRef.current };
}
export type Rates = ReturnType<typeof useRates>;

/** Re-renders while something is live (the 2D view and the docks). */
export function useLive(on: boolean, ms = 50) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(tick, ms);
    return () => clearInterval(id);
  }, [on, ms]);
}
