import { COMP_TASKS, COMP_TASK_TITLE } from '@aischool/shared';
import { ChevronDown, Laptop, Lightbulb } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SimulatorProps } from '../types';
import { useComp } from './actions';
import { CompRecord } from './notebook';
import { compNextHint } from './steps';
import { TaskText } from './task-text';
import { Workstation } from './workstation';

/** The 2D lab: the task card, the computer (or workshop bench), and the notebook. The primary way to do this practical. */
export default function CompCodeLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'comp-code'>) {
  const c = useComp({ seed, state, onChange, readOnly, startedAt, practicalId });
  const { v, task } = c;
  const [brief, setBrief] = useState(true);
  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setBrief((b) => !b)} aria-expanded={brief}>
          <span className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
            <Laptop className="size-4 text-muted-foreground" aria-hidden /> {COMP_TASK_TITLE[task]}
          </span>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', brief && 'rotate-180')} aria-hidden />
        </button>
        {brief && (
          <div className="mt-3">
            <TaskText v={v} />
            {!readOnly && !practicalId && (
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Practical">
                {COMP_TASKS.map((t) => (
                  <Button key={t} size="sm" variant={task === t ? 'brand' : 'outline'} onClick={() => c.chooseTask(t)} aria-pressed={task === t}>
                    {COMP_TASK_TITLE[t]}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
      <Card className="space-y-3 p-3 sm:p-4">
        {!readOnly && mode === 'LAB' && (
          <p className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[12.5px] text-info">
            <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {compNextHint(v, state)}
          </p>
        )}
        <Workstation c={c} state={state} readOnly={readOnly} />
      </Card>
      <CompRecord v={v} state={state} readOnly={readOnly} w={c} />
    </div>
  );
}
