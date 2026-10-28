import { emptyPhySpringState, type PhySpringState, type SpringTask } from '@aischool/shared';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import type { Spot } from '../../../lab3d-kit/store';
import { NEEDED, PLACEABLE } from './scene-state';
import { FIDUCIAL, HOOK, RULE, SPOT, STAND } from './views';

/** The spring's "What is this?" cards, Learn stage and Ask suggestions. */

const E: Record<string, Explainer> = {
  spring: {
    name: 'Spiral (helical) spring',
    purpose: 'Stretches in proportion to the load on it — within its elastic limit (Hooke’s law).',
    how: 'Hang it freely from the clamp’s hook. Add the load gently and let it come to rest before reading.',
    mistake: 'Overloading it: beyond the elastic limit it stays stretched and Hooke’s law no longer holds.',
    keys: ['elastic', 'spring', 'rest', 'unloading'],
  },
  stand: { name: 'Retort stand and clamp', purpose: 'Holds the spring (and the rule) firmly, clear of the bench.', how: 'Clamp near the bench edge; keep the stand stable.', mistake: 'A loose clamp: the whole spring moves and the readings drift.', keys: ['stable', 'clamp'] },
  rule: { name: 'Metre rule (vertical)', purpose: 'The scale the pointer moves over: 0 at the top, readings increase as the spring stretches.', how: 'Clamp it vertically, close to the pointer. Read the pointer’s tip to 0.1 cm with your eye level with it.', mistake: 'A rule that is not vertical, or reading from above or below (parallax).', keys: ['vertical', 'parallax', 'eye'] },
  pointer: { name: 'Pointer', purpose: 'A pin fixed with plasticine to the spring’s lower end: its tip marks the reading on the rule.', how: 'Its tip close to the scale. Read with your eye level with it.', mistake: 'Reading the bottom of the hanger instead of the pointer.', keys: ['parallax', 'eye', 'pointer'] },
  hanger: { name: 'Mass hanger and slotted masses', purpose: 'The load: the hanger is 50 g, each slotted mass 50 g more. W = mg.', how: 'Add masses one at a time, gently; steady the hanger before reading.', mistake: 'Dropping masses on: the spring bounces and may be overstretched.', keys: ['rest', 'steady', 'mass'] },
  'hanger-bench': { name: 'Mass hanger (50 g)', purpose: 'Carries the slotted masses; it counts as the first 50 g of the load.', how: 'Hang it on the spring’s lower hook.', mistake: 'Forgetting to count the hanger’s own mass.', keys: ['mass'] },
  masses: { name: 'Slotted masses', purpose: '50 g each: equal steps of load.', how: 'Slide them onto the hanger one at a time.', mistake: 'Mixing up grams and kilograms: 50 g = 0.050 kg.', keys: ['mass', 'kg'] },
  stopwatch: { name: 'Stopwatch', purpose: 'Times a number of complete oscillations.', how: 'Start as the hanger passes the fiducial mark, count “0”, stop after 20.', mistake: 'Counting half oscillations, or timing too few.', keys: ['repeat', 'oscillations', 'fiducial'] },
  fiducial: { name: 'Fiducial pointer', purpose: 'Marks the rest position of the hanger: the reference for counting oscillations.', how: 'Its tip level with the bottom of the hanger at rest.', mistake: 'Timing from the top or bottom of the swing, where the hanger is almost still.', keys: ['fiducial', 'rest position'] },
  tray: { name: 'Box under the load', purpose: 'Catches a mass that slips off the hanger.', how: 'Keep it under the load and your feet clear.', mistake: 'Standing with your feet under the hanger.', keys: ['feet', 'box', 'tray'] },
  book: { name: 'Practical notebook', purpose: 'Your table, the graph, the slope and k — this is what is marked.', how: 'Readings to 0.1 cm; times to 0.01 s; k in N m⁻¹.', mistake: 'Plotting the pointer readings instead of the extensions.', keys: ['graph', 'slope'] },
  card: { name: 'Task card', purpose: 'The question paper: the loads to use and what to plot.', how: 'Read it before you start.', mistake: 'Skipping R₀.', keys: [] },
  bob: { name: 'Pendulum bob', purpose: 'For the simple pendulum, not this practical.', how: 'Not needed here.', mistake: 'Cluttering the bench.', keys: [] },
  edge: { name: 'Knife edge', purpose: 'For the principle of moments, not this practical.', how: 'Not needed here.', mistake: 'Cluttering the bench.', keys: [] },
  coat: { name: 'Lab coat', purpose: 'Keeps your clothes clean in the lab.', how: 'Optional in this practical.', mistake: '—', keys: [] },
  goggles: { name: 'Safety goggles', purpose: 'Eye protection — a spring that snaps or a flying mass can hurt.', how: 'Optional here; wear them if you overload a spring.', mistake: '—', keys: [] },
  co2: { name: 'CO₂ fire extinguisher', purpose: 'For electrical fires: it does not conduct.', how: 'Pull the pin, aim at the base, squeeze. Tell the teacher first.', mistake: 'Using water on electrical equipment.', keys: [] },
  blanket: { name: 'Fire blanket', purpose: 'Smothers a small fire or burning clothing.', how: 'Pull both tapes down sharply and lay it over the fire.', mistake: 'Throwing it.', keys: [] },
  extinguisher: { name: 'Fire extinguisher', purpose: 'Puts out small fires.', how: 'Tell the teacher; pull the pin, aim at the base, squeeze, sweep.', mistake: 'Not knowing where it is.', keys: [] },
  firstaid: { name: 'First-aid box', purpose: 'Plasters, dressings and cold packs.', how: 'Tell the teacher about every injury.', mistake: 'Hiding an injury.', keys: [] },
  eyewash: { name: 'Eye-wash station', purpose: 'Rinses dust out of the eyes.', how: 'Rinse for 10 minutes and tell the teacher.', mistake: 'Rubbing the eye.', keys: [] },
  notice: { name: 'Notice board', purpose: 'Department notices: timetable, rules, WAEC tips.', how: 'Read it before the practical.', mistake: '—', keys: [] },
  shelf: { name: 'Physics equipment shelf', purpose: 'Meters, power packs, springs and masses for other practicals.', how: 'Take only what the teacher gives out.', mistake: '—', keys: [] },
  vdg: { name: 'Van de Graaff generator', purpose: 'Makes high-voltage static electricity for demonstrations.', how: 'Teacher only.', mistake: 'Touching the dome.', keys: [] },
  whiteboard: { name: 'Whiteboard', purpose: 'Today’s practical and the loads to use.', how: 'Read it as you come in.', mistake: '—', keys: [] },
  'poster-si': { name: 'Poster: SI base units', purpose: 'The seven base units.', how: 'Mass in kg, length in m, force in N (derived).', mistake: '—', keys: [] },
  'poster-light': { name: 'Poster: refraction of light', purpose: 'How light bends at a surface.', how: 'For the optics practicals.', mistake: '—', keys: [] },
  'poster-electric': { name: 'Poster: electrical safety', purpose: 'Rules for circuits and supplies.', how: 'Nothing electrical here.', mistake: '—', keys: [] },
  desk: { name: 'Teacher’s desk', purpose: 'Where the teacher checks your work.', how: '—', mistake: '—', keys: [] },
};
export const explainer = makeExplainer(E);

export const ASK_SUGGESTIONS: AskSuggestions = {
  LEARN: ['What is Hooke’s law?', 'What is the elastic limit?', 'Why is the period longer for a heavier mass?', 'What is a spring constant?'],
  DEMO: ['Why read the pointer at eye level?', 'Why take readings on unloading?', 'Why time 20 oscillations instead of one?', 'Why plot T² and not T?'],
  TRY: ['How do I work out W from the mass?', 'How do I find e?', 'How do I find k from my slope?', 'Why does the pointer keep moving?'],
  SANDBOX: ['What happens past the elastic limit?', 'How does a stiffer spring change the graph?', 'Why does the line not pass through the origin?', 'Does the amplitude change the period?'],
};

/** The bench as Mr Bayo sets it out for the introduction, at rest with a load on (display only, never saved). */
export function learnState(task: SpringTask): PhySpringState {
  const load = task === 'OSC' ? 200 : 150;
  return {
    ...emptyPhySpringState(),
    task,
    load,
    peak: load,
    log: [{ t: 0, a: `task:${task}` }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` })), ...PLACEABLE[task].map((id) => ({ t: 0, a: `place:${id}` }))],
  };
}

const S: Record<string, Spot> = {
  stand: { target: [STAND.base[0], 0.5, STAND.base[2] + 0.1], dist: 1.3, pitch: 0.15 },
  spring: { target: [HOOK[0], 0.75, HOOK[2]], dist: 0.6, pitch: 0.08 },
  rule: { target: [RULE.x, 0.55, RULE.z], dist: 0.95, pitch: 0.05 },
  pointer: { target: [RULE.x, 0.5, RULE.z], dist: 0.3, pitch: 0.05, yaw: -0.2 },
  hanger: { target: [HOOK[0], 0.52, HOOK[2]], dist: 0.5, pitch: 0.08 },
  masses: { target: [SPOT.masses[0], 0.03, SPOT.masses[2]], dist: 0.4, pitch: 0.6 },
  stopwatch: { target: [SPOT.stopwatch[0], 0.02, SPOT.stopwatch[2]], dist: 0.3, pitch: 0.9 },
  fiducial: { target: [FIDUCIAL.x, 0.5, FIDUCIAL.z], dist: 0.5, pitch: 0.08 },
  whole: { target: [HOOK[0], 0.55, HOOK[2]], dist: 1.15, pitch: 0.08 },
};
const MATCH: [RegExp, string][] = [
  [/spring/i, 'spring'],
  [/retort|clamp|stand/i, 'stand'],
  [/metre rule/i, 'rule'],
  [/fiducial/i, 'fiducial'],
  [/pointer|plasticine/i, 'pointer'],
  [/hanger|slotted/i, 'hanger'],
  [/stopwatch/i, 'stopwatch'],
  [/thread|masking/i, 'stand'],
];

/** Learn's camera spots for the task. */
export function learnConfig(task: SpringTask): LearnConfig {
  const osc = task === 'OSC';
  return {
    items: MATCH.filter(([, id]) => (osc ? id !== 'rule' && id !== 'pointer' : id !== 'fiducial' && id !== 'stopwatch')).map(([match, id]) => ({ match, id, spot: S[id]! })),
    explain: explainer,
    procedure: [
      { spot: S.whole!, point: 'spring' },
      { spot: osc ? S.hanger! : S.pointer!, point: osc ? 'hanger' : 'pointer' },
    ],
    observe: { spot: S.whole!, point: osc ? 'hanger' : 'spring' },
    observeTitle: 'What you should find',
  };
}
