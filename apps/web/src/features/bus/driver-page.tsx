import { TRIP_DIRECTIONS, type BoardingKind, type DriverHome, type TripDirection } from '@aischool/shared';
import { AlertTriangle, Bus, CheckCircle2, CircleSlash, CloudOff, LocateFixed, LocateOff, LogIn, LogOut, MapPin, MonitorSmartphone, Play, ShieldCheck, Square, Sun, Sunset } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Page } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { useBoard, useDriverHome, useDriverTrip, useEndTrip, useStartTrip } from './api';
import { ago, clock, directionWord, KindBadge, useNow } from './ui';
import { type GpsState, useLocationSharing } from './use-location-sharing';

/** The driver's or bus assistant's phone screen: start a trip, share location during it, tick students on and off. */
export default function DriverPage() {
  useDocumentTitle('Bus run');
  const home = useDriverHome();
  const [tripId, setTripId] = useState<string | null>(null);
  useEffect(() => {
    if (home.data?.activeTrip) setTripId(home.data.activeTrip.id);
  }, [home.data?.activeTrip]);

  return (
    <Page className="max-w-xl px-3 py-4 sm:px-6">
      <header className="mb-4">
        <p className="text-[13px] text-muted-foreground">{home.data?.me.name ?? ' '}</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Bus run</h1>
      </header>
      <PrivacyNote />
      {home.error && !home.data ? (
        <ErrorState error={home.error} onRetry={() => void home.refetch()} />
      ) : !home.data ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : tripId ? (
        <TripView tripId={tripId} onClosed={() => {
          setTripId(null);
          void home.refetch();
        }} />
      ) : (
        <StartTrip home={home.data} onStarted={setTripId} />
      )}
    </Page>
  );
}

function PrivacyNote() {
  return (
    <div className="mb-4 flex gap-3 rounded-2xl border border-border bg-card p-3.5 text-[13px] leading-relaxed">
      <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
      <p>
        <strong className="font-semibold">Your location is shared only while a trip is running.</strong> When you tap <em>End trip</em>, sharing stops. Parents see the bus only for their own child’s trip.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ start

function StartTrip({ home, onStarted }: { home: DriverHome; onStarted: (id: string) => void }) {
  const start = useStartTrip();
  const [routeId, setRouteId] = useState(home.routes.find((r) => !r.busyTrip)?.id ?? '');
  const [direction, setDirection] = useState<TripDirection>(new Date().getHours() < 12 ? 'MORNING' : 'AFTERNOON');
  if (!home.routes.length) {
    return (
      <Card>
        <EmptyState icon={Bus} title="You’re not linked to a bus yet" description="Ask the transport office to choose you as the driver or bus assistant on your bus. Your routes will then show here." />
      </Card>
    );
  }
  const route = home.routes.find((r) => r.id === routeId);
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold">Route</legend>
        <div className="grid gap-2" role="radiogroup" aria-label="Route">
          {home.routes.map((r) => {
            const on = r.id === routeId;
            return (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={!!r.busyTrip}
                onClick={() => setRouteId(r.id)}
                className={cn(
                  'flex min-h-14 items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                  on ? 'border-brand bg-brand-soft' : 'border-border bg-card hover:bg-muted/50',
                )}
              >
                <Bus className={cn('size-5 shrink-0', on ? 'text-brand' : 'text-muted-foreground')} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{r.name}</span>
                  <span className="block truncate text-[12.5px] text-muted-foreground">
                    {r.busyTrip ? `${r.busyTrip.driverName} is running it now` : `${r.vehicle ? `${r.vehicle.name} · ` : ''}${r.stops} stops`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold">Trip</legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Trip">
          {TRIP_DIRECTIONS.map((d) => {
            const on = d === direction;
            const Icon = d === 'MORNING' ? Sun : Sunset;
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setDirection(d)}
                className={cn(
                  'flex min-h-16 flex-col items-start justify-center gap-0.5 rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  on ? 'border-brand bg-brand-soft' : 'border-border bg-card hover:bg-muted/50',
                )}
              >
                <Icon className={cn('size-5', on ? 'text-brand' : 'text-muted-foreground')} aria-hidden />
                <span className="text-[14px] font-medium">{directionWord(d)}</span>
                {route && <span className="text-[12px] text-muted-foreground">{route.riders[d]} students</span>}
              </button>
            );
          })}
        </div>
      </fieldset>
      <Button
        size="lg"
        className="h-14 w-full text-[16px]"
        disabled={!route || !!route.busyTrip}
        loading={start.isPending}
        onClick={() => start.mutate({ routeId, direction }, { onSuccess: (t) => onStarted(t.id) })}
      >
        <Play /> Start trip and share location
      </Button>
      <p className="text-center text-[12.5px] text-muted-foreground">Your phone will ask to use your location. Choose “Allow”.</p>
    </div>
  );
}

// ------------------------------------------------------------------ during the trip

function TripView({ tripId, onClosed }: { tripId: string; onClosed: () => void }) {
  const q = useDriverTrip(tripId);
  const end = useEndTrip();
  const [ending, setEnding] = useState(false);
  const t = q.data;
  const running = t?.status === 'ACTIVE';
  const sharing = useLocationSharing(running ? tripId : null, () => {
    toast.info('This trip has ended. Location sharing has stopped.');
    void q.refetch();
  });
  const now = useNow(5_000);

  if (q.error && !t) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!t) return <Skeleton className="h-80 rounded-2xl" />;

  const all = t.stops.flatMap((s) => s.students);
  const done = all.filter((x) => x.status).length;
  const finish = () =>
    end.mutate(t.id, {
      onSuccess: () => {
        setEnding(false);
        toast.success('Trip ended. Your location is no longer shared.');
        onClosed();
      },
    });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-[17px] font-semibold">{t.routeName}</p>
            <p className="text-[13px] text-muted-foreground">
              {directionWord(t.direction)} · started {clock(t.startedAt)}
              {t.vehicle ? ` · ${t.vehicle}` : ''}
            </p>
          </div>
          <p className="shrink-0 text-right text-[13px] tabular">
            <span className="font-display text-xl font-semibold">{done}</span>
            <span className="text-muted-foreground">/{all.length}</span>
            <span className="block text-[11.5px] text-muted-foreground">marked</span>
          </p>
        </div>
        {running ? (
          <SharingStatus gps={sharing.gps} wake={sharing.wake} lastSentAt={sharing.lastSentAt} queued={sharing.queued} online={sharing.online} accuracy={sharing.lastFix?.coords.accuracy ?? null} now={now} />
        ) : (
          <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2 text-[13px]">This trip has ended{t.endedAt ? ` at ${clock(t.endedAt)}` : ''}. Location is not being shared.</p>
        )}
      </Card>

      {t.stops.map((s, i) => (
        <section key={s.name} aria-label={s.name}>
          <h2 className="mb-1.5 flex items-center gap-2 px-1 text-[13.5px] font-semibold">
            <span className="grid size-6 place-items-center rounded-full bg-muted text-[11px] tabular">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            <span className="text-[12px] font-normal text-muted-foreground tabular">{t.direction === 'MORNING' ? s.pickup : s.dropoff}</span>
          </h2>
          {s.students.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-3 py-2.5 text-[13px] text-muted-foreground">No students due at this stop.</p>
          ) : (
            <ul className="space-y-2">
              {s.students.map((k) => (
                <StudentRow key={k.id} tripId={t.id} id={k.id} name={k.name} status={k.status} disabled={!running} />
              ))}
            </ul>
          )}
        </section>
      ))}

      {running ? (
        <Button size="lg" variant="destructive" className="h-14 w-full text-[16px]" onClick={() => setEnding(true)}>
          <Square /> End trip
        </Button>
      ) : (
        <Button size="lg" variant="outline" className="h-12 w-full" onClick={onClosed}>
          Back to my routes
        </Button>
      )}
      <ConfirmDialog
        open={ending}
        onOpenChange={setEnding}
        title="End this trip?"
        description={`${all.length - done} student${all.length - done === 1 ? '' : 's'} not marked yet. Ending the trip stops sharing your location, and parents stop seeing the bus.`}
        confirmLabel="End trip"
        destructive
        loading={end.isPending}
        onConfirm={finish}
      />
    </div>
  );
}

function StudentRow({ tripId, id, name, status, disabled }: { tripId: string; id: string; name: string; status: BoardingKind | null; disabled: boolean }) {
  const board = useBoard(tripId);
  const tap = (kind: BoardingKind) => board.mutate({ studentId: id, kind });
  const btn = (kind: BoardingKind, label: string, Icon: typeof LogIn, tone: string) => (
    <Button
      type="button"
      variant="outline"
      className={cn('h-11 flex-1 px-2 text-[13px]', status === kind && tone)}
      aria-pressed={status === kind}
      disabled={disabled || board.isPending}
      onClick={() => tap(kind)}
    >
      <Icon /> {label}
    </Button>
  );
  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[15px] font-medium">{name}</span>
        <KindBadge kind={status} />
      </div>
      <div className="flex gap-2">
        {btn('BOARDED', 'Boarded', LogIn, 'border-brand bg-brand-soft text-brand')}
        {btn('DROPPED', 'Dropped off', LogOut, 'border-success bg-success-soft text-success')}
        {btn('ABSENT', 'Absent', CircleSlash, 'border-warning bg-warning-soft text-warning')}
      </div>
    </li>
  );
}

function SharingStatus({ gps, wake, lastSentAt, queued, online, accuracy, now }: { gps: GpsState; wake: string; lastSentAt: number | null; queued: number; online: boolean; accuracy: number | null; now: number }) {
  if (gps === 'denied') {
    return (
      <Problem title="Location permission is off">
        This phone isn’t allowing the app to use your location, so parents can’t see the bus. Open your browser’s site settings (the lock or ⓘ beside the address), set <strong>Location</strong> to <strong>Allow</strong>, then reload this page. You can still mark students on and off.
      </Problem>
    );
  }
  if (gps === 'unavailable') {
    return (
      <Problem title="GPS is off or has no signal">
        Turn on <strong>Location</strong> in your phone’s quick settings (swipe down from the top). Under a bridge or in a garage it comes back once you’re in the open.
      </Problem>
    );
  }
  if (gps === 'unsupported') {
    return <Problem title="This browser can’t share location">Open this page in Chrome or Safari on your phone.</Problem>;
  }
  const live = gps === 'sharing';
  return (
    <div className="mt-3 space-y-2">
      <p className={cn('flex items-center gap-2 rounded-xl px-3 py-2 text-[13.5px] font-medium', live ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground')} role="status">
        {live ? <LocateFixed className="size-4 shrink-0" aria-hidden /> : <LocateOff className="size-4 shrink-0" aria-hidden />}
        <span className="min-w-0 flex-1">{live ? 'Sharing location' : gps === 'asking' ? 'Asking for your location…' : 'Waiting for GPS…'}</span>
        <span className="shrink-0 text-[12px] font-normal tabular">{lastSentAt ? `sent ${ago(lastSentAt, now)}` : ''}</span>
      </p>
      <ul className="space-y-1 text-[12.5px] text-muted-foreground">
        {accuracy != null && live && (
          <li className="flex items-center gap-1.5">
            <MapPin className="size-3.5" aria-hidden /> Accurate to about {Math.round(accuracy)} m
          </li>
        )}
        {(!online || queued > 1) && (
          <li className="flex items-center gap-1.5 text-warning">
            <CloudOff className="size-3.5" aria-hidden /> {online ? `${queued} locations waiting to send` : `No network: ${queued} location${queued === 1 ? '' : 's'} saved, sent when you’re back online`}
          </li>
        )}
        <li className="flex items-center gap-1.5">
          <MonitorSmartphone className="size-3.5" aria-hidden />
          {wake === 'on' ? 'Screen will stay on. Keep this page open during the trip.' : 'Keep this page open and the screen on: sharing pauses if the screen locks or you switch apps.'}
        </li>
        {live && (
          <li className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5" aria-hidden /> Parents get a message when the bus is near their stop.
          </li>
        )}
      </ul>
    </div>
  );
}

function Problem({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="alert" className="mt-3 flex gap-2.5 rounded-xl border border-warning/40 bg-warning-soft/60 p-3 text-[13px]">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 leading-relaxed">{children}</p>
      </div>
    </div>
  );
}
