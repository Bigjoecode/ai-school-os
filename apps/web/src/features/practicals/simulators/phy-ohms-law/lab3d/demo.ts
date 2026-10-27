import { emptyPhyOhmsState, ohmsMeters, ohmsWireKey, phyFit, type OhmsTask, type PhyOhmsState, type PhyOhmsVariant } from '@aischool/shared';
import type { DemoBeat, DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import type { Spot } from '../../../lab3d-kit/store';
import { settingsOf, type Ohms } from '../actions';
import { RHEO_STEPS, WIRE_LENGTHS } from './guide';
import { BOARD, FACE, GOOD_WIRES, PART, WIRE_RULE } from './layout';
import { needed } from './scene-state';

/**
 * Mr Bayo's demonstration: the whole experiment on its own demo seed (never
 * the student's) and its own in-memory state, through the same actions as the
 * student's lab. Beats are deterministic, so jumping replays them exactly.
 */

export const demoSeed = (studentSeed: number) => (studentSeed === 7 ? 8 : 7);
export interface DemoCtx {
  o: Ohms;
  v: PhyOhmsVariant;
  s: () => PhyOhmsState;
}
type Beat = DemoBeat<DemoCtx>;
export type DemoStep = KitDemoStep<DemoCtx>;

const f2 = (x: number) => x.toFixed(2);
const sf3 = (x: number) => Number(x.toPrecision(3));
const bench = (spot: Spot) => ({ mode: 'bench' as const, spot });
const AT_BENCH = bench({ target: [0.1, 0.1, 0.0], dist: 1.1, pitch: 0.62 });
const AT_BOARD = bench({ target: [BOARD.x, 0.05, BOARD.z + 0.05], dist: 0.85, pitch: 0.82, yaw: 0.05 });
const AT_WIRE = bench({ target: [WIRE_RULE.x0 + 0.5, 0.03, WIRE_RULE.z - 0.05], dist: 0.95, pitch: 0.7 });
const meter = (p: readonly [number, number, number]) => bench({ target: [p[0], p[1] + FACE.cy, p[2] + 0.06], dist: 0.3, pitch: 0.05, yaw: 0 });
const AT_AMMETER = meter(PART.ammeter);
const AT_VOLTMETER = meter(PART.voltmeter);

export const demoEmpty = (task: OhmsTask): PhyOhmsState => ({ ...emptyPhyOhmsState(), task, log: [{ t: 0, a: `task:${task}` }] });

/** The setting and the meters for reading i (worked out ahead, from the same shared maths the beats use). */
function planned(c: DemoCtx, i: number) {
  const s = c.s();
  const task = s.task ?? 'OHM';
  const set = task === 'WIRE' ? { rheostat: 0.3, jockey: WIRE_LENGTHS[i]! } : { rheostat: RHEO_STEPS[i]!, jockey: s.jockey };
  const m = ohmsMeters(c.v, { ...settingsOf(s), ...set, key: true, heat: 0 }, i);
  return { set, I: Number(f2(m.I)), V: Number(f2(m.V)) };
}

function readingSteps(i: number, task: OhmsTask): DemoStep[] {
  const wire = task === 'WIRE';
  const setBeat: Beat = { at: 300, run: (c) => (wire ? (c.o.setRheostat(0.3), c.o.setJockey(WIRE_LENGTHS[i]!)) : c.o.setRheostat(RHEO_STEPS[i]!)) };
  const close: Beat = { at: 1400, run: (c) => c.o.toggleKey() };
  const take: Beat = {
    at: 3200,
    run: (c) => {
      const p = planned(c, i);
      c.o.takeReading();
      c.o.update((x) => ({ ...x, table: x.table.map((r, k) => (k === i ? { L: wire ? p.set.jockey.toFixed(1) : '', I: f2(p.I), V: f2(p.V), R: p.I > 0 ? f2(p.V / p.I) : '' } : r)) }));
    },
  };
  const open: Beat = { at: 4400, run: (c) => c.o.toggleKey() };
  if (i === 0)
    return [
      {
        id: 'read-0-a',
        title: wire ? 'L = 20 cm, key closed: read the ammeter' : 'Key closed: read the ammeter',
        say: (c) => {
          const p = planned(c, 0);
          return `${wire ? 'I press the jockey on the wire at 20.0 cm from the zero end. ' : 'The rheostat is at its full resistance for the smallest current. '}I close the key and look straight at the ammeter pointer, so there is no parallax: it reads ${f2(p.I)} A.`;
        },
        ms: 7000,
        view: AT_AMMETER,
        point: 'ammeter',
        beats: [setBeat, close],
      },
      {
        id: 'read-0-b',
        title: 'Read the voltmeter, record, open the key',
        say: (c) => {
          const p = planned(c, 0);
          return `The voltmeter reads ${f2(p.V)} V. I write I = ${f2(p.I)} A and V = ${f2(p.V)} V to 2 decimal places, work out V/I = ${p.I > 0 ? f2(p.V / p.I) : '—'} Ω, and open the key at once so the ${wire ? 'wire' : 'resistor'} does not heat up.`;
        },
        ms: 7500,
        view: AT_VOLTMETER,
        point: 'voltmeter',
        panel: 'notebook',
        beats: [{ ...take, at: 2500 }, { ...open, at: 5600 }],
      },
    ];
  return [
    {
      id: `read-${i}`,
      title: wire ? `L = ${WIRE_LENGTHS[i]} cm` : `Reading ${i + 1}: a new rheostat setting`,
      say: (c) => {
        const p = planned(c, i);
        return `${wire ? `Jockey at ${WIRE_LENGTHS[i]}.0 cm.` : 'I slide the rheostat for a bigger current.'} Close the key: ${f2(p.I)} A and ${f2(p.V)} V. Record, then open the key.`;
      },
      ms: 5600,
      view: wire ? AT_WIRE : AT_BOARD,
      point: wire ? 'wireRule' : 'rheostat',
      panel: 'notebook',
      beats: [setBeat, close, take, open],
    },
  ];
}

export function demoScript(task: OhmsTask): DemoStep[] {
  const wire = task === 'WIRE';
  const good = GOOD_WIRES[task];
  const steps: DemoStep[] = [
    {
      id: 'apparatus',
      title: 'The apparatus',
      say: () => `Good day! I'm Mr Bayo. For ${wire ? 'the resistivity of a wire' : "Ohm's law"} I take from the cupboard two cells, a key, a rheostat, an ammeter, a voltmeter, connecting wires and ${wire ? 'the resistance wire on its metre rule, with the micrometer for its diameter' : 'the standard resistor'}.`,
      ms: 7000,
      view: AT_BENCH,
      beats: needed(task).map((a, k) => ({ at: 400 + k * 600, run: (c: DemoCtx) => c.o.note(`collect:${a.id}`) })),
    },
    {
      id: 'series',
      title: 'Everything in series first',
      say: () => `One loop first: battery plus to the key, key to the rheostat end, rheostat slider to the ammeter's plus, ammeter minus to the ${wire ? 'zero end of the wire, and the jockey' : 'resistor, and the resistor'} back to the battery's minus.`,
      ms: 7600,
      view: AT_BOARD,
      point: 'board',
      beats: good.slice(0, 5).map(([a, b], k) => ({ at: 600 + k * 1200, run: (c: DemoCtx) => c.o.connect(a, b) })),
    },
    {
      id: 'voltmeter',
      title: `The voltmeter across the ${wire ? 'wire' : 'resistor'} only`,
      say: () => `Then the voltmeter in parallel, across the ${wire ? 'length of wire between the zero end and the jockey' : 'resistor'} only — its plus to the side nearer the battery's plus. Both meters read forwards that way.`,
      ms: 6200,
      view: AT_BOARD,
      point: 'voltmeter',
      beats: good.slice(5).map(([a, b], k) => ({ at: 900 + k * 1500, run: (c: DemoCtx) => c.o.connect(a, b) })),
    },
    {
      id: 'check',
      title: 'Check before switching on',
      say: () => 'Before I close the key I check every connection is clean and tight, and have the circuit checked. Never an ammeter straight across the cell!',
      ms: 4800,
      view: AT_BOARD,
      point: 'key',
      beats: [],
    },
  ];
  for (let i = 0; i < 5; i++) steps.push(...readingSteps(i, task));
  steps.push(
    {
      id: 'graph',
      title: wire ? 'Plot R against L' : 'Plot V against I',
      say: () => (wire ? 'I plot R against L and draw the best straight line. It passes through the origin: R is directly proportional to L.' : 'I plot V against I and draw the best straight line through the points. It passes through the origin: V is directly proportional to I.'),
      ms: 6200,
      view: AT_BENCH,
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 1500,
          run: (c) => {
            const s = c.s();
            const pts = s.table.map((r) => (wire ? { x: Number(r.L), y: Number(r.R) } : { x: Number(r.I), y: Number(r.V) })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
            const fit = phyFit(pts);
            if (!fit) return;
            const xs = pts.map((p) => p.x);
            const x1 = Math.min(...xs);
            const x2 = Math.max(...xs);
            c.o.update((x) => ({ ...x, line: { x1, y1: Number((fit.intercept + fit.slope * x1).toPrecision(4)), x2, y2: Number((fit.intercept + fit.slope * x2).toPrecision(4)) } }));
          },
        },
      ],
    },
    {
      id: 'calc',
      title: wire ? 'Slope, A and ρ' : 'The slope is R',
      say: (c) => {
        const l = c.s().line;
        const slope = l ? (l.y2 - l.y1) / (l.x2 - l.x1) : 0;
        return wire ? `Slope = ΔR ÷ ΔL = ${sf3(slope * 100)} ohms per metre. A = πd²/4 = ${c.v.wire.area.toExponential(3)} square metres, so ρ = slope × A = ${(slope * 100 * c.v.wire.area).toExponential(2)} ohm metres.` : `Slope = ΔV ÷ ΔI from two points far apart on the line = ${sf3(slope)} ohms. That is the resistance R.`;
      },
      ms: 8000,
      view: AT_BENCH,
      point: 'book',
      panel: 'calc',
      beats: [
        {
          at: 2000,
          run: (c) => {
            const l = c.s().line;
            if (!l) return;
            const slope = (l.y2 - l.y1) / (l.x2 - l.x1);
            c.o.update((x) => ({
              ...x,
              answers: wire
                ? { area: { value: c.v.wire.area.toExponential(3), unit: 'm²' }, slope: { value: String(sf3(slope * 100)), unit: 'Ω m⁻¹' }, result: { value: (slope * 100 * c.v.wire.area).toExponential(2), unit: 'Ω m' } }
                : { ...x.answers, slope: { value: String(sf3(slope)), unit: 'Ω' }, result: { value: String(sf3(slope)), unit: 'Ω' } },
              written: { conclusion: wire ? 'R is directly proportional to L: a straight line through the origin.' : 'V is directly proportional to I (straight line through the origin), so the resistor obeys Ohm’s law.', precautions: 'I opened the key between readings to avoid heating. I read the meters from directly in front to avoid parallax.' },
            }));
          },
        },
      ],
    },
    {
      id: 'end',
      title: 'Precautions',
      say: () => 'My precautions: I opened the key between readings so the conductor did not heat up, and I read each pointer from directly in front to avoid parallax. Now it is your turn!',
      ms: 6000,
      view: AT_BENCH,
      panel: 'notebook',
      beats: [],
    },
  );
  return steps;
}

/** The worked calculation beside the demo. */
export function demoCalculation(s: PhyOhmsState, v: PhyOhmsVariant): string[] {
  const l = s.line;
  if (!l || !s.answers.slope.value) return [];
  const wire = s.task === 'WIRE';
  const slope = (l.y2 - l.y1) / (l.x2 - l.x1);
  return wire
    ? [
        `Slope = (${l.y2.toFixed(2)} − ${l.y1.toFixed(2)}) Ω ÷ (${l.x2} − ${l.x1}) cm = ${sf3(slope)} Ω cm⁻¹ = ${sf3(slope * 100)} Ω m⁻¹`,
        `d = ${v.wire.diameterMm.toFixed(2)} mm = ${(v.wire.diameterMm / 1000).toExponential(2)} m, so A = πd²/4 = ${v.wire.area.toExponential(3)} m²`,
        `ρ = slope × A = ${sf3(slope * 100)} × ${v.wire.area.toExponential(3)} = ${(slope * 100 * v.wire.area).toExponential(2)} Ω m`,
      ]
    : [`Slope = (${l.y2.toFixed(2)} − ${l.y1.toFixed(2)}) V ÷ (${l.x2.toFixed(2)} − ${l.x1.toFixed(2)}) A = ${sf3(slope)} Ω`, `R = slope = ${sf3(slope)} Ω`];
}
export { ohmsWireKey };
