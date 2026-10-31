import { HEAT_LEVEL_NAME, HEAT_WARM, type HeatItem, type HeatThermo, type PhyHeatState } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { heatFlags, MAX_READS, type Heat, type Riders } from '../actions';
import { THERMO_NAME } from '../index';
import { useBench } from './bench-store';
import { APPARATUS, APPARATUS_LABEL, NEEDED, PLACE_LABEL, sceneFromState, type ApparatusId, type SceneState } from './scene-state';

/**
 * Everything the student can do at the heat bench, as plain operations (used
 * by the dock, the object menus, the drags and the demo) and as each object's
 * menu. Marked changes go through the shared actions; collecting and setting
 * out the apparatus are log notes without marks.
 */

const view = () => useLabView.getState();

export interface Ops {
  place: (id: ApparatusId) => void;
  placeNext: () => void;
  bunsen: () => void;
  lag: () => void;
  lid: () => void;
  stir: () => void;
  thStir: () => void;
  fill: (level: 1 | 2 | 3) => void;
  warm: (nominal: number) => void;
  toBath: () => void;
  lift: () => void;
  lower: (gentle: boolean) => void;
  addIce: () => void;
  tubeBath: () => void;
  tubeFlame: () => void;
  tubeAir: () => void;
  pull: () => void;
  watch: () => void;
  pan: (item: HeatItem | null) => void;
  rider: (which: keyof Riders, d: number) => void;
  weigh: () => void;
  /** Eye-level view of a thermometer. */
  read: (th: HeatThermo) => void;
  /** Record a reading of the thermometer. */
  take: (th: HeatThermo) => void;
  why: Partial<Record<'place' | 'bench' | 'bunsen' | 'lag' | 'fill' | 'stir' | 'bath' | 'lift' | 'lower' | 'ice' | 'tube' | 'air' | 'watch' | 'weigh' | 'take', string>>;
}

/** The operations on `o`: each reads the state as it is now (so the demo can run several in one tick). */
export function makeOps(o: Heat): Ops {
  const now = () => {
    const st = o.ref.current;
    return { st, scene: sceneFromState(st), f: heatFlags(st.events) };
  };
  const whyNow = () => {
    const { st, scene, f } = now();
    const task = st.task ?? 'MIX';
    const setUp = !st.task ? 'Choose the experiment first.' : !scene.ready ? `Collect your apparatus first (${scene.missing.length} still in the cupboard).` : !scene.set ? 'Set out the apparatus first (the dock’s button).' : undefined;
    const onPan = o.pan === 'cal' ? 'The calorimeter is on the balance: take it off the pan first.' : undefined;
    return {
      place: !st.task ? 'Choose the experiment first.' : !scene.nextPlace ? 'Everything is set out.' : !scene.collected.has(scene.nextPlace) ? `Collect the ${APPARATUS_LABEL[scene.nextPlace].toLowerCase()} first.` : undefined,
      bench: setUp,
      bunsen: setUp ?? (task === 'LATENT' ? 'No heating in this practical: the warm water comes from the flask.' : undefined),
      lag: setUp ?? (task === 'COOL' ? 'There is no calorimeter in this practical.' : onPan),
      fill: setUp ?? (f.filled ? 'The calorimeter already has its water.' : onPan),
      stir: setUp ?? (task !== 'COOL' && !f.filled ? 'Pour the water in first.' : task === 'COOL' && f.tube === 'rack' ? 'The tube is not in use yet.' : undefined),
      bath: setUp ?? (f.block !== 'bench' ? 'The block is already in use.' : undefined),
      lift: setUp ?? (f.block !== 'bath' ? 'The block is not in the bath.' : undefined),
      lower: setUp ?? (f.block !== 'bath' && f.block !== 'air' ? (f.block === 'cal' ? 'The block is in the calorimeter.' : 'Heat the block in the boiling water first.') : !f.filled ? 'Put water in the calorimeter first.' : onPan),
      ice: setUp ?? (!f.filled ? 'Pour the warm water in first.' : f.ice >= 20 ? 'That is all the ice.' : onPan),
      tube: setUp ?? (f.tube === 'bath' ? 'The tube is already in the water bath.' : undefined),
      air: setUp ?? (f.tube !== 'bath' ? 'The tube is not in the water bath.' : undefined),
      watch: setUp,
      weigh: setUp ?? (!o.pan ? 'Put the calorimeter or the block on the pan first.' : st.weighs.length >= 20 ? 'The record is full.' : undefined),
      take: setUp ?? (st.reads.length >= MAX_READS ? 'The record is full.' : undefined),
    };
  };
  const why = whyNow();
  const say = (m: string) => notify(m, 'warning', 2600);
  const guard = (w: string | undefined, run: () => void, sound: Parameters<typeof play>[0] = 'tick') => {
    if (w) return say(w);
    run();
    play(sound);
  };
  const ops: Ops = {
    why,
    place: (id) => {
      const { scene } = now();
      if (!scene.collected.has(id)) return say(`Collect the ${APPARATUS_LABEL[id].toLowerCase()} first.`);
      if (id === 'beaker' && !scene.placed.has('tripod')) return say('Stand the tripod over the Bunsen first.');
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
    bunsen: () => guard(whyNow().bunsen, () => o.bunsen(!now().f.bunsen), 'clink'),
    lag: () => guard(whyNow().lag, () => o.lag(!now().f.lagged)),
    lid: () => guard(whyNow().bench, () => o.lid(!now().f.lid)),
    stir: () => guard(whyNow().stir, () => o.stir(!now().f.stirring)),
    thStir: () => guard(whyNow().stir, () => o.thStir()),
    fill: (level) => guard(whyNow().fill, () => o.fill(level), 'drip'),
    warm: (n) => guard(whyNow().fill, () => o.warm(n), 'drip'),
    toBath: () => guard(whyNow().bath, () => o.blockToBath(), 'drip'),
    lift: () => guard(whyNow().lift, () => o.lift()),
    lower: (gentle) => guard(whyNow().lower, () => o.lower(gentle), gentle ? 'drip' : 'clink'),
    addIce: () => {
      const b = useBench.getState();
      guard(whyNow().ice, () => o.addIce(b.dry, b.melting), 'clink');
    },
    tubeBath: () => guard(whyNow().tube, () => o.tubeToBath(), 'clink'),
    tubeFlame: () => {
      const w = whyNow().bench;
      if (w) return say(w);
      o.tubeFlame();
      play('oops');
      notify('Never heat naphthalene straight over a flame: its vapour is flammable. Use the water bath.', 'warning', 3600);
    },
    tubeAir: () => guard(whyNow().air, () => o.tubeToAir(), 'clink'),
    pull: () => guard(whyNow().bench, () => o.pullThermo()),
    watch: () => guard(whyNow().watch, () => (now().f.watch === 'running' ? o.watchStop() : o.watchStart())),
    pan: (item) => {
      const w = whyNow().bench;
      if (w) return say(w);
      if (item === 'block' && now().f.block !== 'bench') return say('The block is in use: weigh it before you heat it.');
      o.setPan(item);
      play('clink');
    },
    rider: (which, d) => (o.nudgeRider(which, d), play('tick')),
    weigh: () => guard(whyNow().weigh, () => o.weigh(), 'success'),
    read: (th) => {
      const w = whyNow().bench;
      if (w) return say(w);
      useBench.setState({ thermo: th });
      useLabView.setState({ mode: 'read', selected: null, spot: null });
    },
    take: (th) => guard(whyNow().take, () => o.read(th), 'success'),
  };
  return ops;
}

export interface ActionCtx {
  o: Heat;
  s: PhyHeatState;
  scene: SceneState;
  ops: Ops;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}

const act = (key: string, label: string, run: () => void, blocked?: string, tone?: 'brand'): LabAction => ({ key, label, run, blocked, tone });
const thermoActs = (ops: Ops, th: HeatThermo): LabAction[] => [act('read', 'Read it at eye level', () => ops.read(th), ops.why.bench, 'brand'), act('take', 'Take this reading', () => ops.take(th), ops.why.take)];

/** The panel for the object `id` (null: nothing to show). */
export function objectPanel(id: string, ctx: ActionCtx): ObjectPanel | null {
  const { o, s, scene, ops } = ctx;
  const task = s.task ?? 'MIX';
  const f = heatFlags(s.events);
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
  const inUse = (a: ApparatusId) => scene.placed.has(a) || (NEEDED[task].includes(a) && s.events.length > 0);
  const returnable = (a: ApparatusId) => act('return', 'Put back in the cupboard', () => (o.note(`return:${a}`), view().set({ selected: null })), inUse(a) ? 'You are using it.' : undefined);
  const notPlaced = (a: ApparatusId): ObjectPanel => ({ title: APPARATUS_LABEL[a], info: 'On your bench, not yet set out.', actions: [act('place', PLACE_LABEL[a] ?? 'Set it out', () => ops.place(a), undefined, 'brand'), returnable(a)] });
  switch (id) {
    case 'cupboard':
      return { title: 'Apparatus cupboard', info: 'Choose the apparatus you need for this practical.', actions: [act('list', 'Choose apparatus…', () => ctx.open('cupboard'), undefined, 'brand')] };
    case 'mybench':
      return {
        title: 'Your bench',
        info: 'Bench 2: your task card and notebook are here.',
        actions: view().mode === 'walk' ? [act('sit', 'Work at my bench', () => view().set({ mode: 'bench', focus: 'bench', selected: null }), undefined, 'brand')] : [act('stand', 'Stand up and walk', () => view().set({ mode: 'walk', selected: null }))],
      };
    case 'bunsen':
      return { title: 'Bunsen burner', info: f.bunsen ? 'Lit: a blue flame under the gauze.' : 'Off. Light it with the air hole half open for a blue flame.', actions: [act('flame', f.bunsen ? 'Turn the Bunsen off' : 'Light the Bunsen', ops.bunsen, ops.why.bunsen, 'brand')] };
    case 'tripod':
      return scene.placed.has('tripod') ? { title: 'Tripod and gauze', info: 'The gauze spreads the flame’s heat under the beaker.', actions: [] } : notPlaced('tripod');
    case 'bath':
      if (!scene.placed.has('beaker')) return notPlaced('beaker');
      return {
        title: task === 'COOL' ? 'Water bath' : 'Beaker of boiling water',
        info: task === 'COOL' ? 'Heats the boiling tube evenly to below 100 °C: naphthalene must never go over a flame.' : 'The block hangs in it by its thread until it is at the water’s temperature.',
        actions: task === 'COOL' ? [act('tube', 'Stand the boiling tube in it', ops.tubeBath, ops.why.tube, 'brand'), act('flame', 'Bunsen on / off', ops.bunsen, ops.why.bunsen)] : [act('block', 'Hang the block in it', ops.toBath, ops.why.bath, 'brand'), ...(task === 'MIX' ? thermoActs(ops, 'bath') : [])],
      };
    case 'block':
      return {
        title: 'Metal block on a thread',
        info: f.block === 'bath' ? 'In the boiling water. Leave it several minutes, then transfer it quickly.' : f.block === 'air' ? 'Out of the water — lower it into the calorimeter now!' : f.block === 'cal' ? 'In the calorimeter.' : 'Weigh it first, then hang it in the water.',
        actions:
          f.block === 'bench'
            ? [act('pan', 'Put it on the balance pan', () => ops.pan('block')), act('bath', 'Hang it in the boiling water', ops.toBath, ops.why.bath, 'brand')]
            : f.block === 'cal'
              ? []
              : [
                  ...(f.block === 'bath' ? [act('lift', 'Lift it out by the thread', ops.lift, ops.why.lift)] : []),
                  act('gentle', 'Lower it gently into the calorimeter', () => ops.lower(true), ops.why.lower, 'brand'),
                  act('drop', 'Drop it in', () => ops.lower(false), ops.why.lower),
                ],
      };
    case 'cal':
      return {
        title: 'Copper calorimeter',
        info: `${f.filled ? (task === 'MIX' ? 'Water in it.' : 'Warm water in it.') : 'Empty.'}${f.lagged ? ' In its lagging.' : ''}${f.lid ? ' Covered.' : ''}`,
        actions: [
          ...(task === 'MIX' && !f.filled ? ([1, 2, 3] as const).map((l) => act(`f${l}`, `Fill it ${HEAT_LEVEL_NAME[l]}`, () => ops.fill(l), ops.why.fill, l === 2 ? 'brand' : undefined)) : []),
          ...(task === 'LATENT' && !f.filled ? HEAT_WARM.map((w) => act(`w${w}`, `Pour in warm water (about ${w} °C)`, () => ops.warm(w), ops.why.fill, w === 40 ? 'brand' : undefined)) : []),
          act('pan', o.pan === 'cal' ? 'Take it off the balance' : 'Put it on the balance pan', () => ops.pan(o.pan === 'cal' ? null : 'cal')),
          act('lag', f.lagged ? 'Take it out of its lagging' : 'Stand it in its lagging', ops.lag, ops.why.lag),
          act('lid', f.lid ? 'Take the lid off' : 'Put the lid on', ops.lid, ops.why.bench),
          act('stir', f.stirring ? 'Stop stirring' : 'Stir gently with the stirrer', ops.stir, ops.why.stir),
          ...(task === 'LATENT' ? [act('ice', 'Add a piece of ice', ops.addIce, ops.why.ice, 'brand')] : []),
        ],
      };
    case 'lagging':
      return { title: 'Lagging jacket', info: 'Cotton wool in an outer box: it cuts the heat lost to (or gained from) the room.', actions: [act('lag', f.lagged ? 'Take the calorimeter out' : 'Stand the calorimeter in it', ops.lag, ops.why.lag, 'brand')] };
    case 'stirrer':
      return { title: 'Stirrer', info: 'A copper loop: move it gently up and down to mix the water.', actions: [act('stir', f.stirring ? 'Stop stirring' : 'Stir gently', ops.stir, ops.why.stir, 'brand')] };
    case 'th-bath':
    case 'th-cal':
    case 'th-room':
    case 'th-tube': {
      const th = id.slice(3) as HeatThermo;
      return {
        title: THERMO_NAME[th],
        info: th === 'tube' ? 'Stir gently with it while the naphthalene is liquid; leave it in the solid.' : 'Read it with your eye level with the end of the mercury. It is not a stirrer.',
        actions: [
          ...thermoActs(ops, th),
          ...(th === 'cal' ? [act('thstir', 'Stir with the thermometer', ops.thStir, ops.why.stir)] : []),
          ...(th === 'tube' ? [act('stir', f.stirring ? 'Stop stirring' : 'Stir gently with it', ops.stir, ops.why.stir), act('pull', 'Pull it out', ops.pull, ops.why.bench)] : []),
        ],
      };
    }
    case 'thermometer':
      return scene.placed.has('thermometer') ? null : notPlaced('thermometer');
    case 'balance':
      return {
        title: 'Beam balance',
        info: `${o.pan === 'cal' ? 'The calorimeter' : o.pan === 'block' ? 'The block' : 'Nothing'} on the pan. Slide the riders until the pointer is on zero, then add up the beams.`,
        actions: [
          act('pan-cal', 'Calorimeter on the pan', () => ops.pan('cal'), undefined, o.pan === 'cal' ? 'brand' : undefined),
          ...(task === 'MIX' ? [act('pan-block', 'Block on the pan', () => ops.pan('block'), undefined, o.pan === 'block' ? 'brand' : undefined)] : []),
          act('pan-off', 'Clear the pan', () => ops.pan(null)),
          act('weigh', 'Record this weighing', ops.weigh, ops.why.weigh, 'brand'),
        ],
      };
    case 'rider-h':
    case 'rider-t':
    case 'rider-f': {
      const w = id.slice(6) as keyof Riders;
      const step = w === 'f' ? 0.1 : 1;
      return {
        title: w === 'h' ? '100 g rider' : w === 't' ? '10 g rider' : 'Front rider (0–10 g)',
        info: 'Drag it along its beam, or nudge it.',
        actions: [act('back', `Back ${w === 'h' ? '100 g' : w === 't' ? '10 g' : '0.1 g'}`, () => ops.rider(w, -step)), act('on', `On ${w === 'h' ? '100 g' : w === 't' ? '10 g' : '0.1 g'}`, () => ops.rider(w, step)), ...(w === 'f' ? [act('back1', 'Back 1 g', () => ops.rider('f', -1)), act('on1', 'On 1 g', () => ops.rider('f', 1))] : [])],
      };
    }
    case 'jug':
      return { title: 'Jug of tap water', info: 'For filling the calorimeter (about two-thirds full).', actions: task === 'MIX' && !f.filled ? [act('f2', 'Fill the calorimeter two-thirds full', () => ops.fill(2), ops.why.fill, 'brand')] : [] };
    case 'kettle':
      return { title: 'Flask of warm water', info: 'Warm water about 10 °C above room temperature is ideal for the cooling correction.', actions: !f.filled ? HEAT_WARM.map((w) => act(`w${w}`, `Pour about ${w} °C water`, () => ops.warm(w), ops.why.fill, w === 40 ? 'brand' : undefined)) : [] };
    case 'ice': {
      const b = useBench.getState();
      return {
        title: 'Beaker of melting ice',
        info: 'Melting ice is at exactly 0 °C. Dry each piece with blotting paper before you add it.',
        actions: [
          act('add', `Add a piece (${b.dry ? 'dried' : 'not dried'}, ${b.melting ? 'melting ice' : 'from the freezer'})`, ops.addIce, ops.why.ice, 'brand'),
          act('dry', b.dry ? 'Stop drying the pieces' : 'Dry each piece first', () => useBench.setState({ dry: !b.dry })),
          act('src', b.melting ? 'Use ice from the freezer instead' : 'Use the melting ice', () => useBench.setState({ melting: !b.melting })),
        ],
      };
    }
    case 'blotting':
      return { title: 'Blotting paper', info: 'Dabs the water off each piece of ice: water at 0 °C added with the ice needs no latent heat.', actions: [act('dry', useBench.getState().dry ? 'Drying each piece: on' : 'Dry each piece first', () => useBench.setState({ dry: true }), undefined, 'brand')] };
    case 'tongs':
      return { title: 'Tongs', info: 'Hold hot things with tongs or by the thread, never with your fingers.', actions: [] };
    case 'tube':
      return {
        title: 'Boiling tube of naphthalene',
        info: f.tube === 'bath' ? 'In the water bath.' : f.tube === 'air' ? 'Clamped in air, cooling.' : 'Not heated yet.',
        actions: [
          act('bath', 'Stand it in the water bath', ops.tubeBath, ops.why.tube, f.tube !== 'bath' ? 'brand' : undefined),
          act('air', 'Take it out and clamp it in air', ops.tubeAir, ops.why.air, f.tube === 'bath' ? 'brand' : undefined),
          act('flame', 'Heat it over the flame', ops.tubeFlame, ops.why.bench),
          ...thermoActs(ops, 'tube'),
        ],
      };
    case 'stand':
      return scene.placed.has('stand') ? { title: 'Clamp and stand', info: 'Holds the boiling tube in the bath or in the air.', actions: [] } : notPlaced('stand');
    case 'stopwatch':
      return task === 'COOL' ? { title: 'Stopwatch', info: 'Start it as the tube comes out; read the thermometer every 30 s.', actions: [act('w', f.watch === 'running' ? 'Stop the stopwatch' : 'Start the stopwatch', ops.watch, ops.why.watch, 'brand')] } : { title: 'Stopwatch', info: 'Not needed here.', actions: [returnable('stopwatch')] };
    case 'book':
      return { title: 'Practical notebook', info: 'Your table, graph and answers.', actions: [act('open', 'Open the notebook', () => ctx.open('notebook'), undefined, 'brand')] };
    case 'card':
      return { title: 'Task card', info: 'The question paper.', actions: [act('open', 'Read the task card', () => ctx.open('task'), undefined, 'brand')] };
    case 'spring':
    case 'lens':
      return { title: APPARATUS_LABEL[id], info: 'Not needed for this practical.', actions: [returnable(id)] };
    case 'coat':
      return { title: 'Lab coat', info: 'Protects your clothes from hot water.', actions: [scene.coat ? act('off', 'Take off the lab coat', () => o.note('safety-off:coat')) : act('on', 'Put on the lab coat', () => o.note('safety:coat'))] };
    case 'goggles':
      return { title: 'Safety goggles', info: 'Wear them while water boils: it can spit.', actions: [scene.goggles ? act('off', 'Take the goggles off', () => o.note('safety-off:goggles')) : act('on', 'Put on the goggles', () => o.note('safety:goggles'), undefined, 'brand')] };
    case 'whiteboard':
      return { title: 'Whiteboard', info: 'Today’s practical.', actions: [] };
    default:
      return APPARATUS.some((x) => x.id === id) ? { title: APPARATUS_LABEL[id as ApparatusId], actions: [] } : ROOM_INFO[id] ? { title: ROOM_INFO[id]![0], info: ROOM_INFO[id]![1], actions: [] } : null;
  }
}

const ROOM_INFO: Record<string, [string, string]> = {
  shelf: ['Physics equipment shelf', 'Equipment for other practicals: you need nothing from here.'],
  vdg: ['Van de Graaff generator', 'Teacher only.'],
  co2: ['CO₂ fire extinguisher', 'For electrical and flammable-liquid fires.'],
  blanket: ['Fire blanket', 'Pull the tapes down sharply to use it.'],
  extinguisher: ['Fire extinguisher', 'By the door.'],
  firstaid: ['First-aid box', 'For a scald: cool the skin under cold running water for 10 minutes and tell the teacher.'],
  eyewash: ['Eye-wash station', 'Rinse for 10 minutes.'],
  notice: ['Notice board', 'Department notices and WAEC tips.'],
  desk: ['Teacher’s desk', 'Report a broken thermometer here at once: mercury is poisonous.'],
  'poster-si': ['Poster: SI base units', 'Mass in kg, temperature in K (or °C), energy in J.'],
  'poster-light': ['Poster: refraction of light', 'For the optics practicals.'],
  'poster-electric': ['Poster: electrical safety', 'Nothing electrical in this practical.'],
};
