import { GLASS_PIN_SPACING, type PhyGlassState } from '@aischool/shared';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Eye, MapPin, Minus, Plus, Ruler, Scissors, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLabView, type DragState } from '../../../lab3d-kit/store';
import { dockButton, dockClass } from '../../phy-common/lab3d/common';
import { PIN_LABEL, type Glass } from '../actions';
import { EyeView } from '../index';
import { useBench } from './bench-store';
import type { Ops } from './lab-actions';
import { nextIFor } from './scene-state';

/** The glass-block bench's HUD: the dock (what to do next with the board, the pins and the eye) and the drag feedback. */

const B = ({ children, onClick, blocked, brand, pressed, label }: { children: React.ReactNode; onClick: () => void; blocked?: string; brand?: boolean; pressed?: boolean; label?: string }) => (
  <Button size="sm" variant={brand && !blocked ? 'brand' : 'outline'} className={cn(!brand && dockButton, blocked && 'opacity-55', pressed && 'ring-2 ring-white')} aria-disabled={!!blocked} title={blocked} aria-pressed={pressed} aria-label={label} onClick={onClick}>
    {children}
  </Button>
);

export function GlassDock({ g, s, ops, compact }: { g: Glass; s: PhyGlassState; ops: Ops; compact: boolean }) {
  const b = useBench();
  const focus = useLabView((v) => v.focus);
  const open = g.open;
  const i = nextIFor(s, b.nextI);
  const setDist = (p: 'p1' | 'p2', d: number) => b.set({ dist: { ...b.dist, [p]: Math.max(0.5, Math.min(14, Math.round((b.dist[p] + d) * 10) / 10)) } });
  const joinedTraces = s.traces.map((t, k) => ({ t, k })).filter(({ t }) => t.joined);

  if (!open)
    return (
      <div className={dockClass} aria-label="Drawing board">
        {joinedTraces.length > 0 && (
          <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Your traces">
            <span className="text-[11.5px] text-white/70">Sheets:</span>
            {joinedTraces.map(({ t, k }) => (
              <button key={k} type="button" role="tab" aria-selected={b.viewing === k || (b.viewing === null && k === s.traces.length - 1)} onClick={() => b.set({ viewing: k })} className={cn('rounded-md px-1.5 py-0.5 text-[11.5px]', b.viewing === k || (b.viewing === null && k === s.traces.length - 1) ? 'bg-white text-slate-900' : 'bg-white/10 hover:bg-white/20')}>
                {t.i}°
              </button>
            ))}
            {focus !== 'protractor' && (
              <B onClick={() => useLabView.getState().set({ focus: 'protractor', spot: null })}>
                <Ruler /> Measure r
              </B>
            )}
          </div>
        )}
        <div className="flex items-center gap-1">
          <span className="text-[12px] text-white/80">i =</span>
          <Button size="icon-sm" variant="outline" className={dockButton} onClick={() => ops.nextI(-5)} aria-label="Decrease the angle of incidence by 5°">
            <Minus />
          </Button>
          <span className="w-9 text-center text-[13px] font-semibold tabular">{i}°</span>
          <Button size="icon-sm" variant="outline" className={dockButton} onClick={() => ops.nextI(5)} aria-label="Increase the angle of incidence by 5°">
            <Plus />
          </Button>
        </div>
        <B brand onClick={ops.startTrace} blocked={ops.why.trace}>
          <Ruler /> {compact ? 'Trace & draw ray' : 'Trace the block and draw the ray'}
        </B>
      </div>
    );

  const pins12 = open.p1 !== null && open.p2 !== null;
  const gap = pins12 ? Math.abs(open.p1! - open.p2!) : 0;
  return (
    <div className={cn(dockClass, 'max-w-[min(560px,calc(100vw-1rem))]')} aria-label={`Trace at i = ${open.i}°`}>
      <span className="w-full text-[11.5px] font-semibold uppercase tracking-wide text-white/70">
        i = {open.i}° · {!open.normal ? 'draw the normal' : !pins12 ? 'P₁ and P₂ on the ray' : !open.p3 || !open.p4 ? 'look through CD' : 'remove the block'}
      </span>
      {!open.normal && (
        <B brand onClick={ops.drawNormal}>
          <Ruler /> Draw the normal at O
        </B>
      )}
      {open.normal && !b.sight && (
        <>
          {(['p1', 'p2'] as const).map((p) => (
            <div key={p} className="flex items-center gap-1 rounded-lg bg-white/5 px-1 py-0.5">
              <span className="text-[12px] font-semibold">{PIN_LABEL[p]}</span>
              <Button size="icon-sm" variant="ghost" className="text-white hover:bg-white/15" onClick={() => setDist(p, -0.5)} aria-label={`${PIN_LABEL[p]} nearer O`}>
                <Minus />
              </Button>
              <span className="w-12 text-center text-[12px] tabular">{b.dist[p].toFixed(1)} cm</span>
              <Button size="icon-sm" variant="ghost" className="text-white hover:bg-white/15" onClick={() => setDist(p, 0.5)} aria-label={`${PIN_LABEL[p]} further from O`}>
                <Plus />
              </Button>
              <B brand={open[p] === null} onClick={() => ops.pushOnRay(p)} label={`Push ${PIN_LABEL[p]} in at ${b.dist[p].toFixed(1)} cm from O`}>
                {open[p] === null ? 'Push in' : 'Move'}
              </B>
              <B onClick={() => b.set({ tool: b.tool === p ? null : p })} pressed={b.tool === p} label={`Tap the paper to place ${PIN_LABEL[p]}`}>
                <MapPin />
              </B>
            </div>
          ))}
          {pins12 && <span className={cn('text-[11.5px]', gap >= GLASS_PIN_SPACING - 0.05 ? 'text-white/70' : 'text-amber-300')}>P₁P₂ = {gap.toFixed(1)} cm</span>}
        </>
      )}
      {pins12 && open.normal && !b.sight && (
        <B brand={!open.p3 || !open.p4} onClick={() => ops.sight(true)} blocked={ops.why.sight}>
          <Eye /> Look through face CD
        </B>
      )}
      {b.sight && (
        <>
          {!compact && (
            <div className="w-full rounded-lg bg-white p-1 text-slate-900">
              <EyeView v={g.v} trace={open} eyeX={b.eyeX} />
            </div>
          )}
          <div className="flex items-center gap-1" role="group" aria-label="Move your eye">
            <span className="text-[12px] text-white/80">Eye</span>
            <Button size="icon-sm" variant="outline" className={dockButton} onClick={() => ops.moveEye(-1)} aria-label="Move your eye 1 cm left">
              <ChevronsLeft />
            </Button>
            <Button size="icon-sm" variant="outline" className={dockButton} onClick={() => ops.moveEye(-0.1)} aria-label="Move your eye 1 mm left">
              <ChevronLeft />
            </Button>
            <span className="w-14 text-center text-[11.5px] tabular text-white/80">{b.eyeX.toFixed(1)} cm</span>
            <Button size="icon-sm" variant="outline" className={dockButton} onClick={() => ops.moveEye(0.1)} aria-label="Move your eye 1 mm right">
              <ChevronRight />
            </Button>
            <Button size="icon-sm" variant="outline" className={dockButton} onClick={() => ops.moveEye(1)} aria-label="Move your eye 1 cm right">
              <ChevronsRight />
            </Button>
          </div>
          <B brand={!open.p3} onClick={() => ops.pushInLine('p3')} blocked={ops.why.p34}>
            {open.p3 ? 'Re-push P₃' : 'Push P₃'} in line
          </B>
          <B brand={!!open.p3 && !open.p4} onClick={() => ops.pushInLine('p4')} blocked={ops.why.p34}>
            {open.p4 ? 'Re-push P₄' : 'Push P₄'} in line
          </B>
          <B onClick={() => ops.sight(false)}>
            <Undo2 /> Back to the board
          </B>
        </>
      )}
      {(open.p3 || open.p4) && (
        <div className="flex items-center gap-1" role="group" aria-label="Nudge P₃ or P₄">
          {(['p3', 'p4'] as const).map((p) => (
            <button key={p} type="button" disabled={!open[p]} onClick={() => b.set({ nudgePin: p })} aria-pressed={b.nudgePin === p} className={cn('rounded-md px-1.5 py-0.5 text-[11.5px]', b.nudgePin === p ? 'bg-white text-slate-900' : 'bg-white/10', !open[p] && 'opacity-40')}>
              {PIN_LABEL[p]}
            </button>
          ))}
          {(
            [
              [ArrowLeft, -0.05, 0, 'left'],
              [ArrowRight, 0.05, 0, 'right'],
              [ArrowUp, 0, 0.1, 'up the sheet'],
              [ArrowDown, 0, -0.1, 'down the sheet'],
            ] as const
          ).map(([Icon, dx, dy, w]) => (
            <Button key={w} size="icon-sm" variant="ghost" className="text-white hover:bg-white/15" onClick={() => g.nudge(b.nudgePin, dx, dy)} aria-label={`Nudge ${PIN_LABEL[b.nudgePin]} ${w}`}>
              <Icon />
            </Button>
          ))}
        </div>
      )}
      {open.p3 && open.p4 && (
        <B brand onClick={ops.join} blocked={ops.why.join}>
          <Scissors /> Remove the block and join
        </B>
      )}
      {!compact && (
        <B onClick={ops.discard}>
          Discard trace
        </B>
      )}
    </div>
  );
}

/** Feedback while dragging P₃ / P₄ or moving the eye. */
export function GlassDragFeedback({ drag }: { drag: DragState }) {
  if (drag.kind !== 'pin' && drag.kind !== 'eye') return null;
  return (
    <span className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg">
      {drag.kind === 'pin' ? 'Moving the pin — let go where it hides the images' : 'Moving your eye — line up the images of P₁ and P₂'}
    </span>
  );
}
