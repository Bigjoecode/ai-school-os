import { INTEREST_TYPES, QUIZ_SCALE } from '@aischool/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, ListChecks, Loader2, MessageCircleHeart, RotateCcw, Route, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { useDocumentTitle } from '@/lib/hooks';
import { cn, safeStorage } from '@/lib/utils';
import { SectionTitle } from '../learning/components';
import { crk, useCareerHome, useCareerQuiz, useQuizResults, useSubmitQuiz } from './api';
import { CareerCard, CareersTabs, InterestBars, InterestChip } from './ui';

const DRAFT_KEY = 'aischool:career-quiz';

/** The interest quiz: one statement at a time, three big answers, progress kept on this device. */
export default function CareerQuizPage() {
  useDocumentTitle('Interest quiz');
  const q = useCareerQuiz();
  const submit = useSubmitQuiz();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(safeStorage().get(DRAFT_KEY) ?? '{}') as Record<string, number>;
    } catch {
      return {};
    }
  });
  const statements = q.data?.statements ?? [];
  const firstOpen = statements.findIndex((s) => answers[s.id] === undefined);
  const [index, setIndex] = useState<number | null>(null);
  const [started, setStarted] = useState(() => Object.keys(answers).length > 0);
  const at = index ?? (firstOpen === -1 ? Math.max(0, statements.length - 1) : firstOpen);
  const current = statements[at];
  const answered = statements.filter((s) => answers[s.id] !== undefined).length;
  const complete = statements.length > 0 && answered === statements.length;

  useEffect(() => {
    safeStorage().set(DRAFT_KEY, JSON.stringify(answers));
  }, [answers]);

  const finish = (all: Record<string, number>) =>
    submit.mutate(all, {
      onSuccess: (r) => {
        safeStorage().set(DRAFT_KEY, '{}');
        qc.setQueryData(crk.results, { result: r });
        navigate('/careers/results', { replace: true });
      },
      onError: (err) => toast.error(errorMessage(err)),
    });

  const choose = (value: number) => {
    if (!current) return;
    const next = { ...answers, [current.id]: value };
    setAnswers(next);
    const nextOpen = statements.findIndex((s, i) => i > at && next[s.id] === undefined);
    const anyOpen = statements.findIndex((s) => next[s.id] === undefined);
    if (nextOpen !== -1) setIndex(nextOpen);
    else if (anyOpen !== -1) setIndex(anyOpen);
    else finish(next);
  };

  return (
    <Page className="max-w-3xl">
      <PageHeader eyebrow="Careers" title="Interest quiz" description="Would you enjoy these activities? Go with your first feeling — there are no right or wrong answers." />
      <CareersTabs />
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : !started ? (
        <Card className="p-6 text-center sm:p-8">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-ai-gradient text-white">
            <ListChecks className="size-6" aria-hidden />
          </span>
          <h2 className="mt-4 font-display text-xl font-semibold tracking-tight">36 quick statements, about 5 minutes</h2>
          <p className="mx-auto mt-2 max-w-md text-[14px] text-muted-foreground">For each one, choose “Not for me”, “Maybe” or “I’d enjoy it”. Think about whether you’d <em>like</em> doing it, not whether you’re good at it yet.</p>
          <Button size="lg" variant="ai" className="mt-6 rounded-full" onClick={() => setStarted(true)}>
            Start <ArrowRight />
          </Button>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-border p-4 sm:px-6">
            <div className="mb-2 flex items-center justify-between text-[12.5px] text-muted-foreground">
              <span>
                Statement {Math.min(at + 1, statements.length)} of {statements.length}
              </span>
              <span aria-live="polite">{answered} answered</span>
            </div>
            <Progress value={(answered / statements.length) * 100} label="Quiz progress" />
          </div>
          {submit.isPending || (complete && index === null) ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              {submit.isPending ? <Loader2 className="size-6 animate-spin text-brand" aria-hidden /> : <Sparkles className="size-6 text-brand" aria-hidden />}
              <p className="text-[14px]">{submit.isPending ? 'Working out your interest types…' : 'All done!'}</p>
              {!submit.isPending && (
                <Button onClick={() => finish(answers)}>
                  See my results <ArrowRight />
                </Button>
              )}
            </div>
          ) : current ? (
            <div className="px-4 py-8 sm:px-8 sm:py-12">
              <p className="text-center text-[13px] font-medium text-muted-foreground">Would you enjoy this?</p>
              <p key={current.id} className="mx-auto mt-3 max-w-lg text-center font-display text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
                {current.text}
              </p>
              <div className="mx-auto mt-8 grid max-w-lg gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Your answer">
                {QUIZ_SCALE.map((o) => {
                  const on = answers[current.id] === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => choose(o.value)}
                      className={cn(
                        'min-h-12 rounded-xl border px-4 py-3 text-[15px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]',
                        on ? 'border-brand bg-brand-soft text-brand' : 'border-border bg-card hover:border-border-strong hover:bg-muted/60',
                      )}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
              <div className="mx-auto mt-6 flex max-w-lg items-center justify-between">
                <Button variant="ghost" size="sm" disabled={at === 0} onClick={() => setIndex(Math.max(0, at - 1))}>
                  <ArrowLeft /> Back
                </Button>
                {complete ? (
                  <Button size="sm" onClick={() => finish(answers)} loading={submit.isPending}>
                    See my results <ArrowRight />
                  </Button>
                ) : (
                  answers[current.id] !== undefined && (
                    <Button variant="ghost" size="sm" onClick={() => setIndex(Math.min(statements.length - 1, at + 1))}>
                      Next <ArrowRight />
                    </Button>
                  )
                )}
              </div>
            </div>
          ) : null}
        </Card>
      )}
    </Page>
  );
}

/** The quiz results: interest profile and the careers it points to. */
export function CareerResultsPage() {
  useDocumentTitle('Your interest results');
  const q = useQuizResults();
  const home = useCareerHome();
  const r = q.data?.result;
  const saved = new Set(home.data?.plan.savedCareers ?? []);
  const reset = () => safeStorage().set(DRAFT_KEY, '{}');
  return (
    <Page className="max-w-5xl">
      <PageHeader eyebrow="Careers" title="Your interest results" description="What you enjoy points to the kinds of work that might suit you. It’s a starting point to explore, not a final answer." />
      <CareersTabs />
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : !r ? (
        <Card>
          <EmptyState icon={ListChecks} title="Take the quiz first" description="Your interest types and matched careers will appear here." action={<Button asChild><Link to="/careers/quiz">Take the interest quiz</Link></Button>} />
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
            <Card className="p-5">
              <SectionTitle icon={Sparkles} title="Your top three" />
              <ol className="space-y-3">
                {r.interests.top.map((t, i) => (
                  <li key={t} className="flex gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[12px] font-semibold">{i + 1}</span>
                    <div className="min-w-0">
                      <InterestChip type={t} className="text-[12.5px]" />
                      <p className="mt-1 text-[13px] text-muted-foreground">{INTEREST_TYPES[t].blurb}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
            <Card className="p-5">
              <SectionTitle icon={ListChecks} title="All six interest types" />
              <InterestBars result={r.interests} />
              <p className="mt-3 text-[11.5px] text-muted-foreground">Based on the Holland (RIASEC) interest types used by careers advisers around the world.</p>
            </Card>
          </div>
          <section>
            <SectionTitle icon={Sparkles} title="Careers that match" />
            {r.matches.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {r.matches.map((c) => (
                  <CareerCard key={c.id} career={c} match={c.match} reasons={c.reasons} saved={saved.has(c.slug)} />
                ))}
              </div>
            ) : (
              <Card className="p-5 text-[13.5px] text-muted-foreground">The career library is still being filled in. Check back soon!</Card>
            )}
          </section>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/careers/advisor">
                <Route /> Which track suits me?
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/careers/counsellor?ask=Can you explain my interest results and what careers I could explore?">
                <MessageCircleHeart /> Talk it through
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/careers/quiz" onClick={reset}>
                <RotateCcw /> Retake the quiz
              </Link>
            </Button>
          </div>
        </div>
      )}
    </Page>
  );
}
