import { BILLING_PERIOD_LABELS, MODULE_FEATURE_KEYS, MODULE_FEATURES, type SchoolBilling } from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertTriangle, Building2, Check, CheckCircle2, Clock, CreditCard, Hourglass, LifeBuoy, Minus, Receipt, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { useAuthStore, useCan } from '@/lib/auth-store';
import { formatDate, formatNumber } from '@/lib/format';
import { queryClient } from '@/lib/query-client';
import { cn } from '@/lib/utils';
import { CopyButton } from '../finance/ui';
import { naira, usd } from '../platform/api';
import { daysUntil, Facts, Meter, PAYMENT_METHOD_LABEL, PaymentStatusPill, PlatformInvoiceBadge, Section, SUB_STATUS_LABEL } from '../platform/ui';
import { SectionHeader } from '../settings/settings-layout';

type Invoice = SchoolBilling['invoices'][number];
const KEY = ['billing', 'school'] as const;

export default function SchoolBillingPage() {
  const q = useQuery({ queryKey: KEY, queryFn: ({ signal }) => api.get<SchoolBilling>('/billing', undefined, signal) });
  const b = q.data;
  const canSupport = useCan('support.use');
  const [transferFor, setTransferFor] = useState<Invoice | null>(null);
  const pay = useMutation({
    mutationFn: (id: string) => {
      // Paystack needs a real address for the receipt; demo and test accounts don't have one.
      const own = useAuthStore.getState().me?.user.email ?? '';
      const email = /\.(demo|test|local|example|invalid)$/i.test(own) ? window.prompt('Email address for the Paystack receipt:', '')?.trim() : null;
      if (email === undefined) return Promise.reject(new Error('Payment cancelled'));
      return api.post<{ authorizationUrl: string; reference: string }>(`/billing/invoices/${id}/pay`, email ? { email } : {});
    },
    onSuccess: (r) => {
      window.location.href = r.authorizationUrl;
    },
  });

  return (
    <div>
      <SectionHeader
        title="Billing"
        description="Your AI School OS plan, invoices and payments."
        actions={
          canSupport && (
            <Button asChild variant="outline" size="sm">
              <Link to="/support?new=billing">
                <LifeBuoy /> Billing question
              </Link>
            </Button>
          )
        }
      />
      <PaymentReturn />
      {q.error && !b ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : !b ? (
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-5">
          <StatusBanner b={b} />
          <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] [&>*]:min-w-0">
            <PlanCard b={b} />
            <div className="space-y-5">
              <UsageCard b={b} />
              <SubscriptionCard b={b} />
            </div>
          </div>
          <InvoicesCard b={b} onPay={(i) => (b.onlinePayment ? pay.mutate(i.id) : setTransferFor(i))} paying={pay.isPending ? pay.variables : undefined} />
          <PaymentsCard b={b} />
        </div>
      )}
      <TransferDialog invoice={transferFor} bankDetails={b?.bankDetails ?? null} onOpenChange={(o) => !o && setTransferFor(null)} />
    </div>
  );
}

// ------------------------------------------------------------------ return from Paystack

function PaymentReturn() {
  const [params, setParams] = useSearchParams();
  const reference = params.get('reference') ?? params.get('trxref');
  const returned = params.get('paid') === '1' && !!reference;
  const started = useRef(false);
  const verify = useMutation({
    mutationFn: (ref: string) => api.get<{ status: 'PENDING' | 'SUCCESS' | 'FAILED'; invoiceId: string }>('/billing/verify', { reference: ref }),
    meta: { silent: true },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: KEY }),
  });
  useEffect(() => {
    if (!returned || started.current || !reference) return;
    started.current = true;
    verify.mutate(reference, {
      onSuccess: (r) => r.status === 'SUCCESS' && toast.success('Payment received — thank you'),
    });
    // Keep the URL clean so a refresh doesn't re-verify.
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        ['paid', 'reference', 'trxref'].forEach((k) => n.delete(k));
        return n;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returned]);

  if (!started.current) return null;
  const s = verify.data?.status;
  const tone = verify.isPending ? 'info' : verify.isError || s === 'FAILED' ? 'danger' : s === 'SUCCESS' ? 'success' : 'warning';
  const Icon = verify.isPending ? Hourglass : tone === 'success' ? CheckCircle2 : tone === 'danger' ? XCircle : Clock;
  const text = verify.isPending
    ? 'Confirming your payment with Paystack…'
    : verify.isError
      ? `We couldn’t confirm the payment yet: ${errorMessage(verify.error)}. If you were charged it will show here shortly.`
      : s === 'SUCCESS'
        ? 'Payment received. Your invoice is updated — thank you.'
        : s === 'FAILED'
          ? 'Paystack says the payment didn’t go through. You haven’t been charged; try again or pay by transfer.'
          : 'Your payment is still processing at Paystack. This page updates once it clears.';
  return (
    <motion.p
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      role="status"
      className={cn(
        'mb-5 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[13.5px]',
        tone === 'success' && 'border-success/30 bg-success-soft/50 text-success',
        tone === 'danger' && 'border-danger/30 bg-danger-soft/50 text-danger',
        tone === 'warning' && 'border-warning/30 bg-warning-soft/50 text-warning',
        tone === 'info' && 'border-info/30 bg-info-soft/50 text-info',
      )}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', verify.isPending && 'animate-pulse')} /> {text}
    </motion.p>
  );
}

// ------------------------------------------------------------------ banners

function StatusBanner({ b }: { b: SchoolBilling }) {
  const overdue = b.invoices.filter((i) => i.status === 'OPEN' && i.overdue);
  if (b.status === 'TRIAL' && b.trialEndsAt) {
    const d = daysUntil(b.trialEndsAt) ?? 0;
    const pct = Math.max(0, Math.min(100, ((30 - Math.max(0, d)) / 30) * 100));
    return (
      <Card className="relative overflow-hidden border-brand/30 p-5">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-brand/10 blur-3xl" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            <Hourglass className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[16px] font-semibold tracking-tight">
              {d > 1 ? `${d} days left in your trial` : d === 1 ? 'Your trial ends tomorrow' : d === 0 ? 'Your trial ends today' : 'Your trial has ended'}
            </p>
            <p className="text-[13px] text-muted-foreground">
              Trial ends {formatDate(b.trialEndsAt)}. {b.plan ? `You’ll continue on the ${b.plan.name} plan` : 'Choose a plan'} — pay the first invoice to keep everything running.
            </p>
            <Meter pct={pct} className="mt-2.5 max-w-sm" label="Trial used" />
          </div>
        </div>
      </Card>
    );
  }
  if (overdue.length || b.subscription?.status === 'PAST_DUE') {
    return (
      <p className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft/40 px-4 py-3 text-[13.5px] text-danger">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        {overdue.length ? `${overdue.length} invoice${overdue.length === 1 ? ' is' : 's are'} overdue (${naira(overdue.reduce((t, i) => t + i.balanceKobo, 0))}).` : 'Your subscription is past due.'} Please pay to avoid
        interruption.
      </p>
    );
  }
  return null;
}

// ------------------------------------------------------------------ plan

function PlanCard({ b }: { b: SchoolBilling }) {
  const p = b.plan;
  const enabled = new Set(b.features.filter((f) => f.enabled).map((f) => f.key));
  if (!p)
    return (
      <Section title="Your plan">
        <p className="text-[13.5px] text-muted-foreground">Your school isn’t on a plan yet, so every module is available. We’ll be in touch about choosing one.</p>
      </Section>
    );
  const inPlan = (k: string) => p.features.length === 0 || p.features.includes(k);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:p-6">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Your plan</p>
          <h3 className="mt-1 font-display text-[24px] font-semibold tracking-tight">{p.name}</h3>
          {p.description && <p className="mt-1 text-[13.5px] text-muted-foreground">{p.description}</p>}
        </div>
        <div className="sm:text-right">
          <p className="font-display text-[26px] font-semibold tracking-tight tabular">{naira(b.subscription?.unitKobo ?? p.pricePerStudentKobo)}</p>
          <p className="text-[12.5px] text-muted-foreground">per student {BILLING_PERIOD_LABELS[p.billingPeriod]}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px border-y border-border bg-border">
        <div className="bg-card px-5 py-3 sm:px-6">
          <p className="text-[12px] text-muted-foreground">AI allowance</p>
          <p className="text-[14px] font-semibold tabular">{b.usage.aiBudgetUsd != null ? `${usd(b.usage.aiBudgetUsd)} / month` : 'AI off'}</p>
        </div>
        <div className="bg-card px-5 py-3 sm:px-6">
          <p className="text-[12px] text-muted-foreground">Student limit</p>
          <p className="text-[14px] font-semibold tabular">{p.maxStudents ? formatNumber(p.maxStudents) : 'Unlimited'}</p>
        </div>
      </div>
      <ul className="grid gap-x-6 gap-y-2 p-5 text-[13px] sm:grid-cols-2 sm:p-6">
        {MODULE_FEATURE_KEYS.map((k) => {
          const included = inPlan(k);
          const on = enabled.has(k);
          return (
            <li key={k} className={cn('flex items-start gap-2', !on && 'text-muted-foreground')}>
              {on ? <Check className="mt-0.5 size-3.5 shrink-0 text-success" strokeWidth={3} /> : <Minus className="mt-0.5 size-3.5 shrink-0" />}
              <span>
                {MODULE_FEATURES[k].label}
                {on && !included && <span className="ml-1.5 text-[11.5px] text-brand">added for you</span>}
                {!on && included && <span className="ml-1.5 text-[11.5px]">paused</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function UsageCard({ b }: { b: SchoolBilling }) {
  const s = b.subscription;
  const max = b.plan?.maxStudents ?? null;
  const aiPct = b.usage.aiBudgetUsd ? (b.usage.aiSpendUsd / b.usage.aiBudgetUsd) * 100 : null;
  return (
    <Section title="Usage this month">
      <div className="space-y-4">
        <div>
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="text-muted-foreground">Active students</span>
            <span className="font-semibold tabular">
              {formatNumber(b.usage.activeStudents)}
              {max ? <span className="font-normal text-muted-foreground"> of {formatNumber(max)}</span> : null}
            </span>
          </div>
          {max ? <Meter pct={(b.usage.activeStudents / max) * 100} className="mt-1.5" label="Student limit used" /> : null}
          {s && (
            <p className="mt-1 text-[12px] text-muted-foreground">
              Billed for {formatNumber(s.billableSeats)} seats ({formatNumber(s.studentSeats)} committed, or active students if higher)
            </p>
          )}
        </div>
        <div>
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="text-muted-foreground">AI spend</span>
            <span className="font-semibold tabular">
              {usd(b.usage.aiSpendUsd)}
              {b.usage.aiBudgetUsd != null && <span className="font-normal text-muted-foreground"> of {usd(b.usage.aiBudgetUsd)}</span>}
            </span>
          </div>
          {aiPct != null && <Meter pct={aiPct} className="mt-1.5" label="AI budget used" />}
          {aiPct != null && aiPct >= 100 && <p className="mt-1 text-[12px] text-danger">AI allowance used up — AI features pause until next month.</p>}
        </div>
        <p className="text-[12px] text-muted-foreground">{formatNumber(b.usage.staff)} staff on record</p>
      </div>
    </Section>
  );
}

function SubscriptionCard({ b }: { b: SchoolBilling }) {
  const s = b.subscription;
  if (!s) return null;
  return (
    <Section title="Subscription">
      <Facts
        rows={[
          ['Status', <Badge key="s" variant={s.status === 'ACTIVE' ? 'success' : s.status === 'PAST_DUE' ? 'danger' : s.status === 'TRIALING' ? 'brand' : 'secondary'}>{SUB_STATUS_LABEL[s.status]}</Badge>],
          ['Current period', `${formatDate(s.currentPeriodStart)} – ${formatDate(s.currentPeriodEnd)}`],
          ['Each period', naira(s.periodAmountKobo)],
          ...(s.discountPct ? ([['Discount', `${s.discountPct}%`]] as [string, string][]) : []),
          ['Renews', s.cancelAtPeriodEnd ? 'Ends at period end' : 'Automatically'],
          ['Outstanding', b.outstandingKobo ? <span key="o" className="text-danger">{naira(b.outstandingKobo)}</span> : 'Nothing owed'],
        ]}
      />
    </Section>
  );
}

// ------------------------------------------------------------------ invoices & payments

function InvoicesCard({ b, onPay, paying }: { b: SchoolBilling; onPay: (i: Invoice) => void; paying?: string }) {
  return (
    <Section
      title={
        <>
          <Receipt className="size-4 text-muted-foreground" /> Invoices
        </>
      }
      description={b.onlinePayment ? 'Pay securely online with Paystack' : 'Pay by bank transfer using the invoice number as the reference'}
      flush
    >
      {b.invoices.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-muted-foreground">No invoices yet.</p>
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Invoice</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Pay</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {b.invoices.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <p className="font-mono text-[12.5px] font-medium">{i.number}</p>
                      <p className="max-w-[300px] truncate text-[12px] text-muted-foreground" title={i.description}>
                        {i.description}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(i.issuedAt)}</TableCell>
                    <TableCell className={cn('whitespace-nowrap', i.overdue && i.status === 'OPEN' ? 'font-medium text-danger' : 'text-muted-foreground')}>{formatDate(i.dueDate)}</TableCell>
                    <TableCell className="text-right tabular">{naira(i.amountKobo)}</TableCell>
                    <TableCell className="text-right tabular font-medium">{i.status === 'OPEN' ? naira(i.balanceKobo) : '—'}</TableCell>
                    <TableCell>
                      <PlatformInvoiceBadge invoice={i} />
                    </TableCell>
                    <TableCell className="text-right">
                      {i.status === 'OPEN' && (
                        <Button size="sm" variant={i.overdue ? 'default' : 'outline'} onClick={() => onPay(i)} loading={paying === i.id}>
                          {b.onlinePayment ? (
                            <>
                              {paying !== i.id && <CreditCard />} Pay now
                            </>
                          ) : (
                            <>
                              <Building2 /> Pay by transfer
                            </>
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="divide-y divide-border md:hidden">
            {b.invoices.map((i) => (
              <li key={i.id} className="px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[13px] font-medium">{i.number}</p>
                    <p className="truncate text-[12px] text-muted-foreground">
                      {naira(i.amountKobo)} · due {formatDate(i.dueDate)}
                    </p>
                  </div>
                  <PlatformInvoiceBadge invoice={i} />
                </div>
                {i.status === 'OPEN' && (
                  <Button size="sm" className="mt-2.5 w-full" variant={i.overdue ? 'default' : 'outline'} onClick={() => onPay(i)} loading={paying === i.id}>
                    {b.onlinePayment ? `Pay ${naira(i.balanceKobo)} now` : 'Pay by transfer'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

function PaymentsCard({ b }: { b: SchoolBilling }) {
  if (b.payments.length === 0) return null;
  return (
    <Section
      title={
        <>
          <CreditCard className="size-4 text-muted-foreground" /> Payments
        </>
      }
      flush
    >
      <ul className="divide-y divide-border">
        {b.payments.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-[13px]">
            <span className="w-28 shrink-0 text-muted-foreground">{formatDate(p.paidAt ?? p.createdAt)}</span>
            <span className="min-w-0 flex-1">
              <span className="font-medium tabular">{naira(p.amountKobo)}</span>
              <span className="text-muted-foreground">
                {' '}
                · {PAYMENT_METHOD_LABEL[p.method]} · {p.invoice.number}
              </span>
            </span>
            <span className="hidden font-mono text-[11.5px] text-muted-foreground sm:inline">{p.reference}</span>
            <PaymentStatusPill status={p.status} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function TransferDialog({ invoice, bankDetails, onOpenChange }: { invoice: Invoice | null; bankDetails: string | null; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={!!invoice} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <div className="mb-2 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
            <Building2 className="size-5" />
          </div>
          <DialogTitle>Pay {invoice ? naira(invoice.balanceKobo) : ''} by bank transfer</DialogTitle>
          <DialogDescription>Online payment isn’t available yet. Transfer to the account below and we’ll mark the invoice paid once it arrives.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {bankDetails ? (
            <div className="rounded-xl border border-border bg-muted/40 p-3.5">
              <pre className="whitespace-pre-wrap font-sans text-[13.5px] leading-relaxed">{bankDetails}</pre>
              <div className="mt-2 flex justify-end">
                <CopyButton text={bankDetails} label="bank details" />
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-border bg-muted/40 p-3.5 text-[13px] text-muted-foreground">Contact AI School OS support for our bank details.</p>
          )}
          {invoice && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand-soft/30 px-3.5 py-2.5">
              <div>
                <p className="text-[12px] text-muted-foreground">Use this as the transfer reference</p>
                <p className="font-mono text-[15px] font-semibold">{invoice.number}</p>
              </div>
              <CopyButton text={invoice.number} label="invoice number" />
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
