import { DAY_NAMES, type TimetableEntryView, type TimetableSummary } from '@aischool/shared';
import {
  CalendarClock,
  ChevronDown,
  GraduationCap,
  DoorOpen,
  Lock,
  MoreHorizontal,
  Plus,
  Printer,
  Rocket,
  RotateCw,
  Settings2,
  Trash2,
  User,
  Wand2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { errorMessage } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { qk, queryClient } from '@/lib/query-client';
import { cn } from '@/lib/utils';
import { useStructure } from '../academics/api';
import { useStoredState } from '../assessment/ui';
import { currentTerm, termOptions } from '../planning/pickers';
import { useSearchFlag } from '../planning/ui';
import {
  isBuilding,
  moveConflicts,
  useDeleteTimetable,
  useGenerateTimetable,
  useLockEntry,
  useMoveEntry,
  usePublishTimetable,
  useRegenerate,
  useTimetable,
  useTimetables,
  useTimetableSetup,
} from './api';
import { TimetableAssistant } from './assistant';
import { SolverReportCard } from './solver-report';
import { type BlockedMap, MoveLessonDialog, TimetableWeekGrid, type ViewKind } from './timetable-grid';
import { armLabel, BuildFailedPanel, BuildingPanel, GridSkeleton, plural, TimetableStatusBadge } from './ui';

interface Pick {
  termId?: string;
  view?: ViewKind;
  class?: string;
  teacher?: string;
  room?: string;
}

const STATUS_ORDER: Record<TimetableSummary['status'], number> = { PUBLISHED: 0, DRAFT: 1, ARCHIVED: 2 };

function sortTimetables(list: TimetableSummary[]) {
  return [...list].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.updatedAt.localeCompare(a.updatedAt));
}

const VIEWS: { value: ViewKind; label: string; icon: typeof User }[] = [
  { value: 'class', label: 'By class', icon: GraduationCap },
  { value: 'teacher', label: 'By teacher', icon: User },
  { value: 'room', label: 'By room', icon: DoorOpen },
];

export default function TimetablePage() {
  const canManage = useCan('timetable.manage');
  const canAi = useCan('ai.use');
  const structure = useStructure();
  const setup = useTimetableSetup();
  const [params, setParams] = useSearchParams();
  const [pick, setPick] = useStoredState<Pick>('aischool.timetable.pick', {});
  const [newOpen, setNewOpen] = useSearchFlag('new');
  const [assistantOpen, setAssistantOpen] = useSearchFlag('assistant');

  // ---- term: from the academic structure when we can read it, else from the timetables themselves
  const terms = termOptions(structure.data);
  const structureTerm = structure.data
    ? pick.termId && terms.some((t) => t.id === pick.termId)
      ? pick.termId
      : currentTerm(structure.data)?.id
    : undefined;
  const list = useTimetables(structureTerm, !structure.isLoading);
  const fallbackTerms = useMemo(() => {
    const seen = new Map<string, { id: string; label: string }>();
    for (const t of list.data ?? []) if (!seen.has(t.term.id)) seen.set(t.term.id, { id: t.term.id, label: `${t.term.name} · ${t.term.sessionName}` });
    return [...seen.values()];
  }, [list.data]);
  const termId = structure.data
    ? structureTerm
    : pick.termId && fallbackTerms.some((t) => t.id === pick.termId)
      ? pick.termId
      : (list.data?.find((t) => t.status === 'PUBLISHED') ?? list.data?.[0])?.term.id;
  const termLabel = structure.data ? terms.find((t) => t.id === termId)?.label : fallbackTerms.find((t) => t.id === termId)?.label;

  const timetables = useMemo(() => sortTimetables((list.data ?? []).filter((t) => !termId || t.term.id === termId)), [list.data, termId]);

  // ---- selected timetable (?id=…), defaulting to the live one
  const paramId = params.get('id');
  const selected = timetables.find((t) => t.id === paramId) ?? timetables[0];
  const selectId = (id: string | undefined) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (id) p.set('id', id);
        else p.delete('id');
        return p;
      },
      { replace: true },
    );

  const detailQuery = useTimetable(selected?.id);
  const detail = detailQuery.data && detailQuery.data.id === selected?.id ? detailQuery.data : undefined;

  // Tell the user when a build finishes, and refresh the list.
  const lastGen = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!detail) return;
    const prev = lastGen.current[detail.id];
    if (prev && isBuilding(prev as TimetableSummary['generation']) && !isBuilding(detail.generation)) {
      void queryClient.invalidateQueries({ queryKey: qk.timetables() });
      if (detail.generation === 'DONE' && detail.report) {
        toast.success(`${detail.name} is ready`, { description: `Placed ${detail.report.placed} of ${detail.report.required} lessons.` });
      } else if (detail.generation === 'FAILED') {
        toast.error('The timetable couldn’t be built', { description: detail.generationError ?? undefined });
      }
    }
    lastGen.current[detail.id] = detail.generation;
  }, [detail]);

  // ---- mutations
  const generate = useGenerateTimetable();
  const regenerate = useRegenerate();
  const publish = usePublishTimetable();
  const remove = useDeleteTimetable();
  const move = useMoveEntry(selected?.id ?? '');
  const lock = useLockEntry(selected?.id ?? '');
  const [confirm, setConfirm] = useState<'rebuild' | 'publish' | 'delete' | null>(null);
  const [moving, setMoving] = useState<TimetableEntryView | null>(null);
  const [printAll, setPrintAll] = useState(false);

  const lessonsToPlace = useMemo(() => (setup.data?.loads ?? []).reduce((n, l) => n + l.periodsPerWeek, 0), [setup.data]);
  const blocked: BlockedMap = useMemo(() => {
    const m: BlockedMap = new Map();
    for (const t of setup.data?.teachers ?? []) m.set(t.id, new Set(t.unavailable.map((u) => `${u.day}:${u.period}`)));
    return m;
  }, [setup.data]);

  // ---- view options from what's actually on this timetable
  const options = useMemo(() => {
    const levelOrder = new Map((setup.data?.levels ?? []).map((l, i) => [l.name, i]));
    const classes = new Map<string, { id: string; label: string; level: string; arm: string }>();
    const teachers = new Map<string, { id: string; label: string }>();
    const rooms = new Map<string, { id: string; label: string }>();
    for (const e of detail?.entries ?? []) {
      classes.set(e.classArm.id, { id: e.classArm.id, label: armLabel(e), level: e.classArm.levelName, arm: e.classArm.name });
      if (e.teacher) teachers.set(e.teacher.id, { id: e.teacher.id, label: e.teacher.name });
      if (e.room) rooms.set(e.room.id, { id: e.room.id, label: e.room.name });
    }
    const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, undefined, { numeric: true });
    return {
      class: [...classes.values()].sort(
        (a, b) => (levelOrder.get(a.level) ?? 99) - (levelOrder.get(b.level) ?? 99) || a.label.localeCompare(b.label, undefined, { numeric: true }),
      ),
      teacher: [...teachers.values()].sort(byLabel),
      room: [...rooms.values()].sort(byLabel),
    };
  }, [detail, setup.data]);

  const view: ViewKind = pick.view ?? 'class';
  const viewOptions = options[view];
  const targetId = viewOptions.some((o) => o.id === pick[view]) ? pick[view]! : viewOptions[0]?.id;
  const target = viewOptions.find((o) => o.id === targetId);

  const editable = canManage && !!detail && detail.status !== 'ARCHIVED' && detail.generation === 'DONE';
  const lockedCount = useMemo(() => {
    const groups = new Set<string>();
    for (const e of detail?.entries ?? []) if (e.locked) groups.add(e.doubleGroup ?? e.id);
    return groups.size;
  }, [detail]);

  // ---- actions
  const onMove = (entry: TimetableEntryView, day: number, period: number) => {
    if (!detail) return;
    move.mutate(
      { entryId: entry.id, day, period },
      {
        onSuccess: () => {
          setMoving(null);
          toast.success(`Moved ${entry.subject.name} to ${DAY_NAMES[day]}, ${detail.bellSchedule.periods[period]?.label ?? ''}`, {
            description: 'Locked so Rebuild keeps it there.',
          });
        },
        onError: (err) => {
          const conflicts = moveConflicts(err);
          if (conflicts.length) {
            toast.error('That slot clashes', { description: conflicts.map((c) => c.message).join(' · ') });
          } else {
            toast.error(errorMessage(err));
          }
        },
      },
    );
  };

  const onLock = (entry: TimetableEntryView, locked: boolean) =>
    lock.mutate(
      { entryId: entry.id, locked },
      { onSuccess: () => toast.success(locked ? `${entry.subject.name} locked` : `${entry.subject.name} unlocked`) },
    );

  const rebuild = () => {
    if (!selected) return;
    regenerate.mutate(selected.id, {
      onSuccess: () => {
        setConfirm(null);
        toast.message('Rebuilding…', { description: lockedCount ? `Keeping ${plural(lockedCount, 'locked lesson')} in place.` : undefined });
      },
    });
  };

  const doPrintAll = () => {
    flushSync(() => setPrintAll(true));
    document.body.dataset.print = 'tt-all';
    const clear = () => {
      delete document.body.dataset.print;
      setPrintAll(false);
      window.removeEventListener('afterprint', clear);
    };
    window.addEventListener('afterprint', clear);
    window.print();
  };

  const building = !!selected && isBuilding(detail?.generation ?? selected.generation);
  const failed = (detail?.generation ?? selected?.generation) === 'FAILED';

  return (
    <Page>
      <PageHeader
        className="print:hidden"
        title="Timetable"
        description="Clash-free weekly timetables for every class, teacher and room — built by the solver, tuned by you."
        actions={
          <>
            {canManage && canAi && (
              <Button variant="outline" onClick={() => setAssistantOpen(true)}>
                <AiSparkle className="size-4" animated={false} /> Assistant
              </Button>
            )}
            <Button asChild variant="outline">
              <Link to="/timetable/setup">
                <Settings2 /> Setup
              </Link>
            </Button>
            {detail?.generation === 'DONE' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <Printer /> Print <ChevronDown className="opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => window.print()}>
                    <Printer /> This {view === 'class' ? 'class' : view === 'teacher' ? 'teacher' : 'room'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={doPrintAll}>
                    <GraduationCap /> Every class (one page each)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {canManage && (
              <Button onClick={() => setNewOpen(true)}>
                <Plus /> Generate new timetable
              </Button>
            )}
          </>
        }
      />

      <div className="tt-print-single">
        <Card className="mb-5 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] print:hidden">
          <Select
            value={termId ?? ''}
            onValueChange={(v) => {
              setPick({ ...pick, termId: v });
              selectId(undefined);
            }}
            disabled={!(structure.data ? terms.length : fallbackTerms.length)}
          >
            <SelectTrigger aria-label="Term">
              <SelectValue placeholder="Select term" />
            </SelectTrigger>
            <SelectContent>
              {structure.data
                ? terms.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.isCurrent ? `${t.label} (current)` : t.label}
                    </SelectItem>
                  ))
                : fallbackTerms.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
            </SelectContent>
          </Select>
          <Select value={selected?.id ?? ''} onValueChange={selectId} disabled={!timetables.length}>
            <SelectTrigger aria-label="Timetable">
              <SelectValue placeholder={list.isLoading ? 'Loading…' : 'No timetables for this term'} />
            </SelectTrigger>
            <SelectContent>
              {timetables.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="flex items-center gap-2">
                    <span className="truncate">{t.name}</span>
                    <TimetableStatusBadge t={t} />
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canManage && selected && (
            <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-1">
              <Button
                variant="outline"
                onClick={() => setConfirm('rebuild')}
                disabled={building || selected.status === 'ARCHIVED'}
                className="flex-1 lg:flex-none"
              >
                <RotateCw /> Rebuild
              </Button>
              {selected.status !== 'PUBLISHED' && (
                <Button
                  variant="brand"
                  onClick={() => setConfirm('publish')}
                  disabled={building || (detail?.generation ?? selected.generation) !== 'DONE'}
                  className="flex-1 lg:flex-none"
                >
                  <Rocket /> Publish
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="More timetable actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link to="/timetable/setup">
                      <Settings2 /> Timetable setup
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive disabled={selected.status === 'PUBLISHED'} onSelect={() => setConfirm('delete')}>
                    <Trash2 /> {selected.status === 'PUBLISHED' ? 'Can’t delete the live timetable' : 'Delete timetable'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </Card>

        {list.isLoading || structure.isLoading ? (
          <GridSkeleton />
        ) : list.error && !list.data ? (
          <Card>
            <ErrorState error={list.error} onRetry={() => void list.refetch()} />
          </Card>
        ) : !selected ? (
          <Card>
            <EmptyState
              icon={CalendarClock}
              title="No timetable yet"
              description={
                canManage
                  ? 'Set weekly periods for each class in Setup, then generate — the solver places every lesson without clashes in seconds.'
                  : 'Nothing has been built for this term yet. Once the school publishes a timetable, it appears here.'
              }
              action={
                canManage && (
                  <>
                    <Button asChild variant="outline">
                      <Link to="/timetable/setup">
                        <Settings2 /> Set weekly periods
                      </Link>
                    </Button>
                    <Button onClick={() => setNewOpen(true)}>
                      <Wand2 /> Generate a timetable
                    </Button>
                  </>
                )
              }
            />
          </Card>
        ) : building ? (
          <BuildingPanel lessons={detail?.report?.required ?? (lessonsToPlace || null)} state={detail?.generation ?? selected.generation} name={selected.name} />
        ) : failed ? (
          <BuildFailedPanel
            message={detail?.generationError ?? selected.generationError}
            onRetry={canManage ? rebuild : undefined}
            retrying={regenerate.isPending}
          />
        ) : detailQuery.isLoading || !detail ? (
          detailQuery.error ? (
            <Card>
              <ErrorState error={detailQuery.error} onRetry={() => void detailQuery.refetch()} />
            </Card>
          ) : (
            <GridSkeleton />
          )
        ) : (
          <div className="space-y-5">
            {detail.report && (
              <div className="print:hidden">
                <SolverReportCard report={detail.report} timetableId={detail.id} />
              </div>
            )}

            <Card className="overflow-hidden print:rounded-none print:border-0 print:shadow-none">
              <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center print:hidden">
                <div role="tablist" aria-label="View timetable" className="inline-flex h-10 items-center gap-1 rounded-xl border border-border bg-muted/60 p-1">
                  {VIEWS.map((v) => (
                    <button
                      key={v.value}
                      type="button"
                      role="tab"
                      aria-selected={view === v.value}
                      onClick={() => setPick({ ...pick, view: v.value })}
                      className={cn(
                        'inline-flex h-full flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium text-muted-foreground transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none',
                        view === v.value && 'bg-card text-foreground shadow-soft',
                      )}
                    >
                      <v.icon className="size-3.5" /> {v.label}
                    </button>
                  ))}
                </div>
                <Select value={targetId ?? ''} onValueChange={(v) => setPick({ ...pick, [view]: v })} disabled={!viewOptions.length}>
                  <SelectTrigger className="sm:max-w-xs" aria-label={view === 'class' ? 'Class' : view === 'teacher' ? 'Teacher' : 'Room'}>
                    <SelectValue placeholder={view === 'room' ? 'No rooms assigned' : 'Nothing to show'} />
                  </SelectTrigger>
                  <SelectContent>
                    {viewOptions.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
                  <TimetableStatusBadge t={detail} />
                  {lockedCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                      <Lock className="size-3" /> {plural(lockedCount, 'lesson')} locked — Rebuild keeps {lockedCount === 1 ? 'it' : 'them'}
                    </span>
                  )}
                </div>
              </div>
              {editable && (
                <p className="hidden border-b border-border bg-muted/30 px-4 py-2 text-[12px] text-muted-foreground md:block print:hidden">
                  Drag a lesson to another period, or click it to move or lock it. Green cells are free for this class and teacher.
                </p>
              )}
              <div className="p-3 print:p-0">
                {targetId ? (
                  <TimetableWeekGrid
                    detail={detail}
                    view={view}
                    targetId={targetId}
                    blocked={blocked}
                    editable={editable}
                    onMove={onMove}
                    onLock={onLock}
                    onOpenMove={setMoving}
                    printTitle={`${target?.label ?? ''} — timetable`}
                    printSubtitle={`${detail.name} · ${detail.term.name} · ${detail.term.sessionName}`}
                  />
                ) : (
                  <EmptyState compact icon={CalendarClock} title="Nothing to show" description="This timetable has no lessons for this view." />
                )}
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* One sheet per class, only mounted while printing "every class". */}
      {printAll && detail && (
        <div className="tt-print-all hidden">
          {options.class.map((c) => (
            <div key={c.id} className="print-a4">
              <TimetableWeekGrid
                detail={detail}
                view="class"
                targetId={c.id}
                editable={false}
                onMove={() => undefined}
                onLock={() => undefined}
                onOpenMove={() => undefined}
                printTitle={`${c.label} — timetable`}
                printSubtitle={`${detail.name} · ${detail.term.name} · ${detail.term.sessionName}`}
              />
            </div>
          ))}
        </div>
      )}

      {detail && (
        <MoveLessonDialog
          detail={detail}
          entry={moving}
          blocked={blocked}
          onOpenChange={(o) => !o && setMoving(null)}
          onMove={onMove}
          pending={move.isPending}
        />
      )}

      {canManage && (
        <GenerateDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          termId={termId}
          termLabel={termLabel}
          lessons={setup.data ? lessonsToPlace : null}
          existing={timetables.length}
          pending={generate.isPending}
          onSubmit={(name) => {
            if (!termId) return;
            generate.mutate(
              { termId, name: name || undefined },
              {
                onSuccess: (t) => {
                  setNewOpen(false);
                  selectId(t.id);
                  toast.message('Building your timetable…', { description: 'Usually 5–15 seconds.' });
                },
                onError: (err) => toast.error(errorMessage(err)),
              },
            );
          }}
        />
      )}

      {canManage && canAi && (
        <Sheet open={assistantOpen} onOpenChange={setAssistantOpen}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle className="font-display text-lg font-semibold tracking-tight">Timetable assistant</SheetTitle>
              <SheetDescription className="text-[13px] text-muted-foreground">
                Describe constraints in plain English. Nothing changes until you confirm.
              </SheetDescription>
            </SheetHeader>
            <SheetBody>
              <TimetableAssistant
                rebuildLabel={selected && selected.status !== 'ARCHIVED' ? `Rebuild ${selected.name}` : 'Generate a timetable'}
                onRebuild={() => {
                  setAssistantOpen(false);
                  if (selected && selected.status !== 'ARCHIVED') rebuild();
                  else setNewOpen(true);
                }}
              />
            </SheetBody>
          </SheetContent>
        </Sheet>
      )}

      <ConfirmDialog
        open={confirm === 'rebuild'}
        onOpenChange={(o) => !o && setConfirm(null)}
        destructive={false}
        title={`Rebuild ${selected?.name ?? 'timetable'}?`}
        description={
          lockedCount
            ? `The solver re-arranges every lesson except the ${plural(lockedCount, 'locked one')}, using the latest setup.`
            : 'The solver re-arranges every lesson using the latest setup. Lock lessons first if you want to keep them where they are.'
        }
        confirmLabel="Rebuild"
        loading={regenerate.isPending}
        onConfirm={rebuild}
      />
      <ConfirmDialog
        open={confirm === 'publish'}
        onOpenChange={(o) => !o && setConfirm(null)}
        destructive={false}
        title={`Publish ${selected?.name ?? 'timetable'}?`}
        description="It becomes the live timetable for this term — teachers see today’s lessons on their overview. Any previously published timetable for the term is archived."
        confirmLabel="Publish"
        loading={publish.isPending}
        onConfirm={() => selected && publish.mutate(selected.id, { onSuccess: () => setConfirm(null) })}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Delete ${selected?.name ?? 'timetable'}?`}
        description="This draft and all its lessons are removed for good."
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() =>
          selected &&
          remove.mutate(selected, {
            onSuccess: () => {
              setConfirm(null);
              selectId(undefined);
            },
          })
        }
      />
    </Page>
  );
}

// ------------------------------------------------------------------ generate dialog

function GenerateDialog({
  open,
  onOpenChange,
  termId,
  termLabel,
  lessons,
  existing,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  termId: string | undefined;
  termLabel: string | undefined;
  lessons: number | null;
  existing: number;
  pending: boolean;
  onSubmit: (name: string) => void;
}) {
  const suggested = `${termLabel?.split(' · ')[0] ?? 'Term'} timetable${existing ? ` v${existing + 1}` : ''}`;
  const [name, setName] = useState(suggested);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    // Fresh suggestion each time the dialog opens.
    setWasOpen(open);
    if (open) setName(suggested);
  }
  const noLoads = lessons === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(name.trim());
          }}
        >
          <DialogHeader>
            <div className="mb-2 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
              <Wand2 className="size-5" />
            </div>
            <DialogTitle>Generate a new timetable</DialogTitle>
            <DialogDescription>
              {termLabel ? `For ${termLabel}. ` : ''}The solver places every class’s weekly periods around teachers, rooms and blocked times. It’s saved as a draft
              until you publish.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Field label="Name" htmlFor="tt-name" hint="Handy when you compare drafts.">
              <Input id="tt-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            {!termId ? (
              <p className="rounded-xl border border-warning/30 bg-warning-soft/60 px-3.5 py-2.5 text-[12.5px]">
                Set a current term in <Link className="font-medium underline" to="/academics">Academic Setup</Link> first.
              </p>
            ) : noLoads ? (
              <p className="rounded-xl border border-warning/30 bg-warning-soft/60 px-3.5 py-2.5 text-[12.5px]">
                No weekly periods are set yet.{' '}
                <Link className="font-medium underline" to="/timetable/setup?tab=loads">
                  Set subjects & teachers
                </Link>{' '}
                for each class first.
              </p>
            ) : (
              lessons != null && (
                <p className="rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-[12.5px] text-muted-foreground">
                  <span className="font-semibold text-foreground tabular">{lessons.toLocaleString()}</span> lessons a week to place. Usually 5–15 seconds.
                </p>
              )
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} disabled={!termId || noLoads}>
              {!pending && <Wand2 />} Generate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
