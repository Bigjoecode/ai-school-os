import { createTicketSchema, TICKET_CATEGORIES, TICKET_CATEGORY_LABELS, type TicketCategory, type TicketPriority, type TicketRow } from '@aischool/shared';
import { LifeBuoy, MessageSquare, Plus, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { type Column, DataTable } from '@/components/ui/data-table';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { apiFieldErrors, FormError, Segmented, zodErrors } from '../operations/ui';
import { TicketStatusBadge } from '../platform/ui';
import { useMyTickets, useOpenTicket } from './api';

export default function SupportPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = useMyTickets();
  const [view, setView] = useState<'open' | 'all'>('open');
  const preset = params.get('new');
  const [open, setOpen] = useState(!!preset);
  useEffect(() => {
    if (preset) setOpen(true);
  }, [preset]);

  const rows = q.data?.filter((t) => view === 'all' || t.status === 'OPEN' || t.status === 'PENDING');
  const waiting = q.data?.filter((t) => t.status === 'PENDING').length ?? 0;

  const columns: Column<TicketRow>[] = [
    {
      key: 'subject',
      header: 'Subject',
      cell: (t) => (
        <div className="min-w-0">
          <p className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-muted-foreground">#{t.number}</span>
            <span className={cn('max-w-[420px] truncate', t.status === 'PENDING' ? 'font-semibold' : 'font-medium')}>{t.subject}</span>
          </p>
          <p className="text-[12px] text-muted-foreground">
            {TICKET_CATEGORY_LABELS[t.category]}
            {t.openedBy && ` · ${t.openedBy.name}`}
          </p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (t) => <TicketStatusBadge status={t.status} schoolView /> },
    {
      key: 'last',
      header: 'Last update',
      cell: (t) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
          <MessageSquare className="size-3.5" /> {t.messages} · {formatRelative(t.lastMessageAt)}
        </span>
      ),
    },
  ];

  return (
    <Page className="max-w-5xl">
      <PageHeader
        title="Help & support"
        description="Ask the AI School OS team anything — something not working, billing, accounts or ideas. We reply here and notify you."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus /> New request
          </Button>
        }
      />
      {waiting > 0 && (
        <p className="mb-4 rounded-xl border border-warning/30 bg-warning-soft/40 px-4 py-2.5 text-[13px] text-warning">
          {waiting} request{waiting === 1 ? ' is' : 's are'} waiting for your reply.
        </p>
      )}
      <Card className="overflow-hidden">
        <div className="border-b border-border p-3 sm:p-4">
          <Segmented
            label="Show"
            value={view}
            onChange={setView}
            options={[
              { value: 'open', label: 'Open', count: q.data?.filter((t) => t.status === 'OPEN' || t.status === 'PENDING').length },
              { value: 'all', label: 'All requests' },
            ]}
          />
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(t) => t.id}
          loading={q.isLoading}
          error={q.error}
          onRetry={() => void q.refetch()}
          onRowClick={(t) => navigate(`/support/${t.id}`)}
          rowLabel={(t) => `Open request ${t.number}`}
          renderMobile={(t) => (
            <div>
              <p className={cn('text-[14px]', t.status === 'PENDING' ? 'font-semibold' : 'font-medium')}>
                <span className="mr-1.5 font-mono text-[12px] text-muted-foreground">#{t.number}</span>
                {t.subject}
              </p>
              <div className="mt-1.5 flex items-center gap-2 text-[12px] text-muted-foreground">
                <TicketStatusBadge status={t.status} schoolView /> {formatRelative(t.lastMessageAt)}
              </div>
            </div>
          )}
          empty={{
            icon: LifeBuoy,
            title: view === 'open' ? 'No open requests' : 'No requests yet',
            description: 'When you need help, start a request and we’ll reply here.',
            action: (
              <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                <Plus /> New request
              </Button>
            ),
          }}
        />
      </Card>
      <NewTicketDialog
        open={open}
        preset={preset}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o && preset)
            setParams(
              (p) => {
                const n = new URLSearchParams(p);
                n.delete('new');
                return n;
              },
              { replace: true },
            );
        }}
      />
    </Page>
  );
}

function NewTicketDialog({ open, onOpenChange, preset }: { open: boolean; onOpenChange: (o: boolean) => void; preset: string | null }) {
  const navigate = useNavigate();
  const openTicket = useOpenTicket();
  const [v, setV] = useState({ subject: '', category: 'TECHNICAL' as TicketCategory, priority: 'NORMAL' as TicketPriority, body: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    const cat = (TICKET_CATEGORIES as readonly string[]).includes(preset?.toUpperCase() ?? '') ? (preset!.toUpperCase() as TicketCategory) : 'TECHNICAL';
    setV({ subject: '', category: cat, priority: 'NORMAL', body: '' });
  }, [open, preset]);

  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    const parsed = createTicketSchema.safeParse(v);
    if (!parsed.success) return setErrors(zodErrors(parsed.error.issues));
    openTicket.mutate(parsed.data, {
      onSuccess: (t) => {
        toast.success(`Request #${t.number} sent`, { description: 'We’ll reply here and notify you.' });
        onOpenChange(false);
        navigate(`/support/${t.id}`);
      },
      onError: (err) => setErrors(apiFieldErrors(err)),
    });
  };

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="New support request" description="Tell us what’s happening. Screens, names and steps help us help you faster." icon={<Send />} submitLabel="Send request" pending={openTicket.isPending} onSubmit={submit} size="lg">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Subject" htmlFor="tk-subject" error={errors.subject} className="sm:col-span-2">
          <Input id="tk-subject" value={v.subject} onChange={(e) => setV((p) => ({ ...p, subject: e.target.value }))} placeholder="e.g. Report cards won’t print for JSS 2" maxLength={160} invalid={!!errors.subject} />
        </Field>
        <Field label="What’s it about?" htmlFor="tk-cat" error={errors.category}>
          <Select value={v.category} onValueChange={(c) => setV((p) => ({ ...p, category: c as TicketCategory }))}>
            <SelectTrigger id="tk-cat">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TICKET_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {TICKET_CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="How urgent?" htmlFor="tk-pri" error={errors.priority}>
          <Select value={v.priority} onValueChange={(c) => setV((p) => ({ ...p, priority: c as TicketPriority }))}>
            <SelectTrigger id="tk-pri">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LOW">Low — whenever you can</SelectItem>
              <SelectItem value="NORMAL">Normal</SelectItem>
              <SelectItem value="HIGH">High — it’s slowing us down</SelectItem>
              <SelectItem value="URGENT">Urgent — we can’t work</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Details" htmlFor="tk-body" error={errors.body} hint="At least 10 characters. Please don’t include passwords or card numbers." className="sm:col-span-2">
          <Textarea id="tk-body" rows={7} value={v.body} onChange={(e) => setV((p) => ({ ...p, body: e.target.value }))} maxLength={5000} invalid={!!errors.body} />
        </Field>
      </div>
      <div className="mt-4">
        <FormError message={errors.form} />
      </div>
    </FormDialog>
  );
}
