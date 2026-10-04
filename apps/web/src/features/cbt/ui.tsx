import type { CbtAttemptStatus, CbtPhase } from '@aischool/shared';
import { Badge } from '@/components/ui/badge';

const PHASE: Record<CbtPhase, { label: string; variant: 'secondary' | 'info' | 'success' | 'outline' }> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  UPCOMING: { label: 'Scheduled', variant: 'info' },
  OPEN: { label: 'Open now', variant: 'success' },
  ENDED: { label: 'Closed', variant: 'outline' },
};

export function PhaseBadge({ phase }: { phase: CbtPhase }) {
  const p = PHASE[phase];
  return (
    <Badge variant={p.variant} dot>
      {p.label}
    </Badge>
  );
}

const ATTEMPT: Record<CbtAttemptStatus | 'NOT_STARTED', { label: string; variant: 'secondary' | 'info' | 'success' | 'warning' | 'outline' }> = {
  NOT_STARTED: { label: 'Not started', variant: 'outline' },
  IN_PROGRESS: { label: 'Writing', variant: 'info' },
  SUBMITTED: { label: 'To mark', variant: 'warning' },
  MARKED: { label: 'Marked', variant: 'success' },
};

export function AttemptBadge({ status, written }: { status: CbtAttemptStatus | 'NOT_STARTED'; written?: boolean }) {
  const a = ATTEMPT[status];
  // Without written questions a handed-in attempt is marked straight away; "To mark" only applies to written work.
  const label = status === 'SUBMITTED' && written === false ? 'Submitted' : a.label;
  return (
    <Badge variant={a.variant} dot>
      {label}
    </Badge>
  );
}

/** 75 → "1:15", 3725 → "1:02:05". */
export function clock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

export function minutesLabel(seconds: number | null) {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  return m ? `${m} min ${seconds % 60 ? `${seconds % 60}s` : ''}`.trim() : `${seconds}s`;
}

/** "Mon 6 Oct, 09:00 – 11:00" (dates repeat only when the window spans days). */
export function windowLabel(opensAt: string, closesAt: string) {
  const o = new Date(opensAt);
  const c = new Date(closesAt);
  const day = (d: Date) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
  const time = (d: Date) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(d);
  return day(o) === day(c) ? `${day(o)}, ${time(o)} – ${time(c)}` : `${day(o)} ${time(o)} – ${day(c)} ${time(c)}`;
}

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
