import {
  CHROM_TOP,
  MP_LAG_MIN,
  MP_RATES,
  MP_WATER_STEP,
  PPT_INFO,
  SOL_EVAP_RATE,
  SOL_COOL_TAU,
  chemSaltsVariant,
  chromFront,
  chromSpots,
  mpProduct,
  mpRange,
  pptTotal,
  saltsLessonTask,
  solBaseExcess,
  solCrystals,
  solExcess,
  solFiltrate,
  solMade,
  solProduct,
  solCrystalPoint,
  solRodResult,
  type ChemSaltsState,
  type ChemSaltsVariant,
  type ChromLane,
  type ChromSolvent,
  type MpRun,
  type SaltsTask,
} from '@aischool/shared';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { SimulatorProps } from '../types';

/**
 * The salts bench's actions, shared by the 2D and the 3D lab (and the demo and
 * the sandbox) so all of them produce exactly the same `ChemSaltsState`. Every
 * change goes through `update`, which appends to the action log.
 *
 * Live and not saved: the warm acid's temperature, the water boiling off the
 * evaporating dish and the dish cooling, the solvent front climbing the paper,
 * the oil bath's temperature. They are analytic in the lab clock (which can
 * run in time-lapse, and which the demo jumps forward), and the moments that
 * count (CuO added, heating stopped, the rod test, the crystals filtered off,
 * the paper taken out, a melting reading taken) are written to the state.
 */

export const r2 = (x: number) => Math.round(x * 100) / 100;
export const lessonTask = saltsLessonTask;
export const TASK_TITLE: Record<SaltsTask, string> = {
  SOL: 'Preparing CuSO₄·5H₂O crystals',
  PPT: 'Preparing an insoluble salt',
  CHROM: 'Paper chromatography',
  MP: 'Recrystallisation and melting point',
};
/** Time-lapse choices per task. */
export const SPEEDS: Record<SaltsTask, number[]> = { SOL: [1, 5, 20], PPT: [1], CHROM: [1, 10, 60], MP: [1, 5, 10] };

/** A clock that can run faster than real time (time-lapse; the demo). */
export function makeClock() {
  let base = 0;
  let at = performance.now();
  let rate = 1;
  const now = () => base + (performance.now() - at) * rate;
  return {
    now,
    rate: () => rate,
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

// ------------------------------------------------------------------ the bench: what stands on the gauze, the burner

export type Gauze = 'beaker' | 'dish' | 'oil' | null;
export type Flame = 'OFF' | 'LOW' | 'HIGH';
export function benchFromLog(log: { a: string }[]): { gauze: Gauze; flame: Flame } {
  let gauze: Gauze = null;
  let flame: Flame = 'OFF';
  for (const { a } of log) {
    const [verb, arg] = a.split(':') as [string, string | undefined];
    if (verb === 'gauze') gauze = arg === 'none' || !arg ? null : (arg as Gauze);
    else if (verb === 'burner') flame = (arg as Flame) ?? 'OFF';
    else if (verb === 'return' && arg === 'burner') flame = 'OFF';
  }
  return { gauze, flame };
}

/** Beaker on the gauze: °C per second. Oil bath: °C per minute (MP_RATES). Cooling time constants (s). */
const BEAKER_HEAT: Record<Flame, number> = { OFF: 0, LOW: 0.35, HIGH: 0.9 };
const EVAP: Record<Flame, number> = { OFF: 0, LOW: SOL_EVAP_RATE * 0.45, HIGH: SOL_EVAP_RATE };
const BEAKER_TAU = 600;
const BATH_TAU = 900;
const FRONT_FADE = 150;

// ------------------------------------------------------------------ colours

type RGB = [number, number, number];
const hex = (c: RGB) => `#${c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: RGB, b: RGB, f: number): RGB => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
const CLEAR: RGB = [236, 242, 246];
const CU_BLUE: RGB = [38, 120, 214];
/** Cu²⁺(aq) colour at a concentration (mol dm⁻³): pale blue to deep blue. */
export const copperColour = (c: number) => hex(mix(CLEAR, CU_BLUE, Math.min(1, Math.sqrt(Math.max(0, c) / 1.6))));
export const CRYSTAL_BLUE = '#2f7fe0';
export const ANHYDROUS = '#f1f0ea';
export const CUO_BLACK = '#1c1a19';

// ------------------------------------------------------------------ the hook

export type SaltsUpdate = (fn: (s: ChemSaltsState) => ChemSaltsState, log?: string) => void;

export function useSalts({
  seed,
  state,
  onChange,
  readOnly,
  startedAt,
  practicalId,
  variant,
  autoTask = true,
  clock: givenClock,
}: Pick<SimulatorProps<'chem-salts'>, 'seed' | 'state' | 'onChange' | 'readOnly' | 'startedAt' | 'practicalId'> & { variant?: ChemSaltsVariant; autoTask?: boolean; clock?: Clock }) {
  const task: SaltsTask = variant?.task ?? state.task ?? lessonTask(practicalId);
  const v = useMemo(() => variant ?? chemSaltsVariant(seed, task), [variant, seed, task]);
  const t0 = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const ref = useRef(state);
  ref.current = state;
  const own = useRef<Clock | null>(null);
  if (!own.current) own.current = makeClock();
  const clock = givenClock ?? own.current;
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [speed, setSpeedState] = useState(1);
  const room = v.sol.room;

  const update: SaltsUpdate = (fn, log) => {
    if (readOnly) return;
    let next = fn(ref.current);
    if (log) next = { ...next, log: [...next.log, { t: Math.max(0, Date.now() - t0), a: log.slice(0, 80) }].slice(-800) };
    ref.current = next;
    onChange(next);
  };
  useEffect(() => {
    if (autoTask && !readOnly && !ref.current.task) update((s) => (s.task ? s : { ...s, task }), `task:${task}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, task]);

  // ---- live, analytic in the lab clock
  const live = useRef<{
    acid: { t0: number; T0: number; rate: number };
    dish: { t0: number; W0: number; rate: number; T0: number };
    dev: { t0: number | null; removedAt: number | null };
    bath: { t0: number; T0: number; rate: number };
  } | null>(null);
  if (!live.current) {
    const s = ref.current;
    const now = clock.now();
    const f = s.sol.filtered ? solFiltrate(v, s.sol) : null;
    live.current = {
      acid: { t0: now, T0: s.sol.warmMax !== null && !s.sol.filtered ? Math.max(room, s.sol.warmAtAdd ?? room) : room, rate: 0 },
      dish: { t0: now, W0: s.sol.water ?? f?.water ?? 0, rate: 0, T0: room },
      dev: { t0: s.chrom.inTank ? now : null, removedAt: null },
      bath: { t0: now, T0: room, rate: 0 },
    };
  }
  const L = live.current!;
  const sec = (t: number, from: number) => (t - from) / 1000;
  const acidT = (t = clock.now()) => (L.acid.rate > 0 ? Math.min(100, L.acid.T0 + L.acid.rate * sec(t, L.acid.t0)) : room + (L.acid.T0 - room) * Math.exp(-sec(t, L.acid.t0) / BEAKER_TAU));
  const dishW = (t = clock.now()) => (L.dish.rate > 0 ? Math.max(0, L.dish.W0 - L.dish.rate * sec(t, L.dish.t0)) : L.dish.W0);
  const dishT = (t = clock.now()) => (L.dish.rate > 0 ? 100 : room + (L.dish.T0 - room) * Math.exp(-sec(t, L.dish.t0) / SOL_COOL_TAU));
  const bathT = (t = clock.now()) => (L.bath.rate > 0 ? Math.min(220, L.bath.T0 + (L.bath.rate / 60) * sec(t, L.bath.t0)) : room + (L.bath.T0 - room) * Math.exp(-sec(t, L.bath.t0) / BATH_TAU));
  /** The oil bath's heating rate now (°C min⁻¹; negative while it cools). */
  const bathRate = (t = clock.now()) => (L.bath.rate > 0 ? (bathT(t) >= 220 ? 0 : L.bath.rate) : (-(bathT(t) - room) / BATH_TAU) * 60);
  const devSeconds = (t = clock.now()) => {
    const c = ref.current.chrom;
    if (c.inTank && L.dev.t0 !== null) return sec(t, L.dev.t0);
    return c.developed ?? 0;
  };

  /** Re-start the live segments from the bench now (after the burner or the gauze changed). */
  const resettle = (s: ChemSaltsState) => {
    const now = clock.now();
    const b = benchFromLog(s.log);
    const aT = acidT(now);
    const heatsAcid = task === 'SOL' && b.gauze === 'beaker' && b.flame !== 'OFF' && s.sol.acid !== null && !s.sol.filtered;
    L.acid = { t0: now, T0: aT, rate: heatsAcid ? BEAKER_HEAT[b.flame] : 0 };
    const W = dishW(now);
    const T = dishT(now);
    const heatsDish = task === 'SOL' && b.gauze === 'dish' && b.flame !== 'OFF' && s.sol.filtered && !s.sol.dry && s.sol.filteredAt === null;
    L.dish = { t0: now, W0: W, rate: heatsDish ? EVAP[b.flame] : 0, T0: L.dish.rate > 0 && !heatsDish ? 100 : T };
    const bT = bathT(now);
    const heatsBath = task === 'MP' && b.gauze === 'oil' && b.flame !== 'OFF';
    L.bath = { t0: now, T0: bT, rate: heatsBath ? MP_RATES[b.flame] : 0 };
  };

  const note = (a: string) => {
    const bench = a.startsWith('burner:') || a.startsWith('gauze:') || a === 'return:burner';
    if (!bench) return update((s) => s, a);
    const before = ref.current;
    const b0 = benchFromLog(before.log);
    // settle what the old bench was doing
    if (task === 'SOL' && b0.gauze === 'beaker' && b0.flame !== 'OFF' && before.sol.acid !== null && !before.sol.filtered) {
      const T = Math.round(acidT() * 10) / 10;
      update((s) => ({ ...s, sol: { ...s.sol, warmMax: Math.max(s.sol.warmMax ?? 0, T) } }), `warm:${Math.round(T)}`);
    }
    if (task === 'SOL' && b0.gauze === 'dish' && b0.flame !== 'OFF' && before.sol.filtered && before.sol.filteredAt === null && !before.sol.dry) {
      const W = r2(dishW());
      update((s) => ({ ...s, sol: { ...s.sol, water: W } }), `evaporated:${W.toFixed(1)}`);
    }
    update((s) => s, a);
    resettle(ref.current);
    bump();
  };

  // ---- the ticker: time-lapse rate, the dish drying out, the front fading, the lid left off
  const b = benchFromLog(state.log);
  const solHeating = task === 'SOL' && b.flame !== 'OFF' && (b.gauze === 'beaker' || b.gauze === 'dish');
  const solCooling = task === 'SOL' && state.sol.filtered && state.sol.water !== null && state.sol.filteredAt === null && !state.sol.dry;
  const chromLive = task === 'CHROM' && (state.chrom.inTank || (state.chrom.developed !== null && !state.chrom.frontMarked && !state.chrom.dried));
  const mpLive = task === 'MP' && (b.gauze === 'oil' || state.mp.runs.length > 0);
  const active = !readOnly && (solHeating || solCooling || chromLive || mpLive);
  useEffect(() => {
    if (!active) {
      if (!givenClock) clock.setRate(1);
      return;
    }
    const id = setInterval(() => {
      const s = ref.current;
      const now = clock.now();
      let rate = speed;
      if (task === 'SOL') {
        const bb = benchFromLog(s.log);
        if (bb.gauze === 'dish' && bb.flame !== 'OFF' && s.sol.filtered && !s.sol.dry && s.sol.filteredAt === null && dishW(now) <= 0.001) {
          L.dish = { t0: now, W0: 0, rate: 0, T0: 100 };
          update((x) => ({ ...x, sol: { ...x.sol, water: 0, dry: true } }), 'evaporated-to-dryness');
        }
        if (!(bb.flame !== 'OFF' && bb.gauze) && dishT(now) < room + 0.6) rate = 1;
        // near the crystallisation point the clock slows, so the rod test can catch it
        if (bb.gauze === 'dish' && bb.flame !== 'OFF' && s.sol.filtered && dishW(now) < 1.6 * solCrystalPoint(solFiltrate(v, s.sol).n)) rate = Math.min(rate, 5);
      } else if (task === 'CHROM') {
        const c = s.chrom;
        if (c.inTank) {
          const t = devSeconds(now);
          if (!c.covered && c.coveredThroughout && t > 20) update((x) => ({ ...x, chrom: { ...x.chrom, coveredThroughout: false } }), 'tank-uncovered');
          if (chromFront(v, c, t) >= 12.3) rate = 1;
        } else {
          rate = 1;
          if (c.developed !== null && !c.frontMarked && !c.dried && L.dev.removedAt !== null && sec(now, L.dev.removedAt) > FRONT_FADE) update((x) => ({ ...x, chrom: { ...x.chrom, dried: true } }), 'front-faded');
        }
      } else if (task === 'MP') {
        // ease back to real time while a sample is melting, so the readings can be taken
        const open = s.mp.runs.find((r) => !r.done);
        if (open) {
          const f = meltFraction(open, now);
          if (f > 0 && f < 1) rate = Math.min(rate, 2);
        }
      }
      if (!givenClock) clock.setRate(rate);
      bump();
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, speed, task, v]);
  const setSpeed = (x: number) => {
    setSpeedState(x);
    if (!givenClock) clock.setRate(active ? x : 1);
  };

  // ---- MP: the sample in the capillary
  const openRun = () => ref.current.mp.runs.find((r) => !r.done) ?? null;
  /** The sample's temperature now (the thermometer runs ahead of it while heating, and reads off when the tube hangs loose). */
  const sampleT = (run: Pick<MpRun, 'attached'>, t = clock.now()) => bathT(t) - Math.max(0, bathRate(t)) * MP_LAG_MIN - (run.attached ? 0 : 3.5);
  const meltFraction = (run: MpRun, t = clock.now()) => {
    const [a, e] = mpRange(v, ref.current.mp, run.sample);
    return Math.max(0, Math.min(1, (sampleT(run, t) - a) / Math.max(0.2, e - a)));
  };

  // ---- guards (why an operation can't be done now), from a given state (the ops use the live one)
  const whyOf = (s: ChemSaltsState) => {
  const sol = s.sol;
  const ppt = s.ppt;
  const ch = s.chrom;
  const mp = s.mp;
  const b = benchFromLog(s.log);
  const openR = mp.runs.find((r) => !r.done) ?? null;
  return {
    // SOL
    acid: sol.acid !== null ? 'The acid is already in the beaker.' : undefined,
    cuo: sol.acid === null ? 'Measure the acid into the beaker first.' : sol.filtered ? 'The excess has been filtered off already.' : undefined,
    stir: sol.acid === null ? 'There is nothing in the beaker.' : sol.filtered ? 'The beaker is empty now.' : undefined,
    filterExcess: !sol.portions ? 'Add the copper(II) oxide first.' : sol.filtered ? 'Already filtered.' : b.gauze === 'beaker' && b.flame !== 'OFF' ? 'Take the beaker off the heat first.' : undefined,
    rod: !sol.filtered ? 'Filter the solution into the evaporating dish first.' : sol.filteredAt !== null ? 'The crystals have been filtered off.' : undefined,
    filterCrystals: !sol.filtered || sol.water === null ? 'Evaporate the filtrate first.' : sol.filteredAt !== null ? 'Already filtered off.' : b.gauze === 'dish' && b.flame !== 'OFF' ? 'Stop heating and let the dish cool first.' : undefined,
    wash: sol.filteredAt === null ? 'Filter off the crystals first.' : sol.wash ? 'Already washed.' : undefined,
    dry: sol.filteredAt === null ? 'Filter off the crystals first.' : sol.drying ? 'Already dried.' : undefined,
    weigh: sol.filteredAt === null && !sol.dry ? 'There is nothing to weigh yet.' : undefined,
    // PPT
    pptCat: ppt.cat !== null ? 'Already measured.' : undefined,
    pptAn: ppt.an !== null ? 'Already added.' : ppt.cat === null ? `Measure the ${PPT_INFO[v.ppt.pair].cation.formula} first.` : undefined,
    pptStir: !ppt.mixed ? 'Mix the two solutions first.' : ppt.filtered ? 'It has been filtered.' : undefined,
    pptPaper: ppt.filtered ? 'Too late: the paper is wet with precipitate.' : ppt.paper ? 'Already weighed.' : undefined,
    pptFilter: !ppt.mixed ? 'Mix the two solutions first.' : ppt.filtered ? 'Already filtered.' : undefined,
    pptRinse: !ppt.filtered ? 'Filter first.' : ppt.dried ? 'The precipitate is already dried.' : ppt.rinsed ? 'Already rinsed.' : undefined,
    pptWash: !ppt.filtered ? 'Filter first.' : ppt.dried ? 'The precipitate is already dried.' : undefined,
    pptDry: !ppt.filtered ? 'Filter first.' : undefined,
    pptWeigh: !ppt.filtered ? 'Filter first.' : undefined,
    // CHROM
    line: ch.line ? 'The baseline is drawn.' : undefined,
    spot: !ch.line ? 'Draw the baseline first.' : ch.inTank || ch.developed !== null ? 'The paper has been run.' : undefined,
    solvent: ch.solvent ? 'The solvent is in the tank.' : undefined,
    place: !ch.line ? 'Draw the baseline first.' : !ch.spots.some((x) => x.n > 0) ? 'Spot the samples on the baseline first.' : !ch.solvent ? 'Pour the solvent into the tank first.' : ch.inTank ? 'The paper is in the tank.' : ch.developed !== null ? 'This paper has been run already.' : ch.spots.some((x) => !x.dry) ? 'Let the spots dry first.' : undefined,
    remove: !ch.inTank ? 'The paper is not in the tank.' : undefined,
    mark: ch.developed === null ? 'Run the chromatogram first.' : ch.inTank ? 'Take the paper out first.' : ch.frontMarked ? 'Already marked.' : ch.dried ? 'The front has dried and can no longer be seen.' : undefined,
    dryPaper: ch.developed === null || ch.inTank ? 'Take the paper out first.' : ch.dried ? 'It is dry.' : undefined,
    // MP
    mpWater: mp.hotFiltered ? 'The solution has been filtered.' : undefined,
    mpFunnel: mp.hotFiltered ? 'Already filtered.' : mp.funnelWarm ? 'The funnel is warm.' : undefined,
    mpFilter: !mp.water ? 'Dissolve the sample in boiling water first.' : mp.hotFiltered ? 'Already filtered.' : undefined,
    mpCool: mp.cooling ? 'It is crystallising.' : !mp.water ? 'Dissolve the sample first.' : undefined,
    mpIce: !mp.cooling ? 'Let it cool first.' : mp.iced ? 'Already in the ice bath.' : undefined,
    mpCollect: !mp.cooling ? 'Let it crystallise first.' : mp.collected ? 'Already filtered off.' : undefined,
    mpWash: !mp.collected ? 'Filter off the crystals first.' : mp.washed ? 'Already washed.' : undefined,
    mpDry: !mp.collected ? 'Filter off the crystals first.' : mp.dried ? 'Already dry.' : undefined,
    mpWeigh: !mp.collected ? 'There is nothing to weigh yet.' : undefined,
    pack: openR ? 'A capillary is in the bath: finish it first.' : mp.runs.filter((r) => r.done).length >= 8 ? 'That is enough melting points.' : undefined,
    packPure: !mp.collected ? 'Recrystallise the sample first.' : undefined,
    attach: !openR ? 'Pack a capillary tube first.' : openR.attached ? 'It is fastened to the thermometer.' : undefined,
    start: !openR ? 'Pack a capillary tube first.' : openR.start !== null ? 'Already recorded.' : undefined,
    end: !openR || openR.start === null ? 'Record when melting starts first.' : undefined,
  };
  };
  const why = whyOf(state);
  const W = () => whyOf(ref.current);
  const say = (m: string | undefined) => m;

  // ---- operations (each returns a message when it can't be done)
  const ops = {
    // SOL
    measureAcid: (vol: number) => W().acid ?? (update((x) => ({ ...x, sol: { ...x.sol, acid: vol } }), `acid:${vol}`), undefined),
    addCuO: () => {
      if (W().cuo) return W().cuo;
      const T = Math.round(acidT() * 10) / 10;
      update((x) => ({ ...x, sol: { ...x.sol, cuo: r2(x.sol.cuo + v.sol.portion), portions: x.sol.portions + 1, warmAtAdd: x.sol.warmAtAdd ?? T, warmMax: Math.max(x.sol.warmMax ?? 0, T) } }), `add-cuo:${x0(T)}`);
      return say(undefined);
    },
    stir: () => W().stir ?? (update((x) => ({ ...x, sol: { ...x.sol, stirs: x.sol.stirs + 1 } })), undefined),
    filterExcess: () => {
      if (W().filterExcess) return W().filterExcess;
      const f = solFiltrate(v, ref.current.sol);
      L.dish = { t0: clock.now(), W0: f.water, rate: 0, T0: acidT() };
      update((x) => ({ ...x, sol: { ...x.sol, filtered: true } }), 'filter-excess');
      resettle(ref.current);
      return undefined;
    },
    rodTest: () => {
      if (W().rod) return W().rod;
      const wat = r2(dishW());
      const res = solRodResult(solFiltrate(v, ref.current.sol).n, wat);
      update((x) => ({ ...x, sol: { ...x.sol, rod: [...x.sol.rod, wat].slice(-40), water: wat } }), `rod:${res}`);
      return undefined;
    },
    filterCrystals: () => {
      if (W().filterCrystals) return W().filterCrystals;
      const T = Math.round(dishT() * 10) / 10;
      update((x) => ({ ...x, sol: { ...x.sol, filteredAt: T } }), `filter-crystals:${Math.round(T)}`);
      return undefined;
    },
    washCrystals: (k: 'COLD' | 'HOT' | 'NONE') => W().wash ?? (update((x) => ({ ...x, sol: { ...x.sol, wash: k } }), `wash:${k}`), undefined),
    dryCrystals: (k: 'PAPER' | 'HEAT' | 'NONE') => W().dry ?? (update((x) => ({ ...x, sol: { ...x.sol, drying: k, wash: x.sol.wash ?? 'NONE' } }), `dry:${k}`), undefined),
    weighCrystals: () => W().weigh ?? (update((x) => ({ ...x, sol: { ...x.sol, weighed: true } }), 'weigh-crystals'), undefined),
    // PPT
    measureCat: (vol: number) => W().pptCat ?? (update((x) => ({ ...x, ppt: { ...x.ppt, cat: vol } }), `cat:${vol}`), undefined),
    addAn: (vol: number) => W().pptAn ?? (update((x) => ({ ...x, ppt: { ...x.ppt, an: vol, mixed: true } }), `an:${vol}`), undefined),
    stirPpt: () => W().pptStir ?? (update((x) => ({ ...x, ppt: { ...x.ppt, stirred: true } }), 'stir-ppt'), undefined),
    weighPaper: () => W().pptPaper ?? (update((x) => ({ ...x, ppt: { ...x.ppt, paper: true } }), 'weigh-paper'), undefined),
    filterPpt: () => W().pptFilter ?? (update((x) => ({ ...x, ppt: { ...x.ppt, filtered: true } }), 'filter-ppt'), undefined),
    rinseBeaker: () => W().pptRinse ?? (update((x) => ({ ...x, ppt: { ...x.ppt, rinsed: true } }), 'rinse-beaker'), undefined),
    washPpt: () => W().pptWash ?? (update((x) => ({ ...x, ppt: { ...x.ppt, washes: Math.min(20, x.ppt.washes + 1) } }), 'wash-ppt'), undefined),
    dryPpt: (flame = false) => W().pptDry ?? (update((x) => ({ ...x, ppt: { ...x.ppt, dried: Math.min(20, x.ppt.dried + 1), flame: x.ppt.flame || flame } }), flame ? 'dry-flame' : 'dry-oven'), undefined),
    weighPpt: () => W().pptWeigh ?? (update((x) => ({ ...x, ppt: { ...x.ppt, weighings: [...x.ppt.weighings, x.ppt.dried].slice(-20) } }), 'weigh-ppt'), undefined),
    // CHROM
    drawLine: (tool: 'PENCIL' | 'INK', at: number) => W().line ?? (update((x) => ({ ...x, chrom: { ...x.chrom, line: tool, lineAt: at } }), `line:${tool}:${at}`), undefined),
    spot: (lane: ChromLane) => {
      if (W().spot) return W().spot;
      update((x) => {
        const old = x.chrom.spots.find((p) => p.lane === lane);
        const spots = old ? x.chrom.spots.map((p) => (p.lane === lane ? { ...p, n: Math.min(20, p.n + 1), wet: Math.min(20, p.wet + (p.dry ? 0 : 1)), dry: false } : p)) : [...x.chrom.spots, { lane, n: 1, wet: 0, dry: false }];
        return { ...x, chrom: { ...x.chrom, spots } };
      }, `spot:${lane}`);
      return undefined;
    },
    drySpots: () => (update((x) => ({ ...x, chrom: { ...x.chrom, spots: x.chrom.spots.map((p) => ({ ...p, dry: true })) } }), 'dry-spots'), undefined),
    pourSolvent: (solvent: ChromSolvent, depth: number) => W().solvent ?? (update((x) => ({ ...x, chrom: { ...x.chrom, solvent, depth } }), `solvent:${solvent}:${depth}`), undefined),
    placePaper: () => {
      if (W().place) return W().place;
      L.dev = { t0: clock.now(), removedAt: null };
      update((x) => ({ ...x, chrom: { ...x.chrom, inTank: true, coveredThroughout: true } }), 'place-paper');
      return undefined;
    },
    cover: (on: boolean) => {
      const c = ref.current.chrom;
      if (c.covered === on) return undefined;
      const lost = !on && c.inTank && devSeconds() > 20;
      update((x) => ({ ...x, chrom: { ...x.chrom, covered: on, coveredThroughout: lost ? false : x.chrom.coveredThroughout } }), on ? 'cover-tank' : 'uncover-tank');
      return undefined;
    },
    removePaper: () => {
      if (W().remove) return W().remove;
      const t = Math.round(devSeconds());
      L.dev = { t0: null, removedAt: clock.now() };
      update((x) => ({ ...x, chrom: { ...x.chrom, inTank: false, developed: t } }), `remove-paper:${t}`);
      return undefined;
    },
    markFront: () => W().mark ?? (update((x) => ({ ...x, chrom: { ...x.chrom, frontMarked: true } }), 'mark-front'), undefined),
    dryPaper: () => W().dryPaper ?? (update((x) => ({ ...x, chrom: { ...x.chrom, dried: true } }), 'dry-paper'), undefined),
    // MP
    weighImpure: () => (update((x) => ({ ...x, mp: { ...x.mp, weighedImpure: true } }), 'weigh-impure'), undefined),
    addWater: () => {
      if (W().mpWater) return W().mpWater;
      const bb = benchFromLog(ref.current.log);
      const boiling = bb.gauze === 'beaker' && bb.flame !== 'OFF';
      update((x) => ({ ...x, mp: { ...x.mp, water: Math.min(1000, x.mp.water + MP_WATER_STEP), boiled: x.mp.boiled || boiling } }), `add-water:${boiling ? 'boil' : 'cold'}`);
      return undefined;
    },
    warmFunnel: () => W().mpFunnel ?? (update((x) => ({ ...x, mp: { ...x.mp, funnelWarm: true } }), 'warm-funnel'), undefined),
    hotFilter: () => W().mpFilter ?? (update((x) => ({ ...x, mp: { ...x.mp, hotFiltered: true } }), 'hot-filter'), undefined),
    cool: (k: 'SLOW' | 'FAST') => W().mpCool ?? (update((x) => ({ ...x, mp: { ...x.mp, cooling: k, iced: x.mp.iced || k === 'FAST' } }), `cool:${k}`), undefined),
    ice: () => W().mpIce ?? (update((x) => ({ ...x, mp: { ...x.mp, iced: true } }), 'ice-bath'), undefined),
    collect: () => W().mpCollect ?? (update((x) => ({ ...x, mp: { ...x.mp, collected: true } }), 'collect-crystals'), undefined),
    washMp: () => W().mpWash ?? (update((x) => ({ ...x, mp: { ...x.mp, washed: true } }), 'wash-ice-cold'), undefined),
    dryMp: () => W().mpDry ?? (update((x) => ({ ...x, mp: { ...x.mp, dried: true } }), 'dry-crystals'), undefined),
    weighPure: () => W().mpWeigh ?? (update((x) => ({ ...x, mp: { ...x.mp, weighedPure: true } }), 'weigh-pure'), undefined),
    pack: (sample: 'IMPURE' | 'PURE') => {
      if (W().pack) return W().pack;
      if (sample === 'PURE' && W().packPure) return W().packPure;
      if (bathT() > 105) return `The oil bath is at ${Math.round(bathT())} °C: let it cool below about 105 °C before the next tube, or the sample melts at once.`;
      update((x) => ({ ...x, mp: { ...x.mp, runs: [...x.mp.runs, { sample, attached: false, start: null, end: null, rateStart: null, rateEnd: null, done: false }] } }), `pack:${sample}`);
      return undefined;
    },
    attach: () => W().attach ?? (update((x) => ({ ...x, mp: { ...x.mp, runs: x.mp.runs.map((r) => (r.done ? r : { ...r, attached: true })) } }), 'attach-capillary'), undefined),
    recordStart: () => {
      if (W().start) return W().start;
      const T = Math.round(bathT() * 10) / 10;
      const rate = Math.round(bathRate() * 10) / 10;
      update((x) => ({ ...x, mp: { ...x.mp, runs: x.mp.runs.map((r) => (r.done ? r : { ...r, start: T, rateStart: rate })) } }), `melt-start:${T}`);
      return undefined;
    },
    recordEnd: () => {
      if (W().end) return W().end;
      const T = Math.round(bathT() * 10) / 10;
      const rate = Math.round(bathRate() * 10) / 10;
      update((x) => ({ ...x, mp: { ...x.mp, runs: x.mp.runs.map((r) => (r.done ? r : { ...r, end: T, rateEnd: rate, done: true })) } }), `melt-end:${T}`);
      return undefined;
    },
    discardRun: () => (update((x) => ({ ...x, mp: { ...x.mp, runs: x.mp.runs.filter((r) => r.done) } }), 'discard-capillary'), undefined),
  };

  /** Demo/skip helpers: jump the lab clock (time-lapse) by `ms`. */
  const skip = (ms: number) => {
    clock.shift(ms);
    bump();
  };
  /** Back to a cold, idle bench (the demo replays from an empty state). */
  const resetLive = () => {
    const now = clock.now();
    L.acid = { t0: now, T0: room, rate: 0 };
    L.dish = { t0: now, W0: 0, rate: 0, T0: room };
    L.dev = { t0: null, removedAt: null };
    L.bath = { t0: now, T0: room, rate: 0 };
  };

  // ---- what the bench shows now
  const look = {
    acidT: acidT(),
    dishW: dishW(),
    dishT: dishT(),
    bathT: bathT(),
    bathRate: bathRate(),
    devSeconds: devSeconds(),
    front: chromFront(v, state.chrom, devSeconds()),
    spots: chromSpots(v, state.chrom, devSeconds()),
    melt: openRun() ? meltFraction(openRun()!) : 0,
  };
  return { v, task, ref, update, note, ops, why, clock, speed, setSpeed, active, skip, resetLive, look, acidT, dishW, dishT, bathT, bathRate, devSeconds, meltFraction, openRun, bench: b, room };
}
export type Salts = ReturnType<typeof useSalts>;
const x0 = (T: number) => Math.round(T);

// ------------------------------------------------------------------ what each bench looks like (both views)

/** SOL: the beaker (acid, dissolved CuO, undissolved black solid) and the dish (solution, crystals, white powder). */
export function solView(x: Salts, s: ChemSaltsState) {
  const v = x.v;
  const w = s.sol;
  const made = solMade(v, w);
  const vol = (w.acid ?? 0) / 1000;
  const f = w.filtered ? solFiltrate(v, w) : null;
  const water = w.filtered ? x.look.dishW : 0;
  const T = x.look.dishT;
  const crystalMol = f && !w.dry && water > 0 ? solCrystals(f.n, water, T) : 0;
  const product = solProduct(v, w);
  return {
    beakerColour: w.acid !== null && !w.filtered ? copperColour(vol > 0 ? made / vol : 0) : null,
    undissolved: w.filtered ? 0 : solExcess(v, w),
    excess: solBaseExcess(v, w),
    dishColour: f && !w.dry && water > 0 ? copperColour(f.n / Math.max(0.002, water / 1000)) : null,
    dishFill: f ? Math.max(0, Math.min(1, water / Math.max(1, f.water))) : 0,
    crystals: crystalMol,
    crystalFrac: f ? crystalMol / Math.max(1e-6, f.n) : 0,
    dry: w.dry,
    product,
  };
}
/** PPT: the balance readings. */
export const pptBalance = (x: Salts, s: ChemSaltsState) => (s.ppt.weighings.length ? pptTotal(x.v, s.ppt, s.ppt.weighings.at(-1)!) : null);
export const mpBalance = (x: Salts, s: ChemSaltsState) => (s.mp.weighedPure ? mpProduct(x.v, s.mp).mass : null);
export const frontAtTop = (x: Salts) => x.look.front >= CHROM_TOP;

// ------------------------------------------------------------------ hints (practice mode)

export function nextHint(s: ChemSaltsState, x: Salts): string {
  const v = x.v;
  const b = x.bench;
  if (x.task === 'SOL') {
    const w = s.sol;
    if (w.acid === null) return 'Measure 50.0 cm³ of the dilute H₂SO₄ into the beaker with the measuring cylinder.';
    if (!w.portions && x.look.acidT < 45) return b.gauze === 'beaker' && b.flame !== 'OFF' ? `Warming… ${Math.round(x.look.acidT)} °C. About 60 °C is enough — do not boil it.` : 'Warm the acid gently on the gauze (light the burner) to about 60 °C.';
    if (!w.filtered && !solBaseExcess(v, w)) return 'Add the black CuO one spatula at a time, stirring, until some stays undissolved.';
    if (!w.filtered) return b.flame !== 'OFF' && b.gauze === 'beaker' ? 'Turn off the burner, then filter off the excess CuO into the evaporating dish.' : 'Some black CuO stays undissolved: the acid is used up. Filter off the excess into the evaporating dish.';
    if (w.dry) return 'The dish went dry: white anhydrous CuSO₄. Note it and weigh what you have — next time stop at the crystallisation point.';
    if (w.filteredAt === null) {
      if (!(b.gauze === 'dish' && b.flame !== 'OFF') && (w.water === null || !w.rod.length)) return 'Stand the dish on the gauze and heat it to evaporate the water. Test with a cold glass rod now and then.';
      if (b.gauze === 'dish' && b.flame !== 'OFF') return `Evaporating (${Math.round(x.look.dishW)} g of water left). Dip a cold glass rod in: when crystals form on it, stop heating.`;
      return x.look.dishT > v.sol.room + 3 ? `Cooling (${Math.round(x.look.dishT)} °C): crystals are growing. Use time-lapse; filter them off when it is cold.` : 'Cold now: filter off the crystals.';
    }
    if (!w.wash) return 'Wash the crystals with a little cold distilled water.';
    if (!w.drying) return 'Dry the crystals by pressing them between filter papers.';
    if (!w.weighed) return 'Weigh the dry crystals.';
    return 'Record the mass and work out the yield in your notebook.';
  }
  if (x.task === 'PPT') {
    const w = s.ppt;
    const i = PPT_INFO[v.ppt.pair];
    if (w.cat === null) return `Measure 25.0 cm³ of the ${i.cation.formula} solution into the beaker.`;
    if (w.an === null) return `Add 30 cm³ of ${i.anion.formula} (an excess) and watch.`;
    if (!w.stirred) return 'Stir the mixture with the glass rod.';
    if (!w.paper) return 'Weigh a dry filter paper and record its mass, before filtering.';
    if (!w.filtered) return 'Filter the precipitate through the weighed paper.';
    if (!w.rinsed) return 'Rinse the beaker with distilled water into the funnel, so all the precipitate is collected.';
    if (w.washes < 1) return 'Wash the precipitate on the paper with distilled water.';
    if (w.dried < 1) return 'Dry the paper and precipitate in the warm oven.';
    if (w.weighings.length < 2) return 'Weigh the paper and precipitate. Then dry and weigh again until two weighings agree.';
    return 'Record the masses and work out the yield in your notebook.';
  }
  if (x.task === 'CHROM') {
    const w = s.chrom;
    if (!w.line) return 'Draw a baseline about 1.5 cm from the bottom of the paper — in pencil.';
    if (w.spots.filter((p) => p.n > 0).length < 3) return 'Spot the ink, dye A and dye B on the baseline with capillary tubes.';
    if (w.spots.some((p) => !p.dry)) return 'Let the spots dry (then spot each again to concentrate it).';
    if (w.spots.some((p) => p.n < 2)) return 'Spot each sample again on the same place to make small, concentrated spots.';
    if (!w.solvent) return 'Pour the solvent into the tank — its level must be below the baseline.';
    if (w.developed === null && !w.inTank) return 'Stand the paper in the tank and cover it.';
    if (w.inTank && !w.covered) return 'Cover the tank.';
    if (w.inTank) return x.look.front > 11.5 ? 'The front is near the top: take the paper out now.' : `The solvent is rising (${(x.look.front - (w.lineAt ?? 0)).toFixed(1)} cm above the baseline). Use time-lapse.`;
    if (!w.frontMarked && !w.dried) return 'Mark the solvent front with a pencil now, before it dries.';
    if (!w.dried) return 'Let the paper dry.';
    return 'Measure the distances from the baseline (Read the paper) and work out the Rf values.';
  }
  const w = s.mp;
  if (!w.weighedImpure) return 'Weigh the impure benzoic acid.';
  if (!w.hotFiltered && !(b.gauze === 'beaker' && b.flame !== 'OFF')) return 'Put the beaker on the gauze and light the burner: dissolve the sample in the minimum of boiling water.';
  if (!w.hotFiltered && w.water < 70) return 'Add boiling water 10 cm³ at a time until the solid has just dissolved.';
  if (!w.hotFiltered && !w.funnelWarm) return 'Warm the funnel (pour boiling water through it), then filter the hot solution.';
  if (!w.hotFiltered) return 'Filter the hot solution through the warmed funnel.';
  if (!w.cooling) return 'Leave the filtrate to cool slowly.';
  if (!w.iced) return 'Then cool it in the ice bath.';
  if (!w.collected) return 'Filter off the crystals.';
  if (!w.washed) return 'Wash them with a little ice-cold water.';
  if (!w.dried) return 'Dry the crystals.';
  if (!w.weighedPure) return 'Weigh the dry crystals.';
  const done = new Set(w.runs.filter((r) => r.done).map((r) => r.sample));
  const open = x.openRun();
  if (!open) return done.size === 2 ? 'Record both melting ranges and do the calculations.' : `Pack a capillary with the ${done.has('IMPURE') ? 'recrystallised' : 'impure'} sample.`;
  if (!open.attached) return 'Fasten the capillary to the thermometer, the sample level with the bulb.';
  if (b.gauze !== 'oil') return 'Stand the oil bath on the gauze.';
  if (x.look.bathT < 108) return 'Heat the oil bath quickly (high flame) to about 110 °C…';
  if (b.flame === 'HIGH') return 'Now turn the flame low: heat slowly, about 2 °C a minute, near the melting point.';
  if (open.start === null) return 'Watch the sample: record the temperature when it starts to melt.';
  return 'Record the temperature when the last of the solid has melted.';
}
