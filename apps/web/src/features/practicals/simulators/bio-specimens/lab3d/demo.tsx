import { bioSpecimensVariant, emptyBioSpecimensState, emptySpecimenEntry, type BioSpecimensState, type BioSpecimensVariant, type SpecimenSet } from '@aischool/shared';
import { useMemo, useRef, useState } from 'react';
import { useDemoPlayer, type DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import { BENCH_IDLE, NEEDED, SPOTS, specSpot, useBench } from './scene-state';
import { AnswerSheet, LensView, RulerView, type SpecUpdate } from './sheet';

/**
 * Mrs Okon's demonstration at the specimen bench, on its own demo seed and
 * in-memory state: coat and gloves, the hand lens, recording one specimen
 * fully (name, group, labels, features, function), measuring with the ruler
 * and the drawing's magnification, how to compare, then gloves off and hands
 * washed. The demo seed is chosen so that the specimen she records and
 * measures is not on the student's own bench whenever the set allows it.
 */

export interface DemoCtx {
  v: BioSpecimensVariant;
  update: SpecUpdate;
  note: (a: string) => void;
  s: () => BioSpecimensState;
}
export type DemoStep = KitDemoStep<DemoCtx>;

export function demoSeed(studentSeed: number, set: SpecimenSet): number {
  const mine = new Set(bioSpecimensVariant(studentSeed, set).specimens.map((x) => x.id));
  for (let s = 7; s < 400; s++) {
    if (s === studentSeed) continue;
    const v = bioSpecimensVariant(s, set);
    if (!mine.has(v.specimens[v.measured]!.id)) return s;
  }
  return studentSeed === 7 ? 8 : 7;
}
const bench = (spot: (typeof SPOTS)[string]) => ({ mode: 'bench' as const, spot });

export function demoScript(v: BioSpecimensVariant): DemoStep[] {
  const i = v.measured;
  const sp = v.specimens[i]!;
  const n = v.specimens.length;
  const len = v.trueLength;
  const lenText = len < 2 ? len.toFixed(2) : len.toFixed(1);
  const mag = v.drawingLength / Number(lenText);
  const [a, b] = v.compare.map((k) => v.specimens[k]!);
  return [
    { id: 'welcome', title: 'Welcome to the demonstration', say: () => `Watch me work through a specimen bench like yours: ${v.info.title.toLowerCase()}. My specimens are not all the same as yours. Then it's your turn.`, ms: 5400, view: bench(SPOTS.bench!), beats: [] },
    {
      id: 'safety',
      title: 'Coat, gloves, hand lens and ruler',
      say: () => 'Lab coat on. From the cupboard: a hand lens and a ruler. Then disposable gloves — preserved specimens are kept in formalin, which is toxic.',
      ms: 6000,
      view: bench(SPOTS.gloves!),
      point: 'gloves',
      beats: [{ at: 300, run: (c) => c.note('safety:coat') }, ...NEEDED.map((x, k) => ({ at: 1400 + k * 600, run: (c: DemoCtx) => c.note(`collect:${x}`) })), { at: 3800, run: (c) => c.note('safety:gloves') }],
    },
    {
      id: 'lens',
      title: `Specimen ${sp.letter} under the hand lens`,
      say: () => `I hold the lens close to my eye and bring specimen ${sp.letter} up until it is sharp. I look at its shape, its parts, its colour and texture — and count the parts I can see.`,
      ms: 6500,
      view: bench(specSpot(i, n)),
      point: `spec:${sp.letter}`,
      panel: 'lens',
      beats: [{ at: 800, run: (c) => c.update((s) => ({ ...s, examined: [...s.examined, sp.letter] }), `lens:${sp.letter}`) }],
    },
    {
      id: 'record',
      title: `Recording ${sp.letter}`,
      say: () => `This is a ${sp.def.name.toLowerCase()}: one name only. Its ${v.info.classify.question.toLowerCase()}: ${sp.classification}. I drag each label to its part, then write two features I can see and one function linked to a structure.`,
      ms: 9000,
      view: bench(SPOTS.bench!),
      point: 'book',
      panel: 'sheet',
      beats: [
        { at: 600, run: (c) => setEntry(c, i, { name: sp.def.name }) },
        { at: 2000, run: (c) => setEntry(c, i, { classification: sp.classification }, `class:${sp.letter}`) },
        { at: 3600, run: (c) => setEntry(c, i, { labels: sp.def.parts.map((p) => p.label) }, `labels:${sp.letter}`) },
        { at: 5200, run: (c) => setEntry(c, i, { features: sp.def.features.split(/;\s*/).slice(0, 2).join('; ') }) },
        { at: 6800, run: (c) => setEntry(c, i, { functions: sp.def.functions.split(/[.;]\s*/)[0]! }) },
      ],
    },
    {
      id: 'ruler',
      title: `Measuring ${sp.letter}`,
      say: () => `I line the ruler's zero up with one end of ${sp.letter} — the zero, not the end of the ruler — and read the other end: ${lenText} cm. The unit goes with it.`,
      ms: 7000,
      view: bench(SPOTS.tools!),
      point: 'ruler',
      panel: 'ruler',
      beats: [
        { at: 600, run: (c) => c.note(`ruler:${sp.letter}`) },
        { at: 3600, run: (c) => c.update((s) => ({ ...s, measure: { ...s.measure, length: { value: lenText, unit: 'cm' } } })) },
      ],
    },
    {
      id: 'mag',
      title: 'Magnification of the drawing',
      say: () => `My drawing is ${v.drawingLength.toFixed(1)} cm long. Magnification = drawing length ÷ actual length = ${v.drawingLength.toFixed(1)} ÷ ${lenText} = ×${mag.toPrecision(3)}. Both lengths in the same unit, and no unit in the answer.`,
      ms: 7600,
      view: bench(SPOTS.bench!),
      point: 'book',
      panel: 'ruler',
      beats: [{ at: 4000, run: (c) => c.update((s) => ({ ...s, measure: { ...s.measure, magnification: { value: mag.toPrecision(3), unit: '' } } })) }],
    },
    {
      id: 'compare',
      title: `Comparing two specimens`,
      say: () => `To compare ${a.letter} and ${b.letter} I put them side by side. Similarities: features both have. Differences: one feature at a time, saying both sides — “${a.letter} has …, whereas ${b.letter} has …”.`,
      ms: 7600,
      view: bench(SPOTS.trays!),
      point: `spec:${a.letter}`,
      beats: [],
    },
    {
      id: 'drawing',
      title: 'Drawing practice',
      say: () => 'A large drawing with clean, single lines in pencil; ruled label lines that do not cross, with no arrowheads; labels to the side; a title and the magnification. No shading.',
      ms: 7000,
      view: bench(SPOTS.bench!),
      point: 'book',
      beats: [{ at: 2500, run: (c) => c.update((s) => ({ ...s, drawing: c.v.drawing.filter((d) => d.good).map((d) => d.id) }), 'drawing') }],
    },
    {
      id: 'tidy',
      title: 'Gloves off, hands washed',
      say: () => "Gloves off and into the bin, then I wash my hands with soap at the hand-washing point. Now it's your turn!",
      ms: 5200,
      view: bench(SPOTS.gloves!),
      point: 'gloves',
      beats: [
        { at: 900, run: (c) => c.note('safety-off:gloves') },
        { at: 2400, run: (c) => c.note('wash-hands') },
      ],
    },
  ];
}
function setEntry(c: DemoCtx, i: number, patch: Partial<BioSpecimensState['entries'][number]>, log?: string) {
  c.update((s) => {
    const entries = c.v.specimens.map((_, k) => s.entries[k] ?? emptySpecimenEntry());
    entries[i] = { ...entries[i]!, ...patch };
    return { ...s, entries };
  }, log);
}

const noop = () => undefined;
export function useSpecimensDemo({ studentSeed, set, active, onFinished }: { studentSeed: number; set: SpecimenSet; active: boolean; onFinished: () => void }) {
  const seed = useMemo(() => demoSeed(studentSeed, set), [studentSeed, set]);
  const v = useMemo(() => bioSpecimensVariant(seed, set), [seed, set]);
  const empty = useMemo(() => () => ({ ...emptyBioSpecimensState(), set, entries: v.specimens.map(() => emptySpecimenEntry()) }), [set, v]);
  const [state, setState] = useState<BioSpecimensState>(empty);
  const ref = useRef(state);
  ref.current = state;
  const update: SpecUpdate = (fn, log) => {
    let next = fn(ref.current);
    if (log) next = { ...next, log: [...next.log, { t: 0, a: log }].slice(-600) };
    ref.current = next;
    setState(next);
  };
  const note = (a: string) => update((s) => s, a);
  const steps = useMemo(() => demoScript(v), [v]);
  const player = useDemoPlayer<DemoCtx>({
    steps,
    ctx: () => ({ v, update, note, s: () => ref.current }),
    reset: () => {
      useBench.setState(BENCH_IDLE);
      ref.current = empty();
      setState(ref.current);
    },
    goggles: () => false,
    active,
    onFinished,
  });
  const panel = (id: string) =>
    id === 'lens' ? (
      <div className="pointer-events-none absolute inset-x-0 top-28 bottom-36 z-10 [&>div]:bg-transparent [&>div]:backdrop-blur-0 [&_button]:hidden [&_p]:hidden">
        <LensView v={v} index={v.measured} onPrev={noop} onNext={noop} onSheet={noop} onBack={noop} />
      </div>
    ) : id === 'ruler' ? (
      <div className="pointer-events-none absolute inset-x-0 top-28 z-10 hidden sm:block [&_section]:max-w-sm [&>div]:static [&>div]:bg-transparent [&>div]:p-0 [&>div]:backdrop-blur-0 [&_button]:hidden">
        <RulerView v={v} state={state} readOnly update={noop} onBack={noop} onLens={noop} aligned />
      </div>
    ) : id === 'sheet' ? (
      <section className="pointer-events-none absolute right-2 top-40 z-10 hidden max-h-[55%] w-[400px] overflow-hidden rounded-2xl bg-card p-3 text-card-foreground shadow-xl sm:block" aria-label="Demonstration answer sheet">
        <AnswerSheet v={v} state={state} readOnly update={noop} only={v.measured} />
      </section>
    ) : null;
  return { player, state, v, panel };
}
