import { INTEREST_TYPES, TRACK_LABELS } from '@aischool/shared';
import { Bookmark, ChevronRight, Compass, GraduationCap, Landmark, Route, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import { usePortalCareers } from '../careers/api';
import { CourseRequirements, FitListPlain, InterestBars, InterestChip, TrackBadge } from '../careers/ui';
import { SectionTitle } from '../learning/components';
import { PortalShell, type ShellCtx } from './ui';

/** "Careers": a parent's read-only view of their child's interest results, saved careers and plan. */
export default function PortalCareersPage() {
  return (
    <PortalShell section="careers" title={({ child }) => `${child.firstName}’s careers plan`} description={({ child }) => `What ${child.firstName} enjoys, the careers they’re exploring and their plan for subjects, JAMB and university.`}>
      {(ctx) => <Body {...ctx} />}
    </PortalShell>
  );
}

/** JAMB's brochure, read-only, for parents too. */
function JambLink() {
  return (
    <Link to="/careers/jamb" className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft transition-colors hover:border-border-strong">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
        <Landmark className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[15px] font-semibold tracking-tight">JAMB & universities</span>
        <span className="block text-[12.5px] text-muted-foreground">JAMB’s official brochure: institutions, course requirements, an eligibility checker, the UTME syllabus and FAQ.</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

function Body({ child }: ShellCtx) {
  const q = usePortalCareers(child.id);
  const d = q.data;
  if (q.error && !d) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!d) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  }
  const started = d.interests || d.saved.length || d.plan.plannedTrack || d.plan.targetCourse;
  if (!started) {
    return (
      <div className="space-y-4">
        <Card>
          <EmptyState
            icon={Compass}
            title={`${child.firstName} hasn’t started yet`}
            description={`In Careers, ${child.firstName} can take an interest quiz, explore careers and plan their SS1 track. Encourage them to try it — it takes about 5 minutes — and you’ll see their plan here.`}
          />
        </Card>
        <JambLink />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
        <Card className="p-4 sm:p-5">
          <SectionTitle icon={Sparkles} title="Interest types" />
          {d.interests ? (
            <>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {d.interests.top.map((t) => (
                  <InterestChip key={t} type={t} className="text-[12.5px]" />
                ))}
              </div>
              <p className="mb-3 text-[13px] text-muted-foreground">{INTEREST_TYPES[d.interests.top[0]!].blurb.replace(/^You like/, `${child.firstName} likes`)}</p>
              <InterestBars result={d.interests} compact />
              <p className="mt-3 text-[11.5px] text-muted-foreground">Quiz taken {formatDate(d.interests.completedAt, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
            </>
          ) : (
            <p className="text-[13px] text-muted-foreground">{child.firstName} hasn’t taken the interest quiz yet.</p>
          )}
        </Card>
        <Card className="p-4 sm:p-5">
          <SectionTitle icon={Route} title="The plan" />
          <dl className="space-y-3 text-[13.5px]">
            <div>
              <dt className="text-[11.5px] font-medium text-muted-foreground">Planned SS1 track</dt>
              <dd className="mt-0.5">{d.plan.plannedTrack ? <TrackBadge track={d.plan.plannedTrack} /> : 'Not chosen yet'}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground">
                <GraduationCap className="size-3.5" aria-hidden /> Target course
              </dt>
              <dd className="mt-0.5">{d.plan.targetCourse ?? 'Not chosen yet'}</dd>
            </div>
          </dl>
          {d.target && <CourseRequirements course={d.target} className="mt-3" />}
          {d.updatedAt && <p className="mt-3 text-[11.5px] text-muted-foreground">Last updated {formatDate(d.updatedAt, { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
        </Card>
      </div>

      <Card className="p-4 sm:p-5">
        <SectionTitle icon={Bookmark} title="Careers they’re exploring" />
        {d.saved.length ? (
          <ul className="divide-y divide-border">
            {d.saved.map((c) => (
              <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[14px] font-medium">{c.name}</p>
                  <span className="text-[12px] text-muted-foreground">{c.field}</span>
                  {c.tracks.map((t) => (
                    <Badge key={t} variant="outline">
                      {TRACK_LABELS[t]}
                    </Badge>
                  ))}
                </div>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{c.summary}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">No careers saved yet.</p>
        )}
      </Card>

      <Card className="p-4 sm:p-5">
        <SectionTitle icon={ShieldCheck} title="Do the subjects fit?" />
        <FitListPlain fits={d.fits} />
        <p className="mt-3 text-[11.5px] text-muted-foreground">Admission requirements are shown only once checked against the JAMB brochure. For cut-off marks and the latest requirements, check the current JAMB brochure and speak with the school’s guidance counsellor.</p>
      </Card>
      <JambLink />
    </div>
  );
}
