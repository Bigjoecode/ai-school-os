import type { LiveBus, TripSummary } from '@aischool/shared';
import { Bus, ChevronDown, Clock, MapPinned, Radio, Square, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth-store';
import { todayIso } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useLiveBuses, useStopTrip, useTrips } from './api';
import { SlippyMap, type MapMarker } from './slippy-map';
import { ago, clock, directionWord, KIND_LABEL, useNow } from './ui';

/** Transport page, "Live" tab: every bus on a trip now, and the day's trips with their boarding logs. */
export function LiveBusesTab() {
  const live = useLiveBuses();
  const now = useNow(5_000);
  const buses = live.data ?? [];
  const markers: MapMarker[] = [
    ...buses.flatMap((b) => b.stops.flatMap((s, i) => (s.lat != null && s.lng != null ? [{ id: `${b.tripId}:${s.name}`, kind: 'stop' as const, label: `${b.route.name}: ${s.name}`, n: i + 1, lat: s.lat, lng: s.lng }] : []))),
    ...buses.flatMap((b) => (b.position ? [{ id: b.tripId, kind: 'bus' as const, label: b.route.name, lat: b.position.lat, lng: b.position.lng, heading: b.position.heading, accuracy: b.position.accuracy, stale: b.stale }] : [])),
  ];
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Radio className="size-4 text-success" aria-hidden /> Buses on a trip now
            </CardTitle>
            <CardDescription>Drivers share location from their phones only while a trip runs. Updates every few seconds.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {live.error && !live.data ? (
            <ErrorState error={live.error} onRetry={() => void live.refetch()} />
          ) : !live.data ? (
            <Skeleton className="h-72 rounded-xl" />
          ) : (
            <>
              <SlippyMap markers={markers} label="Map of buses on a trip" className="h-80 lg:h-[420px]" emptyText={buses.length ? 'No bus has sent its location yet' : 'No bus is on a trip right now'} />
              {buses.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">No bus is on a trip right now. Trips appear here as soon as a driver starts one on their phone.</p>
              ) : (
                <ul className="grid gap-3 md:grid-cols-2 [&>*]:min-w-0">
                  {buses.map((b) => (
                    <LiveRow key={b.tripId} b={b} now={now} />
                  ))}
                </ul>
              )}
            </>
          )}
        </CardContent>
      </Card>
      <TripsCard />
    </div>
  );
}

function LiveRow({ b, now }: { b: LiveBus; now: number }) {
  const canManage = useCan('transport.manage');
  const stop = useStopTrip();
  const [confirm, setConfirm] = useState(false);
  const silentMin = Math.floor((now - Date.parse(b.position?.at ?? b.startedAt)) / 60_000);
  const stale = b.stale || silentMin >= 2;
  return (
    <li className={cn('rounded-xl border p-3.5', stale ? 'border-warning/40 bg-warning-soft/30' : 'border-border')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-[14px] font-semibold">
            <Bus className={cn('size-4 shrink-0', stale ? 'text-warning' : 'text-brand')} aria-hidden /> {b.route.name}
          </p>
          <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
            {directionWord(b.direction)} · since {clock(b.startedAt)} · {b.driverName}
            {b.vehicle ? ` · ${b.vehicle}` : ''}
          </p>
        </div>
        {stale ? (
          <Badge variant="warning" dot>
            {b.position ? `No update for ${silentMin} min` : 'No location yet'}
          </Badge>
        ) : (
          <Badge variant="success" dot>
            Live
          </Badge>
        )}
      </div>
      <dl className="mt-2.5 grid grid-cols-4 gap-1.5 text-center text-[11px]">
        {(
          [
            ['Due', b.counts.due],
            ['Boarded', b.counts.boarded],
            ['Dropped', b.counts.dropped],
            ['Absent', b.counts.absent],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-lg bg-muted/60 py-1.5">
            <dd className="font-display text-[15px] font-semibold tabular">{v}</dd>
            <dt className="text-muted-foreground">{k}</dt>
          </div>
        ))}
      </dl>
      <div className="mt-2.5 flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3.5" aria-hidden /> Last seen {b.position ? ago(b.position.at, now) : 'never'}
        </span>
        {canManage && (
          <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>
            <Square /> End trip
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`End the trip on ${b.route.name}?`}
        description="Use this when the driver can’t (for example their phone died). Location sharing stops and parents stop seeing the bus."
        confirmLabel="End trip"
        destructive
        loading={stop.isPending}
        onConfirm={() => stop.mutate(b.tripId, { onSuccess: () => setConfirm(false) })}
      />
    </li>
  );
}

function TripsCard() {
  const [date, setDate] = useState(todayIso());
  const q = useTrips(date);
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-end justify-between gap-3">
        <div>
          <CardTitle>Trips and boarding log</CardTitle>
          <CardDescription>Who got on and off, where and when. The location trail is deleted after 30 days; these summaries are kept.</CardDescription>
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          Day
          <Input type="date" value={date} max={todayIso()} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-8 w-40 tabular [color-scheme:light] dark:[color-scheme:dark]" />
        </label>
      </CardHeader>
      <CardContent>
        {q.error && !q.data ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : !q.data ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : q.data.length === 0 ? (
          <EmptyState compact icon={MapPinned} title="No trips on this day" description="Trips appear here once a driver starts one." />
        ) : (
          <ul className="space-y-2">
            {q.data.map((t) => (
              <TripRow key={t.id} t={t} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TripRow({ t }: { t: TripSummary }) {
  const counts = { BOARDED: 0, DROPPED: 0, ABSENT: 0 };
  for (const l of t.log) counts[l.kind]++;
  return (
    <li>
      <details className="group rounded-xl border border-border">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-3.5 py-2.5 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium">
              {t.routeName}
              <span className="font-normal text-muted-foreground">{directionWord(t.direction)}</span>
              {t.status === 'ACTIVE' ? <Badge variant="success">Running</Badge> : t.endReason === 'AUTO' ? <Badge variant="warning">Ended automatically</Badge> : t.endReason === 'STAFF' ? <Badge variant="outline">Ended by the office</Badge> : null}
            </p>
            <p className="truncate text-[12px] text-muted-foreground">
              <UserRound className="mr-1 inline size-3" aria-hidden />
              {t.driverName} · {clock(t.startedAt)}–{t.endedAt ? clock(t.endedAt) : 'now'} · {t.distanceKm} km · {counts.BOARDED} boarded, {counts.DROPPED} dropped, {counts.ABSENT} absent
            </p>
          </div>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="border-t border-border px-3.5 py-2.5">
          {t.log.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">No one was marked on this trip.</p>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2 font-medium">Time</th>
                  <th className="py-1 pr-2 font-medium">Student</th>
                  <th className="py-1 pr-2 font-medium">Stop</th>
                  <th className="py-1 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {t.log.map((l, i) => (
                  <tr key={i} className="border-t border-border/60">
                    <td className="py-1 pr-2 tabular">{clock(l.at)}</td>
                    <td className="py-1 pr-2">{l.student}</td>
                    <td className="py-1 pr-2 text-muted-foreground">{l.stop}</td>
                    <td className="py-1">{KIND_LABEL[l.kind]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </details>
    </li>
  );
}
