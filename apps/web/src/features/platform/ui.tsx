import type {
  PlatformInvoiceRow,
  PlatformPaymentRow,
  PlatformRole,
  SubscriptionStatusKey,
  TenantStatusKey,
  TicketPriority,
  TicketStatus,
} from '@aischool/shared';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight } from 'lucide-react';
import * as React from 'react';
import { Link, useSearchParams } from 'react-router';
import { SchoolLogo } from '@/components/layout/tenant-switcher';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// ------------------------------------------------------------------ badges

const TENANT_STATUS: Record<TenantStatusKey, { label: string; variant: BadgeProps['variant'] }> = {
  ACTIVE: { label: 'Active', variant: 'success' },
  TRIAL: { label: 'Trial', variant: 'brand' },
  SUSPENDED: { label: 'Suspended', variant: 'danger' },
  ARCHIVED: { label: 'Archived', variant: 'secondary' },
};

export function TenantStatusBadge({ status }: { status: TenantStatusKey }) {
  const s = TENANT_STATUS[status] ?? { label: status, variant: 'secondary' };
  return (
    <Badge variant={s.variant} dot>
      {s.label}
    </Badge>
  );
}

export const SUB_STATUS_LABEL: Record<SubscriptionStatusKey, string> = {
  TRIALING: 'Trialing',
  ACTIVE: 'Active',
  PAST_DUE: 'Past due',
  CANCELLED: 'Cancelled',
};
const SUB_STATUS_VARIANT: Record<SubscriptionStatusKey, BadgeProps['variant']> = {
  TRIALING: 'brand',
  ACTIVE: 'success',
  PAST_DUE: 'danger',
  CANCELLED: 'secondary',
};

export function SubStatusBadge({ status }: { status: SubscriptionStatusKey | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={SUB_STATUS_VARIANT[status]}>{SUB_STATUS_LABEL[status]}</Badge>;
}

export function PlatformInvoiceBadge({ invoice }: { invoice: Pick<PlatformInvoiceRow, 'status' | 'overdue' | 'paidKobo'> }) {
  if (invoice.status === 'OPEN' && invoice.overdue) return <Badge variant="danger">Overdue</Badge>;
  if (invoice.status === 'OPEN' && invoice.paidKobo > 0) return <Badge variant="warning">Part paid</Badge>;
  if (invoice.status === 'OPEN') return <Badge variant="info">Open</Badge>;
  if (invoice.status === 'PAID') return <Badge variant="success">Paid</Badge>;
  return <Badge variant="outline">Void</Badge>;
}

export function PaymentStatusPill({ status }: { status: PlatformPaymentRow['status'] }) {
  if (status === 'SUCCESS') return <Badge variant="success">Received</Badge>;
  if (status === 'PENDING') return <Badge variant="warning">Pending</Badge>;
  return <Badge variant="danger">Failed</Badge>;
}

export const PAYMENT_METHOD_LABEL: Record<PlatformPaymentRow['method'], string> = {
  PAYSTACK: 'Paystack',
  BANK_TRANSFER: 'Bank transfer',
  CASH: 'Cash',
  OTHER: 'Other',
};

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: 'Open',
  PENDING: 'Waiting on school',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};
const TICKET_STATUS_VARIANT: Record<TicketStatus, BadgeProps['variant']> = {
  OPEN: 'info',
  PENDING: 'warning',
  RESOLVED: 'success',
  CLOSED: 'secondary',
};

export function TicketStatusBadge({ status, schoolView }: { status: TicketStatus; schoolView?: boolean }) {
  const label = schoolView && status === 'PENDING' ? 'Awaiting your reply' : schoolView && status === 'OPEN' ? 'With support' : TICKET_STATUS_LABEL[status];
  return (
    <Badge variant={TICKET_STATUS_VARIANT[status]} dot>
      {label}
    </Badge>
  );
}

export const PRIORITY_LABEL: Record<TicketPriority, string> = { LOW: 'Low', NORMAL: 'Normal', HIGH: 'High', URGENT: 'Urgent' };

export function PriorityBadge({ priority, quiet }: { priority: TicketPriority; quiet?: boolean }) {
  if (priority === 'URGENT') return <Badge variant="danger">Urgent</Badge>;
  if (priority === 'HIGH') return <Badge variant="warning">High</Badge>;
  if (quiet) return null;
  return <Badge variant="outline">{PRIORITY_LABEL[priority]}</Badge>;
}

export const PLATFORM_ROLE_LABEL: Record<PlatformRole, string> = {
  SUPER_ADMIN: 'Super admin',
  SUPPORT_ADMIN: 'Support',
  FINANCE_ADMIN: 'Finance',
};

export function PlatformRoleBadge({ role }: { role: PlatformRole }) {
  return <Badge variant={role === 'SUPER_ADMIN' ? 'brand' : role === 'FINANCE_ADMIN' ? 'success' : 'info'}>{PLATFORM_ROLE_LABEL[role]}</Badge>;
}

export const FEATURE_SOURCE: Record<string, { label: string; hint: string; variant: BadgeProps['variant'] }> = {
  PLAN: { label: 'Plan', hint: 'Follows the school’s plan', variant: 'secondary' },
  OVERRIDE: { label: 'Override', hint: 'Set for this school only', variant: 'brand' },
  NO_PLAN: { label: 'No plan', hint: 'Schools without a plan get every module', variant: 'outline' },
  ROLLOUT: { label: 'Rollout', hint: 'Decided by the flag’s rollout percentage', variant: 'info' },
  DEFAULT: { label: 'Everyone', hint: 'Rolled out to every school', variant: 'info' },
  MASTER_OFF: { label: 'Master off', hint: 'Switched off for every school in Feature flags', variant: 'danger' },
};

export function FeatureSourceBadge({ source }: { source: string }) {
  const s = FEATURE_SOURCE[source] ?? { label: source, hint: '', variant: 'outline' as const };
  return (
    <Badge variant={s.variant} title={s.hint}>
      {s.label}
    </Badge>
  );
}

export function NeedsReply({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11.5px] font-medium text-brand', className)}>
      <span className="size-1.5 rounded-full bg-brand shadow-[0_0_0_3px_var(--brand-soft)]" aria-hidden /> Needs reply
    </span>
  );
}

// ------------------------------------------------------------------ cells

export function SchoolCell({ school, sub, link = true }: { school: { id: string; name: string; slug: string }; sub?: React.ReactNode; link?: boolean }) {
  const body = (
    <span className="flex min-w-0 items-center gap-2.5">
      <SchoolLogo tenant={{ name: school.name, shortName: null, logoUrl: null, primaryColor: null }} className="size-7 rounded-md text-[10px]" />
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] font-medium text-foreground">{school.name}</span>
        <span className="block truncate font-mono text-[11.5px] text-muted-foreground">{sub ?? school.slug}</span>
      </span>
    </span>
  );
  if (!link) return body;
  return (
    <Link
      to={`/platform/schools/${school.id}`}
      onClick={(e) => e.stopPropagation()}
      className="-m-1 block min-w-0 rounded-md p-1 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </Link>
  );
}

export function Muted({ children }: { children?: React.ReactNode }) {
  return <span className="text-muted-foreground">{children ?? '—'}</span>;
}

// ------------------------------------------------------------------ kpi

export function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  tone,
  to,
  loading,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: LucideIcon;
  tone?: 'danger' | 'warning' | 'success';
  to?: string;
  loading?: boolean;
}) {
  const inner = (
    <>
      <div className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
        {Icon && <Icon className={cn('size-3.5 shrink-0', tone === 'danger' && 'text-danger', tone === 'warning' && 'text-warning', tone === 'success' && 'text-success')} aria-hidden />}
        <span className="truncate">{label}</span>
        {to && <ArrowUpRight className="ml-auto size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-24" />
      ) : (
        <div className={cn('mt-1.5 truncate font-display text-[22px] font-semibold leading-tight tracking-tight tabular', tone === 'danger' && 'text-danger')}>{value}</div>
      )}
      {sub != null && <div className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">{loading ? ' ' : sub}</div>}
    </>
  );
  const cls = 'group block min-w-0 rounded-2xl border border-border bg-card p-4 shadow-soft transition-colors';
  return to ? (
    <Link to={to} className={cn(cls, 'hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

// ------------------------------------------------------------------ meter

export function Meter({ pct, className, label }: { pct: number | null; className?: string; label?: string }) {
  const v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const tone = pct == null ? 'bg-muted-foreground/30' : pct >= 100 ? 'bg-danger' : pct >= 85 ? 'bg-warning' : 'bg-chart-1';
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      aria-label={label}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-700', tone)} style={{ width: `${pct == null ? 0 : Math.max(v, 2)}%` }} />
    </div>
  );
}

// ------------------------------------------------------------------ sections

export function Section({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  flush,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Content runs edge to edge (tables). */
  flush?: boolean;
}) {
  return (
    <Card className={cn('min-w-0 overflow-hidden', className)}>
      <CardHeader className={cn(flush && 'pb-4 sm:pb-4')}>
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </CardHeader>
      {flush ? <div className={cn('border-t border-border', bodyClassName)}>{children}</div> : <CardContent className={bodyClassName}>{children}</CardContent>}
    </Card>
  );
}

/** Label/value pairs in a tidy two-column list. */
export function Facts({ rows, className }: { rows: [React.ReactNode, React.ReactNode][]; className?: string }) {
  return (
    <dl className={cn('divide-y divide-border text-[13px]', className)}>
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0">
          <dt className="shrink-0 text-muted-foreground">{k}</dt>
          <dd className="min-w-0 text-right font-medium [overflow-wrap:anywhere]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ------------------------------------------------------------------ filters

export const ALL = '__all__';

export function FilterSelect({
  value,
  onChange,
  options,
  label,
  allLabel,
  className,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  options: { value: string; label: string }[];
  label: string;
  allLabel: string;
  className?: string;
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
      <SelectTrigger aria-label={label} className={cn('h-9 w-full sm:w-[170px]', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A tab kept in the URL (?tab=…) so links and refreshes land on the same view. */
export function useTabParam<T extends string>(tabs: readonly T[], fallback: T): [T, (t: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as T | null;
  const tab = raw && tabs.includes(raw) ? raw : fallback;
  const set = (t: T) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (t === fallback) next.delete('tab');
        else next.set('tab', t);
        return next;
      },
      { replace: true },
    );
  return [tab, set];
}

/** A table toolbar: filters on the left, actions on the right, wrapping on phones. */
export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:flex-wrap sm:items-center sm:p-4', className)}>{children}</div>;
}

export function dayLabel(day: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(`${day.slice(0, 10)}T00:00:00`));
}

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

export function pctOf(part: number, whole: number | null | undefined): number | null {
  if (!whole) return null;
  return (part / whole) * 100;
}
