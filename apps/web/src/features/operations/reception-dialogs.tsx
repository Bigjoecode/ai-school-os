import {
  type AiEnquiryReply,
  type AiText,
  ENQUIRY_SOURCE_LABELS,
  ENQUIRY_SOURCES,
  ENQUIRY_STATUS_LABELS,
  ENQUIRY_STATUSES,
  type EnquiryRow,
  type EnquiryStatus,
  enquirySchema,
  pickupSchema,
  type PickupRow,
  visitorSchema,
} from '@aischool/shared';
import { AlertTriangle, Baby, Check, IdCard, Mail, RefreshCw, ShieldAlert, ShieldCheck, UserCheck } from 'lucide-react';
import { type BaseSyntheticEvent, type FormEvent, useEffect, useState } from 'react';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { aiErrorMessage } from '../finance/api';
import { useCan } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { useEnquiryReply, useRecordPickup, useSaveEnquiry, useSignInVisitor } from './api';
import { apiFieldErrors, CopyBlock, dateInput, FormError, type PickedPerson, Segmented, StaffCombo, StudentCombo, zodErrors } from './ui';

// ------------------------------------------------------------------ visitor

export function VisitorDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const signIn = useSignInVisitor();
  const canStaff = useCan('staff.read');
  const [v, setV] = useState({ name: '', phone: '', organisation: '', purpose: '', hostName: '', badgeNumber: '', vehiclePlate: '' });
  const [hostKind, setHostKind] = useState<'staff' | 'other'>(canStaff ? 'staff' : 'other');
  const [host, setHost] = useState<PickedPerson | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setV({ name: '', phone: '', organisation: '', purpose: '', hostName: '', badgeNumber: '', vehiclePlate: '' });
    setHost(null);
    setHostKind(canStaff ? 'staff' : 'other');
    setErrors({});
  }, [open, canStaff]);
  const set = (p: Partial<typeof v>) => setV((s) => ({ ...s, ...p }));

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const parsed = visitorSchema.safeParse({ ...v, hostStaffId: hostKind === 'staff' ? (host?.id ?? null) : null, hostName: hostKind === 'other' ? v.hostName : null });
    if (!parsed.success) {
      const errs = zodErrors(parsed.error.issues);
      if (errs.name) errs.name = 'Enter the visitor’s name';
      if (errs.purpose) errs.purpose = 'What are they here for?';
      setErrors(errs);
      return;
    }
    setErrors({});
    signIn.mutate(parsed.data, { onSuccess: () => onOpenChange(false), onError: (err) => setErrors(apiFieldErrors(err)) });
  };

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Sign in a visitor" description="They’ll show as on site until they sign out." icon={<UserCheck />} submitLabel="Sign in" pending={signIn.isPending} onSubmit={submit}>
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Name" htmlFor="vs-name" error={errors.name}>
            <Input id="vs-name" value={v.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} invalid={!!errors.name} autoFocus />
          </Field>
          <Field label="Phone" htmlFor="vs-phone" optional>
            <Input id="vs-phone" type="tel" value={v.phone} onChange={(e) => set({ phone: e.target.value })} maxLength={20} />
          </Field>
        </div>
        <Field label="Purpose of visit" htmlFor="vs-purpose" error={errors.purpose}>
          <Input id="vs-purpose" value={v.purpose} onChange={(e) => set({ purpose: e.target.value })} maxLength={200} invalid={!!errors.purpose} placeholder="e.g. Meeting with the class teacher" />
        </Field>
        <Field label="Here to see" htmlFor="vs-host" optional>
          <div className="grid gap-2">
            {canStaff && (
              <Segmented
                size="sm"
                label="Host"
                value={hostKind}
                onChange={setHostKind}
                options={[
                  { value: 'staff', label: 'A member of staff' },
                  { value: 'other', label: 'Someone else' },
                ]}
                className="self-start"
              />
            )}
            {hostKind === 'staff' && canStaff ? (
              <StaffCombo id="vs-host" value={host} onChange={setHost} />
            ) : (
              <Input id="vs-host" value={v.hostName} onChange={(e) => set({ hostName: e.target.value })} maxLength={120} placeholder="e.g. Bursary, or a name" />
            )}
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-3 [&>*]:min-w-0">
          <Field label="Organisation" htmlFor="vs-org" optional>
            <Input id="vs-org" value={v.organisation} onChange={(e) => set({ organisation: e.target.value })} maxLength={120} />
          </Field>
          <Field label="Badge no." htmlFor="vs-badge" optional>
            <Input id="vs-badge" value={v.badgeNumber} onChange={(e) => set({ badgeNumber: e.target.value })} maxLength={20} className="font-mono" />
          </Field>
          <Field label="Vehicle plate" htmlFor="vs-plate" optional>
            <Input id="vs-plate" value={v.vehiclePlate} onChange={(e) => set({ vehiclePlate: e.target.value.toUpperCase() })} maxLength={20} className="font-mono" />
          </Field>
        </div>
        <FormError message={errors.form} />
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ enquiry

const emptyEnquiry = {
  parentName: '',
  phone: '',
  email: '',
  childName: '',
  classOfInterest: '',
  entryTerm: '',
  source: 'WALK_IN' as (typeof ENQUIRY_SOURCES)[number],
  status: 'NEW' as EnquiryStatus,
  question: '',
  notes: '',
  followUpOn: '',
};

export function EnquirySheet({ open, onOpenChange, enquiry }: { open: boolean; onOpenChange: (o: boolean) => void; enquiry: EnquiryRow | null }) {
  const save = useSaveEnquiry(enquiry?.id);
  const [v, setV] = useState(emptyEnquiry);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setV(
      enquiry
        ? {
            parentName: enquiry.parentName,
            phone: enquiry.phone,
            email: enquiry.email ?? '',
            childName: enquiry.childName ?? '',
            classOfInterest: enquiry.classOfInterest ?? '',
            entryTerm: enquiry.entryTerm ?? '',
            source: enquiry.source,
            status: enquiry.status,
            question: enquiry.question ?? '',
            notes: enquiry.notes ?? '',
            followUpOn: enquiry.followUpOn ?? '',
          }
        : emptyEnquiry,
    );
  }, [open, enquiry]);
  const set = (p: Partial<typeof v>) => setV((s) => ({ ...s, ...p }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = enquirySchema.safeParse({ ...v, followUpOn: v.followUpOn || null });
    if (!parsed.success) {
      const errs = zodErrors(parsed.error.issues);
      if (errs.parentName) errs.parentName = 'Enter the parent’s name';
      if (errs.phone) errs.phone = 'Enter a phone number';
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
          <SheetTitle className="font-display text-lg font-semibold tracking-tight">{enquiry ? `Enquiry from ${enquiry.parentName}` : 'Log an enquiry'}</SheetTitle>
          <SheetDescription className="text-[13px] text-muted-foreground">An admissions enquiry from a parent — by phone, in person or online.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form id="enquiry-form" onSubmit={submit} noValidate className="grid gap-5">
            <section className="grid gap-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Parent</h3>
              <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                <Field label="Name" htmlFor="eq-parent" error={errors.parentName}>
                  <Input id="eq-parent" value={v.parentName} onChange={(e) => set({ parentName: e.target.value })} maxLength={120} invalid={!!errors.parentName} autoFocus />
                </Field>
                <Field label="Phone" htmlFor="eq-phone" error={errors.phone}>
                  <Input id="eq-phone" type="tel" value={v.phone} onChange={(e) => set({ phone: e.target.value })} maxLength={20} invalid={!!errors.phone} />
                </Field>
                <Field label="Email" htmlFor="eq-email" optional error={errors.email}>
                  <Input id="eq-email" type="email" value={v.email} onChange={(e) => set({ email: e.target.value })} invalid={!!errors.email} />
                </Field>
                <Field label="How they heard" htmlFor="eq-source">
                  <Select value={v.source} onValueChange={(s) => set({ source: s as typeof v.source })}>
                    <SelectTrigger id="eq-source">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENQUIRY_SOURCES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {ENQUIRY_SOURCE_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </section>
            <section className="grid gap-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Child</h3>
              <div className="grid gap-4 sm:grid-cols-3 [&>*]:min-w-0">
                <Field label="Name" htmlFor="eq-child" optional>
                  <Input id="eq-child" value={v.childName} onChange={(e) => set({ childName: e.target.value })} maxLength={120} />
                </Field>
                <Field label="Class wanted" htmlFor="eq-class" optional>
                  <Input id="eq-class" value={v.classOfInterest} onChange={(e) => set({ classOfInterest: e.target.value })} maxLength={40} placeholder="e.g. JSS 1" />
                </Field>
                <Field label="Starting" htmlFor="eq-entry" optional>
                  <Input id="eq-entry" value={v.entryTerm} onChange={(e) => set({ entryTerm: e.target.value })} maxLength={60} placeholder="e.g. September 2027" />
                </Field>
              </div>
            </section>
            <Field label="Their question" htmlFor="eq-question" optional hint="The AI reply answers this using your real fees and term dates.">
              <Textarea id="eq-question" rows={3} value={v.question} onChange={(e) => set({ question: e.target.value })} maxLength={1000} placeholder="e.g. What are the fees for JSS 1, and do you have a school bus to Ajah?" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
              <Field label="Stage" htmlFor="eq-status">
                <Select value={v.status} onValueChange={(s) => set({ status: s as EnquiryStatus })}>
                  <SelectTrigger id="eq-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENQUIRY_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {ENQUIRY_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Follow up on" htmlFor="eq-follow" optional error={errors.followUpOn}>
                <Input id="eq-follow" type="date" value={v.followUpOn} onChange={(e) => set({ followUpOn: e.target.value })} className={dateInput} />
              </Field>
            </div>
            <Field label="Notes" htmlFor="eq-notes" optional>
              <Textarea id="eq-notes" rows={3} value={v.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={1000} placeholder="Calls made, visit booked, anything to remember" />
            </Field>
            <FormError message={errors.form} />
          </form>
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="enquiry-form" loading={save.isPending}>
            {enquiry ? 'Save changes' : 'Log enquiry'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ------------------------------------------------------------------ AI reply

export function ReplyDialog({ enquiry, onOpenChange }: { enquiry: EnquiryRow | null; onOpenChange: (o: boolean) => void }) {
  const draft = useEnquiryReply();
  const [result, setResult] = useState<(AiEnquiryReply & AiText) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = (id: string) => {
    setError(null);
    draft.mutate(id, { onSuccess: setResult, onError: (err) => setError(aiErrorMessage(err)) });
  };
  useEffect(() => {
    if (!enquiry) return;
    setResult(null);
    run(enquiry.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enquiry?.id]);

  return (
    <Dialog open={!!enquiry} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <div className="mb-2 grid size-10 place-items-center rounded-xl bg-ai-gradient">
            <AiSparkle className="size-5 [&_path]:fill-white" animated={draft.isPending} />
          </div>
          <DialogTitle>Reply to {enquiry?.parentName}</DialogTitle>
          <DialogDescription>Drafted from your real fees and term dates. Nothing is sent — copy it into email or WhatsApp.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {enquiry?.question && <p className="rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-[13px] italic text-muted-foreground">“{enquiry.question}”</p>}
          {draft.isPending && !result ? (
            <div className="space-y-2.5" aria-live="polite" aria-busy>
              <p className="text-[12.5px] text-muted-foreground">Writing a reply… this takes 10–20 seconds.</p>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : error && !result ? (
            <FormError message={error} />
          ) : result ? (
            <div className={cn('space-y-3 transition-opacity', draft.isPending && 'opacity-50')}>
              <CopyBlock title="Subject" text={result.subject} />
              <CopyBlock title="Email" text={result.message} />
              <CopyBlock title="WhatsApp" text={result.whatsappVersion} hint={`${result.whatsappVersion.length} characters`} />
              <p className="text-[11.5px] text-muted-foreground">
                Generated by {result.provider} · {result.model}. Check fees and dates before sending.
              </p>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          {result && enquiry?.email && (
            <Button asChild variant="outline">
              <a href={`mailto:${enquiry.email}?subject=${encodeURIComponent(result.subject)}&body=${encodeURIComponent(result.message)}`}>
                <Mail /> Open in email
              </a>
            </Button>
          )}
          {enquiry && (
            <Button variant="outline" onClick={() => run(enquiry.id)} loading={draft.isPending}>
              {!draft.isPending && <RefreshCw />} Draft again
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ early pick-up

export function OnRecordBadge({ onRecord, className }: { onRecord: boolean; className?: string }) {
  return onRecord ? (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success', className)}>
      <ShieldCheck className="size-3" aria-hidden /> On record
    </span>
  ) : (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning', className)}>
      <ShieldAlert className="size-3" aria-hidden /> Not on record — verify ID
    </span>
  );
}

export function PickupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const record = useRecordPickup();
  const [student, setStudent] = useState<PickedPerson | null>(null);
  const [v, setV] = useState({ collectedBy: '', relationship: '', phone: '', reason: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<PickupRow | null>(null);
  useEffect(() => {
    if (!open) return;
    setStudent(null);
    setV({ collectedBy: '', relationship: '', phone: '', reason: '' });
    setErrors({});
    setDone(null);
  }, [open]);
  const set = (p: Partial<typeof v>) => setV((s) => ({ ...s, ...p }));

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const parsed = pickupSchema.safeParse({ studentId: student?.id ?? '', ...v });
    if (!parsed.success) {
      const errs = zodErrors(parsed.error.issues);
      if (errs.studentId) errs.studentId = 'Choose the student';
      if (errs.collectedBy) errs.collectedBy = 'Who is collecting?';
      if (errs.relationship) errs.relationship = 'e.g. Mother, Uncle, Driver';
      if (errs.reason) errs.reason = 'Why are they leaving early?';
      setErrors(errs);
      return;
    }
    setErrors({});
    record.mutate(parsed.data, {
      onSuccess: (p) => {
        if (p.onRecord) onOpenChange(false);
        else setDone(p);
      },
      onError: (err) => setErrors(apiFieldErrors(err)),
    });
  };

  if (done) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="sm">
          <DialogHeader>
            <div className="mb-2 grid size-12 place-items-center rounded-2xl bg-warning-soft text-warning">
              <AlertTriangle className="size-6" aria-hidden />
            </div>
            <DialogTitle>Not on record — verify their ID</DialogTitle>
            <DialogDescription>
              {done.collectedBy} ({done.relationship}) doesn’t match a parent or guardian on {done.student.name}’s record by name or phone.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ul className="space-y-2 rounded-xl border border-warning/30 bg-warning-soft/40 p-4 text-[13px]">
              <li className="flex items-start gap-2">
                <IdCard className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /> Check a photo ID before the child leaves.
              </li>
              <li className="flex items-start gap-2">
                <Baby className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /> Call a parent on record to confirm they sent this person.
              </li>
            </ul>
            <p className="mt-3 text-[12px] text-muted-foreground">The pick-up has been logged and marked as not on record.</p>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>
              <Check /> I’ve checked
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Record an early pick-up" description="We check the collector against the parents and guardians on record." icon={<Baby />} submitLabel="Record pick-up" pending={record.isPending} onSubmit={submit}>
      <div className="grid gap-4">
        <Field label="Student" htmlFor="pu-student" error={errors.studentId}>
          <StudentCombo id="pu-student" value={student} onChange={setStudent} invalid={!!errors.studentId} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Collected by" htmlFor="pu-by" error={errors.collectedBy}>
            <Input id="pu-by" value={v.collectedBy} onChange={(e) => set({ collectedBy: e.target.value })} maxLength={120} invalid={!!errors.collectedBy} placeholder="Full name" />
          </Field>
          <Field label="Relationship" htmlFor="pu-rel" error={errors.relationship}>
            <Input id="pu-rel" value={v.relationship} onChange={(e) => set({ relationship: e.target.value })} maxLength={40} invalid={!!errors.relationship} placeholder="e.g. Mother" />
          </Field>
          <Field label="Their phone" htmlFor="pu-phone" optional hint="Helps match them to the record">
            <Input id="pu-phone" type="tel" value={v.phone} onChange={(e) => set({ phone: e.target.value })} maxLength={20} />
          </Field>
          <Field label="Reason" htmlFor="pu-reason" error={errors.reason}>
            <Input id="pu-reason" value={v.reason} onChange={(e) => set({ reason: e.target.value })} maxLength={200} invalid={!!errors.reason} placeholder="e.g. Hospital appointment" />
          </Field>
        </div>
        <FormError message={errors.form} />
      </div>
    </FormDialog>
  );
}
