import {
  CAP_ASSUME,
  CAP_ASSUME_LABEL,
  CAP_ERRORS,
  CAP_ERROR_LABEL,
  CAP_FORMULAS,
  CAP_FORMULA_LABEL,
  FAC_CLAIMS,
  FAC_CLAIM_LABEL,
  FAC_DAYS,
  FAC_SITES,
  FAC_SITE_LABEL,
  QUAD_HERBS,
  QUAD_HERB_LABEL,
  SOIL_CLAIMS,
  SOIL_CLAIM_LABEL,
  SOIL_DRAIN_TIMES,
  SOIL_JAR_TARGETS,
  SOIL_LABEL,
  SOIL_LAYERS,
  SOIL_LAYER_LABEL,
  SOIL_MAX_HEATS,
  emptyFacRow,
  emptyQuadRow,
  emptySoilAirRow,
  emptySoilHumusRow,
  emptySoilJarRow,
  facRH,
  type BioEcologyState,
  type BioEcologyVariant,
  type FacRow,
  type FacSite,
  type QuadHerb,
  type QuadRow,
  type SoilHumusRow,
  type SoilType,
} from '@aischool/shared';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { LabelBoard } from '../bio-common';
import type { EcoUpdate as Update } from './actions';
import { HERB_COLOUR, JarDrawing } from './visuals';

/**
 * The notebook of each investigation — the quadrat table, results and bar
 * chart; the capture–recapture counts, Lincoln index and assumptions; the
 * factors tables, means, Six's and rain calculations and comparison; the soil
 * tables, drainage graph and labelled jar — and the written answers: the same
 * record in the 2D lab and the 3D lab's notebook (`book`: exercise-book styling).
 */

const CHIP = 'rounded-full border px-2 py-0.5 text-[12px] transition-colors disabled:opacity-60 text-left';
const chip = (on: boolean, tone: 'success' | 'brand' = 'success') => cn(CHIP, on ? (tone === 'brand' ? 'border-brand bg-brand/15 text-foreground' : 'border-success bg-success/15 text-foreground') : 'border-border text-muted-foreground hover:bg-muted');
const box = (book?: boolean, className?: string) => cn('p-4 sm:p-5', book && 'border-l-[6px] border-l-danger/40', className);
function Cell({ id, value, onChange, readOnly, label, placeholder, w = 'w-[4.2rem]' }: { id: string; value: string; onChange: (v: string) => void; readOnly: boolean; label: string; placeholder?: string; w?: string }) {
  return <Input id={id} value={value} disabled={readOnly} onChange={(e) => onChange(e.target.value.slice(0, 40))} aria-label={label} placeholder={placeholder} inputMode="decimal" className={cn('h-8 px-1.5 text-center font-mono text-[13px]', w)} />;
}
const H = ({ children }: { children: React.ReactNode }) => <h4 className="mb-1.5 mt-4 text-[13px] font-semibold">{children}</h4>;
const Hint = ({ children }: { children: React.ReactNode }) => <p className="mb-2 text-[12px] text-muted-foreground">{children}</p>;

// ------------------------------------------------------------------ bar chart

/** The student's bar chart: drag each bar (or use the arrow keys) to its height. */
export function BarChart({ bars, onChange, readOnly, yLabel }: { bars: Record<QuadHerb, number | null>; onChange: (h: QuadHerb, v: number | null) => void; readOnly: boolean; yLabel: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<QuadHerb | null>(null);
  const vals = QUAD_HERBS.map((h) => bars[h] ?? 0);
  const yMax = Math.max(4, Math.ceil(Math.max(...vals) + 1));
  const W = 320;
  const Ht = 200;
  const M = { l: 40, r: 10, t: 10, b: 34 };
  const py = (v: number) => Ht - M.b - (v / yMax) * (Ht - M.t - M.b);
  const toVal = (cy: number) => {
    const ctm = svg.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(0, cy).matrixTransform(ctm.inverse());
    return Math.max(0, Math.min(yMax, Math.round(((Ht - M.b - p.y) / (Ht - M.t - M.b)) * yMax * 20) / 20));
  };
  const bw = (W - M.l - M.r) / QUAD_HERBS.length;
  return (
    <div>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${Ht}`}
        className="w-full touch-none select-none rounded-xl border border-border bg-card"
        role="img"
        aria-label={`Bar chart of ${yLabel}`}
        onPointerMove={(e) => {
          if (!drag || readOnly) return;
          const v = toVal(e.clientY);
          if (v !== null) onChange(drag, v);
        }}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        {Array.from({ length: yMax + 1 }, (_, k) => (
          <g key={k}>
            <line x1={M.l} x2={W - M.r} y1={py(k)} y2={py(k)} className="stroke-border" strokeWidth="0.6" />
            <text x={M.l - 4} y={py(k) + 3} textAnchor="end" fontSize="9" className="fill-muted-foreground">
              {k}
            </text>
          </g>
        ))}
        <text x={10} y={(M.t + Ht - M.b) / 2} fontSize="9" textAnchor="middle" className="fill-foreground" transform={`rotate(-90 10 ${(M.t + Ht - M.b) / 2})`}>
          {yLabel}
        </text>
        {QUAD_HERBS.map((h, k) => {
          const v = bars[h];
          const x = M.l + k * bw + bw * 0.2;
          return (
            <g key={h}>
              {v !== null && <rect x={x} y={py(v)} width={bw * 0.6} height={Ht - M.b - py(v)} fill={HERB_COLOUR[h]} stroke="#555" strokeWidth="0.8" />}
              {!readOnly && (
                <rect
                  x={x - 4}
                  y={py(v ?? 0) - 8}
                  width={bw * 0.6 + 8}
                  height={16}
                  rx={4}
                  className="cursor-ns-resize fill-brand/25 stroke-brand"
                  strokeWidth="1"
                  tabIndex={0}
                  role="slider"
                  aria-label={`Bar for ${QUAD_HERB_LABEL[h]}: ${v ?? 'not drawn'}; arrow keys change it`}
                  aria-valuenow={v ?? 0}
                  data-bar={h}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.currentTarget.ownerSVGElement ?? e.currentTarget).setPointerCapture?.(e.pointerId);
                    setDrag(h);
                    if (v === null) onChange(h, 0);
                  }}
                  onKeyDown={(e) => {
                    const step = e.shiftKey ? 0.5 : 0.05;
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      onChange(h, Math.max(0, Math.round(((v ?? 0) + (e.key === 'ArrowUp' ? step : -step)) * 100) / 100));
                    }
                  }}
                />
              )}
              <text x={x + bw * 0.3} y={Ht - M.b + 12} fontSize="8.5" textAnchor="middle" fontStyle="italic" className="fill-foreground">
                {QUAD_HERB_LABEL[h].split(' ')[0]}
              </text>
              {v !== null && (
                <text x={x + bw * 0.3} y={py(v) - 10} fontSize="8.5" textAnchor="middle" className="fill-foreground">
                  {v.toFixed(2)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={M.l} x2={W - M.r} y1={Ht - M.b} y2={Ht - M.b} className="stroke-foreground/70" />
      </svg>
      {!readOnly && <p className="mt-1 text-[12px] text-muted-foreground">Drag each bar’s handle to its height (or focus it and use the arrow keys; Shift for bigger steps).</p>}
    </div>
  );
}

// ------------------------------------------------------------------ drainage graph

const SOIL_LINE: Record<SoilType, string> = { SAND: '#e0a030', LOAM: '#6d4c41', CLAY: '#8e8e9a' };
/** Volume collected against time for each funnel, from the table (plotted when the student plots it). */
export function DrainGraph({ series, plotted }: { series: { soil: SoilType; pts: { x: number; y: number }[] }[]; plotted: boolean }) {
  const W = 320;
  const Ht = 210;
  const M = { l: 36, r: 10, t: 10, b: 32 };
  const px = (t: number) => M.l + (t / 30) * (W - M.l - M.r);
  const py = (v: number) => Ht - M.b - (v / 80) * (Ht - M.t - M.b);
  return (
    <svg viewBox={`0 0 ${W} ${Ht}`} className="w-full rounded-xl border border-border bg-card" role="img" aria-label="Graph of volume of water collected against time for each soil">
      {[0, 10, 20, 30, 40, 50, 60, 70, 80].map((v) => (
        <g key={v}>
          <line x1={M.l} x2={W - M.r} y1={py(v)} y2={py(v)} className="stroke-border" strokeWidth="0.6" />
          <text x={M.l - 4} y={py(v) + 3} textAnchor="end" fontSize="8.5" className="fill-muted-foreground">
            {v}
          </text>
        </g>
      ))}
      {[0, 5, 10, 15, 20, 25, 30].map((t) => (
        <g key={t}>
          <line x1={px(t)} x2={px(t)} y1={M.t} y2={Ht - M.b} className="stroke-border" strokeWidth="0.6" />
          <text x={px(t)} y={Ht - M.b + 11} textAnchor="middle" fontSize="8.5" className="fill-muted-foreground">
            {t}
          </text>
        </g>
      ))}
      <text x={(M.l + W - M.r) / 2} y={Ht - 4} textAnchor="middle" fontSize="9" className="fill-foreground">
        Time / min
      </text>
      <text x={10} y={(M.t + Ht - M.b) / 2} textAnchor="middle" fontSize="9" className="fill-foreground" transform={`rotate(-90 10 ${(M.t + Ht - M.b) / 2})`}>
        Volume collected / cm³
      </text>
      {plotted &&
        series.map((s) => (
          <g key={s.soil}>
            <polyline points={[{ x: 0, y: 0 }, ...s.pts].map((p) => `${px(p.x)},${py(p.y)}`).join(' ')} fill="none" stroke={SOIL_LINE[s.soil]} strokeWidth="1.6" />
            {s.pts.map((p, k) => (
              <g key={k} stroke={SOIL_LINE[s.soil]} strokeWidth="1.3">
                <line x1={px(p.x) - 3} x2={px(p.x) + 3} y1={py(p.y) - 3} y2={py(p.y) + 3} />
                <line x1={px(p.x) - 3} x2={px(p.x) + 3} y1={py(p.y) + 3} y2={py(p.y) - 3} />
              </g>
            ))}
          </g>
        ))}
      {plotted &&
        series.map((s, k) => (
          <g key={`l${s.soil}`}>
            <line x1={W - 90} x2={W - 76} y1={M.t + 10 + k * 12} y2={M.t + 10 + k * 12} stroke={SOIL_LINE[s.soil]} strokeWidth="2" />
            <text x={W - 72} y={M.t + 13 + k * 12} fontSize="8.5" className="fill-foreground">
              {SOIL_LABEL[s.soil]}
            </text>
          </g>
        ))}
      {!plotted && (
        <text x={W / 2} y={Ht / 2} textAnchor="middle" fontSize="10" className="fill-muted-foreground">
          Plot your readings when the table is filled in.
        </text>
      )}
    </svg>
  );
}

// ------------------------------------------------------------------ QUADRAT

export function QuadNotebook({ state, readOnly, update, book, className }: { state: BioEcologyState; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const w = state.quad;
  const setRow = (i: number, patch: Partial<QuadRow>) => update((s) => ({ ...s, quad: { ...s.quad, rows: s.quad.quads.map((_, k) => (k === i ? { ...(s.quad.rows[k] ?? emptyQuadRow()), ...patch } : (s.quad.rows[k] ?? emptyQuadRow()))) } }));
  const setRes = (h: QuadHerb, k: 'total' | 'density' | 'freq' | 'pop', val: string) => update((s) => ({ ...s, quad: { ...s.quad, res: { ...s.quad.res, [h]: { ...s.quad.res[h], [k]: val } } } }));
  return (
    <Card className={box(book, className)}>
      <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">Table of results</h3>
      <Hint>One row per quadrat. Count each herb; grass cover = squares more than half covered (each square is 1 %).</Hint>
      {w.quads.length === 0 ? (
        <p className="py-2 text-[13px] text-muted-foreground">Rows appear as you place quadrats.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[470px] border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-1 pr-1 font-medium">Quadrat (x, y)</th>
                {QUAD_HERBS.map((h) => (
                  <th key={h} className="pb-1 pr-1 font-medium italic">
                    {QUAD_HERB_LABEL[h].split(' ')[0]}
                  </th>
                ))}
                <th className="pb-1 font-medium">Grass cover / %</th>
              </tr>
            </thead>
            <tbody>
              {w.quads.map((q, i) => {
                const r = w.rows[i] ?? emptyQuadRow();
                return (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1 pr-1 font-mono">
                      {i + 1}. ({q.x}, {q.y}){q.how === 'CHOSEN' ? ' *' : ''}
                    </td>
                    {QUAD_HERBS.map((h) => (
                      <td key={h} className="py-1 pr-1">
                        <Cell id={`q-${h}-${i}`} value={r[h]} onChange={(x) => setRow(i, { [h]: x })} readOnly={readOnly} label={`${QUAD_HERB_LABEL[h]}, quadrat ${i + 1}`} />
                      </td>
                    ))}
                    <td className="py-1">
                      <Cell id={`q-grass-${i}`} value={r.grass} onChange={(x) => setRow(i, { grass: x })} readOnly={readOnly} label={`Grass cover, quadrat ${i + 1}`} />
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-border">
                <td className="py-1 pr-1 font-semibold">Total</td>
                {QUAD_HERBS.map((h) => (
                  <td key={h} className="py-1 pr-1">
                    <Cell id={`q-total-${h}`} value={w.res[h].total} onChange={(x) => setRes(h, 'total', x)} readOnly={readOnly} label={`Total ${QUAD_HERB_LABEL[h]}`} />
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
          {w.quads.some((q) => q.how === 'CHOSEN') && <p className="mt-1 text-[11.5px] text-muted-foreground">* placed where you chose, not from the random-number table.</p>}
        </div>
      )}
      <H>Results ({w.quads.length} quadrats of 1 m²; plot 400 m²)</H>
      <Hint>Density = total ÷ total area sampled. Frequency = quadrats with the herb ÷ all quadrats × 100. Population = density × 400 m².</Hint>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[420px] border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-1 pr-1 font-medium">Herb</th>
              <th className="pb-1 pr-1 font-medium">Density / per m²</th>
              <th className="pb-1 pr-1 font-medium">Frequency / %</th>
              <th className="pb-1 font-medium">Estimated population</th>
            </tr>
          </thead>
          <tbody>
            {QUAD_HERBS.map((h) => (
              <tr key={h} className="border-t border-border">
                <td className="py-1 pr-1 italic">{QUAD_HERB_LABEL[h]}</td>
                <td className="py-1 pr-1">
                  <Cell id={`q-density-${h}`} value={w.res[h].density} onChange={(x) => setRes(h, 'density', x)} readOnly={readOnly} label={`Density of ${QUAD_HERB_LABEL[h]}`} />
                </td>
                <td className="py-1 pr-1">
                  <Cell id={`q-freq-${h}`} value={w.res[h].freq} onChange={(x) => setRes(h, 'freq', x)} readOnly={readOnly} label={`Frequency of ${QUAD_HERB_LABEL[h]}`} />
                </td>
                <td className="py-1">
                  <Cell id={`q-pop-${h}`} value={w.res[h].pop} onChange={(x) => setRes(h, 'pop', x)} readOnly={readOnly} label={`Population of ${QUAD_HERB_LABEL[h]}`} w="w-[5.2rem]" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="font-semibold">Mean grass cover</span>
        <Cell id="q-cover" value={w.cover} onChange={(x) => update((s) => ({ ...s, quad: { ...s.quad, cover: x } }))} readOnly={readOnly} label="Mean grass cover" />
        <span className="text-muted-foreground">%</span>
      </label>
      <H>Bar chart: density of each herb</H>
      <BarChart bars={w.bars} readOnly={readOnly} yLabel="Density / plants per m²" onChange={(h, v) => update((s) => ({ ...s, quad: { ...s.quad, bars: { ...s.quad.bars, [h]: v } } }), `bar:${h}`)} />
      <H>Conclusion</H>
      {(['mostFreq', 'mostDense'] as const).map((k) => (
        <div key={k} className="mb-2">
          <p className="mb-1 text-[12px] text-muted-foreground">{k === 'mostFreq' ? 'The most frequent herb (found in most quadrats):' : 'The most dense herb (most plants per m²):'}</p>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={k === 'mostFreq' ? 'Most frequent herb' : 'Most dense herb'}>
            {QUAD_HERBS.map((h) => (
              <button key={h} type="button" role="radio" aria-checked={w[k] === h} disabled={readOnly} onClick={() => update((s) => ({ ...s, quad: { ...s.quad, [k]: s.quad[k] === h ? null : h } }), `${k}:${h}`)} className={chip(w[k] === h, 'brand')}>
                <i>{QUAD_HERB_LABEL[h]}</i>
              </button>
            ))}
          </div>
        </div>
      ))}
    </Card>
  );
}

// ------------------------------------------------------------------ CAPTURE

export function CapNotebook({ state, readOnly, update, book, className }: { state: BioEcologyState; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const w = state.cap;
  const set = (patch: Partial<BioEcologyState['cap']>, log?: string) => update((s) => ({ ...s, cap: { ...s.cap, ...patch } }), log);
  const toggle = <T extends string>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  return (
    <Card className={box(book, className)}>
      <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">Counts</h3>
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        <label className="flex items-center gap-1.5">
          First catch, marked (n₁) <Cell id="cap-n1" value={w.n1} onChange={(x) => set({ n1: x })} readOnly={readOnly} label="n1, first catch" />
        </label>
        <label className="flex items-center gap-1.5">
          Second catch (n₂) <Cell id="cap-n2" value={w.n2} onChange={(x) => set({ n2: x })} readOnly={readOnly} label="n2, second catch" />
        </label>
        <label className="flex items-center gap-1.5">
          Marked in the second catch (m) <Cell id="cap-m" value={w.m} onChange={(x) => set({ m: x })} readOnly={readOnly} label="m, marked in the second catch" />
        </label>
      </div>
      <H>Estimating the population</H>
      <Hint>Choose the Lincoln index, then work it out from your own counts.</Hint>
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Formula">
        {CAP_FORMULAS.map((f) => (
          <button key={f} type="button" role="radio" aria-checked={w.formula === f} disabled={readOnly} onClick={() => set({ formula: w.formula === f ? null : f }, `formula:${f}`)} className={chip(w.formula === f, 'brand')}>
            {CAP_FORMULA_LABEL[f]}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[12.5px]">
        <label className="flex items-center gap-1.5">
          N = <Cell id="cap-N" value={w.N} onChange={(x) => set({ N: x })} readOnly={readOnly} label="Estimated population N" w="w-[5rem]" /> grasshoppers
        </label>
        <label className="flex items-center gap-1.5">
          % marked in the second catch <Cell id="cap-pct" value={w.pct} onChange={(x) => set({ pct: x })} readOnly={readOnly} label="Percent marked in the second catch" />
        </label>
        <label className="flex items-center gap-1.5">
          Density (plot 400 m²) <Cell id="cap-density" value={w.density} onChange={(x) => set({ density: x })} readOnly={readOnly} label="Population density per square metre" /> per m²
        </label>
      </div>
      <H>Assumptions of the method (tick all that apply)</H>
      <div className="flex flex-wrap gap-1">
        {CAP_ASSUME.map((a) => (
          <button key={a} type="button" aria-pressed={w.assume.includes(a)} disabled={readOnly} onClick={() => set({ assume: toggle(w.assume, a) }, `assume:${a}`)} className={chip(w.assume.includes(a))}>
            {CAP_ASSUME_LABEL[a]}
            {w.assume.includes(a) ? ' ✓' : ''}
          </button>
        ))}
      </div>
      <H>Sources of error</H>
      <div className="flex flex-wrap gap-1">
        {CAP_ERRORS.map((a) => (
          <button key={a} type="button" aria-pressed={w.errors.includes(a)} disabled={readOnly} onClick={() => set({ errors: toggle(w.errors, a) }, `error:${a}`)} className={chip(w.errors.includes(a))}>
            {CAP_ERROR_LABEL[a]}
            {w.errors.includes(a) ? ' ✓' : ''}
          </button>
        ))}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ FACTORS

/** The humidity table (relative humidity, %) by dry-bulb temperature and depression of the wet bulb. */
export function HumidityTable() {
  const drys = [22, 24, 26, 28, 30, 32, 34, 36];
  const deps = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[360px] border-collapse text-center font-mono text-[11px]" aria-label="Humidity table">
        <thead>
          <tr className="text-muted-foreground">
            <th className="px-1 text-left font-sans font-medium">Dry °C \ depression °C</th>
            {deps.map((d) => (
              <th key={d} className="px-1 font-medium">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {drys.map((t) => (
            <tr key={t} className="border-t border-border">
              <td className="px-1 text-left">{t}</td>
              {deps.map((d) => (
                <td key={d} className="px-1">
                  {Math.round(facRH(t, t - d))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FacNotebook({ state, readOnly, update, book, className }: { state: BioEcologyState; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const w = state.fac;
  const setRow = (site: FacSite, d: number, patch: Partial<FacRow>) => update((s) => ({ ...s, fac: { ...s.fac, rows: { ...s.fac.rows, [site]: s.fac.rows[site].map((r, k) => (k === d ? { ...(r ?? emptyFacRow()), ...patch } : r)) } } }));
  const set = (patch: Partial<BioEcologyState['fac']>, log?: string) => update((s) => ({ ...s, fac: { ...s.fac, ...patch } }), log);
  const cols: { k: keyof FacRow; h: string }[] = [
    { k: 'air', h: 'Air / °C' },
    { k: 'soil', h: 'Soil / °C' },
    { k: 'dry', h: 'Dry bulb / °C' },
    { k: 'wet', h: 'Wet bulb / °C' },
    { k: 'rh', h: 'RH / %' },
    { k: 'light', h: 'Light / lux' },
    { k: 'wind', h: 'Wind / m s⁻¹' },
  ];
  const meanCols = ['air', 'soil', 'rh', 'light', 'wind'] as const;
  return (
    <Card className={box(book, className)}>
      <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">The two sites</h3>
      <Hint>Days 1–3 at about the same time. RH from the humidity table (depression = dry − wet).</Hint>
      {FAC_SITES.map((site) => (
        <div key={site} className="mb-3">
          <p className="mb-1 text-[12.5px] font-semibold">{FAC_SITE_LABEL[site]}</p>
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[540px] border-collapse text-[12px]">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-1 pr-1 font-medium">Day</th>
                  {cols.map((c) => (
                    <th key={c.k} className="pb-1 pr-1 font-medium">
                      {c.h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {w.rows[site].slice(0, 3).map((r, d) => (
                  <tr key={d} className="border-t border-border">
                    <td className="py-1 pr-1">{d + 1}</td>
                    {cols.map((c) => (
                      <td key={c.k} className="py-1 pr-1">
                        <Cell id={`f-${site}-${c.k}-${d}`} value={r[c.k]} onChange={(x) => setRow(site, d, { [c.k]: x })} readOnly={readOnly} label={`${c.h}, ${FAC_SITE_LABEL[site]}, day ${d + 1}`} w={c.k === 'light' ? 'w-[5.2rem]' : 'w-[3.8rem]'} />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t-2 border-border">
                  <td className="py-1 pr-1 font-semibold">Mean</td>
                  {cols.map((c) => (
                    <td key={c.k} className="py-1 pr-1">
                      {(meanCols as readonly string[]).includes(c.k) ? (
                        <Cell id={`f-${site}-mean-${c.k}`} value={w.means[site][c.k as (typeof meanCols)[number]]} onChange={(x) => set({ means: { ...w.means, [site]: { ...w.means[site], [c.k]: x } } })} readOnly={readOnly} label={`Mean ${c.h}, ${FAC_SITE_LABEL[site]}`} w={c.k === 'light' ? 'w-[5.2rem]' : 'w-[3.8rem]'} />
                      ) : null}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <label className="mt-1 flex items-center gap-1.5 text-[12.5px]">
            Soil pH <Cell id={`f-ph-${site}`} value={w.ph[site]} onChange={(x) => set({ ph: { ...w.ph, [site]: x } })} readOnly={readOnly} label={`Soil pH, ${FAC_SITE_LABEL[site]}`} w="w-[3.5rem]" />
          </label>
        </div>
      ))}
      <details className="mb-2 rounded-xl border border-border p-2 text-[12px]">
        <summary className="cursor-pointer font-semibold">Humidity table</summary>
        <div className="mt-2">
          <HumidityTable />
        </div>
      </details>
      <H>The weather station (read at 9 am)</H>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[480px] border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-1 pr-1 font-medium">Day</th>
              <th className="pb-1 pr-1 font-medium">Max / °C</th>
              <th className="pb-1 pr-1 font-medium">Min / °C</th>
              <th className="pb-1 pr-1 font-medium">Mean / °C</th>
              <th className="pb-1 pr-1 font-medium">Range / °C</th>
              <th className="pb-1 pr-1 font-medium">Rain / mm</th>
              <th className="pb-1 font-medium">Wind from</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: FAC_DAYS }, (_, d) => (
              <tr key={d} className="border-t border-border">
                <td className="py-1 pr-1">{d + 1}</td>
                {(['max', 'min', 'mean', 'range'] as const).map((k) => (
                  <td key={k} className="py-1 pr-1">
                    <Cell id={`f-six-${k}-${d}`} value={w.six[d]![k]} onChange={(x) => set({ six: w.six.map((r, j) => (j === d ? { ...r, [k]: x } : r)) })} readOnly={readOnly} label={`Six's ${k}, day ${d + 1}`} w="w-[3.8rem]" />
                  </td>
                ))}
                <td className="py-1 pr-1">
                  <Cell id={`f-rain-${d}`} value={w.rain[d]!} onChange={(x) => set({ rain: w.rain.map((r, j) => (j === d ? x : r)) })} readOnly={readOnly} label={`Rain, day ${d + 1}`} w="w-[3.8rem]" />
                </td>
                <td className="py-1">
                  <Cell id={`f-dir-${d}`} value={w.dir[d]!} onChange={(x) => set({ dir: w.dir.map((r, j) => (j === d ? x.toUpperCase() : r)) })} readOnly={readOnly} label={`Wind direction, day ${d + 1}`} w="w-[3.2rem]" placeholder="N" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[12.5px]">
        <label className="flex items-center gap-1.5">
          Total rain <Cell id="f-rain-total" value={w.rainTotal} onChange={(x) => set({ rainTotal: x })} readOnly={readOnly} label="Total rainfall" /> mm
        </label>
        <label className="flex items-center gap-1.5">
          Mean rain <Cell id="f-rain-mean" value={w.rainMean} onChange={(x) => set({ rainMean: x })} readOnly={readOnly} label="Mean rainfall per day" /> mm per day
        </label>
        <label className="flex items-center gap-1.5">
          Secchi depth <Cell id="f-secchi" value={w.secchi} onChange={(x) => set({ secchi: x })} readOnly={readOnly} label="Secchi disc depth" /> cm
        </label>
      </div>
      <H>Comparing the sites</H>
      <Textarea id="f-obs" rows={2} value={w.obs} disabled={readOnly} onChange={(e) => set({ obs: e.target.value.slice(0, 800) })} placeholder="How light, temperature, humidity and wind differed between the open field and the canopy…" />
      <p className="mb-1 mt-2 text-[12px] text-muted-foreground">Which statements do your readings support?</p>
      <div className="flex flex-wrap gap-1">
        {FAC_CLAIMS.map((c) => (
          <button key={c} type="button" aria-pressed={w.claims.includes(c)} disabled={readOnly} onClick={() => set({ claims: w.claims.includes(c) ? w.claims.filter((x) => x !== c) : [...w.claims, c] }, `claim:${c}`)} className={chip(w.claims.includes(c))}>
            {FAC_CLAIM_LABEL[c]}
            {w.claims.includes(c) ? ' ✓' : ''}
          </button>
        ))}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ SOIL

export function SoilNotebook({ v, state, readOnly, update, book, className }: { v: BioEcologyVariant; state: BioEcologyState; readOnly: boolean; update: Update; book?: boolean; className?: string }) {
  const w = state.soil;
  const set = (patch: Partial<BioEcologyState['soil']>, log?: string) => update((s) => ({ ...s, soil: { ...s.soil, ...patch } }), log);
  const setD = (f: number, k: number, x: string) => update((s) => ({ ...s, soil: { ...s.soil, dRows: s.soil.dRows.map((r, i) => (i === f ? r.map((y, j) => (j === k ? x : y)) : r)) } }));
  const setH = (c: number, patch: Partial<SoilHumusRow>) => update((s) => ({ ...s, soil: { ...s.soil, hRows: s.soil.hRows.map((r, i) => (i === c ? { ...(r ?? emptySoilHumusRow()), ...patch } : r)) } }));
  const heats = Math.max(2, ...w.hRows.map((r) => r.after.length), ...w.crucibles.map((c) => c.heats));
  return (
    <Card className={box(book, className)}>
      <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">1. Sedimentation</h3>
      {w.jars.length === 0 ? (
        <p className="py-1 text-[13px] text-muted-foreground">Rows appear as you set up jars.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[440px] border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-1 pr-1 font-medium">Jar</th>
                <th className="pb-1 pr-1 font-medium" />
                {SOIL_LAYERS.map((l) => (
                  <th key={l} className="pb-1 pr-1 font-medium">
                    {SOIL_LAYER_LABEL[l]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {w.jars.map((j, i) =>
                (['jarRows', 'jarPct'] as const).map((k) => (
                  <tr key={`${i}${k}`} className={cn(k === 'jarRows' && 'border-t border-border')}>
                    <td className="py-1 pr-1">{k === 'jarRows' ? `${i + 1}. ${SOIL_LABEL[j.soil]}` : ''}</td>
                    <td className="py-1 pr-1 text-muted-foreground">{k === 'jarRows' ? 'mm' : '%'}</td>
                    {SOIL_LAYERS.map((l) => (
                      <td key={l} className="py-1 pr-1">
                        <Cell id={`s-${k}-${l}-${i}`} value={(w[k][i] ?? emptySoilJarRow())[l]} onChange={(x) => set({ [k]: w[k].map((r, n) => (n === i ? { ...r, [l]: x } : r)) } as Partial<BioEcologyState['soil']>)} readOnly={readOnly} label={`${SOIL_LAYER_LABEL[l]} ${k === 'jarRows' ? 'thickness' : 'percent'}, jar ${i + 1}`} />
                      </td>
                    ))}
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
      <Hint>% of a layer = its thickness ÷ total thickness of the sediment × 100.</Hint>
      <p className="mb-1 mt-2 text-[12.5px] font-semibold">Label the jar</p>
      <LabelBoard box={{ x: 0, y: 0, w: 200, h: 160 }} targets={SOIL_JAR_TARGETS} options={v.jarOptions} value={w.labels} onChange={(next) => set({ labels: next }, 'labels')} readOnly={readOnly} label="Drawing of the sedimentation jar">
        <JarDrawing />
      </LabelBoard>
      <label className="mt-2 block text-[12px] font-medium text-muted-foreground" htmlFor="s-obs">
        What the jar showed
      </label>
      <Textarea id="s-obs" rows={2} value={w.obs} disabled={readOnly} onChange={(e) => set({ obs: e.target.value.slice(0, 800) })} placeholder="Which particles settled first, the order of the layers, the water, the humus…" />

      <h3 className="mb-1 mt-5 font-display text-[15px] font-semibold tracking-tight">2. Drainage and water retained</h3>
      <Hint>Volume collected (cm³) at each time. Retained = 100 cm³ − volume collected at 30 min.</Hint>
      {w.funnels.length === 0 ? (
        <p className="py-1 text-[13px] text-muted-foreground">Rows appear as you set up funnels.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[500px] border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-1 pr-1 font-medium">Soil</th>
                {SOIL_DRAIN_TIMES.map((t) => (
                  <th key={t} className="pb-1 pr-1 font-medium">
                    {t} min
                  </th>
                ))}
                <th className="pb-1 font-medium">Retained / cm³</th>
              </tr>
            </thead>
            <tbody>
              {w.funnels.map((f, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-1 pr-1">
                    {SOIL_LABEL[f.soil]} <span className="text-muted-foreground">({f.mass} g{f.cotton ? '' : ', no cotton'})</span>
                  </td>
                  {SOIL_DRAIN_TIMES.map((t, k) => (
                    <td key={t} className="py-1 pr-1">
                      <Cell id={`s-d-${i}-${k}`} value={w.dRows[i]?.[k] ?? ''} onChange={(x) => setD(i, k, x)} readOnly={readOnly} label={`${SOIL_LABEL[f.soil]} at ${t} min`} w="w-[3.4rem]" />
                    </td>
                  ))}
                  <td className="py-1">
                    <Cell id={`s-ret-${i}`} value={w.retained[i] ?? ''} onChange={(x) => set({ retained: w.funnels.map((_, n) => (n === i ? x : (w.retained[n] ?? ''))) })} readOnly={readOnly} label={`Water retained by ${SOIL_LABEL[f.soil]}`} w="w-[3.6rem]" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2">
        <DrainGraph plotted={w.plotted} series={w.funnels.map((f, i) => ({ soil: f.soil, pts: SOIL_DRAIN_TIMES.map((t, k) => ({ x: t, y: Number(w.dRows[i]?.[k]) })).filter((p, k) => (w.dRows[i]?.[k] ?? '').trim() !== '' && Number.isFinite(p.y)) }))} />
        {!readOnly && (
          <Button size="sm" variant="outline" className="mt-1.5" onClick={() => set({ plotted: !w.plotted }, w.plotted ? 'unplot' : 'plot')}>
            {w.plotted ? 'Clear the graph' : 'Plot the points and join them'}
          </Button>
        )}
      </div>

      <h3 className="mb-1 mt-5 font-display text-[15px] font-semibold tracking-tight">3. Air content</h3>
      <Hint>50 cm³ of soil + 50 cm³ of water. Air = 100 − final volume. % air = air ÷ 50 × 100.</Hint>
      {w.airs.map((a, i) => {
        const r = w.airRows[i] ?? emptySoilAirRow();
        const setA = (patch: Partial<typeof r>) => set({ airRows: w.airs.map((_, n) => (n === i ? { ...(w.airRows[n] ?? emptySoilAirRow()), ...patch } : (w.airRows[n] ?? emptySoilAirRow()))) });
        return (
          <div key={i} className="mb-1 flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className="w-[7.5rem]">{SOIL_LABEL[a.soil]}</span>
            <label className="flex items-center gap-1">
              final <Cell id={`s-air-final-${i}`} value={r.final} onChange={(x) => setA({ final: x })} readOnly={readOnly} label={`Final volume, ${SOIL_LABEL[a.soil]}`} w="w-[3.6rem]" /> cm³
            </label>
            <label className="flex items-center gap-1">
              air <Cell id={`s-air-air-${i}`} value={r.air} onChange={(x) => setA({ air: x })} readOnly={readOnly} label={`Volume of air, ${SOIL_LABEL[a.soil]}`} w="w-[3.6rem]" /> cm³
            </label>
            <label className="flex items-center gap-1">
              <Cell id={`s-air-pct-${i}`} value={r.pct} onChange={(x) => setA({ pct: x })} readOnly={readOnly} label={`Percent air, ${SOIL_LABEL[a.soil]}`} w="w-[3.6rem]" /> %
            </label>
          </div>
        );
      })}
      {!w.airs.length && <p className="py-1 text-[13px] text-muted-foreground">Rows appear as you set up the cylinders.</p>}

      <h3 className="mb-1 mt-5 font-display text-[15px] font-semibold tracking-tight">4. Humus (loss on heating)</h3>
      <Hint>Masses to 0.01 g. Loss = (crucible + soil) − final constant mass; % humus = loss ÷ mass of dry soil × 100.</Hint>
      {w.crucibles.length === 0 ? (
        <p className="py-1 text-[13px] text-muted-foreground">Rows appear as you set out crucibles.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[560px] border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-1 pr-1 font-medium">Soil</th>
                <th className="pb-1 pr-1 font-medium">Crucible / g</th>
                <th className="pb-1 pr-1 font-medium">+ dry soil / g</th>
                {Array.from({ length: Math.min(SOIL_MAX_HEATS, heats) }, (_, k) => (
                  <th key={k} className="pb-1 pr-1 font-medium">
                    Heating {k + 1} / g
                  </th>
                ))}
                <th className="pb-1 pr-1 font-medium">Loss / g</th>
                <th className="pb-1 font-medium">Humus / %</th>
              </tr>
            </thead>
            <tbody>
              {w.crucibles.map((c, i) => {
                const r = w.hRows[i] ?? emptySoilHumusRow();
                return (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1 pr-1">
                      {SOIL_LABEL[c.soil]}
                      {c.dried ? '' : <span className="text-muted-foreground"> (damp)</span>}
                    </td>
                    <td className="py-1 pr-1">
                      <Cell id={`s-h-empty-${i}`} value={r.empty} onChange={(x) => setH(i, { empty: x })} readOnly={readOnly} label={`Crucible mass, ${SOIL_LABEL[c.soil]}`} w="w-[4.4rem]" />
                    </td>
                    <td className="py-1 pr-1">
                      <Cell id={`s-h-full-${i}`} value={r.full} onChange={(x) => setH(i, { full: x })} readOnly={readOnly} label={`Crucible and soil, ${SOIL_LABEL[c.soil]}`} w="w-[4.4rem]" />
                    </td>
                    {Array.from({ length: Math.min(SOIL_MAX_HEATS, heats) }, (_, k) => (
                      <td key={k} className="py-1 pr-1">
                        <Cell
                          id={`s-h-after-${i}-${k}`}
                          value={r.after[k] ?? ''}
                          onChange={(x) => {
                            const after = Array.from({ length: Math.max(r.after.length, k + 1) }, (_, n) => (n === k ? x : (r.after[n] ?? '')));
                            while (after.length && !after.at(-1)!.trim()) after.pop();
                            setH(i, { after });
                          }}
                          readOnly={readOnly}
                          label={`After heating ${k + 1}, ${SOIL_LABEL[c.soil]}`}
                          w="w-[4.4rem]"
                        />
                      </td>
                    ))}
                    <td className="py-1 pr-1">
                      <Cell id={`s-h-loss-${i}`} value={r.loss} onChange={(x) => setH(i, { loss: x })} readOnly={readOnly} label={`Loss in mass, ${SOIL_LABEL[c.soil]}`} w="w-[3.8rem]" />
                    </td>
                    <td className="py-1">
                      <Cell id={`s-h-pct-${i}`} value={r.pct} onChange={(x) => setH(i, { pct: x })} readOnly={readOnly} label={`Percent humus, ${SOIL_LABEL[c.soil]}`} w="w-[3.8rem]" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <H>Conclusions (tick those your results support)</H>
      <div className="flex flex-wrap gap-1">
        {SOIL_CLAIMS.map((c) => (
          <button key={c} type="button" aria-pressed={w.claims.includes(c)} disabled={readOnly} onClick={() => set({ claims: w.claims.includes(c) ? w.claims.filter((x) => x !== c) : [...w.claims, c] }, `claim:${c}`)} className={chip(w.claims.includes(c))}>
            {SOIL_CLAIM_LABEL[c]}
            {w.claims.includes(c) ? ' ✓' : ''}
          </button>
        ))}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ written answers

export const EXPLAIN_Q = {
  QUADRAT: 'Explain why the quadrats were placed using random numbers, and why ten or more were used rather than two or three.',
  CAPTURE: 'Explain why N = n₁ × n₂ ÷ m gives the population, and why the marked grasshoppers are left about a day before the second sample.',
  FACTORS: 'Explain how the differences in light, temperature, humidity and wind between the sites affect the organisms found in each.',
  SOIL: 'Explain why water drains fastest through sandy soil and clay retains most, and why loam lost the most mass on heating.',
};

export function Written({ state, readOnly, update, className }: { state: BioEcologyState; readOnly: boolean; update: Update; className?: string }) {
  const task = state.task ?? 'QUADRAT';
  const set = (k: 'precautions' | 'explain', val: string) => update((s) => ({ ...s, written: { ...s.written, [k]: val.slice(0, 2000) } }));
  return (
    <Card className={cn('space-y-3 p-4 sm:p-5', className)}>
      <div>
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="eco-prec">
          Two precautions you took
        </label>
        <Textarea id="eco-prec" rows={3} value={state.written.precautions} disabled={readOnly} onChange={(e) => set('precautions', e.target.value)} placeholder={task === 'QUADRAT' ? 'e.g. the quadrats were placed at random coordinates…' : task === 'CAPTURE' ? 'e.g. a small dot of non-toxic paint was used…' : task === 'FACTORS' ? 'e.g. the thermometers were shaded from direct sun…' : 'e.g. the same mass of soil was used in each funnel…'} />
      </div>
      <div>
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="eco-explain">
          {EXPLAIN_Q[task]}
        </label>
        <Textarea id="eco-explain" rows={3} value={state.written.explain} disabled={readOnly} onChange={(e) => set('explain', e.target.value)} />
      </div>
    </Card>
  );
}
