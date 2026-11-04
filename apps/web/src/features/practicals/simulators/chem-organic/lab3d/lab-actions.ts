import { ORG_TEST_INFO, orgObserve, orgSampleName, orgTestText, orgTestsFor, type ChemOrganicState, type OrgSample, type OrgStep, type OrgTestId, type SoapAct } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { HEAT_MAX, heatsNow, type Organic } from '../actions';
import { useOrgBench } from './bench';
import { ORG_APPARATUS, ORG_APPARATUS_LABEL, neededFor, type OrgApparatusId, type OrgScene } from './scene-state';
import { ORG_BOTTLES, SOAP_BOTTLES } from './station';

/**
 * What can be done with each object on the organic bench. Every action is a
 * button; a blocked one says why. Marked changes go through the shared actions
 * (the same as the 2D lab); the 3D-only steps (safety, apparatus, the burner,
 * wafting) are log notes.
 */

export interface OrgCtx {
  o: Organic;
  s: ChemOrganicState;
  scene: OrgScene;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}
const setView = (p: Parameters<ReturnType<typeof useLabView.getState>['set']>[0]) => useLabView.getState().set(p);
const lc = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);

function blockedStart(ctx: OrgCtx): string | undefined {
  if (!ctx.scene.collected.has('rack')) return 'Get the test tubes from the apparatus cupboard first.';
  return undefined;
}
function blockedHeat(ctx: OrgCtx): string | undefined {
  const { scene } = ctx;
  if (!scene.collected.has('bath')) return 'Get the water bath (beaker, tripod, gauze and Bunsen burner) from the cupboard.';
  if (!scene.burnerOn) return 'Light the Bunsen burner under the water bath first.';
  if (!scene.collected.has('holder')) return 'Get a test-tube holder: never hold a hot tube with your fingers.';
  return undefined;
}

export function startTest(ctx: OrgCtx, sample: OrgSample, test: OrgTestId, first?: OrgStep) {
  const i = ctx.o.doTest(sample, test);
  if (i < 0) return notify('The rack is full: discard a test you no longer need.', 'warning');
  if (first) ctx.o.addStep(i, first);
  useOrgBench.setState({ active: i, anim: null });
  setView({ selected: 'tube', focus: 'tube' });
  play('drip');
  if (ORG_TEST_INFO[test].teacher) notify('The teacher adds it for you: it is too dangerous for students.', 'info', 2200);
}
export function heatTube(ctx: OrgCtx, i: number, sec: number, direct = false) {
  const t = ctx.s.tests[i];
  if (!t) return;
  useOrgBench.setState({ active: i, anim: { i, from: t.heat, at: performance.now() } });
  ctx.o.heat(i, sec, direct);
  setView({ selected: null, focus: direct ? 'tube' : 'bath' });
  play(direct ? 'oops' : 'tick');
  if (direct) notify(ORG_TEST_INFO[t.test].task === 'GROUPS' ? 'Organic liquids are flammable: never heat them over a flame. Use the water bath.' : 'Heated straight over the flame the liquid can spurt out. Use the boiling water bath.', 'danger', 3600);
}

const tubeOf = (ctx: OrgCtx) => {
  const i = useOrgBench.getState().active;
  return { i, t: ctx.s.tests[i] };
};
/** The addition this bottle makes to the tube in use, if it fits. */
function nextStepFrom(ctx: OrgCtx, bottle: string): { i: number; step: OrgStep; label: string } | null {
  const { i, t } = tubeOf(ctx);
  const b = ORG_BOTTLES.find((x) => x.id === bottle);
  if (!t || !b?.step) return null;
  const info = ORG_TEST_INFO[t.test].steps.find((x) => x.id === b.step);
  if (!info || (t.steps.includes(b.step) && b.step !== 'CUSO4')) return null;
  return { i, step: b.step, label: info.label };
}
function stepBlocked(ctx: OrgCtx, step: OrgStep): string | undefined {
  const { t } = tubeOf(ctx);
  if (!t) return undefined;
  if (step === 'POUR' && t.heat < 60) return 'Warm it in the water bath for at least a minute first.';
  if ((step === 'ACID_PARTNER' && t.steps.includes('ETHANOL_PARTNER')) || (step === 'ETHANOL_PARTNER' && t.steps.includes('ACID_PARTNER'))) return 'This tube already has its partner.';
  if (step === 'LIMEWATER' || step === 'SPLINT') return !ctx.scene.collected.has('gasKit') ? 'Get the splints and lime water from the cupboard.' : undefined;
  if (step === 'NH3' && !t.steps.includes('HNO3')) return 'The conc. HNO₃ goes in first.';
  return undefined;
}

const ROOM: Record<string, (ctx: OrgCtx) => ObjectPanel> = {
  coat: ({ scene, o }) => ({ title: 'Lab coat', info: 'Wear a buttoned lab coat in the laboratory.', actions: [scene.coat ? { key: 'off', label: 'Take off the lab coat', run: () => o.note('safety-off:coat') } : { key: 'on', label: 'Put on the lab coat', tone: 'brand', run: () => (o.note('safety:coat'), setView({ selected: null })) }] }),
  goggles: ({ scene, o }) => ({ title: 'Safety goggles', info: 'Hot alkali spits and acids splash: protect your eyes the whole time.', actions: [scene.goggles ? { key: 'off', label: 'Take off the goggles', run: () => o.note('safety-off:goggles') } : { key: 'on', label: 'Put on the goggles', tone: 'brand', run: () => (o.note('safety:goggles'), setView({ selected: null })) }] }),
  cupboard: (ctx) => ({ title: 'Apparatus cupboard', info: 'Choose the apparatus you need.', actions: [{ key: 'list', label: 'Choose apparatus…', tone: 'brand', run: () => ctx.open('cupboard') }] }),
  mybench: () => ({
    title: 'Your bench',
    info: 'Your samples, the reagents, the task card and your notebook are here.',
    actions: useLabView.getState().mode === 'walk' ? [{ key: 'sit', label: 'Work at my bench', tone: 'brand', run: () => setView({ mode: 'bench', focus: 'bench', selected: null }) }] : [{ key: 'stand', label: 'Stand up and walk', run: () => setView({ mode: 'walk', selected: null }) }],
  }),
  shelf: () => ({ title: 'Reagent shelf', info: 'Stock solutions. The reagents you need are on your own bench.', actions: [] }),
  fume: () => ({ title: 'Fume cupboard', info: 'Bromine and concentrated acids are kept and dispensed here by the teacher.', actions: [] }),
  extinguisher: () => ({ title: 'Fire extinguisher', info: 'Organic liquids burn: know where this is.', actions: [] }),
  firstaid: () => ({ title: 'First-aid box', info: 'Report every burn or splash to the teacher.', actions: [] }),
  eyewash: () => ({ title: 'Eye-wash station', info: 'If alkali or acid splashes in your eyes, rinse them here for 10 minutes and tell the teacher.', actions: [] }),
  whiteboard: ({ s }) => ({ title: 'Whiteboard', info: s.task === 'SOAP' ? 'Saponification: boil 15–20 minutes, stirring; top up the water; brine salts out the soap.' : 'Test, observe, infer — and no flames near organic liquids.', actions: [] }),
  desk: () => ({ title: 'Teacher’s desk', info: 'Tap Mrs Ada for help with the next step.', actions: [] }),
  card: (ctx) => ({ title: 'Task card', actions: [{ key: 'read', label: 'Read the task card', tone: 'brand', run: () => ctx.open('task') }] }),
  book: (ctx) => ({ title: 'Practical notebook', info: ctx.s.task === 'SOAP' ? 'Your observations, the masses and the yield.' : 'Your TEST | OBSERVATION | INFERENCE table, the identification and the calculation.', actions: [{ key: 'open', label: 'Open the notebook', tone: 'brand', run: () => ctx.open('notebook') }] }),
};

export function orgObjectPanel(id: string, ctx: OrgCtx): ObjectPanel | null {
  const { o, s, scene } = ctx;
  const task = s.task ?? 'GROUPS';
  if (id.startsWith('cup:')) {
    const a = id.slice(4) as OrgApparatusId;
    return { title: ORG_APPARATUS_LABEL[a], info: 'In the apparatus cupboard.', actions: [{ key: 'take', label: 'Take to my bench', tone: 'brand', run: () => (o.note(`collect:${a}`), play('clink'), setView({ selected: null }), notify(`${ORG_APPARATUS_LABEL[a]} is on your bench.`, 'success', 1500)) }] };
  }
  if (ROOM[id]) return ROOM[id]!(ctx);
  if (task === 'SOAP') {
    const p = soapPanel(id, ctx);
    if (p) return p;
  }
  if (id.startsWith('sample:')) {
    const x = id.slice(7) as OrgSample;
    const sm = o.v.samples.find((y) => y.letter === x);
    return { title: x === 'H2O' ? 'Distilled water (the control)' : `Sample ${x}`, info: sm ? `${sm.def.describe.charAt(0).toUpperCase()}${sm.def.describe.slice(1)}. About 2 cm³ in a clean tube for each test.` : undefined, actions: orgTestsFor(task).map((t) => ({ key: `t-${t}`, label: ORG_TEST_INFO[t].label, blocked: blockedStart(ctx), run: () => startTest(ctx, x, t) })) };
  }
  if (id.startsWith('bottle:')) {
    const b = ORG_BOTTLES.find((y) => y.id === id.slice(7));
    if (!b) return null;
    const actions: LabAction[] = [];
    const add = nextStepFrom(ctx, b.id);
    if (add) actions.push({ key: 'step', label: `${add.label} (tube in use)`, tone: 'brand', blocked: stepBlocked(ctx, add.step), run: () => (o.addStep(add.i, add.step), play('drip')) });
    if (b.start) for (const sm of o.v.samples) actions.push({ key: `s-${sm.letter}`, label: `${ORG_TEST_INFO[b.start[0]].short} test on ${orgSampleName(sm.letter)}`, blocked: blockedStart(ctx), run: () => startTest(ctx, sm.letter, b.start![0], b.start![1]) });
    return { title: b.name, info: b.info, actions };
  }
  switch (id) {
    case 'bath':
      return {
        title: 'Boiling water bath',
        info: scene.burnerOn ? 'The water is boiling. Stand a tube in it with the holder.' : 'A beaker of water on a tripod and gauze over the Bunsen burner. Organic liquids are only ever warmed in it.',
        actions: [scene.burnerOn ? { key: 'off', label: 'Turn off the burner', run: () => o.note('burner-off') } : { key: 'on', label: 'Light the burner', tone: 'brand', run: () => (o.note('burner-on'), play('creak')) }],
      };
    case 'rack': {
      const picks = s.tests.map((t, i): LabAction => ({ key: `pick-${i}`, label: `Test ${i + 1}: ${orgSampleName(t.sample)} — ${ORG_TEST_INFO[t.test].short}`, run: () => (useOrgBench.setState({ active: i, anim: null }), setView({ selected: 'tube', focus: 'tube' })) }));
      return { title: 'Test tubes', info: s.tests.length ? 'Pick a tube to look at it again or carry on with it.' : 'Clean test tubes: one for each test.', actions: picks };
    }
    case 'tube':
      return tubePanel(ctx);
    case 'holder':
      return { title: 'Test-tube holder', info: 'Grip a tube near its mouth to put it into or take it out of the water bath.', actions: [] };
    case 'gasKit':
      return { title: 'Splints and lime water', info: 'Hydrogen burns with a squeaky pop; carbon dioxide turns lime water milky.', actions: [] };
    case 'cylinder':
      return { title: 'Measuring cylinder', info: 'Measures equal volumes of sample and reagent (2 cm³).', actions: [] };
    case 'waterBeaker':
      return { title: 'Beaker of cold water', info: 'The warm ester mixture is poured into it: an ester floats as an oily layer with a fruity smell.', actions: [] };
  }
  const extra = ORG_APPARATUS.find((a) => a.id === id);
  if (extra) return { title: extra.label, info: extra.for.includes(task) ? undefined : 'Not needed for this practical.', actions: [{ key: 'return', label: 'Put back in the cupboard', run: () => (o.note(`return:${extra.id}`), setView({ selected: null })) }] };
  return null;
}

function tubePanel(ctx: OrgCtx): ObjectPanel | null {
  const { o } = ctx;
  const { i, t } = tubeOf(ctx);
  if (!t) return null;
  const out = orgObserve(o.v, t);
  const info = ORG_TEST_INFO[t.test];
  const actions: LabAction[] = info.steps
    .filter((st) => st.id === 'CUSO4' || !t.steps.includes(st.id))
    .filter((st) => !((st.id === 'ACID_PARTNER' && t.steps.includes('ETHANOL_PARTNER')) || (st.id === 'ETHANOL_PARTNER' && t.steps.includes('ACID_PARTNER'))))
    .map((st) => ({ key: `step-${st.id}`, label: st.id === 'CUSO4' && t.drops ? `${st.label} (${t.drops} so far)` : st.label, blocked: stepBlocked(ctx, st.id), run: () => (o.addStep(i, st.id), play('drip')) }));
  if (t.test === 'HYDROLYSIS' && t.steps.includes('ACID') && !t.steps.includes('NEUTRALISE')) actions.push({ key: 'portion', label: `Test a portion with iodine (boiled ${t.boil} s)`, blocked: t.portions.includes(t.boil) ? 'Already tested at this time: boil it longer first.' : undefined, run: () => (o.portion(i), play('drip')) });
  if (heatsNow(t)) {
    const boiling = t.test === 'HYDROLYSIS' && !t.steps.includes('NEUTRALISE');
    const full = t.heat >= HEAT_MAX ? 'It has been heated long enough.' : undefined;
    actions.push({ key: 'bath60', label: boiling ? 'Boil it with the acid in the water bath for 1 minute' : 'Stand it in the boiling water bath for 1 minute', tone: 'brand', blocked: blockedHeat(ctx) ?? full, run: () => heatTube(ctx, i, 60) });
    actions.push({ key: 'bath30', label: '…for 30 seconds', blocked: blockedHeat(ctx) ?? full, run: () => heatTube(ctx, i, 30) });
    actions.push({ key: 'direct', label: 'Heat it directly over the flame', tone: 'danger', blocked: !ctx.scene.burnerOn ? 'The burner is not lit.' : full, run: () => heatTube(ctx, i, 30, true) });
  }
  if (t.test === 'ESTER' && t.steps.includes('POUR')) {
    actions.push({ key: 'waft', label: 'Waft the smell towards your nose', tone: 'brand', blocked: ctx.scene.wafted.has(i) ? 'Done.' : undefined, run: () => (o.note(`waft:${i}`), notify(out.positive ? 'You waft: a sweet, fruity smell.' : 'You waft: only the sharp smell of the reactants.', 'info', 2600)) });
    actions.push({ key: 'sniff', label: 'Smell it directly', tone: 'danger', run: () => (o.note(`sniff-refused:${i}`), notify('Never sniff directly: waft the vapour towards your nose with your hand.', 'danger', 3400), play('oops')) });
  }
  actions.push({ key: 'notebook', label: 'Write it in my notebook', run: () => ctx.open('notebook') });
  actions.push({ key: 'discard', label: 'Discard this test', tone: 'danger', run: () => (o.discard(i), useOrgBench.setState({ active: -1, anim: null }), setView({ selected: null })) });
  const seen = out.parts.map((p) => p.text.charAt(0).toUpperCase() + p.text.slice(1)).join('. ');
  return { title: `Test ${i + 1}: ${orgTestText(t)}`, info: `What you see: ${seen}.`, actions };
}

// ------------------------------------------------------------------ soap

const soapDo = (ctx: OrgCtx, a: SoapAct, n = 0, sound: Parameters<typeof play>[0] = 'drip') => (ctx.o.soap(a, n), play(sound));
function soapPanel(id: string, ctx: OrgCtx): ObjectPanel | null {
  const { o, scene } = ctx;
  const r = o.run();
  const has = (x: OrgApparatusId) => scene.collected.has(x);
  const needBeaker = !has('beaker') ? 'Get the 250 cm³ beaker from the cupboard.' : undefined;
  const needCyl = !has('cylinder') ? 'Get a measuring cylinder to measure it.' : undefined;
  const boilBlock = !has('burner') ? 'Get the burner, tripod and gauze from the cupboard.' : needBeaker ?? (!scene.burnerOn ? 'Light the burner first.' : !r.oil || !r.naoh ? 'Put the oil and the NaOH in the beaker first.' : r.brine ? 'The brine is in: boiling is over.' : undefined);
  if (id.startsWith('soapbottle:')) {
    const b = SOAP_BOTTLES.find((x) => x.id === id.slice(11));
    if (!b) return null;
    switch (b.id) {
      case 'OIL':
        return { title: 'Palm oil', info: 'Glyceryl esters of fatty acids (taken as glyceryl tripalmitate, M = 806).', actions: [{ key: 'oil', label: 'Measure 10 cm³ into the beaker', tone: 'brand', blocked: needBeaker ?? needCyl ?? (r.oil ? 'Done.' : undefined), run: () => soapDo(ctx, 'OIL') }] };
      case 'NAOH':
        return { title: '20% sodium hydroxide', info: 'Very corrosive, especially hot: goggles on.', actions: [{ key: 'naoh', label: 'Add 20 cm³ to the beaker', tone: 'brand', blocked: needBeaker ?? needCyl ?? (r.naoh ? 'Done.' : undefined), run: () => soapDo(ctx, 'NAOH') }] };
      case 'BRINE':
        return { title: 'Saturated brine', info: 'Soap is much less soluble in strong salt solution: it is “salted out”.', actions: [{ key: 'brine', label: 'Add about 20 cm³ and stir', tone: 'brand', blocked: needBeaker ?? (!r.naoh ? 'Make the soap first.' : r.brine ? 'Done.' : undefined), run: () => (soapDo(ctx, 'BRINE'), setView({ focus: 'beaker' })) }] };
      case 'WATER':
        return { title: 'Distilled water', info: `Replaces the water that boils off (about ${r.water.toFixed(0)} cm³ in the mixture now).`, actions: [{ key: 'w', label: 'Add 5 cm³ to the beaker', tone: 'brand', blocked: needBeaker ?? (r.filtered ? 'The soap is filtered off.' : undefined), run: () => soapDo(ctx, 'WATER', 5) }, { key: 'soft', label: 'Shake a piece of soap with it in a test tube', blocked: !r.filtered ? 'Filter off your soap first.' : r.soft ? 'Done.' : undefined, run: () => (soapDo(ctx, 'LATHER_SOFT', 0, 'clink'), setView({ focus: 'lather' })) }] };
      case 'HARD':
        return { title: 'Hard water', info: 'Contains dissolved calcium and magnesium ions.', actions: [{ key: 'hard', label: 'Shake a piece of soap with it in a test tube', tone: 'brand', blocked: !r.filtered ? 'Filter off your soap first.' : r.hard ? 'Done.' : undefined, run: () => (soapDo(ctx, 'LATHER_HARD', 0, 'clink'), setView({ focus: 'lather' })) }] };
    }
  }
  switch (id) {
    case 'beaker':
      return {
        title: '250 cm³ beaker on the tripod',
        info: !r.oil ? 'Empty.' : `${r.naoh ? 'Oil and NaOH' : 'Palm oil'}${r.boiled ? `, boiled ${Math.round(r.boiled / 60)} min` : ''}; about ${r.water.toFixed(0)} cm³ of water. ${r.charred ? 'It has boiled dry and charred!' : r.extent > 0.6 ? 'Thick and creamy.' : r.boiled ? 'An oily layer still floats on top.' : ''}${r.separated ? ' A solid soap layer floats on the brine.' : ''}`,
        actions: [
          scene.burnerOn ? { key: 'off', label: 'Turn off the burner', run: () => o.note('burner-off') } : { key: 'on', label: 'Light the burner', tone: 'brand', blocked: !has('burner') ? 'Get the burner from the cupboard.' : undefined, run: () => (o.note('burner-on'), play('creak')) },
          { key: 'b1', label: 'Boil gently 1 min, stirring with the rod', tone: 'brand', blocked: boilBlock ?? (!has('rod') ? 'Get the glass rod to stir with.' : undefined), run: () => soapDo(ctx, 'BOIL', 60, 'tick') },
          { key: 'b5', label: 'Boil gently 5 min, stirring all the time', blocked: boilBlock ?? (!has('rod') ? 'Get the glass rod to stir with.' : undefined), run: () => soapDo(ctx, 'BOIL', 300, 'tick') },
          { key: 'bn', label: 'Boil 1 min without stirring', tone: 'danger', blocked: boilBlock, run: () => (soapDo(ctx, 'BOIL_NOSTIR', 60, 'oops'), notify('Unstirred, the hot alkali spits out of the beaker. Stir all the time.', 'danger', 3200)) },
          { key: 'water', label: 'Add 5 cm³ of distilled water', blocked: needBeaker ?? (r.filtered ? 'The soap is filtered off.' : undefined), run: () => soapDo(ctx, 'WATER', 5) },
          { key: 'cool', label: 'Turn off the burner and let it cool', blocked: !r.brine ? 'Salt out the soap with brine first.' : r.cooled ? 'Done.' : undefined, run: () => (o.note('burner-off'), soapDo(ctx, 'COOL', 0, 'tick')) },
        ],
      };
    case 'balance':
      return {
        title: 'Top-pan balance',
        info: 'Reads to 0.01 g. Tare it with the empty container first.',
        actions: [
          { key: 'oil', label: 'Weigh the 10 cm³ of oil', tone: 'brand', blocked: !r.oil ? 'Measure the oil first.' : r.naoh ? 'Weigh the oil before adding the NaOH.' : undefined, run: () => (soapDo(ctx, 'WEIGH_OIL', 0, 'tick'), setView({ focus: 'balance' })) },
          { key: 'soap', label: 'Weigh the soap', blocked: !r.filtered ? 'Filter off the soap first.' : undefined, run: () => (soapDo(ctx, 'WEIGH_SOAP', 0, 'tick'), setView({ focus: 'balance' })) },
        ],
      };
    case 'funnel':
      return {
        title: 'Filter funnel and paper',
        info: r.filtered ? 'The soap is on the paper.' : 'Pour the cooled mixture through it; the soap stays on the paper.',
        actions: [
          { key: 'filter', label: 'Filter (skim) off the soap', tone: 'brand', blocked: !r.boiled ? 'Make the soap first.' : r.filtered ? 'Done.' : !r.cooled ? 'Let it cool first: hot alkali splashes.' : undefined, run: () => soapDo(ctx, 'FILTER', 0, 'clink') },
          { key: 'wash', label: 'Wash it with a little cold water', blocked: !r.filtered ? 'Filter it first.' : r.washed ? 'Done.' : undefined, run: () => soapDo(ctx, 'WASH') },
          { key: 'dry', label: 'Press it dry between filter papers', blocked: !r.filtered ? 'Filter it first.' : r.dried ? 'Done.' : undefined, run: () => soapDo(ctx, 'DRY', 0, 'clink') },
        ],
      };
    case 'lather:soft':
      return { title: 'Distilled (soft) water', info: r.soft ? 'Shaken with soap: a lot of lather.' : 'Shake a piece of your soap with it.', actions: [{ key: 'soft', label: 'Shake a piece of soap with it', tone: 'brand', blocked: !r.filtered ? 'Filter off your soap first.' : r.soft ? 'Done.' : undefined, run: () => soapDo(ctx, 'LATHER_SOFT', 0, 'clink') }] };
    case 'lather:hard':
      return { title: 'Hard water', info: r.hard ? 'Shaken with soap: a white scum and little lather.' : 'Shake a piece of your soap with it.', actions: [{ key: 'hard', label: 'Shake a piece of soap with it', tone: 'brand', blocked: !r.filtered ? 'Filter off your soap first.' : r.hard ? 'Done.' : undefined, run: () => soapDo(ctx, 'LATHER_HARD', 0, 'clink') }] };
    case 'rod':
      return { title: 'Glass stirring rod', info: 'Stir all the time while it boils: it stops spitting and charring.', actions: [] };
    case 'cylinder':
      return { title: 'Measuring cylinder', info: 'Measures 10 cm³ of oil and 20 cm³ of NaOH.', actions: [] };
  }
  return null;
}

/** The hint for practice mode with guided mode off (the 2D lab's hint, plus the 3D set-up steps first). */
export function orgHint3d(ctx: OrgCtx, plain: string): string {
  const { scene, s } = ctx;
  if (!scene.coat || !scene.goggles) return 'Put on a lab coat and goggles: they hang on the hooks by the door.';
  const missing = neededFor(s.task ?? 'GROUPS').filter((a) => !scene.collected.has(a.id));
  if (missing.length) return `Collect from the apparatus cupboard: ${missing.map((a) => lc(a.label)).join(', ')}.`;
  if (!scene.burnerOn && !(s.task === 'SOAP' && soapDone(ctx))) return s.task === 'SOAP' ? 'Light the Bunsen burner under the tripod.' : 'Light the Bunsen burner under the water bath.';
  return plain;
}
const soapDone = (ctx: OrgCtx) => ctx.o.run().brine;
