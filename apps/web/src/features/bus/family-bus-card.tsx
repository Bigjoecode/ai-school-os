import { BUS_LIMITS, type FamilyBusLive } from '@aischool/shared';
import { AlertTriangle, Bus, Clock, MapPin, Timer } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useFamilyBus } from './api';
import { SlippyMap, type MapMarker } from './slippy-map';
import { ago, clock, directionWord, KindBadge, useNow } from './ui';

/**
 * The parent's "School bus" card on a child's page: shown only for a child on
 * a bus route. The bus appears only while a trip carrying this child is
 * running; nothing about other children or past trips is shown.
 */
export function FamilyBusCard({ childId, firstName }: { childId: string; firstName: string }) {
  const q = useFamilyBus(childId);
  const now = useNow(5_000);
  const d = q.data;
  if (q.error || (d && !d.rides)) return null;
  return (
    <Card className="p-4 sm:p-5" aria-labelledby="bus-title">
      <div className="flex items-start justify-between gap-3">
        <h2 id="bus-title" className="flex items-center gap-2 font-display text-[15px] font-semibold">
          <Bus className="size-4 text-muted-foreground" aria-hidden /> School bus
        </h2>
        {d?.live && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2 py-0.5 text-[11.5px] font-medium text-success">
            <span className="size-1.5 animate-pulse rounded-full bg-success" aria-hidden /> Live
          </span>
        )}
      </div>
      {!d ? (
        <Skeleton className="mt-3 h-20 rounded-xl" />
      ) : (
        <>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {d.route!.name} · {firstName}’s stop: <span className="font-medium text-foreground">{d.route!.stop}</span>
            {d.route!.vehicle ? ` · ${d.route!.vehicle}${d.route!.plateNumber ? ` (${d.route!.plateNumber})` : ''}` : ''}
          </p>
          {d.live ? (
            <LiveView live={d.live} firstName={firstName} now={now} />
          ) : (
            <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2.5 text-[13px] text-muted-foreground">
              No trip is running right now. When the bus starts {firstName}’s trip you’ll get a message, and you can follow it here until the trip ends.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function LiveView({ live, firstName, now }: { live: FamilyBusLive; firstName: string; now: number }) {
  const pos = live.position;
  const stale = pos ? now - Date.parse(pos.at) > BUS_LIMITS.staleAfterMs : false;
  const markers: MapMarker[] = [];
  if (live.stop.lat != null && live.stop.lng != null) markers.push({ id: 'stop', kind: 'stop-mine', label: live.stop.name, lat: live.stop.lat, lng: live.stop.lng });
  if (pos) markers.push({ id: 'bus', kind: 'bus', label: 'Bus', lat: pos.lat, lng: pos.lng, heading: pos.heading, accuracy: pos.accuracy, stale });
  const eta = live.etaMinutes;
  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-3 gap-2 [&>*]:min-w-0">
        <Tile icon={Timer} label="Arrives in" value={eta == null ? '—' : eta === 0 ? 'Now' : `~${eta} min`} note={eta == null ? live.etaNote ?? '' : 'Approximate'} />
        <Tile icon={Clock} label="Last update" value={pos ? ago(pos.at, now).replace(' ago', '') : '—'} note={pos ? clock(pos.at) : 'Not yet'} tone={stale ? 'text-warning' : undefined} />
        <Tile icon={MapPin} label="Distance" value={live.distanceM == null ? '—' : live.distanceM < 1000 ? `${Math.round(live.distanceM / 10) * 10} m` : `${(live.distanceM / 1000).toFixed(1)} km`} note="In a straight line" />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
        <span>{directionWord(live.direction)} · started {clock(live.startedAt)}</span>
        <span className="inline-flex items-center gap-1.5">
          {firstName}: <KindBadge kind={live.childStatus} />
        </span>
      </div>
      {stale && (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft/50 px-3 py-2 text-[12.5px]">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          No update from the bus for {Math.floor((now - Date.parse(pos!.at)) / 60_000)} min. The driver’s phone may have lost signal; the map shows the last known position.
        </p>
      )}
      <SlippyMap markers={markers} label={`Map of ${firstName}’s bus and stop`} className={cn('h-64 sm:h-72')} emptyText="Waiting for the bus’s first location" />
      <p className="text-[11.5px] text-muted-foreground">Times are estimates from distance and recent speed, and traffic can change them. Location is shared only during the trip.</p>
    </div>
  );
}

function Tile({ icon: Icon, label, value, note, tone }: { icon: typeof Bus; label: string; value: string; note: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-muted/60 px-2.5 py-2">
      <p className="flex items-center gap-1 truncate text-[11px] font-medium text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-hidden /> {label}
      </p>
      <p className={cn('mt-0.5 truncate font-display text-[17px] font-semibold tabular leading-tight', tone)}>{value}</p>
      <p className="truncate text-[11px] text-muted-foreground" title={note}>
        {note}
      </p>
    </div>
  );
}
