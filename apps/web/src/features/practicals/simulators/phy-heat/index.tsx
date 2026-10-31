import {
  HEAT_LEVEL_NAME,
  HEAT_SCALE,
  HEAT_TABLE,
  HEAT_WARM,
  heatMetal,
  heatReading,
  type HeatAnswerId,
  type HeatField,
  type HeatItem,
  type HeatPhys,
  type HeatTask,
  type HeatThermo,
  type PhyHeatState,
  type PhyHeatVariant,
} from '@aischool/shared';
import { Camera, Flame, Pause, Play, Scale, Thermometer, Timer } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AnswerRow, Cell, Step, TaskCard } from '../phy-common';
import type { SimulatorProps } from '../types';
import { beamTilt, clockText, heatFlags, heatHint, ridersSum, SPEEDS, useHeat, useLive, type Heat, type HeatFlags, type Riders } from './actions';
import { CoolingGraph } from './graph';

// ------------------------------------------------------------------ the question paper

export function HeatTaskText({ task }: { task: HeatTask | null }) {
  if (task === 'LATENT')
    return (
      <>
        <p>You are provided with a lagged copper calorimeter and stirrer, a thermometer, a beam balance, warm water, melting ice and blotting paper. Take c (water) = 4200 J kg⁻¹ K⁻¹ and c (copper) = 400 J kg⁻¹ K⁻¹.</p>
        <ol className="list-[lower-roman] space-y-0.5 pl-6">
          <li>Weigh the empty calorimeter with its stirrer (m_c). Two-thirds fill it with warm water and weigh again (m₁).</li>
          <li>Read the room temperature θ_r. Stir and record the temperature of the warm water θ₁.</li>
          <li>Dry small pieces of melting ice with blotting paper and add them one at a time, stirring, until the temperature is about as far below room temperature as θ₁ was above it.</li>
          <li>Record the lowest steady temperature θ₂ once all the ice has melted, then weigh the calorimeter and contents (m₂).</li>
          <li>Work out the heat lost by the warm water and calorimeter, the heat needed to warm the melted ice from 0 °C to θ₂, and hence the specific latent heat of fusion of ice L. State two precautions.</li>
        </ol>
      </>
    );
  if (task === 'COOL')
    return (
      <>
        <p>You are provided with a boiling tube half-filled with powdered naphthalene, a thermometer (0–110 °C), a beaker of water as a water bath on a tripod and gauze over a Bunsen burner, a clamp and stand and a stopwatch.</p>
        <ol className="list-[lower-roman] space-y-0.5 pl-6">
          <li>Heat the naphthalene in the boiling water bath (never directly over the flame) until it has completely melted and the thermometer reads about 90 °C.</li>
          <li>Remove the tube, clamp it in air and start the stopwatch. Record the temperature every 30 s, stirring gently with the thermometer while it is liquid, until the substance is solid and below about 65 °C.</li>
          <li>Plot a graph of temperature θ against time t and draw a smooth curve. Mark the flat part.</li>
          <li>From your graph find the melting (freezing) point of naphthalene, and the average rate of cooling before the plateau. State two precautions.</li>
        </ol>
      </>
    );
  return (
    <>
      <p>You are provided with a lagged copper calorimeter with stirrer and lid, two thermometers (0–110 °C), a beaker of water on a tripod and gauze over a Bunsen burner, a beam balance and a metal block on a thread. Take c (water) = 4200 J kg⁻¹ K⁻¹ and c (copper) = 400 J kg⁻¹ K⁻¹.</p>
      <ol className="list-[lower-roman] space-y-0.5 pl-6">
        <li>Weigh the empty calorimeter with its stirrer (m_c), then with water about two-thirds full (m₁). Weigh the metal block (m).</li>
        <li>Suspend the block in the boiling water for several minutes; record the temperature of the boiling water θ₁.</li>
        <li>Record the temperature of the water in the calorimeter θ₂.</li>
        <li>Transfer the block quickly into the calorimeter without splashing, cover, stir and record the highest steady temperature θ₃.</li>
        <li>Work out the heat gained by the water and by the calorimeter, and hence the specific heat capacity c of the metal. State two precautions.</li>
      </ol>
    </>
  );
}

// ------------------------------------------------------------------ instruments

export const EYES = [
  // the scale is on the front of the stem, the mercury behind it: from above, the top of the thread lines up with a higher mark
  { id: 'high', label: 'Above', shift: 0.6 },
  { id: 'level', label: 'Level', shift: 0 },
  { id: 'low', label: 'Below', shift: -0.6 },
] as const;
export type EyeId = (typeof EYES)[number]['id'];
export const THERMO_NAME: Record<HeatThermo, string> = { bath: 'Thermometer in the boiling water', cal: 'Thermometer in the calorimeter', room: 'Room thermometer', tube: 'Thermometer in the naphthalene' };
export const thermosFor = (task: HeatTask): HeatThermo[] => (task === 'MIX' ? ['bath', 'cal'] : task === 'LATENT' ? ['cal', 'room'] : ['tube']);

/** A magnified strip of the thermometer around the top of the mercury thread (1 °C marks; read to 0.5 °C or better); `shift` is the parallax of a badly placed eye (°C). */
export function ThermoLoupe({ at, shift = 0, label }: { at: number; shift?: number; label?: string }) {
  const H = 230;
  const k = 15; // px per °C
  const centre = Math.round(at);
  const Y = (c: number) => H / 2 - (c - centre) * k;
  const ticks: number[] = [];
  for (let c = centre - 8; c <= centre + 8; c++) if (c >= HEAT_SCALE.min && c <= HEAT_SCALE.max) ticks.push(c);
  const top = Y(Math.max(HEAT_SCALE.min, Math.min(HEAT_SCALE.max, at + shift)));
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 130 ${H}`} className="h-[230px] w-[130px] rounded-lg border border-border bg-gradient-to-r from-slate-100 via-white to-slate-100" role="img" aria-label={`Close-up of ${label ?? 'the thermometer'} at the top of the mercury: read it against the scale`}>
        <rect x={44} y={0} width={18} height={H} rx={8} fill="#eef3f6" stroke="#b8c4cc" strokeWidth="0.8" />
        <rect x={50.5} y={top} width={5} height={H - top} fill="#9aa5ad" />
        <rect x={51.5} y={top} width={1.2} height={H - top} fill="#e9eef1" />
        {ticks.map((c) => {
          const y = Y(c);
          const len = c % 10 === 0 ? 22 : c % 5 === 0 ? 16 : 10;
          return (
            <g key={c}>
              <line x1={64} x2={64 + len} y1={y} y2={y} stroke="#1b1b1b" strokeWidth={c % 5 === 0 ? 1.3 : 0.8} />
              {c % 5 === 0 && (
                <text x={92} y={y + 4} fontSize={c % 10 === 0 ? 13 : 11} fontWeight={c % 10 === 0 ? 700 : 500} fill="#1b1b1b">
                  {c}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="max-w-[130px] text-[11px] text-muted-foreground">Read where the mercury ends, eye level with it. Each mark is 1 °C.</figcaption>
    </figure>
  );
}

/** The triple-beam balance: what is on the pan, the three beams with their riders, and the pointer against the zero mark. */
export function BalanceSvg({ item, mass, riders }: { item: HeatItem | null; mass: number; riders: Riders }) {
  const tilt = beamTilt(mass, riders);
  const beam = (y: number, n: number, pos: number, label: string, fine = false) => (
    <g>
      <rect x={70} y={y} width={190} height={10} rx={2} fill="#d9dde1" stroke="#7d8790" strokeWidth="0.7" />
      {Array.from({ length: fine ? 101 : n + 1 }, (_, i) => {
        const x = 76 + (i / (fine ? 100 : n)) * 178;
        const major = fine ? i % 10 === 0 : true;
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={y} y2={y + (major ? 5 : fine && i % 5 === 0 ? 4 : 2.5)} stroke="#2a2f33" strokeWidth={major ? 0.8 : 0.45} />
            {major && (
              <text x={x} y={y + 18} fontSize="6.5" textAnchor="middle" fill="#2a2f33">
                {fine ? i / 10 : i * (label === '100 g' ? 100 : 10)}
              </text>
            )}
          </g>
        );
      })}
      <path d={`M${76 + pos * 178 - 4} ${y - 3} h8 l-1 14 h-6 Z`} fill="#c62828" stroke="#7f1d1d" strokeWidth="0.5" />
      <text x={64} y={y + 8} fontSize="7" textAnchor="end" fill="#475569">
        {label}
      </text>
    </g>
  );
  return (
    <svg viewBox="0 0 300 150" className="w-full max-w-[340px] rounded-xl border border-border bg-gradient-to-b from-slate-50 to-slate-200 dark:from-slate-800 dark:to-slate-900" role="img" aria-label={`Beam balance with ${item === 'cal' ? 'the calorimeter' : item === 'block' ? 'the metal block' : 'nothing'} on the pan; the riders total ${ridersSum(riders).toFixed(1)} g; the pointer is ${Math.abs(tilt) < 0.08 ? 'on zero' : tilt > 0 ? 'above zero' : 'below zero'}`}>
      {/* pan and what is on it */}
      <ellipse cx={38} cy={88} rx={28} ry={6} fill="#a7b0b8" stroke="#6b7580" />
      <rect x={34} y={92} width={8} height={30} fill="#6b7580" />
      {item === 'cal' && <rect x={22} y={56} width={32} height={30} rx={3} fill="#c27a4a" stroke="#7a4524" />}
      {item === 'block' && <rect x={26} y={70} width={24} height={16} rx={1} fill="#8d8f93" stroke="#45474b" />}
      {beam(36, 2, riders.h / 2, '100 g')}
      {beam(64, 9, riders.t / 9, '10 g')}
      {beam(92, 10, riders.f / 10, '1 g', true)}
      {/* pointer at the end of the beams, against the zero mark */}
      <rect x={268} y={30} width={22} height={90} rx={3} fill="#f8fafc" stroke="#94a3b8" />
      <line x1={268} x2={290} y1={75} y2={75} stroke="#16a34a" strokeWidth="1.4" />
      <text x={279} y={128} fontSize="7" textAnchor="middle" fill="#334155">
        0
      </text>
      <path d={`M262 ${75 - tilt * 34} l26 0`} stroke="#0f172a" strokeWidth="2" />
      <rect x={0} y={128} width={300} height={22} fill="#475569" />
    </svg>
  );
}

/** The bench seen from the front: the heating, the calorimeter (or the boiling tube) and the thermometers, drawn from the live bench. */
function BenchSvg({ s, p, f, v }: { s: PhyHeatState; p: HeatPhys; f: HeatFlags; v: PhyHeatVariant }) {
  const task = s.task ?? 'MIX';
  const boiling = p.bath >= v.boil - 0.3 && f.bunsen;
  const metal = heatMetal(v);
  const calX = 190;
  const iceLeft = p.ice.filter((x) => x.m > 0);
  const waterTop = 175 - Math.min(52, (p.mw / (v.twoThirds * 1.5)) * 52);
  const heat = task !== 'LATENT';
  return (
    <svg viewBox="0 0 300 220" className="mx-auto w-full max-w-[420px] select-none rounded-xl border border-border bg-gradient-to-b from-slate-50 to-slate-200 dark:from-slate-800 dark:to-slate-900" role="img" aria-label="The bench">
      <rect x={0} y={200} width={300} height={20} fill="#8b6b4a" />
      {heat && (
        <g aria-label={`Bunsen burner ${f.bunsen ? 'lit' : 'off'}; beaker of water${boiling ? ' boiling' : ''}`}>
          {/* tripod, gauze, Bunsen */}
          <path d="M40 200 L52 150 M110 200 L98 150 M75 200 L75 150" stroke="#444" strokeWidth="3" />
          <rect x={44} y={146} width={62} height={4} fill="#777" />
          <rect x={70} y={170} width={10} height={30} fill="#555" />
          {f.bunsen && <path d="M75 170 q-7 -10 0 -20 q7 10 0 20 Z" fill="#3b82f6" opacity={0.8} />}
          {/* beaker */}
          <path d="M50 92 v52 q0 2 2 2 h46 q2 0 2 -2 v-52" fill="none" stroke="#7aa7c7" strokeWidth="1.6" />
          <rect x={51} y={104} width={48} height={41} fill="#cfe4f2" opacity={0.85} />
          {boiling && [58, 70, 82, 92].map((x, i) => <circle key={x} cx={x} cy={112 + ((i * 7) % 20)} r={1.6} fill="#fff" />)}
        </g>
      )}
      {task === 'MIX' && (
        <g aria-label={`The ${metal.name} block: ${f.block === 'bath' ? 'in the boiling water' : f.block === 'air' ? 'lifted out' : f.block === 'cal' ? 'in the calorimeter' : 'on the bench'}`}>
          {(() => {
            const pos = f.block === 'bath' ? [75, 122] : f.block === 'air' ? [calX, 92] : f.block === 'cal' ? [calX, 158] : [250, 190];
            return (
              <g>
                {f.block !== 'bench' && <line x1={pos[0]} x2={pos[0]} y1={pos[1]! - 8} y2={60} stroke="#a3a3a3" strokeWidth="0.8" />}
                <rect x={pos[0]! - 9} y={pos[1]! - 8} width={18} height={16} rx={1.5} fill={metal.colour} stroke="#3f3f46" strokeWidth="0.8" />
              </g>
            );
          })()}
        </g>
      )}
      {task !== 'COOL' && (
        <g aria-label={`Calorimeter${f.lagged ? ' in its lagging' : ''}${f.lid ? ', covered' : ''}${f.stirring ? ', being stirred' : ''}`}>
          {f.lagged && <rect x={calX - 36} y={112} width={72} height={88} rx={4} fill="#efe9dc" stroke="#a39a86" />}
          <rect x={calX - 26} y={120} width={52} height={78} rx={3} fill="#d49a6a" stroke="#7a4524" />
          <rect x={calX - 24} y={waterTop} width={48} height={196 - waterTop} fill="#bcd9ee" opacity={p.mw > 0 ? 0.9 : 0} />
          {iceLeft.map((x, i) => {
            const r = 4 + 8 * Math.cbrt(x.m / 0.006);
            return <rect key={i} x={calX - 20 + ((i * 13) % 36)} y={waterTop - r * 0.35} width={r} height={r * 0.8} rx={1.5} fill="#f1f8ff" stroke="#9cc3df" />;
          })}
          {f.lid && <rect x={calX - 30} y={114} width={60} height={6} rx={2} fill="#9c5a2e" />}
          {/* stirrer and thermometer */}
          <path d={`M${calX + 14} 70 V${190} h-10`} stroke="#b0703f" strokeWidth="2" fill="none" transform={f.stirring ? `translate(0 ${Math.sin(p.t * 6) * 4})` : undefined} />
          <rect x={calX - 4} y={58} width={5} height={130} rx={2.5} fill="#eef3f6" stroke="#9aa5ad" strokeWidth="0.6" />
          <circle cx={calX - 1.5} cy={189} r={3.5} fill="#9aa5ad" />
        </g>
      )}
      {task === 'LATENT' && (
        <g aria-label="Beaker of melting ice, blotting paper and the room thermometer">
          <path d="M40 150 v48 h44 v-48" fill="#e7f3fb" stroke="#7aa7c7" strokeWidth="1.4" />
          {[48, 60, 70].map((x, i) => (
            <rect key={x} x={x} y={164 + i * 6} width={10} height={8} rx={1.5} fill="#fafdff" stroke="#9cc3df" />
          ))}
          <rect x={92} y={190} width={36} height={8} fill="#f3d6e1" stroke="#c48aa3" />
          <rect x={268} y={92} width={5} height={100} rx={2.5} fill="#eef3f6" stroke="#9aa5ad" strokeWidth="0.6" />
        </g>
      )}
      {task === 'COOL' && (
        <g aria-label={`Boiling tube of naphthalene ${f.tube === 'bath' ? 'in the water bath' : f.tube === 'air' ? 'clamped in air' : 'in the rack'}; ${p.fs < 0.02 ? 'liquid' : p.fs > 0.98 ? 'solid' : 'freezing'}`}>
          <rect x={250} y={40} width={4} height={160} fill="#666" />
          {(() => {
            const x = f.tube === 'bath' ? 75 : 210;
            const y = f.tube === 'bath' ? 72 : 60;
            const solidH = 40 * p.fs;
            return (
              <g>
                {f.tube !== 'bath' && <rect x={x + 8} y={y + 10} width={42 - (x - 210)} height={5} fill="#666" />}
                <path d={`M${x - 8} ${y} v76 a8 8 0 0 0 16 0 v-76`} fill="#f7fbff" stroke="#9aa5ad" strokeWidth="1.2" />
                <rect x={x - 7} y={y + 44} width={14} height={40} fill={p.fs > 0.98 ? '#f4f4f0' : '#fffef2'} opacity={0.95} />
                <rect x={x - 7} y={y + 84 - solidH} width={14} height={solidH} fill="#e7e5df" />
                <rect x={x - 2} y={y - 40} width={4} height={118} rx={2} fill="#eef3f6" stroke="#9aa5ad" strokeWidth="0.6" />
              </g>
            );
          })()}
        </g>
      )}
    </svg>
  );
}

// ------------------------------------------------------------------ the 2D lab

function ClockBar({ o, compact }: { o: Heat; compact?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
      <Timer className="size-3.5 text-muted-foreground" aria-hidden />
      <span className="tabular text-muted-foreground" aria-label="Lab clock">
        Lab clock {clockText(o.now())}
      </span>
      {!compact && <span className="text-muted-foreground">· time-lapse</span>}
      {SPEEDS.map((x) => (
        <Button key={x} size="sm" variant={o.speed === x ? 'brand' : 'outline'} className="h-7 px-2" onClick={() => o.setSpeed(x)} aria-pressed={o.speed === x}>
          ×{x}
        </Button>
      ))}
    </div>
  );
}

export function BalanceControls({ o, compact }: { o: Heat; compact?: boolean }) {
  const r = o.riders;
  const n = (w: keyof Riders, d: number, label: string) => (
    <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => o.nudgeRider(w, d)} aria-label={label}>
      {d > 0 ? '+' : '−'}
      {w === 'h' ? '100' : w === 't' ? '10' : Math.abs(d)}
    </Button>
  );
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
        <span className="text-muted-foreground">On the pan:</span>
        {([null, 'cal', 'block'] as const).map((it) => (
          <Button key={String(it)} size="sm" variant={o.pan === it ? 'brand' : 'outline'} className="h-7 px-2" onClick={() => o.setPan(it)} aria-pressed={o.pan === it}>
            {it === 'cal' ? 'Calorimeter' : it === 'block' ? 'Block' : 'Nothing'}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1 text-[12px]">
        <span className="w-14 text-muted-foreground">Riders</span>
        {n('h', -1, 'Hundreds rider back one notch')}
        {n('h', 1, 'Hundreds rider on one notch')}
        {n('t', -1, 'Tens rider back one notch')}
        {n('t', 1, 'Tens rider on one notch')}
        {!compact && n('f', -1, 'Front rider back 1 g')}
        {n('f', -0.1, 'Front rider back 0.1 g')}
        {n('f', 0.1, 'Front rider on 0.1 g')}
        {!compact && n('f', 1, 'Front rider on 1 g')}
      </div>
      <input type="range" min={0} max={10} step={0.1} value={r.f} onChange={(e) => o.setRiders({ ...r, f: Number(e.target.value) })} className="w-full accent-[var(--color-brand)]" aria-label="Front rider (0 to 10 g)" />
    </div>
  );
}

export default function PhyHeatLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'phy-heat'>) {
  const o = useHeat({ seed, state, onChange, readOnly, startedAt, practicalId });
  const { v, task } = o;
  useLive(!readOnly, 120);
  const p = o.phys();
  const f = heatFlags(state.events);
  const [msg, setMsg] = useState<string | null>(null);
  const [eye, setEye] = useState<EyeId>('high');
  const thermos = thermosFor(task);
  const [th, setTh] = useState<HeatThermo>(thermos[0]!);
  const shown = thermos.includes(th) ? th : thermos[0]!;
  const shift = EYES.find((e) => e.id === eye)!.shift;
  const say = (m: string | null) => setMsg(m);
  const [dry, setDry] = useState(true);
  const [melting, setMelting] = useState(true);

  return (
    <div className="space-y-4">
      <TaskCard icon={<Flame className="size-4 text-muted-foreground" aria-hidden />}>
        <HeatTaskText task={state.task} />
        {!readOnly && state.events.length === 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(['MIX', 'LATENT', 'COOL'] as const).map((t) => (
              <Button key={t} size="sm" variant={state.task === t ? 'brand' : 'outline'} onClick={() => o.chooseTask(t)} aria-pressed={state.task === t}>
                {t === 'MIX' ? 'Method of mixtures' : t === 'LATENT' ? 'Latent heat of ice' : 'Cooling curve'}
              </Button>
            ))}
          </div>
        )}
      </TaskCard>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start [&>*]:min-w-0">
        <Card className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
              <Flame className="size-4 text-muted-foreground" aria-hidden /> The bench
            </h3>
            {task === 'MIX' && <Badge variant="outline">Block: {heatMetal(v).name}</Badge>}
          </div>
          {!readOnly && mode === 'LAB' && state.task && (
            <p className="mb-3 rounded-xl bg-info-soft px-3 py-2 text-[12.5px] text-info">{heatHint(state, f, p, v, o.pan)}</p>
          )}
          {!readOnly && <ClockBar o={o} />}
          <div className="mt-2">
            <BenchSvg s={state} p={p} f={f} v={v} />
          </div>
          {state.task && !readOnly && (
            <div className="mt-4 space-y-3">
              {task !== 'COOL' && (
                <Step title="1. The beam balance">
                  <BalanceSvg item={o.pan} mass={o.panMass()} riders={o.riders} />
                  <BalanceControls o={o} />
                  <Button size="sm" variant="brand" onClick={() => say(o.weigh())} disabled={!o.pan}>
                    <Scale /> Record this weighing ({state.weighs.length})
                  </Button>
                  <p className="text-[11.5px] text-muted-foreground">Slide the riders until the pointer is on zero, then add up the three beams (to 0.1 g) and write it in the table.</p>
                </Step>
              )}
              {task !== 'COOL' && (
                <Step title="2. The calorimeter">
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant={f.lagged ? 'brand' : 'outline'} onClick={() => o.lag(!f.lagged)}>
                      {f.lagged ? 'In its lagging' : 'Stand it in its lagging'}
                    </Button>
                    {task === 'MIX'
                      ? ([1, 2, 3] as const).map((l) => (
                          <Button key={l} size="sm" variant="outline" onClick={() => o.fill(l)} disabled={f.filled}>
                            Fill {HEAT_LEVEL_NAME[l]}
                          </Button>
                        ))
                      : HEAT_WARM.map((w) => (
                          <Button key={w} size="sm" variant="outline" onClick={() => o.warm(w)} disabled={f.filled}>
                            Warm water ~{w} °C
                          </Button>
                        ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant={f.lid ? 'brand' : 'outline'} onClick={() => o.lid(!f.lid)}>
                      {f.lid ? 'Lid on' : 'Put the lid on'}
                    </Button>
                    <Button size="sm" variant={f.stirring ? 'brand' : 'outline'} onClick={() => o.stir(!f.stirring)} disabled={!f.filled}>
                      {f.stirring ? 'Stirring (stop)' : 'Stir with the stirrer'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={o.thStir} disabled={!f.filled}>
                      Stir with the thermometer
                    </Button>
                  </div>
                </Step>
              )}
              {task === 'MIX' && (
                <Step title="3. Heat the block">
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant={f.bunsen ? 'brand' : 'outline'} onClick={() => o.bunsen(!f.bunsen)}>
                      <Flame /> {f.bunsen ? 'Bunsen lit (turn off)' : 'Light the Bunsen'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={o.blockToBath} disabled={f.block !== 'bench'}>
                      Hang the block in the water
                    </Button>
                    <Button size="sm" variant="outline" onClick={o.lift} disabled={f.block !== 'bath'}>
                      Lift it out
                    </Button>
                    <Button size="sm" variant="brand" onClick={() => o.lower(true)} disabled={f.block !== 'air' && f.block !== 'bath'}>
                      Lower it gently into the calorimeter
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => o.lower(false)} disabled={f.block !== 'air' && f.block !== 'bath'}>
                      Drop it in
                    </Button>
                  </div>
                </Step>
              )}
              {task === 'LATENT' && (
                <Step title="3. Add ice">
                  <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={dry} onChange={(e) => setDry(e.target.checked)} /> Dry it with blotting paper
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="radio" checked={melting} onChange={() => setMelting(true)} /> Melting ice (0 °C)
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="radio" checked={!melting} onChange={() => setMelting(false)} /> Ice from the freezer
                    </label>
                  </div>
                  <Button size="sm" variant="brand" onClick={() => o.addIce(dry, melting)} disabled={!f.filled}>
                    Add a piece of ice ({f.ice})
                  </Button>
                </Step>
              )}
              {task === 'COOL' && (
                <Step title="1. Melt and cool">
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant={f.bunsen ? 'brand' : 'outline'} onClick={() => o.bunsen(!f.bunsen)}>
                      <Flame /> {f.bunsen ? 'Bunsen lit (turn off)' : 'Light the Bunsen'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={o.tubeToBath} disabled={f.tube === 'bath'}>
                      Stand the tube in the water bath
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => (o.tubeFlame(), say('Never heat naphthalene straight over a flame: its vapour catches fire. Use the water bath.'))}>
                      Heat the tube over the flame
                    </Button>
                    <Button size="sm" variant="outline" onClick={o.tubeToAir} disabled={f.tube !== 'bath'}>
                      Take it out and clamp it in air
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant={f.stirring ? 'brand' : 'outline'} onClick={() => o.stir(!f.stirring)}>
                      {f.stirring ? 'Stirring gently (stop)' : 'Stir gently with the thermometer'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={o.pullThermo}>
                      Pull the thermometer out
                    </Button>
                    <Button size="sm" variant="brand" onClick={() => (f.watch === 'running' ? o.watchStop() : o.watchStart())}>
                      {f.watch === 'running' ? <Pause /> : <Play />} {f.watch === 'running' ? 'Stop the stopwatch' : 'Start the stopwatch'}
                    </Button>
                    <span className="self-center rounded-md bg-[#c9d7b8] px-2 py-0.5 font-mono text-[14px] font-bold tabular text-[#16200f]" aria-label={`Stopwatch reads ${o.watchTime().toFixed(0)} seconds`}>
                      {clockText(o.watchTime())}
                    </span>
                  </div>
                </Step>
              )}
              <Step title={`${task === 'COOL' ? '2' : '4'}. Read the thermometer`}>
                <div className="flex flex-wrap gap-1.5">
                  {thermos.map((x) => (
                    <Button key={x} size="sm" variant={shown === x ? 'brand' : 'outline'} className="h-7 px-2" onClick={() => setTh(x)} aria-pressed={shown === x}>
                      <Thermometer /> {x === 'bath' ? 'Bath' : x === 'cal' ? 'Calorimeter' : x === 'room' ? 'Room' : 'Naphthalene'}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap items-start gap-3">
                  <ThermoLoupe at={heatReading(v, p, shown)} shift={shift} label={THERMO_NAME[shown]} />
                  <div className="space-y-2">
                    <div className="flex rounded-lg border border-border p-0.5" role="radiogroup" aria-label="Your eye">
                      {EYES.map((e) => (
                        <button key={e.id} type="button" role="radio" aria-checked={eye === e.id} onClick={() => setEye(e.id)} className={cn('rounded-md px-2 py-1 text-[12px]', eye === e.id ? 'bg-foreground text-background' : 'text-muted-foreground')}>
                          Eye {e.label.toLowerCase()}
                        </button>
                      ))}
                    </div>
                    <Button size="sm" variant="brand" onClick={() => say(o.read(shown))}>
                      <Camera /> Take this reading
                    </Button>
                    <p className="max-w-[190px] text-[11.5px] text-muted-foreground">Write what you read in the table. Eye level with the mercury, or the reading is off (parallax).</p>
                  </div>
                </div>
              </Step>
              {msg && <p className="text-[12px] text-warning">{msg}</p>}
            </div>
          )}
        </Card>
        <Notebook task={task} state={state} readOnly={readOnly} o={o} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the notebook

export const FIELD_LABEL: Record<HeatField, string> = {
  mc: 'Mass of empty calorimeter + stirrer, m_c / g',
  m1: 'Mass of calorimeter + water, m₁ / g',
  mw: 'Mass of water, m_w = m₁ − m_c / g',
  mb: 'Mass of the metal block, m / g',
  th1: 'θ₁ / °C',
  th2: 'θ₂ / °C',
  th3: 'Highest steady temperature, θ₃ / °C',
  m2: 'Mass of calorimeter + water + melted ice, m₂ / g',
  mi: 'Mass of ice, m_i = m₂ − m₁ / g',
  room: 'Room temperature, θ_r / °C',
};
const fieldLabel = (task: HeatTask, f: HeatField) =>
  f === 'th1' ? (task === 'MIX' ? 'Temperature of the boiling water (block), θ₁ / °C' : 'Temperature of the warm water, θ₁ / °C') : f === 'th2' ? (task === 'MIX' ? 'Initial temperature of the water, θ₂ / °C' : 'Lowest steady temperature, θ₂ / °C') : f === 'm1' && task === 'LATENT' ? 'Mass of calorimeter + warm water, m₁ / g' : FIELD_LABEL[f];
export const ANSWER_LABEL: Record<HeatTask, Record<HeatAnswerId, string>> = {
  MIX: { q1: '(i) Heat gained by the water, m_w c_w (θ₃ − θ₂)', q2: '(ii) Heat gained by the calorimeter, m_c c_c (θ₃ − θ₂)', result: '(iii) Specific heat capacity of the metal, c' },
  LATENT: { q1: '(i) Heat lost by the warm water and calorimeter', q2: '(ii) Heat to warm the melted ice from 0 °C to θ₂', result: '(iii) Specific latent heat of fusion of ice, L' },
  COOL: { q1: '(ii) Average rate of cooling before the plateau', q2: '', result: '(i) Melting (freezing) point of naphthalene' },
};

export function Notebook({ task, state, readOnly, o }: { task: HeatTask; state: PhyHeatState; readOnly: boolean; o: Pick<Heat, 'update' | 'removeCoolRow' | 'removeWeigh' | 'removeRead'> }) {
  const { update } = o;
  const setAnswer = (id: HeatAnswerId, key: 'value' | 'unit', value: string) => update((s) => ({ ...s, answers: { ...s.answers, [id]: { ...s.answers[id], [key]: value } } }));
  const setField = (k: HeatField, x: string) => update((s) => ({ ...s, table: { ...s.table, [k]: x } }));
  const t0 = state.events.find((e) => e.e === 'watch:start')?.t ?? 0;
  const points = state.cool.map((r) => ({ x: Number(r.t.trim()), y: Number(r.th.trim()) })).filter((p, i) => state.cool[i]!.t.trim() && state.cool[i]!.th.trim() && Number.isFinite(p.x) && Number.isFinite(p.y));
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="mb-3 font-display text-[15px] font-semibold tracking-tight">Your record</h3>
      {task !== 'COOL' ? (
        <>
          {(state.weighs.length > 0 || state.reads.length > 0) && (
            <div className="mb-3 grid gap-2 rounded-xl border border-border p-2 text-[12px] sm:grid-cols-2">
              <div>
                <p className="mb-1 font-semibold">Weighings</p>
                <ul className="space-y-0.5">
                  {state.weighs.map((w, i) => (
                    <li key={i} className="flex items-center gap-1">
                      <span className="tabular">
                        {i + 1}. {w.item === 'cal' ? 'Calorimeter' : 'Block'} at {clockText(w.t)}
                      </span>
                      {!readOnly && (
                        <Button size="icon-sm" variant="ghost" onClick={() => o.removeWeigh(i)} aria-label={`Delete weighing ${i + 1}`}>
                          ×
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 font-semibold">Thermometer readings</p>
                <ul className="max-h-28 space-y-0.5 overflow-y-auto">
                  {state.reads.map((r, i) => (
                    <li key={i} className="flex items-center gap-1">
                      <span className="tabular">
                        {i + 1}. {r.th === 'bath' ? 'Bath' : r.th === 'cal' ? 'Calorimeter' : r.th === 'room' ? 'Room' : 'Tube'} at {clockText(r.t)}
                      </span>
                      {!readOnly && (
                        <Button size="icon-sm" variant="ghost" onClick={() => o.removeRead(i)} aria-label={`Delete reading ${i + 1}`}>
                          ×
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <table className="w-full text-[13px]">
            <tbody>
              {HEAT_TABLE[task].map((k) => (
                <tr key={k} className="border-t border-border">
                  <td className="py-1.5 pr-2 text-[12.5px] text-muted-foreground">{fieldLabel(task, k)}</td>
                  <td className="py-1.5">
                    <Cell value={state.table[k]} onChange={(x) => setField(k, x)} readOnly={readOnly} label={fieldLabel(task, k)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[11.5px] text-muted-foreground">Masses to 0.1 g as the balance reads; temperatures to 1 decimal place. Convert g to kg (÷ 1000) for the calculations.</p>
        </>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[260px] text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] text-muted-foreground">
                  <th className="px-1 py-1 font-medium">Reading</th>
                  <th className="px-1 py-1 font-medium">t / s</th>
                  <th className="px-1 py-1 font-medium">θ / °C</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.cool.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-3 text-muted-foreground">
                      A row appears for each thermometer reading you take while the stopwatch runs.
                    </td>
                  </tr>
                )}
                {state.cool.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-1 py-1 text-[11.5px] text-muted-foreground tabular">
                      {i + 1} <span className="opacity-70">(watch ≈ {clockText(Math.max(0, (state.reads[state.coolRows[i]!]?.t ?? t0) - t0))})</span>
                    </td>
                    <td className="px-1 py-1">
                      <Cell value={r.t} onChange={(x) => update((s) => ({ ...s, cool: s.cool.map((c, k) => (k === i ? { ...c, t: x } : c)) }))} readOnly={readOnly} label={`Reading ${i + 1}: time in s`} />
                    </td>
                    <td className="px-1 py-1">
                      <Cell value={r.th} onChange={(x) => update((s) => ({ ...s, cool: s.cool.map((c, k) => (k === i ? { ...c, th: x } : c)) }))} readOnly={readOnly} label={`Reading ${i + 1}: temperature in °C`} />
                    </td>
                    <td>
                      {!readOnly && (
                        <Button size="icon-sm" variant="ghost" onClick={() => o.removeCoolRow(i)} aria-label={`Delete row ${i + 1}`}>
                          ×
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[11.5px] text-muted-foreground">The time as the stopwatch shows it (0, 30, 60 … s); the temperature to 1 decimal place.</p>
          <div className="mt-5">
            <p className="mb-2 text-[12.5px] font-semibold">Graph of θ against t</p>
            <CoolingGraph points={points} curve={state.curve} onCurve={(curve) => update((s) => ({ ...s, curve }))} line={state.line} onLine={(line) => update((s) => ({ ...s, line }))} readOnly={readOnly} />
          </div>
        </>
      )}
      <div className="mt-5 space-y-3">
        <p className="text-[12.5px] font-semibold">Calculations</p>
        {task === 'COOL' ? (
          <>
            <AnswerRow id="result" label={ANSWER_LABEL.COOL.result} answer={state.answers.result} onChange={(k, x) => setAnswer('result', k, x)} readOnly={readOnly} unitHint="unit" />
            <AnswerRow id="q1" label={ANSWER_LABEL.COOL.q1} answer={state.answers.q1} onChange={(k, x) => setAnswer('q1', k, x)} readOnly={readOnly} unitHint="unit" />
          </>
        ) : (
          (['q1', 'q2', 'result'] as const).map((id) => <AnswerRow key={id} id={id} label={ANSWER_LABEL[task][id]} answer={state.answers[id]} onChange={(k, x) => setAnswer(id, k, x)} readOnly={readOnly} unitHint="unit" />)
        )}
      </div>
      <div className="mt-5">
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="heat-precautions">
          Two precautions you took
        </label>
        <Textarea id="heat-precautions" value={state.written.precautions} onChange={(e) => update((s) => ({ ...s, written: { precautions: e.target.value.slice(0, 2000) } }))} disabled={readOnly} rows={3} />
      </div>
    </Card>
  );
}
