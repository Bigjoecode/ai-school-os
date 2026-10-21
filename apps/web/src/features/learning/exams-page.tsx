import { ENTITLEMENTS, UTME, examEntitlement, utmeLabel, type ExamBody, type ExamCatalog } from '@aischool/shared';
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, GraduationCap, HeartHandshake, Lock, Monitor, PenLine, School, Sparkles, Target, Timer, Trophy } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/empty-state';
import { OfferNote } from '@/components/ui/offer-note';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { examLockError, useAttempts, useExamCatalog, useExamTopics, useStartExam, useStartTheory, useStartUtme, utmeShortfall } from './api';
import { AttemptList, SectionTitle } from './components';
import { UtmeTrend } from './utme-results';

type Exam = ExamCatalog['exams'][number];
type StartMode = 'PRACTICE' | 'MOCK' | 'THEORY' | 'UTME' | 'PAST';
type Level = ExamCatalog['level'];

/** Which school level an exam is meant for (JAMB, WAEC and NECO: SS 1–3; BECE: JSS). Null when it fits or the class is unknown. */
function levelNote(exam: ExamBody, level: Level): string | null {
  if (!level) return null;
  if (exam === 'BECE') return level === 'JUNIOR' ? null : 'BECE prep is for JSS 1–3 students.';
  return level === 'SENIOR' ? null : `${exam === 'JAMB' ? 'JAMB' : exam} prep is for SS 1–3 students.`;
}

export default function ExamsPage() {
  const cat = useExamCatalog();
  const attempts = useAttempts();
  const [start, setStart] = useState<{ exam: Exam; mode: StartMode } | null>(null);
  const fp = cat.data?.freePractice;
  const freeLeft = fp ? Math.max(0, fp.setsPerTerm - fp.used) : 0;
  const examAttempts = (attempts.data ?? []).filter((a) => a.exam);
  const utmeDone = examAttempts.filter((a) => a.mode === 'UTME' && a.submittedAt && a.utme);

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
              <ExamCard key={e.exam} exam={e} freeLeft={freeLeft} level={cat.data.level ?? null} onStart={(mode) => setStart({ exam: e, mode })} />
            ))}
          </div>
          {utmeDone.length > 0 && (
            <Card className="p-5">
              <UtmeTrend rows={utmeDone} />
            </Card>
          )}
          <Card className="p-5">
            <SectionTitle icon={Trophy} title="Your exam practice" />
            {attempts.isLoading ? <Skeleton className="h-24" /> : <AttemptList rows={examAttempts} empty="No exam practice yet. Start a set above — it only takes a few minutes." />}
          </Card>
        </div>
      )}
      {start && start.mode === 'THEORY' && <TheoryDialog key={`${start.exam.exam}-theory`} exam={start.exam} onClose={() => setStart(null)} />}
      {start && start.mode === 'UTME' && <UtmeDialog key="utme" exam={start.exam} onClose={() => setStart(null)} />}
      {start && start.mode === 'PAST' && <PastPaperDialog key={`${start.exam.exam}-past`} exam={start.exam} onClose={() => setStart(null)} />}
      {start && (start.mode === 'PRACTICE' || start.mode === 'MOCK') && <StartDialog key={`${start.exam.exam}-${start.mode}`} exam={start.exam} mode={start.mode} freeQuestions={fp?.questionsPerSet ?? 5} onClose={() => setStart(null)} />}
    </Page>
  );
}

function ExamCard({ exam, freeLeft, level, onStart }: { exam: Exam; freeLeft: number; level: Level; onStart: (mode: StartMode) => void }) {
  const total = exam.subjects.reduce((t, s) => t + s.questions, 0);
  const ent = ENTITLEMENTS[examEntitlement(exam.exam)];
  const notForMe = levelNote(exam.exam, level);
  const papers = exam.pastPapers ?? [];
  if (notForMe) {
    return (
      <Card className="flex flex-col bg-card/70 p-5" data-testid={`exam-card-${exam.exam}`}>
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted font-display text-[13px] font-bold text-muted-foreground">{exam.exam}</div>
          <div className="min-w-0">
            <p className="font-display text-[16px] font-semibold tracking-tight">{exam.label}</p>
            <p className="text-[12.5px] text-muted-foreground">
              {exam.subjects.length} subjects · {total} questions
            </p>
          </div>
        </div>
        <p className="mt-4 flex items-start gap-1.5 rounded-xl bg-muted p-3 text-[13px]">
          <GraduationCap className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> {notForMe}
        </p>
      </Card>
    );
  }
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
      {!!exam.comingSoon?.length && <ComingSoon subjects={exam.comingSoon} />}
      {exam.entitled && (
        <p className="mt-4 flex items-start gap-1.5 rounded-xl bg-success-soft/60 p-3 text-[12.5px] text-success">
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Unlimited practice, timed mocks and AI-marked theory practice are unlocked. Good luck!
        </p>
      )}
      {!exam.entitled && (
        <OfferNote
          className="mt-4"
          size="sm"
          product={ent.label}
          note={
            <>
              <p className="flex items-start gap-1.5">
                <HeartHandshake className="mt-0.5 size-3.5 shrink-0" aria-hidden /> A parent can add it from the Family page.
              </p>
              <p className="mt-0.5 flex items-start gap-1.5">
                <School className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Your school may sponsor it for your class.
              </p>
            </>
          }
        >
          unlocks unlimited practice, timed mocks and AI-marked theory.
        </OfferNote>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        {exam.exam === 'JAMB' &&
          (exam.entitled ? (
            <Button onClick={() => onStart('UTME')} className="w-full" data-testid="utme-start">
              <Monitor /> Full UTME CBT mock <span className="font-normal opacity-80">· 4 subjects, {UTME.questions} questions, {UTME.minutes / 60} hours</span>
            </Button>
          ) : (
            <Button variant="outline" disabled className="w-full" title={`Full UTME mocks come with ${ent.label}`}>
              <Lock /> Full UTME CBT mock
            </Button>
          ))}
        <Button variant={exam.entitled ? 'outline' : 'default'} onClick={() => onStart('PRACTICE')} disabled={!exam.entitled && freeLeft === 0} className="flex-1 sm:flex-none">
          <Target /> Practise
        </Button>
        {papers.length > 0 && (
          <Button variant="outline" onClick={() => onStart('PAST')} disabled={!exam.entitled && freeLeft === 0} className="flex-1 sm:flex-none">
            <CalendarClock /> Past papers
          </Button>
        )}
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

/** Subjects with a syllabus whose question bank is still being written. */
function ComingSoon({ subjects }: { subjects: NonNullable<Exam['comingSoon']> }) {
  const [all, setAll] = useState(false);
  const shown = all ? subjects : subjects.slice(0, 8);
  return (
    <div className="mt-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
        <Clock className="size-3.5" aria-hidden /> Coming soon · {subjects.length} more subject{subjects.length === 1 ? '' : 's'}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {shown.map((s) => (
          <li key={s.subject} className="rounded-full border border-dashed border-border px-2.5 py-1 text-[12px] text-muted-foreground" title="Questions for this subject are being written and checked">
            {s.subject}
          </li>
        ))}
        {subjects.length > shown.length && (
          <li>
            <button type="button" onClick={() => setAll(true)} className="rounded-full px-2.5 py-1 text-[12px] font-medium text-brand hover:underline">
              +{subjects.length - shown.length} more
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

function StartDialog({ exam, mode, freeQuestions, onClose }: { exam: Exam; mode: 'PRACTICE' | 'MOCK'; freeQuestions: number; onClose: () => void }) {
  const navigate = useNavigate();
  const startExam = useStartExam();
  const [subjects, setSubjects] = useState<string[]>(exam.subjects.slice(0, 1).map((s) => s.subject));
  const options = exam.entitled ? (mode === 'MOCK' ? [20, 40, 60] : [10, 20, 40]) : [freeQuestions];
  const [count, setCount] = useState(options[0]!);
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD' | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const oneSubject = mode === 'PRACTICE' && subjects.length === 1 ? subjects[0]! : null;
  const topics = useExamTopics(exam.exam, oneSubject);
  const lock = examLockError(startExam.error);
  const toggle = (s: string) => {
    setTopicId(null);
    setSubjects((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s].slice(0, 4)));
  };

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
          {mode === 'PRACTICE' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-[13px] font-medium">Difficulty</p>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Difficulty">
                  {([null, 'EASY', 'MEDIUM', 'HARD'] as const).map((d) => (
                    <button
                      key={d ?? 'any'}
                      type="button"
                      role="radio"
                      aria-checked={difficulty === d}
                      onClick={() => setDifficulty(d)}
                      className={cn('rounded-full border px-3 py-1.5 text-[13px] transition-colors', difficulty === d ? 'border-brand bg-brand-soft text-brand' : 'border-border hover:bg-muted')}
                    >
                      {d ? d[0] + d.slice(1).toLowerCase() : 'Any'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[13px] font-medium">Topic</p>
                <Select value={topicId ?? 'ALL'} onValueChange={(v) => setTopicId(v === 'ALL' ? null : v)} disabled={!oneSubject || !topics.data?.length}>
                  <SelectTrigger aria-label="Topic">
                    <SelectValue placeholder="All topics" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All topics</SelectItem>
                    {(topics.data ?? []).map((t) => (
                      <SelectItem key={t.topicId} value={t.topicId}>
                        {t.parent ? `${t.parent} › ` : ''}
                        {t.topic} ({t.questions})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!oneSubject && <p className="mt-1 text-[11.5px] text-muted-foreground">Choose one subject to practise by topic.</p>}
              </div>
            </div>
          )}
          {lock ? (
            <div className="rounded-xl border border-warning/30 bg-warning-soft/60 p-3 text-[13px]">
              <p className="font-medium text-warning">{lock.message}</p>
              <OfferNote className="mt-2" size="sm" product={ENTITLEMENTS[examEntitlement(lock.exam as ExamBody)]?.label ?? 'Exam Prep'} note="Ask a parent: they can add it from the Family page, or your school may sponsor it.">
                unlocks unlimited practice, timed mocks and AI-marked theory.
              </OfferNote>
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
            onClick={() => startExam.mutate({ mode, exam: exam.exam, subjects, questions: count, ...(mode === 'PRACTICE' ? { difficulty, topicId: oneSubject ? topicId : null } : {}) }, { onSuccess: (a) => navigate(`/learn/attempts/${a.id}`) })}
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
              <OfferNote className="mt-2" size="sm" product={ENTITLEMENTS[examEntitlement(lock.exam)]?.label ?? 'Exam Prep'} note="Ask a parent: they can add it from the Family page, or your school may sponsor it.">
                unlocks unlimited practice, timed mocks and AI-marked theory.
              </OfferNote>
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

/**
 * The full JAMB UTME CBT mock: Use of English is compulsory (always
 * included); the student picks three other subjects. Shows how many approved
 * questions each has against what the paper needs, and offers a shorter
 * mock when a subject falls short.
 */
function UtmeDialog({ exam, onClose }: { exam: Exam; onClose: () => void }) {
  const navigate = useNavigate();
  const start = useStartUtme();
  const english = exam.subjects.find((s) => s.subject === UTME.english);
  const others = exam.subjects.filter((s) => s.subject !== UTME.english);
  const [picked, setPicked] = useState<string[]>([]);
  const lock = examLockError(start.error);
  const serverShort = utmeShortfall(start.error);
  const available = (subject: string) => {
    const s = exam.subjects.find((x) => x.subject === subject);
    return s ? (s.objective ?? s.questions) : 0;
  };
  const need = (subject: string) => (subject === UTME.english ? UTME.englishQuestions : UTME.otherQuestions);
  const chosen = [UTME.english, ...picked];
  const short = chosen.map((subject) => ({ subject, label: utmeLabel(subject), available: available(subject), needed: need(subject) })).filter((s) => s.available < s.needed);
  const shortTotal = chosen.reduce((t, s) => t + Math.min(available(s), need(s)), 0);
  const minutes = short.length ? Math.max(10, Math.round((UTME.minutes * shortTotal) / UTME.questions)) : UTME.minutes;
  const toggle = (s: string) => {
    start.reset();
    setPicked((x) => (x.includes(s) ? x.filter((y) => y !== s) : x.length >= UTME.otherSubjects ? x : [...x, s]));
  };
  const ready = picked.length === UTME.otherSubjects && !!english;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <div className="mb-2 grid size-10 place-items-center rounded-xl bg-success text-white [&_svg]:size-5">
            <Monitor />
          </div>
          <DialogTitle>Full JAMB UTME CBT mock</DialogTitle>
          <DialogDescription>
            Like the real UTME: {UTME.englishLabel} ({UTME.englishQuestions} questions) plus three subjects ({UTME.otherQuestions} each), {UTME.questions} questions on one {UTME.minutes}-minute clock, in a full-screen CBT room with subject tabs, a question palette, a calculator and keyboard shortcuts.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <div>
            <p className="mb-2 text-[13px] font-medium">Compulsory</p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand bg-brand-soft px-3 py-1.5 text-[13px] text-brand">
              <Lock className="size-3.5" aria-hidden /> {UTME.englishLabel} <span className="tabular opacity-80">· {available(UTME.english)}</span>
            </span>
            {!english && <p className="mt-2 text-[12.5px] text-danger">{UTME.englishLabel} has no approved questions yet, so a full mock can’t start.</p>}
          </div>
          <div>
            <p className="mb-2 text-[13px] font-medium">
              Your three other subjects <span className="font-normal text-muted-foreground">({picked.length} of 3 chosen)</span>
            </p>
            <div className="flex flex-wrap gap-1.5" data-testid="utme-subject-picker">
              {others.map((s) => {
                const on = picked.includes(s.subject);
                const full = !on && picked.length >= UTME.otherSubjects;
                return (
                  <button
                    key={s.subject}
                    type="button"
                    aria-pressed={on}
                    disabled={full}
                    onClick={() => toggle(s.subject)}
                    className={cn('rounded-full border px-3 py-1.5 text-[13px] transition-colors disabled:opacity-40', on ? 'border-brand bg-brand-soft text-brand' : 'border-border hover:bg-muted')}
                  >
                    {s.subject} <span className="tabular text-muted-foreground">· {s.objective ?? s.questions}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[12px] text-muted-foreground">Numbers show approved questions. Choose the combination your course needs (check JAMB’s brochure).</p>
          </div>
          {ready && short.length > 0 && (
            <div className="rounded-xl border border-warning/30 bg-warning-soft/60 p-3 text-[13px]" data-testid="utme-shortfall">
              <p className="flex items-center gap-1.5 font-medium text-warning">
                <AlertTriangle className="size-4" aria-hidden /> Not enough approved questions for a full mock yet
              </p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
                {short.map((s) => (
                  <li key={s.subject}>
                    {s.label} has only {s.available} approved question{s.available === 1 ? '' : 's'} — a full mock needs {s.needed}.
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-muted-foreground">
                You can sit a shorter mock now: {shortTotal} questions in {minutes} minutes (the same time per question).
              </p>
            </div>
          )}
          {lock ? (
            <div className="rounded-xl border border-warning/30 bg-warning-soft/60 p-3 text-[13px]">
              <p className="font-medium text-warning">{lock.message}</p>
            </div>
          ) : start.error && !serverShort ? (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{errorMessage(start.error)}</p>
          ) : serverShort ? (
            <p className="rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning">{errorMessage(start.error)}</p>
          ) : null}
          <ul className="space-y-1 text-[12.5px] text-muted-foreground">
            <li className="flex gap-1.5">
              <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> The clock starts now and keeps running if you leave; answers are handed in automatically at zero.
            </li>
            <li className="flex gap-1.5">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Answers save as you go and are kept on your device if the network drops.
            </li>
          </ul>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={start.isPending}
            disabled={!ready || !!lock}
            data-testid="utme-go"
            onClick={() => start.mutate({ subjects: picked, allowShort: short.length > 0 || !!serverShort }, { onSuccess: (a) => navigate(`/utme/${a.id}`) })}
          >
            <Timer /> {short.length || serverShort ? `Start shorter mock (${minutes} min)` : `Start the ${UTME.minutes}-minute mock`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Past papers by year (licensed past questions), practised in the original order. */
function PastPaperDialog({ exam, onClose }: { exam: Exam; onClose: () => void }) {
  const navigate = useNavigate();
  const startExam = useStartExam();
  const papers = exam.pastPapers ?? [];
  const subjects = [...new Set(papers.map((p) => p.subject))].sort();
  const [subject, setSubject] = useState(subjects[0] ?? '');
  const lock = examLockError(startExam.error);
  const label = (s: string) => (exam.exam === 'JAMB' ? utmeLabel(s) : s);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-2 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand [&_svg]:size-5">
            <CalendarClock />
          </div>
          <DialogTitle>{exam.label} past papers</DialogTitle>
          <DialogDescription>Practise one year’s paper in its original order, with the answers and explanations at the end.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Subject">
            {subjects.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={subject === s}
                onClick={() => setSubject(s)}
                className={cn('rounded-full border px-3 py-1.5 text-[13px] transition-colors', subject === s ? 'border-brand bg-brand-soft text-brand' : 'border-border hover:bg-muted')}
              >
                {label(s)}
              </button>
            ))}
          </div>
          <ul className="grid gap-2 sm:grid-cols-2" data-testid="past-papers">
            {papers
              .filter((p) => p.subject === subject)
              .map((p) => (
                <li key={p.year}>
                  <button
                    type="button"
                    disabled={startExam.isPending}
                    onClick={() => startExam.mutate({ mode: 'PRACTICE', exam: exam.exam, subjects: [p.subject], questions: 5, year: p.year }, { onSuccess: (a) => navigate(`/learn/attempts/${a.id}`) })}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5 text-left text-[13.5px] transition-colors hover:border-brand hover:bg-brand-soft/50 disabled:opacity-60"
                  >
                    <span className="font-medium">
                      {exam.exam === 'JAMB' ? 'JAMB' : exam.label} {p.year} — {label(p.subject)}
                    </span>
                    <span className="shrink-0 text-[12px] tabular text-muted-foreground">{p.questions} questions</span>
                  </button>
                </li>
              ))}
          </ul>
          {!exam.entitled && <p className="text-[12px] text-muted-foreground">Without {ENTITLEMENTS[examEntitlement(exam.exam)].label} a past paper counts as a free practice set (its first few questions).</p>}
          {lock ? <p className="rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning">{lock.message}</p> : startExam.error ? <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{errorMessage(startExam.error)}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
