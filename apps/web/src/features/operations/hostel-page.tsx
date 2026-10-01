import type { ExeatRow, HostelOverview, HostelRoomRow, HostelRow } from '@aischool/shared';
import { AlertTriangle, ArrowRightLeft, BedDouble, Building, DoorOpen, History, Luggage, LogIn, MoreHorizontal, Pencil, Phone, Plus, Trash2, UserMinus, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCan } from '@/lib/auth-store';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { StatTile } from '../attendance/ui';
import { schoolDateTime } from '../finance/ui';
import { useDeleteHostel, useDeleteRoom, useEndAllocation, useExeatReturn, useExeats, useHostelOverview } from './api';
import { type AllocatePrefill, AllocateDialog, ExeatDialog, GENDER_LABEL, HostelDialog, RoomDialog } from './hostel-dialogs';
import { CapacityBar, plural, Segmented, telHref } from './ui';

type Tab = 'houses' | 'exeats';

export default function HostelPage() {
  const canManage = useCan('hostel.manage');
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'exeats' ? 'exeats' : 'houses';
  const q = useHostelOverview();
  const [allocate, setAllocate] = useState<AllocatePrefill | null>(null);
  const [exeatOpen, setExeatOpen] = useState(params.get('exeat') === '1' && canManage);
  const [hostelEdit, setHostelEdit] = useState<HostelRow | 'new' | null>(null);
  const exeatFlag = params.get('exeat') === '1';
  useEffect(() => {
    if (exeatFlag && canManage) setExeatOpen(true);
  }, [exeatFlag, canManage]);

  const patch = (next: Record<string, string | undefined>) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(next)) {
          if (v) p.set(k, v);
          else p.delete(k);
        }
        return p;
      },
      { replace: true },
    );

  const o = q.data;
  return (
    <Page>
      <PageHeader
        title="Hostel"
        description="Houses, rooms and beds, and who’s away on exeat."
        actions={
          canManage && (
            <>
              <Button variant="outline" onClick={() => setExeatOpen(true)}>
                <Luggage /> Sign out on exeat
              </Button>
              <Button onClick={() => setAllocate({})} disabled={!o?.hostels.length}>
                <BedDouble /> Allocate bed
              </Button>
            </>
          )
        }
      />
      {q.error && !o ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3 [&>*]:min-w-0">
            <StatTile
              label="Boarders"
              icon={<Users />}
              loading={!o}
              value={
                o ? (
                  <>
                    {o.boarders}
                    <span className="text-[16px] font-medium text-muted-foreground">/{o.beds} beds</span>
                  </>
                ) : (
                  '—'
                )
              }
            >
              {o && <CapacityBar used={o.boarders} total={o.beds} label="Beds taken" />}
            </StatTile>
            <button type="button" onClick={() => patch({ tab: 'exeats' })} className="rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <StatTile label="Away on exeat" icon={<Luggage />} loading={!o} value={o?.away.length ?? '—'} sub={o?.away.length ? 'See who’s out →' : 'Everyone is in residence'} />
            </button>
            <button type="button" onClick={() => patch({ tab: 'exeats' })} className="rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <StatTile
                label="Overdue back"
                icon={<AlertTriangle />}
                loading={!o}
                value={o?.overdue.length ?? '—'}
                tone={o && o.overdue.length > 0 ? 'danger' : undefined}
                sub={o?.overdue.length ? <span className="font-medium text-danger">Call their parents →</span> : 'Nobody late back'}
              />
            </button>
          </div>

          <Tabs value={tab} onValueChange={(t) => patch({ tab: t === 'houses' ? undefined : t })}>
            <TabsList aria-label="Hostel sections">
              <TabsTrigger value="houses">
                <Building /> Houses
              </TabsTrigger>
              <TabsTrigger value="exeats">
                <Luggage /> Exeats
                {!!o?.overdue.length && <span className="rounded-full bg-danger-soft px-1.5 text-[10.5px] font-semibold text-danger tabular">{o.overdue.length}</span>}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="houses">
              <Houses o={o} onAllocate={setAllocate} onEditHostel={setHostelEdit} />
            </TabsContent>
            <TabsContent value="exeats">
              <ExeatsTab o={o} onSignOut={() => setExeatOpen(true)} />
            </TabsContent>
          </Tabs>
        </div>
      )}

      {canManage && (
        <>
          <AllocateDialog prefill={allocate} onOpenChange={(v) => !v && setAllocate(null)} hostels={o?.hostels ?? []} />
          <ExeatDialog
            open={exeatOpen}
            onOpenChange={(v) => {
              setExeatOpen(v);
              if (!v && params.get('exeat')) patch({ exeat: undefined });
            }}
            overview={o}
          />
          <HostelDialog open={!!hostelEdit} onOpenChange={(v) => !v && setHostelEdit(null)} hostel={hostelEdit === 'new' ? null : hostelEdit} />
        </>
      )}
    </Page>
  );
}

// ------------------------------------------------------------------ houses

function Houses({ o, onAllocate, onEditHostel }: { o: HostelOverview | undefined; onAllocate: (p: AllocatePrefill) => void; onEditHostel: (h: HostelRow | 'new') => void }) {
  const canManage = useCan('hostel.manage');
  const delHostel = useDeleteHostel();
  const delRoom = useDeleteRoom();
  const endStay = useEndAllocation();
  const [room, setRoom] = useState<{ hostel: HostelRow; room: HostelRoomRow | null } | null>(null);
  const [deleting, setDeleting] = useState<{ kind: 'hostel'; h: HostelRow } | { kind: 'room'; r: HostelRoomRow } | null>(null);
  const [ending, setEnding] = useState<{ allocationId: string; name: string; where: string } | null>(null);

  if (!o) {
    return (
      <div className="space-y-4" aria-busy>
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-64 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (o.hostels.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Building}
          title="No hostels yet"
          description="Add your boarding houses, then their rooms and beds."
          action={
            canManage && (
              <Button onClick={() => onEditHostel('new')}>
                <Plus /> Add a hostel
              </Button>
            )
          }
        />
      </Card>
    );
  }
  return (
    <div className="space-y-5">
      {canManage && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => onEditHostel('new')}>
            <Plus /> Add hostel
          </Button>
        </div>
      )}
      {o.hostels.map((h) => (
        <Card key={h.id} className="overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                <Building className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-[16px] font-semibold tracking-tight">{h.name}</span>
                  <Badge variant={h.gender === 'FEMALE' ? 'info' : h.gender === 'MALE' ? 'brand' : 'secondary'}>{GENDER_LABEL[h.gender]}</Badge>
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted-foreground">
                  {h.warden ? (
                    <>
                      Warden {h.warden.name}
                      {h.warden.phone && (
                        <a href={telHref(h.warden.phone)} className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
                          <Phone className="size-3" aria-hidden /> {h.warden.phone}
                        </a>
                      )}
                    </>
                  ) : (
                    'No warden set'
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 sm:w-72">
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-[12.5px] tabular">
                  <span className="font-semibold">{h.occupied}</span>
                  <span className="text-muted-foreground"> of {plural(h.beds, 'bed')} taken</span>
                </p>
                <CapacityBar used={h.occupied} total={h.beds} label={`${h.name}: ${h.occupied} of ${h.beds} beds taken`} />
              </div>
              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${h.name}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setRoom({ hostel: h, room: null })}>
                      <DoorOpen /> Add room
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onEditHostel(h)}>
                      <Pencil /> Edit hostel
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive disabled={h.occupied > 0} onSelect={() => setDeleting({ kind: 'hostel', h })}>
                      <Trash2 /> {h.occupied > 0 ? 'Move boarders out to remove' : 'Remove hostel'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
          {h.rooms.length === 0 ? (
            <div className="p-5">
              <p className="rounded-xl border border-dashed border-border p-4 text-center text-[13px] text-muted-foreground">
                No rooms yet.
                {canManage && (
                  <Button variant="link" className="ml-1 h-auto text-[13px]" onClick={() => setRoom({ hostel: h, room: null })}>
                    Add the first room
                  </Button>
                )}
              </p>
            </div>
          ) : (
            <ul className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3 [&>*]:min-w-0">
              {h.rooms.map((r) => (
                <RoomCard
                  key={r.id}
                  hostel={h}
                  room={r}
                  onEmptyBed={(bed) => onAllocate({ roomId: r.id, bed })}
                  onMove={(occ) => onAllocate({ student: { id: occ.studentId, name: occ.name, detail: occ.classArm } })}
                  onEnd={(occ) => setEnding({ allocationId: occ.allocationId, name: occ.name, where: `${h.name}, ${r.name}` })}
                  onEdit={() => setRoom({ hostel: h, room: r })}
                  onDelete={() => setDeleting({ kind: 'room', r })}
                />
              ))}
            </ul>
          )}
        </Card>
      ))}

      <RoomDialog target={room} onOpenChange={(v) => !v && setRoom(null)} />
      <ConfirmDialog
        open={!!ending}
        onOpenChange={(v) => !v && setEnding(null)}
        title={`End ${ending?.name ?? ''}’s stay?`}
        description={ending ? `Their bed in ${ending.where} is freed up from today.` : undefined}
        confirmLabel="End stay"
        loading={endStay.isPending}
        onConfirm={() => ending && endStay.mutate(ending.allocationId, { onSuccess: () => setEnding(null) })}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={deleting?.kind === 'hostel' ? `Remove ${deleting.h.name}?` : deleting?.kind === 'room' ? `Remove ${deleting.r.name}?` : ''}
        description={deleting?.kind === 'hostel' ? 'The hostel and all its rooms are removed.' : 'The room and its beds are removed.'}
        confirmLabel="Remove"
        loading={delHostel.isPending || delRoom.isPending}
        onConfirm={() => {
          if (deleting?.kind === 'hostel') delHostel.mutate(deleting.h.id, { onSuccess: () => setDeleting(null) });
          else if (deleting?.kind === 'room') delRoom.mutate(deleting.r.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </div>
  );
}

type Occupant = HostelRoomRow['occupants'][number];

/** Beds numbered 1..n; occupants without a bed number fill the gaps. */
function bedSlots(room: HostelRoomRow): { bed: number; occupant: Occupant | null }[] {
  const slots: { bed: number; occupant: Occupant | null }[] = Array.from({ length: room.beds }, (_, i) => ({ bed: i + 1, occupant: null }));
  const unnumbered: Occupant[] = [];
  for (const o of room.occupants) {
    const slot = o.bed ? slots[o.bed - 1] : undefined;
    if (slot && !slot.occupant) slot.occupant = o;
    else unnumbered.push(o);
  }
  for (const o of unnumbered) {
    const free = slots.find((s) => !s.occupant);
    if (free) free.occupant = o;
    else slots.push({ bed: slots.length + 1, occupant: o });
  }
  return slots;
}

function RoomCard({
  hostel,
  room,
  onEmptyBed,
  onMove,
  onEnd,
  onEdit,
  onDelete,
}: {
  hostel: HostelRow;
  room: HostelRoomRow;
  onEmptyBed: (bed: number) => void;
  onMove: (o: Occupant) => void;
  onEnd: (o: Occupant) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const canManage = useCan('hostel.manage');
  const slots = useMemo(() => bedSlots(room), [room]);
  const full = room.occupants.length >= room.beds;
  return (
    <li className="rounded-xl border border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[13.5px] font-semibold">{room.name}</p>
        <div className="flex shrink-0 items-center gap-1">
          <span className={cn('text-[12px] tabular', full ? 'font-medium text-foreground' : 'text-muted-foreground')}>
            {room.occupants.length}/{room.beds}
          </span>
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="size-7" aria-label={`Actions for ${hostel.name} ${room.name}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil /> Edit room
                </DropdownMenuItem>
                <DropdownMenuItem destructive disabled={room.occupants.length > 0} onSelect={onDelete}>
                  <Trash2 /> {room.occupants.length ? 'Empty it to remove' : 'Remove room'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-1.5 [&>*]:min-w-0">
        {slots.map(({ bed, occupant }) =>
          occupant ? (
            <li key={bed}>
              {canManage ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        'flex w-full min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        occupant.awayOnExeat ? 'border-warning/40 bg-warning-soft/50 hover:bg-warning-soft' : 'border-border bg-card hover:border-border-strong',
                      )}
                      aria-label={`Bed ${bed}: ${occupant.name}${occupant.awayOnExeat ? ', away on exeat' : ''}`}
                    >
                      <BedSlotBody bed={bed} o={occupant} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel className="normal-case tracking-normal">
                      {occupant.name}
                      {occupant.classArm && <span className="block font-normal text-muted-foreground">{occupant.classArm}</span>}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => onMove(occupant)}>
                      <ArrowRightLeft /> Move to another bed
                    </DropdownMenuItem>
                    <DropdownMenuItem destructive onSelect={() => onEnd(occupant)}>
                      <UserMinus /> End stay
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className={cn('flex min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[12px]', occupant.awayOnExeat ? 'border-warning/40 bg-warning-soft/50' : 'border-border bg-card')}>
                  <BedSlotBody bed={bed} o={occupant} />
                </div>
              )}
            </li>
          ) : (
            <li key={bed}>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => onEmptyBed(bed)}
                  className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-border px-2 py-1.5 text-left text-[12px] text-muted-foreground transition-colors hover:border-brand/50 hover:bg-brand-soft/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Bed ${bed} in ${room.name} is empty — allocate it`}
                >
                  <span className="w-4 shrink-0 text-center font-mono text-[10.5px] tabular">{bed}</span>
                  <Plus className="size-3 shrink-0" aria-hidden /> Empty
                </button>
              ) : (
                <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2 py-1.5 text-[12px] text-muted-foreground">
                  <span className="w-4 shrink-0 text-center font-mono text-[10.5px] tabular">{bed}</span> Empty
                </div>
              )}
            </li>
          ),
        )}
      </ul>
    </li>
  );
}

function BedSlotBody({ bed, o }: { bed: number; o: Occupant }) {
  return (
    <>
      <span className="w-4 shrink-0 text-center font-mono text-[10.5px] text-muted-foreground tabular">{bed}</span>
      <span className="min-w-0 flex-1 truncate font-medium">{o.name}</span>
      {o.awayOnExeat && <Luggage className="size-3 shrink-0 text-warning" aria-label="Away on exeat" />}
    </>
  );
}

// ------------------------------------------------------------------ exeats

function ExeatsTab({ o, onSignOut }: { o: HostelOverview | undefined; onSignOut: () => void }) {
  const canManage = useCan('hostel.manage');
  const [view, setView] = useState<'OUT' | 'ALL'>('OUT');
  const history = useExeats('ALL', view === 'ALL');
  const back = useExeatReturn();
  const rows = view === 'OUT' ? (o ? [...o.away].sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.expectedReturnAt.localeCompare(b.expectedReturnAt)) : undefined) : history.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          label="Exeats"
          value={view}
          onChange={setView}
          options={[
            { value: 'OUT', label: <><Luggage /> Out now</>, count: o?.away.length },
            { value: 'ALL', label: <><History /> History</> },
          ]}
        />
        {canManage && (
          <Button variant="outline" size="sm" onClick={onSignOut}>
            <Luggage /> Sign out on exeat
          </Button>
        )}
      </div>
      {view === 'ALL' && history.error && !history.data ? (
        <ErrorState error={history.error} onRetry={() => void history.refetch()} />
      ) : !rows ? (
        <div className="space-y-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[84px] rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={Luggage} title={view === 'OUT' ? 'Everyone is in residence' : 'No exeats yet'} description={view === 'OUT' ? 'Boarders signed out on exeat appear here until they’re back.' : 'Exeats are listed here once boarders start signing out.'} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {rows.map((e) => (
              <ExeatLine key={e.id} e={e} canManage={canManage} pending={back.isPending && back.variables === e.id} onBack={() => back.mutate(e.id)} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function ExeatLine({ e, canManage, pending, onBack }: { e: ExeatRow; canManage: boolean; pending: boolean; onBack: () => void }) {
  const out = !e.returnedAt;
  return (
    <li className={cn('flex flex-col gap-3 px-4 py-3.5 sm:px-5 md:flex-row md:items-center', e.overdue && 'bg-danger-soft/30')}>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium">
          {e.student.name}
          {e.overdue ? (
            <Badge variant="danger" dot>
              Overdue · due {formatRelative(e.expectedReturnAt)}
            </Badge>
          ) : out ? (
            <Badge variant="warning" dot>
              Out
            </Badge>
          ) : (
            <Badge variant="outline">Back</Badge>
          )}
        </p>
        <p className="truncate text-[12.5px] text-muted-foreground">
          {[e.student.classArm, e.student.hostel].filter(Boolean).join(' · ') || 'Boarder'} · with {e.collectedBy}
        </p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Left {schoolDateTime(e.leaveAt)} · {out ? 'due back' : 'was due'} {schoolDateTime(e.expectedReturnAt)}
          {e.returnedAt && ` · back ${schoolDateTime(e.returnedAt)}`}
        </p>
        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
          {e.reason}
          {e.approvedBy && ` · signed out by ${e.approvedBy}`}
        </p>
      </div>
      {out && canManage && (
        <Button size="sm" variant={e.overdue ? 'default' : 'outline'} loading={pending} onClick={onBack} className="self-start md:self-auto">
          <LogIn /> Signed back in
        </Button>
      )}
    </li>
  );
}
