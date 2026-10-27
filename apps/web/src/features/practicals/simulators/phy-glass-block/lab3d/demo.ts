import { emptyPhyGlassState, glassConstruction, glassRay, phyFit, phyGlassVariant, phySin, type PhyGlassState, type PhyGlassVariant } from '@aischool/shared';
import type { DemoBeat, DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import { EYE_Y, type Glass } from '../actions';
import { BENCH_IDLE, useBench } from './bench-store';
import { makeOps, type Ops } from './lab-actions';
import { NEEDED } from './scene-state';

/**
 * Mr Bayo's demonstration: the whole practical on his own block (a demo seed
 * that is never the student's, so nothing about their own answers shows) and
 * his own in-memory state, through the same operations as the student's bench.
 * The first trace is shown step by step, the second more quickly, the other
 * three in one go; then the table, the graph and n.
 */

export const DEMO_SEED = 7;
export const demoSeed = (studentSeed: number) => (studentSeed === DEMO_SEED ? DEMO_SEED + 1 : DEMO_SEED);
export const demoEmpty = (): PhyGlassState => emptyPhyGlassState();

export interface DemoCtx {
  g: Glass;
  v: PhyGlassVariant;
  s: () => PhyGlassState;
  ops: () => Ops;
}
type Beat = DemoBeat<DemoCtx>;
export type DemoStep = KitDemoStep<DemoCtx>;

const BOARD = { mode: 'bench' as const, focus: 'board', spot: null };
const BENCHV = { mode: 'bench' as const, focus: 'bench', spot: null };
const PROT = { mode: 'bench' as const, focus: 'protractor', spot: null };

/** Where the eye must be (x on the line y = EYE_Y) to be on the emergent ray at angle i. */
export function alignedEye(v: PhyGlassVariant, i: number) {
  const { exit, dir } = glassRay(v, i);
  return exit.x + (dir.x * (EYE_Y - exit.y)) / dir.y;
}
const fmt3 = (x: number) => x.toFixed(3);
/** The table row the demo writes for trace k (r read to the nearest degree). */
function fillRow(c: DemoCtx, k: number) {
  const t = c.s().traces[k];
  const built = t ? glassConstruction(c.v, t.p3, t.p4) : null;
  if (!t || !built) return;
  const r = Math.round(built.r);
  c.g.update((x) => ({ ...x, table: x.table.map((row, j) => (j === k ? { i: String(t.i), r: String(r), sini: fmt3(phySin(t.i)), sinr: fmt3(phySin(r)) } : row)) }));
}
/** Beats for one whole trace (used for the quick traces). */
function quickTrace(i: number, at0: number, gapMs: number): Beat[] {
  const k = (c: DemoCtx) => c.s().traces.length - 1;
  const steps: ((c: DemoCtx) => void)[] = [
    (c) => (useBench.setState({ nextI: i }), c.ops().startTrace()),
    (c) => c.ops().drawNormal(),
    (c) => (useBench.setState({ dist: { p1: 9, p2: 3 } }), c.ops().pushOnRay('p1')),
    (c) => c.ops().pushOnRay('p2'),
    (c) => (useBench.setState({ eyeX: Math.round(alignedEye(c.v, i) * 100) / 100 }), c.ops().sight(true)),
    (c) => c.ops().pushInLine('p3'),
    (c) => c.ops().pushInLine('p4'),
    (c) => c.ops().join(),
    (c) => fillRow(c, k(c)),
  ];
  return steps.map((run, n) => ({ at: at0 + n * gapMs, run }));
}

export function demoScript(v: PhyGlassVariant, precautions: string[]): DemoStep[] {
  const i0 = 20;
  const eye = alignedEye(v, i0);
  const prec = precautions.slice(0, 2).join(' ');
  return [
    {
      id: 'intro',
      title: 'The apparatus',
      say: () => 'Today we find the refractive index of glass. On my bench: a drawing board with white paper pinned to it, a rectangular glass block, four optical pins, a protractor, a ruler and a sharp pencil.',
      ms: 6500,
      view: BENCHV,
      point: 'board',
      beats: NEEDED.map((id, n) => ({ at: 300 + n * 350, run: (c: DemoCtx) => c.g.note(`collect:${id}`) })),
    },
    {
      id: 'trace',
      title: 'Trace the block, draw the ray at 20°',
      say: () => 'I lay the block on the paper and trace its outline ABCD. At O on face AB the incident ray goes in at twenty degrees to the normal.',
      ms: 5200,
      view: BOARD,
      point: 'block',
      beats: [{ at: 500, run: (c) => (useBench.setState({ nextI: i0 }), c.ops().startTrace()) }],
    },
    {
      id: 'normal',
      title: 'The normal at O',
      say: () => 'With the ruler I draw the normal at O: the line at ninety degrees to the face. Every angle is measured from the normal.',
      ms: 4200,
      view: BOARD,
      point: 'board',
      beats: [{ at: 400, run: (c) => c.ops().drawNormal() }],
    },
    {
      id: 'p12',
      title: 'P₁ and P₂ on the incident ray',
      say: () => 'I push P₁ and P₂ in upright on the incident ray, six centimetres apart — far apart pins fix the direction accurately.',
      ms: 5000,
      view: BOARD,
      point: 'pins',
      beats: [
        { at: 600, run: (c) => (useBench.setState({ dist: { p1: 9, p2: 3 } }), c.ops().pushOnRay('p1')) },
        { at: 2000, run: (c) => c.ops().pushOnRay('p2') },
      ],
    },
    {
      id: 'sight',
      title: 'Look through face CD at eye level',
      say: () => 'Now I put my eye down at the level of the paper and look through face CD. I look at the bases of the pins — their images in the glass. I move my eye until the image of P₂ exactly hides the image of P₁.',
      ms: 9000,
      view: { mode: 'bench' as const, focus: 'sight' },
      point: 'block',
      beats: [
        { at: 200, run: (c) => (useBench.setState({ eyeX: Math.round((eye + 2.5) * 100) / 100 }), c.ops().sight(true)) },
        ...Array.from({ length: 10 }, (_, n): Beat => ({ at: 1500 + n * 500, run: () => useBench.setState({ eyeX: Math.round((eye + 2.5 - (2.5 * (n + 1)) / 10) * 100) / 100 }) })),
      ],
    },
    {
      id: 'p34',
      title: 'P₃ and P₄ in line with the images',
      say: () => 'Keeping my eye there, I push in P₃ so that it hides both images, then P₄ further away so that it hides P₃ and the images. All four now look like one pin.',
      ms: 5500,
      view: { mode: 'bench' as const, focus: 'sight' },
      point: 'block',
      beats: [
        { at: 900, run: (c) => c.ops().pushInLine('p3') },
        { at: 2600, run: (c) => c.ops().pushInLine('p4') },
      ],
    },
    {
      id: 'join',
      title: 'Remove the block and join the points',
      say: () => 'I lift the block off, join P₄P₃ and carry the line on to meet CD at E, then join O to E. OE is the refracted ray inside the glass: it bends towards the normal.',
      ms: 5500,
      view: BOARD,
      point: 'board',
      beats: [{ at: 600, run: (c) => c.ops().join() }],
    },
    {
      id: 'measure',
      title: 'Measure r with the protractor',
      say: (c) => {
        const t = c.s().traces[0];
        const b = t ? glassConstruction(c.v, t.p3, t.p4) : null;
        return `The protractor goes on O with zero on the normal. The angle between the normal and OE is r: about ${b ? Math.round(b.r) : '—'} degrees. Then sin i and sin r to three decimal places.`;
      },
      ms: 6500,
      view: PROT,
      point: 'protractor',
      panel: 'notebook',
      beats: [{ at: 3500, run: (c) => fillRow(c, 0) }],
    },
    {
      id: 'second',
      title: 'The same at 30°',
      say: () => 'A fresh outline for every angle. Thirty degrees: normal, P₁ and P₂, look through CD, P₃ and P₄, remove the block, join, measure r.',
      ms: 8000,
      view: BOARD,
      point: 'board',
      beats: quickTrace(30, 300, 800),
    },
    {
      id: 'rest',
      title: '40°, 50° and 60°',
      say: () => 'And the same again for forty, fifty and sixty degrees — five angles spread over forty degrees.',
      ms: 11000,
      view: BOARD,
      point: 'board',
      beats: [...quickTrace(40, 200, 380), ...quickTrace(50, 3800, 380), ...quickTrace(60, 7400, 380)],
    },
    {
      id: 'graph',
      title: 'The graph of sin i against sin r',
      say: () => 'I plot sin i up the side against sin r along the bottom. The points lie on a straight line through the origin: Snell’s law.',
      ms: 6000,
      view: BENCHV,
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 1500,
          run: (c) => {
            const pts = c.s().table.map((r) => ({ x: Number(r.sinr), y: Number(r.sini) }));
            const fit = phyFit(pts);
            if (!fit) return;
            const x2 = Math.max(...pts.map((p) => p.x));
            c.g.update((x) => ({ ...x, line: { x1: 0, y1: Number(fit.intercept.toFixed(4)), x2: Number(x2.toFixed(3)), y2: Number((fit.intercept + fit.slope * x2).toFixed(4)) } }));
          },
        },
      ],
    },
    {
      id: 'n',
      title: 'The slope is n',
      say: (c) => `From two points far apart on my line the slope is about ${slopeOf(c.s())}. So n is about ${slopeOf(c.s())} — no unit, it is a ratio. ${prec ? `Precautions: ${prec}` : ''}`,
      ms: 8000,
      view: BENCHV,
      point: 'book',
      panel: 'calc',
      beats: [{ at: 1500, run: (c) => c.g.update((x) => ({ ...x, answers: { slope: { value: slopeOf(x), unit: '' }, n: { value: slopeOf(x), unit: '' } }, written: { precautions: precautions.slice(0, 2).join(' ') || 'Pins upright and at least 5 cm apart. Looked at the bases of the pins.' } })) }],
    },
  ];
}
function slopeOf(s: PhyGlassState): string {
  const l = s.line;
  if (!l || Math.abs(l.x2 - l.x1) < 1e-9) return '—';
  return ((l.y2 - l.y1) / (l.x2 - l.x1)).toFixed(2);
}

/** The worked calculation shown with the last step (demonstration values). */
export function demoCalculation(s: PhyGlassState): string[] {
  const l = s.line;
  if (!l) return [];
  return [
    `Two points on the line: (${l.x1.toFixed(3)}, ${l.y1.toFixed(3)}) and (${l.x2.toFixed(3)}, ${l.y2.toFixed(3)}).`,
    `Slope = Δ(sin i) ÷ Δ(sin r) = ${(l.y2 - l.y1).toFixed(3)} ÷ ${(l.x2 - l.x1).toFixed(3)} = ${slopeOf(s)}.`,
    `n = slope = ${slopeOf(s)} (no unit).`,
  ];
}
export const demoVariant = (studentSeed: number) => phyGlassVariant(demoSeed(studentSeed));
export const resetBench = () => useBench.setState(BENCH_IDLE);
export { makeOps };
