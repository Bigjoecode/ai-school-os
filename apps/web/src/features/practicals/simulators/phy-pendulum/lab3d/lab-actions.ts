import { PENDULUM_OSCILLATIONS, PENDULUM_THREAD_MAX, PENDULUM_THREAD_MIN, type PhyPendulumState } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { useLabView } from '../../../lab3d-kit/store';
import type { Pendulum } from '../actions';
import { explainer } from './content';
import { APPARATUS_LABEL, type ApparatusId, type SceneState } from './scene-state';

/** The object menus: every action of the pendulum lab is a button here (drags are extras). */
export interface ActionCtx {
  p: Pendulum;
  s: PhyPendulumState;
  scene: SceneState;
  open: (w: 'notebook' | 'task' | 'cupboard') => void;
}

const clampThread = (x: number) => Math.max(PENDULUM_THREAD_MIN, Math.min(PENDULUM_THREAD_MAX, Math.round(x * 2) / 2));
export const goRead = () => useLabView.getState().set({ mode: 'read', selected: null, eye: 0.03 });

export function watchActions(ctx: ActionCtx): LabAction[] {
  const { p, s } = ctx;
  const sw = p.swing;
  const w = p.watch;
  return [
    w.start === null
      ? { key: 'start', label: 'Start the stopwatch', tone: 'brand', blocked: !sw ? 'Release the bob first, then start the watch as it passes the mark.' : undefined, run: () => (p.startWatch(), play('tick')) }
      : { key: 'stop', label: 'Stop the stopwatch', tone: 'brand', blocked: w.stop !== null ? 'The watch is stopped: record the timing or reset it.' : undefined, run: () => (p.stopWatch(), play('tick')) },
    { key: 'reset', label: 'Reset', blocked: w.start === null ? 'The watch is already at zero.' : undefined, run: () => p.resetWatch() },
    { key: 'record', label: 'Record this timing', blocked: w.stop === null ? 'Start and stop the watch first.' : s.runs.length >= 16 ? 'The table is full.' : undefined, run: () => (p.record(), play('success')) },
  ];
}

export function objectPanel(id: string, ctx: ActionCtx): ObjectPanel | null {
  const { p, s, scene, open } = ctx;
  if (id === 'cupboard') return { title: 'Apparatus cupboard', info: 'Everything for mechanics practicals. Take what the simple pendulum needs.', actions: [{ key: 'choose', label: 'Choose apparatus', tone: 'brand', run: () => open('cupboard') }] };
  if (id.startsWith('cup:')) {
    const a = id.slice(4) as ApparatusId;
    return { title: APPARATUS_LABEL[a], info: 'Drag it onto the tray, or:', actions: [{ key: 'take', label: 'Take it to my bench', tone: 'brand', run: () => (p.note(`collect:${a}`), play('clink'), useLabView.getState().set({ selected: null })) }] };
  }
  if (id === 'mybench') return { title: 'Your bench', info: 'Bench 2: the pendulum hangs over its front edge.', actions: [{ key: 'go', label: 'Go to my bench', tone: 'brand', run: () => useLabView.getState().set({ mode: 'bench', focus: 'pendulum', selected: null }) }] };
  if (id === 'book') return { title: 'Practical notebook', info: 'Your table, graph and answers.', actions: [{ key: 'open', label: 'Open the notebook', tone: 'brand', run: () => open('notebook') }] };
  if (id === 'card') return { title: 'Task card', actions: [{ key: 'open', label: 'Read the task card', tone: 'brand', run: () => open('task') }] };
  if (id === 'window')
    return {
      title: s.shielded ? 'Window (closed)' : 'Window (open)',
      info: s.shielded ? 'No draught: the ceiling fans are off too.' : 'The draught makes the bob wobble and the curtain lift. The fans are running.',
      actions: [{ key: 'win', label: s.shielded ? 'Open the window' : 'Close the window and switch off the fans', tone: s.shielded ? undefined : 'brand', run: () => (p.toggleWindow(), play('creak')) }],
    };
  if (id === 'cork') {
    const at = (d: number): LabAction => ({ key: `t${d}`, label: `${d > 0 ? '+' : '−'}${Math.abs(d)} cm`, blocked: clampThread(s.thread + d) === s.thread ? 'That is as far as it goes.' : undefined, run: () => (p.set({ thread: clampThread(s.thread + d) }), play('creak')) });
    return {
      title: 'Split cork — thread length',
      info: `Thread to the top of the bob: ${s.thread.toFixed(1)} cm. l = thread + radius of the bob (${(p.v.bobDiameter / 2).toFixed(2)} cm).`,
      actions: [at(-1), at(-0.5), at(0.5), at(1), { key: 'read', label: 'Read the metre rule at eye level', blocked: !scene.collected.has('rule') ? 'Collect the metre rule first.' : p.swing ? 'Stop the bob to measure the thread.' : undefined, run: goRead }],
    };
  }
  if (id === 'bob' || id === 'protractor') {
    const amp = (d: number): LabAction => ({ key: `a${d}`, label: `Pull aside ${d}°`, tone: d === s.amplitude ? 'brand' : undefined, run: () => p.set({ amplitude: d }) });
    return {
      title: id === 'bob' ? 'Pendulum bob' : 'Protractor',
      info: p.swing ? `Swinging through ${p.swing.amplitude}° (thread ${p.swing.thread.toFixed(1)} cm).` : `Angle of displacement: ${s.amplitude}°. Drag the bob sideways and let go, or choose an angle and release.`,
      actions: [
        ...[5, 8, 10, 15].map(amp),
        p.swing ? { key: 'stop', label: 'Stop the bob', run: () => p.stopSwing() } : { key: 'release', label: 'Release the bob', tone: 'brand', run: () => (p.release(), play('clink')) },
      ],
    };
  }
  if (id === 'stopwatch')
    return {
      title: 'Stopwatch',
      info: `Reads ${p.elapsed().toFixed(2)} s. Timing ${s.n} oscillations.`,
      actions: [...watchActions(ctx), ...PENDULUM_OSCILLATIONS.map((n): LabAction => ({ key: `n${n}`, label: `Time ${n}`, tone: s.n === n ? 'brand' : undefined, run: () => p.set({ n }) }))],
    };
  if (id === 'rule') return { title: 'Metre rule', info: 'Its zero is level with the bottom of the split cork.', actions: [{ key: 'read', label: 'Read it at eye level', tone: 'brand', blocked: p.swing ? 'Stop the bob to measure the thread.' : undefined, run: goRead }] };
  if (id === 'fiducial') return { title: 'Fiducial mark', info: 'The black line behind the bob’s rest position: start and stop the watch as the bob crosses it.', actions: [] };
  if (id === 'stand') return { title: 'Retort stand and clamp', info: 'Its base is square on the bench and the clamp is tight: a rigid support.', actions: [] };
  if (explainer(id)) return { title: explainer(id)!.name, actions: [] };
  return null;
}
