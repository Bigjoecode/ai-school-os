import { alumniSignupSchema } from '@aischool/shared';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, GraduationCap, HeartHandshake, Megaphone, Users } from 'lucide-react';
import * as React from 'react';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useSite, useSiteTitle } from '../website/public/context';
import { FormAlert, Honeypot, IconTile, PageIntro, Section, SiteButton, SiteCard, SiteField, siteButton, siteInput } from '../website/public/ui';

const empty = {
  firstName: '',
  lastName: '',
  graduationYear: '',
  finalClass: '',
  admissionNumber: '',
  email: '',
  phone: '',
  currentInstitution: '',
  course: '',
  occupation: '',
  employer: '',
  city: '',
  country: 'Nigeria',
  message: '',
  consentToContact: true,
  website: '',
};
type Form = typeof empty;

const FRIENDLY: Record<string, string> = {
  firstName: 'Please enter your first name',
  lastName: 'Please enter your surname',
  graduationYear: 'Enter the year you left, e.g. 2015',
};

/** The website's "Alumni" page: old students sign up or update their details. */
export function AlumniSignupPage() {
  const { site, slug } = useSite();
  useSiteTitle('Alumni', `Old students of ${site.school.name}: stay in touch with your school.`);
  const [v, setV] = React.useState<Form>(empty);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [done, setDone] = React.useState<string | null>(null);
  const submit = useMutation({
    mutationFn: (body: unknown) => api.post<{ ok: boolean; message: string }>(`/public/sites/${encodeURIComponent(slug)}/alumni`, body),
    meta: { silent: true },
    onSuccess: (r) => {
      setDone(r.message);
      setV(empty);
    },
  });
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setV((x) => ({ ...x, [k]: e.target.value }));
    if (errors[k]) setErrors(({ [k]: _drop, ...rest }) => rest);
  };
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = alumniSignupSchema.safeParse({ ...v, graduationYear: v.graduationYear.trim() || undefined });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const k = String(i.path[0] ?? 'form');
        errs[k] ??= FRIENDLY[k] ?? i.message;
      }
      setErrors(errs);
      return;
    }
    setErrors({});
    submit.mutate({ ...parsed.data, website: v.website || undefined });
  };
  const thisYear = new Date().getFullYear();
  const text = (k: keyof Form, label: string, opts: { optional?: boolean; type?: string; auto?: string; placeholder?: string; hint?: string } = {}) => (
    <SiteField label={label} htmlFor={`al-${k}`} optional={opts.optional} error={errors[k]} hint={opts.hint}>
      <input
        id={`al-${k}`}
        type={opts.type ?? 'text'}
        className={siteInput}
        autoComplete={opts.auto}
        placeholder={opts.placeholder}
        value={v[k] as string}
        onChange={set(k)}
        aria-invalid={!!errors[k]}
        inputMode={k === 'graduationYear' ? 'numeric' : undefined}
      />
    </SiteField>
  );

  return (
    <>
      <PageIntro
        eyebrow="Alumni"
        title={`Once ${site.school.shortName || site.school.name}, always ${site.school.shortName || site.school.name}`}
        description="Are you an old student? Join the alumni network to hear about reunions, mentoring and ways to support the school — and tell us where life has taken you."
      />
      <Section>
        <div className="grid gap-10 lg:grid-cols-[1fr_1.5fr] [&>*]:min-w-0">
          <div className="space-y-4">
            {[
              { icon: Users, title: 'Reconnect with your set', text: 'Reunions and class-of get-togethers, organised with the school.' },
              { icon: HeartHandshake, title: 'Mentor today’s students', text: 'Career days and talks: share what you have learnt since you left.' },
              { icon: Megaphone, title: 'Hear the school’s news', text: 'Only if you agree — and you can ask the school to stop at any time.' },
            ].map((x) => (
              <div key={x.title} className="flex gap-4 rounded-site-lg border border-site-line bg-white p-5">
                <IconTile icon={x.icon} />
                <div className="min-w-0">
                  <p className="text-[15.5px] font-semibold text-site-ink">{x.title}</p>
                  <p className="mt-1 text-[14px] leading-relaxed text-site-muted">{x.text}</p>
                </div>
              </div>
            ))}
            <p className="text-[13px] leading-relaxed text-site-muted">Already signed up? Send the form again with the same name and email or phone to update your details.</p>
          </div>
          <SiteCard className="p-5 sm:p-8">
            {done ? (
              <div role="status" className="flex flex-col items-center px-4 py-10 text-center">
                <div className="grid size-16 place-items-center rounded-full bg-site-soft text-site">
                  <CheckCircle2 className="size-8" aria-hidden />
                </div>
                <p className="site-h mt-5 text-[24px] font-semibold text-site-ink">Welcome back!</p>
                <p className="mt-2 max-w-md text-[15.5px] leading-relaxed text-site-muted">{done}</p>
                <button type="button" onClick={() => setDone(null)} className={cn(siteButton('outline', 'sm'), 'mt-6')}>
                  Sign up someone else
                </button>
              </div>
            ) : (
              <form onSubmit={onSubmit} noValidate className="relative grid gap-5">
                <Honeypot value={v.website} onChange={(website) => setV((x) => ({ ...x, website }))} />
                <p className="site-h flex items-center gap-2 text-[20px] font-semibold text-site-ink">
                  <GraduationCap className="size-5 text-site" aria-hidden /> Old students’ sign-up
                </p>
                <div className="grid gap-5 sm:grid-cols-2 [&>*]:min-w-0">
                  {text('firstName', 'First name', { auto: 'given-name' })}
                  {text('lastName', 'Surname', { auto: 'family-name', hint: 'The surname you had in school' })}
                </div>
                <div className="grid gap-5 sm:grid-cols-3 [&>*]:min-w-0">
                  {text('graduationYear', 'Year you left', { placeholder: String(thisYear - 5) })}
                  {text('finalClass', 'Final class', { optional: true, placeholder: 'SS 3 A' })}
                  {text('admissionNumber', 'Admission no.', { optional: true, hint: 'If you remember it' })}
                </div>
                <div className="grid gap-5 sm:grid-cols-2 [&>*]:min-w-0">
                  {text('email', 'Email', { type: 'email', auto: 'email' })}
                  {text('phone', 'Phone', { type: 'tel', auto: 'tel', optional: true })}
                </div>
                <div className="grid gap-5 sm:grid-cols-2 [&>*]:min-w-0">
                  {text('currentInstitution', 'University or school now', { optional: true })}
                  {text('course', 'Course', { optional: true })}
                  {text('occupation', 'Occupation', { optional: true })}
                  {text('employer', 'Employer', { optional: true })}
                  {text('city', 'City', { optional: true, auto: 'address-level2' })}
                  {text('country', 'Country', { optional: true, auto: 'country-name' })}
                </div>
                <SiteField label="Anything you’d like to tell the school?" htmlFor="al-message" optional error={errors.message}>
                  <textarea id="al-message" rows={3} className={cn(siteInput, 'h-auto py-3 leading-relaxed')} value={v.message} onChange={set('message')} />
                </SiteField>
                <label className="flex cursor-pointer items-start gap-3 text-[14px] text-site-ink">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-[var(--site-primary)]"
                    checked={v.consentToContact}
                    onChange={(e) => setV((x) => ({ ...x, consentToContact: e.target.checked }))}
                  />
                  <span>The school may contact me about alumni events, mentoring and news.</span>
                </label>
                <FormAlert message={submit.error ? errorMessage(submit.error) : null} />
                <SiteButton type="submit" size="lg" loading={submit.isPending} className="w-full sm:w-auto sm:justify-self-start">
                  Join the alumni network
                </SiteButton>
              </form>
            )}
          </SiteCard>
        </div>
      </Section>
    </>
  );
}
