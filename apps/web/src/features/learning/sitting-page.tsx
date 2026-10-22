import { EXAM_LABELS, MOCK_NAME, type ExamSittingView, type SittingPaperView } from '@aischool/shared';
import { ArrowLeft, Ban, CheckCircle2, Clock, FileText, Info, ListChecks, PenLine, RotateCcw, Timer } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { examLockError, useSitting, useStartSitting, useStartSittingPaper } from './api';
import { clock, minutesText, scoreTone, useCountdown } from './components';

const KIND_LABEL: Record<SittingPaperView['kind'], string> = { OBJECTIVE: 'Objective', THEORY: 'Written', PRACTICAL: 'Alternative to practical', NOT_IN_APP: 'Done in school' };

const marksText = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}`;

/** The grade's tone: credits and better (WAEC A1–C6, BECE A and C) green, passes (D7, E8, P) amber, fails red. */
const gradeTone = (g: string) => (/^(A|B|C)/.test(g) ? 'text-success' : /^(D|E|P)/.test(g) ? 'text-warning' : 'text-danger');

/** One full WASSCE or BECE mock: its papers (each on its own clock) and, once every in-app paper is marked, the grade on the exam's scale. */
export default function SittingPage() {
  const { id = '' } = useParams();
  const q = useSitting(id);
  return (
    <Page className="max-w-4xl">
      {q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : (
        <Sitting s={q.data} />
      )}
    </Page>
  );
}

function Sitting({ s }: { s: ExamSittingView }) {
  const inApp = s.papers.filter((p) => p.kind !== 'NOT_IN_APP');
  const done = inApp.filter((p) => p.status === 'SUBMITTED').length;
  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/learn/exams" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Exam Academy
          </Link>
        }
        title={`${s.subject}: ${MOCK_NAME[s.exam]} mock`}
        description={`Full ${MOCK_NAME[s.exam]} mock · ${EXAM_LABELS[s.exam]} · started ${formatDate(s.startedAt)} · ${s.result ? 'complete' : `${done} of ${inApp.length} paper${inApp.length === 1 ? '' : 's'} done`}`}
      />
      {s.result && <ResultCard s={s} />}
      <div className="space-y-4">
        {s.papers.map((p) => (
          <PaperCard key={p.paper} sittingId={s.id} p={p} />
        ))}
      </div>
      {s.notes.length > 0 && (
        <ul className="mt-5 space-y-1.5 text-[12.5px] text-muted-foreground" data-testid="sitting-notes">
          {s.notes.map((n) => (
            <li key={n} className="flex items-start gap-1.5">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> <span>{n}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ResultCard({ s }: { s: ExamSittingView }) {
  const r = s.result!;
  // WASSCE mocks graded before BECE mocks existed carry no scale: they are WAEC grades.
  const scale = r.scale ?? 'WAEC';
  const navigate = useNavigate();
  const retake = useStartSitting();
  const lock = examLockError(retake.error);
  return (
    <Card className="mb-6 overflow-hidden" data-testid="sitting-result">
      <div className="grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:items-center sm:p-6">
        <div className="mx-auto grid size-32 place-items-center rounded-2xl border border-border bg-muted/40 text-center">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{scale === 'BECE' ? 'BECE grade' : 'WAEC grade'}</p>
            <p className={cn('font-display text-5xl font-bold tracking-tight', gradeTone(r.grade))} data-testid="sitting-grade">
              {r.grade}
            </p>
            <p className="mt-1 text-[12.5px] font-medium">{r.remark}</p>
          </div>
        </div>
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold tracking-tight">
            {r.percent}% <span className="text-[14px] font-normal text-muted-foreground">· {marksText(r.earned)} of {r.outOf} marks</span>
          </p>
          {r.summary && <p className="mt-1 text-[13.5px] text-muted-foreground">{r.summary}</p>}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1 pr-3 font-medium">Paper</th>
                  <th className="py-1 pr-3 text-right font-medium">Marks</th>
                  <th className="py-1 text-right font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {r.papers.map((p) => (
                  <tr key={p.paper} className="border-t border-border">
                    <td className="py-1.5 pr-3">{p.title}</td>
                    <td className="py-1.5 pr-3 text-right tabular">
                      {marksText(p.earned)}/{p.marks}
                    </td>
                    <td className={cn('py-1.5 text-right font-medium tabular', scoreTone(p.percent))}>{p.percent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.leftOut.length > 0 && <p className="mt-2 text-[12px] text-muted-foreground">Not in this grade: {r.leftOut.join(', ')} (assessed in school).</p>}
        </div>
      </div>
      {r.topicsMissed.length > 0 && (
        <div className="border-t border-border px-5 py-4 sm:px-6">
          <p className="mb-2 text-[12.5px] font-semibold">Topics to revise</p>
          <ul className="flex flex-wrap gap-1.5">
            {r.topicsMissed.map((t) => (
              <li key={t.topic} className="rounded-full bg-muted px-2.5 py-1 text-[12px]">
                {t.topic} <span className="tabular text-muted-foreground">· {t.correct}/{t.total}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-col gap-2 border-t border-border bg-muted/30 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-[12px] text-muted-foreground">A mock grade is a guide to where you stand, not an official {scale === 'BECE' ? 'BECE' : 'WAEC'} result.</p>
        <Button size="sm" variant="outline" loading={retake.isPending} onClick={() => retake.mutate({ exam: s.exam, subject: s.subject }, { onSuccess: (v) => navigate(`/learn/sittings/${v.id}`) })}>
          <RotateCcw /> Retake {s.subject}
        </Button>
      </div>
      {(lock || retake.error) && <p className="px-5 pb-3 text-[12.5px] text-danger sm:px-6">{lock?.message ?? errorMessage(retake.error)}</p>}
    </Card>
  );
}

function PaperCard({ sittingId, p }: { sittingId: string; p: SittingPaperView }) {
  const navigate = useNavigate();
  const start = useStartSittingPaper(sittingId);
  const [confirm, setConfirm] = useState(false);
  const left = useCountdown(p.status === 'IN_PROGRESS' ? p.endsAt : null);
  const away = p.kind === 'NOT_IN_APP';
  const Icon = p.kind === 'OBJECTIVE' ? ListChecks : p.kind === 'NOT_IN_APP' ? Ban : PenLine;
  const size = p.kind === 'OBJECTIVE' ? `${p.questions} questions` : p.offered ? `${p.offered} questions, answer ${p.answer}` : null;
  const go = () => start.mutate(p.paper, { onSuccess: (a) => navigate(`/learn/attempts/${a.id}`) });

  return (
    <Card className={cn('p-4 sm:p-5', away && 'bg-card/70')} data-testid={`paper-${p.paper}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className={cn('grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5', away ? 'bg-muted text-muted-foreground' : 'bg-brand-soft text-brand')}>
          <Icon aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-[15.5px] font-semibold tracking-tight">{p.title}</p>
            <StatusBadge p={p} />
          </div>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {KIND_LABEL[p.kind]}
            {size ? ` · ${size}` : ''}
            {!away || p.minutes < 600 ? ` · ${minutesText(p.clockMinutes)}` : ''}
            {p.marks ? ` · ${p.marks} marks` : ''}
          </p>
        </div>
        {p.status === 'SUBMITTED' && p.earned !== null && (
          <div className="text-right">
            <p className={cn('font-display text-lg font-semibold tabular', scoreTone(p.percent))}>{p.percent}%</p>
            <p className="text-[11.5px] tabular text-muted-foreground">
              {marksText(p.earned)}/{p.marks} marks
            </p>
          </div>
        )}
      </div>
      {away ? (
        <p className="mt-3 rounded-xl bg-muted p-3 text-[12.5px] text-muted-foreground">{p.note}</p>
      ) : (
        <>
          <p className="mt-3 flex items-start gap-1.5 text-[13px]">
            <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden /> <span>{p.instructions}</span>
          </p>
          {start.error && <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{examLockError(start.error)?.message ?? errorMessage(start.error)}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {p.status === 'NOT_STARTED' && (
              <Button onClick={() => setConfirm(true)} loading={start.isPending} className="w-full sm:w-auto">
                <Timer /> Start {p.title.split(':')[0]}
              </Button>
            )}
            {p.status === 'IN_PROGRESS' && p.attemptId && (
              <>
                <Button asChild className="w-full sm:w-auto">
                  <Link to={`/learn/attempts/${p.attemptId}`}>
                    <PenLine /> Continue
                  </Link>
                </Button>
                {left != null && (
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                    <Clock className="size-3.5" aria-hidden /> {left > 0 ? `${clock(left)} left` : 'Time is up: open it to hand in'}
                  </span>
                )}
              </>
            )}
            {p.status === 'SUBMITTED' && p.attemptId && (
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link to={`/learn/attempts/${p.attemptId}`}>
                  <CheckCircle2 /> Review answers
                </Link>
              </Button>
            )}
          </div>
        </>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Start ${p.title.split(':')[0]}?`}
        description={`The clock starts now: ${minutesText(p.clockMinutes)}, and it keeps running if you leave. ${p.kind === 'OBJECTIVE' ? 'Your answers are handed in automatically when time is up.' : 'Your answers save as you write and are handed in for marking when time is up.'}`}
        confirmLabel="Start the clock"
        destructive={false}
        loading={start.isPending}
        onConfirm={() => {
          setConfirm(false);
          go();
        }}
      />
    </Card>
  );
}

function StatusBadge({ p }: { p: SittingPaperView }) {
  if (p.status === 'SUBMITTED')
    return (
      <Badge variant="success">
        <CheckCircle2 /> Marked
      </Badge>
    );
  if (p.status === 'IN_PROGRESS')
    return (
      <Badge variant="warning">
        <Clock /> In progress
      </Badge>
    );
  if (p.status === 'NOT_IN_APP') return <Badge variant="outline">Not in the app</Badge>;
  return <Badge variant="secondary">Not started</Badge>;
}
