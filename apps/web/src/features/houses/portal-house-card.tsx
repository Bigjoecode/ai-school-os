import { Crown, Trophy } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { usePortalHouse } from './api';
import { HouseCrest, ordinal, tint } from './ui';

/** The family portal: the child's house and how the houses stand this term. */
export function PortalHouseCard({ childId, firstName, isParent }: { childId: string; firstName: string; isParent: boolean }) {
  const q = usePortalHouse(childId);
  const d = q.data;
  if (!d || (!d.house && !d.standings.length)) return null;
  const mine = d.house ? d.standings.find((s) => s.house.id === d.house!.id) : null;
  const max = Math.max(1, ...d.standings.map((s) => s.total));
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center gap-4 p-4 sm:p-5" style={d.house ? { background: `linear-gradient(135deg, ${tint(d.house.colour, 0.22)}, transparent 75%)` } : undefined}>
        {d.house ? <HouseCrest colour={d.house.colour} size="lg" crowned={mine?.rank === 1 && mine.total > 0} /> : <Trophy className="size-8 text-muted-foreground" aria-hidden />}
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">{isParent ? `${firstName}’s house` : 'My house'}</p>
          <p className="truncate font-display text-[18px] font-semibold">{d.house?.name ?? 'Not in a house yet'}</p>
          {d.house?.motto && <p className="truncate text-[12.5px] italic text-muted-foreground">{d.house.motto}</p>}
        </div>
        {mine && (
          <div className="text-right">
            <p className="font-display text-[26px] font-bold leading-none">{ordinal(mine.rank)}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">{mine.total} pts</p>
          </div>
        )}
      </div>
      {d.standings.length > 0 && (
        <div className="border-t border-border p-4 sm:p-5">
          <p className="mb-2.5 text-[12.5px] text-muted-foreground">
            House standings · {d.periodLabel}
            {d.myPoints > 0 && <> · {isParent ? firstName : 'You'} earned <span className="font-semibold text-foreground">{d.myPoints}</span> for the house</>}
          </p>
          <ul className="space-y-2">
            {d.standings.map((s) => (
              <li key={s.house.id} className="flex items-center gap-3 text-[13px]">
                <span className="w-7 shrink-0 font-display font-semibold tabular text-muted-foreground">{ordinal(s.rank)}</span>
                <span className={cn('w-28 shrink-0 truncate sm:w-36', s.house.id === d.house?.id && 'font-semibold')}>{s.house.name}</span>
                <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full" style={{ width: `${Math.max(3, (Math.max(0, s.total) / max) * 100)}%`, backgroundColor: s.house.colour }} />
                </span>
                <span className="w-12 shrink-0 text-right font-semibold tabular">{s.total}</span>
                {s.rank === 1 && s.total > 0 ? <Crown className="size-4 shrink-0 text-amber-500" aria-label="Leading" /> : <span className="size-4 shrink-0" />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
