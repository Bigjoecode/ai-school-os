import type { PracticeAttemptView } from '@aischool/shared';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clock, LayoutList, ListOrdered, MessageCircleQuestion, Sparkles, XCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Markdown } from '@/components/ai/markdown';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorState } from '@/components/ui/empty-state';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAttempt, useSaveProgress, useSubmitAttempt } from './api';
import { MODE_LABEL, scoreTone } from './components';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

export default function AttemptPage() {
  const { id = '' } = useParams();
  const q = useAttempt(id);
  return (
    <Page className="max-w-3xl">
      {q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : q.data.submittedAt ? (
        <Results a={q.data} />
      ) : (
        <Player key={q.data.id} a={q.data} />
      )}
    </Page>
  );
}

function useCountdown(endsAt: string | null) {
  const [left, setLeft] = useState(() => (endsAt ? new Date(endsAt).getTime() - Date.now() : null));
  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setLeft(new Date(endsAt).getTime() - Date.now()), 1000);
    return () => clearInterval(t);
  }, [endsAt]);
  return left;
}
const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};

function Player({ a }: { a: PracticeAttemptView }) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => a.questions.map((q) => q.chosen ?? null));
  const [pos, setPos] = useState(() => Math.max(0, a.questions.findIndex((q) => q.chosen == null)));
  const [listView, setListView] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const save = useSaveProgress(a.id);
  const submit = useSubmitAttempt(a.id);
  const left = useCountdown(a.mode === 'MOCK' ? a.endsAt : null);
  const answered = answers.filter((x) => x != null).length;
  const submitted = useRef(false);

  const doSubmit = useCallback(() => {
    if (submitted.current) return;
    submitted.current = true;
    submit.mutate(answers, { onError: () => (submitted.current = false) });
  }, [answers, submit]);

  // Autosave mocks (and longer sets) shortly after each change.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      if (!submitted.current) save.mutate(answers);
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  // Time's up: hand it in.
  useEffect(() => {
    if (left != null && left <= 0) doSubmit();
  }, [left, doSubmit]);

  const choose = (qi: number, oi: number) => setAnswers((x) => x.map((v, i) => (i === qi ? oi : v)));
  const q = a.questions[pos];
  const lowTime = left != null && left < 5 * 60_000;

  return (
    <>
      <div className="sticky top-14 z-10 -mx-4 mb-5 border-b border-border bg-background/85 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[15px] font-semibold tracking-tight">{a.title}</p>
            <p className="text-[12px] text-muted-foreground">
              {MODE_LABEL[a.mode]} · {answered}/{a.questions.length} answered{save.isPending ? ' · saving…' : save.isSuccess ? ' · saved' : ''}
            </p>
          </div>
          {left != null && (
            <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[13px] font-semibold tabular', lowTime ? 'bg-danger-soft text-danger' : 'bg-muted')} role="timer" aria-label="Time left">
              <Clock className="size-3.5" aria-hidden />
              {clock(left)}
            </span>
          )}
          <Button variant="ghost" size="icon-sm" onClick={() => setListView((v) => !v)} aria-label={listView ? 'One question at a time' : 'Show all questions'} title={listView ? 'One at a time' : 'All questions'}>
            {listView ? <ListOrdered /> : <LayoutList />}
          </Button>
        </div>
        <Progress value={(answered / Math.max(1, a.questions.length)) * 100} className="mt-2.5" label="Answered" />
      </div>

      {listView ? (
        <ol className="space-y-4">
          {a.questions.map((qq, i) => (
            <li key={i}>
              <QuestionCard index={i} total={a.questions.length} stem={qq.stem} topic={qq.topic} options={qq.options} chosen={answers[i] ?? null} onChoose={(oi) => choose(i, oi)} />
            </li>
          ))}
        </ol>
      ) : q ? (
        <>
          <QuestionCard index={pos} total={a.questions.length} stem={q.stem} topic={q.topic} options={q.options} chosen={answers[pos] ?? null} onChoose={(oi) => choose(pos, oi)} />
          <div className="mt-4 flex items-center justify-between gap-2">
            <Button variant="outline" disabled={pos === 0} onClick={() => setPos((p) => p - 1)}>
              <ArrowLeft /> Back
            </Button>
            {pos < a.questions.length - 1 ? (
              <Button onClick={() => setPos((p) => p + 1)}>
                Next <ArrowRight />
              </Button>
            ) : (
              <Button onClick={() => setConfirm(true)} loading={submit.isPending}>
                <Check /> Hand in
              </Button>
            )}
          </div>
          <nav className="mt-6 flex flex-wrap gap-1.5" aria-label="Questions">
            {a.questions.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPos(i)}
                aria-current={i === pos ? 'step' : undefined}
                aria-label={`Question ${i + 1}${answers[i] != null ? ', answered' : ''}`}
                className={cn(
                  'grid size-8 place-items-center rounded-lg border text-[12px] font-medium tabular transition-colors',
                  i === pos ? 'border-brand bg-brand text-brand-foreground' : answers[i] != null ? 'border-transparent bg-brand-soft text-brand' : 'border-border hover:bg-muted',
                )}
              >
                {i + 1}
              </button>
            ))}
          </nav>
        </>
      ) : null}
      {listView && (
        <div className="mt-5 flex justify-end">
          <Button onClick={() => setConfirm(true)} loading={submit.isPending}>
            <Check /> Hand in
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Hand in your answers?"
        description={answered < a.questions.length ? `You’ve answered ${answered} of ${a.questions.length}. Unanswered questions count as wrong.` : 'You’ve answered every question. You’ll see your results and explanations next.'}
        confirmLabel="Hand in"
        destructive={false}
        onConfirm={() => {
          setConfirm(false);
          doSubmit();
        }}
      />
    </>
  );
}

function QuestionCard({ index, total, stem, topic, options, chosen, onChoose }: { index: number; total: number; stem: string; topic: string | null; options: string[]; chosen: number | null; onChoose: (i: number) => void }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
        <span className="font-medium">
          Question {index + 1} of {total}
        </span>
        {topic && <span className="truncate">{topic}</span>}
      </div>
      <p className="whitespace-pre-wrap text-[15.5px] font-medium leading-relaxed">{stem}</p>
      <div className="mt-4 space-y-2" role="radiogroup" aria-label={`Question ${index + 1} options`}>
        {options.map((o, oi) => {
          const on = chosen === oi;
          return (
            <button
              key={oi}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChoose(oi)}
              className={cn('flex w-full items-start gap-3 rounded-xl border p-3 text-left text-[14px] transition-colors', on ? 'border-brand bg-brand-soft' : 'border-border hover:border-border-strong hover:bg-muted/50')}
            >
              <span className={cn('grid size-6 shrink-0 place-items-center rounded-md text-[12px] font-semibold', on ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground')}>{LETTERS[oi]}</span>
              <span className="min-w-0 pt-0.5">{o}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function Results({ a }: { a: PracticeAttemptView }) {
  const [onlyWrong, setOnlyWrong] = useState(false);
  const pct = a.percent ?? 0;
  const message = pct >= 85 ? 'Outstanding work!' : pct >= 70 ? 'Great job — you’re getting there.' : pct >= 50 ? 'Good effort. A little more practice will make it stick.' : 'Every mistake is a lesson. Let’s look at what to practise.';
  const shown = a.questions.filter((q) => !onlyWrong || !q.correct);
  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/learn" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Learn
          </Link>
        }
        title={a.title}
        description={`${MODE_LABEL[a.mode]}${a.subject ? ` · ${a.subject}` : ''}`}
      />
      <Card className="mb-5 overflow-hidden">
        <div className="grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:items-center sm:p-6">
          <div className="relative mx-auto grid size-28 place-items-center">
            <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--muted)" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 97.4} 97.4`} className={scoreTone(pct)} />
            </svg>
            <div className="text-center">
              <p className={cn('font-display text-2xl font-semibold tabular', scoreTone(pct))}>{pct}%</p>
              <p className="text-[11px] tabular text-muted-foreground">
                {a.score}/{a.total}
              </p>
            </div>
          </div>
          <div className="min-w-0 text-center sm:text-left">
            <p className="font-display text-lg font-semibold tracking-tight">{message}</p>
            {a.perTopic && a.perTopic.length > 0 && (
              <ul className="mt-3 space-y-2">
                {a.perTopic.map((t) => {
                  const p = t.total ? Math.round((t.correct / t.total) * 100) : 0;
                  return (
                    <li key={t.topic} className="text-[13px]">
                      <div className="flex justify-between gap-2">
                        <span className="truncate">{t.topic}</span>
                        <span className={cn('shrink-0 tabular font-medium', scoreTone(p))}>
                          {t.correct}/{t.total}
                        </span>
                      </div>
                      <Progress value={p} className="mt-1" barClassName={p >= 70 ? 'bg-success' : p >= 50 ? 'bg-warning' : 'bg-danger'} label={t.topic} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        {a.review && (
          <div className="border-t border-border bg-ai-2/[0.04] p-5 sm:p-6">
            <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-ai-2">
              <Sparkles className="size-3.5" aria-hidden /> Your tutor’s review
            </p>
            <Markdown text={a.review} />
          </div>
        )}
      </Card>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[15px] font-semibold tracking-tight">Answers and explanations</h2>
        <div className="flex gap-2">
          <Button variant={onlyWrong ? 'default' : 'outline'} size="sm" onClick={() => setOnlyWrong((v) => !v)} aria-pressed={onlyWrong}>
            Only ones I missed
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/learn/tutor">
              <MessageCircleQuestion /> Ask my tutor
            </Link>
          </Button>
        </div>
      </div>
      <ol className="space-y-3">
        {shown.map((q) => (
          <li key={q.index}>
            <Card className={cn('p-5', q.correct ? '' : 'border-danger/25')}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium text-muted-foreground">Question {q.index + 1}</span>
                {q.correct ? (
                  <Badge variant="success">
                    <CheckCircle2 /> Correct
                  </Badge>
                ) : (
                  <Badge variant="danger">
                    <XCircle /> {q.chosen == null ? 'Not answered' : 'Not quite'}
                  </Badge>
                )}
              </div>
              <p className="whitespace-pre-wrap text-[14.5px] font-medium">{q.stem}</p>
              <ul className="mt-3 space-y-1.5">
                {q.options.map((o, oi) => {
                  const isAnswer = oi === q.answer;
                  const isChosen = oi === q.chosen;
                  return (
                    <li
                      key={oi}
                      className={cn(
                        'flex items-start gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px]',
                        isAnswer ? 'bg-success-soft text-success' : isChosen ? 'bg-danger-soft text-danger' : 'text-muted-foreground',
                      )}
                    >
                      <span className="w-4 shrink-0 font-semibold">{LETTERS[oi]}</span>
                      <span className="min-w-0 flex-1">{o}</span>
                      {isAnswer && <Check className="size-4 shrink-0" aria-label="Correct answer" />}
                      {isChosen && !isAnswer && <span className="shrink-0 text-[11px] font-medium">Your answer</span>}
                    </li>
                  );
                })}
              </ul>
              {q.explanation && <p className="mt-3 rounded-lg bg-muted/70 px-3 py-2 text-[13px] text-muted-foreground">{q.explanation}</p>}
            </Card>
          </li>
        ))}
        {shown.length === 0 && <p className="py-6 text-center text-[13px] text-muted-foreground">You got every question right. 🎉</p>}
      </ol>
    </>
  );
}
