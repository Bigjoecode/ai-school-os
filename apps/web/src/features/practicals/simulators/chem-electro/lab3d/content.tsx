import { emptyChemElectroState, type ChemElectroState, type ElectroTask } from '@aischool/shared';
import { Flame, Glasses, Hand, Thermometer, Zap } from 'lucide-react';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import { HazardIcon, type Hazard, type SafetyContent } from '../../../lab3d-kit/safety';
import type { Spot } from '../../../lab3d-kit/store';
import { NEEDED } from './scene-state';
import { SPOT } from './views';

/** The electrochemistry lab's "What is this?" cards, Learn stage, Ask suggestions and the door briefing. */

const E: Record<string, Explainer> = {
  voltameter: { name: 'Voltameter (beaker of CuSO₄)', purpose: 'The electrolytic cell: two copper plates in copper(II) sulphate solution.', how: 'Clip the plates on opposite sides, apart, so the current flows through the solution.', mistake: 'Letting the plates touch: a short circuit.', keys: ['electrode', 'apart', 'touch'] },
  plates: { name: 'Copper plates', purpose: 'The electrodes: the cathode (to −) gains copper, the anode (to +) dissolves.', how: 'Clean with sandpaper, wash, dry, then weigh. Rinse gently afterwards.', mistake: 'Rubbing the soft new copper off the cathode.', keys: ['electrode', 'sandpaper', 'wash', 'dried'] },
  sandpaper: { name: 'Sandpaper', purpose: 'Removes the oxide film from metal surfaces.', how: 'Rub until bright, then wash and dry — before weighing.', mistake: 'Sanding after weighing.', keys: ['sandpaper', 'clean'] },
  supply: { name: 'd.c. supply (6 V)', purpose: 'Drives the current: electrons leave the − terminal.', how: 'Red (+) to the anode, black (−) to the cathode through the key.', mistake: 'The cathode on +.', keys: ['supply', 'battery'] },
  ammeter: { name: 'Ammeter (0–1 A)', purpose: 'Measures the current; it goes in series.', how: 'Read the needle at eye level to the nearest half division (0.01 A).', mistake: 'Not watching it: the current creeps as the solution warms.', keys: ['ammeter', 'current', 'constant'] },
  rheostat: { name: 'Rheostat', purpose: 'A variable resistor: sets and holds the current.', how: 'Slide towards less resistance for more current. Keep the ammeter at 0.50 A.', mistake: 'Setting it once and forgetting it.', keys: ['rheostat', 'constant'] },
  key: { name: 'Plug key', purpose: 'Switches the current on and off.', how: 'Close it and start the stopwatch together; open it at 40 minutes.', mistake: 'Leaving the current on while you remove the plates.', keys: ['key', 'switch'] },
  stopwatch: { name: 'Stopwatch', purpose: 'Times how long the current flows.', how: 'Q = It needs the time in seconds: 40 min = 2400 s.', mistake: 'Using minutes in Q = It.', keys: ['time', 'second', 'minute'] },
  balance: { name: 'Top-pan balance (0.01 g)', purpose: 'Weighs the plates, the filings, the paper and copper.', how: 'Record all the digits (2 d.p.). Weigh dry things only.', mistake: 'Weighing a wet plate.', keys: ['weigh', 'mass', 'balance'] },
  washBottle: { name: 'Wash bottle', purpose: 'Distilled water for rinsing.', how: 'A gentle stream; then propanone to dry quickly.', mistake: 'Rubbing the deposit.', keys: ['wash', 'rinse'] },
  'bottle:propanone': { name: 'Propanone (acetone)', purpose: 'Dries metal quickly: it mixes with the water and evaporates.', how: 'Rinse after water; let it evaporate in the air.', mistake: 'Any flame nearby — it is very flammable.', keys: ['propanone', 'flammable', 'flame'] },
  'bottle:cuso4': { name: 'Copper(II) sulphate solution', purpose: 'The electrolyte (or the oxidising agent for iron).', how: 'Measure with the cylinder.', mistake: 'Swallowing it: harmful. Wash your hands.', keys: ['cuso', 'harmful', 'swallow'] },
  beakers: { name: 'The two beakers', purpose: 'Half-cells: Zn in ZnSO₄ and Cu in CuSO₄.', how: 'About half full of each solution.', mistake: 'Putting each metal in the wrong solution.', keys: ['beaker'] },
  strips: { name: 'Zinc and copper strips', purpose: 'The electrodes of the cell: zinc (−) is oxidised; copper (+).', how: 'Clean with sandpaper first.', mistake: 'Oxide films lower the e.m.f.', keys: ['zinc', 'copper', 'strip', 'clean'] },
  bridge: { name: 'Salt bridge', purpose: 'Completes the circuit and keeps both solutions electrically neutral.', how: 'Filter paper soaked in saturated KNO₃, dipping into both beakers.', mistake: 'A dry paper (no reading); removing it breaks the circuit.', keys: ['salt bridge', 'soak', 'kno'] },
  voltmeter: { name: 'High-resistance voltmeter', purpose: 'Reads the e.m.f. while drawing almost no current.', how: '+ (red) to copper, − (black) to zinc; read to 2 d.p.', mistake: 'Reversed leads (a negative reading).', keys: ['voltmeter', 'high-resistance', 'reverse'] },
  mcVoltmeter: { name: 'Moving-coil voltmeter', purpose: 'An ordinary voltmeter for circuits.', how: 'It draws current, so on a cell it reads below the e.m.f.', mistake: 'Using it to measure the e.m.f.', keys: ['voltmeter'] },
  leads: { name: 'Leads with crocodile clips', purpose: 'Join the voltmeter to the strips.', how: 'Red to the positive electrode (copper).', mistake: 'Swapping them.', keys: ['connect'] },
  beaker: { name: 'Beaker (100 cm³)', purpose: 'Holds the CuSO₄ while the iron reacts.', how: 'Stir with the glass rod; thermometer in.', mistake: 'Not stirring: the filings react slowly.', keys: ['beaker', 'stir'] },
  cylinder: { name: 'Measuring cylinder', purpose: 'Measures the CuSO₄ solution.', how: 'Read the bottom of the meniscus at eye level.', mistake: 'Too little solution: not an excess.', keys: ['measuring', 'excess'] },
  thermometer: { name: 'Thermometer (0–110 °C)', purpose: 'Shows the temperature rise (the reaction is exothermic).', how: 'Read before adding the iron, then the highest value, to 0.5 °C.', mistake: 'Taking it out too early.', keys: ['temperature', 'thermometer', 'warm'] },
  rod: { name: 'Glass rod', purpose: 'Stirs the filings so they react.', how: 'Stir for several minutes.', mistake: 'Leaving the filings to settle.', keys: ['stir'] },
  funnel: { name: 'Filter funnel', purpose: 'Separates the copper from the solution.', how: 'Through the weighed filter paper.', mistake: 'Losing copper over the edge.', keys: ['filter'] },
  filterPaper: { name: 'Filter paper', purpose: 'Collects the copper; its own mass is subtracted.', how: 'Weigh it dry first; dry it with the copper in a warm place.', mistake: 'Not weighing it first.', keys: ['filter', 'paper', 'dry'] },
  boat: { name: 'Weighing boat and spatula', purpose: 'Weigh the iron filings.', how: 'Tap filings on until the balance reads about 0.56 g.', mistake: 'Spilling filings around the pan.', keys: ['weigh'] },
  'jar:clean': { name: 'Clean iron filings', purpose: 'The iron that displaces the copper.', how: 'Weigh about 0.56 g.', mistake: '—', keys: ['iron', 'filings', 'clean'] },
  'jar:rusty': { name: 'Rusty iron filings', purpose: 'Old filings with a rust coat.', how: 'Not for this experiment: part of the mass is rust.', mistake: 'Using them.', keys: ['rust'] },
  testTubes: { name: 'Test tubes A–D', purpose: 'The four conditions for the nails.', how: 'A tap water; B boiled water + oil; C CaCl₂ + stopper; D salt water.', mistake: 'Leaving B without oil or C open.', keys: ['tube', 'stopper', 'oil'] },
  rack: { name: 'Test-tube rack', purpose: 'Holds tubes A–D for the week.', how: 'Leave them undisturbed; look after a week.', mistake: 'Disturbing the oil layer.', keys: ['week'] },
  stoppers: { name: 'Rubber stoppers', purpose: 'Seal tube C so moist air cannot get in.', how: 'Push in tightly.', mistake: 'A loose stopper.', keys: ['stopper', 'tight'] },
  burner: { name: 'Bunsen burner and beaker', purpose: 'Boils distilled water to drive out the dissolved air (tube B).', how: 'Boil for a few minutes, let it cool a little, pour gently.', mistake: 'Not boiling it.', keys: ['boil', 'hot'] },
  gradTube: { name: 'Graduated tube with iron wool', purpose: 'Moist iron wool uses up the oxygen in 50.0 cm³ of air as it rusts.', how: 'Inverted in the trough; before reading, raise or lower it until the water levels inside and outside are equal.', mistake: 'Reading with the levels unequal; dry wool.', keys: ['iron wool', 'level', 'graduated'] },
  trough: { name: 'Trough of water', purpose: 'Water rises into the tube as the oxygen is used.', how: 'Keep the tube’s mouth under water.', mistake: '—', keys: ['trough', 'water'] },
  'bottle:oil': { name: 'Oil', purpose: 'Floats on the boiled water in tube B and keeps air out.', how: 'A layer about 1 cm thick.', mistake: 'Forgetting it.', keys: ['oil'] },
  'bottle:salt': { name: 'Salt water', purpose: 'Tube D: does salt speed up rusting?', how: 'A nail half covered.', mistake: '—', keys: ['salt'] },
  'jar:cacl2': { name: 'Anhydrous calcium chloride', purpose: 'A drying agent: keeps the air in tube C dry.', how: 'A layer at the bottom, nail above, stopper on.', mistake: 'Leaving the tube open.', keys: ['calcium chloride', 'dry'] },
  book: { name: 'Practical notebook', purpose: 'Your record, calculations and answers — this is what is marked.', how: 'Write each reading as you take it.', mistake: 'Rounding the meter readings.', keys: ['record'] },
  card: { name: 'Task card', purpose: 'The question paper.', how: 'Read it before you start.', mistake: '—', keys: [] },
  coat: { name: 'Lab coat', purpose: 'Protects your clothes and skin.', how: 'Buttoned.', mistake: '—', keys: [] },
  goggles: { name: 'Safety goggles', purpose: 'Protect your eyes from splashes.', how: 'Over your eyes the whole time.', mistake: 'Pushed up on your forehead.', keys: ['goggles'] },
  fume: { name: 'Fume cupboard', purpose: 'Flammable and volatile liquids are kept here.', how: 'Sash low.', mistake: '—', keys: [] },
  extinguisher: { name: 'Fire extinguisher', purpose: 'Puts out small fires.', how: 'Tell the teacher first. Propanone is a fire risk.', mistake: '—', keys: ['flammable'] },
  eyewash: { name: 'Eye-wash station', purpose: 'Rinses chemicals out of the eyes.', how: 'Rinse for 10 minutes; tell the teacher.', mistake: 'Rubbing the eye.', keys: ['eyes'] },
  firstaid: { name: 'First-aid box', purpose: 'For small injuries.', how: 'Burns: cool under running water for 10 minutes.', mistake: '—', keys: ['burn'] },
  oven: { name: 'Drying oven', purpose: 'Not needed here.', how: '—', mistake: '—', keys: [] },
  burette: { name: 'Burette', purpose: 'For titrations.', how: 'Not needed here.', mistake: '—', keys: [] },
};
export const explainer = makeExplainer(E, { 'tube:': 'testTubes', 'beaker:': 'beakers', 'dish:': 'bridge', 'bottle:znso4': 'bottle:cuso4' });

export const ASK_SUGGESTIONS: AskSuggestions = {
  LEARN: ['Why does the blue colour stay the same?', 'Why is zinc the negative electrode?', 'Why does iron displace copper?', 'Why does salt make iron rust faster?'],
  DEMO: ['Why must the current be kept constant?', 'What does the salt bridge do?', 'Why wash the copper with propanone?', 'Why boil the water in tube B?'],
  TRY: ['How do I calculate Q = It?', 'Why divide by 2F for copper?', 'How do I work out E°cell?', 'How do I find the percentage of oxygen?'],
  SANDBOX: ['What happens with carbon electrodes?', 'What if the Cu²⁺ is more dilute?', 'Would aluminium displace copper?', 'How does galvanising protect iron?'],
};

/** The bench as Mrs Ada sets it out for the introduction (display only). */
export function learnState(task: ElectroTask): ChemElectroState {
  return { ...emptyChemElectroState(), task, log: [{ t: 0, a: `task:${task}` }, { t: 0, a: 'safety:goggles' }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` }))] };
}

const at = (p: readonly number[], y: number, dist: number, pitch: number): Spot => ({ target: [p[0]!, y, p[2]!], dist, pitch });
const S: Record<string, Spot> = {
  voltameter: at(SPOT.voltameter, 0.08, 0.5, 0.35),
  supply: at(SPOT.supply, 0.06, 0.45, 0.4),
  ammeter: at(SPOT.ammeter, 0.07, 0.4, 0.3),
  rheostat: at(SPOT.rheostat, 0.06, 0.45, 0.45),
  key: at(SPOT.key, 0.03, 0.35, 0.6),
  stopwatch: at(SPOT.stopwatch, 0.03, 0.35, 0.6),
  balance: at(SPOT.balance, 0.05, 0.4, 0.45),
  daniell: at([0, 0, 0.05], 0.09, 0.55, 0.35),
  voltmeter: at(SPOT.voltmeter, 0.05, 0.4, 0.3),
  bridge: at([0, 0, 0.05], 0.12, 0.45, 0.5),
  beaker: at(SPOT.beaker, 0.07, 0.45, 0.4),
  funnel: at(SPOT.funnel, 0.12, 0.5, 0.35),
  cylinder: at(SPOT.cylinder, 0.1, 0.5, 0.3),
  rack: at(SPOT.rack, 0.1, 0.5, 0.25),
  trough: at(SPOT.trough, 0.17, 0.6, 0.2),
  burner: at(SPOT.burner, 0.15, 0.55, 0.3),
  sandpaper: at(SPOT.sandpaper, 0.01, 0.35, 0.8),
  whole: { target: [0.0, 0.12, 0.0], dist: 1.3, pitch: 0.5 },
};

export function learnConfig(task: ElectroTask): LearnConfig {
  const match: [RegExp, string][] =
    task === 'ELEC'
      ? [
          [/voltameter|beaker/i, 'voltameter'],
          [/copper plates|electrodes/i, 'plates'],
          [/ammeter/i, 'ammeter'],
          [/rheostat/i, 'rheostat'],
          [/d\.c\.|supply|batter/i, 'supply'],
          [/key/i, 'key'],
          [/stopwatch/i, 'stopwatch'],
          [/balance/i, 'balance'],
        ]
      : task === 'CELL'
        ? [
            [/two beakers/i, 'beakers'],
            [/zinc strip/i, 'strips'],
            [/copper strip/i, 'strips'],
            [/voltmeter/i, 'voltmeter'],
            [/wires|crocodile/i, 'leads'],
          ]
        : task === 'DISP'
          ? [
              [/beaker/i, 'beaker'],
              [/balance/i, 'balance'],
              [/funnel|filter/i, 'funnel'],
              [/glass rod/i, 'rod'],
            ]
          : [
              [/test tubes|stoppers/i, 'testTubes'],
              [/measuring cylinder|graduated/i, 'gradTube'],
              [/trough/i, 'trough'],
              [/bunsen/i, 'burner'],
            ];
  const spotOf: Record<string, string> = { plates: 'voltameter', beakers: 'daniell', strips: 'daniell', leads: 'voltmeter', rod: 'beaker', testTubes: 'rack', gradTube: 'trough' };
  const spot = (id: string) => S[spotOf[id] ?? id] ?? S.whole!;
  const proc: Record<ElectroTask, LearnConfig['procedure']> = {
    ELEC: [{ spot: S.voltameter!, point: 'voltameter' }, { spot: S.ammeter!, point: 'rheostat' }],
    CELL: [{ spot: S.daniell!, point: 'bridge' }, { spot: S.voltmeter!, point: 'voltmeter' }],
    DISP: [{ spot: S.beaker!, point: 'beaker' }, { spot: S.funnel!, point: 'funnel' }],
    RUST: [{ spot: S.rack!, point: 'rack' }, { spot: S.trough!, point: 'gradTube' }],
  };
  return {
    items: match.map(([m, id]) => ({ match: m, id, spot: spot(id) })),
    explain: explainer,
    procedure: proc[task],
    observe: task === 'ELEC' ? { spot: S.voltameter!, point: 'voltameter' } : task === 'CELL' ? { spot: S.voltmeter!, point: 'voltmeter' } : task === 'DISP' ? { spot: S.beaker!, point: 'beaker' } : { spot: S.rack!, point: 'rack' },
    observeTitle: 'What you should see',
  };
}

// ------------------------------------------------------------------ the door briefing

export function electroSafety(task: ElectroTask): SafetyContent {
  return {
    cards: [
      { icon: <Glasses className="size-6" />, title: 'Goggles on', lessonMatch: /goggles|eye/i, lines: ['Wear your safety goggles over your eyes the whole time: solutions splash.', 'Lab coat on and buttoned; long hair tied back.'] },
      { icon: <Hand className="size-6" />, title: 'Copper salts are harmful', lessonMatch: /harmful|swallow|wash hands|salt solution/i, lines: ['Copper(II) sulphate is harmful if swallowed. Never taste anything; do not eat or drink in the lab.', 'Wash your hands after handling the metal salt solutions.'] },
      { icon: <Flame className="size-6" />, title: 'Propanone is flammable', lessonMatch: /propanone|flammable|flame/i, lines: ['Propanone (acetone) catches fire very easily: no flames anywhere near it. Let it evaporate in the air.'] },
      { icon: <Zap className="size-6" />, title: 'Electricity', lessonMatch: /current|supply|circuit/i, lines: ['Use the low-voltage d.c. supply only. Switch off (open the key) before you touch or move the electrodes.', 'Keep the electrodes apart: touching plates short-circuit the supply and the wires get hot.'] },
      { icon: <Thermometer className="size-6" />, title: 'Hot water', lessonMatch: /hot|boil/i, lines: ['Boiling water scalds: let it cool a little and pour it carefully.', 'Burns: cool under running water for 10 minutes and tell the teacher.'] },
    ],
    questions: [
      {
        q: 'Tap the symbol that means HIGHLY FLAMMABLE (it is on the propanone bottle).',
        grid: true,
        options: (['flame', 'corrosive', 'toxic', 'harmful'] as Hazard[]).map((k) => ({ label: <HazardIcon kind={k} />, aria: k, right: k === 'flame', why: k === 'flame' ? 'Right: the flame symbol.' : 'Flammable is the flame symbol.' })),
      },
      task === 'ELEC'
        ? {
            q: 'You need to take the copper plates out of the solution. What do you do first?',
            options: [
              { label: 'Open the key (switch off)', aria: 'off', right: true, why: 'Right: switch off before touching the electrodes.' },
              { label: 'Lift them out with the current on', aria: 'on', right: false, why: 'Switch off first: open the key.' },
            ],
          }
        : task === 'RUST'
          ? {
              q: 'The water for tube B has just boiled. What next?',
              options: [
                { label: 'Let it cool a little, then pour it carefully', aria: 'cool', right: true, why: 'Right: boiling water scalds.' },
                { label: 'Hold the beaker in my hand and pour at once', aria: 'hand', right: false, why: 'It is very hot: use a cloth or tongs and let it cool a little.' },
              ],
            }
          : {
              q: 'A classmate lights a Bunsen burner next to your propanone. What do you say?',
              options: [
                { label: 'No — propanone is flammable', aria: 'no', right: true, why: 'Right: no flames near flammable liquids.' },
                { label: 'Fine, the bottle is closed', aria: 'fine', right: false, why: 'The vapour escapes and catches fire: no flames at all.' },
              ],
            },
      {
        q: 'You have finished handling the copper sulphate. What must you do before you leave?',
        options: [
          { label: 'Wash my hands', aria: 'wash', right: true, why: 'Right: copper salts are harmful.' },
          { label: 'Nothing — I wore goggles', aria: 'nothing', right: false, why: 'Goggles protect your eyes, not your hands: wash them.' },
        ],
      },
    ],
  };
}
