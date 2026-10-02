import type { TicketMessage } from '@aischool/shared';
import { Lock } from 'lucide-react';
import { BrandMark } from '@/components/layout/brand';
import { Avatar } from '@/components/ui/avatar';
import { formatDateTime, formatRelative } from '@/lib/format';
import { cn, initialsFromName } from '@/lib/utils';

/**
 * A ticket's conversation. On the platform side internal notes show (amber,
 * dashed) and replies carry the agent's name; schools see "AI School OS support".
 */
export function TicketThread({ thread, viewer, schoolName }: { thread: TicketMessage[]; viewer: 'platform' | 'school'; schoolName?: string }) {
  return (
    <ol className="space-y-4" aria-label="Conversation">
      {thread.map((m) => {
        const name = m.fromPlatform ? (viewer === 'school' ? 'AI School OS support' : (m.author?.name ?? 'AI School OS support')) : (m.author?.name ?? 'School');
        return (
          <li key={m.id} className={cn('flex gap-3', m.fromPlatform && viewer === 'school' && 'flex-row-reverse')}>
            {m.fromPlatform ? (
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-card shadow-soft ring-1 ring-border">
                <BrandMark className="size-5" />
              </span>
            ) : (
              <Avatar name={name} initials={initialsFromName(name)} size="sm" />
            )}
            <div
              className={cn(
                'min-w-0 max-w-[min(100%,680px)] flex-1 rounded-2xl border px-4 py-3',
                m.internal
                  ? 'border-dashed border-warning/50 bg-warning-soft/40'
                  : m.fromPlatform
                    ? 'border-brand/20 bg-brand-soft/35'
                    : 'border-border bg-card',
              )}
            >
              <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[13px] font-semibold">{name}</span>
                {!m.fromPlatform && viewer === 'platform' && schoolName && <span className="text-[12px] text-muted-foreground">{schoolName}</span>}
                {m.fromPlatform && viewer === 'platform' && !m.internal && <span className="text-[11.5px] text-brand">Reply to school</span>}
                {m.internal && (
                  <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-warning">
                    <Lock className="size-3" /> Internal note — the school can’t see this
                  </span>
                )}
                <time className="ml-auto text-[11.5px] text-muted-foreground" dateTime={m.createdAt} title={formatDateTime(m.createdAt)}>
                  {formatRelative(m.createdAt)}
                </time>
              </div>
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed [overflow-wrap:anywhere]">{m.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
