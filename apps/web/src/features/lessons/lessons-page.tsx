import { LESSON_STATUSES, type LessonSummary } from '@aischool/shared';
import { CalendarDays, Clock, Presentation, Sparkles, User } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCan } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';
import { cn, titleCase } from '@/lib/utils';
import { useStructure } from '../academics/api';
import { ArmSelect, SubjectSelect } from '../planning/pickers';
import { CardGridSkeleton, ContentStatusBadge, GenerationIndicator, useSearchFlag } from '../planning/ui';
import { useLessons } from './api';
import { PlanLessonDialog } from './lesson-dialogs';

type Scope = 'mine' | 'all';

export default function LessonsPage() {
  const canManage = useCan('lessons.manage');
  const canAi = useCan('ai.use');
  const canSeeAll = useCan('curriculum.manage');
  const structure = useStructure();
  const [scope, setScope] = useState<Scope>('mine');
  const [classArmId, setClassArmId] = useState<string | undefined>();
  const [subjectId, setSubjectId] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [planOpen, setPlanOpen] = useSearchFlag('new');

  const mine = !canSeeAll || scope === 'mine';
  const list = useLessons({ classArmId, subjectId, status, mine });
  const rows = list.data;
  const filtered = !!(classArmId || subjectId || status);
  const canPlan = canManage && canAi;

  const planButton = canPlan && (
    <Button variant="ai" onClick={() => setPlanOpen(true)}>
      <Sparkles /> Plan a lesson with AI
    </Button>
  );

  return (
    <Page>
      <PageHeader
        title="Lesson Plans"
        description="Differentiated, timed lesson plans — linked to your scheme of work and ready to print."
        actions={planButton}
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        {canSeeAll && (
          <div role="tablist" aria-label="Whose lessons" className="inline-flex h-10 w-fit items-center gap-1 rounded-xl border border-border bg-muted/60 p-1">
            {(
              [
                ['mine', 'My lessons'],
                ['all', 'All lessons'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={scope === value}
                onClick={() => setScope(value)}
                className={cn(
                  'h-full rounded-lg px-3 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  scope === value ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:ml-auto lg:flex">
          <ArmSelect
            structure={structure.data}
            value={classArmId}
            onChange={setClassArmId}
            allLabel="All classes"
            className="lg:w-44"
            aria-label="Filter by class"
          />
          <SubjectSelect
            structure={structure.data}
            value={subjectId}
            onChange={setSubjectId}
            allLabel="All subjects"
            className="lg:w-48"
            aria-label="Filter by subject"
          />
          <Select value={status ?? NONE} onValueChange={(v) => setStatus(v === NONE ? undefined : v)}>
            <SelectTrigger className="lg:w-36" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All statuses</SelectItem>
              {LESSON_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {titleCase(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {list.isLoading ? (
        <CardGridSkeleton />
      ) : list.error && !rows ? (
        <Card>
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        </Card>
      ) : !rows || rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Presentation}
            tone={filtered ? 'default' : 'ai'}
            title={filtered ? 'No lesson plans match' : mine ? 'You haven’t planned any lessons yet' : 'No lesson plans yet'}
            description={
              filtered
                ? 'Try another class, subject or status.'
                : 'Pick a week from your scheme of work or type a topic — AI writes a complete, differentiated plan in about a minute.'
            }
            action={!filtered ? (planButton || undefined) : undefined}
          />
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((l) => (
            <li key={l.id}>
              <LessonCard lesson={l} showTeacher={!mine} />
            </li>
          ))}
        </ul>
      )}

      {canPlan && <PlanLessonDialog open={planOpen} onOpenChange={setPlanOpen} defaults={{ subjectId, classArmId }} />}
    </Page>
  );
}

function LessonCard({ lesson: l, showTeacher }: { lesson: LessonSummary; showTeacher: boolean }) {
  return (
    <Link
      to={`/lessons/${l.id}`}
      className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="flex h-full flex-col p-5 transition-[border-color,box-shadow,transform] group-hover:-translate-y-0.5 group-hover:border-border-strong group-hover:shadow-pop">
        <div className="flex flex-wrap items-center gap-1.5">
          <ContentStatusBadge status={l.status} />
          <GenerationIndicator state={l.generation} />
          {l.schemeWeek && <span className="ml-auto text-[11.5px] text-muted-foreground">Scheme · Week {l.schemeWeek.week}</span>}
        </div>
        <h3 className="mt-3 line-clamp-2 font-display text-[15.5px] font-semibold leading-snug tracking-tight">{l.topic}</h3>
        <p className="mt-1 truncate text-[13px] text-muted-foreground">
          {l.subject.name} · {l.classArm.levelName} {l.classArm.name}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-4 text-[12.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3.5" /> {l.date ? formatDate(l.date, { weekday: 'short' }) : 'No date'}
          </span>
          <span className="inline-flex items-center gap-1.5 tabular">
            <Clock className="size-3.5" /> {l.durationMinutes} min
          </span>
          {showTeacher && l.teacher && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <User className="size-3.5 shrink-0" /> <span className="truncate">{l.teacher.name}</span>
            </span>
          )}
        </div>
      </Card>
    </Link>
  );
}
