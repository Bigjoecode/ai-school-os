import { PRACTICAL_KIND_LABELS, type PracticalCheckResult, type PracticalLessonView } from '@aischool/shared';
import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, Calculator, CheckCircle2, ClipboardList, Eye, FlaskConical, GraduationCap, Lightbulb, ListOrdered, Lock, Microscope, PenLine, ShieldAlert, Target, Timer, XCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { examLockError } from '../learning/api';
import { SectionTitle, minutesText, scoreTone } from '../learning/components';
import { usePracticalCheck, usePracticalLesson, usePracticalPractice, useStartLab } from './api';
import { StatusBadges, subjectPath } from './hub-page';

/** A practical lesson: the guided walk-through, quick checks, WAEC practical questions and the virtual lab. */
export default function PracticalLessonPage() {
  const { id = '' } = useParams();
  const q = usePracticalLesson(id);
  const d = q.data;
  return (
    <Page className="max-w-5xl">
      {q.error && !d ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <div className="space-y-4">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      ) : (
        <Lesson d={d} />
      )}
    </Page>
  );
}

function List({ items, ordered }: { items: string[]; ordered?: boolean }) {
  const Tag = ordered ? 'ol' : 'ul';
  return (
    <Tag className={cn('space-y-1 pl-5 text-[13.5px] leading-relaxed', ordered ? 'list-decimal' : 'list-disc')}>
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </Tag>
  );
}

function Section({ icon, title, children, tone }: { icon: typeof BookOpen; title: string; children: ReactNode; tone?: 'warning' | 'danger' | 'info' }) {
  return (
    <Card className={cn('p-5', tone === 'warning' && 'border-warning/30', tone === 'danger' && 'border-danger/30')}>
      <SectionTitle icon={icon} title={title} />
      {children}
    </Card>
  );
}

function Lesson({ d }: { d: PracticalLessonView }) {
  const [step, setStep] = useState(0);
  const [allSteps, setAllSteps] = useState(false);
  return (
    <>
      <PageHeader
        eyebrow={
          <Link to={subjectPath(d.subject)} className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="size-3" aria-hidden /> {d.subject} practicals
          </Link>
        }
        title={d.title}
        description={d.parentTopic ? `${d.parentTopic} · ${d.topic}` : d.topic}
      />
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">{PRACTICAL_KIND_LABELS[d.kind]}</Badge>
        {d.skills.map((s) => (
          <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[11.5px] capitalize text-muted-foreground">
            {s}
          </span>
        ))}
        <StatusBadges s={d.status} lab={!!d.lab} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start [&>*]:min-w-0">
        <div className="space-y-4">
          <Section icon={Target} title="Aim">
            <p className="text-[14px] leading-relaxed">{d.aim}</p>
          </Section>
          {(d.apparatus.length > 0 || d.materials.length > 0) && (
            <Section icon={FlaskConical} title="Apparatus and materials">
              <div className="grid gap-4 sm:grid-cols-2">
                {d.apparatus.length > 0 && (
                  <div>
                    <p className="mb-1 text-[12px] font-medium text-muted-foreground">Apparatus</p>
                    <List items={d.apparatus} />
                  </div>
                )}
                {d.materials.length > 0 && (
                  <div>
                    <p className="mb-1 text-[12px] font-medium text-muted-foreground">Materials</p>
                    <List items={d.materials} />
                  </div>
                )}
              </div>
            </Section>
          )}
          {d.safety.length > 0 && (
            <Section icon={ShieldAlert} title="Safety" tone="danger">
              <List items={d.safety} />
            </Section>
          )}
          {d.procedure.length > 0 && (
            <Section icon={ListOrdered} title="Procedure">
              {allSteps ? (
                <List items={d.procedure} ordered />
              ) : (
                <div>
                  <p className="text-[12px] font-medium text-muted-foreground">
                    Step {step + 1} of {d.procedure.length}
                  </p>
                  <p className="mt-1 min-h-[3.5rem] text-[15px] leading-relaxed">{d.procedure[step]}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
                      <ArrowLeft /> Back
                    </Button>
                    <Button size="sm" onClick={() => setStep((s) => Math.min(d.procedure.length - 1, s + 1))} disabled={step >= d.procedure.length - 1}>
                      Next step <ArrowRight />
                    </Button>
                    <div className="ml-1 flex gap-1" aria-hidden>
                      {d.procedure.map((_, i) => (
                        <span key={i} className={cn('h-1.5 w-4 rounded-full', i <= step ? 'bg-brand' : 'bg-muted')} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <button type="button" className="mt-3 text-[12.5px] font-medium text-brand hover:underline" onClick={() => setAllSteps((a) => !a)}>
                {allSteps ? 'Step by step' : 'Show all steps'}
              </button>
            </Section>
          )}
          {d.expectedObservations && (
            <Section icon={Eye} title="What you should see">
              <p className="whitespace-pre-line text-[13.5px] leading-relaxed">{d.expectedObservations}</p>
            </Section>
          )}
          {d.dataAndCalculations && (
            <Section icon={Calculator} title="Results and worked calculation">
              <p className="whitespace-pre-line rounded-xl bg-muted/60 p-3 text-[13.5px] leading-relaxed">{d.dataAndCalculations}</p>
            </Section>
          )}
          {d.precautions.length > 0 && (
            <Section icon={CheckCircle2} title="Precautions">
              <List items={d.precautions} />
            </Section>
          )}
          {d.sourcesOfError.length > 0 && (
            <Section icon={AlertTriangle} title="Sources of error">
              <List items={d.sourcesOfError} />
            </Section>
          )}
          {d.commonMistakes.length > 0 && (
            <Section icon={XCircle} title="Common mistakes" tone="warning">
              <List items={d.commonMistakes} />
            </Section>
          )}
          {d.examTips.length > 0 && (
            <Section icon={Lightbulb} title="WAEC exam tips">
              <List items={d.examTips} />
            </Section>
          )}
          {d.checkQuestions.length > 0 && <QuickCheck d={d} />}
        </div>

        <div className="space-y-4 lg:sticky lg:top-4">
          {d.lab && <LabCard d={d} />}
          <PracticeCard d={d} />
          {d.practicalPaper && (
            <Card className="p-4">
              <SectionTitle icon={GraduationCap} title={`How ${d.exam} tests it`} />
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">{d.practicalPaper}</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function QuickCheck({ d }: { d: PracticalLessonView }) {
  const [answers, setAnswers] = useState<number[]>(() => d.checkQuestions.map(() => -1));
  const [result, setResult] = useState<PracticalCheckResult | null>(null);
  const check = usePracticalCheck(d.id);
  return (
    <Section icon={ClipboardList} title="Quick check">
      <ol className="space-y-4">
        {d.checkQuestions.map((c, i) => {
          const r = result?.items[i];
          return (
            <li key={i}>
              <p className="text-[14px] font-medium">
                {i + 1}. {c.q}
              </p>
              <div className="mt-2 grid gap-1.5">
                {c.options.map((o, k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={!!result}
                    onClick={() => setAnswers((a) => a.map((x, j) => (j === i ? k : x)))}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-left text-[13.5px] transition-colors',
                      r ? (k === r.answer ? 'border-success bg-success-soft' : answers[i] === k ? 'border-danger bg-danger-soft' : 'border-border') : answers[i] === k ? 'border-brand bg-brand-soft' : 'border-border hover:bg-muted/60',
                    )}
                    aria-pressed={answers[i] === k}
                  >
                    {String.fromCharCode(65 + k)}. {o}
                  </button>
                ))}
              </div>
              {r && r.explanation && <p className="mt-2 text-[12.5px] text-muted-foreground">{r.explanation}</p>}
            </li>
          );
        })}
      </ol>
      {check.error && <p className="mt-3 text-[13px] text-danger">{errorMessage(check.error)}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {result ? (
          <>
            <p className={cn('font-display text-[15px] font-semibold', result.passed ? 'text-success' : 'text-warning')}>
              {result.correct}/{result.total} — {result.passed ? 'learned!' : 'have another look at the lesson'}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setResult(null);
                setAnswers(d.checkQuestions.map(() => -1));
              }}
            >
              Try again
            </Button>
          </>
        ) : (
          <Button size="sm" disabled={answers.some((a) => a < 0)} loading={check.isPending} onClick={() => check.mutate(answers, { onSuccess: setResult })}>
            Check my answers
          </Button>
        )}
      </div>
    </Section>
  );
}

function LabCard({ d }: { d: PracticalLessonView }) {
  const navigate = useNavigate();
  const start = useStartLab();
  const lab = d.lab!;
  const lock = examLockError(start.error);
  const go = (mode: 'LAB' | 'EXAM') => start.mutate({ practicalId: d.id, mode }, { onSuccess: (a) => navigate(`/learn/practicals/labs/${a.id}`) });
  return (
    <Card className="border-ai-2/30 p-4">
      <SectionTitle icon={Microscope} title="Virtual lab" />
      <p className="text-[13px] text-muted-foreground">
        {lab.title}: a new set of solutions and values every time, marked out of {lab.maxScore} like a WAEC practical.
      </p>
      <div className="mt-3 grid gap-2">
        <Button onClick={() => go('LAB')} loading={start.isPending && start.variables?.mode === 'LAB'} disabled={!d.access.entitled && d.access.freeLabsLeft === 0}>
          <FlaskConical /> Practise (untimed)
        </Button>
        <Button variant="outline" onClick={() => go('EXAM')} loading={start.isPending && start.variables?.mode === 'EXAM'} disabled={!d.access.entitled} title={d.access.entitled ? undefined : 'Timed practical exams come with WAEC Prep'}>
          {d.access.entitled ? <Timer /> : <Lock />} Exam mode ({minutesText(lab.minutes)})
        </Button>
      </div>
      {!d.access.entitled && (
        <p className="mt-2 text-[12px] text-muted-foreground">
          {d.access.freeLabsLeft} of {d.access.freeLabsPerTerm} free practice labs left this term. WAEC Prep unlocks unlimited labs and timed exam mode.
        </p>
      )}
      {start.error && <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{lock?.message ?? errorMessage(start.error)}</p>}
      <details className="mt-3 text-[12.5px]">
        <summary className="cursor-pointer font-medium">Marking scheme</summary>
        <ul className="mt-2 space-y-1">
          {lab.rubric.map((c) => (
            <li key={c.id} className="flex justify-between gap-2">
              <span>{c.label}</span>
              <span className="tabular text-muted-foreground">{c.marks}</span>
            </li>
          ))}
        </ul>
      </details>
      {d.attempts.length > 0 && (
        <ul className="mt-3 divide-y divide-border border-t border-border">
          {d.attempts.slice(0, 5).map((a) => (
            <li key={a.id}>
              <Link to={`/learn/practicals/labs/${a.id}`} className="flex items-center justify-between gap-2 py-2 text-[12.5px] hover:underline">
                <span>
                  {a.mode === 'EXAM' ? 'Exam' : 'Practice'} · {formatRelative(a.submittedAt ?? a.startedAt)}
                  {a.reviewed && <span className="ml-1 text-success">· reviewed</span>}
                </span>
                {a.percent !== null ? <span className={cn('font-semibold tabular', scoreTone(a.percent))}>{a.percent}%</span> : <Badge variant="info">Continue</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PracticeCard({ d }: { d: PracticalLessonView }) {
  const navigate = useNavigate();
  const practise = usePracticalPractice(d.id);
  const lock = examLockError(practise.error) ?? (d.access.entitled ? null : { message: 'AI-marked practical questions come with WAEC Prep.' });
  const n = d.practicalQuestions;
  return (
    <Card className="p-4">
      <SectionTitle icon={PenLine} title="WAEC practical questions" />
      <p className="text-[13px] text-muted-foreground">
        {n.subject === 0
          ? `No ${d.subject} practical questions are published yet.`
          : `${n.topic ? `${n.topic} on this topic` : 'None on this topic yet'} · ${n.subject} in ${d.subject}. Write your answers; AI marks them against the WAEC-style marking guide.`}
      </p>
      {n.pastYears.length > 0 && <p className="mt-1 text-[12px] text-muted-foreground">Includes past questions from {n.pastYears.slice(0, 6).join(', ')}.</p>}
      <Button className="mt-3 w-full" variant="outline" disabled={!n.subject || !d.access.entitled} loading={practise.isPending} onClick={() => practise.mutate(2, { onSuccess: (a) => navigate(`/learn/attempts/${a.id}`) })}>
        {d.access.entitled ? <PenLine /> : <Lock />} Practise 2 questions
      </Button>
      {lock && <p className="mt-2 text-[12px] text-muted-foreground">{lock.message}</p>}
      {practise.error && !examLockError(practise.error) && <p className="mt-2 text-[12px] text-danger">{errorMessage(practise.error)}</p>}
    </Card>
  );
}
