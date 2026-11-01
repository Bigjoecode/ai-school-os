import {
  LEAF_KINDS,
  LEAF_LABEL,
  LEAF_SHORT,
  OXY_DISTS,
  POTO_CONDS,
  POTO_COND_LABEL,
  POTO_COND_SHORT,
  STARCH_PLANTS,
  STARCH_PLANT_LABEL,
  oxyLampAt,
  oxySplint,
  potoCondAt,
  type BioPlantState,
  type LeafKind,
  type PotoCond,
} from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { bioRoomPanel } from '../../bio-common/lab3d/common';
import type { Plant } from '../actions';
import { lastCountShown, lastRunShown, waterTemp } from '../readings';
import { usePlantBench } from './bench';
import { PLANT_APPARATUS, PLANT_APPARATUS_LABEL, neededFor, type PlantApparatusId, type PlantScene } from './scene-state';

/**
 * What can be done with each object on the plant bench. Every action is a
 * button; a blocked one says why. Marked changes go through the shared
 * actions (the same as the 2D lab); the 3D-only steps (safety, apparatus,
 * hand washing) are log notes.
 */

export interface PlantCtx {
  p: Plant;
  s: BioPlantState;
  scene: PlantScene;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}
const view = () => useLabView.getState();
const setView = (x: Parameters<ReturnType<typeof useLabView.getState>['set']>[0]) => view().set(x);
const need = (ctx: PlantCtx, id: PlantApparatusId) => (ctx.scene.collected.has(id) ? undefined : `Get the ${PLANT_APPARATUS_LABEL[id].toLowerCase()} from the apparatus cupboard first.`);
const firstBlock = (...xs: (string | undefined)[]) => xs.find(Boolean);
const lc = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
export const readNow = () => setView({ mode: 'read', selected: null });
const min1 = (x: number) => Math.round(x * 10) / 10;

// ------------------------------------------------------------------ potometer

export const potoActs = {
  time(ctx: PlantCtx) {
    const n = ctx.p.poto.time();
    if (n < 0) return notify('Reset the bubble to the zero mark first (the reservoir tap).', 'warning');
    play('tick');
    const r = lastRunShown(ctx.p.v, ctx.p.ref.current);
    if (r) notify(`The bubble moved 30 mm in ${r.sec.toFixed(1)} s (${POTO_COND_SHORT[r.run.cond].toLowerCase()}). Write it in your notebook.`, 'success', 4200);
  },
  cond(ctx: PlantCtx, c: PotoCond) {
    ctx.p.poto.setCond(c);
    play('clink');
    notify(`${POTO_COND_LABEL[c]}. Let the shoot adjust for 5 minutes before timing.`, 'info', 3000);
  },
  reset(ctx: PlantCtx) {
    ctx.p.poto.reset();
    play('drip');
  },
};
function potoPanel(id: string, ctx: PlantCtx): ObjectPanel | null {
  const { p, s } = ctx;
  const w = s.poto;
  const a = p.poto;
  const cond = potoCondAt(w, w.clock);
  const since = min1(w.clock - (w.conds.filter((c) => c.at <= w.clock).at(-1)?.at ?? 0));
  const condAct = (c: PotoCond, needId?: PlantApparatusId): LabAction => ({ key: `c-${c}`, label: POTO_COND_LABEL[c], tone: cond === c ? undefined : 'brand', blocked: firstBlock(!w.bubble ? 'Set up the potometer with a bubble first.' : undefined, needId ? need(ctx, needId) : undefined, cond === c ? 'That is the condition now.' : undefined), run: () => potoActs.cond(ctx, c) });
  if (id === 'shoot' || id === 'bowl' || id === 'blade')
    return {
      title: id === 'bowl' ? 'Bowl of water' : id === 'blade' ? 'Razor blade' : 'Leafy shoot',
      info: 'Cut the stem with a slanting cut under water, so no air is drawn into the xylem; fit it into the potometer under water too.',
      actions: [
        { key: 'cutw', label: 'Cut the shoot under water', tone: 'brand', blocked: firstBlock(need(ctx, 'blade'), need(ctx, 'bowl'), w.cut ? 'Already cut.' : undefined), run: () => (a.cut('WATER'), play('creak')) },
        { key: 'cuta', label: 'Cut the shoot in the air', blocked: firstBlock(need(ctx, 'blade'), w.cut ? 'Already cut.' : undefined), run: () => (a.cut('AIR'), play('creak')) },
        { key: 'fitw', label: 'Fit it into the potometer under water', tone: 'brand', blocked: firstBlock(need(ctx, 'potometer'), need(ctx, 'bowl'), !w.cut ? 'Cut the shoot first.' : undefined, w.fit ? 'Already fitted.' : undefined), run: () => (a.fit('WATER'), play('drip'), setView({ focus: 'potometer' })) },
        { key: 'fita', label: 'Fit it into the potometer in the air', blocked: firstBlock(need(ctx, 'potometer'), !w.cut ? 'Cut the shoot first.' : undefined, w.fit ? 'Already fitted.' : undefined), run: () => (a.fit('AIR'), play('clink')) },
      ],
    };
  if (id === 'vaseline') return { title: 'Vaseline', info: 'Smear it round the joint between the shoot and the rubber tubing so no air can leak in.', actions: [{ key: 'seal', label: 'Seal the joint with Vaseline', tone: 'brand', blocked: firstBlock(!w.fit ? 'Fit the shoot first.' : undefined, w.sealed ? 'Sealed.' : undefined), run: () => (a.seal(), play('tick')) }] };
  if (id === 'potometer')
    return {
      title: 'Bubble potometer',
      info: w.bubble ? `${POTO_COND_SHORT[cond]} for ${since} min. Reset the bubble, then time it over 30 mm.` : 'Water is drawn along the capillary as the shoot takes it up: the bubble shows how fast.',
      actions: [
        { key: 'bubble', label: 'Lift it out, dry the leaves, let one air bubble in', tone: 'brand', blocked: firstBlock(!w.fit ? 'Fit the shoot first.' : undefined, w.bubble ? 'There is a bubble.' : undefined), run: () => (a.bubble(), play('drip')) },
        { key: 'reset', label: 'Reset the bubble to zero (reservoir tap)', blocked: firstBlock(!w.bubble ? 'No bubble yet.' : undefined, w.zeroAt === w.clock ? 'It is at the zero mark.' : undefined), run: () => potoActs.reset(ctx) },
        { key: 'time', label: 'Time the bubble over 30 mm', tone: 'brand', blocked: firstBlock(need(ctx, 'clock'), !w.bubble ? 'No bubble yet.' : undefined, w.zeroAt !== w.clock ? 'Reset the bubble to the zero mark first.' : undefined), run: () => potoActs.time(ctx) },
        { key: 'read', label: 'Look closely at the scale', blocked: !w.bubble ? 'No bubble yet.' : undefined, run: readNow },
        { key: 'w5', label: 'Wait 5 min (time-lapse)', blocked: !w.bubble ? 'No bubble yet.' : undefined, run: () => (a.wait(5), play('tick')) },
      ],
    };
  if (id === 'fan') return { title: 'Electric fan', info: 'Moving air carries water vapour away from the leaves.', actions: [condAct('FAN', 'fan'), condAct('STILL')] };
  if (id === 'lamp') return { title: 'Bench lamp', info: 'Bright light opens the stomata.', actions: [condAct('LAMP', 'lamp'), condAct('STILL')] };
  if (id === 'bags') return { title: 'Bags', info: 'A black bag keeps the shoot in the dark; a clear polythene bag keeps the air round it humid.', actions: [condAct('DARK', 'bags'), condAct('HUMID', 'bags'), condAct('STILL')] };
  if (id === 'clock')
    return {
      title: 'Stopwatch',
      info: lastRunShown(p.v, s) ? `Last timing: ${lastRunShown(p.v, s)!.sec.toFixed(1)} s.` : 'Start it as the bubble passes the zero mark; stop it at 30 mm.',
      actions: [
        { key: 'time', label: 'Time the bubble over 30 mm', tone: 'brand', blocked: firstBlock(!w.bubble ? 'No bubble yet.' : undefined, w.zeroAt !== w.clock ? 'Reset the bubble to the zero mark first.' : undefined), run: () => potoActs.time(ctx) },
        { key: 'w1', label: 'Wait 1 min', blocked: !w.bubble ? 'No bubble yet.' : undefined, run: () => (a.wait(1), play('tick')) },
        { key: 'w5', label: 'Wait 5 min', blocked: !w.bubble ? 'No bubble yet.' : undefined, run: () => (a.wait(5), play('tick')) },
      ],
    };
  return null;
}

// ------------------------------------------------------------------ oxygen

export const oxyActs = {
  count(ctx: PlantCtx) {
    const n = ctx.p.oxy.count();
    if (n < 0) return notify('Switch the lamp on first.', 'warning');
    play('tick');
    const c = lastCountShown(ctx.p.v, ctx.p.ref.current);
    if (c) notify(`${c.bubbles} bubbles in one minute (lamp at ${c.d} cm). Write it in your notebook.`, 'success', 4000);
  },
  lamp(ctx: PlantCtx, d: number | null) {
    ctx.p.oxy.lamp(d);
    play('clink');
    if (d !== null) notify(`Lamp at ${d} cm. Wait 5 minutes for the plant to adjust.`, 'info', 2600);
  },
  splint(ctx: PlantCtx) {
    ctx.p.oxy.splint();
    const sp = oxySplint(ctx.p.v.oxy, ctx.p.ref.current.oxy);
    play(sp?.relit ? 'success' : 'tick');
    notify(sp?.relit ? 'The glowing splint bursts into flame!' : 'The splint glows a little brighter but does not relight: too little gas yet.', sp?.relit ? 'success' : 'info', 4000);
  },
};
function oxyPanel(id: string, ctx: PlantCtx): ObjectPanel | null {
  const { p, s } = ctx;
  const w = s.oxy;
  const a = p.oxy;
  const d = oxyLampAt(w, w.clock);
  const since = min1(w.clock - (w.moves.filter((m) => m.at <= w.clock).at(-1)?.at ?? 0));
  if (id === 'bottle') return { title: 'Sodium hydrogencarbonate', info: 'A pinch in the water supplies carbon dioxide for photosynthesis.', actions: [{ key: 'add', label: w.plant ? 'Add another pinch to the water' : 'Add a pinch to the water', tone: 'brand', blocked: firstBlock(need(ctx, 'beaker'), w.nahco3 && (!w.plant || w.co2At !== null) ? 'Added.' : undefined), run: () => (a.nahco3(), play('drip')) }] };
  if (id === 'weed') return { title: 'Pondweed (Elodea)', info: 'Freshly cut, cut end upwards so bubbles leave from it.', actions: [{ key: 'plant', label: 'Put it under the funnel in the beaker', tone: 'brand', blocked: firstBlock(need(ctx, 'beaker'), need(ctx, 'funnel'), w.plant ? 'It is in.' : undefined), run: () => (a.plant(), play('drip'), setView({ focus: 'oxygen' })) }] };
  if (id === 'rig' || id === 'thermometer')
    return {
      title: w.plant ? 'Pondweed under the funnel' : 'Large beaker of water',
      info: w.plant ? (d === null ? 'Lamp off.' : `Lamp at ${d} cm for ${since} min.`) : 'Set up the pondweed under the funnel.',
      actions: [
        { key: 'tube', label: 'Put a test tube full of water over the funnel stem', blocked: firstBlock(need(ctx, 'tube'), !w.plant ? 'Put the pondweed in first.' : undefined, w.tubeAt !== null ? 'In place.' : undefined), run: () => (a.tube(), play('clink')) },
        { key: 'count', label: 'Count the bubbles for 1 minute', tone: 'brand', blocked: firstBlock(need(ctx, 'clock'), !w.plant ? 'Put the pondweed in first.' : undefined, d === null ? 'Switch the lamp on first.' : undefined), run: () => oxyActs.count(ctx) },
        { key: 'look', label: 'Watch the bubbles closely', blocked: !w.plant ? 'Put the pondweed in first.' : undefined, run: readNow },
        w.dark ? { key: 'light', label: 'Switch the room lights back on', run: () => a.dark(false) } : { key: 'dark', label: 'Darken the room (lights off, blinds drawn)', run: () => (a.dark(true), play('tick')) },
        { key: 'temp', label: 'Read the thermometer', blocked: need(ctx, 'thermometer'), run: () => (a.temp(), notify(`The water is at ${waterTemp(p.v, p.ref.current).toFixed(1)} °C.`, 'info', 2600)) },
        { key: 'w5', label: 'Wait 5 min (time-lapse)', blocked: !w.plant ? 'Not set up.' : undefined, run: () => (a.wait(5), play('tick')) },
      ],
    };
  if (id === 'lamp' || id === 'rule')
    return {
      title: d === null ? 'Bench lamp (off)' : `Bench lamp at ${d} cm`,
      info: 'Light intensity falls as 1/d²: moving from 10 to 20 cm gives a quarter of the light.',
      actions: [
        ...OXY_DISTS.map((x): LabAction => ({ key: `d${x}`, label: `Lamp at ${x} cm`, tone: x === 10 && d === null ? 'brand' : undefined, blocked: firstBlock(need(ctx, 'lamp'), need(ctx, 'rule'), !w.plant ? 'Set up the pondweed first.' : undefined, d === x ? 'It is there.' : undefined), run: () => oxyActs.lamp(ctx, x) })),
        { key: 'off', label: 'Switch the lamp off', blocked: d === null ? 'It is off.' : undefined, run: () => oxyActs.lamp(ctx, null) },
      ],
    };
  if (id === 'trough') return { title: 'Water trough', info: 'Between the lamp and the beaker it absorbs the lamp’s heat, so the temperature stays constant.', actions: [w.shield ? { key: 'out', label: 'Take it away', run: () => a.shield(false) } : { key: 'in', label: 'Put it between the lamp and the beaker', tone: 'brand', run: () => (a.shield(true), play('clink')) }] };
  if (id === 'splint') return { title: 'Wooden splints', info: 'Light one, blow it out so it glows, and push it into the gas collected in the tube.', actions: [{ key: 'test', label: 'Test the gas with a glowing splint', tone: 'brand', blocked: firstBlock(w.tubeAt === null ? 'Collect the gas in a test tube first.' : undefined, w.splintAt !== null ? 'Done.' : undefined), run: () => oxyActs.splint(ctx) }] };
  if (id === 'clock') return { title: `Clock: ${Math.round(w.clock)} min`, info: 'Count the bubbles for exactly one minute.', actions: [{ key: 'count', label: 'Count the bubbles for 1 minute', tone: 'brand', blocked: d === null ? 'Switch the lamp on first.' : undefined, run: () => oxyActs.count(ctx) }, { key: 'w1', label: 'Wait 1 min', run: () => a.wait(1) }, { key: 'w5', label: 'Wait 5 min', run: () => a.wait(5) }] };
  return null;
}

// ------------------------------------------------------------------ starch

export const starchActs = {
  ethanol(ctx: PlantCtx, i: number, direct = false) {
    const fl = ctx.s.starch.flame;
    ctx.p.starch.ethanol(i, direct);
    if (direct) {
      usePlantBench.setState({ fireAt: performance.now() });
      play('oops');
      notify('The ethanol caught fire! Ethanol is highly flammable: never heat it over a flame. Turn the gas off and smother it with a damp cloth.', 'danger', 6000);
    } else if (fl) {
      play('oops');
      notify('Danger: the Bunsen is still alight next to ethanol. Turn the flame off before ethanol goes near the water bath.', 'danger', 5000);
    } else {
      play('drip');
      notify('The tube of ethanol stands in the hot water: the chlorophyll dissolves out and the leaf turns white.', 'success', 3000);
    }
  },
  pick(ctx: PlantCtx, k: LeafKind) {
    const i = ctx.p.starch.pick(k);
    if (i < 0) return notify('You cannot pick that leaf now.', 'warning');
    usePlantBench.setState({ sel: i });
    play('creak');
  },
};
function starchPanel(id: string, ctx: PlantCtx): ObjectPanel | null {
  const { p, s } = ctx;
  const w = s.starch;
  const a = p.starch;
  const sel = usePlantBench.getState().sel;
  if (id === 'pot')
    return {
      title: w.plant ? STARCH_PLANT_LABEL[w.plant] : 'Two potted plants',
      info: w.plant ? `${w.hours} h in bright light.` : 'A has been in a dark cupboard for 48 hours (destarched); B comes straight from the window.',
      actions: [
        ...(!w.plant ? STARCH_PLANTS.map((x): LabAction => ({ key: x, label: `Use ${STARCH_PLANT_LABEL[x].split(':')[0]}`, tone: x === 'DESTARCHED' ? 'brand' : undefined, run: () => (a.plant(x), play('clink')) })) : []),
        { key: 'foil', label: 'Fix a foil strip across both sides of a leaf', blocked: firstBlock(need(ctx, 'foil'), !w.plant ? 'Choose a plant first.' : undefined, w.foil ? 'Done.' : undefined, w.hours > 0 ? 'Too late: do it before the light.' : undefined), run: () => (a.foil(), play('tick')) },
        { key: 'koh', label: 'Seal a leaf in the flask with KOH', blocked: firstBlock(need(ctx, 'flask'), !w.plant ? 'Choose a plant first.' : undefined, w.koh ? 'Done.' : undefined, w.hours > 0 ? 'Too late: do it before the light.' : undefined), run: () => (a.koh(), play('clink')) },
        { key: 'light', label: 'Bright light for 2 hours (time-lapse)', tone: 'brand', blocked: !w.plant ? 'Choose a plant first.' : w.hours >= 8 ? 'That is enough.' : undefined, run: () => (a.light(2), play('tick')) },
        ...LEAF_KINDS.map((k): LabAction => ({ key: `pick-${k}`, label: `Pick: ${LEAF_LABEL[k].toLowerCase()}`, blocked: firstBlock(!w.plant ? 'Choose a plant first.' : undefined, w.leaves.some((l) => l.kind === k) ? 'Picked.' : undefined, k === 'FOIL' && !w.foil ? 'No foil strip was put on.' : undefined, k === 'NOCO2' && !w.koh ? 'No leaf was sealed in the flask.' : undefined), run: () => starchActs.pick(ctx, k) })),
        { key: 'draw', label: 'Draw the green and white pattern of the variegated leaf', blocked: w.drawn ? 'Drawn.' : undefined, run: () => (a.draw(), notify('Pattern drawn in your notebook: green in the middle, white round the edge.', 'success', 2600)) },
      ],
    };
  if (id === 'bath')
    return {
      title: 'Water bath',
      info: w.flame ? 'Boiling. Turn the flame OFF before using ethanol.' : w.hot ? 'Hot water, flame off: safe for the ethanol tube.' : 'Light the Bunsen to boil the water.',
      actions: [
        w.flame ? { key: 'off', label: 'Turn the Bunsen flame off', tone: 'brand', run: () => (a.flame(false), play('tick')) } : { key: 'on', label: 'Light the Bunsen burner', blocked: need(ctx, 'bath'), run: () => (a.flame(true), play('tick')) },
        ...w.leaves.map((l, i): LabAction => ({ key: `boil${i}`, label: `Boil leaf ${i + 1} (${LEAF_SHORT[l.kind].toLowerCase()}) for 1 min`, blocked: firstBlock(need(ctx, 'forceps'), !w.flame ? 'Light the Bunsen first.' : undefined), run: () => (a.boil(i), usePlantBench.setState({ sel: i }), play('drip')) })),
        ...w.leaves.map((_l, i): LabAction => ({ key: `eth${i}`, label: `Leaf ${i + 1} into a tube of ethanol in the hot water`, tone: w.flame ? undefined : 'brand', blocked: firstBlock(need(ctx, 'tubes'), !w.hot ? 'Heat the water bath first.' : undefined), run: () => (usePlantBench.setState({ sel: i }), starchActs.ethanol(ctx, i)) })),
      ],
    };
  if (id === 'ethanol')
    return {
      title: 'Ethanol — highly flammable',
      info: 'It dissolves the chlorophyll. Warm it only by standing its tube in hot water, with the flame turned off.',
      actions: w.leaves.flatMap((_l, i): LabAction[] => [
        { key: `b${i}`, label: `Leaf ${i + 1}: tube of ethanol in the hot water bath`, tone: 'brand', blocked: firstBlock(need(ctx, 'tubes'), !w.hot ? 'Heat the water bath first.' : undefined), run: () => (usePlantBench.setState({ sel: i }), starchActs.ethanol(ctx, i)) },
        { key: `d${i}`, label: `Leaf ${i + 1}: heat the ethanol tube over the flame`, tone: 'danger', blocked: !w.flame ? 'The flame is off.' : undefined, run: () => (usePlantBench.setState({ sel: i }), starchActs.ethanol(ctx, i, true)) },
      ]),
    };
  if (id.startsWith('leaf:')) {
    const i = Number(id.slice(5));
    const l = w.leaves[i];
    if (!l) return null;
    if (usePlantBench.getState().sel !== i) queueMicrotask(() => usePlantBench.setState({ sel: i }));
    return {
      title: `Leaf ${i + 1}: ${LEAF_SHORT[l.kind]}`,
      info: `Boiled ${l.boiled} s · ${l.eth} min in ethanol · ${l.soft ? 'softened' : 'not softened'}${l.iodine ? ' · iodine added' : ''}.`,
      actions: [
        { key: 'boil', label: 'Boil it in water for 1 minute', blocked: firstBlock(need(ctx, 'bath'), !w.flame ? 'Light the Bunsen first.' : undefined), run: () => (a.boil(i), play('drip')) },
        { key: 'eth', label: 'Into a tube of ethanol in the hot water bath', tone: 'brand', blocked: firstBlock(need(ctx, 'tubes'), !w.hot ? 'Heat the water bath first.' : undefined), run: () => starchActs.ethanol(ctx, i) },
        { key: 'soft', label: 'Dip it in warm water to soften it', blocked: l.soft ? 'Done.' : undefined, run: () => (a.soften(i), play('drip')) },
        { key: 'tile', label: 'Spread it on the white tile', blocked: firstBlock(need(ctx, 'tile'), l.tile ? 'It is on the tile.' : undefined), run: () => (a.tile(i), play('tick'), l.soft ? undefined : notify('It was brittle: it cracked as you spread it. Soften leaves in warm water first.', 'warning', 3200)) },
        { key: 'iodine', label: 'Cover it with iodine solution', tone: 'brand', blocked: firstBlock(!l.tile ? 'Spread it on the tile first.' : undefined, l.iodine ? 'Done.' : undefined), run: () => (a.iodine(i), play('drip'), readNow()) },
        { key: 'grid', label: 'Lay it on the 1 cm² grid', blocked: firstBlock(need(ctx, 'grid'), !l.iodine ? 'Test it with iodine first.' : undefined), run: () => (a.grid(i), usePlantBench.setState({ tally: [] }), readNow()) },
        { key: 'look', label: 'Look closely', run: readNow },
        { key: 'notebook', label: 'Write it in my notebook', run: () => ctx.open('notebook') },
      ],
    };
  }
  if (id === 'iodine') return { title: 'Iodine solution', info: 'Yellow-brown; turns blue-black with starch.', actions: w.leaves.map((l, i): LabAction => ({ key: `i${i}`, label: `Cover leaf ${i + 1} with iodine`, tone: 'brand', blocked: !l.tile ? 'Spread it on the tile first.' : l.iodine ? 'Done.' : undefined, run: () => (a.iodine(i), usePlantBench.setState({ sel: i }), play('drip'), readNow()) })) };
  if (id === 'warm') return { title: 'Warm water', info: 'The leaf is brittle after the ethanol: a dip softens it so it spreads without cracking.', actions: w.leaves.map((l, i): LabAction => ({ key: `w${i}`, label: `Dip leaf ${i + 1} in warm water`, blocked: l.soft ? 'Done.' : undefined, run: () => (a.soften(i), usePlantBench.setState({ sel: i }), play('drip')) })) };
  if (id === 'tile' || id === 'grid') {
    const l = w.leaves[sel];
    return { title: id === 'tile' ? 'White tile' : '1 cm² grid paper', info: id === 'tile' ? 'Spread the softened leaf flat on it: the colours show against the white.' : 'Count the squares the leaf covers more than half of, and the blue-black ones.', actions: [{ key: 'look', label: 'Look closely', blocked: !l ? 'Pick a leaf first.' : undefined, run: readNow }] };
  }
  if (id === 'foil' || id === 'flask') return { title: id === 'foil' ? 'Aluminium foil' : 'Flask with potassium hydroxide', info: id === 'foil' ? 'A strip across both sides of a leaf keeps light out of that part.' : 'Potassium hydroxide absorbs carbon dioxide: the leaf inside has none.', actions: [] };
  if (id === 'forceps' || id === 'tubes') return { title: id === 'forceps' ? 'Forceps' : 'Boiling tubes', info: id === 'forceps' ? 'Handle the hot leaves with these.' : 'A tube of ethanol for each leaf, stood in the hot water.', actions: [] };
  return null;
}

// ------------------------------------------------------------------ all objects

export function plantObjectPanel(id: string, ctx: PlantCtx): ObjectPanel | null {
  const { p, s, scene } = ctx;
  const task = s.task ?? 'POTOMETER';
  if (id.startsWith('cup:')) {
    const a = id.slice(4) as PlantApparatusId;
    return { title: PLANT_APPARATUS_LABEL[a], info: 'In the apparatus cupboard.', actions: [{ key: 'take', label: 'Take to my bench', tone: 'brand', run: () => (p.note(`collect:${a}`), play('clink'), setView({ selected: null }), notify(`${PLANT_APPARATUS_LABEL[a]} is on your bench.`, 'success', 1500)) }] };
  }
  const room = bioRoomPanel(id, {
    coat: scene.coat,
    goggles: scene.goggles,
    note: p.note,
    open: ctx.open,
    benchInfo: task === 'OXYGEN' ? 'Bench 2: the pondweed, the sodium hydrogencarbonate, the task card and your notebook.' : task === 'STARCH' ? 'Bench 2: the two plants, the ethanol, the iodine, the task card and your notebook.' : 'Bench 2: the leafy shoot, the task card and your notebook.',
    whiteboard: task === 'OXYGEN' ? 'Today: light intensity and photosynthesis. Heat filter, and 5 minutes at each distance.' : task === 'STARCH' ? 'Today: testing a leaf for starch. Ethanol is flammable — flame OFF.' : 'Today: the potometer. Cut the shoot under water.',
  });
  if (id === 'goggles' && room) return { ...room, info: task === 'STARCH' ? 'Wear them: hot water and ethanol can splash.' : 'Wear them whenever liquids could splash.' };
  if (room) return room;
  const panel = task === 'POTOMETER' ? potoPanel(id, ctx) : task === 'OXYGEN' ? oxyPanel(id, ctx) : starchPanel(id, ctx);
  if (panel) return panel;
  switch (id) {
    case 'cupboard':
      return { title: 'Apparatus cupboard', info: 'Choose the apparatus you need.', actions: [{ key: 'list', label: 'Choose apparatus…', tone: 'brand', run: () => ctx.open('cupboard') }] };
    case 'card':
      return { title: 'Task card', actions: [{ key: 'read', label: 'Read the task card', tone: 'brand', run: () => ctx.open('task') }] };
    case 'book':
      return { title: 'Practical notebook', info: 'Your table, graph or drawing and your answers — this is what is marked.', actions: [{ key: 'open', label: 'Open the notebook', tone: 'brand', run: () => ctx.open('notebook') }] };
  }
  const extra = PLANT_APPARATUS.find((a) => a.id === id);
  if (extra) return { title: extra.label, info: extra.for.includes(task) ? undefined : 'Not needed for this practical.', actions: [{ key: 'return', label: 'Put back in the cupboard', run: () => (p.note(`return:${extra.id}`), setView({ selected: null })) }] };
  return null;
}

/** The hint for practice mode with guided mode off (the 2D lab's hint, plus the 3D set-up steps first). */
export function plantHint3d(ctx: PlantCtx, plain: string): string {
  const { scene, s } = ctx;
  const task = s.task ?? 'POTOMETER';
  if (!scene.coat) return 'Put on a lab coat: it hangs on the hooks by the door.';
  if (task === 'STARCH' && !scene.goggles) return 'Put on goggles: boiling water and ethanol can splash.';
  const missing = neededFor(task).filter((a) => !scene.collected.has(a.id));
  if (missing.length) return `Collect from the apparatus cupboard: ${missing.map((a) => lc(a.label)).join(', ')}.`;
  return plain;
}
export const POTO_COND_LIST = POTO_CONDS;
