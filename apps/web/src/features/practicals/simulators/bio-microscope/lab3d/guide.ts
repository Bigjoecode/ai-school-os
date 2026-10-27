import { MICRO_BRIGHT_RANGE, MICRO_FOCUS_TOL, MICRO_MEDIUM_LABELS, microBrightness, microIsStained, type BioMicroscopeState, type BioMicroscopeVariant, type MicroMedium, type MicroObjective } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { APPARATUS_LABEL, DISTRACTORS, SPECIMEN_STEP, needed, type ApparatusId, type SceneState } from './scene-state';

/**
 * Guided mode (practice only): the microscope practical as a checklist with
 * the object to use next, and gentle corrections — with the reason — when a
 * step is done the wrong way. Everything is worked out from the state the lab
 * already records; nothing here changes what is marked.
 */

/** Why each slide needs its liquid (said when the student picks the wrong one). */
const WHY_MEDIUM: Record<string, string> = {
  ONION: 'Onion epidermis is colourless: dilute iodine stains the nuclei and any starch yellow-brown so the cells show up.',
  CHEEK: 'Cheek cells are colourless animal cells: methylene blue stains their nuclei blue.',
  PLASMOLYSIS: 'To see plasmolysis, water must leave the cells by osmosis: mount them in concentrated salt (or sucrose) solution.',
  POND: 'The organisms must stay alive and moving: use water (or nothing) — stains kill them.',
  STEM: 'Safranin (or iodine) stains the lignified xylem so the vascular bundles stand out.',
  LEAF: 'A leaf epidermis is thin and the guard cells have chloroplasts: mount it in water (or dry).',
};

export function guideSteps(s: BioMicroscopeState, scene: SceneState, mode: CameraMode, v: BioMicroscopeVariant): GuideStep[] {
  const slide = s.slide!;
  const info = v.info;
  const missing = needed(slide).filter((a) => !scene.collected.has(a));
  const sc = s.scope;
  const b = microBrightness(sc.lamp, sc.diaphragm, sc.objective);
  const dz = sc.coarse + sc.fine - v.focus[sc.objective];
  const sharp = Math.abs(dz) <= MICRO_FOCUS_TOL[sc.objective];
  const cap = (o: MicroObjective) => s.captures.find((c) => c.objective === o);
  const good = (o: MicroObjective) => {
    const c = cap(o);
    return !!c && Math.abs(c.coarse + c.fine - v.focus[o]) <= MICRO_FOCUS_TOL[o];
  };
  const lit = b >= MICRO_BRIGHT_RANGE[0] && b <= MICRO_BRIGHT_RANGE[1];
  const contrastOk = microIsStained(slide, s.prep.medium) || sc.diaphragm <= 60;
  const step = SPECIMEN_STEP[slide];
  const two = info.labelObjective !== info.measureObjective;
  const steps: GuideStep[] = [
    { id: 'coat', label: 'Put on your lab coat', target: !scene.coat ? 'coat' : null, why: 'Stains such as iodine and methylene blue mark skin and clothes.', done: scene.coat },
    { id: 'collect', label: `Collect your apparatus${missing.length ? ` (${missing.length} to go)` : ''}`, target: 'cupboard', why: `${needed(slide).map((a) => APPARATUS_LABEL[a].toLowerCase()).join(', ')}. Carry the microscope with one hand under the base.`, done: !missing.length },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front. The stains and your specimen are there.', done: mode !== 'walk' || scene.slide !== 'none' },
    { id: 'slide', label: s.slide === 'POND' ? 'Take a clean cavity slide' : 'Take a clean slide', target: 'slides', why: 'Hold it by the edges: fingerprints show up under the microscope.', done: scene.slide !== 'none' },
    { id: 'medium', label: 'Put a drop of the right liquid on it', target: 'tile', why: 'Choose from the dropper bottles beside the tile. Think: does the specimen need a stain to show its parts, or must it stay alive?', done: !!s.prep.medium },
    { id: 'specimen', label: step.action, target: slide === 'CHEEK' ? 'swabs' : 'source', why: 'A thin, single layer lets the light through; folds and overlaps hide the cells.', done: scene.specimen },
    ...(slide === 'CHEEK' ? [{ id: 'swab', label: 'Put the used cotton bud in the disinfectant', target: 'disinfectant', why: 'It carries saliva: disinfect it, never reuse it.', done: scene.swabDisposed } satisfies GuideStep] : []),
    { id: 'coverslip', label: 'Lower the cover slip at an angle with the needle', target: 'slide', why: 'Touch one edge down, then lower it slowly: the liquid pushes the air out ahead of it, so no bubbles are trapped.', done: !!s.prep.coverslip },
    { id: 'blot', label: 'Blot off the extra liquid', target: 'filter', why: 'Liquid on top of the cover slip spoils the image and can wet the objective.', done: scene.blotted || s.prep.medium === 'NONE' || s.prep.placed },
    { id: 'place', label: 'Place the slide on the stage and clip it', target: 'stage', why: 'Centre the specimen over the hole; the clips stop it moving. The ×4 objective turns into place.', done: s.prep.placed },
    { id: 'lamp', label: 'Turn up the lamp', target: 'lamp', why: `Light reaching your eye should be between ${MICRO_BRIGHT_RANGE[0]} and ${MICRO_BRIGHT_RANGE[1]}.`, done: s.prep.placed && (s.flags.lightAdjusted || b >= MICRO_BRIGHT_RANGE[0]) && sc.lamp > 20 },
    { id: 'focus-low', label: 'Focus at low power: coarse knob, then the fine knob', target: s.flags.focusedLow ? null : sc.objective === 40 ? 'turret' : Math.abs(dz) > 3 ? 'coarse' : 'fine', why: 'Look through the eyepiece and raise the stage slowly until the specimen appears, then sharpen it.', done: s.flags.focusedLow },
    {
      id: 'capture-measure',
      label: `Capture a sharp ×${info.measureObjective} view${two ? ' to measure from' : ''}`,
      target: sc.objective !== info.measureObjective ? 'turret' : !sharp ? (info.measureObjective === 40 ? 'fine' : 'coarse') : !lit ? 'lamp' : !contrastOk ? 'diaphragm' : 'eyepiece',
      why: info.measureObjective === 40 ? 'At ×40 use only the fine focus. Look through the eyepiece and press Capture when the edges are sharp.' : `Turn to ×${info.measureObjective}, sharpen with the fine focus, look through the eyepiece and press Capture.${contrastOk ? '' : ' Close the diaphragm a little: an unstained specimen needs contrast.'}`,
      done: good(info.measureObjective),
    },
    ...(two
      ? [
          {
            id: 'capture-label',
            label: `Turn to ×${info.labelObjective} and capture a sharp view to label`,
            target: sc.objective !== info.labelObjective ? 'turret' : !sharp ? 'fine' : !lit ? 'lamp' : 'eyepiece',
            why: info.labelObjective === 40 ? 'Only the fine focus at high power: the coarse knob could drive the objective into the cover slip. High power needs more light.' : 'Sharpen it and capture.',
            done: good(info.labelObjective),
          } satisfies GuideStep,
        ]
      : []),
    { id: 'labels', label: 'Label the structures in your notebook', target: 'book', why: 'Drag each label to the box joined to the part it names.', done: v.targets.every((_, i) => !!s.labels[i]) },
    { id: 'identity', label: 'Answer the identification question', target: 'book', why: v.identity.question, done: !!s.identity },
    { id: 'calc', label: 'Measure and work out the size and magnifications', target: 'book', why: info.method === 'COUNT' ? 'Count the cells across the field of view; size = field diameter ÷ number of cells.' : info.method === 'GRATICULE' ? 'Read the length in eyepiece units; actual length = units × the calibration.' : 'Count the stomata in the circle; density = number ÷ area of the field (πr²).', done: v.tasks.every((t) => !!s.answers[t.id].value.trim()) },
    { id: 'drawing', label: 'Tick the good drawing practice', target: 'book', why: 'Clean single lines, ruled label lines that do not cross, labels at the side, a title and the magnification.', done: s.drawing.length > 0 },
    { id: 'written', label: 'Write three observations and two precautions', target: 'book', why: 'What you saw (shape, parts, colour, what is absent) and what you did to get a good slide and image.', done: !!s.written.observations.trim() && !!s.written.precautions.trim() },
    { id: 'dispose', label: 'Put the used slide in the sharps jar', target: 'bin', why: 'Glass slides and cover slips cut: they never go in the ordinary bin.', done: scene.slide === 'bin' },
    { id: 'wash', label: 'Wash your hands', target: 'handwash', why: 'Soap and water at the hand-washing point, before you leave the lab.', done: scene.washedAtEnd },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  ];
  return steps;
}

/** A gentle correction for a step just recorded in the log (null: nothing wrong). */
export function correctionFor(a: string, s: BioMicroscopeState, v: BioMicroscopeVariant): Correction | null {
  const [verb, arg] = a.split(':') as [string, string | undefined];
  const slide = s.slide!;
  if (verb === 'medium' && arg && !v.info.media.includes(arg as MicroMedium))
    return { title: `${MICRO_MEDIUM_LABELS[arg as MicroMedium]} is not the best choice for this slide.`, why: `${WHY_MEDIUM[slide]} You can still change it before the cover slip goes on.`, focus: 'prep' };
  if (verb === 'coverslip' && arg === 'drop') return { title: 'Dropping the cover slip flat traps air bubbles.', why: 'Bubbles (thick black rings) hide the cells and are easily mistaken for them. Next time touch one edge to the drop and lower it slowly with the mounted needle.', focus: 'prep' };
  if (verb === 'objective' && arg === '40' && !s.flags.focusedLow) return { title: 'Focus at low power first.', why: 'At ×40 the field is tiny and the depth of focus very small: find and focus the specimen with ×4 or ×10, then turn to ×40.', focus: 'stage' };
  if (verb === 'crash') return { title: 'The objective hit the cover slip — it has cracked.', why: 'At ×40 the objective is almost touching the slide. Never use the coarse focus at high power: only the fine focus, and watch from the side when raising the stage.', focus: 'stage' };
  if (verb === 'capture' && arg) {
    const o = Number(arg) as MicroObjective;
    const c = s.captures.find((x) => x.objective === o);
    if (c) {
      const dz = c.coarse + c.fine - v.focus[o];
      const b = microBrightness(c.lamp, c.diaphragm, o);
      if (Math.abs(dz) > MICRO_FOCUS_TOL[o]) return { title: 'That view is blurred.', why: `Turn the fine focus slowly, a little at a time, until the edges are sharp — then capture again (the new capture replaces this one).` };
      if (b < MICRO_BRIGHT_RANGE[0]) return { title: 'That view is too dark.', why: 'Turn up the lamp or open the diaphragm a little, then capture again. High power needs more light.' };
      if (b > MICRO_BRIGHT_RANGE[1]) return { title: 'That view is washed out.', why: 'Too much light hides detail: dim the lamp or close the diaphragm a little, then capture again.' };
      if (!microIsStained(slide, s.prep.medium) && c.diaphragm > 60) return { title: 'The cells are hard to see: there is little contrast.', why: 'Unstained, colourless specimens need the diaphragm partly closed (60 % or less) so their edges show.' };
    }
  }
  if (verb === 'collect' && arg && DISTRACTORS.includes(arg as ApparatusId)) return { title: `The ${APPARATUS_LABEL[arg as ApparatusId].toLowerCase()} is not needed at the microscope.`, why: 'Only take what the practical needs; you can put it back from your bench or the cupboard list.' };
  if (verb === 'place-slide' && !s.prep.coverslip) return { title: 'The slide has no cover slip.', why: 'Without one the liquid dries and the objective can touch the specimen.' };
  return null;
}

/** Coarse focus moves at high power (watched from the flags: they are not in the log). */
export const COARSE_AT_HIGH: Correction = { title: 'Not the coarse focus at ×40!', why: 'At high power the objective is almost touching the slide: the coarse knob can crack the cover slip and the objective lens. Use only the fine focus.', focus: 'knobs' };
