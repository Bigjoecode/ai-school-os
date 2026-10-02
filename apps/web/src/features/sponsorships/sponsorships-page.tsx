import { ENTITLEMENTS, PRODUCT_PERIOD_LABELS, sponsorshipSchema, type ProductRow, type SponsorshipRow } from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Ban, HandCoins, Info, Plus, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { type Column, DataTable } from '@/components/ui/data-table';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { formatDate, formatNumber, todayIso } from '@/lib/format';
import { queryClient } from '@/lib/query-client';
import { cn } from '@/lib/utils';
import { useStructure } from '../academics/api';
import { money } from '../finance/ui';
import { apiFieldErrors, dateInput, FormError, plural, zodErrors } from '../operations/ui';

const KEY = ['sponsorships'] as const;
const naira = (k: number | null | undefined) => money(k, 'NGN');

const useSponsorships = () => useQuery({ queryKey: KEY, queryFn: ({ signal }) => api.get<SponsorshipRow[]>('/sponsorships', undefined, signal) });
const useSponsorProducts = (enabled: boolean) =>
  useQuery({ queryKey: [...KEY, 'products'], queryFn: ({ signal }) => api.get<ProductRow[]>('/sponsorships/products', undefined, signal), enabled, staleTime: 60_000 });
const after = () => {
  void queryClient.invalidateQueries({ queryKey: KEY });
  // The sponsorship's invoice lands on Settings → Billing.
  void queryClient.invalidateQueries({ queryKey: ['billing'] });
};

function StatusBadge({ status }: { status: SponsorshipRow['status'] }) {
  if (status === 'ACTIVE') return <Badge variant="success" dot>Active</Badge>;
  if (status === 'CANCELLED') return <Badge variant="outline">Cancelled</Badge>;
  return <Badge variant="secondary">Ended</Badge>;
}

export default function SponsorshipsPage() {
  const q = useSponsorships();
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<SponsorshipRow | null>(null);
  const active = q.data?.filter((s) => s.status === 'ACTIVE') ?? [];

  const columns: Column<SponsorshipRow>[] = [
    {
      key: 'title',
      header: 'Sponsorship',
      cell: (s) => (
        <div className="min-w-0">
          <p className="font-medium">{s.title}</p>
          <p className="text-[12px] text-muted-foreground">{s.product.name}</p>
        </div>
      ),
    },
    {
      key: 'classes',
      header: 'Classes',
      cell: (s) => (
        <p className="max-w-[220px] text-[12.5px] text-muted-foreground" title={s.classes.join(', ')}>
          {s.classes.length > 4 ? `${s.classes.slice(0, 4).join(', ')} +${s.classes.length - 4}` : s.classes.join(', ') || '—'}
        </p>
      ),
    },
    {
      key: 'cost',
      header: 'Cost',
      className: 'tabular text-right',
      headClassName: 'text-right',
      cell: (s) => (
        <div>
          <p className="font-medium">{naira(s.totalKobo)}</p>
          <p className="whitespace-nowrap text-[11.5px] text-muted-foreground">
            {formatNumber(s.students)} × {naira(s.unitKobo)}
          </p>
        </div>
      ),
    },
    {
      key: 'period',
      header: 'Period',
      cell: (s) => (
        <span className="whitespace-nowrap text-[12.5px] text-muted-foreground">
          {formatDate(s.startsAt, { year: undefined })} – {formatDate(s.endsAt)}
        </span>
      ),
    },
    { key: 'status', header: 'Status', cell: (s) => <StatusBadge status={s.status} /> },
    {
      key: 'invoice',
      header: 'Invoice',
      cell: (s) =>
        s.invoiceNumber ? (
          <Link to="/settings/billing" className="font-mono text-[12.5px] text-brand hover:underline">
            {s.invoiceNumber}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      cell: (s) =>
        s.status === 'ACTIVE' ? (
          <Button size="sm" variant="ghost" onClick={() => setCancelling(s)}>
            Cancel
          </Button>
        ) : null,
    },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow="Settings"
        title="Sponsorships"
        description="Pay for AI Plus or exam preparation for whole classes. It’s billed to the school’s AI School OS account, and every student in those classes gets access straight away."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> Sponsor classes
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3 [&>*]:min-w-0">
        <Stat label="Active sponsorships" value={q.data ? formatNumber(active.length) : '—'} />
        <Stat label="Students covered" value={q.data ? formatNumber(active.reduce((t, s) => t + s.students, 0)) : '—'} />
        <Stat className="col-span-2 lg:col-span-1" label="Committed (active)" value={q.data ? naira(active.reduce((t, s) => t + s.totalKobo, 0)) : '—'} />
      </div>

      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={q.data}
          rowKey={(s) => s.id}
          loading={q.isLoading}
          error={q.error}
          onRetry={() => void q.refetch()}
          renderMobile={(s) => (
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{s.title}</p>
                <p className="truncate text-[12px] text-muted-foreground">
                  {s.product.name} · {s.classes.join(', ')}
                </p>
                <p className="text-[12px] text-muted-foreground tabular">
                  {formatNumber(s.students)} × {naira(s.unitKobo)} = <span className="font-medium text-foreground">{naira(s.totalKobo)}</span>
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {formatDate(s.startsAt, { year: undefined })} – {formatDate(s.endsAt)}
                  {s.invoiceNumber && (
                    <>
                      {' · '}
                      <Link to="/settings/billing" className="font-mono text-brand">
                        {s.invoiceNumber}
                      </Link>
                    </>
                  )}
                </p>
                {s.status === 'ACTIVE' && (
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => setCancelling(s)}>
                    Cancel sponsorship
                  </Button>
                )}
              </div>
              <StatusBadge status={s.status} />
            </div>
          )}
          empty={{
            icon: HandCoins,
            title: 'No sponsorships yet',
            description: 'Give a class AI Plus or WAEC/JAMB preparation, paid by the school. Parents don’t need to pay or sign up for anything.',
            action: (
              <Button onClick={() => setCreating(true)}>
                <Plus /> Sponsor classes
              </Button>
            ),
          }}
        />
      </Card>

      <CreateDialog open={creating} onOpenChange={setCreating} />
      <CancelDialog row={cancelling} onOpenChange={(o) => !o && setCancelling(null)} />
    </Page>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('min-w-0 rounded-2xl border border-border bg-card p-4 shadow-soft', className)}>
      <p className="truncate text-[12px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1.5 truncate font-display text-[22px] font-semibold leading-tight tracking-tight tabular">{value}</p>
    </div>
  );
}

// ------------------------------------------------------------------ create

function CreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const products = useSponsorProducts(open);
  const structure = useStructure(open);
  const create = useMutation({ mutationFn: (body: unknown) => api.post<SponsorshipRow>('/sponsorships', body), onSuccess: after });
  const [code, setCode] = useState('');
  const [arms, setArms] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [startsOn, setStartsOn] = useState(todayIso());
  const [months, setMonths] = useState('4');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [titleTouched, setTitleTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setArms([]);
    setTitle('');
    setTitleTouched(false);
    setStartsOn(todayIso());
    setErrors({});
  }, [open]);
  useEffect(() => {
    if (open && !code && products.data?.[0]) {
      setCode(products.data[0].code);
      setMonths(String(products.data[0].periodMonths));
    }
  }, [open, code, products.data]);

  const product = products.data?.find((p) => p.code === code);
  const levels = structure.data?.classLevels ?? [];
  const armInfo = useMemo(() => new Map(levels.flatMap((l) => l.arms.map((a) => [a.id, { label: `${l.name} ${a.name}`, students: a.studentCount }] as const))), [levels]);
  const students = arms.reduce((t, id) => t + (armInfo.get(id)?.students ?? 0), 0);
  const m = Number(months) || 0;
  const periods = product ? Math.max(1, Math.ceil(m / product.periodMonths)) : 1;
  const unit = (product?.schoolPriceKobo ?? 0) * periods;
  const total = unit * students;

  // A helpful default title until the admin types their own.
  useEffect(() => {
    if (titleTouched || !product) return;
    const names = arms.map((id) => armInfo.get(id)?.label).filter(Boolean);
    setTitle(names.length ? `${product.name} for ${names.length > 3 ? `${names.length} classes` : names.join(', ')}` : '');
  }, [arms, product, armInfo, titleTouched]);

  const toggle = (id: string, on: boolean) => setArms((a) => (on ? [...a, id] : a.filter((x) => x !== id)));

  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    const parsed = sponsorshipSchema.safeParse({ productCode: code, classArmIds: arms, title, startsOn, months: m });
    if (!parsed.success) {
      const errs = zodErrors(parsed.error.issues);
      if (errs.classArmIds) errs.classArmIds = 'Choose at least one class';
      return setErrors(errs);
    }
    create.mutate(parsed.data, {
      onSuccess: (r) => {
        toast.success('Sponsorship created', { description: `${plural(r.students, 'student')} now have ${r.product.name}. Invoice ${r.invoiceNumber ?? ''} is on Billing.` });
        onOpenChange(false);
      },
      onError: (err) => setErrors(apiFieldErrors(err)),
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Sponsor classes"
      description="Every active student in the classes you choose gets access from the start date. The school is invoiced per student on its AI School OS account."
      icon={<HandCoins />}
      submitLabel={total ? `Sponsor · ${naira(total)}` : 'Sponsor'}
      pending={create.isPending}
      onSubmit={submit}
      size="lg"
    >
      <div className="grid gap-5">
        <FormError message={errors.form} />
        <Field label="What to sponsor" error={errors.productCode}>
          {products.isLoading ? (
            <p className="text-[13px] text-muted-foreground">Loading products…</p>
          ) : !products.data?.length ? (
            <p className="text-[13px] text-muted-foreground">Nothing is offered to schools right now.</p>
          ) : (
            <div role="radiogroup" className="grid gap-2 sm:grid-cols-2 [&>*]:min-w-0">
              {products.data.map((p) => (
                <button
                  key={p.code}
                  type="button"
                  role="radio"
                  aria-checked={p.code === code}
                  onClick={() => {
                    setCode(p.code);
                    setMonths(String(p.periodMonths));
                  }}
                  className={cn(
                    'rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    p.code === code ? 'border-brand bg-brand-soft/40' : 'border-border hover:border-border-strong',
                  )}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13.5px] font-medium">{p.name}</span>
                    <span className="shrink-0 text-[13px] font-semibold tabular">{naira(p.schoolPriceKobo)}</span>
                  </span>
                  <span className="mt-0.5 block text-[12px] text-muted-foreground">
                    per student {PRODUCT_PERIOD_LABELS[p.period].replace('per ', '/ ')} · {p.entitlements.map((e) => ENTITLEMENTS[e].label).join(', ')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field label="Classes" error={errors.classArmIds} hint={arms.length ? `${plural(arms.length, 'class', 'classes')} · ${plural(students, 'student')}` : undefined}>
          <div className="max-h-[240px] space-y-3 overflow-y-auto rounded-xl border border-border p-3">
            {structure.isLoading && <p className="text-[13px] text-muted-foreground">Loading classes…</p>}
            {levels.map((l) =>
              l.arms.length ? (
                <div key={l.id}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">{l.name}</p>
                    <button
                      type="button"
                      className="text-[12px] text-brand hover:underline"
                      onClick={() => {
                        const ids = l.arms.map((a) => a.id);
                        const all = ids.every((id) => arms.includes(id));
                        setArms((a) => (all ? a.filter((x) => !ids.includes(x)) : [...new Set([...a, ...ids])]));
                      }}
                    >
                      {l.arms.every((a) => arms.includes(a.id)) ? 'Clear' : 'All arms'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {l.arms.map((a) => (
                      <label key={a.id} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[13px]', arms.includes(a.id) ? 'border-brand bg-brand-soft/40' : 'border-border')}>
                        <Checkbox checked={arms.includes(a.id)} onCheckedChange={(v) => toggle(a.id, v === true)} />
                        {l.name} {a.name}
                        <span className="text-[11.5px] text-muted-foreground tabular">{a.studentCount}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null,
            )}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts" htmlFor="sp-start" error={errors.startsOn}>
            <Input id="sp-start" type="date" className={dateInput} value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </Field>
          <Field label="Months" htmlFor="sp-months" error={errors.months} hint={product ? `${product.name} is sold ${PRODUCT_PERIOD_LABELS[product.period]} (${plural(product.periodMonths, 'month')})` : undefined}>
            <Input id="sp-months" type="number" min={1} max={12} inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} />
          </Field>
        </div>
        <Field label="Title" htmlFor="sp-title" error={errors.title} hint="Shown on the invoice and to parents.">
          <Input
            id="sp-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleTouched(true);
            }}
            placeholder="e.g. WAEC preparation for SS 3"
          />
        </Field>

        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
            <Sparkles className="size-3.5" aria-hidden /> Estimate
          </p>
          <p className="mt-1 font-display text-[22px] font-semibold tracking-tight tabular">{naira(total)}</p>
          <p className="text-[12.5px] text-muted-foreground tabular">
            {plural(students, 'student')} × {naira(product?.schoolPriceKobo ?? 0)}
            {periods > 1 && ` × ${periods} periods`}
          </p>
          <p className="mt-2 flex items-start gap-1.5 text-[12px] text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> The final amount counts active students when you confirm; it can differ slightly from the class lists.
          </p>
        </div>
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ cancel

function CancelDialog({ row, onOpenChange }: { row: SponsorshipRow | null; onOpenChange: (o: boolean) => void }) {
  const cancel = useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post(`/sponsorships/${id}/cancel`, { reason }), onSuccess: after });
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  useEffect(() => {
    setReason('');
    setError(undefined);
  }, [row]);
  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    if (!row) return;
    if (reason.trim().length < 3) return setError('Say why, in a few words');
    cancel.mutate(
      { id: row.id, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(`“${row.title}” cancelled`);
          onOpenChange(false);
        },
        onError: (err) => setError(apiFieldErrors(err).form ?? 'Could not cancel'),
      },
    );
  };
  return (
    <FormDialog
      open={!!row}
      onOpenChange={onOpenChange}
      title="Cancel this sponsorship?"
      description={
        row ? (
          <>
            {plural(row.students, 'student')} lose {row.product.name} now. If invoice {row.invoiceNumber ?? ''} hasn’t been paid it’s voided; if it has, contact support about a refund.
          </>
        ) : undefined
      }
      icon={<Ban />}
      submitLabel="Cancel sponsorship"
      pending={cancel.isPending}
      onSubmit={submit}
      size="sm"
    >
      <Field label="Reason" htmlFor="sp-reason" error={error}>
        <Textarea id="sp-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Raised in error" />
      </Field>
    </FormDialog>
  );
}
