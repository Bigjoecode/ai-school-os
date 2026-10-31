import { emptyPhySoundState, SONO_CARD_LOAD, type PhySoundState, type SoundTask } from '@aischool/shared';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import type { Spot } from '../../../lab3d-kit/store';
import { NEEDED, PLACEABLE } from './scene-state';
import { bridgeX, JAR, SONO, SPOT, STAND, tubeTopY } from './views';

/** The resonance labs' "What is this?" cards, Learn stage and Ask suggestions. */

const E: Record<string, Explainer> = {
  tube: {
    name: 'Resonance tube',
    purpose: 'A tube closed at the bottom by the water: its air column resonates when l + e = λ/4 (and again at 3λ/4).',
    how: 'Clamp it vertical. Start with a short column and raise it slowly with the fork sounding over the mouth until the sound is loudest.',
    mistake: 'Going straight to a long column and finding the second resonance instead of the first.',
    keys: ['vertical', 'resonance', 'short', 'back and forth'],
  },
  jar: { name: 'Tall jar of water', purpose: 'The water closes the bottom of the tube; moving the tube changes the length of air above it.', how: 'Keep it upright on the floor, full nearly to the top.', mistake: 'Too little water: the column cannot be made short enough.', keys: ['water'] },
  stand: { name: 'Clamp and stand', purpose: 'Holds the tube vertical while you slide it up and down.', how: 'Loosen, slide, tighten.', mistake: 'A tilted tube.', keys: ['vertical', 'clamp'] },
  rule: { name: 'Metre rule', purpose: 'Measures l, from the open top of the tube to the water surface.', how: 'Its 0 at the top; read at the water surface with your eye level with it, to 0.1 cm.', mistake: 'Measuring the whole tube instead of the air column.', keys: ['parallax', 'eye'] },
  forks: { name: 'Set of tuning forks', purpose: 'Each gives one pure frequency, stamped on it (256 to 512 Hz).', how: 'Hold it by the stem; strike a prong on the rubber pad.', mistake: 'Holding the prongs (it stops ringing).', keys: ['fork', 'frequency'] },
  fork: { name: 'Tuning fork (ringing)', purpose: 'Its prongs vibrate at its frequency f; the sound dies away in a few seconds.', how: 'Hold it horizontally just above the mouth (tube) or press its stem on the box (sonometer).', mistake: 'Touching the tube or the wire with it.', keys: ['mouth', 'stem', 'touch'] },
  pad: { name: 'Rubber pad', purpose: 'For striking the forks: a pure note and no damage.', how: 'Strike one prong sharply on it.', mistake: 'Striking on the bench or the glass: overtones, a damaged fork, a cracked tube.', keys: ['rubber', 'pad', 'bench'] },
  sonometer: { name: 'Sonometer', purpose: 'A wire stretched over two bridges on a hollow box: the box makes the wire’s vibration loud.', how: 'Load the hanger, then move the bridge to change the vibrating length l.', mistake: 'Changing the load between forks.', keys: ['tension', 'constant'] },
  bridge: { name: 'Moving bridge', purpose: 'Sets the vibrating length l between the bridges.', how: 'Move it slowly while the fork sounds; read its edge on the scale.', mistake: 'Moving it too fast past the resonance.', keys: ['slowly', 'bridge'] },
  rider: { name: 'Paper rider', purpose: 'A small folded paper on the middle of the wire: it is thrown off at resonance.', how: 'Put it at the centre of the vibrating length.', mistake: 'Putting it near a bridge, where the wire hardly moves.', keys: ['rider', 'middle', 'centre'] },
  hanger: { name: 'Hanger and slotted masses', purpose: 'The load M over the pulley gives the tension T = Mg.', how: 'Add masses gently; keep the same load for every fork.', mistake: 'Dropping masses on (the wire can snap).', keys: ['tension', 'load'] },
  masses: { name: 'Slotted masses', purpose: '0.5 kg each; the hanger is 1 kg.', how: 'Slide them onto the hanger one at a time.', mistake: 'Overloading the wire.', keys: ['load'] },
  book: { name: 'Practical notebook', purpose: 'Your table, graph and answers — this is what is marked.', how: 'Lengths to 0.1 cm; v in m s⁻¹.', mistake: 'Plotting l against f (a curve) instead of 1/f.', keys: ['graph', 'slope'] },
  card: { name: 'Task card', purpose: 'The question paper: the forks to use and what to plot.', how: 'Read it before you start.', mistake: '—', keys: [] },
  bob: { name: 'Pendulum bob', purpose: 'For the simple pendulum, not this practical.', how: 'Not needed here.', mistake: '—', keys: [] },
  lens: { name: 'Converging lens', purpose: 'For the optics practicals, not this one.', how: 'Not needed here.', mistake: '—', keys: [] },
  coat: { name: 'Lab coat', purpose: 'Keeps your clothes clean.', how: 'Optional here.', mistake: '—', keys: [] },
  goggles: { name: 'Safety goggles', purpose: 'Eye protection: a wire under tension can snap and whip.', how: 'Wear them while loading the sonometer.', mistake: '—', keys: ['snap', 'whip', 'eye'] },
  co2: { name: 'CO₂ fire extinguisher', purpose: 'For electrical fires.', how: 'Tell the teacher first.', mistake: '—', keys: [] },
  blanket: { name: 'Fire blanket', purpose: 'Smothers a small fire.', how: 'Pull both tapes down sharply.', mistake: '—', keys: [] },
  extinguisher: { name: 'Fire extinguisher', purpose: 'Puts out small fires.', how: 'Pull the pin, aim at the base, squeeze, sweep.', mistake: '—', keys: [] },
  firstaid: { name: 'First-aid box', purpose: 'Plasters and dressings.', how: 'Tell the teacher about every injury.', mistake: '—', keys: [] },
  eyewash: { name: 'Eye-wash station', purpose: 'Rinses the eyes.', how: 'Rinse for 10 minutes.', mistake: '—', keys: [] },
  notice: { name: 'Notice board', purpose: 'Department notices.', how: '—', mistake: '—', keys: [] },
  shelf: { name: 'Physics equipment shelf', purpose: 'Equipment for other practicals.', how: '—', mistake: '—', keys: [] },
  vdg: { name: 'Van de Graaff generator', purpose: 'High-voltage demonstrations.', how: 'Teacher only.', mistake: '—', keys: [] },
  whiteboard: { name: 'Whiteboard', purpose: 'Today’s practical.', how: 'Read it as you come in.', mistake: '—', keys: [] },
  desk: { name: 'Teacher’s desk', purpose: 'Where the teacher checks your work.', how: '—', mistake: '—', keys: [] },
  'poster-si': { name: 'Poster: SI base units', purpose: 'The seven base units.', how: 'Hz = s⁻¹; speed in m s⁻¹.', mistake: '—', keys: [] },
  'poster-light': { name: 'Poster: refraction of light', purpose: 'For the optics practicals.', how: '—', mistake: '—', keys: [] },
  'poster-electric': { name: 'Poster: electrical safety', purpose: 'Rules for circuits.', how: '—', mistake: '—', keys: [] },
};
export const explainer = makeExplainer(E);

export const ASK_SUGGESTIONS: AskSuggestions = {
  LEARN: ['What is resonance?', 'Why is there an end correction?', 'Why does a lower fork need a longer tube?', 'How does the tension change the note of a string?'],
  DEMO: ['Why start with a short air column?', 'Why strike the fork on a rubber pad?', 'Why put the rider at the middle?', 'Why plot l against 1/f and not f?'],
  TRY: ['How do I find 1/f?', 'How do I get v from my slope?', 'How do I read the intercept?', 'How do I work out μ?'],
  SANDBOX: ['What happens on a hot day?', 'Why is the second resonance three times as far?', 'Why does the rider stay on at twice the length?', 'What does a heavier wire do?'],
};

/** Mr Bayo's bench for the introduction (display only, never saved). */
export function learnState(task: SoundTask): PhySoundState {
  return {
    ...emptyPhySoundState(),
    task,
    fork: task === 'SONO' ? 256 : 512,
    len: task === 'SONO' ? 40 : 14,
    load: task === 'SONO' ? SONO_CARD_LOAD : 0,
    rider: task === 'SONO',
    log: [{ t: 0, a: `task:${task}` }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` })), ...PLACEABLE[task].map((id) => ({ t: 0, a: `place:${id}` }))],
  };
}

const T14 = tubeTopY(14);
const S: Record<string, Spot> = {
  tube: { target: [JAR.x, T14 - 0.2, JAR.z], dist: 1.2, pitch: 0.1 },
  jar: { target: [JAR.x, -0.4, JAR.z], dist: 1.6, pitch: 0.15 },
  stand: { target: [STAND.x, -0.1, STAND.z], dist: 1.6, pitch: 0.12 },
  rule: { target: [JAR.x + 0.03, T14 - 0.07, JAR.z], dist: 0.4, pitch: 0.05 },
  mouth: { target: [JAR.x, T14, JAR.z], dist: 0.45, pitch: 0.3 },
  forks: { target: [SPOT.forks[0], 0.03, SPOT.forks[2]], dist: 0.5, pitch: 0.8 },
  pad: { target: [SPOT.pad[0], 0.02, SPOT.pad[2]], dist: 0.4, pitch: 0.8 },
  sonometer: { target: [(SONO.x0 + SONO.x1) / 2, 0.1, SONO.z], dist: 1.3, pitch: 0.45 },
  bridge: { target: [bridgeX(40), 0.1, SONO.z], dist: 0.45, pitch: 0.7 },
  rider: { target: [(SONO.fixed + bridgeX(40)) / 2, 0.12, SONO.z], dist: 0.35, pitch: 0.35 },
  hanger: { target: [SONO.pulleyX, -0.15, SONO.z], dist: 0.8, pitch: 0.1 },
};
const MATCH: Record<SoundTask, [RegExp, string][]> = {
  TUBE: [
    [/resonance tube|jar|water/i, 'tube'],
    [/tuning fork/i, 'forks'],
    [/rubber pad/i, 'pad'],
    [/metre rule/i, 'rule'],
    [/clamp|stand/i, 'stand'],
  ],
  SONO: [
    [/sonometer|bridge/i, 'sonometer'],
    [/hanger|mass/i, 'hanger'],
    [/tuning fork/i, 'forks'],
    [/metre rule|scale/i, 'bridge'],
    [/rubber pad/i, 'pad'],
    [/rider|paper/i, 'rider'],
  ],
};

/** Learn's camera spots for the task. */
export function learnConfig(task: SoundTask): LearnConfig {
  const sono = task === 'SONO';
  return {
    items: MATCH[task].map(([match, id]) => ({ match, id, spot: S[id]! })),
    explain: explainer,
    procedure: [
      { spot: sono ? S.sonometer! : S.tube!, point: sono ? 'sonometer' : 'tube' },
      { spot: sono ? S.rider! : S.mouth!, point: sono ? 'rider' : 'tube' },
    ],
    observe: { spot: sono ? S.sonometer! : S.tube!, point: sono ? 'bridge' : 'tube' },
    observeTitle: 'What you should find',
  };
}
