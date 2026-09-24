import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { applyServerErrors } from '@/lib/forms';
import { LinesTextarea, linesToList, listToLines } from './ui';

const lines = z
  .string()
  .max(6000)
  .refine((v) => linesToList(v).length <= 12, 'Keep it to 12 lines or fewer')
  .refine((v) => linesToList(v).every((l) => l.length <= 400), 'Each line must be 400 characters or fewer');

const weekFormSchema = z.object({
  termOrder: z.number().int().min(1).max(3),
  week: z.number({ error: 'Enter a week number' }).int().min(1, 'Week 1 or later').max(20, 'Week 20 or earlier'),
  topic: z.string().trim().min(1, 'Enter a topic').max(200),
  subtopics: lines,
  objectives: lines,
  activities: lines,
  resources: lines,
  assessment: lines,
});
type WeekFormValues = z.infer<typeof weekFormSchema>;

export interface WeekContent {
  topic: string;
  subtopics: string[];
  objectives: string[];
  activities: string[];
  resources: string[];
  /** "Assessment" for curricula, "Evaluation" for schemes. */
  assessment: string[];
}

interface WeekSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Show term + week number inputs (adding a curriculum week). */
  withPosition?: boolean;
  initial?: Partial<WeekContent> & { termOrder?: number; week?: number };
  assessmentLabel?: string;
  pending?: boolean;
  submitLabel?: string;
  onSubmit: (values: WeekContent & { termOrder: number; week: number }) => Promise<unknown>;
}

function toForm(initial: WeekSheetProps['initial']): WeekFormValues {
  return {
    termOrder: initial?.termOrder ?? 1,
    week: initial?.week ?? 1,
    topic: initial?.topic ?? '',
    subtopics: listToLines(initial?.subtopics),
    objectives: listToLines(initial?.objectives),
    activities: listToLines(initial?.activities),
    resources: listToLines(initial?.resources),
    assessment: listToLines(initial?.assessment),
  };
}

/** Edit one week of a curriculum or scheme; list fields are one item per line. */
export function WeekSheet({
  open,
  onOpenChange,
  title,
  description,
  withPosition,
  initial,
  assessmentLabel = 'Assessment',
  pending,
  submitLabel = 'Save week',
  onSubmit,
}: WeekSheetProps) {
  const form = useForm<WeekFormValues>({ resolver: zodResolver(weekFormSchema), defaultValues: toForm(initial) });
  const e = form.formState.errors;

  useEffect(() => {
    if (open) form.reset(toForm(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = form.handleSubmit(async (v) => {
    try {
      await onSubmit({
        termOrder: v.termOrder,
        week: v.week,
        topic: v.topic.trim(),
        subtopics: linesToList(v.subtopics),
        objectives: linesToList(v.objectives),
        activities: linesToList(v.activities),
        resources: linesToList(v.resources),
        assessment: linesToList(v.assessment),
      });
      onOpenChange(false);
    } catch (err) {
      if (!applyServerErrors(err, form.setError)) toast.error(err instanceof Error ? err.message : 'Could not save this week');
    }
  });

  const hint = 'One per line';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle className="font-display text-lg font-semibold tracking-tight">{title}</SheetTitle>
            <SheetDescription className="text-[13px] text-muted-foreground">
              {description ?? 'Lists are edited one item per line.'}
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="grid content-start gap-4">
            {withPosition && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Term" htmlFor="wk-term" error={e.termOrder?.message}>
                  <select
                    id="wk-term"
                    className="flex h-10 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15"
                    {...form.register('termOrder', { valueAsNumber: true })}
                  >
                    <option value={1}>Term 1</option>
                    <option value={2}>Term 2</option>
                    <option value={3}>Term 3</option>
                  </select>
                </Field>
                <Field label="Week" htmlFor="wk-week" error={e.week?.message}>
                  <Input id="wk-week" type="number" min={1} max={20} invalid={!!e.week} {...form.register('week', { valueAsNumber: true })} />
                </Field>
              </div>
            )}
            <Field label="Topic" htmlFor="wk-topic" error={e.topic?.message}>
              <Input id="wk-topic" autoComplete="off" invalid={!!e.topic} {...form.register('topic')} />
            </Field>
            <Field label="Subtopics" htmlFor="wk-sub" hint={hint} error={e.subtopics?.message}>
              <LinesTextarea id="wk-sub" rows={3} invalid={!!e.subtopics} {...form.register('subtopics')} />
            </Field>
            <Field label="Objectives" htmlFor="wk-obj" hint="One per line — “By the end of the week, learners can…”" error={e.objectives?.message}>
              <LinesTextarea id="wk-obj" invalid={!!e.objectives} {...form.register('objectives')} />
            </Field>
            <Field label="Activities" htmlFor="wk-act" hint={hint} error={e.activities?.message}>
              <LinesTextarea id="wk-act" invalid={!!e.activities} {...form.register('activities')} />
            </Field>
            <Field label="Resources" htmlFor="wk-res" hint={hint} error={e.resources?.message}>
              <LinesTextarea id="wk-res" rows={3} invalid={!!e.resources} {...form.register('resources')} />
            </Field>
            <Field label={assessmentLabel} htmlFor="wk-ass" hint={hint} error={e.assessment?.message}>
              <LinesTextarea id="wk-ass" rows={3} invalid={!!e.assessment} {...form.register('assessment')} />
            </Field>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {submitLabel}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
