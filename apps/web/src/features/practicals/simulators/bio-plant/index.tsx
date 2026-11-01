import {
  LEAF_KINDS,
  LEAF_LABEL,
  LEAF_SHORT,
  OXY_DISTS,
  PLANT_TASKS,
  PLANT_TASK_TITLE,
  POTO_CONDS,
  POTO_COND_LABEL,
  POTO_COND_SHORT,
  STARCH_PLANTS,
  STARCH_PLANT_LABEL,
  oxyLampAt,
  oxySplint,
  potoCondAt,
  type BioPlantState,
} from '@aischool/shared';
import { ChevronDown, Leaf, Lightbulb, Timer } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SimulatorProps } from '../types';
import { nextHint, usePlant, type Plant } from './actions';
import { OxyNotebook, PotoNotebook, StarchNotebook, Written } from './notebook';
import { lastCountShown, lastRunShown, waterTemp } from './readings';
import { TaskText } from './task-text';
import { LeafSvg, OxygenSvg, PotometerSvg, StopwatchDisplay } from './visuals';

export default function BioPlantLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'bio-plant'>) {
  const p = usePlant({ seed, state, onChange, readOnly, startedAt, practicalId });
  const { v, task } = p;
  const [brief, setBrief] = useState(true);
  const started = !!state.poto.cut || state.oxy.plant || state.oxy.nahco3 || !!state.starch.plant;
  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setBrief((b) => !b)} aria-expanded={brief}>
          <span className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
            <Leaf className="size-4 text-muted-foreground" aria-hidden /> {PLANT_TASK_TITLE[task]}
          </span>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', brief && 'rotate-180')} aria-hidden />
        </button>
        {brief && (
          <div className="mt-3">
            <TaskText v={v} />
            {!readOnly && !practicalId && !started && (
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Experiment">
                {PLANT_TASKS.map((t) => (
                  <Button key={t} size="sm" variant={task === t ? 'brand' : 'outline'} onClick={() => p.chooseTask(t)} aria-pressed={task === t}>
                    {PLANT_TASK_TITLE[t]}
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
          {task === 'POTOMETER' ? <PotoBench p={p} state={state} readOnly={readOnly} /> : task === 'OXYGEN' ? <OxyBench p={p} state={state} readOnly={readOnly} /> : <StarchBench p={p} state={state} readOnly={readOnly} />}
        </Card>
        <div className="space-y-4">
          {task === 'POTOMETER' ? <PotoNotebook v={v} state={state} readOnly={readOnly} update={p.update} /> : task === 'OXYGEN' ? <OxyNotebook state={state} readOnly={readOnly} update={p.update} /> : <StarchNotebook v={v} state={state} readOnly={readOnly} update={p.update} />}
          <Written state={state} readOnly={readOnly} update={p.update} />
        </div>
      </div>
    </div>
  );
}

const Box = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-xl border border-border p-3">
    <p className="mb-2 text-[12.5px] font-semibold">{title}</p>
    {children}
  </div>
);

function PotoBench({ p, state, readOnly }: { p: Plant; state: BioPlantState; readOnly: boolean }) {
  const w = state.poto;
  const a = p.poto;
  const cond = potoCondAt(w, w.clock);
  const since = w.conds.length ? w.clock - (w.conds.filter((c) => c.at <= w.clock).at(-1)?.at ?? 0) : 0;
  const last = lastRunShown(p.v, state);
  return (
    <div className="space-y-3">
      <PotometerSvg v={p.v} w={w} label="The potometer: the bubble on the capillary scale" />
      {!readOnly && !w.bubble && (
        <Box title="Set up the potometer">
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="brand" disabled={!!w.cut} onClick={() => a.cut('WATER')}>
              Cut the shoot under water
            </Button>
            <Button size="sm" variant="outline" disabled={!!w.cut} onClick={() => a.cut('AIR')}>
              Cut the shoot in the air
            </Button>
            <Button size="sm" variant="brand" disabled={!w.cut || !!w.fit} onClick={() => a.fit('WATER')}>
              Fit it into the tube under water
            </Button>
            <Button size="sm" variant="outline" disabled={!w.cut || !!w.fit} onClick={() => a.fit('AIR')}>
              Fit it in the air
            </Button>
            <Button size="sm" variant="outline" disabled={!w.fit || w.sealed} onClick={a.seal}>
              Seal the joint with Vaseline
            </Button>
            <Button size="sm" variant="brand" disabled={!w.fit} onClick={a.bubble}>
              Dry the leaves; let one air bubble in
            </Button>
          </div>
        </Box>
      )}
      {w.bubble && (
        <Box title={`Condition: ${POTO_COND_SHORT[cond]} — ${Math.round(since * 10) / 10} min in it`}>
          {!readOnly && (
            <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Condition">
              {POTO_CONDS.map((c) => (
                <Button key={c} size="sm" variant={cond === c ? 'brand' : 'outline'} aria-pressed={cond === c} onClick={() => a.setCond(c)} title={POTO_COND_LABEL[c]}>
                  {POTO_COND_SHORT[c]}
                </Button>
              ))}
            </div>
          )}
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px]">
            <Timer className="size-4 text-muted-foreground" aria-hidden /> Last timing over 30 mm: <StopwatchDisplay sec={last?.sec ?? null} />
            {last && <Badge variant="outline">{POTO_COND_SHORT[last.run.cond]}</Badge>}
          </div>
          {!readOnly && (
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" onClick={() => a.wait(1)}>
                Wait 1 min
              </Button>
              <Button size="sm" variant="outline" onClick={() => a.wait(5)}>
                Wait 5 min
              </Button>
              <Button size="sm" variant="outline" disabled={w.zeroAt === w.clock} onClick={a.reset}>
                Reset the bubble (reservoir tap)
              </Button>
              <Button size="sm" variant="brand" disabled={w.zeroAt !== w.clock} onClick={() => a.time()}>
                Time the bubble over 30 mm
              </Button>
            </div>
          )}
          <p className="mt-2 text-[12px] text-muted-foreground">Clock: {Math.round(w.clock * 10) / 10} min (time-lapse) · {w.runs.length} timings</p>
        </Box>
      )}
    </div>
  );
}

function OxyBench({ p, state, readOnly }: { p: Plant; state: BioPlantState; readOnly: boolean }) {
  const w = state.oxy;
  const a = p.oxy;
  const d = oxyLampAt(w, w.clock);
  const since = w.clock - (w.moves.filter((m) => m.at <= w.clock).at(-1)?.at ?? 0);
  const last = lastCountShown(p.v, state);
  const sp = oxySplint(p.v.oxy, w);
  return (
    <div className="space-y-3">
      <OxygenSvg v={p.v} w={w} label="The pondweed under the funnel with the lamp on the metre rule" />
      {!readOnly && (
        <Box title="Set up">
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant={w.nahco3 ? 'secondary' : 'brand'} disabled={w.nahco3 && (!w.plant || w.co2At !== null)} onClick={a.nahco3}>
              {!w.plant ? 'Add a pinch of NaHCO₃' : 'Add another pinch of NaHCO₃'}
            </Button>
            <Button size="sm" variant="brand" disabled={w.plant} onClick={a.plant}>
              Pondweed under the funnel
            </Button>
            <Button size="sm" variant="outline" disabled={!w.plant || w.tubeAt !== null} onClick={a.tube}>
              Test tube of water over the stem
            </Button>
            <Button size="sm" variant={w.shield ? 'secondary' : 'outline'} onClick={() => a.shield(!w.shield)} aria-pressed={w.shield}>
              {w.shield ? 'Water trough in place' : 'Put the water trough (heat filter) in'}
            </Button>
            <Button size="sm" variant={w.dark ? 'secondary' : 'outline'} onClick={() => a.dark(!w.dark)} aria-pressed={w.dark}>
              {w.dark ? 'Room darkened' : 'Darken the room'}
            </Button>
          </div>
        </Box>
      )}
      {w.plant && (
        <Box title={d === null ? 'Lamp off' : `Lamp at ${d} cm — ${Math.round(since * 10) / 10} min since moved`}>
          {!readOnly && (
            <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Lamp distance">
              {OXY_DISTS.map((x) => (
                <Button key={x} size="sm" variant={d === x ? 'brand' : 'outline'} aria-pressed={d === x} onClick={() => a.lamp(x)}>
                  {x}
                </Button>
              ))}
              <Button size="sm" variant="ghost" onClick={() => a.lamp(null)}>
                Off
              </Button>
            </div>
          )}
          <p className="mb-2 text-[12.5px]">
            {last ? (
              <>
                Last count ({last.d ?? '—'} cm): <span className="font-mono text-[15px] font-semibold">{last.bubbles}</span> bubbles in one minute
              </>
            ) : (
              'No count yet.'
            )}
            {w.temps.length > 0 && <span className="ml-2 text-muted-foreground">Thermometer: {waterTemp(p.v, state).toFixed(1)} °C</span>}
          </p>
          {!readOnly && (
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" onClick={() => a.wait(1)}>
                Wait 1 min
              </Button>
              <Button size="sm" variant="outline" onClick={() => a.wait(5)}>
                Wait 5 min
              </Button>
              <Button size="sm" variant="brand" disabled={d === null} onClick={() => a.count()}>
                Count bubbles for 1 min
              </Button>
              <Button size="sm" variant="outline" onClick={a.temp}>
                Read the thermometer
              </Button>
              <Button size="sm" variant="outline" disabled={w.tubeAt === null || w.splintAt !== null} onClick={a.splint}>
                Test the gas with a glowing splint
              </Button>
            </div>
          )}
          {sp && <p className="mt-2 rounded-lg bg-muted px-2 py-1 text-[12.5px]">{sp.relit ? 'The glowing splint bursts into flame.' : 'The splint glows a little brighter, but there is too little gas to relight it.'}</p>}
          <p className="mt-2 text-[12px] text-muted-foreground">Clock: {Math.round(w.clock * 10) / 10} min (time-lapse) · {w.counts.length} counts</p>
        </Box>
      )}
    </div>
  );
}

function StarchBench({ p, state, readOnly }: { p: Plant; state: BioPlantState; readOnly: boolean }) {
  const w = state.starch;
  const a = p.starch;
  const [sel, setSel] = useState(0);
  const [tally, setTally] = useState<Set<number>>(new Set());
  const i = Math.min(sel, w.leaves.length - 1);
  const l = i >= 0 ? w.leaves[i] : undefined;
  return (
    <div className="space-y-3">
      {!readOnly && (
        <Box title="The plant">
          <div className="flex flex-wrap gap-1.5">
            {STARCH_PLANTS.map((x) => (
              <Button key={x} size="sm" variant={w.plant === x ? 'brand' : 'outline'} disabled={!!w.plant} onClick={() => a.plant(x)}>
                {STARCH_PLANT_LABEL[x]}
              </Button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" disabled={!w.plant || w.foil || w.hours > 0} onClick={a.foil}>
              Foil strip across a leaf
            </Button>
            <Button size="sm" variant="outline" disabled={!w.plant || w.koh || w.hours > 0} onClick={a.koh}>
              Seal a leaf in a flask with KOH
            </Button>
            <Button size="sm" variant="brand" disabled={!w.plant} onClick={() => a.light(2)}>
              Bright light 2 h
            </Button>
            <span className="self-center text-[12.5px] text-muted-foreground">{w.hours} h in the light</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {LEAF_KINDS.map((k) => (
              <Button key={k} size="sm" variant="outline" disabled={!w.plant || w.leaves.some((x) => x.kind === k) || (k === 'FOIL' && !w.foil) || (k === 'NOCO2' && !w.koh)} onClick={() => setSel(Math.max(0, a.pick(k)))} title={LEAF_LABEL[k]}>
                Pick: {LEAF_SHORT[k]}
              </Button>
            ))}
          </div>
        </Box>
      )}
      {w.leaves.length > 0 && (
        <Box title="The leaves">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {w.leaves.map((x, k) => (
              <button key={k} type="button" onClick={() => (setSel(k), setTally(new Set()))} aria-pressed={k === i} className={cn('rounded-full border px-2.5 py-1 text-[12px]', k === i ? 'border-brand bg-brand/10' : 'border-border text-muted-foreground hover:bg-muted')}>
                {k + 1}. {LEAF_SHORT[x.kind]}
              </button>
            ))}
          </div>
          {l && (
            <>
              <LeafSvg v={p.v} w={w} leaf={l} grid={w.grid.leaf === i} tally={w.grid.leaf === i ? tally : undefined} onTap={w.grid.leaf === i && !readOnly ? (k) => setTally((t) => (t.has(k) ? new Set([...t].filter((x) => x !== k)) : new Set([...t, k]))) : undefined} label={`${LEAF_SHORT[l.kind]}${l.iodine ? ' after iodine' : ''}`} className="mx-auto max-w-[360px]" />
              {w.grid.leaf === i && <p className="mt-1 text-center text-[12px] text-muted-foreground">Tap squares to tick them as you count: {tally.size} ticked</p>}
              {!readOnly && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="sm" variant={w.flame ? 'destructive' : 'outline'} onClick={() => a.flame(!w.flame)} aria-pressed={w.flame}>
                    {w.flame ? 'Turn the Bunsen flame OFF' : 'Light the Bunsen (water bath)'}
                  </Button>
                  <Button size="sm" variant="outline" disabled={!w.flame} onClick={() => a.boil(i)}>
                    Boil in water 1 min
                  </Button>
                  <Button size="sm" variant="brand" disabled={!w.hot} onClick={() => a.ethanol(i)}>
                    Ethanol tube in the hot water bath
                  </Button>
                  <Button size="sm" variant="ghost" disabled={!w.flame} onClick={() => a.ethanol(i, true)}>
                    Heat the ethanol over the flame
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => a.soften(i)} disabled={l.soft}>
                    Dip in warm water
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => a.tile(i)} disabled={l.tile}>
                    Spread on the tile
                  </Button>
                  <Button size="sm" variant="brand" onClick={() => a.iodine(i)} disabled={!l.tile || l.iodine}>
                    Add iodine
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => (a.grid(i), setTally(new Set()))} disabled={!l.iodine || w.grid.leaf === i}>
                    Lay it on the grid
                  </Button>
                </div>
              )}
              <p className="mt-2 text-[12px] text-muted-foreground">
                Boiled {l.boiled} s · {l.eth} min in ethanol{l.ethFlame ? ' (flame was on!)' : ''}
                {l.direct ? ' (heated over the flame!)' : ''} · {l.soft ? 'softened' : 'not softened'}
              </p>
            </>
          )}
        </Box>
      )}
    </div>
  );
}
