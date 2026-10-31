import { emptyPhyHeatState, HEAT_INTERVAL, heatMetal, heatPlateau, heatReading, type HeatField, type HeatTask, type HeatThermo, type PhyHeatState, type PhyHeatVariant } from '@aischool/shared';
import type { DemoBeat, DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import type { Spot } from '../../../lab3d-kit/store';
import type { Clock, Heat } from '../actions';
import { useBench } from './bench-store';
import { makeOps, type Ops } from './lab-actions';
import { NEEDED, PLACEABLE } from './scene-state';
import { BALANCE, BATH, CAL, SPOT } from './views';

/**
 * Mr Bayo's demonstration: the whole practical on his own bench (a demo seed
 * that is never the student's, so none of their answers shows) and his own
 * in-memory state, through the same operations as the student's bench and on
 * the same physics. The waits (the water coming to the boil, the ice melting,
 * the naphthalene cooling) skip ahead on the demo's own clock; he balances the
 * riders, reads every thermometer at eye level and writes the values.
 */

export const DEMO_SEED = 29;
export const demoSeed = (studentSeed: number) => (studentSeed === DEMO_SEED ? DEMO_SEED + 1 : DEMO_SEED);
export const demoEmpty = (task: HeatTask): PhyHeatState => ({ ...emptyPhyHeatState(), task, log: [{ t: 0, a: `task:${task}` }] });

export interface DemoCtx {
  o: Heat;
  v: PhyHeatVariant;
  s: () => PhyHeatState;
  ops: () => Ops;
  clock: Clock;
}
type Beat = DemoBeat<DemoCtx>;
export type DemoStep = KitDemoStep<DemoCtx>;

const r1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1);
const bench = (spot: Spot) => ({ mode: 'bench' as const, spot });
const AT_BENCH = bench({ target: [0.1, 0.2, 0.15], dist: 1.8, pitch: 0.42 });
const AT_BALANCE = bench({ target: [BALANCE.x, 0.08, BALANCE.z], dist: 0.62, pitch: 0.55 });
const AT_BATH = bench({ target: [BATH.x, 0.25, BATH.z], dist: 0.75, pitch: 0.25 });
const AT_CAL = bench({ target: [CAL.x, 0.15, CAL.z], dist: 0.6, pitch: 0.38 });
const AT_BOTH = bench({ target: [(BATH.x + CAL.x) / 2, 0.22, CAL.z], dist: 0.95, pitch: 0.3 });
const AT_ICE = bench({ target: [(SPOT.ice[0] + CAL.x) / 2, 0.1, CAL.z], dist: 0.8, pitch: 0.45 });
const AT_TUBE = bench({ target: [-0.1, 0.3, 0.05], dist: 0.8, pitch: 0.15 });
const readView = { mode: 'read' as const, spot: null, eye: 0 };
/** Which thermometer the eye-level view reads. */
const see = (th: HeatThermo, at = 50): Beat => ({ at, run: () => useBench.setState({ thermo: th }) });
const coolPlateauOf = (rows: { t: string; th: string }[]) => heatPlateau(rows.map((r) => ({ x: Number(r.t), y: Number(r.th) })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));

/** Set the riders to balance what is on the pan, as Mr Bayo does (to 0.1 g). */
function balance(c: DemoCtx) {
  const m = Math.round(c.o.panMass() * 10) / 10;
  c.o.setRiders({ h: Math.floor(m / 100), t: Math.floor((m % 100) / 10), f: Math.round((m % 10) * 10) / 10 });
}
const write = (c: DemoCtx, k: HeatField, value: string) => c.o.update((x) => ({ ...x, table: { ...x.table, [k]: value } }));
/** Read thermometer `th` now and write it in field `k` (or return it). */
function readTo(c: DemoCtx, th: HeatThermo, k?: HeatField): number {
  c.ops().take(th);
  const T = heatReading(c.v, c.o.phys(), th);
  if (k) write(c, k, r1(T));
  return T;
}
/** Skip the demo clock forward until `until(phys)` holds (at most `max` s, in `step` s). */
function skipUntil(c: DemoCtx, until: () => boolean, max: number, step = 2) {
  for (let t = 0; t < max && !until(); t += step) c.clock.shift(step * 1000);
}
const goggles: Beat = { at: 200, run: (c) => c.o.note('safety:goggles') };
const collect = (task: HeatTask): Beat[] => NEEDED[task].map((id, n) => ({ at: 300 + n * 300, run: (c: DemoCtx) => c.o.note(`collect:${id}`) }));
const setUp = (task: HeatTask): Beat[] => PLACEABLE[task].map((id, n): Beat => ({ at: 400 + n * 1200, run: (c) => c.ops().place(id) }));

function mixScript(precautions: string[]): DemoStep[] {
  const prec = precautions.slice(0, 2).join(' ');
  let peak = -Infinity;
  return [
    { id: 'intro', title: 'The apparatus', say: () => 'Today: the specific heat capacity of a metal by the method of mixtures. On my bench: a copper calorimeter with its stirrer, lid and lagging, two thermometers, a beam balance, a beaker of water on a tripod over a Bunsen burner, and the metal block on a thread.', ms: 8500, view: AT_BENCH, point: 'cal', beats: [goggles, ...collect('MIX')] },
    { id: 'setup', title: 'Setting up', say: () => 'Tripod and gauze over the Bunsen, the beaker of water on the gauze, one thermometer in the beaker and one in the calorimeter.', ms: 6000, view: AT_BOTH, point: 'bath', beats: setUp('MIX') },
    {
      id: 'mc',
      title: 'Weighing the calorimeter: m_c',
      say: () => 'I put the empty calorimeter with its stirrer on the pan and slide the riders — hundreds, tens, then the front rider — until the pointer is on zero. I add up the three beams.',
      ms: 8500,
      view: AT_BALANCE,
      point: 'balance',
      panel: 'notebook',
      beats: [
        { at: 500, run: (c) => c.ops().pan('cal') },
        { at: 2500, run: (c) => balance(c) },
        { at: 5500, run: (c) => (c.ops().weigh(), write(c, 'mc', r1(c.o.panMass()))) },
      ],
    },
    {
      id: 'm1',
      title: 'Water, then the block',
      say: () => 'I fill the calorimeter two-thirds with water and weigh it again: m one. The difference is the mass of water. Then I weigh the block, dry, before heating it.',
      ms: 10000,
      view: AT_BALANCE,
      point: 'balance',
      panel: 'notebook',
      beats: [
        { at: 400, run: (c) => c.ops().pan(null) },
        { at: 1000, run: (c) => c.ops().fill(2) },
        { at: 1600, run: (c) => c.ops().pan('cal') },
        { at: 3000, run: (c) => balance(c) },
        { at: 4200, run: (c) => (c.ops().weigh(), write(c, 'm1', r1(c.o.panMass())), write(c, 'mw', (Number(c.s().table.m1) - Number(c.s().table.mc)).toFixed(1))) },
        { at: 5200, run: (c) => c.ops().pan('block') },
        { at: 6800, run: (c) => balance(c) },
        { at: 8200, run: (c) => (c.ops().weigh(), write(c, 'mb', r1(c.o.panMass()))) },
        { at: 9300, run: (c) => c.ops().pan(null) },
      ],
    },
    {
      id: 'heat',
      title: 'Heating the block',
      say: () => 'The calorimeter goes into its lagging. I light the Bunsen and hang the block by its thread in the water, completely covered. The clock is speeded up while the water comes to the boil — then the block stays in the boiling water for several minutes.',
      ms: 10000,
      view: AT_BATH,
      point: 'block',
      beats: [
        { at: 400, run: (c) => c.ops().lag() },
        { at: 1200, run: (c) => c.ops().bunsen() },
        { at: 2200, run: (c) => c.ops().toBath() },
        { at: 3500, run: (c) => c.clock.setRate(40) },
        { at: 9000, run: (c) => (c.clock.setRate(1), skipUntil(c, () => c.o.phys().bath >= c.v.boil - 0.05, 900), c.clock.shift(150_000)) },
      ],
    },
    {
      id: 'temps',
      title: 'θ₂ and θ₁',
      say: (c) => `I stir the calorimeter water and read it at eye level: ${r1(heatReading(c.v, c.o.phys(), 'cal'))} degrees — that is theta two. The water in the beaker is boiling at ${r1(heatReading(c.v, c.o.phys(), 'bath'))}: the block is at that temperature, theta one.`,
      ms: 10000,
      view: readView,
      panel: 'notebook',
      beats: [
        see('cal'),
        { at: 2000, run: (c) => readTo(c, 'cal', 'th2') },
        { at: 5500, run: () => useBench.setState({ thermo: 'bath' }) },
        { at: 7000, run: (c) => readTo(c, 'bath', 'th1') },
      ],
    },
    {
      id: 'transfer',
      title: 'The transfer: quick and gentle',
      say: () => 'Now quickly: I lift the block out by its thread and lower it gently into the calorimeter — no splashing — put the lid on at once and stir.',
      ms: 7000,
      view: AT_BOTH,
      point: 'cal',
      beats: [
        { at: 1200, run: (c) => c.ops().lift() },
        { at: 2400, run: (c) => c.ops().lower(true) },
        { at: 3200, run: (c) => (c.ops().lid(), c.ops().stir()) },
      ],
    },
    {
      id: 'rise',
      title: 'The highest steady temperature',
      say: () => 'The temperature rises quickly, then steadies. I keep stirring and read it every few seconds: the highest steady reading is theta three.',
      ms: 9000,
      view: readView,
      panel: 'notebook',
      beats: [
        see('cal'),
        { at: 100, run: () => void (peak = -Infinity) },
        ...Array.from({ length: 8 }, (_, k): Beat => ({ at: 600 + k * 1000, run: (c) => (c.clock.shift(10_000), (peak = Math.max(peak, readTo(c, 'cal'))), write(c, 'th3', r1(peak))) })),
      ],
    },
    {
      id: 'calc',
      title: 'Heat lost = heat gained',
      say: (c) => {
        const st = c.s();
        return `Heat gained by the water is m w times 4200 times theta three minus theta two; by the calorimeter, m c times 400 times the same rise. The block lost m c theta one minus theta three. So c is about ${st.answers.result.value || '—'} joules per kilogram per kelvin — close to ${heatMetal(c.v).name}. ${prec ? `Precautions: ${prec}` : ''}`;
      },
      ms: 12000,
      view: AT_CAL,
      point: 'book',
      panel: 'calc',
      beats: [
        {
          at: 300,
          run: (c) =>
            c.o.update((x) => {
              const T = x.table;
              const dT = Number(T.th3) - Number(T.th2);
              const q1 = (Number(T.mw) / 1000) * 4200 * dT;
              const q2 = (Number(T.mc) / 1000) * 400 * dT;
              const cc = (q1 + q2) / ((Number(T.mb) / 1000) * (Number(T.th1) - Number(T.th3)));
              return { ...x, answers: { q1: { value: q1.toFixed(0), unit: 'J' }, q2: { value: q2.toFixed(0), unit: 'J' }, result: { value: cc.toFixed(0), unit: 'J kg⁻¹ K⁻¹' } }, written: { precautions: prec || 'The calorimeter was lagged and covered. The block was transferred quickly without splashing.' } };
            }),
        },
        { at: 1000, run: (c) => (c.ops().stir(), c.ops().bunsen()) },
      ],
    },
  ];
}

function latentScript(precautions: string[]): DemoStep[] {
  const prec = precautions.slice(0, 2).join(' ');
  let low = Infinity;
  /** Add one dried piece if, once all the ice in has melted, the water would still finish above the target. */
  const maybeIce = (c: DemoCtx) => {
    const st = c.s();
    const room = Number(st.table.room) || c.v.room;
    const th1 = Number(st.table.th1) || 40;
    const target = room - (th1 - room);
    const p = c.o.phys();
    const left = p.ice.reduce((a, x) => a + x.m, 0);
    const C = p.mw * 4186 + c.v.calMass * c.v.calC;
    const fin = (C * p.tw - left * 3.34e5) / (C + left * 4186);
    if (fin > target + 1.5) c.ops().addIce();
    c.clock.shift(30_000);
  };
  return [
    { id: 'intro', title: 'The apparatus', say: () => 'Today: the specific latent heat of fusion of ice. A lagged copper calorimeter with its stirrer, a thermometer, a beam balance, a flask of warm water, a beaker of melting ice and blotting paper.', ms: 8000, view: AT_BENCH, point: 'cal', beats: collect('LATENT') },
    { id: 'setup', title: 'Thermometers', say: () => 'One thermometer in the calorimeter, one on the bench in the air for the room temperature.', ms: 4500, view: AT_CAL, point: 'cal', beats: setUp('LATENT') },
    {
      id: 'weigh',
      title: 'm_c and m₁',
      say: () => 'I weigh the empty calorimeter and stirrer, pour in warm water about ten degrees above room temperature until it is two-thirds full, and weigh it again.',
      ms: 10000,
      view: AT_BALANCE,
      point: 'balance',
      panel: 'notebook',
      beats: [
        { at: 400, run: (c) => c.ops().pan('cal') },
        { at: 1800, run: (c) => balance(c) },
        { at: 3000, run: (c) => (c.ops().weigh(), write(c, 'mc', r1(c.o.panMass()))) },
        { at: 4000, run: (c) => c.ops().pan(null) },
        { at: 4600, run: (c) => c.ops().warm(40) },
        { at: 5400, run: (c) => c.ops().pan('cal') },
        { at: 7000, run: (c) => balance(c) },
        { at: 8300, run: (c) => (c.ops().weigh(), write(c, 'm1', r1(c.o.panMass())), write(c, 'mw', (Number(c.s().table.m1) - Number(c.s().table.mc)).toFixed(1))) },
        { at: 9400, run: (c) => c.ops().pan(null) },
      ],
    },
    {
      id: 'temps',
      title: 'Room temperature and θ₁',
      say: (c) => `In its lagging, stirring all the time. The room is at ${r1(heatReading(c.v, c.o.phys(), 'room'))} degrees, the warm water at ${r1(heatReading(c.v, c.o.phys(), 'cal'))}: theta one. I will add ice until it is about as far below room temperature as it started above.`,
      ms: 10000,
      view: readView,
      panel: 'notebook',
      beats: [
        see('room'),
        { at: 300, run: (c) => (c.ops().lag(), c.ops().stir()) },
        { at: 2000, run: (c) => readTo(c, 'room', 'room') },
        { at: 4500, run: () => useBench.setState({ thermo: 'cal' }) },
        { at: 6000, run: (c) => readTo(c, 'cal', 'th1') },
      ],
    },
    {
      id: 'ice',
      title: 'Dried ice, one piece at a time',
      say: () => 'Melting ice is at exactly nought degrees. I dry each piece on blotting paper — water clinging to it would be counted as ice — and add it, stirring. The clock is speeded up while each piece melts.',
      ms: 12000,
      view: AT_ICE,
      point: 'ice',
      beats: Array.from({ length: 10 }, (_, k): Beat => ({ at: 500 + k * 1100, run: maybeIce })),
    },
    {
      id: 'low',
      title: 'The lowest steady temperature',
      say: () => 'When every piece has melted the temperature stops falling. I read it a few times: the lowest steady reading is theta two.',
      ms: 9000,
      view: readView,
      panel: 'notebook',
      beats: [
        see('cal'),
        { at: 200, run: (c) => ((low = Infinity), skipUntil(c, () => c.o.phys().meltedAt !== null, 900)) },
        ...Array.from({ length: 6 }, (_, k): Beat => ({ at: 1000 + k * 1100, run: (c) => (c.clock.shift(8_000), (low = Math.min(low, readTo(c, 'cal'))), write(c, 'th2', r1(low))) })),
      ],
    },
    {
      id: 'm2',
      title: 'The mass of ice',
      say: () => 'I weigh the calorimeter and its contents again. The mass of ice is m two minus m one.',
      ms: 7000,
      view: AT_BALANCE,
      point: 'balance',
      panel: 'notebook',
      beats: [
        { at: 300, run: (c) => c.ops().pan('cal') },
        { at: 2000, run: (c) => balance(c) },
        { at: 3500, run: (c) => (c.ops().weigh(), write(c, 'm2', r1(c.o.panMass())), write(c, 'mi', (Number(c.s().table.m2) - Number(c.s().table.m1)).toFixed(1))) },
        { at: 5500, run: (c) => c.ops().pan(null) },
      ],
    },
    {
      id: 'calc',
      title: 'Heat lost = heat gained',
      say: (c) => `Heat lost by the warm water and the calorimeter equals the heat to melt the ice plus the heat to warm the melted ice from nought to theta two. So L is about ${c.s().answers.result.value || '—'} joules per kilogram — the accepted value is 3.34 times ten to the five. ${prec ? `Precautions: ${prec}` : ''}`,
      ms: 12000,
      view: AT_CAL,
      point: 'book',
      panel: 'calc',
      beats: [
        {
          at: 300,
          run: (c) =>
            c.o.update((x) => {
              const T = x.table;
              const q1 = ((Number(T.mw) / 1000) * 4200 + (Number(T.mc) / 1000) * 400) * (Number(T.th1) - Number(T.th2));
              const q2 = (Number(T.mi) / 1000) * 4200 * Number(T.th2);
              const L = (q1 - q2) / (Number(T.mi) / 1000);
              return { ...x, answers: { q1: { value: q1.toFixed(0), unit: 'J' }, q2: { value: q2.toFixed(0), unit: 'J' }, result: { value: L.toPrecision(3), unit: 'J/kg' } }, written: { precautions: prec || 'The ice was dried with blotting paper. I started as far above room temperature as I finished below it.' } };
            }),
        },
        { at: 900, run: (c) => c.ops().stir() },
      ],
    },
  ];
}

function coolScript(precautions: string[]): DemoStep[] {
  const prec = precautions.slice(0, 2).join(' ');
  let k = 0;
  /** The next 30 s reading: skip to the mark, read, write the row; stop stirring once crystals form. */
  const nextReading = (c: DemoCtx) => {
    const st = c.s();
    const p = c.o.phys();
    if (st.cool.length && p.fs >= 0.999 && heatReading(c.v, p, 'tube') < 65) return;
    if (k > 0) c.clock.shift(HEAT_INTERVAL * 1000);
    const p2 = c.o.phys();
    if (p2.fs > 0.05 && p2.stirring) c.ops().stir();
    const T = heatReading(c.v, c.o.phys(), 'tube');
    c.ops().take('tube');
    const i = c.s().cool.length - 1;
    const t = String(k * HEAT_INTERVAL);
    c.o.update((x) => ({ ...x, cool: x.cool.map((r, j) => (j === i ? { t, th: r1(T) } : r)) }));
    k++;
  };
  return [
    { id: 'intro', title: 'The apparatus', say: () => 'Today: the cooling curve of naphthalene. A boiling tube of powdered naphthalene with a thermometer in it, a beaker of water as a water bath on a tripod over a Bunsen burner, a clamp and stand and a stopwatch.', ms: 8000, view: AT_BENCH, point: 'tube', beats: [goggles, ...collect('COOL')] },
    { id: 'setup', title: 'A water bath', say: () => 'Tripod and gauze over the Bunsen, the beaker of water on top, and the tube clamped on the stand. Naphthalene is never heated over a flame: its vapour catches fire.', ms: 7000, view: AT_TUBE, point: 'bath', beats: setUp('COOL') },
    {
      id: 'melt',
      title: 'Melting it',
      say: () => 'I light the Bunsen and lower the tube into the water bath. The clock is speeded up: the naphthalene melts at about 80 degrees, and I heat it on to about 90.',
      ms: 9000,
      view: AT_TUBE,
      point: 'tube',
      beats: [
        { at: 500, run: (c) => c.ops().bunsen() },
        { at: 1500, run: (c) => c.ops().tubeBath() },
        { at: 2500, run: (c) => c.clock.setRate(40) },
        { at: 8000, run: (c) => (c.clock.setRate(1), skipUntil(c, () => heatReading(c.v, c.o.phys(), 'tube') >= 90.5, 1200, 1)) },
      ],
    },
    {
      id: 'start',
      title: 'Out into the air: start the watch',
      say: () => 'I take the tube out, clamp it in the air and start the stopwatch, reading the thermometer at once. I stir gently with the thermometer while it is liquid.',
      ms: 7000,
      view: readView,
      panel: 'notebook',
      beats: [
        see('tube'),
        { at: 300, run: (c) => ((k = 0), c.ops().tubeAir(), c.ops().bunsen()) },
        { at: 900, run: (c) => (c.ops().watch(), c.ops().stir()) },
        { at: 2500, run: nextReading },
      ],
    },
    {
      id: 'readings',
      title: 'Every 30 seconds',
      say: () => 'Every thirty seconds I read the thermometer at eye level and write it down. The temperature falls, then stays almost constant while the naphthalene freezes — crystals form and I stop stirring — then it falls again as the solid cools.',
      ms: 16000,
      view: AT_TUBE,
      point: 'th-tube',
      panel: 'notebook',
      beats: Array.from({ length: 26 }, (_, n): Beat => ({ at: 400 + n * 580, run: nextReading })),
    },
    {
      id: 'graph',
      title: 'The cooling curve',
      say: () => 'I plot temperature against time and draw a smooth curve through the points — not straight lines from point to point. The flat part is the plateau.',
      ms: 8000,
      view: AT_BENCH,
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 1500,
          run: (c) =>
            c.o.update((x) => {
              const plat = coolPlateauOf(x.cool);
              return { ...x, curve: true, line: plat ? { x1: plat.from, y1: Number(plat.level.toFixed(1)), x2: plat.to, y2: Number(plat.level.toFixed(1)) } : null };
            }),
        },
      ],
    },
    {
      id: 'mp',
      title: 'The melting point',
      say: (c) => `The plateau is at ${c.s().answers.result.value || '—'} degrees: that is the melting point of this naphthalene. Before the plateau it cooled at about ${c.s().answers.q1.value || '—'} degrees per minute. ${prec ? `Precautions: ${prec}` : ''}`,
      ms: 10000,
      view: AT_BENCH,
      point: 'book',
      panel: 'calc',
      beats: [
        {
          at: 300,
          run: (c) =>
            c.o.update((x) => {
              const plat = coolPlateauOf(x.cool);
              const first = x.cool[0];
              if (!plat || !first) return x;
              const rate = (Number(first.th) - plat.level) / (plat.from / 60);
              return { ...x, answers: { ...x.answers, result: { value: plat.level.toFixed(1), unit: '°C' }, q1: { value: rate.toFixed(1), unit: '°C/min' } }, written: { precautions: prec || 'I heated the naphthalene in a water bath. I took the readings at regular 30 s intervals.' } };
            }),
        },
      ],
    },
  ];
}

export function demoScript(task: HeatTask, precautions: string[]): DemoStep[] {
  return task === 'COOL' ? coolScript(precautions) : task === 'LATENT' ? latentScript(precautions) : mixScript(precautions);
}

/** The worked calculation shown with the last step (demonstration values). */
export function demoCalculation(s: PhyHeatState): string[] {
  const T = s.table;
  const a = s.answers;
  if (s.task === 'COOL') {
    if (!a.result.value) return [];
    return [`The plateau (melting point) is at ${a.result.value} °C.`, `Cooling rate before it = (${s.cool[0]?.th ?? '—'} − ${a.result.value}) °C ÷ time to the plateau = ${a.q1.value} °C min⁻¹.`];
  }
  if (!a.result.value) return [];
  if (s.task === 'LATENT')
    return [
      `Heat lost = (${(Number(T.mw) / 1000).toFixed(4)} × 4200 + ${(Number(T.mc) / 1000).toFixed(4)} × 400) × (${T.th1} − ${T.th2}) = ${a.q1.value} J.`,
      `Heat to warm the melted ice = ${(Number(T.mi) / 1000).toFixed(4)} × 4200 × ${T.th2} = ${a.q2.value} J.`,
      `L = (${a.q1.value} − ${a.q2.value}) ÷ ${(Number(T.mi) / 1000).toFixed(4)} = ${a.result.value} J kg⁻¹.`,
    ];
  return [
    `Heat gained by water = ${(Number(T.mw) / 1000).toFixed(4)} × 4200 × (${T.th3} − ${T.th2}) = ${a.q1.value} J.`,
    `Heat gained by calorimeter = ${(Number(T.mc) / 1000).toFixed(4)} × 400 × (${T.th3} − ${T.th2}) = ${a.q2.value} J.`,
    `c = (${a.q1.value} + ${a.q2.value}) ÷ (${(Number(T.mb) / 1000).toFixed(4)} × (${T.th1} − ${T.th3})) = ${a.result.value} J kg⁻¹ K⁻¹.`,
  ];
}
export { makeOps };
