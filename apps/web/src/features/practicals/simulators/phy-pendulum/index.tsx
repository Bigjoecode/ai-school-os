import { PENDULUM_MEAN_ZONE, PENDULUM_OSCILLATIONS, PENDULUM_THREAD_MAX, PENDULUM_THREAD_MIN, type PendulumRow, type PendulumTaskId, type PhyPendulumState, type PhyPendulumVariant } from '@aischool/shared';
import { Lightbulb, Pause, Play, RotateCcw, Ruler, Timer, Wind } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AnswerRow, Cell, PhyGraph, Step, TaskCard, numericPoints } from '../phy-common';
import type { SimulatorProps } from '../types';
import { pendulumHint, swingAngle, usePendulum } from './actions';

/** The task as the paper sets it (2D task card and the 3D lab's task card). */
export function PendulumTaskText({ v }: { v: PhyPendulumVariant }) {
  return (
    <>
      <p>You are provided with a simple pendulum hanging from a split cork on a retort stand, a metre rule and a stopwatch. The diameter of the bob is {v.bobDiameter.toFixed(1)} cm.</p>
      <ol className="list-[lower-roman] space-y-0.5 pl-6">
        <li>Adjust the thread so that its length to the top of the bob is {v.suggested[0]} cm. Record the effective length l (to the centre of the bob).</li>
        <li>Displace the bob slightly and release it. Time 20 complete oscillations; find the period T and T².</li>
        <li>Repeat for thread lengths of {v.suggested.slice(1).join(', ')} cm.</li>
        <li>Tabulate l, t, T and T². Plot T² against l and find the slope s of your graph.</li>
        <li>Hence find g = 4π²/s. State two precautions you took.</li>
      </ol>
    </>
  );
}

export default function PhyPendulumLab({ seed, mode, state, onChange, readOnly, startedAt }: SimulatorProps<'phy-pendulum'>) {
  const p = usePendulum({ seed, state, onChange, readOnly, startedAt });
  const { v, update, swing, watch, set, release, stopSwing, startWatch, stopWatch, resetWatch, record, removeRun } = p;
  const [now, setNow] = useState(() => performance.now());

  // Animate while the bob swings or the watch runs.
  useEffect(() => {
    if (!swing) return;
    let id = 0;
    const tick = () => {
      setNow(performance.now());
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [swing]);

  const theta = swingAngle(swing, now);
  const elapsed = p.elapsed(now);
  const counted = p.counted(now);
  const hint = pendulumHint;

  const fromMean = watch.start !== null && watch.phase <= PENDULUM_MEAN_ZONE;
  return (
    <div className="space-y-4">
      <TaskCard icon={<Ruler className="size-4 text-muted-foreground" aria-hidden />}>
        <PendulumTaskText v={v} />
      </TaskCard>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start [&>*]:min-w-0">
        <Card className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
              <Timer className="size-4 text-muted-foreground" aria-hidden /> Bench
            </h3>
            <Badge variant="outline">
              {state.runs.length} timing{state.runs.length === 1 ? '' : 's'}
            </Badge>
          </div>
          {!readOnly && mode === 'LAB' && (
            <p className="mb-3 flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[12.5px] text-info">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {hint(state, swing, watch)}
            </p>
          )}
          <div className="flex items-start justify-center gap-3">
            <PendulumSvg thread={swing?.thread ?? state.thread} radius={v.bobRadius} theta={theta} shielded={state.shielded} />
            <div className="flex min-w-[118px] flex-col items-center gap-2">
              <div className="w-full rounded-xl border border-border bg-card px-3 py-2 text-center" aria-live="off">
                <p className="text-[11px] text-muted-foreground">Stopwatch</p>
                <p className="font-mono text-2xl font-semibold tabular" aria-label={`Stopwatch reads ${elapsed.toFixed(2)} seconds`}>
                  {elapsed.toFixed(2)}
                </p>
                <p className="text-[11px] text-muted-foreground">s</p>
              </div>
              {mode === 'LAB' && swing && watch.start !== null && (
                <p className="text-center text-[11.5px] text-muted-foreground">
                  Oscillations: <span className="font-semibold text-foreground tabular">{counted}</span>
                </p>
              )}
              {watch.start !== null && (
                <p className={cn('text-center text-[11px]', fromMean ? 'text-success' : 'text-warning')}>{fromMean ? 'Started at the mean position' : 'Started away from the mean position'}</p>
              )}
            </div>
          </div>

          {!readOnly && (
            <div className="mt-4 space-y-3">
              <Step title="1. Set up">
                <label className="flex flex-wrap items-center gap-2 text-[12.5px]">
                  <span className="w-44 text-muted-foreground">Thread length to top of bob</span>
                  <Button size="icon-sm" variant="outline" onClick={() => set({ thread: Math.max(PENDULUM_THREAD_MIN, state.thread - 1) })} aria-label="Shorten by 1 cm">
                    −
                  </Button>
                  <input type="range" min={PENDULUM_THREAD_MIN} max={PENDULUM_THREAD_MAX} step={0.5} value={state.thread} onChange={(e) => set({ thread: Number(e.target.value) })} className="w-32 accent-[var(--brand)]" aria-label="Thread length (cm)" />
                  <Button size="icon-sm" variant="outline" onClick={() => set({ thread: Math.min(PENDULUM_THREAD_MAX, state.thread + 1) })} aria-label="Lengthen by 1 cm">
                    +
                  </Button>
                  <span className="tabular font-medium">{state.thread.toFixed(1)} cm</span>
                </label>
                <label className="flex flex-wrap items-center gap-2 text-[12.5px]">
                  <span className="w-44 text-muted-foreground">Angle of displacement</span>
                  <input type="range" min={2} max={40} step={1} value={state.amplitude} onChange={(e) => set({ amplitude: Number(e.target.value) })} className="w-40 accent-[var(--brand)]" aria-label="Angle of displacement (degrees)" />
                  <span className="tabular font-medium">{state.amplitude}°</span>
                </label>
                <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                  <span className="w-44 text-muted-foreground">Oscillations to time</span>
                  {PENDULUM_OSCILLATIONS.map((n) => (
                    <Button key={n} size="sm" variant={state.n === n ? 'brand' : 'outline'} onClick={() => set({ n })} aria-pressed={state.n === n}>
                      {n}
                    </Button>
                  ))}
                </div>
                <Button size="sm" variant={state.shielded ? 'outline' : 'secondary'} onClick={p.toggleWindow}>
                  <Wind /> {state.shielded ? 'Window closed (no draught)' : 'Window open: close it'}
                </Button>
              </Step>
              <Step title="2. Swing and time">
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={swing ? stopSwing : release}>
                    {swing ? 'Stop the bob' : 'Displace and release'}
                  </Button>
                  <Button size="sm" variant="brand" onClick={() => (watch.start === null ? startWatch() : stopWatch())} disabled={!swing || watch.stop !== null}>
                    {watch.start === null ? <Play /> : <Pause />} {watch.start === null ? 'Start stopwatch' : 'Stop stopwatch'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={resetWatch} disabled={watch.start === null}>
                    <RotateCcw /> Reset
                  </Button>
                </div>
                <Button size="sm" onClick={record} disabled={watch.stop === null || state.runs.length >= 16}>
                  Record this timing
                </Button>
              </Step>
            </div>
          )}
        </Card>

        <Notebook state={state} readOnly={readOnly} update={update} removeRun={removeRun} />
      </div>
    </div>
  );
}

/** Retort stand, split cork, metre rule, fiducial mark and the swinging bob. */
function PendulumSvg({ thread, radius, theta, shielded }: { thread: number; radius: number; theta: number; shielded: boolean }) {
  const px = 2.6; // per cm
  const top = 30;
  const cx = 110;
  const L = (thread + radius) * px;
  const a = (theta * Math.PI) / 180;
  const bx = cx + L * Math.sin(a);
  const by = top + L * Math.cos(a);
  const tx = cx + thread * px * Math.sin(a);
  const ty = top + thread * px * Math.cos(a);
  return (
    <svg viewBox="0 0 190 360" className="h-[320px] w-auto shrink-0 sm:h-[360px]" role="img" aria-label={`Pendulum, thread ${thread.toFixed(1)} cm, swinging ${Math.abs(theta).toFixed(0)} degrees from the vertical`}>
      <rect x="18" y="10" width="6" height="340" rx="2" className="fill-muted-foreground/30" />
      <rect x="8" y="346" width="120" height="8" rx="2" className="fill-muted-foreground/30" />
      <rect x="20" y="22" width="92" height="5" rx="2" className="fill-muted-foreground/45" />
      <rect x="104" y="18" width="12" height="14" rx="2" className="fill-amber-700/60" />
      {/* metre rule beside the thread */}
      <g>
        <rect x="150" y={top} width="16" height={110 * px} className="fill-amber-100/70 stroke-amber-700/50 dark:fill-amber-900/30" strokeWidth="0.6" />
        {Array.from({ length: 12 }, (_, i) => i * 10).map((cm) => (
          <g key={cm}>
            <line x1="150" x2="158" y1={top + cm * px} y2={top + cm * px} className="stroke-foreground/60" strokeWidth="0.6" />
            <text x="160" y={top + cm * px + 3} fontSize="6" className="fill-foreground/70">
              {cm}
            </text>
          </g>
        ))}
      </g>
      {/* fiducial mark at the rest position */}
      <line x1={cx} x2={cx} y1={top + L + radius * px + 4} y2={top + L + radius * px + 18} className="stroke-danger" strokeWidth="1.2" />
      <line x1={tx} y1={ty} x2={cx} y2={top} className="stroke-foreground/80" strokeWidth="0.8" />
      <circle cx={bx} cy={by} r={radius * px} className="fill-slate-500 stroke-slate-700" strokeWidth="0.8" />
      {!shielded && (
        <g className="stroke-sky-500/60" strokeWidth="1" fill="none">
          <path d="M150 300 q-10 -4 -20 0 t-20 0" />
          <path d="M160 312 q-10 -4 -20 0 t-20 0" />
        </g>
      )}
    </svg>
  );
}

export function Notebook({ state, readOnly, update, removeRun }: { state: PhyPendulumState; readOnly: boolean; update: (fn: (s: PhyPendulumState) => PhyPendulumState, log?: string) => void; removeRun: (i: number) => void }) {
  const setCell = (i: number, key: keyof PendulumRow, value: string) => update((s) => ({ ...s, table: s.table.map((row, k) => (k === i ? { ...row, [key]: value } : row)) }));
  const setAnswer = (id: PendulumTaskId, key: 'value' | 'unit', value: string) => update((s) => ({ ...s, answers: { ...s.answers, [id]: { ...s.answers[id], [key]: value } } }));
  const points = numericPoints(state.table.map((r) => [r.l, r.T2]));
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="mb-3 font-display text-[15px] font-semibold tracking-tight">Your record</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[360px] text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] text-muted-foreground">
              <th className="py-1 pr-1 font-medium">#</th>
              <th className="px-1 py-1 font-medium">l / cm</th>
              <th className="px-1 py-1 font-medium">t / s</th>
              <th className="px-1 py-1 font-medium">T / s</th>
              <th className="px-1 py-1 font-medium">T² / s²</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.runs.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3 text-muted-foreground">
                  A row appears each time you record a timing.
                </td>
              </tr>
            )}
            {state.runs.map((r, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-1.5 pr-1 text-[11.5px] text-muted-foreground">
                  {i + 1}
                  <span className="block">n={r.n}</span>
                </td>
                {(['l', 't', 'T', 'T2'] as const).map((k) => (
                  <td key={k} className="px-1 py-1.5">
                    <Cell value={state.table[i]?.[k] ?? ''} onChange={(x) => setCell(i, k, x)} readOnly={readOnly} label={`Timing ${i + 1} ${k === 'T2' ? 'T squared' : k}`} />
                  </td>
                ))}
                <td>
                  {!readOnly && (
                    <Button size="icon-sm" variant="ghost" onClick={() => removeRun(i)} aria-label={`Delete timing ${i + 1}`}>
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
        <p className="mb-2 text-[12.5px] font-semibold">Graph of T² against l</p>
        <PhyGraph points={points} line={state.line} onLine={(line) => update((s) => ({ ...s, line }))} readOnly={readOnly} xLabel="l / cm" yLabel="T² / s²" />
      </div>

      <div className="mt-5 space-y-3">
        <p className="text-[12.5px] font-semibold">Calculations</p>
        <AnswerRow id="slope" label="(i) Slope s of your graph" answer={state.answers.slope} onChange={(k, x) => setAnswer('slope', k, x)} readOnly={readOnly} unitHint="e.g. s² m⁻¹" />
        <AnswerRow id="g" label="(ii) g = 4π²/s" answer={state.answers.g} onChange={(k, x) => setAnswer('g', k, x)} readOnly={readOnly} unitHint="unit" />
      </div>
      <div className="mt-5">
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="pend-precautions">
          Two precautions you took
        </label>
        <Textarea id="pend-precautions" value={state.written.precautions} onChange={(e) => update((s) => ({ ...s, written: { precautions: e.target.value.slice(0, 2000) } }))} disabled={readOnly} rows={3} />
      </div>
    </Card>
  );
}
