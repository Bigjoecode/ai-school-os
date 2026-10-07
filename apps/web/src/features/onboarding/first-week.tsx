import type { FirstWeekDay, FirstWeekGoal, FirstWeekManualGoal, FirstWeekPlan, ParentInviteResult } from '@aischool/shared';
import { ArrowRight, CalendarCheck2, Check, ChevronDown, CircleDot, Download, Mail, MessageSquare, PartyPopper, RotateCcw, Send, Smartphone, Sparkles, X } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/empty-state';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { formatDate, formatNumber, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { saveTextFile, useFirstWeek, useFirstWeekAction, useParentInvitePreview, useSendParentInvites } from './api';
import { ProgressRing } from './ui';

/** The Success dashboard is being built separately: link to it only once its page exists. */
const HAS_SUCCESS_PAGE = Object.keys(import.meta.glob('../success/*-page.tsx')).length > 0;

/** Where a goal's button goes in this build of the app. */
function goalHref(goal: FirstWeekGoal) {
  if (goal.href === '/success' && !HAS_SUCCESS_PAGE) return '/';
  return goal.href;
}

const DAY_BADGE: Record<FirstWeekDay['status'], { label: string; variant: 'success' | 'brand' | 'warning' | 'outline' }> = {
  DONE: { label: 'Done', variant: 'success' },
  TODAY: { label: 'Today', variant: 'brand' },
  BEHIND: { label: 'To finish', variant: 'warning' },
  UPCOMING: { label: 'Coming up', variant: 'outline' },
};

function dayHeadline(plan: FirstWeekPlan) {
  const day = plan.days.find((d) => d.day === plan.focusDay) ?? plan.days[0]!;
  return { day, today: Math.min(plan.dayNumber, 7) };
}

// ------------------------------------------------------------------ the "Do it now" button

/** Opens a goal's screen; the Day 7 review goals are ticked as they're opened (there's nothing else to detect). */
function DoItNow({ goal, size = 'sm', variant = 'default', children }: { goal: FirstWeekGoal; size?: 'sm' | 'default'; variant?: 'default' | 'outline' | 'brand'; children?: ReactNode }) {
  const navigate = useNavigate();
  const act = useFirstWeekAction();
  const href = goalHref(goal);
  const label = children ?? (
    <>
      {goal.status === 'DONE' ? 'Open' : goal.action} <ArrowRight />
    </>
  );
  if (goal.manual) {
    return (
      <Button
        size={size}
        variant={variant}
        loading={act.isPending}
        onClick={() =>
          act.mutate({ action: 'MARK', key: goal.key as FirstWeekManualGoal }, { onSettled: () => void navigate(href) })
        }
      >
        {label}
      </Button>
    );
  }
  return (
    <Button asChild size={size} variant={variant}>
      <Link to={href}>{label}</Link>
    </Button>
  );
}

// ------------------------------------------------------------------ dashboard card

/**
 * Today's goal on the overview, for principals and admins, while the plan is
 * running. Renders `fallback` (the setup checklist card) when the plan is not
 * showing, so the two never stack up.
 */
export function FirstWeekCard({ fallback }: { fallback?: ReactNode }) {
  const { data, isLoading } = useFirstWeek();
  const act = useFirstWeekAction();
  if (isLoading) return null;
  if (!data || !data.showCard) return <>{fallback}</>;
  const { day, today } = dayHeadline(data);
  const next = data.nextAction;
  const complete = data.state === 'COMPLETE';
  return (
    <Card className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-brand/10 blur-3xl" />
      <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6">
        <ProgressRing value={data.progressPct} size={56} stroke={5} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
            {complete ? <PartyPopper className="size-4 text-brand" aria-hidden /> : <CalendarCheck2 className="size-4 text-brand" aria-hidden />}
            {complete ? 'Your first week is complete' : `Your first week · Day ${today} of 7`}
          </p>
          {complete ? (
            <p className="mt-1 text-[13px] text-muted-foreground">Every goal is done — the learning loop is running. Well done to you and your team.</p>
          ) : (
            <>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {data.doneCount} of {data.total} goals done.{' '}
                {day.day < today ? `Finishing Day ${day.day}: ` : 'Today: '}
                <span className="font-medium text-foreground">{day.title}</span>.
              </p>
              {next && (
                <p className="mt-2 text-[13px]">
                  <span className="font-medium">Next: {next.label}</span>
                  <span className="text-muted-foreground"> — {next.why}</span>
                </p>
              )}
            </>
          )}
          <div className="mt-3 flex gap-1" aria-hidden>
            {data.days.map((d) => (
              <span key={d.day} title={`Day ${d.day}: ${d.title}`} className={cn('h-1.5 flex-1 rounded-full sm:max-w-10', d.status === 'DONE' ? 'bg-brand' : d.day === day.day ? 'bg-brand/40' : 'bg-muted')} />
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {complete ? (
            <Button size="sm" loading={act.isPending} onClick={() => act.mutate({ action: 'FINISH' })}>
              <Check /> Close the plan
            </Button>
          ) : (
            <>
              {next && <DoItNow goal={next} variant="outline">{next.action}</DoItNow>}
              <Button asChild size="sm">
                <Link to="/setup?tab=first-week">
                  See the plan <ArrowRight />
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
      {!complete && (
        <button
          type="button"
          onClick={() => act.mutate({ action: 'DISMISS' }, { onSuccess: () => toast.success('Plan hidden. You can start it again from Setup → Your first week.') })}
          className="absolute right-2 top-2 grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Hide the first-week plan"
          title="Hide (it stays under Setup)"
        >
          <X className="size-4" />
        </button>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ the full plan (Setup → Your first week)

export function FirstWeekPanel() {
  const { data, isLoading, error, refetch } = useFirstWeek();
  const [params, setParams] = useSearchParams();
  const inviteOpen = params.get('invite') === '1';
  const setInviteOpen = (open: boolean) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (open) p.set('invite', '1');
        else p.delete('invite');
        return p;
      },
      { replace: true },
    );

  if (error && !data) {
    return (
      <Card>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Card>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <PlanHeader plan={data} />
      <ol className="space-y-3">
        {data.days.map((d) => (
          <li key={d.day}>
            <DayCard day={d} plan={data} />
          </li>
        ))}
      </ol>
      <InviteParentsDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}

function PlanHeader({ plan }: { plan: FirstWeekPlan }) {
  const act = useFirstWeekAction();
  const { today } = dayHeadline(plan);
  const closed = plan.state === 'DISMISSED' || plan.state === 'FINISHED';
  const next = plan.nextAction;
  const restart = () => act.mutate({ action: 'RESTART' }, { onSuccess: () => toast.success('Your first week starts again today. Day 1 is today.') });
  return (
    <Card className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -left-20 -top-24 size-64 rounded-full bg-brand/10 blur-3xl" />
      <div className="relative space-y-4 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <ProgressRing value={plan.progressPct} size={64} stroke={5} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-[17px] font-semibold tracking-tight">
              {plan.state === 'COMPLETE' || plan.state === 'FINISHED' ? 'Your first week is complete' : plan.dayNumber > 7 ? 'Your first week, finishing off' : `Your first week · Day ${today} of 7`}
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {plan.doneCount} of {plan.total} goals done · started {formatDate(plan.startedOn, { day: 'numeric', month: 'long' })}. Each goal ticks itself as soon as the work is done in the app.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {plan.state === 'COMPLETE' && (
              <Button size="sm" loading={act.isPending} onClick={() => act.mutate({ action: 'FINISH' }, { onSuccess: () => toast.success('Plan closed. Well done!') })}>
                <Check /> Close the plan
              </Button>
            )}
            {(closed || plan.dayNumber > 7) && (
              <Button size="sm" variant="outline" loading={act.isPending} onClick={restart}>
                <RotateCcw /> Start again from today
              </Button>
            )}
            {plan.state === 'ACTIVE' && (
              <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => act.mutate({ action: 'DISMISS' }, { onSuccess: () => toast.success('Plan hidden from the dashboard. It stays here.') })}>
                Hide from dashboard
              </Button>
            )}
          </div>
        </div>
        {closed && (
          <p className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-[13px] text-muted-foreground">
            {plan.state === 'DISMISSED' ? 'You hid this plan, so there are no morning reminders or dashboard card.' : 'You closed this plan.'} The goals below still update as you go.
          </p>
        )}
        {!closed && plan.state === 'ACTIVE' && !plan.showCard && (
          <p className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-[13px] text-muted-foreground">
            Your school has been on the app for a while, so the plan isn’t on the dashboard. Start it from today to get a card and a short reminder each morning.{' '}
            <button type="button" className="font-medium text-brand underline-offset-4 hover:underline" onClick={restart}>
              Start my first week
            </button>
          </p>
        )}
        {next && plan.state === 'ACTIVE' && (
          <div className="flex flex-col gap-3 rounded-xl border border-brand/25 bg-brand-soft/40 p-4 sm:flex-row sm:items-center">
            <Sparkles className="hidden size-5 shrink-0 text-brand sm:block" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] font-semibold uppercase tracking-wide text-brand">Next best step · Day {next.day}</p>
              <p className="mt-0.5 text-[14px] font-medium">{next.label}</p>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">{next.detail}</p>
            </div>
            <DoItNow goal={next} variant="brand" size="default" />
          </div>
        )}
      </div>
    </Card>
  );
}

function DayCard({ day, plan }: { day: FirstWeekDay; plan: FirstWeekPlan }) {
  const focus = day.day === plan.focusDay;
  const [open, setOpen] = useState(day.status !== 'DONE' && day.day <= Math.max(plan.focusDay, Math.min(plan.dayNumber, 7)));
  useEffect(() => {
    if (focus) setOpen(true);
  }, [focus]);
  const required = day.goals.filter((g) => !g.optional);
  const done = required.filter((g) => g.status === 'DONE').length;
  const badge = DAY_BADGE[day.status];
  const panelId = `first-week-day-${day.day}`;
  return (
    <Card className={cn(focus && day.status !== 'DONE' && 'ring-1 ring-brand/40')}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 rounded-2xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
      >
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-xl font-display text-[13px] font-semibold tabular-nums',
            day.status === 'DONE' ? 'bg-success text-white' : focus ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground',
          )}
          aria-hidden
        >
          {day.status === 'DONE' ? <Check className="size-4" strokeWidth={3} /> : day.day}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[14.5px] font-semibold tracking-tight">
              Day {day.day} · {day.title}
            </span>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </span>
          <span className="mt-0.5 block text-[12.5px] text-muted-foreground">{open ? day.summary : `${done} of ${required.length} goals done`}</span>
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <ul id={panelId} className="divide-y divide-border border-t border-border">
          {day.goals.map((g) => (
            <GoalRow key={g.key} goal={g} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function GoalRow({ goal }: { goal: FirstWeekGoal }) {
  const done = goal.status === 'DONE';
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:px-5">
      <span
        className={cn(
          'mt-0.5 hidden size-5 shrink-0 place-items-center rounded-full sm:grid',
          done ? 'bg-success text-white' : goal.status === 'IN_PROGRESS' ? 'bg-warning-soft text-warning' : 'border border-border-strong text-muted-foreground',
        )}
        aria-hidden
      >
        {done ? <Check className="size-3" strokeWidth={3} /> : goal.status === 'IN_PROGRESS' ? <CircleDot className="size-3" /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className={cn('text-[13.5px] font-medium', done && 'text-muted-foreground line-through decoration-muted-foreground/40')}>{goal.label}</span>
          <span className="sr-only">{done ? '(done)' : goal.status === 'IN_PROGRESS' ? '(in progress)' : '(to do)'}</span>
          {goal.optional && <Badge variant="outline">Optional</Badge>}
          {!done && goal.status === 'IN_PROGRESS' && <Badge variant="warning">Under way</Badge>}
        </p>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">{goal.detail}</p>
        {goal.progress && goal.progress.total > 0 && !done && (
          <Progress value={(goal.progress.done / goal.progress.total) * 100} className="mt-2 max-w-xs" label={`${goal.label}: ${goal.progress.done} of ${goal.progress.total}`} />
        )}
        {!done && <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground/90">Why this matters: {goal.why}</p>}
      </div>
      {done ? (
        <Button asChild size="sm" variant="ghost" className="self-start">
          <Link to={goalHref(goal)}>Open</Link>
        </Button>
      ) : (
        <div className="self-start">
          <DoItNow goal={goal} variant={goal.optional ? 'outline' : 'default'} />
        </div>
      )}
    </li>
  );
}

// ------------------------------------------------------------------ invite parents

/** Bulk "Invite parents to the portal": logins for parents with an email, then one invitation message. */
export function InviteParentsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const canUsers = useCan('users.manage');
  const canParents = useCan('guardians.manage');
  const canSend = useCan('comms.send');
  const canInvite = canUsers && canParents && canSend;
  const preview = useParentInvitePreview(open && canInvite);
  const send = useSendParentInvites();
  const [email, setEmail] = useState(true);
  const [sms, setSms] = useState(false);
  const [remind, setRemind] = useState(true);
  const [result, setResult] = useState<ParentInviteResult | null>(null);
  const [saved, setSaved] = useState(false);
  const p = preview.data;

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setSaved(false);
    send.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (p) {
      setEmail(p.channels.email);
      setSms(p.channels.sms && !p.channels.email);
    }
  }, [p]);

  const download = () => {
    if (!result?.credentialsCsv) return;
    saveTextFile(result.credentialsCsv, `parent-login-details-${new Date().toISOString().slice(0, 10)}.csv`);
    setSaved(true);
  };
  const close = (o: boolean) => {
    if (!o && result?.credentialsCsv && !saved && !window.confirm('You haven’t downloaded the login details. The passwords can’t be shown again. Close anyway?')) return;
    onOpenChange(o);
  };
  const submit = () =>
    send.mutate(
      { channels: [...(email ? (['EMAIL'] as const) : []), ...(sms ? (['SMS'] as const) : []), 'IN_APP'], remindExisting: remind },
      { onSuccess: (r) => setResult(r) },
    );
  const reach = p ? p.canCreate + (remind ? p.neverSignedIn : 0) : 0;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Invite parents to the portal</DialogTitle>
          <DialogDescription>Parents who sign in follow homework, results and fees, and get the weekly learning update in the app.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {!canInvite ? (
            <p className="text-[13px] text-muted-foreground">Inviting parents creates their logins, so it needs an administrator (permission to manage users, parents and messages). Ask your school admin to do this step.</p>
          ) : result ? (
            <div className="space-y-3 text-[13px]">
              <p className="flex items-center gap-2 font-medium text-success">
                <Check className="size-4" /> Invitations on their way
              </p>
              <ul className="space-y-1 text-muted-foreground">
                <li>{formatNumber(result.loginsCreated)} new parent logins created</li>
                <li>{formatNumber(result.invited + result.reminded)} parents invited{result.reminded ? ` (${formatNumber(result.reminded)} reminders to parents who haven’t signed in yet)` : ''}</li>
                {result.noEmail > 0 && <li>{formatNumber(result.noEmail)} parents have no email address, so no login yet — add an email on the Parents page and invite again.</li>}
              </ul>
              {result.credentialsCsv && (
                <div className="rounded-xl border border-warning/30 bg-warning-soft/40 p-3.5">
                  <p className="font-medium">Download the login details now</p>
                  <p className="mt-1 text-muted-foreground">
                    The one-time passwords are not sent by SMS or email, and can’t be shown again. Print them as slips to send home with each child, or hand them over at the PTA meeting.
                  </p>
                  <Button className="mt-3" size="sm" onClick={download}>
                    <Download /> {saved ? 'Download again' : 'Download login details'}
                  </Button>
                </div>
              )}
              {result.broadcastId && (
                <Link to={`/messages/${result.broadcastId}`} className="inline-flex items-center gap-1 font-medium text-brand underline-offset-4 hover:underline">
                  Follow the delivery <ArrowRight className="size-3.5" />
                </Link>
              )}
            </div>
          ) : preview.isLoading || !p ? (
            preview.error ? <p className="text-[13px] text-danger">{errorMessage(preview.error)}</p> : <Skeleton className="h-40 rounded-xl" />
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
                {[
                  ['Parents', p.parents],
                  ['With a login', p.withLogin],
                  ['Login can be made', p.canCreate],
                  ['No email yet', p.noEmail],
                ].map(([k, v]) => (
                  <div key={k as string} className="rounded-xl border border-border px-3 py-2">
                    <dt className="text-[11.5px] text-muted-foreground">{k}</dt>
                    <dd className="font-display text-[17px] font-semibold tabular-nums">{formatNumber(v as number)}</dd>
                  </div>
                ))}
              </dl>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-[12.5px] font-medium">Send the invitation by</legend>
                <ChannelOption id="inv-email" icon={Mail} label="Email" note={p.channels.email ? 'Free' : 'Not set up — Messages → Settings'} checked={email} disabled={!p.channels.email} onChange={setEmail} />
                <ChannelOption id="inv-sms" icon={Smartphone} label="SMS" note={p.channels.sms ? 'Uses SMS units' : 'Not set up — Messages → Settings'} checked={sms} disabled={!p.channels.sms} onChange={setSms} />
                <ChannelOption id="inv-app" icon={MessageSquare} label="In the app" note="Always — they see it once they sign in" checked disabled onChange={() => undefined} />
              </fieldset>
              {p.neverSignedIn > 0 && (
                <label htmlFor="inv-remind" className="flex cursor-pointer items-start gap-2.5 text-[13px]">
                  <Checkbox id="inv-remind" checked={remind} onCheckedChange={(v) => setRemind(v === true)} className="mt-0.5" />
                  <span>
                    Also remind the {formatNumber(p.neverSignedIn)} parents who have a login but haven’t signed in yet
                  </span>
                </label>
              )}
              <p className="text-[12px] text-muted-foreground">
                New logins get a one-time password that you download here — for parents’ safety, passwords are never sent by SMS or email. The message tells parents where to sign in and to collect their password from the school.
                {p.lastSentAt && ` Last sent ${formatRelative(p.lastSentAt)}.`}
              </p>
              {send.error && <p className="text-[13px] text-danger">{errorMessage(send.error)}</p>}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          {result || !canInvite ? (
            <Button variant="outline" onClick={() => close(false)}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button onClick={submit} loading={send.isPending} disabled={!p || !reach}>
                <Send /> {reach ? `Invite ${formatNumber(reach)} parent${reach === 1 ? '' : 's'}` : 'Nobody to invite'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChannelOption({ id, icon: Icon, label, note, checked, disabled, onChange }: { id: string; icon: typeof Mail; label: string; note: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className={cn('flex items-center gap-3 rounded-xl border px-3 py-2.5', disabled ? 'border-border opacity-70' : 'cursor-pointer border-border hover:bg-muted/50')}>
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(v === true)} />
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 text-[13px] font-medium">{label}</span>
      <span className="text-right text-[11.5px] text-muted-foreground">{note}</span>
    </label>
  );
}
