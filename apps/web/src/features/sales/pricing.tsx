import { cn } from '@/lib/utils';
import { SALES_PLANS, naira } from './config';

/** Plan prices from config.ts (mirroring the console plans). */
export function PricingCards({ className, dense }: { className?: string; dense?: boolean }) {
  return (
    <div className={cn('grid gap-3 sm:grid-cols-3', className)}>
      {SALES_PLANS.map((p, i) => (
        <div key={p.code} className={cn('flex flex-col rounded-2xl border bg-card', dense ? 'p-3' : 'p-4', i === 1 ? 'border-brand/50 ring-1 ring-brand/20' : 'border-border')}>
          <p className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{p.name}</p>
          <p className={cn('mt-1 font-display font-semibold tracking-tight', dense ? 'text-[22px]' : 'text-[28px]')}>
            {naira(p.price)}
            <span className="ml-1 text-[12.5px] font-normal text-muted-foreground">per student per term</span>
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">{p.maxStudents ? `Up to ${p.maxStudents.toLocaleString('en-NG')} students` : 'No student limit'}</p>
          <p className={cn('mt-2 text-muted-foreground', dense ? 'text-[12px]' : 'text-[13.5px]')}>{p.summary}</p>
        </div>
      ))}
    </div>
  );
}

export const PRICE_NOTE = 'Prices as listed in the app today. Please confirm current prices, any VAT and pilot terms with us before you budget.';
