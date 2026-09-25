import type { AttendanceStatus, StudentAttendanceView } from '@aischool/shared';
import { CHRONIC_ABSENCE_THRESHOLD } from '@aischool/shared';
import { AlertTriangle, CalendarX2, MessageSquareText, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Page } from '@/components/layout/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Tip } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { formatDate, todayIso } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { cn, initialsFromName } from '@/lib/utils';
import { useStructure } from '../academics/api';
import { termDates, TermSelect } from '../planning/pickers';
import { BackLink, DetailSkeleton } from '../planning/ui';
import { useStudentAttendance } from './api';
import { WeekdayBars } from './charts';
import { ParentMessageDialog } from './parent-message-dialog';
import { addDays, datesBetween, isoWeekday, plural, RateRing, STATUS_META, totalMarked, WEEKDAY_SHORT } from './ui';

export default function StudentAttendancePage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const termId = params.get('termId') ?? undefined;
  const query = useStudentAttendance(id, termId);
  const v = query.data;

  if (query.isLoading) {
    return (
      <Page className="max-w-6xl">
        <DetailSkeleton />
      </Page>
    );
  }
  if (!v) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <Page className="max-w-6xl">
        <BackLink to="/attendance?tab=reports">Attendance</BackLink>
        {notFound ? (
          <EmptyState icon={UserRound} title="Learner not found" description="They may have left the school, or there’s no term set up yet." />
        ) : (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        )}
      </Page>
    );
  }
  return (
    <StudentView
      v={v}
      termId={termId}
      onTermChange={(t) =>
        setParams(
          (prev) => {
            const p = new URLSearchParams(prev);
            if (t) p.set('termId', t);
            else p.delete('termId');
            return p;
          },
          { replace: true },
        )
      }
    />
  );
}

function StudentView({ v, termId, onTermChange }: { v: StudentAttendanceView; termId: string | undefined; onTermChange: (t: string | undefined) => void }) {
  useDocumentTitle(`${v.student.name} · Attendance`);
  const structure = useStructure();
  const canAi = useCan('ai.use');
  const canGuardians = useCan('guardians.read');
  const [draftOpen, setDraftOpen] = useState(false);
  const chronic = v.rate != null && v.rate < CHRONIC_ABSENCE_THRESHOLD;
  const incidents = [...v.days].filter((d) => d.status !== 'PRESENT').sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Page className="max-w-6xl">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <BackLink to="/attendance?tab=reports">Attendance</BackLink>
        {structure.data && (
          <TermSelect structure={structure.data} value={termId ?? v.term.id} onChange={onTermChange} className="sm:w-72" aria-label="Term" />
        )}
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={v.student.name} initials={initialsFromName(v.student.name)} size="xl" />
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-[28px]">{v.student.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
              <span className="font-mono">{v.student.admissionNumber}</span>
              {v.student.classArm && <span>· {v.student.classArm}</span>}
              <span>
                · {v.term.name} ({termDates(v.term)})
              </span>
              {chronic && <Badge variant="danger">Persistent absence</Badge>}
            </p>
          </div>
        </div>
        {canAi && canGuardians && (
          <Button variant="ai" onClick={() => setDraftOpen(true)}>
            <MessageSquareText /> Draft message to parent
          </Button>
        )}
      </div>

      {v.currentAbsenceStreak >= 2 && (
        <div
          role="status"
          className={cn(
            'mb-5 flex items-start gap-3 rounded-2xl border px-4 py-3.5',
            v.currentAbsenceStreak >= 3 ? 'border-danger/30 bg-danger-soft/60' : 'border-warning/30 bg-warning-soft/60',
          )}
        >
          <AlertTriangle className={cn('mt-0.5 size-4 shrink-0', v.currentAbsenceStreak >= 3 ? 'text-danger' : 'text-warning')} aria-hidden />
          <div className="text-[13.5px]">
            <p className="font-semibold">Absent {v.currentAbsenceStreak} school days in a row</p>
            <p className="text-muted-foreground">
              The streak runs to the latest register. A call home is worth making{canAi && canGuardians ? ' — AI can draft the note for you.' : '.'}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5 sm:p-6">
          <div className="flex items-center gap-5">
            <RateRing rate={v.rate} size={128} label="this term" />
            <div className="space-y-1 text-[13px] text-muted-foreground">
              <p>
                <span className="font-display text-[20px] font-semibold text-foreground tabular">{v.daysMarked}</span> days marked
              </p>
              <p>{v.rate == null ? 'No registers yet' : chronic ? `Below the ${CHRONIC_ABSENCE_THRESHOLD}% line` : 'On track'}</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            {(['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'] as AttendanceStatus[]).map((st) => (
              <div key={st} className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <span aria-hidden className={cn('size-2 rounded-full', STATUS_META[st].fill)} /> {STATUS_META[st].label}
                </p>
                <p className="mt-1 font-display text-lg font-semibold tabular">{v.counts[st.toLowerCase() as keyof typeof v.counts]}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Term calendar</CardTitle>
              <CardDescription>Every school day this term — hover a day for details</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <TermHeatmap v={v} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>By weekday</CardTitle>
              <CardDescription>Is there a pattern?</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              {totalMarked(v.counts) === 0 ? (
                <div className="grid h-full place-items-center rounded-xl border border-dashed border-border text-[13px] text-muted-foreground">No registers yet.</div>
              ) : (
                <WeekdayBars data={v.byWeekday.filter((d) => d.day <= 5 || d.rate != null)} />
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Absences & late arrivals</CardTitle>
              <CardDescription>{incidents.length ? plural(incidents.length, 'day') : 'Nothing recorded this term'}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {incidents.length === 0 ? (
              <EmptyState compact icon={CalendarX2} title="A clean record" description="No absences or late arrivals this term." />
            ) : (
              <ul className="max-h-[260px] divide-y divide-border overflow-y-auto scrollbar-thin">
                {incidents.map((d) => (
                  <li key={d.date} className="flex items-center gap-3 py-2">
                    <span aria-hidden className={cn('grid size-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold', STATUS_META[d.status].soft)}>
                      {STATUS_META[d.status].letter}
                    </span>
                    <span className="w-40 shrink-0 text-[13px]">{formatDate(d.date, { weekday: 'short', day: 'numeric', month: 'short', year: undefined })}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{d.note || STATUS_META[d.status].label}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {canAi && canGuardians && (
        <ParentMessageDialog open={draftOpen} onOpenChange={setDraftOpen} studentId={v.student.id} studentName={v.student.name} termId={termId ?? v.term.id} />
      )}
    </Page>
  );
}

// ------------------------------------------------------------------ heatmap

function TermHeatmap({ v }: { v: StudentAttendanceView }) {
  const today = todayIso();
  const byDate = useMemo(() => new Map(v.days.map((d) => [d.date, d])), [v.days]);

  // Columns are weeks (Mon–Fri rows), starting on the Monday of the first week.
  const weeks = useMemo(() => {
    const start = v.term.startsOn.slice(0, 10);
    const end = v.term.endsOn.slice(0, 10);
    const monday = addDays(start, 1 - isoWeekday(start));
    const cols: { monday: string; days: string[] }[] = [];
    for (const d of datesBetween(monday, end)) {
      const wd = isoWeekday(d);
      if (wd > 5) continue;
      if (wd === 1 || cols.length === 0) cols.push({ monday: d, days: [] });
      cols[cols.length - 1].days.push(d);
    }
    return cols.map((c) => ({ ...c, days: Array.from({ length: 5 }, (_, i) => addDays(c.monday, i)) }));
  }, [v.term.startsOn, v.term.endsOn]);

  const start = v.term.startsOn.slice(0, 10);
  const end = v.term.endsOn.slice(0, 10);

  return (
    <div>
      <div className="scrollbar-thin overflow-x-auto pb-2">
        <div className="inline-flex gap-2">
          <div className="flex flex-col gap-1 pt-5 text-[10.5px] text-muted-foreground">
            {[1, 2, 3, 4, 5].map((d) => (
              <span key={d} className="flex h-5 items-center sm:h-6">
                {WEEKDAY_SHORT[d]}
              </span>
            ))}
          </div>
          {weeks.map((w, wi) => {
            const showMonth = wi === 0 || w.monday.slice(5, 7) !== weeks[wi - 1].monday.slice(5, 7);
            return (
              <div key={w.monday} className="flex flex-col gap-1">
                <span className="h-4 whitespace-nowrap text-[10.5px] text-muted-foreground">
                  {showMonth ? formatDate(w.monday, { month: 'short', day: undefined, year: undefined }) : ''}
                </span>
                {w.days.map((d) => {
                  const outside = d < start || d > end;
                  const rec = byDate.get(d);
                  const future = d > today;
                  const label = `${formatDate(d, { weekday: 'long', day: 'numeric', month: 'short', year: undefined })}: ${
                    outside ? 'outside term' : rec ? STATUS_META[rec.status].label : future ? 'upcoming' : 'not marked'
                  }${rec?.note ? ` — ${rec.note}` : ''}`;
                  const cell = (
                    <span
                      tabIndex={outside ? -1 : 0}
                      aria-label={label}
                      className={cn(
                        'block size-5 rounded-[5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-6',
                        outside && 'opacity-0',
                        !outside && rec && STATUS_META[rec.status].fill,
                        !outside && !rec && (future ? 'border border-dashed border-border' : 'bg-muted'),
                        d === today && 'ring-2 ring-brand ring-offset-1 ring-offset-card',
                        rec?.note && 'relative after:absolute after:right-0.5 after:top-0.5 after:size-1 after:rounded-full after:bg-white/80',
                      )}
                    />
                  );
                  return outside ? <span key={d}>{cell}</span> : <Tip key={d} label={label}>{cell}</Tip>;
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-muted-foreground">
        {(['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'] as AttendanceStatus[]).map((st) => (
          <span key={st} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn('size-3 rounded-[3px]', STATUS_META[st].fill)} /> {STATUS_META[st].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-[3px] bg-muted" /> Not marked
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-[3px] border border-dashed border-border" /> Upcoming
        </span>
      </div>
    </div>
  );
}
