import { emptyBioFoodState, emptyFoodRecord, type BioFoodState, type FoodTask } from '@aischool/shared';
import { Flame, Glasses, Hand, TriangleAlert } from 'lucide-react';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import { HazardIcon, type Hazard, type SafetyContent } from '../../../lab3d-kit/safety';
import { BIO_ROOM_EXPLAIN, bioTour } from '../../bio-common/lab3d/common';
import { FSPOT, amyBathSpot, sampleSpot, spotOf } from './bench';
import { neededFor } from './scene-state';

/** The food-tests lab's texts: "What is this?" cards, safety briefing, Learn, tour and Ask suggestions. */

const E: Record<string, Explainer> = {
  ...BIO_ROOM_EXPLAIN,
  goggles: { name: 'Safety goggles', purpose: 'Protect your eyes from boiling water, sodium hydroxide, acid and Millon’s reagent.', how: 'Wear them whenever you heat tubes or use corrosive reagents.', mistake: 'Pushing them up onto your forehead while heating.', keys: ['eye', 'goggles'] },
  sample: { name: 'A food sample', purpose: 'One of the unknown foods P, Q and R: you find which food substances it contains.', how: 'Use about 2 cm³ in a clean test tube for each test; note its appearance first.', mistake: 'Using the same tube for two tests: traces of one reagent spoil the next test.', keys: ['sample'] },
  bottle: { name: 'Reagent dropper bottle', purpose: 'Each reagent gives a known colour with one class of food.', how: 'Iodine: 2–3 drops. Benedict’s: an equal volume, then the water bath. Biuret: NaOH, then two drops of CuSO₄.', mistake: 'Too much copper(II) sulphate in the Biuret test: its blue hides the violet.', keys: ['iodine', 'benedict', 'biuret', 'sudan', 'reagent', 'sodium hydroxide', 'copper'] },
  tube: { name: 'The test tube in use', purpose: 'Where the colour change happens.', how: 'Look at it against a white background; for Benedict’s, watch the colour while it heats.', mistake: 'Writing “red colour” instead of “brick-red precipitate”.', keys: ['test tube', 'precipitate', 'colour'] },
  rack: { name: 'Test tubes and rack', purpose: 'One clean tube for each test, kept in order.', how: 'Label or keep the tubes in the order of your table.', mistake: 'Re-using a dirty tube.', keys: ['test tube', 'rack', 'clean'] },
  holder: { name: 'Test-tube holder', purpose: 'Holds a tube going into, or coming out of, the hot water bath.', how: 'Grip the tube near its mouth; point it away from everyone.', mistake: 'Holding a hot tube with your fingers.', keys: ['holder', 'point'] },
  bath: { name: 'Boiling water bath', purpose: 'Heats Benedict’s, Millon’s and the acid tests evenly and safely.', how: 'A beaker of water on a tripod and gauze over the Bunsen burner; stand the tube in the boiling water for about 5 minutes.', mistake: 'Heating the tube directly in the flame: it bumps and spurts.', keys: ['water bath', 'heat', 'bunsen', 'boiling'] },
  burner: { name: 'Water bath and Bunsen burner', purpose: 'A beaker of water on a tripod and gauze over the Bunsen burner: the boiling water bath.', how: 'Light the burner with the air hole closed, then open it; wait for the water to boil.', mistake: 'Heating tubes straight in the flame instead.', keys: ['bunsen', 'water bath'] },
  paper: { name: 'Filter paper', purpose: 'The grease-spot test for fats and oils.', how: 'Rub a little sample on it, let it dry, hold it up to the light: a translucent spot that stays shows fat.', mistake: 'Looking while it is still wet: water also leaves a mark until it dries.', keys: ['filter paper', 'grease'] },
  cylinder: { name: 'Measuring cylinder', purpose: 'Measures the sample and reagent volumes (e.g. 2 cm³).', how: 'Read the bottom of the meniscus at eye level.', mistake: 'Guessing volumes, so tests are not comparable.', keys: ['measuring cylinder', 'volume'] },
  card: { name: 'Task card', purpose: 'The question paper.', how: 'Read it first and again before you hand in.', mistake: 'Missing a part of the question.', keys: [] },
  book: { name: 'Practical notebook', purpose: 'Your table and answers — this is what is marked.', how: 'One row per test: test, observation, inference.', mistake: 'Mixing up the observation and the inference columns.', keys: ['record', 'table'] },
  tile: { name: 'Spotting tile', purpose: 'Many small iodine tests side by side, one well per drop.', how: 'A drop of iodine in each well; a drop of the mixture in a fresh well each time.', mistake: 'Using the same well twice, or the same dropper for two mixtures.', keys: ['spotting tile', 'iodine', 'well'] },
  stopwatch: { name: 'Stopwatch', purpose: 'Times the drops and the end point.', how: 'Start it as the saliva goes into the starch.', mistake: 'Starting it late, so every time is too short.', keys: ['stopwatch', 'time'] },
  thermometer: { name: 'Thermometer', purpose: 'Checks each bath’s temperature.', how: 'Read it with the bulb in the water, at eye level.', mistake: 'Assuming the bath is at 37 °C without checking.', keys: ['thermometer', 'temperature'] },
  amybath: { name: 'A water bath for the amylase tubes', purpose: 'Keeps the starch and saliva at one temperature: ice (about 10 °C), room, 37 °C or 45 °C.', how: 'Stand the starch and saliva tubes in it for 5 minutes before mixing.', mistake: 'Mixing before the tubes reach the temperature.', keys: ['water bath', 'temperature', 'ice'] },
  starch: { name: '1% starch solution', purpose: 'The substrate: amylase digests it to maltose.', how: '5 cm³ in a tube in each bath.', mistake: 'Different volumes in different tubes.', keys: ['starch'] },
  saliva: { name: 'Saliva solution', purpose: 'Contains the enzyme salivary amylase (ptyalin).', how: 'Rinse your mouth with water and collect it; boil some for the control.', mistake: 'Using someone else’s saliva.', keys: ['saliva'] },
  lens: { name: 'Hand lens', purpose: 'Magnifies specimens.', how: 'Not needed for food tests.', mistake: 'Cluttering the bench.', keys: [] },
  slides: { name: 'Microscope slides', purpose: 'For the microscope.', how: 'Not needed here.', mistake: 'Cluttering the bench.', keys: [] },
  scalpel: { name: 'Scalpel', purpose: 'Cuts specimens.', how: 'Not needed here.', mistake: 'Taking sharps you do not need.', keys: [] },
};
export const foodExplainer = makeExplainer(E, { 'sample:': 'sample', 'bottle:': 'bottle', 'amybath:': 'amybath' });

// ------------------------------------------------------------------ Learn

/** The bench as Mrs Okon sets it out for Learn (display only, never saved). */
export function learnState(task: FoodTask): BioFoodState {
  const s = emptyBioFoodState();
  s.task = task;
  s.log = [{ t: 0, a: 'safety:coat' }, { t: 0, a: 'safety:goggles' }, ...neededFor(task).map((a) => ({ t: 0, a: `collect:${a.id}` })), { t: 0, a: 'burner-on' }];
  if (task === 'FOOD') {
    s.tests = [{ sample: 'P', test: 'BENEDICT', steps: [], heat: 300, direct: false, at: 0 }];
    s.table = [emptyFoodRecord()];
  } else {
    s.tile = true;
    s.tubes = [
      { bath: 'ICE', boiled: false },
      { bath: 'BODY', boiled: false },
      { bath: 'BOILING', boiled: false },
    ];
    s.amy = s.tubes.map(() => ({ observation: '', claims: [], end: '', rate: '' }));
    s.equilibrated = true;
    s.clock = 60;
    s.spots = [0, 30, 60].flatMap((t) => [0, 1, 2].map((tube) => ({ tube, t })));
  }
  return s;
}

export function learnConfig(task: FoodTask): LearnConfig {
  const items: LearnConfig['items'] =
    task === 'FOOD'
      ? [
          { match: /test.?tube|rack/i, id: 'rack', spot: spotOf(FSPOT.rack, 0.07, 0.5, 0.35, 0.5) },
          { match: /water bath|beaker of boiling/i, id: 'bath', spot: spotOf(FSPOT.bath, 0.2, 0.6, 0.25) },
          { match: /bunsen|hot plate/i, id: 'bath', spot: spotOf(FSPOT.bath, 0.08, 0.55, 0.2) },
          { match: /holder/i, id: 'holder', spot: spotOf(FSPOT.holder, 0.02, 0.4, 0.55) },
          { match: /dropper/i, id: 'bottle:IODINE', spot: spotOf(FSPOT.reagents, 0.05, 0.62, 0.4) },
          { match: /filter paper/i, id: 'paper', spot: spotOf(FSPOT.paper, 0.01, 0.4, 0.75) },
          { match: /measuring cylinder/i, id: 'cylinder', spot: spotOf(FSPOT.cylinder, 0.08, 0.45, 0.3) },
        ]
      : [
          { match: /test.?tube/i, id: 'rack', spot: spotOf(FSPOT.rack, 0.07, 0.5, 0.35, 0.5) },
          { match: /water bath|ice/i, id: 'amybath:ICE', spot: spotOf(amyBathSpot('ICE'), 0.06, 0.6, 0.3) },
          { match: /thermometer/i, id: 'thermometer', spot: spotOf(amyBathSpot('WARM'), 0.06, 0.55, 0.35) },
          { match: /spotting tile/i, id: 'tile', spot: spotOf(FSPOT.tile, 0.01, 0.42, 0.9) },
          { match: /dropper/i, id: 'bottle:IODINE', spot: spotOf(FSPOT.amyReagents, 0.06, 0.55, 0.35) },
          { match: /stopwatch/i, id: 'stopwatch', spot: spotOf(FSPOT.stopwatch, 0.01, 0.4, 0.8) },
          { match: /measuring cylinder/i, id: 'cylinder', spot: spotOf(FSPOT.cylinder, 0.08, 0.45, 0.3) },
        ];
  return {
    items,
    explain: foodExplainer,
    procedure:
      task === 'FOOD'
        ? [
            { spot: spotOf(sampleSpot(1), 0.06, 0.6, 0.35), point: 'sample:P' },
            { spot: spotOf(FSPOT.bath, 0.2, 0.6, 0.25), point: 'bath' },
          ]
        : [
            { spot: spotOf(amyBathSpot('BODY'), 0.08, 0.75, 0.3), point: 'amybath:BODY' },
            { spot: spotOf(FSPOT.tile, 0.01, 0.45, 0.9), point: 'tile' },
          ],
    observe: task === 'FOOD' ? { spot: spotOf(FSPOT.bath, 0.22, 0.45, 0.2), point: 'tube' } : { spot: spotOf(FSPOT.tile, 0.01, 0.4, 0.95), point: 'tile' },
    observeTitle: task === 'FOOD' ? 'What you should see' : 'The end point',
    dataCard: task === 'FOOD' ? { kicker: 'Recording results', title: 'Reading Benedict’s colours', speech: 'Here is how the Benedict’s colours rank the amount of reducing sugar, and a dilution worked out.' } : undefined,
  };
}

// ------------------------------------------------------------------ safety

export function foodSafety(task: FoodTask): SafetyContent {
  const corrosive = (['flame', 'corrosive', 'toxic', 'harmful'] as Hazard[]).map((k) => ({
    label: <HazardIcon kind={k} />,
    aria: k,
    right: k === 'corrosive',
    why: k === 'corrosive' ? 'Right: corrosive — it burns skin and eyes. Sodium hydroxide and acids carry it: goggles on, and wash any splash off with plenty of water.' : k === 'flame' ? 'That is the flame: flammable (ethanol, Sudan III). Corrosive is the hand and the bench being eaten away.' : k === 'toxic' ? 'That is the skull and crossbones: toxic (Millon’s reagent contains mercury). Corrosive is the hand and the bench being eaten away.' : 'That is the exclamation mark: harmful or irritant. Corrosive is the hand and the bench being eaten away.',
  }));
  return {
    cards: [
      { icon: <Glasses className="size-6" />, title: 'Protect yourself', lines: ['Lab coat buttoned, goggles on whenever you heat tubes or use sodium hydroxide or acid.', 'Tie back long hair near the Bunsen burner.'], lessonMatch: /eye|goggle|protect/i },
      { icon: <Flame className="size-6" />, title: 'The hot water bath', lines: ['Heat tubes only in the boiling water bath — never directly in the flame.', 'Use a test-tube holder, and point the mouth of the tube away from yourself and others.'], lessonMatch: /point|heat|boiling/i },
      {
        icon: <TriangleAlert className="size-6" />,
        title: task === 'AMYLASE' ? 'Reagents and saliva' : 'Corrosive and flammable reagents',
        lines:
          task === 'AMYLASE'
            ? ['Use only your own saliva; rinse apparatus in disinfectant afterwards.', 'Benedict’s and iodine stain: wipe up spills and wash splashes off your skin.']
            : ['Sodium hydroxide and dilute acid are corrosive: wipe spills, and rinse splashes with plenty of water.', 'Ethanol and Sudan III are flammable: keep them away from the burner. Millon’s reagent is toxic.'],
        lessonMatch: /flammable|ethanol|saliva|disinfect/i,
      },
      { icon: <Hand className="size-6" />, title: 'Behave safely', lines: ['Never taste anything in the laboratory, even food samples.', 'Wash your hands before you leave.'] },
    ],
    questions: [
      { q: 'Sodium hydroxide carries this warning. Tap the symbol that means CORROSIVE.', grid: true, options: corrosive },
      {
        q: 'How do you heat a Benedict’s test?',
        options: [
          { label: 'Directly in the Bunsen flame, shaking it', aria: 'flame', right: false, why: 'Straight in the flame the liquid boils suddenly and spurts out of the tube.' },
          { label: 'Stand it in a beaker of boiling water (a water bath)', aria: 'bath', right: true, why: 'Right: the water bath heats it evenly and safely.' },
          { label: 'Hold it in my hand over the burner', aria: 'hand', right: false, why: 'Never: the glass gets far too hot. Use a holder and the water bath.' },
        ],
      },
      {
        q: 'You lift a hot tube out of the water bath. Where should its mouth point?',
        options: [
          { label: 'Towards me, so I can see the colour', aria: 'me', right: false, why: 'Hot liquid can spurt out — straight into your face.' },
          { label: 'Away from me and from everyone else', aria: 'away', right: true, why: 'Right: if anything spurts out, it hits no one.' },
        ],
      },
      task === 'AMYLASE'
        ? {
            q: 'Whose saliva do you use?',
            options: [
              { label: 'My partner’s, to save time', aria: 'partner', right: false, why: 'Saliva carries germs: use only your own.' },
              { label: 'Only my own', aria: 'own', right: true, why: 'Right — and rinse the apparatus in disinfectant afterwards.' },
            ],
          }
        : {
            q: 'You need ethanol for the emulsion test and the burner is lit. What do you do?',
            options: [
              { label: 'Pour it next to the flame — quickly', aria: 'quick', right: false, why: 'Ethanol vapour catches fire easily.' },
              { label: 'Keep it well away from the flame, or turn the burner off', aria: 'away', right: true, why: 'Right: ethanol is flammable.' },
            ],
          },
    ],
  };
}

export const foodTour = (task: FoodTask) =>
  bioTour({ focusId: task === 'AMYLASE' ? 'tile' : 'bath', focusLabel: task === 'AMYLASE' ? 'Spotting tile' : 'Water bath', task: task === 'AMYLASE' ? 'The task card lists the baths, the control and when to test the drops.' : 'The task card lists the samples and the tests to do on each.' });

export const FOOD_ASK: AskSuggestions = {
  LEARN: ['Why is Benedict’s heated in a water bath?', 'What is the difference between a reducing and a non-reducing sugar?', 'Why only two drops of copper(II) sulphate?', 'What does a translucent spot show?'],
  DEMO: ['Why does the colour change while it heats?', 'Why neutralise the acid?', 'How do Benedict’s colours show how much sugar?', 'Why test every sample for every food?'],
  TRY: ['How do I write a good observation?', 'What should my inference say?', 'Is “red colour” enough?', 'What precautions can I write?'],
  SANDBOX: ['What does milk contain?', 'Why does sugar give no colour with Benedict’s?', 'Which foods contain fat?', 'How would honey compare with glucose?'],
};
export const AMY_ASK: AskSuggestions = {
  LEARN: ['What does amylase do to starch?', 'Why use a spotting tile?', 'What is the end point?', 'Why a boiled-saliva control?'],
  DEMO: ['Why is 37 °C the fastest?', 'Why is the ice-cold tube slow?', 'What does boiling do to the enzyme?', 'Why test with Benedict’s at the end?'],
  TRY: ['How do I work out the rate?', 'What is the optimum temperature?', 'How do I explain the boiled saliva result?', 'What precautions can I write?'],
  SANDBOX: ['What happens with very active saliva?', 'Why does 45 °C take longer than 37 °C?', 'Does cold denature the enzyme?', 'What is the product of starch digestion?'],
};
