import type { PlatformInvoiceRow, PlatformInvoiceStatus, PlatformPaymentRow, SubscriptionRow } from '@aischool/shared';
import { BILLING_PERIOD_LABELS } from '@aischool/shared';
import { Ban, Banknote, CreditCard, FilePlus2, FileText, MoreHorizontal, Pencil, PlayCircle, Receipt, RefreshCw, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { type Column, DataTable } from '@/components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SearchInput } from '@/components/ui/search-input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { Segmented } from '../operations/ui';
import { naira, nairaCompact, useInvoiceNow, usePlatformInvoices, usePlatformPayments, useRunBilling, useSubscriptions, useVerifyPayment } from './api';
import { CreateInvoiceDialog, EditSubscriptionDialog, RecordPaymentDialog, VoidInvoiceDialog } from './billing-dialogs';
import { useRefunds } from './commerce-api';
import { RefundDialog, type RefundTarget } from './refund-dialog';
import { Kpi, Muted, PAYMENT_METHOD_LABEL, PaymentStatusPill, PlatformInvoiceBadge, SchoolCell, SubStatusBadge, Toolbar, useTabParam } from './ui';

const TABS = ['subscriptions', 'invoices', 'payments'] as const;

export default function BillingPage() {
  const [tab, setTab] = useTabParam(TABS, 'subscriptions');
  const [runOpen, setRunOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const run = useRunBilling();
  const subs = useSubscriptions();
  const mrr = subs.data?.filter((s) => s.status === 'ACTIVE' || s.status === 'PAST_DUE').reduce((t, s) => t + s.monthlyKobo, 0);
  const owed = subs.data?.reduce((t, s) => t + s.outstandingKobo, 0);

  return (
    <Page>
      <PageHeader
        eyebrow="Platform"
        title="Billing"
        description="Subscriptions, invoices and payments for every school."
        actions={
          <>
            <Button variant="outline" onClick={() => setInvoiceOpen(true)}>
              <FilePlus2 /> Manual invoice
            </Button>
            <Button onClick={() => setRunOpen(true)}>
              <PlayCircle /> Run billing cycle
            </Button>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
        <Kpi label="MRR" loading={!subs.data} value={mrr != null ? nairaCompact(mrr) : ''} sub={mrr != null ? `ARR ${nairaCompact(mrr * 12)}` : undefined} />
        <Kpi label="Subscriptions" loading={!subs.data} value={formatNumber(subs.data?.length ?? 0)} sub={`${subs.data?.filter((s) => s.status === 'ACTIVE').length ?? 0} active`} />
        <Kpi
          label="Past due"
          loading={!subs.data}
          value={formatNumber(subs.data?.filter((s) => s.status === 'PAST_DUE').length ?? 0)}
          tone={subs.data?.some((s) => s.status === 'PAST_DUE') ? 'danger' : undefined}
          sub="With an overdue invoice"
        />
        <Kpi label="Outstanding" loading={!subs.data} value={owed != null ? nairaCompact(owed) : ''} sub="Across open invoices" />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number])}>
        <TabsList>
          <TabsTrigger value="subscriptions">
            <RefreshCw /> Subscriptions
          </TabsTrigger>
          <TabsTrigger value="invoices">
            <FileText /> Invoices
          </TabsTrigger>
          <TabsTrigger value="payments">
            <CreditCard /> Payments
          </TabsTrigger>
        </TabsList>
        <TabsContent value="subscriptions">
          <SubscriptionsTab q={subs} />
        </TabsContent>
        <TabsContent value="invoices">
          <InvoicesTab />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentsTab />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={runOpen}
        onOpenChange={setRunOpen}
        destructive={false}
        title="Run the billing cycle now?"
        description="Subscriptions past their period end renew (or cancel) and get their invoice; subscriptions with overdue invoices become past due. It also runs hourly on its own. Nothing is suspended automatically."
        confirmLabel="Run billing cycle"
        loading={run.isPending}
        onConfirm={() =>
          run.mutate(undefined, {
            onSuccess: (r) => {
              setRunOpen(false);
              toast.success('Billing cycle complete', { description: `${r.renewed} renewed · ${r.invoiced} invoiced · ${r.pastDue} past due · ${r.cancelled} cancelled` });
            },
          })
        }
      />
      <CreateInvoiceDialog open={invoiceOpen} onOpenChange={setInvoiceOpen} />
    </Page>
  );
}

// ------------------------------------------------------------------ subscriptions

function SubscriptionsTab({ q }: { q: ReturnType<typeof useSubscriptions> }) {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<SubscriptionRow | null>(null);
  const invoiceNow = useInvoiceNow();
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return q.data?.filter((r) => !s || `${r.tenant.name} ${r.tenant.slug} ${r.plan.name}`.toLowerCase().includes(s));
  }, [q.data, search]);

  const actions = (s: SubscriptionRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${s.tenant.name}`} onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => setEditing(s)}>
          <Pencil /> Edit subscription
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={s.status === 'CANCELLED'}
          onSelect={() =>
            invoiceNow.mutate(s.id, {
              onSuccess: (r) => toast.success(`Invoice ${r.number} raised for ${s.tenant.name}`),
            })
          }
        >
          <Receipt /> Invoice this period
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const columns: Column<SubscriptionRow>[] = [
    { key: 'school', header: 'School', cell: (s) => <SchoolCell school={s.tenant} /> },
    {
      key: 'plan',
      header: 'Plan',
      cell: (s) => (
        <div>
          <p className="font-medium">{s.plan.name}</p>
          <p className="text-[12px] text-muted-foreground">{BILLING_PERIOD_LABELS[s.plan.billingPeriod]}</p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (s) => (
      <div className="flex flex-col items-start gap-1">
        <SubStatusBadge status={s.status} />
        {s.cancelAtPeriodEnd && <span className="text-[11px] text-warning">Cancels at period end</span>}
      </div>
    ) },
    {
      key: 'seats',
      header: 'Seats',
      className: 'tabular text-right',
      headClassName: 'text-right',
      cell: (s) => (
        <div>
          <p className="font-medium">{formatNumber(s.billableSeats)}</p>
          <p className="whitespace-nowrap text-[11.5px] text-muted-foreground">
            {formatNumber(s.activeStudents)} active · {formatNumber(s.studentSeats)} seats
          </p>
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Per student',
      className: 'tabular text-right',
      headClassName: 'text-right',
      cell: (s) => (
        <div>
          <p>{naira(s.unitKobo)}</p>
          {(s.discountPct > 0 || s.priceOverrideKobo != null) && (
            <p className="text-[11.5px] text-muted-foreground">{[s.priceOverrideKobo != null && 'custom', s.discountPct > 0 && `${s.discountPct}% off`].filter(Boolean).join(' · ')}</p>
          )}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Period amount',
      className: 'tabular text-right',
      headClassName: 'text-right',
      cell: (s) => (
        <div>
          <p className="font-medium">{naira(s.periodAmountKobo)}</p>
          <p className="whitespace-nowrap text-[11.5px] text-muted-foreground">{naira(s.monthlyKobo)}/mo</p>
        </div>
      ),
    },
    {
      key: 'period',
      header: 'Current period',
      cell: (s) => (
        <span className="whitespace-nowrap text-[12.5px] text-muted-foreground">
          {formatDate(s.currentPeriodStart, { year: undefined })} – {formatDate(s.currentPeriodEnd)}
        </span>
      ),
    },
    {
      key: 'owed',
      header: 'Outstanding',
      className: 'tabular text-right',
      headClassName: 'text-right',
      cell: (s) => (s.outstandingKobo ? <span className="font-medium text-danger">{naira(s.outstandingKobo)}</span> : <Muted />),
    },
    { key: 'actions', header: <span className="sr-only">Actions</span>, className: 'w-10 text-right', cell: actions },
  ];

  return (
    <Card className="overflow-hidden">
      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search school or plan…" className="sm:w-72" />
      </Toolbar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(s) => s.id}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        onRowClick={(s) => setEditing(s)}
        rowLabel={(s) => `Edit ${s.tenant.name}’s subscription`}
        renderMobile={(s) => (
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">{s.tenant.name}</p>
              <p className="truncate text-[12px] text-muted-foreground">
                {s.plan.name} · {formatNumber(s.billableSeats)} seats · {naira(s.periodAmountKobo)}
              </p>
              {s.outstandingKobo > 0 && <p className="text-[12px] font-medium text-danger">{naira(s.outstandingKobo)} outstanding</p>}
            </div>
            <SubStatusBadge status={s.status} />
          </div>
        )}
        empty={{ icon: RefreshCw, title: search ? 'No subscriptions match' : 'No subscriptions yet', description: 'A subscription starts when a school is given a plan.' }}
      />
      <EditSubscriptionDialog sub={editing} onOpenChange={(o) => !o && setEditing(null)} />
    </Card>
  );
}

// ------------------------------------------------------------------ invoices

type InvoiceFilter = 'ALL' | PlatformInvoiceStatus | 'OVERDUE';

function InvoicesTab() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('status');
  const filter: InvoiceFilter = raw === 'OPEN' || raw === 'OVERDUE' || raw === 'PAID' || raw === 'VOID' ? raw : 'ALL';
  const setFilter = (f: InvoiceFilter) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (f === 'ALL') n.delete('status');
        else n.set('status', f);
        return n;
      },
      { replace: true },
    );
  const q = usePlatformInvoices(filter === 'ALL' ? undefined : filter);
  const [search, setSearch] = useState('');
  const [paying, setPaying] = useState<PlatformInvoiceRow | null>(null);
  const [voiding, setVoiding] = useState<PlatformInvoiceRow | null>(null);
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return q.data?.filter((r) => !s || `${r.number} ${r.tenant.name} ${r.description}`.toLowerCase().includes(s));
  }, [q.data, search]);

  const columns: Column<PlatformInvoiceRow>[] = [
    {
      key: 'number',
      header: 'Invoice',
      cell: (i) => (
        <div className="min-w-0">
          <p className="font-mono text-[12.5px] font-medium">{i.number}</p>
          <p className="max-w-[240px] truncate text-[12px] text-muted-foreground" title={i.description}>
            {i.description}
          </p>
        </div>
      ),
    },
    { key: 'school', header: 'School', cell: (i) => <SchoolCell school={i.tenant} /> },
    { key: 'issued', header: 'Issued', cell: (i) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(i.issuedAt)}</span> },
    { key: 'due', header: 'Due', cell: (i) => <span className={i.overdue && i.status === 'OPEN' ? 'whitespace-nowrap font-medium text-danger' : 'whitespace-nowrap text-muted-foreground'}>{formatDate(i.dueDate)}</span> },
    { key: 'amount', header: 'Amount', className: 'tabular text-right', headClassName: 'text-right', cell: (i) => naira(i.amountKobo) },
    { key: 'balance', header: 'Balance', className: 'tabular text-right', headClassName: 'text-right', cell: (i) => (i.balanceKobo && i.status === 'OPEN' ? <span className="font-medium">{naira(i.balanceKobo)}</span> : <Muted />) },
    { key: 'status', header: 'Status', cell: (i) => <PlatformInvoiceBadge invoice={i} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'w-10 text-right',
      cell: (i) =>
        i.status === 'OPEN' ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${i.number}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => setPaying(i)}>
                <Banknote /> Record payment
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setVoiding(i)} className="text-danger focus:text-danger">
                <Ban /> Void invoice
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ];

  return (
    <Card className="overflow-hidden">
      <Toolbar>
        <Segmented<InvoiceFilter>
          label="Invoice status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'OPEN', label: 'Open' },
            { value: 'OVERDUE', label: 'Overdue' },
            { value: 'PAID', label: 'Paid' },
            { value: 'VOID', label: 'Void' },
          ]}
        />
        <SearchInput value={search} onChange={setSearch} placeholder="Search number, school…" className="sm:w-64" />
        {q.data && (
          <p className="text-[12.5px] text-muted-foreground tabular sm:ml-auto">
            {rows?.length ?? 0} invoices · {naira((rows ?? []).filter((r) => r.status === 'OPEN').reduce((t, r) => t + r.balanceKobo, 0))} open
          </p>
        )}
      </Toolbar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(i) => i.id}
        loading={q.isLoading || q.isPlaceholderData}
        error={q.error}
        onRetry={() => void q.refetch()}
        renderMobile={(i) => (
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[14px] font-medium">
                <span className="font-mono text-[12.5px]">{i.number}</span> {i.tenant.name}
              </p>
              <p className="truncate text-[12px] text-muted-foreground">
                {naira(i.amountKobo)} · due {formatDate(i.dueDate)}
              </p>
              {i.status === 'OPEN' && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setPaying(i)}>
                    <Banknote /> Record payment
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setVoiding(i)}>
                    Void
                  </Button>
                </div>
              )}
            </div>
            <PlatformInvoiceBadge invoice={i} />
          </div>
        )}
        empty={{ icon: FileText, title: filter === 'ALL' && !search ? 'No invoices yet' : 'No invoices match', description: filter === 'OVERDUE' ? 'Nothing is overdue. Nice.' : 'Invoices are raised when a period starts.' }}
      />
      <RecordPaymentDialog invoice={paying} onOpenChange={(o) => !o && setPaying(null)} />
      <VoidInvoiceDialog invoice={voiding} onOpenChange={(o) => !o && setVoiding(null)} />
    </Card>
  );
}

// ------------------------------------------------------------------ payments

function PaymentsTab() {
  const q = usePlatformPayments();
  const verify = useVerifyPayment();
  const [search, setSearch] = useState('');
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return q.data?.filter((r) => !s || `${r.reference} ${r.tenant.name} ${r.invoice.number}`.toLowerCase().includes(s));
  }, [q.data, search]);
  const pending = q.data?.filter((p) => p.status === 'PENDING').length ?? 0;
  const refunds = useRefunds();
  const [refunding, setRefunding] = useState<RefundTarget | null>(null);
  const refundedOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of refunds.data ?? []) if (r.sourceType === 'PLATFORM_PAYMENT' && r.status !== 'FAILED') m.set(r.sourceId, (m.get(r.sourceId) ?? 0) + r.amountKobo);
    return m;
  }, [refunds.data]);
  const refundTarget = (p: PlatformPaymentRow): RefundTarget => ({ kind: 'payment', id: p.id, label: p.invoice.number, who: p.tenant.name, amountKobo: p.amountKobo, refundedKobo: refundedOf.get(p.id) ?? 0 });
  const canRefund = (p: PlatformPaymentRow) => p.status === 'SUCCESS' && (refundedOf.get(p.id) ?? 0) < p.amountKobo;

  const columns: Column<PlatformPaymentRow>[] = [
    {
      key: 'when',
      header: 'Date',
      cell: (p) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(p.paidAt ?? p.createdAt)}</span>,
    },
    { key: 'school', header: 'School', cell: (p) => <SchoolCell school={p.tenant} /> },
    { key: 'invoice', header: 'Invoice', cell: (p) => <span className="font-mono text-[12.5px]">{p.invoice.number}</span> },
    {
      key: 'method',
      header: 'Method',
      cell: (p) => (
        <div>
          <p>{PAYMENT_METHOD_LABEL[p.method]}</p>
          <p className="max-w-[180px] truncate font-mono text-[11.5px] text-muted-foreground" title={p.reference}>
            {p.reference}
          </p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      className: 'tabular text-right',
      headClassName: 'text-right',
      cell: (p) => (
        <div>
          <p className="font-medium">{naira(p.amountKobo)}</p>
          {(refundedOf.get(p.id) ?? 0) > 0 && <p className="whitespace-nowrap text-[11.5px] text-warning">−{naira(refundedOf.get(p.id))} refunded</p>}
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (p) => <PaymentStatusPill status={p.status} /> },
    { key: 'by', header: 'Recorded by', cell: (p) => <span className="text-muted-foreground">{p.recordedBy ?? (p.method === 'PAYSTACK' ? 'Online' : '—')}</span> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      cell: (p) =>
        p.status === 'PENDING' && p.method === 'PAYSTACK' ? (
          <Button
            size="sm"
            variant="outline"
            loading={verify.isPending && verify.variables === p.reference}
            onClick={() =>
              verify.mutate(p.reference, {
                onSuccess: (r) =>
                  r.status === 'SUCCESS'
                    ? toast.success('Payment confirmed', { description: `${naira(p.amountKobo)} from ${p.tenant.name}` })
                    : r.status === 'FAILED'
                      ? toast.error('Paystack says this payment failed')
                      : toast.info('Still pending at Paystack'),
              })
            }
          >
            Verify
          </Button>
        ) : canRefund(p) ? (
          <Button size="sm" variant="ghost" onClick={() => setRefunding(refundTarget(p))}>
            <Undo2 /> Refund
          </Button>
        ) : null,
    },
  ];

  return (
    <Card className="overflow-hidden">
      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search reference, school, invoice…" className="sm:w-80" />
        {pending > 0 && <Badge variant="warning">{pending} pending online</Badge>}
      </Toolbar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        renderMobile={(p) => (
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">
                {naira(p.amountKobo)} · {p.tenant.name}
              </p>
              <p className="truncate text-[12px] text-muted-foreground">
                {PAYMENT_METHOD_LABEL[p.method]} · {p.invoice.number} · {formatDate(p.paidAt ?? p.createdAt)}
              </p>
              {(refundedOf.get(p.id) ?? 0) > 0 && <p className="text-[12px] text-warning">−{naira(refundedOf.get(p.id))} refunded</p>}
              {canRefund(p) && (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => setRefunding(refundTarget(p))}>
                  <Undo2 /> Refund
                </Button>
              )}
            </div>
            <PaymentStatusPill status={p.status} />
          </div>
        )}
        empty={{ icon: CreditCard, title: search ? 'No payments match' : 'No payments yet', description: 'Payments appear when schools pay online or you record a transfer.' }}
      />
      <RefundDialog target={refunding} onOpenChange={(o) => !o && setRefunding(null)} />
    </Card>
  );
}
