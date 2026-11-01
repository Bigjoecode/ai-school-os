import { CAL_OBJECT_NAME, SAND_SCOOPS, SHOT_SCOOPS, type CalObj, type DensityDepth, type DensityRiders, type DensityWeighItem, type PhyDensityState } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { canDeficit, objName, type Density } from '../actions';
import { APPARATUS, APPARATUS_LABEL, neededFor, PLACE_LABEL, sceneFromState, type ApparatusId, type SceneState } from './scene-state';

/**
 * Everything the student can do at the density bench, as plain operations
 * (used by the dock, the object menus, the drags and the demo) and as each
 * object's menu. Marked changes go through the shared actions; collecting and
 * setting out the apparatus are log notes without marks.
 */

const view = () => useLabView.getState();

export interface Ops {
  place: (id: ApparatusId) => void;
  placeNext: () => void;
  /** Calipers */
  tool: (t: 'V' | 'M') => void;
  hold: (obj: CalObj | null, inside?: boolean) => void;
  close: (how: 'gentle' | 'ratchet' | 'thimble') => void;
  open: () => void;
  turn: () => void;
  takeCal: () => void;
  /** Archimedes */
  zero: () => void;
  hang: () => void;
  unhang: () => void;
  fillCan: () => void;
  catchUnder: (on: boolean) => void;
  emptyCatch: () => void;
  lower: (where: 'water' | 'salt', depth: DensityDepth) => void;
  raise: () => void;
  shake: () => void;
  dryStone: () => void;
  wipeSpill: () => void;
  takeSb: () => void;
  /** Flotation */
  addShot: () => void;
  removeShot: () => void;
  floatTube: () => void;
  liftTube: () => void;
  centre: () => void;
  takeDepth: () => void;
  /** Bottle */
  fill: (f: 'water' | 'liquid') => void;
  topUp: () => void;
  tap: () => void;
  stopper: () => void;
  unstopper: () => void;
  wipe: () => void;
  empty: () => void;
  dry: () => void;
  rinse: () => void;
  addSand: () => void;
  readTemp: () => void;
  /** Balance */
  pan: (item: DensityWeighItem | null) => void;
  rider: (w: keyof DensityRiders, d: number) => void;
  weigh: () => void;
  /** Eye-level view of the scale. */
  read: () => void;
  why: { work?: string; place?: string; take?: string };
}

export function makeOps(o: Density): Ops {
  const now = () => {
    const st = o.ref.current;
    return { st, scene: sceneFromState(st) };
  };
  const whyNow = () => {
    const { st, scene } = now();
    const work = !st.task ? 'Choose the experiment first.' : !scene.ready ? `Collect your apparatus first (${scene.missing.length} still in the cupboard).` : !scene.set ? 'Set up the apparatus first (the dock’s button).' : undefined;
    return {
      work,
      place: !st.task ? 'Choose the experiment first.' : !scene.nextPlace ? 'Everything is set up.' : !scene.collected.has(scene.nextPlace) ? `Collect the ${APPARATUS_LABEL[scene.nextPlace].toLowerCase()} first.` : undefined,
      take: work,
    };
  };
  const why = whyNow();
  const say = (m: string) => notify(m, 'warning', 2600);
  /** Run a marked action: blocked before set-up; a returned message is shown. */
  const run = (fn: () => string | null | void | boolean, sound: Parameters<typeof play>[0] = 'tick') => {
    const w = whyNow().work;
    if (w) return say(w);
    const m = fn();
    if (typeof m === 'string') return say(m);
    play(sound);
  };
  const ops: Ops = {
    why,
    place: (id) => {
      const { scene } = now();
      if (!scene.collected.has(id)) return say(`Collect the ${APPARATUS_LABEL[id].toLowerCase()} first.`);
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
    tool: (t) => run(() => o.pickTool(t), 'clink'),
    hold: (obj, inside) => run(() => o.hold(obj, inside), 'clink'),
    close: (how) =>
      run(() => {
        const m = o.close(how);
        if (!m && how === 'ratchet') play('tick');
        if (!m && how === 'thimble') notify('Screwed hard with the thimble: the object is squeezed and the reading is low. Use the ratchet.', 'warning', 2600);
        return m;
      }, how === 'ratchet' ? 'clink' : 'tick'),
    open: () => run(() => o.open()),
    turn: () => run(() => o.turn()),
    takeCal: () => run(() => o.takeCal(), 'success'),
    zero: () => run(() => o.zeroBalance()),
    hang: () => run(() => o.hang(), 'clink'),
    unhang: () => run(() => o.unhang()),
    fillCan: () => run(() => o.fillCan(), 'drip'),
    catchUnder: (on) => run(() => o.placeCatch(on), 'clink'),
    emptyCatch: () => run(() => o.emptyCatch()),
    lower: (where, depth) =>
      run(() => {
        const before = o.ref.current.spill;
        const m = o.lower(where, depth);
        if (!m && !before && o.ref.current.spill) notify('Water ran out of the spout onto the bench: put the catch beaker under the spout first. Wipe the spill up.', 'warning', 3000);
        return m;
      }, 'tick'),
    raise: () => run(() => o.raise()),
    shake: () => run(() => o.shake()),
    dryStone: () => run(() => o.dryStone()),
    wipeSpill: () => run(() => o.wipeSpill()),
    takeSb: () => run(() => o.takeSb(), 'success'),
    addShot: () =>
      run(() => {
        const m = o.addShot();
        if (!m && o.ref.current.sunk) {
          play('oops');
          notify('Overloaded: the tube filled and sank! Lift it out and take some lead shot out.', 'warning', 3000);
        }
        return m;
      }, 'clink'),
    removeShot: () => run(() => o.removeShot()),
    floatTube: () => run(() => o.floatTube(), 'tick'),
    liftTube: () => run(() => o.liftTube()),
    centre: () => run(() => o.centre()),
    takeDepth: () => run(() => o.takeDepth(), 'success'),
    fill: (f) => run(() => o.fill(f), 'drip'),
    topUp: () => run(() => o.topUp()),
    tap: () => run(() => o.tap()),
    stopper: () => run(() => o.stopper(), 'clink'),
    unstopper: () => run(() => o.unstopper()),
    wipe: () => run(() => o.wipe()),
    empty: () => run(() => o.empty()),
    dry: () => run(() => o.dry()),
    rinse: () => run(() => o.rinse()),
    addSand: () => run(() => o.addSand()),
    readTemp: () => run(() => (o.readTemp(), view().set({ mode: 'read', selected: null, spot: null }))),
    pan: (item) => run(() => o.setPan(item), 'clink'),
    rider: (w, d) => run(() => o.nudgeRider(w, d)),
    weigh: () => run(() => o.weigh(), 'success'),
    read: () => run(() => view().set({ mode: 'read', selected: null, spot: null })),
  };
  return ops;
}

export interface ActionCtx {
  o: Density;
  s: PhyDensityState;
  scene: SceneState;
  ops: Ops;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}

const act = (key: string, label: string, run: () => void, blocked?: string, tone?: 'brand'): LabAction => ({ key, label, run, blocked, tone });

/** The panel for the object `id` (null: nothing to show). */
export function objectPanel(id: string, ctx: ActionCtx): ObjectPanel | null {
  const { o, s, scene, ops } = ctx;
  const task = s.task ?? 'CAL';
  const w = ops.why.work;
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
  const need = neededFor(s);
  const returnable = (a: ApparatusId) => act('return', 'Put back in the cupboard', () => (o.note(`return:${a}`), view().set({ selected: null })), scene.placed.has(a) || need.includes(a) ? 'You need it for this practical.' : undefined);
  if (scene.collected.has(id as ApparatusId) && PLACE_LABEL[id as ApparatusId] && !scene.placed.has(id as ApparatusId)) return { title: APPARATUS_LABEL[id as ApparatusId], info: 'On your bench, not yet set up.', actions: [act('place', PLACE_LABEL[id as ApparatusId]!, () => ops.place(id as ApparatusId), undefined, 'brand')] };
  switch (id) {
    case 'cupboard':
      return { title: 'Apparatus cupboard', info: 'Choose the apparatus you need.', actions: [act('list', 'Choose apparatus…', () => ctx.open('cupboard'), undefined, 'brand')] };
    case 'mybench':
      return {
        title: 'Your bench',
        info: 'Bench 2: your task card and notebook are here.',
        actions: view().mode === 'walk' ? [act('sit', 'Work at my bench', () => view().set({ mode: 'bench', focus: 'bench', selected: null }), undefined, 'brand')] : [act('stand', 'Stand up and walk', () => view().set({ mode: 'walk', selected: null }))],
      };
    case 'vernier':
    case 'micrometer': {
      const t = id === 'vernier' ? 'V' : 'M';
      const inHand = s.tool === t;
      if (!inHand) return { title: APPARATUS_LABEL[id], info: id === 'vernier' ? 'Reads to 0.01 cm: main scale in mm, ten vernier divisions over 9 mm.' : 'Reads to 0.01 mm: sleeve in 0.5 mm, 50 thimble divisions.', actions: [act('use', `Use the ${id === 'vernier' ? 'vernier' : 'micrometer'}`, () => ops.tool(t), w, 'brand'), returnable(id)] };
      const objs: (CalObj | null)[] = task === 'FLOAT' ? [null, 'tube'] : [null, 'cyl', 'ball', 'marble', 'wire'];
      return {
        title: `${APPARATUS_LABEL[id]} — ${objName(s.held, s.inside)}`,
        info: s.closed ? (s.forced ? 'Screwed hard with the thimble (squeezed).' : 'Closed on it. Read the scale square on.') : 'Open.',
        actions: [
          ...objs.map((x) => act(`h-${x ?? 'none'}`, x ? `Put the ${CAL_OBJECT_NAME[x]} in the jaws` : 'Nothing in the jaws (zero check)', () => ops.hold(x), w, s.held === x && !s.inside ? 'brand' : undefined)),
          ...(task === 'FLOAT' ? [act('inside', 'Tube on the inside jaws', () => ops.hold('tube', true), w)] : []),
          ...(t === 'V' ? [act('close', 'Close the jaws gently', () => ops.close('gentle'), w, 'brand')] : [act('ratchet', 'Turn the ratchet until it clicks', () => ops.close('ratchet'), w, 'brand'), act('thimble', 'Screw the thimble tight', () => ops.close('thimble'), w)]),
          act('open', 'Open', ops.open, s.closed ? undefined : 'It is open.'),
          act('turn', 'Turn the object / next place', ops.turn, s.held ? undefined : 'Nothing in the jaws.'),
          act('read', 'Read the scale (close-up)', ops.read, w),
          act('take', 'Take this reading', ops.takeCal, w),
        ],
      };
    }
    case 'objects':
    case 'obj-cyl':
    case 'obj-ball':
    case 'obj-marble':
    case 'obj-wire': {
      const x = id.startsWith('obj-') ? (id.slice(4) as CalObj) : null;
      if (!x) return { title: APPARATUS_LABEL.objects, info: 'Clean each object with the cloth before measuring.', actions: [returnable('objects')] };
      return { title: CAL_OBJECT_NAME[x], info: x === 'cyl' || x === 'marble' ? 'Measure with the vernier.' : 'Measure with the micrometer.', actions: [act('hold', 'Put it in the jaws', () => ops.hold(x), w ?? (s.tool ? undefined : 'Pick up an instrument first.'), 'brand')] };
    }
    case 'sbalance':
      return {
        title: 'Spring balance (0–10 N)',
        info: s.hung ? 'The stone hangs from it.' : s.zeroed ? 'Zero checked.' : 'Check its zero with nothing hanging.',
        actions: [act('zero', 'Check and adjust the zero', ops.zero, w), s.hung ? act('off', 'Take the stone off', ops.unhang, w) : act('hang', 'Hang the stone', ops.hang, w, 'brand'), act('read', 'Read at eye level', ops.read, w), act('take', 'Take this reading', ops.takeSb, w, 'brand')],
      };
    case 'stone':
      return {
        title: 'Stone on a thread',
        info: !s.hung ? 'Not hung.' : s.where === 'air' ? `In air${s.wet ? ', wet' : ''}.` : `${s.depth === 'part' ? 'Half' : s.depth === 'touch' ? 'Resting on the bottom,' : 'Fully'} in the ${s.where === 'water' ? 'eureka can' : 'salt solution'}${s.bubbles ? ' — bubbles cling to it' : ''}.`,
        actions: !s.hung
          ? [act('hang', 'Hang it from the spring balance', ops.hang, w, 'brand')]
          : s.where === 'air'
            ? [act('can', 'Lower it fully into the eureka can', () => ops.lower('water', 'full'), w, 'brand'), act('half', 'Lower it half into the can', () => ops.lower('water', 'part'), w), act('salt', 'Lower it fully into the salt solution', () => ops.lower('salt', 'full'), w), act('dry', 'Dry it with tissue', ops.dryStone, s.wet ? w : 'It is dry.')]
            : [act('raise', 'Raise it out', ops.raise, w), act('shake', 'Shake off the bubbles', ops.shake, s.bubbles ? w : 'No bubbles.'), act('full', 'Fully immersed, hanging free', () => ops.lower(s.where as 'water', 'full'), w, 'brand'), act('touch', 'Let it rest on the bottom', () => ops.lower(s.where as 'water', 'touch'), w)],
      };
    case 'eureka':
      return { title: 'Eureka can', info: canDeficit(o.v, s) <= 0 ? 'Full to the spout.' : 'Below the spout.', actions: [act('fill', 'Fill it to the spout and let it stop dripping', ops.fillCan, w, 'brand'), act('lower', 'Lower the stone into it', () => ops.lower('water', 'full'), w)] };
    case 'catch':
      return { title: 'Catch beaker', info: s.catchUnder ? 'Under the spout.' : 'On the bench.', actions: [act('under', s.catchUnder ? 'Take it from the spout' : 'Put it under the spout', () => ops.catchUnder(!s.catchUnder), w, 'brand'), act('weigh', 'Put it on the balance', () => ops.pan('beaker'), w), act('empty', 'Empty and dry it', ops.emptyCatch, w)] };
    case 'salt':
      return { title: 'Salt solution', info: 'Concentrated salt solution in a beaker.', actions: [act('lower', 'Lower the stone fully into it', () => ops.lower('salt', 'full'), w, 'brand')] };
    case 'tissue':
      return { title: 'Tissue paper', info: 'For drying and wiping.', actions: task === 'ARCH' ? [act('dry', 'Dry the stone', ops.dryStone, w, 'brand'), act('spill', 'Wipe up a spill', ops.wipeSpill, s.spill ? w : 'No spill.')] : [act('wipe', 'Wipe the bottle dry', ops.wipe, w, 'brand'), act('dry', 'Dry the bottle inside', ops.dry, w)] };
    case 'spill':
      return { title: 'Water on the bench', info: 'Wet floors and benches are slippery.', actions: [act('wipe', 'Wipe it up', ops.wipeSpill, undefined, 'brand')] };
    case 'balance':
    case 'pan': {
      const item: DensityWeighItem = task === 'ARCH' ? 'beaker' : task === 'FLOAT' ? 'tube' : 'bottle';
      return {
        title: 'Triple-beam balance',
        info: `Riders total ${(o.riders.h * 100 + o.riders.t * 10 + o.riders.f).toFixed(1)} g. Slide them until the pointer rests on zero.`,
        actions: [act('on', o.pan ? 'Take it off the pan' : `Put the ${item === 'beaker' ? 'catch beaker' : item === 'tube' ? 'empty tube' : 'bottle'} on the pan`, () => ops.pan(o.pan ? null : item), w, 'brand'), act('weigh', 'Record this weighing', ops.weigh, o.pan ? w : 'Nothing on the pan.')],
      };
    }
    case 'rider-h':
    case 'rider-t':
    case 'rider-f': {
      const r = id.slice(6) as keyof DensityRiders;
      const step = r === 'f' ? 0.1 : 1;
      return { title: r === 'h' ? '100 g rider' : r === 't' ? '10 g rider' : 'Front rider (0–10 g)', info: 'Drag it along its beam, or step it.', actions: [act('back', `Back ${r === 'f' ? '0.1 g' : 'one notch'}`, () => ops.rider(r, -step), w), act('on', `On ${r === 'f' ? '0.1 g' : 'one notch'}`, () => ops.rider(r, step), w, 'brand'), ...(r === 'f' ? [act('b1', 'Back 1 g', () => ops.rider('f', -1), w), act('o1', 'On 1 g', () => ops.rider('f', 1), w)] : [])] };
    }
    case 'cylinder':
      return { title: 'Tall cylinder of water', info: s.floating ? 'The tube floats in it.' : 'Ready for the tube.', actions: [s.floating ? act('out', 'Lift the tube out', ops.liftTube, w) : act('in', 'Float the tube in it', ops.floatTube, w, 'brand'), act('read', 'Read h at eye level', ops.read, s.floating ? w : 'Float the tube first.')] };
    case 'testtube':
      return {
        title: 'Flat-bottomed tube with paper scale',
        info: `${s.load * 10} g of lead shot inside.${s.touching ? ' Touching the side of the cylinder.' : ''}${s.sunk ? ' It has sunk!' : ''}`,
        actions: [act('add', 'Add 10 g of lead shot', ops.addShot, w ?? (s.load >= SHOT_SCOOPS ? 'That is all the shot.' : undefined), 'brand'), act('rem', 'Take out 10 g', ops.removeShot, s.load ? w : 'It is empty.'), s.floating ? act('out', 'Lift it out', ops.liftTube, w) : act('in', 'Float it', ops.floatTube, w), act('free', 'Free it from the side', ops.centre, s.touching ? w : 'It floats freely.'), act('take', 'Take this depth', ops.takeDepth, w), act('weigh', 'Weigh it (empty)', () => ops.pan('tube'), w)],
      };
    case 'shot':
      return { title: 'Lead shot', info: 'In 10 g scoops. Wash your hands after handling lead.', actions: [act('add', 'Add a scoop to the tube', ops.addShot, w, 'brand')] };
    case 'bottle': {
      const b = s.bottle;
      return {
        title: 'Density bottle',
        info: `${b.fill === 'none' ? (b.sand ? `${b.sand} scoops of sand` : 'Empty') : b.fill === 'water' ? 'Water' : o.v.liquid}${b.sand && b.fill !== 'none' ? ' over sand' : ''}${s.stoppered ? ', stoppered' : ''}${b.toCap ? ' (to the capillary)' : ''}${b.bubble ? ', a bubble inside' : ''}${b.outsideWet ? ', wet outside' : ''}${b.film !== 'none' && b.fill === 'none' ? ', wet inside' : ''}.`,
        actions: [
          act('water', 'Fill with water', () => ops.fill('water'), w),
          ...(s.sample === 'grains' ? [act('sand', 'Add a scoop of sand', ops.addSand, w ?? (b.sand >= SAND_SCOOPS ? 'Enough sand.' : undefined))] : [act('liquid', `Fill with ${o.v.liquid}`, () => ops.fill('liquid'), w)]),
          act('top', 'Top up to the brim (dropper)', ops.topUp, w),
          act('tap', 'Tap out the bubble', ops.tap, b.bubble ? w : 'No bubble.'),
          s.stoppered ? act('unst', 'Take the stopper out', ops.unstopper, w) : act('st', 'Insert the stopper', ops.stopper, w, 'brand'),
          act('wipe', 'Wipe the outside dry', ops.wipe, b.outsideWet ? w : 'It is dry outside.'),
          act('empty', 'Empty it', ops.empty, w),
          act('dry', 'Dry it inside', ops.dry, w),
          ...(s.sample === 'liquid' ? [act('rinse', `Rinse with a little ${o.v.liquid}`, ops.rinse, w)] : []),
          act('weigh', 'Put it on the balance', () => ops.pan('bottle'), w),
        ],
      };
    }
    case 'liquids':
    case 'dropper':
      return { title: APPARATUS_LABEL[id], info: id === 'dropper' ? 'Tops the bottle up to the brim.' : `Water and ${o.v.liquid}.`, actions: [act('top', 'Top up the bottle', ops.topUp, w, 'brand')] };
    case 'sand':
      return { title: 'Dry sand', info: 'About 10 g a scoop.', actions: [act('sand', 'Add a scoop to the bottle', ops.addSand, w, 'brand')] };
    case 'thermometer':
      return { title: 'Thermometer', info: 'Room temperature: read it at eye level.', actions: [act('read', 'Read the room temperature', ops.readTemp, w, 'brand')] };
    case 'book':
      return { title: 'Practical notebook', info: 'Your table and answers.', actions: [act('open', 'Open the notebook', () => ctx.open('notebook'), undefined, 'brand')] };
    case 'card':
      return { title: 'Task card', info: 'The question paper.', actions: [act('open', 'Read the task card', () => ctx.open('task'), undefined, 'brand')] };
    case 'magnet':
    case 'prism':
      return { title: APPARATUS_LABEL[id], info: 'Not needed for this practical.', actions: [returnable(id)] };
    case 'coat':
      return { title: 'Lab coat', info: 'Keeps spills off your clothes.', actions: [scene.coat ? act('off', 'Take off the lab coat', () => o.note('safety-off:coat')) : act('on', 'Put on the lab coat', () => o.note('safety:coat'))] };
    default:
      return APPARATUS.some((x) => x.id === id) ? { title: APPARATUS_LABEL[id as ApparatusId], actions: [returnable(id as ApparatusId)] } : ROOM_INFO[id] ? { title: ROOM_INFO[id]![0], info: ROOM_INFO[id]![1], actions: [] } : null;
  }
}

const ROOM_INFO: Record<string, [string, string]> = {
  goggles: ['Safety goggles', 'Wear them when handling glassware and liquids.'],
  shelf: ['Physics equipment shelf', 'Equipment for other practicals.'],
  vdg: ['Van de Graaff generator', 'Teacher only.'],
  co2: ['CO₂ fire extinguisher', 'For electrical and kerosene fires.'],
  blanket: ['Fire blanket', 'Pull the tapes down sharply to use it.'],
  extinguisher: ['Fire extinguisher', 'By the door.'],
  firstaid: ['First-aid box', 'Tell the teacher about any injury.'],
  eyewash: ['Eye-wash station', 'Rinse for 10 minutes.'],
  notice: ['Notice board', 'Department notices and WAEC tips.'],
  desk: ['Teacher’s desk', 'The teacher marks the work here.'],
  whiteboard: ['Whiteboard', 'Today’s practical.'],
  'poster-si': ['Poster: SI base units', 'Mass in kg, length in m; density in kg m⁻³.'],
  'poster-light': ['Poster: refraction of light', 'For the optics practicals.'],
  'poster-electric': ['Poster: electrical safety', 'Nothing electrical in this practical.'],
};
