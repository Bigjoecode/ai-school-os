import { Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Textarea } from '@/components/ui/textarea';
import { koboToInput, MoneyInput, parseNaira } from '../finance/ui';
import { apiFieldErrors, FormError } from '../operations/ui';
import { naira } from './api';
import { useRefundOrder, useRefundPayment } from './commerce-api';

export interface RefundTarget {
  kind: 'order' | 'payment';
  id: string;
  /** Shown in the title: a reference or invoice number. */
  label: string;
  who: string;
  amountKobo: number;
  refundedKobo: number;
}

/** Refund part or all of a parent order or a school payment through Paystack. */
export function RefundDialog({ target, onOpenChange }: { target: RefundTarget | null; onOpenChange: (o: boolean) => void }) {
  const order = useRefundOrder();
  const payment = useRefundPayment();
  const m = target?.kind === 'payment' ? payment : order;
  const remaining = target ? target.amountKobo - target.refundedKobo : 0;
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [revoke, setRevoke] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!target) return;
    setAmount(koboToInput(target.amountKobo - target.refundedKobo));
    setReason('');
    setRevoke(false);
    setErrors({});
  }, [target]);

  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    if (!target) return;
    const n = parseNaira(amount);
    const kobo = n == null ? 0 : Math.round(n * 100);
    const errs: Record<string, string> = {};
    if (kobo < 100) errs.amountKobo = 'Refund at least ₦1';
    else if (kobo > remaining) errs.amountKobo = `At most ${naira(remaining)} is left to refund`;
    if (reason.trim().length < 3) errs.reason = 'Say why, in a few words';
    if (Object.keys(errs).length) return setErrors(errs);
    m.mutate(
      { id: target.id, body: { amountKobo: kobo, reason: reason.trim(), revokeAccess: target.kind === 'order' && revoke } },
      {
        onSuccess: () => {
          toast.success(target.kind === 'order' ? `Refund of ${naira(kobo)} sent to Paystack` : `Refund of ${naira(kobo)} recorded`, { description: `${target.label} · ${target.who}` });
          onOpenChange(false);
        },
        onError: (err) => setErrors(apiFieldErrors(err)),
      },
    );
  };

  return (
    <FormDialog
      open={!!target}
      onOpenChange={onOpenChange}
      title={`Refund ${target?.label ?? ''}`}
      description={
        target ? (
          <>
            {target.who} paid {naira(target.amountKobo)}
            {target.refundedKobo > 0 && <>; {naira(target.refundedKobo)} already refunded</>}.{' '}
            {target.kind === 'order'
              ? 'The money goes back through Paystack to the card or account that paid, and the ledger records it.'
              : 'Send the money back to the school yourself (usually by transfer); this records the refund, reopens the invoice balance and posts it to the ledger.'}
          </>
        ) : undefined
      }
      icon={<Undo2 />}
      submitLabel={target?.kind === 'payment' ? 'Record refund' : 'Refund'}
      pending={m.isPending}
      onSubmit={submit}
    >
      <div className="grid gap-4">
        <FormError message={errors.form} />
        <Field label="Amount" htmlFor="refund-amount" error={errors.amountKobo} hint={`Up to ${naira(remaining)}`}>
          <MoneyInput id="refund-amount" currency="NGN" value={amount} onChange={setAmount} invalid={!!errors.amountKobo} />
        </Field>
        <Field label="Reason" htmlFor="refund-reason" error={errors.reason} hint="Kept in the audit log and sent to Paystack as the merchant note.">
          <Textarea id="refund-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Charged twice for the same term" />
        </Field>
        {target?.kind === 'order' && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
            <Checkbox checked={revoke} onCheckedChange={(v) => setRevoke(v === true)} className="mt-0.5" />
            <span>
              <span className="block text-[13.5px] font-medium">Also end the access this payment bought</span>
              <span className="block text-[12px] text-muted-foreground">Cancels the subscription and removes the children’s AI or exam access now. Leave unticked for a goodwill partial refund.</span>
            </span>
          </label>
        )}
      </div>
    </FormDialog>
  );
}
