import { emptySpecimenEntry, type BioSpecimensState, type BioSpecimensVariant } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView, type CameraMode } from '../../../lab3d-kit/store';
import { bioRoomPanel, washHands } from '../../bio-common/lab3d/common';
import { APPARATUS_LABEL, DISTRACTORS, NEEDED, useBench, type ApparatusId, type SceneState } from './scene-state';
import type { SpecUpdate } from './sheet';

/**
 * The specimen bench's object menus, guided steps, corrections and hint.
 * Marked changes are the 2D lab's (names, groups, labels, the hand-lens
 * examination, the measurement …); the 3D-only steps (coat, gloves,
 * collecting, measuring against the ruler, hand washing) go to the log.
 */

export interface Spec {
  v: BioSpecimensVariant;
  state: BioSpecimensState;
  update: SpecUpdate;
  note: (a: string) => void;
}
export interface ActionCtx extends Spec {
  scene: SceneState;
  open: (w: 'notebook' | 'task' | 'cupboard') => void;
  /** The close-up views. */
  lens: (i: number) => void;
  ruler: () => void;
}
const view = () => useLabView.getState();

/** Examining with the hand lens: the 2D lab's `examined` (and its log entry). */
export function examine(c: Spec, letter: string) {
  if (!c.state.examined.includes(letter)) c.update((s) => ({ ...s, examined: [...s.examined, letter].slice(0, 5) }), `lens:${letter}`);
}

function returnAction(c: ActionCtx, id: ApparatusId): LabAction {
  return { key: 'return', label: 'Put back in the cupboard', run: () => (c.note(`return:${id}`), view().set({ selected: null })) };
}

export function objectPanel(id: string, c: ActionCtx): ObjectPanel | null {
  const { v, state, scene } = c;
  const room = bioRoomPanel(id, { coat: scene.coat, goggles: scene.goggles, note: c.note, open: c.open, benchInfo: `Bench 2: specimens ${v.specimens.map((x) => x.letter).join(', ')}, gloves, the task card and your answer sheet are here.`, whiteboard: `Today: ${v.info.title.toLowerCase()}. Examine each specimen with the hand lens; name it, classify it and label it.` });
  if (room) {
    if (id === 'handwash' && scene.gloves) return { ...room, actions: [{ key: 'wash', label: 'Wash my hands', blocked: 'Take your gloves off first (and put them in the bin).', run: () => undefined }] };
    return room;
  }
  if (id.startsWith('cup:')) {
    const a = id.slice(4) as ApparatusId;
    return { title: APPARATUS_LABEL[a], info: 'In the cupboard.', actions: [{ key: 'take', label: 'Take to my bench', tone: 'brand', run: () => (c.note(`collect:${a}`), play('clink'), view().set({ selected: null }), notify(`${APPARATUS_LABEL[a]} is on your bench.`, 'success', 1600)) }] };
  }
  if (id.startsWith('spec:')) {
    const letter = id.slice(5);
    const i = v.specimens.findIndex((x) => x.letter === letter);
    if (i < 0) return null;
    const e = state.entries[i] ?? emptySpecimenEntry();
    const measuredOne = i === v.measured;
    return {
      title: `Specimen ${letter}`,
      info: `${state.examined.includes(letter) ? 'Examined' : 'Not examined yet'} · ${e.name.trim() ? `named “${e.name.trim()}”` : 'not named'}${e.classification ? ` · ${e.classification}` : ''}${measuredOne ? ' · this is the one to measure' : ''}`,
      actions: [
        { key: 'lens', label: 'Examine with the hand lens', tone: 'brand', blocked: !scene.collected.has('lens') ? 'Get the hand lens from the cupboard.' : undefined, run: () => c.lens(i) },
        ...(measuredOne ? [{ key: 'ruler', label: 'Measure with the ruler', tone: 'brand' as const, blocked: !scene.collected.has('ruler') ? 'Get the ruler from the cupboard.' : undefined, run: () => (useBench.setState({ current: i }), c.ruler()) }] : []),
        { key: 'sheet', label: `Record ${letter} on the answer sheet`, run: () => (useBench.setState({ tab: i }), c.open('notebook')) },
      ],
    };
  }
  switch (id) {
    case 'lens':
      return { title: 'Hand lens', info: 'Hold it close to your eye and bring the specimen up until it is sharp.', actions: [{ key: 'use', label: 'Look at the first specimen', tone: 'brand', run: () => c.lens(useBench.getState().current) }, returnAction(c, 'lens')] };
    case 'ruler':
      return { title: '30 cm ruler', info: `Measure specimen ${v.specimens[v.measured]!.letter}: zero at one end, read the other.`, actions: [{ key: 'measure', label: `Measure specimen ${v.specimens[v.measured]!.letter}`, tone: 'brand', run: c.ruler }, returnAction(c, 'ruler')] };
    case 'gloves':
      return scene.gloves
        ? { title: 'Disposable gloves', info: 'You are wearing a pair.', actions: [{ key: 'off', label: 'Take off the gloves (into the bin)', run: () => (c.note('safety-off:gloves'), notify('Gloves off and in the bin. Now wash your hands.', 'info', 1800)) }] }
        : { title: 'Disposable gloves', info: 'Wear them to handle preserved specimens (formalin) and anything from an animal.', actions: [{ key: 'on', label: 'Put on a pair', tone: 'brand', run: () => (c.note('safety:gloves'), view().set({ selected: null }), notify('Gloves on.', 'success', 1400)) }] };
    case 'card':
      return { title: 'Task card', actions: [{ key: 'read', label: 'Read the task card', tone: 'brand', run: () => c.open('task') }] };
    case 'book':
      return { title: 'Answer sheet', info: 'Names, groups, labels, features, functions, the measurement, the comparison and the drawing checklist.', actions: [{ key: 'open', label: 'Open the answer sheet', tone: 'brand', run: () => c.open('notebook') }] };
  }
  const a = id as ApparatusId;
  if (APPARATUS_LABEL[a]) return { title: APPARATUS_LABEL[a], info: DISTRACTORS.includes(a) ? 'Not needed at the specimen bench.' : a === 'board' ? 'For dissecting; today the specimens are already prepared.' : 'Handy for turning specimens over gently.', actions: [returnAction(c, a)] };
  return null;
}

export const washAction = (c: Spec) => () => washHands(c.note);

export function guideSteps(v: BioSpecimensVariant, s: BioSpecimensState, scene: SceneState, mode: CameraMode): GuideStep[] {
  const entry = (i: number) => s.entries[i] ?? emptySpecimenEntry();
  const missing = NEEDED.filter((a) => !scene.collected.has(a));
  const m = v.specimens[v.measured]!;
  const [a, b] = v.compare.map((i) => v.specimens[i]!);
  const steps: GuideStep[] = [
    { id: 'coat', label: 'Put on your lab coat', target: !scene.coat ? 'coat' : null, why: 'Specimens can be wet with preservative or carry microbes.', done: scene.coat },
    { id: 'collect', label: `Collect the hand lens and the ruler${missing.length ? ` (${missing.length} to go)` : ''}`, target: 'cupboard', why: 'The cupboard on the east wall. The specimens are already on your bench.', done: !missing.length },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: `Bench 2, at the front: specimens ${v.specimens.map((x) => x.letter).join(', ')} are on it.`, done: mode !== 'walk' || s.examined.length > 0 },
    { id: 'gloves', label: 'Put on disposable gloves', target: 'gloves', why: 'Preserved specimens are kept in formalin, which is toxic; animal material can carry germs.', done: scene.gloves || scene.washedAtEnd },
  ];
  v.specimens.forEach((sp, i) => {
    const e = entry(i);
    const group = `Specimen ${sp.letter}`;
    steps.push(
      { id: `lens-${sp.letter}`, label: 'Examine it with the hand lens', target: `spec:${sp.letter}`, why: 'Look for its shape, parts, colour, texture and numbers of parts.', done: s.examined.includes(sp.letter), group },
      { id: `name-${sp.letter}`, label: `Name it and give its ${v.info.classify.question.toLowerCase()}`, target: 'book', why: 'One name only: hedging between two names earns nothing.', done: !!e.name.trim() && !!e.classification, group },
      { id: `label-${sp.letter}`, label: 'Label its parts', target: 'book', why: 'Drag each label to the box joined to the part it names.', done: sp.def.parts.every((_, k) => !!e.labels[k]), group },
      { id: `feat-${sp.letter}`, label: 'Write two features and one function', target: 'book', why: 'Features are what you can see; the function or adaptation should be linked to a structure.', done: !!e.features.trim() && !!e.functions.trim(), group },
    );
  });
  steps.push(
    { id: 'measure', label: `Measure ${m.letter} with the ruler`, target: `spec:${m.letter}`, why: 'Line the zero up with one end; read the other end; write the length with its unit (cm or mm).', done: !!s.measure.length.value.trim() && !!s.measure.length.unit.trim() },
    { id: 'mag', label: 'Work out the magnification of your drawing', target: 'book', why: `Magnification = drawing length ÷ actual length, both in the same unit (${v.drawingLength.toFixed(1)} cm drawn). No unit: just ×.`, done: !!s.measure.magnification.value.trim() },
    { id: 'compare', label: `Compare ${a.letter} and ${b.letter}`, target: 'book', why: 'Two similarities, and two differences that state both sides (“A has …, whereas B has …”).', done: !!s.compare.similarities.trim() && !!s.compare.differences.trim() },
    { id: 'drawing', label: 'Tick the good drawing practice', target: 'book', why: 'Clean single lines, ruled label lines that do not cross, labels at the side, a title and the magnification.', done: s.drawing.length > 0 },
    { id: 'gloves-off', label: 'Take off your gloves and wash your hands', target: scene.gloves ? 'gloves' : 'handwash', why: 'Gloves into the bin, then soap and water at the hand-washing point.', done: scene.washedAtEnd },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  );
  return steps;
}

/** A correction for a step just recorded (null: nothing wrong). */
export function correctionFor(a: string, s: BioSpecimensState, scene: SceneState): Correction | null {
  const [verb, arg] = a.split(':') as [string, string | undefined];
  if (verb === 'lens' && !scene.gloves && !scene.washedAtEnd) return { title: 'Put on gloves before handling the specimens.', why: 'Preserved specimens are kept in formalin, which is toxic and irritates the skin; animal specimens can carry germs. The box of gloves is on your bench.', focus: 'bench' };
  if (verb === 'collect' && arg && DISTRACTORS.includes(arg as ApparatusId)) return { title: `The ${APPARATUS_LABEL[arg as ApparatusId].toLowerCase()} is not needed at the specimen bench.`, why: 'Only take what the practical needs: a hand lens and a ruler.' };
  if (verb === 'safety-off' && arg === 'gloves' && s.examined.length === 0) return { title: 'Keep your gloves on while you handle the specimens.', why: 'Take them off at the end, then wash your hands.' };
  return null;
}

/** Method slips in the measurement (watched as it is typed: these fields have no log entry). */
export function measureSlip(s: BioSpecimensState): Correction | null {
  const u = s.measure.magnification.unit.trim().toLowerCase();
  if (u && !['×', 'x', 'times'].includes(u)) return { title: 'A magnification has no unit.', why: 'It is a ratio of two lengths in the same unit, so the units cancel: write it as a number (or with ×), e.g. ×2.5.' };
  if (s.measure.magnification.value.trim() && s.measure.length.value.trim() && !s.measure.length.unit.trim()) return { title: 'Give your length a unit.', why: 'A length means nothing without its unit: write cm or mm beside it.' };
  return null;
}

export function nextHint3d(v: BioSpecimensVariant, s: BioSpecimensState, scene: SceneState): string {
  const entry = (i: number) => s.entries[i] ?? emptySpecimenEntry();
  if (!scene.coat) return 'Put on your lab coat: it hangs on the hooks by the door.';
  const missing = NEEDED.filter((a) => !scene.collected.has(a));
  if (missing.length) return `Collect from the cupboard (east wall): ${missing.map((a) => APPARATUS_LABEL[a].toLowerCase()).join(', ')}.`;
  if (!scene.gloves && !scene.washedAtEnd) return 'Put on a pair of disposable gloves (the box is on your bench).';
  const i = v.specimens.findIndex((x, k) => !s.examined.includes(x.letter) || !entry(k).name.trim() || !entry(k).classification || !entry(k).features.trim());
  if (i >= 0) return s.examined.includes(v.specimens[i]!.letter) ? `Specimen ${v.specimens[i]!.letter}: name it, classify it, label it and state what you observe.` : `Examine specimen ${v.specimens[i]!.letter} with the hand lens.`;
  const m = v.specimens[v.measured]!;
  if (!s.measure.length.value) return `Measure specimen ${m.letter} with the ruler: line up the zero with one end.`;
  const [a, b] = v.compare.map((k) => v.specimens[k]!);
  if (!s.compare.similarities.trim() || !s.compare.differences.trim() || !s.drawing.length) return `Compare ${a.letter} and ${b.letter}, then complete the drawing checklist.`;
  if (!scene.washedAtEnd) return scene.gloves ? 'Take off your gloves, then wash your hands.' : 'Wash your hands at the hand-washing point.';
  return 'Everything is recorded: hand in from the menu.';
}
