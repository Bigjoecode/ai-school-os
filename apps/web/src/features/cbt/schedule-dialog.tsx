import { CBT_SHOW_RESULTS, CBT_SHOW_RESULTS_LABELS, type CbtExamSummary, type CbtPaperOption, type CbtShowResults } from '@aischool/shared';
import { CalendarClock, FileText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ApiError, errorMessage } from '@/lib/api';
import { useCbtPapers, useCreateOnlineExam, useUpdateOnlineExam } from './api';

/** ISO → value for <input type="datetime-local"> in the device's time zone. */
function toLocalInput(iso: string | Date) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : '');

/** The next round quarter hour. */
function nextSlot(addMinutes = 0) {
  const d = new Date(Date.now() + addMinutes * 60_000);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15);
  return d;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing an existing exam (the paper can't change). */
  exam?: CbtExamSummary;
  /** Students have started: only some fields can change. */
  started?: boolean;
}

export function ScheduleExamDialog({ open, onOpenChange, exam, started }: Props) {
  const papers = useCbtPapers(open && !exam);
  const create = useCreateOnlineExam();
  const update = useUpdateOnlineExam(exam?.id ?? '');
  const [paperId, setPaperId] = useState('');
  const [title, setTitle] = useState('');
  const [arms, setArms] = useState<string[]>([]);
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [duration, setDuration] = useState('40');
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [showResults, setShowResults] = useState<CbtShowResults>('AFTER_CLOSE');
  const [sendToScores, setSendToScores] = useState(true);
  const [accessCode, setAccessCode] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Reset whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setFormError(null);
    if (exam) {
      setPaperId(exam.paper.id);
      setTitle(exam.title);
      setArms(exam.classArms.map((a) => a.id));
      setOpensAt(toLocalInput(exam.opensAt));
      setClosesAt(toLocalInput(exam.closesAt));
      setDuration(String(exam.durationMinutes));
      setShuffleQuestions(exam.shuffleQuestions);
      setShuffleOptions(exam.shuffleOptions);
      setShowResults(exam.showResults);
      setSendToScores(exam.sendToScores);
      setAccessCode(exam.accessCode ?? '');
    } else {
      setPaperId('');
      setTitle('');
      setArms([]);
      const start = nextSlot(15);
      setOpensAt(toLocalInput(start));
      setClosesAt(toLocalInput(new Date(start.getTime() + 60 * 60_000)));
      setDuration('40');
      setShuffleQuestions(true);
      setShuffleOptions(true);
      setShowResults('AFTER_CLOSE');
      setSendToScores(true);
      setAccessCode('');
    }
  }, [open, exam]);

  const paper: CbtPaperOption | undefined = useMemo(() => papers.data?.find((p) => p.id === paperId), [papers.data, paperId]);

  const pickPaper = (id: string) => {
    const p = papers.data?.find((x) => x.id === id);
    setPaperId(id);
    if (!p) return;
    setTitle(p.title);
    setDuration(String(p.durationMinutes));
    setArms(p.classArms.length === 1 ? [p.classArms[0]!.id] : []);
    // Make the window at least the paper's length plus a little slack.
    const o = new Date(opensAt || nextSlot(15));
    if (new Date(closesAt).getTime() - o.getTime() < (p.durationMinutes + 15) * 60_000) setClosesAt(toLocalInput(new Date(o.getTime() + (p.durationMinutes + 30) * 60_000)));
  };

  const armOptions = exam ? exam.classArms : (paper?.classArms ?? []);
  const component = exam ? exam.component : paper?.component;
  const pending = create.isPending || update.isPending;

  const submit = async (publish: boolean) => {
    setFormError(null);
    const errs: Record<string, string> = {};
    if (!exam && !paperId) errs.paperId = 'Pick a paper';
    if (title.trim().length < 3) errs.title = 'Give the exam a title';
    if (!arms.length) errs.classArmIds = 'Pick at least one class';
    if (!opensAt) errs.opensAt = 'When does it open?';
    if (!closesAt) errs.closesAt = 'When does it close?';
    const mins = Number(duration);
    if (!Number.isInteger(mins) || mins < 1) errs.durationMinutes = 'Whole minutes, at least 1';
    if (opensAt && closesAt && new Date(closesAt) <= new Date(opensAt)) errs.closesAt = 'Must be after the opening time';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const common = {
      title: title.trim(),
      closesAt: fromLocalInput(closesAt),
      showResults,
      sendToScores,
      accessCode: accessCode.trim() || null,
    };
    const full = { ...common, classArmIds: arms, opensAt: fromLocalInput(opensAt), durationMinutes: mins, shuffleQuestions, shuffleOptions };
    try {
      if (exam) await update.mutateAsync(started ? common : full);
      else await create.mutateAsync({ ...full, paperId, publish });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.errors.length) setErrors(Object.fromEntries(err.errors.map((e) => [e.path, e.message])));
      setFormError(errorMessage(err));
    }
  };

  const noPapers = !exam && papers.data && papers.data.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <div className="mb-2 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand [&_svg]:size-5">
            <CalendarClock />
          </div>
          <DialogTitle>{exam ? 'Edit online exam' : 'Schedule an online exam'}</DialogTitle>
          <DialogDescription>
            {exam
              ? started
                ? 'Students have started, so the paper, classes, start time and duration are locked. You can still extend the closing time.'
                : 'Change anything until the first student starts.'
              : 'Pick a finalised paper, the classes that sit it and when. Students see it in their Exams page.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          {noPapers ? (
            <EmptyState
              compact
              icon={FileText}
              title="No finalised papers you can schedule"
              description="Build a paper in Exams and mark it final. You can only schedule papers for classes you teach the subject in."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link to="/exams">Go to Exams</Link>
                </Button>
              }
            />
          ) : (
            <>
              {!exam && (
                <Field label="Exam paper" htmlFor="cbt-paper" error={errors.paperId} hint={paper ? `${paper.subject.name} · ${paper.classLevel.name} · ${paper.term.name} · ${paper.questionCount} questions, ${paper.totalMarks} marks${paper.hasWritten ? ' (includes written questions you mark)' : ''}` : 'Only papers marked final appear here.'}>
                  {papers.isLoading ? (
                    <Skeleton className="h-10" />
                  ) : (
                    <Select value={paperId} onValueChange={pickPaper}>
                      <SelectTrigger id="cbt-paper" invalid={!!errors.paperId}>
                        <SelectValue placeholder="Choose a paper" />
                      </SelectTrigger>
                      <SelectContent>
                        {papers.data?.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
              )}

              {(exam || paper) && (
                <>
                  <Field label="Title students see" htmlFor="cbt-title" error={errors.title}>
                    <Input id="cbt-title" value={title} onChange={(e) => setTitle(e.target.value)} invalid={!!errors.title} maxLength={160} />
                  </Field>

                  <Field label="Classes" error={errors.classArmIds} hint={exam ? undefined : armOptions.length ? `Classes in ${paper?.classLevel.name} you can schedule for.` : undefined}>
                    <div className="flex flex-wrap gap-2">
                      {armOptions.map((a) => {
                        const on = arms.includes(a.id);
                        return (
                          <label key={a.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px] ${on ? 'border-brand bg-brand-soft' : 'border-border'} ${started ? 'pointer-events-none opacity-60' : ''}`}>
                            <Checkbox checked={on} disabled={started} onCheckedChange={(v) => setArms((xs) => (v ? [...xs, a.id] : xs.filter((x) => x !== a.id)))} />
                            {a.name}
                          </label>
                        );
                      })}
                    </div>
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Opens" htmlFor="cbt-open" error={errors.opensAt}>
                      <Input id="cbt-open" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} disabled={started} invalid={!!errors.opensAt} />
                    </Field>
                    <Field label="Closes" htmlFor="cbt-close" error={errors.closesAt}>
                      <Input id="cbt-close" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} invalid={!!errors.closesAt} />
                    </Field>
                    <Field label="Duration (minutes)" htmlFor="cbt-duration" error={errors.durationMinutes}>
                      <Input id="cbt-duration" type="number" inputMode="numeric" min={1} max={600} value={duration} onChange={(e) => setDuration(e.target.value)} disabled={started} invalid={!!errors.durationMinutes} />
                    </Field>
                  </div>
                  <p className="-mt-2 text-[12px] text-muted-foreground">Each student gets the full duration from when they start, but never past the closing time.</p>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <SwitchRow label="Shuffle questions" description="Each student gets a different order">
                      <Switch checked={shuffleQuestions} onCheckedChange={setShuffleQuestions} disabled={started} />
                    </SwitchRow>
                    <SwitchRow label="Shuffle options" description="A–D in a different order per student">
                      <Switch checked={shuffleOptions} onCheckedChange={setShuffleOptions} disabled={started} />
                    </SwitchRow>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Students see their results" htmlFor="cbt-results" hint={showResults === 'IMMEDIATE' ? 'The score shows on submitting; answers are revealed after the exam closes.' : undefined}>
                      <Select value={showResults} onValueChange={(v) => setShowResults(v as CbtShowResults)}>
                        <SelectTrigger id="cbt-results">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CBT_SHOW_RESULTS.map((s) => (
                            <SelectItem key={s} value={s}>
                              {CBT_SHOW_RESULTS_LABELS[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Access code" htmlFor="cbt-code" optional error={errors.accessCode} hint="Read it out in the hall so only students present can start.">
                      <Input id="cbt-code" value={accessCode} onChange={(e) => setAccessCode(e.target.value.toUpperCase())} maxLength={20} placeholder="e.g. JSS1-MATHS" autoComplete="off" />
                    </Field>
                  </div>

                  <SwitchRow label="Use for the score sheet" description={component ? `Lets you copy scores into ${component.name} (out of ${component.maxScore}) after marking.` : 'The paper’s assessment no longer exists in your settings.'}>
                    <Switch checked={sendToScores} onCheckedChange={setSendToScores} />
                  </SwitchRow>
                </>
              )}
              {formError && (
                <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
                  {formError}
                </p>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {exam ? (
            <Button onClick={() => void submit(false)} loading={pending}>
              Save changes
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => void submit(false)} loading={pending} disabled={!paper}>
                Save as draft
              </Button>
              <Button onClick={() => void submit(true)} loading={pending} disabled={!paper}>
                Schedule
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
