import { ArrowLeft, Crown, EyeOff, Medal, Shield, Trophy } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { useLeaderboard } from './api';

const MEDAL = ['text-[#d4a106]', 'text-[#8a94a6]', 'text-[#b4693a]'];

/** Weekly leaderboards: the class and the student's house, plus the house table. First name and initial only. */
export default function LeaderboardPage() {
  useDocumentTitle('Games leaderboard');
  const [scope, setScope] = useState<'class' | 'house'>('class');
  const q = useLeaderboard(scope);
  const b = q.data;
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 lg:py-8">
      <div className="mb-5 flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back to games">
          <Link to="/games">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[24px] font-semibold leading-tight tracking-tight">Leaderboard</h1>
          <p className="text-[13px] text-muted-foreground">This week’s XP{b ? `, since Monday ${new Date(`${b.weekStart}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}` : ''}. Resets every Monday.</p>
        </div>
      </div>

      <div className="mb-4 inline-flex rounded-xl bg-muted p-1" role="tablist" aria-label="Leaderboard">
        {(['class', 'house'] as const).map((s) => (
          <button
            key={s}
            role="tab"
            type="button"
            aria-selected={scope === s}
            onClick={() => setScope(s)}
            className={cn('min-h-10 rounded-lg px-4 text-[13.5px] font-medium transition-colors', scope === s ? 'bg-card shadow-xs' : 'text-muted-foreground hover:text-foreground')}
          >
            {s === 'class' ? 'My class' : 'My house'}
          </button>
        ))}
      </div>

      {q.error && !b && <p className="rounded-2xl border border-border bg-card p-5 text-[14px] shadow-soft">{errorMessage(q.error)}</p>}
      {!b && q.isPending && <Skeleton className="h-96 rounded-3xl" />}
      {b && (
        <div className={cn('space-y-5 transition-opacity', q.isPlaceholderData && 'opacity-60')}>
          <section className="rounded-3xl border border-border bg-card shadow-soft" aria-labelledby="board-title">
            <div className="flex items-center gap-2 border-b border-border px-5 py-3">
              <Trophy className="size-4 text-warning" aria-hidden />
              <h2 id="board-title" className="font-display text-[16px] font-semibold tracking-tight">
                {b.title}
              </h2>
              <span className="ml-auto text-[12.5px] text-muted-foreground tabular">
                {b.me.hidden ? 'You’re hidden' : b.me.rank ? `You: #${b.me.rank} · ${b.me.xp} XP` : `You: ${b.me.xp} XP`}
              </span>
            </div>
            {b.rows.length ? (
              <ol>
                {b.rows.map((r) => (
                  <li key={`${r.rank}-${r.name}`} className={cn('flex items-center gap-3 border-b border-border px-5 py-2.5 last:border-0', r.me && 'bg-brand-soft')}>
                    <span className="grid w-7 shrink-0 place-items-center text-[13px] font-semibold tabular">
                      {r.rank <= 3 ? (
                        <span className="flex flex-col items-center">
                          <Medal className={cn('size-5', MEDAL[r.rank - 1])} aria-hidden />
                          <span className="sr-only">{r.rank}</span>
                        </span>
                      ) : (
                        r.rank
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">
                        {r.name}
                        {r.me && <span className="ml-1.5 text-[12px] text-brand">(you)</span>}
                      </span>
                      {r.house && (
                        <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                          <span className="size-2 rounded-full" style={{ background: r.house.colour }} aria-hidden /> {r.house.name}
                        </span>
                      )}
                    </span>
                    <span className="text-[14px] font-semibold tabular">{r.xp.toLocaleString('en-GB')} XP</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="px-5 py-6 text-[14px] text-muted-foreground">No one has played yet this week. Be the first!</p>
            )}
          </section>

          {b.houses.length > 0 && (
            <section className="rounded-3xl border border-border bg-card p-5 shadow-soft" aria-labelledby="houses-title">
              <h2 id="houses-title" className="mb-1 flex items-center gap-2 font-display text-[16px] font-semibold tracking-tight">
                <Shield className="size-4 text-muted-foreground" aria-hidden /> Houses this week
              </h2>
              <p className="mb-3 text-[12.5px] text-muted-foreground">
                Everyone’s XP counts for their house.
                {b.housePoints.enabled && ` Each week the school’s top ${b.housePoints.topPlayers} players earn ${b.housePoints.points} house points for their house.`}
              </p>
              <ol className="space-y-3">
                {b.houses.map((h, i) => {
                  const max = Math.max(1, ...b.houses.map((x) => x.xp));
                  return (
                    <li key={h.id}>
                      <div className="mb-1 flex items-center gap-2 text-[13.5px]">
                        <span className="w-5 font-semibold tabular">{i + 1}</span>
                        {i === 0 && h.xp > 0 && <Crown className="size-4 text-warning" aria-label="Leading" />}
                        <span className={cn('font-medium', h.mine && 'text-brand')}>
                          {h.name}
                          {h.mine && ' (yours)'}
                        </span>
                        <span className="ml-auto tabular text-muted-foreground">
                          {h.xp.toLocaleString('en-GB')} XP · {h.players} player{h.players === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${(100 * h.xp) / max}%`, background: h.colour }} />
                      </div>
                      {h.top.length > 0 && <p className="mt-1 text-[12px] text-muted-foreground">Top: {h.top.join(', ')}</p>}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          <p className="flex items-start gap-2 text-[12.5px] text-muted-foreground">
            <EyeOff className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Leaderboards show first names and initials only. Anyone can hide from them on the Games page.
          </p>
        </div>
      )}
    </div>
  );
}
