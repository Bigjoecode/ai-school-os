import { INTEREST_TYPES, TRACK_LABELS } from '@aischool/shared';
import { ArrowRight, Compass, ListChecks, MessageCircleHeart, Route, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentTitle } from '@/lib/hooks';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SectionTitle, SeeAll } from '../learning/components';
import { useCareerHome } from './api';
import { CareerCard, CareersTabs, InterestBars, InterestChip } from './ui';

export default function CareersHomePage() {
  useDocumentTitle('Careers');
  const q = useCareerHome();
  const d = q.data;
  return (
    <Page className="max-w-6xl">
      <PageHeader eyebrow="Careers" title={d ? `Your future, ${d.student.firstName}` : 'Your future'} description="Discover what you enjoy, explore careers and plan your subjects, JAMB and university — one step at a time." />
      <CareersTabs />
      {q.error && !d ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl lg:col-span-2" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-5 [&>*]:min-w-0">
            <Card className="p-5 lg:col-span-2">
              {d.interests ? (
                <>
                  <SectionTitle icon={Sparkles} title="Your top interests" action={<SeeAll to="/careers/results" label="Results" />} />
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {d.interests.top.map((t) => (
                      <InterestChip key={t} type={t} className="text-[12.5px]" />
                    ))}
                  </div>
                  <p className="mb-4 text-[13px] text-muted-foreground">{INTEREST_TYPES[d.interests.top[0]!].blurb}</p>
                  <InterestBars result={d.interests} compact />
                  <p className="mt-3 text-[11.5px] text-muted-foreground">
                    Quiz taken {formatDate(d.interests.completedAt, { day: 'numeric', month: 'short', year: 'numeric' })} ·{' '}
                    <Link to="/careers/quiz" className="font-medium text-brand hover:underline">
                      Retake
                    </Link>
                  </p>
                </>
              ) : (
                <div className="flex h-full flex-col items-start">
                  <span className="grid size-11 place-items-center rounded-xl bg-ai-gradient text-white">
                    <ListChecks className="size-5" aria-hidden />
                  </span>
                  <h2 className="mt-3 font-display text-lg font-semibold tracking-tight">What do you enjoy?</h2>
                  <p className="mt-1 text-[13.5px] text-muted-foreground">Answer 36 quick statements (about 5 minutes). There are no right or wrong answers — we’ll show the kinds of work that suit you.</p>
                  <Button asChild variant="ai" className="mt-4">
                    <Link to="/careers/quiz">
                      Take the interest quiz <ArrowRight />
                    </Link>
                  </Button>
                </div>
              )}
            </Card>
            <div className="grid grid-cols-2 gap-3 lg:col-span-3 [&>*]:min-w-0">
              {[
                { to: '/careers/library', label: 'Explore careers', hint: `${d.total} careers to discover`, icon: Compass, tone: 'bg-brand-soft text-brand' },
                { to: '/careers/advisor', label: 'Track advisor', hint: 'Science, Arts, Commercial or Technical?', icon: Route, tone: 'bg-info-soft text-info' },
                { to: '/careers/counsellor', label: 'AI counsellor', hint: 'Talk your ideas through', icon: MessageCircleHeart, tone: 'bg-ai-gradient text-white' },
                { to: '/careers/plan', label: 'My plan', hint: d.plan.plannedTrack ? `${TRACK_LABELS[d.plan.plannedTrack]} track${d.plan.targetCourse ? ` · ${d.plan.targetCourse}` : ''}` : 'Saved careers, track and course', icon: Sparkles, tone: 'bg-warning-soft text-warning' },
              ].map((a) => (
                <Link key={a.to} to={a.to} className="group flex min-w-0 flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:border-border-strong">
                  <span className={cn('grid size-10 place-items-center rounded-xl [&_svg]:size-5', a.tone)}>
                    <a.icon aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display text-[15px] font-semibold tracking-tight">{a.label}</span>
                    <span className="block truncate text-[12.5px] text-muted-foreground">{a.hint}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {d.suggestions.length > 0 && (
            <section>
              <SectionTitle icon={Sparkles} title="Suggested for you" action={<SeeAll to="/careers/results" label="All matches" />} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {d.suggestions.map((c) => (
                  <CareerCard key={c.id} career={c} match={c.match} reasons={c.reasons} saved={d.plan.savedCareers.includes(c.slug)} />
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionTitle icon={Compass} title="Your saved careers" action={d.saved.length ? <SeeAll to="/careers/plan" label="My plan" /> : undefined} />
            {d.saved.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {d.saved.map((c) => (
                  <CareerCard key={c.id} career={c} saved />
                ))}
              </div>
            ) : (
              <Card className="p-5 text-[13.5px] text-muted-foreground">
                Nothing saved yet. Tap the bookmark on any career you’d like to come back to.{' '}
                <Link to="/careers/library" className="font-medium text-brand hover:underline">
                  Browse the library
                </Link>
              </Card>
            )}
          </section>

          {d.fields.length > 0 && (
            <section>
              <SectionTitle icon={Compass} title="Browse by field" />
              <div className="flex flex-wrap gap-2">
                {d.fields.map((f) => (
                  <Link key={f.field} to={`/careers/library?field=${encodeURIComponent(f.field)}`} className="rounded-full border border-border bg-card px-3 py-1.5 text-[13px] transition-colors hover:border-border-strong hover:bg-muted/60">
                    {f.field} <span className="text-muted-foreground">· {f.count}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Page>
  );
}
