import { ArrowLeft, Brain, CalendarCheck2, MessageCircle, Sparkles, Trophy } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import { AccessMeter, AddMemoryForm, AttemptList, MasteryMapView, MemoryList, SectionTitle, TopicChip } from '../learning/components';
import { useChildProgress, useTellTutor } from './api';

export default function ChildProgressPage() {
  const { id = '' } = useParams();
  const q = useChildProgress(id);
  const tell = useTellTutor(id);
  const d = q.data;
  const first = d?.access.name.split(' ')[0] ?? 'your child';
  const activePlans = d?.plans.filter((p) => p.status !== 'ARCHIVED') ?? [];

  return (
    <Page className="max-w-6xl">
      <PageHeader
        eyebrow={
          <Link to="/family" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" /> My family
          </Link>
        }
        title={d ? `${d.access.name}’s learning` : 'Learning progress'}
        description={d ? `How ${first} is getting on with the AI tutor, practice and exam prep this term.` : undefined}
      />
      {q.error && !d ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-72 rounded-2xl lg:col-span-3" />
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
            <Card className="p-5">
              <AccessMeter access={d.access} title="AI learning this term" />
            </Card>
            <Card className="p-5 lg:col-span-2">
              <div className="grid grid-cols-3 gap-3">
                <Stat icon={MessageCircle} label="Tutor chats" value={d.tutorConversations} hint="this term" />
                <Stat icon={Trophy} label="Practice sets" value={d.attempts.filter((a) => a.submittedAt).length} hint="recently" />
                <Stat icon={CalendarCheck2} label="Study plans" value={activePlans.length} hint="on the go" />
              </div>
              {(d.mastery.weakest.length > 0 || d.mastery.strongest.length > 0) && (
                <div className="mt-5 grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                  <div>
                    <p className="mb-2 text-[12px] font-medium text-muted-foreground">Could use some support</p>
                    <div className="flex flex-wrap gap-1.5">
                      {d.mastery.weakest.slice(0, 4).map((t) => (
                        <TopicChip key={t.topicId} t={t} />
                      ))}
                      {d.mastery.weakest.length === 0 && <span className="text-[13px] text-muted-foreground">Nothing stands out.</span>}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-[12px] font-medium text-muted-foreground">Going really well</p>
                    <div className="flex flex-wrap gap-1.5">
                      {d.mastery.strongest.slice(0, 4).map((t) => (
                        <TopicChip key={t.topicId} t={t} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </div>

          <section aria-label="Mastery map">
            <SectionTitle icon={Sparkles} title="Mastery by subject" />
            <MasteryMapView map={d.mastery} />
          </section>

          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <Card className="p-5">
              <SectionTitle icon={CalendarCheck2} title="Study plans" />
              {activePlans.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">{first} hasn’t made a study plan yet.</p>
              ) : (
                <ul className="space-y-4">
                  {activePlans.map((p) => (
                    <li key={p.id}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-[13.5px] font-medium">{p.title}</p>
                        <Badge variant={p.status === 'DONE' ? 'success' : 'brand'}>{p.status === 'DONE' ? 'Done' : `${p.progressPct}%`}</Badge>
                      </div>
                      <p className="mb-1.5 truncate text-[12px] text-muted-foreground">
                        {p.goal} · {formatDate(p.startsOn, { day: 'numeric', month: 'short' })} – {formatDate(p.endsOn, { day: 'numeric', month: 'short' })}
                      </p>
                      <Progress value={p.progressPct} barClassName="bg-success" label={`${p.title} progress`} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-5">
              <SectionTitle icon={Trophy} title="Recent practice and mocks" />
              <AttemptList rows={d.attempts.slice(0, 8)} linkable={false} empty={`${first} hasn’t done any practice yet.`} />
            </Card>
          </div>

          <Card className="p-5">
            <SectionTitle icon={Brain} title="What the tutor remembers" />
            <p className="mb-3 text-[13px] text-muted-foreground">The tutor uses these notes to explain things in a way that suits {first}. You know them best — tell it something helpful.</p>
            <AddMemoryForm onAdd={(v) => tell.mutateAsync(v)} pending={tell.isPending} placeholder={`e.g. ${first} learns best with diagrams`} />
            <div className="mt-3">
              <MemoryList memories={d.memories} parentView />
            </div>
          </Card>
        </div>
      )}
    </Page>
  );
}

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Brain; label: string; value: number; hint: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/60 p-3">
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      <p className="mt-2 font-display text-2xl font-semibold tabular leading-none">{value}</p>
      <p className="mt-1 truncate text-[12px] font-medium">{label}</p>
      <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
