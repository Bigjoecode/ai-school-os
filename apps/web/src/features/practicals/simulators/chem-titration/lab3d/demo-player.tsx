import type { ChemTitrationState } from '@aischool/shared';
import { Gauge, ListOrdered, Pause, Play, RotateCcw, SkipBack, SkipForward, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTitration } from '../actions';
import { Notebook } from '../notebook';
import { ASSISTANT_NAME } from './assistant';
import { beatsFor, demoCalculation, demoEmpty, demoScript, demoSeed, type DemoCtx, type DemoStep } from './demo';
import { useLabView } from './store';
import { say } from './voice';

/**
 * Plays Mrs Ada's demonstration: its own titration state (in memory only),
 * timed beats per step, captions always on, optional voice, play / pause,
 * previous / next, speed and a step list to jump anywhere.
 */

const SPEEDS = [1, 1.5, 2] as const;
const TICK = 50;
const noop = () => undefined;

export function useDemo({ studentSeed, startedAt, precautions, active, onFinished }: { studentSeed: number; startedAt: string; precautions: string[]; active: boolean; onFinished: () => void }) {
  const seed = useMemo(() => demoSeed(studentSeed), [studentSeed]);
  const [state, setState] = useState<ChemTitrationState>(demoEmpty);
  const t = useTitration({ seed, state, onChange: setState, readOnly: false, startedAt });
  const ctx: DemoCtx = useMemo(() => ({ t, v: t.v, s: () => t.ref.current }), [t]);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const steps = useMemo(() => demoScript(t.v, precautions), [t.v, precautions]);
  const ind = t.v.indicators[0]!;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [caption, setCaption] = useState('');
  const run = useRef({ time: 0, beats: [] as DemoStep['beats'], next: 0, index: 0 });
  const done = useRef(onFinished);
  done.current = onFinished;

  const enter = useCallback(
    (k: number) => {
      const c = ctxRef.current;
      const step = steps[k]!;
      run.current = { time: 0, beats: beatsFor(step, c, ind), next: 0, index: k };
      setIndex(k);
      useLabView.setState({ selected: null, held: null, streaming: false, tap: 0, focus: 'bench', ...step.view, ada: { at: 'bench', point: step.point ?? null, goggles: c.s().log.some((e) => e.a === 'safety:goggles') } });
      const text = step.say(c);
      setCaption(text);
      say(text);
    },
    [steps, ind],
  );
  /** Rebuilds the demo up to step k from an empty state (earlier beats run instantly), then enters it. */
  const jump = useCallback(
    (k: number) => {
      const c = ctxRef.current;
      c.t.ref.current = demoEmpty();
      setState(c.t.ref.current);
      for (let j = 0; j < k; j++) for (const b of beatsFor(steps[j]!, c, ind)) b.run(c);
      useLabView.setState({ pip: 'idle', streaming: false, tap: 0 });
      enter(Math.max(0, Math.min(steps.length - 1, k)));
    },
    [steps, ind, enter],
  );

  // Start from the beginning whenever the demo is opened.
  useEffect(() => {
    if (!active) {
      setPlaying(false);
      return;
    }
    jump(0);
    setPlaying(true);
    // Only on opening: jump is rebuilt with each render of the demo.
  }, [active]);

  // The clock: run due beats, move on at the end of a step.
  useEffect(() => {
    if (!active || !playing) return;
    const id = setInterval(() => {
      const r = run.current;
      r.time += TICK * speed;
      const c = ctxRef.current;
      while (r.next < r.beats.length && r.beats[r.next]!.at <= r.time) r.beats[r.next++]!.run(c);
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

  const calc = useMemo(() => demoCalculation(state, t.v), [state, t.v]);
  return { state, t, steps, index, step: steps[index]!, playing, setPlaying, speed, setSpeed, caption, jump, calc };
}
export type Demo = ReturnType<typeof useDemo>;

export function DemoPlayer({ demo, onClose }: { demo: Demo; onClose: () => void }) {
  const [list, setList] = useState(false);
  const { steps, index, step, playing, speed } = demo;
  const finished = !playing && index === steps.length - 1;
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-[7.6rem] z-10 flex justify-center px-2 sm:top-[7.4rem]">
        <span className="rounded-full bg-violet-600/90 px-3 py-1 text-[12px] font-semibold text-white shadow">Demonstration — {ASSISTANT_NAME}’s values, not yours</span>
      </div>
      {step.panel === 'notebook' && (
        <section className="pointer-events-none absolute right-2 top-40 z-10 hidden w-[380px] rounded-2xl bg-card p-3 text-card-foreground shadow-xl sm:block" aria-label="Demonstration notebook">
          <Notebook v={demo.t.v} state={demo.state} readOnly update={noop} book className="border-0 p-0 shadow-none sm:p-0 [&_input]:h-8 [&_textarea]:hidden" />
        </section>
      )}
      {step.panel === 'calc' && demo.calc.length > 0 && (
        <section className="absolute inset-x-2 top-40 z-10 mx-auto max-w-lg rounded-2xl bg-card p-4 text-card-foreground shadow-xl" aria-label="Worked calculation">
          <p className="font-display text-[15px] font-semibold tracking-tight">Worked calculation (demonstration values)</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px]">
            {demo.calc.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ol>
        </section>
      )}
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
          <span className="font-semibold text-emerald-300">{ASSISTANT_NAME}: </span>
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
