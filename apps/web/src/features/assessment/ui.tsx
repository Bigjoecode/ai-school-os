import { type AiJobView, type Difficulty, QUESTION_TYPE_LABELS, type QuestionCounts, type QuestionType } from '@aischool/shared';
import { AlertTriangle, CheckCircle2, Minus, Plus, X } from 'lucide-react';
import type * as React from 'react';
import { useCallback, useState } from 'react';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn, safeStorage } from '@/lib/utils';

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

// ------------------------------------------------------------------ remembered state

/** useState that survives reloads via localStorage (silently in-memory when storage is blocked). */
export function useStoredState<T>(key: string, initial: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const raw = safeStorage().get(key);
    if (!raw) return initial;
    try {
      return { ...initial, ...(JSON.parse(raw) as T) };
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: T) => {
      setValue(next);
      safeStorage().set(key, JSON.stringify(next));
    },
    [key],
  );
  return [value, set];
}

// ------------------------------------------------------------------ badges

const TYPE_VARIANT: Record<QuestionType, BadgeProps['variant']> = {
  MULTIPLE_CHOICE: 'brand',
  TRUE_FALSE: 'info',
  SHORT_ANSWER: 'secondary',
  THEORY: 'outline',
};

export function QuestionTypeBadge({ type }: { type: QuestionType }) {
  return <Badge variant={TYPE_VARIANT[type]}>{QUESTION_TYPE_LABELS[type]}</Badge>;
}

const DIFFICULTY: Record<Difficulty, { label: string; className: string; bars: number }> = {
  EASY: { label: 'Easy', className: 'text-success', bars: 1 },
  MEDIUM: { label: 'Medium', className: 'text-warning', bars: 2 },
  HARD: { label: 'Hard', className: 'text-danger', bars: 3 },
};

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const d = DIFFICULTY[difficulty];
  return (
    <Badge variant="outline" className="gap-1.5">
      <span aria-hidden className={cn('flex items-end gap-px', d.className)}>
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn('w-[3px] rounded-sm bg-current', i > d.bars && 'opacity-25')} style={{ height: 3 + i * 2 }} />
        ))}
      </span>
      {d.label}
    </Badge>
  );
}

const QSTATUS: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
  DRAFT: { label: 'Draft', variant: 'warning' },
  APPROVED: { label: 'Approved', variant: 'success' },
  RETIRED: { label: 'Retired', variant: 'outline' },
  FINAL: { label: 'Final', variant: 'success' },
  PUBLISHED: { label: 'Published', variant: 'success' },
};

export function AssessmentStatusBadge({ status, className }: { status: string; className?: string }) {
  const s = QSTATUS[status] ?? { label: status, variant: 'secondary' as const };
  return (
    <Badge variant={s.variant} dot className={className}>
      {s.label}
    </Badge>
  );
}

export function AiBadge({ label = 'AI' }: { label?: string }) {
  return (
    <Badge variant="outline" className="gap-1 border-ai-2/30 text-foreground">
      <AiSparkle className="size-3" animated={false} /> {label}
    </Badge>
  );
}

// ------------------------------------------------------------------ stepper

export function Stepper({
  id,
  value,
  onChange,
  min = 0,
  max,
  label,
  disabled,
}: {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max: number;
  label: string;
  disabled?: boolean;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, Number.isFinite(n) ? Math.round(n) : min));
  return (
    <div className="inline-flex h-9 items-center rounded-lg border border-input bg-card shadow-xs">
      <button
        type="button"
        aria-label={`Fewer ${label}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1))}
        className="grid h-full w-8 place-items-center rounded-l-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
      >
        <Minus className="size-3.5" />
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="h-full w-10 border-x border-input bg-transparent text-center text-[13.5px] font-medium tabular outline-none [appearance:textfield] focus-visible:bg-muted/50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        aria-label={`More ${label}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className="grid h-full w-8 place-items-center rounded-r-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ counts

export const COUNT_ROWS: { key: keyof QuestionCounts; type: QuestionType; max: number }[] = [
  { key: 'multipleChoice', type: 'MULTIPLE_CHOICE', max: 40 },
  { key: 'trueFalse', type: 'TRUE_FALSE', max: 20 },
  { key: 'shortAnswer', type: 'SHORT_ANSWER', max: 20 },
  { key: 'theory', type: 'THEORY', max: 10 },
];

export const COUNT_LABELS: Record<keyof QuestionCounts, string> = {
  multipleChoice: 'multiple-choice',
  trueFalse: 'true/false',
  shortAnswer: 'short-answer',
  theory: 'theory',
};

export const countsTotal = (c: Partial<QuestionCounts>) =>
  (c.multipleChoice ?? 0) + (c.trueFalse ?? 0) + (c.shortAnswer ?? 0) + (c.theory ?? 0);

export function CountsEditor({
  value,
  onChange,
  hints,
  idPrefix,
}: {
  value: QuestionCounts;
  onChange: (value: QuestionCounts) => void;
  /** Right-aligned note per type, e.g. "12 approved available". */
  hints?: Partial<Record<keyof QuestionCounts, React.ReactNode>>;
  idPrefix: string;
}) {
  return (
    <div className="divide-y divide-border rounded-xl border border-border">
      {COUNT_ROWS.map((r) => (
        <div key={r.key} className="flex items-center gap-3 px-3 py-2">
          <label htmlFor={`${idPrefix}-${r.key}`} className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium">{QUESTION_TYPE_LABELS[r.type]}</span>
            {hints?.[r.key] && <span className="block text-[11.5px] text-muted-foreground">{hints[r.key]}</span>}
          </label>
          <Stepper
            id={`${idPrefix}-${r.key}`}
            value={value[r.key] ?? 0}
            max={r.max}
            label={`${QUESTION_TYPE_LABELS[r.type]} questions`}
            onChange={(n) => onChange({ ...value, [r.key]: n })}
          />
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ job progress

/** A slim live panel for a background AI job (questions, remarks…). */
export function JobProgressPanel({
  job,
  noun,
  doneText,
  onDismiss,
  children,
}: {
  job: AiJobView | undefined;
  noun: string;
  doneText?: React.ReactNode;
  onDismiss?: () => void;
  children?: React.ReactNode;
}) {
  const state = job?.state ?? 'QUEUED';
  if (state === 'FAILED') {
    return (
      <Card className="flex items-start gap-3 border-danger/30 p-4" role="status">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-danger-soft text-danger">
          <AlertTriangle className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold">The AI couldn’t finish the {noun}</p>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">{job?.error || 'Something went wrong. Please try again.'}</p>
        </div>
        {onDismiss && (
          <Button size="icon-sm" variant="ghost" aria-label="Dismiss" onClick={onDismiss}>
            <X />
          </Button>
        )}
      </Card>
    );
  }
  if (state === 'DONE') {
    return (
      <Card className="flex flex-col gap-3 border-success/30 p-4 sm:flex-row sm:items-center" role="status">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-success-soft text-success">
            <CheckCircle2 className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold">{doneText ?? `Your ${noun} is ready`}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {children}
          {onDismiss && (
            <Button size="icon-sm" variant="ghost" aria-label="Dismiss" onClick={onDismiss}>
              <X />
            </Button>
          )}
        </div>
      </Card>
    );
  }
  return (
    <Card className="ai-border ai-glow relative overflow-hidden p-4" role="status" aria-live="polite">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-48 rounded-full bg-ai-2/15 blur-3xl" />
      <div className="relative flex items-center gap-3">
        <div className="relative grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-card">
          <AiSparkle className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold">
            {state === 'QUEUED' ? 'Getting ready to write' : 'Writing'} your <span className="text-ai-gradient">{noun}</span>…
          </p>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">Usually under a minute or two. You can keep working — we’ll let you know.</p>
        </div>
      </div>
      <div className="relative mt-3 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="absolute inset-y-0 w-1/3 animate-[job-slide_1.4s_ease-in-out_infinite] rounded-full bg-ai-gradient" />
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ misc

export function StatTile({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'success' | 'warning' | 'danger' }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card px-3.5 py-2.5">
      <p className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-0.5 font-display text-lg font-semibold tabular',
          tone === 'success' && 'text-success',
          tone === 'warning' && 'text-warning',
          tone === 'danger' && 'text-danger',
        )}
      >
        {value}
      </p>
      {sub && <p className="truncate text-[11.5px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Print with a mode flag on <body> (see the print stylesheet), cleared afterwards. */
export function printAs(mode?: string) {
  if (mode) document.body.dataset.print = mode;
  const clear = () => {
    delete document.body.dataset.print;
    window.removeEventListener('afterprint', clear);
  };
  window.addEventListener('afterprint', clear);
  window.print();
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${Number.isInteger(n) ? n : n.toFixed(digits)}%`;
}

export function fmtScore(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(digits);
}
