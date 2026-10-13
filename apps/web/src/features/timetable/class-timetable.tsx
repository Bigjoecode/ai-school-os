import { DAY_NAMES, DAY_SHORT, type ClassLesson, type ClassTimetable } from '@aischool/shared';
import { ArrowRight, CalendarClock, Clock, Coffee, DoorOpen, Printer, Sun, User } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useClassTimetable, usePortalMe } from '../portal/api';
import { lessonAccent, lessonTint, subjectVars } from './ui';

/**
 * The class timetable as families see it (students and parents): read-only,
 * the current term's published version only. Phones get day tabs with today
 * open; wider screens and print get the whole week. Young learners (nursery to
 * Primary 3) get big, simple cards for one day at a time.
 */

type Row =
  | { kind: 'lesson'; lesson: ClassLesson; start: string; end: string; periods: number[]; double: boolean }
  | { kind: 'break'; label: string; start: string; end: string; periods: number[] }
  | { kind: 'free'; label: string; start: string; end: string; periods: number[] };

/** One day's rows in bell order, doubles merged into a single lesson. */
function dayRows(d: ClassTimetable, day: number): Row[] {
  const byPeriod = new Map(d.lessons.filter((l) => l.day === day).map((l) => [l.period, l]));
  const rows: Row[] = [];
  d.bellSchedule.periods.forEach((p, i) => {
    if (p.kind !== 'LESSON') {
      rows.push({ kind: 'break', label: p.label, start: p.start, end: p.end, periods: [i] });
      return;
    }
    const l = byPeriod.get(i);
    const prev = rows[rows.length - 1];
    if (l && l.doubleGroup && prev?.kind === 'lesson' && prev.lesson.doubleGroup === l.doubleGroup) {
      prev.end = p.end;
      prev.periods.push(i);
      prev.double = true;
      return;
    }
    rows.push(l ? { kind: 'lesson', lesson: l, start: p.start, end: p.end, periods: [i], double: false } : { kind: 'free', label: p.label, start: p.start, end: p.end, periods: [i] });
  });
  return rows;
}

const sortedDays = (d: ClassTimetable) => [...d.bellSchedule.days].sort((a, b) => a - b);

function isNow(d: ClassTimetable, day: number, periods: number[]) {
  return d.today.day === day && d.today.currentPeriod != null && periods.includes(d.today.currentPeriod);
}

function emptyCopy(d: ClassTimetable, who: string, isParent: boolean): { title: string; description: string } {
  if (d.emptyReason === 'NO_CLASS') {
    return { title: 'No class yet', description: isParent ? `${who} hasn’t been placed in a class yet, so there’s no timetable to show.` : 'You haven’t been placed in a class yet, so there’s no timetable to show.' };
  }
  if (d.emptyReason === 'NO_LESSONS') {
    return { title: 'No lessons on the timetable', description: `The school’s timetable has no lessons for ${d.className ?? 'this class'} yet. Please check with the school office.` };
  }
  return { title: 'No timetable yet', description: `The school hasn’t published this term’s timetable for ${d.className ?? 'this class'}. It will appear here as soon as it’s ready.` };
}

// ------------------------------------------------------------------ page body

export function ClassTimetableView({ childId, who, isParent }: { childId: string; who: string; isParent: boolean }) {
  const q = useClassTimetable(childId);
  const d = q.data;
  if (q.error && !d) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!d) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }
  if (!d.timetable || d.emptyReason) {
    const c = emptyCopy(d, who, isParent);
    return (
      <Card>
        <EmptyState icon={CalendarClock} title={c.title} description={c.description} />
      </Card>
    );
  }
  return (
    <div className="space-y-4" data-class-timetable={d.young ? 'young' : 'standard'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">{d.className}</p>
          <p className="text-[12.5px] text-muted-foreground">
            {d.timetable.termName} · {d.timetable.sessionName}
          </p>
        </div>
        <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
          <Printer /> Print
        </Button>
      </div>
      <NowNext d={d} young={d.young} />
      {d.young ? <YoungWeek d={d} /> : <StandardWeek d={d} />}
    </div>
  );
}

// ------------------------------------------------------------------ now / next

function lessonLine(l: ClassLesson) {
  return [l.teacher, l.room].filter(Boolean).join(' · ');
}

function NowNext({ d, young }: { d: ClassTimetable; young?: boolean }) {
  const t = d.today;
  if (!t.schoolDay) return null;
  const currentBell = t.currentPeriod != null ? d.bellSchedule.periods[t.currentPeriod] : null;
  const breakNow = currentBell && currentBell.kind !== 'LESSON' ? currentBell : null;
  if (!t.now && !t.next && !breakNow) return null;
  return (
    <div className={cn('grid gap-3 print:hidden', (t.now || breakNow) && t.next && 'sm:grid-cols-2')}>
      {t.now ? (
        <NowTile tag="Now" lesson={t.now} live young={young} />
      ) : breakNow ? (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 p-4">
          <Coffee className="size-5 text-muted-foreground" aria-hidden />
          <div>
            <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Now</p>
            <p className={cn('font-semibold', young ? 'text-[20px]' : 'text-[15px]')}>{breakNow.label}</p>
            <p className="text-[12.5px] text-muted-foreground tabular">
              {breakNow.start}–{breakNow.end}
            </p>
          </div>
        </div>
      ) : null}
      {t.next && <NowTile tag="Next" lesson={t.next} young={young} />}
    </div>
  );
}

function NowTile({ tag, lesson, live, young }: { tag: string; lesson: ClassLesson; live?: boolean; young?: boolean }) {
  return (
    <div style={subjectVars(lesson.subject.code || lesson.subject.name)} className={cn('flex items-center gap-3 rounded-2xl border p-4', lessonTint, live && 'ring-2 ring-brand/60')}>
      <span aria-hidden className={cn('h-10 w-1 shrink-0 rounded-full', lessonAccent)} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide opacity-80">
          {live && (
            <span className="relative flex size-1.5" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-current" />
            </span>
          )}
          {tag} · <span className="tabular">{lesson.start}</span>
        </p>
        <p className={cn('truncate font-semibold', young ? 'text-[22px]' : 'text-[16px]')}>{lesson.subject.name}</p>
        {!young && lessonLine(lesson) && <p className="truncate text-[12.5px] opacity-80">{lessonLine(lesson)}</p>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ standard (JSS/SSS, upper primary)

function DayTabs({ d, day, onPick, big }: { d: ClassTimetable; day: number; onPick: (n: number) => void; big?: boolean }) {
  return (
    <div role="tablist" aria-label="Day" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {sortedDays(d).map((n) => {
        const on = n === day;
        const today = n === d.today.day;
        return (
          <button
            key={n}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onPick(n)}
            className={cn(
              'flex shrink-0 flex-col items-center rounded-xl border px-3.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              big ? 'min-h-14 min-w-16 justify-center text-[16px]' : 'min-h-11 justify-center text-[13.5px]',
              on ? 'border-brand bg-brand text-brand-foreground' : 'border-border bg-card hover:bg-muted/50',
            )}
          >
            {DAY_SHORT[n]}
            {today && <span className={cn('text-[10.5px] font-normal', on ? 'opacity-90' : 'text-brand')}>Today</span>}
          </button>
        );
      })}
    </div>
  );
}

function useDayPick(d: ClassTimetable) {
  const days = sortedDays(d);
  return useState(days.includes(d.today.day) ? d.today.day : days[0]!);
}

function StandardWeek({ d }: { d: ClassTimetable }) {
  const [day, setDay] = useDayPick(d);
  return (
    <>
      {/* Phones: one day at a time. */}
      <div className="space-y-3 sm:hidden print:hidden">
        <DayTabs d={d} day={day} onPick={setDay} />
        <Card className="p-2">
          <ol aria-label={`${DAY_NAMES[day]} lessons`} className="space-y-1">
            {dayRows(d, day).map((r) => (
              <DayRow key={r.periods[0]} r={r} now={isNow(d, day, r.periods)} />
            ))}
          </ol>
        </Card>
      </div>
      {/* Tablets, desktops and print: the whole week. */}
      <WeekGrid d={d} />
    </>
  );
}

function DayRow({ r, now }: { r: Row; now: boolean }) {
  if (r.kind !== 'lesson') {
    return (
      <li className={cn('flex items-center gap-3 rounded-lg px-3 py-1.5 text-[12.5px] text-muted-foreground', now && 'bg-brand-soft/60 text-foreground')}>
        <span className="w-[86px] shrink-0 tabular">
          {r.start}–{r.end}
        </span>
        {r.kind === 'break' ? <Coffee className="size-3.5" aria-hidden /> : null}
        <span>{r.kind === 'break' ? r.label : 'Free period'}</span>
        {now && <NowBadge />}
      </li>
    );
  }
  const l = r.lesson;
  return (
    <li
      style={subjectVars(l.subject.code || l.subject.name)}
      aria-current={now ? 'time' : undefined}
      className={cn('flex items-center gap-3 rounded-xl border px-3 py-2.5', lessonTint, now && 'ring-2 ring-brand/60')}
    >
      <span className="w-[74px] shrink-0 text-[12px] font-medium leading-tight tabular">
        {r.start}
        <span className="block opacity-70">{r.end}</span>
      </span>
      <span aria-hidden className={cn('h-9 w-[3px] shrink-0 rounded-full', lessonAccent)} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">
          {l.subject.name}
          {r.double && <span className="ml-1.5 text-[11px] font-medium opacity-75">Double</span>}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-[12px] opacity-80">
          {l.teacher && (
            <span className="inline-flex items-center gap-1">
              <User className="size-3" aria-hidden /> {l.teacher}
            </span>
          )}
          {l.room && (
            <span className="inline-flex items-center gap-1">
              <DoorOpen className="size-3" aria-hidden /> {l.room}
            </span>
          )}
        </span>
      </span>
      {now && <NowBadge />}
    </li>
  );
}

function NowBadge() {
  return (
    <Badge variant="brand" className="ml-auto shrink-0 gap-1.5">
      <span className="relative inline-flex size-1.5 rounded-full bg-current" aria-hidden />
      Now
    </Badge>
  );
}

function WeekGrid({ d }: { d: ClassTimetable }) {
  const days = sortedDays(d);
  const byKey = new Map(d.lessons.map((l) => [`${l.day}:${l.period}`, l]));
  return (
    <Card className="hidden overflow-x-auto p-0 sm:block print:block print:overflow-visible print:border-0 print:shadow-none">
      <table className="w-full min-w-[640px] border-collapse text-left text-[12.5px] print:min-w-0 print:text-[10.5px]">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="w-24 px-3 py-2.5 font-medium text-muted-foreground">
              Time
            </th>
            {days.map((n) => (
              <th key={n} scope="col" className={cn('px-2 py-2.5 font-semibold', n === d.today.day && 'text-brand print:text-inherit')}>
                {DAY_NAMES[n]}
                {n === d.today.day && <span className="ml-1.5 text-[11px] font-normal print:hidden">(today)</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {d.bellSchedule.periods.map((p, i) =>
            p.kind !== 'LESSON' ? (
              <tr key={i} className="border-b border-border/60 bg-muted/40 print:bg-transparent">
                <td className="px-3 py-1.5 text-muted-foreground tabular">
                  {p.start}–{p.end}
                </td>
                <td colSpan={days.length} className="px-2 py-1.5 text-center text-muted-foreground">
                  <Coffee className="mr-1.5 inline size-3.5 align-[-2px] print:hidden" aria-hidden />
                  {p.label}
                </td>
              </tr>
            ) : (
              <tr key={i} className="border-b border-border/60 last:border-0">
                <th scope="row" className="px-3 py-1.5 align-top font-normal text-muted-foreground tabular">
                  <span className="block font-medium text-foreground">{p.label}</span>
                  {p.start}–{p.end}
                </th>
                {days.map((n) => {
                  const l = byKey.get(`${n}:${i}`);
                  const now = isNow(d, n, [i]);
                  return (
                    <td key={n} className="p-1 align-top">
                      {l ? (
                        <div
                          style={subjectVars(l.subject.code || l.subject.name)}
                          aria-current={now ? 'time' : undefined}
                          className={cn('h-full rounded-lg border px-2 py-1.5', lessonTint, now && 'ring-2 ring-brand/70 print:ring-0')}
                        >
                          <p className="truncate font-semibold">{l.subject.name}</p>
                          {l.teacher && <p className="truncate text-[11.5px] opacity-80 print:text-[9.5px]">{l.teacher}</p>}
                          {l.room && <p className="truncate text-[11.5px] opacity-70 print:text-[9.5px]">{l.room}</p>}
                        </div>
                      ) : (
                        <div className="h-full rounded-lg border border-dashed border-border/70 px-2 py-1.5 text-muted-foreground/70">Free</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </Card>
  );
}

// ------------------------------------------------------------------ young mode (nursery – Primary 3)

function YoungWeek({ d }: { d: ClassTimetable }) {
  const [day, setDay] = useDayPick(d);
  return (
    <>
      <div className="space-y-3 print:hidden">
        <DayTabs d={d} day={day} onPick={setDay} big />
        <ol aria-label={`${DAY_NAMES[day]} lessons`} className="grid gap-2.5 sm:grid-cols-2">
          {dayRows(d, day)
            .filter((r) => r.kind !== 'free')
            .map((r) => {
              const now = isNow(d, day, r.periods);
              if (r.kind === 'break') {
                return (
                  <li key={r.periods[0]} className={cn('flex items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-3 text-muted-foreground', now && 'border-brand bg-brand-soft/60 text-foreground')}>
                    <Coffee className="size-6" aria-hidden />
                    <span className="text-[17px] font-medium">{r.label}</span>
                    <span className="ml-auto text-[13px] tabular">{r.start}</span>
                  </li>
                );
              }
              const l = r.lesson;
              return (
                <li
                  key={r.periods[0]}
                  style={subjectVars(l.subject.code || l.subject.name)}
                  aria-current={now ? 'time' : undefined}
                  className={cn('flex items-center gap-3 rounded-2xl border px-4 py-4', lessonTint, now && 'ring-4 ring-brand/60')}
                >
                  <span aria-hidden className={cn('size-10 shrink-0 rounded-full', lessonAccent)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[20px] font-bold leading-tight">{l.subject.name}</span>
                    <span className="flex items-center gap-1 text-[13px] opacity-80 tabular">
                      <Clock className="size-3.5" aria-hidden /> {r.start}
                    </span>
                  </span>
                  {now && <NowBadge />}
                </li>
              );
            })}
        </ol>
      </div>
      {/* Print still gets the whole week for the fridge door. */}
      <div className="hidden print:block">
        <WeekGrid d={d} />
      </div>
    </>
  );
}

// ------------------------------------------------------------------ dashboard card

/** "Today's lessons" on the student's overview: what's on now and next. Hidden until the school publishes a timetable. */
export function TodayLessonsCard() {
  const me = usePortalMe();
  const kid = me.data?.role === 'STUDENT' ? me.data.children[0] : undefined;
  const q = useClassTimetable(kid?.id ?? '', !!kid);
  const d = q.data;
  if (!kid || !d || !d.timetable || d.emptyReason) return null;
  const t = d.today;
  const todays = t.schoolDay ? dayRows(d, t.day).filter((r): r is Extract<Row, { kind: 'lesson' }> => r.kind === 'lesson') : [];
  const remaining = todays.filter((r) => r.end > t.time);
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Today’s lessons</CardTitle>
          <CardDescription>
            {t.dayName} · {d.className}
          </CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to={`/school/timetable/${kid.id}`}>
            Timetable <ArrowRight />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!t.schoolDay ? (
          <EmptyState compact icon={Sun} title="No lessons today" description={`${t.dayName} isn’t a school day. Enjoy it.`} />
        ) : remaining.length === 0 ? (
          <p className="py-2 text-[13px] text-muted-foreground">That’s all your lessons for today. Well done!</p>
        ) : (
          <>
            <NowNext d={d} young={d.young} />
            {!t.now && !t.next ? null : (
              <ol className="space-y-1">
                {remaining
                  .filter((r) => !r.periods.some((p) => p === t.now?.period || p === t.next?.period))
                  .slice(0, 4)
                  .map((r) => (
                    <li key={r.periods[0]} className="flex items-center gap-3 rounded-lg px-1 py-1 text-[13px]">
                      <span className="w-11 shrink-0 text-[12px] text-muted-foreground tabular">{r.start}</span>
                      <span aria-hidden style={subjectVars(r.lesson.subject.code || r.lesson.subject.name)} className={cn('size-2 shrink-0 rounded-full', lessonAccent)} />
                      <span className="min-w-0 flex-1 truncate">{r.lesson.subject.name}</span>
                      {!d.young && r.lesson.room && <span className="shrink-0 text-[12px] text-muted-foreground">{r.lesson.room}</span>}
                    </li>
                  ))}
              </ol>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
