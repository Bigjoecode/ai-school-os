import {
  SONO_CARD_LOAD,
  SONO_HANGER,
  SONO_MAX,
  SONO_MAX_LOAD,
  SOUND_CARD,
  SOUND_FORKS,
  TUBE_MAX,
  type PhySoundState,
  type SonoRow,
  type SoundAnswerId,
  type SoundTask,
  type TubeRow,
} from '@aischool/shared';
import { AudioLines, Camera, Hand, Lightbulb, Minus, Music, Plus, Volume2, VolumeX } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AnswerRow, Cell, PhyGraph, Step, TaskCard, numericPoints } from '../phy-common';
import type { SimulatorProps } from '../types';
import { lenLimits, loadName, meterLevel, soundHint, useLive, useSound, type Sound } from './actions';
import { forkSoundOn, setForkSound } from './synth';

/** The question paper for each task. */
export function SoundTaskText({ task }: { task: SoundTask | null }) {
  if (task === 'SONO')
    return (
      <>
        <p>You are provided with a sonometer (a wire over two bridges on a hollow box, its tension from a hanger of masses over a pulley), a set of tuning forks, a rubber pad, a paper rider and a metre scale.</p>
        <ol className="list-[lower-roman] space-y-0.5 pl-6">
          <li>Hang a load of M = {SONO_CARD_LOAD.toFixed(1)} kg on the wire and keep it the same throughout.</li>
          <li>Place the paper rider on the middle of the wire between the bridges. Strike the {SOUND_CARD.SONO[0]} Hz fork on the rubber pad and press its stem on the box. Move the bridge until the rider is thrown off. Measure the length l between the bridges.</li>
          <li>Repeat with the {SOUND_CARD.SONO.slice(1).join(', ')} Hz forks.</li>
          <li>Tabulate f, l and 1/l. Plot f against 1/l and find the slope.</li>
          <li>Hence find the speed v of the transverse wave (slope = v/2), the tension T = Mg and the mass per unit length μ = T/v². State two precautions.</li>
        </ol>
      </>
    );
  return (
    <>
      <p>You are provided with a resonance tube standing in a tall jar of water, a set of tuning forks, a rubber pad and a metre rule.</p>
      <ol className="list-[lower-roman] space-y-0.5 pl-6">
        <li>Strike the 512 Hz fork on the rubber pad and hold it horizontally just above the open end. Starting with a short air column, raise the tube slowly until the sound is loudest (the first resonance). Measure the length l₁ of the air column.</li>
        <li>Repeat with the {SOUND_CARD.TUBE.slice(0, -1).join(', ')} Hz forks.</li>
        <li>For the 512 Hz fork, raise the tube further to the second resonance and measure l₂.</li>
        <li>Tabulate f, 1/f and l. Plot l against 1/f; find the slope and the intercept on the l-axis.</li>
        <li>Since l + e = v/(4f), find the speed of sound v (slope = v/4) and the end correction e (intercept = −e). Also find v = 2f(l₂ − l₁). State two precautions.</li>
      </ol>
    </>
  );
}

/** The loudness meter: what your ear hears (a visual cue for students without sound). */
export function LoudnessMeter({ level, className, dark }: { level: number; className?: string; dark?: boolean }) {
  const n = 14;
  const lit = Math.round(Math.max(0, Math.min(1, level)) * n);
  return (
    <div className={cn('flex items-end gap-[3px]', className)} role="meter" aria-label="Loudness" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className={cn('w-[6px] rounded-sm', i < lit ? (i >= n - 3 ? 'bg-rose-500' : i >= n - 6 ? 'bg-amber-400' : 'bg-emerald-500') : dark ? 'bg-white/15' : 'bg-muted')}
          style={{ height: 6 + i * 1.6 }}
        />
      ))}
    </div>
  );
}

/** A magnified strip of the scale around the reading (to 0.1 cm): vertical for the tube, horizontal for the sonometer. */
export function ScaleLoupe({ at, vertical }: { at: number; vertical: boolean }) {
  const L = 220;
  const k = 24; // px per cm
  const centre = Math.round(at * 10) / 10;
  const P = (cm: number) => L / 2 + (cm - centre) * k;
  const lo = Math.floor(centre) - 5;
  const ticks: number[] = [];
  for (let mm = lo * 10; mm <= (lo + 10) * 10; mm++) if (mm >= 0) ticks.push(mm);
  const mark = P(at);
  return (
    <figure className="space-y-1">
      <svg viewBox={vertical ? `0 0 130 ${L}` : `0 0 ${L} 110`} className={cn('rounded-lg border border-border bg-[#f3d98f]', vertical ? 'h-[220px] w-[130px]' : 'h-[110px] w-[220px]')} role="img" aria-label={vertical ? 'Close-up of the rule at the water level' : 'Close-up of the scale at the moving bridge'}>
        {ticks.map((mm) => {
          const p = P(mm / 10);
          const len = mm % 10 === 0 ? 30 : mm % 5 === 0 ? 21 : 13;
          return vertical ? (
            <g key={mm}>
              <line x1={0} x2={len} y1={p} y2={p} stroke="#1b1b1b" strokeWidth={mm % 10 === 0 ? 1.4 : 0.8} />
              {mm % 10 === 0 && (
                <text x={36} y={p + 4} fontSize="13" fontWeight="700" fill="#1b1b1b">
                  {mm / 10}
                </text>
              )}
            </g>
          ) : (
            <g key={mm}>
              <line y1={0} y2={len} x1={p} x2={p} stroke="#1b1b1b" strokeWidth={mm % 10 === 0 ? 1.4 : 0.8} />
              {mm % 10 === 0 && (
                <text y={48} x={p} textAnchor="middle" fontSize="13" fontWeight="700" fill="#1b1b1b">
                  {mm / 10}
                </text>
              )}
            </g>
          );
        })}
        {vertical ? (
          <g>
            <rect x={0} y={mark} width={130} height={L - mark} fill="#4fa3d9" opacity={0.35} />
            <line x1={0} x2={130} y1={mark} y2={mark} stroke="#1565c0" strokeWidth={1.6} />
          </g>
        ) : (
          <path d={`M${mark - 9} 110 L${mark} 66 L${mark + 9} 110 Z`} fill="#6d4c2f" />
        )}
      </svg>
      <figcaption className="max-w-[220px] text-[11px] text-muted-foreground">{vertical ? 'The water surface against the rule (0 at the top of the tube): this is l.' : 'The moving bridge against the scale (0 at the fixed bridge): this is l.'}</figcaption>
    </figure>
  );
}

/** The resonance tube from the front: jar and water, the tube (0 at its top), the fork over the mouth and the sound. */
function TubeSvg({ s, o, now }: { s: PhySoundState; o: Sound; now: number }) {
  const k = 3.6;
  const water = 400;
  const top = water - s.len * k;
  const lvl = meterLevel(o.level(now), now);
  const ringing = o.ringing;
  const x0 = 104;
  const w = 26;
  return (
    <svg viewBox="0 0 260 470" className="mx-auto h-[min(470px,66vh)] w-auto select-none rounded-xl border border-border bg-gradient-to-b from-slate-50 to-slate-200 dark:from-slate-800 dark:to-slate-900" role="img" aria-label={`Resonance tube with ${s.len.toFixed(1)} cm of air above the water${ringing ? `; the fork is sounding${lvl > 0.6 ? ' loudly' : ''}` : ''}`}>
      {/* the jar */}
      <rect x={70} y={60} width={94} height={400} rx={6} fill="#dfeef7" opacity={0.6} stroke="#8fb3c9" />
      <rect x={72} y={water} width={90} height={458 - water} fill="#4fa3d9" opacity={0.55} />
      {/* the tube: its top is at `top`; inside, the water stands at the jar's level */}
      <rect x={x0} y={top} width={w} height={460 - top} fill="#f4fbff" opacity={0.75} stroke="#7aa6c2" strokeWidth={1.2} />
      <rect x={x0 + 1.5} y={water} width={w - 3} height={458 - water} fill="#2f8ccc" opacity={0.6} />
      {/* the scale on the tube, 0 at the top */}
      {Array.from({ length: Math.floor((460 - top) / k) + 1 }, (_, cm) => cm).map((cm) => (
        <line key={cm} x1={x0 + w} x2={x0 + w + (cm % 10 === 0 ? 9 : cm % 5 === 0 ? 6 : 3.5)} y1={top + cm * k} y2={top + cm * k} stroke="#334" strokeWidth={cm % 10 === 0 ? 1 : 0.5} />
      ))}
      {Array.from({ length: Math.floor((460 - top) / k / 10) + 1 }, (_, i) => i * 10).map((cm) => (
        <text key={cm} x={x0 + w + 11} y={top + cm * k + 3} fontSize="8" fontWeight="700" fill="#334">
          {cm}
        </text>
      ))}
      {/* the clamp */}
      <rect x={20} y={top + 20} width={x0 - 18} height={6} className="fill-slate-500" />
      <rect x={14} y={20} width={6} height={440} className="fill-slate-400" />
      {/* the fork over the mouth, prongs horizontal */}
      {s.fork && (
        <g transform={`translate(${x0 + w / 2 - 34}, ${top - 14})`}>
          <rect x={0} y={-2} width={36} height={4} rx={2} fill="#9aa4ad" />
          <rect x={0} y={4} width={36} height={4} rx={2} fill="#9aa4ad" transform={ringing ? `translate(0 ${Math.sin(now / 9) * 0.8})` : undefined} />
          <rect x={36} y={-2} width={8} height={10} rx={3} fill="#7d878f" />
          <rect x={44} y={1} width={30} height={4} rx={2} fill="#6c757d" />
          <text x={4} y={-6} fontSize="8" fill="#455">
            {s.fork} Hz
          </text>
        </g>
      )}
      {/* the sound coming out of the mouth (visual loudness cue) */}
      {ringing &&
        [0, 1, 2].map((i) => {
          const ph = ((now / 600 + i / 3) % 1 + 1) % 1;
          return <ellipse key={i} cx={x0 + w / 2} cy={top - 6} rx={14 + ph * 50} ry={5 + ph * 16} fill="none" stroke="#e65100" strokeWidth={2} opacity={Math.min(1, lvl * 1.2) * (1 - ph)} />;
        })}
    </svg>
  );
}

/** The sonometer from the front: the box and scale, the fixed and the moving bridge, the wire, the rider, the pulley and the load. */
function SonoSvg({ s, o, now }: { s: PhySoundState; o: Sound; now: number }) {
  const x0 = 30;
  const k = 3.3;
  const xb = x0 + s.len * k;
  const wy = 96;
  const drive = o.riderDrive(now);
  const lvl = meterLevel(o.level(now), now);
  const amp = Math.min(9, 9 * (o.ringing ? Math.max(drive, o.level(now) * 0.5) : 0));
  const mid = (x0 + xb) / 2;
  const slack = s.load === 0;
  return (
    <svg viewBox="0 0 400 230" className="mx-auto w-full max-w-[560px] select-none rounded-xl border border-border bg-gradient-to-b from-slate-50 to-slate-200 dark:from-slate-800 dark:to-slate-900" role="img" aria-label={`Sonometer, bridges ${s.len.toFixed(1)} cm apart, ${loadName(s.load)}; rider ${s.rider ? 'on the wire' : 'off'}`}>
      {/* box and scale */}
      <rect x={14} y={108} width={356} height={46} rx={4} fill="#c49a6c" stroke="#7a5a3a" />
      <circle cx={200} cy={131} r={9} fill="#5b4128" />
      {Array.from({ length: SONO_MAX + 1 }, (_, cm) => cm).map((cm) => (
        <line key={cm} x1={x0 + cm * k} x2={x0 + cm * k} y1={108} y2={108 + (cm % 10 === 0 ? 8 : cm % 5 === 0 ? 5 : 3)} stroke="#3e2f1c" strokeWidth={cm % 10 === 0 ? 1 : 0.5} />
      ))}
      {Array.from({ length: 11 }, (_, i) => i * 10).map((cm) => (
        <text key={cm} x={x0 + cm * k} y={124} textAnchor="middle" fontSize="7" fontWeight="700" fill="#3e2f1c">
          {cm}
        </text>
      ))}
      {/* bridges */}
      <path d={`M${x0 - 5} 108 L${x0} ${wy} L${x0 + 5} 108 Z`} fill="#6d4c2f" />
      <path d={`M${xb - 5} 108 L${xb} ${wy} L${xb + 5} 108 Z`} fill="#8d6e3f" />
      {/* the wire: from the peg, over the bridges, to the pulley */}
      <line x1={16} y1={wy + 4} x2={x0} y2={wy} stroke="#7b8691" strokeWidth={1.2} />
      {slack ? <path d={`M${x0} ${wy} Q ${mid} ${wy + 8} ${xb} ${wy}`} fill="none" stroke="#7b8691" strokeWidth={1.2} /> : <line x1={x0} y1={wy} x2={xb} y2={wy} stroke="#7b8691" strokeWidth={1.2} />}
      {amp > 0.3 && <ellipse cx={mid} cy={wy} rx={(xb - x0) / 2} ry={amp} fill="#7b8691" opacity={0.22} />}
      <line x1={xb} y1={wy} x2={376} y2={wy} stroke="#7b8691" strokeWidth={1.2} />
      <circle cx={380} cy={wy + 4} r={7} fill="#90a4ae" stroke="#455a64" />
      <line x1={387} y1={wy + 4} x2={387} y2={172} stroke="#7b8691" strokeWidth={1.2} />
      {s.load > 0 && (
        <g>
          <rect x={379} y={172} width={16} height={4} fill="#555" />
          {Array.from({ length: Math.round((s.load - SONO_HANGER) / 0.5) }, (_, i) => (
            <rect key={i} x={378} y={166 - i * 4.2} width={18} height={4} rx={1} fill={i % 2 ? '#9e9e9e' : '#b0b0b0'} stroke="#616161" strokeWidth={0.4} />
          ))}
          <text x={372} y={196} textAnchor="end" fontSize="8" fill="#455">
            {s.load.toFixed(1)} kg
          </text>
        </g>
      )}
      {/* the paper rider: on the middle of the wire, or thrown off onto the box */}
      {s.rider ? (
        <path d={`M${mid - 5} ${wy - 6 - (drive > 0.2 ? Math.abs(Math.sin(now / 30)) * drive * 3 : 0)} L${mid} ${wy} L${mid + 5} ${wy - 6}`} fill="none" stroke="#d32f2f" strokeWidth={2} />
      ) : (
        s.jump && <path d={`M${mid + 22} 104 l5 -4 l5 4`} fill="none" stroke="#d32f2f" strokeWidth={2} />
      )}
      {/* the fork pressed on the box */}
      {s.fork && o.ringing && (
        <g transform={`translate(${Math.min(330, xb + 30)}, 64)`}>
          <rect x={-2} y={0} width={4} height={30} fill="#9aa4ad" />
          <rect x={6} y={0} width={4} height={30} fill="#9aa4ad" />
          <rect x={-2} y={30} width={12} height={8} rx={3} fill="#7d878f" />
          <rect x={2} y={38} width={4} height={6} fill="#6c757d" />
          <text x={14} y={10} fontSize="8" fill="#455">
            {s.fork} Hz
          </text>
          {[0, 1].map((i) => {
            const ph = ((now / 500 + i / 2) % 1 + 1) % 1;
            return <circle key={i} cx={4} cy={14} r={10 + ph * 26} fill="none" stroke="#e65100" strokeWidth={1.5} opacity={Math.min(1, lvl * 1.3) * (1 - ph)} />;
          })}
        </g>
      )}
    </svg>
  );
}

export default function PhySoundLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'phy-sound'>) {
  const o = useSound({ seed, state, onChange, readOnly, startedAt, practicalId });
  const { task } = o;
  useLive(o.ringing, 60);
  const now = o.now();
  const [msg, setMsg] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(forkSoundOn());
  const lvl = meterLevel(o.level(now), now);
  const sono = task === 'SONO';
  const { min, max } = lenLimits(task);

  return (
    <div className="space-y-4">
      <TaskCard icon={<Music className="size-4 text-muted-foreground" aria-hidden />}>
        <SoundTaskText task={state.task} />
        {!readOnly && state.readings.length === 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(['TUBE', 'SONO'] as const).map((t) => (
              <Button key={t} size="sm" variant={state.task === t ? 'brand' : 'outline'} onClick={() => o.chooseTask(t)} aria-pressed={state.task === t}>
                {t === 'TUBE' ? 'The resonance tube' : 'The sonometer'}
              </Button>
            ))}
          </div>
        )}
      </TaskCard>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start [&>*]:min-w-0">
        <Card className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
              <AudioLines className="size-4 text-muted-foreground" aria-hidden /> {sono ? 'The sonometer' : 'The resonance tube'}
            </h3>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline">{state.fork ? `${state.fork} Hz fork` : 'no fork'}</Badge>
              <Button
                size="icon-sm"
                variant="outline"
                onClick={() => {
                  setForkSound(!soundOn);
                  setSoundOn(!soundOn);
                }}
                aria-label={soundOn ? 'Sound off' : 'Sound on'}
                aria-pressed={!soundOn}
              >
                {soundOn ? <Volume2 /> : <VolumeX />}
              </Button>
            </div>
          </div>
          {!readOnly && mode === 'LAB' && state.task && (
            <p className="mb-3 flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[12.5px] text-info">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {soundHint(state, o.struck, now)}
            </p>
          )}
          {state.task ? (
            <div className={cn('flex flex-wrap items-start justify-center gap-3', sono && 'flex-col items-stretch')}>
              {sono ? <SonoSvg s={state} o={o} now={now} /> : <TubeSvg s={state} o={o} now={now} />}
              <div className="flex flex-wrap items-start justify-center gap-3">
                <div className="space-y-2 rounded-xl border border-border p-2">
                  <p className="text-[11px] font-medium text-muted-foreground">Loudness you hear</p>
                  <LoudnessMeter level={lvl} />
                  {sono && <p className={cn('text-[11px] font-medium', state.rider ? 'text-muted-foreground' : state.jump ? 'text-success' : 'text-muted-foreground')}>{state.rider ? (o.riderDrive(now) > 0.3 ? 'Rider trembling…' : 'Rider on the wire') : state.jump ? `Rider thrown off at ${state.jump.len.toFixed(1)} cm` : 'No rider on the wire'}</p>}
                </div>
                <ScaleLoupe at={state.len} vertical={!sono} />
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground">Choose the experiment above.</p>
          )}
          {state.task && !readOnly && (
            <div className="mt-4 space-y-3">
              {sono && (
                <Step title="1. The tension">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {state.load === 0 ? (
                      <Button size="sm" variant="outline" onClick={o.hangHanger}>
                        Hang the 1 kg hanger
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={o.removeMass} aria-label="Take 0.5 kg off">
                          <Minus /> 0.5 kg
                        </Button>
                        <span className="min-w-[56px] text-center text-[12.5px] font-semibold tabular">{state.load.toFixed(1)} kg</span>
                        <Button size="sm" variant="outline" onClick={o.addMass} disabled={state.load >= SONO_MAX_LOAD} aria-label="Add 0.5 kg">
                          <Plus /> 0.5 kg
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="outline" onClick={o.placeRider} disabled={state.rider}>
                      Place the rider on the middle
                    </Button>
                  </div>
                </Step>
              )}
              <Step title={`${sono ? '2' : '1'}. The fork`}>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tuning fork">
                  {SOUND_FORKS.map((f) => (
                    <Button key={f} size="sm" variant={state.fork === f ? 'brand' : 'outline'} onClick={() => o.pickFork(f)} aria-pressed={state.fork === f}>
                      {f}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="brand" onClick={() => setMsg(o.strike('pad'))} disabled={!state.fork}>
                    <Music /> Strike on the rubber pad{sono ? ' and press on the box' : ''}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setMsg(o.strike('bench'))} disabled={!state.fork}>
                    Strike on the bench
                  </Button>
                  <Button size="sm" variant="ghost" onClick={o.damp} disabled={!o.struck}>
                    <Hand /> Stop it ringing
                  </Button>
                </div>
              </Step>
              <Step title={`${sono ? '3' : '2'}. ${sono ? 'The bridge' : 'The tube'} (l = ${state.len.toFixed(1)} cm)`}>
                <input type="range" min={min} max={max} step={0.1} value={state.len} onChange={(e) => o.setLen(Number(e.target.value))} className="w-full accent-[var(--color-brand)]" aria-label={sono ? 'Bridge separation (cm)' : 'Length of the air column (cm)'} />
                <div className="flex flex-wrap gap-1.5">
                  {[-1, -0.1, 0.1, 1].map((d) => (
                    <Button key={d} size="sm" variant="outline" onClick={() => o.nudge(d)}>
                      {d > 0 ? '+' : '−'}
                      {Math.abs(d)} cm
                    </Button>
                  ))}
                  <Button size="sm" variant="brand" onClick={() => setMsg(o.takeReading())}>
                    <Camera /> Take this length
                  </Button>
                </div>
                <p className="text-[11.5px] text-muted-foreground">{sono ? `Bridges ${state.len.toFixed(1)} cm apart (up to ${SONO_MAX} cm).` : `Raise the tube (longer air column) or lower it, up to ${TUBE_MAX} cm.`} Read the length on the close-up scale and write it in the table.</p>
              </Step>
              {msg && <p className="text-[12px] text-warning">{msg}</p>}
            </div>
          )}
        </Card>
        <Notebook task={task} state={state} readOnly={readOnly} update={o.update} removeRow={o.removeRow} />
      </div>
    </div>
  );
}

const TUBE_HEAD: Record<keyof TubeRow, string> = { f: 'f / Hz', inv: '1/f / s', l1: 'l₁ / cm', l2: 'l₂ / cm' };
const SONO_HEAD: Record<keyof SonoRow, string> = { f: 'f / Hz', l: 'l / m', inv: '1/l / m⁻¹' };

export function Notebook({ task, state, readOnly, update, removeRow }: { task: SoundTask; state: PhySoundState; readOnly: boolean; update: Sound['update']; removeRow: (i: number) => void }) {
  const setAnswer = (id: SoundAnswerId, key: 'value' | 'unit', value: string) => update((s) => ({ ...s, answers: { ...s.answers, [id]: { ...s.answers[id], [key]: value } } }));
  const sono = task === 'SONO';
  const head = (sono ? SONO_HEAD : TUBE_HEAD) as Record<string, string>;
  const cols = Object.keys(head);
  const rows = (sono ? state.sono : state.tube) as unknown as Record<string, string>[];
  const setCell = (i: number, key: string, value: string) => update((s) => (sono ? { ...s, sono: s.sono.map((r, k) => (k === i ? { ...r, [key]: value } : r)) } : { ...s, tube: s.tube.map((r, k) => (k === i ? { ...r, [key]: value } : r)) }));
  const points = sono ? numericPoints(state.sono.map((r) => [r.inv, r.f])) : numericPoints(state.tube.map((r) => [r.inv, r.l1]));
  const A = (id: SoundAnswerId, label: string) => <AnswerRow id={id} label={label} answer={state.answers[id]} onChange={(k, x) => setAnswer(id, k, x)} readOnly={readOnly} unitHint="unit" />;
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="mb-3 font-display text-[15px] font-semibold tracking-tight">Your record</h3>
      {state.readings.length > 0 && (
        <div className="mb-3 rounded-xl border border-border p-2 text-[12px]">
          <p className="mb-1 font-semibold">Lengths taken</p>
          <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
            {state.readings.map((r, i) => (
              <li key={i} className="tabular">
                {r.fork} Hz: <span className="font-semibold">{r.len.toFixed(1)} cm</span>
                {sono ? (r.jumped ? ' · rider off' : ' · rider still on') : r.sounding ? '' : ' · fork silent'}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[360px] text-[13px]">
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
                  A row appears when you take the first length for a fork.
                </td>
              </tr>
            )}
            {state.rows.map((f, i) => (
              <tr key={i} className="border-t border-border">
                {cols.map((c) => (
                  <td key={c} className="px-1 py-1.5">
                    <Cell value={rows[i]?.[c] ?? ''} onChange={(x) => setCell(i, c, x)} readOnly={readOnly} label={`${f} Hz fork: ${head[c]}`} />
                  </td>
                ))}
                <td>
                  {!readOnly && (
                    <Button size="icon-sm" variant="ghost" onClick={() => removeRow(i)} aria-label={`Delete row ${i + 1} and its lengths`}>
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
        {sono ? 'l to 0.001 m (0.1 cm) between the bridges; 1/l in m⁻¹.' : 'l to 0.1 cm; 1/f in s (e.g. 1/256 = 0.00391 s). l₂ (the second resonance) for 512 Hz only.'}
      </p>
      <div className="mt-5">
        <p className="mb-2 text-[12.5px] font-semibold">{sono ? 'Graph of f against 1/l' : 'Graph of l against 1/f'}</p>
        <PhyGraph points={points} line={state.line} onLine={(line) => update((s) => ({ ...s, line }))} readOnly={readOnly} xLabel={sono ? '1/l / m⁻¹' : '1/f / s'} yLabel={sono ? 'f / Hz' : 'l / cm'} />
      </div>
      <div className="mt-5 space-y-3">
        <p className="text-[12.5px] font-semibold">Calculations</p>
        {sono ? (
          <>
            {A('slope', '(i) Slope of the graph of f against 1/l')}
            {A('v', '(ii) Speed of the transverse wave, v = 2 × slope')}
            {A('T', '(iii) Tension T = Mg')}
            {A('mu', '(iv) Mass per unit length μ = T/v²')}
          </>
        ) : (
          <>
            {A('slope', '(i) Slope of the graph of l against 1/f')}
            {A('v', '(ii) Speed of sound, v = 4 × slope')}
            {A('intercept', '(iii) Intercept on the l-axis')}
            {A('e', '(iv) End correction e (intercept = −e)')}
            {A('v2', '(v) v = 2f(l₂ − l₁) for 512 Hz')}
          </>
        )}
      </div>
      <div className="mt-5">
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="sound-precautions">
          Two precautions you took
        </label>
        <Textarea id="sound-precautions" value={state.written.precautions} onChange={(e) => update((s) => ({ ...s, written: { precautions: e.target.value.slice(0, 2000) } }))} disabled={readOnly} rows={3} />
      </div>
    </Card>
  );
}
