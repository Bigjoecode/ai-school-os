import {
  bankDetailsSchema,
  COMMISSION_STATUS_LABELS,
  NIGERIAN_BANKS,
  REFERRAL_SCHOOL_STATUS_LABELS,
  type AmbassadorDashboard,
  type CommissionStatus,
  type ReferralSchoolStatus,
} from '@aischool/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Bell, Check, Copy, Download, FileText, Landmark, LogOut, MessageCircle, School, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { BrandMark } from '@/components/layout/brand';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError, errorMessage } from '@/lib/api';
import { formatDate, formatRelative } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { queryClient } from '@/lib/query-client';
import { cn } from '@/lib/utils';
import { useSignOut } from '../auth/session';
import { naira } from './public-pages';

const KEY = ['ambassador', 'me'] as const;
export const COMMISSION_BADGE: Record<CommissionStatus, BadgeProps['variant']> = { PENDING: 'warning', PAYABLE: 'brand', PAID: 'success', REVERSED: 'secondary' };
export const SCHOOL_BADGE: Record<ReferralSchoolStatus, BadgeProps['variant']> = { APPLIED: 'secondary', TRIAL: 'brand', PILOT: 'success', PAYING: 'success', SETUP: 'secondary', LAPSED: 'danger' };

/** /ambassador — the signed-in ambassador's own page: their link, referred schools, commissions, payouts and bank details. */
export default function AmbassadorDashboardPage() {
  useDocumentTitle('Ambassador dashboard');
  const signOut = useSignOut();
  const q = useQuery({ queryKey: KEY, queryFn: ({ signal }) => api.get<AmbassadorDashboard>('/ambassador/me', undefined, signal), retry: false });
  const d = q.data;
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-2.5">
          <Link to="/ambassadors" className="flex items-center gap-2">
            <BrandMark className="size-7" />
            <span className="font-display text-[15px] font-semibold tracking-tight">Ambassador</span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5 pb-12">
        {q.isLoading ? (
          <>
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
          </>
        ) : q.error ? (
          q.error instanceof ApiError && q.error.status === 404 ? (
            <Card>
              <EmptyState icon={School} title="This account is not an ambassador" description="If you applied recently, we will email you once you are approved." action={<Button asChild variant="outline"><Link to="/">Go to the app</Link></Button>} />
            </Card>
          ) : (
            <Card>
              <ErrorState error={q.error} onRetry={() => void q.refetch()} />
            </Card>
          )
        ) : d ? (
          <Dashboard d={d} />
        ) : null}
      </main>
    </div>
  );
}

function Dashboard({ d }: { d: AmbassadorDashboard }) {
  const origin = window.location.origin;
  const link = `${origin}/signup?ref=${d.code}`;
  const pilotLink = `${origin}/pilot?ref=${d.code}`;
  const [copied, setCopied] = useState<string | null>(null);
  const [bankOpen, setBankOpen] = useState(false);
  const unread = d.notices.filter((n) => !n.read).length;
  const markRead = useMutation({ mutationFn: () => api.post('/ambassador/notices/read'), onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEY }) });
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      toast.success('Copied');
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error('Could not copy: select the text and copy it');
    }
  };
  const message = `Hello! I recommend AI School OS for your school: lessons, exams, results, fees and parents in one place, made for Nigerian schools. Start a free trial with my link: ${link}`;
  const share = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'AI School OS', text: message, url: link });
        return;
      } catch {
        /* cancelled: fall back to WhatsApp */
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  };
  const download = async () => {
    try {
      const data = await api.get<unknown>('/ambassador/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `my-ambassador-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <div>
        <h1 className="font-display text-[24px] font-semibold tracking-tight">Hello, {d.firstName}</h1>
        <p className="text-[13.5px] text-muted-foreground">
          You earn {d.settings.ratePct}% of every subscription payment from schools you refer{d.settings.commissionMonths ? ` (first ${d.settings.commissionMonths} months)` : ''}.
        </p>
      </div>
      {d.status === 'SUSPENDED' && (
        <p role="status" className="rounded-xl border border-warning/40 bg-warning-soft/50 px-4 py-3 text-[13.5px]">
          Your ambassador account is suspended: new payments do not earn commission{d.settings.suspendedPayable === 'WITHHOLD' ? ' and your payable balance is held' : ''}. Contact us if you have questions.
        </p>
      )}

      <Card className="p-4 sm:p-5">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Your referral code</p>
        <div className="mt-1 flex items-center gap-2">
          <p className="font-mono text-[28px] font-semibold tracking-wider">{d.code}</p>
          <Button variant="ghost" size="sm" aria-label="Copy code" onClick={() => void copy(d.code)}>
            {copied === d.code ? <Check /> : <Copy />}
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          {[
            { label: 'Free trial link', url: link },
            { label: 'Free pilot link', url: pilotLink },
          ].map((l) => (
            <div key={l.url} className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[11.5px] text-muted-foreground">{l.label}</p>
                <p className="truncate font-mono text-[12.5px]">{l.url}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void copy(l.url)}>
                {copied === l.url ? <Check /> : <Copy />} Copy
              </Button>
            </div>
          ))}
        </div>
        <Button className="mt-3 w-full sm:w-auto" onClick={() => void share()}>
          <MessageCircle /> Share on WhatsApp
        </Button>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'On hold', value: d.totals.pendingKobo, hint: `${d.settings.holdDays}-day hold` },
          { label: 'Payable', value: d.totals.payableKobo, hint: `Paid monthly from ${naira(d.settings.minPayoutKobo)}` },
          { label: 'Paid to you', value: d.totals.paidKobo, hint: 'All time' },
        ].map((t) => (
          <Card key={t.label} className="p-3">
            <p className="text-[11.5px] text-muted-foreground">{t.label}</p>
            <p className="font-display text-[18px] font-semibold tabular sm:text-[22px]">{naira(t.value)}</p>
            <p className="text-[11px] text-muted-foreground">{t.hint}</p>
          </Card>
        ))}
      </div>

      {d.notices.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-[14px] font-semibold">
              <Bell className="size-4" /> News {unread > 0 && <Badge variant="brand">{unread} new</Badge>}
            </p>
            {unread > 0 && (
              <Button variant="ghost" size="sm" onClick={() => markRead.mutate()}>
                Mark all read
              </Button>
            )}
          </div>
          <ul className="mt-2 divide-y divide-border">
            {d.notices.slice(0, 8).map((n) => (
              <li key={n.id} className={cn('py-2.5', !n.read && 'font-medium')}>
                <p className="text-[13.5px]">{n.title}</p>
                <p className="whitespace-pre-line text-[12.5px] font-normal text-muted-foreground">{n.body}</p>
                <p className="text-[11.5px] font-normal text-muted-foreground">{formatRelative(n.createdAt)}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-4">
        <p className="flex items-center gap-2 text-[14px] font-semibold">
          <School className="size-4" /> Schools you referred ({d.schools.length})
        </p>
        {d.schools.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted-foreground">None yet. Share your link: schools that sign up with it appear here.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {d.schools.map((s, i) => (
              <li key={`${s.name}-${i}`} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium">{s.name}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {s.state ?? '—'} · since {formatDate(s.referredAt)}
                  </p>
                </div>
                <Badge variant={SCHOOL_BADGE[s.status]}>{REFERRAL_SCHOOL_STATUS_LABELS[s.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <p className="flex items-center gap-2 text-[14px] font-semibold">
          <Wallet className="size-4" /> Commissions
        </p>
        {d.commissions.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted-foreground">No commissions yet. You earn when a school you referred pays; trials and the free pilot earn nothing until then.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {d.commissions.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium">{c.schoolName}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {c.kind === 'CLAWBACK' ? 'Deduction (refund)' : `${c.ratePct}% of ${naira(c.baseKobo)}`} · {formatDate(c.createdAt)}
                    {c.status === 'PENDING' ? ` · payable ${formatDate(c.payableAt)}` : ''}
                  </p>
                  {c.reason && <p className="text-[12px] text-muted-foreground">{c.reason}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className={cn('text-[14px] font-semibold tabular', c.status === 'REVERSED' && 'text-muted-foreground line-through', c.amountKobo < 0 && 'text-danger')}>{naira(c.amountKobo)}</p>
                  <Badge variant={COMMISSION_BADGE[c.status]}>{COMMISSION_STATUS_LABELS[c.status]}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <p className="flex items-center gap-2 text-[14px] font-semibold">
          <Landmark className="size-4" /> Payouts
        </p>
        {d.payouts.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted-foreground">No payouts yet. We pay monthly by bank transfer once your payable balance reaches {naira(d.settings.minPayoutKobo)}.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {d.payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-[13.5px]">
                <span>
                  {formatDate(p.paidOn)} <span className="text-[12px] text-muted-foreground">· ref {p.reference} · {p.commissionCount} commissions</span>
                </span>
                <span className="font-semibold tabular">{naira(p.amountKobo)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 rounded-xl bg-muted/50 p-3 text-[13px]">
          <p className="font-medium">
            Paid into {d.bank.bankName} ••••{d.bank.accountLast4}
          </p>
          <p className="text-muted-foreground">{d.bank.accountName}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setBankOpen(true)}>
            Change bank details
          </Button>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2 text-[13px]">
        <Button asChild variant="ghost" size="sm">
          <Link to="/legal/ambassador">
            <FileText /> Ambassador Terms
          </Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void download()}>
          <Download /> Download my data
        </Button>
      </div>
      <p className="text-[12px] text-muted-foreground">You are an independent ambassador, not an employee, and responsible for declaring your commission for tax.</p>
      <BankDialog open={bankOpen} onOpenChange={setBankOpen} email={d.email} />
    </>
  );
}

type BankValues = z.input<typeof bankDetailsSchema>;

/** New bank details only take effect with a code sent to the ambassador's email. */
function BankDialog({ open, onOpenChange, email }: { open: boolean; onOpenChange: (v: boolean) => void; email: string }) {
  const [step, setStep] = useState<{ devCode?: string } | null>(null);
  const [code, setCode] = useState('');
  const form = useForm<BankValues, unknown, z.output<typeof bankDetailsSchema>>({ resolver: zodResolver(bankDetailsSchema), defaultValues: { bankName: '', accountNumber: '', accountName: '' } });
  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) {
      setStep(null);
      setCode('');
      form.reset();
    }
  };
  const start = useMutation({ mutationFn: (v: z.output<typeof bankDetailsSchema>) => api.post<{ email: string; devCode?: string }>('/ambassador/bank', v), onSuccess: (r) => setStep({ devCode: r.devCode }), onError: (e) => toast.error(errorMessage(e)) });
  const confirm = useMutation({
    mutationFn: () => api.post('/ambassador/bank/verify', { code }),
    onSuccess: () => {
      toast.success('Bank details changed');
      void queryClient.invalidateQueries({ queryKey: KEY });
      close(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const err = form.formState.errors;
  return (
    <FormDialog
      open={open}
      onOpenChange={close}
      title="Change bank details"
      description={step ? `Enter the 6-digit code we sent to ${email}.` : `For your security we send a code to ${email} before the change takes effect.`}
      icon={<Landmark />}
      submitLabel={step ? 'Confirm change' : 'Send code'}
      pending={start.isPending || confirm.isPending}
      onSubmit={step ? (e) => { e?.preventDefault(); confirm.mutate(); } : form.handleSubmit((v) => start.mutate(v))}
    >
      {step ? (
        <>
          {step.devCode && <p className="rounded-lg bg-warning-soft/50 px-3 py-2 text-[12.5px] text-warning">Local development (no email set up): your code is {step.devCode}</p>}
          <Field label="Code" htmlFor="bank-code">
            <Input id="bank-code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="text-center font-mono text-[18px] tracking-[0.3em]" />
          </Field>
        </>
      ) : (
        <>
          <Field label="Bank" htmlFor="nb-bank" error={err.bankName?.message}>
            <Input id="nb-bank" list="ng-banks-dash" autoComplete="off" {...form.register('bankName')} />
            <datalist id="ng-banks-dash">
              {NIGERIAN_BANKS.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Field>
          <Field label="Account number (NUBAN)" htmlFor="nb-acct" error={err.accountNumber?.message}>
            <Input id="nb-acct" inputMode="numeric" maxLength={10} autoComplete="off" {...form.register('accountNumber')} />
          </Field>
          <Field label="Account name" htmlFor="nb-name" error={err.accountName?.message}>
            <Input id="nb-name" autoComplete="off" {...form.register('accountName')} />
          </Field>
        </>
      )}
    </FormDialog>
  );
}
