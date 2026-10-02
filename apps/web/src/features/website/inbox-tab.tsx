import { MESSAGE_STATUSES, type WebsiteMessageRow, type WebsiteMessageStatus } from '@aischool/shared';
import { Archive, ArchiveRestore, Check, ChevronDown, Inbox, Mail, MailOpen, MessageCircle, Phone, Reply } from 'lucide-react';
import * as React from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/lib/auth-store';
import { formatDateTime, formatRelative } from '@/lib/format';
import { cn, initialsFromName } from '@/lib/utils';
import { Segmented, telHref } from '../operations/ui';
import { useMessages, useSetMessageStatus, useWebsiteOverview } from './api';

type Filter = 'OPEN' | WebsiteMessageStatus;

const STATUS: Record<WebsiteMessageStatus, { label: string; variant: BadgeProps['variant'] }> = {
  NEW: { label: 'New', variant: 'brand' },
  READ: { label: 'Read', variant: 'secondary' },
  REPLIED: { label: 'Replied', variant: 'success' },
  ARCHIVED: { label: 'Archived', variant: 'outline' },
};

export default function WebsiteInboxTab() {
  const [filter, setFilter] = React.useState<Filter>('OPEN');
  const q = useMessages(filter === 'OPEN' ? undefined : filter);
  const o = useWebsiteOverview();
  const [openId, setOpenId] = React.useState<string | null>(null);
  const setStatus = useSetMessageStatus();
  const school = useMe()?.tenant?.name || 'the school';

  const expand = (m: WebsiteMessageRow) => {
    const next = openId === m.id ? null : m.id;
    setOpenId(next);
    if (next && m.status === 'NEW') setStatus.mutate({ id: m.id, status: 'READ' });
  };

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          label="Filter messages"
          value={filter}
          onChange={(f) => {
            setFilter(f);
            setOpenId(null);
          }}
          options={[{ value: 'OPEN' as Filter, label: 'Inbox' }, ...MESSAGE_STATUSES.map((s) => ({ value: s as Filter, label: STATUS[s].label, count: s === 'NEW' ? o.data?.counts.newMessages : undefined }))]}
        />
        <p className="text-[12.5px] text-muted-foreground">Messages from the website’s contact form. Applications go to Reception.</p>
      </div>
      {q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Card className="divide-y divide-border">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3 p-4">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </Card>
      ) : q.data.length === 0 ? (
        <Card>
          <EmptyState icon={Inbox} title={filter === 'OPEN' ? 'Inbox zero' : `No ${STATUS[filter as WebsiteMessageStatus].label.toLowerCase()} messages`} description="When families use the contact form on your website, their messages arrive here." />
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {q.data.map((m) => {
            const open = openId === m.id;
            const reply = `Re: ${m.subject}`;
            const greeting = `Hello ${m.name.split(' ')[0]}, thank you for your message to ${school}. `;
            return (
              <div key={m.id} className={cn(m.status === 'NEW' && 'bg-brand-soft/30')}>
                <button type="button" onClick={() => expand(m)} aria-expanded={open} className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40 sm:px-5">
                  <Avatar name={m.name} initials={initialsFromName(m.name)} size="sm" className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={cn('truncate text-[13.5px]', m.status === 'NEW' ? 'font-semibold' : 'font-medium')}>{m.name}</p>
                      <Badge variant={STATUS[m.status].variant} className="shrink-0">
                        {STATUS[m.status].label}
                      </Badge>
                      <span className="ml-auto shrink-0 text-[12px] text-muted-foreground tabular" title={formatDateTime(m.createdAt)}>
                        {formatRelative(m.createdAt)}
                      </span>
                    </div>
                    <p className="truncate text-[13px] font-medium text-foreground/90">{m.subject}</p>
                    {!open && <p className="truncate text-[12.5px] text-muted-foreground">{m.message}</p>}
                  </div>
                  <ChevronDown className={cn('mt-1 size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
                </button>
                {open && (
                  <div className="px-4 pb-4 sm:pl-[60px] sm:pr-5">
                    <p className="whitespace-pre-wrap rounded-xl border border-border bg-card p-4 text-[13.5px] leading-relaxed">{m.message}</p>
                    <p className="mt-2 text-[12px] text-muted-foreground">
                      {formatDateTime(m.createdAt)}
                      {m.email && ` · ${m.email}`}
                      {m.phone && ` · ${m.phone}`}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {m.email && (
                        <Button asChild size="sm" variant="outline">
                          <a href={`mailto:${m.email}?subject=${encodeURIComponent(reply)}&body=${encodeURIComponent(greeting)}`}>
                            <Mail /> Email
                          </a>
                        </Button>
                      )}
                      {m.phone && (
                        <>
                          <Button asChild size="sm" variant="outline">
                            <a href={telHref(m.phone)}>
                              <Phone /> Call
                            </a>
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <a href={`https://wa.me/${m.phone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(greeting)}`} target="_blank" rel="noopener noreferrer">
                              <MessageCircle /> WhatsApp
                            </a>
                          </Button>
                        </>
                      )}
                      <span className="mx-1 hidden h-8 w-px bg-border sm:block" aria-hidden />
                      {m.status !== 'REPLIED' && m.status !== 'ARCHIVED' && (
                        <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: m.id, status: 'REPLIED' })}>
                          <Reply /> Mark replied
                        </Button>
                      )}
                      {m.status !== 'NEW' && m.status !== 'ARCHIVED' && (
                        <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: m.id, status: 'NEW' })}>
                          <MailOpen /> Mark unread
                        </Button>
                      )}
                      {m.status === 'ARCHIVED' ? (
                        <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: m.id, status: 'READ' })}>
                          <ArchiveRestore /> Restore
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: m.id, status: 'ARCHIVED' }, { onSuccess: () => setOpenId(null) })}>
                          <Archive /> Archive
                        </Button>
                      )}
                      {setStatus.isSuccess && setStatus.variables?.id === m.id && <Check className="my-auto size-4 text-success" aria-label="Saved" />}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </>
  );
}
