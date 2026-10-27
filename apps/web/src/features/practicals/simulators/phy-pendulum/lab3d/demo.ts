import { emptyPhyPendulumState, phyFit, type PhyPendulumState, type PhyPendulumVariant } from '@aischool/shared';
import type { DemoBeat, DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import type { Spot } from '../../../lab3d-kit/store';
import type { Pendulum } from '../actions';
import { PIVOT, SPOT, type Clock } from './layout';
import { NEEDED } from './scene-state';

/**
 * Mr Bayo's demonstration: the whole experiment on its own demo seed (never
 * the student's) and its own in-memory state, through the same actions as the
 * student's lab and on the same physics. The swing runs on the demo's own
 * clock, which goes into time-lapse while 20 oscillations are timed; the times
 * recorded are exactly the stopwatch's (started and stopped at the mark), so
 * jumping between steps replays the same results.
 */

export const demoSeed = (studentSeed: number) => (studentSeed === 5 ? 6 : 5);
export interface DemoCtx {
  p: Pendulum;
  v: PhyPendulumVariant;
  s: () => PhyPendulumState;
  clock: Clock;
}
type Beat = DemoBeat<DemoCtx>;
export type DemoStep = KitDemoStep<DemoCtx>;

const N = 20;
const AMP = 8;
const bench = (spot: Spot) => ({ mode: 'bench' as const, spot });
const AT_BENCH = bench({ target: [0.2, 0.25, 0.2], dist: 1.5, pitch: 0.35 });
const AT_PENDULUM = bench({ target: [PIVOT[0] - 0.03, 0.55, PIVOT[2]], dist: 1.1, pitch: 0.08, yaw: 0.05 });
const AT_CORK = bench({ target: [PIVOT[0], PIVOT[1] - 0.04, PIVOT[2]], dist: 0.36, pitch: 0.06, yaw: 0 });
const AT_WATCH = bench({ target: [(SPOT.stopwatch[0] + PIVOT[0]) / 2, 0.15, PIVOT[2] - 0.1], dist: 1.0, pitch: 0.25, yaw: 0.05 });
const READ = { mode: 'read' as const, spot: null, eye: 0 };

export const demoEmpty = (): PhyPendulumState => emptyPhyPendulumState();
const f2 = (x: number) => x.toFixed(2);
const f3 = (x: number) => x.toFixed(3);

/** Fill the last row of the table from its timing (l to the centre of the bob, t, T = t/n, T²). */
function fillRow(c: DemoCtx) {
  c.p.update((x) => {
    const i = x.runs.length - 1;
    const r = x.runs[i];
    if (!r) return x;
    const T = r.elapsed / r.n;
    return { ...x, table: x.table.map((row, k) => (k === i ? { l: f2(r.thread + c.v.bobRadius), t: f2(r.elapsed), T: f3(T), T2: f3(T * T) } : row)) };
  });
}
/** Start the watch at the next pass through the mean position and stop it exactly `N` oscillations later. */
function timeIt(c: DemoCtx, stopNow: boolean) {
  const sw = c.p.swingRef.current;
  if (!sw) return;
  const T = sw.period * 1000;
  const now = c.clock.now();
  const k = Math.max(0, Math.ceil((now - sw.at - T / 4) / (T / 2)));
  const t0 = sw.at + T / 4 + (k * T) / 2;
  c.p.startWatch(t0);
  if (stopNow) c.p.stopWatch(t0 + N * T);
}

export function demoScript(v: PhyPendulumVariant): DemoStep[] {
  const r = v.bobRadius;
  const steps: DemoStep[] = [
    {
      id: 'setup',
      title: 'The apparatus',
      say: () => 'The bob hangs on its thread from a split cork, clamped firmly at the top of the retort stand. Behind it, a white card with a line — the fiducial mark — shows its rest position. A metre rule, a protractor and a stopwatch complete the set.',
      ms: 7000,
      view: AT_BENCH,
      point: 'stand',
      beats: [{ at: 300, run: (c) => NEEDED.forEach((a) => c.p.note(`collect:${a.id}`)) }],
    },
    {
      id: 'window',
      title: 'No draughts',
      say: () => 'First I close the window. The draught lifts the curtain and pushes the bob about, and the fans go off too.',
      ms: 4200,
      view: AT_PENDULUM,
      point: 'window',
      beats: [{ at: 1500, run: (c) => (c.p.ref.current.shielded ? undefined : c.p.toggleWindow()) }],
    },
    {
      id: 'length-0',
      title: `Thread ${v.suggested[0]} cm, read at eye level`,
      say: () => `I pull the thread through the cork until the rule, read at eye level, shows ${v.suggested[0]} cm to the top of the bob. The length l goes to the centre of the bob, so I add the radius: ${v.suggested[0]} + ${r.toFixed(2)} = ${(v.suggested[0]! + r).toFixed(2)} cm.`,
      ms: 7500,
      view: READ,
      point: 'rule',
      beats: [{ at: 400, run: (c) => c.p.set({ thread: v.suggested[0]!, amplitude: AMP, n: N }) }],
    },
    {
      id: 'release-0',
      title: 'A small angle, then let go',
      say: () => `I pull the bob aside through about ${AMP} degrees — under ten, so the swing is simple harmonic — and let it go without pushing. It swings in one plane.`,
      ms: 5200,
      view: AT_CORK,
      point: 'bob',
      beats: [{ at: 1800, run: (c) => c.p.release() }],
    },
    {
      id: 'time-0',
      title: `Timing ${N} oscillations (time-lapse)`,
      say: () => `As it passes the mark I start the watch and count "nought". Each time it comes back past the mark going the same way is one more. After ${N}, I stop the watch. The clock is speeded up here so you don't wait.`,
      ms: 7600,
      view: AT_WATCH,
      point: 'stopwatch',
      beats: [
        {
          at: 300,
          run: (c) => {
            const sw = c.p.swingRef.current;
            if (!sw) return;
            c.clock.setRate(Math.max(1, (N * sw.period * 1000) / 5600));
            timeIt(c, false);
          },
        },
        {
          at: 6200,
          run: (c) => {
            const sw = c.p.swingRef.current;
            const w = c.p.watchRef.current;
            if (sw && w.start !== null) c.p.stopWatch(w.start + N * sw.period * 1000);
            c.clock.setRate(1);
          },
        },
      ],
    },
    {
      id: 'record-0',
      title: 'Record t, then T and T²',
      say: (c) => {
        const run = c.s().runs.at(-1);
        if (!run) return 'I record the stopwatch reading.';
        const T = run.elapsed / run.n;
        return `The watch reads ${f2(run.elapsed)} s for ${run.n} oscillations. So T = ${f2(run.elapsed)} ÷ ${run.n} = ${f3(T)} s and T² = ${f3(T * T)} s². I write l, t, T and T² in the table.`;
      },
      ms: 7000,
      view: AT_WATCH,
      point: 'book',
      panel: 'notebook',
      beats: [
        { at: 400, run: (c) => c.p.watchRef.current.stop !== null && c.p.record() },
        { at: 2200, run: fillRow },
      ],
    },
  ];
  v.suggested.slice(1).forEach((L, k) =>
    steps.push({
      id: `length-${k + 1}`,
      title: `Thread ${L} cm`,
      say: () => (k === 0 ? `Now the same again for ${L} cm: measure, a small angle, release, time ${N} oscillations from the mark, record.` : `${L} cm: measure, release, time ${N} oscillations, record.`),
      ms: k === 0 ? 6000 : 4200,
      view: AT_PENDULUM,
      point: 'bob',
      beats: [
        { at: 300, run: (c) => c.p.set({ thread: L, amplitude: AMP, n: N }) },
        { at: 900, run: (c) => c.p.release() },
        { at: 1700, run: (c) => timeIt(c, true) },
        { at: 2600, run: (c) => (c.p.record(), fillRow(c)) },
      ] satisfies Beat[],
      panel: 'notebook',
    }),
  );
  steps.push(
    {
      id: 'graph',
      title: 'Plot T² against l',
      say: () => 'T² against l is a straight line through the origin, because T² = (4π²/g) l. I draw the best straight line through my points.',
      ms: 5200,
      view: AT_BENCH,
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 1200,
          run: (c) => {
            const pts = c.s().table.map((row) => ({ x: Number(row.l), y: Number(row.T2) })).filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y));
            const fit = phyFit(pts);
            if (!fit) return;
            const x1 = Math.min(...pts.map((q) => q.x));
            const x2 = Math.max(...pts.map((q) => q.x));
            c.p.update((x) => ({ ...x, line: { x1, y1: Number((fit.slope * x1 + fit.intercept).toFixed(4)), x2, y2: Number((fit.slope * x2 + fit.intercept).toFixed(4)) } }));
          },
        },
      ],
    },
    {
      id: 'calc',
      title: 'Slope, then g',
      say: (c) => {
        const calc = demoCalculation(c.s(), c.v);
        return calc.length ? `${calc[1]} ${calc[2]}` : 'Slope from two points far apart on the line, then g = 4π² ÷ slope.';
      },
      ms: 8000,
      view: AT_BENCH,
      point: 'book',
      panel: 'calc',
      beats: [
        {
          at: 1500,
          run: (c) => {
            const l = c.s().line;
            if (!l) return;
            const slopeCm = (l.y2 - l.y1) / (l.x2 - l.x1);
            const g = (4 * Math.PI ** 2) / (slopeCm * 100);
            c.p.update((x) => ({ ...x, answers: { slope: { value: slopeCm.toFixed(4), unit: 's² cm⁻¹' }, g: { value: g.toFixed(2), unit: 'm s⁻²' } } }));
          },
        },
      ],
    },
    {
      id: 'precautions',
      title: 'Precautions',
      say: () => 'My precautions: a small angle of displacement; timing from the mean position with a fiducial mark; the window closed against draughts; l measured to the centre of the bob, reading the rule at eye level.',
      ms: 6500,
      view: AT_BENCH,
      point: 'book',
      panel: 'notebook',
      beats: [{ at: 800, run: (c) => c.p.update((x) => ({ ...x, written: { precautions: 'Small angle (under 10°); timed 20 oscillations from the mean position (fiducial mark); window closed (no draughts); l measured to the centre of the bob, rule read at eye level.' } })) }],
    },
  );
  return steps;
}

/** The worked calculation from the demo's own line. */
export function demoCalculation(s: PhyPendulumState, v: PhyPendulumVariant): string[] {
  const l = s.line;
  if (!l || l.x2 === l.x1) return [];
  const slopeCm = (l.y2 - l.y1) / (l.x2 - l.x1);
  const g = (4 * Math.PI ** 2) / (slopeCm * 100);
  return [
    `Two points on the line: (${l.x1.toFixed(1)} cm, ${l.y1.toFixed(3)} s²) and (${l.x2.toFixed(1)} cm, ${l.y2.toFixed(3)} s²).`,
    `Slope = (${l.y2.toFixed(3)} − ${l.y1.toFixed(3)}) ÷ (${l.x2.toFixed(1)} − ${l.x1.toFixed(1)}) = ${slopeCm.toFixed(4)} s² cm⁻¹ = ${(slopeCm * 100).toFixed(2)} s² m⁻¹.`,
    `g = 4π² ÷ slope = 39.48 ÷ ${(slopeCm * 100).toFixed(2)} = ${g.toFixed(2)} m s⁻².`,
    `(Mr Bayo's bob: diameter ${v.bobDiameter.toFixed(1)} cm, so l = thread + ${v.bobRadius.toFixed(2)} cm.)`,
  ];
}
