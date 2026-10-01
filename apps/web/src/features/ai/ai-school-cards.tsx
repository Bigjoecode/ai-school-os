import { ArrowRight, ArrowUpRight, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { LEVEL_BADGE, useAtRisk, useCanOpenAgent, useCanSeeAtRisk } from './api';

/** Overview cards for the AI school: early warnings and the principal's briefing. Each hides when it has nothing to say. */
export function AiSchoolCards() {
  const canAtRisk = useCanSeeAtRisk();
  const canBrief = useCanOpenAgent('principal');
  const atRisk = useAtRisk(undefined, canAtRisk);
  const showAtRisk = canAtRisk && (atRisk.isLoading || (atRisk.data?.students.length ?? 0) > 0);
  if (!showAtRisk && !canBrief) return null;
  return (
    <div className={cn('grid gap-5 [&>*]:min-w-0', showAtRisk && canBrief && 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]')}>
      {showAtRisk && <AtRiskCard />}
      {canBrief && <BriefingLinkCard />}
    </div>
  );
}

function AtRiskCard() {
  const { data, isLoading } = useAtRisk();
  const top = data?.students.slice(0, 5) ?? [];
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-danger" aria-hidden /> Students who need attention
          </CardTitle>
          <CardDescription>
            {data ? (
              <>
                <span className="font-medium text-danger">{data.counts.high} high</span> · <span className="font-medium text-warning">{data.counts.medium} medium</span> of{' '}
                {data.counts.assessed} assessed
              </>
            ) : (
              'Early warnings from attendance, results and fees'
            )}
          </CardDescription>
        </div>
        <Link
          to="/ai/insights"
          className="inline-flex shrink-0 items-center gap-1 rounded-md text-[12.5px] font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          See all <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent className="flex-1">
        {isLoading ? (
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {top.map((s) => {
              const badge = LEVEL_BADGE[s.level];
              return (
                <li key={s.student.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <Badge variant={badge.variant} dot className="w-[70px] justify-center">
                    {badge.label}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">
                      {s.student.name}
                      {s.student.classArm && <span className="font-normal text-muted-foreground"> · {s.student.classArm}</span>}
                    </p>
                    {s.reasons[0] && <p className="truncate text-[12px] text-muted-foreground">{s.reasons[0]}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function BriefingLinkCard() {
  return (
    <Link
      to="/ai/insights#briefing"
      className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="ai-border relative flex h-full flex-col justify-between gap-4 overflow-hidden border-transparent p-5 transition-all group-hover:-translate-y-0.5 group-hover:shadow-lift sm:p-6">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-ai-2/15 blur-3xl" />
        <div className="relative">
          <span className="grid size-10 place-items-center rounded-xl bg-ai-gradient">
            <AiSparkle className="size-5 [&_path]:fill-white" animated={false} />
          </span>
          <p className="mt-4 font-display text-[15px] font-semibold tracking-tight">Weekly briefing</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            Principal AI writes a one-page read on learning, attendance, fees, staff and operations — with what to do this week.
          </p>
        </div>
        <span className="relative inline-flex items-center gap-1 text-[13px] font-medium text-ai-2">
          Write this week’s briefing <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
        </span>
      </Card>
    </Link>
  );
}
