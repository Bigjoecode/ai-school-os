import { THERM_MAX_READS, type PhyThermalState, type ThermInstrument } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { thermFlags, type Thermal } from '../actions';
import { READ_LABEL } from '../index';
import { useBench } from './bench-store';
import { APPARATUS, APPARATUS_LABEL, NEEDED, PLACE_LABEL, sceneFromState, type ApparatusId, type SceneState } from './scene-state';

/**
 * Everything the student can do at the thermal bench, as plain operations
 * (used by the dock, the object menus, the drags and the demo) and as each
 * object's menu. Marked changes go through the shared actions; collecting and
 * setting out the apparatus are log notes without marks.
 */

const view = () => useLabView.getState();

export interface Ops {
  place: (id: ApparatusId) => void;
  placeNext: () => void;
  // expansion
  boiler: () => void;
  ratchet: () => void;
  thimble: () => void;
  back: () => void;
  // Charles
  bunsen: () => void;
  stirOnce: () => void;
  immerse: (full: boolean) => void;
  ice: () => void;
  // electric
  pan: () => void;
  pour: () => void;
  lag: () => void;
  lid: () => void;
  heater: () => void;
  wire: (kind: 'ok' | 'wide') => void;
  switchOn: () => void;
  switchOff: () => void;
  stir: () => void;
  watch: () => void;
  watchReset: () => void;
  /** Eye-level view of an instrument. */
  read: (k: ThermInstrument) => void;
  /** Record a reading of an instrument. */
  take: (k: ThermInstrument) => void;
  why: Partial<Record<'place' | 'bench' | 'micro' | 'steam' | 'bath' | 'pan' | 'pour' | 'cal' | 'heater' | 'switch' | 'stir' | 'take' | 'rule', string>>;
}

export function makeOps(o: Thermal): Ops {
  const now = () => {
    const st = o.ref.current;
    return { st, scene: sceneFromState(st), f: thermFlags(st.events) };
  };
  const whyNow = () => {
    const { st, scene, f } = now();
    const setUp = !st.task ? 'Choose the experiment first.' : !scene.ready ? `Collect your apparatus first (${scene.missing.length} still in the cupboard).` : !scene.set ? 'Set out the apparatus first (the dock’s button).' : undefined;
    const ruleRead = st.reads.some((r) => r.k === 'rule');
    return {
      place: !st.task ? 'Choose the experiment first.' : !scene.nextPlace ? 'Everything is set out.' : !scene.collected.has(scene.nextPlace) ? `Collect the ${APPARATUS_LABEL[scene.nextPlace].toLowerCase()} first.` : scene.nextPlace === 'rod' && !ruleRead ? 'Measure the rod’s length with the metre rule first (read the metre rule).' : undefined,
      bench: setUp,
      micro: setUp,
      steam: setUp,
      bath: setUp ?? (f.immersed === 'none' && st.task === 'CHARLES' ? undefined : undefined),
      pan: setUp ?? (f.heaterIn ? 'Take the heater out of the calorimeter first.' : f.lagged && !f.pan ? 'Lift the calorimeter out of its lagging first.' : f.on ? 'The heater is on.' : undefined),
      pour: setUp ?? (f.poured ? 'The calorimeter already has its water.' : undefined),
      cal: setUp ?? (f.pan ? 'The calorimeter is on the balance: take it off first.' : undefined),
      heater: setUp ?? (f.pan ? 'The calorimeter is on the balance: take it off first.' : f.on ? 'Switch the heater off first.' : undefined),
      switch: setUp ?? (f.wire === 'none' ? 'Connect the circuit first.' : undefined),
      stir: setUp ?? (st.task === 'ELECTRIC' && !f.poured ? 'Pour the water in first.' : undefined),
      take: setUp ?? (st.reads.length >= THERM_MAX_READS ? 'The record is full.' : undefined),
      rule: !scene.collected.has('rule') || !scene.collected.has('rod') ? 'Collect the rod and the metre rule first.' : undefined,
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
      const { scene, st } = now();
      if (!scene.collected.has(id)) return say(`Collect the ${APPARATUS_LABEL[id].toLowerCase()} first.`);
      if ((id === 'can' || id === 'bigbeaker') && !scene.placed.has('tripod')) return say('Stand the tripod over the Bunsen first.');
      if (id === 'rod' && !st.reads.some((r) => r.k === 'rule')) return say('Measure the rod’s length with the metre rule first.');
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
    boiler: () => guard(whyNow().steam, () => o.boiler(!now().f.boiler), 'clink'),
    ratchet: () => guard(whyNow().micro, () => o.ratchet(), 'tick'),
    thimble: () => guard(whyNow().micro, () => o.thimble(), 'clink'),
    back: () => guard(whyNow().micro, () => o.backOff(), 'tick'),
    bunsen: () => guard(whyNow().bench, () => o.bunsen(!now().f.bunsen), 'clink'),
    stirOnce: () => guard(whyNow().bench, () => o.stirOnce(), 'drip'),
    immerse: (full) => guard(whyNow().bench, () => o.immerse(full), 'drip'),
    ice: () => {
      const { f, st } = now();
      if (whyNow().bench) return say(whyNow().bench!);
      if (f.bunsen || st.rows.length) return say('Ice only at the start, before any heating or readings.');
      o.ice();
      play('clink');
    },
    pan: () => guard(whyNow().pan, () => o.pan(!now().f.pan), 'clink'),
    pour: () => guard(whyNow().pour, () => o.pour(), 'drip'),
    lag: () => guard(whyNow().cal, () => o.lag(!now().f.lagged)),
    lid: () => guard(whyNow().cal, () => o.lid(!now().f.lid)),
    heater: () => guard(whyNow().heater, () => o.heater(!now().f.heaterIn), 'drip'),
    wire: (kind) => guard(whyNow().bench, () => o.wire(kind), 'clink'),
    switchOn: () => guard(whyNow().switch, () => o.switchOn(true), 'clink'),
    switchOff: () => guard(whyNow().bench, () => o.switchOff(), 'clink'),
    stir: () => guard(whyNow().stir, () => o.stir(!now().f.stirring)),
    watch: () => guard(whyNow().bench, () => (now().f.watch === 'running' ? o.watchStop() : o.watchStart())),
    watchReset: () => guard(whyNow().bench, () => o.watchReset()),
    read: (k) => {
      const w = k === 'rule' ? whyNow().rule : whyNow().bench;
      if (w) return say(w);
      useBench.setState({ instr: k });
      useLabView.setState({ mode: 'read', selected: null, spot: null });
    },
    take: (k) => guard(k === 'rule' ? whyNow().rule : whyNow().take, () => o.read(k), 'success'),
  };
  return ops;
}

export interface ActionCtx {
  o: Thermal;
  s: PhyThermalState;
  scene: SceneState;
  ops: Ops;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}

const act = (key: string, label: string, run: () => void, blocked?: string, tone?: 'brand'): LabAction => ({ key, label, run, blocked, tone });
const readActs = (ops: Ops, k: ThermInstrument, blocked = ops.why.bench): LabAction[] => [act('read', `Read the ${READ_LABEL[k].toLowerCase()} at eye level`, () => ops.read(k), blocked, 'brand'), act('take', 'Take this reading', () => ops.take(k), k === 'rule' ? ops.why.rule : ops.why.take)];

export function objectPanel(id: string, ctx: ActionCtx): ObjectPanel | null {
  const { o, s, scene, ops } = ctx;
  const task = s.task ?? 'EXPANSION';
  const f = thermFlags(s.events);
  const p = o.phys();
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
  const inUse = (a: ApparatusId) => scene.placed.has(a) || (NEEDED[task].includes(a) && s.events.length > 0);
  const returnable = (a: ApparatusId) => act('return', 'Put back in the cupboard', () => (o.note(`return:${a}`), view().set({ selected: null })), inUse(a) ? 'You are using it.' : undefined);
  const notPlaced = (a: ApparatusId): ObjectPanel => ({ title: APPARATUS_LABEL[a], info: 'On your bench, not yet set out.', actions: [act('place', PLACE_LABEL[a] ?? 'Set it out', () => ops.place(a), a === 'rod' && !s.reads.some((r) => r.k === 'rule') ? 'Measure it with the metre rule first.' : undefined, 'brand'), ...(a === 'rod' ? readActs(ops, 'rule', ops.why.rule) : []), returnable(a)] });
  switch (id) {
    case 'cupboard':
      return { title: 'Apparatus cupboard', info: 'Choose the apparatus you need for this practical.', actions: [act('list', 'Choose apparatus…', () => ctx.open('cupboard'), undefined, 'brand')] };
    case 'mybench':
      return {
        title: 'Your bench',
        info: 'Bench 2: your task card and notebook are here.',
        actions: view().mode === 'walk' ? [act('sit', 'Work at my bench', () => view().set({ mode: 'bench', focus: 'bench', selected: null }), undefined, 'brand')] : [act('stand', 'Stand up and walk', () => view().set({ mode: 'walk', selected: null }))],
      };
    // ---- expansion
    case 'can':
      if (!scene.placed.has('can')) return notPlaced('can');
      return { title: 'Steam generator', info: p.boiler ? (p.can >= o.v.boil - 0.05 ? 'Boiling: steam is passing through the jacket.' : 'Heating the water…') : 'A can of water on the gauze; its steam goes through the rubber tubing into the jacket.', actions: [act('steam', f.boiler ? 'Turn the burner off' : 'Light the burner under it', ops.boiler, ops.why.steam, 'brand')] };
    case 'bunsen':
      return task === 'EXPANSION'
        ? { title: 'Bunsen burner', info: f.boiler ? 'Lit, under the steam can.' : 'Off.', actions: [act('flame', f.boiler ? 'Turn it off' : 'Light it', ops.boiler, ops.why.steam, 'brand')] }
        : task === 'CHARLES'
          ? { title: 'Bunsen burner', info: f.bunsen ? 'Lit: heating the water. Remove the flame before each reading.' : 'Off.', actions: [act('flame', f.bunsen ? 'Remove the flame' : 'Light it and heat gently', ops.bunsen, ops.why.bench, 'brand')] }
          : { title: 'Bunsen burner', info: 'Not needed: the heater is electric.', actions: [returnable('bunsen')] };
    case 'tripod':
      return scene.placed.has('tripod') ? { title: 'Tripod and gauze', info: 'The gauze spreads the flame’s heat.', actions: [] } : notPlaced('tripod');
    case 'jacket':
      if (!scene.placed.has('jacket')) return notPlaced('jacket');
      return { title: 'Steam jacket', info: 'A brass tube around the rod: steam enters at one end and leaves by the outlet into the beaker. The rod is fixed against the stop at the far end.', actions: [act('steam', f.boiler ? 'Turn the steam off' : 'Pass steam (light the burner)', ops.boiler, ops.why.steam)] };
    case 'tubing':
      return scene.placed.has('tubing') ? { title: 'Rubber tubing', info: 'Carries the steam from the can to the jacket.', actions: [] } : notPlaced('tubing');
    case 'rod':
      if (!scene.placed.has('rod')) return notPlaced('rod');
      return { title: `Metal rod (${o.v.metal})`, info: 'In the jacket: one end against the fixed stop, the other at the micrometer.', actions: [] };
    case 'micro':
      return {
        title: 'Micrometer screw gauge',
        info: p.contact ? 'Touching the rod.' : 'Backed off: not touching the rod.',
        actions: [act('ratchet', 'Turn the ratchet until it clicks', ops.ratchet, ops.why.micro, 'brand'), act('back', 'Back it off a few turns', ops.back, ops.why.micro), act('thimble', 'Screw the thimble up tight', ops.thimble, ops.why.micro), ...readActs(ops, 'micro')],
      };
    case 'rule':
      return { title: 'Metre rule', info: scene.placed.has('rod') ? 'The rod is in the jacket now.' : 'The rod lies along it, one end at the zero.', actions: readActs(ops, 'rule', ops.why.rule) };
    case 'beaker':
      return { title: 'Beaker', info: 'Catches the steam and the condensed water from the outlet, away from people.', actions: [] };
    case 'th-jacket':
    case 'th-bath':
    case 'th-cal':
      return { title: id === 'th-jacket' ? 'Thermometer in the jacket' : id === 'th-bath' ? 'Thermometer (tied to the ruler)' : 'Thermometer in the calorimeter', info: 'Read it with your eye level with the end of the mercury.', actions: readActs(ops, 'thermo') };
    case 'thermometer':
      return scene.placed.has('thermometer') ? null : notPlaced('thermometer');
    // ---- Charles
    case 'bigbeaker':
      if (!scene.placed.has('bigbeaker')) return notPlaced('bigbeaker');
      return { title: 'Large beaker of water', info: `About ${Math.round(p.tw)} °C.`, actions: [act('flame', f.bunsen ? 'Remove the flame' : 'Heat it gently', ops.bunsen, ops.why.bench), act('stir', 'Stir well', ops.stirOnce, ops.why.bench, 'brand'), act('ice', 'Add ice (start cold)', ops.ice, f.bunsen || s.rows.length ? 'Only at the start.' : ops.why.bench)] };
    case 'stand':
      return scene.placed.has('stand') ? { title: 'Clamp and stand', info: 'Holds the ruler in the water.', actions: [act('full', 'Lower it: air column fully under', () => ops.immerse(true), ops.why.bench, 'brand'), act('part', 'Lower it only part of the way', () => ops.immerse(false), ops.why.bench)] } : notPlaced('stand');
    case 'capillary':
      if (!scene.placed.has('capillary')) return notPlaced('capillary');
      return {
        title: 'Capillary tube on the ruler',
        info: f.immersed === 'full' ? 'Fully under the water.' : f.immersed === 'part' ? 'Only partly under the water: the top of the air column is out.' : 'Above the water.',
        actions: [act('full', 'Lower it: air column fully under', () => ops.immerse(true), ops.why.bench, f.immersed !== 'full' ? 'brand' : undefined), act('part', 'Only part of the way', () => ops.immerse(false), ops.why.bench), ...readActs(ops, 'column')],
      };
    case 'stirrer':
      return task === 'ELECTRIC' ? { title: 'Stirrer', info: 'Move it gently up and down all the time.', actions: [act('stir', f.stirring ? 'Stop stirring' : 'Stir continuously', ops.stir, ops.why.stir, 'brand')] } : { title: 'Stirrer', info: 'Stir the whole bath well before each reading.', actions: [act('stir', 'Stir well', ops.stirOnce, ops.why.bench, 'brand')] };
    case 'ice':
      return task === 'CHARLES' ? { title: 'Beaker of ice', info: 'Optional: start with cold water for a wider range.', actions: [act('ice', 'Add ice to the bath', ops.ice, f.bunsen || s.rows.length ? 'Only at the start.' : ops.why.bench)] } : { title: 'Beaker of ice', info: 'Not needed here.', actions: [returnable('ice')] };
    // ---- electric
    case 'cal':
      return {
        title: 'Copper calorimeter',
        info: `${f.poured ? 'Water in it.' : 'Empty.'}${f.lagged ? ' In its lagging.' : ''}${f.lid ? ' Covered.' : ''}${f.heaterIn ? ' Heater in.' : ''}`,
        actions: [
          act('pan', f.pan ? 'Take it off the balance' : 'Put it on the balance', ops.pan, ops.why.pan, !f.poured || (f.poured && s.reads.filter((r) => r.k === 'balance').length < 2) ? 'brand' : undefined),
          ...(!f.poured ? [act('pour', 'Pour in about 200 g of water', ops.pour, ops.why.pour)] : []),
          act('lag', f.lagged ? 'Lift it out of its lagging' : 'Stand it in its lagging', ops.lag, ops.why.cal),
          act('heater', f.heaterIn ? 'Take the heater out' : 'Put the heater in, fully under', ops.heater, ops.why.heater),
          act('lid', f.lid ? 'Take the lid off' : 'Put the lid on', ops.lid, ops.why.cal),
          act('stir', f.stirring ? 'Stop stirring' : 'Stir continuously', ops.stir, ops.why.stir),
        ],
      };
    case 'lagging':
      return { title: 'Lagging jacket', info: 'Cotton wool cuts the heat lost to the room.', actions: [act('lag', f.lagged ? 'Lift the calorimeter out' : 'Stand the calorimeter in it', ops.lag, ops.why.cal, 'brand')] };
    case 'heater':
      return { title: 'Immersion heater (12 V)', info: p.on ? `On: ${p.dry ? 'it was switched on out of the water!' : 'heating the water.'}` : f.heaterIn ? 'In the water, off.' : 'Out of the water. Never switch it on in air.', actions: [act('heater', f.heaterIn ? 'Take it out' : 'Put it in, fully under the water', ops.heater, ops.why.heater, 'brand'), f.on ? act('off', 'Switch off', ops.switchOff, ops.why.bench) : act('on', 'Switch on and start the stopwatch', ops.switchOn, ops.why.switch)] };
    case 'supply':
      return { title: '12 V d.c. supply', info: f.on ? 'Switched on.' : 'Off.', actions: [f.on ? act('off', 'Switch off', ops.switchOff, ops.why.bench, 'brand') : act('on', 'Switch on and start the stopwatch', ops.switchOn, ops.why.switch, 'brand')] };
    case 'wires':
    case 'ammeter':
    case 'voltmeter':
      return {
        title: id === 'ammeter' ? 'Ammeter (0–3 A)' : id === 'voltmeter' ? 'Voltmeter (0–15 V)' : 'Connecting wires',
        info: f.wire === 'ok' ? 'Ammeter in series; voltmeter across the heater.' : f.wire === 'wide' ? 'The voltmeter is across the heater AND the ammeter.' : 'Not connected yet.',
        actions: [act('ok', 'Ammeter in series, voltmeter across the heater', () => ops.wire('ok'), ops.why.bench, f.wire === 'none' ? 'brand' : undefined), act('wide', 'Voltmeter across the heater and ammeter', () => ops.wire('wide'), ops.why.bench), ...(id === 'ammeter' ? readActs(ops, 'ammeter') : id === 'voltmeter' ? readActs(ops, 'voltmeter') : [])],
      };
    case 'balance':
      return { title: 'Electronic balance', info: f.pan ? 'The calorimeter is on the pan.' : 'Nothing on the pan.', actions: [act('pan', f.pan ? 'Take the calorimeter off' : 'Put the calorimeter on', ops.pan, ops.why.pan, 'brand'), ...readActs(ops, 'balance')] };
    case 'jug':
      return { title: 'Jug of water', info: 'About 200 g goes into the calorimeter.', actions: !f.poured ? [act('pour', 'Pour about 200 g into the calorimeter', ops.pour, ops.why.pour, 'brand')] : [] };
    case 'stopwatch':
      return task === 'ELECTRIC' ? { title: 'Stopwatch', info: 'Start it as you switch on; switch off at 300 s.', actions: [act('w', f.watch === 'running' ? 'Stop the stopwatch' : 'Start the stopwatch', ops.watch, ops.why.bench), act('reset', 'Reset it', ops.watchReset, f.watch === 'running' ? 'Stop it first.' : ops.why.bench), ...readActs(ops, 'watch')] } : { title: 'Stopwatch', info: 'Not needed here.', actions: [returnable('stopwatch')] };
    // ---- general
    case 'book':
      return { title: 'Practical notebook', info: 'Your table, graph and answers.', actions: [act('open', 'Open the notebook', () => ctx.open('notebook'), undefined, 'brand')] };
    case 'card':
      return { title: 'Task card', info: 'The question paper.', actions: [act('open', 'Read the task card', () => ctx.open('task'), undefined, 'brand')] };
    case 'spring':
    case 'lens':
      return { title: APPARATUS_LABEL[id], info: 'Not needed for this practical.', actions: [returnable(id)] };
    case 'coat':
      return { title: 'Lab coat', info: 'Protects your clothes from hot water and steam.', actions: [scene.coat ? act('off', 'Take off the lab coat', () => o.note('safety-off:coat')) : act('on', 'Put on the lab coat', () => o.note('safety:coat'))] };
    case 'goggles':
      return { title: 'Safety goggles', info: 'Wear them while water boils or near the acid tube.', actions: [scene.goggles ? act('off', 'Take the goggles off', () => o.note('safety-off:goggles')) : act('on', 'Put on the goggles', () => o.note('safety:goggles'), undefined, 'brand')] };
    case 'whiteboard':
      return { title: 'Whiteboard', info: 'Today’s practical.', actions: [] };
    default:
      return APPARATUS.some((x) => x.id === id) ? { title: APPARATUS_LABEL[id as ApparatusId], actions: scene.placed.has(id as ApparatusId) ? [] : [returnable(id as ApparatusId)] } : ROOM_INFO[id] ? { title: ROOM_INFO[id]![0], info: ROOM_INFO[id]![1], actions: [] } : null;
  }
}

const ROOM_INFO: Record<string, [string, string]> = {
  shelf: ['Physics equipment shelf', 'Equipment for other practicals: you need nothing from here.'],
  vdg: ['Van de Graaff generator', 'Teacher only.'],
  co2: ['CO₂ fire extinguisher', 'For electrical fires and burning liquids.'],
  blanket: ['Fire blanket', 'Pull the tapes down sharply to use it.'],
  extinguisher: ['Fire extinguisher', 'By the door.'],
  firstaid: ['First-aid box', 'For a scald or steam burn: cool the skin under cold running water for 10 minutes and tell the teacher.'],
  eyewash: ['Eye-wash station', 'For an acid splash: rinse for 10 minutes and tell the teacher.'],
  notice: ['Notice board', 'Department notices and WAEC tips.'],
  desk: ['Teacher’s desk', 'Report a broken thermometer or tube here at once.'],
  'poster-si': ['Poster: SI base units', 'Length in m, temperature in K, energy in J.'],
  'poster-light': ['Poster: refraction of light', 'For the optics practicals.'],
  'poster-electric': ['Poster: electrical safety', 'Low-voltage supplies only; switch off before changing the circuit.'],
};
