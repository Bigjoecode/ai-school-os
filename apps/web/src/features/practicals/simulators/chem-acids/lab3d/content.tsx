import { emptyChemAcidsState, type AcidsTask, type ChemAcidsState } from '@aischool/shared';
import { Ban, Flame, Glasses, Hand, Thermometer } from 'lucide-react';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import { HazardIcon, type Hazard, type SafetyContent } from '../../../lab3d-kit/safety';
import type { Spot } from '../../../lab3d-kit/store';
import { NEEDED } from './scene-state';
import { SPOT } from './views';

/** The acids lab's "What is this?" cards, Learn stage, Ask suggestions and the door briefing. */

const E: Record<string, Explainer> = {
  testTubes: { name: 'Test tubes and rack', purpose: 'One clean, labelled tube for each sample.', how: 'Rinse with distilled water; about 2 cm³ of sample each.', mistake: 'Reusing a tube without rinsing: the last sample changes the colour.', keys: ['tube', 'clean', 'rinse'] },
  uiBottle: { name: 'Universal indicator', purpose: 'A mixture of indicators: a different colour at each pH from 0 to 14.', how: 'Two drops in each tube, the same every time; shake.', mistake: 'Different numbers of drops: the shades cannot be compared.', keys: ['indicator', 'drops'] },
  chart: { name: 'Colour chart', purpose: 'Matches the colour to a pH: red 0–2, orange 3–4, yellow 5–6, green 7, blue 8–10, violet 11–14.', how: 'Hold the tube beside the chart against a white background, in daylight.', mistake: 'Judging shades in poor light.', keys: ['chart', 'colour', 'daylight', 'white'] },
  tile: { name: 'White tile', purpose: 'A white background, so colours are seen truly.', how: 'Behind the rack (or under the flask in a titration).', mistake: 'Comparing colours against the dark bench.', keys: ['white', 'background', 'tile'] },
  washBottle: { name: 'Wash bottle', purpose: 'Distilled water for rinsing apparatus.', how: 'A gentle stream into each tube; shake out.', mistake: 'Rinsing with tap water: it has dissolved salts.', keys: ['rinse', 'distilled'] },
  rack: { name: 'Test-tube rack', purpose: 'Holds the labelled tubes in order.', how: 'Tubes in order A, B, C…', mistake: 'Mixing up the tubes.', keys: ['tube'] },
  mortar: { name: 'Mortar and pestle', purpose: 'Crushes the dried zobo calyces so the red colour dissolves out.', how: 'Grind with a little warm water or ethanol.', mistake: 'Too much liquid: a weak extract.', keys: ['crush'] },
  waterBath: { name: 'Water bath', purpose: 'Warms the extract gently, with no flame near the ethanol.', how: 'A beaker of hot water; turn the burner off before using ethanol.', mistake: 'Warming ethanol over a naked flame — it catches fire.', keys: ['water bath', 'ethanol', 'flammable'] },
  funnel: { name: 'Filter funnel and paper', purpose: 'Removes the bits of calyx (or the CaCO₃ from boiled hard water).', how: 'Fold the paper into a cone; pour slowly.', mistake: 'Skipping it: a cloudy extract.', keys: ['filter'] },
  burette: { name: 'Burette (50 cm³)', purpose: 'Delivers a measured volume: the HCl, or the soap solution.', how: 'Rinse with the solution it will hold, fill, read the bottom of the meniscus at eye level to 2 d.p.', mistake: 'Rinsing with water only: the solution is diluted.', keys: ['burette', 'rinse', 'meniscus'] },
  tap: { name: 'Burette tap', purpose: 'Controls the flow.', how: 'Fast at first, then drop by drop near the end point, swirling.', mistake: 'Running past the end point.', keys: ['drop'] },
  stand: { name: 'Retort stand and clamp', purpose: 'Holds the burette upright.', how: 'Clamp it vertical, the jet just inside the flask’s neck.', mistake: 'A tilted burette reads wrongly.', keys: ['clamp'] },
  pipette: { name: 'Pipette (25.0 cm³) and filler', purpose: 'Measures exactly 25.0 cm³ of the NaOH.', how: 'Rinse with the NaOH; fill with the filler; let it drain, touch the tip to the flask.', mistake: 'Blowing out the last drop; using the mouth.', keys: ['pipette'] },
  flask: { name: 'Conical flask', purpose: 'Holds the solution being titrated (or the water sample being shaken with soap).', how: 'Swirl after each addition; stopper and shake for soap.', mistake: 'Not swirling: the colour changes too early in one place.', keys: ['flask', 'shak', 'swirl'] },
  'ind:MO': { name: 'Methyl orange', purpose: 'Indicator: red below pH 3.1, orange about 3.7, yellow above 4.4.', how: '2–3 drops; yellow in the alkali; stop at the first orange.', mistake: 'Too much: the end point is hard to see.', keys: ['methyl orange'] },
  'ind:ZOBO': { name: 'Zobo extract', purpose: 'Your natural indicator (anthocyanin): red in acid, purple near neutral, green to yellow in alkali.', how: '2–3 drops; green in the alkali, red at the end point.', mistake: 'Adding too much extract — its own colour masks the change.', keys: ['extract', 'zobo', 'fresh'] },
  sol: { name: 'Test solutions', purpose: 'Acid, near-neutral and alkaline solutions to test the extract.', how: 'A few drops of extract in one tube; universal indicator in a second tube of the same.', mistake: 'Different amounts of extract.', keys: ['acid', 'alkali'] },
  burner: { name: 'Bunsen burner', purpose: 'Warms CuO with acid, lights splints, boils water samples.', how: 'Light with the air-hole closed; warm gently.', mistake: 'Boiling acid hard — it spits.', keys: ['flame', 'burner', 'warm', 'boil'] },
  splints: { name: 'Wooden splints', purpose: 'Test gases: hydrogen pops with a burning splint; oxygen relights a glowing splint.', how: 'Hold the burning splint at the mouth of the tube.', mistake: 'Collecting a big volume of hydrogen — it explodes.', keys: ['splint', 'hydrogen', 'pop'] },
  limewater: { name: 'Limewater', purpose: 'Calcium hydroxide solution: carbon dioxide turns it milky (CaCO₃).', how: 'Bubble the gas through it for a few seconds.', mistake: 'Bubbling for too long: the milkiness clears again.', keys: ['limewater'] },
  balance: { name: 'Top-pan balance (0.01 g)', purpose: 'Weighs the marble and the flask before and after.', how: 'Zero it with the pan empty; record all the digits.', mistake: 'Not zeroing it.', keys: ['balance', 'zero', 'weigh'] },
  cylinder: { name: 'Measuring cylinder', purpose: 'Measures the acid (or 50.0 cm³ of each water sample).', how: 'Read the bottom of the meniscus at eye level.', mistake: 'Guessing the volume.', keys: ['measuring', 'volume', 'same volume'] },
  cotton: { name: 'Cotton-wool plug', purpose: 'Lets the CO₂ escape but keeps acid spray in the flask.', how: 'Loosely in the neck, weighed with the flask.', mistake: 'Leaving it out: spray is lost and the mass loss is too big.', keys: ['cotton', 'spray'] },
  acidFlask: { name: 'Conical flask with acid', purpose: 'The marble reacts with excess HCl here; CO₂ escapes through the plug.', how: 'Tip the chips in, replace the plug, watch the balance.', mistake: 'Too little acid: not all the marble reacts.', keys: ['excess', 'acid'] },
  acidTube: { name: 'Reaction tubes', purpose: 'Mg, Zn, Cu, CuO and marble each with 2 cm³ of dilute HCl.', how: 'Watch for fizzing; test any gas at once.', mistake: 'Saying copper reacts.', keys: ['copper', 'magnesium', 'zinc'] },
  sample: { name: 'Water samples', purpose: 'Distilled (the blank), rain, tap, and two hard samples X and Y.', how: '50.0 cm³ of each, measured.', mistake: 'Different volumes: the soap needed changes.', keys: ['same volume', 'sample'] },
  boil: { name: 'Boiling the samples', purpose: 'Boiling decomposes Ca(HCO₃)₂ — temporary hardness — to insoluble CaCO₃.', how: '5 minutes; cool; make up to 50 cm³ with distilled water; filter.', mistake: 'Not making up the volume: the hardness is concentrated.', keys: ['boil', 'evaporat'] },
  'titrant:soap': { name: 'Standard soap solution', purpose: 'Soap reacts with Ca²⁺ and Mg²⁺ (scum) before it lathers.', how: 'From the burette, 0.5 cm³ at a time.', mistake: 'Calling a short-lived froth the end point.', keys: ['soap', 'lather'] },
  book: { name: 'Practical notebook', purpose: 'Your record, calculations and answers — this is what is marked.', how: 'Write each reading as you take it.', mistake: 'Leaving readings until later.', keys: ['record'] },
  card: { name: 'Task card', purpose: 'The question paper.', how: 'Read it before you start.', mistake: '—', keys: [] },
  coat: { name: 'Lab coat', purpose: 'Protects your clothes and skin.', how: 'Buttoned.', mistake: '—', keys: [] },
  goggles: { name: 'Safety goggles', purpose: 'Protect your eyes from acid and alkali splashes.', how: 'Over your eyes the whole time.', mistake: 'Pushed up on your forehead.', keys: ['goggles'] },
  fume: { name: 'Fume cupboard', purpose: 'Flammable and volatile liquids are kept here.', how: 'Sash low.', mistake: '—', keys: [] },
  extinguisher: { name: 'Fire extinguisher', purpose: 'Puts out small fires.', how: 'Tell the teacher first.', mistake: '—', keys: ['flammable'] },
  eyewash: { name: 'Eye-wash station', purpose: 'Rinses acid or alkali out of the eyes.', how: 'Rinse for 10 minutes; tell the teacher.', mistake: 'Rubbing the eye.', keys: ['eyes'] },
  firstaid: { name: 'First-aid box', purpose: 'For small injuries.', how: 'Burns: cool under running water for 10 minutes.', mistake: '—', keys: ['burn'] },
  thermometer: { name: 'Thermometer', purpose: 'Not needed here.', how: '—', mistake: '—', keys: [] },
  evapDish: { name: 'Evaporating dish', purpose: 'Not needed here.', how: '—', mistake: '—', keys: [] },
};
export const explainer = makeExplainer(E, { 'tube:': 'testTubes', 'bottle:': 'sol', 'sol:': 'sol', 'sample:': 'sample', 'titrant:hcl': 'burette', 'titrant:naoh': 'pipette' });

export const ASK_SUGGESTIONS: AskSuggestions = {
  LEARN: ['What is the difference between a strong and a weak acid?', 'How does an indicator work?', 'Why does copper not react with dilute HCl?', 'What causes hardness in water?'],
  DEMO: ['Why use the same number of drops?', 'Why warm ethanol only in a water bath?', 'Why the cotton-wool plug?', 'Why must the lather last 2 minutes?'],
  TRY: ['How do I find pH from [H⁺]?', 'How do I find the mean titre?', 'How do I work out the mass of CO₂?', 'How do I find the temporary hardness?'],
  SANDBOX: ['What is the pH of 0.001 mol dm⁻³ HCl?', 'Why is the zobo titre a little bigger?', 'What if the acid is not in excess?', 'How does washing soda soften water?'],
};

/** The bench as Mrs Ada sets it out for the introduction (display only). */
export function learnState(task: AcidsTask): ChemAcidsState {
  return { ...emptyChemAcidsState(), task, log: [{ t: 0, a: `task:${task}` }, { t: 0, a: 'safety:goggles' }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` }))] };
}

const at = (p: readonly number[], y: number, dist: number, pitch: number): Spot => ({ target: [p[0]!, y, p[2]!], dist, pitch });
const S: Record<string, Spot> = {
  rack9: at(SPOT.rack9, 0.07, 0.5, 0.3),
  samples: at([SPOT.samples[0] + 0.55, 0, SPOT.samples[2]], 0.06, 0.75, 0.35),
  chart: at(SPOT.chart, 0.07, 0.45, 0.2),
  uiBottle: at(SPOT.uiBottle, 0.04, 0.35, 0.45),
  mortar: at(SPOT.mortar, 0.04, 0.4, 0.5),
  bath: at(SPOT.bath, 0.15, 0.55, 0.3),
  extract: at(SPOT.extract, 0.1, 0.45, 0.35),
  rack10: at(SPOT.rack10, 0.07, 0.5, 0.3),
  burette: at(SPOT.buretteAxis, 0.35, 0.95, 0.12),
  flask: at(SPOT.buretteAxis, 0.1, 0.42, 0.25),
  pipette: at(SPOT.pipette, 0.03, 0.5, 0.6),
  rack5: at(SPOT.rack5, 0.08, 0.5, 0.3),
  burner: at(SPOT.burner, 0.12, 0.5, 0.3),
  balance: at(SPOT.balance, 0.06, 0.45, 0.4),
  cylinder: at(SPOT.cylinder, 0.1, 0.45, 0.3),
  boil: at(SPOT.boil, 0.15, 0.55, 0.3),
  samples5: at([SPOT.samples5[0] + 0.25, 0, SPOT.samples5[2]], 0.06, 0.6, 0.35),
  whole: { target: [0.0, 0.12, 0.0], dist: 1.3, pitch: 0.5 },
};

export function learnConfig(task: AcidsTask): LearnConfig {
  const match: [RegExp, string][] =
    task === 'PH'
      ? [
          [/test tubes/i, 'testTubes'],
          [/dropper/i, 'uiBottle'],
          [/colour chart/i, 'chart'],
        ]
      : task === 'IND'
        ? [
            [/mortar/i, 'mortar'],
            [/beaker/i, 'waterBath'],
            [/funnel/i, 'funnel'],
            [/test tubes/i, 'testTubes'],
            [/titration/i, 'burette'],
          ]
        : task === 'ACID'
          ? [
              [/test tubes/i, 'testTubes'],
              [/conical flask|cotton/i, 'cotton'],
              [/balance/i, 'balance'],
              [/delivery/i, 'limewater'],
            ]
          : [
              [/burette/i, 'burette'],
              [/conical/i, 'flask'],
              [/measuring cylinder/i, 'cylinder'],
              [/bunsen|tripod/i, 'burner'],
              [/beaker/i, 'funnel'],
            ];
  const spotOf: Record<string, string> = { testTubes: task === 'PH' ? 'rack9' : task === 'IND' ? 'rack10' : 'rack5', uiBottle: 'uiBottle', waterBath: 'bath', funnel: task === 'IND' ? 'extract' : 'boil', cotton: 'cylinder', limewater: 'rack5', burner: 'boil' };
  const spot = (id: string) => S[spotOf[id] ?? id] ?? S.whole!;
  const proc: Record<AcidsTask, LearnConfig['procedure']> = {
    PH: [{ spot: S.rack9!, point: 'rack' }, { spot: S.chart!, point: 'chart' }],
    IND: [{ spot: S.mortar!, point: 'mortar' }, { spot: S.burette!, point: 'burette' }],
    ACID: [{ spot: S.rack5!, point: 'rack' }, { spot: S.balance!, point: 'balance' }],
    HARD: [{ spot: S.burette!, point: 'burette' }, { spot: S.boil!, point: 'boil' }],
  };
  return {
    items: match.map(([m, id]) => ({ match: m, id, spot: spot(id) })),
    explain: explainer,
    procedure: proc[task],
    observe: task === 'PH' ? { spot: S.chart!, point: 'chart' } : task === 'IND' ? { spot: S.rack10!, point: 'rack' } : task === 'ACID' ? { spot: S.rack5!, point: 'rack' } : { spot: S.flask!, point: 'flask' },
    observeTitle: 'What you should see',
    dataCard: task === 'PH' ? { kicker: 'pH from concentration', title: 'pH = −log[H⁺]', speech: 'For a strong acid, the hydrogen ion concentration equals the acid’s concentration. pH is minus the log of it. For an alkali, find pOH first, then pH is fourteen minus pOH.' } : undefined,
  };
}

// ------------------------------------------------------------------ the door briefing

export function acidsSafety(task: AcidsTask): SafetyContent {
  return {
    cards: [
      { icon: <Glasses className="size-6" />, title: 'Goggles on', lessonMatch: /goggles|eye/i, lines: ['Wear your safety goggles over your eyes the whole time: acids and alkalis splash.', 'Lab coat on and buttoned; long hair tied back.'] },
      { icon: <Ban className="size-6" />, title: 'Never taste', lessonMatch: /taste/i, lines: ['Never taste any sample — even the lime juice and the Coca-Cola: lab glassware is not clean enough for food.', 'Do not eat or drink in the laboratory.'] },
      { icon: <Hand className="size-6" />, title: 'Acids and alkalis', lessonMatch: /acid|alkali|naoh|hcl/i, lines: ['Dilute HCl and NaOH are irritants. Wash splashes off your skin with plenty of water at once.', 'Acid or alkali in the eye: the eye-wash station for 10 minutes, and tell the teacher.'] },
      task === 'IND'
        ? { icon: <Flame className="size-6" />, title: 'Ethanol is flammable', lessonMatch: /ethanol|flammable/i, lines: ['Warm ethanol only in a water bath, with the burner turned off. Never near a naked flame.'] }
        : task === 'ACID'
          ? { icon: <Flame className="size-6" />, title: 'Hydrogen pops', lessonMatch: /hydrogen|flammable/i, lines: ['Test only the small volume of hydrogen in a test tube with a burning splint. Never collect a large volume near a flame.', 'Warm the acid gently, pointing the tube away from everyone.'] }
          : { icon: <Thermometer className="size-6" />, title: 'Hot water', lessonMatch: /hot|boil/i, lines: ['Boiling water scalds: let it cool before handling, and pour it carefully.', 'Burns: cool under running water for 10 minutes and tell the teacher.'] },
    ],
    questions: [
      {
        q: task === 'IND' ? 'Tap the symbol that means HIGHLY FLAMMABLE (it is on the ethanol bottle).' : 'Tap the symbol that means CORROSIVE (concentrated acids carry it).',
        grid: true,
        options: (['flame', 'corrosive', 'toxic', 'harmful'] as Hazard[]).map((k) => ({ label: <HazardIcon kind={k} />, aria: k, right: k === (task === 'IND' ? 'flame' : 'corrosive'), why: k === (task === 'IND' ? 'flame' : 'corrosive') ? 'Right.' : task === 'IND' ? 'Flammable is the flame symbol.' : 'Corrosive is the symbol of liquid eating a hand and a surface.' })),
      },
      task === 'PH'
        ? {
            q: 'One sample is lime juice. May you taste it to check that it is sour?',
            options: [
              { label: 'No — never taste anything in the lab', aria: 'no', right: true, why: 'Right: nothing in the lab is tasted.' },
              { label: 'Yes, it is only lime juice', aria: 'yes', right: false, why: 'Lab glassware and samples are not food: never taste.' },
            ],
          }
        : task === 'IND'
          ? {
              q: 'You want to warm the zobo in ethanol. How?',
              options: [
                { label: 'In a beaker of hot water, burner off', aria: 'bath', right: true, why: 'Right: a water bath, no flame near the ethanol.' },
                { label: 'Directly over the Bunsen flame', aria: 'flame', right: false, why: 'Ethanol vapour catches fire: use a water bath.' },
              ],
            }
          : task === 'ACID'
            ? {
                q: 'Your test tube of magnesium and acid is fizzing. How do you test the gas?',
                options: [
                  { label: 'A burning splint at the mouth of the small tube', aria: 'small', right: true, why: 'Right: a small volume pops safely.' },
                  { label: 'Collect a big flask of it first, then light it', aria: 'big', right: false, why: 'A large volume of hydrogen and air explodes: test only small volumes.' },
                ],
              }
            : {
                q: 'The water sample has just boiled for 5 minutes. What next?',
                options: [
                  { label: 'Let it cool, then make it up to 50 cm³', aria: 'cool', right: true, why: 'Right: hot water scalds, and the volume must be made up.' },
                  { label: 'Pour it straight into the flask while boiling', aria: 'hot', right: false, why: 'It scalds, and the volume is wrong: cool and make up first.' },
                ],
              },
      {
        q: 'Acid splashes on your hand. What do you do?',
        options: [
          { label: 'Wash it off with plenty of water at once', aria: 'wash', right: true, why: 'Right: dilute it away at once, then tell the teacher.' },
          { label: 'Wipe it on my lab coat and carry on', aria: 'wipe', right: false, why: 'Wash it off with plenty of water, then tell the teacher.' },
        ],
      },
    ],
  };
}
