import {
  PLAS_LABELS,
  PLAS_STAGES,
  agarClearTime,
  agarDepth,
  agarSeenClear,
  agarSide,
  emptyBioOsmosisState,
  lineXIntercept,
  phyFit,
  plasCaptureOf,
  plasCount,
  plasInferenceKey,
  plasParts,
  potatoFirmness,
  potatoReading,
  potatoTruth,
  roundDp,
  type BioOsmosisState,
  type BioOsmosisVariant,
  type OsmoTask,
} from '@aischool/shared';
import { useMemo, useState } from 'react';
import { useDemoPlayer, type DemoBeat, type DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import { useOsmosis, type Osmosis } from '../actions';
import { AgarNotebook, PlasNotebook, PotatoNotebook } from '../notebook';
import { demoVariant, useOsmoBench } from './bench';
import { neededFor } from './scene-state';

/**
 * Mrs Okon's demonstration on her own material (demoVariant: never the
 * student's), on its own in-memory state, through the same actions as the
 * student's lab. POTATO: bore, trim, blot, measure and weigh, soak an hour
 * (time-lapse), again, the table, the graph and the isotonic point.
 * PLASMOLYSIS: mount in water, the strong solution drawn under, the cells
 * plasmolysing minute by minute, the count, water again. AGAR: the cubes,
 * the acid, the colour going from the outside in, the spare cut open.
 */

export interface OsmoDemoCtx {
  o: Osmosis;
  v: BioOsmosisVariant;
  s: () => BioOsmosisState;
}
type Beat = DemoBeat<OsmoDemoCtx>;
type Step = KitDemoStep<OsmoDemoCtx>;
const noop = () => undefined;
const bench = { mode: 'bench' as const, spot: null };

const setUp = (task: OsmoTask): Step[] => [
  {
    id: 'safety',
    title: 'Safety first',
    say: () => (task === 'AGAR' ? 'Lab coat and goggles on: the acid, and the alkali in the agar, harm the eyes.' : task === 'PLASMOLYSIS' ? 'Lab coat on. Slides and cover slips break easily: broken glass goes in the sharps jar.' : 'Lab coat on. I cut on the tile and push the borer away from my hand.'),
    ms: 4200,
    view: { ...bench, focus: 'bench' },
    beats: [
      { at: 700, run: (c) => c.o.note('safety:coat') },
      { at: 1500, run: (c) => c.o.note('safety:goggles') },
    ],
  },
  {
    id: 'apparatus',
    title: 'The apparatus',
    say: () => `From the cupboard: ${neededFor(task).map((a) => a.label.toLowerCase()).join(', ')}.`,
    ms: 5200,
    view: { ...bench, focus: 'bench' },
    beats: neededFor(task).map((a, k): Beat => ({ at: 300 + k * 250, run: (c) => c.o.note(`collect:${a.id}`) })),
  },
];

// ------------------------------------------------------------------ potato

const DEMO_CONCS = [0, 0.2, 0.4, 0.6, 0.8];
function writePotato(c: OsmoDemoCtx) {
  c.o.update((s) => {
    const w = s.potato;
    const rows = w.cyl.map((cy, i) => {
      const b = potatoReading(c.v.potato, i, cy, w.clock, 'B', true);
      const a = potatoReading(c.v.potato, i, cy, w.clock, 'A', true);
      return { l0: String(b.length), l1: String(a.length), m0: b.mass.toFixed(2), m1: a.mass.toFixed(2), pl: (((a.length - b.length) / b.length) * 100).toFixed(1), pm: (((a.mass - b.mass) / b.mass) * 100).toFixed(1), firm: potatoFirmness(potatoTruth(c.v.potato, i, cy, w.clock).pm) };
    });
    return { ...s, potato: { ...w, rows } };
  }, 'table');
}
function graphPotato(c: OsmoDemoCtx) {
  c.o.update((s) => {
    const w = s.potato;
    const pts = w.cyl.map((cy, i) => ({ x: cy.conc, y: Number(w.rows[i]!.pm) }));
    const fit = phyFit(pts)!;
    const line = { x1: 0, y1: roundDp(fit.intercept, 2), x2: 0.8, y2: roundDp(fit.intercept + fit.slope * 0.8, 2) };
    return { ...s, potato: { ...w, line, iso: String(roundDp(lineXIntercept(line) ?? 0, 2)) } };
  }, 'line');
}
function potatoScript(): Step[] {
  const both = (c: OsmoDemoCtx, i: number) => {
    c.o.potato.blot(i);
    c.o.potato.measure(i);
    c.o.potato.weigh(i);
  };
  return [
    { id: 'intro', title: 'What we are doing', say: () => 'Watch me with my own potato, not yours. Water moves into or out of potato cells by osmosis; I measure how much the cylinders change in sucrose solutions of different strengths.', ms: 5200, view: { ...bench, focus: 'bench' }, point: 'tuber', beats: [] },
    ...setUp('POTATO'),
    {
      id: 'bore',
      title: 'Bore and trim the cylinders',
      say: () => 'Five cylinders from the same tuber with the same borer: one for distilled water, the control, and one for each sucrose solution. I trim each to 50 millimetres on the tile.',
      ms: 6200,
      view: { ...bench, focus: 'tile' },
      point: 'tuber',
      beats: [...DEMO_CONCS.map((cc, k): Beat => ({ at: 500 + k * 600, run: (c) => c.o.potato.bore(cc) })), { at: 4000, run: (c) => c.o.potato.trimAll() }],
    },
    {
      id: 'read0',
      title: 'Blot, measure, weigh',
      say: () => 'I blot each one dry on filter paper — the same way every time — then read its length to the nearest millimetre and weigh it to 0.01 g.',
      ms: 6500,
      view: { mode: 'read', spot: null },
      beats: [
        { at: 400, run: (c) => (both(c, 0), useOsmoBench.setState({ sel: 0, lying: 'ruler' })) },
        { at: 2600, run: () => useOsmoBench.setState({ lying: 'balance' }) },
        { at: 4600, run: (c) => [1, 2, 3, 4].forEach((i) => both(c, i)) },
      ],
    },
    {
      id: 'soak',
      title: 'An hour in the solutions',
      say: () => 'All five go in at the same time, fully covered. I leave them an hour — here in time-lapse.',
      ms: 6000,
      view: { ...bench, focus: 'beakers' },
      point: 'beaker:0',
      beats: [{ at: 500, run: (c) => (c.o.potato.placeAll(), useOsmoBench.setState({ lying: 'tile' })) }, ...[0, 1, 2, 3].map((k): Beat => ({ at: 1800 + k * 900, run: (c) => c.o.potato.wait(15) }))],
    },
    {
      id: 'read1',
      title: 'Out, blot, measure, weigh',
      say: () => 'Out together with forceps, blotted gently, measured and weighed again. The one from water is firm and longer: turgid. The one from the strongest solution is soft and bends: flaccid.',
      ms: 7500,
      view: { mode: 'read', spot: null },
      beats: [
        { at: 400, run: (c) => (c.o.potato.removeAll(), both(c, 0), c.o.note('feel#1'), useOsmoBench.setState({ sel: 0, lying: 'ruler' })) },
        { at: 2800, run: (c) => (both(c, 4), c.o.note('feel#5'), useOsmoBench.setState({ sel: 4, lying: 'balance' })) },
        { at: 5000, run: (c) => [1, 2, 3].forEach((i) => both(c, i)) },
      ],
    },
    { id: 'table', title: 'The table', say: () => '% change = final minus initial, divided by initial, times 100 — with a minus sign for a loss.', ms: 6000, view: { ...bench, focus: 'bench' }, point: 'book', panel: 'notebook', beats: [{ at: 1000, run: writePotato }] },
    {
      id: 'graph',
      title: 'Graph and isotonic point',
      say: (c) => `I plot % change in mass against concentration and draw the best straight line. It crosses 0 % at about ${c.s().potato.iso || '…'} mol/dm³: there the solution is isotonic with the cell sap.`,
      ms: 7500,
      view: { ...bench, focus: 'bench' },
      point: 'book',
      panel: 'notebook',
      beats: [{ at: 800, run: graphPotato }],
    },
    { id: 'turn', title: 'Your turn!', say: () => `Now it is your turn, with your own potato. Blot before every weighing, and soak them at least 30 minutes.`, ms: 4500, view: { ...bench, focus: 'bench' }, beats: [] },
  ];
}

// ------------------------------------------------------------------ plasmolysis

function writePlas(c: OsmoDemoCtx) {
  c.o.update((s) => {
    const w = s.plas;
    const rows = PLAS_STAGES.map((st, k) => {
      const ci = plasCaptureOf(w, st);
      if (ci < 0) return w.rows[k]!;
      const at = w.captures[ci]!.at;
      return { observation: plasParts(c.v.plas, w, st, at).map((p) => p.text).join('; '), claims: [...plasInferenceKey(c.v.plas, w, st, at).need] };
    });
    const sc = plasCaptureOf(w, 'STRONG', 40);
    const n = sc >= 0 ? plasCount(c.v.plas, w, w.captures[sc]!.at) : null;
    return { ...s, plas: { ...w, rows, count: n ? { total: String(n.total), plasmolysed: String(n.plasmolysed), pct: String(roundDp((n.plasmolysed / n.total) * 100, 1)) } : w.count, labels: [...PLAS_LABELS], drawing: c.v.drawing.filter((d) => d.good).map((d) => d.id) } };
  }, 'table');
}
function plasScript(): Step[] {
  const minute = (at: number): Beat => ({ at, run: (c) => c.o.plasmolysis.wait(1) });
  return [
    { id: 'intro', title: 'What we are doing', say: () => 'Watch me with my own onion. In a strong solution water leaves the cells by osmosis and the cytoplasm pulls away from the wall: plasmolysis. In water it goes back.', ms: 5200, view: { ...bench, focus: 'bench' }, point: 'onion', beats: [] },
    ...setUp('PLASMOLYSIS'),
    {
      id: 'slide',
      title: 'Mount the epidermis in water',
      say: () => 'A thin strip of the red skin, one cell thick, flat in a drop of distilled water. I lower the cover slip at an angle so no air is trapped, and put the slide on the stage.',
      ms: 6500,
      view: { ...bench, focus: 'slide' },
      point: 'onion',
      beats: [
        { at: 500, run: (c) => c.o.plasmolysis.peel() },
        { at: 1800, run: (c) => c.o.plasmolysis.mount('WATER') },
        { at: 3200, run: (c) => c.o.plasmolysis.coverslip() },
        { at: 4800, run: (c) => c.o.plasmolysis.toStage() },
      ],
    },
    {
      id: 'water',
      title: 'In water: turgid',
      say: () => 'Low power first, then high power. The red sap fills each cell; the cytoplasm is pressed against the wall. The cells are turgid. I record both views.',
      ms: 6500,
      view: { mode: 'read', spot: null },
      beats: [
        { at: 400, run: (c) => (c.o.plasmolysis.wait(1), c.o.plasmolysis.capture()) },
        { at: 3000, run: (c) => (c.o.plasmolysis.objective(40), c.o.plasmolysis.wait(1), c.o.plasmolysis.capture()) },
      ],
    },
    {
      id: 'irrigate',
      title: 'Draw the strong solution under',
      say: () => 'A drop of 1 mol/dm³ sucrose at one edge of the cover slip, and filter paper at the other edge to draw it right under.',
      ms: 5200,
      view: { ...bench, focus: 'slide' },
      point: 'paper',
      beats: [
        { at: 800, run: (c) => c.o.plasmolysis.drop('SUCROSE') },
        { at: 2600, run: (c) => c.o.plasmolysis.drawThrough() },
      ],
    },
    {
      id: 'plasmolysis',
      title: 'Ten minutes, minute by minute',
      say: () => 'Watch the cells as the solution mixes in: the vacuoles shrink and darken, and the cytoplasm pulls away from the wall. The wall keeps its shape — the space fills with the outside solution.',
      ms: 9000,
      view: { mode: 'read', spot: null },
      beats: Array.from({ length: 10 }, (_, k) => minute(400 + k * 750)),
    },
    { id: 'count', title: 'Record and count', say: (c) => `I record the view and count: cells with their centre in the field, and those plasmolysed. Here ${c.s().plas.count.plasmolysed || 'most'} of ${c.s().plas.count.total || 'them'}.`, ms: 6000, view: { mode: 'read', spot: null }, beats: [{ at: 500, run: (c) => (c.o.plasmolysis.capture(), writePlas(c)) }] },
    {
      id: 'back',
      title: 'Water again: deplasmolysis',
      say: () => 'Now water, drawn under the same way. Over ten minutes water goes back in and the cells become turgid again.',
      ms: 9000,
      view: { mode: 'read', spot: null },
      beats: [{ at: 400, run: (c) => (c.o.plasmolysis.drop('WATER'), c.o.plasmolysis.drawThrough()) }, ...Array.from({ length: 12 }, (_, k) => minute(900 + k * 600)), { at: 8400, run: (c) => c.o.plasmolysis.capture() }],
    },
    { id: 'record', title: 'The notebook', say: () => 'Three observations and inferences, the count, and the labelled drawing of a plasmolysed cell — the wall, the membrane, the shrunken vacuole, the cytoplasm, the nucleus and the outside solution.', ms: 6500, view: { ...bench, focus: 'bench' }, point: 'book', panel: 'notebook', beats: [{ at: 800, run: writePlas }] },
    { id: 'turn', title: 'Your turn!', say: () => 'Now it is your turn. Water first, draw the strong solution under, wait five to ten minutes, then count at high power.', ms: 4500, view: { ...bench, focus: 'bench' }, beats: [] },
  ];
}

// ------------------------------------------------------------------ agar

function writeAgar(c: OsmoDemoCtx) {
  c.o.update((s) => {
    const w = s.agar;
    const rows = w.cubes.map((cu, i) => {
      const side = Math.round(agarSide(c.v.agar, i, cu)) / 10;
      const seen = cu.cutAt === null ? agarSeenClear(c.v.agar, i, w) : null;
      return { side: side.toFixed(1), sa: String(roundDp(6 * side * side, 2)), vol: String(roundDp(side ** 3, 3)), ratio: `${roundDp(6 / side, 2)} : 1`, time: seen === null ? '' : String(roundDp(seen - (cu.placedAt ?? 0), 2)) };
    });
    const k = w.cubes.findIndex((cu) => cu.cutAt !== null);
    const cu = w.cubes[k];
    let depth = w.depth;
    if (cu && cu.cutAt !== null) {
      const d = Math.round(agarDepth(c.v.agar, k, cu, cu.cutAt));
      const sMm = Math.round(agarSide(c.v.agar, k, cu));
      const t = cu.cutAt - (cu.placedAt ?? 0);
      depth = { cube: k, depth: String(d), time: String(t), rate: String(roundDp(d / t, 2)), pct: String(roundDp((1 - Math.max(0, (sMm - 2 * d) / sMm) ** 3) * 100, 1)) };
    }
    const timed = w.cubes.map((x, i) => ({ i, t: x.cutAt === null ? agarClearTime(c.v.agar, i, x, w) : Infinity }));
    return { ...s, agar: { ...w, rows, depth, first: timed.reduce((a, b) => (b.t < a.t ? b : a)).i, claims: ['RATIO_FASTER', 'SAME_DEPTH'] } };
  }, 'table');
}
function agarScript(v: BioOsmosisVariant): Step[] {
  const sizes = [1, 2, 3, 2] as const;
  const t3 = Math.ceil(agarClearTime(v.agar, 2, { size: 3, placedAt: 0, cutAt: null }, { acid: 'FULL' }));
  const t1 = Math.ceil(agarClearTime(v.agar, 0, { size: 1, placedAt: 0, cutAt: null }, { acid: 'FULL' }));
  const watch = (n: number, at0: number, gap: number, min: number) => Array.from({ length: n }, (_, k): Beat => ({ at: at0 + k * gap, run: (c) => c.o.agar.wait(min) }));
  return [
    { id: 'intro', title: 'What we are doing', say: () => 'Watch me with my own agar. The acid diffuses in from every face and the pink colour goes. Which cube is reached all the way through first?', ms: 5200, view: { ...bench, focus: 'bench' }, point: 'block', beats: [] },
    ...setUp('AGAR'),
    {
      id: 'cut',
      title: 'Cut and measure the cubes',
      say: () => 'Cubes of 1, 2 and 3 centimetres, and a spare 2 centimetre cube to cut open later. I measure each side with the ruler and work out the surface area, volume and ratio.',
      ms: 7000,
      view: { ...bench, focus: 'block' },
      point: 'block',
      beats: [...sizes.map((sz, k): Beat => ({ at: 400 + k * 500, run: (c) => c.o.agar.cut(sz) })), { at: 3000, run: (c) => (c.o.agar.measure(2), useOsmoBench.setState({ sel: 2, lying: 'ruler' })) }, { at: 4200, run: (c) => [0, 1, 3].forEach((i) => c.o.agar.measure(i)) }],
    },
    {
      id: 'acid',
      title: 'All in together',
      say: () => 'Enough acid to cover every cube, and all four go in at the same moment. Stopwatch on.',
      ms: 5000,
      view: { ...bench, focus: 'acid' },
      point: 'acid',
      beats: [
        { at: 600, run: (c) => (c.o.agar.pour('FULL'), useOsmoBench.setState({ lying: 'tile' })) },
        { at: 2200, run: (c) => c.o.agar.placeAll() },
      ],
    },
    {
      id: 'spare',
      title: 'The spare cube at 5 minutes',
      say: () => 'After 5 minutes I take out the spare cube and cut it in half: a colourless rim around a pink centre. I measure how deep the colourless zone is.',
      ms: 7000,
      view: { mode: 'read', spot: null },
      beats: [...watch(5, 300, 450, 1), { at: 2800, run: (c) => (c.o.agar.cutOpen(3), c.o.agar.measureDepth(3), useOsmoBench.setState({ sel: 3, lying: 'ruler' })) }],
    },
    { id: 'first', title: 'The 1 cm cube clears first', say: () => `The smallest cube is colourless first, after about ${t1} minutes.`, ms: 6000, view: { ...bench, focus: 'acid' }, point: 'acid', beats: watch(Math.max(1, t1 - 4), 300, 260, 1) },
    { id: 'rest', title: 'The bigger cubes, later', say: () => `The 2 cm cube takes about four times as long, and the 3 cm cube about nine times — about ${t3} minutes — because the acid must go twice or three times as far, and the depth grows only as the square root of the time.`, ms: 9000, view: { ...bench, focus: 'acid' }, point: 'acid', beats: watch(Math.ceil(t3 / 5) + 4, 300, 280, 5) },
    { id: 'record', title: 'The notebook', say: () => 'The table: side, area, volume, ratio and time. The rate is the depth divided by the time. The larger the ratio, the sooner the whole cube is reached.', ms: 6500, view: { ...bench, focus: 'bench' }, point: 'book', panel: 'notebook', beats: [{ at: 800, run: writeAgar }] },
    { id: 'turn', title: 'Your turn!', say: () => 'Now it is your turn. Goggles on, all the cubes in together, and watch closely for the moment each one clears.', ms: 4500, view: { ...bench, focus: 'bench' }, beats: [] },
  ];
}

/** The demo: its own material and in-memory state, played by the kit's demo engine. */
export function useOsmoDemo({ studentSeed, task, startedAt, active, onFinished }: { studentSeed: number; task: OsmoTask; startedAt: string; active: boolean; onFinished: () => void }) {
  const variant = useMemo(() => demoVariant(studentSeed, task), [studentSeed, task]);
  const fresh = () => ({ ...emptyBioOsmosisState(), task });
  const [state, setState] = useState<BioOsmosisState>(fresh);
  const o = useOsmosis({ seed: variant.seed, state, onChange: setState, readOnly: false, startedAt, variant });
  const steps = useMemo(() => (task === 'PLASMOLYSIS' ? plasScript() : task === 'AGAR' ? agarScript(variant) : potatoScript()), [variant, task]);
  const ctx = (): OsmoDemoCtx => ({ o, v: variant, s: () => o.ref.current });
  const player = useDemoPlayer<OsmoDemoCtx>({
    steps,
    ctx,
    reset: () => {
      useOsmoBench.setState({ sel: 0, lying: 'tile', tally: [] });
      o.ref.current = fresh();
      setState(o.ref.current);
    },
    goggles: (c) => c.s().log.some((e) => e.a === 'safety:goggles'),
    active,
    onFinished,
  });
  const panel = (id: string) =>
    id === 'notebook' ? (
      <section className="pointer-events-none absolute right-2 top-40 z-10 hidden max-h-[calc(100%-18rem)] w-[420px] overflow-hidden rounded-2xl bg-card p-3 text-card-foreground shadow-xl sm:block" aria-label="Demonstration notebook">
        {task === 'PLASMOLYSIS' ? <PlasNotebook v={variant} state={state} readOnly update={noop} book className="border-0 p-0 shadow-none sm:p-0" /> : task === 'AGAR' ? <AgarNotebook state={state} readOnly update={noop} book className="border-0 p-0 shadow-none sm:p-0" /> : <PotatoNotebook state={state} readOnly update={noop} book className="border-0 p-0 shadow-none sm:p-0" />}
      </section>
    ) : null;
  return { player, state, o, panel, v: variant };
}
