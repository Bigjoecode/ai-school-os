import { ArrowRight, Grid3x3 } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth-store';
import { useMyClassInsights } from './api';

/** Overview card for teachers: the topic each of their classes finds hardest. Hidden for staff who teach no classes. */
export function ClassInsightsCard() {
  const canRead = useCan('academics.read');
  const canHomework = useCan('homework.manage');
  const q = useMyClassInsights(canRead || canHomework);
  if (!(canRead || canHomework)) return null;
  if (q.isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  const items = q.data?.items ?? [];
  if (!items.length) return null;
  const withTopic = items.filter((i) => i.topic);
  const rest = items.filter((i) => !i.topic);
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Class insights</CardTitle>
          <CardDescription>The topic each of your classes finds hardest</CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/class-insights">
            Open <ArrowRight />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {withTopic.length ? (
          <ul className="divide-y divide-border">
            {withTopic.slice(0, 6).map((i) => (
              <li key={`${i.classArmId}-${i.subjectId}`}>
                <Link
                  to={`/class-insights?classArmId=${i.classArmId}&subjectId=${i.subjectId}&topicId=${i.topic!.id}`}
                  className="flex items-center gap-3 rounded-lg py-2.5 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-2"
                >
                  <span className="w-20 shrink-0 text-[13px] font-medium">{i.classLabel}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]" title={i.topic!.name}>
                      {i.topic!.name}
                    </span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">{i.subject}</span>
                  </span>
                  <span className="shrink-0 text-right text-[12px] tabular">
                    <span className="font-semibold text-danger">{i.topic!.struggling}</span>
                    <span className="text-muted-foreground">/{i.topic!.assessed} below 50%</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-start gap-3 py-2 text-[13px] text-muted-foreground">
            <Grid3x3 className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>No struggling topics yet. Evidence builds up as students practise and topic-linked homework and online exams are marked.</p>
          </div>
        )}
        {withTopic.length > 0 && rest.length > 0 && (
          <p className="mt-2 text-[11.5px] text-muted-foreground">
            No evidence yet for {rest.slice(0, 3).map((i) => `${i.classLabel} ${i.subject}`).join(', ')}
            {rest.length > 3 ? ` and ${rest.length - 3} more` : ''}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
