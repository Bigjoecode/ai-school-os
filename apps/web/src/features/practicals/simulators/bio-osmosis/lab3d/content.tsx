import { emptyBioOsmosisState, emptyAgarRow, emptyPotatoRow, type BioOsmosisState, type OsmoTask } from '@aischool/shared';
import { Glasses, Hand, Scissors, Shirt } from 'lucide-react';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import { HazardIcon, type Hazard, type SafetyContent } from '../../../lab3d-kit/safety';
import { BIO_ROOM_EXPLAIN, bioTour } from '../../bio-common/lab3d/common';
import { OSPOT, beakerSpot, spotOf } from './bench';
import { neededFor } from './scene-state';

/** The osmosis lab's texts: "What is this?" cards, safety briefing, Learn, tour and Ask suggestions. */

const E: Record<string, Explainer> = {
  ...BIO_ROOM_EXPLAIN,
  goggles: { name: 'Safety goggles', purpose: 'Protect your eyes from the acid and the alkali in the agar, and from splashes.', how: 'Wear them whenever you pour or handle acid.', mistake: 'Pushing them up onto your forehead.', keys: ['eye', 'goggles'] },
  tuber: { name: 'Irish potato tuber', purpose: 'Storage tissue: living cells with a cell sap of fixed concentration.', how: 'Bore all the cylinders from the same tuber so the sap is the same in each.', mistake: 'Using cylinders from different potatoes.', keys: ['tuber', 'potato'] },
  borer: { name: 'Cork borer', purpose: 'Cuts cylinders of exactly the same diameter.', how: 'Push it into the potato on a tile, away from your hand; twist and pull out.', mistake: 'Holding the potato in your palm while you push.', keys: ['borer'] },
  scalpel: { name: 'Scalpel', purpose: 'Trims cylinders to length, and cuts agar cubes.', how: 'Cut downwards on the tile, away from your fingers.', mistake: 'Cutting towards your hand, or on your palm.', keys: ['scalpel', 'cut', 'tile'] },
  tile: { name: 'White tile', purpose: 'A safe cutting surface — and a white background for judging colours.', how: 'Cut on it, never on the bench or your hand.', mistake: 'Cutting on your palm.', keys: ['tile'] },
  ruler: { name: 'Ruler (mm)', purpose: 'Measures lengths to the nearest millimetre.', how: 'Line the object up with the zero mark; read the end at eye level.', mistake: 'Measuring from the end of the ruler instead of the zero mark.', keys: ['ruler', 'nearest mm', 'parallax'] },
  balance: { name: 'Electronic balance', purpose: 'Weighs to 0.01 g.', how: 'Zero it, put the blotted cylinder on the pan, read the display.', mistake: 'Weighing a wet cylinder.', keys: ['balance', 'weigh'] },
  paper: { name: 'Filter paper', purpose: 'Blotting cylinders dry; drawing a liquid under a cover slip.', how: 'Blot each cylinder the same way; for the slide, hold it at the edge opposite the drop.', mistake: 'Blotting some cylinders harder than others.', keys: ['blot', 'filter paper'] },
  forceps: { name: 'Forceps', purpose: 'Handle cylinders, cubes and the epidermis without squeezing them or touching acid.', how: 'Grip gently.', mistake: 'Squeezing the cylinder, which pushes water out.', keys: ['forceps'] },
  beakers: { name: 'Labelled beakers', purpose: 'One solution each, the same volume in each, enough to cover the cylinder.', how: 'Label each with its concentration before you pour.', mistake: 'Unlabelled beakers: you lose track of the solutions.', keys: ['beaker', 'label', 'cover'] },
  beaker: { name: '400 cm³ beaker', purpose: 'Holds the acid with the agar cubes in it.', how: 'Pour enough acid to cover every cube.', mistake: 'Too little acid: the big cubes stick out.', keys: ['beaker', 'cover'] },
  clock: { name: 'Stopwatch', purpose: 'Times the soak, or the cubes in the acid.', how: 'Start it as the cylinders or cubes go in.', mistake: 'Starting it late.', keys: ['stopwatch', 'time'] },
  stopwatch: { name: 'Stopwatch', purpose: 'Times how long each cube takes to become colourless.', how: 'Start it as the cubes go into the acid; note the time each one clears.', mistake: 'Looking away: you miss the moment.', keys: ['stopwatch', 'time'] },
  cyl: { name: 'A potato cylinder', purpose: 'Its length and mass change as water moves in or out by osmosis.', how: 'Blot, measure and weigh before and after the soak.', mistake: 'Forgetting the minus sign for a decrease.', keys: ['cylinder', 'length', 'mass'] },
  sbeaker: { name: 'A solution beaker', purpose: 'Holds one sucrose concentration (or distilled water, the control).', how: 'The cylinder must be completely covered.', mistake: 'Cylinders sticking out of the liquid.', keys: ['solution', 'cover'] },
  onion: { name: 'Red onion', purpose: 'Its epidermis is one cell thick and its cell sap is coloured, so the vacuole shows.', how: 'Peel the thin coloured skin from the outer side of a fleshy scale leaf.', mistake: 'A thick piece: the cells overlap.', keys: ['onion', 'epidermis', 'thin'] },
  dropper: { name: 'Dropper bottle', purpose: 'Water for mounting; strong salt or sucrose for plasmolysis.', how: 'Mount in water; put the strong solution at one edge of the cover slip.', mistake: 'Lifting the cover slip to add the solution.', keys: ['salt', 'sucrose', 'drop'] },
  slide: { name: 'Your slide', purpose: 'The epidermis in a drop of liquid under a cover slip.', how: 'Lower the cover slip at an angle with the mounted needle.', mistake: 'Dropping it flat: air bubbles.', keys: ['slide', 'cover slip'] },
  slides: { name: 'Slides and cover slips', purpose: 'For mounting the epidermis.', how: 'Hold them by the edges; broken ones go in the sharps jar.', mistake: 'Picking up broken glass with your fingers.', keys: ['slide', 'glass'] },
  needle: { name: 'Mounted needle', purpose: 'Lowers the cover slip gently at an angle.', how: 'Rest one edge of the cover slip in the liquid; lower it with the needle.', mistake: 'Trapping air bubbles.', keys: ['needle'] },
  scope: { name: 'Microscope', purpose: 'Magnifies the cells ×100 (×10 objective) and ×400 (×40).', how: 'Low power first, then high power; count at ×40.', mistake: 'Counting at low power, where the cells are too small.', keys: ['microscope', 'low power', 'high power'] },
  block: { name: 'Pink agar', purpose: 'Agar with phenolphthalein and a little sodium hydroxide: pink while alkaline.', how: 'Cut cubes accurately on the tile.', mistake: 'Uneven cubes: the ratios are wrong.', keys: ['agar', 'cube', 'accurate'] },
  cube: { name: 'An agar cube', purpose: 'As the acid diffuses in, it neutralises the alkali: colourless from the outside in.', how: 'Measure its side, work out SA, V and SA : V.', mistake: 'Saying the larger cube has the larger ratio.', keys: ['cube', 'ratio'] },
  acid: { name: 'Dilute hydrochloric acid', purpose: 'Diffuses into the agar.', how: 'Enough to cover all the cubes; put them in together.', mistake: 'Handling the cubes with your fingers.', keys: ['acid', 'hydrochloric'] },
  acidbottle: { name: 'Dilute hydrochloric acid (0.1 mol/dm³)', purpose: 'Diffuses into the agar and removes the pink colour.', how: 'Pour enough into the beaker to cover the cubes. Goggles on.', mistake: 'Splashing it: wipe spills, rinse skin.', keys: ['acid', 'spill'] },
  card: { name: 'Task card', purpose: 'The question paper.', how: 'Read it first and again before you hand in.', mistake: 'Missing a part of the question.', keys: [] },
  book: { name: 'Practical notebook', purpose: 'Your table, graph or drawing and answers — this is what is marked.', how: 'Record every reading as you take it.', mistake: 'Writing readings on scrap paper.', keys: ['record', 'table'] },
  lens: { name: 'Hand lens', purpose: 'Magnifies specimens.', how: 'Not needed here.', mistake: 'Cluttering the bench.', keys: [] },
  thermometer: { name: 'Thermometer', purpose: 'Measures temperature.', how: 'Not needed here.', mistake: 'Cluttering the bench.', keys: [] },
};
export const osmoExplainer = makeExplainer(E, { 'cyl:': 'cyl', 'beaker:': 'sbeaker', 'dropper:': 'dropper', 'cube:': 'cube' });

// ------------------------------------------------------------------ Learn

/** The bench as Mrs Okon sets it out for Learn (display only, never saved). */
export function learnState(task: OsmoTask): BioOsmosisState {
  const s = emptyBioOsmosisState();
  s.task = task;
  s.log = [{ t: 0, a: 'safety:coat' }, { t: 0, a: 'safety:goggles' }, ...neededFor(task).map((a) => ({ t: 0, a: `collect:${a.id}` }))];
  if (task === 'POTATO') {
    s.potato.cyl = [0, 0.2, 0.4, 0.6, 0.8].map((conc) => ({ conc, trimmed: true, placedAt: null, removedAt: null, blotB: true, blotA: false }));
    s.potato.rows = s.potato.cyl.map(() => emptyPotatoRow());
  } else if (task === 'PLASMOLYSIS') {
    Object.assign(s.plas, { peeled: true, mount: 'WATER', coverslip: true, onStage: false });
  } else {
    s.agar.cubes = [1, 2, 3].map((size) => ({ size: size as 1 | 2 | 3, placedAt: null, cutAt: null }));
    s.agar.rows = s.agar.cubes.map(() => emptyAgarRow());
    s.agar.acid = 'FULL';
  }
  return s;
}

export function learnConfig(task: OsmoTask): LearnConfig {
  const common = [
    { match: /forceps/i, id: 'forceps', spot: spotOf(OSPOT.forceps, 0.01, 0.4, 0.7) },
    { match: /filter paper/i, id: 'paper', spot: spotOf(task === 'PLASMOLYSIS' ? [OSPOT.slideTile[0] + 0.17, 0, OSPOT.slideTile[2] + 0.06] : OSPOT.paper, 0.01, 0.4, 0.75) },
  ];
  const items: LearnConfig['items'] =
    task === 'POTATO'
      ? [
          { match: /cork borer/i, id: 'borer', spot: spotOf(OSPOT.borer, 0.01, 0.4, 0.6) },
          { match: /ruler|vernier/i, id: 'ruler', spot: spotOf(OSPOT.ruler, 0.01, 0.42, 0.85) },
          { match: /scalpel|tile/i, id: 'tile', spot: spotOf(OSPOT.tile, 0.02, 0.45, 0.6) },
          { match: /beaker|petri/i, id: 'beaker:0', spot: spotOf(beakerSpot(2), 0.05, 0.7, 0.35) },
          { match: /balance/i, id: 'balance', spot: spotOf(OSPOT.balance, 0.04, 0.45, 0.4) },
          { match: /stopwatch|clock/i, id: 'clock', spot: spotOf(OSPOT.clock, 0.01, 0.4, 0.8) },
          ...common,
        ]
      : task === 'PLASMOLYSIS'
        ? [
            { match: /microscope/i, id: 'scope', spot: spotOf(OSPOT.scope, 0.2, 0.75, 0.2, -0.4) },
            { match: /slide|cover/i, id: 'slide', spot: spotOf(OSPOT.slideTile, 0.01, 0.38, 0.8) },
            { match: /dropper/i, id: 'dropper:SALT', spot: spotOf(OSPOT.droppers, 0.05, 0.5, 0.4) },
            ...common,
          ]
        : [
            { match: /scalpel|tile/i, id: 'block', spot: spotOf(OSPOT.block, 0.02, 0.45, 0.6) },
            { match: /ruler/i, id: 'ruler', spot: spotOf(OSPOT.ruler, 0.01, 0.42, 0.85) },
            { match: /beaker/i, id: 'acid', spot: spotOf(OSPOT.acidBeaker, 0.06, 0.5, 0.3) },
            { match: /stopwatch/i, id: 'stopwatch', spot: spotOf(OSPOT.stopwatch, 0.01, 0.4, 0.8) },
            { match: /forceps/i, id: 'forceps', spot: spotOf(OSPOT.forceps, 0.01, 0.4, 0.7) },
          ];
  return {
    items,
    explain: osmoExplainer,
    procedure:
      task === 'POTATO'
        ? [
            { spot: spotOf(OSPOT.tile, 0.03, 0.55, 0.55), point: 'tuber' },
            { spot: spotOf(beakerSpot(2), 0.05, 0.75, 0.35), point: 'beaker:2' },
          ]
        : task === 'PLASMOLYSIS'
          ? [
              { spot: spotOf(OSPOT.slideTile, 0.02, 0.5, 0.6), point: 'onion' },
              { spot: spotOf(OSPOT.scope, 0.2, 0.75, 0.2, -0.4), point: 'scope' },
            ]
          : [
              { spot: spotOf(OSPOT.block, 0.02, 0.5, 0.6), point: 'block' },
              { spot: spotOf(OSPOT.acidBeaker, 0.06, 0.5, 0.3), point: 'acid' },
            ],
    observe: task === 'POTATO' ? { spot: spotOf(beakerSpot(2), 0.05, 0.6, 0.3), point: 'beaker:0' } : task === 'PLASMOLYSIS' ? { spot: spotOf(OSPOT.scope, 0.25, 0.6, 0.25, -0.4), point: 'scope' } : { spot: spotOf(OSPOT.acidBeaker, 0.05, 0.45, 0.3), point: 'acid' },
    observeTitle: task === 'POTATO' ? 'Turgid and flaccid' : task === 'PLASMOLYSIS' ? 'Plasmolysis' : 'From the outside in',
  };
}

// ------------------------------------------------------------------ safety

export function osmoSafety(task: OsmoTask): SafetyContent {
  const sym = (right: Hazard, why: Record<Hazard, string>) =>
    (['flame', 'corrosive', 'toxic', 'harmful'] as Hazard[]).map((k) => ({ label: <HazardIcon kind={k} />, aria: k, right: k === right, why: why[k] }));
  const acidQ = sym('corrosive', {
    corrosive: 'Right: corrosive. Acids and alkalis can burn skin and eyes — goggles on, and rinse any splash with plenty of water.',
    flame: 'That is the flame: flammable. Corrosive is the hand and the bench being eaten away.',
    toxic: 'That is the skull: toxic. Corrosive is the hand and the bench being eaten away.',
    harmful: 'That is the exclamation mark: harmful or irritant. Corrosive is the hand and the bench being eaten away.',
  });
  return {
    cards: [
      { icon: <Shirt className="size-6" />, title: 'Protect yourself', lessonMatch: /coat|eye|goggle/i, lines: ['Wear your lab coat, buttoned.', task === 'AGAR' ? 'Goggles on: the acid, and the alkali in the agar, harm the eyes.' : 'Keep the stained epidermis and solutions off your clothes.'] },
      {
        icon: <Scissors className="size-6" />,
        title: task === 'PLASMOLYSIS' ? 'Glass slides and blades' : 'Scalpel and cork borer',
        lessonMatch: /borer|tile|cut|blade|slide|hand/i,
        lines:
          task === 'PLASMOLYSIS'
            ? ['Hold slides and cover slips by the edges; cover slips break very easily.', 'Broken glass goes in the sharps jar — never pick it up with your fingers.']
            : ['Push the cork borer into the potato on the tile, away from your hand.', 'Cut with the scalpel downwards on the tile, away from your fingers — never on your palm.'],
      },
      task === 'AGAR'
        ? { icon: <Glasses className="size-6" />, title: 'Acid', lessonMatch: /acid|spill|rinse/i, lines: ['Pour the acid slowly; handle the cubes with forceps.', 'Wipe up spills and rinse splashes with plenty of water.'] }
        : { icon: <Hand className="size-6" />, title: 'Solutions and specimens', lessonMatch: /wash|solution/i, lines: ['Never taste the solutions or the potato.', 'Wipe up spills: sugar and salt solutions make the floor slippery.'] },
      { icon: <Hand className="size-6" />, title: 'Behave safely', lines: ['No eating or drinking in the laboratory.', 'Wash your hands before you leave.'] },
    ],
    questions: [
      task === 'AGAR'
        ? { q: 'The dilute acid carries this warning. Tap the symbol that means CORROSIVE.', grid: true, options: acidQ }
        : {
            q: task === 'PLASMOLYSIS' ? 'A cover slip breaks on your slide. What do you do?' : 'How do you cut a cylinder with the cork borer?',
            options:
              task === 'PLASMOLYSIS'
                ? [
                    { label: 'Brush the pieces off with my hand', aria: 'hand', right: false, why: 'Glass splinters cut: never use your fingers.' },
                    { label: 'Tell the teacher and put the pieces in the sharps jar (with forceps or a brush and pan)', aria: 'sharps', right: true, why: 'Right: broken glass goes in the sharps jar, never the bin.' },
                    { label: 'Leave it on the bench', aria: 'leave', right: false, why: 'Someone else can cut themselves.' },
                  ]
                : [
                    { label: 'Hold the potato in my palm and push the borer towards my hand', aria: 'palm', right: false, why: 'The borer can slip straight into your hand.' },
                    { label: 'Put the potato on the tile and push the borer down, away from my hand', aria: 'tile', right: true, why: 'Right: the tile takes the force, and your hand is out of the way.' },
                  ],
          },
      {
        q: task === 'PLASMOLYSIS' ? 'How do you change the liquid under the cover slip?' : task === 'AGAR' ? 'How do you put the cubes into the acid?' : 'Where do you trim the cylinders?',
        options:
          task === 'PLASMOLYSIS'
            ? [
                { label: 'Lift the cover slip off and pour it on', aria: 'lift', right: false, why: 'You disturb the specimen and trap air.' },
                { label: 'A drop at one edge; filter paper at the opposite edge draws it under', aria: 'irrigate', right: true, why: 'Right: the cover slip stays in place.' },
              ]
            : task === 'AGAR'
              ? [
                  { label: 'With my fingers, one at a time', aria: 'fingers', right: false, why: 'The acid touches your skin, and they go in at different times.' },
                  { label: 'With forceps, all at the same moment', aria: 'forceps', right: true, why: 'Right: no acid on your skin, and the times can be compared.' },
                ]
              : [
                  { label: 'On the white tile, cutting away from my fingers', aria: 'tile', right: true, why: 'Right.' },
                  { label: 'On my palm, it is quicker', aria: 'palm', right: false, why: 'Never: the scalpel goes straight through.' },
                ],
      },
    ],
  };
}

export const osmoTour = (task: OsmoTask) =>
  bioTour({
    focusId: task === 'PLASMOLYSIS' ? 'scope' : task === 'AGAR' ? 'acid' : 'balance',
    focusLabel: task === 'PLASMOLYSIS' ? 'Microscope' : task === 'AGAR' ? 'Beaker of acid' : 'Balance',
    task: task === 'PLASMOLYSIS' ? 'The task card lists the three stages: water, the strong solution, and water again.' : task === 'AGAR' ? 'The task card lists the cubes to cut and what to time.' : 'The task card lists the solutions and what to measure.',
  });

export const OSMO_ASK: Record<OsmoTask, AskSuggestions> = {
  POTATO: {
    LEARN: ['What is osmosis?', 'Why blot the cylinders before weighing?', 'What is water potential?', 'Why use cylinders from one tuber?'],
    DEMO: ['Why did the water cylinder get heavier?', 'Why is % change used, not the change?', 'What does the 0 % crossing show?', 'Why do soft cylinders bend?'],
    TRY: ['How do I work out % change?', 'Where do I read the isotonic point?', 'What precautions can I write?', 'What does turgid mean?'],
    SANDBOX: ['Why does sweet potato have a higher isotonic point?', 'What if I soak for only 15 minutes?', 'What if I do not blot?', 'Why does the length change less than the mass?'],
  },
  PLASMOLYSIS: {
    LEARN: ['What is plasmolysis?', 'Why use red onion?', 'Why does the cell not burst in water?', 'What fills the space under the wall?'],
    DEMO: ['Why draw the solution with filter paper?', 'Why wait 10 minutes?', 'Why do some cells not change?', 'What is deplasmolysis?'],
    TRY: ['How do I count the cells?', 'What labels go on the drawing?', 'Does the cell wall shrink?', 'What precautions can I write?'],
    SANDBOX: ['What if the cell sap is stronger?', 'Why does strong salt kill some cells?', 'What is incipient plasmolysis?', 'Why do animal cells burst in water?'],
  },
  AGAR: {
    LEARN: ['What is surface area to volume ratio?', 'Why does the pink colour disappear?', 'Is this osmosis or diffusion?', 'Why cut a spare cube?'],
    DEMO: ['Why is the smallest cube first?', 'Why does a 2 cm cube take four times as long?', 'How is the rate worked out?', 'Why must the cubes be covered?'],
    TRY: ['How do I work out SA : V?', 'How do I work out the % colourless?', 'What should my conclusion say?', 'What precautions can I write?'],
    SANDBOX: ['What does stronger acid do?', 'Why do large animals need lungs?', 'How long would a 4 cm cube take?', 'Why does depth grow as √time?'],
  },
};
