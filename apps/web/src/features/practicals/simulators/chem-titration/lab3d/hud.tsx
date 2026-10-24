import { TITRATION_INDICATOR_INFO, type ChemTitrationState } from '@aischool/shared';
import { ArrowDown, ArrowUp, Check, Droplet, Eye, Footprints, Info, MapPin, PackageOpen, RotateCw, Square, Waves, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/lib/utils';
import { DROP, type Titration } from '../actions';
import { swirl, type ObjectPanel } from './lab-actions';
import { APPARATUS, APPARATUS_LABEL, type ApparatusId, type SceneState } from './scene-state';
import type { Explainer } from './explain';
import { play, startPour, stopPour } from './sound';
import { notify, tapLevel, useLabView } from './store';

const say = (m: string) => notify(m, 'info', 2200);

/** A floating panel over the 3D view (bottom sheet on phones). */
export function Panel({ title, onClose, children, className, side = 'right' }: { title: ReactNode; onClose: () => void; children: ReactNode; className?: string; side?: 'right' | 'center' }) {
  return (
    <section
      className={cn(
        'pointer-events-auto absolute z-30 flex max-h-[72%] flex-col overflow-hidden rounded-2xl border border-border bg-card/97 text-card-foreground shadow-2xl backdrop-blur',
        side === 'right' ? 'inset-x-2 bottom-2 sm:inset-x-auto sm:bottom-3 sm:right-3 sm:top-16 sm:max-h-none sm:w-[440px]' : 'inset-x-2 top-1/2 mx-auto max-w-lg -translate-y-1/2',
        className,
      )}
      role="dialog"
      aria-label={typeof title === 'string' ? title : undefined}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h3 className="font-display text-[15px] font-semibold tracking-tight">{title}</h3>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
    </section>
  );
}

/** The actions for the selected object. */
export function ContextMenu({ panel, onClose, explain, readOnly = false }: { panel: ObjectPanel; onClose: () => void; explain?: { e: Explainer; lesson: string[] } | null; readOnly?: boolean }) {
  const [info, setInfo] = useState(false);
  const actions = readOnly ? [] : panel.actions;
  return (
    <section className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 mx-auto max-h-[70%] max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card/97 p-3 text-card-foreground shadow-2xl backdrop-blur sm:bottom-4" role="dialog" aria-label={panel.title}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-[15px] font-semibold tracking-tight">{panel.title}</p>
          {panel.info && <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">{panel.info}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          {explain && (
            <Button variant={info ? 'secondary' : 'ghost'} size="sm" className="h-8 px-2 text-[12px]" onClick={() => setInfo((x) => !x)} aria-expanded={info}>
              <Info /> What is this?
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>
      </div>
      {info && explain && (
        <dl className="mt-2 space-y-1.5 rounded-xl bg-info-soft/60 p-2.5 text-[12.5px] leading-snug">
          <div>
            <dt className="font-semibold">{explain.e.name}</dt>
            <dd className="text-muted-foreground">{explain.e.purpose}</dd>
          </div>
          <div>
            <dt className="font-semibold">How to use it</dt>
            <dd className="text-muted-foreground">{explain.e.how}</dd>
          </div>
          <div>
            <dt className="font-semibold text-warning">Common mistake</dt>
            <dd className="text-muted-foreground">{explain.e.mistake}</dd>
          </div>
          {explain.lesson.length > 0 && (
            <div>
              <dt className="font-semibold">From your lesson</dt>
              {explain.lesson.map((l) => (
                <dd key={l} className="text-muted-foreground">
                  {l}
                </dd>
              ))}
            </div>
          )}
        </dl>
      )}
      {actions.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {actions.map((a) =>
            a.hold ? (
              <HoldButton key={a.key} label={a.label} blocked={a.blocked} onDone={a.run} />
            ) : (
              <Button
                key={a.key}
                size="sm"
                variant={!a.blocked && a.tone === 'brand' ? 'brand' : 'outline'}
                className={cn(a.blocked && 'opacity-55', a.tone === 'danger' && !a.blocked && 'text-danger')}
                aria-disabled={!!a.blocked}
                title={a.blocked}
                onClick={() => {
                  if (a.blocked) {
                    say(a.blocked);
                    return;
                  }
                  play('tick');
                  a.run();
                }}
              >
                {a.label}
              </Button>
            ),
          )}
        </div>
      )}
    </section>
  );
}

/** Press and hold (e.g. squeezing the pipette filler); Enter or Space completes it at once for keyboard users. */
function HoldButton({ label, blocked, onDone, ms = 1200 }: { label: string; blocked?: string; onDone: () => void; ms?: number }) {
  const [p, setP] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setP(0);
  };
  useEffect(() => stop, []);
  const start = () => {
    if (blocked) return say(blocked);
    const t0 = performance.now();
    stop();
    timer.current = setInterval(() => {
      const f = (performance.now() - t0) / ms;
      if (f >= 1) {
        stop();
        play('success');
        onDone();
      } else setP(f);
    }, 40);
  };
  return (
    <Button
      size="sm"
      variant={blocked ? 'outline' : 'brand'}
      className={cn('relative touch-none select-none overflow-hidden', blocked && 'opacity-55')}
      aria-disabled={!!blocked}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        start();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
          e.preventDefault();
          if (blocked) say(blocked);
          else onDone();
        }
      }}
    >
      <span className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${p * 100}%` }} aria-hidden />
      <span className="relative">{label}</span>
    </Button>
  );
}

/** Feedback while dragging: the carry tray, the filler squeeze, the pour tilt and the tap setting. */
export function DragOverlay() {
  const drag = useLabView((v) => v.drag);
  const tap = useLabView((v) => v.tap);
  if (!drag) return null;
  const pill = 'rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg';
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {drag.kind === 'carry' && drag.moved > 8 && (
        <>
          <div className="pointer-events-auto absolute inset-x-0 bottom-3 mx-auto flex h-20 w-[min(320px,90%)] items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-300/20 text-[13px] font-semibold text-white backdrop-blur" data-drop="tray">
            <PackageOpen className="size-5" aria-hidden /> Drop here to carry it to your bench
          </div>
          <span className={cn(pill, 'fixed -translate-x-1/2 -translate-y-full')} style={{ left: drag.x, top: drag.y - 8 }}>
            {APPARATUS_LABEL[drag.id.slice(4) as ApparatusId]}
          </span>
        </>
      )}
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
    </div>
  );
}
export const tapLabel = (tap: number) => ({ closed: 'closed', drops: 'drop by drop', stream: 'running' })[tapLevel(tap)];

/** Tap controls while titrating: hold to run, one drop, swirl, finish. */
export function TitrationDock({ t, scene, s, compact }: { t: Titration; scene: SceneState; s: ChemTitrationState; compact: boolean }) {
  const set = useLabView((v) => v.set);
  const streaming = useLabView((v) => v.streaming);
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
    if (!useLabView.getState().streaming || tapLevel(useLabView.getState().tap) === 'stream') return;
    set({ streaming: false });
    t.stopStream();
    stopPour();
  };
  const tap = useLabView((v) => v.tap);
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

/** Apparatus checklist with take / put back (the same as clicking in the cupboard). */
export function CupboardList({ scene, t }: { scene: SceneState; t: Titration }) {
  return (
    <ul className="divide-y divide-border">
      {APPARATUS.map((a) => {
        const have = scene.collected.has(a.id);
        return (
          <li key={a.id} className="flex items-center justify-between gap-2 py-2">
            <span className="flex items-center gap-2 text-[13.5px]">
              <span className={cn('grid size-5 place-items-center rounded-full border', have ? 'border-success bg-success-soft text-success' : 'border-border text-transparent')} aria-hidden>
                <Check className="size-3" />
              </span>
              {a.label}
            </span>
            <Button size="sm" variant={have ? 'ghost' : 'outline'} onClick={() => t.note(`${have ? 'return' : 'collect'}:${a.id}`)}>
              {have ? 'Put back' : 'Take'}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

export function HelpContent({ touch }: { touch: boolean }) {
  const rows: [string, ReactNode][] = touch
    ? [
        ['Walk', 'Joystick, bottom left'],
        ['Look around', 'Drag anywhere'],
        ['Use something', 'Tap it, then choose an action'],
        ['Bench view', 'Drag to look around the bench, pinch to zoom'],
        ['Reading view', 'Drag up / down to move your eye'],
      ]
    : [
        ['Walk', <><Kbd>W</Kbd> <Kbd>A</Kbd> <Kbd>S</Kbd> <Kbd>D</Kbd> or arrow keys</>],
        ['Look around', 'Drag with the mouse'],
        ['Use something', 'Click it, then choose an action'],
        ['Go to my bench', <Kbd key="b">B</Kbd>],
        ['Bench view', 'Drag to orbit, wheel or + / − to zoom, arrow keys'],
        ['Read the burette', <><Kbd>R</Kbd>, then ↑ / ↓ or the wheel to move your eye</>],
        ['Tap', <>Hold <Kbd>Space</Kbd> to run acid, <Kbd>D</Kbd> one drop, <Kbd>F</Kbd> swirl</>],
        ['Notebook / task card', <><Kbd>N</Kbd> / <Kbd>T</Kbd></>],
        ['Menu, back', <Kbd key="esc">Esc</Kbd>],
      ];
  return (
    <div className="space-y-3 text-[13.5px]">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-medium">{k}</dt>
            <dd className="text-muted-foreground">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground">Every action is also a button: select an object to see what you can do with it. Your work saves itself; you can switch to the 2D lab at any time and nothing is lost.</p>
    </div>
  );
}

/** Mode buttons (bottom right). */
export function ModeBar({ canRead, onRead }: { canRead: boolean; onRead: () => void }) {
  const mode = useLabView((v) => v.mode);
  const focus = useLabView((v) => v.focus);
  const set = useLabView((v) => v.set);
  const glass = 'border-white/20 bg-black/45 text-white backdrop-blur hover:bg-black/60';
  if (mode === 'walk')
    return (
      <Button size="sm" variant="outline" className={glass} onClick={() => set({ mode: 'bench', focus: 'bench', selected: null })} data-tour="bench">
        <MapPin /> Go to my bench
      </Button>
    );
  if (mode === 'read') return null;
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <div className="flex gap-1.5" data-tour="focus">
        {(['bench', 'burette', 'flask'] as const).map((f) => (
          <Button key={f} size="sm" variant="outline" className={cn(glass, focus === f && 'bg-white/25')} onClick={() => set({ focus: f })} aria-pressed={focus === f}>
            {f === 'bench' ? 'Whole bench' : f === 'burette' ? 'Burette' : 'Flask'}
          </Button>
        ))}
      </div>
      <Button size="sm" variant="outline" className={cn(glass, !canRead && 'opacity-55')} aria-disabled={!canRead} onClick={onRead} data-tour="read">
        <Eye /> Read burette
      </Button>
      <Button size="sm" variant="outline" className={glass} onClick={() => set({ mode: 'walk', selected: null, held: null })}>
        <Footprints /> Walk
      </Button>
    </div>
  );
}

/** The short message under the hint bar. */
export function Notice() {
  const notice = useLabView((v) => v.notice);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => tick((n) => n + 1), Math.max(0, notice.until - Date.now()) + 20);
    return () => clearTimeout(id);
  }, [notice]);
  if (!notice || notice.until < Date.now()) return null;
  const tone = { info: 'bg-black/70 text-white', success: 'bg-success text-white', warning: 'bg-amber-400 text-black', danger: 'bg-danger text-white' }[notice.tone];
  return (
    <p className={cn('mx-auto max-w-md rounded-xl px-3 py-1.5 text-center text-[12.5px] font-medium shadow-lg', tone)} role="status" aria-live="polite">
      {notice.text}
    </p>
  );
}
