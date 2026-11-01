import { emptyPhyPinsState, pinsPrism, phyPinsVariant, type PhyPinsState, type PinsTask } from '@aischool/shared';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import type { Spot } from '../../../lab3d-kit/store';
import { NEEDED_FOR } from './scene-state';
import { DEPTH_AT, DEPTH_RULE_AT, DISP_BOX_AT, DISP_PRISM_AT, SPOT, screenX, sheetCentre, toLocal } from './views';

/** The pin labs' "What is this?" cards, Learn stage and Ask suggestions. */

const E: Record<string, Explainer> = {
  board: { name: 'Drawing board and paper', purpose: 'Holds the paper flat and lets you push the pins in upright.', how: 'A fresh sheet for every angle of incidence; label every ray and normal.', mistake: 'Letting the paper, mirror or prism move during an observation.', keys: ['outline', 'paper', 'moved', 'board'] },
  paper: { name: 'White paper and drawing pins', purpose: 'Your diagram: the rays, normals and pin holes.', how: 'Pin it flat; draw thin lines with a sharp pencil.', mistake: 'Thick lines.', keys: ['pencil'] },
  mirror: { name: 'Plane mirror in a holder', purpose: 'Reflects the rays: the images of P₁ and P₂ appear behind it.', how: 'Stand its reflecting (silvered) surface exactly on the line MM′, upright.', mistake: 'Drawing MM′ along the front glass instead of the silvered surface.', keys: ['mirror', 'silvered', 'reflecting'] },
  prism: { name: 'Triangular glass prism', purpose: 'Refracts light at two faces; the deviation D depends on the angle of incidence.', how: 'Trace its outline; keep it on the outline; sharp edges — handle it by its triangular ends.', mistake: 'Moving it during an observation; looking at the Sun through it.', keys: ['prism', 'outline', 'sun'] },
  pins: { name: 'Optical pins (4)', purpose: 'Mark points on the rays: P₁, P₂ on the incident ray, P₃, P₄ on the emergent (reflected) ray.', how: 'Upright, at least 5 cm apart. Line up P₃, P₄ with the images, looking at the bases.', mistake: 'Pins close together or leaning; lining up the tops.', keys: ['pins', 'pin', 'upright', 'bases'] },
  protractor: { name: 'Protractor', purpose: 'Sets the angle of incidence and measures r or D.', how: '0° on the normal (mirror), or along the incident ray produced (prism).', mistake: 'Measuring from the surface instead of from the normal.', keys: ['protractor', 'normal', 'parallax'] },
  ruler: { name: '30 cm ruler', purpose: 'Straight, thin lines.', how: 'Hold it firmly and draw along its edge.', mistake: 'Joining points freehand.', keys: ['ruler'] },
  pencil: { name: 'Sharp pencil', purpose: 'Thin, accurate lines.', how: 'Keep it sharp; label i, r, D, N.', mistake: 'Thick lines blur where the pins really are.', keys: ['pencil', 'sharp'] },
  blocks: { name: 'Glass blocks on a cross', purpose: 'The cross under the glass looks raised: its image is at the apparent depth.', how: 'Stack 1, 2, 3, 4 blocks on the cross; real depth = height of the top face.', mistake: 'Chipped blocks; measuring the apparent depth from the bottom.', keys: ['block', 'glass', 'cross', 'mark'] },
  stand: { name: 'Search pin in a cork on a stand', purpose: 'Locates the image of the cross by no parallax.', how: 'Move it up or down beside the stack until it and the image move together as you move your eye.', mistake: 'Judging with the eye still: parallax only shows when the eye moves.', keys: ['search pin', 'parallax', 'no-parallax'] },
  rule: { name: 'Vertical rule', purpose: 'Reads the heights of the top face and of the search pin (0 at the bench).', how: 'Eye level with the mark you read, to 0.1 cm.', mistake: 'Parallax when reading.', keys: ['rule', 'metre'] },
  raybox: { name: 'Ray box with slits', purpose: 'A narrow beam of white light.', how: 'Use the narrow slit for a pure spectrum. The lamp gets hot.', mistake: 'A wide slit: the colours overlap.', keys: ['ray box', 'slit', 'lamp', 'hot'] },
  turntable: { name: 'Turntable', purpose: 'Turns the prism to change the angle of incidence.', how: 'Turn slowly; the spectrum stops and turns back at minimum deviation.', mistake: 'Turning too fast to see the minimum.', keys: ['rotate'] },
  screen: { name: 'White screen with a deviation scale', purpose: 'Catches the spectrum; the scale reads each colour’s deviation.', how: 'At a suitable distance, so the colours spread out.', mistake: 'Too near: the colours crowd together.', keys: ['screen', 'distance'] },
  filters: { name: 'Colour filters', purpose: 'Pass one colour only.', how: 'Put one in the beam: the colour is deviated but not split further.', mistake: 'Thinking the prism adds colour to light.', keys: ['filter'] },
  curtain: { name: 'Curtains and lights', purpose: 'Darken the room.', how: 'Close the curtains and switch the lights off before you look.', mistake: 'Stray light washes the spectrum out.', keys: ['darken', 'room'] },
  lens: { name: 'Converging lens', purpose: 'For focal-length experiments.', how: 'Not needed here.', mistake: 'Cluttering the bench.', keys: [] },
  'pin:p1': { name: 'Pin P₁', purpose: 'A point on the incident ray, far from O.', how: 'Upright on the drawn ray.', mistake: 'Too close to P₂.', keys: ['pins'] },
  'pin:p2': { name: 'Pin P₂', purpose: 'A second point on the incident ray.', how: 'At least 5 cm from P₁.', mistake: 'Leaning pin.', keys: ['pins'] },
  'pin:p3': { name: 'Pin P₃', purpose: 'In line with the images of P₁ and P₂.', how: 'Look at paper level; push it in where it hides both images.', mistake: 'Lining up the tops.', keys: ['bases'] },
  'pin:p4': { name: 'Pin P₄', purpose: 'A second point on the emergent ray.', how: 'At least 5 cm from P₃, hiding P₃ and the images.', mistake: 'Moving the eye between P₃ and P₄.', keys: ['bases'] },
  book: { name: 'Practical notebook', purpose: 'Your table, graph, answers and precautions — this is what is marked.', how: 'Angles to the nearest degree (D to 0.5°), depths to 0.1 cm.', mistake: 'A straight line through the U-shaped D–i points; n with a unit.', keys: ['unit', 'curve'] },
  card: { name: 'Task card', purpose: 'The question paper.', how: 'Read it before you start.', mistake: 'Skipping an angle.', keys: [] },
  coat: { name: 'Lab coat', purpose: 'Keeps your clothes clean.', how: 'Optional in this practical.', mistake: '—', keys: [] },
  goggles: { name: 'Safety goggles', purpose: 'Eye protection for chemical work.', how: 'Not needed for optics.', mistake: '—', keys: [] },
  firstaid: { name: 'First-aid box', purpose: 'Plasters — e.g. for a pin prick or a cut from a chipped edge.', how: 'Tell the teacher about every injury.', mistake: 'Hiding a cut.', keys: [] },
  co2: { name: 'CO₂ fire extinguisher', purpose: 'For electrical fires.', how: 'Tell the teacher first.', mistake: 'Water on electrical equipment.', keys: [] },
  whiteboard: { name: 'Whiteboard', purpose: 'Today’s practical.', how: 'Read it as you come in.', mistake: '—', keys: [] },
  'poster-light': { name: 'Poster: refraction of light', purpose: 'Rays at a surface.', how: 'Towards the normal into glass, away from it coming out.', mistake: '—', keys: [] },
  'poster-si': { name: 'Poster: SI base units', purpose: 'The seven base units.', how: 'n has no unit.', mistake: '—', keys: [] },
};
export const explainer = makeExplainer(E);

export const ASK: Record<PinsTask, AskSuggestions> = {
  MIRROR: { LEARN: ['Why draw MM′ along the silvered surface?', 'Why must the pins be far apart?', 'What are the laws of reflection?'], DEMO: ['Why do the images line up only from one place?', 'Why is the slope 1?', 'Where is the image in a plane mirror?'], TRY: ['How do I line up P₃ and P₄?', 'Where do I measure r from?', 'How do I find the slope?'], SANDBOX: ['What if the mirror is rotated?', 'Why is the image laterally inverted?', 'How far behind the mirror is the image?'] },
  PRISM: { LEARN: ['What is the angle of deviation?', 'Why is the graph U-shaped?', 'What happens at minimum deviation?'], DEMO: ['Why is i = e at minimum deviation?', 'Why use A/2 in the formula?', 'Why produce the rays to meet?'], TRY: ['How do I measure D?', 'How do I read Dₘ from the curve?', 'Why does no ray come out at small i?'], SANDBOX: ['How does n change Dₘ?', 'What is total internal reflection?', 'What if A is bigger?'] },
  DEPTH: { LEARN: ['What is parallax?', 'Why does the cross look raised?', 'Why move my eye from side to side?'], DEMO: ['How do I know there is no parallax?', 'Why measure from the top face?', 'Why plot real against apparent?'], TRY: ['Which way do I move the pin?', 'How do I find the apparent depth?', 'How many readings?'], SANDBOX: ['Why does a pool look shallow?', 'What is the displacement t(1 − 1/n)?', 'Does water give a different n?'] },
  DISP: { LEARN: ['What is dispersion?', 'Why darken the room?', 'Why a narrow slit?'], DEMO: ['Why is violet deviated most?', 'Why does red light not split again?', 'How is a rainbow formed?'], TRY: ['How do I find minimum deviation?', 'Where do I read D for red?', 'What is angular dispersion?'], SANDBOX: ['Does a flint prism spread colours more?', 'What is a pure spectrum?', 'Why does a wide slit give an impure spectrum?'] },
};

/** The bench as Mr Bayo sets it out for the introduction (display only). */
export function learnState(task: PinsTask): PhyPinsState {
  const s = emptyPhyPinsState();
  const log = NEEDED_FOR[task].map((id) => ({ t: 0, a: `collect:${id}` }));
  if (task === 'MIRROR') return { ...s, task, traces: [{ i: 40, normal: true, p1: 11, p2: 4, p3: null, p4: null, joined: false }], table: [{ i: '', a: '' }], log };
  if (task === 'PRISM') return { ...s, task, traces: [{ i: 45, normal: true, p1: 11, p2: 4, p3: null, p4: null, joined: false }], table: [{ i: '', a: '' }], log };
  if (task === 'DEPTH') return { ...s, task, depth: { ...s.depth, blocks: 2, h: 2 }, log };
  return { ...s, task, disp: { ...s.disp, dark: true, slit: 'narrow', i: 50, dist: 60 }, log };
}

export function learnConfig(task: PinsTask): LearnConfig {
  const v = phyPinsVariant(7);
  const at = (p: [number, number, number], dist: number, pitch: number, dy = 0.01): Spot => ({ target: [p[0], dy, p[2]], dist, pitch });
  if (task === 'MIRROR' || task === 'PRISM') {
    const c = toLocal(sheetCentre(task));
    const O = toLocal(task === 'MIRROR' ? { x: 0, y: 0 } : pinsPrism(v).O);
    const spots: Record<string, Spot> = {
      board: at(c, 0.62, 1.1),
      [task === 'MIRROR' ? 'mirror' : 'prism']: { target: [O[0], 0.02, O[2]], dist: 0.36, pitch: 0.55 },
      pins: at(SPOT.pins, 0.3, 0.6),
      protractor: at(SPOT.protractor, 0.35, 1.0),
      ruler: at([SPOT.ruler[0] + 0.1, 0, SPOT.ruler[2]], 0.45, 0.9),
      pencil: at(SPOT.pencil, 0.35, 0.9),
    };
    const obj = task === 'MIRROR' ? 'mirror' : 'prism';
    return {
      items: [
        { match: task === 'MIRROR' ? /mirror/i : /prism/i, id: obj, spot: spots[obj]! },
        { match: /board/i, id: 'board', spot: spots.board! },
        { match: /pin/i, id: 'pins', spot: spots.pins! },
        { match: /protractor/i, id: 'protractor', spot: spots.protractor! },
        { match: /ruler/i, id: 'ruler', spot: spots.ruler! },
      ],
      explain: explainer,
      procedure: [
        { spot: spots.board!, point: 'board' },
        { spot: spots[obj]!, point: obj },
      ],
      observe: { spot: spots[obj]!, point: obj },
      observeTitle: 'What you will see',
    };
  }
  if (task === 'DEPTH') {
    const stack = { target: [DEPTH_AT[0], 0.04, DEPTH_AT[2]] as [number, number, number], dist: 0.4, pitch: 0.3 };
    const stand = { target: [DEPTH_RULE_AT[0] - 0.04, 0.06, DEPTH_RULE_AT[2]] as [number, number, number], dist: 0.4, pitch: 0.25 };
    return {
      items: [
        { match: /glass block|beaker|block/i, id: 'blocks', spot: stack },
        { match: /microscope|pins|cork/i, id: 'stand', spot: stand },
        { match: /rule/i, id: 'rule', spot: stand },
      ],
      explain: explainer,
      procedure: [
        { spot: stack, point: 'blocks' },
        { spot: stand, point: 'stand' },
      ],
      observe: { spot: stack, point: 'blocks' },
      observeTitle: 'What you will see',
    };
  }
  const box = { target: [DISP_BOX_AT[0], 0.03, DISP_BOX_AT[2]] as [number, number, number], dist: 0.4, pitch: 0.5 };
  const prism = { target: [DISP_PRISM_AT[0], 0.03, DISP_PRISM_AT[2]] as [number, number, number], dist: 0.35, pitch: 0.8 };
  const screen = { target: [screenX(60), 0.08, DISP_PRISM_AT[2]] as [number, number, number], dist: 0.35, pitch: 0.15, yaw: -1.45 };
  return {
    items: [
      { match: /prism/i, id: 'prism', spot: prism },
      { match: /ray box|torch/i, id: 'raybox', spot: box },
      { match: /screen/i, id: 'screen', spot: screen },
      { match: /filter/i, id: 'filters', spot: box },
    ],
    explain: explainer,
    procedure: [
      { spot: box, point: 'raybox' },
      { spot: screen, point: 'screen' },
    ],
    observe: { spot: screen, point: 'screen' },
    observeTitle: 'What you will see',
  };
}
