import { ScrollText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounced } from '@/lib/hooks';
import { formatDateTime, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { dateInput, Segmented } from '../operations/ui';
import { type AuditFilters, usePlatformAudit, useSchools } from './api';
import { FilterSelect, PlatformRoleBadge, Toolbar } from './ui';

const ACTION_PRESETS = [
  { value: 'platform.', label: 'Platform changes' },
  { value: 'billing.', label: 'Billing' },
  { value: 'support.', label: 'Support' },
  { value: 'auth.', label: 'Sign-ins & switching' },
];

export default function PlatformAuditPage() {
  const schools = useSchools();
  const [scope, setScope] = useState<AuditFilters['scope']>('all');
  const [tenantId, setTenantId] = useState<string>();
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const dAction = useDebounced(action.trim(), 350);
  const dActor = useDebounced(actor.trim(), 350);
  const filters: AuditFilters = useMemo(
    () => ({ scope, tenantId: scope === 'platform' ? undefined : tenantId, action: dAction || undefined, actor: dActor || undefined, from: from || undefined, to: to || undefined }),
    [scope, tenantId, dAction, dActor, from, to],
  );
  const q = usePlatformAudit(filters);
  const rows = q.data?.pages.flatMap((p) => p.rows);
  const filtered = scope !== 'all' || tenantId || action || actor || from || to;

  return (
    <Page>
      <PageHeader eyebrow="Platform" title="Audit log" description="Everything that changed, on the platform and inside schools, newest first." />
      <Card className="overflow-hidden">
        <Toolbar className="gap-y-2.5">
          <Segmented<AuditFilters['scope']>
            label="Scope"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'all', label: 'Everything' },
              { value: 'platform', label: 'Platform' },
              { value: 'schools', label: 'Schools' },
            ]}
          />
          {scope !== 'platform' && (
            <FilterSelect label="School" allLabel="All schools" value={tenantId} onChange={setTenantId} options={(schools.data ?? []).map((s) => ({ value: s.id, label: s.name }))} className="sm:w-[190px]" />
          )}
          <div className="relative sm:w-48">
            <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Action starts with…" aria-label="Action prefix" className="h-9 font-mono text-[12.5px]" list="audit-actions" />
            <datalist id="audit-actions">
              {ACTION_PRESETS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </datalist>
          </div>
          <Input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Actor name or email" aria-label="Actor" className="h-9 sm:w-48" />
          <div className="flex items-center gap-1.5">
            <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From" className={cn('h-9 w-full sm:w-[150px]', dateInput)} />
            <span className="text-muted-foreground">–</span>
            <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To" className={cn('h-9 w-full sm:w-[150px]', dateInput)} />
          </div>
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setScope('all');
                setTenantId(undefined);
                setAction('');
                setActor('');
                setFrom('');
                setTo('');
              }}
            >
              Clear
            </Button>
          )}
        </Toolbar>
        {q.error && !rows ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : !rows ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={ScrollText} title={filtered ? 'Nothing matches' : 'No activity yet'} description={filtered ? 'Try widening the filters.' : undefined} />
        ) : (
          <ol className={cn('divide-y divide-border transition-opacity', q.isPlaceholderData && 'opacity-60')}>
            {rows.map((a) => (
              <li key={a.id} className="grid gap-1.5 px-4 py-3 sm:px-5 md:grid-cols-[150px_minmax(0,1fr)_220px] md:gap-4">
                <time className="text-[12px] text-muted-foreground tabular" dateTime={a.createdAt} title={formatDateTime(a.createdAt)}>
                  {formatDateTime(a.createdAt)}
                  <span className="block text-[11px]">{formatRelative(a.createdAt)}</span>
                </time>
                <div className="min-w-0">
                  <p className="text-[13.5px] [overflow-wrap:anywhere]">{a.summary}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted-foreground">
                    <button type="button" className="font-mono hover:text-foreground hover:underline" onClick={() => setAction(a.action)} title="Filter by this action">
                      {a.action}
                    </button>
                    {a.ip && <span className="font-mono">{a.ip}</span>}
                  </p>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 md:flex-col md:items-end md:gap-1">
                  {a.actor ? (
                    <span className="flex min-w-0 items-center gap-1.5 text-[12.5px]">
                      <span className="truncate font-medium" title={a.actor.email}>
                        {a.actor.name}
                      </span>
                      {a.actor.platformRole && <PlatformRoleBadge role={a.actor.platformRole} />}
                    </span>
                  ) : (
                    <span className="text-[12.5px] text-muted-foreground">System</span>
                  )}
                  {a.tenant ? (
                    <Link to={`/platform/schools/${a.tenant.id}`} className="truncate text-[12px] text-muted-foreground hover:text-foreground hover:underline">
                      {a.tenant.name}
                    </Link>
                  ) : (
                    <Badge variant="outline">Platform</Badge>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        {rows && rows.length > 0 && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3 text-[12.5px] text-muted-foreground">
            <span className="tabular">{rows.length} entries shown</span>
            {q.hasNextPage ? (
              <Button variant="outline" size="sm" onClick={() => void q.fetchNextPage()} loading={q.isFetchingNextPage}>
                Load more
              </Button>
            ) : (
              <span>End of log</span>
            )}
          </div>
        )}
      </Card>
    </Page>
  );
}
