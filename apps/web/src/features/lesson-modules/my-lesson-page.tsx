import { MODULE_STEP_LABELS, type CheckInOutcome, type CheckInStart, type CueResult, type MyModuleDetail, type MyModuleStep } from '@aischool/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ClipboardCheck, Lock, PartyPopper, RotateCcw, WifiOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { answerCue, completeStep, lk, startCheckIn, submitCheckIn, useMyLesson, visitStep } from './api';
import { forgetLesson, isSaved, offlineSupported, saveLesson } from './offline';
import { CheckInReview, fromMine, pictureSteps, QuestionForm, StepContent, videoSource, VideoQuiz } from './step-content';

/** A student working through a lesson module at their own pace. */
export default function MyLessonPage() {
  const { id = '' } = useParams();
  const q = useMyLesson(id);
  const qc = useQueryClient();
  const d = q.data;
  const [stepId, setStepId] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: lk.myOne(id) }).then(() => qc.invalidateQueries({ queryKey: lk.mine }));

  // Resume where they left off (or the first open step).
  useEffect(() => {
    if (!d || stepId) return;
    const current = d.steps.find((s) => s.id === d.currentStepId && s.state !== 'LOCKED');
    setStepId((current ?? d.steps.find((s) => s.state === 'OPEN') ?? d.steps[0])?.id ?? null);
  }, [d, stepId]);

  const step = d?.steps.find((s) => s.id === stepId) ?? null;
  const index = d && step ? d.steps.indexOf(step) : -1;
  const go = (s: MyModuleStep | undefined) => {
    if (!s || s.state === 'LOCKED') return;
    setStepId(s.id);
    void visitStep(id, s.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <Page className="max-w-6xl">
      <PageHeader
        eyebrow={
          <Link to="/my-lessons" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" /> My lessons
          </Link>
        }
        title={d?.title ?? 'Lesson'}
        description={d ? [d.subject.name, d.topic, d.week ? `Week ${d.week}` : null].filter(Boolean).join(' · ') : undefined}
        actions={d && <OfflineButton d={d} />}
      />
      {q.error && !d ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="min-w-0 space-y-3">
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between text-[12.5px]">
                <span className="font-medium">Your progress</span>
                <span className="text-muted-foreground tabular">
                  {d.done} of {d.stepCount}
                </span>
              </div>
              <Progress value={d.stepCount ? (100 * d.done) / d.stepCount : 0} barClassName={d.status === 'COMPLETED' ? 'bg-success' : undefined} label="Lesson progress" />
              {d.mustPass && <p className="mt-2 text-[11.5px] text-muted-foreground">Score {d.passMark}% or more in each check-in to unlock the next step.</p>}
            </Card>
            <nav aria-label="Steps" className="no-scrollbar flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
              {d.steps.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => go(s)}
                  disabled={s.state === 'LOCKED'}
                  aria-current={s.id === stepId ? 'step' : undefined}
                  className={cn(
                    'flex min-w-[180px] shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-w-0',
                    s.id === stepId ? 'border-brand bg-brand-soft' : 'border-border bg-card hover:bg-muted/60',
                    s.state === 'LOCKED' && 'cursor-not-allowed opacity-60',
                  )}
                >
                  <span className={cn('grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold', s.state === 'DONE' ? 'bg-success text-white' : s.state === 'LOCKED' ? 'bg-muted text-muted-foreground' : 'bg-brand text-brand-foreground')}>
                    {s.state === 'DONE' ? <Check className="size-3.5" /> : s.state === 'LOCKED' ? <Lock className="size-3" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.title}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">
                      {s.kind === 'CHECKIN' ? `Check-in · ${s.questionCount} questions` : s.kind === 'VIDEO' && s.cues.length ? `Video quiz · ${s.cues.length} questions` : MODULE_STEP_LABELS[s.kind]}
                    </span>
                  </span>
                </button>
              ))}
            </nav>
          </aside>
          <section className="min-w-0 space-y-4">
            {d.status === 'COMPLETED' && (
              <Card className="flex items-center gap-3 border-success/30 bg-success-soft/50 p-4">
                <PartyPopper className="size-6 shrink-0 text-success" aria-hidden />
                <div>
                  <p className="font-medium">Well done — you’ve finished this lesson!</p>
                  <p className="text-[12.5px] text-muted-foreground">You can come back to any step to revise.</p>
                </div>
              </Card>
            )}
            {step && (
              <Card className="p-4 sm:p-6">
                <p className="mb-1 text-[12px] font-medium text-muted-foreground">
                  Step {index + 1} of {d.steps.length} · {MODULE_STEP_LABELS[step.kind]}
                </p>
                <h2 className="mb-4 font-display text-xl font-semibold tracking-tight">{step.title}</h2>
                {step.kind === 'CHECKIN' ? (
                  <CheckInPanel key={step.id} moduleId={id} d={d} step={step} onDone={refresh} onNext={() => go(d.steps[index + 1])} />
                ) : (
                  <ContentPanel key={step.id} moduleId={id} step={step} onRefresh={refresh} next={d.steps[index + 1]} onNext={() => go(d.steps[index + 1])} />
                )}
              </Card>
            )}
          </section>
        </div>
      )}
    </Page>
  );
}

function OfflineButton({ d }: { d: MyModuleDetail }) {
  const [saved, setSaved] = useState(() => isSaved(d.id));
  const [busy, setBusy] = useState(false);
  if (!offlineSupported()) return null;
  return (
    <Button
      variant="outline"
      loading={busy}
      onClick={() => {
        setBusy(true);
        const job = saved ? forgetLesson(d.id).then(() => (setSaved(false), toast.success('Removed from this device'))) : saveLesson(d.id, pictureSteps(d.steps.map(fromMine))).then(() => (setSaved(true), toast.success('Saved: you can read the notes and pictures without internet', { description: 'Videos need a connection. Check-in answers are sent when you’re back online.' })));
        void job.catch((e: unknown) => toast.error(errorMessage(e))).finally(() => setBusy(false));
      }}
    >
      <WifiOff /> {saved ? 'Saved offline' : 'Save for offline'}
    </Button>
  );
}

function ContentPanel({ moduleId, step, next, onNext, onRefresh }: { moduleId: string; step: MyModuleStep; next?: MyModuleStep; onNext: () => void; onRefresh: () => Promise<unknown> }) {
  const [answered, setAnswered] = useState<Record<string, boolean>>(step.cuesAnswered);
  const [busy, setBusy] = useState(false);
  const view = fromMine(step);
  const cuesLeft = step.cues.filter((c) => !(c.id in answered)).length;
  const hasVideo = !!videoSource(view) && (step.kind === 'VIDEO' || !!step.material?.youtubeId || !!step.material?.file?.mimeType.startsWith('video/'));
  const done = async () => {
    if (step.state === 'DONE') return onNext();
    setBusy(true);
    try {
      const r = await completeStep(moduleId, step.id);
      await onRefresh();
      if (r.moduleCompleted) toast.success('Lesson finished — well done!');
      else onNext();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5">
      <StepContent
        moduleId={moduleId}
        step={view}
        video={
          hasVideo ? (
            <VideoQuiz
              moduleId={moduleId}
              step={view}
              cues={step.cues.map((c) => ({ id: c.id, at: c.at ?? 0 }))}
              isDone={(cid) => cid in answered}
              renderCue={(cid, resume) => <CueCard key={cid} moduleId={moduleId} stepId={step.id} q={step.cues.find((c) => c.id === cid)!} onAnswered={(ok) => setAnswered((a) => ({ ...a, [cid]: ok }))} onContinue={resume} />}
            />
          ) : null
        }
      />
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
        {cuesLeft > 0 && step.state !== 'DONE' && <span className="text-[12.5px] text-muted-foreground">Watch the video and answer its {cuesLeft === 1 ? 'question' : `${cuesLeft} questions`} to carry on.</span>}
        {(step.state !== 'DONE' || next) && (
          <Button variant="brand" onClick={() => void done()} loading={busy} disabled={cuesLeft > 0 && step.state !== 'DONE'}>
            {step.state === 'DONE' ? 'Next step' : next ? 'Done — next step' : 'Finish lesson'} <ArrowRight />
          </Button>
        )}
      </div>
    </div>
  );
}

function CueCard({ moduleId, stepId, q, onAnswered, onContinue }: { moduleId: string; stepId: string; q: MyModuleStep['cues'][number]; onAnswered: (ok: boolean) => void; onContinue: () => void }) {
  const [r, setR] = useState<CueResult | null>(null);
  const [busy, setBusy] = useState(false);
  if (r)
    return (
      <div className="space-y-3">
        <p className={cn('flex items-center gap-2 font-medium', r.correct ? 'text-success' : 'text-danger')}>{r.correct ? <CheckCircle2 className="size-5" /> : <RotateCcw className="size-5" />}{r.correct ? 'That’s right!' : `Not quite — the answer is “${r.correctAnswer}”.`}</p>
        {r.explanation && <p className="text-[13.5px] text-muted-foreground">{r.explanation}</p>}
        <Button variant="brand" onClick={onContinue}>
          Continue the video <ArrowRight />
        </Button>
      </div>
    );
  return (
    <div className="space-y-2">
      <p className="text-[12px] font-medium text-muted-foreground">Quick question</p>
      <QuestionForm
        questions={[q]}
        pending={busy}
        submitLabel="Answer"
        onSubmit={(a) => {
          setBusy(true);
          answerCue(moduleId, stepId, q.id, a[q.id]!)
            .then((res) => {
              setR(res);
              onAnswered(res.correct);
            })
            .catch((e: unknown) => toast.error(errorMessage(e)))
            .finally(() => setBusy(false));
        }}
      />
    </div>
  );
}

function CheckInPanel({ moduleId, d, step, onDone, onNext }: { moduleId: string; d: MyModuleDetail; step: MyModuleStep; onDone: () => Promise<unknown>; onNext: () => void }) {
  const [attempt, setAttempt] = useState<CheckInStart | null>(null);
  const [result, setResult] = useState<CheckInOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const start = () => {
    setBusy(true);
    setResult(null);
    startCheckIn(moduleId, step.id)
      .then(setAttempt)
      .catch((e: unknown) => toast.error(errorMessage(e)))
      .finally(() => setBusy(false));
  };
  const intro = useMemo(
    () => (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl bg-muted/60 p-4">
          <ClipboardCheck className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
          <div className="text-[13.5px]">
            <p className="font-medium">
              {step.questionCount} quick question{step.questionCount === 1 ? '' : 's'} to check you’ve understood.
            </p>
            <p className="text-muted-foreground">
              {d.mustPass ? `Score ${step.passMark}% or more to unlock the next step. ` : `The pass mark is ${step.passMark}%. `}You can try again as many times as you need; the questions come in a new order each time.
            </p>
            {step.best && (
              <p className="mt-1 text-muted-foreground">
                Best so far: <span className="font-medium text-foreground">{step.best.percent}%</span> ({step.best.tries} {step.best.tries === 1 ? 'try' : 'tries'}){step.best.passed ? ' — passed' : ''}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="brand" onClick={start} loading={busy}>
            {step.best ? 'Try again' : 'Start the check-in'}
          </Button>
          {step.state === 'DONE' && (
            <Button variant="outline" onClick={onNext}>
              Next step <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step, busy, d.mustPass],
  );
  if (result)
    return (
      <div className="space-y-4">
        <div className={cn('rounded-xl p-4', result.passed ? 'bg-success-soft/60' : 'bg-warning-soft/60')}>
          <p className="font-display text-3xl font-semibold tabular">{result.percent}%</p>
          <p className="text-[13.5px]">
            {result.correct} of {result.total} right ·{' '}
            {result.passed ? 'Passed — great work!' : result.mustPass ? `You need ${result.passMark}% to move on. Look over the notes and try again.` : `The pass mark is ${result.passMark}%, but you can carry on.`}
          </p>
        </div>
        <CheckInReview review={result.review} />
        <div className="flex flex-wrap gap-2">
          {result.stepCompleted && !result.moduleCompleted && (
            <Button variant="brand" onClick={onNext}>
              Next step <ArrowRight />
            </Button>
          )}
          {!result.passed && (
            <Button variant={result.stepCompleted ? 'outline' : 'brand'} onClick={start} loading={busy}>
              <RotateCcw /> Try again
            </Button>
          )}
          {result.moduleCompleted && <Badge variant="success">Lesson finished</Badge>}
        </div>
      </div>
    );
  if (attempt)
    return (
      <QuestionForm
        key={attempt.attemptId}
        questions={attempt.questions}
        pending={busy}
        onSubmit={(answers) => {
          setBusy(true);
          submitCheckIn(attempt.attemptId, answers)
            .then(async (r) => {
              setResult(r);
              setAttempt(null);
              await onDone();
            })
            .catch((e: unknown) => toast.error(errorMessage(e)))
            .finally(() => setBusy(false));
        }}
      />
    );
  return intro;
}
