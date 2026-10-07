import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCompact, formatNumber } from '@/lib/format';
import { weekLabel } from './api';

interface TipRow {
  name: string;
  value: string;
  color: string;
}

function Tip({ title, rows }: { title: string; rows: TipRow[] }) {
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
const weekOf = (w: string) => `Week of ${weekLabel(w)}`;

/** One weekly count as bars (used as small multiples, one measure per chart). */
export function WeekBars({
  data,
  label,
  color = 'var(--chart-1)',
  format = (v: number) => formatNumber(v),
}: {
  data: { week: string; value: number | null }[];
  label: string;
  color?: string;
  format?: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 6, right: 2, left: 0, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--chart-grid)" />
        <XAxis dataKey="week" {...axis} tickMargin={6} tickFormatter={weekLabel} minTickGap={10} />
        <YAxis {...axis} tickMargin={4} width={36} allowDecimals={false} tickFormatter={(v: number) => (v === 0 ? '0' : formatCompact(v))} />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.6, radius: 4 }}
          content={({ active, payload }) => {
            const p = active ? (payload?.[0]?.payload as { week: string; value: number | null } | undefined) : undefined;
            return p ? <Tip title={weekOf(p.week)} rows={[{ name: label, value: p.value == null ? '—' : format(p.value), color }]} /> : null;
          }}
        />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={26} animationDuration={600} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface LineSeries {
  key: string;
  label: string;
  color: string;
}

/** A few weekly series on one shared scale (e.g. % of staff, parents and students active). */
export function WeekLines({
  data,
  series,
  format = (v: number) => formatNumber(v),
  domain,
}: {
  data: Record<string, number | string | null>[];
  series: LineSeries[];
  format?: (v: number) => string;
  domain?: [number, number];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--chart-grid)" />
        <XAxis dataKey="week" {...axis} tickMargin={8} tickFormatter={(w: string) => weekLabel(w)} minTickGap={10} />
        <YAxis {...axis} tickMargin={4} width={44} domain={domain} tickFormatter={(v: number) => format(v)} />
        <Tooltip
          cursor={{ stroke: 'var(--border-strong)', strokeDasharray: '4 4' }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <Tip
                title={weekOf(String(label))}
                rows={series.map((s) => {
                  const v = (payload[0]?.payload as Record<string, number | null>)[s.key];
                  return { name: s.label, value: v == null ? '—' : format(v), color: s.color };
                })}
              />
            ) : null
          }
        />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 2, stroke: 'var(--card)', fill: s.color }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--card)' }}
            connectNulls
            animationDuration={700}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Legend for a multi-series chart (identity never by colour alone: each swatch is labelled). */
export function ChartLegend({ series }: { series: LineSeries[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="h-0.5 w-3.5 rounded-full" style={{ background: s.color }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}
