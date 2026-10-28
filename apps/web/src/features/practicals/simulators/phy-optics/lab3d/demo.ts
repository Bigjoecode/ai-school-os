import { emptyPhyOpticsState, OPTICS_CARD_U, OPTICS_START, opticsImage, opticsScreenAt, opticsV, opticsWindowImage, phyFit, phyOpticsVariant, type OpticsTask, type PhyOpticsState, type PhyOpticsVariant } from '@aischool/shared';
import type { DemoBeat, DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import { useLabView } from '../../../lab3d-kit/store';
import { extendToAxes } from '../index';
import { OPTIC_NAME, r1, type Optics } from '../actions';
import { BENCH_IDLE, useBench } from './bench-store';
import { followScreen, makeOps, type Ops } from './lab-actions';
import { NEEDED, PLACEABLE } from './scene-state';

/**
 * Mr Bayo's demonstration: the whole practical with his own lens or mirror (a
 * demo seed that is never the student's, so nothing about their own answers
 * shows) and his own in-memory state, through the same operations as the
 * student's bench. The first value of u is shown step by step — the image
 * blurring and sharpening as he moves the screen to and fro — the second more
 * quickly, the others in one go; then the table, the graph, the intercepts and f.
 */

export const DEMO_SEED = 11;
export const demoSeed = (studentSeed: number) => (studentSeed === DEMO_SEED ? DEMO_SEED + 1 : DEMO_SEED);
export const demoEmpty = (task: OpticsTask): PhyOpticsState => ({ ...emptyPhyOpticsState(), task, ...OPTICS_START[task], log: [{ t: 0, a: `task:${task}` }] });

export interface DemoCtx {
  o: Optics;
  v: PhyOpticsVariant;
  s: () => PhyOpticsState;
  ops: () => Ops;
}
type Beat = DemoBeat<DemoCtx>;
export type DemoStep = KitDemoStep<DemoCtx>;

const RULE = { mode: 'bench' as const, focus: 'rule', spot: null };
const BENCHV = { mode: 'bench' as const, focus: 'bench', spot: null };
const SCREEN = { mode: 'bench' as const, focus: 'screen' };

/** Where the screen is sharp for u (on the rule, to the 0.1 cm the bench moves in). */
const sharpAt = (c: DemoCtx, u: number) => r1(opticsScreenAt(c.o.task, u, opticsImage(c.v, c.o.task, u)!));
/** The table row the demo writes for reading k (v read off the rule to 0.1 cm). */
function fillRow(c: DemoCtx, k: number) {
  const r = c.s().readings[k];
  if (!r) return;
  const v = r1(opticsV(c.o.task, r.u, r.screen));
  c.o.update((x) => ({ ...x, table: x.table.map((row, j) => (j === k ? { u: r.u.toFixed(1), v: v.toFixed(1), iu: (1 / r.u).toPrecision(3), iv: (1 / v).toPrecision(3) } : row)) }));
}
/** Beats for one quick reading: set u, screen to the sharp image, take it, write the row. */
function quick(u: number, at0: number, gap: number): Beat[] {
  const steps: ((c: DemoCtx) => void)[] = [
    (c) => c.o.setU(u),
    (c) => (c.o.setScreen(sharpAt(c, u) + 1.5), followScreen(c.s())),
    (c) => (c.o.setScreen(sharpAt(c, u)), followScreen(c.s())),
    (c) => c.ops().take(),
    (c) => fillRow(c, c.s().readings.length - 1),
  ];
  return steps.map((run, n) => ({ at: at0 + n * gap, run }));
}

export function demoScript(task: OpticsTask, v: PhyOpticsVariant, precautions: string[]): DemoStep[] {
  const what = OPTIC_NAME[task];
  const us = OPTICS_CARD_U[task];
  const u0 = us[0]!;
  const roughSharp = r1(opticsWindowImage(v, task));
  const prec = precautions.slice(0, 2).join(' ');
  return [
    {
      id: 'intro',
      title: 'The apparatus',
      say: () => `Today we find the focal length of a ${task === 'MIRROR' ? 'concave mirror' : 'converging lens'}. On my bench: a metre rule, an illuminated object — a cross-wire lit by a lamp — the ${what} in its holder and a white screen.`,
      ms: 7000,
      view: BENCHV,
      point: 'rule',
      beats: NEEDED[task].map((id, n) => ({ at: 300 + n * 400, run: (c: DemoCtx) => c.o.note(`collect:${id}`) })),
    },
    {
      id: 'setup',
      title: 'On the metre rule',
      say: () => (task === 'MIRROR' ? 'The mirror stands at the zero mark, facing along the rule. The object and the screen stand side by side in front of it, slightly off the axis, so the object’s mark is u and the screen’s mark is v.' : 'The object stands at the zero mark, so the lens’s mark is u. The screen goes beyond the lens: v is the screen’s mark minus the lens’s mark.'),
      ms: 7000,
      view: RULE,
      point: task === 'MIRROR' ? 'mirror' : 'lens',
      beats: PLACEABLE[task].map((id, n) => ({ at: 500 + n * 1200, run: (c: DemoCtx) => c.ops().place(id) })),
    },
    {
      id: 'rough',
      title: 'A rough focal length',
      say: () => `First a rough focal length. I turn the ${what} to the window and move the screen until the window is sharp on it — upside down. That is about ${roughSharp.toFixed(0)} centimetres. Now I know u must be well beyond that.`,
      ms: 9500,
      view: SCREEN,
      point: 'screen',
      beats: [
        { at: 100, run: (c) => (useBench.setState({ roughS: r1(roughSharp + 6) }), c.ops().rough(true)) },
        ...Array.from({ length: 8 }, (_, n): Beat => ({ at: 1400 + n * 450, run: (c) => (useBench.setState({ roughS: r1(roughSharp + 6 - ((n + 1) * 6.8) / 8) }), followScreen(c.s())) })),
        { at: 5400, run: (c) => (useBench.setState({ roughS: roughSharp }), followScreen(c.s())) },
        { at: 8200, run: (c) => (c.ops().recordRough(), c.o.update((x) => ({ ...x, answers: { ...x.answers, rough: { value: roughSharp.toFixed(1), unit: 'cm' } } }))) },
      ],
    },
    {
      id: 'align',
      title: 'Centres on one axis',
      say: () => `I line up the centres of the object, the ${what} and the screen at the same height, so the image falls in the middle of the screen.`,
      ms: 4500,
      view: RULE,
      point: task === 'MIRROR' ? 'mirror' : 'lens',
      beats: [{ at: 800, run: (c) => c.ops().align() }],
    },
    {
      id: 'first',
      title: `u = ${u0.toFixed(1)} cm: find the sharpest image`,
      say: () => `${task === 'MIRROR' ? 'The object' : 'The lens'} goes to ${u0} centimetres. Now I move the screen to and fro: the image is a blur, gets sharper, then blurs again. I go past the sharp place both ways and stop where the cross-wire is crispest.`,
      ms: 11000,
      view: SCREEN,
      point: 'screen',
      beats: [
        { at: 100, run: (c) => (c.o.setU(u0), c.o.setScreen(sharpAt(c, u0) - 6), followScreen(c.s())) },
        ...Array.from({ length: 12 }, (_, n): Beat => ({ at: 1200 + n * 420, run: (c) => (c.o.setScreen(sharpAt(c, u0) - 6 + (n + 1) * 0.85), followScreen(c.s())) })),
        ...Array.from({ length: 5 }, (_, n): Beat => ({ at: 6600 + n * 420, run: (c) => (c.o.setScreen(sharpAt(c, u0) + 4.2 - (n + 1) * 0.84), followScreen(c.s())) })),
        { at: 9000, run: (c) => (c.o.setScreen(sharpAt(c, u0)), followScreen(c.s())) },
      ],
    },
    {
      id: 'read',
      title: 'Read v at eye level',
      say: (c) => `I read the screen’s index line on the rule from directly in front of it. ${task === 'MIRROR' ? 'That is v' : 'Take away the lens’s mark: that is v'} — about ${r1(opticsV(task, u0, c.s().screen)).toFixed(1)} centimetres. Then one over u and one over v to three significant figures.`,
      ms: 8000,
      view: { mode: 'read' as const, spot: null, eye: 0.03 },
      panel: 'notebook',
      beats: [
        { at: 0, run: () => useBench.setState({ readAt: 'screen' }) },
        { at: 2500, run: (c) => c.ops().take() },
        { at: 4500, run: (c) => fillRow(c, 0) },
      ],
    },
    {
      id: 'second',
      title: `u = ${us[1]!.toFixed(1)} cm`,
      say: () => `Next, u = ${us[1]} centimetres. The image is now nearer the ${what} and smaller. To and fro, sharpest, read, record.`,
      ms: 6500,
      view: SCREEN,
      point: 'screen',
      beats: quick(us[1]!, 300, 1100),
    },
    {
      id: 'rest',
      title: 'The other values of u',
      say: () => `And the same for ${us.slice(2).join(', ')} centimetres — five values spread well out.`,
      ms: 10000,
      view: RULE,
      point: 'screen',
      beats: us.slice(2).flatMap((u, n) => quick(u, 300 + n * 3000, 500)),
    },
    {
      id: 'graph',
      title: 'The graph of 1/v against 1/u',
      say: () => 'I plot one over v up the side against one over u along the bottom. The points lie on a straight line sloping down at about forty-five degrees: its slope is minus one. I extend it to meet both axes.',
      ms: 8000,
      view: BENCHV,
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 1500,
          run: (c) => {
            const pts = c.s().table.map((r) => ({ x: Number(r.iu), y: Number(r.iv) }));
            const fit = phyFit(pts);
            if (!fit) return;
            const xs = pts.map((p) => p.x);
            const x1 = Math.min(...xs);
            const x2 = Math.max(...xs);
            c.o.update((x) => ({ ...x, line: { x1, y1: Number((fit.intercept + fit.slope * x1).toFixed(4)), x2, y2: Number((fit.intercept + fit.slope * x2).toFixed(4)) } }));
          },
        },
        { at: 4500, run: (c) => c.o.update((x) => ({ ...x, line: extendToAxes(x.line) ?? x.line })) },
      ],
    },
    {
      id: 'f',
      title: 'The intercepts give f',
      say: (c) => {
        const l = c.s().line;
        const f = l ? 2 / (l.y1 + l.x2) : null;
        return `Both intercepts equal one over f. Here they are about ${l ? l.x2.toFixed(3) : '—'} and ${l ? l.y1.toFixed(3) : '—'} per centimetre, so f is about ${f ? f.toFixed(1) : '—'} centimetres. ${prec ? `Precautions: ${prec}` : ''}`;
      },
      ms: 9500,
      view: BENCHV,
      point: 'book',
      panel: 'calc',
      beats: [
        {
          at: 1500,
          run: (c) =>
            c.o.update((x) => {
              const l = x.line;
              if (!l) return x;
              return {
                ...x,
                answers: { ...x.answers, xint: { value: l.x2.toPrecision(3), unit: 'cm⁻¹' }, yint: { value: l.y1.toPrecision(3), unit: 'cm⁻¹' }, f: { value: (2 / (l.x2 + l.y1)).toFixed(1), unit: 'cm' } },
                written: { precautions: prec || 'The centres of the object, lens and screen were on the same axis. The screen was moved to and fro to find the sharpest image.' },
              };
            }),
        },
      ],
    },
  ];
}

/** The worked calculation shown with the last step (demonstration values). */
export function demoCalculation(s: PhyOpticsState): string[] {
  const l = s.line;
  if (!l || Math.abs(l.x1) > 1e-9 || Math.abs(l.y2) > 1e-9) return [];
  const fx = 1 / l.x2;
  const fy = 1 / l.y1;
  return [
    `Intercept on the 1/u axis = ${l.x2.toFixed(4)} cm⁻¹ → f = 1 ÷ ${l.x2.toFixed(4)} = ${fx.toFixed(1)} cm.`,
    `Intercept on the 1/v axis = ${l.y1.toFixed(4)} cm⁻¹ → f = 1 ÷ ${l.y1.toFixed(4)} = ${fy.toFixed(1)} cm.`,
    `Mean f = ${((fx + fy) / 2).toFixed(1)} cm.`,
  ];
}
export const demoVariant = (studentSeed: number) => phyOpticsVariant(demoSeed(studentSeed));
export const resetBench = () => (useBench.setState(BENCH_IDLE), useLabView.setState({ spot: null }));
export { makeOps };
