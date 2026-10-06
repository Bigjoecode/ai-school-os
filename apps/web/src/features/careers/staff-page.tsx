import { INTEREST_TYPES, RIASEC, TRACK_LABELS, TRACKS, type StaffCareerRow } from '@aischool/shared';
import { Bookmark, BookOpenCheck, Compass, Landmark, Lock, NotebookPen, Route, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { SearchInput } from '@/components/ui/search-input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useDebounced, useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { SectionTitle } from '../learning/components';
import { FilterSelect } from '../platform/ui';
import { StatTile } from '../portal/ui';
import { Strengths } from './advisor-page';
import { useSaveCounsellorNotes, useStaffCareers, useStaffStudentCareer } from './api';
import { CourseRequirements, FitListPlain, InterestBars, InterestChip, INTEREST_BAR, TrackBadge } from './ui';

/** Careers guidance for staff: who has explored what, by class, and each student's plan with counsellor notes. */
export default function CareersGuidancePage() {
  useDocumentTitle('Careers guidance');
  const [classArmId, setClassArmId] = useState<string>();
  const [search, setSearch] = useState('');
  const [track, setTrack] = useState<string>();
  const [open, setOpen] = useState<string | null>(null);
  const q = useStaffCareers(classArmId);
  const d = q.data;
  const s = useDebounced(search.trim().toLowerCase(), 200);
  const rows = useMemo(
    () => (d?.rows ?? []).filter((r) => (!s || r.name.toLowerCase().includes(s) || r.admissionNumber.toLowerCase().includes(s)) && (!track || (track === 'NONE' ? !r.plannedTrack : r.plannedTrack === track))),
    [d, s, track],
  );
  const t = d?.totals;

  return (
    <Page>
      <PageHeader
        eyebrow="Welfare"
        title="Careers guidance"
        description="Students’ interest types, planned SS1 tracks and the careers they’re exploring. Open a student to see their full profile and keep counsellor notes."
        actions={
          <Button asChild variant="outline">
            <Link to="/careers/jamb">
              <Landmark /> JAMB & universities
            </Link>
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <FilterSelect value={classArmId} onChange={setClassArmId} options={(d?.classes ?? []).map((c) => ({ value: c.id, label: c.label }))} label="Class" allLabel="All classes" />
        <FilterSelect value={track} onChange={setTrack} options={[...TRACKS.map((x) => ({ value: x, label: TRACK_LABELS[x] })), { value: 'NONE', label: 'No track yet' }]} label="Planned track" allLabel="Any track" />
        <SearchInput value={search} onChange={setSearch} placeholder="Search students…" label="Search students" className="sm:w-64" />
      </div>
      {q.error && !d ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d || !t ? (
        <div className="space-y-4">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="Students" value={t.students} icon={Users} />
            <StatTile label="Took the quiz" value={`${t.quizDone}`} icon={Sparkles} />
            <StatTile label="Planned a track" value={t.withTrack} icon={Route} />
            <StatTile label="Saved careers" value={d.rows.reduce((n, r) => n + r.savedCareers.length, 0)} icon={Bookmark} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
            <Card className="p-4 sm:p-5">
              <SectionTitle icon={Sparkles} title="Strongest interest type" />
              <Distribution items={RIASEC.map((x) => ({ key: x, label: INTEREST_TYPES[x].name, count: t.byType[x], bar: INTEREST_BAR[x] }))} total={t.quizDone} empty="No one has taken the quiz yet." />
            </Card>
            <Card className="p-4 sm:p-5">
              <SectionTitle icon={Route} title="Planned tracks" />
              <Distribution items={TRACKS.map((x) => ({ key: x, label: TRACK_LABELS[x], count: t.byTrack[x], bar: 'bg-brand' }))} total={t.withTrack} empty="No tracks planned yet." />
            </Card>
            <Card className="p-4 sm:p-5">
              <SectionTitle icon={Compass} title="Most-saved careers" />
              {t.topCareers.length ? (
                <ol className="space-y-1.5 text-[13px]">
                  {t.topCareers.map((c) => (
                    <li key={c.slug} className="flex justify-between gap-2">
                      <span className="truncate">{c.name}</span>
                      <span className="tabular text-muted-foreground">{c.count}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-[13px] text-muted-foreground">No careers saved yet.</p>
              )}
            </Card>
          </div>

          <Card className="overflow-hidden p-0">
            {rows.length === 0 ? (
              <EmptyState icon={Users} title="No students" description={search || track ? 'Nobody matches these filters.' : 'There are no active students in this class.'} />
            ) : (
              <ul className="divide-y divide-border" aria-label="Students">
                {rows.map((r) => (
                  <StudentRow key={r.studentId} r={r} onOpen={() => setOpen(r.studentId)} />
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
      <StudentSheet id={open} onClose={() => setOpen(null)} />
    </Page>
  );
}

function Distribution({ items, total, empty }: { items: { key: string; label: string; count: number; bar: string }[]; total: number; empty: string }) {
  if (!total) return <p className="text-[13px] text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((i) => (
        <li key={i.key} className="flex items-center gap-2 text-[13px]">
          <span className="w-24 shrink-0 truncate">{i.label}</span>
          <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span className={cn('absolute inset-y-0 left-0 rounded-full', i.bar)} style={{ width: `${(100 * i.count) / total}%` }} />
          </span>
          <span className="w-8 shrink-0 text-right tabular text-muted-foreground">{i.count}</span>
        </li>
      ))}
    </ul>
  );
}

function StudentRow({ r, onOpen }: { r: StaffCareerRow; onOpen: () => void }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 sm:w-56">
          <p className="truncate text-[13.5px] font-medium">{r.name}</p>
          <p className="truncate text-[12px] text-muted-foreground">
            {r.className ?? 'No class'} · {r.admissionNumber}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1 sm:w-64">
          {r.top.length ? r.top.slice(0, 3).map((x) => <InterestChip key={x} type={x} />) : <span className="text-[12px] text-muted-foreground">No quiz yet</span>}
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-[12.5px]">
          {r.plannedTrack && <TrackBadge track={r.plannedTrack} />}
          {r.savedCareers.length > 0 && <span className="truncate text-muted-foreground">{r.savedCareers.slice(0, 2).join(', ')}{r.savedCareers.length > 2 ? ` +${r.savedCareers.length - 2}` : ''}</span>}
          {r.targetCourse && <span className="truncate">→ {r.targetCourse}</span>}
          {r.hasNotes && (
            <Badge variant="info">
              <NotebookPen /> Notes
            </Badge>
          )}
        </div>
      </button>
    </li>
  );
}

function StudentSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useStaffStudentCareer(id);
  const d = q.data;
  const save = useSaveCounsellorNotes(id ?? '');
  const [notes, setNotes] = useState('');
  useEffect(() => setNotes(d?.counsellorNotes ?? ''), [d?.counsellorNotes, d?.student.id]);
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetTitle className="px-1 font-display text-lg font-semibold">{d?.student.name ?? 'Student'}</SheetTitle>
        {q.error && !d ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : !d ? (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        ) : (
          <div className="mt-1 space-y-5 px-1 pb-6">
            <p className="text-[12.5px] text-muted-foreground">
              {d.student.className ?? 'No class'} · {d.student.admissionNumber}
              {d.updatedAt && ` · updated ${formatDate(d.updatedAt, { day: 'numeric', month: 'short' })}`}
            </p>
            <section>
              <SectionTitle icon={Sparkles} title="Interest types" />
              {d.interests ? <InterestBars result={d.interests} compact /> : <p className="text-[13px] text-muted-foreground">Hasn’t taken the interest quiz yet.</p>}
            </section>
            <section>
              <SectionTitle icon={Route} title="Plan" />
              <p className="text-[13.5px]">
                Planned track: {d.plan.plannedTrack ? <TrackBadge track={d.plan.plannedTrack} /> : <span className="text-muted-foreground">not chosen</span>}
              </p>
              <p className="mt-1 text-[13.5px]">Target course: {d.plan.targetCourse ?? <span className="text-muted-foreground">not chosen</span>}</p>
              {d.target && <CourseRequirements course={d.target} className="mt-2" />}
              {d.saved.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {d.saved.map((c) => (
                    <span key={c.id} className="rounded-full bg-muted px-2.5 py-1 text-[12.5px]">
                      {c.name}
                    </span>
                  ))}
                </div>
              )}
            </section>
            <section>
              <SectionTitle icon={Route} title="Track advisor" />
              {d.advice.recommendations.some((r) => r.score > 0) ? (
                <ul className="space-y-2 text-[13px]">
                  {d.advice.recommendations.map((r) => (
                    <li key={r.track}>
                      <span className="font-medium">{TRACK_LABELS[r.track]}</span> <span className="text-muted-foreground">· fit {r.score}/100</span>
                      {r.reasons.length > 0 && <p className="text-[12.5px] text-muted-foreground">{r.reasons.join(' ')}</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-muted-foreground">Not enough information yet (no quiz, results or saved careers).</p>
              )}
            </section>
            <section>
              <SectionTitle icon={BookOpenCheck} title="Subjects" />
              <Strengths rows={d.advice.strengths} />
            </section>
            <section>
              <SectionTitle icon={ShieldCheck} title="Subject fit" />
              <FitListPlain fits={d.advice.fits} />
            </section>
            <section>
              <SectionTitle icon={NotebookPen} title="Counsellor notes" />
              {d.canEditNotes ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    save.mutate(notes.trim() || null, { onSuccess: () => toast.success('Notes saved'), onError: (err) => toast.error(errorMessage(err)) });
                  }}
                >
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} maxLength={5000} placeholder="Conversations, agreed next steps, subject advice…" aria-label="Counsellor notes" />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-[11.5px] text-muted-foreground">Staff only — never shown to the student or parents.</p>
                    <Button type="submit" size="sm" loading={save.isPending} disabled={(notes.trim() || null) === (d.counsellorNotes ?? null)}>
                      Save notes
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <Lock className="size-3.5" aria-hidden /> Counsellor notes are for pastoral staff (welfare access).
                </p>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
