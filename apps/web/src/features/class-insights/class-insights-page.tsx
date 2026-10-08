import type { ClassInsightsSummary, ClassMastery } from '@aischool/shared';
import { BookOpenCheck, Grid3x3, Lightbulb, Sparkles, TrendingUp, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/api';
import { useHasFeature } from '@/lib/auth-store';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { SectionTitle } from '../learning/components';
import { StatTile } from '../portal/ui';
import { useClassMastery, useInsightOptions, useInsightSummary } from './api';
import { ClassModulesCard } from '../lesson-modules/widgets';
import { ClassGamesCard } from '../games/widgets';
import { StudentSheet, TopicSheet } from './panels';
import { BAND_CELL, bandLabel, bandOf, Legend, Trend } from './ui';

/**
 * Class insights: topic mastery for one class and subject as a heatmap
 * (students × topics), with the hardest topics, who needs support, what is
 * improving, a short summary, and one-click follow-up from each topic.
 */
export default function ClassInsightsPage() {
  useDocumentTitle('Class insights');
  const [params, setParams] = useSearchParams();
  const options = useInsightOptions();
  const classes = useMemo(() => options.data?.classes ?? [], [options.data]);
  const classArmId = params.get('classArmId') ?? '';
  const subjectId = params.get('subjectId') ?? '';
  const topicId = params.get('topicId');
  const studentId = params.get('studentId');
  const [allTopics, setAllTopics] = useState(false);
  const cls = classes.find((c) => c.classArmId === classArmId);

  const patch = (next: Record<string, string | null>) =>
    setParams(
      (p) => {
        const q = new URLSearchParams(p);
        for (const [k, v] of Object.entries(next)) {
          if (v) q.set(k, v);
          else q.delete(k);
        }
        return q;
      },
      { replace: true },
    );

  // Default to the first class and subject the user can see; keep the subject when it still applies.
  useEffect(() => {
    if (!classes.length) return;
    const c = classes.find((x) => x.classArmId === classArmId) ?? classes[0];
    const s = c.subjects.find((x) => x.id === subjectId) ?? c.subjects[0];
    if (c.classArmId !== classArmId || s?.id !== subjectId) patch({ classArmId: c.classArmId, subjectId: s?.id ?? null, topicId: null, studentId: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, classArmId, subjectId]);

  const q = useClassMastery(cls ? classArmId : undefined, cls?.subjects.some((s) => s.id === subjectId) ? subjectId : undefined, allTopics);
  const m = q.data && q.data.class.id === classArmId && q.data.subject.id === subjectId ? q.data : q.isPlaceholderData ? q.data : undefined;

  return (
    <Page>
      <PageHeader
        eyebrow="Academics"
        title="Class insights"
        description="How each student is doing on each topic, from practice, homework, quizzes and online exams. Spot the topics to re-teach and who needs support. This is separate from official results."
      />
      {options.error && !options.data ? (
        <ErrorState error={options.error} onRetry={() => void options.refetch()} />
      ) : !options.data ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full max-w-md rounded-xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      ) : !classes.length ? (
        <EmptyState icon={Grid3x3} title="No classes to show" description="Class insights show the classes and subjects you teach. Ask the school admin to assign you to your classes in Academic Setup." />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Select value={classArmId} onValueChange={(v) => patch({ classArmId: v, topicId: null, studentId: null })}>
              <SelectTrigger aria-label="Class" className="h-9 w-full sm:w-[180px]">
                <SelectValue placeholder="Class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.classArmId} value={c.classArmId}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={subjectId} onValueChange={(v) => patch({ subjectId: v, topicId: null, studentId: null })} disabled={!cls}>
              <SelectTrigger aria-label="Subject" className="h-9 w-full sm:w-[220px]">
                <SelectValue placeholder="Subject" />
              </SelectTrigger>
              <SelectContent>
                {(cls?.subjects ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-[13px] text-muted-foreground sm:ml-2">
              <Switch checked={allTopics} onCheckedChange={setAllTopics} aria-label="Show all syllabus topics" />
              All syllabus topics
            </label>
          </div>

          {q.error && !m ? (
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          ) : !m ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
              <Skeleton className="h-96 rounded-2xl" />
            </div>
          ) : (
            <div className={cn('space-y-4 transition-opacity', q.isPlaceholderData && 'opacity-60')}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatTile label="Students with evidence" value={`${m.totals.withEvidence} / ${m.totals.students}`} icon={Users} />
                <StatTile label="Mastery average" value={m.totals.average === null ? '–' : `${m.totals.average}%`} icon={Grid3x3} />
                <StatTile label="Official term average" value={m.totals.officialAverage === null ? '–' : `${m.totals.officialAverage}%`} icon={BookOpenCheck} />
                <StatTile label="Evidence, last 14 days" value={m.totals.evidenceLast14Days} icon={TrendingUp} />
              </div>
              {m.totals.withEvidence === 0 && !m.topics.length ? (
                <Card className="p-0">
                  <EmptyState
                    icon={Grid3x3}
                    title="No mastery evidence yet"
                    description={`Evidence for ${m.class.label} ${m.subject.name} builds up as students practise in Exam Academy, use the AI tutor, and as topic-linked homework and online exams are marked. Turn on “All syllabus topics” to see the topics ahead.`}
                  />
                </Card>
              ) : (
                <>
                  <InsightsRow m={m} onTopic={(id) => patch({ topicId: id, studentId: null })} onStudent={(id) => patch({ studentId: id, topicId: null })} />
                  <SummaryCard m={m} canAi={!!options.data.canAi} />
                  <Heatmap m={m} onTopic={(id) => patch({ topicId: id, studentId: null })} onStudent={(id) => patch({ studentId: id, topicId: null })} />
                </>
              )}
            </div>
          )}
          {cls && subjectId && (
            <div className="mt-4 space-y-4">
              <ClassModulesCard classArmId={classArmId} subjectId={subjectId} />
              <ClassGamesCard classArmId={classArmId} />
            </div>
          )}
          {cls && (
            <>
              <TopicSheet
                classArmId={classArmId}
                subjectId={subjectId}
                topicId={topicId}
                options={options.data}
                onClose={() => patch({ topicId: null })}
                onStudent={(id) => patch({ studentId: id, topicId: null })}
              />
              <StudentSheet classArmId={classArmId} subjectId={subjectId} studentId={studentId} onClose={() => patch({ studentId: null })} onTopic={(id) => patch({ topicId: id, studentId: null })} />
            </>
          )}
        </>
      )}
    </Page>
  );
}

// ------------------------------------------------------------------ insights

function InsightsRow({ m, onTopic, onStudent }: { m: ClassMastery; onTopic: (id: string) => void; onStudent: (id: string) => void }) {
  const { strugglingTopics, needSupport, improving } = m.insights;
  return (
    <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
      <Card className="p-4 sm:p-5">
        <SectionTitle icon={Lightbulb} title="Topics to re-teach" />
        {strugglingTopics.length ? (
          <ul className="space-y-1">
            {strugglingTopics.map((t) => (
              <li key={t.topicId}>
                <button type="button" onClick={() => onTopic(t.topicId)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="min-w-0 flex-1 truncate">{t.topic}</span>
                  <span className="shrink-0 text-[12px] text-danger tabular">
                    {t.struggling}/{t.assessed} below 50%
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">No topic has students below 50%.</p>
        )}
      </Card>
      <Card className="p-4 sm:p-5">
        <SectionTitle icon={Users} title="Students needing support" />
        {needSupport.length ? (
          <ul className="space-y-1">
            {needSupport.slice(0, 6).map((s) => (
              <li key={s.studentId}>
                <button type="button" onClick={() => onStudent(s.studentId)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{s.name}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">{s.topics.join(', ')}</span>
                  </span>
                  <span className="shrink-0 text-[12px] text-danger tabular">
                    {s.low} of {s.assessed} low
                  </span>
                </button>
              </li>
            ))}
            {needSupport.length > 6 && <li className="px-2 text-[12px] text-muted-foreground">and {needSupport.length - 6} more</li>}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">Nobody is low across several topics.</p>
        )}
      </Card>
      <Card className="p-4 sm:p-5">
        <SectionTitle icon={TrendingUp} title="Improving (last 14 days)" />
        {improving.length ? (
          <ul className="space-y-1">
            {improving.map((t) => (
              <li key={t.topicId}>
                <button type="button" onClick={() => onTopic(t.topicId)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="min-w-0 flex-1 truncate">{t.topic}</span>
                  <Trend value={t.change} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">No clear improvement yet. Trends need evidence from before and during the last 14 days.</p>
        )}
      </Card>
    </div>
  );
}

function SummaryCard({ m, canAi }: { m: ClassMastery; canAi: boolean }) {
  const hasAi = useHasFeature('ai');
  const summary = useInsightSummary();
  const [result, setResult] = useState<ClassInsightsSummary | null>(null);
  const key = `${m.class.id}|${m.subject.id}`;
  useEffect(() => setResult(null), [key]);
  const ai = canAi && hasAi;
  const run = () =>
    summary.mutate(
      { classArmId: m.class.id, subjectId: m.subject.id },
      { onSuccess: setResult, onError: (e) => toast.error(errorMessage(e, 'Couldn’t summarise this class')) },
    );
  return (
    <Card className="p-4 sm:p-5">
      <SectionTitle
        icon={Sparkles}
        title="Summary"
        action={
          <Button size="sm" variant={ai ? 'ai' : 'outline'} onClick={run} loading={summary.isPending}>
            <Sparkles /> {result ? 'Refresh' : ai ? 'Summarise with AI' : 'Summarise'}
          </Button>
        }
      />
      {result ? (
        <div className="space-y-3" aria-live="polite">
          <p className="text-[13.5px] leading-relaxed">{result.text}</p>
          {result.suggestions.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-[13px]">
              {result.suggestions.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
          <p className="text-[11.5px] text-muted-foreground">{result.source === 'AI' ? 'Written by AI from the numbers above. Check before acting on it.' : 'Worked out from the numbers above.'}</p>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">A short paragraph on where {m.class.label} stands in {m.subject.name}, with suggestions for next week.</p>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ heatmap

function Heatmap({ m, onTopic, onStudent }: { m: ClassMastery; onTopic: (id: string) => void; onStudent: (id: string) => void }) {
  const [sort, setSort] = useState<'name' | 'weakest'>('name');
  const order = useMemo(() => {
    const idx = m.students.map((_, i) => i);
    if (sort === 'weakest') idx.sort((a, b) => (m.students[a].overall ?? 101) - (m.students[b].overall ?? 101));
    return idx;
  }, [m.students, sort]);
  if (!m.topics.length) {
    return (
      <Card className="p-0">
        <EmptyState icon={Grid3x3} title="No topics" description="No syllabus topics are recorded for this subject at this level yet." />
      </Card>
    );
  }
  return (
    <Card className="min-w-0 p-0">
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <h2 className="font-display text-[15px] font-semibold tracking-tight">Topic heatmap</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Legend />
          <div role="radiogroup" aria-label="Sort students" className="flex rounded-lg bg-muted p-0.5 text-[12px]">
            {(['name', 'weakest'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={sort === s}
                onClick={() => setSort(s)}
                className={cn('rounded-md px-2.5 py-1 font-medium transition-colors', sort === s ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
              >
                {s === 'name' ? 'By name' : 'Weakest first'}
              </button>
            ))}
          </div>
        </div>
      </div>
      {/* Scrolls sideways inside the card on phones; the page itself never does. */}
      <div className="scrollbar-thin max-h-[70dvh] overflow-auto overscroll-x-contain" tabIndex={0} role="region" aria-label={`Topic mastery for ${m.class.label} ${m.subject.name}`}>
        <table className="border-separate border-spacing-0 text-[12px]">
          <caption className="sr-only">
            Students in rows, topics in columns. Each cell is the student’s mastery score for the topic. Select a topic heading or a student for details.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 top-0 z-30 min-w-[9.5rem] max-w-[9.5rem] border-b border-r border-border bg-card px-3 py-2 text-left align-bottom text-[11.5px] font-medium text-muted-foreground sm:min-w-[13rem] sm:max-w-[13rem]">
                Student <span className="font-normal">· overall</span>
              </th>
              {m.topics.map((t) => (
                <th key={t.id} scope="col" className="sticky top-0 z-20 w-[5.5rem] min-w-[5.5rem] max-w-[5.5rem] border-b border-border bg-card p-0 align-bottom font-normal">
                  <button
                    type="button"
                    onClick={() => onTopic(t.id)}
                    className="flex h-full w-full flex-col items-center gap-1 px-1.5 py-2 text-center hover:bg-muted/70 focus-visible:bg-muted focus-visible:outline-none"
                    aria-label={`${t.name}${t.parent ? ` (${t.parent})` : ''}: class average ${t.average === null ? 'no evidence' : `${t.average}%`}, ${t.struggling} of ${t.assessed} below 50%. Open topic.`}
                    title={t.parent ? `${t.parent} › ${t.name}` : t.name}
                  >
                    <span className={cn('line-clamp-3 text-[11.5px] font-medium leading-tight', !t.evidenced && 'text-muted-foreground')}>{t.name}</span>
                    <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular', BAND_CELL[bandOf(t.average)])}>{t.average === null ? '–' : `${t.average}%`}</span>
                    <Trend value={t.trend} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.map((i) => {
              const s = m.students[i];
              return (
                <tr key={s.id}>
                  <th scope="row" className="sticky left-0 z-10 min-w-[9.5rem] max-w-[9.5rem] border-b border-r border-border bg-card p-0 text-left font-normal sm:min-w-[13rem] sm:max-w-[13rem]">
                    <button type="button" onClick={() => onStudent(s.id)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/70 focus-visible:bg-muted focus-visible:outline-none" aria-label={`${s.name}: overall ${s.overall === null ? 'no evidence' : `${s.overall}%`}. Open student.`}>
                      <span className="min-w-0 flex-1 truncate text-[12.5px]">{s.name}</span>
                      <span className={cn('shrink-0 text-[11.5px] font-medium tabular', s.overall === null ? 'text-muted-foreground' : s.overall < 50 ? 'text-danger' : '')}>{s.overall === null ? '–' : `${s.overall}%`}</span>
                    </button>
                  </th>
                  {m.topics.map((t, j) => {
                    const c = m.cells[i][j];
                    const band = bandOf(c?.score);
                    return (
                      <td key={t.id} className="border-b border-border p-[2px]">
                        <button
                          type="button"
                          onClick={() => onTopic(t.id)}
                          className={cn('grid h-8 w-full place-items-center rounded-[5px] text-[12px] font-medium tabular transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', BAND_CELL[band], c && c.confidence < 0.4 && 'opacity-75')}
                          aria-label={`${s.name}, ${t.name}: ${c ? `${c.score}%, ${bandLabel(c.score).toLowerCase()}, ${c.attempts} attempt${c.attempts === 1 ? '' : 's'}` : 'no evidence yet'}`}
                          title={c ? `${s.name} · ${t.name}: ${c.score}% (${c.attempts} attempts)` : `${s.name} · ${t.name}: no evidence yet`}
                        >
                          {c ? c.score : <span aria-hidden>·</span>}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-4 py-2.5 text-[11.5px] text-muted-foreground sm:px-5">
        Scores are 0–100 and weigh recent work more. Faded cells rest on little evidence. <Badge variant="outline">{m.topics.length} topics</Badge>
      </p>
    </Card>
  );
}
