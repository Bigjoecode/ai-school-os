import { emptyBioGrowthState, germIdealRecords, respIdealRecords, seedIdealRecords, tropIdealRecords, type BioGrowthState, type BioGrowthVariant, type GrowthTask } from '@aischool/shared';
import { useMemo, useState } from 'react';
import { useDemoPlayer, type DemoBeat, type DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import { useGrowth, type Growth } from '../actions';
import { GermNotebook, RespNotebook, SeedNotebook, TropNotebook } from '../notebook';
import { BENCH_IDLE, demoVariant, useGrowthBench } from './bench';
import { neededFor } from './scene-state';
import { FlasksSvg, GermTubesSvg, SeedlingSvg, TropSvg } from '../visuals';

/**
 * Mrs Okon's demonstration on her own material (demoVariant: never the
 * student's), on its own in-memory state, through the same actions as the
 * student's lab. GERM: sorted seeds, the four tubes, counted daily. SEEDLING:
 * soaked, sown in sawdust and the jar, watered and measured daily, drawn.
 * RESP: boiled half, disinfected both, flasks plugged and inverted, read
 * daily, lime water. TROPISM: the box, the clinostat, the cork, measured.
 */

export interface GrowthDemoCtx {
  p: Growth;
  v: BioGrowthVariant;
  s: () => BioGrowthState;
}
type Beat = DemoBeat<GrowthDemoCtx>;
type Step = KitDemoStep<GrowthDemoCtx>;
const noop = () => undefined;
const bench = { mode: 'bench' as const, spot: null };

const setUp = (task: GrowthTask): Step[] => [
  {
    id: 'safety',
    title: 'Safety first',
    say: () => (task === 'RESP' ? 'Lab coat and goggles on: I will be boiling seeds and using disinfectant.' : task === 'TROPISM' ? 'Lab coat on. The clinostat and the lamp stay well away from water.' : 'Lab coat on. I will wash my hands after handling the seeds and the sawdust.'),
    ms: 4200,
    view: { ...bench, focus: 'bench' },
    beats: [
      { at: 600, run: (c) => c.p.note('safety:coat') },
      { at: 1400, run: (c) => c.p.note('safety:goggles') },
    ],
  },
  {
    id: 'apparatus',
    title: 'The apparatus',
    say: () => `From the cupboard: ${neededFor(task).map((a) => a.label.toLowerCase()).join(', ')}.`,
    ms: 5200,
    view: { ...bench, focus: 'bench' },
    beats: neededFor(task).map((a, k): Beat => ({ at: 300 + k * 200, run: (c) => c.p.note(`collect:${a.id}`) })),
  },
];
const turn = (say: string): Step => ({ id: 'turn', title: 'Your turn!', say: () => say, ms: 4600, view: { ...bench, focus: 'bench' }, beats: [] });

function germScript(): Step[] {
  const day = (n: number): Beat[] => [{ at: 300, run: (c) => (c.p.germ.wait(), c.p.germ.look()) }, ...(n > 1 ? [{ at: 1500, run: (c: GrowthDemoCtx) => (c.p.germ.wait(), c.p.germ.look()) }] : [])];
  return [
    { id: 'intro', title: 'What we are doing', say: () => 'Watch me with my own seeds. Which conditions does a seed need to germinate? Four tubes, each missing one condition — and a control with them all.', ms: 5600, view: { ...bench, focus: 'bench' }, point: 'rack', beats: [] },
    ...setUp('GERM'),
    {
      id: 'tubes',
      title: 'Four tubes',
      say: () => 'Sorted seeds, ten in each tube. A: moist cotton wool — the control. B: dry cotton wool, no water. C: boiled, cooled water with a layer of oil, so no oxygen. D: moist cotton wool, into the refrigerator. Then I label them.',
      ms: 9500,
      view: { ...bench, focus: 'tubes' },
      point: 'tube:0',
      beats: [
        { at: 500, run: (c) => c.p.germ.batch('SORTED') },
        { at: 1400, run: (c) => (c.p.germ.cotton(0, 'MOIST'), c.p.germ.sow(0)) },
        { at: 2800, run: (c) => (c.p.germ.cotton(1, 'DRY'), c.p.germ.sow(1)) },
        { at: 4200, run: (c) => (c.p.germ.water(2, 'BOILED'), c.p.germ.sow(2), c.p.germ.oil(2)) },
        { at: 5800, run: (c) => (c.p.germ.cotton(3, 'MOIST'), c.p.germ.sow(3), c.p.germ.fridge(3, true)) },
        { at: 7400, run: (c) => [0, 1, 2, 3].forEach((k) => c.p.germ.label(k)) },
      ],
    },
    { id: 'd1', title: 'Days 1 and 2', say: () => 'After a day the seeds with water have swollen — but swollen is not germinated. By day 2 radicles appear in tube A.', ms: 6200, view: { ...bench, focus: 'tubes' }, panel: 'closeup', beats: day(2) },
    { id: 'd3', title: 'Days 3 to 5', say: () => 'Each day I count only the seeds whose radicle shows. Nearly all of tube A by day 5; nothing in B or C; perhaps one in the cold.', ms: 7000, view: { ...bench, focus: 'tubes' }, panel: 'closeup', beats: [...day(2), { at: 3200, run: (c) => (c.p.germ.wait(), c.p.germ.look()) }] },
    { id: 'table', title: 'The table', say: () => 'The counts for each day, then percentage germination: germinated divided by sown, times one hundred — and the condition each tube lacked.', ms: 7000, view: { ...bench, focus: 'bench' }, point: 'book', panel: 'notebook', beats: [{ at: 900, run: (c) => c.p.update((s) => ({ ...s, germ: germIdealRecords(c.v, s) }), 'table') }] },
    turn('Now it is your turn with your own seeds. Sort them, ten in each tube, oil on the boiled water — and count only radicles.'),
  ];
}

function seedScript(): Step[] {
  const day = (c: GrowthDemoCtx) => {
    c.p.seedling.wait();
    c.p.seedling.water();
    c.p.seedling.measure('COWPEA', 'SEED');
    c.p.seedling.measure('MAIZE', 'SEED');
    const d = c.s().seedling.day;
    if (d === 3 || d === 7) c.p.seedling.draw();
  };
  const days = (n: number): Beat[] => Array.from({ length: n }, (_, k) => ({ at: 400 + k * 700, run: day }));
  return [
    { id: 'intro', title: 'What we are doing', say: () => 'Watch me with my own cowpea and maize. Both germinate — but in different ways. Where do the cotyledons end up?', ms: 5200, view: { ...bench, focus: 'bench' }, point: 'jar', beats: [] },
    ...setUp('SEEDLING'),
    { id: 'sow', title: 'Soak and sow', say: () => 'Soaked overnight, then sown in moist sawdust, and between blotting paper and the glass of this jar, where I can watch them.', ms: 6200, view: { ...bench, focus: 'jar' }, point: 'jar', beats: [{ at: 500, run: (c) => c.p.seedling.soak() }, { at: 1800, run: (c) => (c.p.seedling.sow('box'), c.p.seedling.sow('jar')) }] },
    { id: 'early', title: 'Days 1 to 3', say: () => 'The radicle always comes first. Every day: water, then measure each shoot from the seed with the ruler. I draw them at day 3.', ms: 6500, view: { ...bench, focus: 'jar' }, panel: 'closeup', beats: days(3) },
    { id: 'mid', title: 'Days 4 to 6', say: () => 'The cowpea hypocotyl arches up through the sawdust, pulling the cotyledons out: epigeal. The maize coleoptile pushes up straight; the grain stays below: hypogeal.', ms: 8000, view: { ...bench, focus: 'box' }, point: 'box', beats: days(3) },
    { id: 'late', title: 'Days 7 to 9', say: () => 'Growth speeds up. The cowpea cotyledons turn green above the soil. I draw again at day 7.', ms: 6500, view: { ...bench, focus: 'jar' }, panel: 'closeup', beats: days(3) },
    { id: 'table', title: 'Table and graph', say: () => 'Lengths against time, joined by a smooth curve. Growth rate between day 4 and day 8: the difference in length divided by four.', ms: 7000, view: { ...bench, focus: 'bench' }, point: 'book', panel: 'notebook', beats: [{ at: 900, run: (c) => c.p.update((s) => ({ ...s, seedling: seedIdealRecords(c.v, s) }), 'table') }] },
    turn('Now it is your turn. Keep the medium moist, and measure from the same point every day.'),
  ];
}

function respScript(): Step[] {
  const day = (): Beat[] => [{ at: 400, run: (c) => (c.p.resp.wait(24), c.p.resp.read()) }];
  return [
    { id: 'intro', title: 'What we are doing', say: () => 'Watch me with my own seeds. Do germinating seeds give out heat and carbon dioxide? Living seeds in flask A, killed seeds in flask B.', ms: 5600, view: { ...bench, focus: 'bench' }, point: 'flask:A', beats: [] },
    ...setUp('RESP'),
    {
      id: 'prepare',
      title: 'Boil, cool, disinfect',
      say: () => 'Soaked seeds, starting to germinate. Half are boiled for ten minutes and cooled: they are dead. Both batches are rinsed in disinfectant, so microbes cannot respire and give off heat.',
      ms: 8500,
      view: { ...bench, focus: 'bench' },
      point: 'boiler',
      beats: [
        { at: 500, run: (c) => c.p.resp.soak() },
        { at: 2000, run: (c) => c.p.resp.boil() },
        { at: 4500, run: (c) => (c.p.resp.disinfect('LIVE'), c.p.resp.disinfect('BOILED')) },
      ],
    },
    {
      id: 'flasks',
      title: 'The flasks',
      say: () => 'Equal amounts: germinating seeds in A, boiled in B. A thermometer in each, a loose cotton-wool plug, and the flasks upside down in their clamps.',
      ms: 8000,
      view: { ...bench, focus: 'flasks' },
      point: 'flask:A',
      beats: [
        { at: 500, run: (c) => (c.p.resp.fill('A', 'LIVE', 'FULL'), c.p.resp.fill('B', 'BOILED', 'FULL')) },
        { at: 2200, run: (c) => (c.p.resp.thermo('A'), c.p.resp.thermo('B')) },
        { at: 3800, run: (c) => (c.p.resp.plug('A', 'COTTON'), c.p.resp.plug('B', 'COTTON')) },
        { at: 5400, run: (c) => (c.p.resp.invert('A'), c.p.resp.invert('B'), c.p.resp.co2('LIME'), c.p.resp.co2Ctrl(), c.p.resp.read()) },
      ],
    },
    { id: 'lime', title: 'Lime water', say: () => 'Meanwhile, air from germinating seeds bubbles through lime water — it turns milky. The tube from the boiled seeds stays clear.', ms: 6500, view: { ...bench, focus: 'co2' }, point: 'co2', beats: [{ at: 500, run: (c) => (c.p.resp.wait(1), c.p.resp.wait(1), c.p.resp.co2Look()) }] },
    { id: 'days', title: 'Three days', say: () => 'I read both thermometers every day. A warms by nearly two degrees a day; B stays at room temperature.', ms: 7000, view: { ...bench, focus: 'flasks' }, panel: 'closeup', beats: [...day(), { at: 1800, run: (c) => (c.p.resp.wait(22), c.p.resp.read()) }, { at: 3400, run: (c) => (c.p.resp.wait(24), c.p.resp.read()) }] },
    { id: 'table', title: 'The calculation', say: () => 'Rise in A, divided by three days, gives the mean rise per day. Rise in A minus rise in B is due to respiration.', ms: 7000, view: { ...bench, focus: 'bench' }, point: 'book', panel: 'notebook', beats: [{ at: 900, run: (c) => c.p.update((s) => ({ ...s, resp: respIdealRecords(c.v, s) }), 'table') }] },
    turn('Now it is your turn. Disinfect both batches, plug loosely, invert — and read the thermometers every day.'),
  ];
}

function tropScript(): Step[] {
  const day = (c: GrowthDemoCtx) => {
    c.p.trop.wait();
    c.p.trop.water();
    c.p.trop.measure('TEST');
    c.p.trop.measure('CTRL');
  };
  return [
    { id: 'intro', title: 'What we are doing', say: () => 'Watch me with my own seedlings. Shoots respond to light, roots to gravity. A clinostat gives each control the stimulus equally on every side.', ms: 5600, view: { ...bench, focus: 'bench' }, point: 'lightbox', beats: [] },
    ...setUp('TROPISM'),
    {
      id: 'photo',
      title: 'One-sided light',
      say: () => 'One pot in the light-proof box, its slit facing the lamp; I tape over every gap. The control pot goes on the clinostat.',
      ms: 7500,
      view: { ...bench, focus: 'lightbox' },
      point: 'lightbox',
      beats: [
        { at: 500, run: (c) => (c.p.trop.box(), c.p.trop.slit('LAMP')) },
        { at: 2200, run: (c) => (c.p.trop.tape(), c.p.trop.lamp(true)) },
        { at: 4200, run: (c) => c.p.trop.ctrl('KLINO') },
      ],
    },
    {
      id: 'geo',
      title: 'Radicles every way',
      say: () => 'Soaked bean seedlings pinned round a cork in a moist jar, radicles pointing every way; a similar set on the clinostat, which I switch on.',
      ms: 7500,
      view: { ...bench, focus: 'cork' },
      point: 'corkjar',
      beats: [
        { at: 500, run: (c) => (c.p.trop.pin(), c.p.trop.moisten()) },
        { at: 2600, run: (c) => (c.p.trop.klinoSet(), c.p.trop.klino(true)) },
      ],
    },
    { id: 'days', title: 'Three days', say: () => 'Every day: water, then the protractor on a test shoot and a control shoot. The test shoots bend more each day; the controls grow straight.', ms: 7500, view: { ...bench, focus: 'lightbox' }, panel: 'closeup', beats: [{ at: 400, run: day }, { at: 1600, run: day }, { at: 2800, run: day }] },
    { id: 'count', title: 'Radicles down', say: () => 'On the still cork every healthy radicle has turned down, whichever way it pointed. On the turning clinostat they grew straight on.', ms: 6500, view: { ...bench, focus: 'cork' }, point: 'corkjar', beats: [{ at: 600, run: (c) => c.p.trop.count() }] },
    { id: 'table', title: 'The notebook', say: () => 'Angle divided by days gives the mean rate of curvature; the percentage of radicles growing down; and auxin explains it: it gathers on the shaded side, which grows faster.', ms: 7500, view: { ...bench, focus: 'bench' }, point: 'book', panel: 'notebook', beats: [{ at: 900, run: (c) => c.p.update((s) => ({ ...s, trop: tropIdealRecords(c.v, s) }), 'table') }] },
    turn('Now it is your turn. A light-proof box, the clinostat switched on, and keep everything moist.'),
  ];
}

/** The demo: its own material and in-memory state, played by the kit's demo engine. */
export function useGrowthDemo({ studentSeed, task, startedAt, active, onFinished }: { studentSeed: number; task: GrowthTask; startedAt: string; active: boolean; onFinished: () => void }) {
  const variant = useMemo(() => demoVariant(studentSeed, task), [studentSeed, task]);
  const fresh = () => ({ ...emptyBioGrowthState(), task });
  const [state, setState] = useState<BioGrowthState>(fresh);
  const p = useGrowth({ seed: variant.seed, state, onChange: setState, readOnly: false, startedAt, variant });
  const steps = useMemo(() => (task === 'SEEDLING' ? seedScript() : task === 'RESP' ? respScript() : task === 'TROPISM' ? tropScript() : germScript()), [task]);
  const ctx = (): GrowthDemoCtx => ({ p, v: variant, s: () => p.ref.current });
  const player = useDemoPlayer<GrowthDemoCtx>({
    steps,
    ctx,
    reset: () => {
      useGrowthBench.setState(BENCH_IDLE);
      p.ref.current = fresh();
      setState(p.ref.current);
    },
    goggles: (c) => c.s().log.some((e) => e.a === 'safety:goggles'),
    active,
    onFinished,
  });
  const flat = 'border-0 p-0 shadow-none sm:p-0';
  const panel = (id: string) =>
    id === 'notebook' ? (
      <section className="pointer-events-none absolute right-2 top-40 z-10 hidden max-h-[calc(100%-18rem)] w-[420px] overflow-hidden rounded-2xl bg-card p-3 text-card-foreground shadow-xl sm:block" aria-label="Demonstration notebook">
        {task === 'SEEDLING' ? <SeedNotebook v={variant} state={state} readOnly update={noop} book className={flat} /> : task === 'RESP' ? <RespNotebook state={state} readOnly update={noop} book className={flat} /> : task === 'TROPISM' ? <TropNotebook state={state} readOnly update={noop} book className={flat} /> : <GermNotebook state={state} readOnly update={noop} book className={flat} />}
      </section>
    ) : id === 'closeup' ? (
      <section className="pointer-events-none absolute right-2 top-40 z-10 hidden w-[440px] rounded-2xl bg-card p-2 text-card-foreground shadow-xl sm:block" aria-label="Demonstration close-up">
        {task === 'SEEDLING' ? <SeedlingSvg v={variant} w={state.seedling} label="Mrs Okon's seedlings" /> : task === 'RESP' ? <FlasksSvg v={variant} w={state.resp} label="Mrs Okon's flasks" /> : task === 'TROPISM' ? <TropSvg v={variant} w={state.trop} label="Mrs Okon's seedlings" /> : <GermTubesSvg v={variant} w={state.germ} label="Mrs Okon's tubes" />}
      </section>
    ) : null;
  return { player, state, p, panel, v: variant };
}
