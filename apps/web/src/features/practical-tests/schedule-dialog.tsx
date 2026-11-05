import { CBT_SHOW_RESULTS, CBT_SHOW_RESULTS_LABELS, PRACTICAL_ASSESSMENT_KINDS, PRACTICAL_ASSESSMENT_KIND_LABELS, type CbtShowResults, type PracticalAssessmentKind, type PracticalAssessmentSummary } from '@aischool/shared';
import { FlaskConical } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, errorMessage } from '@/lib/api';
import { useCreatePracticalTest, usePracticalTestOptions, usePracticalTestPicks, useUpdatePracticalTest } from './api';
import { formErrors, fromLocalInput, initialForm, type FormState } from './form-state';

const NONE = '__none__';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing (the subject and practical can't change). */
  item?: PracticalAssessmentSummary;
  /** Students have started: the kind, classes, opening time and duration are locked. */
  started?: boolean;
}

/** Schedule (or edit) a practical test: a virtual lab set as a timed class test or exam. */
export function SchedulePracticalTestDialog({ open, onOpenChange, item, started }: Props) {
  const options = usePracticalTestOptions(open);
  const [f, setF] = useState<FormState>(() => initialForm(item));
  const picks = usePracticalTestPicks(item ? '' : f.subjectId);
  const create = useCreatePracticalTest();
  const update = useUpdatePracticalTest(item?.id ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setF(initialForm(item));
    setErrors({});
    setFormError(null);
  }, [open, item]);
  // New tests count for the current term by default.
  useEffect(() => {
    const cur = options.data?.terms.find((t) => t.current) ?? options.data?.terms[0];
    if (open && !item && cur) setF((s) => (s.termId ? s : { ...s, termId: cur.id }));
  }, [open, item, options.data]);

  const subject = options.data?.subjects.find((s) => s.id === f.subjectId);
  const armOptions = item ? (subject?.classArms.length ? subject.classArms : item.classArms) : (subject?.classArms ?? []);
  const pick = picks.data?.find((p) => p.id === f.practicalId);
  const pending = create.isPending || update.isPending;

  const choosePractical = (id: string) => {
    const p = picks.data?.find((x) => x.id === id);
    setF((s) => ({ ...s, practicalId: id, ...(p ? { title: s.title || `${p.title} — practical test`, duration: String(p.minutes) } : {}) }));
  };

  const submit = async (publish: boolean) => {
    setFormError(null);
    const errs = formErrors(f, !!item);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const common = { title: f.title.trim(), closesAt: fromLocalInput(f.closesAt), showResults: f.showResults, accessCode: f.accessCode.trim() || null, termId: f.termId, componentKey: f.componentKey || null };
    const full = { ...common, kind: f.kind, classArmIds: f.arms, opensAt: fromLocalInput(f.opensAt), durationMinutes: Number(f.duration) };
    try {
      if (item) await update.mutateAsync(started ? common : full);
      else await create.mutateAsync({ ...full, subjectId: f.subjectId, practicalId: f.practicalId, publish });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.errors.length) setErrors(Object.fromEntries(err.errors.map((e) => [e.path, e.message])));
      setFormError(errorMessage(err));
    }
  };

  const noSubjects = !item && options.data && !options.data.subjects.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <div className="mb-2 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand [&_svg]:size-5">
            <FlaskConical />
          </div>
          <DialogTitle>{item ? 'Edit practical test' : 'Schedule a practical test'}</DialogTitle>
          <DialogDescription>
            {item
              ? started
                ? 'Students have started, so the kind, classes, start time and duration are locked. You can still extend the closing time.'
                : 'Change anything until the first student starts.'
              : 'Set a virtual lab as a timed test for your classes. Each student sits it once, on their own variant, and the lab marks it.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          {options.isLoading ? (
            <Skeleton className="h-48" />
          ) : noSubjects ? (
            <EmptyState compact icon={FlaskConical} title="No subjects with virtual labs you can set" description="Practical tests use the Practical Academy's virtual labs (Chemistry, Physics, Biology…), for classes you teach the subject in." />
          ) : (
            <FormFields f={f} set={set} item={item} started={started} errors={errors} options={options.data} picks={picks} pick={pick} armOptions={armOptions} choosePractical={choosePractical} />
          )}
          {formError && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
              {formError}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {item ? (
            <Button onClick={() => void submit(false)} loading={pending}>
              Save changes
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => void submit(false)} loading={pending} disabled={!pick}>
                Save as draft
              </Button>
              <Button onClick={() => void submit(true)} loading={pending} disabled={!pick}>
                Schedule
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type FieldsProps = {
  f: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  item?: PracticalAssessmentSummary;
  started?: boolean;
  errors: Record<string, string>;
  options: ReturnType<typeof usePracticalTestOptions>['data'];
  picks: ReturnType<typeof usePracticalTestPicks>;
  pick: { title: string; maxScore: number; minutes: number; topic: string } | undefined;
  armOptions: { id: string; name: string }[];
  choosePractical: (id: string) => void;
};

function FormFields({ f, set, item, started, errors, options, picks, pick, armOptions, choosePractical }: FieldsProps) {
  const component = options?.components.find((c) => c.key === f.componentKey);
  return (
    <>
      {!item && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Subject" htmlFor="pt-subject" error={errors.subjectId}>
            <Select
              value={f.subjectId}
              onValueChange={(v) => {
                set('subjectId', v);
                set('practicalId', '');
                set('arms', (options?.subjects.find((s) => s.id === v)?.classArms.length ?? 0) === 1 ? [options!.subjects.find((s) => s.id === v)!.classArms[0]!.id] : []);
              }}
            >
              <SelectTrigger id="pt-subject" invalid={!!errors.subjectId}>
                <SelectValue placeholder="Choose a subject" />
              </SelectTrigger>
              <SelectContent>
                {options?.subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Practical (virtual lab)" htmlFor="pt-practical" error={errors.practicalId} hint={pick ? `${pick.topic} · marked out of ${pick.maxScore} · usual time ${pick.minutes} min` : 'Only practicals with a virtual lab can be set as a test.'}>
            {f.subjectId && picks.isLoading ? (
              <Skeleton className="h-10" />
            ) : (
              <Select value={f.practicalId} onValueChange={choosePractical} disabled={!f.subjectId}>
                <SelectTrigger id="pt-practical" invalid={!!errors.practicalId}>
                  <SelectValue placeholder={f.subjectId ? 'Choose a practical' : 'Pick the subject first'} />
                </SelectTrigger>
                <SelectContent>
                  {picks.data?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        </div>
      )}
      {(item || pick) && (
        <>
          <Field label="Title students see" htmlFor="pt-title" error={errors.title}>
            <Input id="pt-title" value={f.title} onChange={(e) => set('title', e.target.value)} invalid={!!errors.title} maxLength={160} />
          </Field>
          <Field label="Kind" htmlFor="pt-kind" hint={f.kind === 'EXAM' ? 'The lab’s exam mode: students go straight to the task, with no guidance, demo or lab assistant.' : 'The guided lab: Learn, Demo and Try with the lab assistant, on the clock.'}>
            <Select value={f.kind} onValueChange={(v) => set('kind', v as PracticalAssessmentKind)} disabled={started}>
              <SelectTrigger id="pt-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRACTICAL_ASSESSMENT_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {PRACTICAL_ASSESSMENT_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Classes" error={errors.classArmIds} hint={armOptions.length ? 'Classes you teach this subject in.' : undefined}>
            <div className="flex flex-wrap gap-2">
              {armOptions.map((a) => {
                const on = f.arms.includes(a.id);
                return (
                  <label key={a.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px] ${on ? 'border-brand bg-brand-soft' : 'border-border'} ${started ? 'pointer-events-none opacity-60' : ''}`}>
                    <Checkbox checked={on} disabled={started} onCheckedChange={(v) => set('arms', v ? [...f.arms, a.id] : f.arms.filter((x) => x !== a.id))} />
                    {a.name}
                  </label>
                );
              })}
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Opens" htmlFor="pt-open" error={errors.opensAt}>
              <Input id="pt-open" type="datetime-local" value={f.opensAt} onChange={(e) => set('opensAt', e.target.value)} disabled={started} invalid={!!errors.opensAt} />
            </Field>
            <Field label="Closes" htmlFor="pt-close" error={errors.closesAt}>
              <Input id="pt-close" type="datetime-local" value={f.closesAt} onChange={(e) => set('closesAt', e.target.value)} invalid={!!errors.closesAt} />
            </Field>
            <Field label="Duration (minutes)" htmlFor="pt-duration" error={errors.durationMinutes}>
              <Input id="pt-duration" type="number" inputMode="numeric" min={5} max={240} value={f.duration} onChange={(e) => set('duration', e.target.value)} disabled={started} invalid={!!errors.durationMinutes} />
            </Field>
          </div>
          <p className="-mt-2 text-[12px] text-muted-foreground">Each student gets the full duration from when they start, never past the closing time. When time is up the lab is handed in with what they recorded.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Term" htmlFor="pt-term" error={errors.termId}>
              <Select value={f.termId} onValueChange={(v) => set('termId', v)}>
                <SelectTrigger id="pt-term" invalid={!!errors.termId}>
                  <SelectValue placeholder="Choose a term" />
                </SelectTrigger>
                <SelectContent>
                  {options?.terms.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} · {t.sessionName}
                      {t.current ? ' (current)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Counts towards" htmlFor="pt-component" error={errors.componentKey} hint={component ? `Marks are scaled to ${component.name} (out of ${component.maxScore}) when you send them.` : 'Not copied to the score sheet.'}>
              <Select value={f.componentKey || NONE} onValueChange={(v) => set('componentKey', v === NONE ? '' : v)}>
                <SelectTrigger id="pt-component">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not for the score sheet</SelectItem>
                  {options?.components.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.name} (out of {c.maxScore})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Students see their results" htmlFor="pt-results">
              <Select value={f.showResults} onValueChange={(v) => set('showResults', v as CbtShowResults)}>
                <SelectTrigger id="pt-results">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CBT_SHOW_RESULTS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {CBT_SHOW_RESULTS_LABELS[s].replace('exam', 'test')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Access code" htmlFor="pt-code" optional error={errors.accessCode} hint="Read it out in the lab so only students present can start.">
              <Input id="pt-code" value={f.accessCode} onChange={(e) => set('accessCode', e.target.value.toUpperCase())} maxLength={20} placeholder="e.g. SS2-LAB" autoComplete="off" />
            </Field>
          </div>
        </>
      )}
    </>
  );
}
