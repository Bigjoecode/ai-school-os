import { CELL_BAND_LABELS, cellBand, type MasteryCellBand } from '@aischool/shared';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Heatmap colours: tinted fills keep the number readable in light and dark themes. */
export const BAND_CELL: Record<MasteryCellBand, string> = {
  LOW: 'bg-danger/25 text-foreground hover:bg-danger/35',
  MID: 'bg-warning/25 text-foreground hover:bg-warning/35',
  HIGH: 'bg-success/25 text-foreground hover:bg-success/35',
  NONE: 'bg-muted/70 text-muted-foreground hover:bg-muted',
};
export const BAND_SWATCH: Record<MasteryCellBand, string> = {
  LOW: 'bg-danger/60',
  MID: 'bg-warning/60',
  HIGH: 'bg-success/60',
  NONE: 'bg-muted',
};
export const BAND_TEXT: Record<MasteryCellBand, string> = {
  LOW: 'text-danger',
  MID: 'text-warning',
  HIGH: 'text-success',
  NONE: 'text-muted-foreground',
};

export const bandOf = cellBand;
export const bandLabel = (score: number | null | undefined) => CELL_BAND_LABELS[cellBand(score)];

export function Legend({ className }: { className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground', className)} aria-label="Colour key">
      {(['LOW', 'MID', 'HIGH', 'NONE'] as const).map((b) => (
        <li key={b} className="flex items-center gap-1.5">
          <span className={cn('size-3 rounded-[3px]', BAND_SWATCH[b])} aria-hidden />
          {CELL_BAND_LABELS[b]}
        </li>
      ))}
    </ul>
  );
}

/** "+7" / "−3" points over the last 14 days. */
export function Trend({ value, className }: { value: number | null | undefined; className?: string }) {
  if (value === null || value === undefined || value === 0) return null;
  const up = value > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn('inline-flex items-center gap-0.5 text-[11.5px] font-medium tabular', up ? 'text-success' : 'text-danger', className)}
      title={`${up ? 'Up' : 'Down'} ${Math.abs(value)} points in the last 14 days`}
    >
      <Icon className="size-3" aria-hidden />
      <span className="sr-only">{up ? 'up' : 'down'}</span>
      {Math.abs(value)}
    </span>
  );
}

/** A score as a small bar with the number. */
export function ScoreBar({ score, className }: { score: number | null; className?: string }) {
  const band = cellBand(score);
  return (
    <span className={cn('flex min-w-0 items-center gap-2', className)}>
      <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
        {score !== null && <span className={cn('absolute inset-y-0 left-0 rounded-full', BAND_SWATCH[band])} style={{ width: `${Math.max(3, score)}%` }} />}
      </span>
      <span className={cn('w-10 shrink-0 text-right text-[12.5px] font-medium tabular', BAND_TEXT[band])}>{score === null ? '–' : `${score}%`}</span>
    </span>
  );
}
