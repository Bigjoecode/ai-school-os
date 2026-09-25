import {
  type BellSchedule,
  canStartDouble,
  DAY_NAMES,
  DAY_SHORT,
  lessonPeriods,
  type TimetableDetail,
  type TimetableEntryView,
} from '@aischool/shared';
import { ArrowRightLeft, Coffee, DoorOpen, GraduationCap, Lock, LockOpen, MoveRight, User } from 'lucide-react';
import type * as React from 'react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { armLabel, lessonAccent, lessonTint, periodTime, plural, subjectVars } from './ui';

export type ViewKind = 'class' | 'teacher' | 'room';

/** Teacher id → set of "day:period" keys they can't teach. */
export type BlockedMap = Map<string, Set<string>>;

const slotKey = (day: number, period: number) => `${day}:${period}`;

export function sortedDays(bell: BellSchedule): number[] {
  return [...bell.days].sort((a, b) => a - b);
}

export function matchesView(e: TimetableEntryView, view: ViewKind, id: string): boolean {
  if (view === 'class') return e.classArm.id === id;
  if (view === 'teacher') return e.teacher?.id === id;
  return e.room?.id === id;
}

/** The whole group a lesson moves with (itself, or both halves of a double). */
export function groupOf(detail: TimetableDetail, entry: TimetableEntryView): TimetableEntryView[] {
  if (!entry.doubleGroup) return [entry];
  return detail.entries.filter((e) => e.doubleGroup === entry.doubleGroup).sort((a, b) => a.period - b.period);
}

/**
 * Why a lesson can't go to (day, period), judged from what's on screen —
 * the server re-checks everything (rooms, room kinds) on save.
 */
export function slotIssue(detail: TimetableDetail, entry: TimetableEntryView, day: number, period: number, blocked?: BlockedMap): string | null {
  const bell = detail.bellSchedule;
  const group = groupOf(detail, entry);
  const isDouble = group.length === 2;
  if (!bell.days.includes(day)) return 'Not a school day';
  if (bell.periods[period]?.kind !== 'LESSON') return 'Not a lesson period';
  if (isDouble && !canStartDouble(bell, period)) return 'A double needs two lessons in a row';
  const lessons = lessonPeriods(bell);
  const targets = isDouble ? [period, lessons[lessons.indexOf(period) + 1]] : [period];
  const ids = new Set(group.map((g) => g.id));
  for (const e of detail.entries) {
    if (ids.has(e.id) || e.day !== day || !targets.includes(e.period)) continue;
    if (e.classArm.id === entry.classArm.id) return `Class has ${e.subject.name}`;
    if (entry.teacher && e.teacher?.id === entry.teacher.id) return `Teacher is with ${armLabel(e)}`;
    if (entry.room && e.room?.id === entry.room.id) return `${entry.room.name} is in use`;
  }
  if (entry.teacher) {
    const off = blocked?.get(entry.teacher.id);
    if (off && targets.some((p) => off.has(slotKey(day, p)))) return 'Teacher unavailable';
  }
  return null;
}

// ------------------------------------------------------------------ lesson card

interface LessonActions {
  editable: boolean;
  onLock: (entry: TimetableEntryView, locked: boolean) => void;
  onOpenMove: (entry: TimetableEntryView) => void;
}

function secondaryLines(e: TimetableEntryView, view: ViewKind): { icon: React.ElementType; text: string }[] {
  const lines: { icon: React.ElementType; text: string }[] = [];
  if (view !== 'class') lines.push({ icon: GraduationCap, text: armLabel(e) });
  if (view !== 'teacher') lines.push({ icon: User, text: e.teacher?.name ?? 'No teacher' });
  if (view !== 'room' && e.room) lines.push({ icon: DoorOpen, text: e.room.name });
  return lines;
}

function LessonCard({
  entry,
  view,
  bell,
  isDouble,
  actions,
  dragging,
  onDragStart,
  onDragEnd,
  className,
}: {
  entry: TimetableEntryView;
  view: ViewKind;
  bell: BellSchedule;
  isDouble: boolean;
  actions: LessonActions;
  dragging?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const lines = secondaryLines(entry, view);
  const endIndex = isDouble ? entry.period + 1 : entry.period;
  const time = `${bell.periods[entry.period]?.start ?? ''}–${bell.periods[endIndex]?.end ?? ''}`;
  const label = `${entry.subject.name}, ${armLabel(entry)}, ${DAY_NAMES[entry.day]} ${time}${entry.teacher ? `, ${entry.teacher.name}` : ''}${entry.room ? `, ${entry.room.name}` : ''}${entry.locked ? ', locked' : ''}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          draggable={actions.editable}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          style={subjectVars(entry.subject.code || entry.subject.name)}
          className={cn(
            'group/lesson relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-lg border px-2 py-1.5 pl-2.5 text-left transition-[box-shadow,transform,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            lessonTint,
            actions.editable && 'cursor-grab hover:shadow-soft active:cursor-grabbing',
            dragging && 'opacity-40',
            className,
          )}
        >
          <span aria-hidden className={cn('absolute inset-y-1 left-1 w-[3px] rounded-full', lessonAccent)} />
          <span className="flex items-start gap-1">
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold leading-tight">{entry.subject.name}</span>
            {entry.locked && <Lock aria-hidden className="mt-px size-3 shrink-0 opacity-70" />}
          </span>
          {lines.map((l, i) => (
            <span key={i} className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] leading-tight opacity-80">
              <l.icon aria-hidden className="size-3 shrink-0 opacity-70 print:hidden" />
              <span className="truncate">{l.text}</span>
            </span>
          ))}
          {isDouble && <span className="mt-auto pt-1 text-[10px] font-medium uppercase tracking-wider opacity-70">Double</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="border-b border-border p-4" style={subjectVars(entry.subject.code || entry.subject.name)}>
          <div className="flex items-center gap-2">
            <span aria-hidden className={cn('size-2.5 rounded-full', lessonAccent)} />
            <p className="min-w-0 flex-1 truncate font-display font-semibold">{entry.subject.name}</p>
            {isDouble && <Badge variant="outline">Double</Badge>}
          </div>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {DAY_NAMES[entry.day]} · {time}
          </p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 p-4 text-[12.5px]">
          <dt className="text-muted-foreground">Class</dt>
          <dd className="truncate font-medium">{armLabel(entry)}</dd>
          <dt className="text-muted-foreground">Teacher</dt>
          <dd className="truncate font-medium">{entry.teacher?.name ?? '—'}</dd>
          <dt className="text-muted-foreground">Room</dt>
          <dd className="truncate font-medium">{entry.room?.name ?? 'Own classroom'}</dd>
        </dl>
        {actions.editable ? (
          <div className="space-y-2 border-t border-border bg-muted/40 p-3">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setOpen(false);
                  actions.onOpenMove(entry);
                }}
              >
                <ArrowRightLeft /> Move…
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setOpen(false);
                  actions.onLock(entry, !entry.locked);
                }}
              >
                {entry.locked ? <LockOpen /> : <Lock />} {entry.locked ? 'Unlock' : 'Lock'}
              </Button>
            </div>
            <p className="text-[11.5px] text-muted-foreground">
              {entry.locked ? 'Locked — Rebuild keeps this lesson where it is.' : 'Drag it to another period, or lock it so Rebuild keeps it here.'}
            </p>
          </div>
        ) : (
          entry.locked && (
            <p className="flex items-center gap-1.5 border-t border-border px-4 py-2.5 text-[12px] text-muted-foreground">
              <Lock className="size-3" /> Locked in place
            </p>
          )
        )}
      </PopoverContent>
    </Popover>
  );
}

// ------------------------------------------------------------------ week grid

interface GridProps extends LessonActions {
  detail: TimetableDetail;
  view: ViewKind;
  targetId: string;
  blocked?: BlockedMap;
  onMove: (entry: TimetableEntryView, day: number, period: number) => void;
  /** Title printed above the grid. */
  printTitle: string;
  printSubtitle?: string;
}

function useCells(detail: TimetableDetail, view: ViewKind, targetId: string) {
  return useMemo(() => {
    const mine = detail.entries.filter((e) => matchesView(e, view, targetId));
    const cells = new Map<string, TimetableEntryView>();
    const covered = new Set<string>();
    const doubles = new Set<string>();
    for (const e of [...mine].sort((a, b) => a.period - b.period)) {
      const k = slotKey(e.day, e.period);
      if (covered.has(k) || cells.has(k)) continue;
      cells.set(k, e);
      if (e.doubleGroup) {
        const partner = mine.find((o) => o.id !== e.id && o.doubleGroup === e.doubleGroup && o.day === e.day && o.period === e.period + 1);
        if (partner) {
          covered.add(slotKey(partner.day, partner.period));
          doubles.add(e.id);
        }
      }
    }
    const perDay = new Map<number, number>();
    for (const e of mine) perDay.set(e.day, (perDay.get(e.day) ?? 0) + 1);
    return { mine, cells, covered, doubles, perDay };
  }, [detail, view, targetId]);
}

export function TimetableWeekGrid(props: GridProps) {
  const { detail, view, targetId, blocked, onMove, editable, printTitle, printSubtitle } = props;
  const bell = detail.bellSchedule;
  const days = sortedDays(bell);
  const { mine, cells, covered, doubles, perDay } = useCells(detail, view, targetId);

  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const dragged = dragId ? detail.entries.find((e) => e.id === dragId) : undefined;

  const issueFor = (day: number, period: number) => (dragged ? slotIssue(detail, dragged, day, period, blocked) : null);

  const dropHandlers = (day: number, period: number) =>
    editable && dragged
      ? {
          onDragOver: (ev: React.DragEvent) => {
            ev.preventDefault();
            ev.dataTransfer.dropEffect = 'move';
            if (over !== slotKey(day, period)) setOver(slotKey(day, period));
          },
          onDragLeave: () => setOver((o) => (o === slotKey(day, period) ? null : o)),
          onDrop: (ev: React.DragEvent) => {
            ev.preventDefault();
            const entry = dragged;
            setDragId(null);
            setOver(null);
            if (entry.day === day && entry.period === period) return;
            onMove(entry, day, period);
          },
        }
      : {};

  return (
    <div className="print-landscape">
      <div className="mb-3 hidden print:block">
        <h2 className="font-display text-xl font-semibold">{printTitle}</h2>
        {printSubtitle && <p className="text-[12px] text-muted-foreground">{printSubtitle}</p>}
      </div>

      {/* Week grid — desktop and print */}
      <div className="scrollbar-thin hidden overflow-x-auto md:block print:block print-scroll-reset">
        <table className="w-full min-w-[720px] table-fixed border-separate border-spacing-1 text-[12.5px] print:min-w-0">
          <colgroup>
            <col className="w-[104px]" />
            {days.map((d) => (
              <col key={d} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="sr-only">
                Period
              </th>
              {days.map((d) => (
                <th key={d} scope="col" className="px-2 pb-1 pt-1 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="hidden lg:inline print:inline">{DAY_NAMES[d]}</span>
                  <span className="lg:hidden print:hidden">{DAY_SHORT[d]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bell.periods.map((p, i) => {
              if (p.kind !== 'LESSON') {
                return (
                  <tr key={i}>
                    <td colSpan={days.length + 1} className="p-0">
                      <div className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-1 text-[11px] text-muted-foreground print:bg-muted">
                        <Coffee aria-hidden className="size-3" />
                        <span className="font-medium text-foreground/80">{p.label}</span>
                        <span className="tabular">
                          {p.start}–{p.end}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={i}>
                  <th scope="row" className="h-[64px] rounded-md px-2 text-left align-top font-normal print:h-[52px]">
                    <span className="block pt-1.5 text-[12px] font-medium text-foreground">{p.label}</span>
                    <span className="block text-[11px] tabular text-muted-foreground">
                      {p.start}–{p.end}
                    </span>
                  </th>
                  {days.map((d) => {
                    const k = slotKey(d, i);
                    if (covered.has(k)) return null;
                    const entry = cells.get(k);
                    const isDouble = !!entry && doubles.has(entry.id);
                    const issue = dragged ? issueFor(d, i) : null;
                    const isOver = over === k;
                    return (
                      <td
                        key={d}
                        rowSpan={isDouble ? 2 : undefined}
                        className={cn(
                          'relative h-[64px] rounded-lg p-0 align-top transition-colors print:h-[52px]',
                          !entry && 'border border-dashed border-border/70 bg-muted/20 print:border-solid',
                          dragged && !issue && 'bg-success-soft/50',
                          dragged && issue && 'bg-danger-soft/40',
                          isOver && (issue ? 'ring-2 ring-danger/60' : 'ring-2 ring-brand'),
                        )}
                        {...dropHandlers(d, i)}
                      >
                        {entry ? (
                          <LessonCard
                            entry={entry}
                            view={view}
                            bell={bell}
                            isDouble={isDouble}
                            actions={props}
                            dragging={dragId === entry.id || (!!dragged?.doubleGroup && dragged.doubleGroup === entry.doubleGroup)}
                            onDragStart={(ev) => {
                              ev.dataTransfer.effectAllowed = 'move';
                              ev.dataTransfer.setData('text/plain', entry.id);
                              setDragId(entry.id);
                            }}
                            onDragEnd={() => {
                              setDragId(null);
                              setOver(null);
                            }}
                          />
                        ) : (
                          <span className="sr-only">Free</span>
                        )}
                        {dragged && isOver && issue && (
                          <span className="pointer-events-none absolute inset-x-1 bottom-1 truncate rounded bg-danger px-1.5 py-0.5 text-[10px] font-medium text-white">
                            {issue}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          {view === 'teacher' && (
            <tfoot>
              <tr>
                <th scope="row" className="px-2 pt-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Load
                </th>
                {days.map((d) => {
                  const n = perDay.get(d) ?? 0;
                  return (
                    <td key={d} className="px-2 pt-2">
                      <span className={cn('text-[12px] font-medium tabular', n > 6 ? 'text-warning' : 'text-muted-foreground')}>
                        {plural(n, 'lesson')}
                      </span>
                      <span aria-hidden className="mt-1 flex gap-0.5">
                        {lessonPeriods(bell).map((_, j) => (
                          <span key={j} className={cn('h-1 flex-1 rounded-full', j < n ? (n > 6 ? 'bg-warning' : 'bg-brand') : 'bg-muted')} />
                        ))}
                      </span>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
        {mine.length === 0 && <p className="px-2 py-3 text-center text-[12.5px] text-muted-foreground print:hidden">No lessons on this timetable yet.</p>}
      </div>

      {/* Day-by-day list — phones */}
      <DayList {...props} />
    </div>
  );
}

function DayList(props: GridProps) {
  const { detail, view, targetId } = props;
  const bell = detail.bellSchedule;
  const days = sortedDays(bell);
  const today = ((new Date().getDay() + 6) % 7) + 1;
  const [day, setDay] = useState(days.includes(today) ? today : days[0]);
  const { cells, covered, doubles, perDay } = useCells(detail, view, targetId);

  return (
    <div className="md:hidden print:hidden">
      <div role="tablist" aria-label="Day" className="no-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1">
        {days.map((d) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={d === day}
            onClick={() => setDay(d)}
            className={cn(
              'flex shrink-0 flex-col items-center rounded-xl border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors',
              d === day ? 'border-brand bg-brand-soft text-brand' : 'border-border bg-card text-muted-foreground',
            )}
          >
            {DAY_SHORT[d]}
            <span className="text-[10.5px] font-normal tabular opacity-80">{perDay.get(d) ?? 0}</span>
          </button>
        ))}
      </div>
      <ol className="space-y-1.5" aria-label={`${DAY_NAMES[day]} lessons`}>
        {bell.periods.map((p, i) => {
          if (p.kind !== 'LESSON') {
            return (
              <li key={i} className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-1.5 text-[11.5px] text-muted-foreground">
                <Coffee aria-hidden className="size-3" /> <span className="font-medium text-foreground/80">{p.label}</span>
                <span className="ml-auto tabular">{periodTime(bell, i)}</span>
              </li>
            );
          }
          const k = slotKey(day, i);
          if (covered.has(k)) return null;
          const entry = cells.get(k);
          const isDouble = !!entry && doubles.has(entry.id);
          return (
            <li key={i} className="flex gap-3">
              <div className="w-16 shrink-0 pt-1.5">
                <p className="text-[12px] font-medium">{p.label}</p>
                <p className="text-[10.5px] tabular text-muted-foreground">
                  {p.start}–{isDouble ? bell.periods[i + 1]?.end : p.end}
                </p>
              </div>
              <div className={cn('min-w-0 flex-1', isDouble ? 'min-h-[96px]' : 'min-h-[56px]')}>
                {entry ? (
                  <LessonCard entry={entry} view={view} bell={bell} isDouble={isDouble} actions={{ ...props, editable: props.editable }} className="cursor-pointer" />
                ) : (
                  <div className="flex h-full min-h-[56px] items-center rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 text-[12px] text-muted-foreground">
                    Free
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ------------------------------------------------------------------ move dialog

export function MoveLessonDialog({
  detail,
  entry,
  blocked,
  onOpenChange,
  onMove,
  pending,
}: {
  detail: TimetableDetail;
  entry: TimetableEntryView | null;
  blocked?: BlockedMap;
  onOpenChange: (open: boolean) => void;
  onMove: (entry: TimetableEntryView, day: number, period: number) => void;
  pending?: boolean;
}) {
  const bell = detail.bellSchedule;
  const days = sortedDays(bell);
  const group = entry ? groupOf(detail, entry) : [];
  const isDouble = group.length === 2;
  const start = group[0] ?? entry;
  const rows = lessonPeriods(bell).filter((p) => !isDouble || canStartDouble(bell, p));

  return (
    <Dialog open={!!entry} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <div className="mb-2 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
            <MoveRight className="size-5" />
          </div>
          <DialogTitle>Move {entry ? `${entry.subject.name} · ${armLabel(entry)}` : 'lesson'}</DialogTitle>
          <DialogDescription>
            {isDouble ? 'This is a double — pick where it should start; both periods move together. ' : 'Pick a new period. '}
            Free slots are checked against the class{entry?.teacher ? ` and ${entry.teacher.name}` : ''}. Moved lessons are locked.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {entry && start && (
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full min-w-[480px] table-fixed border-separate border-spacing-1 text-[12px]">
                <thead>
                  <tr>
                    <th scope="col" className="w-20 text-left text-[11px] font-medium text-muted-foreground">
                      <span className="sr-only">Period</span>
                    </th>
                    {days.map((d) => (
                      <th key={d} scope="col" className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {DAY_SHORT[d]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p}>
                      <th scope="row" className="pr-1 text-left font-normal">
                        <span className="block text-[12px] font-medium">{bell.periods[p]?.label}</span>
                        <span className="block text-[10.5px] tabular text-muted-foreground">{bell.periods[p]?.start}</span>
                      </th>
                      {days.map((d) => {
                        const here = start.day === d && start.period === p;
                        const issue = here ? null : slotIssue(detail, entry, d, p, blocked);
                        return (
                          <td key={d}>
                            <button
                              type="button"
                              disabled={here || !!issue || pending}
                              onClick={() => onMove(entry, d, p)}
                              title={issue ?? undefined}
                              aria-label={`${DAY_NAMES[d]} ${bell.periods[p]?.label}: ${here ? 'current slot' : issue ?? 'free'}`}
                              className={cn(
                                'flex h-11 w-full flex-col justify-center rounded-lg border px-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                here && 'border-brand bg-brand-soft text-brand',
                                !here && !issue && 'border-success/30 bg-success-soft/60 text-success hover:border-success hover:bg-success-soft',
                                !here && issue && 'cursor-not-allowed border-border bg-muted/50 text-muted-foreground',
                              )}
                            >
                              <span className="text-[11.5px] font-medium">{here ? 'Here now' : issue ? 'Busy' : 'Free'}</span>
                              {issue && <span className="truncate text-[10px] leading-tight">{issue}</span>}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <p className="mr-auto hidden text-[12px] text-muted-foreground sm:block">Room clashes are checked when you save.</p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
