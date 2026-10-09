import type { CbtMyExam } from '@aischool/shared';
import { ArrowRight, CalendarClock, CheckCircle2, Clock, Download, KeyRound, ListOrdered, MonitorCheck, PlayCircle, WifiOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Link } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRelative } from '@/lib/format';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useMyExams } from './api';
import { downloadMyPack } from './offline/api';
import { windowLabel } from './ui';

/** The student's online exams: open now, coming up, and done. */
export default function MyExamsPage() {
  const q = useMyExams();
  const groups = useMemo(() => {
    const rows = q.data ?? [];
    const done = (e: CbtMyExam) => (e.attempt && e.attempt.status !== 'IN_PROGRESS') || (e.phase === 'ENDED' && !e.attempt);
    return [
      { key: 'open', title: 'Open now', rows: rows.filter((e) => !done(e) && (e.phase === 'OPEN' || e.attempt?.status === 'IN_PROGRESS')) },
      { key: 'soon', title: 'Coming up', rows: rows.filter((e) => !done(e) && e.phase === 'UPCOMING' && !e.attempt) },
      { key: 'done', title: 'Done', rows: rows.filter(done).sort((a, b) => b.closesAt.localeCompare(a.closesAt)) },
    ].filter((g) => g.rows.length);
  }, [q.data]);

  return (
    <Page className="max-w-4xl">
      <PageHeader
        title="Exams"
        description="Your school’s online tests and exams. Your answers save as you go, so if the network drops, just come back and carry on."
        actions={
          <Button asChild variant="outline">
            <Link to="/offline-exams">
              <WifiOff /> Offline exams
            </Link>
          </Button>
        }
      />
      {q.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      ) : q.error && !q.data ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : !groups.length ? (
        <Card>
          <EmptyState icon={MonitorCheck} title="No online exams yet" description="When your teacher schedules a test for your class, it will show up here." />
        </Card>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.key} aria-labelledby={`my-${g.key}`}>
              <h2 id={`my-${g.key}`} className="mb-3 font-display text-[15px] font-semibold tracking-tight">
                {g.title}
              </h2>
              <ul className="space-y-3">
                {g.rows.map((e) => (
                  <li key={e.id}>
                    <ExamRow e={e} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}

/** "Download for offline" on an exam the teacher made available offline. */
function OfflineAction({ e }: { e: CbtMyExam }) {
  const [busy, setBusy] = useState(false);
  const o = e.offline;
  if (!o || e.attempt || o.synced || e.phase === 'ENDED' || (o.syncBy && Date.parse(o.syncBy) < Date.now())) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {o.downloaded && (
        <Button asChild size="sm" variant="ghost">
          <Link to="/offline-exams">
            <WifiOff /> On this device?
          </Link>
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        loading={busy}
        onClick={() => {
          setBusy(true);
          downloadMyPack(e.id)
            .then(() => toast.success('Saved for offline', { description: 'On exam day open Offline exams — no internet needed. Your invigilator gives the start code.' }))
            .catch((x) => toast.error(errorMessage(x)))
            .finally(() => setBusy(false));
        }}
      >
        <Download /> {o.downloaded ? 'Download again' : 'Download for offline'}
      </Button>
    </div>
  );
}

function ExamRow({ e }: { e: CbtMyExam }) {
  const writing = e.attempt?.status === 'IN_PROGRESS';
  const handedIn = e.attempt && !writing;
  const missed = !e.attempt && e.phase === 'ENDED';
  return (
    <Card className={cn('flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5', writing && 'border-info/40')}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="brand">{e.subject}</Badge>
          {writing && <Badge variant="info">In progress</Badge>}
          {handedIn && (
            <Badge variant="success">
              <CheckCircle2 /> Handed in
            </Badge>
          )}
          {missed && <Badge variant="outline">Missed</Badge>}
          {e.offline && !e.attempt && (
            <Badge variant={e.offline.synced ? 'success' : 'info'}>
              <WifiOff /> {e.offline.synced ? 'Sat offline' : e.offline.downloaded ? 'Downloaded' : 'Can sit offline'}
            </Badge>
          )}
          {e.needsAccessCode && !e.attempt && (
            <Badge variant="outline">
              <KeyRound /> Access code
            </Badge>
          )}
        </div>
        <h3 className="mt-2 font-display text-[15.5px] font-semibold leading-snug tracking-tight">{e.title}</h3>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="size-3.5" /> {windowLabel(e.opensAt, e.closesAt)}
          </span>
          <span className="inline-flex items-center gap-1.5 tabular">
            <Clock className="size-3.5" /> {e.durationMinutes} min
          </span>
          <span className="inline-flex items-center gap-1.5 tabular">
            <ListOrdered className="size-3.5" /> {e.questionCount} questions
          </span>
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3 sm:flex-col sm:flex-nowrap sm:items-end">
        {e.result && (
          <p className="font-display text-xl font-semibold tabular">
            {e.result.percent}%<span className="ml-1 text-[12px] font-normal text-muted-foreground">{e.result.partial ? 'so far' : `${e.result.score}/${e.result.total}`}</span>
          </p>
        )}
        {writing ? (
          <Button asChild>
            <Link to={`/exam-room/${e.id}`}>
              <PlayCircle /> Continue
            </Link>
          </Button>
        ) : e.phase === 'OPEN' && !e.attempt ? (
          <Button asChild>
            <Link to={`/exam-room/${e.id}`}>
              Start <ArrowRight />
            </Link>
          </Button>
        ) : e.phase === 'UPCOMING' ? (
          <span className="text-[13px] text-muted-foreground">Opens {formatRelative(e.opensAt)}</span>
        ) : handedIn ? (
          <Button asChild variant="outline" size="sm">
            <Link to={`/exam-room/${e.id}`}>{e.result ? 'See result' : 'View'}</Link>
          </Button>
        ) : null}
        <OfflineAction e={e} />
      </div>
    </Card>
  );
}
