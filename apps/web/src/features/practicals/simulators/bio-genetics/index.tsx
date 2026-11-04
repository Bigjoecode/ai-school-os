import { GEN_TASKS, GEN_TASK_TITLE } from '@aischool/shared';
import { ChevronDown, Dna, Lightbulb } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SimulatorProps } from '../types';
import { nextHint, useGenetics } from './actions';
import { CrossBench, DiscBench, FoodBench, HeightBench } from './benches';
import { GenNotebook, Written } from './notebook';
import { TaskText } from './task-text';

export default function BioGeneticsLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'bio-genetics'>) {
  const g = useGenetics({ seed, state, onChange, readOnly, startedAt, practicalId });
  const { v, task } = g;
  const [brief, setBrief] = useState(true);
  const started = state.log.some((e) => !e.a.startsWith('task:') && !e.a.startsWith('safety'));
  const shown = state.task ? state : { ...state, task };
  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setBrief((b) => !b)} aria-expanded={brief}>
          <span className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
            <Dna className="size-4 text-muted-foreground" aria-hidden /> {GEN_TASK_TITLE[task]}
          </span>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', brief && 'rotate-180')} aria-hidden />
        </button>
        {brief && (
          <div className="mt-3">
            <TaskText v={v} />
            {!readOnly && !practicalId && !started && (
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Experiment">
                {GEN_TASKS.map((t) => (
                  <Button key={t} size="sm" variant={task === t ? 'brand' : 'outline'} onClick={() => g.chooseTask(t)} aria-pressed={task === t}>
                    {GEN_TASK_TITLE[t]}
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
              <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {nextHint(v, shown)}
            </p>
          )}
          {task === 'DISCRETE' ? <DiscBench g={g} state={state} readOnly={readOnly} /> : task === 'CROSS' ? <CrossBench g={g} state={state} readOnly={readOnly} /> : task === 'FOOD' ? <FoodBench g={g} state={state} readOnly={readOnly} /> : <HeightBench g={g} state={state} readOnly={readOnly} />}
        </Card>
        <div className="space-y-4">
          <GenNotebook state={shown} v={v} readOnly={readOnly} update={g.update} />
          <Written state={shown} readOnly={readOnly} update={g.update} />
        </div>
      </div>
    </div>
  );
}
