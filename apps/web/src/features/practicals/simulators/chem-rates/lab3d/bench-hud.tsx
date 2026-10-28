import { RATES_ACID_VOLS, RATES_BATHS, RATES_INTERVAL, RATES_MG_CONCS, RATES_THIO_VOLS, RATES_WATER_VOLS, type ChemRatesState } from '@aischool/shared';
import { ArrowDown, ArrowUp, Eye, Pause, Play, RotateCcw, Save, Thermometer, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLabView, type DragState } from '../../../lab3d-kit/store';
import { dockButton, dockClass } from '../../phy-common/lab3d/common';
import { crossFlaskDirty, crossFlaskFull, openCross, openMg, useLive, type Rates } from '../actions';
import { SpeedPicker, SyringeLoupe, ThermoLoupe } from '../parts';
import { useBench } from './bench-store';
import { lookingDown, type Ops } from './lab-actions';
import { APPARATUS_LABEL, PLACE_LABEL, type SceneState } from './scene-state';

/** The rates HUD: the dock (set up, then the run's steps), the eye-level reading panel and the drag feedback. */

const Bt = ({ children, onClick, blocked, brand, label, className }: { children: React.ReactNode; onClick: () => void; blocked?: string; brand?: boolean; label?: string; className?: string }) => (
  <Button size="sm" variant={brand && !blocked ? 'brand' : 'outline'} className={cn(!(brand && !blocked) && dockButton, blocked && 'opacity-55', 'h-8 px-2 text-[12px]', className)} aria-disabled={!!blocked} title={blocked} aria-label={label} onClick={onClick}>
    {children}
  </Button>
);
const sel = 'h-8 rounded-md border border-white/20 bg-white/10 px-1 text-[12px] text-white [&>option]:text-slate-900';

export function RatesDock({ o, s, scene, ops, compact }: { o: Rates; s: ChemRatesState; scene: SceneState; ops: Ops; compact: boolean }) {
  const w = o.watch;
  const running = w.start !== null && w.stop === null;
  useLive(running || !!o.mgLive || !!o.crossLive, 60);
  const thio = useBench((b) => b.thio);
  const water = useBench((b) => b.water);
  const set = useBench((b) => b.set);
  if (!scene.set)
    return (
      <div className={dockClass} aria-label="Set up">
        {scene.nextPlace && (
          <Bt brand onClick={ops.placeNext} blocked={ops.why.place}>
            {PLACE_LABEL[scene.nextPlace] ?? `Set out the ${APPARATUS_LABEL[scene.nextPlace].toLowerCase()}`}
          </Bt>
        )}
      </div>
    );
  const watch = (
    <>
      <span className="rounded-md bg-[#c9d7b8] px-2 py-0.5 font-mono text-[15px] font-bold tabular text-[#16200f]" aria-label={`Stopwatch reads ${o.elapsed().toFixed(2)} seconds`}>
        {o.elapsed().toFixed(2)} s
      </span>
      <Bt brand={!running} onClick={ops.watch} blocked={ops.why.watch} label={running ? 'Stop the stopwatch' : 'Start the stopwatch'}>
        {running ? <Pause /> : <Play />} {compact ? '' : running ? 'Stop' : 'Start'}
      </Bt>
      <Bt onClick={ops.resetWatch} blocked={w.start === null ? 'The watch is at zero.' : undefined} label="Reset the stopwatch">
        <RotateCcw />
      </Bt>
    </>
  );
  if ((s.task ?? 'MG') === 'MG') {
    const m = openMg(s);
    const next = s.mgRuns[0] ? 1 : 0;
    return (
      <div className={cn(dockClass, 'max-w-[min(620px,calc(100vw-1rem))] flex-col items-stretch gap-1.5')} aria-label="Magnesium and acid">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-white/80">{m ? `Run ${m.i + 1}: ${m.r.conc === 1 ? '1.0' : '0.50'} mol dm⁻³` : `${s.mgRuns.filter((r) => r?.done).length} of 2 runs done`}</span>
          {watch}
          <SpeedPicker speed={o.speed} onSpeed={o.setSpeed} dark />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {!m &&
            RATES_MG_CONCS.map((c, i) => (
              <Bt key={c} brand={i === next} onClick={() => ops.pour(c)} blocked={ops.why.pour}>
                50 cm³ {c === 1 ? '1.0' : '0.50'} M HCl
              </Bt>
            ))}
          {m && !m.r.dropped && (
            <>
              <Bt brand={!m.r.weighed} onClick={ops.weigh} blocked={ops.why.prep}>Weigh</Bt>
              <Bt brand={!m.r.cleaned} onClick={ops.clean} blocked={ops.why.prep}>Sandpaper</Bt>
              <Bt brand={m.r.start !== 0} onClick={ops.zero} blocked={ops.why.prep}>Plunger to 0</Bt>
              <Bt brand={!m.r.checked} onClick={ops.check} blocked={ops.why.prep}>Airtight?</Bt>
              <Bt brand onClick={ops.drop} blocked={ops.why.drop}>Drop Mg in</Bt>
            </>
          )}
          {m?.r.dropped && (
            <>
              {m.r.bungLag === null && (
                <Bt brand onClick={ops.bung} blocked={ops.why.bung}>
                  Bung in!
                </Bt>
              )}
              <Bt brand onClick={ops.read} blocked={ops.why.read} label="Read the syringe now">
                <Timer /> Read syringe ({s.readings.filter((e) => e.run === m.i).length})
              </Bt>
              <Bt onClick={() => useLabView.getState().set({ mode: 'read', selected: null, spot: null })}>
                <Eye /> {compact ? '' : 'Eye level'}
              </Bt>
              <Bt onClick={ops.finish} blocked={ops.why.finish}>
                <Save /> Finish run
              </Bt>
            </>
          )}
        </div>
      </div>
    );
  }
  const c = openCross(s);
  const full = crossFlaskFull(s);
  const acidIn = !!o.crossLive;
  return (
    <div className={cn(dockClass, 'max-w-[min(640px,calc(100vw-1rem))] flex-col items-stretch gap-1.5')} aria-label="The disappearing cross">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] text-white/80">{c ? `${c.r.thio} + ${c.r.water} cm³${c.r.bath ? ` · ${c.r.bath} °C bath` : ''}` : `${s.crossRuns.filter((r) => r.done).length} runs timed`}</span>
        {watch}
        <SpeedPicker speed={o.speed} onSpeed={o.setSpeed} dark />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {!c && full && (
          <Bt brand onClick={ops.empty}>
            Pour away
          </Bt>
        )}
        {!c && !full && crossFlaskDirty(s) && (
          <Bt brand onClick={ops.rinse}>
            Rinse the flask
          </Bt>
        )}
        {!c && !full && (
          <>
            <select className={sel} value={thio} onChange={(e) => set({ thio: Number(e.target.value) })} aria-label="Thiosulphate (cm³)">
              {RATES_THIO_VOLS.map((x) => (
                <option key={x} value={x}>
                  {x} cm³ Na₂S₂O₃
                </option>
              ))}
            </select>
            <select className={sel} value={water} onChange={(e) => set({ water: Number(e.target.value) })} aria-label="Water (cm³)">
              {RATES_WATER_VOLS.map((x) => (
                <option key={x} value={x}>
                  {x} cm³ water
                </option>
              ))}
            </select>
            <Bt brand={!crossFlaskDirty(s)} onClick={() => ops.measure(thio, water)} blocked={ops.why.measure}>
              Measure in
            </Bt>
          </>
        )}
        {c && !acidIn && (
          <>
            {RATES_BATHS.slice(0, compact ? 4 : 5).map((b) => (
              <Bt key={b} brand={c.r.bath === b} onClick={() => ops.warm(b)}>
                {b}°
              </Bt>
            ))}
            {RATES_ACID_VOLS.map((ml) => (
              <Bt key={ml} brand={c.r.acid === ml} onClick={() => ops.acidVol(ml)}>
                {ml} cm³ acid
              </Bt>
            ))}
            <Bt brand onClick={ops.addAcid} blocked={ops.why.acid}>
              Add acid
            </Bt>
          </>
        )}
        {c && acidIn && (
          <>
            <Bt brand={!c.r.swirled} onClick={ops.swirl} blocked={ops.why.swirl}>
              Swirl
            </Bt>
            <Bt brand={!lookingDown()} onClick={() => useLabView.getState().set({ mode: 'bench', focus: 'top', spot: null, selected: null })}>
              <Eye /> Look down
            </Bt>
            <Bt onClick={ops.record} blocked={ops.why.record}>
              <Save /> Record
            </Bt>
          </>
        )}
        {full && (
          <Bt onClick={ops.thermo} blocked={ops.why.thermo} label="Read the thermometer">
            <Thermometer /> {compact ? '' : 'Thermometer'}
          </Bt>
        )}
      </div>
    </div>
  );
}

/** Eye-level reading: the syringe (magnesium) or the thermometer (thiosulphate), with the notebook cells for it. */
export function RatesReadingPanel({ o, s, ops, onBack }: { o: Rates; s: ChemRatesState; ops: Ops; onBack: () => void }) {
  const eye = useLabView((v) => v.eye);
  const setView = useLabView((v) => v.set);
  const snap = useBench((b) => b.snap);
  useLive(!!o.mgLive || !!o.crossLive, 80);
  const level = Math.abs(eye) < 0.004 ? 'level' : eye > 0 ? 'above' : 'below';
  const nudge = (d: number) => setView({ eye: Math.max(-0.05, Math.min(0.05, eye + d)) });
  const mg = (s.task ?? 'MG') === 'MG';
  const m = openMg(s);
  const runIdx = m?.i ?? 0;
  const lastRead = [...s.readings].reverse().find((e) => e.run === runIdx);
  const slot = lastRead ? Math.round(lastRead.at / RATES_INTERVAL) * RATES_INTERVAL : null;
  const row = slot === null ? -1 : s.mgRows.indexOf(slot);
  const key = runIdx === 0 ? 'v1' : 'v2';
  const c = openCross(s) ?? (s.crossRuns.length ? { i: s.crossRuns.length - 1, r: s.crossRuns.at(-1)! } : null);
  return (
    <section className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 mx-auto max-w-lg rounded-2xl border border-border bg-card/97 p-3 text-card-foreground shadow-2xl backdrop-blur sm:bottom-4" aria-label={mg ? 'Reading the gas syringe' : 'Reading the thermometer'}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-display text-[15px] font-semibold tracking-tight">
          <Eye className="size-4 text-muted-foreground" aria-hidden /> {mg ? 'Read the gas syringe' : 'Read the thermometer'}
        </p>
        <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-medium', level === 'level' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')} aria-live="polite">
          {level === 'level' ? 'Eye level' : `Eye ${level}`}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-start gap-3">
        {mg ? <SyringeLoupe value={snap?.value ?? o.syringeNow()} caption={snap ? `Held at your reading, ${snap.at.toFixed(1)} s.` : 'Live: press “Read now” at each 30 s mark.'} /> : <ThermoLoupe temp={o.thermoNow()} />}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-1">
            <Button size="icon-sm" variant="outline" onClick={() => nudge(0.002)} aria-label="Raise your eye">
              <ArrowUp />
            </Button>
            <Button size="icon-sm" variant="outline" onClick={() => nudge(-0.002)} aria-label="Lower your eye">
              <ArrowDown />
            </Button>
            <span className="self-center rounded-md bg-muted px-2 py-0.5 font-mono text-[13px] tabular">{o.elapsed().toFixed(2)} s</span>
          </div>
          {mg ? (
            <>
              <Button size="sm" variant="brand" onClick={ops.read} aria-disabled={!!ops.why.read}>
                <Timer /> Read now
              </Button>
              {row >= 0 && (
                <div className="flex gap-2">
                  <label className="text-[11.5px] text-muted-foreground">
                    t / s
                    <Input value={s.mg[row]?.t ?? ''} onChange={(e) => o.update((x) => ({ ...x, mg: x.mg.map((r, k) => (k === row ? { ...r, t: e.target.value.slice(0, 40) } : r)) }))} inputMode="decimal" className="mt-0.5 h-9 w-[72px] tabular" />
                  </label>
                  <label className="text-[11.5px] text-muted-foreground">
                    V (run {runIdx + 1}) / cm³
                    <Input value={s.mg[row]?.[key] ?? ''} onChange={(e) => o.update((x) => ({ ...x, mg: x.mg.map((r, k) => (k === row ? { ...r, [key]: e.target.value.slice(0, 40) } : r)) }))} inputMode="decimal" className="mt-0.5 h-9 w-[92px] tabular" />
                  </label>
                </div>
              )}
            </>
          ) : (
            <>
              <Button size="sm" variant="brand" onClick={ops.thermo} aria-disabled={!!ops.why.thermo}>
                <Thermometer /> Record this temperature
              </Button>
              {c && (
                <label className="block text-[11.5px] text-muted-foreground">
                  θ / °C (run {c.i + 1})
                  <Input value={s.cross[c.i]?.th ?? ''} onChange={(e) => o.update((x) => ({ ...x, cross: x.cross.map((r, k) => (k === c.i ? { ...r, th: e.target.value.slice(0, 40) } : r)) }))} inputMode="decimal" className="mt-0.5 h-9 w-[92px] tabular" />
                </label>
              )}
            </>
          )}
          <Button size="sm" variant="outline" onClick={onBack}>
            Back to bench
          </Button>
        </div>
      </div>
    </section>
  );
}

export function RatesDragFeedback({ drag }: { drag: DragState }) {
  const pull = useBench((b) => b.pull);
  const pill = 'absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg';
  if (drag.kind === 'plunger') return <span className={pill}>{pull === null ? 'Drag left to push the plunger in, right to pull it out' : pull < 0.5 ? 'Plunger fully in — let go' : `Plunger out to ${Math.round(pull)} cm³ — let go: it should spring back`}</span>;
  if (drag.kind === 'swirl') return <span className={pill}>Swirling — keep moving in circles ({Math.round(drag.value * 100)} %)</span>;
  return null;
}
