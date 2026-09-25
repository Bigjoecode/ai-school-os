import { useId } from 'react';
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDate } from '@/lib/format';
import { fmtRate, rateTone, toneColor, WEEKDAY_SHORT } from './ui';

function safeId(raw: string) {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '');
}

function Tip({ title, rows }: { title: string; rows: { name: string; value: string; color: string }[] }) {
  return (
    <div className="min-w-[160px] rounded-xl border border-border bg-popover/95 px-3 py-2.5 text-[12px] shadow-pop backdrop-blur">
      <p className="mb-1.5 font-medium text-foreground">{title}</p>
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

/** Daily attendance rate (area) with the number of registers taken (bars) behind it. */
export function DailyTrendChart({ data }: { data: { date: string; rate: number | null; registers: number }[] }) {
  const id = safeId(useId());
  const rates = data.map((d) => d.rate).filter((r): r is number => r != null);
  const floor = rates.length ? Math.max(0, Math.floor((Math.min(...rates) - 5) / 5) * 5) : 0;
  const maxRegisters = Math.max(1, ...data.map((d) => d.registers));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id={`rate${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 4" />
        <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} axisLine={false} tickMargin={10} minTickGap={24} fontSize={11} />
        <YAxis yAxisId="rate" domain={[floor, 100]} tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} tickMargin={6} width={48} />
        <YAxis yAxisId="reg" orientation="right" hide domain={[0, maxRegisters * 3]} />
        <Tooltip
          cursor={{ stroke: 'var(--border-strong)', strokeDasharray: '4 4' }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]?.payload as { rate: number | null; registers: number } | undefined;
            if (!row) return null;
            return (
              <Tip
                title={formatDate(String(label), { weekday: 'short', day: 'numeric', month: 'short', year: undefined })}
                rows={[
                  { name: 'Attendance', value: fmtRate(row.rate), color: 'var(--chart-1)' },
                  { name: 'Registers', value: String(row.registers), color: 'var(--border-strong)' },
                ]}
              />
            );
          }}
        />
        <Bar yAxisId="reg" dataKey="registers" fill="var(--muted)" stroke="var(--border-strong)" radius={[4, 4, 0, 0]} maxBarSize={14} animationDuration={700} />
        <Area
          yAxisId="rate"
          type="monotone"
          dataKey="rate"
          connectNulls
          stroke="var(--chart-1)"
          strokeWidth={2.25}
          fill={`url(#rate${id})`}
          activeDot={{ r: 4.5, strokeWidth: 2, stroke: 'var(--card)' }}
          animationDuration={900}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Attendance rate by weekday, coloured by how healthy it is. */
export function WeekdayBars({ data }: { data: { day: number; rate: number | null }[] }) {
  const rows = data
    .filter((d) => d.day >= 1 && d.day <= 7)
    .sort((a, b) => a.day - b.day)
    .map((d) => ({ label: WEEKDAY_SHORT[d.day], rate: d.rate ?? 0, raw: d.rate }));
  const rates = rows.map((r) => r.raw).filter((r): r is number => r != null);
  const floor = rates.length ? Math.max(0, Math.floor((Math.min(...rates) - 5) / 5) * 5) : 0;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 8, right: 4, left: -12, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid vertical={false} strokeDasharray="3 4" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} interval={0} fontSize={11} />
        <YAxis domain={[floor, 100]} tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} tickMargin={6} width={48} />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.6, radius: 8 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]?.payload as { raw: number | null } | undefined;
            return <Tip title={String(label)} rows={[{ name: 'Attendance', value: fmtRate(row?.raw), color: toneColor[rateTone(row?.raw)] }]} />;
          }}
        />
        <Bar dataKey="rate" radius={[8, 8, 4, 4]} maxBarSize={36} animationDuration={800}>
          {rows.map((r) => (
            <Cell key={r.label} fill={toneColor[rateTone(r.raw)]} fillOpacity={r.raw == null ? 0.3 : 0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
