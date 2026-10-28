import { phyFit, type PhyGraphLine, type RatesCurve } from '@aischool/shared';
import { LineChart, Spline, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The rates graph: one or two series of the student's own points (from the
 * table), each joined as the student chooses (a smooth curve or a straight
 * line of best fit — the wrong one for curved data loses a mark), and one or
 * more straight lines they place and drag by their ends (a tangent at t = 0,
 * or the best line of 1/t against volume). Arrow keys move a selected end.
 */

export type XY = { x: number; y: number };
export interface GraphSeries {
  id: string;
  label: string;
  colour: string;
  points: XY[];
  curve?: RatesCurve | null;
  onCurve?: (c: RatesCurve | null) => void;
}
export interface GraphLine {
  id: string;
  label: string;
  colour: string;
  line: PhyGraphLine | null;
  onLine: (l: PhyGraphLine | null) => void;
  /** Where a new line goes (null: not enough points yet). */
  place: () => PhyGraphLine | null;
  placeLabel: string;
}

const W = 340;
const H = 250;
const M = { l: 46, r: 12, t: 12, b: 36 };
function niceStep(max: number, ticks = 5): number {
  const raw = max / ticks;
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
const fmt = (x: number) => Number(x.toPrecision(3)).toString();

/** A monotone cubic (Fritsch–Carlson) through points sorted by x: an SVG path in screen space. */
function smoothPath(pts: [number, number][]): string {
  const n = pts.length;
  if (n < 2) return '';
  const d: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1]![1] - pts[i]![1]) / (pts[i + 1]![0] - pts[i]![0] || 1e-9));
  m.push(d[0]!);
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2);
  m.push(d[n - 2]!);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) m[i] = m[i + 1] = 0;
    else {
      const a = m[i]! / d[i]!;
      const b = m[i + 1]! / d[i]!;
      const s = a * a + b * b;
      if (s > 9) {
        const t = 3 / Math.sqrt(s);
        m[i] = t * a * d[i]!;
        m[i + 1] = t * b * d[i]!;
      }
    }
  }
  let out = `M${pts[0]![0]} ${pts[0]![1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[i + 1]!;
    const h = (x1 - x0) / 3;
    out += ` C${x0 + h} ${y0 + m[i]! * h} ${x1 - h} ${y1 - m[i + 1]! * h} ${x1} ${y1}`;
  }
  return out;
}

export function RatesGraph({ series, lines, xLabel, yLabel, readOnly, extent }: { series: GraphSeries[]; lines: GraphLine[]; xLabel: string; yLabel: string; readOnly: boolean; extent?: { x: number; y: number } }) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ line: string; end: 1 | 2 } | null>(null);
  const all = series.flatMap((s) => s.points);
  const ends = lines.flatMap((l) => (l.line ? [{ x: l.line.x1, y: l.line.y1 }, { x: l.line.x2, y: l.line.y2 }] : []));
  // an empty graph still gets sensible axes (0 … 1)
  const maxX = Math.max(...all.map((p) => p.x), ...ends.map((p) => p.x), extent?.x ?? 0) || 1;
  const maxY = Math.max(...all.map((p) => p.y), ...ends.map((p) => p.y), extent?.y ?? 0) || 1;
  const sx = niceStep(maxX * 1.05);
  const sy = niceStep(maxY * 1.08);
  const xMax = Math.ceil((maxX * 1.05) / sx) * sx;
  const yMax = Math.ceil((maxY * 1.08) / sy) * sy;
  const px = (x: number) => M.l + (x / xMax) * (W - M.l - M.r);
  const py = (y: number) => H - M.b - (y / yMax) * (H - M.t - M.b);
  const toData = (cx: number, cy: number) => {
    const ctm = svg.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(cx, cy).matrixTransform(ctm.inverse());
    const x = Math.max(0, Math.min(xMax, ((p.x - M.l) / (W - M.l - M.r)) * xMax));
    const y = Math.max(0, Math.min(yMax, ((H - M.b - p.y) / (H - M.t - M.b)) * yMax));
    return { x: Number(x.toPrecision(4)), y: Number(y.toPrecision(4)) };
  };
  const nudge = (g: GraphLine, end: 1 | 2, dx: number, dy: number) => {
    const l = g.line;
    if (!l) return;
    const kx = end === 1 ? 'x1' : 'x2';
    const ky = end === 1 ? 'y1' : 'y2';
    g.onLine({ ...l, [kx]: Math.max(0, Number((l[kx] + dx * xMax).toPrecision(4))), [ky]: Math.max(0, Number((l[ky] + dy * yMax).toPrecision(4))) });
  };
  const xt = Array.from({ length: Math.round(xMax / sx) + 1 }, (_, i) => i * sx);
  const yt = Array.from({ length: Math.round(yMax / sy) + 1 }, (_, i) => i * sy);
  return (
    <div>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none rounded-xl border border-border bg-card"
        role="img"
        aria-label={`Graph of ${yLabel} against ${xLabel}: ${series.map((s) => `${s.points.length} points (${s.label})`).join(', ')}`}
        onPointerMove={(e) => {
          if (!drag || readOnly) return;
          const g = lines.find((l) => l.id === drag.line);
          const d = toData(e.clientX, e.clientY);
          if (g?.line && d) g.onLine(drag.end === 1 ? { ...g.line, x1: d.x, y1: d.y } : { ...g.line, x2: d.x, y2: d.y });
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
        {series.map((s) => {
          const sorted = [...s.points].sort((a, b) => a.x - b.x);
          const fit = s.curve === 'STRAIGHT' ? phyFit(sorted) : null;
          return (
            <g key={s.id}>
              {s.curve === 'SMOOTH' && sorted.length >= 2 && <path d={smoothPath(sorted.map((p) => [px(p.x), py(p.y)]))} fill="none" stroke={s.colour} strokeWidth="1.4" />}
              {fit && sorted.length >= 2 && <line x1={px(sorted[0]!.x)} y1={py(fit.intercept + fit.slope * sorted[0]!.x)} x2={px(sorted.at(-1)!.x)} y2={py(fit.intercept + fit.slope * sorted.at(-1)!.x)} stroke={s.colour} strokeWidth="1.4" />}
              {s.points.map((p, i) => (
                <g key={i} stroke={s.colour} strokeWidth="1.4">
                  <line x1={px(p.x) - 4} x2={px(p.x) + 4} y1={py(p.y) - 4} y2={py(p.y) + 4} />
                  <line x1={px(p.x) - 4} x2={px(p.x) + 4} y1={py(p.y) + 4} y2={py(p.y) - 4} />
                </g>
              ))}
            </g>
          );
        })}
        {lines.map((g) =>
          g.line ? (
            <g key={g.id}>
              <line x1={px(g.line.x1)} y1={py(g.line.y1)} x2={px(g.line.x2)} y2={py(g.line.y2)} stroke={g.colour} strokeWidth="1.3" strokeDasharray={series.length > 0 && g.id.startsWith('tan') ? '5 3' : undefined} />
              {([1, 2] as const).map((end) => {
                const x = end === 1 ? g.line!.x1 : g.line!.x2;
                const y = end === 1 ? g.line!.y1 : g.line!.y2;
                return (
                  <circle
                    key={end}
                    cx={px(x)}
                    cy={py(y)}
                    r={readOnly ? 3 : 8}
                    fill={g.colour}
                    fillOpacity={readOnly ? 1 : 0.25}
                    stroke={g.colour}
                    className={cn(!readOnly && 'cursor-grab')}
                    strokeWidth="1.2"
                    tabIndex={readOnly ? -1 : 0}
                    role={readOnly ? undefined : 'slider'}
                    aria-label={`${g.label}: end ${end} at (${fmt(x)}, ${fmt(y)}); arrow keys move it`}
                    aria-valuenow={x}
                    onPointerDown={(e) => {
                      if (readOnly) return;
                      e.stopPropagation();
                      (e.currentTarget.ownerSVGElement ?? e.currentTarget).setPointerCapture?.(e.pointerId);
                      setDrag({ line: g.id, end });
                    }}
                    onKeyDown={(e) => {
                      if (readOnly) return;
                      const step = e.shiftKey ? 0.05 : 0.005;
                      const k: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
                      if (k[e.key]) {
                        e.preventDefault();
                        nudge(g, end, ...k[e.key]!);
                      }
                    }}
                  />
                );
              })}
            </g>
          ) : null,
        )}
        {all.length === 0 && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="10" className="fill-muted-foreground">
            Your points appear here as you fill in the table.
          </text>
        )}
      </svg>
      <div className="mt-2 space-y-1.5 text-[12px]">
        {!readOnly &&
          series
            .filter((s) => s.onCurve)
            .map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <span className="size-2.5 rounded-full" style={{ background: s.colour }} aria-hidden /> {s.label}:
                </span>
                <Button size="sm" variant={s.curve === 'SMOOTH' ? 'brand' : 'outline'} onClick={() => s.onCurve!('SMOOTH')} disabled={s.points.length < 3} aria-pressed={s.curve === 'SMOOTH'}>
                  <Spline /> Smooth curve
                </Button>
                <Button size="sm" variant={s.curve === 'STRAIGHT' ? 'brand' : 'outline'} onClick={() => s.onCurve!('STRAIGHT')} disabled={s.points.length < 2} aria-pressed={s.curve === 'STRAIGHT'}>
                  <LineChart /> Straight line
                </Button>
                {s.curve && (
                  <Button size="sm" variant="ghost" onClick={() => s.onCurve!(null)}>
                    Clear
                  </Button>
                )}
              </div>
            ))}
        {lines.map((g) => (
          <div key={g.id} className="flex flex-wrap items-center gap-2">
            {!readOnly && (
              <>
                <Button size="sm" variant="outline" onClick={() => g.onLine(g.place())} disabled={!g.place()}>
                  <LineChart /> {g.line ? `Redraw ${g.placeLabel}` : `Draw ${g.placeLabel}`}
                </Button>
                {g.line && (
                  <Button size="sm" variant="ghost" onClick={() => g.onLine(null)} aria-label={`Remove ${g.label}`}>
                    <Trash2 />
                  </Button>
                )}
              </>
            )}
            {g.line ? (
              <span className="tabular text-muted-foreground">
                <span style={{ color: g.colour }}>{g.label}</span> through ({fmt(g.line.x1)}, {fmt(g.line.y1)}) and ({fmt(g.line.x2)}, {fmt(g.line.y2)})
              </span>
            ) : (
              <span className="text-muted-foreground">{g.label}: place it, then drag its ends.</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Rows of the table as numbers (only rows where both are numbers). */
export function numericPoints(pairs: [string | undefined, string | undefined][]): XY[] {
  const out: XY[] = [];
  for (const [a, b] of pairs) {
    const x = Number((a ?? '').trim());
    const y = Number((b ?? '').trim());
    if ((a ?? '').trim() && (b ?? '').trim() && Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
  }
  return out;
}
