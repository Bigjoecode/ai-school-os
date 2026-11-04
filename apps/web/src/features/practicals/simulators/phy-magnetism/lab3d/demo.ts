import {
  DIODE_CARD_FWD,
  DIODE_CARD_REV,
  EM_CARD,
  diodePotFor,
  diodeReading,
  emLift,
  emRheoFor,
  emptyPhyMagnetismState,
  fieldNeutrals,
  indCardEmf,
  indDeflection,
  indShown,
  phyFit,
  sheetCfg,
  type MagTask,
  type PhyMagnetismState,
  type PhyMagnetismVariant,
} from '@aischool/shared';
import type { DemoBeat, DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import { emSettings, openSheet, type Magnetism } from '../actions';
import { startRun } from './bench-store';
import { makeOps, RUN_MS, type Ops } from './lab-actions';
import { NEEDED, PLACEABLE } from './scene-state';

/**
 * Mr Bayo's demonstration: the whole practical with his own apparatus (a
 * demo seed that is never the student's) and his own in-memory state,
 * through the same actions as the student's bench; then the table, the
 * graph and the result.
 */

export const DEMO_SEED = 11;
export const demoSeed = (studentSeed: number) => (studentSeed === DEMO_SEED ? DEMO_SEED + 1 : DEMO_SEED);
export const demoEmpty = (task: MagTask): PhyMagnetismState => ({ ...emptyPhyMagnetismState(), task, log: [{ t: 0, a: `task:${task}` }] });

export interface DemoCtx {
  o: Magnetism;
  v: PhyMagnetismVariant;
  s: () => PhyMagnetismState;
  ops: () => Ops;
}
type Beat = DemoBeat<DemoCtx>;
export type DemoStep = KitDemoStep<DemoCtx>;

const RIG: Record<MagTask, string> = { FIELD: 'field', ELECTROMAGNET: 'em', INDUCTION: 'ind', DIODE: 'diode' };
const view = (task: MagTask) => ({ mode: 'bench' as const, focus: RIG[task], spot: null });
const BENCHV = { mode: 'bench' as const, focus: 'bench', spot: null };
const at = (t0: number, gap: number, runs: ((c: DemoCtx) => void)[]): Beat[] => runs.map((run, n) => ({ at: t0 + n * gap, run }));
const half = (x: number) => Math.round(x * 2) / 2;
const intro = (task: MagTask, say: string): DemoStep => ({ id: 'intro', title: 'The apparatus', say: () => say, ms: 7000, view: BENCHV, point: 'cupboard', beats: NEEDED[task].map((id, n) => ({ at: 300 + n * 300, run: (c: DemoCtx) => c.o.note(`collect:${id}`) })) });
const setupStep = (task: MagTask, say: string, extra: Beat[] = []): DemoStep => ({ id: 'setup', title: 'Setting up', say: () => say, ms: 8000, view: view(task), point: PLACEABLE[task][0], beats: [...PLACEABLE[task].map((id, n) => ({ at: 300 + n * 500, run: (c: DemoCtx) => c.o.note(`place:${id}`) })), ...extra] });
const prec = (p: string, fallback: string) => p || fallback;

// ------------------------------------------------------------------ FIELD

function markNeutrals(c: DemoCtx, ids: [string, string], side: 'x' | 'y') {
  const o = openSheet(c.s());
  if (!o) return;
  const pts = fieldNeutrals(c.v, sheetCfg(o.sheet));
  const pos = pts.find((p) => p[side] > 0);
  const neg = pts.find((p) => p[side] < 0);
  const cells: Record<string, string> = {};
  for (const [p, id] of [
    [pos, ids[0]],
    [neg, ids[1]],
  ] as const) {
    if (!p) continue;
    c.o.setCompassAt(p.x, p.y);
    c.o.markNeutral();
    const m = c.s().sheets[o.i]!.neutrals.slice(-1)[0]!;
    cells[id] = Math.hypot(m.x, m.y).toFixed(1);
  }
  c.o.update((x) => ({ ...x, cells: { ...x.cells, ...cells } }));
}
function fieldScript(p: string): DemoStep[] {
  return [
    intro('FIELD', 'Today: plotting the field of a bar magnet and finding its neutral points. On my bench: a drawing board, white paper, a pair of bar magnets, a small plotting compass, a sharp pencil and a ruler.'),
    setupStep('FIELD', 'Board flat, paper pinned. First the compass alone: it sets along the magnetic meridian, and I line the paper up with it. My keys and phone go in my bag — steel bends the field. Then the magnet, N pole pointing north.', [
      { at: 1200, run: (c) => c.o.markMeridian() },
      { at: 2400, run: (c) => c.o.clearSteel() },
      { at: 3000, run: (c) => (c.o.setTapEach(true), c.o.setCompass('small')) },
    ]),
    {
      id: 'lines',
      title: 'Dot to dot',
      say: () => 'I put the compass beside the N end, mark both ends of the needle, then move it so its tail is on the last dot — and again, round to the S pole, tapping it gently each time. Lines from the sides curve round to S; lines from the end run off the paper to the north.',
      ms: 14000,
      view: { mode: 'bench' as const, focus: 'field', spot: null },
      point: 'compass',
      beats: [4, 5, 6, 7, 8, 9, 2, 3].flatMap((st, n) => at(400 + n * 1500, 500, [(c) => void c.o.startLine(st), (c) => void c.o.nextDot(true)])),
    },
    {
      id: 'neutral',
      title: 'The neutral points',
      say: () => 'Arrows from N to S. Now I move the compass along the east–west line: here the needle swings round — it rests in any direction. The magnet’s field cancels the Earth’s: a neutral point, X. And Y on the west.',
      ms: 11000,
      view: { mode: 'read' as const, spot: null },
      point: 'compass',
      beats: [{ at: 400, run: (c) => void c.o.arrows() }, { at: 2500, run: (c) => markNeutrals(c, ['xe', 'yw'], 'x') }],
    },
    {
      id: 'reverse',
      title: 'The magnet reversed',
      say: () => 'Now N pointing south, on a fresh sheet. The neutral points are on the axis now, beyond each end — and further out.',
      ms: 11000,
      view: { mode: 'read' as const, spot: null },
      point: 'magnet',
      beats: [
        { at: 400, run: (c) => c.o.setFacing('south') },
        ...[6, 7].flatMap((st, n) => at(1200 + n * 1200, 400, [(c) => void c.o.startLine(st), (c) => void c.o.nextDot(true)])),
        { at: 4500, run: (c) => markNeutrals(c, ['an', 'as'], 'y') },
      ],
    },
    {
      id: 'calc',
      title: 'Means and ratio',
      say: (c) => {
        const x = c.s().cells;
        const me = (Number(x.xe) + Number(x.yw)) / 2;
        const ma = (Number(x.an) + Number(x.as)) / 2;
        return me && ma ? `Mean equatorial distance ${me.toFixed(1)} centimetres; mean axial ${ma.toFixed(1)}; so the axial points are ${(ma / me).toFixed(2)} times as far out. ${p ? `Precautions: ${p}` : ''}` : `The means and their ratio. ${p ? `Precautions: ${p}` : ''}`;
      },
      ms: 10000,
      view: BENCHV,
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 600,
          run: (c) =>
            c.o.update((x) => {
              const me = (Number(x.cells.xe) + Number(x.cells.yw)) / 2;
              const ma = (Number(x.cells.an) + Number(x.cells.as)) / 2;
              return { ...x, answers: { ...x.answers, me: { value: me.toFixed(2), unit: 'cm' }, ma: { value: ma.toFixed(2), unit: 'cm' }, ratio: { value: me ? (ma / me).toPrecision(3) : '', unit: '' } }, written: { precautions: prec(p, 'The board was far from iron objects. The compass was tapped gently before each dot.') } };
            }),
        },
      ],
    },
  ];
}

// ------------------------------------------------------------------ ELECTROMAGNET

export function emFillRows(c: DemoCtx) {
  const s = c.s();
  const set = emSettings(s);
  c.o.update((x) => ({
    ...x,
    rows: x.rows.map((r) => {
      const st = set[r.key];
      if (!st) return r;
      const res = st.lifts.map((k) => emLift(c.v, k, s.lifts[k]!));
      const c1 = res[0]?.clips;
      const c2 = res[1]?.clips;
      return { ...r, c: { N: String(st.l.turns), I: res[0] ? (Math.round(res[0].I * 20) / 20).toFixed(2) : '', c1: c1 === undefined ? '' : String(c1), c2: c2 === undefined ? '' : String(c2), c: c1 !== undefined && c2 !== undefined ? ((c1 + c2) / 2).toFixed(1) : '' } };
    }),
  }));
}
const liftTwice = (c: DemoCtx, ms: number) => {
  for (let i = 0; i < 2; i++) {
    c.o.closeKey();
    const k = c.o.lift();
    if (k !== null && i === 1) startRun('lift', k, ms);
    c.o.openKey();
  }
};
function emScript(p: string): DemoStep[] {
  return [
    intro('ELECTROMAGNET', 'Today: the strength of an electromagnet. On my bench: two dry cells, a key, a rheostat, an ammeter, a large iron nail with insulated wire, and a dish of steel paper clips.'),
    setupStep('ELECTROMAGNET', 'Cells, key, rheostat and ammeter in series with the coil: thirty turns wound tightly on the soft-iron nail, all the same way.', [{ at: 3200, run: (c) => (c.o.wind(30), c.o.setCore('iron')) }]),
    {
      id: 'first',
      title: 'Set the current; lift; count',
      say: () => 'I set the rheostat until the ammeter reads 0.50 amperes, close the key, dip the nail into the clips and lift: I count the clips held. Open the key — they fall off: soft iron loses its magnetism. Twice, and the mean.',
      ms: 12000,
      view: view('ELECTROMAGNET'),
      point: 'nail',
      beats: [{ at: 400, run: (c) => c.o.setRheo(Number(emRheoFor(c.v, 30, 0.5).toFixed(4))) }, { at: 2500, run: (c) => liftTwice(c, RUN_MS.lift) }, { at: 9000, run: (c) => emFillRows(c) }],
    },
    {
      id: 'rest',
      title: 'More current, more turns, no core',
      say: () => 'Then 1.0, 1.5 and 2.0 amperes: more clips, but the rise slows as the core saturates. Sixty turns at 1.0 ampere hold nearly twice as many. Without the core, almost none.',
      ms: 12000,
      view: view('ELECTROMAGNET'),
      point: 'nail',
      beats: [
        ...EM_CARD.slice(1).flatMap((I, n) => at(400 + n * 1800, 600, [(c) => c.o.setRheo(Number(emRheoFor(c.v, 30, I).toFixed(4))), (c) => liftTwice(c, 500)])),
        { at: 6200, run: (c) => (c.o.wind(60), c.o.setRheo(Number(emRheoFor(c.v, 60, 1).toFixed(4)))) },
        { at: 6800, run: (c) => liftTwice(c, 500) },
        { at: 8200, run: (c) => (c.o.wind(30), c.o.setCore('none'), c.o.setRheo(Number(emRheoFor(c.v, 30, 1).toFixed(4)))) },
        { at: 8800, run: (c) => liftTwice(c, 500) },
        { at: 10000, run: (c) => (emFillRows(c), c.o.update((x) => ({ ...x, cells: { ...x.cells, nc: x.rows[5]?.c.c1 ?? '' } }))) },
      ],
    },
    {
      id: 'graph',
      title: 'Clips against current',
      say: (c) => {
        const pts = c.s().rows.slice(0, 3).map((r) => ({ x: Number(r.c.I), y: Number(r.c.c) }));
        const fit = phyFit(pts);
        return `The graph rises steeply, then bends over. Along the straight first part the slope is about ${fit ? fit.slope.toFixed(1) : '—'} clips per ampere. ${p ? `Precautions: ${p}` : ''}`;
      },
      ms: 10000,
      view: BENCHV,
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 600,
          run: (c) =>
            c.o.update((x) => {
              const pts = x.rows.slice(0, 3).map((r) => ({ x: Number(r.c.I), y: Number(r.c.c) }));
              const fit = phyFit(pts);
              if (!fit) return x;
              const a = Math.min(...pts.map((q) => q.x));
              const b = Math.max(...pts.map((q) => q.x));
              const r30 = x.rows[1];
              const r60 = x.rows[4];
              return {
                ...x,
                line: { x1: a, y1: Number((fit.intercept + fit.slope * a).toPrecision(4)), x2: b, y2: Number((fit.intercept + fit.slope * b).toPrecision(4)) },
                answers: { ...x.answers, slope: { value: fit.slope.toPrecision(3), unit: 'clips/A' }, rturns: { value: r30 && r60 ? (Number(r60.c.c) / Number(r30.c.c)).toPrecision(3) : '', unit: '' } },
                written: { precautions: prec(p, 'Clips of the same size were used. The key was opened between readings so the coil did not warm.') },
              };
            }),
        },
      ],
    },
  ];
}

// ------------------------------------------------------------------ INDUCTION

export function indFillRows(c: DemoCtx) {
  const s = c.s();
  c.o.update((x) => ({
    ...x,
    rows: x.rows.map((r) => {
      const m = s.moves[r.key];
      if (!m) return r;
      const d = indShown(indDeflection(c.v, r.key, m));
      const sz = Math.abs(d) < 0.75 ? 0 : half(Math.abs(d));
      return { ...r, c: { dir: sz === 0 ? '0' : d > 0 ? 'R' : 'L', size: sz.toFixed(1) } };
    }),
  }));
}
const mv = (c: DemoCtx, kind: 'in' | 'still' | 'out', ms = RUN_MS.move) => {
  const k = c.o.move(kind);
  if (k !== null) startRun('move', k, ms);
};
function indScript(p: string): DemoStep[] {
  return [
    intro('INDUCTION', 'Today: electromagnetic induction. On my bench: coils of 200 and 600 turns, a centre-zero galvanometer, two bar magnets and connecting wires.'),
    setupStep('INDUCTION', 'The 200-turn coil is joined firmly to the galvanometer — which I stand well away from the magnets.', [{ at: 2000, run: (c) => c.o.setGalvoFar(true) }]),
    {
      id: 'first',
      title: 'In, still, out',
      say: () => 'I push the N pole in along the axis: the needle swings one way. Held still inside: nothing — no change of flux. Pulled out: it swings the other way.',
      ms: 11000,
      view: view('INDUCTION'),
      point: 'galvo',
      beats: [{ at: 500, run: (c) => mv(c, 'in') }, { at: 3500, run: (c) => mv(c, 'still') }, { at: 6500, run: (c) => mv(c, 'out') }, { at: 9500, run: (c) => indFillRows(c) }],
    },
    {
      id: 'more',
      title: 'Faster, S pole, two magnets, more turns',
      say: () => 'Quickly: a bigger swing. The S pole: the swing reverses. Two magnets: bigger. And the 600-turn coil: bigger again.',
      ms: 13000,
      view: view('INDUCTION'),
      point: 'magnets',
      beats: [
        { at: 300, run: (c) => c.o.setSpeed('fast') },
        ...at(600, 1000, [(c) => mv(c, 'in', 900), (c) => mv(c, 'out', 900)]),
        { at: 2800, run: (c) => (c.o.setSpeed('slow'), c.o.setPole('S')) },
        ...at(3200, 1100, [(c) => mv(c, 'in', 1000), (c) => mv(c, 'out', 1000)]),
        { at: 5600, run: (c) => (c.o.setPole('N'), c.o.setMagnets(2)) },
        ...at(6000, 1100, [(c) => mv(c, 'in', 1000), (c) => mv(c, 'out', 1000)]),
        { at: 8400, run: (c) => (c.o.setMagnets(1), c.o.setCoil(600)) },
        ...at(8800, 1100, [(c) => mv(c, 'in', 1000), (c) => mv(c, 'out', 1000)]),
        { at: 11500, run: (c) => indFillRows(c) },
      ],
    },
    {
      id: 'calc',
      title: 'Faraday and Lenz',
      say: (c) => `Faraday: the e.m.f. is N delta phi over delta t: for the card's coil, ${indCardEmf(c.v).toPrecision(3)} volts; twice as fast, twice the e.m.f. Lenz: the current makes the face of the coil an N pole as the N pole approaches, opposing it. ${p ? `Precautions: ${p}` : ''}`,
      ms: 12000,
      view: BENCHV,
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 600,
          run: (c) =>
            c.o.update((x) => {
              const E = indCardEmf(c.v);
              const sz = (k: number) => Number(x.rows.find((r) => r.key === k)?.c.size);
              return { ...x, answers: { ...x.answers, emf: { value: E.toPrecision(3), unit: 'V' }, emf2: { value: (2 * E).toPrecision(3), unit: 'V' }, rspeed: { value: (sz(3) / sz(0)).toPrecision(3), unit: '' }, rturns: { value: (sz(9) / sz(0)).toPrecision(3), unit: '' }, lenz: { value: 'N', unit: '' } }, written: { precautions: prec(p, 'The connections were firm. The magnet was moved along the axis and the galvanometer kept away from it.') } };
            }),
        },
      ],
    },
  ];
}

// ------------------------------------------------------------------ DIODE

export function diodeFillRows(c: DemoCtx) {
  const s = c.s();
  c.o.update((x) => ({
    ...x,
    rows: x.rows.map((r) => {
      const rd = s.reads[r.key];
      if (!rd) return r;
      const m = diodeReading(c.v, rd);
      const V = m.V ?? 0;
      return { ...r, c: { V: rd.bias === 'fwd' ? V.toFixed(rd.range === 1 ? 2 : 1) : `-${V.toFixed(1)}`, I: rd.bias === 'fwd' ? half(m.mA ?? 0).toFixed(1) : '0.0' } };
    }),
  }));
}
const readAt = (c: DemoCtx, bias: 'fwd' | 'rev', V: number) => {
  c.o.setBias(bias);
  c.o.setRange(bias === 'fwd' && V < 1 ? 1 : 10);
  const s = c.s();
  c.o.setPot(Number(diodePotFor(c.v, { bias, resistor: s.resistor, vm: s.vm, heat: 0 }, V).toFixed(4)));
  c.o.closeKey();
  c.o.read();
  c.o.openKey();
};
function diodeScript(p: string): DemoStep[] {
  return [
    intro('DIODE', 'Today: the I–V characteristic of a silicon diode. On my bench: three cells, a potentiometer, a key, a 100 ohm protective resistor, the diode, a milliammeter and a voltmeter.'),
    setupStep('DIODE', 'The diode in forward bias — anode to positive — in series with the protective resistor and the milliammeter; the voltmeter across the diode only.'),
    {
      id: 'fwd',
      title: 'Forward bias, small steps',
      say: () => 'Close the key, set 0.1 volt, read both meters, open the key. Up in steps: almost nothing until about half a volt. Then 0.05 volt steps: the current shoots up — the knee.',
      ms: 14000,
      view: { mode: 'read' as const, spot: null },
      point: 'mamm',
      beats: [...DIODE_CARD_FWD.map((V, n): Beat => ({ at: 500 + n * 1200, run: (c) => readAt(c, 'fwd', V) })), { at: 13000, run: (c) => diodeFillRows(c) }],
    },
    {
      id: 'rev',
      title: 'Reverse bias',
      say: () => 'Turned round, on the 10 volt range: 1, 2, 3, 4 volts — and the milliammeter does not move. Practically no reverse current.',
      ms: 8000,
      view: view('DIODE'),
      point: 'diode',
      beats: [...DIODE_CARD_REV.map((V, n): Beat => ({ at: 500 + n * 1200, run: (c) => readAt(c, 'rev', V) })), { at: 6000, run: (c) => diodeFillRows(c) }],
    },
    {
      id: 'graph',
      title: 'The curve, the tangent, the knee',
      say: (c) => {
        const pts = c.s().rows.map((r) => ({ x: Number(r.c.V), y: Number(r.c.I) })).filter((q) => q.x > 0);
        const Imax = Math.max(0, ...pts.map((q) => q.y));
        const fit = phyFit(pts.filter((q) => q.y >= 0.3 * Imax && q.y > 2));
        return fit ? `The tangent to the steep part meets the V axis at the knee: about ${(-fit.intercept / fit.slope).toFixed(2)} volts. Its slope gives the dynamic resistance, about ${(1000 / fit.slope).toFixed(1)} ohms. ${p ? `Precautions: ${p}` : ''}` : `The tangent to the steep part meets the V axis at the knee. ${p ? `Precautions: ${p}` : ''}`;
      },
      ms: 11000,
      view: BENCHV,
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 600,
          run: (c) =>
            c.o.update((x) => {
              const pts = x.rows.map((r) => ({ x: Number(r.c.V), y: Number(r.c.I) })).filter((q) => q.x > 0);
              const Imax = Math.max(...pts.map((q) => q.y));
              const steep = pts.filter((q) => q.y >= 0.3 * Imax && q.y > 2);
              const fit = phyFit(steep);
              if (!fit) return x;
              const a = Math.min(...steep.map((q) => q.x));
              const b = Math.max(...steep.map((q) => q.x));
              const r70 = x.rows[8];
              return {
                ...x,
                line: { x1: a, y1: Number((fit.intercept + fit.slope * a).toPrecision(4)), x2: b, y2: Number((fit.intercept + fit.slope * b).toPrecision(4)) },
                answers: { ...x.answers, knee: { value: (-fit.intercept / fit.slope).toFixed(2), unit: 'V' }, rdyn: { value: (1000 / fit.slope).toPrecision(3), unit: 'Ω' }, rstat: { value: r70 ? (Number(r70.c.V) / (Number(r70.c.I) / 1000)).toPrecision(3) : '', unit: 'Ω' } },
                written: { precautions: prec(p, 'A protective resistor was used. Small steps were taken near the knee and the key was opened between readings.') },
              };
            }),
        },
      ],
    },
  ];
}

export function demoScript(task: MagTask, precautions: string[]): DemoStep[] {
  const p = precautions.slice(0, 2).join(' ');
  return task === 'ELECTROMAGNET' ? emScript(p) : task === 'INDUCTION' ? indScript(p) : task === 'DIODE' ? diodeScript(p) : fieldScript(p);
}

export function demoCalculation(s: PhyMagnetismState): string[] {
  switch (s.task) {
    case 'FIELD':
      return s.answers.ratio.value ? [`Mean equatorial = (${s.cells.xe} + ${s.cells.yw}) ÷ 2 = ${s.answers.me.value} cm.`, `Mean axial = (${s.cells.an} + ${s.cells.as}) ÷ 2 = ${s.answers.ma.value} cm.`, `Ratio = ${s.answers.ma.value} ÷ ${s.answers.me.value} = ${s.answers.ratio.value}.`] : [];
    case 'ELECTROMAGNET':
      return s.answers.slope.value ? [`Initial slope = ${s.answers.slope.value} clips per ampere.`, `60 turns ÷ 30 turns at 1.0 A = ${s.answers.rturns.value}.`] : [];
    case 'INDUCTION':
      return s.answers.emf.value ? [`E = NΔΦ/Δt = ${s.answers.emf.value} V; twice as fast: ${s.answers.emf2.value} V.`, `Fast ÷ slow = ${s.answers.rspeed.value}; 600 ÷ 200 turns = ${s.answers.rturns.value}.`] : [];
    case 'DIODE':
      return s.answers.knee.value ? [`Knee voltage = ${s.answers.knee.value} V (the tangent at I = 0).`, `Dynamic resistance = ΔV ÷ ΔI = ${s.answers.rdyn.value} Ω; static resistance at 0.70 V = ${s.answers.rstat.value} Ω.`] : [];
    default:
      return [];
  }
}
export { makeOps };
