import { emptyChemQualitativeState, emptyQualRecord, type ChemQualitativeState } from '@aischool/shared';
import { Flame, Glasses, Wind } from 'lucide-react';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import type { SafetyContent } from '../../../lab3d-kit/safety';
import type { Spot } from '../../../lab3d-kit/store';
import { defaultTourSteps } from '../../../lab3d-kit/tour';
import { QSPOT } from './bench';
import { QUAL_APPARATUS } from './scene-state';

/** The qualitative-analysis lab's texts: "What is this?" cards, safety briefing, Learn, tour and Ask suggestions. */

const E: Record<string, Explainer> = {
  rack: { name: 'Test tubes and rack', purpose: 'Small-scale reactions: one test per clean tube.', how: 'Use a little sample (a spatula-tip of solid, about 2 cm³ of solution) and keep each tube in the rack in order.', mistake: 'Re-using a dirty tube, so the last test’s ions confuse the next one.', keys: ['test tube', 'rack'] },
  tube: { name: 'The test tube in use', purpose: 'Where you see the result: precipitates, colours, effervescence, fumes.', how: 'Add reagents a drop at a time and shake gently; look against a white background.', mistake: 'Adding the reagent in excess at once and missing the precipitate that forms first.', keys: ['drop', 'excess'] },
  holder: { name: 'Test-tube holder', purpose: 'Holds a tube safely while you heat it.', how: 'Grip near the mouth; heat gently, then strongly, pointing the tube away from everyone.', mistake: 'Holding a hot tube with fingers, or pointing it at someone.', keys: ['heat', 'point'] },
  burner: { name: 'Bunsen burner', purpose: 'Heats tubes and gives the flame for flame tests.', how: 'Light it with the air hole closed, then open it for a hot blue flame.', mistake: 'Leaving it burning with a yellow flame unattended.', keys: ['bunsen', 'flame'] },
  wire: { name: 'Nichrome wire', purpose: 'Flame tests for Na⁺, K⁺, Ca²⁺ and Cu²⁺.', how: 'Clean it in conc. HCl until it gives no colour, dip in the solid, hold in the edge of the flame.', mistake: 'A dirty wire: traces of sodium give a yellow flame for everything.', keys: ['flame test', 'wire'] },
  spatula: { name: 'Spatula', purpose: 'Takes a little of the solid.', how: 'A spatula-tip is enough for one test; wipe it between samples.', mistake: 'Using too much solid, so nothing dissolves.', keys: [] },
  gasKit: { name: 'Gas-test kit', purpose: 'Identifies the gas given off.', how: 'Damp litmus at the mouth of the tube; splints held just inside; bubble the gas through lime water.', mistake: 'Testing too late, after the gas has escaped.', keys: ['gas', 'litmus', 'splint', 'lime water'] },
  funnel: { name: 'Filter funnel and paper', purpose: 'Separates a mixture: the soluble salt goes through (filtrate), the insoluble one stays (residue).', how: 'Fold the paper in quarters, wet it with distilled water, pour slowly.', mistake: 'Testing the mixture without separating it.', keys: ['filter', 'residue', 'filtrate'] },
  washBottle: { name: 'Wash bottle', purpose: 'Distilled water for dissolving C and rinsing.', how: 'Squeeze to direct a jet of water.', mistake: 'Using tap water: its ions give false results (e.g. Cl⁻ with AgNO₃).', keys: ['distilled water'] },
  sample: { name: 'Sample C', purpose: 'The unknown salt (or mixture) you are identifying.', how: 'Note its colour and whether it dissolves in water before any other test.', mistake: 'Skipping the simple observations: colour and solubility are marked.', keys: [] },
  bottle: { name: 'Reagents', purpose: 'Each reagent gives a known result with particular ions.', how: 'Add in drops, observe, then in excess; warm only when the test says so.', mistake: 'Adding the wrong reagent to a solid that should be in solution.', keys: ['naoh', 'nh₃', 'agno₃', 'bacl₂', 'reagent'] },
  coat: { name: 'Lab coat', purpose: 'Protects your skin and clothes from splashes.', how: 'Wear it buttoned for the whole practical.', mistake: 'Leaving it open.', keys: [] },
  goggles: { name: 'Safety goggles', purpose: 'Protect your eyes from splashes and spurting hot liquid.', how: 'Wear them the whole time, especially when heating.', mistake: 'Pushing them up onto your forehead.', keys: ['goggles', 'eyes'] },
  fume: { name: 'Fume cupboard', purpose: 'Draws away harmful gases (SO₂, H₂S, NO₂, HCl).', how: 'Do those tests inside with the sash pulled down.', mistake: 'Making toxic gases at the open bench.', keys: ['fume cupboard'] },
  extinguisher: { name: 'Fire extinguisher', purpose: 'Puts out small fires.', how: 'Tell the teacher first; aim at the base of the fire.', mistake: 'Not knowing where it is when you are using a burner.', keys: [] },
  firstaid: { name: 'First-aid box', purpose: 'Dressings for small burns and cuts.', how: 'Cool a burn under running water and tell the teacher.', mistake: 'Hiding a burn.', keys: [] },
  eyewash: { name: 'Eye-wash station', purpose: 'Rinses chemicals out of the eyes.', how: 'Rinse for at least 10 minutes and tell the teacher.', mistake: 'Rubbing the eye.', keys: ['eyes'] },
  burette: { name: 'Burette', purpose: 'Measures volumes accurately in a titration.', how: 'Not needed for qualitative analysis.', mistake: 'Cluttering the bench with apparatus you do not need.', keys: [] },
  pipette: { name: 'Pipette', purpose: 'Measures a fixed volume in a titration.', how: 'Not needed for qualitative analysis.', mistake: 'Cluttering the bench.', keys: [] },
  thermometer: { name: 'Thermometer', purpose: 'Measures temperature.', how: 'Not needed here.', mistake: 'Using it to stir.', keys: [] },
};
export const qualExplainer = makeExplainer(E, { 'sample:': 'sample', 'bottle:': 'bottle' });

/**
 * The bench as Mrs Ada sets it out for Learn (display only, never saved): her
 * own salt (the demo's, never the student's) dissolved, and NaOH(aq) added in
 * drops, so the tube in the stand shows a precipitate.
 */
export const QUAL_LEARN_STATE: ChemQualitativeState = {
  ...emptyChemQualitativeState(),
  tests: [
    { sample: 'SOLID', reagent: 'WATER', steps: [], gasTests: [] },
    { sample: 'SOLUTION', reagent: 'NAOH', steps: [], gasTests: [] },
  ],
  table: [emptyQualRecord(), emptyQualRecord()],
  log: [...QUAL_APPARATUS.filter((a) => a.needed).map((a) => ({ t: 0, a: `collect:${a.id}` })), { t: 0, a: 'burner-on' }],
};
/** The tube in use while Learn shows the bench. */
export const QUAL_LEARN_ACTIVE = 1;

const spot = (p: readonly [number, number, number], y: number, dist: number, pitch = 0.3): Spot => ({ target: [p[0], y, p[2]], dist, pitch });
const ITEMS: [RegExp, string, Spot][] = [
  [/test.?tube|rack/i, 'rack', { ...spot(QSPOT.rack, 0.07, 0.5), yaw: 0.55 }],
  [/holder/i, 'holder', spot(QSPOT.holder, 0.02, 0.4, 0.55)],
  [/bunsen|burner/i, 'burner', spot(QSPOT.burner, 0.12, 0.55, 0.2)],
  [/dropper|reagent/i, 'bottle:NAOH', spot(QSPOT.reagents, 0.05, 0.6, 0.4)],
  [/spatula/i, 'spatula', spot(QSPOT.spatula, 0.01, 0.4, 0.6)],
  [/wire|nichrome/i, 'wire', spot(QSPOT.wire, 0.02, 0.4, 0.55)],
  [/litmus|splint|lime|paper/i, 'gasKit', spot(QSPOT.gasKit, 0.03, 0.45, 0.5)],
  [/filter|funnel/i, 'funnel', spot(QSPOT.samples, 0.06, 0.5)],
  [/wash bottle|distilled/i, 'washBottle', spot(QSPOT.washBottle, 0.08, 0.5)],
];
export const QUAL_LEARN: LearnConfig = {
  items: ITEMS.map(([match, id, s]) => ({ match, id, spot: s })),
  explain: (id) => qualExplainer(id),
  procedure: [
    { spot: spot(QSPOT.sampleC, 0.06, 0.6), point: 'sample:SOLID' },
    { spot: { ...spot(QSPOT.reagents, 0.05, 0.7, 0.35), yaw: -0.3 }, point: 'bottle:NAOH' },
  ],
  observe: { spot: spot(QSPOT.tube, 0.08, 0.4, 0.16), point: 'tube' },
  observeTitle: 'What you should see',
  dataCard: { kicker: 'Recording results', title: 'How the table is written', speech: 'Here is how each test, observation and inference is written in the table.' },
};

export const QUAL_SAFETY: SafetyContent = {
  cards: [
    { icon: <Glasses className="size-6" />, title: 'Protect yourself', lines: ['Wear your safety goggles over your eyes the whole time.', 'Wear your lab coat, buttoned. Tie back long hair near the Bunsen burner.'], lessonMatch: /goggles|eyes/i },
    { icon: <Flame className="size-6" />, title: 'Heating safely', lines: ['Hold a hot tube in a test-tube holder, near its mouth.', 'Heat gently at first, then strongly — and point the tube away from yourself and others.'], lessonMatch: /heat|point/i },
    { icon: <Wind className="size-6" />, title: 'Gases', lines: ['Smell a gas only by wafting it towards your nose with your hand.', 'Do tests that give SO₂, H₂S, NO₂ or HCl in the fume cupboard.'], lessonMatch: /fume|waft|smell/i },
  ],
  questions: [
    {
      q: 'You are heating a solid in a test tube. Where should the mouth of the tube point?',
      options: [
        { label: 'Towards me, so I can see inside', aria: 'towards me', right: false, why: 'Hot solid or liquid can spurt out of the tube — straight into your face.' },
        { label: 'Away from me and from everyone else', aria: 'away', right: true, why: 'Right: if anything spurts out, it hits no one.' },
        { label: 'Straight up, held in my fingers', aria: 'fingers', right: false, why: 'The glass gets far too hot to hold: use a test-tube holder.' },
      ],
    },
    {
      q: 'How do you find out whether a gas has a smell?',
      options: [
        { label: 'Put my nose over the tube and sniff', aria: 'sniff', right: false, why: 'Never: many gases are toxic or burn the nose and lungs.' },
        { label: 'Waft a little towards my nose with my hand', aria: 'waft', right: true, why: 'Right: wafting brings only a little of the gas to your nose.' },
      ],
    },
    {
      q: 'A test will give off hydrogen sulphide (H₂S). Where do you do it?',
      options: [
        { label: 'At my bench, quickly', aria: 'bench', right: false, why: 'H₂S is toxic: it must not be made at the open bench.' },
        { label: 'In the fume cupboard, sash down', aria: 'fume', right: true, why: 'Right: the fume cupboard draws the gas away from you.' },
        { label: 'Near an open window', aria: 'window', right: false, why: 'Better than nothing, but the fume cupboard is the safe place in the lab.' },
      ],
    },
  ],
};

export const QUAL_TOUR = defaultTourSteps({ focusId: 'tube', focusLabel: 'Test tube' });

export const QUAL_ASK: AskSuggestions = {
  LEARN: ['Why add NaOH(aq) dropwise and then in excess?', 'Why waft gases instead of smelling them?', 'What does it mean if a precipitate dissolves in excess?', 'Why heat the solid in a dry test tube?'],
  DEMO: ['Why add the reagent drop by drop first?', 'Why is NH₃(aq) used as well as NaOH(aq)?', 'How do you tell Zn²⁺ from Al³⁺?', 'Why use the fume cupboard for some tests?'],
  TRY: ['How do I write a good observation?', 'What should my inference say?', 'Which test confirms the anion?', 'How do I write an ionic equation?'],
  SANDBOX: ['What would happen with a copper salt?', 'Why do some salts change colour on heating?', 'Which salts give off NH₃?', 'How does a flame test work?'],
};
