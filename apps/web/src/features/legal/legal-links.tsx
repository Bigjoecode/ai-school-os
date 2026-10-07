import { LEGAL_DOCS } from '@aischool/shared';
import { cn } from '@/lib/utils';

/** Small row of links to the legal pages, for footers (kept apart from the pages so it doesn't pull in the documents). */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={cn('flex flex-wrap items-center justify-center gap-x-3 gap-y-1', className)}>
      {LEGAL_DOCS.filter((d) => d.slug !== 'retention').map((d) => (
        <a key={d.slug} href={`/legal/${d.slug}`} className="transition-colors hover:text-foreground hover:underline">
          {d.short}
        </a>
      ))}
    </nav>
  );
}
