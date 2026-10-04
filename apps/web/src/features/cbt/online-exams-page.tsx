import type { CbtExamSummary, CbtPhase } from '@aischool/shared';
import { CalendarClock, CheckCircle2, Clock, KeyRound, MonitorCheck, Plus, Users } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { useCan } from '@/lib/auth-store';
import { CardGridSkeleton, useSearchFlag } from '../planning/ui';
import { useOnlineExams } from './api';
import { ScheduleExamDialog } from './schedule-dialog';
import { PhaseBadge, windowLabel } from './ui';

const SECTIONS: { phases: CbtPhase[]; title: string }[] = [
  { phases: ['OPEN'], title: 'Open now' },
  { phases: ['UPCOMING'], title: 'Coming up' },
  { phases: ['DRAFT'], title: 'Drafts' },
  { phases: ['ENDED'], title: 'Closed' },
];

export default function OnlineExamsPage() {
  const canManage = useCan('assessment.manage');
  const list = useOnlineExams();
  const [scheduleOpen, setScheduleOpen] = useSearchFlag('new');

  const groups = useMemo(() => {
    const rows = list.data ?? [];
    return SECTIONS.map((s) => ({
      ...s,
      rows: rows
        .filter((e) => s.phases.includes(e.phase))
        // Soonest first while live/upcoming, newest first once closed.
        .sort((a, b) => (s.phases[0] === 'ENDED' ? b.closesAt.localeCompare(a.closesAt) : a.opensAt.localeCompare(b.opensAt))),
    })).filter((g) => g.rows.length);
  }, [list.data]);

  const scheduleButton = canManage && (
    <Button onClick={() => setScheduleOpen(true)}>
      <Plus /> Schedule an exam
    </Button>
  );

  return (
    <Page>
      <PageHeader
        title="Online Exams"
        description="Run computer-based tests in the lab or on phones. Objective questions are marked instantly, written answers by you with optional AI help, and scores can go straight to the score sheet."
        actions={scheduleButton}
      />
      {list.isLoading ? (
        <CardGridSkeleton />
      ) : list.error && !list.data ? (
        <Card>
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        </Card>
      ) : !groups.length ? (
        <Card>
          <EmptyState
            icon={MonitorCheck}
            title="No online exams yet"
            description="Schedule a finalised exam paper for your classes. Students sit it in the browser with a timer, and it keeps working when the connection drops."
            action={scheduleButton || undefined}
          />
        </Card>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.title} aria-labelledby={`cbt-${g.title}`}>
              <h2 id={`cbt-${g.title}`} className="mb-3 font-display text-[15px] font-semibold tracking-tight">
                {g.title} <span className="ml-1 text-[13px] font-normal text-muted-foreground tabular">{g.rows.length}</span>
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {g.rows.map((e) => (
                  <li key={e.id}>
                    <ExamCard e={e} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {canManage && <ScheduleExamDialog open={scheduleOpen} onOpenChange={setScheduleOpen} />}
    </Page>
  );
}

function ExamCard({ e }: { e: CbtExamSummary }) {
  const { counts } = e;
  const toMark = counts.submitted - counts.marked;
  return (
    <Link
      to={`/online-exams/${e.id}`}
      className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="flex h-full flex-col p-5 transition-[border-color,box-shadow,transform] group-hover:-translate-y-0.5 group-hover:border-border-strong group-hover:shadow-pop">
        <div className="flex flex-wrap items-center gap-1.5">
          <PhaseBadge phase={e.phase} />
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
        <p className="mt-1 truncate text-[13px] text-muted-foreground">
          {e.subject.name} · {e.classArms.map((a) => a.name).join(', ') || e.classLevel.name}
        </p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <CalendarClock className="size-3.5 shrink-0" /> {windowLabel(e.opensAt, e.closesAt)}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-4 text-[12.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 tabular">
            <Clock className="size-3.5" /> {e.durationMinutes} min
          </span>
          <span className="inline-flex items-center gap-1.5 tabular">
            <Users className="size-3.5" /> {counts.submitted}/{counts.students} submitted
          </span>
          {counts.inProgress > 0 && <span className="tabular font-medium text-info">{counts.inProgress} writing</span>}
          {e.paper.hasWritten && toMark > 0 && <span className="tabular font-medium text-warning">{toMark} to mark</span>}
        </div>
      </Card>
    </Link>
  );
}
