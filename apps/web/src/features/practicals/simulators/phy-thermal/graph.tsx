import { phyFit, type PhyGraphLine } from '@aischool/shared';
import { LineChart, MoveLeft, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The student's graph on a grid with chosen ranges (Charles's law needs the
 * temperature axis to run back to −300 °C so the line can be extended to
 * l = 0; the heating curve needs a temperature axis that starts near the
 * room's): their own points from the table, and a straight line placed and
 * dragged by its two ends. The ends' coordinates are shown so the slope can
 * be read from two points far apart.
 */

const W = 360;
const H = 260;
const M = { l: 46, r: 12, t: 12, b: 38 };
function niceStep(span: number, ticks = 6): number {
  const raw = span / ticks;
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
const fmt = (x: number) => Number(x.toPrecision(3)).toString();

export function ThermGraph({
  points,
  line,
  onLine,
  readOnly,
  xLabel,
  yLabel,
  x: xr,
  y: yr,
  extendToZero,
}: {
  points: { x: number; y: number }[];
  line: PhyGraphLine | null;
  onLine: (l: PhyGraphLine | null) => void;
  readOnly: boolean;
  xLabel: string;
  yLabel: string;
  /** Fixed axis ranges, or 'auto' from the points (with a margin). */
  x: [number, number] | 'auto';
  y: [number, number] | 'auto';
  /** Charles's law: offer to extend the line back to y = 0. */
  extendToZero?: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<1 | 2 | null>(null);
  const auto = (vals: number[], pad: number): [number, number] => {
    if (!vals.length) return [0, 1];
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const span = Math.max(hi - lo, Math.abs(hi) * 0.05, 1e-6);
    return [lo - span * pad, hi + span * pad];
  };
  const [x0r, x1r] = xr === 'auto' ? auto(points.map((p) => p.x), 0.08) : xr;
  const [y0r, y1r] = yr === 'auto' ? auto(points.map((p) => p.y), 0.15) : yr;
  const sx = niceStep(x1r - x0r);
  const sy = niceStep(y1r - y0r);
  const xMin = Math.floor(x0r / sx) * sx;
  const xMax = Math.ceil(x1r / sx) * sx;
  const yMin = Math.floor(y0r / sy) * sy;
  const yMax = Math.ceil(y1r / sy) * sy;
  const px = (x: number) => M.l + ((x - xMin) / (xMax - xMin)) * (W - M.l - M.r);
  const py = (y: number) => H - M.b - ((y - yMin) / (yMax - yMin)) * (H - M.t - M.b);
  const clampX = (x: number) => Math.max(xMin, Math.min(xMax, x));
  const clampY = (y: number) => Math.max(yMin, Math.min(yMax, y));
  const toData = (cx: number, cy: number) => {
    const el = svg.current;
    const ctm = el?.getScreenCTM();
    if (!el || !ctm) return null;
    const p = new DOMPoint(cx, cy).matrixTransform(ctm.inverse());
    const x = clampX(xMin + ((p.x - M.l) / (W - M.l - M.r)) * (xMax - xMin));
    const y = clampY(yMin + ((H - M.b - p.y) / (H - M.t - M.b)) * (yMax - yMin));
    return { x: Number(x.toPrecision(4)), y: Number(y.toPrecision(4)) };
  };
  const fit = phyFit(points);
  const place = () => {
    if (!fit || points.length < 2) return;
    const xs = points.map((p) => p.x);
    const a = Math.min(...xs);
    const b = Math.max(...xs);
    onLine({ x1: a, y1: Number((fit.intercept + fit.slope * a).toPrecision(4)), x2: b, y2: Number((fit.intercept + fit.slope * b).toPrecision(4)) });
  };
  const extend = () => {
    if (!line) return;
    const m = (line.y2 - line.y1) / (line.x2 - line.x1 || 1e-9);
    if (!Number.isFinite(m) || Math.abs(m) < 1e-12) return;
    const x0 = Number(clampX(line.x1 - line.y1 / m).toPrecision(4));
    const y0 = Number((line.y1 + m * (x0 - line.x1)).toPrecision(4));
    onLine(line.x1 <= line.x2 ? { ...line, x1: x0, y1: y0 } : { ...line, x2: x0, y2: y0 });
  };
  const nudge = (end: 1 | 2, dx: number, dy: number) => {
    if (!line) return;
    const k = end === 1 ? (['x1', 'y1'] as const) : (['x2', 'y2'] as const);
    onLine({ ...line, [k[0]]: Number(clampX(line[k[0]] + dx * (xMax - xMin)).toPrecision(4)), [k[1]]: Number(clampY(line[k[1]] + dy * (yMax - yMin)).toPrecision(4)) });
  };
  const xt: number[] = [];
  for (let x = xMin; x <= xMax + sx * 1e-6; x += sx) xt.push(Number(x.toPrecision(6)));
  const yt: number[] = [];
  for (let y = yMin; y <= yMax + sy * 1e-6; y += sy) yt.push(Number(y.toPrecision(6)));
  const zeroX = xMin < 0 && xMax > 0 ? px(0) : null;
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
        {zeroX !== null && <line x1={zeroX} x2={zeroX} y1={M.t} y2={H - M.b} className="stroke-foreground/40" strokeWidth="0.8" strokeDasharray="3 3" />}
        <text x={(M.l + W - M.r) / 2} y={H - 8} textAnchor="middle" fontSize="10" className="fill-foreground">
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
                    const st = e.shiftKey ? 0.05 : 0.005;
                    const m: Record<string, [number, number]> = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, st], ArrowDown: [0, -st] };
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
            {extendToZero && line && (
              <Button size="sm" variant="outline" onClick={extend}>
                <MoveLeft /> Extend it back to l = 0
              </Button>
            )}
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
