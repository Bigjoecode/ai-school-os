import { generateLessonSchema } from '@aischool/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { NotebookPen, PencilLine, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatDate } from '@/lib/format';
import { applyServerErrors, emptyToUndefined } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { useStructure } from '../academics/api';
import { ArmSelect, levelOfArm, SubjectSelect, termOptions } from '../planning/pickers';
import { useScheme, useSchemes } from '../schemes/api';
import { useGenerateLesson } from './api';

type Values = z.input<typeof generateLessonSchema>;
type Output = z.output<typeof generateLessonSchema>;

export interface PlanLessonDefaults {
  subjectId?: string;
  /** Restrict the class picker to this level's arms. */
  classLevelId?: string;
  classArmId?: string;
  schemeId?: string;
  schemeWeekId?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: PlanLessonDefaults;
}

type Mode = 'scheme' | 'topic';

export function PlanLessonDialog({ open, onOpenChange, defaults }: Props) {
  const navigate = useNavigate();
  const structure = useStructure();
  const generate = useGenerateLesson();
  const [mode, setMode] = useState<Mode>('scheme');
  const [schemeId, setSchemeId] = useState<string | undefined>();

  const levelArms = useMemo(
    () => structure.data?.classLevels.find((l) => l.id === defaults?.classLevelId)?.arms ?? [],
    [structure.data, defaults?.classLevelId],
  );

  const initial = (): Values => ({
    subjectId: defaults?.subjectId ?? '',
    classArmId: defaults?.classArmId ?? (levelArms.length === 1 ? levelArms[0].id : ''),
    schemeWeekId: defaults?.schemeWeekId,
    topic: undefined,
    date: undefined,
    durationMinutes: 40,
    guidance: '',
  });
  const form = useForm<Values, unknown, Output>({ resolver: zodResolver(generateLessonSchema), defaultValues: initial() });
  const e = form.formState.errors;

  useEffect(() => {
    if (open) {
      form.reset(initial());
      setMode('scheme');
      setSchemeId(defaults?.schemeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const subjectId = form.watch('subjectId');
  const classArmId = form.watch('classArmId');
  const level = levelOfArm(structure.data, classArmId) ?? structure.data?.classLevels.find((l) => l.id === defaults?.classLevelId);

  const schemes = useSchemes({ subjectId, classLevelId: level?.id }, open && !!subjectId && !!level);
  const schemeList = useMemo(() => (schemes.data ?? []).filter((s) => s.status !== 'ARCHIVED' && s.weekCount > 0), [schemes.data]);
  const terms = termOptions(structure.data);

  // Default to the current term's scheme once the list arrives.
  useEffect(() => {
    if (!open || !schemes.data) return;
    if (schemeId && schemeList.some((s) => s.id === schemeId)) return;
    const current = terms.find((t) => t.isCurrent);
    const pick = schemeList.find((s) => s.term.id === current?.id) ?? schemeList[0];
    setSchemeId(pick?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, schemes.data]);

  // No schemes for this subject/class → switch to a typed topic.
  useEffect(() => {
    if (open && schemes.data && schemeList.length === 0 && mode === 'scheme') switchMode('topic');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, schemes.data, schemeList.length]);

  const scheme = useScheme(mode === 'scheme' ? schemeId : undefined);
  const weeks = scheme.data?.weeks ?? [];

  const switchMode = (m: Mode) => {
    setMode(m);
    form.clearErrors(['topic', 'schemeWeekId']);
    if (m === 'topic') form.setValue('schemeWeekId', undefined);
    else form.setValue('topic', undefined);
  };

  const onSubmit = form.handleSubmit((values) => {
    const input = mode === 'scheme' ? { ...values, topic: undefined } : { ...values, schemeWeekId: undefined };
    generate.mutate(input, {
      onSuccess: (l) => {
        toast.success('Your lesson plan is being written', { description: 'It will be ready in a minute or two.' });
        onOpenChange(false);
        navigate(`/lessons/${l.id}`);
      },
      onError: (err) => {
        if (!applyServerErrors(err, form.setError)) toast.error(err.message);
      },
    });
  });

  const weekError = e.schemeWeekId?.message ?? (mode === 'scheme' ? e.topic?.message : undefined);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <div className="ai-border mb-2 grid size-10 place-items-center rounded-xl bg-card">
              <AiSparkle className="size-5" />
            </div>
            <DialogTitle>Plan a lesson with AI</DialogTitle>
            <DialogDescription>
              Objectives, a timed lesson flow, differentiation for every learner, assessment and homework — ready to edit and print.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Subject" htmlFor="pl-subject" error={e.subjectId?.message}>
                <Controller
                  control={form.control}
                  name="subjectId"
                  render={({ field }) => (
                    <SubjectSelect
                      id="pl-subject"
                      structure={structure.data}
                      value={field.value || undefined}
                      onChange={(v) => {
                        field.onChange(v ?? '');
                        form.setValue('schemeWeekId', undefined);
                      }}
                      invalid={!!e.subjectId}
                    />
                  )}
                />
              </Field>
              <Field label="Class" htmlFor="pl-arm" error={e.classArmId?.message}>
                <Controller
                  control={form.control}
                  name="classArmId"
                  render={({ field }) => (
                    <ArmSelect
                      id="pl-arm"
                      structure={structure.data}
                      levelId={defaults?.classLevelId}
                      value={field.value || undefined}
                      onChange={(v) => {
                        field.onChange(v ?? '');
                        if (levelOfArm(structure.data, v)?.id !== level?.id) form.setValue('schemeWeekId', undefined);
                      }}
                      invalid={!!e.classArmId}
                    />
                  )}
                />
              </Field>

              <div className="sm:col-span-2">
                <p className="mb-1.5 text-[13px] font-medium">What’s the lesson about?</p>
                <div role="radiogroup" aria-label="Lesson source" className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['scheme', NotebookPen, 'From the scheme of work'],
                      ['topic', PencilLine, 'My own topic'],
                    ] as const
                  ).map(([m, Icon, label]) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={mode === m}
                      onClick={() => switchMode(m)}
                      className={cn(
                        'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        mode === m ? 'border-brand bg-brand-soft text-brand' : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground',
                      )}
                    >
                      <Icon className="size-4 shrink-0" /> {label}
                    </button>
                  ))}
                </div>
              </div>

              {mode === 'scheme' ? (
                <>
                  <Field label="Scheme of work" htmlFor="pl-scheme">
                    <Select
                      value={schemeId ?? ''}
                      onValueChange={(v) => {
                        setSchemeId(v);
                        form.setValue('schemeWeekId', undefined);
                      }}
                      disabled={!subjectId || !level || schemeList.length === 0}
                    >
                      <SelectTrigger id="pl-scheme">
                        <SelectValue
                          placeholder={
                            !subjectId || !level
                              ? 'Pick a subject and class first'
                              : schemes.isLoading
                                ? 'Loading schemes…'
                                : 'No schemes for this subject and class'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {schemeList.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.term.name} · {s.term.sessionName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Week" htmlFor="pl-week" error={weekError}>
                    <Controller
                      control={form.control}
                      name="schemeWeekId"
                      render={({ field }) => (
                        <Select value={field.value ?? ''} onValueChange={field.onChange} disabled={!schemeId || scheme.isLoading}>
                          <SelectTrigger id="pl-week" invalid={!!weekError}>
                            <SelectValue placeholder={scheme.isLoading ? 'Loading weeks…' : 'Select a week'} />
                          </SelectTrigger>
                          <SelectContent>
                            {weeks.map((w) => (
                              <SelectItem key={w.id} value={w.id}>
                                Week {w.week}
                                {w.startsOn ? ` · ${formatDate(w.startsOn, { year: undefined })}` : ''} — {w.topic}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </Field>
                </>
              ) : (
                <Field label="Topic" htmlFor="pl-topic" className="sm:col-span-2" error={e.topic?.message}>
                  <Input
                    id="pl-topic"
                    autoComplete="off"
                    placeholder="e.g. Simple interest and compound interest"
                    invalid={!!e.topic}
                    {...form.register('topic', { setValueAs: emptyToUndefined })}
                  />
                </Field>
              )}

              <Field label="Date" htmlFor="pl-date" optional error={e.date?.message}>
                <Input id="pl-date" type="date" invalid={!!e.date} {...form.register('date', { setValueAs: emptyToUndefined })} />
              </Field>
              <Field label="Duration (minutes)" htmlFor="pl-duration" error={e.durationMinutes?.message}>
                <Input
                  id="pl-duration"
                  type="number"
                  min={20}
                  max={180}
                  step={5}
                  invalid={!!e.durationMinutes}
                  {...form.register('durationMinutes', { valueAsNumber: true })}
                />
              </Field>
              <Field label="Notes for the AI" htmlFor="pl-notes" optional className="sm:col-span-2" error={e.guidance?.message}>
                <Textarea
                  id="pl-notes"
                  rows={3}
                  placeholder="e.g. 42 learners, mixed ability; no projector today; three learners need extra reading support…"
                  {...form.register('guidance')}
                />
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="ai" loading={generate.isPending}>
              {!generate.isPending && <Sparkles />} Plan lesson
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
