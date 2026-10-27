import { GLASS_PIN_SPACING, glassOffEmergent, type GlassTrace, type PhyGlassState, type PhyGlassVariant } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { APPARATUS, APPARATUS_LABEL, type ApparatusId, type SceneState } from './scene-state';

/**
 * Guided mode (practice only): the glass-block practical as a checklist, one
 * group per angle of incidence, with the object to use next and gentle
 * corrections with the reason. Worked out from the recorded state only.
 */

const gap = (t: GlassTrace) => (t.p1 !== null && t.p2 !== null ? Math.abs(t.p1 - t.p2) : 0);
const gap34 = (t: GlassTrace) => (t.p3 && t.p4 ? Math.hypot(t.p3.x - t.p4.x, t.p3.y - t.p4.y) : 0);
const rowDone = (s: PhyGlassState, k: number) => {
  const r = s.table[k];
  return !!r && !!r.i.trim() && !!r.r.trim() && !!r.sini.trim() && !!r.sinr.trim();
};

export function guideSteps(s: PhyGlassState, scene: SceneState, mode: CameraMode, sight: boolean, nextI: number): GuideStep[] {
  const steps: GuideStep[] = [
    { id: 'collect', label: `Collect your apparatus${scene.missing.length ? ` (${scene.missing.length} to go)` : ''}`, target: 'cupboard', why: 'A drawing board with paper, the glass block, four optical pins, a protractor, a ruler and a sharp pencil.', done: scene.ready },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front. Pin the paper to the board there.', done: mode !== 'walk' || s.traces.length > 0 },
  ];
  const joined = s.traces.filter((t) => t.joined);
  s.traces.forEach((t, k) => {
    const group = `i = ${t.i}°`;
    const open = !t.joined;
    steps.push(
      { id: `trace-${k}`, label: 'Trace the block and draw the incident ray', target: 'board', why: `A fresh outline ABCD for every angle; the ray meets AB at O at ${t.i}° to the normal.`, done: true, group },
      { id: `normal-${k}`, label: 'Draw the normal at O', target: 'board', why: 'Angles are measured from the normal, the line at 90° to the face.', done: t.normal, group },
      { id: `p12-${k}`, label: 'Stick P₁ and P₂ on the incident ray, at least 5 cm apart', target: t.p1 === null ? 'pins' : 'board', why: 'Far-apart pins fix the direction of the ray accurately. Push them in upright.', done: t.p1 !== null && t.p2 !== null && gap(t) >= GLASS_PIN_SPACING - 0.05, group },
      { id: `sight-${k}`, label: 'Look through face CD at eye level', target: 'block', why: 'Look at the bases of the pins (their images in the glass), not their tops.', done: !open || sight || !!t.p3, group },
      { id: `p34-${k}`, label: 'Line up the images of P₁ and P₂, then stick P₃ and P₄ in line with them', target: 'block', why: 'Move your eye until P₂’s image exactly hides P₁’s; then P₃ and P₄ must hide them too, at least 5 cm apart.', done: !!t.p3 && !!t.p4 && gap34(t) >= GLASS_PIN_SPACING - 0.05, group },
      { id: `join-${k}`, label: 'Remove the block, join P₄P₃ to CD at E and join OE', target: 'block', why: 'OE is the refracted ray inside the glass.', done: t.joined, group },
      { id: `r-${k}`, label: 'Measure r with the protractor and fill in the row', target: 'protractor', why: 'Centre the protractor on O with 0° on the normal; read r to the nearest degree. Then sin i and sin r to 3 d.p.', done: t.joined && rowDone(s, k), group },
    );
  });
  const angles = [...new Set(joined.map((t) => t.i))];
  const spread = angles.length ? Math.max(...angles) - Math.min(...angles) : 0;
  const enough = angles.length >= 5 && spread >= 30;
  if (!enough && !s.traces.some((t) => !t.joined))
    steps.push({ id: 'next-trace', label: `Start the next trace (i = ${nextI}°)${joined.length ? ` — ${joined.length} of at least 5 done` : ''}`, target: 'board', why: 'At least five angles, spread out (e.g. 20°, 30°, 40°, 50°, 60°).', done: false, group: `i = ${nextI}°` });
  steps.push(
    { id: 'graph', label: 'Plot sin i against sin r and draw your best line', target: 'book', why: 'sin i on the vertical axis: Snell’s law says the points lie on a straight line through the origin.', done: !!s.line },
    { id: 'calc', label: 'Find the slope and state n', target: 'book', why: 'n = slope of sin i against sin r. It has no unit (it is a ratio); give it to 2 or 3 significant figures.', done: !!s.answers.slope.value.trim() && !!s.answers.n.value.trim() },
    { id: 'written', label: 'Write two precautions', target: 'book', why: 'E.g. pins upright and at least 5 cm apart; looked at the bases of the pins; block not moved during an observation.', done: !!s.written.precautions.trim() },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  );
  return steps;
}

/** A gentle correction for a step just recorded (null: nothing wrong). */
export function correctionFor(a: string, s: PhyGlassState, v: PhyGlassVariant): Correction | null {
  const [verb, arg] = a.split(':') as [string, string | undefined];
  const open = s.traces.find((t) => !t.joined) ?? null;
  if (verb === 'collect' && arg && !APPARATUS.find((x) => x.id === arg)?.needed)
    return { title: `The ${APPARATUS_LABEL[arg as ApparatusId].toLowerCase()} is not needed here.`, why: 'This practical needs the rectangular block only. You can put it back from your bench or the cupboard list.' };
  if (verb === 'trace' && arg) {
    const i = Number(arg);
    if (s.traces.filter((t) => t.i === i).length > 1) return { title: `You have already traced i = ${i}°.`, why: 'Each trace should use a different angle of incidence, spread over at least 30° (e.g. 20° to 60°), so your graph has well-spread points.', focus: 'board' };
  }
  if ((verb === 'pin-p1' || verb === 'pin-p2') && open) {
    if (!open.normal) return { title: 'Draw the normal at O first.', why: 'The angle of incidence is measured from the normal: draw it before you mark the ray and its pins.', focus: 'board' };
    if (open.p1 !== null && open.p2 !== null && gap(open) < GLASS_PIN_SPACING - 0.05)
      return { title: `P₁ and P₂ are only ${gap(open).toFixed(1)} cm apart.`, why: 'Put them at least 5 cm apart: a small error in a pin’s position then changes the direction of the ray much less.', focus: 'board' };
  }
  if ((verb === 'pin-p3' || verb === 'pin-p4') && open && open.p3 && open.p4 && gap34(open) < GLASS_PIN_SPACING - 0.05)
    return { title: `P₃ and P₄ are only ${gap34(open).toFixed(1)} cm apart.`, why: 'Move one of them so they are at least 5 cm apart, still in line with the images.', focus: 'board' };
  if (verb === 'join') {
    const t = s.traces.filter((x) => x.joined).at(-1);
    if (t?.p3 && t.p4) {
      const off = Math.max(glassOffEmergent(v, t.i, t.p3), glassOffEmergent(v, t.i, t.p4));
      if (off > 0.15) return { title: 'P₃ and P₄ were not quite in line with the images.', why: `They are about ${off.toFixed(1)} cm off the real emergent ray. Next time move your eye until the image of P₂ exactly hides the image of P₁ before you push P₃ and P₄ in — look at the bases of the pins. You can discard this trace and do it again.`, focus: 'board' };
    }
  }
  return null;
}

/** The hint bar (practice, guided mode off) — the 2D lab's hint. */
export { hint as nextHint } from '../index';
