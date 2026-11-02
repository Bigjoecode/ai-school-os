import {
  CAP_EFFORTS,
  CAP_MARKS,
  CAP_MARK_LABEL,
  CAP_RELEASES,
  CAP_RELEASE_LABEL,
  CAP_WAITS,
  ECO_TASKS,
  ECO_TASK_TITLE,
  FAC_DAYS,
  FAC_INSTS,
  FAC_INST_LABEL,
  FAC_PLACES,
  FAC_PLACE_LABEL,
  QUAD_MAX,
  SOIL_DRAIN_MAX,
  SOIL_LABEL,
  SOIL_MASSES,
  SOIL_TYPES,
  type BioEcologyState,
  type FacInst,
  type FacSite,
  type SoilType,
} from '@aischool/shared';
import { ChevronDown, Leaf, Lightbulb, Timer } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { BalanceDisplay } from '../bio-osmosis/visuals';
import type { SimulatorProps } from '../types';
import { clockText, nextHint, useEcology, type Ecology } from './actions';
import { CapNotebook, FacNotebook, QuadNotebook, SoilNotebook, Written } from './notebook';
import { airNow, capTrays, crucibleShown, drainNow, facLast, facStationNow, jarNow } from './readings';
import { TaskText } from './task-text';
import { CylinderSvg, JarSvg, MeterDisplay, PhChart, PlotMap, QuadratView, RainSvg, SecchiSvg, SixSvg, ThermoSvg, TrayView, VaneSvg } from './visuals';

/** The 2D ecology lab: the same state, actions and marks as the 3D field. */
export default function BioEcologyLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'bio-ecology'>) {
  const o = useEcology({ seed, state, onChange, readOnly, startedAt, practicalId });
  const { v, task } = o;
  const [brief, setBrief] = useState(true);
  const started = state.log.some((e) => !e.a.startsWith('task:') && !e.a.startsWith('safety'));
  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setBrief((b) => !b)} aria-expanded={brief}>
          <span className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
            <Leaf className="size-4 text-muted-foreground" aria-hidden /> {ECO_TASK_TITLE[task]}
          </span>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', brief && 'rotate-180')} aria-hidden />
        </button>
        {brief && (
          <div className="mt-3">
            <TaskText v={v} />
            {!readOnly && !practicalId && !started && (
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Investigation">
                {ECO_TASKS.map((t) => (
                  <Button key={t} size="sm" variant={task === t ? 'brand' : 'outline'} onClick={() => o.chooseTask(t)} aria-pressed={task === t}>
                    {ECO_TASK_TITLE[t]}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start [&>*]:min-w-0">
        <Card className="p-4 sm:p-5">
          {!readOnly && mode === 'LAB' && (
            <p className="mb-3 flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[12.5px] text-info">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {nextHint(v, state)}
            </p>
          )}
          {task === 'QUADRAT' ? <QuadBench o={o} state={state} readOnly={readOnly} /> : task === 'CAPTURE' ? <CapBench o={o} state={state} readOnly={readOnly} /> : task === 'FACTORS' ? <FacBench o={o} state={state} readOnly={readOnly} /> : <SoilBench o={o} state={state} readOnly={readOnly} />}
        </Card>
        <div className="space-y-4">
          <EcoNotebook o={o} state={state} readOnly={readOnly} />
          <Written state={state} readOnly={readOnly} update={o.update} />
        </div>
      </div>
    </div>
  );
}

export function EcoNotebook({ o, state, readOnly, book, className }: { o: Ecology; state: BioEcologyState; readOnly: boolean; book?: boolean; className?: string }) {
  const task = state.task ?? o.task;
  const p = { state, readOnly, update: o.update, book, className };
  return task === 'QUADRAT' ? <QuadNotebook {...p} /> : task === 'CAPTURE' ? <CapNotebook {...p} /> : task === 'FACTORS' ? <FacNotebook {...p} /> : <SoilNotebook v={o.v} {...p} />;
}

const Box = ({ title, children }: { title: React.ReactNode; children: React.ReactNode }) => (
  <div className="rounded-xl border border-border p-3">
    <p className="mb-2 text-[12.5px] font-semibold">{title}</p>
    {children}
  </div>
);
const Row = ({ children }: { children: React.ReactNode }) => <div className="flex flex-wrap gap-1.5">{children}</div>;

// ------------------------------------------------------------------ quadrats

export function QuadBench({ o, state, readOnly }: { o: Ecology; state: BioEcologyState; readOnly: boolean }) {
  const w = state.quad;
  const [sel, setSel] = useState(0);
  const [byEye, setByEye] = useState(false);
  const [tally, setTally] = useState<Set<string>>(new Set());
  const i = Math.min(sel, w.quads.length - 1);
  const q = i >= 0 ? w.quads[i] : undefined;
  const nextNums = o.v.quad.table.slice(w.randIdx, w.randIdx + 12);
  return (
    <div className="space-y-3">
      <Box title="The plot (20 m × 20 m)">
        <PlotMap v={o.v} quads={w.quads} pegged={w.pegged} focus={q ? i : null} label="Map of the study plot with the quadrats placed so far" onPick={!readOnly && byEye && w.pegged ? (x, y) => (setSel(Math.max(0, o.quad.placeAt(x, y))), setByEye(false)) : undefined} />
        {!readOnly && (
          <div className="mt-2 space-y-2">
            <Row>
              <Button size="sm" variant={w.pegged ? 'secondary' : 'brand'} disabled={w.pegged} onClick={o.quad.peg}>
                {w.pegged ? 'Plot pegged out' : 'Peg out the plot (tapes on two edges)'}
              </Button>
              <Button size="sm" variant="brand" disabled={!w.pegged || w.quads.length >= QUAD_MAX} onClick={() => setSel(Math.max(0, o.quad.placeRandom()))}>
                Next random pair → place a quadrat
              </Button>
              <Button size="sm" variant={byEye ? 'brand' : 'outline'} disabled={!w.pegged || w.quads.length >= QUAD_MAX} onClick={() => setByEye((b) => !b)}>
                {byEye ? 'Tap the map where…' : 'Put one where I choose'}
              </Button>
              <Button size="sm" variant="ghost" disabled={!w.quads.length || w.looked.includes(w.quads.length - 1)} onClick={o.quad.undo}>
                Lift the last quadrat
              </Button>
            </Row>
            <p className="font-mono text-[12px] text-muted-foreground">Random-number table, next: {nextNums.map((n) => String(n).padStart(2, '0')).join(' ')} … (use 00–19 only)</p>
          </div>
        )}
      </Box>
      {q && (
        <Box title={`Quadrat ${i + 1} at (${q.x}, ${q.y})${q.how === 'CHOSEN' ? ' — placed by eye' : ''}`}>
          <div className="mb-2 flex flex-wrap gap-1">
            {w.quads.map((_, k) => (
              <button key={k} type="button" onClick={() => (setSel(k), setTally(new Set()))} aria-pressed={k === i} className={cn('rounded-full border px-2 py-0.5 text-[12px]', k === i ? 'border-brand bg-brand/10' : 'border-border text-muted-foreground')}>
                {k + 1}
                {w.looked.includes(k) ? ' ✓' : ''}
              </button>
            ))}
          </div>
          {w.looked.includes(i) ? (
            <>
              <QuadratView v={o.v} qx={q.x} qy={q.y} tally={tally} onTap={readOnly ? undefined : (key) => setTally((t) => (t.has(key) ? new Set([...t].filter((x) => x !== key)) : new Set([...t, key])))} label={`Close-up of quadrat ${i + 1}`} className="mx-auto w-full max-w-[380px] rounded-xl border border-border" />
              <p className="mt-1 text-center text-[12px] text-muted-foreground">
                Tap plants to tick them while you count: {tally.size} ticked{' '}
                {tally.size > 0 && (
                  <button type="button" className="underline" onClick={() => setTally(new Set())}>
                    clear
                  </button>
                )}
              </p>
            </>
          ) : (
            !readOnly && (
              <Button size="sm" variant="brand" onClick={() => o.quad.look(i)}>
                Kneel and examine this quadrat
              </Button>
            )
          )}
        </Box>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ capture

export function CapBench({ o, state, readOnly }: { o: Ecology; state: BioEcologyState; readOnly: boolean }) {
  const w = state.cap;
  const t = capTrays(o.v, state);
  const [effort, setEffort] = useState(10);
  const [tally, setTally] = useState<Set<number>>(new Set());
  const tap = readOnly ? undefined : (i: number) => setTally((x) => (x.has(i) ? new Set([...x].filter((y) => y !== i)) : new Set([...x, i])));
  return (
    <div className="space-y-3">
      <Box title="1. First sample">
        {!readOnly && !w.first && (
          <Row>
            {CAP_EFFORTS.map((e) => (
              <Button key={e} size="sm" variant={effort === e ? 'brand' : 'outline'} onClick={() => setEffort(e)}>
                Sweep {e} min
              </Button>
            ))}
            <Button size="sm" variant="brand" onClick={() => o.cap.sweep1(effort)}>
              Sweep the plot now
            </Button>
          </Row>
        )}
        {w.first && <p className="text-[12.5px]">Swept for {w.first.effort} minutes.</p>}
        {w.first && !w.counted1 && !readOnly && (
          <Button size="sm" variant="brand" className="mt-2" onClick={() => (o.cap.count1(), setTally(new Set()))}>
            Tip the catch onto the tray to count
          </Button>
        )}
        {w.counted1 && !w.second && <TrayView items={t.first} mark={w.mark} show tally={tally} onTap={tap} label="The first catch on the tray" className="mt-2 w-full rounded-xl border border-border" />}
        {w.counted1 && !w.mark && !readOnly && (
          <div className="mt-2 space-y-1">
            {CAP_MARKS.map((m) => (
              <Button key={m} size="sm" variant="outline" className="h-auto whitespace-normal text-left" onClick={() => o.cap.mark(m)}>
                Mark: {CAP_MARK_LABEL[m]}
              </Button>
            ))}
          </div>
        )}
        {w.mark && !w.release && !readOnly && (
          <div className="mt-2 space-y-1">
            {CAP_RELEASES.map((r) => (
              <Button key={r} size="sm" variant="outline" className="h-auto whitespace-normal text-left" onClick={() => o.cap.release(r)}>
                {CAP_RELEASE_LABEL[r]}
              </Button>
            ))}
          </div>
        )}
      </Box>
      {w.release && (
        <Box
          title={
            <span className="flex items-center gap-2">
              <Timer className="size-4 text-muted-foreground" aria-hidden /> 2. Since the release: <span className="font-mono">{w.clock} h</span>
            </span>
          }
        >
          {!readOnly && !w.second && (
            <>
              <Row>
                {CAP_WAITS.map((h) => (
                  <Button key={h} size="sm" variant="outline" onClick={() => o.cap.wait(h)}>
                    Wait {h >= 24 ? `${h / 24} day${h === 24 ? '' : 's'}` : `${h} h`}
                  </Button>
                ))}
              </Row>
              <Row>
                <span className="mt-2 text-[12.5px]">Second sweep:</span>
                {CAP_EFFORTS.map((e) => (
                  <Button key={e} size="sm" variant="brand" className="mt-2" disabled={w.clock <= 0} onClick={() => (o.cap.sweep2(e), setTally(new Set()))}>
                    Sweep {e} min
                  </Button>
                ))}
              </Row>
            </>
          )}
          {w.second && (
            <>
              <p className="text-[12.5px]">
                Second sweep at {w.second.at} h for {w.second.effort} min. {w.examined ? 'Each one turned over to look for the mark.' : ''}
              </p>
              <TrayView items={t.second} mark={w.mark} show={w.examined} tally={tally} onTap={tap} label="The second catch on the tray" className="mt-2 w-full rounded-xl border border-border" />
              {!readOnly && (
                <Row>
                  <Button size="sm" variant="brand" className="mt-2" disabled={w.examined} onClick={o.cap.examine}>
                    Examine each one for a mark
                  </Button>
                  <Button size="sm" variant="outline" className="mt-2" disabled={w.freed} onClick={o.cap.free}>
                    Release them where they were caught
                  </Button>
                </Row>
              )}
            </>
          )}
          <p className="mt-1 text-[12px] text-muted-foreground">Tap grasshoppers to tick them as you count: {tally.size} ticked.</p>
        </Box>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ factors

export function FacInstrument({ o, state, site, inst }: { o: Ecology; state: BioEcologyState; site: FacSite; inst: FacInst }) {
  const last = facLast(o.v, state, site, inst);
  if (!last) return <p className="text-[12px] text-muted-foreground">Not read yet today.</p>;
  const s = last.shown;
  const when = `${clockText(last.read.h)}${last.read.shaded || (inst !== 'AIR' && inst !== 'HYGRO') ? '' : ', in direct sun'}`;
  if (inst === 'AIR' || inst === 'SOIL') return <ThermoSvg value={s.value} label={`Thermometer reading at ${when}`} title={when} />;
  if (inst === 'HYGRO')
    return (
      <div className="flex gap-2">
        <ThermoSvg value={s.dry!} label="Dry bulb" title="Dry bulb" />
        <ThermoSvg value={s.wet!} wet label="Wet bulb" title="Wet bulb" />
      </div>
    );
  if (inst === 'LIGHT') return <MeterDisplay value={s.value} unit="lux" label={`Light meter reads ${s.value} lux`} />;
  if (inst === 'WIND') return <MeterDisplay value={s.value} unit="m/s" dp={1} label={`Anemometer reads ${s.value} metres per second`} />;
  return <PhChart ph={s.value} label="Soil extract with universal indicator beside the colour chart" />;
}

export function FacBench({ o, state, readOnly }: { o: Ecology; state: BioEcologyState; readOnly: boolean }) {
  const w = state.fac;
  const [shade, setShade] = useState(true);
  const [inst, setInst] = useState<FacInst>('AIR');
  const st = facStationNow(o.v, state);
  const site = w.at === 'OPEN' || w.at === 'SHADE' ? (w.at as FacSite) : null;
  return (
    <div className="space-y-3">
      <Box
        title={
          <span className="flex flex-wrap items-center gap-2">
            Day {w.day} of {FAC_DAYS}, <span className="font-mono">{clockText(w.h)}</span> <Badge variant="outline">{FAC_PLACE_LABEL[w.at]}</Badge>
          </span>
        }
      >
        {!readOnly && (
          <Row>
            {FAC_PLACES.map((p) => (
              <Button key={p} size="sm" variant={w.at === p ? 'brand' : 'outline'} onClick={() => o.fac.go(p)}>
                {FAC_PLACE_LABEL[p]}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => o.fac.wait(30)}>
              Wait 30 min
            </Button>
            <Button size="sm" variant="ghost" disabled={w.day >= FAC_DAYS} onClick={o.fac.nextDay}>
              Next day →
            </Button>
          </Row>
        )}
      </Box>
      {w.at === 'STATION' && (
        <Box title="The weather station">
          <div className="flex flex-wrap items-start gap-2">
            {st.six ? <SixSvg max={st.six.max} min={st.six.min} label="Six's thermometer" /> : null}
            {st.rain !== null ? <RainSvg mm={st.rain} label="Rain gauge cylinder" /> : null}
            {st.dir !== null ? <VaneSvg dir={st.dir} label="Wind vane" /> : null}
          </div>
          {!readOnly && (
            <Row>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => o.fac.station('SIX')}>
                Read the Six’s thermometer
              </Button>
              <Button size="sm" variant="outline" className="mt-2" disabled={!st.six || w.resets.includes(w.day)} onClick={o.fac.reset}>
                Reset it with the magnet
              </Button>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => o.fac.station('RAIN')}>
                Read the rain gauge
              </Button>
              <Button size="sm" variant="outline" className="mt-2" disabled={st.rain === null || w.empties.includes(w.day)} onClick={o.fac.empty}>
                Empty the rain gauge
              </Button>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => o.fac.station('VANE')}>
                Look at the wind vane
              </Button>
            </Row>
          )}
        </Box>
      )}
      {w.at === 'POND' && (
        <Box title="The pond edge — keep back from the edge">
          {w.secchiRead ? <SecchiSvg cm={o.v.fac.secchi} label="The Secchi disc rope at the water line" /> : null}
          {!readOnly && !w.secchiRead && (
            <Button size="sm" variant="brand" onClick={o.fac.secchi}>
              Lower the Secchi disc until it just disappears
            </Button>
          )}
        </Box>
      )}
      {site && (
        <Box title={FAC_PLACE_LABEL[site]}>
          <div className="mb-2 flex flex-wrap gap-1">
            {FAC_INSTS.map((x) => (
              <button key={x} type="button" onClick={() => setInst(x)} aria-pressed={inst === x} className={cn('rounded-full border px-2 py-0.5 text-[12px]', inst === x ? 'border-brand bg-brand/10' : 'border-border text-muted-foreground')}>
                {FAC_INST_LABEL[x]}
              </button>
            ))}
          </div>
          <FacInstrument o={o} state={state} site={site} inst={inst} />
          {!readOnly && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {(inst === 'AIR' || inst === 'HYGRO') && (
                <label className="flex items-center gap-1.5 text-[12.5px]">
                  <input type="checkbox" checked={shade} onChange={(e) => setShade(e.target.checked)} /> Shade it from direct sun
                </label>
              )}
              <Button size="sm" variant="brand" onClick={() => o.fac.read(inst, inst === 'AIR' || inst === 'HYGRO' ? shade : true)}>
                Read it now
              </Button>
            </div>
          )}
        </Box>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ soil

export function SoilBench({ o, state, readOnly }: { o: Ecology; state: BioEcologyState; readOnly: boolean }) {
  const w = state.soil;
  const [mass, setMass] = useState(100);
  const [cotton, setCotton] = useState(true);
  const [dried, setDried] = useState(true);
  const left = (list: { soil: SoilType }[]) => SOIL_TYPES.filter((t) => !list.some((x) => x.soil === t));
  return (
    <div className="space-y-3">
      <Box title={`1. Sedimentation jar — ${w.hours} h on the clock`}>
        {!readOnly && (
          <Row>
            {left(w.jars).map((t) => (
              <Button key={t} size="sm" variant="outline" onClick={() => o.soil.jar(t)}>
                Jar of {SOIL_LABEL[t].toLowerCase()} + water
              </Button>
            ))}
            <Button size="sm" variant="outline" disabled={!w.jars.some((j) => j.shakenAt !== null)} onClick={() => o.soil.waitJar(1)}>
              Wait 1 h
            </Button>
            <Button size="sm" variant="outline" disabled={!w.jars.some((j) => j.shakenAt !== null)} onClick={() => o.soil.waitJar(24)}>
              Leave it overnight (24 h)
            </Button>
          </Row>
        )}
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {w.jars.map((j, i) => {
            const n = jarNow(o.v, state, i)!;
            return (
              <div key={i}>
                <p className="text-[12px]">
                  {i + 1}. {SOIL_LABEL[j.soil]} {n.since === null ? '(not shaken)' : `· settling ${Math.round(n.since * 10) / 10} h`}
                </p>
                <JarSvg layers={n.layers} cloudy={n.cloudy} shaken={j.shakenAt !== null} label={`Jar ${i + 1}`} />
                {!readOnly && (
                  <Row>
                    <Button size="sm" variant="outline" disabled={j.shakenAt !== null} onClick={() => o.soil.shake(i)}>
                      Shake it
                    </Button>
                    <Button size="sm" variant="outline" disabled={j.shakenAt === null} onClick={() => o.soil.measureJar(i)}>
                      Measure the layers
                    </Button>
                  </Row>
                )}
                {n.measured && <p className="mt-1 text-[12px] text-muted-foreground">Ruler held against the jar: read each layer to the nearest mm.</p>}
              </div>
            );
          })}
        </div>
      </Box>
      <Box title={`2. Drainage — ${w.pouredAt === null ? 'not poured' : `${w.dclock} min`}`}>
        {!readOnly && w.pouredAt === null && (
          <div className="space-y-2">
            <Row>
              {SOIL_MASSES.map((m) => (
                <Button key={m} size="sm" variant={mass === m ? 'brand' : 'outline'} onClick={() => setMass(m)}>
                  {m} g of soil
                </Button>
              ))}
              <label className="flex items-center gap-1.5 text-[12.5px]">
                <input type="checkbox" checked={cotton} onChange={(e) => setCotton(e.target.checked)} /> Cotton-wool plug
              </label>
            </Row>
            <Row>
              {left(w.funnels).map((t) => (
                <Button key={t} size="sm" variant="outline" onClick={() => o.soil.funnel(t, mass, cotton)}>
                  Funnel of {SOIL_LABEL[t].toLowerCase()}
                </Button>
              ))}
              <Button size="sm" variant="brand" disabled={!w.funnels.length} onClick={o.soil.pour}>
                Pour 100 cm³ of water on each, start the clock
              </Button>
            </Row>
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {w.funnels.map((f, i) => {
            const d = drainNow(o.v, state, i)!;
            return d.read ? <CylinderSvg key={i} volume={d.volume} muddy={d.muddy} title={SOIL_LABEL[f.soil]} label={`Cylinder under the ${SOIL_LABEL[f.soil]} reads ${d.volume}`} /> : (
              <div key={i} className="flex h-[190px] w-[96px] items-center justify-center rounded-xl border border-dashed border-border p-1 text-center text-[11.5px] text-muted-foreground">
                {SOIL_LABEL[f.soil]} ({f.mass} g{f.cotton ? '' : ', no cotton'})
              </div>
            );
          })}
        </div>
        {!readOnly && w.pouredAt !== null && (
          <Row>
            <Button size="sm" variant="brand" className="mt-2" onClick={o.soil.readAllDrain}>
              Read the cylinders now
            </Button>
            <Button size="sm" variant="outline" className="mt-2" disabled={w.dclock >= SOIL_DRAIN_MAX} onClick={() => o.soil.waitDrain()}>
              Wait to the next reading time
            </Button>
          </Row>
        )}
      </Box>
      <Box title="3. Air content">
        {!readOnly && (
          <Row>
            {left(w.airs).map((t) => (
              <Button key={t} size="sm" variant="outline" onClick={() => o.soil.air(t)}>
                50 cm³ water + 50 cm³ {SOIL_LABEL[t].toLowerCase()}
              </Button>
            ))}
          </Row>
        )}
        <div className="mt-2 flex flex-wrap gap-3">
          {w.airs.map((a, i) => {
            const n = airNow(o.v, state, i)!;
            return (
              <div key={i} className="space-y-1">
                {n.read ? <CylinderSvg volume={n.final} title={SOIL_LABEL[a.soil]} label={`Cylinder of ${SOIL_LABEL[a.soil]} reads ${n.final}`} /> : <p className="w-[110px] text-[12px]">{SOIL_LABEL[a.soil]}: {!a.added ? 'water only' : n.bubbling ? 'bubbles rising…' : 'stirred, settled'}</p>}
                {!readOnly && (
                  <div className="flex flex-col gap-1">
                    <Button size="sm" variant="outline" disabled={a.added} onClick={() => o.soil.addSoil(i)}>
                      Add the soil
                    </Button>
                    <Button size="sm" variant="outline" disabled={!a.added || a.stirred} onClick={() => o.soil.stir(i)}>
                      Stir with the rod
                    </Button>
                    <Button size="sm" variant="brand" disabled={!a.added} onClick={() => o.soil.readAir(i)}>
                      Read the volume
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Box>
      <Box title="4. Humus by heating">
        {!readOnly && (
          <Row>
            <label className="flex items-center gap-1.5 text-[12.5px]">
              <input type="checkbox" checked={dried} onChange={(e) => setDried(e.target.checked)} /> Oven-dried soil
            </label>
            {left(w.crucibles).map((t) => (
              <Button key={t} size="sm" variant="outline" onClick={() => o.soil.crucible(t, dried)}>
                Crucible for {SOIL_LABEL[t].toLowerCase()}
              </Button>
            ))}
            <Button size="sm" variant="brand" disabled={!w.crucibles.some((c) => c.soilIn)} onClick={o.soil.heatAll}>
              Heat strongly 20 min
            </Button>
            <Button size="sm" variant="outline" disabled={!w.crucibles.some((c) => c.hot)} onClick={o.soil.coolAll}>
              Cool in the desiccator
            </Button>
          </Row>
        )}
        <div className="mt-2 space-y-2">
          {w.crucibles.map((c, i) => {
            const m = crucibleShown(o.v, state, i);
            return (
              <div key={i} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                <span className="w-[9rem]">
                  {SOIL_LABEL[c.soil]}
                  {c.dried ? '' : ' (damp)'} · heated {c.heats}×{c.hot ? ' · hot' : ''}
                </span>
                <BalanceDisplay mass={m} />
                {!readOnly && (
                  <>
                    <Button size="sm" variant="outline" disabled={c.soilIn} onClick={() => o.soil.addSample(i)}>
                      Add the soil
                    </Button>
                    <Button size="sm" variant="brand" onClick={() => o.soil.weigh(i)}>
                      Weigh
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Box>
    </div>
  );
}
