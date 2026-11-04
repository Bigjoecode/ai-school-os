import { AIR_MIN, emptyBioDissectionState, eosinIdealRecords, eosinSectionSeen, microIdealRecords, ratIdealRecords, type BioDissectionState, type BioDissectionVariant, type DissectTask } from '@aischool/shared';
import { useMemo, useState } from 'react';
import { useDemoPlayer, type DemoBeat, type DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import { useDissect, type Dissect } from '../actions';
import { EosinNotebook, MicroNotebook, RatNotebook } from '../notebook';
import { plateDaysNow } from '../readings';
import { PlantSvg, PlateSvg, RatSvg, SectionSvg } from '../visuals';
import { BENCH_IDLE, demoVariant, useDissectBench } from './bench';
import { neededFor } from './scene-state';

/**
 * Mrs Okon's demonstration on her own material (demoVariant: never the
 * student's), on its own in-memory state, through the same actions as the
 * student's lab. EOSIN: washed, in eosin, read every 20 minutes, sections
 * examined. RAT: gloves, pinned, opened step by step, the gut displayed and
 * measured. MICROBE: four plates, taped and incubated; the bread; counted
 * through the lids.
 */

export interface DissectDemoCtx {
  p: Dissect;
  v: BioDissectionVariant;
  s: () => BioDissectionState;
}
type Beat = DemoBeat<DissectDemoCtx>;
type Step = KitDemoStep<DissectDemoCtx>;
const noop = () => undefined;
const bench = { mode: 'bench' as const, spot: null };

const setUp = (task: DissectTask): Step[] => [
  {
    id: 'safety',
    title: 'Safety first',
    say: () => (task === 'RAT' ? 'Lab coat on, and gloves. The rat was killed humanely by the teacher: we treat it with respect.' : task === 'MICROBE' ? 'Lab coat on, bench wiped with disinfectant. These plates stay taped shut once they have grown.' : 'Lab coat on. Eosin stains, and I will cut away from my fingers.'),
    ms: 4600,
    view: { ...bench, focus: 'bench' },
    beats: [{ at: 600, run: (c) => c.p.note('safety:coat') }],
  },
  {
    id: 'apparatus',
    title: 'The apparatus',
    say: () => `From the cupboard: ${neededFor(task).map((a) => a.label.toLowerCase()).join(', ')}.`,
    ms: 5600,
    view: { ...bench, focus: 'bench' },
    beats: neededFor(task).map((a, k): Beat => ({ at: 300 + k * 200, run: (c) => c.p.note(`collect:${a.id}`) })),
  },
];
const turn = (say: string): Step => ({ id: 'turn', title: 'Your turn!', say: () => say, ms: 4600, view: { ...bench, focus: 'bench' }, beats: [] });

function eosinScript(): Step[] {
  const step = (c: DissectDemoCtx) => (c.p.eosin.wait(20), c.p.eosin.read());
  return [
    { id: 'intro', title: 'What we are doing', say: () => 'Watch me with my own balsam plant. Which tissue carries water up the stem? The red dye will show us.', ms: 5200, view: { ...bench, focus: 'plant' }, point: 'plant', beats: [] },
    ...setUp('EOSIN'),
    { id: 'wash', title: 'Wash and stand in eosin', say: () => 'I wash the roots gently — torn roots would let the dye straight in — and stand them in the eosin, by the window where it is bright and airy.', ms: 7600, view: { ...bench, focus: 'plant' }, point: 'plant', beats: [{ at: 600, run: (c) => c.p.eosin.wash('GENTLE') }, { at: 2600, run: (c) => c.p.eosin.dye() }, { at: 4600, run: (c) => c.p.eosin.place('BRIGHT') }] },
    { id: 'reads', title: 'Reading the red line', say: () => 'Every twenty minutes I read the top of the red line on the ruler, from the dye surface, to a tenth of a centimetre.', ms: 8000, view: { ...bench, focus: 'plant' }, panel: 'closeup', beats: [0, 1, 2, 3, 4].map((k): Beat => ({ at: 400 + k * 1400, run: step })) },
    { id: 'leaves', title: 'The leaves', say: () => 'After a while the veins of the lower leaves turn red: the stem’s xylem runs on into the leaf veins.', ms: 5200, view: { ...bench, focus: 'plant' }, point: 'plant', beats: [{ at: 800, run: (c) => c.p.eosin.leaves() }] },
    {
      id: 'sections',
      title: 'Sections',
      say: () => 'Now I cut thin sections on the tile, away from my fingers: one low down, one above the red line, and one along the stem. Under the microscope the red is only in the xylem of each bundle — the bundles form a ring.',
      ms: 9800,
      view: { ...bench, focus: 'tile' },
      panel: 'section',
      beats: [
        { at: 600, run: (c) => (c.p.eosin.cut('TS', 3), c.p.eosin.view(0, 'MICRO')) },
        { at: 3600, run: (c) => (c.p.eosin.cut('TS', Math.min(Math.floor(c.v.eosin.stemH) - 1, 20)), c.p.eosin.view(1, 'LENS')) },
        { at: 6200, run: (c) => (c.p.eosin.cut('LS', 3), c.p.eosin.view(2, 'MICRO')) },
      ],
    },
    { id: 'table', title: 'The record', say: () => 'Heights against time, what each section showed, and the rate: the rise divided by the time between my first and last readings — in centimetres per minute, and per hour.', ms: 7200, view: { ...bench, focus: 'bench' }, point: 'book', panel: 'notebook', beats: [{ at: 900, run: (c) => c.p.update((s) => ({ ...s, eosin: eosinIdealRecords(c.v, s) }), 'table') }] },
    turn('Now it is your turn with your own plant. Read the red line several times before you cut — cutting ends the experiment.'),
  ];
}

function ratScript(): Step[] {
  return [
    { id: 'intro', title: 'What we are doing', say: () => 'Watch me with my own specimen. We open the abdomen and display the alimentary canal — carefully, so every organ stays in place.', ms: 5600, view: { ...bench, focus: 'board' }, point: 'rat', beats: [] },
    ...setUp('RAT'),
    { id: 'pin', title: 'Pin it out', say: () => 'Gloves on. I pin it on its back by its four limbs, and measure from the snout to the anus.', ms: 6200, view: { ...bench, focus: 'board' }, point: 'rat', beats: [{ at: 400, run: (c) => c.p.rat.gloves() }, { at: 1800, run: (c) => c.p.rat.pin('VENTRAL') }, { at: 3800, run: (c) => c.p.rat.measure('BODY') }] },
    { id: 'skin', title: 'Skin and body wall', say: () => 'I lift the skin with forceps and cut up the midline, then sideways at each end, and pin it back. The body wall the same way — lifted, so I never cut too deep.', ms: 9000, view: { ...bench, focus: 'board' }, panel: 'closeup', beats: [{ at: 600, run: (c) => c.p.rat.skin('LIFTED') }, { at: 2600, run: (c) => c.p.rat.pinSkin() }, { at: 4800, run: (c) => (c.p.rat.wall('LIFTED'), c.p.rat.moisten()) }] },
    { id: 'display', title: 'Display the gut', say: () => 'With the seeker I move the gut gently to one side and unravel it. Here is the liver, dark and lobed; the stomach on the left; the duodenum with the pancreas in its loop; the long ileum; the large caecum; colon and rectum. No gall bladder.', ms: 11000, view: { ...bench, focus: 'board' }, panel: 'closeup', beats: [{ at: 600, run: (c) => c.p.rat.display('SEEKER') }, { at: 3000, run: (c) => c.p.rat.unravel() }] },
    { id: 'measure', title: 'Measure the gut', say: () => 'A damp thread laid along the small intestine, then straightened on the ruler; the same for the large intestine. Then the tools and board are disinfected.', ms: 7600, view: { ...bench, focus: 'board' }, point: 'thread', beats: [{ at: 800, run: (c) => c.p.rat.measure('SI', 'THREAD') }, { at: 2800, run: (c) => c.p.rat.measure('LI', 'THREAD') }, { at: 5200, run: (c) => c.p.rat.clean() }] },
    { id: 'table', title: 'Drawing and ratio', say: () => 'I draw what I displayed, label it with ruled lines, and work out gut length divided by body length.', ms: 6800, view: { ...bench, focus: 'bench' }, point: 'book', panel: 'notebook', beats: [{ at: 900, run: (c) => c.p.update((s) => ({ ...s, rat: ratIdealRecords(c.v, s) }), 'table') }] },
    turn('Now it is your turn with your own specimen. Lift before you cut, and use the seeker, not the forceps.'),
  ];
}

function microScript(): Step[] {
  return [
    { id: 'intro', title: 'What we are doing', say: () => 'Watch me with my own plates. Where are microorganisms found — and does washing your hands remove them?', ms: 5200, view: { ...bench, focus: 'plates' }, point: 'plate:0', beats: [] },
    ...setUp('MICROBE'),
    {
      id: 'plates',
      title: 'Four plates',
      say: () => `I wipe the bench and label each plate on its base. The air plate stays open ${AIR_MIN} minutes. I lift the next lid slightly and touch with my unwashed finger; then I wash with soap and touch the last one. The control is never opened.`,
      ms: 11000,
      view: { ...bench, focus: 'plates' },
      point: 'plate:1',
      beats: [
        { at: 400, run: (c) => c.p.micro.wipe() },
        { at: 1400, run: (c) => [0, 1, 2, 3].forEach((k) => c.p.micro.label(k, 'BASE')) },
        { at: 3400, run: (c) => c.p.micro.expose(1, AIR_MIN) },
        { at: 5400, run: (c) => c.p.micro.touch(2, 'SLIGHT') },
        { at: 7000, run: (c) => (c.p.micro.soap(), c.p.note('wash-hands')) },
        { at: 8400, run: (c) => c.p.micro.touch(3, 'SLIGHT') },
      ],
    },
    { id: 'incubate', title: 'Tape, invert, incubate', say: () => 'Two short strips of tape on each lid — not sealed all round. Upside down, so condensation cannot drip, into the incubator at thirty degrees.', ms: 7000, view: { ...bench, focus: 'incubator' }, point: 'incubator', beats: [{ at: 600, run: (c) => c.p.micro.tapeAll('STRIPS') }, { at: 2600, run: (c) => c.p.micro.invert() }, { at: 4200, run: (c) => c.p.micro.incubate(30) }] },
    {
      id: 'bread',
      title: 'Bread',
      say: () => 'Bread exposed to the air for thirty minutes: slice A moist and warm, B dry, C moist in the refrigerator — each in a polythene bag.',
      ms: 7400,
      view: { ...bench, focus: 'bread' },
      point: 'slice:0',
      beats: [{ at: 600, run: (c) => c.p.micro.exposeBread() }, { at: 2000, run: (c) => (c.p.micro.slice(0, true, 'WARM'), c.p.micro.slice(1, false, 'WARM'), c.p.micro.slice(2, true, 'COLD')) }, { at: 4200, run: (c) => c.p.micro.bag(true) }],
    },
    { id: 'days', title: 'Three days later', say: () => 'The colonies show: shiny creamy bacteria, a few fluffy fungi. I count each plate through the lid, quarter by quarter. The control is clear.', ms: 8600, view: { ...bench, focus: 'plates' }, panel: 'closeup', beats: [{ at: 400, run: (c) => c.p.micro.wait() }, { at: 1200, run: (c) => c.p.micro.wait() }, { at: 2000, run: (c) => (c.p.micro.wait(), c.p.micro.count()) }] },
    { id: 'mould', title: 'The bread mould', say: () => 'Slice A is covered in white threads — hyphae — with black pin-head sporangia: Rhizopus, a fungus. B and C hardly at all. Then the taped plates go into disinfectant.', ms: 7800, view: { ...bench, focus: 'bread' }, point: 'slice:0', beats: [{ at: 600, run: (c) => (c.p.micro.lens(), c.p.micro.slide()) }, { at: 4800, run: (c) => c.p.micro.dispose('DISINFECT') }] },
    { id: 'table', title: 'The record', say: () => 'Counts, descriptions, and the percentage reduction: unwashed minus washed, divided by unwashed, times one hundred.', ms: 6800, view: { ...bench, focus: 'bench' }, point: 'book', panel: 'notebook', beats: [{ at: 900, run: (c) => c.p.update((s) => ({ ...s, micro: microIdealRecords(c.v, s) }), 'table') }] },
    turn('Now it is your turn. Label the base, keep the control shut — and never open a plate after incubation.'),
  ];
}

/** The demo: its own material and in-memory state, played by the kit's demo engine. */
export function useDissectDemo({ studentSeed, task, startedAt, active, onFinished }: { studentSeed: number; task: DissectTask; startedAt: string; active: boolean; onFinished: () => void }) {
  const variant = useMemo(() => demoVariant(studentSeed, task), [studentSeed, task]);
  const fresh = () => ({ ...emptyBioDissectionState(), task });
  const [state, setState] = useState<BioDissectionState>(fresh);
  const p = useDissect({ seed: variant.seed, state, onChange: setState, readOnly: false, startedAt, variant });
  const steps = useMemo(() => (task === 'RAT' ? ratScript() : task === 'MICROBE' ? microScript() : eosinScript()), [task]);
  const ctx = (): DissectDemoCtx => ({ p, v: variant, s: () => p.ref.current });
  const player = useDemoPlayer<DissectDemoCtx>({
    steps,
    ctx,
    reset: () => {
      useDissectBench.setState(BENCH_IDLE);
      p.ref.current = fresh();
      setState(p.ref.current);
    },
    goggles: () => false,
    active,
    onFinished,
  });
  const flat = 'border-0 p-0 shadow-none sm:p-0';
  const last = state.eosin.sections.length - 1;
  const panel = (id: string) =>
    id === 'notebook' ? (
      <section className="pointer-events-none absolute right-2 top-40 z-10 hidden max-h-[calc(100%-18rem)] w-[420px] overflow-hidden rounded-2xl bg-card p-3 text-card-foreground shadow-xl sm:block" aria-label="Demonstration notebook">
        {task === 'RAT' ? <RatNotebook v={variant} state={state} readOnly update={noop} book className={flat} /> : task === 'MICROBE' ? <MicroNotebook v={variant} state={state} readOnly update={noop} book className={flat} /> : <EosinNotebook v={variant} state={state} readOnly update={noop} book className={flat} />}
      </section>
    ) : id === 'closeup' || id === 'section' ? (
      <section className="pointer-events-none absolute right-2 top-40 z-10 hidden w-[360px] rounded-2xl bg-card p-2 text-card-foreground shadow-xl sm:block" aria-label="Demonstration close-up">
        {task === 'RAT' ? (
          <RatSvg w={state.rat} label="Mrs Okon's dissection" />
        ) : task === 'MICROBE' ? (
          <div className="grid grid-cols-2 gap-1">
            {[0, 1, 2, 3].map((k) => (
              <PlateSvg key={k} v={variant} w={state.micro} k={k} days={plateDaysNow(state)} seed={variant.seed} label={`Mrs Okon's plate ${k + 1}`} />
            ))}
          </div>
        ) : id === 'section' && last >= 0 ? (
          <SectionSvg kind={state.eosin.sections[last]!.kind} seen={eosinSectionSeen(variant.eosin, state.eosin, last)} thin tool={state.eosin.views.at(-1)?.tool ?? 'MICRO'} bundles={variant.eosin.bundles} label="Mrs Okon's section" />
        ) : (
          <PlantSvg v={variant} w={state.eosin} label="Mrs Okon's plant" />
        )}
      </section>
    ) : null;
  return { player, state, p, panel, v: variant };
}
