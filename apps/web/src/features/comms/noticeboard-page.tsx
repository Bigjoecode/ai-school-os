import { type AnnouncementRow, EVENT_CATEGORY_LABELS, type EventRow } from '@aischool/shared';
import { CalendarDays, ChevronRight, ClipboardList, Megaphone, MoreHorizontal, Pencil, Pin, Plus, Send, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCan } from '@/lib/auth-store';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { schoolDateTime } from '../finance/ui';
import { useAnnouncements, useDeleteAnnouncement, useNoticeboard } from './api';
import { AnnouncementSheet } from './announcement-sheet';
import { ANNOUNCEMENT_AUDIENCE_LABELS, categoryStyle, DateBlock, eventWhen } from './ui';

export default function NoticeboardPage() {
  const canManage = useCan('announcements.manage');
  const [params, setParams] = useSearchParams();
  const tab = canManage && params.get('tab') === 'manage' ? 'manage' : 'board';
  const [editing, setEditing] = useState<AnnouncementRow | null>(null);
  const [posting, setPosting] = useState(false);
  const newFlag = params.get('new') === '1';
  useEffect(() => {
    if (!newFlag) return;
    if (canManage) {
      setEditing(null);
      setPosting(true);
    }
    const p = new URLSearchParams(params);
    p.delete('new');
    setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newFlag, canManage]);

  const openSheet = (a: AnnouncementRow | null) => {
    setEditing(a);
    setPosting(true);
  };
  const closeSheet = (o: boolean) => setPosting(o);

  return (
    <Page>
      <PageHeader
        title="Noticeboard"
        description="News from school and what’s coming up."
        actions={
          canManage && (
            <Button onClick={() => openSheet(null)}>
              <Plus /> Post announcement
            </Button>
          )
        }
      />
      {canManage ? (
        <Tabs value={tab} onValueChange={(t) => setParams(t === 'board' ? {} : { tab: t }, { replace: true })}>
          <TabsList aria-label="Noticeboard sections">
            <TabsTrigger value="board">
              <Megaphone /> Noticeboard
            </TabsTrigger>
            <TabsTrigger value="manage">
              <ClipboardList /> Manage
            </TabsTrigger>
          </TabsList>
          <TabsContent value="board">
            <Board onEdit={openSheet} />
          </TabsContent>
          <TabsContent value="manage">
            <ManageList onEdit={openSheet} onNew={() => openSheet(null)} />
          </TabsContent>
        </Tabs>
      ) : (
        <Board />
      )}
      {canManage && <AnnouncementSheet open={posting} onOpenChange={closeSheet} announcement={editing} />}
    </Page>
  );
}

function Board({ onEdit }: { onEdit?: (a: AnnouncementRow) => void }) {
  const q = useNoticeboard();
  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
      <section className="space-y-3 lg:col-span-2" aria-label="Announcements">
        {!q.data ? (
          [0, 1, 2].map((i) => (
            <Card key={i} className="space-y-3 p-5">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-3 w-1/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
            </Card>
          ))
        ) : q.data.announcements.length === 0 ? (
          <Card>
            <EmptyState icon={Megaphone} title="No announcements right now" description="News from school — closures, reminders, celebrations — appears here." />
          </Card>
        ) : (
          q.data.announcements.map((a) => <AnnouncementCard key={a.id} a={a} onEdit={onEdit} />)
        )}
      </section>
      <aside aria-label="Upcoming events">
        <UpcomingEvents events={q.data?.events} loading={!q.data} />
      </aside>
    </div>
  );
}

function AnnouncementCard({ a, onEdit, showState }: { a: AnnouncementRow; onEdit?: (a: AnnouncementRow) => void; showState?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const del = useDeleteAnnouncement();
  const long = a.body.length > 420 || a.body.split('\n').length > 7;
  return (
    <Card className={cn('p-5', a.pinned && 'border-brand/30 bg-brand-soft/20')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {a.pinned && (
              <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand">
                <Pin className="size-3.5 rotate-45" aria-hidden /> Pinned
              </span>
            )}
            {showState && a.state !== 'LIVE' && <Badge variant={a.state === 'SCHEDULED' ? 'info' : 'outline'}>{a.state === 'SCHEDULED' ? `From ${schoolDateTime(a.publishAt)}` : 'Expired'}</Badge>}
            <Badge variant="secondary">{ANNOUNCEMENT_AUDIENCE_LABELS[a.audience]}</Badge>
            {a.classes.slice(0, 4).map((c) => (
              <Badge key={c} variant="outline">
                {c}
              </Badge>
            ))}
            {a.classes.length > 4 && <Badge variant="outline">+{a.classes.length - 4}</Badge>}
          </div>
          <h2 className="mt-2 break-words font-display text-[17px] font-semibold tracking-tight">{a.title}</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {a.author ? `${a.author} · ` : ''}
            <time dateTime={a.publishAt} title={schoolDateTime(a.publishAt)}>
              {a.state === 'SCHEDULED' ? schoolDateTime(a.publishAt) : formatRelative(a.publishAt)}
            </time>
            {a.expiresAt && a.state === 'LIVE' && ` · up until ${schoolDateTime(a.expiresAt)}`}
            {a.broadcastId && (
              <>
                {' · '}
                <Link to={`/messages/${a.broadcastId}`} className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                  <Send className="size-3" aria-hidden /> also sent as a message
                </Link>
              </>
            )}
          </p>
        </div>
        {onEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${a.title}`} className="-mr-1.5 -mt-1">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit(a)}>
                <Pencil /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem destructive onSelect={() => setDeleting(true)}>
                <Trash2 /> Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <p className={cn('mt-3 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-foreground/90', long && !expanded && 'line-clamp-6')}>{a.body}</p>
      {long && (
        <button type="button" onClick={() => setExpanded((x) => !x)} className="mt-1.5 text-[12.5px] font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-expanded={expanded}>
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Remove “${a.title}”?`}
        description="It comes off the noticeboard for everyone. Messages already sent aren’t affected."
        confirmLabel="Remove"
        loading={del.isPending}
        onConfirm={() => del.mutate(a.id, { onSuccess: () => setDeleting(false) })}
      />
    </Card>
  );
}

function UpcomingEvents({ events, loading, limit = 8 }: { events: EventRow[] | undefined; loading: boolean; limit?: number }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Coming up</CardTitle>
          <CardDescription>The next few weeks</CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/calendar">
            Calendar <ChevronRight />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-11 w-11 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : !events?.length ? (
          <EmptyState compact icon={CalendarDays} title="Nothing on the calendar" description="Events, holidays and exams will show here." />
        ) : (
          <ul className="space-y-3">
            {events.slice(0, limit).map((e) => (
              <li key={e.id}>
                <Link to={`/calendar?event=${e.id}&month=${e.startDate.slice(0, 7)}`} className="group flex gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <DateBlock date={e.startDate} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium group-hover:text-brand">{e.title}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {eventWhen(e, false)}
                      {e.location && ` · ${e.location}`}
                    </span>
                    <span className="mt-1 inline-flex rounded-full border px-1.5 text-[10.5px] font-medium leading-4" style={categoryStyle(e.category)}>
                      {EVENT_CATEGORY_LABELS[e.category]}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ManageList({ onEdit, onNew }: { onEdit: (a: AnnouncementRow) => void; onNew: () => void }) {
  const q = useAnnouncements();
  const [filter, setFilter] = useState<'ALL' | 'LIVE' | 'SCHEDULED' | 'EXPIRED'>('ALL');
  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-2xl" />
        ))}
      </div>
    );
  }
  const rows = filter === 'ALL' ? q.data : q.data.filter((a) => a.state === filter);
  const count = (s: AnnouncementRow['state']) => q.data.filter((a) => a.state === s).length;
  return (
    <div className="space-y-3">
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {(
          [
            ['ALL', 'All', q.data.length],
            ['LIVE', 'Live', count('LIVE')],
            ['SCHEDULED', 'Scheduled', count('SCHEDULED')],
            ['EXPIRED', 'Expired', count('EXPIRED')],
          ] as const
        ).map(([value, label, n]) => (
          <Button key={value} size="sm" variant={filter === value ? 'default' : 'outline'} onClick={() => setFilter(value)} aria-pressed={filter === value} className="shrink-0">
            {label} <span className="tabular opacity-70">{n}</span>
          </Button>
        ))}
      </div>
      {rows.length === 0 ? (
        <Card>
          <EmptyState
            compact
            icon={Megaphone}
            title={q.data.length ? 'Nothing here' : 'No announcements yet'}
            description={q.data.length ? 'Try another filter.' : 'Post the first one — everyone sees it when they sign in.'}
            action={
              !q.data.length && (
                <Button size="sm" onClick={onNew}>
                  <Plus /> Post announcement
                </Button>
              )
            }
          />
        </Card>
      ) : (
        rows.map((a) => <AnnouncementCard key={a.id} a={a} onEdit={onEdit} showState />)
      )}
    </div>
  );
}
