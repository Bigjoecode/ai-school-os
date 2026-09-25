import { ROOM_KIND_LABELS, ROOM_KINDS, type SubjectLoadInput, type TimetableSetup } from '@aischool/shared';
import { AlertTriangle, BookPlus, Copy, Layers2, MoreHorizontal, RotateCcw, Save, Table2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useBlocker } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Stepper, useStoredState } from '../../assessment/ui';
import { useSaveLoads } from '../api';
import { SubjectDot } from '../ui';

type Load = SubjectLoadInput;
type RoomKind = (typeof ROOM_KINDS)[number];

const key = (armId: string, subjectId: string) => `${armId}:${subjectId}`;
const blank = (classArmId: string, subjectId: string): Load => ({ classArmId, subjectId, teacherId: null, periodsPerWeek: 0, roomKind: null, doublePeriod: false });
const same = (a: Load, b: Load) =>
  a.teacherId === b.teacherId && a.periodsPerWeek === b.periodsPerWeek && a.roomKind === b.roomKind && a.doublePeriod === b.doublePeriod;

export function LoadsMatrix({ setup, canManage }: { setup: TimetableSetup; canManage: boolean }) {
  const [pick, setPick] = useStoredState<{ levelId?: string }>('aischool.timetable.loads', {});
  const level = setup.levels.find((l) => l.id === pick.levelId) ?? setup.levels[0];
  const [edits, setEdits] = useState<Record<string, Load>>({});
  const [added, setAdded] = useState<Record<string, string[]>>({});
  const save = useSaveLoads();

  const original = useMemo(() => new Map(setup.loads.map((l) => [key(l.classArmId, l.subjectId), l])), [setup.loads]);
  const get = (armId: string, subjectId: string): Load => edits[key(armId, subjectId)] ?? original.get(key(armId, subjectId)) ?? blank(armId, subjectId);

  const dirtyRows = useMemo(
    () =>
      Object.entries(edits)
        .filter(([k, v]) => {
          const o = original.get(k);
          return o ? !same(o, v) : true;
        })
        .map(([, v]) => v),
    [edits, original],
  );
  const dirty = dirtyRows.length > 0;

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);

  const set = (armId: string, subjectId: string, patch: Partial<Load>) =>
    setEdits((prev) => ({ ...prev, [key(armId, subjectId)]: { ...get(armId, subjectId), ...patch } }));

  // Live teacher totals including unsaved edits.
  const teacherTotals = useMemo(() => {
    const totals = new Map(setup.teachers.map((t) => [t.id, t.periodsAssigned]));
    for (const [k, v] of Object.entries(edits)) {
      const o = original.get(k);
      if (o?.teacherId) totals.set(o.teacherId, (totals.get(o.teacherId) ?? 0) - o.periodsPerWeek);
      if (v.teacherId) totals.set(v.teacherId, (totals.get(v.teacherId) ?? 0) + v.periodsPerWeek);
    }
    return totals;
  }, [edits, original, setup.teachers]);

  if (!level) {
    return (
      <Card>
        <EmptyState icon={Table2} title="No classes yet" description="Add class levels and arms in Academic Setup, then set their weekly periods here." />
      </Card>
    );
  }

  const arms = level.arms;
  const armIds = new Set(arms.map((a) => a.id));
  const inLevel = new Set([
    ...setup.loads.filter((l) => armIds.has(l.classArmId)).map((l) => l.subjectId),
    ...Object.values(edits)
      .filter((l) => armIds.has(l.classArmId))
      .map((l) => l.subjectId),
    ...(added[level.id] ?? []),
  ]);
  const rows = setup.subjects.filter((s) => inLevel.has(s.id));
  const available = setup.subjects.filter((s) => !inLevel.has(s.id));

  const addSubject = (subjectId: string) => {
    setAdded((prev) => ({ ...prev, [level.id]: [...(prev[level.id] ?? []), subjectId] }));
    setEdits((prev) => {
      const next = { ...prev };
      for (const a of arms) if (!original.has(key(a.id, subjectId))) next[key(a.id, subjectId)] = blank(a.id, subjectId);
      return next;
    });
  };

  const copyRow = (subjectId: string, fromArmId: string, withTeacher: boolean) => {
    const src = get(fromArmId, subjectId);
    setEdits((prev) => {
      const next = { ...prev };
      for (const a of arms) {
        if (a.id === fromArmId) continue;
        const cur = next[key(a.id, subjectId)] ?? original.get(key(a.id, subjectId)) ?? blank(a.id, subjectId);
        next[key(a.id, subjectId)] = {
          ...cur,
          periodsPerWeek: src.periodsPerWeek,
          roomKind: src.roomKind,
          doublePeriod: src.doublePeriod,
          teacherId: withTeacher ? src.teacherId : cur.teacherId,
        };
      }
      return next;
    });
  };

  const armTotal = (armId: string) => rows.reduce((n, s) => n + get(armId, s.id).periodsPerWeek, 0);
  const levelDirty = dirtyRows.filter((r) => armIds.has(r.classArmId)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={level.id} onValueChange={(v) => setPick({ levelId: v })}>
          <SelectTrigger className="sm:w-60" aria-label="Class level">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {setup.levels.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="flex-1 text-[12.5px] text-muted-foreground">
          Each class gets <span className="font-medium text-foreground tabular">{setup.slotsPerWeek}</span> lesson slots a week. Set periods, teacher, room and doubles per
          arm.
        </p>
        {canManage && available.length > 0 && (
          <Select value="" onValueChange={addSubject}>
            <SelectTrigger className="sm:w-56" aria-label="Add a subject to this class">
              <span className="flex items-center gap-2 text-foreground">
                <BookPlus className="size-4 text-muted-foreground" /> Add subject
              </span>
            </SelectTrigger>
            <SelectContent>
              {available.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {arms.length === 0 ? (
        <Card>
          <EmptyState compact icon={Table2} title={`${level.name} has no arms`} description="Add arms (A, B, Gold…) in Academic Setup first." />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            compact
            icon={BookPlus}
            title={`No subjects for ${level.name} yet`}
            description={canManage ? 'Use “Add subject” to start setting weekly periods.' : 'Nothing has been set up for this class yet.'}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-muted/50">
                <tr className="border-b border-border">
                  <th scope="col" className="sticky left-0 z-10 min-w-[180px] bg-muted px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Subject
                  </th>
                  {arms.map((a) => (
                    <th key={a.id} scope="col" className="min-w-[230px] px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {level.name} {a.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="group border-b border-border align-top last:border-0">
                    <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-3 text-left font-normal">
                      <div className="flex items-start gap-2">
                        <SubjectDot code={s.code || s.name} className="mt-1.5" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{s.name}</p>
                          <p className="text-[11.5px] text-muted-foreground">
                            {s.code}
                            {s.isCore && ' · Core'}
                          </p>
                        </div>
                        {canManage && arms.length > 1 && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon-sm" variant="ghost" aria-label={`Apply ${s.name} to all arms`}>
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem onSelect={() => copyRow(s.id, arms[0].id, false)}>
                                <Copy /> Apply {arms[0].name}’s periods, room & double to all arms
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => copyRow(s.id, arms[0].id, true)}>
                                <Copy /> …including the teacher
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </th>
                    {arms.map((a) => {
                      const l = get(a.id, s.id);
                      const changed = !!edits[key(a.id, s.id)] && (!original.has(key(a.id, s.id)) || !same(original.get(key(a.id, s.id))!, l));
                      const label = `${s.name} for ${level.name} ${a.name}`;
                      return (
                        <td key={a.id} className={cn('px-3 py-3', changed && 'bg-brand-soft/30')}>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Stepper
                                value={l.periodsPerWeek}
                                max={20}
                                label={`periods a week, ${label}`}
                                disabled={!canManage}
                                onChange={(n) => set(a.id, s.id, { periodsPerWeek: n, doublePeriod: n < 2 ? false : l.doublePeriod })}
                              />
                              <span className="text-[11.5px] text-muted-foreground">/ week</span>
                            </div>
                            <Select
                              value={l.teacherId ?? NONE}
                              onValueChange={(v) => set(a.id, s.id, { teacherId: v === NONE ? null : v })}
                              disabled={!canManage}
                            >
                              <SelectTrigger className="h-8 text-[12.5px]" aria-label={`Teacher, ${label}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE}>No teacher yet</SelectItem>
                                {setup.teachers.map((t) => {
                                  const n = teacherTotals.get(t.id) ?? 0;
                                  return (
                                    <SelectItem key={t.id} value={t.id}>
                                      {t.name} · <span className={cn('tabular', n > setup.slotsPerWeek ? 'text-danger' : 'text-muted-foreground')}>{n} periods</span>
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                            <div className="flex items-center gap-2">
                              <Select
                                value={l.roomKind ?? NONE}
                                onValueChange={(v) => set(a.id, s.id, { roomKind: v === NONE ? null : (v as RoomKind) })}
                                disabled={!canManage}
                              >
                                <SelectTrigger className="h-8 min-w-0 flex-1 text-[12.5px]" aria-label={`Room, ${label}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={NONE}>Own classroom</SelectItem>
                                  {ROOM_KINDS.filter((k) => k !== 'CLASSROOM').map((k) => (
                                    <SelectItem key={k} value={k}>
                                      {ROOM_KIND_LABELS[k]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <label className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground" title="Place lessons in pairs back to back">
                                <Switch
                                  checked={l.doublePeriod}
                                  disabled={!canManage || l.periodsPerWeek < 2}
                                  onCheckedChange={(v) => set(a.id, s.id, { doublePeriod: v })}
                                  aria-label={`Double lessons, ${label}`}
                                />
                                <Layers2 className="size-3.5" aria-hidden /> Double
                              </label>
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/40">
                  <th scope="row" className="sticky left-0 z-10 bg-muted px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Periods a week
                  </th>
                  {arms.map((a) => {
                    const total = armTotal(a.id);
                    const over = total > setup.slotsPerWeek;
                    return (
                      <td key={a.id} className="px-3 py-2.5">
                        <p className={cn('flex items-center gap-1.5 text-[13px] font-semibold tabular', over ? 'text-danger' : total === setup.slotsPerWeek ? 'text-success' : '')}>
                          {over && <AlertTriangle className="size-3.5" />}
                          {total} <span className="font-normal text-muted-foreground">/ {setup.slotsPerWeek}</span>
                        </p>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                          <div
                            className={cn('h-full rounded-full', over ? 'bg-danger' : 'bg-brand')}
                            style={{ width: `${Math.min(100, (total / Math.max(1, setup.slotsPerWeek)) * 100)}%` }}
                          />
                        </div>
                        {over && <p className="mt-1 text-[11.5px] text-danger">{total - setup.slotsPerWeek} more than the week holds</p>}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {canManage && dirty && (
        <div className="glass sticky bottom-3 z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-brand/40 px-4 py-3 shadow-pop">
          <p className="min-w-0 flex-1 text-[13px]">
            <span className="inline-flex items-center gap-2 font-medium">
              <span className="size-2 rounded-full bg-brand" aria-hidden /> {dirtyRows.length} unsaved {dirtyRows.length === 1 ? 'change' : 'changes'}
              {levelDirty !== dirtyRows.length && <span className="font-normal text-muted-foreground">({dirtyRows.length - levelDirty} in other classes)</span>}
            </span>
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEdits({});
              setAdded({});
            }}
          >
            <RotateCcw /> Discard
          </Button>
          <Button
            size="sm"
            loading={save.isPending}
            onClick={() =>
              save.mutate(dirtyRows, {
                onSuccess: () => {
                  setEdits({});
                },
              })
            }
          >
            {!save.isPending && <Save />} Save periods
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(o) => !o && blocker.state === 'blocked' && blocker.reset()}
        title="Leave without saving?"
        description={`You have ${dirtyRows.length} unsaved ${dirtyRows.length === 1 ? 'change' : 'changes'} to weekly periods.`}
        confirmLabel="Leave"
        onConfirm={() => blocker.state === 'blocked' && blocker.proceed()}
      />
    </div>
  );
}
