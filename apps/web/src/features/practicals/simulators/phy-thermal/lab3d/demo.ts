import { emptyPhyThermalState, phyFit, THERM_HEAT_TIME, THERM_TIMES, thermExpansion, thermIdealExpansion, type PhyThermalState, type PhyThermalVariant, type ThermInstrument, type ThermTask } from '@aischool/shared';
import type { DemoBeat, DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import type { Spot } from '../../../lab3d-kit/store';
import type { Clock, Thermal } from '../actions';
import { useBench } from './bench-store';
import { makeOps, type Ops } from './lab-actions';
import { NEEDED, PLACEABLE } from './scene-state';
import { AMMETER, BALANCE, BATH, CAL, CAN, JACKET, MICRO, RULE, VOLTMETER } from './views';

/**
 * Mr Bayo's demonstration: the whole practical on his own bench (a demo seed
 * that is never the student's, so none of their answers shows) and his own
 * in-memory state, through the same operations as the student's bench and on
 * the same physics. The waits (the can coming to the boil and the rod
 * expanding, the bath heating, the heater's five minutes) skip ahead on the
 * demo's own clock; he reads every instrument at eye level and writes the
 * values.
 */

export const DEMO_SEED = 37;
export const demoSeed = (studentSeed: number) => (studentSeed === DEMO_SEED ? DEMO_SEED + 1 : DEMO_SEED);
export const demoEmpty = (task: ThermTask): PhyThermalState => ({ ...emptyPhyThermalState(), task, log: [{ t: 0, a: `task:${task}` }] });

export interface DemoCtx {
  o: Thermal;
  v: PhyThermalVariant;
  s: () => PhyThermalState;
  ops: () => Ops;
  clock: Clock;
}
type Beat = DemoBeat<DemoCtx>;
export type DemoStep = KitDemoStep<DemoCtx>;

const f1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1);
const f2 = (x: number) => (Math.round(x * 100) / 100).toFixed(2);
const bench = (spot: Spot) => ({ mode: 'bench' as const, spot });
const AT_BENCH = bench({ target: [0, 0.2, 0.12], dist: 1.8, pitch: 0.42 });
const AT_JACKET = bench({ target: [(JACKET.x0 + JACKET.x1) / 2, 0.15, JACKET.z], dist: 1.0, pitch: 0.3 });
const AT_MICRO = bench({ target: [MICRO.x + 0.05, MICRO.y, MICRO.z], dist: 0.38, pitch: 0.25 });
const AT_CAN = bench({ target: [CAN.x, 0.25, CAN.z], dist: 0.8, pitch: 0.25 });
const AT_RULE = bench({ target: [RULE.x + 0.45, 0.01, RULE.z], dist: 0.85, pitch: 0.7 });
const AT_BATH = bench({ target: [BATH.x, 0.3, BATH.z], dist: 0.6, pitch: 0.12 });
const AT_CAL = bench({ target: [CAL.x, 0.14, CAL.z], dist: 0.6, pitch: 0.4 });
const AT_METERS = bench({ target: [(AMMETER.x + VOLTMETER.x) / 2, 0.08, -0.05], dist: 0.9, pitch: 0.35 });
const AT_BALANCE = bench({ target: [BALANCE.x, 0.06, BALANCE.z], dist: 0.55, pitch: 0.6 });
const readView = { mode: 'read' as const, spot: null, eye: 0 };
const see = (k: ThermInstrument, at = 50): Beat => ({ at, run: () => useBench.setState({ instr: k }) });

/** Read instrument `k` now and return what it shows. */
function take(c: DemoCtx, k: ThermInstrument): number {
  const x = c.o.shows(k);
  c.ops().take(k);
  return x;
}
/** Skip the demo clock forward until `until()` holds (at most `max` s, in `step` s). */
function skipUntil(c: DemoCtx, until: () => boolean, max: number, step = 2) {
  for (let t = 0; t < max && !until(); t += step) c.clock.shift(step * 1000);
}
const goggles: Beat = { at: 200, run: (c) => c.o.note('safety:goggles') };
const collect = (task: ThermTask): Beat[] => NEEDED[task].map((id, n) => ({ at: 300 + n * 250, run: (c: DemoCtx) => c.o.note(`collect:${id}`) }));
const placeAll = (task: ThermTask, skip: string[] = [], from = 400, gap = 900): Beat[] => PLACEABLE[task].filter((id) => !skip.includes(id)).map((id, n): Beat => ({ at: from + n * gap, run: (c) => c.ops().place(id) }));

// ------------------------------------------------------------------ expansion

function expansionScript(prec: string): DemoStep[] {
  return [
    { id: 'intro', title: 'The apparatus', say: () => 'Today: the linear expansivity of a metal rod. On my bench: the steam jacket with a micrometer screw gauge at one end, the rod, a steam can on a tripod over a Bunsen burner, rubber tubing, a thermometer, a metre rule and a beaker for the steam outlet.', ms: 8500, view: AT_BENCH, point: 'jacket', beats: [goggles, ...collect('EXPANSION')] },
    { id: 'setup', title: 'Setting up', say: () => 'Tripod and gauze over the Bunsen, the can of water on top, the jacket on the bench with its outlet over the beaker, and the tubing from the can to the jacket.', ms: 6500, view: AT_JACKET, point: 'jacket', beats: placeAll('EXPANSION', ['rod', 'thermometer']) },
    {
      id: 'l0',
      title: 'The length of the rod, l₀',
      say: (c) => `Before it goes in, I measure the rod with the metre rule: one end at the zero, the other at ${f1(c.v.L0)} millimetres — to the nearest millimetre, looking straight down. Then it slides into the jacket against the fixed stop, and the thermometer goes in.`,
      ms: 9000,
      view: AT_RULE,
      point: 'rule',
      panel: 'notebook',
      beats: [
        { at: 1500, run: (c) => c.o.setCell('l0', f1(Math.round(take(c, 'rule') * 2) / 2)) },
        { at: 6000, run: (c) => c.ops().place('rod') },
        { at: 7200, run: (c) => c.ops().place('thermometer') },
      ],
    },
    {
      id: 'cold',
      title: 'θ₁ and the first micrometer reading',
      say: (c) => `The thermometer reads ${f1(c.o.shows('thermo'))} degrees: theta one. I turn the ratchet until it clicks against the rod — never the thimble — and read the sleeve and thimble: ${f2(c.o.shows('micro'))} millimetres. That is r one.`,
      ms: 11000,
      view: readView,
      panel: 'notebook',
      beats: [
        see('thermo'),
        { at: 1500, run: (c) => c.o.setCell('th1', f1(take(c, 'thermo'))) },
        { at: 300, run: (c) => c.ops().ratchet() },
        { at: 5000, run: () => useBench.setState({ instr: 'micro' }) },
        { at: 7000, run: (c) => c.o.setCell('r1', f2(take(c, 'micro'))) },
      ],
    },
    {
      id: 'steam',
      title: 'Back off, then steam',
      say: () => 'I back the micrometer off a few turns so the rod is free to expand, and light the burner under the can. The clock is speeded up: the water boils, steam passes through the jacket and out into the beaker, and the thermometer rises to the steam’s temperature.',
      ms: 10000,
      view: AT_CAN,
      point: 'can',
      beats: [
        { at: 600, run: (c) => c.ops().back() },
        { at: 1500, run: (c) => c.ops().boiler() },
        { at: 2500, run: (c) => c.clock.setRate(40) },
        { at: 9000, run: (c) => (c.clock.setRate(1), skipUntil(c, () => c.o.phys().thJ >= c.v.boil - 0.2, 900)) },
      ],
    },
    {
      id: 'hot',
      title: 'Wait for the rod, then r₂',
      say: () => 'The thermometer is steady, but the rod heats more slowly. I wait several minutes, read theta two, ratchet the micrometer up again and read it. Then I back off, wait another minute and read again: the two readings agree, so the rod has stopped expanding.',
      ms: 14000,
      view: readView,
      panel: 'notebook',
      beats: [
        see('thermo'),
        { at: 300, run: (c) => skipUntil(c, () => thermExpansion(c.v, c.o.phys()) >= 0.997 * thermIdealExpansion(c.v), 1500, 5) },
        { at: 1800, run: (c) => c.o.setCell('th2', f1(take(c, 'thermo'))) },
        { at: 3500, run: (c) => (useBench.setState({ instr: 'micro' }), c.ops().ratchet()) },
        { at: 5500, run: (c) => c.o.setCell('r2', f2(take(c, 'micro'))) },
        { at: 7000, run: (c) => (c.ops().back(), c.clock.shift(60_000)) },
        { at: 9000, run: (c) => c.ops().ratchet() },
        { at: 10500, run: (c) => (c.o.setCell('r2b', f2(take(c, 'micro'))), c.ops().back()) },
        { at: 12500, run: (c) => c.ops().boiler() },
      ],
    },
    {
      id: 'calc',
      title: 'α = e ÷ (l₀ Δθ)',
      say: (c) => `The expansion e is r one minus r two, in millimetres like l nought; the rise is theta two minus theta one. So alpha is about ${c.s().answers.alpha.value || '—'} per kelvin. ${prec}`,
      ms: 11000,
      view: AT_MICRO,
      point: 'book',
      panel: 'calc',
      beats: [
        {
          at: 300,
          run: (c) =>
            c.o.update((x) => {
              const C = x.cells;
              const e = Number(C.r1) - Number(C.r2);
              const d = Number(C.th2) - Number(C.th1);
              const a = e / (Number(C.l0) * d);
              return { ...x, cells: { ...C, e: e.toFixed(2), dth: d.toFixed(1) }, answers: { ...x.answers, alpha: { value: a.toPrecision(3), unit: 'K⁻¹' } }, written: { precautions: prec || 'I waited until the readings were steady. I used the ratchet so the micrometer was not over-tightened.' } };
            }),
        },
      ],
    },
  ];
}

// ------------------------------------------------------------------ Charles

function charlesScript(prec: string): DemoStep[] {
  /** Heat about 15 °C, flame off, stir and wait, then read θ and l into a new row. */
  const step = (c: DemoCtx, target: number) => {
    const ops = c.ops();
    if (target > 0) {
      ops.bunsen();
      skipUntil(c, () => c.o.phys().tw >= target - 1.2, 1500, 1);
      ops.bunsen();
    }
    for (let k = 0; k < 7; k++) (ops.stirOnce(), c.clock.shift(10_000));
    c.clock.shift(15_000);
    const th = take(c, 'thermo');
    c.clock.shift(2000);
    const l = take(c, 'column');
    const key = Math.max(...c.s().rows.map((r) => r.key));
    const T = Number(f1(th)) + 273;
    c.o.setRow(key, 'th', f1(th));
    c.o.setRow(key, 'l', f2(l));
    c.o.setRow(key, 'T', T.toFixed(1));
    c.o.setRow(key, 'lT', (Number(f2(l)) / T).toPrecision(3));
  };
  const temps = [0, 42, 57, 72, 87];
  return [
    { id: 'intro', title: 'The apparatus', say: () => 'Today: Charles’s law. A capillary tube sealed at the bottom, with air trapped below a short thread of concentrated sulphuric acid, tied with a thermometer to a ruler; a large beaker of water on a tripod over a Bunsen burner, a stirrer and a clamp stand.', ms: 8500, view: AT_BENCH, point: 'capillary', beats: [goggles, ...collect('CHARLES')] },
    { id: 'setup', title: 'Into the water', say: () => 'Tripod and gauze over the Bunsen, the beaker of water on top, the stand behind it. I lower the ruler until the whole air column is under the water — any part above the water would stay cooler.', ms: 8000, view: AT_BATH, point: 'capillary', beats: [...placeAll('CHARLES', [], 300, 900), { at: 4500, run: (c) => c.ops().immerse(true) }] },
    {
      id: 'first',
      title: 'The first pair of readings',
      say: () => 'I stir well and wait. Then I read the thermometer, and the length of the air column from the sealed end to the bottom of the acid index, with my eye level with it.',
      ms: 8000,
      view: readView,
      panel: 'notebook',
      beats: [see('column'), { at: 2000, run: (c) => step(c, temps[0]!) }],
    },
    {
      id: 'heat',
      title: 'Heat, remove the flame, stir, wait, read',
      say: () => 'Now I heat the water about fifteen degrees at a time. Each time I remove the flame, stir well and wait for the temperature to be steady — the gauze goes on heating for a little while, and the air in the thin tube lags behind the water. Then θ and l again.',
      ms: 15000,
      view: AT_BATH,
      point: 'th-bath',
      panel: 'notebook',
      beats: temps.slice(1).map((t, n): Beat => ({ at: 1500 + n * 3200, run: (c) => step(c, t + (c.v.room - 28)) })),
    },
    {
      id: 'graph',
      title: 'l against θ, back to l = 0',
      say: () => 'I work out T, theta plus 273, and l over T for each row: it hardly changes. Then I plot l against theta in degrees Celsius, draw the best straight line, and extend it back until l is zero.',
      ms: 9000,
      view: AT_BENCH,
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 2500,
          run: (c) =>
            c.o.update((x) => {
              const pts = x.rows.map((r) => ({ x: Number(r.c.th), y: Number(r.c.l) }));
              const fit = phyFit(pts);
              if (!fit) return x;
              const hi = Math.max(...pts.map((p) => p.x));
              const x0 = -fit.intercept / fit.slope;
              return { ...x, line: { x1: Number(x0.toPrecision(4)), y1: 0, x2: hi, y2: Number((fit.intercept + fit.slope * hi).toPrecision(4)) } };
            }),
        },
      ],
    },
    {
      id: 'calc',
      title: 'Absolute zero',
      say: (c) => `The slope is about ${c.s().answers.slope.value || '—'} centimetres per kelvin, and the line meets l equals zero at about ${c.s().answers.zero.value || '—'} degrees Celsius: absolute zero. The volume of a fixed mass of gas at constant pressure is proportional to its absolute temperature. ${prec}`,
      ms: 12000,
      view: AT_BENCH,
      point: 'book',
      panel: 'calc',
      beats: [
        {
          at: 300,
          run: (c) =>
            c.o.update((x) => {
              const pts = x.rows.map((r) => ({ x: Number(r.c.th), y: Number(r.c.l) }));
              const fit = phyFit(pts);
              if (!fit) return x;
              const lts = x.rows.map((r) => Number(r.c.l) / (Number(r.c.th) + 273));
              return { ...x, answers: { ...x.answers, slope: { value: fit.slope.toPrecision(3), unit: 'cm K⁻¹' }, zero: { value: (-fit.intercept / fit.slope).toFixed(0), unit: '°C' }, ratio: { value: (lts.reduce((a, b) => a + b, 0) / lts.length).toPrecision(3), unit: 'cm K⁻¹' } }, written: { precautions: prec || 'I removed the flame, stirred and waited for a steady temperature before each reading. The whole air column was under the water.' } };
            }),
        },
      ],
    },
  ];
}

// ------------------------------------------------------------------ electrical heating

function electricScript(prec: string): DemoStep[] {
  let k = 0;
  /** Skip to the next 60 s mark on the stopwatch and read the thermometer into the table. */
  const mark = (c: DemoCtx) => {
    if (k >= THERM_TIMES.length) return;
    const t = THERM_TIMES[k]!;
    const w = c.o.watchTime();
    if (t > w) c.clock.shift((t - w) * 1000);
    c.o.setRow(t, 'th', f1(take(c, 'thermo')));
    if (k === 0) {
      c.clock.shift(20_000);
      c.o.setCell('V', f1(take(c, 'voltmeter')));
      c.o.setCell('I', f2(take(c, 'ammeter')));
    }
    k++;
  };
  return [
    { id: 'intro', title: 'The apparatus', say: () => 'Today: the specific heat capacity of water by electrical heating. A 12 volt immersion heater, a 12 volt supply, an ammeter and a voltmeter, a copper calorimeter with its lagging and lid, a thermometer, a stopwatch and an electronic balance.', ms: 8500, view: AT_BENCH, point: 'cal', beats: [...collect('ELECTRIC'), ...placeAll('ELECTRIC', [], 3400)] },
    {
      id: 'mass',
      title: 'The mass of water',
      say: (c) => `I weigh the empty calorimeter and stirrer, pour in about two hundred grams of water and weigh it again. The difference is the mass of water: ${c.s().cells.m || 'about 200'} grams.`,
      ms: 10000,
      view: AT_BALANCE,
      point: 'balance',
      panel: 'notebook',
      beats: [
        { at: 500, run: (c) => c.ops().pan() },
        { at: 2000, run: (c) => c.o.setCell('mc', f1(take(c, 'balance'))) },
        { at: 3200, run: (c) => c.ops().pan() },
        { at: 3800, run: (c) => c.ops().pour() },
        { at: 4800, run: (c) => c.ops().pan() },
        { at: 6400, run: (c) => (c.o.setCell('mcw', f1(take(c, 'balance'))), c.o.setCell('m', (Number(c.s().cells.mcw) - Number(c.s().cells.mc)).toFixed(1))) },
        { at: 8000, run: (c) => c.ops().pan() },
      ],
    },
    {
      id: 'setup',
      title: 'Lagged, heater in, wired up',
      say: () => 'The calorimeter goes into its lagging. The heater goes right under the water before anything is switched on, then the lid. The ammeter is in series with the heater, the voltmeter across the heater alone.',
      ms: 9000,
      view: AT_CAL,
      point: 'heater',
      beats: [
        { at: 500, run: (c) => c.ops().lag() },
        { at: 1800, run: (c) => c.ops().heater() },
        { at: 3000, run: (c) => c.ops().lid() },
        { at: 4500, run: (c) => c.ops().wire('ok') },
        { at: 6000, run: (c) => c.ops().stir() },
      ],
    },
    {
      id: 'on',
      title: 'θ₀, then switch on',
      say: (c) => `I stir and read the starting temperature: ${f1(c.o.shows('thermo'))} degrees. Then I switch on and start the stopwatch at the same moment, and keep stirring. The voltmeter and ammeter stay steady.`,
      ms: 10000,
      view: readView,
      panel: 'notebook',
      beats: [
        see('thermo'),
        { at: 1500, run: (c) => ((k = 0), c.o.setCell('th0', f1(take(c, 'thermo')))) },
        { at: 3500, run: (c) => c.ops().switchOn() },
        { at: 4000, run: mark },
        { at: 6000, run: () => useBench.setState({ instr: 'voltmeter' }) },
      ],
    },
    {
      id: 'heating',
      title: 'Every 60 seconds',
      say: () => 'Every sixty seconds I read the thermometer and write it in the table. The temperature rises steadily.',
      ms: 9000,
      view: AT_CAL,
      point: 'th-cal',
      panel: 'notebook',
      beats: Array.from({ length: THERM_TIMES.length - 1 }, (_, n): Beat => ({ at: 800 + n * 1500, run: mark })),
    },
    {
      id: 'off',
      title: 'Switch off at 300 s; the highest temperature',
      say: () => `At ${THERM_HEAT_TIME} seconds I switch off and note the time. I keep stirring: the heater is still hotter than the water, so the temperature creeps up a little more. I record the highest reading.`,
      ms: 10000,
      view: AT_METERS,
      point: 'supply',
      panel: 'notebook',
      beats: [
        {
          at: 500,
          run: (c) => {
            const w = c.o.watchTime();
            if (w < THERM_HEAT_TIME) c.clock.shift((THERM_HEAT_TIME - w) * 1000);
            c.ops().switchOff();
            c.o.setCell('t', take(c, 'watch').toFixed(0));
          },
        },
        {
          at: 3000,
          run: (c) => {
            let peak = -Infinity;
            for (let n = 0; n < 12; n++) {
              c.clock.shift(5000);
              peak = Math.max(peak, take(c, 'thermo'));
            }
            c.o.setCell('thmax', f1(peak));
            c.o.setCell('dth', (Number(f1(peak)) - Number(c.s().cells.th0)).toFixed(1));
          },
        },
        { at: 8000, run: (c) => c.ops().stir() },
      ],
    },
    {
      id: 'calc',
      title: 'E = VIt = mcΔθ',
      say: (c) => `Energy supplied E is V times I times t, with t in seconds: about ${c.s().answers.energy.value || '—'} joules. Heat gained is m c delta theta with m in kilograms, so c is about ${c.s().answers.c.value || '—'} joules per kilogram per kelvin — a little above 4200, because the calorimeter and heater take some of the heat and a little is lost. ${prec}`,
      ms: 13000,
      view: AT_BENCH,
      point: 'book',
      panel: 'calc',
      beats: [
        {
          at: 300,
          run: (c) =>
            c.o.update((x) => {
              const C = x.cells;
              const V = Number(C.V);
              const I = Number(C.I);
              const t = Number(C.t);
              const E = V * I * t;
              const cc = E / ((Number(C.m) / 1000) * Number(C.dth));
              const pts = x.rows.map((r) => ({ x: r.key, y: Number(r.c.th) }));
              const fit = phyFit(pts);
              const line = fit ? { x1: 0, y1: Number(fit.intercept.toPrecision(4)), x2: 300, y2: Number((fit.intercept + fit.slope * 300).toPrecision(4)) } : null;
              return { ...x, line, answers: { ...x.answers, energy: { value: E.toFixed(0), unit: 'J' }, power: { value: (V * I).toFixed(1), unit: 'W' }, c: { value: cc.toPrecision(3), unit: 'J kg⁻¹ K⁻¹' } }, written: { precautions: prec || 'The calorimeter was lagged and covered. I stirred continuously and recorded the highest temperature.' } };
            }),
        },
      ],
    },
  ];
}

export function demoScript(task: ThermTask, precautions: string[]): DemoStep[] {
  const prec = precautions.slice(0, 2).join(' ');
  const p = prec ? `Precautions: ${prec}` : '';
  const steps = task === 'CHARLES' ? charlesScript(p) : task === 'ELECTRIC' ? electricScript(p) : expansionScript(p);
  // the results are worked out at the end of the step before, so Mr Bayo can say them when the last step starts
  return steps.map((st, i) => (steps[i + 1]?.id === 'calc' ? { ...st, beats: [...st.beats, ...steps[i + 1]!.beats.map((x) => ({ ...x, at: st.ms - 300 }))] } : st));
}

/** The worked calculation shown with the last step (demonstration values). */
export function demoCalculation(s: PhyThermalState): string[] {
  const C = s.cells;
  const a = s.answers;
  if (s.task === 'CHARLES') {
    if (!a.zero.value) return [];
    return [`Slope of l against θ = ${a.slope.value} cm K⁻¹.`, `The line meets l = 0 at θ = ${a.zero.value} °C: absolute zero (−273 °C).`, `l/T ≈ ${a.ratio.value} cm K⁻¹ for every row: V ∝ T.`];
  }
  if (s.task === 'ELECTRIC') {
    if (!a.c.value) return [];
    return [`E = VIt = ${C.V} × ${C.I} × ${C.t} = ${a.energy.value} J; P = VI = ${a.power.value} W.`, `m = ${C.mcw} − ${C.mc} = ${C.m} g = ${(Number(C.m) / 1000).toFixed(4)} kg; Δθ = ${C.thmax} − ${C.th0} = ${C.dth} K.`, `c = E ÷ (m Δθ) = ${a.energy.value} ÷ (${(Number(C.m) / 1000).toFixed(4)} × ${C.dth}) = ${a.c.value} J kg⁻¹ K⁻¹.`];
  }
  if (!a.alpha.value) return [];
  return [`e = r₁ − r₂ = ${C.r1} − ${C.r2} = ${C.e} mm; Δθ = ${C.th2} − ${C.th1} = ${C.dth} K.`, `α = e ÷ (l₀ Δθ) = ${C.e} ÷ (${C.l0} × ${C.dth}) = ${a.alpha.value} K⁻¹.`];
}
export { makeOps };
