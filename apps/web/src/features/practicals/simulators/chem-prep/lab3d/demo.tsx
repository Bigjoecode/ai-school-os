import { PREP_ACTIONS, PREP_MCQ, emptyChemPrepState, prepCalcAnswer, prepIdealRecord, prepModelEvents, prepTubeTask, prepTubes, PREP_ROWS, type ChemPrepState, type ChemPrepVariant, type PrepEvent, type PrepTask } from '@aischool/shared';
import { useMemo, useState } from 'react';
import { useDemoPlayer, type DemoBeat, type DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import { usePrep, type Prep } from '../actions';
import { PrepRecordAll } from '../notebook';
import { prepReadout } from '../readout';
import { prepBenchSteps } from '../steps';
import { FOCUS_OF, demoVariant, usePrepBench } from './bench';
import { neededFor } from './scene-state';

/**
 * Mrs Ada's demonstration on her own bench (demoVariant: other readings than
 * the student's), on its own in-memory state, through the same actions as the
 * student's lab: the model method in chunks, one per milestone, each narrated
 * with what the bench then shows.
 */

export interface PrepDemoCtx {
  o: Prep;
  v: ChemPrepVariant;
  s: () => ChemPrepState;
}
type Beat = DemoBeat<PrepDemoCtx>;
type Step = KitDemoStep<PrepDemoCtx>;
const noop = () => undefined;

/** Applies one model event through the shared action (so the demo state is what the student's would be). */
function apply(c: PrepDemoCtx, e: PrepEvent) {
  const all = PREP_ACTIONS[c.v.task].filter((x) => x.a === e.a && (x.x ?? '') === e.x && (x.tube || (x.n ?? 0) === e.n));
  const d = all.find((x) => !c.o.blocked(x, e.n)) ?? all[0];
  if (!d) return;
  c.o.act(d, e.n);
  if (e.a === 'TUBE') usePrepBench.setState({ active: prepTubes(c.v.task, c.s().events).length - 1 });
  else if (d.tube) usePrepBench.setState({ active: e.n });
}
const LINE_OF: Record<string, string> = { bottle: 'Weighing bottle', balance: 'Balance', beaker: 'Beaker', flask: 'Flask 1', pipette: 'Pipette', flask2: 'Flask 2', dish: 'Dish', dflask: 'Distillation flask', thermometer: 'Thermometer', condenser: 'Condenser', receiver: 'Receiver', mortar: 'Tube', gtube: 'Tube', dryer: 'Drying', jar: 'Gas jar', trough: 'Gas jar' };
const objOf = (task: PrepTask, e: PrepEvent) => PREP_ACTIONS[task].find((x) => x.a === e.a && (x.x ?? '') === e.x)?.obj ?? 'bench';

function setUp(task: PrepTask): Step[] {
  return [
    {
      id: 'safety',
      title: 'Safety first',
      say: () => `Lab coat and goggles on. ${task === 'AMMONIA' ? 'Ammonia irritates the eyes, so I work by the open window.' : task === 'HALOGEN' ? 'Chlorine and bromine are toxic: dilute solutions, a ventilated room, and no flames near the hexane.' : task === 'DISTIL' ? 'A closed apparatus must never be heated.' : 'And I always use a pipette filler.'}`,
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
      say: () => `I collect: ${neededFor(task).map((a) => a.label.toLowerCase()).join('; ')}.`,
      ms: 5200,
      view: { mode: 'bench', focus: 'bench', spot: null },
      beats: neededFor(task).map((a, k): Beat => ({ at: 300 + k * 260, run: (c) => c.o.note(`collect:${a.id}`) })),
    },
  ];
}

export function prepDemoScript(v: ChemPrepVariant): Step[] {
  const task = v.task;
  const events = prepModelEvents(v);
  const steps: Step[] = [{ id: 'intro', title: 'What we are doing', say: () => 'Watch me do it on my own bench, with my own readings, not yours. Then it is your turn.', ms: 4200, view: { mode: 'bench', focus: 'bench', spot: null }, beats: [] }, ...setUp(task)];
  let from = 0;
  let doneBefore = new Set<string>();
  const s0 = emptyChemPrepState();
  for (let i = 0; i < events.length; i++) {
    const part = { ...s0, task, events: events.slice(0, i + 1) };
    const ms = prepBenchSteps(v, part);
    const fresh = ms.filter((m) => m.done && !doneBefore.has(m.id));
    if (!fresh.length && i < events.length - 1) continue;
    const chunk = events.slice(from, i + 1);
    const m = fresh.at(-1) ?? ms.at(-1)!;
    const tubeI = prepTubeTask(task) ? prepTubes(task, part.events).length - 1 : -1;
    const seen = prepTubeTask(task) ? prepReadout(v, part, tubeI).slice(2).join(' ') : prepReadout(v, part, -1).filter((l) => l.startsWith(LINE_OF[m.target] ?? '@')).join('. ');
    const gap = Math.max(250, Math.min(900, 5200 / chunk.length));
    const focus = FOCUS_OF[objOf(task, chunk.at(-1)!)] ?? 'bench';
    steps.push({
      id: `m-${m.id}-${i}`,
      title: m.label.replace(/\s*\(.*?\)\s*$/, ''),
      say: () => `${m.label.replace(/\s*\(.*?\)\s*$/, '')}. ${m.why} ${seen ? `Now: ${seen}.` : ''}`,
      ms: Math.max(6000, chunk.length * gap + 3200),
      view: { mode: 'bench', focus, spot: null },
      point: m.target,
      beats: chunk.map((e, k): Beat => ({ at: 400 + k * gap, run: (c) => apply(c, e) })),
    });
    for (const x of fresh) doneBefore.add(x.id);
    doneBefore = new Set([...doneBefore, ...ms.filter((x) => x.done).map((x) => x.id)]);
    from = i + 1;
  }
  const rows = (s: ChemPrepState) => (prepTubeTask(task) ? prepTubes(task, s.events).map((_, i) => `t${i}`) : PREP_ROWS[task]);
  const a = prepCalcAnswer(v, events);
  steps.push(
    {
      id: 'record',
      title: 'Record what I saw',
      say: () => 'In the notebook: exactly what I saw for each one, and what it shows — never more than the result shows.',
      ms: 6500,
      view: { mode: 'bench', focus: 'bench', spot: null },
      point: 'book',
      panel: 'notebook',
      beats: [{ at: 1000, run: (c) => c.o.update((s) => ({ ...s, records: Object.fromEntries(rows(s).map((r) => [r, prepIdealRecord(c.v, s.events, r)])) }), 'demo-record') }],
    },
    {
      id: 'calc',
      title: 'Readings and calculation',
      say: () => `${Object.entries(a).filter(([, x]) => x).map(([k, x]) => `${k}: ${x}`).join('; ')}.`,
      ms: 7000,
      view: { mode: 'bench', focus: 'bench', spot: null },
      point: 'book',
      panel: 'notebook',
      beats: [{ at: 1000, run: (c) => c.o.update((s) => ({ ...s, readings: { ...prepCalcAnswer(c.v, s.events) }, choices: Object.fromEntries(PREP_MCQ[task].map((q) => [q.id, [...q.answer]])) }), 'demo-calc') }],
    },
    { id: 'turn', title: 'Your turn!', say: () => 'Now it is your turn, with your own readings. Write exactly what you see.', ms: 4500, view: { mode: 'bench', focus: 'bench', spot: null }, beats: [] },
  );
  return steps;
}

export function usePrepDemo({ studentSeed, task, startedAt, active, onFinished }: { studentSeed: number; task: PrepTask; startedAt: string; active: boolean; onFinished: () => void }) {
  const variant = useMemo(() => demoVariant(studentSeed, task), [studentSeed, task]);
  const fresh = () => ({ ...emptyChemPrepState(), task });
  const [state, setState] = useState<ChemPrepState>(fresh);
  const o = usePrep({ seed: variant.seed, state, onChange: setState, readOnly: false, startedAt, variant });
  const steps = useMemo(() => prepDemoScript(variant), [variant]);
  const ctx = (): PrepDemoCtx => ({ o, v: variant, s: () => o.ref.current });
  const player = useDemoPlayer<PrepDemoCtx>({
    steps,
    ctx,
    reset: () => {
      usePrepBench.setState({ active: -1 });
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
        <PrepRecordAll v={variant} state={state} readOnly update={noop} book />
      </section>
    ) : null;
  return { player, state, o, panel, v: variant };
}
