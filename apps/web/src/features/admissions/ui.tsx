import { ADMISSION_STATUS_LABELS, type AdmissionStatus } from '@aischool/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { schoolTimeZone } from '../finance/ui';

/** Dot colour per status (board columns, badges). */
export const STATUS_DOT: Record<AdmissionStatus, string> = {
  SUBMITTED: 'bg-info',
  REVIEWING: 'bg-chart-2',
  EXAM_SCHEDULED: 'bg-chart-3',
  INTERVIEW: 'bg-chart-4',
  OFFERED: 'bg-chart-5',
  ACCEPTED: 'bg-brand',
  ENROLLED: 'bg-success',
  WAITLISTED: 'bg-warning',
  REJECTED: 'bg-danger',
  WITHDRAWN: 'bg-border-strong',
};

export function AdmissionStatusBadge({ status, className }: { status: AdmissionStatus; className?: string }) {
  const variant = status === 'ENROLLED' ? 'success' : status === 'REJECTED' ? 'danger' : status === 'WAITLISTED' ? 'warning' : status === 'OFFERED' || status === 'ACCEPTED' ? 'brand' : 'outline';
  return (
    <Badge variant={variant} className={cn('gap-1.5', className)}>
      {variant === 'outline' && <span className={cn('size-1.5 rounded-full', STATUS_DOT[status])} aria-hidden />}
      {ADMISSION_STATUS_LABELS[status]}
    </Badge>
  );
}

/** "Tue 14 Oct, 9:00 am" in the school's time zone. */
export function shortWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { timeZone: schoolTimeZone(), weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
}

/** Age in years from a YYYY-MM-DD birth date. */
export function ageOf(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const [y, m, d] = dob.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y!;
  if (now.getMonth() + 1 < m! || (now.getMonth() + 1 === m && now.getDate() < d!)) age--;
  return age >= 0 && age < 40 ? age : null;
}

/** For <input type="datetime-local">: an ISO instant → local "YYYY-MM-DDTHH:MM", and back. */
export function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInputValue(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
