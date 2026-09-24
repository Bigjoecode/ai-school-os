import { gradeFor, rank, round1, type ScoreSheet } from '@aischool/shared';
import { AlertTriangle, ClipboardList, Lock, RotateCcw, Save } from 'lucide-react';
import type * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker } from 'react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { useMediaQuery } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { useSaveScores, useScoreSheet } from '../assessment/api';
import { fmtPct, fmtScore, StatTile } from '../assessment/ui';

type Student = ScoreSheet['students'][number];

interface Props {
  classArmId: string;
  subjectId: string;
  termId: string;
  onDirtyChange: (dirty: boolean) => void;
}

const cellKey = (studentId: string, comp: string) => `${studentId}:${comp}`;

/** Parse an input: '' → null; returns undefined for junk. */
function parseScore(raw: string): number | null | undefined {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export function ScoreEntry({ classArmId, subjectId, termId, onDirtyChange }: Props) {
  const key = { classArmId, subjectId, termId };
  const sheet = useScoreSheet(key);
  const save = useSaveScores();
  const canEnter = useCan('results.enter');
  const wide = useMediaQuery('(min-width: 768px)');

  const [edits, setEdits] = useState<Record<string, string>>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const gridRef = useRef<HTMLDivElement>(null);

  // Fresh sheet → drop local edits.
  useEffect(() => {
    setEdits({});
    setServerErrors({});
  }, [classArmId, subjectId, termId]);

  const data = sheet.data;
  const editable = !!data?.canEdit && canEnter;
  const components = useMemo(() => data?.components ?? [], [data]);
  const scale = data?.gradingScale;

  const original = (s: Student, comp: string) => s.scores[comp] ?? null;

  // ---- live computation
  const live = useMemo(() => {
    if (!data) return null;
    const errors: Record<string, string> = { ...serverErrors };
    const dirty: { studentId: string; componentKey: string; score: number | null }[] = [];
    const values = data.students.map((s) =>
      Object.fromEntries(
        components.map((c) => {
          const k = cellKey(s.id, c.key);
          if (!(k in edits)) return [c.key, original(s, c.key)];
          const parsed = parseScore(edits[k]);
          if (parsed === undefined) {
            errors[k] = 'Enter a number';
            return [c.key, original(s, c.key)];
          }
          if (parsed !== null && (parsed < 0 || parsed > c.maxScore)) {
            errors[k] = `Between 0 and ${c.maxScore}`;
            return [c.key, original(s, c.key)];
          }
          if (parsed !== original(s, c.key)) dirty.push({ studentId: s.id, componentKey: c.key, score: parsed });
          return [c.key, parsed];
        }),
      ) as Record<string, number | null>,
    );
    const assessed = components.filter((c) => values.some((v) => v[c.key] != null));
    const outOf = assessed.reduce((n, c) => n + c.maxScore, 0);
    const totals = values.map((v) => (assessed.some((c) => v[c.key] != null) ? round1(assessed.reduce((n, c) => n + (v[c.key] ?? 0), 0)) : null));
    const percents = totals.map((t) => (t == null || outOf === 0 ? null : round1((t / outOf) * 100)));
    const positions = rank(percents);
    const grades = percents.map((p) => (p == null ? null : gradeFor(p, scale).grade));
    const present = percents.filter((p): p is number => p != null);
    const stats = {
      average: present.length ? round1(present.reduce((a, b) => a + b, 0) / present.length) : null,
      highest: present.length ? Math.max(...present) : null,
      lowest: present.length ? Math.min(...present) : null,
      marked: present.length,
      complete: values.filter((v) => components.every((c) => v[c.key] != null)).length,
    };
    return { values, assessed, outOf, totals, percents, positions, grades, errors, dirty, stats };
  }, [data, edits, serverErrors, components, scale]);

  const dirtyCount = live?.dirty.length ?? 0;
  const errorCount = Object.keys(live?.errors ?? {}).length;
  const isDirty = dirtyCount > 0 || Object.keys(edits).some((k) => !!live?.errors[k]);

  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange]);

  // ---- unsaved-changes guard
  const blocker = useBlocker(({ currentLocation, nextLocation }) => isDirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!isDirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [isDirty]);

  const setCell = (studentId: string, comp: string, raw: string) => {
    const k = cellKey(studentId, comp);
    setEdits((prev) => ({ ...prev, [k]: raw }));
    if (serverErrors[k]) {
      setServerErrors((prev) => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
    }
  };

  const onSave = () => {
    if (!live || !data) return;
    if (errorCount > 0) {
      toast.error(`Fix ${errorCount} ${errorCount === 1 ? 'mark' : 'marks'} outlined in red first`);
      return;
    }
    if (!live.dirty.length) return;
    const entries = live.dirty;
    save.mutate(
      { classArmId, subjectId, termId, entries },
      {
        onSuccess: () => {
          setEdits({});
          setServerErrors({});
          toast.success(`Saved ${entries.length} ${entries.length === 1 ? 'mark' : 'marks'}`);
        },
        onError: (err) => {
          if (err instanceof ApiError && err.errors.length) {
            const next: Record<string, string> = {};
            for (const e of err.errors) {
              const m = /^entries\.(\d+)/.exec(e.path);
              const entry = m ? entries[Number(m[1])] : undefined;
              if (entry) next[cellKey(entry.studentId, entry.componentKey)] = e.message;
            }
            setServerErrors(next);
            toast.error(err.message);
          } else {
            toast.error(err.message);
          }
        },
      },
    );
  };

  // ---- keyboard navigation (Enter/↓ down, ↑ up; Tab moves across natively)
  const focusCell = (row: number, col: number) => {
    const el = gridRef.current?.querySelector<HTMLInputElement>(`[data-cell="${row}-${col}"]`);
    if (el) {
      el.focus();
      el.select();
    }
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusCell(e.shiftKey && e.key === 'Enter' ? row - 1 : row + 1, col);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusCell(row - 1, col);
    } else if (e.key === 'Escape') {
      const s = data?.students[row];
      const c = components[col];
      if (s && c) {
        setEdits((prev) => {
          const next = { ...prev };
          delete next[cellKey(s.id, c.key)];
          return next;
        });
      }
    }
  };

  if (sheet.isLoading) return <GridSkeleton />;
  if (!data || !live) {
    return (
      <Card>
        <ErrorState error={sheet.error} onRetry={() => void sheet.refetch()} />
      </Card>
    );
  }
  if (data.students.length === 0) {
    return (
      <Card>
        <EmptyState icon={ClipboardList} title="No students in this class" description="Enrol students into this class arm to start entering marks." />
      </Card>
    );
  }

  const cellValue = (s: Student, comp: string) => {
    const k = cellKey(s.id, comp);
    if (k in edits) return edits[k];
    const v = original(s, comp);
    return v == null ? '' : String(v);
  };

  const input = (s: Student, rowIndex: number, colIndex: number, max: number, comp: string, className?: string) => {
    const k = cellKey(s.id, comp);
    const err = live.errors[k];
    const changed = live.dirty.some((d) => d.studentId === s.id && d.componentKey === comp);
    const name = components[colIndex]?.name ?? comp;
    return (
      <div className="relative">
        <input
          data-cell={`${rowIndex}-${colIndex}`}
          inputMode="decimal"
          autoComplete="off"
          aria-label={`${name} for ${s.name}, out of ${max}`}
          aria-invalid={!!err || undefined}
          title={err}
          value={cellValue(s, comp)}
          onChange={(e) => setCell(s.id, comp, e.target.value)}
          onKeyDown={(e) => onKeyDown(e, rowIndex, colIndex)}
          onFocus={(e) => e.currentTarget.select()}
          placeholder="—"
          className={cn(
            'peer h-9 w-full min-w-[64px] rounded-lg border bg-card px-2 text-center text-[13.5px] tabular shadow-xs outline-none transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground/50 hover:border-border-strong focus:border-ring focus:ring-4 focus:ring-ring/15',
            changed ? 'border-brand/50 bg-brand-soft/40' : 'border-input',
            err && 'border-danger bg-danger-soft/40 focus:border-danger focus:ring-danger/15',
            className,
          )}
        />
        {err && (
          <span
            role="alert"
            className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-danger px-2 py-1 text-[11px] font-medium text-white shadow-pop peer-focus:block"
          >
            {err}
          </span>
        )}
      </div>
    );
  };

  const totalCell = (i: number) =>
    live.totals[i] == null ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      <span className="whitespace-nowrap">
        <span className="font-semibold">{fmtScore(live.totals[i])}</span>
        <span className="text-muted-foreground"> / {live.outOf}</span>
        <span className="ml-1.5 text-[11.5px] text-muted-foreground">{fmtPct(live.percents[i])}</span>
      </span>
    );

  const gradeCell = (i: number) => {
    const g = live.grades[i];
    if (!g) return <span className="text-muted-foreground">—</span>;
    const pass = scale ? gradeFor(live.percents[i] ?? 0, scale).pass : true;
    return <Badge variant={pass ? 'success' : 'danger'}>{g}</Badge>;
  };

  const readOnlyValue = (v: number | null) => <span className={cn('tabular', v == null && 'text-muted-foreground')}>{fmtScore(v)}</span>;

  return (
    <div className="space-y-4">
      {!editable && (
        <div role="note" className="flex items-start gap-3 rounded-2xl border border-border bg-muted/50 p-4 text-[13px]">
          <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p>
            <span className="font-medium">View only.</span>{' '}
            <span className="text-muted-foreground">
              {canEnter
                ? `Only the teacher who takes ${data.subject.name} in ${data.classArm.levelName} ${data.classArm.name} (or an administrator) can enter these marks.`
                : 'Your role can view results but not enter marks.'}
            </span>
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Class average" value={fmtPct(live.stats.average)} sub={live.outOf ? `of ${live.outOf} marks assessed` : 'Nothing assessed yet'} />
        <StatTile label="Highest" value={fmtPct(live.stats.highest)} tone="success" />
        <StatTile label="Lowest" value={fmtPct(live.stats.lowest)} tone={live.stats.lowest != null && live.stats.lowest < 40 ? 'danger' : undefined} />
        <StatTile label="Marked" value={`${live.stats.marked} / ${data.students.length}`} sub={`${live.stats.complete} with every component`} />
      </div>

      <Card className="overflow-hidden">
        {wide ? (
          <div ref={gridRef} className="scrollbar-thin overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-muted/50">
                <tr className="border-b border-border">
                  <th scope="col" className="w-10 px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    #
                  </th>
                  <th scope="col" className="sticky left-0 z-10 min-w-[200px] bg-muted px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Student
                  </th>
                  {components.map((c) => (
                    <th key={c.key} scope="col" className="min-w-[88px] px-2 py-2.5 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {c.name} <span className="font-normal normal-case text-muted-foreground/80">/{c.maxScore}</span>
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Total
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Grade
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Pos.
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((s, i) => (
                  <tr key={s.id} className="group border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-1.5 text-[12px] tabular text-muted-foreground">{i + 1}</td>
                    <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-1.5 text-left font-normal group-hover:bg-muted">
                      <p className="truncate font-medium">{s.name}</p>
                      <p className="text-[11.5px] tabular text-muted-foreground">{s.admissionNumber}</p>
                    </th>
                    {components.map((c, ci) => (
                      <td key={c.key} className="px-2 py-1.5">
                        {editable ? input(s, i, ci, c.maxScore, c.key) : <div className="text-center">{readOnlyValue(live.values[i][c.key])}</div>}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 tabular">{totalCell(i)}</td>
                    <td className="px-3 py-1.5 text-center">{gradeCell(i)}</td>
                    <td className="px-3 py-1.5 text-center font-medium tabular">{live.positions[i] ?? <span className="text-muted-foreground">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div ref={gridRef}>
          <ul className="divide-y divide-border">
            {data.students.map((s, i) => (
              <li key={s.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.name}</p>
                    <p className="text-[11.5px] tabular text-muted-foreground">{s.admissionNumber}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-[12.5px] tabular">
                    {totalCell(i)} {gradeCell(i)}
                    {live.positions[i] != null && <span className="text-muted-foreground">#{live.positions[i]}</span>}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {components.map((c, ci) => (
                    <label key={c.key} className="block">
                      <span className="mb-1 block truncate text-[11px] font-medium text-muted-foreground">
                        {c.name} /{c.maxScore}
                      </span>
                      {editable ? input(s, i, ci, c.maxScore, c.key) : <div className="h-9 rounded-lg bg-muted/50 py-2 text-center">{readOnlyValue(live.values[i][c.key])}</div>}
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          </div>
        )}
      </Card>

      {editable && (
        <div
          className={cn(
            'sticky bottom-3 z-20 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 shadow-pop transition-colors glass',
            isDirty ? 'border-brand/40' : 'border-border',
          )}
        >
          <p className="min-w-0 flex-1 text-[13px]">
            {errorCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-danger">
                <AlertTriangle className="size-4" /> {errorCount} {errorCount === 1 ? 'mark needs' : 'marks need'} fixing
              </span>
            ) : dirtyCount > 0 ? (
              <span className="inline-flex items-center gap-2 font-medium">
                <span className="size-2 rounded-full bg-brand" aria-hidden /> {dirtyCount} unsaved {dirtyCount === 1 ? 'change' : 'changes'}
              </span>
            ) : (
              <span className="text-muted-foreground">All marks saved. Enter or ↓ moves down, Tab moves across.</span>
            )}
          </p>
          {isDirty && (
            <Button variant="ghost" size="sm" onClick={() => { setEdits({}); setServerErrors({}); }}>
              <RotateCcw /> Discard
            </Button>
          )}
          <Button size="sm" onClick={onSave} loading={save.isPending} disabled={!dirtyCount}>
            {!save.isPending && <Save />} Save marks
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(o) => !o && blocker.state === 'blocked' && blocker.reset()}
        title="Leave without saving?"
        description={`You have ${dirtyCount} unsaved ${dirtyCount === 1 ? 'mark' : 'marks'}. They’ll be lost if you leave.`}
        confirmLabel="Leave"
        onConfirm={() => blocker.state === 'blocked' && blocker.proceed()}
      />
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[68px] rounded-xl" />
        ))}
      </div>
      <Card className="divide-y divide-border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="h-4 w-40" />
            <div className="ml-auto flex gap-2">
              {Array.from({ length: 4 }).map((__, j) => (
                <Skeleton key={j} className="h-8 w-16" />
              ))}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
