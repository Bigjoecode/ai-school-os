import { HOUSE_POINT_CATEGORY_LABELS, type HousePeriod } from '@aischool/shared';
import { History, Plus, Star, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ErrorState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDate, formatNumber } from '@/lib/format';
import { useHouseDetail } from './api';
import { HouseCrest, PointsPill, tint } from './ui';

/** One house: its members by class, its points history and its top contributors. */
export function HouseSheet({ id, period, onClose, onAward }: { id: string | null; period: HousePeriod; onClose: () => void; onAward?: (houseId: string) => void }) {
  const q = useHouseDetail(id, { period });
  const d = q.data;
  const [search, setSearch] = useState('');
  const members = useMemo(() => {
    const t = search.trim().toLowerCase();
    const list = (d?.members ?? []).filter((m) => !t || m.name.toLowerCase().includes(t) || m.admissionNumber.toLowerCase().includes(t) || (m.className ?? '').toLowerCase().includes(t));
    const groups = new Map<string, typeof list>();
    for (const m of list) groups.set(m.className ?? 'No class', [...(groups.get(m.className ?? 'No class') ?? []), m]);
    return [...groups.entries()];
  }, [d, search]);

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent aria-describedby={undefined}>
        {q.error && !d ? (
          <>
            <SheetTitle className="sr-only">House</SheetTitle>
            <div className="p-6">
              <ErrorState error={q.error} onRetry={() => void q.refetch()} />
            </div>
          </>
        ) : !d ? (
          <>
            <SheetTitle className="sr-only">Loading house</SheetTitle>
            <div className="space-y-3 p-6">
              <Skeleton className="h-16 w-full" />
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          </>
        ) : (
          <>
            <SheetHeader className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${tint(d.house.colour, 0.22)}, transparent 70%)` }}>
              <div className="flex items-center gap-4">
                <HouseCrest colour={d.house.colour} size="lg" />
                <div className="min-w-0">
                  <SheetTitle className="truncate font-display text-xl font-semibold tracking-tight">{d.house.name}</SheetTitle>
                  <SheetDescription className="mt-0.5 text-[13px] text-muted-foreground">
                    {formatNumber(d.house.members)} members · {d.house.boys} boys, {d.house.girls} girls
                    {d.house.master ? ` · ${d.house.master.name}` : ''}
                  </SheetDescription>
                  {d.house.motto && <p className="mt-0.5 truncate text-[12.5px] italic text-muted-foreground">{d.house.motto}</p>}
                </div>
              </div>
              {onAward && (
                <Button size="sm" className="mt-3 justify-self-start" onClick={() => onAward(d.house.id)}>
                  <Plus /> Award points
                </Button>
              )}
            </SheetHeader>
            <SheetBody>
              <Tabs defaultValue="members">
                <TabsList aria-label="House details">
                  <TabsTrigger value="members">
                    <Users /> Members
                  </TabsTrigger>
                  <TabsTrigger value="history">
                    <History /> Points
                  </TabsTrigger>
                  <TabsTrigger value="stars">
                    <Star /> Top contributors
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="members" className="mt-4 space-y-4">
                  <SearchInput value={search} onChange={setSearch} placeholder="Search members…" />
                  {members.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">{d.members.length ? 'No one matches.' : 'No students in this house yet.'}</p>
                  ) : (
                    members.map(([cls, list]) => (
                      <div key={cls}>
                        <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {cls} <span className="font-normal">({list.length})</span>
                        </p>
                        <ul className="divide-y divide-border rounded-xl border border-border">
                          {list.map((m) => (
                            <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13.5px]">
                              <span className="truncate">{m.name}</span>
                              <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground">
                                {m.admissionNumber} · {m.gender === 'FEMALE' ? 'F' : 'M'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))
                  )}
                </TabsContent>
                <TabsContent value="history" className="mt-4">
                  {d.history.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">No points awarded in this period.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {d.history.map((r) => (
                        <li key={r.id} className="flex items-start gap-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-[13.5px] font-medium">{r.reason}</p>
                            <p className="text-[12px] text-muted-foreground">
                              {HOUSE_POINT_CATEGORY_LABELS[r.category]}
                              {r.student ? ` · ${r.student.name}` : ''} · {formatDate(r.date)}
                              {r.awardedBy ? ` · ${r.awardedBy}` : ''}
                            </p>
                          </div>
                          <PointsPill points={r.points} />
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
                <TabsContent value="stars" className="mt-4">
                  {d.topContributors.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">No points credited to individual members in this period.</p>
                  ) : (
                    <ol className="divide-y divide-border">
                      {d.topContributors.map((c, i) => (
                        <li key={c.student.id} className="flex items-center gap-3 py-2.5">
                          <span className="w-6 text-center font-display text-[13px] font-semibold text-muted-foreground">{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13.5px] font-medium">{c.student.name}</p>
                            <p className="text-[12px] text-muted-foreground">{c.student.className ?? 'No class'}</p>
                          </div>
                          <PointsPill points={c.points} />
                        </li>
                      ))}
                    </ol>
                  )}
                </TabsContent>
              </Tabs>
            </SheetBody>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
