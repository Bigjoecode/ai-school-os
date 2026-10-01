import { type FeeReminder, PAYMENT_METHOD_LABELS, type RecordPaymentInput } from '@aischool/shared';
import { ChevronRight, FileSearch, Info, Mail, MessageSquareText, Phone, Receipt, RotateCw, Send, UserRound } from 'lucide-react';
import { type BaseSyntheticEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchInput } from '@/components/ui/search-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { useDebounced } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { useOpenComposer } from '../comms/ui';
import { aiErrorMessage, useFeeReminder, useInvoices, useRecordPayment } from './api';
import { CopyButton, InvoiceStatusBadge, koboToInput, money, MoneyInput, parseNaira, schoolToday, useCurrency } from './ui';

// ------------------------------------------------------------------ record payment

export interface PayableInvoice {
  id: string;
  number: string;
  studentName: string;
  balanceKobo: number;
}

type ManualMethod = RecordPaymentInput['method'];
const MANUAL_METHODS: ManualMethod[] = ['CASH', 'BANK_TRANSFER', 'POS', 'CHEQUE'];

export function RecordPaymentDialog({
  open,
  onOpenChange,
  invoice,
  openReceipt = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: PayableInvoice | null;
  openReceipt?: boolean;
}) {
  const currency = useCurrency();
  const navigate = useNavigate();
  const record = useRecordPayment();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<ManualMethod>('CASH');
  const [reference, setReference] = useState('');
  const [payer, setPayer] = useState('');
  const [paidOn, setPaidOn] = useState(schoolToday());
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !invoice) return;
    setAmount(koboToInput(invoice.balanceKobo));
    setMethod('CASH');
    setReference('');
    setPayer('');
    setPaidOn(schoolToday());
    setNote('');
    setErrors({});
    record.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice?.id]);

  if (!invoice) return null;

  const naira = parseNaira(amount);
  const kobo = naira == null ? 0 : Math.round(naira * 100);
  const over = kobo > invoice.balanceKobo;

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const next: Record<string, string> = {};
    if (!kobo || kobo < 100) next.amountKobo = `Enter at least ${money(100, currency)}`;
    else if (over) next.amountKobo = `More than the balance of ${money(invoice.balanceKobo, currency)}`;
    if ((method === 'BANK_TRANSFER' || method === 'POS' || method === 'CHEQUE') && !reference.trim()) next.reference = 'Add the transfer, POS or cheque reference';
    if (paidOn > schoolToday()) next.paidOn = 'Can’t be in the future';
    setErrors(next);
    if (Object.keys(next).length) return;
    record.mutate(
      {
        invoiceId: invoice.id,
        amountKobo: kobo,
        method,
        reference: reference.trim() || undefined,
        payerName: payer.trim() || undefined,
        paidOn,
        note: note.trim() || undefined,
      },
      {
        onSuccess: (r) => {
          toast.success(`${money(r.amountKobo, r.currency)} received · receipt ${r.receiptNumber ?? ''}`);
          onOpenChange(false);
          if (openReceipt) navigate(`/fees/receipts/${r.id}`);
        },
        onError: (err) => {
          if (err instanceof ApiError && err.errors.length) {
            setErrors(Object.fromEntries(err.errors.map((x) => [x.path, x.message])));
          } else toast.error(err instanceof Error ? err.message : 'Couldn’t record the payment');
        },
      },
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record payment"
      description={
        <>
          {invoice.studentName} · <span className="font-mono">{invoice.number}</span> · balance{' '}
          <span className="font-medium text-foreground tabular">{money(invoice.balanceKobo, currency)}</span>
        </>
      }
      icon={<Receipt />}
      submitLabel={kobo > 0 && !over ? `Record ${money(kobo, currency)}` : 'Record payment'}
      pending={record.isPending}
      onSubmit={submit}
    >
      <div className="grid gap-4">
        <Field label="Amount received" htmlFor="rp-amount" error={errors.amountKobo}>
          <MoneyInput id="rp-amount" value={amount} onChange={setAmount} currency={currency} invalid={!!errors.amountKobo} size="lg" autoFocus />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {[
            ['Full balance', invoice.balanceKobo],
            ['Half', Math.round(invoice.balanceKobo / 2 / 100) * 100],
          ].map(([label, k]) => (
            <button
              key={label as string}
              type="button"
              onClick={() => setAmount(koboToInput(k as number))}
              className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            >
              {label as string} · <span className="tabular">{money(k as number, currency)}</span>
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Method" htmlFor="rp-method">
            <Select value={method} onValueChange={(v) => setMethod(v as ManualMethod)}>
              <SelectTrigger id="rp-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MANUAL_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Date received" htmlFor="rp-date" error={errors.paidOn}>
            <Input id="rp-date" type="date" value={paidOn} max={schoolToday()} onChange={(e) => setPaidOn(e.target.value)} invalid={!!errors.paidOn} className="tabular [color-scheme:light] dark:[color-scheme:dark]" />
          </Field>
        </div>
        <Field label="Reference" htmlFor="rp-ref" optional={method === 'CASH'} error={errors.reference} hint={method === 'CASH' ? undefined : 'Bank, POS slip or cheque number'}>
          <Input id="rp-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} invalid={!!errors.reference} />
        </Field>
        <Field label="Paid by" htmlFor="rp-payer" optional>
          <Input id="rp-payer" value={payer} onChange={(e) => setPayer(e.target.value)} maxLength={120} placeholder="e.g. Mrs Adaeze Okafor" />
        </Field>
        <Field label="Note" htmlFor="rp-note" optional>
          <Textarea id="rp-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ find an invoice first

export function FindInvoiceDialog({
  open,
  onOpenChange,
  onPick,
  title = 'Record a payment',
  description = 'Search by learner name, admission number or invoice number.',
  outstandingOnly = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (invoice: PayableInvoice & { rowId: string }) => void;
  title?: string;
  description?: string;
  outstandingOnly?: boolean;
}) {
  const currency = useCurrency();
  const [q, setQ] = useState('');
  const debounced = useDebounced(q.trim(), 250);
  const list = useInvoices({ q: debounced || undefined, status: outstandingOnly ? 'OUTSTANDING' : undefined, pageSize: 8, page: 1 }, open && debounced.length >= 2);

  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <div className="mb-2 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand [&_svg]:size-5">
            <FileSearch />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <SearchInput value={q} onChange={setQ} placeholder="e.g. Chiamaka or ADM/2024/013" label="Search invoices" />
          {debounced.length < 2 ? (
            <p className="px-1 py-6 text-center text-[13px] text-muted-foreground">Type at least two characters.</p>
          ) : list.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : !list.data?.items.length ? (
            <EmptyState compact icon={FileSearch} title="No matching invoices" description={outstandingOnly ? 'Only invoices with a balance are shown.' : undefined} />
          ) : (
            <ul className={cn('-mx-2 space-y-0.5', list.isFetching && 'opacity-70')}>
              {list.data.items.map((inv) => (
                <li key={inv.id}>
                  <button
                    type="button"
                    onClick={() => onPick({ id: inv.id, rowId: inv.id, number: inv.number, studentName: inv.student.name, balanceKobo: inv.balanceKobo })}
                    className="group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{inv.student.name}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        <span className="font-mono">{inv.number}</span> · {inv.student.classArm ?? 'No class'} · {inv.term.name}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[13px] font-semibold tabular">{money(inv.balanceKobo, currency)}</span>
                      <InvoiceStatusBadge status={inv.status} overdue={inv.overdue} />
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ AI reminder

export function ReminderDialog({ open, onOpenChange, invoiceId, studentName }: { open: boolean; onOpenChange: (open: boolean) => void; invoiceId: string; studentName: string }) {
  const draft = useFeeReminder();
  const [msg, setMsg] = useState<FeeReminder | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sms, setSms] = useState('');
  const started = useRef<string | null>(null);

  const run = () =>
    draft.mutate(invoiceId, {
      onSuccess: (m) => {
        setMsg(m);
        setSubject(m.subject);
        setBody(m.message);
        setSms(m.smsVersion);
      },
    });

  useEffect(() => {
    if (!open) {
      started.current = null;
      return;
    }
    if (started.current === invoiceId) return;
    started.current = invoiceId;
    setMsg(null);
    draft.reset();
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceId]);

  const g = msg?.guardian;
  const first = studentName.split(' ')[0];
  const canSend = useCan('comms.send');
  const openComposer = useOpenComposer();
  // Sent to the guardian's record, so it also reaches their app if they have one.
  const sendIt = () => {
    if (!g) return;
    onOpenChange(false);
    openComposer({
      audience: { type: 'PEOPLE', guardianIds: [g.id], staffIds: [] },
      channels: g.email ? ['EMAIL', 'SMS', 'IN_APP'] : ['SMS', 'IN_APP'],
      title: `Fee reminder: ${studentName}`,
      subject,
      body,
      smsBody: sms,
      source: 'FEES',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="ai-border border-transparent">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-ai-2/15 blur-3xl" />
        <DialogHeader className="relative">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ai-gradient shadow-[0_6px_20px_-6px_var(--ai-2)]">
              <AiSparkle className="size-[18px] [&_path]:fill-white" animated={draft.isPending} />
            </span>
            <div className="min-w-0">
              <DialogTitle>
                <span className="text-ai-gradient">Draft a fee reminder</span> for {first}’s parent
              </DialogTitle>
              <DialogDescription className="mt-0.5">Courteous and clear, with the balance, due date and how to pay.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="relative space-y-4">
          <p className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft/60 px-3 py-2.5 text-[12.5px] text-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
            <span>
              <strong className="font-semibold">Draft only — review before sending.</strong> {canSend ? 'Send opens it in Messages, where you can check it before it goes.' : 'Nothing is sent from here.'}
            </span>
          </p>

          {draft.isPending && !msg ? (
            <div className="space-y-4" aria-busy aria-live="polite">
              <p className="text-[12.5px] text-muted-foreground">Reading the invoice and writing a draft… this takes 10–30 seconds.</p>
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-36 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : draft.isError && !msg ? (
            <EmptyState
              compact
              icon={MessageSquareText}
              tone="danger"
              title="Couldn’t draft the reminder"
              description={aiErrorMessage(draft.error)}
              action={
                <Button variant="outline" size="sm" onClick={run}>
                  <RotateCw /> Try again
                </Button>
              }
            />
          ) : msg ? (
            <div className={cn('space-y-4 transition-opacity', draft.isPending && 'opacity-50')}>
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                {g ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <UserRound className="size-3.5 text-muted-foreground" aria-hidden /> {g.name}
                    </span>
                    <a href={`tel:${g.phone}`} className="inline-flex items-center gap-1.5 text-brand hover:underline">
                      <Phone className="size-3.5" aria-hidden /> {g.phone}
                    </a>
                    {g.email ? (
                      <a href={`mailto:${g.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`} className="inline-flex min-w-0 items-center gap-1.5 truncate text-brand hover:underline">
                        <Mail className="size-3.5" aria-hidden /> {g.email}
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <Mail className="size-3.5" aria-hidden /> No email on record
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-[13px] text-warning">No guardian on record for {studentName}. Add one from the Parents page before reaching out.</p>
                )}
              </div>

              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="fr-subject">Email subject</Label>
                  <CopyButton text={subject} label="subject" />
                </div>
                <Input id="fr-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="fr-body">Email message</Label>
                  <CopyButton text={body} label="email message" />
                </div>
                <Textarea id="fr-body" rows={9} value={body} onChange={(e) => setBody(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="fr-sms" className="flex items-center gap-2">
                    SMS / WhatsApp version
                    <span className={cn('text-[11px] font-normal tabular', sms.length > 160 ? 'text-warning' : 'text-muted-foreground')}>{sms.length}/160</span>
                  </Label>
                  <CopyButton text={sms} label="SMS" />
                </div>
                <Textarea id="fr-sms" rows={3} value={sms} onChange={(e) => setSms(e.target.value)} />
              </div>
              <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <AiSparkle className="size-3" animated={false} /> Drafted by {msg.provider} · {msg.model}. Check the figures before you send it.
              </p>
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter className="relative">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {msg && g && (
            <Button asChild variant="outline">
              <a href={`https://wa.me/${g.phone.replace(/[^\d]/g, '').replace(/^0/, '234')}?text=${encodeURIComponent(sms)}`} target="_blank" rel="noopener noreferrer">
                <MessageSquareText /> Open in WhatsApp
              </a>
            </Button>
          )}
          {msg && (
            <Button variant={canSend && g ? 'outline' : 'ai'} onClick={run} loading={draft.isPending}>
              {!draft.isPending && <RotateCw />} Redraft
            </Button>
          )}
          {msg && g && canSend && (
            <Button onClick={sendIt} disabled={draft.isPending}>
              <Send /> Send
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
