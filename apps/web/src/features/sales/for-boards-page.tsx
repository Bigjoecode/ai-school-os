import { ArrowRight, BarChart3, ClipboardCheck, FileSpreadsheet, ShieldCheck, WifiOff } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { SALES_CONTACT, showContact } from './config';
import { DemoContacts, PrintButton, SalesLayout, ShareButton } from './sales-layout';
import './sales.css';

const PILLARS = [
  {
    icon: WifiOff,
    title: 'Offline CBT at scale',
    points: [
      'Encrypted exam packs downloaded to hall devices before the day; no internet needed while candidates sit',
      'Invigilator start codes, and per-candidate PINs on shared devices',
      'Timer and answers kept on the device; signed hand-ins sync later and are marked by the server',
      'Integrity flags and teacher review before results are released',
    ],
  },
  {
    icon: BarChart3,
    title: 'Classroom engagement evidence',
    points: [
      'Lesson modules with live classroom check-ins (devices or show of hands) and a recorded re-teach / move-on decision',
      'Topic mastery per student against the WAEC, NECO BECE and JAMB UTME syllabi, with every piece of evidence logged by source',
      'A success dashboard per school: staff, student and parent activity, classes with work set, weekly learning updates opened',
      'A printable term impact report for each school',
    ],
  },
  {
    icon: FileSpreadsheet,
    title: 'Census and returns reports',
    points: [
      'Summary tables for the Annual School Census from the records schools already keep: enrolment, staff and classes',
      'Working candidate lists for exam-body registration',
      'In development now: table layouts will be checked against your state’s current forms before use',
    ],
  },
  {
    icon: ShieldCheck,
    title: 'Data protection',
    points: [
      'Built around the Nigeria Data Protection Act: parental consent before a child’s data is shown, with withdrawal, enforced on the server',
      'A data processing agreement with each school, consent records and data export on request',
      'Secrets encrypted at rest and sensitive actions audit-logged',
      'Policy drafts published at /legal and awaiting legal review; we will work with your legal and ICT teams',
    ],
  },
];

const PILOT = [
  { step: 'Scope', text: 'Agree the LGAs, the number of schools and classes, and what success looks like (for example: CBT sessions run offline, weekly check-ins, parent updates opened).' },
  { step: 'Set-up', text: 'Each school follows the guided first week: classes, staff and pupils imported, teachers signed in, first registers and activities.' },
  { step: 'Training', text: 'Short sessions for head teachers, teachers and ICT staff; an offline CBT dry run in each school before a live session.' },
  { step: 'Run', text: 'One term of teaching with check-ins and practice, and at least one offline CBT session per school.' },
  { step: 'Report', text: 'Each school’s term impact report and a summary across the pilot schools from the same measures, plus the census tables for review.' },
];

/** /for-boards — a short page for SUBEBs and state ministries of education. */
export default function ForBoardsPage() {
  return (
    <SalesLayout
      path="/for-boards"
      actions={
        <>
          <PrintButton />
          <ShareButton />
        </>
      }
    >
      <article className="sales-a4 mx-auto max-w-5xl px-4 pb-12 print:max-w-none print:px-0">
        <section className="py-10 sm:py-12 print:py-3">
          <p className="text-[12.5px] font-semibold uppercase tracking-wider text-brand">For SUBEBs and state ministries of education</p>
          <h1 className="mt-2 max-w-3xl font-display text-[30px] font-semibold leading-[1.1] tracking-tight sm:text-[40px] print:text-[22pt]">
            Computer-based exams without reliable internet, and evidence of what happens in class.
          </h1>
          <p className="mt-4 max-w-2xl text-[15.5px] text-muted-foreground print:text-[10.5pt]">
            AI School OS is a school management and learning system for Nigerian schools. For a state, it offers offline CBT that runs in schools with poor
            connectivity, classroom-level learning evidence, and returns built from records schools already keep.
          </p>
        </section>

        <div className="grid gap-3 md:grid-cols-2 print:grid-cols-2 print:gap-2">
          {PILLARS.map(({ icon: Icon, title, points }) => (
            <section key={title} className="rounded-2xl border border-border bg-card p-4 print:p-3">
              <h2 className="flex items-center gap-2 text-[17px] font-semibold print:text-[11.5pt]">
                <Icon className="size-5 text-brand" aria-hidden /> {title}
              </h2>
              <ul className="mt-2 grid gap-1.5 text-[13.5px] text-muted-foreground print:text-[9pt]">
                {points.map((p) => (
                  <li key={p} className="flex gap-2">
                    <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-brand print:mt-[5px]" />
                    {p}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <section aria-labelledby="pilot" className="mt-10 print:mt-4">
          <h2 id="pilot" className="flex items-center gap-2 font-display text-[22px] font-semibold tracking-tight print:text-[14pt]">
            <ClipboardCheck className="size-5 text-brand" aria-hidden /> Pilot proposal outline
          </h2>
          <p className="mt-1 text-[14px] text-muted-foreground print:text-[9.5pt]">A starting point for discussion; numbers, dates and costs are agreed with the board.</p>
          <ol className="mt-4 grid gap-2 print:gap-1.5">
            {PILOT.map((p, i) => (
              <li key={p.step} className="flex gap-3 rounded-xl border border-border bg-card p-3 print:p-2">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-[13px] font-semibold text-brand-foreground print:size-6">{i + 1}</span>
                <span>
                  <span className="block text-[14.5px] font-semibold print:text-[10pt]">{p.step}</span>
                  <span className="block text-[13.5px] text-muted-foreground print:text-[9pt]">{p.text}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[12.5px] text-muted-foreground print:text-[8.5pt]">
            Devices, power and connectivity for syncing are not included and should be planned with each school. Pricing for a state programme is agreed with the board
            rather than taken from the per-school plans.
          </p>
        </section>

        <section aria-labelledby="contact" className="mt-10 rounded-2xl border border-border bg-card p-5 print:mt-4 print:p-3">
          <h2 id="contact" className="font-display text-[20px] font-semibold tracking-tight print:text-[13pt]">
            Talk to us
          </h2>
          {showContact(SALES_CONTACT.contactName) && <p className="mt-1 text-[14px]">{SALES_CONTACT.contactName}</p>}
          <DemoContacts className="mt-3" />
          <div className="mt-4 flex flex-wrap gap-2 print:hidden">
            <Button asChild variant="outline">
              <Link to="/for-schools">
                The school brochure <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/legal">Privacy & legal documents</Link>
            </Button>
          </div>
        </section>
      </article>
    </SalesLayout>
  );
}
