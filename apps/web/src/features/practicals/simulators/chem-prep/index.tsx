import { PREP_ACTIONS, PREP_TASKS, PREP_TASK_TITLE, prepTubeTask, prepTubeVisual, prepTubes, type PrepActionDef } from '@aischool/shared';
import { ChevronDown, FlaskConical, Lightbulb } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SimulatorProps } from '../types';
import { usePrep } from './actions';
import { PrepRecordAll } from './notebook';
import { prepReadout } from './readout';
import { nextHint } from './steps';
import { TaskText } from './task-text';

/** What each object group is called in the 2D lab. */
export const PREP_OBJ_LABEL: Record<string, string> = {
  bottle: 'Weighing bottle and Na₂CO₃',
  balance: 'Balance',
  beaker: 'Beaker, glass rod and funnel',
  flask: 'Volumetric flask 1 (the standard solution)',
  pipette: '25.0 cm³ pipette and filler',
  flask2: 'Volumetric flask 2 (the dilution)',
  stock: 'The Fe³⁺/SCN⁻ mixture',
  rack: 'Test tubes',
  tube: 'The tube in use',
  hot: 'Hot water',
  ice: 'Iced water',
  funnel: 'Filter funnel',
  dish: 'Evaporating dish',
  dflask: 'Distillation flask and burner',
  thermometer: 'Thermometer',
  condenser: 'Liebig condenser',
  receiver: 'Receiver and the distillate',
  mortar: 'Mixing the solids',
  gtube: 'Hard-glass tube, clamp and burner',
  dryer: 'Drying the gas',
  jar: 'Gas jar and tests',
  trough: 'Fountain flask and trough',
};
export const objGroupOf = (obj: string) => (obj.startsWith('reagent:') ? 'reagents' : obj.startsWith('halide:') ? 'halides' : obj);
const GROUP_LABEL: Record<string, string> = { reagents: 'Reagents (added to the tube in use)', halides: 'Halide solutions (each into a clean tube)' };

export default function ChemPrepLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'chem-prep'>) {
  const p = usePrep({ seed, state, onChange, readOnly, startedAt, practicalId });
  const { v, task } = p;
  const [brief, setBrief] = useState(true);
  const tubes = prepTubeTask(task) ? prepTubes(task, state.events) : [];
  const [active, setActive] = useState(tubes.length - 1);
  const cur = Math.min(active, tubes.length - 1);
  const groups = new Map<string, PrepActionDef[]>();
  for (const d of PREP_ACTIONS[task]) {
    const g = objGroupOf(d.obj);
    groups.set(g, [...(groups.get(g) ?? []), d]);
  }
  const run = (d: PrepActionDef) => {
    const before = tubes.length;
    if (p.act(d, cur) && d.a === 'TUBE') setActive(before);
  };
  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setBrief((b) => !b)} aria-expanded={brief}>
          <span className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
            <FlaskConical className="size-4 text-muted-foreground" aria-hidden /> {PREP_TASK_TITLE[task]}
          </span>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', brief && 'rotate-180')} aria-hidden />
        </button>
        {brief && (
          <div className="mt-3">
            <TaskText v={v} />
            {!readOnly && !practicalId && !state.events.length && (
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Experiment">
                {PREP_TASKS.map((t) => (
                  <Button key={t} size="sm" variant={task === t ? 'brand' : 'outline'} onClick={() => p.chooseTask(t)} aria-pressed={task === t}>
                    {PREP_TASK_TITLE[t]}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start [&>*]:min-w-0">
        <Card className="space-y-3 p-4 sm:p-5">
          {!readOnly && mode === 'LAB' && (
            <p className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[12.5px] text-info">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {nextHint(v, state)}
            </p>
          )}
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <p className="mb-1 text-[11.5px] font-medium text-muted-foreground">On the bench now</p>
            <ul className="space-y-0.5 text-[13px]" aria-live="polite">
              {prepReadout(v, state, cur).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
          {tubes.length > 0 && (
            <div>
              <p className="mb-1.5 text-[12px] font-medium text-muted-foreground">Tube in use</p>
              <div className="flex flex-wrap gap-1.5">
                {tubes.map((_, i) => {
                  const vis = prepTubeVisual(task, state.events, i);
                  return (
                    <button key={i} type="button" onClick={() => setActive(i)} aria-pressed={i === cur} className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px]', i === cur ? 'border-brand bg-brand/10' : 'border-border text-muted-foreground')}>
                      <span className="inline-flex h-4 w-2.5 flex-col overflow-hidden rounded-b-full border border-black/20" aria-hidden>
                        {vis.layer && <span className="h-1.5" style={{ background: vis.layer }} />}
                        <span className="flex-1" style={{ background: vis.liquid }} />
                      </span>
                      Tube {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {!readOnly &&
            [...groups.entries()].map(([g, defs]) => (
              <div key={g} className="rounded-xl border border-border p-3">
                <p className="mb-2 text-[12.5px] font-semibold">{GROUP_LABEL[g] ?? PREP_OBJ_LABEL[g] ?? g}</p>
                <div className="flex flex-wrap gap-1.5">
                  {defs.map((d) => {
                    const why = p.blocked(d, cur);
                    return (
                      <Button key={`${d.obj}-${d.a}-${d.x}-${d.n}`} size="sm" variant={d.tone === 'brand' ? 'brand' : 'outline'} disabled={!!why} title={why} onClick={() => run(d)} className={cn('h-auto min-h-8 whitespace-normal py-1 text-left', d.tone === 'danger' && 'text-danger')}>
                        {d.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))}
        </Card>
        <PrepRecordAll v={v} state={state} readOnly={readOnly} update={p.update} active={cur} setActive={setActive} />
      </div>
    </div>
  );
}
