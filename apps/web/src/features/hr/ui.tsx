import type { AiText, EmployeeRow, LeaveStatus, PayrollStatus } from '@aischool/shared';
import { ArrowRight, Check, Inbox, RotateCw, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { Link } from 'react-router';
import type * as React from 'react';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Markdown } from '@/components/ai/markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useLeave, useStaffOptions } from './api';

// ------------------------------------------------------------------ badges

const LEAVE_STATUS: Record<LeaveStatus, { label: string; variant: 'warning' | 'success' | 'danger' | 'outline' }> = {
  PENDING: { label: 'Pending', variant: 'warning' },
  APPROVED: { label: 'Approved', variant: 'success' },
  DECLINED: { label: 'Declined', variant: 'danger' },
  CANCELLED: { label: 'Cancelled', variant: 'outline' },
};

export function LeaveStatusBadge({ status, className }: { status: LeaveStatus; className?: string }) {
  const s = LEAVE_STATUS[status];
  return (
    <Badge variant={s.variant} dot={status !== 'CANCELLED'} className={className}>
      {s.label}
    </Badge>
  );
}

const RUN_STATUS: Record<PayrollStatus, { label: string; variant: 'secondary' | 'info' | 'success' }> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  APPROVED: { label: 'Approved', variant: 'info' },
  PAID: { label: 'Paid', variant: 'success' },
};

export function PayrollStatusBadge({ status, className }: { status: PayrollStatus; className?: string }) {
  const s = RUN_STATUS[status];
  return (
    <Badge variant={s.variant} dot className={className}>
      {s.label}
    </Badge>
  );
}

export function EmployeeStatusBadge({ status, onLeaveUntil, className }: { status: EmployeeRow['status']; onLeaveUntil?: string | null; className?: string }) {
  if (onLeaveUntil)
    return (
      <Badge variant="info" dot className={className}>
        On leave until {shortDate(onLeaveUntil)}
      </Badge>
    );
  if (status === 'ON_LEAVE')
    return (
      <Badge variant="info" dot className={className}>
        On leave
      </Badge>
    );
  if (status === 'EXITED')
    return (
      <Badge variant="outline" className={className}>
        Left
      </Badge>
    );
  return (
    <Badge variant="success" dot className={className}>
      Active
    </Badge>
  );
}

export const STAFF_TYPE_LABEL: Record<EmployeeRow['type'], string> = { TEACHING: 'Teaching', NON_TEACHING: 'Non-teaching' };

// ------------------------------------------------------------------ dates & numbers

/** "12 Oct" — the year is left off. */
export function shortDate(iso: string) {
  return formatDate(iso, { day: 'numeric', month: 'short', year: undefined });
}

export function dateRange(start: string, end: string) {
  if (start === end) return formatDate(start, { weekday: 'short', day: 'numeric', month: 'short', year: undefined });
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${formatDate(start, { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' })} – ${formatDate(end)}`;
}

export function yearsLabel(years: number | null | undefined) {
  if (years == null) return '—';
  if (years < 1) return 'Under a year';
  return `${years} year${years === 1 ? '' : 's'}`;
}

export function daysLabel(n: number) {
  return `${n} day${n === 1 ? '' : 's'}`;
}

/** % change from `prev` to `curr`, or null when there's nothing to compare. */
export function pctChange(curr: number, prev: number | null | undefined): number | null {
  if (prev == null || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

/** +4.2% chip. `invert` colours a rise as bad (e.g. costs). */
export function DeltaChip({ value, invert, neutral, className }: { value: number | null; invert?: boolean; neutral?: boolean; className?: string }) {
  if (value == null) return null;
  const flat = Math.abs(value) < 0.05;
  const up = value > 0;
  const good = invert ? !up : up;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular',
        flat || neutral ? 'bg-muted text-muted-foreground' : good ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
        className,
      )}
    >
      {!flat && (up ? <TrendingUp className="size-3" aria-hidden /> : <TrendingDown className="size-3" aria-hidden />)}
      {flat ? '0%' : `${up ? '+' : '−'}${Math.abs(value).toFixed(Math.abs(value) < 10 ? 1 : 0)}%`}
    </span>
  );
}

/** "••••5095" */
export function maskAccount(acc: string | null | undefined) {
  if (!acc) return '—';
  return `••••${acc.slice(-4)}`;
}

// ------------------------------------------------------------------ pickers

/** Pick a current staff member. Lists everyone not exited (up to 200). */
export function StaffSelect({
  id,
  value,
  onChange,
  placeholder = 'Choose a staff member',
  invalid,
  allowNone,
  noneLabel = 'Nobody',
  disabled,
}: {
  id?: string;
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  placeholder?: string;
  invalid?: boolean;
  allowNone?: boolean;
  noneLabel?: string;
  disabled?: boolean;
}) {
  const staff = useStaffOptions();
  const rows = staff.data?.items ?? [];
  return (
    <Select value={value ?? (allowNone ? NONE : undefined)} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={disabled || staff.isLoading}>
      <SelectTrigger id={id} invalid={invalid}>
        <SelectValue placeholder={staff.isLoading ? 'Loading staff…' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
        {rows.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name} <span className="text-muted-foreground">· {s.jobTitle}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ------------------------------------------------------------------ AI panel

/** The house AI card: a button that writes something, then renders it as markdown. */
export function AiTextCard({
  id,
  title,
  description,
  points,
  result,
  pending,
  onRun,
  runLabel,
  pendingLabel,
  footnote,
  className,
}: {
  id?: string;
  title: string;
  description: string;
  points: [React.ComponentType<{ className?: string }>, string][];
  result: AiText | null;
  pending: boolean;
  onRun: () => void;
  runLabel: string;
  pendingLabel: string;
  footnote: string;
  className?: string;
}) {
  return (
    <Card id={id} className={cn('ai-border relative overflow-hidden border-transparent', className)}>
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-ai-2/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 left-10 size-56 rounded-full bg-ai-3/10 blur-3xl" />
      <div className="relative p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-ai-gradient shadow-[0_6px_20px_-6px_var(--ai-2)]">
              <AiSparkle className="size-5 [&_path]:fill-white" animated={pending} />
            </div>
            <div className="min-w-0">
              <p className="font-display text-[15px] font-semibold tracking-tight">
                <span className="text-ai-gradient">{title}</span>
              </p>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">{description}</p>
            </div>
          </div>
          <Button variant={result ? 'outline' : 'ai'} size="sm" onClick={onRun} loading={pending} className="shrink-0">
            {!pending && (result ? <RotateCw /> : <Sparkles />)} {result ? 'Refresh' : pending ? pendingLabel : runLabel}
          </Button>
        </div>
        {pending && !result && (
          <div className="mt-5 space-y-2.5" aria-live="polite" aria-busy>
            <p className="text-[12.5px] text-muted-foreground">This takes 10–30 seconds…</p>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        )}
        {!pending && !result && (
          <ul className="mt-5 grid gap-2 text-[12.5px] text-muted-foreground sm:grid-cols-3 [&>*]:min-w-0">
            {points.map(([Icon, text]) => (
              <li key={text} className="flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2.5">
                <Icon className="size-3.5 shrink-0 text-ai-2" aria-hidden /> {text}
              </li>
            ))}
          </ul>
        )}
        {result && (
          <div className={cn('mt-5 border-t border-border pt-5 transition-opacity', pending && 'opacity-50')}>
            <Markdown text={result.text} className="text-[13.5px]" />
            <p className="mt-4 text-[11.5px] text-muted-foreground">
              Generated by {result.provider} · {result.model}. {footnote}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ bits

/** A small label/value pair for detail grids. */
export function Detail({ label, children, mono, className }: { label: string; children: React.ReactNode; mono?: boolean; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 break-words text-[13.5px]', mono && 'font-mono text-[12.5px]')}>{children ?? '—'}</dd>
    </div>
  );
}

/** Status stepper: Draft → Approved → Paid. */
export function RunStepper({ status, className }: { status: PayrollStatus; className?: string }) {
  const steps: PayrollStatus[] = ['DRAFT', 'APPROVED', 'PAID'];
  const at = steps.indexOf(status);
  return (
    <ol className={cn('flex items-center gap-1.5', className)} aria-label="Payroll progress">
      {steps.map((s, i) => {
        const done = i < at || status === 'PAID';
        const current = i === at && status !== 'PAID';
        return (
          <li key={s} className="flex items-center gap-1.5" aria-current={current ? 'step' : undefined}>
            {i > 0 && <span aria-hidden className={cn('h-px w-5 sm:w-8', i <= at ? 'bg-brand' : 'bg-border')} />}
            <span
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium',
                done && 'border-transparent bg-success-soft text-success',
                current && 'border-brand/40 bg-brand-soft text-brand',
                !done && !current && 'border-border text-muted-foreground',
              )}
            >
              {done ? <Check className="size-3.5" aria-hidden /> : <span aria-hidden className={cn('size-1.5 rounded-full', current ? 'bg-brand' : 'bg-border-strong')} />}
              {RUN_STATUS[s].label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ------------------------------------------------------------------ dashboard

/** A quiet link on the dashboard when leave requests are waiting for this approver. */
export function PendingLeaveNotice() {
  const canApprove = useCan('leave.approve');
  const canRead = useCan('hr.read');
  const q = useLeave({ status: 'PENDING' }, canApprove && canRead);
  const n = q.data?.length ?? 0;
  if (!canApprove || !canRead || n === 0) return null;
  return (
    <Link
      to="/hr/leave?status=PENDING"
      className="group flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning-soft/40 px-4 py-3 text-[13px] transition-colors hover:bg-warning-soft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Inbox className="size-4 shrink-0 text-warning" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="font-medium">
          {n} leave request{n === 1 ? '' : 's'} waiting for your decision
        </span>
        <span className="hidden text-muted-foreground sm:inline"> · {q.data!.slice(0, 3).map((r) => r.staff.name).join(', ')}{n > 3 ? '…' : ''}</span>
      </span>
      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}
