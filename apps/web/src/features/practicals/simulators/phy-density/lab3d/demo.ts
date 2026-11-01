import { calIndicated, calRead, emptyPhyDensityState, floatReading, FLOAT_CARD, phyFit, sbReading, type DensityRiders, type DensityTask, type PhyDensityState, type PhyDensityVariant } from '@aischool/shared';
import type { DemoBeat, DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import type { Spot } from '../../../lab3d-kit/store';
import type { Density } from '../actions';
import { makeOps, type Ops } from './lab-actions';
import { NEEDED, PLACEABLE } from './scene-state';
import { BALANCE, BOTTLE, CALS, CAN, CYL, SALT, THERMO } from './views';

/**
 * Mr Bayo's demonstration of each practical with his own apparatus (a demo
 * seed that is never the student's) and his own in-memory state, through the
 * same operations as the student's bench: the zero errors and three readings
 * on each instrument; W₁, W₂, W₃ and the displaced water; five loads on the
 * floating tube; m₁, m₂, m₃ with the density bottle — then the table and the
 * working, read off his instruments as a careful student would.
 */

export const DEMO_SEED = 31;
export const demoSeed = (studentSeed: number) => (studentSeed === DEMO_SEED ? DEMO_SEED + 1 : DEMO_SEED);
export const demoEmpty = (task: DensityTask): PhyDensityState => ({ ...emptyPhyDensityState(), task, log: [{ t: 0, a: `task:${task}` }] });

export interface DemoCtx {
  o: Density;
  v: PhyDensityVariant;
  s: () => PhyDensityState;
  ops: () => Ops;
}
type Beat = DemoBeat<DemoCtx>;
export type DemoStep = KitDemoStep<DemoCtx>;

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const bench = (spot: Spot) => ({ mode: 'bench' as const, spot });
const ridersFor = (m: number): DensityRiders => {
  const g = r1(m);
  const h = Math.min(5, Math.floor(g / 100));
  const t = Math.min(9, Math.floor((g - h * 100) / 10));
  return { h, t, f: r1(g - h * 100 - t * 10) };
};
const cell = (c: DemoCtx, id: string, value: string) => c.o.update((x) => ({ ...x, cells: { ...x.cells, [id]: value } }));
const collect = (task: DensityTask): Beat[] => NEEDED[task].map((id, n) => ({ at: 300 + n * 300, run: (c: DemoCtx) => c.o.note(`collect:${id}`) }));
const place = (task: DensityTask, at0: number): Beat[] => PLACEABLE[task].map((id, n): Beat => ({ at: at0 + n * 900, run: (c) => c.ops().place(id) }));
/** Weigh what is on the pan: balance the riders, then record. */
const weighBeats = (at: number, item: 'beaker' | 'tube' | 'bottle', after?: (c: DemoCtx, riders: number) => void): Beat[] => [
  { at, run: (c) => c.ops().pan(item) },
  { at: at + 700, run: (c) => c.o.setRiders(ridersFor(c.o.panMass())) },
  {
    at: at + 1600,
    run: (c) => {
      c.ops().weigh();
      after?.(c, r1(c.o.panMass()));
    },
  },
];
const BAL = bench({ target: [BALANCE.x + 0.06, 0.08, BALANCE.z], dist: 0.62, pitch: 0.42 });

function calScript(): DemoStep[] {
  const AT_INSTR = bench({ target: [CALS.x, CALS.y, CALS.z], dist: 0.42, pitch: 0.12 });
  const reads = (tool: 'V' | 'M', obj: 'cyl' | 'ball', ids: string[], at0: number, gap: number): Beat[] =>
    ids.flatMap((id, i): Beat[] => [
      ...(i ? [{ at: at0 + i * gap - 500, run: (c: DemoCtx) => c.ops().turn() }] : []),
      { at: at0 + i * gap, run: (c) => c.ops().close(tool === 'V' ? 'gentle' : 'ratchet') },
      {
        at: at0 + i * gap + 600,
        run: (c) => {
          c.ops().takeCal();
          cell(c, id, calRead(calIndicated(c.v, tool, obj, c.s().pos)).toFixed(2));
        },
      },
    ]);
  return [
    { id: 'intro', title: 'The apparatus', say: () => 'Today: measuring with the vernier calipers and the micrometer screw gauge. A wooden cylinder, a ball bearing, a marble and a wire, and a cloth to clean the jaws.', ms: 6500, view: bench({ target: [0, 0.1, 0.1], dist: 1.4, pitch: 0.35 }), point: 'objects', beats: collect('CAL') },
    {
      id: 'vzero',
      title: 'The vernier’s zero error',
      say: (c) => `First I close the jaws on nothing. Looking square on, the vernier zero is ${c.v.zv > 0 ? 'just past' : 'just before'} the main-scale zero: the coinciding line gives a zero error of ${c.v.zv > 0 ? 'plus' : 'minus'} ${Math.abs(c.v.zv).toFixed(2)} centimetres.`,
      ms: 9000,
      view: AT_INSTR,
      point: 'vernier',
      panel: 'loupe',
      beats: [
        { at: 300, run: (c) => (c.ops().tool('V'), c.o.setEye(0)) },
        { at: 1200, run: (c) => c.ops().close('gentle') },
        { at: 6500, run: (c) => (c.ops().takeCal(), cell(c, 'zv', calRead(c.v.zv).toFixed(2))) },
      ],
    },
    {
      id: 'cyl',
      title: 'The cylinder at three places',
      say: () => 'The cylinder goes between the outside jaws; I close them gently until they just touch. Main scale just before the vernier zero, then the vernier line that lines up exactly — times 0.01 centimetres. I turn it and repeat at two more places.',
      ms: 11000,
      view: AT_INSTR,
      point: 'vernier',
      panel: 'loupe',
      beats: [{ at: 300, run: (c) => c.ops().hold('cyl') }, ...reads('V', 'cyl', ['c1', 'c2', 'c3'], 1500, 3000)],
    },
    {
      id: 'mzero',
      title: 'The micrometer’s zero error',
      say: (c) => `Now the micrometer. I close it on nothing with the ratchet — never by forcing the thimble — until it clicks. The thimble reads ${c.v.zm > 0 ? `${Math.round(c.v.zm * 100)} divisions past zero: plus` : `${50 + Math.round(c.v.zm * 100)}, just short of zero: minus`} ${Math.abs(c.v.zm).toFixed(2)} millimetres.`,
      ms: 9000,
      view: AT_INSTR,
      point: 'micrometer',
      panel: 'loupe',
      beats: [
        { at: 300, run: (c) => (c.ops().tool('M'), c.o.setEye(0)) },
        { at: 1300, run: (c) => c.ops().close('ratchet') },
        { at: 6500, run: (c) => (c.ops().takeCal(), cell(c, 'zm', calRead(c.v.zm).toFixed(2))) },
      ],
    },
    {
      id: 'ball',
      title: 'The ball bearing',
      say: () => 'The ball bearing sits between the anvil and the spindle; ratchet until it clicks. Sleeve: whole millimetres and the half-millimetre mark if it shows. Thimble: the division on the datum line, times 0.01 millimetres. Three orientations.',
      ms: 11000,
      view: AT_INSTR,
      point: 'micrometer',
      panel: 'loupe',
      beats: [{ at: 300, run: (c) => c.ops().hold('ball') }, ...reads('M', 'ball', ['b1', 'b2', 'b3'], 1500, 3000)],
    },
    {
      id: 'calc',
      title: 'Means, corrections and the volume',
      say: () => 'The mean of each set, minus its zero error — subtract a positive zero error, add a negative one. Half the ball’s diameter is r, and V is four thirds pi r cubed.',
      ms: 9000,
      view: bench({ target: [0, 0.1, 0.1], dist: 1.4, pitch: 0.35 }),
      point: 'book',
      panel: 'calc',
      beats: [
        {
          at: 1200,
          run: (c) =>
            c.o.update((x) => {
              const n = (id: string) => Number(x.cells[id] ?? 0);
              const cm = (n('c1') + n('c2') + n('c3')) / 3;
              const bm = (n('b1') + n('b2') + n('b3')) / 3;
              const dc = cm - n('zv');
              const db = bm - n('zm');
              return {
                ...x,
                cells: { ...x.cells, cm: cm.toFixed(3), bm: bm.toFixed(3) },
                answers: { ...x.answers, dcyl: { value: dc.toFixed(3), unit: 'cm' }, dball: { value: db.toFixed(3), unit: 'mm' }, vol: { value: ((4 / 3) * Math.PI * (db / 20) ** 3).toPrecision(3), unit: 'cm³' } },
                written: { precautions: 'I corrected for the zero errors and closed the micrometer with the ratchet. I read the scales with my eye perpendicular to avoid parallax, and took readings at three places.' },
              };
            }),
        },
      ],
    },
  ];
}

function archScript(): DemoStep[] {
  const AT_STAND = bench({ target: [CAN.x - 0.04, 0.3, CAN.z], dist: 0.95, pitch: 0.15 });
  const AT_CAN = bench({ target: [CAN.x + 0.04, 0.16, CAN.z], dist: 0.6, pitch: 0.25 });
  const sbCell = (id: string) => (c: DemoCtx) => {
    c.ops().takeSb();
    const s = c.s();
    cell(c, id, r2(sbReading(c.v, { where: s.where, depth: s.depth, bubbles: s.bubbles, zeroed: s.zeroed })).toFixed(2));
  };
  return [
    { id: 'intro', title: 'The apparatus', say: () => 'Today: Archimedes’ principle. A spring balance on a stand, a stone on a thread, a eureka can, a catch beaker, salt solution, a beam balance and tissue paper.', ms: 6500, view: bench({ target: [0.2, 0.2, 0], dist: 1.6, pitch: 0.3 }), point: 'sbalance', beats: [...collect('ARCH'), ...place('ARCH', 2600)] },
    {
      id: 'w1',
      title: 'Zero, then W₁',
      say: (c) => `With nothing hanging the balance reads ${c.v.sbZero > 0 ? 'a little above' : 'a little below'} zero, so I adjust it. Then I hang the stone and read the pointer with my eye level with it: W one.`,
      ms: 9000,
      view: AT_STAND,
      point: 'sbalance',
      panel: 'loupe',
      beats: [
        { at: 2200, run: (c) => c.ops().zero() },
        { at: 3600, run: (c) => (c.ops().hang(), c.o.setEye(0)) },
        { at: 7000, run: sbCell('w1') },
      ],
    },
    { id: 'beaker', title: 'The empty catch beaker', say: () => 'I weigh the clean, dry catch beaker: slide the riders until the pointer rests on zero and add up the beams.', ms: 6500, view: BAL, point: 'balance', beats: weighBeats(600, 'beaker', (c, m) => cell(c, 'mb', m.toFixed(1))) },
    {
      id: 'w2',
      title: 'Fully immersed: W₂',
      say: () => 'The eureka can is filled until water runs from the spout, and I wait for it to stop dripping. Then the beaker goes under the spout and I lower the stone until it is completely under water, not touching the can. I shake off the air bubbles, and read W two.',
      ms: 12000,
      view: AT_CAN,
      point: 'stone',
      panel: 'loupe',
      beats: [
        { at: 600, run: (c) => (c.ops().pan(null), c.ops().fillCan()) },
        { at: 3500, run: (c) => c.ops().catchUnder(true) },
        { at: 5000, run: (c) => c.ops().lower('water', 'full') },
        { at: 7500, run: (c) => c.ops().shake() },
        { at: 10000, run: sbCell('w2') },
      ],
    },
    { id: 'mbw', title: 'The displaced water', say: () => 'The water that ran out is the water the stone displaced. I weigh the beaker with it.', ms: 6500, view: BAL, point: 'balance', beats: weighBeats(600, 'beaker', (c, m) => cell(c, 'mbw', m.toFixed(1))) },
    {
      id: 'w3',
      title: 'Salt solution: W₃',
      say: () => 'I raise the stone, dry it with tissue so no water dilutes the salt solution, and lower it fully into the solution. Bubbles off, eye level: W three. It reads even less — the denser liquid pushes up harder.',
      ms: 11000,
      view: bench({ target: [SALT.x + 0.08, 0.25, SALT.z], dist: 0.9, pitch: 0.15 }),
      point: 'salt',
      panel: 'loupe',
      beats: [
        { at: 500, run: (c) => c.ops().raise() },
        { at: 2500, run: (c) => c.ops().dryStone() },
        { at: 4500, run: (c) => c.ops().lower('salt', 'full') },
        { at: 6500, run: (c) => c.ops().shake() },
        { at: 9000, run: sbCell('w3') },
      ],
    },
    {
      id: 'calc',
      title: 'Upthrust and relative densities',
      say: () => 'Upthrust is W one minus W two, and it equals the weight of water displaced: Archimedes’ principle. The stone’s relative density is W one over its loss in water; the solution’s is its loss in the solution over its loss in water. Relative density has no unit.',
      ms: 11000,
      view: bench({ target: [0.2, 0.2, 0], dist: 1.6, pitch: 0.3 }),
      point: 'book',
      panel: 'calc',
      beats: [
        {
          at: 1200,
          run: (c) =>
            c.o.update((x) => {
              const n = (id: string) => Number(x.cells[id] ?? 0);
              const up = n('w1') - n('w2');
              return {
                ...x,
                answers: { ...x.answers, up: { value: up.toFixed(2), unit: 'N' }, wdisp: { value: (((n('mbw') - n('mb')) / 1000) * 9.8).toFixed(2), unit: 'N' }, rds: { value: (n('w1') / up).toFixed(2), unit: '' }, rdl: { value: ((n('w1') - n('w3')) / up).toFixed(2), unit: '' } },
                written: { precautions: 'The stone was fully immersed and did not touch the can. The eureka can was filled to the spout and allowed to stop dripping, and the stone was dried before the salt solution.' },
              };
            }),
        },
      ],
    },
  ];
}

function floatScript(): DemoStep[] {
  const AT_CYL = bench({ target: [CYL.x, CYL.water - 0.05, CYL.z], dist: 0.6, pitch: 0.12 });
  const AT_INSTR = bench({ target: [CALS.x - 0.45, CALS.y, CALS.z], dist: 0.42, pitch: 0.12 });
  const loadBeats = (load: number, at0: number): Beat[] => [
    { at: at0, run: (c) => c.ops().liftTube() },
    { at: at0 + 300, run: (c) => { while (c.s().load < load) c.o.addShot(); } },
    { at: at0 + 700, run: (c) => (c.ops().floatTube(), c.o.setEye(0)) },
    { at: at0 + 1100, run: (c) => c.ops().centre() },
    {
      at: at0 + 1500,
      run: (c) => {
        c.ops().takeDepth();
        const s = c.s();
        const i = s.rows.indexOf(load);
        if (i >= 0) c.o.update((x) => ({ ...x, float: x.float.map((r, k) => (k === i ? { m: String(load * 10), h: floatReading(c.v, load, false).toFixed(1) } : r)) }));
      },
    },
  ];
  return [
    { id: 'intro', title: 'The apparatus', say: () => 'Today: the law of flotation. A flat-bottomed tube with a paper scale inside, a tall cylinder of water, lead shot in 10 gram scoops, vernier calipers and a beam balance.', ms: 6500, view: bench({ target: [0.2, 0.15, 0], dist: 1.6, pitch: 0.32 }), point: 'testtube', beats: [...collect('FLOAT'), ...place('FLOAT', 2200)] },
    {
      id: 'diameter',
      title: 'The external diameter',
      say: () => 'The vernier’s zero error first, then the tube between the outside jaws: the water is displaced by the whole tube, glass and all, so A comes from the external diameter.',
      ms: 10000,
      view: AT_INSTR,
      point: 'vernier',
      panel: 'loupe',
      beats: [
        { at: 300, run: (c) => (c.ops().tool('V'), c.o.setEye(0)) },
        { at: 1000, run: (c) => c.ops().close('gentle') },
        { at: 2500, run: (c) => c.ops().takeCal() },
        { at: 3500, run: (c) => c.ops().hold('tube') },
        { at: 4500, run: (c) => c.ops().close('gentle') },
        { at: 7500, run: (c) => (c.ops().takeCal(), cell(c, 'D', (calRead(calIndicated(c.v, 'V', 'tube', 0)) - calRead(c.v.zv)).toFixed(2))) },
      ],
    },
    { id: 'weigh', title: 'The empty tube', say: () => 'I weigh the empty tube with its paper scale.', ms: 5500, view: BAL, point: 'balance', beats: weighBeats(500, 'tube', (c, m) => cell(c, 'mt', m.toFixed(1))) },
    {
      id: 'first',
      title: '10 g: float and read h',
      say: () => 'Ten grams of lead shot spread on the bottom, and the tube floats upright. If it drifts against the wall, friction holds it, so I free it. My eye level with the flat water surface — not the meniscus climbing the glass — I read h.',
      ms: 10000,
      view: AT_CYL,
      point: 'cylinder',
      panel: 'loupe',
      beats: [{ at: 300, run: (c) => c.ops().pan(null) }, ...loadBeats(1, 1500)],
    },
    { id: 'others', title: '20 g to 50 g', say: () => 'Then twenty, thirty, forty and fifty grams: the tube sinks deeper each time, by the same amount for each 10 grams.', ms: 10000, view: AT_CYL, point: 'testtube', beats: FLOAT_CARD.slice(1).flatMap((l, n) => loadBeats(l, 300 + n * 2300)) },
    {
      id: 'graph',
      title: 'h against m',
      say: () => 'h against m is a straight line: rho A h equals the tube’s mass plus m. So the slope is one over rho A, and the intercept is the tube’s mass over rho A.',
      ms: 9000,
      view: bench({ target: [0.2, 0.15, 0], dist: 1.6, pitch: 0.32 }),
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 1200,
          run: (c) => {
            const pts = c.s().float.map((r) => ({ x: Number(r.m), y: Number(r.h) }));
            const f = phyFit(pts);
            if (!f) return;
            const xs = pts.map((p) => p.x);
            const a = Math.min(...xs);
            const b = Math.max(...xs);
            c.o.update((x) => ({ ...x, line: { x1: a, y1: Number((f.intercept + f.slope * a).toFixed(3)), x2: b, y2: Number((f.intercept + f.slope * b).toFixed(3)) } }));
          },
        },
      ],
    },
    {
      id: 'calc',
      title: 'ρ and the tube’s mass',
      say: () => 'A is pi D squared over four. Rho is one over A times the slope — very close to the density of water at today’s temperature — and rho A times the intercept gives the tube’s own mass, which agrees with the balance.',
      ms: 10000,
      view: bench({ target: [0.2, 0.15, 0], dist: 1.6, pitch: 0.32 }),
      point: 'book',
      panel: 'calc',
      beats: [
        {
          at: 1200,
          run: (c) =>
            c.o.update((x) => {
              const pts = x.float.map((r) => ({ x: Number(r.m), y: Number(r.h) }));
              const f = phyFit(pts);
              if (!f) return x;
              const D = Number(x.cells.D ?? 0);
              const A = (Math.PI * D * D) / 4;
              const slope = Number(f.slope.toPrecision(3));
              const rho = 1 / (Number(A.toFixed(2)) * slope);
              return {
                ...x,
                answers: { ...x.answers, area: { value: A.toFixed(2), unit: 'cm²' }, slope: { value: String(slope), unit: 'cm g⁻¹' }, rho: { value: rho.toFixed(3), unit: 'g cm⁻³' }, mtube: { value: (rho * A * f.intercept).toFixed(1), unit: 'g' } },
                written: { precautions: 'The tube floated upright without touching the sides of the cylinder. I read h with my eye level with the bottom of the meniscus.' },
              };
            }),
        },
      ],
    },
  ];
}

function bottleScript(): DemoStep[] {
  const AT_BOTTLE = bench({ target: [BOTTLE.x, 0.08, BOTTLE.z], dist: 0.5, pitch: 0.3 });
  const fillBeats = (f: 'water' | 'liquid', at0: number): Beat[] => [
    { at: at0, run: (c) => c.ops().fill(f) },
    { at: at0 + 900, run: (c) => c.ops().tap() },
    { at: at0 + 1600, run: (c) => c.ops().topUp() },
    { at: at0 + 2400, run: (c) => c.ops().stopper() },
    { at: at0 + 3300, run: (c) => c.ops().wipe() },
  ];
  return [
    {
      id: 'intro',
      title: 'The apparatus',
      say: (c) => `Today: the relative density of ${c.v.liquid} with a density bottle. Its stopper has a fine capillary, so it holds exactly the same volume every time. A beam balance, water, the ${c.v.liquid}, a dropper, tissue and a thermometer. No flames near the kerosene.`,
      ms: 8000,
      view: bench({ target: [0.1, 0.12, 0], dist: 1.5, pitch: 0.35 }),
      point: 'bottle',
      beats: collect('BOTTLE'),
    },
    {
      id: 'temp',
      title: 'The room temperature',
      say: (c) => `The thermometer reads ${c.v.tempC.toFixed(1)} degrees: water’s density at this temperature is ${c.v.rhoW.toFixed(1)} kilograms per cubic metre.`,
      ms: 6500,
      view: bench({ target: [THERMO.x, 0.2, THERMO.z], dist: 0.45, pitch: 0.1 }),
      point: 'thermometer',
      beats: [{ at: 600, run: (c) => (c.o.readTemp(), cell(c, 'T', c.v.tempC.toFixed(1))) }],
    },
    { id: 'm1', title: 'm₁: empty and dry', say: () => 'The clean, dry, empty bottle with its stopper.', ms: 5500, view: BAL, point: 'balance', beats: [{ at: 200, run: (c) => c.ops().stopper() }, ...weighBeats(600, 'bottle', (c, m) => cell(c, 'm1', m.toFixed(1)))] },
    {
      id: 'm2',
      title: 'm₂: full of water',
      say: () => 'I fill it with water, tap out any air bubble and top it up to the brim with the dropper. The stopper goes in: the excess rises out through the capillary. I wipe the outside dry, and weigh.',
      ms: 10000,
      view: AT_BOTTLE,
      point: 'bottle',
      beats: [{ at: 200, run: (c) => (c.ops().pan(null), c.ops().unstopper()) }, ...fillBeats('water', 700), ...weighBeats(5200, 'bottle', (c, m) => cell(c, 'm2', m.toFixed(1)))],
    },
    {
      id: 'm3',
      title: 'm₃: full of the liquid',
      say: (c) => `I empty it and dry it thoroughly — water left inside would mix with the ${c.v.liquid}. Then the same again with the ${c.v.liquid}: fill, tap, top up, stopper, wipe, weigh.`,
      ms: 11000,
      view: AT_BOTTLE,
      point: 'bottle',
      beats: [{ at: 200, run: (c) => (c.ops().pan(null), c.ops().empty()) }, { at: 1200, run: (c) => c.ops().dry() }, ...fillBeats('liquid', 2000), ...weighBeats(6400, 'bottle', (c, m) => cell(c, 'm3', m.toFixed(1)))],
    },
    {
      id: 'calc',
      title: 'Relative density and density',
      say: () => 'Mass of water: m two minus m one. Mass of the same volume of liquid: m three minus m one. Their ratio is the relative density — no unit. Times the density of water gives the density.',
      ms: 10000,
      view: bench({ target: [0.1, 0.12, 0], dist: 1.5, pitch: 0.35 }),
      point: 'book',
      panel: 'calc',
      beats: [
        {
          at: 1200,
          run: (c) =>
            c.o.update((x) => {
              const n = (id: string) => Number(x.cells[id] ?? 0);
              const mw = n('m2') - n('m1');
              const ml = n('m3') - n('m1');
              const rd = ml / mw;
              return {
                ...x,
                answers: { ...x.answers, mw: { value: mw.toFixed(1), unit: 'g' }, ml: { value: ml.toFixed(1), unit: 'g' }, rd: { value: rd.toFixed(3), unit: '' }, rho: { value: ((rd * c.v.rhoW) / 1).toFixed(0), unit: 'kg m⁻³' } },
                written: { precautions: 'The bottle was dried before each filling and wiped dry outside before weighing. It was filled to the capillary with no air bubbles.' },
              };
            }),
        },
      ],
    },
  ];
}

export function demoScript(task: DensityTask): DemoStep[] {
  return task === 'ARCH' ? archScript() : task === 'FLOAT' ? floatScript() : task === 'BOTTLE' ? bottleScript() : calScript();
}

/** The worked calculation shown with the last step (demonstration values). */
export function demoCalculation(s: PhyDensityState): string[] {
  const a = s.answers;
  const c = (id: string) => s.cells[id] ?? '—';
  if (s.task === 'CAL' && a.vol.value)
    return [`Cylinder: mean ${c('cm')} cm − zero error (${c('zv')}) = ${a.dcyl.value} cm.`, `Ball: mean ${c('bm')} mm − zero error (${c('zm')}) = ${a.dball.value} mm; r = ${(Number(a.dball.value) / 20).toFixed(4)} cm.`, `V = (4/3)πr³ = ${a.vol.value} cm³.`];
  if (s.task === 'ARCH' && a.rds.value) return [`Upthrust = ${c('w1')} − ${c('w2')} = ${a.up.value} N; water displaced = (${c('mbw')} − ${c('mb')}) g × 9.8 = ${a.wdisp.value} N.`, `RD of stone = ${c('w1')} ÷ ${a.up.value} = ${a.rds.value}.`, `RD of salt solution = (${c('w1')} − ${c('w3')}) ÷ ${a.up.value} = ${a.rdl.value}.`];
  if (s.task === 'FLOAT' && a.rho.value) return [`A = π × ${c('D')}² ÷ 4 = ${a.area.value} cm².`, `ρ = 1 ÷ (A × slope) = 1 ÷ (${a.area.value} × ${a.slope.value}) = ${a.rho.value} g cm⁻³.`, `Tube mass = ρA × intercept = ${a.mtube.value} g (balance: ${c('mt')} g).`];
  if (s.task === 'BOTTLE' && a.rd.value) return [`Water: ${c('m2')} − ${c('m1')} = ${a.mw.value} g; liquid: ${c('m3')} − ${c('m1')} = ${a.ml.value} g.`, `RD = ${a.ml.value} ÷ ${a.mw.value} = ${a.rd.value}.`, `Density = RD × density of water = ${a.rho.value} kg m⁻³.`];
  return [];
}
export { makeOps };
