import type { AttendanceCounts, AttendanceStatus, RegisterView } from '@aischool/shared';
import { CheckCheck, ClipboardList, Keyboard, Lock, Save, Sun, Undo2, Users } from 'lucide-react';
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Kbd, modKey } from '@/components/ui/kbd';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRelative, todayIso } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useRegister, useSaveRegister } from './api';
import { useClassOptions } from './classes';
import { clockTime, DateStepper, longDate, MARK_ORDER, plural, RateChip, STATUS_META } from './ui';

interface Props {
  classArmId: string | undefined;
  date: string | undefined;
  onChange: (next: { classArmId?: string; date?: string }) => void;
}

export function RegisterTab({ classArmId, date, onChange }: Props) {
  const { options, mine, loading } = useClassOptions();
  const selected = classArmId && options.some((o) => o.id === classArmId) ? classArmId : classArmId && loading ? classArmId : (mine ?? options[0]?.id);
  const query = useRegister(selected, date);
  const view = query.data;

  // Unsaved-changes guard when switching class or date.
  const dirty = useRef(false);
  const onDirty = useCallback((d: boolean) => {
    dirty.current = d;
  }, []);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const guard = (fn: () => void) => (dirty.current ? setPending(() => fn) : fn());

  const value = date ?? view?.date ?? todayIso();

  return (
    <div className="space-y-4">
      <Card className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_260px]">
        <Select value={selected ?? ''} onValueChange={(v) => guard(() => onChange({ classArmId: v, date }))} disabled={!options.length}>
          <SelectTrigger aria-label="Class">
            <SelectValue placeholder={loading ? 'Loading classes…' : 'No classes set up'} />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
                {o.id === mine ? ' · your class' : o.teacher ? ` · ${o.teacher}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateStepper value={value} max={todayIso()} onChange={(v) => guard(() => onChange({ classArmId: selected, date: v === todayIso() ? undefined : v }))} />
      </Card>

      {!selected ? (
        loading ? (
          <RegisterSkeleton />
        ) : (
          <Card>
            <EmptyState icon={Users} title="No classes yet" description="Add class arms in Academic Setup and enrol students to take registers." />
          </Card>
        )
      ) : query.error && !view ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Card>
      ) : !view ? (
        <RegisterSkeleton />
      ) : !view.schoolDay ? (
        <Card>
          <EmptyState icon={Sun} title="Not a school day" description={view.readOnlyReason ?? `${view.dayName} isn’t a school day — pick another date.`} />
        </Card>
      ) : view.students.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title="No learners in this class" description="Enrol students into this class to take its register." />
        </Card>
      ) : (
        <RegisterSheet key={`${view.classArm.id}:${view.date}:${view.takenAt ?? 'new'}`} view={view} onDirtyChange={onDirty} />
      )}

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title="Discard unsaved marks?"
        description="You’ve marked learners on this register but haven’t saved. Leaving now loses those marks."
        confirmLabel="Discard"
        onConfirm={() => {
          dirty.current = false;
          pending?.();
          setPending(null);
        }}
      />
    </div>
  );
}

function RegisterSkeleton() {
  return (
    <Card className="overflow-hidden" aria-busy>
      <div className="space-y-2 border-b border-border p-5">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-3.5 w-72" />
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-0">
          <Skeleton className="h-4 w-6" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-9 w-40 rounded-lg" />
        </div>
      ))}
    </Card>
  );
}

// ------------------------------------------------------------------ the sheet

interface Mark {
  status: AttendanceStatus;
  note: string;
  /** Pre-filled "present" nobody has confirmed yet. */
  defaulted: boolean;
}

function initialMarks(view: RegisterView): Record<string, Mark> {
  const out: Record<string, Mark> = {};
  for (const s of view.students) {
    out[s.id] = s.status ? { status: s.status, note: s.note ?? '', defaulted: false } : { status: 'PRESENT', note: '', defaulted: true };
  }
  return out;
}

function countMarks(marks: Record<string, Mark>): AttendanceCounts {
  const c: AttendanceCounts = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const m of Object.values(marks)) {
    if (m.status === 'PRESENT') c.present++;
    else if (m.status === 'ABSENT') c.absent++;
    else if (m.status === 'LATE') c.late++;
    else c.excused++;
  }
  return c;
}

const KEY_TO_STATUS: Record<string, AttendanceStatus> = { p: 'PRESENT', l: 'LATE', a: 'ABSENT', e: 'EXCUSED' };

function RegisterSheet({ view, onDirtyChange }: { view: RegisterView; onDirtyChange: (dirty: boolean) => void }) {
  const [marks, setMarks] = useState<Record<string, Mark>>(() => initialMarks(view));
  const save = useSaveRegister();
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const editable = view.canEdit;

  const dirty = useMemo(() => {
    if (!view.taken) return true;
    return view.students.some((s) => {
      const m = marks[s.id];
      return !m || m.defaulted || m.status !== s.status || (m.note.trim() || null) !== (s.note ?? null);
    });
  }, [marks, view]);
  const hasDefaults = Object.values(marks).some((m) => m.defaulted);
  const changed = useMemo(
    () => view.students.filter((s) => s.status && (marks[s.id]?.status !== s.status || (marks[s.id]?.note.trim() || null) !== (s.note ?? null))).length,
    [marks, view],
  );

  // Only real work counts as unsaved: untouched defaults on a new register lose nothing.
  const unsaved = editable && (view.taken ? dirty : Object.values(marks).some((m) => !m.defaulted));
  useEffect(() => onDirtyChange(unsaved), [unsaved, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const counts = countMarks(marks);

  const setStatus = (id: string, status: AttendanceStatus) =>
    setMarks((prev) => ({ ...prev, [id]: { ...prev[id], status, defaulted: false } }));
  const setNote = (id: string, note: string) => setMarks((prev) => ({ ...prev, [id]: { ...prev[id], note } }));
  const markAllPresent = () =>
    setMarks((prev) => Object.fromEntries(Object.entries(prev).map(([id, m]) => [id, { ...m, status: 'PRESENT' as const, defaulted: false }])));
  const reset = () => setMarks(initialMarks(view));

  const focusRow = (i: number) => {
    const el = rows.current[Math.max(0, Math.min(view.students.length - 1, i))];
    el?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus();
  };

  const submit = () => {
    if (!editable || save.isPending) return;
    save.mutate(
      {
        classArmId: view.classArm.id,
        date: view.date,
        marks: view.students.map((s) => ({ studentId: s.id, status: marks[s.id].status, note: marks[s.id].note.trim() || undefined })),
      },
      {
        onSuccess: () =>
          toast.success(`${view.classArm.levelName} ${view.classArm.name} register saved`, {
            description: `${counts.present} present · ${counts.late} late · ${counts.absent} absent · ${counts.excused} excused`,
          }),
      },
    );
  };

  const onRowKey = (e: KeyboardEvent<HTMLDivElement>, index: number, id: string) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        focusRow(e.key === 'Enter' ? index + 1 : index);
      }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const status = KEY_TO_STATUS[e.key.toLowerCase()];
    if (status && editable) {
      e.preventDefault();
      setStatus(id, status);
      // Present moves on; other marks stay so a note can be added.
      if (status === 'PRESENT') requestAnimationFrame(() => focusRow(index + 1));
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusRow(index + (e.key === 'ArrowDown' ? 1 : -1));
      return;
    }
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && editable) {
      e.preventDefault();
      const cur = MARK_ORDER.indexOf(marks[id].status);
      const next = MARK_ORDER[(cur + (e.key === 'ArrowRight' ? 1 : MARK_ORDER.length - 1)) % MARK_ORDER.length];
      setStatus(id, next);
    }
  };

  // ⌘/Ctrl+S saves.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <Card className="relative">
      {/* ------------------------------------------------ header */}
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-semibold tracking-tight">
            {view.classArm.levelName} {view.classArm.name}
            <span className="ml-2 text-[13px] font-normal text-muted-foreground">{longDate(view.date)}</span>
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {view.classArm.classTeacher ? `Class teacher: ${view.classArm.classTeacher}` : 'No class teacher assigned'} ·{' '}
            {view.taken ? (
              <span>
                Taken{view.takenBy ? ` by ${view.takenBy}` : ''}
                {view.takenAt && (
                  <>
                    {' '}
                    at {clockTime(view.takenAt)} <span className="text-muted-foreground/70">({formatRelative(view.takenAt)})</span>
                  </>
                )}
              </span>
            ) : (
              <span className="font-medium text-warning">Not taken yet</span>
            )}
          </p>
        </div>
        {editable && (
          <div className="flex flex-wrap items-center gap-2">
            {(changed > 0 || (!view.taken && !hasDefaults)) && (
              <Button variant="ghost" size="sm" onClick={reset}>
                <Undo2 /> Reset
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={markAllPresent}>
              <CheckCheck /> Mark all present
            </Button>
          </div>
        )}
      </div>

      {!editable && view.readOnlyReason && (
        <div className="flex items-start gap-2.5 border-b border-border bg-muted/50 px-4 py-3 text-[13px] sm:px-5" role="status">
          <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            <span className="font-medium">Read-only.</span> <span className="text-muted-foreground">{view.readOnlyReason}</span>
          </span>
        </div>
      )}
      {editable && hasDefaults && (
        <div className="flex items-start gap-2.5 border-b border-border bg-brand-soft/40 px-4 py-3 text-[13px] sm:px-5" role="status">
          <ClipboardList className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
          <span className="text-foreground/90">
            Everyone starts as <span className="font-semibold text-success">present</span> (shown faded until saved). Change anyone who isn’t here, then save.
          </span>
        </div>
      )}

      {/* ------------------------------------------------ rows */}
      <div className="hidden items-center gap-3 border-b border-border bg-muted/40 px-5 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:flex">
        <span className="w-6 text-right">#</span>
        <span className="flex-1">Learner</span>
        <span className="w-[188px] text-center">Mark</span>
      </div>
      <div role="list" aria-label="Register">
        {view.students.map((s, i) => {
          const m = marks[s.id];
          const showNote = m.status !== 'PRESENT' || !!m.note;
          return (
            <div
              key={s.id}
              role="listitem"
              ref={(el) => {
                rows.current[i] = el;
              }}
              onKeyDown={(e) => onRowKey(e, i, s.id)}
              className={cn(
                'group border-b border-border px-4 py-2.5 transition-colors last:border-0 focus-within:bg-muted/50 sm:px-5',
                m.status === 'ABSENT' && !m.defaulted && 'bg-danger-soft/25',
                m.status === 'LATE' && 'bg-warning-soft/25',
              )}
            >
              <div className="flex items-center gap-3">
                <span className="hidden w-6 shrink-0 text-right text-[12px] tabular text-muted-foreground sm:block">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium">{s.name}</span>
                    <RateChip rate={s.termRate} title="Term attendance so far" />
                  </div>
                  <span className="font-mono text-[11.5px] text-muted-foreground">{s.admissionNumber}</span>
                </div>
                <Segmented
                  name={s.name}
                  value={m.status}
                  defaulted={m.defaulted}
                  disabled={!editable}
                  onChange={(st) => setStatus(s.id, st)}
                />
              </div>
              {showNote && (
                <div className="mt-2 sm:ml-9">
                  <input
                    value={m.note}
                    disabled={!editable}
                    maxLength={200}
                    onChange={(e) => setNote(s.id, e.target.value)}
                    placeholder={m.status === 'LATE' ? 'Arrived at… (optional)' : m.status === 'EXCUSED' ? 'Reason, e.g. hospital appointment (optional)' : 'Note (optional)'}
                    aria-label={`Note for ${s.name}`}
                    className="h-9 w-full rounded-lg border border-input bg-card px-3 text-[13px] shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15 disabled:opacity-60 sm:h-8 sm:max-w-md"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ------------------------------------------------ sticky footer */}
      <div className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-b-2xl border-t border-border bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex flex-wrap items-center gap-1.5" aria-live="polite">
          {MARK_ORDER.map((st) => {
            const n = counts[st.toLowerCase() as keyof AttendanceCounts];
            return (
              <span key={st} className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium', STATUS_META[st].soft)}>
                <span className="font-bold tabular">{n}</span> {STATUS_META[st].label}
              </span>
            );
          })}
          <span className="ml-1 text-[12px] text-muted-foreground">of {plural(view.students.length, 'learner')}</span>
        </div>
        {editable && (
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1 text-[11.5px] text-muted-foreground lg:flex">
              <Keyboard className="size-3.5" aria-hidden /> <Kbd>P</Kbd>
              <Kbd>L</Kbd>
              <Kbd>A</Kbd>
              <Kbd>E</Kbd> mark · <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> move · <Kbd>{modKey}</Kbd>
              <Kbd>S</Kbd> save
            </span>
            {view.taken && dirty && changed > 0 && (
              <Badge variant="warning" dot>
                {plural(changed, 'change')}
              </Badge>
            )}
            <Button onClick={submit} loading={save.isPending} disabled={view.taken && !dirty} className="h-11 flex-1 sm:h-9 sm:flex-none">
              {!save.isPending && <Save />} {view.taken ? (dirty ? 'Save changes' : 'Saved') : 'Save register'}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ segmented control

function Segmented({
  name,
  value,
  defaulted,
  disabled,
  onChange,
}: {
  name: string;
  value: AttendanceStatus;
  defaulted: boolean;
  disabled: boolean;
  onChange: (s: AttendanceStatus) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`Attendance for ${name}`}
      aria-disabled={disabled || undefined}
      aria-keyshortcuts="P L A E"
      className="flex shrink-0 items-center gap-1 rounded-xl border border-border bg-muted/50 p-1"
    >
      {MARK_ORDER.map((st) => {
        const meta = STATUS_META[st];
        const checked = value === st;
        return (
          <button
            key={st}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={meta.label}
            title={`${meta.label} (${meta.letter})`}
            tabIndex={checked ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(st)}
            className={cn(
              'grid size-10 place-items-center rounded-lg text-[13px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed sm:h-8 sm:w-11',
              checked ? cn(meta.fill, 'shadow-soft', defaulted && 'opacity-45') : 'text-muted-foreground hover:bg-card hover:text-foreground',
              disabled && !checked && 'opacity-40 hover:bg-transparent',
            )}
          >
            {meta.letter}
          </button>
        );
      })}
    </div>
  );
}
