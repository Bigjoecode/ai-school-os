import { emptyBioGrowthState, type BioGrowthState, type GrowthTask } from '@aischool/shared';
import { Flame, Lightbulb, Shirt, Sprout } from 'lucide-react';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import { HazardIcon, type Hazard, type SafetyContent } from '../../../lab3d-kit/safety';
import { BIO_ROOM_EXPLAIN, bioTour } from '../../bio-common/lab3d/common';
import { GSPOT, spotOf } from './bench';
import { neededFor } from './scene-state';

/** The growth lab's texts: "What is this?" cards, safety briefing, Learn, tour and Ask suggestions. */

const E: Record<string, Explainer> = {
  ...BIO_ROOM_EXPLAIN,
  goggles: { name: 'Safety goggles', purpose: 'Protect your eyes from boiling water and disinfectant.', how: 'Wear them while you boil the seeds and rinse them.', mistake: 'Pushing them up onto your forehead.', keys: ['eye', 'goggles'] },
  seeds: { name: 'Seeds', purpose: 'Cowpea (and maize) seeds: the embryo inside grows when it has water, oxygen and warmth.', how: 'Choose seeds of the same kind, size and age; soak them when the task says so.', mistake: 'Using a mixed handful, some damaged.', keys: ['seed', 'same size', 'same type', 'soak'] },
  tube: { name: 'Germination tube', purpose: 'One condition in each: A control, B dry, C boiled water and oil, D cold.', how: 'Ten seeds each; label it; count the seeds with a radicle every day.', mistake: 'Counting swollen seeds as germinated.', keys: ['tube', 'label', 'cotton'] },
  rack: { name: 'Test-tube rack', purpose: 'Holds the tubes upright at room temperature.', how: 'Keep it away from the window so all tubes stay at the same temperature.', mistake: 'Leaving it in the sun.', keys: ['temperature', 'rack'] },
  fridge: { name: 'Bench refrigerator', purpose: 'Keeps tube D at about 5 °C: the test for warmth.', how: 'Tube D goes in; everything else as in tube A.', mistake: 'Forgetting that it is dark inside too.', keys: ['refrigerator', 'cold', 'low temperature'] },
  cotton: { name: 'Cotton wool', purpose: 'Holds the seeds; moist it supplies water; loose in a flask it lets air in.', how: 'Moisten it from the wash bottle, or leave it dry for tube B.', mistake: 'Plugging a flask airtight instead of loosely.', keys: ['cotton'] },
  boiled: { name: 'Boiled, cooled water', purpose: 'Boiling drives out the dissolved oxygen.', how: 'Cover it with oil at once.', mistake: 'Using tap water: it still holds oxygen.', keys: ['boiled', 'oxygen'] },
  oil: { name: 'Oil', purpose: 'A layer on the boiled water stops oxygen from the air dissolving back in.', how: 'Pour it gently down the side of the tube.', mistake: 'Saying the oil feeds the seeds.', keys: ['oil'] },
  labels: { name: 'Labels', purpose: 'Name each tube A, B, C, D.', how: 'Label before you leave the tubes.', mistake: 'Mixing up the tubes after a week.', keys: ['label'] },
  washbottle: { name: 'Wash bottle', purpose: 'Water for the cotton wool, the sawdust and the seedlings.', how: 'Moist, not waterlogged.', mistake: 'Forgetting to water for days.', keys: ['moist', 'water'] },
  box: { name: 'Box of sawdust', purpose: 'Shows what comes up through the soil: cotyledons above (cowpea) or not (maize).', how: 'Sow the seeds about 2 cm deep; keep it moist.', mistake: 'Letting it dry out.', keys: ['sawdust', 'soil', 'moist'] },
  jar: { name: 'Seed jar', purpose: 'Seeds held between blotting paper and the glass: you can see the radicle and plumule grow.', how: 'Keep the blotting paper moist; measure the shoots daily.', mistake: 'Measuring from a different point each day.', keys: ['seed jar', 'blotting paper', 'same reference point'] },
  ruler: { name: '30 cm ruler', purpose: 'Measures the shoot length (mm).', how: 'From the same point (the seed) each day; straighten curved shoots along it gently.', mistake: 'Measuring curved shoots straight across.', keys: ['measure', 'ruler', 'reference'] },
  lens: { name: 'Hand lens', purpose: 'Magnifies root hairs and the plumule.', how: 'Hold it close to your eye.', mistake: 'Not needed for the measurements.', keys: [] },
  flask: { name: 'Vacuum (thermos) flask', purpose: 'Keeps the heat in, so the small heat of respiration shows as a temperature rise.', how: 'Seeds in, thermometer among them, loose cotton-wool plug, inverted in a clamp.', mistake: 'Sealing it airtight: the seeds run out of oxygen.', keys: ['flask', 'thermos', 'invert'] },
  thermometers: { name: 'Thermometers', purpose: 'Measure the temperature in each flask.', how: 'Read to 0.5 °C at eye level, at the start and daily.', mistake: 'Not touching the seeds equally.', keys: ['thermometer', 'temperature'] },
  disinfectant: { name: 'Dilute disinfectant', purpose: 'Kills microorganisms on the seeds, which would also respire and give off heat.', how: 'Rinse both batches.', mistake: 'Rinsing only one batch.', keys: ['disinfect', 'microorganism'] },
  boiler: { name: 'Boiling beaker', purpose: 'Boils half the seeds for 10 minutes: they are killed (the control).', how: 'Cool them before they go in the flask.', mistake: 'Putting hot seeds in: B starts warm.', keys: ['boil', 'hot'] },
  co2: { name: 'CO₂ test', purpose: 'Air from germinating seeds bubbles into lime water (milky) or hydrogencarbonate indicator (red → yellow).', how: 'Set up a boiled-seed control beside it.', mistake: 'No control.', keys: ['lime water', 'carbon dioxide', 'indicator'] },
  limewater: { name: 'Lime water and indicator', purpose: 'Detect carbon dioxide.', how: 'Lime water turns milky; the indicator turns from red to yellow.', mistake: 'Shaking the indicator in the air (your breath has CO₂).', keys: ['lime water'] },
  lightbox: { name: 'Light-proof box', purpose: 'Lets light reach the seedlings from one side only, through the slit.', how: 'Slit towards the lamp; tape over any gaps.', mistake: 'Light leaking in through gaps.', keys: ['light-proof', 'slit', 'box'] },
  lamp: { name: 'Bench lamp', purpose: 'The one-sided light.', how: 'Beside the slit; keep it and its lead away from water.', mistake: 'Too close: it warms one side.', keys: ['lamp', 'light'] },
  klinostat: { name: 'Clinostat', purpose: 'Rotates slowly so every side gets the light (or gravity) equally: the control.', how: 'Control pot on the turntable, a set of seedlings on the spindle; switch it on.', mistake: 'Forgetting to switch it on.', keys: ['clinostat', 'control', 'rotat'] },
  corkjar: { name: 'Cork in a gas jar', purpose: 'Holds seedlings pinned with radicles pointing every way, kept moist.', how: 'Wet the cotton wool; pin gently.', mistake: 'Damaging the seedlings with the pins.', keys: ['cork', 'pin', 'moist'] },
  protractor: { name: 'Protractor', purpose: 'Measures the angle of curvature.', how: 'Base along the original (vertical) direction; read the angle of the shoot tip.', mistake: 'Measuring from the wrong line.', keys: ['protractor', 'angle'] },
  tape: { name: 'Black tape', purpose: 'Seals gaps so the box is light-proof.', how: 'Over every gap except the slit.', mistake: 'Covering the slit.', keys: ['tape', 'light-proof'] },
  pots: { name: 'Pots of seedlings', purpose: 'Young maize shoots: they respond to one-sided light.', how: 'One in the box (test), one on the clinostat (control).', mistake: 'No control pot.', keys: ['pot', 'seedling', 'control'] },
  card: { name: 'Task card', purpose: 'The question paper.', how: 'Read it first and again before you hand in.', mistake: 'Missing a part of the question.', keys: [] },
  book: { name: 'Practical notebook', purpose: 'Your tables, graph or drawing and answers — this is what is marked.', how: 'Record every reading as you take it.', mistake: 'Writing readings on scrap paper.', keys: ['record', 'table'] },
};
export const growthExplainer = makeExplainer(E, { 'tube:': 'tube', 'flask:': 'flask', ctrlpot: 'pots' });

// ------------------------------------------------------------------ Learn

/** The bench as Mrs Okon sets it out for Learn (display only, never saved). */
export function learnState(task: GrowthTask): BioGrowthState {
  const s = emptyBioGrowthState();
  s.task = task;
  s.log = [{ t: 0, a: 'safety:coat' }, { t: 0, a: 'safety:goggles' }, ...neededFor(task).map((a) => ({ t: 0, a: `collect:${a.id}` }))];
  if (task === 'GERM') {
    s.germ.batch = 'SORTED';
    s.germ.tubes = [
      { cotton: 'MOIST', water: null, oil: false, fridge: false, seeds: 10, label: true },
      { cotton: 'DRY', water: null, oil: false, fridge: false, seeds: 10, label: true },
      { cotton: null, water: 'BOILED', oil: true, fridge: false, seeds: 10, label: true },
      { cotton: 'MOIST', water: null, oil: false, fridge: true, seeds: 10, label: true },
    ];
    s.germ.day = 3;
  } else if (task === 'SEEDLING') Object.assign(s.seedling, { soaked: true, box: true, jar: true, day: 6, waters: [0, 1, 2, 3, 4, 5, 6] });
  else if (task === 'RESP') {
    Object.assign(s.resp, { soaked: true, boiled: true, disLive: true, disBoiled: true, startAt: 0, clock: 2, co2: { ind: 'LIME', ctrl: true, at: 0, look: null } });
    s.resp.A = { seeds: 'LIVE', fill: 'FULL', thermo: true, plug: 'COTTON', inverted: true };
    s.resp.B = { seeds: 'BOILED', fill: 'FULL', thermo: true, plug: 'COTTON', inverted: true };
  } else Object.assign(s.trop, { box: true, slit: 'LAMP', taped: true, lamp: true, ctrl: 'KLINO', pinned: true, moist: true, klinoSet: true, klinoOn: true, day: 3, waters: [0, 1, 2, 3] });
  return s;
}

export function learnConfig(task: GrowthTask): LearnConfig {
  const items: LearnConfig['items'] =
    task === 'GERM'
      ? [
          { match: /test tube|boiling tube/i, id: 'tube:0', spot: spotOf(GSPOT.rack, 0.08, 0.5, 0.25) },
          { match: /cotton/i, id: 'cotton', spot: spotOf(GSPOT.cotton, 0.03, 0.4, 0.5) },
          { match: /refrigerator/i, id: 'fridge', spot: spotOf(GSPOT.fridge, 0.15, 0.7, 0.2) },
          { match: /label/i, id: 'labels', spot: spotOf(GSPOT.labels, 0.01, 0.4, 0.7) },
          { match: /rack/i, id: 'rack', spot: spotOf(GSPOT.rack, 0.06, 0.6, 0.3) },
        ]
      : task === 'SEEDLING'
        ? [
            { match: /box|pot|sawdust/i, id: 'box', spot: spotOf(GSPOT.box, 0.06, 0.55, 0.5) },
            { match: /gas jar|seed jar|blotting/i, id: 'jar', spot: spotOf(GSPOT.jar, 0.14, 0.5, 0.2) },
            { match: /ruler/i, id: 'ruler', spot: spotOf(GSPOT.ruler, 0.01, 0.45, 0.7) },
            { match: /lens/i, id: 'lens', spot: spotOf(GSPOT.lens, 0.01, 0.4, 0.7) },
          ]
        : task === 'RESP'
          ? [
              { match: /vacuum|thermos/i, id: 'flask:A', spot: spotOf(GSPOT.flaskA, 0.2, 0.7, 0.2) },
              { match: /thermometer/i, id: 'flask:A', spot: spotOf(GSPOT.flaskA, 0.12, 0.5, 0.2) },
              { match: /cotton/i, id: 'flask:B', spot: spotOf(GSPOT.flaskB, 0.1, 0.5, 0.2) },
              { match: /conical|delivery/i, id: 'co2', spot: spotOf(GSPOT.conical, 0.08, 0.5, 0.35) },
              { match: /test tube/i, id: 'co2', spot: spotOf(GSPOT.limewater, 0.08, 0.45, 0.35) },
            ]
          : [
              { match: /light-proof|box|slit/i, id: 'lightbox', spot: spotOf(GSPOT.lightbox, 0.12, 0.7, 0.3) },
              { match: /clinostat/i, id: 'klinostat', spot: spotOf(GSPOT.klinostat, 0.1, 0.6, 0.3) },
              { match: /cork|gas jar|beaker|pins/i, id: 'corkjar', spot: spotOf(GSPOT.corkjar, 0.13, 0.5, 0.15) },
              { match: /protractor|ruler/i, id: 'protractor', spot: spotOf(GSPOT.protractor, 0.01, 0.4, 0.8) },
            ];
  return {
    items,
    explain: growthExplainer,
    procedure:
      task === 'GERM'
        ? [
            { spot: spotOf(GSPOT.rack, 0.08, 0.55, 0.25), point: 'tube:0' },
            { spot: spotOf(GSPOT.fridge, 0.15, 0.7, 0.2), point: 'fridge' },
          ]
        : task === 'SEEDLING'
          ? [
              { spot: spotOf(GSPOT.box, 0.06, 0.6, 0.45), point: 'box' },
              { spot: spotOf(GSPOT.jar, 0.14, 0.5, 0.2), point: 'jar' },
            ]
          : task === 'RESP'
            ? [
                { spot: spotOf(GSPOT.flaskA, 0.2, 0.8, 0.2), point: 'flask:A' },
                { spot: spotOf(GSPOT.conical, 0.08, 0.55, 0.35), point: 'co2' },
              ]
            : [
                { spot: spotOf(GSPOT.lightbox, 0.12, 0.7, 0.3), point: 'lightbox' },
                { spot: spotOf(GSPOT.corkjar, 0.13, 0.5, 0.15), point: 'corkjar' },
              ],
    observe: task === 'GERM' ? { spot: spotOf(GSPOT.rack, 0.06, 0.4, 0.2), point: 'tube:0' } : task === 'SEEDLING' ? { spot: spotOf(GSPOT.jar, 0.14, 0.45, 0.15), point: 'jar' } : task === 'RESP' ? { spot: spotOf(GSPOT.conical, 0.08, 0.45, 0.3), point: 'co2' } : { spot: spotOf(GSPOT.lightbox, 0.12, 0.6, 0.3), point: 'lightbox' },
    observeTitle: task === 'GERM' ? 'Radicles only in tube A' : task === 'SEEDLING' ? 'Cotyledons up — or left below' : task === 'RESP' ? 'Warmth and a milky tube' : 'Bent towards the slit',
  };
}

// ------------------------------------------------------------------ safety

export function growthSafety(task: GrowthTask): SafetyContent {
  const sym = (right: Hazard, why: Record<Hazard, string>) => (['flame', 'corrosive', 'toxic', 'harmful'] as Hazard[]).map((k) => ({ label: <HazardIcon kind={k} />, aria: k, right: k === right, why: why[k] }));
  const corrosive = sym('corrosive', {
    corrosive: 'Right: corrosive. Alkaline pyrogallol (and strong hypochlorite) attacks skin and eyes — the teacher handles it.',
    flame: 'That is the flame: flammable. Corrosive is the test tube dripping onto a hand.',
    toxic: 'That is the skull: toxic. Corrosive is the dripping test tube.',
    harmful: 'That is the exclamation mark: harmful or irritant. Corrosive is the dripping test tube.',
  });
  return {
    cards: [
      { icon: <Shirt className="size-6" />, title: 'Protect yourself', lessonMatch: /coat|eye|goggle|hand/i, lines: ['Wear your lab coat, buttoned.', task === 'RESP' ? 'Goggles on while boiling the seeds and using disinfectant.' : 'Wash your hands after handling soil, sawdust and seeds.'] },
      task === 'RESP'
        ? { icon: <Flame className="size-6" />, title: 'Hot water, disinfectant and glass', lessonMatch: /hot|disinfectant|thermos|glass/i, lines: ['Boiling water and hot seeds scald: let them cool before handling.', 'Do not knock the vacuum flasks — the inner glass breaks; report breakages.'] }
        : task === 'TROPISM'
          ? { icon: <Lightbulb className="size-6" />, title: 'Lamp, clinostat and pins', lessonMatch: /clinostat|electric|pin|lamp/i, lines: ['Keep the clinostat, the lamp and their leads away from water.', 'Handle pins carefully; put them back in the box.'] }
          : { icon: <Sprout className="size-6" />, title: 'Seeds and chemicals', lessonMatch: /pyrogallol|label|seed|soil/i, lines: ['Never eat seeds used in the lab: some are treated with chemicals.', task === 'GERM' ? 'Alkaline pyrogallol is corrosive: only the teacher handles it.' : 'Wipe spilt water at once: wet floors are slippery.'] },
      { icon: <Lightbulb className="size-6" />, title: 'Label and record', lessonMatch: /label|record/i, lines: ['Label every tube, flask or pot before you leave it.', 'Record each reading in your notebook as you take it.'] },
    ],
    questions: [
      task === 'GERM'
        ? { q: 'Alkaline pyrogallol carries this warning. Tap the symbol that means CORROSIVE.', grid: true, options: corrosive }
        : {
            q: task === 'RESP' ? 'You have boiled half the seeds. What next?' : task === 'TROPISM' ? 'Water has spilt next to the clinostat’s plug. What do you do?' : 'You have finished with the sawdust box. What do you do before you leave?',
            options:
              task === 'RESP'
                ? [
                    { label: 'Put them straight into the flask while hot', aria: 'hot', right: false, why: 'Hot seeds scald, and flask B would start warmer than A.' },
                    { label: 'Let them cool, then rinse them in disinfectant', aria: 'cool', right: true, why: 'Right: cool and disinfected, they are a fair control.' },
                  ]
                : task === 'TROPISM'
                  ? [
                      { label: 'Carry on — it is only a little water', aria: 'carry', right: false, why: 'Water and mains electricity together can give a shock.' },
                      { label: 'Switch off at the socket, dry the bench, and keep the lead away from the water', aria: 'safe', right: true, why: 'Right: electricity and water must be kept apart.' },
                    ]
                  : [
                      { label: 'Wash my hands with soap and water', aria: 'wash', right: true, why: 'Right: soil and sawdust carry germs.' },
                      { label: 'Wipe my hands on my coat', aria: 'wipe', right: false, why: 'The germs stay on your coat and hands.' },
                    ],
          },
      {
        q: task === 'GERM' ? 'Why is the boiled water in tube C covered with oil?' : task === 'SEEDLING' ? 'How do you measure the shoot each day?' : task === 'RESP' ? 'How do you close the flasks?' : 'What is the clinostat for?',
        options:
          task === 'GERM'
            ? [
                { label: 'To stop oxygen from the air dissolving in the water', aria: 'oxygen', right: true, why: 'Right: boiling removed the oxygen; the oil keeps it out.' },
                { label: 'To feed the seeds', aria: 'food', right: false, why: 'Seeds carry their own food store; the oil keeps oxygen out.' },
              ]
            : task === 'SEEDLING'
              ? [
                  { label: 'From the same point (the seed) every day', aria: 'same', right: true, why: 'Right: otherwise the lengths cannot be compared.' },
                  { label: 'From wherever is easiest that day', aria: 'any', right: false, why: 'A different reference point changes every reading.' },
                ]
              : task === 'RESP'
                ? [
                    { label: 'Plug loosely with cotton wool', aria: 'cotton', right: true, why: 'Right: the seeds still get oxygen.' },
                    { label: 'Seal airtight with a rubber bung', aria: 'bung', right: false, why: 'The seeds run out of oxygen.' },
                  ]
                : [
                    { label: 'It rotates slowly so the stimulus acts equally on all sides: the control', aria: 'control', right: true, why: 'Right: the controls grow straight.' },
                    { label: 'It waters the seedlings', aria: 'water', right: false, why: 'It turns them; you water them yourself.' },
                  ],
      },
    ],
  };
}

export const growthTour = (task: GrowthTask) =>
  bioTour({
    focusId: task === 'SEEDLING' ? 'jar' : task === 'RESP' ? 'flask:A' : task === 'TROPISM' ? 'lightbox' : 'rack',
    focusLabel: task === 'SEEDLING' ? 'Seed jar' : task === 'RESP' ? 'Flask A' : task === 'TROPISM' ? 'Light box' : 'Tubes',
    task: task === 'SEEDLING' ? 'The task card lists what to sow, measure and draw.' : task === 'RESP' ? 'The task card lists the flasks and the readings.' : task === 'TROPISM' ? 'The task card lists the two experiments and their controls.' : 'The task card lists the four tubes.',
  });

export const GROWTH_ASK: Record<GrowthTask, AskSuggestions> = {
  GERM: {
    LEARN: ['Why is tube A the control?', 'Why boil the water for tube C?', 'Is light needed for germination?', 'What counts as germinated?'],
    DEMO: ['Why do the seeds in C swell but not grow?', 'Why does one seed in D germinate?', 'How is % germination worked out?', 'Why use ten seeds in each tube?'],
    TRY: ['How do I work out % germination?', 'Which condition is missing in tube D?', 'What precautions can I write?', 'Why do some seeds in A fail?'],
    SANDBOX: ['What if I use old seed?', 'What if I leave out the oil?', 'What if the tubes stand in the sun?', 'What if I use tap water in C?'],
  },
  SEEDLING: {
    LEARN: ['What is epigeal germination?', 'Why is maize hypogeal?', 'Why soak the seeds?', 'What is the coleoptile for?'],
    DEMO: ['Why does the cowpea shoot arch?', 'Why do the cotyledons turn green?', 'Why does the radicle come first?', 'Why measure from the seed?'],
    TRY: ['How do I work out the growth rate?', 'Which part elongates in maize?', 'Should I join the points dot to dot?', 'What precautions can I write?'],
    SANDBOX: ['What if I stop watering?', 'What if the seeds are not soaked?', 'Why is growth slower when it is cool?', 'What if I measure from the soil?'],
  },
  RESP: {
    LEARN: ['Why use vacuum flasks?', 'Why boil half the seeds?', 'Why disinfect the seeds?', 'Why invert the flasks?'],
    DEMO: ['Why does flask A warm up?', 'Why does B stay the same?', 'Why does lime water turn milky?', 'What is the word equation?'],
    TRY: ['How do I work out the mean rise per day?', 'What is the difference due to respiration?', 'What precautions can I write?', 'Why cotton wool, not a bung?'],
    SANDBOX: ['What if I do not disinfect flask B?', 'What if I seal the flask airtight?', 'What if the seeds are old?', 'What if I do not invert the flasks?'],
  },
  TROPISM: {
    LEARN: ['What is phototropism?', 'What does a clinostat do?', 'What is auxin?', 'Why pin radicles in different directions?'],
    DEMO: ['Why do the shoots bend towards the slit?', 'Why do the radicles all turn down?', 'Why do the controls grow straight?', 'How do I measure the angle?'],
    TRY: ['How do I work out the rate of curvature?', 'Is it positive or negative phototropism?', 'What precautions can I write?', 'Why did one radicle not grow?'],
    SANDBOX: ['What if light leaks into the box?', 'What if the clinostat is off?', 'What if the cork dries out?', 'What if the slit faces away?'],
  },
};
