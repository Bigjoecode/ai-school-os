import { ArrowRight, Receipt } from 'lucide-react';
import { Link } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useStructure } from '../academics/api';
import { currentTerm } from '../planning/pickers';
import { useInvoices } from './api';
import { InvoiceStatusBadge, money, schoolDate, useCurrency } from './ui';

/** Compact "fees this term" block for the student side sheet. */
export function StudentFeesSummary({ admissionNumber, studentId, onNavigate }: { admissionNumber: string; studentId: string; onNavigate?: () => void }) {
  const currency = useCurrency();
  const structure = useStructure();
  const termId = currentTerm(structure.data)?.id;
  const ready = !structure.isLoading;
  const q = useInvoices({ q: admissionNumber, termId, pageSize: 10, page: 1 }, ready);
  const inv = [...(q.data?.items ?? [])]
    .filter((i) => i.student.id === studentId && i.status !== 'CANCELLED')
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))[0];

  return (
    <section className="mt-6" aria-labelledby="sheet-fees">
      <div className="mb-3 flex items-center justify-between">
        <h3 id="sheet-fees" className="flex items-center gap-2 text-[13px] font-semibold">
          <Receipt className="size-4 text-muted-foreground" /> Fees this term
          {inv && <span className="font-normal text-muted-foreground">· {inv.term.name}</span>}
        </h3>
        {inv && (
          <Link
            to={`/fees/invoices/${inv.id}`}
            onClick={onNavigate}
            className="inline-flex items-center gap-1 rounded-md text-[12.5px] font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Invoice <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>
      {!ready || q.isLoading ? (
        <Skeleton className="h-[76px] w-full rounded-xl" />
      ) : !inv ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-[13px] text-muted-foreground">{q.error ? 'Couldn’t load fees.' : 'No invoice issued for this term yet.'}</p>
      ) : (
        <Link
          to={`/fees/invoices/${inv.id}`}
          onClick={onNavigate}
          className={cn(
            'block rounded-xl border p-3.5 transition-colors hover:border-border-strong',
            inv.overdue && inv.balanceKobo > 0 ? 'border-danger/30 bg-danger-soft/30' : 'border-border bg-muted/30',
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] text-muted-foreground">Balance</p>
              <p className={cn('font-display text-[20px] font-semibold tabular', inv.balanceKobo === 0 ? 'text-success' : inv.overdue && 'text-danger')}>{money(inv.balanceKobo, currency)}</p>
            </div>
            <InvoiceStatusBadge status={inv.status} overdue={inv.overdue} />
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round((inv.paidKobo / Math.max(1, inv.totalKobo)) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Share paid">
            <div className="h-full rounded-full bg-success transition-[width] duration-700" style={{ width: `${Math.min(100, (inv.paidKobo / Math.max(1, inv.totalKobo)) * 100)}%` }} />
          </div>
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">
            <span className="tabular">{money(inv.paidKobo, currency)}</span> paid of <span className="tabular">{money(inv.totalKobo, currency)}</span> · due {schoolDate(inv.dueDate)}
          </p>
        </Link>
      )}
    </section>
  );
}
