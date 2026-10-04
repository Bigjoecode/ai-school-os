import type { ReceiptView } from '@aischool/shared';
import { FileText, Printer, Receipt, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Page } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { useDocumentTitle } from '@/lib/hooks';
import { BackLink, DetailSkeleton } from '../planning/ui';
import { useReceipt, useReversePayment } from './api';
import { ReceiptDocument } from './receipt-document';
import { money } from './ui';

export default function ReceiptPage() {
  const { id = '' } = useParams();
  const q = useReceipt(id);
  if (q.isLoading) {
    return (
      <Page className="max-w-3xl">
        <DetailSkeleton />
      </Page>
    );
  }
  if (!q.data) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <Page className="max-w-3xl">
        <BackLink to="/payments">Payments</BackLink>
        {notFound ? <EmptyState icon={Receipt} title="Receipt not found" /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      </Page>
    );
  }
  return <ReceiptDoc r={q.data} />;
}

function ReceiptDoc({ r }: { r: ReceiptView }) {
  useDocumentTitle(`Receipt ${r.receiptNumber ?? ''}`);
  const canManage = useCan('finance.manage');
  const [reverseOpen, setReverseOpen] = useState(false);
  const reversed = r.status === 'REVERSED';

  return (
    <Page className="max-w-3xl print:max-w-none print:p-0">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <BackLink to="/payments">Payments</BackLink>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link to={`/fees/invoices/${r.invoiceId}`}>
              <FileText /> Invoice {r.invoiceNumber}
            </Link>
          </Button>
          {canManage && r.status === 'SUCCESS' && r.method !== 'PAYSTACK' && (
            <Button variant="outline" onClick={() => setReverseOpen(true)} className="text-danger hover:text-danger">
              <Undo2 /> Reverse
            </Button>
          )}
          <Button onClick={() => window.print()}>
            <Printer /> Print receipt
          </Button>
        </div>
      </div>

      {reversed && r.note && (
        <p className="mb-4 rounded-xl border border-danger/30 bg-danger-soft/50 px-4 py-2.5 text-[13px] print:hidden">
          <strong className="font-semibold text-danger">This payment was reversed.</strong> {r.note.replace(/^Reversed:\s*/, '')}
        </p>
      )}

      <ReceiptDocument r={r} />

      <ReverseDialog open={reverseOpen} onOpenChange={setReverseOpen} r={r} />
    </Page>
  );
}

function ReverseDialog({ open, onOpenChange, r }: { open: boolean; onOpenChange: (o: boolean) => void; r: ReceiptView }) {
  const reverse = useReversePayment(r.id);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (open) {
      setReason('');
      setError(undefined);
    }
  }, [open]);
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Reverse receipt ${r.receiptNumber ?? ''}?`}
      description={`${money(r.amountKobo, r.currency)} goes back onto ${r.student.name}’s balance. The receipt stays on record, marked reversed.`}
      icon={<Undo2 />}
      submitLabel="Reverse payment"
      pending={reverse.isPending}
      size="sm"
      onSubmit={(e) => {
        e?.preventDefault();
        if (reason.trim().length < 3) {
          setError('Give a short reason for the record');
          return;
        }
        reverse.mutate(reason.trim(), { onSuccess: () => onOpenChange(false) });
      }}
    >
      <Field label="Reason" htmlFor="rev-reason" error={error}>
        <Textarea id="rev-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Cheque bounced / recorded against the wrong learner" invalid={!!error} autoFocus />
      </Field>
    </FormDialog>
  );
}
