import { ArrowRight, BookOpenCheck, ClipboardList, Video } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useLiveOverview, useMyLearning } from './api';
import { JoinButton, LiveStatusBadge, ProviderIcon, relativeDay, schoolDate, schoolToday, timeRange, useSchoolTz } from './ui';

/** Overview card for staff: today's live classes, with Join/Start when they're on. Hidden when there are none. */
export function LiveTodayCard() {
  const tz = useSchoolTz();
  const q = useLiveOverview();
  const today = q.data?.today ?? schoolToday(tz);
  const rows = (q.data?.upcoming ?? []).filter((r) => r.status === 'LIVE' || schoolDate(r.startsAt, tz) === today);
  if (!q.data || rows.length === 0) return null;
  const live = rows.filter((r) => r.status === 'LIVE').length;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            Live today
            {live > 0 && <LiveStatusBadge status="LIVE" />}
          </CardTitle>
          <CardDescription>
            {rows.length} {rows.length === 1 ? 'class' : 'classes'} online today
          </CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/live">
            Live classes <ArrowRight />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 md:grid-cols-2 [&>*]:min-w-0">
          {rows.slice(0, 6).map((r) => (
            <li key={r.id} className={cn('relative flex items-center gap-3 rounded-xl border px-3 py-2.5', r.status === 'LIVE' ? 'border-danger/30 bg-danger-soft/30' : 'border-border')}>
              <ProviderIcon provider={r.provider} size="sm" />
              <div className="min-w-0 flex-1">
                <Link to={`/live/${r.id}`} className="block truncate text-[13px] font-medium after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring">
                  {r.title}
                </Link>
                <p className="truncate text-[11.5px] text-muted-foreground">
                  <span className="tabular">{timeRange(r, tz)}</span> · {r.classArm.name}
                  {r.teacher && ` · ${r.teacher.name}`}
                </p>
              </div>
              <div className="relative z-10 shrink-0">{r.status === 'LIVE' ? <JoinButton liveClass={r} /> : <LiveStatusBadge status={r.status} />}</div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Overview card for students and parents. */
export function MyLearningCard() {
  const tz = useSchoolTz();
  const q = useMyLearning();
  const d = q.data;
  if (q.isLoading) return <Skeleton className="h-36 w-full rounded-2xl" />;
  if (!d) return null;
  const today = schoolToday(tz);
  const next = d.liveClasses[0];
  const due = d.homework.filter((h) => !h.overdue);
  const latest = d.summaries[0];
  const nothing = !next && due.length === 0 && !latest;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>My learning</CardTitle>
          <CardDescription>{nothing ? 'Live classes, homework and class notes show here.' : 'Live classes, homework and notes from lessons'}</CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/learning">
            Open <ArrowRight />
          </Link>
        </Button>
      </CardHeader>
      {!nothing && (
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-3 [&>*]:min-w-0">
            <Tile icon={Video} label="Next live class" to="/learning">
              {next ? (
                <>
                  <span className="block truncate text-[13px] font-medium">{next.title}</span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    {next.status === 'LIVE' ? 'On now' : `${relativeDay(schoolDate(next.startsAt, tz), today)} · ${timeRange(next, tz)}`}
                  </span>
                  {next.canJoin && <JoinButton liveClass={{ ...next, canHost: false }} className="relative z-10 mt-2" label="Join class" />}
                </>
              ) : (
                <span className="text-[12.5px] text-muted-foreground">None scheduled</span>
              )}
            </Tile>
            <Tile icon={ClipboardList} label="Homework due" to="/learning">
              <span className="block font-display text-[22px] font-semibold leading-none tabular">{due.length}</span>
              <span className="mt-1 block truncate text-[11.5px] text-muted-foreground">{due[0] ? `Next: ${due[0].title}` : 'All clear'}</span>
            </Tile>
            <Tile icon={BookOpenCheck} label="Latest class notes" to="/learning">
              {latest ? (
                <>
                  <span className="block truncate text-[13px] font-medium">{latest.title}</span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">{latest.subject ?? latest.classArm}</span>
                </>
              ) : (
                <span className="text-[12.5px] text-muted-foreground">None yet</span>
              )}
            </Tile>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function Tile({ icon: Icon, label, to, children }: { icon: typeof Video; label: string; to: string; children: ReactNode }) {
  return (
    <div className="relative rounded-xl border border-border p-3 transition-colors hover:border-border-strong">
      <Link to={to} className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={label} />
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5" aria-hidden /> {label}
      </p>
      {children}
    </div>
  );
}
