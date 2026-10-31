import { emptyPhyHeatState, type HeatEventCode, type HeatTask, type PhyHeatState } from '@aischool/shared';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import type { Spot } from '../../../lab3d-kit/store';
import { NEEDED, PLACEABLE } from './scene-state';
import { BALANCE, BATH, CAL, SPOT, TUBE } from './views';

/** The heat lab's "What is this?" cards, Learn stage and Ask suggestions. */

const E: Record<string, Explainer> = {
  cal: {
    name: 'Copper calorimeter',
    purpose: 'Holds the water whose temperature change measures the heat. Copper is a good conductor with a small specific heat capacity, so it quickly takes the water’s temperature and absorbs little heat.',
    how: 'Weigh it empty with its stirrer, then with the water. Count its heat in the balance: m_c c_c Δθ.',
    mistake: 'Leaving out the heat gained (or lost) by the calorimeter.',
    keys: ['calorimeter', 'lagged', 'covered', 'splash'],
  },
  lagging: { name: 'Lagging jacket', purpose: 'Cotton wool (an insulator) around the calorimeter cuts the heat lost to, or gained from, the room.', how: 'Stand the calorimeter in it before the experiment; keep the lid on.', mistake: 'Leaving the calorimeter bare on the bench.', keys: ['lag', 'cotton'] },
  stirrer: { name: 'Stirrer', purpose: 'Mixes the water so it is all at one temperature and the thermometer reads the true mixture.', how: 'Move it gently up and down all the time.', mistake: 'Stirring with the thermometer — it breaks.', keys: ['stir'] },
  'th-cal': { name: 'Thermometer (calorimeter)', purpose: 'Reads the water’s temperature. Each mark is 1 °C; read it to 0.5 °C or better.', how: 'Bulb fully in the water, not touching the bottom. Eye level with the end of the mercury.', mistake: 'Reading from above or below (parallax), or stirring with it.', keys: ['thermometer', 'eye', 'meniscus'] },
  'th-bath': { name: 'Thermometer (bath)', purpose: 'Reads the boiling water: the block reaches this temperature, θ₁.', how: 'Bulb in the water near the block, not touching the glass.', mistake: 'Assuming 100 °C: water boils a little below 100 °C at most places.', keys: ['thermometer', 'boiling'] },
  'th-room': { name: 'Room thermometer', purpose: 'Room temperature: where to stop adding ice for the cooling correction.', how: 'Read it in air, away from the warm water and your hand.', mistake: 'Holding it by the bulb.', keys: ['room'] },
  'th-tube': { name: 'Thermometer (naphthalene)', purpose: 'Reads the naphthalene as it cools; it also stirs the liquid gently.', how: 'Bulb fully immersed, not touching the glass. Stop stirring when crystals form.', mistake: 'Pulling it out of the solid — it snaps.', keys: ['thermometer', 'immersed', 'bulb'] },
  balance: { name: 'Beam balance', purpose: 'Weighs the calorimeter, the water (by difference), the block and the ice (by difference) to 0.1 g.', how: 'Put the thing on the pan, slide the riders until the pointer is on zero, then add up the three beams.', mistake: 'Reading before the pointer settles on zero.', keys: ['weigh', 'balance'] },
  'rider-h': { name: '100 g rider', purpose: 'Sits in a notch: 0, 100 or 200 g.', how: 'Move it to the largest notch that does not send the pointer below zero.', mistake: '—', keys: [] },
  'rider-t': { name: '10 g rider', purpose: 'Sits in a notch: 0 to 90 g.', how: 'Then the largest notch that keeps the pointer at or above zero.', mistake: '—', keys: [] },
  'rider-f': { name: 'Front rider', purpose: 'Slides along the 0–10 g beam, marked in 0.1 g.', how: 'Slide it until the pointer is on zero; read where it sits.', mistake: '—', keys: [] },
  bunsen: { name: 'Bunsen burner', purpose: 'Heats the water in the beaker.', how: 'Light it with the air hole closed, then open it for a blue flame. Keep paper and the thread away.', mistake: 'Leaving it lit unattended.', keys: ['burner', 'flame'] },
  tripod: { name: 'Tripod and gauze', purpose: 'Holds the beaker over the flame; the gauze spreads the heat.', how: 'Stand it over the Bunsen; the beaker on the gauze.', mistake: 'Touching it after heating — it stays hot.', keys: ['tripod', 'gauze'] },
  bath: { name: 'Beaker of water (bath)', purpose: 'Boiling water heats the block (mixtures), or a water bath heats the boiling tube (cooling curve) evenly and below 100 °C.', how: 'Enough water to cover the block or the naphthalene.', mistake: 'Letting it boil dry.', keys: ['boiling', 'bath'] },
  block: { name: 'Metal block on a thread', purpose: 'The solid whose specific heat capacity you find. It gives out heat as it cools from θ₁ to θ₃.', how: 'Weigh it dry; hang it by the thread in boiling water for several minutes; transfer it quickly and gently.', mistake: 'Dropping it in (splashing), or a slow transfer.', keys: ['block', 'transfer', 'quickly', 'splash'] },
  tongs: { name: 'Tongs', purpose: 'For handling hot things.', how: 'Hold the thread or the block with tongs, never with fingers.', mistake: 'Grabbing a hot block.', keys: ['tongs'] },
  jug: { name: 'Jug of tap water', purpose: 'Water for the calorimeter.', how: 'Two-thirds full: enough to cover the block, room for it to go in.', mistake: 'Filling to the brim — it overflows.', keys: ['water'] },
  kettle: { name: 'Flask of warm water', purpose: 'Warm water for the latent-heat experiment.', how: 'About 10 °C above room temperature.', mistake: 'Very hot water: the heat lost to the room is then large.', keys: ['warm'] },
  ice: { name: 'Beaker of melting ice', purpose: 'Ice at exactly 0 °C (it is melting).', how: 'Take small pieces, dry each with blotting paper, add one at a time.', mistake: 'Ice straight from the freezer (below 0 °C), or wet ice.', keys: ['ice', 'melting', 'dried'] },
  blotting: { name: 'Blotting paper', purpose: 'Dries each piece of ice so no water at 0 °C goes in with it.', how: 'Dab, then add the ice at once.', mistake: 'Skipping it: L then comes out too low.', keys: ['dried', 'blotting'] },
  tube: { name: 'Boiling tube of naphthalene', purpose: 'The substance whose cooling curve you plot.', how: 'Heat only in the water bath. Clamp it in air to cool.', mistake: 'Heating it over the flame — the vapour is flammable.', keys: ['naphthalene', 'water bath', 'flame'] },
  stand: { name: 'Clamp and stand', purpose: 'Holds the boiling tube steady in the bath and in the air.', how: 'Clamp the tube near its top.', mistake: 'Holding the hot tube by hand.', keys: ['clamp'] },
  stopwatch: { name: 'Stopwatch', purpose: 'Times the readings: every 30 s.', how: 'Start it as the tube comes out; read the thermometer on each 30 s mark.', mistake: 'Irregular readings.', keys: ['regular', 'interval'] },
  book: { name: 'Practical notebook', purpose: 'Your table, graph and answers — this is what is marked.', how: 'Masses to 0.1 g, temperatures to 1 d.p.; heats in J.', mistake: 'Mixing grams and kilograms.', keys: ['kg'] },
  card: { name: 'Task card', purpose: 'The question paper.', how: 'Read it before you start.', mistake: '—', keys: [] },
  spring: { name: 'Spiral spring', purpose: 'For Hooke’s law, not this practical.', how: 'Not needed here.', mistake: 'Cluttering the bench.', keys: [] },
  lens: { name: 'Converging lens', purpose: 'For the optics practicals.', how: 'Not needed here.', mistake: 'Cluttering the bench.', keys: [] },
  coat: { name: 'Lab coat', purpose: 'Protects your clothes and arms from hot water.', how: 'Wear it buttoned.', mistake: '—', keys: [] },
  goggles: { name: 'Safety goggles', purpose: 'Boiling water can spit; hot naphthalene can spurt.', how: 'Wear them while anything is heated.', mistake: '—', keys: ['goggles'] },
  co2: { name: 'CO₂ fire extinguisher', purpose: 'For electrical and flammable-liquid fires (e.g. naphthalene vapour).', how: 'Tell the teacher; pull the pin, aim at the base, squeeze.', mistake: 'Using water on burning naphthalene.', keys: [] },
  blanket: { name: 'Fire blanket', purpose: 'Smothers a small fire or burning clothing.', how: 'Pull both tapes down sharply and lay it over the fire.', mistake: 'Throwing it.', keys: [] },
  extinguisher: { name: 'Fire extinguisher', purpose: 'Puts out small fires.', how: 'Tell the teacher first.', mistake: 'Not knowing where it is.', keys: [] },
  firstaid: { name: 'First-aid box', purpose: 'For a scald: cool the skin under cold running water for 10 minutes.', how: 'Tell the teacher about every burn.', mistake: 'Putting butter or toothpaste on a burn.', keys: [] },
  eyewash: { name: 'Eye-wash station', purpose: 'Rinses splashes out of the eyes.', how: 'Rinse for 10 minutes.', mistake: 'Rubbing the eye.', keys: [] },
  notice: { name: 'Notice board', purpose: 'Department notices and WAEC tips.', how: '—', mistake: '—', keys: [] },
  shelf: { name: 'Physics equipment shelf', purpose: 'Equipment for other practicals.', how: 'Take only what the teacher gives out.', mistake: '—', keys: [] },
  vdg: { name: 'Van de Graaff generator', purpose: 'High-voltage static demonstrations.', how: 'Teacher only.', mistake: 'Touching the dome.', keys: [] },
  whiteboard: { name: 'Whiteboard', purpose: 'Today’s practical.', how: 'Read it as you come in.', mistake: '—', keys: [] },
  desk: { name: 'Teacher’s desk', purpose: 'Report a broken thermometer here at once.', how: '—', mistake: '—', keys: [] },
  'poster-si': { name: 'Poster: SI base units', purpose: 'Mass in kg, temperature in K, energy in J.', how: 'Q = m c Δθ with m in kg.', mistake: '—', keys: [] },
  'poster-light': { name: 'Poster: refraction of light', purpose: 'For the optics practicals.', how: '—', mistake: '—', keys: [] },
  'poster-electric': { name: 'Poster: electrical safety', purpose: 'Rules for circuits.', how: '—', mistake: '—', keys: [] },
};
export const explainer = makeExplainer(E, { thermometer: 'th-cal' });

export const ASK_SUGGESTIONS: AskSuggestions = {
  LEARN: ['What is specific heat capacity?', 'What is latent heat?', 'Why is the calorimeter made of copper?', 'Why does the temperature stay constant while a liquid freezes?'],
  DEMO: ['Why transfer the block quickly?', 'Why dry the ice?', 'Why stir with a stirrer and not the thermometer?', 'Why heat naphthalene in a water bath?'],
  TRY: ['How do I read the beam balance?', 'Which temperature change goes with the block?', 'How do I find the mass of ice?', 'How do I find the cooling rate?'],
  SANDBOX: ['What happens without lagging?', 'Why does wet ice make L too low?', 'What does impurity do to the plateau?', 'What is supercooling?'],
};

/** The display bench for Learn (never saved): set out, and heating where the practical heats. */
export function learnState(task: HeatTask): PhyHeatState {
  const events: HeatEventCode[] = task === 'MIX' ? ['lag:on', 'fill:2', 'bunsen:on', 'block:bath'] : task === 'LATENT' ? ['lag:on', 'warm:40', 'stir:on'] : ['bunsen:on', 'tube:bath'];
  return {
    ...emptyPhyHeatState(),
    task,
    events: events.map((e) => ({ t: 0, e })),
    log: [{ t: 0, a: `task:${task}` }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` })), ...PLACEABLE[task].map((id) => ({ t: 0, a: `place:${id}` }))],
  };
}

const S: Record<string, Spot> = {
  cal: { target: [CAL.x, 0.12, CAL.z], dist: 0.55, pitch: 0.45 },
  thermo: { target: [CAL.x, 0.22, CAL.z], dist: 0.45, pitch: 0.15 },
  bath: { target: [BATH.x, 0.22, BATH.z], dist: 0.7, pitch: 0.25 },
  balance: { target: [BALANCE.x, 0.08, BALANCE.z], dist: 0.6, pitch: 0.55 },
  block: { target: [BATH.x, 0.25, BATH.z], dist: 0.5, pitch: 0.3 },
  ice: { target: [SPOT.ice[0], 0.06, SPOT.ice[2]], dist: 0.45, pitch: 0.55 },
  jug: { target: [SPOT.jug[0], 0.1, SPOT.jug[2]], dist: 0.55, pitch: 0.35 },
  blotting: { target: [SPOT.blotting[0], 0.02, SPOT.blotting[2]], dist: 0.4, pitch: 0.8 },
  tube: { target: [TUBE.bath[0], 0.3, TUBE.bath[2]], dist: 0.6, pitch: 0.18 },
  stand: { target: [-0.1, 0.3, 0], dist: 0.9, pitch: 0.15 },
  stopwatch: { target: [SPOT.stopwatch[0], 0.02, SPOT.stopwatch[2]], dist: 0.3, pitch: 0.9 },
  whole: { target: [0.1, 0.2, 0.12], dist: 1.4, pitch: 0.38 },
};
const MATCH: Record<HeatTask, [RegExp, string][]> = {
  MIX: [
    [/calorimeter/i, 'cal'],
    [/thermometer/i, 'thermo'],
    [/beaker|tripod|gauze|bunsen|kettle/i, 'bath'],
    [/balance/i, 'balance'],
    [/block|thread/i, 'block'],
    [/water/i, 'jug'],
    [/cotton|lagging/i, 'cal'],
  ],
  LATENT: [
    [/calorimeter/i, 'cal'],
    [/thermometer/i, 'thermo'],
    [/balance/i, 'balance'],
    [/warm water/i, 'jug'],
    [/ice/i, 'ice'],
    [/blotting|tissue/i, 'blotting'],
  ],
  COOL: [
    [/boiling tube|naphthalene|wax/i, 'tube'],
    [/thermometer/i, 'tube'],
    [/bath|beaker/i, 'tube'],
    [/bunsen|spirit|tripod|gauze/i, 'tube'],
    [/stopwatch/i, 'stopwatch'],
    [/clamp|stand/i, 'stand'],
  ],
};
const POINT: Record<string, string> = { cal: 'cal', thermo: 'th-cal', bath: 'bath', balance: 'balance', block: 'block', ice: 'ice', jug: 'jug', blotting: 'blotting', tube: 'tube', stand: 'stand', stopwatch: 'stopwatch' };

/** Learn's camera spots for the task. */
export function learnConfig(task: HeatTask): LearnConfig {
  return {
    items: MATCH[task].map(([match, id]) => ({ match, id: task === 'COOL' && id === 'tube' ? 'tube' : POINT[id] ?? id, spot: S[id]! })),
    explain: explainer,
    procedure: task === 'COOL' ? [{ spot: S.tube!, point: 'tube' }, { spot: S.stand!, point: 'th-tube' }] : task === 'LATENT' ? [{ spot: S.balance!, point: 'balance' }, { spot: S.cal!, point: 'ice' }] : [{ spot: S.bath!, point: 'block' }, { spot: S.cal!, point: 'cal' }],
    observe: { spot: task === 'COOL' ? S.tube! : S.thermo!, point: task === 'COOL' ? 'th-tube' : 'th-cal' },
    observeTitle: 'What you should see',
  };
}
