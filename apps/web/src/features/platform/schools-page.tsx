import { BILLING_PERIOD_LABELS, createTenantSchema, SUBSCRIPTION_STATUSES, TENANT_STATUSES, type PlatformSchoolRow } from '@aischool/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Building2, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { type Column, DataTable } from '@/components/ui/data-table';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { useIsSuperAdmin } from '@/lib/auth-store';
import { formatDate, formatNumber, formatRelative } from '@/lib/format';
import { applyServerErrors } from '@/lib/forms';
import { slugify, titleCase } from '@/lib/utils';
import { invalidatePlatform, naira, usePlans, useSchools, usd } from './api';
import { FilterSelect, Muted, SchoolCell, SUB_STATUS_LABEL, SubStatusBadge, TenantStatusBadge, Toolbar, daysUntil } from './ui';

export default function SchoolsPage() {
  const navigate = useNavigate();
  const isSuper = useIsSuperAdmin();
  const schools = useSchools();
  const plans = usePlans();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>();
  const [plan, setPlan] = useState<string>();
  const [sub, setSub] = useState<string>();

  const rows = useMemo(() => {
    if (!schools.data) return undefined;
    const q = search.trim().toLowerCase();
    return schools.data.filter(
      (s) =>
        (!q || `${s.name} ${s.slug}`.toLowerCase().includes(q)) &&
        (!status || s.status === status) &&
        (!plan || (plan === NONE ? !s.plan : s.plan === plan)) &&
        (!sub || (s.subscriptionStatus ?? NONE) === sub),
    );
  }, [schools.data, search, status, plan, sub]);

  const columns: Column<PlatformSchoolRow>[] = [
    { key: 'school', header: 'School', cell: (s) => <SchoolCell school={s} link={false} />, className: 'max-w-[260px]' },
    {
      key: 'status',
      header: 'Status',
      cell: (s) => {
        const d = s.status === 'TRIAL' ? daysUntil(s.trialEndsAt) : null;
        return (
          <div className="flex flex-col items-start gap-1">
            <TenantStatusBadge status={s.status} />
            {d != null && (
              <span className={d < 0 ? 'whitespace-nowrap text-[11.5px] font-medium text-danger' : d <= 7 ? 'whitespace-nowrap text-[11.5px] font-medium text-warning' : 'whitespace-nowrap text-[11.5px] text-muted-foreground'} title={`Trial ends ${formatDate(s.trialEndsAt)}`}>
                {d < 0 ? `Trial ended ${Math.abs(d)}d ago` : `Trial ends in ${d}d`}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'plan',
      header: 'Plan',
      cell: (s) => (
        <div className="flex flex-col items-start gap-1">
          {s.plan ? <span className="font-medium">{s.plan}</span> : <Muted>No plan</Muted>}
          {s.subscriptionStatus && s.subscriptionStatus !== 'ACTIVE' && <SubStatusBadge status={s.subscriptionStatus} />}
        </div>
      ),
    },
    { key: 'students', header: 'Students', className: 'tabular text-right', headClassName: 'text-right', cell: (s) => formatNumber(s.students) },
    { key: 'ai', header: 'AI (mo)', className: 'tabular text-right', headClassName: 'text-right', cell: (s) => (s.aiSpendUsd ? usd(s.aiSpendUsd) : <Muted>$0</Muted>) },
    { key: 'api', header: 'API 30d', className: 'tabular text-right', headClassName: 'text-right', cell: (s) => formatNumber(s.apiRequests30d) },
    {
      key: 'owed',
      header: 'Outstanding',
      className: 'tabular text-right',
      headClassName: 'text-right',
      cell: (s) => (s.outstandingKobo > 0 ? <span className="font-medium">{naira(s.outstandingKobo)}</span> : <Muted />),
    },
    {
      key: 'active',
      header: 'Last active',
      cell: (s) => <span className="whitespace-nowrap text-muted-foreground">{s.lastActiveAt ? formatRelative(s.lastActiveAt) : 'Never'}</span>,
    },
  ];

  const planNames = [...new Set((plans.data ?? []).map((p) => p.name))];

  return (
    <Page>
      <PageHeader
        eyebrow="Platform"
        title="Schools"
        description="Every school running on AI School OS — status, plan, usage and what they owe."
        actions={
          isSuper && (
            <Button onClick={() => setOpen(true)}>
              <Plus /> Create school
            </Button>
          )
        }
      />
      <Card className="overflow-hidden">
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name or ID…" className="sm:w-72" />
          <FilterSelect label="Status" allLabel="All statuses" value={status} onChange={setStatus} options={TENANT_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))} />
          <FilterSelect label="Plan" allLabel="All plans" value={plan} onChange={setPlan} options={[...planNames.map((p) => ({ value: p, label: p })), { value: NONE, label: 'No plan' }]} />
          <FilterSelect
            label="Subscription"
            allLabel="Any subscription"
            value={sub}
            onChange={setSub}
            options={[...SUBSCRIPTION_STATUSES.map((s) => ({ value: s, label: SUB_STATUS_LABEL[s] })), { value: NONE, label: 'No subscription' }]}
          />
          {rows && schools.data && (
            <p className="text-[12.5px] text-muted-foreground tabular sm:ml-auto">
              {rows.length === schools.data.length ? `${rows.length} schools` : `${rows.length} of ${schools.data.length}`}
            </p>
          )}
        </Toolbar>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(s) => s.id}
          loading={schools.isLoading}
          error={schools.error}
          onRetry={() => void schools.refetch()}
          onRowClick={(s) => navigate(`/platform/schools/${s.id}`)}
          rowLabel={(s) => `Open ${s.name}`}
          renderMobile={(s) => (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <SchoolCell school={s} link={false} sub={`${s.plan ?? 'No plan'} · ${formatNumber(s.students)} students`} />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <TenantStatusBadge status={s.status} />
                {s.outstandingKobo > 0 && <span className="text-[11.5px] tabular text-muted-foreground">{naira(s.outstandingKobo)} owed</span>}
              </div>
            </div>
          )}
          empty={{
            icon: Building2,
            title: search || status || plan || sub ? 'No schools match' : 'No schools yet',
            description: search || status || plan || sub ? 'Try clearing a filter.' : 'Create the first school on the platform.',
          }}
        />
      </Card>
      {isSuper && <CreateSchoolDialog open={open} onOpenChange={setOpen} />}
    </Page>
  );
}

type Values = z.input<typeof createTenantSchema>;
type Output = z.output<typeof createTenantSchema>;

export function CreateSchoolDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const plans = usePlans(open);
  const defaults: Values = {
    name: '',
    slug: '',
    country: 'NG',
    currency: 'NGN',
    timezone: 'Africa/Lagos',
    planId: undefined,
    admin: { firstName: '', lastName: '', email: '', password: '' },
  };
  const form = useForm<Values, unknown, Output>({ resolver: zodResolver(createTenantSchema), defaultValues: defaults });
  const { register, formState, watch, setValue, control } = form;
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
    mutationFn: (input: Output) => api.post<{ id: string; slug: string; name: string }>('/platform/tenants', input),
    meta: { silent: true },
    onSuccess: (t) => {
      void invalidatePlatform();
      toast.success(`${t.name} is live`, { description: `School ID: ${t.slug}` });
      onOpenChange(false);
      navigate(`/platform/schools/${t.id}`);
    },
    onError: (err) => {
      if (!applyServerErrors(err, form.setError)) toast.error(err.message);
    },
  });

  const slugField = register('slug');
  const activePlans = (plans.data ?? []).filter((p) => p.isActive);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create a school"
      description="Sets up the school with default roles, its first admin account and a plan."
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
        <Field label="Plan" htmlFor="tn-plan" error={e.planId?.message} hint="Leave on the default to start on the standard plan.">
          <Controller
            control={control}
            name="planId"
            render={({ field }) => (
              <Select value={field.value ?? NONE} onValueChange={(v) => field.onChange(v === NONE ? undefined : v)}>
                <SelectTrigger id="tn-plan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Default plan</SelectItem>
                  {activePlans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {naira(p.pricePerStudentKobo)} {BILLING_PERIOD_LABELS[p.billingPeriod]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label="Country" htmlFor="tn-country" error={e.country?.message} hint="2-letter code">
          <Input id="tn-country" maxLength={2} className="uppercase" {...register('country', { setValueAs: (v: string) => v?.toUpperCase() })} />
        </Field>
        <Field label="Currency" htmlFor="tn-currency" error={e.currency?.message} hint="3-letter code">
          <Input id="tn-currency" maxLength={3} className="uppercase" {...register('currency', { setValueAs: (v: string) => v?.toUpperCase() })} />
        </Field>
        <Field label="Timezone" htmlFor="tn-tz" error={e.timezone?.message} className="sm:col-span-2">
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
      {plans.data && activePlans.length === 0 && (
        <p className="mt-4 text-[12.5px] text-muted-foreground">
          <Badge variant="warning">No active plans</Badge> The school starts on the default plan.
        </p>
      )}
    </FormDialog>
  );
}
