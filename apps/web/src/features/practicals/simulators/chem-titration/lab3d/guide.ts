import { TITRATION_INDICATOR_INFO, titrationEndpoint, type ChemTitrationState, type ChemTitrationVariant, type TitrationIndicator } from '@aischool/shared';
import { APPARATUS, APPARATUS_LABEL, type ApparatusId, type SceneState } from './scene-state';
import type { CameraMode } from './store';

/**
 * Guided mode (practice only): the titration as a checklist with the object
 * to use next, and gentle corrections — with the reason — when a step is done
 * the wrong way. Everything is worked out from the state the lab already
 * records; nothing here changes what is marked.
 */

export interface GuideStep {
  id: string;
  label: string;
  /** The object to use (a selectable id in the scene), if any. */
  target: string | null;
  /** Why the step matters (shown under the current step and said by the assistant). */
  why: string;
  done: boolean;
  /** Steps of the same titration run share a group heading. */
  group?: string;
}

export function guideSteps(s: ChemTitrationState, scene: SceneState, mode: CameraMode, v: ChemTitrationVariant): GuideStep[] {
  const filled = s.burette !== null;
  const missing = APPARATUS.filter((a) => a.needed && !scene.collected.has(a.id));
  const steps: GuideStep[] = [
    { id: 'safety', label: 'Put on your lab coat and goggles', target: !scene.coat ? 'coat' : !scene.goggles ? 'goggles' : null, why: 'Acids and alkalis can splash into your eyes and onto your clothes.', done: scene.coat && scene.goggles },
    { id: 'collect', label: `Collect your apparatus${missing.length ? ` (${missing.length} to go)` : ''}`, target: 'cupboard', why: 'A burette, a pipette with its filler, a conical flask, a funnel, a retort stand, a white tile, a waste beaker and a wash bottle.', done: !missing.length },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front. Your solutions A and B are there.', done: mode !== 'walk' || scene.clamped },
    { id: 'rinse-burette', label: 'Rinse the burette with acid A', target: 'burette', why: 'Water left inside would dilute A and make every titre too large.', done: s.setup.burette === 'ACID' },
    { id: 'clamp', label: 'Clamp the burette upright on the stand', target: 'burette', why: 'A vertical burette reads correctly and drains straight into the flask.', done: scene.clamped },
    { id: 'funnel', label: 'Put the funnel in the burette', target: 'funnel', why: 'It stops acid splashing as you fill. Fill below eye level.', done: s.funnelIn || filled },
    { id: 'fill', label: 'Fill the burette with A', target: filled ? 'burette' : 'bottleA', why: 'Fill to just around the zero mark.', done: filled },
    { id: 'bubble', label: 'Clear the air bubble from the jet', target: 'beaker', why: 'An air bubble in the jet fills with acid during the titration and adds to the reading.', done: filled && !scene.bubble },
    { id: 'unfunnel', label: 'Remove the funnel', target: 'funnel', why: 'Drips from the funnel would change the reading.', done: filled && !s.funnelIn },
    { id: 'rinse-pipette', label: 'Rinse the pipette with base B', target: 'pipette', why: 'Water left inside would dilute the 25.0 cm³ of B you measure.', done: s.setup.pipette === 'BASE' },
    { id: 'filler', label: 'Fit the pipette filler', target: 'filler', why: 'Never pipette by mouth: B is corrosive.', done: scene.fillerOn },
  ];

  // The current titration run: rough first, then accurate ones until two agree.
  const done = s.runs.filter((r) => r.done);
  const openIndex = s.runs.findIndex((r) => !r.done);
  const open = openIndex >= 0 ? s.runs[openIndex]! : null;
  const accurateDone = done.filter((r) => r.kind === 'ACCURATE').length;
  const runNo = open ? s.runs.slice(0, openIndex + 1).filter((r) => r.kind === 'ACCURATE').length : accurateDone + (done.length ? 1 : 0);
  const group = (open ? open.kind === 'ROUGH' : !done.length) ? 'Rough titration' : `Accurate titration ${Math.max(1, runNo)}`;
  const enough = done.length > 0 && accurateDone >= 2;
  if (!enough) {
    const row = open ? s.table[openIndex] : null;
    steps.push(
      { id: 'rinse-flask', label: 'Rinse the conical flask with distilled water', target: 'flask', why: 'Only water: any B left in the flask would add to the 25.0 cm³ and raise the titre.', done: !!open || s.setup.flask === 'WATER', group },
      { id: 'pipette', label: 'Pipette 25.0 cm³ of B into the flask', target: 'pipette', why: 'Draw B up past the mark with the filler, let it down to the mark, run it in and touch the tip on the flask.', done: !!open, group },
      { id: 'indicator', label: 'Add 2–3 drops of a suitable indicator', target: `ind:${s.setup.indicator ?? v.indicators[0]}`, why: `Think: which indicator changes colour at this acid and base's end point? (${v.acid.formula} with ${v.base.formula})`, done: !!open?.indicator, group },
      { id: 'tile', label: 'Stand the flask on the white tile', target: 'flask', why: 'The white tile makes the colour change easy to see.', done: !!open && scene.flaskUnder, group },
      { id: 'initial', label: 'Read the burette at eye level and write the initial reading', target: 'burette', why: 'Read the bottom of the meniscus, with your eye level with it, to 2 decimal places.', done: !!row?.initial.trim(), group },
      {
        id: 'titrate',
        label: open?.kind === 'ACCURATE' || (!open && done.length) ? 'Run in A quickly to 1 cm³ short of the rough titre, then drop by drop' : 'Run in A, swirling, until the colour changes',
        target: 'tap',
        why: 'Swirl all the time. Near the end point add one drop at a time: one drop should change the colour.',
        done: false,
        group,
      },
      { id: 'final', label: 'Close the tap and record the final reading', target: 'burette', why: 'Then subtract: titre = final − initial.', done: false, group },
    );
    if (accurateDone || done.length) steps.push({ id: 'repeat', label: `Accurate titrations done: ${accurateDone} of at least 2`, target: null, why: 'Repeat until two accurate titres agree within 0.10 cm³.', done: false });
  }
  const calc = Object.values(s.answers).every((a) => a.value.trim() && a.unit.trim());
  steps.push(
    { id: 'table', label: 'Fill in every titre in your notebook', target: 'book', why: 'Every reading and titre to 2 decimal places.', done: enough && s.table.every((r) => r.initial.trim() && r.final.trim() && r.titre.trim()) },
    { id: 'calc', label: 'Work out the calculations, with units', target: 'book', why: 'Use the mean of your concordant titres and the mole ratio in the equation.', done: calc },
    { id: 'written', label: 'Write the colour change and two precautions', target: 'book', why: 'From the colour in B to the colour at the end point.', done: !!s.written.endpoint.trim() && !!s.written.precautions.trim() },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  );
  return steps;
}
export const currentStep = (steps: GuideStep[]) => steps.find((x) => !x.done) ?? null;

export interface Correction {
  title: string;
  why: string;
  /** What the camera should look at, for the debrief "show me". */
  focus?: 'burette' | 'flask' | 'bench';
}

/** A gentle correction for a step just recorded in the log (null: nothing wrong). */
export function correctionFor(a: string, s: ChemTitrationState, v: ChemTitrationVariant, sceneBefore: SceneState): Correction | null {
  const [verb, arg] = a.split(':') as [string, string | undefined];
  if (verb === 'rinse-burette' && arg !== 'ACID')
    return arg === 'WATER'
      ? { title: 'You rinsed the burette with water — rinse it with the acid A.', why: 'Water left on the inside dilutes A, so you would need more of it: every titre comes out too large. Rinse with a little A, drain, then fill.', focus: 'burette' }
      : { title: 'The burette must not be rinsed with the base B.', why: 'B left inside reacts with the acid you put in and changes its concentration. Rinse with A instead.', focus: 'burette' };
  if (verb === 'rinse-pipette' && arg !== 'BASE')
    return arg === 'WATER'
      ? { title: 'You rinsed the pipette with water — rinse it with B.', why: 'Water left in the pipette dilutes the 25.0 cm³ of B you measure, so it holds less base than you think.', focus: 'bench' }
      : { title: 'The pipette should be rinsed with B, not A.', why: 'Acid left inside reacts with some of the B you measure.', focus: 'bench' };
  if (verb === 'rinse-flask' && arg !== 'WATER')
    return { title: 'Rinse the conical flask with distilled water only.', why: `B or A left in the flask changes the amount of base: the flask must hold exactly the 25.0 cm³ you pipette. Water does not change the amount of ${v.base.formula}.`, focus: 'flask' };
  if (verb === 'mouth-pipetting-refused') return { title: 'Never pipette by mouth.', why: 'B is corrosive and could burn your mouth. The pipette filler draws the liquid up safely.' };
  if (verb === 'add-indicator' && arg && !v.indicators.includes(arg as TitrationIndicator)) {
    const info = TITRATION_INDICATOR_INFO[arg as TitrationIndicator];
    return { title: `${info.label} is not a good choice here.`, why: `${v.acid.formula} with ${v.base.formula} needs ${v.indicators.map((i) => TITRATION_INDICATOR_INFO[i].label.toLowerCase()).join(' or ')}: an indicator changes colour over a pH range, and it must change at this reaction's end point. Pour away and start the run again.`, focus: 'flask' };
  }
  if (verb === 'collect' && arg && !APPARATUS.find((x) => x.id === arg)?.needed)
    return { title: `The ${APPARATUS_LABEL[arg as ApparatusId].toLowerCase()} is not needed for a titration.`, why: 'Only take what the practical needs; you can put it back from your bench or the cupboard list.' };
  if (verb === 'start-titrating') {
    if (s.funnelIn) return { title: 'The funnel is still in the burette.', why: 'Drips from the funnel run into the burette while you titrate and spoil the readings. Remove it before taking the initial reading.', focus: 'burette' };
    if (sceneBefore.bubble) return { title: 'There was still an air bubble in the jet.', why: 'The bubble fills with acid as you titrate, so the burette shows more acid used than went into the flask.', focus: 'burette' };
  }
  if (verb === 'finish-titration') {
    const i = s.runs.length - 1 - [...s.runs].reverse().findIndex((r) => r.done);
    const run = s.runs[i];
    if (run && run.initial !== null && run.final !== null && run.indicator) {
      const end = titrationEndpoint(v, i, run.indicator);
      const d = run.final - run.initial;
      if (run.swirls === 0) return { title: 'Swirl the flask while the acid runs in.', why: 'Swirling mixes the acid in at once, so the colour you see is the colour of the whole solution.', focus: 'flask' };
      if (run.kind === 'ACCURATE' && d - end > 0.1) return { title: `You went past the end point by about ${(d - end).toFixed(2)} cm³.`, why: 'Near the end point add the acid one drop at a time and swirl after each drop: stop at the first drop that changes the colour for good.', focus: 'flask' };
      if (d < end - 0.005) return { title: 'You stopped before the end point.', why: 'The colour must change for good (still changed after swirling). A titre that is too small gives a concentration that is too small.', focus: 'flask' };
    }
  }
  return null;
}
