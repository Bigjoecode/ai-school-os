import { ArrowLeft, FileDown, Lock, Printer, Receipt } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { useDocumentTitle } from '@/lib/hooks';
import { ReceiptDocument } from '../finance/receipt-document';
import { usePortalReceipt } from './api';
import { PortalShell, portalPath, type ShellCtx } from './ui';

/** /school/fees/<studentId>/receipt/<paymentId>: a parent's printable receipt (read-only). */
export default function PortalReceiptPage() {
  return (
    <PortalShell section="fees" className="print:max-w-none print:p-0" title={() => 'Receipt'}>
      {(ctx) => <ReceiptBody {...ctx} />}
    </PortalShell>
  );
}

function ReceiptBody({ child }: ShellCtx) {
  const { paymentId = '' } = useParams();
  const q = usePortalReceipt(child.id, paymentId);
  const r = q.data;
  useDocumentTitle(r ? `Receipt ${r.receiptNumber ?? ''}` : undefined);
  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link to={portalPath('fees', child.id)}>
        <ArrowLeft /> Fees
      </Link>
    </Button>
  );

  if (q.isLoading) return <Skeleton className="h-[560px] rounded-2xl" />;
  if (!r) {
    const err = q.error;
    const notFound = err instanceof ApiError && err.status === 404;
    const forbidden = err instanceof ApiError && err.status === 403;
    return (
      <div className="space-y-3">
        {back}
        <Card>
          {notFound ? (
            <EmptyState icon={Receipt} title="Receipt not found" description="This payment may still be awaiting confirmation. Its receipt appears once the bank confirms it." />
          ) : forbidden ? (
            <EmptyState icon={Lock} title="Not shared by the school" description="Please contact the school bursar for a copy of this receipt." />
          ) : (
            <ErrorState error={err} onRetry={() => void q.refetch()} />
          )}
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        {back}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
          <Button onClick={() => window.print()} aria-label="Save as PDF (choose “Save as PDF” as the printer)">
            <FileDown /> Save as PDF
          </Button>
        </div>
      </div>
      <p className="mb-3 text-[12px] text-muted-foreground print:hidden">To save a PDF on a phone, tap Save as PDF and choose “Save as PDF” as the printer.</p>
      {r.status === 'REVERSED' && (
        <p className="mb-4 rounded-xl border border-danger/30 bg-danger-soft/50 px-4 py-2.5 text-[13px] print:hidden">
          <strong className="font-semibold text-danger">This payment was reversed by the school.</strong> It no longer counts towards the fees. Please contact the bursar if you have questions.
        </p>
      )}
      <ReceiptDocument r={r} />
    </>
  );
}
