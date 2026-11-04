import { amRun, chemPrepVariant, dsRun, stdOver, stdRun, type ChemPrepState, type ChemPrepVariant } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { prepBenchSteps, prepRecordSteps } from '../steps';
import { PREP_APPARATUS, neededFor, type PrepScene } from './scene-state';

/**
 * Guided mode (practice only): the WAEC routine as a checklist (the same
 * milestones as the 2D hint), with gentle corrections for the classic
 * mistakes, each with the reason an examiner would give.
 */

/** What each mistake (action:item) teaches. */
export const PREP_MISTAKES: Record<string, { title: string; why: string; focus: string }> = {
  'TIP:FLASK': { title: 'Dissolve it in a beaker first.', why: 'In the narrow flask the solid may not all dissolve and you cannot stir it. Dissolve in about 100 cm³ in a beaker, then transfer with rinsings.', focus: 'flask' },
  'PIPETTE:MOUTH': { title: 'Never pipette by mouth.', why: 'You could swallow the solution. Always use the pipette filler.', focus: 'pipette' },
  'STOCK:CONC': { title: 'Dilute it with plenty of water.', why: 'Undiluted, the mixture is so deep red that a shift in either direction cannot be seen. A few drops of each in about 20 cm³ of water gives a pale red you can compare.', focus: 'rack' },
  'THERMO:LIQUID': { title: 'The bulb goes level with the side arm.', why: 'In the boiling salty liquid it reads the liquid, not the vapour that distils over — and salty water boils above 100 °C.', focus: 'thermometer' },
  'THERMO:TOP': { title: 'Lower the bulb to the side arm.', why: 'Above the side arm the vapour cools before it reaches the bulb, so the reading is too low.', focus: 'thermometer' },
  'CONDENSER:TOP': { title: 'Water in at the bottom, out at the top.', why: 'From the top, the jacket never fills, so cooling is poor and steam escapes.', focus: 'rig' },
  'RECEIVER:STOPPERED': { title: 'Never heat a closed apparatus.', why: 'Pressure builds up as it is heated: the bung can blow out or the glass burst. Leave the receiver open.', focus: 'receiver' },
  'ADD:CL2OLD': { title: 'Use the fresh chlorine water.', why: 'Old chlorine water has lost most of its chlorine (it escapes and reacts with water in light), so the colour changes are faint.', focus: 'reagents' },
  'CLAMP:UP': { title: 'Clamp the tube with its mouth sloping down.', why: 'Water formed in the reaction condenses near the mouth; if it runs back on to the hot glass the tube cracks.', focus: 'gasRig' },
  'DRYER:H2SO4': { title: 'Not concentrated sulphuric acid.', why: 'Ammonia is a base: it reacts with H₂SO₄ to form ammonium sulphate, so no ammonia comes through. Use quicklime (CaO).', focus: 'gasRig' },
  'DRYER:CACL2': { title: 'Not calcium chloride.', why: 'Ammonia combines with CaCl₂ (forming CaCl₂·8NH₃). Use quicklime (CaO).', focus: 'gasRig' },
  'COLLECT:DOWNWARD': { title: 'Ammonia is less dense than air.', why: 'In an upright jar it rises out. Collect it by upward delivery in an inverted jar.', focus: 'jar' },
  'COLLECT:WATER': { title: 'Never collect ammonia over water.', why: 'It is very soluble in water: it dissolves instead of filling the jar.', focus: 'jar' },
};

export function prepGuideSteps(v: ChemPrepVariant, s: ChemPrepState, scene: PrepScene, mode: CameraMode): GuideStep[] {
  const task = s.task ?? v.task;
  const missing = neededFor(task).filter((a) => !scene.collected.has(a.id));
  const steps: GuideStep[] = [
    { id: 'safety', label: 'Put on your lab coat and goggles', target: !scene.coat ? 'coat' : !scene.goggles ? 'goggles' : null, why: task === 'AMMONIA' ? 'Ammonia and conc. HCl irritate the eyes.' : task === 'HALOGEN' ? 'Halogen water splashes can burn the eyes.' : 'Solutions can splash into your eyes.', done: scene.coat && scene.goggles },
    { id: 'collect', label: `Collect your apparatus${missing.length ? ` (${missing.length} to go)` : ''}`, target: 'cupboard', why: neededFor(task).map((a) => a.label).join('; ') + '.', done: !missing.length },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front.', done: mode !== 'walk' || s.events.length > 0 },
  ];
  for (const x of prepBenchSteps(v, s)) steps.push({ id: x.id, label: x.label, target: x.target, why: x.why, done: x.done, group: x.group });
  for (const x of prepRecordSteps(v, s)) steps.push({ id: x.id, label: x.label, target: x.target, why: x.why, done: x.done, group: x.group });
  steps.push({ id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false });
  return steps;
}

/** A gentle correction for a step just recorded in the log (null: nothing wrong). */
export function prepCorrection(a: string, s: ChemPrepState, scene: PrepScene, seed: number): Correction | null {
  const [verb, act, item] = a.split(':') as [string, string | undefined, string | undefined];
  const task = s.task ?? 'STANDARD';
  if (verb === 'collect' && act && !PREP_APPARATUS.find((x) => x.id === act)?.for.includes(task)) return { title: 'That is not needed for this practical.', why: 'Only take what the practical needs; you can put it back from your bench.' };
  if (verb !== 'ev' || !act) return null;
  const key = `${act}:${(item ?? '').split('#')[0]}`;
  const m = PREP_MISTAKES[key];
  if (m) return m;
  const v = chemPrepVariant(seed, task);
  if (/^(HEAT|HEAT_DISH|HEAT_GAS|BATH)$/.test(act) && !scene.goggles) return { title: 'Goggles on before heating.', why: 'Hot liquids and gases can spit or splash: protect your eyes.', focus: 'bench' };
  if (task === 'STANDARD' && (act === 'FILL' || act === 'DROP')) {
    const r = stdRun(v, s.events);
    const f = r.pipetted ? r.f2 : r.f1;
    if (stdOver(f)) return { title: 'It has gone past the mark.', why: act === 'FILL' ? 'Once the level is near the mark, add water only with the dropper, a drop at a time. An overshot flask cannot be used: pour it away and start again.' : 'Check the meniscus at eye level after every few drops. An overshot flask cannot be used: pour it away and start again.', focus: r.pipetted ? 'flask2' : 'flask' };
  }
  if (task === 'DISTIL' && act === 'HEAT_DISH') {
    const r = dsRun(v, s.events);
    if (r.spat) return { title: 'It is spitting: finish on the water bath.', why: 'Near dryness, direct heat makes the salt spit out of the dish and you lose some. Move the dish to the water bath for gentle heating.', focus: 'dish' };
  }
  if (task === 'DISTIL' && act === 'HEAT') {
    const r = dsRun(v, s.events);
    if (r.bumps === 1) return { title: 'It is bumping: add anti-bumping granules.', why: 'Without granules the liquid superheats and boils in violent bursts. (Let it cool before you add them.)', focus: 'rig' };
    if (r.boiledDry) return { title: 'Turn off the heat!', why: 'The flask is nearly dry: the salt cakes on the glass and it can crack.', focus: 'rig' };
  }
  if (task === 'AMMONIA' && act === 'HEAT_GAS' && amRun(v, s.events).cracked) return { title: 'The tube has cracked.', why: 'With the mouth up, the water formed ran back on to the hot glass. Always clamp it sloping slightly downwards.', focus: 'gasRig' };
  return null;
}
