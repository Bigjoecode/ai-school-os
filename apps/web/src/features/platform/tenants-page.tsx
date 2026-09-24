import { createTenantSchema, type TenantRow } from '@aischool/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Building2, GraduationCap, Plus, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { SchoolLogo } from '@/components/layout/tenant-switcher';
import { Page, PageHeader } from '@/components/layout/page-header';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { type Column, DataTable } from '@/components/ui/data-table';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { StatusBadge } from '@/components/ui/status-badge';
import { api } from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';
import { applyServerErrors } from '@/lib/forms';
import { qk, queryClient } from '@/lib/query-client';
import { slugify } from '@/lib/utils';

type Values = z.input<typeof createTenantSchema>;
type Output = z.output<typeof createTenantSchema>;

export default function TenantsPage() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const tenants = useQuery({
    queryKey: qk.tenants,
    queryFn: ({ signal }) => api.get<TenantRow[]>('/platform/tenants', undefined, signal),
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!tenants.data) return undefined;
    return q ? tenants.data.filter((t) => `${t.name} ${t.slug}`.toLowerCase().includes(q)) : tenants.data;
  }, [tenants.data, search]);

  const totals = tenants.data?.reduce((acc, t) => ({ students: acc.students + t.students, users: acc.users + t.users }), { students: 0, users: 0 });

  const columns: Column<TenantRow>[] = [
    {
      key: 'school',
      header: 'School',
      cell: (t) => (
        <div className="flex items-center gap-3">
          <SchoolLogo tenant={{ name: t.name, shortName: null, logoUrl: null, primaryColor: null }} className="size-9" />
          <div className="min-w-0">
            <p className="truncate font-medium">{t.name}</p>
            <p className="font-mono text-[12px] text-muted-foreground">{t.slug}</p>
          </div>
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (t) => <StatusBadge status={t.status} /> },
    { key: 'plan', header: 'Plan', cell: (t) => (t.plan ? <Badge variant="brand">{t.plan}</Badge> : <span className="text-muted-foreground">—</span>) },
    { key: 'students', header: 'Students', className: 'tabular', cell: (t) => formatNumber(t.students) },
    { key: 'users', header: 'Users', className: 'tabular', cell: (t) => formatNumber(t.users) },
    { key: 'created', header: 'Created', cell: (t) => <span className="text-muted-foreground">{formatDate(t.createdAt)}</span> },
  ];

  const stats = [
    { label: 'Schools', value: tenants.data?.length, icon: Building2 },
    { label: 'Students', value: totals?.students, icon: GraduationCap },
    { label: 'Users', value: totals?.users, icon: Users },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow={<Badge variant="ai">Platform</Badge>}
        title="Schools"
        description="Every school running on AI School OS."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus /> Create school
          </Button>
        }
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label} className="flex items-center gap-4 p-5">
            <span className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
              <s.icon className="size-5" />
            </span>
            <div>
              <p className="text-[12.5px] text-muted-foreground">{s.label}</p>
              {s.value === undefined ? (
                <p className="font-display text-2xl font-semibold">—</p>
              ) : (
                <AnimatedNumber value={s.value} className="font-display text-2xl font-semibold tabular" />
              )}
            </div>
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search schools…" className="sm:max-w-sm" />
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(t) => t.id}
          loading={tenants.isLoading}
          error={tenants.error}
          onRetry={() => void tenants.refetch()}
          renderMobile={(t) => (
            <div className="flex items-center gap-3">
              <SchoolLogo tenant={{ name: t.name, shortName: null, logoUrl: null, primaryColor: null }} className="size-9" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{t.name}</p>
                <p className="truncate text-[12px] text-muted-foreground">
                  {formatNumber(t.students)} students · {formatNumber(t.users)} users
                </p>
              </div>
              <StatusBadge status={t.status} />
            </div>
          )}
          empty={{
            icon: Building2,
            title: search ? 'No schools match' : 'No schools yet',
            description: search ? 'Try a different search.' : 'Create the first school on the platform.',
          }}
        />
      </Card>
      <CreateTenantDialog open={open} onOpenChange={setOpen} />
    </Page>
  );
}

function CreateTenantDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const defaults: Values = {
    name: '',
    slug: '',
    country: 'NG',
    currency: 'NGN',
    timezone: 'Africa/Lagos',
    admin: { firstName: '', lastName: '', email: '', password: '' },
  };
  const form = useForm<Values, unknown, Output>({ resolver: zodResolver(createTenantSchema), defaultValues: defaults });
  const { register, formState, watch, setValue } = form;
  const e = formState.errors;
  const slugTouched = useRef(false);
  const name = watch('name');

  useEffect(() => {
    if (open) {
      form.reset(defaults);
      slugTouched.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!slugTouched.current) setValue('slug', slugify(name ?? ''), { shouldValidate: formState.isSubmitted });
  }, [name, setValue, formState.isSubmitted]);

  const create = useMutation({
    mutationFn: (input: Output) => api.post<TenantRow>('/platform/tenants', input),
    meta: { silent: true },
    onSuccess: (t) => {
      void queryClient.invalidateQueries({ queryKey: qk.tenants });
      toast.success(`${t.name} is live`, { description: `School ID: ${t.slug}` });
      onOpenChange(false);
    },
    onError: (err) => {
      if (!applyServerErrors(err, form.setError)) toast.error(err.message);
    },
  });

  const slugField = register('slug');

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create a school"
      description="Sets up the school with default roles and its first admin account."
      icon={<Building2 />}
      submitLabel="Create school"
      pending={create.isPending}
      onSubmit={form.handleSubmit((v) => create.mutate(v))}
      size="lg"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="School name" htmlFor="tn-name" error={e.name?.message} className="sm:col-span-2">
          <Input id="tn-name" placeholder="Greenfield International School" invalid={!!e.name} {...register('name')} />
        </Field>
        <Field label="School ID" htmlFor="tn-slug" error={e.slug?.message} hint="Used at sign-in. Lowercase, numbers and dashes.">
          <Input
            id="tn-slug"
            className="font-mono"
            invalid={!!e.slug}
            {...slugField}
            onChange={(ev) => {
              slugTouched.current = true;
              void slugField.onChange(ev);
            }}
          />
        </Field>
        <Field label="Country" htmlFor="tn-country" error={e.country?.message} hint="2-letter code">
          <Input id="tn-country" maxLength={2} className="uppercase" {...register('country', { setValueAs: (v: string) => v?.toUpperCase() })} />
        </Field>
        <Field label="Currency" htmlFor="tn-currency" error={e.currency?.message} hint="3-letter code">
          <Input id="tn-currency" maxLength={3} className="uppercase" {...register('currency', { setValueAs: (v: string) => v?.toUpperCase() })} />
        </Field>
        <Field label="Timezone" htmlFor="tn-tz" error={e.timezone?.message}>
          <Input id="tn-tz" {...register('timezone')} />
        </Field>
      </div>
      <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4">
        <p className="mb-3 text-[13px] font-semibold">First school admin</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="tn-af" error={e.admin?.firstName?.message}>
            <Input id="tn-af" invalid={!!e.admin?.firstName} {...register('admin.firstName')} />
          </Field>
          <Field label="Last name" htmlFor="tn-al" error={e.admin?.lastName?.message}>
            <Input id="tn-al" invalid={!!e.admin?.lastName} {...register('admin.lastName')} />
          </Field>
          <Field label="Email" htmlFor="tn-ae" error={e.admin?.email?.message}>
            <Input id="tn-ae" type="email" autoComplete="off" invalid={!!e.admin?.email} {...register('admin.email')} />
          </Field>
          <Field label="Password" htmlFor="tn-ap" error={e.admin?.password?.message} hint="At least 10 characters">
            <Input id="tn-ap" type="text" autoComplete="new-password" invalid={!!e.admin?.password} {...register('admin.password')} />
          </Field>
        </div>
      </div>
    </FormDialog>
  );
}
