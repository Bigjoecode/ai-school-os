import { AIR_MIN, EOSIN_CLOCK_MAX, EOSIN_PLACE_LABEL, INC_TEMPS, MICRO_DAYS_MAX, PLATE_LABEL, PLATES, RAT_HOW_LABEL, SLICES, type BioDissectionState, type RatPart } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { bioRoomPanel, washHands } from '../../bio-common/lab3d/common';
import type { Dissect } from '../actions';
import { lastEosinShown, lastRatShown } from '../readings';
import { useDissectBench } from './bench';
import { DISSECT_APPARATUS, DISSECT_APPARATUS_LABEL, neededFor, type DissectApparatusId, type DissectScene } from './scene-state';

/**
 * What can be done with each object on the dissection bench. Every action is
 * a button; a blocked one says why. Marked changes go through the shared
 * actions (the same as the 2D lab); the 3D-only steps (safety, apparatus,
 * hand washing) are log notes.
 */

export interface DissectCtx {
  p: Dissect;
  s: BioDissectionState;
  scene: DissectScene;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}
const view = () => useLabView.getState();
const setView = (x: Parameters<ReturnType<typeof useLabView.getState>['set']>[0]) => view().set(x);
const need = (ctx: DissectCtx, id: DissectApparatusId) => (ctx.scene.collected.has(id) ? undefined : `Get the ${DISSECT_APPARATUS_LABEL[id].toLowerCase()} from the apparatus cupboard first.`);
const firstBlock = (...xs: (string | undefined | false)[]) => xs.find(Boolean) || undefined;
export const readNow = () => setView({ mode: 'read', selected: null });
const PART: Record<RatPart, string> = { BODY: 'body (snout to anus)', SI: 'small intestine', LI: 'large intestine' };

// ------------------------------------------------------------------ eosin

export const eosinActs = {
  read(ctx: DissectCtx) {
    if (!ctx.p.eosin.read()) return notify(ctx.s.eosin.sections.length ? 'The stem has been cut: no more readings.' : ctx.s.eosin.clock < 1 ? 'Leave it a while first.' : 'Already read at this time.', 'warning');
    play('tick');
    const r = lastEosinShown(ctx.p.v, ctx.p.ref.current);
    if (r) notify(`${r.at} min: the red line reaches ${r.cm.toFixed(1)} cm above the dye. Write it in your notebook.`, 'success', 4200);
    readNow();
  },
  wait(ctx: DissectCtx, min: number) {
    if (!ctx.p.eosin.wait(min)) return notify(ctx.s.eosin.sections.length ? 'The stem has been cut: the experiment is over.' : !ctx.s.eosin.dye ? 'Stand the plant in the eosin first.' : 'That is three hours.', 'warning');
    play('tick');
    notify(`${min} minutes pass (time-lapse): ${ctx.p.ref.current.eosin.clock} min.`, 'info', 2000);
  },
  cut(ctx: DissectCtx, kind: 'TS' | 'LS', thin = true, tile = true) {
    const at = useDissectBench.getState().cutAt;
    const first = !ctx.s.eosin.sections.length;
    const n = ctx.p.eosin.cut(kind, at, thin, tile);
    if (n < 0) return notify(!ctx.s.eosin.dye ? 'Stand the plant in the eosin first.' : 'Leave the dye to rise first.', 'warning');
    play('clink');
    notify(`${kind === 'TS' ? 'Transverse' : 'Longitudinal'} section ${n + 1} cut at ${at} cm${first ? ' — the experiment is over now the stem is cut' : ''}. Examine it with the lens or the microscope.`, 'success', 3600);
  },
  look(ctx: DissectCtx, n: number, tool: 'LENS' | 'MICRO') {
    ctx.p.eosin.view(n, tool);
    useDissectBench.setState({ look: { n, tool } });
    play('tick');
    readNow();
  },
};
function eosinPanel(id: string, ctx: DissectCtx): ObjectPanel | null {
  const { p, s } = ctx;
  const w = s.eosin;
  const a = p.eosin;
  const cut = w.sections.length > 0;
  const cutAt = useDissectBench.getState().cutAt;
  const timeActs: LabAction[] = [
    { key: 'w10', label: 'Wait 10 minutes (time-lapse)', blocked: firstBlock(!w.dye && 'Stand it in the eosin first.', cut && 'The stem has been cut.', w.clock >= EOSIN_CLOCK_MAX && 'That is three hours.'), run: () => eosinActs.wait(ctx, 10) },
    { key: 'w20', label: 'Wait 20 minutes', blocked: firstBlock(!w.dye && 'Stand it in the eosin first.', cut && 'The stem has been cut.', w.clock >= EOSIN_CLOCK_MAX && 'That is three hours.'), run: () => eosinActs.wait(ctx, 20) },
  ];
  const readAct: LabAction = { key: 'read', label: 'Read the height of the red line', tone: 'brand', blocked: firstBlock(need(ctx, 'ruler'), !w.dye && 'Stand it in the eosin first.', cut && 'The stem has been cut.', w.clock < 1 && 'Leave it a while first.', w.reads.includes(w.clock) && 'Already read now.'), run: () => eosinActs.read(ctx) };
  const cutActs: LabAction[] = [
    { key: 'down', label: `Lower: cut at ${Math.max(1, cutAt - 1)} cm`, run: () => useDissectBench.setState({ cutAt: Math.max(1, cutAt - 1) }) },
    { key: 'up', label: `Higher: cut at ${Math.min(Math.floor(p.v.eosin.stemH) - 1, cutAt + 1)} cm`, run: () => useDissectBench.setState({ cutAt: Math.min(Math.floor(p.v.eosin.stemH) - 1, cutAt + 1) }) },
    { key: 'ts', label: `Thin transverse section at ${cutAt} cm, on the tile`, tone: 'brand', blocked: firstBlock(need(ctx, 'razor'), need(ctx, 'tile'), !w.dye && 'Stand it in the eosin first.', w.clock < 1 && 'Leave the dye to rise first.'), run: () => eosinActs.cut(ctx, 'TS') },
    { key: 'ls', label: `Thin longitudinal section at ${cutAt} cm, on the tile`, blocked: firstBlock(need(ctx, 'razor'), need(ctx, 'tile'), !w.dye && 'Stand it in the eosin first.', w.clock < 1 && 'Leave the dye to rise first.'), run: () => eosinActs.cut(ctx, 'LS') },
    { key: 'thick', label: 'Cut a thick slice', blocked: firstBlock(need(ctx, 'razor'), !w.dye && 'Stand it in the eosin first.'), run: () => eosinActs.cut(ctx, 'TS', false) },
    { key: 'hand', label: 'Hold the stem and slice towards the thumb', tone: 'danger', blocked: firstBlock(need(ctx, 'razor'), !w.dye && 'Stand it in the eosin first.'), run: () => eosinActs.cut(ctx, 'TS', true, false) },
  ];
  const sections = (tool: 'LENS' | 'MICRO'): LabAction[] => w.sections.map((x, n) => ({ key: `v${n}`, label: `Section ${n + 1} (${x.kind} at ${x.at} cm)`, tone: w.views.some((y) => y.n === n && y.tool === tool) ? undefined : 'brand', run: () => eosinActs.look(ctx, n, tool) }));
  if (id === 'plant' || id === 'pot')
    return {
      title: 'Young balsam plant',
      info: w.dye ? `${w.clock} min in the eosin${w.place ? `, ${EOSIN_PLACE_LABEL[w.place].toLowerCase()}` : ''}.` : w.wash ? 'Roots washed free of soil.' : 'In a pot of soil. Its stem is translucent, so a red line will show.',
      actions: [
        { key: 'wash', label: 'Wash the roots gently in the bowl of water', tone: 'brand', blocked: firstBlock(need(ctx, 'bowl'), !!w.wash && 'Done.'), run: () => (a.wash('GENTLE'), play('drip')) },
        { key: 'rough', label: 'Rinse the roots hard under the tap', blocked: firstBlock(!!w.wash && 'Done.'), run: () => (a.wash('ROUGH'), play('drip')) },
        { key: 'dye', label: 'Stand the roots in the eosin', tone: 'brand', blocked: firstBlock(need(ctx, 'eosin'), !w.wash && 'Wash the soil off the roots first.', w.dye && 'Done.'), run: () => (a.dye(), play('drip')) },
        ...(['BRIGHT', 'DARK'] as const).map((pl): LabAction => ({ key: pl, label: `Leave it in ${EOSIN_PLACE_LABEL[pl].charAt(0).toLowerCase()}${EOSIN_PLACE_LABEL[pl].slice(1)}`, tone: pl === 'BRIGHT' && !w.place ? 'brand' : undefined, blocked: firstBlock(w.clock > 0 && 'It has been left already.', w.place === pl && 'It is there.'), run: () => (a.place(pl), play('tick')) })),
        readAct,
        ...timeActs,
        { key: 'leaves', label: 'Look at the leaf veins', blocked: !w.dye ? 'Stand it in the eosin first.' : undefined, run: () => (a.leaves(), notify('Look at the veins of the lowest leaves — are they red yet? Record it in your notebook.', 'info', 3200), readNow()) },
        { key: 'closer', label: 'Look closely', run: readNow },
      ],
    };
  if (id === 'eosin' || id === 'bowl') return { title: DISSECT_APPARATUS_LABEL[id], info: id === 'eosin' ? 'Red dye in water: it shows where the water goes. It stains skin and clothes.' : 'Wash the roots gently so the root hairs are not torn.', actions: id === 'eosin' ? [{ key: 'dye', label: 'Stand the plant in it', tone: 'brand', blocked: firstBlock(!w.wash && 'Wash the soil off the roots first.', w.dye && 'Done.'), run: () => (a.dye(), play('drip')) }] : [{ key: 'wash', label: 'Wash the roots gently', tone: 'brand', blocked: w.wash ? 'Done.' : undefined, run: () => (a.wash('GENTLE'), play('drip')) }] };
  if (id === 'ruler') return { title: '30 cm ruler', info: 'Zero at the surface of the dye. Read the top of the red line to 0.1 cm.', actions: [readAct] };
  if (id === 'stopwatch') return { title: 'Stopwatch', info: `${w.clock} min since the plant went into the eosin.`, actions: timeActs };
  if (id === 'razor' || id === 'tile') return { title: id === 'razor' ? 'Razor blade' : 'White tile', info: 'Cut thin slices on the tile, away from your fingers. Cutting ends the experiment: take your readings first.', actions: cutActs };
  if (id === 'lens') return { title: 'Hand lens', info: w.sections.length ? 'Which section?' : 'Cut a section first.', actions: sections('LENS') };
  if (id === 'microscope') return { title: 'Microscope (low power)', info: w.sections.length ? 'Which section goes on the slide?' : 'Cut a section first.', actions: sections('MICRO') };
  return null;
}

// ------------------------------------------------------------------ rat

export const ratActs = {
  measure(ctx: DissectCtx, what: RatPart) {
    const how = useDissectBench.getState().how;
    const n = ctx.p.rat.measure(what, how);
    if (n < 0) return notify(what === 'BODY' ? 'Pin the rat out first.' : 'Unravel the gut with the seeker first.', 'warning');
    play('tick');
    const r = lastRatShown(ctx.p.v, ctx.p.ref.current);
    if (r) notify(`The ${PART[what]} measures ${r.cm.toFixed(1)} cm. Write it in your notebook.`, 'success', 4200);
  },
};
function ratPanel(id: string, ctx: DissectCtx): ObjectPanel | null {
  const { p, s } = ctx;
  const w = s.rat;
  const a = p.rat;
  const how = useDissectBench.getState().how;
  const kit = need(ctx, 'kit');
  const measureActs: LabAction[] = [
    { key: 'mb', label: 'Measure the body, snout to anus', blocked: firstBlock(need(ctx, 'ruler'), !w.pinned && 'Pin it out first.'), run: () => ratActs.measure(ctx, 'BODY') },
    { key: 'msi', label: 'Measure the small intestine', tone: 'brand', blocked: firstBlock(need(ctx, 'ruler'), how === 'THREAD' && need(ctx, 'thread'), !w.unravelled && 'Unravel the gut first.'), run: () => ratActs.measure(ctx, 'SI') },
    { key: 'mli', label: 'Measure the large intestine', tone: 'brand', blocked: firstBlock(need(ctx, 'ruler'), how === 'THREAD' && need(ctx, 'thread'), !w.unravelled && 'Unravel the gut first.'), run: () => ratActs.measure(ctx, 'LI') },
    { key: 'how', label: how === 'THREAD' ? `Instead: ${RAT_HOW_LABEL.STRETCH.toLowerCase()}` : `Instead: ${RAT_HOW_LABEL.THREAD.toLowerCase()}`, run: () => useDissectBench.setState({ how: how === 'THREAD' ? 'STRETCH' : 'THREAD' }) },
  ];
  if (id === 'rat')
    return {
      title: 'The rat',
      info: !w.pinned ? 'Killed humanely by the teacher. Treat it with respect.' : !w.skin ? 'Pinned out. Measure it, then open the skin.' : !w.wall ? 'Skin open. Now the body wall.' : !w.display ? 'Organs exposed. Keep them moist.' : 'Gut displayed.',
      actions: [
        { key: 'pin', label: 'Pin it on its back by the four limbs', tone: 'brand', blocked: w.pinned ? 'Pinned.' : undefined, run: () => (a.pin('VENTRAL'), play('tick')) },
        { key: 'pind', label: 'Pin it belly down', blocked: w.pinned ? 'Pinned.' : undefined, run: () => (a.pin('DORSAL'), play('tick')) },
        { key: 'unpin', label: 'Unpin it', blocked: firstBlock(!w.pinned && 'Not pinned.', !!w.skin && 'It is already cut.'), run: () => a.unpin() },
        measureActs[0]!,
        { key: 'skin', label: 'Lift the skin with forceps; cut up the midline', tone: 'brand', blocked: firstBlock(kit, w.pinned !== 'VENTRAL' && 'Pin it ventral side up first.', !!w.skin && 'Done.'), run: () => (a.skin('LIFTED'), play('tick')) },
        { key: 'skindeep', label: 'Push the scissors straight in and cut', tone: 'danger', blocked: firstBlock(kit, w.pinned !== 'VENTRAL' && 'Pin it ventral side up first.', !!w.skin && 'Done.'), run: () => (a.skin('DEEP'), play('tick')) },
        { key: 'pinskin', label: 'Cut sideways at each end; pin the skin back', blocked: firstBlock(!w.skin && 'Cut the skin first.', w.skinPinned && 'Done.'), run: () => (a.pinSkin(), play('tick')) },
        { key: 'wall', label: 'Lift the body wall; cut it the same way', tone: 'brand', blocked: firstBlock(kit, !w.skinPinned && 'Pin the skin back first.', !!w.wall && 'Done.'), run: () => (a.wall('LIFTED'), play('tick')) },
        { key: 'walldeep', label: 'Cut deep through the wall', tone: 'danger', blocked: firstBlock(kit, !w.skinPinned && 'Pin the skin back first.', !!w.wall && 'Done.'), run: () => (a.wall('DEEP'), play('tick')) },
        { key: 'ribs', label: 'Cut the ribs either side of the sternum', blocked: firstBlock(kit, !w.wall && 'Open the abdomen first.', w.ribs && 'Done.'), run: () => (a.ribs(), play('tick')) },
        { key: 'moist', label: 'Moisten it with water', blocked: firstBlock(need(ctx, 'washbottle'), !w.skin && 'Open it first.'), run: () => (a.moisten(), play('drip'), notify('Kept moist.', 'success', 1200)) },
        { key: 'seeker', label: 'Displace the gut aside with the seeker', tone: 'brand', blocked: firstBlock(kit, !w.wall && 'Open the abdomen first.', !!w.display && 'Done.'), run: () => (a.display('SEEKER'), play('tick')) },
        { key: 'forceps', label: 'Pull the gut aside with forceps', tone: 'danger', blocked: firstBlock(kit, !w.wall && 'Open the abdomen first.', !!w.display && 'Done.'), run: () => (a.display('FORCEPS'), play('tick')) },
        { key: 'unravel', label: 'Unravel the gut with the seeker', blocked: firstBlock(!w.display && 'Displace the gut first.', w.unravelled && 'Done.'), run: () => (a.unravel(), play('tick')) },
        ...measureActs.slice(1),
        { key: 'look', label: 'Look closely', run: readNow },
      ],
    };
  if (id === 'gloves') return { title: 'Disposable gloves', info: w.gloves ? 'You are wearing a pair.' : 'Wear gloves to handle the specimen.', actions: [{ key: 'on', label: 'Put on a pair', tone: 'brand', blocked: w.gloves ? 'On.' : undefined, run: () => (a.gloves(), play('tick'), notify('Gloves on.', 'success', 1200)) }] };
  if (id === 'kit') return { title: 'Dissecting kit', info: 'Scalpel and fine scissors (cut away from the body), forceps (lift the skin first), a seeker (to move organs without tearing).', actions: [{ key: 'rat', label: 'Use them on the rat', run: () => setView({ selected: 'rat' }) }] };
  if (id === 'thread' || id === 'ruler') return { title: DISSECT_APPARATUS_LABEL[id], info: id === 'thread' ? 'Lay a damp thread along the gut, then straighten it on the ruler.' : 'Read to 0.5 cm.', actions: measureActs };
  if (id === 'washbottle') return { title: 'Wash bottle of water', info: 'Keep the specimen moist.', actions: [{ key: 'moist', label: 'Moisten the specimen', blocked: !w.skin ? 'Open it first.' : undefined, run: () => (a.moisten(), play('drip')) }] };
  if (id === 'disinfectant') return { title: 'Disinfectant', info: 'For the tools and the board when you finish.', actions: [{ key: 'clean', label: 'Disinfect the tools and the board; wrap the specimen', tone: 'brand', blocked: firstBlock(!w.pinned && 'Nothing to clean yet.', w.cleaned && 'Done.'), run: () => (a.clean(), play('drip')) }] };
  return null;
}

// ------------------------------------------------------------------ microorganisms

export const microActs = {
  wait(ctx: DissectCtx) {
    if (!ctx.p.micro.wait()) return notify(ctx.s.micro.incAt === null && ctx.s.micro.breadAt === null ? 'Set up the plates or the bread first.' : 'That is a week.', 'warning');
    play('tick');
    notify(`A day passes (time-lapse): day ${ctx.p.ref.current.micro.day}.`, 'info', 2000);
  },
  count(ctx: DissectCtx) {
    if (!ctx.p.micro.count()) return notify(ctx.s.micro.incAt === null ? 'Incubate the plates first.' : 'Leave them at least a day first.', 'warning');
    play('clink');
    readNow();
    notify('Count the colonies on each plate through the lid, quarter by quarter — do not open them.', 'info', 3600);
  },
  lens(ctx: DissectCtx) {
    if (!ctx.p.micro.lens()) return notify(ctx.s.micro.breadAt === null ? 'Set up the bread first.' : 'Leave it at least a day first.', 'warning');
    play('tick');
    readNow();
  },
};
function microPanel(id: string, ctx: DissectCtx): ObjectPanel | null {
  const { p, s } = ctx;
  const w = s.micro;
  const a = p.micro;
  const locked = w.incAt !== null ? 'The plates are in the incubator: leave them closed.' : undefined;
  const dayActs: LabAction[] = [
    { key: 'wait', label: 'Leave 1 day (time-lapse)', blocked: firstBlock(w.incAt === null && w.breadAt === null && 'Set up the plates or the bread first.', w.day >= MICRO_DAYS_MAX && 'That is a week.'), run: () => microActs.wait(ctx) },
  ];
  if (id.startsWith('plate:')) {
    const k = Number(id.slice(6));
    const pl = w.plates[k];
    if (!pl) return null;
    if (useDissectBench.getState().plate !== k) queueMicrotask(() => useDissectBench.setState({ plate: k }));
    return {
      title: `Agar plate ${k + 1}${pl.label ? ` — ${PLATE_LABEL[PLATES[k]!]}` : ''}`,
      info: `${pl.label ? `Labelled on the ${pl.label === 'BASE' ? 'base' : 'lid'}. ` : ''}${pl.airMin ? `Open to the air ${pl.airMin} min. ` : ''}${pl.touch ? `Touched (${pl.touch === 'WASHED' ? 'washed' : 'unwashed'} finger). ` : ''}${pl.tape ? (pl.tape === 'STRIPS' ? 'Taped.' : 'Sealed.') : ''}`,
      actions: [
        { key: 'base', label: `Label the base “${PLATE_LABEL[PLATES[k]!]}”`, tone: 'brand', blocked: firstBlock(locked, need(ctx, 'marker'), pl.label === 'BASE' && 'Done.'), run: () => (a.label(k, 'BASE'), play('tick')) },
        { key: 'lid', label: 'Write the label on the lid', blocked: firstBlock(locked, need(ctx, 'marker'), pl.label === 'LID' && 'Done.'), run: () => (a.label(k, 'LID'), play('tick')) },
        { key: 'air', label: `Take the lid off for ${AIR_MIN} minutes`, blocked: firstBlock(locked, pl.airMin > 0 && 'Done.'), run: () => (a.expose(k, AIR_MIN), play('tick'), notify(`${AIR_MIN} minutes open to the air, then the lid goes back on.`, 'info', 2400)) },
        { key: 'touch', label: `Lift the lid slightly; touch the agar lightly (${w.soaped ? 'washed' : 'unwashed'} finger)`, blocked: firstBlock(locked, !!pl.touch && 'Done.'), run: () => (a.touch(k, 'SLIGHT'), play('tick')) },
        { key: 'wide', label: 'Take the lid right off and touch the agar', tone: 'danger', blocked: firstBlock(locked, !!pl.touch && 'Done.'), run: () => (a.touch(k, 'WIDE'), play('tick')) },
        { key: 'tape', label: 'Tape the lid: two short strips', blocked: firstBlock(locked, need(ctx, 'tape'), pl.tape === 'STRIPS' && 'Done.'), run: () => (a.tape(k, 'STRIPS'), play('tick')) },
        { key: 'seal', label: 'Seal it all round with tape', blocked: firstBlock(locked, need(ctx, 'tape'), pl.tape === 'SEALED' && 'Done.'), run: () => (a.tape(k, 'SEALED'), play('tick')) },
        { key: 'count', label: 'Count the colonies (through the lid)', blocked: w.incAt === null ? 'Incubate the plates first.' : undefined, run: () => microActs.count(ctx) },
        { key: 'look', label: 'Look closely', run: readNow },
      ],
    };
  }
  if (id === 'tape') return { title: 'Adhesive tape', info: 'Two short strips hold the lid on without sealing the plate.', actions: [{ key: 'all', label: 'Tape every lid: two short strips', tone: 'brand', blocked: firstBlock(locked, w.plates.every((x) => x.tape === 'STRIPS') && 'Done.'), run: () => (a.tapeAll('STRIPS'), play('tick')) }, { key: 'seal', label: 'Seal every plate all round', blocked: locked, run: () => (a.tapeAll('SEALED'), play('tick')) }] };
  if (id === 'marker') return { title: 'Marker pen', info: 'Write on the base of each plate (lids get swapped).', actions: w.plates.map((x, k): LabAction => ({ key: `b${k}`, label: `Label plate ${k + 1} “${PLATE_LABEL[PLATES[k]!]}” on the base`, blocked: firstBlock(locked, x.label === 'BASE' && 'Done.'), run: () => (a.label(k, 'BASE'), play('tick')) })) };
  if (id === 'incubator')
    return {
      title: 'Incubator',
      info: w.incAt === null ? 'Invert the plates, then set the temperature.' : `${w.temp} °C · ${w.day - w.incAt} day${w.day - w.incAt === 1 ? '' : 's'}.`,
      actions: [
        { key: 'invert', label: 'Turn the plates upside down', blocked: firstBlock(locked, !ctx.scene.collected.has('plates') && 'Collect the plates first.', w.inverted && 'Done.'), run: () => (a.invert(), play('clink')) },
        ...INC_TEMPS.map((t): LabAction => ({ key: `t${t}`, label: `Put the plates in at ${t} °C`, tone: t === 30 && w.incAt === null ? 'brand' : undefined, blocked: firstBlock(locked, !ctx.scene.collected.has('plates') && 'Collect the plates first.'), run: () => (a.incubate(t), play('clink')) })),
        ...dayActs,
        { key: 'count', label: 'Count the colonies (lids on)', tone: 'brand', blocked: w.incAt === null ? 'Incubate the plates first.' : undefined, run: () => microActs.count(ctx) },
        { key: 'open', label: 'Open a plate to smell the colonies', tone: 'danger', blocked: w.incAt === null || w.day <= w.incAt ? 'Nothing has grown yet.' : undefined, run: () => a.openAfter() },
      ],
    };
  if (id.startsWith('slice:') || id === 'bags' || id === 'fridge') {
    const k = id.startsWith('slice:') ? Number(id.slice(6)) : -1;
    const sliceActs: LabAction[] =
      k >= 0
        ? [
            { key: 'mw', label: `Slice ${SLICES[k]}: moist, warm and dark`, tone: 'brand', blocked: firstBlock(w.breadAt !== null && 'It is bagged already.'), run: () => (a.slice(k, true, 'WARM'), play('drip')) },
            { key: 'dw', label: `Slice ${SLICES[k]}: dry, warm and dark`, blocked: firstBlock(w.breadAt !== null && 'It is bagged already.'), run: () => (a.slice(k, false, 'WARM'), play('tick')) },
            { key: 'mc', label: `Slice ${SLICES[k]}: moist, in the refrigerator`, blocked: firstBlock(w.breadAt !== null && 'It is bagged already.'), run: () => (a.slice(k, true, 'COLD'), play('drip')) },
          ]
        : [];
    return {
      title: k >= 0 ? `Bread slice ${SLICES[k]}` : id === 'bags' ? 'Polythene bags' : 'Bench refrigerator',
      info: w.breadAt === null ? 'Expose the bread to the air for 30 minutes, then bag it.' : `In its bag ${w.day - w.breadAt} day${w.day - w.breadAt === 1 ? '' : 's'}.`,
      actions: [
        { key: 'expose', label: 'Expose the bread to the air for 30 minutes', blocked: firstBlock(need(ctx, 'bread'), (w.breadExposed || w.breadAt !== null) && 'Done.'), run: () => (a.exposeBread(), play('tick')) },
        ...sliceActs,
        { key: 'bag', label: 'Into polythene bags (warm, dark place / refrigerator)', tone: 'brand', blocked: firstBlock(need(ctx, 'bags'), w.breadAt !== null && 'Done.', w.slices.every((x) => x.moist === null) && 'Set the slices up first.'), run: () => (a.bag(true), play('clink')) },
        { key: 'nobag', label: 'Leave the slices uncovered', blocked: firstBlock(w.breadAt !== null && 'Done.', w.slices.every((x) => x.moist === null) && 'Set the slices up first.'), run: () => a.bag(false) },
        ...dayActs,
        { key: 'lens', label: 'Examine the bread with the hand lens', blocked: firstBlock(need(ctx, 'lens'), w.breadAt === null && 'Bag the bread first.'), run: () => microActs.lens(ctx) },
      ],
    };
  }
  if (id === 'lens') return { title: 'Hand lens', info: 'Look at the mould on the bread.', actions: [{ key: 'lens', label: 'Examine the bread', tone: 'brand', blocked: w.breadAt === null ? 'Bag the bread first.' : undefined, run: () => microActs.lens(ctx) }] };
  if (id === 'microscope') return { title: 'Microscope', info: 'The teacher’s slide of bread mould (Rhizopus).', actions: [{ key: 'slide', label: 'Look at the slide', tone: 'brand', run: () => (a.slide(), play('tick'), readNow()) }] };
  if (id === 'disinfectant')
    return {
      title: 'Strong disinfectant',
      info: 'Wipe the bench before you start; soak the taped plates in it at the end.',
      actions: [
        { key: 'wipe', label: 'Wipe the bench', tone: w.wiped ? undefined : 'brand', blocked: w.wiped ? 'Done.' : undefined, run: () => (a.wipe(), play('drip')) },
        { key: 'soak', label: 'Soak the taped plates in it', blocked: firstBlock(w.countAt === null && 'Count the colonies first.', !!w.dispose && 'Done.'), run: () => (a.dispose('DISINFECT'), play('drip')) },
        { key: 'bin', label: 'Throw the plates in the bin', tone: 'danger', blocked: firstBlock(w.countAt === null && 'Count the colonies first.', !!w.dispose && 'Done.'), run: () => a.dispose('BIN') },
      ],
    };
  return null;
}

// ------------------------------------------------------------------ all objects

export function dissectObjectPanel(id: string, ctx: DissectCtx): ObjectPanel | null {
  const { p, s, scene } = ctx;
  const task = s.task ?? 'EOSIN';
  if (id.startsWith('cup:')) {
    const a = id.slice(4) as DissectApparatusId;
    return { title: DISSECT_APPARATUS_LABEL[a], info: 'In the apparatus cupboard.', actions: [{ key: 'take', label: 'Take to my bench', tone: 'brand', run: () => (p.note(`collect:${a}`), play('clink'), setView({ selected: null }), notify(`${DISSECT_APPARATUS_LABEL[a]} is on your bench.`, 'success', 1500)) }] };
  }
  if (id === 'handwash' && task === 'MICROBE' && s.micro.incAt === null)
    return {
      title: 'Hand-washing point',
      info: 'Soap, running water and paper towels.',
      actions: [
        { key: 'soap', label: 'Wash with soap now (before the washed-finger plate)', tone: 'brand', blocked: s.micro.soaped ? 'Done.' : undefined, run: () => (p.micro.soap(), washHands(p.note)) },
        { key: 'wash', label: 'Wash my hands', run: () => washHands(p.note) },
      ],
    };
  const room = bioRoomPanel(id, {
    coat: scene.coat,
    goggles: scene.goggles,
    note: p.note,
    open: ctx.open,
    benchInfo: task === 'RAT' ? 'Bench 2: the rat on its board, the gloves, the task card and your notebook.' : task === 'MICROBE' ? 'Bench 2: the bench refrigerator, the task card and your notebook.' : 'Bench 2: the balsam plant, the task card and your notebook.',
    whiteboard: task === 'RAT' ? 'Today: dissection of a rat. Lift the skin before you cut. There is no gall bladder.' : task === 'MICROBE' ? 'Today: growing microorganisms. Label the base; never open the plates after incubation.' : 'Today: the path of water in a plant. Cut thin sections away from your fingers.',
  });
  if (id === 'goggles' && room) return { ...room, info: 'Wear them whenever liquids could splash (eosin, disinfectant).' };
  if (room) return room;
  const panel = task === 'RAT' ? ratPanel(id, ctx) : task === 'MICROBE' ? microPanel(id, ctx) : eosinPanel(id, ctx);
  if (panel) return panel;
  switch (id) {
    case 'cupboard':
      return { title: 'Apparatus cupboard', info: 'Choose the apparatus you need.', actions: [{ key: 'list', label: 'Choose apparatus…', tone: 'brand', run: () => ctx.open('cupboard') }] };
    case 'card':
      return { title: 'Task card', actions: [{ key: 'read', label: 'Read the task card', tone: 'brand', run: () => ctx.open('task') }] };
    case 'book':
      return { title: 'Practical notebook', info: 'Your tables, drawing and answers — this is what is marked.', actions: [{ key: 'open', label: 'Open the notebook', tone: 'brand', run: () => ctx.open('notebook') }] };
  }
  const extra = DISSECT_APPARATUS.find((a) => a.id === id);
  if (extra) return { title: extra.label, info: extra.for.includes(task) ? undefined : 'Not needed for this practical.', actions: [{ key: 'return', label: 'Put back in the cupboard', run: () => (p.note(`return:${extra.id}`), setView({ selected: null })) }] };
  return null;
}

/** The hint for practice mode with guided mode off (the 2D lab's hint, plus the 3D set-up steps first). */
export function dissectHint3d(ctx: DissectCtx, plain: string): string {
  const { scene, s } = ctx;
  const task = s.task ?? 'EOSIN';
  if (!scene.coat) return 'Put on a lab coat: it hangs on the hooks by the door.';
  const missing = neededFor(task).filter((a) => !scene.collected.has(a.id));
  if (missing.length) return `Collect from the apparatus cupboard: ${missing.map((a) => a.label.charAt(0).toLowerCase() + a.label.slice(1)).join(', ')}.`;
  return plain;
}
