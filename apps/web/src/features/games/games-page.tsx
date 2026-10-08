import { GAME_LABELS, gamesFor, type GamesHub } from '@aischool/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CalendarCheck2, CircleCheck, Clock, Flame, Lock, Medal, Snowflake, Trophy, Users, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { flushScores, gk, queuedScores, rememberedLevel, rememberLevel, useGamesHub, useSetHidden } from './api';
import { GAME_META, type GameMeta, metaOf, tint } from './meta';
import { canSpeak } from './speech';
import { SoundToggle, SpeakButton, XpBar } from './ui';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Fetch the offline games' code while the phone is idle and online, so they open later with no connection. */
function prefetchOfflineGames() {
  const go = () => {
    void import('./maths-sprint');
    void import('./word-games');
    void import('./match-up');
    void import('./tf-blitz');
    void import('./early-games');
    void import('./word-search');
    void import('./crossword');
    void import('./play-page');
  };
  const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(go);
  else window.setTimeout(go, 2500);
}

export default function GamesPage() {
  useDocumentTitle('Games');
  const hub = useGamesHub();
  const qc = useQueryClient();
  const [waiting, setWaiting] = useState(queuedScores);
  const h = hub.data;

  useEffect(() => {
    if (h) rememberLevel({ level: h.student.level, year: h.student.year, early: h.student.early, young: h.student.young });
  }, [h]);

  // Scores played offline go up as soon as there's a connection.
  useEffect(() => {
    const sync = () =>
      void flushScores().then((n) => {
        setWaiting(queuedScores());
        if (n) void qc.invalidateQueries({ queryKey: gk.hub });
      });
    sync();
    if (navigator.onLine) prefetchOfflineGames();
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, [qc]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 lg:py-8">
      <div className="mb-5 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]">Games</h1>
          <p className="mt-0.5 text-[14px] text-muted-foreground">{h ? `Play, learn and level up, ${h.student.firstName}.` : 'Play, learn and level up.'}</p>
        </div>
        <SoundToggle />
        {h?.leaderboards && (
          <Button asChild variant="outline" className="h-10">
            <Link to="/games/leaderboard">
              <Trophy /> <span className="hidden sm:inline">Leaderboard</span>
              <span className="sr-only sm:hidden">Leaderboard</span>
            </Link>
          </Button>
        )}
      </div>

      {waiting > 0 && (
        <p className="mb-4 flex items-center gap-2 rounded-2xl bg-muted px-4 py-2.5 text-[13px]" role="status">
          <WifiOff className="size-4 shrink-0" aria-hidden /> {waiting} score{waiting === 1 ? '' : 's'} saved on this phone will be sent when you’re online.
        </p>
      )}

      {!h && hub.isPending && <HubSkeleton />}
      {!h && hub.error && <OfflineHub message={errorMessage(hub.error)} />}
      {h && (h.student.young ? <YoungHub h={h} /> : <Hub h={h} />)}
    </div>
  );
}

function Hub({ h }: { h: GamesHub }) {
  const closed = !h.access.open;
  return (
    <div className="space-y-6">
      {closed && (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning-soft px-4 py-3 text-[14px]" role="status">
          <Lock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>{h.access.message}</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <DailyCard h={h} closed={closed} />
        <ProfileCard h={h} />
      </div>

      <section aria-labelledby="games-title">
        <h2 id="games-title" className="mb-3 font-display text-[17px] font-semibold tracking-tight">
          Pick a game
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {h.student.games.map((k) => (
            <GameTile key={k} g={metaOf(k)} disabled={closed} />
          ))}
        </div>
      </section>

      {h.subjects.some((s) => s.questions >= 5) && (
        <section aria-labelledby="subjects-title">
          <h2 id="subjects-title" className="mb-1 font-display text-[17px] font-semibold tracking-tight">
            Practise a subject
          </h2>
          <p className="mb-3 text-[13px] text-muted-foreground">A Quiz Rush on just one of your subjects.</p>
          <div className="flex flex-wrap gap-2">
            {h.subjects
              .filter((s) => s.questions >= 5)
              .map((s) => (
                <Link
                  key={s.subject}
                  to={`/games/play/quiz-rush?subject=${encodeURIComponent(s.subject)}`}
                  aria-disabled={closed}
                  className={cn('inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-[13px] font-medium shadow-xs transition-colors hover:bg-muted', closed && 'pointer-events-none opacity-50')}
                >
                  {s.subject}
                  <span className="text-[11.5px] text-muted-foreground tabular">{s.questions}</span>
                </Link>
              ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Badges h={h} />
        <div className="space-y-4">
          <Recent h={h} />
          {h.leaderboards && <Privacy hidden={h.profile.hidden} />}
        </div>
      </div>
    </div>
  );
}

/**
 * Young mode (nursery to Primary 3): big picture tiles that read their name
 * aloud, today's challenge, stars and badges. No leaderboards, no small print.
 */
function YoungHub({ h }: { h: GamesHub }) {
  const closed = !h.access.open;
  const p = h.profile;
  const d = h.daily;
  const earned = h.badges.filter((b) => b.earnedAt);
  return (
    <div className="space-y-5">
      {closed && (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning-soft px-4 py-3 text-[16px]" role="status">
          <Lock className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          <span>{h.access.message}</span>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <section aria-label="Your stars" className="flex items-center gap-4 rounded-3xl border border-border bg-card p-5 shadow-soft">
          <span className="text-5xl leading-none" aria-hidden>
            ⭐
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-3xl font-semibold leading-none tabular">{p.correct}</p>
            <p className="mt-1 text-[15px] text-muted-foreground">stars so far</p>
          </div>
          <div className="text-center">
            <p className="font-display text-2xl font-semibold leading-none tabular">
              {p.streak} <span aria-hidden>🔥</span>
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">day{p.streak === 1 ? '' : 's'} in a row</p>
          </div>
        </section>
        {d.available && (
          <section aria-labelledby="young-daily" className="relative overflow-hidden rounded-3xl p-5 text-white shadow-soft" style={{ background: 'linear-gradient(125deg, #3730a3, #5b21b6 55%, #7e22ce)' }}>
            <h2 id="young-daily" className="flex items-center gap-2 font-display text-2xl font-semibold">
              <span aria-hidden>🌟</span> Today’s challenge
            </h2>
            <p className="mt-1 text-[16px] text-white/90">{d.done ? `You got ${d.result?.correct} out of ${d.result?.total}. Well done!` : `${d.questions} questions for your class.`}</p>
            {!d.done && (
              <Button asChild size="lg" className={cn('mt-3 h-14 rounded-2xl bg-white px-8 text-xl text-[#1b1d45] hover:bg-white/90', closed && 'pointer-events-none opacity-60')}>
                <Link to="/games/play/daily" aria-disabled={closed}>
                  {d.inProgress ? 'Carry on' : 'Play'} <ArrowRight />
                </Link>
              </Button>
            )}
          </section>
        )}
      </div>

      <section aria-labelledby="young-games">
        <h2 id="young-games" className="mb-3 font-display text-2xl font-semibold tracking-tight">
          Pick a game
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {h.student.games.map((k) => (
            <YoungTile key={k} g={metaOf(k)} disabled={closed} />
          ))}
        </div>
      </section>

      <section aria-labelledby="young-badges" className="rounded-3xl border border-border bg-card p-5 shadow-soft">
        <h2 id="young-badges" className="mb-3 flex items-center gap-2 font-display text-xl font-semibold">
          <Medal className="size-5 text-warning" aria-hidden /> My badges
          <span className="ml-auto text-[14px] font-normal text-muted-foreground tabular">{earned.length}</span>
        </h2>
        {earned.length ? (
          <ul className="flex flex-wrap gap-2">
            {earned.map((b) => (
              <li key={b.key} className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1.5 text-[15px] font-semibold" title={b.description}>
                <span aria-hidden>🏅</span> {b.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[16px] text-muted-foreground">Play a game to win your first badge!</p>
        )}
      </section>
    </div>
  );
}

/** A big picture tile; the speaker says what the game is. */
function YoungTile({ g, disabled }: { g: GameMeta; disabled?: boolean }) {
  return (
    <div className="relative">
      <Link
        to={`/games/play/${g.slug}`}
        aria-disabled={disabled}
        className={cn(
          'flex min-h-44 flex-col items-center justify-center gap-2 rounded-3xl border-2 border-border bg-card p-4 text-center shadow-soft transition-[border-color,transform] hover:-translate-y-0.5 hover:border-border-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring active:scale-[0.98] motion-reduce:transform-none',
          disabled && 'pointer-events-none opacity-50',
        )}
        style={{ background: `linear-gradient(180deg, ${tint(g.accent, 16)}, transparent 70%)` }}
      >
        <span className="text-6xl leading-none" aria-hidden>
          {g.emoji}
        </span>
        <span className="font-display text-xl font-semibold leading-tight">{g.name}</span>
        <span className="text-[14px] leading-snug text-muted-foreground">{g.youngTagline}</span>
      </Link>
      {canSpeak() && <SpeakButton parts={[g.name, g.youngTagline]} label={`Hear: ${g.name}`} className="absolute right-2 top-2 size-9" />}
    </div>
  );
}

function DailyCard({ h, closed }: { h: GamesHub; closed: boolean }) {
  const d = h.daily;
  return (
    <section aria-labelledby="daily-title" className="relative overflow-hidden rounded-3xl p-5 text-white shadow-soft sm:p-6" style={{ background: 'linear-gradient(125deg, #3730a3, #5b21b6 55%, #7e22ce)' }}>
      <div aria-hidden className="absolute -right-10 -top-10 size-40 rounded-full bg-white/10" />
      <div aria-hidden className="absolute -bottom-14 right-16 size-32 rounded-full bg-white/10" />
      <p className="relative flex items-center gap-2 text-[12.5px] font-medium text-white/85">
        <CalendarCheck2 className="size-4" aria-hidden /> Daily Challenge · {new Date(`${d.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>
      <h2 id="daily-title" className="relative mt-2 font-display text-[22px] font-semibold leading-tight tracking-tight sm:text-2xl">
        {d.done ? `You scored ${d.result?.correct}/${d.result?.total} today` : `${d.questions} questions for ${h.student.className ?? 'your class'}`}
      </h2>
      <p className="relative mt-1 text-[13.5px] text-white/85">
        {d.done ? `+${d.result?.xp} XP. A new challenge comes tomorrow.` : 'The same questions for everyone in your class. One try, no clock, double XP.'}
      </p>
      <div className="relative mt-4 flex flex-wrap items-center gap-3">
        {d.available && !d.done && (
          <Button asChild size="lg" className={cn('h-12 bg-white px-6 text-[15px] text-[#1b1d45] hover:bg-white/90', closed && 'pointer-events-none opacity-60')}>
            <Link to="/games/play/daily" aria-disabled={closed}>
              {d.inProgress ? 'Carry on' : 'Start'} <ArrowRight />
            </Link>
          </Button>
        )}
        {d.done && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[13px] font-medium">
            <CircleCheck className="size-4" aria-hidden /> Done for today
          </span>
        )}
        {!d.available && <span className="text-[13px] text-white/85">You need to be in a class for the Daily Challenge.</span>}
        <span className="inline-flex items-center gap-1.5 text-[13px] text-white/85">
          <Users className="size-4" aria-hidden /> {d.classDone} classmate{d.classDone === 1 ? ' has' : 's have'} done it
        </span>
      </div>
    </section>
  );
}

function ProfileCard({ h }: { h: GamesHub }) {
  const p = h.profile;
  const today = (new Date(`${h.today}T12:00:00`).getDay() + 6) % 7;
  return (
    <section aria-label="Your progress" className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center gap-4">
        <div className="grid size-16 shrink-0 place-items-center rounded-2xl" style={{ background: tint('var(--warning)', p.streak ? 18 : 8) }}>
          <Flame className={cn('size-7', p.streak ? 'text-warning' : 'text-muted-foreground')} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[26px] font-semibold leading-none tabular">
            {p.streak} <span className="text-[15px] font-medium text-muted-foreground">day streak</span>
          </p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {p.playedToday ? 'Today counted. ' : p.streak ? 'Play today to keep it going. ' : 'Play today to start a streak. '}
            Best: {p.bestStreak}
          </p>
          <p className={cn('mt-1 inline-flex items-center gap-1 text-[12px]', p.freezeAvailable ? 'text-info' : 'text-muted-foreground')}>
            <Snowflake className="size-3.5" aria-hidden /> {p.freezeAvailable ? 'Streak freeze ready: one missed day this week is covered' : 'This week’s streak freeze is used'}
          </p>
        </div>
      </div>
      <ol className="mt-4 grid grid-cols-7 gap-1.5" aria-label="Days played this week">
        {h.week.days.map((played, i) => (
          <li key={i} className="flex flex-col items-center gap-1">
            <span
              className={cn('grid size-8 place-items-center rounded-full text-[11px] font-semibold', played ? 'bg-warning text-white' : 'bg-muted text-muted-foreground', i === today && !played && 'ring-2 ring-warning/50')}
              aria-label={`${DAY_NAMES[i]}: ${played ? 'played' : 'not played'}`}
            >
              {played ? <Flame className="size-3.5" aria-hidden /> : DAYS[i]}
            </span>
          </li>
        ))}
      </ol>
      <XpBar xp={p.xp} className="mt-4" />
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          ['This week', `${h.week.xp} XP`],
          ['Rounds', p.rounds],
          ['Correct', p.correct],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-xl bg-muted/60 px-2 py-2">
            <dt className="text-[11px] text-muted-foreground">{k}</dt>
            <dd className="font-display text-[16px] font-semibold tabular">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function GameTile({ g, disabled }: { g: GameMeta; disabled?: boolean }) {
  return (
    <Link
      to={`/games/play/${g.slug}`}
      aria-disabled={disabled}
      className={cn(
        'group relative flex min-h-36 flex-col rounded-3xl border border-border bg-card p-4 shadow-soft transition-[border-color,transform] hover:-translate-y-0.5 hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none sm:p-5',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <span className="grid size-11 place-items-center rounded-2xl" style={{ background: tint(g.accent, 16), color: g.accent }}>
        <g.icon className="size-5" aria-hidden />
      </span>
      <span className="mt-3 font-display text-[16px] font-semibold leading-tight tracking-tight">{g.name}</span>
      <span className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-muted-foreground">{g.tagline}</span>
      <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-3 text-[11.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3" aria-hidden /> {g.minutes}
        </span>
        {g.offline && (
          <span className="inline-flex items-center gap-1">
            <WifiOff className="size-3" aria-hidden /> Offline
          </span>
        )}
      </span>
    </Link>
  );
}

function Badges({ h }: { h: GamesHub }) {
  const earned = h.badges.filter((b) => b.earnedAt).length;
  return (
    <section aria-labelledby="badges-title" className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <h2 id="badges-title" className="mb-3 flex items-center gap-2 font-display text-[16px] font-semibold tracking-tight">
        <Medal className="size-4 text-muted-foreground" aria-hidden /> Badges
        <span className="ml-auto text-[12.5px] font-normal text-muted-foreground tabular">
          {earned} of {h.badges.length}
        </span>
      </h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {h.badges.map((b) => (
          <li key={b.key} className={cn('flex items-start gap-2 rounded-xl border px-2.5 py-2', b.earnedAt ? 'border-warning/40 bg-warning-soft' : 'border-border bg-muted/30')} title={b.description}>
            {b.earnedAt ? <Medal className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /> : <Lock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
            <span className="min-w-0">
              <span className={cn('block text-[12.5px] font-semibold leading-tight', !b.earnedAt && 'text-muted-foreground')}>{b.label}</span>
              <span className="block text-[11px] leading-snug text-muted-foreground">{b.description}</span>
              <span className="sr-only">{b.earnedAt ? 'Earned' : 'Not earned yet'}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Recent({ h }: { h: GamesHub }) {
  return (
    <section aria-labelledby="recent-title" className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <h2 id="recent-title" className="mb-3 font-display text-[16px] font-semibold tracking-tight">
        Recent rounds
      </h2>
      {h.recent.length ? (
        <ul className="divide-y divide-border">
          {h.recent.map((r, i) => {
            const m = metaOf(r.game);
            return (
              <li key={i} className="flex items-center gap-3 py-2 text-[13.5px]">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: tint(m.accent), color: m.accent }}>
                  <m.icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{GAME_LABELS[r.game]}</span>
                  <span className="block text-[12px] text-muted-foreground">{formatRelative(r.at)}</span>
                </span>
                <span className="text-right tabular">
                  <span className="block font-semibold">
                    {r.correct}/{r.total}
                  </span>
                  <span className="block text-[12px] text-brand">+{r.xp} XP</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[13.5px] text-muted-foreground">No rounds yet. Start with today’s Daily Challenge or a 60-second Maths Sprint.</p>
      )}
    </section>
  );
}

function Privacy({ hidden }: { hidden: boolean }) {
  const set = useSetHidden();
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-3xl border border-border bg-card px-5 py-4 shadow-soft">
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium">Show me on leaderboards</span>
        <span className="block text-[12.5px] text-muted-foreground">Only your first name and initial are shown. Your teachers can still see your activity.</span>
      </span>
      <Switch checked={!hidden} disabled={set.isPending} onCheckedChange={(on) => set.mutate(!on)} aria-label="Show me on leaderboards" />
    </label>
  );
}

function HubSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 rounded-3xl" />
        <Skeleton className="h-48 rounded-3xl" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-3xl" />
        ))}
      </div>
    </div>
  );
}

/** No connection (and no saved copy): the games that work on the phone alone. */
function OfflineHub({ message }: { message: string }) {
  // The games for the student's class, as last seen on this phone.
  const known = rememberedLevel();
  const mine = known ? gamesFor(known) : null;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-[14px] shadow-soft" role="status">
        <WifiOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>
          {message} These games work offline; your scores are saved on this phone and counted when you’re back online.
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {GAME_META.filter((g) => g.offline && (!mine || mine.includes(g.kind))).map((g) => (
          <GameTile key={g.kind} g={g} />
        ))}
      </div>
    </div>
  );
}
