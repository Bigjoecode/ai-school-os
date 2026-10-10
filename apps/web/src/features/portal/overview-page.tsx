import type { PortalOverview } from '@aischool/shared';
import { ArrowRight, Banknote, CalendarCheck, CalendarDays, ClipboardList, Download, Lock, Sparkles, Trophy } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useHasFeature } from '@/lib/auth-store';
import { formatDate, formatMoney, formatPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { usePortalOverview } from './api';
import { PortalHouseCard } from '../houses/portal-house-card';
import { PortalEventItem } from './events';
import { LatestOnlineTest } from './latest-online-test';
import { LatestLearningUpdateCard } from './learning-updates';
import { AttendanceRing, PortalShell, portalPath, positionText, sectionShared, type ShellCtx } from './ui';

export default function PortalOverviewPage() {
  return (
    <PortalShell
      section="overview"
      title={({ child, isParent }) => (isParent ? child.firstName : 'My school')}
      description={({ child, isParent }) =>
        isParent ? [child.className, child.admissionNumber].filter(Boolean).join(' · ') : `${child.name}${child.className ? ` · ${child.className}` : ''}`
      }
    >
      {(ctx) => <OverviewBody {...ctx} />}
    </PortalShell>
  );
}

function OverviewBody({ child, me, isParent, who }: ShellCtx) {
  const q = usePortalOverview(child.id);
  const hasHomework = useHasFeature('live_classes');
  const d = q.data;
  if (q.error && !d) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!d) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl sm:col-span-2" />
        <Skeleton className="h-56 rounded-2xl sm:col-span-2" />
      </div>
    );
  }
  const s = me.settings;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
        {sectionShared(s, 'attendance') && <AttendanceCard d={d} childId={child.id} />}
        {sectionShared(s, 'results') && <ResultCard d={d} childId={child.id} who={who} isParent={isParent} />}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*]:min-w-0">
        {isParent && d.feesOwed != null && <FeesTile owed={d.feesOwed} currency={me.currency} to={sectionShared(s, 'fees') ? portalPath('fees', child.id) : null} />}
        {hasHomework && (
          <QuickTile
            to="/learning/homework"
            icon={ClipboardList}
            value={String(d.homeworkDue)}
            label="Homework due"
            note={d.homeworkDue === 0 ? 'All handed in' : 'Not handed in yet'}
            tone={d.homeworkDue > 0 ? 'text-warning' : undefined}
          />
        )}
        {sectionShared(s, 'downloads') && (
          <QuickTile
            to={portalPath('downloads', child.id)}
            icon={Download}
            value={String(d.newDownloads)}
            label={d.newDownloads === 1 ? 'New document' : 'New documents'}
            note="In the last two weeks"
          />
        )}
      </div>

      <LatestLearningUpdateCard childId={child.id} isParent={isParent} />

      <PortalHouseCard childId={child.id} firstName={child.firstName} isParent={isParent} />

      {sectionShared(s, 'calendar') && (
        <Card className="p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold">
              <CalendarDays className="size-4 text-muted-foreground" aria-hidden /> Coming up
            </h2>
            <Button asChild variant="ghost" size="sm">
              <Link to={portalPath('calendar', child.id)}>
                Exams & calendar <ArrowRight />
              </Link>
            </Button>
          </div>
          {d.upcoming.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Nothing on the school calendar just now.</p>
          ) : (
            <ul className="grid gap-2 md:grid-cols-2 [&>*]:min-w-0">
              {d.upcoming.map((e) => (
                <PortalEventItem key={e.id} e={e} compact />
              ))}
            </ul>
          )}
        </Card>
      )}

      {isParent && (
        <Link
          to={`/family/children/${child.id}`}
          className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft transition-all hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            <Sparkles className="size-[18px]" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium">{child.firstName}’s learning</span>
            <span className="block truncate text-[12px] text-muted-foreground">AI tutor, practice, study plans and homework</span>
          </span>
          <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ attendance

function AttendanceCard({ d, childId }: { d: PortalOverview; childId: string }) {
  const a = d.attendance;
  return (
    <Card className="flex flex-col p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold">
        <CalendarCheck className="size-4 text-muted-foreground" aria-hidden /> Attendance this term
      </h2>
      {!a || a.daysMarked === 0 ? (
        <p className="mt-3 flex-1 text-[13px] text-muted-foreground">No register has been marked yet this term.</p>
      ) : (
        <div className="mt-3 flex flex-1 items-center gap-4">
          <AttendanceRing rate={a.rate} />
          <dl className="grid min-w-0 flex-1 grid-cols-3 gap-2 text-center">
            <Count label="Present" value={a.present} />
            <Count label="Absent" value={a.absent} tone={a.absent > 0 ? 'text-danger' : undefined} />
            <Count label="Late" value={a.late} tone={a.late > 0 ? 'text-warning' : undefined} />
          </dl>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-[12px] text-muted-foreground">{a ? `${a.daysMarked} school days marked` : ''}</span>
        <Button asChild variant="ghost" size="sm" className="-mr-2">
          <Link to={portalPath('attendance', childId)}>
            See every day <ArrowRight />
          </Link>
        </Button>
      </div>
    </Card>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/60 px-1 py-2">
      <dd className={cn('font-display text-lg font-semibold tabular leading-none', tone)}>{value}</dd>
      <dt className="mt-1 truncate text-[11px] text-muted-foreground">{label}</dt>
    </div>
  );
}

// ------------------------------------------------------------------ results

function ResultCard({ d, childId, who, isParent }: { d: PortalOverview; childId: string; who: string; isParent: boolean }) {
  const r = d.latestResult;
  const pos = r ? positionText(r.position, r.classSize) : null;
  return (
    <Card className="flex flex-col p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold">
        <Trophy className="size-4 text-muted-foreground" aria-hidden /> Latest result
      </h2>
      {!r ? (
        <p className="mt-3 flex-1 text-[13px] text-muted-foreground">
          No results have been published yet. {isParent ? `You’ll see ${who}’s report card here` : 'Your report card will appear here'} as soon as the school publishes it.
        </p>
      ) : r.withheld ? (
        <div className="mt-3 flex flex-1 gap-3 rounded-xl border border-warning/30 bg-warning-soft/40 p-3">
          <Lock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0">
            <p className="text-[13.5px] font-medium">
              {r.term.name} · {r.term.sessionName}
            </p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{r.withheld}</p>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex-1">
          <p className="text-[13px] text-muted-foreground">
            {r.term.name} · {r.term.sessionName}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="min-w-0 rounded-xl bg-muted/60 px-3 py-2">
              <p className="text-[11.5px] text-muted-foreground">Average</p>
              <p className="font-display text-xl font-semibold tabular">{formatPct(r.average, 1)}</p>
            </div>
            <div className="min-w-0 rounded-xl bg-muted/60 px-3 py-2">
              <p className="text-[11.5px] text-muted-foreground">Position</p>
              <p className="truncate font-display text-xl font-semibold tabular">{pos ?? '—'}</p>
            </div>
          </div>
          {r.publishedAt && <p className="mt-2 text-[12px] text-muted-foreground">Published {formatDate(r.publishedAt)}</p>}
          {r.pinRequired && <p className="mt-1 text-[12px] text-muted-foreground">Enter a result checker PIN to open this report card.</p>}
        </div>
      )}
      <LatestOnlineTest childId={childId} />
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
        {r && !r.withheld && (
          <Button asChild size="sm">
            <Link to={`${portalPath('results', childId)}/${r.term.id}`}>{r.pinRequired ? 'Enter PIN' : 'View report card'}</Link>
          </Button>
        )}
        <Button asChild variant="ghost" size="sm" className="-mr-2">
          <Link to={portalPath('results', childId)}>
            All results <ArrowRight />
          </Link>
        </Button>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ tiles

function QuickTile({ to, icon: Icon, value, label, note, tone }: { to: string; icon: typeof Download; value: ReactNode; label: string; note: string; tone?: string }) {
  return (
    <Link
      to={to}
      className="group flex min-w-0 flex-col rounded-2xl border border-border bg-card p-3.5 shadow-soft transition-all hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      <span className={cn('mt-2 truncate font-display text-xl font-semibold tabular leading-tight', tone)}>{value}</span>
      <span className="truncate text-[12.5px] font-medium">{label}</span>
      <span className="truncate text-[11.5px] text-muted-foreground">{note}</span>
    </Link>
  );
}

function FeesTile({ owed, currency, to }: { owed: number; currency: string; to: string | null }) {
  const clear = owed <= 0;
  const body = (
    <>
      <Banknote className="size-4 text-muted-foreground" aria-hidden />
      <span className={cn('mt-2 truncate font-display text-xl font-semibold tabular leading-tight', !clear && 'text-danger')}>
        {clear ? 'All paid' : formatMoney(owed, currency, { maximumFractionDigits: 0 })}
      </span>
      <span className="truncate text-[12.5px] font-medium">School fees</span>
      {to ? (
        <span className={cn('mt-1 inline-flex items-center gap-1 text-[12.5px] font-medium', clear ? 'text-brand' : 'text-danger')}>
          {clear ? 'Payments and receipts' : 'Pay now'} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      ) : (
        <span className="text-[11.5px] text-muted-foreground">{clear ? 'Nothing outstanding' : 'Outstanding. Use the payment link the school sent you, or contact the bursar.'}</span>
      )}
    </>
  );
  const cls = 'col-span-2 flex min-w-0 flex-col rounded-2xl border border-border bg-card p-3.5 shadow-soft sm:col-span-1';
  if (!to) return <div className={cls}>{body}</div>;
  return (
    <Link
      to={to}
      aria-label={clear ? 'School fees: all paid. See payments and receipts' : `School fees: ${formatMoney(owed, currency, { maximumFractionDigits: 0 })} outstanding. Pay now`}
      className={cn(cls, 'group transition-all hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', !clear && 'border-danger/30')}
    >
      {body}
    </Link>
  );
}
