import type { PracticeAttemptView, PracticeQuestion } from '@aischool/shared';
import { ArrowLeft, BookOpenCheck, Check, CheckCircle2, ChevronDown, CircleAlert, Loader2, MessageCircleQuestion, PenLine, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Markdown } from '@/components/ai/markdown';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { allowanceError, examLockError, useMarkTheory } from './api';
import { MODE_LABEL, scoreTone, UpgradeCard } from './components';

const draftKey = (id: string) => `aischool:theory-draft:${id}`;
const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function loadDraft(id: string): string[] | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : '')) : null;
  } catch {
    return null;
  }
}
function saveDraft(id: string, answers: string[]) {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify(answers));
  } catch {
    /* storage unavailable: the answers stay in memory */
  }
}
function clearDraft(id: string) {
  try {
    localStorage.removeItem(draftKey(id));
  } catch {
    /* ignore */
  }
}

const MARKING_STEPS = ['Reading your answers…', 'Checking each point against the marking guide…', 'Adding up your marks…', 'Writing feedback for you…'];

// ------------------------------------------------------------------ writing

export function TheoryWriter({ a }: { a: PracticeAttemptView }) {
  const [answers, setAnswers] = useState<string[]>(() => {
    const saved = loadDraft(a.id);
    return a.questions.map((q, i) => saved?.[i] || q.written || '');
  });
  const [confirm, setConfirm] = useState(false);
  const [step, setStep] = useState(0);
  const mark = useMarkTheory(a.id);
  const first = useRef(true);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Keep a draft on this device as the student writes.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      saveDraft(a.id, answers);
      setSavedAt(Date.now());
    }, 500);
    return () => clearTimeout(t);
  }, [a.id, answers]);

  // Marking takes a while: walk through what's happening.
  useEffect(() => {
    if (!mark.isPending) return setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, MARKING_STEPS.length - 1)), 6000);
    return () => clearInterval(t);
  }, [mark.isPending]);

  const answered = answers.filter((x) => x.trim()).length;
  const totalMarks = a.questions.reduce((t, q) => t + (q.marks ?? 0), 0);
  const upgrade = allowanceError(mark.error);
  const lock = examLockError(mark.error);

  const submit = () => {
    setConfirm(false);
    saveDraft(a.id, answers);
    mark.mutate(answers, { onSuccess: () => clearDraft(a.id) });
  };

  if (mark.isPending) {
    return (
      <Card className="mt-6 flex flex-col items-center gap-4 p-8 text-center" role="status" aria-live="polite">
        <div className="relative grid size-16 place-items-center rounded-2xl bg-ai-gradient text-white">
          <Loader2 className="size-7 animate-spin" aria-hidden />
        </div>
        <div>
          <p className="font-display text-lg font-semibold tracking-tight">Marking your answers</p>
          <p className="mt-1 text-[13.5px] text-muted-foreground">{MARKING_STEPS[step]}</p>
        </div>
        <p className="max-w-sm text-[12.5px] text-muted-foreground">This usually takes 10–30 seconds. Please keep this page open — your answers are saved on this device.</p>
      </Card>
    );
  }

  return (
    <>
      <div className="sticky top-14 z-10 -mx-4 mb-5 border-b border-border bg-background/85 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[15px] font-semibold tracking-tight">{a.title}</p>
            <p className="text-[12px] text-muted-foreground">
              {MODE_LABEL.THEORY} · {answered}/{a.questions.length} answered · {totalMarks} marks{savedAt ? ' · draft saved' : ''}
            </p>
          </div>
          <Button size="sm" onClick={() => setConfirm(true)} disabled={answered === 0} className="shrink-0">
            <Check /> <span className="hidden sm:inline">Submit for marking</span>
            <span className="sm:hidden">Submit</span>
          </Button>
        </div>
        <Progress value={(answered / Math.max(1, a.questions.length)) * 100} className="mt-2.5" label="Answered" />
      </div>

      <p className="mb-4 flex items-start gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-[12.5px] text-muted-foreground">
        <PenLine className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>Answer in full sentences and make each point clearly — marks are awarded for every point in the marking guide your answer makes. Use (a), (b)… where the question has parts.</span>
      </p>

      <ol className="space-y-4">
        {a.questions.map((q, i) => (
          <li key={i}>
            <Card className="p-4 sm:p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
                <span className="font-medium">
                  Question {i + 1} of {a.questions.length}
                </span>
                <Badge variant="secondary" className="tabular">
                  {q.marks ?? 0} {q.marks === 1 ? 'mark' : 'marks'}
                </Badge>
              </div>
              {q.topic && <p className="-mt-1 mb-2 text-[12px] text-muted-foreground [overflow-wrap:anywhere]">{q.topic}</p>}
              <p className="whitespace-pre-wrap text-[15px] font-medium leading-relaxed [overflow-wrap:anywhere]">{q.stem}</p>
              <label htmlFor={`ans-${i}`} className="sr-only">
                Your answer to question {i + 1}
              </label>
              <Textarea
                id={`ans-${i}`}
                value={answers[i] ?? ''}
                onChange={(e) => setAnswers((x) => x.map((v, j) => (j === i ? e.target.value : v)))}
                placeholder="Write your answer here…"
                maxLength={10_000}
                className="mt-4 min-h-[220px] text-[15px] sm:min-h-[260px]"
                spellCheck
              />
              <p className="mt-1.5 text-right text-[11.5px] tabular text-muted-foreground">{words(answers[i] ?? '')} words</p>
            </Card>
          </li>
        ))}
      </ol>

      {upgrade ? (
        <UpgradeCard error={upgrade} className="mt-5" onClose={() => mark.reset()} />
      ) : lock ? (
        <p className="mt-5 rounded-xl border border-warning/30 bg-warning-soft/60 p-3 text-[13px] text-warning">{lock.message}</p>
      ) : mark.error ? (
        <p className="mt-5 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{errorMessage(mark.error)} Your answers are still here — try again.</p>
      ) : null}

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12px] text-muted-foreground">Drafts are kept on this device until you submit.</p>
        <Button onClick={() => setConfirm(true)} disabled={answered === 0} className="w-full sm:w-auto">
          <Sparkles /> Submit for marking
        </Button>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Submit for marking?"
        description={
          answered < a.questions.length
            ? `You’ve answered ${answered} of ${a.questions.length}. Blank answers score zero. You can’t change your answers after marking.`
            : 'AI will mark each answer against the marking guide. You can’t change your answers after marking.'
        }
        confirmLabel="Submit"
        destructive={false}
        onConfirm={submit}
      />
    </>
  );
}

// ------------------------------------------------------------------ results

export function TheoryResults({ a }: { a: PracticeAttemptView }) {
  const pct = a.percent ?? 0;
  const scored = a.questions.reduce((t, q) => t + (q.marking?.score ?? 0), 0);
  const message = pct >= 75 ? 'Excellent writing — examiners would be pleased.' : pct >= 60 ? 'Solid answers. Tighten the points you missed.' : pct >= 45 ? 'A fair start. The marking guide shows what earns the rest.' : 'Keep going — study the guide and model answers below.';
  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/learn/exams" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Exam Academy
          </Link>
        }
        title={a.title}
        description={`${MODE_LABEL.THEORY}${a.subject ? ` · ${a.subject}` : ''}`}
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
                {fmt(scored)}/{a.total} marks
              </p>
            </div>
          </div>
          <div className="min-w-0 text-center sm:text-left">
            <p className="font-display text-lg font-semibold tracking-tight">{message}</p>
            <ul className="mt-3 space-y-2">
              {a.questions.map((q) => {
                const m = q.marking;
                const p = m && m.outOf ? Math.round((m.score / m.outOf) * 100) : 0;
                return (
                  <li key={q.index} className="text-[13px]">
                    <div className="flex justify-between gap-2">
                      <span>Question {q.index + 1}</span>
                      <span className={cn('shrink-0 tabular font-medium', scoreTone(m ? p : null))}>{m ? `${fmt(m.score)}/${m.outOf}` : '—'}</span>
                    </div>
                    <Progress value={p} className="mt-1" barClassName={p >= 70 ? 'bg-success' : p >= 50 ? 'bg-warning' : 'bg-danger'} label={`Question ${q.index + 1}`} />
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
        {a.review && (
          <div className="border-t border-border bg-ai-2/[0.04] p-5 sm:p-6">
            <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-ai-2">
              <Sparkles className="size-3.5" aria-hidden /> The examiner’s overall comment
            </p>
            <Markdown text={a.review} />
          </div>
        )}
      </Card>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[15px] font-semibold tracking-tight">Your answers, marked</h2>
        <Button asChild variant="outline" size="sm">
          <Link to="/learn/tutor">
            <MessageCircleQuestion /> Ask my tutor
          </Link>
        </Button>
      </div>
      <ol className="space-y-4">
        {a.questions.map((q) => (
          <li key={q.index}>
            <MarkedQuestion q={q} />
          </li>
        ))}
      </ol>
      <p className="mt-4 text-center text-[11.5px] text-muted-foreground">Marked by AI against the marking guide. Treat the score as a strong guide, not an official grade.</p>
    </>
  );
}

function MarkedQuestion({ q }: { q: PracticeQuestion }) {
  const m = q.marking;
  const p = m && m.outOf ? (m.score / m.outOf) * 100 : 0;
  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-muted-foreground">
          Question {q.index + 1}
          {q.topic ? ` · ${q.topic}` : ''}
        </span>
        {m ? (
          <Badge variant={p >= 70 ? 'success' : p >= 50 ? 'warning' : 'danger'} className="tabular">
            {fmt(m.score)}/{m.outOf} {m.outOf === 1 ? 'mark' : 'marks'}
          </Badge>
        ) : (
          <Badge variant="outline">{q.marks ?? 0} {q.marks === 1 ? 'mark' : 'marks'}</Badge>
        )}
      </div>
      <p className="whitespace-pre-wrap text-[14.5px] font-medium [overflow-wrap:anywhere]">{q.stem}</p>

      <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
        <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Your answer</p>
        {q.written?.trim() ? <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed [overflow-wrap:anywhere]">{q.written}</p> : <p className="text-[13px] italic text-muted-foreground">No answer written.</p>}
      </div>

      {m && (
        <div className="mt-3 grid gap-3">
          {m.strengths.length > 0 && (
            <div>
              <p className="mb-1 text-[12.5px] font-semibold text-success">What earned marks</p>
              <ul className="space-y-1">
                {m.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] [overflow-wrap:anywhere]">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden /> <span className="min-w-0">{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {m.missing.length > 0 && (
            <div>
              <p className="mb-1 text-[12.5px] font-semibold text-warning">Points you missed</p>
              <ul className="space-y-1">
                {m.missing.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] [overflow-wrap:anywhere]">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden /> <span className="min-w-0">{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {m.feedback && (
            <p className="flex items-start gap-2 rounded-lg bg-ai-2/[0.06] px-3 py-2 text-[13px] [overflow-wrap:anywhere]">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-ai-2" aria-hidden /> <span className="min-w-0">{m.feedback}</span>
            </p>
          )}
        </div>
      )}

      {q.markingGuide && (
        <Reveal title="Marking guide" icon={<BookOpenCheck className="size-4 text-brand" aria-hidden />}>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed [overflow-wrap:anywhere]">{q.markingGuide}</p>
        </Reveal>
      )}
      {q.explanation && (
        <Reveal title="Model answer" icon={<PenLine className="size-4 text-brand" aria-hidden />}>
          <Markdown text={q.explanation} className="text-[13px] [overflow-wrap:anywhere]" />
        </Reveal>
      )}
    </Card>
  );
}

function Reveal({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <details className="group mt-3 rounded-xl border border-border">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-[13px] font-medium [&::-webkit-details-marker]:hidden">
        {icon}
        <span className="flex-1">{title}</span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-border px-3 py-3">{children}</div>
    </details>
  );
}
