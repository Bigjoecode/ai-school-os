import type { MyModuleRow } from '@aischool/shared';
import { BookOpenCheck, CheckCircle2, ChevronRight, Radio, WifiOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { joinLesson, useMyLessons } from './api';
import { isSaved } from './offline';

/** The student's lessons: modules set for their class, where they left off, and joining the teacher's live check-in. */
export default function MyLessonsPage() {
  const q = useMyLessons();
  const d = q.data;
  const [filter, setFilter] = useState<'ALL' | 'TODO' | 'DONE'>('TODO');
  const shown = useMemo(() => (d?.modules ?? []).filter((m) => (filter === 'ALL' ? true : filter === 'DONE' ? m.status === 'COMPLETED' : m.status !== 'COMPLETED')), [d, filter]);
  const resume = d?.modules.find((m) => m.status === 'IN_PROGRESS');

  return (
    <Page className="max-w-4xl">
      <PageHeader eyebrow="Learning" title="My lessons" description={d?.student.className ? `Lessons your teachers have set for ${d.student.className}. Work through each step and pass the check-ins to move on.` : 'Lessons your teachers have set for your class.'} />
      <JoinCard />
      {q.error && !d ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : !d.modules.length ? (
        <Card>
          <EmptyState icon={BookOpenCheck} title="No lessons yet" description="When your teachers publish a lesson module for your class, it will appear here." />
        </Card>
      ) : (
        <div className="space-y-4">
          {resume && (
            <Card className="flex flex-col gap-3 border-brand/30 bg-brand-soft/40 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-brand">Carry on where you left off</p>
                <p className="truncate font-display text-[16px] font-semibold">{resume.title}</p>
                <p className="text-[12.5px] text-muted-foreground">
                  {resume.subject.name} · {resume.done} of {resume.stepCount} steps done
                </p>
              </div>
              <Button asChild variant="brand">
                <Link to={`/my-lessons/${resume.id}`}>Continue</Link>
              </Button>
            </Card>
          )}
          <div className="flex gap-1.5" role="tablist" aria-label="Show">
            {(
              [
                ['TODO', 'To do'],
                ['DONE', 'Finished'],
                ['ALL', 'All'],
              ] as const
            ).map(([k, label]) => (
              <Button key={k} size="sm" variant={filter === k ? 'secondary' : 'ghost'} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}>
                {label}
              </Button>
            ))}
          </div>
          {shown.length ? (
            <Card className="divide-y divide-border p-0">
              {shown.map((m) => (
                <LessonRow key={m.id} m={m} />
              ))}
            </Card>
          ) : (
            <p className="py-6 text-center text-[13px] text-muted-foreground">{filter === 'DONE' ? 'Nothing finished yet.' : 'You’re all caught up.'}</p>
          )}
        </div>
      )}
    </Page>
  );
}

function LessonRow({ m }: { m: MyModuleRow }) {
  const pct = m.stepCount ? Math.round((100 * m.done) / m.stepCount) : 0;
  return (
    <Link to={`/my-lessons/${m.id}`} className="flex items-center gap-3 p-4 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">{m.status === 'COMPLETED' ? <CheckCircle2 className="size-5" /> : <BookOpenCheck className="size-5" />}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="min-w-0 truncate text-[14px] font-medium">{m.title}</span>
          {m.status === 'COMPLETED' ? <Badge variant="success">Finished</Badge> : m.status === 'NOT_STARTED' ? <Badge variant="brand">New</Badge> : null}
          {isSaved(m.id) && (
            <Badge variant="outline">
              <WifiOff /> Saved
            </Badge>
          )}
        </span>
        <span className="block truncate text-[12.5px] text-muted-foreground">{[m.subject.name, m.topic, m.week ? `Week ${m.week}` : null, m.publishedAt ? `Set ${formatDate(m.publishedAt, { day: 'numeric', month: 'short' })}` : null].filter(Boolean).join(' · ')}</span>
        {m.status !== 'NOT_STARTED' && (
          <span className="mt-1.5 flex items-center gap-2">
            <Progress value={pct} className="h-1.5 max-w-[200px]" barClassName={m.status === 'COMPLETED' ? 'bg-success' : undefined} label={`${m.title} progress`} />
            <span className="text-[11.5px] text-muted-foreground tabular">
              {m.done}/{m.stepCount}
              {m.lastScore !== null ? ` · last check-in ${m.lastScore}%` : ''}
            </span>
          </span>
        )}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/** "Your teacher has started a lesson: type the code on the board." */
function JoinCard() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  return (
    <Card className="mb-5 p-4">
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          joinLesson(code)
            .then((j) => navigate(`/my-lessons/live/${j.sessionId}`))
            .catch((err: unknown) => toast.error(errorMessage(err)))
            .finally(() => setBusy(false));
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-danger-soft text-danger">
            <Radio className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-medium">Class check-in</p>
            <p className="text-[12.5px] text-muted-foreground">In class? Type the code your teacher shows on the board.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))} placeholder="CODE" aria-label="Join code" className="h-10 w-full font-mono text-[16px] tracking-[0.3em] sm:w-36" autoCapitalize="characters" autoComplete="off" />
          <Button type="submit" loading={busy} disabled={code.length < 4}>
            Join
          </Button>
        </div>
      </form>
    </Card>
  );
}
