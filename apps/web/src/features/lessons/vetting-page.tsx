import {
  mondayOf,
  type ComplianceItemStatus,
  type ComplianceReport,
  type ComplianceTeacherRow,
  type LessonReviewStatus,
  type VettedLessonSummary,
} from '@aischool/shared';
import { CheckCheck, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, Download, Inbox, Users } from 'lucide-react';
import type * as React from 'react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDocumentTitle } from '@/lib/hooks';
import { formatDate, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useStructure } from '../academics/api';
import { ArmSelect, SubjectSelect } from '../planning/pickers';
import { useBulkApprove, useCompliance, useVettingQueue } from './api';
import { addDays } from './vetting-dialogs';
import { ReviewStatusBadge } from './vetting-ui';

type Tab = 'queue' | 'decided' | 'compliance';

export default function LessonVettingPage() {
  useDocumentTitle('Lesson vetting');
  const [params, setParams] = useSearchParams();
  const tab = (['queue', 'decided', 'compliance'].includes(params.get('tab') ?? '') ? params.get('tab') : 'queue') as Tab;
  const setTab = (t: string) => setParams((p) => {
    p.set('tab', t);
    return p;
  }, { replace: true });

  return (
    <Page>
      <PageHeader
        title="Lesson vetting"
        description="Vet teachers’ lesson notes before the week starts, and see who hasn’t submitted."
      />
      <Tabs value={tab} onValueChange={setTab} className="mb-5">
        <TabsList>
          <TabsTrigger value="queue">
            <Inbox /> To vet
          </TabsTrigger>
          <TabsTrigger value="decided">
            <ClipboardCheck /> Vetted
          </TabsTrigger>
          <TabsTrigger value="compliance">
            <Users /> Submission tracker
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === 'compliance' ? <Compliance /> : <Queue decided={tab === 'decided'} />}
    </Page>
  );
}

// ------------------------------------------------------------------ queue

function Queue({ decided }: { decided: boolean }) {
  const navigate = useNavigate();
  const structure = useStructure();
  const [subjectId, setSubjectId] = useState<string | undefined>();
  const [classArmId, setClassArmId] = useState<string | undefined>();
  const [teacherId, setTeacherId] = useState<string | undefined>();
  const [day, setDay] = useState('');
  const [decidedStatus, setDecidedStatus] = useState<LessonReviewStatus>('APPROVED');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const status: LessonReviewStatus = decided ? decidedStatus : 'SUBMITTED';
  const query = useVettingQueue({ status, subjectId, classArmId, weekStart: day ? mondayOf(day) : undefined });
  const bulk = useBulkApprove();

  const teachers = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of query.data ?? []) if (l.teacher) m.set(l.teacher.id, l.teacher.name);
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [query.data]);
  const rows = useMemo(() => (query.data ?? []).filter((l) => !teacherId || l.teacher?.id === teacherId), [query.data, teacherId]);
  const selectable = rows.filter((l) => l.canReview);
  const chosen = selectable.filter((l) => selected.has(l.id));
  const allChosen = selectable.length > 0 && chosen.length === selectable.length;

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const pick = (l: VettedLessonSummary) =>
    l.canReview ? (
      <Checkbox
        checked={selected.has(l.id)}
        onCheckedChange={(v) => toggle(l.id, v === true)}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select ${l.topic}`}
      />
    ) : null;

  const columns: Column<VettedLessonSummary>[] = [
    ...(!decided
      ? [
          {
            key: 'pick',
            header: (
              <Checkbox
                checked={allChosen ? true : chosen.length ? 'indeterminate' : false}
                onCheckedChange={(v) => setSelected(v === true ? new Set(selectable.map((l) => l.id)) : new Set())}
                aria-label="Select all"
                disabled={!selectable.length}
              />
            ),
            cell: pick,
            headClassName: 'w-10',
          } satisfies Column<VettedLessonSummary>,
        ]
      : []),
    {
      key: 'topic',
      header: 'Lesson',
      cell: (l) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{l.topic}</p>
          <p className="truncate text-[12px] text-muted-foreground">
            {l.subject.name} · {l.classArm.levelName} {l.classArm.name}
          </p>
        </div>
      ),
    },
    { key: 'teacher', header: 'Teacher', cell: (l) => l.teacher?.name ?? '—' },
    {
      key: 'week',
      header: 'Lesson date',
      cell: (l) => (l.date ? formatDate(l.date, { weekday: 'short' }) : l.weekStart ? `Week of ${formatDate(l.weekStart)}` : 'No date'),
    },
    {
      key: 'when',
      header: decided ? 'Vetted' : 'Submitted',
      cell: (l) => (
        <span className="text-[13px] text-muted-foreground" title={(decided ? l.reviewedAt : l.submittedAt) ?? undefined}>
          {formatRelative(decided ? l.reviewedAt : l.submittedAt)}
          {decided && l.reviewedBy && <span className="block text-[12px]">by {l.reviewedBy.name}</span>}
        </span>
      ),
    },
    { key: 'status', header: 'Status', cell: (l) => <ReviewStatusBadge status={l.reviewStatus} late={l.late} /> },
  ];

  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
        {decided && (
          <Select value={decidedStatus} onValueChange={(v) => setDecidedStatus(v as LessonReviewStatus)}>
            <SelectTrigger className="lg:w-36" aria-label="Decision">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="RETURNED">Returned</SelectItem>
            </SelectContent>
          </Select>
        )}
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <span className="shrink-0">Week of</span>
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="min-w-0 flex-1 lg:w-40" title="Any day in the week" />
        </label>
        <SubjectSelect structure={structure.data} value={subjectId} onChange={setSubjectId} allLabel="All subjects" className="lg:w-44" aria-label="Filter by subject" />
        <ArmSelect structure={structure.data} value={classArmId} onChange={setClassArmId} allLabel="All classes" className="lg:w-40" aria-label="Filter by class" />
        <Select value={teacherId ?? NONE} onValueChange={(v) => setTeacherId(v === NONE ? undefined : v)}>
          <SelectTrigger className="lg:w-44" aria-label="Filter by teacher">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All teachers</SelectItem>
            {teachers.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {day && (
          <Button variant="ghost" size="sm" onClick={() => setDay('')}>
            Any week
          </Button>
        )}
        {!decided && chosen.length > 0 && (
          <Button variant="brand" className="lg:ml-auto" onClick={() => setConfirmOpen(true)}>
            <CheckCheck /> Approve {chosen.length}
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={query.data ? rows : undefined}
          rowKey={(l) => l.id}
          loading={query.isLoading || query.isFetching}
          error={query.error}
          onRetry={() => void query.refetch()}
          onRowClick={(l) => navigate(`/lessons/${l.id}`)}
          rowLabel={(l) => `Open ${l.topic}`}
          mobileActions={decided ? undefined : pick}
          renderMobile={(l) => (
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate font-medium">{l.topic}</p>
                <ReviewStatusBadge status={l.reviewStatus} late={l.late} />
              </div>
              <p className="truncate text-[12.5px] text-muted-foreground">
                {l.teacher?.name ?? '—'} · {l.subject.name} · {l.classArm.levelName} {l.classArm.name}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {l.date ? formatDate(l.date, { weekday: 'short' }) : 'No date'} · {decided ? 'vetted' : 'submitted'} {formatRelative(decided ? l.reviewedAt : l.submittedAt)}
              </p>
            </div>
          )}
          empty={{
            icon: decided ? ClipboardCheck : Inbox,
            title: decided ? 'Nothing here yet' : 'Nothing waiting to be vetted',
            description: decided ? 'Lesson notes you and your colleagues vet appear here.' : 'When teachers submit lesson notes they appear here, oldest first.',
          }}
        />
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        destructive={false}
        title={`Approve ${chosen.length} lesson note${chosen.length === 1 ? '' : 's'}?`}
        description="Each teacher is notified that their lesson note was approved."
        confirmLabel="Approve"
        loading={bulk.isPending}
        onConfirm={() =>
          bulk.mutate(
            chosen.map((l) => l.id),
            {
              onSuccess: () => {
                setSelected(new Set());
                setConfirmOpen(false);
              },
            },
          )
        }
      />
    </>
  );
}

// ------------------------------------------------------------------ compliance

const ITEM: Record<ComplianceItemStatus, { label: string; variant: BadgeProps['variant'] }> = {
  MISSING: { label: 'Not written', variant: 'danger' },
  NOT_SUBMITTED: { label: 'Draft, not submitted', variant: 'warning' },
  SUBMITTED: { label: 'Awaiting vetting', variant: 'info' },
  APPROVED: { label: 'Approved', variant: 'success' },
  RETURNED: { label: 'Returned', variant: 'danger' },
};

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(r: ComplianceReport) {
  const lines = [
    ['Teacher', 'Class', 'Subject', 'Periods', 'Status', 'Submitted at', 'Late'].join(','),
    ...r.teachers.flatMap((t) =>
      t.items.map((i) =>
        [t.teacher.name, i.classArm.name, i.subject.name, i.periods, ITEM[i.status].label, i.submittedAt ?? '', i.late ? 'Yes' : 'No'].map(csvCell).join(','),
      ),
    ),
  ];
  const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lesson-notes-${r.weekStart}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Compliance() {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const query = useCompliance(weekStart);
  const r = query.data;
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const started = new Date(`${weekStart}T00:00:00Z`).getTime() <= Date.now();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            <ChevronLeft />
          </Button>
          <Input
            type="date"
            value={weekStart}
            onChange={(e) => e.target.value && setWeekStart(mondayOf(e.target.value))}
            className="w-40"
            aria-label="Week starting"
          />
          <Button variant="outline" size="icon" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            <ChevronRight />
          </Button>
        </div>
        <span className="text-[13px] text-muted-foreground">
          {formatDate(weekStart)} – {formatDate(addDays(weekStart, 6))}
          {r?.termName ? ` · ${r.termName}` : ''}
        </span>
        <Button variant="outline" className="sm:ml-auto" disabled={!r?.teachers.length} onClick={() => r && downloadCsv(r)}>
          <Download /> Export CSV
        </Button>
      </div>

      {query.isLoading ? (
        <Card className="space-y-3 p-5">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-48 w-full" />
        </Card>
      ) : !r ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Tile label="Expected" value={r.totals.expected} />
            <Tile label="Handed in" value={r.totals.submitted} sub={r.totals.expected ? `${Math.round((r.totals.submitted / r.totals.expected) * 100)}%` : undefined} />
            <Tile label="Approved" value={r.totals.approved} tone="success" />
            <Tile label="Awaiting vetting" value={r.totals.pending} tone="info" />
            <Tile label="Returned" value={r.totals.returned} tone={r.totals.returned ? 'danger' : undefined} />
            <Tile label={started ? 'Missing' : 'Not yet in'} value={r.totals.missing} tone={r.totals.missing && started ? 'danger' : r.totals.missing ? 'warning' : undefined} />
          </div>
          <p className="text-[12.5px] text-muted-foreground">
            One lesson note is expected per class and subject each week,{' '}
            {r.basis === 'TIMETABLE' ? 'taken from the published timetable' : 'taken from the class subject teachers set in Academic Setup (no published timetable for this week)'}.
            {r.totals.late > 0 && ` ${r.totals.late} were submitted after the week had started.`}
          </p>

          {r.teachers.length === 0 ? (
            <Card>
              <EmptyState
                icon={Users}
                title="No teaching assignments for this week"
                description="Assign subject teachers to classes in Academic Setup, or publish a timetable, to track lesson note submissions."
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Teacher</TableHead>
                      <TableHead className="text-right">Expected</TableHead>
                      <TableHead className="text-right">Handed in</TableHead>
                      <TableHead className="text-right">Approved</TableHead>
                      <TableHead className="text-right">Awaiting</TableHead>
                      <TableHead className="text-right">Returned</TableHead>
                      <TableHead className="text-right">Missing</TableHead>
                      <TableHead className="text-right">Late</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.teachers.map((t) => (
                      <TeacherTableRows key={t.teacher.id} t={t} open={open.has(t.teacher.id)} onToggle={() => toggle(t.teacher.id)} />
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ul className="divide-y divide-border md:hidden">
                {r.teachers.map((t) => (
                  <li key={t.teacher.id}>
                    <button type="button" className="w-full px-4 py-3 text-left" onClick={() => toggle(t.teacher.id)} aria-expanded={open.has(t.teacher.id)}>
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-medium">{t.teacher.name}</span>
                        <span className="tabular text-[13px]">
                          {t.submitted}/{t.expected}
                        </span>
                        <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open.has(t.teacher.id) && 'rotate-180')} />
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {t.approved > 0 && <Badge variant="success">{t.approved} approved</Badge>}
                        {t.pending > 0 && <Badge variant="info">{t.pending} awaiting</Badge>}
                        {t.returned > 0 && <Badge variant="danger">{t.returned} returned</Badge>}
                        {t.missing > 0 && <Badge variant="danger">{t.missing} missing</Badge>}
                        {t.late > 0 && <Badge variant="warning">{t.late} late</Badge>}
                      </div>
                    </button>
                    {open.has(t.teacher.id) && (
                      <div className="px-4 pb-3">
                        <Items t={t} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Num({ n, tone }: { n: number; tone?: 'danger' | 'warning' | 'success' }) {
  return (
    <span className={cn('tabular', n === 0 ? 'text-muted-foreground' : tone === 'danger' ? 'font-semibold text-danger' : tone === 'warning' ? 'font-semibold text-warning' : tone === 'success' ? 'text-success' : '')}>
      {n}
    </span>
  );
}

function TeacherTableRows({ t, open, onToggle }: { t: ComplianceTeacherRow; open: boolean; onToggle: () => void }) {
  return (
    <>
      <TableRow data-clickable tabIndex={0} onClick={onToggle} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onToggle())} aria-expanded={open}>
        <TableCell>
          <span className="inline-flex items-center gap-2 font-medium">
            <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
            {t.teacher.name}
          </span>
        </TableCell>
        <TableCell className="text-right">
          <Num n={t.expected} />
        </TableCell>
        <TableCell className="text-right">
          <Num n={t.submitted} />
        </TableCell>
        <TableCell className="text-right">
          <Num n={t.approved} tone="success" />
        </TableCell>
        <TableCell className="text-right">
          <Num n={t.pending} />
        </TableCell>
        <TableCell className="text-right">
          <Num n={t.returned} tone="danger" />
        </TableCell>
        <TableCell className="text-right">
          <Num n={t.missing} tone="danger" />
        </TableCell>
        <TableCell className="text-right">
          <Num n={t.late} tone="warning" />
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={8} className="bg-muted/30">
            <Items t={t} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function Items({ t }: { t: ComplianceTeacherRow }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {t.items.map((i) => {
        const body = (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">
                {i.classArm.name} · {i.subject.name}
              </span>
              <span className="block text-[11.5px] text-muted-foreground">
                {i.periods ? `${i.periods} period${i.periods === 1 ? '' : 's'} a week` : 'Periods not set'}
                {i.submittedAt ? ` · submitted ${formatDate(i.submittedAt)}` : ''}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <Badge variant={ITEM[i.status].variant}>{ITEM[i.status].label}</Badge>
              {i.late && <Badge variant="warning">Late</Badge>}
            </span>
          </>
        );
        return (
          <li key={`${i.classArm.id}-${i.subject.id}`}>
            {i.lessonIds.length ? (
              <Link to={`/lessons/${i.lessonIds[0]}`} className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2 hover:border-border-strong">
                {body}
              </Link>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-dashed border-border bg-card px-3 py-2">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: 'success' | 'info' | 'danger' | 'warning' }): React.ReactElement {
  return (
    <Card className="p-4">
      <p className="text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 font-display text-2xl font-semibold tabular',
          tone === 'success' && 'text-success',
          tone === 'info' && 'text-info',
          tone === 'danger' && 'text-danger',
          tone === 'warning' && 'text-warning',
        )}
      >
        {value}
        {sub && <span className="ml-1.5 text-[13px] font-medium text-muted-foreground">{sub}</span>}
      </p>
    </Card>
  );
}
