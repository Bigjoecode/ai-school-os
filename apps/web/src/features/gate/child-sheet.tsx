import type { CollectInput, GateChild, PickupNoticeRow } from '@aischool/shared';
import { AlertTriangle, Check, KeyRound, LogIn, LogOut, Pencil, ShieldAlert, ShieldCheck, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api';
import { cn, initialsFromName } from '@/lib/utils';
import { useCancelPass, useCollect, useGateChild, useScan } from './api';
import { clock, METHOD_LABEL, NoticeBadge, noticePhotoPath, PersonDialog, PersonPhoto, PersonRow } from './ui';
import type { AuthorisedPickupRow } from '@aischool/shared';

type Choice = { type: 'GUARDIAN'; id: string } | { type: 'AUTHORISED'; id: string } | { type: 'CODE'; notice: PickupNoticeRow } | { type: 'OTHER' };

/** One child at the gate: status, today's notices, who may collect, and recording the collection. */
export function ChildSheet({ id, onOpenChange }: { id: string | null; onOpenChange: (open: boolean) => void }) {
  const q = useGateChild(id);
  const c = q.data;
  return (
    <Sheet open={!!id} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        {!c ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : (
          <ChildBody key={c.id} c={c} onDone={() => onOpenChange(false)} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function ChildBody({ c, onDone }: { c: GateChild; onDone: () => void }) {
  const scan = useScan();
  const collect = useCollect();
  const cancelPass = useCancelPass();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [code, setCode] = useState('');
  const [other, setOther] = useState({ name: '', relationship: '', phone: '', overrideReason: '' });
  const [early, setEarly] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [personOpen, setPersonOpen] = useState(false);
  const [editing, setEditing] = useState<AuthorisedPickupRow | null>(null);
  const inSchool = !!c.arrivedAt && !c.leftAt;
  const delegate = c.notices.find((n) => n.kind === 'DELEGATE' && !n.codeUsed);
  useEffect(() => {
    if (delegate?.needsCode) setChoice({ type: 'CODE', notice: delegate });
  }, [delegate]);

  const manual = (type: 'ARRIVE' | 'LEAVE') =>
    scan.mutate(
      { studentId: c.id, type },
      {
        onSuccess: (r) => toast.success(r.message),
        onError: (err) => toast.error(errorMessage(err)),
      },
    );

  const submit = () => {
    if (!choice) return;
    setError(null);
    const by: CollectInput['by'] =
      choice.type === 'GUARDIAN'
        ? { type: 'GUARDIAN', guardianId: choice.id }
        : choice.type === 'AUTHORISED'
          ? { type: 'AUTHORISED', authorisedPickupId: choice.id }
          : choice.type === 'CODE'
            ? { type: 'CODE', noticeId: choice.notice.id, code: code.trim() }
            : { type: 'OTHER', name: other.name.trim(), relationship: other.relationship.trim(), phone: other.phone.trim() || null, overrideReason: other.overrideReason.trim() };
    collect.mutate(
      { studentId: c.id, kind: early ? 'EARLY' : 'END_OF_DAY', reason: early ? reason.trim() || null : null, by },
      {
        onSuccess: (r) => {
          toast.success(r.message, { description: 'The parents have been told.' });
          onDone();
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };

  const pick = (ch: Choice) => {
    setChoice(ch);
    setError(null);
  };
  const selected = (ch: Choice) =>
    !!choice && choice.type === ch.type && (ch.type === 'OTHER' || (ch.type === 'CODE' ? choice.type === 'CODE' && choice.notice.id === ch.notice.id : 'id' in choice && 'id' in ch && choice.id === ch.id));

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-3 pr-8">
          <Avatar name={c.name} initials={initialsFromName(c.name)} src={c.photoUrl ?? undefined} size="xl" />
          <div className="min-w-0">
            <SheetTitle className="truncate font-display text-lg font-semibold">{c.name}</SheetTitle>
            <SheetDescription className="text-[13px] text-muted-foreground">{c.classArm ?? 'No class'}</SheetDescription>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {c.leftAt ? (
                <Badge variant="secondary">Left {clock(c.leftAt)}</Badge>
              ) : c.arrivedAt ? (
                <Badge variant={c.late ? 'warning' : 'success'} dot>
                  In school since {clock(c.arrivedAt)}
                  {c.late ? ' · late' : ''}
                </Badge>
              ) : (
                <Badge variant="outline">Not arrived</Badge>
              )}
              {c.arrivedVia && <Badge variant="outline">{METHOD_LABEL[c.arrivedVia].replace(/^./, (x) => x.toUpperCase())}</Badge>}
            </div>
          </div>
        </div>
      </SheetHeader>
      <SheetBody className="space-y-5">
        {c.notices.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">From the parents today</h3>
            {c.notices.map((n) => (
              <div key={n.id} className="space-y-1">
                <NoticeBadge n={n} />
                {n.note && <p className="pl-1 text-[12.5px] text-muted-foreground">“{n.note}”</p>}
              </div>
            ))}
          </section>
        )}

        {!c.arrivedAt && (
          <Button className="w-full" onClick={() => manual('ARRIVE')} loading={scan.isPending}>
            <LogIn /> Sign in (arrived)
          </Button>
        )}
        {c.leftAt && <p className="rounded-lg bg-muted/50 px-3 py-2 text-[13px] text-muted-foreground">{c.collectedBy ? `Collected by ${c.collectedBy} at ${clock(c.leftAt)}.` : `Left at ${clock(c.leftAt)}.`}</p>}

        {inSchool && (
          <section className="space-y-2">
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Who is collecting?</h3>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
              {delegate && (
                <Option on={!!choice && selected({ type: 'CODE', notice: delegate })} onClick={() => pick({ type: 'CODE', notice: delegate })}>
                  <PersonPhoto name={delegate.delegate?.name ?? 'Delegate'} path={noticePhotoPath(delegate, 'staff')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{delegate.delegate?.name}</span>
                    <span className="block text-[12.5px] text-muted-foreground">
                      {delegate.delegate?.relationship} · named by the parent today{delegate.needsCode ? ' · ask for the 6-digit code' : ''}
                    </span>
                  </span>
                  <KeyRound className="size-4 text-info" aria-hidden />
                </Option>
              )}
              {c.guardians.map((g) => (
                <Option key={g.id} on={selected({ type: 'GUARDIAN', id: g.id })} onClick={() => pick({ type: 'GUARDIAN', id: g.id })}>
                  <Avatar name={g.name} initials={initialsFromName(g.name)} size="lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{g.name}</span>
                    <span className="block truncate text-[12.5px] text-muted-foreground">
                      {g.relationship} · parent/guardian{g.phone ? ` · ${g.phone}` : ''}
                    </span>
                  </span>
                  <ShieldCheck className="size-4 text-success" aria-hidden />
                </Option>
              ))}
              {c.authorised
                .filter((p) => !p.expired)
                .map((p) => (
                  <Option key={p.id} on={selected({ type: 'AUTHORISED', id: p.id })} onClick={() => pick({ type: 'AUTHORISED', id: p.id })}>
                    <PersonRow p={p} as="staff" className="flex-1" action={<ShieldCheck className="size-4 text-success" aria-hidden />} />
                  </Option>
                ))}
              <Option on={choice?.type === 'OTHER'} onClick={() => pick({ type: 'OTHER' })}>
                <span className="grid size-12 place-items-center rounded-full bg-danger-soft text-danger">
                  <ShieldAlert className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium">Someone not on the list</span>
                  <span className="block text-[12.5px] text-muted-foreground">Needs a reason; recorded in the audit log</span>
                </span>
              </Option>
            </div>

            {choice?.type === 'CODE' && (
              <Field label="One-time pick-up code" htmlFor="gc-code" hint="Sent to them by text (and shown to the parent). Works once, today only.">
                <Input id="gc-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="text-center font-mono text-xl tracking-[0.4em]" placeholder="••••••" />
              </Field>
            )}
            {choice?.type === 'OTHER' && (
              <div className="space-y-3 rounded-xl border border-danger/30 bg-danger-soft/40 p-3">
                <p className="flex items-start gap-2 text-[13px] text-danger">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> This person is not authorised to collect {c.firstName}. Only continue if the parent has confirmed it (e.g. by phone).
                </p>
                <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
                  <Input aria-label="Their name" placeholder="Their name" value={other.name} onChange={(e) => setOther({ ...other, name: e.target.value })} maxLength={120} />
                  <Input aria-label="Relationship" placeholder="Relationship" value={other.relationship} onChange={(e) => setOther({ ...other, relationship: e.target.value })} maxLength={40} />
                </div>
                <Input aria-label="Their phone" type="tel" placeholder="Their phone (optional)" value={other.phone} onChange={(e) => setOther({ ...other, phone: e.target.value })} maxLength={20} />
                <Textarea aria-label="Reason for the override" placeholder="Why are you releasing the child? e.g. Mother phoned at 2:05 and confirmed" value={other.overrideReason} onChange={(e) => setOther({ ...other, overrideReason: e.target.value })} maxLength={300} rows={2} />
              </div>
            )}
            <label className="flex items-center gap-2 pt-1 text-[13px]">
              <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={early} onChange={(e) => setEarly(e.target.checked)} /> Early pick-up (before home time)
            </label>
            {early && <Input aria-label="Reason for the early pick-up" placeholder="Reason, e.g. hospital appointment" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />}
            {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger" role="alert">{error}</p>}
          </section>
        )}

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Pick-up list</h3>
            <Button variant="ghost" size="sm" onClick={() => { setEditing(null); setPersonOpen(true); }}>
              <UserPlus /> Add
            </Button>
          </div>
          {c.authorised.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Only the parents and guardians on record.</p>
          ) : (
            c.authorised.map((p) => (
              <PersonRow
                key={p.id}
                p={p}
                as="staff"
                action={
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${p.name}`} onClick={() => { setEditing(p); setPersonOpen(true); }}>
                    <Pencil />
                  </Button>
                }
              />
            ))
          )}
        </section>
        <Button variant="link" size="sm" className="text-muted-foreground" loading={cancelPass.isPending} onClick={() => window.confirm(`Cancel ${c.firstName}’s gate pass? The old card stops working.`) && cancelPass.mutate(c.id)}>
          Pass lost? Cancel {c.firstName}’s gate pass
        </Button>
      </SheetBody>
      {inSchool && (
        <SheetFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => manual('LEAVE')} loading={scan.isPending} className="w-full sm:mr-auto sm:w-auto">
            <LogOut /> Left on their own
          </Button>
          <Button onClick={submit} disabled={!choice || (choice.type === 'CODE' && code.length !== 6)} loading={collect.isPending} className="w-full sm:w-auto">
            <Check /> Release to {choice?.type === 'OTHER' ? 'this person' : 'the selected person'}
          </Button>
        </SheetFooter>
      )}
      <PersonDialog open={personOpen} onOpenChange={setPersonOpen} studentId={c.id} childName={c.firstName} as="staff" person={editing} />
    </>
  );
}

function Option({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'flex w-full min-w-0 items-center gap-3 rounded-xl border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        on ? 'border-brand bg-brand-soft/50' : 'border-border bg-card hover:bg-muted/50',
      )}
    >
      {children}
    </button>
  );
}
