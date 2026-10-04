import { PROMOTION_DECISION_LABELS, type PromotionDecision } from '@aischool/shared';
import { TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useStudentPromotions } from './promotion-api';

const TONE: Record<PromotionDecision, 'success' | 'warning' | 'brand' | 'danger'> = {
  PROMOTED: 'success',
  REPEATED: 'warning',
  GRADUATED: 'brand',
  WITHDRAWN: 'danger',
};

const PAST: Record<PromotionDecision, string> = {
  PROMOTED: 'Promoted',
  REPEATED: 'Repeated',
  GRADUATED: 'Graduated',
  WITHDRAWN: 'Withdrawn',
};

/** End-of-session decisions for one student, newest first. Renders nothing until there is one. */
export function StudentPromotionHistory({ studentId }: { studentId: string }) {
  const { data } = useStudentPromotions(studentId);
  if (!data?.length) return null;
  return (
    <div className="mt-6">
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
        <TrendingUp className="size-4 text-muted-foreground" /> Promotion history
      </h3>
      <ul className="space-y-2">
        {data.map((p) => (
          <li key={p.id} className="rounded-xl border border-border bg-muted/30 p-3 text-[13px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {p.fromSession.name}
                {p.toSession && <span className="text-muted-foreground"> → {p.toSession.name}</span>}
              </span>
              <Badge variant={TONE[p.decision]} title={PROMOTION_DECISION_LABELS[p.decision]}>
                {PAST[p.decision]}
              </Badge>
            </div>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {p.fromClass ?? '—'}
              {p.toClass ? ` → ${p.toClass}` : p.decision === 'GRADUATED' ? ' → graduated' : p.decision === 'WITHDRAWN' ? ' → left the school' : ''}
              {p.average !== null && ` · session average ${p.average}%`}
            </p>
            {p.note && <p className="mt-1 text-[12.5px]">{p.note}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
