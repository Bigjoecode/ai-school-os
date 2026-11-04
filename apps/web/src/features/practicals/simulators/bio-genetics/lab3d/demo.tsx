import { FOOD_SPOTS, crossIdealRecords, discAttempt, discIdealRecords, emptyBioGeneticsState, foodIdealRecords, heightIdealRecords, type BioGeneticsState, type BioGeneticsVariant, type GenTask } from '@aischool/shared';
import { useMemo, useState } from 'react';
import { useDemoPlayer, type DemoBeat, type DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import { useGenetics, type Genetics } from '../actions';
import { GenNotebook } from '../notebook';
import { BENCH_IDLE, demoVariant, useGenBench } from './bench';
import { neededFor } from './scene-state';

/**
 * Mrs Okon's demonstration with her own class (demoVariant: never the
 * student's), on its own in-memory state, through the same actions as the
 * student's lab. HEIGHT: shoes off, set square, the first few classmates
 * (one declines), then the whole class. DISCRETE: anonymous records, tongue
 * rolling with second attempts, the health cards. CROSS: 50/50 beakers, blind
 * draws returned, 100 pairs. FOOD: gloves, every field spot, the records.
 */

export interface GenDemoCtx {
  g: Genetics;
  v: BioGeneticsVariant;
  s: () => BioGeneticsState;
}
type Beat = DemoBeat<GenDemoCtx>;
type Step = KitDemoStep<GenDemoCtx>;
const noop = () => undefined;
const bench = { mode: 'bench' as const, spot: null };
const read = { mode: 'read' as const, spot: null };
const spread = (from: number, n: number, gap: number, run: (c: GenDemoCtx, k: number) => void): Beat[] => Array.from({ length: n }, (_, k) => ({ at: from + k * gap, run: (c: GenDemoCtx) => run(c, k) }));

const setUp = (task: GenTask): Step[] => [
  { id: 'safety', title: 'Safety first', say: () => (task === 'HEIGHT' ? 'Lab coat on. We measure respectfully: anyone may decline, and nobody comments on anyone’s size.' : task === 'DISCRETE' ? 'Lab coat on. No blood is taken in class: the blood groups come from the health records, and we record by number.' : task === 'CROSS' ? 'Lab coat on. Beads stay in the beakers — beads on the floor are a slipping hazard.' : 'Lab coat on; covered shoes and gloves for the field.'), ms: 4800, view: { ...bench, focus: 'bench' }, beats: [{ at: 700, run: (c) => c.g.note('safety:coat') }] },
  { id: 'apparatus', title: 'The apparatus', say: () => `From the cupboard: ${neededFor(task).map((a) => a.label.toLowerCase()).join(', ')}.`, ms: 5000, view: { ...bench, focus: 'bench' }, beats: neededFor(task).map((a, k): Beat => ({ at: 300 + k * 220, run: (c) => c.g.note(`collect:${a.id}`) })) },
];

function heightScript(): Step[] {
  const measure = (c: GenDemoCtx) => {
    c.g.height.measure('H');
    c.g.height.measure('S');
    useGenBench.setState({ measureAt: performance.now(), spanAt: performance.now() });
  };
  return [
    { id: 'intro', title: 'What we are doing', say: () => 'Watch me with my class. We measure everyone’s height and hand span, group the heights into classes and draw a histogram.', ms: 5200, view: { ...bench, focus: 'board' }, point: 'board', beats: [] },
    ...setUp('HEIGHT'),
    { id: 'ready', title: 'Shoes off, set square', say: () => 'Shoes off, heels and back against the board, a set square flat on the head — and I read it at eye level, to the nearest centimetre.', ms: 6000, view: { ...bench, focus: 'head' }, point: 'board', beats: [{ at: 600, run: (c) => (c.g.height.shoes(true), c.g.height.square(true), c.g.height.spread(true)) }, { at: 2600, run: measure }] },
    { id: 'span', title: 'Hand span', say: () => 'The hand span: thumb tip to little-finger tip, fingers spread, to the nearest half centimetre.', ms: 4600, view: { ...bench, focus: 'hand' }, point: 'ruler', beats: [{ at: 300, run: () => useGenBench.setState({ spanAt: performance.now() }) }] },
    { id: 'class', title: 'Everyone in turn', say: () => 'Then each classmate in turn. If someone would rather not be measured, I thank them and move on.', ms: 9000, view: { ...bench, focus: 'board' }, point: 'classmate', beats: spread(600, 6, 1300, (c) => (c.g.height.next(), measure(c))) },
    { id: 'rest', title: 'The whole class', say: () => 'And so on for the whole class.', ms: 4200, view: { ...bench, focus: 'board' }, beats: [{ at: 400, run: (c) => { for (let i = c.g.ref.current.height.at + 1; i < c.v.height.n; i++) { c.g.height.call(i); measure(c); } } }] },
    { id: 'table', title: 'Frequency table and histogram', say: () => 'Classes of equal width — 150 to 154, 155 to 159 — the frequency of each, and a histogram with the bars touching. Then the mean, the modal class and the range.', ms: 8000, view: { ...bench, focus: 'bench' }, point: 'book', panel: 'notebook', beats: [{ at: 900, run: (c) => c.g.update((s) => ({ ...s, height: heightIdealRecords(c.v, s) }), 'table') }] },
    { id: 'turn', title: 'Your turn!', say: () => 'Now your turn with your own class. Shoes off, the set square, eye level — and respect anyone who declines.', ms: 4600, view: { ...bench, focus: 'bench' }, beats: [] },
  ];
}

function discScript(): Step[] {
  const one = (c: GenDemoCtx) => {
    const st = c.g.ref.current.disc;
    for (let k = 0; k < 3; k++) {
      const r = c.g.disc.roll();
      if (r !== false) break;
    }
    c.g.disc.card();
    useGenBench.setState({ rollAt: performance.now(), cardAt: performance.now() });
    void st;
  };
  return [
    { id: 'intro', title: 'What we are doing', say: () => 'Watch me with my class: two characters that fall into separate groups — tongue rolling and blood group.', ms: 4800, view: { ...bench, focus: 'partner' }, point: 'classmate', beats: [] },
    ...setUp('DISCRETE'),
    { id: 'anon', title: 'Anonymous records', say: () => 'I record by number only: a blood group is private.', ms: 4000, view: { ...bench, focus: 'bench' }, point: 'sheet', beats: [{ at: 600, run: (c) => c.g.disc.recordBy('NUMBER') }] },
    {
      id: 'roll',
      title: 'Tongue rolling',
      say: () => 'Can you roll your tongue into a U? Not the first time? Try again — some people need two or three attempts.',
      ms: 7500,
      view: { ...bench, focus: 'partner' },
      point: 'classmate',
      beats: [
        {
          at: 600,
          run: (c) => {
            // Start with a classmate who needs a second attempt, if there is one.
            const k = c.v.disc.people.findIndex((p) => p.roller && p.needs > 1);
            c.g.disc.call(Math.max(0, k));
            c.g.disc.roll();
            useGenBench.setState({ rollAt: performance.now() });
          },
        },
        { at: 3200, run: (c) => (c.g.disc.roll(), useGenBench.setState({ rollAt: performance.now() })) },
        { at: 4400, run: (c) => (discAttempt(c.v.disc, c.g.ref.current.disc.at, 2) ? undefined : c.g.disc.roll(), useGenBench.setState({ rollAt: performance.now() })) },
      ],
    },
    { id: 'card', title: 'The health card', say: () => 'The blood group comes from the school health card, shared with consent. No blood is taken in class.', ms: 5000, view: { ...bench, focus: 'cards' }, point: 'cards', beats: [{ at: 800, run: (c) => (c.g.disc.card(), useGenBench.setState({ cardAt: performance.now() })) }] },
    { id: 'class', title: 'The whole class', say: () => 'Then every classmate in turn.', ms: 6000, view: { ...bench, focus: 'partner' }, beats: [{ at: 400, run: (c) => { for (let i = 0; i < c.v.disc.n; i++) { c.g.disc.call(i); one(c); } } }] },
    { id: 'table', title: 'Tallies and charts', say: () => 'Tally, percentages, and angles — the number over the total, times three hundred and sixty. A pie chart for tongue rolling; a bar chart with gaps for the blood groups.', ms: 8500, view: { ...bench, focus: 'bench' }, point: 'book', panel: 'notebook', beats: [{ at: 900, run: (c) => c.g.update((s) => ({ ...s, disc: discIdealRecords(c.v, s) }), 'table') }] },
    { id: 'turn', title: 'Your turn!', say: () => 'Now your turn: by number, three attempts each, and the health cards.', ms: 4200, view: { ...bench, focus: 'bench' }, beats: [] },
  ];
}

function crossScript(): Step[] {
  const d = (k: number) => (c: GenDemoCtx) => (c.g.cross.draw(k), useGenBench.setState({ drawAt: performance.now() }));
  return [
    { id: 'intro', title: 'What we are doing', say: () => 'Watch me model a cross between two tall parents, both Tt.', ms: 4400, view: { ...bench, focus: 'beakers' }, point: 'beakerA', beats: [] },
    ...setUp('CROSS'),
    { id: 'fill', title: 'Two Tt parents', say: () => 'Fifty red beads — T — and fifty white — t — in each beaker. Each beaker is one parent’s gametes.', ms: 6000, view: { ...bench, focus: 'beakers' }, point: 'beakerA', beats: [{ at: 900, run: (c) => (c.g.cross.fill('EQUAL'), c.g.cross.blind(true), c.g.cross.back(true)) }] },
    { id: 'draw', title: 'One from each', say: () => 'Without looking, one bead from each beaker: that pair is one offspring. I record it, put the beads back and shake.', ms: 7500, view: { ...bench, focus: 'beakers' }, point: 'tray', beats: spread(700, 4, 1500, d(1)) },
    { id: 'many', title: 'A hundred times', say: () => 'And again, a hundred times, ten to a batch on the tally sheet.', ms: 7000, view: read, beats: spread(400, 10, 600, (c) => d(Math.min(10, 100 - c.g.ref.current.cross.draws.length))(c)) },
    { id: 'table', title: 'The ratio', say: () => 'Dominant is TT plus Tt; recessive is tt. Mine is not exactly three to one — chance — but the class total is usually closer.', ms: 8500, view: { ...bench, focus: 'bench' }, point: 'book', panel: 'notebook', beats: [{ at: 900, run: (c) => c.g.update((s) => ({ ...s, cross: crossIdealRecords(c.v, s) }), 'table') }] },
    { id: 'turn', title: 'Your turn!', say: () => 'Now your turn: without looking, and return the beads every time.', ms: 4200, view: { ...bench, focus: 'bench' }, beats: [] },
  ];
}

function foodScript(): Step[] {
  return [
    { id: 'intro', title: 'What we are doing', say: () => 'Watch me: who eats whom on our school field, and how much energy passes up the chain.', ms: 4600, view: { ...bench, focus: 'field' }, point: 'notes', beats: [] },
    ...setUp('FOOD'),
    { id: 'gloves', title: 'Gloves and shoes', say: () => 'Covered shoes and gloves before collecting.', ms: 3600, view: { ...bench, focus: 'bench' }, point: 'gloves', beats: [{ at: 600, run: (c) => c.g.food.gloves() }] },
    { id: 'spots', title: 'Every spot', say: () => 'At each spot I count the organisms and watch what they eat: grasshoppers on the grass, a lizard catching a grasshopper, a hawk over the field.', ms: 10000, view: { ...bench, focus: 'field' }, point: 'notes', beats: spread(600, FOOD_SPOTS.length, 1200, (c, k) => (c.g.food.survey(FOOD_SPOTS[k]!), useGenBench.setState({ surveyAt: performance.now() }))) },
    { id: 'table', title: 'Chains, web and pyramids', say: () => 'Chains start with the grass, arrows from the eaten to the eater. Then the web, the trophic levels, and both pyramids to a stated scale.', ms: 9000, view: { ...bench, focus: 'bench' }, point: 'book', panel: 'notebook', beats: [{ at: 900, run: (c) => c.g.update((s) => ({ ...s, food: foodIdealRecords(c.v, s) }), 'table') }] },
    { id: 'turn', title: 'Your turn!', say: () => 'Now your turn: every spot, and only the feeding you actually saw.', ms: 4200, view: { ...bench, focus: 'bench' }, beats: [] },
  ];
}

/** The demo: its own class and in-memory state, played by the kit's demo engine. */
export function useGenDemo({ studentSeed, task, startedAt, active, onFinished }: { studentSeed: number; task: GenTask; startedAt: string; active: boolean; onFinished: () => void }) {
  const variant = useMemo(() => demoVariant(studentSeed, task), [studentSeed, task]);
  const fresh = () => ({ ...emptyBioGeneticsState(), task });
  const [state, setState] = useState<BioGeneticsState>(fresh);
  const g = useGenetics({ seed: variant.seed, state, onChange: setState, readOnly: false, startedAt, variant });
  const steps = useMemo(() => (task === 'DISCRETE' ? discScript() : task === 'CROSS' ? crossScript() : task === 'FOOD' ? foodScript() : heightScript()), [task]);
  const ctx = (): GenDemoCtx => ({ g, v: variant, s: () => g.ref.current });
  const player = useDemoPlayer<GenDemoCtx>({
    steps,
    ctx,
    reset: () => {
      useGenBench.setState(BENCH_IDLE);
      g.ref.current = fresh();
      setState(g.ref.current);
    },
    goggles: () => false,
    active,
    onFinished,
  });
  const panel = (id: string) =>
    id === 'notebook' ? (
      <section className="pointer-events-none absolute right-2 top-40 z-10 hidden max-h-[calc(100%-18rem)] w-[420px] overflow-hidden rounded-2xl bg-card p-3 text-card-foreground shadow-xl sm:block" aria-label="Demonstration notebook">
        <GenNotebook state={state} v={variant} readOnly update={noop} book className="border-0 p-0 shadow-none sm:p-0" />
      </section>
    ) : null;
  return { player, state, g, panel, v: variant };
}
