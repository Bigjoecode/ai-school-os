import { PINS_ALIGN_TOL, PINS_SPACING, mirrorConstruction, pinsOff, type PhyPinsState, type PhyPinsVariant, type PinsTask } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { CARD_ANGLES, gap12, gap34 } from '../actions';
import { APPARATUS_LABEL, apparatusFor, type ApparatusId, type SceneState } from './scene-state';

/**
 * Guided mode (practice only): each practical as a checklist worked out from
 * the recorded state, with the object to use next and the teaching reason;
 * gentle corrections for the mistakes the lessons warn about.
 */

export interface GuideView {
  mode: CameraMode;
  sight: boolean;
  look: boolean;
  screen: boolean;
  nextI: number;
}

export function guideSteps(task: PinsTask, s: PhyPinsState, scene: SceneState, gv: GuideView): GuideStep[] {
  const steps: GuideStep[] = [
    { id: 'collect', label: `Collect your apparatus${scene.missing.length ? ` (${scene.missing.length} to go)` : ''}`, target: 'cupboard', why: `You need: ${apparatusFor(task).filter((a) => a.needed).map((a) => a.label.toLowerCase()).join(', ')}.`, done: scene.ready },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front.', done: gv.mode !== 'walk' || s.traces.length > 0 || s.depth.readings.length > 0 || s.disp.looks.length > 0 },
  ];
  if (task === 'MIRROR' || task === 'PRISM') {
    const what = task === 'MIRROR' ? 'mirror' : 'prism';
    s.traces.forEach((t, k) => {
      const group = `i = ${t.i}°`;
      const open = !t.joined;
      steps.push(
        { id: `trace-${k}`, label: task === 'MIRROR' ? 'Draw MM′, stand the mirror on it, draw the ray' : 'Trace the prism and draw the incident ray', target: 'board', why: task === 'MIRROR' ? 'The silvered (reflecting) surface stands exactly on MM′.' : 'A fresh outline for every angle.', done: true, group },
        { id: `normal-${k}`, label: 'Draw the normal at O', target: 'board', why: 'Angles are measured from the normal, never from the surface.', done: t.normal, group },
        { id: `p12-${k}`, label: `Stick P₁ and P₂ on the incident ray, at least ${PINS_SPACING} cm apart`, target: t.p1 === null ? 'pins' : 'board', why: 'Far-apart pins fix the direction accurately. Push them in upright.', done: t.p1 !== null && t.p2 !== null && gap12(t) >= PINS_SPACING - 0.05, group },
        { id: `sight-${k}`, label: task === 'MIRROR' ? 'Look into the mirror at paper level' : 'Look through the second face at paper level', target: what, why: 'Look at the bases of the images, not the tops of the pins.', done: !open || gv.sight || !!t.p3, group },
        { id: `p34-${k}`, label: 'Line up the images, then stick P₃ and P₄ in line with them', target: what, why: `Move your eye until the image of P₂ exactly hides the image of P₁; P₃ and P₄ must hide them too, at least ${PINS_SPACING} cm apart.`, done: !!t.p3 && !!t.p4 && gap34(t) >= PINS_SPACING - 0.05, group },
        { id: `join-${k}`, label: `Remove the ${what} and join the points`, target: what, why: task === 'MIRROR' ? 'P₄P₃ produced meets MM′: that is the reflected ray.' : 'Produce the incident ray forward and the emergent ray back until they meet.', done: t.joined, group },
        { id: `a-${k}`, label: task === 'MIRROR' ? 'Measure r from the normal and fill in the row' : 'Measure D and fill in the row', target: 'protractor', why: task === 'MIRROR' ? '0° of the protractor on the normal — not on the mirror line.' : 'D is the angle between the incident ray produced and the emergent ray.', done: t.joined && !!s.table[k]?.i.trim() && !!s.table[k]?.a.trim(), group },
      );
    });
    const done = new Set(s.traces.filter((t) => t.joined).map((t) => t.i));
    const left = CARD_ANGLES[task].filter((i) => !done.has(i));
    if (left.length && !s.traces.some((t) => !t.joined)) steps.push({ id: 'next', label: `Start the next trace (i = ${gv.nextI}°) — ${done.size} of ${CARD_ANGLES[task].length}`, target: 'board', why: `The card asks for ${CARD_ANGLES[task].join('°, ')}°.`, done: false, group: `i = ${gv.nextI}°` });
    if (task === 'MIRROR')
      steps.push(
        { id: 'graph', label: 'Plot r against i and draw your best line', target: 'book', why: 'A straight line through the origin.', done: !!s.line },
        { id: 'calc', label: 'Find the slope and write the conclusion', target: 'book', why: 'The slope should be 1: r = i.', done: !!s.answers.slope.value.trim() && !!s.written.conclusion.trim() },
      );
    else
      steps.push(
        { id: 'graph', label: 'Plot D against i: a smooth curve, then mark the minimum', target: 'book', why: 'D falls, reaches a minimum and rises — never a straight line.', done: s.curve && !!s.line },
        { id: 'calc', label: 'Read Dₘ and work out n', target: 'book', why: 'n = sin((A + Dₘ)/2) ÷ sin(A/2), with A/2 = 30° underneath.', done: !!s.answers.dmin.value.trim() && !!s.answers.n.value.trim() },
      );
  } else if (task === 'DEPTH') {
    const used = new Set(s.depth.readings.map((r) => r.blocks));
    [1, 2, 3, 4].forEach((b) => {
      const group = `${b} block${b === 1 ? '' : 's'}`;
      const k = s.depth.readings.findIndex((r) => r.blocks === b);
      steps.push(
        { id: `blocks-${b}`, label: `Put ${b} block${b === 1 ? '' : 's'} on the cross`, target: 'blocks', why: 'Real depth = the height of the top face above the cross.', done: s.depth.blocks === b || used.has(b), group },
        { id: `look-${b}`, label: 'Look vertically down and move your eye from side to side', target: 'blocks', why: 'Watch the image of the cross and the tip of the search pin.', done: used.has(b) || (s.depth.blocks === b && gv.look), group },
        { id: `np-${b}`, label: 'Move the search pin until it shows no parallax, then take the reading', target: 'stand', why: 'If the pin moves the same way as your eye it is too high (nearer you); the opposite way, too low.', done: used.has(b), group },
        { id: `row-${b}`, label: 'Fill in the real and apparent depth', target: 'book', why: 'Apparent depth = top-face reading − pin reading (from the TOP, not the bottom).', done: k >= 0 && !!s.depth.rows[k]?.real.trim() && !!s.depth.rows[k]?.app.trim(), group },
      );
    });
    steps.push(
      { id: 'graph', label: 'Plot real against apparent depth and draw your best line', target: 'book', why: 'Real depth up the side.', done: !!s.line },
      { id: 'calc', label: 'Find the slope: n', target: 'book', why: 'n = real ÷ apparent (not apparent ÷ real).', done: !!s.answers.slope.value.trim() && !!s.answers.n.value.trim() },
    );
  } else {
    const d = s.disp;
    steps.push(
      { id: 'dark', label: 'Darken the room', target: 'curtain', why: 'Stray light washes the colours out.', done: d.dark || d.looks.some((l) => l.dark) },
      { id: 'slit', label: 'Use the narrow slit', target: 'raybox', why: 'A wide beam makes the colours overlap (an impure spectrum).', done: d.slit === 'narrow' || d.looks.some((l) => l.slit === 'narrow') },
      { id: 'look', label: 'Look at the screen and rotate the prism to minimum deviation', target: 'prism', why: 'Turn the turntable: the spectrum moves, stops, then turns back. Where it stops is minimum deviation.', done: d.looks.some((l) => l.dark && l.slit === 'narrow' && l.filter === 'none') },
      { id: 'order', label: 'Record the order of the colours and which is deviated most', target: 'book', why: 'Read them from the least deviated.', done: d.order.length === 7 && !!d.most && !!d.least },
      { id: 'read', label: 'Read D for red and violet on the scale', target: 'screen', why: 'At minimum deviation, to 0.1°.', done: !!s.answers.dred.value.trim() && !!s.answers.dviol.value.trim() },
      { id: 'filter', label: 'Put the red filter in the beam and look again', target: 'filters', why: 'Does the prism split red light any further?', done: d.looks.some((l) => l.filter !== 'none') && !!d.filterObs },
      { id: 'explain', label: 'Choose the ray diagram and explain dispersion', target: 'book', why: 'Each colour has its own refractive index in glass.', done: !!d.ray && !!s.written.conclusion.trim() },
    );
  }
  steps.push(
    { id: 'written', label: task === 'DISP' ? 'Write one precaution' : 'Write two precautions', target: 'book', why: task === 'DISP' ? 'E.g. darkened room, narrow slit — and never look at the Sun through a prism.' : 'E.g. pins upright and well apart; looked at the bases; viewed vertically.', done: !!s.written.precautions.trim() },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  );
  return steps;
}

/** A gentle correction for a step just recorded (null: nothing wrong). */
export function correctionFor(task: PinsTask, a: string, s: PhyPinsState, v: PhyPinsVariant): Correction | null {
  const [verb, arg] = a.split(':') as [string, string | undefined];
  const open = s.traces.find((t) => !t.joined) ?? null;
  if (verb === 'collect' && arg && !apparatusFor(task).find((x) => x.id === arg)?.needed) return { title: `The ${APPARATUS_LABEL[arg as ApparatusId]?.toLowerCase() ?? arg} is not needed here.`, why: 'You can put it back from your bench or the cupboard list.' };
  if ((verb === 'pin-p1' || verb === 'pin-p2') && open) {
    if (!open.normal) return { title: 'Draw the normal at O first.', why: 'The angle of incidence is measured from the normal: draw it before the ray’s pins.', focus: 'board' };
    if (open.p1 !== null && open.p2 !== null && gap12(open) < PINS_SPACING - 0.05) return { title: `P₁ and P₂ are only ${gap12(open).toFixed(1)} cm apart.`, why: `Put them at least ${PINS_SPACING} cm apart: a small error in a pin’s position then changes the ray’s direction much less.`, focus: 'board' };
  }
  if ((verb === 'pin-p3' || verb === 'pin-p4') && open?.p3 && open.p4 && gap34(open) < PINS_SPACING - 0.05) return { title: `P₃ and P₄ are only ${gap34(open).toFixed(1)} cm apart.`, why: `Move one so they are at least ${PINS_SPACING} cm apart, still in line with the images.`, focus: 'board' };
  if (verb === 'join' && (task === 'MIRROR' || task === 'PRISM')) {
    const t = s.traces.filter((x) => x.joined).at(-1);
    const off = t ? pinsOff(v, task, t) : null;
    if (off !== null && off > PINS_ALIGN_TOL) return { title: 'P₃ and P₄ were not quite in line with the images.', why: `They are about ${off.toFixed(1)} cm off the true ray. Move your eye until the image of P₂ exactly hides the image of P₁ — look at the bases — before you push P₃ and P₄ in. You can discard this trace and do it again.`, focus: 'board' };
    if (task === 'MIRROR' && t) {
      const c = mirrorConstruction(t);
      if (c && Math.abs(c.r - t.i) > 1.5) return { title: 'Check your reflected ray.', why: `It makes ${c.r.toFixed(0)}° with the normal, but the ray came in at ${t.i}°.`, focus: 'board' };
    }
  }
  if (verb === 'depth-read' && a.endsWith(':unchecked')) return { title: 'You did not check for parallax.', why: 'Before you take the reading, move your eye from side to side: the pin and the image of the cross must move together. Then they are at the same place.', focus: 'stack' };
  if (verb === 'look' && arg && a.includes(':lit:')) return { title: 'The room lights are on.', why: 'Darken the room first: stray light washes the spectrum out.', focus: 'screen' };
  if (verb === 'look' && a.includes(':wide:')) return { title: 'The slit is wide.', why: 'With a wide beam the colours overlap. Use the narrow slit for a pure spectrum.', focus: 'screen' };
  if (verb === 'most' && s.disp.most === 'red') return { title: 'Look again at the screen.', why: 'The colour nearest the straight-through direction is deviated least. Which colour is furthest from it?', focus: 'screen' };
  return null;
}
