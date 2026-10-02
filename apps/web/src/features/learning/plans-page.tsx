import type { StudyPlanRow } from '@aischool/shared';
import { ArrowLeft, CalendarCheck2, CheckCircle2, Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api';
import { formatDate, todayIso } from '@/lib/format';
import { cn } from '@/lib/utils';
import { allowanceError, useGeneratePlan, useLearnHome, useMastery, usePlans, useUpdatePlan } from './api';
import { PlusUpsell, UpgradeCard } from './components';

export default function PlansPage() {
  const [params, setParams] = useSearchParams();
  const selected = params.get('plan');
  const plans = usePlans();
  const home = useLearnHome();
  const studyTools = home.data?.access.studyTools;
  const [creating, setCreating] = useState(false);
  const plan = plans.data?.find((p) => p.id === selected);
  const open = (id: string | null) => setParams(id ? { plan: id } : {}, { replace: false });

  return (
    <Page className="max-w-5xl">
      {plan ? (
        <PlanDetail plan={plan} onBack={() => open(null)} />
      ) : (
        <>
          <PageHeader
            eyebrow="Learning"
            title="Study plans"
            description="A goal, broken into small daily steps. Tick them off as you go."
            actions={
              studyTools ? (
                <Button onClick={() => setCreating(true)}>
                  <Plus /> New plan
                </Button>
              ) : undefined
            }
          />
          {plans.error && !plans.data ? (
            <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
          ) : !plans.data || !home.data ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-36 rounded-2xl" />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {studyTools === false && <PlusUpsell feature="Study plans" />}
              {plans.data.length === 0 ? (
                studyTools && (
                  <Card>
                    <EmptyState
                      icon={CalendarCheck2}
                      title="No study plans yet"
                      description="Tell the tutor your goal — a test, an exam or a topic — and it will plan each day around it."
                      action={
                        <Button onClick={() => setCreating(true)}>
                          <Sparkles /> Make my first plan
                        </Button>
                      }
                    />
                  </Card>
                )
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
                  {plans.data.map((p) => (
                    <PlanCard key={p.id} plan={p} onOpen={() => open(p.id)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
      <NewPlanDialog open={creating} onOpenChange={setCreating} onCreated={(id) => open(id)} />
    </Page>
  );
}

function PlanCard({ plan, onOpen }: { plan: StudyPlanRow; onOpen: () => void }) {
  const done = plan.items.filter((i) => i.done).length;
  return (
    <button type="button" onClick={onOpen} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-border-strong">
      <div className="flex w-full items-start justify-between gap-3">
        <p className="min-w-0 font-display text-[15px] font-semibold tracking-tight">{plan.title}</p>
        <Badge variant={plan.status === 'ACTIVE' ? 'brand' : plan.status === 'DONE' ? 'success' : 'outline'}>{plan.status === 'ACTIVE' ? 'Active' : plan.status === 'DONE' ? 'Done' : 'Archived'}</Badge>
      </div>
      <p className="line-clamp-2 text-[13px] text-muted-foreground">{plan.goal}</p>
      <div className="w-full">
        <div className="mb-1.5 flex justify-between text-[12px] text-muted-foreground">
          <span>
            {formatDate(plan.startsOn, { day: 'numeric', month: 'short' })} – {formatDate(plan.endsOn, { day: 'numeric', month: 'short' })}
          </span>
          <span className="tabular">
            {done}/{plan.items.length} · {plan.progressPct}%
          </span>
        </div>
        <Progress value={plan.progressPct} label="Plan progress" barClassName="bg-success" />
      </div>
    </button>
  );
}

function PlanDetail({ plan, onBack }: { plan: StudyPlanRow; onBack: () => void }) {
  const update = useUpdatePlan();
  const today = todayIso();
  const days = new Map<string, { item: StudyPlanRow['items'][number]; index: number }[]>();
  plan.items.forEach((item, index) => days.set(item.date, [...(days.get(item.date) ?? []), { item, index }]));
  const minutes = plan.items.reduce((t, i) => t + i.minutes, 0);

  return (
    <>
      <Button variant="ghost" size="sm" className="-ml-2 mb-3" onClick={onBack}>
        <ArrowLeft /> All plans
      </Button>
      <PageHeader
        title={plan.title}
        description={plan.goal}
        actions={
          plan.status === 'ACTIVE' ? (
            <Button variant="outline" onClick={() => update.mutate({ id: plan.id, status: 'DONE' })}>
              <CheckCircle2 /> Mark plan done
            </Button>
          ) : (
            <Button variant="outline" onClick={() => update.mutate({ id: plan.id, status: 'ACTIVE' })}>
              Make active again
            </Button>
          )
        }
      />
      <Card className="mb-5 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[12px] font-medium text-muted-foreground">Progress</p>
            <p className="font-display text-3xl font-semibold tabular tracking-tight">{plan.progressPct}%</p>
          </div>
          <p className="text-[13px] text-muted-foreground">
            {plan.items.filter((i) => i.done).length} of {plan.items.length} steps · about {Math.round(minutes / 60)} h in total
          </p>
        </div>
        <Progress value={plan.progressPct} className="mt-3 h-2" barClassName="bg-success" label="Plan progress" />
      </Card>
      {plan.items.length === 0 ? (
        <Card>
          <EmptyState icon={CalendarCheck2} title="This plan has no steps" description="The tutor couldn’t fill this one in. Try making a new plan with a clearer goal." compact />
        </Card>
      ) : (
        <ol className="space-y-4">
          {[...days.entries()].map(([date, items]) => (
            <li key={date} className="grid gap-2 sm:grid-cols-[120px_1fr] [&>*]:min-w-0">
              <div className="pt-1">
                <p className={cn('text-[13px] font-semibold', date === today && 'text-brand')}>{date === today ? 'Today' : formatDate(date, { weekday: 'short' })}</p>
                <p className="text-[12px] text-muted-foreground">{formatDate(date, { day: 'numeric', month: 'short' })}</p>
              </div>
              <ul className="space-y-2">
                {items.map(({ item, index }) => (
                  <li key={index}>
                    <label className={cn('flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted/50', item.done && 'bg-success-soft/40', date === today && !item.done && 'border-brand/40')}>
                      <Checkbox checked={item.done} onCheckedChange={(v) => update.mutate({ id: plan.id, itemIndex: index, done: v === true })} className="mt-0.5" aria-label={`Mark “${item.activity}” done`} />
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-[13.5px] font-medium', item.done && 'text-muted-foreground line-through')}>{item.activity}</span>
                        <span className="text-[12px] text-muted-foreground">
                          {item.subject} · {item.topic} · {item.minutes} min
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function NewPlanDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const gen = useGeneratePlan();
  const mastery = useMastery();
  const [goal, setGoal] = useState('');
  const [days, setDays] = useState(14);
  const [minutes, setMinutes] = useState(45);
  const [subjects, setSubjects] = useState<string[]>([]);
  const all = mastery.data?.subjects.map((s) => s.subject) ?? [];
  const upgrade = allowanceError(gen.error);
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) gen.reset();
        onOpenChange(o);
      }}
      title="New study plan"
      description="Your tutor will map out each day using what it knows about your topics."
      icon={<Sparkles />}
      submitLabel="Make my plan"
      pending={gen.isPending}
      onSubmit={(e) => {
        e?.preventDefault();
        if (goal.trim().length < 3) return;
        gen.mutate(
          { goal: goal.trim(), days, minutesPerDay: minutes, subjects },
          {
            onSuccess: (p) => {
              onOpenChange(false);
              setGoal('');
              onCreated(p.id);
            },
          },
        );
      }}
    >
      <div className="space-y-4">
        <Field label="What’s your goal?" htmlFor="plan-goal">
          <Textarea id="plan-goal" value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} maxLength={300} placeholder="e.g. Get a B or better in my maths mid-term test" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Days" htmlFor="plan-days" hint="3 to 42">
            <Input id="plan-days" type="number" min={3} max={42} value={days} onChange={(e) => setDays(Math.max(3, Math.min(42, Number(e.target.value) || 14)))} />
          </Field>
          <Field label="Minutes a day" htmlFor="plan-min" hint="10 to 180">
            <Input id="plan-min" type="number" min={10} max={180} step={5} value={minutes} onChange={(e) => setMinutes(Math.max(10, Math.min(180, Number(e.target.value) || 45)))} />
          </Field>
        </div>
        {all.length > 0 && (
          <Field label="Subjects" optional>
            <div className="flex flex-wrap gap-1.5">
              {all.map((s) => {
                const on = subjects.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSubjects((x) => (on ? x.filter((y) => y !== s) : [...x, s].slice(0, 8)))}
                    className={cn('rounded-full border px-3 py-1 text-[12.5px] transition-colors', on ? 'border-brand bg-brand-soft text-brand' : 'border-border hover:bg-muted')}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </Field>
        )}
        {upgrade ? <UpgradeCard error={upgrade} /> : gen.error ? <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{errorMessage(gen.error)}</p> : null}
      </div>
    </FormDialog>
  );
}
