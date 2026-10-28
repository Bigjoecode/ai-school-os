import { RATES_CROSS_CARD, RATES_CROSS_MADE_UP, RATES_INTERVAL, RATES_TEMP_CARD, RATES_TEMP_THIO, RATES_X_EARLY, RATES_X_LATE, ratesCrossX, ratesMgEnd, type ChemRatesState, type ChemRatesVariant } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { crossFlaskDirty, crossFlaskFull, openCross, openMg, type Rates } from '../actions';
import { APPARATUS_LABEL, NEEDED, PLACE_LABEL, type ApparatusId, type SceneState } from './scene-state';

/**
 * Guided mode (practice only): the practical as a checklist with the reason
 * for each step, and gentle corrections for what was just done. Worked out
 * from the recorded state: the guide never says what the syringe reads.
 */

export function guideSteps(s: ChemRatesState, scene: SceneState, mode: CameraMode, o: Rates): GuideStep[] {
  const task = s.task ?? 'MG';
  const mg = task === 'MG';
  const steps: GuideStep[] = [
    { id: 'goggles', label: 'Put on your goggles (and lab coat)', target: 'goggles', why: mg ? 'Acid can spit out of the flask as the magnesium fizzes.' : 'Acid and thiosulphate can splash when you swirl.', done: scene.goggles },
    { id: 'collect', label: `Collect your apparatus${scene.missing.length ? ` (${scene.missing.length} to go)` : ''}`, target: 'cupboard', why: NEEDED[task].map((id) => APPARATUS_LABEL[id].toLowerCase()).join(', ') + '.', done: scene.ready },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front.', done: mode !== 'walk' || scene.placed.size > 0 },
  ];
  for (const id of (mg ? ['stand', 'syringe'] : ['paper', 'bath']) as ApparatusId[])
    steps.push({ id: `place-${id}`, label: PLACE_LABEL[id]!, target: id, why: id === 'syringe' ? 'The syringe horizontal, so the plunger moves freely; the delivery tube from the bung to its nozzle.' : id === 'stand' ? 'It holds the gas syringe level beside the flask.' : id === 'paper' ? 'The same bold cross under the flask every time.' : 'It warms the mixtures for the temperature part.', done: scene.placed.has(id), group: 'Set up' });
  if (mg) {
    for (const k of [0, 1]) {
      const r = s.mgRuns[k];
      if (r?.done) continue;
      if (k === 1 && !s.mgRuns[0]?.done) break;
      const open = openMg(s);
      const mine = !!open && open.i === k;
      const group = k === 0 ? 'Run 1: 1.0 mol dm⁻³ acid' : 'Run 2: 0.50 mol dm⁻³ acid';
      const gone = mine && o.mgGone();
      const afterEnd = !!r && s.readings.some((e) => e.run === k && e.at + (r.watchLag ?? 0) > ratesMgEnd(o.v, r.conc, r.cleaned));
      steps.push(
        { id: `acid-${k}`, label: `Measure 50 cm³ of ${k === 0 ? '1.0' : '0.50'} mol dm⁻³ HCl into the flask`, target: k === 0 ? 'acid1' : 'acid2', why: k === 0 ? 'The acid is in excess: the magnesium is used up first.' : 'Only the concentration changes: same volume, same mass of magnesium.', done: mine, group },
        { id: `weigh-${k}`, label: 'Weigh the magnesium ribbon', target: 'balance', why: `It should be ${o.v.mgMass.toFixed(3)} g, as on the card.`, done: mine && !!r?.weighed, group },
        { id: `clean-${k}`, label: 'Clean the ribbon with sandpaper', target: 'sandpaper', why: 'The dull oxide layer would hold back the reaction at the start.', done: mine && !!r?.cleaned, group },
        { id: `zero-${k}`, label: 'Push the syringe plunger fully in (0 cm³)', target: 'syringe', why: 'Every volume is read from zero.', done: mine && r?.start === 0, group },
        { id: `check-${k}`, label: 'Check the apparatus is airtight', target: 'syringe', why: 'Pull the plunger out a little and let go: if it springs back, no gas can leak out.', done: mine && !!r?.checked, group },
        { id: `drop-${k}`, label: 'Drop the magnesium in, replace the bung at once', target: 'ribbon', why: 'Gas made before the bung is in escapes and is never measured.', done: mine && !!r?.dropped && r.bungLag !== null, group },
        { id: `watch-${k}`, label: 'Start the stopwatch as the magnesium goes in', target: 'stopwatch', why: 't = 0 is the moment the reaction starts.', done: mine && r?.watchLag !== null && r?.watchLag !== undefined, group },
        { id: `read-${k}`, label: 'Read the syringe at every 30 s mark and write it in the table', target: 'syringe', why: 'Eye level with the plunger’s inner end. Keep going until two readings are the same.', done: mine && gone && afterEnd, group },
        { id: `finish-${k}`, label: 'No more gas: finish the run', target: 'flask', why: 'The final volume shows all the magnesium has reacted.', done: false, group },
      );
      break;
    }
    steps.push(
      { id: 'table', label: 'Fill in t (s) and V (cm³) for every reading', target: 'book', why: 't = 0, 30, 60 … s; V to the nearest 0.5 cm³; V = 0 at t = 0.', done: s.mg.length > 5 && s.mg.every((r) => r.t.trim()) },
      { id: 'curves', label: 'Plot V against t for both runs and join each with a smooth curve', target: 'book', why: 'The points lie on a curve: never a straight line through curved data.', done: s.curves.a === 'SMOOTH' && s.curves.b === 'SMOOTH' },
      { id: 'tangents', label: 'Draw the tangent at t = 0 on each curve', target: 'book', why: 'Its gradient is the initial rate. It touches the curve at the origin, along its steepest part.', done: !!s.tangents.a && !!s.tangents.b },
      { id: 'answers', label: 'Work out the initial rates and the theoretical volume', target: 'book', why: 'Rate = ΔV ÷ Δt of the tangent (cm³ s⁻¹). Volume = (mass ÷ 24) × 24 000 cm³.', done: !!s.answers.rateA.value.trim() && !!s.answers.rateB.value.trim() && !!s.answers.vTheory.value.trim() },
    );
  } else {
    const conc = s.crossRuns.filter((r) => r.done && r.kind === 'CONC').map((r) => r.thio);
    const temp = s.crossRuns.filter((r) => r.done && r.kind === 'TEMP').length;
    const next = RATES_CROSS_CARD.find((v) => !conc.includes(v));
    const c = openCross(s);
    const tempPart = next === undefined;
    if (!tempPart || temp < RATES_TEMP_CARD.length) {
      const group = !tempPart ? `${next} cm³ thiosulphate + ${RATES_CROSS_MADE_UP - next!} cm³ water` : `Temperature ${temp + 1}: about ${RATES_TEMP_CARD[temp]} °C`;
      const acidIn = !!o.crossLive;
      if (!c && crossFlaskFull(s)) steps.push({ id: 'empty', label: 'Pour the last mixture away into the sink', target: 'flask', why: 'With plenty of water: it smells of sulphur dioxide.', done: false, group });
      else if (!c && crossFlaskDirty(s)) steps.push({ id: 'rinse', label: 'Rinse the flask with water', target: 'washBottle', why: 'Sulphur left in the flask would make the next mixture cloud sooner.', done: false, group });
      steps.push({ id: 'measure', label: tempPart ? `Measure ${RATES_TEMP_THIO} cm³ thiosulphate + ${RATES_CROSS_MADE_UP - RATES_TEMP_THIO} cm³ water` : `Measure ${next} cm³ thiosulphate + ${RATES_CROSS_MADE_UP - next!} cm³ water`, target: 'cylinder', why: 'Always made up to 50 cm³: only the concentration of thiosulphate changes.', done: !!c, group });
      if (tempPart) steps.push({ id: 'warm', label: `Warm it in the water bath to about ${RATES_TEMP_CARD[temp]} °C`, target: 'bath', why: 'The same mixture each time: only the temperature changes.', done: !!c?.r.bath, group });
      steps.push(
        { id: 'acid', label: 'Add 5 cm³ of acid and start the stopwatch at once', target: 'hcl2', why: 'The reaction starts as the acid goes in.', done: acidIn && o.watch.start !== null, group },
        { id: 'swirl', label: 'Swirl the flask, then stand it back on the cross', target: 'flask', why: 'To mix the acid in at once.', done: !!c?.r.swirled, group },
        { id: 'look', label: 'Look down through the solution and stop the watch when the cross disappears', target: 'paper', why: 'From above, vertically: the same observer and the same cross every time.', done: !!c && c.r.elapsed !== null, group },
      );
      if (tempPart) steps.push({ id: 'thermo', label: 'Read the temperature of the mixture', target: 'thermometer', why: 'After adding the acid: the mixture is a little cooler than the bath.', done: !!c?.r.temp && c.r.tempAfter, group });
      steps.push({ id: 'record', label: 'Record the time and write it in your table', target: 'stopwatch', why: 't to 0.1 s; then 1/t.', done: false, group });
    }
    steps.push(
      { id: 'table', label: 'Fill in V, water, t and 1/t (and θ) for every run', target: 'book', why: '1/t to 3 significant figures: it is a measure of the rate.', done: s.cross.length >= 9 && s.cross.every((r) => r.t.trim() && r.inv.trim()) },
      { id: 'graph', label: 'Plot 1/t against the volume of thiosulphate and draw the best straight line', target: 'book', why: 'Rate ∝ concentration: a straight line through the origin.', done: !!s.line },
      { id: 'answers', label: 'Work out the slope, the time for the given volume and the 10 °C factor', target: 'book', why: 'Slope = Δ(1/t) ÷ ΔV; t = 1 ÷ (1/t read from the line).', done: !!s.answers.slope.value.trim() && !!s.answers.tQuery.value.trim() && !!s.answers.factor.value.trim() },
    );
  }
  steps.push(
    { id: 'explain', label: 'Write the explanation and two precautions', target: 'book', why: mg ? 'Why the curve levels off; why the more concentrated acid reacts faster.' : 'Collision theory: concentration and temperature.', done: !!s.written.explanation.trim() && !!s.written.precautions.trim() },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  );
  return steps;
}

/** A gentle correction for a step just recorded (null: nothing wrong). */
export function correctionFor(a: string, s: ChemRatesState, v: ChemRatesVariant, scene: SceneState): Correction | null {
  const [verb, arg, extra] = a.split(':') as [string, string | undefined, string | undefined];
  const task = s.task ?? 'MG';
  if (verb === 'collect' && arg === 'burner' && task === 'MG') return { title: 'No flames near this practical.', why: 'Hydrogen is flammable: a flame near the gas syringe could ignite it. Put the Bunsen burner back.' };
  if (verb === 'collect' && arg && !NEEDED[task].includes(arg as ApparatusId) && APPARATUS_LABEL[arg as ApparatusId]) return { title: `The ${APPARATUS_LABEL[arg as ApparatusId].toLowerCase()} is not needed here.`, why: `This practical needs ${NEEDED[task].map((id) => APPARATUS_LABEL[id].toLowerCase()).join(', ')}.` };
  if ((verb === 'drop-mg' || verb === 'add-acid' || verb === 'mg-acid' || verb === 'measure') && !scene.goggles) return { title: 'Goggles first.', why: 'Acid can splash into your eyes: put on the goggles from the hooks by the door.' };
  if (verb === 'mg-acid' && arg) {
    const done = s.mgRuns.filter((r) => r?.done).length;
    const want = done === 0 ? 1 : 0.5;
    if (Math.abs(Number(arg) - want) > 0.01 && s.mgRuns.filter(Boolean).length <= 2) return { title: `Run ${done + 1} uses ${want === 1 ? '1.0' : '0.50'} mol dm⁻³ acid.`, why: 'The card: run 1 with 1.0, run 2 with 0.50 mol dm⁻³. Pour it away and use the other bottle.', focus: 'flask' };
  }
  if (verb === 'drop-mg') {
    const m = openMg(s);
    if (m && !m.r.cleaned) return { title: 'The ribbon was not cleaned.', why: 'Its oxide layer slows the start, so the first readings are too low. Pour this run away and start again with a cleaned ribbon.', focus: 'flask' };
    if (m && m.r.start !== 0) return { title: 'The plunger was not at zero.', why: 'Every reading now includes the air already in the syringe. Pour away and start again with the plunger pushed fully in.', focus: 'syringe' };
  }
  if (verb === 'bung' && arg && Number(arg) > 3) return { title: 'The bung went in too late.', why: `${Number(arg).toFixed(1)} s of gas escaped before the bung was in: replace it at once next time (or pour away and repeat).`, focus: 'flask' };
  if (verb === 'watch' && arg && arg !== 'early' && Math.abs(Number(arg)) > 2) return { title: 'Start the watch as the magnesium goes in.', why: `It started ${Number(arg).toFixed(1)} s ${Number(arg) > 0 ? 'late' : 'early'}: every time in your table is off by that much.`, focus: 'stopwatch' };
  if (verb === 'read' && extra) {
    const at = Number(extra);
    const off = at - Math.round(at / RATES_INTERVAL) * RATES_INTERVAL;
    if (Math.abs(off) > 3) return { title: 'Read at the 30 s marks.', why: `That reading was at ${at.toFixed(1)} s, ${Math.abs(off).toFixed(0)} s off a mark. Watch the stopwatch and read as it reaches 30, 60, 90 … s.`, focus: 'stopwatch' };
  }
  if (verb === 'measure' && arg && extra && Number(arg) + Number(extra) !== RATES_CROSS_MADE_UP) return { title: 'Make it up to 50 cm³.', why: `${arg} + ${extra} = ${Number(arg) + Number(extra)} cm³. The total volume must be the same every time, so that only the concentration changes. Pour it away and measure again.`, focus: 'flask' };
  if (verb === 'stop') {
    const c = openCross(s);
    if (extra === 'side' || arg?.includes('side')) return { title: 'Look down through the flask.', why: 'From the side you cannot judge when the cross disappears. Use the “Look down” view.', focus: 'top' };
    if (c && c.r.elapsed !== null) {
      const x = ratesCrossX(v, c.r, c.r.elapsed + (c.r.watchLag ?? 0));
      if (x < RATES_X_EARLY) return { title: 'Too early: the cross could still be seen.', why: 'Stop the watch only when the cross can no longer be seen at all. Pour this run away and time it again.', focus: 'top' };
      if (x > RATES_X_LATE) return { title: 'A little late.', why: 'The cross had already gone some time before. Stop the watch the moment it disappears.', focus: 'top' };
    }
  }
  if (verb === 'thermo') {
    const c = openCross(s);
    if (c && c.r.kind === 'TEMP' && !c.r.tempAfter) return { title: 'Read it again after adding the acid.', why: 'Record the temperature of the mixture: the cold acid cools it a little.', focus: 'flask' };
  }
  return null;
}
