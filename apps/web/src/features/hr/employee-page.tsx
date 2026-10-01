import { AWARD_CATEGORY_LABELS, type EmployeeDetail } from '@aischool/shared';
import { AlarmClock, Award, CalendarDays, CalendarPlus, KeyRound, Medal, Pencil, UserRound, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Page } from '@/components/layout/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tip } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { cn, initialsFromName } from '@/lib/utils';
import { fmtPct, monthLabel } from '../finance/ui';
import { BackLink, Chips, DetailSkeleton } from '../planning/ui';
import { useCancelLeave, useEmployee } from './api';
import { type AwardPrefill, GiveAwardDialog } from './award-dialog';
import { EditEmployeeSheet, PayBreakdown, PayProfileSheet } from './employee-sheets';
import { RecordLeaveDialog } from './leave-dialogs';
import { dateRange, daysLabel, Detail, EmployeeStatusBadge, LeaveStatusBadge, maskAccount, STAFF_TYPE_LABEL, yearsLabel } from './ui';

type Tab = 'overview' | 'leave' | 'attendance' | 'awards' | 'pay';

export default function EmployeePage() {
  const { id = '' } = useParams();
  const q = useEmployee(id);
  if (q.isLoading) {
    return (
      <Page className="max-w-6xl">
        <DetailSkeleton />
      </Page>
    );
  }
  if (!q.data) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <Page className="max-w-6xl">
        <BackLink to="/hr/employees">Employees</BackLink>
        {notFound ? <EmptyState icon={UserRound} title="Employee not found" description="They may have been removed, or the link is wrong." /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      </Page>
    );
  }
  return <EmployeeView e={q.data} />;
}

function EmployeeView({ e }: { e: EmployeeDetail }) {
  useDocumentTitle(e.name);
  const canManage = useCan('hr.manage');
  const canPayManage = useCan('payroll.manage');
  const [params, setParams] = useSearchParams();
  const tabs: Tab[] = ['overview', 'leave', 'attendance', 'awards', ...(e.canSeePay ? (['pay'] as const) : [])];
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && tabs.includes(raw) ? raw : 'overview';
  const setTab = (t: string) => {
    const p = new URLSearchParams(params);
    if (t === 'overview') p.delete('tab');
    else p.set('tab', t);
    setParams(p, { replace: true });
  };
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(params.get('editPay') === '1');
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [award, setAward] = useState<AwardPrefill | null>(null);

  return (
    <Page className="max-w-6xl">
      <BackLink to="/hr/employees">Employees</BackLink>

      <Card className="relative mt-4 overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-brand/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
          <Avatar name={e.name} initials={initialsFromName(e.name)} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-semibold tracking-tight">{e.name}</h1>
              <EmployeeStatusBadge status={e.status} onLeaveUntil={e.onLeaveUntil} />
              {e.hasPayProfile === false && e.status !== 'EXITED' && <Badge variant="warning">No pay details</Badge>}
            </div>
            <p className="mt-1 text-[14px] text-muted-foreground">
              {e.jobTitle}
              {e.department && <> · {e.department.name}</>} · {STAFF_TYPE_LABEL[e.type]}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground">
              <span className="font-mono">{e.staffNumber}</span>
              <span>{e.employedOn ? `Joined ${formatDate(e.employedOn)} · ${yearsLabel(e.yearsOfService)}` : 'Start date not recorded'}</span>
              <Tip label={e.hasLogin ? 'Can sign in to request leave and see payslips' : 'No user account linked — they can’t use My HR yet'}>
                <span className={cn('inline-flex items-center gap-1', e.hasLogin ? 'text-success' : '')}>
                  <KeyRound className="size-3.5" aria-hidden /> {e.hasLogin ? 'Has a login' : 'No login'}
                </span>
              </Tip>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage && (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil /> Edit
              </Button>
            )}
            {canManage && e.status !== 'EXITED' && (
              <Button variant="outline" onClick={() => setLeaveOpen(true)}>
                <CalendarPlus /> Record leave
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList aria-label="Employee sections">
          <TabsTrigger value="overview">
            <UserRound /> Overview
          </TabsTrigger>
          <TabsTrigger value="leave">
            <CalendarDays /> Leave
          </TabsTrigger>
          <TabsTrigger value="attendance">
            <AlarmClock /> Attendance
          </TabsTrigger>
          <TabsTrigger value="awards">
            <Award /> Awards {e.awards.length > 0 && <span className="tabular text-muted-foreground">{e.awards.length}</span>}
          </TabsTrigger>
          {e.canSeePay && (
            <TabsTrigger value="pay">
              <Wallet /> Pay
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab e={e} />
        </TabsContent>
        <TabsContent value="leave">
          <LeaveTab e={e} onRecord={canManage && e.status !== 'EXITED' ? () => setLeaveOpen(true) : undefined} />
        </TabsContent>
        <TabsContent value="attendance">
          <AttendanceTab e={e} />
        </TabsContent>
        <TabsContent value="awards">
          <AwardsTab e={e} onGive={canManage && e.status !== 'EXITED' ? () => setAward({ staffId: e.id }) : undefined} />
        </TabsContent>
        {e.canSeePay && (
          <TabsContent value="pay">
            <PayTab e={e} onEdit={canPayManage && e.status !== 'EXITED' ? () => setPayOpen(true) : undefined} />
          </TabsContent>
        )}
      </Tabs>

      {canManage && <EditEmployeeSheet open={editOpen} onOpenChange={setEditOpen} employee={e} />}
      {canPayManage && e.canSeePay && <PayProfileSheet open={payOpen} onOpenChange={setPayOpen} employee={e} />}
      {canManage && <RecordLeaveDialog open={leaveOpen} onOpenChange={setLeaveOpen} staffId={e.id} />}
      {canManage && <GiveAwardDialog open={!!award} onOpenChange={(o) => !o && setAward(null)} prefill={award} />}
    </Page>
  );
}

// ------------------------------------------------------------------ overview

function OverviewTab({ e }: { e: EmployeeDetail }) {
  return (
    <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
            <Detail label="Email">{e.email ? <a href={`mailto:${e.email}`} className="hover:underline">{e.email}</a> : '—'}</Detail>
            <Detail label="Phone">{e.phone ? <a href={`tel:${e.phone}`} className="hover:underline">{e.phone}</a> : '—'}</Detail>
            <Detail label="Gender">{e.gender === 'FEMALE' ? 'Female' : 'Male'}</Detail>
            <Detail label="Date of birth">{e.dateOfBirth ? formatDate(e.dateOfBirth) : '—'}</Detail>
            <Detail label="Qualification">{e.qualification ?? '—'}</Detail>
            <Detail label="Address" className="sm:col-span-2 lg:col-span-1">
              <span className="whitespace-pre-line">{e.address ?? '—'}</span>
            </Detail>
          </dl>
          <div className="border-t border-border pt-5">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
              <Detail label="Job title">{e.jobTitle}</Detail>
              <Detail label="Department">{e.department ? <Link to={`/hr/employees?department=${e.department.id}`} className="hover:underline">{e.department.name}</Link> : '—'}</Detail>
              <Detail label="Type">{STAFF_TYPE_LABEL[e.type]}</Detail>
              <Detail label="Employed on">{e.employedOn ? formatDate(e.employedOn) : '—'}</Detail>
              <Detail label="Service">{yearsLabel(e.yearsOfService)}</Detail>
              <Detail label="Staff number" mono>
                {e.staffNumber}
              </Detail>
              {e.status === 'EXITED' && (
                <>
                  <Detail label="Left on">{e.exitedOn ? formatDate(e.exitedOn) : '—'}</Detail>
                  <Detail label="Reason for leaving" className="sm:col-span-2">
                    {e.exitReason ?? '—'}
                  </Detail>
                </>
              )}
            </dl>
          </div>
          <div className="border-t border-border pt-5">
            <dl className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
              <Detail label="Next of kin">{e.nextOfKinName ?? '—'}</Detail>
              <Detail label="Next of kin phone">{e.nextOfKinPhone ?? '—'}</Detail>
            </dl>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Teaching</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Class teacher of</p>
            {e.classesLed.length ? <Chips items={e.classesLed} /> : <p className="text-[13px] text-muted-foreground">No class</p>}
          </div>
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Subjects</p>
            {e.subjectsTaught.length ? <Chips items={e.subjectsTaught} /> : <p className="text-[13px] text-muted-foreground">None assigned</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ leave

export function LeaveBalances({ balances }: { balances: EmployeeDetail['leaveBalances'] }) {
  if (balances.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
      {balances.map((b) => {
        const used = b.taken + b.pending;
        const pct = b.entitled ? (used / b.entitled) * 100 : 0;
        return (
          <Card key={b.leaveTypeId} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[13px] font-medium">
                {b.name}
                {!b.paid && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">unpaid</span>}
              </p>
              <p className="text-right">
                <span className={cn('font-display text-[20px] font-semibold leading-none tabular', b.remaining <= 0 && 'text-muted-foreground')}>{b.remaining}</span>
                <span className="text-[11.5px] text-muted-foreground"> / {b.entitled} left</span>
              </p>
            </div>
            <Progress value={pct} className="mt-3" barClassName={pct >= 100 ? 'bg-danger' : pct >= 75 ? 'bg-warning' : 'bg-brand'} label={`${b.name}: ${used} of ${b.entitled} days used`} />
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              {b.taken} taken{b.pending ? ` · ${b.pending} pending` : ''}
            </p>
          </Card>
        );
      })}
    </div>
  );
}

function LeaveTab({ e, onRecord }: { e: EmployeeDetail; onRecord?: () => void }) {
  const canManage = useCan('hr.manage');
  const cancel = useCancelLeave();
  const [cancelling, setCancelling] = useState<EmployeeDetail['leave'][number] | null>(null);
  return (
    <div className="space-y-5">
      <LeaveBalances balances={e.leaveBalances} />
      <Card className="overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>Leave history</CardTitle>
            <CardDescription>This year and recent requests</CardDescription>
          </div>
          {onRecord && (
            <Button size="sm" onClick={onRecord}>
              <CalendarPlus /> Record leave
            </Button>
          )}
        </CardHeader>
        {e.leave.length === 0 ? (
          <EmptyState compact icon={CalendarDays} title="No leave on record" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Note</TableHead>
                {canManage && <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {e.leave.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">
                    {l.leaveType.name}
                    {!l.leaveType.paid && <span className="ml-1 text-[11px] font-normal text-muted-foreground">unpaid</span>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-[13px]">{dateRange(l.startDate, l.endDate)}</TableCell>
                  <TableCell className="text-right tabular">{l.days}</TableCell>
                  <TableCell>
                    <LeaveStatusBadge status={l.status} />
                  </TableCell>
                  <TableCell className="hidden max-w-[260px] truncate text-[12.5px] text-muted-foreground md:table-cell">{l.decisionNote ?? l.reason ?? '—'}</TableCell>
                  {canManage && (
                    <TableCell>
                      {(l.status === 'PENDING' || l.status === 'APPROVED') && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px]" onClick={() => setCancelling(l)}>
                          Cancel
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(o) => !o && setCancelling(null)}
        title="Cancel this leave?"
        description={cancelling ? `${cancelling.leaveType.name} · ${dateRange(cancelling.startDate, cancelling.endDate)} · ${daysLabel(cancelling.days)}. Days come back to their balance.` : undefined}
        confirmLabel="Cancel leave"
        loading={cancel.isPending}
        onConfirm={() => cancelling && cancel.mutate(cancelling.id, { onSuccess: () => setCancelling(null) })}
      />
    </div>
  );
}

// ------------------------------------------------------------------ attendance

function AttendanceTab({ e }: { e: EmployeeDetail }) {
  const a = e.attendance;
  const tiles = [
    { label: 'On time', n: a.present, cls: 'text-success' },
    { label: 'Late', n: a.late, cls: 'text-warning' },
    { label: 'Absent', n: a.absent, cls: 'text-danger' },
    { label: 'On leave', n: a.onLeave, cls: 'text-info' },
  ];
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{monthLabel(a.month, true)}</CardTitle>
          <CardDescription>From check-ins at the kiosk or on their phone</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 [&>*]:min-w-0">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl border border-border bg-muted/30 px-3.5 py-3">
              <dt className="text-[12px] text-muted-foreground">{t.label}</dt>
              <dd className={cn('mt-0.5 font-display text-[22px] font-semibold tabular', t.n > 0 && t.cls)}>{t.n}</dd>
            </div>
          ))}
          <div className="rounded-xl border border-border bg-muted/30 px-3.5 py-3">
            <dt className="text-[12px] text-muted-foreground">On-time rate</dt>
            <dd className="mt-0.5 font-display text-[22px] font-semibold tabular">{fmtPct(a.onTimeRate)}</dd>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 px-3.5 py-3">
            <dt className="text-[12px] text-muted-foreground">Average check-in</dt>
            <dd className="mt-0.5 font-display text-[22px] font-semibold tabular">{a.avgCheckIn ?? '—'}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ awards

export function AwardList({ awards }: { awards: EmployeeDetail['awards'] }) {
  return (
    <ul className="divide-y divide-border">
      {awards.map((a) => (
        <li key={a.id} className="flex gap-3 px-5 py-4 sm:px-6">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning-soft text-warning">
            <Medal className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{a.title}</p>
            <p className="text-[12.5px] text-muted-foreground">
              {AWARD_CATEGORY_LABELS[a.category]} · {formatDate(a.awardedOn)}
              {a.prize && ` · ${a.prize}`}
            </p>
            {a.citation && <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-foreground/90">{a.citation}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function AwardsTab({ e, onGive }: { e: EmployeeDetail; onGive?: () => void }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle>Awards</CardTitle>
          <CardDescription>Recognition on record</CardDescription>
        </div>
        {onGive && (
          <Button size="sm" variant="outline" onClick={onGive}>
            <Medal /> Give award
          </Button>
        )}
      </CardHeader>
      {e.awards.length === 0 ? <EmptyState compact icon={Award} title="No awards yet" /> : <AwardList awards={e.awards} />}
    </Card>
  );
}

// ------------------------------------------------------------------ pay

function PayTab({ e, onEdit }: { e: EmployeeDetail; onEdit?: () => void }) {
  const p = e.payProfile;
  const c = e.currency;
  if (!p) {
    return (
      <Card>
        <EmptyState
          icon={Wallet}
          title="No pay details yet"
          description={`${e.name.split(' ')[0]} won’t be on payroll until a salary and bank account are set.`}
          action={
            onEdit ? (
              <Button onClick={onEdit}>
                <Pencil /> Set pay details
              </Button>
            ) : undefined
          }
        />
      </Card>
    );
  }
  const missing = [!p.accountNumber && 'bank account', p.pensionEnabled && !p.pensionPin && 'pension PIN', !p.taxId && 'tax ID'].filter(Boolean) as string[];
  return (
    <div className="grid gap-5 lg:grid-cols-5 [&>*]:min-w-0">
      <Card className="lg:col-span-3">
        <CardHeader>
          <div>
            <CardTitle>This month’s pay</CardTitle>
            <CardDescription>Before any unpaid leave or one-off adjustments</CardDescription>
          </div>
          {onEdit && (
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil /> Edit pay details
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <PayBreakdown calc={p.preview} currency={c} />
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Pay details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {missing.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {missing.map((m) => (
                <Badge key={m} variant="warning">
                  No {m}
                </Badge>
              ))}
            </div>
          )}
          <dl className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
            <Detail label="Salary grade">{p.gradeName ?? 'Custom'}</Detail>
            <Detail label="Statutory">
              {[p.pensionEnabled && 'Pension', p.nhfEnabled && 'NHF'].filter(Boolean).join(' · ') || 'None'}
            </Detail>
            <Detail label="Annual rent">{p.annualRentKobo ? new Intl.NumberFormat('en-NG', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(p.annualRentKobo / 100) : '—'}</Detail>
            <Detail label="Bank">{p.bankName ?? '—'}</Detail>
            <Detail label="Account" mono>
              {p.accountNumber ? `${maskAccount(p.accountNumber)}${p.accountName ? ` · ${p.accountName}` : ''}` : '—'}
            </Detail>
            <Detail label="Pension administrator">{p.pfaName ?? '—'}</Detail>
            <Detail label="Pension PIN" mono>
              {p.pensionPin ?? '—'}
            </Detail>
            <Detail label="Tax ID" mono>
              {p.taxId ?? '—'}
            </Detail>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
