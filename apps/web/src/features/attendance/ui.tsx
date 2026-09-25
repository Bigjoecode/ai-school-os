import {
  type AttendanceCounts,
  type AttendanceStatus,
  CHRONIC_ABSENCE_THRESHOLD,
  type StaffAttendanceStatus,
} from '@aischool/shared';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import type * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tip } from '@/components/ui/tooltip';
import { useAuthStore } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

// ------------------------------------------------------------------ status meta

export interface StatusMeta {
  label: string;
  letter: string;
  /** Solid fill (bars, heatmap cells, selected segment). */
  fill: string;
  /** Soft chip styling. */
  soft: string;
  /** CSS colour for charts. */
  color: string;
}

export const STATUS_META: Record<AttendanceStatus, StatusMeta> = {
  PRESENT: { label: 'Present', letter: 'P', fill: 'bg-success text-white', soft: 'bg-success-soft text-success', color: 'var(--success)' },
  LATE: { label: 'Late', letter: 'L', fill: 'bg-warning text-white', soft: 'bg-warning-soft text-warning', color: 'var(--warning)' },
  ABSENT: { label: 'Absent', letter: 'A', fill: 'bg-danger text-white', soft: 'bg-danger-soft text-danger', color: 'var(--danger)' },
  EXCUSED: { label: 'Excused', letter: 'E', fill: 'bg-info text-white', soft: 'bg-info-soft text-info', color: 'var(--info)' },
};

/** Marking order in the segmented control. */
export const MARK_ORDER: AttendanceStatus[] = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'];

export const STAFF_STATUS_LABEL: Record<StaffAttendanceStatus, string> = {
  PRESENT: 'Present',
  LATE: 'Late',
  ABSENT: 'Absent',
  ON_LEAVE: 'On leave',
};

export const STAFF_STATUS_SOFT: Record<StaffAttendanceStatus, string> = {
  PRESENT: 'bg-success-soft text-success',
  LATE: 'bg-warning-soft text-warning',
  ABSENT: 'bg-danger-soft text-danger',
  ON_LEAVE: 'bg-info-soft text-info',
};

export const WEEKDAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ------------------------------------------------------------------ numbers

export function rateTone(rate: number | null | undefined): 'success' | 'warning' | 'danger' | 'muted' {
  if (rate == null) return 'muted';
  if (rate >= 95) return 'success';
  if (rate >= CHRONIC_ABSENCE_THRESHOLD) return 'warning';
  return 'danger';
}

export const toneText: Record<ReturnType<typeof rateTone>, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  muted: 'text-muted-foreground',
};

export const toneColor: Record<ReturnType<typeof rateTone>, string> = {
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  muted: 'var(--border-strong)',
};

export function fmtRate(rate: number | null | undefined, digits = 1): string {
  if (rate == null) return '—';
  return `${Number.isInteger(rate) ? rate : rate.toFixed(digits)}%`;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function totalMarked(c: AttendanceCounts) {
  return c.present + c.late + c.absent + c.excused;
}

// ------------------------------------------------------------------ dates

function isoToUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function utcToIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(iso: string): number {
  const d = isoToUtc(iso).getUTCDay();
  return d === 0 ? 7 : d;
}

export function addDays(iso: string, n: number): string {
  const d = isoToUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return utcToIso(d);
}

/** The next/previous weekday (Mon–Fri). The server still has the final say via `schoolDay`. */
export function shiftSchoolDay(iso: string, dir: 1 | -1): string {
  let d = addDays(iso, dir);
  for (let i = 0; i < 7 && isoWeekday(d) > 5; i++) d = addDays(d, dir);
  return d;
}

export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

export function longDate(iso: string) {
  return formatDate(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** The school's time zone: attendance times are shown as the school experiences them, wherever the viewer is. */
export function schoolTimeZone(): string | undefined {
  return useAuthStore.getState().me?.tenant?.timezone ?? undefined;
}

/** Clock time for an ISO timestamp, in the school's time zone. */
export function clockTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZone: schoolTimeZone() }).format(d);
}

// ------------------------------------------------------------------ date stepper

export function DateStepper({
  value,
  onChange,
  max,
  label = 'Date',
  className,
}: {
  value: string;
  onChange: (iso: string) => void;
  max?: string;
  label?: string;
  className?: string;
}) {
  const next = shiftSchoolDay(value, 1);
  const nextDisabled = !!max && next > max;
  return (
    <div className={cn('flex h-10 items-center rounded-lg border border-input bg-card shadow-xs', className)}>
      <Button variant="ghost" size="icon-sm" className="h-full rounded-r-none" aria-label="Previous school day" onClick={() => onChange(shiftSchoolDay(value, -1))}>
        <ChevronLeft />
      </Button>
      <label className="relative flex h-full min-w-0 flex-1 items-center gap-2 border-x border-border px-2.5 text-[13px]">
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="sr-only">{label}</span>
        <input
          type="date"
          value={value}
          max={max}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent tabular outline-none [color-scheme:light] dark:[color-scheme:dark]"
        />
      </label>
      <Button
        variant="ghost"
        size="icon-sm"
        className="h-full rounded-l-none"
        aria-label="Next school day"
        disabled={nextDisabled}
        onClick={() => onChange(next)}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

// ------------------------------------------------------------------ chips & bars

export function RateChip({ rate, className, title }: { rate: number | null | undefined; className?: string; title?: string }) {
  const tone = rateTone(rate);
  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-full px-1.5 text-[11px] font-semibold tabular',
        tone === 'success' && 'bg-success-soft text-success',
        tone === 'warning' && 'bg-warning-soft text-warning',
        tone === 'danger' && 'bg-danger-soft text-danger',
        tone === 'muted' && 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {fmtRate(rate, 0)}
    </span>
  );
}

/** Present / late / absent / excused as one thin stacked bar. */
export function StackedBar({ counts, total, className }: { counts: AttendanceCounts; total?: number; className?: string }) {
  const marked = totalMarked(counts);
  const denom = Math.max(total ?? marked, marked, 1);
  const parts: [AttendanceStatus, number][] = [
    ['PRESENT', counts.present],
    ['LATE', counts.late],
    ['ABSENT', counts.absent],
    ['EXCUSED', counts.excused],
  ];
  const label = parts.map(([s, n]) => `${n} ${STATUS_META[s].label.toLowerCase()}`).join(', ');
  return (
    <div role="img" aria-label={label} className={cn('flex h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      {parts.map(([s, n]) =>
        n > 0 ? <span key={s} className={cn('h-full transition-[width] duration-700', STATUS_META[s].fill)} style={{ width: `${(n / denom) * 100}%` }} /> : null,
      )}
    </div>
  );
}

export function CountLegend({ counts, className }: { counts: AttendanceCounts; className?: string }) {
  const rows: [AttendanceStatus, number][] = [
    ['PRESENT', counts.present],
    ['LATE', counts.late],
    ['ABSENT', counts.absent],
    ['EXCUSED', counts.excused],
  ];
  return (
    <div className={cn('flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted-foreground', className)}>
      {rows.map(([s, n]) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn('size-2 rounded-full', STATUS_META[s].fill)} />
          <span className="font-medium tabular text-foreground">{n}</span> {STATUS_META[s].label.toLowerCase()}
        </span>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ ring

export function RateRing({ rate, size = 120, stroke = 10, label = 'attendance' }: { rate: number | null; size?: number; stroke?: number; label?: string }) {
  const pct = rate == null ? 0 : Math.max(0, Math.min(100, rate)) / 100;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = rateTone(rate);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label={`${fmtRate(rate)} ${label}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={toneColor[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className={cn('font-display font-semibold leading-none tabular', size >= 110 ? 'text-[26px]' : 'text-[17px]')}>{fmtRate(rate)}</p>
          {size >= 110 && <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ tiles

export function StatTile({
  label,
  icon,
  value,
  sub,
  tone,
  loading,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: 'success' | 'warning' | 'danger' | 'muted';
  loading?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
        <span className="grid size-8 place-items-center rounded-lg border border-border bg-muted/50 text-muted-foreground [&_svg]:size-4">{icon}</span>
      </div>
      {loading ? (
        <>
          <Skeleton className="mt-3 h-9 w-24" />
          <Skeleton className="mt-3 h-3.5 w-40" />
        </>
      ) : (
        <>
          <p className={cn('mt-3 font-display text-[32px] font-semibold leading-none tracking-[-0.03em] tabular', tone && tone !== 'muted' && toneText[tone])}>
            {value}
          </p>
          {sub && <div className="mt-2.5 text-[12.5px] text-muted-foreground">{sub}</div>}
          {children && <div className="mt-3">{children}</div>}
        </>
      )}
    </Card>
  );
}

export function StreakBadge({ days }: { days: number }) {
  if (days < 2) return null;
  return (
    <Tip label={`Absent ${days} school days in a row, including today`}>
      <span
        tabIndex={0}
        className={cn(
          'inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold tabular focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          days >= 3 ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning',
        )}
      >
        {days} days in a row
      </span>
    </Tip>
  );
}
