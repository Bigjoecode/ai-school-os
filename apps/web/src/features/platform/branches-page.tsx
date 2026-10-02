import { TENANT_STATUSES } from '@aischool/shared';
import { GitBranch } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { type Column, DataTable } from '@/components/ui/data-table';
import { SearchInput } from '@/components/ui/search-input';
import { formatDate, formatNumber } from '@/lib/format';
import { titleCase } from '@/lib/utils';
import { type BranchRow, useBranches } from './api';
import { FilterSelect, Muted, SchoolCell, TenantStatusBadge, Toolbar } from './ui';

export default function BranchesPage() {
  const navigate = useNavigate();
  const q = useBranches();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>();

  const rows = useMemo(() => {
    if (!q.data) return undefined;
    const s = search.trim().toLowerCase();
    return q.data.filter((b) => (!s || `${b.name} ${b.code ?? ''} ${b.tenant.name} ${b.address ?? ''}`.toLowerCase().includes(s)) && (!status || b.tenant.status === status));
  }, [q.data, search, status]);

  const columns: Column<BranchRow>[] = [
    {
      key: 'branch',
      header: 'Branch',
      cell: (b) => (
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            {b.name} {b.isMain && <Badge variant="brand">Main</Badge>}
          </p>
          <p className="max-w-[280px] truncate text-[12px] text-muted-foreground">{b.address ?? (b.code ? <span className="font-mono">{b.code}</span> : 'No address')}</p>
        </div>
      ),
    },
    { key: 'school', header: 'School', cell: (b) => <SchoolCell school={b.tenant} /> },
    { key: 'status', header: 'School status', cell: (b) => <TenantStatusBadge status={b.tenant.status} /> },
    { key: 'students', header: 'Students', className: 'tabular text-right', headClassName: 'text-right', cell: (b) => formatNumber(b.students) },
    { key: 'classes', header: 'Classes', className: 'tabular text-right', headClassName: 'text-right', cell: (b) => (b.classes ? formatNumber(b.classes) : <Muted>0</Muted>) },
    { key: 'created', header: 'Added', cell: (b) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(b.createdAt)}</span> },
  ];

  const schools = new Set(q.data?.map((b) => b.tenant.id)).size;

  return (
    <Page>
      <PageHeader eyebrow="Platform" title="Branches" description="Every campus across every school, with students and classes per branch." />
      <Card className="overflow-hidden">
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search branch, code or school…" className="sm:w-80" />
          <FilterSelect label="School status" allLabel="All schools" value={status} onChange={setStatus} options={TENANT_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))} />
          {q.data && (
            <p className="text-[12.5px] text-muted-foreground tabular sm:ml-auto">
              {q.data.length} branches · {schools} schools
            </p>
          )}
        </Toolbar>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(b) => b.id}
          loading={q.isLoading}
          error={q.error}
          onRetry={() => void q.refetch()}
          onRowClick={(b) => navigate(`/platform/schools/${b.tenant.id}`)}
          rowLabel={(b) => `Open ${b.tenant.name}`}
          renderMobile={(b) => (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-[14px] font-medium">
                  {b.name} {b.isMain && <Badge variant="brand">Main</Badge>}
                </p>
                <p className="truncate text-[12px] text-muted-foreground">
                  {b.tenant.name} · {formatNumber(b.students)} students
                </p>
              </div>
              <TenantStatusBadge status={b.tenant.status} />
            </div>
          )}
          empty={{ icon: GitBranch, title: search || status ? 'No branches match' : 'No branches yet', description: 'Schools add branches in Academic Setup.' }}
        />
      </Card>
    </Page>
  );
}
