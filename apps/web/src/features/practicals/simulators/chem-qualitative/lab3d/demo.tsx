import { QUAL_GAS_LABEL, QUAL_ION_EQUATION, QUAL_ION_LABEL, emptyChemQualitativeState, qualIdealRecord, qualModelTests, qualObserve, qualTestText, type ChemQualitativeState, type ChemQualitativeVariant, type QualRecord, type QualTest } from '@aischool/shared';
import { useMemo, useState } from 'react';
import { useDemoPlayer, type DemoBeat, type DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import { useQualitative, type Qualitative } from '../actions';
import { Conclusion, Notebook } from '../notebook';
import { demoVariant, useQualBench } from './bench';
import { QUAL_APPARATUS, TOXIC_GASES } from './scene-state';

/**
 * Mrs Ada's demonstration: a model WAEC analysis of a known salt that is never
 * the student's own (demoVariant), on its own in-memory state, through the
 * same qualitative actions as the student's lab. Each test is started, its
 * steps and gas tests are done, and its TEST | OBSERVATION | INFERENCE row is
 * written from the model record; the ions and an ionic equation finish it.
 */

export interface QualDemoCtx {
  q: Qualitative;
  v: ChemQualitativeVariant;
  s: () => ChemQualitativeState;
}
type Beat = DemoBeat<QualDemoCtx>;
type Step = KitDemoStep<QualDemoCtx>;

const noop = () => undefined;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** An inference in words, from a model record. */
export function inferenceText(r: QualRecord): string {
  const out: string[] = [];
  if (r.present.length) out.push(`${r.present.map((x) => QUAL_ION_LABEL[x]).join(', ')} ${r.present.length > 1 ? 'possibly present' : 'present'}`);
  if (r.absent.length) out.push(`${r.absent.map((x) => QUAL_ION_LABEL[x]).join(', ')} absent`);
  if (r.gases.length) out.push(`gas: ${r.gases.map((g) => QUAL_GAS_LABEL[g]).join(', ')}`);
  if (r.note.trim()) out.push(r.note.trim().replace(/\.$/, ''));
  return out.join('; ') || 'no conclusion from this test';
}

const startTest = (c: QualDemoCtx, t: QualTest) => {
  const i = c.q.doTest(t.sample, t.reagent);
  useQualBench.setState({ active: i, sample: t.sample, addedAt: performance.now() });
  if (qualObserve(c.v, t).gases.some((g) => TOXIC_GASES.includes(g))) c.q.note(`fume-cupboard:${i}`);
};

function testStep(v: ChemQualitativeVariant, t: QualTest, n: number): Step {
  const heat = t.reagent === 'HEAT' || t.reagent === 'FLAME';
  const out = qualObserve(v, t);
  const beats: Beat[] = [{ at: 500, run: (c) => startTest(c, t) }];
  let at = 500;
  for (const st of t.steps) beats.push({ at: (at += 1300), run: (c) => c.q.addStep(c.s().tests.length - 1, st) });
  for (const g of t.gasTests) beats.push({ at: (at += 1300), run: (c) => c.q.addGasTest(c.s().tests.length - 1, g) });
  if (out.gases.length) beats.push({ at: (at += 900), run: (c) => c.q.note(`waft:${c.s().tests.length - 1}`) });
  const toxic = out.gases.some((g) => TOXIC_GASES.includes(g));
  return {
    id: `test-${n}`,
    title: `Test ${n + 1}: ${qualTestText(v, t).split(';')[0]}`,
    say: () => {
      const how = heat ? (t.reagent === 'HEAT' ? 'I heat a little of the solid in a dry tube, held in the holder and pointing away from everyone — gently, then strongly.' : 'A clean nichrome wire, dipped in the solid, in the edge of the flame.') : `${cap(qualTestText(v, t))}.`;
      const gas = toxic ? ' This gives off a harmful gas, so it goes in the fume cupboard.' : out.gases.length ? ' I test the gas, and waft it — never sniff.' : '';
      return `${how}${gas} I see: ${out.parts.map((p) => p.text).join('; ')}.`;
    },
    ms: Math.max(5600, at + 2600),
    view: { mode: 'bench', focus: heat && !toxic ? 'burner' : 'tube', spot: null },
    point: heat && !toxic ? 'burner' : 'tube',
    beats,
  };
}

function recordStep(v: ChemQualitativeVariant, t: QualTest, n: number): Step {
  const rec = qualIdealRecord(v, t);
  return {
    id: `record-${n}`,
    title: `Record test ${n + 1}`,
    say: () => `In the table — observation: ${rec.observation}. Inference: ${inferenceText(rec)}.`,
    ms: 5200,
    view: { mode: 'bench', focus: 'tube', spot: null },
    point: 'book',
    panel: 'notebook',
    beats: [{ at: 1200, run: (c) => c.q.update((s) => ({ ...s, table: s.table.map((r, k) => (k === n ? qualIdealRecord(c.v, s.tests[k]!) : r)) }), `table:${n + 1}`) }],
  };
}

export function qualDemoScript(v: ChemQualitativeVariant): Step[] {
  const tests = qualModelTests(v);
  const salt = v.main;
  const steps: Step[] = [
    { id: 'intro', title: 'What we are doing', say: () => `Watch me analyse my own sample, not yours: ${salt.solid.name}, a single salt. I will find its cation and its anion, step by step.`, ms: 4200, view: { mode: 'bench', focus: 'bench', spot: null }, point: 'sample:SOLID', beats: [] },
    {
      id: 'safety',
      title: 'Safety first',
      say: () => 'Lab coat on, goggles on: hot liquids spurt and acids splash. I tie my hair back near the burner.',
      ms: 3800,
      view: { mode: 'bench', focus: 'bench', spot: null },
      beats: [
        { at: 800, run: (c) => c.q.note('safety:coat') },
        { at: 1800, run: (c) => c.q.note('safety:goggles') },
      ],
    },
    {
      id: 'apparatus',
      title: 'Apparatus and the burner',
      say: () => 'Clean test tubes in a rack, a holder, a spatula, the nichrome wire, the gas-test kit and the wash bottle. I light the Bunsen burner with the air hole closed, then open it.',
      ms: 5200,
      view: { mode: 'bench', focus: 'burner', spot: null },
      point: 'burner',
      beats: [
        ...QUAL_APPARATUS.filter((a) => a.needed && a.id !== 'funnel').map((a, k): Beat => ({ at: 300 + k * 250, run: (c) => c.q.note(`collect:${a.id}`) })),
        { at: 3200, run: (c) => c.q.note('burner-on') },
      ],
    },
  ];
  tests.forEach((t, n) => steps.push(testStep(v, t, n), recordStep(v, t, n)));
  const eq = `${QUAL_ION_EQUATION[salt.cation]}; ${QUAL_ION_EQUATION[salt.anion]}`;
  steps.push(
    {
      id: 'ions',
      title: 'Name the ions',
      say: () => `Putting the inferences together: the cation is ${QUAL_ION_LABEL[salt.cation]} and the anion is ${QUAL_ION_LABEL[salt.anion]} — so my salt is ${salt.formula}. One ionic equation for each confirmatory test: ${eq}.`,
      ms: 8000,
      view: { mode: 'bench', focus: 'bench', spot: null },
      point: 'book',
      panel: 'notebook',
      beats: [{ at: 1500, run: (c) => c.q.update((s) => ({ ...s, answer: { ...s.answer, A: { cation: salt.cation, anion: salt.anion }, equation: eq } }), 'answer') }],
    },
    { id: 'turn', title: 'Your turn!', say: () => 'Now it is your turn, with your own sample C. Remember: drops first, then excess — test every gas — and write exactly what you see.', ms: 4500, view: { mode: 'bench', focus: 'bench', spot: null }, beats: [] },
  );
  return steps;
}

/** The qualitative demo: its own salt and in-memory state, played by the kit's demo engine. */
export function useQualDemo({ studentSeed, startedAt, active, onFinished }: { studentSeed: number; startedAt: string; active: boolean; onFinished: () => void }) {
  const variant = useMemo(() => demoVariant(studentSeed), [studentSeed]);
  const [state, setState] = useState<ChemQualitativeState>(emptyChemQualitativeState);
  const q = useQualitative({ seed: variant.seed, state, onChange: setState, readOnly: false, startedAt, variant });
  const steps = useMemo(() => qualDemoScript(variant), [variant]);
  const ctx = (): QualDemoCtx => ({ q, v: variant, s: () => q.ref.current });
  const player = useDemoPlayer<QualDemoCtx>({
    steps,
    ctx,
    reset: () => {
      useQualBench.setState({ active: -1, sample: 'SOLID' });
      q.ref.current = emptyChemQualitativeState();
      setState(q.ref.current);
    },
    goggles: (c) => c.s().log.some((e) => e.a === 'safety:goggles'),
    active,
    onFinished,
  });
  const panel = (id: string) =>
    id === 'notebook' ? (
      <section className="pointer-events-none absolute right-2 top-40 z-10 hidden max-h-[calc(100%-18rem)] w-[400px] overflow-hidden rounded-2xl bg-card p-3 text-card-foreground shadow-xl sm:block" aria-label="Demonstration notebook">
        <Notebook v={variant} state={state} readOnly update={noop} active={state.tests.length - 1} setActive={noop} book className="border-0 p-0 shadow-none sm:p-0" />
        {state.answer.A.cation && <Conclusion v={variant} state={state} readOnly update={noop} className="mt-2 border-0 p-0 shadow-none sm:p-0" />}
      </section>
    ) : null;
  return { player, state, q, panel };
}
