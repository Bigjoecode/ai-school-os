import { MOMENTS_CARD_X, MOMENTS_EDGE_H, MOMENTS_HANG, MOMENTS_RULE, type MomentsAnswerId, type MomentsRow, type MomentsTask, type PhyMomentsState } from '@aischool/shared';
import { Camera, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Eye, Hand, Lightbulb, Scale, Weight } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AnswerRow, Cell, PhyGraph, Step, TaskCard, numericPoints } from '../phy-common';
import type { SimulatorProps } from '../types';
import { KNOWN_NAME, loadOf, momentsHint, readyToRead, useMoments, useTilt, type LoopId, type Moments } from './actions';

/** The question paper for each task. */
export function MomentsTaskText({ task }: { task: MomentsTask | null }) {
  if (task === 'MASS')
    return (
      <>
        <p>You are provided with a metre rule, a knife edge, a 100 g mass and thread.</p>
        <ol className="list-[lower-roman] space-y-0.5 pl-6">
          <li>Balance the metre rule alone on the knife edge and record the balance point G (its centre of gravity).</li>
          <li>Hang the 100 g mass with a thread loop at the {MOMENTS_CARD_X.MASS[0]!.toFixed(1)} cm mark. Slide the rule over the knife edge until it balances horizontally and record the balance point P.</li>
          <li>Repeat with the mass at the {MOMENTS_CARD_X.MASS.slice(1).map((x) => x.toFixed(1)).join(', ')} cm marks.</li>
          <li>Tabulate x, P, d₁ = P − x and d₂ = G − P. Calculate M = 100 d₁/d₂ for each row and the mean.</li>
          <li>Plot d₁ against d₂, find the slope and hence the mass M of the rule (M = 100 g × slope). State two precautions.</li>
        </ol>
      </>
    );
  return (
    <>
      <p>You are provided with a metre rule, a knife edge, a 50 g mass, an unknown mass M and thread.</p>
      <ol className="list-[lower-roman] space-y-0.5 pl-6">
        <li>Balance the metre rule alone on the knife edge and record the balance point G. Keep the knife edge at G.</li>
        <li>Hang the 50 g mass with a thread loop at the {MOMENTS_CARD_X.MOMENTS[0]!.toFixed(1)} cm mark (d₁ = G − 26.0 cm).</li>
        <li>Hang M on the other side and slide it until the rule balances horizontally. Record its mark and d₂, its distance from G.</li>
        <li>Repeat with the 50 g at the {MOMENTS_CARD_X.MOMENTS.slice(1).map((x) => x.toFixed(1)).join(', ')} cm marks. Calculate M = 50 d₁/d₂ for each row and the mean.</li>
        <li>Plot d₁ against d₂, find the slope and hence M (M = 50 g × slope). State two precautions.</li>
      </ol>
    </>
  );
}

/** A magnified strip of the metre rule around a mark (read it to 0.1 cm); `shift` is the parallax error of a badly placed eye (cm). */
export function RuleLoupe({ at, label, shift = 0 }: { at: number; label: string; shift?: number }) {
  const W = 320;
  const k = 40; // px per cm
  const centre = Math.round(at * 10) / 10;
  const lo = Math.floor(centre) - 4;
  const X = (x: number) => W / 2 + (x - centre) * k;
  const ticks: number[] = [];
  for (let mm = lo * 10; mm <= (lo + 9) * 10; mm++) if (mm >= 0 && mm <= MOMENTS_RULE * 10) ticks.push(mm);
  const idx = X(at + shift);
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${W} 70`} className="w-full max-w-[320px] rounded-lg border border-border bg-[#f3d98f]" role="img" aria-label={`Metre rule close-up at the ${label}: read it against the scale`}>
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
        {label === 'knife edge' ? <path d={`M${idx} 44 L${idx - 12} 70 L${idx + 12} 70 Z`} fill="#6d4c41" /> : <rect x={idx - 1.6} y={0} width={3.2} height={70} fill="#f8f8f8" stroke="#555" strokeWidth="0.6" />}
      </svg>
      <figcaption className="text-[11px] text-muted-foreground">{label === 'knife edge' ? 'The knife edge under the rule' : `The ${label}’s thread loop`} (read its centre line).</figcaption>
    </figure>
  );
}

/**
 * The rule on the knife edge from the side, tilting as the physics says. The
 * knife edge moves along the drawing with the pivot mark (the rule stays put
 * on the page); the reference pins at both ends mark where its ends are when
 * level. Drag a thread loop or the rule along, or use the buttons.
 */
function BalanceSvg({ task, s, th, onDrag }: { task: MomentsTask; s: PhyMomentsState; th: number; onDrag?: (what: 'pivot' | LoopId, cm: number) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<null | 'pivot' | LoopId>(null);
  const k = 10;
  const X0 = 80;
  const edgeY = 150;
  const benchY = edgeY + MOMENTS_EDGE_H * k;
  const px = X0 + s.pivot * k;
  const toCm = (cx: number) => {
    const ctm = svg.current?.getScreenCTM();
    if (!ctm) return null;
    return (new DOMPoint(cx, 0).matrixTransform(ctm.inverse()).x - X0) / k;
  };
  const deg = (th * 180) / Math.PI;
  const c = Math.cos(th);
  const sn = Math.sin(th);
  /** A point on the rule's top face at a mark, after the tilt. */
  const onRule = (cm: number) => ({ x: px + (cm - s.pivot) * k * c, y: edgeY - 6 + (cm - s.pivot) * k * sn });
  const mass = (id: LoopId, at: number | null) => {
    if (at === null) return null;
    const p = onRule(at);
    const top = p.y + 6;
    const big = id === 'known' && task === 'MASS';
    return (
      <g
        key={id}
        className={cn(onDrag && 'cursor-ew-resize')}
        onPointerDown={(e) => {
          if (!onDrag) return;
          (e.currentTarget.ownerSVGElement ?? e.currentTarget).setPointerCapture?.(e.pointerId);
          setDrag(id);
        }}
      >
        <rect x={p.x - 16} y={p.y - 10} width={32} height={90} fill="transparent" />
        <ellipse cx={p.x} cy={p.y + 3} rx={2.2} ry={5} fill="none" stroke="#f5f5f5" strokeWidth="1.6" />
        <line x1={p.x} x2={p.x} y1={top} y2={top + MOMENTS_HANG.thread * k} stroke="#f5f5f5" strokeWidth="1.4" />
        {id === 'known' ? (
          <g>
            <rect x={p.x - (big ? 11 : 9)} y={top + MOMENTS_HANG.thread * k} width={big ? 22 : 18} height={MOMENTS_HANG.body * k} rx={3} fill="#9e9e9e" stroke="#616161" />
            <text x={p.x} y={top + MOMENTS_HANG.thread * k + 24} textAnchor="middle" fontSize="10" fontWeight="700" fill="#212121">
              {big ? '100g' : '50g'}
            </text>
          </g>
        ) : (
          <g>
            <rect x={p.x - 10} y={top + MOMENTS_HANG.thread * k + 4} width={20} height={MOMENTS_HANG.body * k - 4} rx={8} fill="#8d6e63" stroke="#5d4037" />
            <text x={p.x} y={top + MOMENTS_HANG.thread * k + 25} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
              M
            </text>
          </g>
        )}
      </g>
    );
  };
  return (
    <svg
      ref={svg}
      viewBox="0 0 1160 270"
      className="w-full touch-none select-none rounded-xl border border-border bg-gradient-to-b from-slate-50 to-slate-200 dark:from-slate-800 dark:to-slate-900"
      role="img"
      aria-label={`Metre rule on a knife edge, seen from the side${Math.abs(deg) < 0.2 ? ': level' : deg > 0 ? ': the right-hand end is down' : ': the left-hand end is down'}`}
      onPointerMove={(e) => {
        if (!drag || !onDrag) return;
        const x = toCm(e.clientX);
        if (x !== null) onDrag(drag, x);
      }}
      onPointerUp={() => setDrag(null)}
      onPointerLeave={() => setDrag(null)}
    >
      {/* the bench */}
      <rect x={0} y={benchY} width={1160} height={20} className="fill-amber-900/30" />
      {/* the reference pins at the level height of each end */}
      {[X0 - 14, X0 + MOMENTS_RULE * k + 14].map((x) => (
        <g key={x}>
          <rect x={x - 3} y={edgeY - 40} width={6} height={benchY - edgeY + 40} fill="#78909c" />
          <path d={`M${x + (x < 500 ? 3 : -3)} ${edgeY - 3} l${x < 500 ? 14 : -14} -4 v8 Z`} fill="#c62828" />
          <line x1={x} x2={x + (x < 500 ? 18 : -18)} y1={edgeY - 3} y2={edgeY - 3} stroke="#c62828" strokeWidth="0.8" strokeDasharray="2 2" />
        </g>
      ))}
      {/* the knife edge on its block */}
      <g
        className={cn(onDrag && 'cursor-ew-resize')}
        onPointerDown={(e) => {
          if (!onDrag) return;
          (e.currentTarget.ownerSVGElement ?? e.currentTarget).setPointerCapture?.(e.pointerId);
          setDrag('pivot');
        }}
      >
        <rect x={px - 30} y={edgeY + 40} width={60} height={benchY - edgeY - 40} fill="#8d6e63" stroke="#5d4037" />
        <path d={`M${px} ${edgeY} L${px - 22} ${edgeY + 40} L${px + 22} ${edgeY + 40} Z`} fill="#a1887f" stroke="#5d4037" />
      </g>
      {/* the rule, tilted about the knife edge */}
      <g transform={`rotate(${deg} ${px} ${edgeY})`}>
        <rect x={X0} y={edgeY - 6} width={MOMENTS_RULE * k} height={6} fill="#e9c46a" stroke="#8d6e3f" strokeWidth="0.8" />
        {Array.from({ length: 101 }, (_, i) => i).map((cm) => (
          <line key={cm} x1={X0 + cm * k} x2={X0 + cm * k} y1={edgeY - 6} y2={edgeY - (cm % 10 === 0 ? 1 : cm % 5 === 0 ? 3 : 4.5)} stroke="#3e2f1c" strokeWidth={cm % 10 === 0 ? 1.2 : 0.6} />
        ))}
        {Array.from({ length: 11 }, (_, i) => i * 10).map((cm) => (
          <text key={cm} x={X0 + cm * k} y={edgeY - 10} textAnchor="middle" fontSize="11" className="fill-foreground">
            {cm}
          </text>
        ))}
      </g>
      {mass('known', s.known)}
      {task === 'MOMENTS' && mass('other', s.other)}
    </svg>
  );
}

function Nudge({ onClick, label, icon }: { onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <Button size="icon-sm" variant="outline" onClick={onClick} aria-label={label}>
      {icon}
    </Button>
  );
}
function Nudges({ name, move }: { name: string; move: (d: number) => void }) {
  return (
    <>
      <Nudge onClick={() => move(-1)} label={`${name} 1 cm left`} icon={<ChevronsLeft />} />
      <Nudge onClick={() => move(-0.1)} label={`${name} 1 mm left`} icon={<ChevronLeft />} />
      <Nudge onClick={() => move(0.1)} label={`${name} 1 mm right`} icon={<ChevronRight />} />
      <Nudge onClick={() => move(1)} label={`${name} 1 cm right`} icon={<ChevronsRight />} />
    </>
  );
}

const EYES = [
  { id: 'high', label: 'Above', shift: 0.2 },
  { id: 'level', label: 'Level', shift: 0 },
  { id: 'low', label: 'Below', shift: -0.2 },
] as const;

export default function PhyMomentsLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'phy-moments'>) {
  const o = useMoments({ seed, state, onChange, readOnly, startedAt, practicalId });
  const { v, task } = o;
  const tilt = useTilt(v, task, loadOf(state));
  const [msg, setMsg] = useState<string | null>(null);
  const [eye, setEye] = useState<(typeof EYES)[number]['id']>('high');
  const shift = EYES.find((e) => e.id === eye)!.shift;
  const full = state.readings.length >= 12;
  const onDrag = readOnly ? undefined : (what: 'pivot' | LoopId, cm: number) => (what === 'pivot' ? o.setPivot(cm) : o.setLoop(what, cm));

  return (
    <div className="space-y-4">
      <TaskCard icon={<Scale className="size-4 text-muted-foreground" aria-hidden />}>
        <MomentsTaskText task={state.task} />
        {!readOnly && state.readings.length === 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(['MOMENTS', 'MASS'] as const).map((t) => (
              <Button key={t} size="sm" variant={state.task === t ? 'brand' : 'outline'} onClick={() => o.chooseTask(t)} aria-pressed={state.task === t}>
                {t === 'MOMENTS' ? 'Principle of moments' : 'Mass of the rule'}
              </Button>
            ))}
          </div>
        )}
      </TaskCard>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-start [&>*]:min-w-0">
        <div className="space-y-4">
          <Card className="p-4 sm:p-5">
            <h3 className="mb-3 flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
              <Scale className="size-4 text-muted-foreground" aria-hidden /> The rule on the knife edge
            </h3>
            {!readOnly && mode === 'LAB' && (
              <p className="mb-3 flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[12.5px] text-info">
                <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {momentsHint(state)}
              </p>
            )}
            {state.task ? (
              <BalanceSvg task={task} s={state} th={tilt.th} onDrag={onDrag} />
            ) : (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground">Choose the experiment above.</p>
            )}
            <p className="mt-1 text-[11.5px] text-muted-foreground">Balanced: the rule stays level with the red reference marks when you let go. Each time you move something you steady the rule and release it level.</p>
            {state.task && !readOnly && (
              <div className="mt-4 space-y-3">
                <Step title="1. Balance the rule alone: G">
                  <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                    <span className="text-muted-foreground">Slide the rule over the edge</span>
                    <Nudges name="Knife edge" move={o.movePivot} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={tilt.release}>
                      <Hand /> Steady it and let go
                    </Button>
                    <Button size="sm" variant={state.g === null ? 'brand' : 'outline'} onClick={() => setMsg(o.recordG())}>
                      Record this balance point as G
                    </Button>
                    {state.g !== null && <span className="text-[12px] text-muted-foreground">G recorded ({state.g.toFixed(1)} cm).</span>}
                  </div>
                  {msg && <p className="text-[12px] text-warning">{msg}</p>}
                </Step>
                <Step title="2. Hang the masses">
                  {(['known', 'other'] as LoopId[])
                    .filter((id) => id === 'known' || task === 'MOMENTS')
                    .map((id) => {
                      const at = id === 'known' ? state.known : state.other;
                      const name = id === 'known' ? KNOWN_NAME[task] : 'Unknown mass M';
                      return (
                        <div key={id} className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                          <Weight className="size-3.5 text-muted-foreground" aria-hidden />
                          <span className="w-28 text-muted-foreground">{name}</span>
                          {at === null ? (
                            <Button size="sm" variant="outline" onClick={() => o.hang(id)}>
                              Hang it on a thread loop
                            </Button>
                          ) : (
                            <>
                              <Nudges name={name} move={(d) => o.moveLoop(id, d)} />
                              <Button size="sm" variant="ghost" onClick={() => o.unhang(id)}>
                                Take it off
                              </Button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  <Button size="sm" onClick={o.takeReading} disabled={full || !readyToRead(state)}>
                    <Camera /> Take this reading
                  </Button>
                </Step>
              </div>
            )}
          </Card>
          {state.task && (
            <Card className="p-4 sm:p-5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
                  <Eye className="size-4 text-muted-foreground" aria-hidden /> Reading the rule
                </h3>
                <div className="flex rounded-lg border border-border p-0.5" role="radiogroup" aria-label="Your eye">
                  {EYES.map((e) => (
                    <button key={e.id} type="button" role="radio" aria-checked={eye === e.id} onClick={() => setEye(e.id)} className={cn('rounded-md px-2 py-1 text-[12px]', eye === e.id ? 'bg-foreground text-background' : 'text-muted-foreground')}>
                      Eye {e.label.toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mb-2 text-[11.5px] text-muted-foreground">Put your eye level with the mark, straight in front of it, or the reading is off (parallax).</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <RuleLoupe at={state.pivot} label="knife edge" shift={shift} />
                {state.known !== null && <RuleLoupe at={state.known} label={KNOWN_NAME[task]} shift={shift} />}
                {task === 'MOMENTS' && state.other !== null && <RuleLoupe at={state.other} label="unknown mass" shift={shift} />}
              </div>
            </Card>
          )}
        </div>
        <Notebook task={task} state={state} readOnly={readOnly} update={o.update} removeReading={o.removeReading} />
      </div>
    </div>
  );
}

const HEADS: Record<MomentsTask, Record<keyof MomentsRow, string>> = {
  MOMENTS: { x1: '50 g at / cm', x2: 'M at / cm', d1: 'd₁ / cm', d2: 'd₂ / cm', m: 'M / g' },
  MASS: { x1: '100 g at x / cm', x2: 'P / cm', d1: 'd₁ / cm', d2: 'd₂ / cm', m: 'M / g' },
};

export function Notebook({ task, state, readOnly, update, removeReading }: { task: MomentsTask; state: PhyMomentsState; readOnly: boolean; update: Moments['update']; removeReading: (i: number) => void }) {
  const setCell = (i: number, key: keyof MomentsRow, value: string) => update((s) => ({ ...s, table: s.table.map((row, k) => (k === i ? { ...row, [key]: value } : row)) }));
  const setAnswer = (id: MomentsAnswerId, key: 'value' | 'unit', value: string) => update((s) => ({ ...s, answers: { ...s.answers, [id]: { ...s.answers[id], [key]: value } } }));
  const cols: (keyof MomentsRow)[] = ['x1', 'x2', 'd1', 'd2', 'm'];
  const head = HEADS[task];
  const points = numericPoints(state.table.map((r) => [r.d2, r.d1]));
  const m = task === 'MASS' ? 100 : 50;
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="mb-3 font-display text-[15px] font-semibold tracking-tight">Your record</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[400px] text-[13px]">
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
                <td colSpan={7} className="py-3 text-muted-foreground">
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
      <p className="mt-1 text-[11.5px] text-muted-foreground">
        {task === 'MASS' ? 'Distances from the pivot P: d₁ = P − x (the mass), d₂ = G − P (the rule’s weight).' : 'Distances from the pivot at G: d₁ = G − (50 g mark), d₂ = (M’s mark) − G.'} Marks and distances to 1 decimal place; M = {m} × d₁ ÷ d₂.
      </p>
      <div className="mt-5">
        <p className="mb-2 text-[12.5px] font-semibold">Graph of d₁ against d₂</p>
        <PhyGraph points={points} line={state.line} onLine={(line) => update((s) => ({ ...s, line }))} readOnly={readOnly} xLabel="d₂ / cm" yLabel="d₁ / cm" />
      </div>
      <div className="mt-5 space-y-3">
        <p className="text-[12.5px] font-semibold">Calculations</p>
        <AnswerRow id="g" label="(i) Balance point G of the rule alone" answer={state.answers.g} onChange={(k, x) => setAnswer('g', k, x)} readOnly={readOnly} unitHint="unit" />
        <AnswerRow id="slope" label="(ii) Slope of the graph of d₁ against d₂" answer={state.answers.slope} onChange={(k, x) => setAnswer('slope', k, x)} readOnly={readOnly} unitHint="unit" noUnit />
        <AnswerRow id="mass" label={`(iii) ${task === 'MASS' ? 'Mass of the rule' : 'The unknown mass'} M = ${m} g × slope`} answer={state.answers.mass} onChange={(k, x) => setAnswer('mass', k, x)} readOnly={readOnly} unitHint="unit" />
        <AnswerRow id="mean" label="(iv) Mean of M from the table" answer={state.answers.mean} onChange={(k, x) => setAnswer('mean', k, x)} readOnly={readOnly} unitHint="unit" />
      </div>
      <div className="mt-5">
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="moments-precautions">
          Two precautions you took
        </label>
        <Textarea id="moments-precautions" value={state.written.precautions} onChange={(e) => update((s) => ({ ...s, written: { precautions: e.target.value.slice(0, 2000) } }))} disabled={readOnly} rows={3} />
      </div>
    </Card>
  );
}
