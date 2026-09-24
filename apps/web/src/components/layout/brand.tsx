import { useId } from 'react';
import { cn } from '@/lib/utils';

/** Product mark: a graduation cap in the AI gradient on deep navy. */
export function BrandMark({ className }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const bg = `bm-bg${uid}`;
  const ai = `bm-ai${uid}`;
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden className={cn('size-8 shrink-0', className)}>
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0b1330" />
          <stop offset="1" stopColor="#1e2a5e" />
        </linearGradient>
        <linearGradient id={ai} x1="14" y1="12" x2="50" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor="#818cf8" />
          <stop offset=".5" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${bg})`} />
      <rect x=".5" y=".5" width="63" height="63" rx="15.5" stroke="#fff" strokeOpacity=".08" />
      <path d="M32 13 12 23l20 10 20-10-20-10Z" fill={`url(#${ai})`} />
      <path d="M19 29v9c0 4 6 8 13 8s13-4 13-8v-9l-13 6.5L19 29Z" fill={`url(#${ai})`} opacity=".85" />
      <path d="M49 36.5l1.4 3.1 3.1 1.4-3.1 1.4L49 45.5l-1.4-3.1-3.1-1.4 3.1-1.4 1.4-3.1Z" fill="#e0e7ff" />
    </svg>
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <BrandMark />
      <span className="font-display text-[15px] font-semibold tracking-tight">
        AI School <span className="text-ai-gradient">OS</span>
      </span>
    </span>
  );
}
