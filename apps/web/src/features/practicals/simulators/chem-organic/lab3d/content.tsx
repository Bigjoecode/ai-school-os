import { emptyChemOrganicState, emptyOrgRecord, type ChemOrganicState, type OrgTask } from '@aischool/shared';
import { Flame, Glasses, TriangleAlert, Wind } from 'lucide-react';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import { HazardIcon, type Hazard, type SafetyContent } from '../../../lab3d-kit/safety';
import { defaultTourSteps } from '../../../lab3d-kit/tour';
import { OSPOT, sampleSpot, spotOf } from './bench';
import { neededFor } from './scene-state';

/** The organic lab's texts: "What is this?" cards, safety briefing, Learn, tour and Ask suggestions. */

const E: Record<string, Explainer> = {
  coat: { name: 'Lab coat', purpose: 'Protects your skin and clothes from splashes.', how: 'Wear it buttoned for the whole practical.', mistake: 'Leaving it open.', keys: [] },
  goggles: { name: 'Safety goggles', purpose: 'Protect your eyes from bromine water, acids, alkalis and spitting hot NaOH.', how: 'Wear them the whole time.', mistake: 'Pushing them up onto your forehead.', keys: ['goggles', 'eyes'] },
  sample: { name: 'A sample', purpose: 'One of the unknowns you identify by its reactions.', how: 'About 2 cm³ in a clean tube for each test; note its appearance first.', mistake: 'Re-using a tube: traces of the last reagent spoil the next test.', keys: ['sample'] },
  bottle: { name: 'Reagent dropper bottle', purpose: 'Each reagent gives a known result with one functional group or food substance.', how: 'A few drops; shake; warm only in the water bath when the test says so.', mistake: 'Too much reagent: e.g. excess CuSO₄ hides the Biuret violet.', keys: ['bromine', 'kmno', 'dichromate', 'benedict', 'iodine', 'biuret', 'cuso', 'reagent', 'nahco', 'sodium'] },
  tube: { name: 'The test tube in use', purpose: 'Where you see the result: decolourising, colour changes, fizzing, precipitates.', how: 'Look against a white background; compare with a control.', mistake: 'Writing “it reacted” instead of what you saw.', keys: ['test tube', 'control', 'colour'] },
  rack: { name: 'Test tubes and rack', purpose: 'One clean tube for each test, kept in order.', how: 'Keep them in the order of your table.', mistake: 'Re-using a dirty tube.', keys: ['test tube', 'rack'] },
  holder: { name: 'Test-tube holder', purpose: 'Holds a tube going into or out of the hot water bath.', how: 'Grip near the mouth; point the tube away from everyone.', mistake: 'Holding a hot tube with your fingers.', keys: ['holder'] },
  bath: { name: 'Water bath', purpose: 'Warms tubes evenly — and the only way to warm organic liquids, which are flammable.', how: 'A beaker of water on a tripod and gauze over the burner; stand the tube in it.', mistake: 'Heating an organic liquid straight in the flame: it can catch fire.', keys: ['water bath', 'flame', 'flammable', 'heat'] },
  gasKit: { name: 'Splints and lime water', purpose: 'Identify the gas: H₂ pops with a burning splint; CO₂ turns lime water milky.', how: 'Hold the splint at the mouth of the tube; pass the gas into lime water.', mistake: 'Testing too late, after the gas has escaped.', keys: ['splint', 'limewater', 'lime water', 'gas'] },
  cylinder: { name: 'Measuring cylinder', purpose: 'Measures volumes: 2 cm³ samples, 10 cm³ oil, 20 cm³ NaOH.', how: 'Read the bottom of the meniscus at eye level.', mistake: 'Guessing volumes.', keys: ['measuring cylinder', 'volume'] },
  waterBeaker: { name: 'Beaker of cold water', purpose: 'The esterification mixture is poured into it: the ester floats and its smell is easy to notice.', how: 'Pour, then waft the smell towards your nose.', mistake: 'Sniffing directly over it.', keys: ['ester', 'smell', 'pour'] },
  card: { name: 'Task card', purpose: 'The question paper.', how: 'Read it first and again before you hand in.', mistake: 'Missing a part of the question.', keys: [] },
  book: { name: 'Practical notebook', purpose: 'Your table and answers — this is what is marked.', how: 'One row per test: test, observation, inference.', mistake: 'Mixing up the observation and the inference columns.', keys: ['record', 'table'] },
  beaker: { name: '250 cm³ beaker on a tripod', purpose: 'The palm oil and NaOH are boiled in it.', how: 'Boil gently, stirring all the time with the glass rod; add water to keep the volume up.', mistake: 'Letting it boil dry: it chars and spits.', keys: ['beaker', 'boil', 'stir'] },
  burner: { name: 'Bunsen burner, tripod and gauze', purpose: 'Heats the soap mixture.', how: 'A gentle flame; never leave it unattended.', mistake: 'A roaring flame: the mixture froths over.', keys: ['bunsen', 'tripod'] },
  rod: { name: 'Glass stirring rod', purpose: 'Keeps the oil and alkali mixed while they boil.', how: 'Stir continuously.', mistake: 'Not stirring: the mixture spits and reacts slowly.', keys: ['stir', 'rod'] },
  funnel: { name: 'Filter funnel and paper', purpose: 'Separates the solid soap from the brine (with the glycerol and excess alkali).', how: 'Pour the cooled mixture through; wash the soap with a little cold water.', mistake: 'Not washing: the soap keeps excess alkali.', keys: ['filter', 'wash'] },
  balance: { name: 'Top-pan balance', purpose: 'Weighs the oil and the soap (to 0.01 g).', how: 'Tare it with the empty container, then weigh.', mistake: 'Weighing wet soap: the yield is too high.', keys: ['balance', 'weigh', 'mass'] },
  lather: { name: 'Lather tubes', purpose: 'Compares soap in distilled (soft) and in hard water.', how: 'A small piece of soap, shake for 30 s, compare the lather.', mistake: 'Using tap water for both.', keys: ['lather', 'hard water', 'scum'] },
  soapbottle: { name: 'Stock bottle', purpose: 'Palm oil, 20% NaOH, saturated brine, distilled water or hard water.', how: 'Measure what you need with the cylinder.', mistake: 'Spilling hot NaOH: wash skin at once with plenty of water.', keys: ['palm oil', 'naoh', 'brine', 'water'] },
  fume: { name: 'Fume cupboard', purpose: 'Where bromine and concentrated acids are dispensed.', how: 'The teacher handles conc. H₂SO₄ and HNO₃.', mistake: 'Opening bromine at the open bench.', keys: ['fume'] },
  extinguisher: { name: 'Fire extinguisher', purpose: 'Puts out small fires — organic liquids burn.', how: 'Tell the teacher first; aim at the base.', mistake: 'Not knowing where it is.', keys: [] },
  firstaid: { name: 'First-aid box', purpose: 'Dressings for burns and splashes.', how: 'Cool a burn under running water and tell the teacher.', mistake: 'Hiding a burn.', keys: [] },
  eyewash: { name: 'Eye-wash station', purpose: 'Rinses chemicals out of the eyes.', how: 'Rinse for at least 10 minutes.', mistake: 'Rubbing the eye.', keys: ['eyes'] },
  burette: { name: 'Burette', purpose: 'For titrations.', how: 'Not needed here.', mistake: 'Cluttering the bench.', keys: [] },
  thermometer: { name: 'Thermometer', purpose: 'Measures temperature.', how: 'Not needed here.', mistake: 'Using it to stir.', keys: [] },
};
export const orgExplainer = makeExplainer(E, { 'sample:': 'sample', 'bottle:': 'bottle', 'soapbottle:': 'soapbottle', 'lather:': 'lather' });

/** The bench as Mrs Ada sets it out for Learn (display only, never saved). */
export function learnState(task: OrgTask): ChemOrganicState {
  const s = emptyChemOrganicState();
  s.task = task;
  s.log = [{ t: 0, a: 'safety:coat' }, { t: 0, a: 'safety:goggles' }, ...neededFor(task).map((a) => ({ t: 0, a: `collect:${a.id}` })), { t: 0, a: 'burner-on' }];
  const first = { A: 'A', W: 'W', P: 'P' } as const;
  if (task === 'SOAP') s.soap = [{ a: 'OIL', n: 0 }, { a: 'NAOH', n: 0 }, { a: 'BOIL', n: 300 }];
  else {
    const sample = task === 'GROUPS' ? first.A : task === 'CARBS' ? first.W : first.P;
    const test = task === 'GROUPS' ? 'BROMINE' : task === 'CARBS' ? 'BENEDICT' : 'BIURET';
    s.tests = [{ sample, test, steps: task === 'PROTEINS' ? ['NAOH', 'CUSO4'] : [], heat: task === 'CARBS' ? 300 : 0, direct: false, boil: 0, portions: [], drops: task === 'PROTEINS' ? 2 : 0 }];
    s.table = [emptyOrgRecord()];
  }
  return s;
}

export function learnConfig(task: OrgTask): LearnConfig {
  const items: LearnConfig['items'] =
    task === 'SOAP'
      ? [
          { match: /beaker/i, id: 'beaker', spot: spotOf(OSPOT.soap, 0.28, 0.55, 0.35) },
          { match: /bunsen|tripod|gauze/i, id: 'beaker', spot: spotOf(OSPOT.soap, 0.12, 0.6, 0.2) },
          { match: /glass rod/i, id: 'rod', spot: spotOf(OSPOT.rod, 0.02, 0.4, 0.6) },
          { match: /filter/i, id: 'funnel', spot: spotOf(OSPOT.funnel, 0.1, 0.45, 0.3) },
          { match: /measuring cylinder/i, id: 'cylinder', spot: spotOf(OSPOT.cylinder, 0.08, 0.45, 0.3) },
          { match: /balance/i, id: 'balance', spot: spotOf(OSPOT.balance, 0.04, 0.42, 0.55) },
        ]
      : [
          { match: /test.?tube|rack/i, id: 'rack', spot: spotOf(OSPOT.rack, 0.07, 0.5, 0.35, 0.5) },
          { match: /water bath/i, id: 'bath', spot: spotOf(OSPOT.bath, 0.2, 0.6, 0.25) },
          { match: /bunsen/i, id: 'bath', spot: spotOf(OSPOT.bath, 0.08, 0.55, 0.2) },
          { match: /dropper/i, id: task === 'GROUPS' ? 'bottle:BROMINE' : task === 'CARBS' ? 'bottle:BENEDICT' : 'bottle:NAOH', spot: spotOf(OSPOT.reagents, 0.05, 0.62, 0.4) },
          { match: /splint/i, id: 'gasKit', spot: spotOf(OSPOT.gasKit, 0.02, 0.4, 0.55) },
        ];
  return {
    items,
    explain: orgExplainer,
    procedure:
      task === 'SOAP'
        ? [
            { spot: spotOf(OSPOT.soapBottles, 0.08, 0.6, 0.3), point: 'soapbottle:OIL' },
            { spot: spotOf(OSPOT.soap, 0.28, 0.55, 0.3), point: 'beaker' },
          ]
        : [
            { spot: spotOf(sampleSpot(1), 0.06, 0.62, 0.35), point: `sample:${task === 'GROUPS' ? 'A' : task === 'CARBS' ? 'W' : 'P'}` },
            { spot: spotOf(OSPOT.bath, 0.2, 0.6, 0.25), point: 'bath' },
          ],
    observe: task === 'SOAP' ? { spot: spotOf(OSPOT.soap, 0.3, 0.45, 0.3), point: 'beaker' } : task === 'CARBS' ? { spot: spotOf(OSPOT.bath, 0.22, 0.45, 0.2), point: 'tube' } : { spot: spotOf(OSPOT.tube, 0.08, 0.4, 0.16), point: 'tube' },
    observeTitle: 'What you should see',
  };
}

export function orgSafety(task: OrgTask): SafetyContent {
  const right: Hazard = task === 'GROUPS' ? 'flame' : 'corrosive';
  const icons = (['flame', 'corrosive', 'toxic', 'harmful'] as Hazard[]).map((k) => ({
    label: <HazardIcon kind={k} />,
    aria: k,
    right: k === right,
    why: k === right ? (right === 'flame' ? 'Right: flammable. Hexene, hexane, ethanol and kerosene catch fire easily — no flames near them.' : 'Right: corrosive. Sodium hydroxide and concentrated acids burn skin and eyes.') : `That is ${k === 'flame' ? 'flammable' : k === 'corrosive' ? 'corrosive' : k === 'toxic' ? 'toxic (bromine water, Millon’s reagent)' : 'harmful or irritant'}. ${right === 'flame' ? 'Flammable is the flame.' : 'Corrosive is the hand and the bench being eaten away.'}`,
  }));
  return {
    cards: [
      { icon: <Glasses className="size-6" />, title: 'Protect yourself', lines: ['Goggles on the whole time; lab coat buttoned.', 'Wash any splash of alkali or acid off your skin at once with plenty of water.'], lessonMatch: /goggle|eye|skin/i },
      task === 'SOAP'
        ? { icon: <Flame className="size-6" />, title: 'Hot sodium hydroxide', lines: ['Hot NaOH is very corrosive and spits: boil gently, stir all the time.', 'Never leave it unattended; keep the volume up with water so it cannot boil dry.'], lessonMatch: /spit|unattended|stir/i }
        : { icon: <Flame className="size-6" />, title: 'No flames near organic liquids', lines: ['Organic liquids are flammable: warm them only in the water bath.', 'Point a warm tube away from yourself and others.'], lessonMatch: /flammable|water bath|flame/i },
      { icon: <TriangleAlert className="size-6" />, title: 'Teacher-only reagents', lines: task === 'PROTEINS' ? ['Millon’s reagent contains mercury and concentrated HNO₃ is very corrosive: the teacher adds them.', 'Ninhydrin stains skin purple.'] : task === 'GROUPS' ? ['Sodium reacts violently with water: the teacher adds a tiny piece.', 'Conc. H₂SO₄ is added by the teacher. Bromine water is toxic.'] : ['Fehling’s B and NaOH are corrosive.', 'Dilute HCl: wipe up spills.'], lessonMatch: /teacher|sodium|mercury|toxic|corrosive/i },
      { icon: <Wind className="size-6" />, title: 'Smells', lines: ['Never sniff directly: waft a little vapour towards your nose with your hand.'], lessonMatch: /smell|waft/i },
    ],
    questions: [
      { q: task === 'GROUPS' ? 'Hexane carries this warning. Tap the symbol that means FLAMMABLE.' : 'Sodium hydroxide carries this warning. Tap the symbol that means CORROSIVE.', grid: true, options: icons },
      task === 'SOAP'
        ? {
            q: 'The soap mixture is boiling. What do you do?',
            options: [
              { label: 'Leave it to boil while I fetch the brine', aria: 'leave', right: false, why: 'Never leave it: it can boil dry, char and spit hot alkali.' },
              { label: 'Stir it all the time and add water when the level drops', aria: 'stir', right: true, why: 'Right: stirring stops spitting; water stops it boiling dry.' },
            ],
          }
        : {
            q: 'How do you warm ethanol with acidified dichromate?',
            options: [
              { label: 'Directly in the Bunsen flame', aria: 'flame', right: false, why: 'Ethanol vapour catches fire.' },
              { label: 'Stand the tube in a beaker of hot water (a water bath)', aria: 'bath', right: true, why: 'Right: no flame touches the flammable liquid.' },
            ],
          },
      {
        q: 'How do you smell the ester?',
        options: [
          { label: 'Put my nose over the beaker and sniff', aria: 'sniff', right: false, why: 'Vapours can irritate the nose and lungs.' },
          { label: 'Waft a little towards my nose with my hand', aria: 'waft', right: true, why: 'Right: wafting brings only a little vapour.' },
        ],
      },
    ],
  };
}

export const orgTour = (task: OrgTask) => defaultTourSteps({ focusId: task === 'SOAP' ? 'beaker' : 'tube', focusLabel: task === 'SOAP' ? 'Beaker' : 'Test tube' });

export const ORG_ASK: Record<OrgTask, AskSuggestions> = {
  GROUPS: {
    LEARN: ['Why does bromine water go colourless with an alkene?', 'Why is ethanol warmed in a water bath?', 'What gas does sodium give with ethanol?', 'What is an ester?'],
    DEMO: ['Why does the dichromate turn green?', 'Why pour the ester into water?', 'Why does an alkane not decolourise bromine?', 'What does the conc. H₂SO₄ do?'],
    TRY: ['How do I write a good observation?', 'What should my inference say?', 'How do I work out the percentage yield?', 'What precautions can I write?'],
    SANDBOX: ['What would kerosene do with bromine water?', 'Does propan-1-ol behave like ethanol?', 'Why does ethanoic acid fizz with NaHCO₃?', 'Which ester forms from ethanol and ethanoic acid?'],
  },
  CARBS: {
    LEARN: ['What is a reducing sugar?', 'Why heat Benedict’s in a water bath?', 'Why does sucrose need acid hydrolysis?', 'Why is the iodine test done cold?'],
    DEMO: ['Why does the colour change while it heats?', 'Why neutralise the acid?', 'Why do the iodine portions change colour?', 'How do Benedict’s colours show how much sugar?'],
    TRY: ['How do I write a good observation?', 'What should my inference say?', 'How do I work out the concentration?', 'What precautions can I write?'],
    SANDBOX: ['What does orange juice contain?', 'Why does bread give a faint Benedict’s result?', 'How long does starch take to hydrolyse?', 'Is honey a reducing sugar?'],
  },
  PROTEINS: {
    LEARN: ['What does the Biuret test detect?', 'Why add CuSO₄ drop by drop?', 'Why use water as a control?', 'Why does egg white set when heated?'],
    DEMO: ['Why does the xanthoproteic test turn yellow?', 'Why does ammonia turn it orange?', 'What does Millon’s reagent show?', 'Why does milk not coagulate?'],
    TRY: ['How do I write a good observation?', 'What should my inference say?', 'How do I work out % nitrogen?', 'What precautions can I write?'],
    SANDBOX: ['Does glucose give a Biuret colour?', 'Which foods are rich in protein?', 'What is a peptide bond?', 'What denatures a protein?'],
  },
  SOAP: {
    LEARN: ['What is saponification?', 'Why stir continuously?', 'Why is brine added?', 'What is the by-product?'],
    DEMO: ['Why does the mixture become creamy?', 'Why add water while boiling?', 'Why wash the soap?', 'Why does hard water form scum?'],
    TRY: ['How do I work out the theoretical mass?', 'How do I work out the % yield?', 'What should my inference say?', 'What precautions can I write?'],
    SANDBOX: ['What happens if I boil it for only 5 minutes?', 'What if I never stir?', 'What if it boils dry?', 'How is soap different from a detergent?'],
  },
};
