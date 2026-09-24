import { createCurriculumSchema, generateCurriculumSchema } from '@aischool/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { BookOpen, Sparkles } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { applyServerErrors } from '@/lib/forms';
import { useStructure } from '../academics/api';
import { LevelSelect, SubjectSelect } from '../planning/pickers';
import { useCreateCurriculum, useGenerateCurriculum } from './api';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: { subjectId?: string; classLevelId?: string };
}

type GenerateValues = z.input<typeof generateCurriculumSchema>;
type GenerateOutput = z.output<typeof generateCurriculumSchema>;

export function GenerateCurriculumDialog({ open, onOpenChange, defaults }: DialogProps) {
  const navigate = useNavigate();
  const structure = useStructure();
  const generate = useGenerateCurriculum();
  const initial = (): GenerateValues => ({
    subjectId: defaults?.subjectId ?? '',
    classLevelId: defaults?.classLevelId ?? '',
    weeksPerTerm: 11,
    guidance: '',
  });
  const form = useForm<GenerateValues, unknown, GenerateOutput>({
    resolver: zodResolver(generateCurriculumSchema),
    defaultValues: initial(),
  });
  const e = form.formState.errors;

  useEffect(() => {
    if (open) form.reset(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = form.handleSubmit((values) =>
    generate.mutate(values, {
      onSuccess: (c) => {
        toast.success('Your curriculum is being written', { description: 'This usually takes 1–3 minutes.' });
        onOpenChange(false);
        navigate(`/curriculum/${c.id}`);
      },
      onError: (err) => {
        if (!applyServerErrors(err, form.setError)) toast.error(err.message);
      },
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <div className="ai-border mb-2 grid size-10 place-items-center rounded-xl bg-card">
              <AiSparkle className="size-5" />
            </div>
            <DialogTitle>Generate a curriculum with AI</DialogTitle>
            <DialogDescription>
              AI drafts a full year — three terms, week by week — with objectives, activities, resources and assessment. You can edit
              everything before publishing.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Subject" htmlFor="gc-subject" error={e.subjectId?.message}>
                <Controller
                  control={form.control}
                  name="subjectId"
                  render={({ field }) => (
                    <SubjectSelect
                      id="gc-subject"
                      structure={structure.data}
                      value={field.value || undefined}
                      onChange={(v) => field.onChange(v ?? '')}
                      invalid={!!e.subjectId}
                      disabled={structure.isLoading}
                    />
                  )}
                />
              </Field>
              <Field label="Class level" htmlFor="gc-level" error={e.classLevelId?.message}>
                <Controller
                  control={form.control}
                  name="classLevelId"
                  render={({ field }) => (
                    <LevelSelect
                      id="gc-level"
                      structure={structure.data}
                      value={field.value || undefined}
                      onChange={(v) => field.onChange(v ?? '')}
                      invalid={!!e.classLevelId}
                      disabled={structure.isLoading}
                    />
                  )}
                />
              </Field>
              <Field label="Weeks per term" htmlFor="gc-weeks" hint="Teaching weeks, 6–14" error={e.weeksPerTerm?.message}>
                <Input
                  id="gc-weeks"
                  type="number"
                  min={6}
                  max={14}
                  invalid={!!e.weeksPerTerm}
                  {...form.register('weeksPerTerm', { valueAsNumber: true })}
                />
              </Field>
              <Field
                label="Guidance for the AI"
                htmlFor="gc-guidance"
                optional
                className="sm:col-span-2"
                hint="Anything the AI should know about your school, learners or calendar."
                error={e.guidance?.message}
              >
                <Textarea
                  id="gc-guidance"
                  rows={4}
                  placeholder="e.g. Emphasise problem solving and real-life Nigerian examples; our first term is 10 weeks; include a revision week before exams…"
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
              {!generate.isPending && <Sparkles />} Generate curriculum
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type BlankValues = z.input<typeof createCurriculumSchema>;
type BlankOutput = z.output<typeof createCurriculumSchema>;

export function BlankCurriculumDialog({ open, onOpenChange, defaults }: DialogProps) {
  const navigate = useNavigate();
  const structure = useStructure();
  const create = useCreateCurriculum();
  const initial = (): BlankValues => ({
    subjectId: defaults?.subjectId ?? '',
    classLevelId: defaults?.classLevelId ?? '',
    weeksPerTerm: 11,
    title: undefined,
  });
  const form = useForm<BlankValues, unknown, BlankOutput>({
    resolver: zodResolver(createCurriculumSchema),
    defaultValues: initial(),
  });
  const e = form.formState.errors;

  useEffect(() => {
    if (open) form.reset(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = form.handleSubmit((values) =>
    create.mutate(values, {
      onSuccess: (c) => {
        toast.success('Blank curriculum created', { description: 'Add weeks to each term as you go.' });
        onOpenChange(false);
        navigate(`/curriculum/${c.id}`);
      },
      onError: (err) => {
        if (!applyServerErrors(err, form.setError)) toast.error(err.message);
      },
    }),
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Start a blank curriculum"
      description="Create an empty curriculum and write it week by week yourself."
      icon={<BookOpen />}
      submitLabel="Create curriculum"
      pending={create.isPending}
      onSubmit={onSubmit}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Subject" htmlFor="bc-subject" error={e.subjectId?.message}>
          <Controller
            control={form.control}
            name="subjectId"
            render={({ field }) => (
              <SubjectSelect
                id="bc-subject"
                structure={structure.data}
                value={field.value || undefined}
                onChange={(v) => field.onChange(v ?? '')}
                invalid={!!e.subjectId}
              />
            )}
          />
        </Field>
        <Field label="Class level" htmlFor="bc-level" error={e.classLevelId?.message}>
          <Controller
            control={form.control}
            name="classLevelId"
            render={({ field }) => (
              <LevelSelect
                id="bc-level"
                structure={structure.data}
                value={field.value || undefined}
                onChange={(v) => field.onChange(v ?? '')}
                invalid={!!e.classLevelId}
              />
            )}
          />
        </Field>
        <Field label="Title" htmlFor="bc-title" optional hint="Defaults to “Subject — Class”" error={e.title?.message}>
          <Input
            id="bc-title"
            autoComplete="off"
            invalid={!!e.title}
            {...form.register('title', { setValueAs: (v: string) => (v?.trim() ? v : undefined) })}
          />
        </Field>
        <Field label="Weeks per term" htmlFor="bc-weeks" error={e.weeksPerTerm?.message}>
          <Input id="bc-weeks" type="number" min={6} max={14} invalid={!!e.weeksPerTerm} {...form.register('weeksPerTerm', { valueAsNumber: true })} />
        </Field>
      </div>
    </FormDialog>
  );
}
