import { emptyPhyDensityState, type DensityTask, type PhyDensityState } from '@aischool/shared';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import type { Spot } from '../../../lab3d-kit/store';
import { NEEDED, PLACEABLE } from './scene-state';
import { BALANCE, BOTTLE, CALS, CAN, CATCH, CLOTH, CYL, SALT, SHOT, STAND, THERMO } from './views';

/** The density labs' "What is this?" cards, Learn stage and Ask suggestions. */

const E: Record<string, Explainer> = {
  vernier: { name: 'Vernier calipers', purpose: 'Measures lengths to 0.01 cm: a main scale in mm and a sliding vernier of ten divisions spanning 9 mm.', how: 'Close the jaws gently on the object; read the main scale before the vernier zero, then the vernier line that coincides with a main-scale line × 0.01 cm.', mistake: 'Not checking the zero error; reading with the eye to one side.', keys: ['vernier', 'zero error', 'parallax', '0.01 cm'] },
  micrometer: { name: 'Micrometer screw gauge', purpose: 'Measures small diameters to 0.01 mm: one turn of the thimble moves the spindle 0.5 mm; the thimble has 50 divisions.', how: 'Close it with the ratchet until it clicks. Read the sleeve (whole and half mm) and the thimble division on the datum line.', mistake: 'Forcing the thimble (squeezes the object); forgetting the half-millimetre mark.', keys: ['ratchet', 'thimble', 'half', 'zero error'] },
  objects: { name: 'Objects to measure', purpose: 'A wooden cylinder and a glass marble for the vernier; a ball bearing and a copper wire for the micrometer.', how: 'Clean them and the jaws with the cloth. Measure at several places or orientations.', mistake: 'Measuring only once: real objects are not perfectly round.', keys: ['several', 'places', 'orientations', 'mean'] },
  'obj-cyl': { name: 'Wooden cylinder', purpose: 'Its diameter is measured with the vernier at three places.', how: 'Outside jaws, closed gently.', mistake: 'Squeezing soft wood.', keys: ['cylinder'] },
  'obj-ball': { name: 'Ball bearing', purpose: 'Its diameter, measured with the micrometer, gives its volume (4/3)πr³.', how: 'Between anvil and spindle; ratchet until it clicks; turn it between readings.', mistake: 'Dropping it where people walk.', keys: ['ball'] },
  'obj-marble': { name: 'Glass marble', purpose: 'Another sphere to measure.', how: 'Vernier or micrometer (it fits under 25 mm).', mistake: '—', keys: ['marble'] },
  'obj-wire': { name: 'Copper wire', purpose: 'Its diameter gives its cross-sectional area.', how: 'Micrometer, at several places along it.', mistake: 'Kinks in the wire.', keys: ['wire'] },
  sbalance: { name: 'Spring balance', purpose: 'Weighs the stone in newtons (0–10 N, 0.1 N divisions).', how: 'Check its zero first; read the pointer at eye level to 0.05 N.', mistake: 'Not adjusting the zero; reading from above or below.', keys: ['balance', 'zero', 'eye level'] },
  stone: { name: 'Stone on a thread', purpose: 'The solid whose relative density is found.', how: 'Hang it from the balance; lower it fully into the liquid without touching the container.', mistake: 'Letting it rest on the bottom; air bubbles clinging to it.', keys: ['stone', 'touching', 'bubbles', 'fully immersed'] },
  eureka: { name: 'Eureka (displacement) can', purpose: 'Water the stone displaces runs out of its spout, to be caught and weighed.', how: 'Fill it until water runs from the spout; wait for the dripping to stop.', mistake: 'Not filling it to the spout first.', keys: ['spout', 'eureka', 'dripping'] },
  catch: { name: 'Catch beaker', purpose: 'Collects the water displaced from the spout.', how: 'Weigh it empty and dry, put it under the spout, weigh it with the water.', mistake: 'Leaving it under the spout while the can is being filled.', keys: ['beaker', 'displaced'] },
  salt: { name: 'Salt solution', purpose: 'The second liquid: its relative density is found from the loss in weight.', how: 'Dry the stone first, then lower it fully in.', mistake: 'Carrying water into it on a wet stone.', keys: ['salt', 'dried', 'second liquid'] },
  tissue: { name: 'Tissue paper', purpose: 'Dries the stone, wipes the bottle and spills.', how: 'Pat dry.', mistake: '—', keys: ['wipe', 'dry', 'spill'] },
  balance: { name: 'Triple-beam balance', purpose: 'Weighs to 0.1 g: riders on the 100 g, 10 g and 0–10 g beams.', how: 'Slide the riders until the pointer rests on zero; add the three beams.', mistake: 'Recording before the beam is balanced.', keys: ['balance', 'weigh'] },
  cylinder: { name: 'Tall cylinder of water', purpose: 'The tube floats in it.', how: 'Upright, nearly full.', mistake: 'Too narrow: the tube touches the sides.', keys: ['sides', 'upright'] },
  testtube: { name: 'Flat-bottomed tube with paper scale', purpose: 'Floats upright when loaded; its scale reads the depth immersed h.', how: 'Add the lead shot evenly; float it free of the sides; read at the flat water surface.', mistake: 'Reading the top of the meniscus; using the internal diameter.', keys: ['meniscus', 'upright', 'external diameter', 'touching'] },
  shot: { name: 'Lead shot', purpose: 'The load m, in 10 g scoops.', how: 'Pour it in gently so it settles evenly on the bottom.', mistake: 'Overloading: the tube sinks.', keys: ['lead', 'wash hands', 'overload'] },
  bottle: { name: 'Density bottle', purpose: 'Holds exactly the same volume every time it is filled and stoppered, thanks to the capillary in its stopper.', how: 'Fill to the brim, insert the stopper, wipe dry, weigh. Dry it between liquids.', mistake: 'Not filled to the capillary; wet outside; air bubbles.', keys: ['capillary', 'dry', 'bubble', 'wiped'] },
  liquids: { name: 'Water and the liquid', purpose: 'Distilled water, and kerosene or palm oil.', how: 'Pour slowly to avoid bubbles.', mistake: 'Kerosene near a flame.', keys: ['kerosene', 'flame', 'residue'] },
  dropper: { name: 'Dropper', purpose: 'Tops the bottle up to the brim.', how: 'Add drop by drop.', mistake: '—', keys: ['dropper'] },
  thermometer: { name: 'Thermometer', purpose: 'Reads the room (and water) temperature: water’s density depends on it.', how: 'Read at eye level to 0.5 °C.', mistake: '—', keys: ['temperature'] },
  sand: { name: 'Dry sand', purpose: 'Solid grains: their RD is found with the bottle.', how: 'About a third of the bottle; stir out the air when water is added.', mistake: 'Air trapped among the grains.', keys: ['grains', 'sand'] },
  magnet: { name: 'Bar magnet', purpose: 'For magnetism practicals.', how: 'Not needed here.', mistake: '—', keys: [] },
  prism: { name: 'Glass prism', purpose: 'For optics practicals.', how: 'Not needed here.', mistake: '—', keys: [] },
  book: { name: 'Practical notebook', purpose: 'Your table, graph and answers — this is what is marked.', how: 'Readings to the instrument’s precision.', mistake: 'Giving relative density a unit.', keys: ['unit'] },
  card: { name: 'Task card', purpose: 'The question paper.', how: 'Read it before you start.', mistake: '—', keys: [] },
  coat: { name: 'Lab coat', purpose: 'Keeps spills off your clothes.', how: '—', mistake: '—', keys: [] },
  goggles: { name: 'Safety goggles', purpose: 'Eye protection.', how: 'Wear them with glassware and liquids.', mistake: '—', keys: [] },
  co2: { name: 'CO₂ fire extinguisher', purpose: 'For electrical and kerosene fires.', how: 'Tell the teacher first.', mistake: '—', keys: [] },
  blanket: { name: 'Fire blanket', purpose: 'Smothers a small fire.', how: 'Pull both tapes down sharply.', mistake: '—', keys: [] },
  extinguisher: { name: 'Fire extinguisher', purpose: 'Puts out small fires.', how: 'Pull the pin, aim at the base, squeeze, sweep.', mistake: '—', keys: [] },
  firstaid: { name: 'First-aid box', purpose: 'Plasters and dressings.', how: 'Tell the teacher about every injury.', mistake: '—', keys: [] },
  eyewash: { name: 'Eye-wash station', purpose: 'Rinses the eyes.', how: 'Rinse for 10 minutes.', mistake: '—', keys: [] },
  notice: { name: 'Notice board', purpose: 'Department notices.', how: '—', mistake: '—', keys: [] },
  shelf: { name: 'Physics equipment shelf', purpose: 'Equipment for other practicals.', how: '—', mistake: '—', keys: [] },
  vdg: { name: 'Van de Graaff generator', purpose: 'High-voltage demonstrations.', how: 'Teacher only.', mistake: '—', keys: [] },
  whiteboard: { name: 'Whiteboard', purpose: 'Today’s practical.', how: 'Read it as you come in.', mistake: '—', keys: [] },
  desk: { name: 'Teacher’s desk', purpose: 'Where the teacher checks your work.', how: '—', mistake: '—', keys: [] },
  'poster-si': { name: 'Poster: SI base units', purpose: 'The seven base units.', how: 'Density in kg m⁻³.', mistake: '—', keys: [] },
  'poster-light': { name: 'Poster: refraction of light', purpose: 'For the optics practicals.', how: '—', mistake: '—', keys: [] },
  'poster-electric': { name: 'Poster: electrical safety', purpose: 'Rules for circuits.', how: '—', mistake: '—', keys: [] },
};
export const explainer = makeExplainer(E);

export const ASK_SUGGESTIONS: AskSuggestions = {
  LEARN: ['How does a vernier read to 0.01 cm?', 'What is a zero error?', 'Why does a stone weigh less in water?', 'What is relative density?'],
  DEMO: ['Why subtract the zero error?', 'Why must the stone not touch the can?', 'Why read at the bottom of the meniscus?', 'Why is the bottle filled to the capillary?'],
  TRY: ['How do I read the micrometer?', 'How do I find RD from my weights?', 'How do I get ρ from my slope?', 'Why has relative density no unit?'],
  SANDBOX: ['What happens on a hot day?', 'What if the stone is lighter than water?', 'What if the tube floats in kerosene?', 'Why does a wet bottle give a wrong answer?'],
};

const setUp = (task: DensityTask) => [{ t: 0, a: `task:${task}` }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` })), ...PLACEABLE[task].map((id) => ({ t: 0, a: `place:${id}` }))];
/** Mr Bayo's bench for the introduction (display only, never saved). */
export function learnState(task: DensityTask): PhyDensityState {
  const s = { ...emptyPhyDensityState(), task, log: setUp(task) };
  if (task === 'CAL') return { ...s, tool: 'V', held: 'cyl', closed: true };
  if (task === 'ARCH') return { ...s, zeroed: true, hung: true, where: 'air', deficit: 0, catchUnder: true };
  if (task === 'FLOAT') return { ...s, load: 3, floating: true };
  return { ...s, bottle: { ...s.bottle, fill: 'water', toCap: true }, stoppered: true, tempRead: true };
}

const S: Record<string, Spot> = {
  vernier: { target: [CALS.x, CALS.y, CALS.z], dist: 0.42, pitch: 0.1 },
  micrometer: { target: [CALS.x + 0.22, 0.05, CALS.z], dist: 0.42, pitch: 0.5 },
  objects: { target: [CLOTH.x, 0.02, CLOTH.z], dist: 0.5, pitch: 0.75 },
  sbalance: { target: [CAN.x, STAND.hook - 0.08, STAND.z + 0.1], dist: 0.6, pitch: 0.1 },
  stone: { target: [CAN.x, 0.2, CAN.z], dist: 0.6, pitch: 0.2 },
  eureka: { target: [CAN.x + 0.03, 0.15, CAN.z], dist: 0.55, pitch: 0.25 },
  catch: { target: [CATCH.x, 0.05, CATCH.z], dist: 0.45, pitch: 0.4 },
  salt: { target: [SALT.x, 0.06, SALT.z], dist: 0.45, pitch: 0.35 },
  balance: { target: [BALANCE.x + 0.06, 0.08, BALANCE.z], dist: 0.62, pitch: 0.42 },
  cylinder: { target: [CYL.x, CYL.water - 0.06, CYL.z], dist: 0.7, pitch: 0.12 },
  water: { target: [CYL.x, CYL.water, CYL.z], dist: 0.3, pitch: 0.05 },
  shot: { target: [SHOT.x, 0.03, SHOT.z], dist: 0.45, pitch: 0.6 },
  bottle: { target: [BOTTLE.x, 0.07, BOTTLE.z], dist: 0.45, pitch: 0.3 },
  liquids: { target: [-0.37, 0.06, -0.08], dist: 0.55, pitch: 0.35 },
  thermometer: { target: [THERMO.x, 0.2, THERMO.z], dist: 0.45, pitch: 0.1 },
};
const MATCH: Record<DensityTask, [RegExp, string][]> = {
  CAL: [
    [/vernier/i, 'vernier'],
    [/micrometer/i, 'micrometer'],
    [/marble|ball|wire|cylinder|cloth|metre rule/i, 'objects'],
  ],
  ARCH: [
    [/spring balance/i, 'sbalance'],
    [/eureka|displacement/i, 'eureka'],
    [/^beaker|measuring cylinder/i, 'catch'],
    [/retort/i, 'sbalance'],
    [/stone|sinker/i, 'stone'],
    [/salt/i, 'salt'],
    [/water|tissue/i, 'eureka'],
  ],
  FLOAT: [
    [/test tube|glass tube|paper scale|ruler/i, 'water'],
    [/cylinder|jar|water/i, 'cylinder'],
    [/vernier/i, 'vernier'],
    [/balance/i, 'balance'],
    [/lead|washer/i, 'shot'],
  ],
  BOTTLE: [
    [/density bottle/i, 'bottle'],
    [/balance/i, 'balance'],
    [/beaker|water|kerosene|palm/i, 'liquids'],
    [/dropper|tissue/i, 'bottle'],
  ],
};
const POINT: Record<string, string> = { water: 'testtube', objects: 'objects' };

/** Learn's camera spots for the task. */
export function learnConfig(task: DensityTask): LearnConfig {
  const first: Record<DensityTask, [string, string, string]> = { CAL: ['vernier', 'micrometer', 'vernier'], ARCH: ['sbalance', 'eureka', 'stone'], FLOAT: ['cylinder', 'water', 'cylinder'], BOTTLE: ['bottle', 'balance', 'bottle'] };
  const [a, b, c] = first[task];
  return {
    items: MATCH[task].map(([match, id]) => ({ match, id: POINT[id] ?? id, spot: S[id]! })),
    explain: explainer,
    procedure: [
      { spot: S[a]!, point: POINT[a] ?? a },
      { spot: S[b]!, point: POINT[b] ?? b },
    ],
    observe: { spot: S[c]!, point: POINT[c] ?? c },
    observeTitle: 'What you should find',
  };
}
