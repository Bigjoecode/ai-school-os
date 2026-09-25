import { ArrowRight, CalendarClock, DoorOpen, Sun } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { useTodaySchedule } from './api';
import { armLabel, lessonAccent, subjectVars } from './ui';

/** "Today's classes" for the overview: a teacher's lessons, or what's running school-wide. */
export function TodayClassesCard() {
  const today = useTodaySchedule();
  const canManage = useCan('timetable.manage');
  const d = today.data;
  const nowHHMM = new Date().toTimeString().slice(0, 5);
  const schoolDay = !!d && d.bellSchedule.days.includes(d.day);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div>
          <CardTitle>Today’s classes</CardTitle>
          <CardDescription>{d ? `Today · ${d.dayName}` : 'Your day at a glance'}</CardDescription>
        </div>
        {d?.timetable && (
          <Button asChild variant="ghost" size="sm">
            <Link to="/timetable">Timetable</Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        {today.isLoading ? (
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-11 w-full rounded-xl" />
            ))}
          </div>
        ) : !d ? (
          <p className="py-4 text-[13px] text-muted-foreground">Couldn’t load today’s schedule.</p>
        ) : !d.timetable ? (
          <EmptyState
            compact
            icon={CalendarClock}
            title="No timetable published yet"
            description={canManage ? 'Build a clash-free timetable in seconds, then publish it here.' : 'Once the school publishes a timetable, your lessons show up here.'}
            action={
              <Button asChild size="sm" variant={canManage ? 'default' : 'outline'}>
                <Link to="/timetable">
                  {canManage ? 'Build the timetable' : 'Open timetable'} <ArrowRight />
                </Link>
              </Button>
            }
          />
        ) : !schoolDay ? (
          <EmptyState compact icon={Sun} title="No lessons today" description={`${d.dayName} isn’t a school day. Enjoy it.`} />
        ) : d.myLessons.length > 0 ? (
          <ol className="space-y-1.5">
            {d.myLessons.map((l) => {
              const now = d.currentPeriod === l.period;
              const past = !now && l.end <= nowHHMM;
              return (
                <li
                  key={l.id}
                  style={subjectVars(l.subject.code || l.subject.name)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors',
                    now ? 'border-brand/50 bg-brand-soft/60 shadow-soft' : 'border-border',
                    past && 'opacity-55',
                  )}
                >
                  <span className="w-11 shrink-0 text-[12px] font-medium tabular text-muted-foreground">{l.start}</span>
                  <span aria-hidden className={cn('h-8 w-[3px] shrink-0 rounded-full', lessonAccent)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{l.subject.name}</span>
                    <span className="flex items-center gap-1.5 truncate text-[11.5px] text-muted-foreground">
                      {armLabel(l)}
                      {l.room && (
                        <>
                          <span aria-hidden>·</span> <DoorOpen className="size-3" aria-hidden /> {l.room.name}
                        </>
                      )}
                    </span>
                  </span>
                  {now && (
                    <Badge variant="brand" className="gap-1.5">
                      <span className="relative flex size-1.5" aria-hidden>
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
                        <span className="relative inline-flex size-1.5 rounded-full bg-current" />
                      </span>
                      Now
                    </Badge>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="flex h-full flex-col justify-between gap-4">
            <div className="flex items-end gap-3">
              <span className="font-display text-[34px] font-semibold leading-none tracking-[-0.03em] tabular">{d.lessonsNow}</span>
              <span className="pb-1 text-[13px] text-muted-foreground">
                {d.lessonsNow === 1 ? 'lesson' : 'lessons'} running now
                {d.currentPeriod != null && d.bellSchedule.periods[d.currentPeriod] && (
                  <> · {d.bellSchedule.periods[d.currentPeriod].label}</>
                )}
              </span>
            </div>
            <Button asChild variant="outline" size="sm" className="self-start">
              <Link to="/timetable">
                View {d.timetable.name} <ArrowRight />
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
