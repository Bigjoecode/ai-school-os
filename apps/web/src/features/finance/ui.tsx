import { formatMoney, type InvoiceStatus, PAYMENT_METHOD_LABELS, type PaymentMethod, type PaymentRow } from '@aischool/shared';
import { Banknote, Building2, Check, Copy, CreditCard, FileSignature, Globe } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { inputClass } from '@/components/ui/input';
import { useAuthStore, useMe } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useStructure } from '../academics/api';
import { currentTerm, TermSelect, termOptions } from '../planning/pickers';
import { useFinanceOverview } from './api';

// ------------------------------------------------------------------ money

export function useCurrency(): string {
  const me = useMe();
  return me?.tenant?.currency ?? 'NGN';
}

export function money(kobo: number | null | undefined, currency: string): string {
  if (kobo == null || Number.isNaN(kobo)) return '—';
  try {
    return formatMoney(kobo, currency);
  } catch {
    return formatMoney(kobo, 'NGN');
  }
}

/** ₦83.6M — for headlines and chart axes. */
export function compactMoney(kobo: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(kobo / 100);
  } catch {
    return money(kobo, currency);
  }
}

export function currencySymbol(currency: string): string {
  try {
    const part = new Intl.NumberFormat('en-NG', { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency');
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

/** "150000.5" → "150,000.5" while typing (keeps up to 2 decimals). */
export function formatNairaInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  const [int = '', ...rest] = cleaned.split('.');
  const intPart = int.replace(/^0+(?=\d)/, '');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (rest.length === 0) return grouped;
  return `${grouped || '0'}.${rest.join('').slice(0, 2)}`;
}

/** "150,000.50" → 150000.5 (naira), or null when empty/invalid. */
export function parseNaira(value: string): number | null {
  const n = Number(value.replace(/,/g, ''));
  if (!value.trim() || Number.isNaN(n)) return null;
  return n;
}

/** kobo → "150,000" for prefilled naira inputs. */
export function koboToInput(kobo: number): string {
  const major = kobo / 100;
  return formatNairaInput(Number.isInteger(major) ? String(major) : major.toFixed(2));
}

interface MoneyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'size'> {
  value: string;
  onChange: (value: string) => void;
  currency: string;
  invalid?: boolean;
  size?: 'default' | 'lg';
}

/** Amount entered in major units with a currency prefix and thousands separators. */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, currency, invalid, className, size = 'default', ...props }, ref) => (
    <div className={cn('relative', className)}>
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-medium text-muted-foreground',
          size === 'lg' ? 'text-[20px]' : 'text-sm',
        )}
      >
        {currencySymbol(currency)}
      </span>
      <input
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(formatNairaInput(e.target.value))}
        aria-invalid={invalid || undefined}
        className={cn(inputClass, 'tabular', size === 'lg' ? 'h-14 pl-9 font-display text-[24px] font-semibold tracking-tight' : 'pl-8')}
        {...props}
      />
    </div>
  ),
);
MoneyInput.displayName = 'MoneyInput';

// ------------------------------------------------------------------ dates

export function schoolTimeZone(): string | undefined {
  return useAuthStore.getState().me?.tenant?.timezone ?? undefined;
}

/** Date + time in the school's time zone. */
export function schoolDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: schoolTimeZone() }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

export function schoolDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatDate(iso);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: schoolTimeZone() }).format(d);
  } catch {
    return formatDate(iso);
  }
}

/** Today's date (YYYY-MM-DD) in the school's time zone. */
export function schoolToday(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: schoolTimeZone(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function monthLabel(month: string, long = false): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  return new Intl.DateTimeFormat(undefined, { month: long ? 'long' : 'short', year: long ? 'numeric' : undefined, timeZone: 'UTC' }).format(d);
}

// ------------------------------------------------------------------ badges

export function InvoiceStatusBadge({ status, overdue, className }: { status: InvoiceStatus; overdue?: boolean; className?: string }) {
  if (status === 'CANCELLED')
    return (
      <Badge variant="outline" className={cn('line-through decoration-1', className)}>
        Cancelled
      </Badge>
    );
  if (status === 'PAID')
    return (
      <Badge variant="success" dot className={className}>
        Paid
      </Badge>
    );
  if (overdue)
    return (
      <Badge variant="danger" dot className={className}>
        Overdue{status === 'PART_PAID' ? ' · part-paid' : ''}
      </Badge>
    );
  if (status === 'PART_PAID')
    return (
      <Badge variant="warning" dot className={className}>
        Part-paid
      </Badge>
    );
  return (
    <Badge variant="info" dot className={className}>
      Unpaid
    </Badge>
  );
}

const METHOD_ICON: Record<PaymentMethod, React.ComponentType<{ className?: string }>> = {
  CASH: Banknote,
  BANK_TRANSFER: Building2,
  POS: CreditCard,
  CHEQUE: FileSignature,
  PAYSTACK: Globe,
};

export const METHOD_COLOR: Record<PaymentMethod, string> = {
  CASH: 'var(--chart-4)',
  BANK_TRANSFER: 'var(--chart-1)',
  POS: 'var(--chart-2)',
  CHEQUE: 'var(--chart-5)',
  PAYSTACK: 'var(--chart-3)',
};

export function MethodBadge({ method, className }: { method: PaymentMethod; className?: string }) {
  const Icon = METHOD_ICON[method];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11.5px] font-medium', className)}>
      <Icon className="size-3 text-muted-foreground" aria-hidden />
      {method === 'PAYSTACK' ? 'Online' : PAYMENT_METHOD_LABELS[method]}
    </span>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentRow['status'] }) {
  const map = { SUCCESS: ['success', 'Received'], PENDING: ['warning', 'Pending'], FAILED: ['danger', 'Failed'], REVERSED: ['outline', 'Reversed'] } as const;
  const [variant, label] = map[status];
  return (
    <Badge variant={variant} dot={status !== 'REVERSED'}>
      {label}
    </Badge>
  );
}

// ------------------------------------------------------------------ collection rate

export function collectionTone(rate: number | null | undefined): 'success' | 'warning' | 'danger' | 'muted' {
  if (rate == null) return 'muted';
  if (rate >= 80) return 'success';
  if (rate >= 50) return 'warning';
  return 'danger';
}

const toneStroke = { success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)', muted: 'var(--border-strong)' };

export function fmtPct(rate: number | null | undefined): string {
  if (rate == null) return '—';
  return `${Number.isInteger(rate) ? rate : rate.toFixed(1)}%`;
}

export function RateChip({ rate, className }: { rate: number | null | undefined; className?: string }) {
  const tone = collectionTone(rate);
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-full px-1.5 text-[11px] font-semibold tabular',
        tone === 'success' && 'bg-success-soft text-success',
        tone === 'warning' && 'bg-warning-soft text-warning',
        tone === 'danger' && 'bg-danger-soft text-danger',
        tone === 'muted' && 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {rate == null ? '—' : `${Math.round(rate)}%`}
    </span>
  );
}

export function CollectionRing({ rate, size = 112, stroke = 10, label = 'collected' }: { rate: number | null; size?: number; stroke?: number; label?: string }) {
  const pct = rate == null ? 0 : Math.max(0, Math.min(100, rate)) / 100;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label={`${fmtPct(rate)} ${label}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={toneStroke[collectionTone(rate)]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className={cn('font-display font-semibold leading-none tabular', size >= 100 ? 'text-[22px]' : 'text-[14px]')}>{rate == null ? '—' : `${Math.round(rate)}%`}</p>
          {size >= 100 && <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ copy

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function CopyButton({
  text,
  label,
  children,
  variant = 'ghost',
  size = 'sm',
  className,
}: {
  text: string;
  label: string;
  children?: React.ReactNode;
  variant?: 'ghost' | 'outline';
  size?: 'sm' | 'default';
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn(variant === 'ghost' && size === 'sm' && 'h-7 px-2 text-[12px]', className)}
      aria-label={`Copy ${label}`}
      onClick={() =>
        void copyText(text).then((ok) => {
          if (ok) setCopied(true);
          else toast.error('Couldn’t copy — select the text and copy it manually.');
        })
      }
    >
      {copied ? <Check className="text-success" /> : <Copy />} {children ?? (copied ? 'Copied' : 'Copy')}
    </Button>
  );
}

// ------------------------------------------------------------------ terms

export interface TermContext {
  /** The selected (or current) term id; undefined until known. */
  termId: string | undefined;
  termName: string | undefined;
  /** Whether a full term list is available (needs academics.read). */
  canPick: boolean;
  structure: ReturnType<typeof useStructure>['data'];
}

/**
 * Terms come from the academic structure when the user can read it; otherwise
 * (e.g. an accountant) we fall back to the current term from the finance overview.
 */
export function useTermContext(selected: string | undefined): TermContext {
  const structure = useStructure();
  const needsFallback = !structure.data && !structure.isLoading;
  const overview = useFinanceOverview(undefined, needsFallback && !selected);
  if (structure.data) {
    const terms = termOptions(structure.data);
    const t = terms.find((x) => x.id === selected) ?? currentTerm(structure.data);
    return { termId: t?.id, termName: t?.label, canPick: true, structure: structure.data };
  }
  if (selected) return { termId: selected, termName: undefined, canPick: false, structure: undefined };
  return { termId: overview.data?.term.id, termName: overview.data?.term.name, canPick: false, structure: undefined };
}

export function FinanceTermSelect({ ctx, onChange, className }: { ctx: TermContext; onChange: (termId: string | undefined) => void; className?: string }) {
  if (ctx.canPick && ctx.structure) {
    return <TermSelect structure={ctx.structure} value={ctx.termId} onChange={onChange} aria-label="Term" className={className} />;
  }
  return (
    <div className={cn('flex h-10 items-center rounded-lg border border-dashed border-border px-3 text-[13px] text-muted-foreground', className)}>
      {ctx.termName ? `${ctx.termName} (current)` : 'Current term'}
    </div>
  );
}

// ------------------------------------------------------------------ bits

export function EmptyChart({ text }: { text: string }) {
  return (
    <div className="grid h-full place-items-center rounded-xl border border-dashed border-border bg-muted/30 px-6 text-center text-[13px] text-muted-foreground">
      {text}
    </div>
  );
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** A labelled amount row used on invoices and receipts. */
export function AmountRow({ label, value, strong, tone, className }: { label: React.ReactNode; value: string; strong?: boolean; tone?: 'success' | 'danger'; className?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-1', className)}>
      <dt className={cn('text-[13px] text-muted-foreground', strong && 'font-medium text-foreground')}>{label}</dt>
      <dd
        className={cn(
          'tabular',
          strong ? 'font-display text-[18px] font-semibold' : 'text-[13.5px] font-medium',
          tone === 'success' && 'text-success',
          tone === 'danger' && 'text-danger',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
