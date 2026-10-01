import { type Channel, type HomeworkRow, homeworkSchema } from '@aischool/shared';
import { AlertTriangle, ArrowDown, ArrowUp, CalendarClock, ChevronDown, ClipboardList, MoreHorizontal, Pencil, Plus, Send, Trash2, Video, X } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { armOptions, useStructure } from '../academics/api';
import { apiFieldErrors, dateInput, FormError, Segmented, zodErrors } from '../operations/ui';
import { useSearchFlag } from '../planning/ui';
import { type HomeworkParams, useDeleteHomework, useHomework, useSaveHomework } from './api';
import { addDays, ChannelChooser, dayLabel, relativeDay, schoolToday, useSchoolTz } from './ui';

type Due = 'UPCOMING' | 'PAST' | 'ALL';
type Status = 'ALL' | 'PUBLISHED' | 'DRAFT';

export default function HomeworkPage() {
  const tz = useSchoolTz();
  const today = schoolToday(tz);
  const structure = useStructure();
  const arms = armOptions(structure.data);
  const subjects = [...(structure.data?.subjects ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const [classArmId, setClassArmId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [due, setDue] = useState<Due>('UPCOMING');
  const [status, setStatus] = useState<Status>('ALL');
  const [creating, setCreating] = useSearchFlag('new');
  const [editing, setEditing] = useState<HomeworkRow | null>(null);
  const [deleting, setDeleting] = useState<HomeworkRow | null>(null);
  const del = useDeleteHomework();

  const params: HomeworkParams = { classArmId: classArmId || undefined, subjectId: subjectId || undefined, due: due === 'ALL' ? undefined : due, status: status === 'ALL' ? undefined : status };
  const q = useHomework(params);
  const filtered = !!(classArmId || subjectId || status !== 'ALL');

  return (
    <Page className="max-w-6xl">
      <PageHeader
        title="Homework"
        description="Set homework for your classes. Students and parents see it in their portal, and parents can be told by message."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> Set homework
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="When"
            value={due}
            onChange={setDue}
            options={[
              { value: 'UPCOMING', label: 'Upcoming' },
              { value: 'PAST', label: 'Past' },
              { value: 'ALL', label: 'All' },
            ]}
          />
          <Segmented
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'ALL', label: 'Any status' },
              { value: 'PUBLISHED', label: 'Published' },
              { value: 'DRAFT', label: 'Drafts' },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex [&>*]:min-w-0">
          <Select value={classArmId || NONE} onValueChange={(v) => setClassArmId(v === NONE ? '' : v)}>
            <SelectTrigger className="h-9 sm:w-44" aria-label="Filter by class">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All classes</SelectItem>
              {arms.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={subjectId || NONE} onValueChange={(v) => setSubjectId(v === NONE ? '' : v)}>
            <SelectTrigger className="h-9 sm:w-44" aria-label="Filter by subject">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All subjects</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {q.error && !q.data ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : !q.data ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : q.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title={filtered ? 'No homework matches' : due === 'PAST' ? 'No past homework' : 'No homework set yet'}
            description={
              filtered
                ? 'Try clearing the filters.'
                : 'Set it by hand here, or let the AI write it from a live class — open a class you’ve taught and use “Set as homework” on its summary.'
            }
            action={
              filtered ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setClassArmId('');
                    setSubjectId('');
                    setStatus('ALL');
                  }}
                >
                  <X /> Clear filters
                </Button>
              ) : (
                <Button onClick={() => setCreating(true)}>
                  <Plus /> Set homework
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <ul className={cn('space-y-2 transition-opacity', q.isPlaceholderData && 'opacity-60')}>
          {q.data.map((h) => (
            <li key={h.id}>
              <HomeworkItem h={h} today={today} onEdit={() => setEditing(h)} onDelete={() => setDeleting(h)} />
            </li>
          ))}
        </ul>
      )}

      <HomeworkSheet open={creating || !!editing} onOpenChange={(o) => {
          if (o) return;
          setCreating(false);
          setEditing(null);
        }} homework={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Remove “${deleting?.title ?? ''}”?`}
        description={deleting?.status === 'PUBLISHED' ? 'Students and parents will no longer see it. Messages already sent can’t be called back.' : 'The draft is deleted.'}
        confirmLabel="Remove homework"
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </Page>
  );
}

function DueChip({ h, today }: { h: HomeworkRow; today: string }) {
  const due = h.dueDate.slice(0, 10);
  if (h.overdue && h.status === 'PUBLISHED') {
    return (
      <Badge variant="danger" className="gap-1">
        <AlertTriangle /> Was due {dayLabel(due, { day: 'numeric', month: 'short' })}
      </Badge>
    );
  }
  const soon = due <= addDays(today, 1);
  const rel = relativeDay(due, today);
  const label = due < today ? `Was due ${dayLabel(due)}` : rel === 'Today' || rel === 'Tomorrow' ? `Due ${rel.toLowerCase()}` : `Due ${dayLabel(due)}`;
  return (
    <Badge variant={soon && due >= today ? 'warning' : 'outline'} className="gap-1">
      <CalendarClock /> {label}
    </Badge>
  );
}

function HomeworkItem({ h, today, onEdit, onDelete }: { h: HomeworkRow; today: string; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const panelId = `hw-${h.id}`;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <span className={cn('mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl', h.source === 'AI' ? 'bg-ai-gradient text-white' : 'bg-muted text-muted-foreground')}>
          {h.source === 'AI' ? <AiSparkle className="size-4 [&_path]:fill-white" animated={false} /> : <ClipboardList className="size-4" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={panelId}
            className="flex w-full min-w-0 items-center gap-1.5 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0 truncate text-[14px] font-medium">{h.title}</span>
            <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
          </button>
          <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
            {h.classArm.name}
            {h.subject && ` · ${h.subject.name}`}
            {h.teacher && ` · ${h.teacher}`}
            {h.questions.length > 0 && ` · ${h.questions.length} ${h.questions.length === 1 ? 'question' : 'questions'}`}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {h.status === 'DRAFT' ? <Badge variant="secondary">Draft</Badge> : <Badge variant="success" dot>Published</Badge>}
            <DueChip h={h} today={today} />
            {h.source === 'AI' && h.liveClassId && (
              <Link
                to={`/live/${h.liveClassId}`}
                className="inline-flex items-center gap-1 rounded-full border border-ai-2/30 px-2 py-0.5 text-[11px] font-medium leading-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Video className="size-3" aria-hidden /> From a live class
              </Link>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${h.title}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> {h.status === 'DRAFT' ? 'Edit or publish' : 'Edit'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDelete} className="text-danger focus:text-danger">
              <Trash2 /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {open && (
        <div id={panelId} className="border-t border-border bg-muted/20 px-4 py-3.5 sm:pl-16">
          <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">{h.instructions}</p>
          {h.questions.length > 0 && (
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed marker:text-muted-foreground">
              {h.questions.map((q, i) => (
                <li key={i} className="break-words pl-1">
                  {q}
                </li>
              ))}
            </ol>
          )}
          <Button variant="outline" size="sm" className="mt-3" onClick={onEdit}>
            <Pencil /> Edit
          </Button>
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ set / edit

interface Values {
  classArmId: string;
  subjectId: string;
  title: string;
  instructions: string;
  questions: string[];
  dueDate: string;
  publish: boolean;
  notify: Channel[];
}

export function HomeworkSheet({ open, onOpenChange, homework }: { open: boolean; onOpenChange: (o: boolean) => void; homework?: HomeworkRow | null }) {
  const tz = useSchoolTz();
  const structure = useStructure(open);
  const save = useSaveHomework();
  const [v, setV] = useState<Values | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<Values>) => setV((p) => (p ? { ...p, ...patch } : p));
  const editing = !!homework;
  const published = homework?.status === 'PUBLISHED';
  const arms = useMemo(() => armOptions(structure.data), [structure.data]);
  const subjects = useMemo(() => [...(structure.data?.subjects ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [structure.data]);

  useEffect(() => {
    if (!open) {
      setV(null);
      return;
    }
    setErrors({});
    setV(
      homework
        ? {
            classArmId: homework.classArm.id,
            subjectId: homework.subject?.id ?? '',
            title: homework.title,
            instructions: homework.instructions,
            questions: homework.questions.length ? homework.questions : [''],
            dueDate: homework.dueDate.slice(0, 10),
            publish: homework.status === 'PUBLISHED',
            notify: ['IN_APP'],
          }
        : { classArmId: '', subjectId: '', title: '', instructions: '', questions: [''], dueDate: addDays(schoolToday(tz), 2), publish: true, notify: ['IN_APP'] },
    );
  }, [open, homework, tz]);

  const setQuestion = (i: number, text: string) => set({ questions: v!.questions.map((q, j) => (j === i ? text : q)) });
  const move = (i: number, by: number) => {
    const qs = [...v!.questions];
    const [x] = qs.splice(i, 1);
    qs.splice(i + by, 0, x!);
    set({ questions: qs });
  };

  const submit = (publish: boolean) => (e?: FormEvent) => {
    e?.preventDefault();
    if (!v) return;
    const input = {
      classArmId: v.classArmId,
      subjectId: v.subjectId || null,
      title: v.title,
      instructions: v.instructions,
      questions: v.questions.map((q) => q.trim()).filter(Boolean),
      dueDate: v.dueDate,
      publish,
      notifyParents: publish && !published ? v.notify : [],
    };
    const parsed = homeworkSchema.safeParse(input);
    const errs = parsed.success ? {} : zodErrors(parsed.error.issues);
    if (!v.classArmId) errs.classArmId = 'Choose a class';
    if (!v.dueDate) errs.dueDate = 'Pick a due date';
    setErrors(errs);
    if (!parsed.success || Object.keys(errs).length) return;
    save.mutate({ id: homework?.id, input: parsed.data }, { onSuccess: () => onOpenChange(false), onError: (err) => setErrors(apiFieldErrors(err)) });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="font-display text-lg font-semibold tracking-tight">{editing ? 'Edit homework' : 'Set homework'}</SheetTitle>
          <SheetDescription className="text-[13px] text-muted-foreground">
            {published ? 'Changes show to students and parents straight away. Parents aren’t messaged again.' : 'Publish it now, or save a draft to finish later.'}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {!v ? (
            <Skeleton className="h-80 w-full" />
          ) : (
            <form id="hw-form" onSubmit={submit(v.publish)} noValidate className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                <Field label="Class" htmlFor="hw-arm" error={errors.classArmId} hint={editing ? 'The class can’t be changed.' : undefined}>
                  <Select value={v.classArmId || undefined} onValueChange={(classArmId) => set({ classArmId })} disabled={editing}>
                    <SelectTrigger id="hw-arm" invalid={!!errors.classArmId}>
                      <SelectValue placeholder={structure.isLoading ? 'Loading classes…' : 'Choose a class'} />
                    </SelectTrigger>
                    <SelectContent>
                      {arms.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Subject" htmlFor="hw-subject" optional>
                  <Select value={v.subjectId || NONE} onValueChange={(s) => set({ subjectId: s === NONE ? '' : s })}>
                    <SelectTrigger id="hw-subject">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No subject</SelectItem>
                      {subjects.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Title" htmlFor="hw-title" error={errors.title}>
                <Input id="hw-title" value={v.title} onChange={(e) => set({ title: e.target.value })} maxLength={160} placeholder="e.g. Simultaneous equations practice" invalid={!!errors.title} />
              </Field>
              <Field label="Instructions" htmlFor="hw-instr" error={errors.instructions}>
                <Textarea id="hw-instr" rows={3} value={v.instructions} onChange={(e) => set({ instructions: e.target.value })} maxLength={3000} placeholder="What to do, and how to hand it in" invalid={!!errors.instructions} />
              </Field>

              <fieldset className="grid gap-2">
                <legend className="mb-1.5 flex w-full items-center justify-between text-[13px] font-medium">
                  Questions <span className="text-[11px] font-normal text-muted-foreground">Optional · {v.questions.filter((q) => q.trim()).length}/30</span>
                </legend>
                <ol className="grid gap-2">
                  {v.questions.map((q, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-2.5 w-5 shrink-0 text-right text-[12px] font-semibold tabular text-muted-foreground">{i + 1}.</span>
                      <Textarea
                        rows={1}
                        value={q}
                        onChange={(e) => setQuestion(i, e.target.value)}
                        maxLength={1000}
                        aria-label={`Question ${i + 1}`}
                        className="min-h-10 min-w-0 flex-1 resize-y py-2"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey && i === v.questions.length - 1 && q.trim() && v.questions.length < 30) {
                            e.preventDefault();
                            set({ questions: [...v.questions, ''] });
                          }
                        }}
                      />
                      <div className="flex shrink-0 flex-col">
                        <Button type="button" variant="ghost" size="icon-sm" className="size-5" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move question ${i + 1} up`}>
                          <ArrowUp className="!size-3" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" className="size-5" disabled={i === v.questions.length - 1} onClick={() => move(i, 1)} aria-label={`Move question ${i + 1} down`}>
                          <ArrowDown className="!size-3" />
                        </Button>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => set({ questions: v.questions.length === 1 ? [''] : v.questions.filter((_, j) => j !== i) })}
                        aria-label={`Remove question ${i + 1}`}
                      >
                        <X />
                      </Button>
                    </li>
                  ))}
                </ol>
                {errors.questions && (
                  <p role="alert" className="text-[12px] font-medium text-danger">
                    {errors.questions}
                  </p>
                )}
                <Button type="button" variant="outline" size="sm" className="justify-self-start" disabled={v.questions.length >= 30} onClick={() => set({ questions: [...v.questions, ''] })}>
                  <Plus /> Add a question
                </Button>
              </fieldset>

              <Field label="Due" htmlFor="hw-due" error={errors.dueDate}>
                <Input id="hw-due" type="date" value={v.dueDate} min={editing ? undefined : schoolToday(tz)} onChange={(e) => set({ dueDate: e.target.value })} className={cn(dateInput, 'sm:w-48')} invalid={!!errors.dueDate} />
              </Field>

              {!published && (
                <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-3.5">
                  <Segmented
                    label="Publish or draft"
                    value={v.publish ? 'publish' : 'draft'}
                    onChange={(x) => set({ publish: x === 'publish' })}
                    options={[
                      { value: 'publish', label: 'Publish now' },
                      { value: 'draft', label: 'Save as draft' },
                    ]}
                    className="self-start"
                  />
                  {v.publish ? (
                    <div className="grid gap-1.5">
                      <Label>Tell parents</Label>
                      <ChannelChooser value={v.notify} onChange={(notify) => set({ notify })} label="Tell parents by" />
                    </div>
                  ) : (
                    <p className="text-[12.5px] text-muted-foreground">Only staff see drafts. Publish when you’re ready.</p>
                  )}
                </div>
              )}
              <FormError message={errors.form ?? errors.notifyParents} />
            </form>
          )}
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="hw-form" loading={save.isPending} disabled={!v}>
            {!save.isPending && (v?.publish && !published ? <Send /> : null)}
            {published ? 'Save changes' : v?.publish ? 'Publish homework' : 'Save draft'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
