import { FIELD_STARTS, type EmCore, type FieldArr, type FieldFacing, type IndCoil, type IndKind, type PhyMagnetismState } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { CORE_NAME, openSheet, type Magnetism } from '../actions';
import { benchBusy, startRun } from './bench-store';
import { APPARATUS, APPARATUS_LABEL, NEEDED, PLACE_LABEL, sceneFromState, type ApparatusId, type SceneState } from './scene-state';

/**
 * Everything the student can do at the magnetism bench, as plain operations
 * (used by the dock, the object menus, the drags and the demo) and as each
 * object's menu. Marked changes go through the shared actions; collecting
 * and setting out are log notes without marks.
 */

const view = () => useLabView.getState();
export const RUN_MS = { lift: 1600, move: 2200 };

export interface Ops {
  place: (id: ApparatusId) => void;
  placeNext: () => void;
  read: () => void;
  // FIELD
  meridian: () => void;
  steel: () => void;
  facing: (f: FieldFacing) => void;
  arr: (a: FieldArr) => void;
  compassSize: () => void;
  tap: (b: boolean) => void;
  start: (k: number) => void;
  dot: () => void;
  toEnd: () => void;
  arrows: () => void;
  cmove: (dx: number, dy: number) => void;
  cat: (x: number, y: number) => void;
  neutral: () => void;
  unmark: () => void;
  fresh: () => void;
  // ELECTROMAGNET
  wind: (n: number) => void;
  mixed: (b: boolean) => void;
  core: (c: EmCore) => void;
  rheo: (d: number) => void;
  key: () => void;
  lift: () => void;
  // INDUCTION
  coil: (c: IndCoil) => void;
  pole: () => void;
  magnets: () => void;
  speed: () => void;
  axis: () => void;
  galvo: () => void;
  move: (k: IndKind) => void;
  // DIODE
  bias: () => void;
  resistor: () => void;
  vm: () => void;
  range: () => void;
  pot: (d: number) => void;
  reading: () => void;
  replace: () => void;
  why: { place?: string; bench?: string; run?: string };
}

export function makeOps(o: Magnetism): Ops {
  const now = () => {
    const st = o.ref.current;
    return { st, scene: sceneFromState(st) };
  };
  const whyNow = () => {
    const { st, scene } = now();
    const setUp = !scene.ready ? `Collect your apparatus first (${scene.missing.length} still in the cupboard).` : !scene.set ? 'Set up the apparatus first (the dock’s button).' : undefined;
    return {
      place: !st.task ? 'Choose the experiment first.' : !scene.nextPlace ? 'Everything is set out.' : !scene.collected.has(scene.nextPlace) ? `Collect the ${APPARATUS_LABEL[scene.nextPlace].toLowerCase()} first.` : undefined,
      bench: setUp,
      run: setUp ?? (benchBusy() ? 'Wait for this one to finish.' : undefined),
    };
  };
  const why = whyNow();
  const say = (m: string) => notify(m, 'warning', 2400);
  const guard = (w: string | undefined) => (w ? (say(w), true) : false);
  const msg = (m: string | null) => (m ? (say(m), false) : true);
  const ops: Ops = {
    why,
    place: (id) => {
      const { scene } = now();
      if (!scene.collected.has(id)) return say(`Collect the ${APPARATUS_LABEL[id].toLowerCase()} first.`);
      if (scene.placed.has(id)) return;
      if (scene.nextPlace !== id) return say(`${PLACE_LABEL[scene.nextPlace!] ?? 'Set out the earlier things'} first.`);
      o.note(`place:${id}`);
      play('clink');
      view().set({ selected: null });
    },
    placeNext: () => {
      const w = whyNow().place;
      if (w) return say(w);
      ops.place(now().scene.nextPlace!);
    },
    read: () => {
      if (guard(whyNow().bench)) return;
      useLabView.setState({ mode: 'read', selected: null, spot: null });
    },
    // ---------------------------------------------------------------- FIELD
    meridian: () => {
      if (guard(whyNow().bench)) return;
      o.markMeridian();
      play('tick');
      notify('The compass alone sets along the meridian: you rule the N–S line and turn the paper so its edge lies along it.', 'success', 2600);
    },
    steel: () => {
      o.clearSteel();
      play('clink');
      notify('Keys and phone are in your bag, away from the board.', 'success', 1800);
    },
    facing: (f) => {
      if (guard(whyNow().run)) return;
      o.setFacing(f);
      play('clink');
    },
    arr: (a) => {
      if (guard(whyNow().run)) return;
      o.setArr(a);
      play('clink');
    },
    compassSize: () => o.setCompass(o.ref.current.compass === 'small' ? 'large' : 'small'),
    tap: (b) => o.setTapEach(b),
    start: (k) => {
      if (guard(whyNow().bench)) return;
      if (msg(o.startLine(k))) {
        const st = o.ref.current;
        const sh = openSheet(st);
        void sh;
        play('tick');
      }
    },
    dot: () => {
      if (guard(whyNow().bench)) return;
      if (msg(o.nextDot())) play('tick');
    },
    toEnd: () => {
      if (guard(whyNow().bench)) return;
      if (msg(o.nextDot(true))) play('tick');
    },
    arrows: () => {
      if (guard(whyNow().bench)) return;
      if (msg(o.arrows())) play('tick');
    },
    cmove: (dx, dy) => {
      if (guard(whyNow().bench)) return;
      o.moveCompass(dx, dy);
    },
    cat: (x, y) => o.setCompassAt(x, y),
    neutral: () => {
      if (guard(whyNow().bench)) return;
      if (msg(o.markNeutral())) play('tick');
    },
    unmark: () => o.unmark(),
    fresh: () => {
      o.freshSheet();
      notify('A fresh sheet is on the board.', 'info', 1600);
    },
    // ---------------------------------------------------------------- ELECTROMAGNET
    wind: (n) => {
      if (guard(whyNow().run)) return;
      o.wind(n);
      play('creak');
      notify(`${n} turns wound tightly on the nail.`, 'success', 1600);
    },
    mixed: (b) => o.setMixed(b),
    core: (c) => {
      if (guard(whyNow().run)) return;
      if (c === 'steel' && !now().scene.collected.has('steelrod')) return say('Collect the steel rod from the cupboard first.');
      o.setCore(c);
      play('clink');
    },
    rheo: (d) => {
      if (guard(whyNow().run)) return;
      o.moveRheo(d);
    },
    key: () => {
      if (guard(whyNow().run)) return;
      if (o.ref.current.key) o.openKey();
      else o.closeKey();
      play('clink');
    },
    lift: () => {
      if (guard(whyNow().run)) return;
      if (!o.ref.current.key) return say('Close the key first: no current, no magnet.');
      const k = o.lift();
      if (k === null) return;
      startRun('lift', k, RUN_MS.lift);
      play('creak');
    },
    // ---------------------------------------------------------------- INDUCTION
    coil: (c) => {
      if (guard(whyNow().run)) return;
      if (o.ref.current.magIn) return say('Pull the magnet out first.');
      o.setCoil(c);
      play('clink');
    },
    pole: () => {
      if (guard(whyNow().run)) return;
      if (o.ref.current.magIn) return say('Pull the magnet out first.');
      o.setPole(o.ref.current.pole === 'N' ? 'S' : 'N');
    },
    magnets: () => {
      if (guard(whyNow().run)) return;
      if (o.ref.current.magIn) return say('Pull the magnet out first.');
      o.setMagnets(o.ref.current.magnets === 2 ? 1 : 2);
    },
    speed: () => o.setSpeed(o.ref.current.speed === 'fast' ? 'slow' : 'fast'),
    axis: () => o.setAxis(!o.ref.current.axis),
    galvo: () => {
      if (guard(whyNow().run)) return;
      o.setGalvoFar(!o.ref.current.galvoFar);
      play('clink');
    },
    move: (kind) => {
      if (guard(whyNow().run)) return;
      const st = o.ref.current;
      if (kind === 'in' && st.magIn) return say('The magnet is already in the coil.');
      if (kind !== 'in' && !st.magIn) return say('Push the magnet in first.');
      const k = o.move(kind);
      if (k === null) return;
      startRun('move', k, RUN_MS.move);
      play('tick');
    },
    // ---------------------------------------------------------------- DIODE
    bias: () => {
      if (guard(whyNow().bench)) return;
      o.setBias(o.ref.current.bias === 'fwd' ? 'rev' : 'fwd');
      play('clink');
    },
    resistor: () => {
      if (guard(whyNow().bench)) return;
      o.setResistor(!o.ref.current.resistor);
      play('clink');
    },
    vm: () => {
      if (guard(whyNow().bench)) return;
      o.setVm(o.ref.current.vm === 'diode' ? 'both' : 'diode');
    },
    range: () => o.setRange(o.ref.current.range === 1 ? 10 : 1),
    pot: (d) => {
      if (guard(whyNow().bench)) return;
      o.movePot(d);
    },
    reading: () => {
      if (guard(whyNow().bench)) return;
      if (!o.ref.current.key) return say('Close the key to take a reading.');
      if (o.read() !== null) {
        play('tick');
        notify('Reading recorded: write both meters’ values in the table.', 'success', 1600);
      }
    },
    replace: () => {
      o.replaceDiode();
      play('clink');
    },
  };
  return ops;
}

export interface ActionCtx {
  o: Magnetism;
  s: PhyMagnetismState;
  scene: SceneState;
  ops: Ops;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}

const act = (key: string, label: string, run: () => void, blocked?: string, tone?: 'brand'): LabAction => ({ key, label, run, blocked, tone });

export function objectPanel(id: string, ctx: ActionCtx): ObjectPanel | null {
  const { o, s, scene, ops } = ctx;
  const task = s.task ?? 'FIELD';
  if (id.startsWith('cup:')) {
    const a = id.slice(4) as ApparatusId;
    return {
      title: APPARATUS_LABEL[a],
      info: 'In the apparatus cupboard.',
      actions: [
        act(
          'take',
          'Take to my bench',
          () => {
            o.note(`collect:${a}`);
            play('clink');
            view().set({ selected: null });
            notify(`${APPARATUS_LABEL[a]} is on your bench.`, 'success', 1600);
          },
          undefined,
          'brand',
        ),
      ],
    };
  }
  const returnable = (a: ApparatusId) => act('return', 'Put back in the cupboard', () => (o.note(`return:${a}`), view().set({ selected: null })), scene.placed.has(a) ? 'You are using it.' : undefined);
  const placeAct = (a: ApparatusId): LabAction[] => (scene.collected.has(a) && !scene.placed.has(a) && PLACE_LABEL[a] ? [act('place', PLACE_LABEL[a]!, () => ops.place(a), scene.nextPlace !== a ? `${PLACE_LABEL[scene.nextPlace!] ?? 'Set out the earlier things'} first.` : undefined, 'brand')] : []);
  const readAct = (label: string) => act('read', label, ops.read, ops.why.bench, 'brand');
  const b = ops.why.bench;
  const r = ops.why.run;
  switch (id) {
    case 'cupboard':
      return { title: 'Apparatus cupboard', info: 'Choose the apparatus you need for today’s practical.', actions: [act('list', 'Choose apparatus…', () => ctx.open('cupboard'), undefined, 'brand')] };
    case 'mybench':
      return {
        title: 'Your bench',
        info: 'Bench 2: your task card and notebook are here.',
        actions: view().mode === 'walk' ? [act('sit', 'Work at my bench', () => view().set({ mode: 'bench', focus: 'bench', selected: null }), undefined, 'brand')] : [act('stand', 'Stand up and walk', () => view().set({ mode: 'walk', selected: null }))],
      };
    case 'book':
      return { title: 'Practical notebook', info: 'Your table, graph and answers.', actions: [act('open', 'Open the notebook', () => ctx.open('notebook'), undefined, 'brand')] };
    case 'card':
      return { title: 'Task card', info: 'The question paper.', actions: [act('open', 'Read the task card', () => ctx.open('task'), undefined, 'brand')] };
    case 'coat':
      return { title: 'Lab coat', info: 'Optional for this practical.', actions: [scene.coat ? act('off', 'Take off the lab coat', () => o.note('safety-off:coat')) : act('on', 'Put on the lab coat', () => o.note('safety:coat'))] };
    // ---------------------------------------------------------------- FIELD
    case 'board':
      return { title: 'Drawing board', info: 'Flat on the bench, away from iron.', actions: [...placeAct('board'), returnable('board')] };
    case 'paper':
      return {
        title: 'The sheet',
        info: s.meridian ? 'Lined up with the magnetic meridian.' : 'Not yet lined up with the meridian.',
        actions: [...placeAct('paper'), act('meridian', 'Mark the meridian with the compass alone', ops.meridian, b, s.meridian ? undefined : 'brand'), act('arrows', 'Draw arrows on the lines (N → S)', ops.arrows, b), act('fresh', 'Pin on a fresh sheet', ops.fresh, b), readAct('Look at the sheet close up')],
      };
    case 'magnet':
      return {
        title: s.arr === 'one' ? `Bar magnet (N pointing ${s.facing})` : `Two magnets (${s.arr === 'like' ? 'like' : 'unlike'} poles facing)`,
        info: 'Its outline is drawn on the paper.',
        actions: [...placeAct('magnet'), act('turn', s.facing === 'north' ? 'Turn it round: N pointing south' : 'Turn it round: N pointing north', () => ops.facing(s.facing === 'north' ? 'south' : 'north'), r), act('one', 'One magnet', () => ops.arr('one'), r), act('like', 'Two magnets, like poles facing', () => ops.arr('like'), r), act('unlike', 'Two magnets, unlike poles facing', () => ops.arr('unlike'), r)],
      };
    case 'compass':
      return {
        title: `Plotting compass (${s.compass})`,
        info: `At (${s.cx.toFixed(1)}, ${s.cy.toFixed(1)}) cm. ${s.tapEach ? 'You tap it before each dot.' : 'You are not tapping it.'}`,
        actions: [
          act('dot', 'Mark the next dot', ops.dot, b, 'brand'),
          act('end', 'Dot to dot to the end of the line', ops.toEnd, b),
          ...FIELD_STARTS.slice(0, 10).map((_, k) => act(`s${k}`, `Start a line at point ${k + 1}`, () => ops.start(k), b)),
          act('tap', s.tapEach ? 'Stop tapping it' : 'Tap it gently before each dot', () => ops.tap(!s.tapEach)),
          act('size', s.compass === 'small' ? 'Use the large compass' : 'Use the small compass', ops.compassSize),
          act('neutral', 'Mark a neutral point here', ops.neutral, b),
          readAct('Look at the needle'),
        ],
      };
    case 'keys':
      return { title: 'Keys and a phone', info: 'Steel and a magnet in the phone’s speaker — right beside the board.', actions: [act('away', 'Put them in my bag', ops.steel, undefined, 'brand')] };
    // ---------------------------------------------------------------- ELECTROMAGNET
    case 'cells':
      return { title: APPARATUS_LABEL.cells, info: task === 'DIODE' ? 'Three 1.5 V cells across the potentiometer.' : 'Two 1.5 V cells.', actions: [...placeAct('cells'), returnable('cells')] };
    case 'key':
      return { title: 'Plug key', info: s.key ? 'Closed: current flows.' : 'Open.', actions: [...placeAct('key'), act('key', s.key ? 'Open the key' : 'Close the key', ops.key, task === 'DIODE' ? b : r, 'brand')] };
    case 'rheostat':
      return { title: 'Rheostat (0–15 Ω)', info: `Slider at ${Math.round(s.rheo * 100)} %.`, actions: [...placeAct('rheostat'), act('up', 'Slide it: more resistance (less current)', () => ops.rheo(0.02), r), act('down', 'Slide it: less resistance (more current)', () => ops.rheo(-0.02), r), act('fup', 'A little more resistance', () => ops.rheo(0.002), r), act('fdown', 'A little less resistance', () => ops.rheo(-0.002), r)] };
    case 'ammeter':
      return { title: 'Ammeter (0–3 A)', info: '0.1 A divisions: read to 0.05 A.', actions: [...placeAct('ammeter'), readAct('Read the ammeter')] };
    case 'nail':
      return {
        title: `Electromagnet: ${s.turns} turns, ${CORE_NAME[s.core]}`,
        info: s.mixed ? 'Some turns are wound the other way.' : 'Every turn wound the same way.',
        actions: [...placeAct('nail'), act('lift', 'Dip into the clips and lift', ops.lift, r ?? (!s.key ? 'Close the key first.' : undefined), 'brand'), act('w30', 'Wind it to 30 turns', () => ops.wind(30), r), act('w60', 'Wind it to 60 turns', () => ops.wind(60), r), act('iron', 'Use the soft-iron nail', () => ops.core('iron'), r), act('steel', 'Use the steel rod', () => ops.core('steel'), r), act('none', 'Slide the core out (coil alone)', () => ops.core('none'), r), act('mixed', s.mixed ? 'Rewind every turn the same way' : 'Rewind some turns the other way', () => ops.mixed(!s.mixed)), readAct('Count the clips')],
      };
    case 'clips':
      return { title: 'Steel paper clips', info: 'All the same size.', actions: [act('lift', 'Dip the nail and lift', ops.lift, r, 'brand')] };
    // ---------------------------------------------------------------- INDUCTION
    case 'coil200':
    case 'coil600':
      return { title: `Coil (${s.coil} turns in use)`, info: 'Joined to the galvanometer.', actions: [...placeAct('coil200'), act('c200', 'Use the 200-turn coil', () => ops.coil(200), r), act('c600', 'Use the 600-turn coil', () => ops.coil(600), r)] };
    case 'galvo':
      return { title: 'Centre-zero galvanometer', info: s.galvoFar ? 'Well away from the magnet.' : 'Beside the coil, close to the magnet.', actions: [...placeAct('galvo'), act('move', s.galvoFar ? 'Move it beside the coil' : 'Move it well away from the magnet', ops.galvo, r), readAct('Read the galvanometer')] };
    case 'magnets':
      return {
        title: s.magnets === 2 ? 'Two bar magnets together' : 'Bar magnet',
        info: `${s.pole} pole towards the coil, ${s.speed}, ${s.axis ? 'along the axis' : 'from the side'}.`,
        actions: [act('in', 'Push it into the coil', () => ops.move('in'), r ?? (s.magIn ? 'It is in the coil.' : undefined), 'brand'), act('still', 'Hold it still inside', () => ops.move('still'), r ?? (!s.magIn ? 'Push it in first.' : undefined)), act('out', 'Pull it out', () => ops.move('out'), r ?? (!s.magIn ? 'Push it in first.' : undefined), 'brand'), act('pole', 'Turn it round (other pole first)', ops.pole, r), act('two', s.magnets === 2 ? 'Use one magnet' : 'Use two magnets together', ops.magnets, r), act('speed', s.speed === 'fast' ? 'Move it slowly' : 'Move it quickly', ops.speed), act('axis', s.axis ? 'Move it in from the side' : 'Move it along the axis', ops.axis)],
      };
    case 'leads':
      return { title: 'Connecting wires', info: 'Firm connections.', actions: [...placeAct('leads')] };
    // ---------------------------------------------------------------- DIODE
    case 'pot':
      return { title: 'Potentiometer', info: `${(s.pot * 100).toFixed(1)} % of the cells’ p.d.`, actions: [...placeAct('pot'), act('up', 'Turn it up', () => ops.pot(0.02), b), act('down', 'Turn it down', () => ops.pot(-0.02), b), act('fup', 'A little up', () => ops.pot(0.002), b), act('fdown', 'A little down', () => ops.pot(-0.002), b)] };
    case 'resistor':
      return { title: 'Protective resistor (100 Ω)', info: s.resistor ? 'In the circuit.' : 'Short-circuited: out of the circuit!', actions: [...placeAct('resistor'), act('r', s.resistor ? 'Take it out of the circuit' : 'Put it back in the circuit', ops.resistor, b)] };
    case 'diode':
      return { title: 'Silicon diode', info: s.burnt ? 'Burnt out!' : s.bias === 'fwd' ? 'Forward bias: anode to +.' : 'Reverse bias.', actions: [...placeAct('diode'), act('bias', s.bias === 'fwd' ? 'Turn it round (reverse bias)' : 'Turn it round (forward bias)', ops.bias, b), ...(s.burnt ? [act('rep', 'Replace the diode', ops.replace, undefined, 'brand')] : [])] };
    case 'mamm':
      return { title: 'Milliammeter (0–50 mA)', info: '1 mA divisions: read to 0.5 mA.', actions: [...placeAct('mamm'), act('read', 'Record this reading', ops.reading, b ?? (!s.key ? 'Close the key first.' : undefined), 'brand'), readAct('Read the meters')] };
    case 'vmeter':
      return { title: `Voltmeter (0–${s.range} V range)`, info: s.vm === 'diode' ? 'Across the diode.' : 'Across the diode and the resistor.', actions: [...placeAct('vmeter'), act('range', s.range === 1 ? 'Switch to the 0–10 V range' : 'Switch to the 0–1 V range', ops.range), act('vm', s.vm === 'diode' ? 'Connect it across diode and resistor' : 'Connect it across the diode only', ops.vm, b), readAct('Read the meters')] };
    case 'whiteboard':
      return { title: 'Whiteboard', info: 'Today’s practical.', actions: [] };
  }
  if (APPARATUS.some((x) => x.id === id)) return { title: APPARATUS_LABEL[id as ApparatusId], info: NEEDED[task].includes(id as ApparatusId) ? 'On your bench.' : 'Not needed for this practical.', actions: [...placeAct(id as ApparatusId), returnable(id as ApparatusId)] };
  return ROOM_INFO[id] ? { title: ROOM_INFO[id]![0], info: ROOM_INFO[id]![1], actions: [] } : null;
}

const ROOM_INFO: Record<string, [string, string]> = {
  goggles: ['Safety goggles', 'Not needed for this practical.'],
  shelf: ['Physics equipment shelf', 'Equipment for other practicals.'],
  vdg: ['Van de Graaff generator', 'Teacher only.'],
  co2: ['CO₂ fire extinguisher', 'For electrical fires.'],
  blanket: ['Fire blanket', 'Pull the tapes down sharply to use it.'],
  extinguisher: ['Fire extinguisher', 'By the door.'],
  firstaid: ['First-aid box', 'Tell the teacher about any injury.'],
  eyewash: ['Eye-wash station', 'Rinse for 10 minutes.'],
  notice: ['Notice board', 'Department notices and WAEC tips.'],
  desk: ['Teacher’s desk', 'The teacher marks the work here.'],
  'poster-si': ['Poster: SI base units', 'Currents in A, p.d.s in V, flux in Wb.'],
  'poster-light': ['Poster: refraction of light', 'For the optics practicals.'],
  'poster-electric': ['Poster: electrical safety', 'Low-voltage cells only in this practical.'],
};
