import { GEO_TASKS, GEO_TASK_TITLE } from '@aischool/shared';
import { ChevronDown, Lightbulb, Map as MapIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SimulatorProps } from '../types';
import { nextHint, nextStep, useGeo } from './actions';
import { GeoDesk } from './bench';
import { GeoNotebook } from './notebook';
import { TaskText } from './task-text';

/**
 * The 2D map bench, the lab's primary view: paper on a desk. The question
 * paper above, the map (or graph paper) with its instruments, and the
 * notebook. In a timed sitting there are no hints; everything else is the same.
 */
export default function GeoMapsLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'geo-maps'>) {
  const g = useGeo({ seed, state, onChange, readOnly, startedAt, practicalId });
  const { v, task } = g;
  const [brief, setBrief] = useState(true);
  const step = mode === 'LAB' ? nextStep(v, state) : null;
  if (import.meta.env.DEV) Object.assign(window, { __geoState: state, __geoV: v });
  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setBrief((b) => !b)} aria-expanded={brief}>
          <span className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
            <MapIcon className="size-4 text-muted-foreground" aria-hidden /> {GEO_TASK_TITLE[task]}
          </span>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', brief && 'rotate-180')} aria-hidden />
        </button>
        {brief && (
          <div className="mt-3">
            <TaskText v={v} />
            {!readOnly && !practicalId && state.log.length < 3 && (
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Exercise">
                {GEO_TASKS.map((t) => (
                  <Button key={t} size="sm" variant={task === t ? 'brand' : 'outline'} onClick={() => g.chooseTask(t)} aria-pressed={task === t}>
                    {GEO_TASK_TITLE[t]}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:items-start [&>*]:min-w-0">
        <Card className="space-y-3 p-3 sm:p-4">
          {!readOnly && mode === 'LAB' && (
            <p className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[12.5px] text-info" data-hint>
              <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {nextHint(v, state)}
            </p>
          )}
          <GeoDesk g={g} s={state} readOnly={readOnly} panel={step?.panel} tool={step?.tool} />
        </Card>
        <Card className="p-4 sm:p-5">
          <GeoNotebook v={v} s={state} g={g} readOnly={readOnly} />
        </Card>
      </div>
    </div>
  );
}
