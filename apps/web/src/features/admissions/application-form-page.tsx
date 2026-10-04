import { applicationSchema, type AdmissionDetail } from '@aischool/shared';
import { FilePlus2, Inbox } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { money } from '../finance/ui';
import { apiFieldErrors, dateInput, FormError, Segmented, zodErrors } from '../operations/ui';
import { BackLink, DetailSkeleton } from '../planning/ui';
import { useAdmissionsMeta, useApplication, useEnquiryPrefill, useSaveApplication } from './api';

const empty = {
  childFirstName: '',
  childMiddleName: '',
  childLastName: '',
  gender: '' as '' | 'MALE' | 'FEMALE',
  dateOfBirth: '',
  classLevelId: '',
  entryTerm: '',
  previousSchool: '',
  parentName: '',
  parentPhone: '',
  parentEmail: '',
  relationship: '',
  address: '',
  medicalNotes: '',
  notes: '',
};
type Values = typeof empty;

const fromDetail = (a: AdmissionDetail): Values => ({
  childFirstName: a.childFirstName,
  childMiddleName: a.childMiddleName ?? '',
  childLastName: a.childLastName,
  gender: a.gender,
  dateOfBirth: a.dateOfBirth ?? '',
  classLevelId: a.classLevel?.id ?? '',
  entryTerm: a.entryTerm ?? '',
  previousSchool: a.previousSchool ?? '',
  parentName: a.parentName,
  parentPhone: a.parentPhone,
  parentEmail: a.parentEmail ?? '',
  relationship: a.relationship ?? '',
  address: a.address ?? '',
  medicalNotes: a.medicalNotes ?? '',
  notes: a.notes ?? '',
});

/** New application at the front desk (optionally converting an enquiry), or editing one. */
export default function ApplicationFormPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const enquiryId = id ? null : params.get('enquiry');
  const existing = useApplication(id);
  const prefill = useEnquiryPrefill(enquiryId);
  if (id && !existing.data) {
    return <Page className="max-w-3xl">{existing.error ? <ErrorState error={existing.error} onRetry={() => void existing.refetch()} /> : <DetailSkeleton />}</Page>;
  }
  if (enquiryId && !prefill.data) {
    return <Page className="max-w-3xl">{prefill.error ? <ErrorState error={prefill.error} onRetry={() => void prefill.refetch()} /> : <DetailSkeleton />}</Page>;
  }
  return <ApplicationForm key={id || enquiryId || 'new'} detail={existing.data} prefill={prefill.data} />;
}

function ApplicationForm({ detail, prefill }: { detail?: AdmissionDetail; prefill?: ReturnType<typeof useEnquiryPrefill>['data'] }) {
  const navigate = useNavigate();
  const meta = useAdmissionsMeta();
  const save = useSaveApplication(detail?.id);
  const [v, setV] = useState<Values>(() => (detail ? fromDetail(detail) : prefill ? { ...empty, ...prefill.prefill, classLevelId: prefill.prefill.classLevelId ?? '' } : empty));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (p: Partial<Values>) => {
    setV((s) => ({ ...s, ...p }));
    const keys = Object.keys(p);
    if (keys.some((k) => errors[k])) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k))));
  };
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = applicationSchema.safeParse({
      ...v,
      gender: v.gender || undefined,
      dateOfBirth: v.dateOfBirth || null,
      classLevelId: v.classLevelId || null,
      source: detail?.source ?? 'FRONT_DESK',
      enquiryId: detail ? null : (prefill?.enquiry.id ?? null),
    });
    if (!parsed.success) {
      const errs = zodErrors(parsed.error.issues);
      setErrors(errs);
      document.getElementById(`ap-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    setErrors({});
    save.mutate(parsed.data, {
      onSuccess: (d) => navigate(`/admissions/${d.id}`, { replace: !!detail }),
      onError: (err) => setErrors(apiFieldErrors(err)),
    });
  };

  const fee = meta.data?.settings.applicationFeeKobo;
  const title = detail ? `Edit ${detail.number}` : 'New application';
  return (
    <Page className="max-w-3xl">
      <BackLink to={detail ? `/admissions/${detail.id}` : '/admissions'}>{detail ? detail.number : 'Admissions'}</BackLink>
      <PageHeader
        className="mt-3"
        title={title}
        description={detail ? `${detail.childName}` : 'Record an application from a parent at the front desk, by phone or on paper.'}
      />
      {prefill && (
        <Card className="mb-5 flex items-start gap-3 border-info/30 bg-info-soft/30 p-4 text-[13px] shadow-none">
          <Inbox className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
          <p>
            Converting the enquiry from <span className="font-medium">{prefill.enquiry.parentName}</span> ({prefill.enquiry.phone}). It will be marked <span className="font-medium">Applied</span> and linked to this application.
            {prefill.existing && (
              <>
                {' '}
                It already has an application:{' '}
                <Link to={`/admissions/${prefill.existing.id}`} className="font-medium text-brand underline-offset-2 hover:underline">
                  {prefill.existing.number}
                </Link>
                .
              </>
            )}
          </p>
        </Card>
      )}
      <form onSubmit={submit} noValidate className="space-y-5">
        <Card className="space-y-4 p-5">
          <h2 className="font-display text-[15px] font-semibold">The child</h2>
          <div className="grid gap-4 sm:grid-cols-3 [&>*]:min-w-0">
            <Field label="First name" htmlFor="ap-childFirstName" error={errors.childFirstName}>
              <Input id="ap-childFirstName" value={v.childFirstName} onChange={(e) => set({ childFirstName: e.target.value })} maxLength={80} invalid={!!errors.childFirstName} autoFocus={!detail} />
            </Field>
            <Field label="Middle name" htmlFor="ap-childMiddleName" optional>
              <Input id="ap-childMiddleName" value={v.childMiddleName} onChange={(e) => set({ childMiddleName: e.target.value })} maxLength={80} />
            </Field>
            <Field label="Surname" htmlFor="ap-childLastName" error={errors.childLastName}>
              <Input id="ap-childLastName" value={v.childLastName} onChange={(e) => set({ childLastName: e.target.value })} maxLength={80} invalid={!!errors.childLastName} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
            <Field label="Sex" htmlFor="ap-gender" error={errors.gender}>
              <Segmented
                label="Sex"
                value={v.gender || ('NONE' as const)}
                onChange={(g) => g !== 'NONE' && set({ gender: g })}
                options={[
                  { value: 'FEMALE' as const, label: 'Girl' },
                  { value: 'MALE' as const, label: 'Boy' },
                ]}
                className="self-start"
              />
            </Field>
            <Field label="Date of birth" htmlFor="ap-dateOfBirth" optional error={errors.dateOfBirth}>
              <Input id="ap-dateOfBirth" type="date" value={v.dateOfBirth} onChange={(e) => set({ dateOfBirth: e.target.value })} className={dateInput} />
            </Field>
            <Field label="Class applying for" htmlFor="ap-classLevelId" error={errors.classLevelId}>
              <Select value={v.classLevelId || NONE} onValueChange={(x) => x && set({ classLevelId: x === NONE ? '' : x })}>
                <SelectTrigger id="ap-classLevelId">
                  <SelectValue placeholder="Choose a class…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not decided yet</SelectItem>
                  {meta.data?.classLevels.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Starting" htmlFor="ap-entryTerm" optional>
              <Input id="ap-entryTerm" value={v.entryTerm} onChange={(e) => set({ entryTerm: e.target.value })} maxLength={60} placeholder="e.g. Second Term 2026/2027" list="ap-terms" />
              <datalist id="ap-terms">
                {meta.data?.terms.map((t) => (
                  <option key={t.id} value={`${t.name} ${t.session}`} />
                ))}
              </datalist>
            </Field>
          </div>
          <Field label="Current or previous school" htmlFor="ap-previousSchool" optional>
            <Input id="ap-previousSchool" value={v.previousSchool} onChange={(e) => set({ previousSchool: e.target.value })} maxLength={160} />
          </Field>
          <Field label="Medical notes" htmlFor="ap-medicalNotes" optional hint="Allergies, conditions or needs the school should know about">
            <Textarea id="ap-medicalNotes" rows={2} value={v.medicalNotes} onChange={(e) => set({ medicalNotes: e.target.value })} maxLength={1000} />
          </Field>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="font-display text-[15px] font-semibold">Parent or guardian</h2>
          <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
            <Field label="Full name" htmlFor="ap-parentName" error={errors.parentName}>
              <Input id="ap-parentName" value={v.parentName} onChange={(e) => set({ parentName: e.target.value })} maxLength={120} invalid={!!errors.parentName} placeholder="e.g. Mrs Ngozi Okafor" />
            </Field>
            <Field label="Relationship" htmlFor="ap-relationship" optional>
              <Input id="ap-relationship" value={v.relationship} onChange={(e) => set({ relationship: e.target.value })} maxLength={30} placeholder="Mother, Father, Guardian…" list="ap-rel" />
              <datalist id="ap-rel">
                {['Mother', 'Father', 'Guardian', 'Aunt', 'Uncle', 'Grandparent'].map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </Field>
            <Field label="Phone" htmlFor="ap-parentPhone" error={errors.parentPhone}>
              <Input id="ap-parentPhone" type="tel" inputMode="tel" value={v.parentPhone} onChange={(e) => set({ parentPhone: e.target.value })} maxLength={20} invalid={!!errors.parentPhone} placeholder="0803 123 4567" />
            </Field>
            <Field label="Email" htmlFor="ap-parentEmail" optional error={errors.parentEmail} hint="Needed for a parent portal login">
              <Input id="ap-parentEmail" type="email" value={v.parentEmail} onChange={(e) => set({ parentEmail: e.target.value })} maxLength={160} invalid={!!errors.parentEmail} />
            </Field>
          </div>
          <Field label="Home address" htmlFor="ap-address" optional>
            <Textarea id="ap-address" rows={2} value={v.address} onChange={(e) => set({ address: e.target.value })} maxLength={300} />
          </Field>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="font-display text-[15px] font-semibold">Notes</h2>
          <Field label="Notes for the admissions team" htmlFor="ap-notes" optional>
            <Textarea id="ap-notes" rows={3} value={v.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={2000} />
          </Field>
          {!detail && !!fee && meta.data && <p className="text-[12.5px] text-muted-foreground">An application fee of {money(fee, meta.data.currency)} applies — record the payment on the application once it’s paid.</p>}
        </Card>

        <FormError message={errors.form} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {!save.isPending && !detail && <FilePlus2 />} {detail ? 'Save changes' : 'Create application'}
          </Button>
        </div>
      </form>
    </Page>
  );
}
