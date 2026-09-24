import { guardianSchema, type GuardianRow, type Paginated } from '@aischool/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { Mail, Phone, Plus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { type Column, DataTable, Pagination } from '@/components/ui/data-table';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { formatNumber } from '@/lib/format';
import { applyServerErrors } from '@/lib/forms';
import { useDebounced } from '@/lib/hooks';
import { qk, queryClient } from '@/lib/query-client';
import { initials, titleCase } from '@/lib/utils';
import { type PickedStudent, StudentPicker } from '../students/student-picker';

const PAGE_SIZE = 20;
const RELATIONSHIPS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Uncle', 'Aunt', 'Sibling', 'Sponsor', 'Other'];

type GuardianValues = z.input<typeof guardianSchema>;
type GuardianOutput = z.output<typeof guardianSchema>;

export default function ParentsPage() {
  const [params, setParams] = useSearchParams();
  const canManage = useCan('guardians.manage');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search.trim(), 300);
  const query = { q: q || undefined, page, pageSize: PAGE_SIZE };
  const list = useQuery({
    queryKey: qk.guardians(query),
    queryFn: ({ signal }) => api.get<Paginated<GuardianRow>>('/guardians', query, signal),
    placeholderData: keepPreviousData,
  });

  const addOpen = params.get('new') === '1';
  const setAddOpen = (open: boolean) => {
    const next = new URLSearchParams(params);
    if (open) next.set('new', '1');
    else next.delete('new');
    setParams(next, { replace: true });
  };

  const columns: Column<GuardianRow>[] = [
    {
      key: 'name',
      header: 'Parent / guardian',
      cell: (g) => (
        <div className="flex items-center gap-3">
          <Avatar name={`${g.firstName} ${g.lastName}`} initials={initials(g.firstName, g.lastName)} />
          <div className="min-w-0">
            <p className="truncate font-medium">
              {g.firstName} {g.lastName}
            </p>
            <p className="text-[12px] text-muted-foreground">
              {titleCase(g.relationship)}
              {g.occupation && ` · ${g.occupation}`}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      cell: (g) => (
        <div className="space-y-0.5 text-[13px]">
          <p className="flex items-center gap-1.5">
            <Phone className="size-3.5 text-muted-foreground" /> {g.phone}
          </p>
          {g.email && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Mail className="size-3.5" /> {g.email}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'students',
      header: 'Children',
      cell: (g) =>
        g.students.length === 0 ? (
          <span className="text-muted-foreground">None linked</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {g.students.slice(0, 3).map((s) => (
              <span key={s.id} className="rounded-full bg-muted px-2 py-0.5 text-[12px]">
                {s.firstName} {s.lastName}
              </span>
            ))}
            {g.students.length > 3 && <span className="text-[12px] text-muted-foreground">+{g.students.length - 3}</span>}
          </div>
        ),
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Parents"
        description={list.data ? `${formatNumber(list.data.total)} parents and guardians on record` : 'Families connected to your school.'}
        actions={
          canManage && (
            <Button onClick={() => setAddOpen(true)}>
              <Plus /> Add parent
            </Button>
          )
        }
      />
      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search by name, phone or email…"
            className="sm:max-w-sm"
          />
        </div>
        <DataTable
          columns={columns}
          rows={list.data?.items}
          rowKey={(g) => g.id}
          loading={list.isFetching}
          error={list.error}
          onRetry={() => void list.refetch()}
          renderMobile={(g) => (
            <div className="flex items-start gap-3">
              <Avatar name={`${g.firstName} ${g.lastName}`} initials={initials(g.firstName, g.lastName)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">
                  {g.firstName} {g.lastName}
                  <span className="font-normal text-muted-foreground"> · {titleCase(g.relationship)}</span>
                </p>
                <p className="text-[12.5px] text-muted-foreground">{g.phone}</p>
                {g.students.length > 0 && (
                  <p className="mt-1 truncate text-[12px] text-muted-foreground">
                    {g.students.map((s) => `${s.firstName} ${s.lastName}`).join(', ')}
                  </p>
                )}
              </div>
            </div>
          )}
          empty={{
            icon: Users,
            title: q ? 'No parents match' : 'No parents yet',
            description: q ? 'Try a different search.' : 'Add parents and link them to their children so the school can reach every family.',
            action:
              !q && canManage ? (
                <Button onClick={() => setAddOpen(true)}>
                  <Plus /> Add parent
                </Button>
              ) : undefined,
          }}
        />
        {list.data && list.data.total > 0 && (
          <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={setPage} noun="parents" />
        )}
      </Card>
      {canManage && <AddGuardianDialog open={addOpen} onOpenChange={setAddOpen} />}
    </Page>
  );
}

function AddGuardianDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [picked, setPicked] = useState<PickedStudent[]>([]);
  const defaults: GuardianValues = { firstName: '', lastName: '', relationship: 'Mother', phone: '', email: '', occupation: '', address: '', studentIds: [] };
  const form = useForm<GuardianValues, unknown, GuardianOutput>({ resolver: zodResolver(guardianSchema), defaultValues: defaults });
  const { register, control, formState, setValue } = form;
  const e = formState.errors;

  useEffect(() => {
    if (open) {
      form.reset(defaults);
      setPicked([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const create = useMutation({
    mutationFn: (input: GuardianOutput) => api.post<GuardianRow>('/guardians', input),
    meta: { silent: true },
    onSuccess: (g) => {
      void queryClient.invalidateQueries({ queryKey: qk.guardians() });
      void queryClient.invalidateQueries({ queryKey: qk.students() });
      void queryClient.invalidateQueries({ queryKey: qk.overview });
      toast.success(`${g.firstName} ${g.lastName} added`);
      onOpenChange(false);
    },
    onError: (err) => {
      if (!applyServerErrors(err, form.setError)) toast.error(err.message);
    },
  });

  const onPick = (v: PickedStudent[]) => {
    setPicked(v);
    setValue('studentIds', v.map((s) => s.id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form onSubmit={form.handleSubmit((v) => create.mutate(v))} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>Add a parent or guardian</DialogTitle>
            <DialogDescription>Link them to one or more children now or later.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" htmlFor="g-first" error={e.firstName?.message}>
                <Input id="g-first" invalid={!!e.firstName} {...register('firstName')} />
              </Field>
              <Field label="Last name" htmlFor="g-last" error={e.lastName?.message}>
                <Input id="g-last" invalid={!!e.lastName} {...register('lastName')} />
              </Field>
              <Field label="Relationship" htmlFor="g-rel" error={e.relationship?.message}>
                <Controller
                  control={control}
                  name="relationship"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="g-rel">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RELATIONSHIPS.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field label="Phone" htmlFor="g-phone" error={e.phone?.message}>
                <Input id="g-phone" type="tel" autoComplete="off" invalid={!!e.phone} {...register('phone')} />
              </Field>
              <Field label="Email" htmlFor="g-email" optional error={e.email?.message}>
                <Input id="g-email" type="email" autoComplete="off" invalid={!!e.email} {...register('email')} />
              </Field>
              <Field label="Occupation" htmlFor="g-occ" optional error={e.occupation?.message}>
                <Input id="g-occ" {...register('occupation')} />
              </Field>
              <Field label="Address" htmlFor="g-addr" optional className="sm:col-span-2" error={e.address?.message}>
                <Input id="g-addr" {...register('address')} />
              </Field>
              <Field label="Children" htmlFor="g-students" optional className="sm:col-span-2" error={e.studentIds?.message}>
                <StudentPicker id="g-students" value={picked} onChange={onPick} />
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Add parent
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
