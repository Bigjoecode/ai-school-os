import { Check, Eye, Footprints, Info, MapPin, PackageOpen, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/lib/utils';
import type { Explainer } from './explain';
import { play } from './sound';
import { notify, useLabView, type DragState } from './store';

/**
 * The HUD pieces every lab uses: floating panels, the selected object's
 * actions ("What is this?" card included), press-and-hold buttons, the drag
 * overlay, the cupboard checklist, controls help, the mode bar and notices.
 */

export const say = (m: string) => notify(m, 'info', 2200);

/** One action on an object; a blocked one says why instead of running. */
export interface LabAction {
  key: string;
  label: string;
  run: () => void;
  /** Why it can't be done now (shown instead of running). */
  blocked?: string;
  tone?: 'brand' | 'danger';
  /** Press and hold to do it (e.g. squeezing a pipette filler). */
  hold?: boolean;
}
/** What the context menu shows for the selected object. */
export interface ObjectPanel {
  title: string;
  info?: string;
  actions: LabAction[];
}

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
export function HoldButton({ label, blocked, onDone, ms = 1200 }: { label: string; blocked?: string; onDone: () => void; ms?: number }) {
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

/** Feedback while dragging: the kit's carry tray, then `children` — the lab's own feedback for its drag kinds. */
export function DragOverlay({ labels, children }: { labels: Record<string, string>; children?: (drag: DragState) => ReactNode }) {
  const drag = useLabView((v) => v.drag);
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
            {labels[drag.id.slice(4)] ?? drag.id.slice(4)}
          </span>
        </>
      )}
      {children?.(drag)}
    </div>
  );
}

/** Apparatus checklist with take / put back (the same as clicking in the cupboard). */
export function CupboardList({ items, has, onToggle }: { items: { id: string; label: string }[]; has: (id: string) => boolean; onToggle: (id: string, take: boolean) => void }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((a) => {
        const have = has(a.id);
        return (
          <li key={a.id} className="flex items-center justify-between gap-2 py-2">
            <span className="flex items-center gap-2 text-[13.5px]">
              <span className={cn('grid size-5 place-items-center rounded-full border', have ? 'border-success bg-success-soft text-success' : 'border-border text-transparent')} aria-hidden>
                <Check className="size-3" />
              </span>
              {a.label}
            </span>
            <Button size="sm" variant={have ? 'ghost' : 'outline'} onClick={() => onToggle(a.id, !have)}>
              {have ? 'Put back' : 'Take'}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
/** Controls help; `extra`: the lab's own rows (e.g. its reading view and keyboard shortcuts), added before "Notebook / task card". */
export type HelpRow = [string, ReactNode];
export function HelpContent({ touch, extra = [] }: { touch: boolean; extra?: HelpRow[] }) {
  const rows: HelpRow[] = touch
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
        ...extra,
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

/** Mode buttons (bottom right): go to the bench, the lab's bench views (first is 'bench'), its reading view, walk. */
export function ModeBar({ views, read, onRead }: { views: { id: string; label: string }[]; read?: { label: string; can: boolean }; onRead?: () => void }) {
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
      <div className="flex flex-wrap justify-end gap-1.5" data-tour="focus">
        {views.map((f) => (
          <Button key={f.id} size="sm" variant="outline" className={cn(glass, focus === f.id && 'bg-white/25')} onClick={() => set({ focus: f.id })} aria-pressed={focus === f.id}>
            {f.label}
          </Button>
        ))}
      </div>
      {read && (
        <Button size="sm" variant="outline" className={cn(glass, !read.can && 'opacity-55')} aria-disabled={!read.can} onClick={onRead} data-tour="read">
          <Eye /> {read.label}
        </Button>
      )}
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
