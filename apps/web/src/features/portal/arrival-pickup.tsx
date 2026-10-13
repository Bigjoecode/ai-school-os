import type { AuthorisedPickupRow, PickupNoticeInput, PickupNoticeRow, PortalArrival } from '@aischool/shared';
import { CalendarClock, Clock, DoorOpen, KeyRound, LogIn, LogOut, Pencil, ShieldCheck, Timer, Trash2, UserPlus, Users, XCircle } from 'lucide-react';
import { type BaseSyntheticEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useCancelNotice, usePickupNotice, usePickupPeople, usePortalArrival } from '../gate/api';
import { clock, METHOD_LABEL, noticeText, PersonDialog, PersonRow, PhotoPicker } from '../gate/ui';

const timeInput = 'tabular [color-scheme:light] dark:[color-scheme:dark]';

/** The parent's "Arrival & pick-up" section on a child's page. */
export function ArrivalPickupCard({ childId, firstName }: { childId: string; firstName: string }) {
  const q = usePortalArrival(childId);
  const d = q.data;
  const [dialog, setDialog] = useState<'RUNNING_LATE' | 'PICKUP_TIME' | 'DELEGATE' | null>(null);
  const [personOpen, setPersonOpen] = useState(false);
  const [editing, setEditing] = useState<AuthorisedPickupRow | null>(null);
  const [removing, setRemoving] = useState<AuthorisedPickupRow | null>(null);
  const { remove } = usePickupPeople(childId, 'parent');
  // A school without the gate feature, or someone who isn't this child's parent: say nothing.
  if (q.error instanceof ApiError && (q.error.status === 403 || q.error.status === 404)) return null;
  return (
    <Card className="p-4 sm:p-5" aria-labelledby="ap-title">
      <h2 id="ap-title" className="flex items-center gap-2 font-display text-[15px] font-semibold">
        <DoorOpen className="size-4 text-muted-foreground" aria-hidden /> Arrival & pick-up
      </h2>
      {!d ? (
        <Skeleton className="mt-3 h-24 rounded-xl" />
      ) : (
        <div className="mt-3 space-y-4">
          <TodayStatus d={d} firstName={firstName} />
          {d.notices.length > 0 && (
            <ul className="space-y-2">
              {d.notices.map((n) => (
                <NoticeItem key={n.id} n={n} childId={childId} />
              ))}
            </ul>
          )}
          {!d.leftAt && (
            <div className="grid gap-2 sm:grid-cols-3">
              <Button variant="outline" className="justify-start" onClick={() => setDialog('RUNNING_LATE')}>
                <Timer /> I’m running late
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => setDialog('PICKUP_TIME')}>
                <CalendarClock /> Change pick-up time
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => setDialog('DELEGATE')}>
                <Users /> Someone else will pick up
              </Button>
            </div>
          )}
          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[13px] font-semibold">Who can collect {firstName}</h3>
              <Button variant="ghost" size="sm" onClick={() => { setEditing(null); setPersonOpen(true); }}>
                <UserPlus /> Add
              </Button>
            </div>
            <ul className="space-y-2">
              {d.guardians.map((g) => (
                <li key={g.name} className="flex items-center gap-2 text-[13px]">
                  <ShieldCheck className="size-4 text-success" aria-hidden />
                  <span className="min-w-0 truncate">
                    {g.name} <span className="text-muted-foreground">· {g.relationship} (parent/guardian)</span>
                  </span>
                </li>
              ))}
              {d.authorised.map((p) => (
                <li key={p.id}>
                  <PersonRow
                    p={p}
                    as="parent"
                    action={
                      <span className="flex shrink-0">
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${p.name}`} onClick={() => { setEditing(p); setPersonOpen(true); }}>
                          <Pencil />
                        </Button>
                        {p.active && (
                          <Button variant="ghost" size="icon-sm" aria-label={`Remove ${p.name}`} onClick={() => setRemoving(p)}>
                            <Trash2 />
                          </Button>
                        )}
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {d && dialog && <NoticeDialog kind={dialog} onClose={() => setDialog(null)} childId={childId} firstName={firstName} d={d} />}
      <PersonDialog open={personOpen} onOpenChange={setPersonOpen} studentId={childId} childName={firstName} as="parent" person={editing} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name}?`}
        description={`They will no longer be allowed to collect ${firstName}.`}
        confirmLabel="Remove"
        destructive
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id, { onSuccess: () => setRemoving(null) })}
      />
    </Card>
  );
}

function TodayStatus({ d, firstName }: { d: PortalArrival; firstName: string }) {
  let icon = <Clock className="size-5" aria-hidden />;
  let text: string;
  let tone = 'bg-muted/60 text-muted-foreground';
  if (d.leftAt) {
    icon = <LogOut className="size-5" aria-hidden />;
    text = d.collectedBy ? `Left at ${clock(d.leftAt)} — collected by ${d.collectedBy}` : `Left school at ${clock(d.leftAt)}`;
    tone = 'bg-info-soft text-info';
  } else if (d.arrivedAt) {
    icon = <LogIn className="size-5" aria-hidden />;
    text = `${d.arrivedVia === 'REGISTER' ? 'In school (class register' : `Arrived at ${clock(d.arrivedAt)} (${d.arrivedVia ? METHOD_LABEL[d.arrivedVia] : 'gate'}`})${d.late ? ' · late' : ''}`;
    tone = d.late ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success';
  } else if (d.absent) {
    icon = <XCircle className="size-5" aria-hidden />;
    text = `Marked absent today`;
    tone = 'bg-danger-soft text-danger';
  } else {
    text = d.schoolDay ? `${firstName} hasn’t arrived yet today` : 'Not a school day';
  }
  return (
    <div className={cn('flex items-center gap-3 rounded-xl px-3 py-3', tone)}>
      {icon}
      <div className="min-w-0">
        <p className="text-[14px] font-medium leading-snug">{text}</p>
        <p className="text-[12px] opacity-80">Home time {d.homeTime}</p>
      </div>
    </div>
  );
}

function NoticeItem({ n, childId }: { n: PickupNoticeRow; childId: string }) {
  const cancel = useCancelNotice(childId);
  return (
    <li className="rounded-xl border border-border p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium">{noticeText(n)}</p>
          {n.note && <p className="text-[12.5px] text-muted-foreground">“{n.note}”</p>}
          {n.kind === 'DELEGATE' && n.codeSms && <p className="text-[12px] text-muted-foreground">{n.codeSms === 'QUEUED' || n.codeSms === 'SENT' ? `Code texted to ${n.delegate?.phone ?? 'them'}` : `Not texted (${n.codeSms.replace(/^SKIPPED: /, '')}) — share the code yourself`}</p>}
        </div>
        {!n.codeUsed && (
          <Button variant="ghost" size="sm" onClick={() => cancel.mutate(n.id)} loading={cancel.isPending}>
            Cancel
          </Button>
        )}
      </div>
      {n.code && (
        <div className="mt-2 flex items-center gap-3 rounded-lg bg-brand-soft/60 px-3 py-2">
          <KeyRound className="size-4 text-brand" aria-hidden />
          <span className="font-mono text-[22px] font-semibold tracking-[0.3em] text-brand tabular" aria-label={`Pick-up code ${n.code.split('').join(' ')}`}>
            {n.code}
          </span>
          <Badge variant="outline" className="ml-auto">Today only · once</Badge>
        </div>
      )}
    </li>
  );
}

function NoticeDialog({ kind, onClose, childId, firstName, d }: { kind: 'RUNNING_LATE' | 'PICKUP_TIME' | 'DELEGATE'; onClose: () => void; childId: string; firstName: string; d: PortalArrival }) {
  const send = usePickupNotice(childId);
  const people = d.authorised.filter((p) => !p.expired);
  const [eta, setEta] = useState('');
  const [note, setNote] = useState('');
  const [who, setWho] = useState<string>(people[0]?.id ?? 'new');
  const [delegate, setDelegate] = useState({ name: '', relationship: '', phone: '' });
  const [photo, setPhoto] = useState<{ id: string; preview: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<{ code: string | null; message: string } | null>(null);
  useEffect(() => setError(null), [who]);

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    if (code) return onClose();
    setError(null);
    let body: PickupNoticeInput;
    if (kind === 'DELEGATE') {
      body = {
        kind,
        authorisedPickupId: who === 'new' ? null : who,
        delegate: who === 'new' ? { name: delegate.name.trim(), relationship: delegate.relationship.trim(), phone: delegate.phone.trim(), photoFileId: photo?.id ?? null } : null,
        eta: eta || null,
        note: note.trim() || null,
      };
      if (who === 'new' && (delegate.name.trim().length < 2 || delegate.relationship.trim().length < 2 || delegate.phone.trim().length < 7)) {
        setError('Enter their name, relationship and phone number');
        return;
      }
    } else {
      if (!eta) {
        setError(kind === 'RUNNING_LATE' ? 'About what time will you get there?' : 'Choose the new pick-up time');
        return;
      }
      body = { kind, eta, note: note.trim() || null };
    }
    send.mutate(body, {
      onSuccess: (r) => {
        if (kind === 'DELEGATE') setCode({ code: r.notice.code, message: r.message });
        else {
          toast.success(r.message);
          onClose();
        }
      },
      onError: (err) => setError(errorMessage(err)),
    });
  };

  const titles = { RUNNING_LATE: 'I’m running late', PICKUP_TIME: 'Change today’s pick-up time', DELEGATE: `Someone else will collect ${firstName} today` };
  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={code ? 'Pick-up code' : titles[kind]}
      description={code ? code.message : kind === 'DELEGATE' ? 'They’ll get a one-time code by text. The gate checks it, once, today only.' : 'The class teacher and the gate will see this.'}
      icon={kind === 'DELEGATE' ? <Users /> : <Clock />}
      submitLabel={code ? 'Done' : 'Send to the school'}
      pending={send.isPending}
      onSubmit={submit}
    >
      {code ? (
        <div className="grid place-items-center gap-2 py-4 text-center">
          <span className="font-mono text-[40px] font-semibold tracking-[0.3em] text-brand tabular">{code.code}</span>
          <p className="text-[13px] text-muted-foreground">You can see this code again on {firstName}’s page today.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {kind === 'DELEGATE' && (
            <div className="grid gap-2" role="radiogroup" aria-label="Who is collecting">
              {people.map((p) => (
                <label key={p.id} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border p-2.5', who === p.id ? 'border-brand bg-brand-soft/50' : 'border-border')}>
                  <input type="radio" name="who" className="sr-only" checked={who === p.id} onChange={() => setWho(p.id)} />
                  <PersonRow p={p} as="parent" className="flex-1" />
                </label>
              ))}
              <label className={cn('flex cursor-pointer items-center gap-3 rounded-xl border p-3', who === 'new' ? 'border-brand bg-brand-soft/50' : 'border-border')}>
                <input type="radio" name="who" className="sr-only" checked={who === 'new'} onChange={() => setWho('new')} />
                <UserPlus className="size-5 text-muted-foreground" aria-hidden />
                <span className="text-[14px] font-medium">Someone new, just for today</span>
              </label>
              {who === 'new' && (
                <div className="grid gap-3 rounded-xl bg-muted/40 p-3">
                  <Input aria-label="Their full name" placeholder="Their full name" value={delegate.name} onChange={(e) => setDelegate({ ...delegate, name: e.target.value })} maxLength={120} />
                  <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
                    <Input aria-label="Relationship" placeholder="Relationship (e.g. Neighbour)" value={delegate.relationship} onChange={(e) => setDelegate({ ...delegate, relationship: e.target.value })} maxLength={40} />
                    <Input aria-label="Their phone number" type="tel" inputMode="tel" placeholder="Their phone, e.g. 0803 123 4567" value={delegate.phone} onChange={(e) => setDelegate({ ...delegate, phone: e.target.value })} maxLength={20} />
                  </div>
                  <PhotoPicker value={photo} onChange={setPhoto} />
                </div>
              )}
            </div>
          )}
          <Field label={kind === 'RUNNING_LATE' ? 'I’ll get there at about' : kind === 'PICKUP_TIME' ? 'New pick-up time' : 'Pick-up time'} htmlFor="pn-eta" optional={kind === 'DELEGATE'}>
            <Input id="pn-eta" type="time" value={eta} onChange={(e) => setEta(e.target.value)} className={timeInput} />
          </Field>
          <Field label="Note for the school" htmlFor="pn-note" optional>
            <Input id="pn-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={kind === 'RUNNING_LATE' ? 'e.g. Stuck in traffic at Ojota' : ''} />
          </Field>
          {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger" role="alert">{error}</p>}
        </div>
      )}
    </FormDialog>
  );
}
