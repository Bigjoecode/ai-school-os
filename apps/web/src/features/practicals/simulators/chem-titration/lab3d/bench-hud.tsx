import { TITRATION_INDICATOR_INFO, type ChemTitrationState } from '@aischool/shared';
import { ArrowDown, ArrowUp, Droplet, Eye, RotateCw, Square, Waves } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { say } from '../../../lab3d-kit/hud';
import { play, startPour, stopPour } from '../../../lab3d-kit/sound';
import { useLabView, type DragState } from '../../../lab3d-kit/store';
import { DROP, type Titration } from '../actions';
import { tapLevel, useBench } from './bench-store';
import { swirl } from './lab-actions';
import type { SceneState } from './scene-state';

/** The titration's own HUD: the tap dock, the burette-reading panel and the feedback for its drags. */

/** Feedback while dragging the filler, the bottle, the tap or the flask (inside the kit's DragOverlay). */
export function TitrationDragFeedback({ drag }: { drag: DragState }) {
  const tap = useBench((v) => v.tap);
  const pill = 'rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg';
  return (
    <>
      {drag.kind === 'squeeze' && (
        <div className="absolute inset-x-0 top-24 mx-auto w-60 rounded-xl bg-black/70 p-2.5 text-center text-[12.5px] text-white">
          Squeezing the filler — keep holding…
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/20">
            <div className="h-full bg-amber-300" style={{ width: `${drag.value * 100}%` }} />
          </div>
        </div>
      )}
      {drag.kind === 'pour' && (
        <div className="absolute inset-x-0 top-24 mx-auto w-64 rounded-xl bg-black/70 p-2.5 text-center text-[12.5px] text-white">
          {drag.value < 0.7 ? 'Drag up to tilt the bottle over the funnel' : 'Pouring… hold it there'}
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/20">
            <div className={cn('h-full', drag.value < 0.7 ? 'bg-sky-300' : 'bg-emerald-300')} style={{ width: `${drag.value * 100}%` }} />
          </div>
        </div>
      )}
      {drag.kind === 'tap' && <span className={cn(pill, 'absolute left-1/2 top-24 -translate-x-1/2')}>Tap: {tapLabel(tap)} — drag left to close, right to open</span>}
      {drag.kind === 'swirl' && <span className={cn(pill, 'absolute left-1/2 top-24 -translate-x-1/2')}>Swirling — keep moving in circles</span>}
    </>
  );
}
export const tapLabel = (tap: number) => ({ closed: 'closed', drops: 'drop by drop', stream: 'running' })[tapLevel(tap)];

/** Tap controls while titrating: hold to run, one drop, swirl, finish. */
export function TitrationDock({ t, scene, s, compact }: { t: Titration; scene: SceneState; s: ChemTitrationState; compact: boolean }) {
  const set = useBench((v) => v.set);
  const streaming = useBench((v) => v.streaming);
  const can = t.canDeliver && scene.flaskUnder && scene.clamped;
  const why = !t.open ? 'Pipette B into the flask first.' : !t.open.indicator ? 'Add the indicator first.' : !scene.flaskUnder ? 'Stand the flask on the tile under the burette.' : s.burette === null ? 'Fill the burette first.' : '';
  const start = () => {
    if (!can) {
      if (why) say(why);
      return;
    }
    set({ streaming: true });
    t.startStream();
    startPour();
  };
  const stop = () => {
    if (!useBench.getState().streaming || tapLevel(useBench.getState().tap) === 'stream') return;
    set({ streaming: false });
    t.stopStream();
    stopPour();
  };
  const tap = useBench((v) => v.tap);
  const level = tapLevel(tap);
  const setTap = (to: number) => {
    if (to > 0 && !can) return why && say(why);
    if (Math.abs(to - tap) > 0.05) play('creak');
    set({ tap: to });
  };
  return (
    <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5 rounded-2xl border border-white/15 bg-black/55 p-2 text-white shadow-xl backdrop-blur">
      {t.open && (
        <span className="px-1.5 text-[12px] text-white/80">
          {t.open.kind === 'ROUGH' ? 'Rough' : 'Accurate'} titration{t.open.indicator && !compact ? ` · ${TITRATION_INDICATOR_INFO[t.open.indicator].label}` : ''}
        </span>
      )}
      <div className="flex overflow-hidden rounded-lg border border-white/20" role="group" aria-label="Burette tap (or drag the tap itself)">
        {(['closed', 'drops', 'stream'] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setTap(l === 'closed' ? 0 : l === 'drops' ? 0.35 : 0.9)}
            aria-pressed={level === l}
            className={cn('px-2 py-1.5 text-[12px] font-medium', level === l ? 'bg-white text-slate-900' : 'bg-white/10 text-white hover:bg-white/20', l !== 'closed' && !can && 'opacity-55')}
          >
            {l === 'closed' ? 'Tap shut' : l === 'drops' ? 'Dropwise' : 'Stream'}
          </button>
        ))}
      </div>
      <Button
        size="sm"
        variant="brand"
        className={cn('touch-none select-none', !can && 'opacity-55', streaming && 'ring-2 ring-white')}
        aria-disabled={!can}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          start();
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onLostPointerCapture={stop}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
            e.preventDefault();
            if (can) t.deliver(0.5, true);
            else if (why) say(why);
          }
        }}
        aria-label="Open the tap: hold to run acid in (Enter adds 0.5 cm³)"
      >
        <Waves /> Hold tap open
      </Button>
      <Button
        size="sm"
        variant="outline"
        className={cn('border-white/20 bg-white/10 text-white hover:bg-white/20', !can && 'opacity-55')}
        aria-disabled={!can}
        onClick={() => {
          if (!can) return why && say(why);
          t.deliver(DROP, false);
          set({ dropAt: performance.now() });
          play('drip');
        }}
      >
        <Droplet /> 1 drop
      </Button>
      <Button size="sm" variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20" disabled={!t.open} onClick={() => swirl(t)}>
        <RotateCw /> Swirl
      </Button>
      <Button size="sm" variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20" disabled={!t.open || t.open.initial === null} onClick={() => (set({ tap: 0 }), stop(), t.finish())}>
        <Square /> Close tap · finish
      </Button>
    </div>
  );
}

const ordinal = (n: number) => ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][n - 1] ?? `${n}th`;
/** The reading view's panel: eye position and the two readings of the current row. */
export function ReadingPanel({ t, s, onBack }: { t: Titration; s: ChemTitrationState; onBack: () => void }) {
  const eye = useLabView((v) => v.eye);
  const set = useLabView((v) => v.set);
  const row = t.openIndex >= 0 ? t.openIndex : s.runs.length - 1;
  const run = row >= 0 ? s.runs[row] : null;
  const accurateNo = run ? s.runs.slice(0, row + 1).filter((r) => r.kind === 'ACCURATE').length : 0;
  const level = Math.abs(eye) < 0.004 ? 'level' : eye > 0 ? 'above' : 'below';
  const setCell = (key: 'initial' | 'final', value: string) => t.update((x) => ({ ...x, table: x.table.map((r, k) => (k === row ? { ...r, [key]: value.slice(0, 40) } : r)) }));
  const nudge = (d: number) => set({ eye: Math.max(-0.05, Math.min(0.05, eye + d)) });
  return (
    <section className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 mx-auto max-w-md rounded-2xl border border-border bg-card/97 p-3 text-card-foreground shadow-2xl backdrop-blur sm:bottom-4" aria-label="Reading the burette">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-display text-[15px] font-semibold tracking-tight">
          <Eye className="size-4 text-muted-foreground" aria-hidden /> Read the burette
        </p>
        <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-medium', level === 'level' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')} aria-live="polite">
          {level === 'level' ? 'Eye level with the meniscus' : `Eye ${level} the meniscus`}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">Move your eye until the ring marks look like straight lines, then read the bottom of the meniscus to 2 decimal places.</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="flex gap-1">
          <Button size="icon-sm" variant="outline" onClick={() => nudge(0.002)} aria-label="Raise your eye">
            <ArrowUp />
          </Button>
          <Button size="icon-sm" variant="outline" onClick={() => nudge(-0.002)} aria-label="Lower your eye">
            <ArrowDown />
          </Button>
        </div>
        {run ? (
          <>
            <label className="text-[11.5px] text-muted-foreground">
              {run.kind === 'ROUGH' ? 'Rough' : `${ordinal(accurateNo)} accurate`}: initial
              <Input value={s.table[row]?.initial ?? ''} onChange={(e) => setCell('initial', e.target.value)} inputMode="decimal" placeholder="0.00" className="mt-0.5 h-9 w-[92px] tabular" />
            </label>
            <label className="text-[11.5px] text-muted-foreground">
              final
              <Input value={s.table[row]?.final ?? ''} onChange={(e) => setCell('final', e.target.value)} inputMode="decimal" placeholder="0.00" className="mt-0.5 h-9 w-[92px] tabular" />
            </label>
          </>
        ) : (
          <p className="text-[12px] text-muted-foreground">Pipette B into the flask to start a row in your table.</p>
        )}
        <Button size="sm" variant="outline" className="ml-auto" onClick={onBack}>
          Back to bench
        </Button>
      </div>
    </section>
  );
}

