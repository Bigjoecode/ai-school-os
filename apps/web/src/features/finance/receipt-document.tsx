import { PAYMENT_METHOD_LABELS, type ReceiptView } from '@aischool/shared';
import { CheckCircle2 } from 'lucide-react';
import { cn, initialsFromName } from '@/lib/utils';
import { money, PaymentStatusBadge, schoolDateTime } from './ui';

/** Whole naira in words, e.g. "One hundred and fifty thousand naira only". */
export function amountInWords(kobo: number, currency: string): string | null {
  if (currency !== 'NGN') return null;
  const naira = Math.floor(kobo / 100);
  const k = kobo % 100;
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const under1000 = (n: number): string => {
    const h = Math.floor(n / 100);
    const r = n % 100;
    const rest = r < 20 ? ones[r] : `${tens[Math.floor(r / 10)]}${r % 10 ? `-${ones[r % 10]}` : ''}`;
    if (h && r) return `${ones[h]} hundred and ${rest}`;
    if (h) return `${ones[h]} hundred`;
    return rest;
  };
  const words = (n: number): string => {
    if (n === 0) return 'zero';
    const scales: [number, string][] = [
      [1_000_000_000, 'billion'],
      [1_000_000, 'million'],
      [1_000, 'thousand'],
    ];
    const parts: string[] = [];
    let rem = n;
    for (const [size, name] of scales) {
      if (rem >= size) {
        parts.push(`${under1000(Math.floor(rem / size))} ${name}`);
        rem %= size;
      }
    }
    if (rem) parts.push(rem < 100 && parts.length ? `and ${under1000(rem)}` : under1000(rem));
    return parts.join(', ').replace(', and', ' and');
  };
  const text = `${words(naira)} naira${k ? `, ${words(k)} kobo` : ''} only`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The printable receipt itself (A4 on paper). Shared by the bursar's receipt
 * page and the parent portal, which shows it read-only.
 */
export function ReceiptDocument({ r }: { r: ReceiptView }) {
  const reversed = r.status === 'REVERSED';
  const c = r.currency;
  const words = amountInWords(r.amountKobo, c);
  return (
    <article className="print-a4 relative mx-auto overflow-hidden rounded-2xl border border-border bg-card shadow-soft print:rounded-none print:border-0 print:shadow-none">
      <div aria-hidden className={cn('h-1.5 w-full', reversed ? 'bg-danger/60' : 'bg-gradient-to-r from-success via-chart-2 to-brand')} />
      {reversed && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
          <span className="-rotate-[22deg] rounded-2xl border-[6px] border-danger/30 px-8 py-2 font-display text-[64px] font-black tracking-[0.2em] text-danger/25 sm:text-[92px]">REVERSED</span>
        </div>
      )}

      <header className="flex flex-col gap-5 border-b border-border px-6 py-6 sm:flex-row sm:items-start sm:justify-between sm:px-10 print:flex-row print:px-8">
        <div className="flex items-start gap-4">
          {r.school.logoUrl ? (
            <img src={r.school.logoUrl} alt="" className="size-14 shrink-0 rounded-xl object-contain" />
          ) : (
            <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-brand-soft font-display text-lg font-bold text-brand">{initialsFromName(r.school.name)}</div>
          )}
          <div className="min-w-0 text-[12.5px] text-muted-foreground">
            <p className="font-display text-[18px] font-bold leading-tight tracking-tight text-foreground">{r.school.name}</p>
            {r.school.address && <p className="mt-0.5 whitespace-pre-line">{r.school.address}</p>}
            <p>{[r.school.phone, r.school.email].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <div className="sm:text-right print:text-right">
          <p className="font-display text-[22px] font-semibold uppercase tracking-[0.18em] text-foreground/90">Receipt</p>
          <p className="mt-1 font-mono text-[13px]">{r.receiptNumber ?? '—'}</p>
          <div className="mt-2 sm:flex sm:justify-end print:hidden">
            <PaymentStatusBadge status={r.status} />
          </div>
        </div>
      </header>

      <div className="px-6 py-8 text-center sm:px-10 print:py-6">
        {!reversed && <CheckCircle2 className="mx-auto size-9 text-success print:hidden" aria-hidden />}
        <p className="mt-2 text-[12.5px] text-muted-foreground">Received with thanks</p>
        <p className={cn('mt-1 font-display text-[40px] font-semibold leading-none tracking-[-0.03em] tabular', reversed && 'text-muted-foreground line-through')}>{money(r.amountKobo, c)}</p>
        {words && <p className="mx-auto mt-2 max-w-md text-[12.5px] italic text-muted-foreground">{words}</p>}
      </div>

      <dl className="grid grid-cols-1 gap-px border-y border-border bg-border sm:grid-cols-2 print:grid-cols-2">
        {(
          [
            ['Learner', `${r.student.name}${r.student.classArm ? ` · ${r.student.classArm}` : ''}`],
            ['Invoice', `${r.invoice.number} · ${r.invoice.term}`],
            ['Date', schoolDateTime(r.paidAt)],
            ['Method', PAYMENT_METHOD_LABELS[r.method]],
            ['Reference', r.reference ?? '—'],
            ['Paid by', r.payerName ?? '—'],
            ['Received by', r.receivedBy ?? (r.method === 'PAYSTACK' ? 'Online (Paystack)' : '—')],
            ['Note', r.note && !reversed ? r.note : '—'],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="bg-card px-6 py-3 sm:px-10 print:px-8">
            <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{k}</dt>
            <dd className={cn('mt-0.5 break-words text-[13.5px] font-medium', k === 'Reference' && 'font-mono text-[12.5px]')}>{v}</dd>
          </div>
        ))}
      </dl>

      <div className="px-6 py-6 sm:px-10 print:px-8">
        <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice position</p>
        <dl className="mt-2 grid grid-cols-3 gap-3">
          {(
            [
              ['Invoice total', r.invoice.totalKobo, ''],
              ['Paid to date', r.invoice.paidKobo, 'text-success'],
              ['Balance', r.invoice.balanceKobo, r.invoice.balanceKobo > 0 ? 'text-danger' : 'text-success'],
            ] as const
          ).map(([k, v, cls]) => (
            <div key={k} className="rounded-xl border border-border bg-muted/30 px-3 py-2.5">
              <dt className="text-[11.5px] text-muted-foreground">{k}</dt>
              <dd className={cn('mt-0.5 font-display text-[16px] font-semibold tabular', cls)}>{money(v, c)}</dd>
            </div>
          ))}
        </dl>
        {r.invoice.balanceKobo === 0 && !reversed && <p className="mt-3 text-center text-[13px] font-medium text-success">This invoice is fully paid. Thank you!</p>}
      </div>

      <footer className="flex items-end justify-between gap-6 border-t border-border px-6 py-6 sm:px-10 print:px-8">
        <p className="max-w-xs text-[11.5px] text-muted-foreground">This receipt was issued electronically by {r.school.name}. Keep it for your records.</p>
        <div className="w-44 text-center">
          <div className="h-10 border-b border-border-strong" />
          <p className="mt-1 text-[11px] text-muted-foreground">Bursar’s signature</p>
        </div>
      </footer>
    </article>
  );
}
