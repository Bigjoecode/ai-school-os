import { phyFit, type PhyAnswer, type PhyGraphLine } from '@aischool/shared';
import { ChevronDown, LineChart, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Shared pieces of the physics labs: the task card, step boxes, answer rows, the log-keeping updater and the graph. */

export function useLabUpdate<S extends { log: { t: number; a: string }[] }>(state: S, onChange: (next: S) => void, readOnly: boolean, startedAt: string) {
  const t0 = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const ref = useRef(state);
  ref.current = state;
  const update = (fn: (s: S) => S, log?: string) => {
    if (readOnly) return;
    let next = fn(ref.current);
    if (log) next = { ...next, log: [...next.log, { t: Math.max(0, Date.now() - t0), a: log.slice(0, 80) }].slice(-600) };
    ref.current = next;
    onChange(next);
  };
  return { update, ref };
}

export function TaskCard({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <Card className="p-4 sm:p-5">
      <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpen((b) => !b)} aria-expanded={open}>
        <span className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
          {icon} The task
        </span>
        <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && <div className="mt-3 space-y-2 text-[13.5px] leading-relaxed">{children}</div>}
    </Card>
  );
}

export function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="mb-2 text-[12.5px] font-semibold">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

export function AnswerRow({ id, label, answer, onChange, readOnly, unitHint, noUnit }: { id: string; label: string; answer: PhyAnswer; onChange: (key: 'value' | 'unit', value: string) => void; readOnly: boolean; unitHint: string; noUnit?: boolean }) {
  return (
    <div>
      <label className="mb-1 block text-[12.5px] text-muted-foreground" htmlFor={`ans-${id}`}>
        {label}
      </label>
      <div className="flex gap-2">
        <Input id={`ans-${id}`} value={answer.value} onChange={(e) => onChange('value', e.target.value.slice(0, 40))} disabled={readOnly} inputMode="decimal" placeholder="value" className="tabular" />
        <Input value={answer.unit} onChange={(e) => onChange('unit', e.target.value.slice(0, 40))} disabled={readOnly} placeholder={noUnit ? 'unit (if any)' : unitHint} className="w-32 shrink-0" aria-label={`Unit for ${label}`} />
      </div>
    </div>
  );
}

/** A table cell input. */
export function Cell({ value, onChange, readOnly, label, placeholder }: { value: string; onChange: (v: string) => void; readOnly: boolean; label: string; placeholder?: string }) {
  return <Input value={value} onChange={(e) => onChange(e.target.value.slice(0, 40))} disabled={readOnly} inputMode="decimal" placeholder={placeholder} className="h-9 w-[78px] px-2 tabular" aria-label={label} />;
}

// ------------------------------------------------------------------ graph

const W = 340;
const H = 250;
const M = { l: 44, r: 12, t: 12, b: 36 };
function niceStep(max: number, ticks = 5): number {
  const raw = max / ticks;
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
const fmt = (x: number) => Number(x.toPrecision(3)).toString();

/**
 * The student's graph: their own points (from the table) on a grid from the
 * origin, and a straight line they place and drag by its two ends. The ends'
 * coordinates are shown so the slope can be read from two points far apart.
 */
export function PhyGraph({ points, line, onLine, readOnly, xLabel, yLabel, extent }: { points: { x: number; y: number }[]; line: PhyGraphLine | null; onLine: (l: PhyGraphLine | null) => void; readOnly: boolean; xLabel: string; yLabel: string; /** Optional: axes at least this long (so a line can be extended to meet them). */ extent?: { x: number; y: number } }) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<1 | 2 | null>(null);
  const maxX = Math.max(...points.map((p) => p.x), line ? Math.max(line.x1, line.x2) : 0, extent?.x ?? 0, 1e-9);
  const maxY = Math.max(...points.map((p) => p.y), line ? Math.max(line.y1, line.y2) : 0, extent?.y ?? 0, 1e-9);
  const sx = niceStep(maxX * 1.08);
  const sy = niceStep(maxY * 1.08);
  const xMax = Math.ceil((maxX * 1.08) / sx) * sx;
  const yMax = Math.ceil((maxY * 1.08) / sy) * sy;
  const px = (x: number) => M.l + (x / xMax) * (W - M.l - M.r);
  const py = (y: number) => H - M.b - (y / yMax) * (H - M.t - M.b);
  const toData = (cx: number, cy: number) => {
    const el = svg.current;
    const ctm = el?.getScreenCTM();
    if (!el || !ctm) return null;
    const p = new DOMPoint(cx, cy).matrixTransform(ctm.inverse());
    const x = Math.max(0, Math.min(xMax, ((p.x - M.l) / (W - M.l - M.r)) * xMax));
    const y = Math.max(0, Math.min(yMax, ((H - M.b - p.y) / (H - M.t - M.b)) * yMax));
    return { x: Number(x.toPrecision(4)), y: Number(y.toPrecision(4)) };
  };
  const place = () => {
    if (points.length < 2) return;
    const lo = points.reduce((a, b) => (b.x < a.x ? b : a));
    const hi = points.reduce((a, b) => (b.x > a.x ? b : a));
    onLine({ x1: lo.x, y1: lo.y, x2: hi.x, y2: hi.y });
  };
  const nudge = (end: 1 | 2, dx: number, dy: number) => {
    if (!line) return;
    const k = end === 1 ? { x: 'x1', y: 'y1' } : { x: 'x2', y: 'y2' };
    onLine({ ...line, [k.x]: Math.max(0, Number((line[k.x as 'x1'] + dx * xMax).toPrecision(4))), [k.y]: Math.max(0, Number((line[k.y as 'y1'] + dy * yMax).toPrecision(4))) });
  };
  const xt = Array.from({ length: Math.round(xMax / sx) + 1 }, (_, i) => i * sx);
  const yt = Array.from({ length: Math.round(yMax / sy) + 1 }, (_, i) => i * sy);
  const fit = phyFit(points);
  return (
    <div>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none rounded-xl border border-border bg-card"
        role="img"
        aria-label={`Graph of ${yLabel} against ${xLabel}: ${points.length} points${line ? ', with your line' : ''}`}
        onPointerMove={(e) => {
          if (!drag || !line || readOnly) return;
          const d = toData(e.clientX, e.clientY);
          if (d) onLine(drag === 1 ? { ...line, x1: d.x, y1: d.y } : { ...line, x2: d.x, y2: d.y });
        }}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        {xt.map((x) => (
          <g key={`x${x}`}>
            <line x1={px(x)} x2={px(x)} y1={M.t} y2={H - M.b} className="stroke-border" strokeWidth="0.6" />
            <text x={px(x)} y={H - M.b + 12} textAnchor="middle" fontSize="9" className="fill-muted-foreground">
              {fmt(x)}
            </text>
          </g>
        ))}
        {yt.map((y) => (
          <g key={`y${y}`}>
            <line x1={M.l} x2={W - M.r} y1={py(y)} y2={py(y)} className="stroke-border" strokeWidth="0.6" />
            <text x={M.l - 4} y={py(y) + 3} textAnchor="end" fontSize="9" className="fill-muted-foreground">
              {fmt(y)}
            </text>
          </g>
        ))}
        <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} className="stroke-foreground/70" strokeWidth="1" />
        <line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} className="stroke-foreground/70" strokeWidth="1" />
        <text x={(M.l + W - M.r) / 2} y={H - 6} textAnchor="middle" fontSize="10" className="fill-foreground">
          {xLabel}
        </text>
        <text x={11} y={(M.t + H - M.b) / 2} textAnchor="middle" fontSize="10" className="fill-foreground" transform={`rotate(-90 11 ${(M.t + H - M.b) / 2})`}>
          {yLabel}
        </text>
        {points.map((p, i) => (
          <g key={i} className="stroke-brand" strokeWidth="1.4">
            <line x1={px(p.x) - 4} x2={px(p.x) + 4} y1={py(p.y) - 4} y2={py(p.y) + 4} />
            <line x1={px(p.x) - 4} x2={px(p.x) + 4} y1={py(p.y) + 4} y2={py(p.y) - 4} />
          </g>
        ))}
        {line && (
          <g>
            <line x1={px(line.x1)} y1={py(line.y1)} x2={px(line.x2)} y2={py(line.y2)} className="stroke-foreground" strokeWidth="1.3" />
            {([1, 2] as const).map((end) => {
              const x = end === 1 ? line.x1 : line.x2;
              const y = end === 1 ? line.y1 : line.y2;
              return (
                <circle
                  key={end}
                  cx={px(x)}
                  cy={py(y)}
                  r={readOnly ? 3 : 8}
                  className={cn(readOnly ? 'fill-foreground' : 'cursor-grab fill-brand/25 stroke-brand')}
                  strokeWidth="1.2"
                  tabIndex={readOnly ? -1 : 0}
                  role={readOnly ? undefined : 'slider'}
                  aria-label={`End ${end} of your line at (${fmt(x)}, ${fmt(y)}); arrow keys move it`}
                  aria-valuenow={x}
                  onPointerDown={(e) => {
                    if (readOnly) return;
                    e.stopPropagation();
                    (e.currentTarget.ownerSVGElement ?? e.currentTarget).setPointerCapture?.(e.pointerId);
                    setDrag(end);
                  }}
                  onKeyDown={(e) => {
                    if (readOnly) return;
                    const step = e.shiftKey ? 0.05 : 0.005;
                    const m: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
                    if (m[e.key]) {
                      e.preventDefault();
                      nudge(end, ...m[e.key]!);
                    }
                  }}
                />
              );
            })}
          </g>
        )}
        {points.length === 0 && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="10" className="fill-muted-foreground">
            Your points appear here as you fill in the table.
          </text>
        )}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
        {!readOnly && (
          <>
            <Button size="sm" variant="outline" onClick={place} disabled={points.length < 2}>
              <LineChart /> {line ? 'Redraw line' : 'Draw a straight line'}
            </Button>
            {line && (
              <Button size="sm" variant="ghost" onClick={() => onLine(null)}>
                <Trash2 /> Remove line
              </Button>
            )}
          </>
        )}
        {line ? (
          <span className="tabular text-muted-foreground">
            Line through ({fmt(line.x1)}, {fmt(line.y1)}) and ({fmt(line.x2)}, {fmt(line.y2)})
          </span>
        ) : (
          <span className="text-muted-foreground">{fit ? 'Draw your best straight line, then drag its ends.' : 'Plot at least two points first.'}</span>
        )}
      </div>
    </div>
  );
}

/** Rows of the table as numbers (only rows where both are numbers). */
export function numericPoints(pairs: [string | undefined, string | undefined][]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const [a, b] of pairs) {
    const x = Number((a ?? '').trim());
    const y = Number((b ?? '').trim());
    if ((a ?? '').trim() && (b ?? '').trim() && Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
  }
  return out;
}
