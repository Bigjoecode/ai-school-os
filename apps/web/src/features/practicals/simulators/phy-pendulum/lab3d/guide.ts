import { PENDULUM_MEAN_ZONE, PENDULUM_SMALL_ANGLE, pendulumPeriod, type PhyPendulumState, type PhyPendulumVariant } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import type { Swing, Watch } from '../actions';
import { APPARATUS, APPARATUS_LABEL, NEEDED, type ApparatusId, type SceneState } from './scene-state';

/**
 * Guided mode (practice only): the pendulum as a checklist — collect, close
 * the window, then for each length on the task card: set the thread, a small
 * angle, release, start at the mark, stop after 20, record — and gentle
 * corrections, with the reason, when a timing is taken the wrong way.
 */

/** The next length on the task card that has not been timed yet. */
export const nextLength = (s: PhyPendulumState, v: PhyPendulumVariant) => v.suggested.find((L) => !s.runs.some((r) => Math.abs(r.thread - L) < 0.6)) ?? null;
const distinct = (s: PhyPendulumState) => {
  const out: number[] = [];
  for (const r of s.runs) if (!out.some((x) => Math.abs(x - r.thread) < 2)) out.push(r.thread);
  return out.length;
};

export function guideSteps(s: PhyPendulumState, scene: SceneState, mode: CameraMode, v: PhyPendulumVariant, swing: Swing | null, watch: Watch): GuideStep[] {
  const missing = NEEDED.filter((a) => !scene.collected.has(a.id));
  const steps: GuideStep[] = [
    { id: 'collect', label: `Collect your apparatus${missing.length ? ` (${missing.length} to go)` : ''}`, target: 'cupboard', why: 'A retort stand and clamp, a split cork, the bob on its thread, a metre rule, a stopwatch and a protractor.', done: !missing.length },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front: the pendulum hangs over the front edge.', done: mode !== 'walk' || s.runs.length > 0 },
    { id: 'window', label: 'Close the window (it stops the draught and the fans)', target: 'window', why: 'Draughts push the bob about and scatter your times.', done: s.shielded },
  ];
  const L = nextLength(s, v);
  const k = distinct(s);
  if (L !== null && k < v.suggested.length) {
    const group = `Length ${Math.min(k + 1, v.suggested.length)}: thread ${L} cm`;
    const setOk = Math.abs(s.thread - L) < 0.26;
    const swingOk = !!swing && Math.abs(swing.thread - L) < 0.26;
    steps.push(
      { id: 'length', label: `Set the thread to ${L} cm (to the top of the bob)`, target: 'cork', why: 'Pull the thread through the split cork; read the metre rule at eye level. Then l = thread + radius of the bob.', done: setOk || swingOk, group },
      { id: 'angle', label: 'Displace the bob through a small angle (10° or less)', target: 'bob', why: 'Only small swings are simple harmonic, so the period does not depend on the angle.', done: swingOk ? swing!.amplitude <= PENDULUM_SMALL_ANGLE : s.amplitude <= PENDULUM_SMALL_ANGLE, group },
      { id: 'release', label: 'Release the bob (do not push it)', target: 'bob', why: 'It should swing in one vertical plane without spinning.', done: swingOk, group },
      { id: 'start', label: 'Start the stopwatch as the bob passes the fiducial mark', target: 'stopwatch', why: 'It moves fastest at the mean position, so the instant is sharp. Count "0".', done: swingOk && watch.start !== null, group },
      { id: 'stop', label: `Stop it after ${s.n >= 20 ? s.n : 20} complete oscillations`, target: 'stopwatch', why: 'Stop as it passes the mark the same way, on the count of 20. Many oscillations share out your reaction time.', done: swingOk && watch.stop !== null, group },
      { id: 'record', label: 'Record the timing', target: 'stopwatch', why: 'A new row appears in your notebook: copy the stopwatch reading into t.', done: false, group },
    );
  }
  const filled = s.runs.length > 0 && s.table.every((r, i) => i >= s.runs.length || (r.l.trim() && r.t.trim() && r.T.trim() && r.T2.trim()));
  steps.push(
    { id: 'table', label: 'Fill in l, t, T and T² for every timing', target: 'book', why: 'l = thread + radius; T = t ÷ number of oscillations; T² = T × T.', done: k >= 5 && filled },
    { id: 'graph', label: 'Plot T² against l and draw the best straight line', target: 'book', why: 'It should pass through (or close to) the origin.', done: !!s.line },
    { id: 'calc', label: 'Find the slope and g = 4π²/slope, with units', target: 'book', why: 'Use two points far apart on your line; slope in s² m⁻¹ (or s² cm⁻¹), g in m s⁻².', done: !!s.answers.slope.value.trim() && !!s.answers.g.value.trim() && !!s.answers.slope.unit.trim() && !!s.answers.g.unit.trim() },
    { id: 'precautions', label: 'Write two precautions', target: 'book', why: 'For example: small angle; timed from the mean position; window closed; length to the centre of the bob.', done: !!s.written.precautions.trim() },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  );
  return steps;
}

/** A gentle correction for a step just recorded (null: nothing wrong). */
export function correctionFor(a: string, s: PhyPendulumState, v: PhyPendulumVariant): Correction | null {
  const [verb, arg] = a.split(':') as [string, string | undefined];
  if (verb === 'collect' && arg && !APPARATUS.find((x) => x.id === arg)?.needed)
    return { title: `The ${APPARATUS_LABEL[arg as ApparatusId].toLowerCase()} is not needed for a simple pendulum.`, why: 'Only take what the practical needs; you can put it back from the cupboard list.' };
  if (verb === 'open-window') return { title: 'You opened the window: there is a draught again.', why: 'Draughts disturb the swing and scatter your times. Close it before timing.', focus: 'pendulum' };
  if (verb === 'release') {
    const deg = Number((a.split(':')[2] ?? '').replace('deg', ''));
    if (deg > PENDULUM_SMALL_ANGLE) return { title: `That swing is ${deg}° — too large.`, why: `Keep the angle at ${PENDULUM_SMALL_ANGLE}° or less: only small swings are simple harmonic, and the period then does not depend on the angle.`, focus: 'cork' };
  }
  if (verb === 'record') {
    const i = s.runs.length - 1;
    const run = s.runs[i];
    if (!run) return null;
    if (!run.shielded) return { title: 'That timing was taken in a draught.', why: 'Close the window first: a draught pushes the bob and changes the period.', focus: 'pendulum' };
    if (run.startPhase > PENDULUM_MEAN_ZONE) return { title: 'Start the stopwatch at the fiducial mark.', why: 'The bob moves fastest as it passes the mean position, so the starting instant is sharp. At the end of a swing it seems to hang, and your start is late or early.', focus: 'bob' };
    const T = pendulumPeriod(v, run.thread, run.amplitude, i, run.shielded);
    const count = run.elapsed / T;
    if (Math.abs(count - run.n) > 0.25) return { title: `That was about ${count.toFixed(1)} oscillations, not ${run.n}.`, why: 'Count "0" as you start the watch, then one each time the bob comes back past the mark going the same way. Delete this row and time it again.', focus: 'stopwatch' };
    if (run.n < 20) return { title: `Only ${run.n} oscillations were timed.`, why: 'Time at least 20: your reaction time is then shared over many swings.', focus: 'stopwatch' };
  }
  return null;
}

/** The plain hint (practice with guided mode off). */
export function nextHint3d(scene: SceneState, hint2d: string): string {
  const missing = NEEDED.filter((a) => !scene.collected.has(a.id));
  if (missing.length) return `Collect your apparatus from the cupboard: ${missing.map((a) => a.label.toLowerCase()).join(', ')}.`;
  return hint2d;
}
