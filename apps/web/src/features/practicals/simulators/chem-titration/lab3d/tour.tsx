import { ArrowDown, ArrowUp, Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLabView } from './store';

/**
 * The first-time controls tour: short cards that point at the real control
 * (a spotlight and an arrow) and wait for the student to actually use it
 * ("Now walk forward a little" completes once they have walked). Skippable,
 * replayable from Help; completion is remembered per device by the caller.
 */

export interface TourCtx {
  sheet: string | null;
  touch: boolean;
  practice: boolean;
}
interface TourStep {
  id: string;
  title: string;
  body: (c: TourCtx) => string;
  /** `data-tour` name of the control to point at. */
  target?: string;
  /** Done when this is true (otherwise the student presses Next). */
  done?: (c: TourCtx) => boolean;
  /** The step only shows in practice mode. */
  practiceOnly?: boolean;
}

const STEPS: TourStep[] = [
  { id: 'welcome', title: 'Welcome to the chemistry lab', body: () => 'This is a real school lab in 3D. A one-minute tour shows you how to move and work. You can skip it and replay it any time from Help.' },
  {
    id: 'walk',
    title: 'Walk',
    body: (c) => (c.touch ? 'Push the joystick at the bottom left to walk. Now walk forward a little.' : 'Use W A S D or the arrow keys to walk. Now walk forward a little.'),
    target: 'joystick',
    done: () => useLabView.getState().walked >= 0.9,
  },
  { id: 'look', title: 'Look around', body: (c) => (c.touch ? 'Drag anywhere on the room to turn your head. Look around now.' : 'Drag with the mouse to look around. Try it now.'), done: () => useLabView.getState().looked >= 0.6 },
  { id: 'tap', title: 'Use things', body: (c) => `${c.touch ? 'Tap' : 'Click'} anything to see what it is and what you can do with it — try Mrs Ada, the lab technician by the teacher’s desk, or a poster.`, done: () => useLabView.getState().picked > 0 },
  { id: 'task', title: 'Your task card', body: () => 'The task card is the question paper: what A and B are and what to calculate. Open it now.', target: 'task', done: (c) => c.sheet === 'task' },
  { id: 'notebook', title: 'Your notebook', body: () => 'Every reading and answer goes in your notebook — it is what gets marked. Open it now.', target: 'notebook', done: (c) => c.sheet === 'notebook' },
  { id: 'bench', title: 'Go to your bench', body: () => 'This takes you straight to your bench and sits you down to work. Try it.', target: 'bench', done: () => useLabView.getState().mode === 'bench' },
  { id: 'views', title: 'Bench views', body: (c) => `Use these to look closely at the burette or the flask. ${c.touch ? 'Drag to look around the bench, pinch to zoom.' : 'Drag to look around the bench, scroll to zoom.'} Choose Burette now.`, target: 'focus', done: () => useLabView.getState().focus === 'burette' },
  { id: 'read', title: 'Reading at eye level', body: () => 'Once the burette is filled, “Read burette” brings your eye level with the meniscus. Move your eye up and down until the ring marks look like straight lines, then read the bottom of the curve.', target: 'read' },
  { id: 'hints', title: 'Hints and your checklist', body: () => 'In practice mode this checklist shows each step, and a yellow arrow points at what to use next. Tap Mrs Ada for help at any time.', target: 'guide', practiceOnly: true },
  { id: 'menu', title: 'Pause, 2D lab and help', body: () => 'The menu pauses the lab, switches to the 2D lab (your work is kept) and replays this tour. Open it now.', target: 'menu', done: (c) => c.sheet === 'menu' },
  { id: 'handin', title: 'Hand in', body: () => 'When everything is recorded, hand in from here. You will see a checklist of anything missing first. That’s it — enjoy the lab!', target: 'handin' },
];

/** `closeSheet` tidies away a panel the previous step opened, so it never covers the next control. */
export function Tour({ ctx, onClose, closeSheet }: { ctx: TourCtx; onClose: (finished: boolean) => void; closeSheet: () => void }) {
  const steps = STEPS.filter((s) => ctx.practice || !s.practiceOnly);
  const [i, setI] = useState(0);
  const step = steps[i]!;
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [done, setDone] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  // Follow the target control and watch for the step's action.
  useEffect(() => {
    setDone(false);
    const tick = () => {
      const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
      const r = el && el.offsetParent !== null ? el.getBoundingClientRect() : null;
      setRect((old) => (r && old && Math.abs(old.x - r.x) < 1 && Math.abs(old.y - r.y) < 1 && Math.abs(old.width - r.width) < 1 ? old : r));
      if (step.done?.(ctxRef.current)) setDone(true);
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [step]);
  // A completed action moves on by itself after a moment.
  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => {
      if (step.id !== 'menu') closeSheet();
      if (i < steps.length - 1) setI(i + 1);
      else onClose(true);
    }, 900);
    return () => clearTimeout(id);
  }, [done, i, steps.length, onClose, closeSheet, step.id]);

  const box = host.current?.getBoundingClientRect();
  const local = rect && box ? { x: rect.x - box.x, y: rect.y - box.y, w: rect.width, h: rect.height } : null;
  const below = local ? local.y < (box?.height ?? 600) / 2 : false;
  const waits = !!step.done;

  return (
    <div ref={host} className="pointer-events-none absolute inset-0 z-[35]">
      {local && (
        <>
          <div className="absolute rounded-xl ring-4 ring-amber-300 transition-all duration-300" style={{ left: local.x - 6, top: local.y - 6, width: local.w + 12, height: local.h + 12, boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }} />
          <div className="absolute animate-bounce text-amber-300" style={{ left: local.x + local.w / 2 - 14, top: below ? local.y + local.h + 10 : local.y - 42 }}>
            {below ? <ArrowUp className="size-7 drop-shadow" /> : <ArrowDown className="size-7 drop-shadow" />}
          </div>
        </>
      )}
      <section
        // Buttons give focus back to the lab, so the keyboard walks straight away.
        onClickCapture={() => setTimeout(() => (document.activeElement as HTMLElement | null)?.blur?.(), 0)}
        className={cn('pointer-events-auto absolute inset-x-2 mx-auto max-w-sm rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-2xl', local && !below ? 'top-16' : local ? 'bottom-24' : waits ? 'top-14' : 'top-1/2 -translate-y-1/2')}
        role="dialog"
        aria-label={`Tour: ${step.title}`}
        aria-live="polite"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Lab tour · {i + 1} of {steps.length}
        </p>
        <h3 className="mt-0.5 font-display text-[16px] font-semibold tracking-tight">{step.title}</h3>
        <p className="mt-1 text-[13.5px] leading-snug text-muted-foreground">{step.body(ctx)}</p>
        {waits && (
          <p className={cn('mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium', done ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')}>
            {done ? <Check className="size-3.5" aria-hidden /> : <span className="size-2 animate-pulse rounded-full bg-current" aria-hidden />}
            {done ? 'Well done!' : 'Waiting for you to try it…'}
          </p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => onClose(false)}>
            Skip tour
          </Button>
          <div className="ml-auto flex gap-1.5">
            {i > 0 && (
              <Button size="sm" variant="outline" onClick={() => setI(i - 1)}>
                Back
              </Button>
            )}
            <Button size="sm" variant={waits && !done ? 'outline' : 'brand'} onClick={() => (step.id !== 'handin' && step.id !== 'menu' && closeSheet(), i < steps.length - 1 ? setI(i + 1) : onClose(true))}>
              {i === steps.length - 1 ? 'Finish' : waits && !done ? 'Skip step' : 'Next'}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
