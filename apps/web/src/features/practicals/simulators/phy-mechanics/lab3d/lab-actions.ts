import { VISC_BALLS, forceNominal, inclineReadings, viscBandTime, type ForceThread, type PhyMechanicsState, type ViscLiquid } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { boardSheet, type Mechanics } from '../actions';
import { benchBusy, startRun, useBench } from './bench-store';
import { APPARATUS, APPARATUS_LABEL, NEEDED, PLACE_LABEL, sceneFromState, type ApparatusId, type SceneState } from './scene-state';

/**
 * Everything the student can do at the mechanics bench, as plain operations
 * (used by the dock, the object menus, the drags and the demo) and as each
 * object's menu. Marked changes go through the shared actions; collecting
 * the apparatus and setting it out are log notes without marks.
 */

const view = () => useLabView.getState();
export const RUN_MS = { pull: 3200, tilt: 3400, weigh: 1100 };

export interface Ops {
  place: (id: ApparatusId) => void;
  placeNext: () => void;
  read: () => void;
  // FRICTION
  zero: () => void;
  wipe: () => void;
  load: (d: number) => void;
  weigh: () => void;
  jerk: (b: boolean) => void;
  fast: (b: boolean) => void;
  tilt: (b: boolean) => void;
  pull: () => void;
  raise: () => void;
  // VISCOSITY
  ball: (b: number) => void;
  measure: () => void;
  liquid: (l: ViscLiquid) => void;
  band: (which: 'top' | 'bot', d: number) => void;
  centre: (b: boolean) => void;
  eye: (b: boolean) => void;
  reset: () => void;
  drop: () => void;
  // INCLINE
  blocks: (d: number) => void;
  stop: (d: number) => void;
  stopAt: (cm: number) => void;
  push: (b: boolean) => void;
  roll: () => void;
  // FORCES
  mass: (th: ForceThread, d: number) => void;
  tap: () => void;
  dot: (th: ForceThread, far: boolean) => void;
  off: () => void;
  build: (i: number) => void;
  why: { place?: string; bench?: string; run?: string; pull?: string; raise?: string; build?: string };
}

/** The operations on `o`: each reads the state as it is now (so the demo can run several in one tick). */
export function makeOps(o: Mechanics): Ops {
  const now = () => {
    const st = o.ref.current;
    return { st, scene: sceneFromState(st) };
  };
  const whyNow = () => {
    const { st, scene } = now();
    const setUp = !scene.ready ? `Collect your apparatus first (${scene.missing.length} still in the cupboard).` : !scene.set ? 'Set up the apparatus first (the dock’s button).' : undefined;
    const busy = benchBusy() ? 'Wait for this one to finish.' : undefined;
    const sh = boardSheet(st);
    const off = st.sets.map((x, i) => (x.off ? i : -1)).filter((i) => i >= 0);
    return {
      place: !st.task ? 'Choose the experiment first.' : !scene.nextPlace ? 'Everything is set out.' : !scene.collected.has(scene.nextPlace) ? `Collect the ${APPARATUS_LABEL[scene.nextPlace].toLowerCase()} first.` : undefined,
      bench: setUp,
      run: setUp ?? busy,
      pull: setUp ?? busy ?? (st.tilt ? 'Lower the plank flat first.' : undefined),
      raise: setUp ?? busy ?? (!st.tilt ? 'Choose the tilted plank first.' : undefined),
      build: setUp ?? (!off.length ? (sh ? 'Take the paper off the board first.' : 'Mark the threads first.') : undefined),
    };
  };
  const why = whyNow();
  const say = (m: string) => notify(m, 'warning', 2400);
  const guard = (w: string | undefined) => (w ? (say(w), true) : false);
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
    // ---------------------------------------------------------------- FRICTION
    zero: () => {
      if (guard(whyNow().bench)) return;
      o.zero();
      play('tick');
      notify('Zero checked: the pointer now reads 0.00 N with nothing on the hook.', 'success', 2200);
    },
    wipe: () => {
      if (guard(whyNow().bench)) return;
      o.wipe();
      play('tick');
    },
    load: (d) => {
      if (guard(whyNow().run)) return;
      o.setLoad(o.ref.current.load + d);
      play('clink');
    },
    weigh: () => {
      if (guard(whyNow().run)) return;
      o.weigh();
      startRun('weigh', o.ref.current.weighs.length - 1, RUN_MS.weigh);
      play('tick');
    },
    jerk: (b) => o.setJerk(b),
    fast: (b) => o.setFast(b),
    tilt: (b) => {
      if (guard(whyNow().run)) return;
      if (o.ref.current.tilt !== b) o.setTilt(b);
      play('creak');
    },
    pull: () => {
      if (guard(whyNow().pull)) return;
      const k = o.pull();
      if (k === null) return;
      startRun('pull', k, o.ref.current.jerk ? 1600 : RUN_MS.pull);
      window.setTimeout(() => play('creak'), (o.ref.current.jerk ? 1600 : RUN_MS.pull) * 0.72);
    },
    raise: () => {
      if (guard(whyNow().raise)) return;
      const k = o.raise();
      if (k === null) return;
      startRun('tilt', k, o.ref.current.fast ? 1400 : RUN_MS.tilt);
      play('creak');
    },
    // ---------------------------------------------------------------- VISCOSITY
    ball: (b) => {
      if (guard(whyNow().run)) return;
      o.chooseBall(b);
      play('tick');
    },
    measure: () => {
      if (guard(whyNow().bench)) return;
      o.measure();
      play('tick');
      notify(`The ${VISC_BALLS[o.ref.current.ball]!.toFixed(1)} mm ball is in the micrometer (closed with the ratchet): read it in the reading view.`, 'info', 2600);
    },
    liquid: (l) => {
      if (guard(whyNow().run)) return;
      o.setLiquid(l);
    },
    band: (which, d) => {
      if (guard(whyNow().run)) return;
      o.moveBand(which, d);
      play('tick');
    },
    centre: (b) => o.setCentre(b),
    eye: (b) => o.setEyeLevel(b),
    reset: () => {
      if (guard(whyNow().run)) return;
      o.resetClock();
      play('tick');
    },
    drop: () => {
      if (guard(whyNow().run)) return;
      const s0 = o.ref.current;
      const k = o.drop();
      if (k === null) return;
      const v = o.v;
      const fall = viscBandTime(v, { ball: s0.ball, liquid: s0.liquid, centre: s0.centre, top: 0, bot: Math.min(36, s0.bot + 2) });
      startRun('drop', k, Math.max(900, (fall * 1000) / (s0.liquid === 'oil' ? 1 : useBench.getState().lapse)));
      play('drip');
    },
    // ---------------------------------------------------------------- INCLINE
    blocks: (d) => {
      if (guard(whyNow().run)) return;
      o.setBlocks(o.ref.current.blocks + d);
      play('clink');
    },
    stop: (d) => {
      if (guard(whyNow().run)) return;
      o.moveStop(d);
      play('tick');
    },
    stopAt: (cm) => {
      if (guard(whyNow().run)) return;
      o.setStop(cm);
      play('tick');
    },
    push: (b) => o.setPush(b),
    roll: () => {
      if (guard(whyNow().run)) return;
      if (o.ref.current.blocks < 1) return say('Raise one end on the blocks first.');
      const k = o.roll();
      if (k === null) return;
      const st = o.ref.current;
      const r = inclineReadings(o.v, st.runs);
      const t = r[k]! - (st.runs[k]!.reset ? 0 : (r[k - 1] ?? 0));
      startRun('roll', k, Math.max(500, t * 1000 + 250));
      window.setTimeout(() => play('clink'), Math.max(400, t * 1000));
    },
    // ---------------------------------------------------------------- FORCES
    mass: (th, d) => {
      if (guard(whyNow().bench)) return;
      o.setMass(th, o.ref.current.masses[th] + d);
      play('clink');
    },
    tap: () => {
      if (guard(whyNow().bench)) return;
      o.tap();
      play('tick');
      notify('Tapped: the pulleys turn freely and the knot settles.', 'info', 1800);
    },
    dot: (th, far) => {
      if (guard(whyNow().bench)) return;
      const m = o.dot(th, far);
      if (m) return say(m);
      play('tick');
    },
    off: () => {
      if (guard(whyNow().bench)) return;
      const m = o.paperOff();
      if (m) return say(m);
      useBench.setState({ sheet: o.ref.current.sets.length - 1 });
      play('creak');
      notify('The sheet is on your bench with the lines drawn through the dots.', 'success', 2200);
    },
    build: (i) => {
      if (guard(whyNow().build)) return;
      const m = o.build(i);
      if (m) return say(m);
      play('success');
    },
  };
  return ops;
}

export interface ActionCtx {
  o: Mechanics;
  s: PhyMechanicsState;
  scene: SceneState;
  ops: Ops;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}

const act = (key: string, label: string, run: () => void, blocked?: string, tone?: 'brand'): LabAction => ({ key, label, run, blocked, tone });

/** The panel for the object `id` (null: nothing to show). */
export function objectPanel(id: string, ctx: ActionCtx): ObjectPanel | null {
  const { o, s, scene, ops } = ctx;
  const task = s.task ?? 'FRICTION';
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
  const returnable = (a: ApparatusId) => act('return', 'Put back in the cupboard', () => (o.note(`return:${a}`), view().set({ selected: null })), scene.placed.has(a) || (NEEDED[task].includes(a) && s.log.some((e) => /^(pull|drop|run|dot)/.test(e.a))) ? 'You are using it.' : undefined);
  const placeAct = (a: ApparatusId): LabAction[] => (scene.collected.has(a) && !scene.placed.has(a) && PLACE_LABEL[a] ? [act('place', PLACE_LABEL[a]!, () => ops.place(a), scene.nextPlace !== a ? `${PLACE_LABEL[scene.nextPlace!] ?? 'Set out the earlier things'} first.` : undefined, 'brand')] : []);
  const readAct = (label: string) => act('read', label, ops.read, ops.why.bench, 'brand');
  const sh = boardSheet(s);
  const offIdx = s.sets.map((x, i) => (x.off ? i : -1)).filter((i) => i >= 0);
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
    // ---------------------------------------------------------------- FRICTION
    case 'plank':
      if (task === 'FRICTION')
        return {
          title: 'Smooth wooden plank',
          info: s.tilt ? 'Raised at one end: raise it until the block just slips.' : s.wiped ? 'Clean and dry.' : 'There is chalk dust on it.',
          actions: [...placeAct('plank'), act('wipe', 'Wipe it clean and dry', ops.wipe, ops.why.bench, s.wiped ? undefined : 'brand'), s.tilt ? act('flat', 'Lower it flat', () => ops.tilt(false), ops.why.run) : act('tilt', 'Get ready to raise one end', () => ops.tilt(true), ops.why.run), returnable('plank')],
        };
      break;
    case 'block':
      return {
        title: 'Wooden block',
        info: `${s.load} × 100 g on it.`,
        actions: [...placeAct('block'), act('add', 'Add a 100 g mass', () => ops.load(1), ops.why.run), act('take', 'Take a mass off', () => ops.load(-1), ops.why.run), act('weigh', 'Weigh it (and its load) on the balance', ops.weigh, ops.why.run), returnable('block')],
      };
    case 'sbalance':
      return {
        title: 'Spring balance (0–10 N)',
        info: s.zeroed ? 'Zero checked. 0.1 N divisions.' : 'Check its zero before you use it.',
        actions: [
          ...placeAct('sbalance'),
          act('zero', 'Check and adjust the zero', ops.zero, ops.why.bench, s.zeroed ? undefined : 'brand'),
          s.tilt ? act('raise', s.fast ? 'Raise the plank quickly' : 'Raise the plank slowly until the block slips', ops.raise, ops.why.raise, 'brand') : act('pull', s.jerk ? 'Pull it with a jerk' : 'Pull slowly until the block moves', ops.pull, ops.why.pull, 'brand'),
          readAct('Read the balance'),
          returnable('sbalance'),
        ],
      };
    case 'slotted':
      return { title: APPARATUS_LABEL.slotted, info: `${6 - s.load} left here.`, actions: [act('add', 'Put one on the block', () => ops.load(1), ops.why.run), returnable('slotted')] };
    case 'protractor':
      return { title: 'Protractor', info: 'Held at the raised end: read the plank’s angle to 1°.', actions: [readAct('Read the angle'), returnable('protractor')] };
    case 'cloth':
      return { title: 'Dry cloth', info: 'For wiping the plank clean and dry.', actions: [act('wipe', 'Wipe the plank', ops.wipe, ops.why.bench, 'brand'), returnable('cloth')] };
    // ---------------------------------------------------------------- VISCOSITY
    case 'cylinder':
    case 'oilcyl': {
      const l: ViscLiquid = id === 'oilcyl' ? 'oil' : 'glycerine';
      return {
        title: id === 'oilcyl' ? 'Palm oil (ρ = 910 kg m⁻³)' : 'Glycerine (ρ = 1260 kg m⁻³)',
        info: s.liquid === l ? 'The balls go into this one now.' : 'Choose it to drop the ball into it.',
        actions: [...placeAct(id), act('use', 'Drop the balls into this one', () => ops.liquid(l), ops.why.run, s.liquid === l ? undefined : 'brand'), act('drop', `Drop the ${VISC_BALLS[s.ball]!.toFixed(1)} mm ball${s.centre ? ' at the centre' : ' near the wall'}`, ops.drop, ops.why.run ?? (s.liquid !== l ? 'Choose this cylinder first.' : undefined), 'brand'), returnable(id)],
      };
    }
    case 'band-top':
    case 'band-bot': {
      const w = id === 'band-top' ? 'top' : 'bot';
      return {
        title: w === 'top' ? 'Upper rubber band' : 'Lower rubber band',
        info: `${s[w].toFixed(1)} cm below the surface.`,
        actions: [act('down', 'Slide it down 0.5 cm', () => ops.band(w, 0.5), ops.why.run), act('up', 'Slide it up 0.5 cm', () => ops.band(w, -0.5), ops.why.run), act('down5', 'Slide it down 5 cm', () => ops.band(w, 5), ops.why.run), act('up5', 'Slide it up 5 cm', () => ops.band(w, -5), ops.why.run), readAct('Read it against the metre rule')],
      };
    }
    case 'bands':
      return { title: 'Rubber bands', info: 'Markers round the cylinder.', actions: [...placeAct('bands'), returnable('bands')] };
    case 'balls':
      return {
        title: 'Ball bearings',
        info: `Five sizes. Chosen: ${VISC_BALLS[s.ball]!.toFixed(1)} mm${s.measured.includes(s.ball) ? ' (measured)' : ''}.`,
        actions: [...VISC_BALLS.map((d, b) => act(`b${b}`, `Take the ${d.toFixed(1)} mm ball`, () => ops.ball(b), ops.why.run)), returnable('balls')],
      };
    case 'micrometer':
      return { title: 'Micrometer screw gauge', info: 'Zero checked: 0.00 mm. Close it with the ratchet.', actions: [act('measure', `Measure the ${VISC_BALLS[s.ball]!.toFixed(1)} mm ball`, ops.measure, ops.why.bench, 'brand'), readAct('Read the micrometer'), returnable('micrometer')] };
    case 'rule':
      return { title: 'Metre rule', info: task === 'VISCOSITY' ? 'Standing beside the cylinder, its zero level with the surface.' : 'For measuring the distances.', actions: [...placeAct('rule'), readAct('Read the bands against it'), returnable('rule')] };
    case 'stopclock':
      return {
        title: 'Stop-clock',
        info: s.reset ? 'Reset to 0.00.' : 'Showing the last time.',
        actions: [act('reset', 'Reset it to zero', ops.reset, ops.why.run, s.reset ? undefined : 'brand'), readAct('Read it'), returnable('stopclock')],
      };
    case 'magnet':
      return { title: 'Magnet', info: 'Draws the balls up the side of the cylinder after each drop.', actions: [returnable('magnet')] };
    // ---------------------------------------------------------------- INCLINE
    case 'ramp':
      return { title: 'Grooved plank (2.00 m)', info: `On ${s.blocks} block${s.blocks === 1 ? '' : 's'}; marks at 0.40, 0.80, 1.20, 1.60 m.`, actions: [...placeAct('ramp'), returnable('ramp')] };
    case 'woodblocks':
      return { title: 'Wooden blocks', info: `${s.blocks} under the raised end.`, actions: [...placeAct('woodblocks'), act('add', 'Add a block', () => ops.blocks(1), ops.why.run), act('take', 'Take a block out', () => ops.blocks(-1), ops.why.run)] };
    case 'stopblock':
      return {
        title: 'Stopping block',
        info: `At ${(s.stop / 100).toFixed(2)} m from the start line.`,
        actions: [...placeAct('stopblock'), ...[40, 80, 120, 160].map((m) => act(`m${m}`, `Move it to the ${(m / 100).toFixed(2)} m mark`, () => ops.stopAt(m), ops.why.run)), act('r', 'Move it 1 cm further', () => ops.stop(1), ops.why.run), act('l', 'Move it 1 cm nearer', () => ops.stop(-1), ops.why.run)],
      };
    case 'steelball':
      return {
        title: 'Steel ball',
        info: s.push ? 'You are giving it a push.' : 'Released from rest at the start line.',
        actions: [act('roll', s.push ? 'Push it and start the stop-clock' : 'Let it go and start the stop-clock', ops.roll, ops.why.run, 'brand'), act('style', s.push ? 'Release it from rest instead' : 'Give it a push instead', () => ops.push(!s.push))],
      };
    // ---------------------------------------------------------------- FORCES
    case 'board':
      return { title: 'Drawing board', info: 'Fixed vertically; two pulleys clamped at the top.', actions: [...placeAct('board'), act('tap', 'Tap it gently', ops.tap, ops.why.bench, s.tapped ? undefined : 'brand')] };
    case 'paper':
      return {
        title: 'Drawing paper',
        info: sh ? `Sheet ${sh.i + 1}: ${sh.set.dots.length} dots.` : 'A clean sheet.',
        actions: [...placeAct('paper'), act('off', 'Take the paper off and draw the lines', ops.off, sh ? undefined : 'Mark the threads first.', sh ? 'brand' : undefined), ...offIdx.map((i) => act(`build${i}`, `Sheet ${i + 1}: draw OA and OB and the parallelogram`, () => ops.build(i))), readAct('Look at the drawing')],
      };
    case 'thread':
    case 'knot':
      return {
        title: id === 'knot' ? 'The knot' : 'Thread',
        info: s.tapped ? 'Settled.' : 'Tap the board so it settles.',
        actions: [...placeAct('thread'), ...(['P', 'Q', 'W'] as ForceThread[]).flatMap((th) => [act(`d${th}n`, `Dot under ${th}, near the knot`, () => ops.dot(th, false), ops.why.bench), act(`d${th}f`, `Dot under ${th}, far from the knot`, () => ops.dot(th, true), ops.why.bench)])],
      };
    case 'hanger-P':
    case 'hanger-Q':
    case 'hanger-W': {
      const th = id.slice(-1) as ForceThread;
      return { title: `Hanger ${th}`, info: `Hanger + ${s.masses[th]} × 50 g = ${forceNominal(s.masses[th])} g.`, actions: [act('add', 'Add 50 g', () => ops.mass(th, 1), ops.why.bench), act('take', 'Take off 50 g', () => ops.mass(th, -1), ops.why.bench)] };
    }
    case 'hangers':
      return { title: APPARATUS_LABEL.hangers, info: 'Each hanger is 50 g.', actions: [...placeAct('hangers'), returnable('hangers')] };
    case 'pencil':
      return { title: APPARATUS_LABEL.pencil, info: 'For the dots, the lines and the measuring.', actions: [returnable('pencil')] };
    case 'whiteboard':
      return { title: 'Whiteboard', info: 'Today’s practical.', actions: [] };
  }
  if (APPARATUS.some((x) => x.id === id)) return { title: APPARATUS_LABEL[id as ApparatusId], info: NEEDED[task].includes(id as ApparatusId) ? 'On your bench.' : 'Not needed for this practical.', actions: [...placeAct(id as ApparatusId), returnable(id as ApparatusId)] };
  return ROOM_INFO[id] ? { title: ROOM_INFO[id]![0], info: ROOM_INFO[id]![1], actions: [] } : null;
}

const ROOM_INFO: Record<string, [string, string]> = {
  goggles: ['Safety goggles', 'Not needed for this practical.'],
  shelf: ['Physics equipment shelf', 'Equipment for other practicals: you need nothing from here.'],
  vdg: ['Van de Graaff generator', 'Teacher only.'],
  co2: ['CO₂ fire extinguisher', 'For electrical fires.'],
  blanket: ['Fire blanket', 'Pull the tapes down sharply to use it.'],
  extinguisher: ['Fire extinguisher', 'By the door.'],
  firstaid: ['First-aid box', 'Tell the teacher about any injury.'],
  eyewash: ['Eye-wash station', 'Rinse for 10 minutes.'],
  notice: ['Notice board', 'Department notices and WAEC tips.'],
  desk: ['Teacher’s desk', 'The teacher marks the work here.'],
  'poster-si': ['Poster: SI base units', 'Forces in N, lengths in m and cm, times in s.'],
  'poster-light': ['Poster: refraction of light', 'For the optics practicals.'],
  'poster-electric': ['Poster: electrical safety', 'Nothing electrical in this practical.'],
};
