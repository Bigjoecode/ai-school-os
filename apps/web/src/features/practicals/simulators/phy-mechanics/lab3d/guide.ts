import { FRICTION_CARD, INCLINE_CARD, VISC_BALLS, VISC_OIL_BALL, VISC_TOP_OK, type MechTask, type PhyMechanicsState, type PhyMechanicsVariant } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { boardSheet } from '../actions';
import { APPARATUS_LABEL, NEEDED, PLACE_LABEL, PLACEABLE, type ApparatusId, type SceneState } from './scene-state';

/**
 * Guided mode (practice only): each practical as a checklist, one group per
 * load, ball, distance or sheet, with the object to use next and gentle
 * corrections with the reason. Worked out from the recorded state only — the
 * guide never gives a reading.
 */

const filled = (x: string | undefined) => !!x && x.trim().length > 0;
const rowDone = (s: PhyMechanicsState, key: number, cols: string[]) => {
  const r = s.rows.find((x) => x.key === key);
  return !!r && cols.every((c) => filled(r.c[c]));
};

function setup(task: MechTask, _s: PhyMechanicsState, scene: SceneState, mode: CameraMode): GuideStep[] {
  const steps: GuideStep[] = [
    { id: 'collect', label: `Collect your apparatus${scene.missing.length ? ` (${scene.missing.length} to go)` : ''}`, target: 'cupboard', why: `You need: ${NEEDED[task].map((id) => APPARATUS_LABEL[id].toLowerCase()).join(', ')}.`, done: scene.ready },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front.', done: mode !== 'walk' || scene.placed.size > 0 },
  ];
  for (const id of PLACEABLE[task]) steps.push({ id: `place-${id}`, label: PLACE_LABEL[id]!, target: id, why: 'Set the apparatus out as on the task card.', done: scene.placed.has(id), group: 'Set up' });
  return steps;
}

function friction(s: PhyMechanicsState): GuideStep[] {
  const steps: GuideStep[] = [
    { id: 'zero', label: 'Check the spring balance’s zero and adjust it', target: 'sbalance', why: 'With nothing on the hook it must read 0.00 N; otherwise every reading carries the zero error.', done: s.zeroed, group: 'Before you start' },
    { id: 'wipe', label: 'Wipe the plank clean and dry', target: 'cloth', why: 'Dust under the block acts like tiny rollers: the friction is lower and varies.', done: s.wiped, group: 'Before you start' },
  ];
  const done = new Set(s.pulls.map((p) => p.load));
  for (const L of FRICTION_CARD.slice(0, 5)) {
    const group = `Load ${L} × 100 g`;
    const pulls = s.pulls.filter((p) => p.load === L).length;
    if (!done.has(L) && [...done].length >= 5) continue;
    steps.push(
      { id: `load-${L}`, label: `Put ${L} × 100 g on the block`, target: 'block', why: 'Each mass adds about 0.98 N to the normal reaction.', done: pulls >= 2 || s.load === L, group },
      { id: `weigh-${L}`, label: 'Weigh the block and its load: R', target: 'block', why: 'On a level plank the normal reaction R equals the weight. Read the balance to 0.05 N.', done: s.weighs.some((w) => w.load === L), group },
      { id: `pull-${L}`, label: `Pull slowly until it just moves — twice (${Math.min(2, pulls)} of 2)`, target: 'sbalance', why: 'Increase the pull gently and read the balance at the moment the block starts to move: that is the limiting friction.', done: pulls >= 2, group },
      { id: `row-${L}`, label: 'Write R, F₁, F₂ and the mean F', target: 'book', why: 'Read each value in the reading view; the mean of the two pulls.', done: rowDone(s, L, ['R', 'F1', 'F2', 'F']), group },
    );
    if (pulls < 2) break;
  }
  steps.push(
    { id: 'tilt', label: 'Take the masses off and tilt the plank', target: 'plank', why: 'The angle at which the block just slips gives μ = tan θ, whatever the load.', done: s.tilt || s.tilts.length >= 2, group: 'The angle of slipping' },
    { id: 'raise', label: `Raise it slowly until the block slips — at least twice (${Math.min(2, s.tilts.length)} of 2)`, target: 'sbalance', why: 'Slowly, so you do not overshoot the angle; read the protractor to 1°.', done: s.tilts.length >= 2, group: 'The angle of slipping' },
    { id: 'theta', label: 'Write θ₁, θ₂ (θ₃) and the mean θ', target: 'book', why: 'μ = tan θ from the mean.', done: filled(s.cells.th), group: 'The angle of slipping' },
    { id: 'graph', label: 'Plot F against R and draw your best line', target: 'book', why: 'F = μR: a straight line through the origin.', done: !!s.line },
    { id: 'slope', label: 'μ from the slope, and μ = tan θ', target: 'book', why: 'Two values of μ from two methods: they should agree.', done: filled(s.answers.slope.value) && filled(s.answers.mutan.value) },
  );
  return steps;
}

function viscosity(s: PhyMechanicsState): GuideStep[] {
  const steps: GuideStep[] = [
    { id: 'top', label: `Slide the upper band down to about 8 cm below the surface`, target: 'band-top', why: `Just below the surface the ball is still settling (it drags air down with it): time it only once it is at terminal velocity, at least ${VISC_TOP_OK} cm down.`, done: s.top >= VISC_TOP_OK, group: 'The bands' },
    { id: 'bot', label: 'Slide the lower band to 20 cm below the upper one', target: 'band-bot', why: 'A long fall makes your reaction time a small part of the time.', done: Math.abs(s.bot - s.top - 20) <= 1, group: 'The bands' },
    { id: 'L', label: 'Measure the distance between the bands and write it down', target: 'rule', why: 'Read each band against the metre rule to 0.1 cm.', done: filled(s.cells.L), group: 'The bands' },
  ];
  const gly = s.drops.filter((d) => d.liquid === 'glycerine');
  for (let b = 0; b < VISC_BALLS.length; b++) {
    const group = `The ${VISC_BALLS[b]!.toFixed(1)} mm ball`;
    const n = gly.filter((d) => d.ball === b).length;
    steps.push(
      { id: `ball-${b}`, label: `Take the ${VISC_BALLS[b]!.toFixed(1)} mm ball and measure it with the micrometer`, target: 'micrometer', why: 'Close it with the ratchet; read to 0.01 mm. r = d/2.', done: s.measured.includes(b), group },
      { id: `drop-${b}`, label: `Reset the clock and drop it at the centre — twice (${Math.min(2, n)} of 2)`, target: 'cylinder', why: 'At the centre, away from the walls; your eye level with each band as it passes.', done: n >= 2, group },
      { id: `row-${b}`, label: 'Write d, r, r², t₁, t₂, the mean t and v', target: 'book', why: 'v = distance between the bands ÷ mean t, in cm s⁻¹.', done: rowDone(s, b, ['d', 'r', 'r2', 't1', 't2', 't', 'v']), group },
    );
    if (n < 2) break;
  }
  steps.push(
    { id: 'oil', label: `Time the ${VISC_BALLS[VISC_OIL_BALL]!.toFixed(1)} mm ball in the palm oil`, target: 'oilcyl', why: 'The same ball in a less viscous liquid falls much faster.', done: s.drops.some((d) => d.liquid === 'oil') && filled(s.cells.ov), group: 'Comparing the liquids' },
    { id: 'graph', label: 'Plot v against r² and draw your best line', target: 'book', why: 'Stokes: v = 2r²(ρs − ρl)g/(9η), so v is proportional to r².', done: !!s.line },
    { id: 'eta', label: 'The slope, η and the ratio of the viscosities', target: 'book', why: 'Convert the slope to SI (× 10⁴) before η = 2(ρs − ρl)g/(9 × slope).', done: filled(s.answers.slope.value) && filled(s.answers.eta.value) && filled(s.answers.ratio.value) },
  );
  return steps;
}

function incline(s: PhyMechanicsState): GuideStep[] {
  const steps: GuideStep[] = [{ id: 'blocks', label: 'Raise the left end on three blocks and leave it so', target: 'woodblocks', why: 'A small, fixed angle: the acceleration must be the same for every run.', done: s.blocks === 3 || s.runs.length > 0, group: 'The incline' }];
  for (const m of INCLINE_CARD) {
    const group = `s = ${(m / 100).toFixed(2)} m`;
    const n = s.runs.filter((r) => r.stop === m).length;
    steps.push(
      { id: `stop-${m}`, label: `Put the stopping block at the ${(m / 100).toFixed(2)} m mark`, target: 'stopblock', why: 's is measured from the start line to the block.', done: s.stop === m || n >= 3, group },
      { id: `roll-${m}`, label: `Reset the clock and let the ball go from rest — three times (${Math.min(3, n)} of 3)`, target: 'steelball', why: 'Start the clock as you let go (no push) and stop it at the click.', done: n >= 3, group },
      { id: `row-${m}`, label: 'Write s, t₁, t₂, t₃, the mean t and t²', target: 'book', why: 's in m to 2 decimal places; times to 0.01 s.', done: rowDone(s, m, ['s', 't1', 't2', 't3', 't', 'tt']), group },
    );
    if (n < 3) break;
  }
  steps.push(
    { id: 'graph', label: 'Plot s against t² and draw your best line', target: 'book', why: 'From rest s = ½at²: a straight line through the origin.', done: !!s.line },
    { id: 'slope', label: 'The slope and a = 2 × slope', target: 'book', why: 'The slope is ½a.', done: filled(s.answers.slope.value) && filled(s.answers.accel.value) },
  );
  return steps;
}

function forces(s: PhyMechanicsState): GuideStep[] {
  const sh = boardSheet(s);
  const first = s.sets[0];
  const steps: GuideStep[] = [
    { id: 'loads', label: 'Hang P = 300 g, Q = 400 g and W = 500 g', target: 'hanger-P', why: 'Each hanger is 50 g: add five, seven and nine 50 g pieces.', done: (s.masses.P === 5 && s.masses.Q === 7 && s.masses.W === 9) || s.sets.length > 0, group: 'The forces' },
    { id: 'tap', label: 'Tap the board gently so the knot settles', target: 'board', why: 'The pulleys’ friction holds the knot off its true position; a tap frees them.', done: s.tapped || s.sets.some((x) => x.dots.length > 0), group: 'The forces' },
  ];
  const cur = sh?.set ?? first;
  const count = (th: string) => cur?.dots.filter((d) => d.th === th).length ?? 0;
  steps.push(
    ...(['P', 'Q', 'W'] as const).map((th) => ({ id: `dots-${th}`, label: `Two dots under ${th}, one near the knot and one far from it`, target: 'knot', why: 'Dots well apart give the line of the thread accurately.', done: count(th) >= 2 || !!first?.off, group: 'Mark the threads' })),
    { id: 'off', label: 'Take the paper off and draw the lines', target: 'paper', why: 'The three lines meet at O, the knot’s position.', done: !!first?.off, group: 'Mark the threads' },
    { id: 'scale', label: 'Choose a scale and write OA and OB in the table', target: 'book', why: 'e.g. 0.5 N per cm: P = 3.0 N is 6.0 cm. A large scale is more accurate.', done: filled(s.answers.scale.value) && rowDone(s, 0, ['OA', 'OB']), group: 'The parallelogram' },
    { id: 'build', label: 'Draw OA and OB and complete the parallelogram', target: 'paper', why: 'Lines through A parallel to OB and through B parallel to OA meet at C.', done: !!first?.built, group: 'The parallelogram' },
    { id: 'measure', label: 'Measure OC and its angle from the line of W produced', target: 'paper', why: 'The rule along OC from O; the protractor at O.', done: rowDone(s, 0, ['OC', 'ang']), group: 'The parallelogram' },
    { id: 'R', label: 'Write P, Q, W, R = OC × scale and the % difference', target: 'book', why: 'R should equal W and point straight up: the equilibrant is equal and opposite to the resultant.', done: rowDone(s, 0, ['P', 'Q', 'W', 'R', 'diff']) },
  );
  return steps;
}

export function guideSteps(s: PhyMechanicsState, scene: SceneState, mode: CameraMode): GuideStep[] {
  const task = s.task ?? 'FRICTION';
  const body = task === 'FRICTION' ? friction(s) : task === 'VISCOSITY' ? viscosity(s) : task === 'INCLINE' ? incline(s) : forces(s);
  return [
    ...setup(task, s, scene, mode),
    ...body,
    { id: 'written', label: 'Write two precautions', target: 'book', why: 'Things you did to make the readings accurate.', done: filled(s.written.precautions) },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  ];
}

/** A gentle correction for a step just recorded (null: nothing wrong). */
export function correctionFor(a: string, s: PhyMechanicsState, _v: PhyMechanicsVariant): Correction | null {
  const [verb, arg] = a.split(':') as [string, string | undefined];
  const task = s.task ?? 'FRICTION';
  if (verb === 'collect' && arg && !NEEDED[task].includes(arg as ApparatusId) && APPARATUS_LABEL[arg as ApparatusId]) return { title: `The ${APPARATUS_LABEL[arg as ApparatusId].toLowerCase()} is not needed here.`, why: 'You can put it back from your bench or the cupboard list.' };
  if (verb === 'pull') {
    const p = s.pulls[s.pulls.length - 1];
    if (p && !p.zeroed) return { title: 'Check the balance’s zero first.', why: 'With nothing on the hook it does not read zero: every reading carries that error. Adjust the zero, then repeat the pulls.', focus: 'friction' };
    if (p && !p.wiped) return { title: 'Wipe the plank first.', why: 'The chalk dust lowers the friction and makes it vary from pull to pull.', focus: 'friction' };
    if (p?.jerk) return { title: 'Pull slowly and steadily.', why: 'A jerk carries the pointer past the limiting friction: the reading is too high. Delete that row’s value and pull again slowly.', focus: 'friction' };
    if (p && !s.weighs.some((w) => w.load === p.load)) return { title: 'Weigh the block with this load too.', why: 'R for this row is the weight of the block and its masses: hang them on the balance.' };
  }
  if (verb === 'tilt') {
    const t = s.tilts[s.tilts.length - 1];
    if (t?.fast) return { title: 'Raise the plank slowly.', why: 'Raised quickly, it passes the angle of slipping before the block moves: θ comes out too big.', focus: 'friction' };
  }
  if (verb === 'drop') {
    const d = s.drops[s.drops.length - 1];
    if (!d) return null;
    if (!d.reset) return { title: 'Reset the stop-clock before each drop.', why: 'It carried on from the last time: this reading is the two added together.' };
    if (!d.centre) return { title: 'Release the ball at the centre.', why: 'Near the glass the wall slows it down. Drop it along the axis of the cylinder.', focus: 'visc' };
    if (Math.min(d.top, d.bot) < VISC_TOP_OK) return { title: 'The upper band is too near the surface.', why: 'The ball has not settled to its terminal velocity there. Slide the band down to about 8 cm.', focus: 'visc' };
    if (!d.eyeLevel) return { title: 'Put your eye level with each band.', why: 'From one height between them the bands appear closer together (parallax): the time comes out short.' };
    if (d.liquid === 'glycerine' && !s.measured.includes(d.ball)) return { title: 'Measure this ball with the micrometer too.', why: 'You need its radius for the graph.' };
  }
  if (verb === 'run') {
    const r = s.runs[s.runs.length - 1];
    if (!r) return null;
    if (!r.reset) return { title: 'Reset the stop-clock before each run.', why: 'It carried on from the last time: this reading is too long.' };
    if (r.push) return { title: 'Let the ball go from rest.', why: 'A push gives it a starting speed: the times are short and s against t² misses the origin.', focus: 'incline' };
    if (s.runs.length > 1 && s.runs[0]!.blocks !== r.blocks) return { title: 'Keep the angle the same.', why: 'You changed the blocks: the acceleration changed too. Put them back as for your first runs.', focus: 'incline' };
  }
  if (verb === 'dot') {
    const sh = boardSheet(s);
    if (sh && !sh.set.dots[sh.set.dots.length - 1]?.tapped) return { title: 'Tap the board before you mark the threads.', why: 'The pulleys’ friction holds the knot slightly off the point where the forces really balance.', focus: 'forces' };
  }
  if (verb === 'mass') {
    const last = s.sets[s.sets.length - 1];
    if (last && !last.off && last.dots.length) return { title: 'The knot moved: those dots no longer fit.', why: 'You changed a load on a marked sheet. Take that sheet off and start a fresh one with the new loads.' };
  }
  return null;
}
