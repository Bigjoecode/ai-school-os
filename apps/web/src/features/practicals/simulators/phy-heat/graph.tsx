import type { PhyGraphLine } from '@aischool/shared';
import { Minus, Spline, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The cooling curve: the student's own points (θ against t from the table) on
 * a grid whose temperature axis starts just below the lowest reading, a smooth
 * curve through them when they draw it (not straight lines point to point),
 * and a plateau line they place and drag: by its ends (each end left/right and
 * up/down) or by its middle (up and down, staying level). Arrow keys move a
 * focused end.
 */

type XY = { x: number; y: number };
const W = 340;
const H = 250;
const M = { l: 44, r: 12, t: 12, b: 36 };
function niceStep(span: number, ticks = 6): number {
  const raw = span / ticks;
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
const fmt = (x: number) => Number(x.toPrecision(4)).toString();

/** A monotone cubic (Fritsch–Carlson) through points sorted by x: an SVG path in screen space. */
export function smoothPath(pts: [number, number][]): string {
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
        const tt = 3 / Math.sqrt(s);
        m[i] = tt * a * d[i]!;
        m[i + 1] = tt * b * d[i]!;
      }
    }
  }
  let path = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[i + 1]!;
    const h = (x1 - x0) / 3;
    path += ` C${x0 + h},${y0 + m[i]! * h} ${x1 - h},${y1 - m[i + 1]! * h} ${x1},${y1}`;
  }
  return path;
}

export function CoolingGraph({ points, curve, onCurve, line, onLine, readOnly, xLabel = 't / s', yLabel = 'θ / °C' }: { points: XY[]; curve: boolean; onCurve: (c: boolean) => void; line: PhyGraphLine | null; onLine: (l: PhyGraphLine | null) => void; readOnly: boolean; xLabel?: string; yLabel?: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ end: 1 | 2 | 0; y0: number; l: PhyGraphLine } | null>(null);
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const ys = [...points.map((p) => p.y), ...(line ? [line.y1, line.y2] : [])];
  const lo = ys.length ? Math.min(...ys) : 60;
  const hi = ys.length ? Math.max(...ys) : 95;
  const sy = niceStep(Math.max(4, hi - lo + 4));
  const yMin = Math.floor((lo - 1) / sy) * sy;
  const yMax = Math.ceil((hi + 1) / sy) * sy;
  const maxX = Math.max(...points.map((p) => p.x), line ? Math.max(line.x1, line.x2) : 0, 1e-9);
  const sx = niceStep(maxX * 1.05);
  const xMax = Math.max(sx, Math.ceil((maxX * 1.05) / sx) * sx);
  const px = (x: number) => M.l + (x / xMax) * (W - M.l - M.r);
  const py = (y: number) => H - M.b - ((y - yMin) / (yMax - yMin)) * (H - M.t - M.b);
  const toData = (cx: number, cy: number) => {
    const el = svg.current;
    const ctm = el?.getScreenCTM();
    if (!el || !ctm) return null;
    const p = new DOMPoint(cx, cy).matrixTransform(ctm.inverse());
    const x = Math.max(0, Math.min(xMax, ((p.x - M.l) / (W - M.l - M.r)) * xMax));
    const y = Math.max(yMin, Math.min(yMax, yMin + ((H - M.b - p.y) / (H - M.t - M.b)) * (yMax - yMin)));
    return { x: Number(x.toPrecision(4)), y: Math.round(y * 10) / 10 };
  };
  const place = () => {
    if (points.length < 3) return;
    const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
    onLine({ x1: Number((xMax * 0.3).toPrecision(3)), y1: Math.round(mid * 10) / 10, x2: Number((xMax * 0.6).toPrecision(3)), y2: Math.round(mid * 10) / 10 });
  };
  const nudge = (end: 1 | 2, dx: number, dy: number) => {
    if (!line) return;
    const k = end === 1 ? { x: 'x1', y: 'y1' } : { x: 'x2', y: 'y2' };
    onLine({ ...line, [k.x]: Math.max(0, Number((line[k.x as 'x1'] + dx * xMax).toPrecision(4))), [k.y]: Math.round((line[k.y as 'y1'] + dy) * 10) / 10 });
  };
  const xt = Array.from({ length: Math.round(xMax / sx) + 1 }, (_, i) => i * sx);
  const yt = Array.from({ length: Math.round((yMax - yMin) / sy) + 1 }, (_, i) => yMin + i * sy);
  return (
    <div>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none rounded-xl border border-border bg-card"
        role="img"
        aria-label={`Graph of ${yLabel} against ${xLabel}: ${points.length} points${curve ? ', with a smooth curve' : ''}${line ? ', with your plateau line' : ''}`}
        onPointerMove={(e) => {
          if (!drag || readOnly) return;
          const d = toData(e.clientX, e.clientY);
          if (!d) return;
          if (drag.end === 1) onLine({ ...drag.l, x1: d.x, y1: d.y });
          else if (drag.end === 2) onLine({ ...drag.l, x2: d.x, y2: d.y });
          else {
            const dy = Math.round((d.y - drag.y0) * 10) / 10;
            onLine({ ...drag.l, y1: Math.round((drag.l.y1 + dy) * 10) / 10, y2: Math.round((drag.l.y2 + dy) * 10) / 10 });
          }
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
        {curve && sorted.length > 1 && <path d={smoothPath(sorted.map((p) => [px(p.x), py(p.y)]))} fill="none" className="stroke-brand" strokeWidth="1.4" />}
        {points.map((p, i) => (
          <g key={i} className="stroke-foreground" strokeWidth="1.2">
            <line x1={px(p.x) - 3.5} x2={px(p.x) + 3.5} y1={py(p.y) - 3.5} y2={py(p.y) + 3.5} />
            <line x1={px(p.x) - 3.5} x2={px(p.x) + 3.5} y1={py(p.y) + 3.5} y2={py(p.y) - 3.5} />
          </g>
        ))}
        {line && (
          <g>
            <line
              x1={px(line.x1)}
              y1={py(line.y1)}
              x2={px(line.x2)}
              y2={py(line.y2)}
              className={cn('stroke-warning', !readOnly && 'cursor-ns-resize')}
              strokeWidth={readOnly ? 1.6 : 4}
              strokeDasharray="5 3"
              onPointerDown={(e) => {
                if (readOnly) return;
                const d = toData(e.clientX, e.clientY);
                if (!d) return;
                (e.currentTarget.ownerSVGElement ?? e.currentTarget).setPointerCapture?.(e.pointerId);
                setDrag({ end: 0, y0: d.y, l: line });
              }}
            />
            {([1, 2] as const).map((end) => {
              const x = end === 1 ? line.x1 : line.x2;
              const y = end === 1 ? line.y1 : line.y2;
              return (
                <circle
                  key={end}
                  cx={px(x)}
                  cy={py(y)}
                  r={readOnly ? 3 : 8}
                  className={cn(readOnly ? 'fill-warning' : 'cursor-grab fill-warning/25 stroke-warning')}
                  strokeWidth="1.2"
                  tabIndex={readOnly ? -1 : 0}
                  role={readOnly ? undefined : 'slider'}
                  aria-label={`End ${end} of your plateau line at (${fmt(x)}, ${fmt(y)}); arrow keys move it`}
                  aria-valuenow={x}
                  onPointerDown={(e) => {
                    if (readOnly) return;
                    e.stopPropagation();
                    (e.currentTarget.ownerSVGElement ?? e.currentTarget).setPointerCapture?.(e.pointerId);
                    setDrag({ end, y0: y, l: line });
                  }}
                  onKeyDown={(e) => {
                    if (readOnly) return;
                    const step = e.shiftKey ? 0.05 : 0.01;
                    const m: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, 0.1], ArrowDown: [0, -0.1] };
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
            <Button size="sm" variant={curve ? 'brand' : 'outline'} onClick={() => onCurve(!curve)} disabled={points.length < 3} aria-pressed={curve}>
              <Spline /> {curve ? 'Smooth curve drawn' : 'Draw a smooth curve'}
            </Button>
            <Button size="sm" variant="outline" onClick={place} disabled={points.length < 3}>
              <Minus /> {line ? 'Re-place the plateau line' : 'Mark the plateau'}
            </Button>
            {line && (
              <>
                <Button size="sm" variant="ghost" onClick={() => onLine({ ...line, y2: line.y1 })}>
                  Make it level
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onLine(null)} aria-label="Remove the plateau line">
                  <Trash2 />
                </Button>
              </>
            )}
          </>
        )}
        {line ? (
          <span className="tabular text-muted-foreground">
            Plateau line from ({fmt(line.x1)}, {fmt(line.y1)}) to ({fmt(line.x2)}, {fmt(line.y2)})
          </span>
        ) : (
          <span className="text-muted-foreground">Draw the curve, then drag the plateau line onto the flat part.</span>
        )}
      </div>
      {!readOnly && line && (
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[12px]">
          <span className="self-center text-muted-foreground">Move the line:</span>
          <Button size="sm" variant="outline" onClick={() => onLine({ ...line, y1: Math.round((line.y1 + 0.1) * 10) / 10, y2: Math.round((line.y2 + 0.1) * 10) / 10 })} aria-label="Raise the line 0.1 °C">
            ↑ 0.1
          </Button>
          <Button size="sm" variant="outline" onClick={() => onLine({ ...line, y1: Math.round((line.y1 - 0.1) * 10) / 10, y2: Math.round((line.y2 - 0.1) * 10) / 10 })} aria-label="Lower the line 0.1 °C">
            ↓ 0.1
          </Button>
          <Button size="sm" variant="outline" onClick={() => onLine({ ...line, y1: Math.round((line.y1 + 1) * 10) / 10, y2: Math.round((line.y2 + 1) * 10) / 10 })} aria-label="Raise the line 1 °C">
            ↑ 1
          </Button>
          <Button size="sm" variant="outline" onClick={() => onLine({ ...line, y1: Math.round((line.y1 - 1) * 10) / 10, y2: Math.round((line.y2 - 1) * 10) / 10 })} aria-label="Lower the line 1 °C">
            ↓ 1
          </Button>
          <Button size="sm" variant="outline" onClick={() => onLine({ ...line, x1: Math.max(0, Number((line.x1 - xMax * 0.02).toPrecision(4))) })} aria-label="Start the line earlier">
            ◀ start
          </Button>
          <Button size="sm" variant="outline" onClick={() => onLine({ ...line, x1: Number((line.x1 + xMax * 0.02).toPrecision(4)) })} aria-label="Start the line later">
            start ▶
          </Button>
          <Button size="sm" variant="outline" onClick={() => onLine({ ...line, x2: Math.max(0, Number((line.x2 - xMax * 0.02).toPrecision(4))) })} aria-label="End the line earlier">
            ◀ end
          </Button>
          <Button size="sm" variant="outline" onClick={() => onLine({ ...line, x2: Number((line.x2 + xMax * 0.02).toPrecision(4)) })} aria-label="End the line later">
            end ▶
          </Button>
        </div>
      )}
    </div>
  );
}
