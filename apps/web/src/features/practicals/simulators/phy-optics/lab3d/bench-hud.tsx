import type { PhyOpticsState } from '@aischool/shared';
import { ArrowDown, ArrowUp, Camera, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Crosshair, Eye, Minus, Plus, Sun, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLabView, type DragState } from '../../../lab3d-kit/store';
import { dockButton, dockClass } from '../../phy-common/lab3d/common';
import { OPTIC_NAME } from '../actions';
import { useBench } from './bench-store';
import type { Ops } from './lab-actions';
import { APPARATUS_LABEL, PLACE_LABEL, type SceneState } from './scene-state';

/** The optical bench's HUD: the dock (what to do next), the eye-level reading panel and the drag feedback. */

const B = ({ children, onClick, blocked, brand, label }: { children: React.ReactNode; onClick: () => void; blocked?: string; brand?: boolean; label?: string }) => (
  <Button size="sm" variant={brand && !blocked ? 'brand' : 'outline'} className={cn(!brand && dockButton, blocked && 'opacity-55')} aria-disabled={!!blocked} title={blocked} aria-label={label} onClick={onClick}>
    {children}
  </Button>
);
const I = ({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) => (
  <Button size="icon-sm" variant="outline" className={dockButton} onClick={onClick} aria-label={label}>
    {children}
  </Button>
);

export function OpticsDock({ s, scene, ops, compact }: { s: PhyOpticsState; scene: SceneState; ops: Ops; compact: boolean }) {
  const b = useBench();
  const focus = useLabView((v) => v.focus);
  const task = s.task ?? 'LENS';
  const what = OPTIC_NAME[task];
  if (!scene.set)
    return (
      <div className={dockClass} aria-label="Set up the optical bench">
        {scene.nextPlace && (
          <B brand onClick={ops.placeNext} blocked={ops.why.place}>
            {PLACE_LABEL[task][scene.nextPlace] ?? `Stand the ${APPARATUS_LABEL[scene.nextPlace].toLowerCase()} on the rule`}
          </B>
        )}
      </div>
    );
  if (b.rough)
    return (
      <div className={cn(dockClass, 'max-w-[min(560px,calc(100vw-1rem))]')} aria-label="Rough focus on the window">
        <span className="w-full text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Rough focus · the {what} faces the window</span>
        <div className="flex items-center gap-1" role="group" aria-label="Move the screen">
          <span className="text-[12px] text-white/80">Screen</span>
          <I onClick={() => ops.roughMove(-1)} label="Screen 1 cm nearer">
            <ChevronsLeft />
          </I>
          <I onClick={() => ops.roughMove(-0.1)} label="Screen 1 mm nearer">
            <ChevronLeft />
          </I>
          <span className="w-16 text-center text-[12px] tabular">{b.roughS.toFixed(1)} cm</span>
          <I onClick={() => ops.roughMove(0.1)} label="Screen 1 mm further">
            <ChevronRight />
          </I>
          <I onClick={() => ops.roughMove(1)} label="Screen 1 cm further">
            <ChevronsRight />
          </I>
        </div>
        {focus !== 'screen' && (
          <B onClick={ops.lookScreen}>
            <Eye /> Look at the screen
          </B>
        )}
        <B brand onClick={ops.recordRough}>
          Record this distance
        </B>
        <B onClick={() => ops.rough(false)}>
          <Undo2 /> Back to the bench
        </B>
      </div>
    );
  return (
    <div className={cn(dockClass, 'max-w-[min(600px,calc(100vw-1rem))]')} aria-label="Optical bench">
      {s.rough === null && (
        <B brand onClick={() => ops.rough(true)} blocked={ops.why.rough}>
          <Sun /> {compact ? 'Rough focus' : `Rough focus: point the ${what} at the window`}
        </B>
      )}
      {!s.aligned && (
        <B brand={s.rough !== null} onClick={ops.align} blocked={ops.why.align}>
          <Crosshair /> Line up the centres
        </B>
      )}
      <div className="flex items-center gap-1" role="group" aria-label="Object distance u">
        <span className="text-[12px] text-white/80">u =</span>
        <I onClick={() => ops.setU(-5)} label="u 5 cm less">
          <ChevronsLeft />
        </I>
        <I onClick={() => ops.setU(-1)} label="u 1 cm less">
          <Minus />
        </I>
        <span className="w-[4.2rem] text-center text-[13px] font-semibold tabular">{s.u.toFixed(1)} cm</span>
        <I onClick={() => ops.setU(1)} label="u 1 cm more">
          <Plus />
        </I>
        <I onClick={() => ops.setU(5)} label="u 5 cm more">
          <ChevronsRight />
        </I>
      </div>
      <div className="flex items-center gap-1" role="group" aria-label="Move the screen">
        <span className="text-[12px] text-white/80">Screen</span>
        <I onClick={() => ops.moveScreen(-1)} label="Screen 1 cm left">
          <ChevronsLeft />
        </I>
        <I onClick={() => ops.moveScreen(-0.1)} label="Screen 1 mm left">
          <ChevronLeft />
        </I>
        <I onClick={() => ops.moveScreen(0.1)} label="Screen 1 mm right">
          <ChevronRight />
        </I>
        <I onClick={() => ops.moveScreen(1)} label="Screen 1 cm right">
          <ChevronsRight />
        </I>
      </div>
      {focus !== 'screen' && (
        <B onClick={ops.lookScreen}>
          <Eye /> {compact ? 'Screen' : 'Look at the screen'}
        </B>
      )}
      <B onClick={() => ops.read('screen')} blocked={ops.why.bench}>
        {compact ? 'Read rule' : 'Read the rule'}
      </B>
      <B brand={s.aligned && s.rough !== null} onClick={ops.take} blocked={ops.why.take}>
        <Camera /> {compact ? 'Take' : 'Take this reading'} ({s.readings.length})
      </B>
    </div>
  );
}

/** Eye-level reading of a holder's mark on the metre rule: which holder, and the eye up or down. */
export function OpticsReadingPanel({ s, onBack }: { s: PhyOpticsState; onBack: () => void }) {
  const eye = useLabView((v) => v.eye);
  const set = useLabView((v) => v.set);
  const readAt = useBench((b) => b.readAt);
  const task = s.task ?? 'LENS';
  const nudge = (d: number) => set({ eye: Math.max(-0.05, Math.min(0.05, eye + d)) });
  const uName = task === 'MIRROR' ? 'Object' : 'Lens';
  return (
    <section className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 mx-auto max-w-md rounded-2xl border border-border bg-card/97 p-3 text-card-foreground shadow-2xl backdrop-blur sm:bottom-4" aria-label="Reading the metre rule">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-display text-[15px] font-semibold tracking-tight">
          <Eye className="size-4 text-muted-foreground" aria-hidden /> Read the metre rule
        </p>
      </div>
      <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
        Read the red index line of the {readAt === 'screen' ? 'screen' : uName.toLowerCase()}’s holder against the scale, to 0.1 cm, looking straight at it (raise or lower your eye). {task === 'MIRROR' ? 'The mirror is at 0 cm, so the screen’s mark is v.' : 'v = screen mark − lens mark.'}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border p-0.5" role="tablist" aria-label="Which holder">
          {(['screen', 'u'] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={readAt === k} onClick={() => useBench.setState({ readAt: k })} className={cn('rounded-md px-2 py-1 text-[12px]', readAt === k ? 'bg-foreground text-background' : 'text-muted-foreground')}>
              {k === 'screen' ? 'Screen' : uName}
            </button>
          ))}
        </div>
        <Button size="icon-sm" variant="outline" onClick={() => nudge(0.004)} aria-label="Raise your eye">
          <ArrowUp />
        </Button>
        <Button size="icon-sm" variant="outline" onClick={() => nudge(-0.004)} aria-label="Lower your eye">
          <ArrowDown />
        </Button>
        <Button size="sm" variant="outline" className="ml-auto" onClick={onBack}>
          Back to bench
        </Button>
      </div>
    </section>
  );
}

/** Feedback while sliding a holder along the rule. */
export function OpticsDragFeedback({ drag, s }: { drag: DragState; s: PhyOpticsState }) {
  if (drag.kind !== 'slide-u' && drag.kind !== 'slide-screen') return null;
  return (
    <span className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg">
      {drag.kind === 'slide-u' ? `u = ${s.u.toFixed(1)} cm — let go to stand it there` : 'Sliding the screen — watch the image and stop where it is sharpest'}
    </span>
  );
}
