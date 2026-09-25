import type { SolverReport } from '@aischool/shared';
import { AlertTriangle, CalendarRange, CheckCircle2, ChevronDown, Layers2, Moon, Repeat2, Timer, UserCog, X } from 'lucide-react';
import type * as React from 'react';
import { useEffect, useState } from 'react';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Markdown } from '@/components/ai/markdown';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tip } from '@/components/ui/tooltip';
import { useCan } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { useExplainTimetable } from './api';
import { plural, ProgressRing } from './ui';

function QualityChip({
  icon: Icon,
  label,
  value,
  good,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  good: boolean;
  hint: string;
}) {
  return (
    <Tip label={hint}>
      <span
        tabIndex={0}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          good ? 'border-success/25 bg-success-soft/60 text-success' : 'border-warning/30 bg-warning-soft/70 text-warning',
        )}
      >
        <Icon aria-hidden className="size-3.5" />
        <span className="text-foreground/80">{label}</span>
        <span className="font-semibold tabular">{value}</span>
      </span>
    </Tip>
  );
}

export function SolverReportCard({ report, timetableId }: { report: SolverReport; timetableId: string }) {
  const canAi = useCan('ai.use');
  const explain = useExplainTimetable();
  const [briefing, setBriefing] = useState<{ text: string; provider: string; model: string } | null>(null);
  const [showAll, setShowAll] = useState(false);

  // A different timetable (or a rebuild) invalidates the briefing.
  useEffect(() => {
    setBriefing(null);
    setShowAll(false);
  }, [timetableId, report.durationMs, report.placed]);

  const q = report.quality;
  const complete = report.placed >= report.required;
  const unplaced = showAll ? report.unplaced : report.unplaced.slice(0, 4);
  const missing = report.unplaced.reduce((n, u) => n + u.missing, 0);

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            <ProgressRing value={report.placed} max={report.required} />
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Solver report</p>
              <p className="mt-0.5 font-display text-lg font-semibold tabular">
                {report.placed.toLocaleString()} <span className="text-muted-foreground">/ {report.required.toLocaleString()}</span> lessons placed
              </p>
              <p className={cn('flex items-center gap-1.5 text-[12.5px]', complete ? 'text-success' : 'text-warning')}>
                {complete ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
                {complete ? 'Every lesson has a slot' : `${plural(missing, 'lesson')} still need a slot`}
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  · <Timer className="size-3" /> {(report.durationMs / 1000).toFixed(1)}s
                </span>
              </p>
            </div>
          </div>
          <div className="flex flex-1 flex-wrap gap-2 lg:justify-center">
            <QualityChip
              icon={Repeat2}
              label="Same-day repeats"
              value={q.sameDayRepeats}
              good={q.sameDayRepeats === 0}
              hint="Extra lessons of the same subject on one day for a class — lower is better"
            />
            <QualityChip
              icon={Moon}
              label="Late core lessons"
              value={q.lateCoreLessons}
              good={q.lateCoreLessons === 0}
              hint="Core-subject lessons in the last two periods of the day"
            />
            <QualityChip
              icon={UserCog}
              label="Heavy teacher days"
              value={q.teacherOverloadDays}
              good={q.teacherOverloadDays === 0}
              hint="Teacher-days with more than six lessons"
            />
            <QualityChip
              icon={Layers2}
              label="Doubles"
              value={`${q.doublesPlaced}/${q.doublesRequested}`}
              good={q.doublesPlaced >= q.doublesRequested}
              hint="Double lessons placed out of those requested"
            />
          </div>
          {canAi && (
            <Button
              variant="ai"
              className="shrink-0"
              loading={explain.isPending}
              onClick={() => explain.mutate(timetableId, { onSuccess: (r) => setBriefing(r) })}
            >
              {!explain.isPending && <AiSparkle className="size-4 [&_path]:fill-white" animated={false} />}
              {briefing ? 'Explain again' : 'Explain with AI'}
            </Button>
          )}
        </div>

        {(report.unplaced.length > 0 || report.warnings.length > 0) && (
          <div className="grid gap-4 border-t border-border bg-muted/30 p-5 md:grid-cols-2">
            {report.unplaced.length > 0 && (
              <div className="min-w-0">
                <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <CalendarRange className="size-3.5" /> Couldn’t place
                </p>
                <ul className="space-y-1.5">
                  {unplaced.map((u, i) => (
                    <li key={i} className="rounded-lg border border-border bg-card px-3 py-2 text-[12.5px]">
                      <p className="flex flex-wrap items-center gap-x-2">
                        <span className="font-medium">
                          {u.subject} · {u.classArm}
                        </span>
                        <span className="rounded-full bg-danger-soft px-1.5 text-[11px] font-medium text-danger tabular">−{u.missing}</span>
                        {u.teacher && <span className="text-muted-foreground">{u.teacher}</span>}
                      </p>
                      <p className="mt-0.5 text-muted-foreground">{u.reason}</p>
                    </li>
                  ))}
                </ul>
                {report.unplaced.length > 4 && (
                  <Button variant="ghost" size="sm" className="mt-1.5" onClick={() => setShowAll((s) => !s)}>
                    <ChevronDown className={cn('transition-transform', showAll && 'rotate-180')} />
                    {showAll ? 'Show fewer' : `Show all ${report.unplaced.length}`}
                  </Button>
                )}
              </div>
            )}
            {report.warnings.length > 0 && (
              <div className="min-w-0">
                <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <AlertTriangle className="size-3.5" /> Warnings
                </p>
                <ul className="space-y-1.5 text-[12.5px]">
                  {report.warnings.map((w, i) => (
                    <li key={i} className="flex gap-2">
                      <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-warning" />
                      <span className="min-w-0">{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>

      {explain.isPending && !briefing && (
        <Card className="ai-border ai-glow relative overflow-hidden p-5" role="status" aria-live="polite">
          <div className="flex items-center gap-2 text-[13px] font-medium">
            <AiSparkle className="size-4" /> Reading the solver report…
          </div>
          <div className="mt-4 space-y-2" aria-hidden>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </Card>
      )}

      {briefing && (
        <Card className="ai-border ai-glow relative overflow-hidden border-transparent">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-ai-2/15 blur-3xl" />
          <div className="relative flex items-start gap-3 p-5 pb-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ai-gradient shadow-[0_6px_20px_-6px_var(--ai-2)]">
              <AiSparkle className="size-[18px] [&_path]:fill-white" animated={false} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display font-semibold tracking-tight">
                <span className="text-ai-gradient">AI briefing</span> on this timetable
              </p>
              <p className="text-[12px] text-muted-foreground">
                Generated from the solver report · {briefing.provider} · {briefing.model}
              </p>
            </div>
            <Button size="icon-sm" variant="ghost" aria-label="Dismiss briefing" onClick={() => setBriefing(null)}>
              <X />
            </Button>
          </div>
          <div className="relative px-5 pb-5">
            <Markdown text={briefing.text} className="text-[13.5px]" />
          </div>
        </Card>
      )}
    </div>
  );
}
