import type { SetupStatus } from '@aischool/shared';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Rocket, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCan, useMe } from '@/lib/auth-store';
import { cn, safeStorage } from '@/lib/utils';
import { useSetupStatus } from './api';

/** A calm circular progress indicator; the label sits in the middle when there's room. */
export function ProgressRing({ value, size = 44, stroke = 4, label = true, className }: { value: number; size?: number; stroke?: number; label?: boolean; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className={cn('relative grid shrink-0 place-items-center', className)} style={{ width: size, height: size }} role="img" aria-label={`${Math.round(pct)}% done`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={pct >= 100 ? 'stroke-success' : 'stroke-brand'}
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (pct / 100) * c }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      {label && (
        <span className="absolute inset-0 grid place-items-center font-display text-[11px] font-semibold tabular-nums text-foreground" style={{ fontSize: Math.max(9, size * 0.24) }}>
          {pct >= 100 ? <Check className="size-[40%] text-success" strokeWidth={3} /> : `${Math.round(pct)}%`}
        </span>
      )}
    </div>
  );
}

/** The small ring beside "Setup" in the sidebar. */
export function SetupNavBadge() {
  const { data } = useSetupStatus();
  if (!data) return null;
  if (data.progressPct >= 100) return <Check className="ml-auto size-3.5 text-success" aria-label="Setup complete" />;
  return (
    <span className="ml-auto flex items-center gap-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">
      {data.progressPct}%
      <ProgressRing value={data.progressPct} size={14} stroke={2.5} label={false} />
    </span>
  );
}

export function nextStep(status: SetupStatus) {
  return status.steps.find((s) => !s.done && s.key !== 'results') ?? null;
}

/** Where a checklist step's button goes: in-page sections on /setup, otherwise its own page. */
export function stepHref(step: SetupStatus['steps'][number]) {
  if (step.href === '/setup') return `/setup#${step.key}`;
  return step.href;
}

const DISMISS_KEY = (tenantId: string) => `aischool:setup-card-dismissed:${tenantId}`;

/** "Finish setting up your school" on the overview, for people who can run setup, until it's done. */
export function SetupProgressCard() {
  const me = useMe();
  const canSetup = useCan('academics.manage');
  const tenantId = me?.tenant?.id ?? '';
  const [dismissed, setDismissed] = useState(() => safeStorage().get(DISMISS_KEY(tenantId)) === '1');
  const { data } = useSetupStatus(canSetup && !dismissed);
  if (!canSetup || dismissed || !data || data.progressPct >= 100) return null;
  const next = nextStep(data);
  const done = data.steps.filter((s) => s.key !== 'results' && s.done).length;
  const total = data.steps.filter((s) => s.key !== 'results').length;
  const dismiss = () => {
    safeStorage().set(DISMISS_KEY(tenantId), '1');
    setDismissed(true);
  };
  return (
    <Card className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-brand/10 blur-3xl" />
      <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6">
        <ProgressRing value={data.progressPct} size={56} stroke={5} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
            <Rocket className="size-4 text-brand" aria-hidden /> Finish setting up your school
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {done} of {total} steps done.
            {next && (
              <>
                {' '}
                Next: <span className="font-medium text-foreground">{next.label}</span> — {next.detail.charAt(0).toLowerCase() + next.detail.slice(1)}.
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5" aria-hidden>
            {data.steps
              .filter((s) => s.key !== 'results')
              .map((s) => (
                <span key={s.key} className={cn('h-1.5 w-6 rounded-full sm:w-8', s.done ? 'bg-brand' : 'bg-muted')} title={s.label} />
              ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {next && (
            <Button asChild variant="outline" size="sm">
              <Link to={stepHref(next)}>{next.label}</Link>
            </Button>
          )}
          <Button asChild size="sm">
            <Link to="/setup">
              Open setup <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-2 top-2 grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Hide this card"
        title="Hide (Setup stays in the menu)"
      >
        <X className="size-4" />
      </button>
    </Card>
  );
}
