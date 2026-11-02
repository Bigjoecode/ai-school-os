import {
  emptyPhyMechanicsState,
  FORCES_CARD,
  FRICTION_CARD,
  INCLINE_CARD,
  VISC_OIL_BALL,
  forceConstruction,
  forceNewton,
  frictionPull,
  frictionTilt,
  frictionWeight,
  inclineReadings,
  phyFit,
  sbShows,
  viscEtaFromSlope,
  viscReadings,
  type MechTask,
  type PhyMechanicsState,
  type PhyMechanicsVariant,
} from '@aischool/shared';
import type { DemoBeat, DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import type { Mechanics } from '../actions';
import { startRun } from './bench-store';
import { makeOps, RUN_MS, type Ops } from './lab-actions';
import { NEEDED, PLACEABLE } from './scene-state';

/**
 * Mr Bayo's demonstration: the whole practical with his own apparatus (a
 * demo seed that is never the student's, so nothing about their own answers
 * shows) and his own in-memory state, through the same actions as the
 * student's bench. The first measurement is shown slowly, the rest quickly;
 * then the table, the graph or the drawing, and the result.
 */

export const DEMO_SEED = 11;
export const demoSeed = (studentSeed: number) => (studentSeed === DEMO_SEED ? DEMO_SEED + 1 : DEMO_SEED);
export const demoEmpty = (task: MechTask): PhyMechanicsState => ({ ...emptyPhyMechanicsState(), task, log: [{ t: 0, a: `task:${task}` }] });

export interface DemoCtx {
  o: Mechanics;
  v: PhyMechanicsVariant;
  s: () => PhyMechanicsState;
  ops: () => Ops;
}
type Beat = DemoBeat<DemoCtx>;
export type DemoStep = KitDemoStep<DemoCtx>;

const RIG: Record<MechTask, string> = { FRICTION: 'friction', VISCOSITY: 'visc', INCLINE: 'incline', FORCES: 'forces' };
const view = (task: MechTask) => ({ mode: 'bench' as const, focus: RIG[task], spot: null });
const BENCHV = { mode: 'bench' as const, focus: 'bench', spot: null };
const r05 = (x: number) => (Math.round(x * 20) / 20).toFixed(2);
const at = (t0: number, gap: number, runs: ((c: DemoCtx) => void)[]): Beat[] => runs.map((run, n) => ({ at: t0 + n * gap, run }));
const lineFrom = (c: DemoCtx, xk: string, yk: string) => {
  const pts = c.s().rows.map((r) => ({ x: Number(r.c[xk]), y: Number(r.c[yk]) })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const fit = phyFit(pts);
  if (!fit) return null;
  const xs = pts.map((p) => p.x);
  const a = Math.min(...xs);
  const b = Math.max(...xs);
  c.o.update((x) => ({ ...x, line: { x1: a, y1: Number((fit.intercept + fit.slope * a).toPrecision(4)), x2: b, y2: Number((fit.intercept + fit.slope * b).toPrecision(4)) } }));
  return fit;
};
const intro = (task: MechTask, say: string): DemoStep => ({ id: 'intro', title: 'The apparatus', say: () => say, ms: 7000, view: BENCHV, point: 'cupboard', beats: NEEDED[task].map((id, n) => ({ at: 300 + n * 350, run: (c: DemoCtx) => c.o.note(`collect:${id}`) })) });
const setupStep = (task: MechTask, say: string, extra: Beat[] = []): DemoStep => ({ id: 'setup', title: 'Setting up', say: () => say, ms: 8000, view: view(task), point: PLACEABLE[task][0], beats: [...PLACEABLE[task].map((id, n) => ({ at: 300 + n * 700, run: (c: DemoCtx) => c.o.note(`place:${id}`) })), ...extra] });

// ------------------------------------------------------------------ FRICTION

function frictionRow(c: DemoCtx, L: number) {
  const s = c.s();
  const ks = s.pulls.map((p, k) => (p.load === L ? k : -1)).filter((k) => k >= 0);
  const F = ks.map((k) => Number(r05(frictionPull(c.v, k, s.pulls[k]!).limit)));
  const R = r05(sbShows(c.v, frictionWeight(c.v, L), s.zeroed));
  const mean = F.length ? (F.reduce((a, b) => a + b, 0) / F.length).toFixed(2) : '';
  c.o.update((x) => ({ ...x, rows: x.rows.map((r) => (r.key === L ? { ...r, c: { m: String(L * 100), R, F1: F[0]?.toFixed(2) ?? '', F2: F[1]?.toFixed(2) ?? '', F: mean } } : r)) }));
}
const pullOnce = (c: DemoCtx, ms = RUN_MS.pull) => {
  const k = c.o.pull();
  if (k !== null) startRun('pull', k, ms);
};
function frictionScript(prec: string): DemoStep[] {
  const loads = FRICTION_CARD.slice(0, 5);
  return [
    intro('FRICTION', 'Today: the coefficient of static friction. On my bench: a wooden block with a hook, a smooth plank, a 0 to 10 newton spring balance, six 100 gram masses, a protractor and a dry cloth.'),
    setupStep('FRICTION', 'The plank lies flat, the block on it, the balance hooked to the block. First I check the balance’s zero and adjust it, and wipe the plank clean and dry.', [
      { at: 2600, run: (c) => c.o.zero() },
      { at: 3600, run: (c) => c.o.wipe() },
    ]),
    {
      id: 'first',
      title: 'Weigh, then pull slowly',
      say: () => 'I weigh the block on the balance: that is the normal reaction R. Then I pull horizontally, very slowly… the pointer climbs… and just as the block starts to move I read it: the limiting friction. While it slides, the reading is lower. I pull twice and take the mean.',
      ms: 14000,
      view: view('FRICTION'),
      point: 'sbalance',
      beats: [
        { at: 300, run: (c) => (c.o.weigh(), startRun('weigh', c.s().weighs.length - 1, RUN_MS.weigh)) },
        { at: 2500, run: (c) => pullOnce(c) },
        { at: 7000, run: (c) => pullOnce(c) },
        { at: 11000, run: (c) => frictionRow(c, 0) },
      ],
    },
    {
      id: 'loads',
      title: 'More load on the block',
      say: () => 'Now one, two, three and four 100 gram masses on the block: weigh, pull twice, record. The friction grows with the load.',
      ms: 12000,
      view: view('FRICTION'),
      point: 'block',
      beats: loads.slice(1).flatMap((L, n) =>
        at(300 + n * 2800, 500, [(c) => c.o.setLoad(L), (c) => (c.o.weigh(), startRun('weigh', c.s().weighs.length - 1, 400)), (c) => pullOnce(c, 450), (c) => pullOnce(c, 450), (c) => frictionRow(c, L)]),
      ),
    },
    {
      id: 'tilt',
      title: 'The angle of slipping',
      say: (c) => `I take the masses off and raise one end slowly until the block just slips. The protractor reads about ${Math.round(frictionTilt(c.v, 0, { load: 0, fast: false, wiped: true }))} degrees. Three times; the angle does not depend on the load.`,
      ms: 13000,
      view: view('FRICTION'),
      point: 'protractor',
      beats: [
        { at: 200, run: (c) => (c.o.setLoad(0), c.o.setTilt(true)) },
        ...[0, 1, 2].map((n): Beat => ({ at: 800 + n * 3800, run: (c) => { const k = c.o.raise(); if (k !== null) startRun('tilt', k, n ? 1800 : RUN_MS.tilt); } })),
        {
          at: 12300,
          run: (c) => {
            const s = c.s();
            const th = s.tilts.map((t, k) => Math.round(frictionTilt(c.v, k, t)));
            c.o.update((x) => ({ ...x, cells: { ...x.cells, th1: String(th[0] ?? ''), th2: String(th[1] ?? ''), th3: String(th[2] ?? ''), th: th.length ? (th.reduce((a, b) => a + b, 0) / th.length).toFixed(1) : '' } }));
          },
        },
      ],
    },
    {
      id: 'graph',
      title: 'F against R, and μ',
      say: (c) => {
        const l = c.s().line;
        const sl = l ? (l.y2 - l.y1) / (l.x2 - l.x1) : null;
        return `F against R is a straight line through the origin: its slope is μ, about ${sl ? sl.toFixed(2) : '—'}. And tan θ gives the same. ${prec ? `Precautions: ${prec}` : ''}`;
      },
      ms: 10000,
      view: BENCHV,
      point: 'book',
      panel: 'notebook',
      beats: [
        { at: 800, run: (c) => void lineFrom(c, 'R', 'F') },
        {
          at: 2500,
          run: (c) =>
            c.o.update((x) => {
              const l = x.line;
              const th = Number(x.cells.th);
              return { ...x, answers: { ...x.answers, slope: { value: l ? ((l.y2 - l.y1) / (l.x2 - l.x1)).toPrecision(3) : '', unit: '' }, mutan: { value: Number.isFinite(th) ? Math.tan((th * Math.PI) / 180).toPrecision(3) : '', unit: '' } }, written: { precautions: prec || 'The pull was increased slowly and the reading taken just as the block started to move. The plank was clean and dry.' } };
            }),
        },
      ],
    },
  ];
}

// ------------------------------------------------------------------ VISCOSITY

function viscRow(c: DemoCtx, b: number) {
  const s = c.s();
  const t = viscReadings(c.v, s.drops);
  const ts = s.drops.map((d, k) => (d.ball === b && d.liquid === 'glycerine' ? t[k]! : -1)).filter((x) => x >= 0);
  const d = c.v.balls[b]!.toFixed(2);
  const r = Number(d) / 2;
  const tm = ts.length ? Number((ts.reduce((a, x) => a + x, 0) / ts.length).toFixed(2)) : 0;
  const L = Number(s.cells.L) || 20;
  c.o.update((x) => ({ ...x, rows: x.rows.map((row) => (row.key === b ? { ...row, c: { d, r: r.toFixed(3), r2: (r * r).toFixed(3), t1: ts[0]?.toFixed(2) ?? '', t2: ts[1]?.toFixed(2) ?? '', t: tm ? tm.toFixed(2) : '', v: tm ? (L / tm).toPrecision(3) : '' } } : row)) }));
}
const dropOnce = (c: DemoCtx, ms: number) => {
  c.o.resetClock();
  const k = c.o.drop();
  if (k !== null) startRun('drop', k, ms);
};
function viscScript(prec: string): DemoStep[] {
  return [
    intro('VISCOSITY', 'Today: terminal velocity in a viscous liquid. On my bench: a tall cylinder of glycerine, one of palm oil, ball bearings of five sizes, a micrometer, a metre rule, rubber bands, a stop-clock and a magnet.'),
    setupStep('VISCOSITY', 'The cylinders stand up, the rule beside the glycerine with its zero at the surface. I slide the upper band down to 8 centimetres — below it the ball has settled to its terminal velocity — and the lower band 20 centimetres below that.', [
      { at: 3600, run: (c) => (c.o.setBand('top', 8), c.o.setBand('bot', 28), c.o.setEyeLevel(true)) },
      { at: 6500, run: (c) => c.o.setCell('L', '20.0') },
    ]),
    {
      id: 'first',
      title: 'Measure, drop, time',
      say: () => 'I measure the smallest ball with the micrometer, reset the stop-clock and let the ball go gently at the centre of the surface. I start the clock as it passes the upper band and stop it at the lower one, my eye level with each band. Twice.',
      ms: 15000,
      view: view('VISCOSITY'),
      point: 'cylinder',
      beats: [
        { at: 300, run: (c) => (c.o.chooseBall(0), c.o.measure()) },
        { at: 2500, run: (c) => dropOnce(c, 5200) },
        { at: 8500, run: (c) => dropOnce(c, 2500) },
        { at: 12500, run: (c) => viscRow(c, 0) },
      ],
    },
    {
      id: 'rest',
      title: 'The other sizes',
      say: () => 'The same with the 2.5, 3.0, 3.5 and 4.0 millimetre balls: the bigger the ball, the faster it falls.',
      ms: 11000,
      view: view('VISCOSITY'),
      point: 'cylinder',
      beats: [1, 2, 3, 4].flatMap((b, n) => at(300 + n * 2500, 450, [(c) => (c.o.chooseBall(b), c.o.measure()), (c) => dropOnce(c, 400), (c) => dropOnce(c, 400), (c) => viscRow(c, b)])),
    },
    {
      id: 'oil',
      title: 'In palm oil',
      say: () => 'The 3 millimetre ball in palm oil falls in under a second — palm oil is far less viscous than glycerine.',
      ms: 7000,
      view: view('VISCOSITY'),
      point: 'oilcyl',
      beats: [
        { at: 300, run: (c) => (c.o.chooseBall(VISC_OIL_BALL), c.o.setLiquid('oil')) },
        { at: 1200, run: (c) => dropOnce(c, 1200) },
        {
          at: 4000,
          run: (c) => {
            const t = viscReadings(c.v, c.s().drops);
            const ot = t[t.length - 1]!;
            c.o.update((x) => ({ ...x, cells: { ...x.cells, od: c.v.balls[VISC_OIL_BALL]!.toFixed(2), ot: ot.toFixed(2), ov: (20 / ot).toPrecision(3) } }));
          },
        },
      ],
    },
    {
      id: 'graph',
      title: 'v against r², and η',
      say: (c) => {
        const sl = Number(c.s().answers.slope.value);
        return `v against r squared is a straight line: v is proportional to r squared, as Stokes’s law says. The slope is about ${sl ? sl.toPrecision(3) : '—'} centimetres per second per square millimetre — times ten thousand in SI — so η is about ${c.s().answers.eta.value || '—'} pascal seconds. ${prec ? `Precautions: ${prec}` : ''}`;
      },
      ms: 12000,
      view: BENCHV,
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 500,
          run: (c) => {
            const fit = lineFrom(c, 'r2', 'v');
            if (!fit) return;
            const sl = Number(fit.slope.toPrecision(3));
            c.o.update((x) => {
              const ov = Number(x.cells.ov);
              const gv = Number(x.rows.find((r) => r.key === VISC_OIL_BALL)?.c.v);
              return { ...x, answers: { ...x.answers, slope: { value: String(sl), unit: 'cm s⁻¹ mm⁻²' }, eta: { value: viscEtaFromSlope(sl, 9.8).toPrecision(3), unit: 'Pa s' }, ratio: { value: ov && gv ? (ov / gv).toPrecision(3) : '', unit: '' } }, written: { precautions: prec || 'The upper band was well below the surface. The balls were dropped at the centre, away from the walls.' } };
            });
          },
        },
      ],
    },
  ];
}

// ------------------------------------------------------------------ INCLINE

function inclineRow(c: DemoCtx, stop: number) {
  const s = c.s();
  const t = inclineReadings(c.v, s.runs);
  const ts = s.runs.map((r, k) => (r.stop === stop ? t[k]! : -1)).filter((x) => x >= 0);
  const tm = ts.length ? Number((ts.reduce((a, x) => a + x, 0) / ts.length).toFixed(2)) : 0;
  c.o.update((x) => ({ ...x, rows: x.rows.map((r) => (r.key === stop ? { ...r, c: { s: (stop / 100).toFixed(2), t1: ts[0]?.toFixed(2) ?? '', t2: ts[1]?.toFixed(2) ?? '', t3: ts[2]?.toFixed(2) ?? '', t: tm ? tm.toFixed(2) : '', tt: tm ? (tm * tm).toFixed(3) : '' } } : r)) }));
}
const rollOnce = (c: DemoCtx, slow: boolean) => {
  c.o.resetClock();
  const k = c.o.roll();
  if (k === null) return;
  const r = inclineReadings(c.v, c.s().runs);
  startRun('roll', k, slow ? r[k]! * 1000 + 250 : 450);
};
function inclineScript(prec: string): DemoStep[] {
  return [
    intro('INCLINE', 'Today: uniform acceleration. On my bench: a grooved plank two metres long, wooden blocks, a stopping block, a steel ball and a stop-clock.'),
    setupStep('INCLINE', 'The plank lies along the bench with its left end on three blocks — a small angle that I keep fixed. The stopping block goes at the 0.40 metre mark.', [{ at: 3000, run: (c) => (c.o.setBlocks(3), c.o.setStop(40)) }]),
    {
      id: 'first',
      title: 'Release from rest and time',
      say: () => 'I reset the stop-clock, hold the ball at the start line and let it go — no push — starting the clock as I let go. I stop it at the click on the block. Three times, and the mean.',
      ms: 13000,
      view: view('INCLINE'),
      point: 'steelball',
      beats: [...[0, 1, 2].map((n): Beat => ({ at: 500 + n * 3200, run: (c) => rollOnce(c, true) })), { at: 11000, run: (c) => inclineRow(c, 40) }],
    },
    {
      id: 'rest',
      title: 'The other distances',
      say: () => 'Then the same at 0.80, 1.20 and 1.60 metres. The time grows, but not in proportion: doubling s does not double t.',
      ms: 10000,
      view: view('INCLINE'),
      point: 'stopblock',
      beats: INCLINE_CARD.slice(1).flatMap((m, n) => at(300 + n * 3000, 500, [(c) => c.o.setStop(m), (c) => rollOnce(c, false), (c) => rollOnce(c, false), (c) => rollOnce(c, false), (c) => inclineRow(c, m)])),
    },
    {
      id: 'graph',
      title: 's against t², and a',
      say: (c) => `s against t squared is a straight line through the origin: the acceleration is uniform. The slope is half a, so a is twice the slope: about ${c.s().answers.accel.value || '—'} metres per second squared. ${prec ? `Precautions: ${prec}` : ''}`,
      ms: 10000,
      view: BENCHV,
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 500,
          run: (c) => {
            const fit = lineFrom(c, 'tt', 's');
            if (!fit) return;
            const sl = Number(fit.slope.toPrecision(3));
            c.o.update((x) => ({ ...x, answers: { ...x.answers, slope: { value: String(sl), unit: 'm s⁻²' }, accel: { value: (2 * sl).toPrecision(3), unit: 'm s⁻²' } }, written: { precautions: prec || 'The ball was released from rest without pushing. The angle was kept constant and each time repeated.' } }));
          },
        },
      ],
    },
  ];
}

// ------------------------------------------------------------------ FORCES

function forcesScript(prec: string): DemoStep[] {
  return [
    intro('FORCES', 'Today: the parallelogram of forces. On my bench: a drawing board fixed upright with two pulleys, three hangers with 50 gram masses, thread with a knot, drawing paper, a sharp pencil, a ruler and a protractor.'),
    setupStep('FORCES', 'The board stands up and the paper is pinned on. Two threads go over the pulleys, the third hangs straight down. P is 300 grams, Q 400 grams and W 500 grams — each hanger counts 50 grams.', [
      { at: 3200, run: (c) => (c.o.setMass('P', FORCES_CARD.P), c.o.setMass('Q', FORCES_CARD.Q), c.o.setMass('W', FORCES_CARD.W)) },
    ]),
    {
      id: 'settle',
      title: 'Let it settle; mark the threads',
      say: () => 'I tap the board so the pulleys turn freely and the knot settles. Then two pencil dots under each thread — one near the knot, one far from it, so each line is accurate.',
      ms: 11000,
      view: view('FORCES'),
      point: 'knot',
      beats: [{ at: 400, run: (c) => c.o.tap() }, ...(['P', 'Q', 'W'] as const).flatMap((th, n) => at(2000 + n * 2400, 900, [(c) => void c.o.dot(th, false), (c) => void c.o.dot(th, true)]))],
    },
    {
      id: 'draw',
      title: 'The lines and the parallelogram',
      say: () => 'I take the paper off and draw the lines through the dots: they meet at O. My scale: 0.5 newton per centimetre, so P of 3.0 newtons is OA = 6.0 centimetres and Q is OB = 8.0. Then the lines parallel to them complete the parallelogram.',
      ms: 12000,
      view: { mode: 'read' as const, spot: null },
      point: 'paper',
      beats: [
        { at: 400, run: (c) => void c.o.paperOff() },
        { at: 4000, run: (c) => (c.o.setAnswer('scale', 'value', '0.5'), c.o.setAnswer('scale', 'unit', 'N/cm'), c.o.setRowCell(0, 'OA', '6.0'), c.o.setRowCell(0, 'OB', '8.0')) },
        { at: 7000, run: (c) => void c.o.build(0) },
      ],
    },
    {
      id: 'measure',
      title: 'The diagonal OC',
      say: (c) => {
        const row = c.s().rows.find((r) => r.key === 0);
        return `The diagonal OC is ${row?.c.OC || 'about 10'} centimetres: R is ${row?.c.R || 'about 5'} newtons, straight up — equal and opposite to W, 5.0 newtons. ${prec ? `Precautions: ${prec}` : ''}`;
      },
      ms: 11000,
      view: { mode: 'read' as const, spot: null },
      point: 'paper',
      panel: 'notebook',
      beats: [
        {
          at: 1500,
          run: (c) => {
            const s = c.s();
            const set = s.sets[0];
            if (!set) return;
            const con = forceConstruction(c.v, set, 0, 6, 8);
            if (!con) return;
            const P = forceNewton(set.P);
            const Q = forceNewton(set.Q);
            const W = forceNewton(set.W);
            const oc = Number(con.oc.toFixed(1));
            const R = oc * 0.5;
            c.o.update((x) => ({ ...x, rows: x.rows.map((r) => (r.key === 0 ? { ...r, c: { ...r.c, P: P.toFixed(1), Q: Q.toFixed(1), W: W.toFixed(1), OC: oc.toFixed(1), R: R.toFixed(2), ang: String(Math.round(con.angle)), diff: (((R - W) / W) * 100).toFixed(1) } } : r)), written: { precautions: prec || 'The board was tapped so the pulleys turned freely. The dots were well separated and a large scale was used.' } }));
          },
        },
      ],
    },
  ];
}

export function demoScript(task: MechTask, precautions: string[]): DemoStep[] {
  const prec = precautions.slice(0, 2).join(' ');
  return task === 'VISCOSITY' ? viscScript(prec) : task === 'INCLINE' ? inclineScript(prec) : task === 'FORCES' ? forcesScript(prec) : frictionScript(prec);
}

/** The worked result shown with the last step (demonstration values). */
export function demoCalculation(s: PhyMechanicsState): string[] {
  const l = s.line;
  switch (s.task) {
    case 'FRICTION':
      return l && s.answers.slope.value ? [`μ = slope = ΔF ÷ ΔR = (${l.y2.toFixed(2)} − ${l.y1.toFixed(2)}) ÷ (${l.x2.toFixed(2)} − ${l.x1.toFixed(2)}) = ${s.answers.slope.value}.`, `Mean θ = ${s.cells.th}°: μ = tan ${s.cells.th}° = ${s.answers.mutan.value}.`] : [];
    case 'VISCOSITY':
      return s.answers.eta.value ? [`Slope = ${s.answers.slope.value} cm s⁻¹ mm⁻² = ${(Number(s.answers.slope.value) * 1e4).toPrecision(3)} m⁻¹ s⁻¹.`, `η = 2(7800 − 1260) × 9.8 ÷ (9 × ${(Number(s.answers.slope.value) * 1e4).toPrecision(3)}) = ${s.answers.eta.value} Pa s.`, `η(glycerine) ÷ η(oil) = v(oil) ÷ v(glycerine) = ${s.answers.ratio.value}.`] : [];
    case 'INCLINE':
      return s.answers.accel.value ? [`Slope = Δs ÷ Δt² = ${s.answers.slope.value} m s⁻².`, `s = ½at², so a = 2 × slope = ${s.answers.accel.value} m s⁻².`] : [];
    case 'FORCES': {
      const r = s.rows.find((x) => x.key === 0);
      return r?.c.R ? [`OC = ${r.c.OC} cm; R = OC × 0.5 N cm⁻¹ = ${r.c.R} N.`, `% difference = (R − W) ÷ W × 100 = (${r.c.R} − ${r.c.W}) ÷ ${r.c.W} × 100 = ${r.c.diff} %.`, `R makes ${r.c.ang}° with the upward line of W: equal and opposite to W.`] : [];
    }
    default:
      return [];
  }
}
export { makeOps };
