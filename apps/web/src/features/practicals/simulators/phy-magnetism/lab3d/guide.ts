import { DIODE_CARD_FWD, DIODE_CARD_REV, EM_CARD, emCurrent, type MagTask, type PhyMagnetismState, type PhyMagnetismVariant } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { emSettings, openSheet } from '../actions';
import { APPARATUS_LABEL, NEEDED, PLACE_LABEL, PLACEABLE, type ApparatusId, type SceneState } from './scene-state';

/**
 * Guided mode (practice only): each practical as a checklist, with the
 * object to use next and gentle corrections with the reason. Worked out from
 * the recorded state only — the guide never gives a reading.
 */

const filled = (x: string | undefined) => !!x && x.trim().length > 0;
const rowDone = (s: PhyMagnetismState, key: number, cols: string[]) => {
  const r = s.rows.find((x) => x.key === key);
  return !!r && cols.every((c) => filled(r.c[c]));
};

function setup(task: MagTask, scene: SceneState, mode: CameraMode): GuideStep[] {
  const steps: GuideStep[] = [
    { id: 'collect', label: `Collect your apparatus${scene.missing.length ? ` (${scene.missing.length} to go)` : ''}`, target: 'cupboard', why: `You need: ${NEEDED[task].map((id) => APPARATUS_LABEL[id].toLowerCase()).join(', ')}.`, done: scene.ready },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front.', done: mode !== 'walk' || scene.placed.size > 0 },
  ];
  for (const id of PLACEABLE[task]) steps.push({ id: `place-${id}`, label: PLACE_LABEL[id]!, target: id, why: 'Set the apparatus out as on the task card.', done: scene.placed.has(id), group: 'Set up' });
  return steps;
}

function field(s: PhyMagnetismState): GuideStep[] {
  const N = s.sheets.filter((x) => x.arr === 'one' && x.facing === 'north');
  const S = s.sheets.filter((x) => x.arr === 'one' && x.facing === 'south');
  const lines = Math.max(0, ...N.map((x) => x.lines.length));
  const nN = Math.max(0, ...N.map((x) => x.neutrals.length));
  const nS = Math.max(0, ...S.map((x) => x.neutrals.length));
  const o = openSheet(s);
  return [
    { id: 'meridian', label: 'Mark the magnetic meridian with the compass alone', target: 'paper', why: 'Before the magnet goes on, the compass alone points along the meridian: line the paper up with it, so the magnet can lie exactly along it.', done: s.meridian, group: 'Before you plot' },
    { id: 'steel', label: 'Put the keys and the phone away', target: 'keys', why: 'Steel near the board is magnetised by the Earth and the magnet, and bends the field.', done: s.steelAway, group: 'Before you plot' },
    { id: 'compass', label: 'Use the small compass and tap it before each dot', target: 'compass', why: 'A small needle takes short steps along the curve; a gentle tap frees a sticking needle.', done: s.compass === 'small' && s.tapEach, group: 'Before you plot' },
    { id: 'lines', label: `Plot field lines dot to dot from the N pole round to the S pole (${Math.min(4, lines)} of 4)`, target: 'compass', why: 'Start beside the N end; put the compass’s tail on the last dot and mark its head, again and again. Lines starting at the sides reach the S pole; those from the end run off the paper.', done: lines >= 4, group: 'N pole pointing north' },
    { id: 'arrows', label: 'Draw arrows on the lines, from N to S', target: 'paper', why: 'The direction of the field is the way a compass’s N end points.', done: N.some((x) => x.arrows), group: 'N pole pointing north' },
    { id: 'neutralN', label: `Find the two neutral points, east and west (${Math.min(2, nN)} of 2)`, target: 'compass', why: 'Move the compass in small steps along the east–west line through the centre: where the needle rests in any direction, the magnet’s field cancels the Earth’s.', done: nN >= 2, group: 'N pole pointing north' },
    { id: 'turn', label: 'Turn the magnet round: N pole pointing south', target: 'magnet', why: 'A fresh sheet; now the neutral points move.', done: s.facing === 'south' || S.length > 0, group: 'N pole pointing south' },
    { id: 'neutralS', label: `Find the two neutral points on the axis (${Math.min(2, nS)} of 2)`, target: 'compass', why: 'Beyond each end, along the axis of the magnet.', done: nS >= 2, group: 'N pole pointing south' },
    { id: 'measure', label: 'Measure each neutral point’s distance from the centre', target: 'paper', why: 'Lay the rule from the centre of the magnet to each mark (the reading view); read to 0.1 cm.', done: ['xe', 'yw', 'an', 'as'].every((c) => filled(s.cells[c])) },
    { id: 'means', label: 'The two means and their ratio', target: 'book', why: 'Mean equatorial, mean axial, then axial ÷ equatorial.', done: filled(s.answers.me.value) && filled(s.answers.ma.value) && filled(s.answers.ratio.value) },
    ...(o && o.sheet.lines.length && !o.sheet.aligned ? [{ id: 'redo', label: 'Start a fresh sheet now the meridian is marked', target: 'paper', why: 'This sheet was not lined up.', done: false } as GuideStep] : []),
  ];
}

function electromagnet(s: PhyMagnetismState, v: PhyMagnetismVariant): GuideStep[] {
  const set = emSettings(s);
  const steps: GuideStep[] = [{ id: 'wind', label: 'Wind 30 turns on the soft-iron nail, all the same way', target: 'nail', why: 'Turns wound the other way cancel; soft iron is easily magnetised and demagnetised.', done: (s.turns === 30 && s.core === 'iron' && !s.mixed) || s.lifts.length > 0, group: 'The coil' }];
  const near = (I: number, turns: number, core = 'iron') => set.findIndex((x) => x.l.turns === turns && x.l.core === core && Math.abs(emCurrent(v, { ...s.lifts[x.lifts[0]!]!, heat: 0 }) - I) < 0.08);
  for (const I of EM_CARD) {
    const i = near(I, 30);
    const n = i >= 0 ? set[i]!.lifts.length : 0;
    const group = `30 turns, ${I.toFixed(1)} A`;
    steps.push(
      { id: `set-${I}`, label: `Close the key and set the rheostat until the ammeter reads ${I.toFixed(2)} A`, target: 'rheostat', why: 'Read the ammeter in the reading view; open the key again while you think.', done: n > 0, group },
      { id: `lift-${I}`, label: `Lift the clips and count them — twice, opening the key between (${Math.min(2, n)} of 2)`, target: 'nail', why: 'Open the key after each lift so the coil does not warm; drop the clips back in the dish.', done: n >= 2, group },
      { id: `row-${I}`, label: 'Write N, I, the two counts and the mean', target: 'book', why: 'I to 0.05 A; whole clips.', done: i >= 0 && rowDone(s, i, ['N', 'I', 'c1', 'c2', 'c']), group },
    );
    if (n < 2) break;
  }
  const i60 = near(1.0, 60);
  const iN = near(1.0, 30, 'none');
  steps.push(
    { id: '60', label: 'Wind 60 turns and lift twice at 1.00 A', target: 'nail', why: 'Only the turns change, so compare with your 30-turn row at 1.0 A.', done: i60 >= 0 && set[i60]!.lifts.length >= 2 && rowDone(s, i60, ['N', 'I', 'c1', 'c2', 'c']), group: 'Turns and core' },
    { id: 'none', label: 'Slide the core out and lift twice at 1.00 A', target: 'nail', why: 'The coil alone is a very weak magnet: the iron core multiplies the field.', done: iN >= 0 && set[iN]!.lifts.length >= 2 && filled(s.cells.nc), group: 'Turns and core' },
    { id: 'graph', label: 'Plot clips against I (30 turns) and draw a line along the straight first part', target: 'book', why: 'The curve bends over at high currents as the iron saturates.', done: !!s.line },
    { id: 'calc', label: 'The initial slope and the 60 ÷ 30 ratio', target: 'book', why: 'Slope in clips per ampere.', done: filled(s.answers.slope.value) && filled(s.answers.rturns.value) },
  );
  return steps;
}
function induction(s: PhyMagnetismState): GuideStep[] {
  const has = (p: (m: PhyMagnetismState['moves'][number]) => boolean) => s.moves.some(p);
  const b = (m: PhyMagnetismState['moves'][number]) => m.coil === 200 && m.pole === 'N' && m.magnets === 1;
  const done = s.moves.length > 0 && s.moves.every((_, k) => rowDone(s, k, ['dir', 'size']));
  return [
    { id: 'far', label: 'Stand the galvanometer well away from the magnet', target: 'galvo', why: 'A magnet close to it pulls the needle directly.', done: s.galvoFar, group: 'Before you start' },
    { id: 'in', label: 'Push the N pole slowly into the 200-turn coil', target: 'magnets', why: 'Along the axis. Watch which way the needle swings and how far.', done: has((m) => b(m) && m.speed === 'slow' && m.kind === 'in'), group: 'Slowly, N pole' },
    { id: 'still', label: 'Hold it still inside', target: 'magnets', why: 'No change of flux: does the needle move?', done: has((m) => b(m) && m.kind === 'still'), group: 'Slowly, N pole' },
    { id: 'out', label: 'Pull it out', target: 'magnets', why: 'Which way now?', done: has((m) => b(m) && m.speed === 'slow' && m.kind === 'out'), group: 'Slowly, N pole' },
    { id: 'fast', label: 'Push it in and pull it out quickly', target: 'magnets', why: 'The faster the flux changes, the larger the e.m.f.', done: has((m) => b(m) && m.speed === 'fast' && m.kind === 'in') && has((m) => b(m) && m.speed === 'fast' && m.kind === 'out'), group: 'Faster, S pole, two magnets' },
    { id: 'S', label: 'The S pole first: in and out (slowly)', target: 'magnets', why: 'Turn the magnet round.', done: has((m) => m.coil === 200 && m.pole === 'S' && m.kind === 'in') && has((m) => m.coil === 200 && m.pole === 'S' && m.kind === 'out'), group: 'Faster, S pole, two magnets' },
    { id: 'two', label: 'Two magnets together: in and out (slowly)', target: 'magnets', why: 'A stronger magnet: a larger flux change.', done: has((m) => m.magnets === 2 && m.kind === 'in') && has((m) => m.magnets === 2 && m.kind === 'out'), group: 'Faster, S pole, two magnets' },
    { id: '600', label: 'The 600-turn coil: the N pole in and out (slowly, one magnet)', target: 'coil600', why: 'More turns link the flux change.', done: has((m) => m.coil === 600 && m.kind === 'in') && has((m) => m.coil === 600 && m.kind === 'out'), group: 'More turns' },
    { id: 'table', label: 'Write the direction (L, R or 0) and the size of every swing', target: 'book', why: 'To the nearest half division.', done },
    { id: 'calc', label: 'E = NΔΦ/Δt from the card, E at twice the speed, the two ratios and the Lenz question', target: 'book', why: 'Faraday gives the size; Lenz gives the direction.', done: ['emf', 'emf2', 'rspeed', 'rturns', 'lenz'].every((id) => filled(s.answers[id as 'emf'].value)) },
  ];
}

function diode(s: PhyMagnetismState): GuideStep[] {
  const fwd = s.reads.filter((r) => r.bias === 'fwd').length;
  const rev = s.reads.filter((r) => r.bias === 'rev').length;
  return [
    { id: 'r', label: 'Check: protective resistor in, voltmeter across the diode only', target: 'resistor', why: 'The resistor limits the current; across diode and resistor the voltmeter would read too much.', done: s.resistor && s.vm === 'diode', group: 'The circuit' },
    { id: 'fwd', label: `Forward bias: set ${DIODE_CARD_FWD.join(', ')} V across the diode, reading both meters each time (${Math.min(DIODE_CARD_FWD.length, fwd)} of ${DIODE_CARD_FWD.length})`, target: 'pot', why: 'Close the key, adjust the potentiometer, read, open the key. Small steps near the knee (0.55–0.72 V).', done: fwd >= DIODE_CARD_FWD.length, group: 'Forward bias' },
    { id: 'rev', label: `Reverse the diode; 0–10 V range; ${DIODE_CARD_REV.join(', ')} V (${Math.min(DIODE_CARD_REV.length, rev)} of ${DIODE_CARD_REV.length})`, target: 'diode', why: 'Write the reverse p.d.s as negative.', done: rev >= DIODE_CARD_REV.length, group: 'Reverse bias' },
    { id: 'table', label: 'Write V and I for every reading', target: 'book', why: 'V to 0.01 V (0.1 V on 10 V); I to 0.5 mA.', done: s.rows.length > 0 && s.rows.every((r) => filled(r.c.V) && filled(r.c.I)) },
    { id: 'graph', label: 'Plot I against V and draw the tangent to the steep part', target: 'book', why: 'Where the tangent meets the V axis is the knee voltage.', done: !!s.line },
    { id: 'calc', label: 'The knee voltage, ΔV/ΔI and V/I at 0.70 V', target: 'book', why: 'Current in amperes for the resistances.', done: filled(s.answers.knee.value) && filled(s.answers.rdyn.value) && filled(s.answers.rstat.value) },
  ];
}

export function guideSteps(s: PhyMagnetismState, scene: SceneState, mode: CameraMode, v: PhyMagnetismVariant): GuideStep[] {
  const task = s.task ?? 'FIELD';
  const body = task === 'FIELD' ? field(s) : task === 'ELECTROMAGNET' ? electromagnet(s, v) : task === 'INDUCTION' ? induction(s) : diode(s);
  return [
    ...setup(task, scene, mode),
    ...body,
    { id: 'written', label: 'Write two precautions', target: 'book', why: 'Things you did to make the readings accurate.', done: filled(s.written.precautions) },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  ];
}

export function correctionFor(a: string, s: PhyMagnetismState): Correction | null {
  const [verb, arg] = a.split(':') as [string, string | undefined];
  const task = s.task ?? 'FIELD';
  if (verb === 'collect' && arg && !NEEDED[task].includes(arg as ApparatusId) && arg !== 'steelrod' && APPARATUS_LABEL[arg as ApparatusId]) return { title: `The ${APPARATUS_LABEL[arg as ApparatusId].toLowerCase()} is not needed here.`, why: 'You can put it back from your bench or the cupboard list.' };
  if (verb === 'line' || verb === 'dot' || verb === 'line-end') {
    const o = openSheet(s);
    const l = o?.sheet.lines[o.sheet.lines.length - 1];
    if (o && !o.sheet.aligned) return { title: 'Mark the meridian first.', why: 'The paper is not lined up with the magnetic meridian, so the magnet lies off it and the neutral points move off their lines. Mark it, then plot on a fresh sheet.', focus: 'field' };
    if (o?.sheet.steel) return { title: 'Steel is close to the board.', why: 'The keys and phone distort the field. Put them away and plot on a fresh sheet.', focus: 'field' };
    if (l && !l.tapped) return { title: 'Tap the compass before each dot.', why: 'A sticking needle points a few degrees off; the error carries along the line.' };
    if (l && l.compass !== 'small') return { title: 'Use the small compass.', why: 'A long needle takes big steps: the curve is coarse.' };
  }
  if (verb === 'lift') {
    const l = s.lifts[s.lifts.length - 1];
    if (l && l.heat >= 2) return { title: 'Open the key between readings.', why: 'With the key left closed the coil warms and the current falls.' };
    if (l?.core === 'steel') return { title: 'Use the soft-iron nail.', why: 'Steel keeps its magnetism: clips stay on after you switch off, and it is weaker.', focus: 'em' };
    if (l?.mixed) return { title: 'Wind every turn the same way.', why: 'Turns wound the other way make an opposing field: the magnet is much weaker.', focus: 'em' };
  }
  if (verb === 'move') {
    const m = s.moves[s.moves.length - 1];
    if (m && !m.galvoFar) return { title: 'Move the galvanometer away from the magnet.', why: 'The magnet pulls on the needle directly, so it reads even when nothing is induced.', focus: 'ind' };
    if (m && !m.axis) return { title: 'Move the magnet along the axis of the coil.', why: 'From the side, less flux threads the turns: smaller, erratic swings.', focus: 'ind' };
  }
  if (verb === 'read') {
    const r = s.reads[s.reads.length - 1];
    if (r && !r.resistor) return { title: 'Put the protective resistor back.', why: 'Without it a forward-biased diode can draw a damaging current.', focus: 'diode' };
    if (r && r.vm !== 'diode' && r.bias === 'fwd') return { title: 'The voltmeter goes across the diode only.', why: 'Across the diode and the resistor it adds the p.d. across the resistor.', focus: 'diode' };
    if (r && r.heat >= 1) return { title: 'Open the key between readings.', why: 'A diode left passing current warms, and its p.d. falls about 2 mV per kelvin.' };
  }
  if (verb === 'burnt') return { title: 'The diode burnt out!', why: 'Too much current flowed: keep the protective resistor in and turn the potentiometer down. Replace the diode.', focus: 'diode' };
  return null;
}
