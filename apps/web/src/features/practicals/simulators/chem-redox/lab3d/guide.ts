import { REDOX_INDICATOR_INFO, REDOX_STARCH_LATE, REDOX_WARM, redoxEndpoint, redoxStarchEarly, redoxTrueEnd, type ChemRedoxState, type ChemRedoxVariant, type RedoxIndicator } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { APPARATUS_LABEL, apparatusFor, type ApparatusId, type SceneState } from './scene-state';

/**
 * Guided mode (practice only): the titration as a checklist with the object
 * to use next, and gentle corrections — with the reason — when a step is done
 * the wrong way. Everything is worked out from the state the lab records.
 */

export function guideSteps(s: ChemRedoxState, scene: SceneState, mode: CameraMode, v: ChemRedoxVariant, temp: number | null): GuideStep[] {
  const filled = s.burette !== null;
  const missing = apparatusFor(v.task).filter((a) => a.needed && !scene.collected.has(a.id));
  const steps: GuideStep[] = [
    { id: 'safety', label: 'Put on your lab coat and goggles', target: !scene.coat ? 'coat' : !scene.goggles ? 'goggles' : null, why: v.dark ? 'Acid can splash into your eyes, and KMnO₄ stains skin and clothes.' : 'Solutions can splash into your eyes; iodine stains skin.', done: scene.coat && scene.goggles },
    {
      id: 'collect',
      label: `Collect your apparatus${missing.length ? ` (${missing.length} to go)` : ''}`,
      target: 'cupboard',
      why: `A burette, a pipette with its filler, a conical flask, a funnel, a retort stand, a white tile, a waste beaker and a wash bottle${v.task !== 'IOD' ? ', a measuring cylinder for the acid' : ''}${v.task === 'OX' ? ', and a tripod, gauze, Bunsen burner and thermometer to warm the flask' : ''}.`,
      done: !missing.length,
    },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front. Your solutions A and B are there.', done: mode !== 'walk' || scene.clamped },
    { id: 'rinse-burette', label: `Rinse the burette with A (${v.A.formula})`, target: 'burette', why: 'Water left inside would dilute A and make every titre too large.', done: s.setup.burette === 'A' },
    { id: 'clamp', label: 'Clamp the burette upright on the stand', target: 'burette', why: 'A vertical burette reads correctly and drains straight into the flask.', done: scene.clamped },
    { id: 'funnel', label: 'Put the funnel in the burette', target: 'funnel', why: 'It stops A splashing as you fill. Fill below eye level.', done: s.funnelIn || filled },
    { id: 'fill', label: 'Fill the burette with A', target: filled ? 'burette' : 'bottleA', why: 'Fill to just around the zero mark.', done: filled },
    { id: 'bubble', label: 'Clear the air bubble from the jet', target: 'beaker', why: 'An air bubble in the jet fills during the titration and adds to the reading.', done: filled && !scene.bubble },
    { id: 'unfunnel', label: 'Remove the funnel', target: 'funnel', why: 'Drips from the funnel would change the reading.', done: filled && !s.funnelIn },
    { id: 'rinse-pipette', label: 'Rinse the pipette with B', target: 'pipette', why: 'Water left inside would dilute the 25.0 cm³ of B you measure.', done: s.setup.pipette === 'B' },
    { id: 'filler', label: 'Fit the pipette filler', target: 'filler', why: 'Never pipette by mouth.', done: scene.fillerOn },
  ];

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
      { id: 'rinse-flask', label: 'Rinse the conical flask with distilled water', target: 'flask', why: 'Only water: any B left in the flask would add to the 25.0 cm³.', done: !!open || s.setup.flask === 'WATER', group },
      { id: 'pipette', label: 'Pipette 25.0 cm³ of B into the flask', target: 'pipette', why: 'Draw B up past the mark with the filler, let it down to the mark, run it in and touch the tip on the flask.', done: !!open, group },
    );
    if (v.task !== 'IOD') steps.push({ id: 'acid', label: 'Add about 20 cm³ of dilute H₂SO₄ (measuring cylinder)', target: 'acid:H2SO4', why: 'MnO₄⁻ needs H⁺ ions to be reduced to colourless Mn²⁺. Not HCl: MnO₄⁻ would oxidise the chloride.', done: !!open?.acid, group });
    if (v.task === 'OX') {
      const warm = (temp ?? 0) >= REDOX_WARM.min || (open?.initial ?? null) !== null;
      steps.push({ id: 'warm', label: 'Warm the flask on the gauze to about 60–70 °C', target: !scene.onTripod ? 'flask' : !scene.burnerLit ? 'burner' : 'flask', why: `The reaction is very slow cold. Watch the thermometer${temp !== null ? ` (${Math.round(temp)} °C now)` : ''} and lift the flask off before it gets near boiling.`, done: !!open && warm, group });
    }
    steps.push(
      { id: 'tile', label: 'Stand the flask on the white tile', target: 'flask', why: v.dark ? 'The first faint permanent pink is easy to see on white.' : 'The last of the blue-black colour is easy to see on white.', done: !!open && scene.flaskUnder, group },
      { id: 'initial', label: v.dark ? 'Read the TOP of the meniscus at eye level: the initial reading' : 'Read the burette at eye level and write the initial reading', target: 'burette', why: v.dark ? 'KMnO₄ is too dark to see the bottom of the meniscus: read its top edge, the same way every time, to 2 decimal places.' : 'Read the bottom of the meniscus, with your eye level with it, to 2 decimal places.', done: !!row?.initial.trim(), group },
    );
    if (v.task === 'IOD') {
      steps.push(
        { id: 'straw', label: 'Run in thiosulphate until the brown fades to pale straw', target: 'tap', why: 'Swirl all the time. Do not add the starch yet.', done: !!open && open.starchAt !== null, group },
        { id: 'starch', label: 'Add about 1 cm³ of starch: it turns blue-black', target: 'ind:STARCH', why: 'Starch added near the end point shows the last traces of iodine clearly. Added early, it binds the iodine and the end point is slow.', done: !!open && open.starchAt !== null, group },
        { id: 'titrate', label: 'Dropwise until the blue-black just disappears', target: 'tap', why: 'One drop should turn it colourless.', done: false, group },
      );
    } else
      steps.push({
        id: 'titrate',
        label: open?.kind === 'ACCURATE' || (!open && done.length) ? 'Run in KMnO₄ to 1 cm³ short of the rough titre, then drop by drop' : 'Run in KMnO₄, swirling, until a pale pink stays',
        target: 'tap',
        why: v.task === 'OX' ? 'The first drops decolourise slowly — wait and swirl; then it goes quickly (Mn²⁺ catalyses it). Stop at the first pink that lasts 30 s.' : 'The purple vanishes as it reacts with iron(II). Near the end add one drop at a time: stop at the first permanent pale pink.',
        done: false,
        group,
      });
    steps.push({ id: 'final', label: 'Close the tap and record the final reading', target: 'burette', why: 'Then subtract: titre = final − initial.', done: false, group });
    if (accurateDone || done.length) steps.push({ id: 'repeat', label: `Accurate titrations done: ${accurateDone} of at least 2`, target: null, why: `Repeat${v.task === 'OX' ? ' with fresh, warmed portions' : ''} until two accurate titres agree within 0.10 cm³.`, done: false });
  }
  const calc = Object.values(s.answers).every((a) => a.value.trim() && a.unit.trim());
  steps.push(
    { id: 'table', label: 'Fill in every titre in your notebook', target: 'book', why: 'Every reading and titre to 2 decimal places.', done: enough && s.table.every((r) => r.initial.trim() && r.final.trim() && r.titre.trim()) },
    { id: 'calc', label: 'Work out the calculations, with units', target: 'book', why: `Use the mean of your concordant titres and the mole ratio ${v.A.species} : ${v.B.species} = ${v.a} : ${v.b}.`, done: calc },
    { id: 'written', label: 'Write the colour change, the explanation and two precautions', target: 'book', why: v.dark ? 'Colourless to the first permanent pale pink.' : 'Blue-black to colourless.', done: !!s.written.endpoint.trim() && !!s.written.explain.trim() && !!s.written.precautions.trim() },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  );
  return steps;
}

/** A gentle correction for a step just recorded in the log (null: nothing wrong). */
export function correctionFor(a: string, s: ChemRedoxState, v: ChemRedoxVariant, sceneBefore: SceneState): Correction | null {
  const [verb, arg] = a.split(':') as [string, string | undefined];
  if (verb === 'rinse-burette' && arg !== 'A')
    return arg === 'WATER'
      ? { title: 'You rinsed the burette with water — rinse it with A.', why: 'Water left on the inside dilutes A, so you would need more of it: every titre comes out too large. Rinse with a little A, drain, then fill.', focus: 'burette' }
      : { title: 'The burette must not be rinsed with B.', why: 'B left inside reacts with the A you put in. Rinse with A instead.', focus: 'burette' };
  if (verb === 'rinse-pipette' && arg !== 'B')
    return arg === 'WATER'
      ? { title: 'You rinsed the pipette with water — rinse it with B.', why: 'Water left in the pipette dilutes the 25.0 cm³ of B you measure.', focus: 'bench' }
      : { title: 'The pipette should be rinsed with B, not A.', why: 'A left inside reacts with some of the B you measure.', focus: 'bench' };
  if (verb === 'rinse-flask' && arg !== 'WATER') return { title: 'Rinse the conical flask with distilled water only.', why: 'A or B left in the flask changes how much reacts: the flask must hold exactly the 25.0 cm³ you pipette. Water does not change the amount.', focus: 'flask' };
  if (verb === 'mouth-pipetting-refused') return { title: 'Never pipette by mouth.', why: 'The solutions are harmful. The pipette filler draws the liquid up safely.' };
  if (verb === 'acid' && arg && arg !== 'H2SO4')
    return arg === 'HCL'
      ? { title: 'HCl is the wrong acid for KMnO₄.', why: 'MnO₄⁻ oxidises chloride ions to chlorine, so extra KMnO₄ is used and the titre is too high. Pour away and use dilute H₂SO₄.', focus: 'flask' }
      : { title: 'HNO₃ is the wrong acid for this titration.', why: 'Trioxonitrate(V) acid is an oxidising agent itself and interferes. Pour away and use dilute H₂SO₄.', focus: 'flask' };
  if (verb === 'indicator' && arg) {
    const ind = arg.split('@')[0] as RedoxIndicator;
    if (v.task !== 'IOD') return { title: `No indicator is needed with KMnO₄.`, why: `KMnO₄ is self-indicating: the first excess drop turns the solution pale pink. ${REDOX_INDICATOR_INFO[ind]?.label ?? 'The indicator'} only adds a colour of its own — pour away and start the run again.`, focus: 'flask' };
    if (ind !== 'STARCH') return { title: `${REDOX_INDICATOR_INFO[ind].label} is an acid–base indicator.`, why: 'Iodine titrations use starch: it is blue-black while iodine remains. Pour away and start again.', focus: 'flask' };
    const i = s.runs.findIndex((r) => !r.done);
    const run = s.runs[i];
    if (run && redoxStarchEarly(v, i, run)) return { title: 'That starch went in too early.', why: `The solution was still brown or deep yellow. With so much iodine, starch forms a stable blue-black complex that is slow to decolourise, so the end point comes late. Wait for pale straw (about ${Math.round(REDOX_STARCH_LATE * 100)} % of the iodine left or less).`, focus: 'flask' };
  }
  if (verb === 'collect' && arg && !apparatusFor(v.task).find((x) => x.id === arg)?.needed) return { title: `The ${APPARATUS_LABEL[arg as ApparatusId].toLowerCase()} is not needed for this titration.`, why: 'Only take what the practical needs; you can put it back from your bench or the cupboard list.' };
  if (verb === 'warm' && arg && Number(arg) > REDOX_WARM.decompose) return { title: `${arg} °C is too hot.`, why: 'Near boiling, ethanedioic acid decomposes and less KMnO₄ is needed: the titre comes out low. Warm only to about 60–70 °C — pour away and warm a fresh portion.', focus: 'tripod' };
  if (verb === 'start-titrating') {
    if (s.funnelIn) return { title: 'The funnel is still in the burette.', why: 'Drips from the funnel run into the burette while you titrate and spoil the readings. Remove it before taking the initial reading.', focus: 'burette' };
    if (sceneBefore.bubble) return { title: 'There was still an air bubble in the jet.', why: 'The bubble fills as you titrate, so the burette shows more used than went into the flask.', focus: 'burette' };
    const i = s.runs.findIndex((r) => !r.done);
    const run = s.runs[i];
    if (run && v.task !== 'IOD' && !run.acid) return { title: 'The flask has not been acidified.', why: 'Without acid, MnO₄⁻ is reduced only to brown MnO₂ and the titration goes wrong. Pour away, and add about 20 cm³ of dilute H₂SO₄ next time.', focus: 'flask' };
    if (run && v.task === 'OX' && (run.startTemp ?? 0) < REDOX_WARM.okMin) return { title: `The flask is only ${Math.round(run.startTemp ?? v.room)} °C.`, why: 'Cold, KMnO₄ and ethanedioic acid react very slowly: the purple lingers and you cannot tell when the end point comes. Warm it to about 60–70 °C first.', focus: 'flask' };
  }
  if (verb === 'finish-titration') {
    const i = s.runs.length - 1 - [...s.runs].reverse().findIndex((r) => r.done);
    const run = s.runs[i];
    if (run && run.initial !== null && run.final !== null) {
      const end = redoxEndpoint(v, i, run);
      const d = run.final - run.initial;
      if (run.swirls === 0) return { title: 'Swirl the flask while A runs in.', why: 'Swirling mixes it in at once, so the colour you see is the colour of the whole solution.', focus: 'flask' };
      if (run.kind === 'ACCURATE' && d - end > 0.1) return { title: `You went past the end point by about ${(d - end).toFixed(2)} cm³.`, why: v.dark ? 'Near the end point add one drop at a time and swirl after each: stop at the first pale pink that stays.' : 'Near the end point add one drop at a time and swirl after each: stop at the first drop that removes the blue-black for good.', focus: 'flask' };
      if (d < end - 0.005)
        return v.task === 'IOD' && run.starchAt === null && d > 0.8 * redoxTrueEnd(v, i, run)
          ? { title: 'Pale yellow is not the end point.', why: 'There is still iodine left. Add starch now (blue-black) and carry on until it just turns colourless.', focus: 'flask' }
          : { title: 'You stopped before the end point.', why: v.task === 'OX' ? 'The purple was still fading. Swirl and wait a few seconds after each drop: the end point is the first pink that lasts 30 s.' : 'The colour must change for good (still changed after swirling). A titre that is too small gives a wrong concentration.', focus: 'flask' };
    }
  }
  return null;
}
