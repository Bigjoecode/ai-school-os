import { HOSTEL_GENDERS, type HostelOverview, type HostelRoomRow, type HostelRow, hostelSchema } from '@aischool/shared';
import { BedDouble, Building, DoorOpen, Luggage } from 'lucide-react';
import { type BaseSyntheticEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCan } from '@/lib/auth-store';
import { useAllocate, useSaveHostel, useSaveRoom, useSignOutExeat } from './api';
import { apiFieldErrors, Combo, dateInput, FormError, type PickedPerson, StaffCombo, StudentCombo, toLocalInput, zodErrors } from './ui';

export const GENDER_LABEL: Record<(typeof HOSTEL_GENDERS)[number], string> = { MALE: 'Boys', FEMALE: 'Girls', MIXED: 'Mixed' };

// ------------------------------------------------------------------ hostel

export function HostelDialog({ open, onOpenChange, hostel }: { open: boolean; onOpenChange: (o: boolean) => void; hostel: HostelRow | null }) {
  const save = useSaveHostel(hostel?.id);
  const canStaff = useCan('staff.read');
  const [name, setName] = useState('');
  const [gender, setGender] = useState<(typeof HOSTEL_GENDERS)[number]>('MALE');
  const [warden, setWarden] = useState<PickedPerson | null>(null);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setName(hostel?.name ?? '');
    setGender(hostel?.gender ?? 'MALE');
    setWarden(hostel?.warden ? { id: hostel.warden.id, name: hostel.warden.name, detail: hostel.warden.phone } : null);
    setNotes(hostel?.notes ?? '');
    setErrors({});
  }, [open, hostel]);

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const parsed = hostelSchema.safeParse({ name, gender, wardenStaffId: warden?.id ?? null, notes });
    if (!parsed.success) {
      const errs = zodErrors(parsed.error.issues);
      if (errs.name) errs.name = 'Give the house a name';
      setErrors(errs);
      return;
    }
    setErrors({});
    save.mutate(parsed.data, { onSuccess: () => onOpenChange(false), onError: (err) => setErrors(apiFieldErrors(err)) });
  };

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={hostel ? `Edit ${hostel.name}` : 'Add a hostel'} icon={<Building />} submitLabel={hostel ? 'Save changes' : 'Add hostel'} pending={save.isPending} onSubmit={submit} size="sm">
      <div className="grid gap-4">
        <Field label="Name" htmlFor="hs-name" error={errors.name}>
          <Input id="hs-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} invalid={!!errors.name} placeholder="e.g. Aggrey House" autoFocus />
        </Field>
        <Field label="For" htmlFor="hs-gender" hint="Boarders are checked against this when given a bed.">
          <Select value={gender} onValueChange={(g) => setGender(g as typeof gender)}>
            <SelectTrigger id="hs-gender">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOSTEL_GENDERS.map((g) => (
                <SelectItem key={g} value={g}>
                  {GENDER_LABEL[g]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="House warden" htmlFor="hs-warden" optional>
          {canStaff ? (
            <StaffCombo id="hs-warden" value={warden} onChange={setWarden} />
          ) : (
            <p className="rounded-xl border border-dashed border-border px-3 py-2.5 text-[12.5px] text-muted-foreground">{warden ? `${warden.name} — ` : ''}Choosing a warden needs access to the staff list.</p>
          )}
        </Field>
        <Field label="Notes" htmlFor="hs-notes" optional>
          <Textarea id="hs-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
        </Field>
        <FormError message={errors.form} />
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ room

export function RoomDialog({ target, onOpenChange }: { target: { hostel: HostelRow; room: HostelRoomRow | null } | null; onOpenChange: (o: boolean) => void }) {
  const save = useSaveRoom(target?.hostel.id ?? '', target?.room?.id);
  const [name, setName] = useState('');
  const [beds, setBeds] = useState('4');
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!target) return;
    setName(target.room?.name ?? '');
    setBeds(String(target.room?.beds ?? 4));
    setErrors({});
  }, [target]);
  if (!target) return null;
  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const n = Number(beds);
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Name or number the room';
    if (!Number.isInteger(n) || n < 1 || n > 60) next.beds = '1–60 beds';
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate({ name: name.trim(), beds: n }, { onSuccess: () => onOpenChange(false), onError: (err) => setErrors(apiFieldErrors(err)) });
  };
  return (
    <FormDialog
      open={!!target}
      onOpenChange={onOpenChange}
      title={target.room ? `Edit ${target.room.name}` : `Add a room to ${target.hostel.name}`}
      icon={<DoorOpen />}
      submitLabel={target.room ? 'Save room' : 'Add room'}
      pending={save.isPending}
      onSubmit={submit}
      size="sm"
    >
      <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="Room" htmlFor="rm-name" error={errors.name}>
          <Input id="rm-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} invalid={!!errors.name} placeholder="e.g. Room 4" autoFocus />
        </Field>
        <Field label="Beds" htmlFor="rm-beds" error={errors.beds}>
          <Input id="rm-beds" inputMode="numeric" value={beds} onChange={(e) => setBeds(e.target.value.replace(/\D/g, '').slice(0, 2))} invalid={!!errors.beds} className="tabular" />
        </Field>
        <div className="sm:col-span-2">
          <FormError message={errors.form} />
        </div>
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ allocate

export interface AllocatePrefill {
  student?: PickedPerson | null;
  roomId?: string;
  bed?: number | null;
}

export function AllocateDialog({ prefill, onOpenChange, hostels }: { prefill: AllocatePrefill | null; onOpenChange: (o: boolean) => void; hostels: HostelRow[] }) {
  const allocate = useAllocate();
  const [student, setStudent] = useState<PickedPerson | null>(null);
  const [hostelId, setHostelId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [bed, setBed] = useState<string>(NONE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const open = !!prefill;

  useEffect(() => {
    if (!prefill) return;
    const h = prefill.roomId ? hostels.find((x) => x.rooms.some((r) => r.id === prefill.roomId)) : hostels.length === 1 ? hostels[0] : undefined;
    setStudent(prefill.student ?? null);
    setHostelId(h?.id ?? '');
    setRoomId(prefill.roomId ?? '');
    setBed(prefill.bed ? String(prefill.bed) : NONE);
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const hostel = hostels.find((h) => h.id === hostelId);
  const room = hostel?.rooms.find((r) => r.id === roomId);
  const current = useMemo(() => {
    if (!student) return null;
    for (const h of hostels) for (const r of h.rooms) for (const o of r.occupants) if (o.studentId === student.id) return { hostel: h, room: r, bed: o.bed };
    return null;
  }, [student, hostels]);
  const freeBeds = useMemo(() => {
    if (!room) return [];
    const taken = new Set(room.occupants.filter((o) => o.studentId !== student?.id).map((o) => o.bed));
    return Array.from({ length: room.beds }, (_, i) => i + 1).filter((b) => !taken.has(b));
  }, [room, student]);

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const next: Record<string, string> = {};
    if (!student) next.student = 'Choose a student';
    if (!roomId) next.room = 'Choose a room';
    setErrors(next);
    if (Object.keys(next).length || !student) return;
    allocate.mutate(
      { studentId: student.id, roomId, bed: bed === NONE ? null : Number(bed) },
      {
        onSuccess: () => {
          toast.success(`${student.name} ${current ? 'moved to' : 'given a bed in'} ${hostel?.name}, ${room?.name}${bed !== NONE ? ` (bed ${bed})` : ''}`);
          onOpenChange(false);
        },
        onError: (err) => setErrors(apiFieldErrors(err)),
      },
    );
  };

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={current ? 'Move a boarder' : 'Allocate a bed'} description="A student who already has a bed is moved to the new one." icon={<BedDouble />} submitLabel={current ? 'Move boarder' : 'Allocate bed'} pending={allocate.isPending} onSubmit={submit}>
      <div className="grid gap-4">
        <Field label="Student" htmlFor="al-student" error={errors.student} hint={current ? `Now in ${current.hostel.name}, ${current.room.name}${current.bed ? `, bed ${current.bed}` : ''}` : undefined}>
          <StudentCombo id="al-student" value={student} onChange={setStudent} invalid={!!errors.student} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Hostel" htmlFor="al-hostel">
            <Select
              value={hostelId || undefined}
              onValueChange={(id) => {
                setHostelId(id);
                setRoomId('');
                setBed(NONE);
              }}
            >
              <SelectTrigger id="al-hostel">
                <SelectValue placeholder="Choose a hostel" />
              </SelectTrigger>
              <SelectContent>
                {hostels.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.name} · {GENDER_LABEL[h.gender]} · {h.beds - h.occupied} free
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Room" htmlFor="al-room" error={errors.room}>
            <Select
              value={roomId || undefined}
              onValueChange={(id) => {
                setRoomId(id);
                setBed(NONE);
              }}
              disabled={!hostel}
            >
              <SelectTrigger id="al-room" invalid={!!errors.room}>
                <SelectValue placeholder={hostel ? 'Choose a room' : 'Choose a hostel first'} />
              </SelectTrigger>
              <SelectContent>
                {hostel?.rooms.map((r) => {
                  const free = r.beds - r.occupants.filter((o) => o.studentId !== student?.id).length;
                  return (
                    <SelectItem key={r.id} value={r.id} disabled={free <= 0}>
                      {r.name} · {free > 0 ? `${free} free` : 'full'}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </Field>
        </div>
        {room && (
          <Field label="Bed" htmlFor="al-bed" optional>
            <Select value={bed} onValueChange={setBed}>
              <SelectTrigger id="al-bed" className="sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Any free bed</SelectItem>
                {freeBeds.map((b) => (
                  <SelectItem key={b} value={String(b)}>
                    Bed {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <FormError message={errors.form} />
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ exeat

export function ExeatDialog({ open, onOpenChange, overview, prefill }: { open: boolean; onOpenChange: (o: boolean) => void; overview: HostelOverview | undefined; prefill?: PickedPerson | null }) {
  const signOut = useSignOutExeat();
  const [student, setStudent] = useState<PickedPerson | null>(null);
  const [leaveAt, setLeaveAt] = useState('');
  const [backAt, setBackAt] = useState('');
  const [reason, setReason] = useState('');
  const [collectedBy, setCollectedBy] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    const back = new Date(now);
    back.setDate(back.getDate() + 2);
    back.setHours(18, 0, 0, 0);
    setStudent(prefill ?? null);
    setLeaveAt(toLocalInput(now));
    setBackAt(toLocalInput(back));
    setReason('');
    setCollectedBy('');
    setErrors({});
  }, [open, prefill]);

  const boarders = useMemo(() => {
    const out: PickedPerson[] = [];
    for (const h of overview?.hostels ?? []) for (const r of h.rooms) for (const o of r.occupants) if (!o.awayOnExeat) out.push({ id: o.studentId, name: o.name, detail: [o.classArm, `${h.name}, ${r.name}`].filter(Boolean).join(' · ') });
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [overview]);

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const next: Record<string, string> = {};
    const leave = new Date(leaveAt);
    const back = new Date(backAt);
    if (!student) next.studentId = 'Choose the boarder';
    if (!leaveAt || Number.isNaN(leave.getTime())) next.leaveAt = 'When are they leaving?';
    if (!backAt || Number.isNaN(back.getTime())) next.expectedReturnAt = 'When are they due back?';
    else if (back <= leave) next.expectedReturnAt = 'The return must be after they leave';
    if (reason.trim().length < 3) next.reason = 'Give a short reason';
    if (collectedBy.trim().length < 2) next.collectedBy = 'Who is collecting them?';
    setErrors(next);
    if (Object.keys(next).length || !student) return;
    signOut.mutate(
      { studentId: student.id, leaveAt: leave.toISOString(), expectedReturnAt: back.toISOString(), reason: reason.trim(), collectedBy: collectedBy.trim() },
      { onSuccess: () => onOpenChange(false), onError: (err) => setErrors(apiFieldErrors(err)) },
    );
  };

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Sign out on exeat" description="Record a boarder leaving with a parent or approved guardian." icon={<Luggage />} submitLabel="Sign out" pending={signOut.isPending} onSubmit={submit}>
      <div className="grid gap-4">
        <Field label="Boarder" htmlFor="ex-student" error={errors.studentId}>
          <Combo id="ex-student" value={student} onChange={setStudent} options={boarders} loading={!overview} placeholder="Choose a boarder…" searchPlaceholder="Type a name…" emptyText="No boarders in residence match." invalid={!!errors.studentId} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Leaving" htmlFor="ex-leave" error={errors.leaveAt}>
            <Input id="ex-leave" type="datetime-local" value={leaveAt} onChange={(e) => setLeaveAt(e.target.value)} className={dateInput} invalid={!!errors.leaveAt} />
          </Field>
          <Field label="Due back" htmlFor="ex-back" error={errors.expectedReturnAt}>
            <Input id="ex-back" type="datetime-local" value={backAt} min={leaveAt} onChange={(e) => setBackAt(e.target.value)} className={dateInput} invalid={!!errors.expectedReturnAt} />
          </Field>
        </div>
        <Field label="Collected by" htmlFor="ex-by" error={errors.collectedBy} hint={!errors.collectedBy ? 'Name and relationship, e.g. Mrs Okafor (mother)' : undefined}>
          <Input id="ex-by" value={collectedBy} onChange={(e) => setCollectedBy(e.target.value)} maxLength={120} invalid={!!errors.collectedBy} />
        </Field>
        <Field label="Reason" htmlFor="ex-reason" error={errors.reason}>
          <Input id="ex-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} invalid={!!errors.reason} placeholder="e.g. Mid-term break, family wedding" />
        </Field>
        <FormError message={errors.form} />
      </div>
    </FormDialog>
  );
}
