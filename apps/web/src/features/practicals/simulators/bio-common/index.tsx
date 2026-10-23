import { BIO_DRAWING_STATEMENTS, type BioDrawingStatement } from '@aischool/shared';
import { Check, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

/**
 * Shared by the biology labs: a label board (drag a label chip, or tap a chip
 * then a box, to name each numbered structure on a drawing or view; label lines
 * are ruled out to boxes at the sides, as in a WAEC biological drawing) and the
 * biological drawing checklist.
 */

export interface LabelBoardProps {
  /** The drawing's own box (the content is drawn in these units). */
  box: { x: number; y: number; w: number; h: number };
  children: ReactNode;
  targets: { x: number; y: number }[];
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  readOnly: boolean;
  label: string;
  /** Optional clip for the drawing (e.g. the circular field of view). */
  clip?: ReactNode;
  /** Shown after marking: which boxes are right. */
  correct?: string[];
}

export function LabelBoard({ box, children, targets, options, value, onChange, readOnly, label, clip, correct }: LabelBoardProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ label: string; x: number; y: number } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const side = box.w * 0.62;
  const fs = box.w * 0.048;
  const total = { x: box.x - side, y: box.y, w: box.w + side * 2, h: box.h };
  const cx = box.x + box.w / 2;
  // Each target gets a box on the side it is nearer, spaced down that side in order of height.
  const slots = (() => {
    const idx = targets.map((t, i) => ({ ...t, i }));
    const left = idx.filter((t) => t.x < cx).sort((a, b) => a.y - b.y);
    const right = idx.filter((t) => t.x >= cx).sort((a, b) => a.y - b.y);
    const place = (col: typeof idx, onLeft: boolean) =>
      col.map((t, k) => {
        const y = box.y + (box.h * (k + 1)) / (col.length + 1);
        return { i: t.i, tx: t.x, ty: t.y, y, x: onLeft ? box.x - side + fs * 0.4 : box.x + box.w + fs * 0.6, w: side - fs, left: onLeft };
      });
    return [...place(left, true), ...place(right, false)].sort((a, b) => a.i - b.i);
  })();
  const used = new Set(value.filter(Boolean));
  const assign = (i: number, l: string | null) => {
    if (readOnly) return;
    const next = targets.map((_, k) => value[k] ?? '');
    if (l) for (let k = 0; k < next.length; k++) if (next[k] === l) next[k] = '';
    next[i] = l ?? '';
    onChange(next);
    setPicked(null);
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-slot]');
      if (el) assign(Number(el.getAttribute('data-slot')), d.label);
      else setPicked(d.label);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);

  return (
    <div className="space-y-3">
      <svg viewBox={`${total.x} ${total.y} ${total.w} ${total.h}`} className="w-full touch-none select-none rounded-xl border border-border bg-card" role="group" aria-label={label}>
        {clip}
        <g>{children}</g>
        {slots.map((s) => {
          const ex = s.left ? s.x + s.w : s.x;
          const got = value[s.i] ?? '';
          const ok = correct ? got === correct[s.i] : null;
          return (
            <g key={s.i}>
              <line x1={s.tx} y1={s.ty} x2={ex} y2={s.y} stroke="currentColor" className="text-foreground/80" strokeWidth={fs * 0.09} />
              <circle cx={s.tx} cy={s.ty} r={fs * 0.32} className="fill-brand stroke-card" strokeWidth={fs * 0.08} />
              <g
                data-slot={s.i}
                role="button"
                tabIndex={readOnly ? -1 : 0}
                aria-label={`Label ${s.i + 1}: ${got || 'empty'}${picked ? `. Place “${picked}” here` : ''}`}
                onClick={() => (picked ? assign(s.i, picked) : got && assign(s.i, null))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (picked) assign(s.i, picked);
                    else if (got) assign(s.i, null);
                  }
                }}
                className={cn(!readOnly && 'cursor-pointer', 'outline-none [&:focus-visible>rect]:stroke-ring')}
              >
                <rect x={s.x} y={s.y - fs * 0.85} width={s.w} height={fs * 1.7} rx={fs * 0.3} className={cn(got ? 'fill-card' : 'fill-muted', ok === true ? 'stroke-success' : ok === false ? 'stroke-danger' : picked ? 'stroke-brand' : 'stroke-border')} strokeWidth={fs * 0.08} strokeDasharray={got ? undefined : `${fs * 0.3} ${fs * 0.2}`} />
                <text x={s.x + fs * 0.35} y={s.y + fs * 0.35} fontSize={fs * 0.82} className={got ? 'fill-foreground' : 'fill-muted-foreground'}>
                  {`${s.i + 1}. ${got ? (got.length > 26 ? `${got.slice(0, 25)}…` : got) : 'drop a label'}`}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
      {!readOnly && (
        <div className="flex flex-wrap gap-1.5" role="list" aria-label="Labels">
          {options.map((o) => (
            <button
              key={o}
              type="button"
              role="listitem"
              aria-pressed={picked === o}
              onPointerDown={(e) => {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                e.preventDefault();
                setDrag({ label: o, x: e.clientX, y: e.clientY });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setPicked((p) => (p === o ? null : o));
                }
              }}
              className={cn(
                'touch-none rounded-full border px-3 py-1.5 text-[12.5px] transition-colors',
                picked === o ? 'border-brand bg-brand text-white' : used.has(o) ? 'border-border bg-muted text-muted-foreground' : 'border-border-strong bg-card hover:border-brand',
              )}
            >
              {o}
            </button>
          ))}
          <span className="w-full text-[11.5px] text-muted-foreground">Drag a label onto a box, or tap a label and then a box. Tap a filled box to clear it.</span>
        </div>
      )}
      {drag && (
        <div className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand px-3 py-1.5 text-[12.5px] text-white shadow-pop" style={{ left: drag.x, top: drag.y }}>
          {drag.label}
        </div>
      )}
    </div>
  );
}

/** Tick the statements that are good practice in a biological drawing. */
export function DrawingChecklist({ shown, value, onChange, readOnly }: { shown: BioDrawingStatement[]; value: string[]; onChange: (next: string[]) => void; readOnly: boolean }) {
  return (
    <div>
      <p className="mb-2 text-[12.5px] text-muted-foreground">You will make a labelled drawing of what you observed. Tick every statement that is good practice in a biological drawing (leave the poor practice unticked).</p>
      <ul className="space-y-2">
        {shown.map((s) => {
          const on = value.includes(s.id);
          const id = `draw-${s.id}`;
          return (
            <li key={s.id} className="flex items-start gap-2.5">
              <Checkbox id={id} checked={on} disabled={readOnly} onCheckedChange={(c) => onChange(c ? [...value.filter((x) => x !== s.id), s.id] : value.filter((x) => x !== s.id))} className="mt-0.5" />
              <label htmlFor={id} className="text-[13px] leading-snug">
                {s.text}
                {readOnly && (
                  <span className={cn('ml-1.5 inline-flex items-center gap-0.5 text-[11.5px]', s.good === on ? 'text-success' : 'text-danger')}>
                    {s.good === on ? <Check className="size-3" aria-hidden /> : <X className="size-3" aria-hidden />} {s.good ? 'good practice' : 'poor practice'}
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export const drawingStatement = (id: string) => BIO_DRAWING_STATEMENTS.find((s) => s.id === id);

/** A collapsible step card heading used by both labs. */
export function Step({ n, title, children, done }: { n: number; title: string; children: ReactNode; done?: boolean }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold">
        <span className={cn('grid size-5 place-items-center rounded-full text-[11px]', done ? 'bg-success text-white' : 'bg-muted text-muted-foreground')}>{done ? <Check className="size-3" aria-hidden /> : n}</span>
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
