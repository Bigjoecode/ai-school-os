import { Download, Info } from 'lucide-react';
import { useState } from 'react';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounced } from '@/lib/hooks';
import { formatNumber } from '@/lib/format';
import { downloadCsv, useCensusAggregate } from './api';

/** Console preview: counts by state and LGA from schools that opted in. No personal data. */
export default function CensusAggregatePage() {
  const [state, setState] = useState('');
  const q = useCensusAggregate(useDebounced(state.trim()));
  const d = q.data;
  const header = ['State', 'LGA', 'Schools', 'Pupils (M)', 'Pupils (F)', 'Teachers (M)', 'Teachers (F)', 'Classrooms'];
  return (
    <Page>
      <PageHeader
        title="State census"
        eyebrow={<Badge variant="warning">Preview</Badge>}
        description="Totals by state and LGA across schools that opted in to share anonymous counts. For conversations with state boards; not an official statistic."
        actions={
          <Button
            variant="outline"
            disabled={!d?.rows.length}
            onClick={() => d && downloadCsv('state-census-preview.csv', [[d.note], header, ...d.rows.map((r) => [r.state, r.lga, r.schools, r.pupilsMale, r.pupilsFemale, r.teachersMale, r.teachersFemale, r.classrooms])])}
          >
            <Download /> CSV
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input className="sm:w-64" placeholder="Filter by state, e.g. Lagos" value={state} onChange={(e) => setState(e.target.value)} aria-label="State" />
        {d && (
          <p className="text-[13px] text-muted-foreground">
            {formatNumber(d.optedIn)} of {formatNumber(d.totalSchools)} schools opted in
          </p>
        )}
      </div>
      {d && (
        <p className="mb-4 flex items-start gap-2 text-[13px] text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" /> {d.note}
        </p>
      )}
      {q.error && !d ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-max text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {header.map((h, i) => (
                    <th key={h} className={`px-3 py-2 font-medium ${i < 2 ? 'text-left' : 'text-right'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.rows.length === 0 && (
                  <tr>
                    <td colSpan={header.length} className="px-3 py-6 text-center text-muted-foreground">
                      No schools have opted in{state ? ' in this state' : ''} yet.
                    </td>
                  </tr>
                )}
                {d.rows.map((r) => (
                  <tr key={`${r.state}|${r.lga}`} className="border-b border-border last:border-0">
                    <td className="px-3 py-1.5">{r.state}</td>
                    <td className="px-3 py-1.5">{r.lga}</td>
                    {[r.schools, r.pupilsMale, r.pupilsFemale, r.teachersMale, r.teachersFemale, r.classrooms].map((n, i) => (
                      <td key={i} className="px-3 py-1.5 text-right tabular-nums">
                        {formatNumber(n)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </Page>
  );
}
