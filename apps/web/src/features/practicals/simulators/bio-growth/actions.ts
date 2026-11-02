import {
  GERM_DAYS_MAX,
  GERM_MAX_SEEDS,
  GERM_SOWN,
  GERM_TUBES,
  GROWTH_PRACTICAL_TASKS,
  RESP_HOURS_MAX,
  RESP_MAX_READS,
  SEED_DAYS_MAX,
  TROP_DAYS_MAX,
  bioGrowthVariant,
  emptyBioGrowthState,
  germKind,
  roundDp,
  type BioGrowthState,
  type BioGrowthVariant,
  type GermTube,
  type GrowthTask,
  type RespFill,
  type RespFlask,
  type RespIndicator,
  type SeedKind,
  type SeedRef,
  type TropCtrl,
} from '@aischool/shared';
import { useEffect, useMemo, useRef } from 'react';
import type { SimulatorProps } from '../types';

/**
 * The growth bench's actions, shared by the 2D and the 3D lab so both produce
 * exactly the same `BioGrowthState`. Every change goes through `update`, which
 * appends to the action log. Set-ups are done before the time-lapse starts:
 * once a day has passed the tubes, flasks and pots are left alone.
 */

export type GrowthUpdate = (fn: (s: BioGrowthState) => BioGrowthState, log?: string) => void;
export const lessonTask = (practicalId?: string): GrowthTask => (practicalId ? GROWTH_PRACTICAL_TASKS[practicalId] : undefined) ?? 'GERM';
export const tubeName = (k: number) => `tube ${GERM_TUBES[k]}`;

/** What to do next (practice mode only). */
export function nextHint(_v: BioGrowthVariant, s: BioGrowthState): string {
  const task = s.task ?? 'GERM';
  if (task === 'GERM') {
    const w = s.germ;
    if (!w.batch) return 'Sort the seeds: choose ones of the same kind, size and age, and leave out damaged ones.';
    if (w.day === 0) {
      const kinds = w.tubes.map(germKind);
      if (!kinds.includes('CONTROL')) return 'Tube A: moist cotton wool, 10 seeds, at room temperature (the control).';
      if (!kinds.includes('DRY')) return 'Tube B: dry cotton wool and 10 seeds (no water).';
      if (!kinds.includes('NOOXY')) return 'Tube C: 10 seeds in boiled, cooled water, covered at once with a layer of oil (no oxygen).';
      if (!kinds.includes('COLD')) return 'Tube D: moist cotton wool and 10 seeds, then into the refrigerator (cold).';
      if (!w.tubes.every((t) => t.label)) return 'Label every tube A, B, C and D.';
      return 'Leave the tubes for a day (time-lapse), then inspect them.';
    }
    if (!w.looks.includes(w.day)) return `Day ${w.day}: inspect the tubes and count the seeds whose radicle shows.`;
    if (w.day < 5) return 'Leave them another day and count again.';
    if (!w.rows.every((r) => r.pct.trim())) return 'Work out the % germination of each tube and name the missing condition.';
    return 'Choose your conclusions and write the precautions and explanation.';
  }
  if (task === 'SEEDLING') {
    const w = s.seedling;
    if (!w.soaked) return 'Soak the cowpea and maize seeds overnight.';
    if (!w.box || !w.jar) return 'Sow some in the box of moist sawdust and some between the blotting paper and the wall of the seed jar.';
    if (!w.waters.includes(w.day)) return `Day ${w.day}: water the sawdust and the blotting paper — moist, not waterlogged.`;
    if (w.day > 0 && !w.measures.some((m) => m.day === w.day && m.kind === 'COWPEA')) return 'Measure the cowpea shoot from the seed with the ruler.';
    if (w.day > 0 && !w.measures.some((m) => m.day === w.day && m.kind === 'MAIZE')) return 'Measure the maize shoot from the seed with the ruler.';
    if ((w.day === 3 || w.day === 7) && !w.draws.includes(w.day)) return `Draw the seedlings now (day ${w.day}).`;
    if (w.day < 9) return 'Leave the seedlings a day (time-lapse).';
    return 'Plot the graph, work out the growth rates between day 4 and day 8 and complete the table.';
  }
  if (task === 'RESP') {
    const w = s.resp;
    if (!w.soaked) return 'Soak the seeds for 24 hours so they start germinating.';
    if (!w.boiled) return 'Boil half the seeds for 10 minutes and cool them.';
    if (!w.disLive || !w.disBoiled) return 'Rinse both batches in dilute disinfectant to kill microorganisms.';
    if (!w.A.seeds) return 'Fill flask A with the germinating seeds.';
    if (!w.B.seeds) return 'Fill flask B (the control) with the same amount of boiled seeds.';
    if (!w.A.thermo || !w.B.thermo) return 'Push a thermometer into the seeds of each flask.';
    if (!w.A.plug || !w.B.plug) return 'Plug each flask loosely with cotton wool.';
    if (!w.A.inverted || !w.B.inverted) return 'Invert both flasks in their clamps.';
    if (w.co2.at === null) return 'In a separate set-up, connect a flask of germinating seeds to a tube of lime water.';
    if (!w.reads.length) return 'Read both thermometers now (the start).';
    if (w.reads.length < 4) return 'Leave the flasks a day (time-lapse), then read both thermometers.';
    return 'Work out the rises, the mean rise per day and the difference; choose the conclusions.';
  }
  const w = s.trop;
  if (!w.box) return 'Put a pot of seedlings in the light-proof box.';
  if (!w.slit) return 'Turn the box so its slit faces the lamp.';
  if (!w.taped) return 'Tape over any gaps so light enters only through the slit.';
  if (!w.lamp) return 'Switch on the lamp beside the slit.';
  if (!w.ctrl) return 'Put the control pot on the clinostat (or in uniform light).';
  if (!w.pinned) return 'Pin soaked bean seedlings to the cork, radicles pointing in different directions.';
  if (!w.moist) return 'Wet the cotton wool in the gas jar so the seedlings stay moist.';
  if (!w.klinoSet) return 'Fix a similar set of seedlings on the clinostat.';
  if (!w.klinoOn) return 'Switch the clinostat on.';
  if (w.day === 0) return 'Leave the experiments for a day (time-lapse).';
  if (!w.waters.includes(w.day)) return 'Keep the seedlings moist: water them.';
  if (!w.measures.some((m) => m.day === w.day)) return 'Measure the angle of the test and control shoots with the protractor.';
  if (w.day < 3) return 'Leave them another day.';
  if (w.countAt === null) return 'Count the radicles on the cork that are growing downwards.';
  return 'Work out the rate and the percentage, choose the sketches and conclusions.';
}

/** `variant`: use these values instead of the seed's (the 3D lab's demo and sandbox). */
export function useGrowth({ seed, state, onChange, readOnly, startedAt, practicalId, variant }: Pick<SimulatorProps<'bio-growth'>, 'seed' | 'state' | 'onChange' | 'readOnly' | 'startedAt' | 'practicalId'> & { variant?: BioGrowthVariant }) {
  const task: GrowthTask = state.task ?? lessonTask(practicalId);
  const v = useMemo(() => variant ?? bioGrowthVariant(seed, task), [variant, seed, task]);
  const t0 = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const ref = useRef(state);
  ref.current = state;

  const update: GrowthUpdate = (fn, log) => {
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
  const chooseTask = (t: GrowthTask) => update((s) => ({ ...emptyBioGrowthState(), log: s.log, task: t }), `task:${t}`);
  const G = () => ref.current.germ;
  const D = () => ref.current.seedling;
  const R = () => ref.current.resp;
  const T = () => ref.current.trop;
  const gw = (fn: (w: BioGrowthState['germ']) => BioGrowthState['germ'], log: string) => update((s) => ({ ...s, germ: fn(s.germ) }), log);
  const dw = (fn: (w: BioGrowthState['seedling']) => BioGrowthState['seedling'], log: string) => update((s) => ({ ...s, seedling: fn(s.seedling) }), log);
  const rw = (fn: (w: BioGrowthState['resp']) => BioGrowthState['resp'], log: string) => update((s) => ({ ...s, resp: fn(s.resp) }), log);
  const tw = (fn: (w: BioGrowthState['trop']) => BioGrowthState['trop'], log: string) => update((s) => ({ ...s, trop: fn(s.trop) }), log);

  // ---------------------------------------------------------------- germination
  const tube = (k: number, ok: (t: GermTube) => boolean, patch: (t: GermTube) => Partial<GermTube>, log: string) => {
    const w = G();
    const t = w.tubes[k];
    if (!t || w.day > 0 || !ok(t)) return false;
    gw((x) => ({ ...x, tubes: x.tubes.map((y, j) => (j === k ? { ...y, ...patch(y) } : y)) }), log);
    return true;
  };
  const germ = {
    batch: (b: 'SORTED' | 'MIXED') => G().day === 0 && G().batch !== b && gw((w) => ({ ...w, batch: b }), `batch:${b}`),
    cotton: (k: number, c: 'MOIST' | 'DRY') => tube(k, (t) => !t.water && t.cotton !== c, () => ({ cotton: c }), `cotton#${k + 1}:${c}`),
    water: (k: number, c: 'BOILED' | 'TAP') => tube(k, (t) => !t.cotton && !t.water, () => ({ water: c }), `water#${k + 1}:${c}`),
    oil: (k: number) => tube(k, (t) => !!t.water && !t.oil, () => ({ oil: true }), `oil#${k + 1}`),
    fridge: (k: number, on: boolean) => tube(k, (t) => t.fridge !== on, () => ({ fridge: on }), `fridge#${k + 1}:${on ? 'in' : 'out'}`),
    /** Counts seeds into a tube: exactly 10, or a rough handful (7–13). */
    sow: (k: number, exact = true) => {
      const w = G();
      if (!w.batch) return false;
      const n = exact ? GERM_SOWN : 7 + ((k * 5 + ref.current.log.length) % 7);
      return tube(k, (t) => t.seeds === 0, () => ({ seeds: Math.min(GERM_MAX_SEEDS, n) }), `sow#${k + 1}:${exact ? 10 : 'handful'}`);
    },
    empty: (k: number) => tube(k, (t) => t.seeds > 0 || !!t.cotton || !!t.water, () => ({ cotton: null, water: null, oil: false, seeds: 0 }), `empty#${k + 1}`),
    label: (k: number) => tube(k, (t) => !t.label, () => ({ label: true }), `label#${k + 1}`),
    wait: () => {
      const w = G();
      if (w.day >= GERM_DAYS_MAX || !w.tubes.some((t) => t.seeds > 0)) return false;
      gw((x) => ({ ...x, day: Math.min(GERM_DAYS_MAX, x.day + 1) }), 'wait:1d');
      return true;
    },
    look: () => {
      const w = G();
      if (w.day < 1 || w.looks.includes(w.day)) return false;
      gw((x) => ({ ...x, looks: [...x.looks, x.day].sort((a, b) => a - b) }), `look:d${w.day}`);
      return true;
    },
  };

  // ---------------------------------------------------------------- seedlings
  const seedling = {
    soak: () => !D().soaked && !D().box && !D().jar && dw((w) => ({ ...w, soaked: true }), 'soak'),
    sow: (where: 'box' | 'jar') => {
      const w = D();
      if (w[where] || w.day > 0) return false;
      dw((x) => ({ ...x, [where]: true, waters: x.waters.includes(0) ? x.waters : [0, ...x.waters] }), `sow:${where}`);
      return true;
    },
    water: () => {
      const w = D();
      if ((!w.box && !w.jar) || w.waters.includes(w.day)) return false;
      dw((x) => ({ ...x, waters: [...x.waters, x.day].sort((a, b) => a - b) }), `water:d${w.day}`);
      return true;
    },
    wait: () => {
      const w = D();
      if ((!w.box && !w.jar) || w.day >= SEED_DAYS_MAX) return false;
      dw((x) => ({ ...x, day: x.day + 1 }), 'wait:1d');
      return true;
    },
    /** Measures one kind's shoot today with the ruler; returns the measure's index or −1. */
    measure: (kind: SeedKind, refPt: SeedRef): number => {
      const w = D();
      if (!w.jar || w.day < 1 || w.measures.some((m) => m.day === w.day && m.kind === kind) || w.measures.length >= 60) return -1;
      dw((x) => ({ ...x, measures: [...x.measures, { day: x.day, kind, ref: refPt }], rows: x.rows.some((r) => r.day === x.day) ? x.rows : [...x.rows, { day: x.day, cow: '', maize: '' }].sort((a, b) => a.day - b.day) }), `measure:${kind}:${refPt}`);
      return w.measures.length;
    },
    draw: () => {
      const w = D();
      if ((!w.box && !w.jar) || w.day < 1 || w.draws.includes(w.day)) return false;
      dw((x) => ({ ...x, draws: [...x.draws, x.day] }), `draw:d${w.day}`);
      return true;
    },
  };

  // ---------------------------------------------------------------- respiration
  const flask = (f: 'A' | 'B', ok: (x: RespFlask, w: BioGrowthState['resp']) => boolean, patch: (x: RespFlask) => Partial<RespFlask>, log: string) => {
    const w = R();
    if (w.startAt !== null && w.clock > w.startAt) return false;
    if (!ok(w[f], w)) return false;
    rw((x) => {
      const nf = { ...x[f], ...patch(x[f]) };
      const nx = { ...x, [f]: nf };
      const ready = (y: RespFlask) => !!y.seeds && y.thermo && !!y.plug;
      return { ...nx, startAt: nx.startAt === null && ready(nx.A) && ready(nx.B) ? nx.clock : nx.startAt };
    }, log);
    return true;
  };
  const resp = {
    soak: () => !R().soaked && rw((w) => ({ ...w, soaked: true }), 'soak'),
    boil: () => R().soaked && !R().boiled && rw((w) => ({ ...w, boiled: true }), 'boil'),
    disinfect: (b: 'LIVE' | 'BOILED') => {
      const w = R();
      if (!w.soaked || (b === 'BOILED' && !w.boiled) || (b === 'LIVE' ? w.disLive : w.disBoiled) || (b === 'LIVE' ? w.A.seeds : w.B.seeds)) return false;
      rw((x) => ({ ...x, ...(b === 'LIVE' ? { disLive: true } : { disBoiled: true }) }), `disinfect:${b}`);
      return true;
    },
    fill: (f: 'A' | 'B', seeds: 'LIVE' | 'BOILED', fill: RespFill) => flask(f, (x, w) => !x.seeds && w.soaked && (seeds === 'LIVE' || w.boiled), () => ({ seeds, fill }), `fill:${f}:${seeds}:${fill}`),
    thermo: (f: 'A' | 'B') => flask(f, (x) => !!x.seeds && !x.thermo, () => ({ thermo: true }), `thermo:${f}`),
    plug: (f: 'A' | 'B', p: 'COTTON' | 'BUNG') => flask(f, (x) => x.thermo && !x.plug, () => ({ plug: p }), `plug:${f}:${p}`),
    invert: (f: 'A' | 'B') => flask(f, (x) => !!x.plug && !x.inverted, () => ({ inverted: true }), `invert:${f}`),
    wait: (h: number) => {
      const w = R();
      if (!w.soaked || w.clock >= RESP_HOURS_MAX) return false;
      rw((x) => ({ ...x, clock: roundDp(Math.min(RESP_HOURS_MAX, x.clock + h), 2) }), `wait:${h}h`);
      return true;
    },
    /** Reads both thermometers now; returns the read's index or −1. */
    read: (): number => {
      const w = R();
      if (w.startAt === null || !w.A.thermo || !w.B.thermo || w.reads.length >= RESP_MAX_READS || w.reads.includes(w.clock)) return -1;
      rw((x) => ({ ...x, reads: [...x.reads, x.clock], rows: [...x.rows, { a: '', b: '' }] }), `read#${w.reads.length + 1}`);
      return w.reads.length;
    },
    co2: (ind: RespIndicator) => {
      const w = R();
      if (!w.soaked || w.co2.at !== null) return false;
      rw((x) => ({ ...x, co2: { ...x.co2, ind, at: x.clock } }), `co2:${ind}`);
      return true;
    },
    co2Ctrl: () => {
      const w = R();
      if (w.co2.at === null || w.co2.ctrl || !w.boiled) return false;
      rw((x) => ({ ...x, co2: { ...x.co2, ctrl: true } }), 'co2:ctrl');
      return true;
    },
    co2Look: () => {
      const w = R();
      if (w.co2.at === null) return false;
      rw((x) => ({ ...x, co2: { ...x.co2, look: x.clock } }), 'co2:look');
      return true;
    },
  };

  // ---------------------------------------------------------------- tropisms
  const setT = (ok: (w: BioGrowthState['trop']) => boolean, patch: (w: BioGrowthState['trop']) => Partial<BioGrowthState['trop']>, log: string) => {
    const w = T();
    if (w.day > 0 || !ok(w)) return false;
    tw((x) => ({ ...x, ...patch(x) }), log);
    return true;
  };
  const trop = {
    box: () => setT((w) => !w.box, () => ({ box: true }), 'box'),
    slit: (d: 'LAMP' | 'AWAY') => setT((w) => w.box && w.slit !== d, () => ({ slit: d }), `slit:${d}`),
    tape: () => setT((w) => w.box && !w.taped, () => ({ taped: true }), 'tape'),
    lamp: (on: boolean) => setT((w) => w.lamp !== on, () => ({ lamp: on }), `lamp:${on ? 'on' : 'off'}`),
    ctrl: (c: TropCtrl) => setT((w) => w.ctrl !== c, () => ({ ctrl: c }), `ctrl:${c}`),
    pin: () => setT((w) => !w.pinned, (w) => ({ pinned: true, waters: w.moist && !w.waters.includes(0) ? [0, ...w.waters] : w.waters }), 'pin'),
    moisten: () => setT((w) => !w.moist, (w) => ({ moist: true, waters: w.waters.includes(0) ? w.waters : [0, ...w.waters] }), 'moisten'),
    klinoSet: () => setT((w) => !w.klinoSet, () => ({ klinoSet: true }), 'klino:set'),
    klino: (on: boolean) => setT((w) => w.klinoOn !== on, () => ({ klinoOn: on }), `klino:${on ? 'on' : 'off'}`),
    water: () => {
      const w = T();
      if ((!w.box && !w.pinned) || w.waters.includes(w.day)) return false;
      tw((x) => ({ ...x, waters: [...x.waters, x.day].sort((a, b) => a - b) }), `water:d${w.day}`);
      return true;
    },
    wait: () => {
      const w = T();
      if ((!w.box && !w.pinned) || w.day >= TROP_DAYS_MAX) return false;
      tw((x) => ({ ...x, day: x.day + 1 }), 'wait:1d');
      return true;
    },
    /** Measures a shoot's curvature with the protractor today; returns the measure's index or −1. */
    measure: (pot: 'TEST' | 'CTRL'): number => {
      const w = T();
      if (w.day < 1 || (pot === 'TEST' ? !w.box : !w.ctrl) || w.measures.some((m) => m.day === w.day && m.pot === pot) || w.measures.length >= 40) return -1;
      tw((x) => ({ ...x, measures: [...x.measures, { day: x.day, pot }], rows: x.rows.some((r) => r.day === x.day) ? x.rows : [...x.rows, { day: x.day, test: '', ctrl: '' }].sort((a, b) => a.day - b.day) }), `measure:${pot}`);
      return w.measures.length;
    },
    count: () => {
      const w = T();
      if (!w.pinned || w.day < 1 || w.countAt === w.day) return false;
      tw((x) => ({ ...x, countAt: x.day }), `count:d${w.day}`);
      return true;
    },
  };

  return { v, task, ref, update, note, chooseTask, germ, seedling, resp, trop };
}
export type Growth = ReturnType<typeof useGrowth>;
