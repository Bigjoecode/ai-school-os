import type { StaffRow } from '@aischool/shared';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, LogOut, MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { type BaseSyntheticEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { todayIso } from '@/lib/format';
import { qk, queryClient } from '@/lib/query-client';
import { plural } from '../finance/ui';

/** The little we need to act on a staff member (works for StaffRow and HR's EmployeeRow). */
export interface StaffTarget {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
}

export type StaffActionKind = 'exit' | 'reinstate' | 'delete';
export type StaffAction = { kind: StaffActionKind; staff: StaffTarget; open: boolean } | null;

type Released = { classes: number; subjects: number; periods: number };

const fullName = (s: StaffTarget) => `${s.firstName} ${s.lastName}`;

/** Staff changed: refresh staff lists, HR, the dashboard and anything that shows teachers. */
export function invalidateStaff(deletedId?: string) {
  void queryClient.invalidateQueries({ queryKey: qk.staff() });
  void queryClient.invalidateQueries({ queryKey: ['hr'], predicate: (q) => !deletedId || q.queryKey[2] !== deletedId });
  void queryClient.invalidateQueries({ queryKey: qk.overview });
  void queryClient.invalidateQueries({ queryKey: qk.structure });
  void queryClient.invalidateQueries({ queryKey: ['timetable'] });
  void queryClient.invalidateQueries({ queryKey: ['timetables'] });
}

export function useExitStaff() {
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; exitedOn?: string; reason?: string }) => api.post<StaffRow & { released: Released }>(`/staff/${id}/exit`, body),
    meta: { silent: true },
    onSuccess: () => invalidateStaff(),
  });
}

export function useReinstateStaff() {
  return useMutation({
    mutationFn: (id: string) => api.post<StaffRow>(`/staff/${id}/reinstate`),
    onSuccess: (s) => {
      invalidateStaff();
      toast.success(`${s.firstName} ${s.lastName} is back on staff`, { description: 'Their sign-in works again. Assign their classes and subjects in Academic Setup.' });
    },
  });
}

export function useDeleteStaff() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/staff/${id}`),
    meta: { silent: true },
    onSuccess: (_, id) => {
      // Their HR record is gone: don't refetch it into a 404.
      invalidateStaff(id);
    },
  });
}

/** Status pill for a staff row: people who have left read “Left”. */
export function StaffStatusBadge({ status }: { status: string }) {
  if (status === 'EXITED') return <Badge variant="outline">Left</Badge>;
  if (status === 'ON_LEAVE')
    return (
      <Badge variant="info" dot>
        On leave
      </Badge>
    );
  return <StatusBadge status={status} />;
}

/** The ⋯ menu for a staff member: Edit, Mark as left / Reinstate, Delete. Gate it with staff.manage. */
export function StaffActionsMenu({
  staff,
  onEdit,
  onAction,
  trigger = 'icon',
}: {
  staff: StaffTarget;
  onEdit?: () => void;
  onAction: (kind: StaffActionKind) => void;
  trigger?: 'icon' | 'button';
}) {
  const exited = staff.status === 'EXITED';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger === 'button' ? (
          <Button variant="outline" aria-label={`More actions for ${fullName(staff)}`}>
            <MoreHorizontal /> More
          </Button>
        ) : (
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${fullName(staff)}`} onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
        {onEdit && (
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil /> Edit details
          </DropdownMenuItem>
        )}
        {exited ? (
          <DropdownMenuItem onSelect={() => onAction('reinstate')}>
            <RotateCcw /> Reinstate
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => onAction('exit')}>
            <LogOut /> Mark as left
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => onAction('delete')}>
          <Trash2 /> Delete record
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The dialogs behind StaffActionsMenu. Render once per page, outside any
 * clickable row; keep `action` set (with open: false) while they animate closed.
 */
export function StaffActionDialogs({ action, onActionChange, onDeleted }: { action: StaffAction; onActionChange: (a: StaffAction) => void; onDeleted?: () => void }) {
  const close = (o: boolean) => !o && onActionChange(action ? { ...action, open: false } : null);
  const reinstate = useReinstateStaff();
  const staff = action?.staff;
  return (
    <>
      <ExitStaffDialog open={action?.kind === 'exit' && action.open} onOpenChange={close} staff={staff} />
      <DeleteStaffDialog
        open={action?.kind === 'delete' && action.open}
        onOpenChange={close}
        staff={staff}
        onDeleted={onDeleted}
        onMarkLeft={() => staff && onActionChange({ kind: 'exit', staff, open: true })}
      />
      <ConfirmDialog
        open={action?.kind === 'reinstate' && action.open}
        onOpenChange={close}
        destructive={false}
        title={`Reinstate ${staff ? fullName(staff) : 'this person'}?`}
        description="They’re back on current staff and can sign in again. Classes, subjects and timetable periods released when they left aren’t restored — assign them again in Academic Setup."
        confirmLabel="Reinstate"
        loading={reinstate.isPending}
        onConfirm={() => staff && reinstate.mutate(staff.id, { onSuccess: () => close(false) })}
      />
    </>
  );
}

function releasedSummary(r: Released): string | null {
  const parts = [
    r.classes > 0 && `${plural(r.classes, 'class', 'classes')} (as class teacher)`,
    r.subjects > 0 && plural(r.subjects, 'subject class', 'subject classes'),
    r.periods > 0 && plural(r.periods, 'timetable period'),
  ].filter((p): p is string => !!p);
  if (!parts.length) return null;
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  return `Released ${list}; reassign them in Academic Setup.`;
}

function ExitStaffDialog({ open, onOpenChange, staff }: { open: boolean; onOpenChange: (o: boolean) => void; staff?: StaffTarget }) {
  const navigate = useNavigate();
  const exit = useExitStaff();
  const [exitedOn, setExitedOn] = useState(todayIso());
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setExitedOn(todayIso());
      setReason('');
      setError(null);
    }
  }, [open]);

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    if (!staff) return;
    exit.mutate(
      { id: staff.id, exitedOn: exitedOn || undefined, reason: reason.trim() || undefined },
      {
        onSuccess: (res) => {
          const summary = releasedSummary(res.released);
          toast.success(`${fullName(staff)} marked as left`, {
            description: summary ?? 'Their records are kept and they can no longer sign in.',
            duration: summary ? 10_000 : undefined,
            action: summary ? { label: 'Academic Setup', onClick: () => void navigate('/academics?tab=classes') } : undefined,
          });
          onOpenChange(false);
        },
        onError: (err) => {
          if (err instanceof ApiError && err.errors.length) setError(err.errors.map((x) => x.message).join('. '));
          else toast.error(err.message);
        },
      },
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Mark ${staff ? fullName(staff) : 'this person'} as left`}
      description="The right choice for anyone who actually worked here and has moved on."
      icon={<LogOut />}
      submitLabel="Mark as left"
      pending={exit.isPending}
      onSubmit={submit}
    >
      <div className="grid gap-4">
        <ul className="grid gap-1.5 rounded-xl border border-border bg-muted/30 px-4 py-3 text-[13px] text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Kept:</span> their record, payslips, attendance, leave and the marks they entered.
          </li>
          <li>
            <span className="font-medium text-foreground">Released:</span> any class they lead as class teacher, the subject classes they teach and their
            timetable periods.
          </li>
          <li>
            <span className="font-medium text-foreground">Sign-in:</span> closed. You can reinstate them later.
          </li>
        </ul>
        <Field label="Left on" htmlFor="sx-date" error={error ?? undefined}>
          <Input id="sx-date" type="date" value={exitedOn} max={todayIso()} onChange={(e) => setExitedOn(e.target.value)} invalid={!!error} />
        </Field>
        <Field label="Reason" htmlFor="sx-reason" optional>
          <Textarea id="sx-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Resigned, contract ended, relocated" />
        </Field>
      </div>
    </FormDialog>
  );
}

function DeleteStaffDialog({
  open,
  onOpenChange,
  staff,
  onDeleted,
  onMarkLeft,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  staff?: StaffTarget;
  onDeleted?: () => void;
  onMarkLeft: () => void;
}) {
  const del = useDeleteStaff();
  const [blocked, setBlocked] = useState<string | null>(null);
  useEffect(() => {
    if (open) setBlocked(null);
  }, [open]);
  const name = staff ? fullName(staff) : 'this person';
  const canMarkLeft = staff?.status !== 'EXITED';

  const confirm = () => {
    if (!staff) return;
    del.mutate(staff.id, {
      onSuccess: () => {
        toast.success(`${name}’s record deleted`);
        onOpenChange(false);
        onDeleted?.();
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
          <div className="mb-2 grid size-10 place-items-center rounded-xl bg-danger-soft text-danger">
            <AlertTriangle className="size-5" />
          </div>
          <DialogTitle>Delete {name}?</DialogTitle>
          <DialogDescription>
            Only for a record added by mistake: it’s removed completely, along with their sign-in, and can’t be undone.
            {canMarkLeft && ' If they worked here and have moved on, mark them as left instead so their history is kept.'}
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
          {canMarkLeft && (
            <Button variant={blocked ? 'default' : 'outline'} onClick={onMarkLeft}>
              <LogOut /> Mark as left instead
            </Button>
          )}
          {!blocked && (
            <Button variant="destructive" loading={del.isPending} onClick={confirm}>
              Delete record
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
