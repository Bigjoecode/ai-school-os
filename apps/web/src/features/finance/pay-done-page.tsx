import type { OnlinePaymentResult } from '@aischool/shared';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Loader2, RotateCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ApiError, errorMessage } from '@/lib/api';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { usePublicInvoice, verifyOnlinePayment } from './api';
import { PayProblem, PayShell } from './pay-page';
import { money } from './ui';

const POLL_MS = 3_000;
const POLL_FOR_MS = 60_000;

type State = { kind: 'checking' } | { kind: 'result'; r: OnlinePaymentResult; gaveUp?: boolean } | { kind: 'error'; error: unknown };

export default function PayDonePage() {
  useDocumentTitle('Payment status');
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const reference = params.get('reference') ?? params.get('trxref') ?? '';
  const invoice = usePublicInvoice(token);
  const [state, setState] = useState<State>({ kind: 'checking' });
  const started = useRef(Date.now());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!reference) return;
    const ctrl = new AbortController();
    let timer: number | undefined;
    const run = async () => {
      try {
        const r = await verifyOnlinePayment(token, reference, ctrl.signal);
        if (r.status === 'PENDING' && Date.now() - started.current < POLL_FOR_MS) {
          setState({ kind: 'result', r });
          timer = window.setTimeout(() => void run(), POLL_MS);
          return;
        }
        setState({ kind: 'result', r, gaveUp: r.status === 'PENDING' });
        if (r.status === 'SUCCESS') void invoice.refetch();
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ kind: 'error', error });
      }
    };
    started.current = Date.now();
    setState({ kind: 'checking' });
    void run();
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, reference, attempt]);

  const school = invoice.data?.school ?? { name: 'School fees', logoUrl: null };
  const currency = invoice.data?.currency ?? 'NGN';
  const payLink = `/pay/${encodeURIComponent(token)}`;

  if (!reference) {
    return (
      <PayShell school={school}>
        <PayProblem title="No payment to check" tone="danger">
          <p>We couldn’t find a payment reference in this link.</p>
          <Button asChild variant="outline" className="mt-4">
            <Link to={payLink}>Back to the invoice</Link>
          </Button>
        </PayProblem>
      </PayShell>
    );
  }

  return (
    <PayShell school={school}>
      {state.kind === 'checking' || (state.kind === 'result' && state.r.status === 'PENDING' && !state.gaveUp) ? (
        <Card className="mt-4 flex flex-col items-center gap-5 px-6 py-12 text-center" role="status" aria-live="polite">
          <div className="relative grid size-20 place-items-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-brand/20" />
            <span className="relative grid size-20 place-items-center rounded-full bg-brand-soft text-brand">
              <Loader2 className="size-9 animate-spin" />
            </span>
          </div>
          <div>
            <p className="font-display text-xl font-semibold tracking-tight">Confirming your payment…</p>
            <p className="mx-auto mt-1.5 max-w-xs text-[14px] text-muted-foreground">
              {state.kind === 'result' ? state.r.message : 'Checking with Paystack. Please don’t close this page.'}
            </p>
          </div>
        </Card>
      ) : state.kind === 'error' ? (
        state.error instanceof ApiError && state.error.status === 401 ? (
          <PayProblem title="This payment link has expired">
            <p>If you completed a payment, the school will still receive it and issue your receipt.</p>
          </PayProblem>
        ) : (
          <PayProblem title="We couldn’t check this payment" tone="danger">
            <p>{errorMessage(state.error)}</p>
            <Button variant="outline" className="mt-4" onClick={() => setAttempt((n) => n + 1)}>
              <RotateCw /> Check again
            </Button>
          </PayProblem>
        )
      ) : state.r.status === 'SUCCESS' ? (
        <Success r={state.r} currency={currency} payLink={payLink} />
      ) : state.r.status === 'PENDING' ? (
        <PayProblem title="Still waiting for your bank">
          <p>{state.r.message}</p>
          <Button variant="outline" className="mt-4" onClick={() => setAttempt((n) => n + 1)}>
            <RotateCw /> Check again
          </Button>
        </PayProblem>
      ) : (
        <Card className="mt-4 px-6 py-10 text-center" role="alert">
          <div className="mx-auto grid size-20 place-items-center rounded-full bg-danger-soft text-danger">
            <X className="size-10" strokeWidth={2.5} />
          </div>
          <p className="mt-5 font-display text-[22px] font-semibold tracking-tight">Payment didn’t go through</p>
          <p className="mx-auto mt-2 max-w-sm text-[14px] text-muted-foreground">{state.r.message}</p>
          <Button asChild size="lg" className="mt-6 w-full rounded-xl">
            <Link to={payLink}>
              Try again <ArrowRight />
            </Link>
          </Button>
        </Card>
      )}
    </PayShell>
  );
}

function Success({ r, currency, payLink }: { r: OnlinePaymentResult; currency: string; payLink: string }) {
  return (
    <Card className="relative mt-4 overflow-hidden px-6 py-10 text-center" role="status" aria-live="polite">
      <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-success/20 blur-3xl" />
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className="relative mx-auto grid size-24 place-items-center rounded-full bg-success text-white shadow-lift"
      >
        <Check className="size-12" strokeWidth={3} />
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="relative">
        <p className="mt-6 text-[13px] font-medium text-muted-foreground">Payment received</p>
        <p className="mt-1 font-display text-[36px] font-semibold leading-none tracking-[-0.03em] tabular">{money(r.amountKobo, currency)}</p>
        <p className="mx-auto mt-3 max-w-sm text-[14px] text-foreground/80">{r.message}</p>
        <dl className="mx-auto mt-6 grid max-w-sm grid-cols-2 gap-2 text-left">
          <div className="rounded-xl bg-muted/50 px-3 py-2.5">
            <dt className="text-[11.5px] text-muted-foreground">Receipt</dt>
            <dd className="mt-0.5 truncate font-mono text-[13px] font-medium">{r.receiptNumber ?? 'Issued shortly'}</dd>
          </div>
          <div className="rounded-xl bg-muted/50 px-3 py-2.5">
            <dt className="text-[11.5px] text-muted-foreground">Balance left</dt>
            <dd className={cn('mt-0.5 font-display text-[15px] font-semibold tabular', r.balanceKobo === 0 && 'text-success')}>{money(r.balanceKobo, currency)}</dd>
          </div>
        </dl>
        {r.balanceKobo > 0 ? (
          <Button asChild size="lg" variant="outline" className="mt-6 w-full rounded-xl">
            <Link to={payLink}>
              Pay the rest · {money(r.balanceKobo, currency)} <ArrowRight />
            </Link>
          </Button>
        ) : (
          <p className="mt-6 text-[13px] font-medium text-success">Fully paid — you can close this page.</p>
        )}
        <p className="mt-4 text-[12px] text-muted-foreground">Paystack will email you a confirmation, and the school has your payment on record.</p>
      </motion.div>
    </Card>
  );
}
