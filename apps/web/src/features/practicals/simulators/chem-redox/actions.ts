import {
  REDOX_ACID_INFO,
  REDOX_ACID_VOL,
  REDOX_BURETTE,
  REDOX_STARCH_LATE,
  REDOX_STARCH_VOL,
  REDOX_WARM,
  chemRedoxVariant,
  redoxDrop,
  redoxEndpoint,
  redoxFillLevel,
  redoxLessonTask,
  redoxTrueEnd,
  type ChemRedoxState,
  type ChemRedoxVariant,
  type RedoxAcid,
  type RedoxIndicator,
  type RedoxRinse,
  type RedoxRun,
  type RedoxTask,
} from '@aischool/shared';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { SimulatorProps } from '../types';

/**
 * The redox bench's actions, shared by the 2D and the 3D lab (and the demo
 * and sandbox) so all of them produce exactly the same `ChemRedoxState`.
 * Every change goes through `update`, which appends to the action log.
 *
 * What is live and not saved: the flask's temperature while it is warmed and
 * cools (OX), and how much of the KMnO₄ run in has reacted so far — the
 * ethanedioic acid reaction is slow until Mn²⁺ has formed (autocatalysis) and
 * much slower cold. Iron(II) and iodine react at once. Colours follow
 * Beer–Lambert absorbance of MnO₄⁻, I₂/I₃⁻ and the starch–iodine complex at
 * their real concentrations in the flask.
 */

/** Stream rate while the tap is open: cm³ per 100 ms tick (about 1 cm³ s⁻¹). */
export const STREAM_STEP = 0.1;
export const r2 = (x: number) => Math.round(x * 100) / 100;
export const lessonTask = redoxLessonTask;
export const RINSE_LABEL: Record<RedoxRinse, string> = { A: 'Solution A', B: 'Solution B', WATER: 'Distilled water', NONE: 'Not rinsed' };
export const TASK_TITLE: Record<RedoxTask, string> = {
  FE: 'KMnO₄ against iron(II)',
  OX: 'KMnO₄ against ethanedioic acid',
  IOD: 'Iodine against sodium thiosulphate',
};
/** OX: how fast the flask warms on the gauze (°C per second, time-lapsed a little) and how it cools (s). */
export const HEAT_RATE = 1.6;
const COOL_TAU = 900;

// ------------------------------------------------------------------ colours
type RGB = [number, number, number];
const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
export const hex = (c: RGB) => `#${c.map((x) => clamp(x).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: RGB, b: RGB, f: number): RGB => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
/** Absorbance per mol dm⁻³ per cm, red / green / blue (MnO₄⁻ absorbs green: it looks purple; I₃⁻ absorbs blue: brown; starch–iodine absorbs red: blue-black). */
const EPS_MNO4: RGB = [150, 2400, 450];
const EPS_I3: RGB = [3, 9, 40];
const EPS_STARCH: RGB = [40_000, 20_000, 6_000];
/** Light path through the flask (cm) and the burette (cm). */
const PATH = 4;
const filter = (c: RGB, eps: RGB, conc: number, path = PATH): RGB => [c[0] * 10 ** (-eps[0] * conc * path), c[1] * 10 ** (-eps[1] * conc * path), c[2] * 10 ** (-eps[2] * conc * path)];
const CLEAR: RGB = [246, 248, 250];
const FE2: RGB = [236, 246, 224];
const FE3: RGB = [248, 240, 204];
const MNO2: RGB = [128, 84, 44];

/** cm³ in the flask: the 25.0 cm³ of B, the acid, the starch and the A run in. */
export const flaskVolume = (run: RedoxRun, delivered: number) => 25 + (run.acid ? REDOX_ACID_VOL : 0) + (run.starchAt !== null ? REDOX_STARCH_VOL : 0) + Math.max(0, delivered);

/** The colour of the solution in the burette (A). */
export function buretteColour(v: ChemRedoxVariant): { colour: string; opacity: number; dark: boolean } {
  if (v.task === 'IOD') return { colour: '#d5e9f7', opacity: 0.42, dark: false };
  // 0.02 mol dm⁻³ MnO₄⁻ through 1.1 cm of tube transmits almost nothing: black-purple (only a little red and violet gets through).
  const f = Math.min(1, v.A.conc / 0.02);
  return { colour: hex(mix([70, 14, 80], [34, 4, 40], f)), opacity: 0.98, dark: true };
}
/** The colour of B (what the pipette draws up). */
export function solutionBColour(v: ChemRedoxVariant): string {
  if (v.task === 'FE') return hex(FE2);
  if (v.task === 'IOD') return hex(filter(CLEAR, EPS_I3, v.B.conc));
  return hex(CLEAR);
}

/**
 * The flask's colour for a run with `delivered` cm³ of A run in, `visibleA`
 * cm³ of it still unreacted (KMnO₄; or excess past the end point).
 */
export function redoxColour(v: ChemRedoxVariant, run: RedoxRun, index: number, delivered: number, visibleA: number): string {
  const vol = flaskVolume(run, delivered);
  if (v.task === 'IOD') {
    const trueEnd = redoxTrueEnd(v, index, run);
    const rem = Math.max(0, 1 - delivered / trueEnd);
    let c = filter(CLEAR, EPS_I3, (v.B.conc * 25 * rem) / vol);
    if (run.starchAt !== null && delivered >= run.starchAt - 1e-9) {
      const end = redoxEndpoint(v, index, run);
      const blue = Math.max(0, 1 - delivered / end);
      c = filter(c, EPS_STARCH, (v.B.conc * 25 * blue) / vol);
    }
    return hex(c);
  }
  const end = redoxEndpoint(v, index, run);
  let base: RGB = v.task === 'FE' ? mix(FE2, FE3, Math.min(1, delivered / Math.max(1, end))) : CLEAR;
  if (run.acid === null && delivered > 0) base = mix(base, MNO2, Math.min(0.75, delivered / 8));
  return hex(filter(base, EPS_MNO4, (v.A.conc * Math.max(0, visibleA)) / vol));
}
/** What colour the drop makes where it lands, before swirling mixes it in (KMnO₄ only). */
export const DROP_SPOT = '#b4359c';

// ------------------------------------------------------------------ hints

/** What to do next (practice mode only). */
export function nextHint(s: ChemRedoxState, open: RedoxRun | null, v: ChemRedoxVariant, liveDelivered: number, temp: number | null): string {
  const t = v.task;
  if (!s.setup.burette) return `Rinse the burette with A (${v.A.formula}), the solution it will hold.`;
  if (!s.setup.pipette) return `Rinse the pipette with B (${v.B.formula}), the solution it will measure.`;
  if (!s.setup.flask) return 'Rinse the conical flask with distilled water.';
  if (s.burette === null) return `Fill the burette with A using the filter funnel${v.dark ? ' (below eye level — KMnO₄ stains)' : ''}.`;
  if (!open) return s.runs.filter((r) => r.done).length === 0 ? 'Pipette 25.0 cm³ of B into the flask for a rough titration.' : 'Pipette 25.0 cm³ of B into a clean flask for the next titration.';
  if (t !== 'IOD' && !open.acid) return 'Add about 20 cm³ of dilute H₂SO₄ to the flask with the measuring cylinder.';
  if (t === 'OX' && open.initial === null && (temp ?? 0) < REDOX_WARM.min) return `Warm the flask on the gauze to about 60–70 °C (now ${Math.round(temp ?? v.room)} °C).`;
  if (s.funnelIn && open.initial === null) return 'Remove the funnel, then read and record the initial burette reading.';
  if (open.initial === null) return v.dark ? 'Read the TOP of the meniscus (KMnO₄ is too dark to see the bottom) and record the initial reading.' : 'Read the bottom of the meniscus and record the initial reading, then titrate.';
  if (t === 'FE') return open.kind === 'ROUGH' ? 'Run in KMnO₄, swirling: the purple vanishes as it goes in. Stop at the first pale pink that stays.' : 'Run in KMnO₄ to about 1 cm³ short of the rough titre, then drop by drop until one drop gives a permanent pale pink.';
  if (t === 'OX') return liveDelivered < 1 ? 'Add the first KMnO₄ slowly and swirl: it decolourises slowly until some Mn²⁺ has formed.' : `It decolourises quickly now. Add dropwise near the end point until a pale pink stays for 30 s${temp !== null && temp < REDOX_WARM.okMin ? ' — the flask has cooled: warm the next portion again' : ''}.`;
  if (open.starchAt === null) {
    const end = redoxTrueEnd(v, s.runs.indexOf(open), open);
    return liveDelivered < (1 - REDOX_STARCH_LATE) * end ? 'Run in thiosulphate, swirling, until the brown fades to a pale straw (pale yellow) colour.' : 'Pale straw: now add about 1 cm³ of starch — it turns blue-black.';
  }
  return 'Add thiosulphate drop by drop, swirling, until the blue-black colour just disappears.';
}

export type RedoxUpdate = (fn: (s: ChemRedoxState) => ChemRedoxState, log?: string) => void;

/** `variant`: use these values instead of the seed's (the sandbox). */
export function useRedox({
  seed,
  state,
  onChange,
  readOnly,
  startedAt,
  practicalId,
  variant,
  autoTask = true,
}: Pick<SimulatorProps<'chem-redox'>, 'seed' | 'state' | 'onChange' | 'readOnly' | 'startedAt' | 'practicalId'> & { variant?: ChemRedoxVariant; autoTask?: boolean }) {
  const task: RedoxTask = variant?.task ?? state.task ?? lessonTask(practicalId);
  const v = useMemo(() => variant ?? chemRedoxVariant(seed, task), [variant, seed, task]);
  const t0 = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const ref = useRef(state);
  ref.current = state;
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [flashUntil, setFlashUntil] = useState(0);

  const update: RedoxUpdate = (fn, log) => {
    if (readOnly) return;
    let next = fn(ref.current);
    if (log) next = { ...next, log: [...next.log, { t: Math.max(0, Date.now() - t0), a: log.slice(0, 80) }].slice(-600) };
    ref.current = next;
    onChange(next);
  };
  useEffect(() => {
    if (autoTask && !readOnly && !ref.current.task) update((s) => (s.task ? s : { ...s, task }), `task:${task}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, task]);

  const openIndex = state.runs.findIndex((r) => !r.done);
  const open = openIndex >= 0 ? state.runs[openIndex]! : null;
  const setRun = (s: ChemRedoxState, i: number, patch: Partial<RedoxRun>): ChemRedoxState => ({ ...s, runs: s.runs.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const deliveredOf = (s: ChemRedoxState, i: number) => {
    const r = s.runs[i];
    if (!r || r.initial === null) return 0;
    return Math.max(0, (r.final ?? s.burette ?? r.initial) - r.initial);
  };

  // ---- live: temperature (OX) and how much KMnO₄ has reacted (OX), per run index
  const live = useRef<{ idx: number; T: number; at: number; heating: boolean; reacted: number } | null>(null);
  const liveFor = (i: number) => {
    const l = live.current;
    if (l && l.idx === i) return l;
    const r = ref.current.runs[i];
    const delivered = deliveredOf(ref.current, i);
    const end = r ? redoxEndpoint(v, i, r) : 0;
    live.current = { idx: i, T: r?.warm ?? v.room, at: performance.now(), heating: false, reacted: Math.min(delivered, end) };
    return live.current;
  };
  /** The flask's temperature now (°C). */
  const tempNow = (i = ref.current.runs.findIndex((r) => !r.done)) => {
    if (i < 0) return null;
    const l = liveFor(i);
    const dt = (performance.now() - l.at) / 1000;
    return l.heating ? l.T : v.room + (l.T - v.room) * Math.exp(-dt / COOL_TAU);
  };
  const settleTemp = (l: NonNullable<typeof live.current>) => {
    const now = performance.now();
    if (!l.heating) l.T = v.room + (l.T - v.room) * Math.exp(-(now - l.at) / 1000 / COOL_TAU);
    l.at = now;
  };
  // the ticker: warming, the slow KMnO₄ reaction, and re-rendering what they change
  const needTick = !readOnly && !!open && (task === 'OX' || flashUntil > 0);
  useEffect(() => {
    if (!needTick) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      const s = ref.current;
      const i = s.runs.findIndex((r) => !r.done);
      if (i < 0) return;
      const r = s.runs[i]!;
      if (task === 'OX') {
        const l = liveFor(i);
        if (l.heating) {
          l.T = Math.min(100, l.T + HEAT_RATE * dt);
          l.at = now;
        }
        const delivered = deliveredOf(s, i);
        const end = redoxEndpoint(v, i, r);
        const pending = delivered - l.reacted;
        const room = Math.max(0, end - l.reacted);
        if (pending > 1e-6 && room > 1e-6) {
          const T = tempNow(i) ?? v.room;
          const k = 2.5 * Math.exp(-7217 * (1 / (T + 273.15) - 1 / 338.15)) * (0.015 + 0.985 * Math.min(1, l.reacted / 0.5));
          l.reacted += Math.min(room, pending * (1 - Math.exp(-k * dt)));
        }
      }
      bump();
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needTick, task, v]);
  useEffect(() => {
    if (!flashUntil) return;
    const id = setTimeout(() => setFlashUntil(0), Math.max(0, flashUntil - performance.now()));
    return () => clearTimeout(id);
  }, [flashUntil]);

  /** cm³ of A in the flask that is still purple (unreacted, or in excess). */
  const visibleA = (i: number, s = ref.current) => {
    const r = s.runs[i];
    if (!r) return 0;
    const delivered = deliveredOf(s, i);
    const end = redoxEndpoint(v, i, r);
    // At the end point itself the drop that reaches it leaves the first faint permanent pink (about half a drop in excess).
    const atEnd = delivered >= end - 1e-6 ? delivered - end + 0.025 : 0;
    if (task === 'OX' && !r.done && live.current?.idx === i) return Math.max(delivered - live.current.reacted, atEnd);
    return Math.max(0, delivered - end, atEnd);
  };
  const colourOf = (i: number, s = ref.current) => {
    const r = s.runs[i];
    return r ? redoxColour(v, r, i, deliveredOf(s, i), visibleA(i, s)) : null;
  };

  // ---- actions
  const note = (a: string) => update((s) => s, a);
  const rinse = (what: 'burette' | 'pipette' | 'flask', liquid: RedoxRinse) => update((s) => ({ ...s, setup: { ...s.setup, [what]: liquid }, ...(what === 'burette' ? { burette: null } : {}) }), `rinse-${what}:${liquid}`);
  const fill = () => update((s) => ({ ...s, burette: redoxFillLevel(v.seed, s.fills), fills: s.fills + 1, funnelIn: true }), 'fill-burette');
  const removeFunnel = () => update((s) => ({ ...s, funnelIn: false }), 'remove-funnel');
  const placeFunnel = () => update((s) => ({ ...s, funnelIn: true }), 'place-funnel');
  const pipette = (kind: RedoxRun['kind']) => {
    live.current = null;
    update((s) => {
      const runs = [...s.runs, { kind, acid: null, indicators: [], starchAt: null, warm: null, startTemp: null, initial: null, final: null, swirls: 0, funnelRemoved: false, done: false } satisfies RedoxRun];
      const table = [...s.table];
      while (table.length < runs.length) table.push({ initial: '', final: '', titre: '' });
      return { ...s, runs, table };
    }, `pipette:${kind}`);
  };
  const addAcid = (acid: RedoxAcid) => {
    const i = ref.current.runs.findIndex((r) => !r.done);
    if (i < 0 || ref.current.runs[i]!.acid) return;
    update((x) => setRun(x, i, { acid }), `acid:${acid}`);
  };
  const addIndicator = (ind: RedoxIndicator) => {
    const s = ref.current;
    const i = s.runs.findIndex((r) => !r.done);
    if (i < 0) return;
    const r = s.runs[i]!;
    if (r.indicators.includes(ind) || r.indicators.length >= 6) return;
    const at = r2(deliveredOf(s, i));
    update((x) => setRun(x, i, { indicators: [...r.indicators, ind], ...(ind === 'STARCH' ? { starchAt: at } : {}) }), `indicator:${ind}${ind === 'STARCH' ? `@${at.toFixed(2)}` : ''}`);
  };
  /** OX: hold the flask over the flame (start / stop). */
  const heatStart = () => {
    const i = ref.current.runs.findIndex((r) => !r.done);
    if (i < 0 || readOnly) return;
    const l = liveFor(i);
    settleTemp(l);
    l.heating = true;
    bump();
  };
  const heatStop = () => {
    const i = ref.current.runs.findIndex((r) => !r.done);
    const l = live.current;
    if (i < 0 || !l || l.idx !== i || !l.heating) return;
    l.heating = false;
    l.at = performance.now();
    const T = Math.round(l.T * 10) / 10;
    const r = ref.current.runs[i]!;
    update((x) => setRun(x, i, { warm: Math.max(r.warm ?? 0, T) }), `warm:${Math.round(T)}`);
  };
  const heating = () => !!live.current?.heating;
  /** Set the flask's temperature directly (the demo, which must replay exactly). */
  const warmTo = (T: number) => {
    const i = ref.current.runs.findIndex((r) => !r.done);
    if (i < 0) return;
    const l = liveFor(i);
    l.heating = false;
    l.T = T;
    l.at = performance.now();
    const r = ref.current.runs[i]!;
    update((x) => setRun(x, i, { warm: Math.max(r.warm ?? 0, T) }), `warm:${Math.round(T)}`);
  };
  /** Runs A into the flask; the run's initial reading is the level when the first A goes in. */
  const deliver = (vol: number, stream: boolean) => {
    const s = ref.current;
    const i = s.runs.findIndex((r) => !r.done);
    if (i < 0 || s.burette === null || s.burette >= REDOX_BURETTE) {
      stopStream();
      return;
    }
    const run = s.runs[i]!;
    const level = r2(Math.min(REDOX_BURETTE, s.burette + vol));
    const first = run.initial === null;
    const initial = run.initial ?? s.burette;
    if (first && task === 'OX') heatStop();
    const startTemp = first ? (task === 'OX' ? Math.round((tempNow(i) ?? v.room) * 10) / 10 : null) : run.startTemp;
    update((x) => ({ ...setRun(x, i, first ? { initial, funnelRemoved: !x.funnelIn, startTemp } : {}), burette: level }), first ? 'start-titrating' : undefined);
    if (task !== 'IOD') {
      const end = redoxEndpoint(v, i, run);
      const d = level - initial;
      // each drop shows purple where it lands; near the end point the colour lingers longer before swirling clears it
      if (!stream || d > end - 1.2) setFlashUntil(performance.now() + (d > end - 0.6 ? 900 : 350));
    }
  };
  const drop = () => {
    const s = ref.current;
    if (s.burette === null) return;
    deliver(redoxDrop(v, s.burette), false);
  };
  const swirl = () => {
    const i = ref.current.runs.findIndex((r) => !r.done);
    if (i < 0) return;
    setFlashUntil(0);
    update((x) => setRun(x, i, { swirls: x.runs[i]!.swirls + 1 }));
  };
  const finish = () => {
    const s = ref.current;
    const i = s.runs.findIndex((r) => !r.done);
    if (i < 0 || s.runs[i]!.initial === null) return;
    setFlashUntil(0);
    heatStop();
    update((x) => setRun(x, i, { final: x.burette, done: true }), 'finish-titration');
  };
  const pourAway = () => {
    const i = ref.current.runs.findIndex((r) => !r.done);
    if (i < 0) return;
    setFlashUntil(0);
    live.current = null;
    update((x) => ({ ...x, runs: x.runs.filter((_, k) => k !== i), table: x.table.filter((_, k) => k !== i) }), 'pour-away');
  };

  // hold-to-run tap
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopStream = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  const startStream = () => {
    stopStream();
    deliver(STREAM_STEP, true);
    timer.current = setInterval(() => deliver(STREAM_STEP, true), 100);
  };
  useEffect(() => stopStream, []);

  const doneRuns = state.runs.filter((r) => r.done).length;
  const canDeliver = !!open && state.burette !== null && state.burette < REDOX_BURETTE;
  const shownIndex = openIndex >= 0 ? openIndex : state.runs.length - 1;
  const colour = open ? colourOf(openIndex, state) : readOnly && shownIndex >= 0 ? colourOf(shownIndex, state) : null;
  const flash = flashUntil > 0 && open && task !== 'IOD' ? DROP_SPOT : null;
  const delivered = openIndex >= 0 ? deliveredOf(state, openIndex) : 0;
  const temp = task === 'OX' && open ? tempNow(openIndex) : null;

  return {
    v,
    task,
    ref,
    update,
    open,
    openIndex,
    shownIndex,
    colour,
    colourOf,
    flash,
    delivered,
    temp,
    tempNow,
    heating,
    doneRuns,
    canDeliver,
    deliveredOf,
    note,
    rinse,
    fill,
    removeFunnel,
    placeFunnel,
    pipette,
    addAcid,
    addIndicator,
    heatStart,
    heatStop,
    warmTo,
    deliver,
    drop,
    swirl,
    finish,
    pourAway,
    startStream,
    stopStream,
  };
}
export type Redox = ReturnType<typeof useRedox>;
export const acidLabel = (a: RedoxAcid) => `${REDOX_ACID_INFO[a].label} (${REDOX_ACID_INFO[a].formula})`;
