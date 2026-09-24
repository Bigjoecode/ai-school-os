import type { AuditRow, Paginated } from '@aischool/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { type Column, DataTable, Pagination } from '@/components/ui/data-table';
import { api } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/format';
import { qk } from '@/lib/query-client';
import { initialsFromName } from '@/lib/utils';
import { SectionHeader } from './settings-layout';

const PAGE_SIZE = 25;

function actionVariant(action: string) {
  const a = action.toLowerCase();
  if (a.includes('delete') || a.includes('disable') || a.includes('fail')) return 'danger' as const;
  if (a.includes('create') || a.includes('admit') || a.includes('invite')) return 'success' as const;
  if (a.includes('update') || a.includes('patch') || a.includes('switch')) return 'info' as const;
  if (a.includes('login') || a.includes('auth')) return 'brand' as const;
  return 'secondary' as const;
}

function Actor({ row }: { row: AuditRow }) {
  if (!row.actor) return <span className="text-muted-foreground">System</span>;
  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={row.actor.name} initials={initialsFromName(row.actor.name)} size="sm" />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium">{row.actor.name}</p>
        <p className="truncate text-[11.5px] text-muted-foreground">{row.actor.email}</p>
      </div>
    </div>
  );
}

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const query = { page, pageSize: PAGE_SIZE };
  const list = useQuery({
    queryKey: qk.audit(query),
    queryFn: ({ signal }) => api.get<Paginated<AuditRow>>('/audit', query, signal),
    placeholderData: keepPreviousData,
  });

  const columns: Column<AuditRow>[] = [
    {
      key: 'when',
      header: 'When',
      className: 'whitespace-nowrap',
      cell: (r) => (
        <time dateTime={r.createdAt} title={formatDateTime(r.createdAt)} className="text-muted-foreground">
          {formatRelative(r.createdAt)}
        </time>
      ),
    },
    { key: 'actor', header: 'Actor', cell: (r) => <Actor row={r} /> },
    {
      key: 'event',
      header: 'Event',
      cell: (r) => (
        <div className="min-w-0">
          <p className="text-[13.5px]">{r.summary}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <Badge variant={actionVariant(r.action)} className="font-mono text-[10.5px]">
              {r.action}
            </Badge>
            {r.entityType && <span className="text-[11.5px] text-muted-foreground">{r.entityType}</span>}
          </div>
        </div>
      ),
    },
    { key: 'ip', header: 'IP', cell: (r) => <span className="font-mono text-[12px] text-muted-foreground">{r.ip ?? '—'}</span> },
  ];

  return (
    <div>
      <SectionHeader title="Audit log" description="An immutable trail of every sensitive change in your school." />
      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={list.data?.items}
          rowKey={(r) => r.id}
          loading={list.isFetching}
          error={list.error}
          onRetry={() => void list.refetch()}
          renderMobile={(r) => (
            <div className="flex gap-3">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" aria-hidden />
              <div className="min-w-0">
                <p className="text-[13.5px]">{r.summary}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {r.actor?.name ?? 'System'} · {formatRelative(r.createdAt)}
                </p>
              </div>
            </div>
          )}
          empty={{ icon: ScrollText, title: 'No audit events yet', description: 'Sign-ins and changes will be recorded here.' }}
        />
        {list.data && list.data.total > 0 && (
          <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={setPage} noun="events" />
        )}
      </Card>
    </div>
  );
}
