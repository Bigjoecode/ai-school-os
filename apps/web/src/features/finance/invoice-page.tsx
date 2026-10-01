import { type InvoiceDetail, toKobo } from '@aischool/shared';
import QRCode from 'qrcode';
import {
  Ban,
  ChevronDown,
  ExternalLink,
  Link2,
  MessageCircle,
  MinusCircle,
  MoreHorizontal,
  PlusCircle,
  Printer,
  Receipt,
  Trash2,
  Wallet,
} from 'lucide-react';
import { type BaseSyntheticEvent, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Page } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { useDocumentTitle } from '@/lib/hooks';
import { cn, initialsFromName } from '@/lib/utils';
import { BackLink, DetailSkeleton } from '../planning/ui';
import { useAddLine, useCancelInvoice, useInvoice, useRemoveLine } from './api';
import { RecordPaymentDialog, ReminderDialog } from './payment-dialogs';
import { copyText, InvoiceStatusBadge, MethodBadge, money, MoneyInput, parseNaira, PaymentStatusBadge, schoolDate, schoolDateTime } from './ui';

export default function InvoicePage() {
  const { id = '' } = useParams();
  const q = useInvoice(id);
  if (q.isLoading) {
    return (
      <Page className="max-w-5xl">
        <DetailSkeleton />
      </Page>
    );
  }
  if (!q.data) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <Page className="max-w-5xl">
        <BackLink to="/fees?tab=invoices">Invoices</BackLink>
        {notFound ? <EmptyState icon={Receipt} title="Invoice not found" description="It may have been removed, or the link is wrong." /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      </Page>
    );
  }
  return <InvoiceView inv={q.data} />;
}

export function signedMoney(kobo: number, currency: string) {
  return kobo < 0 ? `−${money(-kobo, currency)}` : money(kobo, currency);
}

function payUrl(inv: InvoiceDetail) {
  return inv.payPath ? `${window.location.origin}${inv.payPath}` : null;
}

function whatsappText(inv: InvoiceDetail, url: string) {
  const first = inv.student.name.split(' ')[0];
  return `Hello, this is ${inv.school.name}. ${first}’s ${inv.term.name} fees invoice (${inv.number}) has a balance of ${money(inv.balanceKobo, inv.currency)}, due ${schoolDate(inv.dueDate)}. You can pay securely online here: ${url} — thank you!`;
}

function InvoiceView({ inv }: { inv: InvoiceDetail }) {
  useDocumentTitle(`${inv.number} · ${inv.student.name}`);
  const [params, setParams] = useSearchParams();
  const canManage = useCan('finance.manage');
  const canAi = useCan('ai.use');
  const c = inv.currency;
  const cancelled = inv.status === 'CANCELLED';
  const url = payUrl(inv);

  const [payOpen, setPayOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [lineKind, setLineKind] = useState<'DISCOUNT' | 'FINE' | 'FEE' | null>(null);
  const [removing, setRemoving] = useState<InvoiceDetail['lines'][number] | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const removeLine = useRemoveLine(inv.id);

  // ?pay=1 opens the payment dialog (from lists / ⌘K).
  useEffect(() => {
    if (params.get('pay') === '1') {
      if (canManage && inv.balanceKobo > 0 && !cancelled) setPayOpen(true);
      const p = new URLSearchParams(params);
      p.delete('pay');
      setParams(p, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyLink = () => {
    if (!url) return;
    void copyText(url).then((ok) => (ok ? toast.success('Payment link copied') : toast.error('Couldn’t copy the link')));
  };

  const fees = inv.lines.filter((l) => l.amountKobo >= 0).reduce((n, l) => n + l.amountKobo, 0);
  const discounts = inv.lines.filter((l) => l.amountKobo < 0).reduce((n, l) => n + l.amountKobo, 0);
  const received = inv.payments.filter((p) => p.status === 'SUCCESS' || p.status === 'REVERSED');

  return (
    <Page className="max-w-5xl print:max-w-none print:p-0">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <BackLink to="/fees?tab=invoices">Invoices</BackLink>
        <div className="flex flex-wrap items-center gap-2">
          {url && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Link2 /> Payment link <ChevronDown className="opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={copyLink}>
                  <Link2 /> Copy payment link
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`https://wa.me/?text=${encodeURIComponent(whatsappText(inv, url))}`} target="_blank" rel="noopener noreferrer">
                    <MessageCircle /> Share on WhatsApp
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink /> Open parent page
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canAi && inv.balanceKobo > 0 && !cancelled && (
            <Button variant="outline" onClick={() => setReminderOpen(true)}>
              <AiSparkle className="size-4" animated={false} /> Draft reminder
            </Button>
          )}
          <Button variant="outline" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
          {canManage && !cancelled && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More invoice actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setLineKind('DISCOUNT')}>
                  <MinusCircle /> Add discount
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setLineKind('FINE')}>
                  <PlusCircle /> Add fine / charge
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setLineKind('FEE')}>
                  <PlusCircle /> Add fee line
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setCancelOpen(true)} className="text-danger focus:text-danger" disabled={inv.paidKobo > 0}>
                  <Ban /> Cancel invoice
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canManage && inv.balanceKobo > 0 && !cancelled && (
            <Button onClick={() => setPayOpen(true)}>
              <Wallet /> Record payment
            </Button>
          )}
        </div>
      </div>

      {inv.note && cancelled && (
        <p className="mb-4 rounded-xl border border-danger/30 bg-danger-soft/50 px-4 py-2.5 text-[13px] print:hidden">
          <strong className="font-semibold text-danger">Cancelled.</strong> {inv.note}
        </p>
      )}

      <article className="print-a4 relative mx-auto overflow-hidden rounded-2xl border border-border bg-card shadow-soft print:rounded-none print:border-0 print:shadow-none">
        <div aria-hidden className="h-1.5 w-full bg-gradient-to-r from-brand via-ai-2 to-ai-3" />
        {cancelled && (
          <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="-rotate-[24deg] rounded-2xl border-[6px] border-danger/25 px-8 py-2 font-display text-[64px] font-black tracking-[0.2em] text-danger/20 sm:text-[88px]">CANCELLED</span>
          </div>
        )}

        {/* school header */}
        <header className="flex flex-col gap-5 border-b border-border px-6 py-6 sm:flex-row sm:items-start sm:justify-between sm:px-10 sm:py-8 print:flex-row print:px-8 print:py-5">
          <div className="flex items-start gap-4">
            {inv.school.logoUrl ? (
              <img src={inv.school.logoUrl} alt="" className="size-14 shrink-0 rounded-xl object-contain" />
            ) : (
              <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-brand-soft font-display text-lg font-bold text-brand">{initialsFromName(inv.school.name)}</div>
            )}
            <div className="min-w-0 text-[12.5px] text-muted-foreground">
              <p className="font-display text-[18px] font-bold leading-tight tracking-tight text-foreground">{inv.school.name}</p>
              {inv.school.address && <p className="mt-0.5 whitespace-pre-line">{inv.school.address}</p>}
              <p>{[inv.school.phone, inv.school.email].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          <div className="sm:text-right print:text-right">
            <p className="font-display text-[26px] font-semibold uppercase tracking-[0.18em] text-foreground/90">Invoice</p>
            <p className="mt-1 font-mono text-[13px]">{inv.number}</p>
            <div className="mt-2 sm:flex sm:justify-end print:flex print:justify-end">
              <InvoiceStatusBadge status={inv.status} overdue={inv.overdue} />
            </div>
          </div>
        </header>

        {/* meta */}
        <div className="grid gap-6 border-b border-border px-6 py-6 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] sm:px-10 print:grid-cols-[1.3fr_1fr] print:px-8 print:py-4">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Bill to</p>
            <p className="mt-1.5 text-[15px] font-semibold">{inv.student.name}</p>
            <p className="text-[12.5px] text-muted-foreground">
              <span className="font-mono">{inv.student.admissionNumber}</span>
              {inv.student.classArm && ` · ${inv.student.classArm}`}
            </p>
            {inv.guardians.length > 0 && (
              <ul className="mt-2.5 space-y-0.5 text-[12.5px] text-muted-foreground">
                {inv.guardians.map((g) => (
                  <li key={`${g.name}${g.phone}`}>
                    <span className="text-foreground">{g.name}</span> · {g.phone}
                    {g.email && ` · ${g.email}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[12.5px] sm:text-right print:text-right">
            <div>
              <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Term</dt>
              <dd className="mt-0.5 font-medium">{inv.term.name}</dd>
            </div>
            <div>
              <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Issued</dt>
              <dd className="mt-0.5 font-medium tabular">{schoolDate(inv.issuedAt)}</dd>
            </div>
            <div>
              <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Due</dt>
              <dd className={cn('mt-0.5 font-medium tabular', inv.overdue && 'text-danger')}>{schoolDate(inv.dueDate)}</dd>
            </div>
            <div>
              <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Balance due</dt>
              <dd className={cn('mt-0.5 font-display text-[16px] font-semibold tabular', inv.balanceKobo > 0 ? (inv.overdue ? 'text-danger' : 'text-foreground') : 'text-success')}>
                {money(inv.balanceKobo, c)}
              </dd>
            </div>
          </dl>
        </div>

        {/* lines */}
        <div className="px-2 sm:px-6 print:px-4">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="px-4 py-3 text-left font-semibold">
                  Description
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Amount
                </th>
                {canManage && !cancelled && <th scope="col" className="w-10 print:hidden" aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.id} className="group border-b border-border/70 last:border-0">
                  <td className="px-4 py-3">
                    <span className={cn(l.amountKobo < 0 && 'text-success')}>{l.description}</span>
                    {l.kind === 'FINE' && (
                      <Badge variant="warning" className="ml-2 align-middle">
                        Charge
                      </Badge>
                    )}
                  </td>
                  <td className={cn('px-4 py-3 text-right tabular', l.amountKobo < 0 ? 'text-success' : 'font-medium')}>{signedMoney(l.amountKobo, c)}</td>
                  {canManage && !cancelled && (
                    <td className="py-2 pr-2 text-right print:hidden">
                      <Button variant="ghost" size="icon-sm" className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100" aria-label={`Remove ${l.description}`} onClick={() => setRemoving(l)}>
                        <Trash2 />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* totals + pay */}
        <div className="grid gap-6 border-t border-border px-6 py-6 sm:grid-cols-2 sm:px-10 print:grid-cols-2 print:px-8 print:py-4">
          <div className="order-2 space-y-4 sm:order-1 print:order-1">
            {inv.school.bankDetails && (
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Pay by bank transfer</p>
                <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed">{inv.school.bankDetails}</p>
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  Use <span className="font-mono text-foreground">{inv.number}</span> as the reference.
                </p>
              </div>
            )}
            {url && inv.balanceKobo > 0 && <PayOnline url={url} />}
          </div>
          <dl className="order-1 self-start rounded-xl bg-muted/40 p-4 sm:order-2 print:order-2">
            <div className="flex justify-between py-1 text-[13px]">
              <dt className="text-muted-foreground">Fees &amp; charges</dt>
              <dd className="tabular">{money(fees, c)}</dd>
            </div>
            {discounts < 0 && (
              <div className="flex justify-between py-1 text-[13px]">
                <dt className="text-muted-foreground">Discounts</dt>
                <dd className="tabular text-success">{signedMoney(discounts, c)}</dd>
              </div>
            )}
            <div className="mt-1 flex justify-between border-t border-border pt-2 text-[13.5px] font-semibold">
              <dt>Total</dt>
              <dd className="tabular">{money(inv.totalKobo, c)}</dd>
            </div>
            <div className="flex justify-between py-1 text-[13px]">
              <dt className="text-muted-foreground">Paid</dt>
              <dd className="tabular text-success">{inv.paidKobo ? `−${money(inv.paidKobo, c)}` : money(0, c)}</dd>
            </div>
            <div className="mt-1 flex items-baseline justify-between border-t border-border pt-2">
              <dt className="text-[13.5px] font-semibold">Balance due</dt>
              <dd className={cn('font-display text-[20px] font-semibold tabular', inv.balanceKobo === 0 && 'text-success', inv.overdue && inv.balanceKobo > 0 && 'text-danger')}>
                {money(inv.balanceKobo, c)}
              </dd>
            </div>
          </dl>
        </div>

        <footer className="border-t border-border bg-muted/30 px-6 py-3 text-center text-[11.5px] text-muted-foreground sm:px-10 print:px-8">
          Thank you for choosing {inv.school.name}. Please quote {inv.number} with every payment.
        </footer>
      </article>

      {/* payments */}
      <Card className="mt-5 print:hidden">
        <CardHeader>
          <CardTitle>Payments</CardTitle>
          <span className="text-[12.5px] text-muted-foreground tabular">{money(inv.paidKobo, c)} received</span>
        </CardHeader>
        <CardContent>
          {inv.payments.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-center text-[13px] text-muted-foreground">No payments yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {inv.payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-[14px] font-semibold tabular', p.status === 'REVERSED' && 'text-muted-foreground line-through')}>{money(p.amountKobo, c)}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {schoolDateTime(p.paidAt)}
                      {p.receivedBy && ` · ${p.receivedBy}`}
                      {p.reference && (
                        <>
                          {' '}
                          · ref <span className="font-mono">{p.reference}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <MethodBadge method={p.method} />
                  <PaymentStatusBadge status={p.status} />
                  {p.receiptNumber && (p.status === 'SUCCESS' || p.status === 'REVERSED') ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`/fees/receipts/${p.id}`}>
                        <Receipt /> <span className="font-mono">{p.receiptNumber}</span>
                      </Link>
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {received.length === 0 && canManage && inv.balanceKobo > 0 && !cancelled && (
            <Button className="mt-3" variant="outline" size="sm" onClick={() => setPayOpen(true)}>
              <Wallet /> Record the first payment
            </Button>
          )}
        </CardContent>
      </Card>

      <RecordPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        invoice={{ id: inv.id, number: inv.number, studentName: inv.student.name, balanceKobo: inv.balanceKobo }}
      />
      {canAi && <ReminderDialog open={reminderOpen} onOpenChange={setReminderOpen} invoiceId={inv.id} studentName={inv.student.name} />}
      {lineKind && <LineDialog open={!!lineKind} onOpenChange={(o) => !o && setLineKind(null)} kind={lineKind} inv={inv} />}
      <CancelDialog open={cancelOpen} onOpenChange={setCancelOpen} inv={inv} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove “${removing?.description}”?`}
        description={removing ? `The total changes by ${signedMoney(-removing.amountKobo, c)}.` : undefined}
        confirmLabel="Remove line"
        loading={removeLine.isPending}
        onConfirm={() => removing && removeLine.mutate(removing.id, { onSuccess: () => setRemoving(null) })}
      />
    </Page>
  );
}

function PayOnline({ url }: { url: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#0a1024', light: '#ffffff' } }).then((s) => {
      if (alive) setSvg(s);
    });
    return () => {
      alive = false;
    };
  }, [url]);
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border p-3">
      <div className="size-[84px] shrink-0 rounded-lg bg-white p-1.5">
        {svg && <img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} alt="QR code for the online payment page" className="size-full" />}
      </div>
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Pay online</p>
        <p className="mt-1 text-[12.5px]">Scan to pay by card, transfer or USSD — secured by Paystack.</p>
        <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-[11.5px] text-brand hover:underline print:text-[9px] print:text-foreground">
          {url}
        </a>
      </div>
    </div>
  );
}

function LineDialog({ open, onOpenChange, kind, inv }: { open: boolean; onOpenChange: (o: boolean) => void; kind: 'DISCOUNT' | 'FINE' | 'FEE'; inv: InvoiceDetail }) {
  const add = useAddLine(inv.id);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const copy = {
    DISCOUNT: { title: 'Add a discount', placeholder: 'e.g. Staff child discount', submit: 'Add discount', hint: 'Subtracted from the total.' },
    FINE: { title: 'Add a fine or charge', placeholder: 'e.g. Late payment charge', submit: 'Add charge', hint: 'Added to the total.' },
    FEE: { title: 'Add a fee line', placeholder: 'e.g. School bus (optional)', submit: 'Add fee', hint: 'Added to the total — use this for optional items.' },
  }[kind];

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const naira = parseNaira(amount);
    const next: Record<string, string> = {};
    if (description.trim().length < 2) next.description = 'Describe it for the parent';
    if (naira == null || naira <= 0) next.amountKobo = 'Enter an amount';
    else if (kind === 'DISCOUNT' && toKobo(naira) > inv.totalKobo) next.amountKobo = `More than the invoice total (${money(inv.totalKobo, inv.currency)})`;
    setErrors(next);
    if (Object.keys(next).length || naira == null) return;
    add.mutate(
      { description: description.trim(), kind, amountKobo: toKobo(naira) },
      {
        onSuccess: () => onOpenChange(false),
        onError: (err) => {
          if (err instanceof ApiError && err.errors.length) setErrors(Object.fromEntries(err.errors.map((x) => [x.path, x.message])));
          else toast.error(err.message);
        },
      },
    );
  };

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={copy.title} description={`${inv.number} · ${inv.student.name}`} icon={kind === 'DISCOUNT' ? <MinusCircle /> : <PlusCircle />} submitLabel={copy.submit} pending={add.isPending} onSubmit={submit} size="sm">
      <div className="grid gap-4">
        <Field label="Description" htmlFor="line-desc" error={errors.description}>
          <Input id="line-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={120} placeholder={copy.placeholder} invalid={!!errors.description} autoFocus />
        </Field>
        <Field label="Amount" htmlFor="line-amount" error={errors.amountKobo} hint={copy.hint}>
          <MoneyInput id="line-amount" value={amount} onChange={setAmount} currency={inv.currency} invalid={!!errors.amountKobo} />
        </Field>
      </div>
    </FormDialog>
  );
}

function CancelDialog({ open, onOpenChange, inv }: { open: boolean; onOpenChange: (o: boolean) => void; inv: InvoiceDetail }) {
  const cancel = useCancelInvoice(inv.id);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (open) {
      setReason('');
      setError(undefined);
    }
  }, [open]);
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Cancel ${inv.number}?`}
      description="The invoice stays on record, marked cancelled, and no longer counts towards what’s owed. This can’t be undone."
      icon={<Ban />}
      submitLabel="Cancel invoice"
      pending={cancel.isPending}
      size="sm"
      onSubmit={(e) => {
        e?.preventDefault();
        if (reason.trim().length < 3) {
          setError('Give a short reason for the record');
          return;
        }
        cancel.mutate(reason.trim(), { onSuccess: () => onOpenChange(false) });
      }}
    >
      <Field label="Reason" htmlFor="cancel-reason" error={error}>
        <Textarea id="cancel-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Learner withdrew before term started" invalid={!!error} autoFocus />
      </Field>
    </FormDialog>
  );
}
