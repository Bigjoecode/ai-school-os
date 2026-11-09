import { type CompCodeState, type CompCodeVariant } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { compRecordSteps, compWorkSteps } from '../steps';
import { usesComputer } from './bench';
import { COMP_APPARATUS, neededFor, type CompScene } from './scene-state';

/** Guided mode (practice only): the practical as a checklist, with gentle corrections for the classic mistakes. */

const MISTAKES: Record<string, { title: string; why: string; focus: string }> = {
  'ev:WIPE:WET': { title: 'Never spray water on the screen.', why: 'Water runs behind the panel and damages it. Use a slightly damp microfibre cloth.', focus: 'monitor' },
  'ev:KEYCLEAN:WATER': { title: 'Not under the tap.', why: 'Water stays under the keys and shorts the circuit. Use a cloth moistened with isopropyl alcohol.', focus: 'keyboard' },
  'ev:BLOW:FREE': { title: 'Hold the fans still.', why: 'A fan spun by air acts as a generator, and the fast spin harms the bearings.', focus: 'sysunit' },
  'ev:BACKUP:SAME': { title: 'That is not a backup.', why: 'A copy on the same disk is lost when the disk fails. Copy to an external drive.', focus: 'monitor' },
  'ev:INSERT:A:UP': { title: 'Clip down.', why: 'With the clip up the pin order is mirrored, so pin 1 gets the brown wire.', focus: 'tools' },
  'ev:INSERT:B:UP': { title: 'Clip down.', why: 'With the clip up the pin order is mirrored, so pin 1 gets the brown wire.', focus: 'tools' },
};

export function compGuideSteps(v: CompCodeVariant, s: CompCodeState, scene: CompScene, mode: CameraMode): GuideStep[] {
  const task = s.task ?? v.task;
  const missing = neededFor(task).filter((a) => !scene.collected.has(a.id));
  const steps: GuideStep[] = [];
  if (neededFor(task).length) steps.push({ id: 'collect', label: `Collect your equipment${missing.length ? ` (${missing.length} to go)` : ''}`, target: 'cupboard', why: neededFor(task).map((a) => a.label).join('; ') + '.', done: !missing.length });
  steps.push({ id: 'bench', label: 'Go to your workstation', target: 'mybench', why: 'The front middle bench.', done: mode !== 'walk' || s.events.length > 0 || scene.power });
  if (usesComputer(task)) steps.push({ id: 'power', label: 'Switch on: UPS, monitor, then system unit', target: 'sysunit', why: 'Starting in this order protects the equipment from a power surge.', done: scene.power });
  for (const x of compWorkSteps(v, s)) steps.push({ id: x.id, label: x.label, target: x.target, why: x.why, done: x.done, group: x.group });
  for (const x of compRecordSteps(v, s)) steps.push({ id: x.id, label: x.label, target: x.target, why: x.why, done: x.done, group: x.group });
  steps.push({ id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false });
  return steps;
}

/** A gentle correction for a step just recorded in the log (null: nothing wrong). */
export function compCorrection(a: string, s: CompCodeState): Correction | null {
  const task = s.task ?? 'BASIC_IO';
  const [verb, one] = a.split(':') as [string, string | undefined];
  if (verb === 'collect' && one && !COMP_APPARATUS.find((x) => x.id === one)?.for.includes(task)) return { title: 'That is not needed for this practical.', why: 'Only take what the practical needs; you can put it back from the task card.', focus: 'cupboard' };
  if (verb === 'run') {
    const status = a.split(':')[2];
    if (status === 'limit') return { title: 'Your program never stopped.', why: 'BASIC stopped it for you. Look at the loop: something inside it must change so that the condition can become false.', focus: 'monitor' };
    if (status === 'error') return { title: 'Read the error, then look at that line.', why: 'BASIC tells you what it could not understand and on which line. Common slips: 1/2BH needs * between each pair, and a missing quote or bracket.', focus: 'monitor' };
  }
  if (a.startsWith('ev:')) {
    const parts = a.split(':');
    const m = MISTAKES[`ev:${parts[1]}:${parts[2]}`] ?? MISTAKES[`ev:${parts[1]}:${parts[2]}:${parts[3]}`];
    if (m) return m;
  }
  return null;
}
export { MISTAKES as COMP_MISTAKES };
