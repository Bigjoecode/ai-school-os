import { CO_APP_LABEL, CO_TASKS, coTaskTitle } from '@aischool/shared';
import { ChevronDown, Lightbulb, Monitor } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useLabSitting } from '../../sitting';
import type { SimulatorProps } from '../types';
import { nextHint, useChecks, useOffice } from './actions';
import { Desktop } from './desktop';
import { Notebook, TaskText } from './notebook';

/** The computer-room lab in 2D: the task card, the screen with its working apps, and the notebook. */
export default function CompOfficeLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'comp-office'>) {
  const o = useOffice({ seed, state, onChange, readOnly, startedAt, practicalId });
  const [brief, setBrief] = useState(true);
  const checks = useChecks(o.v, state);
  // A practical test can run in LAB mode: no hints while it is being sat.
  const sitting = !!useLabSitting();
  const fresh = !practicalId && state.log.filter((l) => !l.a.startsWith('task:')).length === 0;
  return (
    <div className="space-y-3">
      <Card className="p-3 sm:p-4">
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setBrief((b) => !b)} aria-expanded={brief}>
          <span className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
            <Monitor className="size-4 text-muted-foreground" aria-hidden /> Task card
          </span>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', brief && 'rotate-180')} aria-hidden />
        </button>
        {brief && (
          <div className="mt-2">
            <TaskText o={o} />
            <p className="mt-2 text-[12px] text-muted-foreground">Uses: {o.v.apps.map((a) => CO_APP_LABEL[a]).join(' and ')}.</p>
            {!readOnly && fresh && (
              <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Practical">
                {CO_TASKS.map((t) => (
                  <Button key={t} size="sm" variant={o.task === t ? 'brand' : 'outline'} onClick={() => o.chooseTask(t)} aria-pressed={o.task === t}>
                    {coTaskTitle(t)}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
      {!readOnly && mode === 'LAB' && !sitting && (
        <p className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[12.5px] text-info">
          <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {nextHint(checks)}
        </p>
      )}
      <Desktop o={o} />
      <Card className="p-3 sm:p-4">
        <p className="mb-2 font-display text-[15px] font-semibold tracking-tight">Practical notebook</p>
        <Notebook o={o} />
      </Card>
    </div>
  );
}
