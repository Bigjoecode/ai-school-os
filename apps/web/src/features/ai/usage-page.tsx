import type { AiUsageReport } from '@aischool/shared';
import { motion } from 'framer-motion';
import { Activity, AlertTriangle, ChevronLeft, ChevronRight, Coins, Cpu, Gauge, Layers, ShieldCheck, Timer, Users } from 'lucide-react';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth-store';
import { formatCompact, formatDateTime, formatNumber } from '@/lib/format';
import { cn, titleCase } from '@/lib/utils';
import { formatUsd, useAiUsage, useSetAiBudget } from './api';

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
}

function formatLatency(ms: number | null) {
  if (ms == null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

export default function UsagePage() {
  const [month, setMonth] = useState(currentMonth);
  const latest = currentMonth();
  const usage = useAiUsage(month);
  const canBudget = useCan('school.manage');
  const r = usage.data;

  return (
    <Page>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <AiSparkle className="size-3.5" /> AI School
          </span>
        }
        title="AI usage"
        description="What your school’s assistants cost, who uses them and how reliably they answer."
        actions={<MonthPicker month={month} max={latest} onChange={setMonth} />}
      />

      {usage.error && !r ? (
        <Card>
          <ErrorState error={usage.error} onRetry={() => void usage.refetch()} />
        </Card>
      ) : (
        <div className={cn('space-y-5 transition-opacity', usage.isPlaceholderData && 'opacity-60')}>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] [&>*]:min-w-0">
            <SpendCard r={r} />
            <div className="grid grid-cols-2 gap-3 sm:gap-5 [&>*]:min-w-0">
              <Stat icon={Activity} label="AI calls" value={r ? formatNumber(r.calls) : undefined} hint="Requests to the AI this month" />
              <Stat
                icon={AlertTriangle}
                label="Failures"
                value={r ? formatNumber(r.failures) : undefined}
                hint={r && r.calls > 0 ? `${((r.failures / r.calls) * 100).toFixed(1)}% of calls` : 'No calls yet'}
                tone={r && r.failures > 0 ? 'danger' : undefined}
              />
              <Stat icon={Timer} label="Average response" value={r ? formatLatency(r.averageLatencyMs) : undefined} hint="Time to answer" />
              <Stat
                icon={Coins}
                label="Tokens"
                value={r ? formatCompact(r.inputTokens + r.outputTokens) : undefined}
                hint={r ? `${formatCompact(r.inputTokens)} in · ${formatCompact(r.outputTokens)} out` : ' '}
              />
            </div>
          </div>

          <Card>
            <CardHeader>
              <div className="min-w-0">
                <CardTitle>Daily spend</CardTitle>
                <CardDescription>{monthLabel(month)}, in US dollars</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[220px] sm:h-[260px]">
                {!r ? (
                  <Skeleton className="h-full w-full rounded-xl" />
                ) : r.calls === 0 ? (
                  <EmptyState compact icon={Gauge} title="No AI use this month" description="Spend will appear here day by day." className="h-full" />
                ) : (
                  <DailyChart data={r.byDay} />
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-5 xl:grid-cols-3 [&>*]:min-w-0">
            <Breakdown
              title="By feature"
              description="Assistants and AI tools"
              icon={Layers}
              rows={r?.byFeature.map((f) => ({ key: f.feature, label: f.label, cost: f.costUsd, calls: f.calls, failures: f.failures }))}
            />
            <Breakdown
              title="By person"
              description="Top 10 this month"
              icon={Users}
              rows={r?.byUser.slice(0, 10).map((u) => ({ key: u.userId ?? u.name, label: u.name, cost: u.costUsd, calls: u.calls }))}
            />
            <Breakdown
              title="By model"
              description="Provider and model"
              icon={Cpu}
              rows={r?.byModel.map((m) => ({
                key: `${m.provider}:${m.model}`,
                label: m.model,
                sub: `${titleCase(m.provider)} · ${formatCompact(m.inputTokens + m.outputTokens)} tokens`,
                cost: m.costUsd,
                calls: m.calls,
              }))}
            />
          </div>

          <div className={cn('grid gap-5 [&>*]:min-w-0', canBudget && 'lg:grid-cols-2')}>
            <FailuresCard r={r} />
            {canBudget && <BudgetCard budget={r?.budgetUsd} loading={!r} />}
          </div>
        </div>
      )}
    </Page>
  );
}

function MonthPicker({ month, max, onChange }: { month: string; max: string; onChange: (m: string) => void }) {
  const id = useId();
  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="icon" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month">
        <ChevronLeft />
      </Button>
      <label htmlFor={id} className="sr-only">
        Month
      </label>
      <Input
        id={id}
        type="month"
        value={month}
        max={max}
        onChange={(e) => e.target.value && onChange(e.target.value > max ? max : e.target.value)}
        className="h-9 w-[160px]"
      />
      <Button variant="outline" size="icon" onClick={() => onChange(shiftMonth(month, 1))} disabled={month >= max} aria-label="Next month">
        <ChevronRight />
      </Button>
    </div>
  );
}

function SpendCard({ r }: { r?: AiUsageReport }) {
  const pct = r?.budgetUsd ? Math.min(100, (r.spendUsd / r.budgetUsd) * 100) : null;
  const over = pct != null && pct >= 100;
  const near = pct != null && pct >= 85;
  return (
    <Card className="ai-border relative overflow-hidden border-transparent">
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 size-60 rounded-full bg-ai-2/15 blur-3xl" />
      <div className="relative flex items-center gap-5 p-5 sm:gap-6 sm:p-6">
        <Ring pct={pct} tone={over ? 'danger' : near ? 'warning' : 'ai'} />
        <div className="min-w-0">
          <p className="text-[12.5px] font-medium text-muted-foreground">Spend this month</p>
          {r ? (
            <p className="mt-1 font-display text-[28px] font-semibold leading-none tracking-tight tabular sm:text-[32px]">{formatUsd(r.spendUsd)}</p>
          ) : (
            <Skeleton className="mt-1.5 h-8 w-28" />
          )}
          <p className="mt-2 text-[12.5px] text-muted-foreground">
            {!r ? ' ' : r.budgetUsd != null ? (
              <>
                of a <span className="font-medium text-foreground">{formatUsd(r.budgetUsd)}</span> monthly budget
              </>
            ) : (
              'No monthly budget set'
            )}
          </p>
          {over && <p className="mt-1.5 text-[12px] font-medium text-danger">Budget used up — AI requests are paused until next month.</p>}
          {!over && near && <p className="mt-1.5 text-[12px] font-medium text-warning">Nearly at this month’s budget.</p>}
        </div>
      </div>
    </Card>
  );
}

function Ring({ pct, tone }: { pct: number | null; tone: 'ai' | 'warning' | 'danger' }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const size = 92;
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label={pct == null ? 'No budget set' : `${Math.round(pct)}% of budget used`}>
        <defs>
          <linearGradient id={`ring${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--ai-1)" />
            <stop offset="100%" stopColor="var(--ai-3)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        {pct != null && (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={tone === 'danger' ? 'var(--danger)' : tone === 'warning' ? 'var(--warning)' : `url(#ring${id})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: circ * (1 - Math.max(pct, 0.5) / 100) }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          />
        )}
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[13px] font-semibold tabular">{pct == null ? '—' : `${Math.round(pct)}%`}</span>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint, tone }: { icon: typeof Activity; label: string; value?: string; hint: string; tone?: 'danger' }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
        <Icon className={cn('size-4 shrink-0', tone === 'danger' && 'text-danger')} aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      {value == null ? (
        <Skeleton className="mt-2 h-7 w-16" />
      ) : (
        <p className="mt-1.5 truncate font-display text-[22px] font-semibold tracking-tight tabular sm:text-2xl">{value}</p>
      )}
      <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{hint}</p>
    </Card>
  );
}

function DailyChart({ data }: { data: AiUsageReport['byDay'] }) {
  const rows = data.map((d) => ({ ...d, day: Number(d.date.slice(8, 10)) }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} strokeDasharray="3 4" />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={8} fontSize={11} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          width={52}
          fontSize={11}
          tickFormatter={(v: number) => (v === 0 ? '$0' : v < 1 ? `$${v.toFixed(2)}` : `$${formatCompact(v)}`)}
        />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.6, radius: 6 }}
          content={({ active, payload }) => {
            const p = active ? (payload?.[0]?.payload as (typeof rows)[number] | undefined) : undefined;
            if (!p) return null;
            return (
              <div className="min-w-[150px] rounded-xl border border-border bg-popover/95 px-3 py-2.5 text-[12px] shadow-pop backdrop-blur">
                <p className="mb-1.5 font-medium text-foreground">
                  {new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${p.date}T00:00:00`))}
                </p>
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-chart-1" aria-hidden />
                  <span className="text-muted-foreground">Spend</span>
                  <span className="ml-auto font-medium tabular text-foreground">{formatUsd(p.costUsd)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="size-2" aria-hidden />
                  <span className="text-muted-foreground">Calls</span>
                  <span className="ml-auto font-medium tabular text-foreground">{formatNumber(p.calls)}</span>
                </div>
              </div>
            );
          }}
        />
        <Bar dataKey="costUsd" name="Spend" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={22} animationDuration={700} />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface BreakdownRow {
  key: string;
  label: string;
  sub?: string;
  cost: number;
  calls: number;
  failures?: number;
}

function Breakdown({ title, description, icon: Icon, rows }: { title: string; description: string; icon: typeof Activity; rows?: BreakdownRow[] }) {
  const max = Math.max(0, ...(rows ?? []).map((r) => r.cost));
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <Icon className="size-4 text-muted-foreground" aria-hidden /> {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {!rows ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">Nothing yet this month.</p>
        ) : (
          <ul className="space-y-3.5">
            {rows.map((r) => (
              <li key={r.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[13px] font-medium">{r.label}</span>
                  <span className="shrink-0 text-[13px] font-semibold tabular">{formatUsd(r.cost)}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-chart-1" style={{ width: `${max > 0 ? Math.max(2, (r.cost / max) * 100) : 0}%` }} />
                </div>
                <p className="mt-1 truncate text-[11.5px] text-muted-foreground">
                  {r.sub ? `${r.sub} · ` : ''}
                  {formatNumber(r.calls)} {r.calls === 1 ? 'call' : 'calls'}
                  {r.failures ? <span className="text-danger"> · {formatNumber(r.failures)} failed</span> : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function FailuresCard({ r }: { r?: AiUsageReport }) {
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-muted-foreground" aria-hidden /> Recent failures
          </CardTitle>
          <CardDescription>Requests the AI couldn’t complete</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {!r ? (
          <Skeleton className="h-24 w-full" />
        ) : r.recentFailures.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-background/50 p-4 text-[13px] text-muted-foreground">
            <ShieldCheck className="size-5 shrink-0 text-success" aria-hidden /> No failures this month — every request was answered.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {r.recentFailures.map((f, i) => (
              <li key={`${f.at}-${i}`} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[13px] font-medium">{f.feature}</span>
                  <time className="shrink-0 text-[11.5px] text-muted-foreground" dateTime={f.at}>
                    {formatDateTime(f.at)}
                  </time>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground [overflow-wrap:anywhere]">
                  <span className="font-mono">{f.provider}</span>
                  {f.error ? ` — ${f.error}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function BudgetCard({ budget, loading }: { budget: number | null | undefined; loading: boolean }) {
  const save = useSetAiBudget();
  const [value, setValue] = useState('');
  useEffect(() => {
    if (budget !== undefined) setValue(budget == null ? '' : String(budget));
  }, [budget]);
  const parsed = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= 100_000;
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) save.mutate(Math.round(parsed * 100) / 100);
  };
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <Gauge className="size-4 text-muted-foreground" aria-hidden /> Monthly budget
          </CardTitle>
          <CardDescription>A ceiling on what your school spends on AI each month.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Budget (US dollars)" htmlFor="ai-budget" hint="Leave the plan default in place unless you want a different limit.">
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-0 flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-muted-foreground">$</span>
                <Input
                  id="ai-budget"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100000}
                  step="0.01"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  disabled={loading}
                  className="pl-7 tabular"
                  placeholder="50"
                />
              </div>
              <Button type="submit" disabled={!valid || loading} loading={save.isPending && save.variables !== null}>
                Save
              </Button>
            </div>
          </Field>
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/50 p-3.5 text-[12.5px] text-muted-foreground sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1">AI requests are blocked once the month’s budget is used, and start again on the 1st.</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => save.mutate(null)} loading={save.isPending && save.variables === null} className="self-start sm:self-auto">
              Use plan default
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

