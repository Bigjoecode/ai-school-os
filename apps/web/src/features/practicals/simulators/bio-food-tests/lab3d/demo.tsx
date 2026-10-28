import {
  AMY_BATH_SHORT,
  AMY_CLAIM_LABEL,
  NUTRIENT_LABEL,
  amyInferenceKey,
  amyObservedEnd,
  amyTrueEnd,
  amyTubeParts,
  contentNutrients,
  emptyBioFoodState,
  foodIdealRecord,
  foodModelTests,
  foodObserve,
  foodTestText,
  roundDp,
  type AmyClaim,
  type BioFoodState,
  type BioFoodVariant,
  type FoodRecord,
  type FoodTask,
  type FoodTest,
} from '@aischool/shared';
import { useMemo, useState } from 'react';
import { useDemoPlayer, type DemoBeat, type DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import { useFoodTests, type FoodTests } from '../actions';
import { AmyNotebook, FoodConclusion, FoodNotebook } from '../notebook';
import { demoVariant, useFoodBench } from './bench';
import { neededFor } from './scene-state';

/**
 * Mrs Okon's demonstration on her own samples (demoVariant: never the
 * student's), on its own in-memory state, through the same actions as the
 * student's lab. FOOD: every test on P with its row written, the same tests
 * on Q and R, then the food substances. AMYLASE: the tile, four tubes and a
 * control, the drops every 30 s (time-lapse) to the end points, Benedict's on
 * the digested mixture and the optimum.
 */

export interface FoodDemoCtx {
  f: FoodTests;
  v: BioFoodVariant;
  s: () => BioFoodState;
}
type Beat = DemoBeat<FoodDemoCtx>;
type Step = KitDemoStep<FoodDemoCtx>;
const noop = () => undefined;
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

export function inferenceText(r: FoodRecord): string {
  const out: string[] = [];
  if (r.present.length) out.push(`${r.present.map((x) => NUTRIENT_LABEL[x].toLowerCase()).join(', ')} present`);
  if (r.absent.length) out.push(`${r.absent.map((x) => NUTRIENT_LABEL[x].toLowerCase()).join(', ')} absent`);
  return out.join('; ') || 'no conclusion from this test';
}

/** Beats that carry out a test through the shared actions (heating in 1-minute steps, so the colour is seen developing). */
function testBeats(t: FoodTest, start: number, gap: number): { beats: Beat[]; end: number } {
  const beats: Beat[] = [];
  let at = start;
  beats.push({
    at,
    run: (c) => {
      const i = c.f.doTest(t.sample, t.test);
      useFoodBench.setState({ active: i, anim: null });
    },
  });
  for (const st of t.steps) beats.push({ at: (at += gap), run: (c) => c.f.addStep(c.s().tests.length - 1, st) });
  for (let h = 0; h < t.heat; h += 60)
    beats.push({
      at: (at += gap),
      run: (c) => {
        const i = c.s().tests.length - 1;
        useFoodBench.setState({ active: i, anim: { i, from: c.s().tests[i]!.heat, at: performance.now() } });
        c.f.heat(i, Math.min(60, t.heat - h));
      },
    });
  return { beats, end: at };
}
const writeRow = (c: FoodDemoCtx, n: number) => c.f.update((s) => ({ ...s, table: s.table.map((r, k) => (k === n ? foodIdealRecord(c.v, s, s.tests[k]!) : r)) }), `table:${n + 1}`);

const setUp = (task: FoodTask): Step[] => [
  {
    id: 'safety',
    title: 'Safety first',
    say: () => (task === 'AMYLASE' ? 'Lab coat and goggles on: boiling water and Benedict’s can splash. I use only my own saliva.' : 'Lab coat and goggles on: boiling water, sodium hydroxide and acid can splash. Ethanol stays away from the flame.'),
    ms: 4200,
    view: { mode: 'bench', focus: 'bench', spot: null },
    beats: [
      { at: 700, run: (c) => c.f.note('safety:coat') },
      { at: 1600, run: (c) => c.f.note('safety:goggles') },
    ],
  },
  {
    id: 'apparatus',
    title: 'Apparatus and the water bath',
    say: () => 'Clean test tubes, a holder and the water bath: a beaker of water on a tripod and gauze over the Bunsen burner. I light it now so the water is boiling when I need it.',
    ms: 5200,
    view: { mode: 'bench', focus: 'bath', spot: null },
    point: 'bath',
    beats: [...neededFor(task).map((a, k): Beat => ({ at: 300 + k * 220, run: (c) => c.f.note(`collect:${a.id}`) })), { at: 3000, run: (c) => c.f.note('burner-on') }],
  },
];

export function foodDemoScript(v: BioFoodVariant): Step[] {
  const tests = foodModelTests(v);
  const p = tests.filter((t) => t.sample === 'P');
  const rest = tests.filter((t) => t.sample !== 'P');
  const steps: Step[] = [{ id: 'intro', title: 'What we are doing', say: () => 'Watch me test my own samples, not yours. For each one I test for starch, reducing sugar, protein and fat, and write the test, the observation and the inference.', ms: 4800, view: { mode: 'bench', focus: 'samples', spot: null }, point: 'sample:P', beats: [] }, ...setUp('FOOD')];
  p.forEach((t, n) => {
    const { beats, end } = testBeats(t, 500, 1300);
    const out = foodObserve(v, emptyBioFoodState(), t);
    const heat = t.heat > 0;
    steps.push({
      id: `test-${n}`,
      title: `Test ${n + 1}: ${foodTestText(emptyBioFoodState(), t).split(';')[0]}`,
      say: () => `${cap(foodTestText(emptyBioFoodState(), t))}.${heat ? ' Watch the colour while it heats.' : ''} I see: ${out.parts.map((x) => x.text).join('; ')}.`,
      ms: Math.max(6000, end + 2800),
      view: { mode: 'bench', focus: heat ? 'bath' : 'tube', spot: null },
      point: heat ? 'bath' : 'tube',
      beats,
    });
    const rec = foodIdealRecord(v, emptyBioFoodState(), t);
    steps.push({ id: `record-${n}`, title: `Record test ${n + 1}`, say: () => `In the table — observation: ${rec.observation}. Inference: ${inferenceText(rec)}.`, ms: 5200, view: { mode: 'bench', focus: 'tube', spot: null }, point: 'book', panel: 'notebook', beats: [{ at: 1200, run: (c) => writeRow(c, n) }] });
  });
  steps.push({
    id: 'others',
    title: 'The same tests on Q and R',
    say: () => 'I do the same tests on Q and R, each in a clean tube, and write every row.',
    ms: 6500,
    view: { mode: 'bench', focus: 'samples', spot: null },
    point: 'sample:Q',
    panel: 'notebook',
    beats: rest.map(
      (t, k): Beat => ({
        at: 400 + k * 450,
        run: (c) => {
          const i = c.f.doTest(t.sample, t.test);
          for (const st of t.steps) c.f.addStep(i, st);
          if (t.heat) c.f.heat(i, t.heat);
          writeRow(c, i);
          useFoodBench.setState({ active: i, anim: null });
        },
      }),
    ),
  });
  const named = v.samples.map((sm) => `${sm.letter}: ${contentNutrients(sm.content).map((x) => NUTRIENT_LABEL[x].toLowerCase()).join(' and ')}`).join('; ');
  steps.push(
    { id: 'conclude', title: 'The food substances', say: () => `Putting the rows together — ${named}.`, ms: 7000, view: { mode: 'bench', focus: 'bench', spot: null }, point: 'book', panel: 'conclusion', beats: [{ at: 1200, run: (c) => c.f.update((s) => ({ ...s, conclusion: { P: contentNutrients(c.v.samples[0]!.content), Q: contentNutrients(c.v.samples[1]!.content), R: contentNutrients(c.v.samples[2]!.content) } }), 'concl') }] },
    { id: 'turn', title: 'Your turn!', say: () => 'Now it is your turn with your own P, Q and R. Heat in the water bath — never in the flame — and write exactly what you see: a brick-red precipitate, not just “red”.', ms: 5000, view: { mode: 'bench', focus: 'bench', spot: null }, beats: [] },
  );
  return steps;
}

const amyRecords = (c: FoodDemoCtx) =>
  c.f.update(
    (s) => ({
      ...s,
      amy: s.tubes.map((_, i) => {
        const end = amyObservedEnd(c.v, s, i);
        const key = amyInferenceKey(c.v, s, i);
        return { observation: amyTubeParts(c.v, s, i).map((p) => p.text).join('; '), claims: [...key.need, ...(key.allow.includes('OPTIMUM') ? (['OPTIMUM'] as AmyClaim[]) : [])], end: end === null ? 'no end point' : String(end), rate: end === null ? '0' : String(roundDp(1000 / end, 1)) };
      }),
    }),
    'amy-table',
  );

export function amyDemoScript(v: BioFoodVariant): Step[] {
  const tubes = [
    { bath: 'ICE' as const, boiled: false },
    { bath: 'BODY' as const, boiled: false },
    { bath: 'BOILING' as const, boiled: false },
    { bath: 'BODY' as const, boiled: true },
  ];
  const bodyEnd = amyTrueEnd(v, tubes[1]!, true) ?? 120;
  const iceEnd = amyTrueEnd(v, tubes[0]!, true) ?? 600;
  const lapse1 = Math.ceil(bodyEnd / 30) + 1;
  const lapse2 = Math.ceil(iceEnd / 30) + 1 - lapse1;
  const tick = (at: number): Beat => ({ at, run: (c) => (c.f.wait(30), c.f.spot('all')) });
  const steps: Step[] = [
    { id: 'intro', title: 'What we are doing', say: () => 'Watch me with my own saliva. Amylase digests starch; iodine shows when the starch has gone. I compare an ice-cold bath, 37 °C and boiling, with a boiled-saliva control.', ms: 5200, view: { mode: 'bench', focus: 'baths', spot: null }, point: 'amybath:BODY', beats: [] },
    ...setUp('AMYLASE'),
    { id: 'tile', title: 'Iodine on the spotting tile', say: () => 'A drop of iodine in every well of the spotting tile: yellow-brown.', ms: 3800, view: { mode: 'bench', focus: 'tile', spot: null }, point: 'tile', beats: [{ at: 1000, run: (c) => c.f.setTile() }] },
    {
      id: 'tubes',
      title: 'Starch and saliva in each bath',
      say: () => '5 cm³ of starch in one tube and 1 cm³ of saliva in another, in each bath: ice, 37 °C and boiling — and a control of boiled saliva at 37 °C. I leave them five minutes to reach the temperature.',
      ms: 7600,
      view: { mode: 'bench', focus: 'baths', spot: null },
      point: 'amybath:ICE',
      beats: [...tubes.map((t, k): Beat => ({ at: 600 + k * 900, run: (c) => c.f.addTube(t.bath, t.boiled) })), { at: 4800, run: (c) => c.f.equilibrate() }],
    },
    { id: 'mix', title: 'Mix and start timing', say: () => 'Now I pour each saliva into its starch and start the stopwatch, and put a drop of each mixture on a fresh iodine well straight away: blue-black, because starch is there.', ms: 5600, view: { mode: 'bench', focus: 'tile', spot: null }, point: 'stopwatch', beats: [{ at: 900, run: (c) => (c.f.mix(), c.f.spot('all')) }] },
    {
      id: 'drops',
      title: 'A drop every 30 seconds',
      say: () => `Every 30 seconds, a drop of each mixture on a fresh well. Watch the 37 °C row: by about ${Math.ceil(bodyEnd / 30) * 30} s the iodine stays yellow-brown — the end point.`,
      ms: Math.max(7000, lapse1 * 700 + 2500),
      view: { mode: 'bench', focus: 'tile', spot: null },
      point: 'tile',
      beats: Array.from({ length: lapse1 }, (_, k) => tick(800 + k * 700)),
    },
    {
      id: 'cold',
      title: 'The cold tube, later',
      say: () => `The ice-cold tube is much slower: its end point comes only at about ${Math.ceil(iceEnd / 30) * 30} s. The boiling tube and the boiled saliva stay blue-black — the enzyme has been denatured.`,
      ms: Math.max(7000, lapse2 * 280 + 3000),
      view: { mode: 'bench', focus: 'tile', spot: null },
      point: 'tile',
      beats: Array.from({ length: Math.max(0, lapse2) }, (_, k) => tick(600 + k * 280)),
    },
    { id: 'record', title: 'Record the results', say: () => 'For each tube: what the iodine did, the end-point time, and the rate, 1000 divided by the time. The fastest is the optimum.', ms: 6000, view: { mode: 'bench', focus: 'bench', spot: null }, point: 'book', panel: 'notebook', beats: [{ at: 1200, run: amyRecords }] },
  ];
  const ben = testBeats({ sample: '2', test: 'BENEDICT', steps: [], heat: 240, direct: false, at: 0 }, 500, 1200);
  steps.push(
    {
      id: 'benedict',
      title: "Benedict's on the 37 °C mixture",
      say: () => "Some of the 37 °C mixture with Benedict's in the boiling water bath: the blue turns green, yellow, then a brick-red precipitate. The starch has been digested to a reducing sugar, maltose.",
      ms: Math.max(7000, ben.end + 2500),
      view: { mode: 'bench', focus: 'bath', spot: null },
      point: 'bath',
      beats: [...ben.beats.map((b) => ({ ...b, run: (c: FoodDemoCtx) => b.run(c) })), { at: ben.end + 600, run: (c) => writeRow(c, c.s().tests.length - 1) }],
    },
    {
      id: 'optimum',
      title: 'The optimum',
      say: () => `So the optimum is about 37 °C — ${AMY_BATH_SHORT.BODY}. Cold slows the enzyme (${AMY_CLAIM_LABEL.SLOWED.toLowerCase()}); boiling denatures it.`,
      ms: 6000,
      view: { mode: 'bench', focus: 'bench', spot: null },
      point: 'book',
      panel: 'notebook',
      beats: [{ at: 1000, run: (c) => c.f.update((s) => ({ ...s, optimum: 'BODY' }), 'optimum:BODY') }],
    },
    { id: 'turn', title: 'Your turn!', say: () => 'Now it is your turn, with your own saliva. Let the tubes reach the temperature first, and test a drop every 30 seconds.', ms: 4500, view: { mode: 'bench', focus: 'bench', spot: null }, beats: [] },
  );
  return steps;
}

/** The demo: its own samples (or saliva) and in-memory state, played by the kit's demo engine. */
export function useFoodDemo({ studentSeed, task, startedAt, active, onFinished }: { studentSeed: number; task: FoodTask; startedAt: string; active: boolean; onFinished: () => void }) {
  const variant = useMemo(() => demoVariant(studentSeed, task), [studentSeed, task]);
  const fresh = () => ({ ...emptyBioFoodState(), task });
  const [state, setState] = useState<BioFoodState>(fresh);
  const f = useFoodTests({ seed: variant.seed, state, onChange: setState, readOnly: false, startedAt, variant });
  const steps = useMemo(() => (task === 'AMYLASE' ? amyDemoScript(variant) : foodDemoScript(variant)), [variant, task]);
  const ctx = (): FoodDemoCtx => ({ f, v: variant, s: () => f.ref.current });
  const player = useDemoPlayer<FoodDemoCtx>({
    steps,
    ctx,
    reset: () => {
      useFoodBench.setState({ active: -1, anim: null });
      f.ref.current = fresh();
      setState(f.ref.current);
    },
    goggles: (c) => c.s().log.some((e) => e.a === 'safety:goggles'),
    active,
    onFinished,
  });
  const panel = (id: string) =>
    id === 'notebook' || id === 'conclusion' ? (
      <section className="pointer-events-none absolute right-2 top-40 z-10 hidden max-h-[calc(100%-18rem)] w-[400px] overflow-hidden rounded-2xl bg-card p-3 text-card-foreground shadow-xl sm:block" aria-label="Demonstration notebook">
        {task === 'AMYLASE' ? (
          <AmyNotebook state={state} readOnly update={noop} active={state.tests.length - 1} setActive={noop} book className="border-0 p-0 shadow-none sm:p-0" />
        ) : id === 'conclusion' ? (
          <FoodConclusion state={state} readOnly update={noop} className="border-0 p-0 shadow-none sm:p-0" />
        ) : (
          <FoodNotebook state={state} readOnly update={noop} active={state.tests.length - 1} setActive={noop} book className="border-0 p-0 shadow-none sm:p-0" />
        )}
      </section>
    ) : null;
  return { player, state, f, panel, v: variant };
}
