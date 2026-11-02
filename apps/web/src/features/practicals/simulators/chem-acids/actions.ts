import {
  ACID_TESTS,
  HARD_LABEL,
  HARD_VOL,
  IND_BURETTE,
  IND_SOL_LABEL,
  PH_LETTER,
  PH_SAMPLES,
  acidBalance,
  acidChips,
  acidExtent,
  acidTestResult,
  acidsLessonTask,
  chemAcidsVariant,
  extractColour,
  hardLather,
  hardOpenRun,
  hardScum,
  indFlaskColour,
  indOpenRun,
  indPh,
  phTubeColour,
  type AcidTest,
  type AcidTube,
  type AcidsTask,
  type ChemAcidsState,
  type ChemAcidsVariant,
  type HardBoil,
  type HardSample,
  type IndIndicator,
  type IndSol,
  type PhSample,
} from '@aischool/shared';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { SimulatorProps } from '../types';

/**
 * The acids, bases and water bench's actions, shared by the 2D and the 3D lab
 * (and the demo and the sandbox) so all of them produce exactly the same
 * `ChemAcidsState`. Every change goes through `update`, which appends to the
 * action log. Live and not saved: the marble reacting in the flask (analytic
 * in the lab clock, which can run in time-lapse); the moments that count — the
 * chips going in and each weighing — are written to the state.
 */

export const r2 = (x: number) => Math.round(x * 100) / 100;
export const lessonTask = acidsLessonTask;
export const TASK_TITLE: Record<AcidsTask, string> = {
  PH: 'pH with universal indicator',
  IND: 'An indicator from zobo (hibiscus)',
  ACID: 'Acids with metals, oxides and carbonates',
  HARD: 'Hardness of water',
};
export const SPEEDS: Record<AcidsTask, number[]> = { PH: [1], IND: [1], ACID: [1, 5, 20], HARD: [1] };

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

// ------------------------------------------------------------------ colours
export const HCL_LIQ = '#e9f1f5';
export const NAOH_LIQ = '#eef3f6';
export const SOAP_LIQ = '#f1efe4';
export const ZOBO_DRY = '#6d1028';
export const MG = '#c9cdd1';
export const ZN = '#9aa2a8';
export const CU = '#b8653a';
export const CUO = '#1d1d1f';
export const MARBLE = '#efeee8';
export const LIME_CLEAR = '#eef4f6';
export const LIME_MILKY = '#e9ebe9';
export const CUCL2 = '#5fae9d';

// ------------------------------------------------------------------ the hook

export type AcidsUpdate = (fn: (s: ChemAcidsState) => ChemAcidsState, log?: string) => void;

export function useAcids({
  seed,
  state,
  onChange,
  readOnly,
  startedAt,
  practicalId,
  variant,
  autoTask = true,
  clock: givenClock,
}: Pick<SimulatorProps<'chem-acids'>, 'seed' | 'state' | 'onChange' | 'readOnly' | 'startedAt' | 'practicalId'> & { variant?: ChemAcidsVariant; autoTask?: boolean; clock?: Clock }) {
  const task: AcidsTask = variant?.task ?? state.task ?? lessonTask(practicalId);
  const v = useMemo(() => variant ?? chemAcidsVariant(seed, task), [variant, seed, task]);
  const t0 = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const ref = useRef(state);
  ref.current = state;
  const own = useRef<Clock | null>(null);
  if (!own.current) own.current = makeClock();
  const clock = givenClock ?? own.current;
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [speed, setSpeedState] = useState(1);

  const update: AcidsUpdate = (fn, log) => {
    if (readOnly) return;
    let next = fn(ref.current);
    if (log) next = { ...next, log: [...next.log, { t: Math.max(0, Date.now() - t0), a: log.slice(0, 80) }].slice(-1200) };
    ref.current = next;
    onChange(next);
  };
  /** A log note with no change to the marked state (collecting, goggles, the coat). */
  const note = (a: string) => update((s) => s, a);
  useEffect(() => {
    if (autoTask && !readOnly && !ref.current.task) update((s) => (s.task ? s : { ...s, task }), `task:${task}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, task]);

  // ---- live: the marble reacting, analytic in the lab clock
  const live = useRef<{ acid: number | null } | null>(null);
  if (!live.current) {
    const s = ref.current;
    live.current = { acid: s.acid.added ? clock.now() - (s.acid.weighings.at(-1) ?? 0) * 1000 : null };
  }
  const L = live.current!;
  /** Seconds since the marble went into the acid. */
  const acidSeconds = (t = clock.now()) => (ref.current.acid.added && L.acid !== null ? Math.min(100_000, (t - L.acid) / 1000) : 0);
  const acidLive = task === 'ACID' && state.acid.added;
  const active = !readOnly && acidLive;
  useEffect(() => {
    if (!active) {
      if (!givenClock) clock.setRate(1);
      return;
    }
    const id = setInterval(() => {
      let rate = speed;
      if (acidSeconds() > 3600) rate = 1;
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

  // ---- guards (why an operation can't be done now)
  const whyOf = (s: ChemAcidsState) => {
    const p = s.ph;
    const i = s.ind;
    const a = s.acid;
    const h = s.hard;
    const iRun = indOpenRun(i);
    const hRun = hardOpenRun(h);
    return {
      // PH
      rinse: PH_SAMPLES.some((k) => p.tubes[k].vol) ? 'Too late: there are samples in the tubes.' : p.rinsed ? 'The tubes are rinsed.' : undefined,
      tile: p.tile ? 'The white tile is behind the rack.' : undefined,
      pour: (k: PhSample) => (p.tubes[k].vol ? `Tube ${PH_LETTER[k]} has its sample.` : undefined),
      drops: (k: PhSample) => (!p.tubes[k].vol ? `Pour sample ${PH_LETTER[k]} into its tube first.` : p.tubes[k].drops >= 30 ? 'That is far too much indicator.' : undefined),
      shake: (k: PhSample) => (!p.tubes[k].drops ? 'Add the indicator first.' : undefined),
      compare: (k: PhSample) => (!p.tubes[k].drops ? 'Add the indicator first.' : undefined),
      // IND
      crush: i.solvent ? 'The calyces are crushed.' : undefined,
      filterExt: !i.solvent ? 'Crush the calyces first.' : i.filtered ? 'Already filtered.' : undefined,
      ext: (k: IndSol) => (!i.solvent ? 'Make the extract first.' : i.tests[k].ext ? `The extract is in the ${IND_SOL_LABEL[k].toLowerCase()}.` : undefined),
      ui: (k: IndSol) => (i.tests[k].ui ? 'Already tested.' : undefined),
      rinseBur: i.burette !== null ? 'The burette is filled: rinse it before filling.' : i.burRinsed ? 'Rinsed with the acid.' : undefined,
      fillBur: iRun ? 'Finish this titration first.' : i.fills >= 12 ? 'There is no more acid.' : undefined,
      rinsePip: i.pipRinsed ? 'Rinsed with the NaOH.' : undefined,
      pipette: i.flask || iRun ? 'There is a flask on the tile already.' : undefined,
      indicator: !i.flask ? 'Pipette 25.0 cm³ of NaOH into a clean flask first.' : i.burette === null ? 'Fill the burette first.' : undefined,
      add: !iRun ? 'Pipette the NaOH and add the indicator first.' : i.burette !== null && i.burette >= IND_BURETTE - 0.001 ? 'The burette is empty: this titration has gone wrong.' : undefined,
      endPoint: !iRun ? 'No titration is in progress.' : iRun.added <= 0 ? 'Run in some acid first.' : undefined,
      // ACID
      tubeAcid: (k: AcidTube) => (a.tubes[k].acid ? 'The acid is in.' : undefined),
      warm: !a.tubes.CUO.acid ? 'Add the acid to the copper(II) oxide first.' : a.tubes.CUO.warmed ? 'It has been warmed.' : undefined,
      test: (k: AcidTube) => (!a.tubes[k].acid ? 'Add the acid first.' : a.tubes[k].tests.length >= 12 ? 'Enough tests.' : undefined),
      zero: a.chips > 0 || a.flaskWeighed ? 'Clear the pan first: zero the balance with nothing on it.' : a.zeroed ? 'It reads 0.00 g.' : undefined,
      tapChips: a.added ? 'The marble is in the flask.' : a.flaskWeighed ? 'Weigh the marble before the flask goes on the pan.' : a.chips >= 24 ? 'That is far too much.' : undefined,
      untapChips: a.chips <= 0 || a.added || a.flaskWeighed ? 'Nothing to tip back.' : undefined,
      acidVol: a.acidVol !== null ? 'The acid is in the flask.' : undefined,
      plug: a.plug ? 'The plug is in.' : a.flaskWeighed ? 'Too late: the plug must be weighed with the flask.' : a.acidVol === null ? 'Measure the acid into the flask first.' : undefined,
      weighFlask: a.acidVol === null ? 'Measure the acid into the flask first.' : a.added ? 'The marble is already in.' : a.flaskWeighed ? 'Already weighed.' : undefined,
      addChips: !a.chips ? 'Weigh the marble chips first.' : a.acidVol === null ? 'Measure the acid first.' : a.added ? 'Already added.' : undefined,
      weighTotal: !a.added ? 'Add the marble first.' : a.weighings.length >= 40 ? 'Enough weighings.' : undefined,
      // HARD
      hRinse: h.burette !== null ? 'The burette is filled.' : h.burRinsed ? 'Rinsed with soap solution.' : undefined,
      hFill: hRun ? 'Finish this sample first.' : h.fills >= 14 ? 'There is no more soap solution.' : undefined,
      boil: (k: HardSample) => (k === 'DIST' ? 'The blank is not boiled.' : h.boiled[k] ? 'This sample has been boiled.' : undefined),
      measure: (k: HardSample, boiled: boolean) => (hRun ? 'Finish the sample in the flask first.' : h.burette === null ? 'Fill the burette with soap solution first.' : boiled && !h.boiled[k] ? `Boil some ${HARD_LABEL[k].toLowerCase()} first.` : undefined),
      soap: !hRun ? 'Measure a sample into the flask first.' : h.burette !== null && h.burette >= 49.999 ? 'The burette is empty: refill after this sample.' : undefined,
      watch: !hRun ? 'There is nothing in the flask.' : hRun.added <= 0 ? 'Add some soap first.' : undefined,
      finish: !hRun ? 'There is nothing in the flask.' : undefined,
    };
  };
  const why = whyOf(state);
  const W = () => whyOf(ref.current);
  const setPh = (k: PhSample, patch: Partial<ChemAcidsState['ph']['tubes']['HCL']>) => (s: ChemAcidsState): ChemAcidsState => ({ ...s, ph: { ...s.ph, tubes: { ...s.ph.tubes, [k]: { ...s.ph.tubes[k], ...patch } } } });
  const setIndRun = (s: ChemAcidsState, patch: Partial<ChemAcidsState['ind']['runs'][number]>, burette?: number): ChemAcidsState => {
    const runs = [...s.ind.runs];
    runs[runs.length - 1] = { ...runs[runs.length - 1]!, ...patch };
    return { ...s, ind: { ...s.ind, runs, burette: burette ?? s.ind.burette } };
  };
  const setHardRun = (s: ChemAcidsState, patch: Partial<ChemAcidsState['hard']['runs'][number]>, burette?: number): ChemAcidsState => {
    const runs = [...s.hard.runs];
    runs[runs.length - 1] = { ...runs[runs.length - 1]!, ...patch };
    return { ...s, hard: { ...s.hard, runs, burette: burette ?? s.hard.burette } };
  };
  const setAcidTube = (k: AcidTube, patch: Partial<ChemAcidsState['acid']['tubes']['MG']>) => (s: ChemAcidsState): ChemAcidsState => ({ ...s, acid: { ...s.acid, tubes: { ...s.acid.tubes, [k]: { ...s.acid.tubes[k], ...patch } } } });

  // ---- operations (each returns a message when it can't be done)
  const ops = {
    // PH
    rinseTubes: () => W().rinse ?? (update((s) => ({ ...s, ph: { ...s.ph, rinsed: true } }), 'rinse-tubes'), undefined),
    tile: () => W().tile ?? (update((s) => ({ ...s, ph: { ...s.ph, tile: true } }), 'white-tile'), undefined),
    pour: (k: PhSample, vol: 'TWO' | 'FULL' = 'TWO') => W().pour(k) ?? (update(setPh(k, { vol }), `pour:${k}:${vol}`), undefined),
    drops: (k: PhSample, n = 2) => W().drops(k) ?? (update((s) => setPh(k, { drops: Math.min(40, s.ph.tubes[k].drops + n), shaken: false })(s), `ui-drops:${k}:${n}`), undefined),
    shake: (k: PhSample) => W().shake(k) ?? (update(setPh(k, { shaken: true }), `shake:${k}`), undefined),
    compare: (k: PhSample) => W().compare(k) ?? (update(setPh(k, { compared: true }), `compare:${k}:${ref.current.ph.tubes[k].shaken ? 'mixed' : 'streaky'}`), undefined),
    // IND
    crush: (solvent: 'ETHANOL' | 'WATER', heat: 'BATH' | 'FLAME' | 'NONE') => {
      if (W().crush) return W().crush;
      update((s) => ({ ...s, ind: { ...s.ind, solvent, heat } }), `crush:${solvent}:${heat}`);
      if (solvent === 'ETHANOL' && heat === 'FLAME') return 'The ethanol vapour caught fire! Mrs Ada smothered it with a damp cloth. Never warm ethanol over a naked flame — use a water bath.';
      return undefined;
    },
    filterExtract: () => W().filterExt ?? (update((s) => ({ ...s, ind: { ...s.ind, filtered: true } }), 'filter-extract'), undefined),
    testExtract: (k: IndSol) => W().ext(k) ?? (update((s) => ({ ...s, ind: { ...s.ind, tests: { ...s.ind.tests, [k]: { ...s.ind.tests[k], ext: true } } } }), `extract:${k}`), undefined),
    testUi: (k: IndSol) => W().ui(k) ?? (update((s) => ({ ...s, ind: { ...s.ind, tests: { ...s.ind.tests, [k]: { ...s.ind.tests[k], ui: true } } } }), `ui:${k}`), undefined),
    rinseBurette: () => W().rinseBur ?? (update((s) => ({ ...s, ind: { ...s.ind, burRinsed: true } }), 'rinse-burette'), undefined),
    fillBurette: () => {
      if (W().fillBur) return W().fillBur;
      update((s) => ({ ...s, ind: { ...s.ind, burette: v.ind.fills[s.ind.fills % v.ind.fills.length]!, fills: s.ind.fills + 1, fillDilute: s.ind.fills === 0 ? !s.ind.burRinsed : s.ind.fillDilute && !s.ind.burRinsed } }), 'fill-burette');
      return undefined;
    },
    rinsePipette: () => W().rinsePip ?? (update((s) => ({ ...s, ind: { ...s.ind, pipRinsed: true } }), 'rinse-pipette'), undefined),
    pipette: () => W().pipette ?? (update((s) => ({ ...s, ind: { ...s.ind, flask: true, flaskDilute: !s.ind.pipRinsed } }), 'pipette-naoh'), undefined),
    indicator: (ind: IndIndicator, drops: number) => {
      if (W().indicator) return W().indicator;
      update((s) => ({ ...s, ind: { ...s.ind, flask: false, runs: [...s.ind.runs, { ind, drops, start: s.ind.burette ?? 0, added: 0, done: false, dilA: s.ind.fillDilute, dilB: s.ind.flaskDilute }].slice(-12) } }), `indicator:${ind}:${drops}`);
      return undefined;
    },
    addAcid: (vol: number) => {
      if (W().add) return W().add;
      const s = ref.current.ind;
      const room = IND_BURETTE - (s.burette ?? 0);
      const dv = r2(Math.min(vol, room));
      const run = indOpenRun(s)!;
      update((x) => setIndRun(x, { added: r2(run.added + dv) }, r2((x.ind.burette ?? 0) + dv)), `acid:${dv}`);
      return undefined;
    },
    endPoint: () => {
      if (W().endPoint) return W().endPoint;
      const run = indOpenRun(ref.current.ind)!;
      update((x) => setIndRun(x, { done: true }), `end-point:${run.ind}:${run.added.toFixed(2)}`);
      return undefined;
    },
    // ACID
    tubeAcid: (k: AcidTube) => W().tubeAcid(k) ?? (update(setAcidTube(k, { acid: true }), `tube-acid:${k}`), undefined),
    warm: (how: 'GENTLE' | 'STRONG') => {
      if (W().warm) return W().warm;
      update(setAcidTube('CUO', { warmed: how }), `warm-cuo:${how}`);
      return how === 'STRONG' ? 'It boiled hard and spat acid out of the tube! Warm gently, pointing the tube away from everyone.' : undefined;
    },
    gasTest: (k: AcidTube, test: AcidTest) => W().test(k) ?? (update((s) => setAcidTube(k, { tests: [...s.acid.tubes[k].tests, test].slice(-12) })(s), `test:${k}:${test}`), undefined),
    zero: () => W().zero ?? (update((s) => ({ ...s, acid: { ...s.acid, zeroed: true } }), 'zero-balance'), undefined),
    tapChips: () => W().tapChips ?? (update((s) => ({ ...s, acid: { ...s.acid, chips: s.acid.chips + 1 } }), 'tap-marble'), undefined),
    untapChips: () => W().untapChips ?? (update((s) => ({ ...s, acid: { ...s.acid, chips: s.acid.chips - 1 } }), 'tip-back'), undefined),
    measureAcid: (vol: number) => W().acidVol ?? (update((s) => ({ ...s, acid: { ...s.acid, acidVol: vol } }), `acid-vol:${vol}`), undefined),
    plug: () => W().plug ?? (update((s) => ({ ...s, acid: { ...s.acid, plug: true } }), 'plug'), undefined),
    weighFlask: () => W().weighFlask ?? (update((s) => ({ ...s, acid: { ...s.acid, flaskWeighed: true } }), 'weigh-flask'), undefined),
    addChips: () => {
      if (W().addChips) return W().addChips;
      L.acid = clock.now();
      update((s) => ({ ...s, acid: { ...s.acid, added: true } }), 'add-marble');
      return undefined;
    },
    weighTotal: () => {
      if (W().weighTotal) return W().weighTotal;
      const t = Math.round(acidSeconds());
      update((s) => ({ ...s, acid: { ...s.acid, weighings: [...s.acid.weighings, t].slice(-40) } }), `weigh-total:${t}`);
      return undefined;
    },
    // HARD
    hRinse: () => W().hRinse ?? (update((s) => ({ ...s, hard: { ...s.hard, burRinsed: true } }), 'rinse-soap-burette'), undefined),
    hFill: () => {
      if (W().hFill) return W().hFill;
      update((s) => ({ ...s, hard: { ...s.hard, burette: v.hard.fills[s.hard.fills % v.hard.fills.length]!, fills: s.hard.fills + 1, fillDilute: s.hard.fills === 0 ? !s.hard.burRinsed : s.hard.fillDilute && !s.hard.burRinsed } }), 'fill-soap');
      return undefined;
    },
    boil: (k: HardSample, how: HardBoil) => W().boil(k) ?? (update((s) => ({ ...s, hard: { ...s.hard, boiled: { ...s.hard.boiled, [k]: how } } }), `boil:${k}:${how}`), undefined),
    measure: (k: HardSample, boiled: boolean, how: 'CYL' | 'ROUGH' = 'CYL') => {
      const m = W().measure(k, boiled);
      if (m) return m;
      update((s) => ({ ...s, hard: { ...s.hard, runs: [...s.hard.runs, { sample: k, boiled, vol: how === 'CYL' ? HARD_VOL : v.hard.rough, start: s.hard.burette ?? 0, added: 0, big: false, swirled: false, watched: false, done: false }].slice(-14) } }), `measure:${k}:${boiled ? 'boiled' : 'raw'}:${how}`);
      return undefined;
    },
    addSoap: (vol: number, how: 'SHAKE' | 'SWIRL' = 'SHAKE') => {
      if (W().soap) return W().soap;
      const h = ref.current.hard;
      const run = hardOpenRun(h)!;
      const dv = r2(Math.min(vol, 50 - (h.burette ?? 0)));
      update((x) => setHardRun(x, { added: r2(run.added + dv), big: run.big || dv > 0.5 + 1e-9, swirled: run.swirled || how === 'SWIRL', watched: false }, r2((x.hard.burette ?? 0) + dv)), `soap:${dv}:${how}`);
      return undefined;
    },
    watch: () => {
      if (W().watch) return W().watch;
      const h = ref.current.hard;
      const lather = hardLather(v, h, hardOpenRun(h)!);
      update((x) => setHardRun(x, { watched: lather === 'LASTING' }), `watch:${lather}`);
      return undefined;
    },
    finish: () => {
      if (W().finish) return W().finish;
      const run = hardOpenRun(ref.current.hard)!;
      update((x) => setHardRun(x, { done: true }), `soap-end:${run.sample}:${run.added.toFixed(1)}`);
      return undefined;
    },
  };

  /** Demo/skip helpers: jump the lab clock (time-lapse) by `ms`. */
  const skip = (ms: number) => {
    clock.shift(ms);
    bump();
  };
  /** Back to an idle bench (the demo replays from an empty state). */
  const resetLive = () => {
    L.acid = null;
  };

  // ---- what the bench shows now
  const aSec = acidSeconds();
  const iRun = indOpenRun(state.ind);
  const hRun = hardOpenRun(state.hard);
  const lastHardWatch = [...state.log].reverse().find((e) => e.a.startsWith('watch:') || e.a.startsWith('soap:') || e.a.startsWith('measure:'));
  const lastTest = [...state.log].reverse().find((e) => e.a.startsWith('test:'));
  const lt = lastTest ? (lastTest.a.split(':') as [string, AcidTube, AcidTest]) : null;
  const look = {
    phColour: (k: PhSample) => phTubeColour(v, state.ph, k, state.ph.tubes[k]),
    extract: (k: IndSol) => (state.ind.solvent ? extractColour(v, state.ind, k) : null),
    flask: iRun ? indFlaskColour(v, iRun, iRun.added) : state.ind.flask ? NAOH_LIQ : null,
    flaskPh: iRun ? indPh(v, iRun, iRun.added) : null,
    acidSec: aSec,
    extent: state.acid.added ? acidExtent(v, state.acid, aSec) : 0,
    balance: acidPan(v, state, aSec),
    chips: acidChips(v, state.acid),
    test: lt && (ACID_TESTS as readonly string[]).includes(lt[2]) ? { tube: lt[1], test: lt[2], text: acidTestResult(lt[1], lt[2], state.acid.tubes[lt[1]]) } : null,
    lather: hRun ? hardLather(v, state.hard, hRun) : null,
    watched: lastHardWatch?.a.startsWith('watch:') ? (lastHardWatch.a.slice(6) as 'LASTING' | 'FROTH' | 'NONE') : null,
    scum: hRun ? hardScum(v, hRun) : false,
  };
  return { v, task, ref, update, note, ops, why, clock, speed, setSpeed, active, skip, resetLive, look, acidSeconds };
}
export type Acids = ReturnType<typeof useAcids>;

/** ACID: what the balance pan holds and shows now. */
export function acidPan(v: ChemAcidsVariant, s: ChemAcidsState, t: number): { what: 'total' | 'flask' | 'chips' | 'empty'; value: number } {
  const a = s.acid;
  if (a.added) return { what: 'total', value: acidBalance(v, a, 'total', t) };
  if (a.flaskWeighed) return { what: 'flask', value: acidBalance(v, a, 'flask') };
  if (a.chips > 0) return { what: 'chips', value: acidBalance(v, a, 'chips') };
  return { what: 'empty', value: a.zeroed ? 0 : v.acid.offset };
}
export const fmtClock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

// ------------------------------------------------------------------ hints (practice mode)

export function nextHint(s: ChemAcidsState, x: Acids): string {
  if (x.task === 'PH') {
    const w = s.ph;
    if (!w.rinsed) return 'Rinse the test tubes with distilled water first, and label them A–I.';
    if (!w.tile) return 'Stand the white tile behind the rack: you will compare the colours against white, in good light.';
    const next = PH_SAMPLES.find((k) => !w.tubes[k].compared);
    if (next) {
      const t = w.tubes[next];
      const L = PH_LETTER[next];
      if (!t.vol) return `Pour about 2 cm³ of sample ${L} into tube ${L}.`;
      if (!t.drops) return `Add 2 drops of universal indicator to tube ${L}.`;
      if (!t.shaken) return `Shake tube ${L} gently to mix.`;
      return `Compare tube ${L} with the colour chart and record its pH.`;
    }
    return 'Record each pH and its class, then work out [H⁺], the pH values, the ratio and the percentage ionised.';
  }
  if (x.task === 'IND') {
    const w = s.ind;
    if (!w.solvent) return 'Crush a handful of zobo calyces in the mortar with a little warm water (or ethanol warmed in a water bath).';
    if (!w.filtered) return 'Filter the crushed calyces: the filtrate is your indicator.';
    const e = (['HCL', 'VINEGAR', 'WATER', 'SODA', 'NAOH'] as const).find((k) => !w.tests[k].ext || !w.tests[k].ui);
    if (e) return `Add a few drops of the extract to the ${IND_SOL_LABEL[e].toLowerCase()} — and universal indicator to a second tube of it.`;
    const r = indOpenRun(w);
    if (!w.burRinsed && w.burette === null) return 'Rinse the burette with a little of the HCl, then fill it.';
    if (w.burette === null) return 'Fill the burette with the HCl and read it.';
    if (!w.pipRinsed) return 'Rinse the pipette with the NaOH.';
    const mo = w.runs.filter((q) => q.done && q.ind === 'MO').length;
    const z = w.runs.filter((q) => q.done && q.ind === 'ZOBO').length;
    if (r) return `Run in the acid, swirling — drop by drop near the end point — until ${r.ind === 'MO' ? 'the yellow turns orange' : 'the extract turns red-pink'}; then read the burette.`;
    if (!w.flask) return `Pipette 25.0 cm³ of the NaOH into a clean conical flask (${mo < 2 ? 'methyl orange' : 'zobo'} titration ${mo < 2 ? mo + 1 : z + 1}).`;
    return mo < 2 ? 'Add 2–3 drops of methyl orange.' : z < 2 ? 'Add 2–3 drops of the zobo extract.' : 'Record the titres and work out the means and the percentage difference.';
  }
  if (x.task === 'ACID') {
    const w = s.acid;
    const t = w.tubes;
    if (!t.MG.acid || !t.ZN.acid || !t.CU.acid) return 'Pour 2 cm³ of dilute HCl onto the magnesium, the zinc and the copper.';
    if (!t.MG.tests.includes('BURNING') || !t.ZN.tests.includes('BURNING')) return 'Hold a burning splint at the mouth of each tube that fizzes.';
    if (!t.CUO.acid) return 'Add dilute HCl to a little copper(II) oxide.';
    if (!t.CUO.warmed) return 'Warm the CuO and acid gently over the burner.';
    if (!t.CACO3.acid) return 'Add dilute HCl to a few marble chips.';
    if (!t.CACO3.tests.includes('LIME')) return 'Pass the gas from the marble into limewater.';
    if (!w.zeroed && !w.chips) return 'Zero the balance with nothing on the pan.';
    if (x.look.chips < 1.8) return `Tap marble chips onto the pan until it reads about 2.00 g (now ${x.look.chips.toFixed(2)} g).`;
    if (w.acidVol === null) return 'Measure 50 cm³ of the HCl into the conical flask (an excess).';
    if (!w.plug && !w.flaskWeighed) return 'Put the cotton-wool plug in the flask.';
    if (!w.flaskWeighed) return 'Weigh the flask with the acid and plug.';
    if (!w.added) return 'Tip the marble in, replace the plug, and watch the balance.';
    if (x.look.extent < 0.99) return `Fizzing (${Math.round(x.look.extent * 100)} %): use time-lapse and wait until the mass stops falling.`;
    if (w.weighings.length < 2) return 'Weigh the flask, then again a minute later: the readings should agree.';
    return 'Record the masses and work out the moles, the expected CO₂, the mass lost and the percentage.';
  }
  const w = s.hard;
  const r = hardOpenRun(w);
  if (!w.burRinsed && w.burette === null) return 'Rinse the burette with a little soap solution, then fill it.';
  if (w.burette === null) return 'Fill the burette with soap solution and read it.';
  if (r) {
    if (x.look.lather === 'LASTING' && !r.watched) return 'A lather! Stopper and leave it: does it last 2 minutes?';
    if (r.watched) return 'The lather lasted 2 minutes: read the burette and record the volume of soap.';
    return `Run in 0.5 cm³ of soap, stopper and shake (${HARD_LABEL[r.sample].toLowerCase()}${r.boiled ? ', boiled' : ''}: ${r.added.toFixed(1)} cm³ so far).`;
  }
  const order = ['DIST', 'RAIN', 'TAP', 'X', 'Y'] as const;
  const raw = order.find((k) => !w.runs.some((q) => q.done && q.sample === k && !q.boiled));
  if (raw) return `Measure 50.0 cm³ of ${HARD_LABEL[raw].toLowerCase()} into the conical flask.`;
  const toBoil = (['TAP', 'X', 'Y'] as const).find((k) => !w.boiled[k]);
  if (toBoil) return `Boil 50 cm³ of ${HARD_LABEL[toBoil].toLowerCase()} for 5 minutes, cool, make up to 50 cm³ and filter.`;
  const boiled = (['TAP', 'X', 'Y'] as const).find((k) => !w.runs.some((q) => q.done && q.sample === k && q.boiled));
  if (boiled) return `Measure 50.0 cm³ of the boiled ${HARD_LABEL[boiled].toLowerCase()} into the flask.`;
  return 'Record the volumes and work out the temporary, permanent and total hardness of X.';
}
