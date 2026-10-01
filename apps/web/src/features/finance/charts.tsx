import { EXPENSE_CATEGORIES } from '@aischool/shared';
import { useId } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDate } from '@/lib/format';
import { compactMoney, money, monthLabel } from './ui';

function safeId(raw: string) {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '');
}

function Tip({ title, rows }: { title?: string; rows: { name: string; value: string; color: string }[] }) {
  return (
    <div className="min-w-[170px] rounded-xl border border-border bg-popover/95 px-3 py-2.5 text-[12px] shadow-pop backdrop-blur">
      {title && <p className="mb-1.5 font-medium text-foreground">{title}</p>}
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: r.color }} aria-hidden />
            <span className="text-muted-foreground">{r.name}</span>
            <span className="ml-auto font-medium tabular text-foreground">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const shortDate = (iso: string) => formatDate(iso, { day: 'numeric', month: 'short', year: undefined });

/** Money collected per day (area), with a running cumulative line hidden in the tooltip. */
export function DailyCollectionsChart({ data, currency }: { data: { date: string; amountKobo: number }[]; currency: string }) {
  const id = safeId(useId());
  let running = 0;
  const rows = data.map((d) => {
    running += d.amountKobo;
    return { ...d, cumulative: running };
  });
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`col${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-4)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 4" />
        <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} axisLine={false} tickMargin={10} minTickGap={24} fontSize={11} />
        <YAxis tickFormatter={(v: number) => compactMoney(v, currency)} tickLine={false} axisLine={false} tickMargin={6} width={64} fontSize={11} />
        <Tooltip
          cursor={{ stroke: 'var(--border-strong)', strokeDasharray: '4 4' }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]?.payload as { amountKobo: number; cumulative: number } | undefined;
            if (!row) return null;
            return (
              <Tip
                title={formatDate(String(label), { weekday: 'short', day: 'numeric', month: 'short', year: undefined })}
                rows={[
                  { name: 'Collected', value: money(row.amountKobo, currency), color: 'var(--chart-4)' },
                  { name: 'Term to date', value: money(row.cumulative, currency), color: 'var(--border-strong)' },
                ]}
              />
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="amountKobo"
          stroke="var(--chart-4)"
          strokeWidth={2.25}
          fill={`url(#col${id})`}
          activeDot={{ r: 4.5, strokeWidth: 2, stroke: 'var(--card)' }}
          animationDuration={900}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function MoneyDonut({ data, currency }: { data: { name: string; value: number; color: string }[]; currency: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length ? (
              <Tip
                rows={payload.map((p) => ({
                  name: String(p.name),
                  value: money(Number(p.value), currency),
                  color: (p.payload as { color: string }).color,
                }))}
              />
            ) : null
          }
        />
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="96%" paddingAngle={3} cornerRadius={6} stroke="none" animationDuration={900}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Income vs expenditure, grouped by month. */
export function IncomeExpenseChart({ data, currency }: { data: { month: string; incomeKobo: number; expenseKobo: number }[]; currency: string }) {
  const id = safeId(useId());
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={4} barCategoryGap="26%">
        <defs>
          <linearGradient id={`inc${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-4)" />
            <stop offset="100%" stopColor="color-mix(in oklab, var(--chart-4) 70%, var(--chart-2))" />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 4" />
        <XAxis dataKey="month" tickFormatter={(m: string) => monthLabel(m)} tickLine={false} axisLine={false} tickMargin={10} interval={0} fontSize={11} />
        <YAxis tickFormatter={(v: number) => compactMoney(v, currency)} tickLine={false} axisLine={false} tickMargin={6} width={64} fontSize={11} />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.6, radius: 8 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]?.payload as { incomeKobo: number; expenseKobo: number } | undefined;
            if (!row) return null;
            const net = row.incomeKobo - row.expenseKobo;
            return (
              <Tip
                title={monthLabel(String(label), true)}
                rows={[
                  { name: 'Income', value: money(row.incomeKobo, currency), color: 'var(--chart-4)' },
                  { name: 'Expenses', value: money(row.expenseKobo, currency), color: 'var(--danger)' },
                  { name: 'Net', value: `${net < 0 ? '−' : ''}${money(Math.abs(net), currency)}`, color: net < 0 ? 'var(--danger)' : 'var(--success)' },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="incomeKobo" name="Income" fill={`url(#inc${id})`} radius={[6, 6, 2, 2]} maxBarSize={28} animationDuration={800} />
        <Bar dataKey="expenseKobo" name="Expenses" fill="var(--danger)" fillOpacity={0.75} radius={[6, 6, 2, 2]} maxBarSize={28} animationDuration={900} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Horizontal share bar (e.g. expenses by category), coloured per segment. */
export function ShareBar({ parts, label }: { parts: { key: string; value: number; color: string }[]; label: string }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  return (
    <div role="img" aria-label={label} className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
      {total > 0 &&
        parts.map((p) =>
          p.value > 0 ? <span key={p.key} className="h-full transition-[width] duration-700" style={{ width: `${(p.value / total) * 100}%`, background: p.color }} /> : null,
        )}
    </div>
  );
}

export const CATEGORY_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--danger)', 'var(--info)', 'var(--warning)', 'var(--border-strong)'];

export function categoryColor(cat: string): string {
  const i = EXPENSE_CATEGORIES.indexOf(cat as (typeof EXPENSE_CATEGORIES)[number]);
  return CATEGORY_COLORS[Math.max(0, i) % CATEGORY_COLORS.length];
}
