import {
  type AllowanceExhausted,
  type MasteryMap,
  type MasteryTopic,
  type MemoryKind,
  type PracticeAttemptRow,
  type StudentAccess,
  type StudentMemoryRow,
  MEMORY_KINDS,
  PRODUCT_PERIOD_LABELS,
} from '@aischool/shared';
import { ArrowRight, Brain, Crown, Gauge, HeartHandshake, Lock, Sparkles, Trash2, Trophy, Zap } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { errorMessage } from '@/lib/api';
import { formatDate, formatMoney, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { allowanceError, useQuickQuiz } from './api';

export const naira = (kobo: number) => formatMoney(kobo / 100, 'NGN', { maximumFractionDigits: 0 });

// ------------------------------------------------------------------ access meter

const TIER_STYLE: Record<StudentAccess['tier'], string> = {
  BASIC: 'bg-muted text-muted-foreground',
  PLUS: 'bg-ai-gradient text-white',
  PRO: 'bg-[linear-gradient(135deg,#f59e0b,#ef4444)] text-white',
};

export function TierBadge({ access, className }: { access: Pick<StudentAccess, 'tier' | 'tierLabel'>; className?: string }) {
  const Icon = access.tier === 'PRO' ? Crown : access.tier === 'PLUS' ? Sparkles : Zap;
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4', TIER_STYLE[access.tier], className)}>
      <Icon className="size-3" aria-hidden />
      {access.tierLabel}
    </span>
  );
}

function meterTone(pct: number) {
  return pct <= 10 ? 'bg-danger' : pct <= 25 ? 'bg-warning' : 'bg-ai-gradient';
}

/** "82% of this term's AI learning left" — never tokens or session counts. */
export function AccessMeter({ access, title = "This term's AI learning", compact, who }: { access: StudentAccess; title?: string; compact?: boolean; who?: string }) {
  const pct = Math.max(0, Math.min(100, access.remainingPct));
  const nearDaily = access.dailyCap > 0 && access.usedToday >= Math.ceil(access.dailyCap * 0.75);
  const dailyLeft = Math.max(0, access.dailyCap - access.usedToday);
  return (
    <div className={cn('min-w-0', compact ? 'space-y-2' : 'space-y-3')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-muted-foreground">
          <Gauge className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{title}</span>
        </div>
        <TierBadge access={access} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn('font-display font-semibold tabular tracking-tight', compact ? 'text-2xl' : 'text-[32px] leading-none')}>{pct}%</span>
        <span className="text-[13px] text-muted-foreground">left{who ? ` for ${who}` : ''}</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`${pct}% of this term's AI learning left`}
      >
        <div className={cn('h-full rounded-full transition-[width] duration-700', meterTone(pct))} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[12px] text-muted-foreground">
        {pct === 0 ? 'All used up for now' : `${pct}% of this term's AI learning left`} · refreshes {formatDate(access.windowEnd, { day: 'numeric', month: 'short' })}
      </p>
      {nearDaily && (
        <p className="rounded-lg bg-warning-soft px-2.5 py-1.5 text-[12px] text-warning">
          {dailyLeft === 0 ? "That's today's fair-use limit reached — the tutor will be ready again tomorrow." : `Nearly at today's fair-use limit — about ${dailyLeft} more question${dailyLeft === 1 ? '' : 's'} today.`}
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ upgrade prompts

/** What a student sees when the allowance or a Plus feature isn't available. Students can't buy. */
export function UpgradeCard({ error, className, onClose }: { error: AllowanceExhausted; className?: string; onClose?: () => void }) {
  const title =
    error.code === 'AI_DAILY_LIMIT' ? "That's enough for today" : error.code === 'AI_FEATURE_NOT_INCLUDED' ? 'This comes with AI Student Plus' : "This term's AI learning is used up";
  const Icon = error.code === 'AI_DAILY_LIMIT' ? Gauge : Sparkles;
  return (
    <div className={cn('relative overflow-hidden rounded-2xl border border-ai-2/25 bg-card p-5 shadow-soft', className)} role="status">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-ai-gradient opacity-[0.12] blur-2xl" />
      <div className="relative flex gap-3.5">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-ai-gradient text-white [&_svg]:size-5">
          <Icon aria-hidden />
        </div>
        <div className="min-w-0 space-y-2">
          <p className="font-display text-[15px] font-semibold tracking-tight">{title}</p>
          <p className="text-[13.5px] text-muted-foreground">{error.message}</p>
          {error.code !== 'AI_DAILY_LIMIT' && (
            <div className="rounded-xl bg-muted/70 p-3 text-[13px]">
              <p className="flex items-center gap-1.5 font-medium">
                <HeartHandshake className="size-4 text-ai-2" aria-hidden /> Ask a parent about {error.upgrade?.name ?? 'AI Student Plus'}
              </p>
              <p className="mt-1 text-muted-foreground">
                Your parent can add it from the <span className="font-medium text-foreground">Family</span> page when they sign in
                {error.upgrade ? ` — ${naira(error.upgrade.priceKobo)} ${PRODUCT_PERIOD_LABELS[error.upgrade.period]}` : ''}. Your school may sponsor it too.
              </p>
            </div>
          )}
          {onClose && (
            <Button variant="ghost" size="sm" className="-ml-2" onClick={onClose}>
              Got it
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Basic tier, Plus-only study tool: an encouraging upsell, not a dead end. */
export function PlusUpsell({ feature, children }: { feature: string; children?: ReactNode }) {
  return (
    <Card className="relative overflow-hidden p-6 sm:p-8">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-ai-gradient opacity-10 blur-3xl" />
      <div className="relative max-w-xl space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ai-gradient px-2.5 py-1 text-[11px] font-semibold text-white">
          <Lock className="size-3" aria-hidden /> AI Student Plus
        </span>
        <h2 className="font-display text-xl font-semibold tracking-tight">{feature} come with AI Student Plus</h2>
        <p className="text-[14px] text-muted-foreground">
          Plus gives you a personal tutor that remembers how you learn, day-by-day study plans, flashcards, photo questions and deeper explanations.
        </p>
        <p className="text-[14px] text-muted-foreground">
          Ask a parent — they can add it from the <span className="font-medium text-foreground">Family</span> page. Your school may also sponsor it for your class.
        </p>
        {children}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ mastery

export const BANDS: { key: MasteryTopic['band']; label: string; range: string; dot: string; bar: string; text: string }[] = [
  { key: 'NOT_STARTED', label: 'Not started', range: 'no practice yet', dot: 'bg-border-strong', bar: 'bg-border-strong', text: 'text-muted-foreground' },
  { key: 'EMERGING', label: 'Emerging', range: 'under 50%', dot: 'bg-danger', bar: 'bg-danger', text: 'text-danger' },
  { key: 'DEVELOPING', label: 'Developing', range: '50–69%', dot: 'bg-warning', bar: 'bg-warning', text: 'text-warning' },
  { key: 'SECURE', label: 'Secure', range: '70–84%', dot: 'bg-info', bar: 'bg-info', text: 'text-info' },
  { key: 'MASTERED', label: 'Mastered', range: '85% and above', dot: 'bg-success', bar: 'bg-success', text: 'text-success' },
];
export const bandOf = (b: MasteryTopic['band']) => BANDS.find((x) => x.key === b) ?? BANDS[0]!;

export function BandLegend({ className }: { className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-muted-foreground', className)} aria-label="Mastery levels">
      {BANDS.map((b) => (
        <li key={b.key} className="flex items-center gap-1.5">
          <span className={cn('size-2.5 rounded-full', b.dot)} aria-hidden />
          <span className="font-medium text-foreground">{b.label}</span>
          <span>{b.range}</span>
        </li>
      ))}
    </ul>
  );
}

export function TopicChip({ t }: { t: MasteryTopic }) {
  const b = bandOf(t.band);
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[12.5px]">
      <span className={cn('size-2 shrink-0 rounded-full', b.dot)} aria-hidden />
      <span className="truncate">{t.topic}</span>
      {t.score != null && <span className={cn('tabular font-medium', b.text)}>{t.score}%</span>}
    </span>
  );
}

function StatPill({ label, value, tone }: { label: string; value: number | null; tone: 'official' | 'practice' }) {
  return (
    <div className={cn('min-w-0 rounded-xl px-3 py-2', tone === 'official' ? 'bg-brand-soft' : 'bg-muted')}>
      <p className={cn('text-[11px] font-medium', tone === 'official' ? 'text-brand' : 'text-muted-foreground')}>{label}</p>
      <p className="font-display text-lg font-semibold tabular leading-tight">{value == null ? '—' : `${value}%`}</p>
    </div>
  );
}

export function MasteryMapView({ map, onQuiz }: { map: MasteryMap; onQuiz?: (subject: string, topic: string) => void }) {
  const subjects = [...map.subjects].sort((a, b) => b.topics.length - a.topics.length || a.subject.localeCompare(b.subject));
  if (subjects.length === 0) {
    return <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">Mastery builds up as you practise and chat with your tutor.</p>;
  }
  return (
    <div className="space-y-4">
      <BandLegend />
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        {subjects.map((s) => (
          <Card key={s.subject} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="min-w-0 font-display text-[15px] font-semibold tracking-tight">{s.subject}</h3>
              <span className="shrink-0 text-[12px] text-muted-foreground">{s.topics.filter((t) => t.band !== 'NOT_STARTED').length}/{s.topics.length} topics</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <StatPill label="Official result" value={s.officialPercent} tone="official" />
              <StatPill label="Practice" value={s.average} tone="practice" />
            </div>
            {s.topics.length === 0 ? (
              <p className="mt-4 text-[13px] text-muted-foreground">No topic practice yet in {s.subject}.</p>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {s.topics.map((t) => {
                  const b = bandOf(t.band);
                  return (
                    <li key={t.topicId} className="group">
                      <div className="flex items-center justify-between gap-3 text-[13px]">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={cn('size-2 shrink-0 rounded-full', b.dot)} aria-hidden />
                          <span className="truncate">{t.topic}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {onQuiz && (
                            <button
                              type="button"
                              onClick={() => onQuiz(s.subject, t.topic)}
                              className="rounded-md px-1.5 text-[12px] font-medium text-brand opacity-100 hover:underline sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                            >
                              Quiz me
                            </button>
                          )}
                          <span className={cn('whitespace-nowrap text-right text-[12px] font-medium', b.text)}>{t.score == null ? b.label : `${t.score}% · ${b.label}`}</span>
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className={cn('h-full rounded-full', b.bar)} style={{ width: `${t.score ?? 0}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ memories

export const MEMORY_LABELS: Record<MemoryKind, string> = { STRENGTH: 'Strength', STRUGGLE: 'Finds tricky', PREFERENCE: 'Preference', GOAL: 'Goal', NOTE: 'Note' };
const MEMORY_TONE: Record<MemoryKind, 'success' | 'warning' | 'info' | 'brand' | 'secondary'> = { STRENGTH: 'success', STRUGGLE: 'warning', PREFERENCE: 'info', GOAL: 'brand', NOTE: 'secondary' };
const SOURCE_LABEL: Record<StudentMemoryRow['source'], string> = { AI: 'Noticed by the tutor', TEACHER: 'From a teacher', STUDENT: 'You told it', PARENT: 'From a parent' };

export function MemoryList({ memories, onForget, forgetting, parentView }: { memories: StudentMemoryRow[]; onForget?: (id: string) => void; forgetting?: string | null; parentView?: boolean }) {
  if (memories.length === 0) {
    return <p className="px-1 py-4 text-[13px] text-muted-foreground">Nothing yet. As {parentView ? 'your child chats' : 'you chat'} with the tutor it notes strengths, tricky topics and how {parentView ? 'they like' : 'you like'} to learn.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {memories.map((m) => (
        <li key={m.id} className="flex items-start gap-3 py-3">
          <Brain className="mt-0.5 size-4 shrink-0 text-ai-2" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px]">{m.content}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <Badge variant={MEMORY_TONE[m.kind]}>{MEMORY_LABELS[m.kind]}</Badge>
              <span>{parentView && m.source === 'STUDENT' ? 'Your child told it' : SOURCE_LABEL[m.source]}</span>
              <span aria-hidden>·</span>
              <span>{formatRelative(m.createdAt)}</span>
            </div>
          </div>
          {onForget && (
            <Button variant="ghost" size="icon-sm" aria-label={`Forget “${m.content}”`} loading={forgetting === m.id} onClick={() => onForget(m.id)}>
              {forgetting !== m.id && <Trash2 />}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function AddMemoryForm({ onAdd, pending, placeholder = 'e.g. I learn best with worked examples' }: { onAdd: (v: { kind: MemoryKind; content: string }) => Promise<unknown>; pending?: boolean; placeholder?: string }) {
  const [kind, setKind] = useState<MemoryKind>('PREFERENCE');
  const [content, setContent] = useState('');
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (content.trim().length < 3) return;
        void onAdd({ kind, content: content.trim() }).then(() => setContent(''));
      }}
    >
      <Select value={kind} onValueChange={(v) => setKind(v as MemoryKind)}>
        <SelectTrigger className="sm:w-40" aria-label="Kind">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MEMORY_KINDS.map((k) => (
            <SelectItem key={k} value={k}>
              {MEMORY_LABELS[k]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input value={content} onChange={(e) => setContent(e.target.value)} maxLength={200} placeholder={placeholder} aria-label="What should the tutor remember?" className="flex-1" />
      <Button type="submit" variant="outline" loading={pending} disabled={content.trim().length < 3}>
        Remember this
      </Button>
    </form>
  );
}

// ------------------------------------------------------------------ attempts

export const MODE_LABEL: Record<PracticeAttemptRow['mode'], string> = { PRACTICE: 'Practice', MOCK: 'Timed mock', AI_QUIZ: 'Quick quiz' };

export function scoreTone(pct: number | null) {
  if (pct == null) return 'text-muted-foreground';
  return pct >= 70 ? 'text-success' : pct >= 50 ? 'text-warning' : 'text-danger';
}

export function AttemptList({ rows, linkable = true, empty }: { rows: PracticeAttemptRow[]; linkable?: boolean; empty?: string }) {
  if (rows.length === 0) return <p className="px-1 py-4 text-[13px] text-muted-foreground">{empty ?? 'No practice yet.'}</p>;
  return (
    <ul className="divide-y divide-border">
      {rows.map((a) => {
        const inner = (
          <>
            <div className={cn('grid size-9 shrink-0 place-items-center rounded-xl', a.mode === 'MOCK' ? 'bg-warning-soft text-warning' : a.mode === 'AI_QUIZ' ? 'bg-ai-2/10 text-ai-2' : 'bg-brand-soft text-brand')}>
              <Trophy className="size-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium">{a.title}</p>
              <p className="text-[12px] text-muted-foreground">
                {MODE_LABEL[a.mode]} · {a.submittedAt ? formatRelative(a.submittedAt) : 'In progress'}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {a.submittedAt ? (
                <>
                  <p className={cn('font-display text-[15px] font-semibold tabular', scoreTone(a.percent))}>{a.percent ?? 0}%</p>
                  <p className="text-[11px] tabular text-muted-foreground">
                    {a.score}/{a.total}
                  </p>
                </>
              ) : (
                <Badge variant="info">{linkable ? 'Continue' : 'In progress'}</Badge>
              )}
            </div>
          </>
        );
        return (
          <li key={a.id}>
            {linkable ? (
              <Link to={`/learn/attempts/${a.id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/60">
                {inner}
              </Link>
            ) : (
              <div className="flex items-center gap-3 py-2.5">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------------ quick quiz

export function QuickQuizDialog({ open, onOpenChange, subject: initialSubject = '', topic: initialTopic = '' }: { open: boolean; onOpenChange: (o: boolean) => void; subject?: string; topic?: string }) {
  const navigate = useNavigate();
  const quiz = useQuickQuiz();
  const [subject, setSubject] = useState(initialSubject);
  const [topic, setTopic] = useState(initialTopic);
  const [count, setCount] = useState(5);
  const [key, setKey] = useState(`${initialSubject}|${initialTopic}`);
  if (key !== `${initialSubject}|${initialTopic}`) {
    setKey(`${initialSubject}|${initialTopic}`);
    setSubject(initialSubject);
    setTopic(initialTopic);
  }
  const upgrade = allowanceError(quiz.error);
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) quiz.reset();
        onOpenChange(o);
      }}
      title="Quick quiz"
      description="A few questions from your tutor to check what you know. It uses a little of your AI learning."
      icon={<Zap />}
      submitLabel="Start quiz"
      pending={quiz.isPending}
      onSubmit={(e) => {
        e?.preventDefault();
        if (subject.trim().length < 2 || topic.trim().length < 2) return;
        quiz.mutate({ subject: subject.trim(), topic: topic.trim(), questions: count }, { onSuccess: (a) => navigate(`/learn/attempts/${a.id}`) });
      }}
    >
      <div className="space-y-4">
        <Field label="Subject" htmlFor="qq-subject">
          <Input id="qq-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Mathematics" />
        </Field>
        <Field label="Topic" htmlFor="qq-topic">
          <Input id="qq-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Linear equations" />
        </Field>
        <Field label="Questions">
          <div className="flex gap-2">
            {[3, 5, 8, 10].map((n) => (
              <Button key={n} type="button" size="sm" variant={count === n ? 'default' : 'outline'} onClick={() => setCount(n)} aria-pressed={count === n}>
                {n}
              </Button>
            ))}
          </div>
        </Field>
        {upgrade ? <UpgradeCard error={upgrade} /> : quiz.error ? <p className="text-[13px] text-danger">{errorMessage(quiz.error)}</p> : null}
      </div>
    </FormDialog>
  );
}

export function SectionTitle({ icon: Icon, title, action }: { icon: typeof Brain; title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex min-w-0 items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden /> <span className="truncate">{title}</span>
      </h2>
      {action}
    </div>
  );
}

export function SeeAll({ to, label = 'See all' }: { to: string; label?: string }) {
  return (
    <Link to={to} className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-brand hover:underline">
      {label} <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}
