import {
  SPRING_AMPS,
  SPRING_CARD,
  SPRING_MAX_LOAD,
  SPRING_MEAN_ZONE,
  SPRING_OSCILLATIONS,
  SPRING_RULE,
  SPRING_SMALL_AMP,
  SPRING_STEP,
  springReading,
  type HookeRow,
  type OscRow,
  type PhySpringState,
  type SpringAnswerId,
  type SpringTask,
} from '@aischool/shared';
import { Activity, Camera, Hand, Lightbulb, Minus, Pause, Play, Plus, RotateCcw, Save } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AnswerRow, Cell, PhyGraph, Step, TaskCard, numericPoints } from '../phy-common';
import type { SimulatorProps } from '../types';
import { loadName, motionOffset, springHint, useLive, useSpring, type Spring } from './actions';

/** The question paper for each task. */
export function SpringTaskText({ task }: { task: SpringTask | null }) {
  if (task === 'OSC')
    return (
      <>
        <p>You are provided with a spiral spring clamped to a retort stand, a 50 g mass hanger, 50 g slotted masses, a stopwatch and a fiducial pointer.</p>
        <ol className="list-[lower-roman] space-y-0.5 pl-6">
          <li>Hang a total mass m = 0.100 kg (the hanger and one slotted mass) on the spring. Set the fiducial pointer at the rest position of the hanger.</li>
          <li>Pull the hanger down about 1.5 cm and release it so that it oscillates vertically. Time 20 complete oscillations from the fiducial mark. Repeat and find the mean time t.</li>
          <li>Repeat for m = {SPRING_CARD.OSC.slice(1).map((g) => (g / 1000).toFixed(3)).join(', ')} kg.</li>
          <li>Tabulate m, t₁, t₂, t, T = t/20 and T². Plot T² against m and find the slope s.</li>
          <li>Hence find the spring constant k = 4π²/s. State two precautions.</li>
        </ol>
      </>
    );
  return (
    <>
      <p>You are provided with a spiral spring clamped to a retort stand, a vertical metre rule, a pointer, a 50 g mass hanger and 50 g slotted masses. Take g = 10 m s⁻².</p>
      <ol className="list-[lower-roman] space-y-0.5 pl-6">
        <li>With no load, read the pointer on the metre rule: R₀.</li>
        <li>Hang the mass hanger (m = 50 g) and read the pointer R when the spring is at rest. Add 50 g masses one at a time up to m = {Math.max(...SPRING_CARD.HOOKE)} g, reading R each time.</li>
        <li>Remove the masses one at a time, reading R again (unloading).</li>
        <li>Tabulate m, W = mg, R on loading and unloading, and the extension e = (mean R) − R₀.</li>
        <li>Plot e against W, find the slope and hence the spring constant k = 1/slope (in N m⁻¹). State two precautions.</li>
      </ol>
    </>
  );
}

const EYES = [
  // the pointer stands in front of the scale: from above it seems to point lower down the rule (a larger reading)
  { id: 'high', label: 'Above', shift: 0.25 },
  { id: 'level', label: 'Level', shift: 0 },
  { id: 'low', label: 'Below', shift: -0.25 },
] as const;

/** A magnified strip of the vertical metre rule around the pointer (read it to 0.1 cm); `shift` is the parallax of a badly placed eye (cm). */
export function PointerLoupe({ at, shift = 0 }: { at: number; shift?: number }) {
  const H = 220;
  const k = 26; // px per cm
  const centre = Math.round(at * 10) / 10;
  const Y = (cm: number) => H / 2 + (cm - centre) * k;
  const lo = Math.floor(centre) - 5;
  const ticks: number[] = [];
  for (let mm = lo * 10; mm <= (lo + 10) * 10; mm++) if (mm >= 0 && mm <= SPRING_RULE * 10) ticks.push(mm);
  const py = Y(at + shift);
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 150 ${H}`} className="h-[220px] w-[150px] rounded-lg border border-border bg-[#f3d98f]" role="img" aria-label="Close-up of the metre rule at the pointer: read it against the scale">
        {ticks.map((mm) => {
          const y = Y(mm / 10);
          const len = mm % 10 === 0 ? 34 : mm % 5 === 0 ? 24 : 15;
          return (
            <g key={mm}>
              <line x1={150 - len} x2={150} y1={y} y2={y} stroke="#1b1b1b" strokeWidth={mm % 10 === 0 ? 1.4 : 0.8} />
              {mm % 10 === 0 && (
                <text x={150 - 40} y={y + 4} textAnchor="end" fontSize="13" fontWeight="700" fill="#1b1b1b">
                  {mm / 10}
                </text>
              )}
            </g>
          );
        })}
        <path d={`M0 ${py - 3} L84 ${py - 0.8} L92 ${py} L84 ${py + 0.8} L0 ${py + 3} Z`} fill="#c62828" />
      </svg>
      <figcaption className="text-[11px] text-muted-foreground">The pointer against the rule (read the tip).</figcaption>
    </figure>
  );
}

/**
 * The spring from the front: the stand and clamp, the spring (coils that open
 * out as it stretches), the pointer over the vertical metre rule, the hanger
 * and its slotted masses, and (oscillations) the fiducial pointer at the rest
 * position. The lower end moves by the live motion.
 */
function SpringSvg({ s, o, now }: { s: PhySpringState; o: Spring; now: number }) {
  const k = 4.4;
  const top = 34;
  const Y = (cm: number) => top + cm * k;
  const hook = 20;
  const sx = 120;
  const rest = springReading(o.v, s.load, s.peak);
  const R = Math.min(SPRING_RULE + 4, rest + motionOffset(o.v, o.motionRef.current, now));
  const py = Y(R);
  const coils = 18;
  const pts: string[] = [`${sx},${hook}`, `${sx},${hook + 6}`];
  const len = py - 6 - (hook + 6);
  for (let i = 1; i < coils * 2; i++) pts.push(`${sx + (i % 2 ? -9 : 9)},${hook + 6 + (len * i) / (coils * 2)}`);
  pts.push(`${sx},${py - 6}`, `${sx},${py}`);
  const slotted = Math.max(0, s.load / SPRING_STEP - 1);
  const osc = s.task === 'OSC';
  return (
    <svg viewBox="0 0 260 500" className="mx-auto h-[min(500px,70vh)] w-auto touch-none select-none rounded-xl border border-border bg-gradient-to-b from-slate-50 to-slate-200 dark:from-slate-800 dark:to-slate-900" role="img" aria-label={`Spiral spring with ${loadName(s.load)}${osc ? '' : `; the pointer is near the ${Math.round(R)} cm mark`}`}>
      {/* stand and clamp */}
      <rect x={20} y={486} width={110} height={10} rx={2} className="fill-slate-600" />
      <rect x={34} y={8} width={6} height={480} className="fill-slate-400" />
      <rect x={30} y={12} width={sx - 26} height={6} className="fill-slate-500" />
      <rect x={sx - 6} y={10} width={12} height={10} className="fill-slate-700" />
      {/* metre rule (Hooke's law): 0 at the top */}
      {!osc && (
        <g>
          <rect x={150} y={top - 4} width={26} height={SPRING_RULE * k + 8} fill="#e9c46a" stroke="#8d6e3f" strokeWidth="0.8" />
          {Array.from({ length: SPRING_RULE + 1 }, (_, i) => i).map((cm) => (
            <line key={cm} x1={150} x2={150 + (cm % 10 === 0 ? 12 : cm % 5 === 0 ? 8 : 5)} y1={Y(cm)} y2={Y(cm)} stroke="#3e2f1c" strokeWidth={cm % 10 === 0 ? 1.1 : 0.5} />
          ))}
          {Array.from({ length: 11 }, (_, i) => i * 10).map((cm) => (
            <text key={cm} x={172} y={Y(cm) + 3} textAnchor="end" fontSize="8" fontWeight="700" fill="#3e2f1c">
              {cm}
            </text>
          ))}
        </g>
      )}
      {osc && s.load > 0 && (
        <g aria-label="Fiducial pointer at the rest position">
          {/* its tip level with the bottom of the hanger at rest */}
          <rect x={172} y={Y(rest) - 40} width={4} height={160} className="fill-slate-500" />
          <path d={`M172 ${Y(rest) + 24 + slotted * 4.5} l-30 -4 v8 Z`} fill="#c62828" />
        </g>
      )}
      <polyline points={pts.join(' ')} fill="none" stroke="#9aa4ad" strokeWidth="2.2" strokeLinejoin="round" />
      {/* pointer */}
      {!osc && <path d={`M${sx} ${py - 1.2} L149 ${py - 0.4} L149 ${py + 0.4} L${sx} ${py + 1.2} Z`} fill="#c62828" />}
      {/* hanger and masses */}
      {s.load > 0 && (
        <g>
          <path d={`M${sx} ${py} v6 m0 0 a3 3 0 1 1 -3 -3`} fill="none" stroke="#555" strokeWidth="1.5" />
          <line x1={sx} x2={sx} y1={py + 6} y2={py + 20 + slotted * 4.5} stroke="#666" strokeWidth="2.4" />
          {Array.from({ length: slotted }, (_, i) => (
            <rect key={i} x={sx - 13} y={py + 14 + i * 4.5} width={26} height={4} rx={1} fill={i % 2 ? '#9e9e9e' : '#b0b0b0'} stroke="#616161" strokeWidth="0.5" />
          ))}
          <rect x={sx - 14} y={py + 18 + slotted * 4.5} width={28} height={4} rx={1} fill="#757575" />
        </g>
      )}
    </svg>
  );
}

export default function PhySpringLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'phy-spring'>) {
  const o = useSpring({ seed, state, onChange, readOnly, startedAt, practicalId });
  const { v, task } = o;
  const live = !!o.motion || (o.watch.start !== null && o.watch.stop === null);
  useLive(live);
  const now = o.now();
  const [msg, setMsg] = useState<string | null>(null);
  const [eye, setEye] = useState<(typeof EYES)[number]['id']>('high');
  const shift = EYES.find((e) => e.id === eye)!.shift;
  const w = o.watch;
  const elapsed = o.elapsed(now);
  const fromRest = w.start !== null && w.phase <= SPRING_MEAN_ZONE;
  const say = (m: string | null) => setMsg(m);

  return (
    <div className="space-y-4">
      <TaskCard icon={<Activity className="size-4 text-muted-foreground" aria-hidden />}>
        <SpringTaskText task={state.task} />
        {!readOnly && state.readings.length === 0 && state.runs.length === 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(['HOOKE', 'OSC'] as const).map((t) => (
              <Button key={t} size="sm" variant={state.task === t ? 'brand' : 'outline'} onClick={() => o.chooseTask(t)} aria-pressed={state.task === t}>
                {t === 'HOOKE' ? 'Hooke’s law' : 'Oscillations of a loaded spring'}
              </Button>
            ))}
          </div>
        )}
      </TaskCard>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start [&>*]:min-w-0">
        <div className="space-y-4">
          <Card className="p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
                <Activity className="size-4 text-muted-foreground" aria-hidden /> The spring
              </h3>
              <Badge variant="outline">{loadName(state.load)}</Badge>
            </div>
            {!readOnly && mode === 'LAB' && state.task && (
              <p className="mb-3 flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[12.5px] text-info">
                <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {springHint(state, o.motionRef.current, w, v, now)}
              </p>
            )}
            {state.task ? (
              <div className="flex flex-wrap items-start justify-center gap-3">
                <SpringSvg s={state} o={o} now={now} />
                {task === 'OSC' ? (
                  <div className="flex min-w-[118px] flex-col items-center gap-2">
                    <div className="w-full rounded-xl border border-border bg-card px-3 py-2 text-center">
                      <p className="text-[11px] text-muted-foreground">Stopwatch</p>
                      <p className="font-mono text-2xl font-semibold tabular" aria-label={`Stopwatch reads ${elapsed.toFixed(2)} seconds`}>
                        {elapsed.toFixed(2)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">s</p>
                    </div>
                    {mode === 'LAB' && o.motion && w.start !== null && (
                      <p className="text-center text-[11.5px] text-muted-foreground">
                        Oscillations: <span className="font-semibold text-foreground tabular">{o.counted(now)}</span>
                      </p>
                    )}
                    {w.start !== null && <p className={cn('text-center text-[11px]', fromRest ? 'text-success' : 'text-warning')}>{fromRest ? 'Started at the fiducial mark' : 'Started away from the mark'}</p>}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex rounded-lg border border-border p-0.5" role="radiogroup" aria-label="Your eye">
                      {EYES.map((e) => (
                        <button key={e.id} type="button" role="radio" aria-checked={eye === e.id} onClick={() => setEye(e.id)} className={cn('rounded-md px-2 py-1 text-[12px]', eye === e.id ? 'bg-foreground text-background' : 'text-muted-foreground')}>
                          Eye {e.label.toLowerCase()}
                        </button>
                      ))}
                    </div>
                    <PointerLoupe at={o.pointerAt(now)} shift={shift} />
                    <p className="max-w-[150px] text-[11px] text-muted-foreground">Put your eye level with the pointer, or the reading is off (parallax).</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground">Choose the experiment above.</p>
            )}
            {state.task && !readOnly && (
              <div className="mt-4 space-y-3">
                <Step title="1. The load">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {state.load === 0 ? (
                      <Button size="sm" variant="outline" onClick={o.hangHanger}>
                        Hang the 50 g mass hanger
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={o.addMass} disabled={state.load >= SPRING_MAX_LOAD}>
                          <Plus /> Add 50 g
                        </Button>
                        <Button size="sm" variant="outline" onClick={state.load === SPRING_STEP ? o.removeHanger : o.removeMass}>
                          <Minus /> {state.load === SPRING_STEP ? 'Take the hanger off' : 'Take 50 g off'}
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="outline" onClick={o.steady} disabled={!o.motion}>
                      <Hand /> Steady the hanger
                    </Button>
                  </div>
                </Step>
                {task === 'HOOKE' ? (
                  <Step title="2. Read the pointer">
                    <Button size="sm" variant="brand" onClick={() => say(o.takeReading())}>
                      <Camera /> Take this reading
                    </Button>
                    <p className="text-[11.5px] text-muted-foreground">Write the reading in the table as you read it (the loupe shows the pointer against the scale).</p>
                  </Step>
                ) : (
                  <Step title="2. Oscillate and time">
                    <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                      <span className="text-muted-foreground">Pull down</span>
                      {SPRING_AMPS.map((a) => (
                        <Button key={a} size="sm" variant={state.amp === a ? 'brand' : 'outline'} onClick={() => o.setAmp(a)} aria-pressed={state.amp === a}>
                          {a} cm
                        </Button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                      <span className="text-muted-foreground">Oscillations to time</span>
                      {SPRING_OSCILLATIONS.map((n) => (
                        <Button key={n} size="sm" variant={state.n === n ? 'brand' : 'outline'} onClick={() => o.setN(n)} aria-pressed={state.n === n}>
                          {n}
                        </Button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => say(o.release())} disabled={state.load === 0}>
                        Pull down {state.amp} cm and release
                      </Button>
                      <Button size="sm" variant="brand" onClick={() => (w.start === null ? o.startWatch() : o.stopWatch())} disabled={!o.motion?.released || w.stop !== null}>
                        {w.start === null ? <Play /> : <Pause />} {w.start === null ? 'Start stopwatch' : 'Stop stopwatch'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={o.resetWatch} disabled={w.start === null}>
                        <RotateCcw /> Reset
                      </Button>
                      <Button size="sm" onClick={o.record} disabled={w.stop === null}>
                        <Save /> Record this timing
                      </Button>
                    </div>
                    {state.amp > SPRING_SMALL_AMP && <p className="text-[11.5px] text-warning">That is a large displacement: the lesson says 1–2 cm.</p>}
                  </Step>
                )}
                {msg && <p className="text-[12px] text-warning">{msg}</p>}
              </div>
            )}
          </Card>
        </div>
        <Notebook task={task} state={state} readOnly={readOnly} update={o.update} removeRow={o.removeRow} removeRun={o.removeRun} />
      </div>
    </div>
  );
}

const HOOKE_HEAD: Record<keyof HookeRow, string> = { m: 'm / g', W: 'W / N', Rl: 'R loading / cm', Ru: 'R unloading / cm', e: 'e / cm' };
const OSC_HEAD: Record<keyof OscRow, string> = { m: 'm / kg', t1: 't₁ / s', t2: 't₂ / s', t: 't / s', T: 'T / s', T2: 'T² / s²' };

export function Notebook({ task, state, readOnly, update, removeRow, removeRun }: { task: SpringTask; state: PhySpringState; readOnly: boolean; update: Spring['update']; removeRow: (i: number) => void; removeRun: (i: number) => void }) {
  const setAnswer = (id: SpringAnswerId, key: 'value' | 'unit', value: string) => update((s) => ({ ...s, answers: { ...s.answers, [id]: { ...s.answers[id], [key]: value } } }));
  const osc = task === 'OSC';
  const cols = (osc ? Object.keys(OSC_HEAD) : Object.keys(HOOKE_HEAD)) as string[];
  const head = (osc ? OSC_HEAD : HOOKE_HEAD) as Record<string, string>;
  const rows = (osc ? state.osc : state.hooke) as unknown as Record<string, string>[];
  const setCell = (i: number, key: string, value: string) => update((s) => (osc ? { ...s, osc: s.osc.map((r, k) => (k === i ? { ...r, [key]: value } : r)) } : { ...s, hooke: s.hooke.map((r, k) => (k === i ? { ...r, [key]: value } : r)) }));
  const points = osc ? numericPoints(state.osc.map((r) => [r.m, r.T2])) : numericPoints(state.hooke.map((r) => [r.W, r.e]));
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="mb-3 font-display text-[15px] font-semibold tracking-tight">Your record</h3>
      {!osc && (
        <div className="mb-3">
          <AnswerRow id="r0" label="Pointer reading with no load, R₀" answer={state.answers.r0} onChange={(k, x) => setAnswer('r0', k, x)} readOnly={readOnly} unitHint="unit" />
        </div>
      )}
      {osc && state.runs.length > 0 && (
        <div className="mb-3 rounded-xl border border-border p-2 text-[12px]">
          <p className="mb-1 font-semibold">Stopwatch readings</p>
          <ul className="space-y-0.5">
            {state.runs.map((r, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="tabular">
                  {(r.load / 1000).toFixed(3)} kg · {r.n} oscillations · <span className="font-semibold">{r.elapsed.toFixed(2)} s</span>
                </span>
                {!readOnly && (
                  <Button size="icon-sm" variant="ghost" onClick={() => removeRun(i)} aria-label={`Delete timing ${i + 1}`}>
                    ×
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] text-muted-foreground">
              {cols.map((c) => (
                <th key={c} className="px-1 py-1 font-medium">
                  {head[c]}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {state.rows.length === 0 && (
              <tr>
                <td colSpan={cols.length + 1} className="py-3 text-muted-foreground">
                  {osc ? 'A row appears when you record the first timing for a mass.' : 'A row appears when you take the first reading for a load.'}
                </td>
              </tr>
            )}
            {state.rows.map((L, i) => (
              <tr key={i} className="border-t border-border">
                {cols.map((c) => (
                  <td key={c} className="px-1 py-1.5">
                    <Cell value={rows[i]?.[c] ?? ''} onChange={(x) => setCell(i, c, x)} readOnly={readOnly} label={`${osc ? 'Mass' : 'Load'} ${L} g: ${head[c]}`} />
                  </td>
                ))}
                <td>
                  {!readOnly && (
                    <Button size="icon-sm" variant="ghost" onClick={() => removeRow(i)} aria-label={`Delete row ${i + 1} and its ${osc ? 'timings' : 'readings'}`}>
                      ×
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11.5px] text-muted-foreground">
        {osc ? 'Times to 0.01 s as the stopwatch shows; t = (t₁ + t₂)/2, T = t/n, T² = T × T. m in kg.' : 'Readings to 0.1 cm; W = mg with m in kg; e = (mean of loading and unloading R) − R₀.'}
      </p>
      <div className="mt-5">
        <p className="mb-2 text-[12.5px] font-semibold">{osc ? 'Graph of T² against m' : 'Graph of e against W'}</p>
        <PhyGraph points={points} line={state.line} onLine={(line) => update((s) => ({ ...s, line }))} readOnly={readOnly} xLabel={osc ? 'm / kg' : 'W / N'} yLabel={osc ? 'T² / s²' : 'e / cm'} />
      </div>
      <div className="mt-5 space-y-3">
        <p className="text-[12.5px] font-semibold">Calculations</p>
        <AnswerRow id="slope" label={osc ? '(i) Slope s of the graph of T² against m' : '(i) Slope of the graph of e against W'} answer={state.answers.slope} onChange={(k, x) => setAnswer('slope', k, x)} readOnly={readOnly} unitHint="unit" />
        <AnswerRow id="k" label={osc ? '(ii) Spring constant k = 4π²/s' : '(ii) Spring constant k = 1/slope'} answer={state.answers.k} onChange={(k, x) => setAnswer('k', k, x)} readOnly={readOnly} unitHint="unit" />
      </div>
      <div className="mt-5">
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="spring-precautions">
          Two precautions you took
        </label>
        <Textarea id="spring-precautions" value={state.written.precautions} onChange={(e) => update((s) => ({ ...s, written: { precautions: e.target.value.slice(0, 2000) } }))} disabled={readOnly} rows={3} />
      </div>
    </Card>
  );
}

