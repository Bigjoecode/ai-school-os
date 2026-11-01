import {
  EN_MAX_T,
  SOLY_BATH,
  SOLY_FLAME,
  SOLY_HEAT_TAU,
  chemEnergeticsVariant,
  enDissolved,
  enSteady,
  enTemp,
  enThermo,
  energeticsLessonTask,
  solyAppearTemp,
  solyEvaporation,
  solySatTemp,
  solySolubility,
  type ChemEnergeticsState,
  type ChemEnergeticsVariant,
  type EnCurveRun,
  type EnNature,
  type EnRun,
  type EnRunKind,
  type EnVessel,
  type EnergeticsTask,
  type SolyHeat,
  type SolyRun,
} from '@aischool/shared';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useLabUpdate } from '../phy-common';

/**
 * The energetics bench's state transitions, shared by the 2D and the 3D lab
 * (and the demo and the sandbox) so all of them write the same state and log.
 * Cup (NEUT / SOLN): choose the vessel, stand it in a beaker, measure the
 * acid (or water), read its temperature, measure the alkali and read it (or
 * weigh the solid), mix, cover, stir, watch the thermometer to the highest
 * (lowest) temperature, finish. Tube (SOLY): weigh the KNO₃, add water from the
 * burette, warm it in the water bath until it dissolves, take it out, stir and
 * note the temperature as the first crystals appear; add more water and
 * repeat. The reaction, the thermometer and the tube's temperature run on a
 * live clock (time-lapse possible); what is marked is written when it is done.
 */

export const lessonTask = energeticsLessonTask;
export const TASK_TITLE: Record<EnergeticsTask, string> = {
  NEUT: 'Heat of neutralisation',
  SOLN: 'Heat of solution of NH₄NO₃',
  SOLY: 'Solubility curve of KNO₃',
};
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

export const openRun = (s: ChemEnergeticsState) => {
  const i = s.runs.findIndex((r) => !r.done);
  return i >= 0 ? { i, r: s.runs[i]! } : null;
};
export const openTube = (s: ChemEnergeticsState) => {
  const i = s.soly.runs.findIndex((r) => !r.done);
  return i >= 0 ? { i, r: s.soly.runs[i]! } : null;
};
export const curveRun = (r: EnRun, i: number): EnCurveRun => ({ kind: r.kind, n: i, vessel: r.vessel, volA: r.volA, volB: r.volB, solid: r.solid, stirAt: r.stirAt, lidAt: r.lidAt });
/** The run the cup is for next: NEUT; SOLN: NH₄NO₃ first, then NaOH. */
export const nextKind = (s: ChemEnergeticsState): EnRunKind => (s.task === 'SOLN' ? (s.runs.some((r) => r.done && r.kind === 'SALT') ? 'NAOH' : 'SALT') : 'NEUT');
export const KIND_LABEL: Record<EnRunKind, string> = { NEUT: 'HCl + NaOH', SALT: 'NH₄NO₃', NAOH: 'NaOH pellets' };

export type ThermoWhere = 'A' | 'B' | 'CUP' | 'TUBE' | null;
/** A stretch of the tube's history: heating in the bath (or flame) or cooling in air, from (T0, θ0) at clock time `at`. */
interface Segment {
  mode: 'heat' | 'cool';
  heat: SolyHeat;
  at: number;
  T0: number;
  th0: number;
  stirred: boolean;
}

export function energeticsHint(s: ChemEnergeticsState, o: Energetics): string {
  const task = s.task ?? 'NEUT';
  if (task === 'SOLY') {
    const t = openTube(s);
    const done = s.soly.runs.filter((r) => r.done).length;
    if (s.soly.mass === null) return 'Weigh 4.0 g of KNO₃ into the boiling tube.';
    if (!t) return done === 0 ? 'Run 5.0 cm³ of distilled water from the burette into the tube.' : done < 4 ? `Add 1.0 cm³ more water from the burette (${done} saturation temperature${done === 1 ? '' : 's'} so far).` : 'Enough points: fill in the table, plot solubility against temperature, draw a smooth curve and answer the questions. (More water gives more points.)';
    const ph = o.phase();
    if (ph === 'idle') return 'Warm the tube in the hot water bath, stirring, until all the solid dissolves.';
    if (ph === 'heat') return o.solidLeft() > 0.001 ? 'Keep warming and stirring until every crystal has dissolved.' : 'All dissolved: take the tube out of the bath and let it cool.';
    if (!o.stirring()) return 'Stir gently with the thermometer while it cools.';
    return o.crystalsShown() ? 'Crystals! Note the thermometer reading NOW and record it.' : 'Watch the solution closely as it cools: note the temperature the moment the first crystals appear.';
  }
  const r = openRun(s);
  const kind = nextKind(s);
  if (!s.setup.vessel) return 'Choose a polystyrene cup: it is a poor conductor of heat.';
  if (!s.setup.support) return 'Stand the cup in a beaker so it cannot tip over.';
  if (!r) {
    if (task === 'NEUT') return s.runs.some((x) => x.done) ? 'Done: fill in the table, say whether it is exothermic, and do the calculations.' : 'Measure 50.0 cm³ of the acid into the cup.';
    if (kind === 'NAOH' && !s.runs.some((x) => x.done && x.kind === 'NAOH')) return 'Now the comparison: rinse the cup and measure 50.0 cm³ of fresh water into it.';
    return s.runs.some((x) => x.done && x.kind === 'SALT') ? 'Both done: fill in the table, say which is endothermic, and do the calculations.' : 'Measure 50.0 cm³ of distilled water into the cup.';
  }
  if (!r.r.mixed) {
    if (!r.r.readA) return task === 'NEUT' ? 'Put the thermometer in the acid and record its steady temperature.' : 'Put the thermometer in the water and record its steady temperature.';
    if (task === 'NEUT' && r.r.volB === 0) return 'Measure 50.0 cm³ of the alkali in the other measuring cylinder.';
    if (task === 'NEUT' && !r.r.readB) return 'Put the thermometer in the alkali and record its temperature too.';
    if (task === 'SOLN' && r.r.solid === 0) return r.r.kind === 'NAOH' ? 'Weigh 2.00 g of NaOH pellets (spatula — never fingers).' : 'Weigh 4.00 g of NH₄NO₃.';
    return task === 'NEUT' ? 'Pour the alkali quickly into the acid.' : 'Tip the solid into the water.';
  }
  if (r.r.lidAt === null) return 'Cover the cup with its lid at once.';
  if (r.r.stirAt === null) return 'Stir with the thermometer.';
  return `Keep stirring and watch the thermometer: record the ${r.r.kind === 'SALT' ? 'lowest' : 'highest'} temperature it reaches, then finish.`;
}

export function useEnergetics({
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
  state: ChemEnergeticsState;
  onChange: (next: ChemEnergeticsState) => void;
  readOnly: boolean;
  startedAt: string;
  practicalId?: string;
  variant?: ChemEnergeticsVariant;
  autoTask?: boolean;
  clock?: Clock;
}) {
  const task: EnergeticsTask = variant?.task ?? state.task ?? lessonTask(practicalId);
  const seeded = useMemo(() => chemEnergeticsVariant(seed, task), [seed, task]);
  const v = variant ?? seeded;
  const { update, ref } = useLabUpdate(state, onChange, readOnly, startedAt);
  const own = useRef<Clock | null>(null);
  if (!own.current) own.current = makeClock();
  const clock = givenClock ?? own.current;
  const now = () => clock.now();
  const [speed, setSpeedState] = useState(1);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (autoTask && !readOnly && !ref.current.task) update((s) => (s.task ? s : { ...s, task }), `task:${task}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, task]);

  // ---- live, not saved
  /** Cup: when the open run was mixed (clock ms). */
  const mixRef = useRef<{ run: number; at: number } | null>(null);
  /** The thermometer: where it is, since when, and what it read when it went in. */
  const thRef = useRef<{ where: ThermoWhere; at: number; from: number }>({ where: null, at: 0, from: v.room });
  /** Tube: the current segment, stirring, evaporation bookkeeping and when crystals appeared. */
  const segRef = useRef<Segment | null>(null);
  const stirRef = useRef(false);
  const evapRef = useRef<{ at: number; lost: number }>({ at: 0, lost: 0 });
  const appearRef = useRef<{ at: number; stirred: boolean } | null>(null);
  const dissolvedRef = useRef(false);

  const tMix = (t = now()) => (mixRef.current ? (t - mixRef.current.at) / 1000 : 0);
  const cupLive = () => {
    const m = mixRef.current;
    const r = m ? ref.current.runs[m.run] : null;
    return !!m && !!r && !r.done;
  };
  /** The cup's thermometer (°C) now. */
  const thermoNow = (t = now()): number => {
    const s = ref.current;
    if (task === 'SOLY') return tubeThermo(t);
    const th = thRef.current;
    const m = mixRef.current;
    if (th.where === 'CUP' && m) {
      const r = s.runs[m.run];
      if (r) return enThermo(v, curveRun(r, m.run), Math.min(EN_MAX_T, r.done ? (r.elapsed ?? 0) : tMix(t)));
    }
    if (th.where === 'A' || th.where === 'B') {
      const steady = enSteady(v, task === 'SOLN' ? 'W' : th.where);
      return steady + (th.from - steady) * Math.exp(-((t - th.at) / 1000) / v.lag);
    }
    return v.room;
  };
  /** The liquid's true temperature (the visuals) and how much has mixed / dissolved. */
  const cupTemp = (t = now()) => {
    const m = mixRef.current;
    const r = m ? ref.current.runs[m.run] : null;
    return m && r ? enTemp(v, curveRun(r, m.run), Math.min(EN_MAX_T, r.done ? (r.elapsed ?? 0) : tMix(t))) : v.room;
  };
  const cupDissolved = (t = now()) => {
    const m = mixRef.current;
    const r = m ? ref.current.runs[m.run] : null;
    if (!m || !r) return 0;
    return enDissolved(v, curveRun(r, m.run), Math.min(EN_MAX_T, r.done ? (r.elapsed ?? 0) : tMix(t)));
  };

  // ---- the tube
  const tubeWater = () => {
    const t = openTube(ref.current);
    return t ? t.r.water : ref.current.soly.water;
  };
  const segAt = (seg: Segment, t: number) => {
    const dt = Math.max(0, (t - seg.at) / 1000);
    const Tinf = seg.mode === 'heat' ? (seg.heat === 'FLAME' ? SOLY_FLAME : SOLY_BATH) : v.room;
    const tau = seg.mode === 'heat' ? (seg.heat === 'FLAME' ? 15 : SOLY_HEAT_TAU) : v.coolTau * (seg.stirred ? 1 : 1.25);
    const tl = v.tubeLag * (seg.stirred ? 1 : 2);
    const A = seg.T0 - Tinf;
    const T = Tinf + A * Math.exp(-dt / tau);
    const th = Tinf + (A * (tau * Math.exp(-dt / tau) - tl * Math.exp(-dt / tl))) / (tau - tl) + (seg.th0 - seg.T0) * Math.exp(-dt / tl);
    return { T, th };
  };
  const tubeTemp = (t = now()) => (segRef.current ? segAt(segRef.current, t).T : v.room);
  const tubeThermo = (t = now()) => (segRef.current ? segAt(segRef.current, t).th : v.room);
  /** g of water evaporated so far, including the segment running now. */
  const lostNow = (t = now()) => {
    const seg = segRef.current;
    const e = evapRef.current;
    if (!seg || seg.mode !== 'heat') return e.lost;
    // integrate the evaporation since the last bookkeeping point (1 s steps)
    let lost = e.lost;
    for (let x = e.at; x < t; x += 1000) lost += solyEvaporation(segAt(seg, x).T, seg.heat) * Math.min(1, (t - x) / 1000);
    return lost;
  };
  const bookEvap = (t = now()) => {
    evapRef.current = { at: t, lost: lostNow(t) };
  };
  /** g of KNO₃ that is solid in the tube now (undissolved, or crystallised again). */
  const solidLeft = (t = now()) => {
    const s = ref.current;
    const mass = s.soly.mass ?? 0;
    const w = Math.max(0.5, tubeWater() - lostNow(t));
    if (!openTube(s)) return mass;
    const T = tubeTemp(t);
    const eq = Math.max(0, mass - (solySolubility(v, T) * w) / 100);
    const seg = segRef.current;
    if (!seg || (seg.mode === 'cool' && dissolvedRef.current && !appearRef.current)) return dissolvedRef.current && seg ? 0 : eq;
    if (seg.mode === 'cool' && appearRef.current) return Math.max(0.02, eq);
    return eq;
  };
  /** The appearance temperature of the open run with the stirring now. */
  const appearTemp = () => {
    const t = openTube(ref.current);
    return t ? solyAppearTemp(v, t.r.water, lostNow(), stirRef.current, ref.current.soly.mass ?? 0) : null;
  };
  const anchor = (mode: Segment['mode'], heat: SolyHeat, t = now()) => {
    const T0 = tubeTemp(t);
    const th0 = tubeThermo(t);
    bookEvap(t);
    segRef.current = { mode, heat, at: t, T0, th0, stirred: stirRef.current };
  };
  const phase = (): 'idle' | 'heat' | 'cool' => (!openTube(ref.current) || !segRef.current ? 'idle' : segRef.current.mode);
  const crystalsShown = () => !!appearRef.current;

  const o = {
    v,
    task,
    update,
    ref,
    clock,
    now,
    speed,
    setSpeed: (x: number) => setSpeedState(x),
    note: (a: string) => update((s) => s, a),
    resetLive: () => {
      mixRef.current = null;
      thRef.current = { where: null, at: 0, from: v.room };
      segRef.current = null;
      stirRef.current = false;
      evapRef.current = { at: 0, lost: ref.current.soly.lost };
      appearRef.current = null;
      dissolvedRef.current = false;
      bump();
    },
    setNature: (which: 'main' | 'other', x: EnNature | null) => update((s) => ({ ...s, nature: { ...s.nature, [which]: x } }), `nature:${which}:${x ?? 'none'}`),
    // ---------------------------------------------------------------- the cup
    tMix,
    cupLive,
    thermoNow,
    cupTemp,
    cupDissolved,
    thermoWhere: () => thRef.current.where,
    chooseVessel: (vessel: EnVessel) => {
      if (openRun(ref.current)) return 'Finish or pour away the run in the cup first.';
      update((s) => ({ ...s, setup: { ...s.setup, vessel } }), `vessel:${vessel}`);
      return null;
    },
    support: () => update((s) => ({ ...s, setup: { ...s.setup, support: true } }), 'support'),
    /** Acid (NEUT) or water (SOLN) into the cup: starts a run. */
    measureA: (vol: number): string | null => {
      const s = ref.current;
      if (!s.setup.vessel) return 'Choose the cup first.';
      if (openRun(s)) return 'The cup is in use: finish this run or pour it away.';
      if (s.runs.length >= 8) return 'The table is full.';
      const kind = nextKind(s);
      const run: EnRun = { kind, vessel: s.setup.vessel, supported: s.setup.support, volA: vol, volB: 0, solid: 0, readA: false, readB: false, mixed: false, stirAt: null, lidAt: null, elapsed: null, done: false };
      mixRef.current = null;
      thRef.current = { where: null, at: now(), from: thermoNow() };
      update((x) => ({ ...x, runs: [...x.runs, run], table: [...x.table, { a: '', b: '', initial: '', extreme: '', dT: '' }] }), `measure-a:${vol}`);
      return null;
    },
    measureB: (vol: number): string | null => {
      const r = openRun(ref.current);
      if (!r) return 'Measure the acid into the cup first.';
      if (r.r.mixed) return 'Already mixed.';
      update((x) => ({ ...x, runs: x.runs.map((y, k) => (k === r.i ? { ...y, volB: vol } : y)) }), `measure-b:${vol}`);
      return null;
    },
    weigh: (kind: 'SALT' | 'NAOH', mass: number): string | null => {
      const r = openRun(ref.current);
      if (!r) return 'Measure the water into the cup first.';
      if (r.r.mixed) return 'The solid is already in.';
      update((x) => ({ ...x, runs: x.runs.map((y, k) => (k === r.i ? { ...y, kind, solid: mass } : y)) }), `weigh:${kind}:${mass}`);
      return null;
    },
    /** The thermometer into the acid / water (A) or the alkali (B). */
    thermoTo: (where: 'A' | 'B') => {
      const from = thermoNow();
      thRef.current = { where, at: now(), from };
      update((s) => s, `thermo:${where}`);
    },
    /** Read the thermometer before mixing (marks A or B as read). */
    readStart: (): string | null => {
      const r = openRun(ref.current);
      const w = thRef.current.where;
      if (!r || r.r.mixed) return null;
      if (w !== 'A' && w !== 'B') return 'Put the thermometer into the liquid first.';
      if (w === 'B' && r.r.volB === 0) return 'Measure the alkali first.';
      if ((now() - thRef.current.at) / 1000 < 4) return 'Wait a few seconds for the thermometer to settle.';
      update((x) => ({ ...x, runs: x.runs.map((y, k) => (k === r.i ? { ...y, [w === 'A' ? 'readA' : 'readB']: true } : y)) }), `read:${w}:${r2(thermoNow())}`);
      return null;
    },
    mix: (at?: number): string | null => {
      const s = ref.current;
      const r = openRun(s);
      if (!r) return 'Nothing in the cup.';
      if (r.r.mixed) return 'Already mixed.';
      if (s.task !== 'SOLN' && r.r.volB === 0) return 'Measure the alkali first.';
      if (s.task === 'SOLN' && r.r.solid === 0) return 'Weigh the solid first.';
      const t = at ?? now();
      mixRef.current = { run: r.i, at: t };
      thRef.current = { where: 'CUP', at: t, from: thermoNow(t) };
      update((x) => ({ ...x, runs: x.runs.map((y, k) => (k === r.i ? { ...y, mixed: true } : y)) }), 'mix');
      bump();
      return null;
    },
    lid: (at?: number) => {
      const r = openRun(ref.current);
      if (!r || !r.r.mixed || r.r.lidAt !== null || !mixRef.current) return;
      const t = r2(tMix(at));
      update((x) => ({ ...x, runs: x.runs.map((y, k) => (k === r.i ? { ...y, lidAt: t } : y)) }), `lid:${t}`);
    },
    stir: (at?: number) => {
      const r = openRun(ref.current);
      if (!r || !r.r.mixed || !mixRef.current) return;
      if (r.r.stirAt !== null) return update((s) => s);
      const t = r2(tMix(at));
      update((x) => ({ ...x, runs: x.runs.map((y, k) => (k === r.i ? { ...y, stirAt: t } : y)) }), `stir:${t}`);
    },
    finish: (at?: number) => {
      const r = openRun(ref.current);
      if (!r || !r.r.mixed || !mixRef.current) return;
      const t = r2(Math.min(EN_MAX_T, tMix(at)));
      update((x) => ({ ...x, runs: x.runs.map((y, k) => (k === r.i ? { ...y, elapsed: t, done: true } : y)) }), `finish:${Math.round(t)}`);
      bump();
    },
    pourAway: () => {
      const r = openRun(ref.current);
      if (!r) return;
      mixRef.current = null;
      thRef.current = { where: null, at: now(), from: thermoNow() };
      update((x) => ({ ...x, runs: x.runs.filter((_, k) => k !== r.i), table: x.table.filter((_, k) => k !== r.i) }), 'pour-away');
      bump();
    },
    removeRun: (i: number) => update((x) => ({ ...x, runs: x.runs.filter((_, k) => k !== i), table: x.table.filter((_, k) => k !== i) }), `remove-run:${i}`),
    // ---------------------------------------------------------------- the tube
    phase,
    tubeTemp,
    tubeThermo,
    solidLeft,
    lostNow,
    stirring: () => stirRef.current,
    crystalsShown,
    appearTemp,
    weighKno3: (mass: number): string | null => {
      if (ref.current.soly.runs.length) return 'The tube already has KNO₃ and water in it (start again to change it).';
      update((s) => ({ ...s, soly: { ...s.soly, mass } }), `kno3:${mass}`);
      return null;
    },
    /** Water from the burette into the tube: a new run. */
    addWater: (vol: number): string | null => {
      const s = ref.current;
      if (s.soly.mass === null) return 'Weigh the KNO₃ into the tube first.';
      if (openTube(s)) return 'Finish this run first: let it cool until crystals appear.';
      if (s.soly.runs.length >= 12) return 'The table is full.';
      const water = r2(s.soly.water + vol);
      const run: SolyRun = { water, lost: s.soly.lost, heat: null, dissolved: false, stirred: false, seen: null, delay: null, done: false };
      appearRef.current = null;
      dissolvedRef.current = false;
      evapRef.current = { at: now(), lost: s.soly.lost };
      // the tube (and its thermometer) are at the temperature they cooled to, or the room
      const T = segRef.current ? tubeTemp() : v.room;
      segRef.current = null;
      if (T > v.room + 0.5) segRef.current = { mode: 'cool', heat: 'BATH', at: now(), T0: T, th0: T, stirred: stirRef.current };
      thRef.current = { where: 'TUBE', at: now(), from: T };
      update((x) => ({ ...x, soly: { ...x.soly, water, runs: [...x.soly.runs, run] }, solyTable: [...x.solyTable, { water: '', temp: '', sol: '' }] }), `water:${vol}`);
      bump();
      return null;
    },
    heatStart: (heat: SolyHeat, at?: number): string | null => {
      const t = openTube(ref.current);
      if (!t) return 'Add water to the tube first.';
      if (segRef.current?.mode === 'heat') return null;
      appearRef.current = null;
      anchor('heat', heat, at);
      update((x) => ({ ...x, soly: { ...x.soly, runs: x.soly.runs.map((r, k) => (k === t.i ? { ...r, heat: r.heat === 'FLAME' ? 'FLAME' : heat } : r)) } }), `heat:${heat}`);
      bump();
      return null;
    },
    heatStop: (at?: number) => {
      const t = openTube(ref.current);
      const seg = segRef.current;
      if (!t || !seg || seg.mode !== 'heat') return;
      const tt = at ?? now();
      const sat = solySatTemp(v, ((ref.current.soly.mass ?? 0) * 100) / Math.max(0.5, t.r.water - lostNow(tt)));
      dissolvedRef.current = sat !== null && tubeTemp(tt) > sat + 0.5;
      anchor('cool', seg.heat, tt);
      const lost = r2(evapRef.current.lost);
      update((x) => ({ ...x, soly: { ...x.soly, lost, runs: x.soly.runs.map((r, k) => (k === t.i ? { ...r, dissolved: dissolvedRef.current, lost } : r)) } }), `heat-off:${Math.round(tubeTemp(tt))}`);
      bump();
    },
    setStir: (on: boolean, at?: number) => {
      if (stirRef.current === on) return;
      stirRef.current = on;
      const seg = segRef.current;
      if (seg) anchor(seg.mode, seg.heat, at);
      update((s) => s, on ? 'stir-on' : 'stir-off');
      bump();
    },
    /** "Crystals!": the thermometer reading now becomes this run's saturation temperature. */
    crystalsSeen: (at?: number): string | null => {
      const s = ref.current;
      const t = openTube(s);
      const tt = at ?? now();
      if (!t) return 'No run is going.';
      if (!appearRef.current) {
        update((x) => x, 'crystals-early');
        return segRef.current?.mode === 'heat' ? 'It is still being heated: take it out of the bath and let it cool.' : 'No crystals yet: keep watching as it cools.';
      }
      const seen = r2(tubeThermo(tt));
      const delay = r2(Math.max(0, (tt - appearRef.current.at) / 1000));
      const stirred = appearRef.current.stirred;
      update((x) => ({ ...x, soly: { ...x.soly, runs: x.soly.runs.map((r, k) => (k === t.i ? { ...r, seen, delay, stirred, done: true } : r)) } }), `crystals:${seen}:${delay}`);
      bump();
      return null;
    },
    startAgain: () => {
      segRef.current = null;
      appearRef.current = null;
      dissolvedRef.current = false;
      evapRef.current = { at: now(), lost: 0 };
      update((x) => ({ ...x, soly: { mass: null, water: 0, lost: 0, runs: [] }, solyTable: [] }), 'restart');
      bump();
    },
    removeTube: (i: number) => update((x) => ({ ...x, soly: { ...x.soly, runs: x.soly.runs.filter((_, k) => k !== i) }, solyTable: x.solyTable.filter((_, k) => k !== i) }), `remove-run:${i}`),
    /** Called by the ticker (and before reading): crystals appear once the liquid has cooled to the appearance temperature. */
    tick: (t = now()) => {
      const seg = segRef.current;
      if (task === 'SOLY' && seg) {
        if (seg.mode === 'heat') {
          const tb = openTube(ref.current);
          const sat = tb ? solySatTemp(v, ((ref.current.soly.mass ?? 0) * 100) / Math.max(0.5, tb.r.water - lostNow(t))) : null;
          if (sat !== null && tubeTemp(t) > sat + 0.5) dissolvedRef.current = true;
        } else if (!appearRef.current && openTube(ref.current)) {
          const app = appearTemp();
          if (app !== null && tubeTemp(t) <= app) {
            // when exactly: solve on the current segment
            const A = seg.T0 - v.room;
            const tau = v.coolTau * (seg.stirred ? 1 : 1.25);
            const when = A > 0 && app > v.room ? seg.at + -tau * Math.log((app - v.room) / A) * 1000 : t;
            appearRef.current = { at: Math.min(t, Math.max(seg.at, when)), stirred: stirRef.current };
          }
        }
      }
    },
  };
  // the ticker: crystals, re-renders while something is live, and the time-lapse (eased back near what matters)
  const live = !readOnly && (cupLive() || (task === 'SOLY' && !!segRef.current && !!openTube(state)) || !!thRef.current.where);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      o.tick();
      if (!givenClock) {
        let r = speed;
        if (task === 'SOLY') {
          const app = appearTemp();
          if (segRef.current?.mode === 'cool' && app !== null && (tubeTemp() - app < 3 || appearRef.current)) r = 1;
          if (!segRef.current) r = 1;
        } else if (!cupLive() || tMix() < 60) r = 1;
        clock.setRate(r);
      }
      bump();
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, speed, givenClock, task]);
  return o;
}
export type Energetics = ReturnType<typeof useEnergetics>;

/** Re-renders while something is live (panels and docks). */
export function useLive(on: boolean, ms = 100) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(tick, ms);
    return () => clearInterval(id);
  }, [on, ms]);
}

/** Read to the nearest 0.5 °C, as a student would. */
export const halfDegree = (x: number) => (Math.round(x * 2) / 2).toFixed(1);
