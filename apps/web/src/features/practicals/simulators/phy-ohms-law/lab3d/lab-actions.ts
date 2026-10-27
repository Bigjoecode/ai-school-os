import { ohmsWireKey, type OhmsTerminal, type PhyOhmsState } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { ohmsHint, type Ohms } from '../actions';
import { useBench } from './bench-store';
import { APPARATUS, APPARATUS_LABEL, TERMINAL_PART, needed, terminalReady, type ApparatusId, type SceneState } from './scene-state';
import { TERM_LABEL } from './station';

/**
 * What can be done with each object on the circuit bench. Every action is a
 * button (the drags are extras); a blocked one says why. Marked changes go
 * through the shared Ohm's law actions, collecting apparatus through `note`.
 */

export interface ActionCtx {
  o: Ohms;
  s: PhyOhmsState;
  scene: SceneState;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}
const view = () => useLabView.getState();

/** Joins a wire between two terminals (from a drag or the buttons), if both are on the bench. */
export function joinWire(ctx: ActionCtx, a: OhmsTerminal, b: OhmsTerminal) {
  useBench.setState({ picked: null });
  if (a === b) return;
  if (!ctx.scene.collected.has('wires')) return notify('Collect the connecting wires from the cupboard first.', 'warning');
  for (const t of [a, b]) if (!terminalReady(t, ctx.scene)) return notify(`Bring the ${APPARATUS_LABEL[TERMINAL_PART[t]].toLowerCase()} to your bench first.`, 'warning');
  if (ctx.s.wires.includes(ohmsWireKey(a, b))) return notify('Those two terminals are already joined.', 'info');
  ctx.o.connect(a, b);
  play('clink');
}

export function takeReadingAction(ctx: ActionCtx): LabAction {
  const { s } = ctx;
  return {
    key: 'reading',
    label: 'Take this reading',
    tone: 'brand',
    blocked: !s.key ? 'Close the key first: the meters only read with the current on.' : s.readings.length >= 14 ? 'The table is full.' : undefined,
    run: () => {
      ctx.o.takeReading();
      play('success');
      notify('Reading taken: write I and V in your table, then open the key.', 'success', 2600);
    },
  };
}

function wiresAt(s: PhyOhmsState, t: OhmsTerminal) {
  return s.wires.filter((w) => w.split('|').includes(t));
}

function returnAction(ctx: ActionCtx, id: ApparatusId): LabAction {
  const busy = (Object.keys(TERMINAL_PART) as OhmsTerminal[]).some((t) => TERMINAL_PART[t] === id && wiresAt(ctx.s, t).length) || (id === 'wires' && ctx.s.wires.length > 0);
  return {
    key: 'return',
    label: 'Put back in the cupboard',
    blocked: busy ? 'Disconnect its wires first.' : undefined,
    run: () => {
      ctx.o.note(`return:${id}`);
      view().set({ selected: null });
    },
  };
}

const focus = (f: string) => ({ key: `look-${f}`, label: 'Look closely', run: () => view().set({ focus: f, selected: null }) });

export function objectPanel(id: string, ctx: ActionCtx): ObjectPanel | null {
  const { o, s, scene } = ctx;
  const task = s.task ?? 'OHM';
  if (id === 'cupboard') return { title: 'Apparatus cupboard', info: 'Take what this experiment needs to your bench.', actions: [{ key: 'open', label: 'Choose apparatus', tone: 'brand', run: () => ctx.open('cupboard') }] };
  if (id.startsWith('cup:')) {
    const a = id.slice(4) as ApparatusId;
    return {
      title: APPARATUS_LABEL[a],
      info: 'In the apparatus cupboard.',
      actions: [
        {
          key: 'take',
          label: 'Take it to my bench',
          tone: 'brand',
          run: () => {
            o.note(`collect:${a}`);
            play('clink');
            view().set({ selected: null });
          },
        },
      ],
    };
  }
  if (id === 'mybench')
    return {
      title: 'Your bench',
      info: 'Bench 2: the circuit board, the task card and your notebook are here.',
      actions: view().mode === 'walk' ? [{ key: 'sit', label: 'Work at my bench', tone: 'brand', run: () => view().set({ mode: 'bench', focus: 'bench', selected: null }) }] : [{ key: 'stand', label: 'Stand up and walk', run: () => view().set({ mode: 'walk', selected: null, held: null }) }],
    };
  if (id === 'card') return { title: 'Task card', actions: [{ key: 'read', label: 'Read the task card', tone: 'brand', run: () => ctx.open('task') }] };
  if (id === 'book') return { title: 'Practical notebook', info: 'Your table, graph and answers — this is what is marked.', actions: [{ key: 'open', label: 'Open the notebook', tone: 'brand', run: () => ctx.open('notebook') }] };
  if (id === 'coat')
    return scene.coat
      ? { title: 'Coat hook', info: 'You are wearing your lab coat.', actions: [{ key: 'off', label: 'Take the coat off', run: () => o.note('safety-off:coat') }] }
      : { title: 'Your lab coat', info: 'Optional in the physics lab, but it keeps your clothes clean.', actions: [{ key: 'on', label: 'Put on the lab coat', tone: 'brand', run: () => (o.note('safety:coat'), play('tick')) }] };
  if (id === 'board') {
    const picked = useBench.getState().picked;
    return {
      title: 'Circuit board',
      info: picked ? `Joining a wire from the ${TERM_LABEL[picked].toLowerCase()}: select the terminal to join it to.` : 'Drag from one terminal to another to join them with a wire — or select a terminal for the buttons.',
      actions: [focus('board'), ...(s.wires.length ? [{ key: 'clear', label: 'Remove all the wires', tone: 'danger' as const, blocked: s.key ? 'Open the key first.' : undefined, run: () => s.wires.forEach((w) => o.removeWire(w)) }] : [])],
    };
  }
  if (id.startsWith('term:')) {
    const t = id.slice(5) as OhmsTerminal;
    const picked = useBench.getState().picked;
    const ready = terminalReady(t, scene);
    const at = wiresAt(s, t);
    const actions: LabAction[] = [];
    if (picked === t) actions.push({ key: 'cancel', label: 'Cancel this wire', run: () => (useBench.setState({ picked: null }), view().set({ selected: null })) });
    else if (picked) actions.push({ key: 'join', label: `Join it to the ${TERM_LABEL[picked].replace(/ terminal/, '').toLowerCase()}`, tone: 'brand', run: () => (joinWire(ctx, picked, t), view().set({ selected: null })) });
    else
      actions.push({
        key: 'start',
        label: 'Start a wire here',
        tone: 'brand',
        blocked: !scene.collected.has('wires') ? 'Collect the connecting wires first.' : !ready ? 'Bring this apparatus to your bench first.' : undefined,
        run: () => (useBench.setState({ picked: t }), notify('Now select the terminal to join it to.', 'info', 2200), view().set({ selected: null })),
      });
    for (const w of at) {
      const other = w.split('|').find((x) => x !== t) as OhmsTerminal;
      actions.push({ key: `rm-${w}`, label: `Remove the wire to the ${TERM_LABEL[other].replace(/ terminal/, '').toLowerCase()}`, tone: 'danger', run: () => o.removeWire(w) });
    }
    return { title: TERM_LABEL[t], info: at.length ? `${at.length} wire${at.length === 1 ? '' : 's'} joined here.` : 'Nothing joined here yet.', actions };
  }
  if (id.startsWith('wire:')) {
    const w = id.slice(5);
    const [a, b] = w.split('|') as [OhmsTerminal, OhmsTerminal];
    return { title: 'Connecting wire', info: `${TERM_LABEL[a]} to ${TERM_LABEL[b].toLowerCase()}.`, actions: [{ key: 'rm', label: 'Remove this wire', tone: 'danger', run: () => (o.removeWire(w), view().set({ selected: null })) }] };
  }
  const part = id as ApparatusId;
  if (!APPARATUS.some((a) => a.id === part)) return { title: ROOM_TITLES[id] ?? 'Lab', actions: [] };
  const base: LabAction[] = [];
  if (part === 'key')
    base.push({
      key: 'toggle',
      label: s.key ? 'Open the key (pull out the plug)' : 'Close the key (push in the plug)',
      tone: 'brand',
      run: () => {
        o.toggleKey();
        play('clink');
      },
    });
  if (part === 'rheostat')
    base.push(
      { key: 'less', label: '◀ Less resistance', run: () => o.setRheostat(s.rheostat - 0.1) },
      { key: 'more', label: 'More resistance ▶', run: () => o.setRheostat(s.rheostat + 0.1) },
      { key: 'fine-', label: '◀ a little', run: () => o.setRheostat(s.rheostat - 0.02) },
      { key: 'fine+', label: 'a little ▶', run: () => o.setRheostat(s.rheostat + 0.02) },
    );
  if (part === 'wireRule')
    base.push(
      { key: 'j-', label: '◀ 10 cm', run: () => o.setJockey(s.jockey - 10) },
      { key: 'j+', label: '10 cm ▶', run: () => o.setJockey(s.jockey + 10) },
      { key: 'j-f', label: '◀ 0.5 cm', run: () => o.setJockey(s.jockey - 0.5) },
      { key: 'j+f', label: '0.5 cm ▶', run: () => o.setJockey(s.jockey + 0.5) },
    );
  if (part === 'ammeter' || part === 'voltmeter')
    base.push(focus(part), {
      key: 'read',
      label: 'Read at eye level',
      run: () => (useBench.setState({ meter: part === 'ammeter' ? 'A' : 'V' }), view().set({ mode: 'read', selected: null })),
    });
  if (part === 'ammeter' || part === 'voltmeter' || part === 'key') base.push(takeReadingAction(ctx));
  const info: Partial<Record<ApparatusId, string>> = {
    key: s.key ? 'Closed: current is flowing.' : 'Open: no current.',
    rheostat: `Slider at ${Math.round(s.rheostat * 100)} % of its 20 Ω.`,
    wireRule: `Jockey at L = ${s.jockey.toFixed(1)} cm from the 0 end.`,
    ammeter: 'Read the pointer from directly in front, to half a division (0.01 A).',
    voltmeter: 'Read the pointer from directly in front, to half a division (0.05 V).',
  };
  const notNeeded = !needed(task).some((a) => a.id === part);
  return { title: APPARATUS_LABEL[part], info: notNeeded ? 'Not needed for this experiment.' : info[part], actions: [...base, returnAction(ctx, part)] };
}

const ROOM_TITLES: Record<string, string> = {
  shelf: 'Physics equipment shelf',
  vdg: 'Van de Graaff generator',
  co2: 'CO₂ fire extinguisher',
  blanket: 'Fire blanket',
  notice: 'Notice board',
  'poster-si': 'SI base units',
  'poster-light': 'Refraction of light',
  'poster-electric': 'Electrical safety',
  whiteboard: 'Whiteboard',
  desk: 'Teacher’s desk',
  goggles: 'Safety goggles',
  firstaid: 'First-aid box',
  extinguisher: 'Fire extinguisher',
  eyewash: 'Eye-wash station',
};

/** The plain hint (practice, guided mode off): the 2D lab's hint, with the 3D steps first. */
export function nextHint3d(s: PhyOhmsState, scene: SceneState, I: number): string {
  const missing = needed(s.task ?? 'OHM').filter((a) => !scene.collected.has(a.id));
  if (missing.length) return `Collect from the cupboard: ${missing.map((a) => a.label.toLowerCase()).join(', ')}.`;
  return ohmsHint(s, s.key, I);
}
