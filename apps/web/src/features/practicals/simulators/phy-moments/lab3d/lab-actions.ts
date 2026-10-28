import type { PhyMomentsState } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { KNOWN_NAME, readyToRead, type LoopId, type Moments } from '../actions';
import { useBench, type ReadAt } from './bench-store';
import { APPARATUS, APPARATUS_LABEL, knownId, NEEDED, PLACE_LABEL, sceneFromState, type ApparatusId, type SceneState } from './scene-state';

/**
 * Everything the student can do at the knife edge, as plain operations (used
 * by the dock, the object menus, the drags and the demo) and as each object's
 * menu. Marked changes go through the shared actions; collecting the
 * apparatus and setting it out are log notes without marks.
 */

const view = () => useLabView.getState();

export interface Ops {
  place: (id: ApparatusId) => void;
  placeNext: () => void;
  movePivot: (d: number) => void;
  hang: (id: LoopId) => void;
  unhang: (id: LoopId) => void;
  moveLoop: (id: LoopId, d: number) => void;
  /** Steady the rule level and let go. */
  release: () => void;
  recordG: () => void;
  /** Eye-level view of a mark on the rule. */
  read: (at: ReadAt) => void;
  take: () => void;
  why: { place?: string; bench?: string; hang?: string; other?: string; g?: string; take?: string };
}

/** The operations on `o`: each reads the state as it is now (so the demo can run several in one tick). */
export function makeOps(o: Moments): Ops {
  const now = () => {
    const st = o.ref.current;
    return { st, scene: sceneFromState(st) };
  };
  const whyNow = () => {
    const { st, scene } = now();
    const task = st.task ?? 'MOMENTS';
    const setUp = !scene.ready ? `Collect your apparatus first (${scene.missing.length} still in the cupboard).` : !scene.set ? 'Set up the balance first: the knife edge on the bench, the rule on it.' : undefined;
    return {
      place: !st.task ? 'Choose the experiment first.' : !scene.nextPlace ? 'The balance is set up.' : !scene.collected.has(scene.nextPlace) ? `Collect the ${APPARATUS_LABEL[scene.nextPlace].toLowerCase()} first.` : undefined,
      bench: setUp,
      hang: setUp ?? (!scene.collected.has('thread') ? 'Collect the thread first: the masses hang from thread loops.' : undefined),
      other: setUp ?? (task === 'MASS' ? 'Only the 100 g mass is used here.' : undefined),
      g: setUp ?? (st.known !== null || st.other !== null ? 'Take the masses off first: G is the balance point of the rule alone.' : undefined),
      take: setUp ?? (!readyToRead(st) ? (task === 'MASS' ? 'Hang the 100 g mass first.' : 'Hang both masses first.') : st.readings.length >= 12 ? 'Twelve readings is the most.' : undefined),
    };
  };
  const why = whyNow();
  const say = (m: string) => notify(m, 'warning', 2400);
  const ops: Ops = {
    why,
    place: (id) => {
      const { scene } = now();
      if (!scene.collected.has(id)) return say(`Collect the ${APPARATUS_LABEL[id].toLowerCase()} first.`);
      if (id === 'rule' && !scene.placed.has('edge')) return say('Stand the knife edge on the bench first.');
      if (scene.placed.has(id)) return;
      o.note(`place:${id}`);
      play('clink');
      view().set({ selected: null });
    },
    placeNext: () => {
      const w = whyNow().place;
      if (w) return say(w);
      ops.place(now().scene.nextPlace!);
    },
    movePivot: (d) => {
      const w = whyNow().bench;
      if (w) return say(w);
      o.movePivot(d);
      play('tick');
    },
    hang: (id) => {
      const w = id === 'other' ? (whyNow().other ?? whyNow().hang) : whyNow().hang;
      if (w) return say(w);
      const { scene, st } = now();
      const item: ApparatusId = id === 'other' ? 'unknown' : knownId(st.task ?? 'MOMENTS');
      if (!scene.collected.has(item)) return say(`Collect the ${APPARATUS_LABEL[item].toLowerCase()} first.`);
      o.hang(id);
      play('clink');
    },
    unhang: (id) => {
      o.unhang(id);
      play('tick');
    },
    moveLoop: (id, d) => {
      const w = whyNow().bench;
      if (w) return say(w);
      o.moveLoop(id, d);
      play('tick');
    },
    release: () => {
      useBench.setState({ release: useBench.getState().release + 1 });
      play('tick');
    },
    recordG: () => {
      const w = whyNow().g;
      if (w) return say(w);
      o.recordG();
      play('success');
      notify('Balance point recorded as G. Write it in your notebook.', 'success', 2400);
    },
    read: (at) => {
      const w = whyNow().bench;
      if (w) return say(w);
      const st = o.ref.current;
      if ((at === 'known' && st.known === null) || (at === 'other' && st.other === null)) return say('Hang that mass first.');
      useBench.setState({ readAt: at });
      useLabView.setState({ mode: 'read', selected: null, spot: null });
    },
    take: () => {
      const w = whyNow().take;
      if (w) return say(w);
      o.takeReading();
      play('success');
    },
  };
  return ops;
}

export interface ActionCtx {
  o: Moments;
  s: PhyMomentsState;
  scene: SceneState;
  ops: Ops;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}

const act = (key: string, label: string, run: () => void, blocked?: string, tone?: 'brand'): LabAction => ({ key, label, run, blocked, tone });

/** The panel for the object `id` (null: nothing to show). */
export function objectPanel(id: string, ctx: ActionCtx): ObjectPanel | null {
  const { o, s, scene, ops } = ctx;
  const task = s.task ?? 'MOMENTS';
  if (id.startsWith('cup:')) {
    const a = id.slice(4) as ApparatusId;
    return {
      title: APPARATUS_LABEL[a],
      info: 'In the apparatus cupboard.',
      actions: [
        act('take', 'Take to my bench', () => {
          o.note(`collect:${a}`);
          play('clink');
          view().set({ selected: null });
          notify(`${APPARATUS_LABEL[a]} is on your bench.`, 'success', 1600);
        }, undefined, 'brand'),
      ],
    };
  }
  const hanging = (a: ApparatusId) => (a === knownId(task) && s.known !== null) || (a === 'unknown' && s.other !== null);
  const inUse = (a: ApparatusId) => scene.placed.has(a) || hanging(a) || (a === 'thread' && (s.known !== null || s.other !== null));
  const returnable = (a: ApparatusId) => act('return', 'Put back in the cupboard', () => (o.note(`return:${a}`), view().set({ selected: null })), inUse(a) || (NEEDED[task].includes(a) && s.readings.length > 0) ? 'You are using it.' : undefined);
  const loopActs = (lid: LoopId): LabAction[] => [
    act('l', 'Slide its loop 1 mm left', () => ops.moveLoop(lid, -0.1), ops.why.bench),
    act('r', 'Slide its loop 1 mm right', () => ops.moveLoop(lid, 0.1), ops.why.bench),
    act('L', 'Slide its loop 1 cm left', () => ops.moveLoop(lid, -1), ops.why.bench),
    act('R', 'Slide its loop 1 cm right', () => ops.moveLoop(lid, 1), ops.why.bench),
    act('read', 'Read its loop on the rule at eye level', () => ops.read(lid), ops.why.bench, 'brand'),
    act('off', 'Take it off the rule', () => ops.unhang(lid)),
  ];
  switch (id) {
    case 'cupboard':
      return { title: 'Apparatus cupboard', info: `Choose the apparatus you need for ${task === 'MASS' ? 'the mass of a metre rule' : 'the principle of moments'}.`, actions: [act('list', 'Choose apparatus…', () => ctx.open('cupboard'), undefined, 'brand')] };
    case 'mybench':
      return {
        title: 'Your bench',
        info: 'Bench 2: your task card and notebook are here.',
        actions: view().mode === 'walk' ? [act('sit', 'Work at my bench', () => view().set({ mode: 'bench', focus: 'bench', selected: null }), undefined, 'brand')] : [act('stand', 'Stand up and walk', () => view().set({ mode: 'walk', selected: null }))],
      };
    case 'edge':
      if (!scene.placed.has('edge')) return { title: 'Knife edge', info: 'A hardwood wedge on a block: the pivot.', actions: [act('place', PLACE_LABEL.edge!, () => ops.place('edge'), undefined, 'brand'), returnable('edge')] };
      return { title: 'Knife edge', info: 'The rule’s mark resting on the edge is the pivot.', actions: [act('read', 'Read the mark over the edge at eye level', () => ops.read('edge'), ops.why.bench, 'brand'), returnable('edge')] };
    case 'rule':
      if (!scene.placed.has('rule')) return { title: 'Metre rule', info: 'Not yet on the knife edge.', actions: [act('place', PLACE_LABEL.rule!, () => ops.place('rule'), !scene.placed.has('edge') ? 'Stand the knife edge on the bench first.' : undefined, 'brand'), returnable('rule')] };
      return {
        title: 'Metre rule',
        info: 'Slide it over the knife edge to move the pivot. Balanced: it stays level with the pointers when you let go.',
        actions: [
          act('let', 'Steady it and let go', ops.release, undefined, 'brand'),
          act('l', 'Slide it 1 mm left over the edge', () => ops.movePivot(0.1), ops.why.bench),
          act('r', 'Slide it 1 mm right over the edge', () => ops.movePivot(-0.1), ops.why.bench),
          act('L', 'Slide it 1 cm left', () => ops.movePivot(1), ops.why.bench),
          act('R', 'Slide it 1 cm right', () => ops.movePivot(-1), ops.why.bench),
          act('g', 'Record this balance point as G', ops.recordG, ops.why.g),
          act('read', 'Read the mark over the edge', () => ops.read('edge'), ops.why.bench),
        ],
      };
    case 'known':
      return { title: KNOWN_NAME[task], info: 'Hanging from a thread loop: read the loop’s centre line.', actions: loopActs('known') };
    case 'other':
      return { title: 'Unknown mass M', info: 'Hanging from a thread loop: slide it until the rule balances.', actions: loopActs('other') };
    case 'm50':
    case 'm100':
    case 'unknown': {
      const a = id as ApparatusId;
      const lid: LoopId | null = a === knownId(task) ? 'known' : a === 'unknown' && task === 'MOMENTS' ? 'other' : null;
      if (!lid) return { title: APPARATUS_LABEL[a], info: 'Not needed for this practical.', actions: [returnable(a)] };
      return { title: APPARATUS_LABEL[a], info: 'On your bench.', actions: [act('hang', 'Hang it on the rule with a thread loop', () => ops.hang(lid), lid === 'other' ? (ops.why.other ?? ops.why.hang) : ops.why.hang, 'brand'), returnable(a)] };
    }
    case 'thread':
      return { title: 'Thread', info: 'Thin loops hang the masses: their centre line is the mark you read.', actions: [returnable('thread')] };
    case 'pointer':
    case 'pointer-r':
      return { title: 'Reference pointer', info: 'Its red tip is at the height of the rule’s end when the rule is level. Judge the balance against it.', actions: [act('let', 'Steady the rule and let go', ops.release, ops.why.bench, 'brand')] };
    case 'book':
      return { title: 'Practical notebook', info: 'Your table, graph and answers.', actions: [act('open', 'Open the notebook', () => ctx.open('notebook'), undefined, 'brand')] };
    case 'card':
      return { title: 'Task card', info: 'The question paper.', actions: [act('open', 'Read the task card', () => ctx.open('task'), undefined, 'brand')] };
    case 'spring':
    case 'bob':
      return { title: APPARATUS_LABEL[id], info: 'Not needed for this practical.', actions: [returnable(id)] };
    case 'coat':
      return { title: 'Lab coat', info: 'Optional for this practical.', actions: [scene.coat ? act('off', 'Take off the lab coat', () => o.note('safety-off:coat')) : act('on', 'Put on the lab coat', () => o.note('safety:coat'))] };
    case 'whiteboard':
      return { title: 'Whiteboard', info: `Today: ${task === 'MASS' ? 'the centre of gravity and mass of a metre rule' : 'the principle of moments'}.`, actions: [] };
    default:
      return APPARATUS.some((x) => x.id === id) ? { title: APPARATUS_LABEL[id as ApparatusId], actions: [] } : ROOM_INFO[id] ? { title: ROOM_INFO[id]![0], info: ROOM_INFO[id]![1], actions: [] } : null;
  }
}

const ROOM_INFO: Record<string, [string, string]> = {
  goggles: ['Safety goggles', 'Not needed for this practical.'],
  shelf: ['Physics equipment shelf', 'Equipment for other practicals: you need nothing from here.'],
  vdg: ['Van de Graaff generator', 'Teacher only.'],
  co2: ['CO₂ fire extinguisher', 'For electrical fires.'],
  blanket: ['Fire blanket', 'Pull the tapes down sharply to use it.'],
  extinguisher: ['Fire extinguisher', 'By the door.'],
  firstaid: ['First-aid box', 'Tell the teacher about any injury, even a bruise from a dropped mass.'],
  eyewash: ['Eye-wash station', 'Rinse for 10 minutes.'],
  notice: ['Notice board', 'Department notices and WAEC tips.'],
  desk: ['Teacher’s desk', 'The teacher marks the work here.'],
  'poster-si': ['Poster: SI base units', 'Distances in cm and masses in g here.'],
  'poster-light': ['Poster: refraction of light', 'For the optics practicals.'],
  'poster-electric': ['Poster: electrical safety', 'Nothing electrical in this practical.'],
};
