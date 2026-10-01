import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type PaymentMethod, type PaymentRow } from '@aischool/shared';
import { CalendarRange, CreditCard, Receipt, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { type Column, DataTable, Pagination } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCan } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { usePayments } from './api';
import { FindInvoiceDialog, type PayableInvoice, RecordPaymentDialog } from './payment-dialogs';
import { addDaysIso, MethodBadge, money, PaymentStatusBadge, schoolDateTime, schoolToday, useCurrency } from './ui';

const PAGE_SIZE = 50;

type Preset = 'today' | '7d' | '30d' | 'month' | 'all';
const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' },
];

function presetRange(p: Preset): { from?: string; to?: string } {
  const today = schoolToday();
  if (p === 'today') return { from: today, to: today };
  if (p === '7d') return { from: addDaysIso(today, -6), to: today };
  if (p === '30d') return { from: addDaysIso(today, -29), to: today };
  if (p === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  return {};
}

export default function PaymentsPage() {
  const currency = useCurrency();
  const canManage = useCan('finance.manage');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const from = params.get('from') ?? undefined;
  const to = params.get('to') ?? undefined;
  const rawMethod = params.get('method') as PaymentMethod | null;
  const method = rawMethod && PAYMENT_METHODS.includes(rawMethod) ? rawMethod : undefined;
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [findOpen, setFindOpen] = useState(false);
  const [paying, setPaying] = useState<PayableInvoice | null>(null);

  const patch = (next: Record<string, string | undefined>) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(next)) {
          if (v) p.set(k, v);
          else p.delete(k);
        }
        return p;
      },
      { replace: true },
    );

  useEffect(() => {
    if (params.get('new') === '1') {
      if (canManage) setFindOpen(true);
      patch({ new: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const list = usePayments({ from, to, method, page, pageSize: PAGE_SIZE });
  const items = list.data?.items;
  const pageTotal = (items ?? []).filter((p) => p.status === 'SUCCESS').reduce((n, p) => n + p.amountKobo, 0);
  const activePreset = PRESETS.find((p) => {
    const r = presetRange(p.key);
    return r.from === from && r.to === to;
  })?.key;

  const columns: Column<PaymentRow>[] = [
    {
      key: 'receipt',
      header: 'Receipt',
      cell: (p) => <span className={cn('font-mono text-[12.5px]', p.status === 'REVERSED' ? 'text-muted-foreground line-through' : 'text-muted-foreground')}>{p.receiptNumber ?? '—'}</span>,
    },
    { key: 'date', header: 'Date', cell: (p) => <span className="whitespace-nowrap text-[12.5px] tabular text-muted-foreground">{schoolDateTime(p.paidAt)}</span> },
    {
      key: 'student',
      header: 'Learner',
      cell: (p) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{p.student.name}</p>
          <p className="text-[11.5px] text-muted-foreground">
            {p.student.classArm ?? '—'} · <span className="font-mono">{p.invoiceNumber}</span>
          </p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      headClassName: 'text-right',
      className: 'text-right',
      cell: (p) => <span className={cn('font-semibold tabular', p.status === 'REVERSED' && 'text-muted-foreground line-through')}>{money(p.amountKobo, currency)}</span>,
    },
    { key: 'method', header: 'Method', cell: (p) => <MethodBadge method={p.method} /> },
    { key: 'ref', header: 'Reference', cell: (p) => <span className="block max-w-[140px] truncate font-mono text-[12px] text-muted-foreground">{p.reference ?? '—'}</span> },
    { key: 'by', header: 'Received by', cell: (p) => <span className="text-[12.5px] text-muted-foreground">{p.receivedBy ?? (p.method === 'PAYSTACK' ? 'Online' : '—')}</span> },
    { key: 'status', header: 'Status', cell: (p) => <PaymentStatusBadge status={p.status} /> },
  ];

  return (
    <Page>
      <PageHeader
        title="Payments"
        description="Every fee payment received — cash, transfer, POS, cheque and online — with a receipt for each."
        actions={
          canManage && (
            <Button onClick={() => setFindOpen(true)}>
              <Wallet /> Record payment
            </Button>
          )
        }
      />

      <Card className="mb-4 flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
        <div role="radiogroup" aria-label="Date range" className="no-scrollbar inline-flex h-10 items-center gap-1 overflow-x-auto rounded-xl border border-border bg-muted/60 p-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              role="radio"
              aria-checked={activePreset === p.key}
              onClick={() => {
                const r = presetRange(p.key);
                patch({ from: r.from, to: r.to, page: undefined });
              }}
              className={cn(
                'inline-flex h-full shrink-0 items-center rounded-lg px-3 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                activePreset === p.key ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <CalendarRange className="size-4" aria-hidden />
            <span className="sr-only">From</span>
            <Input type="date" value={from ?? ''} max={to} onChange={(e) => patch({ from: e.target.value || undefined, page: undefined })} className="h-10 w-[150px] tabular [color-scheme:light] dark:[color-scheme:dark]" aria-label="From date" />
          </label>
          <span className="text-muted-foreground">–</span>
          <Input type="date" value={to ?? ''} min={from} onChange={(e) => patch({ to: e.target.value || undefined, page: undefined })} className="h-10 w-[150px] tabular [color-scheme:light] dark:[color-scheme:dark]" aria-label="To date" />
          <Select value={method ?? NONE} onValueChange={(v) => patch({ method: v === NONE ? undefined : v, page: undefined })}>
            <SelectTrigger aria-label="Payment method" className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All methods</SelectItem>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(p) => p.id}
          loading={list.isLoading || list.isPlaceholderData}
          error={list.error}
          onRetry={() => void list.refetch()}
          onRowClick={(p) => navigate(p.receiptNumber ? `/fees/receipts/${p.id}` : `/fees/invoices/${p.invoiceId}`)}
          rowLabel={(p) => `Payment of ${money(p.amountKobo, currency)} from ${p.student.name}`}
          renderMobile={(p) => (
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{p.student.name}</p>
                <p className="text-[12px] text-muted-foreground">{schoolDateTime(p.paidAt)}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <MethodBadge method={p.method} />
                  {p.status !== 'SUCCESS' && <PaymentStatusBadge status={p.status} />}
                </div>
              </div>
              <div className="text-right">
                <p className={cn('text-[15px] font-semibold tabular', p.status === 'REVERSED' && 'text-muted-foreground line-through')}>{money(p.amountKobo, currency)}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{p.receiptNumber}</p>
              </div>
            </div>
          )}
          empty={{
            icon: CreditCard,
            title: from || to || method ? 'No payments in this range' : 'No payments yet',
            description: from || to || method ? 'Try a wider date range or another method.' : 'Payments you record, and online payments from parents, appear here.',
            action: canManage ? (
              <Button variant="outline" onClick={() => setFindOpen(true)}>
                <Wallet /> Record payment
              </Button>
            ) : undefined,
          }}
        />
        {items && items.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-4 py-3 sm:px-5">
            <p className="text-[12.5px] text-muted-foreground">
              {list.data && list.data.total > items.length ? `Received on this page (${items.length} of ${list.data.total.toLocaleString()})` : 'Total received'}
              <span className="hidden sm:inline"> · reversed payments excluded</span>
            </p>
            <p className="font-display text-[17px] font-semibold tabular">{money(pageTotal, currency)}</p>
          </div>
        )}
        {list.data && list.data.total > PAGE_SIZE && (
          <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={(p) => patch({ page: p > 1 ? String(p) : undefined })} noun="payments" />
        )}
      </Card>

      <p className="mt-3 flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Receipt className="size-3.5" aria-hidden /> Times are shown in the school’s time zone. Open a row for its receipt.{' '}
        <Link to="/fees?tab=invoices&status=OUTSTANDING" className="font-medium text-brand hover:underline">
          See outstanding invoices
        </Link>
      </p>

      <FindInvoiceDialog
        open={findOpen}
        onOpenChange={setFindOpen}
        onPick={(inv) => {
          setFindOpen(false);
          setPaying(inv);
        }}
      />
      <RecordPaymentDialog open={!!paying} onOpenChange={(o) => !o && setPaying(null)} invoice={paying} />
    </Page>
  );
}
