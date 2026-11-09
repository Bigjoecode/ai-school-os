import { MAINT_ACTIONS, type CompCodeState, type MaintAction } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import type { Comp } from '../actions';
import { maintStatus } from '../bench';
import { usesComputer } from './bench';
import { COMP_MISTAKES } from './guide';
import { COMP_APPARATUS, COMP_APPARATUS_LABEL, neededFor, type CompApparatusId, type CompScene } from './scene-state';

/**
 * What can be done with each object on the bench. Every action is a button; a
 * blocked one says why. The 3D-only steps (power, tools) are log notes without
 * marks: the marked work happens on the screen overlay or as the same actions
 * as the 2D lab.
 */

export interface CompCtx {
  o: Comp;
  s: CompCodeState;
  scene: CompScene;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
  screen: () => void;
  practice: boolean;
}
const setView = (p: Parameters<ReturnType<typeof useLabView.getState>['set']>[0]) => useLabView.getState().set(p);
const lc = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);

const MAINT_NEEDS: Partial<Record<MaintAction['a'], CompApparatusId>> = { WIPE: 'cloth', CASE: 'cloth', KEYBRUSH: 'brush', KEYCLEAN: 'alcohol', BLOW: 'blower', LENS: 'lensDisc' };

function maintAction(ctx: CompCtx, a: MaintAction): LabAction {
  const app = MAINT_NEEDS[a.a];
  const need = app && !ctx.scene.collected.has(app) ? `Get the ${lc(COMP_APPARATUS_LABEL[app])} from the cupboard first.` : undefined;
  return {
    key: `${a.a}-${a.x}`,
    label: a.label,
    blocked: need ?? ctx.o.blocked(a.a, a.x),
    run: () => {
      if (!ctx.o.act(a.a, a.x)) return;
      const m = COMP_MISTAKES[`ev:${a.a}:${a.x}`];
      if (m && ctx.practice) notify(m.title, 'danger', 3200);
      play(m ? 'oops' : 'tick');
      setView({ selected: null });
    },
  };
}
const maintOn = (ctx: CompCtx, obj: MaintAction['obj']) => MAINT_ACTIONS.filter((a) => a.obj === obj).map((a) => maintAction(ctx, a));

const powerOn = (ctx: CompCtx): LabAction => ({
  key: 'power',
  label: 'Switch on the UPS, the monitor, then the system unit',
  tone: 'brand',
  run: () => {
    ctx.o.note('power:on');
    play('tick');
    setView({ selected: null });
  },
});
const useIt = (ctx: CompCtx): LabAction => ({
  key: 'use',
  label: ctx.o.task === 'CRIMP' ? 'Work on the cable' : ctx.o.task === 'MAINT' ? 'Use the list of jobs' : 'Use the computer',
  tone: 'brand',
  blocked: usesComputer(ctx.o.task) && !ctx.scene.power ? 'Switch the computer on first (tap the system unit).' : undefined,
  run: ctx.screen,
});

export function compObjectPanel(id: string, ctx: CompCtx): ObjectPanel | null {
  const task = ctx.o.task;
  const maint = task === 'MAINT';
  if (id.startsWith('cup:')) {
    const a = id.slice(4) as CompApparatusId;
    return { title: COMP_APPARATUS_LABEL[a], info: 'In the equipment cupboard.', actions: [{ key: 'take', label: 'Take to my bench', tone: 'brand', run: () => (ctx.o.note(`collect:${a}`), play('clink'), setView({ selected: null })) }] };
  }
  switch (id) {
    case 'cupboard':
      return { title: 'Equipment cupboard', info: 'Choose what you need.', actions: [{ key: 'list', label: 'Choose equipment…', tone: 'brand', run: () => ctx.open('cupboard') }] };
    case 'mybench':
      return { title: 'Your workstation', info: 'Your computer, the task card and your notebook are here.', actions: useLabView.getState().mode === 'walk' ? [{ key: 'sit', label: 'Work at my bench', tone: 'brand', run: () => setView({ mode: 'bench', focus: 'bench', selected: null }) }] : [{ key: 'stand', label: 'Stand up and walk', run: () => setView({ mode: 'walk', selected: null }) }] };
    case 'card':
      return { title: 'Task card', actions: [{ key: 'read', label: 'Read the task card', tone: 'brand', run: () => ctx.open('task') }] };
    case 'book':
      return { title: 'Practical notebook', info: 'Your results, tables and answers.', actions: [{ key: 'open', label: 'Open the notebook', tone: 'brand', run: () => ctx.open('notebook') }] };
    case 'monitor':
      return { title: 'Monitor', info: maint ? maintStatus(ctx.o)[0] : undefined, actions: maint ? [...maintOn(ctx, 'monitor'), ...maintOn(ctx, 'screen'), useIt(ctx)] : task === 'CRIMP' ? [useIt(ctx)] : [useIt(ctx)] };
    case 'sysunit':
      return { title: 'System unit', actions: maint ? maintOn(ctx, 'sysunit') : usesComputer(task) && !ctx.scene.power ? [powerOn(ctx)] : [useIt(ctx)] };
    case 'keyboard':
    case 'mouse':
      return { title: id === 'mouse' ? 'Mouse' : 'Keyboard', actions: maint ? maintOn(ctx, 'keyboard') : [useIt(ctx)] };
    case 'dvd':
      return { title: 'DVD drive', actions: maint ? maintOn(ctx, 'dvd') : [] };
    case 'ups':
      return { title: 'UPS', info: 'Keeps the computer running through a power cut, long enough to save and shut down.', actions: maint ? maintOn(ctx, 'ups') : usesComputer(task) && !ctx.scene.power ? [powerOn(ctx)] : [] };
    case 'crimper':
    case 'cable':
    case 'tester':
      return { title: COMP_APPARATUS_LABEL[id], actions: [useIt(ctx)] };
    case 'whiteboard':
      return { title: 'Whiteboard', info: 'Today’s practical and its key points.', actions: [] };
    case 'desk':
      return { title: 'Teacher’s desk', info: 'Tap Mr Bayo for help with the next step.', actions: [] };
    case 'extinguisher':
      return { title: 'CO₂ extinguisher', info: 'Never use water on electrical fires.', actions: [] };
    case 'firstaid':
      return { title: 'First-aid box', info: 'Report every cut or shock to the teacher.', actions: [] };
    default: {
      const extra = COMP_APPARATUS.find((a) => a.id === id);
      if (extra) return { title: extra.label, info: extra.for.includes(task) ? undefined : 'Not needed for this practical.', actions: [{ key: 'return', label: 'Put back in the cupboard', run: () => (ctx.o.note(`return:${extra.id}`), setView({ selected: null })) }] };
      return null;
    }
  }
}

/** The hint for practice mode with guided mode off (the 2D hint, plus the 3D set-up steps first). */
export function compHint3d(ctx: CompCtx, plain: string): string {
  const task = ctx.o.task;
  const missing = neededFor(task).filter((a) => !ctx.scene.collected.has(a.id));
  if (missing.length) return `Collect from the cupboard: ${missing.map((a) => lc(a.label)).join(', ')}.`;
  if (usesComputer(task) && !ctx.scene.power) return 'Switch on the computer: tap the system unit.';
  return plain;
}
