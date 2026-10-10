import type { BillingStatus } from '@aischool/shared';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Hourglass, Lock } from 'lucide-react';
import { Link } from 'react-router';
import { api } from '@/lib/api';
import { useAuthStore, useCan } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

export const BILLING_STATUS_KEY = ['billing', 'status'] as const;

/**
 * The strip above every page when a school's subscription needs attention:
 * the last week of the trial, the grace period, and read-only mode. Only for
 * schools whose billing rules are on (never the demo schools or grandfathered ones).
 */
export function BillingBanner() {
  const tenantId = useAuthStore((s) => s.me?.tenant?.id);
  const platform = useAuthStore((s) => !!s.me?.user.platformRole);
  const canPay = useCan('billing.manage');
  const q = useQuery({
    queryKey: [...BILLING_STATUS_KEY, tenantId],
    queryFn: ({ signal }) => api.get<BillingStatus>('/billing/status', undefined, signal),
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
    meta: { silent: true },
  });
  const s = q.data;
  if (!s || !s.enforced || s.state === 'OK' || (s.state === 'TRIAL' && (s.daysLeft ?? 99) > 7)) return null;
  // Platform staff looking into a school see it too, but staff and parents get a gentler message.
  const action = canPay ? (
    <Link to="/settings/billing" className="font-semibold underline underline-offset-2">
      {s.state === 'TRIAL' ? 'Choose a plan' : 'Pay now'}
    </Link>
  ) : (
    <span>Please let the school office know.</span>
  );
  const tone = s.state === 'READ_ONLY' ? 'danger' : s.state === 'GRACE' ? 'warning' : 'info';
  const Icon = s.state === 'READ_ONLY' ? Lock : s.state === 'GRACE' ? AlertTriangle : Hourglass;
  const text =
    s.state === 'TRIAL'
      ? `${s.daysLeft === 1 ? 'Your free trial ends tomorrow' : `${s.daysLeft} days left in your free trial`}.`
      : s.state === 'GRACE'
        ? `${s.reason === 'TRIAL_ENDED' ? 'Your free trial has ended' : 'Your subscription payment is overdue'}. Everything keeps working until ${s.readOnlyAt ? formatDate(s.readOnlyAt) : 'soon'}, then the school becomes read-only.`
        : 'This school is read-only: you can view and export, but not add or change anything until the subscription is paid. No data has been deleted.';
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2 border-b px-4 py-2 text-[13px] sm:items-center sm:px-6',
        tone === 'danger' && 'border-danger/30 bg-danger-soft/60 text-danger',
        tone === 'warning' && 'border-warning/30 bg-warning-soft/60 text-warning',
        tone === 'info' && 'border-brand/20 bg-brand-soft/50 text-brand',
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0 sm:mt-0" aria-hidden />
      <p className="min-w-0 flex-1">
        {text} {!platform || canPay ? action : null}
      </p>
    </div>
  );
}
