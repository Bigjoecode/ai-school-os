import type { PublicVerification } from '@aischool/shared';
import { motion } from 'framer-motion';
import { BadgeCheck, SearchX, ShieldCheck, ShieldX } from 'lucide-react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router';
import { BrandWordmark } from '@/components/layout/brand';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, errorMessage } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { usePublicVerification } from './api';

/** Public pages behind the QR codes on certificates and ID cards — no sign-in. */
export default function VerifyPage({ kind }: { kind: 'certificate' | 'id' }) {
  const { code = '' } = useParams();
  const q = usePublicVerification(kind, code);
  const noun = kind === 'certificate' ? 'certificate' : 'ID card';
  useDocumentTitle(q.data ? `${q.data.valid ? 'Verified' : 'Not valid'} · ${q.data.school}` : `Verify ${noun}`);

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className={cn('absolute -left-24 -top-40 size-96 rounded-full blur-3xl', q.data ? (q.data.valid ? 'bg-success/15' : 'bg-danger/10') : 'bg-brand/10')} />
        <div className="absolute -bottom-40 -right-24 size-96 rounded-full bg-brand/10 blur-3xl" />
      </div>
      <header className="relative mx-auto flex w-full max-w-lg items-center justify-between px-5 py-4">
        <span className="inline-flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
          <ShieldCheck className="size-4 text-brand" aria-hidden /> Document check
        </span>
        <ThemeToggle />
      </header>
      <main className="relative mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 pb-8 pt-2 sm:px-5">
        {q.isLoading ? (
          <Card className="space-y-4 p-6" aria-busy>
            <Skeleton className="mx-auto size-16 rounded-full" />
            <Skeleton className="mx-auto h-6 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </Card>
        ) : q.data ? (
          <Result v={q.data} noun={noun} />
        ) : q.error instanceof ApiError && q.error.status === 404 ? (
          <Problem icon={<SearchX className="size-7" />} title={`We couldn’t find this ${noun}`}>
            The code may have been mistyped, or the {noun} wasn’t issued through the school’s system. Contact the school that issued it to check.
          </Problem>
        ) : (
          <Problem icon={<ShieldX className="size-7" />} title="We couldn’t check this right now">
            <p>{errorMessage(q.error)}</p>
            <Button variant="outline" className="mt-4" onClick={() => void q.refetch()}>
              Try again
            </Button>
          </Problem>
        )}
      </main>
      <footer className="relative mx-auto flex w-full max-w-lg flex-col items-center gap-1.5 px-5 pb-6 text-center text-[11.5px] text-muted-foreground">
        <BrandWordmark className="scale-90 opacity-80" />
        <span>Only details the school chooses to share are shown here.</span>
      </footer>
    </div>
  );
}

function Problem({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card className="mt-4 px-6 py-10 text-center" role="alert">
      <div className="mx-auto grid size-16 place-items-center rounded-full bg-muted text-muted-foreground">{icon}</div>
      <p className="mt-5 font-display text-xl font-semibold tracking-tight">{title}</p>
      <div className="mx-auto mt-2 max-w-sm text-[14px] text-muted-foreground">{children}</div>
    </Card>
  );
}

function Result({ v, noun }: { v: PublicVerification; noun: string }) {
  const rows: [string, string | null][] = [
    ['Issued by', v.school],
    ['Document', v.kind],
    ['Name', v.name],
    ['Details', v.detail],
    ['Issued on', v.issuedOn ? formatDate(v.issuedOn, { day: 'numeric', month: 'long', year: 'numeric' }) : null],
    ['Valid until', v.validUntil ? formatDate(v.validUntil, { day: 'numeric', month: 'long', year: 'numeric' }) : null],
  ];
  return (
    <Card className={cn('relative mt-2 overflow-hidden', v.valid ? 'border-success/40' : 'border-danger/40')}>
      <div className={cn('flex flex-col items-center px-6 pb-6 pt-8 text-center', v.valid ? 'bg-success-soft/50' : 'bg-danger-soft/50')} role="status">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className={cn('grid size-16 place-items-center rounded-full text-white shadow-lift', v.valid ? 'bg-success' : 'bg-danger')}
        >
          {v.valid ? <BadgeCheck className="size-8" aria-hidden /> : <ShieldX className="size-8" aria-hidden />}
        </motion.div>
        <p className={cn('mt-4 font-display text-[24px] font-semibold tracking-tight', v.valid ? 'text-success' : 'text-danger')}>{v.valid ? 'Verified' : 'Not valid'}</p>
        <p className="mt-1 max-w-sm text-[14px] text-foreground/90">{v.message}</p>
      </div>
      <dl className="divide-y divide-border">
        {rows
          .filter(([, val]) => !!val)
          .map(([k, val]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 px-6 py-3">
              <dt className="shrink-0 text-[12.5px] text-muted-foreground">{k}</dt>
              <dd className={cn('min-w-0 break-words text-right text-[14px] font-medium', k === 'Name' && 'font-display text-[16px] font-semibold')}>{val}</dd>
            </div>
          ))}
      </dl>
      <p className="border-t border-border bg-muted/30 px-6 py-3 text-center text-[11.5px] text-muted-foreground">
        This {noun} was checked against the school’s records at {formatDateTime(new Date())}.
      </p>
    </Card>
  );
}
