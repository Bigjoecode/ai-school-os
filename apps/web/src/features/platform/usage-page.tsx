import type { ApiUsageReport, PlatformAiUsageReport, StudentUsageReport } from '@aischool/shared';
import { Activity, AlertTriangle, Bot, ChevronLeft, ChevronRight, Cpu, GraduationCap, Layers } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { type Column, DataTable } from '@/components/ui/data-table';
import { ErrorState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCompact, formatNumber } from '@/lib/format';
import { cn, titleCase } from '@/lib/utils';
import { Segmented } from '../operations/ui';
import { monthShort, useApiUsage, usePlatformAiUsage, useStudentUsage, usd } from './api';
import { DailyBars, MonthBars, RequestsChart } from './charts';
import { Kpi, Meter, Muted, SchoolCell, Section, TenantStatusBadge, Toolbar, useTabParam } from './ui';

const TABS = ['students', 'ai', 'api'] as const;

export default function UsagePage() {
  const [tab, setTab] = useTabParam(TABS, 'students');
  return (
    <Page>
      <PageHeader eyebrow="Platform" title="Usage" description="Students and seats, AI spend and API traffic across every school." />
      <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number])}>
        <TabsList>
          <TabsTrigger value="students">
            <GraduationCap /> Students
          </TabsTrigger>
          <TabsTrigger value="ai">
            <Bot /> AI
          </TabsTrigger>
          <TabsTrigger value="api">
            <Activity /> API
          </TabsTrigger>
        </TabsList>
        <TabsContent value="students">
          <StudentsTab />
        </TabsContent>
        <TabsContent value="ai">
          <AiTab />
        </TabsContent>
        <TabsContent value="api">
          <ApiTab />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

// ------------------------------------------------------------------ students

type StudentRow = StudentUsageReport['rows'][number];

function StudentsTab() {
  const q = useStudentUsage();
  const r = q.data;
  const over = r?.rows.filter((x) => x.overLimit).length ?? 0;
  const added = r?.rows.reduce((t, x) => t + x.addedLast30d, 0) ?? 0;
  const left = r?.rows.reduce((t, x) => t + x.leftLast30d, 0) ?? 0;

  const columns: Column<StudentRow>[] = [
    { key: 'school', header: 'School', cell: (x) => <SchoolCell school={x.tenant} /> },
    { key: 'status', header: 'Status', cell: (x) => <TenantStatusBadge status={x.tenant.status} /> },
    { key: 'plan', header: 'Plan', cell: (x) => x.plan ?? <Muted>No plan</Muted> },
    {
      key: 'active',
      header: 'Active / limit',
      cell: (x) => (
        <div className="w-40">
          <div className="flex items-baseline justify-between gap-2 text-[12.5px] tabular">
            <span className={cn('font-medium', x.overLimit && 'text-danger')}>{formatNumber(x.active)}</span>
            <span className="text-muted-foreground">{x.maxStudents ? `of ${formatNumber(x.maxStudents)}` : 'no limit'}</span>
          </div>
          {x.maxStudents ? <Meter pct={(x.active / x.maxStudents) * 100} className="mt-1" label="Plan limit used" /> : null}
        </div>
      ),
    },
    { key: 'seats', header: 'Seats', className: 'tabular text-right', headClassName: 'text-right', cell: (x) => formatNumber(x.seats) },
    { key: 'billable', header: 'Billable', className: 'tabular text-right font-medium', headClassName: 'text-right', cell: (x) => formatNumber(x.billable) },
    {
      key: 'moves',
      header: '30 days',
      className: 'tabular text-right whitespace-nowrap',
      headClassName: 'text-right',
      cell: (x) => (
        <span className="text-[12.5px]">
          <span className={x.addedLast30d ? 'text-success' : 'text-muted-foreground'}>+{x.addedLast30d}</span>
          <span className="text-muted-foreground"> / </span>
          <span className={x.leftLast30d ? 'text-danger' : 'text-muted-foreground'}>−{x.leftLast30d}</span>
        </span>
      ),
    },
    { key: 'flag', header: <span className="sr-only">Limit</span>, cell: (x) => (x.overLimit ? <Badge variant="danger">Over limit</Badge> : null) },
  ];

  if (q.error && !r)
    return (
      <Card>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Card>
    );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
        <Kpi label="Active students" loading={!r} value={formatNumber(r?.totalActive ?? 0)} />
        <Kpi label="Billable seats" loading={!r} value={formatNumber(r?.totalSeats ?? 0)} sub="Larger of seats and active, per school" />
        <Kpi label="Last 30 days" loading={!r} value={`+${formatNumber(added)}`} sub={`${formatNumber(left)} left`} />
        <Kpi label="Over plan limit" loading={!r} value={formatNumber(over)} tone={over ? 'danger' : undefined} sub={over ? 'Upgrade conversations to have' : 'Every school within limits'} />
      </div>
      <Section title="Admissions" description="Students added per month across the platform, last 12 months">
        <div className="h-[200px]">{!r ? <Skeleton className="h-full w-full rounded-xl" /> : <MonthBars data={r.growth.map((g) => ({ month: g.month, value: g.admitted }))} label="Admitted" monthFmt={monthShort} color="var(--chart-2)" />}</div>
      </Section>
      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={r?.rows}
          rowKey={(x) => x.tenant.id}
          loading={q.isLoading}
          error={q.error}
          renderMobile={(x) => (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <SchoolCell school={x.tenant} link={false} sub={x.plan ?? 'No plan'} />
                </div>
                {x.overLimit ? <Badge variant="danger">Over limit</Badge> : <TenantStatusBadge status={x.tenant.status} />}
              </div>
              <p className="text-[12px] text-muted-foreground tabular">
                {formatNumber(x.active)} active{x.maxStudents ? ` of ${formatNumber(x.maxStudents)}` : ''} · {formatNumber(x.billable)} billable · +{x.addedLast30d}/−{x.leftLast30d} in 30d
              </p>
            </div>
          )}
          empty={{ icon: GraduationCap, title: 'No schools yet' }}
        />
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ AI

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function shiftMonth(month: string, by: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const id = useId();
  const max = currentMonth();
  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="icon-sm" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month">
        <ChevronLeft />
      </Button>
      <label htmlFor={id} className="sr-only">
        Month
      </label>
      <Input id={id} type="month" value={month} max={max} onChange={(e) => e.target.value && onChange(e.target.value > max ? max : e.target.value)} className="h-8 w-[150px] text-[13px]" />
      <Button variant="outline" size="icon-sm" onClick={() => onChange(shiftMonth(month, 1))} disabled={month >= max} aria-label="Next month">
        <ChevronRight />
      </Button>
    </div>
  );
}

/** Every day of the month, so early-month charts keep their scale. */
function fullMonth(month: string, daily: { day: string; value: number }[]) {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const byDay = new Map(daily.map((d) => [d.day.slice(0, 10), d.value]));
  return Array.from({ length: days }, (_, i) => {
    const day = `${month}-${String(i + 1).padStart(2, '0')}`;
    return { day, value: byDay.get(day) ?? 0 };
  });
}

type AiTenantRow = PlatformAiUsageReport['byTenant'][number];

function AiTab() {
  const [month, setMonth] = useState(currentMonth);
  const q = usePlatformAiUsage(month);
  const r = q.data;
  const failRate = r && r.calls ? (r.failures / r.calls) * 100 : 0;

  const columns: Column<AiTenantRow>[] = [
    {
      key: 'school',
      header: 'School',
      cell: (x) =>
        x.tenant ? (
          <SchoolCell school={x.tenant} />
        ) : (
          <span className="text-muted-foreground">
            Console <span className="text-[11.5px]">(platform briefings and support assist)</span>
          </span>
        ),
    },
    { key: 'calls', header: 'Calls', className: 'tabular text-right', headClassName: 'text-right', cell: (x) => formatNumber(x.calls) },
    { key: 'usd', header: 'Spend', className: 'tabular text-right font-medium', headClassName: 'text-right', cell: (x) => usd(x.usd) },
    {
      key: 'budget',
      header: 'Budget used',
      cell: (x) =>
        x.budgetUsd == null ? (
          <Muted>{x.tenant ? 'No budget' : '—'}</Muted>
        ) : (
          <div className="w-44">
            <div className="flex items-baseline justify-between gap-2 text-[12px] tabular">
              <span className={cn('font-medium', (x.budgetUsedPct ?? 0) >= 100 ? 'text-danger' : (x.budgetUsedPct ?? 0) >= 85 ? 'text-warning' : '')}>{x.budgetUsedPct ?? 0}%</span>
              <span className="text-muted-foreground">of {usd(x.budgetUsd)}</span>
            </div>
            <Meter pct={x.budgetUsedPct} className="mt-1" label="Budget used" />
          </div>
        ),
    },
  ];

  return (
    <div className={cn('space-y-5 transition-opacity', q.isPlaceholderData && 'opacity-60')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          {monthShort(month, true)} · prices in US dollars
        </p>
        <MonthPicker month={month} onChange={setMonth} />
      </div>
      {q.error && !r ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
            <Kpi icon={Bot} label="Total spend" loading={!r} value={usd(r?.totalUsd)} />
            <Kpi icon={Activity} label="Calls" loading={!r} value={formatNumber(r?.calls ?? 0)} />
            <Kpi icon={AlertTriangle} label="Failures" loading={!r} value={formatNumber(r?.failures ?? 0)} sub={`${failRate.toFixed(1)}% of calls`} tone={failRate >= 5 ? 'danger' : failRate > 0 ? 'warning' : undefined} />
            <Kpi icon={Layers} label="Tokens" loading={!r} value={formatCompact((r?.inputTokens ?? 0) + (r?.outputTokens ?? 0))} sub={r ? `${formatCompact(r.inputTokens)} in · ${formatCompact(r.outputTokens)} out` : undefined} />
          </div>
          <Section title="Daily spend">
            <div className="h-[220px]">{!r ? <Skeleton className="h-full w-full rounded-xl" /> : <DailyBars data={fullMonth(r.month, r.daily)} label="Spend" format={(v) => (v < 1 ? `$${v.toFixed(2)}` : `$${formatCompact(v)}`)} />}</div>
          </Section>
          <Card className="overflow-hidden">
            <div className="px-5 pb-3 pt-5 sm:px-6">
              <h3 className="font-display text-[15px] font-semibold tracking-tight">By school</h3>
              <p className="mt-1 text-[13px] text-muted-foreground">Spend against each school’s monthly AI budget</p>
            </div>
            <DataTable
              columns={columns}
              rows={r?.byTenant}
              rowKey={(x) => x.tenant?.id ?? 'console'}
              loading={!r}
              renderMobile={(x) => (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-[14px] font-medium">{x.tenant?.name ?? 'Console'}</span>
                    <span className="font-medium tabular">{usd(x.usd)}</span>
                  </div>
                  {x.budgetUsd != null && <Meter pct={x.budgetUsedPct} label="Budget used" />}
                  <p className="text-[12px] text-muted-foreground">
                    {formatNumber(x.calls)} calls{x.budgetUsd != null ? ` · ${x.budgetUsedPct}% of ${usd(x.budgetUsd)}` : ''}
                  </p>
                </div>
              )}
              empty={{ icon: Bot, title: 'No AI use this month' }}
            />
          </Card>
          <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
            <Breakdown icon={Cpu} title="By model" rows={r?.byModel.map((m) => ({ key: `${m.provider}:${m.model}`, label: m.model, sub: titleCase(m.provider), usd: m.usd, calls: m.calls }))} />
            <Breakdown icon={Bot} title="By agent" rows={r?.byAgent.map((a) => ({ key: a.agent, label: titleCase(a.agent.replace(/[-_]/g, ' ')), usd: a.usd, calls: a.calls }))} />
          </div>
        </>
      )}
    </div>
  );
}

function Breakdown({ icon: Icon, title, rows }: { icon: typeof Cpu; title: string; rows?: { key: string; label: string; sub?: string; usd: number; calls: number }[] }) {
  const max = Math.max(0, ...(rows ?? []).map((r) => r.usd));
  return (
    <Section
      title={
        <>
          <Icon className="size-4 text-muted-foreground" /> {title}
        </>
      }
    >
      {!rows ? (
        <Skeleton className="h-24 w-full" />
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-muted-foreground">Nothing this month.</p>
      ) : (
        <ul className="space-y-3">
          {rows.slice(0, 10).map((r) => (
            <li key={r.key}>
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate font-medium">
                  {r.label}
                  {r.sub && <span className="ml-1.5 text-[11.5px] font-normal text-muted-foreground">{r.sub}</span>}
                </span>
                <span className="shrink-0 font-semibold tabular">{usd(r.usd)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-chart-1" style={{ width: `${max > 0 ? Math.max(2, (r.usd / max) * 100) : 0}%` }} />
              </div>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">{formatNumber(r.calls)} calls</p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------ API

type ApiTenantRow = ApiUsageReport['byTenant'][number];

function ApiTab() {
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const q = useApiUsage(Number(days));
  const r = q.data;
  const errRate = r && r.requests ? (r.serverErrors / r.requests) * 100 : 0;
  const rows = useMemo(() => r?.byTenant, [r]);

  const columns: Column<ApiTenantRow>[] = [
    { key: 'school', header: 'School', cell: (x) => (x.tenant ? <SchoolCell school={x.tenant} /> : <span className="text-muted-foreground">Signed-out &amp; console</span>) },
    { key: 'req', header: 'Requests', className: 'tabular text-right font-medium', headClassName: 'text-right', cell: (x) => formatNumber(x.requests) },
    { key: '4xx', header: '4xx', className: 'tabular text-right', headClassName: 'text-right', cell: (x) => (x.clientErrors ? formatNumber(x.clientErrors) : <Muted>0</Muted>) },
    {
      key: '5xx',
      header: '5xx',
      className: 'tabular text-right',
      headClassName: 'text-right',
      cell: (x) => (x.serverErrors ? <span className="font-medium text-danger">{formatNumber(x.serverErrors)}</span> : <Muted>0</Muted>),
    },
    { key: 'avg', header: 'Avg ms', className: 'tabular text-right', headClassName: 'text-right', cell: (x) => formatNumber(x.avgMs) },
    { key: 'max', header: 'Max ms', className: 'tabular text-right', headClassName: 'text-right', cell: (x) => <span className={x.maxMs >= 5000 ? 'text-warning' : ''}>{formatNumber(x.maxMs)}</span> },
  ];

  return (
    <div className={cn('space-y-5 transition-opacity', q.isPlaceholderData && 'opacity-60')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">Requests to the API, grouped by school</p>
        <Segmented
          label="Period"
          size="sm"
          value={days}
          onChange={setDays}
          options={[
            { value: '7', label: '7 days' },
            { value: '30', label: '30 days' },
            { value: '90', label: '90 days' },
          ]}
        />
      </div>
      {q.error && !r ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
            <Kpi label="Requests" loading={!r} value={formatNumber(r?.requests ?? 0)} />
            <Kpi label="Client errors (4xx)" loading={!r} value={formatNumber(r?.clientErrors ?? 0)} />
            <Kpi label="Server errors (5xx)" loading={!r} value={formatNumber(r?.serverErrors ?? 0)} sub={`${errRate.toFixed(2)}% of requests`} tone={errRate >= 1 ? 'danger' : undefined} />
            <Kpi label="Average response" loading={!r} value={`${formatNumber(r?.avgMs ?? 0)} ms`} />
          </div>
          <Section
            title="Daily requests"
            description={
              <span className="inline-flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-chart-1" /> Requests
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-0.5 w-3 rounded bg-danger" /> 5xx errors
                </span>
              </span>
            }
          >
            <div className="h-[240px]">{!r ? <Skeleton className="h-full w-full rounded-xl" /> : <RequestsChart data={r.daily} />}</div>
          </Section>
          <Card className="overflow-hidden">
            <Toolbar className="border-b-0 pb-0">
              <h3 className="font-display text-[15px] font-semibold tracking-tight">By school</h3>
            </Toolbar>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(x) => x.tenant?.id ?? 'anon'}
              loading={!r}
              renderMobile={(x) => (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{x.tenant?.name ?? 'Signed-out & console'}</p>
                    <p className="text-[12px] text-muted-foreground tabular">
                      {formatNumber(x.avgMs)} ms avg · {formatNumber(x.maxMs)} ms max
                    </p>
                  </div>
                  <div className="text-right tabular">
                    <p className="font-medium">{formatNumber(x.requests)}</p>
                    {x.serverErrors > 0 && <p className="text-[12px] text-danger">{x.serverErrors} 5xx</p>}
                  </div>
                </div>
              )}
              empty={{ icon: Activity, title: 'No traffic recorded in this period' }}
            />
          </Card>
        </>
      )}
    </div>
  );
}
