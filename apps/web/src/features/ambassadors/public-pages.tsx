import {
  ambassadorApplySchema,
  NIGERIAN_BANKS,
  NIGERIAN_STATES,
  type AmbassadorApplyResult,
  type AmbassadorPublicConfig,
} from '@aischool/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, Banknote, CheckCircle2, Clock, Eye, EyeOff, HandCoins, Loader2, Mail, School, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, inputClass } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError, errorMessage } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { useDocumentTitle } from '@/lib/hooks';
import { SalesLayout, ShareButton } from '../sales/sales-layout';
import { PublicShell } from '../signup/signup-pages';
import '../sales/sales.css';

export const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const useAmbassadorConfig = () =>
  useQuery({ queryKey: ['ambassadors', 'config'], queryFn: ({ signal }) => api.get<AmbassadorPublicConfig>('/ambassadors/config', undefined, signal), staleTime: 60_000 });

// ------------------------------------------------------------------ landing

/** /ambassadors — what the programme is, the rate (from the console's settings) and the rules. */
export default function AmbassadorsLandingPage() {
  const q = useAmbassadorConfig();
  const c = q.data;
  const rate = c ? `${c.ratePct}%` : '5%';
  const steps = [
    { icon: School, title: 'Tell schools about us', text: 'Share your own link with proprietors and principals you know. Your code stays with the school for 90 days while they decide.' },
    { icon: HandCoins, title: 'Earn on every payment', text: `When a school you referred pays its subscription, you earn ${rate} of what it paid${c?.commissionMonths ? ` (for its first ${c.commissionMonths} months)` : ', every time it pays, for as long as it stays'}.` },
    { icon: Banknote, title: 'Get paid monthly', text: c ? `Each commission is held for ${c.holdDays} days, then paid by bank transfer in the monthly payout once your balance reaches ${naira(c.minPayoutKobo)}.` : 'Commissions are held for a short period, then paid monthly by bank transfer.' },
  ];
  return (
    <SalesLayout path="/ambassadors" actions={<ShareButton path="/ambassadors" />}>
      <section className="mx-auto max-w-5xl px-4 pb-6 pt-10 sm:pt-14">
        <p className="text-[12.5px] font-semibold uppercase tracking-wider text-brand">Ambassador programme</p>
        <h1 className="mt-2 max-w-3xl font-display text-[32px] font-semibold leading-[1.1] tracking-tight sm:text-[44px]">
          Earn {rate} every time a school you refer pays
        </h1>
        <p className="mt-4 max-w-2xl text-[15.5px] text-muted-foreground">
          Know school owners, principals or teachers? Introduce them to AI School OS. When a school signs up with your link and pays for its subscription, you earn {rate} of each payment
          {c?.commissionMonths ? ` for its first ${c.commissionMonths} months` : ' — term after term, for as long as it pays'}.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {q.isLoading ? (
            <Skeleton className="h-11 w-48 rounded-xl" />
          ) : c?.open ? (
            <Button asChild size="lg" variant="brand">
              <Link to="/ambassadors/apply">
                Apply to be an ambassador <ArrowRight />
              </Link>
            </Button>
          ) : (
            <p className="rounded-xl bg-muted px-4 py-3 text-[14px] text-muted-foreground">Applications are closed at the moment. Please check back later.</p>
          )}
          <Button asChild size="lg" variant="outline">
            <Link to="/login">Ambassador sign-in</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-3 px-4 py-6 sm:grid-cols-3">
        {steps.map(({ icon: Icon, title, text }, i) => (
          <Card key={title} className="p-5">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
              <Icon className="size-5" aria-hidden />
            </span>
            <p className="mt-3 text-[12px] font-semibold text-muted-foreground">Step {i + 1}</p>
            <p className="font-display text-[17px] font-semibold tracking-tight">{title}</p>
            <p className="mt-1.5 text-[14px] text-muted-foreground">{text}</p>
          </Card>
        ))}
      </section>

      <section className="mx-auto max-w-5xl px-4 py-6">
        <Card className="p-5 sm:p-6">
          <h2 className="font-display text-[20px] font-semibold tracking-tight">The fine print, in plain words</h2>
          <ul className="mt-3 space-y-2 text-[14px] text-muted-foreground">
            <li>• Commission is worked out on what the school actually paid for its AI School OS subscription. Free trials and the free pilot earn nothing until the school pays.</li>
            <li>• If a payment is refunded or reversed, the commission on it is reversed too (or deducted from a later payout).</li>
            <li>• You can’t refer your own school, and each school has one ambassador: the first valid code used at sign-up.</li>
            <li>• Be honest: no spam, no pretending to be from AI School OS staff, no promises we haven’t made.</li>
            <li>• You are independent, not an employee, and you are responsible for your own tax on what you earn.</li>
            <li>• We approve every ambassador, and we can hold payments where we suspect fraud.</li>
          </ul>
          <p className="mt-4 text-[13.5px]">
            Read the full{' '}
            <Link to="/legal/ambassador" className="font-medium text-brand underline-offset-4 hover:underline">
              Ambassador Terms
            </Link>{' '}
            (a draft awaiting legal review).
          </p>
        </Card>
      </section>
    </SalesLayout>
  );
}

// ------------------------------------------------------------------ apply

type ApplyValues = z.input<typeof ambassadorApplySchema>;

/** /ambassadors/apply — the application, then the emailed code. */
export function AmbassadorApplyPage() {
  useDocumentTitle('Apply to be an ambassador');
  const q = useAmbassadorConfig();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ApplyValues, unknown, z.output<typeof ambassadorApplySchema>>({
    resolver: zodResolver(ambassadorApplySchema),
    defaultValues: { fullName: '', phone: '', email: '', state: 'Lagos', approach: '', bank: { bankName: '', accountNumber: '', accountName: '' }, password: '', acceptTerms: false as unknown as true, website: '' },
  });
  const { register, handleSubmit, formState, setError } = form;
  const apply = useMutation({
    mutationFn: (v: z.output<typeof ambassadorApplySchema>) => api.post<AmbassadorApplyResult>('/ambassadors/apply', v),
    onSuccess: (r) => {
      try {
        sessionStorage.setItem('ambassador-apply', JSON.stringify(r));
      } catch {
        /* the code still arrives by email */
      }
      navigate(`/ambassadors/verify?id=${encodeURIComponent(r.id)}`);
    },
    onError: (err) => {
      if (!applyServerErrors(err, setError)) setFormError(errorMessage(err));
    },
  });
  const onSubmit = handleSubmit((v) => {
    setFormError(null);
    apply.mutate(v);
  });
  const c = q.data;
  if (q.isLoading) {
    return (
      <PublicShell>
        <Skeleton className="mt-8 h-[600px] rounded-2xl" />
      </PublicShell>
    );
  }
  if (!c?.open) {
    return (
      <PublicShell>
        <Card className="mt-10 p-8 text-center">
          <p className="font-display text-xl font-semibold">Applications are closed</p>
          <p className="mt-2 text-[14px] text-muted-foreground">The ambassador programme is not taking new applications at the moment. Please check back later.</p>
          <Button asChild className="mt-5" variant="outline">
            <Link to="/ambassadors">About the programme</Link>
          </Button>
        </Card>
      </PublicShell>
    );
  }
  const err = formState.errors;
  return (
    <PublicShell>
      <div className="pt-4 sm:pt-8">
        <h1 className="font-display text-[28px] font-semibold tracking-tight">Apply to be an ambassador</h1>
        <p className="mt-1.5 text-[14px] text-muted-foreground">
          Earn {c.ratePct}% of every subscription payment from schools you refer. We review every application and email you, usually within a few working days.
        </p>
      </div>
      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-5">
        <Card className="space-y-4 p-4 sm:p-6">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">About you</p>
          <Field label="Full name" htmlFor="fullName" error={err.fullName?.message}>
            <Input id="fullName" autoComplete="name" invalid={!!err.fullName} {...register('fullName')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone" htmlFor="phone" error={err.phone?.message}>
              <Input id="phone" type="tel" autoComplete="tel" placeholder="0803 123 4567" invalid={!!err.phone} {...register('phone')} />
            </Field>
            <Field label="Email" htmlFor="email" error={err.email?.message} hint="We send a 6-digit code here; it is also your sign-in">
              <Input id="email" type="email" autoComplete="email" invalid={!!err.email} {...register('email')} />
            </Field>
            <Field label="State" htmlFor="state" error={err.state?.message}>
              <select id="state" className={inputClass} {...register('state')}>
                {NIGERIAN_STATES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="How will you find schools?" htmlFor="approach" error={err.approach?.message} hint="A sentence or two: who you know, where you work, how you will introduce us.">
            <Textarea id="approach" rows={3} maxLength={500} invalid={!!err.approach} {...register('approach')} />
          </Field>
        </Card>

        <Card className="space-y-4 p-4 sm:p-6">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Where we pay your commission</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bank" htmlFor="bankName" error={err.bank?.bankName?.message}>
              <Input id="bankName" list="ng-banks" autoComplete="off" invalid={!!err.bank?.bankName} {...register('bank.bankName')} />
              <datalist id="ng-banks">
                {NIGERIAN_BANKS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </Field>
            <Field label="Account number (NUBAN)" htmlFor="accountNumber" error={err.bank?.accountNumber?.message}>
              <Input id="accountNumber" inputMode="numeric" maxLength={10} autoComplete="off" invalid={!!err.bank?.accountNumber} {...register('bank.accountNumber')} />
            </Field>
          </div>
          <Field label="Account name" htmlFor="accountName" error={err.bank?.accountName?.message} hint="As the bank shows it. Payments go only to an account in your own name.">
            <Input id="accountName" autoComplete="off" invalid={!!err.bank?.accountName} {...register('bank.accountName')} />
          </Field>
          <p className="flex items-start gap-2 text-[12.5px] text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> Your account number is stored encrypted; afterwards we only ever show its last four digits.
          </p>
        </Card>

        <Card className="space-y-4 p-4 sm:p-6">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Your sign-in</p>
          <Field label="Choose a password" htmlFor="password" error={err.password?.message} hint="At least 10 characters. You sign in with your email once we approve you.">
            <div className="relative">
              <Input id="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" className="pr-10" invalid={!!err.password} {...register('password')} />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </Field>
          <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
            <label htmlFor="website">Website</label>
            <input id="website" tabIndex={-1} autoComplete="off" {...register('website')} />
          </div>
          <label className="flex items-start gap-2.5 text-[13px]">
            <input type="checkbox" className="mt-0.5 size-4 accent-[hsl(var(--brand))]" {...register('acceptTerms')} />
            <span>
              I agree to the{' '}
              <Link to="/legal/ambassador" target="_blank" className="text-brand underline">
                Ambassador Terms
              </Link>{' '}
              and the{' '}
              <Link to="/legal/privacy" target="_blank" className="text-brand underline">
                privacy notice
              </Link>
              . I am independent, and responsible for my own tax.
            </span>
          </label>
          {err.acceptTerms && <p className="text-[12px] font-medium text-danger">{err.acceptTerms.message}</p>}
        </Card>
        {formError && (
          <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft/40 px-4 py-3 text-[13.5px] text-danger">
            {formError}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={apply.isPending}>
          Send my application <ArrowRight />
        </Button>
      </form>
    </PublicShell>
  );
}

// ------------------------------------------------------------------ verify

/** /ambassadors/verify — the 6-digit code (or the emailed link). */
export function AmbassadorVerifyPage() {
  useDocumentTitle('Confirm your email');
  const [params] = useSearchParams();
  const id = params.get('id') ?? '';
  const linkCode = params.get('code') ?? '';
  const saved = (() => {
    try {
      const r = JSON.parse(sessionStorage.getItem('ambassador-apply') ?? 'null') as AmbassadorApplyResult | null;
      return r?.id === id ? r : null;
    } catch {
      return null;
    }
  })();
  const [code, setCode] = useState(linkCode);
  const [info, setInfo] = useState<AmbassadorApplyResult | null>(saved);
  const verify = useMutation({ mutationFn: (c: string) => api.post<{ status: string }>('/ambassadors/verify', { id, code: c }) });
  const resend = useMutation({ mutationFn: () => api.post<AmbassadorApplyResult>('/ambassadors/resend', { id }), onSuccess: (r) => setInfo(r) });
  const auto = useRef(false);
  useEffect(() => {
    if (linkCode && !auto.current) {
      auto.current = true;
      verify.mutate(linkCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkCode]);
  const done = verify.data;
  return (
    <PublicShell>
      <Card className="mx-auto mt-10 max-w-md p-6 sm:p-8">
        {done ? (
          <div className="text-center">
            {done.status === 'ACTIVE' ? <CheckCircle2 className="mx-auto size-12 text-success" /> : <Clock className="mx-auto size-12 text-warning" />}
            <p className="mt-4 font-display text-xl font-semibold">{done.status === 'ACTIVE' ? 'You are already approved' : 'Thank you: your application is in'}</p>
            <p className="mt-2 text-[14px] text-muted-foreground">
              {done.status === 'ACTIVE'
                ? 'Sign in with your email and password to see your link and earnings.'
                : 'Your email is confirmed. We review every application and will email you when you are approved, with your referral code and link.'}
            </p>
            <Button asChild className="mt-6 w-full" variant={done.status === 'ACTIVE' ? 'default' : 'outline'}>
              <Link to={done.status === 'ACTIVE' ? '/login' : '/ambassadors'}>{done.status === 'ACTIVE' ? 'Sign in' : 'Back to the programme'}</Link>
            </Button>
          </div>
        ) : (
          <>
            <Mail className="size-10 text-brand" />
            <p className="mt-4 font-display text-xl font-semibold">Check your email</p>
            <p className="mt-1.5 text-[14px] text-muted-foreground">We sent a 6-digit code{info?.email ? ` to ${info.email}` : ''}. Enter it below, or open the link in the email.</p>
            {info?.devCode && <p className="mt-3 rounded-lg bg-warning-soft/50 px-3 py-2 text-[12.5px] text-warning">Local development (no email set up): your code is {info.devCode}</p>}
            <form
              className="mt-5 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                verify.mutate(code.trim());
              }}
            >
              <Field label="Code" htmlFor="code" error={verify.error ? errorMessage(verify.error) : undefined}>
                <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="text-center font-mono text-[20px] tracking-[0.4em]" invalid={!!verify.error} />
              </Field>
              <Button type="submit" className="w-full" disabled={code.length !== 6} loading={verify.isPending}>
                Confirm
              </Button>
            </form>
            <div className="mt-4 text-center text-[13px] text-muted-foreground">
              {resend.isSuccess ? (
                'A new code is on its way.'
              ) : (
                <button type="button" className="font-medium text-brand hover:underline disabled:opacity-60" onClick={() => resend.mutate()} disabled={resend.isPending || !id}>
                  {resend.isPending ? <Loader2 className="inline size-3.5 animate-spin" /> : 'Send a new code'}
                </button>
              )}
              {resend.error && <p className="mt-1 text-danger">{resend.error instanceof ApiError ? resend.error.message : errorMessage(resend.error)}</p>}
            </div>
          </>
        )}
      </Card>
    </PublicShell>
  );
}

