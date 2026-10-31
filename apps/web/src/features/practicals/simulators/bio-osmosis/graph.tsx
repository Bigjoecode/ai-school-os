import { lineXIntercept, phyFit, type PhyGraphLine } from '@aischool/shared';
import { LineChart, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The student's graph of % change against concentration: gains above the 0 %
 * line, losses below it. Their own points (from the table) and a straight line
 * they place and drag by its two ends (or nudge with the arrow keys); where it
 * crosses 0 % is shown so the isotonic concentration can be read.
 */

const W = 360;
const H = 250;
const M = { l: 44, r: 12, t: 12, b: 36 };
const fmt = (x: number) => String(Number(x.toPrecision(3)));
function niceStep(span: number) {
  const raw = span / 6;
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

export function OsmoGraph({ points, line, onLine, readOnly, xLabel, yLabel }: { points: { x: number; y: number }[]; line: PhyGraphLine | null; onLine: (l: PhyGraphLine | null) => void; readOnly: boolean; xLabel: string; yLabel: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<1 | 2 | null>(null);
  const xs = [...points.map((p) => p.x), ...(line ? [line.x1, line.x2] : []), 0.8];
  const ys = [...points.map((p) => p.y), ...(line ? [line.y1, line.y2] : []), 5, -5];
  const xMaxRaw = Math.max(...xs);
  const sx = niceStep(xMaxRaw * 1.05);
  const xMax = Math.ceil((xMaxRaw * 1.05) / sx) * sx;
  const yHiRaw = Math.max(...ys) * 1.1;
  const yLoRaw = Math.min(...ys) * 1.1;
  const sy = niceStep(yHiRaw - yLoRaw);
  const yMax = Math.ceil(yHiRaw / sy) * sy;
  const yMin = Math.floor(yLoRaw / sy) * sy;
  const px = (x: number) => M.l + (x / xMax) * (W - M.l - M.r);
  const py = (y: number) => H - M.b - ((y - yMin) / (yMax - yMin)) * (H - M.t - M.b);
  const toData = (cx: number, cy: number) => {
    const el = svg.current;
    const ctm = el?.getScreenCTM();
    if (!el || !ctm) return null;
    const p = new DOMPoint(cx, cy).matrixTransform(ctm.inverse());
    const x = Math.max(0, Math.min(xMax, ((p.x - M.l) / (W - M.l - M.r)) * xMax));
    const y = Math.max(yMin, Math.min(yMax, yMin + ((H - M.b - p.y) / (H - M.t - M.b)) * (yMax - yMin)));
    return { x: Math.round(x * 1000) / 1000, y: Math.round(y * 100) / 100 };
  };
  const place = () => {
    if (points.length < 2) return;
    const lo = points.reduce((a, b) => (b.x < a.x ? b : a));
    const hi = points.reduce((a, b) => (b.x > a.x ? b : a));
    onLine({ x1: lo.x, y1: lo.y, x2: hi.x, y2: hi.y });
  };
  const nudge = (end: 1 | 2, dx: number, dy: number) => {
    if (!line) return;
    const k = end === 1 ? (['x1', 'y1'] as const) : (['x2', 'y2'] as const);
    onLine({ ...line, [k[0]]: Math.max(0, Number((line[k[0]] + dx * xMax).toPrecision(3))), [k[1]]: Number((line[k[1]] + dy * (yMax - yMin)).toPrecision(3)) });
  };
  const xt = Array.from({ length: Math.round(xMax / sx) + 1 }, (_, i) => i * sx);
  const yt = Array.from({ length: Math.round((yMax - yMin) / sy) + 1 }, (_, i) => yMin + i * sy);
  const cross = lineXIntercept(line);
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
              {y > 0 ? `+${fmt(y)}` : fmt(y)}
            </text>
          </g>
        ))}
        <line x1={M.l} x2={W - M.r} y1={py(0)} y2={py(0)} className="stroke-foreground/80" strokeWidth="1.2" />
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
            {cross !== null && cross >= 0 && cross <= xMax && (
              <g>
                <line x1={px(cross)} x2={px(cross)} y1={py(0)} y2={H - M.b} className="stroke-brand" strokeDasharray="3 3" strokeWidth="1" />
                <circle cx={px(cross)} cy={py(0)} r={3} className="fill-brand" />
              </g>
            )}
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
                  data-end={end}
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
          <text x={W / 2} y={H / 2 - 12} textAnchor="middle" fontSize="10" className="fill-muted-foreground">
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
            Line through ({fmt(line.x1)}, {fmt(line.y1)}) and ({fmt(line.x2)}, {fmt(line.y2)}){cross !== null ? ' · read where it crosses the 0 % line' : ''}
          </span>
        ) : (
          <span className="text-muted-foreground">{fit ? 'Draw your best straight line, then drag its ends so the points lie evenly on both sides.' : 'Plot at least two points first.'}</span>
        )}
      </div>
    </div>
  );
}
