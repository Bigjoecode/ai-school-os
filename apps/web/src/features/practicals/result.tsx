import type { PracticalAttemptView } from '@aischool/shared';
import { ArrowRight, BadgeCheck, Bot, Calculator, ListChecks, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SectionTitle, scoreTone } from '../learning/components';

const marks = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** A marked lab: score, a teacher's review, the criteria table (lost marks explained), feedback, worked solution and what to do next. */
export function LabResult({ a, teacher }: { a: PracticalAttemptView; teacher?: boolean }) {
  const r = a.result;
  if (!r) return null;
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className={cn('font-display text-4xl font-semibold tabular', scoreTone(r.percent))}>{r.percent}%</p>
            <p className="text-[13px] tabular text-muted-foreground">
              {marks(r.score)}/{marks(r.maxScore)} marks{r.review && r.markedScore !== r.score ? ` (marked ${marks(r.markedScore)})` : ''}
            </p>
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              <Badge variant={a.mode === 'EXAM' ? 'warning' : 'brand'}>{a.mode === 'EXAM' ? 'Timed practical exam' : 'Practice lab'}</Badge>
              {r.review && (
                <Badge variant="success">
                  <BadgeCheck /> Reviewed by {teacher ? r.review.by : 'your teacher'}
                </Badge>
              )}
            </div>
            {r.review && (
              <p className="text-[13px]">
                <span className="text-muted-foreground">{teacher ? 'Review note' : 'Your teacher'} ({formatDate(r.review.at)}):</span> {r.review.note}
              </p>
            )}
          </div>
        </div>
        {r.feedback && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-[13.5px] leading-relaxed">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-ai-2" aria-hidden /> <span>{r.feedback}</span>
          </p>
        )}
      </Card>

      <Card className="p-5">
        <SectionTitle icon={ListChecks} title="How it was marked" />
        <ul className="divide-y divide-border">
          {r.criteria.map((c) => (
            <li key={c.id} className="flex items-start gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-medium">
                  {c.label}
                  {c.how === 'AI' && (
                    <Badge variant="outline" title="A written answer, marked by AI against the marking guide">
                      <Bot /> AI-assisted
                    </Badge>
                  )}
                </p>
                <p className={cn('mt-0.5 text-[12.5px]', c.awarded < c.max ? 'text-foreground/80' : 'text-muted-foreground')}>{c.note}</p>
              </div>
              <p className={cn('shrink-0 font-display text-[15px] font-semibold tabular', c.awarded >= c.max ? 'text-success' : c.awarded > 0 ? 'text-warning' : 'text-danger')}>
                {marks(c.awarded)}/{c.max}
              </p>
            </li>
          ))}
        </ul>
      </Card>

      {r.solution.length > 0 && (
        <Card className="p-5">
          <SectionTitle icon={Calculator} title="Worked solution for this lab" />
          <ol className="list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed">
            {r.solution.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        </Card>
      )}

      {!teacher && r.next && (
        <Link to={`/learn/practicals/lesson/${encodeURIComponent(r.next.id)}`} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft transition-colors hover:border-border-strong">
          <span className="min-w-0">
            <span className="block text-[12px] text-muted-foreground">Next recommended practical</span>
            <span className="block truncate font-display text-[15px] font-semibold">{r.next.title}</span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-brand" aria-hidden />
        </Link>
      )}
    </div>
  );
}
