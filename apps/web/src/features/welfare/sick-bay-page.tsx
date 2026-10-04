import { SICK_BAY_OUTCOME_LABELS, SICK_BAY_OUTCOMES, SICK_BAY_SERIOUS, type MedicalAlertRow, type SickBayRow } from '@aischool/shared';
import { Activity, BellRing, CalendarDays, Clock, Eye, HeartPulse, History, Home, MoreHorizontal, Pencil, Plus, Send, ShieldAlert, Stethoscope, Thermometer, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { type Column, DataTable, Pagination } from '@/components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCan } from '@/lib/auth-store';
import { useDebounced } from '@/lib/hooks';
import { cn, initialsFromName } from '@/lib/utils';
import { StatTile } from '../attendance/ui';
import { useClassOptions } from '../attendance/classes';
import { schoolDate, schoolDateTime, schoolToday } from '../finance/ui';
import { useDeleteVisit, useMedical, useMedicalAlerts, useNotifyVisit, useSickBaySummary, useUpdateVisit, useVisits } from './api';
import { MedicalDialog } from './medical-panel';
import { NotifyDialog } from './notify-dialog';
import { MedicalAlertBanner, OutcomeBadge, type PickedStudent, schoolTime } from './ui';
import { VisitDialog } from './visit-dialog';

type Tab = 'today' | 'history' | 'alerts';
const TABS: Tab[] = ['today', 'history', 'alerts'];

export default function SickBayPage() {
  const canManage = useCan('health.manage');
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'today';
  const [recording, setRecording] = useState<{ student: PickedStudent | null } | null>(null);
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

  return (
    <Page>
      <PageHeader
        title="Sick bay"
        description="Every visit to the school clinic, with each student’s allergies and conditions to hand."
        actions={
          canManage && (
            <Button onClick={() => setRecording({ student: null })}>
              <Plus /> Record visit
            </Button>
          )
        }
      />
      <Tabs value={tab} onValueChange={(t) => patch({ tab: t === 'today' ? undefined : t, student: undefined })}>
        <TabsList aria-label="Sick bay sections">
          <TabsTrigger value="today">
            <Stethoscope /> Today
          </TabsTrigger>
          <TabsTrigger value="history">
            <History /> History
          </TabsTrigger>
          <TabsTrigger value="alerts">
            <ShieldAlert /> Medical alerts
          </TabsTrigger>
        </TabsList>
        <TabsContent value="today">
          <TodayTab />
        </TabsContent>
        <TabsContent value="history">
          <HistoryTab studentId={params.get('student') ?? undefined} onClearStudent={() => patch({ student: undefined })} />
        </TabsContent>
        <TabsContent value="alerts">
          <AlertsTab onRecord={canManage ? (s) => setRecording({ student: s }) : undefined} />
        </TabsContent>
      </Tabs>
      <VisitDialog open={!!recording} onOpenChange={(o) => !o && setRecording(null)} student={recording?.student} />
    </Page>
  );
}

// ------------------------------------------------------------------ visit actions & card

function VisitActions({ v }: { v: SickBayRow }) {
  const canManage = useCan('health.manage');
  const [editing, setEditing] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const update = useUpdateVisit();
  const notify = useNotifyVisit();
  const del = useDeleteVisit();
  if (!canManage) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${v.student.name}’s visit`} onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil /> Update
          </DropdownMenuItem>
          {v.outcome === 'OBSERVATION' && (
            <>
              <DropdownMenuItem onSelect={() => update.mutate({ id: v.id, outcome: 'RETURNED_TO_CLASS' })}>
                <Activity /> Returned to class
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => update.mutate({ id: v.id, outcome: 'SENT_HOME' })}>
                <Home /> Sent home
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem onSelect={() => setNotifying(true)}>
            <Send /> {v.parentNotifiedAt ? 'Notify parents again' : 'Notify parents'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDeleting(true)} className="text-danger focus:text-danger">
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <VisitDialog open={editing} onOpenChange={setEditing} visit={v} />
      <NotifyDialog
        open={notifying}
        onOpenChange={setNotifying}
        title={`Notify ${v.student.name.split(' ')[0]}’s parents`}
        description={`About the visit at ${schoolDateTime(v.visitedAt)} (${SICK_BAY_OUTCOME_LABELS[v.outcome].toLowerCase()}).`}
        pending={notify.isPending}
        onSend={(input) => notify.mutate({ id: v.id, ...input }, { onSuccess: () => setNotifying(false) })}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this visit?"
        description={`${v.student.name}’s visit (${v.complaint}) will be removed from their record and the family portal.`}
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() => del.mutate(v.id, { onSuccess: () => setDeleting(false) })}
      />
    </>
  );
}

function VisitCard({ v }: { v: SickBayRow }) {
  const serious = SICK_BAY_SERIOUS.includes(v.outcome);
  return (
    <li className={cn('flex gap-3 rounded-2xl border bg-card p-3.5 sm:p-4', serious ? 'border-warning/40' : 'border-border')}>
      <div className="w-14 shrink-0 pt-0.5 text-center">
        <p className="font-display text-[15px] font-semibold tabular">{schoolTime(v.visitedAt)}</p>
        {v.temperature != null && (
          <p className={cn('mt-1 inline-flex items-center gap-0.5 text-[12px] tabular', v.temperature >= 37.5 ? 'font-medium text-danger' : 'text-muted-foreground')}>
            <Thermometer className="size-3" />
            {v.temperature.toFixed(1)}°
          </p>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[14px] font-semibold">{v.student.name}</p>
          <span className="text-[12px] text-muted-foreground">{v.student.className ?? 'No class'}</span>
        </div>
        <p className="mt-0.5 text-[13.5px]">{v.complaint}</p>
        {(v.treatment || v.medication) && (
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {[v.treatment, v.medication && `Medication: ${v.medication}`].filter(Boolean).join(' · ')}
          </p>
        )}
        {v.followUp && <p className="mt-0.5 text-[12.5px]">Follow-up: {v.followUp}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <OutcomeBadge outcome={v.outcome} />
          {v.parentNotifiedAt ? (
            <Badge variant="info">
              <BellRing /> Parents notified
            </Badge>
          ) : serious ? (
            <Badge variant="warning">Parents not yet notified</Badge>
          ) : null}
          {v.recordedBy && <span className="text-[11.5px] text-muted-foreground">by {v.recordedBy.name}</span>}
        </div>
      </div>
      <VisitActions v={v} />
    </li>
  );
}

// ------------------------------------------------------------------ today

function TodayTab() {
  const today = schoolToday();
  const summary = useSickBaySummary();
  const visits = useVisits({ from: today, to: today, page: 1, pageSize: 100 });
  const s = summary.data;
  const home = s ? s.todayByOutcome.SENT_HOME + s.todayByOutcome.REFERRED + s.todayByOutcome.HOSPITAL : 0;
  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Visits today" icon={<Stethoscope />} value={s?.today ?? '—'} loading={!s} />
        <StatTile label="Under observation" icon={<Eye />} value={s?.underObservation ?? '—'} tone={s?.underObservation ? 'warning' : 'muted'} loading={!s} />
        <StatTile label="Sent home or referred" icon={<Home />} value={s ? home : '—'} tone={home ? 'danger' : 'muted'} sub="Today" loading={!s} />
        <StatTile label="Last 7 days" icon={<CalendarDays />} value={s?.last7Days ?? '—'} loading={!s} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="lg:col-span-2">
          {visits.error && !visits.data ? (
            <ErrorState error={visits.error} onRetry={() => void visits.refetch()} />
          ) : !visits.data ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-28 rounded-2xl" />
              ))}
            </div>
          ) : visits.data.items.length === 0 ? (
            <Card>
              <EmptyState icon={HeartPulse} title="No visits today" description="Visits recorded today will show here, with anyone still under observation." />
            </Card>
          ) : (
            <ul className="space-y-3">
              {visits.data.items.map((v) => (
                <VisitCard key={v.id} v={v} />
              ))}
            </ul>
          )}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Frequent visitors</CardTitle>
            <CardDescription>Three or more visits in 30 days — worth a call home.</CardDescription>
          </CardHeader>
          <CardContent>
            {!s ? (
              <Skeleton className="h-24" />
            ) : s.frequent.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No one at the moment.</p>
            ) : (
              <ul className="space-y-2">
                {s.frequent.map((f) => (
                  <li key={f.student.id} className="flex items-center gap-2.5">
                    <Avatar name={f.student.name} initials={initialsFromName(f.student.name)} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{f.student.name}</span>
                      <span className="block text-[12px] text-muted-foreground">{f.student.className ?? 'No class'}</span>
                    </span>
                    <Badge variant="warning">{f.visits} visits</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ history

function HistoryTab({ studentId, onClearStudent }: { studentId?: string; onClearStudent: () => void }) {
  const { options } = useClassOptions();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const [outcome, setOutcome] = useState<string | undefined>();
  const [classArmId, setClassArmId] = useState<string | undefined>();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const list = useVisits({ q: q || undefined, outcome, classArmId, studentId, from: from || undefined, to: to || undefined, page, pageSize });
  const medical = useMedical(studentId ?? null);
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };
  const columns: Column<SickBayRow>[] = [
    {
      key: 'when',
      header: 'When',
      cell: (v) => (
        <div className="tabular">
          <p>{schoolDate(v.visitedAt)}</p>
          <p className="text-[12px] text-muted-foreground">{schoolTime(v.visitedAt)}</p>
        </div>
      ),
      className: 'w-32',
    },
    {
      key: 'student',
      header: 'Student',
      cell: (v) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{v.student.name}</p>
          <p className="truncate text-[12px] text-muted-foreground">{v.student.className ?? 'No class'}</p>
        </div>
      ),
    },
    {
      key: 'complaint',
      header: 'Complaint & care',
      cell: (v) => (
        <div className="min-w-0 max-w-md">
          <p className="truncate">
            {v.complaint}
            {v.temperature != null && <span className={cn('ml-1.5 tabular', v.temperature >= 37.5 ? 'text-danger' : 'text-muted-foreground')}>{v.temperature.toFixed(1)}°C</span>}
          </p>
          <p className="truncate text-[12px] text-muted-foreground">{[v.treatment, v.medication].filter(Boolean).join(' · ') || '—'}</p>
        </div>
      ),
    },
    { key: 'outcome', header: 'Outcome', cell: (v) => <OutcomeBadge outcome={v.outcome} /> },
    { key: 'parents', header: 'Parents', cell: (v) => (v.parentNotifiedAt ? <span className="text-[12.5px] text-info">Notified</span> : <span className="text-muted-foreground">—</span>) },
    { key: 'actions', header: <span className="sr-only">Actions</span>, cell: (v) => <VisitActions v={v} />, className: 'w-10' },
  ];
  return (
    <div className="mt-4 space-y-4">
      {studentId && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-[13.5px] font-semibold">{medical.data?.student.name ?? 'Student'} — visit history</p>
            <Button variant="ghost" size="sm" onClick={onClearStudent}>
              Show everyone
            </Button>
          </div>
          {medical.data && <MedicalAlertBanner profile={medical.data} />}
        </Card>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {!studentId && <SearchInput value={search} onChange={reset(setSearch)} placeholder="Search student or complaint…" className="sm:w-64" label="Search visits" />}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Select value={outcome ?? NONE} onValueChange={(v) => reset(setOutcome)(v === NONE ? undefined : v)}>
            <SelectTrigger aria-label="Outcome" className="col-span-2 sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Any outcome</SelectItem>
              {SICK_BAY_OUTCOMES.map((o) => (
                <SelectItem key={o} value={o}>
                  {SICK_BAY_OUTCOME_LABELS[o]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!studentId && (
            <Select value={classArmId ?? NONE} onValueChange={(v) => reset(setClassArmId)(v === NONE ? undefined : v)}>
              <SelectTrigger aria-label="Class" className="col-span-2 sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>All classes</SelectItem>
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input type="date" aria-label="From" value={from} onChange={(e) => reset(setFrom)(e.target.value)} className="tabular sm:w-40 [color-scheme:light] dark:[color-scheme:dark]" />
          <Input type="date" aria-label="To" value={to} onChange={(e) => reset(setTo)(e.target.value)} className="tabular sm:w-40 [color-scheme:light] dark:[color-scheme:dark]" />
        </div>
      </div>
      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={list.data?.items}
          rowKey={(v) => v.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => void list.refetch()}
          renderMobile={(v) => (
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <OutcomeBadge outcome={v.outcome} />
                <span className="ml-auto text-[12px] text-muted-foreground">{schoolDateTime(v.visitedAt)}</span>
              </div>
              <p className="truncate text-[13.5px] font-medium">{v.student.name}</p>
              <p className="truncate text-[12.5px] text-muted-foreground">{v.complaint}</p>
            </div>
          )}
          mobileActions={(v) => <VisitActions v={v} />}
          empty={{ icon: Clock, title: 'No visits found', description: 'Try a different filter or date range.' }}
        />
      </Card>
      {list.data && list.data.total > pageSize && <Pagination page={page} pageSize={pageSize} total={list.data.total} onPageChange={setPage} noun="visits" />}
    </div>
  );
}

// ------------------------------------------------------------------ medical alerts

function AlertsTab({ onRecord }: { onRecord?: (s: PickedStudent) => void }) {
  const { options } = useClassOptions();
  const canHealth = useCan('health.manage');
  const [classArmId, setClassArmId] = useState<string | undefined>();
  const q = useMedicalAlerts(classArmId);
  const [editing, setEditing] = useState<string | null>(null);
  const profile = useMedical(editing);
  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Select value={classArmId ?? NONE} onValueChange={(v) => setClassArmId(v === NONE ? undefined : v)}>
          <SelectTrigger aria-label="Class" className="sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All classes</SelectItem>
            {options.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[12.5px] text-muted-foreground">Students with allergies, sickle cell (SS/SC) or a long-term condition. Share with class teachers and trip leaders.</p>
      </div>
      {q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Skeleton className="h-60 rounded-2xl" />
      ) : q.data.length === 0 ? (
        <Card>
          <EmptyState icon={ShieldAlert} title="No medical alerts" description="When allergies or conditions are added to a student’s medical profile they appear here." />
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {q.data.map((r) => (
            <AlertCard key={r.student.id} r={r} onEdit={canHealth ? () => setEditing(r.student.id) : undefined} onRecord={onRecord} />
          ))}
        </ul>
      )}
      {profile.data && <MedicalDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} profile={profile.data} />}
    </div>
  );
}

function AlertCard({ r, onEdit, onRecord }: { r: MedicalAlertRow; onEdit?: () => void; onRecord?: (s: PickedStudent) => void }) {
  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2.5 flex items-center gap-2.5">
        <Avatar name={r.student.name} initials={initialsFromName(r.student.name)} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">{r.student.name}</p>
          <p className="text-[12px] text-muted-foreground">{r.student.className ?? 'No class'}</p>
        </div>
        {onEdit && (
          <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit ${r.student.name}’s medical profile`}>
            <Pencil />
          </Button>
        )}
      </div>
      <MedicalAlertBanner profile={r} />
      {onRecord && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => onRecord({ id: r.student.id, name: r.student.name, admissionNumber: r.student.admissionNumber, className: r.student.className })}
        >
          <Stethoscope /> Record visit
        </Button>
      )}
    </li>
  );
}
