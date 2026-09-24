import { LESSON_STATUSES, type LessonDetail, type UpdateLessonInput } from '@aischool/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookMarked,
  CalendarDays,
  CheckCircle2,
  Clock,
  GraduationCap,
  House,
  ListChecks,
  MoreHorizontal,
  NotebookPen,
  Package,
  Pencil,
  Plus,
  Presentation,
  Printer,
  RotateCw,
  Target,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import type * as React from 'react';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Page } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { formatDate, toDateInput } from '@/lib/format';
import { applyServerErrors } from '@/lib/forms';
import { useDocumentTitle } from '@/lib/hooks';
import { cn, titleCase } from '@/lib/utils';
import { RegenerateDialog } from '../planning/detail-bits';
import {
  BackLink,
  BulletList,
  ContentStatusBadge,
  DetailSkeleton,
  FailedPanel,
  GeneratingPanel,
  isGenerating,
  LinesTextarea,
  linesToList,
  listToLines,
} from '../planning/ui';
import { useDeleteLesson, useLesson, useRegenerateLesson, useUpdateLesson } from './api';

export default function LessonDetailPage() {
  const { id = '' } = useParams();
  const query = useLesson(id);
  const l = query.data;

  if (query.isLoading) {
    return (
      <Page className="max-w-4xl">
        <DetailSkeleton />
      </Page>
    );
  }
  if (!l) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <Page className="max-w-4xl">
        <BackLink to="/lessons">Lesson Plans</BackLink>
        {notFound ? (
          <EmptyState icon={Presentation} title="Lesson plan not found" description="It may have been deleted." />
        ) : (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        )}
      </Page>
    );
  }
  return <LessonView l={l} />;
}

function LessonView({ l }: { l: LessonDetail }) {
  useDocumentTitle(l.topic);
  const navigate = useNavigate();
  // The server says whether this lesson is yours to change (or you manage the curriculum).
  const canManage = useCan('lessons.manage') && l.canEdit;
  const canAi = useCan('ai.use');
  const update = useUpdateLesson(l.id);
  const regenerate = useRegenerateLesson(l.id);
  const remove = useDeleteLesson();
  const [editing, setEditing] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const generating = isGenerating(l.generation);
  const editable = canManage && !generating;
  const doRegenerate = (guidance?: string) => regenerate.mutate(guidance, { onSuccess: () => setRegenOpen(false) });

  return (
    <Page className="max-w-4xl print:max-w-none print:p-0">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <BackLink to="/lessons">Lesson Plans</BackLink>
        {!editing && (
          <div className="flex flex-wrap items-center gap-2">
            {editable && (
              <Select value={l.status} onValueChange={(v) => update.mutate({ status: v as LessonDetail['status'] })}>
                <SelectTrigger className="h-9 w-36" aria-label="Lesson status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LESSON_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {titleCase(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {editable && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil /> Edit
              </Button>
            )}
            <Button variant="outline" onClick={() => window.print()} disabled={generating}>
              <Printer /> Print
            </Button>
            {canManage && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="More actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canAi && (
                    <DropdownMenuItem disabled={generating} onSelect={() => setRegenOpen(true)}>
                      <RotateCw /> Rewrite with AI
                    </DropdownMenuItem>
                  )}
                  {l.schemeWeek && (
                    <DropdownMenuItem asChild>
                      <Link to={`/schemes/${l.schemeWeek.schemeId}`}>
                        <NotebookPen /> Open scheme of work
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => setDeleteOpen(true)}>
                    <Trash2 /> Delete lesson plan
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>

      {generating ? (
        <>
          <DocHeader l={l} />
          <div className="mt-6">
            <GeneratingPanel noun="lesson plan" state={l.generation} />
          </div>
        </>
      ) : editing ? (
        <LessonEditor l={l} onDone={() => setEditing(false)} />
      ) : (
        <div className="space-y-5">
          {l.generation === 'FAILED' && (
            <div className="print:hidden">
              <FailedPanel
                noun="lesson plan"
                message={l.generationError}
                onRetry={canManage && canAi ? () => doRegenerate(l.guidance ?? undefined) : undefined}
                retrying={regenerate.isPending}
              />
            </div>
          )}
          <LessonDocument l={l} />
        </div>
      )}

      <RegenerateDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        noun="lesson plan"
        pending={regenerate.isPending}
        defaultGuidance={l.guidance}
        onConfirm={doRegenerate}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this lesson plan?"
        description={`“${l.topic}” will be permanently deleted.`}
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(l.id, {
            onSuccess: () => {
              setDeleteOpen(false);
              navigate('/lessons');
            },
          })
        }
      />
    </Page>
  );
}

// ------------------------------------------------------------------ document

function DocHeader({ l }: { l: LessonDetail }) {
  const meta: [React.ElementType, string, string][] = [
    [BookMarked, 'Subject', l.subject.name],
    [Users, 'Class', `${l.classArm.levelName} ${l.classArm.name}`],
    [CalendarDays, 'Date', l.date ? formatDate(l.date, { weekday: 'short' }) : 'Not scheduled'],
    [Clock, 'Duration', `${l.durationMinutes} minutes`],
    [User, 'Teacher', l.teacher?.name ?? '—'],
  ];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-soft print:rounded-none print:border-0 print:border-b print:shadow-none">
      <div aria-hidden className="h-1 w-full bg-ai-gradient print:h-0.5" />
      <div className="p-5 sm:p-7 print:px-0">
        <div className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-muted-foreground">
          <span className="uppercase tracking-[0.12em]">Lesson plan</span>
          {l.schemeWeek && <span>· Scheme week {l.schemeWeek.week}</span>}
          <ContentStatusBadge status={l.status} className="ml-auto" />
        </div>
        <h1 className="mt-2 font-display text-2xl font-semibold leading-tight tracking-tight sm:text-[30px]">{l.topic}</h1>
        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5 print:grid-cols-5">
          {meta.map(([Icon, label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <Icon className="size-3.5" /> {label}
              </dt>
              <dd className="mt-0.5 truncate text-[13.5px] font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
  className,
  aside,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  className?: string;
  aside?: React.ReactNode;
}) {
  return (
    <section className={cn('print-avoid-break', className)}>
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-brand-soft text-brand">
          <Icon className="size-3.5" />
        </span>
        <h2 className="font-display text-[15px] font-semibold tracking-tight">{title}</h2>
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

function LessonDocument({ l }: { l: LessonDetail }) {
  const total = l.steps.reduce((n, s) => n + (s.minutes || 0), 0);
  const mismatch = l.steps.length > 0 && total !== l.durationMinutes;
  let elapsed = 0;

  return (
    <article className="print-doc space-y-5">
      <DocHeader l={l} />

      <Card className="space-y-8 p-5 sm:p-7 print:border-0 print:p-0 print:shadow-none">
        <div className="grid gap-8 md:grid-cols-2 print:grid-cols-2">
          <Section icon={Target} title="Learning objectives">
            {l.objectives.length ? (
              <ol className="space-y-2 text-[13.5px] leading-relaxed">
                {l.objectives.map((o, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold tabular text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0">{o}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[13px] italic text-muted-foreground">No objectives yet</p>
            )}
          </Section>
          <div className="space-y-8">
            <Section icon={GraduationCap} title="Prior knowledge">
              <p className="whitespace-pre-line text-[13.5px] leading-relaxed">
                {l.priorKnowledge || <span className="italic text-muted-foreground">Not specified</span>}
              </p>
            </Section>
            <Section icon={Package} title="Materials">
              <BulletList items={l.materials} empty="No materials listed" />
            </Section>
          </div>
        </div>

        <Section
          icon={Clock}
          title="Lesson flow"
          aside={
            l.steps.length > 0 && (
              <span className={cn('inline-flex items-center gap-1.5 text-[12.5px] tabular', mismatch ? 'text-warning' : 'text-muted-foreground')}>
                {mismatch ? <AlertTriangle className="size-3.5" /> : <CheckCircle2 className="size-3.5 text-success" />}
                {total} of {l.durationMinutes} min
              </span>
            )
          }
        >
          {mismatch && (
            <p role="note" className="mb-3 rounded-lg bg-warning-soft px-3 py-2 text-[12.5px] text-warning print:hidden">
              The steps add up to {total} minutes but the lesson is {l.durationMinutes} minutes long.
            </p>
          )}
          {l.steps.length === 0 ? (
            <p className="text-[13px] italic text-muted-foreground">No steps yet</p>
          ) : (
            <ol className="relative space-y-3">
              <span aria-hidden className="absolute bottom-4 left-[27px] top-4 w-px bg-border" />
              {l.steps.map((s, i) => {
                const from = elapsed;
                elapsed += s.minutes || 0;
                return (
                  <li key={i} className="print-avoid-break relative flex gap-4">
                    <div className="relative z-10 flex w-14 shrink-0 flex-col items-center rounded-xl border border-border bg-card py-1.5 text-center">
                      <span className="font-display text-[15px] font-semibold leading-tight tabular">{s.minutes}</span>
                      <span className="text-[10px] text-muted-foreground">min</span>
                    </div>
                    <div className="min-w-0 flex-1 rounded-xl border border-border bg-muted/30 p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="font-display text-[14.5px] font-semibold tracking-tight">
                          <span className="text-muted-foreground">{i + 1}. </span>
                          {s.title}
                        </h3>
                        <span className="text-[11.5px] tabular text-muted-foreground">
                          {from}–{elapsed} min
                        </span>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 print:grid-cols-2">
                        <div>
                          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Teacher</p>
                          <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed">{s.teacherActivity || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Learners</p>
                          <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed">{s.learnerActivity || '—'}</p>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Section>

        <Section icon={Users} title="Differentiation">
          {l.differentiation ? (
            <div className="grid gap-3 md:grid-cols-3 print:grid-cols-3">
              {(
                [
                  ['Support', l.differentiation.support, 'border-info/30 bg-info-soft/60', 'text-info'],
                  ['Core', l.differentiation.core, 'border-brand/25 bg-brand-soft/60', 'text-brand'],
                  ['Stretch', l.differentiation.stretch, 'border-success/30 bg-success-soft/60', 'text-success'],
                ] as const
              ).map(([label, text, box, tone]) => (
                <div key={label} className={cn('rounded-xl border p-4', box)}>
                  <p className={cn('text-[11px] font-semibold uppercase tracking-wider', tone)}>{label}</p>
                  <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed">{text || '—'}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] italic text-muted-foreground">Not specified</p>
          )}
        </Section>

        <div className="grid gap-8 md:grid-cols-2 print:grid-cols-2">
          <Section icon={ListChecks} title="Assessment">
            <BulletList items={l.assessment} empty="No assessment yet" />
          </Section>
          <Section icon={House} title="Homework">
            <p className="whitespace-pre-line text-[13.5px] leading-relaxed">
              {l.homework || <span className="italic text-muted-foreground">No homework set</span>}
            </p>
          </Section>
        </div>
      </Card>

      <p className="hidden text-center text-[10px] text-muted-foreground print:block">
        Generated with AI School OS · {l.subject.name} · {l.classArm.levelName} {l.classArm.name}
      </p>
      <p className="flex items-center justify-center gap-1.5 text-[11.5px] text-muted-foreground print:hidden">
        <AiSparkle className="size-3" animated={false} /> Drafted with AI — always review before teaching.
      </p>
    </article>
  );
}

// ------------------------------------------------------------------ editor

const lines = z
  .string()
  .refine((v) => linesToList(v).length <= 12, 'Keep it to 12 lines or fewer')
  .refine((v) => linesToList(v).every((x) => x.length <= 400), 'Each line must be 400 characters or fewer');

const editorSchema = z.object({
  topic: z.string().trim().min(1, 'Enter a topic').max(200),
  date: z.string(),
  durationMinutes: z.number({ error: 'Enter minutes' }).int().min(20, 'At least 20 minutes').max(180, 'At most 180 minutes'),
  objectives: lines,
  priorKnowledge: z.string().max(2000),
  materials: lines,
  steps: z
    .array(
      z.object({
        title: z.string().trim().min(1, 'Name this step').max(200),
        minutes: z.number({ error: 'Minutes' }).int().min(1, '1+').max(180),
        teacherActivity: z.string().max(2000),
        learnerActivity: z.string().max(2000),
      }),
    )
    .max(15, 'Up to 15 steps'),
  support: z.string().max(2000),
  core: z.string().max(2000),
  stretch: z.string().max(2000),
  assessment: lines,
  homework: z.string().max(2000),
});
type EditorValues = z.infer<typeof editorSchema>;

function toEditor(l: LessonDetail): EditorValues {
  return {
    topic: l.topic,
    date: toDateInput(l.date),
    durationMinutes: l.durationMinutes,
    objectives: listToLines(l.objectives),
    priorKnowledge: l.priorKnowledge ?? '',
    materials: listToLines(l.materials),
    steps: l.steps.map((s) => ({ ...s })),
    support: l.differentiation?.support ?? '',
    core: l.differentiation?.core ?? '',
    stretch: l.differentiation?.stretch ?? '',
    assessment: listToLines(l.assessment),
    homework: l.homework ?? '',
  };
}

function LessonEditor({ l, onDone }: { l: LessonDetail; onDone: () => void }) {
  const update = useUpdateLesson(l.id);
  const form = useForm<EditorValues>({ resolver: zodResolver(editorSchema), defaultValues: toEditor(l) });
  const steps = useFieldArray({ control: form.control, name: 'steps' });
  const e = form.formState.errors;
  const { register } = form;

  const watchedSteps = form.watch('steps');
  const duration = form.watch('durationMinutes');
  const total = watchedSteps.reduce((n, s) => n + (Number.isFinite(s.minutes) ? s.minutes : 0), 0);
  const mismatch = watchedSteps.length > 0 && Number.isFinite(duration) && total !== duration;

  const submit = form.handleSubmit((v) => {
    const input: UpdateLessonInput = {
      topic: v.topic.trim(),
      date: v.date || null,
      durationMinutes: v.durationMinutes,
      objectives: linesToList(v.objectives),
      priorKnowledge: v.priorKnowledge.trim(),
      materials: linesToList(v.materials),
      steps: v.steps.map((s) => ({ ...s, title: s.title.trim(), teacherActivity: s.teacherActivity.trim(), learnerActivity: s.learnerActivity.trim() })),
      differentiation: { support: v.support.trim(), core: v.core.trim(), stretch: v.stretch.trim() },
      assessment: linesToList(v.assessment),
      homework: v.homework.trim(),
    };
    update.mutate(input, {
      onSuccess: () => {
        toast.success('Lesson plan saved');
        onDone();
      },
      onError: (err) => {
        applyServerErrors(err, form.setError);
      },
    });
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Card className="grid gap-4 p-5 sm:grid-cols-4 sm:p-6">
        <Field label="Topic" htmlFor="le-topic" className="sm:col-span-2" error={e.topic?.message}>
          <Input id="le-topic" invalid={!!e.topic} {...register('topic')} />
        </Field>
        <Field label="Date" htmlFor="le-date" optional error={e.date?.message}>
          <Input id="le-date" type="date" {...register('date')} />
        </Field>
        <Field label="Duration (min)" htmlFor="le-duration" error={e.durationMinutes?.message}>
          <Input id="le-duration" type="number" min={20} max={180} step={5} invalid={!!e.durationMinutes} {...register('durationMinutes', { valueAsNumber: true })} />
        </Field>
      </Card>

      <Card className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
        <Field label="Learning objectives" htmlFor="le-obj" hint="One per line" error={e.objectives?.message}>
          <LinesTextarea id="le-obj" rows={5} invalid={!!e.objectives} {...register('objectives')} />
        </Field>
        <Field label="Materials" htmlFor="le-mat" hint="One per line" error={e.materials?.message}>
          <LinesTextarea id="le-mat" rows={5} invalid={!!e.materials} {...register('materials')} />
        </Field>
        <Field label="Prior knowledge" htmlFor="le-prior" className="sm:col-span-2" error={e.priorKnowledge?.message}>
          <Textarea id="le-prior" rows={3} {...register('priorKnowledge')} />
        </Field>
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="font-display text-[15px] font-semibold tracking-tight">Lesson flow</h2>
          <span
            className={cn('inline-flex items-center gap-1.5 text-[12.5px] tabular', mismatch ? 'text-warning' : 'text-muted-foreground')}
            aria-live="polite"
          >
            {mismatch && <AlertTriangle className="size-3.5" />}
            {total} of {Number.isFinite(duration) ? duration : '—'} min
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={steps.fields.length >= 15}
            onClick={() => steps.append({ title: '', minutes: 5, teacherActivity: '', learnerActivity: '' })}
          >
            <Plus /> Add step
          </Button>
        </div>
        {e.steps?.message && <p className="mb-3 text-[12px] font-medium text-danger">{e.steps.message}</p>}
        {steps.fields.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
            No steps yet — add the starter, main activities and plenary.
          </p>
        ) : (
          <ol className="space-y-3">
            {steps.fields.map((f, i) => {
              const se = e.steps?.[i];
              return (
                <li key={f.id} className="rounded-xl border border-border bg-muted/30 p-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-2 grid size-6 shrink-0 place-items-center rounded-full bg-card text-[11.5px] font-semibold tabular shadow-xs">
                      {i + 1}
                    </span>
                    <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[1fr_110px]">
                      <Field label="Step" htmlFor={`st-${f.id}-title`} error={se?.title?.message}>
                        <Input id={`st-${f.id}-title`} placeholder="e.g. Starter" invalid={!!se?.title} {...register(`steps.${i}.title`)} />
                      </Field>
                      <Field label="Minutes" htmlFor={`st-${f.id}-min`} error={se?.minutes?.message}>
                        <Input
                          id={`st-${f.id}-min`}
                          type="number"
                          min={1}
                          max={180}
                          invalid={!!se?.minutes}
                          {...register(`steps.${i}.minutes`, { valueAsNumber: true })}
                        />
                      </Field>
                      <Field label="Teacher activity" htmlFor={`st-${f.id}-t`} error={se?.teacherActivity?.message}>
                        <Textarea id={`st-${f.id}-t`} rows={3} {...register(`steps.${i}.teacherActivity`)} />
                      </Field>
                      <Field label="Learner activity" htmlFor={`st-${f.id}-l`} error={se?.learnerActivity?.message}>
                        <Textarea id={`st-${f.id}-l`} rows={3} {...register(`steps.${i}.learnerActivity`)} />
                      </Field>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => steps.move(i, i - 1)}>
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Move step ${i + 1} down`}
                        disabled={i === steps.fields.length - 1}
                        onClick={() => steps.move(i, i + 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove step ${i + 1}`} onClick={() => steps.remove(i)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="mb-4 font-display text-[15px] font-semibold tracking-tight">Differentiation</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Support" htmlFor="le-support" hint="For learners who need more help" error={e.support?.message}>
            <Textarea id="le-support" rows={4} {...register('support')} />
          </Field>
          <Field label="Core" htmlFor="le-core" hint="For most of the class" error={e.core?.message}>
            <Textarea id="le-core" rows={4} {...register('core')} />
          </Field>
          <Field label="Stretch" htmlFor="le-stretch" hint="For learners ready for more" error={e.stretch?.message}>
            <Textarea id="le-stretch" rows={4} {...register('stretch')} />
          </Field>
        </div>
      </Card>

      <Card className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
        <Field label="Assessment" htmlFor="le-assess" hint="One per line" error={e.assessment?.message}>
          <LinesTextarea id="le-assess" rows={4} invalid={!!e.assessment} {...register('assessment')} />
        </Field>
        <Field label="Homework" htmlFor="le-hw" error={e.homework?.message}>
          <Textarea id="le-hw" rows={4} {...register('homework')} />
        </Field>
      </Card>

      <div className="glass sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-2 border-t border-border px-4 py-3 sm:mx-0 sm:rounded-2xl sm:border">
        {mismatch && (
          <p className="mr-auto hidden items-center gap-1.5 text-[12.5px] text-warning sm:flex">
            <AlertTriangle className="size-3.5" /> Steps total {total} min
          </p>
        )}
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={update.isPending}>
          Save lesson plan
        </Button>
      </div>
    </form>
  );
}
