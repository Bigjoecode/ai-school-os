import { emptyChemSaltsState, type ChemSaltsState, type SaltsTask } from '@aischool/shared';
import { Flame, Glasses, Hand, Skull, Thermometer } from 'lucide-react';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import { HazardIcon, type Hazard, type SafetyContent } from '../../../lab3d-kit/safety';
import type { Spot } from '../../../lab3d-kit/store';
import { NEEDED } from './scene-state';
import { GAUZE_Y, SPOT } from './views';

/** The salts lab's "What is this?" cards, Learn stage, Ask suggestions and the door briefing. */

const E: Record<string, Explainer> = {
  beaker: { name: 'Beaker (100 cm³)', purpose: 'Holds the acid and the base as they react (or the mixture, or the dissolving sample).', how: 'Warm it gently on the gauze; stir with a glass rod.', mistake: 'Boiling the acid: hot acid spits.', keys: ['beaker', 'warm', 'stir'] },
  cylinder: { name: 'Measuring cylinder', purpose: 'Measures the volume of acid or solution.', how: 'Read the bottom of the meniscus at eye level.', mistake: 'Reading from above (parallax).', keys: ['measuring', 'volume'] },
  rod: { name: 'Glass rod', purpose: 'Stirs, and tests for the crystallisation point.', how: 'Dip a cold rod in the hot solution and lift it out: crystals forming on it show the solution is saturated — stop heating.', mistake: 'Not testing, and evaporating to dryness.', keys: ['glass rod', 'crystal', 'stir'] },
  spatula: { name: 'Spatula', purpose: 'Adds the solid a little at a time.', how: 'One measure, stir, wait, then the next — until some stays undissolved.', mistake: 'Tipping it all in at once.', keys: ['excess', 'little at a time'] },
  funnel: { name: 'Filter funnel, paper and flask', purpose: 'Separates a solid (residue) from a liquid (filtrate).', how: 'Fold the paper into a cone, wet it to fit, pour down a glass rod.', mistake: 'Pouring over the top of the paper.', keys: ['filter', 'funnel', 'residue'] },
  dish: { name: 'Evaporating dish', purpose: 'Evaporates the filtrate to the crystallisation point.', how: 'Heat on the gauze; test with a cold glass rod; stop when crystals form on it, then cool.', mistake: 'Evaporating to dryness: white anhydrous powder.', keys: ['evaporat', 'dryness', 'crystallisation'] },
  filterPaper: { name: 'Filter papers', purpose: 'Dry the crystals without heat.', how: 'Press the crystals gently between two sheets.', mistake: 'Drying crystals by heating.', keys: ['filter paper', 'dry'] },
  burner: { name: 'Bunsen burner, tripod and gauze', purpose: 'Heats the beaker, dish or oil bath.', how: 'Low flame to warm gently; high flame to heat fast. Turn it off when you have finished.', mistake: 'Leaving it on high near the melting point, or near ethanol.', keys: ['heat', 'burner', 'flame', 'gently'] },
  tripod: { name: 'Tripod and gauze', purpose: 'Holds the apparatus over the flame and spreads the heat.', how: 'Stand the beaker, dish or oil bath on the gauze.', mistake: 'Touching it while hot.', keys: ['tripod', 'gauze'] },
  balance: { name: 'Top-pan balance (0.01 g)', purpose: 'Weighs the product (and the filter paper).', how: 'Zero it, then weigh; record all the digits (2 d.p.).', mistake: 'Weighing a wet product.', keys: ['weigh', 'mass', 'constant'] },
  washBottle: { name: 'Wash bottle', purpose: 'Distilled water for washing precipitates and crystals.', how: 'A little, cold, for crystals; several washes for a precipitate.', mistake: 'Hot water on crystals — they dissolve.', keys: ['wash', 'distilled'] },
  oven: { name: 'Drying oven', purpose: 'Dries the filter paper and precipitate (about 100 °C).', how: 'Dry, cool, weigh; repeat until two weighings agree (constant mass).', mistake: 'Drying the paper over a flame (it chars).', keys: ['dry', 'warm place', 'constant'] },
  tank: { name: 'Chromatography tank', purpose: 'Holds the solvent; the lid keeps the air saturated with vapour.', how: 'Solvent BELOW the baseline; lid on while it runs.', mistake: 'Solvent above the spots; no lid.', keys: ['cover', 'container', 'solvent'] },
  paper: { name: 'Chromatography paper', purpose: 'The stationary phase: dyes move up it at different rates.', how: 'Pencil baseline 1.5 cm up; small spots; mark the solvent front as soon as it comes out.', mistake: 'An ink baseline; measuring from the paper edge.', keys: ['base line', 'pencil', 'spot', 'front'] },
  ruler: { name: 'Ruler', purpose: 'Measures distances on the chromatogram.', how: 'From the baseline to the centre of each spot and to the solvent front, to the nearest mm.', mistake: 'Measuring from the bottom of the paper.', keys: ['measur', 'distance'] },
  capillary: { name: 'Capillary tubes', purpose: 'Chromatography: apply small spots. Melting point: hold the sample.', how: 'Spot, dry, spot again. For a melting point, pack 2–3 mm of dry powder and fasten it level with the thermometer bulb.', mistake: 'Big wet spots; a loose capillary.', keys: ['capillary'] },
  iceBath: { name: 'Ice bath', purpose: 'Cools the filtrate so more crystallises.', how: 'After it has cooled slowly on the bench.', mistake: 'Plunging the hot filtrate straight into ice (tiny impure crystals).', keys: ['ice', 'cool'] },
  oilBath: { name: 'Oil bath', purpose: 'Heats the capillary evenly for a melting point.', how: 'Heat quickly to about 110 °C, then 1–2 °C per minute; read the thermometer when melting starts and when it is complete.', mistake: 'Heating fast near the melting point: the reading is too high.', keys: ['oil', 'slowly', 'melting'] },
  thermometer: { name: 'Thermometer (0–200 °C)', purpose: 'Reads the oil bath temperature.', how: 'Capillary fastened beside the bulb; read at eye level to 0.5 °C.', mistake: 'Reading when the sample is already clear.', keys: ['thermometer'] },
  hotWater: { name: 'Kettle of boiling water', purpose: 'Boiling water for dissolving benzoic acid and warming the funnel.', how: 'Add 10 cm³ at a time.', mistake: 'Adding too much (poor recovery).', keys: ['boiling water', 'minimum'] },
  'jar:benzoic': { name: 'Impure benzoic acid', purpose: 'The sample to purify.', how: 'Weigh it, then dissolve in the minimum boiling water.', mistake: 'Breathing in the dust.', keys: ['benzoic'] },
  'jar:cuo': { name: 'Copper(II) oxide', purpose: 'The insoluble base: reacts with the acid to give CuSO₄.', how: 'A spatula at a time until some stays undissolved (excess).', mistake: 'Too little: acid left over.', keys: ['cuo', 'excess', 'base'] },
  'bottle:acid': { name: 'Dilute tetraoxosulphate(VI) acid', purpose: 'Reacts with CuO: CuO + H₂SO₄ → CuSO₄ + H₂O.', how: 'Measure 50.0 cm³; warm gently.', mistake: 'Boiling it.', keys: ['acid', 'h₂so₄'] },
  'bottle:cat': { name: 'First solution', purpose: 'Provides the metal ions of the insoluble salt.', how: 'Measure 25.0 cm³.', mistake: 'Spilling: lead and barium salts are toxic.', keys: ['cacl', 'solution'] },
  'bottle:an': { name: 'Second solution', purpose: 'Provides the other ions; used in excess.', how: 'Add 30 cm³ (an excess) and stir.', mistake: 'Too little: not all precipitated.', keys: ['excess'] },
  pencil: { name: 'Pencil', purpose: 'Draws the baseline and marks the solvent front.', how: 'Graphite does not dissolve in the solvent.', mistake: 'Using a pen.', keys: ['pencil'] },
  pen: { name: 'Ink pen', purpose: 'Not for chromatography lines.', how: 'Its ink would dissolve and separate.', mistake: 'Drawing the baseline with it.', keys: ['ink'] },
  ink: { name: 'Sample vials', purpose: 'The black ink and the pure dyes A and B.', how: 'Spot each on its own place on the baseline.', mistake: 'Spots too close together.', keys: ['dye', 'ink'] },
  solvent: { name: 'Solvents', purpose: 'The mobile phase: carries the dyes up the paper.', how: 'Pour to below the baseline. Ethanol is flammable.', mistake: 'Solvent above the baseline; a flame near ethanol.', keys: ['solvent', 'ethanol', 'water'] },
  book: { name: 'Practical notebook', purpose: 'Your record, calculations and answers — this is what is marked.', how: 'Write each reading as you take it.', mistake: 'Rounding the balance reading.', keys: ['record'] },
  card: { name: 'Task card', purpose: 'The question paper.', how: 'Read it before you start.', mistake: '—', keys: [] },
  coat: { name: 'Lab coat', purpose: 'Protects your clothes and skin.', how: 'Buttoned.', mistake: '—', keys: [] },
  goggles: { name: 'Safety goggles', purpose: 'Protect your eyes from hot acid, solvents and hot oil.', how: 'Over your eyes the whole time.', mistake: 'Pushed up on your forehead.', keys: ['goggles'] },
  fume: { name: 'Fume cupboard', purpose: 'For concentrated acids and fumes.', how: 'Sash low.', mistake: '—', keys: [] },
  extinguisher: { name: 'Fire extinguisher', purpose: 'Puts out small fires.', how: 'Tell the teacher first. Ethanol and hot oil are fire risks.', mistake: '—', keys: ['flammable'] },
  eyewash: { name: 'Eye-wash station', purpose: 'Rinses chemicals out of the eyes.', how: 'Rinse for 10 minutes; tell the teacher.', mistake: 'Rubbing the eye.', keys: ['eyes'] },
  firstaid: { name: 'First-aid box', purpose: 'For small injuries.', how: 'Burns: cool under running water for 10 minutes.', mistake: '—', keys: ['burn'] },
  testTubes: { name: 'Test tubes', purpose: 'Small-scale tests.', how: 'Not needed here.', mistake: '—', keys: [] },
  burette: { name: 'Burette', purpose: 'For titrations.', how: 'Not needed here.', mistake: '—', keys: [] },
};
export const explainer = makeExplainer(E, { 'vial:': 'ink', 'solvent:': 'solvent' });

export const ASK_SUGGESTIONS: AskSuggestions = {
  LEARN: ['Why is the base added in excess?', 'Why not evaporate to dryness?', 'Why is the baseline drawn in pencil?', 'Why do impurities lower the melting point?'],
  DEMO: ['How do I know the crystallisation point?', 'Why wash the precipitate?', 'Why cover the tank?', 'Why heat slowly near the melting point?'],
  TRY: ['How do I calculate the percentage yield?', 'How do I work out an Rf value?', 'How much water should I add?', 'What is the molar mass of CuSO₄·5H₂O?'],
  SANDBOX: ['What colour is lead(II) iodide?', 'Why is barium sulphate used in X-rays?', 'What if I use ethanol as the solvent?', 'What happens if I cool the solution fast?'],
};

/** The bench as Mrs Ada sets it out for the introduction (display only). */
export function learnState(task: SaltsTask): ChemSaltsState {
  return { ...emptyChemSaltsState(), task, log: [{ t: 0, a: `task:${task}` }, { t: 0, a: 'safety:goggles' }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` }))] };
}

const at = (p: readonly number[], y: number, dist: number, pitch: number): Spot => ({ target: [p[0]!, y, p[2]!], dist, pitch });
const S: Record<string, Spot> = {
  beaker: at(SPOT.beaker, 0.06, 0.45, 0.45),
  heat: at(SPOT.tripod, GAUZE_Y + 0.04, 0.6, 0.35),
  dish: at(SPOT.dish, 0.03, 0.4, 0.7),
  funnel: at(SPOT.funnel, 0.12, 0.5, 0.35),
  balance: at(SPOT.balance, 0.05, 0.4, 0.45),
  cylinder: at(SPOT.cylinder, 0.1, 0.5, 0.3),
  rod: at(SPOT.rod, 0.01, 0.35, 0.8),
  oven: at(SPOT.oven, 0.12, 0.6, 0.3),
  tank: at(SPOT.tank, 0.12, 0.5, 0.2),
  paper: at(SPOT.paper, 0.01, 0.38, 1.2),
  ruler: at(SPOT.ruler, 0.01, 0.4, 1.0),
  capillary: at(SPOT.capillary, 0.05, 0.35, 0.4),
  iceBath: at(SPOT.iceBath, 0.05, 0.45, 0.5),
  oil: at(SPOT.oil, 0.15, 0.5, 0.2),
  whole: { target: [0.0, 0.12, 0.0], dist: 1.3, pitch: 0.5 },
};

export function learnConfig(task: SaltsTask): LearnConfig {
  const match: [RegExp, string][] = [
    [/beaker/i, 'beaker'],
    [/measuring cylinder/i, 'cylinder'],
    [/glass rod/i, 'rod'],
    [/bunsen|tripod|gauze/i, 'burner'],
    [/funnel/i, 'funnel'],
    [/evaporating dish/i, 'dish'],
    [/balance/i, 'balance'],
    [/oven|warm place/i, 'oven'],
    [/gas jar|lid|container/i, 'tank'],
    [/chromatography|paper strip/i, 'paper'],
    [/ruler/i, 'ruler'],
    [/capillary/i, 'capillary'],
    [/ice/i, 'iceBath'],
    [/oil bath|melting-point/i, 'oilBath'],
    [/thermometer/i, 'oilBath'],
  ];
  const spot = (id: string) => S[id === 'burner' ? 'heat' : id === 'oilBath' ? 'oil' : id] ?? S.whole!;
  const proc: Record<SaltsTask, LearnConfig['procedure']> = {
    SOL: [{ spot: S.heat!, point: 'beaker' }, { spot: S.dish!, point: 'dish' }],
    PPT: [{ spot: S.beaker!, point: 'beaker' }, { spot: S.funnel!, point: 'funnel' }],
    CHROM: [{ spot: S.paper!, point: 'paper' }, { spot: S.tank!, point: 'tank' }],
    MP: [{ spot: S.heat!, point: 'beaker' }, { spot: S.oil!, point: 'oilBath' }],
  };
  return {
    items: match.map(([m, id]) => ({ match: m, id, spot: spot(id) })),
    explain: explainer,
    procedure: proc[task],
    observe: task === 'SOL' ? { spot: S.dish!, point: 'dish' } : task === 'PPT' ? { spot: S.beaker!, point: 'beaker' } : task === 'CHROM' ? { spot: S.paper!, point: 'paper' } : { spot: S.oil!, point: 'oilBath' },
    observeTitle: 'What you should see',
    dataCard: task === 'CHROM' ? { kicker: 'Results', title: 'Measuring Rf values', speech: 'Measure from the baseline to the solvent front and to the centre of each spot; Rf is the spot distance divided by the solvent distance.' } : undefined,
  };
}

// ------------------------------------------------------------------ the door briefing

export function saltsSafety(task: SaltsTask): SafetyContent {
  return {
    cards: [
      { icon: <Glasses className="size-6" />, title: 'Goggles on', lessonMatch: /goggles|eye/i, lines: ['Wear your safety goggles over your eyes the whole time: hot acid spits, solvents and hot oil splash.', 'Lab coat on and buttoned; long hair tied back.'] },
      { icon: <Hand className="size-6" />, title: 'Acids', lessonMatch: /acid|spit/i, lines: ['Dilute acids are corrosive, more so when hot. Warm gently — never boil — and wipe spills at once.', 'Acid on skin: rinse with plenty of running water and tell the teacher.'] },
      { icon: <Skull className="size-6" />, title: 'Toxic salts — wash your hands', lessonMatch: /harmful|swallow|toxic|lead|barium|irritat|dust/i, lines: ['Lead and barium salts are toxic, and copper(II) sulphate is harmful if swallowed. Never taste anything; do not eat or drink in the lab.', 'Wash your hands after handling the salts and at the end of the practical. Avoid breathing in powder dust.'] },
      { icon: <Flame className="size-6" />, title: 'Flammable solvents', lessonMatch: /ethanol|flammable|flame/i, lines: ['Ethanol and other organic solvents catch fire easily: no flames anywhere near them. Keep bottles closed.'] },
      { icon: <Thermometer className="size-6" />, title: 'Hot oil and hot glass', lessonMatch: /oil|hot|burn/i, lines: ['A hot oil bath causes severe burns: heat it slowly, never above about 160 °C, and let it cool before moving it.', 'Hot glass and dishes look cold: lift them with tongs or a cloth. Burns: cool under running water for 10 minutes.'] },
    ],
    questions: [
      {
        q: 'Tap the symbol that means TOXIC (it is on the lead and barium salt bottles).',
        grid: true,
        options: (['flame', 'corrosive', 'toxic', 'harmful'] as Hazard[]).map((k) => ({ label: <HazardIcon kind={k} />, aria: k, right: k === 'toxic', why: k === 'toxic' ? 'Right: the skull and crossbones.' : 'Toxic is the skull and crossbones.' })),
      },
      task === 'CHROM'
        ? {
            q: 'A classmate wants to light a Bunsen burner next to your ethanol tank. What do you say?',
            options: [
              { label: 'No — ethanol is flammable', aria: 'no', right: true, why: 'Right: no flames near flammable solvents.' },
              { label: 'Fine, the lid is on', aria: 'fine', right: false, why: 'Ethanol vapour escapes and catches fire: no flames at all.' },
            ],
          }
        : {
            q: task === 'MP' ? 'The oil bath is smoking. What do you do?' : 'The acid in your beaker starts to boil and spit. What do you do?',
            options: [
              { label: 'Turn the burner off and step back', aria: 'off', right: true, why: 'Right: stop heating and let it cool.' },
              { label: 'Lift it off the gauze with your hand', aria: 'lift', right: false, why: 'It is very hot: turn the burner off and let it cool.' },
            ],
          },
      {
        q: 'You have finished handling the salts. What must you do before you leave?',
        options: [
          { label: 'Wash my hands', aria: 'wash', right: true, why: 'Right: some salts are toxic or harmful.' },
          { label: 'Nothing — I wore goggles', aria: 'nothing', right: false, why: 'Goggles protect your eyes, not your hands: wash them.' },
        ],
      },
    ],
  };
}
