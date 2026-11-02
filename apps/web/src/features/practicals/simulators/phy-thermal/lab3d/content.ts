import { emptyPhyThermalState, type PhyThermalState, type ThermEventCode, type ThermTask } from '@aischool/shared';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import type { Spot } from '../../../lab3d-kit/store';
import { NEEDED, PLACEABLE } from './scene-state';
import { AMMETER, BALANCE, BATH, CAL, CAN, HANG, JACKET, MICRO, RULE, SPOT, VOLTMETER } from './views';

/** The thermal lab's "What is this?" cards, Learn stage and Ask suggestions. */

const E: Record<string, Explainer> = {
  jacket: { name: 'Steam jacket', purpose: 'A tube around the rod: steam passes along it so the whole rod is heated to the steam’s temperature.', how: 'Steam in at one end from the generator, out at the other into a beaker. The rod rests inside, one end against the fixed stop.', mistake: 'Pointing the outlet at someone — steam scalds.', keys: ['steam', 'jacket', 'outlet', 'scald'] },
  rod: { name: 'Metal rod', purpose: 'The solid whose linear expansivity you find. About 60 cm long so the expansion is large enough to measure.', how: 'Measure its length l₀ at room temperature first; fix one end firmly against the stop.', mistake: 'Using the hot length as l₀ — use the original length.', keys: ['rod', 'fixed', 'length'] },
  micro: { name: 'Micrometer screw gauge', purpose: 'Measures the tiny expansion (a fraction of a millimetre) to 0.01 mm.', how: 'Turn the ratchet until it clicks against the rod; read the sleeve plus the thimble division × 0.01 mm. Back it off while the rod heats.', mistake: 'Screwing the thimble tight (over-tightening), or leaving it touching while the rod expands.', keys: ['micrometer', 'ratchet', 'tighten', 'backlash'] },
  can: { name: 'Steam generator', purpose: 'A can of water boiled over the Bunsen: its steam heats the jacket.', how: 'Light the burner underneath; steam passes once the water boils.', mistake: 'Letting it boil dry.', keys: ['steam', 'generator', 'boiling'] },
  tubing: { name: 'Rubber tubing', purpose: 'Carries the steam from the can into the jacket.', how: 'Push it firmly on both spouts.', mistake: 'A loose joint that sprays steam.', keys: ['tubing'] },
  rule: { name: 'Metre rule', purpose: 'Measures the rod’s length l₀ (to 1 mm) — about 600 mm.', how: 'One end of the rod at the zero; read the other end looking straight down.', mistake: 'Parallax: reading from an angle.', keys: ['metre rule', 'l₀', 'length'] },
  beaker: { name: 'Beaker', purpose: 'Catches the steam and the condensed water from the outlet.', how: 'Under the outlet, away from people.', mistake: '—', keys: ['outlet'] },
  'th-jacket': { name: 'Thermometer (jacket)', purpose: 'Reads the rod’s temperature: room temperature before the steam (θ₁), the steam’s temperature after (θ₂).', how: 'Bulb inside the jacket in the steam. Eye level with the end of the mercury.', mistake: 'Taking θ₂ before it is steady.', keys: ['thermometer', 'steady'] },
  'th-bath': { name: 'Thermometer (tied to the ruler)', purpose: 'Reads the water’s temperature beside the air column.', how: 'Its bulb level with the air column; stir and wait before reading.', mistake: 'Reading while the flame is on.', keys: ['thermometer', 'stir', 'steady'] },
  'th-cal': { name: 'Thermometer (calorimeter)', purpose: 'Reads the water’s temperature as the heater warms it.', how: 'Bulb in the water, away from the heater. Stir before every reading.', mistake: 'Using it to stir.', keys: ['thermometer', 'highest'] },
  thermometer: { name: 'Thermometer', purpose: 'Reads temperature; each mark is 1 °C, read to 0.5 °C.', how: 'Eye level with the end of the mercury.', mistake: 'Parallax.', keys: ['thermometer'] },
  bunsen: { name: 'Bunsen burner', purpose: 'Heats the steam can or the water bath.', how: 'Light it with the air hole closed, then open it for a blue flame. In the gas-law practical, remove it before every reading.', mistake: 'Reading while it still heats.', keys: ['burner', 'flame', 'heat'] },
  tripod: { name: 'Tripod and gauze', purpose: 'Holds the can or the beaker over the flame; the gauze spreads the heat.', how: 'Stand it over the Bunsen.', mistake: 'Touching it after heating — it stays hot.', keys: ['tripod', 'gauze'] },
  bigbeaker: { name: 'Large beaker of water', purpose: 'The water bath: it sets the temperature of the air in the tube.', how: 'Enough water to cover the whole air column. Stir well.', mistake: 'Too little water: part of the column sticks out.', keys: ['beaker', 'water'] },
  capillary: { name: 'Capillary tube with an acid index', purpose: 'A fixed mass of dry air trapped below a thread of concentrated sulphuric acid. Its length l is proportional to its volume; the pressure stays atmospheric.', how: 'Read l from the sealed end to the bottom of the index, eye level with it.', mistake: 'Opening the tube — the acid is corrosive.', keys: ['capillary', 'index', 'acid', 'air column', 'immersed'] },
  stand: { name: 'Clamp and stand', purpose: 'Holds the ruler, tube and thermometer upright in the bath.', how: 'Lower it until the whole air column is under the water.', mistake: 'Leaving the top of the column above the water.', keys: ['clamp'] },
  stirrer: { name: 'Stirrer', purpose: 'Mixes the water so it is all at one temperature.', how: 'Stir well before every reading (gently and continuously in the calorimeter).', mistake: 'Not stirring: the top is warmer than the bottom.', keys: ['stir'] },
  ice: { name: 'Beaker of ice', purpose: 'Optional: cools the bath first for a wider range of readings.', how: 'Add before any heating.', mistake: '—', keys: ['ice'] },
  cal: { name: 'Copper calorimeter', purpose: 'Holds the water the heater warms; copper takes up little heat.', how: 'Weigh it empty and with water; stand it in its lagging with the lid on.', mistake: 'Forgetting that it (and the heater) take some of the heat.', keys: ['calorimeter', 'lagged', 'covered'] },
  lagging: { name: 'Lagging jacket', purpose: 'Cotton wool cuts the heat lost to the room.', how: 'Stand the calorimeter in it before switching on; keep the lid on.', mistake: 'Leaving the calorimeter bare: c comes out too large.', keys: ['lag', 'cotton'] },
  heater: { name: 'Immersion heater (12 V)', purpose: 'Turns electrical energy into heat in the water: E = VIt.', how: 'Fully under the water before you switch on.', mistake: 'Switching it on in air — it burns out. Never use a mains heater.', keys: ['heater', 'immersed', 'low-voltage', 'mains'] },
  supply: { name: '12 V d.c. supply', purpose: 'Drives the current through the heater.', how: 'Switch on and start the stopwatch at the same moment.', mistake: 'Leaving it on when you finish.', keys: ['supply', 'battery'] },
  ammeter: { name: 'Ammeter (0–3 A)', purpose: 'Measures the current I through the heater.', how: 'In series. Read to 0.05 A, square on to the scale.', mistake: 'Connecting it across the heater.', keys: ['ammeter', 'current'] },
  voltmeter: { name: 'Voltmeter (0–15 V)', purpose: 'Measures the p.d. V across the heater.', how: 'Across the heater only. Read to 0.1 V.', mistake: 'Across the heater and the ammeter: V reads a little high.', keys: ['voltmeter', 'p.d'] },
  wires: { name: 'Connecting wires', purpose: 'Join the supply, ammeter and heater in series, and the voltmeter across the heater.', how: 'Red to +.', mistake: 'A loose connection: the current flickers.', keys: ['wires', 'fluctuating'] },
  balance: { name: 'Electronic balance', purpose: 'Weighs the calorimeter empty and with water: m by difference (to 0.1 g).', how: 'Read the display when it is steady.', mistake: 'Weighing with the heater in it.', keys: ['balance', 'weigh'] },
  stopwatch: { name: 'Stopwatch', purpose: 'Times the heating: start it as you switch on, switch off at 300 s.', how: 't in seconds in E = VIt.', mistake: 'Using minutes.', keys: ['stopwatch', 'seconds'] },
  jug: { name: 'Jug of water', purpose: 'About 200 g of water for the calorimeter.', how: 'Pour gently.', mistake: '—', keys: ['water'] },
  book: { name: 'Practical notebook', purpose: 'Your table, graph and answers — this is what is marked.', how: 'Readings to the instrument’s precision; units on every quantity.', mistake: 'Mixing mm and m, or g and kg.', keys: ['unit'] },
  card: { name: 'Task card', purpose: 'The question paper.', how: 'Read it before you start.', mistake: '—', keys: [] },
  spring: { name: 'Spiral spring', purpose: 'For Hooke’s law, not this practical.', how: 'Not needed here.', mistake: 'Cluttering the bench.', keys: [] },
  lens: { name: 'Converging lens', purpose: 'For the optics practicals.', how: 'Not needed here.', mistake: 'Cluttering the bench.', keys: [] },
  coat: { name: 'Lab coat', purpose: 'Protects your clothes from hot water, steam and acid.', how: 'Wear it buttoned.', mistake: '—', keys: [] },
  goggles: { name: 'Safety goggles', purpose: 'Boiling water can spit; the tube holds concentrated acid.', how: 'Wear them while anything is heated.', mistake: '—', keys: ['goggles'] },
  co2: { name: 'CO₂ fire extinguisher', purpose: 'For electrical fires.', how: 'Tell the teacher; pull the pin, aim at the base, squeeze.', mistake: 'Water on an electrical fire.', keys: [] },
  blanket: { name: 'Fire blanket', purpose: 'Smothers a small fire or burning clothing.', how: 'Pull both tapes down sharply and lay it over the fire.', mistake: 'Throwing it.', keys: [] },
  extinguisher: { name: 'Fire extinguisher', purpose: 'Puts out small fires.', how: 'Tell the teacher first.', mistake: 'Not knowing where it is.', keys: [] },
  firstaid: { name: 'First-aid box', purpose: 'For a scald or steam burn: cool under cold running water for 10 minutes.', how: 'Tell the teacher about every burn.', mistake: 'Putting butter on a burn.', keys: [] },
  eyewash: { name: 'Eye-wash station', purpose: 'For an acid or hot-water splash in the eye.', how: 'Rinse for 10 minutes.', mistake: 'Rubbing the eye.', keys: [] },
  notice: { name: 'Notice board', purpose: 'Department notices and WAEC tips.', how: '—', mistake: '—', keys: [] },
  shelf: { name: 'Physics equipment shelf', purpose: 'Equipment for other practicals.', how: 'Take only what the teacher gives out.', mistake: '—', keys: [] },
  vdg: { name: 'Van de Graaff generator', purpose: 'High-voltage static demonstrations.', how: 'Teacher only.', mistake: 'Touching the dome.', keys: [] },
  whiteboard: { name: 'Whiteboard', purpose: 'Today’s practical.', how: 'Read it as you come in.', mistake: '—', keys: [] },
  desk: { name: 'Teacher’s desk', purpose: 'Report breakages here at once.', how: '—', mistake: '—', keys: [] },
  'poster-si': { name: 'Poster: SI base units', purpose: 'Length in m, temperature in K, energy in J.', how: 'T / K = θ / °C + 273.', mistake: '—', keys: [] },
  'poster-light': { name: 'Poster: refraction of light', purpose: 'For the optics practicals.', how: '—', mistake: '—', keys: [] },
  'poster-electric': { name: 'Poster: electrical safety', purpose: 'Rules for circuits.', how: 'Switch off before changing the circuit.', mistake: '—', keys: [] },
};
export const explainer = makeExplainer(E, {});

export const ASK_SUGGESTIONS: AskSuggestions = {
  LEARN: ['What is linear expansivity?', 'What does Charles’s law say?', 'Why is the trapped air’s pressure constant?', 'What is specific heat capacity?'],
  DEMO: ['Why back the micrometer off before steaming?', 'Why remove the flame before each reading?', 'Why does the temperature rise after switching off?', 'Why use the ratchet?'],
  TRY: ['How do I read the micrometer?', 'How do I find absolute zero from my graph?', 'Should t be in seconds or minutes?', 'How do I find the mass of water?'],
  SANDBOX: ['What happens if the micrometer is left touching?', 'What if part of the air column is above the water?', 'What does no lagging do to c?', 'Why does the rod lag behind the thermometer?'],
};

/** The display bench for Learn (never saved): set out, warming up. */
export function learnState(task: ThermTask): PhyThermalState {
  const events: ThermEventCode[] = task === 'EXPANSION' ? ['micro:ratchet'] : task === 'CHARLES' ? ['immerse:full'] : ['pour', 'lag:on', 'heater:in', 'lid:on', 'wire:ok', 'stir:on'];
  return {
    ...emptyPhyThermalState(),
    task,
    events: events.map((e) => ({ t: 0, e })),
    reads: task === 'EXPANSION' ? [{ k: 'rule', t: 0 }] : [],
    log: [{ t: 0, a: `task:${task}` }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` })), ...PLACEABLE[task].map((id) => ({ t: 0, a: `place:${id}` }))],
  };
}

const S: Record<string, Spot> = {
  jacket: { target: [(JACKET.x0 + JACKET.x1) / 2, 0.14, JACKET.z], dist: 0.95, pitch: 0.3 },
  micro: { target: [MICRO.x + 0.05, MICRO.y, MICRO.z], dist: 0.35, pitch: 0.25 },
  can: { target: [CAN.x, 0.27, CAN.z], dist: 0.7, pitch: 0.25 },
  rule: { target: [RULE.x + 0.45, 0.01, RULE.z], dist: 0.8, pitch: 0.75 },
  thermoJ: { target: [-0.04, 0.25, JACKET.z], dist: 0.5, pitch: 0.12 },
  bath: { target: [BATH.x, 0.3, BATH.z], dist: 0.55, pitch: 0.12 },
  tube: { target: [BATH.x, HANG.full + 0.08, BATH.z], dist: 0.35, pitch: 0.05 },
  cal: { target: [CAL.x, 0.14, CAL.z], dist: 0.55, pitch: 0.4 },
  meters: { target: [(AMMETER.x + VOLTMETER.x) / 2, 0.08, -0.05], dist: 0.85, pitch: 0.35 },
  balance: { target: [BALANCE.x, 0.06, BALANCE.z], dist: 0.5, pitch: 0.6 },
  stopwatch: { target: [SPOT.stopwatch[0], 0.02, SPOT.stopwatch[2]], dist: 0.3, pitch: 0.9 },
  whole: { target: [0, 0.2, 0.12], dist: 1.4, pitch: 0.38 },
};
const MATCH: Record<ThermTask, [RegExp, string, string][]> = {
  EXPANSION: [
    [/rod/i, 'jacket', 'rod'],
    [/steam generator|can/i, 'can', 'can'],
    [/micrometer|dial gauge/i, 'micro', 'micro'],
    [/thermometer/i, 'thermoJ', 'th-jacket'],
    [/metre rule/i, 'rule', 'rule'],
    [/heat source|bunsen/i, 'can', 'bunsen'],
    [/tubing/i, 'jacket', 'tubing'],
    [/water/i, 'can', 'can'],
  ],
  CHARLES: [
    [/capillary/i, 'tube', 'capillary'],
    [/thermometer/i, 'tube', 'th-bath'],
    [/ruler/i, 'tube', 'capillary'],
    [/beaker|water/i, 'bath', 'bigbeaker'],
    [/bunsen|tripod|gauze/i, 'bath', 'bunsen'],
    [/rubber band/i, 'tube', 'capillary'],
    [/stirrer/i, 'bath', 'stirrer'],
    [/ice/i, 'bath', 'bigbeaker'],
  ],
  ELECTRIC: [
    [/heater/i, 'cal', 'heater'],
    [/supply|battery/i, 'meters', 'supply'],
    [/ammeter/i, 'meters', 'ammeter'],
    [/voltmeter/i, 'meters', 'voltmeter'],
    [/calorimeter|polystyrene|cotton|lagging/i, 'cal', 'cal'],
    [/thermometer/i, 'cal', 'th-cal'],
    [/stopwatch/i, 'stopwatch', 'stopwatch'],
    [/balance/i, 'balance', 'balance'],
    [/water/i, 'cal', 'cal'],
  ],
};

/** Learn's camera spots for the task. */
export function learnConfig(task: ThermTask): LearnConfig {
  return {
    items: MATCH[task].map(([match, spot, id]) => ({ match, id, spot: S[spot]! })),
    explain: explainer,
    procedure: task === 'EXPANSION' ? [{ spot: S.rule!, point: 'rule' }, { spot: S.micro!, point: 'micro' }] : task === 'CHARLES' ? [{ spot: S.bath!, point: 'capillary' }, { spot: S.tube!, point: 'th-bath' }] : [{ spot: S.balance!, point: 'balance' }, { spot: S.cal!, point: 'heater' }],
    observe: task === 'EXPANSION' ? { spot: S.micro!, point: 'micro' } : task === 'CHARLES' ? { spot: S.tube!, point: 'capillary' } : { spot: S.cal!, point: 'th-cal' },
    observeTitle: 'What you should see',
  };
}
