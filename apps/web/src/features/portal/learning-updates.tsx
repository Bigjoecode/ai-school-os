import type { LearningUpdateContent, LearningUpdateList, LearningUpdateTopic, LearningUpdateView } from '@aischool/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, ArrowRight, BellOff, BellRing, CheckCircle2, ChevronRight, Lightbulb, Sparkles, TrendingUp } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PortalShell, portalPath, type ShellCtx } from './ui';

/**
 * "Learning updates": the weekly "How <child> is learning" note the school
 * sends to parents (students see their own, worded for them). The latest
 * one also shows on the portal overview.
 */

const lk = {
  list: (id: string) => ['portal', 'learning-updates', id] as const,
  one: (id: string, updateId: string) => ['portal', 'learning-update', id, updateId] as const,
};

export const useLearningUpdates = (studentId: string) =>
  useQuery({ queryKey: lk.list(studentId), queryFn: ({ signal }) => api.get<LearningUpdateList>(`/learning-updates/students/${studentId}`, undefined, signal), enabled: !!studentId });

const useLearningUpdate = (studentId: string, updateId: string) =>
  useQuery({
    queryKey: lk.one(studentId, updateId),
    queryFn: ({ signal }) => api.get<LearningUpdateView>(`/learning-updates/students/${studentId}/${updateId}`, undefined, signal),
    enabled: !!studentId && !!updateId,
  });

function useSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (on: boolean) => api.put<{ optedOut: boolean }>('/learning-updates/subscription', { on }),
    onSuccess: (r) => {
      // The choice covers every child, so refresh every list.
      qc.setQueriesData<LearningUpdateList>({ queryKey: ['portal', 'learning-updates'] }, (old) => (old ? { ...old, optedOut: r.optedOut } : old));
      toast.success(r.optedOut ? 'Weekly learning updates turned off' : 'Weekly learning updates turned on');
    },
  });
}

const weekLabel = (weekStart: string) => `Week of ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${weekStart}T12:00:00Z`))}`;
const updatePath = (childId: string, id: string) => `${portalPath('learning', childId)}/${id}`;

function summaryLine(c: LearningUpdateContent): string {
  if (c.quiet) return 'A quiet week on the app';
  const bits = [
    c.strong.length && `${c.strong.length} doing well`,
    c.improving.length && `${c.improving.length} getting better`,
    c.attention.length && `${c.attention.length} needing attention`,
  ].filter(Boolean);
  return bits.length ? bits.join(' · ') : `${c.activity.topics} topic${c.activity.topics === 1 ? '' : 's'} practised`;
}

// ------------------------------------------------------------------ list page

export default function PortalLearningUpdatesPage() {
  return (
    <PortalShell
      section="learning"
      title={({ child, isParent }) => (isParent ? `How ${child.firstName} is learning` : 'Your learning updates')}
      description={({ isParent }) => (isParent ? 'A short note from the school every week: what’s going well, what’s improving and one thing to help with.' : 'Your week in learning, every week.')}
    >
      {(ctx) => <ListBody {...ctx} />}
    </PortalShell>
  );
}

function ListBody({ child, isParent }: ShellCtx) {
  const q = useLearningUpdates(child.id);
  const d = q.data;
  if (q.error && !d) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!d) return <Skeleton className="h-64 rounded-2xl" />;
  return (
    <div className="space-y-4">
      {isParent && d.enabled && <OptOutCard optedOut={d.optedOut} />}
      {d.updates.length === 0 ? (
        <Card>
          <EmptyState
            icon={Sparkles}
            title={d.enabled ? 'No updates yet' : 'Not turned on yet'}
            description={
              d.enabled
                ? isParent
                  ? `The first weekly update about ${child.firstName} will appear here once the school sends it.`
                  : 'Your first weekly update will appear here soon.'
                : 'Your school hasn’t turned on weekly learning updates yet.'
            }
          />
        </Card>
      ) : (
        <Card className="divide-y divide-border p-0">
          {d.updates.map((u, i) => (
            <Link
              key={u.id}
              to={updatePath(child.id, u.id)}
              className="group flex items-center gap-3 px-4 py-3.5 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[13.5px] font-medium">
                  {weekLabel(u.weekStart)} {i === 0 && <Badge variant="brand">Latest</Badge>}
                </span>
                <span className="block truncate text-[12.5px] text-muted-foreground">{summaryLine(u.content)}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}

function OptOutCard({ optedOut }: { optedOut: boolean }) {
  const m = useSubscription();
  return (
    <Card className="flex items-center gap-3 p-4">
      {optedOut ? <BellOff className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : <BellRing className="size-4 shrink-0 text-brand" aria-hidden />}
      <label htmlFor="lu-sub" className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-[13.5px] font-medium">Send me the weekly update</span>
        <span className="block text-[12px] text-muted-foreground">
          {optedOut ? 'Off. You can still read past updates here.' : 'In the app, and by email or text if the school uses them. Covers all your children.'}
        </span>
      </label>
      <Switch id="lu-sub" checked={!optedOut} disabled={m.isPending} onCheckedChange={(on) => m.mutate(on)} aria-label="Send me the weekly learning update" />
    </Card>
  );
}

// ------------------------------------------------------------------ one update

export function PortalLearningUpdatePage() {
  return (
    <PortalShell
      section="learning"
      title={({ child, isParent }) => (isParent ? `How ${child.firstName} is learning` : 'Your week in learning')}
    >
      {(ctx) => <DetailBody {...ctx} />}
    </PortalShell>
  );
}

function DetailBody({ child, isParent }: ShellCtx) {
  const { updateId = '' } = useParams();
  const q = useLearningUpdate(child.id, updateId);
  const u = q.data;
  if (q.error && !u) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!u) return <Skeleton className="h-96 rounded-2xl" />;
  const c = u.content;
  const topicLink = isParent ? `/family/children/${child.id}` : '/learn/exams';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to={portalPath('learning', child.id)}>
            <ArrowLeft /> All updates
          </Link>
        </Button>
        <p className="text-[13px] font-medium text-muted-foreground">{weekLabel(c.weekStart)}</p>
      </div>

      {!isParent && (
        <Card className="border-brand/30 bg-brand-soft/40 p-4">
          <p className="text-[14px] leading-relaxed">{c.studentText}</p>
        </Card>
      )}

      {c.quiet && (
        <Card className="p-4 text-[13.5px] text-muted-foreground">
          {isParent ? `${c.firstName} didn’t practise on the app this week, so there are no topic scores. Here’s the rest of the week.` : 'No practice on the app this week. Here’s the rest of your week.'}
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3 [&>*]:min-w-0">
        <TopicGroup title="Doing well" icon={CheckCircle2} tone="text-success" topics={c.strong} empty="Nothing to show here this week." link={topicLink} />
        <TopicGroup title="Getting better" icon={TrendingUp} tone="text-info" topics={c.improving} empty="Nothing to show here this week." link={topicLink} />
        <TopicGroup title="Needs attention" icon={AlertCircle} tone="text-warning" topics={c.attention} empty="Nothing needs attention. Well done!" link={topicLink} practise={!isParent} />
      </div>

      {c.highlights.length > 0 && (
        <Card className="p-4 sm:p-5">
          <h2 className="mb-2 font-display text-[15px] font-semibold">The week at a glance</h2>
          <ul className="space-y-1.5 text-[13.5px]">
            {c.highlights.map((h) => (
              <li key={h} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                {h}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="flex gap-3 border-warning/30 bg-warning-soft/30 p-4 sm:p-5">
        <Lightbulb className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0">
          <h2 className="font-display text-[15px] font-semibold">{isParent ? 'One thing to help with' : 'Your next step'}</h2>
          <p className="mt-1 text-[14px] leading-relaxed">{c.recommendation.text}</p>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link to={topicLink}>
              {isParent ? `See ${c.firstName}’s progress` : 'Practise in Exam Academy'} <ArrowRight />
            </Link>
          </Button>
        </div>
      </Card>

      <p className="text-[12px] text-muted-foreground">
        Scores are out of 100 and come from practice, quizzes, homework and tests on the school app. They are separate from official school results.
        {u.source === 'AI' && ' The suggestion was worded with AI help from these facts.'}
      </p>
    </div>
  );
}

function TopicGroup({
  title,
  icon: Icon,
  tone,
  topics,
  empty,
  link,
  practise,
}: {
  title: string;
  icon: typeof CheckCircle2;
  tone: string;
  topics: LearningUpdateTopic[];
  empty: string;
  link: string;
  practise?: boolean;
}) {
  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold">
        <Icon className={cn('size-4', tone)} aria-hidden /> {title}
      </h2>
      {topics.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {topics.map((t) => (
            <li key={t.topicId}>
              <Link to={link} className="block rounded-xl bg-muted/50 px-3 py-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="block text-[13.5px] font-medium leading-snug">{t.topic}</span>
                <span className="block text-[12px] text-muted-foreground">
                  {t.subject} · {t.score} out of 100
                  {t.change ? <span className={cn('font-medium', t.change > 0 ? 'text-success' : 'text-danger')}> ({t.change > 0 ? `up ${t.change}` : `down ${-t.change}`})</span> : null}
                  {practise ? ' · Practise' : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ overview card

/** The latest update on the portal overview; nothing when the school hasn't turned updates on. */
export function LatestLearningUpdateCard({ childId, isParent }: { childId: string; isParent: boolean }) {
  const q = useLearningUpdates(childId);
  const d = q.data;
  if (!d || !d.enabled) return null;
  const u = d.updates[0];
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold">
          <Sparkles className="size-4 text-brand" aria-hidden /> {isParent ? 'This week’s learning update' : 'Your week in learning'}
        </h2>
        <Button asChild variant="ghost" size="sm" className="-mr-2">
          <Link to={portalPath('learning', childId)}>
            All updates <ArrowRight />
          </Link>
        </Button>
      </div>
      {!u ? (
        <p className="text-[13px] text-muted-foreground">The first weekly update will appear here once the school sends it.</p>
      ) : (
        <Link to={updatePath(childId, u.id)} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <p className="text-[12.5px] text-muted-foreground">
            {weekLabel(u.weekStart)} · {summaryLine(u.content)}
          </p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed">{isParent ? u.content.recommendation.text : u.content.studentText}</p>
          <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-brand">
            Read the update <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        </Link>
      )}
    </Card>
  );
}
