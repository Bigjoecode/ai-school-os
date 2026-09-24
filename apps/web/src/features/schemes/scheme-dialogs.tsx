import { generateSchemeSchema } from '@aischool/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, BookOpen, Globe2, Info, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { useStructure } from '../academics/api';
import { pickSourceCurriculum, useCurricula } from '../curriculum/api';
import { currentTerm, LevelSelect, SubjectSelect, TermSelect } from '../planning/pickers';
import { useGenerateScheme, useSchemes } from './api';

type Values = z.input<typeof generateSchemeSchema>;
type Output = z.output<typeof generateSchemeSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: { subjectId?: string; classLevelId?: string; termId?: string };
}

export function GenerateSchemeDialog({ open, onOpenChange, defaults }: Props) {
  const navigate = useNavigate();
  const structure = useStructure();
  const generate = useGenerateScheme();
  const [conflict, setConflict] = useState(false);

  const initial = (): Values => ({
    subjectId: defaults?.subjectId ?? '',
    classLevelId: defaults?.classLevelId ?? '',
    termId: defaults?.termId ?? currentTerm(structure.data)?.id ?? '',
    guidance: '',
  });
  const form = useForm<Values, unknown, Output>({ resolver: zodResolver(generateSchemeSchema), defaultValues: initial() });
  const e = form.formState.errors;

  useEffect(() => {
    if (open) {
      form.reset(initial());
      setConflict(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fill in the current term once the structure arrives.
  useEffect(() => {
    if (open && !form.getValues('termId') && structure.data) {
      const t = currentTerm(structure.data);
      if (t) form.setValue('termId', t.id);
    }
  }, [open, structure.data, form]);

  const subjectId = form.watch('subjectId');
  const classLevelId = form.watch('classLevelId');
  const termId = form.watch('termId');
  const pair = !!subjectId && !!classLevelId;

  const curricula = useCurricula({ subjectId, classLevelId }, open && pair);
  const source = pickSourceCurriculum(curricula.data);
  const existing = useSchemes({ subjectId, classLevelId, termId }, open && pair && !!termId);
  const existingScheme = existing.data?.[0];

  const onSubmit = form.handleSubmit((values) =>
    generate.mutate(values, {
      onSuccess: (s) => {
        toast.success('Your scheme of work is being written', { description: 'This usually takes 1–3 minutes.' });
        onOpenChange(false);
        navigate(`/schemes/${s.id}`);
      },
      onError: (err) => {
        if (err instanceof ApiError && err.status === 409) {
          setConflict(true);
          void existing.refetch();
        }
        if (!applyServerErrors(err, form.setError)) toast.error(err.message);
      },
    }),
  );

  const selectedSubject = structure.data?.subjects.find((s) => s.id === subjectId);
  const selectedLevel = structure.data?.classLevels.find((l) => l.id === classLevelId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <div className="ai-border mb-2 grid size-10 place-items-center rounded-xl bg-card">
              <AiSparkle className="size-5" />
            </div>
            <DialogTitle>Generate a scheme of work</DialogTitle>
            <DialogDescription>
              AI plans the term week by week, using the real term dates, and builds on your curriculum where one exists.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Subject" htmlFor="gs-subject" error={e.subjectId?.message}>
                <Controller
                  control={form.control}
                  name="subjectId"
                  render={({ field }) => (
                    <SubjectSelect
                      id="gs-subject"
                      structure={structure.data}
                      value={field.value || undefined}
                      onChange={(v) => {
                        field.onChange(v ?? '');
                        setConflict(false);
                      }}
                      invalid={!!e.subjectId}
                    />
                  )}
                />
              </Field>
              <Field label="Class level" htmlFor="gs-level" error={e.classLevelId?.message}>
                <Controller
                  control={form.control}
                  name="classLevelId"
                  render={({ field }) => (
                    <LevelSelect
                      id="gs-level"
                      structure={structure.data}
                      value={field.value || undefined}
                      onChange={(v) => {
                        field.onChange(v ?? '');
                        setConflict(false);
                      }}
                      invalid={!!e.classLevelId}
                    />
                  )}
                />
              </Field>
              <Field label="Term" htmlFor="gs-term" className="sm:col-span-2" error={e.termId?.message}>
                <Controller
                  control={form.control}
                  name="termId"
                  render={({ field }) => (
                    <TermSelect
                      id="gs-term"
                      structure={structure.data}
                      value={field.value || undefined}
                      onChange={(v) => {
                        field.onChange(v ?? '');
                        form.clearErrors('termId');
                        setConflict(false);
                      }}
                      invalid={!!e.termId}
                    />
                  )}
                />
              </Field>

              {pair && (
                <div className="sm:col-span-2">
                  {curricula.isLoading ? (
                    <Skeleton className="h-14 w-full rounded-xl" />
                  ) : source ? (
                    <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
                      <BookOpen className="mt-0.5 size-4 shrink-0 text-brand" />
                      <div className="min-w-0 text-[13px]">
                        <p className="font-medium">
                          Built from {source.subject.name} — {source.classLevel.name} v{source.version}
                        </p>
                        <p className="text-muted-foreground">
                          {source.status === 'PUBLISHED' ? 'The published curriculum' : 'The latest draft curriculum (nothing published yet)'} ·{' '}
                          {source.unitCount} weeks planned
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 rounded-xl border border-dashed border-border px-4 py-3">
                      <Globe2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 text-[13px]">
                        <p className="font-medium">No curriculum on record — AI will plan from the national curriculum</p>
                        <p className="text-muted-foreground">
                          For tighter alignment,{' '}
                          <Link to="/curriculum?new=1" className="font-medium text-brand hover:underline" onClick={() => onOpenChange(false)}>
                            generate a curriculum
                          </Link>{' '}
                          for {selectedSubject?.name ?? 'this subject'} {selectedLevel ? `— ${selectedLevel.name}` : ''} first.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {existingScheme && (
                <div
                  role={conflict ? 'alert' : undefined}
                  className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 sm:col-span-2 sm:flex-row sm:items-center"
                >
                  <Info className="size-4 shrink-0 text-warning" />
                  <p className="min-w-0 flex-1 text-[13px]">
                    <span className="font-medium">A scheme already exists for this term.</span>{' '}
                    <span className="text-muted-foreground">Open it, or delete it to start again.</span>
                  </p>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/schemes/${existingScheme.id}`} onClick={() => onOpenChange(false)}>
                      Open scheme <ArrowRight />
                    </Link>
                  </Button>
                </div>
              )}

              <Field label="Guidance for the AI" htmlFor="gs-guidance" optional className="sm:col-span-2" error={e.guidance?.message}>
                <Textarea
                  id="gs-guidance"
                  rows={3}
                  placeholder="e.g. Week 6 is mid-term break; leave the last week for revision and exams; we have a science lab on Thursdays…"
                  {...form.register('guidance')}
                />
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="ai" loading={generate.isPending} disabled={!!existingScheme}>
              {!generate.isPending && <Sparkles />} Generate scheme
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
