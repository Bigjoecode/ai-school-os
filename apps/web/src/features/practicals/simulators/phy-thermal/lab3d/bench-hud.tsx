import type { PhyThermalState, ThermInstrument } from '@aischool/shared';
import { ArrowDown, ArrowUp, Camera, Eye, Flame, Pause, Play, RotateCcw, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLabView } from '../../../lab3d-kit/store';
import { dockButton, dockClass } from '../../phy-common/lab3d/common';
import { clockText, SPEEDS, thermFlags, useLive, type Thermal } from '../actions';
import { InstrumentView, instrumentsFor, READ_LABEL } from '../index';
import type { EyePos } from '../instruments';
import { useBench } from './bench-store';
import type { Ops } from './lab-actions';
import { APPARATUS_LABEL, PLACE_LABEL, type SceneState } from './scene-state';

/** The thermal lab's HUD: the dock (set out, then the bench's controls) and the eye-level reading panel. */

const B = ({ children, onClick, blocked, brand, label, className }: { children: React.ReactNode; onClick: () => void; blocked?: string; brand?: boolean; label?: string; className?: string }) => (
  <Button size="sm" variant={brand && !blocked ? 'brand' : 'outline'} className={cn(!(brand && !blocked) && dockButton, blocked && 'opacity-55', 'h-8 px-2 text-[12px]', className)} aria-disabled={!!blocked} title={blocked} aria-label={label} onClick={onClick}>
    {children}
  </Button>
);
const SHORT: Record<ThermInstrument, string> = { thermo: 'Thermo', micro: 'Micro', rule: 'Rule', column: 'Column', ammeter: 'A', voltmeter: 'V', balance: 'Balance', watch: 'Watch' };

export function SpeedPicker({ o }: { o: Thermal }) {
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

export function ThermalDock({ o, s, scene, ops, compact }: { o: Thermal; s: PhyThermalState; scene: SceneState; ops: Ops; compact: boolean }) {
  useLive(true, 250);
  if (!scene.set) {
    const rodNext = scene.nextPlace === 'rod' && !s.reads.some((r) => r.k === 'rule');
    return (
      <div className={dockClass} aria-label="Set out the apparatus">
        {rodNext && (
          <B brand onClick={() => ops.read('rule')} blocked={ops.why.rule}>
            <Eye /> Measure the rod (metre rule)
          </B>
        )}
        {rodNext && (
          <B onClick={() => ops.take('rule')} blocked={ops.why.rule}>
            <Camera /> Take the reading
          </B>
        )}
        {scene.nextPlace && (
          <B brand={!rodNext} onClick={ops.placeNext} blocked={ops.why.place}>
            {PLACE_LABEL[scene.nextPlace] ?? `Set out the ${APPARATUS_LABEL[scene.nextPlace].toLowerCase()}`}
          </B>
        )}
      </div>
    );
  }
  const task = s.task ?? 'EXPANSION';
  const f = thermFlags(s.events);
  const p = o.phys();
  const reads = instrumentsFor(task);
  return (
    <div className={cn(dockClass, 'max-w-[min(640px,calc(100vw-1rem))] flex-col items-stretch gap-1.5')} aria-label="The thermal bench">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11.5px] tabular text-white/80" aria-label="Lab clock">
          {clockText(o.now())}
        </span>
        <SpeedPicker o={o} />
        {task === 'ELECTRIC' && (
          <span className="ml-auto rounded-md bg-[#c9d7b8] px-2 py-0.5 font-mono text-[14px] font-bold tabular text-[#16200f]" aria-label={`Stopwatch reads ${Math.floor(o.watchTime())} seconds`}>
            {clockText(o.watchTime())}
          </span>
        )}
        {task === 'EXPANSION' && <span className="ml-auto text-[11px] text-white/80">{p.boiler ? (p.can >= o.v.boil - 0.05 ? 'steam passing' : 'can heating') : 'no steam'} · micrometer {p.contact ? 'touching' : 'backed off'}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {task === 'EXPANSION' && (
          <>
            <B brand={!f.boiler} onClick={ops.boiler} blocked={ops.why.steam} label={f.boiler ? 'Turn the steam off' : 'Light the burner under the steam can'}>
              <Flame /> {f.boiler ? 'Steam off' : 'Steam on'}
            </B>
            <B brand onClick={ops.ratchet} blocked={ops.why.micro} label="Turn the ratchet until it touches the rod">
              Ratchet in
            </B>
            <B onClick={ops.back} blocked={ops.why.micro} label="Back the micrometer off">
              <RotateCcw /> Back off
            </B>
            {!compact && (
              <B onClick={ops.thimble} blocked={ops.why.micro} label="Screw the thimble up tight">
                Tight
              </B>
            )}
          </>
        )}
        {task === 'CHARLES' && (
          <>
            {f.immersed !== 'full' && (
              <B brand onClick={() => ops.immerse(true)} blocked={ops.why.bench} label="Lower the tube so the air column is fully under the water">
                Lower fully in
              </B>
            )}
            <B brand={!f.bunsen} onClick={ops.bunsen} blocked={ops.why.bench} label={f.bunsen ? 'Remove the flame' : 'Heat with the Bunsen'}>
              <Flame /> {f.bunsen ? 'Flame off' : 'Heat'}
            </B>
            <B brand={!f.bunsen} onClick={ops.stirOnce} blocked={ops.why.bench} label="Stir well">
              Stir
            </B>
            {!compact && (
              <span className="text-[11px] text-white/75" aria-live="polite">
                water ≈ {Math.round(p.tw)} °C
              </span>
            )}
          </>
        )}
        {task === 'ELECTRIC' && (
          <>
            {!f.switchedOn && (
              <B brand={!f.pan} onClick={ops.pan} blocked={ops.why.pan} label={f.pan ? 'Take the calorimeter off the balance' : 'Put the calorimeter on the balance'}>
                {f.pan ? 'Off balance' : 'On balance'}
              </B>
            )}
            {!f.poured && (
              <B onClick={ops.pour} blocked={ops.why.pour}>
                Pour water
              </B>
            )}
            {!f.switchedOn && (
              <>
                <B brand={!f.lagged} onClick={ops.lag} blocked={ops.why.cal}>
                  {f.lagged ? 'Unlag' : 'Lag'}
                </B>
                <B brand={!f.heaterIn} onClick={ops.heater} blocked={ops.why.heater} label={f.heaterIn ? 'Take the heater out' : 'Put the heater in the water'}>
                  {f.heaterIn ? 'Heater out' : 'Heater in'}
                </B>
                <B onClick={ops.lid} blocked={ops.why.cal}>
                  {f.lid ? 'Lid off' : 'Lid on'}
                </B>
                {f.wire === 'none' && (
                  <B brand onClick={() => ops.wire('ok')} blocked={ops.why.bench} label="Connect: ammeter in series, voltmeter across the heater">
                    Wire up
                  </B>
                )}
              </>
            )}
            {f.on ? (
              <B brand onClick={ops.switchOff} blocked={ops.why.bench} label="Switch the heater off">
                <Zap /> Off
              </B>
            ) : (
              <B brand={f.wire !== 'none' && !f.switchedOn} onClick={ops.switchOn} blocked={ops.why.switch} label="Switch on and start the stopwatch">
                <Zap /> {compact ? 'On' : 'On + watch'}
              </B>
            )}
            <B brand={!f.stirring && f.poured} onClick={ops.stir} blocked={ops.why.stir}>
              {f.stirring ? 'Stop stirring' : 'Stir'}
            </B>
            {f.switchedOn && (
              <B onClick={ops.watch} blocked={ops.why.bench} label={f.watch === 'running' ? 'Stop the stopwatch' : 'Start the stopwatch'}>
                {f.watch === 'running' ? <Pause /> : <Play />}
              </B>
            )}
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {reads.map((k) => (
          <B key={k} onClick={() => ops.read(k)} blocked={k === 'rule' ? ops.why.rule : ops.why.bench} label={`Read the ${READ_LABEL[k].toLowerCase()}`}>
            <Eye /> {compact ? SHORT[k] : READ_LABEL[k].replace(/ \(.*\)/, '')}
          </B>
        ))}
        <span className="text-[11px] text-white/70">readings: {s.reads.length}</span>
      </div>
    </div>
  );
}

export const eyeFromView = (eye: number): EyePos => (Math.abs(eye) < 0.003 ? 0 : eye > 0 ? 1 : -1);

/** Eye-level reading of an instrument: raise or lower your eye until it is level (square on), then take the reading. */
export function ThermalReadingPanel({ o, ops, onBack }: { o: Thermal; ops: Ops; onBack: () => void }) {
  const eye = useLabView((v) => v.eye);
  const set = useLabView((v) => v.set);
  const k0 = useBench((b) => b.instr);
  useLive(true, 150);
  const task = o.ref.current.task ?? 'EXPANSION';
  const kinds = instrumentsFor(task);
  const k = k0 && kinds.includes(k0) ? k0 : kinds[0]!;
  const e = eyeFromView(eye);
  const nudge = (d: number) => set({ eye: Math.max(-0.05, Math.min(0.05, eye + d)) });
  const parallax = !['balance', 'watch'].includes(k);
  return (
    <section className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 mx-auto max-w-xl rounded-2xl border border-border bg-card/97 p-3 text-card-foreground shadow-2xl backdrop-blur sm:bottom-4" aria-label={`Reading the ${READ_LABEL[k].toLowerCase()}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-display text-[15px] font-semibold tracking-tight">
          <Eye className="size-4 text-muted-foreground" aria-hidden /> {READ_LABEL[k]}
        </p>
        {parallax && (
          <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-medium', e === 0 ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')} aria-live="polite">
            {e === 0 ? 'Eye level (square on)' : `Eye ${e > 0 ? 'above' : 'below'} — parallax`}
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {kinds.map((x) => (
          <Button key={x} size="sm" variant={k === x ? 'brand' : 'outline'} className="h-7 px-2" onClick={() => useBench.setState({ instr: x })} aria-pressed={k === x}>
            {READ_LABEL[x]}
          </Button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-start gap-3">
        <div className="max-h-[38vh] overflow-hidden">
          <InstrumentView o={o} k={k} eye={e} />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-[12.5px] leading-snug text-muted-foreground">Read the scale with your eye level with it, then write the value in your table.</p>
          <div className="flex flex-wrap items-center gap-2">
            {parallax && (
              <>
                <Button size="icon-sm" variant="outline" onClick={() => nudge(0.002)} aria-label="Raise your eye">
                  <ArrowUp />
                </Button>
                <Button size="icon-sm" variant="outline" onClick={() => nudge(-0.002)} aria-label="Lower your eye">
                  <ArrowDown />
                </Button>
              </>
            )}
            <Button size="sm" variant="brand" onClick={() => ops.take(k)}>
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
