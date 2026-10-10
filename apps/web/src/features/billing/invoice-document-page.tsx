import type { BillingDocument } from '@aischool/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import { BrandMark } from '@/components/layout/brand';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { naira } from '../platform/api';
import { PAYMENT_METHOD_LABEL } from '../platform/ui';

/** A school's AI School OS invoice, or its receipt once paid: printable / save as PDF from the browser. */
export default function InvoiceDocumentPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const consoleView = params.get('from') === 'console';
  const q = useQuery({
    queryKey: ['billing', 'document', id, consoleView],
    queryFn: ({ signal }) => api.get<BillingDocument>(consoleView ? `/platform/invoices/${id}/document` : `/billing/invoices/${id}/document`, undefined, signal),
  });
  const d = q.data;
  useDocumentTitle(d ? `${d.kind === 'RECEIPT' ? 'Receipt' : 'Invoice'} ${d.number}` : 'Invoice');
  return (
    <div className="min-h-dvh bg-muted/40 px-3 py-6 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between gap-2 print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link to={consoleView ? '/platform/billing' : '/settings/billing'}>
            <ArrowLeft /> Back
          </Link>
        </Button>
        <Button size="sm" onClick={() => window.print()} disabled={!d}>
          <Printer /> Print or save as PDF
        </Button>
      </div>
      {q.error ? (
        <div className="mx-auto max-w-3xl rounded-2xl bg-card">
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </div>
      ) : !d ? (
        <Skeleton className="mx-auto h-[800px] max-w-3xl rounded-2xl" />
      ) : (
        <article className="mx-auto max-w-3xl rounded-2xl border border-border bg-white p-6 text-[13px] text-neutral-900 shadow-sm sm:p-10 print:rounded-none print:border-0 print:shadow-none">
          <header className="flex flex-col gap-6 sm:flex-row sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <BrandMark />
                <span className="font-display text-[17px] font-semibold">AI School OS</span>
              </div>
              <p className="mt-3 font-medium">{d.company.name}</p>
              <p className="text-neutral-600">RC {d.company.rcNumber}</p>
              <p className="whitespace-pre-line text-neutral-600">{d.company.address}</p>
              <p className="text-neutral-600">
                {d.company.email}
                {d.company.phone ? ` · ${d.company.phone}` : ''}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="font-display text-[26px] font-semibold uppercase tracking-tight">{d.kind === 'RECEIPT' ? 'Receipt' : 'Invoice'}</p>
              <p className="font-mono text-[14px]">{d.number}</p>
              <p className="mt-2 text-neutral-600">Issued {formatDate(d.issuedAt)}</p>
              {d.kind === 'RECEIPT' ? <p className="text-neutral-600">Paid {d.paidAt ? formatDate(d.paidAt) : ''}</p> : <p className="text-neutral-600">Due {formatDate(d.dueDate)}</p>}
              {d.status === 'VOID' && <p className="mt-1 font-semibold text-red-700">VOID</p>}
            </div>
          </header>

          <section className="mt-8">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Billed to</p>
            <p className="mt-1 font-medium">{d.school.name}</p>
            {d.school.address && <p className="text-neutral-600">{d.school.address}</p>}
            <p className="text-neutral-600">{[d.school.email, d.school.phone].filter(Boolean).join(' · ')}</p>
          </section>

          <table className="mt-8 w-full border-collapse">
            <thead>
              <tr className="border-b border-neutral-300 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="py-2 font-semibold">Description</th>
                <th className="py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-neutral-200 align-top">
                <td className="py-3 pr-4">
                  {d.description}
                  {d.periodStart && d.periodEnd && (
                    <p className="text-neutral-500">
                      Period {formatDate(d.periodStart)} – {formatDate(d.periodEnd)}
                    </p>
                  )}
                </td>
                <td className="py-3 text-right tabular">{naira(d.amountKobo + d.discountKobo)}</td>
              </tr>
              {d.discountKobo > 0 && (
                <tr className="border-b border-neutral-200">
                  <td className="py-2">Discount</td>
                  <td className="py-2 text-right tabular">−{naira(d.discountKobo)}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-3 text-right font-semibold">Total</td>
                <td className="pt-3 text-right font-semibold tabular">{naira(d.amountKobo)}</td>
              </tr>
              <tr>
                <td className="pt-1 text-right text-neutral-600">Paid</td>
                <td className="pt-1 text-right tabular text-neutral-600">{naira(d.paidKobo)}</td>
              </tr>
              <tr>
                <td className="pt-1 text-right font-semibold">Balance</td>
                <td className="pt-1 text-right font-semibold tabular">{naira(d.balanceKobo)}</td>
              </tr>
            </tfoot>
          </table>

          {d.payments.length > 0 && (
            <section className="mt-8">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Payments received</p>
              <ul className="mt-2 space-y-1">
                {d.payments.map((p) => (
                  <li key={p.reference} className="flex justify-between gap-3">
                    <span>
                      {p.paidAt ? formatDate(p.paidAt) : ''} · {PAYMENT_METHOD_LABEL[p.method as keyof typeof PAYMENT_METHOD_LABEL] ?? p.method} · <span className="font-mono">{p.reference}</span>
                    </span>
                    <span className="tabular">{naira(p.amountKobo)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {d.kind === 'INVOICE' && d.status === 'OPEN' && d.bankDetails && (
            <section className="mt-8 rounded-lg border border-neutral-200 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Pay by bank transfer</p>
              <pre className="mt-1 whitespace-pre-wrap font-sans">{d.bankDetails}</pre>
              <p className="mt-1">
                Use <span className="font-mono font-semibold">{d.number}</span> as the reference. You can also pay online in Settings → Billing.
              </p>
            </section>
          )}
          <p className="mt-10 text-[11.5px] text-neutral-500">{d.company.taxNote}</p>
        </article>
      )}
    </div>
  );
}
