import { emptyPhyOpticsState, OPTICS_START, type OpticsTask, type PhyOpticsState } from '@aischool/shared';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import type { Spot } from '../../../lab3d-kit/store';
import { NEEDED } from './scene-state';
import { AXIS_Y, cmX, RULE_Z, SPOT } from './views';

/** The optical bench's "What is this?" cards, Learn stage and Ask suggestions. */

const E: Record<string, Explainer> = {
  rule: {
    name: 'Metre rule',
    purpose: 'The optical bench: the object, the lens or mirror and the screen stand on it, and their marks give u and v.',
    how: 'Read each holder’s index line against the scale, to 0.1 cm, from directly in front.',
    mistake: 'Measuring from the edge of a holder instead of its index line (the lens’s optical centre, the mirror’s pole).',
    keys: ['parallax', 'eye', 'centre', 'pole', 'measure'],
  },
  lamp: {
    name: 'Illuminated object',
    purpose: 'A cross-wire over a hole, lit from behind by the lamp: a bright, sharp object whose image you can judge.',
    how: 'Stand it on the rule with the cross-wire at the height of the lens or mirror. Move it only by its holder.',
    mistake: 'Touching the hot lamp housing; judging focus on the bright disc instead of the thin wires.',
    keys: ['lamp', 'hot', 'object'],
  },
  lens: {
    name: 'Converging (convex) lens',
    purpose: 'Refracts the light from each point of the object to a point: a real, inverted image beyond f.',
    how: 'Keep it clean and upright in its holder, its centre on the axis. u is measured to its optical centre.',
    mistake: 'u less than f: the image is virtual and cannot be caught on the screen.',
    keys: ['lens', 'clean', 'axis', 'centre'],
  },
  mirror: {
    name: 'Concave mirror',
    purpose: 'Reflects the light back to a focus: a real, inverted image in front of the mirror when u is beyond f.',
    how: 'Stand it at the 0 cm mark facing along the rule; tilt it slightly so the image falls on the screen beside the object.',
    mistake: 'Measuring to the edge of the mirror instead of its pole; using the wrong sign convention.',
    keys: ['mirror', 'pole', 'axis', 'sign'],
  },
  screen: {
    name: 'White screen',
    purpose: 'Catches the real image so you can see when it is sharp.',
    how: 'Move it to and fro past the sharp position and stop where the cross-wire is crispest. Then read its mark.',
    mistake: 'Stopping at the first fairly sharp position, or reading the screen’s edge instead of its index line.',
    keys: ['sharp', 'focus', 'screen', 'image'],
  },
  book: { name: 'Practical notebook', purpose: 'Your table of u, v, 1/u and 1/v, the graph, the intercepts and f — this is what is marked.', how: 'u and v to 0.1 cm; 1/u and 1/v to 3 significant figures, in cm⁻¹.', mistake: 'Plotting u against v and trying to read f directly.', keys: ['graph', 'intercept'] },
  card: { name: 'Task card', purpose: 'The question paper: the values of u to use and what to plot.', how: 'Read it before you start.', mistake: 'Skipping the rough focal length.', keys: [] },
  prism: { name: 'Triangular prism', purpose: 'For refraction and dispersion, not this practical.', how: 'Not needed here.', mistake: 'Cluttering the bench.', keys: [] },
  plane: { name: 'Plane mirror', purpose: 'For the laws of reflection, not this practical.', how: 'Not needed here.', mistake: 'Cluttering the bench.', keys: [] },
  block: { name: 'Glass block', purpose: 'For refraction through a block, not this practical.', how: 'Not needed here.', mistake: 'Cluttering the bench.', keys: [] },
  coat: { name: 'Lab coat', purpose: 'Keeps your clothes clean in the lab.', how: 'Optional in this practical.', mistake: '—', keys: [] },
  goggles: { name: 'Safety goggles', purpose: 'Eye protection for chemical work.', how: 'Not needed for the optical bench.', mistake: '—', keys: [] },
  co2: { name: 'CO₂ fire extinguisher', purpose: 'For electrical fires: it does not conduct.', how: 'Pull the pin, aim at the base, squeeze. Tell the teacher first.', mistake: 'Using water on electrical equipment.', keys: [] },
  blanket: { name: 'Fire blanket', purpose: 'Smothers a small fire or burning clothing.', how: 'Pull both tapes down sharply and lay it over the fire.', mistake: 'Throwing it.', keys: [] },
  extinguisher: { name: 'Fire extinguisher', purpose: 'Puts out small fires.', how: 'Tell the teacher; pull the pin, aim at the base, squeeze, sweep.', mistake: 'Not knowing where it is.', keys: [] },
  firstaid: { name: 'First-aid box', purpose: 'Burn gel, plasters and dressings.', how: 'Tell the teacher about every injury — even a small burn from the lamp.', mistake: 'Hiding a burn or a cut.', keys: [] },
  eyewash: { name: 'Eye-wash station', purpose: 'Rinses dust or chemicals out of the eyes.', how: 'Rinse for 10 minutes and tell the teacher.', mistake: 'Rubbing the eye.', keys: [] },
  notice: { name: 'Notice board', purpose: 'Department notices: timetable, rules, WAEC tips.', how: 'Read it before the practical.', mistake: '—', keys: [] },
  shelf: { name: 'Physics equipment shelf', purpose: 'Meters, power packs, springs and masses for other practicals.', how: 'Take only what the teacher gives out.', mistake: '—', keys: [] },
  vdg: { name: 'Van de Graaff generator', purpose: 'Makes high-voltage static electricity for demonstrations.', how: 'Teacher only.', mistake: 'Touching the dome.', keys: [] },
  whiteboard: { name: 'Whiteboard', purpose: 'Today’s practical and the values of u to use.', how: 'Read it as you come in.', mistake: '—', keys: [] },
  'poster-light': { name: 'Poster: refraction of light', purpose: 'How light bends at a surface.', how: 'A lens bends light at both faces to bring it to a focus.', mistake: '—', keys: [] },
  'poster-si': { name: 'Poster: SI base units', purpose: 'The seven base units.', how: 'Here lengths are in cm, so 1/u and 1/v are in cm⁻¹.', mistake: '—', keys: [] },
  'poster-electric': { name: 'Poster: electrical safety', purpose: 'Rules for circuits and supplies.', how: 'The lamp runs from a low-voltage supply.', mistake: '—', keys: [] },
  desk: { name: 'Teacher’s desk', purpose: 'Where the teacher checks your work.', how: '—', mistake: '—', keys: [] },
};
export const explainer = makeExplainer(E);

export const ASK_SUGGESTIONS: AskSuggestions = {
  LEARN: ['Why find a rough focal length first?', 'Why must u be bigger than f?', 'Why plot 1/v against 1/u?', 'What is the optical centre of a lens?'],
  DEMO: ['How do I know the image is at its sharpest?', 'Why is the image upside down?', 'Why is the slope of the graph −1?', 'Why are both intercepts equal to 1/f?'],
  TRY: ['Where do I read v from?', 'How many significant figures for 1/u?', 'How do I find the intercepts?', 'Why is there no image on my screen?'],
  SANDBOX: ['What happens when u = 2f?', 'What happens when u is less than f?', 'How does a stronger lens change v?', 'What is the power of a lens?'],
};

/** The bench as Mr Bayo sets it out for the introduction (display only, never saved). */
export function learnState(task: OpticsTask): PhyOpticsState {
  return {
    ...emptyPhyOpticsState(),
    task,
    aligned: true,
    ...OPTICS_START[task],
    log: [{ t: 0, a: `task:${task}` }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` })), ...NEEDED[task].filter((id) => id !== 'rule').map((id) => ({ t: 0, a: `place:${id}` }))],
  };
}

export function learnConfig(task: OpticsTask): LearnConfig {
  const st = OPTICS_START[task];
  const opticX = cmX(task === 'MIRROR' ? 0 : st.u);
  const objectX = cmX(task === 'MIRROR' ? st.u : 0);
  const S: Record<string, Spot> = {
    rule: { target: [0, 0.03, RULE_Z], dist: 1.0, pitch: 0.35 },
    lamp: { target: [objectX, AXIS_Y - 0.02, RULE_Z], dist: 0.42, pitch: 0.25, yaw: task === 'MIRROR' ? 0.5 : -0.4 },
    optic: { target: [opticX, AXIS_Y - 0.02, RULE_Z], dist: 0.36, pitch: 0.2, yaw: task === 'MIRROR' ? 0.6 : 0.3 },
    screen: { target: [cmX(st.screen), AXIS_Y, RULE_Z], dist: 0.4, pitch: 0.15, yaw: -0.8 },
    bench: { target: [0, 0.1, RULE_Z], dist: 1.15, pitch: 0.22 },
  };
  const id = task === 'MIRROR' ? 'mirror' : 'lens';
  const MATCH: [RegExp, string, Spot][] = [
    [/converging lens|lens in holder/i, 'lens', S.optic!],
    [/concave mirror|mirror in holder/i, 'mirror', S.optic!],
    [/illuminated object|cross-wire|lamp|optical pin/i, 'lamp', S.lamp!],
    [/screen/i, 'screen', S.screen!],
    [/metre rule/i, 'rule', S.rule!],
  ];
  return {
    items: MATCH.map(([match, item, spot]) => ({ match, id: item, spot })),
    explain: explainer,
    procedure: [
      { spot: S.bench!, point: id },
      { spot: S.screen!, point: 'screen' },
    ],
    observe: { spot: S.screen!, point: 'screen' },
    observeTitle: 'What you will see',
  };
}

export const CARD_SPOT: Spot = { target: [SPOT.card[0], 0.01, SPOT.card[2]], dist: 0.35, pitch: 1.0 };
