import { SPRING_AMPS, SPRING_MAX_LOAD, SPRING_OSCILLATIONS, SPRING_STEP, type PhySpringState } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { loadName, MAX_RUNS, type Spring } from '../actions';
import { APPARATUS, APPARATUS_LABEL, NEEDED, PLACE_LABEL, sceneFromState, type ApparatusId, type SceneState } from './scene-state';

/**
 * Everything the student can do at the spring, as plain operations (used by
 * the dock, the object menus, the drag and the demo) and as each object's
 * menu. Marked changes go through the shared actions; collecting the apparatus
 * and setting it out are log notes without marks.
 */

const view = () => useLabView.getState();

export interface Ops {
  place: (id: ApparatusId) => void;
  placeNext: () => void;
  hangHanger: () => void;
  addMass: () => void;
  removeMass: () => void;
  steady: () => void;
  /** Eye-level view of the pointer on the rule (Hooke's law). */
  read: () => void;
  take: () => void;
  release: (amp?: number) => void;
  watch: () => void;
  resetWatch: () => void;
  record: () => void;
  why: { place?: string; bench?: string; hanger?: string; add?: string; remove?: string; read?: string; take?: string; release?: string; watch?: string; record?: string };
}

/** The operations on `o`: each reads the state as it is now (so the demo can run several in one tick). */
export function makeOps(o: Spring): Ops {
  const now = () => {
    const st = o.ref.current;
    return { st, scene: sceneFromState(st) };
  };
  const whyNow = () => {
    const { st, scene } = now();
    const osc = (st.task ?? 'HOOKE') === 'OSC';
    const setUp = !st.task ? 'Choose the experiment first.' : !scene.ready ? `Collect your apparatus first (${scene.missing.length} still in the cupboard).` : !scene.set ? 'Set up the spring first (the dock’s button).' : undefined;
    const w = o.watchRef.current;
    const m = o.motionRef.current;
    return {
      place: !st.task ? 'Choose the experiment first.' : !scene.nextPlace ? 'Everything is set up.' : !scene.collected.has(scene.nextPlace) ? `Collect the ${APPARATUS_LABEL[scene.nextPlace].toLowerCase()} first.` : undefined,
      bench: setUp,
      hanger: setUp ?? (st.load > 0 ? 'The hanger is on the spring.' : undefined),
      add: setUp ?? (st.load === 0 ? 'Hang the mass hanger first.' : st.load >= SPRING_MAX_LOAD ? 'That is every slotted mass.' : undefined),
      remove: setUp ?? (st.load === 0 ? 'Nothing is hanging on the spring.' : undefined),
      read: setUp ?? (osc ? 'There is no rule in this experiment: time the oscillations instead.' : undefined),
      take: setUp ?? (osc ? 'Time the oscillations instead.' : st.readings.length >= 40 ? 'The record is full.' : undefined),
      release: setUp ?? (!osc ? 'In Hooke’s law the spring stays at rest: steady it instead.' : st.load === 0 ? 'Hang the hanger and masses first.' : undefined),
      watch: setUp ?? (!m?.released ? 'Release the hanger first, then start the watch as it passes the fiducial mark.' : w.stop !== null ? 'The watch is stopped: record the timing or reset it.' : undefined),
      record: setUp ?? (w.stop === null ? 'Start and stop the watch first.' : st.runs.length >= MAX_RUNS ? 'The table is full.' : undefined),
    };
  };
  const why = whyNow();
  const say = (m: string) => notify(m, 'warning', 2600);
  const ops: Ops = {
    why,
    place: (id) => {
      const { scene } = now();
      if (!scene.collected.has(id)) return say(`Collect the ${APPARATUS_LABEL[id].toLowerCase()} first.`);
      if (id !== 'stand' && !scene.placed.has('stand')) return say('Stand the retort stand at the bench edge first.');
      if (id !== 'stand' && id !== 'spring' && !scene.placed.has('spring')) return say('Hang the spring from the clamp first.');
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
    hangHanger: () => {
      const w = whyNow().hanger;
      if (w) return say(w);
      o.hangHanger();
      play('clink');
    },
    addMass: () => {
      const w = whyNow().add;
      if (w) return say(w);
      o.addMass();
      play('clink');
    },
    removeMass: () => {
      const w = whyNow().remove;
      if (w) return say(w);
      if (o.ref.current.load === SPRING_STEP) o.removeHanger();
      else o.removeMass();
      play('tick');
    },
    steady: () => {
      o.steady();
      play('tick');
    },
    read: () => {
      const w = whyNow().read;
      if (w) return say(w);
      useLabView.setState({ mode: 'read', selected: null, spot: null });
    },
    take: () => {
      const w = whyNow().take;
      if (w) return say(w);
      const moving = o.moving();
      o.takeReading();
      play('success');
      if (moving) notify('Reading taken — but the pointer was still moving.', 'warning', 2400);
    },
    release: (amp) => {
      const w = whyNow().release;
      if (w) return say(w);
      const m = o.release(amp);
      if (m) return say(m);
      play('creak');
    },
    watch: () => {
      const w = whyNow().watch;
      if (w) return say(w);
      if (o.watchRef.current.start === null) o.startWatch();
      else o.stopWatch();
      play('tick');
    },
    resetWatch: () => o.resetWatch(),
    record: () => {
      const w = whyNow().record;
      if (w) return say(w);
      o.record();
      play('success');
    },
  };
  return ops;
}

export interface ActionCtx {
  o: Spring;
  s: PhySpringState;
  scene: SceneState;
  ops: Ops;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}

const act = (key: string, label: string, run: () => void, blocked?: string, tone?: 'brand'): LabAction => ({ key, label, run, blocked, tone });

/** The panel for the object `id` (null: nothing to show). */
export function objectPanel(id: string, ctx: ActionCtx): ObjectPanel | null {
  const { o, s, scene, ops } = ctx;
  const task = s.task ?? 'HOOKE';
  const osc = task === 'OSC';
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
  const inUse = (a: ApparatusId) => scene.placed.has(a) || (a === 'hanger' && s.load > 0) || (a === 'masses' && s.load > SPRING_STEP) || (NEEDED[task].includes(a) && (s.readings.length > 0 || s.runs.length > 0));
  const returnable = (a: ApparatusId) => act('return', 'Put back in the cupboard', () => (o.note(`return:${a}`), view().set({ selected: null })), inUse(a) ? 'You are using it.' : undefined);
  const loadActs: LabAction[] = [
    ...(s.load === 0 ? [act('hang', 'Hang the 50 g mass hanger on the spring', ops.hangHanger, ops.why.hanger, 'brand')] : []),
    ...(s.load > 0 ? [act('add', 'Add a 50 g slotted mass', ops.addMass, ops.why.add, 'brand'), act('off', s.load === SPRING_STEP ? 'Take the hanger off' : 'Take a 50 g mass off', ops.removeMass, ops.why.remove)] : []),
    act('steady', 'Steady the hanger (stop it bouncing)', ops.steady, ops.why.bench),
  ];
  switch (id) {
    case 'cupboard':
      return { title: 'Apparatus cupboard', info: `Choose the apparatus you need for ${osc ? 'the oscillations of a loaded spring' : 'Hooke’s law'}.`, actions: [act('list', 'Choose apparatus…', () => ctx.open('cupboard'), undefined, 'brand')] };
    case 'mybench':
      return {
        title: 'Your bench',
        info: 'Bench 2: your task card and notebook are here.',
        actions: view().mode === 'walk' ? [act('sit', 'Work at my bench', () => view().set({ mode: 'bench', focus: 'bench', selected: null }), undefined, 'brand')] : [act('stand', 'Stand up and walk', () => view().set({ mode: 'walk', selected: null }))],
      };
    case 'stand':
    case 'spring':
    case 'rule':
    case 'pointer':
    case 'fiducial': {
      const a = id as ApparatusId;
      if (!scene.placed.has(a)) return { title: APPARATUS_LABEL[a], info: 'On your bench, not yet set up.', actions: [act('place', PLACE_LABEL[a] ?? 'Set it up', () => ops.place(a), undefined, 'brand'), returnable(a)] };
      if (a === 'stand') return { title: 'Retort stand and clamp', info: 'Clamped firmly near the bench edge, so the load hangs clear of the bench.', actions: [] };
      if (a === 'spring') return { title: 'Spiral spring', info: `Carrying ${loadName(s.load)}.`, actions: loadActs };
      if (a === 'rule') return { title: 'Metre rule', info: 'Clamped vertically, 0 at the top: the pointer reading increases as the spring stretches.', actions: [act('read', 'Read the pointer at eye level', ops.read, ops.why.read, 'brand')] };
      if (a === 'pointer') return { title: 'Pointer', info: 'A pin fixed with plasticine to the spring’s lower end. Read its tip against the rule with your eye level with it.', actions: [act('read', 'Read the pointer at eye level', ops.read, ops.why.read, 'brand'), act('take', 'Take this reading', ops.take, ops.why.take)] };
      return { title: 'Fiducial pointer', info: 'Marks the hanger’s rest position: start and stop the watch as the hanger passes it.', actions: [] };
    }
    case 'hanger':
      return {
        title: 'Mass hanger and slotted masses',
        info: `${loadName(s.load)} on the spring.`,
        actions: osc
          ? [
              ...SPRING_AMPS.map((a) => act(`r${a}`, `Pull down ${a} cm and release`, () => ops.release(a), ops.why.release, a === s.amp ? 'brand' : undefined)),
              ...loadActs,
            ]
          : [...loadActs, act('read', 'Read the pointer at eye level', ops.read, ops.why.read, 'brand')],
      };
    case 'hanger-bench':
      return { title: 'Mass hanger (50 g)', info: 'The hanger counts as the first 50 g of the load.', actions: [act('hang', 'Hang it on the spring', ops.hangHanger, ops.why.hanger, 'brand'), returnable('hanger')] };
    case 'masses':
      return { title: 'Slotted masses', info: 'Each 50 g. Slide them onto the hanger one at a time.', actions: [act('add', 'Add one to the hanger', ops.addMass, ops.why.add, 'brand'), act('off', 'Take one off the hanger', ops.removeMass, ops.why.remove), returnable('masses')] };
    case 'stopwatch':
      if (!osc) return { title: 'Stopwatch', info: 'Not needed for Hooke’s law.', actions: [returnable('stopwatch')] };
      return {
        title: 'Stopwatch',
        info: `Timing ${s.n} oscillations. Start and stop as the hanger passes the fiducial mark.`,
        actions: [
          o.watchRef.current.start === null ? act('start', 'Start the stopwatch', ops.watch, ops.why.watch, 'brand') : act('stop', 'Stop the stopwatch', ops.watch, ops.why.watch, 'brand'),
          act('reset', 'Reset', ops.resetWatch, o.watchRef.current.start === null ? 'The watch is already at zero.' : undefined),
          act('record', 'Record this timing', ops.record, ops.why.record),
          ...SPRING_OSCILLATIONS.map((n) => act(`n${n}`, `Time ${n} oscillations`, () => o.setN(n), undefined, s.n === n ? 'brand' : undefined)),
        ],
      };
    case 'tray':
      return { title: 'Box under the load', info: 'If a mass slips off the hanger it lands in the box, not on your feet.', actions: [] };
    case 'book':
      return { title: 'Practical notebook', info: 'Your table, graph and answers.', actions: [act('open', 'Open the notebook', () => ctx.open('notebook'), undefined, 'brand')] };
    case 'card':
      return { title: 'Task card', info: 'The question paper.', actions: [act('open', 'Read the task card', () => ctx.open('task'), undefined, 'brand')] };
    case 'bob':
    case 'edge':
      return { title: APPARATUS_LABEL[id], info: 'Not needed for this practical.', actions: [returnable(id)] };
    case 'coat':
      return { title: 'Lab coat', info: 'Optional for this practical.', actions: [scene.coat ? act('off', 'Take off the lab coat', () => o.note('safety-off:coat')) : act('on', 'Put on the lab coat', () => o.note('safety:coat'))] };
    case 'whiteboard':
      return { title: 'Whiteboard', info: `Today: ${osc ? 'the oscillations of a loaded spring' : 'Hooke’s law and the spring constant'}.`, actions: [] };
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
  'poster-si': ['Poster: SI base units', 'Mass in kg, force in N, length in m.'],
  'poster-light': ['Poster: refraction of light', 'For the optics practicals.'],
  'poster-electric': ['Poster: electrical safety', 'Nothing electrical in this practical.'],
};
