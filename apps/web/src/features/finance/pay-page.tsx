import type { PublicInvoice } from '@aischool/shared';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, Building2, Check, ChevronDown, Clock, Lock, PartyPopper, ShieldCheck } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { cn, initialsFromName } from '@/lib/utils';
import { startOnlinePayment, usePublicInvoice } from './api';
import { koboToInput, money, MoneyInput, parseNaira } from './ui';

const MIN_KOBO = 10_000;

// ------------------------------------------------------------------ shell

export function PayShell({ school, children }: { school?: { name: string; logoUrl: string | null } | null; children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-40 size-96 rounded-full bg-brand/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 size-96 rounded-full bg-success/10 blur-3xl" />
      </div>
      <header className="relative mx-auto flex w-full max-w-lg items-center justify-between px-5 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {school ? (
            school.logoUrl ? (
              <img src={school.logoUrl} alt="" className="size-9 shrink-0 rounded-xl border border-border bg-card object-contain" />
            ) : (
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft font-display text-[13px] font-bold text-brand">{initialsFromName(school.name)}</span>
            )
          ) : (
            <Skeleton className="size-9 rounded-xl" />
          )}
          {school ? <span className="truncate font-display text-[15px] font-semibold tracking-tight">{school.name}</span> : <Skeleton className="h-4 w-40" />}
        </div>
        <ThemeToggle />
      </header>
      <main className="relative mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 pb-8 sm:px-5">{children}</main>
      <footer className="relative mx-auto flex w-full max-w-lg flex-wrap items-center justify-center gap-x-3 gap-y-1 px-5 pb-6 text-[11.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Lock className="size-3" aria-hidden /> Payments secured by Paystack
        </span>
        <span aria-hidden>·</span>
        <span>Card details never touch the school’s systems</span>
      </footer>
    </div>
  );
}

export function PayProblem({ title, children, tone = 'warning' }: { title: string; children: ReactNode; tone?: 'warning' | 'danger' }) {
  return (
    <Card className="mt-6 px-6 py-10 text-center" role="alert">
      <div className={cn('mx-auto grid size-16 place-items-center rounded-full', tone === 'warning' ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger')}>
        {tone === 'warning' ? <Clock className="size-7" /> : <AlertTriangle className="size-7" />}
      </div>
      <p className="mt-5 font-display text-xl font-semibold tracking-tight">{title}</p>
      <div className="mx-auto mt-2 max-w-sm text-[14px] text-muted-foreground">{children}</div>
    </Card>
  );
}

// ------------------------------------------------------------------ page

export default function PayPage() {
  const { token = '' } = useParams();
  const q = usePublicInvoice(token);
  useDocumentTitle(q.data ? `Pay ${q.data.school.name}` : 'Pay school fees');

  if (q.isLoading) {
    return (
      <PayShell school={null}>
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </PayShell>
    );
  }
  if (!q.data) {
    const expired = q.error instanceof ApiError && q.error.status === 401;
    const missing = q.error instanceof ApiError && q.error.status === 404;
    return (
      <PayShell school={{ name: 'School fees', logoUrl: null }}>
        {expired ? (
          <PayProblem title="This payment link has expired">For your security, payment links expire. Please ask the school’s bursary for a fresh link.</PayProblem>
        ) : missing ? (
          <PayProblem title="Invoice not found" tone="danger">
            This invoice may have been replaced. Please contact the school.
          </PayProblem>
        ) : (
          <PayProblem title="We couldn’t load this invoice" tone="danger">
            <p>{errorMessage(q.error)}</p>
            <Button variant="outline" className="mt-4" onClick={() => void q.refetch()}>
              Try again
            </Button>
          </PayProblem>
        )}
      </PayShell>
    );
  }
  return <PayView token={token} p={q.data} />;
}

function Summary({ p }: { p: PublicInvoice }) {
  const [open, setOpen] = useState(false);
  const c = p.currency;
  const inv = p.invoice;
  const overdue = inv.balanceKobo > 0 && inv.dueDate < new Date().toISOString().slice(0, 10);
  return (
    <Card className="overflow-hidden">
      <div className="p-5">
        <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
          Invoice <span className="font-mono normal-case tracking-normal">{inv.number}</span> · {inv.term}
        </p>
        <p className="mt-2 font-display text-[20px] font-semibold tracking-tight">
          {p.student.firstName}
          {p.student.classArm && <span className="font-normal text-muted-foreground"> · {p.student.classArm}</span>}
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {(
            [
              ['Total', inv.totalKobo, ''],
              ['Paid', inv.paidKobo, 'text-success'],
              ['Balance', inv.balanceKobo, inv.balanceKobo > 0 ? '' : 'text-success'],
            ] as const
          ).map(([k, v, cls]) => (
            <div key={k} className="rounded-xl bg-muted/50 px-3 py-2.5">
              <p className="text-[11.5px] text-muted-foreground">{k}</p>
              <p className={cn('mt-0.5 truncate font-display text-[15px] font-semibold tabular', cls)}>{money(v, c)}</p>
            </div>
          ))}
        </div>
        {inv.balanceKobo > 0 && (
          <p className={cn('mt-3 text-[12.5px]', overdue ? 'font-medium text-danger' : 'text-muted-foreground')}>
            {overdue ? 'Was due' : 'Due'} {formatDate(inv.dueDate, { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between border-t border-border px-5 py-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
      >
        {open ? 'Hide' : 'See'} what’s included ({p.lines.length})
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="divide-y divide-border border-t border-border px-5">
          {p.lines.map((l, i) => (
            <li key={`${l.description}${i}`} className="flex items-baseline justify-between gap-4 py-2.5 text-[13px]">
              <span className={cn(l.amountKobo < 0 && 'text-success')}>{l.description}</span>
              <span className={cn('tabular', l.amountKobo < 0 ? 'text-success' : 'font-medium')}>{l.amountKobo < 0 ? `−${money(-l.amountKobo, c)}` : money(l.amountKobo, c)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PayView({ token, p }: { token: string; p: PublicInvoice }) {
  const c = p.currency;
  const balance = p.invoice.balanceKobo;
  const [amount, setAmount] = useState(koboToInput(balance));
  const [email, setEmail] = useState(p.guardianEmail ?? '');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => setAmount(koboToInput(balance)), [balance]);

  if (p.invoice.status === 'CANCELLED') {
    return (
      <PayShell school={p.school}>
        <PayProblem title="This invoice was cancelled" tone="danger">
          There’s nothing to pay on {p.invoice.number}. If you think this is a mistake, please contact the school.
        </PayProblem>
      </PayShell>
    );
  }

  if (balance <= 0) {
    return (
      <PayShell school={p.school}>
        <Card className="relative mt-4 overflow-hidden px-6 py-10 text-center" role="status">
          <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-success/20 blur-3xl" />
          <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }} className="relative mx-auto grid size-20 place-items-center rounded-full bg-success text-white shadow-lift">
            <PartyPopper className="size-9" />
          </motion.div>
          <p className="relative mt-5 font-display text-[24px] font-semibold tracking-tight">All paid — thank you!</p>
          <p className="relative mt-2 text-[14px] text-muted-foreground">
            {p.student.firstName}’s {p.invoice.term} fees ({money(p.invoice.totalKobo, c)}) are fully settled.
          </p>
        </Card>
        <Summary p={p} />
      </PayShell>
    );
  }

  const naira = parseNaira(amount);
  const kobo = naira == null ? 0 : Math.round(naira * 100);
  const half = Math.max(MIN_KOBO, Math.round(balance / 2 / 100) * 100);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (kobo < MIN_KOBO) next.amount = `The minimum is ${money(MIN_KOBO, c)}`;
    else if (kobo > balance) next.amount = `That’s more than the balance of ${money(balance, c)}`;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter an email for your receipt';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;
    setPending(true);
    try {
      const r = await startOnlinePayment({ token, amountKobo: kobo, email: email.trim(), payerName: name.trim() || undefined });
      window.location.assign(r.authorizationUrl);
    } catch (err) {
      setPending(false);
      if (err instanceof ApiError && err.status === 401) setFormError('This payment link has expired. Please ask the school for a new one.');
      else if (err instanceof ApiError && err.errors.some((x) => x.path === 'amountKobo')) setErrors({ amount: err.errors.find((x) => x.path === 'amountKobo')!.message });
      else setFormError(errorMessage(err, 'We couldn’t start the payment. Please try again.'));
    }
  };

  return (
    <PayShell school={p.school}>
      <Summary p={p} />

      {!p.onlinePaymentsEnabled ? (
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-info-soft text-info">
              <Building2 className="size-5" />
            </span>
            <div>
              <p className="font-display text-[15px] font-semibold tracking-tight">Online payment isn’t available yet</p>
              <p className="mt-1 text-[13.5px] text-muted-foreground">
                Please pay at the school bursary, or by bank transfer using <span className="font-mono text-foreground">{p.invoice.number}</span> as the reference. The bank details are on your printed invoice.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-5">
          <form onSubmit={(e) => void submit(e)} noValidate className="grid gap-4">
            <Field label="Amount to pay" htmlFor="pay-amount" error={errors.amount} hint={!errors.amount ? `Pay in full or in part — minimum ${money(MIN_KOBO, c)}` : undefined}>
              <MoneyInput id="pay-amount" value={amount} onChange={setAmount} currency={c} size="lg" invalid={!!errors.amount} />
            </Field>
            <div className="-mt-1 flex flex-wrap gap-2">
              {(
                [
                  ['Full balance', balance],
                  ['Half', half],
                ] as const
              ).map(([label, k]) =>
                k <= balance ? (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setAmount(koboToInput(k))}
                    aria-pressed={kobo === k}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors',
                      kobo === k ? 'border-brand bg-brand-soft text-brand' : 'border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground',
                    )}
                  >
                    {label} · <span className="tabular">{money(k, c)}</span>
                  </button>
                ) : null,
              )}
            </div>
            <Field label="Email for your receipt" htmlFor="pay-email" error={errors.email}>
              <Input id="pay-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!errors.email} placeholder="you@example.com" className="h-12 text-[15px]" />
            </Field>
            <Field label="Your name" htmlFor="pay-name" optional>
              <Input id="pay-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="h-12 text-[15px]" />
            </Field>
            {formError && (
              <p role="alert" className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft/60 px-3 py-2.5 text-[13px] text-danger">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {formError}
              </p>
            )}
            <Button type="submit" size="lg" loading={pending} className="h-13 w-full rounded-xl bg-success text-[16px] font-semibold text-white shadow-[0_10px_30px_-10px_var(--success)] hover:bg-success/90">
              {!pending && <Lock />} {kobo >= MIN_KOBO && kobo <= balance ? `Pay ${money(kobo, c)} securely` : 'Pay securely'}
              {!pending && <ArrowRight />}
            </Button>
            <ul className="grid gap-1.5 text-[12px] text-muted-foreground">
              <li className="flex items-center gap-2">
                <ShieldCheck className="size-3.5 text-success" aria-hidden /> You’ll finish on Paystack’s secure page — card, bank transfer or USSD.
              </li>
              <li className="flex items-center gap-2">
                <Check className="size-3.5 text-success" aria-hidden /> The school gets your payment instantly and your receipt is issued automatically.
              </li>
            </ul>
          </form>
        </Card>
      )}
    </PayShell>
  );
}
