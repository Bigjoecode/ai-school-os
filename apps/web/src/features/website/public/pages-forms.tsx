import { applicationFormSchema, contactFormSchema, resultCheckSchema, type PublicResult } from '@aischool/shared';
import { useMutation } from '@tanstack/react-query';
import { Award, CheckCircle2, Clock, FileCheck2, KeyRound, Lock, Mail, MapPin, MessageCircle, Phone, Printer, RotateCcw } from 'lucide-react';
import * as React from 'react';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useSite, useSiteTitle } from './context';
import { mapLink, SocialLinks, telLink, waLink } from './layout';
import { Chip, Container, Eyebrow, FormAlert, Honeypot, IconTile, MoreLink, PageIntro, Reveal, Section, SectionHeading, SiteButton, SiteCard, SiteField, SiteLink, siteButton, siteInput } from './ui';

/** Friendly copy instead of raw validation messages. */
const FRIENDLY: Record<string, string> = {
  parentName: 'Please enter your full name',
  phone: 'Please enter a phone number we can call',
  email: 'That email address doesn’t look right',
  childName: 'Please enter your child’s name',
  childDateOfBirth: 'Use a valid date',
  classOfInterest: 'Choose the class you’re applying for',
  name: 'Please enter your name',
  subject: 'Add a short subject',
  message: 'Please write a little more',
  admissionNumber: 'Enter the admission number on the slip',
  code: 'Enter the access code on the slip (at least 6 characters)',
};

function fieldErrors(issues: { path: PropertyKey[] }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? 'form');
    out[k] ??= FRIENDLY[k] ?? 'Please check this field';
  }
  return out;
}

function SuccessPanel({ title, message, onReset, resetLabel }: { title: string; message: string; onReset: () => void; resetLabel: string }) {
  return (
    <div role="status" className="flex flex-col items-center px-4 py-10 text-center">
      <div className="grid size-16 place-items-center rounded-full bg-site-soft text-site">
        <CheckCircle2 className="size-8" aria-hidden />
      </div>
      <p className="site-h mt-5 text-[24px] font-semibold text-site-ink">{title}</p>
      <p className="mt-2 max-w-md text-[15.5px] leading-relaxed text-site-muted">{message}</p>
      <button type="button" onClick={onReset} className={cn(siteButton('outline', 'sm'), 'mt-6')}>
        {resetLabel}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ admissions

export function AdmissionsPage() {
  const { site } = useSite();
  const a = site.settings.admissions;
  useSiteTitle('Admissions', a.intro.slice(0, 160) || undefined);
  return (
    <>
      <PageIntro eyebrow="Admissions" title={a.open ? 'Join our school family' : 'Admissions'} description={a.intro || undefined}>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {a.open ? (
            <>
              <Chip tone="accent">
                <span className="size-1.5 rounded-full bg-current" aria-hidden /> Admissions open
              </Chip>
              <a href="#apply" className={siteButton('primary', 'sm')}>
                Start your application
              </a>
            </>
          ) : (
            <Chip tone="outline">
              <Lock className="size-3" aria-hidden /> Admissions closed for now
            </Chip>
          )}
        </div>
      </PageIntro>

      {(a.steps.length > 0 || a.requirements.length > 0) && (
        <Section>
          <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
            {a.steps.length > 0 && (
              <div>
                <SectionHeading eyebrow="How it works" title={a.steps.length >= 2 && a.steps.length <= 5 ? `${["", "", "Two", "Three", "Four", "Five"][a.steps.length]} simple steps` : "How to apply"} className="mb-8" />
                <ol className="relative space-y-8 before:absolute before:bottom-4 before:left-[21px] before:top-4 before:w-px before:bg-site-line">
                  {a.steps.map((s, i) => (
                    <Reveal key={i} delay={i * 0.05}>
                      <li className="relative flex gap-5">
                        <span className="site-h relative z-10 grid size-11 shrink-0 place-items-center rounded-full bg-site text-[15px] font-semibold text-site-on ring-4 ring-site-bg tabular">{i + 1}</span>
                        <div className="min-w-0 pt-2">
                          <p className="site-h text-[18px] font-semibold text-site-ink">{s.title}</p>
                          <p className="mt-1 text-[15px] leading-relaxed text-site-muted">{s.description}</p>
                        </div>
                      </li>
                    </Reveal>
                  ))}
                </ol>
              </div>
            )}
            {(a.requirements.length > 0 || a.entryTerms.length > 0) && (
              <Reveal>
                <SiteCard className="p-6 sm:p-8">
                  <IconTile icon={FileCheck2} />
                  {a.requirements.length > 0 && (
                    <>
                      <p className="site-h mt-5 text-[19px] font-semibold text-site-ink">What you’ll need</p>
                      <ul className="mt-4 space-y-3">
                        {a.requirements.map((r, i) => (
                          <li key={i} className="flex gap-3 text-[15px] text-site-ink/85">
                            <CheckCircle2 className="mt-0.5 size-4.5 shrink-0 text-site" aria-hidden />
                            {r}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {a.entryTerms.length > 0 && (
                    <div className="mt-6 border-t border-site-line pt-5">
                      <p className="text-[13px] font-semibold text-site-muted">Entry points</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {a.entryTerms.map((t) => (
                          <Chip key={t}>{t}</Chip>
                        ))}
                      </div>
                    </div>
                  )}
                </SiteCard>
              </Reveal>
            )}
          </div>
        </Section>
      )}

      <Section tone="surface" id="apply" className="scroll-mt-20">
        {a.open ? <ApplicationForm /> : <AdmissionsClosed />}
      </Section>
    </>
  );
}

function AdmissionsClosed() {
  const { site } = useSite();
  const c = site.settings.contact;
  return (
    <SiteCard className="mx-auto max-w-2xl p-8 text-center sm:p-12">
      <div className="mx-auto grid size-14 place-items-center rounded-full bg-site-soft text-site">
        <Lock className="size-6" aria-hidden />
      </div>
      <p className="site-h mt-5 text-[24px] font-semibold text-site-ink">Admissions are closed at the moment</p>
      <p className="mt-2 text-[15.5px] leading-relaxed text-site-muted">Leave us a message and we’ll let you know as soon as places open.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <SiteLink to="/contact" className={siteButton('primary')}>
          Contact admissions
        </SiteLink>
        {c.phone && (
          <a href={telLink(c.phone)} className={siteButton('outline')}>
            <Phone aria-hidden /> {c.phone}
          </a>
        )}
      </div>
    </SiteCard>
  );
}

const emptyApplication = { parentName: '', phone: '', email: '', childName: '', childDateOfBirth: '', classOfInterest: '', entryTerm: '', currentSchool: '', message: '', website: '' };

function ApplicationForm() {
  const { site, slug } = useSite();
  const a = site.settings.admissions;
  const [v, setV] = React.useState(emptyApplication);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [done, setDone] = React.useState<string | null>(null);
  const submit = useMutation({
    mutationFn: (body: unknown) => api.post<{ ok: boolean; message: string }>(`/public/sites/${encodeURIComponent(slug)}/apply`, body),
    meta: { silent: true },
    onSuccess: (r) => {
      setDone(r.message);
      setV(emptyApplication);
      document.getElementById('apply')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  });
  const set = (k: keyof typeof emptyApplication) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setV((x) => ({ ...x, [k]: e.target.value }));
    if (errors[k]) setErrors(({ [k]: _drop, ...rest }) => rest);
  };
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = applicationFormSchema.safeParse({ ...v, childDateOfBirth: v.childDateOfBirth || null, entryTerm: v.entryTerm || null });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    submit.mutate(parsed.data);
  };
  const classes = site.classes.map((c) => c.level);
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.5fr] [&>*]:min-w-0">
      <div>
        <Eyebrow className="mb-3">Apply online</Eyebrow>
        <h2 className="site-h text-[28px] font-semibold leading-tight text-site-ink sm:text-[34px]">Start your application</h2>
        <p className="mt-4 text-[16px] leading-relaxed text-site-muted">It takes about five minutes. Our admissions team will call you within two working days to arrange a visit and assessment.</p>
        <ul className="mt-6 space-y-3 text-[14.5px] text-site-ink/80">
          <li className="flex gap-3">
            <Lock className="mt-0.5 size-4 shrink-0 text-site" aria-hidden /> Your details go only to the school’s admissions office.
          </li>
          <li className="flex gap-3">
            <Clock className="mt-0.5 size-4 shrink-0 text-site" aria-hidden /> No payment needed to apply.
          </li>
        </ul>
      </div>
      <SiteCard className="relative p-5 sm:p-8">
        {done ? (
          <SuccessPanel title="Application received" message={done} resetLabel="Apply for another child" onReset={() => setDone(null)} />
        ) : (
          <form onSubmit={onSubmit} noValidate className="grid gap-5">
            <Honeypot value={v.website} onChange={(website) => setV((x) => ({ ...x, website }))} />
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-site-muted">About you</p>
            <div className="grid gap-5 sm:grid-cols-2 [&>*]:min-w-0">
              <SiteField label="Parent or guardian’s name" htmlFor="ap-parent" error={errors.parentName}>
                <input id="ap-parent" className={siteInput} autoComplete="name" value={v.parentName} onChange={set('parentName')} aria-invalid={!!errors.parentName} />
              </SiteField>
              <SiteField label="Phone number" htmlFor="ap-phone" error={errors.phone}>
                <input id="ap-phone" type="tel" className={siteInput} autoComplete="tel" inputMode="tel" value={v.phone} onChange={set('phone')} aria-invalid={!!errors.phone} />
              </SiteField>
            </div>
            <SiteField label="Email" htmlFor="ap-email" optional error={errors.email}>
              <input id="ap-email" type="email" className={siteInput} autoComplete="email" value={v.email} onChange={set('email')} aria-invalid={!!errors.email} />
            </SiteField>
            <p className="mt-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-site-muted">About your child</p>
            <div className="grid gap-5 sm:grid-cols-2 [&>*]:min-w-0">
              <SiteField label="Child’s full name" htmlFor="ap-child" error={errors.childName}>
                <input id="ap-child" className={siteInput} value={v.childName} onChange={set('childName')} aria-invalid={!!errors.childName} />
              </SiteField>
              <SiteField label="Date of birth" htmlFor="ap-dob" optional error={errors.childDateOfBirth}>
                <input id="ap-dob" type="date" className={cn(siteInput, '[color-scheme:light]')} value={v.childDateOfBirth} onChange={set('childDateOfBirth')} aria-invalid={!!errors.childDateOfBirth} />
              </SiteField>
              <SiteField label="Class applying for" htmlFor="ap-class" error={errors.classOfInterest}>
                {classes.length ? (
                  <select id="ap-class" className={cn(siteInput, 'pr-8')} value={v.classOfInterest} onChange={set('classOfInterest')} aria-invalid={!!errors.classOfInterest}>
                    <option value="">Choose a class…</option>
                    {classes.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input id="ap-class" className={siteInput} placeholder="e.g. Primary 3" value={v.classOfInterest} onChange={set('classOfInterest')} aria-invalid={!!errors.classOfInterest} />
                )}
              </SiteField>
              <SiteField label="Starting" htmlFor="ap-term" optional>
                {a.entryTerms.length ? (
                  <select id="ap-term" className={cn(siteInput, 'pr-8')} value={v.entryTerm} onChange={set('entryTerm')}>
                    <option value="">Any time</option>
                    {a.entryTerms.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input id="ap-term" className={siteInput} placeholder="e.g. January" value={v.entryTerm} onChange={set('entryTerm')} />
                )}
              </SiteField>
            </div>
            <SiteField label="Current school" htmlFor="ap-current" optional>
              <input id="ap-current" className={siteInput} value={v.currentSchool} onChange={set('currentSchool')} />
            </SiteField>
            <SiteField label="Anything we should know?" htmlFor="ap-msg" optional>
              <textarea id="ap-msg" rows={4} className={cn(siteInput, 'h-auto py-3 leading-relaxed')} value={v.message} onChange={set('message')} />
            </SiteField>
            <FormAlert message={submit.error ? errorMessage(submit.error) : null} />
            <SiteButton type="submit" size="lg" loading={submit.isPending} className="w-full sm:w-auto sm:justify-self-start">
              Submit application
            </SiteButton>
          </form>
        )}
      </SiteCard>
    </div>
  );
}

// ------------------------------------------------------------------ contact

const emptyContact = { name: '', email: '', phone: '', subject: '', message: '', website: '' };

export function ContactPage() {
  const { site, slug } = useSite();
  const c = site.settings.contact;
  useSiteTitle('Contact us', c.address ? `Visit or call ${site.school.name}: ${c.address}` : undefined);
  const map = mapLink(c);
  const [v, setV] = React.useState(emptyContact);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [done, setDone] = React.useState<string | null>(null);
  const submit = useMutation({
    mutationFn: (body: unknown) => api.post<{ ok: boolean; message: string }>(`/public/sites/${encodeURIComponent(slug)}/contact`, body),
    meta: { silent: true },
    onSuccess: (r) => {
      setDone(r.message);
      setV(emptyContact);
    },
  });
  const set = (k: keyof typeof emptyContact) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setV((x) => ({ ...x, [k]: e.target.value }));
    if (errors[k]) setErrors(({ [k]: _drop, ...rest }) => rest);
  };
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = contactFormSchema.safeParse({ ...v, phone: v.phone || null });
    const errs = parsed.success ? {} : fieldErrors(parsed.error.issues);
    if (!v.email.trim() && !v.phone.trim()) errs.email ??= 'Leave an email or a phone number so we can reply';
    if (!parsed.success || Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setErrors({});
    submit.mutate(parsed.data);
  };
  const details = [
    c.address && { icon: MapPin, label: 'Visit us', value: c.address, href: map, external: true },
    c.phone && { icon: Phone, label: 'Call us', value: c.phone, href: telLink(c.phone) },
    c.whatsapp && { icon: MessageCircle, label: 'WhatsApp', value: c.whatsapp, href: waLink(c.whatsapp), external: true },
    c.email && { icon: Mail, label: 'Email', value: c.email, href: `mailto:${c.email}` },
    c.hours && { icon: Clock, label: 'Office hours', value: c.hours, href: null },
  ].filter(Boolean) as { icon: typeof MapPin; label: string; value: string; href: string | null; external?: boolean }[];

  return (
    <>
      <PageIntro eyebrow="Contact" title="We’d love to hear from you" description="Questions about admissions, fees or school life? Send a message, call or drop by — our office will get back to you." />
      <Section>
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] [&>*]:min-w-0">
          <div className="space-y-4">
            {details.length === 0 && <p className="text-[15px] text-site-muted">Use the form to reach the school office.</p>}
            {details.map((d) => {
              const body = (
                <div className="flex gap-4">
                  <IconTile icon={d.icon} />
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-semibold uppercase tracking-[0.1em] text-site-muted">{d.label}</p>
                    <p className="mt-1 break-words text-[15.5px] font-medium text-site-ink">{d.value}</p>
                  </div>
                </div>
              );
              return d.href ? (
                <a key={d.label} href={d.href} {...(d.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="block rounded-site-lg border border-site-line bg-white p-5 transition-colors hover:border-site/40">
                  {body}
                </a>
              ) : (
                <div key={d.label} className="rounded-site-lg border border-site-line bg-white p-5">
                  {body}
                </div>
              );
            })}
            {map && (
              <a href={map} target="_blank" rel="noopener noreferrer" className={cn(siteButton('outline', 'sm'), 'mt-2')}>
                <MapPin aria-hidden /> Open in Maps
              </a>
            )}
            <SocialLinks className="pt-4" />
          </div>
          <SiteCard className="p-5 sm:p-8">
            {done ? (
              <SuccessPanel title="Message sent" message={done} resetLabel="Send another message" onReset={() => setDone(null)} />
            ) : (
              <form onSubmit={onSubmit} noValidate className="relative grid gap-5">
                <Honeypot value={v.website} onChange={(website) => setV((x) => ({ ...x, website }))} />
                <p className="site-h text-[20px] font-semibold text-site-ink">Send us a message</p>
                <SiteField label="Your name" htmlFor="ct-name" error={errors.name}>
                  <input id="ct-name" className={siteInput} autoComplete="name" value={v.name} onChange={set('name')} aria-invalid={!!errors.name} />
                </SiteField>
                <div className="grid gap-5 sm:grid-cols-2 [&>*]:min-w-0">
                  <SiteField label="Email" htmlFor="ct-email" error={errors.email}>
                    <input id="ct-email" type="email" className={siteInput} autoComplete="email" value={v.email} onChange={set('email')} aria-invalid={!!errors.email} />
                  </SiteField>
                  <SiteField label="Phone" htmlFor="ct-phone" optional error={errors.phone}>
                    <input id="ct-phone" type="tel" className={siteInput} autoComplete="tel" value={v.phone} onChange={set('phone')} aria-invalid={!!errors.phone} />
                  </SiteField>
                </div>
                <SiteField label="Subject" htmlFor="ct-subject" error={errors.subject}>
                  <input id="ct-subject" className={siteInput} value={v.subject} onChange={set('subject')} aria-invalid={!!errors.subject} />
                </SiteField>
                <SiteField label="Message" htmlFor="ct-message" error={errors.message}>
                  <textarea id="ct-message" rows={5} className={cn(siteInput, 'h-auto py-3 leading-relaxed')} value={v.message} onChange={set('message')} aria-invalid={!!errors.message} />
                </SiteField>
                <FormAlert message={submit.error ? errorMessage(submit.error) : null} />
                <SiteButton type="submit" size="lg" loading={submit.isPending} className="w-full sm:w-auto sm:justify-self-start">
                  Send message
                </SiteButton>
              </form>
            )}
          </SiteCard>
        </div>
      </Section>
    </>
  );
}

// ------------------------------------------------------------------ results

export function ResultsPage() {
  const { slug } = useSite();
  useSiteTitle('Check results', 'Parents: check your child’s term result with the admission number and the access code from the school.');
  const [v, setV] = React.useState({ admissionNumber: '', code: '' });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const check = useMutation({
    mutationFn: (body: { admissionNumber: string; code: string }) => api.post<PublicResult>(`/public/sites/${encodeURIComponent(slug)}/results`, body),
    meta: { silent: true },
  });
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = resultCheckSchema.safeParse(v);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    check.mutate(parsed.data);
  };
  if (check.data) return <ResultCard r={check.data} onAgain={() => check.reset()} />;
  return (
    <>
      <PageIntro eyebrow="Results" title="Check your child’s result" description="Enter the admission number and the access code printed on the slip from the school." />
      <Section>
        <div className="grid items-start gap-10 lg:grid-cols-[1.2fr_1fr] [&>*]:min-w-0">
          <SiteCard className="p-5 sm:p-8">
            <form onSubmit={onSubmit} noValidate className="grid gap-5">
              <SiteField label="Admission number" htmlFor="rs-adm" error={errors.admissionNumber}>
                <input id="rs-adm" className={cn(siteInput, 'font-mono uppercase tracking-wide')} autoComplete="off" placeholder="e.g. GIS/2024/001" value={v.admissionNumber} onChange={(e) => setV((x) => ({ ...x, admissionNumber: e.target.value }))} aria-invalid={!!errors.admissionNumber} />
              </SiteField>
              <SiteField label="Access code" htmlFor="rs-code" error={errors.code} hint="Letters and numbers, no spaces.">
                <input id="rs-code" className={cn(siteInput, 'font-mono uppercase tracking-[0.2em]')} autoComplete="off" maxLength={16} value={v.code} onChange={(e) => setV((x) => ({ ...x, code: e.target.value.replace(/\s/g, '').toUpperCase() }))} aria-invalid={!!errors.code} />
              </SiteField>
              <FormAlert message={check.error ? errorMessage(check.error) : null} />
              <SiteButton type="submit" size="lg" loading={check.isPending} className="w-full">
                <KeyRound aria-hidden /> Check result
              </SiteButton>
            </form>
          </SiteCard>
          <div className="space-y-4 text-[15px] leading-relaxed text-site-muted">
            <p className="site-h text-[19px] font-semibold text-site-ink">Where do I find the code?</p>
            <p>The school gives every student a printed slip with a personal access code each term. Each code can be used a limited number of times.</p>
            <p>Lost the slip, or the code has run out? Ask the school office for a new one.</p>
            <MoreLink to="/contact">Contact the school office</MoreLink>
          </div>
        </div>
      </Section>
    </>
  );
}

function ResultCard({ r, onAgain }: { r: PublicResult; onAgain: () => void }) {
  const { site } = useSite();
  return (
    <Container className="max-w-4xl py-10 sm:py-14 print:max-w-none print:p-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <button type="button" onClick={onAgain} className={siteButton('outline', 'sm')}>
          <RotateCcw aria-hidden /> Check another result
        </button>
        <button type="button" onClick={() => window.print()} className={siteButton('primary', 'sm')}>
          <Printer aria-hidden /> Print or save as PDF
        </button>
      </div>
      <SiteCard className="overflow-hidden print:rounded-none print:border-0 print:shadow-none">
        <div className="flex items-center gap-4 border-b border-site-line bg-site-soft p-5 sm:p-7 print:bg-white">
          <div className="grid size-12 shrink-0 place-items-center rounded-site bg-site text-site-on">
            <Award className="size-6" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="site-h text-[20px] font-semibold leading-tight text-site-ink sm:text-[22px]">{r.school}</p>
            <p className="text-[13.5px] text-site-muted">
              {r.term} result · {r.session} session
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-px bg-site-line sm:grid-cols-4">
          {[
            ['Student', r.student.name],
            ['Admission no.', r.student.admissionNumber],
            ['Class', r.student.classArm],
            ['Position', r.position ? `${ordinal(r.position)} of ${r.classSize}` : '—'],
          ].map(([k, val]) => (
            <div key={k} className="min-w-0 bg-white p-4 sm:p-5">
              <dt className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-site-muted">{k}</dt>
              <dd className="mt-1 break-words text-[15px] font-semibold text-site-ink">{val}</dd>
            </div>
          ))}
        </dl>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[14px]">
            <thead>
              <tr className="border-y border-site-line bg-site-surface text-[12px] uppercase tracking-[0.08em] text-site-muted">
                <th className="px-5 py-3 font-semibold">Subject</th>
                <th className="px-3 py-3 text-right font-semibold">Score</th>
                <th className="px-3 py-3 text-right font-semibold">%</th>
                <th className="px-3 py-3 text-center font-semibold">Grade</th>
                <th className="px-5 py-3 font-semibold">Remark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-site-line">
              {r.subjects.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-site-muted">
                    No subject scores recorded for this term.
                  </td>
                </tr>
              ) : (
                r.subjects.map((s) => (
                  <tr key={s.subject}>
                    <td className="px-5 py-3 font-medium text-site-ink">{s.subject}</td>
                    <td className="px-3 py-3 text-right tabular">
                      {s.total ?? '—'}
                      <span className="text-site-muted">/{s.outOf}</span>
                    </td>
                    <td className="px-3 py-3 text-right tabular">{s.percent != null ? s.percent.toFixed(0) : '—'}</td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-grid min-w-8 place-items-center rounded-md bg-site-soft px-1.5 py-0.5 text-[13px] font-semibold text-site">{s.grade ?? '—'}</span>
                    </td>
                    <td className="px-5 py-3 text-site-muted">{s.remark ?? ''}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="grid gap-px border-t border-site-line bg-site-line sm:grid-cols-3">
          <div className="bg-white p-5">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-site-muted">Average</p>
            <p className="site-h mt-1 text-[26px] font-semibold text-site-ink tabular">{r.average != null ? `${r.average.toFixed(1)}%` : '—'}</p>
          </div>
          <div className="bg-white p-5">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-site-muted">Attendance</p>
            <p className="site-h mt-1 text-[26px] font-semibold text-site-ink tabular">{r.attendance ? `${r.attendance.present}/${r.attendance.total}` : '—'}</p>
            {r.attendance && <p className="text-[12.5px] text-site-muted">days present</p>}
          </div>
          <div className="bg-white p-5">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-site-muted">Class size</p>
            <p className="site-h mt-1 text-[26px] font-semibold text-site-ink tabular">{r.classSize}</p>
          </div>
        </div>
        {(r.teacherRemark || r.principalRemark) && (
          <div className="grid gap-6 border-t border-site-line p-5 sm:grid-cols-2 sm:p-7">
            {r.teacherRemark && (
              <div>
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-site-muted">Class teacher’s remark</p>
                <p className="mt-2 text-[15px] leading-relaxed text-site-ink">{r.teacherRemark}</p>
              </div>
            )}
            {r.principalRemark && (
              <div>
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-site-muted">{site.settings.about.leaderTitle ? `${site.settings.about.leaderTitle}’s remark` : 'Principal’s remark'}</p>
                <p className="mt-2 text-[15px] leading-relaxed text-site-ink">{r.principalRemark}</p>
              </div>
            )}
          </div>
        )}
      </SiteCard>
      <p className="mt-4 text-center text-[13px] text-site-muted print:hidden">
        This code can be used {r.usesLeft} more {r.usesLeft === 1 ? 'time' : 'times'}.
      </p>
    </Container>
  );
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
