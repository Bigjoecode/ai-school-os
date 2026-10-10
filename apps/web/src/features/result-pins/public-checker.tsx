import { formatPin, pinCheckSchema, type PinChallenge, type PinCheckResult, type PinPurchaseResult } from '@aischool/shared';
import { CheckCircle2, CreditCard, FileDown, KeyRound, Loader2, Printer, RotateCcw, ShieldCheck, XCircle } from 'lucide-react';
import * as React from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { money } from '../finance/ui';
import { PaperStyle, ReportCardDocument } from '../report-cards/card-document';
import { publicPins, usePublicPinInfo } from './api';

/** Platform address: /check-result/:slug (works even when the school has no published website). */
export function PlatformCheckResultPage() {
  const { slug = '' } = useParams();
  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10 print:max-w-none print:p-0">
        <ResultChecker slug={slug} checkerPath={`/check-result/${slug}`} showSchool />
      </div>
    </div>
  );
}

export function PlatformPinBoughtPage() {
  const { slug = '' } = useParams();
  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <PinBought slug={slug} checkerPath={`/check-result/${slug}`} />
      </div>
    </div>
  );
}

type Prefill = { serial?: string; pin?: string } | null;

/**
 * Enter the admission number, the card's serial and PIN, and the term: shows
 * the published report card as the school prints it. Also sells cards online
 * when the school offers that.
 */
export function ResultChecker({ slug, checkerPath, showSchool }: { slug: string; checkerPath: string; showSchool?: boolean }) {
  const info = usePublicPinInfo(slug);
  const location = useLocation();
  const prefill = (location.state as { pinCard?: Prefill } | null)?.pinCard ?? null;
  const [v, setV] = React.useState({ admissionNumber: '', surname: '', serial: prefill?.serial ?? '', pin: prefill?.pin ?? '', termId: '', answer: '' });
  const [challenge, setChallenge] = React.useState<PinChallenge | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<PinCheckResult | null>(null);
  useDocumentTitle(result ? `${result.view.student.name} · ${result.view.term.name} result` : 'Check result');

  const terms = info.data?.terms ?? [];
  React.useEffect(() => {
    if (!v.termId && terms.length) setV((x) => ({ ...x, termId: (terms.find((t) => t.isCurrent) ?? terms[0]).id }));
  }, [terms, v.termId]);

  const set = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = pinCheckSchema.safeParse({ ...v, challenge: challenge ? { token: challenge.token, answer: v.answer } : null });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setError(null);
    setPending(true);
    try {
      const r = await publicPins.check(slug, parsed.data);
      setResult(r);
      setChallenge(null);
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (err instanceof ApiError && err.details.code === 'CHALLENGE_REQUIRED') {
        setChallenge(await publicPins.challenge(slug).catch(() => null));
        set({ answer: '' });
      }
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  if (info.isLoading) return <Skeleton className="h-96 rounded-2xl" />;
  if (info.error || !info.data) {
    return (
      <Card className="p-8 text-center">
        <p className="font-display text-lg font-semibold">This school’s result checker isn’t available</p>
        <p className="mt-1 text-[14px] text-muted-foreground">{info.error ? errorMessage(info.error) : 'Please check the address and try again.'}</p>
      </Card>
    );
  }
  const d = info.data;

  if (result) {
    const r = result.view;
    return (
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => setResult(null)}>
            <RotateCcw /> Check another result
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer /> Print
            </Button>
            <Button size="sm" onClick={() => window.print()} aria-label="Save as PDF (choose “Save as PDF” as the printer)">
              <FileDown /> Save as PDF
            </Button>
          </div>
        </div>
        <p className="mb-3 text-[13px] text-muted-foreground print:hidden">
          Card {result.card.serial}: {result.card.usesLeft} {result.card.usesLeft === 1 ? 'check' : 'checks'} left, valid until {formatDate(result.card.expiresOn)}. Print or save the result now — viewing it again uses another check. On a phone, choose “Save as PDF” as the printer.
        </p>
        <PaperStyle paper={r.template.paper} />
        <div className="-mx-4 overflow-x-auto sm:mx-0 print:mx-0 print:overflow-visible">
          <ReportCardDocument v={r} className="print:text-[10.5px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_1fr] [&>*]:min-w-0">
      <Card className="p-5 sm:p-7">
        {showSchool && (
          <div className="mb-5 flex items-center gap-3">
            {d.school.logoUrl ? <img src={d.school.logoUrl} alt="" className="size-12 object-contain" /> : <div className="grid size-12 place-items-center rounded-xl bg-brand-soft text-brand"><KeyRound className="size-6" /></div>}
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-semibold">{d.school.name}</p>
              <p className="text-[13px] text-muted-foreground">Result checker</p>
            </div>
          </div>
        )}
        <h1 className="font-display text-xl font-semibold">Check a result with a scratch card</h1>
        <p className="mt-1 text-[14px] text-muted-foreground">Enter the student’s admission number and surname, and the serial number and PIN on the card.</p>
        {!d.enabled ? (
          <p className="mt-5 rounded-xl bg-muted p-4 text-[14px]">The school is not using result checker cards at the moment. Parents can see results in the school portal.</p>
        ) : (
          <form onSubmit={submit} noValidate className="mt-5 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
              <Field label="Admission number" htmlFor="rp-adm" error={errors.admissionNumber}>
                <Input id="rp-adm" autoComplete="off" className="font-mono uppercase placeholder:normal-case" placeholder="e.g. GIS/2024/001" value={v.admissionNumber} onChange={(e) => set({ admissionNumber: e.target.value })} />
              </Field>
              <Field label="Student’s surname" htmlFor="rp-surname" error={errors.surname} hint="As the school has it.">
                <Input id="rp-surname" autoComplete="off" placeholder="e.g. Okafor" value={v.surname} onChange={(e) => set({ surname: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
              <Field label="Card serial number" htmlFor="rp-serial" error={errors.serial}>
                <Input id="rp-serial" inputMode="numeric" autoComplete="off" className="font-mono" value={v.serial} onChange={(e) => set({ serial: e.target.value })} />
              </Field>
              <Field label="PIN (12 digits)" htmlFor="rp-pin" error={errors.pin}>
                <Input id="rp-pin" inputMode="numeric" autoComplete="off" className="font-mono tracking-[0.12em]" value={v.pin} onChange={(e) => set({ pin: e.target.value })} />
              </Field>
            </div>
            <Field label="Term" htmlFor="rp-term" error={errors.termId}>
              <Select value={v.termId} onValueChange={(t) => set({ termId: t })}>
                <SelectTrigger id="rp-term"><SelectValue placeholder="Choose the term" /></SelectTrigger>
                <SelectContent>
                  {terms.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}, {t.sessionName}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            {challenge && (
              <Field label={`Quick check: ${challenge.question}`} htmlFor="rp-sum" hint="This stops automated guessing.">
                <Input id="rp-sum" inputMode="numeric" className="max-w-[120px]" value={v.answer} onChange={(e) => set({ answer: e.target.value })} />
              </Field>
            )}
            {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-[13.5px] text-danger">{error}</p>}
            <Button type="submit" size="lg" loading={pending} className="w-full">
              <KeyRound /> Check result
            </Button>
            <p className="flex gap-2 text-[12.5px] text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0" aria-hidden />
              A card works for one student only: the first student checked with it. Each view uses one check.
            </p>
          </form>
        )}
      </Card>
      <BuyCard slug={slug} checkerPath={checkerPath} offers={d.offers} currency={d.currency} />
    </div>
  );
}

function BuyCard({ slug, checkerPath, offers, currency }: { slug: string; checkerPath: string; offers: { batchId: string; title: string; priceKobo: number; usesPerPin: number; expiresOn: string; available: boolean }[]; currency: string }) {
  const [batchId, setBatchId] = React.useState('');
  const [v, setV] = React.useState({ name: '', email: '', phone: '' });
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const live = offers.filter((o) => o.available);
  React.useEffect(() => {
    if (!batchId && live[0]) setBatchId(live[0].batchId);
  }, [live, batchId]);
  if (!offers.length) {
    return (
      <div className="space-y-3 text-[14px] text-muted-foreground">
        <p className="font-display text-[17px] font-semibold text-foreground">Where do I get a card?</p>
        <p>Result checker cards are sold by the school office (the bursar). Each card has a serial number and a PIN under the scratch panel.</p>
        <p>Card used up or lost? Buy a new one from the school.</p>
      </div>
    );
  }
  const offer = offers.find((o) => o.batchId === batchId);
  const buy = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const r = await publicPins.buy(slug, { batchId, ...v, returnPath: `${checkerPath}/bought` });
      window.location.assign(r.authorizationUrl);
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  };
  return (
    <Card className="p-5 sm:p-6">
      <p className="flex items-center gap-2 font-display text-[17px] font-semibold"><CreditCard className="size-5 text-brand" aria-hidden /> Buy a card online</p>
      <p className="mt-1 text-[13.5px] text-muted-foreground">Pay by card, bank transfer or USSD through Paystack. Your PIN appears on screen straight away and is sent to you by SMS and email.</p>
      {!live.length ? (
        <p className="mt-4 rounded-xl bg-muted p-3 text-[13.5px]">Online cards are sold out. Please buy one from the school office.</p>
      ) : (
        <form onSubmit={buy} className="mt-4 grid gap-3">
          {live.length > 1 && (
            <Field label="Card" htmlFor="pb-offer">
              <Select value={batchId} onValueChange={setBatchId}>
                <SelectTrigger id="pb-offer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {live.map((o) => <SelectItem key={o.batchId} value={o.batchId}>{o.title} — {money(o.priceKobo, currency)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
          {offer && (
            <p className="rounded-xl bg-muted px-3 py-2 text-[13px]">
              <span className="font-semibold">{money(offer.priceKobo, currency)}</span> · {offer.title} · {offer.usesPerPin} checks · valid until {formatDate(offer.expiresOn)}
            </p>
          )}
          <Field label="Your name" htmlFor="pb-name">
            <Input id="pb-name" autoComplete="name" value={v.name} onChange={(e) => setV((x) => ({ ...x, name: e.target.value }))} />
          </Field>
          <Field label="Phone (for the SMS)" htmlFor="pb-phone">
            <Input id="pb-phone" type="tel" autoComplete="tel" placeholder="0803 123 4567" value={v.phone} onChange={(e) => setV((x) => ({ ...x, phone: e.target.value }))} />
          </Field>
          <Field label="Email (for the receipt)" htmlFor="pb-email">
            <Input id="pb-email" type="email" autoComplete="email" value={v.email} onChange={(e) => setV((x) => ({ ...x, email: e.target.value }))} />
          </Field>
          {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
          <Button type="submit" loading={pending} disabled={!batchId}>
            Pay {offer ? money(offer.priceKobo, currency) : ''}
          </Button>
        </form>
      )}
    </Card>
  );
}

/** Paystack sends the buyer back here: confirm the payment and show the PIN. */
export function PinBought({ slug, checkerPath }: { slug: string; checkerPath: string }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ref = params.get('ref') ?? params.get('reference') ?? '';
  const claim = params.get('claim') ?? '';
  const [r, setR] = React.useState<PinPurchaseResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  useDocumentTitle('Your result checker card');
  React.useEffect(() => {
    let stop = false;
    let tries = 0;
    const load = async () => {
      try {
        const x = await publicPins.purchase(slug, ref, claim);
        if (stop) return;
        setR(x);
        if (x.status === 'PENDING' && tries++ < 10) window.setTimeout(load, 3000);
      } catch (err) {
        if (!stop) setError(errorMessage(err));
      }
    };
    if (ref && claim) void load();
    else setError('This link is incomplete.');
    return () => {
      stop = true;
    };
  }, [slug, ref, claim]);

  if (error) return <Card className="p-6 text-center text-[14px]">{error}</Card>;
  if (!r || r.status === 'PENDING') {
    return (
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        <p className="text-[14px]">{r?.message ?? 'Confirming your payment…'}</p>
      </Card>
    );
  }
  const ok = r.status === 'PAID';
  return (
    <Card className="p-6 sm:p-8">
      <div className="flex items-center gap-3">
        {ok ? <CheckCircle2 className="size-7 text-success" aria-hidden /> : <XCircle className="size-7 text-danger" aria-hidden />}
        <p className="font-display text-xl font-semibold">{ok ? 'Your result checker card' : r.status === 'FAILED' ? 'Payment not completed' : 'Payment received'}</p>
      </div>
      <p className="mt-2 text-[14px] text-muted-foreground">{r.message}</p>
      {ok && r.serial && (
        <div className="mt-5 rounded-2xl border border-dashed border-border-strong p-5 text-center">
          <p className="text-[12px] uppercase tracking-[0.14em] text-muted-foreground">Serial number</p>
          <p className="font-mono text-lg font-semibold">{r.serial}</p>
          {r.pin && (
            <>
              <p className="mt-3 text-[12px] uppercase tracking-[0.14em] text-muted-foreground">PIN</p>
              <p className="font-mono text-2xl font-bold tracking-[0.14em]">{formatPin(r.pin)}</p>
            </>
          )}
          <p className="mt-3 text-[12.5px] text-muted-foreground">
            {r.usesPerPin} checks for one student · valid until {r.expiresOn ? formatDate(r.expiresOn) : '—'}
            {(r.delivered.sms || r.delivered.email) && ` · also sent by ${[r.delivered.sms && 'SMS', r.delivered.email && 'email'].filter(Boolean).join(' and ')}`}
          </p>
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        {ok && r.pin ? (
          <Button onClick={() => navigate(checkerPath, { state: { pinCard: { serial: r.serial, pin: r.pin } } })}>
            <KeyRound /> Check a result now
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link to={checkerPath}>Back to the result checker</Link>
          </Button>
        )}
      </div>
    </Card>
  );
}
