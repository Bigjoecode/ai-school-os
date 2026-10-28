import { emptyPhyMomentsState, MOMENTS_CARD_X, MOMENTS_KNOWN, momentsBalanced, momentsMassBalance, momentsOtherBalance, phyFit, type MomentsTask, type PhyMomentsState, type PhyMomentsVariant } from '@aischool/shared';
import type { DemoBeat, DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import { r1, type Moments } from '../actions';
import { makeOps, type Ops } from './lab-actions';
import { NEEDED } from './scene-state';

/**
 * Mr Bayo's demonstration: the whole practical with his own rule and masses (a
 * demo seed that is never the student's, so nothing about their own answers
 * shows) and his own in-memory state, through the same operations as the
 * student's bench. Finding G and the first balance are shown step by step —
 * the rule tipping one way, then the other, then staying level — the second
 * more quickly, the others in one go; then the table, the graph, the slope and M.
 */

export const DEMO_SEED = 11;
export const demoSeed = (studentSeed: number) => (studentSeed === DEMO_SEED ? DEMO_SEED + 1 : DEMO_SEED);
export const demoEmpty = (task: MomentsTask, start = 45): PhyMomentsState => ({ ...emptyPhyMomentsState(), task, pivot: start, log: [{ t: 0, a: `task:${task}` }] });

export interface DemoCtx {
  o: Moments;
  v: PhyMomentsVariant;
  s: () => PhyMomentsState;
  ops: () => Ops;
}
type Beat = DemoBeat<DemoCtx>;
export type DemoStep = KitDemoStep<DemoCtx>;

const BAL = { mode: 'bench' as const, focus: 'balance', spot: null };
const BENCHV = { mode: 'bench' as const, focus: 'bench', spot: null };

/** A balance position on the 0.1 cm grid (searched outwards from the exact one). */
function onGrid(ok: (x: number) => boolean, exact: number): number {
  for (let k = 0; k < 20; k++) for (const x of [r1(exact + k * 0.1), r1(exact - k * 0.1)]) if (ok(x)) return x;
  return r1(exact);
}
export const gAt = (v: PhyMomentsVariant) => onGrid((x) => momentsBalanced(v, 'MOMENTS', { pivot: x, known: null, other: null }), v.g);
/** Where the demo balances the rule for the known mass at x: M's mark (MOMENTS) or the pivot (MASS). */
export function balanceFor(v: PhyMomentsVariant, task: MomentsTask, g: number, x: number): number {
  if (task === 'MASS') return onGrid((p) => momentsBalanced(v, task, { pivot: p, known: x, other: null }), momentsMassBalance(v, x));
  return onGrid((o) => momentsBalanced(v, task, { pivot: g, known: x, other: o }), momentsOtherBalance(v, g, x));
}
/** Sets the thing that is moved to balance: M's loop (MOMENTS) or the rule over the edge (MASS). */
const setBal = (c: DemoCtx, at: number) => (c.o.task === 'MASS' ? c.o.setPivot(at) : c.o.setLoop('other', at));

/** The table row the demo writes for reading k (marks read to 0.1 cm). */
function fillRow(c: DemoCtx, k: number) {
  const st = c.s();
  const r = st.readings[k];
  if (!r || r.known === null || st.g === null) return;
  const mass = c.o.task === 'MASS';
  const x2 = mass ? r.pivot : r.other!;
  const d1 = r1(mass ? r.pivot - r.known : st.g - r.known);
  const d2 = r1(mass ? st.g - r.pivot : x2 - st.g);
  const m = MOMENTS_KNOWN[c.o.task];
  c.o.update((x) => ({ ...x, table: x.table.map((row, j) => (j === k ? { x1: r.known!.toFixed(1), x2: x2.toFixed(1), d1: d1.toFixed(1), d2: d2.toFixed(1), m: ((m * d1) / d2).toFixed(1) } : row)) }));
}
/** Beats for one quick reading: the mass to its mark, a little past balance, balanced, taken, the row written. */
function quick(x: number, at0: number, gap: number): Beat[] {
  const steps: ((c: DemoCtx) => void)[] = [
    (c) => c.o.setLoop('known', x),
    (c) => setBal(c, balanceFor(c.v, c.o.task, c.s().g!, x) + 0.8),
    (c) => setBal(c, balanceFor(c.v, c.o.task, c.s().g!, x)),
    (c) => c.ops().take(),
    (c) => fillRow(c, c.s().readings.length - 1),
  ];
  return steps.map((run, n) => ({ at: at0 + n * gap, run }));
}

export function demoScript(task: MomentsTask, v: PhyMomentsVariant, precautions: string[]): DemoStep[] {
  const xs = MOMENTS_CARD_X[task];
  const x0 = xs[0]!;
  const g = gAt(v);
  const mass = task === 'MASS';
  const prec = precautions.slice(0, 2).join(' ');
  const gTries = [g - 4, g + 2, g - 1, g + 0.5, g - 0.3, g];
  return [
    {
      id: 'intro',
      title: 'The apparatus',
      say: () => `Today: ${mass ? 'the centre of gravity and the mass of a metre rule' : 'the principle of moments'}. On my bench: a metre rule, a knife edge, ${mass ? 'a 100 gram mass' : 'a 50 gram mass, an unknown mass M'} and thread for the loops.`,
      ms: 7000,
      view: BENCHV,
      point: 'rule',
      beats: NEEDED[task].map((id, n) => ({ at: 300 + n * 400, run: (c: DemoCtx) => c.o.note(`collect:${id}`) })),
    },
    {
      id: 'setup',
      title: 'The rule on the knife edge',
      say: () => 'The knife edge stands on the bench and the rule lies across it, scale up. Two pointers mark where the ends are when the rule is level.',
      ms: 6000,
      view: BAL,
      point: 'edge',
      beats: [
        { at: 500, run: (c) => c.ops().place('edge') },
        { at: 1700, run: (c) => c.ops().place('rule') },
      ],
    },
    {
      id: 'g',
      title: 'Find G: balance the rule alone',
      say: () => 'I slide the rule over the edge and let go each time. It tips one way… then the other… smaller and smaller steps… until it stays level with the pointers. Its weight acts at that point: the centre of gravity G.',
      ms: 13000,
      view: BAL,
      point: 'rule',
      beats: [...gTries.map((p, n): Beat => ({ at: 300 + n * 1900, run: (c) => c.o.setPivot(r1(p)) })), { at: 11800, run: (c) => (c.ops().recordG(), c.o.update((x) => ({ ...x, answers: { ...x.answers, g: { value: g.toFixed(1), unit: 'cm' } } }))) }],
    },
    {
      id: 'first',
      title: mass ? `The 100 g at ${x0.toFixed(1)} cm` : `The 50 g at ${x0.toFixed(1)} cm`,
      say: () =>
        mass
          ? `Now I hang the 100 gram mass at the ${x0} centimetre mark. The rule tips that way, so I slide it over the edge towards the mass, letting go each time, until it balances again at P.`
          : `I keep the edge at G. The 50 gram mass hangs at the ${x0} centimetre mark, and M on the other side. M too far out: that end drops. Nearer… nearer… until the rule stays level.`,
      ms: 13000,
      view: BAL,
      point: mass ? 'rule' : 'other',
      beats: (() => {
        const tries = [3, -1.5, 0.8, -0.3, 0];
        const out: Beat[] = [{ at: 200, run: (c) => (c.ops().hang('known'), c.o.setLoop('known', x0)) }];
        if (!mass) out.push({ at: 1200, run: (c) => c.ops().hang('other') });
        tries.forEach((d, n) => out.push({ at: 2600 + n * 2000, run: (c) => setBal(c, r1(balanceFor(c.v, task, g, x0) + (mass ? -d : d))) }));
        return out;
      })(),
    },
    {
      id: 'read',
      title: 'Read the marks at eye level',
      say: (c) =>
        mass
          ? `I read P, the mark over the edge, with my eye straight in front of it: about ${c.s().pivot.toFixed(1)} centimetres. d one is P minus ${x0}; d two is G minus P.`
          : `I read each loop’s centre line with my eye straight in front of it. M is at about ${(c.s().other ?? 0).toFixed(1)} centimetres. d one is G minus ${x0}; d two is M’s mark minus G.`,
      ms: 8000,
      view: { mode: 'read' as const, spot: null, eye: 0.03 },
      panel: 'notebook',
      beats: [
        { at: 2500, run: (c) => c.ops().take() },
        { at: 4500, run: (c) => fillRow(c, 0) },
      ],
    },
    {
      id: 'second',
      title: `${mass ? 'The 100 g' : 'The 50 g'} at ${xs[1]!.toFixed(1)} cm`,
      say: () => `Next mark: ${xs[1]} centimetres. Balance, let go, check it stays level, read, record.`,
      ms: 6500,
      view: BAL,
      point: mass ? 'rule' : 'other',
      beats: quick(xs[1]!, 300, 1100),
    },
    {
      id: 'rest',
      title: 'The other marks',
      say: () => `And the same at ${xs.slice(2).join(', ')} centimetres — five readings spread well out.`,
      ms: 10000,
      view: BAL,
      point: 'rule',
      beats: xs.slice(2).flatMap((x, n) => quick(x, 300 + n * 3000, 500)),
    },
    {
      id: 'graph',
      title: 'The graph of d₁ against d₂',
      say: () => 'I plot d one up the side against d two along the bottom. The points lie on a straight line through the origin: d one over d two is the same every time.',
      ms: 7500,
      view: BENCHV,
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 1500,
          run: (c) => {
            const pts = c.s().table.map((r) => ({ x: Number(r.d2), y: Number(r.d1) }));
            const fit = phyFit(pts);
            if (!fit) return;
            const xs2 = pts.map((p) => p.x);
            const a = Math.min(...xs2);
            const b = Math.max(...xs2);
            c.o.update((x) => ({ ...x, line: { x1: a, y1: Number((fit.intercept + fit.slope * a).toFixed(2)), x2: b, y2: Number((fit.intercept + fit.slope * b).toFixed(2)) } }));
          },
        },
      ],
    },
    {
      id: 'mass',
      title: 'The slope gives M',
      say: (c) => {
        const l = c.s().line;
        const sl = l ? (l.y2 - l.y1) / (l.x2 - l.x1) : null;
        const m = MOMENTS_KNOWN[task];
        return `The slope is d one over d two, which is M over m: about ${sl ? sl.toFixed(3) : '—'}. So M is ${m} grams times the slope: about ${sl ? (m * sl).toFixed(0) : '—'} grams. The rows give the same, on average. ${prec ? `Precautions: ${prec}` : ''}`;
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
              const sl = (l.y2 - l.y1) / (l.x2 - l.x1);
              const m = MOMENTS_KNOWN[task];
              const ms = x.table.map((r) => Number(r.m)).filter(Number.isFinite);
              const mean = ms.reduce((t, y) => t + y, 0) / Math.max(1, ms.length);
              return {
                ...x,
                answers: { ...x.answers, slope: { value: sl.toPrecision(3), unit: '' }, mass: { value: (m * Number(sl.toPrecision(3))).toFixed(1), unit: 'g' }, mean: { value: mean.toFixed(1), unit: 'g' } },
                written: { precautions: prec || 'The rule was balanced horizontally before each reading. Distances were measured from the pivot, to the centre of each thin thread loop.' },
              };
            }),
        },
      ],
    },
  ];
}

/** The worked calculation shown with the last step (demonstration values). */
export function demoCalculation(s: PhyMomentsState): string[] {
  const l = s.line;
  if (!l || !s.answers.slope.value) return [];
  const task = s.task ?? 'MOMENTS';
  const m = MOMENTS_KNOWN[task];
  const row = s.table[0];
  return [
    `Slope = Δd₁ ÷ Δd₂ = (${l.y2.toFixed(1)} − ${l.y1.toFixed(1)}) ÷ (${l.x2.toFixed(1)} − ${l.x1.toFixed(1)}) = ${s.answers.slope.value}.`,
    `M = m × slope = ${m} g × ${s.answers.slope.value} = ${s.answers.mass.value} g.`,
    row ? `From row 1: ${m} × ${row.d1} = M × ${row.d2} → M = ${row.m} g. Mean of the rows: ${s.answers.mean.value} g.` : '',
  ].filter(Boolean);
}
export { makeOps };
