import { FLOAT_CARD, SAND_CARD, type BottleSnap, type PhyDensityState, type PhyDensityVariant } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { APPARATUS_LABEL, neededFor, PLACE_LABEL, PLACEABLE, type SceneState } from './scene-state';

/**
 * Guided mode (practice only): each density practical as a checklist with the
 * reason for every step, and gentle corrections for mistakes just made. The
 * guide never says what a scale reads.
 */

const cell = (s: PhyDensityState, id: string) => !!(s.cells[id] ?? '').trim();
const ans = (s: PhyDensityState, ...ids: (keyof PhyDensityState['answers'])[]) => ids.every((id) => !!s.answers[id].value.trim());

export function guideSteps(s: PhyDensityState, scene: SceneState, mode: CameraMode, pan: string | null): GuideStep[] {
  const task = s.task ?? 'CAL';
  const steps: GuideStep[] = [
    { id: 'collect', label: `Collect your apparatus${scene.missing.length ? ` (${scene.missing.length} to go)` : ''}`, target: 'cupboard', why: neededFor(s).map((id) => APPARATUS_LABEL[id]).join('; ') + '.', done: scene.ready },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front.', done: mode !== 'walk' || scene.placed.size > 0 || s.log.length > 8 },
  ];
  for (const id of PLACEABLE[task]) steps.push({ id: `place-${id}`, label: PLACE_LABEL[id]!, target: id, why: id === 'sbalance' ? 'Firmly clamped so it hangs vertically over the can.' : id === 'eureka' ? 'Its spout over the edge of the block so a beaker fits under it.' : 'Upright on the bench, away from the edge.', done: scene.placed.has(id), group: 'Set up' });
  if (task === 'CAL') {
    const vz = s.cal.some((r) => r.tool === 'V' && !r.obj);
    const mz = s.cal.some((r) => r.tool === 'M' && !r.obj);
    const cp = new Set(s.cal.filter((r) => r.tool === 'V' && r.obj === 'cyl').map((r) => r.pos)).size;
    const bp = new Set(s.cal.filter((r) => r.tool === 'M' && r.obj === 'ball').map((r) => r.pos)).size;
    steps.push(
      { id: 'vtool', label: 'Pick up the vernier calipers', target: 'vernier', why: 'It reads to 0.01 cm.', done: s.tool === 'V' || vz, group: 'Vernier' },
      { id: 'vzero', label: 'Close the jaws on nothing and read the zero error', target: 'vernier', why: 'If the vernier’s 0 is not on the main scale’s 0 every reading is off by that much. Look square on; note the sign.', done: vz, group: 'Vernier' },
      { id: 'cyl', label: `Measure the cylinder at three places (${cp}/3)`, target: 'obj-cyl', why: 'Close the jaws gently, read main scale + coinciding vernier line × 0.01 cm, take the reading, then turn it for the next place.', done: cp >= 3, group: 'Vernier' },
      { id: 'mtool', label: 'Pick up the micrometer', target: 'micrometer', why: 'It reads to 0.01 mm.', done: s.tool === 'M' || mz, group: 'Micrometer' },
      { id: 'mzero', label: 'Close it with the ratchet on nothing: the zero error', target: 'micrometer', why: 'Always the ratchet: forcing the thimble squeezes and strains the screw.', done: mz, group: 'Micrometer' },
      { id: 'ball', label: `Measure the ball bearing in three orientations (${bp}/3)`, target: 'obj-ball', why: 'Sleeve (whole and half mm) + thimble division × 0.01 mm.', done: bp >= 3, group: 'Micrometer' },
      { id: 'rows', label: 'Write the zero errors and readings, and the means', target: 'book', why: 'Readings to 2 decimal places.', done: ['zv', 'c1', 'c2', 'c3', 'cm', 'zm', 'b1', 'b2', 'b3', 'bm'].every((id) => cell(s, id)) },
      { id: 'calc', label: 'Correct the means and work out V = (4/3)πr³', target: 'book', why: 'Corrected = mean − zero error.', done: ans(s, 'dcyl', 'dball', 'vol') },
    );
  } else if (task === 'ARCH') {
    const has = (w: string) => s.sb.some((r) => r.where === w && r.depth !== 'part');
    const beakerE = s.weighs.some((x) => x.item === 'beaker' && x.water === 0);
    const beakerF = s.weighs.some((x) => x.item === 'beaker' && x.water > 0);
    steps.push(
      { id: 'zero', label: 'Check and adjust the spring balance’s zero', target: 'sbalance', why: 'With nothing hanging it must read 0, or every weight is off.', done: s.zeroed, group: 'In air' },
      { id: 'hang', label: 'Hang the stone and read W₁', target: 'sbalance', why: 'Eye level with the pointer, to 0.05 N.', done: has('air'), group: 'In air' },
      { id: 'beaker', label: 'Weigh the empty catch beaker', target: 'balance', why: 'Slide the riders until the pointer rests on zero.', done: beakerE, group: 'Catch beaker' },
      { id: 'fill', label: 'Fill the eureka can to the spout; let it stop dripping', target: 'eureka', why: 'Then every cm³ the stone displaces runs out of the spout.', done: s.deficit === 0 || has('water'), group: 'In water' },
      { id: 'under', label: 'Put the catch beaker under the spout', target: 'catch', why: 'After the dripping has stopped.', done: s.catchUnder || beakerF, group: 'In water' },
      { id: 'lower', label: 'Lower the stone fully in, not touching the can', target: 'stone', why: 'A stone resting on the can is partly held up by it.', done: (s.where === 'water' && s.depth === 'full') || has('water'), group: 'In water' },
      { id: 'bubbles', label: 'Shake off any air bubbles, then read W₂', target: 'stone', why: 'Bubbles add upthrust.', done: has('water'), group: 'In water' },
      { id: 'weighw', label: 'Weigh the beaker with the displaced water', target: 'balance', why: 'm₂ − m₁ is the mass of water displaced.', done: beakerF, group: 'In water' },
      { id: 'dry', label: 'Raise the stone and dry it', target: 'tissue', why: 'Water on it would dilute the salt solution.', done: has('salt') || (s.where === 'air' && !s.wet && has('water')), group: 'Salt solution' },
      { id: 'salt', label: 'Lower it fully into the salt solution and read W₃', target: 'salt', why: 'Not touching the beaker, no bubbles.', done: has('salt'), group: 'Salt solution' },
      { id: 'rows', label: 'Write W₁, W₂, W₃ and the beaker’s masses', target: 'book', why: 'Weights to 0.05 N, masses to 0.1 g.', done: ['w1', 'w2', 'w3', 'mb', 'mbw'].every((id) => cell(s, id)) },
      { id: 'calc', label: 'Upthrust, weight of water displaced and the two relative densities', target: 'book', why: 'RD = W₁/(W₁ − W₂); RD of the liquid = (W₁ − W₃)/(W₁ − W₂). No units.', done: ans(s, 'up', 'wdisp', 'rds', 'rdl') },
    );
  } else if (task === 'FLOAT') {
    const ext = s.cal.some((r) => r.tool === 'V' && r.obj === 'tube' && !r.inside);
    const loads = new Set(s.depths.map((d) => d.load));
    const next = FLOAT_CARD.find((l) => !loads.has(l));
    steps.push(
      { id: 'vzero', label: 'Vernier: read its zero error', target: 'vernier', why: 'Close the jaws on nothing.', done: s.cal.some((r) => r.tool === 'V' && !r.obj), group: 'Diameter' },
      { id: 'ext', label: 'Measure the tube’s external diameter (outside jaws)', target: 'vernier', why: 'The water is displaced by the whole tube: use the outside, not the inside diameter.', done: ext, group: 'Diameter' },
      { id: 'weigh', label: 'Weigh the empty tube', target: 'balance', why: 'Its mass is what the intercept will check.', done: s.weighs.some((w) => w.item === 'tube') || pan === 'tube', group: 'Mass' },
    );
    if (next !== undefined)
      steps.push(
        { id: 'load', label: `Put ${next * 10} g of lead shot in the tube`, target: 'testtube', why: 'In 10 g scoops, spread evenly on the bottom.', done: s.load === next, group: `Load ${next * 10} g` },
        { id: 'float', label: 'Float the tube upright, free of the sides', target: 'cylinder', why: 'A tube touching the wall is held by friction.', done: s.floating && !s.touching && s.load === next, group: `Load ${next * 10} g` },
        { id: 'take', label: 'Read h at eye level at the flat water surface; take it', target: 'cylinder', why: 'Not the meniscus that climbs the glass. To 0.1 cm.', done: false, group: `Load ${next * 10} g` },
      );
    steps.push(
      { id: 'rows', label: 'Fill in D, the tube’s mass, and m and h for every load', target: 'book', why: 'm = 10, 20, 30 … g.', done: cell(s, 'D') && cell(s, 'mt') && s.float.length >= 5 && s.float.every((r) => r.m.trim() && r.h.trim()) },
      { id: 'graph', label: 'Plot h against m and draw your best line', target: 'book', why: 'h = m/(ρA) + M/(ρA): a straight line with an intercept.', done: !!s.line },
      { id: 'calc', label: 'A, the slope, ρ = 1/(A × slope) and the tube’s mass', target: 'book', why: 'Tube mass = ρA × intercept.', done: ans(s, 'area', 'slope', 'rho', 'mtube') },
    );
  } else {
    const grains = s.sample === 'grains';
    const has = (p: (b: BottleSnap) => boolean) => s.weighs.some((w) => w.item === 'bottle' && w.bottle && p(w.bottle));
    steps.push(
      { id: 'temp', label: 'Read the room temperature', target: 'thermometer', why: 'Water’s density depends on it.', done: s.tempRead },
      { id: 'm1', label: 'Weigh the clean, dry, empty bottle with its stopper (m₁)', target: 'balance', why: 'Stopper in: the same bottle every time.', done: has((b) => b.sand === 0 && b.fill === 'none'), group: 'm₁' },
    );
    const fullSteps = (id: string, label: string, what: string, done: boolean, group: string): GuideStep[] => [
      { id: `${id}-fill`, label: `${label}`, target: 'bottle', why: what, done, group },
      { id: `${id}-cap`, label: 'Top up to the brim, tap out any bubble, insert the stopper', target: 'bottle', why: 'The excess leaves through the capillary: the bottle then holds exactly the same volume.', done, group },
      { id: `${id}-wipe`, label: 'Wipe the outside dry and weigh', target: 'balance', why: 'Drops on the outside add mass.', done, group },
    ];
    if (grains)
      steps.push(
        { id: 'sand', label: `Add ${SAND_CARD} scoops of sand and weigh (m₂)`, target: 'sand', why: 'Into the dry bottle.', done: has((b) => b.sand > 0 && b.fill === 'none'), group: 'm₂' },
        ...fullSteps('m3', 'Fill up with water over the sand', 'Stir or tap so no air stays among the grains.', has((b) => b.sand > 0 && b.fill === 'water'), 'm₃'),
        ...fullSteps('m4', 'Empty, rinse, fill with water only', 'All the sand out first.', has((b) => b.sand === 0 && b.fill === 'water'), 'm₄'),
      );
    else
      steps.push(
        ...fullSteps('m2', 'Fill the bottle with water', 'Distilled water.', has((b) => b.fill === 'water'), 'm₂'),
        { id: 'dry', label: 'Empty it and dry it thoroughly (or rinse with the liquid)', target: 'bottle', why: 'Water left inside would mix with the liquid.', done: has((b) => b.fill === 'liquid') || (s.bottle.fill === 'liquid' && s.bottle.film !== 'water') || (s.bottle.fill === 'none' && s.bottle.film !== 'water' && has((b) => b.fill === 'water')), group: 'm₃' },
        ...fullSteps('m3', 'Fill it with the liquid', 'No naked flames: kerosene is flammable.', has((b) => b.fill === 'liquid'), 'm₃'),
      );
    steps.push(
      { id: 'rows', label: 'Write the masses and the temperature', target: 'book', why: 'To 0.1 g.', done: (grains ? ['m1', 'm2', 'm3', 'm4'] : ['m1', 'm2', 'm3']).every((id) => cell(s, id)) && cell(s, 'T') },
      { id: 'calc', label: 'Mass of water, of the sample, RD and the density', target: 'book', why: grains ? 'RD = (m₂ − m₁)/[(m₄ − m₁) − (m₃ − m₂)].' : 'RD = (m₃ − m₁)/(m₂ − m₁); density = RD × density of water.', done: ans(s, 'mw', 'ml', 'rd', 'rho') },
    );
  }
  steps.push(
    { id: 'written', label: 'Write two precautions', target: 'book', why: 'E.g. zero error corrected; eye square on to the scale; not touching the container; filled to the capillary; wiped dry.', done: !!s.written.precautions.trim() },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  );
  return steps;
}

/** A gentle correction for a step just recorded (null: nothing wrong). */
export function correctionFor(a: string, s: PhyDensityState, _v: PhyDensityVariant): Correction | null {
  const p = a.split(':');
  const [verb, arg] = p as [string, string | undefined];
  const need = neededFor(s);
  if (verb === 'collect' && arg && !need.includes(arg as never) && APPARATUS_LABEL[arg as keyof typeof APPARATUS_LABEL]) return { title: `The ${APPARATUS_LABEL[arg as keyof typeof APPARATUS_LABEL].toLowerCase()} is not needed here.`, why: `This practical needs: ${need.map((id) => APPARATUS_LABEL[id].toLowerCase()).join('; ')}.` };
  if (a.includes(':parallax')) return { title: 'Your eye was not square on to the scale.', why: 'Looking from one side makes the line you read shift (parallax). Put your eye level with / square on to the scale, then take the reading again.', focus: s.task === 'ARCH' ? 'sbalance' : s.task === 'FLOAT' && s.floating ? 'cylinder' : s.tool === 'M' ? 'micrometer' : 'vernier' };
  if (verb === 'close' && arg === 'thimble') return { title: 'Use the ratchet.', why: 'Screwing the thimble hard squeezes the object and strains the screw: the reading comes out low. Open it and close it with the ratchet until it clicks.', focus: 'micrometer' };
  if (verb === 'read' && arg === 'V' && p[2] === 'cyl' && !s.cal.some((r) => r.tool === 'V' && !r.obj)) return { title: 'Check the zero error first.', why: 'Close the jaws on nothing and read where the vernier zero sits: you subtract it from every reading.', focus: 'vernier' };
  if (verb === 'sb' && arg === 'hang' && !s.zeroed) return { title: 'Check the zero first.', why: 'Take the stone off and see what the balance reads with nothing hanging; adjust it to zero.', focus: 'sbalance' };
  if (verb === 'sb' && arg === 'read' && p.includes('bubbles')) return { title: 'Bubbles on the stone.', why: 'Air bubbles clinging to the stone add upthrust, so W₂ reads low. Shake the stone gently, then read again.', focus: 'stone' };
  if (verb === 'sb' && arg === 'read' && p[3] === 'touch') return { title: 'The stone is resting on the container.', why: 'Then the container holds up part of its weight. Raise it a little so it hangs free, fully immersed.', focus: 'stone' };
  if (verb === 'sb' && arg === 'read' && p[3] === 'part') return { title: 'Only half immersed.', why: 'W₂ and W₃ need the stone completely under the surface.', focus: 'stone' };
  if (verb === 'sb' && arg === 'lower' && p[2] === 'salt' && s.wet) return { title: 'Dry the stone first.', why: 'Water carried on the stone dilutes the salt solution. Raise it, dry it with tissue, then lower it in.', focus: 'tissue' };
  if (verb === 'sb' && arg === 'lower' && p[2] === 'water' && s.spill) return { title: 'Water ran onto the bench.', why: 'The displaced water should run into the catch beaker: put it under the spout before lowering the stone. Wipe the spill up — wet floors are slippery.', focus: 'catch' };
  if (verb === 'can' && p.includes('into-beaker')) return { title: 'The beaker was under the spout while you filled the can.', why: 'That water is not displaced by the stone. Empty and dry the beaker, wait for the can to stop dripping, then put it under the spout.', focus: 'catch' };
  if (verb === 'float' && arg === 'sunk') return { title: 'The tube sank.', why: 'Too much lead shot: it displaced all the water it could. Lift it out, take some shot out, and stay below about 60 g.', focus: 'testtube' };
  if (verb === 'float' && arg === 'read' && p.includes('touching')) return { title: 'The tube was touching the side.', why: 'Friction with the wall holds it up. Free it so it floats in the middle, then read again.', focus: 'cylinder' };
  if (verb === 'hold' && arg === 'tube' && p[2] === 'inside' && s.task === 'FLOAT') return { title: 'Inside jaws: the internal diameter.', why: 'The water is displaced by the whole tube, glass and all: use the external diameter (outside jaws) for A.', focus: 'vernier' };
  if (verb === 'bottle' && arg === 'stopper' && p[2] === 'not-full') return { title: 'Not full to the brim.', why: 'Top the bottle up with the dropper before stoppering, so the liquid rises right up the capillary.', focus: 'bottle' };
  if (verb === 'bottle' && arg === 'fill' && s.bottle.film !== 'none' && s.bottle.film !== p[2]) return { title: 'The bottle was still wet inside.', why: 'The film of the last liquid mixes with this one. Empty it, dry it (or rinse it with the new liquid), then fill.', focus: 'bottle' };
  if (verb === 'weigh' && arg === 'bottle') {
    const b = s.weighs[s.weighs.length - 1]?.bottle;
    if (b && b.fill !== 'none' && b.outsideWet) return { title: 'The bottle was wet outside.', why: 'Wipe it dry before weighing: drops on the outside add mass.', focus: 'tissue' };
    if (b && b.fill !== 'none' && b.bubble) return { title: 'An air bubble was trapped.', why: 'Tap it out and top up, or the bottle holds less liquid.', focus: 'bottle' };
    if (b && b.fill !== 'none' && !b.toCap) return { title: 'Not filled to the capillary.', why: 'Fill to the brim and push the stopper in so the excess comes out of the capillary.', focus: 'bottle' };
  }
  return null;
}
