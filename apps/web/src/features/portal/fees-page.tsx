import { PAYMENT_METHOD_LABELS, type PaymentMethod, type PortalFees } from '@aischool/shared';
import { AlertTriangle, ArrowRight, Banknote, Building2, ChevronDown, CircleCheck, Clock, Lock, Receipt } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CopyButton, money } from '../finance/ui';
import { usePortalFees } from './api';
import { PortalShell, portalPath, StatTile, type ShellCtx } from './ui';

type Invoice = PortalFees['invoices'][number];
type Payment = PortalFees['payments'][number];

export default function PortalFeesPage() {
  return (
    <PortalShell
      section="fees"
      title={() => 'Fees'}
      description={({ child }) => `${child.firstName}’s school fees, payments and receipts.`}
    >
      {(ctx) => <FeesBody {...ctx} />}
    </PortalShell>
  );
}

function receiptPath(childId: string, paymentId: string): string {
  return `${portalPath('fees', childId)}/receipt/${paymentId}`;
}

function FeesBody({ child, who }: ShellCtx) {
  const q = usePortalFees(child.id);
  const d = q.data;
  if (q.error && !d) {
    if (q.error instanceof ApiError && q.error.status === 403) {
      return (
        <Card>
          <EmptyState icon={Lock} title="Not shared by the school" description="Your school hasn’t made fees available in the portal. Please contact the school bursar about fees and payments." />
        </Card>
      );
    }
    return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  }
  if (!d) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    );
  }
  if (d.invoices.length === 0 && d.payments.length === 0) {
    return (
      <Card>
        <EmptyState icon={Banknote} title="No fees yet" description={`When the school issues an invoice for ${who}, you’ll see it here with what’s owed and how to pay.`} />
      </Card>
    );
  }

  const overdue = d.invoices.filter((i) => i.overdue);
  const pending = d.payments.filter((p) => p.status === 'PENDING');
  return (
    <div className="space-y-4">
      <Summary d={d} />

      {overdue.length > 0 && (
        <div role="alert" className="flex gap-3 rounded-2xl border border-danger/30 bg-danger-soft/50 p-3.5 sm:p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <p className="min-w-0 text-[13.5px]">
            <strong className="font-semibold text-danger">{overdue.length === 1 ? 'An invoice is overdue.' : `${overdue.length} invoices are overdue.`}</strong>{' '}
            {overdue.length === 1
              ? `${money(overdue[0].balanceKobo, d.currency)} was due on ${formatDate(overdue[0].dueDate)}.`
              : `${money(
                  overdue.reduce((n, i) => n + i.balanceKobo, 0),
                  d.currency,
                )} is past its due date.`}{' '}
            Please pay as soon as you can, or speak to the school bursar.
          </p>
        </div>
      )}

      {pending.length > 0 && (
        <div role="status" className="flex gap-3 rounded-2xl border border-warning/30 bg-warning-soft/40 p-3.5 sm:p-4">
          <Clock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p className="min-w-0 text-[13.5px]">
            <strong className="font-semibold">{pending.length === 1 ? 'A payment is awaiting confirmation.' : `${pending.length} payments are awaiting confirmation.`}</strong> The balance will update once
            the bank confirms it. There’s no need to pay again.
          </p>
        </div>
      )}

      {d.invoices.length > 0 && (
        <section aria-label="Invoices" className="space-y-3">
          <h2 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Invoices</h2>
          {d.invoices.map((inv) => (
            <InvoiceCard key={inv.id} inv={inv} d={d} />
          ))}
        </section>
      )}

      <section aria-label="Payment history">
        <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Payment history</h2>
        {d.payments.length === 0 ? (
          <Card className="p-4 text-[13px] text-muted-foreground">No payments yet. Receipts for every payment will appear here.</Card>
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {d.payments.map((p) => (
              <PaymentRow key={p.id} p={p} currency={d.currency} childId={child.id} />
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ summary

function Summary({ d }: { d: PortalFees }) {
  const { billedKobo, paidKobo, balanceKobo } = d.totals;
  const clear = balanceKobo <= 0;
  return (
    <Card className="p-4 sm:p-5">
      <p className="text-[12.5px] font-medium text-muted-foreground">{clear ? 'Balance' : 'Balance owed'}</p>
      <p className={cn('mt-0.5 break-words font-display text-[34px] font-semibold leading-tight tracking-[-0.02em] tabular', clear ? 'text-success' : 'text-danger')}>
        {clear ? 'All paid' : money(balanceKobo, d.currency)}
      </p>
      {clear && <p className="text-[13px] text-muted-foreground">Nothing outstanding. Thank you!</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <StatTile label="Total billed" value={money(billedKobo, d.currency)} className="[&>p:last-child]:text-[17px]" />
        <StatTile label="Paid" value={money(paidKobo, d.currency)} tone="text-success" className="[&>p:last-child]:text-[17px]" />
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ invoices

function InvoiceBadge({ inv }: { inv: Invoice }) {
  if (inv.status === 'PAID' || inv.balanceKobo <= 0)
    return (
      <Badge variant="success" dot>
        Paid
      </Badge>
    );
  if (inv.overdue)
    return (
      <Badge variant="danger" dot>
        Overdue
      </Badge>
    );
  if (inv.paidKobo > 0)
    return (
      <Badge variant="warning" dot>
        Part paid
      </Badge>
    );
  return (
    <Badge variant="info" dot>
      Unpaid
    </Badge>
  );
}

function InvoiceCard({ inv, d }: { inv: Invoice; d: PortalFees }) {
  const [open, setOpen] = useState(false);
  const c = d.currency;
  const pct = inv.totalKobo > 0 ? Math.min(100, Math.round((inv.paidKobo / inv.totalKobo) * 100)) : 100;
  const owing = inv.balanceKobo > 0;
  const linesId = `lines-${inv.id}`;
  return (
    <Card className="overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-[15.5px] font-semibold leading-snug">
              {inv.term} · {inv.sessionName}
            </p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              <span className="font-mono">{inv.number}</span> · Due {formatDate(inv.dueDate)}
            </p>
          </div>
          <div className="shrink-0">
            <InvoiceBadge inv={inv} />
          </div>
        </div>

        <div className="mt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px]">
            <span className="text-muted-foreground">
              Paid <span className="font-medium text-foreground tabular">{money(inv.paidKobo, c)}</span> of <span className="tabular">{money(inv.totalKobo, c)}</span>
            </span>
            {owing && <span className={cn('font-semibold tabular', inv.overdue ? 'text-danger' : 'text-foreground')}>{money(inv.balanceKobo, c)} left</span>}
          </div>
          <div
            role="progressbar"
            aria-label={`${inv.number} paid`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
          >
            <div className={cn('h-full rounded-full transition-[width]', owing ? 'bg-brand' : 'bg-success')} style={{ width: `${pct}%` }} />
          </div>
        </div>

        {inv.lines.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={linesId}
              onClick={() => setOpen((o) => !o)}
              className="-mx-2 flex min-h-10 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-brand hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {open ? 'Hide' : 'Show'} what’s included ({inv.lines.length})
              <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
            </button>
            {open && (
              <dl id={linesId} className="mt-1 divide-y divide-border rounded-xl border border-border text-[13px]">
                {inv.lines.map((l, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 px-3 py-2">
                    <dt className="min-w-0 break-words">{l.description}</dt>
                    <dd className="shrink-0 tabular">{money(l.amountKobo, c)}</dd>
                  </div>
                ))}
                <div className="flex items-start justify-between gap-3 bg-muted/40 px-3 py-2 font-semibold">
                  <dt>Total</dt>
                  <dd className="shrink-0 tabular">{money(inv.totalKobo, c)}</dd>
                </div>
              </dl>
            )}
          </div>
        )}
      </div>

      {owing ? (
        <div className="border-t border-border bg-muted/20 p-4 sm:p-5">
          {inv.payPath ? (
            <>
              <Button asChild size="lg" className="h-12 w-full rounded-xl text-[15px]">
                <Link to={inv.payPath}>
                  Pay {money(inv.balanceKobo, c)} balance <ArrowRight />
                </Link>
              </Button>
              <p className="mt-2 text-center text-[12px] text-muted-foreground">Card, bank transfer or USSD on Paystack’s secure page. You can pay part of it.</p>
              {d.bankDetails && <OrBankTransfer inv={inv} bankDetails={d.bankDetails} />}
            </>
          ) : (
            <BankTransfer inv={inv} bankDetails={d.bankDetails} />
          )}
        </div>
      ) : (
        <p className="flex items-center gap-1.5 border-t border-border px-4 py-3 text-[13px] font-medium text-success sm:px-5">
          <CircleCheck className="size-4" aria-hidden /> Fully paid
        </p>
      )}
    </Card>
  );
}

function BankTransfer({ inv, bankDetails }: { inv: Invoice; bankDetails: string | null }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-[14px] font-semibold">
        <Building2 className="size-4 text-muted-foreground" aria-hidden /> Pay by bank transfer
      </p>
      {bankDetails ? <BankDetails inv={inv} bankDetails={bankDetails} /> : <p className="mt-1.5 text-[13px] text-muted-foreground">Please contact the school bursar for how to pay, and quote invoice {inv.number}.</p>}
    </div>
  );
}

function OrBankTransfer({ inv, bankDetails }: { inv: Invoice; bankDetails: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 text-center">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Prefer to pay by bank transfer?
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="text-left">
          <BankDetails inv={inv} bankDetails={bankDetails} />
        </div>
      )}
    </div>
  );
}

function BankDetails({ inv, bankDetails }: { inv: Invoice; bankDetails: string }) {
  return (
    <>
      <div className="mt-2 rounded-xl border border-border bg-card p-3">
        <p className="whitespace-pre-line break-words text-[13.5px] font-medium">{bankDetails}</p>
        <CopyButton text={bankDetails} label="bank details" variant="outline" className="mt-2.5 w-full sm:w-auto">
          Copy bank details
        </CopyButton>
      </div>
      <p className="mt-2 text-[12.5px] text-muted-foreground">
        Quote invoice <span className="font-mono font-medium text-foreground">{inv.number}</span> as the transfer description so the school can match your payment.{' '}
        <CopyButton text={inv.number} label="invoice number" className="-my-1 align-middle" />
      </p>
    </>
  );
}

// ------------------------------------------------------------------ payments

function methodLabel(method: string): string {
  if (method === 'PAYSTACK') return 'Online';
  return PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? method;
}

function PaymentRow({ p, currency, childId }: { p: Payment; currency: string; childId: string }) {
  const reversed = p.status === 'REVERSED';
  const pending = p.status === 'PENDING';
  return (
    <div className="flex items-center gap-3 p-3 sm:p-4">
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', pending ? 'bg-warning-soft text-warning' : reversed ? 'bg-muted text-muted-foreground' : 'bg-success-soft text-success')}>
        {pending ? <Clock className="size-[18px]" aria-hidden /> : <Receipt className="size-[18px]" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn('font-display text-[15.5px] font-semibold tabular', reversed && 'text-muted-foreground line-through')}>{money(p.amountKobo, currency)}</span>
          {pending ? (
            <Badge variant="warning" dot>
              Awaiting confirmation
            </Badge>
          ) : reversed ? (
            <Badge variant="outline">Reversed</Badge>
          ) : (
            <Badge variant="success" dot>
              Received
            </Badge>
          )}
        </p>
        <p className="text-[12.5px] text-muted-foreground">
          {[p.paidAt ? formatDate(p.paidAt) : 'Just now', methodLabel(p.method), p.invoiceNumber].join(' · ')}
        </p>
        {p.receiptNumber && <p className="truncate font-mono text-[12px] text-muted-foreground">Receipt {p.receiptNumber}</p>}
        {reversed && <p className="text-[12px] text-muted-foreground">The school reversed this payment, so it no longer counts towards the fees.</p>}
        {pending && <p className="text-[12px] text-muted-foreground">This will update once the bank confirms it.</p>}
      </div>
      {!pending && (
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link to={receiptPath(childId, p.id)} aria-label={`Receipt for ${money(p.amountKobo, currency)}`}>
            <Receipt className="hidden sm:block" /> Receipt
          </Link>
        </Button>
      )}
    </div>
  );
}
