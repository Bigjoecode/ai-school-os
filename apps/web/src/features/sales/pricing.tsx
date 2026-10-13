import type { AddonRow } from '@aischool/shared';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Check, CheckCircle2, GraduationCap, Info, MessageSquareText, Percent, Sparkles, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { naira, SIGNUP_PATH, useSalesPricing, type SalesPlan } from './config';

export const PRICE_NOTE = 'Prices are read live from the app. Please confirm current prices, VAT and any pilot terms with us before you budget.';

/**
 * The price list as plan cards (Standard "Most popular", Premium, Ultimate "Contact us"), each with
 * the price per student per term, the minimum, included SMS, the one-off setup fee and a feature
 * checklist. Used on /pricing, the brochure and the deck. `students` adds a per-term estimate.
 */
export function PlanCards({
  plans,
  className,
  dense,
  students,
  signupOpen = true,
  onTalk,
}: {
  plans: SalesPlan[];
  className?: string;
  dense?: boolean;
  students?: number;
  signupOpen?: boolean;
  onTalk?: (plan: SalesPlan) => void;
}) {
  return (
    <div className={cn('grid gap-5 md:grid-cols-3 print:grid-cols-3', className)}>
      {plans.map((p) => {
        const featured = !!p.badge;
        const billed = students != null ? Math.max(students, p.minStudents) : null;
        return (
          <div
            key={p.code}
            className={cn(
              'relative flex flex-col rounded-2xl border bg-card text-card-foreground print:break-inside-avoid',
              dense ? 'p-4' : 'p-5 sm:p-6',
              featured ? 'border-brand shadow-lg shadow-brand/10 ring-1 ring-brand/30' : 'border-border',
            )}
          >
            {p.badge && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-brand px-3 py-1 text-[11.5px] font-semibold text-brand-foreground shadow-sm">
                <Sparkles className="mr-1 inline size-3 -translate-y-px" />
                {p.badge}
              </span>
            )}
            <p className={cn('font-display font-semibold tracking-tight', dense ? 'text-[17px]' : 'text-[20px]')}>{p.name}</p>
            {p.summary && !dense && <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{p.summary}</p>}
            <div className="mt-4">
              {p.contactOnly ? (
                <>
                  <p className={cn('font-display font-semibold tracking-tight', dense ? 'text-[24px]' : 'text-[32px]')}>Contact us</p>
                  <p className="text-[12.5px] text-muted-foreground">A price for your school or group</p>
                </>
              ) : (
                <>
                  <p className={cn('font-display font-semibold tabular tracking-tight', dense ? 'text-[24px]' : 'text-[34px]')}>{naira(p.price)}</p>
                  <p className="text-[12.5px] text-muted-foreground">per student per term</p>
                  {billed != null && (
                    <p className="mt-1 text-[12.5px] font-medium tabular">
                      {naira(p.price * billed)} a term for {billed.toLocaleString('en-NG')} students
                    </p>
                  )}
                </>
              )}
            </div>

            <ul className={cn('mt-4 space-y-1.5 rounded-xl bg-muted/50 p-3', dense ? 'text-[12px]' : 'text-[12.5px]')}>
              {!p.contactOnly && (
                <li className="flex items-start gap-2">
                  <Users className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  Minimum {p.minStudents.toLocaleString('en-NG')} students
                </li>
              )}
              {p.smsUnitsPerStudent > 0 && (
                <li className="flex items-start gap-2">
                  <MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  {p.smsUnitsPerStudent} SMS units per student per term
                </li>
              )}
              <li className="flex items-start gap-2">
                <GraduationCap className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                {p.contactOnly
                  ? 'Dedicated onboarding and support'
                  : p.setupFee > 0
                    ? `One-off setup fee ${naira(p.setupFee)}, including onboarding${p.trainingDays ? ` and ${p.trainingDays} days of training` : ''}`
                    : 'No setup fee'}
              </li>
            </ul>

            {p.contactOnly ? (
              onTalk && (
                <Button className="mt-4 print:hidden" variant="outline" onClick={() => onTalk(p)}>
                  Talk to us <ArrowRight />
                </Button>
              )
            ) : (
              signupOpen && (
                <Button asChild className="mt-4 print:hidden" variant={featured ? 'default' : 'outline'}>
                  <Link to={`${SIGNUP_PATH}?plan=${p.id ?? p.code}${students ? `&students=${students}` : ''}`}>
                    Start free trial <ArrowRight />
                  </Link>
                </Button>
              )
            )}

            {(p.featureIntro || p.featureList.length > 0) && (
              <div className="mt-5 flex-1 border-t border-border pt-4">
                {p.featureIntro && <p className="mb-2 text-[12.5px] font-semibold">{p.featureIntro}</p>}
                <ul className={cn('space-y-1.5', dense ? 'text-[12px]' : 'text-[13px]', dense && 'columns-1')}>
                  {(dense ? p.featureList.slice(0, 8) : p.featureList).map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-success" strokeWidth={3} />
                      <span>{f}</span>
                    </li>
                  ))}
                  {dense && p.featureList.length > 8 && <li className="pl-5 text-muted-foreground">and {p.featureList.length - 8} more</li>}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** "10% off when you pay for 3 terms". */
export function SessionBanner({ pct, className }: { pct: number; className?: string }) {
  if (!pct) return null;
  return (
    <div className={cn('flex items-center justify-center gap-2 rounded-2xl border border-success/30 bg-success-soft px-4 py-3 text-center text-[14px] font-semibold text-success', className)}>
      <Percent className="size-4 shrink-0" />
      {pct}% off when you pay for 3 terms at once
    </div>
  );
}

/** The notes printed with the prices (VAT, support, payment charges), edited in the console. */
export function PricingNotes({ notes, className }: { notes: string[]; className?: string }) {
  if (!notes.length) return null;
  return (
    <div className={cn('rounded-2xl border border-warning/30 bg-warning-soft/50 p-4 sm:p-5', className)}>
      <p className="flex items-center gap-2 text-[14px] font-semibold">
        <Info className="size-4 text-warning" /> Important notes
      </p>
      <ul className="mt-2 space-y-1.5 text-[13px] text-muted-foreground">
        {notes.map((n) => (
          <li key={n} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-warning" />
            <span>{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const addonPrice = (a: Pick<AddonRow, 'pricing' | 'priceKobo' | 'unitLabel'>) =>
  a.pricing === 'QUOTE' || !a.priceKobo ? 'On request' : `${naira(a.priceKobo / 100)}${a.unitLabel ? ` ${a.unitLabel}` : ''}`;

/** The add-on catalogue as a price box. */
export function AddonsBox({ addons, className }: { addons: AddonRow[]; className?: string }) {
  if (!addons.length) return null;
  return (
    <div className={cn('rounded-2xl border border-border bg-card p-4 sm:p-5', className)}>
      <p className="text-[14px] font-semibold">Add-ons</p>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">Extras for any plan, added to your school’s invoice. Items “on request” are priced for your school.</p>
      <dl className="mt-3 divide-y divide-border text-[13px]">
        {addons.map((a) => (
          <div key={a.id} className="flex items-start justify-between gap-3 py-2">
            <dt>
              <span className="font-medium">{a.name}</span>
              {a.description && <span className="block text-[12px] text-muted-foreground">{a.description}</span>}
            </dt>
            <dd className="shrink-0 text-right font-medium tabular">{addonPrice(a)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** "Talk to us": the Ultimate / custom-price lead form; goes to the operator's console. */
export function TalkToUsDialog({ plan, onOpenChange }: { plan: SalesPlan | null; onOpenChange: (open: boolean) => void }) {
  const [form, setForm] = useState({ schoolName: '', contactName: '', email: '', phone: '', students: '', branches: '1', message: '', website: '' });
  const [done, setDone] = useState(false);
  const send = useMutation({
    mutationFn: () => api.post('/signup/enquiry', { ...form, planId: plan?.id ?? null, students: Number(form.students) || 0, branches: Number(form.branches) || 1 }),
    onSuccess: () => setDone(true),
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Dialog
      open={!!plan}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setDone(false);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Talk to us about {plan?.name ?? 'pricing'}</DialogTitle>
          <DialogDescription>Tell us about your school or group and we will call or email you with a price.</DialogDescription>
        </DialogHeader>
        {done ? (
          <DialogBody>
            <p className="flex items-start gap-2 text-[14px]">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> Thank you. We have your details and will be in touch within two working days.
            </p>
          </DialogBody>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send.mutate();
            }}
          >
            <DialogBody className="grid gap-3 sm:grid-cols-2">
              <Field label="School or group" htmlFor="tt-school" className="sm:col-span-2">
                <Input id="tt-school" required value={form.schoolName} onChange={set('schoolName')} autoComplete="organization" />
              </Field>
              <Field label="Your name" htmlFor="tt-name">
                <Input id="tt-name" required value={form.contactName} onChange={set('contactName')} autoComplete="name" />
              </Field>
              <Field label="Phone" htmlFor="tt-phone">
                <Input id="tt-phone" required type="tel" inputMode="tel" placeholder="0803 123 4567" value={form.phone} onChange={set('phone')} autoComplete="tel" />
              </Field>
              <Field label="Email" htmlFor="tt-email" className="sm:col-span-2">
                <Input id="tt-email" required type="email" value={form.email} onChange={set('email')} autoComplete="email" />
              </Field>
              <Field label="Students (roughly)" htmlFor="tt-students">
                <Input id="tt-students" required type="number" inputMode="numeric" min={1} value={form.students} onChange={set('students')} />
              </Field>
              <Field label="Schools or branches" htmlFor="tt-branches">
                <Input id="tt-branches" type="number" inputMode="numeric" min={1} value={form.branches} onChange={set('branches')} />
              </Field>
              <Field label="Anything we should know?" htmlFor="tt-msg" className="sm:col-span-2">
                <Textarea id="tt-msg" rows={3} value={form.message} onChange={set('message')} />
              </Field>
              <input type="text" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={form.website} onChange={set('website')} />
              {send.error && <p className="text-[13px] text-danger sm:col-span-2">{errorMessage(send.error)}</p>}
            </DialogBody>
            <DialogFooter>
              <Button type="submit" loading={send.isPending}>
                Send <ArrowRight />
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The brochure / deck block: live plan cards with the session discount. */
export function PricingCards({ className, dense }: { className?: string; dense?: boolean }) {
  const { plans, sessionDiscountPct } = useSalesPricing();
  return (
    <div className={className}>
      <PlanCards plans={plans} dense={dense} signupOpen={false} />
      <SessionBanner pct={sessionDiscountPct} className="mt-4" />
    </div>
  );
}
