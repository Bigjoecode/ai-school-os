import { emptyChemEnergeticsState, type ChemEnergeticsState, type EnergeticsTask } from '@aischool/shared';
import { Flame, Glasses, Hand, Thermometer } from 'lucide-react';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import { HazardIcon, type Hazard, type SafetyContent } from '../../../lab3d-kit/safety';
import type { Spot } from '../../../lab3d-kit/store';
import { NEEDED, PLACEABLE } from './scene-state';
import { BATH, BURETTE, CUP, SPOT, TUBE_RACK } from './views';

/** The energetics lab's "What is this?" cards, Learn stage, Ask suggestions and the door briefing. */

const E: Record<string, Explainer> = {
  cup: { name: 'Polystyrene cup with lid', purpose: 'The calorimeter: holds the reacting liquids while the temperature change is measured.', how: 'Stand it in a beaker; cover it with the lid as soon as the liquids are mixed.', mistake: 'Leaving it uncovered, or using a glass beaker (heat escapes).', keys: ['polystyrene', 'cup', 'lid', 'heat loss', 'covered'] },
  glassBeaker: { name: 'Glass beaker', purpose: 'A container — but a poor calorimeter.', how: 'Glass conducts heat and absorbs some: use the polystyrene cup instead.', mistake: 'Using it for a heat measurement.', keys: ['heat loss'] },
  beaker: { name: 'Beaker (support)', purpose: 'Holds the light polystyrene cup steady.', how: 'Stand the cup inside it.', mistake: 'Leaving the cup free to tip over.', keys: ['beaker', 'support'] },
  cylinder: { name: 'Measuring cylinder (50 cm³)', purpose: 'Measures the acid, or the water.', how: 'Read the bottom of the meniscus at eye level: 50.0 cm³.', mistake: 'Using the same cylinder for acid and alkali without rinsing.', keys: ['measur', 'cylinder', 'volume'] },
  cylinder2: { name: 'Second measuring cylinder', purpose: 'Measures the alkali separately.', how: '50.0 cm³; read its temperature in the cylinder.', mistake: 'Mixing before both temperatures are read.', keys: ['alkali', 'temperature'] },
  thermometer: { name: 'Thermometer', purpose: 'Measures the temperature of the liquid.', how: 'Let it settle, then read at eye level to the nearest 0.5 °C. Stir with it gently.', mistake: 'Reading at an angle, or before it has settled.', keys: ['thermometer', 'temperature', 'stir', 'highest', 'lowest'] },
  stopwatch: { name: 'Stopwatch', purpose: 'Shows the time since mixing.', how: 'Watch the thermometer for a few minutes after mixing.', mistake: 'Stopping too soon.', keys: [] },
  balance: { name: 'Top-pan balance', purpose: 'Weighs the solid.', how: 'Tare the watch glass, then weigh to 0.01 g.', mistake: 'Forgetting to tare.', keys: ['weigh', 'balance'] },
  spatula: { name: 'Spatula', purpose: 'Moves solids.', how: 'Never touch NaOH pellets with your fingers.', mistake: 'Using fingers.', keys: ['fingers', 'naoh'] },
  acid: { name: 'Hydrochloric acid, 1.00 mol dm⁻³', purpose: 'Solution A: the acid.', how: '50.0 cm³ into the cup.', mistake: 'Splashing: rinse skin with water at once.', keys: ['acid', 'corrosive'] },
  alkali: { name: 'Sodium hydroxide, 1.00 mol dm⁻³', purpose: 'Solution B: the alkali.', how: '50.0 cm³ in a cylinder; poured quickly into the acid.', mistake: 'Splashing: NaOH is corrosive.', keys: ['naoh', 'corrosive', 'alkali'] },
  salt: { name: 'Ammonium trioxonitrate(V)', purpose: 'Dissolves endothermically: the water gets colder.', how: '4.00 g into 50.0 cm³ of water; stir until it dissolves.', mistake: 'Heating it (it is an oxidiser).', keys: ['nh4no3', 'ammonium', 'oxidis'] },
  naoh: { name: 'Sodium hydroxide pellets', purpose: 'Dissolve exothermically: the water gets warmer.', how: 'With the spatula, never fingers.', mistake: 'Touching them: they burn the skin.', keys: ['naoh', 'pellets', 'fingers'] },
  water: { name: 'Distilled water', purpose: 'The solvent.', how: 'Measure it accurately.', mistake: '—', keys: ['water'] },
  kno3: { name: 'Potassium trioxonitrate(V)', purpose: 'The salt whose solubility is measured.', how: '4.0 g into the tube.', mistake: 'Spilling some (the mass is used all the way through).', keys: ['kno3', 'potassium'] },
  tube: { name: 'Boiling tube', purpose: 'Holds the KNO₃ solution.', how: 'Use the holder: it gets hot.', mistake: 'Holding it with bare fingers.', keys: ['boiling tube', 'holder'] },
  rack: { name: 'Test-tube rack', purpose: 'Holds the tube while it cools.', how: 'Stir with the thermometer as it cools.', mistake: '—', keys: [] },
  bath: { name: 'Water bath', purpose: 'Warms the tube gently.', how: 'About 80 °C: hot enough to dissolve the solid, not to boil off water.', mistake: 'Using a naked flame instead.', keys: ['water bath', 'evaporat'] },
  burette: { name: 'Burette (distilled water)', purpose: 'Adds the water accurately.', how: '5.0 cm³ to start, then 1.0 cm³ each time.', mistake: 'Misreading the scale.', keys: ['burette', 'measured', 'water'] },
  burner: { name: 'Bunsen burner', purpose: 'Strong heating.', how: 'Not for the tube: it boils and spits. Keep NH₄NO₃ well away.', mistake: 'Heating the tube directly.', keys: ['flame', 'heat'] },
  washBottle: { name: 'Wash bottle', purpose: 'Distilled water for rinsing.', how: 'Rinse the cup between runs.', mistake: '—', keys: ['rinse'] },
  book: { name: 'Practical notebook', purpose: 'Your table, graph and answers — this is what is marked.', how: 'Write each reading as you take it.', mistake: 'A positive ΔH for a temperature rise.', keys: ['sign', 'graph'] },
  card: { name: 'Task card', purpose: 'The question paper.', how: 'Read it before you start.', mistake: '—', keys: [] },
  coat: { name: 'Lab coat', purpose: 'Protects your clothes from corrosive solutions.', how: 'Buttoned.', mistake: '—', keys: [] },
  goggles: { name: 'Safety goggles', purpose: 'Protect your eyes from acid, alkali and hot splashes.', how: 'Wear them the whole time.', mistake: 'Pushing them onto your forehead.', keys: ['goggles'] },
  fume: { name: 'Fume cupboard', purpose: 'For harmful fumes.', how: 'Not needed today.', mistake: '—', keys: [] },
  extinguisher: { name: 'Fire extinguisher', purpose: 'Puts out small fires.', how: 'Keep the oxidiser NH₄NO₃ away from flames.', mistake: '—', keys: ['flames'] },
  eyewash: { name: 'Eye-wash station', purpose: 'Rinses acid or alkali out of the eyes.', how: 'Rinse for 10 minutes; tell the teacher.', mistake: 'Rubbing the eye.', keys: ['eyes'] },
  firstaid: { name: 'First-aid box', purpose: 'For small injuries and burns.', how: 'Cool a burn under running water; tell the teacher.', mistake: '—', keys: [] },
};
export const explainer = makeExplainer(E);

export const ASK_SUGGESTIONS: AskSuggestions = {
  LEARN: ['Why use a polystyrene cup?', 'Why is ΔH negative for an exothermic reaction?', 'What does saturated mean?', 'Why take the mean of the two temperatures?'],
  DEMO: ['Why cover the cup at once?', 'Why does the temperature fall after the highest point?', 'Why stir while the tube cools?', 'Why use a water bath and not a flame?'],
  TRY: ['How do I work out Q?', 'How many moles of water are formed?', 'How do I work out the solubility?', 'How do I read values from my curve?'],
  SANDBOX: ['Why does ethanoic acid give less heat?', 'Why is ammonia different?', 'Which salts dissolve endothermically?', 'Why is the NaCl curve so flat?'],
};

/** The bench as Mrs Ada sets it out for the introduction (display only). */
export function learnState(task: EnergeticsTask): ChemEnergeticsState {
  const s = emptyChemEnergeticsState();
  return {
    ...s,
    task,
    setup: task === 'SOLY' ? s.setup : { vessel: 'CUP', support: true },
    log: [{ t: 0, a: `task:${task}` }, { t: 0, a: 'safety:goggles' }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` })), ...PLACEABLE[task].map((id) => ({ t: 0, a: `place:${id}` }))],
  };
}

const S: Record<string, Spot> = {
  cup: { target: [CUP[0], 0.07, CUP[2]], dist: 0.5, pitch: 0.35 },
  beaker: { target: [CUP[0], 0.05, CUP[2]], dist: 0.55, pitch: 0.3 },
  thermometer: { target: [CUP[0], 0.16, CUP[2]], dist: 0.45, pitch: 0.12 },
  cylinder: { target: [SPOT.cylA[0], 0.1, SPOT.cylA[2]], dist: 0.5, pitch: 0.3 },
  cylinder2: { target: [SPOT.cylB[0], 0.1, SPOT.cylB[2]], dist: 0.5, pitch: 0.3 },
  balance: { target: [SPOT.balance[0], 0.05, SPOT.balance[2]], dist: 0.45, pitch: 0.45 },
  spatula: { target: [SPOT.spatula[0], 0.01, SPOT.spatula[2]], dist: 0.35, pitch: 0.8 },
  tube: { target: [TUBE_RACK[0], 0.1, TUBE_RACK[2]], dist: 0.45, pitch: 0.2 },
  bath: { target: [BATH[0], 0.1, BATH[2]], dist: 0.6, pitch: 0.4 },
  burette: { target: [BURETTE[0], 0.35, BURETTE[2]], dist: 0.85, pitch: 0.15 },
  tubeThermo: { target: [TUBE_RACK[0], 0.18, TUBE_RACK[2]], dist: 0.4, pitch: 0.1 },
  whole: { target: [0, 0.14, 0.0], dist: 1.25, pitch: 0.45 },
};

export function learnConfig(task: EnergeticsTask): LearnConfig {
  if (task === 'SOLY')
    return {
      items: [
        { match: /boiling tube/i, id: 'tube', spot: S.tube! },
        { match: /thermometer/i, id: 'thermometer', spot: S.tubeThermo! },
        { match: /water bath/i, id: 'bath', spot: S.bath! },
        { match: /burette|measuring cylinder/i, id: 'burette', spot: S.burette! },
        { match: /balance/i, id: 'balance', spot: S.balance! },
        { match: /stirrer/i, id: 'thermometer', spot: S.tubeThermo! },
      ],
      explain: explainer,
      procedure: [{ spot: S.whole!, point: 'tube' }, { spot: S.bath!, point: 'bath' }],
      observe: { spot: S.tube!, point: 'tube' },
      observeTitle: 'What you should see',
    };
  const items = [
    { match: /polystyrene|plastic foam|cup/i, id: 'cup', spot: S.cup! },
    { match: /thermometer/i, id: 'thermometer', spot: S.thermometer! },
    { match: /measuring cylinder/i, id: 'cylinder', spot: S.cylinder! },
    { match: /beaker/i, id: 'beaker', spot: S.beaker! },
    { match: /balance/i, id: 'balance', spot: S.balance! },
    { match: /spatula/i, id: 'spatula', spot: S.spatula! },
  ];
  return { items, explain: explainer, procedure: [{ spot: S.whole!, point: 'cup' }, { spot: S.thermometer!, point: 'thermometer' }], observe: { spot: S.cup!, point: 'cup' }, observeTitle: 'What you should see' };
}

// ------------------------------------------------------------------ the door briefing

export function enSafety(task: EnergeticsTask): SafetyContent {
  const soly = task === 'SOLY';
  return {
    cards: [
      { icon: <Glasses className="size-6" />, title: 'Protect your eyes', lessonMatch: /goggles|eye/i, lines: ['Wear your safety goggles over your eyes the whole time.', 'Lab coat on and buttoned; long hair tied back.'] },
      soly
        ? { icon: <Thermometer className="size-6" />, title: 'Heating and hot tubes', lessonMatch: /hot|holder|boiling/i, lines: ['The water bath is hot (about 80 °C): lift the boiling tube with the holder, never bare fingers.', 'Point the tube away from people; a naked flame makes the solution boil and spit — use the water bath.'] }
        : { icon: <Hand className="size-6" />, title: 'Corrosive acid and alkali', lessonMatch: /corrosive|naoh|skin|fingers/i, lines: [task === 'NEUT' ? 'HCl and NaOH are corrosive: pour carefully, below eye level.' : 'NaOH pellets are corrosive: use the spatula, never your fingers.', 'A splash on your skin: rinse with plenty of running water at once and tell the teacher.'] },
      soly
        ? { icon: <Hand className="size-6" />, title: 'Burns', lines: ['A burn: cool it under running water for 10 minutes and tell the teacher.', 'Let hot apparatus cool before putting it away.'] }
        : { icon: <Flame className="size-6" />, title: task === 'SOLN' ? 'Oxidiser' : 'Warm solutions', lessonMatch: /oxidis|heat|flame/i, lines: task === 'SOLN' ? ['NH₄NO₃ is an oxidising agent: keep it away from heat and flames.', 'Dissolving NaOH makes the water hot: handle the cup by its base.'] : ['The mixture gets warm: hold the cup by its support beaker.', 'Wipe up spills at once.'] },
    ],
    questions: [
      {
        q: soly ? 'Tap the symbol that means FLAMMABLE (on the Bunsen burner’s gas tap).' : 'Tap the symbol that means CORROSIVE (on the NaOH bottle).',
        grid: true,
        options: (['flame', 'corrosive', 'toxic', 'harmful'] as Hazard[]).map((k) => {
          const want: Hazard = soly ? 'flame' : 'corrosive';
          return { label: <HazardIcon kind={k} />, aria: k, right: k === want, why: k === want ? (soly ? 'Right: a flame.' : 'Right: liquid eating into a surface and a hand.') : soly ? 'Flammable is shown by a flame.' : 'Corrosive shows liquid eating into a surface and a hand.' };
        }),
      },
      soly
        ? {
            q: 'How do you take the hot boiling tube out of the water bath?',
            options: [
              { label: 'With the test-tube holder', aria: 'holder', right: true, why: 'Right: it is too hot to hold.' },
              { label: 'Quickly, with my fingers', aria: 'fingers', right: false, why: 'It is at about 80 °C: use the holder.' },
            ],
          }
        : {
            q: task === 'NEUT' ? 'NaOH solution splashes onto your hand. What do you do first?' : 'How do you pick up NaOH pellets?',
            options:
              task === 'NEUT'
                ? [
                    { label: 'Rinse it under plenty of running water', aria: 'rinse', right: true, why: 'Right: at once, then tell the teacher.' },
                    { label: 'Wipe it on my lab coat', aria: 'wipe', right: false, why: 'Rinse with plenty of water at once.' },
                  ]
                : [
                    { label: 'With a spatula', aria: 'spatula', right: true, why: 'Right: NaOH burns the skin.' },
                    { label: 'With dry fingers', aria: 'fingers', right: false, why: 'Never: NaOH is corrosive. Use the spatula.' },
                  ],
          },
      {
        q: 'A splash goes into your eye. What do you do first?',
        options: [
          { label: 'Rub it gently', aria: 'rub', right: false, why: 'Rubbing spreads it.' },
          { label: 'Rinse it at the eye-wash for 10 minutes and tell the teacher', aria: 'rinse', right: true, why: 'Right: plenty of water, at once.' },
        ],
      },
    ],
  };
}
