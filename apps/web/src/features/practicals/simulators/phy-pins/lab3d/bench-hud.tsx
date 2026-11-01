import { DEPTH_BLOCKS, PINS_SPACING, type PhyPinsState } from '@aischool/shared';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Eye, Lightbulb, MapPin, Minus, MoveHorizontal, Plus, RotateCcw, RotateCw, Ruler, Scissors, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLabView, type DragState } from '../../../lab3d-kit/store';
import { dockButton, dockClass } from '../../phy-common/lab3d/common';
import { PIN_LABEL, gap12, type Pins } from '../actions';
import { DepthEye, DispScreen, EyeView } from '../views2d';
import { useBench } from './bench-store';
import { eyePhi, nextIFor, type Ops } from './lab-actions';

/** The pin bench's HUD: the dock for each task (every step is a button) and the drag feedback. */

const B = ({ children, onClick, blocked, brand, pressed, label }: { children: React.ReactNode; onClick: () => void; blocked?: string; brand?: boolean; pressed?: boolean; label?: string }) => (
  <Button size="sm" variant={brand && !blocked ? 'brand' : 'outline'} className={cn(!brand && dockButton, blocked && 'opacity-55', pressed && 'ring-2 ring-white')} aria-disabled={!!blocked} title={blocked} aria-pressed={pressed} aria-label={label} onClick={onClick}>
    {children}
  </Button>
);
const I = ({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) => (
  <Button size="icon-sm" variant="outline" className={dockButton} onClick={onClick} aria-label={label}>
    {children}
  </Button>
);

export function PinsDock({ g, s, ops, compact }: { g: Pins; s: PhyPinsState; ops: Ops; compact: boolean }) {
  if (g.task === 'DEPTH') return <DepthDock g={g} s={s} ops={ops} compact={compact} />;
  if (g.task === 'DISP') return <DispDock g={g} s={s} ops={ops} compact={compact} />;
  return <BoardDock g={g} s={s} ops={ops} compact={compact} />;
}

function BoardDock({ g, s, ops, compact }: { g: Pins; s: PhyPinsState; ops: Ops; compact: boolean }) {
  const b = useBench();
  const focus = useLabView((v) => v.focus);
  const open = g.open;
  const what = g.bt === 'MIRROR' ? 'mirror' : 'prism';
  const joined = s.traces.map((t, k) => ({ t, k })).filter(({ t }) => t.joined);
  if (!open)
    return (
      <div className={dockClass} aria-label="Drawing board">
        {joined.length > 0 && (
          <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Your traces">
            <span className="text-[11.5px] text-white/70">Sheets:</span>
            {joined.map(({ t, k }) => {
              const sel = b.viewing === k || (b.viewing === null && k === s.traces.length - 1);
              return (
                <button key={k} type="button" role="tab" aria-selected={sel} onClick={() => b.set({ viewing: k })} className={cn('rounded-md px-1.5 py-0.5 text-[11.5px]', sel ? 'bg-white text-slate-900' : 'bg-white/10 hover:bg-white/20')}>
                  {t.i}°
                </button>
              );
            })}
            {focus !== 'protractor' && (
              <B onClick={() => useLabView.getState().set({ focus: 'protractor', spot: null })}>
                <Ruler /> {g.bt === 'MIRROR' ? 'Measure r' : 'Measure D'}
              </B>
            )}
          </div>
        )}
        <div className="flex items-center gap-1">
          <span className="text-[12px] text-white/80">i =</span>
          <I onClick={() => ops.nextI(-5)} label="Decrease the angle of incidence by 5°">
            <Minus />
          </I>
          <span className="w-9 text-center text-[13px] font-semibold tabular">{nextIFor(s, g.bt, b.nextI)}°</span>
          <I onClick={() => ops.nextI(5)} label="Increase the angle of incidence by 5°">
            <Plus />
          </I>
        </div>
        <B brand onClick={ops.startTrace} blocked={ops.why.trace}>
          <Ruler /> {compact ? 'New sheet & ray' : g.bt === 'MIRROR' ? 'New sheet: MM′, mirror and ray' : 'New sheet: trace the prism and the ray'}
        </B>
      </div>
    );
  const pins12 = open.p1 !== null && open.p2 !== null;
  const phi = eyePhi(g);
  return (
    <div className={cn(dockClass, 'max-w-[min(560px,calc(100vw-1rem))]')} aria-label={`Trace at i = ${open.i}°`}>
      <span className="w-full text-[11.5px] font-semibold uppercase tracking-wide text-white/70">
        i = {open.i}° · {!open.normal ? 'draw the normal' : !pins12 ? 'P₁ and P₂ on the ray' : !open.p3 || !open.p4 ? (g.bt === 'MIRROR' ? 'look into the mirror' : 'look through the prism') : `remove the ${what}`}
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
              <Button size="icon-sm" variant="ghost" className="text-white hover:bg-white/15" onClick={() => ops.setDist(p, -0.5)} aria-label={`${PIN_LABEL[p]} nearer O`}>
                <Minus />
              </Button>
              <span className="w-12 text-center text-[12px] tabular">{b.dist[p].toFixed(1)} cm</span>
              <Button size="icon-sm" variant="ghost" className="text-white hover:bg-white/15" onClick={() => ops.setDist(p, 0.5)} aria-label={`${PIN_LABEL[p]} further from O`}>
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
          {pins12 && <span className={cn('text-[11.5px]', gap12(open) >= PINS_SPACING - 0.05 ? 'text-white/70' : 'text-amber-300')}>P₁P₂ = {gap12(open).toFixed(1)} cm</span>}
        </>
      )}
      {pins12 && open.normal && !b.sight && (
        <B brand={!open.p3 || !open.p4} onClick={() => ops.sight(true)} blocked={ops.why.sight}>
          <Eye /> {g.bt === 'MIRROR' ? 'Look into the mirror' : 'Look through the prism'}
        </B>
      )}
      {b.sight && (
        <>
          {!compact && (
            <div className="w-full rounded-lg bg-white p-1 text-slate-900">
              <EyeView v={g.v} task={g.bt} trace={open} phi={phi} />
            </div>
          )}
          <div className="flex items-center gap-1" role="group" aria-label="Move your eye">
            <span className="text-[12px] text-white/80">Eye</span>
            <I onClick={() => ops.moveEye(-1)} label="Move your eye 1° left">
              <ChevronsLeft />
            </I>
            <I onClick={() => ops.moveEye(-0.1)} label="Move your eye 0.1° left">
              <ChevronLeft />
            </I>
            <span className="w-12 text-center text-[11.5px] tabular text-white/80">{phi.toFixed(1)}°</span>
            <I onClick={() => ops.moveEye(0.1)} label="Move your eye 0.1° right">
              <ChevronRight />
            </I>
            <I onClick={() => ops.moveEye(1)} label="Move your eye 1° right">
              <ChevronsRight />
            </I>
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
              [ArrowUp, 0, 0.05, 'up the sheet'],
              [ArrowDown, 0, -0.05, 'down the sheet'],
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
          <Scissors /> Remove the {what} and join
        </B>
      )}
      {!compact && <B onClick={ops.discard}>Discard trace</B>}
    </div>
  );
}

function DepthDock({ g, s, ops, compact }: { g: Pins; s: PhyPinsState; ops: Ops; compact: boolean }) {
  const look = useBench((b) => b.look);
  const d = s.depth;
  return (
    <div className={cn(dockClass, 'max-w-[min(560px,calc(100vw-1rem))]')} aria-label="Real and apparent depth">
      <div className="flex items-center gap-1">
        <span className="text-[12px] text-white/80">Blocks</span>
        <I onClick={() => ops.blocks(-1)} label="Take a block off">
          <Minus />
        </I>
        <span className="w-6 text-center text-[13px] font-semibold tabular">{d.blocks}</span>
        <I onClick={() => d.blocks < DEPTH_BLOCKS && ops.blocks(1)} label="Add a block">
          <Plus />
        </I>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1" role="group" aria-label="Search pin">
        <span className="text-[12px] text-white/80">Pin</span>
        {(compact ? [-0.1, -0.05] : [-1, -0.1, -0.05]).map((x) => (
          <Button key={x} size="sm" variant="outline" className={dockButton} onClick={() => ops.pin(x)} aria-label={`Lower the pin ${Math.abs(x)} cm`}>
            ↓{Math.abs(x)}
          </Button>
        ))}
        <span className="w-14 text-center text-[12px] tabular">{d.h.toFixed(2)}</span>
        {(compact ? [0.05, 0.1] : [0.05, 0.1, 1]).map((x) => (
          <Button key={x} size="sm" variant="outline" className={dockButton} onClick={() => ops.pin(x)} aria-label={`Raise the pin ${x} cm`}>
            ↑{x}
          </Button>
        ))}
      </div>
      <B brand={!look} onClick={() => ops.look(!look)} blocked={ops.why.depth}>
        <Eye /> {look ? 'Stop looking down' : 'Look vertically down'}
      </B>
      {look && (
        <>
          {!compact && (
            <div className="w-full rounded-lg bg-white p-1 text-slate-900">
              <DepthEye v={g.v} blocks={d.blocks} h={d.h} eyeX={d.eyeX} />
            </div>
          )}
          <div className="flex items-center gap-1" role="group" aria-label="Move your eye sideways">
            <I onClick={() => ops.eye(-1)} label="Move your eye 1 cm left">
              <ChevronsLeft />
            </I>
            <span className="w-12 text-center text-[11.5px] tabular text-white/80">{d.eyeX.toFixed(1)} cm</span>
            <I onClick={() => ops.eye(1)} label="Move your eye 1 cm right">
              <ChevronsRight />
            </I>
            <B onClick={ops.wiggle}>
              <MoveHorizontal /> Side to side
            </B>
          </div>
        </>
      )}
      <B brand onClick={ops.take} blocked={ops.why.depth}>
        Take this reading
      </B>
      {g.checked() ? <span className="text-[11.5px] text-emerald-300">Parallax checked</span> : <span className="text-[11.5px] text-white/60">Move your eye to check parallax</span>}
    </div>
  );
}

function DispDock({ g, s, ops, compact }: { g: Pins; s: PhyPinsState; ops: Ops; compact: boolean }) {
  const screen = useBench((b) => b.screen);
  const d = s.disp;
  return (
    <div className={cn(dockClass, 'max-w-[min(560px,calc(100vw-1rem))]')} aria-label="Dispersion">
      <B brand={!d.dark} onClick={ops.dark} blocked={ops.why.disp}>
        <Lightbulb /> {d.dark ? 'Lights on' : 'Darken the room'}
      </B>
      <B brand={d.slit !== 'narrow'} onClick={ops.slit} blocked={ops.why.disp}>
        Slit: {d.slit}
      </B>
      <div className="flex items-center gap-1" role="group" aria-label="Rotate the prism">
        <I onClick={() => ops.rotate(-5)} label="Rotate the prism 5° anticlockwise">
          <RotateCcw />
        </I>
        <Button size="sm" variant="outline" className={dockButton} onClick={() => ops.rotate(-0.5)} aria-label="Rotate 0.5° anticlockwise">
          −½°
        </Button>
        <Button size="sm" variant="outline" className={dockButton} onClick={() => ops.rotate(0.5)} aria-label="Rotate 0.5° clockwise">
          +½°
        </Button>
        <I onClick={() => ops.rotate(5)} label="Rotate the prism 5° clockwise">
          <RotateCw />
        </I>
      </div>
      <div className="flex items-center gap-1" role="group" aria-label="Screen distance">
        <span className="text-[12px] text-white/80">Screen</span>
        <I onClick={() => ops.dist(-10)} label="Screen 10 cm nearer">
          <Minus />
        </I>
        <span className="w-12 text-center text-[12px] tabular">{d.dist} cm</span>
        <I onClick={() => ops.dist(10)} label="Screen 10 cm further">
          <Plus />
        </I>
      </div>
      <div className="flex items-center gap-1" role="group" aria-label="Filter">
        {(['none', 'red', 'green', 'blue'] as const).map((f) => (
          <button key={f} type="button" onClick={() => ops.filter(f)} aria-pressed={d.filter === f} className={cn('rounded-md px-1.5 py-0.5 text-[11.5px]', d.filter === f ? 'bg-white text-slate-900' : 'bg-white/10')}>
            {f === 'none' ? 'No filter' : f}
          </button>
        ))}
      </div>
      <B brand={!screen} onClick={() => ops.screen(!screen)} blocked={ops.why.disp}>
        <Eye /> {screen ? 'Stop looking' : 'Look at the screen'}
      </B>
      {screen && !compact && (
        <div className="w-full rounded-lg bg-white p-1 text-slate-900">
          <DispScreen v={g.v} d={d} />
        </div>
      )}
    </div>
  );
}

export function PinsDragFeedback({ drag }: { drag: DragState }) {
  if (drag.kind !== 'pin' && drag.kind !== 'eye') return null;
  return (
    <span className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg">
      {drag.kind === 'pin' ? 'Moving the pin — let go where it hides the images' : 'Moving your eye — watch the images line up'}
    </span>
  );
}
