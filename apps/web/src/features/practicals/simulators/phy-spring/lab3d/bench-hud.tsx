import { SPRING_AMPS, SPRING_MEAN_ZONE, SPRING_OSCILLATIONS, SPRING_SMALL_AMP, SPRING_STEP, type PhySpringState } from '@aischool/shared';
import { ArrowDown, ArrowUp, Camera, Eye, Hand, Minus, Pause, Play, Plus, RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLabView, type DragState } from '../../../lab3d-kit/store';
import { dockButton, dockClass } from '../../phy-common/lab3d/common';
import { loadName, useLive, type Spring } from '../actions';
import { useBench } from './bench-store';
import type { Ops } from './lab-actions';
import { APPARATUS_LABEL, PLACE_LABEL, type SceneState } from './scene-state';

/** The spring's HUD: the dock (set up, load, read or time), the eye-level reading panel and the drag feedback. */

const B = ({ children, onClick, blocked, brand, label, className }: { children: React.ReactNode; onClick: () => void; blocked?: string; brand?: boolean; label?: string; className?: string }) => (
  <Button size="sm" variant={brand && !blocked ? 'brand' : 'outline'} className={cn(!(brand && !blocked) && dockButton, blocked && 'opacity-55', 'h-8 px-2 text-[12px]', className)} aria-disabled={!!blocked} title={blocked} aria-label={label} onClick={onClick}>
    {children}
  </Button>
);

function LoadButtons({ s, ops, compact }: { s: PhySpringState; ops: Ops; compact: boolean }) {
  return (
    <>
      {s.load === 0 ? (
        <B brand onClick={ops.hangHanger} blocked={ops.why.hanger} label="Hang the 50 g hanger">
          {compact ? 'Hang hanger' : 'Hang the 50 g hanger'}
        </B>
      ) : (
        <>
          <B onClick={ops.removeMass} blocked={ops.why.remove} label={s.load === SPRING_STEP ? 'Take the hanger off' : 'Take 50 g off'}>
            <Minus /> {s.load === SPRING_STEP ? (compact ? 'Hanger' : 'Hanger off') : '50 g'}
          </B>
          <span className="min-w-[52px] text-center text-[12px] font-semibold tabular">{s.load} g</span>
          <B onClick={ops.addMass} blocked={ops.why.add} label="Add 50 g">
            <Plus /> 50 g
          </B>
        </>
      )}
      <B onClick={ops.steady} label="Steady the hanger">
        <Hand /> {compact ? 'Steady' : 'Steady it'}
      </B>
    </>
  );
}

export function SpringDock({ o, s, scene, ops, compact, lab }: { o: Spring; s: PhySpringState; scene: SceneState; ops: Ops; compact: boolean; lab: boolean }) {
  const tab = useBench((b) => b.tab);
  const setTab = useBench((b) => b.set);
  const w = o.watch;
  useLive(!!o.motion || (w.start !== null && w.stop === null), 50);
  if (!scene.set)
    return (
      <div className={dockClass} aria-label="Set up the spring">
        {scene.nextPlace && (
          <B brand onClick={ops.placeNext} blocked={ops.why.place}>
            {PLACE_LABEL[scene.nextPlace] ?? `Set out the ${APPARATUS_LABEL[scene.nextPlace].toLowerCase()}`}
          </B>
        )}
      </div>
    );
  const moving = o.moving();
  if ((s.task ?? 'HOOKE') === 'HOOKE')
    return (
      <div className={cn(dockClass, 'max-w-[min(600px,calc(100vw-1rem))]')} aria-label="The spring">
        <LoadButtons s={s} ops={ops} compact={compact} />
        <span className={cn('text-[11.5px]', moving ? 'text-amber-300' : 'text-emerald-300')} aria-live="polite">
          {moving ? 'bouncing' : 'at rest'}
        </span>
        <B onClick={ops.read} blocked={ops.why.read} label="Read the pointer">
          <Eye /> {compact ? 'Read' : 'Read the pointer'}
        </B>
        <B brand onClick={ops.take} blocked={ops.why.take} label="Take this reading">
          <Camera /> {compact ? 'Take' : 'Take this reading'} ({s.readings.length})
        </B>
      </div>
    );
  const elapsed = o.elapsed();
  const fromRest = w.start !== null && w.phase <= SPRING_MEAN_ZONE;
  return (
    <div className={cn(dockClass, 'max-w-[min(580px,calc(100vw-1rem))] flex-col items-stretch gap-1.5')} aria-label="The spring">
      <div className="flex items-center gap-1.5">
        <div className="flex overflow-hidden rounded-lg border border-white/20" role="tablist" aria-label="Dock">
          {(['load', 'time'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab({ tab: t })} className={cn('px-2.5 py-1 text-[12px] font-medium', tab === t ? 'bg-white text-slate-900' : 'bg-white/10 text-white hover:bg-white/20')}>
              {t === 'load' ? 'Load' : 'Oscillate & time'}
            </button>
          ))}
        </div>
        <span className="text-[11.5px] text-white/80">{loadName(s.load)}</span>
        <span className="ml-auto rounded-md bg-[#c9d7b8] px-2 py-0.5 font-mono text-[15px] font-bold tabular text-[#16200f]" aria-label={`Stopwatch reads ${elapsed.toFixed(2)} seconds`}>
          {elapsed.toFixed(2)} s
        </span>
        {lab && o.motion && w.start !== null && <span className="text-[11.5px] text-white/80 tabular">osc. {o.counted()}</span>}
      </div>
      {tab === 'load' ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <LoadButtons s={s} ops={ops} compact={compact} />
          <span className="ml-1 text-[12px] text-white/75">Pull</span>
          {(compact ? SPRING_AMPS.filter((a) => a <= 3) : SPRING_AMPS).map((a) => (
            <B key={a} brand={s.amp === a} onClick={() => o.setAmp(a)} className={cn(a > SPRING_SMALL_AMP && s.amp === a && 'ring-1 ring-amber-300')}>
              {a}
            </B>
          ))}
          <span className="text-[12px] text-white/75">cm</span>
          {SPRING_OSCILLATIONS.map((n) => (
            <B key={n} brand={s.n === n} onClick={() => o.setN(n)}>
              {n} osc.
            </B>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <B onClick={() => (o.motion ? ops.steady() : ops.release())} blocked={o.motion ? undefined : ops.why.release}>
            {o.motion ? 'Steady it' : `Pull down ${s.amp} cm, release`}
          </B>
          <B brand onClick={ops.watch} blocked={ops.why.watch}>
            {w.start === null ? <Play /> : <Pause />} {w.start === null ? 'Start watch' : 'Stop watch'}
          </B>
          <B onClick={ops.resetWatch} blocked={w.start === null ? 'The watch is at zero.' : undefined} label="Reset the stopwatch">
            <RotateCcw />
          </B>
          <B onClick={ops.record} blocked={ops.why.record}>
            <Save /> Record ({s.runs.length})
          </B>
          {w.start !== null && lab && <span className={cn('text-[11px]', fromRest ? 'text-emerald-300' : 'text-amber-300')}>{fromRest ? 'started at the mark' : 'started away from the mark'}</span>}
        </div>
      )}
    </div>
  );
}

/** Eye-level reading of the pointer on the rule. */
export function SpringReadingPanel({ o, s, ops, onBack }: { o: Spring; s: PhySpringState; ops: Ops; onBack: () => void }) {
  const eye = useLabView((v) => v.eye);
  const set = useLabView((v) => v.set);
  useLive(!!o.motion, 80);
  const level = Math.abs(eye) < 0.003 ? 'level' : eye > 0 ? 'above' : 'below';
  const nudge = (d: number) => set({ eye: Math.max(-0.05, Math.min(0.05, eye + d)) });
  const moving = o.moving();
  return (
    <section className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 mx-auto max-w-md rounded-2xl border border-border bg-card/97 p-3 text-card-foreground shadow-2xl backdrop-blur sm:bottom-4" aria-label="Reading the pointer">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-display text-[15px] font-semibold tracking-tight">
          <Eye className="size-4 text-muted-foreground" aria-hidden /> Read the pointer
        </p>
        <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-medium', level === 'level' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')} aria-live="polite">
          {level === 'level' ? 'Eye level with the pointer' : `Eye ${level} the pointer`}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
        Read the rule where the pointer’s tip is, to 0.1 cm, with your eye level with it (raise or lower your eye: no parallax). {s.load === 0 ? 'No load: this is R₀.' : `Load: ${loadName(s.load)}.`}
        {moving && <span className="font-medium text-warning"> The pointer is still moving: steady the hanger first.</span>}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="icon-sm" variant="outline" onClick={() => nudge(0.002)} aria-label="Raise your eye">
          <ArrowUp />
        </Button>
        <Button size="icon-sm" variant="outline" onClick={() => nudge(-0.002)} aria-label="Lower your eye">
          <ArrowDown />
        </Button>
        {moving && (
          <Button size="sm" variant="outline" onClick={ops.steady}>
            <Hand /> Steady it
          </Button>
        )}
        <Button size="sm" variant="brand" onClick={ops.take}>
          <Camera /> Take this reading
        </Button>
        <Button size="sm" variant="outline" className="ml-auto" onClick={onBack}>
          Back to bench
        </Button>
      </div>
    </section>
  );
}

export function SpringDragFeedback({ drag }: { drag: DragState }) {
  const pull = useBench((b) => b.pull);
  if (drag.kind !== 'pull') return null;
  return (
    <span className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg">
      {pull === null || pull < 0.5 ? 'Drag down to pull the hanger' : `Pulled down ${pull.toFixed(1)} cm — let go to release${pull > SPRING_SMALL_AMP ? ' (too far!)' : ''}`}
    </span>
  );
}
