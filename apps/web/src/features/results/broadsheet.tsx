import { gradeFor, type GradeBand } from '@aischool/shared';
import { Printer, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useBroadsheet } from '../assessment/api';
import { fmtPct, printAs } from '../assessment/ui';

export function BroadsheetView({ classArmId, termId, scale }: { classArmId: string; termId: string; scale: GradeBand[] }) {
  const q = useBroadsheet({ classArmId, termId });
  const b = q.data;

  if (q.isLoading) {
    return (
      <Card className="space-y-3 p-5" aria-busy>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </Card>
    );
  }
  if (!b) {
    return (
      <Card>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Card>
    );
  }
  if (b.rows.length === 0 || b.subjects.length === 0) {
    return (
      <Card>
        <EmptyState icon={Table2} title="Nothing on the broadsheet yet" description="Once marks are entered for this class, every subject’s totals line up here." />
      </Card>
    );
  }

  const tone = (v: number | null) => (v == null ? 'text-muted-foreground' : gradeFor(v, scale).pass ? '' : 'text-danger font-medium');

  return (
    <div className="print-landscape space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-[13px] text-muted-foreground">
          Percentages of what has been assessed so far. Class average{' '}
          <span className="font-semibold text-foreground tabular">{fmtPct(b.classAverage)}</span>.
        </p>
        <Button variant="outline" size="sm" onClick={() => printAs('broadsheet')}>
          <Printer /> Print
        </Button>
      </div>
      <div className="hidden print:block">
        <h2 className="font-display text-lg font-semibold">
          Broadsheet — {b.classArm.levelName} {b.classArm.name}
        </h2>
        <p className="text-[12px]">
          {b.term.name} · {b.term.sessionName} · figures are percentages
        </p>
      </div>
      <Card className="overflow-hidden print:rounded-none print:border-0 print:shadow-none">
        <div className="scrollbar-thin overflow-x-auto print-scroll-reset">
          <table className="w-full border-collapse text-[12.5px]">
            <thead className="bg-muted/50">
              <tr className="border-b border-border">
                <th scope="col" className="sticky left-0 z-10 min-w-[190px] bg-muted px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground print:static">
                  Student
                </th>
                {b.subjects.map((s) => (
                  <th key={s.id} scope="col" className="px-2 py-2.5 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground" title={s.name}>
                    {s.code || s.name}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2.5 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Avg
                </th>
                <th scope="col" className="px-3 py-2.5 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Pos.
                </th>
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r) => (
                <tr key={r.student.id} className="group border-b border-border hover:bg-muted/30">
                  <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-normal group-hover:bg-muted print:static">
                    <span className="block truncate font-medium">{r.student.name}</span>
                    <span className="block text-[11px] tabular text-muted-foreground">{r.student.admissionNumber}</span>
                  </th>
                  {b.subjects.map((s) => {
                    const v = r.totals[s.id] ?? null;
                    return (
                      <td key={s.id} className={cn('px-2 py-2 text-center tabular', tone(v))}>
                        {v == null ? '—' : Math.round(v)}
                      </td>
                    );
                  })}
                  <td className={cn('px-3 py-2 text-center font-semibold tabular', tone(r.average))}>{fmtPct(r.average)}</td>
                  <td className="px-3 py-2 text-center font-semibold tabular">{r.position ?? '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40">
                <th scope="row" className="sticky left-0 z-10 bg-muted px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground print:static">
                  Subject average
                </th>
                {b.subjects.map((s) => (
                  <td key={s.id} className="px-2 py-2.5 text-center font-semibold tabular">
                    {b.subjectAverages[s.id] == null ? '—' : Math.round(b.subjectAverages[s.id]!)}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-center font-semibold tabular">{fmtPct(b.classAverage)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
