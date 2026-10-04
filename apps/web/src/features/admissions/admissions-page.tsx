import {
  ADMISSION_OPEN_STATUSES,
  ADMISSION_PIPELINE,
  ADMISSION_SOURCE_LABELS,
  ADMISSION_SOURCES,
  ADMISSION_STATUS_LABELS,
  ADMISSION_STATUSES,
  type AdmissionRow,
  type AdmissionSource,
  type AdmissionStatus,
} from '@aischool/shared';
import { CalendarClock, ClipboardList, Columns3, FilePlus2, GraduationCap, Hourglass, Phone, Settings2, Table2, TrendingUp, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { type Column, DataTable, Pagination } from '@/components/ui/data-table';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth-store';
import { formatRelative } from '@/lib/format';
import { useDebounced, useMediaQuery } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { StatTile } from '../attendance/ui';
import { money, schoolDate } from '../finance/ui';
import { dateInput, Segmented, telHref } from '../operations/ui';
import { useAdmissionsMeta, useAdmissionsStats, useApplications } from './api';
import { AdmissionsSettingsSheet } from './settings-sheet';
import { AdmissionStatusBadge, shortWhen, STATUS_DOT } from './ui';

type View = 'board' | 'table';
type StatusFilter = AdmissionStatus | 'OPEN' | 'ALL';

export default function AdmissionsPage() {
  const canManage = useCan('admissions.manage');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'table' ? 'table' : 'board';
  const [settingsOpen, setSettingsOpen] = useState(false);
  const setView = (v: View) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (v === 'board') p.delete('view');
        else p.set('view', v);
        return p;
      },
      { replace: true },
    );

  return (
    <Page>
      <PageHeader
        title="Admissions"
        description="Every application from first contact to first day — entrance exams, offers and enrolment."
        actions={
          <>
            {canManage && (
              <Button variant="outline" onClick={() => setSettingsOpen(true)}>
                <Settings2 /> Settings
              </Button>
            )}
            {canManage && (
              <Button onClick={() => navigate('/admissions/new')}>
                <FilePlus2 /> New application
              </Button>
            )}
          </>
        }
      />
      <StatsPanel />
      <div className="mt-6">
        <Pipeline view={view} onView={setView} />
      </div>
      {canManage && <AdmissionsSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />}
    </Page>
  );
}

// ------------------------------------------------------------------ stats

const pct = (r: number | null | undefined) => (r == null ? '—' : `${Math.round(r * 100)}%`);

function StatsPanel() {
  const q = useAdmissionsStats();
  const meta = useAdmissionsMeta();
  const s = q.data;
  if (q.error && !s) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const offersOut = s ? s.byStatus.OFFERED : 0;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        <StatTile label="Applications this term" icon={<ClipboardList />} loading={!s} value={s?.total ?? '—'} sub={s ? s.window.label : undefined} />
        <StatTile
          label="Conversion"
          icon={<TrendingUp />}
          loading={!s}
          value={pct(s?.conversionRate)}
          sub={s ? `${s.byStatus.ENROLLED} enrolled · ${pct(s.offerAcceptanceRate)} of offers taken up` : undefined}
        />
        <StatTile
          label="Offers awaiting reply"
          icon={<Hourglass />}
          loading={!s}
          value={offersOut}
          tone={s && s.offersExpiringSoon > 0 ? 'warning' : undefined}
          sub={s ? (s.offersExpiringSoon ? <span className="font-medium text-warning">{s.offersExpiringSoon} expire within 3 days</span> : `${s.byStatus.ACCEPTED} accepted, not yet enrolled`) : undefined}
        />
        <StatTile
          label="Entrance exams this week"
          icon={<CalendarClock />}
          loading={!s}
          value={s?.examsThisWeek ?? '—'}
          sub={s && meta.data ? (s.feesCollectedKobo ? `${money(s.feesCollectedKobo, meta.data.currency)} in application fees` : `${s.byStatus.EXAM_SCHEDULED} booked in all`) : undefined}
        />
      </div>
      {s && s.total > 0 && (
        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <BreakdownCard title="By class applied for" rows={s.byClass.map((c) => ({ label: c.name, count: c.count, extra: c.enrolled ? `${c.enrolled} enrolled` : null }))} total={s.total} />
          <BreakdownCard title="By source" rows={s.bySource.map((c) => ({ label: ADMISSION_SOURCE_LABELS[c.source], count: c.count, extra: null }))} total={s.total} />
        </div>
      )}
    </div>
  );
}

function BreakdownCard({ title, rows, total }: { title: string; rows: { label: string; count: number; extra: string | null }[]; total: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 5);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-[14px]">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2.5">
          {shown.map((r) => (
            <li key={r.label} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3 text-[12.5px]">
              <span className="truncate font-medium">{r.label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.max(4, (r.count / total) * 100)}%` }} />
              </span>
              <span className="text-right text-muted-foreground tabular">
                {r.count}
                {r.extra && <span className="hidden sm:inline"> · {r.extra}</span>}
              </span>
            </li>
          ))}
        </ul>
        {rows.length > 5 && (
          <Button variant="link" size="sm" className="mt-2 h-auto text-[12px]" onClick={() => setAll((x) => !x)}>
            {all ? 'Show fewer' : `Show all ${rows.length}`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ pipeline

function Pipeline({ view, onView }: { view: View; onView: (v: View) => void }) {
  const wide = useMediaQuery('(min-width: 1024px)');
  const meta = useAdmissionsMeta();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const [classLevelId, setClassLevelId] = useState<string>();
  const [source, setSource] = useState<AdmissionSource>();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<StatusFilter>('OPEN');
  const [page, setPage] = useState(1);
  const [showClosed, setShowClosed] = useState(false);
  const board = view === 'board';
  const filters = { q: q || undefined, classLevelId, source, from: from || undefined, to: to || undefined };
  const list = useApplications(board ? { ...filters, status: 'ALL', pageSize: 500 } : { ...filters, status, page, pageSize: 50 });
  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };
  const counts = list.data?.counts;
  const openCount = counts ? ADMISSION_OPEN_STATUSES.reduce((n, s) => n + counts[s], 0) : undefined;
  const statusOptions = [
    { value: 'OPEN' as StatusFilter, label: 'In progress', count: openCount },
    ...ADMISSION_STATUSES.map((s) => ({ value: s as StatusFilter, label: ADMISSION_STATUS_LABELS[s], count: counts?.[s] })),
    { value: 'ALL' as StatusFilter, label: 'All' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="font-display text-[17px] font-semibold tracking-tight">Applications</h2>
        <Segmented
          size="sm"
          label="View"
          value={view}
          onChange={onView}
          options={[
            { value: 'board', label: (<><Columns3 /> Pipeline</>) },
            { value: 'table', label: (<><Table2 /> Table</>) },
          ]}
          className="self-start"
        />
      </div>
      <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] lg:items-end [&>*]:min-w-0">
        <SearchInput value={search} onChange={resetPage(setSearch)} placeholder="Number, child, parent or phone…" className="sm:col-span-2 lg:col-span-1" />
        <Select value={classLevelId ?? NONE} onValueChange={(v) => resetPage(setClassLevelId)(v === NONE ? undefined : v)}>
          <SelectTrigger aria-label="Class applied for">
            <SelectValue placeholder="All classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All classes</SelectItem>
            {meta.data?.classLevels.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={source ?? NONE} onValueChange={(v) => resetPage(setSource)(v === NONE ? undefined : (v as AdmissionSource))}>
          <SelectTrigger aria-label="Source">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All sources</SelectItem>
            {ADMISSION_SOURCES.map((s) => (
              <SelectItem key={s} value={s}>
                {ADMISSION_SOURCE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Field label="Received from" htmlFor="adm-from" className="gap-1">
          <Input id="adm-from" type="date" value={from} max={to || undefined} onChange={(e) => resetPage(setFrom)(e.target.value)} className={dateInput} />
        </Field>
        <Field label="To" htmlFor="adm-to" className="gap-1">
          <Input id="adm-to" type="date" value={to} min={from || undefined} onChange={(e) => resetPage(setTo)(e.target.value)} className={dateInput} />
        </Field>
      </Card>

      {board ? (
        <Board rows={list.data?.items} error={list.error} retry={() => void list.refetch()} wide={wide} showClosed={showClosed} setShowClosed={setShowClosed} filtered={!!(q || classLevelId || source || from || to)} />
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-border p-3 sm:px-5">
            <Segmented size="sm" label="Status" value={status} onChange={resetPage(setStatus)} options={statusOptions} />
          </div>
          <ApplicationsTable rows={list.data?.items} loading={list.isLoading || list.isPlaceholderData} error={list.error} retry={() => void list.refetch()} />
          {list.data && list.data.total > list.data.pageSize && <Pagination page={page} pageSize={list.data.pageSize} total={list.data.total} onPageChange={setPage} noun="applications" />}
        </Card>
      )}
    </div>
  );
}

const CLOSED: AdmissionStatus[] = ['WAITLISTED', 'REJECTED', 'WITHDRAWN'];

function Board({
  rows,
  error,
  retry,
  wide,
  showClosed,
  setShowClosed,
  filtered,
}: {
  rows: AdmissionRow[] | undefined;
  error: unknown;
  retry: () => void;
  wide: boolean;
  showClosed: boolean;
  setShowClosed: (v: boolean) => void;
  filtered: boolean;
}) {
  const canManage = useCan('admissions.manage');
  const [filter, setFilter] = useState<AdmissionStatus | 'OPEN'>('OPEN');
  const counts = useMemo(() => {
    const c = Object.fromEntries(ADMISSION_STATUSES.map((s) => [s, 0])) as Record<AdmissionStatus, number>;
    for (const r of rows ?? []) c[r.status]++;
    return c;
  }, [rows]);
  if (error && !rows) return <ErrorState error={error} onRetry={retry} />;
  if (!rows) {
    return (
      <div className="grid gap-3 lg:grid-cols-4" aria-busy>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={GraduationCap}
          title={filtered ? 'No applications match' : 'No applications yet'}
          description={filtered ? 'Try a different search or filter.' : 'Applications from your website, the front desk and converted enquiries appear here.'}
          action={
            canManage && !filtered ? (
              <Button asChild>
                <Link to="/admissions/new">
                  <FilePlus2 /> New application
                </Link>
              </Button>
            ) : undefined
          }
        />
      </Card>
    );
  }
  if (!wide) {
    const shown = rows.filter((r) => (filter === 'OPEN' ? ADMISSION_OPEN_STATUSES.includes(r.status) : r.status === filter));
    return (
      <div className="space-y-3">
        <Segmented
          size="sm"
          label="Stage"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'OPEN', label: 'In progress', count: ADMISSION_OPEN_STATUSES.reduce((n, s) => n + counts[s], 0) },
            ...ADMISSION_STATUSES.map((s) => ({ value: s, label: ADMISSION_STATUS_LABELS[s], count: counts[s] })),
          ]}
        />
        {shown.length === 0 ? (
          <Card>
            <EmptyState compact icon={ClipboardList} title="Nothing at this stage" />
          </Card>
        ) : filter === 'OPEN' ? (
          ADMISSION_OPEN_STATUSES.filter((s) => counts[s] > 0).map((s) => (
            <section key={s} aria-label={ADMISSION_STATUS_LABELS[s]} className="space-y-2">
              <h3 className="flex items-center gap-2 px-1 text-[12.5px] font-semibold text-muted-foreground">
                <span className={cn('size-2 rounded-full', STATUS_DOT[s])} aria-hidden /> {ADMISSION_STATUS_LABELS[s]}
                <span className="tabular">· {counts[s]}</span>
              </h3>
              <ul className="space-y-2">
                {shown
                  .filter((r) => r.status === s)
                  .map((r) => (
                    <li key={r.id}>
                      <ApplicationCard a={r} />
                    </li>
                  ))}
              </ul>
            </section>
          ))
        ) : (
          <ul className="space-y-2">
            {shown.map((r) => (
              <li key={r.id}>
                <ApplicationCard a={r} />
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  const columns = showClosed ? [...ADMISSION_PIPELINE, ...CLOSED] : [...ADMISSION_PIPELINE, 'WAITLISTED' as const];
  const closedCount = counts.REJECTED + counts.WITHDRAWN;
  return (
    <div className="space-y-2">
      <label htmlFor="adm-closed" className="flex w-fit cursor-pointer items-center gap-2 text-[13px] text-muted-foreground">
        <Checkbox id="adm-closed" checked={showClosed} onCheckedChange={(c) => setShowClosed(c === true)} /> Show not offered and withdrawn{closedCount ? ` (${closedCount})` : ''}
      </label>
      <div className="scrollbar-thin -mx-1 overflow-x-auto px-1 pb-2">
        <div className="grid auto-cols-[minmax(230px,1fr)] grid-flow-col items-start gap-3">
          {columns.map((s) => {
            const items = rows.filter((r) => r.status === s);
            return (
              <section key={s} aria-label={ADMISSION_STATUS_LABELS[s]} className="flex min-w-0 flex-col rounded-2xl border border-border bg-muted/30">
                <header className="flex items-center gap-2 px-3 py-2.5">
                  <span className={cn('size-2 rounded-full', STATUS_DOT[s])} aria-hidden />
                  <span className="text-[13px] font-semibold">{ADMISSION_STATUS_LABELS[s]}</span>
                  <span className="ml-auto text-[12px] text-muted-foreground tabular">{items.length}</span>
                </header>
                <ul className="flex max-h-[70vh] flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                  {items.length === 0 && <li className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[12px] text-muted-foreground">None</li>}
                  {items.map((r) => (
                    <li key={r.id}>
                      <ApplicationCard a={r} compact />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function KeyDate({ a }: { a: AdmissionRow }) {
  if (a.status === 'EXAM_SCHEDULED' && a.examAt) return <span className="inline-flex items-center gap-1"><CalendarClock className="size-3" aria-hidden /> Exam {shortWhen(a.examAt)}</span>;
  if (a.status === 'INTERVIEW' && a.interviewAt) return <span className="inline-flex items-center gap-1"><CalendarClock className="size-3" aria-hidden /> Interview {shortWhen(a.interviewAt)}</span>;
  if (a.status === 'OFFERED' && a.offerExpiresOn) return <span className="inline-flex items-center gap-1"><Hourglass className="size-3" aria-hidden /> Reply by {schoolDate(a.offerExpiresOn)}</span>;
  return <span>{formatRelative(a.createdAt)}</span>;
}

function ApplicationCard({ a, compact }: { a: AdmissionRow; compact?: boolean }) {
  return (
    <Card className="relative p-3.5 shadow-none transition-colors hover:border-border-strong">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={`/admissions/${a.id}`} className="block truncate text-[13.5px] font-medium after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">
            {a.childName}
          </Link>
          <p className="truncate text-[12px] text-muted-foreground">
            {[a.classLevel?.name ?? 'Class not chosen', a.entryTerm].filter(Boolean).join(' · ')}
          </p>
        </div>
        {!compact && <AdmissionStatusBadge status={a.status} className="shrink-0" />}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
        <span className="font-mono tabular">{a.number}</span>
        <KeyDate a={a} />
        {a.examScore != null && <span>Score {a.examScore}</span>}
        {a.feeDue && (
          <Badge variant="warning" className="relative z-10">
            <Wallet /> Fee due
          </Badge>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[11.5px]">
        <span className="truncate text-muted-foreground">{a.parentName}</span>
        <a href={telHref(a.parentPhone)} className="relative z-10 ml-auto inline-flex shrink-0 items-center gap-1 font-medium text-brand hover:underline">
          <Phone className="size-3" aria-hidden /> {a.parentPhone}
        </a>
      </div>
    </Card>
  );
}

function ApplicationsTable({ rows, loading, error, retry }: { rows: AdmissionRow[] | undefined; loading: boolean; error: unknown; retry: () => void }) {
  const navigate = useNavigate();
  const columns: Column<AdmissionRow>[] = [
    { key: 'number', header: 'No.', cell: (a) => <span className="font-mono text-[12px] tabular">{a.number}</span>, className: 'whitespace-nowrap' },
    {
      key: 'child',
      header: 'Child',
      cell: (a) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{a.childName}</p>
          <p className="truncate text-[12px] text-muted-foreground">{a.classLevel?.name ?? 'Class not chosen'}</p>
        </div>
      ),
    },
    {
      key: 'parent',
      header: 'Parent',
      cell: (a) => (
        <div className="min-w-0">
          <p className="truncate">{a.parentName}</p>
          <p className="text-[12px] text-muted-foreground tabular">{a.parentPhone}</p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (a) => <AdmissionStatusBadge status={a.status} /> },
    { key: 'next', header: 'Key date', cell: (a) => <span className="text-[12.5px] text-muted-foreground"><KeyDate a={a} /></span> },
    { key: 'source', header: 'Source', cell: (a) => <span className="text-[12.5px] text-muted-foreground">{ADMISSION_SOURCE_LABELS[a.source]}</span> },
    { key: 'received', header: 'Received', cell: (a) => <span className="whitespace-nowrap text-[12.5px] text-muted-foreground tabular">{schoolDate(a.createdAt)}</span> },
  ];
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(a) => a.id}
      loading={loading}
      error={error}
      onRetry={retry}
      onRowClick={(a) => navigate(`/admissions/${a.id}`)}
      rowLabel={(a) => `Open ${a.number}, ${a.childName}`}
      renderMobile={(a) => (
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-medium">{a.childName}</p>
            <AdmissionStatusBadge status={a.status} className="shrink-0" />
          </div>
          <p className="truncate text-[12.5px] text-muted-foreground">
            {a.classLevel?.name ?? 'Class not chosen'} · {a.parentName}
          </p>
          <p className="text-[12px] text-muted-foreground tabular">
            <span className="font-mono">{a.number}</span> · <KeyDate a={a} />
          </p>
        </div>
      )}
      empty={{ icon: ClipboardList, title: 'No applications match', description: 'Try another status or filter.' }}
    />
  );
}

