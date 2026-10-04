import { HOUSE_POINT_CATEGORIES, HOUSE_POINT_CATEGORY_LABELS, type HousePeriod, type HouseRow, type HouseStanding } from '@aischool/shared';
import { motion } from 'framer-motion';
import { History, ListOrdered, MonitorPlay, Pencil, Plus, Shuffle, Sparkles, Star, Trash2, Trophy, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { type Column, DataTable, Pagination } from '@/components/ui/data-table';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorMessage } from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AllocatePanel } from './allocate-panel';
import { useDeleteHouse, useDeletePoints, useHouses, useHouseSettings, usePointsLog, useSaveHouse, useStandings } from './api';
import { AwardDialog } from './award-dialog';
import { DisplayMode } from './display-mode';
import { HouseDialog } from './house-dialog';
import { HouseSheet } from './house-sheet';
import { HouseBadge, HouseCrest, inkOn, ordinal, PeriodPicker, PointsPill, SectionTitle, tint } from './ui';

type Tab = 'leaderboard' | 'log' | 'houses' | 'allocate';
const TABS: Tab[] = ['leaderboard', 'log', 'houses', 'allocate'];

/** Four houses in the colours and names many Nigerian schools use. */
const STARTER = [
  { name: 'Aggrey House', colour: '#dc2626', motto: 'Strength and honour' },
  { name: 'Azikiwe House', colour: '#2563eb', motto: 'Unity and progress' },
  { name: 'Awolowo House', colour: '#16a34a', motto: 'Service before self' },
  { name: 'Bello House', colour: '#eab308', motto: 'Faith and diligence' },
];

export default function HousesPage() {
  const list = useHouses();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'leaderboard';
  const [period, setPeriod] = useState<HousePeriod>('TERM');
  const [award, setAward] = useState<{ houseId: string | null } | null>(null);
  const [display, setDisplay] = useState(false);
  const [editing, setEditing] = useState<HouseRow | 'new' | null>(null);
  const openHouse = params.get('house');
  const setParam = (k: string, v: string | undefined) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (v) p.set(k, v);
        else p.delete(k);
        return p;
      },
      { replace: true },
    );

  const d = list.data;
  const houses = d?.houses ?? [];
  const refs = houses.map((h) => ({ id: h.id, name: h.name, colour: h.colour }));

  return (
    <Page>
      <PageHeader
        title="Houses"
        description="The house leaderboard, points for sport, academics and conduct, and who is in which house."
        actions={
          houses.length > 0 && (
            <>
              <Button variant="outline" onClick={() => setDisplay(true)}>
                <MonitorPlay /> Display mode
              </Button>
              {d?.canAward && (
                <Button onClick={() => setAward({ houseId: null })}>
                  <Sparkles /> Award points
                </Button>
              )}
            </>
          )
        }
      />
      {list.error && !d ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !d ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : houses.length === 0 ? (
        <NoHouses canManage={d.canManage} onNew={() => setEditing('new')} />
      ) : (
        <Tabs value={tab} onValueChange={(t) => setParam('tab', t === 'leaderboard' ? undefined : t)}>
          <TabsList aria-label="Houses sections">
            <TabsTrigger value="leaderboard">
              <Trophy /> Leaderboard
            </TabsTrigger>
            <TabsTrigger value="log">
              <History /> Points log
            </TabsTrigger>
            <TabsTrigger value="houses">
              <Users /> Houses &amp; members
            </TabsTrigger>
            {d.canManage && (
              <TabsTrigger value="allocate">
                <Shuffle /> Allocate students
              </TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="leaderboard">
            <Leaderboard period={period} onPeriod={setPeriod} onHouse={(id) => setParam('house', id)} onAward={d.canAward ? (id) => setAward({ houseId: id }) : undefined} canManage={d.canManage} countBehaviour={d.settings.countBehaviour} />
          </TabsContent>
          <TabsContent value="log">
            <PointsLog houses={refs} />
          </TabsContent>
          <TabsContent value="houses">
            <HousesGrid houses={houses} unassigned={d.unassigned} canManage={d.canManage} onEdit={setEditing} onOpen={(id) => setParam('house', id)} onAllocate={() => setParam('tab', 'allocate')} />
          </TabsContent>
          {d.canManage && (
            <TabsContent value="allocate">
              <AllocatePanel houses={houses} unassigned={d.unassigned} />
            </TabsContent>
          )}
        </Tabs>
      )}
      <AwardDialog open={!!award} onOpenChange={(o) => !o && setAward(null)} houses={refs} presetHouseId={award?.houseId} />
      <HouseDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} house={editing === 'new' ? null : editing} staff={d?.staff ?? []} />
      <HouseSheet id={openHouse} period={period} onClose={() => setParam('house', undefined)} onAward={d?.canAward ? (id) => setAward({ houseId: id }) : undefined} />
      <DisplayMode open={display} onClose={() => setDisplay(false)} period={period} />
    </Page>
  );
}

// ------------------------------------------------------------------ empty

function NoHouses({ canManage, onNew }: { canManage: boolean; onNew: () => void }) {
  const save = useSaveHouse();
  const [busy, setBusy] = useState(false);
  const starter = async () => {
    setBusy(true);
    try {
      for (const h of STARTER) await save.mutateAsync(h);
      toast.success('Four houses created', { description: 'Rename them or change their colours any time. Next, share your students between them.' });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <EmptyState
        icon={Trophy}
        title="No houses yet"
        description={canManage ? 'Create your school’s houses, share the students between them, then award points for sports, academics and conduct.' : 'Your school hasn’t set up its houses yet. Ask the principal or vice principal.'}
        action={
          canManage && (
            <>
              <Button onClick={starter} loading={busy}>
                <Sparkles /> Start with four houses
              </Button>
              <Button variant="outline" onClick={onNew}>
                <Plus /> Add a house
              </Button>
            </>
          )
        }
      />
      {canManage && (
        <div className="flex flex-wrap justify-center gap-2 border-t border-border px-4 py-4">
          {STARTER.map((h) => (
            <HouseBadge key={h.name} house={{ id: h.name, name: h.name, colour: h.colour }} size="md" />
          ))}
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ leaderboard

function Leaderboard({
  period,
  onPeriod,
  onHouse,
  onAward,
  canManage,
  countBehaviour,
}: {
  period: HousePeriod;
  onPeriod: (p: HousePeriod) => void;
  onHouse: (id: string) => void;
  onAward?: (houseId: string) => void;
  canManage: boolean;
  countBehaviour: boolean;
}) {
  const q = useStandings({ period });
  const settings = useHouseSettings();
  const d = q.data;
  const max = Math.max(1, ...(d?.standings.map((s) => Math.abs(s.total)) ?? [1]));
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <PeriodPicker value={period} onChange={onPeriod} />
          {d && <p className="mt-1.5 text-[12.5px] text-muted-foreground">{d.period.label}</p>}
        </div>
        {canManage && (
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-[13px]">
            <Switch checked={countBehaviour} disabled={settings.isPending} onCheckedChange={(v) => settings.mutate({ countBehaviour: v }, { onSuccess: () => toast.success(v ? 'Behaviour points now count towards houses' : 'Behaviour points no longer count towards houses') })} />
            <span>
              <span className="block font-medium">Count behaviour points towards houses</span>
              <span className="block text-[12px] text-muted-foreground">Members’ merits add, demerits take away</span>
            </span>
          </label>
        )}
      </div>

      {q.error && !d ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-60 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className={cn('grid gap-4 sm:grid-cols-2', d.standings.length >= 4 ? 'xl:grid-cols-4' : d.standings.length === 3 ? 'xl:grid-cols-3' : '')}>
            {d.standings.map((s, i) => (
              <StandingCard key={s.house.id} s={s} index={i} max={max} countBehaviour={d.countBehaviour} onOpen={() => onHouse(s.house.id)} onAward={onAward ? () => onAward(s.house.id) : undefined} />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <Card className="p-4 sm:p-5">
              <SectionTitle icon={<Star />}>Top contributors</SectionTitle>
              {d.topContributors.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">No points credited to individual students in this period yet.</p>
              ) : (
                <ol className="divide-y divide-border">
                  {d.topContributors.map((c, i) => (
                    <li key={c.student.id} className="flex items-center gap-3 py-2.5">
                      <span className="w-6 text-center font-display text-[13px] font-semibold text-muted-foreground tabular">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium">{c.student.name}</p>
                        <p className="truncate text-[12px] text-muted-foreground">{c.student.className ?? 'No class'}</p>
                      </div>
                      <HouseBadge house={c.house} className="hidden sm:inline-flex" />
                      <PointsPill points={c.points} />
                    </li>
                  ))}
                </ol>
              )}
            </Card>
            <Card className="p-4 sm:p-5">
              <SectionTitle icon={<History />}>Latest points</SectionTitle>
              {d.recent.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">No points have been awarded in this period yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {d.recent.map((r) => (
                    <li key={r.id} className="flex items-start gap-3 py-2.5">
                      <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.house.colour }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-medium leading-snug">{r.reason}</p>
                        <p className="truncate text-[12px] text-muted-foreground">
                          {r.house.name}
                          {r.student ? ` · ${r.student.name}` : ''} · {HOUSE_POINT_CATEGORY_LABELS[r.category]} · {formatDate(r.date)}
                        </p>
                      </div>
                      <PointsPill points={r.points} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function StandingCard({ s, index, max, countBehaviour, onOpen, onAward }: { s: HouseStanding; index: number; max: number; countBehaviour: boolean; onOpen: () => void; onAward?: () => void }) {
  const c = s.house.colour;
  const lead = s.rank === 1 && s.total > 0;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}>
      <Card className={cn('relative h-full overflow-hidden p-0', lead && 'ring-2 ring-amber-400/70')}>
        <div aria-hidden className="absolute inset-x-0 top-0 h-28" style={{ background: `linear-gradient(160deg, ${tint(c, 0.32)}, ${tint(c, 0.04)} 75%)` }} />
        <button type="button" onClick={onOpen} className="relative block w-full p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-label={`${s.house.name}: ${ordinal(s.rank)}, ${s.total} points`}>
          <div className="flex items-start justify-between gap-3">
            <HouseCrest colour={c} size="lg" crowned={lead} />
            <span className="rounded-full px-2.5 py-1 font-display text-[13px] font-bold" style={{ backgroundColor: c, color: inkOn(c) }}>
              {ordinal(s.rank)}
            </span>
          </div>
          <p className="mt-3 truncate font-display text-[18px] font-semibold tracking-tight">{s.house.name}</p>
          <p className="truncate text-[12.5px] italic text-muted-foreground">{s.house.motto || ' '}</p>
          <p className="mt-3 font-display text-[44px] font-bold leading-none tracking-[-0.03em] tabular">
            <AnimatedNumber value={s.total} />
            <span className="ml-1.5 text-[14px] font-medium tracking-normal text-muted-foreground">pts</span>
          </p>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
            <motion.div className="h-full rounded-full" style={{ backgroundColor: c }} initial={{ width: 0 }} animate={{ width: `${Math.max(2, (Math.max(0, s.total) / max) * 100)}%` }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} />
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
            <div>
              <dt className="text-muted-foreground">Awarded</dt>
              <dd className="font-semibold tabular">{formatNumber(s.awarded)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Behaviour</dt>
              <dd className="font-semibold tabular">{countBehaviour ? formatNumber(s.behaviour) : '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Members</dt>
              <dd className="font-semibold tabular">{formatNumber(s.members)}</dd>
            </div>
          </dl>
        </button>
        {onAward && (
          <div className="relative border-t border-border px-5 py-2.5">
            <Button variant="ghost" size="sm" className="-ml-2" onClick={onAward}>
              <Plus /> Points for {s.house.name.replace(/\s+House$/i, '')}
            </Button>
          </div>
        )}
      </Card>
    </motion.div>
  );
}

// ------------------------------------------------------------------ log

function PointsLog({ houses }: { houses: { id: string; name: string; colour: string }[] }) {
  const [houseId, setHouseId] = useState<string | undefined>();
  const [category, setCategory] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const q = usePointsLog({ page, pageSize: 25, houseId, category });
  const del = useDeletePoints();
  const [confirm, setConfirm] = useState<string | null>(null);
  const columns: Column<NonNullable<typeof q.data>['items'][number]>[] = useMemo(
    () => [
      { key: 'date', header: 'Date', cell: (r) => <span className="whitespace-nowrap text-[13px]">{formatDate(r.date)}</span> },
      { key: 'house', header: 'House', cell: (r) => <HouseBadge house={r.house} /> },
      {
        key: 'reason',
        header: 'Reason',
        cell: (r) => (
          <div className="min-w-0">
            <p className="text-[13.5px] font-medium">{r.reason}</p>
            <p className="text-[12px] text-muted-foreground">
              {HOUSE_POINT_CATEGORY_LABELS[r.category]}
              {r.student ? ` · ${r.student.name}${r.student.className ? ` (${r.student.className})` : ''}` : ''}
            </p>
          </div>
        ),
      },
      { key: 'by', header: 'By', cell: (r) => <span className="text-[12.5px] text-muted-foreground">{r.awardedBy ?? '—'}</span> },
      { key: 'pts', header: 'Points', headClassName: 'text-right', className: 'text-right', cell: (r) => <PointsPill points={r.points} /> },
      {
        key: 'x',
        header: <span className="sr-only">Actions</span>,
        className: 'w-10',
        cell: (r) =>
          r.canDelete && (
            <Button variant="ghost" size="icon-sm" aria-label="Remove these points" onClick={(e) => (e.stopPropagation(), setConfirm(r.id))}>
              <Trash2 />
            </Button>
          ),
      },
    ],
    [],
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Select value={houseId ?? NONE} onValueChange={(v) => (setHouseId(v === NONE ? undefined : v), setPage(1))}>
          <SelectTrigger aria-label="House" className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All houses</SelectItem>
            {houses.map((h) => (
              <SelectItem key={h.id} value={h.id}>
                {h.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={category ?? NONE} onValueChange={(v) => (setCategory(v === NONE ? undefined : v), setPage(1))}>
          <SelectTrigger aria-label="Category" className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All categories</SelectItem>
            {HOUSE_POINT_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {HOUSE_POINT_CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={q.data?.items}
          rowKey={(r) => r.id}
          loading={q.isFetching}
          error={q.error}
          onRetry={() => void q.refetch()}
          renderMobile={(r) => (
            <div className="flex items-start gap-3">
              <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.house.colour }} />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium">{r.reason}</p>
                <p className="text-[12px] text-muted-foreground">
                  {r.house.name}
                  {r.student ? ` · ${r.student.name}` : ''} · {formatDate(r.date)}
                </p>
              </div>
              <PointsPill points={r.points} />
            </div>
          )}
          mobileActions={(r) =>
            r.canDelete && (
              <Button variant="ghost" size="icon-sm" aria-label="Remove these points" onClick={() => setConfirm(r.id)}>
                <Trash2 />
              </Button>
            )
          }
          empty={{ icon: ListOrdered, title: 'No points yet', description: 'Awards and deductions appear here.' }}
        />
        {q.data && q.data.total > 25 && <Pagination page={page} pageSize={25} total={q.data.total} onPageChange={setPage} noun="entries" />}
      </Card>
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Remove these points?"
        description="The house total goes back down (or up, for a deduction)."
        confirmLabel="Remove"
        loading={del.isPending}
        onConfirm={() => confirm && del.mutate(confirm, { onSuccess: () => (setConfirm(null), toast.success('Points removed')) })}
      />
    </div>
  );
}

// ------------------------------------------------------------------ houses

function HousesGrid({
  houses,
  unassigned,
  canManage,
  onEdit,
  onOpen,
  onAllocate,
}: {
  houses: HouseRow[];
  unassigned: number;
  canManage: boolean;
  onEdit: (h: HouseRow | 'new') => void;
  onOpen: (id: string) => void;
  onAllocate: () => void;
}) {
  const del = useDeleteHouse();
  const [confirm, setConfirm] = useState<HouseRow | null>(null);
  return (
    <div className="space-y-4">
      {(unassigned > 0 || canManage) && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13.5px]">
            {unassigned > 0 ? (
              <>
                <span className="font-semibold">{formatNumber(unassigned)}</span> active student{unassigned === 1 ? ' is' : 's are'} not in a house yet.
              </>
            ) : (
              'Every active student is in a house.'
            )}
          </p>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              {unassigned > 0 && (
                <Button variant="outline" size="sm" onClick={onAllocate}>
                  <Shuffle /> Allocate students
                </Button>
              )}
              <Button size="sm" onClick={() => onEdit('new')}>
                <Plus /> Add a house
              </Button>
            </div>
          )}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {houses.map((h) => (
          <Card key={h.id} className="overflow-hidden">
            <div className="h-2" style={{ backgroundColor: h.colour }} />
            <div className="p-5">
              <div className="flex items-start gap-3">
                <HouseCrest colour={h.colour} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-[16px] font-semibold">{h.name}</p>
                  <p className="truncate text-[12.5px] italic text-muted-foreground">{h.motto || 'No motto yet'}</p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[
                  ['Members', h.members],
                  ['Boys', h.boys],
                  ['Girls', h.girls],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-xl bg-muted/50 py-2">
                    <dt className="text-[11.5px] text-muted-foreground">{l}</dt>
                    <dd className="font-display text-[18px] font-semibold tabular">{formatNumber(v as number)}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 truncate text-[12.5px] text-muted-foreground">
                House {h.master ? 'master/mistress' : 'master'}: <span className="text-foreground">{h.master?.name ?? 'not set'}</span>
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => onOpen(h.id)}>
                  <Users /> Members
                </Button>
                {canManage && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => onEdit(h)}>
                      <Pencil /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setConfirm(h)}>
                      <Trash2 /> Delete
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Delete ${confirm?.name}?`}
        description={`Its ${confirm?.members ?? 0} member(s) will have no house, and all of its points are removed. This cannot be undone.`}
        confirmLabel="Delete house"
        loading={del.isPending}
        onConfirm={() => confirm && del.mutate(confirm.id, { onSuccess: () => (toast.success(`${confirm.name} deleted`), setConfirm(null)) })}
      />
    </div>
  );
}
