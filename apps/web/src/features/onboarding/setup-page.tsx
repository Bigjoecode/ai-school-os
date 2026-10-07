import { STAGE_KEYS, STAGE_TEMPLATES, SUBJECT_TEMPLATES, type SetupStatus, type SetupStep, type StageKey } from '@aischool/shared';
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  CalendarDays,
  Check,
  CircleAlert,
  CircleCheck,
  ExternalLink,
  GraduationCap,
  Layers,
  Users,
  Trophy,
  X,
} from 'lucide-react';
import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useStructure } from '@/features/academics/api';
import { errorMessage } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCanRunFirstWeek, useImportKinds, useSetupClasses, useSetupStatus, useSetupSubjects, useSetupYear } from './api';
import { FirstWeekPanel } from './first-week';
import { ProgressRing, stepHref } from './ui';

export default function SetupPage() {
  const { data, isLoading, error, refetch } = useSetupStatus();
  const { hash } = useLocation();
  const [params, setParams] = useSearchParams();
  const canPlan = useCanRunFirstWeek();
  // A #section link always means the checklist; ?tab=first-week opens the plan.
  const tab = canPlan && !hash && params.get('tab') === 'first-week' ? 'first-week' : 'checklist';
  const setTab = (t: string) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (t === 'first-week') p.set('tab', t);
        else p.delete('tab');
        p.delete('invite');
        return p;
      },
      { replace: true },
    );

  // Jump to #year / #classes / #subjects once the sections exist.
  useEffect(() => {
    if (!data || !hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) window.setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }, [data, hash]);

  const checklist =
    error && !data ? (
      <Card>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Card>
    ) : isLoading || !data ? (
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] [&>*]:min-w-0">
        <Skeleton className="h-[480px] rounded-2xl" />
        <div className="space-y-6">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    ) : (
      <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)] [&>*]:min-w-0">
        <Checklist status={data} />
        <div className="space-y-6">
          <YearSection status={data} />
          <ClassesSection status={data} />
          <SubjectsSection status={data} />
          <PeopleSection status={data} />
        </div>
      </div>
    );

  return (
    <Page>
      <PageHeader
        title="Set up your school"
        description={
          tab === 'first-week'
            ? 'A day-by-day plan from setup to the learning loop running: work set and marked, mastery for every child, and parents kept in the picture.'
            : 'A short checklist to get your school ready for day one. Every step can be repeated safely — nothing you already have is changed.'
        }
      />
      {canPlan ? (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="checklist">Setup checklist</TabsTrigger>
            <TabsTrigger value="first-week">Your first week</TabsTrigger>
          </TabsList>
          <TabsContent value="checklist">{checklist}</TabsContent>
          <TabsContent value="first-week" className="mx-auto max-w-3xl">
            <FirstWeekPanel />
          </TabsContent>
        </Tabs>
      ) : (
        checklist
      )}
    </Page>
  );
}

// ------------------------------------------------------------------ checklist

function Checklist({ status }: { status: SetupStatus }) {
  const required = status.steps.filter((s) => s.key !== 'results');
  const done = required.filter((s) => s.done).length;
  return (
    <Card className="lg:sticky lg:top-20">
      <div className="flex items-center gap-4 border-b border-border p-5">
        <ProgressRing value={status.progressPct} size={56} stroke={5} />
        <div className="min-w-0">
          <p className="font-display text-[15px] font-semibold tracking-tight">{status.progressPct >= 100 ? 'Your school is ready' : `${status.progressPct}% ready`}</p>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {done} of {required.length} steps done
          </p>
        </div>
      </div>
      <ol className="p-2">
        {status.steps.map((step, i) => (
          <ChecklistRow key={step.key} step={step} index={i + 1} />
        ))}
      </ol>
    </Card>
  );
}

function ChecklistRow({ step, index }: { step: SetupStep; index: number }) {
  const href = stepHref(step);
  const inPage = href.startsWith('/setup#');
  const content = (
    <>
      <span
        className={cn(
          'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10.5px] font-semibold tabular-nums',
          step.done ? 'bg-success text-white' : 'border border-border-strong bg-card text-muted-foreground',
        )}
        aria-hidden
      >
        {step.done ? <Check className="size-3" strokeWidth={3} /> : index}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-[13px] font-medium', step.done ? 'text-muted-foreground' : 'text-foreground')}>{step.label}</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">{step.detail}</span>
      </span>
      <ArrowRight className="mt-1 size-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden />
    </>
  );
  const cls = 'group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  return (
    <li>
      {inPage ? (
        <a
          href={href.slice('/setup'.length)}
          className={cls}
          onClick={(e) => {
            const el = document.getElementById(step.key);
            if (el) {
              e.preventDefault();
              el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              history.replaceState(null, '', `#${step.key}`);
            }
          }}
        >
          {content}
          <span className="sr-only">{step.done ? '(done)' : '(to do)'}</span>
        </a>
      ) : (
        <Link to={href} className={cls}>
          {content}
          <span className="sr-only">{step.done ? '(done)' : '(to do)'}</span>
        </Link>
      )}
    </li>
  );
}

// ------------------------------------------------------------------ section shell

function Section({
  id,
  icon: Icon,
  title,
  description,
  done,
  children,
  aside,
}: {
  id: string;
  icon: typeof CalendarDays;
  title: string;
  description: ReactNode;
  done?: boolean;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-20">
      <div className="flex flex-col gap-3 p-5 pb-4 sm:flex-row sm:items-start sm:justify-between sm:p-6 sm:pb-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl border', done ? 'border-success/20 bg-success-soft text-success' : 'border-border bg-muted/60 text-foreground')}>
            {done ? <CircleCheck className="size-[18px]" /> : <Icon className="size-[18px]" />}
          </span>
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 font-display text-[16px] font-semibold tracking-tight">
              {title}
              {done && (
                <Badge variant="success" dot>
                  Done
                </Badge>
              )}
            </h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
          </div>
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
      <div className="px-5 pb-5 sm:px-6 sm:pb-6">{children}</div>
    </Card>
  );
}

function InlineAlert({ tone = 'danger', children }: { tone?: 'danger' | 'success' | 'info'; children: ReactNode }) {
  const Icon = tone === 'success' ? CircleCheck : CircleAlert;
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px]',
        tone === 'danger' && 'border-danger/20 bg-danger-soft text-danger',
        tone === 'success' && 'border-success/20 bg-success-soft text-success',
        tone === 'info' && 'border-info/20 bg-info-soft text-info',
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 text-foreground/90">{children}</div>
    </div>
  );
}

// ------------------------------------------------------------------ academic year

/** Nigerian sessions run September to July; from August we're setting up the next one. */
function defaultYear(today = new Date()) {
  const y = today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1;
  const terms = [
    { name: 'First Term', startsOn: `${y}-09-08`, endsOn: `${y}-12-18` },
    { name: 'Second Term', startsOn: `${y + 1}-01-05`, endsOn: `${y + 1}-04-02` },
    { name: 'Third Term', startsOn: `${y + 1}-04-20`, endsOn: `${y + 1}-07-23` },
  ];
  const iso = today.toISOString().slice(0, 10);
  // The term we're in (or the next one to start).
  let current = terms.findIndex((t) => iso <= t.endsOn);
  if (current < 0) current = terms.length - 1;
  return { name: `${y}/${y + 1}`, terms, currentTerm: current };
}

function YearSection({ status }: { status: SetupStatus }) {
  const step = status.steps.find((s) => s.key === 'year')!;
  const [form, setForm] = useState(defaultYear);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSetupYear();

  if (step.done) {
    return (
      <Section id="year" icon={CalendarDays} title="Academic year and terms" description={step.detail} done>
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-[13px] sm:flex-row sm:items-center sm:justify-between">
          <span className="text-muted-foreground">Change term dates, add the next session or switch the current term in Academic Setup.</span>
          <Button asChild variant="outline" size="sm">
            <Link to="/academics?tab=sessions">
              Open Academic Setup <ExternalLink />
            </Link>
          </Button>
        </div>
      </Section>
    );
  }

  const setTerm = (i: number, patch: Partial<(typeof form.terms)[number]>) =>
    setForm((f) => ({ ...f, terms: f.terms.map((t, k) => (k === i ? { ...t, ...patch } : t)) }));

  const validate = () => {
    const e: Record<string, string> = {};
    const m = /^(\d{4})\/(\d{4})$/.exec(form.name.trim());
    if (!m) e.name = 'Write the session like 2026/2027';
    else if (Number(m[2]) !== Number(m[1]) + 1) e.name = 'The second year should follow the first, like 2026/2027';
    form.terms.forEach((t, i) => {
      if (t.name.trim().length < 2) e[`t${i}name`] = 'Give the term a name';
      if (!t.startsOn || !t.endsOn) e[`t${i}dates`] = 'Choose both dates';
      else if (t.endsOn <= t.startsOn) e[`t${i}dates`] = 'The term must end after it starts';
      else if (i > 0 && form.terms[i - 1]!.endsOn && t.startsOn <= form.terms[i - 1]!.endsOn) e[`t${i}dates`] = `Starts before ${form.terms[i - 1]!.name || 'the previous term'} ends`;
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    save.mutate({ name: form.name.trim(), terms: form.terms.map((t) => ({ ...t, name: t.name.trim() })), currentTerm: form.currentTerm });
  };

  return (
    <Section
      id="year"
      icon={CalendarDays}
      title="Academic year and terms"
      description="We've filled in a typical Nigerian calendar. Adjust the dates to match your school's, then tick the term you're in now."
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Field label="Session" htmlFor="session-name" error={errors.name} hint="The academic year, from September to July." className="max-w-xs">
          <Input id="session-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} invalid={!!errors.name} inputMode="numeric" placeholder="2026/2027" />
        </Field>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-[13px] font-medium">Terms</legend>
          <div className="hidden grid-cols-[minmax(0,1fr)_150px_150px_92px] gap-3 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground md:grid">
            <span>Name</span>
            <span>Starts</span>
            <span>Ends</span>
            <span>Current</span>
          </div>
          {form.terms.map((t, i) => (
            <div key={i} className="rounded-xl border border-border p-3 md:border-0 md:p-0">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,1fr)_150px_150px_92px] md:items-center [&>*]:min-w-0">
                <div className="col-span-2 md:col-span-1">
                  <label htmlFor={`term-${i}-name`} className="sr-only">
                    Term {i + 1} name
                  </label>
                  <Input id={`term-${i}-name`} value={t.name} onChange={(e) => setTerm(i, { name: e.target.value })} invalid={!!errors[`t${i}name`]} />
                </div>
                <div>
                  <label htmlFor={`term-${i}-start`} className="mb-1 block text-[11px] font-medium text-muted-foreground md:sr-only">
                    Starts
                  </label>
                  <Input id={`term-${i}-start`} type="date" value={t.startsOn} onChange={(e) => setTerm(i, { startsOn: e.target.value })} invalid={!!errors[`t${i}dates`]} />
                </div>
                <div>
                  <label htmlFor={`term-${i}-end`} className="mb-1 block text-[11px] font-medium text-muted-foreground md:sr-only">
                    Ends
                  </label>
                  <Input id={`term-${i}-end`} type="date" value={t.endsOn} onChange={(e) => setTerm(i, { endsOn: e.target.value })} invalid={!!errors[`t${i}dates`]} />
                </div>
                <label
                  className={cn(
                    'col-span-2 flex h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-[13px] transition-colors md:col-span-1',
                    form.currentTerm === i ? 'border-brand/40 bg-brand-soft text-brand' : 'border-border text-muted-foreground hover:bg-muted/60',
                  )}
                >
                  <input type="radio" name="current-term" className="accent-[var(--brand)]" checked={form.currentTerm === i} onChange={() => setForm({ ...form, currentTerm: i })} />
                  <span className="md:hidden">This is the current term</span>
                  <span className="hidden md:inline">Now</span>
                </label>
              </div>
              {(errors[`t${i}name`] || errors[`t${i}dates`]) && (
                <p role="alert" className="mt-1.5 px-1 text-[12px] font-medium text-danger">
                  {errors[`t${i}name`] ?? errors[`t${i}dates`]}
                </p>
              )}
            </div>
          ))}
        </fieldset>

        {save.error && (
          <InlineAlert>
            {errorMessage(save.error)}
            {/already exists/i.test(errorMessage(save.error)) && (
              <>
                {' '}
                <Link to="/academics?tab=sessions" className="font-medium text-brand underline-offset-4 hover:underline">
                  Open Academic Setup
                </Link>
              </>
            )}
          </InlineAlert>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={save.isPending}>
            Save {form.name || 'session'}
          </Button>
          <span className="text-[12px] text-muted-foreground">You can change dates later in Academic Setup.</span>
        </div>
      </form>
    </Section>
  );
}

// ------------------------------------------------------------------ classes

const ARM_PRESETS: { label: string; arms: string[] }[] = [
  { label: 'A, B', arms: ['A', 'B'] },
  { label: 'A, B, C', arms: ['A', 'B', 'C'] },
  { label: 'Gold, Silver', arms: ['Gold', 'Silver'] },
  { label: 'One class per level', arms: ['A'] },
];

function ClassesSection({ status }: { status: SetupStatus }) {
  const step = status.steps.find((s) => s.key === 'classes')!;
  const [stages, setStages] = useState<StageKey[]>([]);
  const [arms, setArms] = useState<string[]>(['A', 'B']);
  const [draft, setDraft] = useState('');
  const [capacity, setCapacity] = useState('35');
  const save = useSetupClasses();
  const [error, setError] = useState<string | null>(null);

  const addArm = (raw: string) => {
    const names = raw
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.slice(0, 20));
    if (!names.length) return;
    setArms((a) => {
      const next = [...a];
      for (const n of names) if (!next.some((x) => x.toLowerCase() === n.toLowerCase())) next.push(n);
      return next.slice(0, 12);
    });
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addArm(draft);
    } else if (e.key === 'Backspace' && !draft && arms.length) setArms((a) => a.slice(0, -1));
  };

  const levelsChosen = STAGE_KEYS.filter((k) => stages.includes(k)).flatMap((k) => STAGE_TEMPLATES[k].levels.map(([name]) => name));
  const allArms = [...arms, ...(draft.trim() ? [draft.trim()] : [])];
  const classCount = levelsChosen.length * allArms.length;
  const cap = Number(capacity);

  const submit = () => {
    setError(null);
    const finalArms = [...new Set(allArms)];
    if (!stages.length) return setError('Choose at least one stage.');
    if (!finalArms.length) return setError('Add at least one arm name, such as A.');
    if (!Number.isInteger(cap) || cap < 1 || cap > 200) return setError('Class size should be a whole number from 1 to 200.');
    if (draft.trim()) addArm(draft);
    save.mutate({ stages, arms: finalArms, capacity: cap }, { onSuccess: () => setStages([]) });
  };

  return (
    <Section
      id="classes"
      icon={Layers}
      title="Classes"
      description={step.done ? `You have ${step.detail}. Add another stage or more arms any time — existing classes are kept.` : 'Pick the stages your school runs. We create each level (e.g. JSS 1, JSS 2, JSS 3) with the arms you choose.'}
      done={step.done}
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          {STAGE_KEYS.map((key) => {
            const t = STAGE_TEMPLATES[key];
            const on = stages.includes(key);
            const exists = status.stages.includes(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => setStages((s) => (on ? s.filter((x) => x !== key) : [...s, key]))}
                className={cn(
                  'group relative flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-[border-color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  on ? 'border-brand bg-brand-soft/50 shadow-[0_0_0_1px_var(--brand)]' : 'border-border bg-card hover:border-border-strong hover:bg-muted/40',
                )}
              >
                <span className="flex w-full items-center gap-2.5">
                  <span
                    className={cn(
                      'grid size-4 shrink-0 place-items-center rounded-[5px] border transition-colors',
                      on ? 'border-brand bg-brand text-white' : 'border-border-strong bg-card',
                    )}
                    aria-hidden
                  >
                    {on && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="font-display text-[14px] font-semibold tracking-tight">{t.label}</span>
                  {exists && (
                    <Badge variant="success" className="ml-auto" dot>
                      Set up
                    </Badge>
                  )}
                </span>
                <span className="flex flex-wrap gap-1 pl-[26px]">
                  {t.levels.map(([name]) => (
                    <span key={name} className="rounded-md bg-muted px-1.5 py-0.5 text-[11.5px] text-muted-foreground">
                      {name}
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_160px] [&>*]:min-w-0">
          <div className="grid gap-1.5">
            <Label htmlFor="arm-input">Arms in each level</Label>
            <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card px-2 py-1.5 shadow-xs focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/15">
              {arms.map((a) => (
                <span key={a} className="inline-flex items-center gap-1 rounded-md bg-secondary py-0.5 pl-2 pr-1 text-[12.5px] font-medium">
                  {a}
                  <button type="button" onClick={() => setArms((x) => x.filter((y) => y !== a))} className="grid size-4 place-items-center rounded text-muted-foreground hover:bg-border hover:text-foreground" aria-label={`Remove ${a}`}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <input
                id="arm-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKey}
                onBlur={() => addArm(draft)}
                placeholder={arms.length ? 'Add another' : 'e.g. A'}
                className="h-7 min-w-[90px] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground/70"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-[12px] text-muted-foreground">Quick:</span>
              {ARM_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setArms(p.arms)}
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-[12px] transition-colors',
                    p.arms.join() === arms.join() ? 'border-brand/40 bg-brand-soft text-brand' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <Field label="Class size" htmlFor="capacity" hint="Students per class">
            <Input id="capacity" type="number" min={1} max={200} inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </Field>
        </div>

        {classCount > 0 && (
          <p className="rounded-xl bg-muted/50 px-3.5 py-2.5 text-[13px] text-muted-foreground">
            <span className="font-medium text-foreground">
              {levelsChosen.length} levels × {allArms.length} arm{allArms.length === 1 ? '' : 's'} = {classCount} classes
            </span>
            , for example {levelsChosen[0]} {allArms[0]}
            {allArms[1] ? `, ${levelsChosen[0]} ${allArms[1]}` : ''}
            {levelsChosen[1] ? `, ${levelsChosen[1]} ${allArms[0]}` : ''}. Classes you already have are left as they are.
          </p>
        )}

        {(error || save.error) && <InlineAlert>{error ?? errorMessage(save.error)}</InlineAlert>}
        {save.data && !save.isPending && (
          <InlineAlert tone="success">
            {save.data.createdLevels || save.data.createdArms ? (
              <>
                Added <b>{save.data.createdLevels}</b> class level{save.data.createdLevels === 1 ? '' : 's'} and <b>{save.data.createdArms}</b> class{save.data.createdArms === 1 ? '' : 'es'}.{' '}
              </>
            ) : (
              'Those classes were already set up — nothing new to add. '
            )}
            <a href="#subjects" className="font-medium text-brand underline-offset-4 hover:underline">
              Next: choose subjects
            </a>
          </InlineAlert>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={submit} loading={save.isPending} disabled={!stages.length}>
            {classCount ? `Create ${classCount} classes` : 'Create classes'}
          </Button>
          {status.counts.arms > 0 && (
            <Link to="/academics?tab=classes" className="text-[13px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              See all classes
            </Link>
          )}
        </div>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ subjects

function SubjectsSection({ status }: { status: SetupStatus }) {
  const step = status.steps.find((s) => s.key === 'subjects')!;
  const stages = STAGE_KEYS.filter((k) => status.stages.includes(k));
  const { data: structure, isError: structureFailed } = useStructure();
  const existing = useMemo(() => new Set((structure?.subjects ?? []).map((s) => s.code.toUpperCase())), [structure]);
  const [active, setActive] = useState<StageKey | null>(null);
  const [picked, setPicked] = useState<Partial<Record<StageKey, string[]>>>({});
  const save = useSetupSubjects();

  // Default: the core subjects, plus anything the school already teaches.
  useEffect(() => {
    // Wait for the school's subjects so the ones already added start ticked.
    if (!structure && !structureFailed) return;
    setPicked((p) => {
      const next = { ...p };
      for (const k of stages) if (!next[k]) next[k] = SUBJECT_TEMPLATES[k].filter(([, code, , core]) => core || existing.has(code)).map(([, code]) => code);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages.join(), existing, structure, structureFailed]);

  const current = active && stages.includes(active) ? active : stages[0];
  const total = stages.reduce((n, k) => n + (picked[k]?.length ?? 0), 0);

  if (!stages.length) {
    return (
      <Section id="subjects" icon={BookOpen} title="Subjects" description="Choose the subjects you teach at each stage.">
        <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-border px-4 py-5 text-[13px] text-muted-foreground">
          Create your classes first — then you can pick subjects for each stage here.
          <a href="#classes" className="font-medium text-brand underline-offset-4 hover:underline">
            Go to Classes
          </a>
        </div>
      </Section>
    );
  }

  const toggle = (k: StageKey, code: string) =>
    setPicked((p) => {
      const list = p[k] ?? [];
      return { ...p, [k]: list.includes(code) ? list.filter((c) => c !== code) : [...list, code] };
    });
  const setAll = (k: StageKey, mode: 'all' | 'core' | 'none') =>
    setPicked((p) => ({ ...p, [k]: mode === 'none' ? [] : SUBJECT_TEMPLATES[k].filter(([, , , core]) => mode === 'all' || core).map(([, c]) => c) }));

  const submit = () => {
    const selections = stages.filter((k) => picked[k]?.length).map((k) => ({ stage: k, codes: picked[k]! }));
    if (!selections.length) return;
    save.mutate({ selections });
  };

  const k = current!;
  const levels = STAGE_TEMPLATES[k].levels;
  return (
    <Section
      id="subjects"
      icon={BookOpen}
      title="Subjects"
      description={step.done ? `${step.detail}. Tick more to add them; each one is linked to every class in its stage.` : 'Core subjects are ticked for you. Add the electives and languages you offer — each subject is linked to every class in its stage.'}
      done={step.done}
    >
      <div className="space-y-4">
        {stages.length > 1 && (
          <div role="tablist" aria-label="Stage" className="flex flex-wrap gap-1.5">
            {stages.map((s) => (
              <button
                key={s}
                role="tab"
                type="button"
                aria-selected={s === k}
                onClick={() => setActive(s)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors',
                  s === k ? 'border-foreground/80 bg-foreground text-background' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {STAGE_TEMPLATES[s].label}
                <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums', s === k ? 'bg-background/20' : 'bg-muted')}>{picked[s]?.length ?? 0}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12.5px] text-muted-foreground">
            For {levels[0]![0]} to {levels.at(-1)![0]}
          </p>
          <div className="flex items-center gap-1 text-[12px]">
            {(['core', 'all', 'none'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setAll(k, m)} className="rounded-md px-2 py-1 font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                {m === 'core' ? 'Core only' : m === 'all' ? 'Select all' : 'Clear'}
              </button>
            ))}
          </div>
        </div>
        <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
          {SUBJECT_TEMPLATES[k].map(([name, code, category, core]) => {
            const on = picked[k]?.includes(code) ?? false;
            const id = `subj-${k}-${code}`;
            return (
              <li key={code}>
                <label
                  htmlFor={id}
                  className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors', on ? 'border-brand/30 bg-brand-soft/40' : 'border-border hover:bg-muted/50')}
                >
                  <Checkbox id={id} checked={on} onCheckedChange={() => toggle(k, code)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{name}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">
                      {category === 'Core' ? 'Core' : category}
                      {core && category !== 'Core' && ' · core'}
                      {existing.has(code) && <span className="text-success"> · added</span>}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {save.error && <InlineAlert>{errorMessage(save.error)}</InlineAlert>}
        {save.data && !save.isPending && (
          <InlineAlert tone="success">
            {save.data.createdSubjects ? `Added ${save.data.createdSubjects} subject${save.data.createdSubjects === 1 ? '' : 's'}` : 'All those subjects were already there'}
            {save.data.linked ? ` and linked them to your classes (${formatNumber(save.data.linked)} class–subject links).` : '.'}
          </InlineAlert>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={submit} loading={save.isPending} disabled={!total}>
            Save {total} subject choice{total === 1 ? '' : 's'}
          </Button>
          {stages.length > 1 && <span className="text-[12px] text-muted-foreground">Saves the ticks for every stage at once.</span>}
        </div>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ people

function PeopleSection({ status }: { status: SetupStatus }) {
  const kinds = useImportKinds();
  const rows = [
    { kind: 'STAFF', icon: Briefcase, title: 'Staff', text: status.counts.staff ? `${formatNumber(status.counts.staff)} staff on record` : 'Upload your staff list, with logins for teachers', step: 'staff' },
    {
      kind: 'STUDENTS',
      icon: GraduationCap,
      title: 'Students and parents',
      text: status.counts.students ? `${formatNumber(status.counts.students)} students, ${formatNumber(status.counts.guardians)} parents` : 'One spreadsheet brings in students and their parents',
      step: 'students',
    },
    { kind: 'RESULTS', icon: Trophy, title: 'Past results', text: status.counts.scores ? `${formatNumber(status.counts.scores)} scores on record` : 'Optional: last term’s scores for cumulative report cards', step: 'results' },
  ] as const;
  const visible = rows.filter((r) => kinds.includes(r.kind));
  if (!visible.length) return null;
  return (
    <Section id="people" icon={Users} title="Bring in your people" description="Upload a spreadsheet saved as CSV. You'll see a preview of every row before anything is saved.">
      <ul className="divide-y divide-border rounded-xl border border-border">
        {visible.map((r) => {
          const done = status.steps.find((s) => s.key === r.step)?.done;
          return (
            <li key={r.kind} className="flex items-center gap-3 px-4 py-3">
              <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', done ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground')}>
                {done ? <Check className="size-4" /> : <r.icon className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium">{r.title}</span>
                <span className="block truncate text-[12px] text-muted-foreground">{r.text}</span>
              </span>
              <Button asChild variant={done ? 'ghost' : 'outline'} size="sm">
                <Link to={`/import?kind=${r.kind}`}>{done ? 'Import more' : 'Import'}</Link>
              </Button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
