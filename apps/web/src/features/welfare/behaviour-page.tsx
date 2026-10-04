import { BEHAVIOUR_CATEGORIES, type BehaviourKind, type BehaviourRow } from '@aischool/shared';
import { Award, ChartColumn, ClipboardList, Flag, Plus, ScrollText, ThumbsDown, ThumbsUp, TriangleAlert, Users } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type Column, DataTable, Pagination } from '@/components/ui/data-table';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCan } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { cn, initialsFromName } from '@/lib/utils';
import { StatTile } from '../attendance/ui';
import { useClassOptions } from '../attendance/classes';
import { addDaysIso, schoolToday } from '../finance/ui';
import { Segmented } from '../operations/ui';
import { useBehaviour, useBehaviourDashboard, useClassBehaviour } from './api';
import { BehaviourDialog, type BehaviourPrefill } from './behaviour-dialog';
import { BehaviourActions, BehaviourItem } from './behaviour-item';
import { StudentBehaviourSheet } from './student-behaviour-sheet';
import { KindBadge, Points } from './ui';

type Tab = 'log' | 'classes' | 'dashboard';
const TABS: Tab[] = ['log', 'classes', 'dashboard'];

export default function BehaviourPage() {
  const canManage = useCan('behaviour.manage');
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'log';
  const studentId = params.get('student');
  const [prefill, setPrefill] = useState<BehaviourPrefill | null>(null);

  const patch = (next: Record<string, string | undefined>) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(next)) {
          if (v) p.set(k, v);
          else p.delete(k);
        }
        return p;
      },
      { replace: true },
    );
  const openStudent = (id: string) => patch({ student: id });

  return (
    <Page>
      <PageHeader
        title="Behaviour"
        description="Merits, demerits and incidents across the school — with each student’s balance this term."
        actions={
          canManage && (
            <>
              <Button variant="outline" onClick={() => setPrefill({ kind: 'INCIDENT' })}>
                <TriangleAlert /> Log incident
              </Button>
              <Button onClick={() => setPrefill({ kind: 'MERIT' })}>
                <Plus /> Record behaviour
              </Button>
            </>
          )
        }
      />
      <Tabs value={tab} onValueChange={(t) => patch({ tab: t === 'log' ? undefined : t })}>
        <TabsList aria-label="Behaviour sections">
          <TabsTrigger value="log">
            <ScrollText /> Log
          </TabsTrigger>
          <TabsTrigger value="classes">
            <Users /> Classes
          </TabsTrigger>
          <TabsTrigger value="dashboard">
            <ChartColumn /> Dashboard
          </TabsTrigger>
        </TabsList>
        <TabsContent value="log">
          <LogTab onStudent={openStudent} />
        </TabsContent>
        <TabsContent value="classes">
          <ClassesTab onStudent={openStudent} />
        </TabsContent>
        <TabsContent value="dashboard">
          <DashboardTab onStudent={openStudent} />
        </TabsContent>
      </Tabs>
      <BehaviourDialog open={!!prefill} onOpenChange={(o) => !o && setPrefill(null)} prefill={prefill} />
      <StudentBehaviourSheet id={studentId} onClose={() => patch({ student: undefined })} />
    </Page>
  );
}

// ------------------------------------------------------------------ log

function ClassSelect({ value, onChange, allLabel = 'All classes', className }: { value?: string; onChange: (v: string | undefined) => void; allLabel?: string | null; className?: string }) {
  const { options } = useClassOptions();
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? undefined : v)}>
      <SelectTrigger aria-label="Class" className={cn('sm:w-48', className)}>
        <SelectValue placeholder="Choose a class" />
      </SelectTrigger>
      <SelectContent>
        {allLabel !== null && <SelectItem value={NONE}>{allLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LogTab({ onStudent }: { onStudent: (id: string) => void }) {
  const canManage = useCan('behaviour.manage');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const [kind, setKind] = useState<'ALL' | BehaviourKind>('ALL');
  const [classArmId, setClassArmId] = useState<string | undefined>();
  const [category, setCategory] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const list = useBehaviour({
    q: q || undefined,
    page,
    pageSize,
    kind: kind === 'ALL' ? undefined : kind,
    classArmId,
    category,
    status,
    from: from || undefined,
    to: to || undefined,
    mine: mine ? 'true' : undefined,
  });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  const columns: Column<BehaviourRow>[] = [
    { key: 'date', header: 'Date', cell: (r) => <span className="whitespace-nowrap tabular text-muted-foreground">{formatDate(r.date, { day: 'numeric', month: 'short' })}</span>, className: 'w-24' },
    {
      key: 'student',
      header: 'Student',
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.student.name}</p>
          <p className="truncate text-[12px] text-muted-foreground">{r.student.className ?? 'No class'}</p>
        </div>
      ),
    },
    { key: 'kind', header: 'Kind', cell: (r) => <KindBadge kind={r.kind} /> },
    {
      key: 'what',
      header: 'What happened',
      cell: (r) => (
        <div className="min-w-0 max-w-md">
          <p className="truncate">{r.title}</p>
          <p className="truncate text-[12px] text-muted-foreground">
            {BEHAVIOUR_CATEGORIES.find((c) => c.key === r.category)?.label ?? r.category}
            {r.actionTaken && ` · ${r.actionTaken}`}
          </p>
        </div>
      ),
    },
    { key: 'points', header: 'Points', cell: (r) => <Points value={r.points} />, className: 'text-right', headClassName: 'text-right' },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (r.kind === 'MERIT' ? <span className="text-muted-foreground">—</span> : <span className={r.status === 'OPEN' ? 'font-medium text-warning' : 'text-muted-foreground'}>{r.status === 'OPEN' ? 'Open' : 'Resolved'}</span>),
    },
    { key: 'by', header: 'Recorded by', cell: (r) => <span className="text-[12.5px] text-muted-foreground">{r.reportedBy?.name ?? '—'}</span> },
    { key: 'actions', header: <span className="sr-only">Actions</span>, cell: (r) => <BehaviourActions r={r} />, className: 'w-10' },
  ];

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchInput value={search} onChange={reset(setSearch)} placeholder="Search student or title…" className="sm:w-64" label="Search behaviour" />
          <Segmented<'ALL' | BehaviourKind>
            label="Kind"
            value={kind}
            onChange={reset(setKind)}
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'MERIT', label: 'Merits' },
              { value: 'DEMERIT', label: 'Demerits' },
              { value: 'INCIDENT', label: 'Incidents' },
            ]}
          />
          {canManage && (
            <Segmented<'all' | 'mine'> label="Whose records" value={mine ? 'mine' : 'all'} onChange={(v) => reset(setMine)(v === 'mine')} options={[{ value: 'all', label: 'Everyone' }, { value: 'mine', label: 'Mine' }]} />
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <ClassSelect value={classArmId} onChange={reset(setClassArmId)} className="col-span-2 sm:col-span-1" />
          <Select value={category ?? NONE} onValueChange={(v) => reset(setCategory)(v === NONE ? undefined : v)}>
            <SelectTrigger aria-label="Category" className="col-span-2 sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All categories</SelectItem>
              {BEHAVIOUR_CATEGORIES.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status ?? NONE} onValueChange={(v) => reset(setStatus)(v === NONE ? undefined : v)}>
            <SelectTrigger aria-label="Status" className="col-span-2 sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Any status</SelectItem>
              <SelectItem value="OPEN">Open</SelectItem>
              <SelectItem value="RESOLVED">Resolved</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" aria-label="From" value={from} onChange={(e) => reset(setFrom)(e.target.value)} className="tabular sm:w-40 [color-scheme:light] dark:[color-scheme:dark]" />
          <Input type="date" aria-label="To" value={to} onChange={(e) => reset(setTo)(e.target.value)} className="tabular sm:w-40 [color-scheme:light] dark:[color-scheme:dark]" />
        </div>
      </div>
      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={list.data?.items}
          rowKey={(r) => r.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => void list.refetch()}
          onRowClick={(r) => onStudent(r.student.id)}
          rowLabel={(r) => `${r.student.name}: ${r.title}`}
          renderMobile={(r) => (
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <KindBadge kind={r.kind} />
                <Points value={r.points} className="text-[13px]" />
                <span className="ml-auto text-[12px] text-muted-foreground">{formatDate(r.date, { day: 'numeric', month: 'short' })}</span>
              </div>
              <p className="truncate text-[13.5px] font-medium">{r.student.name}</p>
              <p className="truncate text-[12.5px] text-muted-foreground">{r.title}</p>
            </div>
          )}
          mobileActions={(r) => <BehaviourActions r={r} />}
          empty={{ icon: ScrollText, title: 'No behaviour records', description: 'Merits, demerits and incidents you and colleagues record will appear here.' }}
        />
      </Card>
      {list.data && list.data.total > pageSize && <Pagination page={page} pageSize={pageSize} total={list.data.total} onPageChange={setPage} noun="records" />}
    </div>
  );
}

// ------------------------------------------------------------------ classes

function ClassesTab({ onStudent }: { onStudent: (id: string) => void }) {
  const { options, mine } = useClassOptions();
  const [picked, setPicked] = useState<string | undefined>();
  const classArmId = picked ?? mine ?? options[0]?.id;
  const q = useClassBehaviour(classArmId);
  const d = q.data;
  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <ClassSelect value={classArmId} onChange={setPicked} allLabel={null} className="sm:w-60" />
        {d?.term && (
          <p className="text-[12.5px] text-muted-foreground">
            {d.term.name} · {d.term.sessionName}
          </p>
        )}
      </div>
      {!classArmId ? (
        <Card>
          <EmptyState icon={Users} title="No classes yet" description="Set up classes in Academic Setup to see class behaviour." />
        </Card>
      ) : q.error && !d ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <Skeleton className="h-80 rounded-2xl" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Net points" icon={<Award />} value={<Points value={d.totals.points} />} />
            <StatTile label="Merits" icon={<ThumbsUp />} value={d.totals.merits} tone="success" />
            <StatTile label="Demerits" icon={<ThumbsDown />} value={d.totals.demerits} tone={d.totals.demerits ? 'warning' : 'muted'} />
            <StatTile label="Incidents" icon={<TriangleAlert />} value={d.totals.incidents} sub={d.totals.open ? `${d.totals.open} still open` : undefined} tone={d.totals.incidents ? 'danger' : 'muted'} />
          </div>
          <Card className="overflow-hidden">
            <DataTable
              columns={[
                {
                  key: 'name',
                  header: 'Student',
                  cell: (r) => (
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={r.student.name} initials={initialsFromName(r.student.name)} size="sm" />
                      <span className="truncate font-medium">{r.student.name}</span>
                    </div>
                  ),
                },
                { key: 'm', header: 'Merits', cell: (r) => <span className="tabular">{r.merits}</span>, className: 'text-right', headClassName: 'text-right' },
                { key: 'd', header: 'Demerits', cell: (r) => <span className="tabular">{r.demerits}</span>, className: 'text-right', headClassName: 'text-right' },
                {
                  key: 'i',
                  header: 'Incidents',
                  cell: (r) => (
                    <span className={cn('tabular', r.open && 'font-medium text-warning')}>
                      {r.incidents}
                      {r.open ? ` (${r.open} open)` : ''}
                    </span>
                  ),
                  className: 'text-right',
                  headClassName: 'text-right',
                },
                { key: 'p', header: 'Points', cell: (r) => <Points value={r.points} />, className: 'text-right', headClassName: 'text-right' },
                { key: 'last', header: 'Last record', cell: (r) => <span className="text-muted-foreground">{r.lastDate ? formatDate(r.lastDate, { day: 'numeric', month: 'short' }) : '—'}</span> },
              ]}
              rows={d.students}
              rowKey={(r) => r.student.id}
              onRowClick={(r) => onStudent(r.student.id)}
              rowLabel={(r) => r.student.name}
              renderMobile={(r) => (
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={r.student.name} initials={initialsFromName(r.student.name)} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{r.student.name}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {r.merits} merits · {r.demerits} demerits · {r.incidents} incidents
                    </p>
                  </div>
                  <Points value={r.points} className="text-[15px]" />
                </div>
              )}
              empty={{ icon: Users, title: 'No students in this class' }}
            />
          </Card>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ dashboard

type Range = 'term' | '30' | '7';

function DashboardTab({ onStudent }: { onStudent: (id: string) => void }) {
  const [range, setRange] = useState<Range>('term');
  const [classArmId, setClassArmId] = useState<string | undefined>();
  const today = schoolToday();
  const q = useBehaviourDashboard({ from: range === 'term' ? undefined : addDaysIso(today, -(Number(range) - 1)), to: range === 'term' ? undefined : today, classArmId });
  const d = q.data;
  const maxCat = Math.max(1, ...(d?.byCategory ?? []).map((c) => c.merits + c.demerits + c.incidents));
  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Segmented<Range>
          label="Period"
          value={range}
          onChange={setRange}
          options={[
            { value: 'term', label: 'This term' },
            { value: '30', label: 'Last 30 days' },
            { value: '7', label: 'Last 7 days' },
          ]}
        />
        <ClassSelect value={classArmId} onChange={setClassArmId} />
        {d && (
          <p className="text-[12.5px] text-muted-foreground sm:ml-auto">
            {formatDate(d.from, { day: 'numeric', month: 'short' })} – {formatDate(d.to)}
          </p>
        )}
      </div>
      {q.error && !d ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <div className="grid gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Merits" icon={<ThumbsUp />} value={d.totals.merits} tone="success" />
            <StatTile label="Demerits" icon={<ThumbsDown />} value={d.totals.demerits} tone={d.totals.demerits ? 'warning' : 'muted'} />
            <StatTile label="Incidents" icon={<TriangleAlert />} value={d.totals.incidents} tone={d.totals.incidents ? 'danger' : 'muted'} />
            <StatTile label="Open incidents" icon={<Flag />} value={d.openIncidents.length} tone={d.openIncidents.length ? 'warning' : 'muted'} sub="Needing follow-up" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <Card>
              <CardHeader>
                <CardTitle>By category</CardTitle>
                <CardDescription>What is being recognised, and what needs attention.</CardDescription>
              </CardHeader>
              <CardContent>
                {d.byCategory.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">Nothing recorded in this period.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {d.byCategory.map((c) => {
                      const total = c.merits + c.demerits + c.incidents;
                      return (
                        <li key={c.category}>
                          <div className="mb-1 flex items-center justify-between text-[13px]">
                            <span className="truncate">{c.label}</span>
                            <span className="tabular text-muted-foreground">{total}</span>
                          </div>
                          <div className="flex h-2 overflow-hidden rounded-full bg-muted" style={{ width: `${Math.max(6, (total / maxCat) * 100)}%` }} aria-hidden>
                            {c.merits > 0 && <span className="bg-success" style={{ flex: c.merits }} />}
                            {c.demerits > 0 && <span className="bg-warning" style={{ flex: c.demerits }} />}
                            {c.incidents > 0 && <span className="bg-danger" style={{ flex: c.incidents }} />}
                          </div>
                          <span className="sr-only">
                            {c.merits} merits, {c.demerits} demerits, {c.incidents} incidents
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="mt-4 flex flex-wrap gap-3 text-[11.5px] text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-success" /> Merits</span>
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-warning" /> Demerits</span>
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-danger" /> Incidents</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Open incidents</CardTitle>
                <CardDescription>Most serious first.</CardDescription>
              </CardHeader>
              <CardContent>
                {d.openIncidents.length === 0 ? (
                  <EmptyState compact icon={ClipboardList} title="Nothing open" description="Every demerit and incident has been resolved." />
                ) : (
                  <ul className="-my-3 divide-y divide-border">
                    {d.openIncidents.map((r) => (
                      <BehaviourItem key={r.id} r={r} showStudent onStudent={onStudent} />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <StudentList title="Top merits" description="Highest balance in this period." rows={d.topStudents.map((s) => ({ ...s, sub: `${s.merits} merit${s.merits === 1 ? '' : 's'}` }))} onStudent={onStudent} empty="No merits in this period yet." />
            <StudentList
              title="Students to support"
              description="Lowest balance or involved in incidents — worth a conversation."
              rows={d.concerns.map((s) => ({ ...s, sub: `${s.demerits} demerit${s.demerits === 1 ? '' : 's'} · ${s.incidents} incident${s.incidents === 1 ? '' : 's'}` }))}
              onStudent={onStudent}
              empty="No concerns in this period."
            />
          </div>
          {d.byClass.length > 1 && (
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>By class</CardTitle>
              </CardHeader>
              <DataTable
                columns={[
                  { key: 'c', header: 'Class', cell: (r) => <span className="font-medium">{r.className}</span> },
                  { key: 'm', header: 'Merits', cell: (r) => <span className="tabular">{r.merits}</span>, className: 'text-right', headClassName: 'text-right' },
                  { key: 'd', header: 'Demerits', cell: (r) => <span className="tabular">{r.demerits}</span>, className: 'text-right', headClassName: 'text-right' },
                  { key: 'i', header: 'Incidents', cell: (r) => <span className="tabular">{r.incidents}</span>, className: 'text-right', headClassName: 'text-right' },
                  { key: 'p', header: 'Net points', cell: (r) => <Points value={r.points} />, className: 'text-right', headClassName: 'text-right' },
                ]}
                rows={d.byClass}
                rowKey={(r) => r.classArmId}
                onRowClick={(r) => setClassArmId(r.classArmId)}
                rowLabel={(r) => r.className}
                renderMobile={(r) => (
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[13.5px] font-medium">{r.className}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {r.merits} merits · {r.demerits} demerits · {r.incidents} incidents
                      </p>
                    </div>
                    <Points value={r.points} />
                  </div>
                )}
                empty={{ icon: Users, title: 'No records' }}
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function StudentList({
  title,
  description,
  rows,
  onStudent,
  empty,
}: {
  title: string;
  description: string;
  rows: { student: { id: string; name: string; className: string | null }; points: number; sub: string }[];
  onStudent: (id: string) => void;
  empty: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{empty}</p>
        ) : (
          <ul className="-mx-2 space-y-0.5">
            {rows.map((r) => (
              <li key={r.student.id}>
                <button type="button" onClick={() => onStudent(r.student.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar name={r.student.name} initials={initialsFromName(r.student.name)} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{r.student.name}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {r.student.className ?? 'No class'} · {r.sub}
                    </span>
                  </span>
                  <Points value={r.points} className="text-[15px]" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
