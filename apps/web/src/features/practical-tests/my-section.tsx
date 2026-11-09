import type { PracticalMyAssessment } from '@aischool/shared';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clock, FlaskConical, KeyRound, PlayCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ApiError, errorMessage } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { windowLabel } from '../cbt/ui';
import { useMyPracticalTests, useStartPracticalTest } from './api';

/** The student's practical tests, on their Exams page: start inside the window (with the code), carry on, or see the result. */
export function MyPracticalTests() {
  const q = useMyPracticalTests();
  const rows = q.data ?? [];
  if (!rows.length) return null;
  const done = (e: PracticalMyAssessment) => !!e.attempt?.submittedAt || (e.phase === 'ENDED' && !e.attempt);
  const sorted = [...rows.filter((e) => !done(e)), ...rows.filter(done).sort((a, b) => b.closesAt.localeCompare(a.closesAt))];
  return (
    <section aria-labelledby="my-practical-tests" className="mb-8">
      <h2 id="my-practical-tests" className="mb-3 flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
        <FlaskConical className="size-4" /> Practical tests
      </h2>
      <ul className="space-y-3">
        {sorted.map((e) => (
          <li key={e.id}>
            <TestRow e={e} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TestRow({ e }: { e: PracticalMyAssessment }) {
  const navigate = useNavigate();
  const start = useStartPracticalTest(e.id);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const sitting = !!e.attempt && !e.attempt.submittedAt;
  const handedIn = !!e.attempt?.submittedAt;
  const missed = !e.attempt && e.phase === 'ENDED';
  const canStart = !e.attempt && e.phase === 'OPEN';
  const go = () => {
    setError(null);
    start.mutate(e.needsAccessCode ? code.trim() : null, {
      onSuccess: (a) => navigate(`/learn/practicals/labs/${a.id}`),
      onError: (x) => setError(x instanceof ApiError && x.errors.length ? x.errors[0]!.message : errorMessage(x)),
    });
  };
  return (
    <Card className={cn('flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5', sitting && 'border-info/40')}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="brand">{e.subject}</Badge>
          <Badge variant={e.kind === 'EXAM' ? 'warning' : 'secondary'}>{e.kind === 'EXAM' ? 'Practical exam' : 'Practical test'}</Badge>
          {sitting && <Badge variant="info">In progress</Badge>}
          {handedIn && (
            <Badge variant="success">
              <CheckCircle2 /> Handed in
            </Badge>
          )}
          {missed && <Badge variant="outline">Missed</Badge>}
          {e.needsAccessCode && !e.attempt && (
            <Badge variant="outline">
              <KeyRound /> Access code
            </Badge>
          )}
        </div>
        <h3 className="mt-2 font-display text-[15.5px] font-semibold leading-snug tracking-tight">{e.title}</h3>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{e.practicalTitle}</p>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="size-3.5" /> {windowLabel(e.opensAt, e.closesAt)}
          </span>
          <span className="inline-flex items-center gap-1.5 tabular">
            <Clock className="size-3.5" /> {e.durationMinutes} min, one attempt
          </span>
        </p>
        {handedIn && e.resultNote && <p className="mt-2 text-[12.5px] text-muted-foreground">{e.resultNote}</p>}
        {!e.attempt && !missed && e.kind === 'EXAM' && (
          <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-warning">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Stay on this screen. Each time you switch to another app or tab is recorded for your teacher.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-[12.5px] text-danger">
            {error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:flex-nowrap sm:items-end">
        {e.result && (
          <p className="font-display text-xl font-semibold tabular">
            {e.result.percent}%<span className="ml-1 text-[12px] font-normal text-muted-foreground">{`${e.result.score}/${e.result.maxScore}`}</span>
          </p>
        )}
        {sitting ? (
          <Button asChild>
            <Link to={`/learn/practicals/labs/${e.attempt!.id}`}>
              <PlayCircle /> Continue
            </Link>
          </Button>
        ) : canStart ? (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {e.needsAccessCode && <Input aria-label="Access code" value={code} onChange={(x) => setCode(x.target.value.toUpperCase())} placeholder="Access code" className="h-9 w-full min-w-0 sm:w-36" maxLength={20} autoComplete="off" />}
            <Button onClick={go} loading={start.isPending} disabled={e.needsAccessCode && !code.trim()}>
              Start <ArrowRight />
            </Button>
          </div>
        ) : e.phase === 'UPCOMING' ? (
          <span className="text-[13px] text-muted-foreground">Opens {formatRelative(e.opensAt)}</span>
        ) : handedIn ? (
          <Button asChild variant="outline" size="sm">
            <Link to={`/learn/practicals/labs/${e.attempt!.id}`}>{e.result ? 'See result' : 'View'}</Link>
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
