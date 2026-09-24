import { useId } from 'react';
import { cn } from '@/lib/utils';

/** The signature AI mark: a gradient four-point sparkle with a gentle pulse. */
export function AiSparkle({ className, animated = true }: { className?: string; animated?: boolean }) {
  const id = `spk${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn('size-4 shrink-0', animated && 'animate-sparkle', className)}>
      <defs>
        <linearGradient id={id} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--ai-1)" />
          <stop offset="0.5" stopColor="var(--ai-2)" />
          <stop offset="1" stopColor="var(--ai-3)" />
        </linearGradient>
      </defs>
      <path
        d="M12 2c.5 4.8 2.7 7.4 8 8.2v.6c-5.3.8-7.5 3.4-8 9.2h-.2c-.5-5.8-2.7-8.4-8-9.2v-.6c5.3-.8 7.5-3.4 8-8.2H12Z"
        fill={`url(#${id})`}
      />
      <path d="M19.5 2.5c.2 1.4.8 2.1 2.2 2.3v.2c-1.4.2-2 .9-2.2 2.4h-.1c-.2-1.5-.8-2.2-2.2-2.4v-.2c1.4-.2 2-.9 2.2-2.3h.1Z" fill={`url(#${id})`} opacity=".7" />
    </svg>
  );
}
