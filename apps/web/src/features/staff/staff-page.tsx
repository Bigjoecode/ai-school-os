import { GENDERS, type Paginated, STAFF_TYPES, type StaffRow, staffSchema } from '@aischool/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { Briefcase, Mail, Pencil, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { type Column, DataTable, Pagination } from '@/components/ui/data-table';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchInput } from '@/components/ui/search-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { formatDate, formatNumber } from '@/lib/format';
import { applyServerErrors, emptyToUndefined } from '@/lib/forms';
import { useDebounced } from '@/lib/hooks';
import { qk } from '@/lib/query-client';
import { initials, titleCase } from '@/lib/utils';
import { invalidateStaff, type StaffAction, StaffActionDialogs, StaffActionsMenu, StaffStatusBadge } from './staff-actions';

const PAGE_SIZE = 20;
/** Add and edit share one form; status (Active / On leave) only shows when editing. */
const staffFormSchema = staffSchema.extend({ status: z.enum(['ACTIVE', 'ON_LEAVE']).optional() });
type StaffValues = z.input<typeof staffFormSchema>;
type StaffOutput = z.output<typeof staffFormSchema>;
type TypeFilter = 'ALL' | (typeof STAFF_TYPES)[number];

export default function StaffPage() {
  const [params, setParams] = useSearchParams();
  const canManage = useCan('staff.manage');
  const canHr = useCan('hr.read');
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [type, setType] = useState<TypeFilter>('ALL');
  const [showLeft, setShowLeft] = useState(false);
  const [editing, setEditing] = useState<{ staff: StaffRow; open: boolean } | null>(null);
  const [action, setAction] = useState<StaffAction>(null);
  const q = useDebounced(search.trim(), 300);
  const query = { q: q || undefined, page, pageSize: PAGE_SIZE, type: type === 'ALL' ? undefined : type, status: showLeft ? 'ALL' : 'CURRENT' };
  const list = useQuery({
    queryKey: qk.staff(query),
    queryFn: ({ signal }) => api.get<Paginated<StaffRow>>('/staff', query, signal),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.items;
  const menu = (s: StaffRow) => (
    <StaffActionsMenu staff={s} onEdit={() => setEditing({ staff: s, open: true })} onAction={(kind) => setAction({ kind, staff: s, open: true })} />
  );

  const addOpen = params.get('new') === '1';
  const setAddOpen = (open: boolean) => {
    const next = new URLSearchParams(params);
    if (open) next.set('new', '1');
    else next.delete('new');
    setParams(next, { replace: true });
  };

  const columns: Column<StaffRow>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (s) => (
        <div className="flex items-center gap-3">
          <Avatar name={`${s.firstName} ${s.lastName}`} initials={initials(s.firstName, s.lastName)} />
          <div className="min-w-0">
            <p className="truncate font-medium">
              {s.firstName} {s.lastName}
            </p>
            <p className="font-mono text-[12px] text-muted-foreground">{s.staffNumber}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      cell: (s) => (
        <div>
          <p>{s.jobTitle}</p>
          <Badge variant={s.type === 'TEACHING' ? 'brand' : 'secondary'} className="mt-1">
            {titleCase(s.type)}
          </Badge>
        </div>
      ),
    },
    {
      key: 'classes',
      header: 'Class teacher of',
      cell: (s) =>
        s.classesLed.length ? (
          <div className="flex flex-wrap gap-1">
            {s.classesLed.map((c) => (
              <span key={c.id} className="rounded-full bg-muted px-2 py-0.5 text-[12px]">
                {c.name}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'contact',
      header: 'Contact',
      cell: (s) => (
        <div className="text-[13px] text-muted-foreground">
          {s.email && (
            <p className="flex items-center gap-1.5">
              <Mail className="size-3.5" /> {s.email}
            </p>
          )}
          {s.phone && <p>{s.phone}</p>}
          {!s.email && !s.phone && '—'}
        </div>
      ),
    },
    { key: 'employed', header: 'Employed', cell: (s) => <span className="text-muted-foreground">{formatDate(s.employedOn)}</span> },
    { key: 'status', header: 'Status', cell: (s) => <StaffStatusBadge status={s.status} /> },
    ...(canManage ? [{ key: 'actions', header: <span className="sr-only">Actions</span>, className: 'w-12 text-right', cell: menu }] : []),
  ];

  return (
    <Page>
      <PageHeader
        title="Teachers & Staff"
        description={list.data ? `${formatNumber(list.data.total)} team members` : 'Everyone who keeps your school running.'}
        actions={
          canManage && (
            <Button onClick={() => setAddOpen(true)}>
              <Plus /> Add staff
            </Button>
          )
        }
      />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search staff…"
            className="lg:max-w-sm lg:flex-1"
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="flex items-center gap-2">
              <Switch id="staff-show-left" checked={showLeft} onCheckedChange={(v) => { setShowLeft(v); setPage(1); }} />
              <Label htmlFor="staff-show-left" className="cursor-pointer whitespace-nowrap text-[13px] font-normal text-muted-foreground">
                Show people who have left
              </Label>
            </div>
            <Tabs
              value={type}
              onValueChange={(v) => {
                setType(v as TypeFilter);
                setPage(1);
              }}
            >
              <TabsList>
                <TabsTrigger value="ALL">All</TabsTrigger>
                <TabsTrigger value="TEACHING">Teaching</TabsTrigger>
                <TabsTrigger value="NON_TEACHING">Non-teaching</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(s) => s.id}
          loading={list.isFetching}
          error={list.error}
          onRetry={() => void list.refetch()}
          onRowClick={canHr ? (s) => navigate(`/hr/employees/${s.id}`) : undefined}
          rowLabel={(s) => `Open ${s.firstName} ${s.lastName}’s HR record`}
          renderMobile={(s) => (
            <div className="flex items-center gap-3">
              <Avatar name={`${s.firstName} ${s.lastName}`} initials={initials(s.firstName, s.lastName)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">
                  {s.firstName} {s.lastName}
                </p>
                <p className="truncate text-[12.5px] text-muted-foreground">
                  {s.jobTitle} · {titleCase(s.type)}
                </p>
              </div>
              <StaffStatusBadge status={s.status} />
            </div>
          )}
          mobileActions={canManage ? menu : undefined}
          empty={{
            icon: Briefcase,
            title: q || type !== 'ALL' ? 'No staff match' : 'No staff yet',
            description:
              q || type !== 'ALL'
                  ? 'Try a different search or filter.'
                  : 'Add teachers and support staff to assign classes and roles.',
            action:
              !q && type === 'ALL' && canManage ? (
                <Button onClick={() => setAddOpen(true)}>
                  <Plus /> Add staff
                </Button>
              ) : undefined,
          }}
        />
        {list.data && list.data.total > 0 && (
          <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={setPage} noun="staff" />
        )}
      </Card>
      {canManage && (
        <>
          <StaffDialog open={addOpen} onOpenChange={setAddOpen} />
          <StaffDialog open={!!editing?.open} onOpenChange={(o) => !o && setEditing((e) => (e ? { ...e, open: false } : e))} staff={editing?.staff} />
          <StaffActionDialogs action={action} onActionChange={setAction} />
        </>
      )}
    </Page>
  );
}

/** Adds a staff member, or edits one when `staff` is given. */
function StaffDialog({ open, onOpenChange, staff }: { open: boolean; onOpenChange: (o: boolean) => void; staff?: StaffRow | null }) {
  const editing = !!staff;
  // People who have left are reinstated from the menu, not by changing status here.
  const canSetStatus = editing && staff.status !== 'EXITED';
  const defaults: StaffValues = staff
    ? {
        firstName: staff.firstName,
        lastName: staff.lastName,
        gender: staff.gender,
        email: staff.email ?? '',
        phone: staff.phone ?? '',
        jobTitle: staff.jobTitle,
        type: staff.type,
        employedOn: staff.employedOn ?? undefined,
        staffNumber: staff.staffNumber,
        status: canSetStatus && staff.status === 'ON_LEAVE' ? 'ON_LEAVE' : canSetStatus ? 'ACTIVE' : undefined,
      }
    : { firstName: '', lastName: '', gender: 'FEMALE', email: '', phone: '', jobTitle: '', type: 'TEACHING', staffNumber: '' };
  const form = useForm<StaffValues, unknown, StaffOutput>({ resolver: zodResolver(staffFormSchema), defaultValues: defaults });
  const { register, control, formState } = form;
  const e = formState.errors;

  useEffect(() => {
    if (open) form.reset(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, staff?.id]);

  const save = useMutation({
    mutationFn: ({ status, ...input }: StaffOutput) =>
      staff ? api.patch<StaffRow>(`/staff/${staff.id}`, canSetStatus ? { ...input, status } : input) : api.post<StaffRow>('/staff', input),
    meta: { silent: true },
    onSuccess: (s) => {
      invalidateStaff();
      toast.success(editing ? `${s.firstName} ${s.lastName}’s details saved` : `${s.firstName} ${s.lastName} added to staff`);
      onOpenChange(false);
    },
    onError: (err) => {
      if (!applyServerErrors(err, form.setError)) toast.error(err.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            {editing && (
              <div className="mb-2 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand [&_svg]:size-5">
                <Pencil />
              </div>
            )}
            <DialogTitle>{editing ? `Edit ${staff.firstName} ${staff.lastName}` : 'Add a staff member'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update their details. To record that they’ve left, use “Mark as left” instead.' : 'Teachers can then be assigned as class teachers in Academic Setup.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" htmlFor="sf-first" error={e.firstName?.message}>
                <Input id="sf-first" invalid={!!e.firstName} {...register('firstName')} />
              </Field>
              <Field label="Last name" htmlFor="sf-last" error={e.lastName?.message}>
                <Input id="sf-last" invalid={!!e.lastName} {...register('lastName')} />
              </Field>
              <Field label="Job title" htmlFor="sf-title" error={e.jobTitle?.message}>
                <Input id="sf-title" placeholder="e.g. Mathematics Teacher" invalid={!!e.jobTitle} {...register('jobTitle')} />
              </Field>
              <Field label="Type" htmlFor="sf-type" error={e.type?.message}>
                <Controller
                  control={control}
                  name="type"
                  render={({ field }) => (
                    <Select value={field.value ?? 'TEACHING'} onValueChange={field.onChange}>
                      <SelectTrigger id="sf-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAFF_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {titleCase(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field label="Gender" htmlFor="sf-gender" error={e.gender?.message}>
                <Controller
                  control={control}
                  name="gender"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="sf-gender">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GENDERS.map((g) => (
                          <SelectItem key={g} value={g}>
                            {titleCase(g)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field label="Employed on" htmlFor="sf-employed" optional error={e.employedOn?.message}>
                <Input id="sf-employed" type="date" {...register('employedOn', { setValueAs: emptyToUndefined })} />
              </Field>
              <Field label="Email" htmlFor="sf-email" optional error={e.email?.message}>
                <Input id="sf-email" type="email" autoComplete="off" invalid={!!e.email} {...register('email')} />
              </Field>
              <Field label="Phone" htmlFor="sf-phone" optional error={e.phone?.message}>
                <Input id="sf-phone" type="tel" autoComplete="off" {...register('phone')} />
              </Field>
              <Field label="Staff number" htmlFor="sf-no" optional={!editing} hint={editing ? undefined : 'Leave blank to auto-generate'} error={e.staffNumber?.message}>
                <Input id="sf-no" {...register('staffNumber')} />
              </Field>
              {canSetStatus && (
                <Field label="Status" htmlFor="sf-status" error={e.status?.message}>
                  <Controller
                    control={control}
                    name="status"
                    render={({ field }) => (
                      <Select value={field.value ?? 'ACTIVE'} onValueChange={field.onChange}>
                        <SelectTrigger id="sf-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ACTIVE">Active</SelectItem>
                          <SelectItem value="ON_LEAVE">On leave</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {editing ? 'Save changes' : 'Add staff member'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
