import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';

/** The pendulum lab's "What is this?" cards and suggested questions for Mr Bayo. */
const E: Record<string, Explainer> = {
  stand: { name: 'Retort stand and clamp', purpose: 'Holds the split cork, and so the point of suspension, firmly in place.', how: 'Stand the base square on the bench (weight it if it wobbles) and clamp the cork tightly at the top of the rod.', mistake: 'A wobbly stand: the support moves and the period changes.', keys: ['stand', 'clamp', 'topple', 'rigid'] },
  cork: { name: 'Split cork', purpose: 'Grips the thread so the point of suspension is fixed and sharp.', how: 'Pull the thread through the slit to change its length, then close the clamp. Drag the cork up or down here.', mistake: 'Tying the thread round the rod: the point of suspension is then not fixed.', keys: ['split cork', 'rigid', 'suspension'] },
  bob: { name: 'Pendulum bob', purpose: 'The mass that swings. Its centre is where the length l is measured to.', how: 'Pull it aside through a small angle (under 10°) and let go — do not push it. It should swing in one vertical plane without spinning.', mistake: 'A large swing, or measuring l only to the top of the bob.', keys: ['bob', 'small angle', 'vertical plane', 'centre'] },
  rule: { name: 'Metre rule', purpose: 'Measures the thread from the point of suspension to the top of the bob.', how: 'Hold it upright beside the thread, zero at the bottom of the cork, read at eye level, then add the radius of the bob to get l.', mistake: 'Parallax (reading from above or below), or forgetting the radius.', keys: ['metre rule', 'parallax', 'radius'] },
  stopwatch: { name: 'Stopwatch', purpose: 'Times a number of complete oscillations.', how: 'Start it as the bob passes the fiducial mark, count "0", and stop it after 20 complete oscillations, passing the mark the same way.', mistake: 'Starting at the end of a swing, or counting the first pass as "1".', keys: ['stopwatch', 'oscillations', 'reaction'] },
  protractor: { name: 'Protractor', purpose: 'Shows the angle the thread makes with the vertical when you pull the bob aside.', how: 'Its centre is at the point of suspension; keep the angle under 10°.', mistake: 'Large angles: the motion is then not simple harmonic.', keys: ['angle', 'small angle'] },
  fiducial: { name: 'Fiducial mark', purpose: 'A fixed line behind the bob at its rest (mean) position, to start and stop timing against.', how: 'Start and stop the watch as the bob crosses the line — it moves fastest there, so the instant is sharp.', mistake: 'Timing from the end of a swing, where the bob seems to hang.', keys: ['fiducial', 'mean position', 'rest position'] },
  window: { name: 'The window', purpose: 'Open, it lets in a draught that pushes the bob about.', how: 'Close it (the ceiling fans stop too) before you time any swings.', mistake: 'Timing in a draught: the times scatter.', keys: ['draught', 'fan', 'wind'] },
  book: { name: 'Practical notebook', purpose: 'Your table of l, t, T and T², the graph, the slope and g — this is what is marked.', how: 'Copy the stopwatch reading exactly; T = t ÷ n; T² to 3 or 4 significant figures.', mistake: 'Writing l to the top of the bob, or rounding the times.', keys: ['table', 'record'] },
  card: { name: 'Task card', purpose: 'The question paper: the bob’s diameter and the lengths to use.', how: 'Read it before you start and again before the calculation.', mistake: 'Missing the bob’s diameter.', keys: [] },
  spring: { name: 'Helical spring', purpose: 'For Hooke’s law and loaded-spring practicals.', how: 'Not needed for a simple pendulum.', mistake: 'Taking apparatus you do not need.', keys: [] },
  masses: { name: 'Slotted masses', purpose: 'Known masses for springs and moments.', how: 'Not needed: the period of a simple pendulum does not depend on its mass.', mistake: 'Thinking a heavier bob swings faster.', keys: [] },
  prism: { name: 'Glass prism', purpose: 'For refraction and dispersion practicals.', how: 'Not needed here.', mistake: 'Cluttering the bench.', keys: [] },
  co2: { name: 'CO₂ extinguisher', purpose: 'For electrical fires (it leaves no water).', how: 'Tell the teacher; pull the pin, aim at the base of the fire, squeeze.', mistake: 'Using water on anything electrical.', keys: [] },
  blanket: { name: 'Fire blanket', purpose: 'Smothers a small fire or wraps a person whose clothes are burning.', how: 'Pull the tapes sharply down, hold it in front of you and lay it over the fire.', mistake: 'Throwing it from a distance.', keys: [] },
  extinguisher: { name: 'Fire extinguisher', purpose: 'Puts out small fires.', how: 'Tell the teacher first. Pull the pin, aim at the base, squeeze, sweep.', mistake: 'Not knowing where it is.', keys: [] },
  firstaid: { name: 'First-aid box', purpose: 'Plasters and dressings for small injuries.', how: 'Report every injury to the teacher.', mistake: 'Hiding a small cut.', keys: [] },
};
export const explainer = makeExplainer(E);

export const ASK_SUGGESTIONS: AskSuggestions = {
  LEARN: ['Why must the angle be small?', 'Why measure l to the centre of the bob?', 'Why time 20 oscillations, not one?', 'Why plot T² and not T?'],
  DEMO: ['Why start the watch at the fiducial mark?', 'Why do you count "0" at the start?', 'How do you get the slope from the graph?', 'Why close the window?'],
  TRY: ['How do I count oscillations correctly?', 'What is the effective length l?', 'How do I find the slope of T² against l?', 'How do I get g from the slope?'],
  SANDBOX: ['What happens to the period on the Moon?', 'Does a heavier bob change the period?', 'What if the angle is large?', 'Why does a longer pendulum swing more slowly?'],
};
