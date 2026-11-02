import { GERM_DAYS_MAX, GERM_KIND_LABEL, GERM_TUBES, RESP_INDICATOR_LABEL, SEED_DAYS_MAX, SEED_REF_LABEL, TROP_CTRL_LABEL, TROP_DAYS_MAX, germKind, type BioGrowthState, type SeedKind } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { bioRoomPanel } from '../../bio-common/lab3d/common';
import type { Growth } from '../actions';
import { lastRespShown, lastSeedShown, lastTropShown } from '../readings';
import { useGrowthBench } from './bench';
import { GROWTH_APPARATUS, GROWTH_APPARATUS_LABEL, neededFor, type GrowthApparatusId, type GrowthScene } from './scene-state';

/**
 * What can be done with each object on the growth bench. Every action is a
 * button; a blocked one says why. Marked changes go through the shared
 * actions (the same as the 2D lab); the 3D-only steps (safety, apparatus,
 * hand washing) are log notes.
 */

export interface GrowthCtx {
  p: Growth;
  s: BioGrowthState;
  scene: GrowthScene;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}
const view = () => useLabView.getState();
const setView = (x: Parameters<ReturnType<typeof useLabView.getState>['set']>[0]) => view().set(x);
const need = (ctx: GrowthCtx, id: GrowthApparatusId) => (ctx.scene.collected.has(id) ? undefined : `Get the ${GROWTH_APPARATUS_LABEL[id].toLowerCase()} from the apparatus cupboard first.`);
const firstBlock = (...xs: (string | undefined | false)[]) => xs.find(Boolean) || undefined;
const lc = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
export const readNow = () => setView({ mode: 'read', selected: null });

// ------------------------------------------------------------------ germination

export const germActs = {
  wait(ctx: GrowthCtx) {
    if (!ctx.p.germ.wait()) return notify('Set up at least one tube with seeds first (or it is already day 7).', 'warning');
    play('tick');
    notify(`A day passes (time-lapse): day ${ctx.p.ref.current.germ.day}.`, 'info', 2200);
  },
  look(ctx: GrowthCtx) {
    if (!ctx.p.germ.look()) return notify(ctx.s.germ.day < 1 ? 'Leave the tubes at least a day first.' : 'You have already inspected them today.', 'warning');
    play('clink');
    readNow();
    notify('Count the seeds in each tube whose radicle shows — and write the counts in your notebook.', 'info', 3600);
  },
};
function germPanel(id: string, ctx: GrowthCtx): ObjectPanel | null {
  const { p, s } = ctx;
  const w = s.germ;
  const a = p.germ;
  const locked = w.day > 0 ? 'The tubes are set up: leave them alone now.' : undefined;
  if (id === 'seeds')
    return {
      title: 'Cowpea seeds',
      info: w.batch ? (w.batch === 'SORTED' ? 'Sorted: the same kind, size and age, no damaged ones.' : 'A mixed handful: sizes and ages vary, some damaged.') : 'Choose seeds of the same kind, size and age.',
      actions: [
        { key: 'sort', label: 'Sort them: same kind, size and age, undamaged', tone: 'brand', blocked: firstBlock(locked, w.batch === 'SORTED' && 'Sorted.'), run: () => (a.batch('SORTED'), play('tick')) },
        { key: 'mixed', label: 'Just take a mixed handful', blocked: firstBlock(locked, !!w.batch && 'Already chosen.'), run: () => (a.batch('MIXED'), play('tick')) },
      ],
    };
  if (id === 'rack') return { title: 'Test-tube rack', info: `Day ${w.day}. ${w.looks.includes(w.day) ? 'Inspected today.' : ''}`, actions: [{ key: 'look', label: 'Inspect the tubes and count', tone: 'brand', blocked: w.day < 1 ? 'Leave them at least a day first.' : w.looks.includes(w.day) ? 'Inspected today.' : undefined, run: () => germActs.look(ctx) }, { key: 'wait', label: 'Leave them 1 day (time-lapse)', blocked: w.day >= GERM_DAYS_MAX ? 'That is a week.' : undefined, run: () => germActs.wait(ctx) }, { key: 'closer', label: 'Look closely at the tubes', run: readNow }] };
  if (id === 'fridge') {
    return { title: 'Bench refrigerator (about 5 °C)', info: 'Low temperature: the control for warmth. Everything else as in tube A.', actions: w.tubes.map((x, j): LabAction => ({ key: `f${j}`, label: x.fridge ? `Take tube ${GERM_TUBES[j]} out` : `Put tube ${GERM_TUBES[j]} in the refrigerator`, tone: !x.fridge && j === 3 ? 'brand' : undefined, blocked: firstBlock(locked, need(ctx, 'rack')), run: () => (a.fridge(j, !x.fridge), useGrowthBench.setState({ tube: j }), play('clink')) })) };
  }
  if (id.startsWith('tube:')) {
    const k = Number(id.slice(5));
    const t = w.tubes[k];
    if (!t) return null;
    if (useGrowthBench.getState().tube !== k) queueMicrotask(() => useGrowthBench.setState({ tube: k }));
    const kind = germKind(t);
    return {
      title: `Tube ${GERM_TUBES[k]}`,
      info: kind === 'OTHER' ? (t.seeds || t.cotton || t.water ? 'Not a complete set-up yet.' : 'Empty.') : GERM_KIND_LABEL[kind],
      actions: [
        { key: 'moist', label: 'Moist cotton wool in the bottom', blocked: firstBlock(locked, need(ctx, 'cotton'), need(ctx, 'washbottle'), !!t.water && 'It has water in it.', t.cotton === 'MOIST' && 'Done.'), run: () => (a.cotton(k, 'MOIST'), play('drip')) },
        { key: 'dry', label: 'Dry cotton wool in the bottom', blocked: firstBlock(locked, need(ctx, 'cotton'), !!t.water && 'It has water in it.', t.cotton === 'DRY' && 'Done.'), run: () => (a.cotton(k, 'DRY'), play('tick')) },
        { key: 'boiled', label: 'Boiled, cooled water (seeds under it)', blocked: firstBlock(locked, need(ctx, 'boiled'), !!t.cotton && 'It has cotton wool in it.', !!t.water && 'Done.'), run: () => (a.water(k, 'BOILED'), play('drip')) },
        { key: 'tap', label: 'Tap water from the wash bottle (seeds under it)', blocked: firstBlock(locked, need(ctx, 'washbottle'), !!t.cotton && 'It has cotton wool in it.', !!t.water && 'Done.'), run: () => (a.water(k, 'TAP'), play('drip')) },
        { key: 'oil', label: 'Pour a layer of oil on the water', blocked: firstBlock(locked, need(ctx, 'oil'), !t.water && 'There is no water in it.', t.oil && 'Done.'), run: () => (a.oil(k), play('drip')) },
        { key: 'sow', label: 'Count in 10 seeds', tone: 'brand', blocked: firstBlock(locked, !w.batch && 'Choose the seeds first.', t.seeds > 0 && 'It has seeds.'), run: () => (a.sow(k), play('tick')) },
        { key: 'handful', label: 'Tip in a handful of seeds', blocked: firstBlock(locked, !w.batch && 'Choose the seeds first.', t.seeds > 0 && 'It has seeds.'), run: () => (a.sow(k, false), play('tick')) },
        { key: 'label', label: `Label it ${GERM_TUBES[k]}`, blocked: firstBlock(locked, need(ctx, 'labels'), t.label && 'Labelled.'), run: () => (a.label(k), play('tick')) },
        { key: 'fridge', label: t.fridge ? 'Take it out of the refrigerator' : 'Put it in the refrigerator', blocked: locked, run: () => (a.fridge(k, !t.fridge), play('clink')) },
        { key: 'empty', label: 'Empty it and start again', tone: 'danger', blocked: firstBlock(locked, !t.seeds && !t.cotton && !t.water && 'It is empty.'), run: () => a.empty(k) },
        { key: 'look', label: 'Look closely', run: readNow },
      ],
    };
  }
  if (id === 'cotton' || id === 'boiled' || id === 'oil' || id === 'labels' || id === 'washbottle')
    return {
      title: GROWTH_APPARATUS_LABEL[id],
      info: id === 'boiled' ? 'Boiling drives the dissolved oxygen out of the water.' : id === 'oil' ? 'A layer on the boiled water stops oxygen from the air dissolving back in.' : id === 'cotton' ? 'Moist or dry, it holds the seeds.' : id === 'labels' ? 'Label every tube before you leave them.' : 'For moistening the cotton wool.',
      actions: [{ key: 'tube', label: 'Use it on a tube (choose the tube)', run: () => notify('Tap a tube to choose what goes in it.', 'info', 2200) }],
    };
  return null;
}

// ------------------------------------------------------------------ seedlings

export const seedActs = {
  measure(ctx: GrowthCtx, kind: SeedKind) {
    const ref = useGrowthBench.getState().ref;
    const n = ctx.p.seedling.measure(kind, ref);
    if (n < 0) return notify(ctx.s.seedling.day < 1 ? 'Leave the seedlings at least a day first.' : 'Already measured today.', 'warning');
    play('tick');
    const r = lastSeedShown(ctx.p.v, ctx.p.ref.current);
    if (r) notify(`The ${kind === 'COWPEA' ? 'cowpea' : 'maize'} shoot measures ${r.mm} mm, ${lc(SEED_REF_LABEL[r.ref]).replace(/ \(.*\)/, '')}. Write it in your notebook.`, 'success', 4200);
  },
  wait(ctx: GrowthCtx) {
    if (!ctx.p.seedling.wait()) return notify('Sow the seeds first (or it is already day 10).', 'warning');
    play('tick');
    const w = ctx.p.ref.current.seedling;
    notify(`A day passes: day ${w.day}.${w.waters.includes(w.day - 1) ? '' : ' The medium is drying out — water it.'}`, 'info', 2400);
  },
};
function seedPanel(id: string, ctx: GrowthCtx): ObjectPanel | null {
  const { p, s } = ctx;
  const w = s.seedling;
  const a = p.seedling;
  const ref = useGrowthBench.getState().ref;
  const sown = w.box || w.jar;
  const dayActs = (): LabAction[] => [
    { key: 'water', label: 'Water the sawdust and the blotting paper', blocked: firstBlock(need(ctx, 'washbottle'), !sown && 'Sow the seeds first.', w.waters.includes(w.day) && 'Watered today.'), run: () => (a.water(), play('drip')) },
    { key: 'wait', label: 'Leave 1 day (time-lapse)', blocked: firstBlock(!sown && 'Sow the seeds first.', w.day >= SEED_DAYS_MAX && 'That is ten days.'), run: () => seedActs.wait(ctx) },
    { key: 'draw', label: 'Draw the seedlings now', blocked: firstBlock(w.day < 1 && 'Nothing to draw yet.', w.draws.includes(w.day) && 'Drawn today.'), run: () => (a.draw(), notify(`Drawing made at day ${w.day}. Label the day-7 drawing in your notebook.`, 'success', 2600)) },
  ];
  if (id === 'seeds')
    return { title: 'Cowpea and maize seeds', info: w.soaked ? 'Soaked overnight.' : 'Dry seeds.', actions: [{ key: 'soak', label: 'Soak them overnight', tone: 'brand', blocked: firstBlock(w.soaked && 'Soaked.', sown && 'Already sown.'), run: () => (a.soak(), play('drip')) }] };
  if (id === 'box')
    return { title: 'Box of moist sawdust', info: w.box ? `Day ${w.day}: look at what has come up.` : 'Sow the seeds about 2 cm deep.', actions: [{ key: 'sow', label: 'Sow cowpea and maize seeds in it', tone: 'brand', blocked: firstBlock(w.box && 'Sown.', w.day > 0 && 'Too late now.'), run: () => (a.sow('box'), play('tick')) }, ...dayActs(), { key: 'look', label: 'Look closely', run: () => (setView({ focus: 'box' }), readNow()) }] };
  if (id === 'jar' || id === 'ruler') {
    const measured = (k: SeedKind) => w.measures.some((m) => m.day === w.day && m.kind === k);
    return {
      title: id === 'jar' ? 'Seed jar' : '30 cm ruler',
      info: id === 'jar' ? 'The seedlings grow against the blotting paper, where you can see them.' : `Laid ${lc(SEED_REF_LABEL[ref])}.`,
      actions: [
        ...(id === 'jar' ? [{ key: 'sow', label: 'Place seeds between the blotting paper and the glass', tone: 'brand' as const, blocked: firstBlock(w.jar && 'Done.', w.day > 0 && 'Too late now.'), run: () => (a.sow('jar'), play('tick')) }] : []),
        { key: 'mc', label: 'Measure the cowpea shoot', tone: 'brand', blocked: firstBlock(need(ctx, 'ruler'), !w.jar && 'Set up the seed jar first.', w.day < 1 && 'Leave them a day first.', measured('COWPEA') && 'Measured today.'), run: () => seedActs.measure(ctx, 'COWPEA') },
        { key: 'mm', label: 'Measure the maize shoot', tone: 'brand', blocked: firstBlock(need(ctx, 'ruler'), !w.jar && 'Set up the seed jar first.', w.day < 1 && 'Leave them a day first.', measured('MAIZE') && 'Measured today.'), run: () => seedActs.measure(ctx, 'MAIZE') },
        { key: 'ref', label: ref === 'SEED' ? 'Measure from the top of the sawdust instead' : 'Measure from the seed instead', run: () => useGrowthBench.setState({ ref: ref === 'SEED' ? 'SOIL' : 'SEED' }) },
        ...dayActs(),
        { key: 'look', label: 'Look closely', run: () => (setView({ focus: 'jar' }), readNow()) },
      ],
    };
  }
  if (id === 'washbottle') return { title: 'Wash bottle of water', info: 'Keep the medium moist but not waterlogged.', actions: [dayActs()[0]!] };
  if (id === 'lens') return { title: 'Hand lens', info: 'For looking at the root hairs and the plumule.', actions: [{ key: 'look', label: 'Look closely', run: readNow }] };
  return null;
}

// ------------------------------------------------------------------ respiration

export const respActs = {
  read(ctx: GrowthCtx) {
    const n = ctx.p.resp.read();
    if (n < 0) return notify(ctx.s.resp.startAt === null ? 'Set up both flasks with seeds, a thermometer and a plug first.' : 'You have just read them.', 'warning');
    play('tick');
    const r = lastRespShown(ctx.p.v, ctx.p.ref.current);
    readNow();
    if (r) notify(`Flask A: ${r.a.toFixed(1)} °C; flask B: ${r.b.toFixed(1)} °C. Write them in your notebook.`, 'success', 4400);
  },
  wait(ctx: GrowthCtx, h: number) {
    if (!ctx.p.resp.wait(h)) return notify('Soak the seeds first.', 'warning');
    play('tick');
  },
};
function respPanel(id: string, ctx: GrowthCtx): ObjectPanel | null {
  const { p, s } = ctx;
  const w = s.resp;
  const a = p.resp;
  const locked = w.startAt !== null && w.clock > w.startAt ? 'The flasks are running: leave them alone.' : undefined;
  const timeActs: LabAction[] = [
    { key: 'read', label: 'Read both thermometers', tone: 'brand', blocked: firstBlock(w.startAt === null && 'Set up both flasks first.', w.reads.includes(w.clock) && 'Read just now.'), run: () => respActs.read(ctx) },
    { key: 'w24', label: 'Leave 1 day (time-lapse)', blocked: !w.soaked ? 'Soak the seeds first.' : undefined, run: () => respActs.wait(ctx, 24) },
    { key: 'w1', label: 'Wait 1 hour', blocked: !w.soaked ? 'Soak the seeds first.' : undefined, run: () => respActs.wait(ctx, 1) },
  ];
  if (id === 'seeds')
    return {
      title: 'Cowpea seeds',
      info: w.soaked ? `Soaked and germinating${w.disLive ? '; rinsed in disinfectant' : ''}.` : 'Dry seeds.',
      actions: [
        { key: 'soak', label: 'Soak them for 24 hours (they start to germinate)', tone: 'brand', blocked: w.soaked ? 'Soaked.' : undefined, run: () => (a.soak(), play('drip')) },
        { key: 'dis', label: 'Rinse the germinating seeds in disinfectant', blocked: firstBlock(locked, need(ctx, 'disinfectant'), !w.soaked && 'Soak them first.', w.disLive && 'Done.', !!w.A.seeds && 'They are in the flask.'), run: () => (a.disinfect('LIVE'), play('drip')) },
      ],
    };
  if (id === 'boiler')
    return {
      title: 'Beaker of water on the tripod',
      info: w.boiled ? 'Half the seeds were boiled for 10 minutes and cooled: they are dead.' : 'Boil half the seeds here for 10 minutes.',
      actions: [
        { key: 'boil', label: 'Boil half the seeds for 10 minutes, then cool them', tone: 'brand', blocked: firstBlock(!w.soaked && 'Soak the seeds first.', w.boiled && 'Done.'), run: () => (a.boil(), play('drip')) },
        { key: 'dis', label: 'Rinse the boiled seeds in disinfectant', blocked: firstBlock(locked, need(ctx, 'disinfectant'), !w.boiled && 'Boil them first.', w.disBoiled && 'Done.', !!w.B.seeds && 'They are in the flask.'), run: () => (a.disinfect('BOILED'), play('drip')) },
      ],
    };
  if (id === 'disinfectant')
    return {
      title: 'Dilute disinfectant',
      info: 'It kills the microorganisms on the seeds, which would also respire and give off heat.',
      actions: [
        { key: 'l', label: 'Rinse the germinating seeds', blocked: firstBlock(locked, !w.soaked && 'Soak the seeds first.', w.disLive && 'Done.', !!w.A.seeds && 'They are in the flask.'), run: () => (a.disinfect('LIVE'), play('drip')) },
        { key: 'b', label: 'Rinse the boiled seeds', blocked: firstBlock(locked, !w.boiled && 'Boil half the seeds first.', w.disBoiled && 'Done.', !!w.B.seeds && 'They are in the flask.'), run: () => (a.disinfect('BOILED'), play('drip')) },
      ],
    };
  if (id.startsWith('flask:')) {
    const f = id.slice(6) as 'A' | 'B';
    const fl = w[f];
    return {
      title: `Vacuum flask ${f}`,
      info: fl.seeds ? `${fl.seeds === 'LIVE' ? 'Germinating' : 'Boiled'} seeds (${fl.fill === 'HALF' ? 'half full' : 'full'})${fl.thermo ? ', thermometer in' : ''}${fl.plug ? `, ${fl.plug === 'COTTON' ? 'cotton-wool plug' : 'rubber bung'}` : ''}${fl.inverted ? ', inverted' : ''}.` : 'Empty.',
      actions: [
        { key: 'live', label: 'Fill it with germinating seeds', tone: f === 'A' ? 'brand' : undefined, blocked: firstBlock(locked, !w.soaked && 'Soak the seeds first.', !!fl.seeds && 'It is full.'), run: () => (a.fill(f, 'LIVE', 'FULL'), play('tick')) },
        { key: 'boiled', label: 'Fill it with the boiled seeds', tone: f === 'B' ? 'brand' : undefined, blocked: firstBlock(locked, !w.boiled && 'Boil half the seeds first.', !!fl.seeds && 'It is full.'), run: () => (a.fill(f, 'BOILED', 'FULL'), play('tick')) },
        { key: 'half', label: `Only half fill it (${f === 'A' ? 'germinating' : 'boiled'} seeds)`, blocked: firstBlock(locked, !w.soaked && 'Soak the seeds first.', f === 'B' && !w.boiled && 'Boil half the seeds first.', !!fl.seeds && 'It is full.'), run: () => (a.fill(f, f === 'A' ? 'LIVE' : 'BOILED', 'HALF'), play('tick')) },
        { key: 'thermo', label: 'Push a thermometer in among the seeds', blocked: firstBlock(locked, need(ctx, 'thermometers'), !fl.seeds && 'Fill it first.', fl.thermo && 'Done.'), run: () => (a.thermo(f), play('clink')) },
        { key: 'cotton', label: 'Plug it loosely with cotton wool', tone: 'brand', blocked: firstBlock(locked, need(ctx, 'cotton'), !fl.thermo && 'Thermometer first.', !!fl.plug && 'Plugged.'), run: () => (a.plug(f, 'COTTON'), play('tick')) },
        { key: 'bung', label: 'Seal it airtight with a rubber bung', blocked: firstBlock(locked, !fl.thermo && 'Thermometer first.', !!fl.plug && 'Plugged.'), run: () => (a.plug(f, 'BUNG'), play('tick')) },
        { key: 'invert', label: 'Invert it in the clamp', blocked: firstBlock(locked, !fl.plug && 'Plug it first.', fl.inverted && 'Inverted.'), run: () => (a.invert(f), play('clink')) },
        ...timeActs,
        { key: 'look', label: 'Read the thermometers closely', run: readNow },
      ],
    };
  }
  if (id === 'co2' || id === 'limewater' || id === 'conical')
    return {
      title: 'CO₂ test',
      info: w.co2.ind ? `${RESP_INDICATOR_LABEL[w.co2.ind]}, set up ${Math.round(w.clock - (w.co2.at ?? 0))} h ago${w.co2.ctrl ? ', with a boiled-seed control' : ''}.` : 'Germinating seeds in the conical flask; the delivery tube dips into the test tube.',
      actions: [
        { key: 'lime', label: 'Germinating seeds → lime water', tone: 'brand', blocked: firstBlock(need(ctx, 'conical'), need(ctx, 'limewater'), !w.soaked && 'Soak the seeds first.', w.co2.at !== null && 'Set up.'), run: () => (a.co2('LIME'), play('clink')) },
        { key: 'bicarb', label: 'Germinating seeds → hydrogencarbonate indicator', blocked: firstBlock(need(ctx, 'conical'), need(ctx, 'limewater'), !w.soaked && 'Soak the seeds first.', w.co2.at !== null && 'Set up.'), run: () => (a.co2('BICARB'), play('clink')) },
        { key: 'ctrl', label: 'A control: boiled seeds → the same', blocked: firstBlock(w.co2.at === null && 'Set up the test first.', !w.boiled && 'Boil half the seeds first.', w.co2.ctrl && 'Done.'), run: () => (a.co2Ctrl(), play('clink')) },
        { key: 'look', label: 'Look at the tubes', blocked: w.co2.at === null ? 'Set up the test first.' : undefined, run: () => (a.co2Look(), setView({ focus: 'co2' }), readNow()) },
        timeActs[2]!,
      ],
    };
  if (id === 'cotton' || id === 'thermometers') return { title: GROWTH_APPARATUS_LABEL[id], info: id === 'cotton' ? 'A loose plug lets air in and the CO₂ out.' : 'One for each flask; read to 0.5 °C at eye level.', actions: [] };
  return null;
}

// ------------------------------------------------------------------ tropisms

export const tropActs = {
  measure(ctx: GrowthCtx, pot: 'TEST' | 'CTRL') {
    const n = ctx.p.trop.measure(pot);
    if (n < 0) return notify(ctx.s.trop.day < 1 ? 'Leave them at least a day first.' : 'Already measured today.', 'warning');
    play('tick');
    const r = lastTropShown(ctx.p.v, ctx.p.ref.current);
    if (r) notify(`The ${pot === 'TEST' ? 'test' : 'control'} shoot is bent ${r.deg}° from the vertical. Write it in your notebook.`, 'success', 4200);
  },
  wait(ctx: GrowthCtx) {
    if (!ctx.p.trop.wait()) return notify('Set up the experiments first (or it is already day 5).', 'warning');
    play('tick');
    notify(`A day passes: day ${ctx.p.ref.current.trop.day}. Keep the seedlings moist.`, 'info', 2400);
  },
  count(ctx: GrowthCtx) {
    if (!ctx.p.trop.count()) return notify('Pin the seedlings and leave them at least a day.', 'warning');
    play('clink');
    useLabView.getState().set({ mode: 'bench', focus: 'cork' });
    readNow();
    notify('Count the radicles on the cork that are growing downwards, and write the number in your notebook.', 'info', 3600);
  },
};
function tropPanel(id: string, ctx: GrowthCtx): ObjectPanel | null {
  const { p, s } = ctx;
  const w = s.trop;
  const a = p.trop;
  const locked = w.day > 0 ? 'Set up before you leave them: it is too late now.' : undefined;
  const dayActs: LabAction[] = [
    { key: 'wait', label: 'Leave 1 day (time-lapse)', blocked: firstBlock(!w.box && !w.pinned && 'Set up first.', w.day >= TROP_DAYS_MAX && 'That is five days.'), run: () => tropActs.wait(ctx) },
    { key: 'water', label: 'Water the seedlings', blocked: firstBlock(need(ctx, 'washbottle'), !w.box && !w.pinned && 'Set up first.', w.waters.includes(w.day) && 'Watered today.'), run: () => (a.water(), play('drip')) },
  ];
  if (id === 'pots' || id === 'lightbox' || id === 'ctrlpot')
    return {
      title: id === 'lightbox' ? 'Light-proof box' : 'Pots of maize seedlings',
      info: w.box ? `Day ${w.day}. Slit ${w.slit === 'LAMP' ? 'towards the lamp' : w.slit === 'AWAY' ? 'away from the lamp' : 'not set'}; ${w.taped ? 'gaps taped' : 'gaps not taped'}.` : 'One pot goes in the box (test); the other is the control.',
      actions: [
        { key: 'box', label: 'Put one pot in the box', tone: 'brand', blocked: firstBlock(locked, need(ctx, 'lightbox'), w.box && 'Done.'), run: () => (a.box(), play('clink')) },
        { key: 'lamp', label: 'Turn the box: slit towards the lamp', blocked: firstBlock(locked, !w.box && 'Put a pot in first.', w.slit === 'LAMP' && 'Done.'), run: () => (a.slit('LAMP'), play('tick')) },
        { key: 'away', label: 'Turn the box: slit away from the lamp', blocked: firstBlock(locked, !w.box && 'Put a pot in first.', w.slit === 'AWAY' && 'Done.'), run: () => (a.slit('AWAY'), play('tick')) },
        { key: 'tape', label: 'Tape over the gaps (light-proof)', blocked: firstBlock(locked, need(ctx, 'tape'), !w.box && 'Put a pot in first.', w.taped && 'Done.'), run: () => (a.tape(), play('tick')) },
        { key: 'klino', label: 'Control pot: on the clinostat', blocked: firstBlock(locked, need(ctx, 'klinostat'), w.ctrl === 'KLINO' && 'Done.'), run: () => (a.ctrl('KLINO'), play('clink')) },
        { key: 'uniform', label: `Control pot: ${TROP_CTRL_LABEL.UNIFORM.toLowerCase()}`, blocked: firstBlock(locked, w.ctrl === 'UNIFORM' && 'Done.'), run: () => (a.ctrl('UNIFORM'), play('clink')) },
        { key: 'mt', label: 'Protractor: the test shoot', tone: 'brand', blocked: firstBlock(need(ctx, 'protractor'), !w.box && 'No test pot.', w.day < 1 && 'Leave them a day first.', w.measures.some((m) => m.day === w.day && m.pot === 'TEST') && 'Measured today.'), run: () => tropActs.measure(ctx, 'TEST') },
        { key: 'mc', label: 'Protractor: the control shoot', tone: 'brand', blocked: firstBlock(need(ctx, 'protractor'), !w.ctrl && 'No control pot.', w.day < 1 && 'Leave them a day first.', w.measures.some((m) => m.day === w.day && m.pot === 'CTRL') && 'Measured today.'), run: () => tropActs.measure(ctx, 'CTRL') },
        ...dayActs,
        { key: 'look', label: 'Look closely', run: readNow },
      ],
    };
  if (id === 'lamp') return { title: 'Bench lamp', info: 'One-sided light through the slit.', actions: [{ key: 'on', label: w.lamp ? 'Switch it off' : 'Switch it on', tone: w.lamp ? undefined : 'brand', blocked: locked, run: () => (a.lamp(!w.lamp), play('tick')) }] };
  if (id === 'klinostat')
    return {
      title: 'Clinostat',
      info: 'Turning slowly, it gives every side of the seedlings the same light and the same pull of gravity.',
      actions: [
        { key: 'pot', label: 'Control pot on its turntable', blocked: firstBlock(locked, w.ctrl === 'KLINO' && 'Done.'), run: () => (a.ctrl('KLINO'), play('clink')) },
        { key: 'set', label: 'Fix a similar set of seedlings on its spindle', blocked: firstBlock(locked, need(ctx, 'corkjar'), w.klinoSet && 'Done.'), run: () => (a.klinoSet(), play('clink')) },
        { key: 'on', label: w.klinoOn ? 'Switch it off' : 'Switch it on', tone: w.klinoOn ? undefined : 'brand', blocked: locked, run: () => (a.klino(!w.klinoOn), play('tick')) },
        ...dayActs,
        { key: 'look', label: 'Look closely', run: () => (setView({ focus: 'klino' }), readNow()) },
      ],
    };
  if (id === 'corkjar')
    return {
      title: 'Cork in a gas jar',
      info: w.pinned ? `Day ${w.day}. ${w.moist ? 'Cotton wool moist.' : 'Cotton wool dry!'}` : 'Pin the soaked seedlings round it, radicles in different directions.',
      actions: [
        { key: 'pin', label: 'Pin 10 seedlings round the cork (radicles every way)', tone: 'brand', blocked: firstBlock(locked, w.pinned && 'Done.'), run: () => (a.pin(), play('tick')) },
        { key: 'wet', label: 'Wet the cotton wool in the jar', blocked: firstBlock(locked, need(ctx, 'washbottle'), w.moist && 'Done.'), run: () => (a.moisten(), play('drip')) },
        { key: 'count', label: 'Count the radicles growing down', blocked: firstBlock(!w.pinned && 'Pin the seedlings first.', w.day < 1 && 'Leave them a day first.'), run: () => tropActs.count(ctx) },
        ...dayActs,
        { key: 'look', label: 'Look closely', run: () => (setView({ focus: 'cork' }), readNow()) },
      ],
    };
  if (id === 'protractor' || id === 'tape' || id === 'washbottle') return { title: GROWTH_APPARATUS_LABEL[id], info: id === 'protractor' ? 'Measure the angle between the shoot tip and the vertical.' : id === 'tape' ? 'Black tape seals gaps in the box.' : 'Keep the seedlings moist every day.', actions: id === 'washbottle' ? [dayActs[1]!] : [] };
  return null;
}

// ------------------------------------------------------------------ all objects

export function growthObjectPanel(id: string, ctx: GrowthCtx): ObjectPanel | null {
  const { p, s, scene } = ctx;
  const task = s.task ?? 'GERM';
  if (id.startsWith('cup:')) {
    const a = id.slice(4) as GrowthApparatusId;
    return { title: GROWTH_APPARATUS_LABEL[a], info: 'In the apparatus cupboard.', actions: [{ key: 'take', label: 'Take to my bench', tone: 'brand', run: () => (p.note(`collect:${a}`), play('clink'), setView({ selected: null }), notify(`${GROWTH_APPARATUS_LABEL[a]} is on your bench.`, 'success', 1500)) }] };
  }
  const room = bioRoomPanel(id, {
    coat: scene.coat,
    goggles: scene.goggles,
    note: p.note,
    open: ctx.open,
    benchInfo: task === 'SEEDLING' ? 'Bench 2: the seeds, the task card and your notebook.' : task === 'RESP' ? 'Bench 2: the seeds, the task card and your notebook.' : task === 'TROPISM' ? 'Bench 2: the pots of seedlings, the task card and your notebook.' : 'Bench 2: the seeds, the bench refrigerator, the task card and your notebook.',
    whiteboard: task === 'SEEDLING' ? 'Today: epigeal and hypogeal germination. Measure from the same point every day.' : task === 'RESP' ? 'Today: respiration in germinating seeds. Disinfect both batches.' : task === 'TROPISM' ? 'Today: tropisms. The clinostat is the control.' : 'Today: conditions for germination. Count only seeds with a radicle.',
  });
  if (id === 'goggles' && room) return { ...room, info: task === 'RESP' ? 'Wear them: boiling water and disinfectant can splash.' : 'Wear them whenever liquids could splash.' };
  if (room) return room;
  const panel = task === 'GERM' ? germPanel(id, ctx) : task === 'SEEDLING' ? seedPanel(id, ctx) : task === 'RESP' ? respPanel(id, ctx) : tropPanel(id, ctx);
  if (panel) return panel;
  switch (id) {
    case 'cupboard':
      return { title: 'Apparatus cupboard', info: 'Choose the apparatus you need.', actions: [{ key: 'list', label: 'Choose apparatus…', tone: 'brand', run: () => ctx.open('cupboard') }] };
    case 'card':
      return { title: 'Task card', actions: [{ key: 'read', label: 'Read the task card', tone: 'brand', run: () => ctx.open('task') }] };
    case 'book':
      return { title: 'Practical notebook', info: 'Your tables, graph or drawing and your answers — this is what is marked.', actions: [{ key: 'open', label: 'Open the notebook', tone: 'brand', run: () => ctx.open('notebook') }] };
  }
  const extra = GROWTH_APPARATUS.find((a) => a.id === id);
  if (extra) return { title: extra.label, info: extra.for.includes(task) ? undefined : 'Not needed for this practical.', actions: [{ key: 'return', label: 'Put back in the cupboard', run: () => (p.note(`return:${extra.id}`), setView({ selected: null })) }] };
  return null;
}

/** The hint for practice mode with guided mode off (the 2D lab's hint, plus the 3D set-up steps first). */
export function growthHint3d(ctx: GrowthCtx, plain: string): string {
  const { scene, s } = ctx;
  const task = s.task ?? 'GERM';
  if (!scene.coat) return 'Put on a lab coat: it hangs on the hooks by the door.';
  if (task === 'RESP' && !scene.goggles) return 'Put on goggles: boiling water and disinfectant can splash.';
  const missing = neededFor(task).filter((a) => !scene.collected.has(a.id));
  if (missing.length) return `Collect from the apparatus cupboard: ${missing.map((a) => lc(a.label)).join(', ')}.`;
  return plain;
}
