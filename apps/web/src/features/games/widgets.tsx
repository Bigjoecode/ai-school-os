import { DEFAULT_GAMES_SETTINGS, GAME_LABELS, type GamesSettings } from '@aischool/shared';
import { ArrowRight, CalendarCheck2, ChevronDown, Flame, Gamepad2, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useChildGames, useClassGames, useGamesHub, useGamesSettings, useSaveGamesSettings } from './api';

/** Student overview: today's Daily Challenge and the streak, one tap from playing. */
export function DailyChallengeCard() {
  const q = useGamesHub();
  const h = q.data;
  if (q.error || (!h && !q.isPending)) return null;
  if (!h) return <Skeleton className="h-28 rounded-2xl" />;
  // The school turned games off: nothing to show.
  if (h.access.reason === 'OFF') return null;
  const d = h.daily;
  return (
    <div className="relative overflow-hidden rounded-2xl p-4 text-white shadow-soft sm:p-5" style={{ background: 'linear-gradient(125deg, #3730a3, #5b21b6 55%, #7e22ce)' }}>
      <div aria-hidden className="absolute -right-8 -top-8 size-32 rounded-full bg-white/10" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/15">
          <CalendarCheck2 className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium text-white/85">Daily Challenge</p>
          <p className="font-display text-[17px] font-semibold leading-snug">
            {!h.access.open ? h.access.message : d.done ? `Done: ${d.result?.correct}/${d.result?.total} today (+${d.result?.xp} XP)` : `${d.questions} quick questions for your class`}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[12.5px] text-white/85">
            <Flame className="size-3.5" aria-hidden /> {h.profile.streak}-day streak · Level {h.profile.level}
          </p>
        </div>
        <Button asChild size="lg" className="h-11 bg-white text-[#1b1d45] hover:bg-white/90">
          <Link to={d.done || !h.access.open || !d.available ? '/games' : '/games/play/daily'}>
            {d.done || !d.available ? 'Games' : d.inProgress ? 'Carry on' : 'Play'} <ArrowRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}

/** Parent's child page: one line on games this week. */
export function ChildGamesLine({ childId, first }: { childId: string; first: string }) {
  const q = useChildGames(childId);
  const g = q.data;
  if (!g) return null;
  return (
    <p className="flex items-start gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-[13.5px] shadow-soft">
      <Gamepad2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span>
        <span className="font-medium">Learning games: </span>
        {g.rounds
          ? `${first} played on ${g.daysThisWeek} day${g.daysThisWeek === 1 ? '' : 's'} this week, ${g.questionsThisWeek} question${g.questionsThisWeek === 1 ? '' : 's'} (${g.questionsThisWeek ? Math.round((100 * g.correctThisWeek) / g.questionsThisWeek) : 0}% right), about ${Math.max(1, g.minutes)} minute${g.minutes === 1 ? '' : 's'}${g.topGame ? `, mostly ${GAME_LABELS[g.topGame]}` : ''}.${g.streak > 1 ? ` ${g.streak}-day streak.` : ''}`
          : `${first} hasn’t played the learning games this week.`}
      </span>
    </p>
  );
}

/** Class insights: what the class practised in games this week. */
export function ClassGamesCard({ classArmId }: { classArmId: string }) {
  const q = useClassGames(classArmId);
  const [open, setOpen] = useState(false);
  const d = q.data;
  if (!d || !d.rounds) return null;
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <Gamepad2 className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="font-display text-[15px] font-semibold tracking-tight">Learning games this week</h2>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ['Played', `${d.players} of ${d.students}`],
          ['Rounds', d.rounds],
          ['Minutes', d.minutes],
          ['Right', d.percentCorrect === null ? '–' : `${d.percentCorrect}%`],
          ['Daily today', `${d.dailyToday}`],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-xl bg-muted/60 px-3 py-2">
            <dt className="text-[11.5px] text-muted-foreground">{k}</dt>
            <dd className="font-display text-lg font-semibold tabular">{v}</dd>
          </div>
        ))}
      </dl>
      {d.topics.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[12.5px] font-medium">Topics practised most</p>
          <ul className="space-y-1">
            {d.topics.map((t) => (
              <li key={`${t.subject}-${t.topic}`} className="flex items-center gap-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate">
                  {t.topic} <span className="text-muted-foreground">· {t.subject}</span>
                </span>
                <span className="shrink-0 tabular text-muted-foreground">
                  {t.answered} answer{t.answered === 1 ? '' : 's'} · <span className={cn(t.percentCorrect >= 70 ? 'text-success' : t.percentCorrect < 50 ? 'text-danger' : 'text-warning')}>{t.percentCorrect}%</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-[12px] text-muted-foreground">{d.byGame.map((g) => `${GAME_LABELS[g.game]} ${g.rounds}`).join(' · ')}</p>
      <button type="button" className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Each student <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <ul className="mt-2 max-h-72 divide-y divide-border overflow-y-auto text-[13px]">
          {d.rows.map((r) => (
            <li key={r.studentId} className="flex items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className="shrink-0 tabular text-muted-foreground">{r.rounds ? `${r.rounds} round${r.rounds === 1 ? '' : 's'} · ${r.days} day${r.days === 1 ? '' : 's'} · ${formatRelative(r.lastPlayed)}` : 'not played'}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Settings → Parent & student portal: games on or off, closed during lessons, leaderboards, house points. */
export function GamesSettingsCard() {
  const canManage = useCan('school.manage');
  const q = useGamesSettings();
  const save = useSaveGamesSettings();
  const [v, setV] = useState<GamesSettings>(DEFAULT_GAMES_SETTINGS);
  useEffect(() => {
    if (q.data) setV(q.data.settings);
  }, [q.data]);
  if (q.error && !q.data) return null;
  if (!q.data) return <Skeleton className="h-80 rounded-2xl" />;
  const dirty = JSON.stringify(v) !== JSON.stringify(q.data.settings);
  const row = cn('flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3', canManage && 'cursor-pointer');
  const w = q.data.week;
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(v, { onSuccess: () => toast.success('Games settings saved'), onError: (err) => toast.error(errorMessage(err)) });
      }}
    >
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Gamepad2 className="size-4 text-brand" aria-hidden /> Learning games
            </CardTitle>
            <CardDescription>
              Free, short games for students that practise their subjects: Quiz Rush, Maths Sprint, spelling, Match Up, True or False, Word Search, Crosswords and a Daily Challenge for each class, plus picture games (counting, shapes, letter sounds, telling the time, the Naira Shop) for nursery and lower primary, who play in a simpler young mode with read-aloud and no clock. This week: {w.players} of {w.students} students played, {w.rounds} rounds, about {w.minutes} minutes.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <fieldset disabled={!canManage || save.isPending} className="space-y-2.5">
            <label className={row}>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium">Students can play games</span>
                <span className="block text-[12px] text-muted-foreground">Turn off to hide Games from every student.</span>
              </span>
              <Switch checked={v.enabled} onCheckedChange={(enabled) => setV((x) => ({ ...x, enabled }))} aria-label="Students can play games" />
            </label>

            <div className={cn('rounded-xl border border-border px-4 py-3', !v.enabled && 'opacity-60')}>
              <label className={cn('flex items-center gap-3', canManage && 'cursor-pointer')}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium">Closed during lessons</span>
                  <span className="block text-[12px] text-muted-foreground">Games close at these times (school time). Students see when they open again.</span>
                </span>
                <Switch checked={v.quietHours.enabled} onCheckedChange={(on) => setV((x) => ({ ...x, quietHours: { ...x.quietHours, enabled: on } }))} aria-label="Close games during lessons" />
              </label>
              {v.quietHours.enabled && (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days">
                    {DAYS.map((d, i) => {
                      const on = v.quietHours.days.includes(i + 1);
                      return (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setV((x) => ({ ...x, quietHours: { ...x.quietHours, days: on ? x.quietHours.days.filter((n) => n !== i + 1) : [...x.quietHours.days, i + 1].sort() } }))}
                          className={cn('min-h-9 rounded-lg border px-3 text-[12.5px] font-medium', on ? 'border-brand bg-brand-soft text-brand' : 'border-border bg-card text-muted-foreground')}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="From" htmlFor="gq-start">
                      <Input id="gq-start" type="time" value={v.quietHours.start} onChange={(e) => setV((x) => ({ ...x, quietHours: { ...x.quietHours, start: e.target.value } }))} />
                    </Field>
                    <Field label="Until" htmlFor="gq-end">
                      <Input id="gq-end" type="time" value={v.quietHours.end} onChange={(e) => setV((x) => ({ ...x, quietHours: { ...x.quietHours, end: e.target.value } }))} />
                    </Field>
                  </div>
                </div>
              )}
            </div>

            <label className={row}>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium">Weekly leaderboards</span>
                <span className="block text-[12px] text-muted-foreground">Class and house boards with first name and initial only. Students can hide themselves.</span>
              </span>
              <Switch checked={v.leaderboards} onCheckedChange={(leaderboards) => setV((x) => ({ ...x, leaderboards }))} aria-label="Weekly leaderboards" />
            </label>

            <div className="rounded-xl border border-border px-4 py-3">
              <label className={cn('flex items-center gap-3', canManage && 'cursor-pointer')}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium">House points for top players</span>
                  <span className="block text-[12px] text-muted-foreground">Each Monday, last week’s top players earn points for their house (added to Houses as “Academic”).</span>
                </span>
                <Switch checked={v.housePoints.enabled} onCheckedChange={(on) => setV((x) => ({ ...x, housePoints: { ...x.housePoints, enabled: on } }))} aria-label="House points for top players" />
              </label>
              {v.housePoints.enabled && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field label="Top players" htmlFor="gh-top">
                    <Input id="gh-top" type="number" min={1} max={10} value={v.housePoints.topPlayers} onChange={(e) => setV((x) => ({ ...x, housePoints: { ...x.housePoints, topPlayers: Math.max(1, Math.min(10, Number(e.target.value) || 1)) } }))} />
                  </Field>
                  <Field label="Points each" htmlFor="gh-points">
                    <Input id="gh-points" type="number" min={1} max={20} value={v.housePoints.points} onChange={(e) => setV((x) => ({ ...x, housePoints: { ...x.housePoints, points: Math.max(1, Math.min(20, Number(e.target.value) || 1)) } }))} />
                  </Field>
                </div>
              )}
            </div>
          </fieldset>
        </CardContent>
        {canManage && (
          <CardFooter className="justify-end">
            <Button type="button" variant="ghost" disabled={!dirty || save.isPending} onClick={() => setV(q.data.settings)}>
              Discard
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!dirty}>
              <Save /> Save changes
            </Button>
          </CardFooter>
        )}
      </Card>
    </form>
  );
}
