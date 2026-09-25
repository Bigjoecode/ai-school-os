import { ROOM_KIND_LABELS, ROOM_KINDS, type RoomInput, type RoomRow, roomSchema, type TimetableSetup } from '@aischool/shared';
import { DoorOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import type * as React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FormDialog, SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiError, errorMessage } from '@/lib/api';
import { useDeleteRoom, useSaveRoom, useToggleRoom } from '../api';

type Kind = (typeof ROOM_KINDS)[number];

export function RoomsTab({ setup, canManage }: { setup: TimetableSetup; canManage: boolean }) {
  const [editing, setEditing] = useState<RoomRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<RoomRow | null>(null);
  const toggle = useToggleRoom();
  const remove = useDeleteRoom();
  const rooms = setup.rooms;

  const neededKinds = new Set(setup.loads.filter((l) => l.periodsPerWeek > 0 && l.roomKind).map((l) => l.roomKind as Kind));
  const missing = [...neededKinds].filter((kind) => !rooms.some((r) => r.kind === kind && r.isActive));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <p className="flex-1 text-[12.5px] text-muted-foreground">
          Specialist rooms (labs, ICT, studios) are shared between classes — the solver never double-books them. Lessons without a room kind happen in the class’s own
          classroom.
        </p>
        {canManage && (
          <Button onClick={() => setEditing('new')}>
            <Plus /> Add room
          </Button>
        )}
      </div>

      {missing.length > 0 && (
        <p className="rounded-xl border border-warning/30 bg-warning-soft/60 px-3.5 py-2.5 text-[12.5px]">
          Some lessons need a {missing.map((m) => ROOM_KIND_LABELS[m].toLowerCase()).join(', ')} but there’s no active room of that kind yet.
        </p>
      )}

      <Card className="overflow-hidden">
        {rooms.length === 0 ? (
          <EmptyState
            icon={DoorOpen}
            title="No rooms yet"
            description="Add labs, ICT rooms and halls so lessons that need them can be placed."
            action={
              canManage && (
                <Button onClick={() => setEditing('new')}>
                  <Plus /> Add room
                </Button>
              )
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Room</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead className="text-right">Capacity</TableHead>
                <TableHead>Active</TableHead>
                {canManage && (
                  <TableHead className="w-24">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rooms.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <Badge variant={r.kind === 'CLASSROOM' ? 'secondary' : 'brand'}>{ROOM_KIND_LABELS[r.kind]}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular">{r.capacity ?? '—'}</TableCell>
                  <TableCell>
                    <Switch
                      checked={r.isActive}
                      disabled={!canManage || toggle.isPending}
                      onCheckedChange={(v) => toggle.mutate({ id: r.id, isActive: v })}
                      aria-label={`${r.name} available for timetabling`}
                    />
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex justify-end gap-0.5">
                        <Button size="icon-sm" variant="ghost" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}>
                          <Pencil />
                        </Button>
                        <Button size="icon-sm" variant="ghost" aria-label={`Delete ${r.name}`} onClick={() => setDeleting(r)}>
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {canManage && <RoomDialog room={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'room'}?`}
        description="Lessons already placed in this room on existing timetables lose their room. Switch it off instead if you only want the solver to skip it."
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting, { onSuccess: () => setDeleting(null) })}
      />
    </div>
  );
}

function RoomDialog({ room, onClose }: { room: RoomRow | 'new' | null; onClose: () => void }) {
  const existing = room && room !== 'new' ? room : null;
  const [form, setForm] = useState<{ name: string; kind: Kind; capacity: string; isActive: boolean }>({ name: '', kind: 'LAB', capacity: '', isActive: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [openFor, setOpenFor] = useState<RoomRow | 'new' | null>(null);
  const save = useSaveRoom();

  if (room !== openFor) {
    setOpenFor(room);
    setErrors({});
    if (room) {
      setForm(
        existing
          ? { name: existing.name, kind: existing.kind, capacity: existing.capacity == null ? '' : String(existing.capacity), isActive: existing.isActive }
          : { name: '', kind: 'LAB', capacity: '', isActive: true },
      );
    }
  }

  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    const input = {
      name: form.name,
      kind: form.kind,
      capacity: form.capacity.trim() === '' ? null : Number(form.capacity),
      isActive: form.isActive,
    };
    const parsed = roomSchema.safeParse(input);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const i of parsed.error.issues) next[String(i.path[0])] ??= i.path[0] === 'capacity' ? 'Enter a whole number from 1 to 2000' : i.message;
      setErrors(next);
      return;
    }
    save.mutate(
      { id: existing?.id, input: parsed.data as RoomInput },
      {
        onSuccess: onClose,
        onError: (err) => {
          if (err instanceof ApiError && err.errors.length) {
            setErrors(Object.fromEntries(err.errors.map((x) => [x.path, x.message])));
          }
          toast.error(errorMessage(err));
        },
      },
    );
  };

  return (
    <FormDialog
      open={!!room}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? `Edit ${existing.name}` : 'Add a room'}
      description="Rooms the solver can use for lessons that need a particular kind of space."
      icon={<DoorOpen />}
      submitLabel={existing ? 'Save room' : 'Add room'}
      pending={save.isPending}
      onSubmit={submit}
      size="sm"
    >
      <div className="space-y-4">
        <Field label="Name" htmlFor="room-name" error={errors.name}>
          <Input
            id="room-name"
            value={form.name}
            maxLength={60}
            placeholder="e.g. Chemistry Lab"
            invalid={!!errors.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind" htmlFor="room-kind">
            <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as Kind })}>
              <SelectTrigger id="room-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROOM_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {ROOM_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Capacity" htmlFor="room-capacity" optional error={errors.capacity}>
            <Input
              id="room-capacity"
              inputMode="numeric"
              value={form.capacity}
              invalid={!!errors.capacity}
              onChange={(e) => setForm({ ...form, capacity: e.target.value.replace(/[^\d]/g, '') })}
            />
          </Field>
        </div>
        <SwitchRow label="Available for timetabling" description="Switch off while a room is being renovated.">
          <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
        </SwitchRow>
      </div>
    </FormDialog>
  );
}
