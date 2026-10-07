import {
  HEALTH_BAND_LABELS,
  HEALTH_PARTS,
  HEALTH_UPDATES_WINDOW_DAYS,
  HEALTH_WEIGHTS,
  HEALTH_WINDOW_DAYS,
  type HealthBand,
  type HealthPart,
  type SuccessSummary,
} from '@aischool/shared';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { pct } from './api';

export const BAND_VARIANT: Record<HealthBand, 'success' | 'warning' | 'danger'> = { STRONG: 'success', STEADY: 'warning', AT_RISK: 'danger' };
const BAND_STROKE: Record<HealthBand, string> = { STRONG: 'var(--success)', STEADY: 'var(--warning)', AT_RISK: 'var(--danger)' };

export function HealthBadge({ band, className }: { band: HealthBand; className?: string }) {
  return (
    <Badge variant={BAND_VARIANT[band]} dot className={className}>
      {HEALTH_BAND_LABELS[band]}
    </Badge>
  );
}

/** Score out of 100 as a ring; the band is also written beside it (never colour alone). */
export function HealthRing({ score, band, size = 76 }: { score: number; band: HealthBand; size?: number }) {
  const r = 15.5;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 36 36" width={size} height={size} role="img" aria-label={`Health score ${score} out of 100`} className="shrink-0 -rotate-90">
      <circle cx="18" cy="18" r={r} fill="none" stroke="var(--muted)" strokeWidth="3.2" />
      <circle cx="18" cy="18" r={r} fill="none" stroke={BAND_STROKE[band]} strokeWidth="3.2" strokeLinecap="round" strokeDasharray={`${(Math.max(score, 1) / 100) * c} ${c}`} />
      <text x="18" y="18" transform="rotate(90 18 18)" textAnchor="middle" dominantBaseline="central" className="fill-foreground font-display text-[10px] font-semibold">
        {score}
      </text>
    </svg>
  );
}

export function TrendArrow({ now, before, className }: { now: number; before: number | null; className?: string }) {
  if (before == null) return null;
  const d = now - before;
  const Icon = d >= 3 ? ArrowUpRight : d <= -3 ? ArrowDownRight : ArrowRight;
  const label = d >= 3 ? `Up ${d} on last week` : d <= -3 ? `Down ${-d} on last week` : 'About the same as last week';
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[12px] font-medium', d >= 3 ? 'text-success' : d <= -3 ? 'text-danger' : 'text-muted-foreground', className)} title={label}>
      <Icon className="size-3.5" aria-hidden />
      <span>{d > 0 ? `+${d}` : d}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** The health score's parts, each as a share bar with its points, and the formula. */
export function HealthBreakdown({ parts, compact }: { parts: HealthPart[]; compact?: boolean }) {
  const byKey = new Map(parts.map((p) => [p.key, p]));
  let lastGroup = '';
  return (
    <div className="space-y-2.5">
      {HEALTH_PARTS.map((def) => {
        const p = byKey.get(def.key);
        const groupHead = def.group !== lastGroup;
        lastGroup = def.group;
        return (
          <div key={def.key}>
            {groupHead && !compact && <p className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">{def.group}</p>}
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate" title={def.measure}>
                {def.label}
              </span>
              <span className="shrink-0 tabular text-muted-foreground">
                {pct(p?.share ?? null)} · <span className="font-medium text-foreground">{formatNumber(p?.points ?? 0)}</span>/{def.key in HEALTH_WEIGHTS ? HEALTH_WEIGHTS[def.key] : 0}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-chart-1" style={{ width: `${Math.max(0, Math.min(100, (p?.share ?? 0) * 100))}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function HealthFormula() {
  return (
    <div className="space-y-2 text-[12.5px] leading-relaxed text-muted-foreground">
      <p>
        <span className="font-medium text-foreground">Health score = </span>
        {HEALTH_PARTS.map((p, i) => (
          <span key={p.key}>
            {i > 0 && ' + '}
            {HEALTH_WEIGHTS[p.key]} × {p.label.toLowerCase()}
          </span>
        ))}
        .
      </p>
      <p>
        Each part is a share from 0 to 1, measured over the last {HEALTH_WINDOW_DAYS} days ({HEALTH_UPDATES_WINDOW_DAYS} days for learning-update opens), so the weights add up to 100.
        Staff share is of staff with accounts; parents and students are of all parents and active students. A part with nothing to measure (no updates sent yet) scores 0.
        65 and above is strong, 40–64 steady, under 40 at risk.
      </p>
      <ul className="list-disc space-y-0.5 pl-4">
        {HEALTH_PARTS.map((p) => (
          <li key={p.key}>
            <span className="text-foreground">{p.label}</span>: {p.measure.charAt(0).toLowerCase() + p.measure.slice(1)}.
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Teacher time saved: each line with its assumption, clearly an estimate. */
export function TimeSavedTable({ t, className }: { t: SuccessSummary['timeSaved']; className?: string }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border text-left text-[11.5px] text-muted-foreground">
            <th className="py-2 pr-3 font-medium">AI-assisted work this term</th>
            <th className="py-2 pr-3 text-right font-medium">Count</th>
            <th className="py-2 pr-3 text-right font-medium">Assumed saving</th>
            <th className="py-2 text-right font-medium">Hours</th>
          </tr>
        </thead>
        <tbody>
          {t.items.map((i) => (
            <tr key={i.key} className="border-b border-border/70 align-top last:border-0">
              <td className="py-2 pr-3">
                <p>{i.label}</p>
                <p className="hidden text-[11.5px] text-muted-foreground sm:block print:hidden">{i.basis}</p>
              </td>
              <td className="py-2 pr-3 text-right tabular">{formatNumber(i.count)}</td>
              <td className="whitespace-nowrap py-2 pr-3 text-right tabular text-muted-foreground">
                {i.minutesEach} min / {i.per}
              </td>
              <td className="py-2 text-right font-medium tabular">{formatNumber(Math.round(i.minutes / 6) / 10)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border-strong">
            <td className="py-2 pr-3 font-medium" colSpan={3}>
              Estimated teacher hours saved
            </td>
            <td className="py-2 text-right font-display text-[15px] font-semibold tabular">{formatNumber(t.totalHours)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** "62 of 334 (19%)" */
export function ofText(part: number, whole: number): string {
  return whole ? `${formatNumber(part)} of ${formatNumber(whole)} (${Math.round((part / whole) * 100)}%)` : formatNumber(part);
}
