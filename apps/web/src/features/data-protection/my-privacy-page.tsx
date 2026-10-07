import { CONSENT_STATE_LABELS } from '@aischool/shared';
import { CheckCircle2, FileText, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { LEGAL_DOCS } from '../legal/docs';
import { useMyConsent, useWithdrawConsent } from './api';
import { ConsentForm } from './consent-gate';

function WithdrawDialog({ open, onOpenChange, schoolName }: { open: boolean; onOpenChange: (o: boolean) => void; schoolName: string }) {
  const withdraw = useWithdrawConsent();
  const [reason, setReason] = useState('');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw your consent?</DialogTitle>
          <DialogDescription>
            {schoolName} will be told straight away and will contact you about what happens next. Nothing is deleted automatically: some records (for example results
            and attendance) the school must keep. If the school requires consent, you won’t be able to use the portal until you agree again.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label="Reason" htmlFor="withdraw-reason" optional hint="Shared with the school.">
            <Textarea id="withdraw-reason" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {withdraw.error && <p role="alert" className="mt-3 text-[13px] font-medium text-danger">{errorMessage(withdraw.error)}</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" loading={withdraw.isPending} onClick={() => withdraw.mutate(reason.trim() || null, { onSuccess: () => onOpenChange(false) })}>
            Withdraw consent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Settings → Privacy & consent (parents): what they agreed to, when, and how to withdraw. */
export default function MyPrivacyPage() {
  useDocumentTitle('Privacy & consent');
  const status = useMyConsent();
  const [withdrawing, setWithdrawing] = useState(false);

  if (status.error && !status.data) return <ErrorState error={status.error} onRetry={() => void status.refetch()} />;
  if (!status.data) return <Skeleton className="h-64 max-w-3xl rounded-2xl" />;
  const s = status.data;
  if (!s.applies) {
    return (
      <Card className="max-w-3xl">
        <EmptyState icon={FileText} title="Nothing to agree to here" description="Parental consent applies to parents and guardians of this school." />
      </Card>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Your consent <Badge variant={s.state === 'CURRENT' ? 'success' : s.state === 'WITHDRAWN' ? 'danger' : 'warning'}>{CONSENT_STATE_LABELS[s.state]}</Badge>
            </CardTitle>
            <CardDescription>
              {s.state === 'CURRENT' && s.consentedAt
                ? `You agreed to the privacy notice (version ${s.consentedVersion}) on ${formatDateTime(s.consentedAt)}, on behalf of ${s.children.join(', ') || 'your children'}.`
                : s.state === 'WITHDRAWN'
                  ? `You withdrew your consent${s.withdrawnAt ? ` on ${formatDateTime(s.withdrawnAt)}` : ''}. ${s.schoolName} has been told.`
                  : `${s.schoolName} asks parents to read and agree to the privacy notice (version ${s.currentVersion}).`}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {s.state === 'CURRENT' ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-success">
                <CheckCircle2 className="size-4" /> Thank you — nothing more to do.
              </span>
              <Button variant="outline" size="sm" className="ml-auto" onClick={() => setWithdrawing(true)}>
                <ShieldOff /> Withdraw consent
              </Button>
            </div>
          ) : (
            <ConsentForm status={s} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>History</CardTitle>
            <CardDescription>Every time you agreed or withdrew, as recorded in the school’s audit log.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {s.history.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {s.history.map((h) => (
                <li key={`${h.action}-${h.at}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]">
                  <span className="font-medium">{h.action === 'GIVEN' ? 'Agreed' : 'Withdrew'}</span>
                  {h.version && <span className="text-muted-foreground">notice version {h.version}</span>}
                  <span className="ml-auto text-muted-foreground">{formatDateTime(h.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Documents</CardTitle>
            <CardDescription>To see, correct or delete your family’s information, contact {s.schoolName}.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2">
            {LEGAL_DOCS.filter((d) => ['privacy', 'children', 'subprocessors', 'retention'].includes(d.slug)).map((d) => (
              <li key={d.slug}>
                <Link to={`/legal/${d.slug}`} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[13px] font-medium hover:border-border-strong">
                  <FileText className="size-4 text-brand" /> {d.title}
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <WithdrawDialog open={withdrawing} onOpenChange={setWithdrawing} schoolName={s.schoolName} />
    </div>
  );
}
