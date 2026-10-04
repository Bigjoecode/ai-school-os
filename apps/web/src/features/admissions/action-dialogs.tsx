import {
  admissionDecisionSchema,
  applicationFeeSchema,
  examScoreSchema,
  makeOfferSchema,
  scheduleAssessmentSchema,
  type AdmissionDetail,
} from '@aischool/shared';
import { Award, CalendarClock, CircleSlash, Hourglass, LogOut, MessageSquare, Wallet } from 'lucide-react';
import { type BaseSyntheticEvent, type ReactNode, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Field } from '@/components/ui/field';
import { FormDialog, SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { addDaysIso, money, schoolToday } from '../finance/ui';
import { apiFieldErrors, dateInput, FormError, Segmented, zodErrors } from '../operations/ui';
import { useAdmissionsMeta, useApplicationAction } from './api';
import { fromLocalInputValue, toLocalInputValue } from './ui';

export type ActionKind = 'schedule' | 'score' | 'offer' | 'waitlist' | 'reject' | 'withdraw' | 'fee';

interface Props {
  a: AdmissionDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

/** "Tell the parent" switch, explaining what will (or can't) be sent. */
function NotifyRow({ a, value, onChange, what }: { a: AdmissionDetail; value: boolean; onChange: (v: boolean) => void; what: string }) {
  const meta = useAdmissionsMeta();
  const channels = (meta.data?.settings.notifyChannels ?? []).filter((c) => (c === 'EMAIL' ? !!a.parentEmail : true));
  if (meta.data && channels.length === 0) {
    return <p className="text-[12px] text-muted-foreground">Parents aren’t messaged automatically — turn on SMS or email in Admissions settings.</p>;
  }
  return (
    <SwitchRow label={`Tell ${a.parentName.split(' ').slice(0, 2).join(' ')}`} description={`${what} by ${channels.map((c) => (c === 'SMS' ? 'SMS' : 'email')).join(' and ')}`}>
      <Switch checked={value} onCheckedChange={onChange} aria-label="Send a message to the parent" />
    </SwitchRow>
  );
}

function useAction(a: AdmissionDetail, onDone: () => void) {
  const action = useApplicationAction(a.id);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const run = (body: Parameters<typeof action.mutate>[0], success: string) =>
    action.mutate(body, {
      onSuccess: () => {
        toast.success(success);
        onDone();
      },
      onError: (err) => setErrors(apiFieldErrors(err)),
    });
  return { pending: action.isPending, errors, setErrors, run };
}

// ------------------------------------------------------------------ schedule

export function ScheduleDialog({ a, open, onOpenChange }: Props) {
  const { pending, errors, setErrors, run } = useAction(a, () => onOpenChange(false));
  const [kind, setKind] = useState<'exam' | 'interview' | 'both'>('exam');
  const [examAt, setExamAt] = useState('');
  const [venue, setVenue] = useState('');
  const [interviewAt, setInterviewAt] = useState('');
  const [notify, setNotify] = useState(true);
  useEffect(() => {
    if (!open) return;
    setKind(a.status === 'EXAM_SCHEDULED' && a.interviewAt ? 'both' : a.status === 'EXAM_SCHEDULED' || !a.interviewAt ? 'exam' : 'interview');
    setExamAt(toLocalInputValue(a.examAt));
    setVenue(a.examVenue ?? '');
    setInterviewAt(toLocalInputValue(a.interviewAt));
    setNotify(true);
    setErrors({});
  }, [open, a, setErrors]);

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const exam = kind !== 'interview' ? fromLocalInputValue(examAt) : null;
    const interview = kind !== 'exam' ? fromLocalInputValue(interviewAt) : null;
    const errs: Record<string, string> = {};
    if (kind !== 'interview' && !exam) errs.examAt = 'Choose the exam date and time';
    if (kind !== 'exam' && !interview) errs.interviewAt = 'Choose the interview date and time';
    if ((exam && new Date(exam) < new Date()) || (interview && new Date(interview) < new Date())) errs.form = 'That time has already passed';
    const parsed = scheduleAssessmentSchema.safeParse({ examAt: exam, examVenue: kind !== 'interview' ? venue : null, interviewAt: interview, notify });
    if (Object.keys(errs).length || !parsed.success) {
      setErrors({ ...(parsed.success ? {} : zodErrors(parsed.error.issues)), ...errs });
      return;
    }
    run({ kind: 'schedule', body: parsed.data }, kind === 'interview' ? 'Interview booked' : 'Entrance exam booked');
  };

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Book an entrance exam or interview" description={`${a.childName} · ${a.number}`} icon={<CalendarClock />} submitLabel="Book" pending={pending} onSubmit={submit}>
      <div className="grid gap-4">
        <Segmented
          label="What to book"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'exam', label: 'Entrance exam' },
            { value: 'interview', label: 'Interview' },
            { value: 'both', label: 'Both' },
          ]}
          className="self-start"
        />
        {kind !== 'interview' && (
          <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
            <Field label="Exam date and time" htmlFor="sd-exam" error={errors.examAt}>
              <Input id="sd-exam" type="datetime-local" value={examAt} onChange={(e) => setExamAt(e.target.value)} className={dateInput} invalid={!!errors.examAt} />
            </Field>
            <Field label="Venue" htmlFor="sd-venue" optional>
              <Input id="sd-venue" value={venue} onChange={(e) => setVenue(e.target.value)} maxLength={160} placeholder="e.g. Main hall" />
            </Field>
          </div>
        )}
        {kind !== 'exam' && (
          <Field label="Interview date and time" htmlFor="sd-interview" error={errors.interviewAt}>
            <Input id="sd-interview" type="datetime-local" value={interviewAt} onChange={(e) => setInterviewAt(e.target.value)} className={dateInput} invalid={!!errors.interviewAt} />
          </Field>
        )}
        <NotifyRow a={a} value={notify} onChange={setNotify} what="Sends the date, time and venue" />
        <FormError message={errors.form} />
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ score

export function ScoreDialog({ a, open, onOpenChange }: Props) {
  const { pending, errors, setErrors, run } = useAction(a, () => onOpenChange(false));
  const [score, setScore] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!open) return;
    setScore(a.examScore != null ? String(a.examScore) : '');
    setNote('');
    setErrors({});
  }, [open, a, setErrors]);
  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const parsed = examScoreSchema.safeParse({ examScore: score.trim() === '' ? NaN : Number(score), note });
    if (!parsed.success) {
      setErrors({ examScore: 'Enter the score, e.g. 72 or 72.5' });
      return;
    }
    run({ kind: 'score', body: parsed.data }, 'Score recorded');
  };
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Record the entrance exam score" description={`${a.childName} · ${a.number}`} icon={<Award />} submitLabel="Save score" pending={pending} onSubmit={submit} size="sm">
      <div className="grid gap-4">
        <Field label="Score" htmlFor="sc-score" error={errors.examScore} hint="Out of whatever your exam is marked over — usually 100">
          <Input id="sc-score" inputMode="decimal" value={score} onChange={(e) => setScore(e.target.value.replace(/[^\d.]/g, '').slice(0, 6))} className="w-32 tabular" invalid={!!errors.examScore} autoFocus />
        </Field>
        <Field label="Comment" htmlFor="sc-note" optional>
          <Textarea id="sc-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="e.g. Strong in maths; reading below class level" />
        </Field>
        <FormError message={errors.form} />
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ offer

export function OfferDialog({ a, open, onOpenChange }: Props) {
  const meta = useAdmissionsMeta();
  const { pending, errors, setErrors, run } = useAction(a, () => onOpenChange(false));
  const [by, setBy] = useState('');
  const [classLevelId, setClassLevelId] = useState('');
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);
  const days = meta.data?.settings.offerValidDays ?? 14;
  useEffect(() => {
    if (!open) return;
    setBy(a.offerExpiresOn ?? addDaysIso(schoolToday(), days));
    setClassLevelId(a.classLevel?.id ?? '');
    setNote(a.status === 'OFFERED' ? (a.decisionNote ?? '') : '');
    setNotify(true);
    setErrors({});
  }, [open, a, days, setErrors]);
  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const parsed = makeOfferSchema.safeParse({ offerExpiresOn: by, note, classLevelId: classLevelId || null, notify });
    if (!parsed.success) {
      const errs = zodErrors(parsed.error.issues);
      if (errs.offerExpiresOn) errs.offerExpiresOn = 'Choose the acceptance deadline';
      setErrors(errs);
      return;
    }
    if (!classLevelId) {
      setErrors({ classLevelId: 'Choose the class you are offering' });
      return;
    }
    run({ kind: 'offer', body: parsed.data }, a.status === 'OFFERED' ? 'Offer updated' : 'Place offered');
  };
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={a.status === 'OFFERED' ? 'Update the offer' : 'Offer a place'} description={`${a.childName} · ${a.number}`} icon={<Award />} submitLabel={a.status === 'OFFERED' ? 'Update offer' : 'Make offer'} pending={pending} onSubmit={submit}>
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Class offered" htmlFor="of-class" error={errors.classLevelId}>
            <Select value={classLevelId || NONE} onValueChange={(v) => v && setClassLevelId(v === NONE ? '' : v)}>
              <SelectTrigger id="of-class">
                <SelectValue placeholder="Choose a class…" />
              </SelectTrigger>
              <SelectContent>
                {meta.data?.classLevels.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Accept by" htmlFor="of-by" error={errors.offerExpiresOn}>
            <Input id="of-by" type="date" value={by} min={schoolToday()} onChange={(e) => setBy(e.target.value)} className={dateInput} invalid={!!errors.offerExpiresOn} />
          </Field>
        </div>
        <Field label="Note to the parent" htmlFor="of-note" optional hint="Printed on the offer letter and included in the message — resumption date, what to bring, conditions">
          <Textarea id="of-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </Field>
        <NotifyRow a={a} value={notify} onChange={setNotify} what="Sends the offer and the deadline" />
        <FormError message={errors.form} />
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ decision

export function DecisionDialog({ a, open, onOpenChange, outcome }: Props & { outcome: 'WAITLISTED' | 'REJECTED' }) {
  const { pending, errors, setErrors, run } = useAction(a, () => onOpenChange(false));
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);
  useEffect(() => {
    if (!open) return;
    setNote('');
    setNotify(true);
    setErrors({});
  }, [open, setErrors]);
  const waitlist = outcome === 'WAITLISTED';
  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const parsed = admissionDecisionSchema.safeParse({ outcome, note, notify });
    if (!parsed.success) return setErrors(zodErrors(parsed.error.issues));
    run({ kind: 'decision', body: parsed.data }, waitlist ? 'Added to the waiting list' : 'Marked as not offered');
  };
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={waitlist ? 'Put on the waiting list' : 'Don’t offer a place'}
      description={`${a.childName} · ${a.number}`}
      icon={waitlist ? <Hourglass /> : <CircleSlash />}
      submitLabel={waitlist ? 'Add to waiting list' : 'Confirm decision'}
      pending={pending}
      onSubmit={submit}
      size="sm"
    >
      <div className="grid gap-4">
        <Field label="Reason (for staff)" htmlFor="dc-note" optional hint="Kept on the record. The parent gets a standard, courteous message.">
          <Textarea id="dc-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder={waitlist ? 'e.g. JSS 1 is full; offer if a place opens' : 'e.g. Below the entrance mark'} />
        </Field>
        <NotifyRow a={a} value={notify} onChange={setNotify} what={waitlist ? 'Explains they are on the waiting list' : 'Thanks them and gives the outcome'} />
        <FormError message={errors.form} />
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ withdraw

export function WithdrawDialog({ a, open, onOpenChange }: Props) {
  const { pending, errors, setErrors, run } = useAction(a, () => onOpenChange(false));
  const [note, setNote] = useState('');
  useEffect(() => {
    if (open) {
      setNote('');
      setErrors({});
    }
  }, [open, setErrors]);
  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    run({ kind: 'move', body: { status: 'WITHDRAWN', note: note.trim() || null } }, 'Application withdrawn');
  };
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Withdraw this application?" description="Use this when the family decides not to continue. It can be reopened later." icon={<LogOut />} submitLabel="Withdraw" pending={pending} onSubmit={submit} size="sm">
      <div className="grid gap-4">
        <Field label="Reason" htmlFor="wd-note" optional>
          <Textarea id="wd-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="e.g. Family relocating to Abuja" />
        </Field>
        <FormError message={errors.form} />
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ fee

export function FeeDialog({ a, open, onOpenChange }: Props) {
  const meta = useAdmissionsMeta();
  const { pending, errors, setErrors, run } = useAction(a, () => onOpenChange(false));
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState('');
  useEffect(() => {
    if (open) {
      setReference('');
      setPaidOn(schoolToday());
      setErrors({});
    }
  }, [open, setErrors]);
  const amount = a.applicationFeeKobo ?? meta.data?.settings.applicationFeeKobo ?? 0;
  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const parsed = applicationFeeSchema.safeParse({ reference, paidOn: paidOn || null });
    if (!parsed.success) return setErrors(zodErrors(parsed.error.issues));
    run({ kind: 'fee', body: parsed.data }, 'Application fee recorded');
  };
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record the application fee"
      description={meta.data ? `${money(amount, meta.data.currency)} for ${a.number}` : a.number}
      icon={<Wallet />}
      submitLabel="Record payment"
      pending={pending}
      onSubmit={submit}
      size="sm"
    >
      <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="Receipt or transfer reference" htmlFor="fe-ref" error={errors.reference} className="sm:col-span-2">
          <Input id="fe-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} invalid={!!errors.reference} autoFocus placeholder="e.g. Bursary receipt 0412" />
        </Field>
        <Field label="Paid on" htmlFor="fe-on">
          <Input id="fe-on" type="date" value={paidOn} max={schoolToday()} onChange={(e) => setPaidOn(e.target.value)} className={dateInput} />
        </Field>
        <div className="sm:col-span-2">
          <FormError message={errors.form} />
        </div>
      </div>
    </FormDialog>
  );
}

export function ActionHint({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[12.5px] text-muted-foreground">
      <MessageSquare className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {children}
    </p>
  );
}
