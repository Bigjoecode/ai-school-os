import { OPTICS_CARD_U, OPTICS_U_SPREAD, opticsFocusTol, opticsImage, opticsRoughTol, opticsV, opticsWindowImage, type PhyOpticsState, type PhyOpticsVariant } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { OPTIC_NAME } from '../actions';
import { APPARATUS_LABEL, NEEDED, opticOf, PLACE_LABEL, type ApparatusId, type SceneState } from './scene-state';

/**
 * Guided mode (practice only): the optical bench as a checklist, one group
 * per value of u, with the object to use next and gentle corrections with the
 * reason. Worked out from the recorded state only — the guide never says
 * where the sharp image is.
 */

const rowDone = (s: PhyOpticsState, k: number) => {
  const r = s.table[k];
  return !!r && !!r.u.trim() && !!r.v.trim() && !!r.iu.trim() && !!r.iv.trim();
};
/** The next value of u on the task card not yet used (null: the card is done). */
export function nextU(s: PhyOpticsState): number | null {
  const task = s.task ?? 'LENS';
  return OPTICS_CARD_U[task].find((u) => !s.readings.some((r) => Math.abs(r.u - u) < 0.5)) ?? null;
}

export function guideSteps(s: PhyOpticsState, scene: SceneState, mode: CameraMode, rough: boolean): GuideStep[] {
  const task = s.task ?? 'LENS';
  const what = OPTIC_NAME[task];
  const optic = opticOf(task);
  const uHolder: ApparatusId = task === 'MIRROR' ? 'lamp' : 'lens';
  const steps: GuideStep[] = [
    { id: 'collect', label: `Collect your apparatus${scene.missing.length ? ` (${scene.missing.length} to go)` : ''}`, target: 'cupboard', why: `A metre rule, the illuminated object (lamp and cross-wire), the ${task === 'MIRROR' ? 'concave mirror' : 'converging lens'} in its holder and a white screen.`, done: scene.ready },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front. Lay the metre rule along the bench there.', done: mode !== 'walk' || scene.placed.size > 0 },
  ];
  for (const id of NEEDED[task].filter((x) => x !== 'rule'))
    steps.push({ id: `place-${id}`, label: PLACE_LABEL[task][id] ?? `Stand the ${APPARATUS_LABEL[id].toLowerCase()} on the rule`, target: id, why: task === 'MIRROR' ? 'With the mirror at 0 cm, the object’s and the screen’s marks on the rule are u and v directly.' : 'With the object at 0 cm, the lens’s mark is u; v is the screen’s mark minus the lens’s mark.', done: scene.placed.has(id), group: 'Set up' });
  steps.push(
    { id: 'rough', label: `Rough focus: point the ${what} at the window and focus it on the screen`, target: rough ? 'screen' : optic, why: 'A distant object’s image forms at about f. Then you know to use values of u well beyond f — nearer than f there is no real image to catch.', done: s.rough !== null, group: 'Set up' },
    { id: 'rough-note', label: 'Write the rough focal length in your notebook', target: 'book', why: 'The distance from the lens or mirror to the screen when the window was sharp.', done: !!s.answers.rough.value.trim(), group: 'Set up' },
    { id: 'align', label: 'Line up the centres on one axis', target: optic, why: `The object, the ${what} and the screen at the same height, so the image lands in the middle of the screen.${task === 'MIRROR' ? ' The object and the screen stand side by side, slightly off the axis.' : ''}`, done: s.aligned, group: 'Set up' },
  );
  s.readings.forEach((r, k) => {
    const group = `u = ${r.u.toFixed(1)} cm`;
    steps.push(
      { id: `set-${k}`, label: `Set u = ${r.u.toFixed(1)} cm`, target: uHolder, why: 'Slide the holder until its index line is on the mark.', done: true, group },
      { id: `focus-${k}`, label: 'Find the sharpest image and take the reading', target: 'screen', why: 'Move the screen to and fro past the sharp position, then stop where the cross-wire is sharpest.', done: true, group },
      { id: `row-${k}`, label: 'Read v on the rule and fill in the row', target: 'book', why: `${task === 'MIRROR' ? 'v is the screen’s mark.' : 'v = screen mark − lens mark.'} u and v to 0.1 cm; 1/u and 1/v to 3 significant figures.`, done: rowDone(s, k), group },
    );
  });
  const us = s.readings.map((r) => r.u);
  const enough = us.length >= 5 && Math.max(...us) - Math.min(...us) >= OPTICS_U_SPREAD[task];
  const nu = nextU(s);
  if (!enough || nu !== null) {
    const target = nu ?? Math.max(...us, 0) + 5;
    const group = `u = ${target.toFixed(1)} cm`;
    steps.push(
      { id: 'next-u', label: `Set u = ${target.toFixed(1)} cm${s.readings.length ? ` — ${s.readings.length} of at least 5 done` : ''}`, target: uHolder, why: task === 'MIRROR' ? 'Slide the object along the rule (or use u − / u + in the dock).' : 'Slide the lens along the rule (or use u − / u + in the dock).', done: Math.abs(s.u - target) < 0.05, group },
      { id: 'next-focus', label: 'Move the screen to and fro to the sharpest image', target: 'screen', why: 'Look at the screen: the lines of the cross-wire are thinnest and the edge of the bright disc crispest at the sharp position. Go past it each way before you stop.', done: false, group },
      { id: 'next-take', label: 'Read the screen’s mark at eye level, then take the reading', target: 'rule', why: 'Read the red index line against the scale to 0.1 cm.', done: false, group },
    );
  }
  steps.push(
    { id: 'graph', label: 'Plot 1/v against 1/u and draw your best line', target: 'book', why: '1/u + 1/v = 1/f: the points lie on a straight line of slope about −1.', done: !!s.line },
    { id: 'extend', label: 'Extend the line to meet both axes', target: 'book', why: 'Each intercept equals 1/f.', done: !!s.line && Math.abs(s.line.x1) < 1e-9 && Math.abs(s.line.y2) < 1e-9 },
    { id: 'calc', label: 'Read both intercepts and work out f', target: 'book', why: 'f = 1 ÷ intercept (in cm, with the intercepts in cm⁻¹). Average the two.', done: !!s.answers.xint.value.trim() && !!s.answers.yint.value.trim() && !!s.answers.f.value.trim() },
    { id: 'written', label: 'Write two precautions', target: 'book', why: 'E.g. the centres on the same axis; the screen moved to and fro to find the sharpest image; distances measured from the optical centre.', done: !!s.written.precautions.trim() },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  );
  return steps;
}

/** A gentle correction for a step just recorded (null: nothing wrong). */
export function correctionFor(a: string, s: PhyOpticsState, v: PhyOpticsVariant): Correction | null {
  const [verb, arg] = a.split(':') as [string, string | undefined];
  const task = s.task ?? 'LENS';
  const what = OPTIC_NAME[task];
  if (verb === 'collect' && arg && !NEEDED[task].includes(arg as ApparatusId) && APPARATUS_LABEL[arg as ApparatusId])
    return { title: `The ${APPARATUS_LABEL[arg as ApparatusId].toLowerCase()} is not needed here.`, why: `This practical needs the metre rule, the illuminated object, the ${task === 'MIRROR' ? 'concave mirror' : 'converging lens'} and the screen. You can put it back from your bench or the cupboard list.` };
  if (verb === 'rough' && arg) {
    const x = Number(arg);
    if (Math.abs(x - opticsWindowImage(v, task)) > opticsRoughTol(v, task))
      return { title: `The window was not sharp at ${x.toFixed(1)} cm.`, why: `Move the screen slowly towards and away from the ${what} and watch the window frame: stop where its bars are crispest. Then record the distance again.`, focus: 'screen' };
  }
  if (verb === 'reading') {
    const k = s.readings.length - 1;
    const r = s.readings[k];
    if (!r) return null;
    if (s.rough === null) return { title: 'Find the rough focal length first.', why: `Focus the distant window with the ${what}: it tells you that u must be well beyond f for a real image.`, focus: 'screen' };
    if (!r.aligned) return { title: 'Line up the centres first.', why: `With the ${what}’s centre off the axis the image lands off the middle of the screen. Line up the centres, delete this reading (×) and take it again.` };
    const img = opticsImage(v, task, r.u);
    if (img === null) return { title: `No real image at u = ${r.u.toFixed(1)} cm.`, why: `That is inside the focal length (your rough focus was about ${s.rough.toFixed(1)} cm): the light never comes to a focus on the screen. Delete this reading and use a larger u.` };
    if (Math.abs(opticsV(task, r.u, r.screen) - img) > opticsFocusTol(img)) return { title: 'The image was not quite at its sharpest.', why: 'Move the screen to and fro past the sharp position a few times and stop where the cross-wire’s lines are thinnest. You can delete this reading (×) and take it again.', focus: 'screen' };
    if (s.readings.slice(0, -1).some((x) => Math.abs(x.u - r.u) < 0.5)) return { title: `You have already taken u = ${r.u.toFixed(1)} cm.`, why: 'Each reading should use a different u, spread out (as on the task card), so your graph has well-spaced points.' };
  }
  return null;
}
