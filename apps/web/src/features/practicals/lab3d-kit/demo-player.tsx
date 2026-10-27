import { Gauge, ListOrdered, Pause, Play, RotateCcw, SkipBack, SkipForward, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { assistantProfile } from './assistant-profile';
import { useLabView, type LabViewState } from './store';
import { say } from './voice';

/**
 * The demonstration engine and player. A lab writes its demo as steps — a
 * caption (always shown, optionally spoken), a camera view, what the
 * assistant points at, an optional side panel, and timed beats that act on the
 * lab's own demo state (in memory only, never the attempt). Jumping to a step
 * resets the demo and replays the earlier beats instantly, so beats must be
 * deterministic. Controls: play / pause, previous / next, speed, replay and a
 * step list to jump anywhere.
 */

export interface DemoBeat<C> {
  at: number;
  run: (c: C) => void;
}
export interface DemoStep<C> {
  id: string;
  title: string;
  /** What the assistant says (worked out from the demo state when the step starts). */
  say: (c: C) => string;
  /** Length at 1× (the step also waits for its last beat). */
  ms: number;
  /** The kit view for this step: camera mode, spot, eye… */
  view: Partial<LabViewState>;
  /** What the assistant points at. */
  point?: string;
  /** A side panel the lab renders while this step plays (e.g. 'notebook', 'calc'). */
  panel?: string;
  beats: DemoBeat<C>[];
}

const SPEEDS = [1, 1.5, 2] as const;
const TICK = 50;

export function useDemoPlayer<C>({
  steps,
  ctx,
  reset,
  beatsFor = (s) => s.beats,
  goggles,
  onEnter,
  active,
  onFinished,
}: {
  steps: DemoStep<C>[];
  /** The demo context now (the lab's demo state and actions). */
  ctx: () => C;
  /** Back to the demo's empty state (before replaying beats). */
  reset: () => void;
  /** A step's beats, built when it starts (they may depend on the demo state so far). */
  beatsFor?: (step: DemoStep<C>, c: C) => DemoBeat<C>[];
  /** Is the assistant wearing goggles at this point of the demo? */
  goggles?: (c: C) => boolean;
  /** Called on entering a step (after a reset when jumping): the lab clears its own bench animations. */
  onEnter?: (step: DemoStep<C>, c: C) => void;
  active: boolean;
  onFinished: () => void;
}) {
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [caption, setCaption] = useState('');
  const run = useRef({ time: 0, beats: [] as DemoBeat<C>[], next: 0, index: 0 });
  const done = useRef(onFinished);
  done.current = onFinished;
  const hooks = useRef({ beatsFor, goggles, onEnter, reset });
  hooks.current = { beatsFor, goggles, onEnter, reset };

  const enter = useCallback(
    (k: number) => {
      const c = ctxRef.current();
      const step = steps[k]!;
      run.current = { time: 0, beats: hooks.current.beatsFor(step, c), next: 0, index: k };
      setIndex(k);
      hooks.current.onEnter?.(step, c);
      useLabView.setState({ selected: null, held: null, focus: 'bench', ...step.view, ada: { at: 'bench', point: step.point ?? null, goggles: hooks.current.goggles?.(c) ?? true } });
      const text = step.say(c);
      setCaption(text);
      say(text);
    },
    [steps],
  );
  /** Rebuilds the demo up to step k from an empty state (earlier beats run instantly), then enters it. */
  const jump = useCallback(
    (k: number) => {
      hooks.current.reset();
      for (let j = 0; j < k; j++) {
        const c = ctxRef.current();
        for (const b of hooks.current.beatsFor(steps[j]!, c)) b.run(ctxRef.current());
      }
      enter(Math.max(0, Math.min(steps.length - 1, k)));
    },
    [steps, enter],
  );

  // Start from the beginning whenever the demo is opened.
  useEffect(() => {
    if (!active) {
      setPlaying(false);
      return;
    }
    jump(0);
    setPlaying(true);
    // Only on opening: jump is rebuilt with the demo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // The clock: run due beats, move on at the end of a step.
  useEffect(() => {
    if (!active || !playing) return;
    const id = setInterval(() => {
      const r = run.current;
      r.time += TICK * speed;
      while (r.next < r.beats.length && r.beats[r.next]!.at <= r.time) r.beats[r.next++]!.run(ctxRef.current());
      if (r.time >= steps[r.index]!.ms && r.next >= r.beats.length) {
        if (r.index + 1 < steps.length) enter(r.index + 1);
        else {
          setPlaying(false);
          done.current();
        }
      }
    }, TICK);
    return () => clearInterval(id);
  }, [active, playing, speed, steps, enter]);

  return useMemo(() => ({ steps, index, step: steps[index]!, playing, setPlaying, speed, setSpeed, caption, jump }), [steps, index, playing, speed, caption, jump]);
}
/** What the shell and the player need from a demo (any lab's `useDemoPlayer` result). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DemoHandle = ReturnType<typeof useDemoPlayer<any>>;

/** The player: label, caption, controls and step list. `panel` renders the current step's side panel, if any. */
export function DemoPlayer({ demo, onClose, panel }: { demo: DemoHandle; onClose: () => void; panel?: (id: string) => ReactNode }) {
  const [list, setList] = useState(false);
  const { steps, index, step, playing, speed } = demo;
  const finished = !playing && index === steps.length - 1;
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-[7.6rem] z-10 flex justify-center px-2 sm:top-[7.4rem]">
        <span className="rounded-full bg-violet-600/90 px-3 py-1 text-[12px] font-semibold text-white shadow">Demonstration — {assistantProfile.name}’s values, not yours</span>
      </div>
      {step.panel && panel?.(step.panel)}
      <section className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 mx-auto max-w-2xl rounded-2xl border border-white/15 bg-black/75 p-3 text-white shadow-2xl backdrop-blur sm:bottom-4" aria-label="Demonstration player">
        <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wide text-violet-200">
          <span>
            Step {index + 1} of {steps.length}
          </span>
          <span className="truncate normal-case tracking-normal text-white">· {step.title}</span>
          <div className="ml-auto h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-white/15" aria-hidden>
            <div className="h-full rounded-full bg-violet-300" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
          </div>
        </div>
        <p className="mt-1.5 min-h-[2.6em] text-[13.5px] leading-snug" aria-live="polite">
          <span className="font-semibold text-emerald-300">{assistantProfile.name}: </span>
          {demo.caption}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button size="icon-sm" variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20" onClick={() => demo.jump(Math.max(0, index - 1))} aria-label="Previous step" disabled={index === 0}>
            <SkipBack />
          </Button>
          <Button size="sm" variant="brand" onClick={() => (finished ? (demo.jump(0), demo.setPlaying(true)) : demo.setPlaying(!playing))} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause /> : <Play />} {playing ? 'Pause' : finished ? 'Play again' : 'Play'}
          </Button>
          <Button size="icon-sm" variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20" onClick={() => demo.jump(Math.min(steps.length - 1, index + 1))} aria-label="Next step" disabled={index === steps.length - 1}>
            <SkipForward />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-white/20 bg-white/10 text-white hover:bg-white/20"
            onClick={() => demo.setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!)}
            aria-label={`Speed ${speed}×`}
          >
            <Gauge /> {speed}×
          </Button>
          <Button size="icon-sm" variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20" onClick={() => (demo.jump(0), demo.setPlaying(true))} aria-label="Replay from the start">
            <RotateCcw />
          </Button>
          <Button size="sm" variant="outline" className={cn('border-white/20 bg-white/10 text-white hover:bg-white/20', list && 'bg-white/25')} onClick={() => setList((x) => !x)} aria-expanded={list}>
            <ListOrdered /> Steps
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto text-white/80 hover:bg-white/10 hover:text-white" onClick={onClose}>
            <X /> Leave demo
          </Button>
        </div>
        {list && (
          <ol className="mt-2 max-h-48 overflow-y-auto overscroll-contain rounded-xl bg-white/5 p-1 text-[12.5px]">
            {steps.map((s, k) => (
              <li key={s.id}>
                <button type="button" onClick={() => (demo.jump(k), demo.setPlaying(true), setList(false))} className={cn('w-full rounded-lg px-2 py-1 text-left hover:bg-white/10', k === index && 'bg-violet-500/30 font-semibold')}>
                  {k + 1}. {s.title}
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
