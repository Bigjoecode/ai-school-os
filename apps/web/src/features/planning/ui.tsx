import type { GenerationState } from '@aischool/shared';
import { AlertTriangle, ArrowLeft, Clock, RotateCw } from 'lucide-react';
import type * as React from 'react';
import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea, type TextareaProps } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

// ------------------------------------------------------------------ helpers

export function isGenerating(state: GenerationState | undefined | null): boolean {
  return state === 'QUEUED' || state === 'RUNNING';
}

/** refetchInterval for a single generated record: poll every 3s while the AI is working. */
export function pollWhileGenerating<T extends { generation: GenerationState }>(query: { state: { data: T | undefined } }) {
  return isGenerating(query.state.data?.generation) ? 3000 : false;
}

/** refetchInterval for a list: poll while any row is still being generated. */
export function pollListWhileGenerating<T extends { generation: GenerationState }>(query: { state: { data: T[] | undefined } }) {
  return query.state.data?.some((r) => isGenerating(r.generation)) ? 4000 : false;
}

/** Textarea lines → trimmed, non-empty list items. */
export function linesToList(text: string | undefined | null): string[] {
  return (text ?? '')
    .split('\n')
    .map((l) => l.replace(/^\s*[-*•]\s+/, '').trim())
    .filter(Boolean);
}

export function listToLines(list: string[] | undefined | null): string {
  return (list ?? []).join('\n');
}

/** Open state bound to a search param, e.g. `?new=1` — lets ⌘K open dialogs. */
export function useSearchFlag(name = 'new'): [boolean, (open: boolean) => void] {
  const [params, setParams] = useSearchParams();
  const open = params.get(name) === '1';
  const setOpen = useCallback(
    (next: boolean) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next) p.set(name, '1');
          else p.delete(name);
          return p;
        },
        { replace: true },
      );
    },
    [name, setParams],
  );
  return [open, setOpen];
}

// ------------------------------------------------------------------ badges

const STATUS: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  PUBLISHED: { label: 'Published', variant: 'success' },
  ARCHIVED: { label: 'Archived', variant: 'outline' },
  READY: { label: 'Ready', variant: 'info' },
  DELIVERED: { label: 'Delivered', variant: 'success' },
};

export function ContentStatusBadge({ status, className }: { status: string; className?: string }) {
  const s = STATUS[status] ?? { label: status, variant: 'secondary' as const };
  return (
    <Badge variant={s.variant} dot className={className}>
      {s.label}
    </Badge>
  );
}

export function SourceBadge({ source }: { source: 'AI' | 'MANUAL' }) {
  if (source === 'AI') {
    return (
      <Badge variant="outline" className="gap-1 border-ai-2/30 text-foreground">
        <AiSparkle className="size-3" animated={false} /> AI draft
      </Badge>
    );
  }
  return <Badge variant="outline">Manual</Badge>;
}

/** Small live indicator for list rows and cards. Renders nothing when idle. */
export function GenerationIndicator({ state }: { state: GenerationState }) {
  if (state === 'QUEUED') {
    return (
      <Badge variant="outline" className="gap-1.5">
        <Clock /> Queued
      </Badge>
    );
  }
  if (state === 'RUNNING') {
    return (
      <Badge variant="ai" className="gap-1.5">
        <span className="relative flex size-1.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-75" />
          <span className="relative inline-flex size-1.5 rounded-full bg-white" />
        </span>
        Writing…
      </Badge>
    );
  }
  if (state === 'FAILED') {
    return (
      <Badge variant="danger" className="gap-1">
        <AlertTriangle /> Failed
      </Badge>
    );
  }
  return null;
}

// ------------------------------------------------------------------ panels

/** The big "AI is writing" state shown on a detail page while generation runs. */
export function GeneratingPanel({ noun, state, children }: { noun: string; state: GenerationState; children?: React.ReactNode }) {
  return (
    <Card className="ai-border ai-glow relative overflow-hidden" role="status" aria-live="polite">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-ai-2/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 size-72 rounded-full bg-ai-3/10 blur-3xl" />
      <div className="relative flex flex-col items-center gap-5 px-6 py-12 text-center sm:py-16">
        <div className="relative grid size-16 place-items-center rounded-2xl border border-border bg-card shadow-soft">
          <div aria-hidden className="absolute inset-0 animate-pulse rounded-2xl bg-ai-gradient opacity-10" />
          <AiSparkle className="size-8" />
        </div>
        <div className="max-w-md">
          <p className="font-display text-lg font-semibold tracking-tight">
            {state === 'QUEUED' ? (
              <>
                Getting ready to write your <span className="text-ai-gradient">{noun}</span>
              </>
            ) : (
              <>
                Writing your <span className="text-ai-gradient">{noun}</span>
              </>
            )}
          </p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
            This usually takes 1–3 minutes. You can leave this page — we’ll keep working and it will be here when you come back.
          </p>
        </div>
        <div className="w-full max-w-md space-y-2.5" aria-hidden>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-2/3" />
        </div>
        {children}
      </div>
    </Card>
  );
}

export function FailedPanel({
  noun,
  message,
  onRetry,
  retrying,
}: {
  noun: string;
  message: string | null;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <Card className="border-danger/30">
      <div className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-danger-soft text-danger">
          <AlertTriangle className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold tracking-tight">The AI couldn’t finish this {noun}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{message || 'Something went wrong while generating. Please try again.'}</p>
        </div>
        {onRetry && (
          <Button variant="outline" onClick={onRetry} loading={retrying}>
            <RotateCw /> Retry
          </Button>
        )}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ bits

export function BackLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 rounded-md text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring print:hidden"
    >
      <ArrowLeft className="size-3.5" /> {children}
    </Link>
  );
}

export function BulletList({ items, empty = 'None yet', className }: { items: string[]; empty?: string; className?: string }) {
  if (items.length === 0) return <p className="text-[13px] italic text-muted-foreground">{empty}</p>;
  return (
    <ul className={cn('space-y-1.5 text-[13.5px] leading-relaxed', className)}>
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <span aria-hidden className="mt-[9px] size-1.5 shrink-0 rounded-full bg-brand/60" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Chips({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s, i) => (
        <span key={i} className="rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-[12px] text-muted-foreground">
          {s}
        </span>
      ))}
    </div>
  );
}

/** A textarea for list fields: one item per line. */
export function LinesTextarea(props: TextareaProps) {
  return <Textarea rows={4} {...props} />;
}

export function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-2/3 max-w-md" />
        <Skeleton className="h-4 w-1/3 max-w-xs" />
      </div>
      <Card className="space-y-3 p-6">
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </Card>
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="flex gap-4 p-5">
          <Skeleton className="size-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="space-y-3 p-5">
          <div className="flex justify-between">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </Card>
      ))}
    </div>
  );
}
