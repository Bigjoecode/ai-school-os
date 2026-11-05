import { CBT_SHOW_RESULTS_LABELS, PRACTICAL_ASSESSMENT_KIND_LABELS, type PracticalAssessmentResults } from '@aischool/shared';
import { ArrowLeft, Bot, CalendarClock, Clock, KeyRound, Users } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PhaseBadge, minutesLabel, windowLabel } from '../cbt/ui';
import { PracticalTestActions } from './actions';
import { usePracticalTestResults } from './api';

const STATUS: Record<string, { label: string; variant: 'outline' | 'info' | 'success' }> = {
  NOT_STARTED: { label: 'Not started', variant: 'outline' },
  IN_PROGRESS: { label: 'In the lab', variant: 'info' },
  SUBMITTED: { label: 'Handed in', variant: 'success' },
};

/** Staff: one practical test, its results per student and per rubric criterion, and its actions. */
export default function PracticalTestPage() {
  const { id = '' } = useParams();
  const q = usePracticalTestResults(id);
  const r = q.data;
  return (
    <Page className="max-w-7xl">
      {q.error && !r ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !r ? (
        <div className="space-y-4">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      ) : (
        <Body r={r} />
      )}
    </Page>
  );
}

function Body({ r }: { r: PracticalAssessmentResults }) {
  const e = r.assessment;
  const sat = r.rows.filter((x) => x.status !== 'NOT_STARTED');
  const absent = r.rows.filter((x) => x.status === 'NOT_STARTED');
  return (
    <>
      <PageHeader
        eyebrow={`${e.subject.name} · Practical test`}
        title={e.title}
        description={`${e.practical.title} · ${PRACTICAL_ASSESSMENT_KIND_LABELS[e.kind]}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/practical-tests">
              <ArrowLeft /> All practical tests
            </Link>
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted-foreground">
        <PhaseBadge phase={e.phase} />
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock className="size-3.5" /> {windowLabel(e.opensAt, e.closesAt)}
        </span>
        <span className="inline-flex items-center gap-1.5 tabular">
          <Clock className="size-3.5" /> {e.durationMinutes} min
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-3.5" /> {e.classArms.map((a) => a.name).join(', ')}
        </span>
        {e.accessCode && (
          <span className="inline-flex items-center gap-1.5">
            <KeyRound className="size-3.5" /> Code <span className="font-mono font-medium text-foreground">{e.accessCode}</span>
          </span>
        )}
        <span>Results shown: {e.resultsReleasedAt ? 'released' : CBT_SHOW_RESULTS_LABELS[e.showResults].replace('exam', 'test')}</span>
        <span>{e.component ? `Counts towards ${e.component.name} (out of ${e.component.maxScore}) · ${e.term?.name ?? ''}` : 'Not for the score sheet'}</span>
      </div>
      <div className="mb-5">
        <PracticalTestActions e={e} />
      </div>
      <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ['Handed in', `${r.summary.sat}/${e.counts.students}`],
          ['Average', r.summary.average != null ? `${r.summary.average}%` : '—'],
          ['Highest', r.summary.highest != null ? `${r.summary.highest}%` : '—'],
          ['Lowest', r.summary.lowest != null ? `${r.summary.lowest}%` : '—'],
          ['Pass rate', r.summary.passRate != null ? `${r.summary.passRate}%` : '—'],
        ].map(([k, v]) => (
          <Card key={k} className="p-3">
            <dt className="text-[12px] text-muted-foreground">{k}</dt>
            <dd className="font-display text-lg font-semibold tabular">{v}</dd>
          </Card>
        ))}
      </dl>
      {!sat.length ? (
        <Card>
          <EmptyState icon={Users} title="Nobody has started yet" description={e.phase === 'UPCOMING' ? 'Students can start once it opens.' : 'Students find it under Exams and start it in the virtual lab.'} />
        </Card>
      ) : (
        <ResultsTable r={r} rows={sat} />
      )}
      {absent.length > 0 && (
        <details className="mt-4 rounded-xl border border-border px-4 py-3 text-[13px]">
          <summary className="cursor-pointer font-medium">Not started ({absent.length})</summary>
          <p className="mt-2 text-muted-foreground">{absent.map((x) => x.student.name).join(', ')}</p>
        </details>
      )}
    </>
  );
}

function ResultsTable({ r, rows }: { r: PracticalAssessmentResults; rows: PracticalAssessmentResults['rows'] }) {
  const exam = r.assessment.kind === 'EXAM';
  return (
    <Card className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-36 sm:min-w-44">Student</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Score</TableHead>
            <TableHead className="text-right">%</TableHead>
            {r.criteria.map((c) => (
              <TableHead key={c.id} className="hidden text-right md:table-cell" title={`${c.label}${c.how === 'AI' ? ' — written answer, AI-marked' : ' — marked exactly'}`}>
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  {c.how === 'AI' && <Bot className="size-3.5 text-brand" aria-label="AI-marked" />}
                  {c.label.length > 14 ? `${c.label.slice(0, 13)}…` : c.label} <span className="text-muted-foreground">/{c.max}</span>
                </span>
              </TableHead>
            ))}
            <TableHead className="text-right">Time</TableHead>
            {exam && (
              <TableHead className="text-right" title="Times the student left the lab during the exam. A signal to look into, not proof of anything.">
                Focus losses
              </TableHead>
            )}
            <TableHead className="whitespace-nowrap">Last saved</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((x) => (
            <TableRow key={x.student.id}>
              <TableCell>
                <p className="font-medium">{x.student.name}</p>
                <p className="text-[12px] text-muted-foreground">
                  {x.student.admissionNumber}
                  {x.student.classArm ? ` · ${x.student.classArm}` : ''}
                </p>
              </TableCell>
              <TableCell>
                <Badge variant={STATUS[x.status]!.variant} dot>
                  {STATUS[x.status]!.label}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular whitespace-nowrap">
                {x.score != null ? `${x.score}/${x.maxScore}` : '—'}
                {x.reviewed && <span className="ml-1 text-[11px] text-info">reviewed</span>}
              </TableCell>
              <TableCell className={cn('text-right font-medium tabular', x.percent == null ? 'text-muted-foreground' : x.percent >= 70 ? 'text-success' : x.percent >= 50 ? 'text-warning' : 'text-danger')}>{x.percent != null ? `${x.percent}%` : '—'}</TableCell>
              {r.criteria.map((c) => {
                const k = x.criteria.find((y) => y.id === c.id);
                return (
                  <TableCell key={c.id} className="hidden text-right tabular text-muted-foreground md:table-cell">
                    {k ? k.awarded : '—'}
                  </TableCell>
                );
              })}
              <TableCell className="text-right tabular">{minutesLabel(x.timeTakenSeconds)}</TableCell>
              {exam && <TableCell className={cn('text-right tabular', x.focusLosses >= 3 ? 'font-semibold text-danger' : x.focusLosses > 0 ? 'text-warning' : 'text-muted-foreground')}>{x.focusLosses}</TableCell>}
              <TableCell className="whitespace-nowrap text-[12.5px] text-muted-foreground">{x.lastSeenAt ? formatRelative(x.lastSeenAt) : '—'}</TableCell>
              <TableCell>
                {x.attemptId && x.status === 'SUBMITTED' && (
                  <Button asChild size="sm" variant="ghost">
                    <Link to={`/practical-work/attempts/${x.attemptId}`}>Review</Link>
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
