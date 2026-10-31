import { SONO_HANGER, SONO_MAX_LOAD, SOUND_FORKS, type PhySoundState } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { lenLimits, loadName, MAX_READINGS, type Sound } from '../actions';
import { APPARATUS, APPARATUS_LABEL, NEEDED, PLACE_LABEL, sceneFromState, type ApparatusId, type SceneState } from './scene-state';

/**
 * Everything the student can do at the resonance bench, as plain operations
 * (used by the dock, the object menus, the drags and the demo) and as each
 * object's menu. Marked changes go through the shared actions; collecting and
 * setting out the apparatus are log notes without marks.
 */

const view = () => useLabView.getState();

export interface Ops {
  place: (id: ApparatusId) => void;
  placeNext: () => void;
  pickFork: (f: number) => void;
  strike: (on?: 'pad' | 'bench') => void;
  damp: () => void;
  nudge: (d: number) => void;
  setLen: (l: number) => void;
  /** Eye-level view of the water surface on the tube's rule. */
  read: () => void;
  take: () => void;
  hangHanger: () => void;
  addMass: () => void;
  removeMass: () => void;
  placeRider: () => void;
  why: { place?: string; bench?: string; fork?: string; strike?: string; len?: string; read?: string; take?: string; hanger?: string; add?: string; remove?: string; rider?: string };
}

export function makeOps(o: Sound): Ops {
  const now = () => {
    const st = o.ref.current;
    return { st, scene: sceneFromState(st) };
  };
  const whyNow = () => {
    const { st, scene } = now();
    const sono = (st.task ?? 'TUBE') === 'SONO';
    const setUp = !st.task ? 'Choose the experiment first.' : !scene.ready ? `Collect your apparatus first (${scene.missing.length} still in the cupboard).` : !scene.set ? `Set up the ${sono ? 'sonometer' : 'tube'} first (the dock’s button).` : undefined;
    return {
      place: !st.task ? 'Choose the experiment first.' : !scene.nextPlace ? 'Everything is set up.' : !scene.collected.has(scene.nextPlace) ? `Collect the ${APPARATUS_LABEL[scene.nextPlace].toLowerCase()} first.` : undefined,
      bench: setUp,
      fork: setUp,
      strike: setUp ?? (!st.fork ? 'Take a fork from the set first.' : sono && st.load === 0 ? 'Hang the load first: with a slack wire nothing can resonate.' : undefined),
      len: setUp,
      read: setUp ?? (sono ? 'Read the scale between the bridges (the “Bridge & scale” view).' : undefined),
      take: setUp ?? (!st.fork ? 'Take a fork from the set first.' : st.readings.length >= MAX_READINGS ? 'The record is full.' : undefined),
      hanger: setUp ?? (!sono ? 'No hanger in this experiment.' : st.load > 0 ? 'The hanger is on.' : undefined),
      add: setUp ?? (!sono ? 'No hanger in this experiment.' : st.load === 0 ? 'Hang the hanger first.' : st.load >= SONO_MAX_LOAD ? 'That is every slotted mass.' : undefined),
      remove: setUp ?? (!sono || st.load === 0 ? 'Nothing is hanging on the wire.' : undefined),
      rider: setUp ?? (!sono ? 'No rider in this experiment.' : st.rider ? 'The rider is on the wire.' : undefined),
    };
  };
  const why = whyNow();
  const say = (m: string) => notify(m, 'warning', 2600);
  const guard = (w: string | undefined, run: () => void) => (w ? say(w) : run());
  const ops: Ops = {
    why,
    place: (id) => {
      const { scene } = now();
      if (!scene.collected.has(id)) return say(`Collect the ${APPARATUS_LABEL[id].toLowerCase()} first.`);
      if (id === 'stand' && !scene.placed.has('tube')) return say('Stand the jar of water and the tube first.');
      if (id === 'rule' && !scene.placed.has('stand')) return say('Clamp the tube first.');
      if (scene.placed.has(id)) return;
      o.note(`place:${id}`);
      play('clink');
      view().set({ selected: null });
    },
    placeNext: () => guard(whyNow().place, () => ops.place(now().scene.nextPlace!)),
    pickFork: (f) =>
      guard(whyNow().fork, () => {
        o.pickFork(f);
        play('clink');
      }),
    strike: (on = 'pad') =>
      guard(whyNow().strike, () => {
        const m = o.strike(on);
        if (m) return say(m);
        if (on === 'bench') {
          play('oops');
          notify('Clang! Never strike a fork on the bench: use the rubber pad.', 'warning', 2600);
        }
      }),
    damp: () => o.damp(),
    nudge: (d) => guard(whyNow().len, () => o.nudge(d)),
    setLen: (l) => guard(whyNow().len, () => o.setLen(l)),
    read: () => guard(whyNow().read, () => useLabView.setState({ mode: 'read', selected: null, spot: null })),
    take: () =>
      guard(whyNow().take, () => {
        o.takeReading();
        play('success');
      }),
    hangHanger: () =>
      guard(whyNow().hanger, () => {
        o.hangHanger();
        play('clink');
      }),
    addMass: () =>
      guard(whyNow().add, () => {
        o.addMass();
        play('clink');
      }),
    removeMass: () =>
      guard(whyNow().remove, () => {
        o.removeMass();
        play('tick');
      }),
    placeRider: () =>
      guard(whyNow().rider, () => {
        o.placeRider();
        play('tick');
      }),
  };
  return ops;
}

export interface ActionCtx {
  o: Sound;
  s: PhySoundState;
  scene: SceneState;
  ops: Ops;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}

const act = (key: string, label: string, run: () => void, blocked?: string, tone?: 'brand'): LabAction => ({ key, label, run, blocked, tone });

/** The panel for the object `id` (null: nothing to show). */
export function objectPanel(id: string, ctx: ActionCtx): ObjectPanel | null {
  const { o, s, scene, ops } = ctx;
  const task = s.task ?? 'TUBE';
  const sono = task === 'SONO';
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
  const inUse = (a: ApparatusId) => scene.placed.has(a) || (NEEDED[task].includes(a) && s.readings.length > 0);
  const returnable = (a: ApparatusId) => act('return', 'Put back in the cupboard', () => (o.note(`return:${a}`), view().set({ selected: null })), inUse(a) ? 'You are using it.' : undefined);
  const { min, max } = lenLimits(task);
  const lenActs = (what: string): LabAction[] => [
    act('m1', `${what} −1 cm`, () => ops.nudge(-1), ops.why.len ?? (s.len <= min ? 'As short as it goes.' : undefined)),
    act('m01', `${what} −0.1 cm`, () => ops.nudge(-0.1), ops.why.len),
    act('p01', `${what} +0.1 cm`, () => ops.nudge(0.1), ops.why.len),
    act('p1', `${what} +1 cm`, () => ops.nudge(1), ops.why.len ?? (s.len >= max ? 'As long as it goes.' : undefined)),
  ];
  const strikeActs: LabAction[] = [
    act('strike', sono ? 'Strike the fork on the pad and press its stem on the box' : 'Strike the fork on the pad and hold it over the mouth', () => ops.strike('pad'), ops.why.strike, 'brand'),
    act('bench', 'Strike it on the bench', () => ops.strike('bench'), ops.why.strike),
    act('damp', 'Stop it ringing (touch the prongs)', ops.damp, o.strikeRef.current ? undefined : 'It is not ringing.'),
  ];
  switch (id) {
    case 'cupboard':
      return { title: 'Apparatus cupboard', info: `Choose the apparatus you need for ${sono ? 'the sonometer' : 'the resonance tube'}.`, actions: [act('list', 'Choose apparatus…', () => ctx.open('cupboard'), undefined, 'brand')] };
    case 'mybench':
      return {
        title: 'Your bench',
        info: 'Bench 2: your task card and notebook are here.',
        actions: view().mode === 'walk' ? [act('sit', 'Work at my bench', () => view().set({ mode: 'bench', focus: 'bench', selected: null }), undefined, 'brand')] : [act('stand', 'Stand up and walk', () => view().set({ mode: 'walk', selected: null }))],
      };
    case 'tube':
    case 'stand':
    case 'rule':
    case 'sonometer': {
      const a = id as ApparatusId;
      if (!scene.placed.has(a)) return { title: APPARATUS_LABEL[a], info: 'On your bench, not yet set up.', actions: [act('place', PLACE_LABEL[a] ?? 'Set it up', () => ops.place(a), undefined, 'brand'), returnable(a)] };
      if (a === 'tube') return { title: 'Resonance tube', info: `${s.len.toFixed(1)} cm of air above the water. Raise it slowly from a short column; the first loud sound is the first resonance.`, actions: [...lenActs(s.len < 20 ? 'Air column' : 'Air column'), act('read', 'Read l at eye level', ops.read, ops.why.read), act('take', 'Take this length', ops.take, ops.why.take, 'brand')] };
      if (a === 'stand') return { title: 'Clamp and stand', info: 'Holds the tube vertical. Loosen, slide the tube up or down, tighten.', actions: lenActs('Tube') };
      if (a === 'rule') return { title: 'Metre rule', info: 'Along the tube, 0 at the open top: read it at the water surface with your eye level with it.', actions: [act('read', 'Read l at eye level', ops.read, ops.why.read, 'brand')] };
      return { title: 'Sonometer', info: `Bridges ${s.len.toFixed(1)} cm apart. ${loadName(s.load)}.`, actions: [...lenActs('Bridge'), act('take', 'Take this length', ops.take, ops.why.take, 'brand')] };
    }
    case 'bridge':
      return { title: 'Moving bridge', info: `${s.len.toFixed(1)} cm from the fixed bridge (read its edge on the scale). Move it slowly while the fork sounds.`, actions: [...lenActs('Bridge'), act('take', 'Take this length', ops.take, ops.why.take, 'brand')] };
    case 'rider':
      return { title: 'Paper rider', info: s.rider ? 'On the middle of the wire: it is thrown off when the wire resonates.' : 'A small folded paper V.', actions: [act('place', 'Place the rider on the middle of the wire', ops.placeRider, ops.why.rider, 'brand')] };
    case 'hanger':
      return {
        title: 'Hanger and slotted masses',
        info: `${loadName(s.load)}: T = Mg. Keep it the same for every fork.`,
        actions: s.load === 0 ? [act('hang', 'Hang the 1 kg hanger on the wire', ops.hangHanger, ops.why.hanger, 'brand')] : [act('add', 'Add 0.5 kg', ops.addMass, ops.why.add, 'brand'), act('off', s.load === SONO_HANGER ? 'Take the hanger off' : 'Take 0.5 kg off', ops.removeMass, ops.why.remove)],
      };
    case 'masses':
      return { title: 'Slotted masses', info: 'Each 0.5 kg; the hanger is 1 kg.', actions: s.load === 0 ? [act('hang', 'Hang the hanger on the wire', ops.hangHanger, ops.why.hanger, 'brand'), returnable('masses')] : [act('add', 'Add 0.5 kg', ops.addMass, ops.why.add, 'brand'), act('off', 'Take 0.5 kg off', ops.removeMass, ops.why.remove)] };
    case 'forks':
      return {
        title: 'Set of tuning forks',
        info: s.fork ? `In your hand: the ${s.fork} Hz fork.` : 'Each fork has its frequency stamped on it.',
        actions: [...SOUND_FORKS.map((f) => act(`f${f}`, `Take the ${f} Hz fork`, () => ops.pickFork(f), ops.why.fork, s.fork === f ? 'brand' : undefined)), returnable('forks')],
      };
    case 'fork':
      return { title: `Tuning fork (${s.fork ?? '—'} Hz)`, info: o.strikeRef.current ? 'Ringing: its sound dies away in a few seconds.' : 'Strike it on the rubber pad, never on the bench or the glass.', actions: strikeActs };
    case 'pad':
      return { title: 'Rubber pad', info: 'Strike the forks on this, so they ring with a pure note and are not damaged.', actions: strikeActs.slice(0, 1) };
    case 'book':
      return { title: 'Practical notebook', info: 'Your table, graph and answers.', actions: [act('open', 'Open the notebook', () => ctx.open('notebook'), undefined, 'brand')] };
    case 'card':
      return { title: 'Task card', info: 'The question paper.', actions: [act('open', 'Read the task card', () => ctx.open('task'), undefined, 'brand')] };
    case 'bob':
    case 'lens':
      return { title: APPARATUS_LABEL[id], info: 'Not needed for this practical.', actions: [returnable(id)] };
    case 'coat':
      return { title: 'Lab coat', info: 'Optional for this practical.', actions: [scene.coat ? act('off', 'Take off the lab coat', () => o.note('safety-off:coat')) : act('on', 'Put on the lab coat', () => o.note('safety:coat'))] };
    case 'whiteboard':
      return { title: 'Whiteboard', info: `Today: ${sono ? 'the sonometer' : 'the speed of sound with a resonance tube'}.`, actions: [] };
    default:
      return APPARATUS.some((x) => x.id === id) ? { title: APPARATUS_LABEL[id as ApparatusId], actions: [] } : ROOM_INFO[id] ? { title: ROOM_INFO[id]![0], info: ROOM_INFO[id]![1], actions: [] } : null;
  }
}

const ROOM_INFO: Record<string, [string, string]> = {
  goggles: ['Safety goggles', 'Wear them when loading the sonometer wire: a snapping wire can whip.'],
  shelf: ['Physics equipment shelf', 'Equipment for other practicals: you need nothing from here.'],
  vdg: ['Van de Graaff generator', 'Teacher only.'],
  co2: ['CO₂ fire extinguisher', 'For electrical fires.'],
  blanket: ['Fire blanket', 'Pull the tapes down sharply to use it.'],
  extinguisher: ['Fire extinguisher', 'By the door.'],
  firstaid: ['First-aid box', 'Tell the teacher about any injury.'],
  eyewash: ['Eye-wash station', 'Rinse for 10 minutes.'],
  notice: ['Notice board', 'Department notices and WAEC tips.'],
  desk: ['Teacher’s desk', 'The teacher marks the work here.'],
  'poster-si': ['Poster: SI base units', 'Length in m, time in s, mass in kg; frequency in Hz = s⁻¹.'],
  'poster-light': ['Poster: refraction of light', 'For the optics practicals.'],
  'poster-electric': ['Poster: electrical safety', 'Nothing electrical in this practical.'],
};
