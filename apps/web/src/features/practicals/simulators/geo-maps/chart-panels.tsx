import { axisKey, seriesKey, type GeoChart, type GeoSeriesDef, type P } from '@aischool/shared';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Checks, NumInput, type PanelProps } from './sheet-panels';

/** The statistical diagrams: graph paper, the pie and circles, the outline map, the flow map and chart, and the earth grid. */

const INK = '#222';
const PAPER_LINE = '#cfe3cf';

function AxisInputs({ g, s, c, a, readOnly, label }: PanelProps & { c: GeoChart; a: 'a' | 'b'; label: string }) {
  const set = (end: 'max' | 'min', raw: string) => g.setSets({ [axisKey(c, a, end)]: raw === '' ? -1 : Number(raw) || 0 }, `axis:${c.id}:${a}`);
  const read = (end: 'max' | 'min') => {
    const x = s.sets[axisKey(c, a, end)];
    return x === undefined || x === -1 ? '' : String(x);
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
      <span>{label}: from</span>
      <Input id={`geo-ax-${c.id}-${a}-min`} value={read('min')} readOnly={readOnly} onChange={(e) => set('min', e.target.value)} inputMode="numeric" aria-label={`${label}: bottom of the scale`} className="h-7 w-16 text-right tabular" />
      <span>to</span>
      <Input id={`geo-ax-${c.id}-${a}-max`} value={read('max')} readOnly={readOnly} onChange={(e) => set('max', e.target.value)} inputMode="numeric" aria-label={`${label}: top of the scale`} className="h-7 w-16 text-right tabular" />
    </div>
  );
}

export function ChartBench(p: PanelProps) {
  const { g } = p;
  const [i, setI] = useState(0);
  const c = g.v.charts[Math.min(i, g.v.charts.length - 1)]!;
  return (
    <div className="space-y-2">
      {g.v.charts.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {g.v.charts.map((x, k) => (
            <Button key={x.id} size="sm" variant={k === i ? 'brand' : 'outline'} className="h-7" data-chart={x.id} onClick={() => setI(k)}>
              {x.title}
            </Button>
          ))}
        </div>
      )}
      <OneChart key={c.id} {...p} c={c} />
      <Checks {...p} />
    </div>
  );
}

function OneChart(p: PanelProps & { c: GeoChart }) {
  const { g, s, c, readOnly } = p;
  const [active, setActive] = useState(c.series[0]!.id);
  const ser = c.series.find((x) => x.id === active)!;
  const maxA = Number(s.sets[axisKey(c, 'a', 'max')] ?? 0);
  const minA = Number(s.sets[axisKey(c, 'a', 'min')] ?? 0);
  const maxB = Number(s.sets[axisKey(c, 'b', 'max')] ?? 0);
  const minB = Number(s.sets[axisKey(c, 'b', 'min')] ?? 0);
  const ready = maxA > minA && (!c.axisB || maxB > minB);
  const get = (x: GeoSeriesDef) => s.series[seriesKey(c, x)] ?? [];
  const setVal = (x: GeoSeriesDef, i: number, v: number) => {
    const cur = [...get(x)];
    while (cur.length < c.cats.length) cur.push(0);
    cur[i] = Math.max(0, v);
    g.setSeries(seriesKey(c, x), cur);
  };
  const svg = useRef<SVGSVGElement | null>(null);
  const dragging = useRef(false);
  const W = 640;
  const H = c.horizontal ? 340 : 360;
  const L = c.axisB ? 56 : 56;
  const R = c.axisB ? 52 : 16;
  const T = 16;
  const B = 34;
  const gw = W - L - R;
  const gh = H - T - B;
  const n = c.cats.length;
  const rangeOf = (x: GeoSeriesDef) => (x.axis === 'a' ? [minA, maxA] : [minB, maxB]) as [number, number];

  const fromPointer = (e: RPointerEvent<SVGSVGElement>) => {
    if (readOnly || !ready) return;
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse());
    if (c.horizontal) {
      const row = Math.floor(((q.y - T) / gh) * n);
      if (row < 0 || row >= n) return;
      const mid = L + gw / 2;
      const u = Math.abs(q.x - mid) / (gw / 2);
      const onLeft = q.x < mid;
      const side = c.series.find((x) => (onLeft ? x.mark === 'left' : x.mark === 'right'))!;
      setActive(side.id);
      setVal(side, row, snap(u * maxA, maxA));
      return;
    }
    const col = Math.floor(((q.x - L) / gw) * n);
    if (col < 0 || col >= n) return;
    const [lo, hi] = rangeOf(ser);
    const val = lo + ((T + gh - q.y) / gh) * (hi - lo);
    if (ser.mark === 'stack') {
      const below = c.series.slice(0, c.series.indexOf(ser)).reduce((t, x) => t + (get(x)[col] ?? 0), 0);
      setVal(ser, col, snap(val - below, hi));
    } else setVal(ser, col, snap(val, hi));
  };
  const snap = (x: number, max: number) => {
    const d = max >= 200 ? 5 : max >= 50 ? 1 : 0.5;
    return Math.round(x / d) * d;
  };
  const gridN = 10;
  if (import.meta.env.DEV) Object.assign(window, { [`__geoChart_${c.id}`]: { toClient: (q: [number, number]) => { const r = new DOMPoint(q[0], q[1]).matrixTransform(svg.current!.getScreenCTM()!); return [r.x, r.y]; }, geo: { L, T, gw, gh, n } } });
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium">{c.title}</p>
      <AxisInputs {...p} c={c} a="a" label={c.axisA.label} />
      {c.axisB && <AxisInputs {...p} c={c} a="b" label={c.axisB.label} />}
      {c.series.length > 1 && !c.horizontal && (
        <div className="flex flex-wrap gap-1" role="group" aria-label="What you are drawing">
          {c.series.map((x) => (
            <button key={x.id} type="button" data-series={x.id} aria-pressed={active === x.id} onClick={() => setActive(x.id)} className={cn('flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px]', active === x.id ? 'border-brand bg-brand/10 font-medium' : 'border-border')}>
              <span className="inline-block size-2.5 rounded-sm" style={{ background: x.colour }} aria-hidden /> {x.label}
            </button>
          ))}
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[320px] touch-none select-none text-black"
          role="application"
          aria-label={c.title}
          data-graph={c.id}
          onPointerDown={(e) => {
            dragging.current = true;
            (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
            fromPointer(e);
          }}
          onPointerMove={(e) => dragging.current && fromPointer(e)}
          onPointerUp={() => (dragging.current = false)}
        >
          {Array.from({ length: gridN * 2 + 1 }, (_, i) => (
            <g key={i}>
              <line x1={L} x2={L + gw} y1={T + (i / (gridN * 2)) * gh} y2={T + (i / (gridN * 2)) * gh} stroke={PAPER_LINE} strokeWidth={0.6} />
              <line y1={T} y2={T + gh} x1={L + (i / (gridN * 2)) * gw} x2={L + (i / (gridN * 2)) * gw} stroke={PAPER_LINE} strokeWidth={0.6} />
            </g>
          ))}
          <rect x={L} y={T} width={gw} height={gh} fill="none" stroke={INK} />
          {!ready && (
            <text x={L + gw / 2} y={T + gh / 2} textAnchor="middle" fontSize={14} fill="#666">
              Set the scale first
            </text>
          )}
          {ready && !c.horizontal && (
            <>
              {Array.from({ length: gridN + 1 }, (_, i) => (
                <text key={i} x={L - 5} y={T + gh - (i / gridN) * gh + 4} textAnchor="end" fontSize={10} fill={INK}>
                  {+(minA + (i / gridN) * (maxA - minA)).toFixed(1)}
                </text>
              ))}
              {c.axisB &&
                Array.from({ length: gridN + 1 }, (_, i) => (
                  <text key={i} x={L + gw + 5} y={T + gh - (i / gridN) * gh + 4} fontSize={10} fill="#b71c1c">
                    {+(minB + (i / gridN) * (maxB - minB)).toFixed(1)}
                  </text>
                ))}
              {c.series
                .filter((x) => x.mark === 'bar')
                .map((x) => {
                  const [lo, hi] = rangeOf(x);
                  return get(x).map((v, i) => {
                    const h = ((v - lo) / (hi - lo)) * gh;
                    return <rect key={`${x.id}${i}`} x={L + ((i + 0.15) / n) * gw} y={T + gh - h} width={(0.7 / n) * gw} height={Math.max(0, h)} fill={x.colour} fillOpacity={0.75} />;
                  });
                })}
              {c.series.some((x) => x.mark === 'stack') &&
                c.cats.map((_, i) => {
                  let run = 0;
                  return c.series.map((x) => {
                    const v = get(x)[i] ?? 0;
                    const y0 = ((run - minA) / (maxA - minA)) * gh;
                    run += v;
                    const y1 = ((run - minA) / (maxA - minA)) * gh;
                    return <rect key={`${x.id}${i}`} x={L + ((i + 0.2) / n) * gw} y={T + gh - y1} width={(0.6 / n) * gw} height={Math.max(0, y1 - y0)} fill={x.colour} fillOpacity={0.8} stroke={INK} strokeWidth={0.5} />;
                  });
                })}
              {c.series
                .filter((x) => x.mark === 'line')
                .map((x) => {
                  const [lo, hi] = rangeOf(x);
                  const pts = get(x).map((v, i): [number, number] => [L + ((i + 0.5) / n) * gw, T + gh - ((v - lo) / (hi - lo)) * gh]);
                  return (
                    <g key={x.id}>
                      {pts.length === n && <path d={pts.map((q, i) => `${i ? 'L' : 'M'}${q[0]} ${q[1]}`).join('')} fill="none" stroke={x.colour} strokeWidth={1.8} />}
                      {pts.map((q, i) => (
                        <circle key={i} cx={q[0]} cy={q[1]} r={3.2} fill={x.colour} />
                      ))}
                    </g>
                  );
                })}
              {c.cats.map((cat, i) => (
                <text key={`${cat}${i}`} x={L + ((i + 0.5) / n) * gw} y={T + gh + 16} textAnchor="middle" fontSize={11} fill={INK}>
                  {cat}
                </text>
              ))}
            </>
          )}
          {ready && c.horizontal && (
            <>
              <line x1={L + gw / 2} x2={L + gw / 2} y1={T} y2={T + gh} stroke={INK} />
              {c.cats.map((cat, i) => (
                <text key={cat} x={L - 6} y={T + ((i + 0.55) / n) * gh + 3} textAnchor="end" fontSize={11} fill={INK}>
                  {cat}
                </text>
              ))}
              {[0, 0.5, 1].map((u) => (
                <g key={u}>
                  <text x={L + gw / 2 - (u * gw) / 2} y={T + gh + 15} textAnchor="middle" fontSize={10} fill={INK}>
                    {+(u * maxA).toFixed(1)}
                  </text>
                  <text x={L + gw / 2 + (u * gw) / 2} y={T + gh + 15} textAnchor="middle" fontSize={10} fill={INK}>
                    {+(u * maxA).toFixed(1)}
                  </text>
                </g>
              ))}
              {c.series.map((x) =>
                get(x).map((v, i) => {
                  const w = (v / maxA) * (gw / 2);
                  return <rect key={`${x.id}${i}`} x={x.mark === 'left' ? L + gw / 2 - w : L + gw / 2} y={T + ((i + 0.12) / n) * gh} width={Math.max(0, w)} height={(0.76 / n) * gh} fill={x.colour} fillOpacity={0.8} />;
                }),
              )}
              <text x={L + gw / 4} y={T + 12} textAnchor="middle" fontSize={11} fontWeight={600} fill="#1565c0">
                Males
              </text>
              <text x={L + (3 * gw) / 4} y={T + 12} textAnchor="middle" fontSize={11} fontWeight={600} fill="#ad1457">
                Females
              </text>
            </>
          )}
        </svg>
      </div>
      <details className="rounded-lg border border-border p-2 text-[12.5px]" open={false}>
        <summary className="cursor-pointer font-medium">Plot by typing the values</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="border-collapse text-[12px]">
            <thead>
              <tr>
                <th className="px-1 text-left font-medium" />
                {c.cats.map((cat, i) => (
                  <th key={`${cat}${i}`} className="px-1 font-medium">
                    {cat}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.series.map((x) => (
                <tr key={x.id}>
                  <td className="whitespace-nowrap pr-2">{x.label}</td>
                  {c.cats.map((_, i) => (
                    <td key={i} className="p-0.5">
                      <NumInput id={`geo-plot-${c.id}-${x.id}-${i}`} className="h-7 w-14 rounded border border-input bg-card px-1 py-0 text-right text-base tabular shadow-none sm:text-[12px]" readOnly={readOnly} inputMode="decimal" aria-label={`${x.label} ${c.cats[i]}`} value={get(x)[i]} onValue={(n) => setVal(x, i, n)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

// ------------------------------------------------------------------ pie and circles

export function PiePanel(p: PanelProps) {
  const { g, s, readOnly } = p;
  const pie = g.v.pie!;
  const order = s.seq.pie?.length ? s.seq.pie : pie.items.map((x) => x.id).sort((a, b) => a.localeCompare(b)).reverse();
  const items = order.map((id) => pie.items.find((x) => x.id === id)!);
  const angles = useMemo(() => (s.series.pie?.length === items.length ? s.series.pie : items.map(() => 0)), [s.series.pie, items]);
  const setAngles = (next: number[], ord = order) => {
    g.setSeq('pie', ord);
    g.setSeries('pie', next);
  };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const o = [...order];
    [o[i], o[j]] = [o[j]!, o[i]!];
    const a = [...angles];
    [a[i], a[j]] = [a[j]!, a[i]!];
    setAngles(a, o);
  };
  const R = 110;
  const cx = 130;
  const cy = 130;
  const svg = useRef<SVGSVGElement | null>(null);
  const grab = useRef<number | null>(null);
  const hues = ['#00695c', '#c9a227', '#6d4c41', '#1565c0'];
  const pointAt = (a: number): [number, number] => [cx + Math.sin((a * Math.PI) / 180) * R, cy - Math.cos((a * Math.PI) / 180) * R];
  let run = 0;
  const sectors = items.map((it, i) => {
    const start = run;
    run += angles[i] ?? 0;
    return { it, start, end: run, i };
  });
  const drag = (e: RPointerEvent<SVGSVGElement>) => {
    if (grab.current === null || readOnly) return;
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse());
    const a = ((Math.atan2(q.x - cx, cy - q.y) * 180) / Math.PI + 360) % 360;
    const k = grab.current;
    const before = angles.slice(0, k).reduce((t, x) => t + x, 0);
    const next = [...angles];
    const after = next[k + 1] ?? 0;
    const was = next[k] ?? 0;
    const size = Math.round(Math.max(0, a - before));
    if (k + 1 < next.length) next[k + 1] = Math.max(0, after + was - size);
    next[k] = size;
    setAngles(next);
  };
  const rA = Number(s.sets.r_a ?? 0);
  const rB = Number(s.sets.r_b ?? 0);
  const scale = 34;
  const total = angles.reduce((t, x) => t + x, 0);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[280px_1fr]">
        <svg
          ref={svg}
          viewBox="0 0 260 260"
          className="w-full max-w-[280px] touch-none rounded-lg border border-border bg-white"
          role="application"
          aria-label="Your pie chart"
          data-pie
          onPointerDown={(e) => {
            const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse());
            const hit = sectors.findIndex((x) => Math.hypot(...(pointAt(x.end).map((v, i) => v - (i ? q.y : q.x)) as [number, number])) < 16);
            if (hit >= 0) {
              grab.current = hit;
              (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
            }
          }}
          onPointerMove={drag}
          onPointerUp={() => (grab.current = null)}
        >
          <circle cx={cx} cy={cy} r={R} fill="#fafafa" stroke={INK} />
          {sectors.map((x) => {
            if (x.end - x.start <= 0) return null;
            const [ax, ay] = pointAt(x.start);
            const [bx, by] = pointAt(x.end);
            return <path key={x.i} d={`M${cx} ${cy}L${ax} ${ay}A${R} ${R} 0 ${x.end - x.start > 180 ? 1 : 0} 1 ${bx} ${by}Z`} fill={hues[x.i % 4]} fillOpacity={0.72} stroke={INK} />;
          })}
          <line x1={cx} y1={cy} x2={cx} y2={cy - R - 8} stroke={INK} strokeWidth={1.4} />
          {sectors.map((x) => {
            const [hx, hy] = pointAt(x.end);
            return <circle key={x.i} cx={hx} cy={hy} r={6} fill="#fff" stroke={INK} />;
          })}
          {Array.from({ length: 36 }, (_, i) => {
            const a = i * 10;
            const [ox, oy] = pointAt(a);
            return <line key={a} x1={ox} y1={oy} x2={cx + (ox - cx) * 1.05} y2={cy + (oy - cy) * 1.05} stroke="#777" />;
          })}
        </svg>
        <div className="space-y-1">
          <p className="text-[12.5px] font-medium">Sectors, clockwise from 12 o’clock ({total}° so far)</p>
          {items.map((it, i) => (
            <div key={it.id} className="flex items-center gap-1 text-[13px]">
              <span className="inline-block size-3 rounded-sm" style={{ background: hues[i % 4] }} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{it.label}</span>
              <NumInput id={`geo-pie-${i}`} className="h-7 w-16 text-right tabular" inputMode="decimal" aria-label={`Angle of ${it.label}`} readOnly={readOnly} value={angles[i] || undefined} onValue={(n) => setAngles(angles.map((a, k) => (k === i ? n : a)))} />
              <span>°</span>
              {!readOnly && (
                <>
                  <Button size="icon" variant="ghost" className="size-7" aria-label={`Move ${it.label} up`} data-up={it.id} onClick={() => move(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-7" aria-label={`Move ${it.label} down`} data-down={it.id} onClick={() => move(i, 1)}>
                    <ArrowDown />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-border p-2">
        <p className="mb-1 text-[13px] font-medium">Proportional circles (radius set on the compasses)</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ['r_a', pie.placeA.name],
              ['r_b', pie.placeB.name],
            ] as const
          ).map(([id, name]) => (
            <label key={id} className="flex items-center justify-between gap-2 text-[13px]">
              {name}
              <span className="flex items-center gap-1">
                <NumInput id={`geo-set-${id}`} className="h-8 w-20 text-right tabular" inputMode="decimal" aria-label={`Radius of ${name}`} readOnly={readOnly} value={s.sets[id] as number | undefined} onValue={(n) => g.setSets({ [id]: n })} /> cm
              </span>
            </label>
          ))}
        </div>
        <div className="mt-2 overflow-x-auto rounded bg-white">
          <svg width={Math.max(300, (rA + rB) * 2 * scale + 60)} height={Math.max(90, Math.max(rA, rB) * 2 * scale + 26)} role="img" aria-label="Proportional circles" className="text-black">
            <circle cx={rA * scale + 16} cy={Math.max(rA, rB) * scale + 10} r={rA * scale} fill="#1565c0" fillOpacity={0.3} stroke={INK} />
            <circle cx={rA * 2 * scale + rB * scale + 40} cy={Math.max(rA, rB) * scale + 10} r={rB * scale} fill="#1565c0" fillOpacity={0.3} stroke={INK} />
          </svg>
        </div>
      </div>
      <Checks {...p} />
    </div>
  );
}

// ------------------------------------------------------------------ outline map

const SHADES = ['#fdf0d5', '#f5c47a', '#d9772b', '#7a2e0e'];
const svgPath = (pts: readonly P[]) => pts.map((q, i) => `${i ? 'L' : 'M'}${q[0]} ${16 - q[1]}`).join('') + 'Z';
export function OutlinePanel(p: PanelProps) {
  const { g, s, readOnly } = p;
  const o = g.v.outline!;
  const [mode, setMode] = useState<string>(`dot:${o.dotRegions[0]}`);
  const [cls, setCls] = useState(0);
  const svg = useRef<SVGSVGElement | null>(null);
  const tap = (e: RPointerEvent<SVGSVGElement>) => {
    if (readOnly) return;
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse());
    const pt: P = [q.x, 16 - q.y];
    if (mode.startsWith('dot:') || mode === 'iso') {
      const near = s.pins.findIndex((x) => x.k === mode && Math.hypot(x.p[0] - pt[0], x.p[1] - pt[1]) < 0.22);
      if (near >= 0) g.removePin(near);
      else g.addPin(mode, pt);
      return;
    }
    const hit = (e.target as Element).getAttribute('data-region');
    if (hit) g.setSets({ [`shade:${hit}`]: cls }, `shade:${hit}`);
  };
  if (import.meta.env.DEV) Object.assign(window, { __geoOutline: { toClient: (q: P) => { const r = new DOMPoint(q[0], 16 - q[1]).matrixTransform(svg.current!.getScreenCTM()!); return [r.x, r.y]; } } });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1 text-[12px]" role="toolbar" aria-label="Outline map tools">
        {o.dotRegions.map((id) => {
          const r = o.regions.find((x) => x.id === id)!;
          const k = `dot:${id}`;
          return (
            <Button key={id} size="sm" variant={mode === k ? 'brand' : 'outline'} className="h-7" data-mode={k} onClick={() => setMode(k)}>
              Dots: {r.name} ({s.pins.filter((x) => x.k === k).length})
            </Button>
          );
        })}
        <Button size="sm" variant={mode === 'shade' ? 'brand' : 'outline'} className="h-7" data-mode="shade" onClick={() => setMode('shade')}>
          Shade
        </Button>
        <Button size="sm" variant={mode === 'iso' ? 'brand' : 'outline'} className="h-7" data-mode="iso" onClick={() => setMode('iso')}>
          Isohyet
        </Button>
      </div>
      {mode === 'shade' && (
        <div className="flex flex-wrap gap-1">
          {o.classes.map((c, i) => (
            <button key={c.label} type="button" data-class={i} aria-pressed={cls === i} onClick={() => setCls(i)} className={cn('flex items-center gap-1 rounded border px-2 py-0.5 text-[12px]', cls === i ? 'border-brand ring-1 ring-brand' : 'border-border')}>
              <span className="inline-block size-3 rounded-sm border border-black/20" style={{ background: SHADES[i] }} aria-hidden /> {c.label}
            </button>
          ))}
        </div>
      )}
      <div className="rounded-lg border border-border bg-white">
        <svg ref={svg} viewBox="0 0 20 16" className="w-full touch-none text-black" role="application" aria-label="Outline map" data-outline onPointerUp={tap}>
          <defs>
            <pattern id="geo-hatch" width={0.4} height={0.4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1={0} y1={0} x2={0} y2={0.4} stroke="#5b7a8c" strokeWidth={0.05} />
            </pattern>
          </defs>
          {o.regions.map((r) => {
            const sh = s.sets[`shade:${r.id}`];
            return <path key={r.id} d={svgPath(r.poly)} data-region={r.id} fill={typeof sh === 'number' ? SHADES[sh] : '#fbfbf6'} stroke={INK} strokeWidth={0.05} />;
          })}
          {o.regions.map((r) => (
            <path key={r.id} d={svgPath(r.empty)} fill="url(#geo-hatch)" stroke="#5b7a8c" strokeWidth={0.02} pointerEvents="none" />
          ))}
          {o.regions.map((r) => {
            const cx = r.poly.reduce((t, q) => t + q[0], 0) / r.poly.length;
            const cy = r.poly.reduce((t, q) => t + q[1], 0) / r.poly.length;
            return (
              <text key={r.id} x={cx} y={16 - cy - 2.3} fontSize={0.42} fontWeight={600} textAnchor="middle" pointerEvents="none" fontFamily="sans-serif" stroke="#fff" strokeWidth={0.06} paintOrder="stroke">
                {r.name}
              </text>
            );
          })}
          {s.pins
            .filter((x) => x.k.startsWith('dot:'))
            .map((x, i) => (
              <circle key={i} cx={x.p[0]} cy={16 - x.p[1]} r={0.13} fill="#111" pointerEvents="none" />
            ))}
          {s.pins
            .filter((x) => x.k === 'iso')
            .map((x, i) => (
              <path key={i} d={`M${x.p[0] - 0.18} ${16 - x.p[1]}h.36M${x.p[0]} ${16 - x.p[1] - 0.18}v.36`} stroke="#c62828" strokeWidth={0.06} pointerEvents="none" />
            ))}
          {o.stations.map((st, i) => (
            <g key={st.id} pointerEvents="none">
              <rect x={st.p[0] - 0.1} y={16 - st.p[1] - 0.1} width={0.2} height={0.2} fill="#1565c0" />
              <text x={st.p[0] + 0.2} y={16 - st.p[1] + 0.12} fontSize={0.34} fill="#0d47a1" stroke="#fff" strokeWidth={0.05} paintOrder="stroke" fontFamily="sans-serif">
                {String.fromCharCode(65 + i)} {st.v} mm
              </text>
            </g>
          ))}
        </svg>
      </div>
      <p className="text-[12px] text-muted-foreground">
        1 dot = {o.dotValue.toLocaleString('en-GB')} people. The hatched areas are uninhabited. Tap a dot to remove it. The isohyet crosses between A–B, B–C and C–D.
      </p>
      <Checks {...p} />
    </div>
  );
}

// ------------------------------------------------------------------ flow map and chart

export function FlowPanel(p: PanelProps) {
  const { g, s, readOnly } = p;
  const f = g.v.flow!;
  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-border bg-white">
        <svg viewBox="0 0 20 16" className="w-full text-black" role="img" aria-label="Your flow map" data-flow>
          {f.routes.map((r) => {
            const w = Number(s.sets[`width:${r.id}`] ?? 0) * 0.1;
            const d = r.pts.map((q, i) => `${i ? 'L' : 'M'}${q[0]} ${16 - q[1]}`).join('');
            const arrow = s.sets[`arrow:${r.id}`];
            const m = r.pts[Math.floor(r.pts.length / 2)]!;
            const n = r.pts[Math.floor(r.pts.length / 2) + 1] ?? m;
            const ang = (Math.atan2(-(n[1] - m[1]), n[0] - m[0]) * 180) / Math.PI + (arrow === 'OUT' ? 180 : 0);
            return (
              <g key={r.id}>
                <path d={d} fill="none" stroke="#ddd" strokeWidth={0.05} />
                {w > 0 && <path d={d} fill="none" stroke="#00695c" strokeOpacity={0.75} strokeWidth={w} />}
                {arrow && (
                  <g transform={`translate(${m[0]} ${16 - m[1]}) rotate(${ang})`}>
                    <path d="M-.35 -.3L.35 0L-.35 .3Z" fill="#c62828" />
                  </g>
                )}
                <circle cx={r.pts[0]![0]} cy={16 - r.pts[0]![1]} r={0.14} fill="#111" />
                <text x={r.pts[0]![0]} y={16 - r.pts[0]![1] - 0.3} fontSize={0.42} textAnchor="middle" fontFamily="sans-serif">
                  {r.name}
                </text>
              </g>
            );
          })}
          <circle cx={f.hub[0]} cy={16 - f.hub[1]} r={0.26} fill="#111" />
          <text x={f.hub[0]} y={16 - f.hub[1] + 0.8} fontSize={0.5} fontWeight={700} textAnchor="middle" fontFamily="sans-serif" stroke="#fff" strokeWidth={0.06} paintOrder="stroke">
            {f.hubName}
          </text>
        </svg>
      </div>
      <div className="space-y-1">
        {f.routes.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-1.5 text-[13px]">
            <span className="min-w-24 flex-1 truncate">{r.name}</span>
            <NumInput id={`geo-w-${r.id}`} className="h-7 w-16 text-right tabular" inputMode="decimal" aria-label={`Width of the ${r.name} line`} readOnly={readOnly} value={s.sets[`width:${r.id}`] as number | undefined} onValue={(n) => g.setSets({ [`width:${r.id}`]: n })} />
            <span className="text-[12px] text-muted-foreground">mm</span>
            {(['IN', 'OUT'] as const).map((d) => (
              <Button key={d} size="sm" variant={s.sets[`arrow:${r.id}`] === d ? 'brand' : 'outline'} className="h-7 px-2" disabled={readOnly} data-arrow={`${r.id}:${d}`} onClick={() => g.setSets({ [`arrow:${r.id}`]: d }, `arrow:${r.id}`)}>
                {d === 'IN' ? `Into ${f.hubName}` : `Out of ${f.hubName}`}
              </Button>
            ))}
          </div>
        ))}
      </div>
      <Checks {...p} />
    </div>
  );
}

export function FlowChartPanel({ g, s, readOnly }: PanelProps) {
  const f = g.v.flow!;
  const order = s.seq.process?.length ? s.seq.process : f.process.shuffled;
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const o = [...order];
    [o[i], o[j]] = [o[j]!, o[i]!];
    g.setSeq('process', o);
  };
  return (
    <div className="mx-auto max-w-sm space-y-1">
      <p className="text-[13px] font-medium">{f.process.title}</p>
      {order.map((x, i) => (
        <div key={x}>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-[13px]">
            <span className="min-w-0 flex-1">{x}</span>
            {!readOnly && (
              <>
                <Button size="icon" variant="ghost" className="size-7" aria-label={`Move ${x} up`} data-fc-up={i} onClick={() => move(i, -1)}>
                  <ArrowUp />
                </Button>
                <Button size="icon" variant="ghost" className="size-7" aria-label={`Move ${x} down`} data-fc-down={i} onClick={() => move(i, 1)}>
                  <ArrowDown />
                </Button>
              </>
            )}
          </div>
          {i < order.length - 1 && <div className="text-center text-muted-foreground" aria-hidden>↓</div>}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ the earth grid

const LON0 = -60;
const LON1 = 90;
const LAT0 = -45;
const LAT1 = 60;
export function GlobePanel(p: PanelProps) {
  const { g, s, readOnly } = p;
  const places = g.v.globe!.places;
  const [pick, setPick] = useState(places[0]!.id);
  const svg = useRef<SVGSVGElement | null>(null);
  const W = 300;
  const H = (W * (LAT1 - LAT0)) / (LON1 - LON0);
  const X = (lon: number) => ((lon - LON0) / (LON1 - LON0)) * W;
  const Y = (lat: number) => ((LAT1 - lat) / (LAT1 - LAT0)) * H;
  const tap = (e: RPointerEvent<SVGSVGElement>) => {
    if (readOnly) return;
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse());
    const lon = LON0 + (q.x / W) * (LON1 - LON0);
    const lat = LAT1 - (q.y / H) * (LAT1 - LAT0);
    const k = `place:${pick}`;
    g.update((st) => ({ ...st, pins: [...st.pins.filter((x) => x.k !== k), { k, p: [Math.round(lon * 2) / 2, Math.round(lat * 2) / 2] }] }), `pin:${k}`);
  };
  if (import.meta.env.DEV) Object.assign(window, { __geoGlobe: { toClient: (q: P) => { const r = new DOMPoint(X(q[0]), Y(q[1])).matrixTransform(svg.current!.getScreenCTM()!); return [r.x, r.y]; } } });
  const lons: number[] = [];
  for (let l = LON0; l <= LON1; l += 15) lons.push(l);
  const lats: number[] = [];
  for (let l = LAT0; l <= LAT1; l += 15) lats.push(l);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {places.map((x) => (
          <Button key={x.id} size="sm" variant={pick === x.id ? 'brand' : 'outline'} className="h-7" data-place={x.id} onClick={() => setPick(x.id)}>
            {x.name} {s.pins.some((q) => q.k === `place:${x.id}`) ? '✓' : ''}
          </Button>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-[#eaf4fb]">
        <svg ref={svg} viewBox={`-14 -8 ${W + 20} ${H + 20}`} className="w-full touch-none text-black" role="application" aria-label="Earth grid" data-globe onPointerUp={tap}>
          {lons.map((l) => (
            <g key={l}>
              <line x1={X(l)} x2={X(l)} y1={0} y2={H} stroke={l === 0 ? '#c62828' : '#90a4ae'} strokeWidth={l === 0 ? 0.9 : 0.35} />
              <text x={X(l)} y={H + 7} fontSize={5} textAnchor="middle" fill="#37474f">
                {Math.abs(l)}°{l === 0 ? '' : l > 0 ? 'E' : 'W'}
              </text>
            </g>
          ))}
          {lats.map((l) => (
            <g key={l}>
              <line x1={0} x2={W} y1={Y(l)} y2={Y(l)} stroke={l === 0 ? '#c62828' : '#90a4ae'} strokeWidth={l === 0 ? 0.9 : 0.35} />
              <text x={-2} y={Y(l) + 2} fontSize={5} textAnchor="end" fill="#37474f">
                {Math.abs(l)}°{l === 0 ? '' : l > 0 ? 'N' : 'S'}
              </text>
            </g>
          ))}
          {s.checks.includes('equator') && (
            <text x={W - 2} y={Y(0) - 2} fontSize={6} textAnchor="end" fill="#b71c1c">
              Equator
            </text>
          )}
          {s.checks.includes('greenwich') && (
            <text x={X(0) + 2} y={8} fontSize={6} fill="#b71c1c">
              Greenwich meridian
            </text>
          )}
          {s.checks.includes('arrow') && (
            <g>
              <path d={`M${X(-45)} ${H - 8}H${X(-10)}m-5 -3l5 3l-5 3`} fill="none" stroke="#1b5e20" strokeWidth={1} />
              <text x={X(-45)} y={H - 12} fontSize={5.5} fill="#1b5e20">
                The earth turns west to east
              </text>
            </g>
          )}
          {s.pins
            .filter((x) => x.k.startsWith('place:'))
            .map((x) => {
              const pl = places.find((q) => `place:${q.id}` === x.k);
              return (
                <g key={x.k} pointerEvents="none">
                  <circle cx={X(x.p[0])} cy={Y(x.p[1])} r={2.2} fill="#c62828" />
                  <text x={X(x.p[0]) + 3} y={Y(x.p[1]) - 2} fontSize={6} fontWeight={600} stroke="#fff" strokeWidth={0.8} paintOrder="stroke">
                    {pl?.name}
                  </text>
                </g>
              );
            })}
        </svg>
      </div>
      <Checks {...p} />
    </div>
  );
}
