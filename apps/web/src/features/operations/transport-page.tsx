import type { RouteRow, TransportOverview, VehicleRow } from '@aischool/shared';
import { AlertTriangle, ArrowRight, Bus, CarFront, CheckCircle2, MapPin, Pencil, Phone, Plus, Receipt, Route as RouteIcon, Trash2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCan } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { StatTile } from '../attendance/ui';
import { StudentSheet } from '../students/student-sheet';
import { useDeleteVehicle, useTransportOverview, useVehicles } from './api';
import { RouteFormSheet, VehicleFormSheet } from './transport-dialogs';
import { CapacityBar, plural, telHref, VehicleStatusBadge } from './ui';

type Tab = 'routes' | 'vehicles';

export default function TransportPage() {
  const canManage = useCan('transport.manage');
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'vehicles' ? 'vehicles' : 'routes';
  const q = useTransportOverview();
  const [routeOpen, setRouteOpen] = useState(params.get('new') === '1' && canManage);
  const [student, setStudent] = useState<string | null>(null);
  const newFlag = params.get('new') === '1';
  useEffect(() => {
    if (newFlag && canManage) setRouteOpen(true);
  }, [newFlag, canManage]);

  const setTab = (t: string) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (t === 'routes') p.delete('tab');
        else p.set('tab', t);
        return p;
      },
      { replace: true },
    );

  return (
    <Page>
      <PageHeader
        title="Transport"
        description="Routes, buses and who rides them — checked against what’s been billed."
        actions={
          canManage && (
            <Button onClick={() => setRouteOpen(true)}>
              <Plus /> Add route
            </Button>
          )
        }
      />
      {q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <div className="space-y-5">
          <Kpis o={q.data} />
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList aria-label="Transport sections">
              <TabsTrigger value="routes">
                <RouteIcon /> Routes
              </TabsTrigger>
              <TabsTrigger value="vehicles">
                <CarFront /> Vehicles
              </TabsTrigger>
            </TabsList>
            <TabsContent value="routes" className="space-y-5">
              <ChecksCard o={q.data} onStudent={setStudent} />
              <RoutesGrid routes={q.data?.routeList} onAdd={() => setRouteOpen(true)} />
            </TabsContent>
            <TabsContent value="vehicles">
              <VehiclesTab />
            </TabsContent>
          </Tabs>
        </div>
      )}
      {canManage && (
        <RouteFormSheet
          open={routeOpen}
          onOpenChange={(o) => {
            setRouteOpen(o);
            if (!o && params.get('new')) {
              const p = new URLSearchParams(params);
              p.delete('new');
              setParams(p, { replace: true });
            }
          }}
          route={null}
        />
      )}
      <StudentSheet id={student} onClose={() => setStudent(null)} />
    </Page>
  );
}

function Kpis({ o }: { o: TransportOverview | undefined }) {
  const checks = o ? o.unbilledRiders.length + o.billedNotAssigned.length : 0;
  const over = o?.routeList.filter((r) => r.overCapacity > 0).length ?? 0;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
      <StatTile
        label="Riders"
        icon={<Users />}
        loading={!o}
        value={
          o ? (
            <>
              {o.riders.toLocaleString()}
              <span className="text-[16px] font-medium text-muted-foreground">/{o.seats.toLocaleString()} seats</span>
            </>
          ) : (
            '—'
          )
        }
        tone={o && o.riders > o.seats && o.seats > 0 ? 'danger' : undefined}
      >
        {o && <CapacityBar used={o.riders} total={o.seats} label="Seats taken across running routes" />}
      </StatTile>
      <StatTile label="Routes running" icon={<RouteIcon />} loading={!o} value={o?.routes ?? '—'} sub={over ? <span className="font-medium text-danger">{plural(over, 'route')} over capacity</span> : 'All within capacity'} />
      <StatTile label="Vehicles active" icon={<Bus />} loading={!o} value={o ? `${o.activeVehicles}/${o.vehicles}` : '—'} sub={o && o.vehicles > o.activeVehicles ? `${o.vehicles - o.activeVehicles} in maintenance or retired` : 'Fleet on the road'} />
      <StatTile
        label="Billing checks"
        icon={<Receipt />}
        loading={!o}
        value={checks}
        tone={checks ? 'warning' : 'success'}
        sub={checks ? 'Riders and bus fees that don’t match' : 'Riders and bus fees match'}
      />
    </div>
  );
}

function ChecksCard({ o, onStudent }: { o: TransportOverview | undefined; onStudent: (id: string) => void }) {
  const canFinance = useCan('finance.read');
  if (!o) return <Skeleton className="h-40 w-full rounded-2xl" />;
  const empty = !o.unbilledRiders.length && !o.billedNotAssigned.length;
  if (empty) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-success/30 bg-success-soft/40 px-4 py-3 text-[13px]">
        <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
        <span>Everyone on a bus is billed for transport this term, and everyone billed has a route.</span>
      </div>
    );
  }
  const list = (rows: { id: string; name: string; classArm: string | null; route?: string }[], emptyText: string) =>
    rows.length === 0 ? (
      <p className="rounded-xl border border-dashed border-border p-3 text-[12.5px] text-muted-foreground">{emptyText}</p>
    ) : (
      <ul className="scrollbar-thin max-h-64 space-y-0.5 overflow-y-auto">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onStudent(r.id)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{r.name}</span>
                <span className="text-muted-foreground">
                  {r.classArm && ` · ${r.classArm}`}
                  {r.route && ` · ${r.route}`}
                </span>
              </span>
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    );
  return (
    <Card className="border-warning/30">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-warning" aria-hidden /> Transport and fees don’t match
          </CardTitle>
          <CardDescription>Compared with this term’s invoices. Open a student to check their fees and route.</CardDescription>
        </div>
        {canFinance && (
          <Button asChild variant="ghost" size="sm">
            <Link to="/fees?tab=schedule">Fee schedule</Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-2 [&>*]:min-w-0">
        <div>
          <p className="mb-2 text-[12.5px] font-semibold">
            On a bus but not billed for transport <span className="font-normal text-muted-foreground">({o.unbilledRiders.length})</span>
          </p>
          {list(o.unbilledRiders, 'Every rider is billed.')}
        </div>
        <div>
          <p className="mb-2 text-[12.5px] font-semibold">
            Billed for the bus but not on a route <span className="font-normal text-muted-foreground">({o.billedNotAssigned.length})</span>
          </p>
          {list(o.billedNotAssigned, 'Everyone billed has a route.')}
        </div>
      </CardContent>
    </Card>
  );
}

function RoutesGrid({ routes, onAdd }: { routes: RouteRow[] | undefined; onAdd: () => void }) {
  const canManage = useCan('transport.manage');
  if (!routes) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-44 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (routes.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={RouteIcon}
          title="No routes yet"
          description="Add a route with its stops and times, then put students on it."
          action={
            canManage && (
              <Button onClick={onAdd}>
                <Plus /> Add the first route
              </Button>
            )
          }
        />
      </Card>
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
      {routes.map((r) => {
        const cap = r.vehicle?.capacity ?? 0;
        return (
          <li key={r.id}>
            <Card className={cn('relative h-full p-5 transition-shadow hover:shadow-lift', r.overCapacity > 0 && 'border-danger/40', !r.active && 'opacity-70')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link to={`/transport/routes/${r.id}`} className="font-display text-[15px] font-semibold tracking-tight after:absolute after:inset-0 after:rounded-2xl hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">
                    {r.name}
                  </Link>
                  <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
                    {r.vehicle ? `${r.vehicle.name} · ${r.vehicle.plateNumber}` : 'No vehicle assigned'}
                  </p>
                </div>
                {!r.active ? <Badge variant="outline">Paused</Badge> : r.vehicle && r.vehicle.status !== 'ACTIVE' ? <VehicleStatusBadge status={r.vehicle.status} /> : null}
              </div>
              <div className="mt-4">
                <div className="mb-1.5 flex items-baseline justify-between text-[12.5px]">
                  <span className={cn('font-medium tabular', r.overCapacity > 0 && 'text-danger')}>
                    {r.riders} rider{r.riders === 1 ? '' : 's'}
                    {cap > 0 && <span className="font-normal text-muted-foreground"> / {cap} seats</span>}
                  </span>
                  {r.overCapacity > 0 && <span className="font-medium text-danger">{r.overCapacity} over</span>}
                </div>
                <CapacityBar used={r.riders} total={cap} label={`${r.name}: ${r.riders} riders of ${cap} seats`} />
              </div>
              <p className="mt-3 flex items-center gap-1.5 truncate text-[12.5px] text-muted-foreground">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">
                  {plural(r.stops.length, 'stop')}
                  {r.stops[0] && ` · first pick-up ${r.stops[0].pickup} at ${r.stops[0].name}`}
                </span>
              </p>
              {r.vehicle?.driverPhone && (
                <a
                  href={telHref(r.vehicle.driverPhone)}
                  className="relative z-10 mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] font-medium text-brand hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Phone className="size-3.5" aria-hidden /> {r.vehicle.driverName ?? 'Driver'} · {r.vehicle.driverPhone}
                </a>
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------------ vehicles

function VehiclesTab() {
  const canManage = useCan('transport.manage');
  const q = useVehicles();
  const del = useDeleteVehicle();
  const [editing, setEditing] = useState<VehicleRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<VehicleRow | null>(null);

  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">{q.data ? plural(q.data.length, 'vehicle') : 'Loading…'}</p>
        {canManage && (
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus /> Add vehicle
          </Button>
        )}
      </div>
      {!q.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : q.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Bus}
            title="No vehicles yet"
            description="Add the school’s buses with their seats and driver."
            action={
              canManage && (
                <Button onClick={() => setEditing('new')}>
                  <Plus /> Add a vehicle
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
          {q.data.map((v) => {
            const riders = v.routes.reduce((n, r) => n + r.riders, 0);
            return (
              <li key={v.id}>
                <Card className={cn('flex h-full flex-col p-5', v.status === 'RETIRED' && 'opacity-70')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                        <Bus className="size-5" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-display text-[15px] font-semibold tracking-tight">{v.name}</p>
                        <p className="truncate font-mono text-[12px] text-muted-foreground">{v.plateNumber}</p>
                      </div>
                    </div>
                    <VehicleStatusBadge status={v.status} />
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-[12.5px] [&>*]:min-w-0">
                    <div>
                      <dt className="text-muted-foreground">Seats</dt>
                      <dd className="font-medium tabular">{v.capacity}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Riders</dt>
                      <dd className={cn('font-medium tabular', riders > v.capacity && 'text-danger')}>{riders}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">Driver</dt>
                      <dd className="truncate font-medium">
                        {v.driverName ?? '—'}
                        {v.driverPhone && (
                          <a href={telHref(v.driverPhone)} className="ml-1.5 font-normal text-brand hover:underline">
                            {v.driverPhone}
                          </a>
                        )}
                      </dd>
                    </div>
                    {v.assistantName && (
                      <div className="col-span-2">
                        <dt className="text-muted-foreground">Assistant</dt>
                        <dd className="truncate">{v.assistantName}</dd>
                      </div>
                    )}
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {v.routes.length === 0 ? (
                      <span className="text-[12px] text-muted-foreground">Not on a route</span>
                    ) : (
                      v.routes.map((r) => (
                        <Link key={r.id} to={`/transport/routes/${r.id}`} className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[12px] hover:border-border-strong">
                          {r.name} · {r.riders}
                        </Link>
                      ))
                    )}
                  </div>
                  {v.notes && <p className="mt-3 text-[12.5px] text-muted-foreground">{v.notes}</p>}
                  {canManage && (
                    <div className="mt-auto flex justify-end gap-1 pt-4">
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${v.name}`} onClick={() => setEditing(v)}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Remove ${v.name}`} onClick={() => setDeleting(v)}>
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {canManage && <VehicleFormSheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)} vehicle={editing === 'new' ? null : editing} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Remove ${deleting?.name ?? ''}?`}
        description={deleting?.routes.length ? `${deleting.routes.map((r) => r.name).join(', ')} will have no vehicle until you assign another.` : 'It isn’t on any route.'}
        confirmLabel="Remove vehicle"
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </div>
  );
}
