import { INTEREST_TYPES } from '@aischool/shared';
import { ArrowLeft, BadgeCheck, Briefcase, ChevronRight, GraduationCap, Landmark, Lightbulb, MessageCircleHeart, Route, Sparkles, TrendingUp } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Page } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { useDocumentTitle } from '@/lib/hooks';
import { SectionTitle } from '../learning/components';
import { useCareer } from './api';
import { CareerCard, CourseRequirements, InterestChip, SaveCareerButton, TrackBadge } from './ui';

export default function CareerPage() {
  const { slug = '' } = useParams();
  const q = useCareer(slug);
  const c = q.data;
  useDocumentTitle(c?.name ?? 'Career');

  if (q.error && !c) {
    return (
      <Page className="max-w-4xl">
        {q.error instanceof ApiError && q.error.status === 404 ? (
          <Card>
            <EmptyState icon={Briefcase} title="Career not found" description="It may have been renamed or removed." action={<Button asChild variant="outline"><Link to="/careers/library">Back to the library</Link></Button>} />
          </Card>
        ) : (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        )}
      </Page>
    );
  }
  if (!c) {
    return (
      <Page className="max-w-4xl">
        <Skeleton className="mb-3 h-5 w-32" />
        <Skeleton className="mb-6 h-9 w-72 max-w-full" />
        <Skeleton className="h-64 rounded-2xl" />
      </Page>
    );
  }

  return (
    <Page className="max-w-4xl">
      <Link to="/careers/library" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden /> Career library
      </Link>
      <header className="mb-5">
        <p className="text-[12.5px] font-medium text-muted-foreground">{c.field}</p>
        <div className="flex flex-wrap items-start gap-3">
          <h1 className="min-w-0 flex-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">{c.name}</h1>
          <SaveCareerButton slug={c.slug} saved={c.saved} />
        </div>
        <p className="mt-2 text-[15px] text-muted-foreground">{c.summary}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {c.interests.map((t) => (
            <InterestChip key={t} type={t} />
          ))}
          {c.tracks.map((t) => (
            <TrackBadge key={t} track={t} />
          ))}
        </div>
      </header>

      <div className="space-y-4">
        {c.fitNotes.length > 0 && (
          <Card className="border-brand/20 bg-brand-soft/30 p-4 sm:p-5">
            <SectionTitle icon={Sparkles} title="You and this career" />
            <ul className="space-y-1 text-[13.5px]">
              {c.fitNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="p-4 sm:p-5">
          <SectionTitle icon={Briefcase} title="What the work is like" />
          {c.description && <p className="whitespace-pre-line text-[14px]">{c.description}</p>}
          {c.dayToDay && (
            <>
              <h3 className="mb-1 mt-4 text-[13px] font-semibold">A typical day</h3>
              <p className="whitespace-pre-line text-[14px] text-muted-foreground">{c.dayToDay}</p>
            </>
          )}
          {c.skills.length > 0 && (
            <>
              <h3 className="mb-2 mt-4 text-[13px] font-semibold">Skills you’ll use</h3>
              <div className="flex flex-wrap gap-1.5">
                {c.skills.map((s) => (
                  <span key={s} className="rounded-full bg-muted px-2.5 py-1 text-[12.5px]">
                    {s}
                  </span>
                ))}
              </div>
            </>
          )}
          {c.interests.length > 0 && <p className="mt-4 text-[12.5px] text-muted-foreground">Suits {c.interests.map((t) => `${INTEREST_TYPES[t].name}s`).join(', ')}: {INTEREST_TYPES[c.interests[0]!].blurb}</p>}
        </Card>

        <Card className="p-4 sm:p-5">
          <SectionTitle icon={Lightbulb} title="Subjects that help" />
          {c.subjects.length ? (
            <div className="flex flex-wrap gap-1.5">
              {c.subjects.map((s) => (
                <Link key={s} to={`/careers/library?subject=${encodeURIComponent(s)}`} className="rounded-full border border-border px-2.5 py-1 text-[12.5px] hover:bg-muted/60">
                  {s}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">No particular subjects listed.</p>
          )}
          <p className="mt-3 text-[12px] text-muted-foreground">These subjects build useful knowledge. Exact admission requirements are on each course below.</p>
        </Card>

        <Card className="p-4 sm:p-5">
          <SectionTitle icon={GraduationCap} title="University and polytechnic courses" />
          {c.courseViews.length ? (
            <div className="grid gap-2 sm:grid-cols-2 [&>*]:min-w-0">
              {c.courseViews.map((v) => (
                <CourseRequirements key={v.name} course={v} />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">No degree courses listed for this career.</p>
          )}
          {c.otherRoutes && (
            <>
              <h3 className="mb-1 mt-4 flex items-center gap-1.5 text-[13px] font-semibold">
                <Route className="size-3.5" aria-hidden /> Other routes in
              </h3>
              <p className="whitespace-pre-line text-[13.5px] text-muted-foreground">{c.otherRoutes}</p>
            </>
          )}
        </Card>

        <Card className="p-4 sm:p-5">
          <SectionTitle icon={Landmark} title="Where to study this" action={<Link to="/careers/jamb" className="text-[12.5px] font-medium text-brand hover:underline">JAMB & universities</Link>} />
          {c.whereToStudy.length ? (
            <ul className="divide-y divide-border">
              {c.whereToStudy.flatMap((l) =>
                l.courses.slice(0, 2).map((j) => (
                  <li key={`${l.name}-${j.id}`}>
                    <Link to={`/careers/jamb/courses/${j.id}`} className="flex min-h-12 items-center gap-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-medium">{j.name}</span>
                        <span className="block text-[12px] text-muted-foreground">
                          {j.level === 'ND' ? 'Polytechnics (ND)' : j.level === 'NCE' ? 'Colleges of education (NCE)' : 'Universities'} · offered at {j.institutionCount} institution{j.institutionCount === 1 ? '' : 's'}
                        </span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                )),
              )}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">We couldn’t match these courses to JAMB’s brochure yet. Search for them under JAMB & universities.</p>
          )}
          <p className="mt-2 text-[11.5px] text-muted-foreground">From JAMB’s brochure: each course page lists every institution offering it, with JAMB’s requirements.</p>
        </Card>

        {(c.professionalBodies.length > 0 || c.outlook) && (
          <Card className="p-4 sm:p-5">
            {c.professionalBodies.length > 0 && (
              <>
                <SectionTitle icon={BadgeCheck} title="Professional bodies and licences" />
                <ul className="list-disc space-y-0.5 pl-5 text-[13.5px]">
                  {c.professionalBodies.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </>
            )}
            {c.outlook && (
              <div className={c.professionalBodies.length ? 'mt-4' : ''}>
                <SectionTitle icon={TrendingUp} title="Outlook" />
                <p className="text-[13.5px] text-muted-foreground">{c.outlook}</p>
              </div>
            )}
          </Card>
        )}

        <Card className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ai-gradient text-white">
            <MessageCircleHeart className="size-5" aria-hidden />
          </span>
          <p className="min-w-0 flex-1 text-[13.5px]">Curious? Ask the AI counsellor what it’s really like to be a {c.name.toLowerCase()} and how to get started.</p>
          <Button asChild variant="outline">
            <Link to={`/careers/counsellor?ask=${encodeURIComponent(`Tell me about becoming a ${c.name}. Does it suit me?`)}`}>Ask the counsellor</Link>
          </Button>
        </Card>

        {c.related.length > 0 && (
          <section>
            <SectionTitle icon={Briefcase} title={`More in ${c.field}`} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {c.related.map((r) => (
                <CareerCard key={r.id} career={r} />
              ))}
            </div>
          </section>
        )}
      </div>
    </Page>
  );
}
