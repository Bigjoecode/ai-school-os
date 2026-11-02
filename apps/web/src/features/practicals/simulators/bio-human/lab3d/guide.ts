import { BREATH_MIN, PULSE_MIN_REST, REACT_CONDS, REACT_MIN_DOM, REACT_MIN_OTHER, SKIN_AREAS, SKIN_AREA_LABEL, breathTotal, pulseExEnd, type BioHumanState } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { neededFor, type HumanScene } from './scene-state';

/**
 * Guided mode (practice only): the WAEC routine as a checklist, without
 * giving away the readings. Corrections teach the habits that matter: rest
 * first, fingertips not the thumb, count at once; breathe gently, a dry
 * mirror; drop without warning; blindfold and single-point checks.
 */

export function humanGuideSteps(s: BioHumanState, scene: HumanScene, mode: CameraMode): GuideStep[] {
  const task = s.task ?? 'PULSE';
  const missing = neededFor(task).filter((a) => !scene.collected.has(a.id));
  const begun = s.log.some((e) => /^(screen|wait|count|exercise|mouthpiece|lime|breathe|knee|arm|zero|drop|blind|clean|touch)/.test(e.a));
  const steps: GuideStep[] = [
    { id: 'safety', label: 'Put on your lab coat', target: !scene.coat ? 'coat' : null, why: 'Lab coats are worn for every practical.', done: scene.coat },
    { id: 'collect', label: `Collect your apparatus${missing.length ? ` (${missing.length} to go)` : ''}`, target: 'cupboard', why: neededFor(task).map((a) => a.label).join(', ') + '.', done: !missing.length },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front — your partner is waiting.', done: mode !== 'walk' || begun },
  ];
  const tail = (): GuideStep[] => [
    { id: 'written', label: 'Write two precautions and your explanation', target: 'book', why: 'Precautions are things you did to make the results reliable or safe.', done: !!s.written.precautions.trim() && !!s.written.explain.trim() },
    { id: 'wash', label: 'Wash your hands', target: 'handwash', why: 'Before you leave the laboratory.', done: scene.washedAtEnd },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  ];

  if (task === 'PULSE') {
    const w = s.pulse;
    const end = pulseExEnd(w);
    const rest = w.counts.filter((c) => !w.exercise || c.at < w.exercise.at);
    const after = w.counts.filter((c) => end !== null && c.at >= end - 1e-9).length;
    const filled = w.rows.filter((r) => r.beats.trim() && r.bpm.trim()).length;
    steps.push(
      { id: 'screen', label: 'Ask about asthma, heart or sickle-cell problems', target: 'partner', why: 'Anyone with one of these records instead of exercising.', done: w.screened, group: 'Resting' },
      { id: 'rest', label: `Let your partner sit quietly for ${PULSE_MIN_REST} minutes (${Math.floor(w.clock)} min)`, target: 'clock', why: 'Walking in raises the pulse; it settles as they sit.', done: w.clock >= PULSE_MIN_REST || !!w.exercise, group: 'Resting' },
      { id: 'restcount', label: `Count the pulse for 15 s with two fingertips, three times (${rest.length} of 3)`, target: 'wrist', why: 'The radial pulse is on the thumb side of the wrist. Not your thumb: it has a pulse of its own.', done: rest.length >= 3, group: 'Resting' },
      { id: 'exercise', label: 'Step-ups for 2 minutes', target: 'step', why: 'The same exercise for everyone, at a steady rhythm.', done: !!w.exercise, group: 'Exercise' },
      { id: 'at-once', label: 'Count for 15 s immediately', target: 'wrist', why: 'The pulse starts to fall as soon as the exercise stops.', done: after >= 1, group: 'Recovery' },
      { id: 'every', label: `Every minute until back to rest (${Math.max(0, after - 1)} min so far)`, target: 'clock', why: '“Wait to the next minute”, then count 15 s again.', done: after >= 6, group: 'Recovery' },
      { id: 'table', label: `Fill in beats and beats/min (${filled} of ${w.counts.length})`, target: 'book', why: 'Beats/min = beats in 15 s × 4.', done: w.counts.length > 0 && filled === w.counts.length, group: 'Results' },
      { id: 'graph', label: 'Plot the graph; resting mean, % increase, recovery time', target: 'book', why: 'Time on the x-axis; a smooth curve.', done: !!w.axis && !!w.curve && !!w.restMean.trim() && !!w.increase.trim() && !!w.recovery.trim() && w.claims.length > 0, group: 'Results' },
      ...tail(),
    );
    return steps;
  }
  if (task === 'BREATH') {
    const w = s.breath;
    steps.push(
      { id: 'mouthpiece', label: 'Fit a clean mouthpiece', target: 'mouthpiece', why: 'A fresh one for each student.', done: w.mouthpiece, group: 'Lime water' },
      { id: 'lime', label: 'Equal volumes of lime water in A and B', target: 'limewater', why: 'A fair comparison.', done: !!w.lime, group: 'Lime water' },
      { id: 'breathe', label: `Partner breathes gently through it about 10 times (${breathTotal(w)})`, target: 'apparatus', why: 'In through A, out through B. Gently: never suck lime water up.', done: breathTotal(w) >= BREATH_MIN, group: 'Lime water' },
      { id: 'mirror', label: 'Wipe the mirror dry; partner breathes on it', target: 'mirror', why: 'Any moisture already on it would spoil the test.', done: w.breathed, group: 'Water vapour' },
      { id: 'cobalt', label: 'Test the mist with cobalt chloride paper', target: 'cobalt', why: 'Water turns it from blue to pink.', done: w.cobalt, group: 'Water vapour' },
      { id: 'temps', label: 'Room temperature, then breath on the bulb', target: 'thermometer', why: 'Room first, while the bulb is at room temperature.', done: !!w.troom && w.tbreath, group: 'Heat' },
      { id: 'count', label: `Count breaths at rest for 1 minute, three times (${w.counts} of 3)`, target: 'clock', why: 'Three counts give a reliable mean.', done: w.counts >= 3, group: 'Breathing rate' },
      { id: 'record', label: 'Record observations, temperatures, mean, ventilation, ratio', target: 'book', why: 'Ventilation = rate × 500 cm³; 4 ÷ 0.04.', done: !!w.firstMilky && !!w.obsA.trim() && !!w.obsB.trim() && !!w.mirrorObs.trim() && !!w.vent.trim() && !!w.ratio.trim() && w.claims.length > 0, group: 'Results' },
      ...tail(),
    );
    return steps;
  }
  if (task === 'REACTION') {
    const w = s.react;
    const n = (c: (typeof REACT_CONDS)[number]) => w.drops.filter((d) => d.cond === c).length;
    const filled = w.rows.every((r) => r.ds.every((d) => d.trim()) && (!r.ds.length || (r.mean.trim() && r.t.trim())));
    steps.push(
      { id: 'knee', label: 'Knee-jerk: tap below the kneecap with the side of your hand', target: 'knee', why: 'One leg crossed loosely over the other.', done: !!w.knee, group: 'Reflex' },
      { id: 'setup', label: 'Forearm on the bench edge; thumb level with 0 cm', target: 'partner', why: 'The same starting position every time.', done: w.arm && w.zero, group: 'Ruler drop' },
      { id: 'dom', label: `Drop it without warning, dominant hand (${n('DOM')} of ${REACT_MIN_DOM})`, target: 'rule', why: 'Read the distance at the top of the thumb.', done: n('DOM') >= REACT_MIN_DOM, group: 'Ruler drop' },
      { id: 'nondom', label: `Non-dominant hand (${n('NONDOM')} of ${REACT_MIN_OTHER})`, target: 'rule', why: 'Compare the two hands.', done: n('NONDOM') >= REACT_MIN_OTHER, group: 'Ruler drop' },
      { id: 'table', label: 'Distances, means, metres and t = √(2d ÷ g)', target: 'book', why: 'Convert cm to m before the formula.', done: w.drops.length > 0 && filled, group: 'Results' },
      { id: 'compare', label: 'Compare the hands and the effect of practice; conclude', target: 'book', why: 'From your own numbers.', done: !!w.faster && !!w.trend && w.claims.length > 0 && !!w.kneeObs.trim(), group: 'Results' },
      ...tail(),
    );
    return steps;
  }
  const w = s.skin;
  const done = SKIN_AREAS.filter((a) => w.trials.some((t) => t.area === a));
  const next = SKIN_AREAS.find((a) => !done.includes(a));
  steps.push(
    { id: 'clean', label: 'Clean the points with alcohol', target: 'wipes', why: 'Between subjects.', done: w.cleaned, group: 'Set up' },
    { id: 'blind', label: 'Blindfold your partner', target: 'partner', why: 'They must not see the points.', done: w.blind, group: 'Set up' },
    { id: 'areas', label: `Find the threshold on each area (${done.length} of 5${next ? `; next: ${SKIN_AREA_LABEL[next].toLowerCase()}` : ''})`, target: next ? `area:${next}` : 'dividers', why: 'Start wide, reduce step by step until only one point is felt; mix in single-point touches.', done: done.length >= SKIN_AREAS.length, group: 'Touches' },
    { id: 'table', label: 'Threshold, touches, correct and % for each area', target: 'book', why: 'Count from your tally.', done: done.length > 0 && done.every((a) => w.rows[SKIN_AREAS.indexOf(a)]!.thr.trim() && w.rows[SKIN_AREAS.indexOf(a)]!.pct.trim()), group: 'Results' },
    { id: 'chart', label: 'Bar chart, ranking, ratio and conclusions', target: 'book', why: 'Smaller threshold = receptors closer together.', done: w.bars.length >= 4 && w.rank.length >= 4 && !!w.ratio.trim() && w.claims.length > 0, group: 'Results' },
    ...tail(),
  );
  return steps;
}

/** A gentle correction for a step just recorded in the log (null: nothing wrong). */
export function humanCorrection(a: string, s: BioHumanState): Correction | null {
  const [verb, arg] = a.split(':') as [string, string | undefined];
  if (verb === 'count-thumb') return { title: 'Use your fingertips, not your thumb.', why: 'Your thumb has a pulse of its own, which mixes with your partner’s and spoils the count.', focus: 'wrist' };
  if (verb === 'count' && !s.pulse.exercise && s.pulse.clock - Number(arg ?? 15) / 60 < PULSE_MIN_REST - 1e-9) return { title: 'Let your partner rest first.', why: `They have only been sitting ${Math.floor(s.pulse.clock)} minutes: the pulse is still raised from walking in. Rest ${PULSE_MIN_REST} minutes before the resting counts.`, focus: 'wrist' };
  if (verb === 'exercise' && !s.pulse.screened) return { title: 'Check your partner can exercise.', why: 'Ask about asthma, heart or sickle-cell problems before any exercise.', focus: 'partner' };
  if (verb === 'wait' && s.pulse.exercise) {
    const end = pulseExEnd(s.pulse)!;
    if (!s.pulse.counts.some((c) => c.at >= end - 1e-9)) return { title: 'Count at once after the exercise.', why: 'The pulse starts falling the moment the exercise stops; a delay misses the peak.', focus: 'wrist' };
  }
  if (verb === 'breathe' && arg === 'hard') return { title: 'Breathe gently.', why: 'Blowing or sucking hard splashes lime water — it could be drawn into the mouth.', focus: 'apparatus' };
  if (verb === 'breathe' && !s.breath.mouthpiece) return { title: 'Fit a clean mouthpiece.', why: 'Use a fresh, clean mouthpiece for each student.', focus: 'apparatus' };
  if (verb === 'lime' && arg === 'UNEQUAL') return { title: 'Use equal volumes.', why: 'Different volumes of lime water make the comparison unfair.', focus: 'apparatus' };
  if (verb === 'mirror' && !s.breath.wiped) return { title: 'Wipe the mirror dry first.', why: 'Moisture already on the mirror would turn the cobalt chloride paper pink anyway.', focus: 'mirror' };
  if (verb === 'tbreath' && !s.breath.troom) return { title: 'Read the room temperature first.', why: 'After breathing on it the bulb stays warm for a while.', focus: 'mirror' };
  if (verb === 'knee' && arg === 'HARD') return { title: 'Use the side of your hand.', why: 'A hard object can hurt; a gentle tap with the side of the hand is enough.', focus: 'knee' };
  if (verb === 'drop-warn') return { title: 'Drop without warning.', why: 'When you signal, the catcher anticipates and the distance is far too short.', focus: 'rule' };
  if (verb === 'drop' && (!s.react.arm || !s.react.zero)) return { title: 'Check the starting position.', why: 'Forearm resting on the bench edge, the top of the thumb level with 0 cm — the same every time.', focus: 'rule' };
  if (verb === 'touch' && !s.skin.blind) return { title: 'Blindfold your partner.', why: 'If they can see the points, they are not reporting what they feel.', focus: 'partner' };
  if (verb === 'together' && arg === 'off') return { title: 'Both points together.', why: 'If one point lands after the other, the subject feels two touches whatever the gap.', focus: 'partner' };
  if (verb === 'collect' && arg && !neededFor(s.task ?? 'PULSE').some((x) => x.id === arg)) return { title: 'That is not needed for this practical.', why: 'Only take what the practical needs; you can put it back from your bench or from the cupboard list.' };
  return null;
}
