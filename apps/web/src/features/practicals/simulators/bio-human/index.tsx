import { HUMAN_TASKS, HUMAN_TASK_TITLE } from '@aischool/shared';
import { ChevronDown, HeartPulse, Lightbulb } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SimulatorProps } from '../types';
import { nextHint, useHuman } from './actions';
import { BreathBench, PulseBench, ReactBench, SkinBench } from './benches';
import { BreathNotebook, PulseNotebook, ReactNotebook, SkinNotebook, Written } from './notebook';
import { TaskText } from './task-text';

export default function BioHumanLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'bio-human'>) {
  const h = useHuman({ seed, state, onChange, readOnly, startedAt, practicalId });
  const { v, task } = h;
  const [brief, setBrief] = useState(true);
  const started = state.log.some((e) => !e.a.startsWith('task:') && !e.a.startsWith('safety'));
  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setBrief((b) => !b)} aria-expanded={brief}>
          <span className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
            <HeartPulse className="size-4 text-muted-foreground" aria-hidden /> {HUMAN_TASK_TITLE[task]}
          </span>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', brief && 'rotate-180')} aria-hidden />
        </button>
        {brief && (
          <div className="mt-3">
            <TaskText v={v} />
            {!readOnly && !practicalId && !started && (
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Experiment">
                {HUMAN_TASKS.map((t) => (
                  <Button key={t} size="sm" variant={task === t ? 'brand' : 'outline'} onClick={() => h.chooseTask(t)} aria-pressed={task === t}>
                    {HUMAN_TASK_TITLE[t]}
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
          {task === 'PULSE' ? <PulseBench h={h} state={state} readOnly={readOnly} /> : task === 'BREATH' ? <BreathBench h={h} state={state} readOnly={readOnly} /> : task === 'REACTION' ? <ReactBench h={h} state={state} readOnly={readOnly} /> : <SkinBench h={h} state={state} readOnly={readOnly} />}
        </Card>
        <div className="space-y-4">
          {task === 'PULSE' ? <PulseNotebook state={state} readOnly={readOnly} update={h.update} /> : task === 'BREATH' ? <BreathNotebook state={state} readOnly={readOnly} update={h.update} /> : task === 'REACTION' ? <ReactNotebook state={state} readOnly={readOnly} update={h.update} /> : <SkinNotebook state={state} readOnly={readOnly} update={h.update} />}
          <Written state={state} readOnly={readOnly} update={h.update} />
        </div>
      </div>
    </div>
  );
}

