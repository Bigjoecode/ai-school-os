import { emptyBioEcologyState, type BioEcologyState, type EcoTask } from '@aischool/shared';
import { Bug, Droplets, Flame, Footprints, Hand, Sun } from 'lucide-react';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import { HazardIcon, type Hazard, type SafetyContent } from '../../../lab3d-kit/safety';
import type { Spot } from '../../../lab3d-kit/store';
import { BIO_ROOM_EXPLAIN, bioTour } from '../../bio-common/lab3d/common';
import { ECO_VIEWS, ESPOT, crucibleSpot, funnelSpot, jarSpot, spotOf } from './bench';
import { neededFor } from './scene-state';

/** The field lab's texts: "What is this?" cards, the safety briefing, Learn, the tour and Ask suggestions. */

const E: Record<string, Explainer> = {
  ...BIO_ROOM_EXPLAIN,
  handwash: { name: 'Outside tap and soap', purpose: 'Washing your hands after soil, insects and pond water.', how: 'Soap, rub for 20 seconds, rinse and dry.', mistake: 'Eating your lunch with soil on your hands.', keys: ['wash'] },
  plot: { name: 'The study plot', purpose: 'A 20 m × 20 m square of grassland pegged out for sampling.', how: 'Tapes along two edges are the axes; quadrats go at random coordinates.', mistake: 'Putting quadrats where you can see the plants.', keys: ['quadrat', 'random', 'area'] },
  quad: { name: 'A quadrat in place', purpose: 'A 1 m² sample of the plot.', how: 'Count every plant rooted inside; frame plants on two sides only; count the grass squares.', mistake: 'Counting a plant twice, or every plant on the frame.', keys: ['edge', 'count'] },
  quadrat: { name: '1 m quadrat', purpose: 'Marks out exactly 1 m² of ground; its string grid makes 100 squares of 1 %.', how: 'Lay it flat at the random coordinates.', mistake: 'Throwing it towards people.', keys: ['quadrat', 'throw'] },
  tapes: { name: 'Measuring tapes', purpose: 'The two axes of the plot.', how: 'Along two edges from the same corner peg.', mistake: 'Pacing the distance by eye.', keys: ['tape'] },
  pegs: { name: 'Pegs and string', purpose: 'Mark the corners of the plot.', how: 'Hammer them in at the four corners.', mistake: 'Leaving them behind after the practical.', keys: ['peg'] },
  randtable: { name: 'Random-number table', purpose: 'Gives unbiased coordinates.', how: 'Read two-digit numbers in order; use 00–19, skip the rest.', mistake: 'Skipping numbers you do not like.', keys: ['random'] },
  guide: { name: 'Identification guide', purpose: 'Pictures and keys to the local weeds and grasses.', how: 'Check each plant before you count it.', mistake: 'Confusing similar-looking species.', keys: ['identif'] },
  net: { name: 'Sweep net', purpose: 'Catches insects in long grass.', how: 'Even, sweeping strokes for a fixed time.', mistake: 'Sweeping longer the second time.', keys: ['sweep', 'net'] },
  box: { name: 'Collecting box', purpose: 'Holds the catch safely.', how: 'Keep it shaded; work quickly.', mistake: 'Leaving it in the sun.', keys: ['container'] },
  tray: { name: 'White tray', purpose: 'The catch shows up against white, for counting.', how: 'Tip them in gently; tick each one as you count.', mistake: 'Counting one twice.', keys: ['count'] },
  paint: { name: 'Non-toxic paint and fine brush', purpose: 'A small mark that does not harm the animal.', how: 'A tiny dot under the thorax, where predators will not see it.', mistake: 'A big blob on the back.', keys: ['non-toxic', 'paint', 'predator'] },
  redpaint: { name: 'Red gloss paint', purpose: 'Not suitable for marking animals.', how: 'Leave it: it is bright and may be toxic.', mistake: 'Painting the backs red.', keys: ['visible', 'predator'] },
  scissors: { name: 'Scissors', purpose: 'Not for marking animals.', how: 'Never clip wings or legs.', mistake: 'Harming the animal.', keys: ['harm'] },
  watch: { name: 'Stopwatch', purpose: 'Times the sweeps, the wait and the drainage.', how: 'Start it as you begin.', mistake: 'Starting late.', keys: ['time'] },
  thermo: { name: 'Thermometer with shade card', purpose: 'Air temperature 1 m above the ground.', how: 'Shade the bulb from direct sun and wait a minute.', mistake: 'Reading it in direct sunlight: it reads too high.', keys: ['shade', 'sunlight', 'thermometer'] },
  soilthermo: { name: 'Soil thermometer', purpose: 'Soil temperature at 10 cm.', how: 'Push it in to the mark and wait.', mistake: 'Reading it at the surface.', keys: ['soil temperature'] },
  hygro: { name: 'Wet-and-dry bulb hygrometer', purpose: 'Relative humidity, from the depression of the wet bulb and the table.', how: 'Wet wick; read both; RH from the table.', mistake: 'A dry wick, or the sun on the bulbs.', keys: ['humid', 'hygrometer'] },
  lightmeter: { name: 'Light meter', purpose: 'Light intensity in lux.', how: 'At ground level, sensor up, your shadow off it.', mistake: 'Shading the sensor with your body.', keys: ['light'] },
  anemo: { name: 'Anemometer', purpose: 'Wind speed (m/s).', how: 'Hold it up into the wind.', mistake: 'Mixing it up with the wind vane (direction).', keys: ['anemometer', 'wind'] },
  phkit: { name: 'Soil pH kit', purpose: 'Soil acidity.', how: 'Soil + distilled water + indicator; match the colour.', mistake: 'Tap water, which changes the pH.', keys: ['ph', 'indicator'] },
  secchi: { name: 'Secchi disc', purpose: 'How clear (turbid) the pond water is.', how: 'Lower it until it disappears; the depth on the rope.', mistake: 'Leaning over the edge.', keys: ['secchi', 'water'] },
  screen: { name: 'Stevenson screen', purpose: 'Shades the Six’s and wet-and-dry thermometers, with air passing through the louvres.', how: 'Read at 9 am; reset the Six’s with the magnet.', mistake: 'Reading the top of the index instead of the bottom.', keys: ['six', 'maximum', 'minimum'] },
  raingauge: { name: 'Rain gauge', purpose: 'Rainfall (mm) in the last 24 h.', how: 'Pour into the measuring cylinder; read; empty.', mistake: 'Forgetting to empty it.', keys: ['rain'] },
  vane: { name: 'Wind vane and anemometer', purpose: 'Wind direction (the arrow points into the wind) and speed.', how: 'Note the direction the wind comes from.', mistake: 'Recording where the wind goes.', keys: ['vane', 'direction'] },
  tree: { name: 'Shade tree', purpose: 'The canopy site.', how: 'Read under it at the same time as the open site.', mistake: 'Reading hours apart.', keys: ['canopy', 'shade'] },
  site: { name: 'A site stake', purpose: 'Marks where readings are taken.', how: 'The same spot each day.', mistake: 'Moving the site.', keys: ['site'] },
  pond: { name: 'The pond', purpose: 'Aquatic habitat; Secchi disc readings.', how: 'Keep back from the edge; work in pairs.', mistake: 'Standing on the soft bank.', keys: ['water', 'deep'] },
  pit: { name: 'Soil pit', purpose: 'Shows the soil profile.', how: 'Look at the layers; take samples with a trowel.', mistake: 'Climbing in.', keys: ['soil'] },
  bag: { name: 'Soil sample', purpose: 'Dry sand, loam or clay (and a damp sample).', how: 'Use oven-dried soil for drainage, air and humus.', mistake: 'Using damp soil for the humus test.', keys: ['dry', 'soil'] },
  jars: { name: 'Screw-top jar', purpose: 'Sedimentation: particles settle by size.', how: 'A third soil, fill with water, shake, leave a day.', mistake: 'Measuring before the clay has settled.', keys: ['jar'] },
  jar: { name: 'Sedimentation jar', purpose: 'Coarse particles settle first, clay last; humus floats.', how: 'Measure each layer with the ruler.', mistake: 'Measuring at once.', keys: ['settle'] },
  funnels: { name: 'Funnels over cylinders', purpose: 'Compare drainage and water retention.', how: '100 g of soil, cotton-wool plug, 100 cm³ of water, read over 30 min.', mistake: 'Different masses of soil.', keys: ['funnel', 'cotton'] },
  funnel: { name: 'A funnel of soil', purpose: 'Water drains through it into the cylinder.', how: 'Read the cylinder at each time.', mistake: 'Confusing water collected with water retained.', keys: ['retain'] },
  cylinders: { name: 'Measuring cylinders', purpose: 'The air-content test: 50 cm³ water + 50 cm³ soil.', how: 'Stir until no more bubbles; read the volume.', mistake: 'Not stirring.', keys: ['air'] },
  aircyl: { name: 'Air-content cylinder', purpose: 'Water fills the soil’s air spaces; the volume falls.', how: 'Air = 100 − final volume.', mistake: '% of the cylinder instead of the soil.', keys: ['air'] },
  rod: { name: 'Glass rod', purpose: 'Stirs the soil to free trapped air.', how: 'Stir gently until the bubbles stop.', mistake: 'Stopping too early.', keys: ['stir'] },
  burner: { name: 'Burner, tripod and pipe-clay triangle', purpose: 'Heats the crucibles strongly.', how: 'Goggles on; heat 20 min at a time.', mistake: 'Touching the hot tripod.', keys: ['heat', 'bunsen'] },
  crucible: { name: 'Crucible', purpose: 'Holds soil for heating.', how: 'Heat, cool in the desiccator, weigh — to constant mass.', mistake: 'Weighing it hot.', keys: ['crucible', 'constant'] },
  tongs: { name: 'Crucible tongs', purpose: 'Hold hot crucibles.', how: 'Always use them for hot crucibles.', mistake: 'Using your fingers.', keys: ['tongs'] },
  desiccator: { name: 'Desiccator', purpose: 'Cools crucibles in dry air.', how: 'Cool before every weighing.', mistake: 'Leaving the lid off.', keys: ['cool'] },
  balance: { name: 'Electronic balance', purpose: 'Weighs to 0.01 g.', how: 'Zero it; weigh cool crucibles.', mistake: 'Weighing a hot crucible.', keys: ['balance', 'weigh'] },
  ruler: { name: 'Ruler (mm)', purpose: 'Measures the jar’s layers.', how: 'Hold it against the jar at eye level.', mistake: 'Measuring from the end of the ruler.', keys: ['ruler'] },
  card: { name: 'Task card', purpose: 'The question.', how: 'Read it first.', mistake: 'Missing a part.', keys: [] },
  book: { name: 'Field notebook', purpose: 'Your tables, chart and answers — what is marked.', how: 'Write each reading as you take it.', mistake: 'Scrap paper.', keys: ['record', 'table'] },
};
export const ecoExplainer = makeExplainer(E, { 'quad:': 'quad', 'site:': 'site', 'bag:': 'bag', 'jar:': 'jar', 'funnel:': 'funnel', 'aircyl:': 'aircyl', 'crucible:': 'crucible' });

// ------------------------------------------------------------------ Learn

/** What the field shows for Learn (display only, never saved). */
export function learnState(task: EcoTask): BioEcologyState {
  const s = emptyBioEcologyState();
  s.task = task;
  s.log = [{ t: 0, a: 'safety:coat' }, { t: 0, a: 'safety:goggles' }, ...neededFor(task).map((a) => ({ t: 0, a: `collect:${a.id}` }))];
  if (task === 'QUADRAT') s.quad.pegged = true;
  if (task === 'SOIL') {
    s.soil.jars = [{ soil: 'LOAM', shakenAt: null }];
    s.soil.funnels = [
      { soil: 'SAND', mass: 100, cotton: true },
      { soil: 'LOAM', mass: 100, cotton: true },
      { soil: 'CLAY', mass: 100, cotton: true },
    ];
    s.soil.dRows = s.soil.funnels.map(() => ['', '', '', '', '', '']);
    s.soil.retained = ['', '', ''];
  }
  return s;
}

const V = (id: string): Spot => ECO_VIEWS[id]!;
export function learnConfig(task: EcoTask): LearnConfig {
  const items: LearnConfig['items'] =
    task === 'QUADRAT'
      ? [
          { match: /quadrat/i, id: 'quadrat', spot: spotOf(ESPOT.quadrat, 0.02, 0.6, 0.8) },
          { match: /tape/i, id: 'tapes', spot: spotOf(ESPOT.tapes, 0.02, 0.5, 0.6) },
          { match: /peg/i, id: 'pegs', spot: spotOf(ESPOT.pegs, 0.02, 0.5, 0.6) },
          { match: /random/i, id: 'randtable', spot: spotOf(ESPOT.table, 0.01, 0.45, 0.8) },
          { match: /guide|identif/i, id: 'guide', spot: spotOf(ESPOT.guide, 0.01, 0.45, 0.8) },
        ]
      : task === 'CAPTURE'
        ? [
            { match: /net|box/i, id: 'net', spot: spotOf([ESPOT.net[0], -0.4, ESPOT.net[2]], 0, 1.4, 0.3) },
            { match: /paint|fluid/i, id: 'paint', spot: spotOf(ESPOT.paint, 0.02, 0.45, 0.6) },
            { match: /container/i, id: 'tray', spot: spotOf(ESPOT.tray, 0.02, 0.55, 0.8) },
            { match: /stopwatch/i, id: 'watch', spot: spotOf(ESPOT.watch, 0.02, 0.45, 0.7) },
          ]
        : task === 'FACTORS'
          ? [
              { match: /six/i, id: 'screen', spot: V('station') },
              { match: /soil thermometer/i, id: 'soilthermo', spot: spotOf(ESPOT.soilthermo, 0.02, 0.5, 0.6) },
              { match: /rain gauge/i, id: 'raingauge', spot: V('station') },
              { match: /hygrometer/i, id: 'hygro', spot: spotOf(ESPOT.hygro, 0.08, 0.5, 0.4) },
              { match: /light meter/i, id: 'lightmeter', spot: spotOf(ESPOT.lightmeter, 0.02, 0.45, 0.6) },
              { match: /wind vane|anemometer/i, id: 'vane', spot: V('station') },
              { match: /ph/i, id: 'phkit', spot: spotOf(ESPOT.phkit, 0.02, 0.45, 0.6) },
              { match: /secchi/i, id: 'secchi', spot: spotOf(ESPOT.secchi, 0.02, 0.45, 0.6) },
            ]
          : [
              { match: /funnel/i, id: 'funnels', spot: V('rack') },
              { match: /measuring cylinder/i, id: 'cylinders', spot: spotOf(ESPOT.aircyl, 0.1, 0.6, 0.35) },
              { match: /crucible|bunsen|tripod/i, id: 'burner', spot: V('heat') },
              { match: /balance/i, id: 'balance', spot: spotOf(ESPOT.balance, 0.05, 0.5, 0.4) },
              { match: /oven/i, id: 'bag:LOAM', spot: spotOf(ESPOT.bags, 0.06, 0.6, 0.4) },
              { match: /stopwatch/i, id: 'watch', spot: V('rack') },
              { match: /glass rod/i, id: 'rod', spot: spotOf(ESPOT.aircyl, 0.06, 0.6, 0.4) },
            ];
  const first: Spot = task === 'FACTORS' ? V('open') : task === 'SOIL' ? spotOf(jarSpot(0), 0.08, 0.6, 0.3) : V('plot');
  const second: Spot = task === 'FACTORS' ? V('shade') : task === 'SOIL' ? spotOf(crucibleSpot(1), 0.1, 0.7, 0.35) : task === 'CAPTURE' ? spotOf(ESPOT.tray, 0.02, 0.6, 0.85) : V('plot');
  return {
    items,
    explain: ecoExplainer,
    procedure: [
      { spot: first, point: task === 'FACTORS' ? 'site:OPEN' : task === 'SOIL' ? 'jars' : 'plot' },
      { spot: second, point: task === 'FACTORS' ? 'site:SHADE' : task === 'SOIL' ? 'burner' : task === 'CAPTURE' ? 'tray' : 'plot' },
    ],
    observe: { spot: task === 'SOIL' ? spotOf(funnelSpot(1), 0.15, 0.7, 0.3) : task === 'FACTORS' ? V('shade') : V('plot'), point: task === 'SOIL' ? 'funnels' : task === 'FACTORS' ? 'tree' : 'plot' },
    observeTitle: task === 'QUADRAT' ? 'Clumps and gaps' : task === 'CAPTURE' ? 'Marked and unmarked' : task === 'FACTORS' ? 'Sun and shade' : 'Fast and slow drainage',
    dataCard: task === 'FACTORS' || task === 'SOIL' ? undefined : { kicker: 'Worked example', title: task === 'QUADRAT' ? 'Density, frequency, population' : 'The Lincoln index', speech: task === 'QUADRAT' ? 'Density is the total divided by the area sampled; frequency is the quadrats with the plant out of all the quadrats.' : 'N equals n one times n two divided by m.' },
  };
}

// ------------------------------------------------------------------ safety

export function ecoSafety(task: EcoTask): SafetyContent {
  const sym = (right: Hazard, why: Record<Hazard, string>) => (['flame', 'corrosive', 'toxic', 'harmful'] as Hazard[]).map((k) => ({ label: <HazardIcon kind={k} />, aria: k, right: k === right, why: why[k] }));
  return {
    cards: [
      { icon: <Bug className="size-6" />, title: 'Stings and bites', lessonMatch: /snake|scorpion|ant|animal|handle/i, lines: ['Wear covered shoes and long trousers in long grass; look before you kneel.', 'Snakes, scorpions, biting ants and wasps: move away and tell the teacher. Report any sting or bite at once.'] },
      { icon: <Sun className="size-6" />, title: 'Sun and water', lines: ['Wear a hat; drink water often; rest in the shade if you feel dizzy.', 'Do not look at the sun, even through the instruments.'] },
      { icon: <Droplets className="size-6" />, title: 'Pond edges', lessonMatch: /water|deep|edge/i, lines: ['Keep well back from the pond edge — the bank is soft. Work in pairs.', 'Never wade in to fetch anything.'] },
      { icon: <Hand className="size-6" />, title: 'Soil and hands', lessonMatch: /wash|hand|mercury|thermometer/i, lines: ['Soil, pond water and animals carry germs: wash your hands with soap afterwards.', 'A broken thermometer: tell the teacher; do not touch it.'] },
      task === 'SOIL'
        ? { icon: <Flame className="size-6" />, title: 'Heating soil', lessonMatch: /tongs|heat|ventil/i, lines: ['Goggles on; heat in the open air.', 'Hot crucibles, tripods and triangles look cold: use tongs, and let them cool in the desiccator.'] }
        : { icon: <Footprints className="size-6" />, title: 'Moving about', lessonMatch: /throw|quadrat/i, lines: ['Never throw a quadrat or swing a net towards anyone.', 'Walk round the plot edge, not through other groups’ quadrats.'] },
    ],
    questions: [
      {
        q: 'You see a snake in the long grass near your quadrat. What do you do?',
        options: [
          { label: 'Catch it to show the class', aria: 'catch', right: false, why: 'Never touch a snake: many are venomous.' },
          { label: 'Move away slowly and tell the teacher', aria: 'away', right: true, why: 'Right: give it space and let the teacher deal with it.' },
          { label: 'Throw the quadrat at it', aria: 'throw', right: false, why: 'That can make it strike — and never throw a quadrat.' },
        ],
      },
      task === 'SOIL'
        ? {
            q: 'The burner and crucible have been heating strongly. Tap the symbol that warns of FLAMMABLE gas in the burner.',
            grid: true,
            options: sym('flame', { flame: 'Right: the flame symbol. Keep the gas tube away from the hot tripod.', corrosive: 'That is corrosive. Flammable is the flame.', toxic: 'That is toxic. Flammable is the flame.', harmful: 'That is harmful or irritant. Flammable is the flame.' }),
          }
        : {
            q: 'You need a reading at the pond. Where do you stand?',
            options: [
              { label: 'On the soft bank, leaning out', aria: 'lean', right: false, why: 'The bank can give way.' },
              { label: 'Well back on firm ground, with a partner', aria: 'back', right: true, why: 'Right: firm ground, and never alone.' },
              { label: 'Wading in to the knees', aria: 'wade', right: false, why: 'Never wade in: the bottom shelves suddenly.' },
            ],
          },
      {
        q: 'You have finished handling soil and grasshoppers. Before lunch you…',
        options: [
          { label: 'Wipe your hands on the grass', aria: 'grass', right: false, why: 'Germs and soil stay on your skin.' },
          { label: 'Wash them with soap at the outside tap', aria: 'wash', right: true, why: 'Right: soap and water remove soil and germs.' },
          { label: 'Nothing — it is only soil', aria: 'nothing', right: false, why: 'Soil can carry tetanus and worm eggs.' },
        ],
      },
    ],
  };
}

export const ecoTour = (task: EcoTask) =>
  bioTour({
    focusId: task === 'FACTORS' ? 'open' : task === 'SOIL' ? 'rack' : 'plot',
    focusLabel: task === 'FACTORS' ? 'Open field' : task === 'SOIL' ? 'Funnels' : 'The plot',
    readLabel: 'Close-up',
    readText: task === 'QUADRAT' ? 'the plot map and each quadrat' : task === 'CAPTURE' ? 'the tray of grasshoppers' : task === 'FACTORS' ? 'the instruments' : 'the jars, cylinders and balance',
    task: task === 'QUADRAT' ? 'The task card lists the plot, the quadrats and what to count.' : task === 'CAPTURE' ? 'The task card lists the two samples and the Lincoln index.' : task === 'FACTORS' ? 'The task card lists the instruments, the sites and the days.' : 'The task card lists the four soil experiments.',
  }).map((s) => (s.id === 'welcome' ? { ...s, title: 'Welcome to the school field', body: () => 'Today’s biology practical is outdoors, on the school field behind the biology block. A one-minute tour shows you how to move and work. You can skip it and replay it from Help.' } : s));

export const ECO_ASK: Record<EcoTask, AskSuggestions> = {
  QUADRAT: {
    LEARN: ['Why use random numbers?', 'What is the difference between density and frequency?', 'How do I count plants on the frame?', 'How do I estimate % cover?'],
    DEMO: ['Why skip numbers above 19?', 'Why do counts vary so much?', 'Why ten quadrats?', 'How is the population estimated?'],
    TRY: ['How do I work out frequency?', 'What unit is density in?', 'What precautions can I write?', 'Which herb is most frequent?'],
    SANDBOX: ['What happens with only three quadrats?', 'Why are the plants clumped?', 'What if I choose places by eye?', 'How close is my estimate?'],
  },
  CAPTURE: {
    LEARN: ['What is the Lincoln index?', 'Why mark them underneath?', 'Why wait a day?', 'Why not use this for plants?'],
    DEMO: ['Why release them where they were caught?', 'Why sweep for the same time?', 'Why are only some marked?', 'What are the assumptions?'],
    TRY: ['How do I work out N?', 'What is m?', 'What sources of error are there?', 'What precautions can I write?'],
    SANDBOX: ['What if I recapture after an hour?', 'What does a bright mark do?', 'What if I wait a week?', 'Why does the estimate vary?'],
  },
  FACTORS: {
    LEARN: ['How does a wet-and-dry hygrometer work?', 'What does the Six’s thermometer show?', 'Why shade the thermometer?', 'Vane or anemometer?'],
    DEMO: ['Why read both sites at the same time?', 'How do I use the humidity table?', 'Why is the canopy more humid?', 'Why reset the Six’s?'],
    TRY: ['How do I work out the daily range?', 'How do I find RH?', 'How do the factors affect organisms?', 'What precautions can I write?'],
    SANDBOX: ['What does cloud do to the readings?', 'Why is soil under trees acidic?', 'What does the Secchi disc tell us?', 'Why repeat on three days?'],
  },
  SOIL: {
    LEARN: ['Why does sand drain fastest?', 'What is humus?', 'Why use oven-dried soil?', 'Why stir the air test?'],
    DEMO: ['Why do layers form in the jar?', 'What is constant mass?', 'Why cool before weighing?', 'Why is water retained not collected?'],
    TRY: ['How do I work out % air?', 'How do I work out % humus?', 'What should my conclusion say?', 'What precautions can I write?'],
    SANDBOX: ['What if I use damp soil?', 'What if I forget the cotton wool?', 'Why does clay hold water?', 'Which soil is best for crops?'],
  },
};
