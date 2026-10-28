import { opticsV, type PhyOpticsState } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { clampRough, OPTIC_NAME, type Optics } from '../actions';
import { useBench, type ReadAt } from './bench-store';
import { APPARATUS, APPARATUS_LABEL, NEEDED, opticOf, PLACE_LABEL, sceneFromState, type ApparatusId, type SceneState } from './scene-state';
import { roughScreenCm, screenSpot } from './views';

/**
 * Everything the student can do at the optical bench, as plain operations
 * (used by the dock, the object menus, the drags and the demo) and as each
 * object's menu. Marked changes go through the shared actions; collecting
 * the apparatus and standing it on the rule are log notes without marks.
 */

const bench = () => useBench.getState();
const view = () => useLabView.getState();

export interface Ops {
  place: (id: ApparatusId) => void;
  placeNext: () => void;
  rough: (on: boolean) => void;
  roughMove: (d: number) => void;
  recordRough: () => void;
  align: () => void;
  setU: (d: number) => void;
  moveScreen: (d: number) => void;
  /** Looks closely at the screen's face (from the lens or mirror side). */
  lookScreen: () => void;
  /** Eye-level view of a holder's mark on the rule. */
  read: (at: ReadAt) => void;
  take: () => void;
  /** Why each step can't be done now (undefined: it can). */
  why: { place?: string; rough?: string; align?: string; bench?: string; take?: string };
}

/** The camera on the screen's face as the bench is now. */
export function followScreen(s: PhyOpticsState) {
  const task = s.task ?? 'LENS';
  const b = bench();
  const cm = b.rough ? roughScreenCm(task, s.u, b.roughS) : s.screen;
  useLabView.setState({ mode: 'bench', focus: 'screen', spot: screenSpot(task, cm, b.rough && task === 'MIRROR' ? 1 : -1), selected: null });
}

/** The operations on `o`: each reads the state as it is now (so the demo can run several in one tick). */
export function makeOps(o: Optics): Ops {
  const now = () => {
    const st = o.ref.current;
    return { st, scene: sceneFromState(st) };
  };
  const whyNow = () => {
    const { st, scene } = now();
    const what = OPTIC_NAME[st.task ?? 'LENS'];
    const setUp = !scene.ready ? `Collect your apparatus first (${scene.missing.length} still in the cupboard).` : !scene.set ? 'Stand everything on the metre rule first.' : undefined;
    return {
      place: !st.task ? 'Choose the experiment first.' : !scene.collected.has('rule') ? 'Lay the metre rule on the bench first (collect it from the cupboard).' : !scene.nextPlace ? 'Everything is on the rule.' : !scene.collected.has(scene.nextPlace) ? `Collect the ${APPARATUS_LABEL[scene.nextPlace].toLowerCase()} first.` : undefined,
      rough: setUp,
      align: setUp ?? (st.aligned ? 'The centres are lined up.' : undefined),
      bench: setUp ?? (bench().rough ? `Finish the rough focus first (turn the ${what} back to the bench).` : undefined),
      take: setUp ?? (bench().rough ? 'Finish the rough focus first.' : st.readings.length >= 12 ? 'Twelve readings is the most.' : undefined),
    };
  };
  const why = whyNow();
  const say = (m: string) => notify(m, 'warning', 2400);
  const ops: Ops = {
    why,
    place: (id) => {
      const { scene } = now();
      if (!scene.collected.has(id)) return say(`Collect the ${APPARATUS_LABEL[id].toLowerCase()} first.`);
      if (!scene.collected.has('rule')) return say('Lay the metre rule on the bench first.');
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
    rough: (on) => {
      const w = whyNow().rough;
      if (on && w) return say(w);
      useBench.setState({ rough: on });
      if (on) followScreen(o.ref.current);
      else useLabView.setState({ spot: null, focus: 'rule' });
      play('tick');
    },
    roughMove: (d) => {
      useBench.setState({ roughS: clampRough(bench().roughS + d) });
      if (view().focus === 'screen') followScreen(o.ref.current);
    },
    recordRough: () => {
      if (!bench().rough) return say('Turn to the window first.');
      o.recordRough(bench().roughS);
      play('success');
      notify(`Rough focal length: about ${bench().roughS.toFixed(1)} cm. Write it in your notebook.`, 'success', 2600);
      ops.rough(false);
    },
    align: () => {
      const w = whyNow().align;
      if (w) return say(w);
      o.align();
      useBench.setState({ alignAt: performance.now() });
      play('clink');
    },
    setU: (d) => {
      const w = whyNow().bench;
      if (w) return say(w);
      o.setU(o.ref.current.u + d);
      play('tick');
    },
    moveScreen: (d) => {
      const w = whyNow().bench;
      if (w) return say(w);
      o.moveScreen(d);
      if (view().focus === 'screen') followScreen(o.ref.current);
    },
    lookScreen: () => {
      const { scene } = now();
      if (!scene.collected.has('screen')) return say('Collect the screen first.');
      followScreen(o.ref.current);
    },
    read: (at) => {
      const w = whyNow().bench;
      if (w) return say(w);
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
  o: Optics;
  s: PhyOpticsState;
  scene: SceneState;
  ops: Ops;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}

const act = (key: string, label: string, run: () => void, blocked?: string, tone?: 'brand'): LabAction => ({ key, label, run, blocked, tone });

/** The panel for the object `id` (null: nothing to show). */
export function objectPanel(id: string, ctx: ActionCtx): ObjectPanel | null {
  const { o, s, scene, ops } = ctx;
  const task = s.task ?? 'LENS';
  const what = OPTIC_NAME[task];
  const rough = useBench.getState().rough;
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
  const inUse = (a: ApparatusId) => scene.placed.has(a) || (a === 'rule' && scene.placed.size > 0);
  const returnable = (a: ApparatusId) => act('return', 'Put back in the cupboard', () => (o.note(`return:${a}`), view().set({ selected: null })), inUse(a) || (NEEDED[task].includes(a) && s.readings.length > 0) ? 'You are using it.' : undefined);
  const placeAct = (a: ApparatusId) => act('place', PLACE_LABEL[task][a] ?? 'Stand it on the rule', () => ops.place(a), !scene.collected.has('rule') ? 'Lay the metre rule on the bench first.' : undefined, 'brand');
  switch (id) {
    case 'cupboard':
      return { title: 'Apparatus cupboard', info: `Choose the apparatus you need to find the focal length of a ${task === 'MIRROR' ? 'concave mirror' : 'converging lens'}.`, actions: [act('list', 'Choose apparatus…', () => ctx.open('cupboard'), undefined, 'brand')] };
    case 'mybench':
      return {
        title: 'Your bench',
        info: 'Bench 2: your task card and notebook are here.',
        actions: view().mode === 'walk' ? [act('sit', 'Work at my bench', () => view().set({ mode: 'bench', focus: 'bench', selected: null }), undefined, 'brand')] : [act('stand', 'Stand up and walk', () => view().set({ mode: 'walk', selected: null }))],
      };
    case 'rule':
      return {
        title: 'Metre rule',
        info: task === 'MIRROR' ? 'The mirror stands at 0 cm: the object’s mark is u and the screen’s mark is v.' : 'The object stands at 0 cm: the lens’s mark is u, and v = screen mark − lens mark.',
        actions: [
          act('read-s', 'Read the screen’s mark at eye level', () => ops.read('screen'), ops.why.bench, 'brand'),
          act('read-u', `Read the ${task === 'MIRROR' ? 'object' : 'lens'}’s mark at eye level`, () => ops.read('u'), ops.why.bench),
          act('view', 'Look along the optical bench', () => view().set({ mode: 'bench', focus: 'rule', spot: null, selected: null })),
          returnable('rule'),
        ],
      };
    case 'lamp':
    case 'lens':
    case 'mirror': {
      const a = id as ApparatusId;
      const isOptic = a === opticOf(task);
      if (!isOptic && a !== 'lamp') return { title: APPARATUS_LABEL[a], info: 'Not needed for this practical.', actions: [returnable(a)] };
      const actions: LabAction[] = [];
      if (!scene.placed.has(a)) actions.push(placeAct(a), returnable(a));
      else {
        const moves = (task === 'MIRROR') === (a === 'lamp');
        if (moves) {
          actions.push(act('u-', `Move it 1 cm nearer the ${task === 'MIRROR' ? 'mirror' : 'object'} (u − 1)`, () => ops.setU(-1), ops.why.bench));
          actions.push(act('u+', `Move it 1 cm further (u + 1)`, () => ops.setU(1), ops.why.bench));
        }
        if (isOptic) {
          if (!s.aligned) actions.push(act('align', 'Line up the centres on one axis', ops.align, ops.why.align, 'brand'));
          actions.push(act('rough', rough ? `Turn the ${what} back to the bench` : `Point the ${what} at the window (rough focus)`, () => ops.rough(!rough), rough ? undefined : ops.why.rough, s.rough === null && !rough ? 'brand' : undefined));
        }
      }
      return { title: APPARATUS_LABEL[a], info: a === 'lamp' ? 'The lamp lights the cross-wire: that is the object. The housing gets hot.' : isOptic && scene.placed.has(a) ? `At the ${task === 'MIRROR' ? '0 cm mark' : `${s.u.toFixed(1)} cm mark`}${s.aligned ? '' : ' — its centre is not yet on the axis'}.` : 'Beside the rule.', actions };
    }
    case 'screen': {
      if (!scene.placed.has('screen')) return { title: APPARATUS_LABEL.screen, info: 'Beside the rule.', actions: [placeAct('screen'), returnable('screen')] };
      const actions: LabAction[] = rough
        ? [act('n', 'Hold it 1 mm nearer', () => ops.roughMove(-0.1)), act('f', 'Hold it 1 mm further', () => ops.roughMove(0.1)), act('rec', 'Record this distance (rough focal length)', ops.recordRough, undefined, 'brand')]
        : [
            act('look', 'Look at the image on the screen', ops.lookScreen, undefined, 'brand'),
            act('l', 'Move it 1 mm towards the ' + what, () => ops.moveScreen(-0.1), ops.why.bench),
            act('r', 'Move it 1 mm away', () => ops.moveScreen(0.1), ops.why.bench),
            act('read', 'Read its mark on the rule', () => ops.read('screen'), ops.why.bench),
            act('take', 'Take this reading', ops.take, ops.why.take),
          ];
      return { title: 'White screen', info: rough ? `Held ${useBench.getState().roughS.toFixed(1)} cm from the ${what}, facing it.` : `v = ${task === 'MIRROR' ? 'its mark' : 'its mark − the lens’s mark'}.`, actions };
    }
    case 'book':
      return { title: 'Practical notebook', info: 'Your table, graph and answers.', actions: [act('open', 'Open the notebook', () => ctx.open('notebook'), undefined, 'brand')] };
    case 'card':
      return { title: 'Task card', info: 'The question paper.', actions: [act('open', 'Read the task card', () => ctx.open('task'), undefined, 'brand')] };
    case 'prism':
    case 'plane':
    case 'block':
      return { title: APPARATUS_LABEL[id], info: 'Not needed for this practical.', actions: [returnable(id)] };
    case 'coat':
      return { title: 'Lab coat', info: 'Optional for the optical bench.', actions: [scene.coat ? act('off', 'Take off the lab coat', () => o.note('safety-off:coat')) : act('on', 'Put on the lab coat', () => o.note('safety:coat'))] };
    case 'whiteboard':
      return { title: 'Whiteboard', info: `Today: the focal length of a ${task === 'MIRROR' ? 'concave mirror' : 'converging lens'}.`, actions: [] };
    default:
      return APPARATUS.some((x) => x.id === id) ? { title: APPARATUS_LABEL[id as ApparatusId], actions: [] } : ROOM_INFO[id] ? { title: ROOM_INFO[id]![0], info: ROOM_INFO[id]![1], actions: [] } : null;
  }
}

/** The screen's distance from the lens or mirror now (for the HUD). */
export const vNow = (s: PhyOpticsState) => opticsV(s.task ?? 'LENS', s.u, s.screen);

const ROOM_INFO: Record<string, [string, string]> = {
  goggles: ['Safety goggles', 'Not needed for the optical bench.'],
  shelf: ['Physics equipment shelf', 'Equipment for other practicals: you need nothing from here.'],
  vdg: ['Van de Graaff generator', 'Teacher only.'],
  co2: ['CO₂ fire extinguisher', 'For electrical fires.'],
  blanket: ['Fire blanket', 'Pull the tapes down sharply to use it.'],
  extinguisher: ['Fire extinguisher', 'By the door.'],
  firstaid: ['First-aid box', 'Tell the teacher about any injury, even a small burn from the lamp.'],
  eyewash: ['Eye-wash station', 'Rinse for 10 minutes.'],
  notice: ['Notice board', 'Department notices and WAEC tips.'],
  desk: ['Teacher’s desk', 'Mr Bayo’s teacher marks the work here.'],
  'poster-si': ['Poster: SI base units', 'Lengths in cm here: 1/u and 1/v in cm⁻¹.'],
  'poster-light': ['Poster: refraction of light', 'A lens refracts light; a concave mirror reflects it to a focus.'],
  'poster-electric': ['Poster: electrical safety', 'The lamp runs from a low-voltage supply.'],
};
