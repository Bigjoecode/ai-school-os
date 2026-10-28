import { emptyPhyCircuitsState, circuitsWireKey, type CircuitsTask, type PhyCircuitsState } from '@aischool/shared';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import type { Spot } from '../../../lab3d-kit/store';
import { physicsRoom } from '../../phy-common/lab3d/room';
import { BOARD, BRIDGE, FACE, GAP, GOOD_WIRES, PART, rboxAt } from './layout';
import { needed } from './scene-state';

/** The circuits lab's "What is this?" cards, Ask suggestions, camera presets, room, and the Learn stage's bench and spots. */

const E: Record<string, Explainer> = {
  cell: { name: 'Dry cell (1.5 V)', purpose: 'Supplies the e.m.f. that drives the current. In the e.m.f. experiment it is the cell under test.', how: 'Join its + terminal (red) towards the + terminals of the meters.', mistake: 'Joining + straight to − (or an ammeter across it): a short circuit that flattens the cell.', keys: ['cell', 'supply', 'e m f', 'polaris'] },
  key: { name: 'Plug key (switch)', purpose: 'Switches the current on and off.', how: 'Push the plug in only while you take a reading, then pull it out.', mistake: 'Leaving it closed between readings: the cell runs down (polarises) and the resistors warm up.', keys: ['key', 'switch'] },
  rheostat: { name: 'Rheostat (0–10 Ω)', purpose: 'Changes the external resistance, and so the current drawn from the cell.', how: 'Wire one end terminal and the slider in series. Slide it for a new current.', mistake: 'Sliding it to zero: almost a short circuit — the ammeter goes off the scale.', keys: ['rheostat', 'resistance box'] },
  ammeter: { name: 'Ammeter (0–1 A)', purpose: 'Measures the current.', how: 'In series, + towards the + of the cell. Read from directly in front, to half a division (0.01 A).', mistake: 'Connecting it across something — it has almost no resistance.', keys: ['ammeter', 'series', 'parallax', 'zero'] },
  voltmeter: { name: 'High-resistance voltmeter (0–3 V)', purpose: 'Measures the p.d. across the cell (e.m.f. experiment) or across the resistors.', how: 'In parallel, + towards +. Divisions of 0.05 V: read to half a division.', mistake: 'Connecting it across the ammeter as well as the resistors.', keys: ['voltmeter', 'parallel', 'parallax', 'directly across'] },
  galvanometer: { name: 'Centre-zero galvanometer', purpose: 'Detects a tiny current either way: zero deflection means the bridge is balanced.', how: 'Between the centre strip D and the jockey. It only reads while the jockey touches the wire.', mistake: 'Recording l while it still deflects.', keys: ['galvanometer', 'deflection', 'balance'] },
  bridge: { name: 'Metre bridge', purpose: 'A uniform wire 100 cm long on a metre scale, with thick copper strips making two gaps: a Wheatstone bridge.', how: 'Cell and key across the ends A and C. At balance X/R = l/(100 − l), l measured from A.', mistake: 'Measuring l from the wrong end, or dragging the jockey along the wire.', keys: ['bridge', 'wire', 'jockey', 'end', 'middle', 'uniform', 'interchang'] },
  jockey: { name: 'Jockey', purpose: 'A knife-edge contact that touches the bridge wire at one point.', how: 'Tap it on the wire; move it lifted. Read its position on the scale from directly above.', mistake: 'Sliding it while pressed: it scrapes the wire and spoils its uniformity.', keys: ['jockey', 'tap', 'slide', 'scrape'] },
  rbox: { name: 'Resistance box', purpose: 'A known resistance R: pull plugs out to add their resistance (10, 5, 2, 2, 1 Ω).', how: 'Choose R about the size of X so the balance point is near the middle of the wire.', mistake: 'Loose plugs (they add resistance): push the ones left in firmly.', keys: ['resistance box', 'plug', 'middle', 'known'] },
  unknown: { name: 'Unknown resistor X', purpose: 'The resistance you are finding.', how: 'In the left gap; interchange it with R for a check.', mistake: 'Handling it with the key closed (it warms and its resistance changes).', keys: ['unknown', 'resistor'] },
  r1: { name: 'Resistor R₁', purpose: 'One of the two resistors to combine.', how: 'Measure it alone first (V/I), then in series and in parallel with R₂.', mistake: 'Leaving the key closed: it warms up.', keys: ['resistor', 'series', 'parallel'] },
  r2: { name: 'Resistor R₂', purpose: 'The second resistor.', how: 'Series: end to end, one path. Parallel: both ends joined, two paths.', mistake: 'Adding the resistances directly for the parallel arrangement.', keys: ['resistor', 'series', 'parallel'] },
  wires: { name: 'Connecting wires', purpose: 'Join the terminals of the apparatus.', how: 'Clean ends, screwed down tightly.', mistake: 'Loose or dirty connections add resistance and make readings jump.', keys: ['connection', 'terminal', 'clean', 'tight'] },
  terminal: { name: 'Terminal post', purpose: 'Where a connecting wire is screwed on.', how: 'Drag from one terminal to another to join them; red caps are + terminals.', mistake: 'A loose connection.', keys: ['terminal', 'connection'] },
  board: { name: 'Circuit board', purpose: 'Holds the apparatus so the circuit can be laid out neatly.', how: 'Lay it out like the circuit diagram, then join the wires.', mistake: 'A tangle of wires that is hard to check.', keys: [] },
  battery: { name: 'Two cells in a holder', purpose: 'A 3 V battery.', how: 'Not needed: this practical uses one dry cell.', mistake: 'Too much current for the 0–1 A ammeter with small resistances.', keys: [] },
  bulb: { name: 'Torch bulb', purpose: 'A filament lamp (non-ohmic).', how: 'Not used in this experiment.', mistake: '', keys: [] },
  micrometer: { name: 'Micrometer screw gauge', purpose: 'Measures small diameters.', how: 'Not needed here.', mistake: '', keys: [] },
  book: { name: 'Practical notebook', purpose: 'Your table, graph, results and answers — this is what is marked.', how: 'Write each reading as you take it.', mistake: 'Rounding readings or leaving rows blank.', keys: ['record', 'decimal', 'plot'] },
  card: { name: 'Task card', purpose: 'The question paper.', how: 'Read it before you wire the circuit.', mistake: '', keys: [] },
  coat: { name: 'Lab coat', purpose: 'Keeps your clothes clean.', how: 'Optional in the physics lab.', mistake: '', keys: [] },
  goggles: { name: 'Safety goggles', purpose: 'Eye protection.', how: 'Not needed for low-voltage circuits.', mistake: '', keys: [] },
  co2: { name: 'CO₂ fire extinguisher', purpose: 'Puts out electrical fires without conducting electricity.', how: 'Switch off first; aim at the base of the fire. Tell the teacher.', mistake: 'Using water on an electrical fire.', keys: ['fire'] },
  blanket: { name: 'Fire blanket', purpose: 'Smothers a small fire.', how: 'Pull the tapes down sharply and lay it over the fire.', mistake: '', keys: [] },
  extinguisher: { name: 'Fire extinguisher', purpose: 'Puts out small fires.', how: 'Tell the teacher; aim at the base of the fire.', mistake: '', keys: [] },
  firstaid: { name: 'First-aid box', purpose: 'Plasters and dressings for small injuries.', how: 'Tell the teacher about every burn or cut.', mistake: '', keys: [] },
  eyewash: { name: 'Eye-wash station', purpose: 'Rinses dust out of the eyes.', how: 'Rinse with plenty of water.', mistake: '', keys: [] },
  shelf: { name: 'Physics equipment shelf', purpose: 'Spare meters, power packs, magnets and lenses.', how: 'Your apparatus is in the cupboard.', mistake: '', keys: [] },
  vdg: { name: 'Van de Graaff generator', purpose: 'A very high voltage for electrostatics demonstrations.', how: 'Only the teacher uses it.', mistake: 'Touching the dome.', keys: [] },
  notice: { name: 'Notice board', purpose: 'Timetables, rules and tips.', how: 'Read the WAEC tips!', mistake: '', keys: [] },
  'poster-si': { name: 'SI base units', purpose: 'Base and derived units (Ω = V A⁻¹).', how: 'Every answer needs its unit.', mistake: '', keys: [] },
  'poster-electric': { name: 'Electrical safety', purpose: 'The rules for working with circuits.', how: 'Low voltage only; open the key between readings.', mistake: '', keys: ['mains', 'key'] },
  'poster-light': { name: 'Refraction of light', purpose: 'For another practical.', how: '', mistake: '', keys: [] },
  whiteboard: { name: 'Whiteboard', purpose: 'Today’s practical.', how: '', mistake: '', keys: [] },
  desk: { name: 'Teacher’s desk', purpose: 'Where the teacher checks your circuit before you switch on.', how: '', mistake: '', keys: [] },
};
export const explainer = makeExplainer(E, { 'term:mb-j': 'jockey', 'term:': 'terminal', 'wire:': 'wires' });

export const ASK_SUGGESTIONS: AskSuggestions = {
  LEARN: ['What is a balance point?', 'Why is the e.m.f. bigger than the terminal p.d.?', 'Why does a parallel pair have less resistance?', 'Why open the key between readings?'],
  DEMO: ['Why tap the jockey instead of sliding it?', 'Why interchange X and R?', 'Why is the slope of V against I negative?', 'How do you read a meter without parallax?'],
  TRY: ['Where does the galvanometer go?', 'My ammeter reads zero — why?', 'How many decimal places?', 'How do I find the intercept?'],
  SANDBOX: ['What if R is much bigger than X?', 'What happens with a bigger internal resistance?', 'What if three resistors were in parallel?', 'Why does the galvanometer’s resistance not matter at balance?'],
};

const meterSpot = (p: readonly [number, number, number]): Spot => ({ target: [p[0], p[1] + FACE.cy, p[2] + 0.06], dist: 0.32, pitch: 0.06 });
const S = {
  board: { target: [BOARD.x, 0.05, BOARD.z + 0.05], dist: 0.85, pitch: 0.8 } as Spot,
  bridge: { target: [BRIDGE.x0 + 0.5, 0.03, BRIDGE.wireZ - 0.04], dist: 0.95, pitch: 0.75 } as Spot,
  jockey: { target: [BRIDGE.x0 + 0.5, 0.04, BRIDGE.wireZ], dist: 0.4, pitch: 0.7 } as Spot,
  gaps: { target: [GAP.centre, 0.05, BRIDGE.stripZ - 0.06], dist: 0.75, pitch: 0.7 } as Spot,
  rbox: { target: [rboxAt(false)[0], 0.06, rboxAt(false)[2]], dist: 0.42, pitch: 0.65 } as Spot,
  cell: { target: [PART.cell[0], 0.04, PART.cell[2]], dist: 0.42, pitch: 0.5 } as Spot,
  key: { target: [PART.key[0], 0.04, PART.key[2]], dist: 0.38, pitch: 0.55 } as Spot,
  rheostat: { target: [PART.rheostat[0], 0.08, PART.rheostat[2]], dist: 0.45, pitch: 0.45 } as Spot,
  resistors: { target: [PART.r1[0], 0.04, (PART.r1[2] + PART.r2[2]) / 2], dist: 0.45, pitch: 0.6 } as Spot,
  ammeter: meterSpot(PART.ammeter),
  voltmeter: meterSpot(PART.voltmeter),
  galvanometer: meterSpot(PART.galvanometer),
};
export const SPOTS = S;
/** Straight down at the jockey's knife edge on the scale (reading l). */
export const scaleSpot = (jockey: number): Spot => ({ target: [BRIDGE.x0 + jockey / 100, BRIDGE.y, BRIDGE.wireZ + 0.025], dist: 0.15, pitch: 1.15 });
export const CIRCUITS_VIEWS: CameraPresets = { board: S.board, bridge: S.bridge, jockey: S.jockey, rbox: S.rbox, ammeter: S.ammeter, voltmeter: S.voltmeter, galvanometer: S.galvanometer, resistors: S.resistors };
export const viewButtons = (task: CircuitsTask) => [
  { id: 'bench', label: 'Whole bench' },
  { id: 'board', label: 'Board' },
  ...(task === 'BRIDGE'
    ? [
        { id: 'bridge', label: 'Bridge' },
        { id: 'jockey', label: 'Jockey' },
        { id: 'galvanometer', label: 'Galvanometer' },
      ]
    : [
        { id: 'ammeter', label: 'Ammeter' },
        { id: 'voltmeter', label: 'Voltmeter' },
      ]),
];

const BOARD_TEXT: Record<CircuitsTask, string[]> = {
  BRIDGE: ['Physics — SS3 Practical', 'Unknown resistance: metre bridge', 'X/R = l/(100 − l)', 'Balance near the middle; interchange X and R'],
  EMF: ['Physics — SS3 Practical', 'E.m.f. and internal resistance', 'V = E − Ir', 'Plot V against I: intercept E, slope −r'],
  SERIES: ['Physics — SS3 Practical', 'Resistors in series and parallel', 'Series: R = R₁ + R₂', 'Parallel: 1/R = 1/R₁ + 1/R₂'],
};
export const circuitsRoom = (task: CircuitsTask) =>
  physicsRoom('ohm', BOARD_TEXT[task], task === 'BRIDGE' ? 'Tap the jockey — never slide it!' : 'Open the key between readings!', {
    title: task === 'BRIDGE' ? 'Wheatstone bridge' : 'Reading a meter',
    band: '#b23c17',
    lines: task === 'BRIDGE' ? ['At balance no current flows', 'through the galvanometer.', 'X/R = l/(100 − l)', 'l from the left end, 0.1 cm.'] : ['Look straight at the pointer.', 'Read to half a division.', 'I and V to 2 decimal places.', 'Check the zero first.'],
  });

/** The bench as Mr Bayo sets it out for the introduction (display only). */
export function learnState(task: CircuitsTask): PhyCircuitsState {
  return {
    ...emptyPhyCircuitsState(),
    task,
    rheostat: 0.4,
    rbox: 5,
    wires: GOOD_WIRES[task].map(([a, b]) => circuitsWireKey(a, b)),
    log: needed(task).map((a) => ({ t: 0, a: `collect:${a.id}` })),
  };
}

const MATCH: [RegExp, keyof typeof S, CircuitsTask[]][] = [
  [/metre bridge/i, 'bridge', ['BRIDGE']],
  [/resistance box|standard resistors/i, 'rbox', ['BRIDGE']],
  [/unknown resistor/i, 'gaps', ['BRIDGE']],
  [/galvanometer/i, 'galvanometer', ['BRIDGE']],
  [/jockey/i, 'jockey', ['BRIDGE']],
  [/rheostat/i, 'rheostat', ['EMF']],
  [/two resistors|resistors/i, 'resistors', ['SERIES']],
  [/ammeter/i, 'ammeter', ['EMF', 'SERIES']],
  [/voltmeter/i, 'voltmeter', ['EMF', 'SERIES']],
  [/cell/i, 'cell', ['BRIDGE', 'EMF', 'SERIES']],
  [/key|switch/i, 'key', ['BRIDGE', 'EMF', 'SERIES']],
  [/connecting wire/i, 'board', ['BRIDGE', 'EMF', 'SERIES']],
];
const POINT: Partial<Record<keyof typeof S, string>> = { gaps: 'unknown', jockey: 'bridge', resistors: 'r1', board: 'board' };

/** Learn's camera spots for the task. */
export function learnConfig(task: CircuitsTask): LearnConfig {
  const bridge = task === 'BRIDGE';
  return {
    items: MATCH.filter(([, , t]) => t.includes(task)).map(([match, id]) => ({ match, id: POINT[id] ?? id, spot: S[id] })),
    explain: explainer,
    procedure: [
      { spot: S.board, point: 'board' },
      { spot: bridge ? S.bridge : S.ammeter, point: bridge ? 'bridge' : 'ammeter' },
    ],
    observe: { spot: bridge ? S.galvanometer : S.voltmeter, point: bridge ? 'galvanometer' : 'voltmeter' },
    observeTitle: bridge ? 'At the balance point' : 'What the meters show',
  };
}
