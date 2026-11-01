import { emptyBioPlantState, oxyIdealRecords, potoIdealRecords, starchIdealRecords, type BioPlantState, type BioPlantVariant, type PlantTask } from '@aischool/shared';
import { useMemo, useState } from 'react';
import { useDemoPlayer, type DemoBeat, type DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import { usePlant, type Plant } from '../actions';
import { OxyNotebook, PotoNotebook, StarchNotebook } from '../notebook';
import { BENCH_IDLE, demoVariant, usePlantBench } from './bench';
import { neededFor } from './scene-state';

/**
 * Mrs Okon's demonstration on her own material (demoVariant: never the
 * student's), on its own in-memory state, through the same actions as the
 * student's lab. POTOMETER: cut and fit under water, seal, a bubble, still
 * air, the fan and the dark, three timings each. OXYGEN: the rig, the heat
 * filter, five distances out to where the bubbling stops, the splint.
 * STARCH: destarched plant, foil and KOH, the light, boil, flame off,
 * ethanol, soften, iodine, the grid.
 */

export interface PlantDemoCtx {
  p: Plant;
  v: BioPlantVariant;
  s: () => BioPlantState;
}
type Beat = DemoBeat<PlantDemoCtx>;
type Step = KitDemoStep<PlantDemoCtx>;
const noop = () => undefined;
const bench = { mode: 'bench' as const, spot: null };
const read = { mode: 'read' as const, spot: null };

const setUp = (task: PlantTask): Step[] => [
  {
    id: 'safety',
    title: 'Safety first',
    say: () => (task === 'STARCH' ? 'Lab coat and goggles on. Ethanol is highly flammable: it will never go near a naked flame.' : task === 'OXYGEN' ? 'Lab coat on. The lamp and its lead stay away from the water, and the lamp gets hot.' : 'Lab coat on. I cut away from my fingers, and keep the fan’s lead away from the water.'),
    ms: 4600,
    view: { ...bench, focus: 'bench' },
    beats: [
      { at: 700, run: (c) => c.p.note('safety:coat') },
      { at: 1500, run: (c) => c.p.note('safety:goggles') },
    ],
  },
  {
    id: 'apparatus',
    title: 'The apparatus',
    say: () => `From the cupboard: ${neededFor(task).map((a) => a.label.toLowerCase()).join(', ')}.`,
    ms: 5600,
    view: { ...bench, focus: 'bench' },
    beats: neededFor(task).map((a, k): Beat => ({ at: 300 + k * 220, run: (c) => c.p.note(`collect:${a.id}`) })),
  },
];

// ------------------------------------------------------------------ potometer

function potoScript(): Step[] {
  const three = (c: PlantDemoCtx) => {
    for (let k = 0; k < 3; k++) {
      c.p.poto.reset();
      c.p.poto.time();
    }
  };
  const settle = (at: number, n = 2): Beat[] => Array.from({ length: n }, (_, k) => ({ at: at + k * 500, run: (c) => c.p.poto.wait(5) }));
  return [
    { id: 'intro', title: 'What we are doing', say: () => 'Watch me with my own shoot. As the leaves lose water vapour, the shoot draws water up its stem; the potometer shows how fast, by a bubble moving along a capillary.', ms: 5600, view: { ...bench, focus: 'bench' }, point: 'potometer', beats: [] },
    ...setUp('POTOMETER'),
    {
      id: 'cut',
      title: 'Cut and fit under water',
      say: () => 'I cut the stem at a slant under the water, so no air is drawn into the xylem, and fit it into the potometer still under water. Then Vaseline round the joint: it must be airtight.',
      ms: 7000,
      view: { ...bench, focus: 'shoot' },
      point: 'shoot',
      beats: [
        { at: 900, run: (c) => c.p.poto.cut('WATER') },
        { at: 2600, run: (c) => c.p.poto.fit('WATER') },
        { at: 4600, run: (c) => c.p.poto.seal() },
      ],
    },
    { id: 'bubble', title: 'One air bubble', say: () => 'I lift it out, dry the leaves and let one air bubble into the capillary. Now ten minutes in still air for the shoot to settle.', ms: 5600, view: { ...bench, focus: 'potometer' }, point: 'potometer', beats: [{ at: 600, run: (c) => c.p.poto.bubble() }, ...settle(2400)] },
    { id: 'still', title: 'Still air: three timings', say: () => 'I reset the bubble to zero with the reservoir tap and time it over 30 millimetres — three times. Still air is the control.', ms: 6500, view: read, beats: [{ at: 1200, run: three }] },
    { id: 'fan', title: 'The fan', say: () => 'Now the fan blows on the shoot. Ten minutes to settle, then three timings: the bubble moves much faster — moving air carries the water vapour away.', ms: 7500, view: read, beats: [{ at: 400, run: (c) => c.p.poto.setCond('FAN') }, ...settle(1200), { at: 3200, run: three }] },
    { id: 'dark', title: 'In the dark', say: () => 'A black bag over the shoot. The stomata close slowly, so I wait ten minutes. The bubble crawls: in the dark, transpiration is much slower.', ms: 7500, view: read, beats: [{ at: 400, run: (c) => c.p.poto.setCond('DARK') }, ...settle(1200), { at: 3200, run: three }] },
    { id: 'table', title: 'The table and bar chart', say: () => 'Mean time, rate — 30 millimetres divided by the mean time in minutes — and volume, the rate times pi r squared. Then a bar for each condition.', ms: 7000, view: { ...bench, focus: 'bench' }, point: 'book', panel: 'notebook', beats: [{ at: 900, run: (c) => c.p.update((s) => ({ ...s, poto: potoIdealRecords(c.v, s) }), 'table') }] },
    { id: 'turn', title: 'Your turn!', say: () => 'Now it is your turn with your own shoot. Cut it under water, seal the joint, and let it settle five minutes after every change.', ms: 4800, view: { ...bench, focus: 'bench' }, beats: [] },
  ];
}

// ------------------------------------------------------------------ oxygen

function oxyScript(): Step[] {
  const at = (d: number): Beat[] => [
    { at: 300, run: (c) => c.p.oxy.lamp(d) },
    { at: 1200, run: (c) => c.p.oxy.wait(5) },
    { at: 2200, run: (c) => (c.p.oxy.count(), c.p.oxy.count(), c.p.oxy.count(), c.p.oxy.temp()) },
  ];
  return [
    { id: 'intro', title: 'What we are doing', say: () => 'Watch me with my own pondweed. In the light it makes oxygen, which comes off the cut stem as bubbles. I count them with the lamp at different distances.', ms: 5600, view: { ...bench, focus: 'bench' }, point: 'rig', beats: [] },
    ...setUp('OXYGEN'),
    {
      id: 'rig',
      title: 'Set up',
      say: () => 'A pinch of sodium hydrogencarbonate for carbon dioxide; the pondweed under the funnel, cut end up; a test tube of water over the stem. A water trough between lamp and beaker keeps the temperature steady, and the room is darkened.',
      ms: 8500,
      view: { ...bench, focus: 'oxygen' },
      point: 'rig',
      beats: [
        { at: 600, run: (c) => c.p.oxy.nahco3() },
        { at: 1800, run: (c) => c.p.oxy.plant() },
        { at: 3200, run: (c) => c.p.oxy.tube() },
        { at: 4800, run: (c) => c.p.oxy.shield(true) },
        { at: 6400, run: (c) => c.p.oxy.dark(true) },
      ],
    },
    { id: 'd10', title: '10 cm', say: () => 'Lamp at 10 centimetres. Five minutes to adjust, then I count the bubbles for a minute, three times.', ms: 5500, view: read, beats: at(10) },
    { id: 'd20', title: '20 cm', say: () => 'At 20 centimetres the light is a quarter as bright — intensity goes as one over d squared — but the rate falls by much less: near the lamp something else was limiting it.', ms: 6500, view: read, beats: at(20) },
    { id: 'd40', title: '40 cm', say: () => 'At 40 centimetres, far fewer bubbles: here light is the limiting factor.', ms: 5200, view: read, beats: at(40) },
    { id: 'd60', title: '60 cm', say: () => 'Further still: very few bubbles, or none at all.', ms: 4200, view: read, beats: at(60) },
    { id: 'd100', title: 'Bubbling stops', say: () => 'Far from the lamp there is no bubbling: photosynthesis now only balances respiration. Where it stops is near the compensation point.', ms: 6200, view: read, beats: at(100) },
    { id: 'splint', title: 'The glowing splint', say: (c) => (c.s().oxy.splintAt !== null ? 'Back to 10 centimetres to collect plenty of gas. A glowing splint in the tube… it bursts into flame: the gas is mainly oxygen.' : 'Back to 10 centimetres to collect plenty of gas, then the glowing splint test.'), ms: 7000, view: { ...bench, focus: 'oxygen' }, point: 'splint', beats: [{ at: 300, run: (c) => c.p.oxy.lamp(10) }, { at: 1200, run: (c) => (c.p.oxy.wait(5), c.p.oxy.wait(5), c.p.oxy.wait(5), c.p.oxy.wait(5)) }, { at: 3200, run: (c) => c.p.oxy.splint() }] },
    { id: 'table', title: 'Table and graph', say: () => 'Means, light intensities as 10 000 over d squared, and the rate plotted against intensity: a smooth curve that rises, then levels off.', ms: 7000, view: { ...bench, focus: 'bench' }, point: 'book', panel: 'notebook', beats: [{ at: 900, run: (c) => c.p.update((s) => ({ ...s, oxy: oxyIdealRecords(c.v, s) }), 'table') }] },
    { id: 'turn', title: 'Your turn!', say: () => 'Now it is your turn. Heat filter in, five minutes at each distance, and go far enough that the bubbling stops.', ms: 4800, view: { ...bench, focus: 'bench' }, beats: [] },
  ];
}

// ------------------------------------------------------------------ starch

function starchScript(): Step[] {
  const all = (c: PlantDemoCtx, f: (i: number) => void) => c.s().starch.leaves.forEach((_, i) => f(i));
  return [
    { id: 'intro', title: 'What we are doing', say: () => 'Watch me with my own plant. Leaves store the sugar they make as starch; iodine turns starch blue-black. Where is starch made — and where not?', ms: 5600, view: { ...bench, focus: 'bench' }, point: 'pot', beats: [] },
    ...setUp('STARCH'),
    {
      id: 'prepare',
      title: 'Destarched plant, foil and KOH',
      say: () => 'This plant spent 48 hours in the dark, so its leaves have no starch left. A strip of foil across one leaf, both sides; another leaf sealed in a flask with potassium hydroxide, which absorbs carbon dioxide. Then six hours of bright light.',
      ms: 9000,
      view: { ...bench, focus: 'plant' },
      point: 'pot',
      beats: [
        { at: 600, run: (c) => c.p.starch.plant('DESTARCHED') },
        { at: 2200, run: (c) => c.p.starch.foil() },
        { at: 3600, run: (c) => c.p.starch.koh() },
        { at: 5200, run: (c) => (c.p.starch.light(2), c.p.starch.light(2), c.p.starch.light(2)) },
      ],
    },
    {
      id: 'pick',
      title: 'Pick the leaves',
      say: () => 'The foil-strip leaf, a variegated leaf, the leaf from the flask and a green leaf as the control. I draw the variegated leaf’s pattern first.',
      ms: 6000,
      view: { ...bench, focus: 'plant' },
      beats: [{ at: 600, run: (c) => (c.p.starch.pick('FOIL'), c.p.starch.pick('VARIEGATED'), c.p.starch.pick('NOCO2'), c.p.starch.pick('LIGHT'), c.p.starch.draw()) }],
    },
    { id: 'boil', title: 'Boil in water', say: () => 'One minute in boiling water: it kills the cells and breaks the membranes so the iodine can get in.', ms: 5500, view: { ...bench, focus: 'bath' }, point: 'bath', beats: [{ at: 500, run: (c) => c.p.starch.flame(true) }, { at: 1800, run: (c) => all(c, (i) => c.p.starch.boil(i)) }] },
    { id: 'off', title: 'FLAME OFF, then ethanol', say: () => 'Now the most important step: I turn the flame OFF. Only then does the tube of ethanol go into the hot water. The ethanol dissolves the chlorophyll — the leaf turns white and the ethanol green.', ms: 8000, view: { ...bench, focus: 'bath' }, point: 'bath', beats: [{ at: 1200, run: (c) => c.p.starch.flame(false) }, { at: 3600, run: (c) => (usePlantBench.setState({ sel: 0 }), all(c, (i) => c.p.starch.ethanol(i))) }] },
    { id: 'iodine', title: 'Soften, spread, iodine', say: () => 'The leaf is brittle now, so I dip it in warm water, spread it on the white tile and cover it with iodine.', ms: 6500, view: { ...bench, focus: 'tile' }, point: 'tile', beats: [{ at: 600, run: (c) => all(c, (i) => (c.p.starch.soften(i), c.p.starch.tile(i))) }, { at: 2600, run: (c) => all(c, (i) => c.p.starch.iodine(i)) }] },
    { id: 'look', title: 'Blue-black only where…', say: () => 'Blue-black where the leaf had light, chlorophyll and carbon dioxide; yellow-brown under the foil, in the white parts and in the leaf without CO₂.', ms: 7500, view: read, beats: [{ at: 300, run: (c) => (usePlantBench.setState({ sel: 0 }), c.p.starch.grid(0)) }, { at: 3800, run: () => usePlantBench.setState({ sel: 1 }) }] },
    { id: 'table', title: 'The notebook', say: () => 'An observation and inference for each leaf, and on the grid: squares covered, blue-black squares, and the percentage that made starch.', ms: 6500, view: { ...bench, focus: 'bench' }, point: 'book', panel: 'notebook', beats: [{ at: 900, run: (c) => c.p.update((s) => ({ ...s, starch: starchIdealRecords(c.v, s, 0) }), 'table') }] },
    { id: 'turn', title: 'Your turn!', say: () => 'Now it is your turn. Destarched plant, boil first, and the flame OFF before the ethanol.', ms: 4800, view: { ...bench, focus: 'bench' }, beats: [] },
  ];
}

/** The demo: its own material and in-memory state, played by the kit's demo engine. */
export function usePlantDemo({ studentSeed, task, startedAt, active, onFinished }: { studentSeed: number; task: PlantTask; startedAt: string; active: boolean; onFinished: () => void }) {
  const variant = useMemo(() => demoVariant(studentSeed, task), [studentSeed, task]);
  const fresh = () => ({ ...emptyBioPlantState(), task });
  const [state, setState] = useState<BioPlantState>(fresh);
  const p = usePlant({ seed: variant.seed, state, onChange: setState, readOnly: false, startedAt, variant });
  const steps = useMemo(() => (task === 'OXYGEN' ? oxyScript() : task === 'STARCH' ? starchScript() : potoScript()), [task]);
  const ctx = (): PlantDemoCtx => ({ p, v: variant, s: () => p.ref.current });
  const player = useDemoPlayer<PlantDemoCtx>({
    steps,
    ctx,
    reset: () => {
      usePlantBench.setState(BENCH_IDLE);
      p.ref.current = fresh();
      setState(p.ref.current);
    },
    goggles: (c) => c.s().log.some((e) => e.a === 'safety:goggles'),
    active,
    onFinished,
  });
  const panel = (id: string) =>
    id === 'notebook' ? (
      <section className="pointer-events-none absolute right-2 top-40 z-10 hidden max-h-[calc(100%-18rem)] w-[420px] overflow-hidden rounded-2xl bg-card p-3 text-card-foreground shadow-xl sm:block" aria-label="Demonstration notebook">
        {task === 'OXYGEN' ? <OxyNotebook state={state} readOnly update={noop} book className="border-0 p-0 shadow-none sm:p-0" /> : task === 'STARCH' ? <StarchNotebook v={variant} state={state} readOnly update={noop} book className="border-0 p-0 shadow-none sm:p-0" /> : <PotoNotebook v={variant} state={state} readOnly update={noop} book className="border-0 p-0 shadow-none sm:p-0" />}
      </section>
    ) : null;
  return { player, state, p, panel, v: variant };
}
