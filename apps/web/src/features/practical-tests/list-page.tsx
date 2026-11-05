import { PRACTICAL_ASSESSMENT_KIND_LABELS, type CbtPhase, type PracticalAssessmentSummary } from '@aischool/shared';
import { CalendarClock, CheckCircle2, Clock, FlaskConical, KeyRound, MonitorCheck, Plus, Users } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { useCan } from '@/lib/auth-store';
import { PhaseBadge, windowLabel } from '../cbt/ui';
import { CardGridSkeleton, useSearchFlag } from '../planning/ui';
import { usePracticalTests } from './api';
import { SchedulePracticalTestDialog } from './schedule-dialog';

const SECTIONS: { phases: CbtPhase[]; title: string }[] = [
  { phases: ['OPEN'], title: 'Open now' },
  { phases: ['UPCOMING'], title: 'Coming up' },
  { phases: ['DRAFT'], title: 'Drafts' },
  { phases: ['ENDED'], title: 'Closed' },
];

/** Staff: practical tests (virtual labs set as timed class tests or exams). */
export default function PracticalTestsPage() {
  const canManage = useCan('assessment.manage');
  const list = usePracticalTests();
  const [open, setOpen] = useSearchFlag('new');
  const groups = useMemo(
    () =>
      SECTIONS.map((s) => ({
        ...s,
        rows: (list.data ?? []).filter((e) => s.phases.includes(e.phase)).sort((a, b) => (s.phases[0] === 'ENDED' ? b.closesAt.localeCompare(a.closesAt) : a.opensAt.localeCompare(b.opensAt))),
      })).filter((g) => g.rows.length),
    [list.data],
  );
  const scheduleButton = canManage && (
    <Button onClick={() => setOpen(true)}>
      <Plus /> Schedule a practical test
    </Button>
  );

  return (
    <Page>
      <PageHeader
        title="Practical tests"
        description="Set a Practical Academy virtual lab as a timed class test or practical exam. Each student sits it once on their own variant; readings and calculations are marked exactly, written answers by AI, and you can review any mark and send scores to the score sheet."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/online-exams">
                <MonitorCheck /> Online exams
              </Link>
            </Button>
            {scheduleButton}
          </div>
        }
      />
      {list.isLoading ? (
        <CardGridSkeleton />
      ) : list.error && !list.data ? (
        <Card>
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        </Card>
      ) : !groups.length ? (
        <Card>
          <EmptyState icon={FlaskConical} title="No practical tests yet" description="Pick a practical with a virtual lab, the classes and a time window. Students find it under Exams." action={scheduleButton || undefined} />
        </Card>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.title} aria-labelledby={`pt-${g.title}`}>
              <h2 id={`pt-${g.title}`} className="mb-3 font-display text-[15px] font-semibold tracking-tight">
                {g.title} <span className="ml-1 text-[13px] font-normal text-muted-foreground tabular">{g.rows.length}</span>
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {g.rows.map((e) => (
                  <li key={e.id}>
                    <TestCard e={e} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {canManage && <SchedulePracticalTestDialog open={open} onOpenChange={setOpen} />}
    </Page>
  );
}

function TestCard({ e }: { e: PracticalAssessmentSummary }) {
  return (
    <Link to={`/practical-tests/${e.id}`} className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
      <Card className="flex h-full flex-col p-5 transition-[border-color,box-shadow,transform] group-hover:-translate-y-0.5 group-hover:border-border-strong group-hover:shadow-pop">
        <div className="flex flex-wrap items-center gap-1.5">
          <PhaseBadge phase={e.phase} />
          <Badge variant={e.kind === 'EXAM' ? 'warning' : 'secondary'}>{e.kind === 'EXAM' ? 'Exam mode' : 'Guided test'}</Badge>
          {e.component && <Badge variant="brand">{e.component.name}</Badge>}
          {e.accessCode && (
            <Badge variant="outline">
              <KeyRound /> Code
            </Badge>
          )}
          {e.resultsReleasedAt && (
            <Badge variant="success">
              <CheckCircle2 /> Released
            </Badge>
          )}
        </div>
        <h3 className="mt-3 line-clamp-2 font-display text-[15.5px] font-semibold leading-snug tracking-tight">{e.title}</h3>
        <p className="mt-1 truncate text-[13px] text-muted-foreground" title={PRACTICAL_ASSESSMENT_KIND_LABELS[e.kind]}>
          {e.subject.name} · {e.classArms.map((a) => a.name).join(', ')}
        </p>
        <p className="mt-1 line-clamp-1 text-[12.5px] text-muted-foreground">{e.practical.title}</p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <CalendarClock className="size-3.5 shrink-0" /> {windowLabel(e.opensAt, e.closesAt)}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-4 text-[12.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 tabular">
            <Clock className="size-3.5" /> {e.durationMinutes} min
          </span>
          <span className="inline-flex items-center gap-1.5 tabular">
            <Users className="size-3.5" /> {e.counts.submitted}/{e.counts.students} handed in
          </span>
          {e.counts.inProgress > 0 && <span className="tabular font-medium text-info">{e.counts.inProgress} in the lab</span>}
        </div>
      </Card>
    </Link>
  );
}
