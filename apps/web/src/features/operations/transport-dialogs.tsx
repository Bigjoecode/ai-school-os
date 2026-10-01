import {
  type RouteDetail,
  type RouteRow,
  type RouteStop,
  TRANSPORT_DIRECTIONS,
  transportRouteSchema,
  VEHICLE_STATUSES,
  type VehicleRow,
  type VehicleStatus,
  vehicleSchema,
} from '@aischool/shared';
import { ArrowDown, ArrowUp, Bus, MapPin, Plus, Trash2, UserPlus } from 'lucide-react';
import { type BaseSyntheticEvent, type FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormDialog, SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { type PickedStudent, StudentPicker } from '../students/student-picker';
import { useAssignRiders, useSaveRoute, useSaveVehicle, useVehicles } from './api';
import { apiFieldErrors, FormError, VEHICLE_STATUS_LABEL, zodErrors } from './ui';

export const DIRECTION_LABEL: Record<(typeof TRANSPORT_DIRECTIONS)[number], string> = {
  BOTH: 'Morning and afternoon',
  MORNING: 'Morning only',
  AFTERNOON: 'Afternoon only',
};

// ------------------------------------------------------------------ vehicle

const emptyVehicle = { name: '', plateNumber: '', capacity: '18', driverName: '', driverPhone: '', assistantName: '', status: 'ACTIVE' as VehicleStatus, notes: '' };

export function VehicleFormSheet({ open, onOpenChange, vehicle }: { open: boolean; onOpenChange: (o: boolean) => void; vehicle: VehicleRow | null }) {
  const save = useSaveVehicle(vehicle?.id);
  const [v, setV] = useState(emptyVehicle);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setV(
      vehicle
        ? {
            name: vehicle.name,
            plateNumber: vehicle.plateNumber,
            capacity: String(vehicle.capacity),
            driverName: vehicle.driverName ?? '',
            driverPhone: vehicle.driverPhone ?? '',
            assistantName: vehicle.assistantName ?? '',
            status: vehicle.status,
            notes: vehicle.notes ?? '',
          }
        : emptyVehicle,
    );
  }, [open, vehicle]);
  const set = (p: Partial<typeof v>) => setV((s) => ({ ...s, ...p }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = vehicleSchema.safeParse({ ...v, capacity: Number(v.capacity) });
    if (!parsed.success) {
      const errs = zodErrors(parsed.error.issues);
      if (errs.capacity) errs.capacity = '1–100 seats';
      if (errs.plateNumber) errs.plateNumber = 'Enter the plate number';
      if (errs.name) errs.name = 'e.g. Bus 1 or Coaster A';
      setErrors(errs);
      return;
    }
    setErrors({});
    save.mutate(parsed.data, { onSuccess: () => onOpenChange(false), onError: (err) => setErrors(apiFieldErrors(err)) });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="font-display text-lg font-semibold tracking-tight">{vehicle ? `Edit ${vehicle.name}` : 'Add a vehicle'}</SheetTitle>
          <SheetDescription className="text-[13px] text-muted-foreground">Seats set the capacity of every route this vehicle runs.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form id="vehicle-form" onSubmit={submit} noValidate className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
              <Field label="Name" htmlFor="vh-name" error={errors.name}>
                <Input id="vh-name" value={v.name} onChange={(e) => set({ name: e.target.value })} maxLength={60} invalid={!!errors.name} placeholder="e.g. Bus 1" autoFocus />
              </Field>
              <Field label="Plate number" htmlFor="vh-plate" error={errors.plateNumber}>
                <Input id="vh-plate" value={v.plateNumber} onChange={(e) => set({ plateNumber: e.target.value.toUpperCase() })} maxLength={20} invalid={!!errors.plateNumber} className="font-mono" placeholder="e.g. LSR 123 XY" />
              </Field>
              <Field label="Seats" htmlFor="vh-cap" error={errors.capacity}>
                <Input id="vh-cap" inputMode="numeric" value={v.capacity} onChange={(e) => set({ capacity: e.target.value.replace(/\D/g, '').slice(0, 3) })} invalid={!!errors.capacity} className="tabular" />
              </Field>
              <Field label="Status" htmlFor="vh-status">
                <Select value={v.status} onValueChange={(s) => set({ status: s as VehicleStatus })}>
                  <SelectTrigger id="vh-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VEHICLE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {VEHICLE_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Driver" htmlFor="vh-driver" optional>
                <Input id="vh-driver" value={v.driverName} onChange={(e) => set({ driverName: e.target.value })} maxLength={120} />
              </Field>
              <Field label="Driver’s phone" htmlFor="vh-phone" optional>
                <Input id="vh-phone" type="tel" value={v.driverPhone} onChange={(e) => set({ driverPhone: e.target.value })} maxLength={20} />
              </Field>
              <Field label="Bus assistant" htmlFor="vh-asst" optional className="sm:col-span-2">
                <Input id="vh-asst" value={v.assistantName} onChange={(e) => set({ assistantName: e.target.value })} maxLength={120} />
              </Field>
            </div>
            <Field label="Notes" htmlFor="vh-notes" optional>
              <Textarea id="vh-notes" rows={3} value={v.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={300} placeholder="e.g. Service due in December" />
            </Field>
            <FormError message={errors.form} />
          </form>
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="vehicle-form" loading={save.isPending}>
            {vehicle ? 'Save changes' : 'Add vehicle'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ------------------------------------------------------------------ route

type StopDraft = RouteStop & { key: number };
let stopKey = 0;
const newStop = (s?: Partial<RouteStop>): StopDraft => ({ key: ++stopKey, name: s?.name ?? '', pickup: s?.pickup ?? '06:45', dropoff: s?.dropoff ?? '15:30' });

export function RouteFormSheet({ open, onOpenChange, route }: { open: boolean; onOpenChange: (o: boolean) => void; route: RouteRow | null }) {
  const save = useSaveRoute(route?.id);
  const vehicles = useVehicles(open);
  const [name, setName] = useState('');
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [stops, setStops] = useState<StopDraft[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setName(route?.name ?? '');
    setVehicleId(route?.vehicle?.id ?? null);
    setActive(route?.active ?? true);
    setStops(route ? route.stops.map((s) => newStop(s)) : [newStop()]);
  }, [open, route]);

  const patchStop = (key: number, p: Partial<RouteStop>) => setStops((all) => all.map((s) => (s.key === key ? { ...s, ...p } : s)));
  const move = (i: number, dir: -1 | 1) =>
    setStops((all) => {
      const next = [...all];
      const j = i + dir;
      if (j < 0 || j >= next.length) return all;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = transportRouteSchema.safeParse({ name, vehicleId, active, stops: stops.map(({ name: n, pickup, dropoff }) => ({ name: n, pickup, dropoff })) });
    const next: Record<string, string> = {};
    if (!parsed.success) {
      for (const i of parsed.error.issues) {
        const [field, idx, sub] = i.path;
        if (field === 'stops' && typeof idx === 'number') next[`stop-${idx}-${String(sub)}`] ??= sub === 'name' ? 'Name the stop' : 'Use HH:MM';
        else next[String(field)] ??= field === 'name' ? 'Give the route a name' : i.message;
      }
    }
    const seen = new Set<string>();
    stops.forEach((s, idx) => {
      const k = s.name.trim().toLowerCase();
      if (k && seen.has(k)) next[`stop-${idx}-name`] = 'This stop is already on the route';
      seen.add(k);
    });
    setErrors(next);
    if (Object.keys(next).length || !parsed.success) return;
    save.mutate(parsed.data, { onSuccess: () => onOpenChange(false), onError: (err) => setErrors(apiFieldErrors(err)) });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="font-display text-lg font-semibold tracking-tight">{route ? `Edit ${route.name}` : 'Add a route'}</SheetTitle>
          <SheetDescription className="text-[13px] text-muted-foreground">Stops in the order the bus reaches them in the morning, with pick-up and drop-off times.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form id="route-form" onSubmit={submit} noValidate className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
              <Field label="Route name" htmlFor="rt-name" error={errors.name}>
                <Input id="rt-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} invalid={!!errors.name} placeholder="e.g. Lekki – Ajah" autoFocus />
              </Field>
              <Field label="Vehicle" htmlFor="rt-vehicle" hint={vehicles.data?.length === 0 ? 'Add a vehicle first to set seats.' : undefined}>
                <Select value={vehicleId ?? NONE} onValueChange={(id) => setVehicleId(id === NONE ? null : id)}>
                  <SelectTrigger id="rt-vehicle">
                    <SelectValue placeholder="No vehicle yet" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No vehicle yet</SelectItem>
                    {(vehicles.data ?? [])
                      .filter((x) => x.status !== 'RETIRED' || x.id === vehicleId)
                      .map((x) => (
                        <SelectItem key={x.id} value={x.id}>
                          {x.name} · {x.plateNumber} · {x.capacity} seats
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <fieldset className="grid gap-2">
              <legend className="mb-2 text-[13px] font-medium">Stops</legend>
              <ol className="grid gap-2">
                {stops.map((s, i) => (
                  <li key={s.key} className="rounded-xl border border-border bg-muted/20 p-3">
                    <div className="flex items-center gap-2">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand tabular" aria-hidden>
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <label htmlFor={`stop-${s.key}-name`} className="sr-only">
                          Stop {i + 1} name
                        </label>
                        <Input
                          id={`stop-${s.key}-name`}
                          value={s.name}
                          onChange={(e) => patchStop(s.key, { name: e.target.value })}
                          maxLength={80}
                          placeholder="e.g. Chevron roundabout"
                          invalid={!!errors[`stop-${i}-name`]}
                          className="h-9"
                        />
                      </div>
                      <div className="flex shrink-0 items-center">
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move stop ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                          <ArrowUp />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move stop ${i + 1} down`} disabled={i === stops.length - 1} onClick={() => move(i, 1)}>
                          <ArrowDown />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove stop ${i + 1}`} disabled={stops.length === 1} onClick={() => setStops((all) => all.filter((x) => x.key !== s.key))}>
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                    {errors[`stop-${i}-name`] && <p className="mt-1 pl-8 text-[12px] font-medium text-danger">{errors[`stop-${i}-name`]}</p>}
                    <div className="mt-2 grid grid-cols-2 gap-2 pl-8 [&>*]:min-w-0">
                      <label className="grid gap-1 text-[11.5px] text-muted-foreground" htmlFor={`stop-${s.key}-pu`}>
                        Pick-up
                        <Input id={`stop-${s.key}-pu`} type="time" value={s.pickup} onChange={(e) => patchStop(s.key, { pickup: e.target.value })} className="h-9 tabular [color-scheme:light] dark:[color-scheme:dark]" invalid={!!errors[`stop-${i}-pickup`]} />
                      </label>
                      <label className="grid gap-1 text-[11.5px] text-muted-foreground" htmlFor={`stop-${s.key}-do`}>
                        Drop-off
                        <Input id={`stop-${s.key}-do`} type="time" value={s.dropoff} onChange={(e) => patchStop(s.key, { dropoff: e.target.value })} className="h-9 tabular [color-scheme:light] dark:[color-scheme:dark]" invalid={!!errors[`stop-${i}-dropoff`]} />
                      </label>
                    </div>
                  </li>
                ))}
              </ol>
              {errors.stops && <p className="text-[12px] font-medium text-danger">{errors.stops}</p>}
              <Button type="button" variant="outline" size="sm" className="justify-self-start" disabled={stops.length >= 40} onClick={() => setStops((all) => [...all, newStop({ pickup: all.at(-1)?.pickup, dropoff: all.at(-1)?.dropoff })])}>
                <Plus /> Add stop
              </Button>
            </fieldset>

            <SwitchRow label="Running" description="Turn off for a route that’s paused. Riders stay assigned.">
              <Switch checked={active} onCheckedChange={setActive} aria-label="Route running" />
            </SwitchRow>
            <FormError message={errors.form} />
          </form>
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="route-form" loading={save.isPending}>
            {route ? 'Save route' : 'Add route'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ------------------------------------------------------------------ riders

export function AddRidersDialog({ open, onOpenChange, route }: { open: boolean; onOpenChange: (o: boolean) => void; route: RouteDetail }) {
  const assign = useAssignRiders();
  const [students, setStudents] = useState<PickedStudent[]>([]);
  const [stop, setStop] = useState('');
  const [direction, setDirection] = useState<(typeof TRANSPORT_DIRECTIONS)[number]>('BOTH');
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setStudents([]);
    setStop(route.stops[0]?.name ?? '');
    setDirection('BOTH');
    setErrors({});
  }, [open, route.stops]);

  const seats = route.vehicle?.capacity;
  const after = route.riders + students.filter((s) => !route.riderList.some((r) => r.student.id === s.id)).length;
  const already = students.filter((s) => route.riderList.some((r) => r.student.id === s.id));

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const next: Record<string, string> = {};
    if (!students.length) next.students = 'Choose at least one student';
    if (!stop) next.stop = 'Choose their stop';
    setErrors(next);
    if (Object.keys(next).length) return;
    assign.mutate({ studentIds: students.map((s) => s.id), routeId: route.id, stop, direction }, { onSuccess: () => onOpenChange(false), onError: (err) => setErrors(apiFieldErrors(err)) });
  };

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={`Add riders to ${route.name}`} description="Students already on another route are moved to this one." icon={<UserPlus />} submitLabel={students.length > 1 ? `Add ${students.length} riders` : 'Add rider'} pending={assign.isPending} onSubmit={submit}>
      <div className="grid gap-4">
        <Field label="Students" htmlFor="ar-students" error={errors.students}>
          <StudentPicker id="ar-students" value={students} onChange={setStudents} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Stop" htmlFor="ar-stop" error={errors.stop}>
            <Select value={stop || undefined} onValueChange={setStop}>
              <SelectTrigger id="ar-stop" invalid={!!errors.stop}>
                <SelectValue placeholder="Choose a stop" />
              </SelectTrigger>
              <SelectContent>
                {route.stops.map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.name} · {s.pickup}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Rides" htmlFor="ar-dir">
            <Select value={direction} onValueChange={(d) => setDirection(d as typeof direction)}>
              <SelectTrigger id="ar-dir">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSPORT_DIRECTIONS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {DIRECTION_LABEL[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        {already.length > 0 && <p className="text-[12.5px] text-muted-foreground">{already.map((s) => s.name).join(', ')} already ride{already.length === 1 ? 's' : ''} this route — their stop will be updated.</p>}
        {seats != null && (
          <p className={cn('flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[12.5px]', after > seats ? 'border-danger/30 bg-danger-soft/50 text-danger' : 'border-border bg-muted/30 text-muted-foreground')}>
            <Bus className="size-4 shrink-0" aria-hidden />
            {after > seats ? `That makes ${after} riders for ${seats} seats — ${after - seats} over capacity.` : `${after} of ${seats} seats will be taken.`}
          </p>
        )}
        {route.stops.length === 0 && (
          <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <MapPin className="size-3.5" aria-hidden /> Add stops to the route first.
          </p>
        )}
        <FormError message={errors.form} />
      </div>
    </FormDialog>
  );
}
