import {
  RATES_CROSS_ACID,
  RATES_CROSS_CARD,
  RATES_CROSS_MADE_UP,
  RATES_INTERVAL,
  RATES_TEMP_CARD,
  RATES_TEMP_THIO,
  emptyChemRatesState,
  labBetween,
  labRandom,
  phyFit,
  ratesCrossVanish,
  ratesMgEnd,
  ratesMgInitialRate,
  ratesMgSyringe,
  ratesMgTheory,
  type ChemRatesState,
  type ChemRatesVariant,
  type RatesTask,
} from '@aischool/shared';
import type { DemoBeat, DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import type { Spot } from '../../../lab3d-kit/store';
import { openCross, openMg, type Clock, type Rates } from '../actions';
import { makeOps, type Ops } from './lab-actions';
import { NEEDED, PLACEABLE } from './scene-state';
import { BATH, FLASK, SYR } from './views';

/**
 * Mrs Ada's demonstration: the whole practical on her own seed (never the
 * student's) and her own in-memory state, through the same operations as the
 * student's bench and on the same kinetics. Long waits run on the demo's own
 * clock in time-lapse; the readings and stop times are taken at exact clock
 * moments (plus a human reaction time), so jumping between steps replays the
 * same results.
 */

export const DEMO_SEED = 7;
export const demoSeed = (studentSeed: number) => (studentSeed === DEMO_SEED ? DEMO_SEED + 1 : DEMO_SEED);
export const demoEmpty = (task: RatesTask): ChemRatesState => ({ ...emptyChemRatesState(), task, log: [{ t: 0, a: `task:${task}` }] });

export interface DemoCtx {
  o: Rates;
  v: ChemRatesVariant;
  s: () => ChemRatesState;
  ops: () => Ops;
  clock: Clock;
  /** Clock times (ms) the beats leave for later beats: when the magnesium / acid went in and the watch started. */
  marks: { start: number; watch: number };
}
type Beat = DemoBeat<DemoCtx>;
export type DemoStep = KitDemoStep<DemoCtx>;

const bench = (spot: Spot) => ({ mode: 'bench' as const, spot });
const AT_BENCH = bench({ target: [0.08, 0.15, 0.02], dist: 1.4, pitch: 0.5 });
const AT_FLASK = bench({ target: [FLASK[0] + 0.08, 0.16, FLASK[2] - 0.05], dist: 0.75, pitch: 0.25 });
const AT_SYRINGE = bench({ target: [SYR.x1 + SYR.L / 2, SYR.y, SYR.z], dist: 0.6, pitch: 0.12 });
const AT_PREP = bench({ target: [-0.4, 0.04, 0.08], dist: 0.75, pitch: 0.55 });
const LOOK_DOWN = bench({ target: [FLASK[0], 0.02, FLASK[2]], dist: 0.42, pitch: 1.38 });
const AT_BATH = bench({ target: [(BATH[0] + FLASK[0]) / 2, 0.08, (BATH[2] + FLASK[2]) / 2], dist: 0.8, pitch: 0.45 });
const half = (x: number) => Math.round(x * 2) / 2;
const react = (v: ChemRatesVariant, k: string) => labBetween(labRandom(v.seed, `demo-${k}`), -0.4, 0.4, 2);

/** Jump the demo clock forward to `at` (when the beat replays instantly or runs a little early). */
const reach = (c: DemoCtx, at: number) => {
  const d = at - c.clock.now();
  if (d > 0) c.clock.shift(d);
};

// ------------------------------------------------------------------ magnesium

/** Drop the magnesium in, the bung after about a second, the watch with it. */
const startMg = (c: DemoCtx) => {
  c.marks.start = c.clock.now();
  c.o.drop(c.marks.start);
  c.marks.watch = c.marks.start + 300;
  c.o.bung(c.marks.start + 900);
  reach(c, c.marks.watch);
  c.o.startWatch(c.marks.watch);
};
/** Read the syringe at the k-th 30 s mark (Mrs Ada is never quite exact) and write it in the table. */
function readAt(c: DemoCtx, run: number, k: number) {
  const at = c.marks.watch + (k * RATES_INTERVAL + react(c.v, `r${run}-${k}`)) * 1000;
  reach(c, at);
  c.o.read(at);
  const m = openMg(c.s());
  if (!m) return;
  const value = half(ratesMgSyringe(c.v, m.r, (at - c.marks.start) / 1000));
  c.o.update((x) => {
    const i = x.mgRows.indexOf(k * RATES_INTERVAL);
    const z = x.mgRows.indexOf(0);
    return { ...x, mg: x.mg.map((r, j) => (j === i ? { ...r, t: String(k * RATES_INTERVAL), [run ? 'v2' : 'v1']: String(value) } : j === z ? { ...r, t: '0', [run ? 'v2' : 'v1']: '0' } : r)) };
  });
}
const mgReadings = (v: ChemRatesVariant, conc: number) => Math.ceil((ratesMgEnd(v, conc, true) + 40) / RATES_INTERVAL);

function mgScript(v: ChemRatesVariant, precautions: string[]): DemoStep[] {
  const prep = (conc: number): Beat[] => [
    { at: 300, run: (c) => c.ops().pour(conc) },
    { at: 1300, run: (c) => c.ops().weigh() },
    { at: 2600, run: (c) => c.ops().clean() },
    { at: 3900, run: (c) => c.ops().zero() },
    { at: 4800, run: (c) => c.ops().check() },
  ];
  const k1 = mgReadings(v, 1);
  const k2 = mgReadings(v, 0.5);
  const prec = precautions.slice(0, 2).join(' ');
  return [
    { id: 'welcome', title: 'Welcome', say: () => `Watch me follow the reaction of magnesium with hydrochloric acid using a gas syringe. These are my own values: ${v.mgMass.toFixed(3)} grams of magnesium. Then it's your turn.`, ms: 6500, view: AT_BENCH, beats: [] },
    { id: 'safety', title: 'Safety first', say: () => 'Goggles on: the acid spits as it fizzes. And no flames anywhere — hydrogen burns.', ms: 4500, view: AT_BENCH, beats: [{ at: 800, run: (c) => c.ops().wear('goggles') }] },
    { id: 'apparatus', title: 'The apparatus', say: () => 'A conical flask with a bung and delivery tube, a 100 cm³ gas syringe on a stand, a stopwatch, a measuring cylinder, the ribbon, sandpaper and a balance.', ms: 7000, view: AT_BENCH, beats: NEEDED.MG.map((id, n) => ({ at: 300 + n * 400, run: (c: DemoCtx) => c.o.note(`collect:${id}`) })) },
    { id: 'setup', title: 'Setting up', say: () => 'The gas syringe is clamped level, gently so the plunger moves freely, and the delivery tube joins the bung to its nozzle.', ms: 5500, view: AT_SYRINGE, point: 'syringe', beats: PLACEABLE.MG.map((id, n) => ({ at: 600 + n * 1500, run: (c: DemoCtx) => c.ops().place(id) })) },
    { id: 'prep1', title: 'Acid, magnesium and syringe', say: () => '50 cm³ of 1.0 mol dm⁻³ acid in the flask. I weigh the ribbon and rub it with sandpaper until it shines: the oxide layer would slow the start. Plunger fully in, then I pull it out a little — it springs back, so the apparatus is airtight.', ms: 9000, view: AT_PREP, point: 'ribbon', beats: prep(1) },
    { id: 'start1', title: 'Drop, bung, start the watch', say: () => 'I drop the magnesium in, replace the bung at once and start the stopwatch — all together. Gas made before the bung is in would be lost.', ms: 5000, view: AT_FLASK, point: 'flask', beats: [{ at: 1200, run: startMg }] },
    {
      id: 'read1',
      title: 'Reading every 30 s',
      say: () => 'At every 30 second mark I read the syringe at eye level — where the plunger’s inner end is on the scale — and write it down. The clock is speeded up here so you don’t wait.',
      ms: 3000 + k1 * 2200,
      view: AT_SYRINGE,
      point: 'syringe',
      panel: 'notebook',
      beats: [{ at: 0, run: (c: DemoCtx) => c.clock.setRate(30_000 / 2200) }, ...Array.from({ length: k1 }, (_, i) => ({ at: 1500 + i * 2200, run: (c: DemoCtx) => readAt(c, 0, i + 1) }))],
    },
    { id: 'end1', title: 'No more gas', say: () => 'The last readings are the same: no more gas. All the magnesium has reacted — the acid was in excess. I finish the run.', ms: 5000, view: AT_FLASK, point: 'flask', beats: [{ at: 0, run: (c) => c.clock.setRate(1) }, { at: 2500, run: (c) => c.ops().finish() }] },
    { id: 'prep2', title: 'Run 2: 0.50 mol dm⁻³', say: () => 'Now the same again with 0.50 mol dm⁻³ acid and a fresh, cleaned piece of magnesium of the same mass. Only the concentration changes.', ms: 8000, view: AT_PREP, point: 'ribbon', beats: [...prep(0.5), { at: 6500, run: startMg }] },
    {
      id: 'read2',
      title: 'Run 2 readings',
      say: () => 'The gas comes off more slowly this time, so it takes longer — but it ends at the same volume.',
      ms: 2500 + k2 * 700,
      view: AT_SYRINGE,
      point: 'syringe',
      panel: 'notebook',
      beats: [{ at: 0, run: (c: DemoCtx) => c.clock.setRate(30_000 / 700) }, ...Array.from({ length: k2 }, (_, i) => ({ at: 800 + i * 700, run: (c: DemoCtx) => readAt(c, 1, i + 1) })), { at: 1200 + k2 * 700, run: (c: DemoCtx) => (c.clock.setRate(1), c.ops().finish()) }],
    },
    {
      id: 'graph',
      title: 'Curves and tangents',
      say: () => 'I plot V against t for both runs and join each set of points with a smooth curve — never a straight line. Then a tangent at t = 0 on each curve: it touches the curve along its steepest first part.',
      ms: 9000,
      view: AT_BENCH,
      point: 'book',
      panel: 'notebook',
      beats: [
        { at: 1500, run: (c) => c.o.update((x) => ({ ...x, curves: { a: 'SMOOTH', b: 'SMOOTH' } })) },
        {
          at: 4000,
          run: (c) => {
            const a = ratesMgInitialRate(c.v, 1);
            const b = ratesMgInitialRate(c.v, 0.5);
            c.o.update((x) => ({ ...x, tangents: { a: { x1: 0, y1: 0, x2: 50, y2: Number((50 * a).toFixed(1)) }, b: { x1: 0, y1: 0, x2: 90, y2: Number((90 * b).toFixed(1)) } } }));
          },
        },
      ],
    },
    {
      id: 'calc',
      title: 'Initial rates and the theoretical volume',
      say: (c) => {
        const ta = c.s().tangents.a;
        const tb = c.s().tangents.b;
        const ra = ta ? ta.y2 / ta.x2 : 0;
        const rb = tb ? tb.y2 / tb.x2 : 0;
        return `The gradient of each tangent is the initial rate: about ${ra.toFixed(2)} cm³ per second with 1.0 mol dm⁻³ acid and ${rb.toFixed(2)} with 0.50. Halving the concentration roughly halves the rate — fewer collisions each second. Theoretical volume: ${v.mgMass.toFixed(3)} ÷ 24 × 24 000 = ${ratesMgTheory(v).toFixed(0)} cm³. ${prec ? `Precautions: ${prec}` : ''}`;
      },
      ms: 12000,
      view: AT_BENCH,
      point: 'book',
      panel: 'calc',
      beats: [
        {
          at: 1500,
          run: (c) =>
            c.o.update((x) => {
              const ra = x.tangents.a ? x.tangents.a.y2 / x.tangents.a.x2 : 0;
              const rb = x.tangents.b ? x.tangents.b.y2 / x.tangents.b.x2 : 0;
              return {
                ...x,
                answers: { ...x.answers, rateA: { value: ra.toFixed(2), unit: 'cm³ s⁻¹' }, rateB: { value: rb.toFixed(2), unit: 'cm³ s⁻¹' }, vTheory: { value: ratesMgTheory(c.v).toFixed(0), unit: 'cm³' } },
                written: { explanation: 'The rate is fastest at the start and falls as the magnesium is used up; the curve levels off when the magnesium has all reacted. With 1.0 mol dm⁻³ acid the particles collide more often, so the initial rate is higher; the final volume is the same.', precautions: prec || 'The bung was replaced at once. The magnesium was cleaned with sandpaper.' },
              };
            }),
        },
      ],
    },
    { id: 'done', title: 'Your turn!', say: () => 'That’s the whole practical. Now try it yourself — and ask me if anything is unclear.', ms: 4000, view: AT_BENCH, beats: [] },
  ];
}

// ------------------------------------------------------------------ the disappearing cross

/** One timed run: measure, (warm), acid in, watch, swirl, stop just after the cross goes, (thermometer), record, fill the row, empty and rinse. */
function crossRun(c: DemoCtx, thio: number, bath: number | null, n: number) {
  c.ops().measure(thio, RATES_CROSS_MADE_UP - thio);
  if (bath !== null) c.ops().warm(bath);
  const run = openCross(c.s())?.r;
  if (!run) return;
  c.marks.start = c.clock.now();
  c.o.addAcid(c.marks.start);
  c.marks.watch = c.marks.start + 300;
  reach(c, c.marks.watch);
  c.o.startWatch(c.marks.watch);
  c.o.swirl();
  const tv = ratesCrossVanish(c.v, { ...run, swirled: true });
  const stopAt = c.marks.start + (tv + 0.4 + react(c.v, `x${n}`) * 0.5) * 1000;
  if (bath !== null) {
    reach(c, c.marks.start + (tv / 2) * 1000);
    c.o.readThermo(c.marks.start + (tv / 2) * 1000);
  }
  reach(c, stopAt);
  c.o.stopWatch(true, stopAt);
  fillCrossRow(c);
  c.o.record();
}
function fillCrossRow(c: DemoCtx) {
  c.o.update((x) => {
    const i = x.crossRuns.findIndex((r) => !r.done);
    if (i < 0) return x;
    const r = x.crossRuns[i]!;
    const t = r.elapsed ?? 0;
    return { ...x, cross: x.cross.map((row, k) => (k === i ? { v: String(r.thio), w: String(r.water), th: r.temp !== null ? r.temp.toFixed(0) : '', t: t.toFixed(1), inv: (1 / Number(t.toFixed(1))).toPrecision(3) } : row)) };
  });
}
function crossLine(c: DemoCtx) {
  const st = c.s();
  const pts = st.crossRuns.map((r, i) => ({ r, row: st.cross[i]! })).filter((x) => x.r.kind === 'CONC' && x.r.done).map((x) => ({ x: Number(x.row.v), y: Number(x.row.inv) }));
  const f = phyFit(pts);
  if (!f) return;
  const temps = st.crossRuns.map((r, i) => ({ r, row: st.cross[i]! })).filter((x) => x.r.kind === 'TEMP' && x.r.done);
  const tf = phyFit(temps.map((x) => ({ x: Number(x.row.th), y: Math.log(1 / Number(x.row.t)) })));
  c.o.update((x) => ({
    ...x,
    line: { x1: 0, y1: Number(f.intercept.toPrecision(3)) > 0 ? Number(f.intercept.toPrecision(3)) : 0, x2: 50, y2: Number((f.intercept + f.slope * 50).toPrecision(3)) },
    answers: { ...x.answers, slope: { value: f.slope.toPrecision(3), unit: 's⁻¹ cm⁻³' }, tQuery: { value: (1 / (f.intercept + f.slope * c.v.queryVol)).toPrecision(3), unit: 's' }, factor: { value: tf ? Math.exp(10 * tf.slope).toFixed(1) : '', unit: '' } },
  }));
}

function crossScript(v: ChemRatesVariant, precautions: string[]): DemoStep[] {
  const prec = precautions.slice(0, 2).join(' ');
  return [
    { id: 'welcome', title: 'Welcome', say: () => 'Watch me time the disappearing cross: sodium thiosulphate and hydrochloric acid make a pale yellow sulphur cloud that hides a cross under the flask. These are my own solutions.', ms: 7000, view: AT_BENCH, beats: [] },
    { id: 'safety', title: 'Safety first', say: () => 'Goggles on, and the windows open: the reaction gives off sulphur dioxide, a choking gas. I never sniff the flask.', ms: 5000, view: AT_BENCH, beats: [{ at: 800, run: (c) => c.ops().wear('goggles') }] },
    { id: 'apparatus', title: 'The apparatus', say: () => 'A conical flask, a 50 cm³ and a 10 cm³ measuring cylinder, a stopwatch, a thermometer, a water bath and a white paper with a bold cross.', ms: 7000, view: AT_BENCH, beats: [...NEEDED.CROSS.map((id, n) => ({ at: 300 + n * 350, run: (c: DemoCtx) => c.o.note(`collect:${id}`) })), ...PLACEABLE.CROSS.map((id, n) => ({ at: 4000 + n * 1000, run: (c: DemoCtx) => c.ops().place(id) }))] },
    {
      id: 'first',
      title: '50 cm³ of thiosulphate',
      say: () => `I put 50 cm³ of thiosulphate in the flask on the cross, add ${RATES_CROSS_ACID} cm³ of acid, start the watch and swirl. Then I look straight down through the solution. Watch the cross fade…`,
      ms: 13000,
      view: AT_FLASK,
      point: 'flask',
      beats: [],
    },
    { id: 'look', title: 'Looking down', say: () => '…it is going… going… gone! I stop the watch the moment I can no longer see the cross, and record the time.', ms: 6000, view: LOOK_DOWN, point: 'paper', panel: 'notebook', beats: [] },
    {
      id: 'others',
      title: 'The other concentrations',
      say: () => `Then ${RATES_CROSS_CARD.slice(1).join(', ')} cm³ of thiosulphate, each made up to 50 cm³ with water, the same 5 cm³ of acid, and the flask rinsed between runs. The cross takes longer to disappear as the solution gets more dilute.`,
      ms: 11000,
      view: AT_FLASK,
      point: 'cylinder',
      panel: 'notebook',
      beats: RATES_CROSS_CARD.slice(1).map((thio, n) => ({ at: 800 + n * 2400, run: (c: DemoCtx) => (c.ops().empty(), c.ops().rinse(), crossRun(c, thio, null, n + 1)) })),
    },
    {
      id: 'temps',
      title: 'The effect of temperature',
      say: () => `Now the same mixture each time — ${RATES_TEMP_THIO} cm³ of thiosulphate and ${RATES_CROSS_MADE_UP - RATES_TEMP_THIO} cm³ of water — warmed in the water bath to about ${RATES_TEMP_CARD.join(', ')} °C. I read the thermometer in the mixture after adding the acid.`,
      ms: 11000,
      view: AT_BATH,
      point: 'bath',
      panel: 'notebook',
      beats: RATES_TEMP_CARD.map((b, n) => ({ at: 800 + n * 2400, run: (c: DemoCtx) => (c.ops().empty(), c.ops().rinse(), crossRun(c, RATES_TEMP_THIO, b, 10 + n)) })),
    },
    {
      id: 'graph',
      title: '1/t against volume',
      say: () => '1/t is a measure of the rate. I plot 1/t against the volume of thiosulphate: a straight line through the origin — the rate is proportional to the concentration.',
      ms: 8000,
      view: AT_BENCH,
      point: 'book',
      panel: 'notebook',
      beats: [{ at: 1500, run: crossLine }],
    },
    {
      id: 'calc',
      title: 'Slope, a time from the graph, and temperature',
      say: (c) => {
        const a = c.s().answers;
        return `The slope is about ${a.slope.value} per second per cm³. From the line, ${v.queryVol} cm³ would take about ${a.tQuery.value} seconds. Each 10 °C rise made it about ${a.factor.value || '2'} times faster: more particles have energy above the activation energy. ${prec ? `Precautions: ${prec}` : ''}`;
      },
      ms: 12000,
      view: AT_BENCH,
      point: 'book',
      panel: 'calc',
      beats: [
        {
          at: 1000,
          run: (c) => c.o.update((x) => ({ ...x, written: { explanation: 'A more concentrated solution has more particles in the same volume, so collisions are more frequent. At a higher temperature the particles move faster and more of them have energy equal to or above the activation energy, so more collisions succeed.', precautions: prec || 'The total volume was kept at 50 cm³. I looked down vertically through the solution at the same cross.' } })),
        },
      ],
    },
    { id: 'done', title: 'Your turn!', say: () => 'That’s the whole practical. Now try it yourself — and ask me if anything is unclear.', ms: 4000, view: AT_BENCH, beats: [] },
  ];
}

/** The first cross run is played in (sped-up) real time: its beats depend on the demo's own vanishing time. */
export function beatsFor(step: DemoStep, c: DemoCtx): DemoStep['beats'] {
  if (step.id === 'look') return lookBeats(c);
  if (step.id !== 'first') return step.beats;
  const st = c.s();
  const tv = ratesCrossVanish(c.v, { n: st.made, bath: null, thio: 50, water: 0, acid: RATES_CROSS_ACID, rinsed: true, swirled: true });
  // by the end of this step the cross is nearly gone; the next step watches the last seconds in real time
  const rate = Math.max(1, ((tv - 4.5) * 1000) / 11_000);
  return [
    { at: 300, run: (x) => x.ops().measure(50, 0) },
    {
      at: 1500,
      run: (x) => {
        x.marks.start = x.clock.now();
        x.o.addAcid(x.marks.start);
        x.marks.watch = x.marks.start + 300;
        reach(x, x.marks.watch);
        x.o.startWatch(x.marks.watch);
        x.clock.setRate(rate);
      },
    },
    { at: 2200, run: (x) => x.o.swirl() },
  ];
}
/** The look step: real time for the last seconds, then the watch stops just after the cross vanishes. */
function lookBeats(c: DemoCtx): Beat[] {
  const run = openCross(c.s())?.r;
  if (!run) return [];
  const stopAt = () => c.marks.start + (ratesCrossVanish(c.v, run) + 0.35) * 1000;
  return [
    {
      at: 0,
      run: (x) => {
        x.clock.setRate(1);
        const rem = stopAt() - x.clock.now();
        if (rem > 4500) x.clock.shift(rem - 4500);
      },
    },
    {
      at: 4600,
      run: (x) => {
        reach(x, stopAt());
        x.o.stopWatch(true, stopAt());
        fillCrossRow(x);
        x.o.record();
      },
    },
  ];
}

export function demoScript(task: RatesTask, v: ChemRatesVariant, precautions: string[]): DemoStep[] {
  return task === 'CROSS' ? crossScript(v, precautions) : mgScript(v, precautions);
}

/** The worked calculation shown with the calculation step (demonstration values). */
export function demoCalculation(s: ChemRatesState, v: ChemRatesVariant): string[] {
  if (s.task === 'CROSS') {
    if (!s.answers.slope.value) return [];
    return [
      `Slope = Δ(1/t) ÷ ΔV = ${s.answers.slope.value} s⁻¹ cm⁻³.`,
      `At ${v.queryVol} cm³: 1/t = ${(1 / Number(s.answers.tQuery.value)).toPrecision(3)} s⁻¹, so t = ${s.answers.tQuery.value} s.`,
      `10 °C rise: the rate goes up about ${s.answers.factor.value || '2'} times.`,
    ];
  }
  if (!s.answers.rateA.value) return [];
  return [
    `Initial rate, run 1 = gradient of the tangent = ${s.answers.rateA.value} cm³ s⁻¹.`,
    `Initial rate, run 2 = ${s.answers.rateB.value} cm³ s⁻¹ (about half: rate ∝ concentration).`,
    `n(Mg) = ${v.mgMass.toFixed(3)} ÷ 24 = ${(v.mgMass / 24).toFixed(5)} mol = n(H₂); V = ${(v.mgMass / 24).toFixed(5)} × 24 000 = ${s.answers.vTheory.value} cm³.`,
  ];
}
export { makeOps };
