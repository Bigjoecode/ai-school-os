import type { CheckInResult } from '@aischool/shared';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, Check, Clock, LogIn, LogOut, QrCode, RotateCw, ScanLine, ShieldAlert, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { BrandMark } from '@/components/layout/brand';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, errorMessage } from '@/lib/api';
import { useMe } from '@/lib/auth-store';
import { useDocumentTitle } from '@/lib/hooks';
import { qk, queryClient } from '@/lib/query-client';
import { cn } from '@/lib/utils';
import { checkIn, useMyAttendance } from './api';
import { clockTime, STAFF_STATUS_LABEL, STAFF_STATUS_SOFT } from './ui';

/** One request per scanned code, even under StrictMode's double effects. */
const inflight = new Map<string, Promise<CheckInResult>>();

type State = { kind: 'idle' } | { kind: 'pending' } | { kind: 'done'; result: CheckInResult } | { kind: 'error'; error: unknown };

export default function CheckInPage() {
  useDocumentTitle('Check in');
  const [params, setParams] = useSearchParams();
  const token = params.get('t');
  const me = useMe();
  const [state, setState] = useState<State>(token ? { kind: 'pending' } : { kind: 'idle' });

  useEffect(() => {
    if (!token) return;
    setState({ kind: 'pending' });
    let p = inflight.get(token);
    if (!p) {
      p = checkIn(token);
      inflight.set(token, p);
    }
    let alive = true;
    p.then(
      (result) => {
        void queryClient.invalidateQueries({ queryKey: qk.attendanceMe });
        void queryClient.invalidateQueries({ queryKey: ['attendance', 'staff'] });
        if (!alive) return;
        setState({ kind: 'done', result });
        // Drop the code from the address bar so a reload doesn't replay it.
        setParams({}, { replace: true });
      },
      (error: unknown) => {
        if (alive) setState({ kind: 'error', error });
      },
    );
    return () => {
      alive = false;
    };
  }, [token, setParams]);

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-32 size-80 rounded-full bg-ai-1/15 blur-3xl" />
        <div className="absolute -bottom-32 -right-20 size-80 rounded-full bg-ai-3/10 blur-3xl" />
      </div>
      <header className="relative flex items-center justify-between px-5 py-4">
        <Link to="/" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <BrandMark className="size-8" />
          <span className="font-display text-[15px] font-semibold tracking-tight">{me?.tenant?.name ?? 'AI School OS'}</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 px-5 pb-10">
        {state.kind === 'pending' && <Pending />}
        {state.kind === 'done' && <Success result={state.result} />}
        {state.kind === 'error' && <Failure error={state.error} />}
        {state.kind === 'idle' && <HowTo />}
        <MyStatus />
        <Button asChild variant="ghost" className="self-center">
          <Link to="/">
            Go to dashboard <ArrowRight />
          </Link>
        </Button>
      </main>
    </div>
  );
}

// ------------------------------------------------------------------ states

function Pending() {
  return (
    <Card className="flex flex-col items-center gap-5 px-6 py-12 text-center" role="status" aria-live="polite">
      <div className="relative grid size-20 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-brand/20" />
        <span className="relative grid size-20 place-items-center rounded-full bg-brand-soft text-brand">
          <ScanLine className="size-9" />
        </span>
      </div>
      <div>
        <p className="font-display text-xl font-semibold tracking-tight">Checking you in…</p>
        <p className="mt-1 text-[14px] text-muted-foreground">Just a moment.</p>
      </div>
    </Card>
  );
}

function Success({ result }: { result: CheckInResult }) {
  const late = result.action === 'in' && result.status === 'LATE';
  const out = result.action === 'out';
  return (
    <Card className="relative overflow-hidden px-6 py-10 text-center" role="status" aria-live="polite">
      <div aria-hidden className={cn('pointer-events-none absolute -top-24 left-1/2 size-64 -translate-x-1/2 rounded-full blur-3xl', late ? 'bg-warning/20' : out ? 'bg-info/20' : 'bg-success/20')} />
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className={cn(
          'relative mx-auto grid size-24 place-items-center rounded-full text-white shadow-lift',
          late ? 'bg-warning' : out ? 'bg-info' : 'bg-success',
        )}
      >
        {out ? <LogOut className="size-10" /> : <Check className="size-12" strokeWidth={3} />}
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="relative mt-6">
        <p className="font-display text-[28px] font-semibold leading-tight tracking-tight">
          {out ? 'Checked out' : 'Checked in'}
          <span className="block text-[20px] font-medium text-muted-foreground">at {clockTime(result.at)}</span>
        </p>
        <p className="mt-3 text-[15px] text-foreground/80">{result.message}</p>
        {late && (
          <p className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-warning-soft px-3.5 py-1.5 text-[13px] font-medium text-warning">
            <Clock className="size-4" /> Marked late today
          </p>
        )}
      </motion.div>
    </Card>
  );
}

function Failure({ error }: { error: unknown }) {
  const expired = error instanceof ApiError && error.status === 401;
  const forbidden = error instanceof ApiError && error.status === 403;
  return (
    <Card className="px-6 py-10 text-center" role="alert">
      <div
        className={cn(
          'mx-auto grid size-20 place-items-center rounded-full',
          expired ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger',
        )}
      >
        {expired ? <RotateCw className="size-9" /> : forbidden ? <ShieldAlert className="size-9" /> : <AlertTriangle className="size-9" />}
      </div>
      <p className="mt-5 font-display text-xl font-semibold tracking-tight">
        {expired ? 'That code has expired' : forbidden ? 'Can’t check in with this code' : 'Something went wrong'}
      </p>
      <p className="mt-2 text-[14.5px] text-muted-foreground">
        {expired ? 'Scan the code on the screen again — it changes every minute.' : errorMessage(error)}
      </p>
      {forbidden && <p className="mt-3 text-[13px] text-muted-foreground">Make sure you’re signed in to the right school, with your own staff account.</p>}
    </Card>
  );
}

function HowTo() {
  return (
    <Card className="px-6 py-8">
      <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-brand-soft text-brand">
        <QrCode className="size-8" />
      </div>
      <h1 className="mt-5 text-center font-display text-xl font-semibold tracking-tight">Check in or out</h1>
      <p className="mt-1.5 text-center text-[14px] text-muted-foreground">Staff check in by scanning the code on the reception screen.</p>
      <ol className="mt-6 space-y-3 text-[14px]">
        {[
          [Smartphone, 'Open your phone’s camera'],
          [ScanLine, 'Point it at the QR code on the kiosk screen'],
          [LogIn, 'Tap the link — you’ll land here, checked in'],
        ].map(([Icon, text], i) => {
          const I = Icon as typeof Smartphone;
          return (
            <li key={i} className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-3.5 py-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-card text-muted-foreground shadow-xs">
                <I className="size-4" />
              </span>
              {text as string}
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-center text-[12.5px] text-muted-foreground">Scan again at the end of the day to check out.</p>
    </Card>
  );
}

function MyStatus() {
  const q = useMyAttendance();
  const d = q.data;
  if (q.isLoading) return <Skeleton className="h-[76px] w-full rounded-2xl" />;
  if (!d) return null;
  if (!d.isStaff) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-center text-[13px] text-muted-foreground">
        Your account isn’t linked to a staff record, so there’s no check-in to track.
      </p>
    );
  }
  return (
    <Card className="flex items-center gap-4 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Your day</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[14px]">
          <span className="inline-flex items-center gap-1.5">
            <LogIn className="size-3.5 text-muted-foreground" aria-hidden /> In <span className="font-semibold tabular">{clockTime(d.checkInAt)}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LogOut className="size-3.5 text-muted-foreground" aria-hidden /> Out <span className="font-semibold tabular">{clockTime(d.checkOutAt)}</span>
          </span>
        </p>
      </div>
      <span className={cn('rounded-full px-2.5 py-1 text-[12px] font-medium', d.status ? STAFF_STATUS_SOFT[d.status] : 'bg-muted text-muted-foreground')}>
        {d.status ? STAFF_STATUS_LABEL[d.status] : 'Not in yet'}
      </span>
    </Card>
  );
}
