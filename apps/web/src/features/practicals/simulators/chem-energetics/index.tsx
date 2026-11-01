import { EN_VOLS, SOLY_ADDS, SOLY_WATER0 } from '@aischool/shared';
import { Beaker, Droplets, Flame, FlaskConical, Lightbulb, RotateCw, Save, Snowflake, Sparkles, Thermometer, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Step, TaskCard } from '../phy-common';
import type { SimulatorProps } from '../types';
import { TASK_TITLE, energeticsHint, nextKind, openRun, openTube, useEnergetics, useLive, type Energetics } from './actions';
import { EnTaskText, Notebook } from './notebook';
import { CupSvg, SpeedPicker, ThermoLoupe, TubeSvg, clockText } from './parts';

const sel = 'h-8 rounded-md border border-input bg-card px-1 text-[12.5px]';

export default function ChemEnergeticsLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'chem-energetics'>) {
  const o = useEnergetics({ seed, state, onChange, readOnly, startedAt, practicalId });
  const { v, task } = o;
  const [msg, setMsg] = useState<string | null>(null);
  useLive(!readOnly && (o.cupLive() || o.phase() !== 'idle' || !!o.thermoWhere()), 120);
  const say = (m: string | null) => setMsg(m);
  const done = task === 'SOLY' ? state.soly.runs.filter((r) => r.done).length : state.runs.filter((r) => r.done).length;
  return (
    <div className="space-y-4">
      <TaskCard icon={<FlaskConical className="size-4 text-muted-foreground" aria-hidden />}>
        <p className="font-semibold">{TASK_TITLE[task]}</p>
        <EnTaskText task={task} v={v} />
      </TaskCard>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start [&>*]:min-w-0">
        <Card className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
              <Beaker className="size-4 text-muted-foreground" aria-hidden /> Bench
            </h3>
            <Badge variant="outline">
              {done} {task === 'SOLY' ? `saturation temperature${done === 1 ? '' : 's'}` : `run${done === 1 ? '' : 's'} done`}
            </Badge>
          </div>
          {!readOnly && mode === 'LAB' && (
            <p className="mb-3 flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[12.5px] text-info">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {energeticsHint(state, o)}
            </p>
          )}
          {task === 'SOLY' ? <TubeBench o={o} readOnly={readOnly} say={say} /> : <CupBench o={o} readOnly={readOnly} say={say} />}
          {msg && <p className="mt-2 text-[12px] text-warning">{msg}</p>}
        </Card>
        <Notebook v={v} state={state} readOnly={readOnly} update={o.update} remove={task === 'SOLY' ? o.removeTube : o.removeRun} />
      </div>
    </div>
  );
}

function CupBench({ o, readOnly, say }: { o: Energetics; readOnly: boolean; say: (m: string | null) => void }) {
  const s = o.ref.current;
  const neut = o.task === 'NEUT';
  const r = openRun(s);
  const last = r?.r ?? s.runs.at(-1) ?? null;
  const [volA, setVolA] = useState(50);
  const [volB, setVolB] = useState(50);
  const kind = r?.r.kind === 'NAOH' || (!r && nextKind(s) === 'NAOH') ? 'NAOH' : 'SALT';
  const [mass, setMass] = useState<number>(4);
  const where = o.thermoWhere();
  const live = o.cupLive();
  const t = o.tMix();
  const dis = o.cupDissolved();
  const temp = o.thermoNow();
  const liquid = last && !last.done ? last.volA + (last.mixed ? last.volB : 0) : 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-center gap-3">
        <div className="min-w-0 flex-1">
          <CupSvg vessel={s.setup.vessel} supported={s.setup.support} liquid={liquid} lid={!!r?.r.mixed && r.r.lidAt !== null} solid={!neut && r?.r.mixed ? r.r.kind === 'NAOH' ? 'NAOH' : 'SALT' : null} undissolved={1 - dis} thermo={where === 'A' || where === 'CUP'} warm={(o.cupTemp() - o.v.room) / 6} />
        </div>
        <div className="flex flex-col items-center gap-1">
          <ThermoLoupe temp={temp} caption={where === 'B' ? 'In the alkali (cylinder).' : where ? undefined : 'Not in a liquid.'} />
          {live && <span className="font-mono text-[13px] tabular">{clockText(t)} since mixing</span>}
        </div>
      </div>
      {!readOnly && (
        <>
          <SpeedPicker speed={o.speed} onSpeed={o.setSpeed} />
          <Step title="1. The cup">
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant={s.setup.vessel === 'CUP' ? 'brand' : 'outline'} onClick={() => say(o.chooseVessel('CUP'))} aria-pressed={s.setup.vessel === 'CUP'}>
                Polystyrene cup
              </Button>
              <Button size="sm" variant={s.setup.vessel === 'BEAKER' ? 'brand' : 'outline'} onClick={() => say(o.chooseVessel('BEAKER'))} aria-pressed={s.setup.vessel === 'BEAKER'}>
                Glass beaker
              </Button>
              <Button size="sm" variant={s.setup.support ? 'brand' : 'outline'} onClick={o.support} disabled={s.setup.support}>
                Stand it in a beaker
              </Button>
            </div>
          </Step>
          <Step title={neut ? '2. Measure the solutions' : '2. Water and solid'}>
            <div className="flex flex-wrap items-center gap-1.5">
              <select className={sel} value={volA} onChange={(e) => setVolA(Number(e.target.value))} aria-label={neut ? 'Volume of acid' : 'Volume of water'}>
                {EN_VOLS.map((x) => (
                  <option key={x} value={x}>
                    {x}.0 cm³
                  </option>
                ))}
              </select>
              <Button size="sm" variant="outline" onClick={() => say(o.measureA(volA))} disabled={!!r}>
                <Droplets /> {neut ? 'Acid (A) into the cup' : 'Distilled water into the cup'}
              </Button>
            </div>
            {neut ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <select className={sel} value={volB} onChange={(e) => setVolB(Number(e.target.value))} aria-label="Volume of alkali">
                  {EN_VOLS.map((x) => (
                    <option key={x} value={x}>
                      {x}.0 cm³
                    </option>
                  ))}
                </select>
                <Button size="sm" variant="outline" onClick={() => say(o.measureB(volB))} disabled={!r || r.r.mixed}>
                  Alkali (B) into a cylinder
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                <select className={sel} value={mass} onChange={(e) => setMass(Number(e.target.value))} aria-label="Mass to weigh">
                  {[2, 4, 8].map((x) => (
                    <option key={x} value={x}>
                      {x.toFixed(2)} g
                    </option>
                  ))}
                </select>
                <Button size="sm" variant="outline" onClick={() => say(o.weigh('SALT', mass))} disabled={!r || r.r.mixed}>
                  Weigh NH₄NO₃
                </Button>
                <Button size="sm" variant="outline" onClick={() => say(o.weigh('NAOH', mass))} disabled={!r || r.r.mixed}>
                  Weigh NaOH pellets
                </Button>
                {kind === 'NAOH' && <span className="text-[11.5px] text-muted-foreground">Comparison: 2.00 g of NaOH.</span>}
              </div>
            )}
          </Step>
          <Step title="3. Starting temperature">
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant={where === 'A' ? 'brand' : 'outline'} onClick={() => o.thermoTo('A')} disabled={!r || r.r.mixed}>
                <Thermometer /> Into the {neut ? 'acid' : 'water'}
              </Button>
              {neut && (
                <Button size="sm" variant={where === 'B' ? 'brand' : 'outline'} onClick={() => o.thermoTo('B')} disabled={!r || r.r.mixed || r.r.volB === 0}>
                  <Thermometer /> Into the alkali
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => say(o.readStart())} disabled={!r || r.r.mixed}>
                Read it (steady)
              </Button>
            </div>
            {r && !r.r.mixed && (
              <p className="text-[11.5px] text-muted-foreground">
                Read: {neut ? 'acid' : 'water'} {r.r.readA ? '✓' : '—'}
                {neut ? ` · alkali ${r.r.readB ? '✓' : '—'}` : ''}
              </p>
            )}
          </Step>
          <Step title="4. Mix and watch">
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="brand" onClick={() => say(o.mix())} disabled={!r || r.r.mixed}>
                {neut ? 'Pour B quickly into A' : 'Tip the solid in'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => o.lid()} disabled={!r?.r.mixed || r.r.lidAt !== null}>
                Cover with the lid
              </Button>
              <Button size="sm" variant="outline" onClick={() => o.stir()} disabled={!r?.r.mixed}>
                <RotateCw /> Stir
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" onClick={() => o.finish()} disabled={!r?.r.mixed}>
                <Save /> Finish this run
              </Button>
              <Button size="sm" variant="ghost" onClick={o.pourAway} disabled={!r}>
                <Trash2 /> Pour away
              </Button>
            </div>
          </Step>
        </>
      )}
    </div>
  );
}

function TubeBench({ o, readOnly, say }: { o: Energetics; readOnly: boolean; say: (m: string | null) => void }) {
  const s = o.ref.current;
  const t = openTube(s);
  const ph = o.phase();
  const [mass, setMass] = useState(4);
  const [add, setAdd] = useState(1);
  const first = s.soly.runs.length === 0;
  const seg = ph === 'heat';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-center gap-3">
        <div className="min-w-0 flex-1">
          <TubeSvg inBath={seg} flame={seg && t?.r.heat === 'FLAME'} solid={o.solidLeft()} mass={s.soly.mass ?? 0} water={t?.r.water ?? s.soly.water} stirring={o.stirring()} />
        </div>
        <div className="flex flex-col items-center gap-1">
          <ThermoLoupe temp={o.tubeThermo()} />
          <span className="text-[12px] text-muted-foreground">{ph === 'heat' ? 'Warming' : ph === 'cool' ? (o.crystalsShown() ? 'Crystals!' : 'Cooling') : 'In the rack'}</span>
        </div>
      </div>
      {!readOnly && (
        <>
          <SpeedPicker speed={o.speed} onSpeed={o.setSpeed} />
          <Step title="1. KNO₃ and water">
            <div className="flex flex-wrap items-center gap-1.5">
              <select className={sel} value={mass} onChange={(e) => setMass(Number(e.target.value))} aria-label="Mass of KNO₃">
                {[3, 4, 5].map((x) => (
                  <option key={x} value={x}>
                    {x.toFixed(1)} g
                  </option>
                ))}
              </select>
              <Button size="sm" variant="outline" onClick={() => say(o.weighKno3(mass))} disabled={s.soly.runs.length > 0}>
                Weigh KNO₃ into the tube
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {first ? (
                <Button size="sm" variant="outline" onClick={() => say(o.addWater(SOLY_WATER0))} disabled={s.soly.mass === null}>
                  <Droplets /> Add {SOLY_WATER0.toFixed(1)} cm³ of water (burette)
                </Button>
              ) : (
                <>
                  <select className={sel} value={add} onChange={(e) => setAdd(Number(e.target.value))} aria-label="Water to add">
                    {SOLY_ADDS.map((x) => (
                      <option key={x} value={x}>
                        {x.toFixed(1)} cm³
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="outline" onClick={() => say(o.addWater(add))} disabled={!!t}>
                    <Droplets /> Add water (burette)
                  </Button>
                </>
              )}
              <span className="text-[11.5px] text-muted-foreground">In the tube: {(t?.r.water ?? s.soly.water).toFixed(1)} cm³</span>
            </div>
          </Step>
          <Step title="2. Warm until it dissolves">
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant={ph === 'heat' && t?.r.heat === 'BATH' ? 'brand' : 'outline'} onClick={() => say(o.heatStart('BATH'))} disabled={!t || ph === 'heat'}>
                <Thermometer /> Into the hot water bath
              </Button>
              <Button size="sm" variant="outline" onClick={() => say(o.heatStart('FLAME'))} disabled={!t || ph === 'heat'}>
                <Flame /> Over the flame
              </Button>
              <Button size="sm" variant="outline" onClick={() => o.heatStop()} disabled={ph !== 'heat'}>
                <Snowflake /> Take out to cool
              </Button>
            </div>
          </Step>
          <Step title="3. Cool, stir and watch">
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant={o.stirring() ? 'brand' : 'outline'} onClick={() => o.setStir(!o.stirring())} disabled={!t} aria-pressed={o.stirring()}>
                <RotateCw /> {o.stirring() ? 'Stirring' : 'Stir'}
              </Button>
              <Button size="sm" variant="brand" onClick={() => say(o.crystalsSeen())} disabled={!t || ph === 'idle'}>
                <Sparkles /> Crystals appear — read now
              </Button>
              <Button size="sm" variant="ghost" onClick={o.startAgain} disabled={!s.soly.runs.length && s.soly.mass === null}>
                <Trash2 /> Start again
              </Button>
            </div>
          </Step>
        </>
      )}
    </div>
  );
}
