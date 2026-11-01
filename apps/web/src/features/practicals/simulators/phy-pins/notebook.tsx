import { DISP_COLOURS, type DispColour, type DispFilterObs, type DispRay, type PhyGraphLine, type PhyPinsState, type PinsAnswerId, type PinsRow, type PinsTask } from '@aischool/shared';
import { Minus, Spline, Trash2, Undo2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AnswerRow, Cell, PhyGraph, numericPoints } from '../phy-common';
import { smoothPath } from '../phy-heat/graph';

type Update = (fn: (s: PhyPinsState) => PhyPinsState, log?: string) => void;

/** The practical notebook for each task: the table, the graph, the answers and the written parts. */
export function Notebook({ task, state, readOnly, update, removeTrace, removeDepth }: { task: PinsTask; state: PhyPinsState; readOnly: boolean; update: Update; removeTrace: (k: number) => void; removeDepth: (k: number) => void }) {
  const setAnswer = (id: PinsAnswerId, key: 'value' | 'unit', value: string) => update((s) => ({ ...s, answers: { ...s.answers, [id]: { ...s.answers[id], [key]: value } } }));
  const ans = (id: PinsAnswerId, label: string, unitHint: string, noUnit = false) => <AnswerRow id={`pins-${id}`} label={label} answer={state.answers[id]} onChange={(k, x) => setAnswer(id, k, x)} readOnly={readOnly} unitHint={unitHint} noUnit={noUnit} />;
  const written = (key: 'precautions' | 'conclusion', label: string, rows = 3) => (
    <div className="mt-4">
      <label className="mb-1 block text-[12.5px] font-semibold" htmlFor={`pins-${key}`}>
        {label}
      </label>
      <Textarea id={`pins-${key}`} value={state.written[key]} onChange={(e) => update((s) => ({ ...s, written: { ...s.written, [key]: e.target.value.slice(0, 2000) } }))} disabled={readOnly} rows={rows} />
    </div>
  );
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="mb-3 font-display text-[15px] font-semibold tracking-tight">Your record</h3>
      {(task === 'MIRROR' || task === 'PRISM') && (
        <>
          <TraceTable task={task} state={state} readOnly={readOnly} update={update} removeTrace={removeTrace} />
          <div className="mt-5">
            {task === 'MIRROR' ? (
              <>
                <p className="mb-2 text-[12.5px] font-semibold">Graph of r against i</p>
                <PhyGraph points={numericPoints(state.table.map((r) => [r.i, r.a]))} line={state.line} onLine={(line) => update((s) => ({ ...s, line }))} readOnly={readOnly} xLabel="i / °" yLabel="r / °" />
              </>
            ) : (
              <>
                <p className="mb-2 text-[12.5px] font-semibold">Graph of D against i</p>
                <CurveGraph points={numericPoints(state.table.map((r) => [r.i, r.a]))} curve={state.curve} onCurve={(curve) => update((s) => ({ ...s, curve }), curve ? 'curve' : undefined)} line={state.line} onLine={(line) => update((s) => ({ ...s, line }))} readOnly={readOnly} />
              </>
            )}
          </div>
          <div className="mt-5 space-y-3">
            <p className="text-[12.5px] font-semibold">Calculations</p>
            {task === 'MIRROR' ? (
              ans('slope', '(i) Slope of your graph of r against i', 'unit', true)
            ) : (
              <>
                {ans('dmin', '(i) Minimum deviation Dₘ from your curve', '°')}
                {ans('n', '(ii) n = sin((A + Dₘ)/2) ÷ sin(A/2), A = 60°', 'unit', true)}
              </>
            )}
          </div>
          {task === 'MIRROR' && written('conclusion', 'Conclusion (what do your results show?)', 2)}
          {written('precautions', 'Two precautions you took')}
        </>
      )}
      {task === 'DEPTH' && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[300px] text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] text-muted-foreground">
                  <th className="py-1 pr-1 font-medium">#</th>
                  <th className="px-1 py-1 font-medium">Blocks</th>
                  <th className="px-1 py-1 font-medium">Real depth / cm</th>
                  <th className="px-1 py-1 font-medium">Apparent depth / cm</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {!state.depth.readings.length && (
                  <tr>
                    <td colSpan={5} className="py-3 text-muted-foreground">
                      A row appears for each reading you take.
                    </td>
                  </tr>
                )}
                {state.depth.readings.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1.5 pr-1 text-[11.5px] text-muted-foreground">{i + 1}</td>
                    <td className="px-1 text-[12px]">{r.blocks}</td>
                    {(['real', 'app'] as const).map((k) => (
                      <td key={k} className="px-1 py-1.5">
                        <Cell value={state.depth.rows[i]?.[k] ?? ''} onChange={(x) => update((s) => ({ ...s, depth: { ...s.depth, rows: s.depth.rows.map((row, j) => (j === i ? { ...row, [k]: x } : row)) } }))} readOnly={readOnly} label={`Reading ${i + 1} ${k === 'real' ? 'real depth' : 'apparent depth'}`} />
                      </td>
                    ))}
                    <td>
                      {!readOnly && (
                        <Button size="icon-sm" variant="ghost" onClick={() => removeDepth(i)} aria-label={`Delete reading ${i + 1}`}>
                          ×
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5">
            <p className="mb-2 text-[12.5px] font-semibold">Graph of real depth against apparent depth</p>
            <PhyGraph points={numericPoints(state.depth.rows.map((r) => [r.app, r.real]))} line={state.line} onLine={(line) => update((s) => ({ ...s, line }))} readOnly={readOnly} xLabel="apparent depth / cm" yLabel="real depth / cm" />
          </div>
          <div className="mt-5 space-y-3">
            <p className="text-[12.5px] font-semibold">Calculations</p>
            {ans('slope', '(i) Slope of your graph', 'unit', true)}
            {ans('n', '(ii) Refractive index n of the glass', 'unit', true)}
          </div>
          {written('precautions', 'Two precautions you took')}
        </>
      )}
      {task === 'DISP' && <DispRecord state={state} readOnly={readOnly} update={update} ans={ans} written={written} />}
    </Card>
  );
}

function TraceTable({ task, state, readOnly, update, removeTrace }: { task: 'MIRROR' | 'PRISM'; state: PhyPinsState; readOnly: boolean; update: Update; removeTrace: (k: number) => void }) {
  const setCell = (i: number, key: keyof PinsRow, value: string) => update((s) => ({ ...s, table: s.table.map((row, k) => (k === i ? { ...row, [key]: value } : row)) }));
  const head: Record<keyof PinsRow, string> = { i: 'i / °', a: task === 'MIRROR' ? 'r / °' : 'D / °' };
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[260px] text-[13px]">
        <thead>
          <tr className="text-left text-[11.5px] text-muted-foreground">
            <th className="py-1 pr-1 font-medium">#</th>
            <th className="px-1 py-1 font-medium">{head.i}</th>
            <th className="px-1 py-1 font-medium">{head.a}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {!state.traces.length && (
            <tr>
              <td colSpan={4} className="py-3 text-muted-foreground">
                A row appears for each trace.
              </td>
            </tr>
          )}
          {state.traces.map((t, i) => (
            <tr key={i} className="border-t border-border">
              <td className="py-1.5 pr-1 text-[11.5px] text-muted-foreground">{i + 1}</td>
              {(['i', 'a'] as const).map((k) => (
                <td key={k} className="px-1 py-1.5">
                  <Cell value={state.table[i]?.[k] ?? ''} onChange={(x) => setCell(i, k, x)} readOnly={readOnly} label={`Trace ${i + 1} ${head[k]}`} />
                </td>
              ))}
              <td>
                {!readOnly && t.joined && (
                  <Button size="icon-sm" variant="ghost" onClick={() => removeTrace(i)} aria-label={`Delete trace ${i + 1}`}>
                    ×
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const FILTER_OBS: { id: DispFilterObs; label: string }[] = [
  { id: 'one-colour', label: 'Only that colour reaches the screen, and it is not split further' },
  { id: 'split', label: 'The coloured light is split into a new spectrum' },
  { id: 'all', label: 'All seven colours still appear' },
  { id: 'none', label: 'No light reaches the screen' },
];

function DispRecord({ state, readOnly, update, ans, written }: { state: PhyPinsState; readOnly: boolean; update: Update; ans: (id: PinsAnswerId, label: string, unitHint: string, noUnit?: boolean) => React.ReactNode; written: (key: 'precautions' | 'conclusion', label: string, rows?: number) => React.ReactNode }) {
  const d = state.disp;
  const setDisp = (patch: Partial<PhyPinsState['disp']>, log: string) => update((s) => ({ ...s, disp: { ...s.disp, ...patch } }), log);
  const left = DISP_COLOURS.filter((c) => !d.order.includes(c.id));
  const name = (id: DispColour | '') => DISP_COLOURS.find((c) => c.id === id)?.name ?? '';
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-[12.5px] font-semibold">(a) The colours on the screen, from the least deviated</p>
        <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-lg border border-dashed border-border p-1.5">
          {d.order.map((c, k) => (
            <span key={c} className="rounded-md px-2 py-0.5 text-[12px] font-medium text-white" style={{ background: DISP_COLOURS.find((x) => x.id === c)!.css, color: c === 'yellow' ? '#222' : undefined }}>
              {k + 1}. {name(c)}
            </span>
          ))}
          {!d.order.length && <span className="text-[12px] text-muted-foreground">Tap the colours below in the order you see them.</span>}
        </div>
        {!readOnly && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {left.map((c) => (
              <Button key={c.id} size="sm" variant="outline" onClick={() => setDisp({ order: [...d.order, c.id] }, 'order')} aria-label={`Add ${c.name}`}>
                <span className="size-3 rounded-full" style={{ background: c.css }} /> {c.name}
              </Button>
            ))}
            {d.order.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setDisp({ order: [] }, 'order-clear')}>
                <Undo2 /> Clear
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {(['most', 'least'] as const).map((k) => (
          <label key={k} className="text-[12.5px]">
            <span className="text-muted-foreground">(b) Colour deviated {k}</span>
            <select value={d[k]} disabled={readOnly} onChange={(e) => setDisp({ [k]: e.target.value as DispColour | '' }, k)} className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-2 text-base sm:text-sm" aria-label={`Colour deviated ${k}`}>
              <option value="">—</option>
              {DISP_COLOURS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <label className="block text-[12.5px]">
        <span className="text-muted-foreground">(c) With a coloured filter in the beam</span>
        <select value={d.filterObs} disabled={readOnly} onChange={(e) => setDisp({ filterObs: e.target.value as DispFilterObs }, 'filter-obs')} className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-2 text-base sm:text-sm" aria-label="Filter observation">
          <option value="">—</option>
          {FILTER_OBS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <div>
        <p className="mb-1 text-[12.5px] text-muted-foreground">(d) Ray diagram: which shows the red and violet paths correctly?</p>
        <div className="grid grid-cols-2 gap-2">
          {(['violet-more', 'red-more'] as DispRay[]).map((r) => (
            <button key={r} type="button" disabled={readOnly} onClick={() => setDisp({ ray: r }, 'ray')} aria-pressed={d.ray === r} aria-label={r === 'violet-more' ? 'Violet bent more than red' : 'Red bent more than violet'} className={cn('rounded-xl border p-1', d.ray === r ? 'border-brand ring-2 ring-brand/40' : 'border-border')}>
              <RaySketch violetMore={r === 'violet-more'} />
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <p className="text-[12.5px] font-semibold">(e) At minimum deviation, on the screen scale</p>
        {ans('dred', 'D for red light', '°')}
        {ans('dviol', 'D for violet light', '°')}
        {ans('disp', 'Angular dispersion D(violet) − D(red)', '°')}
        {ans('n', 'n for red light = sin((A + D)/2) ÷ sin(A/2), A = 60°', 'unit', true)}
      </div>
      {written('conclusion', '(f) Explain why white light is split into colours by the prism', 3)}
      {written('precautions', 'One precaution you took for a clear spectrum', 2)}
    </div>
  );
}

function RaySketch({ violetMore }: { violetMore: boolean }) {
  const red = violetMore ? '#e3262b' : '#8f3fd1';
  const vio = violetMore ? '#8f3fd1' : '#e3262b';
  return (
    <svg viewBox="0 0 120 70" className="w-full" aria-hidden>
      <polygon points="40,62 60,8 80,62" fill="#bfe3ee" stroke="#4b7f8c" />
      <line x1={4} y1={40} x2={50} y2={36} stroke="#999" strokeWidth="1.5" />
      <line x1={50} y1={36} x2={70} y2={38} stroke="#bbb" strokeWidth="1" />
      <line x1={70} y1={38} x2={116} y2={50} stroke={red} strokeWidth="1.6" />
      <line x1={70} y1={38} x2={114} y2={64} stroke={vio} strokeWidth="1.6" />
    </svg>
  );
}

// ------------------------------------------------------------------ the D–i curve

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

/** D against i: the student's points, a smooth curve when they draw it, and a horizontal line they slide onto the minimum (by its ends or its middle, or with buttons). */
export function CurveGraph({ points, curve, onCurve, line, onLine, readOnly }: { points: XY[]; curve: boolean; onCurve: (c: boolean) => void; line: PhyGraphLine | null; onLine: (l: PhyGraphLine | null) => void; readOnly: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ end: 0 | 1 | 2; y0: number; l: PhyGraphLine } | null>(null);
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const ys = [...points.map((p) => p.y), ...(line ? [line.y1, line.y2] : [])];
  const xs = [...points.map((p) => p.x), ...(line ? [line.x1, line.x2] : [])];
  const lo = ys.length ? Math.min(...ys) : 35;
  const hi = ys.length ? Math.max(...ys) : 50;
  const sy = niceStep(Math.max(4, hi - lo + 2));
  const yMin = Math.floor((lo - 1) / sy) * sy;
  const yMax = Math.ceil((hi + 1) / sy) * sy;
  const xLo = xs.length ? Math.min(...xs) : 30;
  const xHi = xs.length ? Math.max(...xs) : 70;
  const sx = niceStep(Math.max(10, xHi - xLo + 4));
  const xMin = Math.floor((xLo - 2) / sx) * sx;
  const xMax = Math.ceil((xHi + 2) / sx) * sx;
  const px = (x: number) => M.l + ((x - xMin) / (xMax - xMin)) * (W - M.l - M.r);
  const py = (y: number) => H - M.b - ((y - yMin) / (yMax - yMin)) * (H - M.t - M.b);
  const toData = (cx: number, cy: number) => {
    const ctm = svg.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(cx, cy).matrixTransform(ctm.inverse());
    const x = xMin + ((p.x - M.l) / (W - M.l - M.r)) * (xMax - xMin);
    const y = yMin + ((H - M.b - p.y) / (H - M.t - M.b)) * (yMax - yMin);
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  };
  const place = () => {
    if (points.length < 3) return;
    const low = points.reduce((a, b) => (b.y < a.y ? b : a));
    onLine({ x1: low.x - 6, y1: Math.round((low.y - 1) * 10) / 10, x2: low.x + 6, y2: Math.round((low.y - 1) * 10) / 10 });
  };
  const shift = (dy: number) => line && onLine({ ...line, y1: Math.round((line.y1 + dy) * 10) / 10, y2: Math.round((line.y2 + dy) * 10) / 10 });
  const xt = Array.from({ length: Math.round((xMax - xMin) / sx) + 1 }, (_, i) => xMin + i * sx);
  const yt = Array.from({ length: Math.round((yMax - yMin) / sy) + 1 }, (_, i) => yMin + i * sy);
  return (
    <div>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none rounded-xl border border-border bg-card"
        role="img"
        aria-label={`Graph of D against i: ${points.length} points${curve ? ', smooth curve' : ''}${line ? ', minimum line' : ''}`}
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
          i / °
        </text>
        <text x={11} y={(M.t + H - M.b) / 2} textAnchor="middle" fontSize="10" className="fill-foreground" transform={`rotate(-90 11 ${(M.t + H - M.b) / 2})`}>
          D / °
        </text>
        {curve && sorted.length > 2 && <path d={smoothPath(sorted.map((p) => [px(p.x), py(p.y)]))} fill="none" className="stroke-brand" strokeWidth="1.4" />}
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
            {([1, 2] as const).map((end) => (
              <circle
                key={end}
                cx={px(end === 1 ? line.x1 : line.x2)}
                cy={py(end === 1 ? line.y1 : line.y2)}
                r={readOnly ? 3 : 8}
                className={cn(readOnly ? 'fill-warning' : 'cursor-grab fill-warning/25 stroke-warning')}
                strokeWidth="1.2"
                aria-label={`End ${end} of the minimum line`}
                onPointerDown={(e) => {
                  if (readOnly) return;
                  e.stopPropagation();
                  (e.currentTarget.ownerSVGElement ?? e.currentTarget).setPointerCapture?.(e.pointerId);
                  setDrag({ end, y0: end === 1 ? line.y1 : line.y2, l: line });
                }}
              />
            ))}
          </g>
        )}
        {!points.length && (
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
              <Minus /> {line ? 'Re-place the minimum line' : 'Mark the minimum'}
            </Button>
            {line && (
              <>
                <Button size="sm" variant="ghost" onClick={() => onLine({ ...line, y2: line.y1 })}>
                  Make it level
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onLine(null)} aria-label="Remove the minimum line">
                  <Trash2 />
                </Button>
              </>
            )}
          </>
        )}
        <span className="tabular text-muted-foreground">{line ? `Minimum line at D = ${fmt((line.y1 + line.y2) / 2)}°` : 'Draw the curve, then slide the line onto its lowest point.'}</span>
      </div>
      {!readOnly && line && (
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[12px]">
          <span className="self-center text-muted-foreground">Move the line:</span>
          {[0.1, -0.1, 1, -1].map((dy) => (
            <Button key={dy} size="sm" variant="outline" onClick={() => shift(dy)} aria-label={`${dy > 0 ? 'Raise' : 'Lower'} the line ${Math.abs(dy)}°`}>
              {dy > 0 ? '↑' : '↓'} {Math.abs(dy)}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
