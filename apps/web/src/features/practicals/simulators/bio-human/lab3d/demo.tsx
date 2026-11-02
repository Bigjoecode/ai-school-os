import { breathIdealRecords, emptyBioHumanState, pulseIdealRecords, reactIdealRecords, skinIdealRecords, skinModelSeps, type BioHumanState, type BioHumanVariant, type HumanTask, type SkinArea } from '@aischool/shared';
import { useMemo, useState } from 'react';
import { useDemoPlayer, type DemoBeat, type DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import { useHuman, type Human } from '../actions';
import { BreathNotebook, PulseNotebook, ReactNotebook, SkinNotebook } from '../notebook';
import { BENCH_IDLE, demoVariant, useHumanBench } from './bench';
import { neededFor } from './scene-state';

/**
 * Mrs Okon's demonstration with her own partner (demoVariant: never the
 * student's), on its own in-memory state, through the same actions as the
 * student's lab. PULSE: screen, rest, three resting counts, step-ups, a count
 * at once and every minute. BREATH: mouthpiece, lime water, ten gentle
 * breaths, the dry mirror, the temperatures, breathing counts. REACTION: the
 * knee-jerk, the starting position, ten drops and five with the other hand.
 * SKIN: blindfold, the fingertip narrowed down, palm and forearm.
 */

export interface HumanDemoCtx {
  h: Human;
  v: BioHumanVariant;
  s: () => BioHumanState;
}
type Beat = DemoBeat<HumanDemoCtx>;
type Step = KitDemoStep<HumanDemoCtx>;
const noop = () => undefined;
const bench = { mode: 'bench' as const, spot: null };
const read = { mode: 'read' as const, spot: null };
const spread = (from: number, n: number, gap: number, run: (c: HumanDemoCtx, k: number) => void): Beat[] => Array.from({ length: n }, (_, k) => ({ at: from + k * gap, run: (c: HumanDemoCtx) => run(c, k) }));

const setUp = (task: HumanTask): Step[] => [
  { id: 'safety', title: 'Safety first', say: () => (task === 'PULSE' ? 'Lab coat on. First I ask my partner about asthma, heart or sickle-cell problems — and we exercise on a dry, flat floor.' : task === 'BREATH' ? 'Lab coat on. A clean mouthpiece, and we breathe gently — lime water must never be sucked up.' : task === 'REACTION' ? 'Lab coat on. A gentle tap for the knee, and feet clear of the falling rule.' : 'Lab coat on. Blunt points, cleaned with alcohol, pressed gently.'), ms: 4800, view: { ...bench, focus: 'bench' }, beats: [{ at: 700, run: (c) => c.h.note('safety:coat') }] },
  { id: 'apparatus', title: 'The apparatus', say: () => `From the cupboard: ${neededFor(task).map((a) => a.label.toLowerCase()).join(', ')}.`, ms: 5000, view: { ...bench, focus: 'bench' }, beats: neededFor(task).map((a, k): Beat => ({ at: 300 + k * 220, run: (c) => c.h.note(`collect:${a.id}`) })) },
];

function pulseScript(): Step[] {
  return [
    { id: 'intro', title: 'What we are doing', say: () => 'Watch me with my partner. We measure the pulse at rest, after two minutes of step-ups, and every minute until it is back to rest.', ms: 5200, view: { ...bench, focus: 'partner' }, point: 'partner', beats: [] },
    ...setUp('PULSE'),
    { id: 'rest', title: 'Rest five minutes', say: () => 'No asthma, heart or sickle-cell problems. My partner sits quietly for five minutes: walking in raised the pulse.', ms: 5200, view: { ...bench, focus: 'partner' }, point: 'partner', beats: [{ at: 600, run: (c) => c.h.pulse.screen() }, { at: 1800, run: (c) => c.h.pulse.wait(5) }] },
    { id: 'restcount', title: 'Resting pulse', say: () => 'Two fingertips on the thumb side of the wrist — never my thumb. I count for 15 seconds, three times, and multiply by four.', ms: 7000, view: { ...bench, focus: 'wrist' }, point: 'wrist', beats: spread(800, 3, 1800, (c) => (c.h.pulse.count(15), c.h.pulse.wait(0.25))) },
    { id: 'exercise', title: 'Step-ups', say: () => 'Two minutes of step-ups at a steady rhythm: up, up, down, down.', ms: 5000, view: { ...bench, focus: 'step' }, point: 'step', beats: [{ at: 600, run: (c) => c.h.pulse.exercise(2) }] },
    { id: 'atonce', title: 'Count at once', say: () => 'The moment they stop, I count again for 15 seconds — the pulse is already starting to fall.', ms: 4600, view: { ...bench, focus: 'wrist' }, point: 'wrist', beats: [{ at: 1200, run: (c) => c.h.pulse.count(15) }] },
    { id: 'every', title: 'Every minute', say: () => 'Then every minute: it falls quickly at first, then more slowly, until it is back to the resting rate.', ms: 9000, view: read, beats: spread(600, 7, 1100, (c) => (c.h.pulse.nextMinute(), c.h.pulse.count(15))) },
    { id: 'table', title: 'Table and graph', say: () => 'Beats times four for each count; then pulse rate against time — time on the x-axis — with a smooth curve. The % increase and the recovery time come from my own readings.', ms: 7500, view: { ...bench, focus: 'bench' }, point: 'book', panel: 'notebook', beats: [{ at: 900, run: (c) => c.h.update((s) => ({ ...s, pulse: pulseIdealRecords(c.v, s) }), 'table') }] },
    { id: 'turn', title: 'Your turn!', say: () => 'Now it is your turn with your own partner. Rest first, fingertips not thumb, and count the moment the exercise stops.', ms: 4600, view: { ...bench, focus: 'bench' }, beats: [] },
  ];
}

function breathScript(): Step[] {
  return [
    { id: 'intro', title: 'What we are doing', say: () => 'Watch me with my partner. Is exhaled air different from the air we breathe in?', ms: 4200, view: { ...bench, focus: 'apparatus' }, point: 'apparatus', beats: [] },
    ...setUp('BREATH'),
    { id: 'lime', title: 'Mouthpiece and lime water', say: () => 'A clean mouthpiece, and equal volumes of lime water in tubes A and B. Breathing in draws room air through A; breathing out bubbles through B.', ms: 7000, view: { ...bench, focus: 'apparatus' }, point: 'apparatus', beats: [{ at: 800, run: (c) => c.h.breath.mouthpiece() }, { at: 2400, run: (c) => c.h.breath.lime('EQUAL') }] },
    { id: 'breathe', title: 'Ten gentle breaths', say: () => 'Gently in and out ten times… tube B, the exhaled air, turns milky; tube A stays clear.', ms: 7000, view: read, beats: [{ at: 800, run: (c) => c.h.breath.breathe(false) }, { at: 3200, run: (c) => c.h.breath.breathe(false) }] },
    { id: 'mirror', title: 'Mirror and cobalt chloride', say: () => 'I wipe the mirror dry, my partner breathes on it — a mist — and blue cobalt chloride paper turns pink: water.', ms: 7000, view: { ...bench, focus: 'mirror' }, point: 'mirror', beats: [{ at: 600, run: (c) => c.h.breath.wipe() }, { at: 2000, run: (c) => c.h.breath.mirror() }, { at: 4200, run: (c) => c.h.breath.cobalt() }] },
    { id: 'temps', title: 'Temperature', say: () => 'The room temperature first, then breath on the bulb: exhaled air is warmer.', ms: 5200, view: { ...bench, focus: 'mirror' }, point: 'thermometer', beats: [{ at: 700, run: (c) => c.h.breath.room() }, { at: 2600, run: (c) => c.h.breath.bulb() }] },
    { id: 'count', title: 'Breathing rate', say: () => 'At rest, I count my partner’s breaths for a minute, three times.', ms: 5600, view: { ...bench, focus: 'bench' }, point: 'partner', beats: spread(700, 3, 1400, (c) => c.h.breath.count()) },
    { id: 'table', title: 'The record', say: () => 'Mean rate, ventilation — the rate times 500 cubic centimetres — and four percent divided by 0.04 percent: a hundred times as much carbon dioxide.', ms: 7500, view: { ...bench, focus: 'bench' }, point: 'book', panel: 'notebook', beats: [{ at: 900, run: (c) => c.h.update((s) => ({ ...s, breath: breathIdealRecords(c.v, s) }), 'table') }] },
    { id: 'turn', title: 'Your turn!', say: () => 'Now your turn: a clean mouthpiece, gentle breaths, and a dry mirror.', ms: 4200, view: { ...bench, focus: 'bench' }, beats: [] },
  ];
}

function reactScript(): Step[] {
  return [
    { id: 'intro', title: 'What we are doing', say: () => 'Watch me with my partner: a reflex — the knee-jerk — and a voluntary action, catching a falling rule.', ms: 4600, view: { ...bench, focus: 'knee' }, point: 'partner', beats: [] },
    ...setUp('REACTION'),
    { id: 'knee', title: 'The knee-jerk', say: () => 'Leg crossed loosely; a gentle tap below the kneecap with the side of my hand… the leg kicks at once. My partner did not decide to do that: a spinal reflex.', ms: 7000, view: { ...bench, focus: 'knee' }, point: 'knee', beats: [{ at: 1500, run: (c) => c.h.react.knee('HAND') }] },
    { id: 'setup', title: 'Starting position', say: () => 'Forearm resting on the bench edge, finger and thumb apart, the top of the thumb level with zero.', ms: 5000, view: { ...bench, focus: 'rule' }, point: 'rule', beats: [{ at: 800, run: (c) => (c.h.react.arm(true), c.h.react.zero(true)) }] },
    { id: 'dom', title: 'Ten drops', say: () => 'I drop it without warning; my partner catches it; I read the distance at the top of the thumb. Ten times with the dominant hand — watch it get shorter with practice.', ms: 11000, view: read, beats: spread(800, 10, 950, (c) => c.h.react.drop('DOM')) },
    { id: 'nondom', title: 'The other hand', say: () => 'Five more with the non-dominant hand.', ms: 6000, view: read, beats: spread(600, 5, 1000, (c) => c.h.react.drop('NONDOM')) },
    { id: 'table', title: 'Reaction time', say: () => 'The mean distance in metres, then t equals the square root of 2d over g. Catching takes the brain: it is slower than the knee-jerk.', ms: 7500, view: { ...bench, focus: 'bench' }, point: 'book', panel: 'notebook', beats: [{ at: 900, run: (c) => c.h.update((s) => ({ ...s, react: reactIdealRecords(c.v, s) }), 'table') }] },
    { id: 'turn', title: 'Your turn!', say: () => 'Now your turn. Same starting position every time, and never warn the catcher.', ms: 4200, view: { ...bench, focus: 'bench' }, beats: [] },
  ];
}

function skinScript(): Step[] {
  const series = (area: SkinArea, from: number, gap: number, max = 10): Beat[] => {
    const plan = (v: BioHumanVariant) => {
      const seps = skinModelSeps(v.skin.thr[area]).filter((_, i, a) => i === 0 || i >= a.length - max + 1);
      return [seps[0]!, 0, ...seps.slice(1)];
    };
    return Array.from({ length: max + 1 }, (_, k) => ({
      at: from + k * gap,
      run: (c: HumanDemoCtx) => {
        const p = plan(c.v);
        if (k < p.length) {
          useHumanBench.setState({ area, sep: p[k] || useHumanBench.getState().sep });
          c.h.skin.touch(area, p[k]!);
        }
      },
    }));
  };
  return [
    { id: 'intro', title: 'What we are doing', say: () => 'Watch me with my partner. How close can two points be and still feel like two? It depends on where on the skin.', ms: 4600, view: { ...bench, focus: 'arm' }, point: 'partner', beats: [] },
    ...setUp('SKIN'),
    { id: 'blind', title: 'Clean and blindfold', say: () => 'I clean the points with alcohol and blindfold my partner, so they cannot see what I use.', ms: 5000, view: { ...bench, focus: 'partner' }, point: 'partner', beats: [{ at: 600, run: (c) => c.h.skin.clean() }, { at: 2000, run: (c) => c.h.skin.blind(true) }] },
    { id: 'finger', title: 'The fingertip', say: () => 'Both points together, gently — or sometimes just one, as a check. I close the gap a millimetre at a time until it feels like one.', ms: 11000, view: read, beats: series('FINGERTIP', 800, 900) },
    { id: 'palm', title: 'The palm', say: () => 'The palm needs a wider gap.', ms: 9000, view: read, beats: series('PALM', 600, 750) },
    { id: 'forearm', title: 'The forearm', say: () => 'On the forearm two points far apart still feel like one: its receptors are spread out.', ms: 9000, view: read, beats: series('FOREARM', 600, 750) },
    { id: 'table', title: 'The record', say: () => 'For each area: the smallest separation felt as two, the touches and the correct answers. The fingertip is many times more sensitive than the forearm.', ms: 7500, view: { ...bench, focus: 'bench' }, point: 'book', panel: 'notebook', beats: [{ at: 900, run: (c) => c.h.update((s) => ({ ...s, skin: skinIdealRecords(c.v, s) }), 'table') }] },
    { id: 'turn', title: 'Your turn!', say: () => 'Now your turn: blindfold, both points together, single-point checks, all five areas.', ms: 4200, view: { ...bench, focus: 'bench' }, beats: [] },
  ];
}

/** The demo: its own partner and in-memory state, played by the kit's demo engine. */
export function useHumanDemo({ studentSeed, task, startedAt, active, onFinished }: { studentSeed: number; task: HumanTask; startedAt: string; active: boolean; onFinished: () => void }) {
  const variant = useMemo(() => demoVariant(studentSeed, task), [studentSeed, task]);
  const fresh = () => ({ ...emptyBioHumanState(), task });
  const [state, setState] = useState<BioHumanState>(fresh);
  const h = useHuman({ seed: variant.seed, state, onChange: setState, readOnly: false, startedAt, variant });
  const steps = useMemo(() => (task === 'BREATH' ? breathScript() : task === 'REACTION' ? reactScript() : task === 'SKIN' ? skinScript() : pulseScript()), [task]);
  const ctx = (): HumanDemoCtx => ({ h, v: variant, s: () => h.ref.current });
  const player = useDemoPlayer<HumanDemoCtx>({
    steps,
    ctx,
    reset: () => {
      useHumanBench.setState(BENCH_IDLE);
      h.ref.current = fresh();
      setState(h.ref.current);
    },
    goggles: () => false,
    active,
    onFinished,
  });
  const panel = (id: string) =>
    id === 'notebook' ? (
      <section className="pointer-events-none absolute right-2 top-40 z-10 hidden max-h-[calc(100%-18rem)] w-[420px] overflow-hidden rounded-2xl bg-card p-3 text-card-foreground shadow-xl sm:block" aria-label="Demonstration notebook">
        {task === 'BREATH' ? <BreathNotebook state={state} readOnly update={noop} book className="border-0 p-0 shadow-none sm:p-0" /> : task === 'REACTION' ? <ReactNotebook state={state} readOnly update={noop} book className="border-0 p-0 shadow-none sm:p-0" /> : task === 'SKIN' ? <SkinNotebook state={state} readOnly update={noop} book className="border-0 p-0 shadow-none sm:p-0" /> : <PulseNotebook state={state} readOnly update={noop} book className="border-0 p-0 shadow-none sm:p-0" />}
      </section>
    ) : null;
  return { player, state, h, panel, v: variant };
}
