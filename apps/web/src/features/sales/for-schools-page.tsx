import { ArrowRight, Calculator, Presentation, ShieldCheck, WifiOff } from 'lucide-react';
import { Link } from 'react-router';
import { BrandMark } from '@/components/layout/brand';
import { Button } from '@/components/ui/button';
import { SIGNUP_PATH } from './config';
import { AUDIENCES, HIGHLIGHTS, PROBLEMS } from './content';
import { LoopDiagram } from './loop-diagram';
import { PRICE_NOTE, PricingCards } from './pricing';
import { DemoContacts, PrintButton, SalesLayout, ShareButton } from './sales-layout';
import './sales.css';

/** /for-schools — the one-page brochure. Prints as a two-page A4 handout (or "Save as PDF" to share on WhatsApp). */
export default function ForSchoolsPage() {
  return (
    <SalesLayout
      path="/for-schools"
      actions={
        <>
          <PrintButton />
          <ShareButton />
        </>
      }
    >
      <article className="sales-a4 mx-auto max-w-5xl px-4 pb-12 print:max-w-none print:px-0 print:pb-0">
        {/* Print-only masthead */}
        <div className="hidden items-center justify-between border-b border-border pb-2 print:flex">
          <span className="flex items-center gap-2">
            <BrandMark className="size-6" />
            <span className="font-display text-[13pt] font-semibold">AI School OS</span>
          </span>
          <span className="text-[9pt] text-muted-foreground">{typeof window !== 'undefined' ? window.location.host : ''}/for-schools</span>
        </div>

        <section className="py-10 sm:py-14 print:py-4">
          <p className="text-[12.5px] font-semibold uppercase tracking-wider text-brand">For proprietors and principals in Nigeria</p>
          <h1 className="mt-2 max-w-3xl font-display text-[32px] font-semibold leading-[1.1] tracking-tight sm:text-[44px] print:text-[24pt]">
            Less paperwork for teachers. Parents who know every week. Students ready for their exams.
          </h1>
          <p className="mt-4 max-w-2xl text-[15.5px] text-muted-foreground sm:text-[17px] print:text-[11pt]">
            AI School OS runs your school in one place — lessons, tests, results, report cards, attendance, fees and parents — with AI that does the drafting and
            a learning loop that shows who needs help, topic by topic.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 print:hidden">
            <Button asChild variant="brand" size="lg">
              <Link to={SIGNUP_PATH}>
                Sign up your school <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="#demo">Book a demo</a>
            </Button>
          </div>
        </section>

        <section aria-labelledby="problems" className="print:pt-0">
          <h2 id="problems" className="font-display text-[22px] font-semibold tracking-tight print:text-[14pt]">
            Three problems it solves
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3 print:grid-cols-3 print:gap-2">
            {PROBLEMS.map(({ icon: Icon, title, body, answer }) => (
              <div key={title} className="rounded-2xl border border-border bg-card p-4 print:p-3">
                <Icon className="size-6 text-brand" aria-hidden />
                <h3 className="mt-2 text-[16px] font-semibold print:text-[11pt]">{title}</h3>
                <p className="mt-1 text-[13.5px] text-muted-foreground print:text-[9.5pt]">{body}</p>
                <p className="mt-3 border-t border-border pt-3 text-[13.5px] print:pt-2 print:text-[9.5pt]">
                  <span className="font-semibold text-brand">How: </span>
                  {answer}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="loop" className="mt-12 grid items-center gap-6 md:grid-cols-[1fr_380px] print:mt-5 print:grid-cols-[1fr_62mm] print:gap-4">
          <div>
            <h2 id="loop" className="font-display text-[22px] font-semibold tracking-tight print:text-[14pt]">
              The learning loop
            </h2>
            <p className="mt-2 text-[14.5px] text-muted-foreground print:text-[10pt]">
              Every check-in, homework and test updates each student’s mastery of each syllabus topic. Teachers see the hardest topics in their class and who needs
              support, then re-teach or move on with a remedial lesson or practice set drafted for them. Parents get a short weekly update from the same evidence:
              what is strong, what is improving, what needs attention and one thing to do at home.
            </p>
            <ul className="mt-4 grid gap-2 text-[13.5px] sm:grid-cols-2 print:text-[9.5pt]">
              <li className="rounded-xl bg-muted px-3 py-2">Lesson modules with classroom check-ins</li>
              <li className="rounded-xl bg-muted px-3 py-2">Weekly teacher workbook from the scheme of work</li>
              <li className="rounded-xl bg-muted px-3 py-2">WAEC, NECO BECE and JAMB UTME syllabi built in</li>
              <li className="rounded-xl bg-muted px-3 py-2">AI-drafted practice questions are reviewed before students see them</li>
            </ul>
          </div>
          <LoopDiagram className="mx-auto print:max-w-[62mm]" />
        </section>

        <section aria-labelledby="who" className="mt-12 print:mt-5">
          <h2 id="who" className="font-display text-[22px] font-semibold tracking-tight print:text-[14pt]">
            What each person gets
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3 print:gap-2">
            {AUDIENCES.map(({ key, icon: Icon, who, points }) => (
              <div key={key} className="rounded-2xl border border-border bg-card p-4 print:p-3">
                <h3 className="flex items-center gap-2 text-[15px] font-semibold print:text-[11pt]">
                  <Icon className="size-5 text-brand" aria-hidden /> {who}
                </h3>
                <ul className="mt-2 grid gap-1.5 text-[13.5px] text-muted-foreground print:text-[9pt]">
                  {points.map((p) => (
                    <li key={p} className="flex gap-2">
                      <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-brand print:mt-[5px]" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="rounded-2xl border border-brand/30 bg-brand-soft p-4 print:p-3">
              <h3 className="flex items-center gap-2 text-[15px] font-semibold print:text-[11pt]">
                <WifiOff className="size-5 text-brand" aria-hidden /> Works offline
              </h3>
              <p className="mt-2 text-[13.5px] print:text-[9pt]">
                Download encrypted CBT exam packs before the exam; students sit them in the hall with no internet, unlocked by the invigilator’s start code.
                Answers are signed on the device and marked when the connection returns. The app installs on phones and opens offline.
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="more" className="mt-12 print:mt-5">
          <h2 id="more" className="font-display text-[22px] font-semibold tracking-tight print:text-[14pt]">
            Also included
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3 print:gap-2">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3 rounded-2xl border border-border bg-card p-3.5 print:p-2.5">
                <Icon className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
                <span>
                  <span className="block text-[14px] font-semibold print:text-[10pt]">{title}</span>
                  <span className="block text-[13px] text-muted-foreground print:text-[8.5pt]">{body}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-muted-foreground print:text-[8.5pt]">
            Plus timetable, admissions, HR and payroll, library, transport, hostels, live classes, a school website builder and careers guidance with the JAMB
            brochure. Which modules you get depends on your plan.
          </p>
        </section>

        <section aria-labelledby="ndpa" className="mt-12 rounded-2xl border border-border bg-card p-5 print:mt-5 print:p-3">
          <h2 id="ndpa" className="flex items-center gap-2 font-display text-[20px] font-semibold tracking-tight print:text-[13pt]">
            <ShieldCheck className="size-5 text-success" aria-hidden /> Children’s data, protected
          </h2>
          <p className="mt-2 text-[14px] text-muted-foreground print:text-[9.5pt]">
            Built around the Nigeria Data Protection Act (NDPA): parents give consent before their child’s data is shown and can withdraw it; the server enforces
            it. Your school accepts a data processing agreement, and you can export what you hold about a person on request. The privacy notice, terms, DPA,
            sub-processors, AI use statement and retention schedule are public at <Link to="/legal" className="font-medium text-brand underline-offset-4 hover:underline">/legal</Link>{' '}
            (drafts awaiting legal review).
          </p>
        </section>

        <section aria-labelledby="pricing" className="mt-12 print:mt-5">
          <h2 id="pricing" className="font-display text-[22px] font-semibold tracking-tight print:text-[14pt]">
            Simple pricing, per student per term
          </h2>
          <PricingCards className="mt-4 print:grid-cols-3" dense={false} />
          <p className="mt-2 text-[12.5px] text-muted-foreground print:text-[8.5pt]">{PRICE_NOTE}</p>
          <div className="mt-4 flex flex-wrap gap-2 print:hidden">
            <Button asChild variant="outline">
              <Link to="/for-schools/calculator">
                <Calculator /> Estimate your savings
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/for-schools/deck">
                <Presentation /> View the slide deck
              </Link>
            </Button>
          </div>
        </section>

        <section id="demo" aria-labelledby="cta" className="mt-12 scroll-mt-28 rounded-3xl bg-primary p-6 text-primary-foreground sm:p-8 print:mt-5 print:rounded-xl print:border print:border-border print:bg-white print:p-4 print:text-foreground">
          <h2 id="cta" className="font-display text-[24px] font-semibold tracking-tight print:text-[14pt]">
            Start this term
          </h2>
          <p className="mt-1 max-w-2xl text-[14.5px] opacity-80 print:text-[10pt]">
            Sign up online and the guided first week takes you from an empty school to classes, teachers, parents and the first weekly updates in seven days. Or
            book a demo and we will walk you through it.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 print:hidden">
            <Button asChild variant="brand" size="lg">
              <Link to={SIGNUP_PATH}>
                Sign up your school <ArrowRight />
              </Link>
            </Button>
          </div>
          <div className="mt-5 rounded-2xl bg-background p-3 text-foreground print:p-0">
            <p className="mb-2 px-1 text-[12.5px] font-semibold uppercase tracking-wide text-muted-foreground">Book a demo</p>
            <DemoContacts />
          </div>
          <p className="mt-3 hidden text-[9pt] print:block">
            Sign up: {typeof window !== 'undefined' ? window.location.host : ''}
            {SIGNUP_PATH}
          </p>
        </section>
      </article>
    </SalesLayout>
  );
}
