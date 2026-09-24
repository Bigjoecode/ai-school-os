import { GENDERS, type Paginated, STAFF_TYPES, type StaffRow, staffSchema } from '@aischool/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { Briefcase, Mail, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { type Column, DataTable, Pagination } from '@/components/ui/data-table';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { formatDate, formatNumber } from '@/lib/format';
import { applyServerErrors, emptyToUndefined } from '@/lib/forms';
import { useDebounced } from '@/lib/hooks';
import { qk, queryClient } from '@/lib/query-client';
import { initials, titleCase } from '@/lib/utils';

const PAGE_SIZE = 20;
type StaffValues = z.input<typeof staffSchema>;
type StaffOutput = z.output<typeof staffSchema>;
type TypeFilter = 'ALL' | (typeof STAFF_TYPES)[number];

export default function StaffPage() {
  const [params, setParams] = useSearchParams();
  const canManage = useCan('staff.manage');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [type, setType] = useState<TypeFilter>('ALL');
  const q = useDebounced(search.trim(), 300);
  const query = { q: q || undefined, page, pageSize: PAGE_SIZE, type: type === 'ALL' ? undefined : type };
  const list = useQuery({
    queryKey: qk.staff(query),
    queryFn: ({ signal }) => api.get<Paginated<StaffRow>>('/staff', query, signal),
    placeholderData: keepPreviousData,
  });

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
    { key: 'status', header: 'Status', cell: (s) => <StatusBadge status={s.status} /> },
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
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search staff…"
            className="sm:max-w-sm sm:flex-1"
          />
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
        <DataTable
          columns={columns}
          rows={list.data?.items}
          rowKey={(s) => s.id}
          loading={list.isFetching}
          error={list.error}
          onRetry={() => void list.refetch()}
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
              <StatusBadge status={s.status} />
            </div>
          )}
          empty={{
            icon: Briefcase,
            title: q || type !== 'ALL' ? 'No staff match' : 'No staff yet',
            description: q || type !== 'ALL' ? 'Try a different search or filter.' : 'Add teachers and support staff to assign classes and roles.',
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
      {canManage && <AddStaffDialog open={addOpen} onOpenChange={setAddOpen} />}
    </Page>
  );
}

function AddStaffDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const defaults: StaffValues = { firstName: '', lastName: '', gender: 'FEMALE', email: '', phone: '', jobTitle: '', type: 'TEACHING', staffNumber: '' };
  const form = useForm<StaffValues, unknown, StaffOutput>({ resolver: zodResolver(staffSchema), defaultValues: defaults });
  const { register, control, formState } = form;
  const e = formState.errors;

  useEffect(() => {
    if (open) form.reset(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const create = useMutation({
    mutationFn: (input: StaffOutput) => api.post<StaffRow>('/staff', input),
    meta: { silent: true },
    onSuccess: (s) => {
      void queryClient.invalidateQueries({ queryKey: qk.staff() });
      void queryClient.invalidateQueries({ queryKey: qk.overview });
      toast.success(`${s.firstName} ${s.lastName} added to staff`);
      onOpenChange(false);
    },
    onError: (err) => {
      if (!applyServerErrors(err, form.setError)) toast.error(err.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form onSubmit={form.handleSubmit((v) => create.mutate(v))} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>Add a staff member</DialogTitle>
            <DialogDescription>Teachers can then be assigned as class teachers in Academic Setup.</DialogDescription>
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
              <Field label="Staff number" htmlFor="sf-no" optional hint="Leave blank to auto-generate" error={e.staffNumber?.message}>
                <Input id="sf-no" {...register('staffNumber')} />
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Add staff member
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
