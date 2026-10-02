import {
  PLATFORM_PAYMENT_METHODS,
  platformInvoiceSchema,
  recordPlatformPaymentSchema,
  SUBSCRIPTION_STATUSES,
  subscriptionUpdateSchema,
  type PlatformInvoiceRow,
  type SubscriptionRow,
  type SubscriptionStatusKey,
} from '@aischool/shared';
import { Ban, Banknote, FilePlus2, Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { FormDialog, SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { todayIso, toDateInput } from '@/lib/format';
import { koboToInput, MoneyInput, parseNaira } from '../finance/ui';
import { apiFieldErrors, dateInput, FormError, zodErrors } from '../operations/ui';
import { naira, useCreateInvoice, usePlans, useRecordPayment, useSchools, useUpdateSubscription, useVoidInvoice } from './api';
import { PAYMENT_METHOD_LABEL, SUB_STATUS_LABEL } from './ui';

const toKobo = (v: string) => {
  const n = parseNaira(v);
  return n == null ? null : Math.round(n * 100);
};

// ------------------------------------------------------------------ subscription

export function EditSubscriptionDialog({ sub, onOpenChange }: { sub: SubscriptionRow | null; onOpenChange: (o: boolean) => void }) {
  const plans = usePlans(!!sub);
  const save = useUpdateSubscription();
  const [v, setV] = useState({
    planId: '',
    status: 'ACTIVE' as SubscriptionStatusKey,
    seats: '0',
    price: '',
    discount: '0',
    start: '',
    end: '',
    cancel: false,
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!sub) return;
    setErrors({});
    setV({
      planId: sub.plan.id,
      status: sub.status,
      seats: String(sub.studentSeats),
      price: sub.priceOverrideKobo == null ? '' : koboToInput(sub.priceOverrideKobo),
      discount: String(sub.discountPct),
      start: toDateInput(sub.currentPeriodStart),
      end: toDateInput(sub.currentPeriodEnd),
      cancel: sub.cancelAtPeriodEnd,
      notes: sub.notes ?? '',
    });
  }, [sub]);
  const plan = plans.data?.find((p) => p.id === v.planId);

  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    if (!sub) return;
    const parsed = subscriptionUpdateSchema.safeParse({
      planId: v.planId,
      status: v.status,
      studentSeats: Number(v.seats),
      priceOverrideKobo: v.price.trim() ? toKobo(v.price) : null,
      discountPct: Number(v.discount),
      currentPeriodStart: v.start,
      currentPeriodEnd: v.end,
      cancelAtPeriodEnd: v.cancel,
      notes: v.notes,
    });
    if (!parsed.success) return setErrors(zodErrors(parsed.error.issues));
    if (parsed.data.currentPeriodEnd <= parsed.data.currentPeriodStart) return setErrors({ currentPeriodEnd: 'The period must end after it starts' });
    save.mutate(
      { id: sub.id, body: parsed.data },
      {
        onSuccess: () => {
          toast.success(`${sub.tenant.name}’s subscription saved`);
          onOpenChange(false);
        },
        onError: (err) => setErrors(apiFieldErrors(err)),
      },
    );
  };

  return (
    <FormDialog
      open={!!sub}
      onOpenChange={onOpenChange}
      title={`Edit subscription · ${sub?.tenant.name ?? ''}`}
      description="Changes apply to the next invoice. The school’s plan follows its subscription."
      icon={<Pencil />}
      submitLabel="Save subscription"
      pending={save.isPending}
      onSubmit={submit}
      size="lg"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Plan" htmlFor="sub-plan" error={errors.planId}>
          <Select value={v.planId} onValueChange={(planId) => setV((p) => ({ ...p, planId }))}>
            <SelectTrigger id="sub-plan">
              <SelectValue placeholder="Choose a plan" />
            </SelectTrigger>
            <SelectContent>
              {(plans.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} · {naira(p.pricePerStudentKobo)}
                  {p.isActive ? '' : ' (retired)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Status" htmlFor="sub-status" error={errors.status}>
          <Select value={v.status} onValueChange={(s) => setV((p) => ({ ...p, status: s as SubscriptionStatusKey }))}>
            <SelectTrigger id="sub-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUBSCRIPTION_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {SUB_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Committed seats" htmlFor="sub-seats" error={errors.studentSeats} hint={sub ? `${sub.activeStudents.toLocaleString()} active students now; the larger is billed.` : undefined}>
          <Input id="sub-seats" inputMode="numeric" className="tabular" value={v.seats} onChange={(e) => setV((p) => ({ ...p, seats: e.target.value.replace(/\D/g, '') }))} invalid={!!errors.studentSeats} />
        </Field>
        <Field label="Price per student" htmlFor="sub-price" error={errors.priceOverrideKobo} optional hint={plan ? `Blank uses the plan price (${naira(plan.pricePerStudentKobo)}).` : 'Blank uses the plan price.'}>
          <MoneyInput id="sub-price" currency="NGN" value={v.price} onChange={(price) => setV((p) => ({ ...p, price }))} invalid={!!errors.priceOverrideKobo} />
        </Field>
        <Field label="Discount %" htmlFor="sub-disc" error={errors.discountPct}>
          <Input id="sub-disc" inputMode="numeric" className="tabular" value={v.discount} onChange={(e) => setV((p) => ({ ...p, discount: e.target.value.replace(/\D/g, '').slice(0, 3) }))} invalid={!!errors.discountPct} />
        </Field>
        <div className="hidden sm:block" />
        <Field label="Period starts" htmlFor="sub-start" error={errors.currentPeriodStart}>
          <Input id="sub-start" type="date" className={dateInput} value={v.start} onChange={(e) => setV((p) => ({ ...p, start: e.target.value }))} />
        </Field>
        <Field label="Period ends" htmlFor="sub-end" error={errors.currentPeriodEnd}>
          <Input id="sub-end" type="date" className={dateInput} value={v.end} onChange={(e) => setV((p) => ({ ...p, end: e.target.value }))} />
        </Field>
        <div className="sm:col-span-2">
          <SwitchRow label="Cancel at period end" description="The subscription ends instead of renewing.">
            <Switch checked={v.cancel} onCheckedChange={(cancel) => setV((p) => ({ ...p, cancel }))} />
          </SwitchRow>
        </div>
        <Field label="Internal notes" htmlFor="sub-notes" optional className="sm:col-span-2">
          <Textarea id="sub-notes" rows={2} value={v.notes} onChange={(e) => setV((p) => ({ ...p, notes: e.target.value }))} maxLength={1000} />
        </Field>
      </div>
      <div className="mt-4">
        <FormError message={errors.form} />
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ record payment

export function RecordPaymentDialog({ invoice, onOpenChange }: { invoice: PlatformInvoiceRow | null; onOpenChange: (o: boolean) => void }) {
  const record = useRecordPayment();
  const [v, setV] = useState({ amount: '', method: 'BANK_TRANSFER' as 'BANK_TRANSFER' | 'CASH' | 'OTHER', reference: '', paidOn: todayIso(), note: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!invoice) return;
    setErrors({});
    setV({ amount: koboToInput(invoice.balanceKobo), method: 'BANK_TRANSFER', reference: '', paidOn: todayIso(), note: '' });
  }, [invoice]);

  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    if (!invoice) return;
    const parsed = recordPlatformPaymentSchema.safeParse({ amountKobo: toKobo(v.amount), method: v.method, reference: v.reference, paidOn: v.paidOn, note: v.note });
    if (!parsed.success) return setErrors(zodErrors(parsed.error.issues));
    if (parsed.data.amountKobo > invoice.balanceKobo) return setErrors({ amountKobo: `More than the ${naira(invoice.balanceKobo)} balance` });
    record.mutate(
      { invoiceId: invoice.id, body: { ...parsed.data, method: parsed.data.method as 'BANK_TRANSFER' | 'CASH' | 'OTHER' } },
      {
        onSuccess: () => {
          toast.success(`Payment recorded on ${invoice.number}`, { description: `${naira(parsed.data.amountKobo)} from ${invoice.tenant.name}` });
          onOpenChange(false);
        },
        onError: (err) => setErrors(apiFieldErrors(err)),
      },
    );
  };

  return (
    <FormDialog
      open={!!invoice}
      onOpenChange={onOpenChange}
      title="Record a payment"
      description={invoice ? `${invoice.number} · ${invoice.tenant.name} · ${naira(invoice.balanceKobo)} outstanding` : undefined}
      icon={<Banknote />}
      submitLabel="Record payment"
      pending={record.isPending}
      onSubmit={submit}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount" htmlFor="rp-amount" error={errors.amountKobo} className="sm:col-span-2">
          <MoneyInput id="rp-amount" currency="NGN" size="lg" value={v.amount} onChange={(amount) => setV((p) => ({ ...p, amount }))} invalid={!!errors.amountKobo} />
        </Field>
        <Field label="Method" htmlFor="rp-method" error={errors.method}>
          <Select value={v.method} onValueChange={(m) => setV((p) => ({ ...p, method: m as typeof v.method }))}>
            <SelectTrigger id="rp-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLATFORM_PAYMENT_METHODS.filter((m) => m !== 'PAYSTACK').map((m) => (
                <SelectItem key={m} value={m}>
                  {PAYMENT_METHOD_LABEL[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Paid on" htmlFor="rp-date" error={errors.paidOn}>
          <Input id="rp-date" type="date" className={dateInput} max={todayIso()} value={v.paidOn} onChange={(e) => setV((p) => ({ ...p, paidOn: e.target.value }))} />
        </Field>
        <Field label="Reference" htmlFor="rp-ref" error={errors.reference} hint="Bank transfer reference or receipt number" className="sm:col-span-2">
          <Input id="rp-ref" className="font-mono" value={v.reference} onChange={(e) => setV((p) => ({ ...p, reference: e.target.value }))} invalid={!!errors.reference} />
        </Field>
        <Field label="Note" htmlFor="rp-note" optional className="sm:col-span-2">
          <Input id="rp-note" value={v.note} onChange={(e) => setV((p) => ({ ...p, note: e.target.value }))} maxLength={300} />
        </Field>
      </div>
      <div className="mt-4">
        <FormError message={errors.form} />
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ void

export function VoidInvoiceDialog({ invoice, onOpenChange }: { invoice: PlatformInvoiceRow | null; onOpenChange: (o: boolean) => void }) {
  const voidIt = useVoidInvoice();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (invoice) {
      setReason('');
      setError(undefined);
    }
  }, [invoice]);
  return (
    <Dialog open={!!invoice} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <div className="mb-2 grid size-10 place-items-center rounded-xl bg-danger-soft text-danger">
            <Ban className="size-5" />
          </div>
          <DialogTitle>Void {invoice?.number}?</DialogTitle>
          <DialogDescription>
            {invoice ? `${invoice.tenant.name} will no longer owe ${naira(invoice.balanceKobo)} on this invoice. This can’t be undone.` : null}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label="Reason" htmlFor="void-reason" error={error}>
            <Textarea
              id="void-reason"
              rows={2}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError(undefined);
              }}
              placeholder="e.g. Raised in error — replaced by INV-0051"
              maxLength={300}
              invalid={!!error}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={voidIt.isPending}
            onClick={() => {
              if (!invoice) return;
              if (reason.trim().length < 3) return setError('Give a short reason');
              voidIt.mutate(
                { id: invoice.id, reason: reason.trim() },
                {
                  onSuccess: () => {
                    toast.success(`${invoice.number} voided`);
                    onOpenChange(false);
                  },
                },
              );
            }}
          >
            Void invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ manual invoice

export function CreateInvoiceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const schools = useSchools();
  const create = useCreateInvoice();
  const due = () => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  };
  const [v, setV] = useState({ tenantId: '', description: '', amount: '', dueDate: due(), notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setErrors({});
      setV({ tenantId: '', description: '', amount: '', dueDate: due(), notes: '' });
    }
  }, [open]);

  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    const parsed = platformInvoiceSchema.safeParse({ tenantId: v.tenantId, description: v.description, amountKobo: toKobo(v.amount), dueDate: v.dueDate, notes: v.notes });
    if (!parsed.success) {
      const z = zodErrors(parsed.error.issues);
      return setErrors({ ...z, tenantId: z.tenantId ? 'Choose a school' : '' });
    }
    create.mutate(parsed.data, {
      onSuccess: (r) => {
        toast.success(`Invoice ${r.number} raised`);
        onOpenChange(false);
      },
      onError: (err) => setErrors(apiFieldErrors(err)),
    });
  };

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Raise a manual invoice" description="For one-off charges: onboarding, training, data migration." icon={<FilePlus2 />} submitLabel="Raise invoice" pending={create.isPending} onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="School" htmlFor="ci-school" error={errors.tenantId || undefined} className="sm:col-span-2">
          <Select value={v.tenantId} onValueChange={(tenantId) => setV((p) => ({ ...p, tenantId }))}>
            <SelectTrigger id="ci-school" invalid={!!errors.tenantId}>
              <SelectValue placeholder="Choose a school" />
            </SelectTrigger>
            <SelectContent>
              {(schools.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Description" htmlFor="ci-desc" error={errors.description} className="sm:col-span-2">
          <Input id="ci-desc" value={v.description} onChange={(e) => setV((p) => ({ ...p, description: e.target.value }))} placeholder="Onboarding and staff training (2 days)" invalid={!!errors.description} />
        </Field>
        <Field label="Amount" htmlFor="ci-amount" error={errors.amountKobo}>
          <MoneyInput id="ci-amount" currency="NGN" value={v.amount} onChange={(amount) => setV((p) => ({ ...p, amount }))} invalid={!!errors.amountKobo} />
        </Field>
        <Field label="Due" htmlFor="ci-due" error={errors.dueDate}>
          <Input id="ci-due" type="date" className={dateInput} value={v.dueDate} onChange={(e) => setV((p) => ({ ...p, dueDate: e.target.value }))} />
        </Field>
        <Field label="Notes" htmlFor="ci-notes" optional className="sm:col-span-2" hint="Shown on the invoice">
          <Textarea id="ci-notes" rows={2} value={v.notes} onChange={(e) => setV((p) => ({ ...p, notes: e.target.value }))} maxLength={500} />
        </Field>
      </div>
      <div className="mt-4">
        <FormError message={errors.form} />
      </div>
    </FormDialog>
  );
}
