import { RATES_ACID_VOLS, RATES_BATHS, RATES_MG_CONCS, RATES_SYRINGE, RATES_THIO_VOLS, RATES_WATER_VOLS, type ChemRatesState } from '@aischool/shared';
import { Eye, FlaskConical, Lightbulb, Pause, Play, RotateCcw, Save, Thermometer, Timer } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Step, TaskCard } from '../phy-common';
import type { SimulatorProps } from '../types';
import { crossFlaskDirty, crossFlaskFull, openCross, openMg, ratesHint, useLive, useRates, type Rates } from './actions';
import { Notebook, RatesTaskText } from './notebook';
import { CrossView, SpeedPicker, Stopwatch, SyringeLoupe, ThermoLoupe } from './parts';

/** The flask, delivery tube and gas syringe from the front (the plunger at the live reading; bubbles while gas comes off). */
function MgBench({ o, now }: { o: Rates; now: number }) {
  const vol = o.syringeNow(now);
  const left = o.mgLeft(now);
  const rate = o.mgBubbling(now);
  const m = openMg(o.ref.current);
  const acid = !!m;
  const px = 60 + (vol / RATES_SYRINGE) * 150;
  return (
    <svg viewBox="0 0 300 220" className="mx-auto h-[220px] w-full max-w-[340px] rounded-xl border border-border bg-gradient-to-b from-slate-50 to-slate-200 dark:from-slate-800 dark:to-slate-900" role="img" aria-label={`Flask ${acid ? 'with acid' : 'empty'}; the gas syringe reads about ${Math.round(vol)} cm³`}>
      {/* syringe on its clamp */}
      <rect x={176} y={70} width={6} height={140} className="fill-slate-400" />
      <rect x={50} y={30} width={170} height={26} rx={4} fill="#eaf4fb" stroke="#7e95a5" />
      {Array.from({ length: 11 }, (_, i) => (
        <line key={i} x1={60 + i * 15} x2={60 + i * 15} y1={30} y2={i % 2 ? 36 : 40} stroke="#333" strokeWidth={0.8} />
      ))}
      <rect x={px} y={33} width={4} height={20} fill="#3b3f44" />
      <rect x={px + 4} y={40} width={230 - px} height={6} fill="#9aa1a8" />
      <rect x={226} y={34} width={6} height={18} fill="#3b3f44" />
      <rect x={40} y={39} width={10} height={8} fill="#c9ced3" />
      {/* delivery tube */}
      <path d="M44 43 L28 43 L28 110 L70 110 L70 124" fill="none" stroke="#a7b4bd" strokeWidth={3} />
      {/* flask */}
      <path d="M62 124 L78 124 L78 140 L110 200 L30 200 L62 140 Z" fill="none" stroke="#7d8f9c" strokeWidth={2} />
      <rect x={60} y={118} width={20} height={9} rx={2} fill={m?.r.dropped && m.r.bungLag !== null ? '#7a4a2a' : 'transparent'} />
      {acid && <path d="M47 170 L93 170 L110 200 L30 200 Z" fill="#dcecf7" />}
      {m?.r.dropped && left > 0 && <rect x={58} y={194} width={24 * Math.cbrt(left)} height={3} fill={m.r.cleaned ? '#c7ccd1' : '#7c7f82'} />}
      {rate > 0.02 &&
        Array.from({ length: Math.min(12, Math.ceil(rate * 10)) }, (_, i) => {
          const ph = ((now / 600 + i * 0.37) % 1) * 30;
          return <circle key={i} cx={56 + ((i * 7) % 28)} cy={196 - ph} r={1.6} fill="#fff" stroke="#9bb" strokeWidth={0.5} />;
        })}
    </svg>
  );
}

export default function ChemRatesLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'chem-rates'>) {
  const o = useRates({ seed, state, onChange, readOnly, startedAt, practicalId });
  const { v, task } = o;
  const w = o.watch;
  const live = (w.start !== null && w.stop === null) || !!o.mgLive || !!o.crossLive;
  useLive(live);
  const now = o.now();
  const [msg, setMsg] = useState<string | null>(null);
  const [snap, setSnap] = useState<{ at: number; value: number } | null>(null);
  const [thio, setThio] = useState(50);
  const [water, setWater] = useState(0);
  const [top, setTop] = useState(true);
  const say = (m: string | null) => setMsg(m);
  const cr = openCross(state);
  const running = w.start !== null && w.stop === null;

  return (
    <div className="space-y-4">
      <TaskCard icon={<FlaskConical className="size-4 text-muted-foreground" aria-hidden />}>
        <RatesTaskText task={state.task} v={v} />
        {!readOnly && !state.readings.length && !state.crossRuns.length && !state.mgRuns.some(Boolean) && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(['MG', 'CROSS'] as const).map((t) => (
              <Button key={t} size="sm" variant={state.task === t ? 'brand' : 'outline'} onClick={() => o.chooseTask(t)} aria-pressed={state.task === t}>
                {t === 'MG' ? 'Magnesium and acid (gas syringe)' : 'Thiosulphate and acid (disappearing cross)'}
              </Button>
            ))}
          </div>
        )}
      </TaskCard>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start [&>*]:min-w-0">
        <Card className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
              <FlaskConical className="size-4 text-muted-foreground" aria-hidden /> Bench
            </h3>
            <Badge variant="outline">{task === 'MG' ? `${state.mgRuns.filter((r) => r?.done).length} of 2 runs done` : `${state.crossRuns.filter((r) => r.done).length} runs timed`}</Badge>
          </div>
          {!readOnly && mode === 'LAB' && state.task && (
            <p className="mb-3 flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[12.5px] text-info">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {ratesHint(state, o)}
            </p>
          )}
          {task === 'MG' ? (
            <div className="space-y-3">
              <MgBench o={o} now={now} />
              <div className="flex flex-wrap items-start justify-center gap-3">
                <SyringeLoupe value={o.syringeNow(now)} />
                <Stopwatch seconds={o.elapsed(now)} running={running} className="min-w-[110px]" />
              </div>
              {snap && (
                <div className="flex justify-center">
                  <SyringeLoupe value={snap.value} caption={`Your reading at ${snap.at.toFixed(1)} s (held so you can write it down).`} />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-start justify-center gap-3">
                <CrossView visible={Math.sqrt(o.crossVisible(now))} cloud={1 - Math.sqrt(o.crossVisible(now))} top={top} empty={!crossFlaskFull(state)} />
                <div className="flex flex-col items-center gap-2">
                  <Stopwatch seconds={o.elapsed(now)} running={running} className="min-w-[110px]" />
                  {crossFlaskFull(state) && <ThermoLoupe temp={o.thermoNow(now)} />}
                </div>
              </div>
              <div className="flex justify-center gap-1.5">
                <Button size="sm" variant={top ? 'brand' : 'outline'} onClick={() => setTop(true)} aria-pressed={top}>
                  <Eye /> Look down through the flask
                </Button>
                <Button size="sm" variant={!top ? 'brand' : 'outline'} onClick={() => setTop(false)} aria-pressed={!top}>
                  From the side
                </Button>
              </div>
            </div>
          )}
          {!readOnly && state.task && (
            <div className="mt-4 space-y-3">
              <SpeedPicker speed={o.speed} onSpeed={o.setSpeed} />
              {task === 'MG' ? <MgSteps o={o} state={state} say={say} setSnap={setSnap} /> : (
                <>
                  <Step title="1. The mixture">
                    <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                      <label className="flex items-center gap-1">
                        Na₂S₂O₃
                        <select value={thio} onChange={(e) => setThio(Number(e.target.value))} className="h-8 rounded-md border border-input bg-card px-1" aria-label="Volume of thiosulphate">
                          {RATES_THIO_VOLS.map((x) => (
                            <option key={x} value={x}>
                              {x} cm³
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-1">
                        water
                        <select value={water} onChange={(e) => setWater(Number(e.target.value))} className="h-8 rounded-md border border-input bg-card px-1" aria-label="Volume of water">
                          {RATES_WATER_VOLS.map((x) => (
                            <option key={x} value={x}>
                              {x} cm³
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button size="sm" variant="outline" onClick={() => say(o.measure(thio, water))} disabled={!!cr || crossFlaskFull(state)}>
                        Measure into the flask
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" onClick={o.empty} disabled={!crossFlaskFull(state)}>
                        Pour away into the sink
                      </Button>
                      <Button size="sm" variant="outline" onClick={o.rinse} disabled={crossFlaskFull(state) || !crossFlaskDirty(state)}>
                        Rinse the flask
                      </Button>
                    </div>
                  </Step>
                  <Step title="2. Water bath (temperature part)">
                    <div className="flex flex-wrap gap-1.5">
                      {RATES_BATHS.map((b) => (
                        <Button key={b} size="sm" variant={cr?.r.bath === b ? 'brand' : 'outline'} onClick={() => o.warm(b)} disabled={!cr || !!o.crossLive}>
                          {b} °C
                        </Button>
                      ))}
                      <Button size="sm" variant="outline" onClick={() => o.readThermo()} disabled={!crossFlaskFull(state)}>
                        <Thermometer /> Read the thermometer
                      </Button>
                    </div>
                    {cr?.r.temp != null && <p className="text-[11.5px] text-muted-foreground">Thermometer read{cr.r.tempAfter ? ' in the mixture' : ' before the acid went in'}.</p>}
                  </Step>
                  <Step title="3. Acid and stopwatch">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {RATES_ACID_VOLS.map((x) => (
                        <Button key={x} size="sm" variant={cr?.r.acid === x ? 'brand' : 'outline'} onClick={() => o.setAcid(x)} disabled={!cr || !!o.crossLive}>
                          {x} cm³ acid
                        </Button>
                      ))}
                      <Button size="sm" variant="outline" onClick={() => o.addAcid()} disabled={!cr || !!o.crossLive}>
                        Add the acid
                      </Button>
                      <Button size="sm" variant="outline" onClick={o.swirl} disabled={!o.crossLive}>
                        Swirl
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="brand" onClick={() => (w.start === null ? o.startWatch() : o.stopWatch(top))} disabled={!cr || w.stop !== null}>
                        {w.start === null ? <Play /> : <Pause />} {w.start === null ? 'Start stopwatch' : 'Stop stopwatch'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={o.resetWatch} disabled={w.start === null}>
                        <RotateCcw /> Reset
                      </Button>
                      <Button size="sm" onClick={() => say(o.record())} disabled={!cr || w.stop === null}>
                        <Save /> Record this time
                      </Button>
                    </div>
                  </Step>
                </>
              )}
              {msg && <p className="text-[12px] text-warning">{msg}</p>}
            </div>
          )}
        </Card>
        <Notebook v={v} state={state} readOnly={readOnly} update={o.update} removeCross={o.removeCross} discard={o.discard} />
      </div>
    </div>
  );
}

function MgSteps({ o, state, say, setSnap }: { o: Rates; state: ChemRatesState; say: (m: string | null) => void; setSnap: (s: { at: number; value: number }) => void }) {
  const m = openMg(state);
  const w = o.watch;
  const nextConc = state.mgRuns[0] ? RATES_MG_CONCS[1] : RATES_MG_CONCS[0];
  return (
    <>
      <Step title="1. The acid">
        <div className="flex flex-wrap gap-1.5">
          {RATES_MG_CONCS.map((c) => (
            <Button key={c} size="sm" variant={c === nextConc && !m ? 'brand' : 'outline'} onClick={() => say(o.pourAcid(c))} disabled={!!m}>
              50 cm³ of {c.toFixed(c === 1 ? 1 : 2)} mol dm⁻³ HCl
            </Button>
          ))}
        </div>
      </Step>
      <Step title="2. Magnesium and syringe">
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant={m?.r.weighed ? 'brand' : 'outline'} onClick={o.weigh} disabled={!m}>
            Weigh the ribbon{m?.r.weighed ? ` (${o.v.mgMass.toFixed(3)} g)` : ''}
          </Button>
          <Button size="sm" variant={m?.r.cleaned ? 'brand' : 'outline'} onClick={o.clean} disabled={!m || m.r.dropped}>
            Clean with sandpaper
          </Button>
          <Button size="sm" variant={m?.r.start === 0 ? 'brand' : 'outline'} onClick={o.zero} disabled={!m || m.r.dropped}>
            Push the plunger in (0)
          </Button>
          <Button size="sm" variant={m?.r.checked ? 'brand' : 'outline'} onClick={o.check} disabled={!m || m.r.dropped}>
            Check it is airtight
          </Button>
        </div>
      </Step>
      <Step title="3. Start the reaction">
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" onClick={() => o.drop()} disabled={!m || m.r.dropped}>
            Drop the magnesium in
          </Button>
          <Button size="sm" variant="outline" onClick={() => o.bung()} disabled={!m?.r.dropped || m.r.bungLag !== null || !o.mgLive}>
            Replace the bung
          </Button>
          <Button size="sm" variant="brand" onClick={() => (w.start === null ? o.startWatch() : o.stopWatch())} disabled={!m || w.stop !== null}>
            {w.start === null ? <Play /> : <Pause />} {w.start === null ? 'Start stopwatch' : 'Stop stopwatch'}
          </Button>
        </div>
      </Step>
      <Step title="4. Every 30 s">
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="brand"
            onClick={() => {
              const at = o.elapsed();
              const value = o.syringeNow();
              const err = o.read();
              say(err);
              if (!err) setSnap({ at, value });
            }}
            disabled={!m?.r.dropped || !o.mgLive}
          >
            <Timer /> Read the syringe now
          </Button>
          <Button size="sm" onClick={o.finish} disabled={!m?.r.dropped}>
            <Save /> Gas has stopped: finish the run
          </Button>
          <Button size="sm" variant="ghost" onClick={() => o.discard()} disabled={!m}>
            Pour away
          </Button>
        </div>
      </Step>
    </>
  );
}
