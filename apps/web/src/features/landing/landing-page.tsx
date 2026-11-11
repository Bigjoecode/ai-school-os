import { LEGAL_DOCS, type SignupConfig } from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, ChevronDown, FlaskConical, Mail, Menu, MessageCircle, Phone, Quote, Sparkles, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { BrandMark } from '@/components/layout/brand';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toSalesPlan } from '../sales/config';
import { PlanCards, SessionBanner } from '../sales/pricing';
import { useSalesSeo } from '../sales/sales-layout';
import { contactCards, type ContactCard } from './contact-config';
import { AI_POINTS, AREAS, FACTS, FAQ, KEY_FEATURES, LAB_POINTS, PORTALS, REPORT_POINTS, STEPS } from './content';
import {
  AgentChatMock,
  AnalyticsMock,
  BrowserFrame,
  CheckList,
  DashboardMock,
  Illustration,
  LabCardMock,
  ParentPhoneMock,
  PhoneFrame,
  ReportSheetMock,
  SampleTag,
  TutorChatMock,
} from './mockups';
import { TESTIMONIALS } from './testimonials';
import './landing.css';

const NAV = [
  { href: '#top', label: 'Home' },
  { href: '#product', label: 'Product' },
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#contact', label: 'Contact' },
];

/** Adds `is-in` to each `.lp-reveal` as it scrolls into view (CSS only hides them when motion is allowed). */
function useReveal(root: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.classList.add('lp-motion');
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    el.querySelectorAll('.lp-reveal').forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [root]);
}

function Section({ id, className, children, labelledBy }: { id?: string; className?: string; children: ReactNode; labelledBy?: string }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn('px-4 py-16 sm:px-6 sm:py-24', className)}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[12.5px] font-semibold uppercase tracking-[0.14em] text-brand">{children}</p>;
}

function Heading({ id, eyebrow, title, intro, center }: { id: string; eyebrow: string; title: ReactNode; intro?: ReactNode; center?: boolean }) {
  return (
    <div className={cn('lp-reveal max-w-2xl', center && 'mx-auto text-center')}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 id={id} className="mt-3 font-display text-[28px] font-semibold leading-[1.15] tracking-tight sm:text-[38px]">
        {title}
      </h2>
      {intro && <p className="mt-4 text-[15.5px] leading-relaxed text-muted-foreground sm:text-[17px]">{intro}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ header

function Header() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <a href="#top" className="flex min-w-0 items-center gap-2.5" aria-label="AI School OS, back to the top">
          <BrandMark className="size-8" />
          <span className="font-display text-[16px] font-semibold tracking-tight">
            AI School <span className="text-ai-gradient">OS</span>
          </span>
        </a>
        <nav aria-label="Main" className="ml-6 hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-[14px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link to="/login">Log in</Link>
          </Button>
          <Button asChild variant="brand" className="hidden sm:inline-flex">
            <a href="#contact">Request a demo</a>
          </Button>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-expanded={open} aria-controls="lp-mobile-nav" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((o) => !o)}>
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>
      {open && (
        <nav id="lp-mobile-nav" aria-label="Main menu"className="border-t border-border bg-background px-4 pb-4 pt-2 lg:hidden">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-[15px] font-medium hover:bg-muted">
              {n.label}
            </a>
          ))}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button asChild variant="outline">
              <Link to="/login">Log in</Link>
            </Button>
            <Button asChild variant="brand">
              <a href="#contact" onClick={() => setOpen(false)}>
                Request a demo
              </a>
            </Button>
          </div>
        </nav>
      )}
    </header>
  );
}

// ------------------------------------------------------------------ hero

function Hero() {
  return (
    <section id="top" aria-labelledby="lp-hero-title" className="relative overflow-hidden px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-20">
      <div aria-hidden className="lp-hero-glow pointer-events-none absolute inset-0" />
      <div aria-hidden className="bg-grid lp-grid-fade pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-[12.5px] font-medium text-muted-foreground shadow-xs">
            <Sparkles className="size-3.5 text-ai-2" aria-hidden /> Built for Nigerian nursery, primary and secondary schools
          </p>
          <h1 id="lp-hero-title" className="mt-5 font-display text-[36px] font-semibold leading-[1.06] tracking-tight sm:text-[56px] lg:text-[64px]">
            Your whole school, <span className="text-ai-gradient">one intelligent system</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[16px] leading-relaxed text-muted-foreground sm:text-[18.5px]">
            Results, fees, attendance and exams for the office. AI assistants and lesson tools for teachers. Weekly updates and online payment for parents. An AI tutor, exam practice and 3D science labs for students.
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 min-[420px]:flex-row min-[420px]:items-center">
            <Button asChild variant="brand" size="lg">
              <a href="#contact">
                Request a demo <ArrowRight />
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="#product">See how it works</a>
            </Button>
          </div>
        </div>

        <Illustration
          label="Illustration with sample data: the principal's dashboard on a laptop and a parent's weekly learning update on a phone."
          className="relative mx-auto mt-14 max-w-5xl sm:mt-16"
        >
          <BrowserFrame sample className="lg:mr-40">
            <DashboardMock />
          </BrowserFrame>
          <div className="absolute -bottom-10 -right-4 hidden lg:block">
            <PhoneFrame>
              <ParentPhoneMock />
            </PhoneFrame>
          </div>
        </Illustration>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ sections

function KeyFeatures() {
  return (
    <Section className="pt-6 sm:pt-28" labelledBy="lp-key">
      <h2 id="lp-key" className="sr-only">
        Key features
      </h2>
      <div className="grid gap-5 md:grid-cols-3">
        {KEY_FEATURES.map((f) => (
          <div key={f.title} className="lp-reveal rounded-2xl border border-border bg-card p-6 shadow-soft">
            <span className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand">
              <f.icon className="size-5" aria-hidden />
            </span>
            <h3 className="mt-4 text-[18px] font-semibold leading-snug">{f.title}</h3>
            <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Facts() {
  return (
    <section aria-labelledby="lp-facts" className="px-4 sm:px-6">
      <div className="lp-reveal relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-[#0b1330] px-6 py-10 text-white sm:px-10 sm:py-12">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-80 rounded-full bg-[#6366f1]/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-10 size-72 rounded-full bg-[#22d3ee]/20 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_2fr] lg:items-center">
          <div>
            <h2 id="lp-facts" className="font-display text-[26px] font-semibold leading-tight tracking-tight sm:text-[32px]">
              One sign-in page. Everyone gets their own portal.
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-white/70">Staff, parents and students all sign in at your school’s address and see only what their role allows.</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-7">
            {FACTS.map((f) => (
              <div key={f.label} className="border-l-2 border-white/15 pl-4">
                <dt className="sr-only">{f.label}</dt>
                <dd>
                  <span className="block font-display text-[40px] font-semibold leading-none tabular sm:text-[48px]">{f.value}</span>
                  <span className="mt-2 block text-[13.5px] leading-snug text-white/75">{f.label}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <Section id="product" labelledBy="lp-how">
      <Heading id="lp-how" eyebrow="How it works" title="From setup to your first parent update in a week" intro="A guided first week inside the app takes your school from the basics to a full term’s rhythm. Each goal ticks itself off as the work gets done." />
      <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="lp-reveal relative rounded-2xl border border-border bg-card p-5">
            <span className="font-display text-[13px] font-semibold text-brand tabular">Step {i + 1}</span>
            <h3 className="mt-2 text-[17px] font-semibold">{s.title}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{s.body}</p>
            {i < STEPS.length - 1 && <ArrowRight aria-hidden className="absolute -right-3.5 top-1/2 z-10 hidden size-5 -translate-y-1/2 rounded-full bg-background text-muted-foreground lg:block" />}
          </li>
        ))}
      </ol>
      <div className="lp-reveal mt-10 grid items-center gap-6 rounded-3xl border border-border bg-background-subtle p-5 sm:p-8 lg:grid-cols-2">
        <div>
          <h3 className="font-display text-[22px] font-semibold tracking-tight">Every school its own private space</h3>
          <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
            Each school on AI School OS has its own records, its own portal address and its own roles. What a teacher, bursar or parent can see is set by the permissions on their role, and changes are kept in an audit log. Your
            data can be backed up and exported whenever you want it.
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-2 text-[13.5px]">
          {['Roles and permissions', 'Audit log', 'Two-step sign-in', 'Backup and export', 'Parental consent records', 'Installs on phones like an app'].map((t) => (
            <li key={t} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
              <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden /> {t}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function Reports() {
  return (
    <Section className="bg-background-subtle" labelledBy="lp-reports">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <Heading id="lp-reports" eyebrow="Results and report sheets" title="Report cards that look like your school made them" intro="Teachers enter scores once. The system works out totals, grades and positions and lays them out on your own report sheet." />
          <CheckList items={REPORT_POINTS} className="lp-reveal mt-7" />
        </div>
        <Illustration label="Illustration with sample data: a printed report sheet with subject scores, grades, trait ratings and an approved AI-drafted remark." className="lp-reveal">
          <div className="mx-auto max-w-lg rotate-[0.6deg]">
            <ReportSheetMock />
          </div>
          <SampleTag className="absolute -top-3 right-4" />
        </Illustration>
      </div>
    </Section>
  );
}

function Areas() {
  return (
    <Section id="features" labelledBy="lp-areas">
      <Heading id="lp-areas" eyebrow="Features" title="Everything a school runs on, in four parts" intro="Start with what you need. Standard covers the core of the school; Premium adds HR, payroll, operations and more." center />
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {AREAS.map((a) => (
          <div key={a.title} className="lp-reveal flex flex-col rounded-2xl border border-border bg-card p-5 shadow-soft">
            <span className="grid size-10 place-items-center rounded-xl bg-ai-gradient text-white">
              <a.icon className="size-5" aria-hidden />
            </span>
            <h3 className="mt-4 text-[17px] font-semibold">{a.title}</h3>
            <p className="mt-1 text-[13.5px] text-muted-foreground">{a.body}</p>
            <ul className="mt-4 space-y-2 border-t border-border pt-4 text-[13.5px]">
              {a.items.map((i) => (
                <li key={i} className="flex items-start gap-2">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
                  {i}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

function AiSection() {
  return (
    <Section className="relative overflow-hidden" labelledBy="lp-ai">
      <div aria-hidden className="lp-hero-glow pointer-events-none absolute inset-0 opacity-70" />
      <div className="relative grid items-center gap-12 lg:grid-cols-2">
        <div className="lg:order-2">
          <Heading id="lp-ai" eyebrow="AI assistants" title={<>Ten assistants that know your school, <span className="text-ai-gradient">and stop at a draft</span></>} />
          <CheckList items={AI_POINTS} className="lp-reveal mt-7" />
        </div>
        <Illustration label="Illustration with sample data: the Principal AI listing three things that need attention this week and a drafted reminder waiting for review." className="lp-reveal lg:order-1">
          <AgentChatMock />
        </Illustration>
      </div>
    </Section>
  );
}

function Portals() {
  const [active, setActive] = useState(PORTALS[0]!.key);
  const p = PORTALS.find((x) => x.key === active)!;
  return (
    <Section className="bg-background-subtle" labelledBy="lp-portals">
      <Heading id="lp-portals" eyebrow="Portals" title="Built for each person who uses it" center />
      <div role="tablist" aria-label="Portals" className="lp-reveal no-scrollbar mx-auto mt-8 flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1 sm:w-fit">
        {PORTALS.map((x) => (
          <button
            key={x.key}
            role="tab"
            id={`lp-tab-${x.key}`}
            aria-selected={x.key === active}
            aria-controls={`lp-panel-${x.key}`}
            onClick={() => setActive(x.key)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-[13.5px] font-medium transition-colors',
              x.key === active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <x.icon className="size-4" aria-hidden /> {x.who}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`lp-panel-${p.key}`} aria-labelledby={`lp-tab-${p.key}`} className="mt-10 grid items-center gap-10 lg:grid-cols-2">
        <div>
          <h3 className="font-display text-[24px] font-semibold tracking-tight sm:text-[28px]">{p.title}</h3>
          <CheckList items={p.points} className="mt-6" />
        </div>
        <div className="flex justify-center">
          {p.key === 'parent' ? (
            <Illustration label="Illustration with sample data: a parent's weekly learning update on a phone, with attendance, last result and a fees button.">
              <PhoneFrame>
                <ParentPhoneMock />
              </PhoneFrame>
            </Illustration>
          ) : p.key === 'student' ? (
            <Illustration label="Illustration with sample data: the AI tutor explaining fraction division and remembering what the student finds hard." className="w-full max-w-md">
              <TutorChatMock />
            </Illustration>
          ) : p.key === 'staff' ? (
            <Illustration label="Illustration with sample data: the staff overview with attendance and fee figures and a bar chart of attendance by class." className="w-full max-w-lg">
              <BrowserFrame>
                <DashboardMock compact />
              </BrowserFrame>
            </Illustration>
          ) : (
            <div className="grid w-full max-w-md grid-cols-2 gap-3 text-[13px]">
              {['Schools and branches', 'Plans and modules', 'Billing', 'Custom domains', 'Support tickets', 'System health'].map((t) => (
                <div key={t} className="rounded-2xl border border-border bg-card p-4 font-medium shadow-soft">
                  <CheckCircle2 className="mb-2 size-4 text-success" aria-hidden />
                  {t}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

function Practicals() {
  return (
    <Section labelledBy="lp-labs">
      <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <Heading
            id="lp-labs"
            eyebrow="Exam Academy and Practical Academy"
            title="WAEC, NECO, BECE and JAMB practice, with a science lab in every pocket"
            intro="Students practise on the exam syllabi and sit full mocks, including a UTME mock that looks like the real CBT screen. For practicals, schools without a well-stocked laboratory still get hands-on experiments."
          />
          <CheckList items={LAB_POINTS} className="lp-reveal mt-7" />
        </div>
        <Illustration label="Illustration with sample data: a 3D chemistry lab card for an acid–base titration practical test, with steps ticked and the average titre." className="lp-reveal mx-auto w-full max-w-sm">
          <LabCardMock />
          <div className="absolute -bottom-5 -left-4 hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-[12px] font-medium shadow-lift sm:flex">
            <FlaskConical className="size-4 text-brand" aria-hidden /> Marked and sent to the score sheet
          </div>
        </Illustration>
      </div>
    </Section>
  );
}

function Analytics() {
  return (
    <Section className="bg-background-subtle" labelledBy="lp-analytics">
      <Heading
        id="lp-analytics"
        eyebrow="Analytics"
        title="See the whole school at a glance"
        intro="The success dashboard brings attendance, fees, parent engagement and learning together. Class insights show which topics each class has mastered and who needs support, so teachers know what to re-teach."
        center
      />
      <Illustration label="Illustration with sample data: the school success dashboard with attendance, fees and parent figures, a fees-collected line chart, a topic mastery heatmap and a list of students who need attention." className="lp-reveal mx-auto mt-12 max-w-5xl">
        <BrowserFrame sample>
          <AnalyticsMock />
        </BrowserFrame>
      </Illustration>
    </Section>
  );
}

/** Real quotes only: nothing renders until testimonials.ts has entries. */
function Testimonials() {
  if (TESTIMONIALS.length === 0) return null;
  return (
    <Section labelledBy="lp-quotes">
      <Heading id="lp-quotes" eyebrow="From our schools" title="What schools say" center />
      <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {TESTIMONIALS.map((t) => (
          <figure key={t.name + t.school} className="lp-reveal rounded-2xl border border-border bg-card p-6">
            <Quote className="size-6 text-brand" aria-hidden />
            <blockquote className="mt-3 text-[15px] leading-relaxed">{t.quote}</blockquote>
            <figcaption className="mt-4 text-[13px]">
              <span className="font-semibold">{t.name}</span>
              <span className="block text-muted-foreground">
                {t.role}, {t.school}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}

function Pricing() {
  const q = useQuery({ queryKey: ['signup', 'config'], queryFn: ({ signal }) => api.get<SignupConfig>('/signup/config', undefined, signal), staleTime: 60_000, meta: { silent: true } });
  const c = q.data;
  const plans = c?.plans.map(toSalesPlan) ?? [];
  return (
    <Section id="pricing" labelledBy="lp-pricing">
      <Heading id="lp-pricing" eyebrow="Pricing" title="Priced per student, per term" intro="Pick the plan that fits your school. Groups and large schools can ask us for a quote." center />
      {c && plans.length > 0 ? (
        <div className="lp-reveal mt-12">
          <SessionBanner pct={c.sessionDiscountPct} className="mx-auto mb-8 max-w-2xl" />
          <PlanCards plans={plans} dense signupOpen={c.enabled} onTalk={() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' })} />
          <p className="mt-6 text-center text-[13.5px] text-muted-foreground">
            Prices exclude VAT.{' '}
            <Link to="/pricing" className="font-medium text-brand hover:underline">
              See every feature, add-ons and how billing works
            </Link>
          </p>
        </div>
      ) : (
        <div className="lp-reveal mx-auto mt-10 max-w-xl rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-[15px]">{q.isLoading ? 'Loading the price list…' : 'Tell us about your school and we will send you a quote.'}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button asChild variant="brand">
              <a href="#contact">Get a quote</a>
            </Button>
            <Button asChild variant="outline">
              <Link to="/pricing">See the plans</Link>
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}

const CARD_ICON = { phone: Phone, whatsapp: MessageCircle, email: Mail } as const;

function ContactCardItem({ c }: { c: ContactCard }) {
  const Icon = CARD_ICON[c.key];
  const body = (
    <>
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-[12.5px] text-white/70">{c.label}</span>
        <span className="block truncate text-[15px] font-semibold">{c.value}</span>
        {c.placeholder && <span className="block text-[11px] text-amber-300">Placeholder: hidden on the live site until filled in</span>}
      </span>
    </>
  );
  const cls = 'flex items-center gap-3 rounded-2xl border border-white/15 bg-white/5 p-4 transition-colors';
  return c.href ? (
    <a href={c.href} target={c.key === 'whatsapp' ? '_blank' : undefined} rel={c.key === 'whatsapp' ? 'noopener noreferrer' : undefined} className={cn(cls, 'hover:bg-white/10')}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function DemoForm() {
  const [form, setForm] = useState({ schoolName: '', contactName: '', email: '', phone: '', students: '', message: '', website: '' });
  const [done, setDone] = useState(false);
  const send = useMutation({
    mutationFn: () =>
      api.post('/signup/enquiry', {
        ...form,
        planId: null,
        students: Number(form.students) || 0,
        branches: 1,
        message: `Demo request from the landing page.${form.message.trim() ? ` ${form.message.trim()}` : ''}`,
      }),
    onSuccess: () => setDone(true),
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  if (done) {
    return (
      <div className="rounded-2xl bg-card p-6 text-card-foreground" role="status">
        <CheckCircle2 className="size-7 text-success" aria-hidden />
        <p className="mt-3 text-[17px] font-semibold">Thank you. We have your request.</p>
        <p className="mt-1 text-[14px] text-muted-foreground">We will call or email you to arrange the demo.</p>
      </div>
    );
  }
  return (
    <form
      className="grid gap-3 rounded-2xl bg-card p-5 text-card-foreground shadow-pop sm:grid-cols-2 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        send.mutate();
      }}
    >
      <p className="text-[17px] font-semibold sm:col-span-2">Request a demo</p>
      <Field label="School name" htmlFor="lp-school" className="sm:col-span-2">
        <Input id="lp-school" required minLength={3} value={form.schoolName} onChange={set('schoolName')} autoComplete="organization" />
      </Field>
      <Field label="Your name" htmlFor="lp-name">
        <Input id="lp-name" required minLength={2} value={form.contactName} onChange={set('contactName')} autoComplete="name" />
      </Field>
      <Field label="Phone" htmlFor="lp-phone">
        <Input id="lp-phone" required type="tel" inputMode="tel" placeholder="0803 123 4567" value={form.phone} onChange={set('phone')} autoComplete="tel" />
      </Field>
      <Field label="Email" htmlFor="lp-email">
        <Input id="lp-email" required type="email" value={form.email} onChange={set('email')} autoComplete="email" />
      </Field>
      <Field label="Students (roughly)" htmlFor="lp-students">
        <Input id="lp-students" required type="number" inputMode="numeric" min={1} value={form.students} onChange={set('students')} />
      </Field>
      <Field label="Anything we should know?" htmlFor="lp-msg" optional className="sm:col-span-2">
        <Textarea id="lp-msg" rows={3} value={form.message} onChange={set('message')} />
      </Field>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={form.website} onChange={set('website')} />
      {send.error && (
        <p role="alert" className="text-[13px] text-danger sm:col-span-2">
          {errorMessage(send.error)}
        </p>
      )}
      <Button type="submit" variant="brand" size="lg" loading={send.isPending} className="sm:col-span-2">
        Send request <ArrowRight />
      </Button>
      <p className="text-[12px] text-muted-foreground sm:col-span-2">
        We use these details only to contact you about AI School OS. See our{' '}
        <Link to="/legal/privacy" className="underline underline-offset-2">
          privacy notice
        </Link>
        .
      </p>
    </form>
  );
}

function Contact() {
  const cards = contactCards();
  return (
    <section id="contact" aria-labelledby="lp-contact" className="px-4 py-16 sm:px-6 sm:py-24">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-[#0b1330] px-5 py-10 text-white sm:px-10 sm:py-14">
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 size-96 rounded-full bg-[#8b5cf6]/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 right-0 size-96 rounded-full bg-[#22d3ee]/15 blur-3xl" />
        <div className="relative grid gap-10 lg:grid-cols-2 lg:items-start">
          <div className="lp-reveal">
            <p className="text-[12.5px] font-semibold uppercase tracking-[0.14em] text-[#a5b4fc]">Contact</p>
            <h2 id="lp-contact" className="mt-3 font-display text-[30px] font-semibold leading-tight tracking-tight sm:text-[40px]">
              See it with your own school’s day in mind
            </h2>
            <p className="mt-4 text-[15.5px] leading-relaxed text-white/75">Tell us about your school and we will walk you through the parts that matter to you, then send a quote.</p>
            {cards.length > 0 && (
              <div className="mt-8 grid gap-3">
                {cards.map((c) => (
                  <ContactCardItem key={c.key} c={c} />
                ))}
              </div>
            )}
          </div>
          <div className="lp-reveal">
            <DemoForm />
          </div>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <Section id="faq" className="pt-4 sm:pt-8" labelledBy="lp-faq">
      <Heading id="lp-faq" eyebrow="FAQ" title="Questions schools ask us" center />
      <div className="mx-auto mt-10 max-w-3xl divide-y divide-border rounded-2xl border border-border bg-card">
        {FAQ.map((f) => (
          <details key={f.q} className="group px-5 py-1 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-4 text-[15.5px] font-semibold">
              {f.q}
              <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <p className="pb-5 text-[14.5px] leading-relaxed text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

function Footer() {
  const cols: { title: string; links: { label: string; to?: string; href?: string }[] }[] = [
    {
      title: 'Product',
      links: [
        { label: 'How it works', href: '#product' },
        { label: 'Features', href: '#features' },
        { label: 'Pricing', href: '#pricing' },
        { label: 'FAQ', href: '#faq' },
      ],
    },
    {
      title: 'For schools',
      links: [
        { label: 'Brochure', to: '/for-schools' },
        { label: 'Pitch deck', to: '/for-schools/deck' },
        { label: 'Savings calculator', to: '/for-schools/calculator' },
        { label: 'For state boards', to: '/for-boards' },
      ],
    },
    {
      title: 'Get started',
      links: [
        { label: 'Log in', to: '/login' },
        { label: 'Plans and sign-up', to: '/pricing' },
        { label: 'Request a demo', href: '#contact' },
        { label: 'Become an ambassador', to: '/ambassadors' },
      ],
    },
    {
      title: 'Legal',
      links: LEGAL_DOCS.filter((d) => ['privacy', 'children', 'terms', 'dpa'].includes(d.slug)).map((d) => ({ label: d.title, to: `/legal/${d.slug}` })),
    },
  ];
  return (
    <footer className="border-t border-border bg-background-subtle px-4 pb-10 pt-14 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.3fr_repeat(4,1fr)]">
        <div>
          <span className="flex items-center gap-2.5">
            <BrandMark className="size-8" />
            <span className="font-display text-[16px] font-semibold tracking-tight">
              AI School <span className="text-ai-gradient">OS</span>
            </span>
          </span>
          <p className="mt-3 max-w-xs text-[13.5px] leading-relaxed text-muted-foreground">The school management system with AI for Nigerian schools.</p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:col-span-4">
          {cols.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <p className="text-[13px] font-semibold">{c.title}</p>
              <ul className="mt-3 space-y-2 text-[13.5px] text-muted-foreground">
                {c.links.map((l) => (
                  <li key={l.label}>
                    {l.to ? (
                      <Link to={l.to} className="hover:text-foreground">
                        {l.label}
                      </Link>
                    ) : (
                      <a href={l.href} className="hover:text-foreground">
                        {l.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="mx-auto mt-10 max-w-6xl border-t border-border pt-6 text-[12.5px] text-muted-foreground">© {new Date().getFullYear()} AI School OS</div>
    </footer>
  );
}

/** The public product landing page: the portal root for signed-out visitors (see landing-gate.tsx). */
export default function LandingPage() {
  useSalesSeo('/');
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  return (
    <div ref={root} className="lp-root min-h-dvh bg-background text-foreground">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:shadow-pop">
        Skip to content
      </a>
      <Header />
      <main id="main">
        <Hero />
        <KeyFeatures />
        <Facts />
        <HowItWorks />
        <Reports />
        <Areas />
        <AiSection />
        <Portals />
        <Practicals />
        <Analytics />
        <Testimonials />
        <Pricing />
        <Contact />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
