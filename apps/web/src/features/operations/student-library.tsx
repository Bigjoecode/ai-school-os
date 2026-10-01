import { ArrowRight, Library } from 'lucide-react';
import { Link } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useCurrency } from '../finance/ui';
import { useLoans } from './api';
import { LoanStatus } from './library-dialogs';

/** Compact "library books" block for the student side sheet. */
export function StudentLibrarySummary({ studentId, onNavigate }: { studentId: string; onNavigate?: () => void }) {
  const currency = useCurrency();
  const q = useLoans({ studentId, status: 'ALL' });
  const open = (q.data ?? []).filter((l) => !l.returnedOn);
  const owed = (q.data ?? []).filter((l) => l.returnedOn && l.fineKobo > 0 && !l.finePaid);
  const shown = [...open, ...owed].slice(0, 4);
  const total = q.data?.length ?? 0;

  return (
    <section className="mt-6" aria-labelledby="sheet-library">
      <div className="mb-3 flex items-center justify-between">
        <h3 id="sheet-library" className="flex items-center gap-2 text-[13px] font-semibold">
          <Library className="size-4 text-muted-foreground" aria-hidden /> Library
          {q.data && <span className="font-normal text-muted-foreground">· {total} borrowed in all</span>}
        </h3>
        <Link
          to="/library?tab=loans&status=ALL"
          onClick={onNavigate}
          className="inline-flex items-center gap-1 rounded-md text-[12.5px] font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Loans <ArrowRight className="size-3.5" />
        </Link>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-[60px] w-full rounded-xl" />
      ) : shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-[13px] text-muted-foreground">{q.error ? 'Couldn’t load library loans.' : 'No books out and no fines owed.'}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {shown.map((l) => (
            <li key={l.id} className={cn('flex items-center justify-between gap-3 px-3.5 py-2.5', !l.returnedOn && l.daysOverdue > 0 && 'bg-danger-soft/30')}>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{l.book.title}</span>
                <span className="block truncate text-[11.5px] text-muted-foreground">{l.book.author}</span>
              </span>
              <LoanStatus l={l} currency={currency} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
