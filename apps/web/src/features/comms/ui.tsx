import {
  type AnnouncementAudience,
  type Audience,
  type AudiencePreview,
  type BroadcastSource,
  type BroadcastStatus,
  type Channel,
  CHANNEL_LABELS,
  type EventCategory,
  type EventRow,
  formatMoney,
  MESSAGE_TOKENS,
  smsInfo,
  smsSafe,
} from '@aischool/shared';
import { AlertTriangle, Bell, BellRing, Mail, MessageCircle, MessageSquare, Wand2 } from 'lucide-react';
import type * as React from 'react';
import { useNavigate } from 'react-router';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tip } from '@/components/ui/tooltip';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

// ------------------------------------------------------------------ channels

export const CHANNEL_ICON: Record<Channel, React.ComponentType<{ className?: string }>> = {
  EMAIL: Mail,
  SMS: MessageSquare,
  WHATSAPP: MessageCircle,
  PUSH: BellRing,
  IN_APP: Bell,
};

/** Shorter labels for chips and table cells. */
export const CHANNEL_SHORT: Record<Channel, string> = { EMAIL: 'Email', SMS: 'SMS', WHATSAPP: 'WhatsApp', PUSH: 'Push', IN_APP: 'In-app' };

export function ChannelIcons({ channels, className }: { channels: Channel[]; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)} aria-label={`Channels: ${channels.map((c) => CHANNEL_LABELS[c]).join(', ')}`} role="img">
      {channels.map((c) => {
        const Icon = CHANNEL_ICON[c];
        return (
          <Tip key={c} label={CHANNEL_LABELS[c]}>
            <span className="grid size-5 place-items-center rounded-md bg-muted text-muted-foreground">
              <Icon className="size-3" aria-hidden />
            </span>
          </Tip>
        );
      })}
    </span>
  );
}

// ------------------------------------------------------------------ badges

const STATUS: Record<BroadcastStatus, { label: string; variant: BadgeProps['variant'] }> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  SCHEDULED: { label: 'Scheduled', variant: 'info' },
  SENDING: { label: 'Sending', variant: 'warning' },
  SENT: { label: 'Sent', variant: 'success' },
  CANCELLED: { label: 'Cancelled', variant: 'outline' },
};

export function BroadcastStatusBadge({ status, className }: { status: BroadcastStatus; className?: string }) {
  const s = STATUS[status];
  return (
    <Badge variant={s.variant} dot={status !== 'CANCELLED'} className={cn(status === 'SENDING' && '[&>span:first-child]:animate-pulse', className)}>
      {s.label}
    </Badge>
  );
}

export const SOURCE_LABELS: Record<BroadcastSource, string> = {
  MANUAL: 'Written',
  BIRTHDAY: 'Birthday',
  EVENT_REMINDER: 'Event reminder',
  ANNOUNCEMENT: 'Announcement',
  TRANSPORT: 'Transport',
  FEES: 'Fees',
  ENQUIRY: 'Enquiry',
  HOMEWORK: 'Homework',
  CLASS_SUMMARY: 'Class summary',
  ADMISSIONS: 'Admissions',
  WELFARE: 'Behaviour & health',
  ALUMNI: 'Alumni',
  LEARNING_UPDATE: 'Learning update',
};

export function SourceBadge({ source }: { source: BroadcastSource }) {
  if (source === 'MANUAL') return null;
  return <Badge variant="brand">{SOURCE_LABELS[source]}</Badge>;
}

export const ANNOUNCEMENT_AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  EVERYONE: 'Everyone',
  STAFF: 'Staff',
  PARENTS: 'Parents',
  STUDENTS: 'Students',
};

// ------------------------------------------------------------------ delivery bar

export function DeliveryBar({ sent, failed, skipped, queued, className }: { sent: number; failed: number; skipped: number; queued: number; className?: string }) {
  const total = sent + failed + skipped + queued;
  const pct = (n: number) => (total ? `${(n / total) * 100}%` : '0%');
  return (
    <div
      className={cn('flex h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
      role="img"
      aria-label={`${sent} sent, ${failed} failed, ${skipped} skipped, ${queued} waiting`}
    >
      <span className="h-full bg-success transition-[width] duration-500" style={{ width: pct(sent) }} />
      <span className="h-full bg-danger transition-[width] duration-500" style={{ width: pct(failed) }} />
      <span className="h-full bg-border-strong transition-[width] duration-500" style={{ width: pct(skipped) }} />
      <span className="h-full animate-pulse bg-warning/70 transition-[width] duration-500" style={{ width: pct(queued) }} />
    </div>
  );
}

// ------------------------------------------------------------------ SMS

/** Characters that still force Unicode after smsSafe (emoji, accented letters outside GSM…). */
export function unicodeChars(text: string): string[] {
  const out = new Set<string>();
  for (const ch of smsSafe(text)) if (smsInfo(ch).encoding === 'UNICODE') out.add(ch);
  return [...out];
}

/** smsSafe, then drop anything that would still make it a Unicode SMS. */
export function makeSmsSafe(text: string): string {
  const bad = new Set(unicodeChars(text));
  return [...smsSafe(text)].filter((ch) => !bad.has(ch)).join('').replace(/ {2,}/g, ' ');
}

/** Live counter for an SMS text: characters, pages, encoding, plus a fix for Unicode. */
export function SmsCounter({ text, onFix, className }: { text: string; onFix?: () => void; className?: string }) {
  const info = smsInfo(smsSafe(text));
  const unicode = info.encoding === 'UNICODE';
  const culprits = unicode ? unicodeChars(text) : [];
  return (
    <div className={cn('space-y-2', className)}>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground tabular" aria-live="polite">
        <span>{info.characters.toLocaleString()} characters</span>
        <span className={cn(info.segments > 2 && 'font-medium text-warning')}>
          {info.segments} SMS page{info.segments === 1 ? '' : 's'} per person
        </span>
        <span className={cn(unicode && 'font-medium text-warning')}>{unicode ? 'Unicode (70 per page)' : 'Standard (160 per page)'}</span>
      </p>
      {unicode && (
        <div className="flex flex-col gap-2 rounded-xl border border-warning/30 bg-warning-soft/50 px-3 py-2.5 text-[12.5px] sm:flex-row sm:items-center">
          <p className="flex min-w-0 flex-1 items-start gap-2">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
            <span>
              ₦, emoji or curly quotes make this a Unicode SMS — 70 characters per page.
              {culprits.length > 0 && (
                <span className="text-muted-foreground">
                  {' '}
                  Found: <span className="font-mono">{culprits.slice(0, 8).join(' ')}</span>
                </span>
              )}
            </span>
          </p>
          {onFix && (
            <Button type="button" size="sm" variant="outline" onClick={onFix} className="shrink-0 self-start sm:self-auto">
              <Wand2 /> Make SMS-safe
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ tokens

export const TOKENS = Object.entries(MESSAGE_TOKENS) as [keyof typeof MESSAGE_TOKENS, string][];

export function TokenChips({ onInsert, className, only }: { onInsert: (token: string) => void; className?: string; only?: string[] }) {
  const list = only ? TOKENS.filter(([t]) => only.includes(t)) : TOKENS;
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <span className="text-[11.5px] text-muted-foreground">Insert:</span>
      {list.map(([token, hint]) => (
        <Tip key={token} label={hint}>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onInsert(token)}
            className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-foreground transition-colors hover:border-brand/40 hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Insert ${hint}`}
          >
            {token}
          </button>
        </Tip>
      ))}
    </div>
  );
}

/** Insert text at the caret of a textarea/input, returning the new value. */
export function insertAt(el: HTMLTextAreaElement | HTMLInputElement | null, value: string, text: string): { value: string; caret: number } {
  if (!el || el.selectionStart == null) return { value: value + text, caret: value.length + text.length };
  const start = el.selectionStart;
  const end = el.selectionEnd ?? start;
  return { value: value.slice(0, start) + text + value.slice(end), caret: start + text.length };
}

/**
 * Display-only personalisation for the preview (the server does the real
 * thing). Children and classes are read from the sample's "Parent of …" line.
 */
export function personaliseSample(text: string, sample: AudiencePreview['sample'][number] | undefined, school: string): string {
  if (!sample) return text;
  const kids = (sample.detail?.startsWith('Parent of ') ? sample.detail.slice(10) : '')
    .split(/,\s*(?![^()]*\))/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = /^(.*?)(?:\s*\((.*)\))?$/.exec(s);
      return { name: m?.[1] ?? s, cls: m?.[2] ?? null };
    });
  const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  const first = sample.name.replace(/^(mr|mrs|ms|miss|dr|engr|prof|chief)\.?\s+/i, '').split(/\s+/)[0] ?? sample.name;
  return text
    .replace(/\{\{\s*first_name\s*\}\}/g, first)
    .replace(/\{\{\s*name\s*\}\}/g, sample.name)
    .replace(/\{\{\s*children\s*\}\}/g, list(kids.map((k) => k.name)) || 'your child')
    .replace(/\{\{\s*class\s*\}\}/g, list([...new Set(kids.map((k) => k.cls).filter((x): x is string => !!x))]))
    .replace(/\{\{\s*balance\s*\}\}/g, '[their balance]')
    .replace(/\{\{\s*school\s*\}\}/g, school);
}

export function money(kobo: number, currency: string) {
  try {
    return formatMoney(kobo, currency);
  } catch {
    return formatMoney(kobo, 'NGN');
  }
}

// ------------------------------------------------------------------ composer prefill

/** What another page can hand the composer (as router state). */
export interface ComposePrefill {
  audience?: Audience;
  /** Names for hand-picked people, so the composer can show them. */
  people?: { guardians?: { id: string; name: string; detail?: string | null }[]; staff?: { id: string; name: string; detail?: string | null }[] };
  channels?: Channel[];
  title?: string;
  subject?: string;
  body?: string;
  smsBody?: string;
  source?: BroadcastSource;
  link?: string;
}

export function useOpenComposer() {
  const navigate = useNavigate();
  return (prefill: ComposePrefill) => navigate('/messages/new', { state: { prefill } });
}

// ------------------------------------------------------------------ events

export const CATEGORY_COLOR: Record<EventCategory, string> = {
  ACADEMIC: 'var(--chart-1)',
  EXAM: 'var(--danger)',
  HOLIDAY: 'var(--success)',
  PTA: 'var(--info)',
  SPORTS: 'var(--chart-5)',
  CULTURAL: 'var(--chart-3)',
  MEETING: 'var(--chart-2)',
  TRIP: 'var(--chart-4)',
  OTHER: 'var(--muted-foreground)',
};

export function categoryStyle(c: EventCategory): React.CSSProperties {
  const color = CATEGORY_COLOR[c];
  return { color, background: `color-mix(in oklab, ${color} 14%, transparent)`, borderColor: `color-mix(in oklab, ${color} 28%, transparent)` };
}

/** "Fri 3 Oct · 10:00–12:00" or "3–5 Oct · all day". */
export function eventWhen(e: Pick<EventRow, 'allDay' | 'startDate' | 'startTime' | 'endDate' | 'endTime'>, withWeekday = true): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: undefined, ...(withWeekday ? { weekday: 'short' } : {}) };
  const start = formatDate(e.startDate, opts);
  const multi = e.endDate && e.endDate !== e.startDate;
  const range = multi ? `${start} – ${formatDate(e.endDate!, opts)}` : start;
  if (e.allDay || !e.startTime) return `${range} · all day`;
  if (multi) return `${start}, ${e.startTime} – ${formatDate(e.endDate!, opts)}${e.endTime ? `, ${e.endTime}` : ''}`;
  return `${range} · ${e.startTime}${e.endTime ? `–${e.endTime}` : ''}`;
}

/** Day/month block for event lists. */
export function DateBlock({ date, className }: { date: string; className?: string }) {
  const d = new Date(`${date}T00:00:00Z`);
  return (
    <span className={cn('grid w-11 shrink-0 place-items-center rounded-xl border border-border bg-card py-1.5 text-center leading-none', className)} aria-hidden>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' }).format(d)}</span>
      <span className="mt-1 font-display text-[17px] font-semibold tabular">{d.getUTCDate()}</span>
    </span>
  );
}
