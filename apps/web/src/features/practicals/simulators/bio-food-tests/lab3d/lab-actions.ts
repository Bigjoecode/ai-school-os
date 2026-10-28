import {
  AMY_BATH_LABEL,
  AMY_BATH_SHORT,
  AMY_MAX_CLOCK,
  AMY_MAX_TUBES,
  FOOD_LETTERS,
  FOOD_TESTS,
  FOOD_TEST_INFO,
  foodObserve,
  foodTestText,
  type AmyBath,
  type BioFoodState,
  type FoodSample,
  type FoodStep,
  type FoodTestId,
} from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { bioRoomPanel } from '../../bio-common/lab3d/common';
import { HEAT_MAX, type FoodTests } from '../actions';
import { useFoodBench } from './bench';
import { FOOD_APPARATUS, FOOD_APPARATUS_LABEL, neededFor, type FoodApparatusId, type FoodScene } from './scene-state';
import { FOOD_BOTTLES } from './station';

/**
 * What can be done with each object on the food-tests bench. Every action is
 * a button; a blocked one says why. Marked changes go through the shared
 * actions (the same as the 2D lab); the 3D-only steps (safety, apparatus,
 * the burner, hand washing) are log notes.
 */

export interface FoodCtx {
  f: FoodTests;
  s: BioFoodState;
  scene: FoodScene;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}
const setView = (p: Parameters<ReturnType<typeof useLabView.getState>['set']>[0]) => useLabView.getState().set(p);
const lc = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);

/** Why a test can't be started now (null: it can). */
function blockedStart(ctx: FoodCtx, test: FoodTestId): string | undefined {
  const { scene } = ctx;
  if (!scene.collected.has('rack')) return 'Get the test tubes from the apparatus cupboard first.';
  if (test === 'GREASE' && !scene.collected.has('paper')) return 'Get a filter paper from the cupboard.';
  return undefined;
}
/** Why a tube can't be heated in the water bath now. */
function blockedHeat(ctx: FoodCtx): string | undefined {
  const { scene } = ctx;
  if (!scene.collected.has('burner')) return 'Get the water bath (beaker, tripod, gauze and Bunsen burner) from the cupboard.';
  if (!scene.burnerOn) return 'Light the Bunsen burner under the water bath first, and wait for the water to boil.';
  if (!scene.collected.has('holder')) return 'Get a test-tube holder: never hold a hot tube with your fingers.';
  return undefined;
}

/** Starts a test (and its first addition, when the bottle used is that addition's). */
export function startTest(ctx: FoodCtx, sample: FoodSample, test: FoodTestId, first?: FoodStep) {
  const i = ctx.f.doTest(sample, test);
  if (i < 0) return notify('The rack is full: discard a test you no longer need.', 'warning');
  if (first) ctx.f.addStep(i, first);
  useFoodBench.setState({ active: i, anim: null });
  setView({ selected: 'tube', focus: 'tube' });
  play('drip');
  if ((test === 'EMULSION' || test === 'SUDAN') && ctx.scene.burnerOn) {
    const first = !ctx.s.log.some((e) => e.a.startsWith('flammable-near-flame'));
    ctx.f.note(`flammable-near-flame:${i + 1}`);
    if (first) notify('Ethanol and Sudan III are flammable: keep them well away from the lit burner.', 'warning', 3200);
  }
}
/** Heats the tube in use (an animated run of its colour). */
export function heatTube(ctx: FoodCtx, i: number, sec: number, direct = false) {
  const t = ctx.s.tests[i];
  if (!t) return;
  useFoodBench.setState({ active: i, anim: { i, from: t.heat, at: performance.now() } });
  ctx.f.heat(i, sec, direct);
  setView({ selected: null, focus: direct ? 'tube' : 'bath' });
  play(direct ? 'oops' : 'tick');
  if (direct) notify('Heated straight over the flame, the liquid can boil over and spurt out of the tube. Use the boiling water bath.', 'danger', 3600);
}

const testLabel = (t: FoodTestId) => FOOD_TEST_INFO[t].label;
const tubeOf = (ctx: FoodCtx) => {
  const i = useFoodBench.getState().active;
  return { i, t: ctx.s.tests[i] };
};
/** The addition this bottle makes to the tube in use, if it needs one. */
function nextStepFrom(ctx: FoodCtx, bottle: string): { i: number; step: FoodStep; label: string } | null {
  const { i, t } = tubeOf(ctx);
  if (!t) return null;
  const want: Partial<Record<string, FoodStep>> = { HCL: 'ACID', NAHCO3: 'NEUTRALISE', BENEDICT: 'BENEDICT', NAOH: 'NAOH', CUSO4: 'CUSO4', ETHANOL: 'ETHANOL' };
  const step = want[bottle];
  const info = FOOD_TEST_INFO[t.test].steps.find((x) => x.id === step);
  if (!step || !info || t.steps.includes(step)) return null;
  return { i, step, label: info.label };
}

function amyPanel(id: string, ctx: FoodCtx): ObjectPanel | null {
  const { f, s, scene } = ctx;
  const mixed = s.clock !== null;
  const needRack = !scene.collected.has('rack') ? 'Get the test tubes from the apparatus cupboard first.' : undefined;
  const spotBlocked = !scene.collected.has('tile') ? 'Get the spotting tile from the cupboard.' : !s.tile ? 'Put iodine in the wells of the spotting tile first.' : !mixed ? 'Mix the saliva into the starch and start the stopwatch first.' : undefined;
  const benAction = (i: number): LabAction => ({
    key: `ben-${i}`,
    label: `Benedict's test on the mixture in tube ${i + 1}`,
    blocked: !mixed ? 'Mix first: then test some of the mixture.' : needRack,
    run: () => startTest(ctx, String(i + 1) as FoodSample, 'BENEDICT'),
  });
  const spotOne = (i: number): LabAction => ({
    key: `spot-${i}`,
    label: `A drop of tube ${i + 1} on a fresh iodine well`,
    blocked: spotBlocked ?? (s.spots.some((x) => x.tube === i && x.t === s.clock) ? `Already tested at ${s.clock} s: wait, then test again.` : undefined),
    run: () => (f.spot(i), play('drip'), setView({ focus: 'tile' })),
  });
  const addTube = (b: AmyBath, boiled: boolean): LabAction => ({
    key: `add-${b}-${boiled}`,
    label: boiled ? 'Add a control tube: starch + boiled saliva' : 'Add a tube: 5 cm³ starch, and 1 cm³ saliva in a separate tube',
    blocked: mixed ? 'The tubes are already mixed and timing.' : needRack ?? (s.tubes.length >= AMY_MAX_TUBES ? 'Six tubes is the most the stopwatch can follow.' : b === 'BOILING' && !scene.burnerOn ? 'Light the burner under the water bath first.' : undefined),
    run: () => (f.addTube(b, boiled), play('clink')),
  });
  if (id.startsWith('amybath:') || (id === 'bath' && s.task === 'AMYLASE')) {
    const b = (id === 'bath' ? 'BOILING' : id.slice(8)) as AmyBath;
    const here = s.tubes.map((t, i) => ({ t, i })).filter((x) => x.t.bath === b);
    const actions: LabAction[] = [addTube(b, false)];
    if (b === 'BODY') actions.push(addTube(b, true));
    if (id === 'bath') actions.unshift(scene.burnerOn ? { key: 'off', label: 'Turn off the burner', run: () => f.note('burner-off') } : { key: 'on', label: 'Light the burner', tone: 'brand', run: () => (f.note('burner-on'), play('creak')) });
    if (!mixed && here.length) actions.push({ key: 'remove', label: `Take out tube ${here.at(-1)!.i + 1}`, run: () => f.removeTube(here.at(-1)!.i) });
    for (const x of here) actions.push(spotOne(x.i));
    for (const x of here) actions.push(benAction(x.i));
    return {
      title: AMY_BATH_LABEL[b],
      info: `${here.length ? `Tubes here: ${here.map((x) => `${x.i + 1}${x.t.boiled ? ' (boiled saliva)' : ''}`).join(', ')}. ` : 'No tubes in this bath yet. '}${scene.collected.has('thermometer') ? `The thermometer reads ${b === 'BOILING' && !scene.burnerOn ? AMY_BATH_SHORT.ROOM : `${f.v.amy.temps[b]} °C`}.` : 'Get a thermometer to check its temperature.'}`,
      actions,
    };
  }
  switch (id) {
    case 'tile':
      return {
        title: 'Spotting tile',
        info: s.tile ? 'Each row is a tube; each well a drop tested on iodine. Blue-black: starch is still there. Yellow-brown: no starch (the end point).' : 'A white glazed tile with wells.',
        actions: [
          { key: 'iodine', label: 'Put a drop of iodine in each well', tone: 'brand', blocked: s.tile ? 'Done.' : undefined, run: () => (f.setTile(), play('drip')) },
          { key: 'all', label: `Test a drop of every mixture now${mixed ? ` (${s.clock} s)` : ''}`, blocked: spotBlocked ?? (s.tubes.every((_, i) => s.spots.some((x) => x.tube === i && x.t === s.clock)) ? `Every tube is tested at ${s.clock} s: wait 30 s.` : undefined), run: () => (f.spot('all'), play('drip')) },
        ],
      };
    case 'stopwatch':
      return {
        title: s.clock === null ? 'Stopwatch' : `Stopwatch: ${s.clock} s`,
        info: s.clock === null ? (s.equilibrated ? 'The tubes are at their bath temperatures: pour each saliva into its starch and start timing.' : 'Leave the starch and saliva in their baths for 5 minutes before mixing, so they reach the temperature.') : 'Test a drop of each mixture every 30 seconds.',
        actions:
          s.clock === null
            ? [
                { key: 'eq', label: 'Leave the tubes 5 minutes in their baths', blocked: !s.tubes.length ? 'Set up the tubes first.' : s.equilibrated ? 'Done: they are at the bath temperatures.' : !scene.collected.has('thermometer') ? 'Get a thermometer to check the bath temperatures.' : undefined, run: () => (f.equilibrate(), play('tick'), notify('Five minutes later: each tube is at its bath’s temperature.', 'success', 2200)) },
                { key: 'mix', label: 'Mix each saliva into its starch and start the stopwatch', tone: 'brand', blocked: !s.tubes.length ? 'Set up the tubes first.' : undefined, run: () => (f.mix(), play('tick')) },
              ]
            : [
                { key: 'w30', label: 'Wait 30 s', tone: 'brand', blocked: s.clock >= AMY_MAX_CLOCK ? 'Twenty minutes is the end of the experiment.' : undefined, run: () => (f.wait(30), play('tick')) },
                { key: 'w60', label: 'Wait 1 min', blocked: s.clock >= AMY_MAX_CLOCK ? 'Twenty minutes is the end of the experiment.' : undefined, run: () => (f.wait(60), play('tick')) },
                { key: 'all', label: 'Test a drop of every mixture now', blocked: spotBlocked, run: () => (f.spot('all'), play('drip')) },
              ],
      };
    case 'starch':
      return { title: '1% starch solution', info: '5 cm³ goes into a tube in each bath.', actions: [] };
    case 'saliva':
      return { title: 'Saliva solution', info: 'Your own saliva, rinsed out with water and diluted. Boil some in a tube to make the control.', actions: [] };
    case 'thermometer':
      return { title: 'Thermometer', info: `Ice bath ${f.v.amy.temps.ICE} °C · room ${f.v.amy.temps.ROOM} °C · ${f.v.amy.temps.BODY} °C · ${f.v.amy.temps.WARM} °C${scene.burnerOn ? ` · boiling ${f.v.amy.temps.BOILING} °C` : ''}.`, actions: [] };
  }
  if (id.startsWith('bottle:')) {
    const b = id.slice(7);
    if (b === 'IODINE') return { title: 'Iodine solution', info: 'Iodine is yellow-brown; it turns blue-black with starch.', actions: [{ key: 'tile', label: 'A drop in each well of the spotting tile', tone: 'brand', blocked: !scene.collected.has('tile') ? 'Get the spotting tile from the cupboard.' : s.tile ? 'Done.' : undefined, run: () => (f.setTile(), play('drip')) }] };
    if (b === 'BENEDICT') {
      const add = nextStepFrom(ctx, 'BENEDICT');
      return { title: "Benedict's solution", info: 'Blue; heated with a reducing sugar it turns green, yellow, orange or brick-red.', actions: [...(add ? [{ key: 'step', label: add.label, run: () => (f.addStep(add.i, add.step), play('drip')) }] : []), ...s.tubes.map((_, i) => benAction(i))] };
    }
  }
  return null;
}

export function foodObjectPanel(id: string, ctx: FoodCtx): ObjectPanel | null {
  const { f, s, scene } = ctx;
  const task = s.task ?? 'FOOD';
  if (id.startsWith('cup:')) {
    const a = id.slice(4) as FoodApparatusId;
    return {
      title: FOOD_APPARATUS_LABEL[a],
      info: 'In the apparatus cupboard.',
      actions: [{ key: 'take', label: 'Take to my bench', tone: 'brand', run: () => (f.note(`collect:${a}`), play('clink'), setView({ selected: null }), notify(`${FOOD_APPARATUS_LABEL[a]} is on your bench.`, 'success', 1500)) }],
    };
  }
  const room = bioRoomPanel(id, { coat: scene.coat, goggles: scene.goggles, note: f.note, open: ctx.open, benchInfo: task === 'AMYLASE' ? 'Bench 2: the baths, starch, saliva, iodine, the task card and your notebook are here.' : 'Bench 2: samples P, Q and R, the reagents, the task card and your notebook are here.', whiteboard: task === 'AMYLASE' ? 'Today: salivary amylase. A drop on iodine every 30 s; the end point is when it stays yellow-brown.' : "Today: food tests. Benedict's goes in the boiling water bath — never straight over the flame." });
  if (id === 'goggles' && room) return { ...room, info: 'Wear them whenever you heat tubes or use sodium hydroxide, acid or Millon’s reagent.' };
  if (room) return room;
  if (task === 'AMYLASE') {
    const p = amyPanel(id, ctx);
    if (p) return p;
  }

  if (id.startsWith('sample:')) {
    const x = id.slice(7) as FoodSample;
    const sm = f.v.samples.find((y) => y.letter === x);
    return { title: `Sample ${x}`, info: sm ? `${sm.food.describe.charAt(0).toUpperCase()}${sm.food.describe.slice(1)}. Put about 2 cm³ in a clean test tube for each test.` : undefined, actions: FOOD_TESTS.map((t) => ({ key: `t-${t}`, label: testLabel(t), blocked: blockedStart(ctx, t), run: () => startTest(ctx, x, t) })) };
  }
  if (id.startsWith('bottle:')) {
    const b = FOOD_BOTTLES.find((y) => y.id === id.slice(7));
    if (!b) return null;
    const actions: LabAction[] = [];
    const add = nextStepFrom(ctx, b.id);
    if (add) actions.push({ key: 'step', label: `${add.label} (tube in use)`, tone: 'brand', blocked: add.step === 'ACID' ? blockedHeat(ctx) : undefined, run: () => (f.addStep(add.i, add.step), play('drip')) });
    const starts: Partial<Record<string, [FoodTestId, FoodStep | undefined]>> = { IODINE: ['IODINE', undefined], BENEDICT: ['BENEDICT', undefined], HCL: ['NONREDUCING', 'ACID'], NAOH: ['BIURET', 'NAOH'], MILLON: ['MILLON', undefined], SUDAN: ['SUDAN', undefined], ETHANOL: ['EMULSION', 'ETHANOL'] };
    const st = starts[b.id];
    if (st)
      for (const x of FOOD_LETTERS)
        actions.push({ key: `s-${x}`, label: `${st[0] === 'NONREDUCING' ? 'Non-reducing sugar test' : FOOD_TEST_INFO[st[0]].short} on ${x}`, blocked: blockedStart(ctx, st[0]) ?? (st[1] === 'ACID' ? blockedHeat(ctx) : undefined), run: () => startTest(ctx, x, st[0], st[1]) });
    const info: Record<string, string> = {
      IODINE: 'Yellow-brown; turns blue-black with starch.',
      BENEDICT: 'Blue (copper(II) sulphate in alkali). Heated with a reducing sugar: green, yellow, orange or a brick-red precipitate.',
      HCL: 'Corrosive. Boiled with the sample it hydrolyses a non-reducing sugar.',
      NAHCO3: 'Neutralises the acid (it fizzes) before Benedict’s is added.',
      NAOH: 'Corrosive: wear goggles. The first Biuret reagent.',
      CUSO4: 'Only two drops: too much blue hides the violet.',
      MILLON: 'Contains mercury: toxic. A white precipitate turning brick-red on warming shows protein.',
      SUDAN: 'A red dye that stains fats and oils. Flammable (in ethanol).',
      ETHANOL: 'Flammable: keep it away from the burner.',
    };
    return { title: b.name, info: info[b.id] ?? (actions.length ? 'Choose what to add it to.' : undefined), actions };
  }

  switch (id) {
    case 'cupboard':
      return { title: 'Apparatus cupboard', info: 'Choose the apparatus you need.', actions: [{ key: 'list', label: 'Choose apparatus…', tone: 'brand', run: () => ctx.open('cupboard') }] };
    case 'card':
      return { title: 'Task card', actions: [{ key: 'read', label: 'Read the task card', tone: 'brand', run: () => ctx.open('task') }] };
    case 'book':
      return { title: 'Practical notebook', info: task === 'AMYLASE' ? 'Your results table, the Benedict’s test, the optimum and your answers.' : 'Your TEST | OBSERVATION | INFERENCE table, the food substances in P, Q and R and your answers.', actions: [{ key: 'open', label: 'Open the notebook', tone: 'brand', run: () => ctx.open('notebook') }] };
    case 'bath':
      return {
        title: 'Boiling water bath',
        info: scene.burnerOn ? 'The water is boiling. Stand a tube in it with the holder.' : 'A beaker of water on a tripod and gauze over the Bunsen burner.',
        actions: [scene.burnerOn ? { key: 'off', label: 'Turn off the burner', run: () => f.note('burner-off') } : { key: 'on', label: 'Light the burner', tone: 'brand', run: () => (f.note('burner-on'), play('creak')) }],
      };
    case 'rack': {
      const picks = s.tests.map((t, i): LabAction => ({ key: `pick-${i}`, label: `Test ${i + 1}: ${t.sample} — ${FOOD_TEST_INFO[t.test].short}`, run: () => (useFoodBench.setState({ active: i, anim: null }), setView({ selected: 'tube', focus: 'tube' })) }));
      return { title: 'Test tubes', info: s.tests.length ? 'Pick a tube to look at it again or carry on with it.' : 'Clean test tubes: one for each test.', actions: picks };
    }
    case 'tube':
      return tubePanel(ctx);
    case 'holder':
      return { title: 'Test-tube holder', info: 'Grip a tube near its mouth to put it in or take it out of the hot water bath.', actions: [] };
    case 'paper':
      return { title: 'Filter paper', info: 'For the grease-spot test: rub a little of the sample on it, let it dry and hold it up to the light.', actions: [] };
    case 'cylinder':
      return { title: '10 cm³ measuring cylinder', info: 'Measures 2 cm³ of sample and equal volumes of reagent.', actions: [] };
  }
  const extra = FOOD_APPARATUS.find((a) => a.id === id);
  if (extra)
    return {
      title: extra.label,
      info: extra.for.includes(task) ? undefined : 'Not needed for this practical.',
      actions: [{ key: 'return', label: 'Put back in the cupboard', run: () => (f.note(`return:${extra.id}`), setView({ selected: null })) }],
    };
  return null;
}

function tubePanel(ctx: FoodCtx): ObjectPanel | null {
  const { f, s } = ctx;
  const { i, t } = tubeOf(ctx);
  if (!t) return null;
  const out = foodObserve(f.v, s, t);
  const info = FOOD_TEST_INFO[t.test];
  const actions: LabAction[] = info.steps
    .filter((st) => !t.steps.includes(st.id))
    .map((st) => ({ key: `step-${st.id}`, label: st.label, blocked: st.id === 'ACID' ? blockedHeat(ctx) : undefined, run: () => (f.addStep(i, st.id), play('drip')) }));
  const canHeat = info.heats && (t.test !== 'NONREDUCING' || t.steps.includes('BENEDICT'));
  if (canHeat) {
    const full = t.heat >= HEAT_MAX ? 'It has been heated long enough.' : undefined;
    actions.push({ key: 'bath60', label: 'Stand it in the boiling water bath for 1 minute', tone: 'brand', blocked: blockedHeat(ctx) ?? full, run: () => heatTube(ctx, i, 60) });
    actions.push({ key: 'bath30', label: '…for 30 seconds', blocked: blockedHeat(ctx) ?? full, run: () => heatTube(ctx, i, 30) });
    actions.push({ key: 'direct', label: 'Heat it directly over the flame', tone: 'danger', blocked: !ctx.scene.burnerOn ? 'The burner is not lit.' : full, run: () => heatTube(ctx, i, 30, true) });
  }
  actions.push({ key: 'notebook', label: 'Write it in my notebook', run: () => ctx.open('notebook') });
  actions.push({ key: 'discard', label: 'Discard this test', tone: 'danger', run: () => (f.discard(i), useFoodBench.setState({ active: -1, anim: null }), setView({ selected: null })) });
  const seen = out.parts.map((p) => p.text.charAt(0).toUpperCase() + p.text.slice(1)).join('. ');
  return { title: `Test ${i + 1}: ${foodTestText(s, t)}`, info: `What you see: ${seen}.${info.heats ? ` (${t.heat} s in the bath)` : ''}`, actions };
}

/** The hint for practice mode with guided mode off (the 2D lab's hint, plus the 3D set-up steps first). */
export function foodHint3d(ctx: FoodCtx, plain: string): string {
  const { scene, s } = ctx;
  const task = s.task ?? 'FOOD';
  if (!scene.coat || !scene.goggles) return 'Put on a lab coat and goggles: they hang on the hooks by the door.';
  const missing = neededFor(task).filter((a) => !scene.collected.has(a.id));
  if (missing.length) return `Collect from the apparatus cupboard: ${missing.map((a) => lc(a.label)).join(', ')}.`;
  if (!scene.burnerOn) return 'Light the Bunsen burner under the water bath so the water boils.';
  return plain;
}

/** The amylase baths that need a tube for full marks (used by the guide). */
export const AMY_NEEDED: AmyBath[] = ['ICE', 'BODY', 'BOILING'];
