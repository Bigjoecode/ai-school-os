import { PREP_ACTIONS, dsRun, dsThermometer, prepTubeTask, prepTubeText, prepTubes, stdRun, type ChemPrepState, type PrepActionDef } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import type { Prep } from '../actions';
import { meniscusText, prepReadout } from '../readout';
import { FOCUS_OF, usePrepBench } from './bench';
import { PREP_MISTAKES } from './guide';
import { OBJ_NEEDS, PREP_APPARATUS, PREP_APPARATUS_LABEL, neededFor, type PrepApparatusId, type PrepScene } from './scene-state';
import { PREP_HALIDES, PREP_REAGENTS } from './station';

/**
 * What can be done with each object on the bench. Every action is a button
 * (PREP_ACTIONS, the same list as the 2D lab); a blocked one says why. The
 * 3D-only steps (safety, apparatus) are log notes without marks.
 */

export interface PrepCtx {
  o: Prep;
  s: ChemPrepState;
  scene: PrepScene;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}
const setView = (p: Parameters<ReturnType<typeof useLabView.getState>['set']>[0]) => useLabView.getState().set(p);
const lc = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
export const activeTube = (s: ChemPrepState) => {
  const n = prepTubeTask(s.task ?? 'STANDARD') ? prepTubes(s.task!, s.events).length : 0;
  const a = usePrepBench.getState().active;
  return a >= 0 && a < n ? a : n - 1;
};

function needs(ctx: PrepCtx, d: PrepActionDef): string | undefined {
  const app = OBJ_NEEDS[d.obj] ?? (d.tube ? 'rack' : undefined);
  if (app && !ctx.scene.collected.has(app)) return `Get the ${lc(PREP_APPARATUS_LABEL[app])} from the apparatus cupboard first.`;
  if (d.a === 'POUR' && !ctx.scene.collected.has('funnel')) return 'Get a filter funnel to pour through.';
  if ((d.a === 'FILL' || d.a === 'RINSE') && !ctx.scene.collected.has('washBottle')) return 'Get the wash bottle from the cupboard.';
  return undefined;
}

/** Does one bench action, with its sound, its camera framing and (for a mistake) a warning. */
export function doPrep(ctx: PrepCtx, d: PrepActionDef) {
  const tube = activeTube(ctx.s);
  const before = prepTubeTask(ctx.s.task ?? 'STANDARD') ? prepTubes(ctx.s.task!, ctx.s.events).length : 0;
  if (!ctx.o.act(d, tube)) return;
  if (d.a === 'TUBE') usePrepBench.setState({ active: before });
  const m = PREP_MISTAKES[`${d.a}:${d.x ?? ''}`];
  if (m) notify(m.title, 'danger', 3200);
  play(m ? 'oops' : /HEAT|BATH/.test(d.a) ? 'tick' : /WEIGH|MIX|SHAKE|CLAMP/.test(d.a) ? 'clink' : 'drip');
  const focus = FOCUS_OF[d.obj] ?? (d.tube ? 'tube' : undefined);
  setView({ selected: null, ...(focus ? { focus } : {}) });
}

const ROOM: Record<string, (ctx: PrepCtx) => ObjectPanel> = {
  coat: ({ scene, o }) => ({ title: 'Lab coat', info: 'Wear a buttoned lab coat in the laboratory.', actions: [scene.coat ? { key: 'off', label: 'Take off the lab coat', run: () => o.note('safety-off:coat') } : { key: 'on', label: 'Put on the lab coat', tone: 'brand', run: () => (o.note('safety:coat'), setView({ selected: null })) }] }),
  goggles: ({ scene, o }) => ({ title: 'Safety goggles', info: 'Protect your eyes the whole time.', actions: [scene.goggles ? { key: 'off', label: 'Take off the goggles', run: () => o.note('safety-off:goggles') } : { key: 'on', label: 'Put on the goggles', tone: 'brand', run: () => (o.note('safety:goggles'), setView({ selected: null })) }] }),
  cupboard: (ctx) => ({ title: 'Apparatus cupboard', info: 'Choose the apparatus you need.', actions: [{ key: 'list', label: 'Choose apparatus…', tone: 'brand', run: () => ctx.open('cupboard') }] }),
  mybench: () => ({
    title: 'Your bench',
    info: 'Your reagents, the task card and your notebook are here.',
    actions: useLabView.getState().mode === 'walk' ? [{ key: 'sit', label: 'Work at my bench', tone: 'brand', run: () => setView({ mode: 'bench', focus: 'bench', selected: null }) }] : [{ key: 'stand', label: 'Stand up and walk', run: () => setView({ mode: 'walk', selected: null }) }],
  }),
  shelf: () => ({ title: 'Reagent shelf', info: 'Stock solutions. What you need is on your own bench.', actions: [] }),
  fume: () => ({ title: 'Fume cupboard', info: 'Chlorine, bromine, ammonia and concentrated acids are handled here or near an open window.', actions: [] }),
  extinguisher: () => ({ title: 'Fire extinguisher', info: 'Hexane burns: know where this is.', actions: [] }),
  firstaid: () => ({ title: 'First-aid box', info: 'Report every burn or splash to the teacher.', actions: [] }),
  eyewash: () => ({ title: 'Eye-wash station', info: 'If anything splashes in your eyes, rinse them here for 10 minutes and tell the teacher.', actions: [] }),
  whiteboard: () => ({ title: 'Whiteboard', info: 'Today’s practical and its key points.', actions: [] }),
  desk: () => ({ title: 'Teacher’s desk', info: 'Tap Mrs Ada for help with the next step.', actions: [] }),
  card: (ctx) => ({ title: 'Task card', actions: [{ key: 'read', label: 'Read the task card', tone: 'brand', run: () => ctx.open('task') }] }),
  book: (ctx) => ({ title: 'Practical notebook', info: 'Your observations, readings, calculation and answers.', actions: [{ key: 'open', label: 'Open the notebook', tone: 'brand', run: () => ctx.open('notebook') }] }),
  stockJar: () => ({ title: 'Anhydrous sodium trioxocarbonate(IV)', info: 'A primary standard: pure, stable, not hygroscopic. Take it with the spatula into the weighing bottle.', actions: [] }),
  washBottle: () => ({ title: 'Wash bottle and dropper', info: 'Distilled water for dissolving, rinsing and making up. The last drops go in with the dropper.', actions: [] }),
  chromate: () => ({ title: 'Potassium chromate(VI)', info: 'Yellow. Toxic: avoid skin contact; waste into the residue bottle.', actions: [] }),
  tile: () => ({ title: 'White tile', info: 'Hold tubes against it to compare colours with the control.', actions: [] }),
  seawater: () => ({ title: 'Sea water', info: 'About 3.5% dissolved salt, with some sand.', actions: [] }),
  testKit: () => ({ title: 'Litmus and conc. HCl', info: 'Red litmus paper (dip it in water to make it damp) and a glass rod for the concentrated HCl. The tests are done at the mouth of the gas jar.', actions: [] }),
};

const INFO: Record<string, (ctx: PrepCtx) => string | undefined> = {
  balance: (ctx) => prepReadout(ctx.o.v, ctx.s, -1)[0],
  flask: (ctx) => `Flask 1: ${meniscusText(stdRun(ctx.o.v, ctx.s.events).f1, stdRun(ctx.o.v, ctx.s.events).f1.eye)}.`,
  flask2: (ctx) => `Flask 2: ${meniscusText(stdRun(ctx.o.v, ctx.s.events).f2, stdRun(ctx.o.v, ctx.s.events).f2.eye)}.`,
  thermometer: (ctx) => {
    const r = dsRun(ctx.o.v, ctx.s.events);
    return r.thermo ? `It reads ${dsThermometer(ctx.o.v, r).toFixed(1)} °C (read to the nearest 0.5 °C).` : 'Fit it in the neck of the flask.';
  },
};

export function prepObjectPanel(id: string, ctx: PrepCtx): ObjectPanel | null {
  const { o, s } = ctx;
  const task = s.task ?? o.v.task;
  if (id.startsWith('cup:')) {
    const a = id.slice(4) as PrepApparatusId;
    return { title: PREP_APPARATUS_LABEL[a], info: 'In the apparatus cupboard.', actions: [{ key: 'take', label: 'Take to my bench', tone: 'brand', run: () => (o.note(`collect:${a}`), play('clink'), setView({ selected: null }), notify(`${PREP_APPARATUS_LABEL[a]} is on your bench.`, 'success', 1500)) }] };
  }
  if (ROOM[id]) return ROOM[id]!(ctx);
  const tube = activeTube(s);
  const defs = PREP_ACTIONS[task].filter((d) => d.obj === id || (id === 'tube' && d.tube && (d.a === 'SHAKE' || d.a === 'BATH')));
  const actions: LabAction[] = defs.map((d) => ({ key: `${d.a}-${d.x}-${d.n}`, label: d.label, tone: d.tone, blocked: needs(ctx, d) ?? o.blocked(d, tube), run: () => doPrep(ctx, d) }));
  let title = id;
  let info: string | undefined = INFO[id]?.(ctx);
  if (id.startsWith('reagent:')) {
    const b = prepTubeTask(task) ? PREP_REAGENTS[task as 'LECHAT' | 'HALOGEN'].find((x) => `reagent:${x.id}` === id) : undefined;
    title = b?.name ?? id;
    info = `${b?.info ?? ''}${tube >= 0 ? ` Tube in use: ${tube + 1}.` : ' Take a clean tube first.'}`;
  } else if (id.startsWith('halide:')) title = PREP_HALIDES.find((x) => `halide:${x.id}` === id)?.name ?? id;
  if (prepTubeTask(task) && (id === 'rack' || id === 'tube')) {
    const tubes = prepTubes(task, s.events);
    title = id === 'rack' ? 'Test tubes' : `Tube ${tube + 1}: ${tubes[tube] ? prepTubeText(task, tubes[tube]!) : ''}`;
    if (id === 'tube') info = prepReadout(o.v, s, tube).slice(2).join(' ');
    if (id === 'rack') for (let i = 0; i < tubes.length; i++) actions.push({ key: `pick-${i}`, label: `Use tube ${i + 1}: ${prepTubeText(task, tubes[i]!)}`, run: () => (usePrepBench.setState({ active: i }), setView({ selected: 'tube', focus: 'tube' })) });
    if (id === 'tube') actions.push({ key: 'nb', label: 'Write it in my notebook', run: () => ctx.open('notebook') });
  }
  if (!defs.length && !actions.length) {
    const extra = PREP_APPARATUS.find((a) => a.id === id);
    if (extra) return { title: extra.label, info: extra.for.includes(task) ? undefined : 'Not needed for this practical.', actions: [{ key: 'return', label: 'Put back in the cupboard', run: () => (o.note(`return:${extra.id}`), setView({ selected: null })) }] };
    return null;
  }
  const names: Record<string, string> = { bottle: 'Weighing bottle', balance: 'Electronic balance', beaker: 'Beaker and glass rod', flask: 'Volumetric flask 1', flask2: 'Volumetric flask 2', pipette: '25.0 cm³ pipette', stock: 'Fe³⁺/SCN⁻ mixture', hot: 'Hot water', ice: 'Iced water', funnel: 'Filter funnel', dish: 'Evaporating dish', dflask: 'Distillation flask', thermometer: 'Thermometer', condenser: 'Liebig condenser', receiver: 'Receiver', mortar: 'The two solids', gtube: 'Hard-glass tube', dryer: 'Drying tower', jar: 'Gas jar', trough: 'Fountain' };
  return { title: names[id] ?? title, info, actions };
}

/** The hint for practice mode with guided mode off (the 2D hint, plus the 3D set-up steps first). */
export function prepHint3d(ctx: PrepCtx, plain: string): string {
  const { scene, s } = ctx;
  if (!scene.coat || !scene.goggles) return 'Put on a lab coat and goggles: they hang on the hooks by the door.';
  const missing = neededFor(s.task ?? 'STANDARD').filter((a) => !scene.collected.has(a.id));
  if (missing.length) return `Collect from the apparatus cupboard: ${missing.map((a) => lc(a.label)).join(', ')}.`;
  return plain;
}
