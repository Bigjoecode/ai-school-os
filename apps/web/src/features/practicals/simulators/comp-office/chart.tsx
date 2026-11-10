import type { CoChart } from '@aischool/shared';

/** A chart as the spreadsheet draws it; it recomputes from the sheet, so it redraws when the data changes. */

const PALETTE = ['#2563eb', '#ea580c', '#16a34a', '#9333ea', '#dc2626', '#0891b2', '#ca8a04'];
const W = 280;
const H = 190;

function pieSlices(data: { label: string; value: number }[]) {
  const total = data.reduce((t, d) => t + Math.max(0, d.value), 0) || 1;
  let a0 = -Math.PI / 2;
  return data.map((d, i) => {
    const frac = Math.max(0, d.value) / total;
    const a1 = a0 + frac * 2 * Math.PI;
    const big = a1 - a0 > Math.PI ? 1 : 0;
    const R = 62;
    const cx = 90;
    const cy = 105;
    const path = frac >= 0.9999 ? `M ${cx - R} ${cy} A ${R} ${R} 0 1 1 ${cx + R} ${cy} A ${R} ${R} 0 1 1 ${cx - R} ${cy}` : `M ${cx} ${cy} L ${cx + R * Math.cos(a0)} ${cy + R * Math.sin(a0)} A ${R} ${R} 0 ${big} 1 ${cx + R * Math.cos(a1)} ${cy + R * Math.sin(a1)} Z`;
    const mid = (a0 + a1) / 2;
    a0 = a1;
    return { path, color: PALETTE[i % PALETTE.length]!, lx: cx + R * 0.68 * Math.cos(mid), ly: cy + R * 0.68 * Math.sin(mid), pct: frac * 100, ...d };
  });
}

export function ChartView({ chart, data }: { chart: CoChart; data: { label: string; value: number }[] }) {
  const title = chart.title || 'Chart title';
  if (!data.length) return <div className="grid h-[190px] place-items-center text-[12px] text-slate-500">No numbers in {chart.range}</div>;
  const max = Math.max(...data.map((d) => d.value), 0) || 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${chart.type} chart: ${title}. ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`}>
      <text x={W / 2} y={16} textAnchor="middle" fontSize={12} fontWeight={600} fill="#0f172a">{title.slice(0, 44)}</text>
      {chart.type === 'PIE' && (
        <>
          {pieSlices(data).map((s) => (
            <g key={s.label}>
              <path d={s.path} fill={s.color} stroke="#fff" strokeWidth={1} />
              {chart.labels !== 'NONE' && <text x={s.lx} y={s.ly + 3} textAnchor="middle" fontSize={9} fill="#fff" fontWeight={600}>{chart.labels === 'PERCENT' ? `${Number(s.pct.toFixed(1))}%` : s.value}</text>}
            </g>
          ))}
          {pieSlices(data).map((s, i) => (
            <g key={`k${s.label}`} transform={`translate(170 ${40 + i * 16})`}>
              <rect width={9} height={9} fill={s.color} />
              <text x={13} y={8} fontSize={10} fill="#334155">{s.label.slice(0, 14)}</text>
            </g>
          ))}
        </>
      )}
      {chart.type !== 'PIE' && (
        <>
          <line x1={38} y1={28} x2={38} y2={156} stroke="#94a3b8" />
          <line x1={38} y1={156} x2={272} y2={156} stroke="#94a3b8" />
          {chart.type === 'LINE' && <polyline fill="none" stroke={PALETTE[0]} strokeWidth={2} points={data.map((d, i) => `${38 + ((i + 0.5) * 234) / data.length},${156 - (d.value / max) * 120}`).join(' ')} />}
          {data.map((d, i) => {
            const step = 234 / data.length;
            const h = (Math.max(0, d.value) / max) * 120;
            const x = 38 + i * step + step * 0.15;
            return (
              <g key={d.label + i}>
                {chart.type !== 'LINE' && <rect x={x} y={156 - h} width={step * 0.7} height={h} fill={PALETTE[0]} />}
                <text x={x + step * 0.35} y={167} textAnchor="middle" fontSize={8} fill="#334155">{d.label.slice(0, 8)}</text>
                {chart.labels !== 'NONE' && <text x={x + step * 0.35} y={152 - h} textAnchor="middle" fontSize={8} fill="#0f172a">{chart.labels === 'PERCENT' ? `${Number(((d.value / data.reduce((t, q) => t + q.value, 0)) * 100).toFixed(1))}%` : d.value}</text>}
              </g>
            );
          })}
          <text x={8} y={31} fontSize={8} fill="#64748b">{Number(max.toPrecision(4))}</text>
          <text x={155} y={184} textAnchor="middle" fontSize={10} fill="#334155">{chart.xTitle}</text>
          <text transform="translate(10 95) rotate(-90)" textAnchor="middle" fontSize={10} fill="#334155">{chart.yTitle}</text>
        </>
      )}
    </svg>
  );
}
