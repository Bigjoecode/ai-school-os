import type { AiClassIntelligence, Channel, GenerationState, LiveClassDetail } from '@aischool/shared';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BookCheck,
  Check,
  CheckCircle2,
  Circle,
  ClipboardList,
  FileQuestionMark,
  FileText,
  Lightbulb,
  ListChecks,
  NotebookPen,
  PencilLine,
  RotateCw,
  Send,
  Sparkles,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCan } from '@/lib/auth-store';
import { queryClient } from '@/lib/query-client';
import { cn } from '@/lib/utils';
import { isJobActive, useAiJob } from '../assessment/api';
import { apiFieldErrors, dateInput, FormError } from '../operations/ui';
import { FailedPanel, GeneratingPanel } from '../planning/ui';
import { lk, useRunIntelligence, useSaveQuiz, useSetHomeworkFromClass, useShareSummary } from './api';
import { addDays, ChannelChooser, NotesText, schoolToday, useSchoolTz } from './ui';

type Basis = 'TRANSCRIPT' | 'NOTES' | 'PLAN' | null;

function basisOf(c: LiveClassDetail): Basis {
  if (c.transcript && c.transcript.source !== 'NOTES') return 'TRANSCRIPT';
  if (c.teacherNotes) return 'NOTES';
  if (c.lessonPlan) return 'PLAN';
  return null;
}

const BASIS_LABEL: Record<Exclude<Basis, null>, string> = {
  TRANSCRIPT: 'the class transcript',
  NOTES: 'your notes on the class',
  PLAN: 'the linked lesson plan',
};

export function IntelligencePanel({ c, onOpenTranscript }: { c: LiveClassDetail; onOpenTranscript: () => void }) {
  const run = useRunIntelligence(c.id);
  const active = c.intelligence === 'QUEUED' || c.intelligence === 'RUNNING';
  const job = useAiJob(active ? (c.intelligenceJobId ?? undefined) : undefined);

  // When the job finishes, fetch the class again: the summary is on it.
  const jobState = job.data?.state;
  useEffect(() => {
    if (jobState && !isJobActive(job.data)) void queryClient.invalidateQueries({ queryKey: lk.detail(c.id) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobState, c.id]);

  if (active || run.isPending) {
    const state = (job.data?.state === 'RUNNING' || c.intelligence === 'RUNNING' ? 'RUNNING' : 'QUEUED') as GenerationState;
    return (
      <GeneratingPanel noun="class summary" state={state}>
        <p className="text-[12px] text-muted-foreground">Summary, key concepts, homework, a five-question quiz and revision notes.</p>
      </GeneratingPanel>
    );
  }
  if (c.intelligenceResult) return <Ready c={c} ai={c.intelligenceResult} onRegenerate={() => run.mutate()} regenerating={run.isPending} />;
  return (
    <div className="space-y-5">
      {c.intelligence === 'FAILED' && <FailedPanel noun="class summary" message={c.intelligenceError} onRetry={c.canHost ? () => run.mutate() : undefined} retrying={run.isPending} />}
      <Intro c={c} onGenerate={() => run.mutate()} onOpenTranscript={onOpenTranscript} />
    </div>
  );
}

// ------------------------------------------------------------------ before

function Intro({ c, onGenerate, onOpenTranscript }: { c: LiveClassDetail; onGenerate: () => void; onOpenTranscript: () => void }) {
  const canAi = useCan('ai.use');
  const basis = basisOf(c);
  const notYet = c.status === 'SCHEDULED' || c.status === 'CANCELLED';
  const sources: [string, boolean, string][] = [
    ['Transcript', !!c.transcript && c.transcript.source !== 'NOTES', 'Best — what was actually said'],
    ['Your notes', !!c.teacherNotes, 'A few lines on what you covered'],
    ['Lesson plan', !!c.lessonPlan, 'What you planned to teach'],
  ];
  return (
    <Card className="ai-border relative overflow-hidden border-transparent">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-ai-2/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 size-72 rounded-full bg-ai-3/10 blur-3xl" />
      <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <div className="min-w-0">
          <div className="grid size-12 place-items-center rounded-2xl bg-ai-gradient shadow-[0_8px_24px_-8px_var(--ai-2)]">
            <AiSparkle className="size-6 [&_path]:fill-white" animated={false} />
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold tracking-tight sm:text-2xl">
            Turn this class into <span className="text-ai-gradient">notes, homework and a quiz</span>
          </h2>
          <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-muted-foreground">
            After the class, the AI reads the transcript — or your notes, or the lesson plan — and writes a summary for students and parents, the key concepts, homework, five quiz questions and revision notes. You check it, then set the homework and share it in a click.
          </p>
          <ul className="mt-5 grid gap-2 text-[12.5px] sm:grid-cols-2 [&>*]:min-w-0">
            {[
              [BookCheck, 'Summary & key concepts'],
              [PencilLine, 'Homework, ready to set'],
              [FileQuestionMark, '5-question quiz for the question bank'],
              [NotebookPen, 'Revision notes for the family portal'],
            ].map(([Icon, text]) => {
              const I = Icon as typeof BookCheck;
              return (
                <li key={text as string} className="flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2.5">
                  <I className="size-4 shrink-0 text-ai-2" aria-hidden /> {text as string}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="min-w-0 rounded-2xl border border-border bg-card/80 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">What the AI will use</p>
          <ul className="mt-3 space-y-2.5">
            {sources.map(([label, has, note]) => (
              <li key={label} className="flex items-start gap-2.5">
                {has ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" aria-hidden />}
                <span className="min-w-0">
                  <span className={cn('block text-[13px] font-medium', !has && 'text-muted-foreground')}>
                    {label}
                    <span className="sr-only">{has ? ' — ready' : ' — not added'}</span>
                  </span>
                  <span className="block text-[11.5px] text-muted-foreground">{note}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-border pt-4">
            {notYet ? (
              <p className="text-[12.5px] text-muted-foreground">{c.status === 'CANCELLED' ? 'This class was cancelled.' : 'Available once the class has started.'}</p>
            ) : !c.canHost ? (
              <p className="text-[12.5px] text-muted-foreground">The class’s teacher can generate the summary.</p>
            ) : !canAi ? (
              <p className="text-[12.5px] text-muted-foreground">You need AI access to generate it — ask an admin.</p>
            ) : basis ? (
              <>
                <p className="mb-3 text-[12.5px] text-muted-foreground">
                  We’ll use <strong className="font-medium text-foreground">{BASIS_LABEL[basis]}</strong>.
                </p>
                <Button variant="ai" className="w-full" onClick={onGenerate}>
                  <Sparkles /> Generate class summary
                </Button>
              </>
            ) : (
              <>
                <p className="mb-3 text-[12.5px] text-muted-foreground">Add a transcript or a few notes on the class first.</p>
                <Button variant="outline" className="w-full" onClick={onOpenTranscript}>
                  <FileText /> Add transcript or notes
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ ready

const reveal = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

function Ready({ c, ai, onRegenerate, regenerating }: { c: LiveClassDetail; ai: AiClassIntelligence; onRegenerate: () => void; regenerating: boolean }) {
  const canAi = useCan('ai.use');
  const [sharing, setSharing] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  return (
    <motion.div initial="hidden" animate="show" transition={{ staggerChildren: 0.06 }} className="space-y-5">
      <motion.div variants={reveal}>
        <Card className="ai-border relative overflow-hidden border-transparent">
          <div aria-hidden className="pointer-events-none absolute -right-28 -top-28 size-80 rounded-full bg-ai-2/15 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/4 size-72 rounded-full bg-ai-1/10 blur-3xl" />
          <div className="relative p-5 sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ai-gradient shadow-[0_6px_20px_-6px_var(--ai-2)]">
                  <AiSparkle className="size-5 [&_path]:fill-white" animated={false} />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">AI class summary</p>
                  <p className="text-[12.5px] text-muted-foreground">Written by AI — read it through before you share it.</p>
                </div>
              </div>
              {c.canHost && (
                <div className="flex flex-wrap gap-2">
                  {canAi && (
                    <Button variant="ghost" size="sm" onClick={() => setConfirmRegen(true)} loading={regenerating}>
                      {!regenerating && <RotateCw />} Regenerate
                    </Button>
                  )}
                  {c.summarySharedAt ? (
                    <Button variant="outline" size="sm" onClick={() => setSharing(true)} title="Share again to notify parents">
                      <Check /> Shared {new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(c.summarySharedAt))}
                    </Button>
                  ) : (
                    <Button variant="ai" size="sm" onClick={() => setSharing(true)}>
                      <Send /> Share with students &amp; parents
                    </Button>
                  )}
                </div>
              )}
            </div>

            <h2 className="mt-6 font-display text-2xl font-semibold leading-tight tracking-[-0.02em] sm:text-[30px]">{ai.topic}</h2>
            <p className="mt-3 max-w-3xl text-[14.5px] leading-relaxed text-foreground/90">{ai.summary}</p>
            {ai.keyConcepts.length > 0 && (
              <div className="mt-5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Key concepts</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {ai.keyConcepts.map((k, i) => (
                    <li key={i} className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand-soft px-3 py-1 text-[12.5px] font-medium text-brand">
                      <Lightbulb className="size-3.5" aria-hidden /> {k}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      </motion.div>

      {c.canHost && ai.followUp && (
        <motion.div variants={reveal}>
          <div className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning-soft/40 px-4 py-3.5">
            <ArrowRight className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-warning">For you, next lesson · only teachers see this</p>
              <p className="mt-0.5 break-words text-[13.5px] leading-relaxed">{ai.followUp}</p>
            </div>
          </div>
        </motion.div>
      )}

      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <motion.div variants={reveal}>
          <HomeworkCard c={c} ai={ai} />
        </motion.div>
        <motion.div variants={reveal}>
          <QuizCard c={c} ai={ai} />
        </motion.div>
      </div>

      <motion.div variants={reveal}>
        <Section icon={<NotebookPen />} title="Revision notes" note="Students and parents see these once you share the summary.">
          <NotesText text={ai.revisionNotes} />
        </Section>
      </motion.div>

      <ShareDialog open={sharing} onOpenChange={setSharing} c={c} />
      <ConfirmDialog
        open={confirmRegen}
        onOpenChange={setConfirmRegen}
        destructive={false}
        title="Write the summary again?"
        description="This replaces the summary, quiz and revision notes. Homework you’ve already set and questions already saved to the bank stay as they are."
        confirmLabel="Regenerate"
        onConfirm={() => {
          setConfirmRegen(false);
          onRegenerate();
        }}
      />
    </motion.div>
  );
}

function Section({ icon, title, note, action, footer, children }: { icon: ReactNode; title: string; note?: string; action?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-start gap-3 p-5 pb-3 sm:p-6 sm:pb-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground [&_svg]:size-4">{icon}</span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[15px] font-semibold tracking-tight">{title}</h3>
          {note && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{note}</p>}
        </div>
        {action}
      </div>
      <div className="flex-1 px-5 pb-5 sm:px-6 sm:pb-6">{children}</div>
      {footer && <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/30 px-5 py-3 sm:px-6">{footer}</div>}
    </Card>
  );
}

// ------------------------------------------------------------------ homework

function HomeworkCard({ c, ai }: { c: LiveClassDetail; ai: AiClassIntelligence }) {
  const canHomework = useCan('homework.manage');
  const [open, setOpen] = useState(false);
  const footer = c.homeworkId ? (
    <>
      <Badge variant="success" className="gap-1">
        <Check /> Homework set
      </Badge>
      <span className="flex-1" />
      <Button asChild variant="ghost" size="sm">
        <Link to="/homework">
          View homework <ArrowRight />
        </Link>
      </Button>
    </>
  ) : c.canHost && canHomework ? (
    <>
      <p className="min-w-0 flex-1 text-[12px] text-muted-foreground">Publishes it to the class, with a due date.</p>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PencilLine /> Set as homework
      </Button>
    </>
  ) : null;
  return (
    <Section icon={<ClipboardList />} title="Homework" note={ai.homework.title} footer={footer}>
      <p className="text-[13.5px] leading-relaxed">{ai.homework.instructions}</p>
      <ol className="mt-4 space-y-2.5">
        {ai.homework.questions.map((q, i) => (
          <li key={i} className="flex gap-3 text-[13.5px] leading-relaxed">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[11.5px] font-semibold tabular text-muted-foreground">{i + 1}</span>
            <span className="min-w-0 break-words pt-0.5">{q}</span>
          </li>
        ))}
      </ol>
      <SetHomeworkDialog open={open} onOpenChange={setOpen} c={c} title={ai.homework.title} />
    </Section>
  );
}

function SetHomeworkDialog({ open, onOpenChange, c, title }: { open: boolean; onOpenChange: (o: boolean) => void; c: LiveClassDetail; title: string }) {
  const tz = useSchoolTz();
  const set = useSetHomeworkFromClass(c.id);
  const [due, setDue] = useState('');
  const [channels, setChannels] = useState<Channel[]>(['IN_APP']);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setDue(addDays(schoolToday(tz), 2));
    setChannels(['IN_APP']);
    setErrors({});
  }, [open, tz]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!due) return setErrors({ dueDate: 'Pick a due date' });
    set.mutate({ dueDate: due, notifyParents: channels }, { onSuccess: () => onOpenChange(false), onError: (err) => setErrors(apiFieldErrors(err)) });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <div className="mb-2 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
              <PencilLine className="size-5" />
            </div>
            <DialogTitle>Set as homework</DialogTitle>
            <DialogDescription>
              “{title}” goes to {c.classArm.name}. Students and parents see it in their portal straight away.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Due" htmlFor="hw-due" error={errors.dueDate}>
              <Input id="hw-due" type="date" value={due} min={schoolToday(tz)} onChange={(e) => setDue(e.target.value)} className={cn(dateInput, 'sm:w-48')} invalid={!!errors.dueDate} />
            </Field>
            <div className="grid gap-1.5">
              <Label>Tell parents</Label>
              <ChannelChooser value={channels} onChange={setChannels} label="Tell parents by" />
            </div>
            <FormError message={errors.form ?? errors.notifyParents} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={set.isPending}>
              {!set.isPending && <Check />} Set homework
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ quiz

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function QuizCard({ c, ai }: { c: LiveClassDetail; ai: AiClassIntelligence }) {
  const canAssess = useCan('assessment.manage');
  const save = useSaveQuiz(c.id);
  const [answers, setAnswers] = useState(true);
  const saved = c.quizQuestionIds.length > 0;
  const footer = saved ? (
    <>
      <Badge variant="success" className="gap-1">
        <Check /> In the question bank
      </Badge>
      <span className="flex-1" />
      <Button asChild variant="ghost" size="sm">
        <Link to="/questions">
          Open question bank <ArrowRight />
        </Link>
      </Button>
    </>
  ) : c.canHost && canAssess ? (
    <>
      <p className="min-w-0 flex-1 text-[12px] text-muted-foreground">Saved as drafts, ready for tests and exams.</p>
      <Button size="sm" variant="outline" loading={save.isPending} onClick={() => save.mutate()}>
        {!save.isPending && <ListChecks />} Save to question bank
      </Button>
    </>
  ) : null;
  return (
    <Section
      icon={<FileQuestionMark />}
      title="Quick quiz"
      note={`${ai.quiz.length} multiple-choice questions on the key concepts`}
      footer={footer}
      action={
        <Button variant="ghost" size="sm" onClick={() => setAnswers((a) => !a)} aria-pressed={answers}>
          {answers ? 'Hide answers' : 'Show answers'}
        </Button>
      }
    >
      <ol className="space-y-5">
        {ai.quiz.map((q, i) => (
          <li key={i}>
            <p className="flex gap-2 text-[13.5px] font-medium leading-relaxed">
              <span className="shrink-0 tabular text-muted-foreground">{i + 1}.</span>
              <span className="min-w-0 break-words">{q.question}</span>
            </p>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 [&>*]:min-w-0">
              {q.options.map((o, j) => {
                const right = answers && j === q.answerIndex;
                return (
                  <li
                    key={j}
                    className={cn(
                      'flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px] leading-snug',
                      right ? 'border-success/40 bg-success-soft/60 font-medium text-foreground' : 'border-border text-muted-foreground',
                    )}
                  >
                    <span className={cn('grid size-5 shrink-0 place-items-center rounded-md text-[10.5px] font-semibold', right ? 'bg-success text-white' : 'bg-muted')}>{LETTERS[j]}</span>
                    <span className="min-w-0 break-words pt-px">{o}</span>
                    {right && <span className="sr-only">(correct answer)</span>}
                  </li>
                );
              })}
            </ul>
            {answers && q.explanation && <p className="mt-1.5 pl-5 text-[12px] italic text-muted-foreground">{q.explanation}</p>}
          </li>
        ))}
      </ol>
    </Section>
  );
}

// ------------------------------------------------------------------ share

function ShareDialog({ open, onOpenChange, c }: { open: boolean; onOpenChange: (o: boolean) => void; c: LiveClassDetail }) {
  const share = useShareSummary(c.id);
  const [channels, setChannels] = useState<Channel[]>(['IN_APP']);
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    if (open) {
      setChannels(['IN_APP']);
      setError(undefined);
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <div className="mb-2 grid size-10 place-items-center rounded-xl bg-ai-gradient shadow-[0_6px_20px_-6px_var(--ai-2)]">
            <Send className="size-5 text-white" />
          </div>
          <DialogTitle>Share the class summary</DialogTitle>
          <DialogDescription>
            Students in {c.classArm.name} and their parents see the summary, key concepts and revision notes under My learning. The quiz answers and your follow-up note stay private.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-1.5">
          <Label>Also tell parents</Label>
          <ChannelChooser value={channels} onChange={setChannels} label="Tell parents by" />
          <FormError message={error} />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="ai"
            loading={share.isPending}
            onClick={() =>
              share.mutate(
                { notifyParents: channels },
                {
                  onSuccess: () => onOpenChange(false),
                  onError: (err) => setError(apiFieldErrors(err).form ?? 'Couldn’t share it. Please try again.'),
                },
              )
            }
          >
            {!share.isPending && <Send />} Share summary
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
