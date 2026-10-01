import type { AiText, HrOverview, RecognitionSuggestion } from '@aischool/shared';
import {
  AlarmClock,
  Building2,
  CakeSlice,
  CalendarClock,
  CalendarOff,
  Clock,
  Hourglass,
  Inbox,
  Medal,
  PartyPopper,
  Plane,
  Settings2,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';
import { cn, initialsFromName } from '@/lib/utils';
import { StatTile } from '../attendance/ui';
import { compactMoney, EmptyChart, fmtPct, money, plural } from '../finance/ui';
import { useHrInsight, useHrOverview } from './api';
import { type AwardPrefill, GiveAwardDialog } from './award-dialog';
import { RecordLeaveDialog } from './leave-dialogs';
import { AiTextCard, dateRange, PayrollStatusBadge, shortDate } from './ui';

export default function HrOverviewPage() {
  const q = useHrOverview();
  const canManage = useCan('hr.manage');
  const [params, setParams] = useSearchParams();
  const [award, setAward] = useState<AwardPrefill | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);

  // ⌘K deep link: ?briefing=1
  useEffect(() => {
    if (params.get('briefing') === '1') {
      const p = new URLSearchParams(params);
      p.delete('briefing');
      setParams(p, { replace: true });
      window.setTimeout(() => document.getElementById('hr-briefing')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const o = q.data;
  return (
    <Page>
      <PageHeader
        title="HR"
        description="Your people at a glance — who’s in, who’s away, punctuality, pay and who deserves a thank-you."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/hr/employees">
                <Users /> Employees
              </Link>
            </Button>
            {canManage && (
              <Button onClick={() => setRecordOpen(true)}>
                <CalendarClock /> Record leave
              </Button>
            )}
          </>
        }
      />
      {q.error && !o ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !o ? (
        <OverviewSkeleton />
      ) : (
        <Body o={o} onAward={setAward} />
      )}
      {canManage && <GiveAwardDialog open={!!award} onOpenChange={(v) => !v && setAward(null)} prefill={award} />}
      {canManage && <RecordLeaveDialog open={recordOpen} onOpenChange={setRecordOpen} />}
    </Page>
  );
}

function Body({ o, onAward }: { o: HrOverview; onAward: (p: AwardPrefill) => void }) {
  const canApprove = useCan('leave.approve');
  const c = o.currency;
  const latest = o.payroll?.latest ?? null;
  const pendingHot = o.leave.pending > 0 && canApprove;
  return (
    <div className="space-y-5">
      <div className={cn('grid gap-4 sm:grid-cols-2', o.payroll ? 'xl:grid-cols-5' : 'xl:grid-cols-4')}>
        <StatTile
          label="Active staff"
          icon={<Users />}
          value={o.headcount.active.toLocaleString()}
          sub={`${o.headcount.teaching} teaching · ${o.headcount.nonTeaching} non-teaching`}
        />
        <StatTile
          label="On leave today"
          icon={<Plane />}
          value={o.leave.onLeaveToday.length}
          sub={o.leave.upcoming.length ? `${plural(o.leave.upcoming.length, 'start')} in the next 30 days` : 'Nobody starting leave soon'}
        />
        <Link
          to="/hr/leave?status=PENDING"
          className={cn('block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', pendingHot && 'ring-1 ring-warning/40')}
          aria-label={`${o.leave.pending} leave requests awaiting a decision`}
        >
          <StatTile
            label="Leave requests"
            icon={<Inbox />}
            value={o.leave.pending}
            tone={pendingHot ? 'warning' : undefined}
            sub={pendingHot ? <span className="font-medium text-warning">Awaiting your decision →</span> : o.leave.pending ? 'Awaiting a decision' : 'All caught up'}
          />
        </Link>
        <StatTile
          label="On time this month"
          icon={<AlarmClock />}
          value={fmtPct(o.attendance.onTimeRate)}
          tone={o.attendance.onTimeRate == null ? undefined : o.attendance.onTimeRate >= 90 ? 'success' : o.attendance.onTimeRate >= 75 ? 'warning' : 'danger'}
          sub={o.attendance.avgCheckIn ? `Average check-in ${o.attendance.avgCheckIn}` : 'No check-ins yet this month'}
        />
        {o.payroll && (
          <Link to={latest ? `/payroll/runs/${latest.id}` : '/payroll'} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <StatTile
              label={latest ? `${latest.label} net pay` : 'Payroll'}
              icon={<Wallet />}
              value={latest ? compactMoney(latest.netKobo, c) : '—'}
              sub={
                latest ? (
                  <span className="flex items-center gap-2">
                    <PayrollStatusBadge status={latest.status} /> {plural(latest.staffCount, 'payslip')}
                  </span>
                ) : (
                  'No payroll prepared yet'
                )
              }
            />
          </Link>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-3 [&>*]:min-w-0">
        <AwayCard o={o} />
        <DepartmentsCard o={o} />
      </div>

      <AiBriefing />

      {o.payroll && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Payroll trend</CardTitle>
              <CardDescription>Gross and net pay, last six months</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/payroll">Open payroll</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="h-[240px]">
              {o.payroll.trend.length === 0 ? <EmptyChart text="Payroll totals appear here once you prepare a month." /> : <PayrollTrendChart data={o.payroll.trend} currency={c} />}
            </div>
            {o.payroll.trend.length > 0 && (
              <div className="mt-3 flex gap-4 text-[12px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-chart-1" aria-hidden /> Gross
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-chart-4" aria-hidden /> Net
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-3 [&>*]:min-w-0">
        <RecognitionCard items={o.recognition} awardsThisYear={o.awardsThisYear} onAward={onAward} />
        <PunctualityCard o={o} />
        <CelebrationsCard o={o} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ away

function AwayCard({ o }: { o: HrOverview }) {
  return (
    <Card className="flex flex-col xl:col-span-2">
      <CardHeader>
        <div>
          <CardTitle>Who’s away</CardTitle>
          <CardDescription>Today and the next 30 days</CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/hr/leave?tab=away">Calendar</Link>
        </Button>
      </CardHeader>
      <CardContent className="grid flex-1 gap-5 md:grid-cols-2 [&>*]:min-w-0">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Today</p>
          {o.leave.onLeaveToday.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[13px] text-muted-foreground">Everyone’s in today.</p>
          ) : (
            <ul className="space-y-1">
              {o.leave.onLeaveToday.map((l) => (
                <PersonRow key={l.staff.id} id={l.staff.id} name={l.staff.name} sub={`${l.leaveType} · back after ${shortDate(l.until)}`} />
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Coming up</p>
          {o.leave.upcoming.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[13px] text-muted-foreground">No leave booked for the next 30 days.</p>
          ) : (
            <ul className="max-h-[260px] space-y-1 overflow-y-auto scrollbar-thin">
              {o.leave.upcoming.map((l) => (
                <PersonRow
                  key={`${l.staff.id}-${l.startDate}`}
                  id={l.staff.id}
                  name={l.staff.name}
                  sub={`${l.leaveType} · ${dateRange(l.startDate, l.endDate)}`}
                  right={<span className="text-[11.5px] tabular text-muted-foreground">{l.days}d</span>}
                />
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PersonRow({ id, name, sub, right }: { id: string; name: string; sub: string; right?: ReactNode }) {
  return (
    <li>
      <Link to={`/hr/employees/${id}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar name={name} initials={initialsFromName(name)} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{name}</span>
          <span className="block truncate text-[12px] text-muted-foreground">{sub}</span>
        </span>
        {right}
      </Link>
    </li>
  );
}

// ------------------------------------------------------------------ departments

function DepartmentsCard({ o }: { o: HrOverview }) {
  const max = Math.max(1, ...o.byDepartment.map((d) => d.count));
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Headcount by department</CardTitle>
          <CardDescription>
            {o.headcount.joinersThisYear} joined · {o.headcount.leaversThisYear} left this year
          </CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/hr/employees?tab=departments">
            <Settings2 /> Manage
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {o.byDepartment.length === 0 ? (
          <EmptyState compact icon={Building2} title="No departments yet" description="Group staff into departments to see headcount here." />
        ) : (
          <ul className="space-y-2.5">
            {o.byDepartment.map((d) => (
              <li key={d.id ?? 'none'}>
                <Link
                  to={`/hr/employees?department=${d.id ?? 'none'}`}
                  className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="mb-1 flex items-center justify-between text-[12.5px]">
                    <span className={cn('truncate group-hover:underline', !d.id && 'italic text-muted-foreground')}>{d.name}</span>
                    <span className="font-medium tabular">{d.count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-brand/80 transition-[width] duration-700" style={{ width: `${(d.count / max) * 100}%` }} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ chart

function PayrollTrendChart({ data, currency }: { data: { label: string; grossKobo: number; netKobo: number; staffCount: number }[]; currency: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={4} barCategoryGap="28%">
        <CartesianGrid vertical={false} strokeDasharray="3 4" />
        <XAxis dataKey="label" tickFormatter={(l: string) => l.split(' ')[0]?.slice(0, 3) ?? l} tickLine={false} axisLine={false} tickMargin={10} interval={0} fontSize={11} />
        <YAxis tickFormatter={(v: number) => compactMoney(v, currency)} tickLine={false} axisLine={false} tickMargin={6} width={64} fontSize={11} />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.6, radius: 8 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]?.payload as { label: string; grossKobo: number; netKobo: number; staffCount: number } | undefined;
            if (!row) return null;
            return (
              <div className="min-w-[180px] rounded-xl border border-border bg-popover/95 px-3 py-2.5 text-[12px] shadow-pop backdrop-blur">
                <p className="mb-1.5 font-medium">{row.label}</p>
                {(
                  [
                    ['Gross', row.grossKobo, 'var(--chart-1)'],
                    ['Net', row.netKobo, 'var(--chart-4)'],
                  ] as const
                ).map(([n, v, color]) => (
                  <div key={n} className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
                    <span className="text-muted-foreground">{n}</span>
                    <span className="ml-auto font-medium tabular">{money(v, currency)}</span>
                  </div>
                ))}
                <p className="mt-1 text-muted-foreground">{plural(row.staffCount, 'payslip')}</p>
              </div>
            );
          }}
        />
        <Bar dataKey="grossKobo" name="Gross" fill="var(--chart-1)" radius={[6, 6, 2, 2]} maxBarSize={28} animationDuration={800} />
        <Bar dataKey="netKobo" name="Net" fill="var(--chart-4)" radius={[6, 6, 2, 2]} maxBarSize={28} animationDuration={900} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ------------------------------------------------------------------ recognition

const RECOGNITION_PREFILL: Record<RecognitionSuggestion['kind'], Pick<AwardPrefill, 'category' | 'title'>> = {
  PUNCTUALITY: { category: 'PUNCTUALITY', title: 'Punctuality Award' },
  PERFECT_ATTENDANCE: { category: 'PUNCTUALITY', title: 'Perfect Attendance Award' },
  LONG_SERVICE: { category: 'LONG_SERVICE', title: 'Long Service Award' },
};

export function RecognitionList({ items, onAward, compact }: { items: RecognitionSuggestion[]; onAward?: (p: AwardPrefill) => void; compact?: boolean }) {
  if (items.length === 0) {
    return <EmptyState compact icon={Medal} title="No suggestions right now" description="Punctual months, perfect attendance and service milestones show up here." />;
  }
  return (
    <ul className={cn('space-y-1', !compact && 'max-h-[320px] overflow-y-auto scrollbar-thin')}>
      {items.map((r) => (
        <li key={`${r.kind}-${r.staff.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/50">
          <Avatar name={r.staff.name} initials={initialsFromName(r.staff.name)} size="sm" />
          <div className="min-w-0 flex-1">
            <Link to={`/hr/employees/${r.staff.id}`} className="block truncate text-[13px] font-medium hover:underline">
              {r.staff.name}
            </Link>
            <p className="truncate text-[12px] text-muted-foreground">{r.detail}</p>
          </div>
          {onAward && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[12px]"
              aria-label={`Give ${r.staff.name} an award`}
              onClick={() => onAward({ staffId: r.staff.id, notes: r.detail, ...RECOGNITION_PREFILL[r.kind] })}
            >
              <Medal /> Give award
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function RecognitionCard({ items, awardsThisYear, onAward }: { items: RecognitionSuggestion[]; awardsThisYear: number; onAward: (p: AwardPrefill) => void }) {
  const canManage = useCan('hr.manage');
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            Worth recognising {items.length > 0 && <Badge variant="brand">{items.length}</Badge>}
          </CardTitle>
          <CardDescription>{plural(awardsThisYear, 'award')} given this year</CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/hr/awards">Awards</Link>
        </Button>
      </CardHeader>
      <CardContent>
        <RecognitionList items={items} onAward={canManage ? onAward : undefined} />
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ punctuality

function PunctualityCard({ o }: { o: HrOverview }) {
  const canRegister = useCan('attendance.manage');
  const a = o.attendance;
  const total = a.present + a.late + a.absent + a.onLeave;
  const parts = [
    { key: 'On time', n: a.present, cls: 'bg-success' },
    { key: 'Late', n: a.late, cls: 'bg-warning' },
    { key: 'Absent', n: a.absent, cls: 'bg-danger' },
    { key: 'On leave', n: a.onLeave, cls: 'bg-info' },
  ];
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Punctuality</CardTitle>
          <CardDescription>Staff check-ins this month</CardDescription>
        </div>
        {canRegister && (
          <Button asChild variant="ghost" size="sm">
            <Link to="/attendance?tab=staff">Register</Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {total === 0 ? (
          <EmptyState compact icon={Clock} title="No check-ins yet" description="Staff check in at the kiosk or on their phone." />
        ) : (
          <>
            <div role="img" aria-label={parts.map((p) => `${p.n} ${p.key.toLowerCase()}`).join(', ')} className="flex h-2 overflow-hidden rounded-full bg-muted">
              {parts.map((p) => (p.n > 0 ? <span key={p.key} className={cn('h-full', p.cls)} style={{ width: `${(p.n / total) * 100}%` }} /> : null))}
            </div>
            <dl className="grid grid-cols-4 gap-2 text-center [&>*]:min-w-0">
              {parts.map((p) => (
                <div key={p.key}>
                  <dd className="font-display text-[17px] font-semibold tabular">{p.n}</dd>
                  <dt className="text-[11px] text-muted-foreground">{p.key}</dt>
                </div>
              ))}
            </dl>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Most late arrivals</p>
              {a.mostLate.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">Nobody late more than once. Lovely.</p>
              ) : (
                <ul className="space-y-0.5">
                  {a.mostLate.map((m) => (
                    <li key={m.staff.id}>
                      <Link to={`/hr/employees/${m.staff.id}?tab=attendance`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1 text-[12.5px] hover:bg-muted/60">
                        <span className="truncate">{m.staff.name}</span>
                        <span className="shrink-0 tabular text-muted-foreground">{plural(m.late, 'time')}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ celebrations

function CelebrationsCard({ o }: { o: HrOverview }) {
  const empty = o.birthdays.length === 0 && o.anniversaries.length === 0;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>This month</CardTitle>
          <CardDescription>Birthdays and work anniversaries</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {empty ? (
          <EmptyState compact icon={PartyPopper} title="Nothing to celebrate on record" description="Add dates of birth and start dates to staff records." />
        ) : (
          <ul className="max-h-[320px] space-y-1 overflow-y-auto scrollbar-thin">
            {o.birthdays.map((b) => (
              <Celebration key={`b-${b.staff.id}`} id={b.staff.id} name={b.staff.name} icon={<CakeSlice />} text={`Birthday · ${formatDate(b.date, { day: 'numeric', month: 'long', year: undefined })}`} />
            ))}
            {o.anniversaries.map((a) => (
              <Celebration
                key={`a-${a.staff.id}`}
                id={a.staff.id}
                name={a.staff.name}
                icon={<Hourglass />}
                text={`${plural(a.years, 'year')} at the school · ${formatDate(a.date, { day: 'numeric', month: 'long', year: undefined })}`}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Celebration({ id, name, icon, text }: { id: string; name: string; icon: ReactNode; text: string }) {
  return (
    <li>
      <Link to={`/hr/employees/${id}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-brand [&_svg]:size-4">{icon}</span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium">{name}</span>
          <span className="block truncate text-[12px] text-muted-foreground">{text}</span>
        </span>
      </Link>
    </li>
  );
}

// ------------------------------------------------------------------ AI

function AiBriefing() {
  const canAi = useCan('ai.use');
  const insight = useHrInsight();
  const [result, setResult] = useState<AiText | null>(null);
  if (!canAi) return null;
  return (
    <AiTextCard
      id="hr-briefing"
      title="AI HR briefing"
      description="Leave cover, punctuality, payroll movement and who to thank — written from this month’s records."
      points={[
        [CalendarOff, 'Leave and cover gaps'],
        [AlarmClock, 'Punctuality patterns'],
        [Sparkles, 'People worth recognising'],
      ]}
      result={result}
      pending={insight.isPending}
      onRun={() => insight.mutate(undefined, { onSuccess: setResult })}
      runLabel="Write briefing"
      pendingLabel="Reading the records…"
      footnote="Late-arrival counts are shared without names."
    />
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-5" aria-busy>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5 [&>*]:min-w-0">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[132px] rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-3 [&>*]:min-w-0">
        <Skeleton className="h-[320px] rounded-2xl xl:col-span-2" />
        <Skeleton className="h-[320px] rounded-2xl" />
      </div>
      <Skeleton className="h-[140px] rounded-2xl" />
    </div>
  );
}
