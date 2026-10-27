import {
  GLASS_ANGLE_MAX,
  GLASS_ANGLE_MIN,
  GLASS_BLOCK_LEFT,
  GLASS_BLOCK_RIGHT,
  GLASS_SHEET,
  glassConstruction,
  glassImage,
  glassIncidentPoint,
  phyToDeg,
  phyToRad,
  type GlassPoint,
  type GlassRow,
  type GlassTaskId,
  type GlassTrace,
  type PhyGlassState,
  type PhyGlassVariant,
} from '@aischool/shared';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Eye, Lightbulb, MapPin, Square } from 'lucide-react';
import { useRef, useState } from 'react';
import { EYE_Y, PIN_LABEL, maxS, nextAngle, useGlass, type PinId } from './actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AnswerRow, Cell, PhyGraph, Step, TaskCard, numericPoints } from '../phy-common';
import type { SimulatorProps } from '../types';

export function hint(t: GlassTrace | null, done: number): string {
  if (!t) return done >= 5 ? 'Fill in the table, plot sin i against sin r and work out n.' : 'Choose an angle of incidence and start a new trace (a fresh outline of the block).';
  if (!t.normal) return 'Draw the normal at O, the point of incidence on face AB.';
  if (t.p1 === null || t.p2 === null) return 'Stick P₁ and P₂ on the incident ray (tap on the ray), well apart.';
  if (!t.p3 || !t.p4) return 'Look through face CD: move your eye until the images of P₁ and P₂ are one behind the other, then stick P₃ and P₄ (tap below CD) so they hide behind the images.';
  return 'Check in the eye view that all four pins line up (nudge P₃/P₄ if not), then remove the block and join the points.';
}

export default function PhyGlassLab({ seed, mode, state, onChange, readOnly, startedAt }: SimulatorProps<'phy-glass-block'>) {
  const g = useGlass({ seed, state, onChange, readOnly, startedAt });
  const { v, update } = g;
  const [nextI, setNextI] = useState(20);
  const [tool, setTool] = useState<PinId | null>(null);
  const [eyeX, setEyeX] = useState(3);
  const [msg, setMsg] = useState<string | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const openIndex = state.traces.findIndex((t) => !t.joined);
  const open = openIndex >= 0 ? state.traces[openIndex]! : null;
  const shownIndex = viewing !== null && viewing < state.traces.length ? viewing : openIndex >= 0 ? openIndex : state.traces.length - 1;
  const shown = shownIndex >= 0 ? state.traces[shownIndex]! : null;
  const editable = !readOnly && !!open && shownIndex === openIndex;
  const done = state.traces.filter((t) => t.joined).length;

  const newTrace = () => {
    setViewing(null);
    setTool(null);
    g.newTrace(nextI);
    setNextI((x) => nextAngle(x));
  };
  const removeTrace = (k: number) => {
    setViewing(null);
    g.removeTrace(k);
  };
  const placeAt = (p: GlassPoint) => {
    if (!editable || !open || !tool) return;
    setMsg(null);
    const err = g.placePin(tool, p);
    if (err) return setMsg(err);
    if (tool === 'p1' || tool === 'p2') setTool(tool === 'p1' && open.p2 === null ? 'p2' : null);
    else setTool(tool === 'p3' && !open.p4 ? 'p4' : null);
  };
  const nudge = g.nudge;
  const [nudgePin, setNudgePin] = useState<'p3' | 'p4'>('p3');

  return (
    <div className="space-y-4">
      <TaskCard icon={<Square className="size-4 text-muted-foreground" aria-hidden />}>
        <p>You are provided with a rectangular glass block, a drawing board with paper, four optical pins and a protractor.</p>
        <ol className="list-[lower-roman] space-y-0.5 pl-6">
          <li>Trace the outline ABCD of the block. Draw the normal at O on AB and a line making an angle i = 20° with the normal. Fix pins P₁ and P₂ on this line.</li>
          <li>With the block in place, look through face CD and fix P₃ and P₄ in line with the images of P₁ and P₂.</li>
          <li>Remove the block. Join P₃P₄ to meet CD at E, join OE and measure the angle of refraction r.</li>
          <li>Repeat for i = 30°, 40°, 50°, 60° and 70°. Tabulate i, r, sin i and sin r.</li>
          <li>Plot sin i against sin r, find the slope and hence the refractive index n of the glass. State two precautions.</li>
        </ol>
      </TaskCard>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-start [&>*]:min-w-0">
        <div className="space-y-4">
          <Card className="p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
                <MapPin className="size-4 text-muted-foreground" aria-hidden /> Drawing board
              </h3>
              <Badge variant="outline">
                {done} trace{done === 1 ? '' : 's'} done{open ? ` · i = ${open.i}° in progress` : ''}
              </Badge>
            </div>
            {!readOnly && mode === 'LAB' && (
              <p className="mb-3 flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[12.5px] text-info">
                <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {hint(open, done)}
              </p>
            )}
            {state.traces.length > 1 && (
              <div className="mb-2 flex flex-wrap gap-1" role="tablist" aria-label="Traces">
                {state.traces.map((t, k) => (
                  <Button key={k} size="sm" variant={k === shownIndex ? 'secondary' : 'ghost'} onClick={() => setViewing(k)} role="tab" aria-selected={k === shownIndex}>
                    {t.i}°{!t.joined && ' …'}
                  </Button>
                ))}
              </div>
            )}
            <Board v={v} trace={shown} tool={editable ? tool : null} onPlace={placeAt} eyeX={editable ? eyeX : null} onDrag={editable ? g.dragPin : undefined} />
            {msg && <p className="mt-2 text-[12.5px] text-warning">{msg}</p>}

            {!readOnly && (
              <div className="mt-4 space-y-3">
                {!open ? (
                  <Step title="New trace">
                    <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                      <span className="text-muted-foreground">Angle of incidence i</span>
                      <Button size="icon-sm" variant="outline" onClick={() => setNextI((x) => Math.max(GLASS_ANGLE_MIN, x - 5))} aria-label="Decrease by 5°">
                        −
                      </Button>
                      <span className="w-10 text-center font-medium tabular">{nextI}°</span>
                      <Button size="icon-sm" variant="outline" onClick={() => setNextI((x) => Math.min(GLASS_ANGLE_MAX, x + 5))} aria-label="Increase by 5°">
                        +
                      </Button>
                      <Button size="sm" variant="brand" onClick={newTrace} disabled={state.traces.length >= 10}>
                        Trace the block and draw the ray
                      </Button>
                    </div>
                  </Step>
                ) : (
                  <>
                    <Step title={`1. On the paper (i = ${open.i}°)`}>
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant={open.normal ? 'secondary' : 'outline'} onClick={g.drawNormal} disabled={open.normal}>
                          {open.normal ? 'Normal drawn' : 'Draw the normal at O'}
                        </Button>
                        {(['p1', 'p2'] as const).map((p) => (
                          <Button key={p} size="sm" variant={tool === p ? 'brand' : 'outline'} onClick={() => setTool(tool === p ? null : p)} aria-pressed={tool === p}>
                            {open[p] === null ? `Stick ${PIN_LABEL[p]}` : `Move ${PIN_LABEL[p]}`}
                          </Button>
                        ))}
                      </div>
                      {open.p1 !== null && open.p2 !== null && <p className="text-[11.5px] text-muted-foreground">P₁P₂ = {Math.abs(open.p1 - open.p2).toFixed(1)} cm apart.</p>}
                    </Step>
                    <Step title="2. Look through face CD">
                      <label className="flex flex-wrap items-center gap-2 text-[12.5px]">
                        <Eye className="size-4 text-muted-foreground" aria-hidden />
                        <span className="text-muted-foreground">Move your eye</span>
                        <input type="range" min={GLASS_SHEET.left} max={GLASS_SHEET.right} step={0.05} value={eyeX} onChange={(e) => setEyeX(Number(e.target.value))} className="w-48 accent-[var(--brand)]" aria-label="Eye position along the bottom of the board" />
                      </label>
                      <EyeView v={v} trace={open} eyeX={eyeX} />
                      <div className="flex flex-wrap gap-1.5">
                        {(['p3', 'p4'] as const).map((p) => (
                          <Button key={p} size="sm" variant={tool === p ? 'brand' : 'outline'} onClick={() => setTool(tool === p ? null : p)} aria-pressed={tool === p} disabled={open.p1 === null || open.p2 === null}>
                            {open[p] ? `Move ${PIN_LABEL[p]}` : `Stick ${PIN_LABEL[p]}`}
                          </Button>
                        ))}
                      </div>
                      {(open.p3 || open.p4) && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                          <span className="text-muted-foreground">Nudge</span>
                          {(['p3', 'p4'] as const).map((p) => (
                            <Button key={p} size="sm" variant={nudgePin === p ? 'secondary' : 'ghost'} onClick={() => setNudgePin(p)} disabled={!open[p]} aria-pressed={nudgePin === p}>
                              {PIN_LABEL[p]}
                            </Button>
                          ))}
                          <Button size="icon-sm" variant="outline" onClick={() => nudge(nudgePin, -0.05, 0)} aria-label="Nudge left">
                            <ArrowLeft />
                          </Button>
                          <Button size="icon-sm" variant="outline" onClick={() => nudge(nudgePin, 0.05, 0)} aria-label="Nudge right">
                            <ArrowRight />
                          </Button>
                          <Button size="icon-sm" variant="outline" onClick={() => nudge(nudgePin, 0, 0.1)} aria-label="Nudge up">
                            <ArrowUp />
                          </Button>
                          <Button size="icon-sm" variant="outline" onClick={() => nudge(nudgePin, 0, -0.1)} aria-label="Nudge down">
                            <ArrowDown />
                          </Button>
                          {open.p3 && open.p4 && <span className="text-muted-foreground">P₃P₄ = {Math.hypot(open.p3.x - open.p4.x, open.p3.y - open.p4.y).toFixed(1)} cm</span>}
                        </div>
                      )}
                    </Step>
                    <Step title="3. Construct">
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" onClick={g.join} disabled={!open.p1 || !open.p2 || !open.p3 || !open.p4}>
                          Remove the block and join the points
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeTrace(openIndex)}>
                          Discard this trace
                        </Button>
                      </div>
                    </Step>
                  </>
                )}
              </div>
            )}
          </Card>
          {shown?.joined && (
            <Card className="p-4 sm:p-5">
              <h3 className="mb-2 font-display text-[15px] font-semibold tracking-tight">Protractor (close-up at O)</h3>
              <Protractor v={v} trace={shown} />
              <p className="mt-2 text-[11.5px] text-muted-foreground">Measure r from the normal to the refracted ray OE, to the nearest degree.</p>
            </Card>
          )}
        </div>
        <Notebook state={state} readOnly={readOnly} update={update} removeTrace={removeTrace} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the board

const svgPt = (p: GlassPoint) => ({ x: p.x, y: -p.y });

function Board({ v, trace, tool, onPlace, eyeX, onDrag }: { v: PhyGlassVariant; trace: GlassTrace | null; tool: PinId | null; onPlace: (p: GlassPoint) => void; eyeX: number | null; onDrag?: (pin: 'p3' | 'p4', p: GlassPoint) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<'p3' | 'p4' | null>(null);
  const S = GLASS_SHEET;
  const toCm = (cx: number, cy: number): GlassPoint | null => {
    const ctm = svg.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(cx, cy).matrixTransform(ctm.inverse());
    return { x: p.x, y: -p.y };
  };
  const t = v.thickness;
  const incEnd = trace ? glassIncidentPoint(trace.i, maxS(trace.i)) : null;
  const pins: { id: PinId; p: GlassPoint }[] = [];
  if (trace?.p1 != null) pins.push({ id: 'p1', p: glassIncidentPoint(trace.i, trace.p1) });
  if (trace?.p2 != null) pins.push({ id: 'p2', p: glassIncidentPoint(trace.i, trace.p2) });
  if (trace?.p3) pins.push({ id: 'p3', p: trace.p3 });
  if (trace?.p4) pins.push({ id: 'p4', p: trace.p4 });
  const built = trace?.joined ? glassConstruction(v, trace.p3, trace.p4) : null;
  const far = trace?.p3 && trace.p4 ? (Math.abs(trace.p3.y) > Math.abs(trace.p4.y) ? trace.p3 : trace.p4) : null;
  return (
    <svg
      ref={svg}
      viewBox={`${S.left} ${-S.top} ${S.right - S.left} ${S.top - S.bottom}`}
      className={cn('w-full max-h-[560px] touch-none select-none rounded-xl border border-border bg-white dark:bg-neutral-100', tool && 'cursor-crosshair')}
      role="img"
      aria-label={trace ? `Drawing board: block outline, incident ray at ${trace.i} degrees${trace.joined ? ', block removed and points joined' : ''}` : 'Drawing board with paper'}
      onPointerDown={(e) => {
        if (!tool) return;
        const p = toCm(e.clientX, e.clientY);
        if (p) onPlace(p);
      }}
      onPointerMove={(e) => {
        if (!drag || !onDrag) return;
        const p = toCm(e.clientX, e.clientY);
        if (p) onDrag(drag, p);
      }}
      onPointerUp={() => setDrag(null)}
      onPointerLeave={() => setDrag(null)}
    >
      {/* faint grid of the paper */}
      {Array.from({ length: S.right - S.left + 1 }, (_, k) => S.left + k).map((x) => (
        <line key={`gx${x}`} x1={x} x2={x} y1={-S.top} y2={-S.bottom} stroke="#dbe6f2" strokeWidth="0.02" />
      ))}
      {Array.from({ length: S.top - S.bottom + 1 }, (_, k) => S.bottom + k).map((y) => (
        <line key={`gy${y}`} x1={S.left} x2={S.right} y1={-y} y2={-y} stroke="#dbe6f2" strokeWidth="0.02" />
      ))}
      {trace && (
        <>
          {/* block (in place) or its traced outline */}
          <rect x={GLASS_BLOCK_LEFT} y={0} width={GLASS_BLOCK_RIGHT - GLASS_BLOCK_LEFT} height={t} fill={trace.joined ? 'none' : '#bfe3ee'} fillOpacity={trace.joined ? 0 : 0.55} stroke="#334155" strokeWidth="0.05" />
          <text x={GLASS_BLOCK_LEFT - 0.6} y={-0.2} fontSize="0.6" fill="#334155">A</text>
          <text x={GLASS_BLOCK_RIGHT + 0.2} y={-0.2} fontSize="0.6" fill="#334155">B</text>
          <text x={GLASS_BLOCK_RIGHT + 0.2} y={t + 0.6} fontSize="0.6" fill="#334155">C</text>
          <text x={GLASS_BLOCK_LEFT - 0.6} y={t + 0.6} fontSize="0.6" fill="#334155">D</text>
          {/* normal and incident ray */}
          {trace.normal && <line x1={0} x2={0} y1={-6} y2={t + 3} stroke="#475569" strokeWidth="0.04" strokeDasharray="0.3 0.2" />}
          <circle cx={0} cy={0} r={0.08} fill="#0f172a" />
          <text x={0.2} y={-0.25} fontSize="0.55" fill="#0f172a">O</text>
          {incEnd && <line x1={0} y1={0} x2={svgPt(incEnd).x} y2={svgPt(incEnd).y} stroke="#0f172a" strokeWidth="0.05" />}
          {/* the construction */}
          {built && far && (
            <>
              <line x1={far.x} y1={-far.y} x2={built.exit.x} y2={-built.exit.y} stroke="#0f172a" strokeWidth="0.05" />
              <line x1={0} y1={0} x2={built.exit.x} y2={-built.exit.y} stroke="#b91c1c" strokeWidth="0.06" />
              <text x={built.exit.x + 0.2} y={-built.exit.y + 0.6} fontSize="0.55" fill="#0f172a">E</text>
            </>
          )}
          {/* pins */}
          {pins.map(({ id, p }) => (
            <g key={id}>
              <circle
                cx={p.x}
                cy={-p.y}
                r={0.18}
                fill={id === 'p3' || id === 'p4' ? '#1d4ed8' : '#0f172a'}
                className={cn(onDrag && (id === 'p3' || id === 'p4') && 'cursor-grab')}
                onPointerDown={(e) => {
                  if (!onDrag || (id !== 'p3' && id !== 'p4') || tool) return;
                  e.stopPropagation();
                  svg.current?.setPointerCapture?.(e.pointerId);
                  setDrag(id);
                }}
              />
              {onDrag && (id === 'p3' || id === 'p4') && <circle cx={p.x} cy={-p.y} r={0.6} fill="transparent" onPointerDown={(e) => { if (tool) return; e.stopPropagation(); svg.current?.setPointerCapture?.(e.pointerId); setDrag(id); }} />}
              <text x={p.x + 0.3} y={-p.y + 0.2} fontSize="0.6" fill="#0f172a">
                {PIN_LABEL[id]}
              </text>
            </g>
          ))}
          {/* the eye */}
          {eyeX !== null && !trace.joined && (
            <g>
              <ellipse cx={eyeX} cy={-EYE_Y} rx={0.45} ry={0.25} fill="none" stroke="#0f172a" strokeWidth="0.05" />
              <circle cx={eyeX} cy={-EYE_Y} r={0.12} fill="#0f172a" />
            </g>
          )}
        </>
      )}
      {!trace && (
        <text x={(S.left + S.right) / 2} y={0} textAnchor="middle" fontSize="0.8" fill="#64748b">
          Start a trace to place the block on the paper.
        </text>
      )}
    </svg>
  );
}

/** What the eye sees looking back through face CD: pins as vertical lines at their angular positions. */
export function EyeView({ v, trace, eyeX }: { v: PhyGlassVariant; trace: GlassTrace; eyeX: number }) {
  const W = 320;
  const H = 90;
  const eye = { x: eyeX, y: EYE_Y };
  const angleOf = (q: GlassPoint) => phyToDeg(Math.atan2(q.x - eye.x, q.y - eye.y));
  const throughBlock = (q: GlassPoint) => {
    const k = (-v.thickness - eye.y) / (q.y - eye.y);
    const x = eye.x + (q.x - eye.x) * k;
    return x >= GLASS_BLOCK_LEFT && x <= GLASS_BLOCK_RIGHT;
  };
  const items: { id: string; a: number; image: boolean; dist: number }[] = [];
  for (const id of ['p1', 'p2'] as const) {
    const s = trace[id];
    if (s === null) continue;
    const q = glassImage(v, trace.i, s);
    if (throughBlock(q)) items.push({ id, a: angleOf(q), image: true, dist: Math.hypot(q.x - eye.x, q.y - eye.y) });
  }
  for (const id of ['p3', 'p4'] as const) {
    const q = trace[id];
    if (q) items.push({ id, a: angleOf(q), image: false, dist: Math.hypot(q.x - eye.x, q.y - eye.y) });
  }
  const imgs = items.filter((x) => x.image);
  const centre = imgs.length ? imgs.reduce((t, x) => t + x.a, 0) / imgs.length : items.length ? items[0]!.a : 0;
  const k = 28; // px per degree
  const X = (a: number) => W / 2 + (a - centre) * k;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg border border-border bg-gradient-to-b from-sky-100 to-slate-100 dark:from-sky-950 dark:to-slate-900" role="img" aria-label={`Eye view through face CD: ${imgs.length} image${imgs.length === 1 ? '' : 's'} of P₁, P₂ visible`}>
        <rect x={0} y={0} width={W} height={46} fill="#9fd3e6" opacity="0.35" />
        {items.map((it) => {
          const x = X(it.a);
          if (x < -10 || x > W + 10) return null;
          const w = Math.max(1.5, Math.min(7, 40 / it.dist));
          return (
            <g key={it.id}>
              <rect x={x - w / 2} y={it.image ? 6 : 26} width={w} height={it.image ? 40 : 60} fill={it.image ? '#334155' : '#1d4ed8'} opacity={it.image ? 0.75 : 0.9} />
              <text x={x} y={it.image ? 5 : H - 2} textAnchor="middle" fontSize="8" className="fill-foreground">
                {PIN_LABEL[it.id as PinId]}
                {it.image ? "'" : ''}
              </text>
            </g>
          );
        })}
        {!imgs.length && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="9" className="fill-muted-foreground">
            {trace.p1 === null || trace.p2 === null ? 'Stick P₁ and P₂ first.' : 'You cannot see the images from here: move your eye.'}
          </text>
        )}
      </svg>
      <p className="mt-1 text-[11px] text-muted-foreground">Images of P₁ and P₂ seen through the glass (top) and your pins P₃, P₄ (blue). Line up the bases, one exactly behind another.</p>
    </div>
  );
}

/** A large protractor centred on O with the normal (0°) pointing into the block and the refracted ray OE. */
export function Protractor({ v, trace }: { v: PhyGlassVariant; trace: GlassTrace }) {
  const built = glassConstruction(v, trace.p3, trace.p4);
  const W = 320;
  const H = 180;
  const cx = W / 2;
  const cy = 10;
  const R = 160;
  const pt = (a: number, r: number) => ({ x: cx + r * Math.sin(phyToRad(a)), y: cy + r * Math.cos(phyToRad(a)) });
  const ray = built ? pt(built.r, R + 6) : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl border border-border bg-card" role="img" aria-label="Protractor centred on O: read the angle between the normal and the refracted ray">
      {Array.from({ length: 121 }, (_, k) => k - 60).map((a) => {
        const major = a % 10 === 0;
        const mid = a % 5 === 0;
        const p = pt(a, R);
        const q = pt(a, R - (major ? 14 : mid ? 9 : 5));
        return (
          <g key={a}>
            <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} className="stroke-foreground/80" strokeWidth={major ? 1 : 0.6} />
            {major && (
              <text x={pt(a, R - 24).x} y={pt(a, R - 24).y + 3} textAnchor="middle" fontSize="8" className="fill-foreground">
                {Math.abs(a)}
              </text>
            )}
          </g>
        );
      })}
      <line x1={cx} y1={cy} x2={cx} y2={cy + R + 6} className="stroke-muted-foreground" strokeDasharray="4 3" strokeWidth="0.8" />
      {ray && <line x1={cx} y1={cy} x2={ray.x} y2={ray.y} stroke="#b91c1c" strokeWidth="1.2" />}
      <circle cx={cx} cy={cy} r="2.5" className="fill-foreground" />
      <text x={cx + 6} y={cy + 4} fontSize="9" className="fill-foreground">
        O
      </text>
    </svg>
  );
}

export function Notebook({ state, readOnly, update, removeTrace }: { state: PhyGlassState; readOnly: boolean; update: (fn: (s: PhyGlassState) => PhyGlassState, log?: string) => void; removeTrace: (k: number) => void }) {
  const setCell = (i: number, key: keyof GlassRow, value: string) => update((s) => ({ ...s, table: s.table.map((row, k) => (k === i ? { ...row, [key]: value } : row)) }));
  const setAnswer = (id: GlassTaskId, key: 'value' | 'unit', value: string) => update((s) => ({ ...s, answers: { ...s.answers, [id]: { ...s.answers[id], [key]: value } } }));
  const points = numericPoints(state.table.map((r) => [r.sinr, r.sini]));
  const head: Record<keyof GlassRow, string> = { i: 'i / °', r: 'r / °', sini: 'sin i', sinr: 'sin r' };
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="mb-3 font-display text-[15px] font-semibold tracking-tight">Your record</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[340px] text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] text-muted-foreground">
              <th className="py-1 pr-1 font-medium">#</th>
              {(Object.keys(head) as (keyof GlassRow)[]).map((k) => (
                <th key={k} className="px-1 py-1 font-medium">
                  {head[k]}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {state.traces.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3 text-muted-foreground">
                  A row appears for each trace.
                </td>
              </tr>
            )}
            {state.traces.map((t, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-1.5 pr-1 text-[11.5px] text-muted-foreground">{i + 1}</td>
                {(Object.keys(head) as (keyof GlassRow)[]).map((k) => (
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
      <div className="mt-5">
        <p className="mb-2 text-[12.5px] font-semibold">Graph of sin i against sin r</p>
        <PhyGraph points={points} line={state.line} onLine={(line) => update((s) => ({ ...s, line }))} readOnly={readOnly} xLabel="sin r" yLabel="sin i" />
      </div>
      <div className="mt-5 space-y-3">
        <p className="text-[12.5px] font-semibold">Calculations</p>
        <AnswerRow id="slope" label="(i) Slope of your graph" answer={state.answers.slope} onChange={(k, x) => setAnswer('slope', k, x)} readOnly={readOnly} unitHint="unit" noUnit />
        <AnswerRow id="n" label="(ii) Refractive index n of the glass" answer={state.answers.n} onChange={(k, x) => setAnswer('n', k, x)} readOnly={readOnly} unitHint="unit" noUnit />
      </div>
      <div className="mt-5">
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="glass-precautions">
          Two precautions you took
        </label>
        <Textarea id="glass-precautions" value={state.written.precautions} onChange={(e) => update((s) => ({ ...s, written: { precautions: e.target.value.slice(0, 2000) } }))} disabled={readOnly} rows={3} />
      </div>
    </Card>
  );
}
