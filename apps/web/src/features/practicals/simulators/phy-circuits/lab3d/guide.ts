import { bridgeBalance, circuitsCheck, circuitsMeters, circuitsWireKey, type CircuitsTerminal, type PhyCircuitsState, type PhyCircuitsVariant, type SeriesArrangement } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { settingsOf } from '../actions';
import { GOOD_WIRES, SERIES_WIRING } from './layout';
import { APPARATUS, APPARATUS_LABEL, needed, type ApparatusId, type SceneState } from './scene-state';
import { TERM_LABEL } from './station';

/**
 * Guided mode (practice only): the experiment as a checklist with the object
 * to use next and the reason, plus gentle corrections when a step is done the
 * wrong way. Worked out from the recorded state; nothing here changes marks.
 */

const short = (t: CircuitsTerminal) => TERM_LABEL[t].replace(/ terminal/, '').toLowerCase();
/** The currents the e.m.f. card asks for (A). */
export const EMF_CURRENTS = [0.2, 0.35, 0.5, 0.65, 0.8];
export const SERIES_ORDER: SeriesArrangement[] = ['R1', 'R2', 'S', 'P'];
const ARR_TEXT: Record<SeriesArrangement, string> = { R1: 'R₁ on its own', R2: 'R₂ on its own', S: 'R₁ and R₂ in series', P: 'R₁ and R₂ in parallel' };

/** The next wire to add (or a wrong one to remove first) to reach a target wiring. */
function nextWire(s: PhyCircuitsState, target: [CircuitsTerminal, CircuitsTerminal][]): { target: string | null; hint: string } {
  const want = target.map(([a, b]) => circuitsWireKey(a, b));
  const extra = s.wires.find((w) => !want.includes(w));
  if (extra) {
    const [a, b] = extra.split('|') as [CircuitsTerminal, CircuitsTerminal];
    return { target: `wire:${extra}`, hint: ` First remove the wire from the ${short(a)} to the ${short(b)}.` };
  }
  const next = target.find(([a, b]) => !s.wires.includes(circuitsWireKey(a, b)));
  return next ? { target: `term:${next[0]}`, hint: ` Next: join the ${short(next[0])} to the ${short(next[1])}.` } : { target: null, hint: '' };
}

export function guideSteps(s: PhyCircuitsState, scene: SceneState, mode: CameraMode, v: PhyCircuitsVariant): GuideStep[] {
  const task = s.task ?? 'BRIDGE';
  const missing = needed(task).filter((a) => !scene.collected.has(a.id));
  const check = circuitsCheck(v, { ...settingsOf(s), key: true, heat: 0 });
  const n = s.readings.length;
  const steps: GuideStep[] = [
    { id: 'collect', label: `Collect your apparatus${missing.length ? ` (${missing.length} to go)` : ''}`, target: 'cupboard', why: `${needed(task).map((a) => a.label.toLowerCase()).join(', ')}.`, done: !missing.length },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front: the circuit board is there.', done: mode !== 'walk' || s.wires.length > 0 },
  ];
  const tail = (table: GuideStep, analysis: GuideStep[]): GuideStep[] => [
    table,
    ...analysis,
    { id: 'written', label: 'Write your conclusion and two precautions', target: 'book', why: 'What you found, and how you made the readings reliable.', done: !!s.written.conclusion.trim() && !!s.written.precautions.trim() },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in.', done: false },
  ];

  if (task === 'BRIDGE') {
    const w = nextWire(s, GOOD_WIRES.BRIDGE);
    steps.push(
      { id: 'supply', label: 'Join the cell and key across the ends A and C of the wire', target: check.supplyAcross && check.keySeries ? null : w.target, why: `The cell drives a current along the whole bridge wire; the key in series switches it.${w.hint}`, done: check.supplyAcross && check.keySeries },
      { id: 'galvo', label: 'Join the galvanometer from the centre strip D to the jockey', target: check.galvoBridge ? null : w.target, why: `At balance D and the jockey are at the same potential, so no current flows through it.${w.hint}`, done: check.galvoBridge },
    );
    const groups = Math.min(5, n + 1);
    for (let i = 0; i < groups; i++) {
      const group = i < 4 ? `Balance ${i + 1}: R = a new value` : 'Check: X and R interchanged';
      const used = s.readings.slice(0, i).map((r) => r.rbox);
      const bal = bridgeBalance(v, s);
      steps.push(
        i < 4
          ? { id: `r-${i}`, label: 'Choose R on the resistance box', target: 'rbox', why: 'Pull out plugs for a new R. Choose R so the balance point lies between 30 cm and 70 cm (R about the size of X).', done: i < n || (s.rbox > 0 && !used.includes(s.rbox) && !s.swap), group }
          : { id: 'swap', label: 'Interchange X and R', target: 'unknown', why: 'With X in the right gap, X = R(100 − l)/l. The check cancels the end errors of the wire.', done: i < n || s.swap, group },
        { id: `close-${i}`, label: 'Close the key', target: 'key', why: 'Switch on just while you find the balance point.', done: i < n || s.key, group },
        { id: `find-${i}`, label: 'Tap the jockey to find the balance point', target: 'bridge', why: 'Tap — do not slide. The galvanometer kicks one way on one side and the other way on the other; at balance it does not move.', done: i < n || (s.key && Math.abs(s.jockey - bal) <= 0.3), group },
        { id: `rec-${i}`, label: 'Read l on the scale and record the balance point', target: 'bridge', why: 'Read l from the left end A, to 0.1 cm, looking straight down at the jockey.', done: i < n, group },
        { id: `open-${i}`, label: 'Open the key', target: 'key', why: 'Current heats the wire and X: open the key between readings.', done: n > i && (n > i + 1 || !s.key), group },
      );
    }
    const rows = s.bridge.slice(0, n);
    return [
      ...steps,
      ...tail({ id: 'table', label: 'Fill in R, l, 100 − l, (100 − l)/l and X for every row', target: 'book', why: 'X = R l/(100 − l); in the interchanged row X = R(100 − l)/l.', done: n >= 5 && rows.every((r, i) => r.l.trim() && r.m.trim() && r.X.trim() && (s.readings[i]!.swap || r.q.trim())) }, [
        { id: 'graph', label: 'Plot R against (100 − l)/l and draw the best line', target: 'book', why: 'R = X(100 − l)/l: a straight line through the origin whose slope is X.', done: !!s.line },
        { id: 'calc', label: 'Find the mean X and the slope, with units', target: 'book', why: 'Both should agree within experimental error.', done: !!s.answers.mean.value.trim() && !!s.answers.slope.value.trim() },
      ]),
    ];
  }

  if (task === 'EMF') {
    const w = nextWire(s, GOOD_WIRES.EMF);
    const series = check.ammeterSeries && check.rheostatSeries && check.keySeries;
    steps.push(
      { id: 'series', label: 'Wire the cell, key, ammeter and rheostat in series', target: series ? null : w.target, why: `One loop: the ammeter carries the whole current from the cell.${w.hint}`, done: series },
      { id: 'across', label: 'Connect the voltmeter straight across the cell', target: check.voltmeterAcross ? null : w.target, why: `It measures the terminal p.d. of the cell itself.${w.hint}`, done: check.voltmeterAcross },
      { id: 'polarity', label: 'Both meters: + towards the + of the cell', target: check.polarity ? null : 'ammeter', why: 'A meter joined the wrong way round kicks backwards.', done: check.polarity },
      { id: 'e0', label: 'With the key open, read the voltmeter', target: 'voltmeter', why: 'Almost no current flows, so it reads (very nearly) the e.m.f. Write it in your notebook.', done: !!s.answers.e0.value.trim() },
    );
    const groups = Math.min(5, n + 1);
    for (let i = 0; i < groups; i++) {
      const I = EMF_CURRENTS[i]!;
      const group = `Reading ${i + 1}: I ≈ ${I.toFixed(2)} A`;
      const now = circuitsMeters(v, { ...settingsOf(s), key: true }, n).I;
      steps.push(
        { id: `set-${i}`, label: `Set the rheostat for I ≈ ${I.toFixed(2)} A`, target: 'rheostat', why: 'Less resistance, more current. Close the key briefly to check the ammeter.', done: i < n || Math.abs(now - I) <= 0.06, group },
        { id: `close-${i}`, label: 'Close the key', target: 'key', why: 'Switch on just for the reading.', done: i < n || s.key, group },
        { id: `read-${i}`, label: 'Read both meters and take the reading', target: 'ammeter', why: 'Look straight at each pointer; I and V to 2 decimal places.', done: i < n, group },
        { id: `open-${i}`, label: 'Open the key', target: 'key', why: 'A steady current runs the cell down (it polarises) and its e.m.f. falls.', done: n > i && (n > i + 1 || !s.key), group },
      );
    }
    const rows = s.emf.slice(0, n);
    return [
      ...steps,
      ...tail({ id: 'table', label: 'Write I and V for every reading', target: 'book', why: 'To 2 decimal places, exactly as the meters read.', done: n >= 4 && rows.every((r) => r.I.trim() && r.V.trim()) }, [
        { id: 'graph', label: 'Plot V against I and draw the best line', target: 'book', why: 'V = E − Ir: a straight line falling as I rises. Extend it to the V-axis.', done: !!s.line },
        { id: 'calc', label: 'Find the slope, E (intercept) and r = −slope, with units', target: 'book', why: 'The slope is negative; r is its size.', done: !!s.answers.slope.value.trim() && !!s.answers.emf.value.trim() && !!s.answers.r.value.trim() },
      ]),
    ];
  }

  // SERIES
  const arrs = s.readings.map((r) => circuitsCheck(v, { ...settingsOf(s), wires: r.wires, key: true, heat: 0 }).arrangement);
  const have = (a: SeriesArrangement) => arrs.includes(a);
  const todo = SERIES_ORDER.filter((a) => !have(a));
  for (const arr of SERIES_ORDER) {
    const done = have(arr);
    const current = !done && arr === todo[0];
    if (!done && !current) continue;
    const group = ARR_TEXT[arr];
    const w = nextWire(s, SERIES_WIRING[arr]);
    const wired = check.arrangement === arr && check.voltmeterAcross && check.polarity && check.keySeries;
    steps.push(
      { id: `wire-${arr}`, label: `Wire ${ARR_TEXT[arr]}, the voltmeter across ${arr === 'R1' || arr === 'R2' ? 'it' : 'both'}`, target: done || wired ? null : w.target, why: `${arr === 'S' ? 'End to end: one path, the same current through both.' : arr === 'P' ? 'Side by side, both ends joined: two paths, the same p.d. across both.' : 'Cell, key, ammeter and the resistor in one loop.'}${w.hint}`, done: done || wired, group },
      { id: `close-${arr}`, label: 'Close the key', target: 'key', why: 'Switch on just for the reading.', done: done || s.key, group },
      { id: `read-${arr}`, label: 'Read both meters and take the reading', target: 'ammeter', why: 'I and V to 2 decimal places; choose the arrangement for the row in your table.', done, group },
      { id: `open-${arr}`, label: 'Open the key', target: 'key', why: 'Open it between readings so the resistors do not warm up.', done: done && (arrs.indexOf(arr) < n - 1 || !s.key), group },
    );
  }
  const rows = s.series.slice(0, n);
  return [
    ...steps,
    ...tail({ id: 'table', label: 'Label each row and work out R = V/I', target: 'book', why: 'The arrangement, V and I to 2 decimal places, and V ÷ I.', done: n >= 4 && rows.every((r) => r.arr && r.V.trim() && r.I.trim() && r.R.trim()) }, [
        { id: 'calc', label: 'Write R₁, R₂, the series and parallel values, and R₁ + R₂ and R₁R₂/(R₁ + R₂)', target: 'book', why: 'Compare the measured values with the formulas.', done: (['r1', 'r2', 'rs', 'rp', 'rsCalc', 'rpCalc'] as const).every((id) => !!s.answers[id].value.trim()) },
      ]),
  ];
}

/** A gentle correction for what was just recorded (null: nothing wrong). */
export function correctionFor(a: string, s: PhyCircuitsState, v: PhyCircuitsVariant): Correction | null {
  const [verb, arg] = a.split(':') as [string, string | undefined];
  const task = s.task ?? 'BRIDGE';
  if (verb === 'collect' && arg && !APPARATUS.find((x) => x.id === arg)?.for.includes(task))
    return { title: `The ${APPARATUS_LABEL[arg as ApparatusId].toLowerCase()} is not needed here.`, why: 'Only take what the experiment needs; you can put it back from the bench or the cupboard list.' };
  if (a === `wire:${circuitsWireKey('cell+', 'cell-')}`) return { title: 'That wire joins the cell’s + straight to its −.', why: 'A short circuit: a large current flows, the cell goes flat and the wire gets hot. Remove it.', focus: 'board' };
  if (verb === 'overload') return { title: 'The ammeter is overloaded.', why: task === 'EMF' ? 'With almost no resistance in the circuit the cell is short-circuited. Open the key and slide the rheostat back.' : 'Something is wired straight across the cell. Open the key and check the ammeter is in series with the resistors.', focus: 'ammeter' };
  if (verb === 'scrape') return { title: 'Lift the jockey before you move it.', why: 'Sliding it along while pressed scrapes the wire, which then is no longer uniform. Move it lifted, then tap.', focus: 'bridge' };
  if (verb === 'close-key' && task !== 'BRIDGE') {
    const on = circuitsMeters(v, { ...settingsOf(s), key: true }, s.readings.length);
    const c = circuitsCheck(v, { ...settingsOf(s), key: true, heat: 0 });
    if (on.backI || on.backV) return { title: `The ${on.backI ? 'ammeter' : 'voltmeter'} is the wrong way round.`, why: 'Its pointer kicks backwards: swap its two wires so its + terminal goes towards the + of the cell.', focus: on.backI ? 'ammeter' : 'voltmeter' };
    if (!c.works) return { title: 'No current flows.', why: 'The circuit is not a complete loop through the ammeter: check every connection.', focus: 'board' };
    if (!c.voltmeterAcross) return { title: task === 'EMF' ? 'The voltmeter is not across the cell.' : 'The voltmeter is not across the resistors only.', why: task === 'EMF' ? 'Join its two terminals straight to the two terminals of the cell.' : 'Join its terminals to the two ends of the resistor arrangement — not across the ammeter as well.', focus: 'voltmeter' };
  }
  if (verb === 'reading') {
    const r = s.readings.at(-1);
    if (r && r.heat > 0) return { title: 'Open the key between readings.', why: task === 'EMF' ? 'The key stayed closed since the last reading: the cell polarises and its e.m.f. drops. Open it, then close it just for the next reading.' : 'The key stayed closed since the last reading, so the resistors warmed up. Open it, then close it just for the next reading.', focus: 'key' };
    if (r && task === 'BRIDGE') {
      const bal = bridgeBalance(v, r);
      if (Math.abs(r.jockey - bal) > 0.3) return { title: 'The galvanometer still deflects there.', why: 'That is not the balance point. Tap a little to each side: balance is where the pointer does not move at all. Delete the row and find it again.', focus: 'galvanometer' };
      if (bal < 30 || bal > 70) return { title: 'That balance point is near the end of the wire.', why: 'Choose R so the balance is between 30 cm and 70 cm: then an error of 0.1 cm in l matters least, and end errors are smaller.', focus: 'rbox' };
    }
  }
  return null;
}
