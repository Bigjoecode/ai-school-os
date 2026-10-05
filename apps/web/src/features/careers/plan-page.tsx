import { TRACK_LABELS, TRACKS, type Track } from '@aischool/shared';
import { Bookmark, Footprints, GraduationCap, Route, ShieldCheck, Sparkles, X } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { SectionTitle } from '../learning/components';
import { useMyCareerPlan, useSetCareerPlan } from './api';
import { CareerCard, CareersTabs, CoursePicker, CourseRequirements, FitList, InterestChip } from './ui';

export default function CareerPlanPage() {
  useDocumentTitle('My careers plan');
  const q = useMyCareerPlan();
  const setPlan = useSetCareerPlan();
  const d = q.data;
  const save = (body: { plannedTrack?: Track | null; targetCourse?: string | null }, msg: string) => setPlan.mutate(body, { onSuccess: () => toast.success(msg), onError: (e) => toast.error(errorMessage(e)) });

  return (
    <Page className="max-w-5xl">
      <PageHeader eyebrow="Careers" title="My plan" description="Your saved careers, your track and the course you’re aiming for — all in one place to share with your parents and counsellor." />
      <CareersTabs />
      {q.error && !d ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <Card className="p-4 sm:p-5">
              <SectionTitle icon={Route} title="My planned track" action={<Link to="/careers/advisor" className="text-[12.5px] font-medium text-brand hover:underline">Track advisor</Link>} />
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Planned track">
                {TRACKS.map((t) => {
                  const on = d.plan.plannedTrack === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={setPlan.isPending}
                      onClick={() => save({ plannedTrack: on ? null : t }, on ? 'Planned track cleared' : `Planned track set to ${TRACK_LABELS[t]}`)}
                      className={cn('min-h-11 rounded-xl border px-3 text-[14px] font-medium transition-colors disabled:opacity-60', on ? 'border-brand bg-brand-soft text-brand' : 'border-border hover:bg-muted/60')}
                    >
                      {TRACK_LABELS[t]}
                    </button>
                  );
                })}
              </div>
              {d.interests && (
                <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
                  Your interest types:
                  {d.interests.top.map((t) => (
                    <InterestChip key={t} type={t} />
                  ))}
                </div>
              )}
            </Card>
            <Card className="p-4 sm:p-5">
              <SectionTitle icon={GraduationCap} title="Target course" />
              <div className="flex gap-2">
                <CoursePicker value={d.plan.targetCourse} onChange={(v) => save({ targetCourse: v }, 'Target course saved')} disabled={setPlan.isPending} />
                {d.plan.targetCourse && (
                  <Button variant="ghost" size="icon" onClick={() => save({ targetCourse: null }, 'Target course cleared')} aria-label="Clear target course">
                    <X />
                  </Button>
                )}
              </div>
              {d.target && <CourseRequirements course={d.target} className="mt-3" />}
            </Card>
          </div>

          <Card className="p-4 sm:p-5">
            <SectionTitle icon={ShieldCheck} title="Do my subjects fit?" />
            <FitList fits={d.fits} />
          </Card>

          <section>
            <SectionTitle icon={Bookmark} title="Saved careers" action={<Link to="/careers/library" className="text-[12.5px] font-medium text-brand hover:underline">Explore more</Link>} />
            {d.saved.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {d.saved.map((c) => (
                  <CareerCard key={c.id} career={c} saved />
                ))}
              </div>
            ) : (
              <Card className="p-5 text-[13.5px] text-muted-foreground">No saved careers yet. Tap the bookmark on careers you like.</Card>
            )}
          </section>

          <Card className="p-4 sm:p-5">
            <SectionTitle icon={Footprints} title="Next steps" />
            <ol className="space-y-1.5 text-[13.5px]">
              {d.nextSteps.map((s, i) => (
                <li key={s} className="flex gap-2">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/careers/counsellor?ask=Can you look at my plan and tell me what to do next?">
                <Sparkles /> Review my plan with the AI counsellor
              </Link>
            </Button>
          </Card>
        </div>
      )}
    </Page>
  );
}
