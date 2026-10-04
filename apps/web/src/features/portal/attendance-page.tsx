import type { PortalAttendance } from '@aischool/shared';
import { CalendarCheck, CalendarX2, Check, Clock, ShieldCheck, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatPct, todayIso } from '@/lib/format';
import { cn } from '@/lib/utils';
import { usePortalAttendance } from './api';
import { AttendanceRing, PortalShell, type ShellCtx, StatTile } from './ui';

type Day = PortalAttendance['days'][number];
type Status = Day['status'];

/** Colour is never the only signal: every day also carries a letter and an icon in the legend. */
const STATUS: Record<Status, { label: string; letter: string; icon: typeof Check; cell: string; text: string }> = {
  PRESENT: { label: 'Present', letter: 'P', icon: Check, cell: 'bg-success-soft text-success border-success/30', text: 'text-success' },
  LATE: { label: 'Late', letter: 'L', icon: Clock, cell: 'bg-warning-soft text-warning border-warning/40', text: 'text-warning' },
  ABSENT: { label: 'Absent', letter: 'A', icon: X, cell: 'bg-danger-soft text-danger border-danger/40', text: 'text-danger' },
  EXCUSED: { label: 'Excused', letter: 'E', icon: ShieldCheck, cell: 'bg-info-soft text-info border-info/30', text: 'text-info' },
};

export default function PortalAttendancePage() {
  return (
    <PortalShell
      section="attendance"
      title={({ isParent, child }) => (isParent ? `${child.firstName}’s attendance` : 'My attendance')}
      description={({ isParent, child }) => (isParent ? `Every day ${child.firstName} was marked in the class register.` : 'Every day you were marked in the class register.')}
    >
      {(ctx) => <AttendanceBody {...ctx} />}
    </PortalShell>
  );
}

function AttendanceBody({ child, isParent }: ShellCtx) {
  const [termId, setTermId] = useState<string | undefined>(undefined);
  const q = usePortalAttendance(child.id, termId);
  const d = q.data;
  if (q.error && !d) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!d) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64 max-w-full" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }
  const c = d.counts;
  const missed = d.days.filter((x) => x.status !== 'PRESENT');
  return (
    <div className={cn('space-y-4 transition-opacity', q.isFetching && q.isPlaceholderData && 'opacity-60')}>
      <div className="flex flex-wrap items-center gap-3">
        <Select value={d.term.id} onValueChange={setTermId}>
          <SelectTrigger className="w-full sm:w-72" aria-label="Term">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {d.terms.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name} · {t.sessionName}
                {t.isCurrent ? ' (this term)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[12.5px] text-muted-foreground">
          {formatDate(d.term.startsOn, { day: 'numeric', month: 'short' })} – {formatDate(d.term.endsOn)}
        </p>
      </div>

      {c.daysMarked === 0 ? (
        <Card>
          <EmptyState icon={CalendarCheck} title="No register marked" description="Nothing has been recorded for this term yet." />
        </Card>
      ) : (
        <>
          <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
            <div className="flex items-center gap-4">
              <AttendanceRing rate={c.rate} size={88} />
              <div className="min-w-0 sm:hidden">
                <p className="font-display text-[15px] font-semibold">Attendance rate</p>
                <p className="text-[12.5px] text-muted-foreground">{c.daysMarked} school days marked</p>
              </div>
            </div>
            <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
              <StatTile label="Present" value={c.present} icon={Check} />
              <StatTile label="Absent" value={c.absent} icon={X} tone={c.absent > 0 ? 'text-danger' : undefined} />
              <StatTile label="Late" value={c.late} icon={Clock} tone={c.late > 0 ? 'text-warning' : undefined} />
              <StatTile label="Excused" value={c.excused} icon={ShieldCheck} />
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-[15px] font-semibold">Day by day</h2>
              <Legend />
            </div>
            <Calendar days={d.days} start={d.term.startsOn} end={d.term.endsOn} />
          </Card>

          <Card className="p-4 sm:p-5">
            <h2 className="mb-3 font-display text-[15px] font-semibold">Absences and late arrivals</h2>
            {missed.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">{isParent ? `${child.firstName} was` : 'You were'} present and on time every day this term ({formatPct(c.rate)}).</p>
            ) : (
              <ul className="divide-y divide-border">
                {missed.map((x) => {
                  const st = STATUS[x.status];
                  return (
                    <li key={x.date} className="flex items-start gap-3 py-2.5">
                      <StatusChip status={x.status} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-medium">{formatDate(x.date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                        <p className={cn('text-[12.5px]', st.text)}>{st.label}</p>
                        {x.note && <p className="mt-0.5 text-[13px] text-muted-foreground">“{x.note}”</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function StatusChip({ status, className }: { status: Status; className?: string }) {
  const st = STATUS[status];
  return (
    <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg border text-[12px] font-bold', st.cell, className)} aria-hidden>
      {st.letter}
    </span>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Key">
      {(Object.keys(STATUS) as Status[]).map((k) => (
        <li key={k} className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <StatusChip status={k} className="size-5 rounded-md text-[10.5px]" />
          {STATUS[k].label}
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ month calendar

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const iso = (d: Date) => d.toISOString().slice(0, 10);

function monthsBetween(start: string, end: string): Date[] {
  const out: Date[] = [];
  const s = new Date(`${start.slice(0, 7)}-01T00:00:00Z`);
  const e = new Date(`${end.slice(0, 7)}-01T00:00:00Z`);
  for (let m = s; m <= e && out.length < 12; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) out.push(m);
  return out;
}

function Calendar({ days, start, end }: { days: Day[]; start: string; end: string }) {
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const today = todayIso();
  // Up to today (or the last marked day), never months that haven't happened yet.
  const lastMarked = days[0]?.date ?? start;
  const until = [end, today > lastMarked ? today : lastMarked].sort()[0];
  const months = monthsBetween(start, until < start ? start : until).reverse();
  const [picked, setPicked] = useState<string | null>(null);
  const sel = picked ? byDate.get(picked) : undefined;

  return (
    <div className="space-y-5">
      {sel && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-3">
          <StatusChip status={sel.status} />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-medium">
              {formatDate(sel.date, { weekday: 'long', day: 'numeric', month: 'long' })} · <span className={STATUS[sel.status].text}>{STATUS[sel.status].label}</span>
            </p>
            <p className="text-[13px] text-muted-foreground">{sel.note ? `“${sel.note}”` : 'No note from the school.'}</p>
          </div>
          <button type="button" onClick={() => setPicked(null)} className="-m-1 rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
      )}
      <div className="grid gap-5 md:grid-cols-2 [&>*]:min-w-0">
        {months.map((m) => (
          <Month key={iso(m)} month={m} byDate={byDate} start={start} end={end} picked={picked} onPick={setPicked} />
        ))}
      </div>
      {months.length === 0 && (
        <EmptyState compact icon={CalendarX2} title="This term hasn’t started" />
      )}
    </div>
  );
}

function Month({
  month,
  byDate,
  start,
  end,
  picked,
  onPick,
}: {
  month: Date;
  byDate: Map<string, Day>;
  start: string;
  end: string;
  picked: string | null;
  onPick: (d: string) => void;
}) {
  const y = month.getUTCFullYear();
  const mo = month.getUTCMonth();
  const daysIn = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, mo, 1)).getUTCDay() + 6) % 7; // Monday first
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => iso(new Date(Date.UTC(y, mo, i + 1))))];
  const label = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(month);
  return (
    <section aria-label={label}>
      <h3 className="mb-2 text-[13px] font-semibold">{label}</h3>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <span key={w} className="pb-1 text-center text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground" aria-hidden>
            {w.slice(0, 2)}
          </span>
        ))}
        {cells.map((date, i) => {
          if (!date) return <span key={`b${i}`} aria-hidden />;
          const day = byDate.get(date);
          const inTerm = date >= start && date <= end;
          const n = Number(date.slice(8));
          if (!day) {
            return (
              <span key={date} className={cn('grid aspect-square place-items-center rounded-lg text-[12px] tabular', inTerm ? 'text-muted-foreground' : 'text-muted-foreground/40')}>
                {n}
              </span>
            );
          }
          const st = STATUS[day.status];
          const nice = formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' });
          return (
            <button
              key={date}
              type="button"
              onClick={() => onPick(date)}
              aria-pressed={picked === date}
              aria-label={`${nice}: ${st.label}${day.note ? ` (${day.note})` : ''}`}
              className={cn(
                'relative grid aspect-square place-items-center rounded-lg border text-[12px] font-semibold tabular leading-none transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95',
                st.cell,
                picked === date && 'ring-2 ring-foreground/50',
              )}
            >
              <span className="flex flex-col items-center gap-0.5">
                <span>{n}</span>
                <span className="text-[9px] font-bold opacity-80">{st.letter}</span>
              </span>
              {day.note && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-current" aria-hidden />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
