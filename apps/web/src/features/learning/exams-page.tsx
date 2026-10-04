import { ENTITLEMENTS, examEntitlement, type ExamBody, type ExamCatalog } from '@aischool/shared';
import { CheckCircle2, Clock, GraduationCap, HeartHandshake, Lock, PenLine, School, Sparkles, Target, Timer, Trophy } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { examLockError, useAttempts, useExamCatalog, useStartExam, useStartTheory } from './api';
import { AttemptList, SectionTitle } from './components';

type Exam = ExamCatalog['exams'][number];
type StartMode = 'PRACTICE' | 'MOCK' | 'THEORY';

export default function ExamsPage() {
  const cat = useExamCatalog();
  const attempts = useAttempts();
  const [start, setStart] = useState<{ exam: Exam; mode: StartMode } | null>(null);
  const fp = cat.data?.freePractice;
  const freeLeft = fp ? Math.max(0, fp.setsPerTerm - fp.used) : 0;
  const examAttempts = (attempts.data ?? []).filter((a) => a.exam);

  return (
    <Page className="max-w-6xl">
      <PageHeader eyebrow="Learning" title="Exam Academy" description="Real past-question practice and timed mocks for BECE, WAEC, NECO and JAMB — with explanations for every answer." />
      {cat.error && !cat.data ? (
        <ErrorState error={cat.error} onRetry={() => void cat.refetch()} />
      ) : !cat.data ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {fp && cat.data.exams.some((e) => !e.entitled) && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-[13px] shadow-soft">
              <Target className="size-4 shrink-0 text-brand" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="font-medium">Free practice:</span> {freeLeft} of {fp.setsPerTerm} sets left this term ({fp.questionsPerSet} questions each) for exams you don’t have Prep for.
              </span>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
            {cat.data.exams.map((e) => (
              <ExamCard key={e.exam} exam={e} freeLeft={freeLeft} onStart={(mode) => setStart({ exam: e, mode })} />
            ))}
          </div>
          <Card className="p-5">
            <SectionTitle icon={Trophy} title="Your exam practice" />
            {attempts.isLoading ? <Skeleton className="h-24" /> : <AttemptList rows={examAttempts} empty="No exam practice yet. Start a set above — it only takes a few minutes." />}
          </Card>
        </div>
      )}
      {start && start.mode === 'THEORY' && <TheoryDialog key={`${start.exam.exam}-theory`} exam={start.exam} onClose={() => setStart(null)} />}
      {start && start.mode !== 'THEORY' && <StartDialog key={`${start.exam.exam}-${start.mode}`} exam={start.exam} mode={start.mode} freeQuestions={fp?.questionsPerSet ?? 5} onClose={() => setStart(null)} />}
    </Page>
  );
}

function ExamCard({ exam, freeLeft, onStart }: { exam: Exam; freeLeft: number; onStart: (mode: StartMode) => void }) {
  const total = exam.subjects.reduce((t, s) => t + s.questions, 0);
  const ent = ENTITLEMENTS[examEntitlement(exam.exam)];
  return (
    <Card className={cn('flex flex-col p-5', !exam.entitled && 'bg-card/70')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn('grid size-11 shrink-0 place-items-center rounded-xl font-display text-[13px] font-bold', exam.entitled ? 'bg-ai-gradient text-white' : 'bg-muted text-muted-foreground')}>{exam.exam}</div>
          <div className="min-w-0">
            <p className="font-display text-[16px] font-semibold tracking-tight">{exam.label}</p>
            <p className="text-[12.5px] text-muted-foreground">
              {exam.subjects.length} subjects · {total} questions
            </p>
          </div>
        </div>
        {exam.entitled ? (
          <Badge variant="success">
            <CheckCircle2 /> {ent.label}
          </Badge>
        ) : (
          <Badge variant="outline">
            <Lock /> Free practice
          </Badge>
        )}
      </div>
      <ul className="mt-4 flex flex-wrap gap-1.5">
        {exam.subjects.map((s) => (
          <li key={s.subject} className="rounded-full bg-muted px-2.5 py-1 text-[12px]">
            {s.subject} <span className="tabular text-muted-foreground">· {s.questions}</span>
          </li>
        ))}
      </ul>
      {exam.entitled && (
        <p className="mt-4 flex items-start gap-1.5 rounded-xl bg-success-soft/60 p-3 text-[12.5px] text-success">
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Unlimited practice, timed mocks and AI-marked theory practice are unlocked. Good luck!
        </p>
      )}
      {!exam.entitled && (
        <div className="mt-4 rounded-xl border border-dashed border-border p-3 text-[12.5px] text-muted-foreground">
          <p className="font-medium text-foreground">{ent.label} unlocks unlimited practice, timed mocks and AI-marked theory</p>
          <p className="mt-1 flex items-start gap-1.5">
            <HeartHandshake className="mt-0.5 size-3.5 shrink-0" aria-hidden /> A parent can add it from the Family page.
          </p>
          <p className="mt-0.5 flex items-start gap-1.5">
            <School className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Your school may sponsor it for your class.
          </p>
        </div>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <Button variant={exam.entitled ? 'outline' : 'default'} onClick={() => onStart('PRACTICE')} disabled={!exam.entitled && freeLeft === 0} className="flex-1 sm:flex-none">
          <Target /> Practise
        </Button>
        {exam.entitled ? (
          <Button onClick={() => onStart('MOCK')} className="flex-1 sm:flex-none">
            <Timer /> Timed mock
          </Button>
        ) : (
          <Button variant="outline" disabled className="flex-1 sm:flex-none" title={`Timed mocks come with ${ent.label}`}>
            <Lock /> Timed mock
          </Button>
        )}
        <Button variant="outline" onClick={() => onStart('THEORY')} className="w-full sm:w-auto" title={exam.entitled ? 'Write full answers; AI marks them against the marking guide' : `Theory practice comes with ${ent.label}`}>
          {exam.entitled ? <PenLine /> : <Lock />} Theory practice <span className="font-normal text-muted-foreground">(AI-marked)</span>
        </Button>
      </div>
    </Card>
  );
}

function StartDialog({ exam, mode, freeQuestions, onClose }: { exam: Exam; mode: 'PRACTICE' | 'MOCK'; freeQuestions: number; onClose: () => void }) {
  const navigate = useNavigate();
  const startExam = useStartExam();
  const [subjects, setSubjects] = useState<string[]>(exam.subjects.slice(0, 1).map((s) => s.subject));
  const options = exam.entitled ? (mode === 'MOCK' ? [20, 40, 60] : [10, 20, 40]) : [freeQuestions];
  const [count, setCount] = useState(options[0]!);
  const lock = examLockError(startExam.error);
  const toggle = (s: string) => setSubjects((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s].slice(0, 4)));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-2 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand [&_svg]:size-5">{mode === 'MOCK' ? <Clock /> : <GraduationCap />}</div>
          <DialogTitle>
            {exam.label} {mode === 'MOCK' ? 'timed mock' : 'practice'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'MOCK' ? 'Like the real thing: the clock runs and your answers are handed in when time is up. Your progress saves as you go.' : 'Take your time — you’ll see the right answers and explanations at the end.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <div>
            <p className="mb-2 text-[13px] font-medium">Subjects <span className="font-normal text-muted-foreground">(up to 4)</span></p>
            <div className="flex flex-wrap gap-1.5">
              {exam.subjects.map((s) => {
                const on = subjects.includes(s.subject);
                return (
                  <button
                    key={s.subject}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(s.subject)}
                    className={cn('rounded-full border px-3 py-1.5 text-[13px] transition-colors', on ? 'border-brand bg-brand-soft text-brand' : 'border-border hover:bg-muted')}
                  >
                    {s.subject}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[13px] font-medium">Questions</p>
            <div className="flex gap-2">
              {options.map((n) => (
                <Button key={n} type="button" size="sm" variant={count === n ? 'default' : 'outline'} aria-pressed={count === n} onClick={() => setCount(n)}>
                  {n}
                </Button>
              ))}
            </div>
            {!exam.entitled && <p className="mt-2 text-[12px] text-muted-foreground">Free practice sets have {freeQuestions} questions.</p>}
          </div>
          {lock ? (
            <div className="rounded-xl border border-warning/30 bg-warning-soft/60 p-3 text-[13px]">
              <p className="font-medium text-warning">{lock.message}</p>
              <p className="mt-1 text-muted-foreground">Ask a parent — they can add {ENTITLEMENTS[examEntitlement(lock.exam as ExamBody)]?.label ?? 'Exam Prep'} from the Family page, or your school may sponsor it.</p>
            </div>
          ) : startExam.error ? (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{errorMessage(startExam.error)}</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={startExam.isPending}
            disabled={subjects.length === 0}
            onClick={() => startExam.mutate({ mode, exam: exam.exam, subjects, questions: count }, { onSuccess: (a) => navigate(`/learn/attempts/${a.id}`) })}
          >
            {mode === 'MOCK' ? 'Start the clock' : 'Start practice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Written answers marked by AI against the marking guide (one subject, 1–5 questions). */
function TheoryDialog({ exam, onClose }: { exam: Exam; onClose: () => void }) {
  const navigate = useNavigate();
  const start = useStartTheory();
  const [subject, setSubject] = useState(exam.subjects[0]?.subject ?? '');
  const [count, setCount] = useState(2);
  const ent = ENTITLEMENTS[examEntitlement(exam.exam)];
  const lock = examLockError(start.error) ?? (exam.entitled ? null : { exam: exam.exam, message: `Theory practice with AI marking comes with ${ent.label}.` });
  const noQuestions = start.error instanceof ApiError && start.error.status === 400;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-2 grid size-10 place-items-center rounded-xl bg-ai-2/10 text-ai-2 [&_svg]:size-5">
            <PenLine />
          </div>
          <DialogTitle>{exam.label} theory practice</DialogTitle>
          <DialogDescription>Write full answers the way you would in the exam hall. AI marks each one against the official-style marking guide and shows you what earned marks and what was missing.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          {exam.subjects.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No {exam.label} subjects have questions yet. Check back soon.</p>
          ) : (
            <div>
              <p className="mb-2 text-[13px] font-medium">Subject</p>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Subject">
                {exam.subjects.map((s) => {
                  const on = subject === s.subject;
                  return (
                    <button
                      key={s.subject}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => (setSubject(s.subject), start.reset())}
                      className={cn('rounded-full border px-3 py-1.5 text-[13px] transition-colors', on ? 'border-brand bg-brand-soft text-brand' : 'border-border hover:bg-muted')}
                    >
                      {s.subject}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <p className="mb-2 text-[13px] font-medium">Questions</p>
            <div className="flex gap-2">
              {[1, 2, 3, 5].map((n) => (
                <Button key={n} type="button" size="sm" variant={count === n ? 'default' : 'outline'} aria-pressed={count === n} onClick={() => setCount(n)}>
                  {n}
                </Button>
              ))}
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-[12px] text-muted-foreground">
              <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Marking uses one session of your AI learning allowance. Allow about 10–15 minutes per question.
            </p>
          </div>
          {lock ? (
            <div className="rounded-xl border border-warning/30 bg-warning-soft/60 p-3 text-[13px]">
              <p className="font-medium text-warning">{lock.message}</p>
              <p className="mt-1 text-muted-foreground">Ask a parent — they can add {ENTITLEMENTS[examEntitlement(lock.exam)]?.label ?? 'Exam Prep'} from the Family page, or your school may sponsor it.</p>
            </div>
          ) : noQuestions ? (
            <p className="rounded-lg bg-info-soft px-3 py-2 text-[13px] text-info">
              There are no {exam.label} theory questions for {subject} yet — our content team is adding them. Try another subject, or practise objective questions for now.
            </p>
          ) : start.error ? (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{errorMessage(start.error)}</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={start.isPending}
            disabled={!subject || !!lock || noQuestions}
            onClick={() => start.mutate({ exam: exam.exam, subject, questions: count }, { onSuccess: (a) => navigate(`/learn/attempts/${a.id}`) })}
          >
            <PenLine /> Start writing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
