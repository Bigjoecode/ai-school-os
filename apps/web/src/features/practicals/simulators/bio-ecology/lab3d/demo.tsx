import { capModelState, emptyBioEcologyState, facModelState, quadModelState, soilModelState, type BioEcologyState, type BioEcologyVariant, type EcoTask } from '@aischool/shared';
import { useMemo, useState } from 'react';
import { useDemoPlayer, type DemoBeat, type DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import { useEcology, type Ecology } from '../actions';
import { EcoNotebook } from '..';
import { ECO_VIEWS, demoVariant, useEcoBench } from './bench';
import { neededFor } from './scene-state';

/**
 * Mrs Okon's demonstration on her own field (demoVariant: never the
 * student's), on its own in-memory state, through the same actions as the
 * student's lab: quadrats from the random-number table and the counting;
 * a sweep, a harmless mark, a day's wait and the recapture; a morning at the
 * weather station and both sites; the jar, the funnels, the air test and the
 * crucibles. The notebook at the end is the worked model answer for her field.
 */

export interface EcoDemoCtx {
  o: Ecology;
  v: BioEcologyVariant;
  s: () => BioEcologyState;
}
type Beat = DemoBeat<EcoDemoCtx>;
type Step = KitDemoStep<EcoDemoCtx>;
const noop = () => undefined;
const bench = { mode: 'bench' as const, spot: null };
const at = (id: string) => ({ mode: 'bench' as const, spot: ECO_VIEWS[id]! });
const read = { mode: 'read' as const, spot: null };
/** Fills the notebook from the model answer for her field (the same readings her apparatus showed). */
const record = (model: (v: BioEcologyVariant) => BioEcologyState) => (c: EcoDemoCtx) => c.o.update((s) => ({ ...model(c.v), written: s.written, log: s.log }), 'table');

const setUp = (task: EcoTask): Step[] => [
  { id: 'safety', title: 'Safety first', say: () => (task === 'SOIL' ? 'Lab coat and goggles: I shall heat soil strongly.' : 'Lab coat, covered shoes and a hat. I look where I kneel — ants and scorpions live in the grass.'), ms: 4200, view: { ...bench, focus: 'bench' }, beats: [{ at: 700, run: (c) => c.o.note('safety:coat') }, { at: 1500, run: (c) => task === 'SOIL' && c.o.note('safety:goggles') }] },
  { id: 'apparatus', title: 'The apparatus', say: () => `From the shed: ${neededFor(task).map((a) => a.label.toLowerCase()).join(', ')}.`, ms: 5200, view: { ...bench, focus: 'bench' }, beats: neededFor(task).map((a, k): Beat => ({ at: 300 + k * 200, run: (c) => c.o.note(`collect:${a.id}`) })) },
];

function quadScript(): Step[] {
  return [
    { id: 'intro', title: 'What we are doing', say: () => 'Watch me on my own plot, not yours. I sample the plants with quadrats placed at random, to estimate how many there are.', ms: 5000, view: at('plot'), point: 'plot', beats: [] },
    ...setUp('QUADRAT'),
    { id: 'peg', title: 'Peg out the plot', say: () => 'Pegs at the corners and the tapes along two edges: they are my x and y axes, 0 to 20 metres.', ms: 5000, view: at('plot'), point: 'plot', beats: [{ at: 800, run: (c) => c.o.quad.peg() }] },
    { id: 'random', title: 'Random coordinates', say: () => 'I read two numbers at a time from the random-number table, using only 00 to 19. Each pair is where a quadrat goes — never where I can see plants.', ms: 9000, view: at('plot'), point: 'plot', beats: Array.from({ length: 12 }, (_, k): Beat => ({ at: 600 + k * 600, run: (c) => c.o.quad.placeRandom() })) },
    { id: 'count', title: 'Counting a quadrat', say: () => 'In each one I count every Tridax, Sida and Euphorbia rooted inside — those on the frame only on two sides — and the grid squares more than half covered by grass.', ms: 8000, view: read, beats: [{ at: 400, run: (c) => (Array.from({ length: 12 }, (_, i) => c.o.quad.look(i)), useEcoBench.setState({ sel: 0 })) }, { at: 4500, run: () => useEcoBench.setState({ sel: 3 }) }] },
    { id: 'record', title: 'Density, frequency, population', say: (c) => `Density is the total divided by the area sampled — twelve square metres. Frequency is the quadrats with the herb out of all twelve. Here Tridax: ${c.s().quad.res.TRIDAX.density || '…'} per square metre.`, ms: 8000, view: { ...bench, focus: 'bench' }, point: 'book', panel: 'notebook', beats: [{ at: 800, run: record((v) => quadModelState(v)) }] },
    { id: 'turn', title: 'Your turn!', say: () => 'Now your plot. Random numbers for every quadrat, and at least ten of them.', ms: 4000, view: { ...bench, focus: 'bench' }, beats: [] },
  ];
}
function capScript(): Step[] {
  return [
    { id: 'intro', title: 'What we are doing', say: () => 'Grasshoppers move about, so I cannot count them in quadrats. I catch some, mark them, let them go, and catch again.', ms: 5000, view: at('plot'), point: 'plot', beats: [] },
    ...setUp('CAPTURE'),
    { id: 'sweep', title: 'First sample', say: () => 'Ten minutes of even sweeping across the plot. Then I tip the catch onto the white tray and count them: n one.', ms: 7000, view: at('tray'), point: 'tray', beats: [{ at: 600, run: (c) => c.o.cap.sweep1(10) }, { at: 2600, run: (c) => c.o.cap.count1() }] },
    { id: 'mark', title: 'A harmless mark', say: () => 'A tiny dot of non-toxic paint under each one — it does not hurt them, and birds cannot see it. Then I release them where I caught them.', ms: 7000, view: at('tray'), point: 'paint', beats: [{ at: 900, run: (c) => c.o.cap.mark('DOT') }, { at: 4000, run: (c) => c.o.cap.release('SCATTER') }] },
    { id: 'wait', title: 'A day to mix', say: () => 'They need about a day to mix with the others. Too soon and the marked ones are still bunched where I let them go.', ms: 5000, view: at('plot'), point: 'plot', beats: [{ at: 1500, run: (c) => c.o.cap.wait(24) }] },
    { id: 'again', title: 'Second sample', say: () => 'The same ten minutes of sweeping. I turn each one over: these few have my dot. That is m.', ms: 7500, view: read, beats: [{ at: 500, run: (c) => c.o.cap.sweep2(10) }, { at: 3000, run: (c) => c.o.cap.examine() }, { at: 6000, run: (c) => c.o.cap.free() }] },
    { id: 'record', title: 'The Lincoln index', say: (c) => `N equals n one times n two divided by m: ${c.s().cap.n1 || '…'} times ${c.s().cap.n2 || '…'} divided by ${c.s().cap.m || '…'} — about ${c.s().cap.N || '…'} grasshoppers.`, ms: 8000, view: { ...bench, focus: 'bench' }, point: 'book', panel: 'notebook', beats: [{ at: 600, run: record((v) => capModelState(v)) }] },
    { id: 'turn', title: 'Your turn!', say: () => 'Now yours. A small hidden mark, a day to mix, and the same effort both times.', ms: 4000, view: { ...bench, focus: 'bench' }, beats: [] },
  ];
}
function facScript(): Step[] {
  return [
    { id: 'intro', title: 'What we are doing', say: () => 'I compare the open field with the shade of the tree: light, temperature, humidity, wind and soil.', ms: 5000, view: at('station'), point: 'screen', beats: [] },
    ...setUp('FACTORS'),
    { id: 'station', title: '9 am at the weather station', say: () => 'The Six’s thermometer: I read the bottom of each steel index — the highest and lowest since yesterday — then reset them with the magnet. The rain gauge: read, then empty. The vane points into the wind.', ms: 9000, view: at('station'), point: 'screen', beats: [{ at: 500, run: (c) => (c.o.fac.station('SIX'), c.o.fac.station('RAIN'), c.o.fac.station('VANE')) }, { at: 4500, run: (c) => (c.o.fac.reset(), c.o.fac.empty()) }] },
    { id: 'open', title: 'The open field', say: () => 'At ten o’clock: air temperature with the bulb shaded by the card — direct sun would make it read high — the soil thermometer, both bulbs of the hygrometer, light at ground level, and the wind.', ms: 9000, view: at('open'), point: 'site:OPEN', beats: [{ at: 400, run: (c) => (c.o.fac.wait(60), c.o.fac.go('OPEN')) }, ...(['AIR', 'SOIL', 'HYGRO', 'LIGHT', 'WIND', 'PH'] as const).map((i, k): Beat => ({ at: 1500 + k * 900, run: (c) => c.o.fac.read(i, true) }))] },
    { id: 'shade', title: 'Under the canopy, straight after', say: () => 'Within the same hour, the same readings under the tree. Darker, cooler, calmer and more humid.', ms: 8000, view: at('shade'), point: 'site:SHADE', beats: [{ at: 400, run: (c) => c.o.fac.go('SHADE') }, ...(['AIR', 'SOIL', 'HYGRO', 'LIGHT', 'WIND', 'PH'] as const).map((i, k): Beat => ({ at: 1500 + k * 900, run: (c) => c.o.fac.read(i, true) }))] },
    { id: 'pond', title: 'The pond', say: () => 'Standing well back, I lower the Secchi disc until it just disappears: the depth on the rope tells me how clear the water is.', ms: 6000, view: at('pond'), point: 'pond', beats: [{ at: 500, run: (c) => (c.o.fac.go('POND'), c.o.fac.secchi()) }] },
    { id: 'record', title: 'Three days and the means', say: () => 'I repeat this on three days at the same time, then work out the means, the humidity from the table, the daily mean and range, and the rainfall.', ms: 8000, view: { ...bench, focus: 'bench' }, point: 'book', panel: 'notebook', beats: [{ at: 800, run: record(facModelState) }] },
    { id: 'turn', title: 'Your turn!', say: () => 'Now yours. Same time at both sites, and keep the sun off the thermometers.', ms: 4000, view: { ...bench, focus: 'bench' }, beats: [] },
  ];
}
function soilScript(): Step[] {
  return [
    { id: 'intro', title: 'What we are doing', say: () => 'Three soils — sand, loam and clay. How fast does water drain through each, how much air and humus do they hold, and what are they made of?', ms: 5000, view: { ...bench, focus: 'bench' }, point: 'bag:LOAM', beats: [] },
    ...setUp('SOIL'),
    { id: 'jar', title: 'The jar', say: () => 'Loam and water in a jar, shaken hard, then left to settle while I work.', ms: 5000, view: at('jars'), point: 'jars', beats: [{ at: 500, run: (c) => (c.o.soil.jar('LOAM'), c.o.soil.shake(0)) }] },
    { id: 'drain', title: 'Drainage', say: () => '100 grams of each dry soil on cotton wool, 100 cubic centimetres of water on each at once, and I read the cylinders at 1, 2, 5, 10, 20 and 30 minutes.', ms: 10000, view: at('rack'), point: 'funnels', beats: [{ at: 400, run: (c) => (['SAND', 'LOAM', 'CLAY'] as const).forEach((t) => c.o.soil.funnel(t, 100, true)) }, { at: 1500, run: (c) => c.o.soil.pour() }, ...Array.from({ length: 6 }, (_, k): Beat => ({ at: 2500 + k * 1100, run: (c) => (c.o.soil.waitDrain(), c.o.soil.readAllDrain()) }))] },
    { id: 'air', title: 'Air content', say: () => 'Fifty of soil into fifty of water. Bubbles rise as water fills the air spaces; I stir until they stop and read the volume.', ms: 7000, view: { ...bench, focus: 'bench' }, point: 'cylinders', beats: (['SAND', 'LOAM', 'CLAY'] as const).map((t, k): Beat => ({ at: 400 + k * 1500, run: (c) => (c.o.soil.air(t), c.o.soil.addSoil(k), c.o.soil.stir(k), c.o.soil.readAir(k)) })) },
    { id: 'humus', title: 'Humus', say: () => 'Oven-dried soil in a weighed crucible. Heat strongly, cool in the desiccator, weigh — and again, until two weighings agree: constant mass.', ms: 9000, view: at('heat'), point: 'burner', beats: [{ at: 400, run: (c) => (['SAND', 'LOAM', 'CLAY'] as const).forEach((t, k) => (c.o.soil.crucible(t, true), c.o.soil.weigh(k), c.o.soil.addSample(k), c.o.soil.weigh(k))) }, ...[0, 1, 2].map((k): Beat => ({ at: 2500 + k * 2000, run: (c) => (c.o.soil.heatAll(), c.o.soil.coolAll(), [0, 1, 2].forEach((i) => c.o.soil.weigh(i))) }))] },
    { id: 'settled', title: 'The jar next day', say: () => 'Next day: gravel and coarse sand at the bottom, then fine sand, silt and clay; humus floating on top.', ms: 6000, view: at('jars'), point: 'jars', beats: [{ at: 600, run: (c) => (c.o.soil.waitJar(24), c.o.soil.measureJar(0)) }] },
    { id: 'record', title: 'The notebook', say: () => 'Water retained is 100 minus the volume collected. Clay holds most; sand drains fastest; loam has most humus.', ms: 8000, view: { ...bench, focus: 'bench' }, point: 'book', panel: 'notebook', beats: [{ at: 800, run: record(soilModelState) }] },
    { id: 'turn', title: 'Your turn!', say: () => 'Now yours. Same mass in each funnel, stir the air test, and heat to constant mass.', ms: 4000, view: { ...bench, focus: 'bench' }, beats: [] },
  ];
}

/** The demo: its own field and in-memory state, played by the kit's demo engine. */
export function useEcoDemo({ studentSeed, task, startedAt, active, onFinished }: { studentSeed: number; task: EcoTask; startedAt: string; active: boolean; onFinished: () => void }) {
  const variant = useMemo(() => demoVariant(studentSeed, task), [studentSeed, task]);
  const fresh = () => ({ ...emptyBioEcologyState(), task });
  const [state, setState] = useState<BioEcologyState>(fresh);
  const o = useEcology({ seed: variant.seed, state, onChange: setState, readOnly: false, startedAt, variant });
  const steps = useMemo(() => (task === 'CAPTURE' ? capScript() : task === 'FACTORS' ? facScript() : task === 'SOIL' ? soilScript() : quadScript()), [task]);
  const ctx = (): EcoDemoCtx => ({ o, v: variant, s: () => o.ref.current });
  const player = useDemoPlayer<EcoDemoCtx>({
    steps,
    ctx,
    reset: () => {
      useEcoBench.setState({ sel: 0 });
      o.ref.current = fresh();
      setState(o.ref.current);
    },
    goggles: (c) => c.s().log.some((e) => e.a === 'safety:goggles'),
    active,
    onFinished,
  });
  const panel = (id: string) =>
    id === 'notebook' ? (
      <section className="pointer-events-none absolute right-2 top-40 z-10 hidden max-h-[calc(100%-18rem)] w-[440px] overflow-hidden rounded-2xl bg-card p-3 text-card-foreground shadow-xl sm:block" aria-label="Demonstration notebook">
        <EcoNotebook o={{ ...o, update: noop }} state={state} readOnly book className="border-0 p-0 shadow-none sm:p-0" />
      </section>
    ) : null;
  return { player, state, o, panel, v: variant };
}
