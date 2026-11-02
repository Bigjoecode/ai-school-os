import {
  FORCES_CARD,
  FORCES_CARD_G,
  FRICTION_CARD,
  INCLINE_CARD,
  INCLINE_LEN,
  MECH_COLS,
  VISC_BALLS,
  VISC_OIL_BALL,
  VISC_RHO_GLY,
  VISC_RHO_OIL,
  VISC_RHO_STEEL,
  forceNominal,
  inclineReadings,
  viscReadings,
  type ForceThread,
  type MechAnswerId,
  type MechTask,
  type PhyMechanicsState,
} from '@aischool/shared';
import { Camera, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Hand, Lightbulb, Minus, Plus, RotateCcw, Ruler, Timer } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { MicrometerSvg, SpringScaleSvg } from '../phy-density/instruments';
import { AnswerRow, Cell, PhyGraph, Step, TaskCard, numericPoints } from '../phy-common';
import type { SimulatorProps } from '../types';
import { boardSheet, clockShows, lastPull, lastTilt, lastWeigh, mechHint, TASK_NAME, useMechanics, type Mechanics } from './actions';
import { AngleScale, BandRule, PaperSvg, StopClock } from './instruments';

/** The question paper for each task. */
export function MechTaskText({ task }: { task: MechTask | null }) {
  switch (task) {
    case 'FRICTION':
      return (
        <>
          <p>You are provided with a wooden block with a hook, a spring balance (0–10 N), a smooth plank, a protractor and six 100 g slotted masses.</p>
          <ol className="list-[lower-roman] space-y-0.5 pl-6">
            <li>Check the spring balance’s zero. Weigh the block with the balance: on a level plank its weight is the normal reaction R.</li>
            <li>Place the block on the level plank and pull it horizontally with the balance, increasing the pull slowly. Record the force F just as the block starts to move. Repeat and take the mean.</li>
            <li>Repeat with {FRICTION_CARD.slice(1).join(', ')} masses (100 g each) on the block, weighing the block and its load each time for R.</li>
            <li>Plot F against R and find the slope, μ.</li>
            <li>Remove the masses and slowly raise one end of the plank until the block just begins to slide. Measure θ (twice or more). Calculate μ = tan θ. State two precautions.</li>
          </ol>
        </>
      );
    case 'VISCOSITY':
      return (
        <>
          <p>You are provided with a tall measuring cylinder of glycerine, a second of palm oil, steel ball bearings of five sizes, a micrometer screw gauge, a metre rule, a stop-clock, two rubber bands and a magnet.</p>
          <ol className="list-[lower-roman] space-y-0.5 pl-6">
            <li>Place one rubber band about 8 cm below the surface of the glycerine and the other 20.0 cm below the first. Measure the distance between them.</li>
            <li>Measure the diameter d of a ball bearing with the micrometer.</li>
            <li>Release the ball gently at the centre of the surface and time its fall between the bands. Repeat and take the mean time t.</li>
            <li>Repeat for the other sizes. Tabulate d, r, r², t and v = distance ÷ t (in cm s⁻¹).</li>
            <li>Plot v against r² and find the slope. Calculate η = 2(ρs − ρl)g ÷ (9 × slope) with ρs = {VISC_RHO_STEEL} kg m⁻³, ρl = {VISC_RHO_GLY} kg m⁻³, g = 9.8 m s⁻² (the slope in SI units).</li>
            <li>Time the {VISC_BALLS[VISC_OIL_BALL]!.toFixed(1)} mm ball in the palm oil (ρ = {VISC_RHO_OIL} kg m⁻³) and calculate η(glycerine) ÷ η(oil) = v(oil) ÷ v(glycerine). State two precautions.</li>
          </ol>
        </>
      );
    case 'INCLINE':
      return (
        <>
          <p>You are provided with a grooved plank 2.00 m long, wooden blocks, a metre rule, a stop-clock, a stopping block and a steel ball.</p>
          <ol className="list-[lower-roman] space-y-0.5 pl-6">
            <li>Raise one end of the plank on three blocks and keep it so. Mark s = {INCLINE_CARD.map((x) => (x / 100).toFixed(2)).join(', ')} m from the start line.</li>
            <li>Place the stopping block at the first mark. Release the ball from rest at the start line and time it until it hits the block. Repeat three times.</li>
            <li>Repeat for the other distances. Tabulate s, t₁, t₂, t₃, the mean t and t².</li>
            <li>Plot s against t² and find the slope. Hence a = 2 × slope. State two precautions.</li>
          </ol>
        </>
      );
    case 'FORCES':
      return (
        <>
          <p>You are provided with a drawing board fixed vertically with two pulleys, three hangers with slotted masses (each hanger 50 g; pieces 50 g), thread with a knot, drawing paper, pins, a protractor and a ruler. Take g = {FORCES_CARD_G} N kg⁻¹.</p>
          <ol className="list-[lower-roman] space-y-0.5 pl-6">
            <li>
              Pass two threads over the pulleys and hang P = {forceNominal(FORCES_CARD.P)} g and Q = {forceNominal(FORCES_CARD.Q)} g; hang W = {forceNominal(FORCES_CARD.W)} g from the third thread.
            </li>
            <li>Let the knot settle at rest (tap the board) and mark the line of each thread with two pencil dots, well apart.</li>
            <li>Take off the paper and draw the lines through the dots to meet at O.</li>
            <li>Choose a scale (e.g. 0.5 N per cm). Mark OA = P and OB = Q to scale along their lines and complete the parallelogram OACB.</li>
            <li>Measure the diagonal OC and its angle with the line of W produced upwards. R = OC × scale. Compare R with W (percentage difference). State two precautions.</li>
          </ol>
        </>
      );
    default:
      return <p>Choose the experiment.</p>;
  }
}

/** A run of the apparatus (a pull, a tilt, a drop, a roll): its kind, when it started and how long it lasts (view only). */
export interface Run {
  kind: 'pull' | 'tilt' | 'drop' | 'roll' | 'weigh';
  at: number;
  ms: number;
}
export const RUN_MS = { pull: 3200, tilt: 3400, weigh: 900 };
/** How long a fall or roll takes on screen (ms): real time, or sped up for long falls. */
export const runMs = (seconds: number, lapse: number) => Math.max(600, ((seconds + 0.6) * 1000) / lapse);
function useRunning(run: Run | null) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const loop = () => {
      tick((n) => n + 1);
      if (performance.now() < run.at + run.ms) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [run]);
  if (!run) return { p: 1, busy: false };
  const p = Math.min(1, (performance.now() - run.at) / run.ms);
  return { p, busy: p < 1 };
}

function Nudges({ name, move, big = 1, small = 0.1 }: { name: string; move: (d: number) => void; big?: number; small?: number }) {
  return (
    <span className="inline-flex gap-1">
      <Button size="icon-sm" variant="outline" onClick={() => move(-big)} aria-label={`${name}: −${big}`}>
        <ChevronsLeft />
      </Button>
      <Button size="icon-sm" variant="outline" onClick={() => move(-small)} aria-label={`${name}: −${small}`}>
        <ChevronLeft />
      </Button>
      <Button size="icon-sm" variant="outline" onClick={() => move(small)} aria-label={`${name}: +${small}`}>
        <ChevronRight />
      </Button>
      <Button size="icon-sm" variant="outline" onClick={() => move(big)} aria-label={`${name}: +${big}`}>
        <ChevronsRight />
      </Button>
    </span>
  );
}
function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button size="sm" variant={on ? 'brand' : 'outline'} onClick={onClick} aria-pressed={on}>
      {children}
    </Button>
  );
}

// ------------------------------------------------------------------ 2D apparatus drawings

function FrictionSvg({ s, angle, pull }: { s: PhyMechanicsState; angle: number; pull: number }) {
  const a = (angle * Math.PI) / 180;
  const L = 520;
  const x0 = 40;
  const y0 = 200;
  const bx = 160 + pull * 60;
  const pt = (d: number, h: number) => ({ x: x0 + d * Math.cos(a) - h * Math.sin(a), y: y0 - d * Math.sin(a) - h * Math.cos(a) });
  const blk = [pt(bx, 0), pt(bx + 70, 0), pt(bx + 70, 40), pt(bx, 40)];
  return (
    <svg viewBox="0 0 640 230" className="w-full rounded-xl border border-border bg-gradient-to-b from-slate-50 to-slate-200 dark:from-slate-800 dark:to-slate-900" role="img" aria-label={`Wooden block on the plank${s.tilt ? `, the plank raised to ${Math.round(angle)}°` : ', level'}, ${s.load} masses on it`}>
      <rect x={0} y={y0 + 8} width={640} height={22} className="fill-amber-900/30" />
      <polygon points={[pt(0, 0), pt(L, 0), pt(L, -8), pt(0, -8)].map((p) => `${p.x},${p.y}`).join(' ')} fill={s.wiped ? '#c79a62' : '#d7c4a6'} stroke="#7a5a33" />
      <polygon points={blk.map((p) => `${p.x},${p.y}`).join(' ')} fill="#a0703f" stroke="#5d4037" />
      {Array.from({ length: s.load }, (_, k) => {
        const c = pt(bx + 35, 46 + k * 9);
        return <ellipse key={k} cx={c.x} cy={c.y} rx={22} ry={4.5} fill="#90a4ae" stroke="#546e7a" />;
      })}
      {!s.tilt && (
        <g>
          <line x1={blk[1]!.x} y1={blk[1]!.y - 20} x2={blk[1]!.x + 60} y2={blk[1]!.y - 20} stroke="#eee" strokeWidth={1.4} />
          <rect x={blk[1]!.x + 60} y={blk[1]!.y - 28} width={110} height={16} rx={6} fill="#cfd8dc" stroke="#607d8b" />
          <rect x={blk[1]!.x + 72 + pull * 40} y={blk[1]!.y - 25} width={6} height={10} fill="#c62828" />
        </g>
      )}
      {s.tilt && (
        <g>
          <rect x={x0 + L * Math.cos(a) - 10} y={y0 - L * Math.sin(a)} width={20} height={L * Math.sin(a) + 8} fill="#8d6e63" opacity={0.6} />
          <path d={`M${x0 + 90} ${y0} A90 90 0 0 0 ${x0 + 90 * Math.cos(a)} ${y0 - 90 * Math.sin(a)}`} fill="none" stroke="#1d4ed8" />
          <text x={x0 + 100} y={y0 - 12} fontSize="12" fill="#1d4ed8">
            θ
          </text>
        </g>
      )}
    </svg>
  );
}

function CylinderSvg({ s, y, liquid }: { s: PhyMechanicsState; y: number | null; liquid: 'glycerine' | 'oil' }) {
  const k = 11; // px per cm
  const top = 30;
  const X = 140;
  const w = 70;
  const Y = (cm: number) => top + cm * k;
  return (
    <svg viewBox="0 0 320 470" className="mx-auto w-full max-w-[300px] rounded-xl border border-border bg-gradient-to-b from-slate-50 to-slate-200 dark:from-slate-800 dark:to-slate-900" role="img" aria-label={`Cylinder of ${liquid}: bands at ${s.top} cm and ${s.bot} cm below the surface`}>
      <rect x={X} y={top - 18} width={w} height={40 * k} rx={4} fill="#ffffff" fillOpacity={0.35} stroke="#90a4ae" />
      <rect x={X + 2} y={top} width={w - 4} height={37 * k} fill={liquid === 'oil' ? '#e9b44c' : '#e8eef0'} fillOpacity={liquid === 'oil' ? 0.55 : 0.8} />
      {[s.top, s.bot].map((b, i) => (
        <rect key={i} x={X - 3} y={Y(b) - 2} width={w + 6} height={4} rx={2} fill="#c62828" />
      ))}
      {y !== null && <circle cx={X + w / 2 + (s.centre ? 0 : w / 2 - 14)} cy={Y(y)} r={4} fill="#5f6a72" />}
      <rect x={X + w + 14} y={top} width={16} height={36 * k} fill="#f1d68a" stroke="#9a7b2f" />
      {Array.from({ length: 37 }, (_, cm) => (
        <g key={cm}>
          <line x1={X + w + 14} x2={X + w + 14 + (cm % 5 === 0 ? 10 : 5)} y1={Y(cm)} y2={Y(cm)} stroke="#222" strokeWidth={cm % 5 === 0 ? 1 : 0.5} />
          {cm % 5 === 0 && (
            <text x={X + w + 34} y={Y(cm) + 4} fontSize="10" className="fill-foreground">
              {cm}
            </text>
          )}
        </g>
      ))}
      <text x={X + w / 2} y={top - 22} textAnchor="middle" fontSize="11" className="fill-foreground">
        {liquid === 'oil' ? 'Palm oil' : 'Glycerine'}
      </text>
    </svg>
  );
}

function InclineSvg({ s, x }: { s: PhyMechanicsState; x: number | null }) {
  const k = 3; // px per cm
  const a = Math.asin(Math.min(0.2, (s.blocks * 5) / INCLINE_LEN)) * 2.2; // exaggerated in the drawing
  const x0 = 20;
  const y0 = 150;
  const pt = (d: number, h: number) => ({ x: x0 + (INCLINE_LEN - d) * k * Math.cos(a) + h * Math.sin(a), y: y0 - (INCLINE_LEN - d) * k * Math.sin(a) - h * Math.cos(a) });
  const ball = x === null ? null : pt(x, 7);
  return (
    <svg viewBox="0 0 660 180" className="w-full rounded-xl border border-border bg-gradient-to-b from-slate-50 to-slate-200 dark:from-slate-800 dark:to-slate-900" role="img" aria-label={`Grooved plank on ${s.blocks} blocks; the stopping block at ${(s.stop / 100).toFixed(2)} m`}>
      <rect x={0} y={y0 + 4} width={660} height={22} className="fill-amber-900/30" />
      <polygon points={[pt(0, 0), pt(INCLINE_LEN, 0), pt(INCLINE_LEN, -6), pt(0, -6)].map((p) => `${p.x},${p.y}`).join(' ')} fill="#c79a62" stroke="#7a5a33" />
      {Array.from({ length: s.blocks }, (_, i) => {
        const p = pt(0, -6);
        return <rect key={i} x={p.x - 16} y={y0 - (i + 1) * ((p.y - y0) / -s.blocks || 0) - 2} width={30} height={(y0 - p.y) / Math.max(1, s.blocks)} fill="#8d6e63" stroke="#5d4037" />;
      })}
      {[0, ...INCLINE_CARD].map((m) => {
        const p = pt(m, 0);
        return <line key={m} x1={p.x} y1={p.y} x2={p.x - 3} y2={p.y - 9} stroke={m ? '#1d4ed8' : '#111'} strokeWidth={m ? 1.2 : 2} />;
      })}
      {(() => {
        const p = pt(s.stop, 0);
        return <rect x={p.x - 2} y={p.y - 16} width={8} height={16} fill="#455a64" transform={`rotate(${(-a * 180) / Math.PI} ${p.x} ${p.y})`} />;
      })()}
      {ball && <circle cx={ball.x} cy={ball.y} r={6} fill="#78909c" stroke="#455a64" />}
    </svg>
  );
}

// ------------------------------------------------------------------ the 2D lab

const THREADS: ForceThread[] = ['P', 'Q', 'W'];

export default function PhyMechanicsLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'phy-mechanics'>) {
  const o = useMechanics({ seed, state, onChange, readOnly, startedAt, practicalId });
  const { task } = o;
  const [run, setRun] = useState<Run | null>(null);
  const { p, busy } = useRunning(run);
  const [msg, setMsg] = useState<string | null>(null);
  const [lapse, setLapse] = useState(4);
  const start = (kind: Run['kind'], ms: number) => setRun({ kind, at: performance.now(), ms });
  const lab = !readOnly;
  return (
    <div className="space-y-4">
      <TaskCard icon={<Ruler className="size-4 text-muted-foreground" aria-hidden />}>
        <MechTaskText task={state.task} />
        {lab && state.log.filter((e) => !e.a.startsWith('task')).length === 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(['FRICTION', 'VISCOSITY', 'INCLINE', 'FORCES'] as const).map((t) => (
              <Button key={t} size="sm" variant={state.task === t ? 'brand' : 'outline'} onClick={() => o.chooseTask(t)} aria-pressed={state.task === t}>
                {TASK_NAME[t]}
              </Button>
            ))}
          </div>
        )}
      </TaskCard>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-start [&>*]:min-w-0">
        <Card className="space-y-3 p-4 sm:p-5">
          <h3 className="font-display text-[15px] font-semibold tracking-tight">{TASK_NAME[task]}</h3>
          {lab && mode === 'LAB' && (
            <p className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[12.5px] text-info">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {mechHint(state)}
            </p>
          )}
          {task === 'FRICTION' && <FrictionBench o={o} s={state} run={run} p={p} busy={busy} start={start} lab={lab} />}
          {task === 'VISCOSITY' && <ViscosityBench o={o} s={state} run={run} p={p} busy={busy} start={start} lab={lab} lapse={lapse} setLapse={setLapse} />}
          {task === 'INCLINE' && <InclineBench o={o} s={state} run={run} p={p} busy={busy} start={start} lab={lab} />}
          {task === 'FORCES' && <ForcesBench o={o} s={state} lab={lab} msg={msg} setMsg={setMsg} />}
        </Card>
        <Notebook task={task} state={state} readOnly={readOnly} o={o} />
      </div>
    </div>
  );
}

interface BenchProps {
  o: Mechanics;
  s: PhyMechanicsState;
  run: Run | null;
  p: number;
  busy: boolean;
  start: (kind: Run['kind'], ms: number) => void;
  lab: boolean;
}

function FrictionBench({ o, s, run, p, busy, start, lab }: BenchProps) {
  const v = o.v;
  const pull = lastPull(v, s);
  const w = lastWeigh(v, s);
  const tilt = lastTilt(v, s);
  const pulling = run?.kind === 'pull' && busy;
  const tilting = run?.kind === 'tilt' && busy;
  const angle = s.tilt ? (tilt === null ? 0 : tilting ? Math.min(tilt, (p / 0.8) * tilt) : tilt) : 0;
  const shown = pulling && pull ? (p < 0.75 ? (p / 0.75) * pull.limit : pull.sliding) : null;
  return (
    <>
      <FrictionSvg s={s} angle={angle} pull={pulling && p > 0.75 ? (p - 0.75) * 4 : 0} />
      {lab && (
        <div className="space-y-2">
          <Step title="1. The spring balance and the plank">
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant={s.zeroed ? 'outline' : 'brand'} onClick={o.zero}>
                Check and adjust the zero
              </Button>
              <Button size="sm" variant={s.wiped ? 'outline' : 'brand'} onClick={o.wipe}>
                Wipe the plank clean
              </Button>
              <Toggle on={s.tilt} onClick={() => o.setTilt(!s.tilt)}>
                {s.tilt ? 'Lower the plank flat' : 'Tilt mode: raise one end'}
              </Toggle>
            </div>
          </Step>
          <Step title="2. Load, weigh and pull">
            <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
              <span className="text-muted-foreground">Masses on the block: {s.load} × 100 g</span>
              <Button size="icon-sm" variant="outline" onClick={() => o.setLoad(s.load - 1)} aria-label="Take a mass off">
                <Minus />
              </Button>
              <Button size="icon-sm" variant="outline" onClick={() => o.setLoad(s.load + 1)} aria-label="Add a mass">
                <Plus />
              </Button>
              <Button size="sm" variant="outline" onClick={() => (o.weigh(), start('weigh', RUN_MS.weigh))}>
                Weigh the block and load
              </Button>
            </div>
            {!s.tilt ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <Toggle on={!s.jerk} onClick={() => o.setJerk(!s.jerk)}>
                  {s.jerk ? 'Pulling with a jerk' : 'Pulling slowly'}
                </Toggle>
                <Button size="sm" disabled={busy} onClick={() => o.pull() !== null && start('pull', RUN_MS.pull)}>
                  <Hand /> Pull until it moves
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                <Toggle on={!s.fast} onClick={() => o.setFast(!s.fast)}>
                  {s.fast ? 'Raising quickly' : 'Raising slowly'}
                </Toggle>
                <Button size="sm" disabled={busy} onClick={() => o.raise() !== null && start('tilt', RUN_MS.tilt)}>
                  Raise until it slips
                </Button>
              </div>
            )}
          </Step>
        </div>
      )}
      <div className="flex flex-wrap items-start gap-4">
        {w && (run?.kind !== 'pull' || !busy) && !s.tilt && (
          <div>
            <p className="mb-1 text-[12px] font-medium">Weighing ({w.load} × 100 g on the block)</p>
            <SpringScaleSvg reading={w.reading} eye={0} />
          </div>
        )}
        {pull && !s.tilt && (
          <div>
            <p className="mb-1 text-[12px] font-medium">{pulling ? 'Pulling…' : `Just as it starts to move (load ${pull.load})`}</p>
            <SpringScaleSvg reading={pulling ? (shown ?? 0) : pull.limit} eye={0} />
          </div>
        )}
        {pull && !pulling && !s.tilt && (
          <div>
            <p className="mb-1 text-[12px] font-medium">While it slides</p>
            <SpringScaleSvg reading={pull.sliding} eye={0} />
          </div>
        )}
        {s.tilt && tilt !== null && <AngleScale angle={angle} label={tilting ? 'Raising…' : 'The angle when the block just began to slip: read it to 1°.'} />}
      </div>
    </>
  );
}

function ViscosityBench({ o, s, run, p, busy, start, lab, lapse, setLapse }: BenchProps & { lapse: number; setLapse: (n: number) => void }) {
  const v = o.v;
  const reads = viscReadings(v, s.drops);
  const last = s.drops[s.drops.length - 1];
  const falling = run?.kind === 'drop' && busy && last;
  const y = falling ? p * 37 : null;
  const shown = falling ? Math.max(0, Math.min(reads[reads.length - 1]!, ((y! - last.top) / Math.max(1, last.bot - last.top)) * (reads[reads.length - 1]! - (last.reset ? 0 : (reads[reads.length - 2] ?? 0))) + (last.reset ? 0 : (reads[reads.length - 2] ?? 0)))) : clockShows(v, s);
  const [around, setAround] = useState<'top' | 'bot'>('top');
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <CylinderSvg s={s} y={y} liquid={falling ? last.liquid : s.liquid} />
        <div className="space-y-3">
          <StopClock seconds={shown} running={!!falling && y! > last!.top && y! < last!.bot} label="The stop-clock (started and stopped by you at the bands)" />
          <MicrometerSvg reading={s.measured.includes(s.ball) ? v.balls[s.ball]! : 0} eye={0} closed={s.measured.includes(s.ball)} label={`${VISC_BALLS[s.ball]} mm ball`} />
          <div className="flex gap-1">
            {(['top', 'bot'] as const).map((b) => (
              <Toggle key={b} on={around === b} onClick={() => setAround(b)}>
                {b === 'top' ? 'Upper band' : 'Lower band'}
              </Toggle>
            ))}
          </div>
          <BandRule top={s.top} bot={s.bot} around={around} />
        </div>
      </div>
      {lab && (
        <div className="space-y-2">
          <Step title="1. The bands and the ball">
            {(['top', 'bot'] as const).map((b) => (
              <div key={b} className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                <span className="w-28 text-muted-foreground">{b === 'top' ? 'Upper' : 'Lower'} band: {s[b].toFixed(1)} cm</span>
                <Nudges name={`${b === 'top' ? 'Upper' : 'Lower'} band`} move={(d) => o.moveBand(b, d)} big={5} small={0.5} />
              </div>
            ))}
            <div className="flex flex-wrap gap-1">
              {VISC_BALLS.map((d, b) => (
                <Toggle key={b} on={s.ball === b} onClick={() => o.chooseBall(b)}>
                  {d.toFixed(1)} mm
                </Toggle>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={o.measure}>
              <Ruler /> Measure it with the micrometer
            </Button>
          </Step>
          <Step title="2. Drop and time">
            <div className="flex flex-wrap gap-1.5">
              <Toggle on={s.liquid === 'glycerine'} onClick={() => o.setLiquid('glycerine')}>
                Glycerine
              </Toggle>
              <Toggle on={s.liquid === 'oil'} onClick={() => o.setLiquid('oil')}>
                Palm oil
              </Toggle>
              <Toggle on={s.centre} onClick={() => o.setCentre(!s.centre)}>
                {s.centre ? 'At the centre' : 'Near the wall'}
              </Toggle>
              <Toggle on={s.eyeLevel} onClick={() => o.setEyeLevel(!s.eyeLevel)}>
                {s.eyeLevel ? 'Eye level with each band' : 'Eye at one height'}
              </Toggle>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" onClick={o.resetClock}>
                <RotateCcw /> Reset the stop-clock
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => {
                  const k = o.drop();
                  if (k === null) return;
                  const r = viscReadings(v, o.ref.current.drops);
                  start('drop', runMs(((r[k]! - (o.ref.current.drops[k]!.reset ? 0 : (r[k - 1] ?? 0))) * 37) / Math.max(1, s.bot - s.top), lapse));
                }}
              >
                <Timer /> Drop the ball and time it
              </Button>
              <Toggle on={lapse > 1} onClick={() => setLapse(lapse > 1 ? 1 : 4)}>
                {lapse > 1 ? 'Time-lapse ×4' : 'Real time'}
              </Toggle>
            </div>
          </Step>
        </div>
      )}
    </>
  );
}

function InclineBench({ o, s, run, p, busy, start, lab }: BenchProps) {
  const v = o.v;
  const reads = inclineReadings(v, s.runs);
  const last = s.runs[s.runs.length - 1];
  const rolling = run?.kind === 'roll' && busy && last;
  const x = rolling ? Math.min(last.stop, last.stop * p * p) : null;
  const prev = last && !last.reset ? (reads[reads.length - 2] ?? 0) : 0;
  const shown = rolling ? prev + (reads[reads.length - 1]! - prev) * p : clockShows(v, s);
  return (
    <>
      <InclineSvg s={s} x={x} />
      <StopClock seconds={shown} running={!!rolling} label="Started as you let go; stopped at the click on the stopping block." />
      {lab && (
        <div className="space-y-2">
          <Step title="1. The plank and the stopping block">
            <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
              <span className="text-muted-foreground">Blocks under the end: {s.blocks}</span>
              <Button size="icon-sm" variant="outline" onClick={() => o.setBlocks(s.blocks - 1)} aria-label="Take a block out">
                <Minus />
              </Button>
              <Button size="icon-sm" variant="outline" onClick={() => o.setBlocks(s.blocks + 1)} aria-label="Add a block">
                <Plus />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
              <span className="w-36 text-muted-foreground">Stopping block: {(s.stop / 100).toFixed(2)} m</span>
              <Nudges name="Stopping block" move={(d) => o.moveStop(d)} big={10} small={1} />
              {INCLINE_CARD.map((m) => (
                <Button key={m} size="sm" variant="outline" onClick={() => o.setStop(m)}>
                  {(m / 100).toFixed(2)} m
                </Button>
              ))}
            </div>
          </Step>
          <Step title="2. Release and time">
            <div className="flex flex-wrap gap-1.5">
              <Toggle on={!s.push} onClick={() => o.setPush(!s.push)}>
                {s.push ? 'Giving it a push' : 'From rest'}
              </Toggle>
              <Button size="sm" variant="outline" onClick={o.resetClock}>
                <RotateCcw /> Reset the stop-clock
              </Button>
              <Button
                size="sm"
                disabled={busy || s.blocks < 1}
                onClick={() => {
                  const k = o.roll();
                  if (k === null) return;
                  const r = inclineReadings(v, o.ref.current.runs);
                  start('roll', runMs(r[k]! - (o.ref.current.runs[k]!.reset ? 0 : (r[k - 1] ?? 0)), 1));
                }}
              >
                <Camera /> Release the ball and time it
              </Button>
            </div>
          </Step>
        </div>
      )}
    </>
  );
}

function ForcesBench({ o, s, lab, msg, setMsg }: { o: Mechanics; s: PhyMechanicsState; lab: boolean; msg: string | null; setMsg: (m: string | null) => void }) {
  const sh = boardSheet(s);
  const [view, setView] = useState<number | null>(null);
  const offIdx = s.sets.map((x, i) => (x.off ? i : -1)).filter((i) => i >= 0);
  const shownOff = view !== null && s.sets[view]?.off ? view : (offIdx[offIdx.length - 1] ?? null);
  return (
    <>
      <PaperSvg v={o.v} s={s} i={sh ? sh.i : null} live />
      {lab && (
        <div className="space-y-2">
          <Step title="1. The loads">
            {THREADS.map((th) => (
              <div key={th} className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                <span className="w-40 text-muted-foreground">
                  {th}: hanger + {s.masses[th]} × 50 g = {forceNominal(s.masses[th])} g
                </span>
                <Button size="icon-sm" variant="outline" onClick={() => o.setMass(th, s.masses[th] - 1)} aria-label={`${th}: take off 50 g`}>
                  <Minus />
                </Button>
                <Button size="icon-sm" variant="outline" onClick={() => o.setMass(th, s.masses[th] + 1)} aria-label={`${th}: add 50 g`}>
                  <Plus />
                </Button>
              </div>
            ))}
            <Button size="sm" variant={s.tapped ? 'outline' : 'brand'} onClick={o.tap}>
              Tap the board gently
            </Button>
          </Step>
          <Step title="2. Mark the threads">
            <div className="flex flex-wrap gap-1.5">
              {THREADS.flatMap((th) =>
                [false, true].map((far) => (
                  <Button key={`${th}${far}`} size="sm" variant="outline" onClick={() => setMsg(o.dot(th, far))}>
                    Dot under {th} ({far ? 'far' : 'near'})
                  </Button>
                )),
              )}
            </div>
            <Button size="sm" onClick={() => setMsg(o.paperOff())} disabled={!sh}>
              Take the paper off and draw the lines
            </Button>
          </Step>
          {shownOff !== null && (
            <Step title={`3. Construct on sheet ${shownOff + 1}`}>
              <Button size="sm" onClick={() => setMsg(o.build(shownOff))}>
                Draw OA and OB and complete the parallelogram
              </Button>
            </Step>
          )}
          {msg && <p className="text-[12px] text-warning">{msg}</p>}
        </div>
      )}
      {shownOff !== null && (
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[12px] font-medium">
            Your drawing
            {offIdx.length > 1 &&
              offIdx.map((i) => (
                <Toggle key={i} on={shownOff === i} onClick={() => setView(i)}>
                  Sheet {i + 1}
                </Toggle>
              ))}
          </div>
          <PaperSvg v={o.v} s={s} i={shownOff} live={false} measure />
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ the notebook

const HEADS: Record<MechTask, Record<string, string>> = {
  FRICTION: { m: 'Load / g', R: 'R / N', F1: 'F₁ / N', F2: 'F₂ / N', F: 'Mean F / N' },
  VISCOSITY: { d: 'd / mm', r: 'r / mm', r2: 'r² / mm²', t1: 't₁ / s', t2: 't₂ / s', t: 'Mean t / s', v: 'v / cm s⁻¹' },
  INCLINE: { s: 's / m', t1: 't₁ / s', t2: 't₂ / s', t3: 't₃ / s', t: 'Mean t / s', tt: 't² / s²' },
  FORCES: { P: 'P / N', Q: 'Q / N', W: 'W / N', OA: 'OA / cm', OB: 'OB / cm', OC: 'OC / cm', R: 'R / N', ang: 'θ / °', diff: '% diff' },
};
const rowLabel = (task: MechTask, key: number) => (task === 'FRICTION' ? `${key} × 100 g` : task === 'VISCOSITY' ? `${VISC_BALLS[key]?.toFixed(1)} mm ball` : task === 'INCLINE' ? `${(key / 100).toFixed(2)} m` : `Sheet ${key + 1}`);
const GRAPH: Partial<Record<MechTask, { x: string; y: string; xl: string; yl: string; title: string }>> = {
  FRICTION: { x: 'R', y: 'F', xl: 'R / N', yl: 'F / N', title: 'Graph of F against R' },
  VISCOSITY: { x: 'r2', y: 'v', xl: 'r² / mm²', yl: 'v / cm s⁻¹', title: 'Graph of v against r²' },
  INCLINE: { x: 'tt', y: 's', xl: 't² / s²', yl: 's / m', title: 'Graph of s against t²' },
};
const ANSWERS: Record<MechTask, { id: MechAnswerId; label: string; noUnit?: boolean }[]> = {
  FRICTION: [
    { id: 'slope', label: '(i) μ = slope of the graph of F against R', noUnit: true },
    { id: 'mutan', label: '(ii) μ = tan θ (from your mean angle)', noUnit: true },
  ],
  VISCOSITY: [
    { id: 'slope', label: '(i) Slope of the graph of v against r²' },
    { id: 'eta', label: '(ii) η = 2(ρs − ρl)g ÷ (9 × slope), in SI units' },
    { id: 'ratio', label: '(iii) η(glycerine) ÷ η(oil) = v(oil) ÷ v(glycerine)', noUnit: true },
  ],
  INCLINE: [
    { id: 'slope', label: '(i) Slope of the graph of s against t²' },
    { id: 'accel', label: '(ii) Acceleration a = 2 × slope' },
  ],
  FORCES: [{ id: 'scale', label: 'Your scale (newtons per centimetre)' }],
};
const CELLS: Record<MechTask, { id: string; label: string }[]> = {
  FRICTION: [
    { id: 'th1', label: 'θ₁ / °' },
    { id: 'th2', label: 'θ₂ / °' },
    { id: 'th3', label: 'θ₃ / °' },
    { id: 'th', label: 'Mean θ / °' },
  ],
  VISCOSITY: [
    { id: 'L', label: 'Distance between the bands / cm' },
    { id: 'od', label: 'Palm oil: d / mm' },
    { id: 'ot', label: 'Palm oil: t / s' },
    { id: 'ov', label: 'Palm oil: v / cm s⁻¹' },
  ],
  INCLINE: [],
  FORCES: [],
};

export function Notebook({ task, state, readOnly, o }: { task: MechTask; state: PhyMechanicsState; readOnly: boolean; o: Pick<Mechanics, 'setRowCell' | 'removeRow' | 'setCell' | 'setAnswer' | 'update'> }) {
  const cols = MECH_COLS[task];
  const head = HEADS[task];
  const g = GRAPH[task];
  const points = g ? numericPoints(state.rows.map((r) => [r.c[g.x], r.c[g.y]])) : [];
  const scroller = useRef<HTMLDivElement>(null);
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="mb-3 font-display text-[15px] font-semibold tracking-tight">Your record</h3>
      <div ref={scroller} className="overflow-x-auto">
        <table className="w-full min-w-[440px] text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] text-muted-foreground">
              <th className="py-1 pr-1 font-medium" />
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
                <td colSpan={cols.length + 2} className="py-3 text-muted-foreground">
                  A row appears at your first measurement for each {task === 'FRICTION' ? 'load' : task === 'VISCOSITY' ? 'ball' : task === 'INCLINE' ? 'distance' : 'sheet'}.
                </td>
              </tr>
            )}
            {state.rows.map((r) => (
              <tr key={r.key} className="border-t border-border">
                <td className="whitespace-nowrap py-1.5 pr-1 text-[11px] text-muted-foreground">{rowLabel(task, r.key)}</td>
                {cols.map((c) => (
                  <td key={c} className="px-1 py-1.5">
                    <Cell value={r.c[c] ?? ''} onChange={(x) => o.setRowCell(r.key, c, x)} readOnly={readOnly} label={`${rowLabel(task, r.key)} ${head[c]}`} />
                  </td>
                ))}
                <td>
                  {!readOnly && (
                    <Button size="icon-sm" variant="ghost" onClick={() => o.removeRow(r.key)} aria-label={`Delete the row ${rowLabel(task, r.key)}`}>
                      ×
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {CELLS[task].length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {CELLS[task].map((c) => (
            <label key={c.id} className="text-[12px] text-muted-foreground">
              <span className="mb-1 block">{c.label}</span>
              <Cell value={state.cells[c.id] ?? ''} onChange={(x) => o.setCell(c.id, x)} readOnly={readOnly} label={c.label} />
            </label>
          ))}
        </div>
      )}
      {g && (
        <div className="mt-5">
          <p className="mb-2 text-[12.5px] font-semibold">{g.title}</p>
          <PhyGraph points={points} line={state.line} onLine={(line) => o.update((s) => ({ ...s, line }))} readOnly={readOnly} xLabel={g.xl} yLabel={g.yl} />
        </div>
      )}
      <div className="mt-5 space-y-3">
        <p className="text-[12.5px] font-semibold">{task === 'FORCES' ? 'Scale' : 'Calculations'}</p>
        {ANSWERS[task].map((a) => (
          <AnswerRow key={a.id} id={a.id} label={a.label} answer={state.answers[a.id]} onChange={(k, x) => o.setAnswer(a.id, k, x)} readOnly={readOnly} unitHint="unit" noUnit={a.noUnit} />
        ))}
        {task === 'FORCES' && <p className="text-[11.5px] text-muted-foreground">R = OC × scale; the percentage difference = (R − W) ÷ W × 100; θ = the angle between OC and the line of W produced upwards.</p>}
      </div>
      <div className="mt-5">
        <label className={cn('mb-1 block text-[12.5px] font-semibold')} htmlFor="mech-precautions">
          Two precautions you took
        </label>
        <Textarea id="mech-precautions" value={state.written.precautions} onChange={(e) => o.update((s) => ({ ...s, written: { precautions: e.target.value.slice(0, 2000) } }))} disabled={readOnly} rows={3} />
      </div>
    </Card>
  );
}
