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
import { BookOpen, Building2, CalendarDays, Layers, LayoutGrid, Timer } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, type FieldValues, useForm, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Field } from '@/components/ui/field';
import { FormDialog, SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { applyServerErrors, toOptionalNumber } from '@/lib/forms';
import { qk } from '@/lib/query-client';
import { type AcademicResource, useCreateAcademic } from './api';

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
export function SubjectDialog({ open, onOpenChange }: DialogProps) {
  const defaults: SubjectValues = { name: '', code: '', category: '', isCore: false };
  const form = useForm<SubjectValues, unknown, z.output<typeof subjectSchema>>({ resolver: zodResolver(subjectSchema), defaultValues: defaults });
  const { onSubmit, pending } = useCreateForm(form, 'subjects', 'Subject created', open, onOpenChange, defaults);
  const e = form.formState.errors;
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="New subject" icon={<BookOpen />} submitLabel="Create subject" pending={pending} onSubmit={onSubmit}>
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
