import { behaviourCategoryLabel, BEHAVIOUR_SEVERITY_LABELS, type BehaviourRow } from '@aischool/shared';
import { BellRing, CheckCircle2, EyeOff, MoreHorizontal, Pencil, RotateCcw, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useDeleteBehaviour, useNotifyBehaviour, useResolveBehaviour } from './api';
import { BehaviourDialog } from './behaviour-dialog';
import { NotifyDialog } from './notify-dialog';
import { KindBadge, Points } from './ui';

/** Edit, resolve, notify and delete — only offered when the user may change the record. */
export function BehaviourActions({ r }: { r: BehaviourRow }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const resolve = useResolveBehaviour();
  const del = useDeleteBehaviour();
  const notify = useNotifyBehaviour();
  if (!r.canEdit) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.title}`} onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil /> Edit
          </DropdownMenuItem>
          {r.kind !== 'MERIT' && (
            <DropdownMenuItem onSelect={() => resolve.mutate({ id: r.id, status: r.status === 'OPEN' ? 'RESOLVED' : 'OPEN' })}>
              {r.status === 'OPEN' ? (
                <>
                  <CheckCircle2 /> Mark resolved
                </>
              ) : (
                <>
                  <RotateCcw /> Reopen
                </>
              )}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setNotifying(true)}>
            <Send /> {r.parentNotifiedAt ? 'Notify parents again' : 'Notify parents'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDeleting(true)} className="text-danger focus:text-danger">
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <BehaviourDialog open={editing} onOpenChange={setEditing} record={r} />
      <NotifyDialog
        open={notifying}
        onOpenChange={setNotifying}
        title={`Notify ${r.student.name.split(' ')[0]}’s parents`}
        description={`About “${r.title}” on ${formatDate(r.date)}.${r.visibleToParents ? '' : ' The details stay private; only the title is shared.'}`}
        pending={notify.isPending}
        onSend={(input) => notify.mutate({ id: r.id, ...input }, { onSuccess: () => setNotifying(false) })}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this record?"
        description={`“${r.title}” for ${r.student.name} will be removed, including from the family portal.`}
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() => del.mutate(r.id, { onSuccess: () => setDeleting(false) })}
      />
    </>
  );
}

/** One record in a timeline or list. */
export function BehaviourItem({ r, showStudent, onStudent }: { r: BehaviourRow; showStudent?: boolean; onStudent?: (id: string) => void }) {
  return (
    <li className="flex items-start gap-3 py-3">
      <Points value={r.points} className="mt-0.5 w-9 shrink-0 text-right text-[15px]" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <KindBadge kind={r.kind} />
          <span className="text-[12px] text-muted-foreground">{behaviourCategoryLabel(r.category)}</span>
          {r.kind !== 'MERIT' && r.severity !== 'LOW' && (
            <Badge variant={r.severity === 'HIGH' ? 'danger' : 'warning'}>{BEHAVIOUR_SEVERITY_LABELS[r.severity]}</Badge>
          )}
          {r.kind !== 'MERIT' && (
            <Badge variant={r.status === 'OPEN' ? 'warning' : 'outline'} dot>
              {r.status === 'OPEN' ? 'Open' : 'Resolved'}
            </Badge>
          )}
        </div>
        <p className="mt-1 break-words text-[13.5px] font-medium">{r.title}</p>
        {showStudent && (
          <button type="button" onClick={() => onStudent?.(r.student.id)} className="text-left text-[12.5px] font-medium text-brand hover:underline">
            {r.student.name}
            <span className="font-normal text-muted-foreground"> · {r.student.className ?? 'No class'}</span>
          </button>
        )}
        {r.description && <p className="mt-0.5 whitespace-pre-line break-words text-[13px] text-muted-foreground">{r.description}</p>}
        {r.actionTaken && (
          <p className="mt-0.5 text-[12.5px]">
            <span className="text-muted-foreground">Action:</span> {r.actionTaken}
          </p>
        )}
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-muted-foreground">
          <span>{formatDate(r.date)}</span>
          {r.reportedBy && <span>· by {r.reportedBy.name}</span>}
          {!r.visibleToParents && (
            <span className="inline-flex items-center gap-1">
              · <EyeOff className="size-3" /> Staff only
            </span>
          )}
          {r.parentNotifiedAt && (
            <span className={cn('inline-flex items-center gap-1 text-info')}>
              · <BellRing className="size-3" /> Parents notified
            </span>
          )}
        </p>
      </div>
      <BehaviourActions r={r} />
    </li>
  );
}
