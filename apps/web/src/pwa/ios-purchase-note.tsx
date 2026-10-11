import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IOS_PURCHASE_NOTE } from './ios-app';

/**
 * Shown in the iPhone app where a digital purchase would be on the web (see allowDigitalPurchases
 * in ios-app.ts). Deliberately plain: no link, button, price or mention of another way to pay.
 */
export function IosPurchaseNote({ title, className }: { title?: string; className?: string }) {
  return (
    <div role="note" className={cn('flex items-start gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3.5 text-[13.5px]', className)}>
      <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <p className="min-w-0 text-muted-foreground">
        {title && <span className="block font-medium text-foreground">{title}</span>}
        {IOS_PURCHASE_NOTE}
      </p>
    </div>
  );
}
