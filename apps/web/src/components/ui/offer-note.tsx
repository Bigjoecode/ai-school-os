import { ArrowRight, Sparkles } from 'lucide-react';
import type * as React from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { allowDigitalPurchases } from '@/pwa/ios-app';

/**
 * A highlighted offer line ("BECE Prep unlocks unlimited practice…") that
 * parents and students can spot at a glance: a soft amber highlight with dark
 * text — never yellow text on white. Contrast is AA or better in both themes
 * (light: amber-950 on amber-100 ≈ 13:1; dark: amber-50 on amber-950 ≈ 14:1;
 * the secondary line ≥ 7:1).
 *
 * Inside the iPhone app (allowDigitalPurchases() is false) the price and the
 * call to action are left out: App Store rules forbid pointing to an outside
 * checkout, so only the plain description remains.
 */
export interface OfferNoteProps {
  /** The product's name, shown in bold: "BECE Prep", "AI Student Plus". */
  product: string;
  /** The rest of the line: "unlocks unlimited practice, timed mocks and AI-marked theory". */
  children: React.ReactNode;
  /** A smaller line under it (who can add it, sponsorship…). Shown everywhere, so no prices or links to a checkout here. */
  note?: React.ReactNode;
  /** "₦2,500 per term": hidden inside the iPhone app. */
  price?: string;
  /** A purchase call to action: hidden inside the iPhone app. */
  cta?: { label: string; to?: string; onClick?: () => void };
  className?: string;
  size?: 'sm' | 'md';
}

export function OfferNote({ product, children, note, price, cta, className, size = 'md' }: OfferNoteProps) {
  const canBuy = allowDigitalPurchases();
  const ctaClass =
    'inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-amber-950 px-3 text-[13px] font-semibold text-amber-50 transition-colors hover:bg-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 dark:bg-amber-200 dark:text-amber-950 dark:hover:bg-amber-100 dark:focus-visible:ring-amber-300 dark:focus-visible:ring-offset-amber-950 [&_svg]:size-3.5';
  return (
    <div
      role="note"
      aria-label={`Offer: ${product}`}
      data-offer-note=""
      className={cn(
        'flex gap-2.5 rounded-xl border border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-50 print:border-amber-400 print:bg-transparent',
        size === 'sm' ? 'p-2.5 text-[12.5px]' : 'p-3.5 text-[13.5px]',
        className,
      )}
    >
      <Sparkles className={cn('shrink-0 fill-amber-400 text-amber-700 dark:fill-amber-300/40 dark:text-amber-300', size === 'sm' ? 'mt-px size-3.5' : 'mt-0.5 size-4')} aria-hidden />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="leading-snug">
          <strong className="font-bold">{product}</strong> {children}
          {canBuy && price && <span className="ml-1 whitespace-nowrap font-semibold">· {price}</span>}
        </p>
        {note && <div className="text-[0.92em] leading-snug text-amber-900 dark:text-amber-200">{note}</div>}
        {canBuy && cta && (
          <div className="pt-0.5">
            {cta.to ? (
              <Link to={cta.to} className={ctaClass} onClick={cta.onClick}>
                {cta.label} <ArrowRight aria-hidden />
              </Link>
            ) : (
              <button type="button" className={ctaClass} onClick={cta.onClick}>
                {cta.label} <ArrowRight aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
