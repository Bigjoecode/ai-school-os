import { LEAVE_STATUSES, type LeaveAppliesTo, type LeaveRequestRow, type LeaveStatus, type LeaveTypeRow, leaveTypeSchema } from '@aischool/shared';
import { AlertTriangle, CalendarDays, CalendarPlus, Check, ListChecks, Pencil, Plane, Plus, Settings2, X } from 'lucide-react';
import { type BaseSyntheticEvent, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FormDialog, SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { formatDate, formatRelative } from '@/lib/format';
import { cn, initialsFromName } from '@/lib/utils';
import { addDaysIso, plural, schoolToday } from '../finance/ui';
import { useCancelLeave, useLeave, useLeaveTypes, useSaveLeaveType } from './api';
import { DecideLeaveDialog, RecordLeaveDialog } from './leave-dialogs';
import { dateRange, daysLabel, LeaveStatusBadge } from './ui';

type Tab = 'requests' | 'away' | 'types';
const TABS: Tab[] = ['requests', 'away', 'types'];
const STATUS_LABEL: Record<LeaveStatus, string> = { PENDING: 'Pending', APPROVED: 'Approved', DECLINED: 'Declined', CANCELLED: 'Cancelled' };
const APPLIES_LABEL: Record<LeaveAppliesTo, string> = { ALL: 'Everyone', FEMALE: 'Women', MALE: 'Men' };

export default function LeavePage() {
  const canManage = useCan('hr.manage');
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'requests';
  const rawStatus = params.get('status') as LeaveStatus | null;
  const status = rawStatus && LEAVE_STATUSES.includes(rawStatus) ? rawStatus : undefined;
  const [recordOpen, setRecordOpen] = useState(params.get('record') === '1' && canManage);

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
        title="Leave"
        description="Requests, approvals and who’s away — approved days are marked on the staff register automatically."
        actions={
          canManage && (
            <Button onClick={() => setRecordOpen(true)}>
              <CalendarPlus /> Record leave
            </Button>
          )
        }
      />
      <Tabs value={tab} onValueChange={(t) => patch({ tab: t === 'requests' ? undefined : t })}>
        <TabsList aria-label="Leave sections">
          <TabsTrigger value="requests">
            <ListChecks /> Requests
          </TabsTrigger>
          <TabsTrigger value="away">
            <Plane /> Who’s away
          </TabsTrigger>
          <TabsTrigger value="types">
            <Settings2 /> Leave types
          </TabsTrigger>
        </TabsList>
        <TabsContent value="requests">
          <RequestsTab status={status} onStatus={(s) => patch({ status: s })} />
        </TabsContent>
        <TabsContent value="away">
          <AwayTab />
        </TabsContent>
        <TabsContent value="types">
          <TypesTab />
        </TabsContent>
      </Tabs>
      {canManage && (
        <RecordLeaveDialog
          open={recordOpen}
          onOpenChange={(o) => {
            setRecordOpen(o);
            if (!o && params.get('record')) patch({ record: undefined });
          }}
        />
      )}
    </Page>
  );
}

// ------------------------------------------------------------------ requests

function RequestsTab({ status, onStatus }: { status: LeaveStatus | undefined; onStatus: (s: string | undefined) => void }) {
  const canApprove = useCan('leave.approve');
  const canManage = useCan('hr.manage');
  const q = useLeave({ status });
  const cancel = useCancelLeave();
  const [deciding, setDeciding] = useState<{ row: LeaveRequestRow; decision: 'APPROVE' | 'DECLINE' } | null>(null);
  const [cancelling, setCancelling] = useState<LeaveRequestRow | null>(null);

  const rows = useMemo(() => {
    const order: Record<LeaveStatus, number> = { PENDING: 0, APPROVED: 1, DECLINED: 2, CANCELLED: 3 };
    return [...(q.data ?? [])].sort((a, b) => order[a.status] - order[b.status] || (a.status === 'PENDING' ? a.startDate.localeCompare(b.startDate) : b.startDate.localeCompare(a.startDate)));
  }, [q.data]);
  const pending = rows.filter((r) => r.status === 'PENDING').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Select value={status ?? NONE} onValueChange={(v) => onStatus(v === NONE ? undefined : v)}>
          <SelectTrigger aria-label="Status" className="sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All requests</SelectItem>
            {LEAVE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!status && pending > 0 && <p className="text-[13px] text-muted-foreground">{plural(pending, 'request')} awaiting a decision</p>}
      </div>

      {q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <div className="space-y-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[112px] rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title={status === 'PENDING' ? 'Nothing waiting for a decision' : status ? `No ${STATUS_LABEL[status].toLowerCase()} requests` : 'No leave requests yet'}
            description="Staff request leave from My HR. HR can also record leave on someone’s behalf."
          />
        </Card>
      ) : (
        <ul className={cn('space-y-3 transition-opacity', q.isPlaceholderData && 'opacity-60')}>
          {rows.map((r) => (
            <li key={r.id}>
              <Card className={cn('p-4 sm:p-5', r.status === 'PENDING' && 'border-warning/40')}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <Avatar name={r.staff.name} initials={initialsFromName(r.staff.name)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/hr/employees/${r.staff.id}?tab=leave`} className="font-medium hover:underline">
                          {r.staff.name}
                        </Link>
                        <LeaveStatusBadge status={r.status} />
                      </div>
                      <p className="text-[12.5px] text-muted-foreground">
                        {r.staff.jobTitle}
                        {r.staff.department && ` · ${r.staff.department}`}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                        <span className="font-medium">{r.leaveType.name}</span>
                        <Badge variant={r.leaveType.paid ? 'outline' : 'warning'}>{r.leaveType.paid ? 'Paid' : 'Unpaid'}</Badge>
                        <span>{dateRange(r.startDate, r.endDate)}</span>
                        <span className="tabular text-muted-foreground">{daysLabel(r.days)}</span>
                        {r.status === 'PENDING' && r.remainingBefore != null && (
                          <span className={cn('text-[12.5px]', r.days > r.remainingBefore ? 'font-medium text-danger' : 'text-muted-foreground')}>
                            {daysLabel(r.remainingBefore)} left before this
                          </span>
                        )}
                      </div>
                      {r.reason && <p className="mt-2 text-[13px] text-foreground/90">“{r.reason}”</p>}
                      {r.overlaps.length > 0 && (r.status === 'PENDING' || r.status === 'APPROVED') && (
                        <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-warning">
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          Also away{r.staff.department ? ` in ${r.staff.department}` : ''}: {r.overlaps.join(', ')}
                        </p>
                      )}
                      {r.decidedBy && (
                        <p className="mt-2 text-[12px] text-muted-foreground">
                          {r.status === 'DECLINED' ? 'Declined' : r.status === 'APPROVED' ? 'Approved' : 'Decided'} by {r.decidedBy}
                          {r.decidedAt && ` · ${formatRelative(r.decidedAt)}`}
                          {r.decisionNote && <> — “{r.decisionNote}”</>}
                        </p>
                      )}
                      <p className="mt-1 text-[11.5px] text-muted-foreground">Requested {formatRelative(r.requestedAt)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {canApprove && r.status === 'PENDING' && (
                      <>
                        <Button size="sm" onClick={() => setDeciding({ row: r, decision: 'APPROVE' })}>
                          <Check /> Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setDeciding({ row: r, decision: 'DECLINE' })}>
                          <X /> Decline
                        </Button>
                      </>
                    )}
                    {canManage && (r.status === 'PENDING' || r.status === 'APPROVED') && (
                      <Button size="sm" variant="ghost" onClick={() => setCancelling(r)}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <DecideLeaveDialog request={deciding?.row ?? null} decision={deciding?.decision ?? 'APPROVE'} onOpenChange={(o) => !o && setDeciding(null)} />
      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(o) => !o && setCancelling(null)}
        title={`Cancel ${cancelling?.staff.name ?? ''}’s leave?`}
        description={cancelling ? `${cancelling.leaveType.name} · ${dateRange(cancelling.startDate, cancelling.endDate)}. The days go back to their balance and come off the register.` : undefined}
        confirmLabel="Cancel leave"
        loading={cancel.isPending}
        onConfirm={() => cancelling && cancel.mutate(cancelling.id, { onSuccess: () => setCancelling(null) })}
      />
    </div>
  );
}

// ------------------------------------------------------------------ who's away

/** Monday of the week containing `iso`. */
function weekStart(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  const wd = d.getUTCDay() || 7;
  return addDaysIso(iso, 1 - wd);
}

function AwayTab() {
  const today = schoolToday();
  const to = addDaysIso(today, 60);
  const q = useLeave({ status: 'APPROVED', from: today, to });
  const weeks = useMemo(() => {
    const map = new Map<string, LeaveRequestRow[]>();
    for (const r of q.data ?? []) {
      // Group under each week the leave touches, from this week on.
      for (let w = weekStart(r.startDate < today ? today : r.startDate); w <= r.endDate && w <= to; w = addDaysIso(w, 7)) {
        map.set(w, [...(map.get(w) ?? []), r]);
      }
    }
    return [...map].sort(([a], [b]) => a.localeCompare(b));
  }, [q.data, today, to]);

  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-[300px] rounded-2xl" />;
  if (weeks.length === 0) {
    return (
      <Card>
        <EmptyState icon={Plane} title="Nobody away in the next 60 days" description="Approved leave shows here, week by week." />
      </Card>
    );
  }
  const thisWeek = weekStart(today);
  return (
    <div className="space-y-4">
      {weeks.map(([w, rows]) => {
        const end = addDaysIso(w, 4);
        return (
          <Card key={w} className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-2.5">
              <p className="text-[13px] font-medium">
                {w === thisWeek ? 'This week' : w === addDaysIso(thisWeek, 7) ? 'Next week' : `Week of ${formatDate(w, { day: 'numeric', month: 'short', year: undefined })}`}
                <span className="ml-2 font-normal text-muted-foreground">{dateRange(w, end)}</span>
              </p>
              <span className="text-[12px] text-muted-foreground">{plural(rows.length, 'person', 'people')} away</span>
            </div>
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
                  <Link to={`/hr/employees/${r.staff.id}?tab=leave`} className="flex min-w-0 items-center gap-3 sm:w-64">
                    <Avatar name={r.staff.name} initials={initialsFromName(r.staff.name)} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium hover:underline">{r.staff.name}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">{r.staff.department ?? r.staff.jobTitle}</span>
                    </span>
                  </Link>
                  <WeekBar weekStart={w} start={r.startDate} end={r.endDate} label={r.leaveType.name} />
                  <span className="shrink-0 text-[12px] text-muted-foreground sm:w-40 sm:text-right">
                    {r.leaveType.name} · {dateRange(r.startDate, r.endDate)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

/** Mon–Fri strip with the days away filled in. */
function WeekBar({ weekStart: w, start, end, label }: { weekStart: string; start: string; end: string; label: string }) {
  const days = [0, 1, 2, 3, 4].map((i) => addDaysIso(w, i));
  return (
    <div className="flex flex-1 gap-1" role="img" aria-label={`${label}: ${days.filter((d) => d >= start && d <= end).length} days away this week`}>
      {days.map((d, i) => {
        const away = d >= start && d <= end;
        return (
          <span key={d} className={cn('grid h-6 flex-1 place-items-center rounded-md text-[10.5px] font-medium', away ? 'bg-info-soft text-info' : 'bg-muted/60 text-muted-foreground/60')}>
            {['M', 'T', 'W', 'T', 'F'][i]}
          </span>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ types

function TypesTab() {
  const canManage = useCan('hr.manage');
  const q = useLeaveTypes();
  const [editing, setEditing] = useState<LeaveTypeRow | 'new' | null>(null);
  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-[13px] text-muted-foreground">Yearly entitlements. Balances reset each calendar year.</p>
        {canManage && (
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus /> Add leave type
          </Button>
        )}
      </div>
      {!q.data ? (
        <div className="space-y-2 p-5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Leave type</TableHead>
              <TableHead className="text-right">Days a year</TableHead>
              <TableHead>Pay</TableHead>
              <TableHead className="hidden sm:table-cell">For</TableHead>
              <TableHead>Status</TableHead>
              {canManage && <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.data.map((t) => (
              <TableRow key={t.id} className={cn(!t.active && 'text-muted-foreground')}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell className="text-right tabular">{t.daysPerYear}</TableCell>
                <TableCell>{t.paid ? 'Paid' : <Badge variant="warning">Unpaid</Badge>}</TableCell>
                <TableCell className="hidden sm:table-cell">{APPLIES_LABEL[t.appliesTo]}</TableCell>
                <TableCell>{t.active ? <Badge variant="success" dot>Offered</Badge> : <Badge variant="outline">Retired</Badge>}</TableCell>
                {canManage && (
                  <TableCell>
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}>
                      <Pencil />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {editing && <LeaveTypeDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} type={editing === 'new' ? null : editing} />}
    </Card>
  );
}

function LeaveTypeDialog({ open, onOpenChange, type }: { open: boolean; onOpenChange: (o: boolean) => void; type: LeaveTypeRow | null }) {
  const save = useSaveLeaveType(type?.id);
  const [name, setName] = useState(type?.name ?? '');
  const [days, setDays] = useState(String(type?.daysPerYear ?? 10));
  const [paid, setPaid] = useState(type?.paid ?? true);
  const [appliesTo, setAppliesTo] = useState<LeaveAppliesTo>(type?.appliesTo ?? 'ALL');
  const [active, setActive] = useState(type?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const parsed = leaveTypeSchema.safeParse({ name, daysPerYear: Number(days), paid, appliesTo, active });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.path[0] === 'daysPerYear' ? '0–365 whole days' : i.message])));
      return;
    }
    setErrors({});
    save.mutate(parsed.data, {
      onSuccess: () => onOpenChange(false),
      onError: (err) => {
        if (err instanceof ApiError && err.errors.length) setErrors(Object.fromEntries(err.errors.map((x) => [x.path, x.message])));
        else toast.error(err.message);
      },
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={type ? `Edit ${type.name}` : 'Add a leave type'}
      icon={<CalendarDays />}
      submitLabel={type ? 'Save changes' : 'Add leave type'}
      pending={save.isPending}
      onSubmit={submit}
      size="sm"
    >
      <div className="grid gap-4">
        <Field label="Name" htmlFor="lt-name" error={errors.name}>
          <Input id="lt-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Study leave" invalid={!!errors.name} autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Days a year" htmlFor="lt-days" error={errors.daysPerYear}>
            <Input id="lt-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 3))} className="tabular" invalid={!!errors.daysPerYear} />
          </Field>
          <Field label="For" htmlFor="lt-for">
            <Select value={appliesTo} onValueChange={(v) => setAppliesTo(v as LeaveAppliesTo)}>
              <SelectTrigger id="lt-for">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(APPLIES_LABEL) as LeaveAppliesTo[]).map((a) => (
                  <SelectItem key={a} value={a}>
                    {APPLIES_LABEL[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <SwitchRow label="Paid" description="Unpaid days reduce pay pro rata on payroll.">
          <Switch checked={paid} onCheckedChange={setPaid} aria-label="Paid" />
        </SwitchRow>
        <SwitchRow label="Offered" description="Turn off to retire it. Past requests are kept.">
          <Switch checked={active} onCheckedChange={setActive} aria-label="Offered" />
        </SwitchRow>
      </div>
    </FormDialog>
  );
}
