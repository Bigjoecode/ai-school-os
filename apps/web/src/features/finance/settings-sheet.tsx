import { DEFAULT_FINANCE_SETTINGS, paystackSettingsSchema } from '@aischool/shared';
import { ExternalLink, Globe, KeyRound, Link2, Lock, Plug, Unplug } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { useConnectPaystack, useDisconnectPaystack, useFinanceSettings, usePaystack, useSaveFinanceSettings } from './api';
import { CopyButton } from './ui';

export function FinanceSettingsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const settings = useFinanceSettings(open);
  const save = useSaveFinanceSettings();
  const [invoicePrefix, setInvoicePrefix] = useState(DEFAULT_FINANCE_SETTINGS.invoicePrefix);
  const [receiptPrefix, setReceiptPrefix] = useState(DEFAULT_FINANCE_SETTINGS.receiptPrefix);
  const [dueDays, setDueDays] = useState(String(DEFAULT_FINANCE_SETTINGS.defaultDueDays));
  const [bank, setBank] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !settings.data) return;
    setInvoicePrefix(settings.data.invoicePrefix);
    setReceiptPrefix(settings.data.receiptPrefix);
    setDueDays(String(settings.data.defaultDueDays));
    setBank(settings.data.bankDetails ?? '');
    setErrors({});
  }, [open, settings.data]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    const prefix = /^[A-Z0-9]{2,8}$/;
    if (!prefix.test(invoicePrefix)) next.invoicePrefix = '2–8 letters or digits';
    if (!prefix.test(receiptPrefix)) next.receiptPrefix = '2–8 letters or digits';
    const days = Number(dueDays);
    if (!Number.isInteger(days) || days < 0 || days > 120) next.defaultDueDays = '0–120 days';
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate(
      { invoicePrefix, receiptPrefix, defaultDueDays: days, bankDetails: bank.trim() || null },
      {
        onError: (err) => {
          if (err instanceof ApiError && err.errors.length) setErrors(Object.fromEntries(err.errors.map((x) => [x.path, x.message])));
        },
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="font-display text-lg font-semibold tracking-tight">Finance settings</SheetTitle>
          <SheetDescription className="text-[13px] text-muted-foreground">Numbering, due dates, bank details and online payments.</SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-8">
          {!settings.data ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <form id="finance-settings" onSubmit={submit} className="grid gap-4" noValidate>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Invoice prefix" htmlFor="fs-inv" error={errors.invoicePrefix} hint={`${invoicePrefix || 'INV'}/2026/00042`}>
                  <Input id="fs-inv" value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))} invalid={!!errors.invoicePrefix} className="font-mono" />
                </Field>
                <Field label="Receipt prefix" htmlFor="fs-rct" error={errors.receiptPrefix} hint={`${receiptPrefix || 'RCT'}/2026/00108`}>
                  <Input id="fs-rct" value={receiptPrefix} onChange={(e) => setReceiptPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))} invalid={!!errors.receiptPrefix} className="font-mono" />
                </Field>
                <Field label="Due after (days)" htmlFor="fs-due" error={errors.defaultDueDays}>
                  <Input id="fs-due" inputMode="numeric" value={dueDays} onChange={(e) => setDueDays(e.target.value.replace(/\D/g, '').slice(0, 3))} invalid={!!errors.defaultDueDays} className="tabular" />
                </Field>
              </div>
              <Field label="Bank details" htmlFor="fs-bank" optional hint="Printed on every invoice for parents who pay by transfer." error={errors.bankDetails}>
                <Textarea id="fs-bank" rows={4} value={bank} onChange={(e) => setBank(e.target.value)} maxLength={500} placeholder={'Bank: GTBank\nAccount name: Greenfield Schools Ltd\nAccount number: 0123456789'} />
              </Field>
            </form>
          )}

          <PaystackCard enabled={open} />
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="submit" form="finance-settings" loading={save.isPending} disabled={!settings.data}>
            Save settings
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function PaystackCard({ enabled }: { enabled: boolean }) {
  const canConnect = useCan('school.manage');
  const status = usePaystack(enabled);
  const connect = useConnectPaystack();
  const disconnect = useDisconnectPaystack();
  const [publicKey, setPublicKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmOff, setConfirmOff] = useState(false);
  const [replacing, setReplacing] = useState(false);

  const s = status.data;
  const webhook = s ? `${window.location.origin}${s.webhookPath.startsWith('/api') ? '' : '/api'}${s.webhookPath}` : '';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = paystackSettingsSchema.safeParse({ publicKey, secretKey });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    const pkLive = publicKey.startsWith('pk_live_');
    const skLive = secretKey.startsWith('sk_live_');
    if (pkLive !== skLive) {
      setErrors({ secretKey: 'Use a matching pair — both test or both live keys' });
      return;
    }
    setErrors({});
    connect.mutate(parsed.data, {
      onSuccess: () => {
        setPublicKey('');
        setSecretKey('');
        setReplacing(false);
      },
      onError: (err) => setErrors({ secretKey: err instanceof ApiError && err.status === 400 ? err.message : err.message || 'Paystack rejected these keys' }),
    });
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-border" aria-labelledby="paystack-title">
      <div className="flex items-start gap-3 border-b border-border bg-muted/30 px-5 py-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#0ba4db]/10 text-[#0ba4db]">
          <Globe className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="paystack-title" className="flex flex-wrap items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
            Online payments · Paystack
            {s?.connected ? (
              <Badge variant={s.isLive ? 'success' : 'warning'} dot>
                {s.isLive ? 'Live' : 'Test mode'}
              </Badge>
            ) : s ? (
              <Badge variant="outline">Not connected</Badge>
            ) : null}
          </h3>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">Parents pay by card, bank transfer or USSD from the link on their invoice. Money settles straight into your Paystack account.</p>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {!s ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            {s.connected && (
              <dl className="grid gap-2 rounded-xl border border-border bg-card p-3.5 text-[12.5px]">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Public key</dt>
                  <dd className="truncate font-mono">{s.publicKey}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Secret key</dt>
                  <dd className="flex items-center gap-1.5 font-mono">
                    <Lock className="size-3 text-muted-foreground" aria-hidden /> {s.secretHint ?? '••••'}
                  </dd>
                </div>
              </dl>
            )}

            <div className="grid gap-1.5">
              <p className="flex items-center gap-1.5 text-[13px] font-medium">
                <Link2 className="size-3.5 text-muted-foreground" aria-hidden /> Webhook URL
              </p>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 py-1 pl-3 pr-1">
                <code className="min-w-0 flex-1 truncate text-[12px]">{webhook}</code>
                <CopyButton text={webhook} label="webhook URL" />
              </div>
              <p className="text-[12px] text-muted-foreground">Paste this into Paystack so payments are confirmed even if a parent closes the page early.</p>
            </div>

            {!canConnect ? (
              <p className="rounded-xl border border-dashed border-border p-3 text-[12.5px] text-muted-foreground">A school admin (School settings permission) connects or changes the Paystack keys.</p>
            ) : s.connected && !replacing ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setReplacing(true)}>
                  <KeyRound /> Replace keys
                </Button>
                <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setConfirmOff(true)}>
                  <Unplug /> Disconnect
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="grid gap-3" noValidate>
                <p className="flex items-start gap-1.5 text-[12.5px] text-muted-foreground">
                  <ExternalLink className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>
                    Find your keys in{' '}
                    <a href="https://dashboard.paystack.com/#/settings/developers" target="_blank" rel="noopener noreferrer" className="font-medium text-brand hover:underline">
                      Paystack Dashboard → Settings → API Keys &amp; Webhooks
                    </a>
                    . Start with test keys, then switch to live.
                  </span>
                </p>
                <Field label="Public key" htmlFor="ps-pk" error={errors.publicKey}>
                  <Input id="ps-pk" value={publicKey} onChange={(e) => setPublicKey(e.target.value.trim())} placeholder="pk_test_…" autoComplete="off" spellCheck={false} className="font-mono text-[13px]" invalid={!!errors.publicKey} />
                </Field>
                <Field label="Secret key" htmlFor="ps-sk" error={errors.secretKey} hint="Stored encrypted. We check it with Paystack before saving.">
                  <Input id="ps-sk" type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value.trim())} placeholder="sk_test_…" autoComplete="off" spellCheck={false} className="font-mono text-[13px]" invalid={!!errors.secretKey} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" size="sm" loading={connect.isPending}>
                    {!connect.isPending && <Plug />} {s.connected ? 'Save new keys' : 'Connect Paystack'}
                  </Button>
                  {replacing && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setReplacing(false)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmOff}
        onOpenChange={setConfirmOff}
        title="Disconnect Paystack?"
        description="Payment links on invoices stop working until you connect again. Payments already made are not affected."
        confirmLabel="Disconnect"
        loading={disconnect.isPending}
        onConfirm={() => disconnect.mutate(undefined, { onSuccess: () => setConfirmOff(false) })}
      />
    </section>
  );
}
