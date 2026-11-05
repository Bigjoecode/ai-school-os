import { ArrowLeft, FlaskConical, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { usePortalOnlineTests, usePortalPracticalTest, usePortalPracticalTests } from './api';
import { TestHeader, TestRow, WithheldNotice } from './online-tests';
import type { ShellCtx } from './ui';

/**
 * Practical tests in the family portal, beside online tests and on the same
 * rules: the score once the child may see it, never while results are
 * withheld, and the marks in detail once nobody can still be sitting.
 */
export function PracticalTestsList({ child, onOpen }: Pick<ShellCtx, 'child'> & { onOpen: (id: string) => void }) {
  const q = usePortalPracticalTests(child.id);
  const online = usePortalOnlineTests(child.id);
  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const tests = q.data?.tests ?? [];
  if (!tests.length) return null;
  return (
    <section aria-labelledby="portal-practical-tests" className="mt-5 space-y-2.5">
      <h2 id="portal-practical-tests" className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
        <FlaskConical className="size-4" aria-hidden /> Practical tests
      </h2>
      {/* The online tests list above already shows this when it has tests. */}
      {q.data?.withheld && !online.data?.tests.length && <WithheldNotice message={q.data.withheld} />}
      <ul className="space-y-2.5">
        {tests.map((t) => (
          <li key={t.id}>
            <TestRow t={t} onOpen={() => onOpen(t.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PracticalTestReview({ child, isParent, id, onBack }: Pick<ShellCtx, 'child' | 'isParent'> & { id: string; onBack: () => void }) {
  const q = usePortalPracticalTest(child.id, id);
  const back = (
    <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
      <ArrowLeft /> All tests
    </Button>
  );
  if (q.isLoading) {
    return (
      <div className="space-y-3">
        {back}
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }
  const v = q.data;
  if (!v) {
    const err = q.error;
    const withheld = err instanceof ApiError && err.status === 403 && err.details.code === 'RESULT_WITHHELD';
    const notFound = err instanceof ApiError && err.status === 404;
    return (
      <div className="space-y-3">
        {back}
        <Card>
          {withheld ? (
            <EmptyState icon={Lock} title="This result is on hold" description={err.message} />
          ) : notFound ? (
            <EmptyState icon={FlaskConical} title="Test not found" description="This practical test isn’t available. It may have been removed by the school." />
          ) : (
            <ErrorState error={err} onRetry={() => void q.refetch()} />
          )}
        </Card>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {back}
      <TestHeader t={v.test} detail={v.test.practicalTitle} />
      {v.teacherNote && (
        <Card className="p-4 text-[13.5px] sm:p-5">
          <span className="text-muted-foreground">{isParent ? 'The teacher’s note' : 'Your teacher'}:</span> {v.teacherNote}
        </Card>
      )}
      {v.feedback && <Card className="p-4 text-[13.5px] leading-relaxed sm:p-5">{v.feedback}</Card>}
      {v.criteria && v.criteria.length > 0 && (
        <section aria-labelledby="practical-review-h">
          <h2 id="practical-review-h" className="mb-3 font-display text-[15px] font-semibold tracking-tight">
            Mark by mark
          </h2>
          <Card className="divide-y divide-border px-4 sm:px-5">
            {v.criteria.map((c) => (
              <div key={c.id} className="flex items-start gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium">{c.label}</p>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">{c.note}</p>
                </div>
                <p className={cn('shrink-0 font-display text-[15px] font-semibold tabular', c.awarded >= c.max ? 'text-success' : c.awarded > 0 ? 'text-warning' : 'text-danger')}>
                  {c.awarded}/{c.max}
                </p>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
