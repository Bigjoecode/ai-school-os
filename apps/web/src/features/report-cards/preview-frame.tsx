import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Wide enough for a full subject table at screen type sizes (print uses smaller type on A4). */
export const SHEET_WIDTH = 940;

/**
 * Renders its child at a fixed sheet width and scales it down to fit the
 * available space, so a preview has the printed proportions on any screen.
 */
export function ScaledSheet({ children, width = SHEET_WIDTH, maxHeight, className }: { children: ReactNode; width?: number; maxHeight?: number; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const measure = () => {
      setScale(Math.min(1, o.clientWidth / width));
      setHeight(i.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, [width]);

  const h = height * scale;
  return (
    <div ref={outer} className={cn('relative w-full overflow-hidden', className)} style={{ height: maxHeight ? Math.min(h, maxHeight) : h }}>
      <div ref={inner} className="absolute top-0 left-0" style={{ width, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  );
}
