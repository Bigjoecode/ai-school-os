import { AIR_MIN, DISSECT_TASKS, DISSECT_TASK_TITLE, EOSIN_PLACE_LABEL, PLATES, PLATE_LABEL, RAT_HOW_LABEL, SLICES, eosinSectionSeen, type BioDissectionState, type RatHow } from '@aischool/shared';
import { ChevronDown, Lightbulb, Microscope } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SimulatorProps } from '../types';
import { nextHint, useDissect, type Dissect } from './actions';
import { EosinNotebook, MicroNotebook, RatNotebook, Written } from './notebook';
import { lastEosinShown, lastRatShown, plateDaysNow } from './readings';
import { TaskText } from './task-text';
import { BreadSvg, MouldSlide, PlantSvg, PlateSvg, RatSvg, RulerZoom, SectionSvg } from './visuals';

export default function BioDissectionLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'bio-dissection'>) {
  const p = useDissect({ seed, state, onChange, readOnly, startedAt, practicalId });
  const { v, task } = p;
  const [brief, setBrief] = useState(true);
  const started = state.log.some((e) => !e.a.startsWith('task:') && !e.a.startsWith('safety'));
  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setBrief((b) => !b)} aria-expanded={brief}>
          <span className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
            <Microscope className="size-4 text-muted-foreground" aria-hidden /> {DISSECT_TASK_TITLE[task]}
          </span>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', brief && 'rotate-180')} aria-hidden />
        </button>
        {brief && (
          <div className="mt-3">
            <TaskText v={v} />
            {!readOnly && !practicalId && !started && (
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Practical">
                {DISSECT_TASKS.map((t) => (
                  <Button key={t} size="sm" variant={task === t ? 'brand' : 'outline'} onClick={() => p.chooseTask(t)} aria-pressed={task === t}>
                    {DISSECT_TASK_TITLE[t]}
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
          {task === 'RAT' ? <RatBench p={p} state={state} readOnly={readOnly} /> : task === 'MICROBE' ? <MicroBench p={p} state={state} readOnly={readOnly} seed={seed} /> : <EosinBench p={p} state={state} readOnly={readOnly} />}
        </Card>
        <div className="space-y-4">
          {task === 'RAT' ? <RatNotebook v={v} state={state} readOnly={readOnly} update={p.update} /> : task === 'MICROBE' ? <MicroNotebook v={v} state={state} readOnly={readOnly} update={p.update} /> : <EosinNotebook v={v} state={state} readOnly={readOnly} update={p.update} />}
          <Written state={state} readOnly={readOnly} update={p.update} />
        </div>
      </div>
    </div>
  );
}

export const Box = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-xl border border-border p-3">
    <p className="mb-2 text-[12.5px] font-semibold">{title}</p>
    {children}
  </div>
);
const B = ({ on, children, brand, disabled }: { on: () => unknown; children: React.ReactNode; brand?: boolean; disabled?: boolean }) => (
  <Button size="sm" variant={brand ? 'brand' : 'outline'} disabled={disabled} onClick={() => on()}>
    {children}
  </Button>
);
const Row = ({ children }: { children: React.ReactNode }) => <div className="flex flex-wrap gap-1.5">{children}</div>;

function EosinBench({ p, state, readOnly }: { p: Dissect; state: BioDissectionState; readOnly: boolean }) {
  const w = state.eosin;
  const a = p.eosin;
  const [at, setAt] = useState(3);
  const [look, setLook] = useState<{ n: number; tool: 'LENS' | 'MICRO' } | null>(null);
  const last = lastEosinShown(p.v, state);
  const cut = w.sections.length > 0;
  const view = look ?? (w.views.length ? w.views[w.views.length - 1]! : null);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 items-start gap-2">
        <PlantSvg v={p.v} w={w} label={`The balsam plant at ${w.clock} min`} />
        {last ? <RulerZoom reading={last.cm} label={`The ruler at the red line at ${last.at} min`} /> : <p className="text-[12px] text-muted-foreground">Read the ruler to see it close up.</p>}
      </div>
      {last && <p className="text-[12.5px]">Last reading ({last.at} min): the red line reaches {last.cm.toFixed(1)} cm.</p>}
      {!readOnly && (
        <>
          <Box title="Set up">
            <Row>
              <B brand on={() => a.wash('GENTLE')} disabled={!!w.wash}>
                Wash the roots gently
              </B>
              <B on={() => a.wash('ROUGH')} disabled={!!w.wash}>
                Rinse them hard under the tap
              </B>
              <B brand on={a.dye} disabled={!w.wash || w.dye}>
                Stand the roots in eosin
              </B>
              {(['BRIGHT', 'DARK'] as const).map((pl) => (
                <B key={pl} on={() => a.place(pl)} disabled={w.clock > 0 || w.place === pl}>
                  {EOSIN_PLACE_LABEL[pl]}
                </B>
              ))}
            </Row>
          </Box>
          <Box title={`${w.clock} min${cut ? ' — the stem has been cut' : ''}`}>
            <Row>
              <B on={() => a.wait(10)} disabled={!w.dye || cut}>
                Wait 10 min
              </B>
              <B on={() => a.wait(20)} disabled={!w.dye || cut}>
                Wait 20 min
              </B>
              <B brand on={a.read} disabled={!w.dye || cut || w.clock < 1 || w.reads.includes(w.clock)}>
                Read the height of the red line
              </B>
              <B on={a.leaves} disabled={!w.dye}>
                Look at the leaf veins
              </B>
            </Row>
          </Box>
          <Box title="Sections (cutting stops the experiment)">
            <div className="mb-2 flex items-center gap-2 text-[12.5px]">
              <B on={() => setAt((x) => Math.max(1, x - 1))}>−</B>
              <span>Cut at {at} cm above the dye</span>
              <B on={() => setAt((x) => Math.min(Math.floor(p.v.eosin.stemH) - 1, x + 1))}>+</B>
            </div>
            <Row>
              <B brand on={() => a.cut('TS', at)} disabled={!w.dye || w.clock < 1}>
                Thin transverse section on the tile
              </B>
              <B on={() => a.cut('LS', at)} disabled={!w.dye || w.clock < 1}>
                Thin longitudinal section on the tile
              </B>
              <B on={() => a.cut('TS', at, false)} disabled={!w.dye || w.clock < 1}>
                A thick slice
              </B>
              <B on={() => a.cut('TS', at, true, false)} disabled={!w.dye || w.clock < 1}>
                Hold the stem and slice towards the thumb
              </B>
            </Row>
            {w.sections.map((x, n) => (
              <div key={n} className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px]">
                <span className="w-32">
                  {n + 1}. {x.kind} at {x.at} cm
                </span>
                <B on={() => (a.view(n, 'LENS'), setLook({ n, tool: 'LENS' }))}>Hand lens</B>
                <B on={() => (a.view(n, 'MICRO'), setLook({ n, tool: 'MICRO' }))}>Microscope</B>
              </div>
            ))}
          </Box>
        </>
      )}
      {view && w.sections[view.n] && <SectionSvg kind={w.sections[view.n]!.kind} seen={eosinSectionSeen(p.v.eosin, w, view.n)} thin={w.sections[view.n]!.thin} tool={view.tool} bundles={p.v.eosin.bundles} label={`Section ${view.n + 1}`} />}
    </div>
  );
}

function RatBench({ p, state, readOnly }: { p: Dissect; state: BioDissectionState; readOnly: boolean }) {
  const w = state.rat;
  const a = p.rat;
  const [how, setHow] = useState<RatHow>('THREAD');
  const last = lastRatShown(p.v, state);
  return (
    <div className="space-y-3">
      <RatSvg w={w} label="The rat on the dissecting board" />
      {last && (
        <p className="text-[12.5px]">
          Last measurement: {last.what === 'BODY' ? 'body (snout to anus)' : last.what === 'SI' ? 'small intestine' : 'large intestine'} = {last.cm.toFixed(1)} cm.
        </p>
      )}
      {!readOnly && (
        <>
          <Box title="Pin out and open">
            <Row>
              <B brand on={a.gloves} disabled={w.gloves}>
                Put on gloves
              </B>
              <B brand on={() => a.pin('VENTRAL')} disabled={!!w.pinned}>
                Pin on its back by the four limbs
              </B>
              <B on={() => a.pin('DORSAL')} disabled={!!w.pinned}>
                Pin it belly down
              </B>
              <B on={a.unpin} disabled={!w.pinned || !!w.skin}>
                Unpin
              </B>
              <B on={() => a.measure('BODY')} disabled={!w.pinned}>
                Measure snout to anus
              </B>
              <B brand on={() => a.skin('LIFTED')} disabled={w.pinned !== 'VENTRAL' || !!w.skin}>
                Lift the skin with forceps and cut the midline
              </B>
              <B on={() => a.skin('DEEP')} disabled={w.pinned !== 'VENTRAL' || !!w.skin}>
                Push the scissors straight in
              </B>
              <B on={a.pinSkin} disabled={!w.skin || w.skinPinned}>
                Side cuts; pin the skin back
              </B>
              <B brand on={() => a.wall('LIFTED')} disabled={!w.skinPinned || !!w.wall}>
                Lift the body wall and cut it
              </B>
              <B on={() => a.wall('DEEP')} disabled={!w.skinPinned || !!w.wall}>
                Cut deep through the wall
              </B>
              <B on={a.ribs} disabled={!w.wall || w.ribs}>
                Cut the ribs to open the thorax
              </B>
              <B on={a.moisten} disabled={!w.skin}>
                Moisten with water
              </B>
            </Row>
          </Box>
          <Box title="Display and measure">
            <Row>
              <B brand on={() => a.display('SEEKER')} disabled={!w.wall || !!w.display}>
                Displace the gut with the seeker
              </B>
              <B on={() => a.display('FORCEPS')} disabled={!w.wall || !!w.display}>
                Pull the gut aside with forceps
              </B>
              <B on={a.unravel} disabled={!w.display || w.unravelled}>
                Unravel the gut
              </B>
            </Row>
            <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="How to measure the gut">
              {(['THREAD', 'STRETCH'] as RatHow[]).map((h) => (
                <button key={h} type="button" aria-pressed={how === h} onClick={() => setHow(h)} className={cn('rounded-full border px-2.5 py-1 text-[12px]', how === h ? 'border-brand bg-brand/10' : 'border-border text-muted-foreground')}>
                  {RAT_HOW_LABEL[h]}
                </button>
              ))}
            </div>
            <div className="mt-2">
              <Row>
                <B on={() => a.measure('SI', how)} disabled={!w.unravelled}>
                  Measure the small intestine
                </B>
                <B on={() => a.measure('LI', how)} disabled={!w.unravelled}>
                  Measure the large intestine
                </B>
                <B on={a.clean} disabled={!w.pinned || w.cleaned}>
                  Disinfect tools and board
                </B>
              </Row>
            </div>
          </Box>
        </>
      )}
    </div>
  );
}

function MicroBench({ p, state, readOnly, seed }: { p: Dissect; state: BioDissectionState; readOnly: boolean; seed: number }) {
  const w = state.micro;
  const a = p.micro;
  const [k, setK] = useState(0);
  const locked = w.incAt !== null;
  const days = plateDaysNow(state);
  const counted = w.countAt === w.day;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1.5">
        {PLATES.map((r, j) => (
          <button key={r} type="button" onClick={() => setK(j)} className={cn('rounded-lg border p-1 text-[11px]', j === k ? 'border-brand' : 'border-transparent')} aria-pressed={j === k}>
            <PlateSvg v={p.v} w={w} k={j} days={counted ? days : null} seed={seed} label={`${PLATE_LABEL[r]} plate`} />
            {PLATE_LABEL[r]}
          </button>
        ))}
      </div>
      {counted && <PlateSvg v={p.v} w={w} k={k} days={days} seed={seed} label={`${PLATE_LABEL[PLATES[k]!]} plate close up`} big />}
      <p className="text-[12.5px]">Day {w.day}{locked ? ` · plates incubated ${days} d at ${w.temp} °C` : ''}{w.breadAt !== null ? ` · bread ${w.day - w.breadAt} d` : ''}</p>
      {!readOnly && (
        <>
          <Box title={`Plates — ${PLATE_LABEL[PLATES[k]!]}`}>
            <Row>
              <B on={a.wipe} disabled={w.wiped}>
                Wipe the bench with disinfectant
              </B>
              <B brand on={() => a.label(k, 'BASE')} disabled={locked}>
                Label it on the base
              </B>
              <B on={() => a.label(k, 'LID')} disabled={locked}>
                Label the lid
              </B>
              <B on={() => a.expose(k, AIR_MIN)} disabled={locked}>
                Lid off for {AIR_MIN} min
              </B>
              <B on={() => a.touch(k, 'SLIGHT')} disabled={locked}>
                Lift the lid slightly; touch the agar
              </B>
              <B on={() => a.touch(k, 'WIDE')} disabled={locked}>
                Lid right off; touch the agar
              </B>
              <B on={a.soap} disabled={w.soaped}>
                Wash hands with soap
              </B>
              <B on={() => a.tapeAll('STRIPS')} disabled={locked}>
                Tape all lids: two short strips
              </B>
              <B on={() => a.tapeAll('SEALED')} disabled={locked}>
                Seal all round with tape
              </B>
              <B on={a.invert} disabled={locked || w.inverted}>
                Invert the plates
              </B>
              {([25, 30, 37] as const).map((t) => (
                <B key={t} on={() => a.incubate(t)} disabled={locked}>
                  Incubate at {t} °C
                </B>
              ))}
            </Row>
          </Box>
          <Box title="Bread">
            <Row>
              <B on={a.exposeBread} disabled={w.breadAt !== null || w.breadExposed}>
                Expose the bread to air 30 min
              </B>
              {SLICES.map((n, j) => (
                <span key={n} className="flex flex-wrap gap-1">
                  <B on={() => a.slice(j, true, 'WARM')} disabled={w.breadAt !== null}>
                    {n}: moist, warm
                  </B>
                  <B on={() => a.slice(j, false, 'WARM')} disabled={w.breadAt !== null}>
                    {n}: dry, warm
                  </B>
                  <B on={() => a.slice(j, true, 'COLD')} disabled={w.breadAt !== null}>
                    {n}: moist, fridge
                  </B>
                </span>
              ))}
              <B brand on={() => a.bag(true)} disabled={w.breadAt !== null}>
                Into polythene bags
              </B>
              <B on={() => a.bag(false)} disabled={w.breadAt !== null}>
                Leave them uncovered
              </B>
            </Row>
          </Box>
          <Box title="Days">
            <Row>
              <B on={a.wait} disabled={w.incAt === null && w.breadAt === null}>
                Leave 1 day
              </B>
              <B brand on={a.count} disabled={w.incAt === null || w.day <= w.incAt}>
                Count the colonies (lids on)
              </B>
              <B on={a.openAfter} disabled={w.incAt === null || w.day <= (w.incAt ?? 0)}>
                Open a plate to smell it
              </B>
              <B on={a.lens} disabled={w.breadAt === null || w.day <= w.breadAt}>
                Bread under the hand lens
              </B>
              <B on={a.slide}>Teacher’s slide under the microscope</B>
              <B on={() => a.dispose('DISINFECT')} disabled={w.countAt === null || !!w.dispose}>
                Plates into disinfectant
              </B>
              <B on={() => a.dispose('BIN')} disabled={w.countAt === null || !!w.dispose}>
                Plates in the bin
              </B>
            </Row>
          </Box>
        </>
      )}
      {w.lensAt !== null && (
        <div className="grid grid-cols-3 gap-1.5">
          {SLICES.map((n, j) => (
            <BreadSvg key={n} v={p.v} w={w} k={j} d={w.lensAt!} label={`Slice ${n}`} />
          ))}
        </div>
      )}
      {w.slide && <MouldSlide label="Rhizopus under the microscope" />}
    </div>
  );
}
