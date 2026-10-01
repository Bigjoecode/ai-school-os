import type { RiderRow, RouteDetail, RouteNotice } from '@aischool/shared';
import { AlertTriangle, Bus, MapPin, Megaphone, MoreHorizontal, Pencil, Phone, Printer, RefreshCw, Route as RouteIcon, Sparkles, Trash2, UserMinus, UserPlus, Users } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Page } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { useCan, useMe } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { BackLink, DetailSkeleton } from '../planning/ui';
import { useDeleteRoute, useRemoveRider, useRoute, useRouteNotice } from './api';
import { AddRidersDialog, DIRECTION_LABEL, RouteFormSheet } from './transport-dialogs';
import { CapacityBar, CopyBlock, plural, telHref, VehicleStatusBadge } from './ui';

export default function RoutePage() {
  const { id = '' } = useParams();
  const q = useRoute(id);
  if (q.isLoading) {
    return (
      <Page className="max-w-6xl">
        <DetailSkeleton />
      </Page>
    );
  }
  if (!q.data) {
    const missing = q.error instanceof ApiError && q.error.status === 404;
    return (
      <Page className="max-w-6xl">
        <BackLink to="/transport">Transport</BackLink>
        {missing ? <EmptyState icon={RouteIcon} title="Route not found" description="It may have been removed." /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      </Page>
    );
  }
  return <RouteView r={q.data} />;
}

function RouteView({ r }: { r: RouteDetail }) {
  useDocumentTitle(r.name);
  const canManage = useCan('transport.manage');
  const navigate = useNavigate();
  const remove = useRemoveRider();
  const del = useDeleteRoute();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState<RiderRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const cap = r.vehicle?.capacity ?? 0;

  const byStop = useMemo(() => {
    const groups = r.stops.map((s) => ({ stop: s, riders: r.riderList.filter((x) => x.stop === s.name) }));
    const orphans = r.riderList.filter((x) => !r.stops.some((s) => s.name === x.stop));
    return orphans.length ? [...groups, { stop: { name: 'Other stops', pickup: '', dropoff: '', riders: orphans.length }, riders: orphans }] : groups;
  }, [r]);
  const unbilled = r.riderList.filter((x) => !x.billed).length;

  return (
    <Page className="max-w-6xl print:max-w-none print:p-0">
      <div className="print:hidden">
        <BackLink to="/transport">Transport</BackLink>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-[28px]">{r.name}</h1>
              {!r.active && <Badge variant="outline">Paused</Badge>}
              {r.vehicle && r.vehicle.status !== 'ACTIVE' && <VehicleStatusBadge status={r.vehicle.status} />}
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Bus className="size-4" aria-hidden /> {r.vehicle ? `${r.vehicle.name} · ${r.vehicle.plateNumber}` : 'No vehicle assigned'}
              </span>
              {r.vehicle?.driverPhone && (
                <a href={telHref(r.vehicle.driverPhone)} className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline">
                  <Phone className="size-3.5" aria-hidden /> {r.vehicle.driverName ?? 'Driver'} · {r.vehicle.driverPhone}
                </a>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => window.print()} disabled={r.riders === 0}>
              <Printer /> Print manifest
            </Button>
            {canManage && (
              <>
                <Button onClick={() => setAdding(true)} disabled={r.stops.length === 0}>
                  <UserPlus /> Add riders
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" aria-label="More route actions">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(true)}>
                      <Pencil /> Edit route and stops
                    </DropdownMenuItem>
                    <DropdownMenuItem destructive disabled={r.riders > 0} onSelect={() => setDeleting(true)}>
                      <Trash2 /> {r.riders > 0 ? 'Move riders off to remove' : 'Remove route'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3 [&>*]:min-w-0">
          <Card className="p-4">
            <p className="text-[12.5px] text-muted-foreground">Riders</p>
            <p className={cn('mt-1 font-display text-[24px] font-semibold tabular', r.overCapacity > 0 && 'text-danger')}>
              {r.riders}
              {cap > 0 && <span className="text-[14px] font-medium text-muted-foreground">/{cap} seats</span>}
            </p>
            <CapacityBar used={r.riders} total={cap} label="Seats taken" className="mt-2" />
          </Card>
          <Card className="p-4">
            <p className="text-[12.5px] text-muted-foreground">Stops</p>
            <p className="mt-1 font-display text-[24px] font-semibold tabular">{r.stops.length}</p>
            <p className="mt-1 truncate text-[12px] text-muted-foreground">{r.stops[0] ? `From ${r.stops[0].pickup} · back by ${r.stops.at(-1)?.dropoff}` : 'No stops yet'}</p>
          </Card>
          <Card className="p-4">
            <p className="text-[12.5px] text-muted-foreground">Billed for transport</p>
            <p className={cn('mt-1 font-display text-[24px] font-semibold tabular', unbilled > 0 && 'text-warning')}>
              {r.riders - unbilled}
              <span className="text-[14px] font-medium text-muted-foreground">/{r.riders}</span>
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">{unbilled ? `${plural(unbilled, 'rider')} not on this term’s invoices` : 'Everyone is billed this term'}</p>
          </Card>
        </div>

        {r.overCapacity > 0 && (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft/50 px-4 py-3 text-[13px] text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {r.overCapacity} more rider{r.overCapacity === 1 ? '' : 's'} than seats on {r.vehicle?.name}. Move some to another route or assign a bigger vehicle.
          </p>
        )}

        <div className="mt-5 grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
          <StopsCard r={r} />
          <Card className="lg:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Rider manifest</CardTitle>
                <CardDescription>Grouped by stop, with a parent to call</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {r.riders === 0 ? (
                <EmptyState
                  compact
                  icon={Users}
                  title="Nobody on this route yet"
                  description="Add the students who ride this bus."
                  action={
                    canManage &&
                    r.stops.length > 0 && (
                      <Button size="sm" onClick={() => setAdding(true)}>
                        <UserPlus /> Add riders
                      </Button>
                    )
                  }
                />
              ) : (
                <div className="space-y-5">
                  {byStop
                    .filter((g) => g.riders.length > 0)
                    .map((g) => (
                      <section key={g.stop.name} aria-label={g.stop.name}>
                        <p className="mb-1.5 flex items-center gap-2 text-[12.5px] font-semibold">
                          <MapPin className="size-3.5 text-muted-foreground" aria-hidden /> {g.stop.name}
                          {g.stop.pickup && (
                            <span className="font-normal text-muted-foreground tabular">
                              {g.stop.pickup} / {g.stop.dropoff}
                            </span>
                          )}
                          <span className="ml-auto font-normal text-muted-foreground">{g.riders.length}</span>
                        </p>
                        <ul className="divide-y divide-border rounded-xl border border-border">
                          {g.riders.map((x) => (
                            <li key={x.assignmentId} className="flex flex-col gap-2 px-3.5 py-2.5 sm:flex-row sm:items-center">
                              <div className="min-w-0 flex-1">
                                <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium">
                                  <span className="truncate">{x.student.name}</span>
                                  {x.billed ? (
                                    <Badge variant="success">Billed</Badge>
                                  ) : (
                                    <Badge variant="warning" dot>
                                      Not billed
                                    </Badge>
                                  )}
                                  {x.direction !== 'BOTH' && <Badge variant="outline">{DIRECTION_LABEL[x.direction]}</Badge>}
                                </p>
                                <p className="truncate text-[12px] text-muted-foreground">
                                  {x.student.classArm ?? 'No class'} · {x.student.admissionNumber}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 sm:justify-end">
                                {x.guardian ? (
                                  x.guardian.phone ? (
                                    <a
                                      href={telHref(x.guardian.phone)}
                                      className="inline-flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] font-medium text-brand hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      aria-label={`Call ${x.guardian.name} on ${x.guardian.phone}`}
                                    >
                                      <Phone className="size-3.5 shrink-0" aria-hidden />
                                      <span className="truncate">
                                        {x.guardian.name} · {x.guardian.phone}
                                      </span>
                                    </a>
                                  ) : (
                                    <span className="px-2 text-[12.5px] text-muted-foreground">{x.guardian.name} · no phone</span>
                                  )
                                ) : (
                                  <span className="px-2 text-[12.5px] text-warning">No parent on record</span>
                                )}
                                {canManage && (
                                  <Button variant="ghost" size="icon-sm" aria-label={`Take ${x.student.name} off this route`} onClick={() => setRemoving(x)}>
                                    <UserMinus />
                                  </Button>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <NoticeCard r={r} />
      </div>

      <PrintManifest r={r} groups={byStop} />

      {canManage && (
        <>
          <AddRidersDialog open={adding} onOpenChange={setAdding} route={r} />
          <RouteFormSheet open={editing} onOpenChange={setEditing} route={r} />
        </>
      )}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Take ${removing?.student.name ?? ''} off ${r.name}?`}
        description="Their transport fee isn’t changed — adjust their invoice in Fees if needed."
        confirmLabel="Take off route"
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.assignmentId, { onSuccess: () => setRemoving(null) })}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Remove ${r.name}?`}
        description="The route and its stops are deleted."
        confirmLabel="Remove route"
        loading={del.isPending}
        onConfirm={() => del.mutate(r.id, { onSuccess: () => navigate('/transport', { replace: true }) })}
      />
    </Page>
  );
}

function StopsCard({ r }: { r: RouteDetail }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Stops</CardTitle>
          <CardDescription>Morning pick-up / afternoon drop-off</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {r.stops.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-[13px] text-muted-foreground">No stops yet — edit the route to add them.</p>
        ) : (
          <ol className="relative">
            {r.stops.map((s, i) => (
              <li key={s.name} className="relative flex gap-3 pb-4 last:pb-0">
                {i < r.stops.length - 1 && <span aria-hidden className="absolute left-[11px] top-6 h-[calc(100%-12px)] w-px bg-border" />}
                <span className={cn('relative grid size-6 shrink-0 place-items-center rounded-full border-2 text-[10px] font-semibold tabular', s.riders ? 'border-brand bg-brand-soft text-brand' : 'border-border bg-card text-muted-foreground')}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">{s.name}</p>
                  <p className="text-[12px] text-muted-foreground tabular">
                    {s.pickup} · {s.dropoff}
                  </p>
                </div>
                <span className={cn('shrink-0 text-[12px] tabular', s.riders ? 'font-medium' : 'text-muted-foreground')}>{plural(s.riders, 'rider')}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ AI notice

function NoticeCard({ r }: { r: RouteDetail }) {
  const canAi = useCan('ai.use');
  const run = useRouteNotice(r.id);
  const [situation, setSituation] = useState('');
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<RouteNotice | null>(null);
  if (!canAi) return null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (situation.trim().length < 5) {
      setError('Say what has happened, e.g. “Bus delayed 30 minutes by traffic on the expressway”');
      return;
    }
    setError(undefined);
    run.mutate(situation.trim(), { onSuccess: setResult });
  };
  return (
    <Card className="ai-border relative mt-5 overflow-hidden border-transparent">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-ai-2/10 blur-3xl" />
      <div className="relative p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-ai-gradient shadow-[0_6px_20px_-6px_var(--ai-2)]">
            <AiSparkle className="size-5 [&_path]:fill-white" animated={run.isPending} />
          </div>
          <div className="min-w-0">
            <p className="font-display text-[15px] font-semibold tracking-tight">
              <span className="text-ai-gradient">Notice to parents</span>
            </p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">Drafts a calm message and an SMS version using this route’s stops and times. Nothing is sent.</p>
          </div>
        </div>
        <form onSubmit={submit} noValidate className="mt-5 grid gap-3">
          <Field label="What has happened?" htmlFor="rn-sit" error={error}>
            <Textarea id="rn-sit" rows={2} value={situation} onChange={(e) => setSituation(e.target.value)} maxLength={400} placeholder="e.g. The bus has a flat tyre at Ajah — afternoon drop-off will be about 40 minutes late" invalid={!!error} />
          </Field>
          <Button type="submit" variant={result ? 'outline' : 'ai'} loading={run.isPending} className="justify-self-start">
            {!run.isPending && (result ? <RefreshCw /> : <Sparkles />)} {result ? 'Draft again' : 'Draft notice'}
          </Button>
        </form>
        {run.isPending && !result && (
          <div className="mt-5 space-y-2.5" aria-live="polite" aria-busy>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        )}
        {result && (
          <div className={cn('mt-5 space-y-3 border-t border-border pt-5 transition-opacity', run.isPending && 'opacity-50')}>
            <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
              <Megaphone className="size-3.5" aria-hidden /> For {plural(result.recipients, 'parent phone number')} across {plural(result.riders, 'rider')}. Copy it into WhatsApp or your SMS tool.
            </p>
            <CopyBlock title="Message" text={result.message} />
            <CopyBlock title="SMS" text={result.smsVersion} hint={`${result.smsVersion.length} characters`} />
            <p className="text-[11.5px] text-muted-foreground">
              Generated by {result.provider} · {result.model}. Check the details before sending.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ print

function PrintManifest({ r, groups }: { r: RouteDetail; groups: { stop: { name: string; pickup: string; dropoff: string }; riders: RiderRow[] }[] }) {
  const me = useMe();
  return (
    <article className="hidden text-[11pt] text-black print:block" aria-hidden>
      <header className="mb-4 flex items-end justify-between border-b-2 border-black pb-2">
        <div>
          <p className="text-[10pt] font-semibold uppercase tracking-wider">{me?.tenant?.name}</p>
          <h1 className="font-display text-[18pt] font-bold">{r.name} · rider manifest</h1>
          <p className="text-[10pt]">
            {r.vehicle ? `${r.vehicle.name} (${r.vehicle.plateNumber})` : 'No vehicle'}
            {r.vehicle?.driverName && ` · Driver ${r.vehicle.driverName}`}
            {r.vehicle?.driverPhone && ` · ${r.vehicle.driverPhone}`}
          </p>
        </div>
        <p className="text-right text-[10pt]">
          {formatDate(new Date())}
          <br />
          {r.riders} riders{r.vehicle && ` · ${r.vehicle.capacity} seats`}
        </p>
      </header>
      {groups
        .filter((g) => g.riders.length)
        .map((g) => (
          <section key={g.stop.name} className="print-avoid-break mb-4">
            <h2 className="mb-1 text-[11pt] font-bold">
              {g.stop.name}
              {g.stop.pickup && (
                <span className="font-normal">
                  {' '}
                  — pick-up {g.stop.pickup}, drop-off {g.stop.dropoff}
                </span>
              )}
            </h2>
            <table className="w-full border-collapse text-[10pt]">
              <thead>
                <tr className="border-b border-black text-left">
                  <th className="w-8 py-1">✓</th>
                  <th className="py-1">Student</th>
                  <th className="py-1">Class</th>
                  <th className="py-1">Parent</th>
                  <th className="py-1">Phone</th>
                  <th className="py-1">Rides</th>
                </tr>
              </thead>
              <tbody>
                {g.riders.map((x) => (
                  <tr key={x.assignmentId} className="border-b border-gray-300">
                    <td className="py-1">
                      <span className="inline-block size-3.5 border border-black" />
                    </td>
                    <td className="py-1">{x.student.name}</td>
                    <td className="py-1">{x.student.classArm ?? '—'}</td>
                    <td className="py-1">{x.guardian?.name ?? '—'}</td>
                    <td className="py-1">{x.guardian?.phone ?? '—'}</td>
                    <td className="py-1">{x.direction === 'BOTH' ? 'Both' : x.direction === 'MORNING' ? 'AM' : 'PM'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
    </article>
  );
}
