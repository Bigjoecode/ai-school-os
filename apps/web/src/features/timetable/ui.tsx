import type { BellSchedule, TimetableEntryView, TimetableSummary } from '@aischool/shared';
import { AlertTriangle, Clock, RotateCw } from 'lucide-react';
import type * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, hueFromString } from '@/lib/utils';

// ------------------------------------------------------------------ colour

/** A stable hue per subject, spread around the wheel so neighbours differ. */
export function subjectHue(code: string): number {
  return Math.round((hueFromString(code.toUpperCase()) * 137.508) % 360);
}

export function subjectVars(code: string): React.CSSProperties {
  return { '--h': subjectHue(code) } as React.CSSProperties;
}

/** Tinted lesson surface driven by `--h` (see subjectVars). Works in light, dark and print. */
export const lessonTint =
  'border-[hsl(var(--h)_55%_82%)] bg-[hsl(var(--h)_85%_96%)] text-[hsl(var(--h)_55%_22%)] dark:border-[hsl(var(--h)_40%_28%)] dark:bg-[hsl(var(--h)_45%_14%)] dark:text-[hsl(var(--h)_80%_86%)] print:border-[hsl(var(--h)_45%_70%)] print:bg-[hsl(var(--h)_85%_95%)] print:text-[hsl(var(--h)_55%_20%)]';

export const lessonAccent = 'bg-[hsl(var(--h)_70%_55%)] dark:bg-[hsl(var(--h)_75%_62%)]';

export function SubjectDot({ code, className }: { code: string; className?: string }) {
  return <span aria-hidden style={subjectVars(code)} className={cn('inline-block size-2 shrink-0 rounded-full', lessonAccent, className)} />;
}

// ------------------------------------------------------------------ labels

export const armLabel = (e: Pick<TimetableEntryView, 'classArm'>) => `${e.classArm.levelName} ${e.classArm.name}`;

export function periodTime(bell: BellSchedule, index: number): string {
  const p = bell.periods[index];
  return p ? `${p.start}–${p.end}` : '';
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

// ------------------------------------------------------------------ badges

export function TimetableStatusBadge({ t, className }: { t: Pick<TimetableSummary, 'status' | 'generation'>; className?: string }) {
  if (t.generation === 'QUEUED' || t.generation === 'RUNNING') {
    return (
      <Badge variant="info" className={cn('gap-1.5', className)}>
        <span className="relative flex size-1.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
        Building…
      </Badge>
    );
  }
  if (t.generation === 'FAILED') {
    return (
      <Badge variant="danger" className={className}>
        <AlertTriangle /> Failed
      </Badge>
    );
  }
  if (t.status === 'PUBLISHED') {
    return (
      <Badge variant="success" className={cn('gap-1.5', className)}>
        <span className="relative flex size-1.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-50" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
        Live
      </Badge>
    );
  }
  if (t.status === 'ARCHIVED') {
    return (
      <Badge variant="outline" className={className}>
        Archived
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" dot className={className}>
      Draft
    </Badge>
  );
}

// ------------------------------------------------------------------ progress ring

export function ProgressRing({ value, max, size = 76, stroke = 7, className }: { value: number; max: number; size?: number; stroke?: number; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const complete = pct >= 1;
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label={`${value} of ${max} placed`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={complete ? 'var(--success)' : pct > 0.9 ? 'var(--warning)' : 'var(--danger)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-display text-[15px] font-semibold tabular">{Math.round(pct * 100)}%</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ building / failed

/** Shown while the solver works: a little grid of lessons "falling into place". */
export function BuildingPanel({ lessons, state, name }: { lessons: number | null; state: TimetableSummary['generation']; name: string }) {
  const cells = Array.from({ length: 40 });
  return (
    <Card className="relative overflow-hidden" role="status" aria-live="polite">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-brand/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 size-72 rounded-full bg-chart-2/10 blur-3xl" />
      <div className="relative flex flex-col items-center gap-6 px-6 py-12 text-center sm:py-16">
        <div aria-hidden className="grid grid-cols-8 gap-1.5 rounded-2xl border border-border bg-card p-3 shadow-soft">
          {cells.map((_, i) => {
            const code = ['MTH', 'ENG', 'BIO', 'CHM', 'PHY', 'CIV', 'ICT', 'AGR'][(i * 5) % 8];
            return (
              <span
                key={i}
                style={{ ...subjectVars(code), animationDelay: `${(i % 8) * 0.12 + Math.floor(i / 8) * 0.18}s` }}
                className={cn('size-4 rounded-[4px] opacity-20 animate-[tt-fill_2.4s_ease-in-out_infinite] sm:size-5', lessonAccent)}
              />
            );
          })}
        </div>
        <div className="max-w-md">
          <p className="font-display text-lg font-semibold tracking-tight">
            {state === 'QUEUED' ? 'Getting the solver ready…' : lessons ? `The solver is arranging ${lessons.toLocaleString()} lessons…` : 'The solver is arranging your lessons…'}
          </p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
            Building <span className="font-medium text-foreground">{name}</span> — checking every class, teacher and room so nothing clashes. This usually takes 5–15 seconds.
          </p>
        </div>
        <div className="relative h-1 w-full max-w-xs overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="absolute inset-y-0 w-1/3 animate-[job-slide_1.4s_ease-in-out_infinite] rounded-full bg-brand" />
        </div>
      </div>
    </Card>
  );
}

export function BuildFailedPanel({ message, onRetry, retrying }: { message: string | null; onRetry?: () => void; retrying?: boolean }) {
  return (
    <Card className="border-danger/30">
      <div className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-danger-soft text-danger">
          <AlertTriangle className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold tracking-tight">The timetable couldn’t be built</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{message || 'Something went wrong while building. Please try again.'}</p>
        </div>
        {onRetry && (
          <Button variant="outline" onClick={onRetry} loading={retrying}>
            {!retrying && <RotateCw />} Try again
          </Button>
        )}
      </div>
    </Card>
  );
}

export function GridSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-36 w-full rounded-2xl" />
      <Card className="p-4">
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: 36 }).map((_, i) => (
            <Skeleton key={i} className={cn('h-12 rounded-lg', i % 6 === 0 && 'opacity-60')} />
          ))}
        </div>
      </Card>
    </div>
  );
}

export function TimeChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] tabular text-muted-foreground">
      <Clock className="size-3" aria-hidden />
      {children}
    </span>
  );
}
