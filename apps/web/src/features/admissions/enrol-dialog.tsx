import { enrolApplicantSchema, type AdmissionDetail, type EnrolResult } from '@aischool/shared';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, GraduationCap, KeyRound, Receipt, UserCheck, UserPlus } from 'lucide-react';
import { type BaseSyntheticEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useCan } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { CopyButton, money, schoolToday } from '../finance/ui';
import { apiFieldErrors, dateInput, FormError, zodErrors } from '../operations/ui';
import { useAdmissionsMeta, useEnrol, useEnrolPreview } from './api';

const STEPS = ['Class', 'Parent', 'Fees & finish'] as const;

/** Applicant → student: class, admission number, parent (new or matched), portal login, first invoice. */
export function EnrolDialog({ a, open, onOpenChange }: { a: AdmissionDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const preview = useEnrolPreview(a.id, open);
  const meta = useAdmissionsMeta();
  const enrol = useEnrol(a.id);
  const canFinance = useCan('finance.read');
  const [step, setStep] = useState(0);
  const [armId, setArmId] = useState('');
  const [admissionNumber, setAdmissionNumber] = useState('');
  const [admittedOn, setAdmittedOn] = useState('');
  const [guardianId, setGuardianId] = useState<string | null>(null);
  const [g, setG] = useState({ firstName: '', lastName: '', relationship: '', phone: '', email: '' });
  const [createLogin, setCreateLogin] = useState(false);
  const [raiseInvoice, setRaiseInvoice] = useState(true);
  const [termId, setTermId] = useState('');
  const [notify, setNotify] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<EnrolResult | null>(null);
  const p = preview.data;

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setResult(null);
    setErrors({});
    setAdmissionNumber('');
    setAdmittedOn(schoolToday());
    setNotify(true);
  }, [open]);
  useEffect(() => {
    if (!open || !p) return;
    const roomy = p.arms.find((x) => x.capacity == null || x.students < x.capacity) ?? p.arms[0];
    setArmId(roomy?.id ?? '');
    const match = p.guardianMatches.find((m) => m.matchedOn !== 'email') ?? p.guardianMatches[0];
    setGuardianId(match?.id ?? null);
    setG({ ...p.suggestedGuardian, email: p.suggestedGuardian.email ?? '' });
    setCreateLogin(!!p.suggestedGuardian.email && !(match?.hasLogin ?? false));
    setRaiseInvoice(!!p.fees);
    setTermId(p.fees?.termId ?? meta.data?.terms.find((t) => t.isCurrent)?.id ?? '');
  }, [open, p, meta.data]);

  const arm = p?.arms.find((x) => x.id === armId);
  const matched = p?.guardianMatches.find((m) => m.id === guardianId) ?? null;
  const loginEmail = matched ? matched.email : g.email.trim();
  const fees = useMemo(() => (p?.fees && (!termId || p.fees.termId === termId) ? p.fees : null), [p, termId]);
  const currency = meta.data?.currency ?? 'NGN';

  const next = () => {
    if (step === 0 && !armId) return setErrors({ classArmId: 'Choose a class' });
    if (step === 1 && !guardianId) {
      const parsed = enrolApplicantSchema.shape.guardian.safeParse({ ...g, email: g.email || null });
      if (!parsed.success) return setErrors(zodErrors(parsed.error.issues));
    }
    setErrors({});
    setStep((s) => Math.min(2, s + 1));
  };

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    if (step < 2) return next();
    const parsed = enrolApplicantSchema.safeParse({
      classArmId: armId,
      admissionNumber: admissionNumber.trim() || null,
      admittedOn: admittedOn || null,
      guardianId,
      guardian: { ...g, email: g.email || null },
      createLogin: createLogin && !!loginEmail && !matched?.hasLogin,
      raiseInvoice,
      termId: raiseInvoice ? termId || null : null,
      notify,
    });
    if (!parsed.success) return setErrors(zodErrors(parsed.error.issues));
    setErrors({});
    enrol.mutate(parsed.data, { onSuccess: setResult, onError: (err) => setErrors(apiFieldErrors(err)) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {result ? (
          <Done result={result} currency={currency} onClose={() => onOpenChange(false)} canFinance={canFinance} />
        ) : (
          <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
            <DialogHeader>
              <div className="mb-2 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand [&_svg]:size-5">
                <GraduationCap />
              </div>
              <DialogTitle>Enrol {a.childFirstName}</DialogTitle>
              <DialogDescription>
                {a.childName} · {a.number}
              </DialogDescription>
              <ol className="mt-3 flex items-center gap-2 text-[12px]" aria-label="Steps">
                {STEPS.map((s, i) => (
                  <li key={s} className={cn('flex items-center gap-1.5', i === step ? 'font-semibold text-foreground' : 'text-muted-foreground')} aria-current={i === step ? 'step' : undefined}>
                    <span className={cn('grid size-5 place-items-center rounded-full text-[11px] tabular', i < step ? 'bg-success text-white' : i === step ? 'bg-brand text-brand-foreground' : 'bg-muted')}>{i + 1}</span>
                    <span className={cn(i !== step && 'hidden sm:inline')}>{s}</span>
                    {i < STEPS.length - 1 && <span className="mx-1 h-px w-4 bg-border sm:w-6" aria-hidden />}
                  </li>
                ))}
              </ol>
            </DialogHeader>
            <DialogBody>
              {!p ? (
                preview.error ? (
                  <FormError message={preview.error.message} />
                ) : (
                  <div className="space-y-3" aria-busy>
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-2/3" />
                  </div>
                )
              ) : step === 0 ? (
                <div className="grid gap-4">
                  <Field label="Class" htmlFor="en-arm" error={errors.classArmId} hint={a.classLevel ? `Arms of ${a.classLevel.name}` : 'No class chosen on the application, so every class is listed'}>
                    <Select value={armId || NONE} onValueChange={(v) => v && setArmId(v === NONE ? '' : v)}>
                      <SelectTrigger id="en-arm">
                        <SelectValue placeholder="Choose a class…" />
                      </SelectTrigger>
                      <SelectContent>
                        {p.arms.map((x) => (
                          <SelectItem key={x.id} value={x.id}>
                            {x.classLevel} {x.name} — {x.students}
                            {x.capacity ? ` of ${x.capacity}` : ''} students
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  {arm?.capacity != null && arm.students >= arm.capacity && (
                    <p className="flex items-start gap-2 text-[12.5px] font-medium text-warning">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {arm.classLevel} {arm.name} is full ({arm.students} of {arm.capacity}). You can still enrol.
                    </p>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                    <Field label="Admission number" htmlFor="en-adm" error={errors.admissionNumber} hint={`Leave blank for the next number: ${p.admissionNumber}`}>
                      <Input id="en-adm" value={admissionNumber} onChange={(e) => setAdmissionNumber(e.target.value)} placeholder={p.admissionNumber} maxLength={30} className="font-mono" />
                    </Field>
                    <Field label="Admitted on" htmlFor="en-on">
                      <Input id="en-on" type="date" value={admittedOn} onChange={(e) => setAdmittedOn(e.target.value)} className={dateInput} />
                    </Field>
                  </div>
                </div>
              ) : step === 1 ? (
                <div className="grid gap-4">
                  {p.guardianMatches.length > 0 && (
                    <fieldset className="grid gap-2">
                      <legend className="mb-1 text-[13px] font-medium">Already a parent at the school?</legend>
                      {p.guardianMatches.map((m) => (
                        <label key={m.id} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 text-[13px]', guardianId === m.id ? 'border-brand bg-brand-soft/40' : 'border-border')}>
                          <input type="radio" name="en-guardian" className="mt-1 accent-[var(--brand)]" checked={guardianId === m.id} onChange={() => setGuardianId(m.id)} />
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-1.5 font-medium">
                              {m.name} <Badge variant="outline">{m.relationship}</Badge>
                              <Badge variant="info">Same {m.matchedOn === 'both' ? 'phone and email' : m.matchedOn}</Badge>
                            </span>
                            <span className="block text-[12px] text-muted-foreground">
                              {m.phone}
                              {m.email && ` · ${m.email}`}
                            </span>
                            {m.children.length > 0 && <span className="block text-[12px] text-muted-foreground">Parent of {m.children.join(', ')}</span>}
                          </span>
                        </label>
                      ))}
                      <label className={cn('flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-[13px]', guardianId === null ? 'border-brand bg-brand-soft/40' : 'border-border')}>
                        <input type="radio" name="en-guardian" className="accent-[var(--brand)]" checked={guardianId === null} onChange={() => setGuardianId(null)} />
                        <UserPlus className="size-4 text-muted-foreground" aria-hidden /> Add as a new parent
                      </label>
                    </fieldset>
                  )}
                  {guardianId === null && (
                    <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                      <Field label="First name" htmlFor="en-gf" error={errors.firstName}>
                        <Input id="en-gf" value={g.firstName} onChange={(e) => setG((x) => ({ ...x, firstName: e.target.value }))} maxLength={80} invalid={!!errors.firstName} />
                      </Field>
                      <Field label="Surname" htmlFor="en-gl" error={errors.lastName}>
                        <Input id="en-gl" value={g.lastName} onChange={(e) => setG((x) => ({ ...x, lastName: e.target.value }))} maxLength={80} invalid={!!errors.lastName} />
                      </Field>
                      <Field label="Relationship" htmlFor="en-gr" error={errors.relationship}>
                        <Input id="en-gr" value={g.relationship} onChange={(e) => setG((x) => ({ ...x, relationship: e.target.value }))} maxLength={30} invalid={!!errors.relationship} />
                      </Field>
                      <Field label="Phone" htmlFor="en-gp" error={errors.phone}>
                        <Input id="en-gp" type="tel" value={g.phone} onChange={(e) => setG((x) => ({ ...x, phone: e.target.value }))} maxLength={20} invalid={!!errors.phone} />
                      </Field>
                      <Field label="Email" htmlFor="en-ge" optional error={errors.email} className="sm:col-span-2">
                        <Input id="en-ge" type="email" value={g.email} onChange={(e) => setG((x) => ({ ...x, email: e.target.value }))} maxLength={160} invalid={!!errors.email} />
                      </Field>
                    </div>
                  )}
                  {matched?.hasLogin ? (
                    <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                      <KeyRound className="size-3.5" aria-hidden /> {matched.name} already has a parent portal login — {a.childFirstName} will appear there.
                    </p>
                  ) : (
                    <SwitchRow
                      label="Create a parent portal login"
                      description={loginEmail ? `For ${loginEmail}${p.emailHasAccount && !matched ? ' (this email already has an account — it will be reused)' : ''}` : 'Needs the parent’s email address'}
                    >
                      <Switch checked={createLogin && !!loginEmail} onCheckedChange={setCreateLogin} disabled={!loginEmail} aria-label="Create a parent portal login" />
                    </SwitchRow>
                  )}
                </div>
              ) : (
                <div className="grid gap-4">
                  <SwitchRow label="Raise the first invoice" description="From the school’s fee schedule — compulsory items for this class">
                    <Switch checked={raiseInvoice} onCheckedChange={setRaiseInvoice} aria-label="Raise the first invoice" />
                  </SwitchRow>
                  {raiseInvoice && (
                    <>
                      <Field label="Term" htmlFor="en-term">
                        <Select value={termId || NONE} onValueChange={(v) => v && setTermId(v === NONE ? '' : v)}>
                          <SelectTrigger id="en-term">
                            <SelectValue placeholder="Choose a term…" />
                          </SelectTrigger>
                          <SelectContent>
                            {meta.data?.terms.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.name} {t.session}
                                {t.isCurrent ? ' (current)' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      {fees ? (
                        <div className="rounded-xl border border-border">
                          <ul className="divide-y divide-border text-[13px]">
                            {fees.items.map((f) => (
                              <li key={f.name} className="flex justify-between gap-3 px-3.5 py-2">
                                <span className="min-w-0 truncate">{f.name}</span>
                                <span className="tabular">{money(f.amountKobo, currency)}</span>
                              </li>
                            ))}
                          </ul>
                          <p className="flex justify-between border-t border-border bg-muted/40 px-3.5 py-2 text-[13px] font-semibold">
                            <span>Total</span> <span className="tabular">{money(fees.totalKobo, currency)}</span>
                          </p>
                        </div>
                      ) : (
                        <p className="text-[12.5px] text-muted-foreground">{p.fees ? 'The invoice is worked out from that term’s fee schedule.' : 'No compulsory fees are set for this class yet — no invoice will be raised.'}</p>
                      )}
                    </>
                  )}
                  <SwitchRow label={`Send a welcome message to ${a.parentName.split(' ').slice(0, 2).join(' ')}`} description="Class, admission number and fees, by the channels in Admissions settings">
                    <Switch checked={notify} onCheckedChange={setNotify} aria-label="Send a welcome message" />
                  </SwitchRow>
                  <div className="rounded-xl border border-border bg-muted/30 px-3.5 py-3 text-[12.5px]">
                    <p className="font-medium">Summary</p>
                    <ul className="mt-1 space-y-0.5 text-muted-foreground">
                      <li>
                        {a.childName} → {arm ? `${arm.classLevel} ${arm.name}` : '—'}, admission no. <span className="font-mono">{admissionNumber.trim() || p.admissionNumber}</span>
                      </li>
                      <li>Parent: {matched ? `${matched.name} (existing)` : `${g.firstName} ${g.lastName} (new)`}</li>
                      {createLogin && loginEmail && !matched?.hasLogin && <li>Portal login for {loginEmail}</li>}
                    </ul>
                  </div>
                </div>
              )}
              <div className="mt-4">
                <FormError message={errors.form ?? errors.classArmId} />
              </div>
            </DialogBody>
            <DialogFooter>
              {step > 0 ? (
                <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
                  <ArrowLeft /> Back
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
              )}
              <Button type="submit" loading={enrol.isPending} disabled={!p}>
                {step < 2 ? (
                  <>
                    Next <ArrowRight />
                  </>
                ) : (
                  <>
                    {!enrol.isPending && <UserCheck />} Enrol {a.childFirstName}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Done({ result, currency, onClose, canFinance }: { result: EnrolResult; currency: string; onClose: () => void; canFinance: boolean }) {
  return (
    <>
      <DialogHeader>
        <div className="mb-2 grid size-10 place-items-center rounded-xl bg-success-soft text-success [&_svg]:size-5">
          <CheckCircle2 />
        </div>
        <DialogTitle>{result.student.name} is enrolled</DialogTitle>
        <DialogDescription>
          {result.student.classArm} · admission number <span className="font-mono font-medium text-foreground">{result.student.admissionNumber}</span>
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-3">
        <p className="text-[13px]">
          Parent: <span className="font-medium">{result.guardian.name}</span> {result.guardian.created ? '(new record)' : '(linked to their existing record)'}
        </p>
        {result.login && (
          <div className="rounded-xl border border-border p-3.5 text-[13px]">
            <p className="flex items-center gap-2 font-medium">
              <KeyRound className="size-4" aria-hidden /> Parent portal login
            </p>
            <p className="mt-1 text-muted-foreground">
              Email: <span className="font-medium text-foreground">{result.login.email}</span>
            </p>
            {result.login.password ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">One-time password:</span>
                <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[13.5px] font-semibold">{result.login.password}</span>
                <CopyButton text={`Email: ${result.login.email}\nPassword: ${result.login.password}`} label="login details" />
              </div>
            ) : (
              <p className="mt-1 text-muted-foreground">This email already had an account — they sign in with their current password.</p>
            )}
            {result.login.password && <p className="mt-2 text-[12px] text-muted-foreground">Give these to the parent now — the password is not shown again.</p>}
          </div>
        )}
        {result.invoice ? (
          <p className="flex items-center gap-2 text-[13px]">
            <Receipt className="size-4 text-muted-foreground" aria-hidden /> Invoice{' '}
            {canFinance ? (
              <Link to={`/fees/invoices/${result.invoice.id}`} className="font-medium text-brand hover:underline">
                {result.invoice.number}
              </Link>
            ) : (
              <span className="font-medium">{result.invoice.number}</span>
            )}{' '}
            for {money(result.invoice.totalKobo, currency)}
            {result.invoiceNote && <span className="text-muted-foreground"> — {result.invoiceNote.toLowerCase()}</span>}
          </p>
        ) : (
          result.invoiceNote && <p className="text-[12.5px] text-muted-foreground">No invoice: {result.invoiceNote}.</p>
        )}
        {result.notified && <p className="text-[12.5px] text-muted-foreground">A welcome message is on its way to the parent.</p>}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" asChild>
          <Link to={`/students?q=${encodeURIComponent(result.student.admissionNumber)}`}>View student</Link>
        </Button>
        <Button onClick={onClose}>Done</Button>
      </DialogFooter>
    </>
  );
}
