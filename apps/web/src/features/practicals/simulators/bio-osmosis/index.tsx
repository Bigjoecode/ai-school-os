import {
  AGAR_ACID,
  AGAR_ACID_LABEL,
  AGAR_CLOCK_MAX,
  AGAR_SIZES,
  OSMO_TASKS,
  OSMO_TASK_TITLE,
  PLAS_CLOCK_MAX,
  PLAS_MEDIA,
  PLAS_MEDIUM_LABEL,
  PLAS_OBJECTIVES,
  POTATO_CLOCK_MAX,
  POTATO_CONCS,
  POTATO_MAX_CYL,
  agarDepth,
  agarSeenClear,
  agarSide,
  potatoPhase,
  type BioOsmosisState,
  type PlasMedium,
} from '@aischool/shared';
import { ChevronDown, Droplets, Lightbulb, Microscope, Timer, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SimulatorProps } from '../types';
import { nextHint, useOsmosis, type Osmosis } from './actions';
import { AgarNotebook, PlasNotebook, PotatoNotebook, Written } from './notebook';
import { TaskText } from './task-text';
import { AgarBeakerSvg, BalanceDisplay, FieldView, RulerSvg } from './visuals';
import { FEEL_TEXT, PHASE_LABEL, potatoShown, usePlasShrink } from './readings';

export default function BioOsmosisLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'bio-osmosis'>) {
  const o = useOsmosis({ seed, state, onChange, readOnly, startedAt, practicalId });
  const { v, task } = o;
  const [brief, setBrief] = useState(true);
  const started = state.potato.cyl.length > 0 || state.plas.peeled || state.agar.cubes.length > 0;
  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setBrief((b) => !b)} aria-expanded={brief}>
          <span className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
            <Droplets className="size-4 text-muted-foreground" aria-hidden /> {OSMO_TASK_TITLE[task]}
          </span>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', brief && 'rotate-180')} aria-hidden />
        </button>
        {brief && (
          <div className="mt-3">
            <TaskText v={v} />
            {!readOnly && !practicalId && !started && (
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Experiment">
                {OSMO_TASKS.map((t) => (
                  <Button key={t} size="sm" variant={task === t ? 'brand' : 'outline'} onClick={() => o.chooseTask(t)} aria-pressed={task === t}>
                    {OSMO_TASK_TITLE[t]}
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
          {task === 'POTATO' ? <PotatoBench o={o} state={state} readOnly={readOnly} /> : task === 'PLASMOLYSIS' ? <PlasBench o={o} state={state} readOnly={readOnly} /> : <AgarBench o={o} state={state} readOnly={readOnly} />}
        </Card>
        <div className="space-y-4">
          {task === 'POTATO' ? <PotatoNotebook state={state} readOnly={readOnly} update={o.update} /> : task === 'PLASMOLYSIS' ? <PlasNotebook v={v} state={state} readOnly={readOnly} update={o.update} /> : <AgarNotebook state={state} readOnly={readOnly} update={o.update} />}
          <Written state={state} readOnly={readOnly} update={o.update} />
        </div>
      </div>
    </div>
  );
}

function PotatoBench({ o, state, readOnly }: { o: Osmosis; state: BioOsmosisState; readOnly: boolean }) {
  const w = state.potato;
  const [sel, setSel] = useState(0);
  const soaking = w.cyl.some((c) => potatoPhase(c) === 'SOAK');
  const started = w.cyl.some((c) => c.placedAt !== null);
  const i = Math.min(sel, w.cyl.length - 1);
  const shown = i >= 0 ? potatoShown(o.v, state, i) : null;
  const [felt, setFelt] = useState<Set<number>>(new Set());
  const soakFor = w.cyl.find((c) => c.placedAt !== null);
  return (
    <div className="space-y-3">
      {!readOnly && !started && (
        <div className="rounded-xl border border-border p-3">
          <p className="mb-2 text-[12.5px] font-semibold">1. Bore a cylinder for a solution (cork borer, on the tile)</p>
          <div className="flex flex-wrap gap-1.5">
            {POTATO_CONCS.map((c) => (
              <Button key={c} size="sm" variant="outline" disabled={w.cyl.length >= POTATO_MAX_CYL} onClick={() => setSel(Math.max(0, o.potato.bore(c)))}>
                {c === 0 ? 'Distilled water' : `${c.toFixed(1)} M sucrose`}
              </Button>
            ))}
          </div>
        </div>
      )}
      {w.cyl.length > 0 && (
        <div className="rounded-xl border border-border p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12.5px] font-semibold">Cylinders</p>
            {!readOnly && !started && (
              <Button size="sm" variant="outline" onClick={o.potato.trimAll} disabled={w.cyl.every((c) => c.trimmed)}>
                Trim all to 50 mm
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {w.cyl.map((c, k) => (
              <button key={k} type="button" onClick={() => setSel(k)} aria-pressed={k === i} className={cn('rounded-full border px-2.5 py-1 text-[12px]', k === i ? 'border-brand bg-brand/10' : 'border-border text-muted-foreground hover:bg-muted')}>
                {k + 1}. {c.conc.toFixed(1)} M{c.trimmed ? '' : ' (untrimmed)'}
              </button>
            ))}
          </div>
          {shown && (
            <div className="mt-3 space-y-2">
              <p className="text-[12.5px]">
                Cylinder {i + 1} ({w.cyl[i]!.conc.toFixed(1)} mol/dm³) — <span className="text-muted-foreground">{PHASE_LABEL[shown.ph]}{shown.ph !== 'SOAK' && (shown.ph === 'B' ? w.cyl[i]!.blotB : w.cyl[i]!.blotA) ? ', blotted dry' : ''}</span>
              </p>
              {shown.trueLength !== null ? <RulerSvg length={shown.trueLength} kind="potato" label={`Cylinder ${i + 1} against the ruler`} /> : <p className="text-[12px] text-muted-foreground">Lay it along the ruler to measure its length.</p>}
              <div className="flex items-center gap-2">
                <BalanceDisplay mass={shown.mass} />
                {shown.feel && felt.has(i) && <span className="text-[12.5px]">{FEEL_TEXT[shown.feel]}</span>}
              </div>
              {!readOnly && shown.ph !== 'SOAK' && (
                <div className="flex flex-wrap gap-1.5">
                  {shown.ph === 'B' && (
                    <Button size="sm" variant="outline" disabled={w.cyl[i]!.trimmed || w.measures.some((m) => m.cyl === i)} onClick={() => o.potato.trim(i)}>
                      Trim to 50 mm
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => o.potato.blot(i)} disabled={shown.ph === 'B' ? w.cyl[i]!.blotB : w.cyl[i]!.blotA}>
                    Blot dry with filter paper
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => o.potato.measure(i)}>
                    Measure the length
                  </Button>
                  <Button size="sm" variant="brand" onClick={() => o.potato.weigh(i)}>
                    Weigh it
                  </Button>
                  {shown.ph === 'A' && (
                    <Button size="sm" variant="outline" onClick={() => (o.note(`feel#${i + 1}`), setFelt(new Set([...felt, i])))}>
                      Feel it
                    </Button>
                  )}
                  {shown.ph === 'B' && !w.measures.some((m) => m.cyl === i) && !w.weighs.some((m) => m.cyl === i) && (
                    <Button size="sm" variant="ghost" onClick={() => (o.potato.discard(i), setSel(0))}>
                      <Trash2 /> Discard
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {w.cyl.length > 0 && (
        <div className="rounded-xl border border-border p-3">
          <p className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px] font-semibold">
            <Timer className="size-4 text-muted-foreground" aria-hidden /> Soaking (time-lapse): <span className="font-mono text-[15px]">{soakFor ? `${w.clock - (soakFor.placedAt ?? 0)} min` : 'not started'}</span>
            {soaking && <Badge variant="outline">in the solutions</Badge>}
          </p>
          {!readOnly && (
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="brand" disabled={!w.cyl.some((c) => c.placedAt === null)} onClick={o.potato.placeAll}>
                Put every cylinder in its solution
              </Button>
              <Button size="sm" variant="outline" disabled={!soaking || w.clock >= POTATO_CLOCK_MAX} onClick={() => o.potato.wait(15)}>
                Wait 15 min
              </Button>
              <Button size="sm" variant="outline" disabled={!soaking || w.clock >= POTATO_CLOCK_MAX} onClick={() => o.potato.wait(30)}>
                Wait 30 min
              </Button>
              <Button size="sm" variant="outline" disabled={!soaking} onClick={o.potato.removeAll}>
                Take them all out (forceps)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PlasBench({ o, state, readOnly }: { o: Osmosis; state: BioOsmosisState; readOnly: boolean }) {
  const w = state.plas;
  const a = o.plasmolysis;
  const sh = usePlasShrink(o.v, w);
  const [medium, setMedium] = useState<PlasMedium>('SUCROSE');
  const [tally, setTally] = useState<Set<number>>(new Set());
  const last = w.irrigations.at(-1);
  const tap = (i: number) => setTally((t) => (t.has(i) ? new Set([...t].filter((x) => x !== i)) : new Set([...t, i])));
  return (
    <div className="space-y-3">
      {!readOnly && !w.onStage && (
        <div className="rounded-xl border border-border p-3">
          <p className="mb-2 text-[12.5px] font-semibold">Prepare the slide</p>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant={w.peeled ? 'secondary' : 'brand'} disabled={w.peeled} onClick={a.peel}>
              {w.peeled ? 'Epidermis peeled' : 'Peel a thin strip of coloured epidermis'}
            </Button>
            {PLAS_MEDIA.map((m) => (
              <Button key={m} size="sm" variant="outline" disabled={!w.peeled || !!w.mount} onClick={() => a.mount(m)}>
                Mount in {PLAS_MEDIUM_LABEL[m].toLowerCase()}
              </Button>
            ))}
            <Button size="sm" variant="outline" disabled={!w.mount || w.coverslip} onClick={a.coverslip}>
              Lower the cover slip at an angle
            </Button>
            <Button size="sm" variant="brand" disabled={!w.coverslip} onClick={a.toStage}>
              Put it on the stage
            </Button>
          </div>
        </div>
      )}
      {w.onStage && (
        <div className="rounded-xl border border-border p-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <Microscope className="size-4 text-muted-foreground" aria-hidden />
            {PLAS_OBJECTIVES.map((ob) => (
              <Button key={ob} size="sm" variant={w.objective === ob ? 'brand' : 'outline'} disabled={readOnly} aria-pressed={w.objective === ob} onClick={() => a.objective(ob)}>
                ×{ob}
              </Button>
            ))}
            <span className="ml-auto font-mono text-[13px]">{w.clock} min</span>
          </div>
          <FieldView v={o.v} g={sh.g} killed={sh.killed} objective={w.objective} placed tally={tally} onTap={readOnly ? undefined : tap} label={`Field of view at ×${w.objective}`} className="mx-auto w-full max-w-[360px]" />
          <p className="mt-1 text-center text-[12px] text-muted-foreground">
            Tap cells to mark them while you count: {tally.size} marked{' '}
            {tally.size > 0 && (
              <button type="button" className="underline" onClick={() => setTally(new Set())}>
                clear
              </button>
            )}
          </p>
          {!readOnly && (
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="brand" onClick={a.capture} disabled={w.captures.some((c) => c.at === w.clock && c.objective === w.objective)}>
                  Record this view
                </Button>
                <Button size="sm" variant="outline" disabled={w.clock >= PLAS_CLOCK_MAX} onClick={() => a.wait(1)}>
                  Wait 1 min
                </Button>
                <Button size="sm" variant="outline" disabled={w.clock >= PLAS_CLOCK_MAX} onClick={() => a.wait(5)}>
                  Wait 5 min
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                <select value={medium} onChange={(e) => setMedium(e.target.value as PlasMedium)} className="h-8 rounded-md border border-input bg-card px-1 text-[12.5px]" aria-label="Liquid for the edge of the cover slip">
                  {PLAS_MEDIA.map((m) => (
                    <option key={m} value={m}>
                      {PLAS_MEDIUM_LABEL[m]}
                    </option>
                  ))}
                </select>
                <Button size="sm" variant="outline" onClick={() => a.drop(medium)}>
                  A drop at one edge
                </Button>
                <Button size="sm" variant="outline" disabled={!last || last.drawn || last.at !== w.clock} onClick={a.drawThrough}>
                  Filter paper at the other edge
                </Button>
              </div>
            </div>
          )}
          {w.captures.length > 0 && <p className="mt-2 text-[12px] text-muted-foreground">Views recorded: {w.captures.map((c) => `${c.at} min ×${c.objective}`).join(' · ')}</p>}
        </div>
      )}
    </div>
  );
}

function AgarBench({ o, state, readOnly }: { o: Osmosis; state: BioOsmosisState; readOnly: boolean }) {
  const w = state.agar;
  const a = o.agar;
  const [sel, setSel] = useState(0);
  const i = Math.min(sel, w.cubes.length - 1);
  const c = i >= 0 ? w.cubes[i] : undefined;
  const started = w.cubes.some((x) => x.placedAt !== null);
  const justClear = w.cubes.map((_, k) => k).filter((k) => started && agarSeenClear(o.v.agar, k, w) === w.clock);
  return (
    <div className="space-y-3">
      {!readOnly && !started && (
        <div className="rounded-xl border border-border p-3">
          <p className="mb-2 text-[12.5px] font-semibold">1. Cut a cube of pink agar (scalpel, on the tile)</p>
          <div className="flex flex-wrap gap-1.5">
            {AGAR_SIZES.map((sz) => (
              <Button key={sz} size="sm" variant="outline" disabled={w.cubes.length >= 6} onClick={() => setSel(Math.max(0, a.cut(sz)))}>
                {sz} cm cube
              </Button>
            ))}
          </div>
          <p className="mb-2 mt-3 text-[12.5px] font-semibold">2. Acid in the beaker</p>
          <div className="flex flex-wrap gap-1.5">
            {AGAR_ACID.map((x) => (
              <Button key={x} size="sm" variant={w.acid === x ? 'brand' : 'outline'} onClick={() => a.pour(x)}>
                {AGAR_ACID_LABEL[x]}
              </Button>
            ))}
          </div>
        </div>
      )}
      {w.cubes.length > 0 && (
        <div className="rounded-xl border border-border p-3">
          <p className="mb-2 text-[12.5px] font-semibold">Cubes</p>
          <div className="flex flex-wrap gap-1.5">
            {w.cubes.map((x, k) => (
              <button key={k} type="button" onClick={() => setSel(k)} aria-pressed={k === i} className={cn('rounded-full border px-2.5 py-1 text-[12px]', k === i ? 'border-brand bg-brand/10' : 'border-border text-muted-foreground hover:bg-muted')}>
                {k + 1}. {x.size} cm{x.cutAt !== null ? ' (cut)' : ''}
              </button>
            ))}
          </div>
          {c && (
            <div className="mt-3 space-y-2">
              {c.cutAt !== null ? (
                w.depthMeasured.includes(i) ? (
                  <RulerSvg length={agarSide(o.v.agar, i, c)} depth={agarDepth(o.v.agar, i, c, c.cutAt)} kind="section" range={40} label={`Cut face of cube ${i + 1} against the ruler`} />
                ) : (
                  <p className="text-[12px] text-muted-foreground">Cut open at {c.cutAt} min: lay the cut face against the ruler to measure the colourless zone.</p>
                )
              ) : w.measured.includes(i) ? (
                <RulerSvg length={agarSide(o.v.agar, i, c)} kind="cube" range={40} label={`Cube ${i + 1} against the ruler`} />
              ) : (
                <p className="text-[12px] text-muted-foreground">Lay the cube against the ruler to measure its side.</p>
              )}
              {!readOnly && (
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => a.measure(i)} disabled={c.cutAt !== null}>
                    Measure the side
                  </Button>
                  {c.placedAt !== null && c.cutAt === null && (
                    <Button size="sm" variant="outline" onClick={() => a.cutOpen(i)}>
                      Take it out and cut it in half
                    </Button>
                  )}
                  {c.cutAt !== null && (
                    <Button size="sm" variant="brand" onClick={() => a.measureDepth(i)}>
                      Measure the colourless zone
                    </Button>
                  )}
                  {c.placedAt === null && (
                    <Button size="sm" variant="ghost" onClick={() => (a.discard(i), setSel(0))}>
                      <Trash2 /> Discard
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {w.cubes.length > 0 && (
        <div className="rounded-xl border border-border p-3">
          <p className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold">
            <Timer className="size-4 text-muted-foreground" aria-hidden /> Stopwatch: <span className="font-mono text-[15px]">{started ? `${w.clock} min` : 'not started'}</span>
          </p>
          <AgarBeakerSvg v={o.v} w={w} label="The cubes in the beaker of acid" />
          {justClear.length > 0 && (
            <p className="mt-1 rounded-lg bg-success/10 px-2 py-1 text-[12.5px]" role="status">
              Just now ({w.clock} min): {justClear.map((k) => `cube ${k + 1} (${w.cubes[k]!.size} cm)`).join(' and ')} became completely colourless.
            </p>
          )}
          {!readOnly && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button size="sm" variant="brand" disabled={!w.acid || !w.cubes.some((x) => x.placedAt === null)} onClick={a.placeAll}>
                All the cubes into the acid, start the stopwatch
              </Button>
              {[1, 5, 10].map((m) => (
                <Button key={m} size="sm" variant="outline" disabled={!started || w.clock >= AGAR_CLOCK_MAX} onClick={() => a.wait(m)}>
                  Watch {m} min
                </Button>
              ))}
              <Button size="sm" variant="ghost" disabled={!started || w.clock >= AGAR_CLOCK_MAX} onClick={() => a.wait(20, true)}>
                Leave it 20 min
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
