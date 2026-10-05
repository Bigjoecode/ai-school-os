import { TRACK_BLURBS, TRACK_LABELS, TRACKS, type SubjectStrength, type Track, type TrackAdvice } from '@aischool/shared';
import { BookOpenCheck, Check, Info, ListChecks, Route, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { SectionTitle } from '../learning/components';
import { useSetCareerPlan, useTrackAdvice } from './api';
import { CareersTabs, FitList } from './ui';

export default function TrackAdvisorPage() {
  useDocumentTitle('Track advisor');
  const q = useTrackAdvice();
  const setPlan = useSetCareerPlan();
  const d = q.data;
  const choose = (t: Track | null) =>
    setPlan.mutate({ plannedTrack: t }, { onSuccess: () => toast.success(t ? `Planned track set to ${TRACK_LABELS[t]}` : 'Planned track cleared'), onError: (e) => toast.error(errorMessage(e)) });
  return (
    <Page className="max-w-5xl">
      <PageHeader eyebrow="Careers" title="Track advisor" description="Science, Arts, Commercial or Technical? See how each SS1 track fits your interests, your results and the careers you’ve saved." />
      <CareersTabs />
      {q.error && !d ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-4">
          {d.stageNote && (
            <Card className="flex gap-3 p-4 text-[13.5px]">
              <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
              <p>{d.stageNote}</p>
            </Card>
          )}
          {!d.interests && (
            <Card className="flex flex-col items-start gap-2 p-4 text-[13.5px] sm:flex-row sm:items-center">
              <ListChecks className="size-4 shrink-0 text-brand" aria-hidden />
              <p className="min-w-0 flex-1">Take the interest quiz first — the advice is much better when we know what you enjoy.</p>
              <Link to="/careers/quiz" className="font-medium text-brand hover:underline">
                Take the quiz
              </Link>
            </Card>
          )}
          <Recommendations advice={d} onChoose={choose} pending={setPlan.isPending} />

          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <Card className="p-4 sm:p-5">
              <SectionTitle icon={BookOpenCheck} title="Your subjects so far" />
              <Strengths rows={d.strengths} />
            </Card>
            <Card className="p-4 sm:p-5">
              <SectionTitle icon={ShieldCheck} title="Do your subjects fit your goals?" />
              {d.subjects && <p className="mb-3 text-[12.5px] text-muted-foreground">Checked against {d.subjects.basis}.</p>}
              <FitList fits={d.fits} />
              <p className="mt-3 text-[11.5px] text-muted-foreground">We only check against requirements a person has verified from the JAMB brochure. Always confirm with the current brochure and your school counsellor.</p>
            </Card>
          </div>
        </div>
      )}
    </Page>
  );
}

function Recommendations({ advice, onChoose, pending }: { advice: TrackAdvice; onChoose: (t: Track | null) => void; pending: boolean }) {
  const hasData = advice.recommendations.some((r) => r.score > 0);
  const best = hasData ? advice.recommendations[0]?.track : null;
  return (
    <Card className="p-4 sm:p-5">
      <SectionTitle icon={Route} title={hasData ? 'How each track fits you' : 'The four tracks'} />
      {!hasData && <p className="mb-3 text-[13px] text-muted-foreground">Once you’ve taken the quiz or have some results, we’ll show how each track fits you.</p>}
      <ul className="space-y-3">
        {(hasData ? advice.recommendations : TRACKS.map((track) => ({ track, score: 0, reasons: [] as string[] }))).map((r) => {
          const planned = advice.plannedTrack === r.track;
          return (
            <li key={r.track} className={cn('rounded-xl border p-3 sm:p-4', planned ? 'border-brand bg-brand-soft/30' : 'border-border')}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-[16px] font-semibold tracking-tight">{TRACK_LABELS[r.track]}</h3>
                {best === r.track && <Badge variant="brand">Best fit right now</Badge>}
                {planned && (
                  <Badge variant="success" dot>
                    Your plan
                  </Badge>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onChoose(planned ? null : r.track)}
                  className={cn('ml-auto inline-flex min-h-9 items-center gap-1 rounded-lg border px-3 text-[12.5px] font-medium transition-colors disabled:opacity-50', planned ? 'border-border text-muted-foreground hover:bg-muted' : 'border-brand/40 text-brand hover:bg-brand-soft')}
                >
                  {planned ? 'Clear' : (
                    <>
                      <Check className="size-3.5" aria-hidden /> Plan this track
                    </>
                  )}
                </button>
              </div>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">{TRACK_BLURBS[r.track]}</p>
              {hasData && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${Math.max(3, r.score)}%` }} />
                  </span>
                  <span className="w-20 shrink-0 text-right text-[12px] text-muted-foreground">{r.score >= 60 ? 'Strong fit' : r.score >= 40 ? 'Good fit' : 'Less of a fit'}</span>
                </div>
              )}
              {r.reasons.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-[13px]">
                  {r.reasons.map((x) => (
                    <li key={x}>• {x}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11.5px] text-muted-foreground">This is guidance, not a rule: your school decides class placements, and you can talk it through with your parents and counsellor.</p>
    </Card>
  );
}

export function Strengths({ rows }: { rows: SubjectStrength[] }) {
  if (!rows.length) return <p className="text-[13px] text-muted-foreground">No results or practice yet. As your teachers record results and you practise in Exam Academy, your strengths will show here.</p>;
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="text-left text-[11.5px] text-muted-foreground">
          <th className="pb-1.5 font-medium">Subject</th>
          <th className="pb-1.5 text-right font-medium">School result</th>
          <th className="pb-1.5 text-right font-medium">Practice</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((s) => (
          <tr key={s.subject}>
            <td className="py-1.5 pr-2">{s.subject}</td>
            <td className={cn('py-1.5 text-right tabular', s.official !== null && s.official >= 65 && 'font-semibold text-success')}>{s.official !== null ? `${s.official}%` : '—'}</td>
            <td className="py-1.5 text-right tabular text-muted-foreground">{s.practice !== null ? `${s.practice}%` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
