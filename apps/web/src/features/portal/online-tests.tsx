import type { PortalOnlineTest, PortalOnlineTestQuestion } from '@aischool/shared';
import { ArrowLeft, Check, CheckCircle2, ChevronRight, Clock, Lock, MonitorCheck, XCircle } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { formatDate, formatPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { usePortalOnlineTest, usePortalOnlineTests } from './api';
import type { ShellCtx } from './ui';

/**
 * Online tests (CBT) in the family portal: every test the child sat, with the
 * score once the child may see it, and a question-by-question review after
 * the test has closed (or the teacher released it).
 */

const LETTERS = 'ABCDEFGHIJ';

/** "4 Oct" */
export const shortDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export const scoreTone = (pct: number) => (pct >= 70 ? 'text-success' : pct >= 50 ? 'text-warning' : 'text-danger');

export function OnlineTestsList({ child, isParent, onOpen }: Pick<ShellCtx, 'child' | 'isParent'> & { onOpen: (examId: string) => void }) {
  const q = usePortalOnlineTests(child.id);
  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>
    );
  }
  const { tests, withheld } = q.data;
  if (tests.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={MonitorCheck}
          title="No online tests yet"
          description={isParent ? `When ${child.firstName} sits a test on the computer or phone, the result will show here.` : 'When you sit a test online, your result will show here.'}
        />
      </Card>
    );
  }
  const scored = tests.filter((t) => t.percent != null);
  return (
    <div className="space-y-3">
      {withheld && (
        <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning-soft/40 p-3">
          <Lock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0">
            <p className="text-[13.5px] font-medium">Test scores are on hold</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{withheld}</p>
          </div>
        </div>
      )}
      {scored.length >= 2 && <ScoresChart tests={scored} />}
      <ul className="space-y-2.5">
        {tests.map((t) => (
          <li key={t.id}>
            <TestRow t={t} onOpen={() => onOpen(t.id)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TestRow({ t, onOpen }: { t: PortalOnlineTest; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left shadow-soft transition-all hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium">{t.title}</p>
        <p className="truncate text-[12px] text-muted-foreground">
          {t.subject} · {formatDate(t.satAt)}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {t.percent != null && t.status === 'MARKING' && (
            <Badge variant="info">
              <Clock /> Marking in progress
            </Badge>
          )}
          {t.classAverage != null && <span className="text-[11.5px] text-muted-foreground tabular">Class average {formatPct(t.classAverage, 1)}</span>}
          {t.percent == null && t.note && <span className="text-[12px] text-muted-foreground">{t.note}</span>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        {t.percent != null ? (
          <>
            <p className={cn('font-display text-xl font-semibold tabular leading-tight', scoreTone(t.percent))}>{formatPct(t.percent, Number.isInteger(t.percent) ? 0 : 1)}</p>
            <p className="text-[11.5px] text-muted-foreground tabular">
              {t.score}/{t.total}
            </p>
          </>
        ) : (
          <Badge variant="secondary">{t.status === 'MARKING' ? 'Being marked' : 'Not out yet'}</Badge>
        )}
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
    </button>
  );
}

/** Scores over time (oldest first), with the class average for comparison. */
function ScoresChart({ tests }: { tests: PortalOnlineTest[] }) {
  const data = [...tests]
    .sort((a, b) => a.satAt.localeCompare(b.satAt))
    .slice(-12)
    .map((t) => ({ name: shortDate(t.satAt), title: t.title, score: t.percent, average: t.classAverage }));
  const hasAverage = data.some((d) => d.average != null);
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[15px] font-semibold">Scores over time</h2>
        <div className="flex items-center gap-3 text-[11.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-[var(--chart-1)]" aria-hidden /> Score
          </span>
          {hasAverage && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dashed border-muted-foreground/60" aria-hidden /> Class average
            </span>
          )}
        </div>
      </div>
      <div className="h-40" role="img" aria-label={`Scores in the last ${data.length} online tests: ${data.map((d) => `${d.title} ${d.score}%`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 4" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} fontSize={11} />
            <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickLine={false} axisLine={false} width={44} fontSize={11} tickFormatter={(v: number) => `${v}%`} />
            <Tooltip
              cursor={{ stroke: 'var(--border-strong)', strokeDasharray: '4 4' }}
              content={({ active, payload }) => {
                const row = active && payload?.length ? (payload[0]!.payload as (typeof data)[number]) : null;
                return row ? (
                  <div className="max-w-[220px] rounded-xl border border-border bg-popover/95 px-3 py-2 text-[12px] shadow-pop backdrop-blur">
                    <p className="truncate font-medium">{row.title}</p>
                    <p className="text-muted-foreground">{row.name}</p>
                    <p className="mt-1 tabular">Score {formatPct(row.score, 1)}</p>
                    {row.average != null && <p className="tabular text-muted-foreground">Class average {formatPct(row.average, 1)}</p>}
                  </div>
                ) : null;
              }}
            />
            {hasAverage && <Line type="monotone" dataKey="average" stroke="var(--muted-foreground)" strokeOpacity={0.6} strokeDasharray="4 4" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />}
            <Line type="monotone" dataKey="score" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3.5, fill: 'var(--chart-1)', strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ one test

export function OnlineTestReview({ child, isParent, examId, onBack }: Pick<ShellCtx, 'child' | 'isParent'> & { examId: string; onBack: () => void }) {
  const q = usePortalOnlineTest(child.id, examId);
  const back = (
    <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
      <ArrowLeft /> All online tests
    </Button>
  );
  if (q.isLoading) {
    return (
      <div className="space-y-3">
        {back}
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    );
  }
  const v = q.data;
  if (!v) {
    const err = q.error;
    const withheld = err instanceof ApiError && err.status === 403 && err.details.code === 'RESULT_WITHHELD';
    const notFound = err instanceof ApiError && err.status === 404;
    return (
      <div className="space-y-3">
        {back}
        <Card>
          {withheld ? (
            <EmptyState icon={Lock} title="This result is on hold" description={err.message} />
          ) : notFound ? (
            <EmptyState icon={MonitorCheck} title="Test not found" description="This online test isn’t available. It may have been removed by the school." />
          ) : (
            <ErrorState error={err} onRetry={() => void q.refetch()} />
          )}
        </Card>
      </div>
    );
  }
  const t = v.test;
  return (
    <div className="space-y-4">
      {back}
      <Card className="p-5 text-center sm:p-6">
        <p className="text-[12px] font-medium text-muted-foreground">
          {t.subject}
          {t.term ? ` · ${t.term}` : ''}
        </p>
        <h2 className="mt-1 font-display text-lg font-semibold tracking-tight">{t.title}</h2>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">Sat {formatDate(t.satAt)}</p>
        {t.percent != null ? (
          <div className="mt-4">
            <p className={cn('font-display text-4xl font-semibold tabular', scoreTone(t.percent))}>{formatPct(t.percent, Number.isInteger(t.percent) ? 0 : 1)}</p>
            <p className="mt-1 text-[13.5px] tabular text-muted-foreground">
              {t.score} out of {t.total} marks{t.status === 'MARKING' ? ' so far' : ''}
            </p>
          </div>
        ) : null}
        {(t.classAverage != null || t.classHighest != null) && (
          <div className="mx-auto mt-4 grid max-w-xs grid-cols-2 gap-2">
            <div className="min-w-0 rounded-xl bg-muted/60 px-3 py-2">
              <p className="text-[11.5px] text-muted-foreground">Class average</p>
              <p className="font-display text-lg font-semibold tabular">{formatPct(t.classAverage, 1)}</p>
            </div>
            <div className="min-w-0 rounded-xl bg-muted/60 px-3 py-2">
              <p className="text-[11.5px] text-muted-foreground">Highest</p>
              <p className="font-display text-lg font-semibold tabular">{formatPct(t.classHighest, 1)}</p>
            </div>
          </div>
        )}
        {t.note && <p className="mx-auto mt-4 max-w-md rounded-xl bg-muted px-4 py-3 text-[13px]">{t.note}</p>}
      </Card>

      {v.questions && v.questions.length > 0 && (
        <section aria-labelledby="test-review-h">
          <h2 id="test-review-h" className="mb-3 font-display text-[15px] font-semibold tracking-tight">
            Question by question
          </h2>
          <ol className="space-y-3">
            {v.questions.map((x) => (
              <li key={x.number}>
                <QuestionCard x={x} whose={isParent ? `${child.firstName}’s answer` : 'Your answer'} />
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function QuestionCard({ x, whose }: { x: PortalOnlineTestQuestion; whose: string }) {
  const unanswered = x.objective ? x.chosenIndex == null : !x.writtenAnswer;
  return (
    <Card className={cn('p-4 sm:p-5', x.correct === false && 'border-danger/25')}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-muted-foreground">
          Question {x.number} · {x.marks} {x.marks === 1 ? 'mark' : 'marks'}
        </span>
        {x.objective ? (
          x.correct ? (
            <Badge variant="success">
              <CheckCircle2 /> Correct
            </Badge>
          ) : (
            <Badge variant="danger">
              <XCircle /> {unanswered ? 'Not answered' : 'Wrong'}
            </Badge>
          )
        ) : (
          <Badge variant={x.awarded != null ? 'info' : 'secondary'}>{x.awarded != null ? `${x.awarded}/${x.marks}` : 'Being marked'}</Badge>
        )}
      </div>
      <p className="whitespace-pre-wrap text-[14.5px] font-medium">{x.stem}</p>
      {x.objective ? (
        <ul className="mt-3 space-y-1.5">
          {x.options.map((o, i) => {
            const key = x.correctIndex === i;
            const chose = x.chosenIndex === i;
            return (
              <li key={i} className={cn('flex items-start gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px]', key ? 'bg-success-soft text-success' : chose ? 'bg-danger-soft text-danger' : 'text-muted-foreground')}>
                <span className="w-4 shrink-0 font-semibold">{LETTERS[i]}</span>
                <span className="min-w-0 flex-1">{o}</span>
                {key && <Check className="size-4 shrink-0" aria-label="Correct answer" />}
                {chose && !key && <span className="shrink-0 text-[11px] font-medium">{whose}</span>}
                {chose && key && <span className="sr-only">{whose}</span>}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-3 space-y-2 text-[13.5px]">
          <p className="text-[11.5px] font-medium text-muted-foreground">{whose}</p>
          <p className="whitespace-pre-wrap rounded-lg bg-muted/60 px-3 py-2">{x.writtenAnswer ?? <em className="text-muted-foreground">No answer</em>}</p>
          {x.modelAnswer && (
            <p className="whitespace-pre-wrap rounded-lg bg-success-soft px-3 py-2 text-success">
              <span className="font-semibold">Model answer: </span>
              {x.modelAnswer}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
