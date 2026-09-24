import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import type * as React from 'react';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from './button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  tone?: 'default' | 'danger' | 'ai';
  compact?: boolean;
}

export function EmptyState({ icon: Icon, title, description, action, className, tone = 'default', compact }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14',
        className,
      )}
    >
      <div className="relative">
        <div
          aria-hidden
          className={cn(
            'absolute inset-0 -z-0 scale-150 rounded-full blur-2xl',
            tone === 'ai' ? 'bg-ai-2/20' : tone === 'danger' ? 'bg-danger/10' : 'bg-brand/10',
          )}
        />
        <div
          className={cn(
            'relative grid place-items-center rounded-2xl border border-border bg-card shadow-soft',
            compact ? 'size-11' : 'size-14',
            tone === 'danger' && 'text-danger',
            tone === 'ai' && 'ai-border',
          )}
        >
          <Icon className={cn(compact ? 'size-5' : 'size-6', tone === 'default' && 'text-muted-foreground', tone === 'ai' && 'text-ai-2')} />
        </div>
      </div>
      <div className="max-w-sm">
        <p className={cn('font-display font-semibold tracking-tight', compact ? 'text-sm' : 'text-base')}>{title}</p>
        {description && <div className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</div>}
      </div>
      {action && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      tone="danger"
      title="Couldn't load this"
      description={errorMessage(error)}
      className={className}
      action={
        onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCw /> Try again
          </Button>
        )
      }
    />
  );
}
