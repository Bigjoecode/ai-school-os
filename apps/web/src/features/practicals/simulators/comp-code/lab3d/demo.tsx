import { COMP_MCQ, COMP_TASK_TITLE, compFamily, compFields, compModelChart, compModelSource, compModelState, compTraces, crimpModelEvents, emptyCompCodeState, runBasic, MAINT_ACTIONS, MAINT_MODEL, type CompCodeState, type CompCodeVariant, type CompEvent, type CompTask, type FlowChart } from '@aischool/shared';
import { useMemo, useState } from 'react';
import { useDemoPlayer, type DemoBeat, type DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import { useComp, type Comp } from '../actions';
import { CrimpBench, MaintBench } from '../bench';
import { CodeEditor } from '../editor';
import { FlowSheet } from '../flow-builder';
import { HtmlPreview } from '../html-lab';
import { CompRecord } from '../notebook';
import { demoVariant, useCompBench } from './bench';
import { neededFor } from './scene-state';

/**
 * Mr Bayo's demonstration at his own computer (demoVariant: another problem
 * than the student's), on its own in-memory state, through the same actions as
 * the student's lab: typing, running, tracing, working at the bench.
 */

export interface CompDemoCtx {
  o: Comp;
  v: CompCodeVariant;
  s: () => CompCodeState;
}
type Beat = DemoBeat<CompDemoCtx>;
type Step = KitDemoStep<CompDemoCtx>;
const noop = () => undefined;
const BENCH_VIEW = { mode: 'bench' as const, focus: 'bench', spot: null };
const SCREEN_VIEW = { mode: 'bench' as const, focus: 'monitor', spot: null };

const partial = (c: FlowChart, k: number): FlowChart => {
  const ids = new Set(c.nodes.slice(0, k).map((n) => n.id));
  return { nodes: c.nodes.slice(0, k), edges: c.edges.filter((e) => ids.has(e.from) && ids.has(e.to)) };
};

export function compDemoScript(v: CompCodeVariant): Step[] {
  const fam = compFamily(v.task);
  const steps: Step[] = [{ id: 'intro', title: 'What we are doing', say: () => `Watch me do it at my own computer, with a different problem from yours. Then it is your turn.`, ms: 4200, view: BENCH_VIEW, beats: [{ at: 400, run: noop }] }];
  if (neededFor(v.task).length) steps.push({ id: 'apparatus', title: 'Equipment', say: () => `I collect: ${neededFor(v.task).map((a) => a.label.toLowerCase()).join('; ')}.`, ms: 4600, view: BENCH_VIEW, beats: neededFor(v.task).map((a, k): Beat => ({ at: 300 + k * 260, run: (c) => c.o.note(`collect:${a.id}`) })) });
  if (fam !== 'BENCH') steps.push({ id: 'power', title: 'Switch on', say: () => 'UPS first, then the monitor, then the system unit.', ms: 3600, view: BENCH_VIEW, point: 'sysunit', beats: [{ at: 900, run: (c) => c.o.note('power:on') }] });
  if (fam === 'BASIC')
    v.programs.forEach((p, i) => {
      const lines = compModelSource(v, p.id).split('\n');
      const gap = Math.min(650, 6200 / lines.length);
      steps.push({
        id: `type-${p.id}`,
        title: `Type program ${p.id}`,
        say: () => `${p.title}. I number the lines in tens, start with REM and finish with END.`,
        ms: lines.length * gap + 1800,
        view: SCREEN_VIEW,
        point: 'monitor',
        panel: 'screen',
        beats: [{ at: 50, run: () => useCompBench.setState({ tab: i }) }, ...lines.map((_, k): Beat => ({ at: 200 + k * gap, run: (c) => c.o.setSource(p.id, lines.slice(0, k + 1).join('\n')) }))],
      });
      steps.push({
        id: `run-${p.id}`,
        title: 'Run it',
        say: () => (p.sample.length ? `I run it and type ${p.sample.join(', ')}. Then I copy what it prints, exactly, and save it.` : 'I run it, copy what it prints, exactly, and save it.'),
        ms: 6500,
        view: SCREEN_VIEW,
        point: 'monitor',
        panel: 'screen',
        beats: [{ at: 800, run: (c) => c.o.note(`run:${p.id}:done`) }, { at: 3500, run: (c) => c.o.saveAs(p.id, p.file) }],
      });
    });
  if (fam === 'FLOW')
    v.programs.forEach((p, i) => {
      const chart = compModelChart(v, p.id);
      const gap = Math.min(800, 6500 / chart.nodes.length);
      steps.push({
        id: `draw-${p.id}`,
        title: `Chart ${p.id}`,
        say: () => `${p.title}. An oval to start, a parallelogram for input and output, a rectangle for each process, a diamond for each decision.`,
        ms: chart.nodes.length * gap + 2500,
        view: SCREEN_VIEW,
        point: 'monitor',
        panel: 'screen',
        beats: [{ at: 50, run: () => useCompBench.setState({ tab: i }) }, ...chart.nodes.map((_, k): Beat => ({ at: 300 + k * gap, run: (c) => c.o.setChart(p.id, partial(chart, k + 1)) }))],
      });
    });
  if (fam === 'HTML') {
    const lines = compModelSource(v, 'page').split('\n');
    const gap = 520;
    steps.push({
      id: 'type-page',
      title: 'Type the page',
      say: () => 'html, then the head with the title, then the body with what shows on the page. I close every tag.',
      ms: lines.length * gap + 2500,
      view: SCREEN_VIEW,
      point: 'monitor',
      panel: 'screen',
      beats: lines.map((_, k): Beat => ({ at: 200 + k * gap, run: (c) => c.o.setSource('page', lines.slice(0, k + 1).join('\n')) })),
    });
    steps.push({ id: 'save', title: 'Save it', say: () => 'I save it with the .html extension, then the browser shows the title on the tab.', ms: 4500, view: SCREEN_VIEW, point: 'monitor', panel: 'screen', beats: [{ at: 800, run: (c) => c.o.saveAs('page', 'mypage.html') }] });
  }
  if (v.task === 'CRIMP') {
    const ev = crimpModelEvents(v);
    const blocks: [string, string, CompEvent[]][] = [
      ['Cut, and boots on', `I cut ${v.crimp.run} m and slide the boots on first: they cannot go on later.`, ev.slice(0, 2)],
      ['End A', 'Strip 2.5 cm, untwist, arrange in T568B, trim to 1.3 cm, clip down, push in and crimp.', ev.slice(2, 8)],
      ['End B', 'The same order at the other end.', ev.slice(8, 14)],
      ['Test it', 'Lights 1 to 8 in the same order on both units.', ev.slice(14)],
    ];
    blocks.forEach(([title, say, list], i) => steps.push({ id: `c-${i}`, title, say: () => say, ms: Math.max(6000, list.length * 900 + 3000), view: BENCH_VIEW, point: 'crimper', panel: 'bench', beats: list.map((e, k): Beat => ({ at: 500 + k * 800, run: (c) => c.o.update((s) => ({ ...s, events: [...s.events, e] }), `ev:${e.a}:${e.x.slice(0, 8)}:${e.n}`) })) }));
  }
  if (v.task === 'MAINT')
    MAINT_MODEL.forEach(([a, x], i) => {
      const label = MAINT_ACTIONS.find((m) => m.a === a && m.x === x)?.label ?? a;
      steps.push({ id: `m-${i}`, title: label, say: () => `${label}.`, ms: 2600, view: BENCH_VIEW, panel: 'bench', beats: [{ at: 500, run: (c) => c.o.act(a, x) }] });
    });
  steps.push(
    {
      id: 'record',
      title: 'Record my results',
      say: () => 'In the notebook: exactly what the computer printed, then the table and the questions.',
      ms: 6500,
      view: BENCH_VIEW,
      point: 'book',
      panel: 'notebook',
      beats: [
        {
          at: 1000,
          run: (c) => {
            const m = compModelState(c.v);
            c.o.update((s) => ({ ...s, readings: Object.fromEntries(compFields(c.v).map((f) => [f.id, f.answer])), trace: Object.fromEntries(compTraces(c.v).map((t) => [t.id, t.rows.map((r) => [...r])])), choices: Object.fromEntries(COMP_MCQ[c.v.task].map((q) => [q.id, [q.answer]])), names: { ...s.names, ...m.names } }), 'demo-record');
          },
        },
      ],
    },
    { id: 'turn', title: 'Your turn!', say: () => 'Now it is your turn, with your own problem. Your program will also be run on numbers you cannot see, so make it work for any values.', ms: 5000, view: BENCH_VIEW, beats: [] },
  );
  return steps;
}

function DemoScreen({ v, state }: { v: CompCodeVariant; state: CompCodeState }) {
  const tab = useCompBench((b) => b.tab);
  const fam = compFamily(v.task);
  const p = v.programs[Math.min(tab, v.programs.length - 1)];
  if (!p) return null;
  if (fam === 'FLOW') return <FlowSheet chart={state.charts[p.id] ?? { nodes: [], edges: [] }} label={`Chart ${p.id}`} />;
  if (fam === 'HTML')
    return (
      <div className="space-y-2">
        <CodeEditor value={state.programs.page ?? ''} onChange={noop} lang="html" readOnly label="HTML editor" rows={8} />
        <HtmlPreview source={state.programs.page ?? ''} fileName={state.names.page || 'untitled.html'} />
      </div>
    );
  const src = state.programs[p.id] ?? '';
  const ran = state.log.some((e) => e.a === `run:${p.id}:done`);
  const out = ran ? runBasic(src, p.sample).output : '';
  return (
    <div className="space-y-2">
      <CodeEditor value={src} onChange={noop} lang="basic" readOnly label={`Program ${p.id}`} rows={9} />
      {ran && <pre className="m-0 max-h-32 overflow-auto rounded-xl bg-black p-2 font-mono text-[12.5px] text-[#d1fae5]">{out}</pre>}
    </div>
  );
}

export function useCompDemo({ studentSeed, task, startedAt, active, onFinished }: { studentSeed: number; task: CompTask; startedAt: string; active: boolean; onFinished: () => void }) {
  const variant = useMemo(() => demoVariant(studentSeed, task), [studentSeed, task]);
  const fresh = () => ({ ...emptyCompCodeState(), task });
  const [state, setState] = useState<CompCodeState>(fresh);
  const o = useComp({ seed: variant.seed, state, onChange: setState, readOnly: false, startedAt, variant });
  const steps = useMemo(() => compDemoScript(variant), [variant]);
  const ctx = (): CompDemoCtx => ({ o, v: variant, s: () => o.ref.current });
  const player = useDemoPlayer<CompDemoCtx>({
    steps,
    ctx,
    reset: () => {
      useCompBench.setState({ tab: 0 });
      o.ref.current = fresh();
      setState(o.ref.current);
    },
    active,
    onFinished,
  });
  const shell = 'pointer-events-none absolute right-2 top-16 z-10 max-h-[calc(100%-13rem)] w-[min(460px,calc(100%-1rem))] overflow-hidden rounded-2xl bg-card p-3 text-card-foreground shadow-xl';
  const panel = (id: string) => {
    if (id === 'screen')
      return (
        <section className={shell} aria-label="Demonstration screen">
          <p className="mb-1 text-[12px] font-semibold">{COMP_TASK_TITLE[task]}</p>
          <DemoScreen v={variant} state={state} />
        </section>
      );
    if (id === 'bench') return <section className={shell} aria-label="Demonstration bench">{task === 'CRIMP' ? <CrimpBench c={o} readOnly /> : <MaintBench c={o} readOnly />}</section>;
    if (id === 'notebook')
      return (
        <section className={`${shell} hidden sm:block`} aria-label="Demonstration notebook">
          <CompRecord v={variant} state={state} readOnly w={o} book />
        </section>
      );
    return null;
  };
  return { player, state, o, panel, v: variant };
}
