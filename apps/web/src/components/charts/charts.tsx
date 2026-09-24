import { useId } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatNumber } from '@/lib/format';

interface TooltipRow {
  name: string;
  value: number | null;
  color: string;
}

function TooltipCard({ title, rows }: { title?: string; rows: TooltipRow[] }) {
  return (
    <div className="min-w-[150px] rounded-xl border border-border bg-popover/95 px-3 py-2.5 text-[12px] shadow-pop backdrop-blur">
      {title && <p className="mb-1.5 font-medium text-foreground">{title}</p>}
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: r.color }} aria-hidden />
            <span className="text-muted-foreground">{r.name}</span>
            <span className="ml-auto font-medium tabular text-foreground">{r.value == null ? '—' : formatNumber(r.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function safeId(raw: string) {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '');
}

// ------------------------------------------------------------------ area
export function EnrolmentAreaChart({ data }: { data: { month: string; admitted: number; total: number }[] }) {
  const id = safeId(useId());
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id={`total${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`adm${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 4" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={10} minTickGap={16} />
        <YAxis tickLine={false} axisLine={false} tickMargin={6} width={48} allowDecimals={false} />
        <Tooltip
          cursor={{ stroke: 'var(--border-strong)', strokeDasharray: '4 4' }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TooltipCard
                title={String(label)}
                rows={payload.map((p) => ({
                  name: p.dataKey === 'total' ? 'Total students' : 'Admitted',
                  value: typeof p.value === 'number' ? p.value : Number(p.value),
                  color: p.dataKey === 'total' ? 'var(--chart-1)' : 'var(--chart-2)',
                }))}
              />
            ) : null
          }
        />
        <Area
          type="monotone"
          dataKey="total"
          stroke="var(--chart-1)"
          strokeWidth={2.25}
          fill={`url(#total${id})`}
          activeDot={{ r: 4.5, strokeWidth: 2, stroke: 'var(--card)' }}
          animationDuration={900}
        />
        <Area
          type="monotone"
          dataKey="admitted"
          stroke="var(--chart-2)"
          strokeWidth={2}
          fill={`url(#adm${id})`}
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
          animationDuration={900}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ------------------------------------------------------------------ bars
export function ClassLevelBarChart({ data }: { data: { level: string; students: number; capacity: number | null }[] }) {
  const id = safeId(useId());
  const hasCapacity = data.some((d) => d.capacity != null);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barGap={-22} barCategoryGap="28%">
        <defs>
          <linearGradient id={`bar${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-3)" />
            <stop offset="100%" stopColor="var(--chart-1)" />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 4" />
        <XAxis dataKey="level" tickLine={false} axisLine={false} tickMargin={10} interval={0} fontSize={11} />
        <YAxis tickLine={false} axisLine={false} tickMargin={6} width={48} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.6, radius: 8 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]?.payload as { students: number; capacity: number | null } | undefined;
            if (!row) return null;
            const rows: TooltipRow[] = [{ name: 'Students', value: row.students, color: 'var(--chart-1)' }];
            if (row.capacity != null) rows.push({ name: 'Capacity', value: row.capacity, color: 'var(--border-strong)' });
            return <TooltipCard title={String(label)} rows={rows} />;
          }}
        />
        {hasCapacity && (
          <Bar dataKey="capacity" fill="var(--muted)" stroke="var(--border-strong)" strokeDasharray="3 3" radius={[8, 8, 4, 4]} barSize={22} animationDuration={700} />
        )}
        <Bar dataKey="students" fill={`url(#bar${id})`} radius={[8, 8, 4, 4]} barSize={22} animationDuration={900} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ------------------------------------------------------------------ donut
export function DonutChart({ data }: { data: { name: string; value: number; color: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipCard
                rows={payload.map((p) => ({
                  name: String(p.name),
                  value: typeof p.value === 'number' ? p.value : Number(p.value),
                  color: (p.payload as { color: string }).color,
                }))}
              />
            ) : null
          }
        />
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="68%"
          outerRadius="96%"
          paddingAngle={3}
          cornerRadius={6}
          stroke="none"
          animationDuration={900}
        >
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

// ------------------------------------------------------------------ sparkline
export function Sparkline({ data, color = 'var(--chart-1)' }: { data: number[]; color?: string }) {
  const id = safeId(useId());
  const points = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`sp${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.75} fill={`url(#sp${id})`} dot={false} isAnimationActive animationDuration={900} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
