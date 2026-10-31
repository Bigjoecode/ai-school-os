import {
  AGAR_ACID,
  AGAR_ACID_LABEL,
  AGAR_CLOCK_MAX,
  AGAR_SIZES,
  PLAS_CLOCK_MAX,
  PLAS_MEDIUM_LABEL,
  POTATO_CLOCK_MAX,
  POTATO_CONCS,
  POTATO_MAX_CYL,
  agarSeenClear,
  potatoPhase,
  type AgarSize,
  type BioOsmosisState,
  type PlasMedium,
} from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { bioRoomPanel } from '../../bio-common/lab3d/common';
import type { Osmosis } from '../actions';
import { FEEL_TEXT, potatoShown } from '../readings';
import { useOsmoBench, type Lying } from './bench';
import { OSMO_APPARATUS, OSMO_APPARATUS_LABEL, neededFor, type OsmoApparatusId, type OsmoScene } from './scene-state';

/**
 * What can be done with each object on the osmosis bench. Every action is a
 * button; a blocked one says why. Marked changes go through the shared
 * actions (the same as the 2D lab); the 3D-only steps (safety, apparatus,
 * feeling a cylinder, hand washing) are log notes.
 */

export interface OsmoCtx {
  o: Osmosis;
  s: BioOsmosisState;
  scene: OsmoScene;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}
const view = () => useLabView.getState();
const setView = (p: Parameters<ReturnType<typeof useLabView.getState>['set']>[0]) => view().set(p);
const need = (ctx: OsmoCtx, id: OsmoApparatusId) => (ctx.scene.collected.has(id) ? undefined : `Get the ${OSMO_APPARATUS_LABEL[id].toLowerCase()} from the apparatus cupboard first.`);
const firstBlock = (...xs: (string | undefined)[]) => xs.find(Boolean);
const lc = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
/** Brings cylinder / cube i into the hand, lying on `lying`. */
export const hold = (i: number, lying: Lying) => useOsmoBench.setState({ sel: i, lying });
/** Opens the reading view (the ruler, the balance or the eyepiece). */
export const readNow = () => setView({ mode: 'read', selected: null });

// ------------------------------------------------------------------ potato

export const potatoActs = {
  bore(ctx: OsmoCtx, conc: number) {
    const i = ctx.o.potato.bore(conc);
    if (i < 0) return notify(ctx.s.potato.cyl.length >= POTATO_MAX_CYL ? 'Eight cylinders is plenty.' : 'The soaking has started: bore cylinders before you put any in.', 'warning');
    hold(i, 'tile');
    play('creak');
    setView({ selected: null, focus: 'tile' });
    notify(`Cylinder ${i + 1} bored for the ${conc === 0 ? 'distilled water' : `${conc.toFixed(1)} M sucrose`}. Trim it to 50 mm.`, 'success', 2200);
  },
  measure(ctx: OsmoCtx, i: number) {
    ctx.o.potato.measure(i);
    hold(i, 'ruler');
    play('tick');
    readNow();
  },
  weigh(ctx: OsmoCtx, i: number) {
    const c = ctx.s.potato.cyl[i];
    ctx.o.potato.weigh(i);
    hold(i, 'balance');
    play('clink');
    readNow();
    if (c && !(potatoPhase(c) === 'A' ? c.blotA : c.blotB)) notify('Not blotted: the liquid on its surface is weighed too.', 'warning', 2600);
  },
};
function potatoPanel(id: string, ctx: OsmoCtx): ObjectPanel | null {
  const { o, s } = ctx;
  const w = s.potato;
  const started = w.cyl.some((c) => c.placedAt !== null);
  const soaking = w.cyl.some((c) => potatoPhase(c) === 'SOAK');
  if (id === 'tuber' || id === 'borer')
    return {
      title: id === 'tuber' ? 'Irish potato' : 'Cork borer',
      info: 'Push the borer into the potato on the tile, away from your hand, twist and pull it out; push the cylinder out with a rod.',
      actions: POTATO_CONCS.map((c): LabAction => ({ key: `bore-${c}`, label: `Bore a cylinder for ${c === 0 ? 'distilled water (the control)' : `${c.toFixed(1)} mol/dm³ sucrose`}`, blocked: firstBlock(need(ctx, 'borer'), need(ctx, 'tile'), started ? 'The soaking has started.' : undefined, w.cyl.length >= POTATO_MAX_CYL ? 'Eight cylinders is plenty.' : undefined), run: () => potatoActs.bore(ctx, c) })),
    };
  if (id === 'tile' || id === 'scalpel')
    return {
      title: id === 'tile' ? 'White tile' : 'Scalpel',
      info: 'Cut on the tile, away from your fingers. Trim each cylinder to 50 mm, cutting off any skin.',
      actions: [{ key: 'trim', label: 'Trim every cylinder to 50 mm', tone: 'brand', blocked: firstBlock(need(ctx, 'scalpel'), need(ctx, 'tile'), !w.cyl.length ? 'Bore some cylinders first.' : undefined, w.cyl.every((c) => c.trimmed) ? 'They are all trimmed.' : undefined), run: () => (o.potato.trimAll(), play('creak')) }],
    };
  if (id.startsWith('cyl:') || id.startsWith('beaker:')) {
    const i = Number(id.split(':')[1]);
    const c = w.cyl[i];
    if (!c) return null;
    const ph = potatoPhase(c);
    const sh = potatoShown(o.v, s, i);
    const name = `Cylinder ${i + 1} — ${c.conc === 0 ? 'distilled water' : `${c.conc.toFixed(1)} M sucrose`}`;
    if (ph === 'SOAK')
      return { title: name, info: `Soaking for ${w.clock - (c.placedAt ?? 0)} min.`, actions: [{ key: 'out', label: 'Take it out with forceps', blocked: need(ctx, 'forceps'), run: () => (o.potato.remove(i), hold(i, 'tile'), play('clink')) }] };
    const actions: LabAction[] = [];
    if (ph === 'B') actions.push({ key: 'trim', label: 'Trim it to 50 mm', blocked: firstBlock(need(ctx, 'scalpel'), c.trimmed ? 'Already trimmed.' : undefined, w.measures.some((m) => m.cyl === i) ? 'Already measured: trimming now would spoil the reading.' : undefined), run: () => (o.potato.trim(i), play('creak')) });
    actions.push({ key: 'blot', label: 'Blot it dry with filter paper', blocked: firstBlock(need(ctx, 'paper'), (ph === 'B' ? c.blotB : c.blotA) ? 'Already blotted.' : undefined), run: () => (o.potato.blot(i), hold(i, 'tile'), play('tick')) });
    actions.push({ key: 'measure', label: 'Measure its length on the ruler', tone: 'brand', blocked: need(ctx, 'ruler'), run: () => potatoActs.measure(ctx, i) });
    actions.push({ key: 'weigh', label: 'Weigh it on the balance', tone: 'brand', blocked: need(ctx, 'balance'), run: () => potatoActs.weigh(ctx, i) });
    if (ph === 'B') actions.push({ key: 'in', label: 'Put it into its solution', blocked: firstBlock(need(ctx, 'beakers'), need(ctx, 'forceps')), run: () => (o.potato.place(i), play('drip')) });
    if (ph === 'A') actions.push({ key: 'feel', label: 'Feel it: firm or soft?', run: () => (o.note(`feel#${i + 1}`), notify(FEEL_TEXT[sh?.feel ?? 'SAME'], 'info', 3200)) });
    actions.push({ key: 'notebook', label: 'Write it in my notebook', run: () => ctx.open('notebook') });
    return { title: name, info: `${ph === 'B' ? 'Before soaking' : 'After soaking'}${(ph === 'B' ? c.blotB : c.blotA) ? ', blotted dry' : ', not blotted'}.${sh?.mass !== null && sh?.mass !== undefined ? ` Last weighed: ${sh.mass.toFixed(2)} g.` : ''}`, actions };
  }
  switch (id) {
    case 'ruler':
      return { title: 'Ruler (mm)', info: 'Lay the cylinder along it from the zero mark and read its end at eye level, to the nearest millimetre.', actions: [{ key: 'read', label: 'Read the ruler', tone: 'brand', blocked: useOsmoBench.getState().lying !== 'ruler' ? 'Measure a cylinder first (tap it).' : undefined, run: readNow }] };
    case 'balance':
      return { title: 'Electronic balance (0.01 g)', info: 'Zero it, then put the blotted cylinder on the pan and read the display.', actions: [{ key: 'read', label: 'Read the balance', tone: 'brand', blocked: useOsmoBench.getState().lying !== 'balance' ? 'Weigh a cylinder first (tap it).' : undefined, run: readNow }] };
    case 'paper':
      return { title: 'Filter paper', info: 'Roll each cylinder gently on it to remove the surface liquid — the same way every time.', actions: w.cyl.map((c, i): LabAction => ({ key: `b${i}`, label: `Blot cylinder ${i + 1}`, blocked: potatoPhase(c) === 'SOAK' ? 'It is soaking.' : (potatoPhase(c) === 'B' ? c.blotB : c.blotA) ? 'Already blotted.' : undefined, run: () => (o.potato.blot(i), play('tick')) })) };
    case 'forceps':
      return { title: 'Forceps', info: 'Lift cylinders in and out of the solutions without squeezing them.', actions: [] };
    case 'clock':
      return {
        title: soaking ? `Soaking: ${w.clock - (w.cyl.find((c) => c.placedAt !== null)?.placedAt ?? 0)} min` : 'Stopwatch',
        info: soaking ? 'Leave them at least 30 minutes (better an hour), then take them all out together.' : 'Put every cylinder in its solution at the same time, then time the soak.',
        actions: [
          { key: 'in', label: 'Put every cylinder into its solution now', tone: 'brand', blocked: firstBlock(need(ctx, 'beakers'), need(ctx, 'forceps'), !w.cyl.some((c) => c.placedAt === null) ? 'They are all in.' : undefined), run: () => (o.potato.placeAll(), play('drip')) },
          { key: 'w15', label: 'Wait 15 min (time-lapse)', blocked: !soaking ? 'Nothing is soaking.' : w.clock >= POTATO_CLOCK_MAX ? 'That is long enough.' : undefined, run: () => (o.potato.wait(15), play('tick')) },
          { key: 'w30', label: 'Wait 30 min (time-lapse)', blocked: !soaking ? 'Nothing is soaking.' : w.clock >= POTATO_CLOCK_MAX ? 'That is long enough.' : undefined, run: () => (o.potato.wait(30), play('tick')) },
          { key: 'out', label: 'Take them all out together', blocked: firstBlock(!soaking ? 'Nothing is soaking.' : undefined, need(ctx, 'forceps')), run: () => (o.potato.removeAll(), play('clink')) },
        ],
      };
  }
  return null;
}

// ------------------------------------------------------------------ plasmolysis

export const plasActs = {
  drop(ctx: OsmoCtx, m: PlasMedium) {
    ctx.o.plasmolysis.drop(m);
    play('drip');
    notify(`A drop of ${PLAS_MEDIUM_LABEL[m].toLowerCase()} at one edge of the cover slip. Now draw it under with filter paper at the opposite edge.`, 'info', 3000);
  },
  draw(ctx: OsmoCtx) {
    ctx.o.plasmolysis.drawThrough();
    play('tick');
    notify('The filter paper soaks up liquid at the far edge and draws the new liquid right under the cover slip.', 'success', 2600);
  },
};
function plasPanel(id: string, ctx: OsmoCtx): ObjectPanel | null {
  const { o, s } = ctx;
  const w = s.plas;
  const a = o.plasmolysis;
  const last = w.irrigations.at(-1);
  if (id === 'onion') return { title: 'Red onion', info: 'Snap a fleshy scale leaf and peel the thin coloured skin from its outer side with forceps: one cell thick.', actions: [{ key: 'peel', label: 'Peel a thin strip of epidermis', tone: 'brand', blocked: firstBlock(need(ctx, 'forceps'), w.peeled ? 'Done: the strip is on your forceps.' : undefined), run: () => (a.peel(), play('tick')) }] };
  if (id.startsWith('dropper:')) {
    const m = id.slice(8) as PlasMedium;
    const actions: LabAction[] = [];
    if (!w.mount) actions.push({ key: 'mount', label: `Mount the strip flat in a drop of ${PLAS_MEDIUM_LABEL[m].toLowerCase()}`, tone: m === 'WATER' ? 'brand' : undefined, blocked: firstBlock(need(ctx, 'slides'), !w.peeled ? 'Peel a strip of epidermis from the onion first.' : undefined), run: () => (a.mount(m), play('drip')) });
    if (w.coverslip) actions.push({ key: 'edge', label: 'A drop at one edge of the cover slip', tone: 'brand', blocked: w.clock >= PLAS_CLOCK_MAX ? 'Time is up.' : undefined, run: () => plasActs.drop(ctx, m) });
    return { title: PLAS_MEDIUM_LABEL[m], info: m === 'WATER' ? 'For mounting, and for deplasmolysis at the end.' : 'A strong solution: lower water potential than the cell sap.', actions };
  }
  if (id === 'slide' || id === 'needle' || id === 'slides')
    return {
      title: id === 'needle' ? 'Mounted needle' : 'Your slide',
      info: !w.mount ? 'A clean slide: mount the strip in a drop of water on it.' : w.coverslip ? 'Ready for the microscope.' : 'Lower the cover slip at an angle with the mounted needle so no air bubbles are trapped.',
      actions: [
        { key: 'cs', label: 'Lower a cover slip at an angle', tone: 'brand', blocked: firstBlock(need(ctx, 'needle'), !w.mount ? 'Mount the strip first.' : undefined, w.coverslip ? 'Done.' : undefined), run: () => (a.coverslip(), play('clink')) },
        { key: 'stage', label: 'Put it on the microscope stage', blocked: firstBlock(need(ctx, 'microscope'), !w.coverslip ? 'Put the cover slip on first.' : undefined, w.onStage ? 'It is on the stage.' : undefined), run: () => (a.toStage(), play('clink'), setView({ focus: 'scope' })) },
      ],
    };
  if (id === 'paper') return { title: 'Filter paper', info: 'Held at the edge opposite the drop, it soaks up the old liquid and draws the new one under the cover slip.', actions: [{ key: 'draw', label: 'Draw the drop under the cover slip', tone: 'brand', blocked: !last ? 'Put a drop of solution at one edge of the cover slip first.' : last.drawn ? 'That drop has been drawn under.' : last.at !== w.clock ? 'Do it straight after adding the drop.' : undefined, run: () => plasActs.draw(ctx) }] };
  if (id === 'scope')
    return {
      title: `Microscope (×${w.objective} objective)`,
      info: w.onStage ? `${w.clock} min since mounting.` : 'Put your slide on the stage first.',
      actions: [
        { key: 'look', label: 'Look through the eyepiece', tone: 'brand', blocked: !w.onStage ? 'Put your slide on the stage first.' : undefined, run: readNow },
        { key: 'o10', label: 'Low power (×10)', blocked: w.objective === 10 ? 'Already at ×10.' : undefined, run: () => (a.objective(10), play('creak')) },
        { key: 'o40', label: 'High power (×40)', blocked: w.objective === 40 ? 'Already at ×40.' : undefined, run: () => (a.objective(40), play('creak')) },
        { key: 'rec', label: 'Record this view', blocked: !w.onStage ? 'Put your slide on the stage first.' : undefined, run: () => (a.capture(), play('tick')) },
        { key: 'w5', label: 'Wait 5 min', blocked: !w.mount || w.clock >= PLAS_CLOCK_MAX ? 'Not now.' : undefined, run: () => (a.wait(5), play('tick')) },
      ],
    };
  if (id === 'forceps') return { title: 'Forceps', info: 'For peeling the epidermis.', actions: [] };
  return null;
}

// ------------------------------------------------------------------ agar

export const agarActs = {
  measure(ctx: OsmoCtx, i: number) {
    ctx.o.agar.measure(i);
    hold(i, 'ruler');
    play('tick');
    readNow();
  },
  depth(ctx: OsmoCtx, i: number) {
    ctx.o.agar.measureDepth(i);
    hold(i, 'ruler');
    play('tick');
    readNow();
  },
  wait(ctx: OsmoCtx, min: number, away = false) {
    const before = ctx.s.agar.clock;
    ctx.o.agar.wait(min, away);
    play('tick');
    const s = ctx.o.ref.current;
    const now = s.agar.clock;
    const clear = s.agar.cubes.map((_, k) => k).filter((k) => agarSeenClear(ctx.o.v.agar, k, s.agar) === now);
    if (clear.length) notify(`${now} min: ${clear.map((k) => `cube ${k + 1} (${s.agar.cubes[k]!.size} cm)`).join(' and ')} has just become completely colourless.`, 'success', 4200);
    else if (!away && now - before < min - 1e-9) notify(`Stopped at ${now} min.`, 'info');
  },
};
function agarPanel(id: string, ctx: OsmoCtx): ObjectPanel | null {
  const { o, s } = ctx;
  const w = s.agar;
  const a = o.agar;
  const started = w.cubes.some((c) => c.placedAt !== null);
  const watching = (min: number): LabAction => ({ key: `w${min}`, label: `Watch the cubes for ${min} min (time-lapse)`, blocked: !started ? 'Put the cubes into the acid first.' : w.clock >= AGAR_CLOCK_MAX ? 'That is the end.' : undefined, run: () => agarActs.wait(ctx, min) });
  if (id === 'block' || id === 'scalpel')
    return {
      title: id === 'block' ? 'Pink agar block' : 'Scalpel',
      info: 'Agar with phenolphthalein and a little sodium hydroxide: pink while alkaline. Cut cubes on the tile, away from your fingers.',
      actions: AGAR_SIZES.map((sz): LabAction => ({ key: `cut-${sz}`, label: `Cut a ${sz} cm cube`, blocked: firstBlock(need(ctx, 'scalpel'), need(ctx, 'tile'), started ? 'The timing has started.' : undefined, w.cubes.length >= 6 ? 'Six cubes is the most the beaker holds.' : undefined), run: () => (hold(Math.max(0, a.cut(sz as AgarSize)), 'tile'), play('creak')) })),
    };
  if (id.startsWith('cube:')) {
    const i = Number(id.slice(5));
    const c = w.cubes[i];
    if (!c) return null;
    const actions: LabAction[] = [];
    if (c.cutAt === null) actions.push({ key: 'm', label: 'Measure its side on the ruler', tone: 'brand', blocked: need(ctx, 'ruler'), run: () => agarActs.measure(ctx, i) });
    if (c.placedAt === null) actions.push({ key: 'in', label: 'Put all the cubes into the acid now', blocked: firstBlock(need(ctx, 'forceps'), !w.acid ? 'Pour the acid into the beaker first.' : undefined), run: () => (a.placeAll(), play('drip')) });
    if (c.cutAt !== null) actions.push({ key: 'd', label: 'Measure the colourless zone on the ruler', tone: 'brand', blocked: need(ctx, 'ruler'), run: () => agarActs.depth(ctx, i) });
    if (c.placedAt === null) actions.push({ key: 'x', label: 'Discard it', run: () => (a.discard(i), setView({ selected: null })) });
    return { title: `Cube ${i + 1}: ${c.size} cm`, info: c.cutAt !== null ? `Cut open at ${c.cutAt} min: a colourless rim round a pink centre.` : c.placedAt !== null ? 'In the acid.' : 'On the tile.', actions };
  }
  switch (id) {
    case 'acid':
    case 'acidbottle': {
      const inAcid = w.cubes.map((c, i) => ({ c, i })).filter((x) => x.c.placedAt !== null && x.c.cutAt === null);
      return {
        title: w.acid ? 'Beaker of dilute hydrochloric acid' : 'Dilute hydrochloric acid',
        info: 'Corrosive and harmful to eyes: goggles on. The acid diffuses into the agar and neutralises the alkali: the pink colour goes.',
        actions: [
          ...(!started ? AGAR_ACID.map((x): LabAction => ({ key: `pour-${x}`, label: `Pour ${AGAR_ACID_LABEL[x]}`, tone: x === 'FULL' ? 'brand' : undefined, blocked: need(ctx, 'beaker'), run: () => (a.pour(x), play('drip')) })) : []),
          { key: 'in', label: 'Put all the cubes in at the same moment and start the stopwatch', tone: 'brand', blocked: firstBlock(need(ctx, 'forceps'), need(ctx, 'clock'), !w.acid ? 'Pour the acid first.' : undefined, !w.cubes.some((c) => c.placedAt === null) ? 'They are all in.' : undefined), run: () => (a.placeAll(), play('drip')) },
          watching(1),
          watching(5),
          ...inAcid.map(({ c, i }): LabAction => ({ key: `cut-${i}`, label: `Take out cube ${i + 1} (${c.size} cm) and cut it in half`, blocked: firstBlock(need(ctx, 'forceps'), need(ctx, 'scalpel')), run: () => (a.cutOpen(i), hold(i, 'tile'), play('creak')) })),
        ],
      };
    }
    case 'stopwatch':
      return { title: started ? `Stopwatch: ${w.clock} min` : 'Stopwatch', info: 'Watch the cubes; note the time when each becomes completely colourless.', actions: [watching(1), watching(5), watching(10), { key: 'away', label: 'Leave it for 20 min (not watching)', blocked: !started ? 'Not started.' : undefined, run: () => agarActs.wait(ctx, 20, true) }] };
    case 'ruler':
      return { title: 'Ruler (mm)', info: 'Lay the cube (or the cut face) against it and read to the nearest millimetre.', actions: [{ key: 'read', label: 'Read the ruler', tone: 'brand', blocked: useOsmoBench.getState().lying !== 'ruler' ? 'Measure a cube first (tap it).' : undefined, run: readNow }] };
    case 'tile':
      return { title: 'White tile', info: 'Cut on it; the pink shows up well against it.', actions: [] };
    case 'forceps':
      return { title: 'Forceps', info: 'Handle the cubes and lift them out of the acid with these — not your fingers.', actions: [] };
  }
  return null;
}

// ------------------------------------------------------------------ all objects

export function osmoObjectPanel(id: string, ctx: OsmoCtx): ObjectPanel | null {
  const { o, s, scene } = ctx;
  const task = s.task ?? 'POTATO';
  if (id.startsWith('cup:')) {
    const a = id.slice(4) as OsmoApparatusId;
    return { title: OSMO_APPARATUS_LABEL[a], info: 'In the apparatus cupboard.', actions: [{ key: 'take', label: 'Take to my bench', tone: 'brand', run: () => (o.note(`collect:${a}`), play('clink'), setView({ selected: null }), notify(`${OSMO_APPARATUS_LABEL[a]} is on your bench.`, 'success', 1500)) }] };
  }
  const room = bioRoomPanel(id, {
    coat: scene.coat,
    goggles: scene.goggles,
    note: o.note,
    open: ctx.open,
    benchInfo: task === 'PLASMOLYSIS' ? 'Bench 2: the red onion, the dropper bottles, the task card and your notebook.' : task === 'AGAR' ? 'Bench 2: the pink agar, the acid, the task card and your notebook.' : 'Bench 2: the potato, the sucrose solutions, the task card and your notebook.',
    whiteboard: task === 'PLASMOLYSIS' ? 'Today: plasmolysis. Water, then a strong solution drawn under the cover slip, then water again.' : task === 'AGAR' ? 'Today: diffusion into agar cubes. Goggles on for the acid.' : 'Today: osmosis in potato cylinders. Blot before every weighing.',
  });
  if (id === 'goggles' && room) return { ...room, info: task === 'AGAR' ? 'Wear them: the acid and the alkali in the agar harm the eyes.' : 'Wear them whenever liquids could splash.' };
  if (room) return room;
  const p = task === 'POTATO' ? potatoPanel(id, ctx) : task === 'PLASMOLYSIS' ? plasPanel(id, ctx) : agarPanel(id, ctx);
  if (p) return p;
  switch (id) {
    case 'cupboard':
      return { title: 'Apparatus cupboard', info: 'Choose the apparatus you need.', actions: [{ key: 'list', label: 'Choose apparatus…', tone: 'brand', run: () => ctx.open('cupboard') }] };
    case 'card':
      return { title: 'Task card', actions: [{ key: 'read', label: 'Read the task card', tone: 'brand', run: () => ctx.open('task') }] };
    case 'book':
      return { title: 'Practical notebook', info: 'Your table, graph or drawing and your answers — this is what is marked.', actions: [{ key: 'open', label: 'Open the notebook', tone: 'brand', run: () => ctx.open('notebook') }] };
  }
  const extra = OSMO_APPARATUS.find((a) => a.id === id);
  if (extra) return { title: extra.label, info: extra.for.includes(task) ? undefined : 'Not needed for this practical.', actions: [{ key: 'return', label: 'Put back in the cupboard', run: () => (o.note(`return:${extra.id}`), setView({ selected: null })) }] };
  return null;
}

/** The hint for practice mode with guided mode off (the 2D lab's hint, plus the 3D set-up steps first). */
export function osmoHint3d(ctx: OsmoCtx, plain: string): string {
  const { scene, s } = ctx;
  const task = s.task ?? 'POTATO';
  if (!scene.coat) return 'Put on a lab coat: it hangs on the hooks by the door.';
  if (task === 'AGAR' && !scene.goggles) return 'Put on goggles: the acid and alkali harm the eyes.';
  const missing = neededFor(task).filter((a) => !scene.collected.has(a.id));
  if (missing.length) return `Collect from the apparatus cupboard: ${missing.map((a) => lc(a.label)).join(', ')}.`;
  return plain;
}
