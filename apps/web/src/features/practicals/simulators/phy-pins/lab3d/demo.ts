import { DISP_COLOUR_IDS, depthNoParallaxH, depthStack, dispDmin, dispIMin, emptyPhyPinsState, phyFit, pinsAlignedPhi, type PhyPinsState, type PhyPinsVariant, type PinsTask } from '@aischool/shared';
import type { DemoBeat, DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import { CARD_ANGLES, type Pins } from '../actions';
import { measured } from '../index';
import { useBench } from './bench-store';
import { curveLow } from './curve';
import { makeOps, type Ops } from './lab-actions';
import { NEEDED_FOR } from './scene-state';

/**
 * Mr Bayo's demonstrations: the whole practical on his own apparatus (a demo
 * seed that is never the student's) and his own in-memory state, through the
 * same operations as the student's bench. The first trace or reading is shown
 * step by step, the rest quickly; then the table, the graph and the result.
 */

export const DEMO_SEED = 7;
export const demoSeed = (studentSeed: number) => (studentSeed === DEMO_SEED ? DEMO_SEED + 1 : DEMO_SEED);
export const demoEmpty = (task: PinsTask): PhyPinsState => ({ ...emptyPhyPinsState(), task });

export interface DemoCtx {
  g: Pins;
  v: PhyPinsVariant;
  s: () => PhyPinsState;
  ops: () => Ops;
}
type Beat = DemoBeat<DemoCtx>;
export type DemoStep = KitDemoStep<DemoCtx>;

const BENCHV = { mode: 'bench' as const, focus: 'bench', spot: null };
const focus = (f: string) => ({ mode: 'bench' as const, focus: f, spot: null });
const collect = (task: PinsTask): Beat[] => NEEDED_FOR[task].map((id, n) => ({ at: 300 + n * 300, run: (c: DemoCtx) => c.g.note(`collect:${id}`) }));
const r1 = (x: number) => Math.round(x * 10) / 10;

function fillRow(c: DemoCtx, k: number) {
  const t = c.s().traces[k];
  const a = t ? measured(c.g, t) : null;
  if (!t || a === null) return;
  const val = c.g.bt === 'MIRROR' ? String(Math.round(a)) : (Math.round(a * 2) / 2).toFixed(1);
  c.g.update((x) => ({ ...x, table: x.table.map((row, j) => (j === k ? { i: String(t.i), a: val } : row)) }));
}
function aligned(c: DemoCtx, i: number) {
  return r1(pinsAlignedPhi(c.v, c.g.bt, i) ?? i);
}
function quickTrace(i: number, at0: number, gap: number): Beat[] {
  const k = (c: DemoCtx) => c.s().traces.length - 1;
  const steps: ((c: DemoCtx) => void)[] = [
    (c) => (useBench.setState({ nextI: i }), c.ops().startTrace()),
    (c) => c.ops().drawNormal(),
    (c) => (useBench.setState({ dist: { p1: 10, p2: 3 } }), c.ops().pushOnRay('p1')),
    (c) => c.ops().pushOnRay('p2'),
    (c) => (useBench.setState({ phi: aligned(c, i) }), c.ops().sight(true)),
    (c) => c.ops().pushInLine('p3'),
    (c) => c.ops().pushInLine('p4'),
    (c) => c.ops().join(),
    (c) => fillRow(c, k(c)),
  ];
  return steps.map((run, n) => ({ at: at0 + n * gap, run }));
}
function lineThrough(c: DemoCtx) {
  const pts = c.s().table.map((r) => ({ x: Number(r.i), y: Number(r.a) }));
  const fit = phyFit(pts);
  if (!fit) return;
  const x1 = Math.min(...pts.map((p) => p.x));
  const x2 = Math.max(...pts.map((p) => p.x));
  c.g.update((x) => ({ ...x, line: { x1, y1: Number((fit.intercept + fit.slope * x1).toFixed(3)), x2, y2: Number((fit.intercept + fit.slope * x2).toFixed(3)) } }));
}
const slopeOf = (s: PhyPinsState) => (s.line && Math.abs(s.line.x2 - s.line.x1) > 1e-9 ? ((s.line.y2 - s.line.y1) / (s.line.x2 - s.line.x1)).toFixed(2) : '—');

function boardScript(task: 'MIRROR' | 'PRISM', precautions: string): DemoStep[] {
  const angles = CARD_ANGLES[task];
  const i0 = angles[0]!;
  const mirror = task === 'MIRROR';
  const steps: DemoStep[] = [
    { id: 'intro', title: 'The apparatus', say: () => (mirror ? 'Today we verify the laws of reflection. On my bench: a drawing board with white paper, a plane mirror in a holder, four optical pins, a protractor, a ruler and a sharp pencil.' : 'Today we find how the deviation through a glass prism changes with the angle of incidence. On my bench: a drawing board with paper, an equilateral prism, optical pins, a protractor, a ruler and a sharp pencil.'), ms: 6500, view: BENCHV, point: 'board', beats: collect(task) },
    { id: 'trace', title: mirror ? 'MM′, the mirror and the ray' : 'The outline and the ray', say: () => (mirror ? `I draw a line MM′ and stand the silvered surface of the mirror on it. At O the incident ray comes in at ${i0} degrees to the normal.` : `I trace the outline of the prism. At O on the first face the incident ray goes in at ${i0} degrees to the normal.`), ms: 5200, view: focus('board'), point: mirror ? 'mirror' : 'prism', beats: [{ at: 500, run: (c) => (useBench.setState({ nextI: i0 }), c.ops().startTrace()) }] },
    { id: 'normal', title: 'The normal at O', say: () => 'With the ruler I draw the normal at O, at ninety degrees to the surface. Every angle is measured from the normal, never from the surface.', ms: 4500, view: focus('board'), point: 'board', beats: [{ at: 400, run: (c) => c.ops().drawNormal() }] },
    { id: 'p12', title: 'P₁ and P₂ on the incident ray', say: () => 'I push P₁ and P₂ in upright on the incident ray, seven centimetres apart. Pins close together would fix the direction badly.', ms: 5000, view: focus('board'), point: 'pins', beats: [
      { at: 600, run: (c) => (useBench.setState({ dist: { p1: 10, p2: 3 } }), c.ops().pushOnRay('p1')) },
      { at: 2000, run: (c) => c.ops().pushOnRay('p2') },
    ] },
    { id: 'sight', title: mirror ? 'Look into the mirror' : 'Look through the second face', say: () => `Now my eye goes down to the level of the paper${mirror ? ' and I look into the mirror' : ' and I look through the other face of the prism'}. I watch the bases of the images and move my eye until the image of P₂ exactly hides the image of P₁.`, ms: 9000, view: { mode: 'bench' as const, focus: 'sight' }, point: mirror ? 'mirror' : 'prism', beats: [
      { at: 200, run: (c) => (useBench.setState({ phi: r1(aligned(c, i0) + 3) }), c.ops().sight(true)) },
      ...Array.from({ length: 10 }, (_, n): Beat => ({ at: 1500 + n * 500, run: (c) => useBench.setState({ phi: r1(aligned(c, i0) + 3 - (3 * (n + 1)) / 10) }) })),
    ] },
    { id: 'p34', title: 'P₃ and P₄ in line', say: () => 'Keeping my eye still, I push in P₃ so it hides both images, then P₄ further away so it hides P₃ as well. All four look like one pin.', ms: 5500, view: { mode: 'bench' as const, focus: 'sight' }, point: mirror ? 'mirror' : 'prism', beats: [
      { at: 900, run: (c) => c.ops().pushInLine('p3') },
      { at: 2600, run: (c) => c.ops().pushInLine('p4') },
    ] },
    { id: 'join', title: `Remove the ${mirror ? 'mirror' : 'prism'} and join`, say: () => (mirror ? 'I take the mirror away and join P₄ and P₃ to meet MM′. That is the reflected ray.' : 'I take the prism away, draw the emergent ray through P₄ and P₃, join the ray inside, and produce the incident ray forward and the emergent ray back until they meet.'), ms: 6000, view: focus('board'), point: 'board', beats: [{ at: 600, run: (c) => c.ops().join() }] },
    { id: 'measure', title: mirror ? 'Measure r' : 'Measure D', say: (c) => {
      const t = c.s().traces[0];
      const a = t ? measured(c.g, t) : null;
      return mirror ? `Protractor on the point, zero on the normal: the angle of reflection is about ${a === null ? '—' : Math.round(a)} degrees — the same as i.` : `The angle between the incident ray produced and the emergent ray is the deviation: about ${a === null ? '—' : (Math.round(a * 2) / 2).toFixed(1)} degrees.`;
    }, ms: 6500, view: focus('protractor'), point: 'protractor', panel: 'notebook', beats: [{ at: 3500, run: (c) => fillRow(c, 0) }] },
    { id: 'rest', title: `The other angles`, say: () => `A fresh sheet for every angle: ${angles.slice(1).join(', ')} degrees, the same way each time.`, ms: 4000 + angles.length * 2600, view: focus('board'), point: 'board', beats: angles.slice(1).flatMap((i, n) => quickTrace(i, 300 + n * 3100, 320)) },
  ];
  if (mirror)
    steps.push(
      { id: 'graph', title: 'r against i', say: () => 'I plot r against i. The points lie on a straight line through the origin.', ms: 6000, view: BENCHV, point: 'book', panel: 'notebook', beats: [{ at: 1500, run: lineThrough }] },
      { id: 'result', title: 'The slope is 1', say: (c) => `The slope is about ${slopeOf(c.s())}: the angle of reflection equals the angle of incidence. ${precautions}`, ms: 8000, view: BENCHV, point: 'book', panel: 'calc', beats: [{ at: 1500, run: (c) => c.g.update((x) => ({ ...x, answers: { ...x.answers, slope: { value: slopeOf(x), unit: '' } }, written: { precautions: precautions || 'Pins upright and well apart; looked at the bases of the images.', conclusion: 'r = i: the angle of reflection equals the angle of incidence.' } })) }] },
    );
  else
    steps.push(
      { id: 'graph', title: 'D against i: a curve', say: () => 'I plot D against i. The points fall, reach a minimum and rise again — so I draw a smooth curve, not a straight line, and mark its lowest point with a short level line.', ms: 7000, view: BENCHV, point: 'book', panel: 'notebook', beats: [{ at: 1500, run: (c) => c.g.update((x) => ({ ...x, curve: true })) }, { at: 3000, run: (c) => {
        const low = curveLow(c.s());
        if (low) c.g.update((x) => ({ ...x, line: { x1: Math.round(low.x - 6), y1: r1(low.y), x2: Math.round(low.x + 6), y2: r1(low.y) } }));
      } }] },
      { id: 'result', title: 'Dₘ and n', say: (c) => {
        const low = curveLow(c.s());
        const d = low ? r1(low.y) : 0;
        const n = Math.sin(((60 + d) / 2) * (Math.PI / 180)) / 0.5;
        return `The minimum deviation is about ${d} degrees. n equals sine of half of sixty plus D-m, divided by sine thirty: about ${n.toFixed(2)}. ${precautions}`;
      }, ms: 9000, view: BENCHV, point: 'book', panel: 'calc', beats: [{ at: 1500, run: (c) => {
        const low = curveLow(c.s());
        if (!low) return;
        const d = r1(low.y);
        c.g.update((x) => ({ ...x, answers: { ...x.answers, dmin: { value: d.toFixed(1), unit: '°' }, n: { value: (Math.sin(((60 + d) / 2) * (Math.PI / 180)) / 0.5).toFixed(3), unit: '' } }, written: { ...x.written, precautions: precautions || 'Pins upright and well spaced; prism outline traced and not moved.' } }));
      } }] },
    );
  return steps;
}

function depthScript(precautions: string): DemoStep[] {
  const read = (b: number, at0: number): Beat[] => [
    { at: at0, run: (c) => c.g.setBlocks(b) },
    { at: at0 + 300, run: (c) => c.g.setPin(Math.round(depthNoParallaxH(c.v, b) * 20) / 20) },
    { at: at0 + 500, run: (c) => c.g.setEye(-4) },
    { at: at0 + 700, run: (c) => c.g.setEye(4) },
    { at: at0 + 900, run: (c) => c.g.setEye(0) },
    { at: at0 + 1100, run: (c) => c.g.takeDepth() },
    { at: at0 + 1300, run: (c) => fillDepth(c) },
  ];
  return [
    { id: 'intro', title: 'The apparatus', say: () => 'Today we find the refractive index of glass from real and apparent depth. A cross on paper, four glass blocks, a search pin in a cork on a stand and a vertical rule with zero at the bench.', ms: 6500, view: BENCHV, point: 'blocks', beats: collect('DEPTH') },
    { id: 'one', title: 'One block on the cross', say: (c) => `One block on the cross. Its top face is at ${depthStack(c.v, 1).toFixed(1)} centimetres on the rule: that is the real depth.`, ms: 5000, view: focus('stack'), point: 'blocks', beats: [{ at: 500, run: (c) => c.g.setBlocks(1) }, { at: 900, run: (c) => c.g.setPin(0.4) }] },
    { id: 'look', title: 'Look down, move your eye', say: () => 'I look vertically down at the cross. As I move my eye from side to side, the search pin and the image of the cross move apart: there is parallax. The pin is too low.', ms: 7000, view: { mode: 'bench' as const, focus: 'look' }, point: 'blocks', beats: [{ at: 200, run: (c) => c.ops().look(true) }, ...[-4, -2, 0, 2, 4, 2, 0, -2, -4, 0].map((x, n): Beat => ({ at: 800 + n * 500, run: (c) => c.g.setEye(x) }))] },
    { id: 'np', title: 'No parallax', say: () => 'I raise the pin a little at a time, moving my eye each time, until the pin and the image move together. Now there is no parallax: the pin is where the image is.', ms: 8000, view: { mode: 'bench' as const, focus: 'look' }, point: 'stand', beats: [
      ...Array.from({ length: 6 }, (_, n): Beat => ({ at: 400 + n * 600, run: (c) => c.g.setPin(0.4 + ((Math.round(depthNoParallaxH(c.v, 1) * 20) / 20 - 0.4) * (n + 1)) / 6) })),
      ...[-4, 0, 4, 0].map((x, n): Beat => ({ at: 4400 + n * 600, run: (c) => c.g.setEye(x) })),
    ] },
    { id: 'take', title: 'Read the pin', say: (c) => `The pin is at ${(Math.round(depthNoParallaxH(c.v, 1) * 10) / 10).toFixed(1)} centimetres. Apparent depth is measured from the top face down: top reading minus pin reading.`, ms: 6500, view: focus('rule'), point: 'rule', panel: 'notebook', beats: [{ at: 600, run: (c) => (c.ops().look(false), c.g.takeDepth()) }, { at: 2500, run: fillDepth }] },
    { id: 'rest', title: 'Two, three and four blocks', say: () => 'The same with two, three and four blocks — each time moving my eye to check for parallax.', ms: 7000, view: focus('stack'), point: 'blocks', beats: [...read(2, 400), ...read(3, 2400), ...read(4, 4400)] },
    { id: 'graph', title: 'Real against apparent', say: () => 'Real depth up the side, apparent depth along the bottom: a straight line through the origin.', ms: 6000, view: BENCHV, point: 'book', panel: 'notebook', beats: [{ at: 1500, run: (c) => {
      const pts = c.s().depth.rows.map((r) => ({ x: Number(r.app), y: Number(r.real) }));
      const fit = phyFit(pts);
      if (!fit) return;
      const x2 = Math.max(...pts.map((p) => p.x));
      c.g.update((x) => ({ ...x, line: { x1: 0, y1: Number(fit.intercept.toFixed(3)), x2, y2: Number((fit.intercept + fit.slope * x2).toFixed(3)) } }));
    } }] },
    { id: 'result', title: 'The slope is n', say: (c) => `The slope is about ${slopeOf(c.s())}: that is the refractive index of the glass, real divided by apparent. ${precautions}`, ms: 8000, view: BENCHV, point: 'book', panel: 'calc', beats: [{ at: 1500, run: (c) => c.g.update((x) => ({ ...x, answers: { ...x.answers, slope: { value: slopeOf(x), unit: '' }, n: { value: slopeOf(x), unit: '' } }, written: { ...x.written, precautions: precautions || 'Viewed vertically; parallax removed by moving my eye from side to side.' } })) }] },
  ];
}
function fillDepth(c: DemoCtx) {
  const s = c.s();
  const k = s.depth.readings.length - 1;
  const r = s.depth.readings[k];
  if (!r) return;
  const top = Math.round(depthStack(c.v, r.blocks) * 10) / 10;
  const pin = Math.round(r.h * 10) / 10;
  c.g.update((x) => ({ ...x, depth: { ...x.depth, rows: x.depth.rows.map((row, j) => (j === k ? { real: top.toFixed(1), app: (top - pin).toFixed(1) } : row)) } }));
}

function dispScript(): DemoStep[] {
  return [
    { id: 'intro', title: 'The apparatus', say: () => 'Today we split white light into its colours. A ray box with slits, a triangular prism on a turntable, a white screen with a scale, and colour filters. Never look at the Sun through a prism.', ms: 7000, view: BENCHV, point: 'raybox', beats: collect('DISP') },
    { id: 'dark', title: 'A dark room and a narrow slit', say: () => 'I darken the room and choose the narrow slit: a narrow beam keeps the colours from overlapping.', ms: 5500, view: BENCHV, point: 'raybox', beats: [{ at: 600, run: (c) => c.g.setDark(true) }, { at: 2200, run: (c) => c.g.setSlit('narrow') }, { at: 2600, run: (c) => (c.g.setI(32), c.g.setDist(60)) }] },
    { id: 'rotate', title: 'Rotate to minimum deviation', say: () => 'I look at the screen and turn the prism slowly. The spectrum moves along the scale, stops, and turns back. Where it stops is minimum deviation: the colours are clearest there.', ms: 10000, view: focus('screen'), point: 'screen', beats: [{ at: 200, run: (c) => (useBench.setState({ screen: true }), c.g.look()) }, ...Array.from({ length: 14 }, (_, n): Beat => ({ at: 1000 + n * 550, run: (c) => c.g.setI(Math.round(32 + ((dispIMin(c.v, 'green') - 32 + 8) * (n < 10 ? n + 1 : 20 - n)) / 10)) })), { at: 9200, run: (c) => (c.g.setI(Math.round(dispIMin(c.v, 'green'))), c.g.look()) }] },
    { id: 'order', title: 'The order of the colours', say: () => 'Red, orange, yellow, green, blue, indigo, violet. Red is deviated least, violet most.', ms: 6500, view: focus('screen'), point: 'screen', panel: 'notebook', beats: [{ at: 1500, run: (c) => (c.g.setOrder([...DISP_COLOUR_IDS]), c.g.setMost('violet'), c.g.setLeast('red'), c.g.setRay('violet-more')) }] },
    { id: 'read', title: 'D for red and violet', say: (c) => `On the scale, red is at about ${r1(dispDmin(c.v, 'red'))} degrees and violet at about ${r1(dispDmin(c.v, 'violet'))}. The angular dispersion is the difference.`, ms: 7000, view: focus('screen'), point: 'screen', panel: 'notebook', beats: [{ at: 2000, run: (c) => {
      const dr = r1(dispDmin(c.v, 'red'));
      const dv = r1(dispDmin(c.v, 'violet'));
      c.g.update((x) => ({ ...x, answers: { ...x.answers, dred: { value: dr.toFixed(1), unit: '°' }, dviol: { value: dv.toFixed(1), unit: '°' }, disp: { value: (dv - dr).toFixed(1), unit: '°' }, n: { value: (Math.sin(((60 + dr) / 2) * (Math.PI / 180)) / 0.5).toFixed(3), unit: '' } } }));
    } }] },
    { id: 'filter', title: 'A red filter', say: () => 'With a red filter in the beam only red light reaches the screen — and the prism does not split it any further. The prism does not add colours: it separates the colours already in white light.', ms: 8000, view: focus('screen'), point: 'filters', beats: [{ at: 1000, run: (c) => (c.g.setFilter('red'), c.g.look(), c.g.setFilterObs('one-colour')) }, { at: 6500, run: (c) => c.g.setFilter('none') }] },
    { id: 'explain', title: 'Why it happens', say: () => 'Each colour travels at a different speed in glass, so it has a different refractive index and is refracted by a different amount. Violet slows most and bends most.', ms: 8000, view: BENCHV, point: 'book', panel: 'notebook', beats: [{ at: 1500, run: (c) => c.g.update((x) => ({ ...x, written: { conclusion: 'Each colour has a different refractive index (speed) in glass, so each is refracted by a different amount: violet most, red least.', precautions: 'The room was darkened and a narrow slit was used.' } })) }] },
  ];
}

export function demoScript(task: PinsTask, precautions: string[]): DemoStep[] {
  const prec = precautions.slice(0, 2).join(' ');
  if (task === 'MIRROR' || task === 'PRISM') return boardScript(task, prec);
  if (task === 'DEPTH') return depthScript(prec);
  return dispScript();
}

/** The worked calculation shown with the last step. */
export function demoCalculation(task: PinsTask, s: PhyPinsState): string[] {
  if (task === 'MIRROR' && s.line) return [`Two points on the line: (${s.line.x1}, ${s.line.y1}) and (${s.line.x2}, ${s.line.y2}).`, `Slope = Δr ÷ Δi = ${slopeOf(s)} ≈ 1, so r = i.`];
  if (task === 'PRISM' && s.answers.dmin.value) return [`Dₘ = ${s.answers.dmin.value}° (lowest point of the curve).`, `n = sin((60° + ${s.answers.dmin.value}°)/2) ÷ sin 30° = ${s.answers.n.value}.`];
  if (task === 'DEPTH' && s.line) return [`Slope = Δ(real) ÷ Δ(apparent) = ${slopeOf(s)}.`, `n = real ÷ apparent = ${slopeOf(s)} (no unit).`];
  if (task === 'DISP' && s.answers.dred.value) return [`D(red) = ${s.answers.dred.value}°, D(violet) = ${s.answers.dviol.value}°.`, `Angular dispersion = ${s.answers.disp.value}°.`, `n(red) = sin((60° + ${s.answers.dred.value}°)/2) ÷ sin 30° = ${s.answers.n.value}.`];
  return [];
}
export { makeOps };
