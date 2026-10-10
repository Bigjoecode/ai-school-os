import {
  BILLING_CYCLE_LABELS,
  priceQuote,
  type PlanChangeResult,
  type SubscriptionCheckoutOptions,
  type SubscriptionCheckoutResult,
} from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, CreditCard, Info, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, inputClass } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api, errorMessage } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';
import { queryClient } from '@/lib/query-client';
import { cn } from '@/lib/utils';
import { naira } from '../platform/api';
import { BILLING_STATUS_KEY } from './billing-banner';

export const OPTIONS_KEY = ['billing', 'options'] as const;

/**
 * Choosing a plan and paying (trial, or a lapsed school), or changing plan
 * once paid. Prices come from the platform's plans and rules; the server
 * recomputes everything, this only shows the same sums up front.
 */
export function SubscriptionPanel({ onTransfer }: { onTransfer: (invoiceId: string) => void }) {
  const q = useQuery({ queryKey: OPTIONS_KEY, queryFn: ({ signal }) => api.get<SubscriptionCheckoutOptions>('/billing/options', undefined, signal) });
  const o = q.data;
  if (q.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (!o || !o.status.enforced) return null;
  return o.paying && o.status.state === 'OK' ? <ChangePlan o={o} /> : <Checkout o={o} onTransfer={onTransfer} />;
}

function refresh() {
  void queryClient.invalidateQueries({ queryKey: ['billing'] });
  void queryClient.invalidateQueries({ queryKey: BILLING_STATUS_KEY });
}

function Checkout({ o, onTransfer }: { o: SubscriptionCheckoutOptions; onTransfer: (invoiceId: string) => void }) {
  const [planId, setPlanId] = useState(o.currentPlanId ?? o.plans[0]?.id ?? '');
  const [cycle, setCycle] = useState(o.cycle);
  const [students, setStudents] = useState(Math.max(o.activeStudents, o.estimatedStudents));
  useEffect(() => setStudents((s) => Math.max(s, o.activeStudents)), [o.activeStudents]);
  const plan = o.plans.find((p) => p.id === planId);
  const counted = Math.max(students, o.activeStudents);
  const quote = plan ? priceQuote(plan, counted, cycle, o.rules, o.discountPct) : null;
  const tooMany = plan?.maxStudents != null && counted > plan.maxStudents;

  const pay = useMutation({
    mutationFn: () => {
      const own = useAuthStore.getState().me?.user.email ?? '';
      const email = /\.(demo|test|local|example|invalid)$/i.test(own) ? window.prompt('Email address for the Paystack receipt:', '')?.trim() : null;
      if (email === undefined) return Promise.reject(new Error('Payment cancelled'));
      return api.post<SubscriptionCheckoutResult>('/billing/checkout', { planId, cycle, students: counted, ...(email ? { email } : {}) });
    },
    onSuccess: (r) => {
      refresh();
      if (r.authorizationUrl) window.location.href = r.authorizationUrl;
      else {
        toast.success(`Invoice ${r.number} issued`);
        onTransfer(r.invoiceId);
      }
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const st = o.status;
  const heading = st.state === 'TRIAL' ? 'Choose your plan' : st.state === 'READ_ONLY' ? 'Pay to unlock your school' : 'Pay to keep your school running';
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="size-4 text-brand" />
          <h3 className="font-display text-[18px] font-semibold tracking-tight">{heading}</h3>
          {st.state === 'TRIAL' && st.trialEndsAt && <Badge variant="brand">Trial ends {formatDate(st.trialEndsAt)}</Badge>}
          {st.state === 'GRACE' && st.readOnlyAt && <Badge variant="warning">Read-only from {formatDate(st.readOnlyAt)}</Badge>}
          {st.state === 'READ_ONLY' && <Badge variant="danger">Read-only</Badge>}
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">Paying starts your paid period today. You can pay by card, bank transfer or USSD through Paystack.</p>
      </div>
      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Plan">
            {o.plans.map((p) => {
              const unit = priceQuote(p, 0, 'TERM', { minBilledStudents: 0, sessionDiscountPct: 0 }).unitKobo;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={planId === p.id}
                  onClick={() => setPlanId(p.id)}
                  className={cn('rounded-xl border p-3 text-left transition-colors', planId === p.id ? 'border-brand bg-brand-soft/40 ring-1 ring-brand/40' : 'border-border hover:bg-muted/50')}
                >
                  <p className="text-[14px] font-semibold">{p.name}</p>
                  <p className="text-[12.5px] text-muted-foreground tabular">{naira(unit)} / student / term</p>
                </button>
              );
            })}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Pay for" htmlFor="cycle">
              <select id="cycle" className={inputClass} value={cycle} onChange={(e) => setCycle(e.target.value as typeof cycle)}>
                {(['TERM', 'SESSION'] as const).map((c) => (
                  <option key={c} value={c}>
                    {BILLING_CYCLE_LABELS[c]}
                    {c === 'SESSION' && o.rules.sessionDiscountPct ? ` (${o.rules.sessionDiscountPct}% off)` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Students this term" htmlFor="students" hint={`You have ${o.activeStudents} active students; we bill whichever is higher (minimum ${o.rules.minBilledStudents}).`}>
              <Input id="students" type="number" inputMode="numeric" min={o.activeStudents} value={students} onChange={(e) => setStudents(Math.max(0, Number(e.target.value) || 0))} />
            </Field>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          {quote && plan ? (
            <>
              <dl className="space-y-1.5 text-[13px]">
                <Row label="Students billed" value={quote.billedStudents.toLocaleString('en-NG')} />
                <Row label="Price per student per term" value={naira(quote.unitKobo)} />
                {quote.terms > 1 && <Row label="Terms" value="3" />}
                <Row label="Subtotal" value={naira(quote.grossKobo)} />
                {quote.discountKobo > 0 && <Row label={`Discount (${quote.discountPct}%)`} value={`−${naira(quote.discountKobo)}`} />}
              </dl>
              <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
                <span className="text-[13px] font-medium">Total</span>
                <span className="font-display text-[24px] font-semibold tabular tracking-tight">{naira(quote.totalKobo)}</span>
              </div>
              {tooMany ? (
                <p className="mt-3 text-[12.5px] text-danger">The {plan.name} plan is for up to {plan.maxStudents} students: choose a larger plan.</p>
              ) : (
                <Button className="mt-4 w-full" onClick={() => pay.mutate()} loading={pay.isPending} disabled={!planId}>
                  {o.onlinePayment ? (
                    <>
                      <CreditCard /> Pay {naira(quote.totalKobo)}
                    </>
                  ) : (
                    <>
                      Get the invoice <ArrowRight />
                    </>
                  )}
                </Button>
              )}
              {o.openInvoiceId && <p className="mt-2 text-[12px] text-muted-foreground">This replaces your unpaid invoice from an earlier choice.</p>}
            </>
          ) : (
            <p className="text-[13px] text-muted-foreground">Choose a plan.</p>
          )}
        </div>
      </div>
      <Rules o={o} />
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}

function Rules({ o }: { o: SubscriptionCheckoutOptions }) {
  return (
    <p className="flex items-start gap-2 border-t border-border px-5 py-3 text-[12px] text-muted-foreground sm:px-6">
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <span>
        Each invoice counts active students on its date (minimum {o.rules.minBilledStudents}); students added mid-term are not charged until the next invoice. Upgrades start at once with a top-up for the days left;
        downgrades start next period. Late payment: {o.rules.graceDays} days’ grace, then read-only until paid. Nothing is ever deleted for billing.
      </span>
    </p>
  );
}

function ChangePlan({ o }: { o: SubscriptionCheckoutOptions }) {
  const [planId, setPlanId] = useState(o.currentPlanId ?? '');
  const change = useMutation({
    mutationFn: () => api.post<PlanChangeResult>('/billing/plan', { planId }),
    onSuccess: (r) => {
      refresh();
      toast.success(r.effective === 'NEXT_PERIOD' ? 'Your plan changes at the start of your next period' : r.amountKobo ? `Upgraded. A top-up invoice of ${naira(r.amountKobo)} has been issued.` : 'Plan changed');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const current = o.plans.find((p) => p.id === o.currentPlanId);
  return (
    <Card className="p-5 sm:p-6">
      <h3 className="font-display text-[16px] font-semibold tracking-tight">Change plan</h3>
      <p className="mt-1 text-[13px] text-muted-foreground">
        You’re on {current?.name ?? 'your plan'}, paid {o.cycle === 'SESSION' ? 'per session' : 'per term'}.{o.pendingPlan ? ` Moving to ${o.pendingPlan} from your next period.` : ''}
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Plan" htmlFor="change-plan" className="flex-1">
          <select id="change-plan" className={inputClass} value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {o.plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}: {naira(priceQuote(p, 0, 'TERM', { minBilledStudents: 0, sessionDiscountPct: 0 }).unitKobo)} per student per term
              </option>
            ))}
          </select>
        </Field>
        <Button variant="outline" onClick={() => change.mutate()} loading={change.isPending} disabled={!planId || (planId === o.currentPlanId && !o.pendingPlan)}>
          {planId === o.currentPlanId && o.pendingPlan ? 'Keep this plan' : 'Change plan'}
        </Button>
      </div>
      <Rules o={o} />
    </Card>
  );
}
