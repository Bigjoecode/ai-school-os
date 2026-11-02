import {
  CELL_E0,
  DISP_VOL,
  ELEC_RUN,
  ELEC_STEPS,
  ELEC_TARGET,
  ELEC_TOL,
  RUST_WEEK,
  cellReading,
  chemElectroVariant,
  dispExtent,
  dispFe,
  dispIons,
  dispProduct,
  dispTemp,
  elecCopperConc,
  elecCurrent,
  elecDeposit,
  elecMasses,
  electroLessonTask,
  rustIndex,
  woolReading,
  type CellReading,
  type ChemElectroState,
  type ChemElectroVariant,
  type DispFilings,
  type ElectroTask,
  type RustContent,
  type RustTube,
} from '@aischool/shared';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { SimulatorProps } from '../types';

/**
 * The electrochemistry bench's actions, shared by the 2D and the 3D lab (and
 * the demo and the sandbox) so all of them produce exactly the same
 * `ChemElectroState`. Every change goes through `update`, which appends to the
 * action log.
 *
 * Live and not saved: the stopwatch while the key is closed, the reaction
 * going on in the displacement beaker (its temperature, the colour), and the
 * days passing for the rusting tubes. They are analytic in the lab clock
 * (which runs in time-lapse, and which the demo jumps forward); the moments
 * that count (key opened, rheostat moved, solid filtered off, tubes observed,
 * a volume read) are written to the state.
 */

export const r2 = (x: number) => Math.round(x * 100) / 100;
export const lessonTask = electroLessonTask;
export const TASK_TITLE: Record<ElectroTask, string> = {
  ELEC: 'Electrolysis of CuSO₄ with copper electrodes',
  CELL: 'The zinc–copper (Daniell) cell',
  DISP: 'Displacement of copper by iron',
  RUST: 'Conditions for rusting',
};
/** Time-lapse choices per task (RUST: lab seconds per real second — 1 h/s and 6 h/s). */
export const SPEEDS: Record<ElectroTask, number[]> = { ELEC: [1, 10, 60], CELL: [1], DISP: [1, 5, 20], RUST: [1, 3600, 21600] };
export const speedLabel = (task: ElectroTask, s: number) => (task === 'RUST' ? (s === 1 ? '1×' : s === 3600 ? '1 h/s' : '6 h/s') : `${s}×`);
const DAY_MS = 86_400_000;

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

type RGB = [number, number, number];
const hex = (c: RGB) => `#${c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: RGB, b: RGB, f: number): RGB => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
const CLEAR: RGB = [236, 242, 246];
const CU_BLUE: RGB = [22, 96, 204];
const FE_GREEN: RGB = [138, 192, 116];
const ZN_CLEAR: RGB = [238, 241, 243];
/** Cu²⁺(aq) at c mol dm⁻³: pale to deep blue. */
export const copperColour = (c: number) => hex(mix(CLEAR, CU_BLUE, Math.min(1, Math.sqrt(Math.max(0, c) / 0.8))));
/** Cu²⁺ with Fe²⁺: blue fading to pale green as the iron replaces the copper. */
export function mixedColour(cu: number, fe: number): string {
  const b = Math.min(1, Math.sqrt(Math.max(0, cu) / 0.8));
  const g = Math.min(1, Math.sqrt(Math.max(0, fe) / 0.3));
  const base = mix(CLEAR, FE_GREEN, g * 0.9);
  return hex(mix(base, CU_BLUE, b * (1 - 0.45 * g)));
}
export const ZNSO4 = hex(ZN_CLEAR);
export const COPPER = '#c2643c';
export const FRESH_COPPER = '#d98a6a';
export const ZINC = '#a9b0b6';
export const IRON = '#4d4f53';
export const RUST = '#8a3b17';

// ------------------------------------------------------------------ the hook

export type ElectroUpdate = (fn: (s: ChemElectroState) => ChemElectroState, log?: string) => void;

export function useElectro({
  seed,
  state,
  onChange,
  readOnly,
  startedAt,
  practicalId,
  variant,
  autoTask = true,
  clock: givenClock,
}: Pick<SimulatorProps<'chem-electro'>, 'seed' | 'state' | 'onChange' | 'readOnly' | 'startedAt' | 'practicalId'> & { variant?: ChemElectroVariant; autoTask?: boolean; clock?: Clock }) {
  const task: ElectroTask = variant?.task ?? state.task ?? lessonTask(practicalId);
  const v = useMemo(() => variant ?? chemElectroVariant(seed, task), [variant, seed, task]);
  const t0 = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const ref = useRef(state);
  ref.current = state;
  const own = useRef<Clock | null>(null);
  if (!own.current) own.current = makeClock();
  const clock = givenClock ?? own.current;
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [speed, setSpeedState] = useState(1);
  /** RUST: the graduated tube raised or lowered so the levels inside and outside match (until the next day passes). */
  const levelled = useRef<{ on: boolean; day: number }>({ on: false, day: 0 });

  const update: ElectroUpdate = (fn, log) => {
    if (readOnly) return;
    let next = fn(ref.current);
    if (log) next = { ...next, log: [...next.log, { t: Math.max(0, Date.now() - t0), a: log.slice(0, 80) }].slice(-800) };
    ref.current = next;
    onChange(next);
  };
  /** A log note with no change to the marked state (collecting, goggles, the coat). */
  const note = (a: string) => update((s) => s, a);
  useEffect(() => {
    if (autoTask && !readOnly && !ref.current.task) update((s) => (s.task ? s : { ...s, task }), `task:${task}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, task]);

  // ---- live, analytic in the lab clock
  const live = useRef<{ key: { at: number; ran0: number } | null; disp: number | null; rust: { at: number; d0: number } | null } | null>(null);
  if (!live.current) {
    const s = ref.current;
    const now = clock.now();
    live.current = {
      key: s.elec.closed ? { at: now, ran0: s.elec.ran } : null,
      disp: s.disp.added && !s.disp.filtered ? now - (s.disp.elapsed ?? 0) * 1000 : null,
      rust: s.rust.started ? { at: now, d0: s.rust.days } : null,
    };
  }
  const L = live.current!;
  /** Seconds on the stopwatch (the time the key has been closed). */
  const runSeconds = (t = clock.now()) => (L.key && ref.current.elec.closed ? L.key.ran0 + (t - L.key.at) / 1000 : ref.current.elec.ran);
  /** Seconds since the iron went in. */
  const dispSeconds = (t = clock.now()) => {
    const w = ref.current.disp;
    if (w.filtered) return w.elapsed ?? 0;
    if (!w.added || L.disp === null) return 0;
    return (t - L.disp) / 1000;
  };
  /** Days since the tubes were left. */
  const days = (t = clock.now()) => (ref.current.rust.started && L.rust ? Math.min(30, L.rust.d0 + (t - L.rust.at) / DAY_MS) : ref.current.rust.days);
  const isLevelled = () => levelled.current.on && Math.abs(levelled.current.day - days()) < 0.25;

  // ---- the ticker: time-lapse rate, easing near the 40-minute mark
  const elecLive = task === 'ELEC' && state.elec.closed;
  const dispLive = task === 'DISP' && state.disp.added && !state.disp.filtered;
  const rustLive = task === 'RUST' && state.rust.started;
  const active = !readOnly && (elecLive || dispLive || rustLive);
  useEffect(() => {
    if (!active) {
      if (!givenClock) clock.setRate(1);
      return;
    }
    const id = setInterval(() => {
      let rate = speed;
      if (task === 'ELEC') {
        const t = runSeconds();
        if (t > ELEC_RUN - 90) rate = Math.min(rate, t > ELEC_RUN - 15 ? 1 : 5);
      } else if (task === 'RUST') {
        if (days() >= 30) rate = 1;
      } else if (task === 'DISP') {
        if (dispSeconds() > 3600) rate = 1;
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

  // ---- guards (why an operation can't be done now), from a given state (the ops use the live one)
  const whyOf = (s: ChemElectroState) => {
    const e = s.elec;
    const c = s.cell;
    const d = s.disp;
    const r = s.rust;
    return {
      // ELEC
      sand: e.ran > 0 ? 'The plates have been used already.' : e.sanded ? 'They are clean and bright.' : undefined,
      weighBefore: e.ran > 0 ? 'Too late: the electrolysis has started.' : e.connected ? 'Take the plates out of the circuit to weigh them.' : e.weighedBefore && !(e.sanded && e.sandedAfterWeigh) ? 'Already weighed.' : undefined,
      connect: e.closed ? 'Open the key first.' : e.ran > 0 ? 'The circuit is already working.' : undefined,
      key: !e.connected ? 'Connect the circuit first.' : e.removed ? 'The plates are out of the solution.' : undefined,
      rheo: !e.connected ? 'Connect the circuit first.' : e.removed ? 'The electrolysis is over.' : undefined,
      remove: e.closed ? 'Open the key first (switch off).' : e.ran <= 0 ? 'Pass the current first.' : e.removed ? 'They are out.' : undefined,
      rinse: !e.removed ? 'Take the plates out first.' : e.rinse ? 'Already rinsed.' : undefined,
      dryPlates: !e.removed ? 'Take the plates out first.' : e.dry ? 'Already dried.' : undefined,
      weighAfter: !e.removed ? 'Take the plates out first.' : e.weighedAfter ? 'Already weighed.' : undefined,
      // CELL
      cellSand: c.placed ? 'The strips are in the solutions.' : c.sanded ? 'They are clean.' : undefined,
      place: c.placed ? 'The strips are in place.' : undefined,
      soak: c.bridge ? 'The bridge is in place.' : c.soaked ? 'It is soaked.' : undefined,
      bridge: !c.placed ? 'Put the strips in their solutions first.' : undefined,
      meter: undefined as string | undefined,
      leads: !c.meter ? 'Choose the voltmeter first.' : !c.placed ? 'Put the strips in their solutions first.' : undefined,
      read: !c.meter || !c.leads ? 'Connect the voltmeter first.' : !c.placed ? 'Put the strips in their solutions first.' : c.readings.length >= 40 ? 'That is enough readings.' : undefined,
      // DISP
      filings: d.taps > 0 ? 'You are already weighing filings.' : undefined,
      tap: !d.filings ? 'Choose the iron filings first.' : d.added ? 'The iron is in the beaker.' : d.taps >= 24 ? 'That is far too much.' : undefined,
      untap: d.taps <= 0 || d.added ? 'There is nothing to tip back.' : undefined,
      cuso4: d.cuso4 !== null ? 'The CuSO₄ is in the beaker.' : undefined,
      thermo: d.cuso4 === null ? 'Measure the CuSO₄ into the beaker first.' : d.added ? 'The iron is already in.' : d.thermo ? 'It is in the solution.' : undefined,
      add: !d.taps ? 'Weigh the iron filings first.' : d.cuso4 === null ? 'Measure the CuSO₄ into the beaker first.' : d.added ? 'Already added.' : undefined,
      unthermo: !d.added || d.filtered ? 'Nothing to take out now.' : !d.watched ? 'It is out.' : undefined,
      paper: d.filtered ? 'Too late: the paper has the copper on it.' : d.paper ? 'Already weighed.' : undefined,
      filter: !d.added ? 'Add the iron first.' : d.filtered ? 'Already filtered.' : undefined,
      dWash: !d.filtered ? 'Filter first.' : d.wash ? 'Already washed.' : undefined,
      dDry: !d.filtered ? 'Filter first.' : d.dry ? 'Already dried.' : undefined,
      dWeigh: !d.filtered ? 'Filter first.' : d.weighed ? 'Already weighed.' : undefined,
      // RUST
      nails: r.started ? 'The tubes are set up.' : r.sanded ? 'The nails are clean.' : undefined,
      tube: r.started ? 'The week has started: leave the tubes alone.' : undefined,
      wool: r.started ? 'The week has started.' : r.wool ? 'The iron wool is in place.' : undefined,
      start: r.started ? 'The week has started.' : !RUST_TUBES_SET(r) && !r.wool ? 'Set up the tubes first.' : undefined,
      observe: !r.started ? 'Start the week first.' : undefined,
      readVol: !r.wool ? 'Set up the iron wool tube first.' : r.readings.length >= 60 ? 'That is enough readings.' : undefined,
    };
  };
  const why = whyOf(state);
  const W = () => whyOf(ref.current);

  const runNow = () => Math.round(runSeconds());
  const pushAdjust = (s: ChemElectroState, step: number): ChemElectroState => {
    const t = s.elec.closed ? runNow() : s.elec.ran;
    const adj = [...s.elec.adjust];
    if (adj.length && Math.abs(adj.at(-1)!.t - t) < 0.5) adj[adj.length - 1] = { t, step };
    else if (adj.length < 400) adj.push({ t, step });
    return { ...s, elec: { ...s.elec, rheo: step, adjust: adj, ran: s.elec.closed ? t : s.elec.ran } };
  };
  const cellNow = (s: ChemElectroState): CellReading | null => {
    const c = s.cell;
    if (!c.meter || !c.leads || !c.placed) return null;
    return { bridge: c.bridge, soaked: c.soaked, sanded: c.sanded, placed: c.placed, meter: c.meter, leads: c.leads };
  };
  const tubeSet = (tube: RustTube, patch: Partial<ChemElectroState['rust']['tubes']['A']>, log: string) => {
    if (W().tube) return W().tube;
    update((s) => ({ ...s, rust: { ...s.rust, tubes: { ...s.rust.tubes, [tube]: { ...s.rust.tubes[tube], ...patch } } } }), log);
    return undefined;
  };
  const boiledReady = () => ref.current.log.some((e) => e.a === 'boil-water');

  // ---- operations (each returns a message when it can't be done)
  const ops = {
    // ELEC
    sandPlates: () => W().sand ?? (update((s) => ({ ...s, elec: { ...s.elec, sanded: true, sandedAfterWeigh: s.elec.weighedBefore } }), 'sand-plates'), undefined),
    weighBefore: () => W().weighBefore ?? (update((s) => ({ ...s, elec: { ...s.elec, weighedBefore: true, sandedAfterWeigh: false } }), 'weigh-plates'), undefined),
    connect: (cathodeTo: 'NEG' | 'POS', gap: 'APART' | 'TOUCH') => W().connect ?? (update((s) => ({ ...s, elec: { ...s.elec, connected: true, cathodeTo, gap } }), `connect:${cathodeTo}:${gap}`), undefined),
    separate: () => {
      const e = ref.current.elec;
      if (e.closed) return 'Open the key first.';
      if (e.gap !== 'TOUCH') return 'The plates are already apart.';
      update((s) => ({ ...s, elec: { ...s.elec, gap: 'APART' } }), 'plates-apart');
      return undefined;
    },
    closeKey: () => {
      if (W().key) return W().key;
      const e = ref.current.elec;
      if (e.closed) return 'The key is already closed.';
      if (e.gap === 'TOUCH') {
        update((s) => ({ ...s, elec: { ...s.elec, shorted: true } }), 'short-circuit');
        return 'Short circuit! The ammeter needle slammed past full scale: the plates are touching. You opened the key at once — separate the plates.';
      }
      L.key = { at: clock.now(), ran0: e.ran };
      update((s) => ({ ...s, elec: { ...s.elec, closed: true } }), 'key-closed');
      return undefined;
    },
    openKey: () => {
      const e = ref.current.elec;
      if (!e.closed) return 'The key is open.';
      const ran = Math.min(20_000, runNow());
      L.key = null;
      update((s) => ({ ...s, elec: { ...s.elec, closed: false, ran } }), `key-open:${ran}`);
      return undefined;
    },
    rheostat: (delta: number) => {
      if (W().rheo) return W().rheo;
      const step = Math.max(0, Math.min(ELEC_STEPS, ref.current.elec.rheo + delta));
      if (step === ref.current.elec.rheo) return delta < 0 ? 'The slider is at the end: no resistance left.' : 'The slider is at the far end.';
      const now = clock.now();
      update((s) => pushAdjust(s, step), `rheo:${step}`);
      if (ref.current.elec.closed) L.key = { at: now, ran0: ref.current.elec.ran };
      return undefined;
    },
    removePlates: () => W().remove ?? (update((s) => ({ ...s, elec: { ...s.elec, removed: true } }), 'remove-plates'), undefined),
    rinsePlates: (k: 'GENTLE' | 'RUB') => W().rinse ?? (update((s) => ({ ...s, elec: { ...s.elec, rinse: k } }), `rinse:${k}`), undefined),
    dryPlates: (k: 'AIR' | 'FLAME' | 'NONE') => W().dryPlates ?? (update((s) => ({ ...s, elec: { ...s.elec, dry: k, rinse: s.elec.rinse } }), `dry-plates:${k}`), undefined),
    weighAfter: () => W().weighAfter ?? (update((s) => ({ ...s, elec: { ...s.elec, weighedAfter: true, dry: s.elec.dry ?? 'NONE' } }), 'weigh-after'), undefined),
    // CELL
    sandStrips: () => W().cellSand ?? (update((s) => ({ ...s, cell: { ...s.cell, sanded: true } }), 'sand-strips'), undefined),
    placeStrips: (k: 'RIGHT' | 'SWAPPED') => W().place ?? (update((s) => ({ ...s, cell: { ...s.cell, placed: k } }), `strips:${k}`), undefined),
    soakBridge: () => W().soak ?? (update((s) => ({ ...s, cell: { ...s.cell, soaked: true } }), 'soak-bridge'), undefined),
    setBridge: (on: boolean) => {
      if (W().bridge) return W().bridge;
      const c = ref.current.cell;
      if (c.bridge === on) return on ? 'The bridge is in place.' : 'The bridge is out.';
      const readWith = c.readings.some((r) => r.bridge);
      update((s) => ({ ...s, cell: { ...s.cell, bridge: on, removedOnce: s.cell.removedOnce || (!on && readWith), replaced: on && s.cell.removedOnce ? true : s.cell.replaced } }), on ? 'bridge-in' : 'bridge-out');
      return undefined;
    },
    chooseMeter: (m: 'HIGH' | 'LOW') => (update((s) => ({ ...s, cell: { ...s.cell, meter: m } }), `meter:${m}`), undefined),
    connectLeads: (k: 'CORRECT' | 'REVERSED') => W().leads ?? (update((s) => ({ ...s, cell: { ...s.cell, leads: k } }), `leads:${k}`), undefined),
    readMeter: () => {
      if (W().read) return W().read;
      const r = cellNow(ref.current)!;
      const shown = cellReading(v, r, ref.current.cell.readings.length);
      update((s) => ({ ...s, cell: { ...s.cell, readings: [...s.cell.readings, r] } }), `read-voltmeter:${shown.toFixed(2)}`);
      return undefined;
    },
    // DISP
    chooseFilings: (k: DispFilings) => W().filings ?? (update((s) => ({ ...s, disp: { ...s.disp, filings: k } }), `filings:${k}`), undefined),
    tap: () => W().tap ?? (update((s) => ({ ...s, disp: { ...s.disp, taps: s.disp.taps + 1 } }), 'tap-filings'), undefined),
    untap: () => W().untap ?? (update((s) => ({ ...s, disp: { ...s.disp, taps: s.disp.taps - 1 } }), 'tip-back'), undefined),
    measureCuSO4: (vol: number) => W().cuso4 ?? (update((s) => ({ ...s, disp: { ...s.disp, cuso4: vol } }), `cuso4:${vol}`), undefined),
    thermometerIn: () => W().thermo ?? (update((s) => ({ ...s, disp: { ...s.disp, thermo: true } }), 'thermometer-in'), undefined),
    addIron: (stir: 'STIR' | 'NONE') => {
      if (W().add) return W().add;
      L.disp = clock.now();
      update((s) => ({ ...s, disp: { ...s.disp, added: true, stir, watched: s.disp.thermo } }), `add-iron:${stir}`);
      return undefined;
    },
    thermometerOut: () => W().unthermo ?? (update((s) => ({ ...s, disp: { ...s.disp, watched: false } }), 'thermometer-out'), undefined),
    weighPaper: () => W().paper ?? (update((s) => ({ ...s, disp: { ...s.disp, paper: true } }), 'weigh-paper'), undefined),
    filter: () => {
      if (W().filter) return W().filter;
      const t = Math.round(dispSeconds());
      L.disp = null;
      update((s) => ({ ...s, disp: { ...s.disp, filtered: true, elapsed: t } }), `filter:${t}`);
      return undefined;
    },
    washCopper: (k: 'PROPANONE' | 'WATER' | 'NONE') => W().dWash ?? (update((s) => ({ ...s, disp: { ...s.disp, wash: k } }), `wash:${k}`), undefined),
    dryCopper: (k: 'AIR' | 'FLAME' | 'NONE') => W().dDry ?? (update((s) => ({ ...s, disp: { ...s.disp, dry: k, wash: s.disp.wash ?? 'NONE' } }), `dry:${k}`), undefined),
    weighCopper: () => W().dWeigh ?? (update((s) => ({ ...s, disp: { ...s.disp, weighed: true, dry: s.disp.dry ?? 'NONE', wash: s.disp.wash ?? 'NONE' } }), 'weigh-copper'), undefined),
    // RUST
    sandNails: () => W().nails ?? (update((s) => ({ ...s, rust: { ...s.rust, sanded: true } }), 'sand-nails'), undefined),
    boilWater: () => (W().tube ?? (boiledReady() ? 'The water has been boiled.' : (update((s) => s, 'boil-water'), undefined))),
    fillTube: (tube: RustTube, content: RustContent) => {
      if (content === 'BOILED' && !boiledReady()) return 'Boil some distilled water first (and let it cool a little).';
      return tubeSet(tube, { nail: true, content, boiled: content === 'BOILED' }, `tube:${tube}:${content}`);
    },
    fillUnboiled: (tube: RustTube) => tubeSet(tube, { nail: true, content: 'BOILED', boiled: false }, `tube:${tube}:UNBOILED`),
    oil: (tube: RustTube) => (ref.current.rust.tubes[tube].content ? tubeSet(tube, { oil: true }, `oil:${tube}`) : 'Put the nail and the water in first.'),
    stopper: (tube: RustTube) => (ref.current.rust.tubes[tube].content ? tubeSet(tube, { stopper: true }, `stopper:${tube}`) : 'Put the nail in first.'),
    setWool: (k: 'MOIST' | 'DRY') => W().wool ?? (update((s) => ({ ...s, rust: { ...s.rust, wool: k } }), `wool:${k}`), undefined),
    startWeek: () => {
      if (W().start) return W().start;
      L.rust = { at: clock.now(), d0: 0 };
      update((s) => ({ ...s, rust: { ...s.rust, started: true, days: 0 } }), 'start-week');
      return undefined;
    },
    observe: () => {
      if (W().observe) return W().observe;
      const d = Math.round(days() * 10) / 10;
      update((s) => ({ ...s, rust: { ...s.rust, days: d, observed: [...s.rust.observed, d].slice(-60) } }), `observe:${d}`);
      return undefined;
    },
    level: () => {
      if (!ref.current.rust.wool) return 'Set up the iron wool tube first.';
      levelled.current = { on: true, day: days() };
      bump();
      return undefined;
    },
    readVolume: () => {
      if (W().readVol) return W().readVol;
      const d = Math.round(days() * 100) / 100;
      const lev = isLevelled();
      update((s) => ({ ...s, rust: { ...s.rust, days: Math.max(s.rust.days, d), readings: [...s.rust.readings, { day: d, levelled: lev }] } }), `read-volume:${d}:${lev ? 'level' : 'unlevel'}`);
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
    L.key = null;
    L.disp = null;
    L.rust = null;
    levelled.current = { on: false, day: 0 };
  };

  // ---- what the bench shows now
  const run = runSeconds();
  const e = state.elec;
  const dsec = dispSeconds();
  const day = days();
  const cr = cellNow(state);
  const look = {
    run,
    current: e.closed ? elecCurrent(v, e.rheo, run) : 0,
    deposit: elecDeposit(v, { adjust: e.adjust, ran: run }),
    cuConc: elecCopperConc(v, { adjust: e.adjust, ran: run }),
    volts: cr ? cellReading(v, cr, state.cell.readings.length) : null,
    dispSec: dsec,
    temp: state.disp.added ? dispTemp(v, state.disp, dsec) : v.disp.room,
    extent: state.disp.added ? dispExtent(state.disp, dsec) : 0,
    ions: dispIons(v, state.disp, dsec),
    fe: dispFe(v, state.disp),
    day,
    levelled: isLevelled(),
    volume: woolReading(v, state.rust, day, isLevelled()),
  };
  return { v, task, ref, update, note, ops, why, clock, speed, setSpeed, active, skip, resetLive, look, runSeconds, dispSeconds, days };
}
export type Electro = ReturnType<typeof useElectro>;
const RUST_TUBES_SET = (r: ChemElectroState['rust']) => Object.values(r.tubes).some((t) => t.nail);

// ------------------------------------------------------------------ what the bench shows (both views)

/** ELEC: balance readings now (null when nothing is on the pan). */
export function elecBalance(x: Electro, s: ChemElectroState): { cath: number; an: number } | null {
  const m = elecMasses(x.v, s.elec);
  if (s.elec.weighedAfter) return { cath: m.cath2, an: m.an2 };
  if (s.elec.weighedBefore) return { cath: m.cath1, an: m.an1 };
  return null;
}
/** DISP: what the balance shows — the filings in the boat while weighing, then the paper, then paper + copper. */
export const dispBalance = (x: Electro, s: ChemElectroState): number | null => (s.disp.weighed ? dispProduct(x.v, s.disp).total : s.disp.taps > 0 && !s.disp.added ? dispFe(x.v, s.disp) : s.disp.paper && !s.disp.filtered ? x.v.disp.paper : null);
/** RUST: the look of each nail now. */
export const rustNow = (x: Electro, s: ChemElectroState, tube: RustTube) => rustIndex(x.v, s.rust, tube, x.look.day);
export const fmtClock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
export const fmtDays = (d: number) => `day ${Math.floor(d)} · ${String(Math.floor((d % 1) * 24)).padStart(2, '0')} h`;

// ------------------------------------------------------------------ hints (practice mode)

export function nextHint(s: ChemElectroState, x: Electro): string {
  if (x.task === 'ELEC') {
    const w = s.elec;
    if (!w.sanded) return 'Clean both copper plates with sandpaper, then wash and dry them.';
    if (!w.weighedBefore || w.sandedAfterWeigh) return 'Weigh the cathode plate and the anode plate on the balance and record both masses.';
    if (!w.connected) return 'Connect the circuit: the cathode plate to the − terminal, the anode to +, ammeter in series, plates apart.';
    if (w.gap === 'TOUCH') return 'The plates are touching — separate them before you close the key.';
    if (!w.closed && w.ran === 0) return 'Close the key: the stopwatch starts with the current.';
    if (w.closed) {
      const I = x.look.current;
      if (Math.abs(I - ELEC_TARGET) > ELEC_TOL * 0.7) return `The ammeter reads ${I.toFixed(2)} A: move the rheostat slider (${I < ELEC_TARGET ? 'less resistance' : 'more resistance'}) to bring it to 0.50 A.`;
      return x.look.run < ELEC_RUN - 5 ? `Keep the current at 0.50 A (watch it creep up as the solution warms). ${fmtClock(x.look.run)} of 40:00 — use time-lapse.` : 'Forty minutes: open the key now and note the stopwatch time.';
    }
    if (!w.removed) return 'Take the plates out of the solution.';
    if (!w.rinse) return 'Rinse them gently with water, then propanone — do not rub the soft copper.';
    if (!w.dry) return 'Let the propanone evaporate in the air (no flames near it).';
    if (!w.weighedAfter) return 'Reweigh both plates.';
    return 'Record the masses, the current and the time; work out Q, the moles and the mass of copper.';
  }
  if (x.task === 'CELL') {
    const w = s.cell;
    if (!w.sanded) return 'Clean the zinc and copper strips with sandpaper.';
    if (!w.placed) return 'Stand the zinc strip in ZnSO₄ and the copper strip in CuSO₄.';
    if (!w.soaked) return 'Soak a strip of filter paper in saturated KNO₃ for the salt bridge.';
    if (!w.meter) return 'Use the high-resistance voltmeter.';
    if (!w.leads) return 'Connect the voltmeter: red (+) to copper, black (−) to zinc.';
    if (!w.bridge && !w.readings.length) return 'Join the two beakers with the salt bridge.';
    if (!w.readings.some((r) => r.bridge)) return x.look.volts !== null && x.look.volts < 0 ? 'The reading is negative: the leads are the wrong way round. Swap them.' : 'Read the voltmeter and record the e.m.f.';
    if (!w.removedOnce) return 'Lift the salt bridge out and read the voltmeter again.';
    if (!w.readings.some((r, i) => !r.bridge && i > w.readings.findIndex((q) => q.bridge))) return 'Read the voltmeter with the bridge out.';
    if (!w.replaced) return 'Replace the salt bridge.';
    if (w.readings.filter((r) => r.bridge).length < 2) return 'Read the e.m.f. again with the bridge replaced: the two readings should agree.';
    return `Record the e.m.f. and work out E°cell = ${E_TXT} and the percentage difference.`;
  }
  if (x.task === 'DISP') {
    const w = s.disp;
    if (!w.filings) return 'Choose the clean iron filings.';
    if (x.look.fe < 0.5) return `Tap filings onto the weighed boat until the balance reads about 0.56 g (now ${x.look.fe.toFixed(2)} g).`;
    if (w.cuso4 === null) return 'Measure 50 cm³ of the CuSO₄ solution into the beaker.';
    if (!w.thermo) return 'Stand the thermometer in the solution and read the initial temperature.';
    if (!w.added) return 'Tip the iron in and stir with the glass rod.';
    if (!w.filtered) {
      if (!w.paper) return 'While it reacts, weigh a dry filter paper.';
      return x.look.extent < 0.99 ? `Reacting (${Math.round(x.look.extent * 100)} %): watch the colour and the thermometer — note the highest temperature.` : 'The reaction has finished: filter off the solid onto the weighed paper.';
    }
    if (!w.wash) return 'Wash the copper with water, then a little propanone.';
    if (!w.dry) return 'Let it dry in a warm place — no flames near propanone.';
    if (!w.weighed) return 'Weigh the paper and copper.';
    return 'Record the masses and temperatures, then work out the moles and the percentage.';
  }
  const w = s.rust;
  if (!w.sanded) return 'Clean the nails with sandpaper.';
  if (!w.tubes.A.nail) return 'Tube A: a nail in tap water.';
  if (!w.tubes.B.nail) return 'Tube B: boil some distilled water, pour it over a nail and cover it with a layer of oil.';
  if (!w.tubes.B.oil) return 'Tube B: add a layer of oil on top of the boiled water.';
  if (!w.tubes.C.nail) return 'Tube C: anhydrous calcium chloride and a nail, then stopper it.';
  if (!w.tubes.C.stopper) return 'Stopper tube C tightly.';
  if (!w.tubes.D.nail) return 'Tube D: a nail in salt water.';
  if (!w.wool) return 'Push moist iron wool into the graduated tube (50.0 cm³ of air) and stand it in the trough.';
  if (!w.started) return 'Read the starting volume, then leave everything for a week (use time-lapse).';
  if (x.look.day < RUST_WEEK - 0.05) return `${fmtDays(x.look.day)}: use time-lapse. Read the graduated tube each day, levels equal.`;
  if (!w.observed.length) return 'A week has passed: look at the four tubes and record which nails rusted.';
  if (!w.readings.some((r) => r.levelled && r.day >= 5)) return 'Level the water inside and outside the graduated tube, then read the final volume.';
  return 'Record the volumes and work out the oxygen used and its percentage.';
}
const E_TXT = `0.34 − (−0.76) = ${CELL_E0.toFixed(2)} V`;
export { DISP_VOL };
