import * as AvatarPrimitive from '@radix-ui/react-avatar';
import * as React from 'react';
import { cn, hueFromString } from '@/lib/utils';

const sizes = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-[11px]',
  md: 'size-9 text-xs',
  lg: 'size-12 text-sm',
  xl: 'size-16 text-lg',
};

interface AvatarProps {
  name: string;
  initials: string;
  src?: string | null;
  size?: keyof typeof sizes;
  className?: string;
  square?: boolean;
}

/** Avatar with a deterministic, tasteful colour derived from the name. */
export function Avatar({ name, initials, src, size = 'md', className, square }: AvatarProps) {
  const hue = hueFromString(name);
  const style = {
    '--av-h': hue,
  } as React.CSSProperties;
  return (
    <AvatarPrimitive.Root
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden font-semibold',
        square ? 'rounded-lg' : 'rounded-full',
        sizes[size],
        className,
      )}
      style={style}
    >
      {src && <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" />}
      <AvatarPrimitive.Fallback
        delayMs={src ? 400 : 0}
        className="flex size-full items-center justify-center bg-[hsl(var(--av-h)_70%_94%)] text-[hsl(var(--av-h)_45%_32%)] ring-1 ring-inset ring-[hsl(var(--av-h)_40%_50%/0.12)] dark:bg-[hsl(var(--av-h)_35%_18%)] dark:text-[hsl(var(--av-h)_70%_80%)]"
        aria-label={name}
      >
        {initials}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
