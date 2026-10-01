import { LIVE_PROVIDER_LABELS, type LiveClassRow, type LiveIntegrationStatus } from '@aischool/shared';
import { motion } from 'framer-motion';
import { CalendarClock, CalendarRange, ChevronLeft, ChevronRight, CircleCheck, Film, Plus, Radio, Users, Video } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Page, PageHeader } from '@/components/layout/page-header';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth-store';
import { useMediaQuery } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { armOptions, useStructure } from '../academics/api';
import { Segmented } from '../operations/ui';
import { useSearchFlag } from '../planning/ui';
import { useLiveClasses, useLiveOverview } from './api';
import { FromTimetableDialog, ScheduleSheet, SettingsLink } from './schedule-dialogs';
import {
  addDays,
  attendancePct,
  dayLabel,
  JoinButton,
  LiveStatusBadge,
  mondayOf,
  OpensHint,
  ProviderIcon,
  relativeDay,
  schoolDate,
  schoolToday,
  SectionTitle,
  SummaryBadge,
  timeRange,
  TranscriptBadge,
  useSchoolTz,
} from './ui';

export default function LivePage() {
  const canHost = useCan('live.host');
  const canManage = useCan('live.manage');
  const mayHost = canHost || canManage;
  const [scheduling, setScheduling] = useSearchFlag('new');
  const [fromTimetable, setFromTimetable] = useSearchFlag('timetable');
  const overview = useLiveOverview();

  return (
    <Page>
      <PageHeader
        title="Live classes"
        description="Teach online on Google Meet, Zoom or BigBlueButton — attendance, recordings and an AI summary of every class."
        actions={
          <>
            <SettingsLink />
            {mayHost && (
              <>
                <Button variant="outline" onClick={() => setFromTimetable(true)}>
                  <CalendarRange /> From timetable
                </Button>
                <Button onClick={() => setScheduling(true)}>
                  <Plus /> Schedule class
                </Button>
              </>
            )}
          </>
        }
      />
      {overview.error && !overview.data ? (
        <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
      ) : (
        <div className="space-y-6">
          <IntegrationChips list={overview.data?.integrations} canManage={canManage} />
          <Kpis data={overview.data?.thisWeek} />
          <div className="grid gap-6 xl:grid-cols-5 [&>*]:min-w-0">
            <section className="xl:col-span-3" aria-labelledby="upcoming-h">
              <Upcoming rows={overview.data?.upcoming} today={overview.data?.today} mayHost={mayHost} onSchedule={() => setScheduling(true)} />
            </section>
            <section className="xl:col-span-2" aria-labelledby="recent-h">
              <Recent rows={overview.data?.recent} />
            </section>
          </div>
          <WeekView />
        </div>
      )}
      <ScheduleSheet open={scheduling} onOpenChange={setScheduling} />
      <FromTimetableDialog open={fromTimetable} onOpenChange={setFromTimetable} />
    </Page>
  );
}

// ------------------------------------------------------------------ integrations

function IntegrationChips({ list, canManage }: { list?: LiveIntegrationStatus[]; canManage: boolean }) {
  if (!list) return <Skeleton className="h-8 w-80 max-w-full rounded-full" />;
  const services = list.filter((i) => i.provider !== 'EXTERNAL');
  return (
    <div className="flex flex-wrap items-center gap-2">
      {services.map((i) => {
        const chip = (
          <span
            className={cn(
              'inline-flex h-8 items-center gap-2 rounded-full border pl-1 pr-3 text-[12.5px] font-medium transition-colors',
              i.connected ? 'border-border bg-card' : 'border-dashed border-border bg-transparent text-muted-foreground',
              !i.connected && canManage && 'hover:border-border-strong hover:text-foreground',
            )}
          >
            <ProviderIcon provider={i.provider} size="sm" className="rounded-full" />
            {LIVE_PROVIDER_LABELS[i.provider]}
            {i.connected ? <span className="size-1.5 rounded-full bg-success" role="img" aria-label="connected" /> : <span className="text-[11.5px]">{canManage ? 'Set up' : 'Not set up'}</span>}
          </span>
        );
        return canManage ? (
          <Link key={i.provider} to="/live/settings" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {chip}
          </Link>
        ) : (
          <span key={i.provider}>{chip}</span>
        );
      })}
      <span className="inline-flex h-8 items-center gap-2 rounded-full border border-border bg-card pl-1 pr-3 text-[12.5px] font-medium">
        <ProviderIcon provider="EXTERNAL" size="sm" className="rounded-full" /> Meeting links
        <span className="size-1.5 rounded-full bg-success" role="img" aria-label="always available" />
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ KPIs

function Kpis({ data }: { data?: { scheduled: number; held: number; averageAttendance: number | null; summariesReady: number } }) {
  const items = [
    { label: 'Coming up', note: 'next 7 days', value: data?.scheduled, icon: CalendarClock },
    { label: 'Held', note: 'last 7 days', value: data?.held, icon: CircleCheck },
    { label: 'Average attendance', note: 'present or late', value: data?.averageAttendance, icon: Users, pct: true },
    { label: 'AI summaries', note: 'of classes held', value: data?.summariesReady, icon: null },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
      {items.map((k) => (
        <Card key={k.label} className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[12.5px] font-medium text-muted-foreground">{k.label}</p>
            {k.icon ? <k.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : <AiSparkle className="size-4" animated={false} />}
          </div>
          {data === undefined ? (
            <Skeleton className="mt-3 h-8 w-16" />
          ) : (
            <p className="mt-2 font-display text-[28px] font-semibold leading-none tracking-[-0.03em] tabular">
              {k.value == null ? '—' : <AnimatedNumber value={k.value} format={(n) => (k.pct ? `${n.toFixed(0)}%` : Math.round(n).toLocaleString())} />}
            </p>
          )}
          <p className="mt-1.5 truncate text-[11.5px] text-muted-foreground">{k.note}</p>
        </Card>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ upcoming

function Upcoming({ rows, today, mayHost, onSchedule }: { rows?: LiveClassRow[]; today?: string; mayHost: boolean; onSchedule: () => void }) {
  const tz = useSchoolTz();
  const groups = useMemo(() => {
    if (!rows || !today) return [];
    const out: { key: string; label: string; rows: LiveClassRow[] }[] = [];
    const live = rows.filter((r) => r.status === 'LIVE');
    if (live.length) out.push({ key: 'live', label: 'Happening now', rows: live });
    for (const r of rows.filter((x) => x.status !== 'LIVE')) {
      const d = schoolDate(r.startsAt, tz);
      const g = out.find((x) => x.key === d);
      if (g) g.rows.push(r);
      else out.push({ key: d, label: relativeDay(d, today), rows: [r] });
    }
    return out;
  }, [rows, today, tz]);

  return (
    <>
      <SectionTitle>
        <span id="upcoming-h">Today &amp; upcoming</span>
      </SectionTitle>
      <Card className="overflow-hidden">
        {!rows ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Video}
            title="No live classes in the next week"
            description={mayHost ? 'Schedule one, or create a whole fortnight of sessions from the timetable in one go.' : 'When teachers schedule live classes, they appear here.'}
            action={
              mayHost && (
                <Button onClick={onSchedule}>
                  <Plus /> Schedule class
                </Button>
              )
            }
          />
        ) : (
          <div className="divide-y divide-border">
            {groups.map((g) => (
              <div key={g.key}>
                <p className={cn('flex items-center gap-2 bg-muted/30 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider', g.key === 'live' ? 'text-danger' : 'text-muted-foreground')}>
                  {g.key === 'live' && <Radio className="size-3.5" aria-hidden />}
                  {g.label}
                </p>
                <ul className="divide-y divide-border">
                  {g.rows.map((r) => (
                    <li key={r.id}>
                      <UpcomingRow row={r} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function UpcomingRow({ row }: { row: LiveClassRow }) {
  const tz = useSchoolTz();
  const live = row.status === 'LIVE';
  return (
    <div className={cn('relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30', live && 'bg-danger-soft/30')}>
      <ProviderIcon provider={row.provider} />
      <div className="min-w-0 flex-1">
        <Link to={`/live/${row.id}`} className="block truncate text-[13.5px] font-medium after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring">
          {row.title}
        </Link>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted-foreground">
          <span className="tabular font-medium text-foreground/80">{timeRange(row, tz)}</span>
          <span aria-hidden>·</span>
          <span>{row.classArm.name}</span>
          {row.subject && row.subject.name !== row.title && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{row.subject.name}</span>
            </>
          )}
          {row.teacher && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{row.teacher.name}</span>
            </>
          )}
        </p>
      </div>
      <div className="relative z-10 flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
        {live ? <JoinButton liveClass={row} /> : <OpensHint startsAt={row.startsAt} className="hidden sm:inline-flex" />}
        <LiveStatusBadge status={row.status} className={cn(live && 'hidden sm:inline-flex')} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ recent

function Recent({ rows }: { rows?: LiveClassRow[] }) {
  const tz = useSchoolTz();
  return (
    <>
      <SectionTitle>
        <span id="recent-h">Recent classes</span>
      </SectionTitle>
      <Card className="overflow-hidden">
        {!rows ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState compact icon={Film} title="Nothing from the last week" description="Classes you’ve held show here with attendance, recordings and their AI summary." />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const pct = attendancePct(r.attendance);
              return (
                <li key={r.id} className="relative px-4 py-3 transition-colors hover:bg-muted/30">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/live/${r.id}`}
                        className="block truncate text-[13.5px] font-medium after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                      >
                        {r.title}
                      </Link>
                      <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                        {dayLabel(schoolDate(r.startsAt, tz))} · {r.classArm.name}
                        {r.teacher && ` · ${r.teacher.name}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={cn('font-display text-[17px] font-semibold leading-none tabular', pct == null ? 'text-muted-foreground' : pct >= 85 ? 'text-success' : pct >= 65 ? 'text-warning' : 'text-danger')}>
                        {pct == null ? '—' : `${pct}%`}
                      </p>
                      <p className="mt-0.5 text-[10.5px] text-muted-foreground">attended</p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <SummaryBadge state={r.intelligence} />
                    {r.hasTranscript && <TranscriptBadge />}
                    {r.recordings > 0 && (
                      <Badge variant="outline" className="gap-1">
                        <Film /> {r.recordings} {r.recordings === 1 ? 'recording' : 'recordings'}
                      </Badge>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ week

function WeekView() {
  const tz = useSchoolTz();
  const canManage = useCan('live.manage');
  const canHost = useCan('live.host');
  const desktop = useMediaQuery('(min-width: 1024px)');
  const today = schoolToday(tz);
  const [monday, setMonday] = useState(() => mondayOf(today));
  const [classArmId, setClassArmId] = useState('');
  const [mine, setMine] = useState<'all' | 'mine'>(canManage || !canHost ? 'all' : 'mine');
  const structure = useStructure();
  const arms = armOptions(structure.data);
  const sunday = addDays(monday, 6);
  const q = useLiveClasses({ from: monday, to: sunday, classArmId: classArmId || undefined, mine: mine === 'mine' });

  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const byDay = new Map<string, LiveClassRow[]>();
  for (const r of q.data ?? []) {
    const d = schoolDate(r.startsAt, tz);
    byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }
  // Weekends only take a column when something is on.
  const shown = days.filter((d, i) => i < 5 || (byDay.get(d)?.length ?? 0) > 0);
  const thisWeek = monday === mondayOf(today);
  const label = `${dayLabel(monday, { day: 'numeric', month: 'short' })} – ${dayLabel(sunday, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <section aria-labelledby="week-h">
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <h2 id="week-h" className="font-display text-[15px] font-semibold tracking-tight">
            Week
          </h2>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={() => setMonday(addDays(monday, -7))} aria-label="Previous week">
              <ChevronLeft />
            </Button>
            <span className="min-w-0 text-[13px] font-medium tabular" aria-live="polite">
              {label}
            </span>
            <Button variant="ghost" size="icon-sm" onClick={() => setMonday(addDays(monday, 7))} aria-label="Next week">
              <ChevronRight />
            </Button>
            {!thisWeek && (
              <Button variant="outline" size="sm" className="ml-1 h-7" onClick={() => setMonday(mondayOf(today))}>
                This week
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {arms.length > 0 && (
            <Select value={classArmId || NONE} onValueChange={(v) => setClassArmId(v === NONE ? '' : v)}>
              <SelectTrigger className="h-9 w-44" aria-label="Filter by class">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>All classes</SelectItem>
                {arms.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {(canHost || canManage) && (
            <Segmented
              size="sm"
              label="Whose classes"
              value={mine}
              onChange={setMine}
              options={[
                { value: 'all', label: 'All' },
                { value: 'mine', label: 'Mine' },
              ]}
            />
          )}
        </div>
      </div>

      {q.error && !q.data ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : desktop ? (
        <div className={cn('grid gap-2 [&>*]:min-w-0', shown.length === 7 ? 'grid-cols-7' : shown.length === 6 ? 'grid-cols-6' : 'grid-cols-5')}>
          {shown.map((d) => {
            const list = byDay.get(d) ?? [];
            const isToday = d === today;
            return (
              <div key={d} className={cn('flex min-h-40 flex-col rounded-2xl border bg-card p-2', isToday ? 'border-brand/40 shadow-soft' : 'border-border')}>
                <p className={cn('px-1.5 pb-2 pt-1 text-[12px] font-semibold', isToday ? 'text-brand' : 'text-muted-foreground')}>
                  {dayLabel(d, { weekday: 'short', day: 'numeric' })}
                  {isToday && <span className="ml-1.5 font-normal">· Today</span>}
                </p>
                {!q.data ? (
                  <Skeleton className="h-14 w-full rounded-xl" />
                ) : list.length === 0 ? (
                  <p className="px-1.5 text-[11.5px] text-muted-foreground/70">—</p>
                ) : (
                  <ul className="space-y-1.5">
                    {list.map((r) => (
                      <li key={r.id}>
                        <WeekChip row={r} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <Card className="overflow-hidden">
          {!q.data ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          ) : q.data.length === 0 ? (
            <EmptyState compact icon={CalendarClock} title="No live classes this week" description={mine === 'mine' ? 'Switch to “All” to see other teachers’ classes.' : undefined} />
          ) : (
            <div className="divide-y divide-border">
              {days
                .filter((d) => byDay.has(d))
                .map((d) => (
                  <div key={d}>
                    <p className={cn('bg-muted/30 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider', d === today ? 'text-brand' : 'text-muted-foreground')}>{relativeDay(d, today)}</p>
                    <ul className="divide-y divide-border">
                      {byDay.get(d)!.map((r) => (
                        <li key={r.id}>
                          <UpcomingRow row={r} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          )}
        </Card>
      )}
    </section>
  );
}

function WeekChip({ row }: { row: LiveClassRow }) {
  const tz = useSchoolTz();
  const cancelled = row.status === 'CANCELLED';
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="relative">
      <Link
        to={`/live/${row.id}`}
        className={cn(
          'block rounded-xl border px-2 py-1.5 text-left transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          row.status === 'LIVE' ? 'border-danger/40 bg-danger-soft/40' : 'border-border bg-muted/30',
          cancelled && 'opacity-55',
        )}
      >
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground tabular">
          <ProviderIcon provider={row.provider} size="sm" className="size-4 rounded [&_svg]:size-2.5" />
          {timeRange(row, tz)}
        </span>
        <span className={cn('mt-0.5 block truncate text-[12.5px] font-medium', cancelled && 'line-through')}>{row.title}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{row.classArm.name}</span>
        {row.status === 'LIVE' && (
          <span className="mt-1 inline-flex">
            <LiveStatusBadge status="LIVE" />
          </span>
        )}
        {row.status === 'ENDED' && row.intelligence === 'READY' && (
          <span className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
            <AiSparkle className="size-3" animated={false} /> Summary
          </span>
        )}
      </Link>
    </motion.div>
  );
}
