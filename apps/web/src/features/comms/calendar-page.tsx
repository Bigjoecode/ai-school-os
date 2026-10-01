import { EVENT_CATEGORY_LABELS, type EventRow } from '@aischool/shared';
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, List, MapPin, Plus, Rss } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';
import { useMediaQuery } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { addDaysIso, monthLabel, schoolToday, shiftMonth } from '../finance/ui';
import { Segmented } from '../operations/ui';
import { useEvents } from './api';
import { EventDetailSheet, EventFormSheet, SubscribeDialog } from './event-sheets';
import { categoryStyle, CATEGORY_COLOR, DateBlock, eventWhen } from './ui';

type View = 'month' | 'agenda';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Monday-start grid covering the whole month. */
function gridFor(month: string): { start: string; days: string[] } {
  const first = `${month}-01`;
  const dow = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDaysIso(first, -dow);
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const weeks = Math.ceil((dow + daysInMonth) / 7);
  return { start, days: Array.from({ length: weeks * 7 }, (_, i) => addDaysIso(start, i)) };
}

const onDay = (e: EventRow, day: string) => e.startDate <= day && (e.endDate ?? e.startDate) >= day;
const sortEvents = (a: EventRow, b: EventRow) => a.startDate.localeCompare(b.startDate) || Number(b.allDay) - Number(a.allDay) || (a.startTime ?? '').localeCompare(b.startTime ?? '');

export default function CalendarPage() {
  const canManage = useCan('events.manage');
  const [params, setParams] = useSearchParams();
  const today = schoolToday();
  const month = /^\d{4}-\d{2}$/.test(params.get('month') ?? '') ? params.get('month')! : today.slice(0, 7);
  const wide = useMediaQuery('(min-width: 768px)');
  const [pickedView, setPickedView] = useState<View>('month');
  const view: View = wide ? pickedView : 'agenda';

  const grid = useMemo(() => gridFor(month), [month]);
  const range = view === 'month' ? { from: grid.start, to: grid.days[grid.days.length - 1]! } : { from: `${month}-01`, to: addDaysIso(shiftMonth(month, 1) + '-01', -1) };
  const q = useEvents(range);
  const events = useMemo(() => [...(q.data ?? [])].sort(sortEvents), [q.data]);

  const [selected, setSelected] = useState<EventRow | null>(null);
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formDate, setFormDate] = useState<string | undefined>();
  const [subscribeOpen, setSubscribeOpen] = useState(false);

  // Deep link from the noticeboard / dashboard: ?event=<id>
  const eventParam = params.get('event');
  useEffect(() => {
    if (!eventParam || !q.data) return;
    const e = q.data.find((x) => x.id === eventParam);
    if (e) setSelected(e);
  }, [eventParam, q.data]);

  const setParam = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) p.set(k, v);
          else p.delete(k);
        }
        return p;
      },
      { replace: true },
    );
  // ⌘K "Add event" / "Subscribe" land here with a flag.
  const flag = params.get('new') === '1' ? 'new' : params.get('subscribe') === '1' ? 'subscribe' : null;
  useEffect(() => {
    if (!flag) return;
    if (flag === 'new' && canManage) openNew();
    if (flag === 'subscribe') setSubscribeOpen(true);
    setParam({ new: null, subscribe: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flag, canManage]);

  const go = (m: string) => setParam({ month: m === today.slice(0, 7) ? null : m, event: null });
  const openNew = (date?: string) => {
    setEditing(null);
    setFormDate(date);
    setFormOpen(true);
  };

  return (
    <Page>
      <PageHeader
        title="Calendar"
        description="Term dates, exams, holidays and school events."
        actions={
          <>
            <Button variant="outline" onClick={() => setSubscribeOpen(true)}>
              <Rss /> Subscribe
            </Button>
            {canManage && (
              <Button onClick={() => openNew()}>
                <Plus /> Add event
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => go(shiftMonth(month, -1))}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon" aria-label="Next month" onClick={() => go(shiftMonth(month, 1))}>
            <ChevronRight />
          </Button>
        </div>
        <h2 className="min-w-0 font-display text-[18px] font-semibold tracking-tight" aria-live="polite">
          {monthLabel(month, true)}
        </h2>
        {month !== today.slice(0, 7) && (
          <Button variant="ghost" size="sm" onClick={() => go(today.slice(0, 7))}>
            Today
          </Button>
        )}
        {wide && (
          <Segmented
            size="sm"
            label="View"
            className="ml-auto"
            value={pickedView}
            onChange={setPickedView}
            options={[
              { value: 'month', label: <><CalendarDays /> Month</> },
              { value: 'agenda', label: <><List /> Agenda</> },
            ]}
          />
        )}
      </div>

      {q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : view === 'month' ? (
        <MonthGrid month={month} days={grid.days} today={today} events={events} loading={q.isLoading} onOpen={setSelected} onAdd={canManage ? openNew : undefined} />
      ) : (
        <Agenda month={month} today={today} events={events} loading={q.isLoading} onOpen={setSelected} onAdd={canManage ? () => openNew() : undefined} />
      )}

      <Legend />

      <EventDetailSheet
        event={selected}
        onOpenChange={(o) => {
          if (!o) {
            setSelected(null);
            if (eventParam) setParam({ event: null });
          }
        }}
        onEdit={(e) => {
          setSelected(null);
          setEditing(e);
          setFormOpen(true);
        }}
      />
      {canManage && <EventFormSheet open={formOpen} onOpenChange={setFormOpen} event={editing} defaultDate={formDate} />}
      <SubscribeDialog open={subscribeOpen} onOpenChange={setSubscribeOpen} />
    </Page>
  );
}

function Pill({ e, onOpen, continued }: { e: EventRow; onOpen: (e: EventRow) => void; continued?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(e)}
      className="block w-full truncate rounded-md border px-1.5 py-0.5 text-left text-[11.5px] font-medium leading-4 transition-[filter] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:brightness-125"
      style={categoryStyle(e.category)}
      title={`${e.title} · ${eventWhen(e)}`}
    >
      {!continued && !e.allDay && e.startTime && <span className="mr-1 tabular opacity-80">{e.startTime}</span>}
      {continued && <span aria-hidden>↳ </span>}
      {e.title}
    </button>
  );
}

function MonthGrid({ month, days, today, events, loading, onOpen, onAdd }: { month: string; days: string[]; today: string; events: EventRow[]; loading: boolean; onOpen: (e: EventRow) => void; onAdd?: (date: string) => void }) {
  const MAX = 3;
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border bg-muted/40" aria-hidden>
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 [&>*]:min-w-0" role="grid" aria-label={`Events in ${monthLabel(month, true)}`} aria-busy={loading || undefined}>
        {days.map((day, i) => {
          const inMonth = day.startsWith(month);
          const list = events.filter((e) => onDay(e, day));
          const weekend = i % 7 >= 5;
          return (
            <div
              key={day}
              role="gridcell"
              aria-label={formatDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}
              className={cn(
                'group relative min-h-[112px] border-b border-r border-border p-1.5 [&:nth-child(7n)]:border-r-0',
                !inMonth && 'bg-muted/30',
                weekend && inMonth && 'bg-muted/10',
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={cn(
                    'grid size-6 place-items-center rounded-full text-[12px] tabular',
                    day === today ? 'bg-brand font-semibold text-brand-foreground' : inMonth ? 'text-foreground' : 'text-muted-foreground/60',
                  )}
                >
                  {Number(day.slice(8))}
                </span>
                {onAdd && (
                  <button
                    type="button"
                    onClick={() => onAdd(day)}
                    className="grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                    aria-label={`Add an event on ${formatDate(day, { day: 'numeric', month: 'long' })}`}
                  >
                    <Plus className="size-3.5" />
                  </button>
                )}
              </div>
              {loading ? (
                i % 5 === 2 && <Skeleton className="h-4 w-full" />
              ) : (
                <div className="space-y-0.5">
                  {list.slice(0, MAX).map((e) => (
                    <Pill key={e.id} e={e} onOpen={onOpen} continued={e.startDate < day && i % 7 !== 0} />
                  ))}
                  {list.length > MAX && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button type="button" className="w-full rounded-md px-1.5 text-left text-[11.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          +{list.length - MAX} more
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 space-y-1 p-2">
                        <p className="px-1 pb-1 text-[12px] font-semibold">{formatDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                        {list.map((e) => (
                          <Pill key={e.id} e={e} onOpen={onOpen} />
                        ))}
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Agenda({ month, today, events, loading, onOpen, onAdd }: { month: string; today: string; events: EventRow[]; loading: boolean; onOpen: (e: EventRow) => void; onAdd?: () => void }) {
  const first = `${month}-01`;
  const groups = useMemo(() => {
    const map = new Map<string, EventRow[]>();
    for (const e of events) {
      // Events that began last month are listed on the 1st.
      const key = e.startDate < first ? first : e.startDate;
      if (!key.startsWith(month)) continue;
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [events, month, first]);

  if (loading) {
    return (
      <Card className="space-y-4 p-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-12 w-11 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </Card>
    );
  }
  if (!groups.length) {
    return (
      <Card>
        <EmptyState
          icon={CalendarDays}
          title={`Nothing on in ${monthLabel(month, true)}`}
          description="Holidays, exams, PTA meetings and school events appear here."
          action={
            onAdd && (
              <Button size="sm" onClick={onAdd}>
                <CalendarPlus /> Add event
              </Button>
            )
          }
        />
      </Card>
    );
  }
  return (
    <Card className="divide-y divide-border">
      {groups.map(([day, list]) => (
        <section key={day} className={cn('flex gap-3 p-4 sm:gap-4', day < today && 'opacity-70')} aria-label={formatDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}>
          <div className="flex flex-col items-center gap-1">
            <DateBlock date={day} className={cn(day === today && 'border-brand bg-brand-soft')} />
            <span className="text-[10.5px] font-medium text-muted-foreground">{formatDate(day, { weekday: 'short', day: undefined, month: undefined, year: undefined })}</span>
          </div>
          <ul className="min-w-0 flex-1 space-y-2">
            {list.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onOpen(e)}
                  className="flex w-full items-start gap-3 rounded-xl border border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: CATEGORY_COLOR[e.category] }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[14px] font-medium">{e.title}</span>
                    <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                      {eventWhen(e)}
                      {e.location && (
                        <span className="inline-flex items-center gap-1">
                          {' · '}
                          <MapPin className="size-3" aria-hidden /> {e.location}
                        </span>
                      )}
                    </span>
                    {e.classes.length > 0 && <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{e.classes.join(', ')}</span>}
                  </span>
                  <span className="hidden shrink-0 rounded-full border px-2 text-[11px] font-medium leading-5 sm:inline" style={categoryStyle(e.category)}>
                    {EVENT_CATEGORY_LABELS[e.category]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Card>
  );
}

function Legend() {
  return (
    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Categories">
      {(Object.keys(EVENT_CATEGORY_LABELS) as (keyof typeof EVENT_CATEGORY_LABELS)[]).map((c) => (
        <li key={c} className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: CATEGORY_COLOR[c] }} aria-hidden /> {EVENT_CATEGORY_LABELS[c]}
        </li>
      ))}
    </ul>
  );
}
