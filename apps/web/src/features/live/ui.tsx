import { type Channel, CHANNEL_LABELS, CHANNELS, LIVE_PROVIDER_LABELS, type LiveClassRow, type LiveProvider, type LiveStatus } from '@aischool/shared';
import { AlertTriangle, Clock, FileText, Link2, LogIn, Play, Video } from 'lucide-react';
import type * as React from 'react';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Badge } from '@/components/ui/badge';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Tip } from '@/components/ui/tooltip';
import { useCan, useMe } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { CHANNEL_ICON } from '../comms/ui';
import { useJoinLiveClass } from './api';

// ------------------------------------------------------------------ school time

const FALLBACK_TZ = 'Africa/Lagos';

/** The school's timezone (Lagos unless the school says otherwise). */
export function useSchoolTz(): string {
  return useMe()?.tenant?.timezone || FALLBACK_TZ;
}

function parts(d: Date, tz: string) {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d)) {
    out[p.type] = p.value;
  }
  return out;
}

/** YYYY-MM-DD in school time. */
export function schoolDate(value: string | Date, tz: string): string {
  const p = parts(new Date(value), tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** HH:MM in school time. */
export function schoolTime(value: string | Date, tz: string): string {
  const p = parts(new Date(value), tz);
  return `${p.hour}:${p.minute}`;
}

export function schoolToday(tz: string): string {
  return schoolDate(new Date(), tz);
}

/** UTC ISO instant for a school-local date and HH:MM (works for any timezone, DST included). */
export function schoolToIso(date: string, time: string, tz: string): string {
  const guess = new Date(`${date}T${time}:00Z`);
  const p = parts(guess, tz);
  const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return new Date(guess.getTime() - (local - guess.getTime())).toISOString();
}

/** Add days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing the date. */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return addDays(date, -((d.getUTCDay() + 6) % 7));
}

/** "Thu 1 Oct" for a YYYY-MM-DD date. */
export function dayLabel(date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

/** "Today", "Tomorrow", "Yesterday" or "Thu 1 Oct". */
export function relativeDay(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  if (date === addDays(today, -1)) return 'Yesterday';
  return dayLabel(date);
}

/** "09:00–09:40" in school time. */
export function timeRange(c: Pick<LiveClassRow, 'startsAt' | 'endsAt'>, tz: string): string {
  return `${schoolTime(c.startsAt, tz)}–${schoolTime(c.endsAt, tz)}`;
}

export function minutesBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000);
}

export function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim();
}

// ------------------------------------------------------------------ providers

const PROVIDER_STYLE: Record<LiveProvider, { short: string; className: string }> = {
  GOOGLE_MEET: { short: 'Meet', className: 'bg-[color-mix(in_oklab,#00897b_14%,transparent)] text-[#00897b] dark:text-[#4db6ac]' },
  ZOOM: { short: 'Zoom', className: 'bg-[color-mix(in_oklab,#2d8cff_14%,transparent)] text-[#2d8cff] dark:text-[#6aaeff]' },
  BBB: { short: 'BBB', className: 'bg-[color-mix(in_oklab,#283274_16%,transparent)] text-[#3949ab] dark:text-[#8c9eff]' },
  EXTERNAL: { short: 'Link', className: 'bg-muted text-muted-foreground' },
};

export const PROVIDER_SHORT: Record<LiveProvider, string> = Object.fromEntries(Object.entries(PROVIDER_STYLE).map(([k, v]) => [k, v.short])) as Record<LiveProvider, string>;

/** A small coloured tile for the meeting service. */
export function ProviderIcon({ provider, size = 'md', className }: { provider: LiveProvider; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const s = PROVIDER_STYLE[provider];
  const Icon = provider === 'EXTERNAL' ? Link2 : Video;
  return (
    <span
      role="img"
      aria-label={LIVE_PROVIDER_LABELS[provider]}
      className={cn('grid shrink-0 place-items-center', size === 'sm' ? 'size-6 rounded-md [&_svg]:size-3.5' : size === 'lg' ? 'size-12 rounded-2xl [&_svg]:size-6' : 'size-9 rounded-xl [&_svg]:size-[18px]', s.className, className)}
    >
      <Icon aria-hidden />
    </span>
  );
}

// ------------------------------------------------------------------ status

export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn('relative flex size-1.5', className)} aria-hidden>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-70" />
      <span className="relative inline-flex size-1.5 rounded-full bg-current" />
    </span>
  );
}

export function LiveStatusBadge({ status, className }: { status: LiveStatus; className?: string }) {
  if (status === 'LIVE') {
    return (
      <Badge variant="danger" className={cn('gap-1.5 font-semibold', className)}>
        <LiveDot /> Live now
      </Badge>
    );
  }
  if (status === 'SCHEDULED') {
    return (
      <Badge variant="info" dot className={className}>
        Scheduled
      </Badge>
    );
  }
  if (status === 'ENDED') {
    return (
      <Badge variant="secondary" className={className}>
        Ended
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={cn('line-through decoration-1', className)}>
      Cancelled
    </Badge>
  );
}

export function SummaryBadge({ state }: { state: LiveClassRow['intelligence'] }) {
  if (state === 'READY') {
    return (
      <Badge variant="outline" className="gap-1 border-ai-2/30 text-foreground">
        <AiSparkle className="size-3" animated={false} /> Summary ready
      </Badge>
    );
  }
  if (state === 'QUEUED' || state === 'RUNNING') {
    return (
      <Badge variant="ai" className="gap-1.5">
        <LiveDot /> Generating
      </Badge>
    );
  }
  if (state === 'FAILED') {
    return (
      <Badge variant="danger" className="gap-1">
        <AlertTriangle /> Summary failed
      </Badge>
    );
  }
  return <Badge variant="outline">No summary yet</Badge>;
}

export function TranscriptBadge() {
  return (
    <Badge variant="outline" className="gap-1">
      <FileText /> Transcript
    </Badge>
  );
}

/** Present + late out of the class size, as a whole percentage. */
export function attendancePct(a: LiveClassRow['attendance']): number | null {
  if (!a) return null;
  const base = a.expected || a.present + a.late + a.absent;
  return base ? Math.round(((a.present + a.late) / base) * 100) : null;
}

// ------------------------------------------------------------------ join

/** "Start class" for the host, "Join" for everyone else. Opens the meeting in a new tab. */
export function JoinButton({
  liveClass,
  size = 'sm',
  className,
  label,
}: {
  liveClass: Pick<LiveClassRow, 'id' | 'status' | 'canHost' | 'title'>;
  size?: ButtonProps['size'];
  className?: string;
  label?: string;
}) {
  const join = useJoinLiveClass();
  const host = liveClass.canHost;
  if (liveClass.status !== 'LIVE') return null;
  return (
    <Button
      size={size}
      variant={host ? 'default' : 'brand'}
      className={cn(!host && 'bg-danger text-white hover:bg-danger/90', className)}
      loading={join.isPending && join.variables === liveClass.id}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        join.mutate(liveClass.id);
      }}
      aria-label={`${label ?? (host ? 'Start' : 'Join')} ${liveClass.title} (opens in a new tab)`}
    >
      {!(join.isPending && join.variables === liveClass.id) && (host ? <Play /> : <LogIn />)}
      {label ?? (host ? 'Start class' : 'Join')}
    </Button>
  );
}

/** For scheduled classes: when the room opens. */
export function OpensHint({ startsAt, className }: { startsAt: string; className?: string }) {
  const mins = Math.round((new Date(startsAt).getTime() - Date.now()) / 60_000) - 10;
  if (mins > 24 * 60 || mins < 0) return null;
  const text = mins < 60 ? `Opens in ${Math.max(1, mins)} min` : `Opens in ${Math.floor(mins / 60)} h ${mins % 60 ? `${mins % 60} min` : ''}`.trim();
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11.5px] text-muted-foreground', className)}>
      <Clock className="size-3" aria-hidden /> {text}
    </span>
  );
}

// ------------------------------------------------------------------ parent channels

const FREE_CHANNELS: Channel[] = ['IN_APP', 'PUSH'];

/** Channels this person may use to tell parents: in-app and push are free; SMS, email and WhatsApp need messaging permission. */
export function useParentChannels(): Channel[] {
  const canSend = useCan('comms.send');
  return CHANNELS.filter((c) => canSend || FREE_CHANNELS.includes(c)).sort((a, b) => FREE_CHANNELS.indexOf(b) - FREE_CHANNELS.indexOf(a));
}

export function ChannelChooser({ value, onChange, label, idPrefix }: { value: Channel[]; onChange: (v: Channel[]) => void; label: string; idPrefix?: string }) {
  const options = useParentChannels();
  const canSend = useCan('comms.send');
  return (
    <div className="grid gap-2">
      <div role="group" aria-label={label} id={idPrefix} className="flex flex-wrap gap-1.5">
        {options.map((c) => {
          const on = value.includes(c);
          const Icon = CHANNEL_ICON[c];
          const paid = !FREE_CHANNELS.includes(c);
          return (
            <Tip key={c} label={paid ? 'Charged by your provider' : 'Free'}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onChange(on ? value.filter((x) => x !== c) : [...value, c])}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  on ? 'border-brand bg-brand text-brand-foreground' : 'border-border bg-card hover:bg-muted/50',
                )}
              >
                <Icon className="size-3.5" aria-hidden /> {CHANNEL_LABELS[c]}
              </button>
            </Tip>
          );
        })}
      </div>
      <p className="text-[12px] text-muted-foreground">
        {value.length === 0
          ? 'Nobody is notified — it still shows in the family portal.'
          : canSend
            ? 'In-app and push are free; SMS, email and WhatsApp use your messaging credit.'
            : 'In-app and push are free. SMS, email and WhatsApp need messaging permission.'}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ bits

export function SectionTitle({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 className="font-display text-[15px] font-semibold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

/** Revision notes and similar AI text: paragraphs, with "-"/"•" lines as bullets. */
export function NotesText({ text, className }: { text: string; className?: string }) {
  const blocks: { kind: 'p' | 'ul'; lines: string[] }[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) {
      blocks.push({ kind: 'p', lines: [] });
      continue;
    }
    const bullet = /^([-*•]|\d+[.)])\s+/.exec(line);
    const last = blocks[blocks.length - 1];
    if (bullet) {
      const item = line.slice(bullet[0].length);
      if (last?.kind === 'ul') last.lines.push(item);
      else blocks.push({ kind: 'ul', lines: [item] });
    } else if (last?.kind === 'p' && last.lines.length) {
      last.lines.push(line);
    } else {
      blocks.push({ kind: 'p', lines: [line] });
    }
  }
  return (
    <div className={cn('space-y-2.5 text-[13.5px] leading-relaxed', className)}>
      {blocks
        .filter((b) => b.lines.length)
        .map((b, i) =>
          b.kind === 'ul' ? (
            <ul key={i} className="space-y-1.5">
              {b.lines.map((l, j) => (
                <li key={j} className="flex gap-2.5">
                  <span aria-hidden className="mt-[9px] size-1.5 shrink-0 rounded-full bg-brand/60" />
                  <span className="min-w-0 break-words">{l}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p key={i} className="break-words">
              {b.lines.join(' ')}
            </p>
          ),
        )}
    </div>
  );
}
