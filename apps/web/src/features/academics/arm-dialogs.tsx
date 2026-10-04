import type { AcademicStructure } from '@aischool/shared';
import { AlertTriangle, CheckCircle2, CircleDashed, GitMerge, Loader2, XCircle } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ApiError, errorMessage } from '@/lib/api';
import { classLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { plural } from '../finance/ui';
import { useDeleteArm, useMergeArm, useUpdateArm } from './api';

type Level = AcademicStructure['classLevels'][number];
type Arm = Level['arms'][number];

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** "JSS 1 A", or "JSS 1" for a level taught as one class. */
export const armLabel = (level: Pick<Level, 'name'>, arm: Pick<Arm, 'name'>) => classLabel(level.name, arm.name);

const DialogIcon = ({ tone, children }: { tone: 'brand' | 'danger'; children: ReactNode }) => (
  <div className={cn('mb-2 grid size-10 place-items-center rounded-xl [&_svg]:size-5', tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand')}>
    {children}
  </div>
);

function WhatMoves({ from }: { from: string }) {
  return (
    <ul className="grid gap-1.5 rounded-xl border border-border bg-muted/30 px-4 py-3 text-[13px] text-muted-foreground">
      <li>
        <span className="font-medium text-foreground">Moves across:</span> {from}’s students, scores, report cards, attendance, homework, live classes and
        lesson plans, plus any subjects the other class doesn’t have yet.
      </li>
      <li>
        <span className="font-medium text-foreground">Removed:</span> {from}’s timetable periods (regenerate the timetable afterwards), then {from} itself.
      </li>
      <li>
        <span className="font-medium text-foreground">Class teacher:</span> kept if the other class has one; otherwise {from}’s class teacher carries over.
      </li>
    </ul>
  );
}

// ------------------------------------------------------------------ delete

/** Deletes an empty arm; when it's in use, explains why and offers to merge it instead. */
export function DeleteArmDialog({ open, onOpenChange, level, arm, onMerge }: DialogProps & { level?: Level; arm?: Arm; onMerge: () => void }) {
  const del = useDeleteArm();
  const [blocked, setBlocked] = useState<string | null>(null);
  useEffect(() => {
    if (open) setBlocked(null);
  }, [open]);
  const label = level && arm ? armLabel(level, arm) : 'this class';
  const canMerge = !!level && level.arms.length > 1;

  const confirm = () => {
    if (!arm) return;
    del.mutate(arm.id, {
      onSuccess: () => {
        toast.success(`${label} deleted`);
        onOpenChange(false);
      },
      onError: (err) => {
        if (err instanceof ApiError && err.status === 409) setBlocked(err.message);
        else toast.error(err.message);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogIcon tone="danger">
            <AlertTriangle />
          </DialogIcon>
          <DialogTitle>Delete {label}?</DialogTitle>
          <DialogDescription>
            This can’t be undone. A class with students, scores, report cards or attendance can’t be deleted — merge it into another class instead.
          </DialogDescription>
        </DialogHeader>
        {blocked && (
          <div role="alert" className="mx-6 flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-soft px-3.5 py-3 text-[13px]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <p className="min-w-0">{blocked}</p>
          </div>
        )}
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {blocked ? (
            <Button onClick={onMerge}>
              <GitMerge /> Merge into another class
            </Button>
          ) : (
            <>
              {canMerge && (
                <Button variant="outline" onClick={onMerge}>
                  <GitMerge /> Merge instead
                </Button>
              )}
              <Button variant="destructive" loading={del.isPending} onClick={confirm}>
                Delete
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ merge

/** Merges one arm into another class, other arms of the same level first. */
export function MergeArmDialog({ open, onOpenChange, structure, level, arm }: DialogProps & { structure?: AcademicStructure; level?: Level; arm?: Arm }) {
  const navigate = useNavigate();
  const merge = useMergeArm();
  const levels = [...(structure?.classLevels ?? [])].sort((a, b) => a.order - b.order);
  const sameLevel = level ? level.arms.filter((a) => a.id !== arm?.id) : [];
  const otherLevels = levels.filter((l) => l.id !== level?.id && l.arms.length > 0);
  const [intoId, setIntoId] = useState('');
  useEffect(() => {
    if (open) setIntoId(sameLevel[0]?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, arm?.id]);

  const from = level && arm ? armLabel(level, arm) : 'this class';
  const intoLevel = levels.find((l) => l.arms.some((a) => a.id === intoId));
  const into = intoLevel?.arms.find((a) => a.id === intoId);
  const intoName = intoLevel && into ? armLabel(intoLevel, into) : null;
  const crossLevel = !!intoLevel && intoLevel.id !== level?.id;

  const confirm = () => {
    if (!arm || !intoId) return;
    merge.mutate(
      { id: arm.id, intoId },
      {
        onSuccess: (r) => {
          const periods = r.timetablePeriodsRemoved;
          toast.success(`Merged ${from} into ${r.into.name}`, {
            description: `${plural(r.students, 'student')} and ${plural(r.scores, 'score')} moved.${periods ? ` ${plural(periods, 'timetable period')} removed — regenerate the timetable.` : ''}`,
            duration: periods ? 10_000 : undefined,
            action: periods ? { label: 'Timetable', onClick: () => void navigate('/timetable/setup') } : undefined,
          });
          onOpenChange(false);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !merge.isPending && onOpenChange(o)}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogIcon tone="brand">
            <GitMerge />
          </DialogIcon>
          <DialogTitle>Merge {from} into another class</DialogTitle>
          <DialogDescription>Nothing is lost: everything in {from} moves to the class you choose, then {from} is removed.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <Field label="Merge into" htmlFor="mg-into">
            <Select value={intoId || undefined} onValueChange={setIntoId}>
              <SelectTrigger id="mg-into">
                <SelectValue placeholder="Choose a class" />
              </SelectTrigger>
              <SelectContent>
                {sameLevel.length > 0 && level && (
                  <SelectGroup>
                    <SelectLabel>{level.name}</SelectLabel>
                    {sameLevel.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {armLabel(level, a)} · {plural(a.studentCount, 'student')}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {otherLevels.map((l) => (
                  <SelectGroup key={l.id}>
                    <SelectLabel>{l.name}</SelectLabel>
                    {l.arms.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {armLabel(l, a)} · {plural(a.studentCount, 'student')}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {crossLevel && intoName && (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft px-3.5 py-3 text-[13px]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <span className="min-w-0">
                {intoName} is in a different level, so {from}’s students would move to {intoLevel?.name}. Usually you want another arm of {level?.name}.
              </span>
            </p>
          )}
          <WhatMoves from={from} />
          {arm && arm.studentCount > 0 && intoName && (
            <p className="text-[13px] text-muted-foreground">
              {plural(arm.studentCount, 'student')} will join {intoName}
              {into ? `, making ${plural(into.studentCount + arm.studentCount, 'student')}` : ''}
              {into?.capacity && into.studentCount + arm.studentCount > into.capacity ? ` (over its capacity of ${into.capacity})` : ''}.
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={merge.isPending}>
            Cancel
          </Button>
          <Button onClick={confirm} loading={merge.isPending} disabled={!intoId}>
            {intoName ? `Merge into ${intoName}` : 'Merge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ make one class

type Step = { key: string; label: string; status: 'pending' | 'running' | 'done' | 'error'; detail?: string };

/**
 * Turns a level with several arms into one class with no arm: the arms not
 * kept are merged into the kept one, one at a time, then it loses its name.
 */
export function MakeOneClassDialog({ open, onOpenChange, level }: DialogProps & { level?: Level }) {
  const navigate = useNavigate();
  const merge = useMergeArm();
  const rename = useUpdateArm();
  const arms = level?.arms ?? [];
  const [keepId, setKeepId] = useState('');
  const [phase, setPhase] = useState<'choose' | 'running' | 'done' | 'failed'>('choose');
  const [steps, setSteps] = useState<Step[]>([]);
  const [totals, setTotals] = useState({ students: 0, periods: 0 });

  useEffect(() => {
    if (!open) return;
    // Keep the biggest class by default; its students don't move.
    const biggest = [...arms].sort((a, b) => b.studentCount - a.studentCount)[0];
    setKeepId(biggest?.id ?? '');
    setPhase('choose');
    setSteps([]);
    setTotals({ students: 0, periods: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, level?.id]);

  if (!level) return null;
  const keep = arms.find((a) => a.id === keepId);
  const others = arms.filter((a) => a.id !== keepId);
  const running = phase === 'running';

  const run = async () => {
    if (!keep) return;
    const plan: Step[] = [
      ...others.map((a) => ({ key: a.id, label: `Merge ${armLabel(level, a)} into ${armLabel(level, keep)}`, status: 'pending' as const })),
      ...(keep.name ? [{ key: 'rename', label: `Rename ${armLabel(level, keep)} to ${level.name}`, status: 'pending' as const }] : []),
    ];
    const set = (key: string, patch: Partial<Step>) => setSteps((s) => s.map((x) => (x.key === key ? { ...x, ...patch } : x)));
    setSteps(plan);
    setPhase('running');
    let students = 0;
    let periods = 0;
    for (const step of plan) {
      set(step.key, { status: 'running' });
      try {
        if (step.key === 'rename') {
          await rename.mutateAsync({ id: keep.id, name: '' });
          set(step.key, { status: 'done' });
        } else {
          const r = await merge.mutateAsync({ id: step.key, intoId: keep.id });
          students += r.students;
          periods += r.timetablePeriodsRemoved;
          setTotals({ students, periods });
          set(step.key, {
            status: 'done',
            detail: `${plural(r.students, 'student')} moved${r.timetablePeriodsRemoved ? ` · ${plural(r.timetablePeriodsRemoved, 'timetable period')} removed` : ''}`,
          });
        }
      } catch (err) {
        set(step.key, { status: 'error', detail: errorMessage(err) });
        setPhase('failed');
        return;
      }
    }
    setPhase('done');
    toast.success(`${level.name} is now one class`, {
      description: `${plural(students, 'student')} moved.${periods ? ` ${plural(periods, 'timetable period')} removed — regenerate the timetable.` : ''}`,
    });
  };

  const doneCount = steps.filter((s) => s.status === 'done').length;

  return (
    <Dialog open={open} onOpenChange={(o) => !running && onOpenChange(o)}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogIcon tone="brand">
            <GitMerge />
          </DialogIcon>
          <DialogTitle>Make {level.name} one class</DialogTitle>
          <DialogDescription>
            {arms.length > 1
              ? `Merge ${level.name}’s ${arms.length} arms into one, with no arm letter — it then shows as just “${level.name}”.`
              : `Drop the arm letter so this class shows as just “${level.name}”.`}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          {phase === 'choose' ? (
            <>
              {arms.length > 1 && (
                <fieldset className="grid gap-2">
                  <legend className="mb-2 text-[13px] font-medium">Which class do you keep?</legend>
                  {arms.map((a) => (
                    <label
                      key={a.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
                        a.id === keepId ? 'border-brand/50 bg-brand-soft/40' : 'border-border hover:bg-muted/40',
                      )}
                    >
                      <input type="radio" name="keep-arm" value={a.id} checked={a.id === keepId} onChange={() => setKeepId(a.id)} className="size-4 accent-brand" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{armLabel(level, a)}</span>
                        <span className="block truncate text-[12px] text-muted-foreground">
                          {plural(a.studentCount, 'student')} · {a.classTeacher ? `${a.classTeacher.firstName} ${a.classTeacher.lastName}` : 'No class teacher'}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              {keep && others.length > 0 && (
                <>
                  <p className="text-[13px] text-muted-foreground">
                    {others.map((a) => armLabel(level, a)).join(', ')} will be merged into {armLabel(level, keep)} one at a time
                    {others.reduce((n, a) => n + a.studentCount, 0) > 0 && ` (${plural(others.reduce((n, a) => n + a.studentCount, 0), 'student')} move)`}, then it’s
                    renamed to {level.name}.
                  </p>
                  <WhatMoves from={others.length === 1 ? armLabel(level, others[0]!) : 'each merged class'} />
                </>
              )}
            </>
          ) : (
            <>
              <Progress value={steps.length ? (doneCount / steps.length) * 100 : 0} label="Progress" className="h-1.5" />
              <ol className="grid gap-2">
                {steps.map((s) => (
                  <li key={s.key} className="flex items-start gap-2.5 text-[13.5px]">
                    {s.status === 'done' ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    ) : s.status === 'running' ? (
                      <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-brand" aria-hidden />
                    ) : s.status === 'error' ? (
                      <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                    ) : (
                      <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <span className="min-w-0">
                      <span className={cn('block', s.status === 'pending' && 'text-muted-foreground')}>{s.label}</span>
                      {s.detail && <span className={cn('block text-[12px]', s.status === 'error' ? 'text-danger' : 'text-muted-foreground')}>{s.detail}</span>}
                    </span>
                  </li>
                ))}
              </ol>
              {phase === 'done' && (
                <p role="status" className="rounded-xl border border-success/30 bg-success-soft px-4 py-3 text-[13px]">
                  {level.name} is now one class{totals.students ? `; ${plural(totals.students, 'student')} moved` : ''}.
                  {totals.periods > 0 && ` ${plural(totals.periods, 'timetable period')} were removed — regenerate the timetable so ${level.name} has a full week.`}
                </p>
              )}
              {phase === 'failed' && (
                <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-[13px]">
                  Stopped at the step above. The steps marked done are saved; fix the problem and run it again to finish.
                </p>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          {phase === 'choose' ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => void run()} disabled={!keep}>
                {others.length ? `Merge ${plural(others.length, 'arm')}` : 'Make one class'}
              </Button>
            </>
          ) : (
            <>
              {phase === 'done' && totals.periods > 0 && (
                <Button variant="outline" onClick={() => void navigate('/timetable/setup')}>
                  Open timetable setup
                </Button>
              )}
              <Button onClick={() => onOpenChange(false)} loading={running} disabled={running}>
                {running ? 'Working…' : 'Close'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
