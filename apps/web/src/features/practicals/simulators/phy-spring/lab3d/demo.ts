import { emptyPhySpringState, labBetween, labRandom, phyFit, SPRING_CARD, SPRING_FOUR_PI2, springReading, type PhySpringState, type PhySpringVariant, type SpringTask } from '@aischool/shared';
import type { DemoBeat, DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import type { Spot } from '../../../lab3d-kit/store';
import type { Clock, Spring } from '../actions';
import { makeOps, type Ops } from './lab-actions';
import { NEEDED, PLACEABLE } from './scene-state';
import { FIDUCIAL, HOOK, SPOT } from './views';

/**
 * Mr Bayo's demonstration: the whole practical with his own spring (a demo
 * seed that is never the student's, so nothing about their own answers
 * shows) and his own in-memory state, through the same operations as the
 * student's bench and on the same physics. Hooke's law: R₀, the first load
 * step by step (it bounces; he steadies it and reads at eye level), the rest
 * of the loads and the unloading in one go, then the table, e against W and
 * k. Oscillations: the first timing on the demo's own clock, in time-lapse,
 * with a human reaction time at the start and stop; the others in one go;
 * then T² against m and k.
 */

export const DEMO_SEED = 13;
export const demoSeed = (studentSeed: number) => (studentSeed === DEMO_SEED ? DEMO_SEED + 1 : DEMO_SEED);
export const demoEmpty = (task: SpringTask): PhySpringState => ({ ...emptyPhySpringState(), task, log: [{ t: 0, a: `task:${task}` }] });

export interface DemoCtx {
  o: Spring;
  v: PhySpringVariant;
  s: () => PhySpringState;
  ops: () => Ops;
  clock: Clock;
}
type Beat = DemoBeat<DemoCtx>;
export type DemoStep = KitDemoStep<DemoCtx>;

const N = 20;
const AMP = 1.5;
const r1 = (x: number) => Math.round(x * 10) / 10;
const bench = (spot: Spot) => ({ mode: 'bench' as const, spot });
const AT_BENCH = bench({ target: [0.3, 0.3, 0.3], dist: 2.0, pitch: 0.32 });
const AT_SPRING = bench({ target: [HOOK[0] + 0.02, 0.6, HOOK[2]], dist: 1.0, pitch: 0.05 });
const AT_LOAD = bench({ target: [HOOK[0] + 0.02, 0.55, HOOK[2]], dist: 0.75, pitch: 0.06 });
const AT_WATCH = bench({ target: [(SPOT.stopwatch[0] + FIDUCIAL.x) / 2, 0.3, (SPOT.stopwatch[2] + FIDUCIAL.z) / 2], dist: 1.05, pitch: 0.25 });
const READ = { mode: 'read' as const, spot: null, eye: 0 };

/** Reaction time (s) at the start and the stop of timing k: a person is never exact. */
const reaction = (v: PhySpringVariant, k: number) => {
  const r = labRandom(v.seed, `demo-react-${k}`);
  return { start: labBetween(r, -0.04, 0.04, 3), stop: labBetween(r, -0.04, 0.04, 3) };
};
/** Start the watch as the hanger next passes the rest position (plus a reaction time), and stop it N oscillations later (if `stopNow`). */
function timeIt(c: DemoCtx, stopNow: boolean) {
  const m = c.o.motionRef.current;
  if (!m) return;
  const T = m.period * 1000;
  const now = c.clock.now();
  const k = Math.max(1, Math.ceil((now - m.at - T / 4) / (T / 2)));
  const t0 = m.at + T / 4 + (k * T) / 2;
  const re = reaction(c.v, c.s().runs.length);
  c.o.startWatch(t0 + re.start * 1000);
  if (stopNow) c.o.stopWatch(t0 + N * T + re.stop * 1000);
}

/** Hooke's law: write every row from the readings (Mr Bayo reads each to 0.1 cm), g = 10 m s⁻². */
function fillHooke(c: DemoCtx) {
  c.o.update((x) => {
    const R0 = r1(springReading(c.v, 0, 0));
    const hooke = x.rows.map((L, i) => {
      const at = x.readings.filter((r) => r.load === L);
      const up = at.find((r) => r.peak <= r.load);
      const down = at.find((r) => r.peak > r.load);
      const Rl = up ? r1(springReading(c.v, L, up.peak)) : null;
      const Ru = down ? r1(springReading(c.v, L, down.peak)) : null;
      const mean = Rl !== null && Ru !== null ? (Rl + Ru) / 2 : (Rl ?? Ru ?? 0);
      return { m: String(L), W: ((L / 1000) * 10).toFixed(2), Rl: Rl?.toFixed(1) ?? '', Ru: Ru?.toFixed(1) ?? '', e: Rl === null && Ru === null ? '' : (mean - R0).toFixed(2) || x.hooke[i]!.e };
    });
    return { ...x, hooke, answers: { ...x.answers, r0: { value: R0.toFixed(1), unit: 'cm' } } };
  });
}
/** Oscillations: write every row from the timings. */
function fillOsc(c: DemoCtx) {
  c.o.update((x) => ({
    ...x,
    osc: x.rows.map((L) => {
      const runs = x.runs.filter((r) => r.load === L);
      const t = runs.reduce((a, r) => a + r.elapsed, 0) / Math.max(1, runs.length);
      const T = t / (runs[0]?.n ?? N);
      return { m: (L / 1000).toFixed(3), t1: runs[0]?.elapsed.toFixed(2) ?? '', t2: runs[1]?.elapsed.toFixed(2) ?? '', t: t.toFixed(3), T: T.toFixed(4), T2: (T * T).toFixed(4) };
    }),
  }));
}
/** The best straight line through the table's points. */
function drawLine(c: DemoCtx, osc: boolean) {
  const st = c.s();
  const pts = osc ? st.osc.map((r) => ({ x: Number(r.m), y: Number(r.T2) })) : st.hooke.map((r) => ({ x: Number(r.W), y: Number(r.e) }));
  const fit = phyFit(pts);
  if (!fit) return;
  const xs = pts.map((p) => p.x);
  const a = Math.min(...xs);
  const b = Math.max(...xs);
  c.o.update((x) => ({ ...x, line: { x1: a, y1: Number((fit.intercept + fit.slope * a).toFixed(4)), x2: b, y2: Number((fit.intercept + fit.slope * b).toFixed(4)) } }));
}
const lineSlope = (s: PhySpringState) => (s.line ? (s.line.y2 - s.line.y1) / (s.line.x2 - s.line.x1) : null);

const setupBeats = (task: SpringTask): Beat[] => [...PLACEABLE[task].map((id, n): Beat => ({ at: 500 + n * 1300, run: (c) => c.ops().place(id) }))];

function hookeScript(precautions: string[]): DemoStep[] {
  const loads = SPRING_CARD.HOOKE;
  const prec = precautions.slice(0, 2).join(' ');
  return [
    {
      id: 'intro',
      title: 'The apparatus',
      say: () => 'Today: Hooke’s law and the spring constant. On my bench: a retort stand and clamps, a spiral spring, a metre rule, a pointer, the mass hanger and slotted masses of 50 grams each.',
      ms: 7500,
      view: AT_BENCH,
      point: 'stand',
      beats: NEEDED.HOOKE.map((id, n) => ({ at: 300 + n * 400, run: (c: DemoCtx) => c.o.note(`collect:${id}`) })),
    },
    {
      id: 'setup',
      title: 'Setting up',
      say: () => 'The stand goes near the bench edge so the spring hangs clear. I hang the spring from the clamp, clamp the metre rule vertically beside it with 0 at the top, and fix a pin to the bottom of the spring as the pointer.',
      ms: 8000,
      view: AT_SPRING,
      point: 'spring',
      beats: setupBeats('HOOKE'),
    },
    {
      id: 'r0',
      title: 'R₀: no load',
      say: (c) => `With no load I put my eye level with the pointer and read the rule: ${r1(springReading(c.v, 0, 0)).toFixed(1)} centimetres. That is R nought; every extension is measured from it.`,
      ms: 8000,
      view: READ,
      panel: 'notebook',
      beats: [{ at: 3500, run: (c) => (c.ops().take(), c.o.update((x) => ({ ...x, answers: { ...x.answers, r0: { value: r1(springReading(c.v, 0, 0)).toFixed(1), unit: 'cm' } } }))) }],
    },
    {
      id: 'first',
      title: 'The hanger: 50 g',
      say: () => 'I hang the 50 gram hanger on gently. Even so the spring bounces. I steady the hanger with my hand and wait until the pointer is still — then read it at eye level.',
      ms: 9000,
      view: AT_LOAD,
      point: 'hanger',
      beats: [
        { at: 400, run: (c) => c.ops().hangHanger() },
        { at: 4200, run: (c) => c.ops().steady() },
        { at: 7000, run: (c) => (c.ops().take(), fillHooke(c)) },
      ],
    },
    {
      id: 'loads',
      title: 'Loading in 50 g steps',
      say: () => `Then 50 grams at a time, up to ${Math.max(...loads)} grams: add, steady, read, record. The pointer moves down in equal steps.`,
      ms: 9000,
      view: AT_SPRING,
      point: 'masses',
      beats: loads.slice(1).flatMap((L, n): Beat[] => [
        { at: 300 + n * 1600, run: (c) => c.o.setLoad(L) },
        { at: 800 + n * 1600, run: (c) => c.ops().steady() },
        { at: 1200 + n * 1600, run: (c) => (c.ops().take(), fillHooke(c)) },
      ]),
    },
    {
      id: 'unload',
      title: 'Unloading',
      say: () => 'Now I take the masses off one at a time and read again. The unloading readings agree with the loading ones: the spring has not passed its elastic limit. I use the mean of each pair.',
      ms: 9000,
      view: AT_SPRING,
      point: 'pointer',
      beats: [...loads]
        .reverse()
        .slice(1)
        .flatMap((L, n): Beat[] => [
          { at: 300 + n * 1500, run: (c) => c.o.setLoad(L) },
          { at: 700 + n * 1500, run: (c) => c.ops().steady() },
          { at: 1100 + n * 1500, run: (c) => (c.ops().take(), fillHooke(c)) },
        ]),
    },
    {
      id: 'table',
      title: 'W and e',
      say: (c) => {
        const row = c.s().hooke[1];
        return `For each load W is m g with m in kilograms: 100 grams gives 0.100 times 10, which is 1.00 newton. The extension e is the mean reading minus R nought${row ? `: here ${row.e} centimetres` : ''}.`;
      },
      ms: 8500,
      view: AT_BENCH,
      point: 'book',
      panel: 'notebook',
      beats: [{ at: 1000, run: (c) => fillHooke(c) }],
    },
    {
      id: 'graph',
      title: 'The graph of e against W',
      say: () => 'I plot e up the side against W along the bottom. The points lie on a straight line through the origin: e is proportional to W. That is Hooke’s law.',
      ms: 7500,
      view: AT_BENCH,
      point: 'book',
      panel: 'notebook',
      beats: [{ at: 1500, run: (c) => drawLine(c, false) }],
    },
    {
      id: 'k',
      title: 'The slope gives k',
      say: (c) => {
        const sl = lineSlope(c.s());
        return `The slope is e over W: about ${sl ? sl.toFixed(2) : '—'} centimetres per newton, which is ${sl ? (sl / 100).toFixed(4) : '—'} metres per newton. So k is one over the slope: about ${sl ? (100 / sl).toFixed(0) : '—'} newtons per metre. ${prec ? `Precautions: ${prec}` : ''}`;
      },
      ms: 10000,
      view: AT_BENCH,
      point: 'book',
      panel: 'calc',
      beats: [
        {
          at: 1500,
          run: (c) =>
            c.o.update((x) => {
              const sl = lineSlope(x);
              if (!sl) return x;
              const s3 = Number(sl.toPrecision(3));
              return { ...x, answers: { ...x.answers, slope: { value: String(s3), unit: 'cm/N' }, k: { value: (100 / s3).toFixed(1), unit: 'N/m' } }, written: { precautions: prec || 'I read the pointer with my eye level with it. I let the spring come to rest before each reading.' } };
            }),
        },
      ],
    },
  ];
}

function oscScript(precautions: string[]): DemoStep[] {
  const masses = SPRING_CARD.OSC;
  const prec = precautions.slice(0, 2).join(' ');
  /** Beats for both timings of one mass, in one go (the clock is not needed: start and stop are set together). */
  const quick = (L: number, at0: number, gap: number): Beat[] =>
    [
      (c: DemoCtx) => c.o.setLoad(L),
      (c: DemoCtx) => c.ops().steady(),
      (c: DemoCtx) => c.ops().release(AMP),
      (c: DemoCtx) => (timeIt(c, true), c.ops().record()),
      (c: DemoCtx) => c.ops().release(AMP),
      (c: DemoCtx) => (timeIt(c, true), c.ops().record(), fillOsc(c)),
    ].map((run, n) => ({ at: at0 + n * gap, run }));
  return [
    {
      id: 'intro',
      title: 'The apparatus',
      say: () => 'Today: the oscillations of a loaded spring. On my bench: a retort stand and clamp, a spiral spring, the mass hanger and 50 gram slotted masses, a stopwatch and a fiducial pointer.',
      ms: 7500,
      view: AT_BENCH,
      point: 'stand',
      beats: NEEDED.OSC.map((id, n) => ({ at: 300 + n * 400, run: (c: DemoCtx) => c.o.note(`collect:${id}`) })),
    },
    {
      id: 'setup',
      title: 'Setting up',
      say: () => 'The stand near the bench edge, the spring from the clamp, and the fiducial pointer beside the hanger, its tip at the rest position: the mark I time from.',
      ms: 7000,
      view: AT_SPRING,
      point: 'spring',
      beats: setupBeats('OSC'),
    },
    {
      id: 'load',
      title: 'The first mass: 0.100 kg',
      say: () => 'The hanger and one slotted mass: 0.100 kilograms. I steady it at rest, level with the fiducial mark.',
      ms: 6000,
      view: AT_LOAD,
      point: 'hanger',
      beats: [
        { at: 300, run: (c) => c.ops().hangHanger() },
        { at: 1500, run: (c) => c.o.setLoad(masses[0]!) },
        { at: 3500, run: (c) => c.ops().steady() },
      ],
    },
    {
      id: 'release',
      title: 'A small displacement',
      say: () => `I pull the hanger down about ${AMP} centimetres and let go. It oscillates straight up and down about the fiducial mark. A small pull keeps the motion simple harmonic and the masses on the hanger.`,
      ms: 7500,
      view: AT_LOAD,
      point: 'fiducial',
      beats: [{ at: 1500, run: (c) => c.ops().release(AMP) }],
    },
    {
      id: 'time',
      title: `Timing ${N} oscillations`,
      say: () => `As it passes the mark I start the watch and count "nought". Each time it passes going the same way is one more. After ${N} I stop the watch. The clock is speeded up here so you don't wait.`,
      ms: 9000,
      view: AT_WATCH,
      point: 'stopwatch',
      beats: [
        { at: 600, run: (c) => timeIt(c, false) },
        {
          at: 1600,
          run: (c) => {
            const m = c.o.motionRef.current;
            if (m) c.clock.setRate(Math.max(1, (N * m.period * 1000) / 5600));
          },
        },
        {
          at: 7600,
          run: (c) => {
            const m = c.o.motionRef.current;
            const w = c.o.watchRef.current;
            if (m && w.start !== null && w.stop === null) {
              const T = m.period * 1000;
              const k = Math.round((w.start - m.at - T / 4) / (T / 2));
              c.o.stopWatch(m.at + T / 4 + (k * T) / 2 + N * T + reaction(c.v, c.s().runs.length).stop * 1000);
            }
            c.clock.setRate(1);
          },
        },
      ],
    },
    {
      id: 'record',
      title: 'Record, and time it again',
      say: (c) => {
        const w = c.o.watchRef.current;
        const t = w.start !== null && w.stop !== null ? (w.stop - w.start) / 1000 : null;
        return t ? `The watch reads ${t.toFixed(2)} seconds for ${N} oscillations. I write it down, then time the same mass a second time and take the mean.` : 'I record the stopwatch reading and time it again.';
      },
      ms: 7500,
      view: AT_WATCH,
      point: 'stopwatch',
      panel: 'notebook',
      beats: [
        { at: 400, run: (c) => c.ops().record() },
        { at: 2500, run: (c) => c.ops().release(AMP) },
        { at: 4000, run: (c) => (timeIt(c, true), c.ops().record(), fillOsc(c)) },
      ],
    },
    {
      id: 'rest',
      title: 'The other masses',
      say: () => `And the same with ${masses.slice(1).map((g) => (g / 1000).toFixed(2)).join(', ')} kilograms — each timed twice.`,
      ms: 9500,
      view: AT_SPRING,
      point: 'hanger',
      beats: masses.slice(1).flatMap((L, n) => quick(L, 300 + n * 2200, 330)),
    },
    {
      id: 'graph',
      title: 'The graph of T² against m',
      say: () => 'T is t over 20, and I square it. I plot T squared up the side against m along the bottom: a straight line. It does not pass exactly through the origin — part of the spring’s own mass moves too.',
      ms: 8500,
      view: AT_BENCH,
      point: 'book',
      panel: 'notebook',
      beats: [{ at: 1500, run: (c) => (fillOsc(c), drawLine(c, true)) }],
    },
    {
      id: 'k',
      title: 'The slope gives k',
      say: (c) => {
        const sl = lineSlope(c.s());
        return `T squared equals four pi squared over k, times m. So the slope is four pi squared over k: about ${sl ? sl.toFixed(2) : '—'} seconds squared per kilogram, and k is 39.5 divided by the slope: about ${sl ? (SPRING_FOUR_PI2 / sl).toFixed(0) : '—'} newtons per metre. ${prec ? `Precautions: ${prec}` : ''}`;
      },
      ms: 10000,
      view: AT_BENCH,
      point: 'book',
      panel: 'calc',
      beats: [
        {
          at: 1500,
          run: (c) =>
            c.o.update((x) => {
              const sl = lineSlope(x);
              if (!sl) return x;
              const s3 = Number(sl.toPrecision(3));
              return { ...x, answers: { ...x.answers, slope: { value: String(s3), unit: 's2/kg' }, k: { value: (SPRING_FOUR_PI2 / s3).toFixed(1), unit: 'N/m' } }, written: { precautions: prec || 'Small vertical oscillations. I timed 20 oscillations from the fiducial mark and repeated.' } };
            }),
        },
      ],
    },
  ];
}

export function demoScript(task: SpringTask, precautions: string[]): DemoStep[] {
  return task === 'OSC' ? oscScript(precautions) : hookeScript(precautions);
}

/** The worked calculation shown with the last step (demonstration values). */
export function demoCalculation(s: PhySpringState): string[] {
  const l = s.line;
  if (!l || !s.answers.slope.value) return [];
  if (s.task === 'OSC')
    return [
      `Slope s = Δ(T²) ÷ Δm = (${l.y2.toFixed(3)} − ${l.y1.toFixed(3)}) ÷ (${l.x2.toFixed(3)} − ${l.x1.toFixed(3)}) = ${s.answers.slope.value} s² kg⁻¹.`,
      `k = 4π² ÷ s = 39.48 ÷ ${s.answers.slope.value} = ${s.answers.k.value} N m⁻¹.`,
    ];
  const sl = Number(s.answers.slope.value);
  return [
    `Slope = Δe ÷ ΔW = (${l.y2.toFixed(2)} − ${l.y1.toFixed(2)}) cm ÷ (${l.x2.toFixed(2)} − ${l.x1.toFixed(2)}) N = ${s.answers.slope.value} cm N⁻¹ = ${(sl / 100).toPrecision(3)} m N⁻¹.`,
    `k = 1 ÷ slope = 1 ÷ ${(sl / 100).toPrecision(3)} = ${s.answers.k.value} N m⁻¹.`,
  ];
}
export { makeOps };
