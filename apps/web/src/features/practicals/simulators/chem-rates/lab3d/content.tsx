import { emptyChemRatesState, type ChemRatesState, type RatesTask } from '@aischool/shared';
import { Flame, Glasses, Hand, Thermometer, Wind } from 'lucide-react';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import { HazardIcon, type Hazard, type SafetyContent } from '../../../lab3d-kit/safety';
import type { Spot } from '../../../lab3d-kit/store';
import { NEEDED, PLACEABLE } from './scene-state';
import { BATH, FLASK, SPOT, STAND, SYR } from './views';

/** The rates lab's "What is this?" cards, Learn stage, Ask suggestions and the door briefing. */

const E: Record<string, Explainer> = {
  flask: { name: 'Conical flask', purpose: 'Holds the reacting mixture.', how: 'Magnesium: 50 cm³ of acid, the bung with its delivery tube pushed in firmly. Thiosulphate: stand it on the cross and swirl after adding the acid.', mistake: 'A loose bung (gas leaks) or a flask not rinsed between runs.', keys: ['bung', 'flask', 'washed', 'rinse'] },
  syringe: { name: 'Gas syringe (100 cm³)', purpose: 'Collects and measures the hydrogen given off.', how: 'Plunger fully in to start; read the scale at the plunger’s inner end at eye level, every 30 s.', mistake: 'A sticking plunger, or a plunger not at zero at the start.', keys: ['syringe', 'airtight', 'friction'] },
  plunger: { name: 'Plunger', purpose: 'Moves out as gas fills the syringe.', how: 'It must move freely; read its inner end.', mistake: 'Reading the outer end.', keys: ['syringe', 'free'] },
  stand: { name: 'Retort stand and clamp', purpose: 'Holds the gas syringe level.', how: 'Clamp the barrel gently: too tight and the plunger sticks.', mistake: 'Over-tightening the clamp.', keys: ['clamp'] },
  stopwatch: { name: 'Stopwatch', purpose: 'Times the reaction.', how: 'Start it as the magnesium (or the acid) goes in.', mistake: 'Starting late, or reading the syringe some seconds after the mark.', keys: ['stopwatch', 'time'] },
  ribbon: { name: 'Magnesium ribbon', purpose: 'The limiting reactant: it is used up first.', how: 'Clean with sandpaper until shiny, weigh, then drop it in and bung at once.', mistake: 'Not cleaning off the oxide layer.', keys: ['magnesium', 'clean', 'oxide'] },
  sandpaper: { name: 'Sandpaper', purpose: 'Removes the oxide layer from the magnesium.', how: 'Rub until the ribbon is shiny.', mistake: 'Skipping it: the reaction starts slowly.', keys: ['sandpaper', 'clean'] },
  balance: { name: 'Top-pan balance', purpose: 'Weighs the magnesium.', how: 'Zero it, then weigh the ribbon (to 0.001 g).', mistake: 'Weighing with the watch glass not tared.', keys: ['weigh'] },
  cylinder: { name: 'Measuring cylinder (50 cm³)', purpose: 'Measures the acid, or the thiosulphate and the water.', how: 'Read the bottom of the meniscus at eye level.', mistake: 'Using one cylinder for both solutions without rinsing.', keys: ['measuring cylinder', 'volume'] },
  smallCyl: { name: 'Measuring cylinder (10 cm³)', purpose: 'Measures the 5 cm³ of acid.', how: 'The same volume of acid every run.', mistake: 'Changing the acid volume between runs.', keys: ['acid'] },
  acid1: { name: 'Hydrochloric acid, 1.0 mol dm⁻³', purpose: 'For run 1.', how: '50 cm³ in the flask: in excess.', mistake: 'Spilling it: wash skin with plenty of water.', keys: ['acid', 'excess'] },
  acid2: { name: 'Hydrochloric acid, 0.50 mol dm⁻³', purpose: 'For run 2: half the concentration.', how: '50 cm³, a fresh piece of magnesium.', mistake: 'Using the same acid for both runs.', keys: ['acid', 'concentration'] },
  thio: { name: 'Sodium thiosulphate, 0.15 mol dm⁻³', purpose: 'Reacts with the acid to give a sulphur precipitate.', how: 'Measure it, then make it up to 50 cm³ with water.', mistake: 'Not keeping the total volume the same.', keys: ['thiosulphate', 'total volume'] },
  hcl2: { name: 'Hydrochloric acid, 2.0 mol dm⁻³', purpose: 'Starts the reaction.', how: '5 cm³ each time; start the watch as it goes in.', mistake: 'Adding it before the flask is on the cross.', keys: ['acid'] },
  paper: { name: 'Paper with a bold cross', purpose: 'The cross you watch disappear.', how: 'The same cross under the flask every time; look down through the solution.', mistake: 'Looking from the side.', keys: ['cross', 'observer'] },
  thermometer: { name: 'Thermometer', purpose: 'Measures the mixture’s temperature.', how: 'Read at eye level to 1 °C, after adding the acid.', mistake: 'Recording the bath’s temperature instead of the mixture’s.', keys: ['temperature'] },
  bath: { name: 'Water bath', purpose: 'Warms the mixture to a set temperature.', how: 'Warm the thiosulphate and water in it, then add the acid.', mistake: 'Hot water: handle the warm flask with care.', keys: ['water bath', 'temperature'] },
  washBottle: { name: 'Wash bottle', purpose: 'Distilled water for rinsing the flask.', how: 'Rinse between runs.', mistake: 'Leaving sulphur in the flask.', keys: ['wash', 'rinse'] },
  beaker: { name: 'Beaker', purpose: 'Waste.', how: 'Pour used acid into it.', mistake: '—', keys: [] },
  book: { name: 'Practical notebook', purpose: 'Your table, graph and answers — this is what is marked.', how: 'Write each reading as you take it.', mistake: 'Drawing a straight line through curved data.', keys: ['graph', 'tangent', 'curve'] },
  card: { name: 'Task card', purpose: 'The question paper.', how: 'Read it before you start.', mistake: '—', keys: [] },
  coat: { name: 'Lab coat', purpose: 'Protects your clothes from acid.', how: 'Buttoned.', mistake: '—', keys: [] },
  goggles: { name: 'Safety goggles', purpose: 'Protect your eyes from acid splashes.', how: 'Wear them the whole time.', mistake: 'Pushing them onto your forehead.', keys: ['goggles'] },
  fume: { name: 'Fume cupboard', purpose: 'For harmful fumes.', how: 'The SO₂ from the thiosulphate is small in amount: a ventilated room is enough; do not sniff it.', mistake: '—', keys: ['ventilated', 'sulphur dioxide'] },
  extinguisher: { name: 'Fire extinguisher', purpose: 'Puts out small fires.', how: 'Hydrogen burns: no flames near the apparatus.', mistake: '—', keys: ['flammable', 'flames'] },
  eyewash: { name: 'Eye-wash station', purpose: 'Rinses acid out of the eyes.', how: 'Rinse for 10 minutes; tell the teacher.', mistake: 'Rubbing the eye.', keys: ['eyes'] },
  firstaid: { name: 'First-aid box', purpose: 'For small injuries.', how: 'Tell the teacher about every injury.', mistake: '—', keys: [] },
  burner: { name: 'Bunsen burner', purpose: 'Heats things.', how: 'Not in this practical: hydrogen is flammable.', mistake: 'A flame near hydrogen.', keys: ['flames'] },
  burette: { name: 'Burette', purpose: 'For titrations.', how: 'Not needed here.', mistake: '—', keys: [] },
  testTubes: { name: 'Test tubes', purpose: 'For small-scale tests.', how: 'Not needed here.', mistake: '—', keys: [] },
};
export const explainer = makeExplainer(E);

export const ASK_SUGGESTIONS: AskSuggestions = {
  LEARN: ['Why does the reaction slow down?', 'What is the tangent at t = 0 for?', 'Why keep the total volume at 50 cm³?', 'Why is 1/t a measure of rate?'],
  DEMO: ['Why replace the bung at once?', 'Why clean the magnesium?', 'Why look down through the flask?', 'Why does a 10 °C rise double the rate?'],
  TRY: ['How do I draw a tangent?', 'How do I find the initial rate?', 'How do I work out the theoretical volume?', 'How do I work out 1/t?'],
  SANDBOX: ['What happens with powdered magnesium?', 'What if the acid is not in excess?', 'Does the volume of acid change the time?', 'What is activation energy?'],
};

/** The bench as Mrs Ada sets it out for the introduction (display only). */
export function learnState(task: RatesTask): ChemRatesState {
  const s = emptyChemRatesState();
  return { ...s, task, log: [{ t: 0, a: `task:${task}` }, { t: 0, a: 'safety:goggles' }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` })), ...PLACEABLE[task].map((id) => ({ t: 0, a: `place:${id}` }))] };
}

const S: Record<string, Spot> = {
  flask: { target: [FLASK[0], 0.08, FLASK[2]], dist: 0.5, pitch: 0.3 },
  syringe: { target: [SYR.x1 + SYR.L / 2, SYR.y, SYR.z], dist: 0.6, pitch: 0.15 },
  stand: { target: [STAND.base[0], 0.25, STAND.base[2]], dist: 0.9, pitch: 0.2 },
  stopwatch: { target: [SPOT.stopwatch[0], 0.02, SPOT.stopwatch[2]], dist: 0.35, pitch: 0.9 },
  stopwatchX: { target: [SPOT.stopwatchX[0], 0.02, SPOT.stopwatchX[2]], dist: 0.35, pitch: 0.9 },
  cylinder: { target: [SPOT.cylinder[0], 0.1, SPOT.cylinder[2]], dist: 0.5, pitch: 0.3 },
  cylinderX: { target: [SPOT.cylinderX[0], 0.1, SPOT.cylinderX[2]], dist: 0.5, pitch: 0.3 },
  balance: { target: [SPOT.balance[0], 0.05, SPOT.balance[2]], dist: 0.45, pitch: 0.45 },
  ribbon: { target: [SPOT.ribbon[0], 0.01, SPOT.ribbon[2]], dist: 0.35, pitch: 0.8 },
  paper: { target: [FLASK[0], 0.02, FLASK[2]], dist: 0.42, pitch: 1.3 },
  bath: { target: [BATH[0], 0.08, BATH[2]], dist: 0.6, pitch: 0.45 },
  thermometer: { target: [FLASK[0], 0.12, FLASK[2]], dist: 0.45, pitch: 0.1 },
  whole: { target: [0.1, 0.15, 0.0], dist: 1.3, pitch: 0.45 },
};

export function learnConfig(task: RatesTask): LearnConfig {
  const mg = task === 'MG';
  const match: [RegExp, string][] = mg
    ? [
        [/syringe|burette/i, 'syringe'],
        [/flask|bung|delivery/i, 'flask'],
        [/stopwatch/i, 'stopwatch'],
        [/measuring cylinder/i, 'cylinder'],
        [/balance/i, 'balance'],
      ]
    : [
        [/flask|beaker/i, 'flask'],
        [/measuring cylinder/i, 'cylinder'],
        [/stopwatch/i, 'stopwatch'],
        [/thermometer/i, 'thermometer'],
        [/cross|paper/i, 'paper'],
        [/water bath/i, 'bath'],
      ];
  const spot = (id: string) => (!mg && id === 'stopwatch' ? S.stopwatchX! : !mg && id === 'cylinder' ? S.cylinderX! : S[id]!);
  return {
    items: match.map(([m, id]) => ({ match: m, id, spot: spot(id) })),
    explain: explainer,
    procedure: mg ? [{ spot: S.whole!, point: 'flask' }, { spot: S.syringe!, point: 'syringe' }] : [{ spot: S.whole!, point: 'flask' }, { spot: S.paper!, point: 'paper' }],
    observe: { spot: mg ? S.flask! : S.paper!, point: mg ? 'flask' : 'paper' },
    observeTitle: 'What you should see',
  };
}

// ------------------------------------------------------------------ the door briefing

export function ratesSafety(task: RatesTask): SafetyContent {
  const mg = task === 'MG';
  return {
    cards: [
      { icon: <Glasses className="size-6" />, title: 'Protect your eyes', lessonMatch: /goggles|eye/i, lines: ['Wear your safety goggles over your eyes the whole time: acid can spit as it fizzes, or splash as you swirl.', 'Lab coat on and buttoned; long hair tied back.'] },
      { icon: <Hand className="size-6" />, title: 'Acids', lessonMatch: /acid|rinse|skin/i, lines: ['Hydrochloric acid is corrosive. Acid on your skin: rinse with plenty of running water and tell the teacher.', 'Wipe up spills at once; rinse used flasks into the sink with plenty of water.'] },
      mg
        ? { icon: <Flame className="size-6" />, title: 'Hydrogen burns', lessonMatch: /hydrogen|flame/i, lines: ['Hydrogen is flammable: no flames anywhere near the apparatus.', 'Push the plunger in gently; never point the syringe at anyone.'] }
        : { icon: <Wind className="size-6" />, title: 'Sulphur dioxide', lessonMatch: /sulphur dioxide|ventilat|sniff/i, lines: ['The reaction gives off sulphur dioxide, a choking gas: keep the windows open (ventilated room).', 'Do not sniff the flask. Pour mixtures away promptly with plenty of water. Asthmatic? Tell the teacher.'] },
      ...(!mg ? [{ icon: <Thermometer className="size-6" />, title: 'Hot water', lines: ['The water bath is hot (up to 70 °C): lift the warm flask by its neck.'] }] : []),
    ],
    questions: [
      {
        q: 'Tap the symbol that means CORROSIVE (on the acid bottle).',
        grid: true,
        options: (['flame', 'corrosive', 'toxic', 'harmful'] as Hazard[]).map((k) => ({ label: <HazardIcon kind={k} />, aria: k, right: k === 'corrosive', why: k === 'corrosive' ? 'Right: liquid eating into a surface and a hand.' : 'Corrosive shows liquid eating into a surface and a hand.' })),
      },
      mg
        ? {
            q: 'A classmate wants to light a Bunsen burner next to your gas syringe. What do you say?',
            options: [
              { label: 'No — hydrogen is flammable', aria: 'no', right: true, why: 'Right: no flames near hydrogen.' },
              { label: 'Fine, it is far enough', aria: 'fine', right: false, why: 'Hydrogen with air can catch fire or explode: no flames at all.' },
            ],
          }
        : {
            q: 'Why must the room be ventilated in this practical?',
            options: [
              { label: 'The reaction gives off sulphur dioxide', aria: 'so2', right: true, why: 'Right: SO₂ is a choking gas. Do not sniff the flask.' },
              { label: 'The sulphur is flammable', aria: 'sulphur', right: false, why: 'The danger is the sulphur dioxide gas given off.' },
            ],
          },
      {
        q: 'Acid splashes into your eye. What do you do first?',
        options: [
          { label: 'Rub it gently', aria: 'rub', right: false, why: 'Rubbing spreads the acid.' },
          { label: 'Rinse it at the eye-wash for 10 minutes and tell the teacher', aria: 'rinse', right: true, why: 'Right: plenty of water, at once.' },
        ],
      },
    ],
  };
}
