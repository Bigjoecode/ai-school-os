import { Cake, ChevronRight, Megaphone, Pin } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth-store';
import { formatRelative } from '@/lib/format';
import { useCommsOverview, useNoticeboard } from './api';
import { DateBlock, eventWhen } from './ui';

/** Dashboard card: the latest announcements and what's coming up. Hidden when there's nothing to show. */
export function NoticeboardCard({ alwaysShow }: { alwaysShow?: boolean }) {
  const q = useNoticeboard();
  const canComms = useCan('comms.read');
  const comms = useCommsOverview(canComms);
  const birthdays = comms.data?.birthdaysToday ?? [];

  if (q.isLoading) {
    return (
      <Card className="space-y-3 p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </Card>
    );
  }
  const ann = q.data?.announcements.slice(0, 3) ?? [];
  const events = q.data?.events.slice(0, 3) ?? [];
  const empty = !ann.length && !events.length && !birthdays.length;
  if (empty && !alwaysShow) return null;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="size-4 text-muted-foreground" aria-hidden /> Noticeboard
          </CardTitle>
          <CardDescription>Latest news and what’s coming up</CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/noticeboard">
            Open <ChevronRight />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {birthdays.length > 0 && (
          <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-[12.5px]">
            <Cake className="mt-0.5 size-3.5 shrink-0 text-chart-5" aria-hidden />
            <span className="min-w-0">
              <span className="font-medium">Birthdays today:</span>{' '}
              {birthdays
                .slice(0, 4)
                .map((b) => `${b.name}${b.detail ? ` (${b.detail})` : ''}`)
                .join(', ')}
              {birthdays.length > 4 && ` and ${birthdays.length - 4} more`}
            </span>
          </p>
        )}
        {empty && <EmptyState compact icon={Megaphone} title="All quiet for now" description="Announcements from school and upcoming events will show up here." />}
        <div className="grid gap-5 md:grid-cols-2 [&>*]:min-w-0 empty:hidden">
          {ann.length > 0 && (
            <ul className="space-y-3" aria-label="Latest announcements">
              {ann.map((a) => (
                <li key={a.id} className="min-w-0">
                  <Link to="/noticeboard" className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <p className="flex items-center gap-1.5 text-[13.5px] font-medium group-hover:text-brand">
                      {a.pinned && <Pin className="size-3 shrink-0 rotate-45 text-brand" aria-label="Pinned" />}
                      <span className="truncate">{a.title}</span>
                    </p>
                    <p className="line-clamp-2 text-[12.5px] text-muted-foreground">{a.body}</p>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground/80">{formatRelative(a.publishAt)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {events.length > 0 && (
            <ul className="space-y-3" aria-label="Coming up">
              {events.map((e) => (
                <li key={e.id}>
                  <Link to={`/calendar?event=${e.id}&month=${e.startDate.slice(0, 7)}`} className="group flex gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <DateBlock date={e.startDate} />
                    <span className="min-w-0 flex-1 self-center">
                      <span className="block truncate text-[13.5px] font-medium group-hover:text-brand">{e.title}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">{eventWhen(e, false)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
