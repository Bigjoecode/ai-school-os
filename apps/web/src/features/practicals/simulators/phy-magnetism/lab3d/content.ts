import { emptyPhyMagnetismState, type MagTask, type PhyMagnetismState } from '@aischool/shared';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import type { Spot } from '../../../lab3d-kit/store';
import { NEEDED, PLACEABLE } from './scene-state';
import { COIL, DP, EMP, FBOARD, GALVO_FAR } from './views';

/** The magnetism bench's "What is this?" cards, Learn stage and Ask suggestions. */

const none = { mistake: '—', keys: [] as string[] };
const E: Record<string, Explainer> = {
  board: { name: 'Drawing board', purpose: 'Holds the paper flat and still while you plot.', how: 'Lay it flat on the bench, far from iron and wires.', mistake: 'A bench with an iron frame or wires underneath.', keys: ['iron', 'board', 'wires'] },
  paper: { name: 'White paper', purpose: 'The record: the magnet’s outline, the dots, the lines and the neutral points.', how: 'Line its edge up with the magnetic meridian before the magnet goes on.', mistake: 'Not lining it up, so the magnet lies off the meridian.', keys: ['meridian', 'paper'] },
  magnet: { name: 'Bar magnet', purpose: 'The source of the field you plot.', how: 'In the middle of the paper, along the meridian; its outline drawn.', mistake: 'Dropping it: it loses strength.', keys: ['magnet', 'drop'] },
  compass: { name: 'Plotting compass', purpose: 'Its needle lines up with the resultant field where it stands.', how: 'Tail on the last dot, mark the head; tap it gently before each mark.', mistake: 'A large compass, or a sticking needle that was not tapped.', keys: ['tap', 'small compass', 'compass'] },
  keys: { name: 'Keys and a phone', purpose: 'Not apparatus: steel and a speaker magnet.', how: 'Put them in your bag, away from the board.', mistake: 'Leaving them by the paper: they bend the field.', keys: ['steel', 'keys', 'phones'] },
  rule: { name: 'Ruler', purpose: 'Measures each neutral point’s distance from the centre of the magnet.', how: 'From the centre to the mark; read to 0.1 cm.', mistake: 'Measuring from the end of the magnet.', keys: ['distance'] },
  pencil: { name: 'Sharp pencil', purpose: 'Small, exact dots and thin lines.', how: 'Mark at the very ends of the needle.', ...none },
  filings: { name: 'Iron filings', purpose: 'A quick picture of the pattern (not used for plotting).', how: 'Sprinkle on paper over the magnet; tap.', mistake: 'Blowing them — they get in your eyes.', keys: ['filings', 'eyes'] },
  cells: { name: 'Dry cells', purpose: 'The supply (1.5 V each).', how: 'In series in their holder.', mistake: 'Short-circuiting them.', keys: ['short', 'cells'] },
  key: { name: 'Plug key', purpose: 'Switches the current on and off.', how: 'Close it only while you read; open it between readings.', mistake: 'Leaving it closed: the coil (or diode) warms.', keys: ['key', 'briefly', 'warm'] },
  rheostat: { name: 'Rheostat', purpose: 'Sets the current.', how: 'Slide it while you watch the ammeter.', mistake: 'Starting with no resistance.', keys: ['rheostat', 'current'] },
  ammeter: { name: 'Ammeter (0–3 A)', purpose: 'Measures the current in the coil.', how: 'In series; read to 0.05 A at eye level.', mistake: 'Parallax.', keys: ['ammeter', 'current'] },
  nail: { name: 'Electromagnet', purpose: 'A coil on a soft-iron core: a magnet only while current flows.', how: 'Wind the turns tightly, all the same way.', mistake: 'Winding some turns the other way, or using steel.', keys: ['turns', 'soft iron', 'same direction', 'core'] },
  clips: { name: 'Steel paper clips', purpose: 'The number held measures the strength of the electromagnet.', how: 'All the same size; back in the dish after each lift.', mistake: 'Counting clips that cling to each other in chains as one.', keys: ['clips', 'same size', 'chains'] },
  coil200: { name: 'Coil of 200 turns', purpose: 'The flux of the magnet links its turns.', how: 'Joined firmly to the galvanometer; the magnet moves along its axis.', mistake: 'Loose connections.', keys: ['coil', 'connected', 'axis'] },
  coil600: { name: 'Coil of 600 turns', purpose: 'Three times the turns: more flux linkage.', how: 'Change coils with the magnet out.', ...none },
  galvo: { name: 'Centre-zero galvanometer', purpose: 'Shows the size and direction of a small current.', how: 'Well away from the magnet; read the largest swing.', mistake: 'Standing it next to the magnet.', keys: ['galvanometer', 'away', 'overshoot'] },
  magnets: { name: 'Bar magnets', purpose: 'Their moving flux induces the e.m.f.', how: 'Push in, hold still, pull out — along the axis.', mistake: 'Dropping them: they lose strength and chip.', keys: ['drop', 'magnet', 'speed'] },
  leads: { name: 'Connecting wires', purpose: 'Join the circuit.', how: 'Clean ends, tightly screwed.', ...none },
  pot: { name: 'Potentiometer', purpose: 'Gives a smoothly variable p.d. from the cells.', how: 'Turn it up in small steps.', mistake: 'Turning it up too quickly near the knee.', keys: ['small steps', 'potentiometer'] },
  resistor: { name: 'Protective resistor (100 Ω)', purpose: 'Limits the current through the diode.', how: 'Always in series with the diode.', mistake: 'Leaving it out: a damaging current.', keys: ['protective resistor', 'resistor', 'rated'] },
  diode: { name: 'Silicon diode', purpose: 'Conducts one way only: above about 0.6 V forward, almost nothing in reverse.', how: 'Anode to + for forward bias; the band marks the cathode.', mistake: 'Exceeding its rated current.', keys: ['diode', 'rated', 'forward'] },
  mamm: { name: 'Milliammeter (0–50 mA)', purpose: 'Measures the diode current.', how: 'In series; read to 0.5 mA.', mistake: 'Parallax.', keys: ['milliammeter', 'resolution'] },
  vmeter: { name: 'Voltmeter', purpose: 'Measures the p.d. across the diode.', how: 'Across the diode only; 0–1 V range forward, 0–10 V reverse.', mistake: 'Across the diode and the resistor.', keys: ['voltmeter', 'across'] },
  book: { name: 'Practical notebook', purpose: 'Your table, graph and answers — this is what is marked.', how: 'Every reading to the instrument’s precision, with units.', mistake: 'Leaving out units.', keys: ['graph', 'table'] },
  card: { name: 'Task card', purpose: 'The question paper.', how: 'Read it before you start.', ...none },
  steelrod: { name: 'Steel rod', purpose: 'Compare with soft iron: steel keeps its magnetism.', how: 'Only to compare.', ...none },
  spring: { name: 'Spiral spring', purpose: 'For Hooke’s law, not this practical.', how: 'Not needed here.', ...none },
  pendulum: { name: 'Pendulum bob', purpose: 'For the simple pendulum, not this practical.', how: 'Not needed here.', ...none },
  coat: { name: 'Lab coat', purpose: 'Keeps your clothes clean.', how: 'Optional here.', ...none },
  goggles: { name: 'Safety goggles', purpose: 'Eye protection.', how: 'Wear them with iron filings.', ...none },
  co2: { name: 'CO₂ fire extinguisher', purpose: 'For electrical fires: it does not conduct.', how: 'Tell the teacher first.', ...none },
  blanket: { name: 'Fire blanket', purpose: 'Smothers a small fire.', how: 'Pull both tapes down sharply.', ...none },
  extinguisher: { name: 'Fire extinguisher', purpose: 'Puts out small fires.', how: 'Tell the teacher.', ...none },
  firstaid: { name: 'First-aid box', purpose: 'Plasters and dressings.', how: 'Tell the teacher about every injury.', ...none },
  eyewash: { name: 'Eye-wash station', purpose: 'Rinses filings or dust out of the eyes.', how: 'Rinse for 10 minutes.', ...none },
  notice: { name: 'Notice board', purpose: 'Department notices.', how: '—', ...none },
  shelf: { name: 'Physics equipment shelf', purpose: 'Equipment for other practicals.', how: 'Take only what the teacher gives out.', ...none },
  vdg: { name: 'Van de Graaff generator', purpose: 'High-voltage static electricity.', how: 'Teacher only.', ...none },
  whiteboard: { name: 'Whiteboard', purpose: 'Today’s practical.', how: 'Read it as you come in.', ...none },
  'poster-si': { name: 'Poster: SI base units', purpose: 'The base units.', how: 'Current in A, flux in Wb.', ...none },
  'poster-light': { name: 'Poster: refraction of light', purpose: 'For the optics practicals.', how: '—', ...none },
  'poster-electric': { name: 'Poster: electrical safety', purpose: 'Rules for circuits.', how: 'Low-voltage cells only.', ...none },
  desk: { name: 'Teacher’s desk', purpose: 'Where the teacher checks your work.', how: '—', ...none },
};
export const explainer = makeExplainer(E);

export const ASK_SUGGESTIONS: Record<MagTask, AskSuggestions> = {
  FIELD: {
    LEARN: ['What is a neutral point?', 'Why mark the meridian first?', 'Why do field lines never cross?', 'Why tap the compass?'],
    DEMO: ['Why are the neutral points east and west?', 'Why do they move when the magnet is reversed?', 'Why do some lines run off the paper?', 'What does the Earth’s field do here?'],
    TRY: ['Where do I start a field line?', 'How do I know I have found a neutral point?', 'Where do I measure the distance from?', 'Why must the keys go away?'],
    SANDBOX: ['What do two like poles give?', 'What happens with a stronger magnet?', 'What if the Earth’s field were weaker?', 'Where is there a neutral point between unlike poles?'],
  },
  ELECTROMAGNET: {
    LEARN: ['Why is soft iron used for the core?', 'How does the number of turns matter?', 'What is magnetic saturation?', 'Where are electromagnets used?'],
    DEMO: ['Why open the key between readings?', 'Why does the graph bend over?', 'Why does a steel core keep clips?', 'What does the initial slope mean?'],
    TRY: ['How do I set the current?', 'How do I count clips in a chain?', 'Why do I need the same current for 60 turns?', 'Why is there no line through all the points?'],
    SANDBOX: ['What if I wind the turns both ways?', 'How strong is the coil with no core?', 'Does the heating matter?', 'How does an electric bell work?'],
  },
  INDUCTION: {
    LEARN: ['What is Faraday’s law?', 'What is Lenz’s law?', 'Why must the magnet move?', 'What is flux linkage?'],
    DEMO: ['Why does the needle reverse?', 'Why does a faster push give a bigger swing?', 'Why is 600 turns not three times bigger?', 'What happens when the magnet stops?'],
    TRY: ['How do I read the direction?', 'How do I work out E = NΔΦ/Δt?', 'Which face becomes N?', 'Why keep the galvanometer away?'],
    SANDBOX: ['What does a stronger magnet do?', 'Does the coil’s resistance matter?', 'How does a bicycle dynamo work?', 'What is a transformer?'],
  },
  DIODE: {
    LEARN: ['What is forward bias?', 'Why is the protective resistor needed?', 'What is the knee voltage?', 'What is a depletion layer?'],
    DEMO: ['Why take small steps near the knee?', 'Why is the reverse current zero on the meter?', 'How do I draw the tangent?', 'What is dynamic resistance?'],
    TRY: ['How do I set 0.65 V exactly?', 'Which range do I use in reverse?', 'Why write reverse values negative?', 'Static or dynamic resistance?'],
    SANDBOX: ['What happens without the resistor?', 'How does warming change the curve?', 'How does a rectifier work?', 'What is a germanium diode’s knee?'],
  },
};

/** The bench as Mr Bayo sets it out for the introduction (display only, never saved). */
export function learnState(task: MagTask): PhyMagnetismState {
  const s = emptyPhyMagnetismState();
  return {
    ...s,
    task,
    meridian: true,
    steelAway: true,
    tapEach: true,
    cx: 0,
    cy: 9,
    rheo: 0.36,
    pot: 0.3,
    galvoFar: true,
    log: [{ t: 0, a: `task:${task}` }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` })), ...PLACEABLE[task].map((id) => ({ t: 0, a: `place:${id}` }))],
  };
}

const SPOTS: Record<MagTask, Record<string, Spot>> = {
  FIELD: {
    rig: { target: [FBOARD.x, 0.02, FBOARD.z], dist: 0.75, pitch: 1.0 },
    magnet: { target: [FBOARD.x, 0.02, FBOARD.z], dist: 0.35, pitch: 0.9 },
    compass: { target: [FBOARD.x, 0.02, FBOARD.z - 0.09], dist: 0.3, pitch: 0.8 },
  },
  ELECTROMAGNET: {
    rig: { target: [0, 0.08, -0.08], dist: 1.0, pitch: 0.32 },
    nail: { target: [EMP.dish[0], 0.1, EMP.dish[2]], dist: 0.45, pitch: 0.2 },
    meter: { target: [EMP.ammeter[0], 0.08, EMP.ammeter[2]], dist: 0.45, pitch: 0.15 },
  },
  INDUCTION: {
    rig: { target: [-0.1, 0.06, -0.08], dist: 0.95, pitch: 0.3 },
    coil: { target: [COIL.at[0], 0.05, COIL.at[2]], dist: 0.45, pitch: 0.3 },
    galvo: { target: [GALVO_FAR[0], 0.08, GALVO_FAR[2]], dist: 0.45, pitch: 0.15 },
  },
  DIODE: {
    rig: { target: [0, 0.07, -0.08], dist: 1.1, pitch: 0.45 },
    diode: { target: [DP.diode[0], 0.03, DP.diode[2]], dist: 0.35, pitch: 0.6 },
    meters: { target: [DP.mamm[0] + 0.12, 0.08, DP.mamm[2]], dist: 0.55, pitch: 0.2 },
  },
};

export function learnConfig(task: MagTask): LearnConfig {
  const S = SPOTS[task];
  const MATCH: Record<MagTask, [RegExp, string, Spot][]> = {
    FIELD: [
      [/magnet/i, 'magnet', S.magnet!],
      [/compass/i, 'compass', S.compass!],
      [/board/i, 'board', S.rig!],
      [/ruler/i, 'paper', S.rig!],
    ],
    ELECTROMAGNET: [
      [/nail|core/i, 'nail', S.nail!],
      [/wire/i, 'nail', S.nail!],
      [/cells|supply/i, 'cells', S.rig!],
      [/ammeter/i, 'ammeter', S.meter!],
      [/rheostat/i, 'rheostat', S.rig!],
      [/key/i, 'key', S.rig!],
    ],
    INDUCTION: [
      [/coil/i, 'coil200', S.coil!],
      [/galvanometer/i, 'galvo', S.galvo!],
      [/magnet/i, 'magnets', S.coil!],
      [/wires/i, 'leads', S.rig!],
    ],
    DIODE: [
      [/diode/i, 'diode', S.diode!],
      [/resistor/i, 'resistor', S.diode!],
      [/supply|potentiometer/i, 'pot', S.rig!],
      [/milliammeter/i, 'mamm', S.meters!],
      [/voltmeter/i, 'vmeter', S.meters!],
      [/key/i, 'key', S.rig!],
    ],
  };
  const point: Record<MagTask, [string, string, string]> = { FIELD: ['paper', 'compass', 'paper'], ELECTROMAGNET: ['nail', 'ammeter', 'nail'], INDUCTION: ['coil200', 'galvo', 'galvo'], DIODE: ['diode', 'mamm', 'mamm'] };
  const two = Object.values(S);
  return {
    items: MATCH[task].map(([match, id, spot]) => ({ match, id, spot })),
    explain: explainer,
    procedure: [
      { spot: S.rig!, point: point[task][0] },
      { spot: two[1]!, point: point[task][1] },
    ],
    observe: { spot: S.rig!, point: point[task][2] },
    observeTitle: 'What you will see',
  };
}
