import {
  MODULE_FEATURE_KEYS,
  MODULE_FEATURES,
  NIGERIAN_STATES,
  priceQuote,
  SCHOOL_TYPE_LABELS,
  SCHOOL_TYPES,
  signupSchema,
  type BillingCycle,
  type ReferralCodeCheck,
  type SignupConfig,
  type SignupResult,
  type SignupVerifyResult,
} from '@aischool/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, CheckCircle2, Clock, Eye, EyeOff, Gift, HeartHandshake, Loader2, Mail, Minus, X, XCircle } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { BrandMark } from '@/components/layout/brand';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, inputClass } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError, errorMessage } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { forgetReferral, rememberReferral, storedReferral } from '../ambassadors/referral';
import { LegalLinks } from '../legal/legal-links';

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const useConfig = () => useQuery({ queryKey: ['signup', 'config'], queryFn: ({ signal }) => api.get<SignupConfig>('/signup/config', undefined, signal), staleTime: 60_000 });

export function PublicShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-hidden bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-40 size-96 rounded-full bg-brand/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 size-96 rounded-full bg-success/10 blur-3xl" />
      </div>
      <header className={cn('relative mx-auto flex w-full items-center justify-between px-4 py-4 sm:px-6', wide ? 'max-w-6xl' : 'max-w-2xl')}>
        <Link to="/pricing" className="flex items-center gap-2">
          <BrandMark />
          <span className="font-display text-[16px] font-semibold tracking-tight">
            AI School <span className="text-ai-gradient">OS</span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/login">Sign in</Link>
          </Button>
          <ThemeToggle />
        </div>
      </header>
      <main className={cn('relative mx-auto w-full flex-1 px-4 pb-10 sm:px-6', wide ? 'max-w-6xl' : 'max-w-2xl')}>{children}</main>
      <footer className="relative pb-6 text-center text-[12px] text-muted-foreground">
        <LegalLinks />
      </footer>
    </div>
  );
}

// ------------------------------------------------------------------ pricing

export function PricingPage() {
  useDocumentTitle('Plans and pricing');
  const q = useConfig();
  const [students, setStudents] = useState(200);
  const [cycle, setCycle] = useState<BillingCycle>('TERM');
  const c = q.data;
  return (
    <PublicShell wide>
      <div className="mx-auto max-w-2xl pt-6 text-center sm:pt-10">
        <h1 className="font-display text-[30px] font-semibold leading-tight tracking-tight sm:text-[40px]">Simple pricing, per student per term</h1>
        <p className="mt-3 text-[15px] text-muted-foreground">
          {c ? `Start with a free ${c.trialDays}-day trial: no card needed. ` : ''}Pay by card, bank transfer or USSD through Paystack, for a term or a whole session.
        </p>
      </div>

      <Card className="mx-auto mt-8 flex max-w-2xl flex-col gap-4 p-4 sm:flex-row sm:items-end sm:p-5">
        <Field label="How many students?" htmlFor="est" className="flex-1">
          <Input id="est" type="number" inputMode="numeric" min={1} max={20000} value={students} onChange={(e) => setStudents(Math.max(0, Number(e.target.value) || 0))} />
        </Field>
        <div className="grid flex-1 grid-cols-2 gap-1 rounded-xl border border-border bg-muted/40 p-1" role="radiogroup" aria-label="Pay for">
          {(['TERM', 'SESSION'] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={cycle === k} onClick={() => setCycle(k)} className={cn('rounded-lg px-3 py-2 text-[13px] font-medium transition-colors', cycle === k ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {k === 'TERM' ? 'Per term' : `Per session${c?.sessionDiscountPct ? ` (−${c.sessionDiscountPct}%)` : ''}`}
            </button>
          ))}
        </div>
      </Card>

      {q.isLoading ? (
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-96 rounded-2xl" />
          ))}
        </div>
      ) : q.error || !c ? (
        <p className="mt-8 text-center text-[14px] text-danger">{errorMessage(q.error)}</p>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {c.plans.map((p, i) => {
            const quote = priceQuote(p, students, cycle, c);
            const tooMany = p.maxStudents != null && students > p.maxStudents;
            return (
              <Card key={p.id} className={cn('flex flex-col p-5', i === 1 && 'border-brand/50 ring-1 ring-brand/30')}>
                <p className="font-display text-[20px] font-semibold tracking-tight">{p.name}</p>
                {p.description && <p className="mt-1 text-[13px] text-muted-foreground">{p.description}</p>}
                <p className="mt-4 font-display text-[30px] font-semibold tabular tracking-tight">
                  {naira(quote.unitKobo)}
                  <span className="text-[13px] font-normal text-muted-foreground"> / student / term</span>
                </p>
                <div className="mt-3 rounded-xl bg-muted/50 p-3 text-[13px]">
                  {tooMany ? (
                    <p className="text-muted-foreground">Up to {p.maxStudents!.toLocaleString('en-NG')} students: choose a larger plan.</p>
                  ) : (
                    <>
                      <p className="font-semibold tabular">
                        {naira(quote.totalKobo)} {cycle === 'SESSION' ? 'per session' : 'per term'}
                      </p>
                      <p className="text-muted-foreground">
                        {quote.billedStudents.toLocaleString('en-NG')} students × {naira(quote.unitKobo)}
                        {quote.terms > 1 ? ' × 3 terms' : ''}
                        {quote.discountPct ? `, less ${quote.discountPct}%` : ''}
                        {quote.billedStudents > students ? ` (minimum ${c.minBilledStudents})` : ''}
                      </p>
                    </>
                  )}
                </div>
                <ul className="mt-4 flex-1 space-y-1.5 text-[13px]">
                  {MODULE_FEATURE_KEYS.map((k) => {
                    const on = p.features.length === 0 || p.features.includes(k);
                    return (
                      <li key={k} className={cn('flex items-start gap-2', !on && 'text-muted-foreground')}>
                        {on ? <Check className="mt-0.5 size-3.5 shrink-0 text-success" strokeWidth={3} /> : <Minus className="mt-0.5 size-3.5 shrink-0" />}
                        {MODULE_FEATURES[k].label}
                      </li>
                    );
                  })}
                </ul>
                {c.enabled && (
                  <Button asChild className="mt-5" variant={i === 1 ? 'default' : 'outline'}>
                    <Link to={`/signup?plan=${p.id}&students=${students}`}>
                      Start free trial <ArrowRight />
                    </Link>
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}
      {c && (
        <div className="mx-auto mt-8 max-w-2xl space-y-2 text-[13px] text-muted-foreground">
          <p>
            <strong className="text-foreground">How billing works.</strong> You pay for the active students on your invoice date (at least {c.minBilledStudents}). Students you add during a term are not charged
            until your next invoice. Upgrades start at once with a top-up for the rest of the period; downgrades start from your next period.
          </p>
          <p>If a payment is late, everything keeps working for a grace period; after that the school becomes read-only until it pays. We never delete your data because of billing.</p>
          {!c.enabled && <p>Self-serve sign-up is not open at the moment: contact us and we will set your school up.</p>}
        </div>
      )}
    </PublicShell>
  );
}

// ------------------------------------------------------------------ sign-up

type SignupValues = z.input<typeof signupSchema>;

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** /pilot: the same sign-up form as an application for the free pilot programme. */
export function PilotPage() {
  return <SignupPage pilotEntry />;
}

export default function SignupPage({ pilotEntry = false }: { pilotEntry?: boolean }) {
  const q = useConfig();
  const [params] = useSearchParams();
  const [pilot, setPilot] = useState(pilotEntry || params.get('pilot') === '1');
  useDocumentTitle(pilot ? 'Apply for the free pilot' : 'Start your free trial');
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  // An ambassador's code: from ?ref= (captured at boot), remembered for 90 days, or typed in.
  const [refCode, setRefCode] = useState<string>(() => (params.get('ref') ?? storedReferral() ?? '').trim().toUpperCase());
  const [refDraft, setRefDraft] = useState('');
  const [refOpen, setRefOpen] = useState(false);
  const refCheck = useQuery({
    queryKey: ['ambassadors', 'ref', refCode],
    queryFn: ({ signal }) => api.get<ReferralCodeCheck>(`/ambassadors/ref/${encodeURIComponent(refCode)}`, undefined, signal),
    enabled: /^[A-Z0-9]{3,12}$/.test(refCode),
    staleTime: 5 * 60_000,
    meta: { silent: true },
  });
  const referral = refCheck.data?.valid ? refCheck.data : null;
  const form = useForm<SignupValues, unknown, z.output<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      schoolName: '',
      schoolType: 'COMBINED',
      state: 'Lagos',
      lga: '',
      approxStudents: Number(params.get('students')) || ('' as unknown as number),
      slug: '',
      planId: params.get('plan') ?? undefined,
      admin: { firstName: '', lastName: '', email: '', phone: '', password: '' },
      acceptTerms: false as unknown as true,
      website: '',
      pilotReason: '',
    },
  });
  const { register, handleSubmit, formState, watch, setValue, setError } = form;
  const name = watch('schoolName');
  const slug = watch('slug');
  useEffect(() => {
    if (!slugTouched) setValue('slug', slugify(name ?? ''));
  }, [name, slugTouched, setValue]);
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(slug ?? ''), 400);
    return () => window.clearTimeout(t);
  }, [slug]);
  const check = useQuery({
    queryKey: ['signup', 'slug', debounced],
    queryFn: ({ signal }) => api.get<{ available: boolean; message: string }>('/signup/slug', { slug: debounced }, signal),
    enabled: debounced.length >= 3,
    meta: { silent: true },
  });

  const start = useMutation({
    mutationFn: (v: z.output<typeof signupSchema>) => api.post<SignupResult>('/signup', v),
    onSuccess: (r) => {
      forgetReferral();
      try {
        sessionStorage.setItem('signup', JSON.stringify(r));
      } catch {
        /* private mode: the code still arrives by email */
      }
      navigate(`/signup/verify?id=${encodeURIComponent(r.id)}`, { state: r });
    },
    onError: (err) => {
      if (!applyServerErrors(err, setError)) setFormError(errorMessage(err));
    },
  });
  const onSubmit = handleSubmit((v) => {
    setFormError(null);
    if (pilot && (v.pilotReason ?? '').trim().length < 10) {
      setError('pilotReason', { message: 'A sentence or two, please' });
      return;
    }
    start.mutate({ ...v, pilot: pilot || undefined, pilotReason: pilot ? v.pilotReason : undefined, referralCode: referral?.code });
  });

  const c = q.data;
  if (q.isLoading) {
    return (
      <PublicShell>
        <Skeleton className="mt-8 h-[600px] rounded-2xl" />
      </PublicShell>
    );
  }
  const pilotOpen = !!c?.pilot?.open;
  if (pilot && c && !pilotOpen) {
    return (
      <PublicShell>
        <Card className="mt-10 p-8 text-center">
          <Gift className="mx-auto size-10 text-muted-foreground" />
          <p className="mt-3 font-display text-xl font-semibold">{c.pilot.placesLeft === 0 ? 'The free pilot is full' : 'Pilot applications are closed'}</p>
          <p className="mt-2 text-[14px] text-muted-foreground">
            Thank you for your interest. {c.enabled ? `You can still start a free ${c.trialDays}-day trial.` : 'Contact us and we will tell you when places open.'}
          </p>
          {c.enabled && (
            <Button className="mt-5" onClick={() => setPilot(false)}>
              Start a free trial instead <ArrowRight />
            </Button>
          )}
        </Card>
      </PublicShell>
    );
  }
  if (!c?.enabled && !(pilot && pilotOpen)) {
    return (
      <PublicShell>
        <Card className="mt-10 p-8 text-center">
          <p className="font-display text-xl font-semibold">Sign-up is not open right now</p>
          <p className="mt-2 text-[14px] text-muted-foreground">Contact us and we will set your school up. If your school already uses AI School OS, sign in instead.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {pilotOpen && (
              <Button onClick={() => setPilot(true)}>
                Apply for the free pilot <ArrowRight />
              </Button>
            )}
            <Button asChild variant={pilotOpen ? 'outline' : 'default'}>
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        </Card>
      </PublicShell>
    );
  }
  const err = formState.errors;
  return (
    <PublicShell>
      <div className="pt-4 sm:pt-8">
        <h1 className="font-display text-[28px] font-semibold tracking-tight">{pilot ? 'Apply for the free pilot' : `Start your free ${c.trialDays}-day trial`}</h1>
        <p className="mt-1.5 text-[14px] text-muted-foreground">
          {pilot ? `${c.pilot.termsText}. ${c.pilot.detail} We review every application and email you within a few working days.` : 'Set your school up in a few minutes. No card needed; choose a plan any time before the trial ends.'}
        </p>
      </div>
      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-5">
        {pilotOpen && (
          <Card className={cn('space-y-3 p-4 sm:p-5', pilot && 'border-success/40 ring-1 ring-success/20')}>
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 size-4 accent-[hsl(var(--success))]" checked={pilot} onChange={(e) => setPilot(e.target.checked)} />
              <span>
                <span className="flex items-center gap-1.5 text-[14.5px] font-semibold">
                  <Gift className="size-4 text-success" /> Apply for the free pilot
                </span>
                <span className="block text-[13px] text-muted-foreground">{c.pilot.termsText}. Pilot schools pay nothing until the end of next term; we approve each school.</span>
              </span>
            </label>
            {pilot && (
              <Field label="Why do you want to join the pilot?" htmlFor="pilotReason" error={err.pilotReason?.message} hint="A sentence or two: what you hope to improve this term.">
                <Textarea id="pilotReason" rows={3} maxLength={500} invalid={!!err.pilotReason} {...register('pilotReason')} />
              </Field>
            )}
          </Card>
        )}
        <Card className="space-y-4 p-4 sm:p-6">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Your school</p>
          <Field label="School name" htmlFor="schoolName" error={err.schoolName?.message}>
            <Input id="schoolName" autoComplete="organization" invalid={!!err.schoolName} {...register('schoolName')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type of school" htmlFor="schoolType" error={err.schoolType?.message}>
              <select id="schoolType" className={inputClass} {...register('schoolType')}>
                {SCHOOL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SCHOOL_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Roughly how many students?" htmlFor="approxStudents" error={err.approxStudents?.message}>
              <Input id="approxStudents" type="number" inputMode="numeric" min={1} invalid={!!err.approxStudents} {...register('approxStudents')} />
            </Field>
            <Field label="State" htmlFor="state" error={err.state?.message}>
              <select id="state" className={inputClass} {...register('state')}>
                {NIGERIAN_STATES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Local government area" htmlFor="lga" error={err.lga?.message}>
              <Input id="lga" placeholder="e.g. Ikeja" invalid={!!err.lga} {...register('lga')} />
            </Field>
          </div>
          <Field
            label="Portal address"
            htmlFor="slug"
            error={err.slug?.message}
            hint={
              debounced.length >= 3 && check.data ? (
                <span className={cn('inline-flex items-center gap-1', check.data.available ? 'text-success' : 'text-danger')}>
                  {check.data.available ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
                  {check.data.available ? `${slug} is available. Staff and parents use it to sign in to your school.` : check.data.message}
                </span>
              ) : (
                'Your school’s short ID: lowercase letters, numbers and dashes'
              )
            }
          >
            <Input
              id="slug"
              autoCapitalize="none"
              spellCheck={false}
              invalid={!!err.slug || check.data?.available === false}
              {...register('slug', { onChange: () => setSlugTouched(true), setValueAs: (v: string) => v.trim().toLowerCase() })}
            />
          </Field>
          {c.plans.length > 0 && (
            <Field label="Plan you’re interested in" htmlFor="planId" hint="You can change this during the trial.">
              <select id="planId" className={inputClass} {...register('planId')}>
                {c.plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}: {naira(priceQuote(p, 0, 'TERM', { minBilledStudents: 0, sessionDiscountPct: 0 }).unitKobo)} per student per term
                  </option>
                ))}
              </select>
            </Field>
          )}
        </Card>

        <Card className="space-y-4 p-4 sm:p-6">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">You (the school administrator)</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="firstName" error={err.admin?.firstName?.message}>
              <Input id="firstName" autoComplete="given-name" invalid={!!err.admin?.firstName} {...register('admin.firstName')} />
            </Field>
            <Field label="Last name" htmlFor="lastName" error={err.admin?.lastName?.message}>
              <Input id="lastName" autoComplete="family-name" invalid={!!err.admin?.lastName} {...register('admin.lastName')} />
            </Field>
            <Field label="Email" htmlFor="email" error={err.admin?.email?.message} hint="We send a 6-digit code here">
              <Input id="email" type="email" autoComplete="email" invalid={!!err.admin?.email} {...register('admin.email')} />
            </Field>
            <Field label="Phone" htmlFor="phone" error={err.admin?.phone?.message}>
              <Input id="phone" type="tel" autoComplete="tel" placeholder="0803 123 4567" invalid={!!err.admin?.phone} {...register('admin.phone')} />
            </Field>
          </div>
          <Field label="Password" htmlFor="password" error={err.admin?.password?.message} hint="At least 10 characters">
            <div className="relative">
              <Input id="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" className="pr-10" invalid={!!err.admin?.password} {...register('admin.password')} />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </Field>
          {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
          <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
            <label htmlFor="website">Website</label>
            <input id="website" tabIndex={-1} autoComplete="off" {...register('website')} />
          </div>
          <label className="flex items-start gap-2.5 text-[13px]">
            <input type="checkbox" className="mt-0.5 size-4 accent-[hsl(var(--brand))]" {...register('acceptTerms')} />
            <span>
              I agree to the{' '}
              <Link to="/legal/terms" target="_blank" className="text-brand underline">
                terms of service
              </Link>{' '}
              and{' '}
              <Link to="/legal/dpa" target="_blank" className="text-brand underline">
                data processing agreement
              </Link>{' '}
              on behalf of the school.
            </span>
          </label>
          {err.acceptTerms && <p className="text-[12px] font-medium text-danger">{err.acceptTerms.message}</p>}
        </Card>
        {referral ? (
          <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success-soft/40 px-4 py-3 text-[13.5px]">
            <HeartHandshake className="size-5 shrink-0 text-success" aria-hidden />
            <p className="min-w-0 flex-1">
              Referred by <strong>{referral.firstName}</strong> <span className="text-muted-foreground">(code {referral.code})</span>
            </p>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:text-foreground"
              aria-label="Remove the referral code"
              onClick={() => {
                forgetReferral();
                setRefCode('');
              }}
            >
              <X className="size-4" />
            </button>
          </div>
        ) : refOpen ? (
          <Card className="p-4">
            <Field
              label="Referral code"
              htmlFor="referralCode"
              optional
              hint={refCode && refCheck.data && !refCheck.data.valid ? <span className="text-danger">We don’t recognise that code. Check it, or leave it empty.</span> : 'From the ambassador who told you about AI School OS'}
            >
              <div className="flex gap-2">
                <Input id="referralCode" autoCapitalize="characters" spellCheck={false} maxLength={12} value={refDraft} onChange={(e) => setRefDraft(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())} placeholder="e.g. ADA25" />
                <Button
                  type="button"
                  variant="outline"
                  disabled={refDraft.length < 3}
                  loading={refCheck.isFetching}
                  onClick={() => {
                    setRefCode(refDraft);
                    rememberReferral(refDraft);
                  }}
                >
                  Apply
                </Button>
              </div>
            </Field>
          </Card>
        ) : (
          <button type="button" className="text-[13px] font-medium text-brand hover:underline" onClick={() => setRefOpen(true)}>
            Have a referral code?
          </button>
        )}
        {formError && (
          <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft/40 px-4 py-3 text-[13.5px] text-danger">
            {formError}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={start.isPending}>
          {pilot ? 'Send my pilot application' : 'Create my school'} <ArrowRight />
        </Button>
        <p className="text-center text-[13px] text-muted-foreground">
          Already on AI School OS?{' '}
          <Link to="/login" className="font-medium text-brand hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </PublicShell>
  );
}

// ------------------------------------------------------------------ verify

export function SignupVerifyPage() {
  useDocumentTitle('Confirm your email');
  const [params] = useSearchParams();
  const id = params.get('id') ?? '';
  const linkCode = params.get('code') ?? '';
  const saved = (() => {
    try {
      const r = JSON.parse(sessionStorage.getItem('signup') ?? 'null') as SignupResult | null;
      return r?.id === id ? r : null;
    } catch {
      return null;
    }
  })();
  const [code, setCode] = useState(linkCode);
  const [info, setInfo] = useState<SignupResult | null>(saved);
  const verify = useMutation({ mutationFn: (c: string) => api.post<SignupVerifyResult>('/signup/verify', { id, code: c }) });
  const resend = useMutation({
    mutationFn: () => api.post<SignupResult>('/signup/resend', { id }),
    onSuccess: (r) => setInfo(r),
  });
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
          done.status === 'APPROVED' ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto size-12 text-success" />
              <p className="mt-4 font-display text-xl font-semibold">{done.schoolName} is ready</p>
              <p className="mt-2 text-[14px] text-muted-foreground">
                Your free trial has started. Sign in with your email and password; your school’s portal address is <strong className="text-foreground">{done.slug}</strong>.
              </p>
              <Button asChild className="mt-6 w-full">
                <Link to={`/login?school=${encodeURIComponent(done.slug)}`}>
                  Sign in and set up <ArrowRight />
                </Link>
              </Button>
            </div>
          ) : (
            <div className="text-center">
              <Clock className="mx-auto size-12 text-warning" />
              <p className="mt-4 font-display text-xl font-semibold">{done.pilot ? 'Thank you: your pilot application is in' : 'Thank you: we’re checking your details'}</p>
              <p className="mt-2 text-[14px] text-muted-foreground">
                {done.pilot
                  ? `Your email is confirmed. We review every pilot application and will email you when ${done.schoolName} is approved (as a pilot school, or on a normal free trial if the places have gone).`
                  : `Your email is confirmed. Our team reviews new schools, usually within one working day, and we will email you as soon as ${done.schoolName} is ready.`}
              </p>
            </div>
          )
        ) : (
          <>
            <Mail className="size-10 text-brand" />
            <p className="mt-4 font-display text-xl font-semibold">Check your email</p>
            <p className="mt-1.5 text-[14px] text-muted-foreground">
              We sent a 6-digit code{info?.email ? ` to ${info.email}` : ''}. Enter it below, or open the link in the email.
            </p>
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

