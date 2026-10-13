import { authorisedPickupSchema, type AuthorisedPickupRow, type GateMethod, type PickupNoticeRow } from '@aischool/shared';
import { Camera, Clock, ImagePlus, Loader2, UserPlus, UserRoundCheck, Users, X } from 'lucide-react';
import { type BaseSyntheticEvent, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Field } from '@/components/ui/field';
import { FormDialog, SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/api';
import { cn, initialsFromName } from '@/lib/utils';
import { schoolTimeZone } from '../attendance/ui';
import { uploadPhoto, useAuthedImage, usePickupPeople } from './api';

/** "7:42" in the school's time zone. */
export function clock(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', timeZone: schoolTimeZone() }).format(d);
}

export const METHOD_LABEL: Record<GateMethod, string> = { SCAN: 'gate pass', MANUAL: 'signed in by hand', REGISTER: 'class register', PICKUP: 'pick-up' };

/** A pick-up person's or delegate's photo (needs sign-in, so it's fetched), else initials. */
export function PersonPhoto({ name, path, size = 'lg', className }: { name: string; path: string | null; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const src = useAuthedImage(path);
  return <Avatar name={name} initials={initialsFromName(name)} src={src ?? undefined} size={size} className={className} />;
}

/** Where a person's photo is served from, for staff or for the child's parent. */
export function personPhotoPath(p: AuthorisedPickupRow, as: 'staff' | 'parent'): string | null {
  if (!p.hasPhoto) return null;
  return as === 'staff' ? `/gate/pickup-people/${p.id}/photo` : `/portal/students/${p.studentId}/pickup-people/${p.id}/photo`;
}

export function noticePhotoPath(n: PickupNoticeRow, as: 'staff' | 'parent'): string | null {
  if (!n.delegate?.hasPhoto) return null;
  return as === 'staff' ? `/gate/notices/${n.id}/photo` : `/portal/students/${n.studentId}/pickup-notices/${n.id}/photo`;
}

/** One line for a parent's notice. */
export function noticeText(n: PickupNoticeRow): string {
  if (n.kind === 'RUNNING_LATE') return `Parent running late${n.eta ? ` — about ${n.eta}` : ''}`;
  if (n.kind === 'PICKUP_TIME') return `Pick-up time today: ${n.eta ?? '—'}`;
  return `${n.delegate?.name ?? 'Someone else'}${n.delegate?.relationship ? ` (${n.delegate.relationship})` : ''} collecting today${n.needsCode ? ' · one-time code' : ''}${n.codeUsed ? ' · code used' : ''}`;
}

export function NoticeBadge({ n }: { n: PickupNoticeRow }) {
  const tone = n.kind === 'DELEGATE' ? 'info' : 'warning';
  return (
    <Badge variant={tone} className="max-w-full gap-1 whitespace-normal text-left">
      {n.kind === 'DELEGATE' ? <Users className="size-3 shrink-0" aria-hidden /> : <Clock className="size-3 shrink-0" aria-hidden />}
      <span className="min-w-0">{noticeText(n)}</span>
    </Badge>
  );
}

// ------------------------------------------------------------------ photo picker

export function PhotoPicker({ value, onChange, existing }: { value: { id: string; preview: string } | null; onChange: (v: { id: string; preview: string } | null) => void; existing?: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const existingSrc = useAuthedImage(existing ?? null);
  const shown = value?.preview ?? existingSrc;
  useEffect(() => () => {
    if (value) URL.revokeObjectURL(value.preview);
  }, [value]);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
      toast.error('Choose a JPG, PNG or WebP photo');
      return;
    }
    setBusy(true);
    try {
      const id = await uploadPhoto(f);
      onChange({ id, preview: URL.createObjectURL(f) });
    } catch (err) {
      toast.error(errorMessage(err, 'Could not upload the photo'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/40">
        {busy ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : shown ? <img src={shown} alt="" className="size-full object-cover" /> : <Camera className="size-5 text-muted-foreground" aria-hidden />}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[13px] font-medium hover:bg-muted/60"
        >
          <ImagePlus className="size-4" /> {shown ? 'Change photo' : 'Add a photo'}
        </button>
        {value && (
          <button type="button" onClick={() => onChange(null)} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] text-muted-foreground hover:bg-muted">
            <X className="size-4" /> Remove
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="user" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
    </div>
  );
}

// ------------------------------------------------------------------ add / edit an authorised person

export function PersonDialog({
  open,
  onOpenChange,
  studentId,
  childName,
  as,
  person,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  studentId: string;
  childName: string;
  as: 'staff' | 'parent';
  person: AuthorisedPickupRow | null;
}) {
  const { save } = usePickupPeople(studentId, as);
  const [v, setV] = useState({ name: '', relationship: '', phone: '', validUntil: '', active: true });
  const [photo, setPhoto] = useState<{ id: string; preview: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setV({ name: person?.name ?? '', relationship: person?.relationship ?? '', phone: person?.phone ?? '', validUntil: person?.validUntil ?? '', active: person?.active ?? true });
    setPhoto(null);
    setErrors({});
  }, [open, person]);
  const set = (p: Partial<typeof v>) => setV((s) => ({ ...s, ...p }));
  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const parsed = authorisedPickupSchema.safeParse({ ...v, phone: v.phone.trim() || null, validUntil: v.validUntil || null, ...(photo ? { photoFileId: photo.id } : {}) });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    save.mutate(
      { id: person?.id, body: parsed.data },
      {
        onSuccess: (p) => {
          toast.success(person ? 'Saved' : `${p.name} can now collect ${childName}`);
          onOpenChange(false);
        },
        onError: (err) => setErrors({ form: errorMessage(err) }),
      },
    );
  };
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={person ? `Edit ${person.name}` : `Who else may collect ${childName}?`}
      description="Parents and guardians on record can always collect. Add others here — the gate sees their name, relationship and photo."
      icon={person ? <UserRoundCheck /> : <UserPlus />}
      submitLabel={person ? 'Save' : 'Add to the list'}
      pending={save.isPending}
      onSubmit={submit}
    >
      <div className="grid gap-4">
        <Field label="Full name" htmlFor="pp-name" error={errors.name}>
          <Input id="pp-name" value={v.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} invalid={!!errors.name} autoFocus placeholder="e.g. Ada Okafor" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Relationship" htmlFor="pp-rel" error={errors.relationship}>
            <Input id="pp-rel" value={v.relationship} onChange={(e) => set({ relationship: e.target.value })} maxLength={40} invalid={!!errors.relationship} placeholder="Aunt, Driver, Neighbour…" />
          </Field>
          <Field label="Phone" htmlFor="pp-phone" optional error={errors.phone}>
            <Input id="pp-phone" type="tel" inputMode="tel" value={v.phone} onChange={(e) => set({ phone: e.target.value })} maxLength={20} placeholder="0803 123 4567" />
          </Field>
        </div>
        <Field label="Photo" optional hint="Helps the gate recognise them. Only the school and the child’s parents can see it.">
          <PhotoPicker value={photo} onChange={setPhoto} existing={person ? personPhotoPath(person, as) : null} />
        </Field>
        <Field label="Valid until" htmlFor="pp-until" optional hint="Leave empty to keep them on the list until you remove them." error={errors.validUntil}>
          <Input id="pp-until" type="date" value={v.validUntil} onChange={(e) => set({ validUntil: e.target.value })} className="tabular [color-scheme:light] dark:[color-scheme:dark]" />
        </Field>
        {person && (
          <SwitchRow label="Active" description="Switch off to stop them collecting without deleting them.">
            <Switch checked={v.active} onCheckedChange={(c) => set({ active: c })} />
          </SwitchRow>
        )}
        {errors.form && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{errors.form}</p>}
      </div>
    </FormDialog>
  );
}

/** A compact row for an authorised person. */
export function PersonRow({ p, as, action, className }: { p: AuthorisedPickupRow; as: 'staff' | 'parent'; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', p.expired && 'opacity-60', className)}>
      <PersonPhoto name={p.name} path={personPhotoPath(p, as)} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium">{p.name}</p>
        <p className="truncate text-[12.5px] text-muted-foreground">
          {p.relationship}
          {p.phone ? ` · ${p.phone}` : ''}
          {p.expired ? ' · not active' : p.validUntil ? ` · until ${p.validUntil}` : ''}
        </p>
      </div>
      {action}
    </div>
  );
}
