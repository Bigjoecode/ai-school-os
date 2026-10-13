import type { AddonOrderRow, AddonRow, SchoolPricing, SetupFeeStatus, SmsAllowance } from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, GraduationCap, MessageSquareText, Package, Percent } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { queryClient } from '@/lib/query-client';
import { cn } from '@/lib/utils';
import { allowDigitalPurchases } from '@/pwa/ios-app';
import { IosPurchaseNote } from '@/pwa/ios-purchase-note';
import { naira } from '../platform/api';
import { Meter, Section } from '../platform/ui';
import { addonPrice } from '../sales/pricing';

export const PRICING_KEY = ['billing', 'pricing'] as const;

const SETUP_LABEL: Record<SetupFeeStatus['state'], string> = { NONE: 'None', DUE: 'Due on your first invoice', INVOICED: 'Invoiced', PAID: 'Paid', WAIVED: 'Waived' };
const SETUP_REASON: Record<NonNullable<SetupFeeStatus['reason']>, string> = {
  GRANDFATHERED: 'Your school joined before the setup fee was introduced.',
  PILOT: 'Waived for pilot schools.',
  DEMO: 'Demo school.',
  PLAN: 'Your plan has no setup fee.',
  ALREADY_PAYING: 'Your school already pays a subscription.',
  WAIVED: 'Waived by AI School OS.',
};
const ORDER_STATUS: Record<AddonOrderRow['status'], { label: string; tone: 'brand' | 'success' | 'danger' | 'outline' }> = {
  REQUESTED: { label: 'Waiting for a quote', tone: 'brand' },
  INVOICED: { label: 'Invoiced', tone: 'success' },
  DECLINED: { label: 'Declined', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'outline' },
};

/** Billing page: setup fee, the SMS included this term, and add-ons (buy, or ask for a quote). */
export function PricingPanel() {
  const q = useQuery({ queryKey: PRICING_KEY, queryFn: ({ signal }) => api.get<SchoolPricing>('/billing/pricing', undefined, signal) });
  const [buy, setBuy] = useState<AddonRow | null>(null);
  const p = q.data;
  if (q.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (!p) return null;
  const shop = allowDigitalPurchases();
  return (
    <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
      <div className="space-y-5">
        <SmsCard s={p.sms} />
        {/* The iPhone app shows no prices for digital services (App Store rules): no setup fee or discount offers there. */}
        {shop && (
        <Section title={<><GraduationCap className="size-4 text-muted-foreground" /> Setup fee</>} description="One-off: onboarding and training for your staff.">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge variant={p.setupFee.state === 'DUE' || p.setupFee.state === 'INVOICED' ? 'warning' : p.setupFee.state === 'NONE' ? 'outline' : 'success'}>{SETUP_LABEL[p.setupFee.state]}</Badge>
            {p.setupFee.amountKobo > 0 && <span className="font-semibold tabular">{naira(p.setupFee.amountKobo)}</span>}
          </div>
          <p className="mt-2 text-[13px] text-muted-foreground">
            {p.setupFee.reason
              ? SETUP_REASON[p.setupFee.reason]
              : p.setupFee.trainingDays
                ? `Includes onboarding and ${p.setupFee.trainingDays} days of training${p.setupFee.planFeeKobo > p.setupFee.amountKobo ? ` (list price ${naira(p.setupFee.planFeeKobo)})` : ''}.`
                : 'Includes onboarding.'}
            {p.setupFee.note ? ` ${p.setupFee.note}` : ''}
          </p>
        </Section>
        )}
        {shop && p.sessionDiscountPct > 0 && (
          <p className="flex items-center gap-2 rounded-2xl border border-success/30 bg-success-soft px-4 py-3 text-[13px] font-medium text-success">
            <Percent className="size-4" /> {p.sessionDiscountPct}% off when you pay for 3 terms at once
          </p>
        )}
      </div>
      <Section title={<><Package className="size-4 text-muted-foreground" /> Add-ons</>} description="Extras for your school, added to your AI School OS invoice." flush>
        {!shop && <IosPurchaseNote className="m-4" title="Add-ons" />}
        <ul className="divide-y divide-border">
          {p.addons.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 px-5 py-3 sm:px-6">
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium">{a.name}</p>
                {a.description && <p className="text-[12px] text-muted-foreground">{a.description}</p>}
                {shop && <p className="mt-0.5 text-[12.5px] font-medium tabular">{addonPrice(a)}</p>}
              </div>
              {shop && (
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => setBuy(a)}>
                  {a.pricing === 'FIXED' ? 'Buy' : 'Ask for a quote'}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {p.orders.length > 0 && <Orders orders={p.orders} />}
      </Section>
      {shop && <BuyDialog addon={buy} onClose={() => setBuy(null)} />}
    </div>
  );
}

function Orders({ orders }: { orders: AddonOrderRow[] }) {
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/billing/addons/${id}/cancel`, {}),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: PRICING_KEY }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="border-t border-border px-5 py-4 sm:px-6">
      <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Your orders and requests</p>
      <ul className="mt-2 space-y-2 text-[13px]">
        {orders.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0">
              {o.addon.name}
              {o.quantity > 1 ? ` × ${o.quantity}` : ''} <span className="text-muted-foreground">· {formatDate(o.createdAt)}</span>
              {o.operatorNote && <span className="block text-[12px] text-muted-foreground">{o.operatorNote}</span>}
            </span>
            <span className="flex items-center gap-2">
              {o.amountKobo != null && <span className="tabular">{naira(o.amountKobo)}</span>}
              <Badge variant={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge>
              {o.status === 'REQUESTED' && allowDigitalPurchases() && (
                <Button size="sm" variant="ghost" onClick={() => cancel.mutate(o.id)} loading={cancel.isPending && cancel.variables === o.id}>
                  Cancel
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BuyDialog({ addon, onClose }: { addon: AddonRow | null; onClose: () => void }) {
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const order = useMutation({
    mutationFn: () => api.post<AddonOrderRow>('/billing/addons', { addonId: addon!.id, quantity, note: note || null }),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: ['billing'] });
      toast.success(r.status === 'INVOICED' ? `Invoice ${r.invoiceNumber} issued: pay it under Invoices below` : 'Request sent: we will reply with a price');
      setNote('');
      setQuantity(1);
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const fixed = addon?.pricing === 'FIXED' && !!addon.priceKobo;
  return (
    <Dialog open={!!addon} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{addon?.name}</DialogTitle>
          <DialogDescription>{fixed ? 'This is added to a new invoice straight away.' : 'Tell us what you need and we will reply with a price. Nothing is charged until you accept the invoice.'}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {(fixed || addon?.unitLabel) && (
            <Field label={`How many${addon?.unitLabel ? ` (${addon.unitLabel.replace(/^per /, '')}s)` : ''}?`} htmlFor="addon-qty">
              <Input id="addon-qty" type="number" inputMode="numeric" min={1} max={100} value={quantity} onChange={(e) => setQuantity(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} />
            </Field>
          )}
          <Field label={fixed ? 'Notes (optional)' : 'What do you need?'} htmlFor="addon-note">
            <Textarea id="addon-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {fixed && (
            <p className="flex items-baseline justify-between border-t border-border pt-3 text-[14px]">
              <span>Total</span>
              <span className="font-display text-[20px] font-semibold tabular">{naira(addon!.priceKobo! * quantity)}</span>
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => order.mutate()} loading={order.isPending} disabled={!fixed && note.trim().length < 3}>
            {fixed ? 'Add to an invoice' : 'Send request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The SMS included this term: a meter with warnings at 80% and 100%. Also used on the Messages page. */
export function SmsCard({ s, compact }: { s: SmsAllowance; compact?: boolean }) {
  if (!s.included) return null;
  const tone = s.warning === 'USED_UP' ? 'text-danger' : s.warning === 'NEAR' ? 'text-warning' : 'text-muted-foreground';
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="tabular">
          <strong className="text-[18px]">{s.used.toLocaleString('en-NG')}</strong> of {s.allowance.toLocaleString('en-NG')} SMS units used
        </span>
        <span className={cn('tabular', tone)}>{s.left.toLocaleString('en-NG')} left</span>
      </div>
      <Meter pct={s.allowance ? (s.used / s.allowance) * 100 : null} className="mt-2" label="SMS used this term" />
      <p className="mt-2 text-[12px] text-muted-foreground">
        {s.unitsPerStudent} per student × {s.billedStudents.toLocaleString('en-NG')} students, {formatDate(s.windowStart)} – {formatDate(s.windowEnd)}. Unused units don’t roll over.
        {s.line === 'OWN' && ' You send SMS through your own Termii account, which Termii bills you for directly; the included units apply to the AI School OS SMS line.'}
        {s.line === 'NONE' && ' The AI School OS SMS line is not switched on yet.'}
      </p>
      {s.warning && s.line !== 'OWN' && (
        <p className={cn('mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-[12.5px]', s.warning === 'USED_UP' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {s.warning === 'USED_UP'
            ? s.overage === 'BLOCK'
              ? 'This term’s SMS are used up: SMS on the AI School OS line are paused until next term. Email, push and in-app messages still go out.'
              : s.overage === 'BILL' && allowDigitalPurchases()
                ? `This term’s SMS are used up: extra units are billed at ${naira(s.overageKobo)} each after the term${s.overUnits ? ` (${s.overUnits.toLocaleString('en-NG')} so far, ${naira(s.overCostKobo)})` : ''}.`
                : 'This term’s SMS are used up. You can keep sending for now.'
            : `You have used ${s.pct}% of this term’s SMS.`}
        </p>
      )}
    </>
  );
  if (compact) return <div className="rounded-2xl border border-border bg-card p-4">{body}</div>;
  return (
    <Section title={<><MessageSquareText className="size-4 text-muted-foreground" /> SMS included this term</>}>
      {body}
    </Section>
  );
}

/** Messages page: the SMS included this term (only when the school's plan includes SMS). */
export function SmsAllowanceStrip() {
  const q = useQuery({ queryKey: ['billing', 'sms-allowance'], queryFn: ({ signal }) => api.get<SmsAllowance>('/billing/sms-allowance', undefined, signal), meta: { silent: true }, staleTime: 60_000 });
  if (!q.data?.included) return null;
  return <SmsCard s={q.data} compact />;
}
