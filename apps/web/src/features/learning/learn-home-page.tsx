import { ArrowRight, BookOpenCheck, CalendarCheck2, Layers, MessageCircleQuestion, Sparkles, Target, Trophy, Zap } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/lib/auth-store';
import { greeting, todayIso } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useLearnHome, useUpdatePlan } from './api';
import { AccessMeter, AttemptList, QuickQuizDialog, SectionTitle, SeeAll, TopicChip } from './components';

export default function LearnHomePage() {
  const me = useMe();
  const q = useLearnHome();
  const d = q.data;
  const update = useUpdatePlan();
  const [quiz, setQuiz] = useState<{ subject: string; topic: string } | null>(null);
  const today = todayIso();
  const todays = (d?.plans ?? []).flatMap((p) => p.items.map((it, index) => ({ ...it, index, plan: p })).filter((it) => it.date === today));

  const actions = [
    { to: '/learn/tutor', label: 'Ask my tutor', hint: 'Homework help, step by step', icon: MessageCircleQuestion, tone: 'bg-ai-gradient text-white' },
    { to: '#quiz', label: 'Quick quiz', hint: 'Check a topic in 2 minutes', icon: Target, tone: 'bg-brand-soft text-brand' },
    { to: '/learn/flashcards', label: 'Flashcards', hint: d ? (d.dueCards ? `${d.dueCards} due today` : 'All caught up') : 'Review cards', icon: Layers, tone: 'bg-info-soft text-info' },
    { to: '/learn/exams', label: 'Exam Academy', hint: 'BECE, WAEC, NECO, JAMB', icon: Trophy, tone: 'bg-warning-soft text-warning' },
  ];

  return (
    <Page className="max-w-6xl">
      <PageHeader eyebrow="Learning" title={`${greeting()}${me?.user.firstName ? `, ${me.user.firstName}` : ''}`} description="Little and often wins. Here’s what’s next for you today." />
      {q.error && !d ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-48 rounded-2xl lg:col-span-1" />
          <Skeleton className="h-48 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-40 rounded-2xl lg:col-span-3" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
            <Card className="p-5">
              <AccessMeter access={d.access} />
              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border pt-4">
                {d.access.photos && <span className="rounded-full bg-muted px-2.5 py-1 text-[12px]">Photo questions</span>}
                {d.access.deepAllowed && <span className="rounded-full bg-muted px-2.5 py-1 text-[12px]">Deeper explanations</span>}
                {d.access.studyTools && <span className="rounded-full bg-muted px-2.5 py-1 text-[12px]">Plans & flashcards</span>}
                {d.access.exams.map((e) => (
                  <span key={e} className="rounded-full bg-warning-soft px-2.5 py-1 text-[12px] text-warning">{e} Prep</span>
                ))}
                {!d.access.studyTools && <span className="text-[12px] text-muted-foreground">Ask a parent about AI Student Plus for study plans, flashcards and photo questions.</span>}
              </div>
            </Card>
            <div className="grid grid-cols-2 gap-3 lg:col-span-2 [&>*]:min-w-0">
              {actions.map((a) => (
                <Link
                  key={a.label}
                  to={a.to === '#quiz' ? '/learn' : a.to}
                  onClick={(e) => {
                    if (a.to !== '#quiz') return;
                    e.preventDefault();
                    setQuiz({ subject: '', topic: d.weakest[0]?.topic ?? '' });
                  }}
                  className="group flex min-w-0 flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:border-border-strong"
                >
                  <span className={cn('grid size-10 place-items-center rounded-xl [&_svg]:size-5', a.tone)}>
                    <a.icon aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 font-display text-[15px] font-semibold tracking-tight">
                      {a.label} <ArrowRight className="size-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />
                    </span>
                    <span className="block truncate text-[12.5px] text-muted-foreground">{a.hint}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-5 lg:items-start [&>*]:min-w-0">
            <Card className="p-5 lg:col-span-3">
              <SectionTitle icon={CalendarCheck2} title="Today’s study plan" action={<SeeAll to="/learn/plans" label="All plans" />} />
              {todays.length === 0 ? (
                <div className="rounded-xl bg-muted/60 px-4 py-5 text-[13px] text-muted-foreground">
                  {d.plans.length ? 'Nothing planned for today — a great day for a quick quiz.' : d.access.studyTools ? 'No study plan yet. Make one around a goal and the tutor will map out each day.' : 'Study plans come with AI Student Plus.'}{' '}
                  <Link to="/learn/plans" className="font-medium text-brand hover:underline">
                    {d.plans.length ? 'See your plans' : d.access.studyTools ? 'Make a plan' : 'Find out more'}
                  </Link>
                </div>
              ) : (
                <ul className="space-y-2">
                  {todays.map((it) => (
                    <li key={`${it.plan.id}-${it.index}`}>
                      <label className={cn('flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-muted/50', it.done && 'bg-success-soft/40')}>
                        <Checkbox checked={it.done} onCheckedChange={(v) => update.mutate({ id: it.plan.id, itemIndex: it.index, done: v === true })} className="mt-0.5" aria-label={`Mark ${it.topic} done`} />
                        <span className="min-w-0 flex-1">
                          <span className={cn('block text-[13.5px] font-medium', it.done && 'text-muted-foreground line-through')}>{it.activity}</span>
                          <span className="text-[12px] text-muted-foreground">
                            {it.subject} · {it.topic} · {it.minutes} min
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-5 lg:col-span-2">
              <SectionTitle icon={Sparkles} title="Your topics" action={<SeeAll to="/learn/progress" label="Progress" />} />
              {d.weakest.length + d.strongest.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">Practise a few questions and we’ll show what’s going well and what to work on.</p>
              ) : (
                <div className="space-y-4">
                  {d.weakest.length > 0 && (
                    <div>
                      <p className="mb-2 text-[12px] font-medium text-muted-foreground">Worth another look</p>
                      <div className="flex flex-wrap gap-1.5">
                        {d.weakest.slice(0, 4).map((t) => (
                          <button key={t.topicId} type="button" className="max-w-full" onClick={() => setQuiz({ subject: t.parent ?? '', topic: t.topic })} title="Quiz me on this">
                            <TopicChip t={t} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {d.strongest.length > 0 && (
                    <div>
                      <p className="mb-2 text-[12px] font-medium text-muted-foreground">Going really well</p>
                      <div className="flex flex-wrap gap-1.5">
                        {d.strongest.slice(0, 4).map((t) => (
                          <TopicChip key={t.topicId} t={t} />
                        ))}
                      </div>
                    </div>
                  )}
                  <button type="button" onClick={() => setQuiz({ subject: '', topic: d.weakest[0]?.topic ?? '' })} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:underline">
                    <Zap className="size-3.5" aria-hidden /> Quick quiz
                  </button>
                </div>
              )}
            </Card>
          </div>

          <Card className="p-5">
            <SectionTitle icon={BookOpenCheck} title="Recent practice" action={<SeeAll to="/learn/exams" label="Exam Academy" />} />
            <AttemptList rows={d.recent.slice(0, 5)} empty="No practice yet — try a quick quiz or a past-question set." />
          </Card>
        </div>
      )}
      <QuickQuizDialog open={!!quiz} onOpenChange={(o) => !o && setQuiz(null)} subject={quiz?.subject} topic={quiz?.topic} />
    </Page>
  );
}
