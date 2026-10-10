import { Info, RotateCcw } from 'lucide-react';
import { type ReactNode, useEffect, useId, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { inputClass } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { DEFAULT_INPUTS, assumption, calculate, inputsFromSearch, inputsToSearch, type CalcInputs } from './calc';
import { SALES_PLANS, SIGNUP_PATH, naira } from './config';
import { PRICE_NOTE } from './pricing';
import { PrintButton, SalesLayout, ShareButton } from './sales-layout';
import './sales.css';

const hrs = (n: number) => `${new Intl.NumberFormat('en-NG', { maximumFractionDigits: n < 10 ? 1 : 0 }).format(n)} h`;

function Num({
  label,
  hint,
  value,
  onChange,
  suffix,
  prefix,
  step = 1,
}: {
  label: ReactNode;
  hint?: ReactNode;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  prefix?: string;
  step?: number;
}) {
  const id = useId();
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="grid content-start gap-1">
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      <div className="relative flex items-center">
        {prefix && <span className="pointer-events-none absolute left-3 text-[14px] text-muted-foreground">{prefix}</span>}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step={step}
          value={text}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value !== '' && Number.isFinite(n) && n >= 0) onChange(n);
            if (e.target.value === '') onChange(0);
          }}
          className={cn(inputClass, 'sales-num tabular-nums', prefix && 'pl-7', suffix && 'pr-16')}
        />
        {suffix && <span className="pointer-events-none absolute right-3 text-[12.5px] text-muted-foreground">{suffix}</span>}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-[12px] text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function Group({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-border bg-card p-4">
      <legend className="px-1 text-[14px] font-semibold">{title}</legend>
      {note && <p className="-mt-1 mb-3 text-[12.5px] text-muted-foreground">{note}</p>}
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Row({ label, value, strong, sub }: { label: ReactNode; value: ReactNode; strong?: boolean; sub?: ReactNode }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-1.5', strong && 'border-t border-border pt-2.5')}>
      <dt className={cn('text-[13.5px]', strong ? 'font-semibold' : 'text-muted-foreground')}>
        {label}
        {sub && <span className="block text-[11.5px] font-normal text-muted-foreground">{sub}</span>}
      </dt>
      <dd className={cn('shrink-0 text-right tabular-nums', strong ? 'text-[16px] font-semibold' : 'text-[14px]')}>{value}</dd>
    </div>
  );
}

/** /for-schools/calculator — savings estimate with every assumption visible and editable; the link carries the figures. */
export default function CalculatorPage() {
  const [search, setSearch] = useSearchParams();
  const [inputs, setInputs] = useState<CalcInputs>(() => inputsFromSearch(search));
  const r = useMemo(() => calculate(inputs), [inputs]);

  // Keep the figures in the link so "Share" sends exactly what is on screen.
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(inputsToSearch(inputs), { replace: true, preventScrollReset: true }), 400);
    return () => window.clearTimeout(t);
  }, [inputs, setSearch]);

  const set =
    <K extends keyof CalcInputs>(key: K) =>
    (v: CalcInputs[K]) =>
      setInputs((cur) => ({ ...cur, [key]: v }));

  const lessonA = assumption('aiLessonPlans');
  const remarkA = assumption('aiReportRemarks');
  const cbtA = assumption('autoMarkedCbt');
  const hwA = assumption('aiHomeworkMarking');
  const moneyEntered = inputs.teacherSalary > 0 || inputs.printedExamCost > 0 || inputs.smsCost > 0 || inputs.collectionGainPts > 0;

  return (
    <SalesLayout
      path="/for-schools/calculator"
      wide
      actions={
        <>
          <PrintButton label="Print" />
          <ShareButton text="Our AI School OS savings estimate (every assumption shown):" />
        </>
      }
    >
      <div className="sales-a4 mx-auto max-w-6xl px-4 pb-12 pt-6 print:max-w-none print:px-0">
        <h1 className="font-display text-[28px] font-semibold tracking-tight sm:text-[34px] print:text-[18pt]">Savings calculator</h1>
        <p className="mt-1 max-w-3xl text-[14.5px] text-muted-foreground print:text-[10pt]">
          An <b className="text-foreground">estimate</b> for your school. The starting figures are examples, not measurements: replace them with your own. Every
          assumption is listed below and can be changed; the minutes saved per task are the same ones the in-app success dashboard uses.
        </p>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_380px] print:block">
          <form className="grid gap-4 print:hidden" onSubmit={(e) => e.preventDefault()} aria-label="Your school's figures">
            <Group title="Your school">
              <div className="grid content-start gap-1">
                <label htmlFor="calc-plan" className="text-[13px] font-medium">
                  Plan
                </label>
                <select id="calc-plan" value={inputs.plan} onChange={(e) => set('plan')(e.target.value)} className={cn(inputClass, 'appearance-auto')}>
                  {SALES_PLANS.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name} — {naira(p.price)} per student per term
                    </option>
                  ))}
                </select>
              </div>
              <Num label="Students" value={inputs.students} onChange={set('students')} />
              <Num label="Teachers" value={inputs.teachers} onChange={set('teachers')} />
              <Num label="Teaching weeks per term" value={inputs.weeksPerTerm} onChange={set('weeksPerTerm')} suffix="weeks" />
            </Group>

            <Group title="Teacher time today" note="Per teacher, in a normal week. Your best guess is fine.">
              <Num label="Hours on lesson notes" value={inputs.lessonNoteHours} onChange={set('lessonNoteHours')} suffix="h / week" step={0.5} />
              <Num label="Hours marking" value={inputs.markingHours} onChange={set('markingHours')} suffix="h / week" step={0.5} />
              <Num
                label="Share of marking that is objective questions"
                hint="Multiple choice and true/false that could move to online tests."
                value={inputs.objectiveSharePct}
                onChange={set('objectiveSharePct')}
                suffix="%"
              />
              <Num label="Written homework scripts marked" value={inputs.homeworkScripts} onChange={set('homeworkScripts')} suffix="/ week" />
              <Num label="Report-card remarks per student" hint="Per term, e.g. 1 for the class teacher's remark." value={inputs.remarksPerStudent} onChange={set('remarksPerStudent')} />
              <Num
                label="Share of this work done with the app"
                hint="Adoption: not every teacher uses every tool in the first term."
                value={inputs.adoptionPct}
                onChange={set('adoptionPct')}
                suffix="%"
              />
            </Group>

            <Group title="Costs and fees" note="Leave at 0 anything you do not want to count.">
              <Num label="Average teacher salary" value={inputs.teacherSalary} onChange={set('teacherSalary')} prefix="₦" suffix="/ month" step={1000} hint="To put a naira value on the hours. Not a cash saving." />
              <Num label="Teacher working hours" value={inputs.teacherHoursPerMonth} onChange={set('teacherHoursPerMonth')} suffix="h / month" />
              <Num label="Printing exam and test papers" value={inputs.printedExamCost} onChange={set('printedExamCost')} prefix="₦" suffix="/ term" step={1000} />
              <Num label="Share of papers moved to CBT" value={inputs.cbtSharePct} onChange={set('cbtSharePct')} suffix="%" />
              <Num label="SMS to parents" value={inputs.smsCost} onChange={set('smsCost')} prefix="₦" suffix="/ term" step={1000} />
              <Num
                label="Share of SMS replaced"
                hint="By in-app, push and email messages, which carry no per-message charge."
                value={inputs.smsReplacedPct}
                onChange={set('smsReplacedPct')}
                suffix="%"
              />
              <Num label="School fees per student" value={inputs.feePerStudent} onChange={set('feePerStudent')} prefix="₦" suffix="/ term" step={1000} />
              <Num label="Fees collected today" value={inputs.collectionRatePct} onChange={set('collectionRatePct')} suffix="%" />
              <Num
                label="Your assumed improvement in collection"
                hint="Percentage points, e.g. from online payment. We make no claim here: 0 unless you have a reason."
                value={inputs.collectionGainPts}
                onChange={set('collectionGainPts')}
                suffix="points"
              />
            </Group>

            <Group title="Assumptions: minutes saved" note="From the success dashboard (packages/shared success.ts). Change them if your experience differs.">
              <Num label="Lesson note written by hand" value={inputs.lessonNoteManualMin} onChange={set('lessonNoteManualMin')} suffix="min" hint={lessonA.basis} />
              <Num label={`Saved per ${lessonA.per} with an AI draft`} value={inputs.lessonNoteSavedMin} onChange={set('lessonNoteSavedMin')} suffix="min" />
              <Num label={`Saved per ${remarkA.per}`} value={inputs.remarkSavedMin} onChange={set('remarkSavedMin')} suffix="min" hint={remarkA.basis} step={0.5} />
              <Num label={`Saved per ${hwA.per} with AI suggestions`} value={inputs.homeworkSavedMin} onChange={set('homeworkSavedMin')} suffix="min" hint={hwA.basis} step={0.5} />
              <p className="flex gap-2 text-[12px] text-muted-foreground sm:col-span-2">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Objective questions in online tests are marked automatically ({cbtA.minutes} min per {cbtA.per} on the dashboard), so all of that marking time is
                counted as saved.
              </p>
            </Group>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" onClick={() => setInputs(DEFAULT_INPUTS)}>
                <RotateCcw /> Back to the example figures
              </Button>
            </div>
          </form>

          <aside aria-labelledby="calc-result" aria-live="polite" className="grid gap-4 lg:sticky lg:top-28">
            <div className="rounded-2xl border border-brand/40 bg-card p-4 shadow-soft print:shadow-none">
              <p className="text-[11.5px] font-semibold uppercase tracking-wider text-warning">Estimate</p>
              <h2 id="calc-result" className="text-[15px] font-semibold">
                Teacher hours saved per term
              </h2>
              <p className="mt-1 font-display text-[40px] font-semibold leading-none tracking-tight tabular-nums">{hrs(r.hours.total)}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                About {hrs(r.hours.perTeacherPerWeek)} per teacher per week, out of {hrs(r.currentHours)} a term now spent on lesson notes and marking.
              </p>
              <dl className="mt-3">
                <Row label="Lesson notes" value={hrs(r.hours.lessonNotes)} />
                <Row label="Report-card remarks" value={hrs(r.hours.remarks)} />
                <Row label="Objective marking (online tests)" value={hrs(r.hours.objectiveMarking)} />
                <Row label="Homework marking" value={hrs(r.hours.homeworkMarking)} />
              </dl>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-[11.5px] font-semibold uppercase tracking-wider text-warning">Estimate · per term</p>
              <dl className="mt-1">
                <Row label="Paper saved" value={naira(r.paperSaved)} />
                <Row label="SMS saved" value={naira(r.smsSaved)} />
                <Row label="Extra fees collected" sub="Only if you entered an improvement" value={naira(r.extraFees)} />
                <Row label="Cash benefit" value={naira(r.cashBenefit)} strong />
                <Row label="Value of teacher hours" sub={r.hourlyCost > 0 ? `at ${naira(r.hourlyCost)} an hour; time, not cash` : 'enter a salary to value them'} value={naira(r.timeValue)} />
              </dl>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">Cost · per term</p>
              <dl className="mt-1">
                <Row label={`${r.plan.name} plan`} sub={`${naira(r.pricePerStudent)} × ${inputs.students.toLocaleString('en-NG')} students`} value={naira(r.cost)} strong />
                <Row label="Price per student" value={naira(r.pricePerStudent)} />
                <Row label="Cash benefit per student" value={naira(r.cashBenefitPerStudent)} />
                <Row label="Cash + time value per student" value={naira(r.totalBenefitPerStudent)} />
                <Row
                  label="Payback"
                  sub="Weeks of benefit (cash + time value) to equal the term's cost"
                  value={r.paybackWeeks == null ? '—' : r.paybackWeeks > inputs.weeksPerTerm ? `${Math.ceil(r.paybackWeeks)} weeks (beyond one term)` : `${Math.ceil(r.paybackWeeks)} weeks`}
                />
              </dl>
              {r.planTooSmall && (
                <p className="mt-2 rounded-lg bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
                  The {r.plan.name} plan is for up to {r.plan.maxStudents?.toLocaleString('en-NG')} students. Choose a larger plan.
                </p>
              )}
              {!moneyEntered && <p className="mt-2 text-[12.5px] text-muted-foreground">Enter your costs (salary, printing, SMS) to see naira benefits and payback.</p>}
              <p className="mt-2 text-[11.5px] text-muted-foreground">{PRICE_NOTE}</p>
            </div>

            <div className="flex flex-wrap gap-2 print:hidden">
              <Button asChild variant="brand">
                <Link to={SIGNUP_PATH}>Sign up your school</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/for-schools#demo">Book a demo</Link>
              </Button>
            </div>
          </aside>
        </div>

        {/* Printed copy of the figures used (the form is hidden in print). */}
        <section className="mt-6 hidden print:block">
          <h2 className="text-[12pt] font-semibold">Figures used</h2>
          <p className="mt-1 text-[9pt] text-muted-foreground">
            {inputs.students} students, {inputs.teachers} teachers, {inputs.weeksPerTerm} weeks; lesson notes {inputs.lessonNoteHours} h and marking {inputs.markingHours} h
            per teacher per week ({inputs.objectiveSharePct}% objective); {inputs.homeworkScripts} homework scripts per teacher per week; {inputs.remarksPerStudent} remark(s) per
            student; {inputs.adoptionPct}% done with the app. Minutes saved: lesson note {inputs.lessonNoteSavedMin} of {inputs.lessonNoteManualMin}, remark {inputs.remarkSavedMin},
            homework script {inputs.homeworkSavedMin}. Salary {naira(inputs.teacherSalary)}/month over {inputs.teacherHoursPerMonth} h; printing {naira(inputs.printedExamCost)} ({inputs.cbtSharePct}% to CBT); SMS{' '}
            {naira(inputs.smsCost)} ({inputs.smsReplacedPct}% replaced); fees {naira(inputs.feePerStudent)} at {inputs.collectionRatePct}% collected, +{inputs.collectionGainPts} points assumed.
          </p>
        </section>
      </div>
    </SalesLayout>
  );
}
