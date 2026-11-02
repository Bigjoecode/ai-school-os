import { THERM_TIMES, thermMetal, type PhyThermalState, type PhyThermalVariant, type ThermAnswerId, type ThermInstrument, type ThermPhys, type ThermTask } from '@aischool/shared';
import { Camera, Flame, Pause, Play, Plus, RotateCcw, Thermometer, Timer, Zap } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { AnswerRow, Cell, Step, TaskCard } from '../phy-common';
import { MicrometerSvg } from '../phy-density/instruments';
import type { SimulatorProps } from '../types';
import { clockText, SPEEDS, thermFlags, thermHint, useLive, useThermal, type Thermal, type ThermFlags } from './actions';
import { ThermGraph } from './graph';
import { ColumnLoupe, Display, EyeControl, MeterSvg, RuleLoupe, ThermoLoupe, type EyePos } from './instruments';

// ------------------------------------------------------------------ the question paper

export function ThermTaskText({ task }: { task: ThermTask | null }) {
  if (task === 'CHARLES')
    return (
      <>
        <p>You are provided with a capillary tube sealed at one end containing air trapped by a thread of concentrated sulphuric acid, a thermometer, a ruler, a large beaker of water, a Bunsen burner, tripod and gauze, rubber bands and a stirrer.</p>
        <ol className="list-[lower-roman] space-y-0.5 pl-6">
          <li>The tube and the thermometer are fixed to the ruler with rubber bands, open end up. Immerse them in the water so that the air column is fully covered.</li>
          <li>Stir and record the temperature θ of the water and the length l of the air column.</li>
          <li>Heat the water gently. At intervals of about 15 °C remove the flame, stir well, wait for the temperature to be steady and record θ and l. Take at least five pairs of readings up to about 90 °C.</li>
          <li>Tabulate θ, l, T = θ + 273 and l/T. Plot l against θ (°C), extend the line back and read the temperature where l = 0.</li>
          <li>State Charles’s law and two precautions.</li>
        </ol>
      </>
    );
  if (task === 'ELECTRIC')
    return (
      <>
        <p>You are provided with a 12 V immersion heater, a 12 V d.c. supply, an ammeter, a voltmeter, a lagged copper calorimeter with stirrer and lid, a thermometer, a stopwatch and a balance.</p>
        <ol className="list-[lower-roman] space-y-0.5 pl-6">
          <li>Weigh the empty calorimeter and stirrer, then about 200 g of water in it; find the mass of water m.</li>
          <li>Stand it in the lagging, immerse the heater fully, put on the lid and connect the heater with the ammeter in series and the voltmeter across the heater. Record the initial temperature θ₀.</li>
          <li>Switch on and start the stopwatch. Stir continuously; record V and I, and the temperature every 60 s.</li>
          <li>Switch off at t = 300 s, keep stirring and record the highest temperature θ_max.</li>
          <li>Plot θ against t. Calculate the electrical energy E = VIt, the power P = VI and the specific heat capacity of water c = E/(mΔθ). State two precautions.</li>
        </ol>
      </>
    );
  return (
    <>
      <p>You are provided with a metal rod about 60 cm long, a steam jacket with a thermometer and a micrometer screw gauge fitted at one end, a steam generator over a Bunsen burner, rubber tubing and a metre rule.</p>
      <ol className="list-[lower-roman] space-y-0.5 pl-6">
        <li>Measure the length l₀ of the rod at room temperature with the metre rule.</li>
        <li>Fit the rod in the jacket with one end against the fixed stop. Read the thermometer (θ₁). Turn the micrometer’s ratchet until it just touches the rod and record the reading r₁.</li>
        <li>Back the micrometer off. Pass steam through the jacket for several minutes until the thermometer is steady and record θ₂.</li>
        <li>Screw the micrometer forward with the ratchet until it just touches the rod again and record r₂. Repeat until two readings agree.</li>
        <li>Calculate the expansion e = r₁ − r₂ and the linear expansivity α = e/(l₀(θ₂ − θ₁)). State two precautions.</li>
      </ol>
    </>
  );
}

// ------------------------------------------------------------------ the bench drawing

const tempColour = (T: number) => {
  const f = Math.max(0, Math.min(1, (T - 20) / 80));
  return `rgb(${Math.round(190 + 50 * f)}, ${Math.round(220 - 40 * f)}, ${Math.round(242 - 90 * f)})`;
};

function BenchSvg({ task, p, f, v }: { task: ThermTask; p: ThermPhys; f: ThermFlags; v: PhyThermalVariant }) {
  const steam = p.boiler && p.can >= v.boil - 0.05;
  return (
    <svg viewBox="0 0 320 210" className="mx-auto w-full max-w-[440px] select-none rounded-xl border border-border bg-gradient-to-b from-slate-50 to-slate-200 dark:from-slate-800 dark:to-slate-900" role="img" aria-label="The bench">
      <rect x={0} y={192} width={320} height={18} fill="#8b6b4a" />
      {task === 'EXPANSION' && (
        <g aria-label={`Steam ${steam ? 'passing through the jacket' : p.boiler ? 'can heating' : 'off'}; micrometer ${p.contact ? 'touching the rod' : 'backed off'}`}>
          {/* steam can on a tripod over the burner */}
          <path d="M18 192 L28 150 M72 192 L62 150" stroke="#444" strokeWidth="3" />
          <rect x={22} y={146} width={46} height={4} fill="#777" />
          <rect x={41} y={168} width={8} height={24} fill="#555" />
          {p.boiler && <path d="M45 168 q-6 -9 0 -17 q6 8 0 17 Z" fill="#3b82f6" opacity={0.8} />}
          <rect x={26} y={104} width={38} height={42} rx={4} fill="#a7afb7" stroke="#59616a" />
          <path d="M45 104 V90 H96 V118" fill="none" stroke="#7a4a2a" strokeWidth="3" />
          {/* jacket with the rod */}
          <rect x={90} y={118} width={170} height={20} rx={8} fill="#c9a66b" stroke="#8a6b3a" />
          <rect x={84} y={124} width={186} height={8} fill={thermMetal(v).colour} stroke="#6b5520" strokeWidth="0.6" />
          <rect x={78} y={116} width={8} height={24} fill="#555" />
          {/* micrometer at the right */}
          <rect x={286 + (p.contact ? 0 : 6)} y={122} width={22} height={12} fill="#9aa3ab" stroke="#4b5563" />
          <rect x={272 + (p.contact ? 0 : 6)} y={126} width={16} height={4} fill="#c0c7cd" />
          <path d="M284 112 v34 h28 v-34 z" fill="none" stroke="#2a6fb5" strokeWidth="2.5" />
          {/* thermometer through a cork in the jacket */}
          <rect x={172} y={52} width={5} height={72} rx={2.5} fill="#eef3f6" stroke="#9aa5ad" strokeWidth="0.6" />
          <rect x={173.5} y={52 + 66 - Math.max(0, Math.min(1, (p.thJ + 10) / 120)) * 60} width={2} height={Math.max(0, Math.min(1, (p.thJ + 10) / 120)) * 60} fill="#9aa5ad" />
          {/* steam outlet into a beaker */}
          <path d="M240 138 V170" stroke="#7a4a2a" strokeWidth="3" />
          <path d="M226 160 v30 h30 v-30" fill="#e7f3fb" stroke="#7aa7c7" strokeWidth="1.4" />
          {steam && [0, 1, 2].map((i) => <circle key={i} cx={240 + (i - 1) * 6} cy={156 - i * 5} r={3 + i} fill="#fff" opacity={0.7} />)}
          {/* metre rule on the bench */}
          <rect x={84} y={176} width={186} height={8} fill="#e8d3a6" stroke="#a88b55" />
        </g>
      )}
      {task === 'CHARLES' && (
        <g aria-label={`Beaker of water at about ${Math.round(p.tw)} °C; burner ${p.bunsen ? 'lit' : 'off'}; tube ${p.immersed === 'full' ? 'fully immersed' : p.immersed === 'part' ? 'partly immersed' : 'out of the water'}`}>
          <path d="M100 192 L114 150 M220 192 L206 150" stroke="#444" strokeWidth="3" />
          <rect x={108} y={146} width={104} height={4} fill="#777" />
          <rect x={155} y={168} width={10} height={24} fill="#555" />
          {p.bunsen && <path d="M160 168 q-7 -10 0 -19 q7 9 0 19 Z" fill="#3b82f6" opacity={0.8} />}
          <path d="M116 56 v88 q0 2 2 2 h84 q2 0 2 -2 v-88" fill="none" stroke="#7aa7c7" strokeWidth="1.8" />
          <rect x={117} y={70} width={86} height={75} fill={tempColour(p.tw)} opacity={0.85} />
          {(() => {
            const dy = p.immersed === 'full' ? 0 : p.immersed === 'part' ? -26 : -70;
            return (
              <g transform={`translate(0 ${dy})`}>
                <rect x={150} y={30} width={14} height={110} fill="#f3ead2" stroke="#b39b62" />
                <rect x={166} y={60} width={5} height={78} rx={2} fill="#eaf5fb" stroke="#9cb8c8" />
                <rect x={167} y={138 - (thermColumnPx(p, v))} width={3} height={thermColumnPx(p, v)} fill="#ffffff" />
                <rect x={167} y={132 - thermColumnPx(p, v)} width={3} height={6} fill="#8f2d1b" />
                <rect x={140} y={48} width={5} height={92} rx={2.5} fill="#eef3f6" stroke="#9aa5ad" strokeWidth="0.6" />
                <rect x={147} y={84} width={26} height={3} fill="#b45309" />
                <rect x={147} y={120} width={26} height={3} fill="#b45309" />
              </g>
            );
          })()}
          <path d={`M190 40 V${130 + (p.t < p.stirUntil ? Math.sin(p.t * 7) * 6 : 0)} h-10`} stroke="#9ca3af" strokeWidth="2" fill="none" />
        </g>
      )}
      {task === 'ELECTRIC' && (
        <g aria-label={`Calorimeter${f.lagged ? ' in its lagging' : ''}${f.lid ? ', covered' : ''}; heater ${f.heaterIn ? 'in the water' : 'out'}, ${p.on ? 'on' : 'off'}`}>
          {/* supply, ammeter, voltmeter */}
          <rect x={14} y={150} width={56} height={40} rx={4} fill="#1f2937" />
          <text x={42} y={174} textAnchor="middle" fontSize="10" fill="#e5e7eb">
            12 V d.c.
          </text>
          <circle cx={100} cy={170} r={14} fill="#f8fafc" stroke="#334155" />
          <text x={100} y={174} textAnchor="middle" fontSize="11" fontWeight="700" fill="#334155">
            A
          </text>
          <circle cx={200} cy={60} r={14} fill="#f8fafc" stroke="#334155" />
          <text x={200} y={64} textAnchor="middle" fontSize="11" fontWeight="700" fill="#334155">
            V
          </text>
          {f.wire !== 'none' && (
            <g stroke="#b91c1c" strokeWidth="1.6" fill="none">
              <path d="M70 165 H86" />
              <path d="M114 170 H136 V40 H160" />
              <path d="M70 178 H90 V196 H230 V40 H188" stroke="#111827" />
              <path d={f.wire === 'ok' ? 'M186 60 H170 V46' : 'M186 60 H120 V158'} stroke="#2563eb" />
              <path d="M214 60 H226 V46" stroke="#2563eb" />
            </g>
          )}
          {f.lagged && <rect x={140} y={92} width={84} height={98} rx={4} fill="#efe9dc" stroke="#a39a86" />}
          {!f.pan && (
            <g>
              <rect x={152} y={100} width={60} height={88} rx={3} fill="#d49a6a" stroke="#7a4524" />
              {f.poured && <rect x={154} y={118} width={56} height={68} fill={tempColour(p.te)} opacity={0.9} />}
              {f.lid && <rect x={148} y={94} width={68} height={6} rx={2} fill="#9c5a2e" />}
              {f.heaterIn && (
                <g>
                  <path d="M162 40 V176" stroke="#6b7280" strokeWidth="3" />
                  <path d="M162 150 q8 4 0 8 q-8 4 0 8 q8 4 0 8" stroke={p.on ? '#f97316' : '#6b7280'} strokeWidth="3" fill="none" />
                </g>
              )}
              <rect x={190} y={60} width={5} height={124} rx={2.5} fill="#eef3f6" stroke="#9aa5ad" strokeWidth="0.6" />
              <path d={`M204 70 V${178 + (f.stirring ? Math.sin(p.t * 6) * 5 : 0)} h-12`} stroke="#b0703f" strokeWidth="2" fill="none" />
            </g>
          )}
          {/* balance */}
          <rect x={246} y={170} width={64} height={20} rx={3} fill="#e5e7eb" stroke="#6b7280" />
          <rect x={258} y={164} width={40} height={6} fill="#9ca3af" />
          {f.pan && <rect x={262} y={124} width={32} height={40} rx={3} fill="#d49a6a" stroke="#7a4524" />}
        </g>
      )}
    </svg>
  );
}
const thermColumnPx = (p: ThermPhys, v: PhyThermalVariant) => Math.min(76, 6 * ((v.lRef * (p.air + 273)) / (v.room + 273)));

// ------------------------------------------------------------------ the 2D lab

function ClockBar({ o }: { o: Thermal }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
      <Timer className="size-3.5 text-muted-foreground" aria-hidden />
      <span className="tabular text-muted-foreground" aria-label="Lab clock">
        Lab clock {clockText(o.now())}
      </span>
      <span className="text-muted-foreground">· time-lapse</span>
      {SPEEDS.map((x) => (
        <Button key={x} size="sm" variant={o.speed === x ? 'brand' : 'outline'} className="h-7 px-2" onClick={() => o.setSpeed(x)} aria-pressed={o.speed === x}>
          ×{x}
        </Button>
      ))}
    </div>
  );
}

/** Thermometer parallax for an eye above (+) or below (−) the end of the mercury (°C). */
export const THERMO_SHIFT = 0.6;
export const READ_LABEL: Record<ThermInstrument, string> = { thermo: 'Thermometer', micro: 'Micrometer', rule: 'Metre rule (rod)', column: 'Air column (ruler)', ammeter: 'Ammeter', voltmeter: 'Voltmeter', balance: 'Balance', watch: 'Stopwatch' };

/** A close-up of an instrument as it reads now, with the eye's parallax (shared with the 3D reading panel). */
export function InstrumentView({ o, k, eye }: { o: Thermal; k: ThermInstrument; eye: EyePos }) {
  const x = o.shows(k);
  const task = o.ref.current.task ?? 'EXPANSION';
  switch (k) {
    case 'thermo':
      return <ThermoLoupe at={x} shift={eye * THERMO_SHIFT} label={task === 'EXPANSION' ? 'the thermometer in the steam jacket' : task === 'CHARLES' ? 'the thermometer in the water' : 'the thermometer in the calorimeter'} />;
    case 'micro':
      return <MicrometerSvg reading={x} eye={eye} closed={o.phys().contact} label="steam jacket" />;
    case 'rule':
      return <RuleLoupe mm={x} shift={eye * 1.2} />;
    case 'column':
      return <ColumnLoupe l={x} shift={eye * 0.12} />;
    case 'ammeter':
      return <MeterSvg letter="A" value={x} fsd={3} minor={0.05} major={0.5} shift={eye * 0.04} />;
    case 'voltmeter':
      return <MeterSvg letter="V" value={x} fsd={15} minor={0.2} major={1} shift={eye * 0.15} />;
    case 'balance':
      return <Display text={`${x.toFixed(1)} g`} label={`The balance reads ${x.toFixed(1)} g`} tone="blue" />;
    case 'watch':
      return <Display text={`${Math.floor(x)} s`} label={`The stopwatch reads ${Math.floor(x)} seconds`} />;
  }
}
export const instrumentsFor = (task: ThermTask): ThermInstrument[] => (task === 'EXPANSION' ? ['rule', 'thermo', 'micro'] : task === 'CHARLES' ? ['thermo', 'column'] : ['balance', 'thermo', 'voltmeter', 'ammeter', 'watch']);

function B({ on, children, onClick, disabled, brand }: { on?: boolean; children: ReactNode; onClick: () => void; disabled?: boolean; brand?: boolean }) {
  return (
    <Button size="sm" variant={on || brand ? 'brand' : 'outline'} onClick={onClick} disabled={disabled} aria-pressed={on}>
      {children}
    </Button>
  );
}

export default function PhyThermalLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'phy-thermal'>) {
  const o = useThermal({ seed, state, onChange, readOnly, startedAt, practicalId });
  const { v, task } = o;
  useLive(!readOnly, 150);
  const p = o.phys();
  const f = thermFlags(state.events);
  const [msg, setMsg] = useState<string | null>(null);
  const [eye, setEye] = useState<EyePos>(1);
  const kinds = instrumentsFor(task);
  const [k, setK] = useState<ThermInstrument>(kinds[0]!);
  const shown = kinds.includes(k) ? k : kinds[0]!;
  const say = (m: string | null) => setMsg(m);
  return (
    <div className="space-y-4">
      <TaskCard icon={<Thermometer className="size-4 text-muted-foreground" aria-hidden />}>
        <ThermTaskText task={state.task} />
        {!readOnly && state.events.length === 0 && state.reads.length === 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(['EXPANSION', 'CHARLES', 'ELECTRIC'] as const).map((t) => (
              <Button key={t} size="sm" variant={state.task === t ? 'brand' : 'outline'} onClick={() => o.chooseTask(t)} aria-pressed={state.task === t}>
                {t === 'EXPANSION' ? 'Linear expansivity' : t === 'CHARLES' ? 'Charles’s law' : 'Electrical heating'}
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
            {task === 'EXPANSION' && <Badge variant="outline">Rod: {thermMetal(v).name}</Badge>}
          </div>
          {!readOnly && mode === 'LAB' && state.task && <p className="mb-3 rounded-xl bg-info-soft px-3 py-2 text-[12.5px] text-info">{thermHint(state, f, p, v)}</p>}
          {!readOnly && <ClockBar o={o} />}
          <div className="mt-2">
            <BenchSvg task={task} p={p} f={f} v={v} />
          </div>
          {state.task && !readOnly && (
            <div className="mt-4 space-y-3">
              {task === 'EXPANSION' && (
                <>
                  <Step title="1. The steam">
                    <div className="flex flex-wrap gap-1.5">
                      <B on={f.boiler} onClick={() => o.boiler(!f.boiler)}>
                        <Flame /> {f.boiler ? 'Burner under the can on (turn off)' : 'Light the burner under the steam can'}
                      </B>
                    </div>
                    <p className="text-[11.5px] text-muted-foreground">{p.boiler && p.can < v.boil - 0.05 ? 'The water in the can is heating…' : p.boiler ? 'Steam is passing through the jacket and out into the beaker.' : 'No steam.'}</p>
                  </Step>
                  <Step title="2. The micrometer at the end of the rod">
                    <div className="flex flex-wrap gap-1.5">
                      <B brand onClick={o.ratchet}>
                        Turn the ratchet until it clicks (touch the rod)
                      </B>
                      <B onClick={o.thimble}>Screw the thimble up tight</B>
                      <B onClick={o.backOff}>
                        <RotateCcw /> Back it off
                      </B>
                    </div>
                  </Step>
                </>
              )}
              {task === 'CHARLES' && (
                <Step title="1. The water bath">
                  <div className="flex flex-wrap gap-1.5">
                    <B on={f.immersed === 'full'} onClick={() => o.immerse(true)}>
                      Air column fully under the water
                    </B>
                    <B on={f.immersed === 'part'} onClick={() => o.immerse(false)}>
                      Only partly under
                    </B>
                    <B onClick={o.ice} disabled={f.bunsen || state.rows.length > 0}>
                      Add ice (start cold)
                    </B>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <B on={f.bunsen} onClick={() => o.bunsen(!f.bunsen)}>
                      <Flame /> {f.bunsen ? 'Remove the flame' : 'Heat with the Bunsen'}
                    </B>
                    <B brand onClick={o.stirOnce}>
                      Stir well
                    </B>
                  </div>
                </Step>
              )}
              {task === 'ELECTRIC' && (
                <>
                  <Step title="1. The balance and the water">
                    <div className="flex flex-wrap gap-1.5">
                      <B on={f.pan} onClick={() => (f.heaterIn ? say('Take the heater out first.') : o.pan(!f.pan))}>
                        {f.pan ? 'Calorimeter on the balance (take it off)' : 'Put the calorimeter on the balance'}
                      </B>
                      <B onClick={o.pour} disabled={f.poured}>
                        Pour in about 200 g of water
                      </B>
                    </div>
                  </Step>
                  <Step title="2. The calorimeter and the circuit">
                    <div className="flex flex-wrap gap-1.5">
                      <B on={f.lagged} onClick={() => o.lag(!f.lagged)} disabled={f.pan}>
                        {f.lagged ? 'In its lagging' : 'Stand it in its lagging'}
                      </B>
                      <B on={f.heaterIn} onClick={() => o.heater(!f.heaterIn)} disabled={f.pan}>
                        {f.heaterIn ? 'Heater in the water (take out)' : 'Put the heater in'}
                      </B>
                      <B on={f.lid} onClick={() => o.lid(!f.lid)} disabled={f.pan}>
                        {f.lid ? 'Lid on' : 'Put the lid on'}
                      </B>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <B on={f.wire === 'ok'} onClick={() => o.wire('ok')}>
                        Ammeter in series, voltmeter across the heater
                      </B>
                      <B on={f.wire === 'wide'} onClick={() => o.wire('wide')}>
                        Voltmeter across the heater and ammeter
                      </B>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {!f.on ? (
                        <B brand onClick={() => o.switchOn(true)} disabled={f.wire === 'none'}>
                          <Zap /> Switch on and start the stopwatch
                        </B>
                      ) : (
                        <B brand onClick={o.switchOff}>
                          <Zap /> Switch off
                        </B>
                      )}
                      <B on={f.stirring} onClick={() => o.stir(!f.stirring)} disabled={!f.poured}>
                        {f.stirring ? 'Stirring (stop)' : 'Stir continuously'}
                      </B>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <B onClick={() => (f.watch === 'running' ? o.watchStop() : o.watchStart())}>
                        {f.watch === 'running' ? <Pause /> : <Play />} {f.watch === 'running' ? 'Stop the stopwatch' : 'Start the stopwatch'}
                      </B>
                      <B onClick={o.watchReset} disabled={f.watch === 'running'}>
                        Reset
                      </B>
                      <Display text={clockText(o.watchTime())} label={`Stopwatch ${Math.floor(o.watchTime())} s`} />
                    </div>
                  </Step>
                </>
              )}
              <Step title={`${task === 'CHARLES' ? '2' : task === 'EXPANSION' ? '3' : '3'}. Read an instrument`}>
                <div className="flex flex-wrap gap-1.5">
                  {kinds.map((x) => (
                    <Button key={x} size="sm" variant={shown === x ? 'brand' : 'outline'} className="h-7 px-2" onClick={() => setK(x)} aria-pressed={shown === x}>
                      {READ_LABEL[x]}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap items-start gap-3">
                  <InstrumentView o={o} k={shown} eye={eye} />
                  <div className="space-y-2">
                    {!['balance', 'watch'].includes(shown) && <EyeControl eye={eye} onEye={setEye} vertical={shown !== 'micro' && shown !== 'rule'} compact />}
                    <Button size="sm" variant="brand" onClick={() => say(o.read(shown))}>
                      <Camera /> Take this reading
                    </Button>
                    <p className="max-w-[200px] text-[11.5px] text-muted-foreground">Write what you read in your table. Look square on to the scale, or the reading is off (parallax).</p>
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

export const CELL_LABEL: Record<string, string> = {
  l0: 'Length of the rod at room temperature, l₀ / mm',
  th1: 'Temperature before the steam, θ₁ / °C',
  r1: 'Micrometer reading, rod cold, r₁ / mm',
  th2: 'Temperature of the steam, θ₂ / °C',
  r2: 'Micrometer reading, rod hot, r₂ / mm',
  r2b: 'r₂ repeated a minute later / mm',
  e: 'Expansion e = r₁ − r₂ / mm',
  dth: 'Rise in temperature θ₂ − θ₁ / K',
  mc: 'Mass of the empty calorimeter + stirrer / g',
  mcw: 'Mass of calorimeter + water / g',
  m: 'Mass of water, m / g',
  V: 'Voltmeter reading, V / V',
  I: 'Ammeter reading, I / A',
  t: 'Time the heater was on, t / s',
  th0: 'Initial temperature, θ₀ / °C',
  thmax: 'Highest temperature, θ_max / °C',
};
const cellLabel = (task: ThermTask, id: string) => (task === 'ELECTRIC' && id === 'dth' ? 'Rise in temperature Δθ = θ_max − θ₀ / K' : CELL_LABEL[id]!);
const CELLS: Record<ThermTask, string[]> = { EXPANSION: ['l0', 'th1', 'r1', 'th2', 'r2', 'r2b', 'e', 'dth'], CHARLES: [], ELECTRIC: ['mc', 'mcw', 'm', 'V', 'I', 't', 'th0', 'thmax', 'dth'] };
export const ANSWER_LABEL: Record<ThermAnswerId, string> = {
  alpha: 'Linear expansivity, α = e ÷ (l₀ (θ₂ − θ₁))',
  slope: 'Slope of your line',
  zero: 'Absolute zero: θ where your line meets l = 0',
  ratio: 'l/T (mean of your readings)',
  energy: 'Electrical energy supplied, E = VIt',
  power: 'Power of the heater, P = VI',
  c: 'Specific heat capacity of water, c = E ÷ (m Δθ)',
};
const ANSWERS: Record<ThermTask, ThermAnswerId[]> = { EXPANSION: ['alpha'], CHARLES: ['slope', 'zero', 'ratio'], ELECTRIC: ['energy', 'power', 'c'] };
const num = (x: string | undefined) => {
  const t = (x ?? '').trim();
  const n = Number(t);
  return t && Number.isFinite(n) ? n : null;
};

export function Notebook({ task, state, readOnly, o }: { task: ThermTask; state: PhyThermalState; readOnly: boolean; o: Pick<Thermal, 'update' | 'setCell' | 'setRow' | 'addRow' | 'removeRow' | 'removeRead'> }) {
  const setAnswer = (id: ThermAnswerId, key: 'value' | 'unit', value: string) => o.update((s) => ({ ...s, answers: { ...s.answers, [id]: { ...s.answers[id], [key]: value } } }));
  const rowOf = (key: number) => state.rows.find((r) => r.key === key);
  const charlesPts = state.rows.map((r) => ({ x: num(r.c.th), y: num(r.c.l) })).filter((p): p is { x: number; y: number } => p.x !== null && p.y !== null);
  const elecPts = THERM_TIMES.map((t) => ({ x: t, y: num(rowOf(t)?.c.th) })).filter((p): p is { x: number; y: number } => p.y !== null);
  const charlesTop = Math.max(12, ...charlesPts.map((p) => p.y + 1));
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="mb-3 font-display text-[15px] font-semibold tracking-tight">Your record</h3>
      {state.reads.length > 0 && (
        <div className="mb-3 rounded-xl border border-border p-2 text-[12px]">
          <p className="mb-1 font-semibold">Readings taken (the instrument and the lab-clock time)</p>
          <ul className="flex max-h-28 flex-wrap gap-x-3 gap-y-0.5 overflow-y-auto">
            {state.reads.map((r, i) => (
              <li key={i} className="flex items-center gap-0.5">
                <span className="tabular">
                  {i + 1}. {READ_LABEL[r.k]} {clockText(r.t)}
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
      )}
      {CELLS[task].length > 0 && (
        <table className="w-full text-[13px]">
          <tbody>
            {CELLS[task].map((id) => (
              <tr key={id} className="border-t border-border">
                <td className="py-1.5 pr-2 text-[12.5px] text-muted-foreground">{cellLabel(task, id)}</td>
                <td className="py-1.5">
                  <Cell value={state.cells[id] ?? ''} onChange={(x) => o.setCell(id, x)} readOnly={readOnly} label={cellLabel(task, id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {task === 'EXPANSION' && <p className="mt-1 text-[11.5px] text-muted-foreground">l₀ to the nearest mm; the micrometer to 0.01 mm; temperatures to 1 decimal place. Keep e and l₀ in the same unit.</p>}
      {task === 'CHARLES' && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[300px] text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] text-muted-foreground">
                  <th className="px-1 py-1 font-medium">θ / °C</th>
                  <th className="px-1 py-1 font-medium">l / cm</th>
                  <th className="px-1 py-1 font-medium">T / K</th>
                  <th className="px-1 py-1 font-medium">(l/T) / cm K⁻¹</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-3 text-muted-foreground">
                      A row appears each time you read the air column (or add one).
                    </td>
                  </tr>
                )}
                {state.rows.map((r) => (
                  <tr key={r.key} className="border-t border-border">
                    {(['th', 'l', 'T', 'lT'] as const).map((c) => (
                      <td key={c} className="px-1 py-1">
                        <Cell value={r.c[c] ?? ''} onChange={(x) => o.setRow(r.key, c, x)} readOnly={readOnly} label={`Row ${r.key + 1}: ${c}`} />
                      </td>
                    ))}
                    <td>
                      {!readOnly && (
                        <Button size="icon-sm" variant="ghost" onClick={() => o.removeRow(r.key)} aria-label={`Delete row ${r.key + 1}`}>
                          ×
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!readOnly && (
            <Button size="sm" variant="ghost" className="mt-1" onClick={o.addRow}>
              <Plus /> Add a row
            </Button>
          )}
          <p className="mt-1 text-[11.5px] text-muted-foreground">θ to 1 decimal place; l to the nearest 0.5 mm (in cm); T = θ + 273.</p>
          <div className="mt-5">
            <p className="mb-2 text-[12.5px] font-semibold">Graph of l against θ (extend it back to l = 0)</p>
            <ThermGraph points={charlesPts} line={state.line} onLine={(line) => o.update((s) => ({ ...s, line }))} readOnly={readOnly} xLabel="θ / °C" yLabel="l / cm" x={[-300, 100]} y={[0, charlesTop]} extendToZero />
          </div>
        </>
      )}
      {task === 'ELECTRIC' && (
        <>
          <div className="mt-4 overflow-x-auto">
            <p className="mb-1 text-[12.5px] font-semibold">Temperature while heating</p>
            <table className="text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] text-muted-foreground">
                  <th className="px-1 py-1 font-medium">t / s</th>
                  {THERM_TIMES.map((t) => (
                    <th key={t} className="px-1 py-1 font-medium tabular">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-1 py-1 text-[11.5px] text-muted-foreground">θ / °C</td>
                  {THERM_TIMES.map((t) => (
                    <td key={t} className="px-0.5 py-1">
                      <Cell value={rowOf(t)?.c.th ?? ''} onChange={(x) => o.setRow(t, 'th', x)} readOnly={readOnly} label={`Temperature at ${t} s`} />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-5">
            <p className="mb-2 text-[12.5px] font-semibold">Graph of θ against t</p>
            <ThermGraph points={elecPts} line={state.line} onLine={(line) => o.update((s) => ({ ...s, line }))} readOnly={readOnly} xLabel="t / s" yLabel="θ / °C" x={[0, 300]} y="auto" />
          </div>
        </>
      )}
      <div className="mt-5 space-y-3">
        <p className="text-[12.5px] font-semibold">Calculations</p>
        {ANSWERS[task].map((id) => (
          <AnswerRow key={id} id={id} label={ANSWER_LABEL[id]} answer={state.answers[id]} onChange={(k, x) => setAnswer(id, k, x)} readOnly={readOnly} unitHint="unit" />
        ))}
      </div>
      <div className="mt-5">
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="thermal-precautions">
          Two precautions you took
        </label>
        <Textarea id="thermal-precautions" value={state.written.precautions} onChange={(e) => o.update((s) => ({ ...s, written: { precautions: e.target.value.slice(0, 2000) } }))} disabled={readOnly} rows={3} />
      </div>
    </Card>
  );
}
