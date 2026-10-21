import { type PracticeAttemptRow, type PracticeAttemptView } from '@aischool/shared';
import { ArrowLeft, Check, CheckCircle2, Clock, Flag, MessageCircleQuestion, RotateCcw, Sparkles, TrendingDown, TrendingUp, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Markdown } from '@/components/ai/markdown';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { scoreTone } from './components';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

const duration = (sec: number | null | undefined) => {
  if (sec == null) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min ${sec % 60} s`;
};

/**
 * A marked UTME mock, scored like JAMB: each subject out of 100 (correct ÷
 * questions × 100, rounded) and a total out of 400, with raw counts, time
 * used, topic strengths and weaknesses and the full review.
 */
export function UtmeResults({ a, history }: { a: PracticeAttemptView; history: PracticeAttemptRow[] }) {
  const u = a.utme;
  const sections = a.sections ?? [];
  const [subject, setSubject] = useState<string | null>(null);
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  const topics = useMemo(() => {
    const rows = (a.perTopic ?? []).filter((t) => t.topic !== 'General' && t.total >= 2).map((t) => ({ ...t, pct: Math.round((t.correct / t.total) * 100) }));
    return {
      strong: rows.filter((t) => t.pct >= 70).sort((x, y) => y.pct - x.pct || y.total - x.total).slice(0, 6),
      weak: rows.filter((t) => t.pct < 50).sort((x, y) => x.pct - y.pct || y.total - x.total).slice(0, 6),
    };
  }, [a.perTopic]);

  const shown = a.questions.filter((q) => (!subject || q.subject === subject) && (!onlyWrong || !q.correct) && (!onlyFlagged || q.flagged));
  const numberIn = (i: number) => {
    const s = sections.find((x) => i >= x.start && i < x.start + x.count);
    return s ? { label: s.label, n: i - s.start + 1 } : { label: '', n: i + 1 };
  };
  const flaggedCount = a.questions.filter((q) => q.flagged).length;
  const pct = u ? Math.round((u.total / Math.max(1, u.outOf)) * 100) : (a.percent ?? 0);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/learn/exams" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Exam Academy
          </Link>
        }
        title="JAMB UTME mock result"
        description={`${a.title.replace(/^JAMB UTME mock(?: \(shorter\))?: /, '')} · ${a.submittedAt ? formatDateTime(a.submittedAt) : ''}`}
      />
      <Card className="mb-5 overflow-hidden">
        <div className="grid gap-5 p-5 sm:p-6 md:grid-cols-[auto_1fr] md:items-center">
          <div className="text-center md:pr-6 md:text-left">
            <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Total score</p>
            <p className={cn('font-display text-5xl font-semibold tabular', scoreTone(pct))} data-testid="utme-total">
              {u?.total ?? 0}
              <span className="text-2xl text-muted-foreground">/{u?.outOf ?? 400}</span>
            </p>
            <p className="mt-1 text-[13px] tabular text-muted-foreground">
              {u?.correct ?? a.score} of {u?.questions ?? a.total} questions right
            </p>
            <p className="mt-1 flex items-center justify-center gap-1 text-[12.5px] text-muted-foreground md:justify-start">
              <Clock className="size-3.5" aria-hidden /> Time used: {duration(a.timeUsedSeconds)}
              {a.durationMinutes ? ` of ${a.durationMinutes} min` : ''}
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2" data-testid="utme-subjects">
            {(u?.subjects ?? []).map((s) => (
              <li key={s.subject} className="rounded-xl border border-border p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13.5px] font-semibold">{s.label}</span>
                  <span className={cn('shrink-0 font-display text-xl font-semibold tabular', scoreTone(s.score))}>
                    {s.score}
                    <span className="text-[12px] text-muted-foreground">/100</span>
                  </span>
                </div>
                <Progress value={s.score} className="mt-2" barClassName={s.score >= 70 ? 'bg-success' : s.score >= 50 ? 'bg-warning' : 'bg-danger'} label={s.label} />
                <p className="mt-1.5 text-[12px] tabular text-muted-foreground">
                  {s.correct} of {s.total} right
                </p>
              </li>
            ))}
          </ul>
        </div>
        <p className="border-t border-border bg-muted/40 px-5 py-2.5 text-[12px] text-muted-foreground sm:px-6">
          Scored like the UTME: each subject is marked out of 100 (your correct answers as a share of its questions) and the four add up to 400. Unanswered questions score zero. JAMB’s own scaling of results may differ.
        </p>
        {(topics.strong.length > 0 || topics.weak.length > 0) && (
          <div className="grid gap-4 border-t border-border p-5 sm:grid-cols-2 sm:p-6">
            <TopicList title="Strengths" icon={TrendingUp} tone="text-success" rows={topics.strong} empty="Keep practising: strengths show once you score 70%+ on a topic." />
            <TopicList title="Work on these" icon={TrendingDown} tone="text-danger" rows={topics.weak} empty="No weak topics in this mock. Well done!" />
          </div>
        )}
        {a.review && (
          <div className="border-t border-border bg-ai-2/[0.04] p-5 sm:p-6">
            <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-ai-2">
              <Sparkles className="size-3.5" aria-hidden /> Your tutor’s review
            </p>
            <Markdown text={a.review} />
          </div>
        )}
      </Card>

      {history.length > 1 && (
        <Card className="mb-5 p-5">
          <UtmeTrend rows={history} highlight={a.id} />
        </Card>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[15px] font-semibold tracking-tight">Review: your answers, the correct answers and explanations</h2>
        <Button asChild variant="outline" size="sm">
          <Link to="/learn/tutor">
            <MessageCircleQuestion /> Ask my tutor
          </Link>
        </Button>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter the review">
        <Button size="sm" variant={!subject ? 'default' : 'outline'} onClick={() => setSubject(null)}>
          All subjects
        </Button>
        {sections.map((s) => (
          <Button key={s.subject} size="sm" variant={subject === s.subject ? 'default' : 'outline'} onClick={() => setSubject(s.subject)}>
            {s.label}
          </Button>
        ))}
        <span className="mx-1 hidden w-px self-stretch bg-border sm:block" aria-hidden />
        <Button size="sm" variant={onlyWrong ? 'default' : 'outline'} aria-pressed={onlyWrong} onClick={() => setOnlyWrong((v) => !v)}>
          <XCircle /> Wrong or unanswered only
        </Button>
        <Button size="sm" variant={onlyFlagged ? 'default' : 'outline'} aria-pressed={onlyFlagged} onClick={() => setOnlyFlagged((v) => !v)} disabled={!flaggedCount}>
          <Flag /> Flagged ({flaggedCount})
        </Button>
      </div>
      <p className="mb-3 text-[12.5px] text-muted-foreground">{shown.length} question{shown.length === 1 ? '' : 's'}</p>
      <ol className="space-y-3">
        {shown.map((q) => {
          const where = numberIn(q.index);
          return (
            <li key={q.index}>
              <Card className={cn('p-4 sm:p-5', q.correct ? '' : 'border-danger/25')}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-muted-foreground">
                    {where.label} · Question {where.n}
                    {q.topic ? ` · ${q.topic}` : ''}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {q.flagged && (
                      <Badge variant="warning">
                        <Flag /> Flagged
                      </Badge>
                    )}
                    {q.correct ? (
                      <Badge variant="success">
                        <CheckCircle2 /> Correct
                      </Badge>
                    ) : (
                      <Badge variant="danger">
                        <XCircle /> {q.chosen == null ? 'Not answered' : 'Wrong'}
                      </Badge>
                    )}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-[14.5px] font-medium">{q.stem}</p>
                <ul className="mt-3 space-y-1.5">
                  {q.options.map((o, oi) => {
                    const isAnswer = oi === q.answer;
                    const isChosen = oi === q.chosen;
                    return (
                      <li key={oi} className={cn('flex items-start gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px]', isAnswer ? 'bg-success-soft text-success' : isChosen ? 'bg-danger-soft text-danger' : 'text-muted-foreground')}>
                        <span className="w-4 shrink-0 font-semibold">{LETTERS[oi]}</span>
                        <span className="min-w-0 flex-1">{o}</span>
                        {isAnswer && (
                          <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium">
                            <Check className="size-4" aria-hidden /> Correct answer
                          </span>
                        )}
                        {isChosen && !isAnswer && <span className="shrink-0 text-[11px] font-medium">Your answer</span>}
                      </li>
                    );
                  })}
                </ul>
                {q.explanation && <p className="mt-3 rounded-lg bg-muted/70 px-3 py-2 text-[13px] text-muted-foreground">{q.explanation}</p>}
              </Card>
            </li>
          );
        })}
        {shown.length === 0 && <p className="py-6 text-center text-[13px] text-muted-foreground">Nothing to show with these filters.</p>}
      </ol>
      <div className="mt-6 flex justify-center">
        <Button asChild variant="outline">
          <Link to="/learn/exams">
            <RotateCcw /> Take another mock
          </Link>
        </Button>
      </div>
    </>
  );
}

function TopicList({ title, icon: Icon, tone, rows, empty }: { title: string; icon: typeof TrendingUp; tone: string; rows: { topic: string; subject?: string | null; correct: number; total: number; pct: number }[]; empty: string }) {
  return (
    <div>
      <p className={cn('mb-2 flex items-center gap-1.5 text-[13px] font-semibold', tone)}>
        <Icon className="size-4" aria-hidden /> {title}
      </p>
      {rows.length ? (
        <ul className="space-y-1.5">
          {rows.map((t) => (
            <li key={`${t.subject ?? ''}|${t.topic}`} className="flex items-center justify-between gap-2 text-[13px]">
              <span className="min-w-0 truncate">
                {t.topic}
                {t.subject ? <span className="text-muted-foreground"> · {t.subject === 'English Language' ? 'Use of English' : t.subject}</span> : null}
              </span>
              <span className={cn('shrink-0 font-medium tabular', scoreTone(t.pct))}>
                {t.correct}/{t.total}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

/** UTME mock scores over time (out of 400), oldest first, with each subject on hover. */
export function UtmeTrend({ rows, highlight }: { rows: PracticeAttemptRow[]; highlight?: string }) {
  const done = rows.filter((r) => r.mode === 'UTME' && r.submittedAt && r.utme).sort((x, y) => x.submittedAt!.localeCompare(y.submittedAt!)).slice(-12);
  if (!done.length) return null;
  const outOf = Math.max(...done.map((r) => r.utme!.outOf), 400);
  const last = done[done.length - 1]!.utme!.total;
  const first = done[0]!.utme!.total;
  const change = done.length > 1 ? last - first : null;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-[15px] font-semibold tracking-tight">Your UTME mock scores</p>
        <p className="text-[12.5px] text-muted-foreground">
          {done.length} mock{done.length === 1 ? '' : 's'}
          {change !== null ? (
            <>
              {' · '}
              <span className={cn('font-medium', change > 0 ? 'text-success' : change < 0 ? 'text-danger' : '')}>
                {change > 0 ? '+' : ''}
                {change}
              </span>{' '}
              since the first
            </>
          ) : null}
        </p>
      </div>
      <ol className="flex h-36 items-end gap-2" aria-label="UTME mock scores over time" data-testid="utme-trend">
        {done.map((r) => {
          const u = r.utme!;
          const h = Math.max(4, (u.total / outOf) * 100);
          return (
            <li key={r.id} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[11px] font-semibold tabular">{u.total}</span>
              <Link
                to={`/learn/attempts/${r.id}`}
                className={cn('w-full max-w-10 rounded-t-md transition-opacity hover:opacity-80', r.id === highlight ? 'bg-brand' : 'bg-brand/45')}
                style={{ height: `${h}%` }}
                title={`${formatDateTime(r.submittedAt!)}: ${u.total}/${u.outOf} — ${u.subjects.map((s) => `${s.label} ${s.score}`).join(', ')}`}
                aria-label={`${u.total} out of ${u.outOf} on ${formatDateTime(r.submittedAt!)}`}
              />
              <span className="w-full truncate text-center text-[10.5px] text-muted-foreground">{new Date(r.submittedAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
