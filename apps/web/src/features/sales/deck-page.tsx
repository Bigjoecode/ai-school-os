import { ArrowRight, ChevronLeft, ChevronRight, KeyRound, Lock, RefreshCw, ShieldCheck, WifiOff } from 'lucide-react';
import { type ReactNode, type TouchEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { BrandMark } from '@/components/layout/brand';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SALES_CONTACT, SIGNUP_PATH, isPlaceholder, showContact } from './config';
import { AUDIENCES, PROBLEMS, ROLLOUT } from './content';
import { LoopDiagram } from './loop-diagram';
import { PRICE_NOTE, PricingCards } from './pricing';
import { DemoContacts, PrintButton, SalesLayout, ShareButton } from './sales-layout';
import './sales.css';

function Slide({ kicker, title, children }: { kicker?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      {kicker && <p className="text-[12px] font-semibold uppercase tracking-wider text-brand md:text-[13px]">{kicker}</p>}
      <h2 className="mt-1 font-display text-[24px] font-semibold leading-tight tracking-tight md:text-[32px]">{title}</h2>
      <div className="mt-4 min-h-0 flex-1 md:mt-6">{children}</div>
    </div>
  );
}

const Bullets = ({ items, className }: { items: string[]; className?: string }) => (
  <ul className={cn('grid gap-2.5 text-[15px] md:text-[17px]', className)}>
    {items.map((t) => (
      <li key={t} className="flex gap-3">
        <span aria-hidden className="mt-[9px] size-2 shrink-0 rounded-full bg-brand" />
        <span>{t}</span>
      </li>
    ))}
  </ul>
);

const SLIDES: { id: string; label: string; render: () => ReactNode }[] = [
  {
    id: 'title',
    label: 'AI School OS',
    render: () => (
      <div className="flex h-full flex-col justify-center">
        <BrandMark className="size-14" />
        <h1 className="mt-6 font-display text-[34px] font-semibold leading-[1.05] tracking-tight md:text-[52px]">
          AI School <span className="text-ai-gradient">OS</span>
        </h1>
        <p className="mt-3 max-w-2xl text-[17px] text-muted-foreground md:text-[22px]">
          The school system for Nigerian schools: less paperwork for teachers, weekly updates for parents, and students ready for WAEC, BECE and JAMB.
        </p>
      </div>
    ),
  },
  {
    id: 'problem',
    label: 'The problem',
    render: () => (
      <Slide kicker="The problem" title="Three things every school tells us">
        <div className="grid gap-3 md:grid-cols-3">
          {PROBLEMS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-border bg-background p-4">
              <Icon className="size-7 text-brand" aria-hidden />
              <h3 className="mt-2 text-[17px] font-semibold">{title}</h3>
              <p className="mt-1 text-[14.5px] text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </Slide>
    ),
  },
  {
    id: 'solution',
    label: 'The solution',
    render: () => (
      <Slide kicker="The solution" title="One system for the whole school, with AI doing the drafting">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {AUDIENCES.map(({ key, icon: Icon, who, points }) => (
            <div key={key} className="rounded-2xl border border-border bg-background p-3.5">
              <p className="flex items-center gap-2 text-[15px] font-semibold">
                <Icon className="size-5 text-brand" aria-hidden /> {who}
              </p>
              <p className="mt-1 text-[13.5px] text-muted-foreground">{points[0]}</p>
            </div>
          ))}
          <div className="rounded-2xl border border-brand/30 bg-brand-soft p-3.5">
            <p className="flex items-center gap-2 text-[15px] font-semibold">
              <WifiOff className="size-5 text-brand" aria-hidden /> Works offline
            </p>
            <p className="mt-1 text-[13.5px]">Exam packs, the installed app and cached pages keep working on a poor connection.</p>
          </div>
        </div>
      </Slide>
    ),
  },
  {
    id: 'loop',
    label: 'The learning loop',
    render: () => (
      <Slide kicker="How it works" title="The learning loop">
        <div className="grid items-center gap-4 md:grid-cols-[1fr_minmax(0,360px)]">
          <Bullets
            items={[
              'Teach with lesson modules, notes and the weekly workbook',
              'Check understanding: classroom check-ins, homework, online tests',
              'Every result updates mastery of each syllabus topic, per student',
              'Class insights show the hardest topics and who needs support',
              'Re-teach or move on, with remedial lessons and practice drafted for you',
            ]}
          />
          <LoopDiagram className="mx-auto max-h-[46vh] md:max-h-none" />
        </div>
      </Slide>
    ),
  },
  {
    id: 'offline-exams',
    label: 'Offline exams',
    render: () => (
      <Slide kicker="Exam readiness" title="Computer-based exams, even without internet">
        <ol className="grid gap-3 md:grid-cols-4">
          {[
            { icon: Lock, t: 'Download', d: 'Encrypted exam packs go onto the hall devices ahead of time.' },
            { icon: KeyRound, t: 'Unlock', d: 'The invigilator gives a start code; shared devices use per-student PINs.' },
            { icon: WifiOff, t: 'Sit', d: 'Timer and answers run on the device. No internet needed.' },
            { icon: RefreshCw, t: 'Sync and mark', d: 'Signed hand-ins upload later, are marked by the server and flagged for review.' },
          ].map(({ icon: Icon, t, d }, i) => (
            <li key={t} className="rounded-2xl border border-border bg-background p-4">
              <span className="flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
                <span className="grid size-6 place-items-center rounded-full bg-brand text-[12px] text-brand-foreground">{i + 1}</span>
                <Icon className="size-4" aria-hidden />
              </span>
              <h3 className="mt-2 text-[17px] font-semibold">{t}</h3>
              <p className="mt-1 text-[14px] text-muted-foreground">{d}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[15px] text-muted-foreground md:text-[16px]">
          Students practise for the real thing in Exam Academy, built on the official WAEC, NECO BECE and JAMB UTME syllabi.
        </p>
      </Slide>
    ),
  },
  {
    id: 'parents',
    label: "Parents' weekly update",
    render: () => (
      <Slide kicker="Parents" title="A weekly update parents can act on">
        <div className="grid items-start gap-5 md:grid-cols-2">
          <Bullets
            items={[
              'Built from the week’s real evidence: check-ins, homework and tests',
              'In the parent app, by push notification or email',
              'In English, Pidgin, Yoruba, Igbo or Hausa',
              'Parents can ask the school on WhatsApp — answers cover only their own children',
              'Fees, results, report cards and attendance on the same phone',
            ]}
          />
          <figure className="rounded-2xl border border-border bg-background p-4 text-[14px]" aria-label="Example of the parts of a weekly update">
            <figcaption className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">What the update contains</figcaption>
            <p className="mt-3 rounded-lg bg-success-soft px-3 py-2">
              <b>Strong:</b> topics your child has mastered
            </p>
            <p className="mt-2 rounded-lg bg-info-soft px-3 py-2">
              <b>Improving:</b> topics moving up this week
            </p>
            <p className="mt-2 rounded-lg bg-warning-soft px-3 py-2">
              <b>Needs attention:</b> topics to work on
            </p>
            <p className="mt-2 rounded-lg bg-brand-soft px-3 py-2">
              <b>One thing to do at home</b> this week
            </p>
          </figure>
        </div>
      </Slide>
    ),
  },
  {
    id: 'games',
    label: 'EduGames',
    render: () => (
      <Slide kicker="Students" title="EduGames: learning they ask for, nursery to SS 3">
        <Bullets
          items={[
            'Quizzes, true or false, spelling, matching, word search and crosswords from the curriculum',
            'Content picked by the student’s stage and school year: early years, primary (Common Entrance), JSS (BECE) and SSS (WAEC/JAMB)',
            'Young mode for nursery to Primary 3: read-aloud, big targets, stars, no countdowns or leaderboards',
            'Early-years games: counting, shapes, letter sounds, telling the time and a Naira shop',
          ]}
        />
      </Slide>
    ),
  },
  {
    id: 'careers',
    label: 'Careers',
    render: () => (
      <Slide kicker="Students" title="Careers guidance with the JAMB brochure inside">
        <Bullets
          items={[
            'Institutions and programmes from JAMB’s IBASS brochure, with UTME subjects, O’level and Direct Entry requirements in JAMB’s own words',
            'An eligibility check that says “match” only when JAMB’s wording clearly confirms it, and shows the official text otherwise',
            'A careers counsellor in five languages that links each career to where it is offered',
            'No cut-off marks are guessed: students are pointed to the official portals',
          ]}
        />
      </Slide>
    ),
  },
  {
    id: 'pricing',
    label: 'Pricing',
    render: () => (
      <Slide kicker="Pricing" title="Per student, per term">
        <PricingCards dense />
        <p className="mt-3 text-[13px] text-muted-foreground">{PRICE_NOTE}</p>
      </Slide>
    ),
  },
  {
    id: 'rollout',
    label: 'Rollout',
    render: () => (
      <Slide kicker="Rollout" title="Running in a week, with a guided plan">
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {ROLLOUT.map((r) => (
            <li key={r.when} className="rounded-xl border border-border bg-background p-3">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-brand">{r.when}</p>
              <p className="text-[14.5px] font-semibold">{r.title}</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{r.what}</p>
            </li>
          ))}
          <li className="rounded-xl border border-brand/30 bg-brand-soft p-3">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-brand">Training</p>
            <p className="mt-0.5 text-[13px]">Short sessions for teachers, the bursar and admin staff, arranged with you. Each goal ticks itself in the app when the work is done.</p>
          </li>
        </ol>
      </Slide>
    ),
  },
  {
    id: 'data-protection',
    label: 'Data protection',
    render: () => (
      <Slide kicker="Trust" title="Children’s data, handled the NDPA way">
        <div className="grid items-start gap-5 md:grid-cols-[auto_1fr]">
          <ShieldCheck className="hidden size-20 text-success md:block" aria-hidden />
          <Bullets
            items={[
              'Parental consent before a child’s data is shown, with withdrawal — enforced on the server',
              'A data processing agreement for each school, consent records and data export on request',
              'Privacy notice, terms, sub-processors, AI use statement and retention schedule published at /legal (drafts awaiting legal review)',
              'Secrets encrypted at rest, payment webhooks verified, every sensitive action in the audit log',
            ]}
          />
        </div>
      </Slide>
    ),
  },
  {
    id: 'pilot',
    label: 'Pilot offer',
    render: () => (
      <Slide kicker="Pilot" title="Try it for one term, and measure it">
        <Bullets
          items={[
            'One term, the whole school or chosen classes',
            'The guided first week and staff training to start',
            'The success dashboard tracks adoption, learning and parent engagement every week',
            'A printable term impact report at the end, to decide on evidence',
          ]}
        />
        {!isPlaceholder(SALES_CONTACT.pilotTerms) ? (
          <p className="mt-4 rounded-xl bg-brand-soft px-4 py-3 text-[15px] font-medium">{SALES_CONTACT.pilotTerms}</p>
        ) : showContact(SALES_CONTACT.pilotTerms) ? (
          <p className="mt-4 rounded-xl border border-dashed border-warning px-4 py-3 text-[14px] text-warning">{SALES_CONTACT.pilotTerms}</p>
        ) : (
          <p className="mt-4 text-[14px] text-muted-foreground">Pilot terms are agreed with each school.</p>
        )}
      </Slide>
    ),
  },
  {
    id: 'contact',
    label: 'Contact',
    render: () => (
      <Slide kicker="Next step" title="See it in your school">
        <p className="max-w-2xl text-[16px] text-muted-foreground md:text-[18px]">Sign up online, or book a demo and we will set up your first week with you.</p>
        <div className="mt-5 print:hidden">
          <Button asChild variant="brand" size="lg">
            <Link to={SIGNUP_PATH}>
              Sign up your school <ArrowRight />
            </Link>
          </Button>
        </div>
        <DemoContacts className="mt-5" />
        <p className="mt-4 text-[13px] text-muted-foreground">
          {typeof window !== 'undefined' ? window.location.host : ''}/for-schools
        </p>
      </Slide>
    ),
  },
];

const slideFromHash = () => {
  const n = Number(window.location.hash.replace('#', ''));
  return Number.isInteger(n) && n >= 1 && n <= SLIDES.length ? n - 1 : 0;
};

/** /for-schools/deck — web slides: arrows, swipe, #n deep links; prints one slide per landscape A4 page. */
export default function DeckPage() {
  const [index, setIndex] = useState(slideFromHash);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const go = useCallback((n: number) => {
    setIndex((cur) => {
      const next = Math.max(0, Math.min(SLIDES.length - 1, n));
      if (next !== cur) window.history.replaceState(null, '', `#${next + 1}`);
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault();
        go(index + 1);
      } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        go(index - 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        go(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        go(SLIDES.length - 1);
      }
    };
    const onHash = () => setIndex(slideFromHash());
    window.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', onHash);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', onHash);
    };
  }, [go, index]);

  const onTouchStart = (e: TouchEvent) => {
    const p = e.touches[0];
    touch.current = p ? { x: p.clientX, y: p.clientY } : null;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touch.current;
    const p = e.changedTouches[0];
    touch.current = null;
    if (!start || !p) return;
    const dx = p.clientX - start.x;
    const dy = p.clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1));
  };

  return (
    <SalesLayout
      path="/for-schools/deck"
      wide
      actions={
        <>
          <PrintButton label="Print or save as PDF" />
          <ShareButton path="/for-schools/deck" />
        </>
      }
    >
      <div className="mx-auto max-w-6xl px-4 py-4 md:py-6 print:max-w-none print:p-0">
        <div
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          aria-roledescription="carousel"
          aria-label="AI School OS pitch deck"
          className="print:block"
        >
          {SLIDES.map((s, i) => (
            <section
              key={s.id}
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${SLIDES.length}: ${s.label}`}
              aria-hidden={i !== index ? true : undefined}
              className={cn(
                'sales-deck-slide relative min-h-[calc(100dvh-200px)] flex-col overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-soft md:aspect-[16/9] md:min-h-0 md:p-10 print:flex',
                i === index ? 'flex' : 'hidden',
              )}
            >
              <div className="min-h-0 flex-1 overflow-y-auto md:overflow-visible">{s.render()}</div>
              <div className="mt-3 flex items-center justify-between text-[11.5px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <BrandMark className="size-4" /> AI School OS
                </span>
                <span>
                  {i + 1} / {SLIDES.length}
                </span>
              </div>
            </section>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 print:hidden">
          <Button variant="outline" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous slide">
            <ChevronLeft /> <span className="hidden sm:inline">Previous</span>
          </Button>
          <div className="flex min-w-0 flex-1 flex-wrap justify-center gap-1.5" aria-label="Slides">
            {SLIDES.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-current={i === index ? 'step' : undefined}
                aria-label={`Slide ${i + 1}: ${s.label}`}
                title={s.label}
                onClick={() => go(i)}
                className={cn('h-2.5 rounded-full transition-all', i === index ? 'w-6 bg-brand' : 'w-2.5 bg-border-strong hover:bg-muted-foreground')}
              />
            ))}
          </div>
          <Button variant={index === SLIDES.length - 1 ? 'outline' : 'brand'} onClick={() => go(index + 1)} disabled={index === SLIDES.length - 1} aria-label="Next slide">
            <span className="hidden sm:inline">Next</span> <ChevronRight />
          </Button>
        </div>
        <p className="mt-3 text-center text-[12px] text-muted-foreground print:hidden" aria-live="polite">
          {SLIDES[index]!.label} · use the arrow keys or swipe · “Print or save as PDF” gives one slide per page
        </p>
      </div>
    </SalesLayout>
  );
}
