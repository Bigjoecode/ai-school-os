import { PENDULUM_MEAN_ZONE, PENDULUM_OSCILLATIONS, PENDULUM_THREAD_MAX, PENDULUM_THREAD_MIN, type PhyPendulumState } from '@aischool/shared';
import { ArrowDown, ArrowUp, Eye, Pause, Play, RotateCcw, Save, Wind } from 'lucide-react';
import { useEffect, useReducer } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { play } from '../../../lab3d-kit/sound';
import { useLabView, type DragState } from '../../../lab3d-kit/store';
import { dockButton, dockClass } from '../../phy-common/lab3d/common';
import type { Pendulum } from '../actions';
import { useBench } from './layout';

/** The pendulum's own HUD: the dock (set up / swing and time), the metre-rule reading panel and drag feedback. */

const clampT = (x: number) => Math.max(PENDULUM_THREAD_MIN, Math.min(PENDULUM_THREAD_MAX, Math.round(x * 2) / 2));

/** Re-renders every 50 ms while something runs. */
function useTicker(on: boolean) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(tick, 50);
    return () => clearInterval(id);
  }, [on]);
}

export function PendulumDock({ p, s, lab, compact, hung }: { p: Pendulum; s: PhyPendulumState; lab: boolean; compact: boolean; hung: boolean }) {
  const tab = useBench((b) => b.tab);
  const set = useBench((b) => b.set);
  const sw = p.swing;
  const w = p.watch;
  useTicker(!!sw);
  const elapsed = p.elapsed();
  const fromMean = w.start !== null && w.phase <= PENDULUM_MEAN_ZONE;
  const small = 'h-8 px-2 text-[12px]';
  return (
    <div className={cn(dockClass, 'max-w-[min(560px,calc(100vw-1rem))] flex-col items-stretch gap-1.5')}>
      <div className="flex items-center gap-1.5">
        <div className="flex overflow-hidden rounded-lg border border-white/20" role="tablist" aria-label="Dock">
          {(['setup', 'time'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => set({ tab: t })} className={cn('px-2.5 py-1 text-[12px] font-medium', tab === t ? 'bg-white text-slate-900' : 'bg-white/10 text-white hover:bg-white/20')}>
              {t === 'setup' ? 'Set up' : 'Swing & time'}
            </button>
          ))}
        </div>
        <span className={cn('ml-auto rounded-md bg-[#c9d7b8] px-2 py-0.5 font-mono text-[15px] font-bold tabular text-[#16200f]')} aria-label={`Stopwatch reads ${elapsed.toFixed(2)} seconds`}>
          {elapsed.toFixed(2)} s
        </span>
        {lab && sw && w.start !== null && <span className="text-[11.5px] text-white/80 tabular">osc. {p.counted()}</span>}
      </div>
      {tab === 'setup' ? (
        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
          <span className="text-white/75">Thread</span>
          {(compact ? [-1] : [-1, -0.5]).map((d) => (
            <Button key={d} size="sm" variant="outline" className={cn(dockButton, small)} onClick={() => (p.set({ thread: clampT(s.thread + d) }), play('creak'))} aria-label={`Shorten by ${-d} cm`}>
              {d}
            </Button>
          ))}
          <span className="w-[62px] text-center font-semibold tabular">{s.thread.toFixed(1)} cm</span>
          {(compact ? [1] : [0.5, 1]).map((d) => (
            <Button key={d} size="sm" variant="outline" className={cn(dockButton, small)} onClick={() => (p.set({ thread: clampT(s.thread + d) }), play('creak'))} aria-label={`Lengthen by ${d} cm`}>
              +{d}
            </Button>
          ))}
          <span className="ml-1 text-white/75">Angle</span>
          <Button size="sm" variant="outline" className={cn(dockButton, small)} onClick={() => p.set({ amplitude: Math.max(2, s.amplitude - 1) })} aria-label="Smaller angle">
            −
          </Button>
          <span className={cn('w-8 text-center font-semibold tabular', s.amplitude > 10 && 'text-amber-300')}>{s.amplitude}°</span>
          <Button size="sm" variant="outline" className={cn(dockButton, small)} onClick={() => p.set({ amplitude: Math.min(40, s.amplitude + 1) })} aria-label="Larger angle">
            +
          </Button>
          {!compact && <span className="ml-1 text-white/75">Time</span>}
          {(compact ? [] : PENDULUM_OSCILLATIONS).map((n) => (
            <Button key={n} size="sm" variant={s.n === n ? 'brand' : 'outline'} className={cn(s.n !== n && dockButton, small)} onClick={() => p.set({ n })} aria-pressed={s.n === n}>
              {n}
            </Button>
          ))}
          <Button size="sm" variant={s.shielded ? 'outline' : 'brand'} className={cn(s.shielded && dockButton, small)} onClick={() => (p.toggleWindow(), play('creak'))}>
            <Wind /> {s.shielded ? (compact ? 'Window shut' : 'Window closed') : 'Close the window'}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" className={cn(dockButton, small, !hung && 'opacity-55')} aria-disabled={!hung} onClick={() => hung && (sw ? p.stopSwing() : (p.release(), play('clink')))}>
            {sw ? 'Stop the bob' : `Release (${s.amplitude}°)`}
          </Button>
          <Button
            size="sm"
            variant="brand"
            className={cn(small, (!sw || w.stop !== null) && 'opacity-55')}
            aria-disabled={!sw || w.stop !== null}
            onClick={() => {
              if (!sw || w.stop !== null) return;
              if (w.start === null) p.startWatch();
              else p.stopWatch();
              play('tick');
            }}
          >
            {w.start === null ? <Play /> : <Pause />} {w.start === null ? 'Start watch' : 'Stop watch'}
          </Button>
          <Button size="sm" variant="outline" className={cn(dockButton, small)} disabled={w.start === null} onClick={() => p.resetWatch()} aria-label="Reset the stopwatch">
            <RotateCcw />
          </Button>
          <Button size="sm" variant="outline" className={cn(dockButton, small)} disabled={w.stop === null || s.runs.length >= 16} onClick={() => (p.record(), play('success'))}>
            <Save /> Record
          </Button>
          {w.start !== null && lab && <span className={cn('text-[11px]', fromMean ? 'text-emerald-300' : 'text-amber-300')}>{fromMean ? 'started at the mark' : 'started away from the mark'}</span>}
        </div>
      )}
    </div>
  );
}

/** The reading view: the metre rule at the top of the bob, at eye level. */
export function ReadingPanel({ s, radius, onBack }: { s: PhyPendulumState; radius: number; onBack: () => void }) {
  const eye = useLabView((v) => v.eye);
  const set = useLabView((v) => v.set);
  const level = Math.abs(eye) < 0.004 ? 'level' : eye > 0 ? 'above' : 'below';
  const nudge = (d: number) => set({ eye: Math.max(-0.05, Math.min(0.05, eye + d)) });
  return (
    <section className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 mx-auto max-w-md rounded-2xl border border-border bg-card/97 p-3 text-card-foreground shadow-2xl backdrop-blur sm:bottom-4" aria-label="Reading the metre rule">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-display text-[15px] font-semibold tracking-tight">
          <Eye className="size-4 text-muted-foreground" aria-hidden /> Read the metre rule
        </p>
        <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-medium', level === 'level' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')} aria-live="polite">
          {level === 'level' ? 'Eye level with the top of the bob' : `Eye ${level} the top of the bob`}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
        Read the rule where the top of the bob is, with your eye level with it. Then l = thread + radius of the bob ({radius.toFixed(2)} cm).
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="icon-sm" variant="outline" onClick={() => nudge(0.002)} aria-label="Raise your eye">
          <ArrowUp />
        </Button>
        <Button size="icon-sm" variant="outline" onClick={() => nudge(-0.002)} aria-label="Lower your eye">
          <ArrowDown />
        </Button>
        <span className="text-[12.5px]">
          Thread set to <span className="font-semibold tabular">{s.thread.toFixed(1)} cm</span>
        </span>
        <Button size="sm" variant="outline" className="ml-auto" onClick={onBack}>
          Back to bench
        </Button>
      </div>
    </section>
  );
}

export function PendulumDragFeedback({ drag, s }: { drag: DragState; s: PhyPendulumState }) {
  const pull = useBench((b) => b.pull);
  const pill = 'absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg';
  if (drag.kind === 'displace')
    return <span className={pill}>{pull === null ? 'Drag sideways to pull the bob aside' : `Pulled aside ${Math.abs(Math.round(pull))}° — let go to release${Math.abs(pull) > 10 ? ' (too big!)' : ''}`}</span>;
  if (drag.kind === 'thread') return <span className={pill}>Thread {s.thread.toFixed(1)} cm — drag up to shorten, down to lengthen</span>;
  return null;
}
