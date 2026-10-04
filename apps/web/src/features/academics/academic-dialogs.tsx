import {
  type AcademicStructure,
  academicSessionSchema,
  branchSchema,
  classArmSchema,
  classLevelSchema,
  type Paginated,
  type StaffRow,
  subjectSchema,
  termSchema,
} from '@aischool/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BookOpen, Building2, CalendarDays, Layers, LayoutGrid, Pencil, Timer, Users } from 'lucide-react';
import { type BaseSyntheticEvent, useEffect, useState } from 'react';
import { Controller, type FieldValues, useForm, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FormDialog, SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { applyServerErrors, toOptionalNumber } from '@/lib/forms';
import { qk } from '@/lib/query-client';
import { type AcademicResource, useCreateAcademic, useSetSubjectClasses, useSubjectClasses, useUpdateSubject } from './api';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Shared create-mutation + reset wiring for the academic dialogs. */
function useCreateForm<V extends FieldValues, O>(
  form: UseFormReturn<V, unknown, O>,
  resource: AcademicResource,
  message: string,
  open: boolean,
  onOpenChange: (o: boolean) => void,
  defaults: V,
) {
  const create = useCreateAcademic<O>(resource, message);
  useEffect(() => {
    if (open) form.reset(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const onSubmit = form.handleSubmit((values) =>
    create.mutate(values, {
      onSuccess: () => onOpenChange(false),
      onError: (err) => {
        if (!applyServerErrors(err, form.setError)) toast.error(err.message);
      },
    }),
  );
  return { onSubmit, pending: create.isPending };
}

// ------------------------------------------------------------------ session
type SessionValues = z.input<typeof academicSessionSchema>;
export function SessionDialog({ open, onOpenChange }: DialogProps) {
  const y = new Date().getFullYear();
  const defaults: SessionValues = { name: `${y}/${y + 1}`, startsOn: `${y}-09-01`, endsOn: `${y + 1}-07-31`, isCurrent: false };
  const form = useForm<SessionValues, unknown, z.output<typeof academicSessionSchema>>({
    resolver: zodResolver(academicSessionSchema),
    defaultValues: defaults,
  });
  const { onSubmit, pending } = useCreateForm(form, 'sessions', 'Session created', open, onOpenChange, defaults);
  const e = form.formState.errors;
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="New academic session" description="A school year, e.g. 2026/2027." icon={<CalendarDays />} submitLabel="Create session" pending={pending} onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="ss-name" error={e.name?.message} className="sm:col-span-2">
          <Input id="ss-name" placeholder="2026/2027" invalid={!!e.name} {...form.register('name')} />
        </Field>
        <Field label="Starts on" htmlFor="ss-start" error={e.startsOn?.message}>
          <Input id="ss-start" type="date" invalid={!!e.startsOn} {...form.register('startsOn')} />
        </Field>
        <Field label="Ends on" htmlFor="ss-end" error={e.endsOn?.message}>
          <Input id="ss-end" type="date" invalid={!!e.endsOn} {...form.register('endsOn')} />
        </Field>
        <div className="sm:col-span-2">
          <Controller
            control={form.control}
            name="isCurrent"
            render={({ field }) => (
              <SwitchRow label="Make this the current session" description="Used across the dashboard and reports.">
                <Switch checked={!!field.value} onCheckedChange={field.onChange} />
              </SwitchRow>
            )}
          />
        </div>
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ term
type TermValues = z.input<typeof termSchema>;
export function TermDialog({ open, onOpenChange, structure, sessionId }: DialogProps & { structure?: AcademicStructure; sessionId?: string }) {
  const sessions = structure?.sessions ?? [];
  const session = sessions.find((s) => s.id === sessionId) ?? sessions.find((s) => s.isCurrent) ?? sessions[0];
  const nextOrder = (session?.terms.length ?? 0) + 1;
  const defaults: TermValues = {
    sessionId: session?.id ?? '',
    name: ['First Term', 'Second Term', 'Third Term'][nextOrder - 1] ?? `Term ${nextOrder}`,
    order: Math.min(nextOrder, 6),
    startsOn: '',
    endsOn: '',
    isCurrent: false,
  };
  const form = useForm<TermValues, unknown, z.output<typeof termSchema>>({ resolver: zodResolver(termSchema), defaultValues: defaults });
  const { onSubmit, pending } = useCreateForm(form, 'terms', 'Term created', open, onOpenChange, defaults);
  const e = form.formState.errors;
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="New term" description="Terms divide a session into teaching periods." icon={<Timer />} submitLabel="Create term" pending={pending} onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Session" htmlFor="t-session" error={e.sessionId?.message}>
          <Controller
            control={form.control}
            name="sessionId"
            render={({ field }) => (
              <Select value={field.value || undefined} onValueChange={field.onChange}>
                <SelectTrigger id="t-session" invalid={!!e.sessionId}>
                  <SelectValue placeholder="Select session" />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label="Order" htmlFor="t-order" error={e.order?.message}>
          <Input id="t-order" type="number" min={1} max={6} invalid={!!e.order} {...form.register('order', { valueAsNumber: true })} />
        </Field>
        <Field label="Name" htmlFor="t-name" error={e.name?.message} className="sm:col-span-2">
          <Input id="t-name" invalid={!!e.name} {...form.register('name')} />
        </Field>
        <Field label="Starts on" htmlFor="t-start" error={e.startsOn?.message}>
          <Input id="t-start" type="date" invalid={!!e.startsOn} {...form.register('startsOn')} />
        </Field>
        <Field label="Ends on" htmlFor="t-end" error={e.endsOn?.message}>
          <Input id="t-end" type="date" invalid={!!e.endsOn} {...form.register('endsOn')} />
        </Field>
        <div className="sm:col-span-2">
          <Controller
            control={form.control}
            name="isCurrent"
            render={({ field }) => (
              <SwitchRow label="Make this the current term">
                <Switch checked={!!field.value} onCheckedChange={field.onChange} />
              </SwitchRow>
            )}
          />
        </div>
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ class level
type LevelValues = z.input<typeof classLevelSchema>;
export function ClassLevelDialog({ open, onOpenChange, structure }: DialogProps & { structure?: AcademicStructure }) {
  const nextOrder = (structure?.classLevels.reduce((m, l) => Math.max(m, l.order), 0) ?? 0) + 1;
  const defaults: LevelValues = { name: '', code: '', stage: '', order: Math.min(nextOrder, 100) };
  const form = useForm<LevelValues, unknown, z.output<typeof classLevelSchema>>({ resolver: zodResolver(classLevelSchema), defaultValues: defaults });
  const { onSubmit, pending } = useCreateForm(form, 'class-levels', 'Class level created', open, onOpenChange, defaults);
  const e = form.formState.errors;
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="New class level" description="A year group such as JSS 1 or Primary 4." icon={<Layers />} submitLabel="Create level" pending={pending} onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="cl-name" error={e.name?.message}>
          <Input id="cl-name" placeholder="JSS 1" invalid={!!e.name} {...form.register('name')} />
        </Field>
        <Field label="Code" htmlFor="cl-code" error={e.code?.message}>
          <Input id="cl-code" placeholder="JSS1" className="uppercase" invalid={!!e.code} {...form.register('code')} />
        </Field>
        <Field label="Stage" htmlFor="cl-stage" optional hint="e.g. Nursery, Primary, Junior Secondary" error={e.stage?.message}>
          <Input id="cl-stage" {...form.register('stage')} />
        </Field>
        <Field label="Order" htmlFor="cl-order" hint="Sort position" error={e.order?.message}>
          <Input id="cl-order" type="number" min={0} max={100} invalid={!!e.order} {...form.register('order', { valueAsNumber: true })} />
        </Field>
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ class arm
type ArmValues = z.input<typeof classArmSchema>;
export function ClassArmDialog({ open, onOpenChange, structure, levelId }: DialogProps & { structure?: AcademicStructure; levelId?: string }) {
  const canStaff = useCan('staff.read');
  const teachers = useQuery({
    queryKey: qk.staff({ type: 'TEACHING', pageSize: 100, page: 1 }),
    queryFn: ({ signal }) => api.get<Paginated<StaffRow>>('/staff', { type: 'TEACHING', pageSize: 100, page: 1 }, signal),
    enabled: open && canStaff,
  });
  const levels = structure?.classLevels ?? [];
  const branches = structure?.branches ?? [];
  const defaults: ArmValues = { classLevelId: levelId ?? levels[0]?.id ?? '', name: '', capacity: 30 };
  const form = useForm<ArmValues, unknown, z.output<typeof classArmSchema>>({ resolver: zodResolver(classArmSchema), defaultValues: defaults });
  const { onSubmit, pending } = useCreateForm(form, 'class-arms', 'Class arm created', open, onOpenChange, defaults);
  const e = form.formState.errors;
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="New class arm" description="A stream within a level, e.g. JSS 1 A." icon={<LayoutGrid />} submitLabel="Create arm" pending={pending} onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Class level" htmlFor="ca-level" error={e.classLevelId?.message}>
          <Controller
            control={form.control}
            name="classLevelId"
            render={({ field }) => (
              <Select value={field.value || undefined} onValueChange={field.onChange}>
                <SelectTrigger id="ca-level" invalid={!!e.classLevelId}>
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  {levels.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label="Arm name" htmlFor="ca-name" error={e.name?.message}>
          <Input id="ca-name" placeholder="A, B, Gold…" invalid={!!e.name} {...form.register('name')} />
        </Field>
        <Field label="Capacity" htmlFor="ca-cap" optional error={e.capacity?.message}>
          <Input id="ca-cap" type="number" min={1} max={500} invalid={!!e.capacity} {...form.register('capacity', { setValueAs: toOptionalNumber })} />
        </Field>
        <Field label="Class teacher" htmlFor="ca-teacher" optional error={e.classTeacherId?.message}>
          <Controller
            control={form.control}
            name="classTeacherId"
            render={({ field }) => (
              <Select value={field.value ?? NONE} onValueChange={(v) => field.onChange(v === NONE ? undefined : v)}>
                <SelectTrigger id="ca-teacher" disabled={!canStaff}>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {teachers.data?.items.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.firstName} {t.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        {branches.length > 1 && (
          <Field label="Branch" htmlFor="ca-branch" optional className="sm:col-span-2">
            <Controller
              control={form.control}
              name="branchId"
              render={({ field }) => (
                <Select value={field.value ?? NONE} onValueChange={(v) => field.onChange(v === NONE ? undefined : v)}>
                  <SelectTrigger id="ca-branch">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Default</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        )}
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ subject
type SubjectValues = z.input<typeof subjectSchema>;
type SubjectRow = AcademicStructure['subjects'][number];
/** Creates a subject, or edits one when `subject` is given. */
export function SubjectDialog({ open, onOpenChange, subject }: DialogProps & { subject?: SubjectRow | null }) {
  const editing = !!subject;
  const defaults: SubjectValues = subject
    ? { name: subject.name, code: subject.code, category: subject.category ?? '', isCore: subject.isCore }
    : { name: '', code: '', category: '', isCore: false };
  const form = useForm<SubjectValues, unknown, z.output<typeof subjectSchema>>({ resolver: zodResolver(subjectSchema), defaultValues: defaults });
  const create = useCreateForm(form, 'subjects', 'Subject created', open && !editing, onOpenChange, defaults);
  const update = useUpdateSubject();
  useEffect(() => {
    if (open && editing) form.reset(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subject?.id]);
  const onUpdate = form.handleSubmit((values) =>
    update.mutate(
      // An emptied category is sent as null so the server clears it.
      { id: subject!.id, ...values, category: values.category ?? null },
      {
        onSuccess: () => onOpenChange(false),
        onError: (err) => {
          if (!applyServerErrors(err, form.setError)) toast.error(err.message);
        },
      },
    ),
  );
  const e = form.formState.errors;
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${subject.name}` : 'Add a subject'}
      description={editing ? undefined : 'Next, link it to the classes that take it and who teaches it.'}
      icon={editing ? <Pencil /> : <BookOpen />}
      submitLabel={editing ? 'Save changes' : 'Add subject'}
      pending={editing ? update.isPending : create.pending}
      onSubmit={editing ? onUpdate : create.onSubmit}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="sb-name" error={e.name?.message}>
          <Input id="sb-name" placeholder="Mathematics" invalid={!!e.name} {...form.register('name')} />
        </Field>
        <Field label="Code" htmlFor="sb-code" error={e.code?.message}>
          <Input id="sb-code" placeholder="MTH" className="uppercase" invalid={!!e.code} {...form.register('code')} />
        </Field>
        <Field label="Category" htmlFor="sb-cat" optional hint="e.g. Sciences, Languages, Arts" className="sm:col-span-2" error={e.category?.message}>
          <Input id="sb-cat" {...form.register('category')} />
        </Field>
        <div className="sm:col-span-2">
          <Controller
            control={form.control}
            name="isCore"
            render={({ field }) => (
              <SwitchRow label="Core subject" description="Compulsory for every student at this level.">
                <Switch checked={!!field.value} onCheckedChange={field.onChange} />
              </SwitchRow>
            )}
          />
        </div>
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ subject ↔ classes
type ArmState = { linked: boolean; teacherId: string | null };
const UNLINKED: ArmState = { linked: false, teacherId: null };

/** Tick the classes that take a subject and pick who teaches it in each. */
export function SubjectClassesDialog({ open, onOpenChange, subject }: DialogProps & { subject: SubjectRow | null }) {
  const query = useSubjectClasses(subject?.id);
  const save = useSetSubjectClasses(subject?.id ?? '');
  const data = query.data;
  const [state, setState] = useState<Record<string, ArmState>>({});
  const [bulkTeacher, setBulkTeacher] = useState<string>(NONE);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Take a fresh copy of the saved links each time the dialog opens.
  useEffect(() => {
    if (open) setLoadedFor(null);
  }, [open]);
  useEffect(() => {
    if (open && data && !query.isFetching && loadedFor !== data.subject.id) {
      const next: Record<string, ArmState> = {};
      for (const l of data.levels) for (const a of l.arms) next[a.id] = { linked: a.linked, teacherId: a.teacherId };
      setState(next);
      setBulkTeacher(NONE);
      setLoadedFor(data.subject.id);
    }
  }, [open, data, query.isFetching, loadedFor]);

  const levels = (data?.levels ?? []).filter((l) => l.arms.length > 0);
  const allArms = levels.flatMap((l) => l.arms.map((a) => ({ ...a, label: `${l.name} ${a.name}` })));
  const ticked = allArms.filter((a) => state[a.id]?.linked);
  const losingScores = allArms.filter((a) => a.linked && a.hasScores && !state[a.id]?.linked);
  const ready = loadedFor === subject?.id && !!data;
  const changed = ready && allArms.some((a) => (state[a.id]?.linked ?? false) !== a.linked || (state[a.id]?.linked && (state[a.id]?.teacherId ?? null) !== a.teacherId));

  const setArm = (id: string, patch: Partial<ArmState>) => setState((s) => ({ ...s, [id]: { ...(s[id] ?? UNLINKED), ...patch } }));
  const setLevel = (armIds: string[], linked: boolean) =>
    setState((s) => {
      const next = { ...s };
      for (const id of armIds) next[id] = { ...(next[id] ?? UNLINKED), linked };
      return next;
    });
  const applyBulk = () => {
    const teacherId = bulkTeacher === NONE ? null : bulkTeacher;
    setState((s) => {
      const next = { ...s };
      for (const a of ticked) next[a.id] = { ...next[a.id]!, teacherId };
      return next;
    });
  };

  const onSave = (ev?: BaseSyntheticEvent) => {
    ev?.preventDefault();
    if (!ready) return;
    save.mutate(
      ticked.map((a) => ({ classArmId: a.id, teacherId: state[a.id]?.teacherId ?? null })),
      {
        onSuccess: () => {
          toast.success(`${subject?.name} saved`, { description: `Taken by ${ticked.length} class${ticked.length === 1 ? '' : 'es'}.` });
          onOpenChange(false);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const teacherItems = (data?.teachers ?? []).map((t) => (
    <SelectItem key={t.id} value={t.id}>
      {t.name}
      {t.jobTitle ? <span className="text-muted-foreground"> · {t.jobTitle}</span> : null}
    </SelectItem>
  ));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <form onSubmit={onSave} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <div className="mb-2 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand [&_svg]:size-5">
              <Users />
            </div>
            <DialogTitle>{subject ? `${subject.name}: classes & teachers` : 'Classes & teachers'}</DialogTitle>
            <DialogDescription>
              Tick every class that takes this subject and choose who teaches it there. Ticked classes get it on their score sheets, timetables and
              report cards.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {query.error && !data ? (
              <ErrorState error={query.error} onRetry={() => void query.refetch()} />
            ) : !ready ? (
              <div className="space-y-3" aria-busy>
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-40 w-full rounded-xl" />
                <Skeleton className="h-40 w-full rounded-xl" />
              </div>
            ) : levels.length === 0 ? (
              <EmptyState
                icon={Layers}
                title="No classes yet"
                description="Add class levels and arms on the Classes tab first, then link this subject to them."
                compact
              />
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:flex-row sm:items-center">
                  <p className="text-[13px] sm:flex-1">
                    <span className="font-medium tabular">{ticked.length}</span> of <span className="tabular">{allArms.length}</span> classes ticked
                  </p>
                  <div className="flex min-w-0 items-center gap-2">
                    <Select value={bulkTeacher} onValueChange={setBulkTeacher}>
                      <SelectTrigger className="h-9 min-w-0 flex-1 sm:w-56" aria-label="Teacher for all ticked classes">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>No teacher</SelectItem>
                        {teacherItems}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="sm" className="shrink-0" disabled={ticked.length === 0} onClick={applyBulk}>
                      Same for all ticked
                    </Button>
                  </div>
                </div>

                {losingScores.length > 0 && (
                  <div role="alert" className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-[13px]">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                    <p className="min-w-0">
                      <span className="font-medium">{losingScores.map((a) => a.label).join(', ')} already {losingScores.length === 1 ? 'has' : 'have'} scores for this subject.</span>{' '}
                      <span className="text-muted-foreground">The scores are kept, but the subject will no longer appear on new score sheets for {losingScores.length === 1 ? 'that class' : 'those classes'}.</span>
                    </p>
                  </div>
                )}

                {levels.map((l) => {
                  const ids = l.arms.map((a) => a.id);
                  const on = ids.filter((id) => state[id]?.linked).length;
                  const levelState = on === 0 ? false : on === ids.length ? true : 'indeterminate';
                  return (
                    <section key={l.id} className="rounded-xl border border-border">
                      <label className="flex cursor-pointer items-center gap-3 border-b border-border bg-muted/30 px-4 py-2.5">
                        <Checkbox checked={levelState} onCheckedChange={(v) => setLevel(ids, v === true)} aria-label={`Select all of ${l.name}`} />
                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{l.name}</span>
                        <span className="shrink-0 text-[12px] text-muted-foreground tabular">
                          {on}/{ids.length}
                        </span>
                      </label>
                      <ul className="divide-y divide-border">
                        {l.arms.map((a) => {
                          const s = state[a.id] ?? UNLINKED;
                          const label = `${l.name} ${a.name}`;
                          return (
                            <li key={a.id} className="grid gap-2 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center">
                              <label className="flex min-w-0 cursor-pointer items-center gap-3">
                                <Checkbox checked={s.linked} onCheckedChange={(v) => setArm(a.id, { linked: v === true })} aria-label={label} />
                                <span className="truncate text-[13.5px]">{label}</span>
                                {a.hasScores && (
                                  <Badge variant="outline" className="shrink-0">
                                    Has scores
                                  </Badge>
                                )}
                              </label>
                              <Select
                                value={s.teacherId ?? NONE}
                                onValueChange={(v) => setArm(a.id, { teacherId: v === NONE ? null : v, linked: true })}
                                disabled={!s.linked}
                              >
                                <SelectTrigger className="h-9" aria-label={`Teacher for ${label}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={NONE}>No teacher yet</SelectItem>
                                  {teacherItems}
                                </SelectContent>
                              </Select>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!ready || !changed}>
              Save classes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ branch
type BranchValues = z.input<typeof branchSchema>;
export function BranchDialog({ open, onOpenChange }: DialogProps) {
  const defaults: BranchValues = { name: '', code: '', address: '', isMain: false };
  const form = useForm<BranchValues, unknown, z.output<typeof branchSchema>>({ resolver: zodResolver(branchSchema), defaultValues: defaults });
  const { onSubmit, pending } = useCreateForm(form, 'branches', 'Branch created', open, onOpenChange, defaults);
  const e = form.formState.errors;
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="New branch" description="A campus or site of your school." icon={<Building2 />} submitLabel="Create branch" pending={pending} onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="br-name" error={e.name?.message}>
          <Input id="br-name" placeholder="Lekki Campus" invalid={!!e.name} {...form.register('name')} />
        </Field>
        <Field label="Code" htmlFor="br-code" error={e.code?.message}>
          <Input id="br-code" placeholder="LEK" className="uppercase" invalid={!!e.code} {...form.register('code')} />
        </Field>
        <Field label="Address" htmlFor="br-addr" optional className="sm:col-span-2" error={e.address?.message}>
          <Input id="br-addr" {...form.register('address')} />
        </Field>
        <div className="sm:col-span-2">
          <Controller
            control={form.control}
            name="isMain"
            render={({ field }) => (
              <SwitchRow label="Main campus">
                <Switch checked={!!field.value} onCheckedChange={field.onChange} />
              </SwitchRow>
            )}
          />
        </div>
      </div>
    </FormDialog>
  );
}
