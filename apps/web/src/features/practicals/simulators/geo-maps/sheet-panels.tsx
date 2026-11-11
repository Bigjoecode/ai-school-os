import { SHEET_H, dist, polyArea, polyLength, type GeoMapsState, type GeoVariant, type P } from '@aischool/shared';
import { Eraser, Undo2 } from 'lucide-react';
import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input, type InputProps } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Geo } from './actions';
import { BaseMap, flipY } from './base-map';

/** The panels that go with the map sheet: the linear scale, the copy grid, the contour sketch, the section graph and the GIS layer list. */

export interface PanelProps {
  g: Geo;
  s: GeoMapsState;
  readOnly: boolean;
}

export function Checks({ g, s, readOnly, ids }: PanelProps & { ids?: string[] }) {
  const list = g.v.def.checks.filter((c) => !ids || ids.includes(c.id));
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Elements of the diagram">
      {list.map((c) => {
        const on = s.checks.includes(c.id);
        return (
          <button key={c.id} type="button" disabled={readOnly} data-check={c.id} aria-pressed={on} onClick={() => g.toggleCheck(c.id)} className={cn('rounded-full border px-2.5 py-1 text-[12px]', on ? 'border-brand bg-brand/10 font-medium' : 'border-border hover:bg-muted/60')}>
            {on ? '✓ ' : ''}
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

const num = (x: unknown) => (x === undefined ? '' : String(x));

/**
 * A number box that keeps what is being typed ("2.", "0.0", "") while passing the number on.
 * Rebuilt from the number on every key, "0.5" could not be typed: the point vanished as soon as it was pressed.
 */
export function NumInput({ value, onValue, onBlur, ...p }: Omit<InputProps, 'value' | 'onChange'> & { value: number | string | undefined; onValue: (n: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const shown = num(value);
  return (
    <Input
      {...p}
      value={text !== null && (Number(text) || 0) === (Number(value) || 0) ? text : shown}
      onChange={(e) => {
        setText(e.target.value);
        onValue(Number(e.target.value) || 0);
      }}
      onBlur={(e) => {
        setText(null);
        onBlur?.(e);
      }}
    />
  );
}
function SetInput({ id, label, g, s, readOnly, unit }: PanelProps & { id: string; label: string; unit?: string }) {
  return (
    <label className="flex items-center justify-between gap-2 text-[13px]">
      {label}
      <span className="flex items-center gap-1">
        <NumInput id={`geo-set-${id}`} value={s.sets[id] as number | undefined} readOnly={readOnly} inputMode="decimal" aria-label={label} onValue={(n) => g.setSets({ [id]: n }, undefined)} className="h-8 w-20 text-right tabular" />
        <span className="w-8 text-[12px] text-muted-foreground">{unit}</span>
      </span>
    </label>
  );
}

// ------------------------------------------------------------------ linear scale

export function ScaleBarPanel(p: PanelProps) {
  const { g, s, readOnly } = p;
  const len = Number(s.sets.bar_len ?? 0);
  const n = Math.max(0, Math.round(Number(s.sets.bar_primary ?? 0)));
  const ground = Number(s.sets.bar_ground ?? 0);
  const sec = Math.max(0, Math.round(Number(s.sets.bar_secondary ?? 0)));
  const junction = s.sets.bar_zero === 'JUNCTION';
  const div = n > 0 ? len / n : 0;
  const scale = 28;
  const W = Math.max(420, (len + 3) * scale);
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <SetInput {...p} id="bar_len" label="Total length" unit="cm" />
        <SetInput {...p} id="bar_primary" label="Primary divisions" />
        <SetInput {...p} id="bar_ground" label="Each primary division shows" unit="km" />
        <SetInput {...p} id="bar_secondary" label="Secondary divisions" />
      </div>
      <div className="flex flex-wrap gap-1.5 text-[12.5px]">
        <span className="self-center">Zero goes</span>
        {[
          ['JUNCTION', 'at the junction'],
          ['LEFT', 'at the far left'],
        ].map(([id, label]) => (
          <Button key={id} size="sm" variant={s.sets.bar_zero === id ? 'brand' : 'outline'} className="h-7" disabled={readOnly} onClick={() => g.setSets({ bar_zero: id! }, 'bar:zero')}>
            {label}
          </Button>
        ))}
        <span className="ml-2 self-center">Unit</span>
        {['km', 'm'].map((u) => (
          <Button key={u} size="sm" variant={s.sets.bar_unit === u ? 'brand' : 'outline'} className="h-7" disabled={readOnly} onClick={() => g.setSets({ bar_unit: u }, 'bar:unit')}>
            {u}
          </Button>
        ))}
        <Button size="sm" variant={s.sets.bar_rf === true ? 'brand' : 'outline'} className="h-7" disabled={readOnly} aria-pressed={s.sets.bar_rf === true} onClick={() => g.setSets({ bar_rf: s.sets.bar_rf !== true }, 'bar:rf')}>
          RF written below
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg bg-white p-2 dark:bg-white">
        <svg width={W} height={96} role="img" aria-label="Your linear scale" className="text-black">
          {n > 0 && len > 0 && (
            <g transform="translate(20 30)">
              <rect width={len * scale} height={10} fill="none" stroke="#111" />
              {Array.from({ length: n + 1 }, (_, i) => (
                <g key={i} transform={`translate(${i * div * scale} 0)`}>
                  <line y1={-4} y2={14} stroke="#111" />
                  {i < n && i % 2 === 0 && <rect width={div * scale} height={10} fill={i === 0 && junction ? 'none' : '#333'} />}
                  <text y={32} fontSize={11} textAnchor="middle" fill="#111">
                    {junction ? (i === 0 ? ground : ((i - 1) * ground).toFixed(ground < 1 ? 1 : 0)) : (i * ground).toFixed(ground < 1 ? 1 : 0)}
                    {i === n ? ` ${s.sets.bar_unit ?? ''}` : ''}
                  </text>
                </g>
              ))}
              {sec > 1 && junction && Array.from({ length: sec - 1 }, (_, i) => <line key={i} x1={((i + 1) / sec) * div * scale} x2={((i + 1) / sec) * div * scale} y1={0} y2={10} stroke="#111" />)}
              {s.sets.bar_rf === true && (
                <text y={52} fontSize={12} fill="#111">
                  RF as worked out
                </text>
              )}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ copy grid

export function CopyPanel(p: PanelProps) {
  const { g, s, readOnly } = p;
  const c = g.v.copy!;
  const f = c.frame;
  const W = f.w * c.k;
  const H = f.h * c.k;
  const sq = 2 * c.k;
  const svg = useRef<SVGSVGElement | null>(null);
  const pts = s.lines.copy ?? [];
  const tap = (e: RPointerEvent<SVGSVGElement>) => {
    if (readOnly) return;
    const m = svg.current!.getScreenCTM()!.inverse();
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    if (q.x < 0 || q.y < 0 || q.x > W || q.y > H) return;
    g.addVertex('copy', [q.x, H - q.y]);
  };
  if (import.meta.env.DEV) Object.assign(window, { __geoCopy: { toClient: (pt: P) => { const r = new DOMPoint(pt[0], H - pt[1]).matrixTransform(svg.current!.getScreenCTM()!); return [r.x, r.y]; } } });
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <figure>
          <figcaption className="mb-1 text-[12px] font-medium">The framed part of the map</figcaption>
          <svg viewBox={`${f.x} ${flipY(f.y + f.h)} ${f.w} ${f.h}`} className="w-full rounded border border-border bg-white" role="img" aria-label="Framed part of the map">
            <BaseMap s={g.v.sheet!} label={false} />
            {Array.from({ length: f.w / 2 + 1 }, (_, i) => <line key={`x${i}`} x1={f.x + i * 2} x2={f.x + i * 2} y1={0} y2={SHEET_H} stroke="#d32f2f" strokeWidth={0.03} />)}
            {Array.from({ length: f.h / 2 + 1 }, (_, i) => <line key={`y${i}`} y1={flipY(f.y + i * 2)} y2={flipY(f.y + i * 2)} x1={0} x2={20} stroke="#d32f2f" strokeWidth={0.03} />)}
          </svg>
        </figure>
        <figure>
          <figcaption className="mb-1 text-[12px] font-medium">Your copy: {W} × {H} cm, squares of {sq} cm</figcaption>
          <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none rounded border border-border bg-white" role="application" aria-label="Your copy" data-geocopy onPointerUp={tap}>
            {Array.from({ length: W / sq + 1 }, (_, i) => <line key={`x${i}`} x1={i * sq} x2={i * sq} y1={0} y2={H} stroke="#d32f2f" strokeWidth={W * 0.0025} />)}
            {Array.from({ length: H / sq + 1 }, (_, i) => <line key={`y${i}`} y1={i * sq} y2={i * sq} x1={0} x2={W} stroke="#d32f2f" strokeWidth={W * 0.0025} />)}
            <path d={pts.map((q, i) => `${i ? 'L' : 'M'}${q[0]} ${H - q[1]}`).join('')} fill="none" stroke="#1976c9" strokeWidth={W * 0.008} />
            {pts.map((q, i) => <circle key={i} cx={q[0]} cy={H - q[1]} r={W * 0.007} fill="#1976c9" />)}
          </svg>
        </figure>
      </div>
      {!readOnly && (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" className="h-7" onClick={() => g.undoVertex('copy')}>
            <Undo2 /> Undo
          </Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => g.clearLine('copy')}>
            <Eraser /> Clear
          </Button>
        </div>
      )}
      <p className="text-[12px] text-muted-foreground">Note where the river crosses each square’s edges on the map, then tap the same places on your copy.</p>
      <Checks {...p} />
    </div>
  );
}

// ------------------------------------------------------------------ contour sketch

const Vee = ({ dir, label }: { dir: string | undefined; label: string }) => {
  // Contour values rise towards the top of the box. V apex up the box: V pointing uphill.
  const up = dir === 'UP';
  return (
    <svg viewBox="0 0 120 120" className="w-full max-w-[220px] rounded border border-border bg-[#fffdf5]" role="img" aria-label={label}>
      {[0, 1, 2].map((i) => {
        const y = 30 + i * 30;
        const apex = dir ? (up ? y - 18 : y + 18) : y;
        return (
          <g key={i}>
            <path d={`M6 ${y} Q40 ${y} 60 ${apex} Q80 ${y} 114 ${y}`} fill="none" stroke="#b0763f" strokeWidth={1.4} />
            <text x={100} y={y - 3} fontSize={8} fill="#94561f">
              {300 - i * 50}
            </text>
          </g>
        );
      })}
      {label.includes('valley') && up && <path d="M60 10 V110" stroke="#1976c9" strokeWidth={1.6} />}
    </svg>
  );
};
export function SketchPanel({ g, s, readOnly }: PanelProps) {
  const row = (id: string, name: string) => (
    <div className="space-y-1.5">
      <p className="text-[13px] font-medium">{name}</p>
      <Vee dir={s.sets[id] as string | undefined} label={`Your sketch of a ${name.toLowerCase()}`} />
      <div className="flex flex-wrap gap-1">
        {[
          ['UP', 'V points uphill'],
          ['DOWN', 'V points downhill'],
        ].map(([v, label]) => (
          <Button key={v} size="sm" variant={s.sets[id] === v ? 'brand' : 'outline'} className="h-7" disabled={readOnly} data-sketch={`${id}:${v}`} onClick={() => g.setSets({ [id]: v! }, `sketch:${id}`)}>
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {row('sk_valley', 'Valley')}
      {row('sk_spur', 'Spur')}
    </div>
  );
}

// ------------------------------------------------------------------ section graph

export function SectionPanel(p: PanelProps) {
  const { g, s, readOnly } = p;
  const [a, b] = g.v.section!;
  const L = dist(a, b);
  const V = Number(s.sets.vscale ?? 0);
  const ticks = s.ticks;
  const hs = ticks.map((t) => t.h);
  const lo = hs.length ? Math.floor(Math.min(...hs) / 50) * 50 - 50 : 0;
  const hi = hs.length ? Math.ceil(Math.max(...hs) / 50) * 50 + 50 : 100;
  const px = 30;
  const X = (d: number) => 44 + d * px;
  const Y = (h: number) => (V > 0 ? 16 + ((hi - h) / V) * px : 16);
  const H = V > 0 ? ((hi - lo) / V) * px + 40 : 120;
  const pts = ticks.map((t) => [X(t.d), Y(t.h)] as [number, number]);
  const smooth = useMemo(() => {
    if (pts.length < 2) return '';
    let d = `M${pts[0]![0]} ${pts[0]![1]}`;
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[Math.max(0, i - 2)]!;
      const p1 = pts[i - 1]!;
      const p2 = pts[i]!;
      const p3 = pts[Math.min(pts.length - 1, i + 1)]!;
      d += `C${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]} ${p2[1]}`;
    }
    return d;
  }, [pts]);
  const ha = ticks[0]?.h ?? 0;
  const hb = ticks[ticks.length - 1]?.h ?? 0;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
        <span>Vertical scale: 1 cm to</span>
        {[10, 20, 25, 40, 50, 100].map((x) => (
          <Button key={x} size="sm" variant={V === x ? 'brand' : 'outline'} className="h-7 px-2" disabled={readOnly} data-vscale={x} onClick={() => g.setSets({ vscale: x }, `vscale:${x}`)}>
            {x} m
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant={s.sets.smooth === true ? 'brand' : 'outline'} className="h-7" disabled={readOnly} data-set="smooth" aria-pressed={s.sets.smooth === true} onClick={() => g.setSets({ smooth: s.sets.smooth !== true }, 'section:smooth')}>
          Join with a smooth curve
        </Button>
        <Button size="sm" variant={s.sets.sight === true ? 'brand' : 'outline'} className="h-7" disabled={readOnly} data-set="sight" aria-pressed={s.sets.sight === true} onClick={() => g.setSets({ sight: s.sets.sight !== true }, 'section:sight')}>
          Rule the line of sight A–B
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        {V > 0 ? (
          <svg width={X(L) + 30} height={H} role="img" aria-label="Your cross profile" className="text-black">
            {Array.from({ length: Math.floor(L * 2) + 1 }, (_, i) => <line key={i} x1={X(i / 2)} x2={X(i / 2)} y1={Y(hi)} y2={Y(lo)} stroke="#cfe3cf" />)}
            {Array.from({ length: Math.floor((hi - lo) / (V / 2)) + 1 }, (_, i) => <line key={i} x1={X(0)} x2={X(L)} y1={Y(lo + (i * V) / 2)} y2={Y(lo + (i * V) / 2)} stroke="#cfe3cf" />)}
            {Array.from({ length: Math.floor((hi - lo) / V) + 1 }, (_, i) => (
              <text key={i} x={X(0) - 4} y={Y(lo + i * V) + 3} fontSize={9} textAnchor="end" fill="#333">
                {lo + i * V}
              </text>
            ))}
            <line x1={X(0)} x2={X(0)} y1={Y(hi)} y2={Y(lo)} stroke="#222" />
            <line x1={X(0)} x2={X(L)} y1={Y(lo)} y2={Y(lo)} stroke="#222" />
            <text x={X(0)} y={Y(lo) + 14} fontSize={11} fontWeight={700} fill="#b71c1c">A</text>
            <text x={X(L)} y={Y(lo) + 14} fontSize={11} fontWeight={700} fill="#b71c1c">B</text>
            {s.sets.smooth === true ? <path d={smooth} fill="none" stroke="#5d4037" strokeWidth={1.6} /> : <path d={pts.map((q, i) => `${i ? 'L' : 'M'}${q[0]} ${q[1]}`).join('')} fill="none" stroke="#999" strokeDasharray="3 3" />}
            {pts.map((q, i) => <circle key={i} cx={q[0]} cy={q[1]} r={2.2} fill="#2e7d32" />)}
            {s.sets.sight === true && pts.length > 1 && <line x1={X(0)} y1={Y(ha)} x2={X(L)} y2={Y(hb)} stroke="#c62828" strokeDasharray="5 3" />}
          </svg>
        ) : (
          <p className="p-4 text-[13px] text-muted-foreground">Choose a vertical scale to rule the graph paper.</p>
        )}
      </div>
      <p className="text-[12px] text-muted-foreground">The base line is {ticks.length ? 'the length of your strip' : 'empty until you mark the strip on the map'}. Each tick is plotted at its contour’s height.</p>
      <Checks {...p} />
    </div>
  );
}

// ------------------------------------------------------------------ GIS

export function GisPanel(p: PanelProps) {
  const { g, s } = p;
  const v: GeoVariant = g.v;
  const sheet = v.sheet!;
  const road = s.lines.road ?? [];
  const forest = s.lines.forest ?? [];
  const lenKm = polyLength(road) * sheet.kmPerCm;
  const areaKm = polyArea(forest) * sheet.kmPerCm ** 2;
  return (
    <div className="space-y-3 text-[13px]">
      <section>
        <h3 className="mb-1 font-semibold">Layers</h3>
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              {['Layer', 'Type', 'Attributes', 'Features'].map((h) => (
                <th key={h} className="border border-border bg-muted/50 px-1.5 py-1 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {v.pinKinds.map((k) => (
              <tr key={k.k}>
                <td className="border border-border px-1.5 py-1">{k.label}</td>
                <td className="border border-border px-1.5 py-1">Vector point</td>
                <td className="border border-border px-1.5 py-1">name: {k.label}</td>
                <td className="border border-border px-1.5 py-1 tabular">{s.pins.filter((x) => x.k === k.k).length}</td>
              </tr>
            ))}
            <tr>
              <td className="border border-border px-1.5 py-1">Road</td>
              <td className="border border-border px-1.5 py-1">Vector line</td>
              <td className="border border-border px-1.5 py-1">class: main</td>
              <td className="border border-border px-1.5 py-1 tabular">{road.length} vertices</td>
            </tr>
            <tr>
              <td className="border border-border px-1.5 py-1">Forest reserve</td>
              <td className="border border-border px-1.5 py-1">Vector polygon</td>
              <td className="border border-border px-1.5 py-1">use: forest</td>
              <td className="border border-border px-1.5 py-1 tabular">{forest.length} vertices</td>
            </tr>
          </tbody>
        </table>
      </section>
      <section className="rounded-lg bg-muted/40 p-2">
        <h3 className="font-semibold">Measuring tool</h3>
        <p data-gis-length={lenKm.toFixed(2)}>Length of line: {road.length > 1 ? `${lenKm.toFixed(2)} km` : 'nothing digitised'}</p>
        <p data-gis-area={areaKm.toFixed(2)}>Area of polygon: {forest.length > 2 ? `${areaKm.toFixed(2)} km²` : 'nothing digitised'}</p>
      </section>
      {v.raster && (
        <p>
          Raster layer: a land-use class of <strong>{v.raster.cells}</strong> cells, each {v.raster.size} m × {v.raster.size} m.
        </p>
      )}
      <section>
        <h3 className="mb-1 font-semibold">Export the map with</h3>
        <Checks {...p} />
      </section>
    </div>
  );
}
