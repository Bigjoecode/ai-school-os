import { ENTITLEMENT_KEYS, ENTITLEMENTS, type EntitlementKey, type SponsorshipRow } from '@aischool/shared';
import { Gift, HandCoins, Home, PlayCircle, Receipt, RefreshCw, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { type Column, DataTable } from '@/components/ui/data-table';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { apiFieldErrors, FormError, plural, Segmented } from '../operations/ui';
import { naira, nairaCompact } from './api';
import { type ConsoleFamilySub, type ConsoleOrder, type RefundRow, useAllSponsorships, useFamilySubs, useGrantAccess, useOrders, useRefunds, useRunRenewals } from './commerce-api';
import { RefundDialog, type RefundTarget } from './refund-dialog';
import { FilterSelect, Kpi, Muted, Toolbar, useTabParam } from './ui';

const TABS = ['subscriptions', 'orders', 'refunds', 'sponsorships'] as const;

const SUB_STATUS: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
  ACTIVE: { label: 'Active', variant: 'success' },
  PAST_DUE: { label: 'Past due', variant: 'danger' },
  CANCELLED: { label: 'Cancelled', variant: 'outline' },
  EXPIRED: { label: 'Expired', variant: 'secondary' },
  PENDING: { label: 'Pending', variant: 'warning' },
};
const ORDER_STATUS: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
  PAID: { label: 'Paid', variant: 'success' },
  PARTIALLY_REFUNDED: { label: 'Part refunded', variant: 'warning' },
  REFUNDED: { label: 'Refunded', variant: 'secondary' },
  FAILED: { label: 'Failed', variant: 'danger' },
  ABANDONED: { label: 'Abandoned', variant: 'outline' },
  PENDING: { label: 'Pending', variant: 'warning' },
};
const pill = (map: typeof SUB_STATUS, s: string) => {
  const x = map[s] ?? { label: s, variant: 'secondary' as const };
  return <Badge variant={x.variant}>{x.label}</Badge>;
};

export default function FamilyPage() {
  const [tab, setTab] = useTabParam(TABS, 'subscriptions');
  const subs = useFamilySubs();
  const orders = useOrders();
  const [runOpen, setRunOpen] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);
  const run = useRunRenewals();
  const active = subs.data?.filter((s) => s.status === 'ACTIVE') ?? [];
  const now = Date.now();
  const paid30 = orders.data?.filter((o) => o.paidAt && now - new Date(o.paidAt).getTime() < 30 * 86_400_000) ?? [];

  return (
    <Page>
      <PageHeader
        eyebrow="Platform"
        title="Parent subscriptions"
        description="Families paying for AI and exam preparation, their orders and refunds, and schools sponsoring whole classes."
        actions={
          <>
            <Button variant="outline" onClick={() => setGrantOpen(true)}>
              <Gift /> Grant access
            </Button>
            <Button onClick={() => setRunOpen(true)}>
              <PlayCircle /> Run renewals now
            </Button>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
        <Kpi label="Active subscriptions" loading={!subs.data} value={formatNumber(active.length)} sub={`${formatNumber(active.reduce((t, s) => t + s.students.length, 0))} children covered`} />
        <Kpi
          label="Past due"
          loading={!subs.data}
          value={formatNumber(subs.data?.filter((s) => s.status === 'PAST_DUE').length ?? 0)}
          tone={subs.data?.some((s) => s.status === 'PAST_DUE') ? 'danger' : undefined}
          sub="Card renewal failed"
        />
        <Kpi label="Paid · 30 days" loading={!orders.data} value={nairaCompact(paid30.reduce((t, o) => t + o.amountKobo - o.refundedKobo, 0))} sub={plural(paid30.length, 'order')} />
        <Kpi label="Refunded" loading={!orders.data} value={nairaCompact(orders.data?.reduce((t, o) => t + o.refundedKobo, 0) ?? 0)} sub="All time" />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number])}>
        <TabsList>
          <TabsTrigger value="subscriptions">
            <RefreshCw /> Subscriptions
          </TabsTrigger>
          <TabsTrigger value="orders">
            <Receipt /> Orders
          </TabsTrigger>
          <TabsTrigger value="refunds">
            <Undo2 /> Refunds
          </TabsTrigger>
          <TabsTrigger value="sponsorships">
            <HandCoins /> School sponsorships
          </TabsTrigger>
        </TabsList>
        <TabsContent value="subscriptions">
          <SubscriptionsTab q={subs} />
        </TabsContent>
        <TabsContent value="orders">
          <OrdersTab q={orders} />
        </TabsContent>
        <TabsContent value="refunds">
          <RefundsTab orders={orders.data} />
        </TabsContent>
        <TabsContent value="sponsorships">
          <SponsorshipsTab />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={runOpen}
        onOpenChange={setRunOpen}
        destructive={false}
        title="Run parent renewals now?"
        description="Subscriptions due for renewal are charged on their saved card; failures become past due and retry; ended ones lose access; parents due soon get a reminder. It also runs on its own every hour."
        confirmLabel="Run renewals"
        loading={run.isPending}
        onConfirm={() =>
          run.mutate(undefined, {
            onSuccess: (r) => {
              setRunOpen(false);
              toast.success('Renewals complete', { description: `${r.renewed} renewed · ${r.failed} failed · ${r.ended} ended · ${r.reminded} reminded` });
            },
          })
        }
      />
      <GrantDialog open={grantOpen} onOpenChange={setGrantOpen} />
    </Page>
  );
}

// ------------------------------------------------------------------ subscriptions

function SubscriptionsTab({ q }: { q: ReturnType<typeof useFamilySubs> }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>();
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return q.data?.filter(
      (r) => (!status || r.status === status) && (!s || `${r.parent.name} ${r.parent.email} ${r.product.name} ${r.students.map((x) => `${x.name} ${x.school}`).join(' ')}`.toLowerCase().includes(s)),
    );
  }, [q.data, search, status]);

  const columns: Column<ConsoleFamilySub>[] = [
    {
      key: 'parent',
      header: 'Parent',
      cell: (s) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{s.parent.name}</p>
          <p className="max-w-[200px] truncate text-[12px] text-muted-foreground">{s.parent.email}</p>
        </div>
      ),
    },
    {
      key: 'product',
      header: 'Product',
      cell: (s) => (
        <div>
          <p className="whitespace-nowrap">{s.product.name}</p>
          <p className="text-[12px] text-muted-foreground tabular">{naira(s.priceKobo)}</p>
        </div>
      ),
    },
    {
      key: 'students',
      header: 'Children',
      cell: (s) => (
        <div className="max-w-[240px] space-y-0.5">
          {s.students.map((x, i) => (
            <p key={i} className="truncate text-[12.5px]">
              {x.name} <span className="text-muted-foreground">· {x.school}</span>
            </p>
          ))}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (s) => (
        <div className="flex flex-col items-start gap-1">
          {pill(SUB_STATUS, s.status)}
          {s.cancelAtPeriodEnd && <span className="text-[11px] text-warning">Ends at period end</span>}
        </div>
      ),
    },
    {
      key: 'renews',
      header: 'Renews',
      cell: (s) => (
        <div>
          <p className="whitespace-nowrap text-[12.5px]">{s.currentPeriodEnd ? formatDate(s.currentPeriodEnd) : '—'}</p>
          <p className="text-[11.5px] text-muted-foreground">{s.autoRenew && !s.cancelAtPeriodEnd ? 'Auto-renew' : 'Manual'}</p>
        </div>
      ),
    },
    {
      key: 'card',
      header: 'Card',
      cell: (s) => (
        <div>
          <p className="whitespace-nowrap font-mono text-[12px]">{s.card ?? <Muted />}</p>
          {s.renewalAttempts > 0 && <p className="whitespace-nowrap text-[11.5px] text-danger">{plural(s.renewalAttempts, 'failed attempt')}</p>}
        </div>
      ),
    },
  ];

  return (
    <Card className="overflow-hidden">
      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search parent, child, school…" className="sm:w-72" />
        <FilterSelect label="Status" value={status} onChange={setStatus} allLabel="All statuses" options={Object.entries(SUB_STATUS).filter(([k]) => k !== 'PENDING').map(([value, s]) => ({ value, label: s.label }))} />
        {rows && <p className="text-[12.5px] text-muted-foreground tabular sm:ml-auto">{plural(rows.length, 'subscription')}</p>}
      </Toolbar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(s) => s.id}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        renderMobile={(s) => (
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">{s.parent.name}</p>
              <p className="truncate text-[12px] text-muted-foreground">
                {s.product.name} · {naira(s.priceKobo)} · renews {s.currentPeriodEnd ? formatDate(s.currentPeriodEnd) : '—'}
              </p>
              <p className="truncate text-[12px] text-muted-foreground">{s.students.map((x) => `${x.name} (${x.school})`).join(', ')}</p>
            </div>
            {pill(SUB_STATUS, s.status)}
          </div>
        )}
        empty={{ icon: Home, title: search || status ? 'No subscriptions match' : 'No parent subscriptions yet', description: 'They appear when a parent buys AI Plus or exam prep in the Family centre.' }}
      />
    </Card>
  );
}

// ------------------------------------------------------------------ orders

function OrdersTab({ q }: { q: ReturnType<typeof useOrders> }) {
  const [search, setSearch] = useState('');
  const [refunding, setRefunding] = useState<RefundTarget | null>(null);
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return q.data?.filter((r) => !s || `${r.reference} ${r.parent.name} ${r.parent.email} ${r.product} ${r.couponCode ?? ''}`.toLowerCase().includes(s));
  }, [q.data, search]);
  const canRefund = (o: ConsoleOrder) => (o.status === 'PAID' || o.status === 'PARTIALLY_REFUNDED') && o.refundedKobo < o.amountKobo;
  const target = (o: ConsoleOrder): RefundTarget => ({ kind: 'order', id: o.id, label: o.reference, who: o.parent.name, amountKobo: o.amountKobo, refundedKobo: o.refundedKobo });

  const columns: Column<ConsoleOrder>[] = [
    {
      key: 'ref',
      header: 'Order',
      cell: (o) => (
        <div>
          <p className="font-mono text-[12.5px] font-medium">{o.reference}</p>
          <p className="whitespace-nowrap text-[11.5px] text-muted-foreground">{formatDateTime(o.paidAt ?? o.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'parent',
      header: 'Parent',
      cell: (o) => (
        <div className="min-w-0">
          <p className="truncate">{o.parent.name}</p>
          <p className="max-w-[180px] truncate text-[12px] text-muted-foreground">{o.parent.email}</p>
        </div>
      ),
    },
    {
      key: 'product',
      header: 'Product',
      cell: (o) => (
        <div>
          <p className="whitespace-nowrap">{o.product}</p>
          <Badge variant={o.kind === 'NEW' ? 'brand' : 'secondary'} className="mt-0.5">
            {o.kind === 'NEW' ? 'New' : 'Renewal'}
          </Badge>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      className: 'tabular text-right',
      headClassName: 'text-right',
      cell: (o) => (
        <div>
          <p className="font-medium">{naira(o.amountKobo)}</p>
          {o.discountKobo > 0 && (
            <p className="whitespace-nowrap text-[11.5px] text-muted-foreground">
              −{naira(o.discountKobo)}
              {o.couponCode && <span className="font-mono"> {o.couponCode}</span>}
            </p>
          )}
          {o.refundedKobo > 0 && <p className="whitespace-nowrap text-[11.5px] text-warning">−{naira(o.refundedKobo)} refunded</p>}
        </div>
      ),
    },
    { key: 'fee', header: 'Fee', className: 'tabular text-right', headClassName: 'text-right', cell: (o) => (o.feeKobo != null ? <span className="text-muted-foreground">{naira(o.feeKobo)}</span> : <Muted />) },
    { key: 'status', header: 'Status', cell: (o) => pill(ORDER_STATUS, o.status) },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      cell: (o) =>
        canRefund(o) ? (
          <Button size="sm" variant="ghost" onClick={() => setRefunding(target(o))}>
            <Undo2 /> Refund
          </Button>
        ) : null,
    },
  ];

  return (
    <Card className="overflow-hidden">
      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search reference, parent, coupon…" className="sm:w-72" />
        {rows && <p className="text-[12.5px] text-muted-foreground tabular sm:ml-auto">{plural(rows.length, 'order')}</p>}
      </Toolbar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(o) => o.id}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        renderMobile={(o) => (
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">
                {naira(o.amountKobo)} · {o.parent.name}
              </p>
              <p className="truncate text-[12px] text-muted-foreground">
                <span className="font-mono">{o.reference}</span> · {o.product} · {o.kind === 'NEW' ? 'New' : 'Renewal'}
              </p>
              {o.refundedKobo > 0 && <p className="text-[12px] text-warning">−{naira(o.refundedKobo)} refunded</p>}
              {canRefund(o) && (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => setRefunding(target(o))}>
                  <Undo2 /> Refund
                </Button>
              )}
            </div>
            {pill(ORDER_STATUS, o.status)}
          </div>
        )}
        empty={{ icon: Receipt, title: search ? 'No orders match' : 'No orders yet', description: 'Paid parent checkouts and renewals land here.' }}
      />
      <RefundDialog target={refunding} onOpenChange={(o) => !o && setRefunding(null)} />
    </Card>
  );
}

// ------------------------------------------------------------------ refunds

function RefundsTab({ orders }: { orders: ConsoleOrder[] | undefined }) {
  const q = useRefunds();
  const byOrder = useMemo(() => new Map((orders ?? []).map((o) => [o.id, o])), [orders]);
  const columns: Column<RefundRow>[] = [
    { key: 'when', header: 'Date', cell: (r) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.createdAt)}</span> },
    {
      key: 'source',
      header: 'For',
      cell: (r) => {
        const o = r.sourceType === 'CONSUMER_ORDER' ? byOrder.get(r.sourceId) : undefined;
        return (
          <div>
            <p>{r.sourceType === 'CONSUMER_ORDER' ? 'Parent order' : 'School payment'}</p>
            <p className="text-[12px] text-muted-foreground">{o ? <span className="font-mono">{o.reference}</span> : <span className="font-mono">{r.sourceId.slice(-8)}</span>}{o && ` · ${o.parent.name}`}</p>
          </div>
        );
      },
    },
    { key: 'reason', header: 'Reason', cell: (r) => <p className="max-w-[320px] text-[12.5px]">{r.reason}</p> },
    { key: 'amount', header: 'Amount', className: 'tabular text-right', headClassName: 'text-right', cell: (r) => <span className="font-medium">{naira(r.amountKobo)}</span> },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (r.status === 'PROCESSED' ? <Badge variant="success">Processed</Badge> : r.status === 'FAILED' ? <Badge variant="danger">Failed</Badge> : <Badge variant="warning">With Paystack</Badge>),
    },
  ];
  return (
    <Card className="overflow-hidden">
      <DataTable
        columns={columns}
        rows={q.data}
        rowKey={(r) => r.id}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        renderMobile={(r) => (
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium">
                {naira(r.amountKobo)} · {r.sourceType === 'CONSUMER_ORDER' ? 'Parent order' : 'School payment'}
              </p>
              <p className="line-clamp-2 text-[12px] text-muted-foreground">{r.reason}</p>
              <p className="text-[11.5px] text-muted-foreground">{formatDateTime(r.createdAt)}</p>
            </div>
            {r.status === 'PROCESSED' ? <Badge variant="success">Processed</Badge> : r.status === 'FAILED' ? <Badge variant="danger">Failed</Badge> : <Badge variant="warning">Pending</Badge>}
          </div>
        )}
        empty={{ icon: Undo2, title: 'No refunds', description: 'Refund an order from the Orders tab.' }}
      />
    </Card>
  );
}

// ------------------------------------------------------------------ sponsorships

function SponsorshipsTab() {
  const q = useAllSponsorships();
  const columns: Column<SponsorshipRow>[] = [
    {
      key: 'title',
      header: 'Sponsorship',
      cell: (s) => (
        <div>
          <p className="font-medium">{s.title}</p>
          <p className="text-[12px] text-muted-foreground">
            {s.school.name} · {s.product.name}
          </p>
        </div>
      ),
    },
    { key: 'classes', header: 'Classes', cell: (s) => <p className="max-w-[220px] truncate text-[12.5px] text-muted-foreground">{s.classes.join(', ') || '—'}</p> },
    {
      key: 'cost',
      header: 'Total',
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
    { key: 'status', header: 'Status', cell: (s) => (s.status === 'ACTIVE' ? <Badge variant="success">Active</Badge> : s.status === 'CANCELLED' ? <Badge variant="outline">Cancelled</Badge> : <Badge variant="secondary">Ended</Badge>) },
    { key: 'invoice', header: 'Invoice', cell: (s) => (s.invoiceNumber ? <span className="font-mono text-[12.5px]">{s.invoiceNumber}</span> : <Muted />) },
  ];
  return (
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
                {s.school.name} · {s.product.name} · {formatNumber(s.students)} × {naira(s.unitKobo)} = {naira(s.totalKobo)}
              </p>
            </div>
            <Badge variant={s.status === 'ACTIVE' ? 'success' : 'secondary'}>{s.status === 'ACTIVE' ? 'Active' : s.status === 'CANCELLED' ? 'Cancelled' : 'Ended'}</Badge>
          </div>
        )}
        empty={{ icon: HandCoins, title: 'No school sponsorships', description: 'Schools sponsor classes from their own Sponsorships page; each is invoiced on their account.' }}
      />
    </Card>
  );
}

// ------------------------------------------------------------------ grant access

function GrantDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const grant = useGrantAccess();
  const [ids, setIds] = useState('');
  const [key, setKey] = useState<EntitlementKey>('STUDENT_AI_PLUS');
  const [months, setMonths] = useState('4');
  const [sessions, setSessions] = useState('');
  const [note, setNote] = useState('');
  const [why, setWhy] = useState<'pilot' | 'scholarship' | 'goodwill'>('pilot');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const list = ids
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const unique = [...new Set(list)];
  const isAi = key.startsWith('STUDENT_AI');

  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    const errs: Record<string, string> = {};
    if (!unique.length) errs.studentIds = 'Paste at least one student ID';
    if (unique.length > 500) errs.studentIds = 'At most 500 at a time';
    const m = Number(months);
    if (!Number.isInteger(m) || m < 1 || m > 24) errs.months = '1 to 24 months';
    const fullNote = `${why[0]!.toUpperCase()}${why.slice(1)}: ${note.trim()}`.trim();
    if (note.trim().length < 3) errs.note = 'Say why, in a few words';
    if (Object.keys(errs).length) return setErrors(errs);
    grant.mutate(
      { studentIds: unique, key, months: m, aiSessions: isAi && sessions.trim() ? Number(sessions) : null, note: fullNote.slice(0, 200) },
      {
        onSuccess: (r) => {
          if (r.granted < unique.length) toast.warning(`Granted to ${r.granted} of ${unique.length}`, { description: 'Some IDs didn’t match a student.' });
          else toast.success(`${ENTITLEMENTS[key].label} granted to ${plural(r.granted, 'student')}`);
          onOpenChange(false);
          setIds('');
          setNote('');
        },
        onError: (err) => setErrors(apiFieldErrors(err)),
      },
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Grant access"
      description="Give named students AI or exam access for free — a pilot, a scholarship or a goodwill gesture. Nobody is charged; it’s recorded as a platform grant."
      icon={<Gift />}
      submitLabel={unique.length ? `Grant to ${plural(unique.length, 'student')}` : 'Grant access'}
      pending={grant.isPending}
      onSubmit={submit}
      size="lg"
    >
      <div className="grid gap-4">
        <FormError message={errors.form} />
        <Field label="Student IDs" htmlFor="gr-ids" error={errors.studentIds} hint={unique.length ? `${plural(unique.length, 'ID')} recognised` : 'One per line, or separated by commas. Copy them from a school’s student list.'}>
          <Textarea id="gr-ids" rows={4} className="font-mono text-[12.5px]" value={ids} onChange={(e) => setIds(e.target.value)} placeholder="cmf1x…&#10;cmf1y…" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Access" htmlFor="gr-key">
            <Select value={key} onValueChange={(v) => setKey(v as EntitlementKey)}>
              <SelectTrigger id="gr-key">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTITLEMENT_KEYS.filter((k) => k !== 'STUDENT_AI_BASIC').map((k) => (
                  <SelectItem key={k} value={k}>
                    {ENTITLEMENTS[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Months" htmlFor="gr-months" error={errors.months}>
              <Input id="gr-months" type="number" min={1} max={24} value={months} onChange={(e) => setMonths(e.target.value)} />
            </Field>
            <Field label="AI sessions" htmlFor="gr-sessions" hint={isAi ? 'Empty = tier default' : 'n/a'}>
              <Input id="gr-sessions" type="number" min={0} disabled={!isAi} value={sessions} onChange={(e) => setSessions(e.target.value)} />
            </Field>
          </div>
        </div>
        <Field label="Why" error={errors.note}>
          <Segmented
            label="Reason"
            value={why}
            onChange={setWhy}
            options={[
              { value: 'pilot', label: 'Pilot' },
              { value: 'scholarship', label: 'Scholarship' },
              { value: 'goodwill', label: 'Goodwill' },
            ]}
          />
          <Input aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Greenfield SS 2 pilot, agreed with the principal" maxLength={180} />
        </Field>
      </div>
    </FormDialog>
  );
}
