import { OPTICS_CARD_U, OPTICS_RULE, phyFit, type OpticsAnswerId, type OpticsRow, type OpticsTask, type PhyGraphLine, type PhyOpticsState } from '@aischool/shared';
import { Camera, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Crosshair, Lightbulb, Minus, Plus, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AnswerRow, Cell, PhyGraph, Step, TaskCard, numericPoints } from '../phy-common';
import type { SimulatorProps } from '../types';
import { OPTIC_NAME, clampRough, opticsHint, useOptics, type Optics } from './actions';
import { drawScreen, objectView, SCREEN_CM, windowView, type ScreenView } from './image';

/** The question paper for each task. */
export function OpticsTaskText({ task }: { task: OpticsTask | null }) {
  if (task === 'MIRROR')
    return (
      <>
        <p>You are provided with a concave mirror in a holder, an illuminated object (a cross-wire in front of a lamp), a white screen and a metre rule.</p>
        <ol className="list-[lower-roman] space-y-0.5 pl-6">
          <li>Find a rough focal length of the mirror by focusing the image of a distant window on the screen.</li>
          <li>Stand the mirror at the 0 cm mark facing along the rule. Place the object at u = {OPTICS_CARD_U.MIRROR[0]!.toFixed(1)} cm, slightly off the axis, and line up the centres.</li>
          <li>Move the screen (beside the object) until a sharp image of the cross-wire is formed on it. Read the image distance v.</li>
          <li>Repeat for u = {OPTICS_CARD_U.MIRROR.slice(1).map((u) => u.toFixed(1)).join(', ')} cm. Tabulate u, v, 1/u and 1/v.</li>
          <li>Plot 1/v against 1/u. Find the intercepts on both axes and hence f = 1/intercept. State two precautions.</li>
        </ol>
      </>
    );
  return (
    <>
      <p>You are provided with a converging lens in a holder, an illuminated object (a cross-wire in front of a lamp), a white screen and a metre rule.</p>
      <ol className="list-[lower-roman] space-y-0.5 pl-6">
        <li>Find a rough focal length of the lens by focusing the image of a distant window on the screen.</li>
        <li>Stand the object at the 0 cm mark of the rule and place the lens at u = {OPTICS_CARD_U.LENS[0]!.toFixed(1)} cm. Line up the centres of the object, lens and screen.</li>
        <li>Move the screen until a sharp image of the cross-wire is formed on it. Read the image distance v.</li>
        <li>Repeat for u = {OPTICS_CARD_U.LENS.slice(1).map((u) => u.toFixed(1)).join(', ')} cm. Tabulate u, v, 1/u and 1/v.</li>
        <li>Plot 1/v against 1/u. Find the intercepts on both axes and hence f = 1/intercept. State two precautions.</li>
      </ol>
    </>
  );
}

/** The screen as a canvas, redrawn whenever what lands on it changes. */
export function ScreenCanvas({ view, label, className }: { view: ScreenView | null; label: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 360;
  const H = Math.round((W * SCREEN_CM.h) / SCREEN_CM.w);
  const key = JSON.stringify(view);
  useEffect(() => {
    const g = ref.current?.getContext('2d');
    if (g) drawScreen(g, W, H, view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <canvas ref={ref} width={W} height={H} className={cn('w-full max-w-[360px] rounded-lg border border-border', className)} role="img" aria-label={label} />;
}

/** A magnified strip of the metre rule around a holder's mark (read it to 0.1 cm). */
export function RuleLoupe({ at, label }: { at: number; label: string }) {
  const W = 320;
  const k = 40; // px per cm
  const lo = Math.floor(at) - 4;
  const X = (x: number) => W / 2 + (x - at) * k;
  const ticks: number[] = [];
  for (let mm = lo * 10; mm <= (lo + 9) * 10; mm++) if (mm >= 0 && mm <= OPTICS_RULE * 10) ticks.push(mm);
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${W} 64`} className="w-full max-w-[320px] rounded-lg border border-border bg-[#f3d98f]" role="img" aria-label={`Metre rule close-up at the ${label}: read the mark against the scale`}>
        {ticks.map((mm) => {
          const x = X(mm / 10);
          const len = mm % 10 === 0 ? 22 : mm % 5 === 0 ? 15 : 9;
          return (
            <g key={mm}>
              <line x1={x} x2={x} y1={0} y2={len} stroke="#1b1b1b" strokeWidth={mm % 10 === 0 ? 1.4 : 0.8} />
              {mm % 10 === 0 && (
                <text x={x} y={36} textAnchor="middle" fontSize="12" fontWeight="700" fill="#1b1b1b">
                  {mm / 10}
                </text>
              )}
            </g>
          );
        })}
        {/* the holder's base and its index mark */}
        <rect x={W / 2 - 26} y={40} width={52} height={24} fill="#37474f" opacity="0.85" />
        <path d={`M${W / 2} 4 L${W / 2 - 5} 40 L${W / 2 + 5} 40 Z`} fill="#c62828" />
      </svg>
      <figcaption className="text-[11px] text-muted-foreground">The {label}’s mark on the rule (read the red index line).</figcaption>
    </figure>
  );
}

/** The bench from the side: the metre rule and what stands on it (drag the screen, or use the buttons). */
function BenchSvg({ task, u, screen, rough, onScreen }: { task: OpticsTask; u: number; screen: number; rough: boolean; onScreen?: (x: number) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState(false);
  const L = 60;
  const k = 10;
  const X = (cm: number) => L + cm * k;
  const toCm = (cx: number) => {
    const ctm = svg.current?.getScreenCTM();
    if (!ctm) return null;
    return (new DOMPoint(cx, 0).matrixTransform(ctm.inverse()).x - L) / k;
  };
  const objectAt = task === 'LENS' ? 0 : u;
  const opticAt = task === 'LENS' ? u : 0;
  const stand = (x: number, top: number) => <rect x={x - 3} y={top} width={6} height={118 - top} fill="#78909c" />;
  return (
    <svg
      ref={svg}
      viewBox="0 0 1100 150"
      className="w-full touch-none select-none rounded-xl border border-border bg-gradient-to-b from-slate-50 to-slate-200 dark:from-slate-800 dark:to-slate-900"
      role="img"
      aria-label={`Optical bench from the side: ${task === 'LENS' ? `object at 0 cm, lens at ${u.toFixed(1)} cm` : `mirror at 0 cm, object at ${u.toFixed(1)} cm`}, screen further along`}
      onPointerMove={(e) => {
        if (!drag || !onScreen) return;
        const x = toCm(e.clientX);
        if (x !== null) onScreen(x);
      }}
      onPointerUp={() => setDrag(false)}
      onPointerLeave={() => setDrag(false)}
    >
      {/* the metre rule */}
      <rect x={X(0) - 8} y={118} width={OPTICS_RULE * k + 16} height={14} fill="#e9c46a" stroke="#8d6e3f" />
      {Array.from({ length: 101 }, (_, i) => i).map((cm) => (
        <line key={cm} x1={X(cm)} x2={X(cm)} y1={118} y2={cm % 10 === 0 ? 128 : cm % 5 === 0 ? 125 : 122} stroke="#3e2f1c" strokeWidth={cm % 10 === 0 ? 1.4 : 0.7} />
      ))}
      {Array.from({ length: 11 }, (_, i) => i * 10).map((cm) => (
        <text key={cm} x={X(cm)} y={145} textAnchor="middle" fontSize="11" fill="currentColor" className="fill-foreground">
          {cm}
        </text>
      ))}
      {/* the object: lamp box and cross-wire plate */}
      {!rough && (
        <g>
          <rect x={X(objectAt) - 40} y={44} width={36} height={44} rx={4} fill="#455a64" />
          <circle cx={X(objectAt) - 22} cy={66} r={9} fill="#ffe08a" opacity="0.9" />
          {stand(X(objectAt), 40)}
          <rect x={X(objectAt) - 4} y={40} width={8} height={52} fill="#263238" />
          <circle cx={X(objectAt)} cy={66} r={5} fill="#fff4c2" />
        </g>
      )}
      {/* the lens or the mirror */}
      {task === 'LENS' ? (
        <g>
          {stand(X(opticAt), 86)}
          <ellipse cx={X(opticAt)} cy={66} rx={5} ry={24} fill="#b3e5fc" stroke="#4f9cc6" strokeWidth="1.5" opacity="0.9" />
        </g>
      ) : (
        <g>
          {stand(X(opticAt), 86)}
          <path d={`M${X(opticAt) - 2} 40 Q${X(opticAt) + 10} 66 ${X(opticAt) - 2} 92`} fill="none" stroke="#90a4ae" strokeWidth="6" />
          <path d={`M${X(opticAt) + 2} 42 Q${X(opticAt) + 13} 66 ${X(opticAt) + 2} 90`} fill="none" stroke="#e3f2fd" strokeWidth="2" />
        </g>
      )}
      {/* the screen */}
      {!rough && (
        <g
          className={cn(onScreen && 'cursor-ew-resize')}
          onPointerDown={(e) => {
            if (!onScreen) return;
            (e.currentTarget.ownerSVGElement ?? e.currentTarget).setPointerCapture?.(e.pointerId);
            setDrag(true);
          }}
        >
          <rect x={X(screen) - 14} y={30} width={28} height={92} fill="transparent" />
          {stand(X(screen), 80)}
          <rect x={X(screen) - 3} y={36} width={6} height={56} fill="#fafafa" stroke="#9e9e9e" />
          {onScreen && <path d={`M${X(screen) - 12} 22 h24 M${X(screen) - 12} 22 l5 -4 M${X(screen) - 12} 22 l5 4 M${X(screen) + 12} 22 l-5 -4 M${X(screen) + 12} 22 l-5 4`} stroke="#64748b" strokeWidth="1.6" fill="none" />}
        </g>
      )}
      {rough && (
        <text x={550} y={30} textAnchor="middle" fontSize="13" className="fill-muted-foreground">
          Rough focus: the {task === 'LENS' ? 'lens is' : 'mirror is'} turned to the window; the lamp is off.
        </text>
      )}
    </svg>
  );
}

export default function PhyOpticsLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'phy-optics'>) {
  const o = useOptics({ seed, state, onChange, readOnly, startedAt, practicalId });
  const { v, task } = o;
  const [rough, setRough] = useState(false);
  const [roughS, setRoughS] = useState(25);
  const what = OPTIC_NAME[task];
  const view = rough ? windowView(v, task, roughS) : objectView(v, task, state.u, state.screen, state.aligned);
  const full = state.readings.length >= 12;

  return (
    <div className="space-y-4">
      <TaskCard icon={<Sun className="size-4 text-muted-foreground" aria-hidden />}>
        <OpticsTaskText task={state.task} />
        {!readOnly && state.readings.length === 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(['LENS', 'MIRROR'] as const).map((t) => (
              <Button key={t} size="sm" variant={state.task === t ? 'brand' : 'outline'} onClick={() => (o.chooseTask(t), setRough(false))} aria-pressed={state.task === t}>
                {t === 'LENS' ? 'Converging lens' : 'Concave mirror'}
              </Button>
            ))}
          </div>
        )}
      </TaskCard>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-start [&>*]:min-w-0">
        <div className="space-y-4">
          <Card className="p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
                <Crosshair className="size-4 text-muted-foreground" aria-hidden /> Optical bench
              </h3>
              <Badge variant={state.aligned ? 'success' : 'outline'}>{state.aligned ? 'Centres lined up' : 'Centres not lined up'}</Badge>
            </div>
            {!readOnly && mode === 'LAB' && (
              <p className="mb-3 flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[12.5px] text-info">
                <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {opticsHint(state, rough)}
              </p>
            )}
            {state.task ? (
              <BenchSvg task={task} u={state.u} screen={state.screen} rough={rough} onScreen={readOnly || rough ? undefined : o.setScreen} />
            ) : (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground">Choose the experiment above to set out the bench.</p>
            )}
            {state.task && !readOnly && (
              <div className="mt-4 space-y-3">
                <Step title="1. Rough focal length">
                  {!rough ? (
                    <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                      <Button size="sm" variant={state.rough === null ? 'brand' : 'outline'} onClick={() => setRough(true)}>
                        <Sun /> Point the {what} at the window
                      </Button>
                      {state.rough !== null && <span className="text-muted-foreground">Recorded: the window was sharp {state.rough.toFixed(1)} cm from the {what}.</span>}
                    </div>
                  ) : (
                    <div className="space-y-2 text-[12.5px]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-muted-foreground">Screen</span>
                        <Nudge onClick={() => setRoughS((x) => clampRough(x - 1))} label="Screen 1 cm nearer" icon={<ChevronsLeft />} />
                        <Nudge onClick={() => setRoughS((x) => clampRough(x - 0.1))} label="Screen 1 mm nearer" icon={<ChevronLeft />} />
                        <span className="w-28 text-center tabular">{roughS.toFixed(1)} cm from the {what}</span>
                        <Nudge onClick={() => setRoughS((x) => clampRough(x + 0.1))} label="Screen 1 mm further" icon={<ChevronRight />} />
                        <Nudge onClick={() => setRoughS((x) => clampRough(x + 1))} label="Screen 1 cm further" icon={<ChevronsRight />} />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant="brand" onClick={() => (o.recordRough(roughS), setRough(false))}>
                          Record this distance
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRough(false)}>
                          Back to the bench
                        </Button>
                      </div>
                    </div>
                  )}
                </Step>
                {!rough && (
                  <>
                    <Step title="2. Set up">
                      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                        <Button size="sm" variant={state.aligned ? 'secondary' : 'outline'} onClick={o.align} disabled={state.aligned}>
                          {state.aligned ? 'Centres lined up' : `Line up the centres${task === 'MIRROR' ? ' (object and screen side by side)' : ''}`}
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                        <span className="text-muted-foreground">{task === 'LENS' ? 'Lens at u =' : 'Object at u ='}</span>
                        <Nudge onClick={() => o.setU(state.u - 5)} label="u 5 cm less" icon={<ChevronsLeft />} />
                        <Nudge onClick={() => o.setU(state.u - 1)} label="u 1 cm less" icon={<Minus />} />
                        <span className="w-16 text-center font-medium tabular">{state.u.toFixed(1)} cm</span>
                        <Nudge onClick={() => o.setU(state.u + 1)} label="u 1 cm more" icon={<Plus />} />
                        <Nudge onClick={() => o.setU(state.u + 5)} label="u 5 cm more" icon={<ChevronsRight />} />
                      </div>
                    </Step>
                    <Step title="3. Find the sharpest image">
                      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                        <span className="text-muted-foreground">Screen</span>
                        <Nudge onClick={() => o.moveScreen(-1)} label="Screen 1 cm left" icon={<ChevronsLeft />} />
                        <Nudge onClick={() => o.moveScreen(-0.1)} label="Screen 1 mm left" icon={<ChevronLeft />} />
                        <Nudge onClick={() => o.moveScreen(0.1)} label="Screen 1 mm right" icon={<ChevronRight />} />
                        <Nudge onClick={() => o.moveScreen(1)} label="Screen 1 cm right" icon={<ChevronsRight />} />
                        <input type="range" min={0} max={OPTICS_RULE} step={0.1} value={state.screen} onChange={(e) => o.setScreen(Number(e.target.value))} className="w-40 accent-[var(--brand)]" aria-label="Screen position along the rule" />
                      </div>
                      <Button size="sm" onClick={o.takeReading} disabled={full}>
                        <Camera /> Take this reading
                      </Button>
                    </Step>
                  </>
                )}
              </div>
            )}
          </Card>
          {state.task && (
            <Card className="p-4 sm:p-5">
              <h3 className="mb-2 font-display text-[15px] font-semibold tracking-tight">{rough ? 'The screen, facing the window' : 'The screen'}</h3>
              <ScreenCanvas view={view} label={rough ? 'The screen held up to the window' : 'The image of the cross-wire on the screen'} />
              {!rough && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {task === 'LENS' && <RuleLoupe at={state.u} label="lens" />}
                  <RuleLoupe at={state.screen} label="screen" />
                </div>
              )}
            </Card>
          )}
        </div>
        <Notebook task={task} state={state} readOnly={readOnly} update={o.update} removeReading={o.removeReading} />
      </div>
    </div>
  );
}

function Nudge({ onClick, label, icon }: { onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <Button size="icon-sm" variant="outline" onClick={onClick} aria-label={label}>
      {icon}
    </Button>
  );
}

/** A straight line extended to meet both axes (null when it cannot: not sloping down). */
export function extendToAxes(line: PhyGraphLine | null): PhyGraphLine | null {
  if (!line || Math.abs(line.x2 - line.x1) < 1e-12) return null;
  const m = (line.y2 - line.y1) / (line.x2 - line.x1);
  if (m >= 0) return null;
  const y0 = line.y1 - m * line.x1;
  const x0 = -y0 / m;
  if (!(y0 > 0 && x0 > 0)) return null;
  return { x1: 0, y1: Number(y0.toPrecision(4)), x2: Number(x0.toPrecision(4)), y2: 0 };
}

export function Notebook({ task, state, readOnly, update, removeReading }: { task: OpticsTask; state: PhyOpticsState; readOnly: boolean; update: Optics['update']; removeReading: (i: number) => void }) {
  const setCell = (i: number, key: keyof OpticsRow, value: string) => update((s) => ({ ...s, table: s.table.map((row, k) => (k === i ? { ...row, [key]: value } : row)) }));
  const setAnswer = (id: OpticsAnswerId, key: 'value' | 'unit', value: string) => update((s) => ({ ...s, answers: { ...s.answers, [id]: { ...s.answers[id], [key]: value } } }));
  const cols: (keyof OpticsRow)[] = ['u', 'v', 'iu', 'iv'];
  const head: Record<keyof OpticsRow, string> = { u: 'u / cm', v: 'v / cm', iu: '1/u / cm⁻¹', iv: '1/v / cm⁻¹' };
  const points = numericPoints(state.table.map((r) => [r.iu, r.iv]));
  // Graph paper long enough for the line to reach both axes.
  const fit = phyFit(points);
  const reach = fit && fit.slope < 0 && fit.intercept > 0 ? Math.max(fit.intercept, -fit.intercept / fit.slope) * 1.12 : 0;
  const extent = points.length >= 2 ? { x: Math.max(reach, ...points.map((p) => p.x)), y: Math.max(reach, ...points.map((p) => p.y)) } : undefined;
  const extended = extendToAxes(state.line);
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="mb-3 font-display text-[15px] font-semibold tracking-tight">Your record</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[340px] text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] text-muted-foreground">
              <th className="py-1 pr-1 font-medium">#</th>
              {cols.map((c) => (
                <th key={c} className="px-1 py-1 font-medium">
                  {head[c]}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {state.readings.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3 text-muted-foreground">
                  A row appears each time you take a reading.
                </td>
              </tr>
            )}
            {state.readings.map((_, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-1.5 pr-1 text-[11.5px] text-muted-foreground">{i + 1}</td>
                {cols.map((c) => (
                  <td key={c} className="px-1 py-1.5">
                    <Cell value={state.table[i]?.[c] ?? ''} onChange={(x) => setCell(i, c, x)} readOnly={readOnly} label={`Reading ${i + 1} ${head[c]}`} />
                  </td>
                ))}
                <td>
                  {!readOnly && (
                    <Button size="icon-sm" variant="ghost" onClick={() => removeReading(i)} aria-label={`Delete reading ${i + 1}`}>
                      ×
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11.5px] text-muted-foreground">{task === 'LENS' ? 'v = screen reading − lens reading.' : 'The mirror is at 0 cm: v is the screen’s reading.'} u and v to 1 decimal place; 1/u and 1/v to 3 significant figures.</p>
      <div className="mt-5">
        <p className="mb-2 text-[12.5px] font-semibold">Graph of 1/v against 1/u</p>
        <PhyGraph points={points} line={state.line} onLine={(line) => update((s) => ({ ...s, line }))} readOnly={readOnly} xLabel="1/u / cm⁻¹" yLabel="1/v / cm⁻¹" extent={extent} />
        {!readOnly && state.line && (
          <Button size="sm" variant="outline" className="mt-2" onClick={() => extended && update((s) => ({ ...s, line: extended }))} disabled={!extended || (state.line.x1 === 0 && state.line.y2 === 0)}>
            Extend the line to both axes
          </Button>
        )}
      </div>
      <div className="mt-5 space-y-3">
        <p className="text-[12.5px] font-semibold">Calculations</p>
        <AnswerRow id="rough" label={`(i) Rough focal length (the window focused)`} answer={state.answers.rough} onChange={(k, x) => setAnswer('rough', k, x)} readOnly={readOnly} unitHint="unit" />
        <AnswerRow id="xint" label="(ii) Intercept on the 1/u axis" answer={state.answers.xint} onChange={(k, x) => setAnswer('xint', k, x)} readOnly={readOnly} unitHint="e.g. cm⁻¹" />
        <AnswerRow id="yint" label="(iii) Intercept on the 1/v axis" answer={state.answers.yint} onChange={(k, x) => setAnswer('yint', k, x)} readOnly={readOnly} unitHint="unit" />
        <AnswerRow id="f" label={`(iv) Focal length f = 1/intercept`} answer={state.answers.f} onChange={(k, x) => setAnswer('f', k, x)} readOnly={readOnly} unitHint="unit" />
      </div>
      <div className="mt-5">
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="optics-precautions">
          Two precautions you took
        </label>
        <Textarea id="optics-precautions" value={state.written.precautions} onChange={(e) => update((s) => ({ ...s, written: { precautions: e.target.value.slice(0, 2000) } }))} disabled={readOnly} rows={3} />
      </div>
    </Card>
  );
}
