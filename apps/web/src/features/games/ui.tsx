import { levelOf, type GameProfileView, type GameRoundResult } from '@aischool/shared';
import { ArrowLeft, BookOpenText, Check, ChevronDown, CircleCheck, CircleX, Flame, Heart, Medal, RotateCcw, Sparkles, Star, Volume2, VolumeX, WifiOff, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { type GameMeta, tint } from './meta';
import { useGameMode } from './mode';
import { play, setSound, useSound } from './sound';
import { canSpeak, setAutoRead, speak, useAutoRead } from './speech';

// ------------------------------------------------------------------ frame

export function SoundToggle({ className }: { className?: string }) {
  const on = useSound();
  return (
    <Button type="button" variant="ghost" size="icon" className={className} aria-pressed={on} aria-label={on ? 'Sound on: turn off' : 'Sound off: turn on'} title={on ? 'Sound on' : 'Sound off'} onClick={() => setSound(!on)}>
      {on ? <Volume2 /> : <VolumeX />}
    </Button>
  );
}

/** Read-aloud on or off for every question (primary classes; on by default in young mode). */
export function AutoReadToggle() {
  const mode = useGameMode();
  const on = useAutoRead(mode.young);
  if (!mode.readAloud || !canSpeak()) return null;
  return (
    <Button type="button" variant={on ? 'secondary' : 'ghost'} size="icon" aria-pressed={on} aria-label={on ? 'Reading questions aloud: turn off' : 'Read questions aloud'} title={on ? 'Reading aloud' : 'Read aloud'} onClick={() => setAutoRead(!on)}>
      <BookOpenText />
    </Button>
  );
}

/** A speaker button: says the parts aloud (the browser's own voice). Nothing shows if the phone can't speak. */
export function SpeakButton({ parts, label = 'Read aloud', className, big }: { parts: string[]; label?: string; className?: string; big?: boolean }) {
  if (!canSpeak()) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        speak(parts);
      }}
      aria-label={label}
      title={label}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full border border-border bg-card text-brand shadow-xs transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        big ? 'size-14' : 'size-10',
        className,
      )}
    >
      <Volume2 className={big ? 'size-7' : 'size-5'} aria-hidden />
    </button>
  );
}

/** Says the parts each time `key` changes, when auto-read is on. */
export function useAutoSpeak(parts: string[] | null, key: string | number, young: boolean) {
  const on = useAutoRead(young);
  const latest = useRef(parts);
  latest.current = parts;
  useEffect(() => {
    if (on && latest.current) speak(latest.current);
  }, [key, on]);
}

/** A game's page: back to the hub, its name, read-aloud (primary) and sound. Narrow and centred, made for a phone held in one hand. */
export function GameFrame({ meta, children, right }: { meta: GameMeta; children: ReactNode; right?: ReactNode }) {
  useDocumentTitle(meta.name);
  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-10 pt-4 sm:pt-6">
      <div className="mb-4 flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back to games">
          <Link to="/games">
            <ArrowLeft />
          </Link>
        </Button>
        <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: tint(meta.accent), color: meta.accent }}>
          <meta.icon className="size-4" aria-hidden />
        </span>
        <h1 className="min-w-0 flex-1 truncate font-display text-lg font-semibold tracking-tight">{meta.name}</h1>
        {right}
        <AutoReadToggle />
        <SoundToggle />
      </div>
      {children}
    </div>
  );
}

export function Intro({ meta, rules, onStart, starting, children, startLabel = 'Start' }: { meta: GameMeta; rules: string[]; onStart: () => void; starting?: boolean; children?: ReactNode; startLabel?: string }) {
  const { young } = useGameMode();
  if (young) {
    // Young mode: a big picture, a line or two, and a big "Play" button; the speaker reads it all.
    return (
      <div className="rounded-3xl border border-border bg-card p-6 text-center shadow-soft">
        <div className="mx-auto mb-3 grid size-24 place-items-center rounded-3xl text-6xl" style={{ background: tint(meta.accent, 18) }} aria-hidden>
          {meta.emoji}
        </div>
        <h2 className="font-display text-3xl font-semibold tracking-tight">{meta.name}</h2>
        <p className="mt-2 text-xl">{meta.youngTagline}</p>
        <ul className="mt-4 space-y-2 text-left text-lg">
          {rules.map((r) => (
            <li key={r} className="flex gap-2">
              <Star className="mt-1 size-5 shrink-0 fill-warning text-warning" aria-hidden />
              <span>{r}</span>
            </li>
          ))}
        </ul>
        {children}
        <div className="mt-6 flex items-center gap-3">
          <SpeakButton big parts={[meta.name, meta.youngTagline, ...rules]} label="Hear how to play" />
          <Button size="lg" variant="brand" className="h-16 flex-1 rounded-2xl text-2xl" onClick={onStart} loading={starting} autoFocus>
            {startLabel === 'Start' ? 'Play' : startLabel}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl" style={{ background: tint(meta.accent, 18), color: meta.accent }}>
        <meta.icon className="size-7" aria-hidden />
      </div>
      <h2 className="font-display text-2xl font-semibold tracking-tight">{meta.name}</h2>
      <p className="mt-1 text-[14px] text-muted-foreground">{meta.tagline}</p>
      <ul className="mt-4 space-y-2 text-[14px]">
        {rules.map((r) => (
          <li key={r} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            <span>{r}</span>
          </li>
        ))}
      </ul>
      {children}
      <Button size="lg" variant="brand" className="mt-6 h-12 w-full text-base" onClick={onStart} loading={starting} autoFocus>
        {startLabel}
      </Button>
    </div>
  );
}

// ------------------------------------------------------------------ in play

export function Hud({ items }: { items: { label: string; value: ReactNode; icon?: ReactNode; tone?: string }[] }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2" aria-live="polite">
      {items.map((i) => (
        <span key={i.label} className={cn('inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[13px] font-medium tabular', i.tone)}>
          {i.icon}
          <span className="sr-only">{i.label}: </span>
          {i.value}
        </span>
      ))}
    </div>
  );
}

export function Lives({ left, of }: { left: number; of: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`${left} of ${of} lives left`}>
      {Array.from({ length: of }, (_, i) => (
        <Heart key={i} className={cn('size-3.5', i < left ? 'fill-danger text-danger' : 'text-muted-foreground/40')} aria-hidden />
      ))}
      <span className="ml-1">{left}</span>
    </span>
  );
}

/** Time left on a question: a bar plus the seconds in words (colour isn't the only cue). Calls onExpire once. */
export function useCountdown(seconds: number, key: string | number, running: boolean, onExpire: () => void) {
  const [left, setLeft] = useState(seconds * 1000);
  const fired = useRef(false);
  const expire = useRef(onExpire);
  expire.current = onExpire;
  useEffect(() => {
    fired.current = false;
    setLeft(seconds * 1000);
    if (!running) return;
    const start = performance.now();
    const id = window.setInterval(() => {
      const l = Math.max(0, seconds * 1000 - (performance.now() - start));
      setLeft(l);
      if (l <= 0 && !fired.current) {
        fired.current = true;
        window.clearInterval(id);
        expire.current();
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [seconds, key, running]);
  return left;
}

export function TimeBar({ leftMs, totalMs, paused }: { leftMs: number; totalMs: number; paused?: boolean }) {
  const pct = Math.max(0, Math.min(100, (100 * leftMs) / totalMs));
  const secs = Math.ceil(leftMs / 1000);
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={Math.round(totalMs / 1000)} aria-valuenow={secs} aria-label="Time left">
        <div className={cn('h-full rounded-full transition-[width] duration-100 ease-linear motion-reduce:transition-none', pct > 50 ? 'bg-success' : pct > 20 ? 'bg-warning' : 'bg-danger')} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn('w-10 text-right text-[13px] font-semibold tabular', secs <= 3 && !paused && 'text-danger')}>{paused ? '–' : `${secs}s`}</span>
    </div>
  );
}

export type OptionState = 'idle' | 'right' | 'wrong' | 'missed' | 'dim';

/** A big answer button: the number is its keyboard key; right/wrong also show an icon and a word. */
export function OptionButton({ label, n, state, onClick, disabled, young }: { label: string; n: number; state: OptionState; onClick: () => void; disabled?: boolean; young?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left font-medium transition-[background-color,border-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] motion-reduce:transform-none disabled:cursor-default',
        young ? 'min-h-20 text-xl' : 'min-h-14 text-[15px]',
        state === 'idle' && 'border-border bg-card hover:border-border-strong hover:bg-muted/60',
        state === 'right' && 'border-success bg-success-soft text-foreground',
        state === 'wrong' && 'border-danger bg-danger-soft text-foreground',
        state === 'missed' && 'border-success border-dashed bg-card',
        state === 'dim' && 'border-border bg-card opacity-55',
      )}
    >
      <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg text-[12px] font-semibold', state === 'right' ? 'bg-success text-white' : state === 'wrong' ? 'bg-danger text-white' : 'bg-muted text-muted-foreground')} aria-hidden>
        {state === 'right' ? <Check className="size-4" /> : state === 'wrong' ? <X className="size-4" /> : n}
      </span>
      <span className="min-w-0 flex-1 break-words">{label}</span>
      {state === 'right' && <span className="text-[12px] font-semibold text-success">Correct</span>}
      {state === 'wrong' && <span className="text-[12px] font-semibold text-danger">Your answer</span>}
      {state === 'missed' && <span className="text-[12px] font-semibold text-success">Right answer</span>}
    </button>
  );
}

/** Number keys 1–9 pick an option; Enter continues. Ignored while typing in a box. */
export function useKeys(handlers: Record<string, () => void>, enabled = true) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!enabled) return;
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const h = ref.current[e.key] ?? ref.current[e.key.toLowerCase()];
      if (h) {
        e.preventDefault();
        h();
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [enabled]);
}

const PRAISE = ['Well done!', 'Brilliant!', 'Super!', 'Great job!', 'You got it!'];
/** Cheerful words for young mode (the same one for the same question, so it doesn't flicker). */
export const praiseFor = (k: number) => PRAISE[k % PRAISE.length]!;

export function Feedback({ correct, text, timedOut, young, k = 0 }: { correct: boolean; text?: string | null; timedOut?: boolean; young?: boolean; k?: number }) {
  if (young) {
    return (
      <div role="status" className={cn('mt-3 flex items-center gap-3 rounded-2xl px-4 py-3 text-lg', correct ? 'bg-success-soft' : 'bg-warning-soft')}>
        <span className="text-3xl" aria-hidden>
          {correct ? '⭐' : '💪'}
        </span>
        <span>
          <strong className="font-semibold">{correct ? praiseFor(k) : 'Good try!'}</strong> {text}
        </span>
      </div>
    );
  }
  return (
    <div role="status" className={cn('mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[13.5px]', correct ? 'bg-success-soft' : 'bg-danger-soft')}>
      {correct ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <CircleX className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />}
      <span>
        <strong className="font-semibold">{correct ? 'Correct!' : timedOut ? 'Time’s up.' : 'Not quite.'}</strong> {text}
      </span>
    </div>
  );
}

/** One to three stars for a round (young mode's score). */
export const starsFor = (correct: number, total: number) => (!total ? 0 : correct / total >= 0.9 ? 3 : correct / total >= 0.6 ? 2 : correct > 0 ? 1 : 0);

export function Stars({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)} role="img" aria-label={`${n} star${n === 1 ? '' : 's'} out of 3`}>
      {[0, 1, 2].map((i) => (
        <Star key={i} className={cn('size-12 transition-transform', i < n ? 'fill-warning text-warning' : 'text-muted-foreground/30')} aria-hidden />
      ))}
    </span>
  );
}

// ------------------------------------------------------------------ results

export function XpBar({ xp, className }: { xp: number; className?: string }) {
  const lv = levelOf(xp);
  return (
    <div className={className}>
      <div className="mb-1 flex items-baseline justify-between text-[12.5px]">
        <span className="font-semibold">
          Level {lv.level} <span className="font-normal text-muted-foreground">· {lv.title}</span>
        </span>
        <span className="tabular text-muted-foreground">
          {lv.into}/{lv.span} XP
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={lv.span} aria-valuenow={lv.into} aria-label={`Level ${lv.level} progress`}>
        <div className="h-full rounded-full bg-ai-gradient" style={{ width: `${Math.max(3, (100 * lv.into) / lv.span)}%` }} />
      </div>
    </div>
  );
}

export interface ResultProps {
  meta: GameMeta;
  correct: number;
  total: number;
  /** Shown big; a game-specific line under it. */
  headline?: string;
  sub?: string;
  result?: GameRoundResult | null;
  queued?: boolean;
  rejected?: string | null;
  onAgain: () => void;
  review?: GameRoundResult['review'];
  extra?: ReactNode;
}

const cheer = (pct: number) => (pct >= 90 ? 'Brilliant!' : pct >= 70 ? 'Great work!' : pct >= 50 ? 'Good effort!' : 'Keep practising!');

export function ResultView(props: ResultProps) {
  const { young } = useGameMode();
  return young ? <YoungResult {...props} /> : <OlderResult {...props} />;
}

/** Young mode: stars, a big "Well done", the right answers to look at; XP shown small. */
function YoungResult({ meta, correct, total, result, queued, rejected, onAgain, extra }: ResultProps) {
  const stars = starsFor(correct, total);
  const words = stars === 3 ? 'Well done, superstar!' : stars === 2 ? 'Well done!' : stars === 1 ? 'Good try! Keep practising.' : 'Let’s try again!';
  useEffect(() => {
    play('done');
    speak([`${words} You got ${correct} out of ${total}.`]);
  }, [words, correct, total]);
  return (
    <div className="rounded-3xl border border-border bg-card p-6 text-center shadow-soft">
      <Stars n={stars} className="justify-center" />
      <p className="mt-3 font-display text-3xl font-semibold tracking-tight">{words}</p>
      <p className="mt-1 text-xl">
        You got <strong className="tabular">{correct}</strong> out of <strong className="tabular">{total}</strong>
      </p>
      {result ? (
        <div className="mt-4 space-y-2">
          <p className="flex items-center justify-center gap-2 text-lg font-semibold">
            <Sparkles className="size-5 text-brand" aria-hidden /> +{result.xp} XP
            {result.leveledUp && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[13px] text-brand">Level up!</span>}
          </p>
          {result.xpNote && <p className="text-[13px] text-muted-foreground">{result.xpNote}</p>}
          {result.newBadges.map((b) => (
            <p key={b.key} className="mx-auto flex max-w-sm items-center justify-center gap-2 rounded-2xl bg-warning-soft px-3 py-2 text-[15px]">
              <Medal className="size-5 shrink-0 text-warning" aria-hidden /> <span className="font-semibold">New badge: {b.label}</span>
            </p>
          ))}
        </div>
      ) : queued ? (
        <p className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-muted px-3 py-2 text-[14px]">
          <WifiOff className="size-4 shrink-0" aria-hidden /> Saved on this phone.
        </p>
      ) : rejected ? (
        <p className="mt-4 rounded-xl bg-danger-soft px-3 py-2 text-[14px]">{rejected}</p>
      ) : (
        <p className="mt-4 text-[14px] text-muted-foreground">Saving…</p>
      )}
      {extra}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button asChild variant="outline" size="lg" className="h-16 rounded-2xl text-lg">
          <Link to="/games">All games</Link>
        </Button>
        {meta.kind !== 'DAILY' ? (
          <Button variant="brand" size="lg" className="h-16 rounded-2xl text-lg" onClick={onAgain} autoFocus>
            <RotateCcw /> Play again
          </Button>
        ) : (
          <Button asChild variant="brand" size="lg" className="h-16 rounded-2xl text-lg">
            <Link to="/games">More games</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function OlderResult({ meta, correct, total, headline, sub, result, queued, rejected, onAgain, review, extra }: ResultProps) {
  const pct = total ? Math.round((100 * correct) / total) : 0;
  const [open, setOpen] = useState(false);
  useEffect(() => play('done'), []);
  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border bg-card p-5 text-center shadow-soft sm:p-6">
        <div className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl" style={{ background: tint(meta.accent, 18), color: meta.accent }}>
          <Medal className="size-7" aria-hidden />
        </div>
        <p className="text-[13px] font-medium text-muted-foreground">{cheer(pct)}</p>
        <p className="mt-1 font-display text-4xl font-semibold tabular tracking-tight">{headline ?? `${correct}/${total}`}</p>
        {sub && <p className="mt-1 text-[14px] text-muted-foreground">{sub}</p>}
        {result ? (
          <div className="mt-4 space-y-3 text-left">
            <div className="flex items-center justify-center gap-2 text-[15px] font-semibold">
              <Sparkles className="size-4 text-brand" aria-hidden /> +{result.xp} XP
              {result.leveledUp && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[12px] text-brand">Level up!</span>}
            </div>
            {result.xpNote && <p className="text-center text-[12.5px] text-muted-foreground">{result.xpNote}</p>}
            <XpBar xp={result.profile.xp} />
            <StreakLine profile={result.profile} />
            {result.newBadges.length > 0 && (
              <div className="rounded-2xl border border-border bg-muted/40 p-3">
                <p className="mb-2 text-[12.5px] font-semibold">New badge{result.newBadges.length > 1 ? 's' : ''}</p>
                <ul className="space-y-1.5">
                  {result.newBadges.map((b) => (
                    <li key={b.key} className="flex items-center gap-2 text-[13.5px]">
                      <Medal className="size-4 shrink-0 text-warning" aria-hidden />
                      <span className="font-medium">{b.label}</span>
                      <span className="truncate text-muted-foreground">· {b.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : queued ? (
          <p className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-muted px-3 py-2 text-[13px]">
            <WifiOff className="size-4 shrink-0" aria-hidden /> Saved on this phone. Your XP is added when you’re back online.
          </p>
        ) : rejected ? (
          <p className="mt-4 rounded-xl bg-danger-soft px-3 py-2 text-[13px]">{rejected}</p>
        ) : (
          <p className="mt-4 text-[13px] text-muted-foreground">Saving your score…</p>
        )}
        {extra}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button asChild variant="outline" size="lg" className="h-12">
            <Link to="/games">All games</Link>
          </Button>
          {meta.kind !== 'DAILY' ? (
            <Button variant="brand" size="lg" className="h-12" onClick={onAgain} autoFocus>
              <RotateCcw /> Play again
            </Button>
          ) : (
            <Button asChild variant="brand" size="lg" className="h-12">
              <Link to="/games/play/quiz-rush">Quiz Rush</Link>
            </Button>
          )}
        </div>
      </div>
      {review && review.length > 0 && (
        <div className="rounded-2xl border border-border bg-card shadow-soft">
          <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-[14px] font-semibold" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            Check your answers
            <ChevronDown className={cn('size-4 transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
          </button>
          {open && (
            <ol className="space-y-3 border-t border-border px-4 py-3">
              {review.map((r, i) => (
                <li key={i} className="text-[13.5px]">
                  <p className="font-medium">
                    {i + 1}. {r.prompt}
                  </p>
                  <p className={cn('mt-0.5 flex items-center gap-1.5', r.correct ? 'text-success' : 'text-danger')}>
                    {r.correct ? <CircleCheck className="size-3.5" aria-hidden /> : <CircleX className="size-3.5" aria-hidden />}
                    {r.correct ? 'Right' : 'Wrong'}: {r.yourAnswer ?? 'no answer'}
                  </p>
                  {!r.correct && <p className="text-muted-foreground">Answer: {r.correctAnswer}</p>}
                  {r.explanation && <p className="text-muted-foreground">{r.explanation}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

export function StreakLine({ profile }: { profile: GameProfileView }) {
  return (
    <p className="flex items-center justify-center gap-1.5 text-[13px]">
      <Flame className={cn('size-4', profile.streak ? 'text-warning' : 'text-muted-foreground')} aria-hidden />
      <span className="font-semibold tabular">{profile.streak}-day streak</span>
      {profile.playedToday && <span className="text-muted-foreground">· today counted</span>}
    </p>
  );
}

export function Loading({ label = 'Getting the round ready…' }: { label?: string }) {
  return (
    <div className="grid min-h-60 place-items-center rounded-3xl border border-border bg-card text-[14px] text-muted-foreground" role="status">
      {label}
    </div>
  );
}

export function Problem({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-6 text-center shadow-soft" role="alert">
      <p className="text-[14.5px]">{message}</p>
      <div className="mt-4 flex justify-center gap-2">
        <Button asChild variant="outline">
          <Link to="/games">All games</Link>
        </Button>
        {onRetry && <Button onClick={onRetry}>Try again</Button>}
      </div>
    </div>
  );
}
