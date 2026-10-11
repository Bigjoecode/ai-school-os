import type { MyDeletionRequestStatus } from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { queryClient } from '@/lib/query-client';

const KEY = ['data-protection', 'deletion-request', 'me'] as const;

/**
 * "Delete my account": files a deletion request with the school (the data controller), which
 * shows in the school's Data protection → Requests list and notifies its administrators. Required
 * by the App Store for apps with accounts, and a data-subject right under the NDPA anyway.
 */
export function DeleteAccountCard() {
  const q = useQuery({ queryKey: KEY, queryFn: ({ signal }) => api.get<MyDeletionRequestStatus>('/data-protection/deletion-request/me', undefined, signal) });
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const send = useMutation({
    mutationFn: () => api.post<MyDeletionRequestStatus>('/data-protection/deletion-request', { reason: reason.trim() || null }),
    onSuccess: (r) => {
      queryClient.setQueryData(KEY, r);
      setOpen(false);
      setReason('');
      toast.success('Your request has been sent to your school');
    },
  });
  const school = q.data?.schoolName ?? 'your school';

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Delete my account</CardTitle>
          <CardDescription>
            Ask {school} to delete your AI School OS account and the personal data it no longer needs. Your school manages your records, so the request goes to
            them; they must answer within the time the data protection law allows. Records the law makes schools keep (such as results and fee receipts) may be
            kept for the required period — see the{' '}
            <a href="/legal/retention" className="font-medium text-brand hover:underline">
              retention schedule
            </a>
            .
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {!q.data ? (
          <Skeleton className="h-10 w-48 rounded-xl" />
        ) : q.data.open ? (
          <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-[13.5px]">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            <span>
              You asked for your account to be deleted on <span className="font-medium">{formatDate(q.data.open.requestedAt)}</span>. {school} has been told and
              will contact you. You can keep using the app until then.
            </span>
          </p>
        ) : (
          <Button variant="outline" className="text-danger" onClick={() => setOpen(true)}>
            <Trash2 /> Request account deletion
          </Button>
        )}
      </CardContent>
      <Dialog open={open} onOpenChange={(o) => !send.isPending && setOpen(o)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              {school} will be asked to delete your account and personal data. When they do, you won’t be able to sign in any more. If you are a parent, your
              children’s school records stay with the school.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Anything the school should know?" htmlFor="del-reason" optional>
              <Textarea id="del-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={3} />
            </Field>
            {send.error && <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{errorMessage(send.error)}</p>}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={send.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => send.mutate()} loading={send.isPending}>
              Send the request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
