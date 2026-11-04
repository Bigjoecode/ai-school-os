import { emptyChemPrepState, prepEv, type ChemPrepState, type PrepTask } from '@aischool/shared';
import { Flame, Glasses, TriangleAlert, Wind } from 'lucide-react';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import { HazardIcon, type Hazard, type SafetyContent } from '../../../lab3d-kit/safety';
import { defaultTourSteps } from '../../../lab3d-kit/tour';
import { PSPOT, reagentSpot, spotOf } from './bench';
import { neededFor } from './scene-state';

/** The texts: "What is this?" cards, safety briefing, Learn, tour and Ask suggestions. */

const E: Record<string, Explainer> = {
  coat: { name: 'Lab coat', purpose: 'Protects your skin and clothes from splashes.', how: 'Wear it buttoned for the whole practical.', mistake: 'Leaving it open.', keys: [] },
  goggles: { name: 'Safety goggles', purpose: 'Protect your eyes from splashes, spitting and fumes.', how: 'Wear them the whole time.', mistake: 'Pushing them up onto your forehead.', keys: ['goggles', 'eyes'] },
  balance: { name: 'Electronic balance (0.01 g)', purpose: 'Weighs to the nearest 0.01 g.', how: 'Record the reading exactly as shown, with both decimal places.', mistake: 'Weighing a hot dish: rising air makes it read low.', keys: ['balance', 'weigh', 'mass'] },
  bottle: { name: 'Weighing bottle', purpose: 'Holds the solid for weighing by difference.', how: 'Weigh it with the solid, tip the solid out, reweigh: the difference is what you transferred.', mistake: 'Adding more solid after weighing.', keys: ['weigh', 'difference', 'bottle'] },
  stockJar: { name: 'Anhydrous Na₂CO₃', purpose: 'A primary standard: pure, stable, not hygroscopic, soluble.', how: 'A spatula at a time into the weighing bottle.', mistake: 'Using the hydrated (washing soda) crystals: their mass is not all Na₂CO₃.', keys: ['na₂co₃', 'standard', 'primary'] },
  beaker: { name: 'Beaker and glass rod', purpose: 'The solid is dissolved here first, with stirring.', how: 'About 100 cm³ of distilled water; stir until every crystal dissolves.', mistake: 'Dissolving straight in the volumetric flask.', keys: ['dissolve', 'beaker', 'stir'] },
  washBottle: { name: 'Wash bottle and dropper', purpose: 'Rinsing everything into the flask, and making up to the mark.', how: 'Rinse beaker, rod and funnel 2–3 times; add the last water a drop at a time.', mistake: 'Squirting fast near the mark and overshooting.', keys: ['rinse', 'rinsings', 'dropwise'] },
  flask: { name: '250 cm³ volumetric flask', purpose: 'Contains exactly 250.0 cm³ when the bottom of the meniscus is on the mark.', how: 'Fill near the mark, add the last drops with a dropper, read at eye level, stopper and invert.', mistake: 'Reading from above: parallax puts the meniscus in the wrong place.', keys: ['volumetric', 'mark', 'meniscus', 'invert'] },
  flask2: { name: 'Second volumetric flask', purpose: 'The 25.0 cm³ portion is diluted to 250 cm³ here (a tenfold dilution).', how: 'Make up to the mark exactly like the first.', mistake: 'Forgetting to invert it.', keys: ['dilution', 'mark'] },
  pipette: { name: '25.0 cm³ pipette and filler', purpose: 'Delivers exactly 25.0 cm³.', how: 'Rinse with water, then with the solution; fill with the filler to the mark; let it drain, touching the tip on the glass.', mistake: 'Sucking by mouth; rinsing only with water.', keys: ['pipette', 'filler'] },
  funnel: { name: 'Funnel', purpose: 'Pours the solution into the narrow neck without loss (or filters sand from sea water).', how: 'Rinse it into the flask as well.', mistake: 'Leaving solution in the funnel.', keys: ['funnel', 'filter'] },
  stock: { name: 'Fe³⁺/SCN⁻ mixture', purpose: 'The equilibrium mixture: Fe³⁺ + SCN⁻ ⇌ FeSCN²⁺ (blood-red).', how: 'A few drops of each in about 20 cm³ of water: pale red.', mistake: 'Too concentrated: every tube looks the same deep red.', keys: ['fecl', 'kscn', 'dilute'] },
  rack: { name: 'Test tubes and rack', purpose: 'One clean tube for each test, kept in order.', how: 'Equal volumes in each tube; keep a control.', mistake: 'Re-using a dirty tube.', keys: ['test tube', 'control'] },
  tube: { name: 'The tube in use', purpose: 'Where you see the result.', how: 'Hold it against the white tile beside the control.', mistake: 'Judging colours with no control.', keys: ['control', 'colour', 'white'] },
  tile: { name: 'White tile', purpose: 'A white background for comparing colours.', how: 'Hold the tube and the control side by side against it.', mistake: 'Comparing against a dark bench.', keys: ['white'] },
  hot: { name: 'Hot water bath', purpose: 'Warms a tube to about 70 °C.', how: 'Leave the tube in for at least a minute.', mistake: 'Judging before it has warmed.', keys: ['hot', 'temperature'] },
  ice: { name: 'Iced water', purpose: 'Cools a tube to near 0 °C.', how: 'Leave it a minute, then compare.', mistake: 'Taking it out too soon.', keys: ['ice', 'temperature'] },
  reagent: { name: 'Reagent dropper bottle', purpose: 'Adds one reagent to the tube in use.', how: 'A few drops; shake gently.', mistake: 'Too much: the colour is diluted or masked.', keys: ['drops', 'reagent', 'chlorine', 'bromine', 'iodine', 'hexane', 'starch'] },
  halide: { name: 'Halide solution', purpose: 'KCl, KBr or KI: the halide ions a halogen may displace.', how: '2 cm³ in a clean tube.', mistake: 'Mixing up the bottles.', keys: ['kcl', 'kbr', 'ki', 'halide'] },
  dish: { name: 'Evaporating dish on tripod', purpose: 'The 50.0 cm³ of sea water is evaporated to dryness in it.', how: 'Heat until nearly dry, then finish on the water bath; cool; weigh to constant mass.', mistake: 'Strong heat at the end: the salt spits out.', keys: ['evaporat', 'dish', 'spit', 'dry'] },
  seawater: { name: 'Sea water', purpose: 'Salty water with sand.', how: 'Filter it first.', mistake: 'Weighing the sand with the salt.', keys: ['sea water', 'filter'] },
  dflask: { name: 'Distillation flask', purpose: 'Holds the boiling sea water.', how: 'No more than half full, with anti-bumping granules; heat gently.', mistake: 'Boiling it dry.', keys: ['anti-bumping', 'granule', 'flask'] },
  thermometer: { name: 'Thermometer', purpose: 'Reads the temperature of the vapour distilling over.', how: 'Bulb level with the side arm; read to 0.5 °C.', mistake: 'Bulb in the liquid.', keys: ['thermometer', 'side arm'] },
  condenser: { name: 'Liebig condenser', purpose: 'Cools the steam back to liquid water.', how: 'Water in at the bottom, out at the top, running all the time.', mistake: 'Water in at the top: the jacket never fills.', keys: ['condenser', 'water enters', 'bottom'] },
  receiver: { name: 'Receiver', purpose: 'Collects the distillate.', how: 'Open to the air.', mistake: 'Stoppered: a closed apparatus must never be heated.', keys: ['receiver', 'closed'] },
  mortar: { name: 'The two solids', purpose: 'NH₄Cl and Ca(OH)₂, mixed well.', how: 'About 1 : 1 by mass.', mistake: 'Not mixing them.', keys: ['nh₄cl', 'ca(oh)'] },
  gtube: { name: 'Hard-glass tube on a clamp stand', purpose: 'The mixture is heated in it.', how: 'Clamp it with the mouth sloping slightly down; heat gently.', mistake: 'Mouth up: condensed water runs back and cracks the hot glass.', keys: ['slop', 'tube', 'clamp'] },
  dryer: { name: 'Drying tower', purpose: 'Dries the ammonia.', how: 'Quicklime (CaO) only.', mistake: 'Conc. H₂SO₄ or CaCl₂: both react with ammonia.', keys: ['quicklime', 'dry', 'cao'] },
  jar: { name: 'Gas jar', purpose: 'Collects the ammonia.', how: 'Inverted (upward delivery): ammonia is less dense than air.', mistake: 'Collecting over water: it dissolves.', keys: ['upward', 'jar', 'collect'] },
  testKit: { name: 'Litmus and conc. HCl', purpose: 'The tests for ammonia.', how: 'Damp red litmus turns blue; HCl gives dense white fumes of NH₄Cl.', mistake: 'Using dry litmus: ammonia needs water to act as an alkali.', keys: ['litmus', 'hcl', 'fumes'] },
  trough: { name: 'Fountain apparatus', purpose: 'Shows how very soluble ammonia is.', how: 'A dry flask of ammonia, inverted, with a jet tube into water with phenolphthalein; squeeze in a drop.', mistake: 'A damp flask: the ammonia has already dissolved.', keys: ['fountain', 'soluble'] },
  card: { name: 'Task card', purpose: 'The question paper.', how: 'Read it first and again before you hand in.', mistake: 'Missing a part of the question.', keys: [] },
  book: { name: 'Practical notebook', purpose: 'Your record — this is what is marked.', how: 'Observations, readings, calculation and answers.', mistake: 'Writing the inference where the observation goes.', keys: ['record'] },
  chromate: { name: 'Potassium chromate(VI)', purpose: 'Yellow CrO₄²⁻: with acid it forms orange Cr₂O₇²⁻.', how: 'A few cm³ in a tube.', mistake: 'Skin contact: it is toxic.', keys: ['chromate', 'toxic'] },
  fume: { name: 'Fume cupboard', purpose: 'Where toxic gases are handled.', how: 'Chlorine, bromine and ammonia near it or an open window.', mistake: 'Breathing the fumes.', keys: ['fume'] },
  extinguisher: { name: 'Fire extinguisher', purpose: 'Puts out small fires.', how: 'Tell the teacher first; aim at the base.', mistake: 'Not knowing where it is.', keys: [] },
  firstaid: { name: 'First-aid box', purpose: 'Dressings for burns and splashes.', how: 'Cool a burn under running water and tell the teacher.', mistake: 'Hiding a burn.', keys: [] },
  eyewash: { name: 'Eye-wash station', purpose: 'Rinses chemicals out of the eyes.', how: 'Rinse for at least 10 minutes.', mistake: 'Rubbing the eye.', keys: ['eyes'] },
  burette: { name: 'Burette', purpose: 'For titrations.', how: 'Not needed here.', mistake: 'Cluttering the bench.', keys: [] },
  cylinder: { name: 'Measuring cylinder', purpose: 'Rough volumes.', how: 'Not accurate enough for a standard solution.', mistake: 'Using it instead of the pipette.', keys: [] },
};
export const prepExplainer = makeExplainer(E, { 'reagent:': 'reagent', 'halide:': 'halide' });

/** The bench as Mrs Ada sets it out for Learn (display only, never saved). */
export function learnState(task: PrepTask): ChemPrepState {
  const s = emptyChemPrepState();
  s.task = task;
  s.log = [{ t: 0, a: 'safety:coat' }, { t: 0, a: 'safety:goggles' }, ...neededFor(task).map((a) => ({ t: 0, a: `collect:${a.id}` }))];
  const E2 = prepEv;
  s.events =
    task === 'STANDARD'
      ? [E2('SCOOP', 'BIG'), E2('SCOOP', 'BIG'), E2('SCOOP', 'BIG'), E2('SCOOP', 'BIG'), E2('WEIGH1')]
      : task === 'LECHAT'
        ? [E2('STOCK', 'DILUTE'), E2('TUBE', 'FESCN'), E2('TUBE', 'FESCN'), E2('ADD', 'FECL3', 1)]
        : task === 'DISTIL'
          ? [E2('FILL_FLASK'), E2('CHIPS'), E2('THERMO', 'SIDEARM'), E2('CONDENSER', 'BOTTOM'), E2('WATER_ON'), E2('RECEIVER', 'OPEN')]
          : task === 'HALOGEN'
            ? [E2('TUBE', 'KBR'), E2('ADD', 'CL2', 0), E2('SHAKE', '', 0), E2('ADD', 'HEXANE', 0), E2('SHAKE', '', 0)]
            : [E2('WEIGH_NH4CL'), E2('WEIGH_CAOH2'), E2('MIXSOLID'), E2('LOAD'), E2('CLAMP', 'DOWN'), E2('DRYER', 'CAO'), E2('COLLECT', 'UPWARD')];
  return s;
}

export function learnConfig(task: PrepTask): LearnConfig {
  const items: LearnConfig['items'] =
    task === 'STANDARD'
      ? [
          { match: /volumetric/i, id: 'flask', spot: spotOf(PSPOT.flask, 0.15, 0.45, 0.1) },
          { match: /balance/i, id: 'balance', spot: spotOf(PSPOT.balance, 0.05, 0.42, 0.5) },
          { match: /weighing bottle/i, id: 'bottle', spot: spotOf(PSPOT.bottle, 0.04, 0.4, 0.45) },
          { match: /beaker|glass rod/i, id: 'beaker', spot: spotOf(PSPOT.beaker, 0.06, 0.45, 0.35) },
          { match: /funnel/i, id: 'flask', spot: spotOf(PSPOT.flask, 0.2, 0.45, 0.2) },
          { match: /wash bottle|dropper/i, id: 'washBottle', spot: spotOf(PSPOT.washBottle, 0.08, 0.45, 0.3) },
          { match: /pipette/i, id: 'pipette', spot: spotOf(PSPOT.pipette, 0.03, 0.5, 0.5) },
        ]
      : task === 'LECHAT'
        ? [
            { match: /test tube|rack/i, id: 'rack', spot: spotOf(PSPOT.rack, 0.08, 0.5, 0.35) },
            { match: /dropper/i, id: 'reagent:FECL3', spot: spotOf(reagentSpot(1), 0.05, 0.6, 0.4) },
            { match: /hot|iced/i, id: 'hot', spot: spotOf(PSPOT.hot, 0.08, 0.55, 0.3) },
          ]
        : task === 'DISTIL'
          ? [
              { match: /evaporating dish|tripod|bunsen/i, id: 'dish', spot: spotOf(PSPOT.dish, 0.2, 0.5, 0.4) },
              { match: /distillation flask|thermometer/i, id: 'thermometer', spot: spotOf(PSPOT.rig, 0.4, 0.35, 0.05) },
              { match: /liebig|condenser/i, id: 'condenser', spot: spotOf([PSPOT.rig[0] + 0.2, 0, PSPOT.rig[2]], 0.28, 0.6, 0.15) },
              { match: /receiver/i, id: 'receiver', spot: spotOf([PSPOT.rig[0] + 0.4, 0, PSPOT.rig[2]], 0.07, 0.4, 0.3) },
              { match: /anti-bumping/i, id: 'dflask', spot: spotOf(PSPOT.rig, 0.22, 0.4, 0.2) },
              { match: /balance/i, id: 'balance', spot: spotOf(PSPOT.dbalance, 0.05, 0.42, 0.5) },
            ]
          : task === 'HALOGEN'
            ? [
                { match: /test tube|rack/i, id: 'rack', spot: spotOf(PSPOT.rack, 0.08, 0.5, 0.35) },
                { match: /dropper/i, id: 'reagent:BR2', spot: spotOf(reagentSpot(2), 0.05, 0.6, 0.4) },
              ]
            : [
                { match: /hard-glass|bung|delivery/i, id: 'gtube', spot: spotOf(PSPOT.gasRig, 0.2, 0.6, 0.2) },
                { match: /drying|quicklime/i, id: 'dryer', spot: spotOf(PSPOT.dryer, 0.1, 0.45, 0.2) },
                { match: /gas jar/i, id: 'jar', spot: spotOf(PSPOT.jar, 0.12, 0.45, 0.2) },
                { match: /bunsen/i, id: 'gtube', spot: spotOf(PSPOT.gasRig, 0.05, 0.5, 0.2) },
                { match: /trough|fountain/i, id: 'trough', spot: spotOf(PSPOT.trough, 0.2, 0.6, 0.2) },
              ];
  const PP: Record<PrepTask, LearnConfig['procedure']> = {
    STANDARD: [{ spot: spotOf(PSPOT.balance, 0.05, 0.5, 0.45), point: 'balance' }, { spot: spotOf(PSPOT.flask, 0.17, 0.4, 0.05), point: 'flask' }],
    LECHAT: [{ spot: spotOf(PSPOT.stock, 0.06, 0.6, 0.35), point: 'stock' }, { spot: spotOf(PSPOT.tube, 0.09, 0.42, 0.16), point: 'tube' }],
    DISTIL: [{ spot: spotOf(PSPOT.dish, 0.2, 0.5, 0.4), point: 'dish' }, { spot: spotOf([PSPOT.rig[0] + 0.17, 0, PSPOT.rig[2]], 0.25, 0.85, 0.15), point: 'condenser' }],
    HALOGEN: [{ spot: spotOf(PSPOT.reagents, 0.05, 0.7, 0.4), point: 'reagent:CL2' }, { spot: spotOf(PSPOT.tube, 0.09, 0.42, 0.16), point: 'tube' }],
    AMMONIA: [{ spot: spotOf(PSPOT.gasRig, 0.2, 0.8, 0.2), point: 'gtube' }, { spot: spotOf(PSPOT.jar, 0.12, 0.5, 0.2), point: 'jar' }],
  };
  const P = PP[task];
  const obs = { STANDARD: { spot: spotOf(PSPOT.flask, 0.17, 0.36, 0.05), point: 'flask' }, LECHAT: { spot: spotOf(PSPOT.tube, 0.09, 0.42, 0.16), point: 'tube' }, DISTIL: { spot: spotOf(PSPOT.rig, 0.42, 0.35, 0.02), point: 'thermometer' }, HALOGEN: { spot: spotOf(PSPOT.tube, 0.09, 0.42, 0.16), point: 'tube' }, AMMONIA: { spot: spotOf(PSPOT.jar, 0.12, 0.45, 0.2), point: 'jar' } }[task];
  return { items, explain: prepExplainer, procedure: P, observe: obs, observeTitle: 'What you should see' };
}

export function prepSafety(task: PrepTask): SafetyContent {
  const right: Hazard = task === 'LECHAT' || task === 'HALOGEN' ? 'toxic' : task === 'AMMONIA' ? 'harmful' : task === 'DISTIL' ? 'flame' : 'harmful';
  const word: Record<Hazard, string> = { flame: 'flammable / heat', corrosive: 'corrosive', toxic: 'toxic', harmful: 'harmful or irritant' } as Record<Hazard, string>;
  const icons = (['flame', 'corrosive', 'toxic', 'harmful'] as Hazard[]).map((k) => ({
    label: <HazardIcon kind={k} />,
    aria: k,
    right: k === right,
    why: k === right ? `Right: ${word[k]}.` : `That is ${word[k]}. Look again at the warning on the label.`,
  }));
  const hazardQ = { STANDARD: 'Sodium carbonate dust irritates the eyes. Tap the symbol that means HARMFUL / IRRITANT.', LECHAT: 'Potassium chromate(VI) carries this warning. Tap the symbol that means TOXIC.', DISTIL: 'A lit Bunsen burner heats the flask. Tap the FLAME symbol.', HALOGEN: 'Chlorine and bromine water carry this warning. Tap the symbol that means TOXIC.', AMMONIA: 'Ammonia irritates the eyes and lungs. Tap the symbol that means HARMFUL / IRRITANT.' }[task];
  const second = {
    STANDARD: { q: 'How do you fill the pipette?', options: [{ label: 'Suck it up by mouth', aria: 'mouth', right: false, why: 'Never: you could swallow the solution.' }, { label: 'With the pipette filler', aria: 'filler', right: true, why: 'Right: always use the filler.' }] },
    LECHAT: { q: 'Where does the chromate waste go?', options: [{ label: 'Down the sink', aria: 'sink', right: false, why: 'Chromium(VI) is toxic to living things.' }, { label: 'Into the residue bottle', aria: 'residue', right: true, why: 'Right.' }] },
    DISTIL: { q: 'The receiver at the end of the condenser should be', options: [{ label: 'Closed with a tight bung', aria: 'closed', right: false, why: 'Never heat a closed apparatus: the pressure builds up.' }, { label: 'Open to the air', aria: 'open', right: true, why: 'Right.' }] },
    HALOGEN: { q: 'Hexane is on your bench. What do you do with the Bunsen burner?', options: [{ label: 'Keep it lit nearby', aria: 'lit', right: false, why: 'Hexane vapour catches fire.' }, { label: 'Keep flames well away: none is needed', aria: 'away', right: true, why: 'Right.' }] },
    AMMONIA: { q: 'How do you clamp the tube of NH₄Cl and Ca(OH)₂?', options: [{ label: 'Mouth pointing up', aria: 'up', right: false, why: 'Condensed water runs back on to the hot glass and cracks it.' }, { label: 'Mouth sloping slightly down', aria: 'down', right: true, why: 'Right.' }] },
  }[task];
  return {
    cards: [
      { icon: <Glasses className="size-6" />, title: 'Protect yourself', lines: ['Goggles on the whole time; lab coat buttoned.', 'Wash any splash off your skin at once with plenty of water.'], lessonMatch: /goggle|eye|skin/i },
      { icon: <Flame className="size-6" />, title: task === 'STANDARD' ? 'Pipettes' : 'Heat and flames', lines: task === 'STANDARD' ? ['Always use a pipette filler.'] : task === 'HALOGEN' ? ['Hexane is flammable: no flames near it.'] : task === 'DISTIL' ? ['Never heat a closed apparatus.', 'Turn off the heat before the flask boils dry.'] : ['Heat gently; point the tube away from people.'], lessonMatch: /filler|flame|flammable|closed|boil|heat/i },
      { icon: <TriangleAlert className="size-6" />, title: 'Toxic and corrosive', lines: task === 'LECHAT' ? ['Chromate(VI) is toxic: avoid skin contact; residue bottle.'] : task === 'HALOGEN' ? ['Chlorine and bromine are toxic: dilute solutions, well-ventilated room.'] : task === 'AMMONIA' ? ['Conc. HCl is corrosive and fumes.'] : ['Report any spill to the teacher.'], lessonMatch: /toxic|corrosive|chromate|chlorine|bromine/i },
      { icon: <Wind className="size-6" />, title: 'Fumes and smells', lines: ['Waft gases towards your nose, never sniff directly.', 'Ammonia, chlorine and bromine: fume cupboard or an open window.'], lessonMatch: /fume|window|ventilat|smell/i },
    ],
    questions: [{ q: hazardQ, grid: true, options: icons }, second],
  };
}

const FOCUS: Record<PrepTask, [string, string]> = { STANDARD: ['flask', 'Volumetric flask'], LECHAT: ['tube', 'Test tube'], DISTIL: ['thermometer', 'Thermometer'], HALOGEN: ['tube', 'Test tube'], AMMONIA: ['jar', 'Gas jar'] };
export const prepTour = (task: PrepTask) => defaultTourSteps({ focusId: FOCUS[task][0], focusLabel: FOCUS[task][1] });

export const PREP_ASK: Record<PrepTask, AskSuggestions> = {
  STANDARD: {
    LEARN: ['What is a standard solution?', 'Why weigh by difference?', 'Why read the meniscus at eye level?', 'What makes a good primary standard?'],
    DEMO: ['Why rinse the beaker into the flask?', 'Why add the last water dropwise?', 'Why invert the flask?', 'Why rinse the pipette with the solution?'],
    TRY: ['How do I work out the concentration?', 'How do I use C₁V₁ = C₂V₂?', 'What should I write as observations?', 'What precautions can I write?'],
    SANDBOX: ['What if I overshoot the mark?', 'What if I do not rinse?', 'What if I use hydrated sodium carbonate?', 'Why is NaOH not a primary standard?'],
  },
  LECHAT: {
    LEARN: ['What is Le Chatelier’s principle?', 'Why use a very dilute mixture?', 'Why keep a control tube?', 'What does Kc tell us?'],
    DEMO: ['Why does FeCl₃ deepen the colour?', 'Why does NH₄Cl make it paler?', 'Why does heat make it paler?', 'Why does acid turn chromate orange?'],
    TRY: ['How do I write the observation?', 'Which way did it shift?', 'How do I calculate Kc?', 'What is the unit of Kc?'],
    SANDBOX: ['What does water do to the colour?', 'Does a catalyst shift the equilibrium?', 'What if the mixture is too concentrated?', 'How does this apply to the Haber process?'],
  },
  DISTIL: {
    LEARN: ['Why filter the sea water first?', 'Why finish on a water bath?', 'Why is the thermometer at the side arm?', 'Why does water enter the condenser at the bottom?'],
    DEMO: ['What are anti-bumping granules for?', 'Why weigh to constant mass?', 'Why must the receiver be open?', 'Why does the reading stay at 100 °C?'],
    TRY: ['How do I find the salt concentration?', 'What should I write as observations?', 'How do I show the distillate is pure?', 'What precautions can I write?'],
    SANDBOX: ['What if the bulb is in the liquid?', 'What if the water goes in at the top?', 'What if I heat the dish strongly to the end?', 'How does fractional distillation differ?'],
  },
  HALOGEN: {
    LEARN: ['Why does chlorine displace bromine?', 'Why add hexane?', 'Why use fresh chlorine water?', 'What colour is iodine in hexane?'],
    DEMO: ['Why does bromine not react with KCl?', 'How do I tell bromine from iodine?', 'What does starch show?', 'Why do I need control tubes?'],
    TRY: ['How do I write the ionic equation?', 'What is the order of reactivity?', 'How do I calculate the mass of iodine?', 'What precautions can I write?'],
    SANDBOX: ['What does old chlorine water do?', 'Would fluorine displace chlorine?', 'Why is iodine brown in water but violet in hexane?', 'What is the trend in oxidising power?'],
  },
  AMMONIA: {
    LEARN: ['Why is the tube sloped downwards?', 'Why dry ammonia with quicklime?', 'Why collect by upward delivery?', 'What does the fountain show?'],
    DEMO: ['Why do HCl fumes form?', 'Why must the litmus be damp?', 'Why does the fountain turn pink?', 'Why is Ca(OH)₂ in excess?'],
    TRY: ['How do I find the volume of ammonia?', 'How much Ca(OH)₂ is needed?', 'What should I write as observations?', 'What precautions can I write?'],
    SANDBOX: ['What if I dry it with conc. H₂SO₄?', 'What if I collect it over water?', 'What if the tube points up?', 'What are the uses of ammonia?'],
  },
};
