import { PRACTICAL_KIND_LABELS, type PracticalListItem, type PracticalStatus } from '@aischool/shared';
import { ArrowRight, Beaker, CheckCircle2, FlaskConical, Microscope, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { scoreTone } from '../learning/components';
import { usePracticalSubject, usePracticalSubjects } from './api';

export const subjectPath = (subject: string) => `/learn/practicals/subjects/${encodeURIComponent(subject)}`;
export const lessonPath = (id: string) => `/learn/practicals/lesson/${encodeURIComponent(id)}`;

/** Practical Academy: subjects with WAEC practical lessons, and the student's progress in each. */
export default function PracticalHubPage() {
  const q = usePracticalSubjects();
  return (
    <Page className="max-w-6xl">
      <PageHeader
        eyebrow="Exam Academy · WAEC"
        title="Practical Academy"
        description="Every WAEC practical, step by step: what to do, what you should see, how to calculate and what examiners look for — with virtual labs you can try again and again."
      />
      {q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : q.data.length === 0 ? (
        <EmptyState icon={FlaskConical} title="Practicals are on their way" description="Guided practical lessons appear here as they are added." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {q.data.map((s) => (
            <Link key={`${s.exam}-${s.subject}`} to={subjectPath(s.subject)} className="group">
              <Card className="flex h-full flex-col gap-3 p-5 transition-all group-hover:-translate-y-0.5 group-hover:border-border-strong">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] text-muted-foreground">{s.exam}</p>
                    <p className="font-display text-[17px] font-semibold tracking-tight">{s.subject}</p>
                  </div>
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand [&_svg]:size-5">{s.labs ? <Microscope aria-hidden /> : <Beaker aria-hidden />}</span>
                </div>
                <p className="line-clamp-3 text-[12.5px] text-muted-foreground">{s.practicalPaper}</p>
                <div className="mt-auto space-y-1.5">
                  <div className="flex items-center justify-between text-[12px]">
                    <span>
                      {s.practicals} practical{s.practicals === 1 ? '' : 's'}
                      {s.labs ? ` · ${s.labs} virtual lab${s.labs === 1 ? '' : 's'}` : ''}
                    </span>
                    <span className="tabular text-muted-foreground">{s.learned} learned</span>
                  </div>
                  <Progress value={s.practicals ? (100 * s.learned) / s.practicals : 0} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}

export function StatusBadges({ s, lab }: { s: PracticalStatus; lab: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {s.learned && (
        <Badge variant="success">
          <CheckCircle2 /> Learned
        </Badge>
      )}
      {s.practised > 0 && <Badge variant="info">Practised {s.practised}×</Badge>}
      {lab && s.best !== null && <span className={cn('text-[12px] font-semibold tabular', scoreTone(s.best))}>Best lab {s.best}%</span>}
    </span>
  );
}

/** One subject: its practicals grouped by syllabus topic, with kind and skills, and the student's status. */
export function PracticalSubjectPage() {
  const { subject = '' } = useParams();
  const q = usePracticalSubject(subject);
  const [find, setFind] = useState('');
  const groups = useMemo(() => {
    const rows = (q.data?.practicals ?? []).filter((p) => !find.trim() || `${p.title} ${p.topic} ${p.parentTopic ?? ''}`.toLowerCase().includes(find.trim().toLowerCase()));
    const by = new Map<string, PracticalListItem[]>();
    for (const p of rows) {
      const k = p.parentTopic ?? p.topic;
      by.set(k, [...(by.get(k) ?? []), p]);
    }
    return [...by];
  }, [q.data, find]);
  const d = q.data;
  return (
    <Page className="max-w-5xl">
      <PageHeader
        eyebrow={
          <Link to="/learn/practicals" className="hover:underline">
            Practical Academy
          </Link>
        }
        title={d ? `${d.subject} practicals` : 'Practicals'}
        description={d?.practicalPaper}
      />
      {q.error && !d ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a practical or topic" className="pl-9" aria-label="Find a practical" />
            </div>
            <p className="text-[12.5px] text-muted-foreground">
              {d.practicals.filter((p) => p.status.learned).length}/{d.practicals.length} learned · {d.practicalQuestions} WAEC practical question{d.practicalQuestions === 1 ? '' : 's'}
            </p>
          </div>
          {groups.map(([topic, rows]) => (
            <section key={topic}>
              <h2 className="mb-2 font-display text-[14px] font-semibold tracking-tight text-muted-foreground">{topic}</h2>
              <Card className="divide-y divide-border">
                {rows.map((p) => (
                  <Link key={p.id} to={lessonPath(p.id)} className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/50">
                    <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl [&_svg]:size-4', p.simulator ? 'bg-ai-2/10 text-ai-2' : 'bg-brand-soft text-brand')}>{p.simulator ? <Microscope aria-hidden /> : <FlaskConical aria-hidden />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium">{p.title}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline">{PRACTICAL_KIND_LABELS[p.kind]}</Badge>
                        {p.simulator && <Badge variant="ai">Virtual lab</Badge>}
                        {p.skills.slice(0, 4).map((s) => (
                          <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
                            {s}
                          </span>
                        ))}
                        {p.topic !== topic && <span className="text-[11.5px] text-muted-foreground">{p.topic}</span>}
                      </span>
                      <span className="mt-1 block">
                        <StatusBadges s={p.status} lab={!!p.simulator} />
                      </span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                ))}
              </Card>
            </section>
          ))}
          {!groups.length && <p className="text-[13px] text-muted-foreground">No practical matches “{find}”.</p>}
        </div>
      )}
    </Page>
  );
}
