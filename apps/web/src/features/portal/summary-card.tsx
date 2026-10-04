import type { PortalChild, PortalMe } from '@aischool/shared';
import { ArrowRight, Backpack, Banknote, CalendarCheck, FileText, Lock, Trophy } from 'lucide-react';
import { Link } from 'react-router';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatMoney, formatPct } from '@/lib/format';
import { cn, initialsFromName } from '@/lib/utils';
import { useIsPortalUser, usePortalMe, usePortalOverview } from './api';
import { portalPath, positionText } from './ui';

/**
 * The family dashboard's lead card: each child's attendance, latest result,
 * next exam and (for parents) fees, linking into "My school". Renders nothing
 * for anyone the portal isn't for.
 */
export function PortalSummaryCard() {
  const isPortal = useIsPortalUser();
  const q = usePortalMe(isPortal);
  if (!isPortal || q.error) return null;
  if (!q.data) return <Skeleton className="h-40 rounded-2xl" />;
  const me = q.data;
  if (me.children.length === 0) return null;
  const parent = me.role === 'PARENT';
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold">
          <Backpack className="size-4 text-brand" aria-hidden /> {parent ? (me.children.length > 1 ? 'Your children at school' : 'At school') : 'My school'}
        </h2>
        <Link to="/school" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline">
          Open <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      <ul className="divide-y divide-border">
        {me.children.map((c) => (
          <ChildRow key={c.id} c={c} me={me} />
        ))}
      </ul>
    </Card>
  );
}

function ChildRow({ c, me }: { c: PortalChild; me: PortalMe }) {
  const q = usePortalOverview(c.id);
  const d = q.data;
  const parent = me.role === 'PARENT';
  const exam = d?.upcoming.find((e) => e.category === 'EXAM');
  const r = d?.latestResult;
  return (
    <li>
      <Link
        to={portalPath('overview', c.id)}
        className="group block px-4 py-3.5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
      >
        {parent && (
          <div className="mb-2.5 flex items-center gap-2.5">
            <Avatar name={c.name} initials={initialsFromName(c.name)} src={c.photoUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">{c.name}</p>
              <p className="truncate text-[12px] text-muted-foreground">{c.className ?? 'No class yet'}</p>
            </div>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
          </div>
        )}
        {!d ? (
          q.error ? (
            <p className="text-[12.5px] text-muted-foreground">Couldn’t load the summary. Tap to open.</p>
          ) : (
            <Skeleton className="h-12 rounded-xl" />
          )
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 [&>*]:min-w-0">
            {me.settings.showAttendance && (
              <Mini icon={CalendarCheck} label="Attendance" value={d.attendance?.daysMarked ? formatPct(d.attendance.rate, 0) : '—'} note={d.attendance?.absent ? `${d.attendance.absent} absent` : 'this term'} />
            )}
            {me.settings.showResults && (
              <Mini
                icon={r?.withheld ? Lock : Trophy}
                label="Latest result"
                value={!r ? '—' : r.withheld ? 'On hold' : formatPct(r.average, 1)}
                note={!r ? 'Not published yet' : r.withheld ? r.term.name : (positionText(r.position, r.classSize) ?? r.term.name)}
              />
            )}
            {me.settings.showCalendar && (
              <Mini icon={FileText} label="Next exam" value={exam ? formatDate(exam.startDate, { day: 'numeric', month: 'short', year: undefined }) : '—'} note={exam?.title ?? 'None scheduled'} />
            )}
            {parent && d.feesOwed != null && (
              <Mini
                icon={Banknote}
                label="Fees"
                value={d.feesOwed > 0 ? formatMoney(d.feesOwed, me.currency, { maximumFractionDigits: 0 }) : 'Paid'}
                note={d.feesOwed > 0 ? 'outstanding' : 'nothing owed'}
                tone={d.feesOwed > 0 ? 'text-danger' : 'text-success'}
              />
            )}
          </div>
        )}
      </Link>
      {parent && d?.feesOwed != null && me.settings.showFees && (
        <div className="-mt-1 px-4 pb-3.5 sm:px-5">
          <Link
            to={portalPath('fees', c.id)}
            className={cn(
              'inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              d.feesOwed > 0 ? 'bg-brand text-brand-foreground hover:bg-brand/90' : 'text-brand hover:bg-muted/50',
            )}
          >
            <Banknote className="size-4" aria-hidden />
            {d.feesOwed > 0 ? `Pay ${formatMoney(d.feesOwed, me.currency, { maximumFractionDigits: 0 })} now` : 'Fees and receipts'}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      )}
    </li>
  );
}

function Mini({ icon: Icon, label, value, note, tone }: { icon?: typeof Trophy; label: string; value: string; note: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-muted/60 px-3 py-2">
      <p className="flex items-center gap-1 truncate text-[11px] font-medium text-muted-foreground">
        {Icon && <Icon className="size-3 shrink-0" aria-hidden />}
        {label}
      </p>
      <p className={cn('truncate font-display text-[16px] font-semibold tabular leading-snug', tone)}>{value}</p>
      <p className="truncate text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}
