import {
  ORG_CLAIM_LABEL,
  ORG_IDENT_LABEL,
  SOAP_ROWS,
  emptyChemOrganicState,
  orgCalcAnswer,
  orgIdealRecord,
  orgModelTests,
  orgObserve,
  orgSampleName,
  orgTestText,
  orgTruth,
  soapKey,
  soapParts,
  soapRun,
  type ChemOrganicState,
  type ChemOrganicVariant,
  type OrgRecord,
  type OrgStep,
  type OrgTask,
  type OrgTest,
} from '@aischool/shared';
import { useMemo, useState } from 'react';
import { useDemoPlayer, type DemoBeat, type DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import { useOrganic, type Organic } from '../actions';
import { OrgRecordAll } from '../notebook';
import { demoVariant, useOrgBench } from './bench';
import { neededFor } from './scene-state';

/**
 * Mrs Ada's demonstration on her own bench (demoVariant: never the student's
 * unknowns in the same order), on its own in-memory state, through the same
 * actions as the student's lab.
 */

export interface OrgDemoCtx {
  o: Organic;
  v: ChemOrganicVariant;
  s: () => ChemOrganicState;
}
type Beat = DemoBeat<OrgDemoCtx>;
type Step = KitDemoStep<OrgDemoCtx>;
const noop = () => undefined;
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

export function inferenceText(r: OrgRecord): string {
  const out: string[] = [];
  if (r.present.length) out.push(`${r.present.map((x) => ORG_CLAIM_LABEL[x]).join(', ')} present`);
  if (r.absent.length) out.push(`${r.absent.map((x) => ORG_CLAIM_LABEL[x]).join(', ')} absent`);
  return out.join('; ') || 'no conclusion from this test';
}

/** Beats that carry out a test (steps, then heating in 1-minute steps so the colour develops). */
function testBeats(t: OrgTest, start: number, gap: number): { beats: Beat[]; end: number } {
  const beats: Beat[] = [];
  let at = start;
  beats.push({ at, run: (c) => useOrgBench.setState({ active: c.o.doTest(t.sample, t.test), anim: null }) });
  const last = (c: OrgDemoCtx) => c.s().tests.length - 1;
  const pre: OrgStep[] = t.steps.filter((x) => x !== 'POUR' && x !== 'NH3' && x !== 'NEUTRALISE' && x !== 'BENEDICT' && x !== 'SPLINT' && x !== 'LIMEWATER');
  const post = t.steps.filter((x) => !pre.includes(x));
  for (const st of pre) beats.push({ at: (at += gap), run: (c) => c.o.addStep(last(c), st) });
  for (let d = 1; d < t.drops; d++) beats.push({ at: (at += gap / 2), run: (c) => c.o.addStep(last(c), 'CUSO4') });
  if (t.portions.length) beats.push({ at: (at += gap / 2), run: (c) => c.o.portion(last(c)) });
  for (let b = 0; b < t.boil; b += 120) beats.push({ at: (at += gap), run: (c) => (c.o.heat(last(c), 120), t.portions.length && c.o.portion(last(c))) });
  for (const st of post.filter((x) => x === 'NEUTRALISE' || x === 'BENEDICT' || x === 'SPLINT' || x === 'LIMEWATER')) beats.push({ at: (at += gap), run: (c) => c.o.addStep(last(c), st) });
  for (let h = 0; h < t.heat; h += 60)
    beats.push({
      at: (at += gap),
      run: (c) => {
        const i = last(c);
        useOrgBench.setState({ active: i, anim: { i, from: c.s().tests[i]!.heat, at: performance.now() } });
        c.o.heat(i, Math.min(60, t.heat - h));
      },
    });
  for (const st of post.filter((x) => x === 'POUR' || x === 'NH3')) beats.push({ at: (at += gap), run: (c) => c.o.addStep(last(c), st) });
  return { beats, end: at };
}
/** Applies a model test at once (the batched rows). */
function doAll(c: OrgDemoCtx, t: OrgTest) {
  const i = c.o.doTest(t.sample, t.test);
  if (i < 0) return;
  c.o.update((s) => ({ ...s, tests: s.tests.map((x, k) => (k === i ? { ...t } : x)) }));
  writeRow(c, i);
  useOrgBench.setState({ active: i, anim: null });
}
const writeRow = (c: OrgDemoCtx, n: number) => c.o.update((s) => ({ ...s, table: s.table.map((r, k) => (k === n ? orgIdealRecord(c.v, s.tests[k]!) : r)) }), `table:${n + 1}`);

const setUp = (task: OrgTask): Step[] => [
  {
    id: 'safety',
    title: 'Safety first',
    say: () => (task === 'SOAP' ? 'Lab coat and goggles on: hot sodium hydroxide is very corrosive and spits.' : 'Lab coat and goggles on. Organic liquids are flammable, so nothing goes near a flame: I warm tubes only in the water bath.'),
    ms: 4200,
    view: { mode: 'bench', focus: 'bench', spot: null },
    beats: [
      { at: 700, run: (c) => c.o.note('safety:coat') },
      { at: 1600, run: (c) => c.o.note('safety:goggles') },
    ],
  },
  {
    id: 'apparatus',
    title: 'Apparatus',
    say: () => (task === 'SOAP' ? 'A 250 cm³ beaker on a tripod and gauze over the burner, a glass rod, a measuring cylinder, a filter funnel and the balance.' : 'Clean test tubes, a holder, and the water bath: a beaker of water on a tripod over the burner. I light it now so it is hot when I need it.'),
    ms: 5200,
    view: { mode: 'bench', focus: task === 'SOAP' ? 'beaker' : 'bath', spot: null },
    point: task === 'SOAP' ? 'beaker' : 'bath',
    beats: [...neededFor(task).map((a, k): Beat => ({ at: 300 + k * 220, run: (c) => c.o.note(`collect:${a.id}`) })), { at: 3000, run: (c) => c.o.note('burner-on') }],
  },
];

export function tubeDemoScript(v: ChemOrganicVariant): Step[] {
  const tests = orgModelTests(v);
  const first = v.samples[0]!.letter;
  const mine = tests.filter((t) => t.sample === first);
  const rest = tests.filter((t) => t.sample !== first);
  const steps: Step[] = [{ id: 'intro', title: 'What we are doing', say: () => `Watch me test my own samples, not yours. For each one I do every test, then write the test, what I saw and what it shows.`, ms: 4800, view: { mode: 'bench', focus: 'samples', spot: null }, point: `sample:${first}`, beats: [] }, ...setUp(v.task)];
  mine.forEach((t, n) => {
    const { beats, end } = testBeats(t, 500, 1100);
    const out = orgObserve(v, t);
    const heat = t.heat > 0 || t.boil > 0;
    steps.push({
      id: `test-${n}`,
      title: `Test ${n + 1}: ${orgTestText(t).split(';')[0]}`,
      say: () => `${cap(orgTestText(t))}. I see: ${out.parts.map((x) => x.text).join('; ')}.`,
      ms: Math.max(6500, end + 2800),
      view: { mode: 'bench', focus: heat ? 'bath' : 'tube', spot: null },
      point: heat ? 'bath' : 'tube',
      beats,
    });
    const rec = orgIdealRecord(v, t);
    steps.push({ id: `record-${n}`, title: `Record test ${n + 1}`, say: () => `Observation: ${rec.observation}. Inference: ${inferenceText(rec)}.`, ms: 5200, view: { mode: 'bench', focus: 'tube', spot: null }, point: 'book', panel: 'notebook', beats: [{ at: 1200, run: (c) => writeRow(c, n) }] });
  });
  steps.push({
    id: 'others',
    title: 'The same tests on the others',
    say: () => 'I do the same tests on the other samples, each in a clean tube, and write every row.',
    ms: 7000,
    view: { mode: 'bench', focus: 'samples', spot: null },
    point: `sample:${v.samples[1]!.letter}`,
    panel: 'notebook',
    beats: rest.map((t, k): Beat => ({ at: 400 + k * 380, run: (c) => doAll(c, t) })),
  });
  const named = v.samples
    .filter((sm) => sm.letter !== 'H2O')
    .map((sm) => `${sm.letter}: ${orgTruth(v.task, sm.content).map((x) => ORG_IDENT_LABEL[x].toLowerCase()).join(' and ')}`)
    .join('; ');
  const a = orgCalcAnswer(v);
  steps.push(
    {
      id: 'conclude',
      title: 'Identification',
      say: () => `Putting the rows together — ${named}.`,
      ms: 7000,
      view: { mode: 'bench', focus: 'bench', spot: null },
      point: 'book',
      panel: 'notebook',
      beats: [{ at: 1200, run: (c) => c.o.update((s) => ({ ...s, conclusion: Object.fromEntries(c.v.samples.filter((x) => x.letter !== 'H2O').map((x) => [x.letter, orgTruth(c.v.task, x.content)])) }), 'concl') }],
    },
    {
      id: 'calc',
      title: 'The calculation',
      say: () => `${a.labels.map((l, k) => (l ? `${l}: ${a.values[k]} ${a.units[k]}` : '')).filter(Boolean).join('. ')}.`,
      ms: 6500,
      view: { mode: 'bench', focus: 'bench', spot: null },
      point: 'book',
      panel: 'notebook',
      beats: [{ at: 1000, run: (c) => c.o.update((s) => ({ ...s, calc: { a: String(a.values[0]), b: String(a.values[1]), c: a.values[2] === null ? '' : String(a.values[2]) } }), 'calc') }],
    },
    { id: 'turn', title: 'Your turn!', say: () => 'Now it is your turn with your own samples. Warm only in the water bath, and write exactly what you see.', ms: 4500, view: { mode: 'bench', focus: 'bench', spot: null }, beats: [] },
  );
  return steps;
}

export function soapDemoScript(v: ChemOrganicVariant): Step[] {
  const soap = (a: Parameters<Organic['soap']>[0], n = 0) => (c: OrgDemoCtx) => c.o.soap(a, n);
  const boilBeats: Beat[] = [];
  for (let m = 0; m < 18; m++) {
    boilBeats.push({ at: 500 + m * 420, run: soap('BOIL', 60) });
    if (m % 4 === 3) boilBeats.push({ at: 700 + m * 420, run: soap('WATER', 5) });
  }
  return [
    { id: 'intro', title: 'What we are doing', say: () => 'Watch me make soap from palm oil: fat boiled with alkali gives soap and glycerol.', ms: 4500, view: { mode: 'bench', focus: 'beaker', spot: null }, point: 'beaker', beats: [] },
    ...setUp('SOAP'),
    { id: 'oil', title: 'Oil and alkali', say: () => `10 cm³ of palm oil into the beaker — the balance reads ${v.soap.oilMass.toFixed(2)} g — then 20 cm³ of 20% sodium hydroxide.`, ms: 6000, view: { mode: 'bench', focus: 'balance', spot: null }, point: 'balance', beats: [{ at: 600, run: soap('OIL') }, { at: 1800, run: soap('WEIGH_OIL') }, { at: 4200, run: soap('NAOH') }] },
    { id: 'boil', title: 'Boil and stir', say: () => 'I boil it gently for about 18 minutes, stirring all the time, and add water when the level drops. It turns thick and creamy.', ms: 9500, view: { mode: 'bench', focus: 'beaker', spot: null }, point: 'beaker', beats: boilBeats },
    { id: 'brine', title: 'Salting out', say: () => 'Now saturated brine: soap is less soluble in salt water, so a solid layer of soap separates and floats.', ms: 5500, view: { mode: 'bench', focus: 'beaker', spot: null }, point: 'beaker', beats: [{ at: 1000, run: soap('BRINE') }, { at: 3500, run: (c) => (c.o.note('burner-off'), c.o.soap('COOL')) }] },
    { id: 'filter', title: 'Filter, wash, dry, weigh', say: () => `I filter off the soap, wash it with a little cold water to remove the alkali, press it dry and weigh it: ${(soapRun(v, demoEvents()).soapMass ?? 0).toFixed(2)} g.`, ms: 7000, view: { mode: 'bench', focus: 'funnel', spot: null }, point: 'funnel', beats: [{ at: 800, run: soap('FILTER') }, { at: 2000, run: soap('WASH') }, { at: 3000, run: soap('DRY') }, { at: 4500, run: soap('WEIGH_SOAP') }] },
    { id: 'lather', title: 'Lather test', say: () => 'A piece shaken with distilled water gives a lot of lather; with hard water, a white scum and little lather.', ms: 5500, view: { mode: 'bench', focus: 'lather', spot: null }, point: 'lather:soft', beats: [{ at: 1000, run: soap('LATHER_SOFT') }, { at: 2500, run: soap('LATHER_HARD') }] },
    {
      id: 'record',
      title: 'Record and calculate',
      say: () => {
        const r = soapRun(v, demoEvents());
        return `Theoretical soap = ${v.soap.oilMass.toFixed(2)} ÷ 806 × 3 × 278 = ${r.theory.toFixed(2)} g, so the yield is ${(((r.soapMass ?? 0) / r.theory) * 100).toFixed(1)}%. The by-product is glycerol.`;
      },
      ms: 7500,
      view: { mode: 'bench', focus: 'bench', spot: null },
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 1000,
          run: (c) =>
            c.o.update((s) => {
              const r = soapRun(c.v, s.soap);
              const rows = { ...s.soapRows };
              for (const row of SOAP_ROWS) rows[row] = { observation: soapParts(c.v, s.soap, row).map((p) => p.text).join('; '), claims: [...(soapKey(c.v, s.soap, row)?.need ?? [])] };
              return { ...s, soapRows: rows, readings: { oil: c.v.soap.oilMass.toFixed(2), soap: (r.soapMass ?? 0).toFixed(2), theory: r.theory.toFixed(2), yield: (((r.soapMass ?? 0) / r.theory) * 100).toFixed(1), byproduct: 'glycerol' } };
            }, 'soap-record'),
        },
      ],
    },
    { id: 'turn', title: 'Your turn!', say: () => 'Now it is your turn. Stir all the time, keep the water topped up, and weigh carefully.', ms: 4500, view: { mode: 'bench', focus: 'bench', spot: null }, beats: [] },
  ];
}
const demoEvents = () => {
  const e: { a: 'OIL' | 'WEIGH_OIL' | 'NAOH' | 'BOIL' | 'WATER' | 'BRINE' | 'COOL' | 'FILTER' | 'WASH' | 'DRY' | 'WEIGH_SOAP'; n: number }[] = [{ a: 'OIL', n: 0 }, { a: 'WEIGH_OIL', n: 0 }, { a: 'NAOH', n: 0 }];
  for (let m = 0; m < 18; m++) {
    e.push({ a: 'BOIL', n: 60 });
    if (m % 4 === 3) e.push({ a: 'WATER', n: 5 });
  }
  e.push({ a: 'BRINE', n: 0 }, { a: 'COOL', n: 0 }, { a: 'FILTER', n: 0 }, { a: 'WASH', n: 0 }, { a: 'DRY', n: 0 }, { a: 'WEIGH_SOAP', n: 0 });
  return e;
};

export function useOrgDemo({ studentSeed, task, startedAt, active, onFinished }: { studentSeed: number; task: OrgTask; startedAt: string; active: boolean; onFinished: () => void }) {
  const variant = useMemo(() => demoVariant(studentSeed, task), [studentSeed, task]);
  const fresh = () => ({ ...emptyChemOrganicState(), task });
  const [state, setState] = useState<ChemOrganicState>(fresh);
  const o = useOrganic({ seed: variant.seed, state, onChange: setState, readOnly: false, startedAt, variant });
  const steps = useMemo(() => (task === 'SOAP' ? soapDemoScript(variant) : tubeDemoScript(variant)), [variant, task]);
  const ctx = (): OrgDemoCtx => ({ o, v: variant, s: () => o.ref.current });
  const player = useDemoPlayer<OrgDemoCtx>({
    steps,
    ctx,
    reset: () => {
      useOrgBench.setState({ active: -1, anim: null });
      o.ref.current = fresh();
      setState(o.ref.current);
    },
    goggles: (c) => c.s().log.some((e) => e.a === 'safety:goggles'),
    active,
    onFinished,
  });
  const panel = (id: string) =>
    id === 'notebook' ? (
      <section className="pointer-events-none absolute right-2 top-40 z-10 hidden max-h-[calc(100%-18rem)] w-[400px] overflow-hidden rounded-2xl bg-card p-3 text-card-foreground shadow-xl sm:block" aria-label="Demonstration notebook">
        <OrgRecordAll v={variant} state={state} readOnly update={noop} active={state.tests.length - 1} setActive={noop} book />
      </section>
    ) : null;
  return { player, state, o, panel, v: variant };
}
export { orgSampleName };
