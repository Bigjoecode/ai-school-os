import { WEBSITE_SECTIONS, websiteSettingsSchema, type WebsiteSection, type WebsiteSettings } from '@aischool/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Check } from 'lucide-react';
import * as React from 'react';
import { useLocation } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useSaveSettings, useWebsiteOverview } from './api';
import { AiDraftButton, ImageUpload, PairListEditor, SectionCard, StringListEditor, pairList, str, strList } from './ui';

const NAV = [
  ['theme', 'Theme'],
  ['hero', 'Home page'],
  ['about', 'About'],
  ['academics', 'Academics'],
  ['admissions', 'Admissions'],
  ['contact', 'Contact & social'],
  ['faq', 'FAQ'],
  ['sections', 'Pages on/off'],
  ['seo', 'Search engines'],
] as const;

const SECTION_COPY: Record<WebsiteSection, { label: string; description: string }> = {
  news: { label: 'News', description: 'News page and the latest posts on the home page' },
  events: { label: 'Events', description: 'Public events from the school calendar' },
  gallery: { label: 'Gallery', description: 'Photo albums' },
  teachers: { label: 'Teachers', description: 'Profiles of staff you choose to show' },
  results: { label: 'Results checker', description: 'Parents check results with an access code' },
  downloads: { label: 'Downloads', description: 'Prospectus, forms and policies' },
  fees: { label: 'School fees', description: 'This term’s fee schedule from Finance' },
  stats: { label: 'School numbers', description: 'Student, teacher and class counts on the home page' },
  assistant: { label: 'AI assistant', description: 'A chat widget that answers visitors from your published facts' },
  alumni: { label: 'Alumni', description: 'A page where old students sign up and keep their details current' },
};

/** Empty optional text becomes null, as the API expects. */
function normalise(s: WebsiteSettings): WebsiteSettings {
  const n = (v: string | null) => (v && v.trim() ? v.trim() : null);
  return {
    ...s,
    hero: { ...s.hero, imageUrl: n(s.hero.imageUrl) },
    about: { ...s.about, leaderName: n(s.about.leaderName), leaderTitle: n(s.about.leaderTitle), leaderMessage: n(s.about.leaderMessage), leaderPhotoUrl: n(s.about.leaderPhotoUrl), founded: n(s.about.founded) },
    academics: { ...s.academics, highlights: s.academics.highlights.filter((x) => x.trim()) },
    admissions: { ...s.admissions, requirements: s.admissions.requirements.filter((x) => x.trim()), entryTerms: s.admissions.entryTerms.filter((x) => x.trim()) },
    contact: { address: n(s.contact.address), phone: n(s.contact.phone), whatsapp: n(s.contact.whatsapp), email: n(s.contact.email), hours: n(s.contact.hours), mapUrl: n(s.contact.mapUrl) },
    social: { facebook: n(s.social.facebook), instagram: n(s.social.instagram), x: n(s.social.x), youtube: n(s.social.youtube), linkedin: n(s.social.linkedin) },
    seo: { title: n(s.seo.title), description: n(s.seo.description) },
  };
}

export default function WebsitePagesTab() {
  const q = useWebsiteOverview();
  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data)
    return (
      <div className="space-y-5">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-56 rounded-2xl" />
        ))}
      </div>
    );
  return <Editor saved={q.data.settings} />;
}

function Editor({ saved }: { saved: WebsiteSettings }) {
  const [s, setS] = React.useState<WebsiteSettings>(saved);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const save = useSaveSettings();
  const dirty = React.useMemo(() => JSON.stringify(normalise(s)) !== JSON.stringify(normalise({ ...saved, published: s.published })), [s, saved]);
  const { hash } = useLocation();

  React.useEffect(() => {
    if (!hash) return;
    const t = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    return () => window.clearTimeout(t);
  }, [hash]);

  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = <K extends keyof WebsiteSettings>(k: K, patch: Partial<WebsiteSettings[K]>) => setS((x) => ({ ...x, [k]: { ...(x[k] as object), ...patch } }));
  const err = (path: string) => errors[path];

  const onSave = () => {
    const body = normalise({ ...s, published: saved.published });
    const parsed = websiteSettingsSchema.safeParse(body);
    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const i of parsed.error.issues) map[i.path.join('.')] ??= i.message;
      setErrors(map);
      const first = parsed.error.issues[0];
      toast.error(`Check ${first.path.slice(0, 2).join(' → ')}: ${first.message}`);
      document.getElementById(String(first.path[0]))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setErrors({});
    save.mutate(parsed.data, {
      onSuccess: (next) => {
        setS(next);
        toast.success(saved.published ? 'Saved — your website is updated' : 'Saved — preview it, then publish from the Overview');
      },
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[180px_1fr] [&>*]:min-w-0">
      <nav aria-label="Page sections" className="hidden lg:block">
        <ul className="sticky top-24 space-y-0.5">
          {NAV.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className={cn('block rounded-lg px-3 py-1.5 text-[13px] transition-colors hover:bg-muted', hash === `#${id}` ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground')}>
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-5 pb-24">
        <SectionCard id="theme" title="Theme" description="Your colours and the overall feel of the site.">
          <div className="grid gap-5 sm:grid-cols-2 [&>*]:min-w-0">
            <ColourField id="t-primary" label="Main colour" value={s.theme.primaryColor} error={err('theme.primaryColor')} onChange={(primaryColor) => set('theme', { primaryColor })} />
            <ColourField id="t-accent" label="Accent colour" value={s.theme.accentColor} error={err('theme.accentColor')} onChange={(accentColor) => set('theme', { accentColor })} />
          </div>
          <div>
            <p className="mb-2 text-[13px] font-medium">Style</p>
            <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Style">
              {(
                [
                  ['MODERN', 'Modern', 'Clean sans-serif, soft corners', 'font-display'],
                  ['CLASSIC', 'Classic', 'Elegant serif headings, crisp edges', 'font-serif'],
                  ['WARM', 'Warm', 'Friendly, rounded, warm paper tones', 'font-display'],
                ] as const
              ).map(([v, label, desc, font]) => {
                const on = s.theme.style === v;
                return (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set('theme', { style: v })}
                    className={cn('relative overflow-hidden rounded-xl border p-3 text-left transition-[border-color,box-shadow]', on ? 'border-brand shadow-[0_0_0_3px_var(--brand-soft)]' : 'border-border hover:border-border-strong')}
                  >
                    <div className={cn('mb-3 h-16 overflow-hidden border border-black/5 p-2.5', v === 'CLASSIC' ? 'rounded-sm bg-[#fcfbf8]' : v === 'WARM' ? 'rounded-2xl bg-[#fffbf6]' : 'rounded-lg bg-white')}>
                      <div className={cn('text-[13px] font-semibold leading-tight text-[#0b1220]', font)}>Aa — Welcome</div>
                      <div className={cn('mt-2 h-3.5 w-16', v === 'CLASSIC' ? 'rounded-sm' : 'rounded-full')} style={{ background: s.theme.primaryColor }} />
                    </div>
                    <p className="text-[13px] font-semibold">{label}</p>
                    <p className="text-[12px] text-muted-foreground">{desc}</p>
                    {on && <Check className="absolute right-3 top-3 size-4 text-brand" aria-hidden />}
                  </button>
                );
              })}
            </div>
          </div>
        </SectionCard>

        <SectionCard
          id="hero"
          title="Home page"
          description="The first thing visitors see."
          actions={<AiDraftButton kind="HERO" onApply={(d) => set('hero', { title: str(d.title) || s.hero.title, subtitle: str(d.subtitle) || s.hero.subtitle, primaryCta: str(d.primaryCta) || s.hero.primaryCta })} />}
        >
          <Field label="Headline" htmlFor="h-title" error={err('hero.title')} hint={`${s.hero.title.length}/120`}>
            <Input id="h-title" value={s.hero.title} maxLength={120} onChange={(e) => set('hero', { title: e.target.value })} />
          </Field>
          <Field label="Introduction" htmlFor="h-sub" error={err('hero.subtitle')} hint={`${s.hero.subtitle.length}/300`}>
            <Textarea className="h-auto" id="h-sub" rows={2} value={s.hero.subtitle} maxLength={300} onChange={(e) => set('hero', { subtitle: e.target.value })} />
          </Field>
          <Field label="Button text" htmlFor="h-cta" error={err('hero.primaryCta')} className="max-w-xs">
            <Input id="h-cta" value={s.hero.primaryCta} maxLength={40} onChange={(e) => set('hero', { primaryCta: e.target.value })} />
          </Field>
          <ImageUpload label="Background photo (optional — a colour gradient is used without one)" value={s.hero.imageUrl} onChange={(imageUrl) => set('hero', { imageUrl })} />
        </SectionCard>

        <SectionCard
          id="about"
          title="About"
          description="Your story, mission, values and a word from the head."
          actions={
            <AiDraftButton
              kind="ABOUT"
              onApply={(d) => {
                const values = pairList(d.values, 'title', 'description').slice(0, 8);
                set('about', { story: str(d.story) || s.about.story, mission: str(d.mission) || s.about.mission, vision: str(d.vision) || s.about.vision, ...(values.length ? { values } : {}) });
              }}
            />
          }
        >
          <Field label="Our story" htmlFor="a-story" error={err('about.story')} hint="Separate paragraphs with a blank line.">
            <Textarea className="h-auto" id="a-story" rows={7} value={s.about.story} onChange={(e) => set('about', { story: e.target.value })} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2 [&>*]:min-w-0">
            <Field label="Mission" htmlFor="a-mission" error={err('about.mission')}>
              <Textarea className="h-auto" id="a-mission" rows={2} value={s.about.mission} onChange={(e) => set('about', { mission: e.target.value })} />
            </Field>
            <Field label="Vision" htmlFor="a-vision" error={err('about.vision')}>
              <Textarea className="h-auto" id="a-vision" rows={2} value={s.about.vision} onChange={(e) => set('about', { vision: e.target.value })} />
            </Field>
          </div>
          <Field label="Founded" htmlFor="a-founded" optional className="max-w-[160px]" error={err('about.founded')}>
            <Input id="a-founded" value={s.about.founded ?? ''} placeholder="e.g. 2009" maxLength={10} onChange={(e) => set('about', { founded: e.target.value })} />
          </Field>
          <div>
            <p className="mb-2 text-[13px] font-medium">Values</p>
            <PairListEditor items={s.about.values} keys={['title', 'description']} labels={['Value', 'What it means']} max={8} addLabel="Add a value" onChange={(values) => set('about', { values })} />
          </div>
          <div className="rounded-xl border border-border p-4">
            <p className="mb-3 text-[13px] font-semibold">Message from the head</p>
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                <Field label="Name" htmlFor="a-lname" optional>
                  <Input id="a-lname" value={s.about.leaderName ?? ''} onChange={(e) => set('about', { leaderName: e.target.value })} />
                </Field>
                <Field label="Title" htmlFor="a-ltitle" optional>
                  <Input id="a-ltitle" value={s.about.leaderTitle ?? ''} placeholder="e.g. Principal" onChange={(e) => set('about', { leaderTitle: e.target.value })} />
                </Field>
              </div>
              <Field label="Message" htmlFor="a-lmsg" optional error={err('about.leaderMessage')}>
                <Textarea className="h-auto" id="a-lmsg" rows={4} value={s.about.leaderMessage ?? ''} onChange={(e) => set('about', { leaderMessage: e.target.value })} />
              </Field>
              <ImageUpload round label="Photo" value={s.about.leaderPhotoUrl} onChange={(leaderPhotoUrl) => set('about', { leaderPhotoUrl })} />
            </div>
          </div>
        </SectionCard>

        <SectionCard
          id="academics"
          title="Academics"
          description="Classes and subjects are added automatically from Academic Setup."
          actions={
            <AiDraftButton
              kind="ACADEMICS"
              onApply={(d) => {
                const programmes = pairList(d.programmes, 'title', 'description').slice(0, 10);
                const highlights = strList(d.highlights).slice(0, 10);
                set('academics', { intro: str(d.intro) || s.academics.intro, ...(programmes.length ? { programmes } : {}), ...(highlights.length ? { highlights } : {}) });
              }}
            />
          }
        >
          <Field label="Introduction" htmlFor="ac-intro" error={err('academics.intro')}>
            <Textarea className="h-auto" id="ac-intro" rows={4} value={s.academics.intro} onChange={(e) => set('academics', { intro: e.target.value })} />
          </Field>
          <div>
            <p className="mb-2 text-[13px] font-medium">Programmes</p>
            <PairListEditor items={s.academics.programmes} keys={['title', 'description']} labels={['Programme, e.g. Junior secondary', 'Description']} max={10} addLabel="Add a programme" onChange={(programmes) => set('academics', { programmes })} />
          </div>
          <div>
            <p className="mb-2 text-[13px] font-medium">Highlights</p>
            <StringListEditor items={s.academics.highlights} placeholder="Highlight" max={10} addLabel="Add a highlight" onChange={(highlights) => set('academics', { highlights })} />
          </div>
        </SectionCard>

        <SectionCard
          id="admissions"
          title="Admissions"
          description="Applications from this page go to Reception’s enquiries."
          actions={
            <AiDraftButton
              kind="ADMISSIONS"
              onApply={(d) => {
                const steps = pairList(d.steps, 'title', 'description').slice(0, 8);
                const requirements = strList(d.requirements).slice(0, 15);
                set('admissions', { intro: str(d.intro) || s.admissions.intro, ...(steps.length ? { steps } : {}), ...(requirements.length ? { requirements } : {}) });
              }}
            />
          }
        >
          <SwitchRow label="Accepting applications" description="When off, the form is replaced by a ‘closed for now’ message.">
            <Switch checked={s.admissions.open} onCheckedChange={(open) => set('admissions', { open })} />
          </SwitchRow>
          <Field label="Introduction" htmlFor="ad-intro" error={err('admissions.intro')}>
            <Textarea className="h-auto" id="ad-intro" rows={3} value={s.admissions.intro} onChange={(e) => set('admissions', { intro: e.target.value })} />
          </Field>
          <div>
            <p className="mb-2 text-[13px] font-medium">Steps</p>
            <PairListEditor items={s.admissions.steps} keys={['title', 'description']} labels={['Step', 'What happens']} max={8} addLabel="Add a step" multiline={false} onChange={(steps) => set('admissions', { steps })} />
          </div>
          <div className="grid gap-5 md:grid-cols-2 [&>*]:min-w-0">
            <div>
              <p className="mb-2 text-[13px] font-medium">Requirements</p>
              <StringListEditor items={s.admissions.requirements} placeholder="Requirement" max={15} addLabel="Add a requirement" onChange={(requirements) => set('admissions', { requirements })} />
            </div>
            <div>
              <p className="mb-2 text-[13px] font-medium">Entry terms</p>
              <StringListEditor items={s.admissions.entryTerms} placeholder="e.g. January" max={6} addLabel="Add an entry term" onChange={(entryTerms) => set('admissions', { entryTerms })} />
            </div>
          </div>
        </SectionCard>

        <SectionCard id="contact" title="Contact & social" description="Shown on the Contact page, in the footer and to the AI assistant.">
          <Field label="Address" htmlFor="c-address" optional error={err('contact.address')}>
            <Textarea className="h-auto" id="c-address" rows={2} value={s.contact.address ?? ''} onChange={(e) => set('contact', { address: e.target.value })} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2 [&>*]:min-w-0">
            <Field label="Phone" htmlFor="c-phone" optional error={err('contact.phone')}>
              <Input id="c-phone" type="tel" value={s.contact.phone ?? ''} onChange={(e) => set('contact', { phone: e.target.value })} />
            </Field>
            <Field label="WhatsApp" htmlFor="c-wa" optional error={err('contact.whatsapp')}>
              <Input id="c-wa" type="tel" value={s.contact.whatsapp ?? ''} onChange={(e) => set('contact', { whatsapp: e.target.value })} />
            </Field>
            <Field label="Email" htmlFor="c-email" optional error={err('contact.email')}>
              <Input id="c-email" type="email" value={s.contact.email ?? ''} onChange={(e) => set('contact', { email: e.target.value })} />
            </Field>
            <Field label="Office hours" htmlFor="c-hours" optional error={err('contact.hours')}>
              <Input id="c-hours" value={s.contact.hours ?? ''} placeholder="Monday–Friday, 7:30am–4pm" onChange={(e) => set('contact', { hours: e.target.value })} />
            </Field>
          </div>
          <Field label="Map link" htmlFor="c-map" optional error={err('contact.mapUrl')} hint="Paste a Google Maps link. Without one, we link to a search for your address.">
            <Input id="c-map" type="url" value={s.contact.mapUrl ?? ''} placeholder="https://maps.google.com/…" onChange={(e) => set('contact', { mapUrl: e.target.value })} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2 [&>*]:min-w-0">
            {(
              [
                ['facebook', 'Facebook'],
                ['instagram', 'Instagram'],
                ['x', 'X (Twitter)'],
                ['youtube', 'YouTube'],
                ['linkedin', 'LinkedIn'],
              ] as const
            ).map(([k, label]) => (
              <Field key={k} label={label} htmlFor={`so-${k}`} optional error={err(`social.${k}`)}>
                <Input id={`so-${k}`} type="url" value={s.social[k] ?? ''} placeholder="https://" onChange={(e) => set('social', { [k]: e.target.value })} />
              </Field>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          id="faq"
          title="Frequently asked questions"
          description="Shown on the FAQ page — and the AI assistant uses them to answer visitors."
          actions={
            <AiDraftButton
              kind="FAQ"
              onApply={(d) => {
                const faq = pairList(d.faq, 'question', 'answer').slice(0, 30);
                if (faq.length) setS((x) => ({ ...x, faq }));
              }}
            />
          }
        >
          {s.faq.length === 0 && <p className="text-[13px] text-muted-foreground">No questions yet. Add the ones parents ask the office most.</p>}
          <PairListEditor items={s.faq} keys={['question', 'answer']} labels={['Question', 'Answer']} max={30} addLabel="Add a question" onChange={(faq) => setS((x) => ({ ...x, faq }))} />
        </SectionCard>

        <SectionCard id="sections" title="Pages on/off" description="Hide pages you’re not ready to use. Home, About, Academics, Admissions and Contact are always on.">
          <div className="grid gap-3 md:grid-cols-2">
            {WEBSITE_SECTIONS.map((k) => (
              <SwitchRow key={k} label={SECTION_COPY[k].label} description={SECTION_COPY[k].description}>
                <Switch checked={s.sections[k] !== false} onCheckedChange={(v) => setS((x) => ({ ...x, sections: { ...x.sections, [k]: v } }))} />
              </SwitchRow>
            ))}
          </div>
        </SectionCard>

        <SectionCard id="seo" title="Search engines" description="How your site appears on Google and when shared on WhatsApp.">
          <Field label="Page title" htmlFor="seo-title" optional error={err('seo.title')} hint={`${(s.seo.title ?? '').length}/70 — defaults to your school’s name`}>
            <Input id="seo-title" value={s.seo.title ?? ''} maxLength={70} onChange={(e) => set('seo', { title: e.target.value })} />
          </Field>
          <Field label="Description" htmlFor="seo-desc" optional error={err('seo.description')} hint={`${(s.seo.description ?? '').length}/160`}>
            <Textarea className="h-auto" id="seo-desc" rows={2} value={s.seo.description ?? ''} maxLength={160} onChange={(e) => set('seo', { description: e.target.value })} />
          </Field>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">Search preview</p>
            <p className="mt-2 truncate text-[17px] text-[#1a0dab] dark:text-[#8ab4f8]">{s.seo.title || 'Your school'}</p>
            <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{s.seo.description || s.hero.subtitle}</p>
          </div>
        </SectionCard>
      </div>

      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none sticky bottom-4 z-20 flex justify-center lg:col-span-2 lg:justify-start lg:pl-[204px]"
          >
            <div className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-2xl border border-border bg-popover/95 p-2 pl-4 shadow-pop backdrop-blur">
              {Object.keys(errors).length ? <AlertTriangle className="size-4 shrink-0 text-danger" aria-hidden /> : <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden />}
              <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{Object.keys(errors).length ? 'Fix the highlighted fields' : 'Unsaved changes'}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setS(saved);
                  setErrors({});
                }}
              >
                Discard
              </Button>
              <Button size="sm" onClick={onSave} loading={save.isPending}>
                Save changes
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ColourField({ id, label, value, onChange, error }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string }) {
  const [text, setText] = React.useState(value);
  React.useEffect(() => setText(value), [value]);
  return (
    <Field label={label} htmlFor={id} error={error}>
      <div className="flex items-center gap-2">
        <label className="relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-border shadow-xs" style={{ background: value }}>
          <span className="sr-only">Pick {label.toLowerCase()}</span>
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" />
        </label>
        <Input
          id={id}
          value={text}
          maxLength={7}
          className="font-mono uppercase"
          onChange={(e) => {
            const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
            setText(v);
            if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v.toLowerCase());
          }}
        />
      </div>
    </Field>
  );
}
