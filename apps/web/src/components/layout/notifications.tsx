import type { NotificationRow } from '@aischool/shared';
import { Bell, BellOff, BellRing, CheckCheck, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMarkAllRead, useMarkRead, useNotifications } from '@/features/comms/api';
import { usePush } from '@/features/comms/push';
import { useMe } from '@/lib/auth-store';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Skeleton } from '../ui/skeleton';

export function Notifications() {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const q = useNotifications();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const navigate = useNavigate();
  const unread = q.data?.unread ?? 0;
  const items = q.data?.items ?? [];

  const openItem = (n: NotificationRow) => {
    if (!n.readAt) markRead.mutate(n.id);
    if (n.link) {
      setOpen(false);
      // Links are app paths; anything absolute opens as a normal link.
      if (/^https?:\/\//.test(n.link)) window.open(n.link, '_blank', 'noopener');
      else navigate(n.link);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative">
          <Bell />
          {unread > 0 && (
            <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[9.5px] font-semibold leading-none text-white ring-2 ring-background tabular" aria-hidden>
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex max-h-[min(560px,80dvh)] w-[min(380px,calc(100vw-24px))] flex-col p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p className="text-[13.5px] font-semibold">Notifications</p>
          {unread > 0 ? (
            <Button variant="ghost" size="sm" className="-mr-2 h-7 px-2 text-[12px]" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
              <CheckCheck /> Mark all read
            </Button>
          ) : (
            <span className="text-[11.5px] text-muted-foreground">{items.length ? 'All caught up' : ''}</span>
          )}
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          {!me?.tenant ? (
            <Empty text="Notifications appear here once you’re working in a school." />
          ) : q.isLoading ? (
            <div className="space-y-3 p-4" aria-busy>
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
          ) : q.error && !q.data ? (
            <p className="px-4 py-8 text-center text-[12.5px] text-muted-foreground">Couldn’t load notifications. They’ll refresh in a moment.</p>
          ) : items.length === 0 ? (
            <Empty text="Messages from school, reminders and updates will show up here." />
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className={cn(
                      'flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none',
                      !n.readAt && 'bg-brand-soft/30',
                    )}
                  >
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand')} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-[13px] leading-snug', n.readAt ? 'text-foreground/90' : 'font-semibold')}>
                        {n.title}
                        {!n.readAt && <span className="sr-only"> (unread)</span>}
                      </span>
                      {n.body && <span className="mt-0.5 line-clamp-3 block whitespace-pre-line break-words text-[12.5px] text-muted-foreground">{n.body}</span>}
                      <time dateTime={n.createdAt} title={new Date(n.createdAt).toLocaleString()} className="mt-1 block text-[11.5px] text-muted-foreground/80">
                        {formatRelative(n.createdAt)}
                      </time>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <PushFooter />
      </PopoverContent>
    </Popover>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <div className="grid size-11 place-items-center rounded-xl border border-border bg-muted/50">
        <BellOff className="size-5 text-muted-foreground" aria-hidden />
      </div>
      <p className="text-[13.5px] font-medium">No notifications yet</p>
      <p className="text-[12.5px] text-muted-foreground">{text}</p>
    </div>
  );
}

function PushFooter() {
  const push = usePush();
  if (!push.available || push.state === 'loading') return null;
  return (
    <div className="flex items-center gap-3 border-t border-border bg-muted/40 px-4 py-2.5">
      <BellRing className={cn('size-4 shrink-0', push.state === 'on' ? 'text-success' : 'text-muted-foreground')} aria-hidden />
      <p className="min-w-0 flex-1 text-[12px] leading-snug text-muted-foreground">
        {push.state === 'on' ? (
          <>
            <span className="font-medium text-foreground">Browser notifications on</span> for this device
          </>
        ) : push.state === 'blocked' ? (
          'Notifications are blocked for this site in your browser settings.'
        ) : (
          'Get notified on this device, even when the app is closed.'
        )}
      </p>
      {push.state === 'on' ? (
        <Button size="sm" variant="ghost" className="h-7 shrink-0 px-2 text-[12px]" onClick={() => void push.disable()} disabled={push.busy}>
          {push.busy && <Loader2 className="animate-spin" aria-hidden />} Turn off
        </Button>
      ) : push.state === 'off' ? (
        <Button size="sm" variant="outline" className="h-7 shrink-0 px-2.5 text-[12px]" onClick={() => void push.enable()} disabled={push.busy}>
          {push.busy && <Loader2 className="animate-spin" aria-hidden />} Allow
        </Button>
      ) : null}
    </div>
  );
}
