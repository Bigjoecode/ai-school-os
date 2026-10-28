import { CIRCUITS_RHEOSTAT_MAX, SERIES_LABEL, bridgeBalance, circuitsMeters, circuitsWireKey, emptyPhyCircuitsState, phyFit, type CircuitsTask, type PhyCircuitsState, type PhyCircuitsVariant, type SeriesArrangement } from '@aischool/shared';
import type { DemoBeat, DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import type { Spot } from '../../../lab3d-kit/store';
import { settingsOf, type Circuits } from '../actions';
import { SPOTS } from './content';
import { EMF_CURRENTS, SERIES_ORDER } from './guide';
import { GOOD_WIRES, SERIES_WIRING } from './layout';
import { needed } from './scene-state';

/**
 * Mr Bayo's demonstration of each task on its own demo seed (never the
 * student's) and its own in-memory state, through the same actions as the
 * student's lab. Beats are deterministic, so jumping replays them exactly.
 */

export const demoSeed = (studentSeed: number) => (studentSeed === 7 ? 8 : 7);
export interface DemoCtx {
  o: Circuits;
  v: PhyCircuitsVariant;
  s: () => PhyCircuitsState;
}
type Beat = DemoBeat<DemoCtx>;
export type DemoStep = KitDemoStep<DemoCtx>;

const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);
const sf3 = (x: number) => Number(x.toPrecision(3));
const bench = (spot: Spot) => ({ mode: 'bench' as const, spot });
const AT_BENCH = bench({ target: [0.1, 0.1, 0.05], dist: 1.15, pitch: 0.62 });
const AT_BOARD = bench(SPOTS.board);
const AT_BRIDGE = bench(SPOTS.bridge);
const AT_JOCKEY = bench(SPOTS.jockey);
const AT_GALVO = bench({ ...SPOTS.galvanometer, dist: 0.34 });
const AT_AMMETER = bench({ ...SPOTS.ammeter, dist: 0.3 });
const AT_VOLTMETER = bench({ ...SPOTS.voltmeter, dist: 0.3 });

export const demoEmpty = (task: CircuitsTask): PhyCircuitsState => ({ ...emptyPhyCircuitsState(), task, log: [{ t: 0, a: `task:${task}` }] });

const collectStep = (task: CircuitsTask, say: string): DemoStep => ({
  id: 'apparatus',
  title: 'The apparatus',
  say: () => say,
  ms: 7000,
  view: AT_BENCH,
  beats: needed(task).map((a, k) => ({ at: 300 + k * 450, run: (c: DemoCtx) => c.o.note(`collect:${a.id}`) })),
});
const wireBeats = (pairs: [string, string][], from = 500, gap = 900): Beat[] => pairs.map(([a, b], k) => ({ at: from + k * gap, run: (c: DemoCtx) => c.o.connect(a as never, b as never) }));
const lineBeat = (pick: (s: PhyCircuitsState) => { x: number; y: number }[]): Beat => ({
  at: 1500,
  run: (c) => {
    const pts = pick(c.s()).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    const fit = phyFit(pts);
    if (!fit) return;
    const xs = pts.map((p) => p.x);
    const x1 = Math.min(0, ...xs);
    const x2 = Math.max(...xs);
    c.o.update((x) => ({ ...x, line: { x1, y1: Number((fit.intercept + fit.slope * x1).toPrecision(4)), x2, y2: Number((fit.intercept + fit.slope * x2).toPrecision(4)) } }));
  },
});
const lineSlope = (s: PhyCircuitsState) => (s.line ? (s.line.y2 - s.line.y1) / (s.line.x2 - s.line.x1) : 0);
const lineIntercept = (s: PhyCircuitsState) => (s.line ? s.line.y1 - lineSlope(s) * s.line.x1 : 0);

// ------------------------------------------------------------------ metre bridge

/** Mr Bayo's R values: four that balance mid-wire, then the interchanged check. */
export function bridgePlan(v: PhyCircuitsVariant): { R: number; swap: boolean; l: number }[] {
  // The four whole-ohm values whose balance comes nearest the middle of the wire, in order.
  const Rs = Array.from({ length: 20 }, (_, k) => k + 1)
    .sort((a, b) => Math.abs((100 * v.X) / (v.X + a) - 50) - Math.abs((100 * v.X) / (v.X + b) - 50))
    .slice(0, 4)
    .sort((a, b) => a - b);
  const out = Rs.map((R) => ({ R, swap: false }));
  out.push({ R: Math.max(1, Math.min(20, Math.round(v.X))), swap: true });
  return out.map((p) => ({ ...p, l: Math.round(bridgeBalance(v, { rbox: p.R, swap: p.swap, heat: 0 }) * 10) / 10 }));
}
function bridgeRow(R: number, l: number, swap: boolean) {
  const X = swap ? (R * (100 - l)) / l : (R * l) / (100 - l);
  return { R: String(R), l: f1(l), m: f1(100 - l), q: swap ? '' : ((100 - l) / l).toFixed(3), X: X.toFixed(2) };
}
function bridgeSteps(): DemoStep[] {
  const steps: DemoStep[] = [
    collectStep('BRIDGE', 'Good day! I’m Mr Bayo. For the metre bridge I take a dry cell, a key, the metre bridge with its jockey, a centre-zero galvanometer, a resistance box, the unknown resistor X and connecting wires. X goes in the left gap, the box in the right.'),
    { id: 'wire', title: 'Cell and key across the wire; galvanometer to the jockey', say: () => 'The cell and key go across the two ends of the bridge wire, A and C. The galvanometer goes from the centre strip D — between X and R — to the jockey.', ms: 7600, view: AT_BOARD, point: 'board', beats: wireBeats(GOOD_WIRES.BRIDGE.map(([a, b]) => [a, b]), 600, 1200) },
  ];
  for (let i = 0; i < 5; i++) {
    const swap = i === 4;
    steps.push(
      {
        id: `set-${i}`,
        title: swap ? 'Interchange X and R' : `R = a new value (${i + 1} of 4)`,
        say: (c) => {
          const p = bridgePlan(c.v)[i]!;
          return swap ? `Now the check: I swap X and R, so X is in the right gap, with R = ${p.R} ohms. Then X = R times (100 − l) over l.` : `I pull plugs out of the box for R = ${p.R} ohms${i === 0 ? ' — about the size of X, so the balance comes near the middle of the wire' : ''}, and close the key.`;
        },
        ms: 6200,
        view: bench(SPOTS.rbox),
        point: swap ? 'unknown' : 'rbox',
        beats: [
          { at: 300, run: (c) => (swap ? c.o.toggleSwap() : undefined) },
          { at: 900, run: (c) => c.o.setRbox(bridgePlan(c.v)[i]!.R) },
          { at: 4200, run: (c) => c.o.toggleKey() },
        ],
      },
      {
        id: `find-${i}`,
        title: 'Tap the jockey to find the balance point',
        say: (c) => {
          const p = bridgePlan(c.v)[i]!;
          return i === 0
            ? `I tap the jockey near one end: the galvanometer kicks one way. Near the other end it kicks the other way. Moving it — lifted, never sliding — I close in until a tap gives no deflection at all: ${f1(p.l)} centimetres from A.`
            : `Tap, tap — closing in from both sides. No deflection at ${f1(p.l)} cm.`;
        },
        ms: i === 0 ? 11000 : 6500,
        view: i === 0 ? AT_GALVO : AT_JOCKEY,
        point: i === 0 ? 'galvanometer' : 'bridge',
        beats: (i === 0
          ? [
              { at: 600, run: (c: DemoCtx) => c.o.setJockey(15) },
              { at: 1200, run: (c: DemoCtx) => c.o.tap() },
              { at: 3400, run: (c: DemoCtx) => c.o.setJockey(85) },
              { at: 4000, run: (c: DemoCtx) => c.o.tap() },
              { at: 6200, run: (c: DemoCtx) => c.o.setJockey(bridgePlan(c.v)[0]!.l + 3) },
              { at: 6800, run: (c: DemoCtx) => c.o.tap() },
              { at: 8600, run: (c: DemoCtx) => c.o.setJockey(bridgePlan(c.v)[0]!.l) },
              { at: 9200, run: (c: DemoCtx) => c.o.tap() },
            ]
          : [
              { at: 500, run: (c: DemoCtx) => c.o.setJockey(bridgePlan(c.v)[i]!.l - 2) },
              { at: 1000, run: (c: DemoCtx) => c.o.tap() },
              { at: 2600, run: (c: DemoCtx) => c.o.setJockey(bridgePlan(c.v)[i]!.l) },
              { at: 3200, run: (c: DemoCtx) => c.o.tap() },
            ]) as Beat[],
      },
      {
        id: `rec-${i}`,
        title: 'Record l, then open the key',
        say: (c) => {
          const p = bridgePlan(c.v)[i]!;
          const r = bridgeRow(p.R, p.l, p.swap);
          return `l = ${r.l} cm, so 100 − l = ${r.m} cm and X = ${p.R} × ${swap ? `${r.m} ÷ ${r.l}` : `${r.l} ÷ ${r.m}`} = ${r.X} ohms. I open the key straight away.`;
        },
        ms: 6500,
        view: AT_BRIDGE,
        point: 'book',
        panel: 'notebook',
        beats: [
          {
            at: 900,
            run: (c) => {
              const p = bridgePlan(c.v)[i]!;
              c.o.takeReading();
              c.o.update((x) => ({ ...x, bridge: x.bridge.map((r, k) => (k === x.bridge.length - 1 ? bridgeRow(p.R, p.l, p.swap) : r)) }));
            },
          },
          { at: 4200, run: (c) => c.o.toggleKey() },
        ],
      },
    );
  }
  steps.push(
    { id: 'graph', title: 'Plot R against (100 − l)/l', say: () => 'I plot R against (100 − l) over l for the four readings with X on the left, and draw the best straight line. It passes through the origin, and its slope is X.', ms: 6500, view: AT_BENCH, point: 'book', panel: 'notebook', beats: [lineBeat((s) => s.bridge.filter((_, i) => !s.readings[i]?.swap).map((r) => ({ x: Number(r.q), y: Number(r.R) })))] },
    {
      id: 'calc',
      title: 'Mean X and the slope',
      say: (c) => {
        const s = c.s();
        const Xs = s.bridge.map((r) => Number(r.X));
        return `The mean of my X values is ${f2(Xs.reduce((a, b) => a + b, 0) / Xs.length)} ohms; the slope of the line is ${sf3(lineSlope(s))} ohms. They agree.`;
      },
      ms: 7000,
      view: AT_BENCH,
      point: 'book',
      panel: 'calc',
      beats: [
        {
          at: 1200,
          run: (c) =>
            c.o.update((x) => {
              const Xs = x.bridge.map((r) => Number(r.X));
              return {
                ...x,
                answers: { ...x.answers, mean: { value: f2(Xs.reduce((a, b) => a + b, 0) / Xs.length), unit: 'Ω' }, slope: { value: String(sf3(lineSlope(x))), unit: 'Ω' } },
                written: { conclusion: `X = ${f2(Xs.reduce((a, b) => a + b, 0) / Xs.length)} Ω; the check with X and R interchanged agrees.`, precautions: 'I tapped the jockey instead of sliding it. I chose R so the balance point was near the middle of the wire.' },
              };
            }),
        },
      ],
    },
    { id: 'end', title: 'Precautions', say: () => 'My precautions: I tapped the jockey, never sliding it; I chose R to balance near the middle; I opened the key between readings; and I interchanged X and R to cancel the end errors. Your turn!', ms: 7000, view: AT_BENCH, panel: 'notebook', beats: [] },
  );
  return steps;
}

// ------------------------------------------------------------------ e.m.f.

const emfRheostat = (v: PhyCircuitsVariant, I: number) => Math.max(0, Math.min(1, Math.round(((v.emf / I - v.internal - 0.06) / CIRCUITS_RHEOSTAT_MAX) * 200) / 200));
function emfPlanned(c: DemoCtx, i: number) {
  const s = c.s();
  const m = circuitsMeters(c.v, { ...settingsOf(s), rheostat: emfRheostat(c.v, EMF_CURRENTS[i]!), key: true, heat: 0 }, i);
  return { I: Number(f2(m.I)), V: Number(f2(m.V)) };
}
function emfSteps(): DemoStep[] {
  const steps: DemoStep[] = [
    collectStep('EMF', 'Good day! I’m Mr Bayo. For the e.m.f. and internal resistance I take the dry cell, a key, a rheostat, an ammeter, a high-resistance voltmeter and connecting wires.'),
    { id: 'wire', title: 'Series loop; voltmeter across the cell', say: () => 'Cell plus to the key, the key to the ammeter’s plus, the ammeter to the rheostat, the rheostat’s slider back to the cell. Then the voltmeter directly across the cell’s terminals.', ms: 8000, view: AT_BOARD, point: 'board', beats: wireBeats(GOOD_WIRES.EMF.map(([a, b]) => [a, b]), 500, 1100) },
    {
      id: 'e0',
      title: 'Key open: the voltmeter reads (almost) E',
      say: (c) => {
        const m = circuitsMeters(c.v, { ...settingsOf(c.s()), key: false, heat: 0 }, 'open');
        return `With the key open hardly any current flows, so the voltmeter reads the e.m.f.: ${f2(m.V)} volts. I write that down.`;
      },
      ms: 6200,
      view: AT_VOLTMETER,
      point: 'voltmeter',
      beats: [{ at: 2500, run: (c) => c.o.update((x) => ({ ...x, answers: { ...x.answers, e0: { value: f2(circuitsMeters(c.v, { ...settingsOf(x), key: false, heat: 0 }, 'open').V), unit: 'V' } } })) }],
    },
  ];
  for (let i = 0; i < EMF_CURRENTS.length; i++) {
    const set: Beat = { at: 300, run: (c) => c.o.setRheostat(emfRheostat(c.v, EMF_CURRENTS[i]!)) };
    const close: Beat = { at: 1300, run: (c) => c.o.toggleKey() };
    const take: Beat = {
      at: 3000,
      run: (c) => {
        const p = emfPlanned(c, i);
        c.o.takeReading();
        c.o.update((x) => ({ ...x, emf: x.emf.map((r, k) => (k === x.emf.length - 1 ? { I: f2(p.I), V: f2(p.V) } : r)) }));
      },
    };
    const open: Beat = { at: 4300, run: (c) => c.o.toggleKey() };
    steps.push({
      id: `read-${i}`,
      title: `I ≈ ${f2(EMF_CURRENTS[i]!)} A`,
      say: (c) => {
        const p = emfPlanned(c, i);
        return i === 0 ? `I set the rheostat for about 0.2 amperes, close the key and read both meters face on: ${f2(p.I)} A and ${f2(p.V)} V — already less than the e.m.f. Record, and open the key so the cell does not polarise.` : `Less resistance, more current: ${f2(p.I)} A, and the terminal p.d. falls to ${f2(p.V)} V. Record, open the key.`;
      },
      ms: i === 0 ? 8500 : 5600,
      view: i === 0 ? AT_AMMETER : AT_BOARD,
      point: i === 0 ? 'ammeter' : 'rheostat',
      panel: i === 0 ? undefined : 'notebook',
      beats: [set, close, take, open],
    });
  }
  steps.push(
    { id: 'graph', title: 'Plot V against I', say: () => 'I plot V against I. The points fall on a straight line sloping down. I extend it back to the V-axis, where I is zero.', ms: 6500, view: AT_BENCH, point: 'book', panel: 'notebook', beats: [lineBeat((s) => s.emf.map((r) => ({ x: Number(r.I), y: Number(r.V) })))] },
    {
      id: 'calc',
      title: 'Intercept E, slope −r',
      say: (c) => `V = E − Ir. The intercept on the V-axis is E = ${f2(lineIntercept(c.s()))} volts; the slope is ${sf3(lineSlope(c.s()))} volts per ampere, so the internal resistance is r = ${sf3(-lineSlope(c.s()))} ohms.`,
      ms: 8000,
      view: AT_BENCH,
      point: 'book',
      panel: 'calc',
      beats: [
        {
          at: 1500,
          run: (c) =>
            c.o.update((x) => ({
              ...x,
              answers: { ...x.answers, slope: { value: String(sf3(lineSlope(x))), unit: 'V/A' }, emf: { value: f2(lineIntercept(x)), unit: 'V' }, r: { value: String(sf3(-lineSlope(x))), unit: 'Ω' } },
              written: { conclusion: 'The terminal p.d. falls in a straight line as the current rises: V = E − Ir.', precautions: 'I closed the key only while reading so the cell did not polarise. I read the meters from directly in front to avoid parallax.' },
            })),
        },
      ],
    },
    { id: 'end', title: 'Precautions', say: () => 'My precautions: the key closed only while reading, so the cell does not run down; the voltmeter straight across the cell; and no parallax when reading the meters. Your turn!', ms: 6500, view: AT_BENCH, panel: 'notebook', beats: [] },
  );
  return steps;
}

// ------------------------------------------------------------------ series and parallel

function seriesPlanned(c: DemoCtx, arr: SeriesArrangement, i: number) {
  const m = circuitsMeters(c.v, { ...settingsOf(c.s()), wires: SERIES_WIRING[arr].map(([a, b]) => circuitsWireKey(a, b)), key: true, heat: 0 }, i);
  const I = Number(f2(m.I));
  const V = Number(f2(m.V));
  return { I, V, R: I > 0 ? V / I : 0 };
}
function seriesSteps(): DemoStep[] {
  const steps: DemoStep[] = [collectStep('SERIES', 'Good day! I’m Mr Bayo. For resistors in series and parallel I take a dry cell, a key, an ammeter, a voltmeter, the two resistors R₁ and R₂, and connecting wires.')];
  SERIES_ORDER.forEach((arr, i) => {
    const rewire: Beat[] = [
      { at: 200, run: (c) => c.s().wires.forEach((w) => c.o.removeWire(w)) },
      ...wireBeats(SERIES_WIRING[arr].map(([a, b]) => [a, b]), 700, 600),
    ];
    const n = SERIES_WIRING[arr].length;
    steps.push(
      {
        id: `wire-${arr}`,
        title: SERIES_LABEL[arr],
        say: () =>
          arr === 'R1'
            ? 'First R₁ alone: cell, key, ammeter and R₁ in one loop, with the voltmeter across R₁.'
            : arr === 'R2'
              ? 'Then R₂ alone, the same way.'
              : arr === 'S'
                ? 'Now R₁ and R₂ in series — end to end, one path — with the voltmeter across both.'
                : 'And in parallel: both left ends joined, both right ends joined — two paths — with the voltmeter across the pair.',
        ms: 1200 + n * 600 + 1200,
        view: bench(SPOTS.resistors),
        point: arr === 'R2' ? 'r2' : 'r1',
        beats: rewire,
      },
      {
        id: `read-${arr}`,
        title: 'Close, read, record, open',
        say: (c) => {
          const p = seriesPlanned(c, arr, i);
          return `Key closed: ${f2(p.I)} A and ${f2(p.V)} V, so R = V ÷ I = ${f2(p.R)} ohms. Key open.`;
        },
        ms: 5600,
        view: AT_BOARD,
        point: 'ammeter',
        panel: 'notebook',
        beats: [
          { at: 300, run: (c) => c.o.toggleKey() },
          {
            at: 2200,
            run: (c) => {
              const p = seriesPlanned(c, arr, i);
              c.o.takeReading();
              c.o.update((x) => ({ ...x, series: x.series.map((r, k) => (k === x.series.length - 1 ? { arr, V: f2(p.V), I: f2(p.I), R: f2(p.R) } : r)) }));
            },
          },
          { at: 4200, run: (c) => c.o.toggleKey() },
        ],
      },
    );
  });
  steps.push(
    {
      id: 'calc',
      title: 'Compare with the formulas',
      say: (c) => {
        const R = (a: SeriesArrangement) => Number(c.s().series.find((r) => r.arr === a)?.R ?? 0);
        const [a, b] = [R('R1'), R('R2')];
        return `R₁ + R₂ = ${f2(a + b)} ohms against ${f2(R('S'))} measured in series. R₁R₂ over R₁ + R₂ = ${f2((a * b) / (a + b))} ohms against ${f2(R('P'))} in parallel. Series is bigger than either; parallel smaller than either.`;
      },
      ms: 9000,
      view: AT_BENCH,
      point: 'book',
      panel: 'calc',
      beats: [
        {
          at: 1500,
          run: (c) =>
            c.o.update((x) => {
              const R = (a: SeriesArrangement) => Number(x.series.find((r) => r.arr === a)?.R ?? 0);
              const [a, b] = [R('R1'), R('R2')];
              const u = (v: number) => ({ value: f2(v), unit: 'Ω' });
              return {
                ...x,
                answers: { ...x.answers, r1: u(a), r2: u(b), rs: u(R('S')), rp: u(R('P')), rsCalc: u(a + b), rpCalc: u((a * b) / (a + b)) },
                written: { conclusion: 'The series resistance is larger than either resistor and equals R1 + R2; the parallel resistance is smaller than either and agrees with 1/R = 1/R1 + 1/R2.', precautions: 'I opened the key between readings. I made the connections clean and tight.' },
              };
            }),
        },
      ],
    },
    { id: 'end', title: 'Precautions', say: () => 'My precautions: the key opened between readings so the resistors stay cool; clean, tight connections; and the meters read face on. Your turn!', ms: 6000, view: AT_BENCH, panel: 'notebook', beats: [] },
  );
  return steps;
}

export function demoScript(task: CircuitsTask): DemoStep[] {
  return task === 'BRIDGE' ? bridgeSteps() : task === 'EMF' ? emfSteps() : seriesSteps();
}

/** The worked calculation beside the demo. */
export function demoCalculation(s: PhyCircuitsState): string[] {
  if (s.task === 'BRIDGE') {
    if (!s.answers.mean.value) return [];
    return [...s.bridge.map((r, i) => (s.readings[i]?.swap ? `Interchanged: X = ${r.R} × ${r.m} ÷ ${r.l} = ${r.X} Ω` : `R = ${r.R} Ω: X = ${r.R} × ${r.l} ÷ ${r.m} = ${r.X} Ω`)), `Mean X = ${s.answers.mean.value} Ω; slope of R against (100 − l)/l = ${s.answers.slope.value} Ω`];
  }
  if (s.task === 'EMF') {
    if (!s.answers.emf.value || !s.line) return [];
    const l = s.line;
    return [`Slope = (${f2(l.y2)} − ${f2(l.y1)}) V ÷ (${f2(l.x2)} − ${f2(l.x1)}) A = ${s.answers.slope.value} V A⁻¹`, `E = intercept on the V-axis = ${s.answers.emf.value} V`, `r = −slope = ${s.answers.r.value} Ω`];
  }
  if (!s.answers.rsCalc.value) return [];
  return [`R₁ = ${s.answers.r1.value} Ω, R₂ = ${s.answers.r2.value} Ω`, `Series: R₁ + R₂ = ${s.answers.rsCalc.value} Ω; measured ${s.answers.rs.value} Ω`, `Parallel: R₁R₂/(R₁ + R₂) = ${s.answers.rpCalc.value} Ω; measured ${s.answers.rp.value} Ω`];
}
