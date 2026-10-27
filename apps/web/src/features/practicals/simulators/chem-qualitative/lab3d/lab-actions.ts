import {
  QUAL_GAS_TESTS,
  QUAL_GAS_TEST_LABEL,
  QUAL_REAGENTS,
  QUAL_REAGENT_INFO,
  QUAL_SAMPLE_LABEL,
  isSolidSample,
  qualObserve,
  qualReagentFits,
  qualSampleName,
  qualSamples,
  qualTestText,
  type ChemQualitativeState,
  type QualReagent,
  type QualSample,
} from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import type { Qualitative } from '../actions';
import { useQualBench } from './bench';
import { QUAL_APPARATUS, QUAL_APPARATUS_LABEL, isToxicTest, type QualApparatusId, type QualScene } from './scene-state';
import { QUAL_BOTTLES } from './station';

/**
 * What can be done with each object on the qualitative-analysis bench. Every
 * action is a button; a blocked one says why. Marked changes go through the
 * shared qualitative actions (the same as the 2D lab); the 3D-only steps
 * (safety, apparatus, the burner, the fume cupboard, wafting) are log notes.
 */

export interface QualCtx {
  q: Qualitative;
  s: ChemQualitativeState;
  scene: QualScene;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}
const setView = (p: Parameters<ReturnType<typeof useLabView.getState>['set']>[0]) => useLabView.getState().set(p);

/** Why a test can't be started now (null: it can). */
function blockedTest(ctx: QualCtx, sample: QualSample, reagent: QualReagent): string | undefined {
  const { scene } = ctx;
  if (!scene.collected.has('rack')) return 'Get the test tubes from the apparatus cupboard first.';
  if (isSolidSample(sample) && !scene.collected.has('spatula')) return 'You need a spatula to take some of the solid.';
  if (reagent === 'HEAT') {
    if (!scene.collected.has('holder')) return 'Get a test-tube holder: never hold a hot tube with your fingers.';
    if (!scene.collected.has('burner')) return 'Get the Bunsen burner from the cupboard.';
    if (!scene.burnerOn) return 'Light the Bunsen burner first.';
  }
  if (reagent === 'FLAME') {
    if (!scene.collected.has('wire')) return 'Get the nichrome wire from the cupboard.';
    if (!scene.collected.has('burner')) return 'Get the Bunsen burner from the cupboard.';
    if (!scene.burnerOn) return 'Light the Bunsen burner first.';
  }
  if (reagent === 'WATER' && ctx.q.v.kind === 'MIXTURE' && !scene.collected.has('funnel')) return 'A mixture must be filtered: get a filter funnel and paper.';
  return undefined;
}

function startTest(ctx: QualCtx, sample: QualSample, reagent: QualReagent) {
  const i = ctx.q.doTest(sample, reagent);
  if (i < 0) return notify('The rack is full: discard a test you no longer need.', 'warning');
  useQualBench.setState({ active: i, sample, addedAt: performance.now() });
  setView({ selected: 'tube', focus: reagent === 'HEAT' || reagent === 'FLAME' ? 'burner' : 'tube' });
  play(reagent === 'HEAT' || reagent === 'FLAME' ? 'tick' : 'drip');
}

const testActions = (ctx: QualCtx, sample: QualSample, reagents: QualReagent[]): LabAction[] =>
  reagents
    .filter((r) => qualReagentFits(r, sample))
    .map((r) => ({ key: `test-${r}-${sample}`, label: QUAL_REAGENT_INFO[r].label, blocked: blockedTest(ctx, sample, r), run: () => startTest(ctx, sample, r) }));

const sampleText = (ctx: QualCtx, x: QualSample) => (x === 'SOLUTION' ? qualSampleName(ctx.q.v, x) : QUAL_SAMPLE_LABEL[x]);

export function qualObjectPanel(id: string, ctx: QualCtx): ObjectPanel | null {
  const { q, s, scene } = ctx;
  const v = q.v;
  const samples = qualSamples(v, s.tests);

  if (id.startsWith('cup:')) {
    const a = id.slice(4) as QualApparatusId;
    return {
      title: QUAL_APPARATUS_LABEL[a],
      info: 'In the apparatus cupboard.',
      actions: [
        {
          key: 'take',
          label: 'Take to my bench',
          tone: 'brand',
          run: () => {
            q.note(`collect:${a}`);
            play('clink');
            setView({ selected: null });
            notify(`${QUAL_APPARATUS_LABEL[a]} is on your bench.`, 'success', 1500);
          },
        },
      ],
    };
  }
  if (id.startsWith('sample:')) {
    const x = id.slice(7) as QualSample;
    return {
      title: sampleText(ctx, x),
      info: x === 'SOLID' ? v.given : `Prepared from C. Choose a test to do on the ${sampleText(ctx, x).toLowerCase()}.`,
      actions: testActions(ctx, x, [...QUAL_REAGENTS]),
    };
  }
  if (id.startsWith('bottle:')) {
    const b = QUAL_BOTTLES.find((x) => x.id === id.slice(7));
    if (!b) return null;
    const actions = samples.flatMap((x) =>
      (b.reagents as QualReagent[])
        .filter((r) => qualReagentFits(r, x))
        .map((r): LabAction => ({ key: `test-${r}-${x}`, label: `${QUAL_REAGENT_INFO[r].label} → ${sampleText(ctx, x).toLowerCase()}`, blocked: blockedTest(ctx, x, r), run: () => startTest(ctx, x, r) })),
    );
    return { title: b.name, info: actions.length ? 'Choose what to add it to.' : 'Nothing on your bench to use this on yet: prepare a solution of C first.', actions };
  }

  switch (id) {
    case 'coat':
      return { title: 'Lab coat', info: 'Wear a buttoned lab coat in the laboratory.', actions: [scene.coat ? { key: 'off', label: 'Take off the lab coat', run: () => q.note('safety-off:coat') } : { key: 'on', label: 'Put on the lab coat', tone: 'brand', run: () => (q.note('safety:coat'), setView({ selected: null })) }] };
    case 'goggles':
      return { title: 'Safety goggles', info: 'Hot liquids spurt and acids splash: protect your eyes.', actions: [scene.goggles ? { key: 'off', label: 'Take off the goggles', run: () => q.note('safety-off:goggles') } : { key: 'on', label: 'Put on the goggles', tone: 'brand', run: () => (q.note('safety:goggles'), setView({ selected: null })) }] };
    case 'cupboard':
      return { title: 'Apparatus cupboard', info: 'Choose the apparatus you need for qualitative analysis.', actions: [{ key: 'list', label: 'Choose apparatus…', tone: 'brand', run: () => ctx.open('cupboard') }] };
    case 'mybench':
      return {
        title: 'Your bench',
        info: 'Sample C, the reagent shelf, the task card and your notebook are here.',
        actions: useLabView.getState().mode === 'walk' ? [{ key: 'sit', label: 'Work at my bench', tone: 'brand', run: () => setView({ mode: 'bench', focus: 'bench', selected: null }) }] : [{ key: 'stand', label: 'Stand up and walk', run: () => setView({ mode: 'walk', selected: null }) }],
      };
    case 'shelf':
      return { title: 'Reagent shelf', info: 'Stock solutions. The reagents you need are on your own bench.', actions: [] };
    case 'fume':
      return { title: 'Fume cupboard', info: 'Tests that give off SO₂, H₂S, NO₂ or HCl are done here, with the sash pulled down. Select your test tube to carry it here.', actions: [] };
    case 'extinguisher':
      return { title: 'Fire extinguisher', info: 'You are using a Bunsen burner: know where this is.', actions: [] };
    case 'firstaid':
      return { title: 'First-aid box', info: 'Report every burn or cut to the teacher.', actions: [] };
    case 'eyewash':
      return { title: 'Eye-wash station', info: 'If anything splashes in your eyes, rinse them here for 10 minutes and tell the teacher.', actions: [] };
    case 'whiteboard':
      return { title: 'Whiteboard', info: 'Qualitative analysis: test every gas; record TEST | OBSERVATION | INFERENCE.', actions: [] };
    case 'desk':
      return { title: 'Teacher’s desk', info: 'Tap Mrs Ada for help with the next step.', actions: [] };
    case 'card':
      return { title: 'Task card', actions: [{ key: 'read', label: 'Read the task card', tone: 'brand', run: () => ctx.open('task') }] };
    case 'book':
      return { title: 'Practical notebook', info: 'Your TEST | OBSERVATION | INFERENCE table and the ions you identify.', actions: [{ key: 'open', label: 'Open the notebook', tone: 'brand', run: () => ctx.open('notebook') }] };
    case 'burner':
      return {
        title: 'Bunsen burner',
        info: scene.burnerOn ? 'Lit: a blue roaring flame for heating, a non-luminous one for flame tests.' : 'Light it with the air hole closed, then open it for a hot blue flame.',
        actions: [scene.burnerOn ? { key: 'off', label: 'Turn off the gas', run: () => q.note('burner-off') } : { key: 'on', label: 'Light the burner', tone: 'brand', run: () => (q.note('burner-on'), play('creak')) }],
      };
    case 'rack': {
      const picks = s.tests.map((t, i): LabAction => ({ key: `pick-${i}`, label: `Test ${i + 1}: ${QUAL_REAGENT_INFO[t.reagent].label.split(' (')[0]}`, run: () => (useQualBench.setState({ active: i }), setView({ selected: 'tube', focus: 'tube' })) }));
      return { title: 'Test tubes', info: s.tests.length ? 'Pick a test tube to look at it again or carry on with it.' : 'Clean, dry test tubes. Choose a sample and a reagent to start a test.', actions: picks };
    }
    case 'tube':
      return tubePanel(ctx);
    case 'holder':
      return { title: 'Test-tube holder', info: 'Grip the tube near its mouth when you heat it.', actions: [] };
    case 'wire':
      return { title: 'Nichrome wire', info: 'Dip it in conc. HCl, then in the solid, and hold it in the edge of the flame.', actions: [] };
    case 'gasKit':
      return { title: 'Gas-test kit', info: 'Damp litmus papers, glowing and burning splints, lime water, dichromate and lead(II) ethanoate papers, rods for conc. HCl and NH₃.', actions: [] };
  }
  const extra = QUAL_APPARATUS.find((a) => a.id === id);
  if (extra)
    return {
      title: extra.label,
      info: extra.needed ? undefined : 'Not needed for qualitative analysis.',
      actions: [{ key: 'return', label: 'Put back in the cupboard', run: () => (q.note(`return:${extra.id}`), setView({ selected: null })) }],
    };
  return null;
}

function tubePanel(ctx: QualCtx): ObjectPanel | null {
  const { q, s, scene } = ctx;
  const i = useQualBench.getState().active;
  const t = s.tests[i];
  if (!t) return null;
  const out = qualObserve(q.v, t);
  const info = QUAL_REAGENT_INFO[t.reagent];
  const steps = info.steps.filter(() => !(t.reagent === 'DIL_HCL' && isSolidSample(t.sample)));
  const gasOn = info.gas || out.gases.length > 0;
  const actions: LabAction[] = steps.map((st) => ({ key: `step-${st.id}`, label: st.label, blocked: t.steps.includes(st.id) ? 'Already done.' : undefined, run: () => (q.addStep(i, st.id), play('drip')) }));
  if (gasOn) {
    for (const g of QUAL_GAS_TESTS)
      actions.push({
        key: `gas-${g}`,
        label: `Test the gas: ${QUAL_GAS_TEST_LABEL[g].charAt(0).toLowerCase()}${QUAL_GAS_TEST_LABEL[g].slice(1)}`,
        blocked: t.gasTests.includes(g) ? 'Already done.' : !scene.collected.has('gasKit') ? 'Get the gas-test kit from the cupboard.' : undefined,
        run: () => q.addGasTest(i, g),
      });
    actions.push({ key: 'waft', label: 'Waft the gas towards your nose', blocked: scene.wafted.has(i) ? 'Already done.' : undefined, run: () => (q.note(`waft:${i}`), notify(out.gases.length ? 'You fan a little of the gas towards your nose with your hand — note any smell.' : 'You waft: no smell.', 'info', 2600)) });
    actions.push({
      key: 'sniff',
      label: 'Smell it directly',
      tone: 'danger',
      run: () => (q.note(`sniff-refused:${i}`), notify('Never smell a gas directly: it can burn your nose and lungs. Waft it towards you instead.', 'danger', 3600), play('oops')),
    });
    if (isToxicTest(q.v, s, i) && !scene.fume.has(i)) actions.push({ key: 'fume', label: 'Carry it to the fume cupboard', tone: 'brand', run: () => (q.note(`fume-cupboard:${i}`), notify('Done in the fume cupboard, with the sash pulled down.', 'success', 2200)) });
  }
  actions.push({ key: 'notebook', label: 'Write it in my notebook', run: () => ctx.open('notebook') });
  actions.push({ key: 'discard', label: 'Discard this test', tone: 'danger', run: () => (q.discard(i), useQualBench.setState({ active: -1 }), setView({ selected: null })) });
  const seen = out.parts.map((p) => p.text.charAt(0).toUpperCase() + p.text.slice(1)).join('. ');
  return { title: `Test ${i + 1}: ${qualTestText(q.v, t)}`, info: `What you see: ${seen}.`, actions };
}

/** The hint for practice mode with guided mode off (the 2D lab's hint, plus the 3D set-up steps first). */
export function qualHint3d(ctx: QualCtx, plain: string): string {
  const { scene } = ctx;
  if (!scene.coat || !scene.goggles) return 'Put on a lab coat and goggles: they hang on the hooks by the door.';
  const missing = QUAL_APPARATUS.filter((a) => a.needed && !scene.collected.has(a.id) && (a.id !== 'funnel' || ctx.q.v.kind === 'MIXTURE'));
  if (missing.length) return `Collect from the apparatus cupboard: ${missing.map((a) => a.label.toLowerCase()).join(', ')}.`;
  return plain;
}
