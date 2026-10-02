import { TICKET_CATEGORY_LABELS, TICKET_PRIORITIES, type TicketPriority, type TicketRow, type TicketStatus } from '@aischool/shared';
import { LifeBuoy, MessageSquare, UserCheck } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { type Column, DataTable } from '@/components/ui/data-table';
import { Switch } from '@/components/ui/switch';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Segmented } from '../operations/ui';
import { usePlatformTickets, useSchools, type TicketFilters } from './api';
import { FilterSelect, Muted, NeedsReply, PRIORITY_LABEL, PriorityBadge, TicketStatusBadge, Toolbar } from './ui';

const RANK: Record<TicketPriority, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
type StatusFilter = TicketStatus | 'ACTIVE';

export default function SupportQueuePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const schools = useSchools();
  const raw = params.get('status');
  const status: StatusFilter = raw === 'OPEN' || raw === 'PENDING' || raw === 'RESOLVED' || raw === 'CLOSED' ? raw : 'ACTIVE';
  const priority = (TICKET_PRIORITIES as readonly string[]).includes(params.get('priority') ?? '') ? (params.get('priority') as TicketPriority) : undefined;
  const tenantId = params.get('school') ?? undefined;
  const mine = params.get('mine') === '1';
  const filters: TicketFilters = { status, priority, tenantId, mine };
  const q = usePlatformTickets(filters);

  const setParam = (k: string, v: string | undefined) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set(k, v);
        else n.delete(k);
        return n;
      },
      { replace: true },
    );

  const rows = useMemo(
    () =>
      q.data
        ? [...q.data].sort(
            (a, b) =>
              RANK[a.priority] - RANK[b.priority] || Number(b.awaitingPlatform) - Number(a.awaitingPlatform) || b.lastMessageAt.localeCompare(a.lastMessageAt),
          )
        : undefined,
    [q.data],
  );
  const needsReply = q.data?.filter((t) => t.awaitingPlatform && (t.status === 'OPEN' || t.status === 'PENDING')).length ?? 0;

  const columns: Column<TicketRow>[] = [
    {
      key: 'subject',
      header: 'Ticket',
      cell: (t) => (
        <div className={cn('min-w-0 border-l-2 pl-3', t.priority === 'URGENT' ? 'border-danger' : t.priority === 'HIGH' ? 'border-warning' : 'border-transparent')}>
          <p className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-muted-foreground">#{t.number}</span>
            <span className={cn('max-w-[380px] truncate', t.awaitingPlatform ? 'font-semibold' : 'font-medium')}>{t.subject}</span>
          </p>
          <p className="mt-0.5 flex items-center gap-2 text-[12px] text-muted-foreground">
            {TICKET_CATEGORY_LABELS[t.category]}
            {t.awaitingPlatform && (t.status === 'OPEN' || t.status === 'PENDING') && <NeedsReply />}
          </p>
        </div>
      ),
    },
    {
      key: 'school',
      header: 'School',
      cell: (t) => (
        <div className="min-w-0">
          <p className="max-w-[200px] truncate font-medium">{t.tenant.name}</p>
          <p className="max-w-[200px] truncate text-[12px] text-muted-foreground">{t.openedBy?.name ?? '—'}</p>
        </div>
      ),
    },
    { key: 'priority', header: 'Priority', cell: (t) => <PriorityBadge priority={t.priority} /> },
    { key: 'status', header: 'Status', cell: (t) => <TicketStatusBadge status={t.status} /> },
    { key: 'assignee', header: 'Assignee', cell: (t) => (t.assignedTo ? <span className="whitespace-nowrap">{t.assignedTo.name}</span> : <Muted>Unassigned</Muted>) },
    {
      key: 'last',
      header: 'Last message',
      cell: (t) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
          <MessageSquare className="size-3.5" /> {t.messages} · {formatRelative(t.lastMessageAt)}
        </span>
      ),
    },
  ];

  return (
    <Page>
      <PageHeader eyebrow="Platform" title="Support" description={needsReply ? `${needsReply} ticket${needsReply === 1 ? '' : 's'} waiting on us. Urgent first.` : 'The help desk for every school. Urgent first.'} />
      <Card className="overflow-hidden">
        <Toolbar>
          <Segmented<StatusFilter>
            label="Status"
            value={status}
            onChange={(v) => setParam('status', v === 'ACTIVE' ? undefined : v)}
            options={[
              { value: 'ACTIVE', label: 'Active' },
              { value: 'OPEN', label: 'Open' },
              { value: 'PENDING', label: 'Waiting on school' },
              { value: 'RESOLVED', label: 'Resolved' },
              { value: 'CLOSED', label: 'Closed' },
            ]}
          />
          <FilterSelect label="Priority" allLabel="Any priority" value={priority} onChange={(v) => setParam('priority', v)} options={TICKET_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} className="sm:w-[150px]" />
          <FilterSelect label="School" allLabel="All schools" value={tenantId} onChange={(v) => setParam('school', v)} options={(schools.data ?? []).map((s) => ({ value: s.id, label: s.name }))} className="sm:w-[200px]" />
          <label className="flex items-center gap-2 text-[13px] font-medium sm:ml-auto">
            <Switch checked={mine} onCheckedChange={(c) => setParam('mine', c ? '1' : undefined)} />
            <UserCheck className="size-4 text-muted-foreground" /> Assigned to me
          </label>
        </Toolbar>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(t) => t.id}
          loading={q.isLoading || q.isPlaceholderData}
          error={q.error}
          onRetry={() => void q.refetch()}
          onRowClick={(t) => navigate(`/platform/support/${t.id}`)}
          rowLabel={(t) => `Open ticket ${t.number}: ${t.subject}`}
          renderMobile={(t) => (
            <div className={cn('border-l-2 pl-3', t.priority === 'URGENT' ? 'border-danger' : t.priority === 'HIGH' ? 'border-warning' : 'border-transparent')}>
              <div className="flex items-start gap-2">
                <p className={cn('min-w-0 flex-1 text-[14px]', t.awaitingPlatform ? 'font-semibold' : 'font-medium')}>
                  <span className="mr-1.5 font-mono text-[12px] text-muted-foreground">#{t.number}</span>
                  {t.subject}
                </p>
                <PriorityBadge priority={t.priority} quiet />
              </div>
              <p className="mt-1 truncate text-[12px] text-muted-foreground">
                {t.tenant.name} · {formatRelative(t.lastMessageAt)}
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <TicketStatusBadge status={t.status} />
                {t.awaitingPlatform && (t.status === 'OPEN' || t.status === 'PENDING') && <NeedsReply />}
              </div>
            </div>
          )}
          empty={{
            icon: LifeBuoy,
            title: status === 'ACTIVE' && !priority && !tenantId && !mine ? 'Inbox zero' : 'No tickets match',
            description: status === 'ACTIVE' ? 'No open tickets right now.' : 'Try another filter.',
          }}
        />
      </Card>
    </Page>
  );
}
