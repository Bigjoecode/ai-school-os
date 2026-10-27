import { ohmsCheck, ohmsMeters, ohmsWireKey, type OhmsTerminal, type PhyOhmsState, type PhyOhmsVariant } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { settingsOf } from '../actions';
import { GOOD_WIRES } from './layout';
import { APPARATUS, APPARATUS_LABEL, needed, type ApparatusId, type SceneState } from './scene-state';
import { TERM_LABEL } from './station';

/**
 * Guided mode (practice only): the experiment as a checklist with the object
 * to use next and the reason, plus gentle corrections when a step is done the
 * wrong way. Worked out from the recorded state; nothing here changes marks.
 */

const short = (t: OhmsTerminal) => TERM_LABEL[t].replace(/ terminal/, '').toLowerCase();
/** The setting that distinguishes one reading from another (rheostat %, or jockey cm). */
export const settingOf = (s: { rheostat: number; jockey: number }, wire: boolean) => (wire ? s.jockey : s.rheostat * 100);
export const WIRE_LENGTHS = [20, 40, 60, 80, 100];
export const RHEO_STEPS = [1, 0.7, 0.45, 0.25, 0.1];

export function guideSteps(s: PhyOhmsState, scene: SceneState, mode: CameraMode, v: PhyOhmsVariant): GuideStep[] {
  const task = s.task ?? 'OHM';
  const wire = task === 'WIRE';
  const test = wire ? 'the length of wire' : 'the resistor';
  const missing = needed(task).filter((a) => !scene.collected.has(a.id));
  const check = ohmsCheck(v, { ...settingsOf(s), key: true, heat: 0 });
  const next = GOOD_WIRES[task].find(([a, b]) => !s.wires.includes(ohmsWireKey(a, b)));
  const wireStep = (done: boolean) => ({ target: !done && next ? `term:${next[0]}` : null, hint: next ? ` Next: join the ${short(next[0])} to the ${short(next[1])}.` : '' });
  const series = check.ammeterSeries && check.rheostatSeries && check.keySeries;
  const loop = wireStep(series);
  const across = wireStep(check.voltmeterAcross);
  const steps: GuideStep[] = [
    { id: 'collect', label: `Collect your apparatus${missing.length ? ` (${missing.length} to go)` : ''}`, target: 'cupboard', why: `The cells, the key, the rheostat, the ammeter and voltmeter, connecting wires and ${wire ? 'the resistance wire on its metre rule (and the micrometer)' : 'the standard resistor'}.`, done: !missing.length },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front: the circuit board is there.', done: mode !== 'walk' || s.wires.length > 0 },
    { id: 'series', label: `Wire the battery, key, rheostat, ammeter and ${wire ? 'wire (0 end to the jockey)' : 'resistor'} in series`, target: loop.target, why: `One loop, so the same current flows through the ammeter and ${test}.${loop.hint}`, done: series },
    { id: 'across', label: `Connect the voltmeter across ${test} only`, target: across.target, why: `The voltmeter measures the p.d. across ${test}: in parallel with it, nothing else.${across.hint}`, done: check.voltmeterAcross },
    { id: 'polarity', label: 'Both meters: + towards the + of the battery', target: check.polarity ? null : 'ammeter', why: 'A meter joined the wrong way round kicks backwards below zero.', done: check.polarity },
  ];
  const n = s.readings.length;
  const groups = Math.min(5, n + 1);
  for (let i = 0; i < groups; i++) {
    const group = `Reading ${i + 1} of 5`;
    const distinct = (x: number) => !s.readings.slice(0, i).some((r) => Math.abs(settingOf(r, wire) - x) < 2);
    if (i > 0 || wire)
      steps.push({
        id: `set-${i}`,
        label: wire ? `Move the jockey to L = ${WIRE_LENGTHS[i]} cm` : i === 0 ? 'Set the rheostat' : 'Slide the rheostat to a new setting',
        target: wire ? 'wireRule' : 'rheostat',
        why: wire ? 'Press the jockey on the wire at that length; read L from the metre rule, from the 0 end.' : 'A different current each time: spread the readings over at least 0.15 A.',
        done: i < n || (distinct(settingOf(s, wire)) && (!wire || Math.abs(s.jockey - WIRE_LENGTHS[i]!) <= 2)),
        group,
      });
    steps.push(
      { id: `close-${i}`, label: 'Close the key', target: 'key', why: 'Switch on just for the reading.', done: i < n || s.key, group },
      { id: `read-${i}`, label: 'Read both meters and take the reading', target: 'ammeter', why: 'Look straight at each pointer and read it to half a division. Write I and V in your table.', done: i < n, group },
      { id: `open-${i}`, label: 'Open the key', target: 'key', why: 'A steady current heats the conductor and its resistance rises: open the key between readings.', done: n > i && (n > i + 1 || !s.key), group },
    );
  }
  const rows = s.table.slice(0, n);
  steps.push(
    { id: 'table', label: `Write ${wire ? 'L, ' : ''}I, V and V/I for every reading`, target: 'book', why: 'I and V to 2 decimal places, exactly as the meters read.', done: n >= 5 && rows.every((r) => (!wire || r.L.trim()) && r.I.trim() && r.V.trim() && r.R.trim()) },
    { id: 'graph', label: wire ? 'Plot R against L and draw the best line' : 'Plot V against I and draw the best line', target: 'book', why: 'A straight line through the origin shows direct proportion.', done: !!s.line },
    { id: 'calc', label: wire ? 'Work out A, the slope and ρ, with units' : 'Work out the slope and R, with units', target: 'book', why: wire ? 'A = πd²/4 in m²; slope in Ω m⁻¹; ρ = slope × A in Ω m.' : 'Slope = ΔV ÷ ΔI from two points far apart on your line; R in Ω.', done: !!s.answers.slope.value.trim() && !!s.answers.result.value.trim() && (!wire || !!s.answers.area.value.trim()) },
    { id: 'written', label: 'Write the conclusion and two precautions', target: 'book', why: 'What the graph shows, and how you made the readings reliable.', done: !!s.written.conclusion.trim() && !!s.written.precautions.trim() },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in.', done: false },
  );
  return steps;
}

/** A gentle correction for what was just recorded (null: nothing wrong). */
export function correctionFor(a: string, s: PhyOhmsState, v: PhyOhmsVariant): Correction | null {
  const [verb, arg] = a.split(':') as [string, string | undefined];
  const task = s.task ?? 'OHM';
  const test = task === 'WIRE' ? 'the length of wire' : 'the resistor';
  if (verb === 'collect' && arg && !APPARATUS.find((x) => x.id === arg)?.for.includes(task))
    return { title: `The ${APPARATUS_LABEL[arg as ApparatusId].toLowerCase()} is not needed here.`, why: 'Only take what the experiment needs; you can put it back from the bench or the cupboard list.' };
  if (verb === 'wire' || verb === 'close-key') {
    if (a === `wire:${ohmsWireKey('cell+', 'cell-')}`) return { title: 'That wire joins the battery’s + straight to its −.', why: 'A short circuit: a huge current flows, the cells go flat and the wire gets hot. Remove it.', focus: 'board' };
    const on = ohmsMeters(v, { ...settingsOf(s), key: true }, s.readings.length);
    if (on.overI) return { title: 'The ammeter would be overloaded.', why: 'With no resistance in its path (e.g. straight across the cell), the current is far too large. The ammeter goes in series with the rheostat and the resistor.', focus: 'ammeter' };
    if (verb === 'close-key') {
      const c = ohmsCheck(v, { ...settingsOf(s), key: true, heat: 0 });
      if (on.backI || on.backV) return { title: `The ${on.backI ? 'ammeter' : 'voltmeter'} is the wrong way round.`, why: 'Its pointer kicks backwards: swap its two wires so its + terminal goes towards the + of the battery.', focus: on.backI ? 'ammeter' : 'voltmeter' };
      if (!c.works) return { title: 'No current flows.', why: 'The circuit is not a complete loop through the ammeter and the test element: check every connection.', focus: 'board' };
      if (!c.voltmeterAcross) return { title: `The voltmeter is not across ${test} only.`, why: `Join its two terminals to the two ends of ${test}: then it reads the p.d. across that alone.`, focus: 'board' };
    }
  }
  if (verb === 'reading') {
    const r = s.readings.at(-1);
    if (r && r.heat > 0) return { title: 'Open the key between readings.', why: 'The key stayed closed since the last reading, so the conductor warmed up and its resistance rose. Open it, then close it just for the next reading.', focus: 'board' };
  }
  return null;
}
