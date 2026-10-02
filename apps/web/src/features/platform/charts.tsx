import { useId } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCompact, formatNumber } from '@/lib/format';
import { dayLabel } from './ui';

interface Row {
  name: string;
  value: string;
  color: string;
}

function Tip({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="min-w-[150px] rounded-xl border border-border bg-popover/95 px-3 py-2.5 text-[12px] shadow-pop backdrop-blur">
      <p className="mb-1.5 font-medium text-foreground">{title}</p>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: r.color }} aria-hidden />
            <span className="text-muted-foreground">{r.name}</span>
            <span className="ml-auto pl-3 font-medium tabular text-foreground">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const axis = { tickLine: false, axisLine: false, fontSize: 11 } as const;

/** Monthly counts (signups, admissions). */
export function MonthBars({
  data,
  label,
  format = (v: number) => formatNumber(v),
  color = 'var(--chart-1)',
  monthFmt,
}: {
  data: { month: string; value: number }[];
  label: string;
  format?: (v: number) => string;
  color?: string;
  monthFmt: (m: string, long?: boolean) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barCategoryGap="26%">
        <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--chart-grid)" />
        <XAxis dataKey="month" {...axis} tickMargin={8} tickFormatter={(m: string) => monthFmt(m)} minTickGap={4} />
        <YAxis {...axis} tickMargin={6} width={44} allowDecimals={false} tickFormatter={(v: number) => (v === 0 ? '0' : formatCompact(v))} />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.6, radius: 6 }}
          content={({ active, payload }) => {
            const p = active ? (payload?.[0]?.payload as { month: string; value: number } | undefined) : undefined;
            return p ? <Tip title={monthFmt(p.month, true)} rows={[{ name: label, value: format(p.value), color }]} /> : null;
          }}
        />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={700} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Monthly money (revenue collected), as an area. */
export function MonthArea({
  data,
  label,
  format,
  axisFormat,
  monthFmt,
}: {
  data: { month: string; value: number }[];
  label: string;
  format: (v: number) => string;
  axisFormat: (v: number) => string;
  monthFmt: (m: string, long?: boolean) => string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 6, left: -4, bottom: 0 }}>
        <defs>
          <linearGradient id={`rev${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-4)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--chart-grid)" />
        <XAxis dataKey="month" {...axis} tickMargin={8} tickFormatter={(m: string) => monthFmt(m)} minTickGap={4} />
        <YAxis {...axis} tickMargin={6} width={56} tickFormatter={axisFormat} />
        <Tooltip
          cursor={{ stroke: 'var(--border-strong)', strokeDasharray: '4 4' }}
          content={({ active, payload }) => {
            const p = active ? (payload?.[0]?.payload as { month: string; value: number } | undefined) : undefined;
            return p ? <Tip title={monthFmt(p.month, true)} rows={[{ name: label, value: format(p.value), color: 'var(--chart-4)' }]} /> : null;
          }}
        />
        <Area type="monotone" dataKey="value" stroke="var(--chart-4)" strokeWidth={2} fill={`url(#rev${id})`} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} animationDuration={800} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Daily values (AI spend). */
export function DailyBars({ data, label, format }: { data: { day: string; value: number }[]; label: string; format: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--chart-grid)" />
        <XAxis dataKey="day" {...axis} tickMargin={8} minTickGap={12} tickFormatter={(d: string) => String(Number(d.slice(8, 10)))} />
        <YAxis {...axis} tickMargin={6} width={52} tickFormatter={(v: number) => (v === 0 ? '0' : format(v))} />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.6, radius: 6 }}
          content={({ active, payload }) => {
            const p = active ? (payload?.[0]?.payload as { day: string; value: number } | undefined) : undefined;
            return p ? <Tip title={dayLabel(p.day)} rows={[{ name: label, value: format(p.value), color: 'var(--chart-1)' }]} /> : null;
          }}
        />
        <Bar dataKey="value" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={20} animationDuration={700} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Daily API requests with server errors on a second axis. */
export function RequestsChart({ data }: { data: { day: string; requests: number; serverErrors: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 0, left: -8, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--chart-grid)" />
        <XAxis dataKey="day" {...axis} tickMargin={8} minTickGap={16} tickFormatter={dayLabel} />
        <YAxis yAxisId="r" {...axis} tickMargin={6} width={48} allowDecimals={false} tickFormatter={(v: number) => (v === 0 ? '0' : formatCompact(v))} />
        <YAxis yAxisId="e" orientation="right" {...axis} tickMargin={6} width={36} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.6, radius: 6 }}
          content={({ active, payload }) => {
            const p = active ? (payload?.[0]?.payload as { day: string; requests: number; serverErrors: number } | undefined) : undefined;
            return p ? (
              <Tip
                title={dayLabel(p.day)}
                rows={[
                  { name: 'Requests', value: formatNumber(p.requests), color: 'var(--chart-1)' },
                  { name: '5xx errors', value: formatNumber(p.serverErrors), color: 'var(--danger)' },
                ]}
              />
            ) : null;
          }}
        />
        <Bar yAxisId="r" dataKey="requests" fill="var(--chart-1)" fillOpacity={0.85} radius={[3, 3, 0, 0]} maxBarSize={20} animationDuration={700} />
        <Line yAxisId="e" dataKey="serverErrors" stroke="var(--danger)" strokeWidth={1.75} dot={false} type="monotone" animationDuration={700} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
