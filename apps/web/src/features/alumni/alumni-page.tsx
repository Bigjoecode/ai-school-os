import { ALUMNI_SOURCE_LABELS, type AlumniCount, type AlumniFilter, type AlumniRow } from '@aischool/shared';
import { BadgeCheck, Briefcase, Building2, ChartColumn, Download, FileUp, GraduationCap, Inbox, MapPin, Plus, Send, Sparkles, UserCheck, Users } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { type Column, DataTable, Pagination } from '@/components/ui/data-table';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorMessage } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { formatDate, formatNumber } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { initials } from '@/lib/utils';
import { StatTile } from '../attendance/ui';
import { AlumniDialog } from './alumni-dialog';
import { AlumniSheet } from './alumni-sheet';
import { downloadAlumniCsv, useAlumni, useAlumniPending, useAlumniStats, useBackfillAlumni } from './api';
import { ImportDialog } from './import-dialog';
import { MessageDialog } from './message-dialog';

type Tab = 'directory' | 'verify' | 'insights';
const TABS: Tab[] = ['directory', 'verify', 'insights'];

const now = (r: AlumniRow) => [r.course && r.currentInstitution ? `${r.course}, ${r.currentInstitution}` : r.currentInstitution, r.occupation && r.employer ? `${r.occupation}, ${r.employer}` : (r.occupation ?? r.employer)].filter(Boolean) as string[];

export default function AlumniPage() {
  const canManage = useCan('alumni.manage');
  const canSend = useCan('comms.send') && canManage;
  const stats = useAlumniStats();
  const backfill = useBackfillAlumni();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'directory';
  const openId = params.get('id');
  const setParam = (k: string, v: string | undefined) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (v) p.set(k, v);
        else p.delete(k);
        return p;
      },
      { replace: true },
    );
  const [editing, setEditing] = useState<AlumniRow | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ filter: AlumniFilter; ids?: string[]; label: string } | null>(null);
  // Directory filters live here so Export and Message use them too.
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const [year, setYear] = useState<number | undefined>();
  const [finalClass, setFinalClass] = useState<string | undefined>();
  const [city, setCity] = useState('');
  const cityQ = useDebounced(city.trim(), 300);
  const [verified, setVerified] = useState<'true' | 'false' | undefined>();
  const [consent, setConsent] = useState<'true' | 'false' | undefined>();
  const filter: AlumniFilter = useMemo(() => ({ q: q || undefined, year, finalClass, city: cityQ || undefined, verified, consent }), [q, year, finalClass, cityQ, verified, consent]);
  const describe = () => {
    const bits = [year && `class of ${year}`, finalClass, cityQ && `in ${cityQ}`, q && `matching “${q}”`].filter(Boolean);
    return bits.length ? `alumni ${bits.join(', ')}` : 'all alumni';
  };
  const s = stats.data;

  return (
    <Page>
      <PageHeader
        title="Alumni"
        description="Old students: graduates, website sign-ups and imported lists — where they are now, and a way to stay in touch."
        actions={
          <>
            <Button variant="outline" onClick={() => void downloadAlumniCsv(filter).catch((e) => toast.error(errorMessage(e)))}>
              <Download /> Export
            </Button>
            {canManage && (
              <Button variant="outline" onClick={() => setImporting(true)}>
                <FileUp /> Import
              </Button>
            )}
            {canSend && (
              <Button variant="outline" onClick={() => setMessage({ filter, label: describe() })}>
                <Send /> Message
              </Button>
            )}
            {canManage && (
              <Button onClick={() => setEditing('new')}>
                <Plus /> Add
              </Button>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Alumni" icon={<Users />} value={s ? formatNumber(s.total) : '—'} sub={s ? `${formatNumber(s.verified)} verified` : undefined} loading={!s && stats.isLoading} />
        <StatTile
          label="To verify"
          icon={<UserCheck />}
          value={s ? formatNumber(s.pending) : '—'}
          tone={s && s.pending > 0 ? 'warning' : undefined}
          sub={s?.pending ? 'Website sign-ups waiting' : 'Nothing waiting'}
          loading={!s && stats.isLoading}
        />
        <StatTile label="Can be contacted" icon={<Send />} value={s ? formatNumber(s.withConsent) : '—'} sub={s ? `${formatNumber(s.reachable.email)} by email · ${formatNumber(s.reachable.sms)} by SMS` : undefined} loading={!s && stats.isLoading} />
        <StatTile label="Graduating sets" icon={<GraduationCap />} value={s ? formatNumber(s.byYear.length) : '—'} sub={s?.byYear.length ? `${s.byYear[0]!.year} – ${s.byYear.at(-1)!.year}` : 'No years yet'} loading={!s && stats.isLoading} />
      </div>

      {canManage && s && s.graduatesWithoutRecord > 0 && (
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-info/30 bg-info-soft/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13.5px]">
            <span className="font-semibold">{formatNumber(s.graduatesWithoutRecord)}</span> student{s.graduatesWithoutRecord === 1 ? ' is' : 's are'} marked as graduated but not in the alumni directory yet.
          </p>
          <Button
            size="sm"
            loading={backfill.isPending}
            onClick={() => backfill.mutate(undefined, { onSuccess: (r) => toast.success(`${r.created} alumni record${r.created === 1 ? '' : 's'} created`) })}
          >
            <Sparkles /> Create alumni records for graduated students
          </Button>
        </div>
      )}

      <Tabs value={tab} onValueChange={(t) => setParam('tab', t === 'directory' ? undefined : t)}>
        <TabsList aria-label="Alumni sections">
          <TabsTrigger value="directory">
            <Users /> Directory
          </TabsTrigger>
          <TabsTrigger value="verify">
            <Inbox /> To verify{s?.pending ? <Badge variant="warning">{s.pending}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="insights">
            <ChartColumn /> Where they are now
          </TabsTrigger>
        </TabsList>
        <TabsContent value="directory">
          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap">
            <SearchInput value={search} onChange={setSearch} placeholder="Name, university, employer…" className="lg:w-72" />
            <Select value={year ? String(year) : NONE} onValueChange={(v) => setYear(v === NONE ? undefined : Number(v))}>
              <SelectTrigger aria-label="Graduation year" className="lg:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Every year</SelectItem>
                {s?.years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    Class of {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={finalClass ?? NONE} onValueChange={(v) => setFinalClass(v === NONE ? undefined : v)}>
              <SelectTrigger aria-label="Final class" className="lg:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Any final class</SelectItem>
                {s?.finalClasses.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input aria-label="City" placeholder="City or country" value={city} onChange={(e) => setCity(e.target.value)} className="lg:w-40" />
            <Select value={verified ?? NONE} onValueChange={(v) => setVerified(v === NONE ? undefined : (v as 'true' | 'false'))}>
              <SelectTrigger aria-label="Verified" className="lg:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Verified or not</SelectItem>
                <SelectItem value="true">Verified</SelectItem>
                <SelectItem value="false">Not verified</SelectItem>
              </SelectContent>
            </Select>
            <Select value={consent ?? NONE} onValueChange={(v) => setConsent(v === NONE ? undefined : (v as 'true' | 'false'))}>
              <SelectTrigger aria-label="Consent" className="lg:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Any consent</SelectItem>
                <SelectItem value="true">Happy to be contacted</SelectItem>
                <SelectItem value="false">Not to be contacted</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Directory filter={filter} onOpen={(id) => setParam('id', id)} />
        </TabsContent>
        <TabsContent value="verify">
          <VerifyQueue onOpen={(id) => setParam('id', id)} />
        </TabsContent>
        <TabsContent value="insights">
          <Insights />
        </TabsContent>
      </Tabs>

      <AlumniSheet
        id={openId}
        onClose={() => setParam('id', undefined)}
        canManage={canManage}
        onEdit={(r) => setEditing(r)}
        onMessage={canSend ? (r) => setMessage({ filter: {}, ids: [r.id], label: r.name }) : undefined}
      />
      <AlumniDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} row={editing === 'new' ? null : editing} />
      <ImportDialog open={importing} onOpenChange={setImporting} />
      {canSend && <MessageDialog open={!!message} onOpenChange={(o) => !o && setMessage(null)} filter={message?.filter ?? {}} ids={message?.ids} audienceLabel={message?.label ?? ''} />}
    </Page>
  );
}

// ------------------------------------------------------------------ directory

function Directory({ filter, onOpen }: { filter: AlumniFilter; onOpen: (id: string) => void }) {
  const [page, setPage] = useState(1);
  const key = JSON.stringify(filter);
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setPage(1);
  }
  const list = useAlumni({ ...(filter as object), page, pageSize: 25 } as Parameters<typeof useAlumni>[0]);
  const columns: Column<AlumniRow>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (r) => (
        <div className="flex items-center gap-3">
          <Avatar name={r.name} initials={initials(r.firstName, r.lastName)} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-medium">{r.name}</p>
            <p className="text-[12px] text-muted-foreground">{[r.graduationYear && `Class of ${r.graduationYear}`, r.finalClass].filter(Boolean).join(' · ') || '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'now',
      header: 'Now',
      cell: (r) => {
        const n = now(r);
        return n.length ? (
          <div className="max-w-[280px] text-[13px]">
            {n.map((x) => (
              <p key={x} className="truncate">
                {x}
              </p>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    { key: 'city', header: 'Lives in', cell: (r) => <span className="text-[13px]">{[r.city, r.country].filter(Boolean).join(', ') || '—'}</span> },
    { key: 'contact', header: 'Contact', cell: (r) => <div className="text-[12.5px] text-muted-foreground">{r.email && <p className="truncate">{r.email}</p>}{r.phone && <p>{r.phone}</p>}{!r.email && !r.phone && '—'}</div> },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.verified ? <Badge variant="success">Verified</Badge> : <Badge variant="warning">To verify</Badge>}
          {!r.consentToContact && <Badge variant="secondary">No contact</Badge>}
        </div>
      ),
    },
  ];
  return (
    <Card className="overflow-hidden">
      <DataTable
        columns={columns}
        rows={list.data?.items}
        rowKey={(r) => r.id}
        loading={list.isFetching}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={(r) => onOpen(r.id)}
        rowLabel={(r) => `Open ${r.name}`}
        renderMobile={(r) => (
          <div className="flex items-start gap-3">
            <Avatar name={r.name} initials={initials(r.firstName, r.lastName)} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-[13.5px] font-medium">
                {r.name} {!r.verified && <Badge variant="warning">To verify</Badge>}
              </p>
              <p className="text-[12px] text-muted-foreground">{[r.graduationYear && `Class of ${r.graduationYear}`, r.finalClass, r.city].filter(Boolean).join(' · ')}</p>
              {now(r)[0] && <p className="truncate text-[12.5px]">{now(r)[0]}</p>}
            </div>
          </div>
        )}
        empty={{ icon: GraduationCap, title: 'No alumni found', description: 'Graduates are added when you apply end-of-session promotion. You can also import a list or add people by hand.' }}
      />
      {list.data && list.data.total > 25 && <Pagination page={page} pageSize={25} total={list.data.total} onPageChange={setPage} noun="alumni" />}
    </Card>
  );
}

// ------------------------------------------------------------------ verify

function VerifyQueue({ onOpen }: { onOpen: (id: string) => void }) {
  const q = useAlumniPending();
  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-40 rounded-2xl" />;
  if (!q.data.length)
    return (
      <Card>
        <EmptyState
          icon={BadgeCheck}
          title="Nothing to verify"
          description="When old students sign up on your website’s Alumni page, they wait here for you to confirm them. Switch the page on under Website → Pages."
        />
      </Card>
    );
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {q.data.map((p) => (
        <button key={p.id} type="button" onClick={() => onOpen(p.id)} className="rounded-2xl border border-border bg-card p-4 text-left shadow-soft transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="flex items-start gap-3">
            <Avatar name={p.name} initials={initials(p.firstName, p.lastName)} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold">{p.name}</p>
              <p className="text-[12.5px] text-muted-foreground">
                {[p.graduationYear && `Class of ${p.graduationYear}`, p.finalClass, `signed up ${formatDate(p.createdAt)}`].filter(Boolean).join(' · ')}
              </p>
              {now(p)[0] && <p className="mt-1 truncate text-[12.5px]">{now(p)[0]}</p>}
            </div>
            <Badge variant={p.matches.length ? 'info' : 'secondary'}>{p.matches.length ? `${p.matches.length} match${p.matches.length === 1 ? '' : 'es'}` : 'No match'}</Badge>
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">{ALUMNI_SOURCE_LABELS[p.source]}</p>
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ insights

function TopList({ title, icon, rows, empty }: { title: string; icon: ReactNode; rows: AlumniCount[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="mb-3 flex items-center gap-2 font-display text-[15px] font-semibold [&_svg]:size-4 [&_svg]:text-muted-foreground">
        {icon} {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-[13px]">
              <span className="truncate">{r.name}</span>
              <span className="font-semibold tabular">{r.count}</span>
              <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-brand" style={{ width: `${(r.count / max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Insights() {
  const q = useAlumniStats();
  const s = q.data;
  if (q.error && !s) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!s) return <Skeleton className="h-64 rounded-2xl" />;
  const maxYear = Math.max(1, ...s.byYear.map((y) => y.count));
  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <h3 className="mb-4 flex items-center gap-2 font-display text-[15px] font-semibold">
          <GraduationCap className="size-4 text-muted-foreground" /> Alumni by graduating year
        </h3>
        {s.byYear.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No graduation years recorded yet.</p>
        ) : (
          <div className="flex h-44 items-end gap-1.5 overflow-x-auto pb-1" role="img" aria-label={`Alumni by year: ${s.byYear.map((y) => `${y.year}: ${y.count}`).join(', ')}`}>
            {s.byYear.map((y) => (
              <div key={y.year} className="flex h-full min-w-9 flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[11px] font-semibold tabular">{y.count}</span>
                <span className="w-full rounded-t-md bg-brand/80" style={{ height: `${Math.max(4, (y.count / maxYear) * 100)}%` }} />
                <span className="text-[11px] text-muted-foreground tabular">{y.year}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        <TopList title="Universities & schools" icon={<Building2 />} rows={s.institutions} empty="No institutions recorded yet." />
        <TopList title="Employers" icon={<Briefcase />} rows={s.employers} empty="No employers recorded yet." />
        <TopList title="Occupations" icon={<Users />} rows={s.occupations} empty="No occupations recorded yet." />
        <TopList title="Cities" icon={<MapPin />} rows={s.cities} empty="No cities recorded yet." />
      </div>
    </div>
  );
}
