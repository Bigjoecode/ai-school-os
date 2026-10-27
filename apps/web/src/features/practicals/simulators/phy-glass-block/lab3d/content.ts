import { emptyPhyGlassState, type PhyGlassState } from '@aischool/shared';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import type { Spot } from '../../../lab3d-kit/store';
import { NEEDED } from './scene-state';
import { SPOT, toLocal } from './views';

/** The glass-block lab's "What is this?" cards, Learn stage and Ask suggestions. */

const E: Record<string, Explainer> = {
  board: {
    name: 'Drawing board and paper',
    purpose: 'Holds the white paper flat and lets you push the optical pins in upright.',
    how: 'Pin the paper down at the corners. Trace a fresh outline ABCD of the block for every angle of incidence.',
    mistake: 'Letting the paper or the block move during an observation.',
    keys: ['outline', 'paper', 'moved'],
  },
  paper: { name: 'White paper and drawing pins', purpose: 'The sheet you draw the outline, normals and rays on — it is your diagram.', how: 'Pin it flat on the board; label every ray and normal.', mistake: 'Thick pencil lines.', keys: ['pencil', 'labelled'] },
  block: {
    name: 'Rectangular glass block',
    purpose: 'Light bends (refracts) as it enters and leaves it; the ray inside is what you measure.',
    how: 'Lay it on its outline, look through face CD at the bases of the pins, then remove it and join the points.',
    mistake: 'Moving the block during an observation, or using a chipped one.',
    keys: ['block'],
  },
  pins: {
    name: 'Optical pins (4)',
    purpose: 'Mark points on the rays: P₁ and P₂ on the incident ray, P₃ and P₄ on the emergent ray.',
    how: 'Push them in upright, at least 5 cm apart. Line up P₃ and P₄ with the images of P₁ and P₂ seen through the glass.',
    mistake: 'Pins close together or leaning, or lining up the tops instead of the bases.',
    keys: ['pins', 'pin'],
  },
  protractor: { name: 'Protractor', purpose: 'Sets the angle of incidence i and measures the angle of refraction r.', how: 'Centre it on O with 0° along the normal. Read r between the normal and OE to the nearest degree.', mistake: 'Measuring from face AB instead of from the normal, or parallax when reading.', keys: ['protractor', 'parallax'] },
  ruler: { name: '30 cm ruler', purpose: 'Draws the normal and the rays as straight, thin lines.', how: 'Hold it firmly; draw along its edge with a sharp pencil.', mistake: 'Joining points freehand.', keys: ['ruler'] },
  pencil: { name: 'Sharp pencil', purpose: 'Thin, accurate lines.', how: 'Keep it sharp; label i, r, N, E and the pins.', mistake: 'Thick lines blur where the pins really are.', keys: ['pencil'] },
  'pin:p1': { name: 'Pin P₁', purpose: 'A point on the incident ray, far from O.', how: 'On the line at angle i to the normal, upright.', mistake: 'Too close to P₂.', keys: ['pins'] },
  'pin:p2': { name: 'Pin P₂', purpose: 'A second point on the incident ray, nearer O.', how: 'At least 5 cm from P₁.', mistake: 'Leaning pin.', keys: ['pins'] },
  'pin:p3': { name: 'Pin P₃', purpose: 'A point on the emergent ray, seen in line with the images of P₁ and P₂.', how: 'Look through CD; push it in where it hides both images.', mistake: 'Lining up the tops of the pins.', keys: ['bases'] },
  'pin:p4': { name: 'Pin P₄', purpose: 'A second point on the emergent ray.', how: 'At least 5 cm from P₃, hiding P₃ and both images.', mistake: 'Moving your eye between P₃ and P₄ without checking all four line up.', keys: ['bases'] },
  prism: { name: 'Triangular prism', purpose: 'For dispersion and minimum deviation, not this practical.', how: 'Not needed here.', mistake: 'Cluttering the bench.', keys: [] },
  lens: { name: 'Converging lens', purpose: 'For focal-length experiments.', how: 'Not needed here.', mistake: 'Cluttering the bench.', keys: [] },
  mirror: { name: 'Plane mirror', purpose: 'For reflection experiments.', how: 'Not needed here.', mistake: 'Cluttering the bench.', keys: [] },
  book: { name: 'Practical notebook', purpose: 'Your table of i, r, sin i and sin r, the graph, n and precautions — this is what is marked.', how: 'Angles to the nearest degree, sines to 3 decimal places.', mistake: 'Plotting i against r (not a straight line), or giving n a unit.', keys: ['sin', 'unit'] },
  card: { name: 'Task card', purpose: 'The question paper: the angles to use and what to plot.', how: 'Read it before you start.', mistake: 'Skipping an angle.', keys: [] },
  coat: { name: 'Lab coat', purpose: 'Keeps your clothes clean in the lab.', how: 'Optional in this practical.', mistake: '—', keys: [] },
  goggles: { name: 'Safety goggles', purpose: 'Eye protection for chemical work.', how: 'Not needed for ray tracing.', mistake: '—', keys: [] },
  co2: { name: 'CO₂ fire extinguisher', purpose: 'For electrical fires: it does not conduct.', how: 'Pull the pin, aim at the base, squeeze. Tell the teacher first.', mistake: 'Using water on electrical equipment.', keys: [] },
  blanket: { name: 'Fire blanket', purpose: 'Smothers a small fire or burning clothing.', how: 'Pull both tapes down sharply and lay it over the fire.', mistake: 'Throwing it.', keys: [] },
  extinguisher: { name: 'Fire extinguisher', purpose: 'Puts out small fires.', how: 'Tell the teacher; pull the pin, aim at the base, squeeze, sweep.', mistake: 'Not knowing where it is.', keys: [] },
  firstaid: { name: 'First-aid box', purpose: 'Plasters and dressings — e.g. for a pin prick or a cut.', how: 'Tell the teacher about every injury.', mistake: 'Hiding a cut from broken glass.', keys: [] },
  eyewash: { name: 'Eye-wash station', purpose: 'Rinses dust or chemicals out of the eyes.', how: 'Rinse for 10 minutes and tell the teacher.', mistake: 'Rubbing the eye.', keys: [] },
  notice: { name: 'Notice board', purpose: 'Department notices: timetable, rules, WAEC tips.', how: 'Read it before the practical.', mistake: '—', keys: [] },
  shelf: { name: 'Physics equipment shelf', purpose: 'Meters, power packs, lenses, springs and masses for other practicals.', how: 'Take only what the teacher gives out.', mistake: '—', keys: [] },
  vdg: { name: 'Van de Graaff generator', purpose: 'Makes high-voltage static electricity for demonstrations.', how: 'Teacher only.', mistake: 'Touching the dome.', keys: [] },
  whiteboard: { name: 'Whiteboard', purpose: 'Today’s practical and the angles to use.', how: 'Read it as you come in.', mistake: '—', keys: [] },
  'poster-light': { name: 'Poster: refraction of light', purpose: 'The ray through a block and n = sin i / sin r.', how: 'Towards the normal into glass, away from it coming out.', mistake: '—', keys: [] },
  'poster-si': { name: 'Poster: SI base units', purpose: 'The seven base units.', how: 'n has no unit — it is a ratio.', mistake: '—', keys: [] },
  'poster-electric': { name: 'Poster: electrical safety', purpose: 'Rules for circuits.', how: 'Not needed in this practical.', mistake: '—', keys: [] },
  desk: { name: 'Teacher’s desk', purpose: 'Where the teacher checks your work.', how: '—', mistake: '—', keys: [] },
};
export const explainer = makeExplainer(E);

export const ASK_SUGGESTIONS: AskSuggestions = {
  LEARN: ['Why do we look at the bases of the pins?', 'Why must the pins be at least 5 cm apart?', 'What is the normal?', 'Why plot sin i against sin r?'],
  DEMO: ['Why does the ray bend towards the normal in glass?', 'Why is the emergent ray parallel to the incident ray?', 'How do I know the images are in line?', 'Why does n have no unit?'],
  TRY: ['How do I line up P₃ and P₄?', 'Where do I measure r from?', 'How many decimal places for sin i?', 'How do I find the slope?'],
  SANDBOX: ['What happens with a larger refractive index?', 'Does a thicker block change r?', 'What is lateral displacement?', 'What is the critical angle?'],
};

/** The bench as Mr Bayo sets it out for the introduction (display only, never saved): one trace at 40° with the normal and P₁, P₂. */
export const LEARN_STATE: PhyGlassState = {
  ...emptyPhyGlassState(),
  traces: [{ i: 40, normal: true, p1: 10, p2: 3.5, p3: null, p4: null, joined: false }],
  table: [{ i: '', r: '', sini: '', sinr: '' }],
  log: NEEDED.map((id) => ({ t: 0, a: `collect:${id}` })),
};

const O = toLocal({ x: 0, y: 0 });
const ITEM_SPOT: Record<string, Spot> = {
  block: { target: [O[0] + 0.02, 0.02, O[2] + 0.03], dist: 0.38, pitch: 0.55 },
  board: { target: [SPOT.board[0], 0.01, SPOT.board[2]], dist: 0.6, pitch: 1.1 },
  pins: { target: [O[0] - 0.03, 0.02, O[2] - 0.05], dist: 0.32, pitch: 0.5 },
  protractor: { target: [SPOT.protractor[0], 0.01, SPOT.protractor[2]], dist: 0.35, pitch: 1.0 },
  ruler: { target: [SPOT.ruler[0] + 0.1, 0.01, SPOT.ruler[2]], dist: 0.45, pitch: 0.9 },
  pencil: { target: [SPOT.pencil[0], 0.01, SPOT.pencil[2]], dist: 0.35, pitch: 0.9 },
};
const MATCH: [RegExp, string][] = [
  [/glass block|block/i, 'block'],
  [/drawing board|board/i, 'board'],
  [/pin/i, 'pins'],
  [/protractor/i, 'protractor'],
  [/ruler/i, 'ruler'],
  [/pencil/i, 'pencil'],
];
export const LEARN_CONFIG: LearnConfig = {
  items: MATCH.map(([match, id]) => ({ match, id, spot: ITEM_SPOT[id]! })),
  explain: explainer,
  procedure: [
    { spot: ITEM_SPOT.board!, point: 'board' },
    { spot: ITEM_SPOT.block!, point: 'block' },
  ],
  observe: { spot: ITEM_SPOT.block!, point: 'block' },
  observeTitle: 'What you will see',
};
