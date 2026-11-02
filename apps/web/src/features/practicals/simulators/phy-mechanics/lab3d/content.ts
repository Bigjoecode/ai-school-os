import { emptyPhyMechanicsState, FORCES_CARD, type MechTask, type PhyMechanicsState } from '@aischool/shared';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import type { Spot } from '../../../lab3d-kit/store';
import { NEEDED, PLACEABLE } from './scene-state';
import { BLOCK, BOARD, CYL, GLY_AT, OIL_AT, PLANK, RAMP, SPOT, SURFACE } from './views';

/** The mechanics bench's "What is this?" cards, Learn stage and Ask suggestions. */

const none = { mistake: '—', keys: [] as string[] };
const E: Record<string, Explainer> = {
  block: { name: 'Wooden block with hook', purpose: 'The body whose friction with the plank you measure.', how: 'Pull it by the hook, horizontally; load it with slotted masses to change R.', mistake: 'Pulling upwards at an angle, which lifts it and lowers R.', keys: ['horizontal', 'block'] },
  plank: { name: 'Smooth wooden plank', purpose: 'The surface the block rests on; raised at one end for the angle of slipping.', how: 'Clean and dry; raise one end slowly and support it firmly.', mistake: 'A dusty plank: the friction is lower and varies.', keys: ['clean', 'dry', 'plank', 'raised', 'support'] },
  sbalance: { name: 'Spring balance (0–10 N)', purpose: 'Weighs the block (R) and measures the pull (F).', how: 'Check its zero; pull slowly and read it just as the block starts to move, to 0.05 N.', mistake: 'Reading it after the block is already sliding (that is kinetic friction).', keys: ['zero', 'slowly', 'gradually', 'starts to move', 'jerk'] },
  slotted: { name: 'Slotted masses (100 g)', purpose: 'Increase the normal reaction R in steps of about 0.98 N.', how: 'Stack them centrally on the block.', mistake: 'Forgetting to weigh the block with its load.', keys: ['mass'] },
  protractor: { name: 'Protractor', purpose: 'Measures the angle of the plank when the block just slips.', how: 'Its base on the bench, its centre at the hinge; read to 1°.', mistake: 'Using sin θ instead of tan θ.', keys: ['angle', 'tan'] },
  cloth: { name: 'Dry cloth', purpose: 'Wipes the plank clean and dry.', how: 'Wipe before you start.', ...none },
  cylinder: { name: 'Tall cylinder of glycerine', purpose: 'A tall column of a very viscous liquid: the ball soon reaches a steady speed.', how: 'Drop each ball gently at the centre of the surface.', mistake: 'Dropping near the wall, which slows the ball.', keys: ['axis', 'centre', 'wall', 'glycerine', 'temperature'] },
  oilcyl: { name: 'Tall cylinder of palm oil', purpose: 'A less viscous liquid to compare with glycerine.', how: 'Time the same size of ball between bands the same distance apart.', mistake: 'Timing too short a fall: reaction time is then a big error.', keys: ['oil', 'compare'] },
  balls: { name: 'Steel ball bearings', purpose: 'Spheres of known density; five sizes give five terminal velocities.', how: 'Measure each with the micrometer; recover them with the magnet.', mistake: 'Using the diameter instead of the radius in Stokes’s law.', keys: ['ball', 'radius', 'diameter'] },
  micrometer: { name: 'Micrometer screw gauge', purpose: 'Measures each ball’s diameter to 0.01 mm.', how: 'Close it with the ratchet; sleeve + thimble.', mistake: 'Forcing it with the thimble.', keys: ['micrometer', 'ratchet'] },
  rule: { name: 'Metre rule', purpose: 'Measures the distance between the bands (or along the plank).', how: 'Stand it beside the cylinder; eye level with each band.', mistake: 'Parallax: reading from above or below.', keys: ['parallax', 'eye level'] },
  'band-top': { name: 'Upper rubber band', purpose: 'Marks where the timing starts — the ball must already be at terminal velocity.', how: 'About 8 cm below the surface.', mistake: 'Putting it at the surface, where the ball is still settling.', keys: ['below the surface', 'terminal'] },
  'band-bot': { name: 'Lower rubber band', purpose: 'Marks where the timing stops.', how: '20.0 cm below the upper band.', mistake: 'Moving it between drops.', keys: ['band', 'marker'] },
  bands: { name: 'Rubber bands', purpose: 'Markers round the cylinder.', how: 'Slide them to the depths you want.', ...none },
  stopclock: { name: 'Stop-clock', purpose: 'Times the fall between the bands (or the roll down the plank).', how: 'Reset it to zero; start and stop it at the right moments; read to 0.01 s.', mistake: 'Not resetting it: the time adds on to the last one.', keys: ['reaction', 'reset', 'stopwatch', 'repeat'] },
  magnet: { name: 'Magnet', purpose: 'Draws the steel balls up the side of the cylinder after each drop.', how: 'Slide it up the outside of the glass.', ...none },
  ramp: { name: 'Grooved plank (2 m)', purpose: 'A straight, uniform incline: the ball rolls in its groove.', how: 'Raise one end a little and keep the angle fixed.', mistake: 'Changing the angle between runs.', keys: ['angle', 'constant', 'groove', 'incline'] },
  woodblocks: { name: 'Wooden blocks', purpose: 'Raise one end of the plank by a fixed height.', how: 'Three blocks, left in place for every run.', mistake: 'Moving them.', keys: ['angle', 'constant'] },
  stopblock: { name: 'Stopping block', purpose: 'Stops the ball at the distance s; its click tells you when to stop the clock.', how: 'Put its face on the mark.', mistake: 'Measuring s to the wrong face.', keys: ['distance', 'mark'] },
  steelball: { name: 'Steel ball', purpose: 'Rolls down the groove with uniform acceleration.', how: 'Release it from rest at the start line — no push.', mistake: 'Pushing it.', keys: ['rest', 'push', 'released'] },
  board: { name: 'Drawing board with pulleys', purpose: 'Holds the paper vertically; the pulleys turn the pulls of P and Q into forces along the threads.', how: 'Fix it firmly; tap it gently so the pulleys turn freely.', mistake: 'Friction in the pulleys.', keys: ['friction', 'pulley', 'board', 'secure'] },
  paper: { name: 'Drawing paper', purpose: 'Records the lines of the three forces; then the parallelogram is drawn on it.', how: 'Pin it flat; dots well apart under each thread.', mistake: 'Dots too close together.', keys: ['dots', 'separated', 'scale'] },
  thread: { name: 'Thread with a knot', purpose: 'Three threads tied at one knot: the point where the three forces act.', how: 'Let the knot settle without touching the board.', mistake: 'The knot rubbing on the board.', keys: ['knot', 'touching', 'settle'] },
  knot: { name: 'The knot', purpose: 'The junction O: the three forces act here, in equilibrium.', how: 'Mark the threads only when it is at rest.', mistake: 'Marking while it is still moving.', keys: ['settle', 'rest', 'equilibrium'] },
  hangers: { name: 'Hangers and slotted masses', purpose: 'The forces P, Q and W (weight = mass × g).', how: 'Each hanger is 50 g; add 50 g pieces.', mistake: 'Forgetting the hanger’s own mass.', keys: ['weight', 'mass'] },
  'hanger-P': { name: 'Hanger P', purpose: 'The force P, over the left pulley.', how: 'Add or take off 50 g pieces.', ...none },
  'hanger-Q': { name: 'Hanger Q', purpose: 'The force Q, over the right pulley.', how: 'Add or take off 50 g pieces.', ...none },
  'hanger-W': { name: 'Hanger W', purpose: 'The weight W hanging from the knot: the equilibrant of P and Q.', how: 'Add or take off 50 g pieces.', ...none },
  pencil: { name: 'Sharp pencil, ruler and protractor', purpose: 'Thin, accurate dots and lines; measuring the diagonal and its angle.', how: 'A sharp pencil; read lengths to 0.1 cm and angles to 1°.', mistake: 'Thick lines.', keys: ['sharp', 'pencil', 'thin'] },
  book: { name: 'Practical notebook', purpose: 'Your table, graph or drawing and the results — this is what is marked.', how: 'Every reading to the instrument’s precision, with units.', mistake: 'Leaving out units.', keys: ['graph', 'slope'] },
  card: { name: 'Task card', purpose: 'The question paper.', how: 'Read it before you start.', ...none },
  spring: { name: 'Spiral spring', purpose: 'For Hooke’s law, not this practical.', how: 'Not needed here.', ...none },
  pendulum: { name: 'Pendulum bob', purpose: 'For the simple pendulum, not this practical.', how: 'Not needed here.', ...none },
  pulleys: { name: 'Spare pulleys', purpose: 'Not needed: the board has its own.', how: 'Leave them in the cupboard.', ...none },
  coat: { name: 'Lab coat', purpose: 'Keeps your clothes clean (glycerine and oil stain).', how: 'Optional here.', ...none },
  goggles: { name: 'Safety goggles', purpose: 'Eye protection for chemical work.', how: 'Not needed here.', ...none },
  co2: { name: 'CO₂ fire extinguisher', purpose: 'For electrical fires: it does not conduct.', how: 'Tell the teacher first.', ...none },
  blanket: { name: 'Fire blanket', purpose: 'Smothers a small fire or burning clothing.', how: 'Pull both tapes down sharply.', ...none },
  extinguisher: { name: 'Fire extinguisher', purpose: 'Puts out small fires.', how: 'Tell the teacher.', ...none },
  firstaid: { name: 'First-aid box', purpose: 'Plasters, dressings and cold packs.', how: 'Tell the teacher about every injury.', ...none },
  eyewash: { name: 'Eye-wash station', purpose: 'Rinses dust out of the eyes.', how: 'Rinse for 10 minutes.', ...none },
  notice: { name: 'Notice board', purpose: 'Department notices.', how: '—', ...none },
  shelf: { name: 'Physics equipment shelf', purpose: 'Equipment for other practicals.', how: 'Take only what the teacher gives out.', ...none },
  vdg: { name: 'Van de Graaff generator', purpose: 'High-voltage static electricity.', how: 'Teacher only.', ...none },
  whiteboard: { name: 'Whiteboard', purpose: 'Today’s practical.', how: 'Read it as you come in.', ...none },
  'poster-si': { name: 'Poster: SI base units', purpose: 'The seven base units.', how: 'Forces in N, lengths in m, times in s.', ...none },
  'poster-light': { name: 'Poster: refraction of light', purpose: 'For the optics practicals.', how: '—', ...none },
  'poster-electric': { name: 'Poster: electrical safety', purpose: 'Rules for circuits.', how: 'Nothing electrical here.', ...none },
  desk: { name: 'Teacher’s desk', purpose: 'Where the teacher checks your work.', how: '—', ...none },
};
export const explainer = makeExplainer(E);

export const ASK_SUGGESTIONS: Record<MechTask, AskSuggestions> = {
  FRICTION: {
    LEARN: ['What is limiting friction?', 'Why is μ = tan θ on the incline?', 'What are the laws of solid friction?', 'Why weigh the block?'],
    DEMO: ['Why pull slowly?', 'Why does the reading drop when it slides?', 'Why does the angle not depend on the load?', 'What does the slope of F against R give?'],
    TRY: ['Which reading is the limiting friction?', 'How do I find R?', 'Why must the plank be clean?', 'How do I read the protractor?'],
    SANDBOX: ['What does a rougher surface change?', 'Is kinetic friction always less?', 'Does the area of contact matter?', 'How is friction useful?'],
  },
  VISCOSITY: {
    LEARN: ['What is terminal velocity?', 'What three forces act on the ball?', 'What is Stokes’s law?', 'Why put the upper band 8 cm down?'],
    DEMO: ['Why drop the ball at the centre?', 'Why is v proportional to r²?', 'How do I convert the slope to SI units?', 'Why compare with palm oil?'],
    TRY: ['Why do I use the radius, not the diameter?', 'Why reset the stop-clock?', 'What is the wall effect?', 'How do I find η from the slope?'],
    SANDBOX: ['What happens when the liquid is warmer?', 'How does a denser ball fall?', 'Why does a big ball not obey Stokes’s law?', 'Where else does viscosity matter?'],
  },
  INCLINE: {
    LEARN: ['What is uniform acceleration?', 'Why plot s against t²?', 'Why release from rest?', 'Why repeat each time?'],
    DEMO: ['Why is the slope half the acceleration?', 'Why does a rolling ball accelerate less than g sin θ?', 'What does reaction time do?', 'Why is the graph through the origin?'],
    TRY: ['Where do I measure s from?', 'Why keep the angle fixed?', 'How do I find a from the slope?', 'What if my line misses the origin?'],
    SANDBOX: ['What happens on a steeper plank?', 'What does a push change?', 'Would a sliding block be different?', 'What is a ticker-tape timer?'],
  },
  FORCES: {
    LEARN: ['What is the parallelogram law?', 'What is an equilibrant?', 'Why tap the board?', 'Why put the dots far apart?'],
    DEMO: ['How do I choose a scale?', 'Why should R be vertical?', 'How do I measure the angle?', 'What is the percentage difference?'],
    TRY: ['Where is O?', 'Why must OA and OB be to the same scale?', 'Does the hanger count?', 'How do I calculate R for P and Q at 90°?'],
    SANDBOX: ['What happens with equal P and Q?', 'When does the knot run up to a pulley?', 'What does pulley friction do?', 'What is a triangle of forces?'],
  },
};

/** The bench as Mr Bayo sets it out for the introduction (display only, never saved). */
export function learnState(task: MechTask): PhyMechanicsState {
  const s = emptyPhyMechanicsState();
  return {
    ...s,
    task,
    zeroed: true,
    wiped: true,
    load: 2,
    top: 8,
    bot: 28,
    eyeLevel: true,
    masses: { ...FORCES_CARD },
    tapped: true,
    log: [{ t: 0, a: `task:${task}` }, ...NEEDED[task].map((id) => ({ t: 0, a: `collect:${id}` })), ...PLACEABLE[task].map((id) => ({ t: 0, a: `place:${id}` }))],
  };
}

const SPOTS: Record<MechTask, Record<string, Spot>> = {
  FRICTION: {
    rig: { target: [-0.1, 0.05, PLANK.z], dist: 0.9, pitch: 0.25 },
    block: { target: [PLANK.x0 + BLOCK.at + 0.05, 0.05, PLANK.z], dist: 0.42, pitch: 0.2, yaw: -0.2 },
    sbalance: { target: [PLANK.x0 + BLOCK.at + 0.3, 0.05, PLANK.z], dist: 0.4, pitch: 0.25 },
    protractor: { target: [PLANK.x0 + 0.05, 0.05, PLANK.z], dist: 0.4, pitch: 0.1, yaw: 0.3 },
  },
  VISCOSITY: {
    rig: { target: [0, 0.22, -0.12], dist: 0.85, pitch: 0.1 },
    cylinder: { target: [GLY_AT[0], 0.25, GLY_AT[2]], dist: 0.6, pitch: 0.05 },
    band: { target: [GLY_AT[0], SURFACE - 0.08, GLY_AT[2] + CYL.r], dist: 0.35, pitch: 0.05 },
    oilcyl: { target: [OIL_AT[0], 0.25, OIL_AT[2]], dist: 0.6, pitch: 0.05 },
    small: { target: [0.4, 0.03, 0.15], dist: 0.5, pitch: 0.6 },
  },
  INCLINE: {
    rig: { target: [0, 0.08, RAMP.z], dist: 1.6, pitch: 0.22 },
    top: { target: [RAMP.x0 + 0.1, 0.12, RAMP.z], dist: 0.5, pitch: 0.2, yaw: 0.3 },
    stop: { target: [RAMP.x0 + 0.4, 0.1, RAMP.z], dist: 0.5, pitch: 0.25 },
    clock: { target: [0.15, 0.03, 0.12], dist: 0.4, pitch: 0.5 },
  },
  FORCES: {
    rig: { target: [0, 0.3, BOARD.z], dist: 0.95, pitch: 0.05 },
    pulley: { target: [0.26, 0.48, BOARD.z], dist: 0.4, pitch: 0.05 },
    knot: { target: [0.07, 0.25, BOARD.z], dist: 0.4, pitch: 0.05 },
    hanger: { target: [0, 0.15, BOARD.z], dist: 0.5, pitch: 0.1 },
  },
};

/** Learn's camera spots and the lesson's apparatus lines → objects. */
export function learnConfig(task: MechTask): LearnConfig {
  const S = SPOTS[task];
  const MATCH: Record<MechTask, [RegExp, string, Spot][]> = {
    FRICTION: [
      [/block/i, 'block', S.block!],
      [/spring balance/i, 'sbalance', S.sbalance!],
      [/plank/i, 'plank', S.rig!],
      [/protractor/i, 'protractor', S.protractor!],
      [/slotted|masses/i, 'block', S.block!],
    ],
    VISCOSITY: [
      [/cylinder/i, 'cylinder', S.cylinder!],
      [/stopwatch|stop-?clock/i, 'stopclock', S.small!],
      [/micrometer/i, 'micrometer', S.small!],
      [/metre rule/i, 'rule', S.band!],
      [/rubber band|markers/i, 'band-top', S.band!],
      [/magnet/i, 'magnet', S.small!],
    ],
    INCLINE: [
      [/plank|rail/i, 'ramp', S.rig!],
      [/wooden blocks/i, 'woodblocks', S.top!],
      [/metre rule/i, 'ramp', S.stop!],
      [/stopwatch|stop-?clock/i, 'stopclock', S.clock!],
      [/stopping block/i, 'stopblock', S.stop!],
    ],
    FORCES: [
      [/board/i, 'board', S.rig!],
      [/pulley/i, 'board', S.pulley!],
      [/masses|hanger|spring balances/i, 'hanger-W', S.hanger!],
      [/protractor|ruler/i, 'paper', S.knot!],
    ],
  };
  const point: Record<MechTask, [string, string, string]> = { FRICTION: ['block', 'sbalance', 'block'], VISCOSITY: ['cylinder', 'band-top', 'cylinder'], INCLINE: ['ramp', 'steelball', 'ramp'], FORCES: ['board', 'knot', 'knot'] };
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

export const CARD_SPOT: Spot = { target: [SPOT.card[0], 0.01, SPOT.card[2]], dist: 0.35, pitch: 1.0 };
