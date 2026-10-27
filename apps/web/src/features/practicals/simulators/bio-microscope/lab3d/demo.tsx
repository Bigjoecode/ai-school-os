import {
  MICRO_MEDIUM_LABELS,
  MICRO_ORGANISM_PARTS,
  bioMicroscopeAnswers,
  emptyBioMicroscopeState,
  microIdentityAnswer,
  microIsStained,
  type BioMicroscopeState,
  type BioMicroscopeVariant,
  type MicroObjective,
  type MicroSlide,
} from '@aischool/shared';
import { useMemo, useState } from 'react';
import { useDemoPlayer, type DemoBeat, type DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import { useMicroscope, type Microscope } from '../actions';
import { FieldView } from '../field';
import { Notebook } from '../notebook';
import { NEEDED, SPECIMEN_STEP } from './scene-state';
import { BENCH_IDLE, SPOTS, useBench } from './spots';

/**
 * Mrs Okon's demonstration: the whole microscope practical for the student's
 * slide, on its own demo seed (never the student's, so their own cell sizes,
 * focus positions and answers are not shown) and its own in-memory state
 * (never the attempt's), through the same actions as the student's lab.
 * Jumping to a step replays the earlier beats instantly from an empty state.
 */

export interface DemoCtx {
  m: Microscope;
  v: BioMicroscopeVariant;
  s: () => BioMicroscopeState;
}
type Beat = DemoBeat<DemoCtx>;
export type DemoStep = KitDemoStep<DemoCtx>;

/** A demo seed that is never the student's own. */
export const demoSeed = (studentSeed: number) => (studentSeed === 7 ? 8 : 7);
const bench = (k: keyof typeof SPOTS) => ({ mode: 'bench' as const, spot: SPOTS[k]! });
const fmt = (x: number) => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toPrecision(3));
const r = (x: number, step: number) => Math.round(x / step) * step;

/** Beats that move a control smoothly to `to` in steps (each beat one step). */
function ramp(start: number, from: number, to: number, step: number, every: number, run: (x: number) => (c: DemoCtx) => void): { beats: Beat[]; end: number } {
  const beats: Beat[] = [];
  const n = Math.max(1, Math.ceil(Math.abs(to - from) / step));
  for (let i = 1; i <= n; i++) beats.push({ at: start + i * every, run: run(i === n ? to : from + ((to - from) * i) / n) });
  return { beats, end: start + n * every };
}

/** The demo's lighting: unstained, colourless specimens need the diaphragm partly closed (and more lamp). */
const lightFor = (v: BioMicroscopeVariant) => (microIsStained(v.slide, v.info.media[0]!) ? { lamp: 60, diaphragm: 100 } : { lamp: 90, diaphragm: 55 });

export function demoScript(v: BioMicroscopeVariant): DemoStep[] {
  const info = v.info;
  const slide = v.slide;
  const medium = info.media[0]!;
  const sp = SPECIMEN_STEP[slide];
  const light = lightFor(v);
  const f4 = v.focus[4];
  const coarse = r(f4, 0.5);
  const fineFor = (o: MicroObjective) => Math.max(-2, Math.min(2, r(v.focus[o] - coarse, 0.02)));
  const collect: Beat[] = NEEDED[slide].map((a, i) => ({ at: 500 + i * 350, run: (c) => c.m.note(`collect:${a}`) }));
  const lamp = ramp(300, 15, light.lamp, 10, 140, (x) => (c) => c.m.setScope({ lamp: Math.round(x) }, 'light'));
  const coarseUp = ramp(300, 10, coarse, 2.5, 110, (x) => (c) => c.m.setScope({ coarse: r(x, 0.5) }, 'coarse'));
  const fineIn = ramp(coarseUp.end + 300, 0, fineFor(4), 0.06, 120, (x) => (c) => c.m.setScope({ fine: r(x, 0.02) }, 'fine'));
  const ans = bioMicroscopeAnswers(v);
  const steps: DemoStep[] = [
    { id: 'welcome', title: 'Welcome to the demonstration', say: () => `Watch me prepare and examine a slide: ${info.title.toLowerCase()}. My specimen is not the same as yours, so my sizes and answers are different. Then it's your turn.`, ms: 5600, view: bench('bench'), beats: [] },
    {
      id: 'safety',
      title: 'Coat on, then the apparatus',
      say: () => `Lab coat on. From the cupboard I carry the microscope with one hand under the base and the other on the arm, then the slides and cover slips, a mounted needle and the rest.`,
      ms: 6200,
      view: bench('bench'),
      beats: [{ at: 300, run: (c) => c.m.note('safety:coat') }, ...collect],
    },
    {
      id: 'drop',
      title: `A clean slide and a drop of ${MICRO_MEDIUM_LABELS[medium].toLowerCase()}`,
      say: () => (medium === 'NONE' ? 'A clean slide on the white tile. I mount this one dry.' : `A clean slide on the white tile, held by its edges. One drop of ${MICRO_MEDIUM_LABELS[medium].toLowerCase()} in the middle.`),
      ms: 5200,
      view: bench('prep'),
      point: 'tile',
      beats: [
        { at: 500, run: (c) => c.m.note('take-slide') },
        { at: 2000, run: (c) => (useBench.setState({ dropAt: performance.now() }), c.m.update((x) => ({ ...x, prep: { ...x.prep, medium } }), `medium:${medium}`)) },
      ],
    },
    { id: 'specimen', title: 'The specimen, thin and flat', say: () => `${sp.action}. A thin, single layer lets the light through — no folds.`, ms: 5600, view: bench('tile'), point: 'tile', beats: [{ at: 2600, run: (c) => c.m.note('specimen-on') }] },
    {
      id: 'coverslip',
      title: 'Cover slip at an angle',
      say: () => 'I touch one edge of the cover slip to the drop and lower it slowly on the mounted needle. The liquid pushes the air out ahead of it: no bubbles. Then I blot off the extra liquid.',
      ms: 6400,
      view: bench('tile'),
      point: 'tile',
      beats: [
        ...[0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((x, i) => ({ at: 500 + i * 300, run: () => useBench.setState({ lowering: x }) })),
        { at: 2500, run: (c) => (useBench.setState({ lowering: 0 }), c.m.update((x) => ({ ...x, prep: { ...x.prep, coverslip: 'ANGLE' } }), 'coverslip:angle')) },
        ...(medium === 'NONE' ? [] : [{ at: 4200, run: (c: DemoCtx) => c.m.note('blot') }]),
      ],
    },
    {
      id: 'stage',
      title: 'On the stage, ×4 in place',
      say: () => 'The slide goes on the stage with the specimen over the hole, and the clips hold it. The lowest-power objective, ×4, is in place.',
      ms: 4600,
      view: bench('stage'),
      point: 'stage',
      beats: [{ at: 1200, run: (c) => c.m.update((x) => ({ ...x, prep: { ...x.prep, placed: true, clipped: true }, scope: { ...x.scope, objective: 4 } }), 'place-slide') }],
    },
    {
      id: 'light',
      title: 'Light and contrast',
      say: () => (light.diaphragm < 100 ? 'I turn up the lamp, then close the diaphragm a little: this specimen is colourless, and it needs contrast to show its edges.' : 'I turn up the lamp until the field is evenly lit. The stain gives the cells their colour, so the diaphragm can stay open.'),
      ms: 4800,
      view: bench('knobs'),
      point: 'lamp',
      panel: 'field',
      beats: [...lamp.beats, { at: lamp.end + 500, run: (c) => c.m.setScope({ diaphragm: light.diaphragm }, 'light') }],
    },
    {
      id: 'focus-low',
      title: 'Focus at low power',
      say: () => 'Watching from the side, I raise the stage with the coarse focus. Then, looking through the eyepiece, I sharpen the image with the fine focus.',
      ms: Math.max(6000, fineIn.end + 800),
      view: bench('knobs'),
      point: 'coarse',
      panel: 'field',
      beats: [...coarseUp.beats, ...fineIn.beats],
    },
  ];
  const captureAt = (o: MicroObjective, id: string, why: string): DemoStep => {
    const fine = ramp(1300, fineFor(4), fineFor(o), 0.04, 120, (x) => (c) => c.m.setScope({ fine: r(x, 0.02) }, 'fine'));
    return {
      id,
      title: o === 4 ? `Capture the ×4 view` : `Turn to ×${o}: fine focus only`,
      say: () => (o === 40 ? `I turn the nosepiece to ×40 — it clicks into place. At high power I use only the fine focus. ${why}` : o === 4 ? `This ×4 view is sharp. ${why}` : `I turn to ×${o} and sharpen it with the fine focus. ${why}`),
      ms: Math.max(5200, fine.end + 1600),
      view: bench('stage'),
      point: o === 4 ? 'eyepiece' : 'turret',
      panel: 'field',
      beats: [...(o === 4 ? [] : [{ at: 500, run: (c: DemoCtx) => c.m.setScope({ objective: o }, 'objective', `objective:${o}`) }]), ...(o === 4 ? [] : fine.beats), { at: Math.max(1200, fine.end + 500), run: (c) => c.m.capture() }],
    };
  };
  const mo = info.measureObjective;
  const lo = info.labelObjective;
  steps.push(captureAt(mo, `capture-${mo}`, info.method === 'COUNT' ? 'I capture it to count the cells across the field of view.' : info.method === 'GRATICULE' ? 'I capture it to measure with the eyepiece graticule.' : 'I capture it to count the stomata.'));
  if (lo !== mo) steps.push(captureAt(lo, `capture-${lo}`, 'High power needs a little more light. I capture this view to label.'));
  steps.push(
    {
      id: 'measure',
      title: 'Measuring',
      say: () => calcLines(v)[0]!,
      ms: 8000,
      view: bench('scope'),
      point: 'eyepiece',
      panel: 'calc',
      beats: [],
    },
    {
      id: 'notebook',
      title: 'Label, measure, calculate',
      say: () => 'In the notebook I label each numbered structure, answer the question, and write my measurement and magnifications — magnification has no unit, only ×.',
      ms: 7000,
      view: bench('bench'),
      point: 'book',
      panel: 'notebook',
      beats: [
        { at: 600, run: (c) => c.m.update((x) => ({ ...x, labels: c.v.targets.map((t) => t.label) }), 'labels') },
        { at: 1600, run: (c) => c.m.update((x) => ({ ...x, identity: microIdentityAnswer(c.v, x.prep.medium) }), 'identity') },
        {
          at: 2800,
          run: (c) =>
            c.m.update((x) => ({
              ...x,
              answers: {
                reading: { value: fmt(ans.reading), unit: '' },
                size: { value: fmt(ans.size), unit: info.method === 'STOMATA' ? 'per mm²' : 'µm' },
                totalMag: { value: String(ans.totalMag), unit: '' },
                drawingMag: { value: fmt(ans.drawingMag), unit: '' },
              },
            })),
        },
        { at: 4200, run: (c) => c.m.update((x) => ({ ...x, drawing: c.v.drawing.filter((d) => d.good).map((d) => d.id) }), 'drawing') },
      ],
    },
    {
      id: 'tidy',
      title: 'Tidy up and wash your hands',
      say: () => `${slide === 'CHEEK' ? 'The cotton bud went into the disinfectant. ' : ''}The used slide goes in the sharps jar, never the bin. I clean the lenses with lens tissue and wash my hands. Now it's your turn!`,
      ms: 5600,
      view: bench('bin'),
      point: 'bin',
      beats: [
        ...(slide === 'CHEEK' ? [{ at: 300, run: (c: DemoCtx) => c.m.note('dispose-swab') }] : []),
        { at: 900, run: (c) => c.m.note('dispose-slide') },
        { at: 2200, run: (c) => c.m.note('clean-lens') },
        { at: 3400, run: (c) => c.m.note('wash-hands') },
      ],
    },
  );
  return steps;
}

/** The worked measurement from the demo's own specimen (same method as the lesson). */
export function calcLines(v: BioMicroscopeVariant): string[] {
  const a = bioMicroscopeAnswers(v);
  const info = v.info;
  const mo = info.measureObjective;
  const lines =
    info.method === 'COUNT'
      ? [
          `At ×${mo} the field of view is ${v.fov[mo]} mm = ${(v.fov[mo] * 1000).toFixed(0)} µm across. Along the diameter line I count about ${fmt(a.reading)} cells.`,
          `One cell ≈ ${(v.fov[mo] * 1000).toFixed(0)} µm ÷ ${fmt(a.reading)} = ${fmt(a.size)} µm long.`,
        ]
      : info.method === 'GRATICULE'
        ? [
            `On the eyepiece graticule the ${v.slide === 'CHEEK' ? 'cheek cell' : v.organism ? MICRO_ORGANISM_PARTS[v.organism].name : 'stem section'} spans ${fmt(a.reading)} units. At ×${mo}, one unit = ${v.calibration[mo]} µm.`,
            `Actual length = ${fmt(a.reading)} × ${v.calibration[mo]} µm = ${fmt(a.size)} µm.`,
          ]
        : [
            `I count ${a.reading} stomata whose centres are inside the field of view at ×40. The field is ${v.fov[40]} mm across, so its area = π × (${v.fov[40]} ÷ 2)² mm².`,
            `Stomatal density = ${a.reading} ÷ ${(Math.PI * (v.fov[40] / 2) ** 2).toPrecision(3)} = ${fmt(a.size)} per mm².`,
          ];
  return [
    ...lines,
    `Total magnification = eyepiece × objective = ${v.eyepiece} × ${info.labelObjective} = ×${a.totalMag}.`,
    `Drawing magnification = drawing size ÷ actual size, in the same units = ${v.drawingLength} mm ÷ ${(v.drawnActual / 1000).toPrecision(3)} mm = ×${fmt(a.drawingMag)}.`,
  ];
}

const noop = () => undefined;
/** The microscope demo: its own seed and in-memory state, played by the kit's demo engine. */
export function useMicroscopeDemo({ studentSeed, slide, startedAt, active, onFinished }: { studentSeed: number; slide: MicroSlide | null; startedAt: string; active: boolean; onFinished: () => void }) {
  const seed = useMemo(() => demoSeed(studentSeed), [studentSeed]);
  const empty = useMemo(() => () => ({ ...emptyBioMicroscopeState(), slide: slide ?? 'ONION' }), [slide]);
  const [state, setState] = useState<BioMicroscopeState>(empty);
  const m = useMicroscope({ seed, state, onChange: setState, readOnly: false, startedAt });
  const v = m.v!;
  const steps = useMemo(() => (v ? demoScript(v) : []), [v]);
  const ctx = (): DemoCtx => ({ m, v, s: () => m.ref.current });
  const player = useDemoPlayer<DemoCtx>({
    steps,
    ctx,
    reset: () => {
      useBench.setState(BENCH_IDLE);
      m.ref.current = empty();
      setState(m.ref.current);
    },
    goggles: () => false,
    onEnter: () => useBench.setState({ lowering: 0 }),
    active,
    onFinished,
  });
  const cap = (o: MicroObjective) => state.captures.find((c) => c.objective === o) ?? null;
  const fieldBase = v ? { v, medium: state.prep.medium, coverslip: state.prep.coverslip, placed: state.prep.placed, crashed: state.flags.crashed } : null;
  /** The demo's side panels: the field of view, the worked measurement, its notebook. */
  const panel = (id: string) =>
    !fieldBase ? null : id === 'field' ? (
      <section className="pointer-events-none absolute right-2 top-40 z-10 w-[min(42vw,300px)] rounded-full bg-black/60 p-1.5 shadow-xl sm:w-[300px]" aria-label="What Mrs Okon sees through the eyepiece">
        <FieldView {...fieldBase} scope={state.scope} graticule={v.info.method === 'GRATICULE'} pointer={v.info.method === 'COUNT'} label="Demonstration field of view" className="w-full" />
      </section>
    ) : id === 'calc' ? (
      <section className="absolute inset-x-2 top-40 z-10 mx-auto max-w-lg rounded-2xl bg-card p-4 text-card-foreground shadow-xl" aria-label="Worked measurement">
        <p className="font-display text-[15px] font-semibold tracking-tight">Worked measurement (demonstration values)</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px]">
          {calcLines(v).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ol>
      </section>
    ) : id === 'notebook' ? (
      <section className="pointer-events-none absolute right-2 top-40 z-10 hidden max-h-[55%] w-[400px] overflow-hidden rounded-2xl bg-card p-1 text-card-foreground shadow-xl sm:block" aria-label="Demonstration notebook">
        <Notebook v={v} state={state} readOnly update={noop} labelCap={cap(v.info.labelObjective)} measureCap={cap(v.info.measureObjective)} fieldBase={fieldBase} className="border-0 shadow-none [&_textarea]:hidden" />
      </section>
    ) : null;
  return { player, state, m, panel };
}
