import { CROSS_FILLS, CROSS_FILL_LABEL, DISC_RECORD, DISC_RECORD_LABEL, DISC_TRIES, FOOD_ORG_LABEL, FOOD_SPOT_LABEL, FOOD_SPOT_SHOWS, type BioGeneticsState, type FoodSpot } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { bioRoomPanel } from '../../bio-common/lab3d/common';
import { discNow, heightNow, lastPair, type Genetics } from '../actions';
import { GEN_APPARATUS, GEN_APPARATUS_LABEL, neededFor, type GenApparatusId, type GenScene } from './scene-state';

/**
 * What can be done with each object on the bench and with the classmates.
 * Every action is a button; a blocked one says why. Marked changes go through
 * the shared actions (the same as the 2D lab); the 3D-only steps (coat,
 * apparatus, hand washing) are log notes. Sounds and animations follow the log.
 */

export interface GenCtx {
  g: Genetics;
  s: BioGeneticsState;
  scene: GenScene;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}
const view = () => useLabView.getState();
const setView = (x: Parameters<ReturnType<typeof useLabView.getState>['set']>[0]) => view().set(x);
const need = (ctx: GenCtx, id: GenApparatusId) => (ctx.scene.collected.has(id) ? undefined : `Get the ${GEN_APPARATUS_LABEL[id].toLowerCase()} from the apparatus cupboard first.`);
const firstBlock = (...xs: (string | undefined)[]) => xs.find(Boolean);
const lc = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
export const readNow = () => setView({ mode: 'read', selected: null });

// ------------------------------------------------------------------ height

export const heightActs = {
  measure(ctx: GenCtx, kind: 'H' | 'S') {
    const r = ctx.g.height.measure(kind);
    const who = ctx.g.ref.current.height.at + 1;
    if (r === 'DECLINED') return notify(`Classmate ${who}: “I’d rather not, please.” That is fine — leave them out and call the next.`, 'info', 4200);
    if (r === null) return notify('That is plenty of measurements.', 'warning');
    notify(kind === 'H' ? `Classmate ${who}: the board reads ${r} cm. Write it in your notebook.` : `Classmate ${who}: hand span ${r.toFixed(1)} cm.`, 'success', 3600);
  },
};
function heightPanel(id: string, ctx: GenCtx): ObjectPanel | null {
  const { g, s } = ctx;
  const w = s.height;
  const a = g.height;
  const now = heightNow(g.v, s);
  const calls: LabAction[] = [
    { key: 'next', label: 'Call the next classmate', tone: 'brand', blocked: w.at >= g.v.height.n - 1 ? 'That was the last classmate.' : undefined, run: a.next },
    { key: 'prev', label: 'Call the previous classmate', blocked: w.at <= 0 ? 'This is the first classmate.' : undefined, run: a.prev },
  ];
  const measureH: LabAction = { key: 'mh', label: 'Measure the height', tone: 'brand', blocked: need(ctx, 'board'), run: () => heightActs.measure(ctx, 'H') };
  const measureS: LabAction = { key: 'ms', label: 'Measure the hand span', blocked: need(ctx, 'ruler'), run: () => heightActs.measure(ctx, 'S') };
  if (id === 'classmate')
    return {
      title: `Classmate ${w.at + 1} of ${g.v.height.n}`,
      info: `${w.shoesOff ? 'Shoes off' : 'Shoes on'}. Height ${now.h ?? '—'} cm · span ${now.s?.toFixed(1) ?? '—'} cm.`,
      actions: [
        w.shoesOff ? { key: 'shoeson', label: 'Let them keep their shoes on', run: () => a.shoes(false) } : { key: 'shoes', label: 'Ask them to take their shoes off', tone: 'brand', run: () => a.shoes(true) },
        w.spread ? { key: 'cup', label: 'Let them relax the fingers', run: () => a.spread(false) } : { key: 'spread', label: 'Ask them to spread the fingers fully', run: () => a.spread(true) },
        measureH,
        measureS,
        ...calls,
      ],
    };
  if (id === 'board')
    return {
      title: 'Height board',
      info: 'Heels, back and head against the board; read where the set square meets the scale, at eye level.',
      actions: [w.square ? { key: 'sqoff', label: 'Just look at the top of the head', run: () => a.square(false) } : { key: 'sq', label: 'Use the set square flat on the head', tone: 'brand', blocked: need(ctx, 'setsquare'), run: () => a.square(true) }, measureH, ...calls, { key: 'look', label: 'Look closely (record sheet)', run: readNow }],
    };
  if (id === 'setsquare') return { title: 'Set square', info: 'One edge against the board, the other flat on the head.', actions: [w.square ? { key: 'sqoff', label: 'Stop using it', run: () => a.square(false) } : { key: 'sq', label: 'Use it for every height', tone: 'brand', run: () => a.square(true) }] };
  if (id === 'ruler') return { title: 'Ruler — hand span', info: 'Tip of the thumb to tip of the little finger, fingers spread, to the nearest 0.5 cm.', actions: [w.spread ? { key: 'cup', label: 'Let the fingers relax', run: () => a.spread(false) } : { key: 'spread', label: 'Ask for the fingers spread fully', tone: 'brand', run: () => a.spread(true) }, measureS, ...calls] };
  return null;
}

// ------------------------------------------------------------------ discontinuous

export const discActs = {
  roll(ctx: GenCtx) {
    const r = ctx.g.disc.roll();
    const st = ctx.g.ref.current.disc;
    const who = st.at + 1;
    const t = st.tries[st.at] ?? 0;
    if (r === null) return notify('No more attempts are needed.', 'info');
    notify(r ? `Classmate ${who} rolls the tongue into a U.` : `Classmate ${who} cannot roll it (attempt ${t}).${t < DISC_TRIES ? ' Let them try again.' : ' Record N.'}`, r ? 'success' : 'info', 3400);
  },
  card(ctx: GenCtx) {
    ctx.g.disc.card();
    const st = ctx.g.ref.current;
    const n = discNow(ctx.g.v, st);
    notify(`Health card ${n.who + 1}: blood group ${n.card}.`, 'info', 3000);
  },
};
function discPanel(id: string, ctx: GenCtx): ObjectPanel | null {
  const { g, s } = ctx;
  const w = s.disc;
  const a = g.disc;
  const now = discNow(g.v, s);
  const calls: LabAction[] = [
    { key: 'next', label: 'Next classmate', tone: 'brand', blocked: w.at >= g.v.disc.n - 1 ? 'That was the last classmate.' : undefined, run: a.next },
    { key: 'prev', label: 'Previous classmate', blocked: w.at <= 0 ? 'This is the first classmate.' : undefined, run: a.prev },
  ];
  const roll: LabAction = { key: 'roll', label: now.tries ? `Let them try again (attempt ${now.tries + 1})` : 'Ask them to roll the tongue into a U', tone: 'brand', blocked: now.roll === 'R' ? 'They can roll it.' : undefined, run: () => discActs.roll(ctx) };
  const card: LabAction = { key: 'card', label: 'Read their health card', blocked: firstBlock(need(ctx, 'cards'), now.card ? `Blood group ${now.card}.` : undefined), run: () => discActs.card(ctx) };
  if (id === 'classmate') return { title: `Classmate ${w.at + 1} of ${g.v.disc.n}`, info: `${now.roll ? (now.roll === 'R' ? 'Roller' : `Non-roller so far (${now.tries})`) : 'Not asked yet'} · card ${now.card ?? 'not read'}.`, actions: [roll, card, ...calls, { key: 'look', label: 'Look closely (survey)', run: readNow }] };
  if (id === 'cards') return { title: 'School health cards', info: 'Blood groups recorded by the school clinic, shared with consent. No blood is taken in class.', actions: [card, ...calls] };
  if (id === 'mirror') return { title: 'Hand mirror', info: 'Lets the classmate see their tongue.', actions: [roll] };
  if (id === 'sheet') return { title: 'Survey sheet', info: w.recordBy ? `Recording ${DISC_RECORD_LABEL[w.recordBy].toLowerCase()}.` : 'How will you record it?', actions: [...DISC_RECORD.map((r): LabAction => ({ key: r, label: `Record ${lc(DISC_RECORD_LABEL[r])}`, tone: r === 'NUMBER' ? 'brand' : undefined, blocked: w.recordBy === r ? 'Chosen.' : undefined, run: () => a.recordBy(r) })), { key: 'open', label: 'Open the notebook', run: () => ctx.open('notebook') }] };
  if (id === 'protractor') return { title: 'Protractor', info: 'For drawing the pie-chart angles (in your notebook).', actions: [{ key: 'open', label: 'Open the notebook', run: () => ctx.open('notebook') }] };
  return null;
}

// ------------------------------------------------------------------ cross

export const crossActs = {
  draw(ctx: GenCtx, k: number) {
    const n = ctx.g.cross.draw(k);
    if (!n) return notify(ctx.g.ref.current.cross.fill ? 'The beakers have run out of beads — return them after each draw.' : 'Fill the beakers first.', 'warning', 3600);
    const l = lastPair(ctx.g.ref.current, ctx.g.v.seed);
    if (l) notify(n === 1 ? `Draw ${l.n}: ${l.p.a ? 'red' : 'white'} + ${l.p.b ? 'red' : 'white'} → ${l.p.g}.` : `${n} more pairs drawn (${l.n} in all). Count each batch on the tally sheet.`, 'success', 3000);
  },
};
function crossPanel(id: string, ctx: GenCtx): ObjectPanel | null {
  const { g, s } = ctx;
  const w = s.cross;
  const a = g.cross;
  const draws: LabAction[] = [
    { key: 'd1', label: 'Draw a pair (one bead from each)', tone: 'brand', blocked: firstBlock(need(ctx, 'beakers'), !w.fill ? 'Fill the beakers first.' : undefined), run: () => crossActs.draw(ctx, 1) },
    { key: 'd10', label: 'Draw 10 pairs', blocked: firstBlock(need(ctx, 'beakers'), !w.fill ? 'Fill the beakers first.' : undefined), run: () => crossActs.draw(ctx, 10) },
  ];
  const how: LabAction[] = [
    w.blind ? { key: 'peek', label: 'Look into the beaker while picking', run: () => a.blind(false) } : { key: 'blind', label: 'Pick without looking', tone: 'brand', run: () => a.blind(true) },
    w.back ? { key: 'keep', label: 'Keep the beads out after drawing', run: () => a.back(false) } : { key: 'back', label: 'Return the beads and shake after each draw', tone: 'brand', run: () => a.back(true) },
  ];
  if (id === 'beads' || ((id === 'beakerA' || id === 'beakerB') && !w.fill))
    return { title: 'Filling the beakers', info: 'Each beaker stands for one parent’s gametes.', actions: CROSS_FILLS.map((f): LabAction => ({ key: f, label: CROSS_FILL_LABEL[f], tone: f === 'EQUAL' ? 'brand' : undefined, blocked: firstBlock(need(ctx, 'beakers'), need(ctx, 'beads')), run: () => a.fill(f) })) };
  if (id === 'beakerA' || id === 'beakerB') return { title: id === 'beakerA' ? 'Beaker A (parent 1)' : 'Beaker B (parent 2)', info: `${w.draws.length} draws so far. ${w.blind ? 'Without looking' : 'Looking'}; ${w.back ? 'returned and shaken' : 'kept out'}.`, actions: [...draws, ...how, { key: 'look', label: 'Look closely (tally)', run: readNow }] };
  if (id === 'tray') {
    const l = lastPair(s, g.v.seed);
    return { title: 'Tray', info: l ? `Draw ${l.n}: ${l.p.g}.` : 'The pair drawn lands here.', actions: [...draws, { key: 'look', label: 'Look closely (tally)', run: readNow }] };
  }
  if (id === 'sheet') return { title: 'Tally sheet', info: 'Ten draws to a batch.', actions: [{ key: 'look', label: 'See the pairs drawn', run: readNow }, { key: 'open', label: 'Open the notebook', tone: 'brand', run: () => ctx.open('notebook') }] };
  return null;
}

// ------------------------------------------------------------------ food

export const foodActs = {
  survey(ctx: GenCtx, spot: FoodSpot) {
    ctx.g.food.survey(spot);
    const sh = FOOD_SPOT_SHOWS[spot];
    notify(`${FOOD_SPOT_LABEL[spot]}: ${sh.count.map((o) => `${FOOD_ORG_LABEL[o].toLowerCase()} ${ctx.g.v.food.counts[o]}`).join(', ')}. ${sh.notes[0]}`, 'info', 4800);
  },
};
function foodPanel(id: string, ctx: GenCtx): ObjectPanel | null {
  const { g, s } = ctx;
  const w = s.food;
  if (id.startsWith('spot:')) {
    const sp = id.slice(5) as FoodSpot;
    const seen = w.visited.includes(sp);
    return { title: FOOD_SPOT_LABEL[sp], info: seen ? FOOD_SPOT_SHOWS[sp].notes.join(' ') : 'Not surveyed yet.', actions: [{ key: 'survey', label: 'Survey this spot (count and watch the feeding)', tone: 'brand', blocked: firstBlock(need(ctx, 'net'), seen ? 'Surveyed.' : undefined), run: () => foodActs.survey(ctx, sp) }, { key: 'look', label: 'Look closely (all the field notes)', run: readNow }] };
  }
  if (id === 'gloves') return { title: 'Gloves', info: 'With covered shoes, for the field: stinging insects and thorns.', actions: [{ key: 'on', label: 'Put on covered shoes and gloves', tone: 'brand', blocked: w.gloves ? 'Wearing them.' : undefined, run: g.food.gloves }] };
  if (id === 'net') return { title: 'Sweep net', info: 'Swept through the grass to catch insects for counting; released afterwards.', actions: [{ key: 'look', label: 'Look at the field notes', tone: 'brand', run: readNow }] };
  if (id === 'lens' || id === 'idchart') return { title: id === 'lens' ? 'Hand lens' : 'Identification chart', info: 'To identify what you catch and see.', actions: [{ key: 'look', label: 'Look at the field notes', run: readNow }] };
  return null;
}

// ------------------------------------------------------------------ all objects

export function genObjectPanel(id: string, ctx: GenCtx): ObjectPanel | null {
  const { g, s, scene } = ctx;
  const task = s.task ?? 'HEIGHT';
  if (id.startsWith('cup:')) {
    const a = id.slice(4) as GenApparatusId;
    return { title: GEN_APPARATUS_LABEL[a], info: 'In the apparatus cupboard.', actions: [{ key: 'take', label: 'Take to my bench', tone: 'brand', run: () => (g.note(`collect:${a}`), setView({ selected: null }), notify(`${GEN_APPARATUS_LABEL[a]} is on your bench.`, 'success', 1500)) }] };
  }
  const room = bioRoomPanel(id, {
    coat: scene.coat,
    goggles: scene.goggles,
    note: g.note,
    open: ctx.open,
    benchInfo: 'Bench 2: your apparatus, the task card and your notebook.',
    whiteboard: task === 'DISCRETE' ? 'Today: discontinuous variation. Anonymous records; no blood samples.' : task === 'CROSS' ? 'Today: a model monohybrid cross. Without looking; return and shake.' : task === 'FOOD' ? 'Today: food chains and pyramids. Arrows from the eaten to the eater.' : 'Today: continuous variation. Shoes off, set square, eye level.',
  });
  if (room) return room;
  const panel = task === 'HEIGHT' ? heightPanel(id, ctx) : task === 'DISCRETE' ? discPanel(id, ctx) : task === 'CROSS' ? crossPanel(id, ctx) : foodPanel(id, ctx);
  if (panel) return panel;
  switch (id) {
    case 'card':
      return { title: 'Task card', actions: [{ key: 'read', label: 'Read the task card', tone: 'brand', run: () => ctx.open('task') }] };
    case 'book':
      return { title: 'Practical notebook', info: 'Your tables, charts and answers — this is what is marked.', actions: [{ key: 'open', label: 'Open the notebook', tone: 'brand', run: () => ctx.open('notebook') }] };
    case 'graph':
      return { title: 'Graph paper', info: 'Your charts are drawn in the notebook.', actions: [{ key: 'open', label: 'Open the notebook', tone: 'brand', run: () => ctx.open('notebook') }] };
  }
  const extra = GEN_APPARATUS.find((a) => a.id === id);
  if (extra) return { title: extra.label, info: extra.for.includes(task) ? undefined : 'Not needed for this practical.', actions: [{ key: 'return', label: 'Put back in the cupboard', run: () => (g.note(`return:${extra.id}`), setView({ selected: null })) }] };
  return null;
}

/** The hint for practice mode with guided mode off (the 2D lab's hint, plus the 3D set-up steps first). */
export function genHint3d(ctx: GenCtx, plain: string): string {
  const { scene, s } = ctx;
  const task = s.task ?? 'HEIGHT';
  if (!scene.coat) return 'Put on a lab coat: it hangs on the hooks by the door.';
  const missing = neededFor(task).filter((a) => !scene.collected.has(a.id));
  if (missing.length) return `Collect from the apparatus cupboard: ${missing.map((a) => lc(a.label)).join(', ')}.`;
  return plain;
}
