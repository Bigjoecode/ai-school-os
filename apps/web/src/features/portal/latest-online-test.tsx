import { ChevronRight, MonitorCheck } from 'lucide-react';
import { Link } from 'react-router';
import { formatPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { usePortalOnlineTests } from './api';
import { portalPath } from './ui';

/**
 * The latest online test score, for the overview's results card. Kept apart
 * from online-tests.tsx so the overview doesn't load the chart library.
 */
export function LatestOnlineTest({ childId }: { childId: string }) {
  const q = usePortalOnlineTests(childId);
  const t = q.data?.withheld ? null : q.data?.tests.find((x) => x.percent != null);
  if (!t || t.percent == null) return null;
  const tone = t.percent >= 70 ? 'text-success' : t.percent >= 50 ? 'text-warning' : 'text-danger';
  return (
    <Link
      to={`${portalPath('results', childId)}?tab=online&exam=${t.id}`}
      className="group mt-3 flex items-center gap-3 rounded-xl border border-border px-3 py-2 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <MonitorCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[11.5px] text-muted-foreground">Latest online test</span>
        <span className="block truncate text-[13px] font-medium">
          {t.title} <span className="font-normal text-muted-foreground">· {new Date(t.satAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
        </span>
      </span>
      <span className={cn('shrink-0 font-display text-[17px] font-semibold tabular', tone)}>
        {formatPct(t.percent, Number.isInteger(t.percent) ? 0 : 1)}
        {t.status === 'MARKING' && <span className="sr-only"> so far, still being marked</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}
