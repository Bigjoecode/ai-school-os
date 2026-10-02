import { PRODUCT_PERIOD_LABELS, type FamilyChild, type FamilyOrderRow, type FamilySubscriptionRow, type ProductRow, type StudentAccess } from '@aischool/shared';
import { AlertTriangle, ArrowRight, Check, CheckCircle2, CreditCard, GraduationCap, Info, MessageCircleQuestion, Receipt, RefreshCw, School, ShoppingBag, Sparkles, Trophy, Users, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';
import { cn, initialsFromName } from '@/lib/utils';
import { AccessMeter, naira, SectionTitle } from '../learning/components';
import { useCheckout, useFamily, useQuote, useRenewNow, useUpdateSubscription, useVerify, type CheckoutBody } from './api';

const SOURCE: Record<StudentAccess['entitlements'][number]['source'], { label: string; variant: 'secondary' | 'brand' | 'info' | 'success' }> = {
  INCLUDED: { label: 'Included', variant: 'secondary' },
  PARENT: { label: 'Paid by you', variant: 'brand' },
  SCHOOL: { label: 'Sponsored by school', variant: 'info' },
  PLATFORM: { label: 'Complimentary', variant: 'success' },
};

/** One row per entitlement, keeping the one that lasts longest. */
function uniqueEntitlements(list: StudentAccess['entitlements']) {
  const by = new Map<string, StudentAccess['entitlements'][number]>();
  for (const e of list) {
    const prev = by.get(e.key);
    if (!prev || (prev.endsAt && (!e.endsAt || e.endsAt > prev.endsAt))) by.set(e.key, e);
  }
  return [...by.values()];
}

const STATUS: Record<FamilySubscriptionRow['status'], { label: string; variant: 'success' | 'warning' | 'danger' | 'secondary' | 'info' }> = {
  ACTIVE: { label: 'Active', variant: 'success' },
  PENDING: { label: 'Awaiting payment', variant: 'info' },
  PAST_DUE: { label: 'Payment due', variant: 'warning' },
  CANCELLED: { label: 'Cancelled', variant: 'secondary' },
  EXPIRED: { label: 'Expired', variant: 'secondary' },
};

export default function FamilyPage() {
  const q = useFamily();
  const d = q.data;
  const canAsk = useCan('ai.use');
  const [buying, setBuying] = useState<ProductRow | null>(null);
  const products = (d?.products ?? []).filter((p) => p.isActive && p.isPublic).sort((a, b) => a.sortOrder - b.sortOrder || a.priceKobo - b.priceKobo);

  return (
    <Page className="max-w-6xl">
      <PageHeader
        title="My family"
        description="Your children’s AI learning and exam preparation — what they have, how they’re doing, and what you can add."
        actions={
          canAsk ? (
            <Button asChild variant="outline">
              <Link to="/ask">
                <MessageCircleQuestion /> Ask the school
              </Link>
            </Button>
          ) : undefined
        }
      />
      <CheckoutReturn />
      {q.error && !d ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-72 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-10">
          <section aria-label="Children">
            {d.children.length === 0 ? (
              <Card>
                <EmptyState icon={Users} title="No children linked yet" description="Ask your child’s school to link your account to your child’s record. They’ll appear here straight away." />
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
                {d.children.map((c) => (
                  <ChildCard key={c.id} child={c} />
                ))}
              </div>
            )}
          </section>

          <section aria-label="Add learning" id="shop">
            <SectionTitle icon={ShoppingBag} title="Add AI learning or exam prep" />
            {!d.onlinePayment && (
              <p className="mb-4 flex items-start gap-2 rounded-xl border border-border bg-muted/60 px-4 py-3 text-[13px] text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> Online payment isn’t available yet. You can browse what’s on offer — buying will open here soon.
              </p>
            )}
            {products.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Nothing on offer right now.</p>
            ) : (
              <div className="space-y-6">
                {(['AI', 'EXAM'] as const).map((kind) => {
                  const list = products.filter((p) => p.kind === kind);
                  if (list.length === 0) return null;
                  return (
                    <div key={kind}>
                      <p className="mb-2.5 text-[12.5px] font-medium text-muted-foreground">{kind === 'AI' ? 'AI learning companion' : 'Exam preparation'}</p>
                      <div className={cn('grid gap-4 sm:grid-cols-2 [&>*]:min-w-0', kind === 'AI' ? 'lg:grid-cols-3' : 'lg:grid-cols-4')}>
                        {list.map((p) => (
                          <ProductCard key={p.id} product={p} disabled={!d.onlinePayment || d.children.length === 0} onBuy={() => setBuying(p)} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section aria-label="Subscriptions">
            <SectionTitle icon={RefreshCw} title="Subscriptions" />
            {d.subscriptions.length === 0 ? (
              <Card>
                <EmptyState icon={RefreshCw} title="No subscriptions yet" description="Anything you buy for your children appears here, with renewal dates and controls." compact />
              </Card>
            ) : (
              <Card className="divide-y divide-border">
                {d.subscriptions.map((s) => (
                  <SubscriptionRow key={s.id} s={s} />
                ))}
              </Card>
            )}
          </section>

          <section aria-label="Payment history">
            <SectionTitle icon={Receipt} title="Payment history" />
            {d.orders.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No payments yet.</p>
            ) : (
              <Card className="divide-y divide-border">
                {d.orders.map((o) => (
                  <OrderRow key={o.id} o={o} />
                ))}
              </Card>
            )}
          </section>
        </div>
      )}
      {buying && d && <BuyDialog product={buying} kids={d.children} onClose={() => setBuying(null)} />}
    </Page>
  );
}

// ------------------------------------------------------------------ checkout return

function CheckoutReturn() {
  const [params, setParams] = useSearchParams();
  const verify = useVerify();
  const [result, setResult] = useState<'PAID' | 'FAILED' | 'PENDING' | 'ERROR' | null>(null);
  const done = useRef(false);
  const reference = params.get('reference') ?? params.get('trxref');
  const success = params.get('success');

  useEffect(() => {
    if (done.current) return;
    if (success === '1') {
      done.current = true;
      setResult('PAID');
      setParams({}, { replace: true });
      return;
    }
    if (params.get('checkout') !== '1' || !reference) return;
    done.current = true;
    verify.mutate(reference, {
      onSuccess: (r) => setResult(r.status === 'PAID' ? 'PAID' : r.status === 'PENDING' ? 'PENDING' : 'FAILED'),
      onError: () => setResult('ERROR'),
    });
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (verify.isPending) {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-[13.5px] shadow-soft" role="status">
        <RefreshCw className="size-4 animate-spin text-brand" aria-hidden /> Confirming your payment…
      </div>
    );
  }
  if (!result) return null;
  const tone = {
    PAID: { icon: CheckCircle2, cls: 'border-success/30 bg-success-soft text-success', title: 'Payment received — thank you!', body: 'Your child’s new learning is switched on now.' },
    PENDING: { icon: RefreshCw, cls: 'border-info/30 bg-info-soft text-info', title: 'Payment still processing', body: 'We’ll switch it on as soon as the bank confirms. This page updates when you come back.' },
    FAILED: { icon: XCircle, cls: 'border-danger/30 bg-danger-soft text-danger', title: 'That payment didn’t go through', body: 'You haven’t been charged. You can try again below.' },
    ERROR: { icon: AlertTriangle, cls: 'border-warning/30 bg-warning-soft text-warning', title: 'We couldn’t confirm that payment', body: errorMessage(verify.error, 'Please refresh in a moment.') },
  }[result];
  return (
    <div className={cn('mb-6 flex items-start gap-3 rounded-2xl border px-4 py-3', tone.cls)} role="status">
      <tone.icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold">{tone.title}</p>
        <p className="text-[13px] text-foreground/75">{tone.body}</p>
      </div>
      <button type="button" onClick={() => setResult(null)} className="shrink-0 text-[12px] font-medium opacity-70 hover:opacity-100">
        Dismiss
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ children

function ChildCard({ child }: { child: FamilyChild }) {
  const ents = uniqueEntitlements(child.access.entitlements);
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start gap-3">
        <Avatar name={child.name} initials={initialsFromName(child.name)} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[16px] font-semibold tracking-tight">{child.name}</p>
          <p className="flex items-center gap-1.5 truncate text-[12.5px] text-muted-foreground">
            <School className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {child.school.name}
              {child.classArm ? ` · ${child.classArm}` : ''}
            </span>
          </p>
        </div>
      </div>
      <div className="mt-4 rounded-xl bg-muted/50 p-4">
        <AccessMeter access={child.access} compact title="AI learning this term" />
      </div>
      {child.access.exams.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Trophy className="size-3.5 text-muted-foreground" aria-hidden />
          {child.access.exams.map((e) => (
            <Badge key={e} variant="warning">
              {e} Prep
            </Badge>
          ))}
        </div>
      )}
      <ul className="mt-4 space-y-1.5" aria-label="What’s included">
        {ents.map((e) => (
          <li key={e.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px]">
            <span className="flex min-w-0 items-center gap-2">
              <Check className="size-3.5 shrink-0 text-success" aria-hidden />
              <span className="truncate">{e.label}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {e.endsAt && <span className="text-[11.5px] text-muted-foreground">until {formatDate(e.endsAt, { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
              <Badge variant={SOURCE[e.source].variant}>{SOURCE[e.source].label}</Badge>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-5">
        <Button asChild variant="outline" className="w-full">
          <Link to={`/family/children/${child.id}`}>
            See {child.name.split(' ')[0]}’s progress <ArrowRight />
          </Link>
        </Button>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ shop

function ProductCard({ product, onBuy, disabled }: { product: ProductRow; onBuy: () => void; disabled: boolean }) {
  const featured = product.code === 'AI_PLUS' || product.code === 'AI_FAMILY';
  return (
    <Card className={cn('relative flex flex-col overflow-hidden p-5', featured && 'border-ai-2/35')}>
      {featured && <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-ai-gradient opacity-10 blur-2xl" />}
      <div className="relative flex items-start justify-between gap-2">
        <div className={cn('grid size-10 place-items-center rounded-xl [&_svg]:size-5', product.kind === 'AI' ? 'bg-ai-gradient text-white' : 'bg-warning-soft text-warning')}>
          {product.kind === 'AI' ? <Sparkles aria-hidden /> : <GraduationCap aria-hidden />}
        </div>
        {product.maxChildren > 1 && (
          <Badge variant="brand">
            <Users /> Up to {product.maxChildren} children
          </Badge>
        )}
      </div>
      <p className="relative mt-3 font-display text-[16px] font-semibold tracking-tight">{product.name}</p>
      {product.tagline && <p className="relative mt-0.5 text-[13px] text-muted-foreground">{product.tagline}</p>}
      <p className="relative mt-3">
        <span className="font-display text-2xl font-semibold tabular tracking-tight">{naira(product.priceKobo)}</span>{' '}
        <span className="text-[13px] text-muted-foreground">{PRODUCT_PERIOD_LABELS[product.period]}</span>
      </p>
      {product.features.length > 0 && (
        <ul className="relative mt-4 space-y-1.5">
          {product.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-[13px]">
              <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="relative mt-auto pt-5">
        <Button className="w-full" variant={featured ? 'default' : 'outline'} onClick={onBuy} disabled={disabled}>
          Choose {product.name}
        </Button>
      </div>
    </Card>
  );
}

function BuyDialog({ product, kids, onClose }: { product: ProductRow; kids: FamilyChild[]; onClose: () => void }) {
  const quote = useQuote();
  const checkout = useCheckout();
  const [selected, setSelected] = useState<string[]>(() => kids.slice(0, 1).map((c) => c.id));
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<string | null>(null);
  const [autoRenew, setAutoRenew] = useState(product.period !== 'ONE_OFF');
  const [done, setDone] = useState(false);
  const body: CheckoutBody = { productCode: product.code, studentIds: selected, couponCode: coupon, autoRenew };
  const key = JSON.stringify(body);

  useEffect(() => {
    if (selected.length === 0) return;
    quote.mutate(body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const toggle = (id: string) =>
    setSelected((x) => {
      if (x.includes(id)) return x.filter((y) => y !== id);
      if (product.maxChildren === 1) return [id];
      return x.length >= product.maxChildren ? x : [...x, id];
    });

  const qd = quote.data;
  const covered = qd?.alreadyCovered.filter((c) => selected.includes(c.id)) ?? [];
  const couponBad = !!coupon && quote.isError;

  const pay = () =>
    checkout.mutate(body, {
      onSuccess: (r) => {
        if (r.authorizationUrl) window.location.assign(r.authorizationUrl);
        else {
          setDone(true);
          toast.success('All set — no payment needed');
        }
      },
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        {done ? (
          <div className="p-8 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-success-soft text-success">
              <CheckCircle2 className="size-7" aria-hidden />
            </div>
            <DialogTitle className="mt-4 font-display text-xl font-semibold tracking-tight">{product.name} is on</DialogTitle>
            <DialogDescription className="mt-1 text-[14px] text-muted-foreground">Your coupon covered everything — nothing to pay. Your child can use it right away.</DialogDescription>
            <Button className="mt-6" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{product.name}</DialogTitle>
              <DialogDescription>
                {naira(product.priceKobo)} {PRODUCT_PERIOD_LABELS[product.period]}
                {product.maxChildren > 1 ? ` · covers up to ${product.maxChildren} children` : ' · per child'}
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-5">
              <div>
                <p className="mb-2 text-[13px] font-medium">{product.maxChildren > 1 ? `Who is it for? (up to ${product.maxChildren})` : 'Who is it for?'}</p>
                <ul className="space-y-2">
                  {kids.map((c) => {
                    const on = selected.includes(c.id);
                    const cov = qd?.alreadyCovered.find((x) => x.id === c.id);
                    return (
                      <li key={c.id}>
                        <label className={cn('flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors', on ? 'border-brand bg-brand-soft/50' : 'border-border hover:bg-muted/50')}>
                          <Checkbox checked={on} onCheckedChange={() => toggle(c.id)} aria-label={c.name} />
                          <Avatar name={c.name} initials={initialsFromName(c.name)} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-medium">{c.name}</span>
                            <span className="block truncate text-[12px] text-muted-foreground">{cov && on ? `Already covered until ${formatDate(cov.until)}` : `${c.school.name}${c.classArm ? ` · ${c.classArm}` : ''}`}</span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-[13px] font-medium">Coupon</p>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setCoupon(couponInput.trim().toUpperCase() || null);
                  }}
                >
                  <Input value={couponInput} onChange={(e) => setCouponInput(e.target.value)} placeholder="Have a code?" aria-label="Coupon code" className="flex-1 uppercase" maxLength={30} />
                  <Button type="submit" variant="outline" disabled={!couponInput.trim() && !coupon}>
                    {coupon && couponInput.trim().toUpperCase() === coupon ? 'Applied' : 'Apply'}
                  </Button>
                </form>
                {couponBad && (
                  <p className="mt-1.5 text-[12.5px] text-danger">
                    {errorMessage(quote.error)}{' '}
                    <button
                      type="button"
                      className="font-medium underline"
                      onClick={() => {
                        setCoupon(null);
                        setCouponInput('');
                      }}
                    >
                      Remove code
                    </button>
                  </p>
                )}
                {qd?.coupon && <p className="mt-1.5 text-[12.5px] text-success">{qd.coupon.description ?? `${qd.coupon.code} applied`}</p>}
              </div>
              {product.period !== 'ONE_OFF' && (
                <label className="flex items-start justify-between gap-4 rounded-xl border border-border p-3">
                  <span>
                    <span className="block text-[13.5px] font-medium">Renew automatically</span>
                    <span className="block text-[12px] text-muted-foreground">We’ll remind you before each renewal. Turn off any time.</span>
                  </span>
                  <Switch checked={autoRenew} onCheckedChange={setAutoRenew} aria-label="Renew automatically" />
                </label>
              )}
              {covered.length > 0 && (
                <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2.5 text-[13px] text-warning">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    {covered.map((c) => c.name).join(' and ')} {covered.length === 1 ? 'already has' : 'already have'} this until {formatDate(covered[0]!.until)}. Untick {covered.length === 1 ? 'them' : 'them'} to continue.
                  </span>
                </p>
              )}
              <div className="rounded-xl bg-muted/60 p-4 text-[13.5px]">
                {selected.length === 0 ? (
                  <p className="text-muted-foreground">Choose at least one child.</p>
                ) : !qd || quote.isPending ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-5 w-1/2" />
                  </div>
                ) : (
                  <dl className="space-y-1.5">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">
                        {product.name}
                        {qd.students.length > 1 && product.maxChildren === 1 ? ` × ${qd.students.length}` : ''}
                      </dt>
                      <dd className="tabular">{naira(qd.priceKobo)}</dd>
                    </div>
                    {qd.discountKobo > 0 && (
                      <div className="flex justify-between gap-3 text-success">
                        <dt>Discount</dt>
                        <dd className="tabular">−{naira(qd.discountKobo)}</dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-3 border-t border-border pt-2 font-semibold">
                      <dt>Total today</dt>
                      <dd className="font-display text-lg tabular">{naira(qd.totalKobo)}</dd>
                    </div>
                  </dl>
                )}
              </div>
              {checkout.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{errorMessage(checkout.error)}</p>}
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={pay} loading={checkout.isPending} disabled={selected.length === 0 || !qd || quote.isPending || couponBad || covered.length > 0}>
                <CreditCard /> {qd && qd.totalKobo === 0 ? 'Confirm' : `Pay ${qd ? naira(qd.totalKobo) : ''}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ subscriptions & orders

function SubscriptionRow({ s }: { s: FamilySubscriptionRow }) {
  const update = useUpdateSubscription();
  const renew = useRenewNow();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const st = STATUS[s.status];
  const live = s.status === 'ACTIVE' || s.status === 'PAST_DUE';
  const recurring = s.product.period !== 'ONE_OFF';
  const end = s.currentPeriodEnd ? formatDate(s.currentPeriodEnd, { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  const when = !end ? null : s.status === 'ACTIVE' && recurring && s.autoRenew && !s.cancelAtPeriodEnd ? `Renews ${end}` : s.status === 'EXPIRED' || s.status === 'CANCELLED' ? `Ended ${end}` : `Ends ${end}`;

  return (
    <div className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{s.product.name}</p>
          <Badge variant={st.variant} dot>
            {st.label}
          </Badge>
          {s.cancelAtPeriodEnd && live && <Badge variant="outline">Cancels at period end</Badge>}
        </div>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          {s.students.map((x) => x.name).join(', ')} · {naira(s.priceKobo)} {PRODUCT_PERIOD_LABELS[s.product.period]}
        </p>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          {[when, s.card].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {recurring && live && !s.cancelAtPeriodEnd && (
          <label className="mr-1 flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <Switch checked={s.autoRenew} onCheckedChange={(v) => update.mutate({ id: s.id, autoRenew: v }, { onSuccess: () => toast.success(v ? 'Auto-renew is on' : 'Auto-renew is off') })} aria-label="Auto-renew" disabled={update.isPending} />
            Auto-renew
          </label>
        )}
        {(s.status === 'PAST_DUE' || s.status === 'EXPIRED') && (
          <Button size="sm" loading={renew.isPending} onClick={() => renew.mutate(s.id, { onSuccess: (r) => (r.authorizationUrl ? window.location.assign(r.authorizationUrl) : toast.success('Renewed')) })}>
            Renew now
          </Button>
        )}
        {live && recurring && (s.cancelAtPeriodEnd ? (
          <Button size="sm" variant="outline" loading={update.isPending} onClick={() => update.mutate({ id: s.id, cancelAtPeriodEnd: false }, { onSuccess: () => toast.success('Subscription resumed') })}>
            Resume
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(true)}>
            Cancel
          </Button>
        ))}
      </div>
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={`Cancel ${s.product.name}?`}
        description={`Nothing is refunded and access continues${end ? ` until ${end}` : ' to the end of the period'}. It just won’t renew. You can resume before then.`}
        confirmLabel="Cancel at period end"
        loading={update.isPending}
        onConfirm={() => update.mutate({ id: s.id, cancelAtPeriodEnd: true }, { onSuccess: () => setConfirmCancel(false) })}
      />
    </div>
  );
}

const ORDER_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'secondary' | 'info' }> = {
  PAID: { label: 'Paid', variant: 'success' },
  PENDING: { label: 'Pending', variant: 'info' },
  FAILED: { label: 'Failed', variant: 'danger' },
  REFUNDED: { label: 'Refunded', variant: 'secondary' },
  PARTIALLY_REFUNDED: { label: 'Part refunded', variant: 'warning' },
};

function OrderRow({ o }: { o: FamilyOrderRow }) {
  const st = ORDER_STATUS[o.status] ?? { label: o.status, variant: 'secondary' as const };
  return (
    <div className="flex items-center gap-3 p-4 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium">
          {o.product} <span className="font-normal text-muted-foreground">· {o.kind === 'RENEWAL' ? 'Renewal' : 'New'}</span>
        </p>
        <p className="truncate text-[12px] text-muted-foreground">
          {formatDate(o.paidAt ?? o.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })} · <span className="font-mono text-[11px]">{o.reference}</span>
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-medium tabular">{naira(o.amountKobo)}</p>
        <div className="mt-0.5 flex flex-wrap justify-end gap-1">
          {o.discountKobo > 0 && <span className="text-[11px] text-success">saved {naira(o.discountKobo)}</span>}
          <Badge variant={st.variant}>{st.label}</Badge>
        </div>
        {o.refundedKobo > 0 && <p className="mt-0.5 text-[11px] text-muted-foreground">{naira(o.refundedKobo)} refunded</p>}
      </div>
    </div>
  );
}
