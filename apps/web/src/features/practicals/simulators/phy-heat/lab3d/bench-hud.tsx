import { heatReading, type HeatThermo, type PhyHeatState } from '@aischool/shared';
import { ArrowDown, ArrowUp, Camera, Eye, Flame, Pause, Play, Scale, Snowflake, Thermometer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLabView } from '../../../lab3d-kit/store';
import { dockButton, dockClass } from '../../phy-common/lab3d/common';
import { beamTilt, clockText, heatFlags, ridersSum, SPEEDS, useLive, type Heat } from '../actions';
import { THERMO_NAME, ThermoLoupe, thermosFor } from '../index';
import { useBench } from './bench-store';
import type { Ops } from './lab-actions';
import { APPARATUS_LABEL, PLACE_LABEL, type SceneState } from './scene-state';

/** The heat lab's HUD: the dock (set out, work, balance), the eye-level thermometer panel. */

const B = ({ children, onClick, blocked, brand, label, className }: { children: React.ReactNode; onClick: () => void; blocked?: string; brand?: boolean; label?: string; className?: string }) => (
  <Button size="sm" variant={brand && !blocked ? 'brand' : 'outline'} className={cn(!(brand && !blocked) && dockButton, blocked && 'opacity-55', 'h-8 px-2 text-[12px]', className)} aria-disabled={!!blocked} title={blocked} aria-label={label} onClick={onClick}>
    {children}
  </Button>
);
const thName = (th: HeatThermo) => (th === 'bath' ? 'Bath' : th === 'cal' ? 'Calorimeter' : th === 'room' ? 'Room' : 'Naphthalene');

export function SpeedPicker({ o }: { o: Heat }) {
  return (
    <span className="flex items-center gap-1" role="radiogroup" aria-label="Time-lapse">
      {SPEEDS.map((x) => (
        <button key={x} type="button" role="radio" aria-checked={o.speed === x} onClick={() => o.setSpeed(x)} className={cn('rounded-md px-1.5 py-0.5 text-[11.5px] tabular', o.speed === x ? 'bg-white text-slate-900' : 'bg-white/10 text-white hover:bg-white/20')}>
          ×{x}
        </button>
      ))}
    </span>
  );
}

function BalanceTab({ o, ops }: { o: Heat; ops: Ops }) {
  const t = beamTilt(o.panMass(), o.riders);
  const r = (w: 'h' | 't' | 'f', d: number, text: string) => (
    <B onClick={() => ops.rider(w, d)} label={`${d > 0 ? 'Move on' : 'Move back'} the ${w === 'h' ? '100 g' : w === 't' ? '10 g' : 'front'} rider`}>
      {text}
    </B>
  );
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] text-white/75">Pan:</span>
        <B brand={o.pan === 'cal'} onClick={() => ops.pan(o.pan === 'cal' ? null : 'cal')} label={o.pan === 'cal' ? 'Take the calorimeter off the pan' : 'Put the calorimeter on the pan'}>
          Calorimeter
        </B>
        {o.ref.current.task === 'MIX' && (
          <B brand={o.pan === 'block'} onClick={() => ops.pan(o.pan === 'block' ? null : 'block')} label={o.pan === 'block' ? 'Take the block off the pan' : 'Put the block on the pan'}>
            Block
          </B>
        )}
        <span className={cn('text-[11.5px]', Math.abs(t) < 0.08 ? 'text-emerald-300' : 'text-amber-300')} aria-live="polite">
          pointer {Math.abs(t) < 0.08 ? 'on zero' : t > 0 ? 'high (add)' : 'low (take off)'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {r('h', -1, '−100')}
        {r('h', 1, '+100')}
        {r('t', -1, '−10')}
        {r('t', 1, '+10')}
        {r('f', -1, '−1')}
        {r('f', -0.1, '−0.1')}
        {r('f', 0.1, '+0.1')}
        {r('f', 1, '+1')}
        <span className="min-w-[64px] text-center text-[12px] font-semibold tabular" aria-label="Riders total">
          {ridersSum(o.riders).toFixed(1)} g
        </span>
        <B brand onClick={ops.weigh} blocked={ops.why.weigh}>
          <Scale /> Record ({o.ref.current.weighs.length})
        </B>
      </div>
    </div>
  );
}

export function HeatDock({ o, s, scene, ops, compact }: { o: Heat; s: PhyHeatState; scene: SceneState; ops: Ops; compact: boolean }) {
  const tab = useBench((b) => b.tab);
  const dry = useBench((b) => b.dry);
  const melting = useBench((b) => b.melting);
  const setB = useBench((b) => b.set);
  useLive(true, 200);
  if (!scene.set)
    return (
      <div className={dockClass} aria-label="Set out the apparatus">
        {scene.nextPlace && (
          <B brand onClick={ops.placeNext} blocked={ops.why.place}>
            {PLACE_LABEL[scene.nextPlace] ?? `Set out the ${APPARATUS_LABEL[scene.nextPlace].toLowerCase()}`}
          </B>
        )}
      </div>
    );
  const task = s.task ?? 'MIX';
  const f = heatFlags(s.events);
  const p = o.phys();
  const balance = task !== 'COOL';
  const thermos = thermosFor(task);
  return (
    <div className={cn(dockClass, 'max-w-[min(620px,calc(100vw-1rem))] flex-col items-stretch gap-1.5')} aria-label="The heat bench">
      <div className="flex flex-wrap items-center gap-1.5">
        {balance && (
          <div className="flex overflow-hidden rounded-lg border border-white/20" role="tablist" aria-label="Dock">
            {(['work', 'balance'] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setB({ tab: t })} className={cn('px-2.5 py-1 text-[12px] font-medium', tab === t ? 'bg-white text-slate-900' : 'bg-white/10 text-white hover:bg-white/20')}>
                {t === 'work' ? 'Bench' : 'Balance'}
              </button>
            ))}
          </div>
        )}
        <span className="text-[11.5px] tabular text-white/80" aria-label="Lab clock">
          {clockText(o.now())}
        </span>
        <SpeedPicker o={o} />
        {task === 'COOL' && (
          <span className="ml-auto rounded-md bg-[#c9d7b8] px-2 py-0.5 font-mono text-[14px] font-bold tabular text-[#16200f]" aria-label={`Stopwatch reads ${Math.floor(o.watchTime())} seconds`}>
            {clockText(o.watchTime())}
          </span>
        )}
      </div>
      {balance && tab === 'balance' ? (
        <BalanceTab o={o} ops={ops} />
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {task !== 'LATENT' && (
            <B brand={!f.bunsen} onClick={ops.bunsen} blocked={ops.why.bunsen} label={f.bunsen ? 'Turn the Bunsen off' : 'Light the Bunsen'}>
              <Flame /> {f.bunsen ? 'Bunsen off' : 'Light Bunsen'}
            </B>
          )}
          {task === 'MIX' && (
            <>
              {!f.filled && (
                <B onClick={() => ops.fill(2)} blocked={ops.why.fill}>
                  Fill ⅔
                </B>
              )}
              {f.block === 'bench' && (
                <B onClick={ops.toBath} blocked={ops.why.bath}>
                  Block in bath
                </B>
              )}
              {f.block === 'bath' && (
                <B onClick={ops.lift} blocked={ops.why.lift}>
                  Lift out
                </B>
              )}
              {(f.block === 'bath' || f.block === 'air') && (
                <B brand onClick={() => ops.lower(true)} blocked={ops.why.lower}>
                  Lower gently in
                </B>
              )}
            </>
          )}
          {task === 'LATENT' && (
            <>
              {!f.filled && (
                <B onClick={() => ops.warm(40)} blocked={ops.why.fill}>
                  Warm water ~40 °C
                </B>
              )}
              <B brand onClick={ops.addIce} blocked={ops.why.ice}>
                <Snowflake /> Add ice ({f.ice})
              </B>
              <label className="flex items-center gap-1 text-[11.5px] text-white/85">
                <input type="checkbox" checked={dry} onChange={(e) => setB({ dry: e.target.checked })} /> dried
              </label>
              <label className="flex items-center gap-1 text-[11.5px] text-white/85">
                <input type="checkbox" checked={melting} onChange={(e) => setB({ melting: e.target.checked })} /> 0 °C ice
              </label>
            </>
          )}
          {task !== 'COOL' && (
            <>
              <B brand={!f.lagged} onClick={ops.lag} blocked={ops.why.lag}>
                {f.lagged ? 'Unlag' : 'Lag'}
              </B>
              <B onClick={ops.lid} blocked={ops.why.bench}>
                {f.lid ? 'Lid off' : 'Lid on'}
              </B>
            </>
          )}
          {task === 'COOL' && (
            <>
              {f.tube !== 'bath' && (
                <B onClick={ops.tubeBath} blocked={ops.why.tube}>
                  Tube in bath
                </B>
              )}
              {f.tube === 'bath' && (
                <B onClick={ops.tubeAir} blocked={ops.why.air}>
                  Out, clamp in air
                </B>
              )}
              <B brand={f.watch !== 'running'} onClick={ops.watch} blocked={ops.why.watch} label={f.watch === 'running' ? 'Stop the stopwatch' : 'Start the stopwatch'}>
                {f.watch === 'running' ? <Pause /> : <Play />} {compact ? '' : f.watch === 'running' ? 'Stop watch' : 'Start watch'}
              </B>
            </>
          )}
          <B brand={!f.stirring} onClick={ops.stir} blocked={ops.why.stir}>
            {f.stirring ? 'Stop stirring' : task === 'COOL' ? 'Stir gently' : 'Stir'}
          </B>
          {thermos.map((th) => (
            <B key={th} onClick={() => ops.read(th)} blocked={ops.why.bench} label={`Read the ${thName(th).toLowerCase()} thermometer`}>
              <Eye /> {compact ? thName(th).slice(0, 4) : thName(th)}
            </B>
          ))}
          {task === 'COOL' && (
            <B brand onClick={() => ops.take('tube')} blocked={ops.why.take} label="Take a reading now">
              <Camera /> {compact ? '' : 'Take'} ({s.cool.length})
            </B>
          )}
          {task === 'COOL' && p.fs > 0.02 && p.fs < 0.999 && <span className="text-[11px] text-amber-200">crystals forming</span>}
        </div>
      )}
    </div>
  );
}

/** Eye-level reading of a thermometer: raise or lower your eye until it is level with the end of the mercury. */
export function HeatReadingPanel({ o, ops, onBack }: { o: Heat; ops: Ops; onBack: () => void }) {
  const eye = useLabView((v) => v.eye);
  const set = useLabView((v) => v.set);
  const th = useBench((b) => b.thermo);
  useLive(true, 150);
  const task = o.ref.current.task ?? 'MIX';
  const shown = th && thermosFor(task).includes(th) ? th : thermosFor(task)[0]!;
  const level = Math.abs(eye) < 0.003 ? 'level' : eye > 0 ? 'above' : 'below';
  const nudge = (d: number) => set({ eye: Math.max(-0.05, Math.min(0.05, eye + d)) });
  return (
    <section className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 mx-auto max-w-lg rounded-2xl border border-border bg-card/97 p-3 text-card-foreground shadow-2xl backdrop-blur sm:bottom-4" aria-label="Reading the thermometer">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-display text-[15px] font-semibold tracking-tight">
          <Thermometer className="size-4 text-muted-foreground" aria-hidden /> {THERMO_NAME[shown]}
        </p>
        <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-medium', level === 'level' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')} aria-live="polite">
          {level === 'level' ? 'Eye level with the mercury' : `Eye ${level} the mercury`}
        </span>
      </div>
      <div className="mt-2 flex gap-3">
        <div className="hidden sm:block">
          <ThermoLoupe at={heatReading(o.v, o.phys(), shown)} shift={(eye / 0.03) * 0.45} label={THERMO_NAME[shown]} />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-[12.5px] leading-snug text-muted-foreground">Read where the mercury ends, to 0.5 °C (or estimate the tenth), with your eye level with it. Each mark is 1 °C. Then write it in your table.</p>
          {thermosFor(task).length > 1 && (
            <div className="flex gap-1.5">
              {thermosFor(task).map((x) => (
                <Button key={x} size="sm" variant={shown === x ? 'brand' : 'outline'} className="h-7 px-2" onClick={() => useBench.setState({ thermo: x })}>
                  {thName(x)}
                </Button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="icon-sm" variant="outline" onClick={() => nudge(0.002)} aria-label="Raise your eye">
              <ArrowUp />
            </Button>
            <Button size="icon-sm" variant="outline" onClick={() => nudge(-0.002)} aria-label="Lower your eye">
              <ArrowDown />
            </Button>
            <Button size="sm" variant="brand" onClick={() => ops.take(shown)}>
              <Camera /> Take this reading
            </Button>
            <Button size="sm" variant="outline" className="ml-auto" onClick={onBack}>
              Back to bench
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
