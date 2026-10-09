import { MODULE_STEP_LABELS, MOVE_ON_SHARE, type ClassroomSessionView, type ModuleStepRow, type SessionStepResult } from '@aischool/shared';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Eye, Hand, Maximize, Minus, Plus, Radio, RotateCcw, Smartphone, Square, Users, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { useSession, useSessionAction } from './api';
import { forStudentView } from './present-helpers';
import { fromRow, StepContent, videoSource, VideoQuiz } from './step-content';

/**
 * Classroom mode: the teacher presents a module full screen (projector, TV or
 * laptop), step by step. At a check-in the class answers on their own devices
 * (join code on screen, live tally every 2 s) or by show of hands / a quick
 * mark per student; the app then suggests re-teach or move on, and the
 * teacher's choice is recorded before the lesson moves on.
 */
export default function PresentPage() {
  const { sessionId = '' } = useParams();
  const [polling, setPolling] = useState(false);
  const q = useSession(sessionId, polling);
  const v = q.data;
  const act = useSessionAction(sessionId);
  const navigate = useNavigate();
  useDocumentTitle(v ? `Teaching: ${v.module.title}` : 'Classroom');
  useEffect(() => setPolling(!!v?.openStepId && v.status === 'LIVE'), [v?.openStepId, v?.status]);

  const steps = v?.module.steps ?? [];
  const index = Math.max(0, steps.findIndex((s) => s.id === v?.currentStepId));
  const step = steps[index];
  const result = step ? v?.results[step.id] : undefined;
  const blocked = !!step && step.kind === 'CHECKIN' && (!result || !result.decision) && v?.status === 'LIVE';

  const goTo = useCallback(
    (i: number) => {
      const s = steps[i];
      if (!s || v?.status !== 'LIVE') return;
      act.mutate({ kind: 'step', stepId: s.id }, { onError: (e) => toast.error(errorMessage(e)) });
    },
    [steps, v?.status, act],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return;
      if (e.key === 'ArrowRight' && !blocked) goTo(index + 1);
      if (e.key === 'ArrowLeft') goTo(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, index, blocked]);

  if (q.error && !v) return <div className="p-6"><ErrorState error={q.error} onRetry={() => void q.refetch()} /></div>;
  if (!v || !step) return <div className="p-6"><Skeleton className="h-[70vh] rounded-2xl" /></div>;

  const hasCheckIns = steps.some((s) => s.kind === 'CHECKIN');
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-card px-4 py-2.5 sm:px-6">
        <Button asChild variant="ghost" size="sm">
          <Link to={`/modules/${v.module.id}`}>
            <ArrowLeft /> Exit
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[16px] font-semibold">{v.module.title}</p>
          <p className="truncate text-[12px] text-muted-foreground">
            {v.class.label} · {v.module.subject.name} · step {index + 1} of {steps.length}
          </p>
        </div>
        {hasCheckIns && v.status === 'LIVE' && (
          <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-1.5" title="Students join the live check-in with this code: My lessons → Class check-in">
            <Smartphone className="size-4 text-muted-foreground" aria-hidden />
            <span className="text-[11.5px] text-muted-foreground">Join code</span>
            <span className="font-mono text-[20px] font-bold tracking-[0.2em]">{v.code}</span>
          </div>
        )}
        <PresentCount v={v} onSave={(n) => act.mutate({ kind: 'present', present: n })} />
        <Button variant="ghost" size="icon-sm" aria-label="Full screen" onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => undefined)}>
          <Maximize />
        </Button>
        {v.status === 'LIVE' ? (
          <Button variant="outline" size="sm" loading={act.isPending && act.variables?.kind === 'end'} onClick={() => act.mutate({ kind: 'end' }, { onSuccess: () => toast.success('Lesson recorded'), onError: (e) => toast.error(errorMessage(e)) })}>
            <Square /> End lesson
          </Button>
        ) : (
          <Badge variant="outline">Ended</Badge>
        )}
      </header>

      <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-border bg-card/60 px-4 py-2 sm:px-6" role="tablist" aria-label="Steps">
        {steps.map((s, i) => {
          const r = v.results[s.id];
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              onClick={() => goTo(i)}
              className={cn('flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px]', i === index ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:bg-muted')}
            >
              <span className="tabular">{i + 1}</span>
              <span className="max-w-[140px] truncate">{s.title}</span>
              {r?.decision === 'MOVE_ON' && <Check className="size-3.5" />}
              {r?.decision === 'RETEACH' && <RotateCcw className="size-3.5" />}
            </button>
          );
        })}
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <p className="mb-1 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">{MODULE_STEP_LABELS[step.kind]}</p>
        <h1 className="mb-6 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{step.title}</h1>
        {step.kind === 'CHECKIN' ? <CheckInStage key={step.id} v={v} step={step} /> : <TeachStage key={step.id} moduleId={v.module.id} step={step} />}
      </main>

      <footer className="sticky bottom-0 flex items-center gap-3 border-t border-border bg-card px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
        <Button variant="outline" size="lg" onClick={() => goTo(index - 1)} disabled={index === 0 || v.status !== 'LIVE'}>
          <ArrowLeft /> Back
        </Button>
        <Progress value={(100 * (index + 1)) / steps.length} className="mx-2 hidden h-1.5 flex-1 sm:block" label="Lesson progress" />
        <span className="flex-1 sm:hidden" />
        {blocked && <span className="hidden text-right text-[12.5px] text-muted-foreground md:block">Run the check-in and choose re-teach or move on first</span>}
        {index < steps.length - 1 ? (
          <Button variant="brand" size="lg" onClick={() => goTo(index + 1)} disabled={blocked || v.status !== 'LIVE'}>
            Next <ArrowRight />
          </Button>
        ) : v.status === 'LIVE' ? (
          <Button variant="brand" size="lg" disabled={blocked} onClick={() => act.mutate({ kind: 'end' }, { onSuccess: () => (toast.success('Lesson recorded'), navigate(`/modules/${v.module.id}`)) })}>
            <CheckCircle2 /> Finish lesson
          </Button>
        ) : null}
      </footer>
    </div>
  );
}

function PresentCount({ v, onSave }: { v: ClassroomSessionView; onSave: (n: number | null) => void }) {
  const [val, setVal] = useState(v.present?.toString() ?? '');
  useEffect(() => setVal(v.present?.toString() ?? ''), [v.present]);
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
      <Users className="size-4" aria-hidden />
      In class
      <Input
        value={val}
        inputMode="numeric"
        onChange={(e) => setVal(e.target.value.replace(/\D/g, '').slice(0, 3))}
        onBlur={() => val !== (v.present?.toString() ?? '') && onSave(val ? Number(val) : null)}
        placeholder={String(v.students.length)}
        className="h-8 w-16 text-center"
        aria-label="Students in class"
        disabled={v.status !== 'LIVE'}
      />
    </label>
  );
}

// ------------------------------------------------------------------ teaching a content step

function TeachStage({ moduleId, step }: { moduleId: string; step: ModuleStepRow }) {
  const view = fromRow(step);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const hasVideo = !!videoSource(view) && (step.kind === 'VIDEO' || !!step.material?.youtubeId || !!step.material?.file?.mimeType.startsWith('video/'));
  return (
    <StepContent
      moduleId={moduleId}
      step={view}
      big
      video={
        hasVideo ? (
          <VideoQuiz
            big
            moduleId={moduleId}
            step={view}
            cues={step.questions.map((q) => ({ id: q.id, at: q.at ?? 0 }))}
            isDone={(id) => shown.has(id)}
            renderCue={(id, resume) => <ClassCue q={step.questions.find((x) => x.id === id)!} onContinue={() => (setShown((s) => new Set(s).add(id)), resume())} />}
          />
        ) : null
      }
    />
  );
}

/** A video question for the whole class: they answer aloud or with hands; the teacher reveals the answer. */
function ClassCue({ q, onContinue }: { q: ModuleStepRow['questions'][number]; onContinue: () => void }) {
  const [reveal, setReveal] = useState(false);
  return (
    <div className="space-y-4">
      <p className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">Question for the class</p>
      <p className="text-[22px] font-semibold leading-snug">{q.prompt}</p>
      {q.type !== 'SHORT' && (
        <div className="grid gap-2 sm:grid-cols-2">
          {q.options.map((o, i) => (
            <div key={i} className={cn('flex items-center gap-3 rounded-xl border px-4 py-3 text-[18px]', reveal && i === q.correctIndex ? 'border-success bg-success-soft' : 'border-border')}>
              {q.type === 'MCQ' && <span className="font-semibold text-muted-foreground">{'ABCDEF'[i]}</span>}
              {o}
            </div>
          ))}
        </div>
      )}
      {reveal && q.type === 'SHORT' && <p className="rounded-xl bg-success-soft px-4 py-3 text-[18px]">Answer: {q.answers.join(' / ')}</p>}
      {reveal && q.explanation && <p className="text-[15px] text-muted-foreground">{q.explanation}</p>}
      <div className="flex flex-wrap gap-2">
        {!reveal && (
          <Button size="lg" variant="outline" onClick={() => setReveal(true)}>
            <Eye /> Show the answer
          </Button>
        )}
        <Button size="lg" variant="brand" onClick={onContinue}>
          Continue the video <ArrowRight />
        </Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ check-in

function CheckInStage({ v, step }: { v: ClassroomSessionView; step: ModuleStepRow }) {
  const act = useSessionAction(v.id);
  const result = v.results[step.id];
  const open = v.openStepId === step.id;
  const [mode, setMode] = useState<'devices' | 'hands'>(result && result.mode !== 'DEVICES' ? 'hands' : 'devices');
  const [reveal, setReveal] = useState(false);
  const live = open ? v.live : null;
  const err = (e: unknown) => toast.error(errorMessage(e));
  const ended = v.status !== 'LIVE';

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className="min-w-0 space-y-4">
        {step.questions.map((q, i) => {
          const pq = live?.perQuestion.find((x) => x.questionId === q.id);
          const sq = forStudentView(q);
          return (
            <div key={q.id} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <p className="text-[19px] font-semibold leading-snug sm:text-[21px]">
                {i + 1}. {sq.prompt}
              </p>
              {sq.options.length > 0 && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {sq.options.map((o, j) => (
                    <div key={j} className={cn('flex items-center gap-3 rounded-xl border px-3 py-2 text-[16px] sm:text-[17px]', reveal && j === q.correctIndex ? 'border-success bg-success-soft' : 'border-border')}>
                      {q.type === 'MCQ' && <span className="font-semibold text-muted-foreground">{'ABCDEF'[j]}</span>}
                      {o}
                    </div>
                  ))}
                </div>
              )}
              {reveal && q.type === 'SHORT' && <p className="mt-3 rounded-xl bg-success-soft px-3 py-2 text-[16px]">Answer: {q.answers.join(' / ')}</p>}
              {reveal && q.explanation && <p className="mt-2 text-[14px] text-muted-foreground">{q.explanation}</p>}
              {pq && pq.answered > 0 && (
                <div className="mt-3 flex items-center gap-3">
                  <Progress value={(100 * pq.correct) / pq.answered} className="h-2 flex-1" barClassName="bg-success" label={`Question ${i + 1}: right answers`} />
                  <span className="shrink-0 text-[13px] tabular text-muted-foreground">
                    {pq.correct}/{pq.answered} right
                  </span>
                </div>
              )}
            </div>
          );
        })}
        <Button variant="outline" onClick={() => setReveal((r) => !r)}>
          <Eye /> {reveal ? 'Hide the answers' : 'Show the answers'}
        </Button>
      </section>

      <aside className="min-w-0 space-y-4">
        {!ended && (
          <div className="flex gap-1 rounded-xl border border-border bg-muted/60 p-1" role="tablist" aria-label="How the class answers">
            <button type="button" role="tab" aria-selected={mode === 'devices'} onClick={() => setMode('devices')} className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-medium', mode === 'devices' ? 'bg-card shadow-soft' : 'text-muted-foreground')}>
              <Smartphone className="size-4" /> On their devices
            </button>
            <button type="button" role="tab" aria-selected={mode === 'hands'} onClick={() => setMode('hands')} className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-medium', mode === 'hands' ? 'bg-card shadow-soft' : 'text-muted-foreground')}>
              <Hand className="size-4" /> No devices
            </button>
          </div>
        )}

        {!ended && mode === 'devices' && (
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            {open && live ? (
              <>
                <p className="flex items-center gap-2 text-[13px] font-medium text-danger">
                  <Radio className="size-4 animate-pulse" /> Live — students are answering
                </p>
                <p className="text-[14px]">
                  Students open <span className="font-medium">My lessons → Class check-in</span> and type <span className="font-mono text-[18px] font-bold tracking-[0.15em]">{v.code}</span>
                </p>
                <div>
                  <p className="font-display text-4xl font-semibold tabular">
                    {live.responses}
                    <span className="text-[16px] font-normal text-muted-foreground"> / {v.present ?? live.classSize} answered</span>
                  </p>
                  <Progress value={(100 * live.responses) / Math.max(1, v.present ?? live.classSize)} className="mt-2 h-2" label="Responses" />
                </div>
                {live.responses > 0 && (
                  <p className="text-[14px]">
                    <span className="font-semibold">{live.understood}</span> understood (scored {v.module.passMark}%+) · average {live.percent}%
                  </p>
                )}
                {live.respondents.length > 0 && (
                  <ul className="max-h-40 space-y-0.5 overflow-y-auto text-[12.5px] text-muted-foreground">
                    {live.respondents.map((r) => (
                      <li key={r.studentId} className="flex justify-between gap-2">
                        <span className="truncate">{r.name}</span>
                        <span className="tabular">{r.percent}%</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Button variant="brand" size="lg" className="w-full" loading={act.isPending} onClick={() => act.mutate({ kind: 'close' }, { onError: err })}>
                  Close and see results
                </Button>
              </>
            ) : (
              <>
                <p className="text-[14px]">Students answer on their own phones, tablets or laptops. You see the responses come in here.</p>
                <Button variant="brand" size="lg" className="w-full" loading={act.isPending} onClick={() => (setReveal(false), act.mutate({ kind: 'open', stepId: step.id }, { onError: err }))}>
                  <Radio /> {result ? 'Run the check-in again' : 'Start the live check-in'}
                </Button>
              </>
            )}
          </div>
        )}

        {!ended && mode === 'hands' && <HandsPanel v={v} step={step} />}

        {result && <ResultCard result={result} inClass={v.present ?? v.students.length} onDecide={ended ? undefined : (d) => act.mutate({ kind: 'decision', stepId: step.id, decision: d }, { onError: err })} pending={act.isPending} />}
      </aside>
    </div>
  );
}

function ResultCard({ result, inClass, onDecide, pending }: { result: SessionStepResult; inClass: number; onDecide?: (d: 'MOVE_ON' | 'RETEACH') => void; pending?: boolean }) {
  const share = result.responses ? Math.round((100 * result.understood) / result.responses) : 0;
  const move = result.suggestion === 'MOVE_ON';
  return (
    <div className={cn('space-y-3 rounded-2xl border p-4', move ? 'border-success/40 bg-success-soft/40' : 'border-warning/40 bg-warning-soft/40')}>
      <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
        {result.mode === 'DEVICES' ? 'Live check-in' : result.mode === 'HANDS' ? 'Show of hands' : 'Marked by you'}
        {result.rounds > 1 ? ` · round ${result.rounds}` : ''}
      </p>
      <p className="font-display text-3xl font-semibold tabular">
        {result.understood}/{result.responses} <span className="text-[15px] font-normal text-muted-foreground">understood ({share}%)</span>
      </p>
      <p className="text-[14px]">
        Suggestion: <span className="font-semibold">{move ? 'move on' : 're-teach'}</span>
        <span className="text-muted-foreground"> — {move ? `at least ${Math.round(MOVE_ON_SHARE * 100)}% of the class got it.` : `fewer than ${Math.round(MOVE_ON_SHARE * 100)}% got it. Go over the key idea again, then check once more.`}</span>
      </p>
      {result.mode === 'DEVICES' && inClass > 0 && result.responses < inClass / 2 && (
        <p className="text-[12.5px] text-warning">Only {result.responses} of {inClass} students answered, so this may not reflect the whole class. Ask a few questions aloud before you decide.</p>
      )}
      {result.decision && (
        <Badge variant={result.decision === 'MOVE_ON' ? 'success' : 'warning'}>
          {result.decision === 'MOVE_ON' ? <Check /> : <RotateCcw />} You chose to {result.decision === 'MOVE_ON' ? 'move on' : 're-teach'}
        </Badge>
      )}
      {onDecide && (
        <div className="flex flex-wrap gap-2">
          <Button variant={move ? 'outline' : 'brand'} onClick={() => onDecide('RETEACH')} loading={pending}>
            <RotateCcw /> Re-teach
          </Button>
          <Button variant={move ? 'brand' : 'outline'} onClick={() => onDecide('MOVE_ON')} loading={pending}>
            Move on <ArrowRight />
          </Button>
        </div>
      )}
    </div>
  );
}

/** No devices: count hands for each question, or tick who got it. */
function HandsPanel({ v, step }: { v: ClassroomSessionView; step: ModuleStepRow }) {
  const act = useSessionAction(v.id);
  const [how, setHow] = useState<'count' | 'mark'>('count');
  const [present, setPresent] = useState(v.present ?? v.students.length);
  const [counts, setCounts] = useState<number[]>(() => step.questions.map(() => 0));
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const bump = (i: number, d: number) => setCounts((c) => c.map((x, j) => (j === i ? Math.max(0, Math.min(present, x + d)) : x)));
  const save = () =>
    act.mutate(
      {
        kind: 'hands',
        body: how === 'count' ? { stepId: step.id, present, correctCounts: counts } : { stepId: step.id, present, marks: Object.entries(marks).map(([studentId, understood]) => ({ studentId, understood })) },
      },
      { onSuccess: () => toast.success('Recorded'), onError: (e) => toast.error(errorMessage(e)) },
    );
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex gap-1.5">
        <Button size="sm" variant={how === 'count' ? 'secondary' : 'ghost'} onClick={() => setHow('count')}>
          Count hands
        </Button>
        <Button size="sm" variant={how === 'mark' ? 'secondary' : 'ghost'} onClick={() => setHow('mark')}>
          Mark each student
        </Button>
      </div>
      <label className="flex items-center justify-between gap-2 text-[13px]">
        Students in class
        <Input type="number" min={1} max={500} value={present} onChange={(e) => setPresent(Math.max(1, Number(e.target.value) || 1))} className="h-9 w-20 text-center" />
      </label>
      {how === 'count' ? (
        <>
          <p className="text-[12.5px] text-muted-foreground">Read each question out; count the hands up for the right answer.</p>
          <ul className="space-y-2">
            {step.questions.map((q, i) => (
              <li key={q.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {i + 1}. {q.prompt}
                </span>
                <Button variant="outline" size="icon-sm" onClick={() => bump(i, -1)} aria-label="One fewer">
                  <Minus />
                </Button>
                <Input value={counts[i]} inputMode="numeric" onChange={(e) => setCounts((c) => c.map((x, j) => (j === i ? Math.min(present, Number(e.target.value.replace(/\D/g, '')) || 0) : x)))} className="h-8 w-14 text-center tabular" aria-label={`Right answers for question ${i + 1}`} />
                <Button variant="outline" size="icon-sm" onClick={() => bump(i, 1)} aria-label="One more">
                  <Plus />
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="text-[12.5px] text-muted-foreground">Tap each student: got it, or not yet. These count towards their topic mastery.</p>
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {v.students.map((s) => {
              const m = marks[s.id];
              return (
                <li key={s.id} className="flex items-center gap-2 text-[13px]">
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <Button size="sm" variant={m === true ? 'brand' : 'outline'} onClick={() => setMarks((x) => ({ ...x, [s.id]: true }))} aria-pressed={m === true}>
                    <Check /> Got it
                  </Button>
                  <Button size="sm" variant={m === false ? 'destructive' : 'outline'} onClick={() => setMarks((x) => ({ ...x, [s.id]: false }))} aria-pressed={m === false}>
                    <X /> Not yet
                  </Button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <Button variant="brand" className="w-full" onClick={save} loading={act.isPending} disabled={how === 'mark' && !Object.keys(marks).length}>
        Record and see the suggestion
      </Button>
    </div>
  );
}
