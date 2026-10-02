import { TICKET_CATEGORY_LABELS, type TicketDetail } from '@aischool/shared';
import { ArrowLeft, CheckCircle2, Send } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Page } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { formatRelative } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { TicketStatusBadge } from '../platform/ui';
import { useCloseTicket, useMyTicket, useSchoolReply } from './api';
import { TicketThread } from './thread';

export default function SchoolTicketPage() {
  const { id = '' } = useParams();
  const q = useMyTicket(id);
  const t = q.data;
  useDocumentTitle(t ? `#${t.number} ${t.subject}` : 'Support request');
  return (
    <Page className="max-w-4xl">
      <Link to="/support" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Help & support
      </Link>
      {q.error && !t ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : !t ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      ) : (
        <TicketView t={t} />
      )}
    </Page>
  );
}

function TicketView({ t }: { t: TicketDetail }) {
  const reply = useSchoolReply(t.id);
  const close = useCloseTicket(t.id);
  const [body, setBody] = useState('');
  const [confirm, setConfirm] = useState(false);
  const closed = t.status === 'CLOSED';
  const send = () => {
    if (!body.trim()) return;
    reply.mutate(body.trim(), {
      onSuccess: () => {
        setBody('');
        toast.success('Reply sent');
      },
    });
  };
  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[13px] text-muted-foreground">#{t.number}</span>
            <TicketStatusBadge status={t.status} schoolView />
          </div>
          <h1 className="mt-1.5 font-display text-[22px] font-semibold leading-snug tracking-tight [overflow-wrap:anywhere]">{t.subject}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {TICKET_CATEGORY_LABELS[t.category]} · opened {formatRelative(t.createdAt)}
            {t.openedBy && ` by ${t.openedBy.name}`}
          </p>
        </div>
        {!closed && (
          <Button variant="outline" onClick={() => setConfirm(true)}>
            <CheckCircle2 /> {t.status === 'RESOLVED' ? 'Close request' : 'Mark as resolved'}
          </Button>
        )}
      </header>

      <TicketThread thread={t.thread} viewer="school" />

      {closed ? (
        <Card className="p-5 text-center text-[13.5px] text-muted-foreground">
          This request is closed. Still need help?{' '}
          <Link to="/support?new=1" className="font-medium text-brand hover:underline">
            Start a new request
          </Link>
          .
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Textarea
            aria-label="Your reply"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
            rows={4}
            maxLength={5000}
            placeholder={t.status === 'PENDING' ? 'Support is waiting for your reply…' : 'Add more detail or reply to support…'}
            className="min-h-[110px] rounded-none border-0 shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-4 py-3">
            <p className="text-[12px] text-muted-foreground">We’ll notify you when support replies.</p>
            <Button onClick={send} loading={reply.isPending} disabled={!body.trim()}>
              {!reply.isPending && <Send />} Send reply
            </Button>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        destructive={false}
        title="Close this request?"
        description="Glad it’s sorted. You can still read it here; start a new request if anything else comes up."
        confirmLabel="Close request"
        loading={close.isPending}
        onConfirm={() =>
          close.mutate(undefined, {
            onSuccess: () => {
              setConfirm(false);
              toast.success('Request closed');
            },
          })
        }
      />
    </div>
  );
}
