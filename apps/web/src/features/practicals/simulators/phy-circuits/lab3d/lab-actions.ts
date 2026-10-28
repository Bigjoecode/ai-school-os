import { RBOX_PLUGS, circuitsWireKey, rboxPlugs, type CircuitsMeters, type CircuitsTerminal, type PhyCircuitsState } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { circuitsHint, type Circuits } from '../actions';
import { useBench, type ReadTarget } from './bench-store';
import { scaleSpot } from './content';
import { APPARATUS, APPARATUS_LABEL, TERMINAL_PART, needed, terminalReady, type ApparatusId, type SceneState } from './scene-state';
import { TERM_LABEL } from './station';

/**
 * What can be done with each object on the circuits bench. Every action is a
 * button (the drags are extras); a blocked one says why. Marked changes go
 * through the shared actions, collecting apparatus through `note`.
 */

export interface ActionCtx {
  o: Circuits;
  s: PhyCircuitsState;
  scene: SceneState;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}
const view = () => useLabView.getState();
const readAt = (m: ReadTarget) => (useBench.setState({ meter: m }), view().set({ mode: 'read', selected: null }));

/** Joins a wire between two terminals (from a drag or the buttons), if both are on the bench. */
export function joinWire(ctx: ActionCtx, a: CircuitsTerminal, b: CircuitsTerminal) {
  useBench.setState({ picked: null });
  if (a === b) return;
  if (!ctx.scene.collected.has('wires')) return notify('Collect the connecting wires from the cupboard first.', 'warning');
  for (const t of [a, b]) if (!terminalReady(t, ctx.scene)) return notify(`Bring the ${APPARATUS_LABEL[TERMINAL_PART[t]].toLowerCase()} to your bench first.`, 'warning');
  if (ctx.s.wires.includes(circuitsWireKey(a, b))) return notify('Those two terminals are already joined.', 'info');
  ctx.o.connect(a, b);
  play('clink');
}

export function takeReadingAction(ctx: ActionCtx): LabAction {
  const { s } = ctx;
  const bridge = ctx.o.task === 'BRIDGE';
  return {
    key: 'reading',
    label: bridge ? 'Record this balance point' : 'Take this reading',
    tone: 'brand',
    blocked: !s.key ? 'Close the key first: the circuit only works with the current on.' : s.readings.length >= 16 ? 'The table is full.' : undefined,
    run: () => {
      ctx.o.takeReading();
      play('success');
      notify(bridge ? 'Balance point recorded: write l (and work out X) in your table, then open the key.' : 'Reading taken: write it in your table, then open the key.', 'success', 2600);
    },
  };
}

export function tapAction(ctx: ActionCtx): LabAction {
  return {
    key: 'tap',
    label: 'Tap the jockey on the wire',
    tone: 'brand',
    blocked: ctx.s.pressed ? 'It is already held down.' : undefined,
    run: () => {
      ctx.o.tap();
      play('tick');
    },
  };
}

function wiresAt(s: PhyCircuitsState, t: CircuitsTerminal) {
  return s.wires.filter((w) => w.split('|').includes(t));
}

function returnAction(ctx: ActionCtx, id: ApparatusId): LabAction {
  const busy = (Object.keys(TERMINAL_PART) as CircuitsTerminal[]).some((t) => TERMINAL_PART[t] === id && wiresAt(ctx.s, t).length) || (id === 'wires' && ctx.s.wires.length > 0);
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
  const task = o.task;
  if (id === 'cupboard') return { title: 'Apparatus cupboard', info: 'Take what this experiment needs to your bench.', actions: [{ key: 'open', label: 'Choose apparatus', tone: 'brand', run: () => ctx.open('cupboard') }] };
  if (id.startsWith('cup:')) {
    const a = id.slice(4) as ApparatusId;
    return {
      title: APPARATUS_LABEL[a],
      info: 'In the apparatus cupboard.',
      actions: [{ key: 'take', label: 'Take it to my bench', tone: 'brand', run: () => (o.note(`collect:${a}`), play('clink'), view().set({ selected: null })) }],
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
    const t = id.slice(5) as CircuitsTerminal;
    const picked = useBench.getState().picked;
    const ready = terminalReady(t, scene);
    const at = wiresAt(s, t);
    const actions: LabAction[] = [];
    const short = (x: CircuitsTerminal) => TERM_LABEL[x].replace(/ terminal/, '').toLowerCase();
    if (picked === t) actions.push({ key: 'cancel', label: 'Cancel this wire', run: () => (useBench.setState({ picked: null }), view().set({ selected: null })) });
    else if (picked) actions.push({ key: 'join', label: `Join it to the ${short(picked)}`, tone: 'brand', run: () => (joinWire(ctx, picked, t), view().set({ selected: null })) });
    else
      actions.push({
        key: 'start',
        label: 'Start a wire here',
        tone: 'brand',
        blocked: !scene.collected.has('wires') ? 'Collect the connecting wires first.' : !ready ? 'Bring this apparatus to your bench first.' : undefined,
        run: () => (useBench.setState({ picked: t }), notify('Now select the terminal to join it to.', 'info', 2200), view().set({ selected: null })),
      });
    for (const w of at) {
      const other = w.split('|').find((x) => x !== t) as CircuitsTerminal;
      actions.push({ key: `rm-${w}`, label: `Remove the wire to the ${short(other)}`, tone: 'danger', run: () => o.removeWire(w) });
    }
    return { title: TERM_LABEL[t], info: at.length ? `${at.length} wire${at.length === 1 ? '' : 's'} joined here.` : 'Nothing joined here yet.', actions };
  }
  if (id.startsWith('wire:')) {
    const w = id.slice(5);
    const [a, b] = w.split('|') as [CircuitsTerminal, CircuitsTerminal];
    return { title: 'Connecting wire', info: `${TERM_LABEL[a]} to ${TERM_LABEL[b].toLowerCase()}.`, actions: [{ key: 'rm', label: 'Remove this wire', tone: 'danger', run: () => (o.removeWire(w), view().set({ selected: null })) }] };
  }
  const part = id as ApparatusId;
  if (!APPARATUS.some((a) => a.id === part)) return { title: ROOM_TITLES[id] ?? 'Lab', actions: [] };
  const base: LabAction[] = [];
  const notNeeded = !needed(task).some((a) => a.id === part);
  if (!notNeeded) {
    if (part === 'key') base.push({ key: 'toggle', label: s.key ? 'Open the key (pull out the plug)' : 'Close the key (push in the plug)', tone: 'brand', run: () => (o.toggleKey(), play('clink')) });
    if (part === 'rheostat')
      base.push(
        { key: 'less', label: '◀ 0.5 Ω less', run: () => o.setRheostat(s.rheostat - 0.05) },
        { key: 'more', label: '0.5 Ω more ▶', run: () => o.setRheostat(s.rheostat + 0.05) },
        { key: 'fine-', label: '◀ 0.05 Ω', run: () => o.setRheostat(s.rheostat - 0.005) },
        { key: 'fine+', label: '0.05 Ω ▶', run: () => o.setRheostat(s.rheostat + 0.005) },
      );
    if (part === 'ammeter' || part === 'voltmeter') base.push(focus(part), { key: 'read', label: 'Read at eye level', run: () => readAt(part === 'ammeter' ? 'A' : 'V') });
    if (part === 'galvanometer') base.push(focus('galvanometer'), tapAction(ctx), { key: 'read', label: 'Watch it at eye level', run: () => readAt('G') });
    if (part === 'bridge')
      base.push(
        tapAction(ctx),
        { key: 'j-', label: '◀ 1 cm', run: () => o.setJockey(s.jockey - 1) },
        { key: 'j+', label: '1 cm ▶', run: () => o.setJockey(s.jockey + 1) },
        { key: 'j-f', label: '◀ 0.1 cm', run: () => o.setJockey(s.jockey - 0.1) },
        { key: 'j+f', label: '0.1 cm ▶', run: () => o.setJockey(s.jockey + 0.1) },
        { key: 'j-10', label: '◀ 10 cm', run: () => o.setJockey(s.jockey - 10) },
        { key: 'j+10', label: '10 cm ▶', run: () => o.setJockey(s.jockey + 10) },
        { key: 'hold', label: s.pressed ? 'Lift the jockey' : 'Hold the jockey down', run: () => o.press(!s.pressed) },
        { key: 'scale', label: 'Look down at the scale (read l)', run: () => view().set({ mode: 'bench', spot: scaleSpot(s.jockey), selected: null }) },
      );
    if (part === 'rbox') {
      const out = rboxPlugs(s.rbox);
      base.push(
        ...RBOX_PLUGS.map((p, i) => ({ key: `plug-${i}`, label: out[i] ? `Push in the ${p} Ω plug` : `Pull out the ${p} Ω plug`, run: () => (o.setRbox(s.rbox + (out[i] ? -p : p)), play('tick')) })),
        { key: 'r-', label: 'R − 1 Ω', run: () => o.setRbox(s.rbox - 1) },
        { key: 'r+', label: 'R + 1 Ω', run: () => o.setRbox(s.rbox + 1) },
      );
    }
    if (part === 'unknown' || part === 'rbox') base.push({ key: 'swap', label: s.swap ? 'Put X back in the left gap' : 'Interchange X and R', blocked: s.key ? 'Open the key before changing the gaps.' : undefined, run: () => (o.toggleSwap(), play('clink')) });
    if (part === 'ammeter' || part === 'voltmeter' || part === 'key' || part === 'galvanometer' || part === 'bridge') base.push(takeReadingAction(ctx));
  }
  const info: Partial<Record<ApparatusId, string>> = {
    key: s.key ? 'Closed: current is flowing.' : 'Open: no current.',
    rheostat: `${(s.rheostat * 10).toFixed(2)} Ω of its 10 Ω in use.`,
    bridge: `Jockey at ${s.jockey.toFixed(1)} cm from A${s.pressed ? ', held down on the wire' : ''}. Tap it on the wire; read l on the scale.`,
    galvanometer: 'Centre zero. It only shows a current while the jockey touches the wire.',
    rbox: `R = ${s.rbox} Ω (plugs out: ${RBOX_PLUGS.filter((_, i) => rboxPlugs(s.rbox)[i]).join(' + ') || 'none'}).`,
    unknown: `In the ${s.swap ? 'right' : 'left'} gap.`,
    ammeter: 'Read the pointer from directly in front, to half a division (0.01 A).',
    voltmeter: 'Divisions of 0.05 V: read from directly in front, to half a division.',
  };
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
export function nextHint3d(s: PhyCircuitsState, scene: SceneState, m: CircuitsMeters): string {
  const missing = needed(s.task ?? 'BRIDGE').filter((a) => !scene.collected.has(a.id));
  if (missing.length) return `Collect from the cupboard: ${missing.map((a) => a.label.toLowerCase()).join(', ')}.`;
  return circuitsHint(s, m);
}
