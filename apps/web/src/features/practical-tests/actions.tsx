import type { PracticalAssessmentSummary } from '@aischool/shared';
import { Download, Eye, EyeOff, FileSpreadsheet, MoreHorizontal, Pencil, Play, Square, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { errorMessage } from '@/lib/api';
import { SendScoresDialog } from '../cbt/results';
import { downloadPracticalTestCsv, practicalTestBase, useDeletePracticalTest, usePracticalTestAction } from './api';
import { SchedulePracticalTestDialog } from './schedule-dialog';

/** The results page's actions: schedule, close, release, send to the score sheet, CSV, edit, delete. */
export function PracticalTestActions({ e }: { e: PracticalAssessmentSummary }) {
  const navigate = useNavigate();
  const action = usePracticalTestAction(e.id);
  const del = useDeletePracticalTest();
  const [editOpen, setEditOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [confirm, setConfirm] = useState<'close' | 'delete' | null>(null);
  const [downloading, setDownloading] = useState(false);
  const started = e.counts.started > 0;
  const run = (a: 'publish' | 'unpublish' | 'close' | 'release', body?: unknown) => action.mutate({ action: a, body }, { onError: (x) => toast.error(errorMessage(x)) });

  const csv = () => {
    setDownloading(true);
    downloadPracticalTestCsv(e.id, e.title)
      .catch((x) => toast.error(errorMessage(x)))
      .finally(() => setDownloading(false));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {e.canManage && e.status === 'DRAFT' && (
        <Button onClick={() => run('publish')} loading={action.isPending}>
          <Play /> Schedule
        </Button>
      )}
      {e.canManage && e.status !== 'DRAFT' && e.counts.submitted > 0 && (
        <Button variant={e.resultsReleasedAt ? 'outline' : 'brand'} onClick={() => run('release', { released: !e.resultsReleasedAt })} loading={action.isPending}>
          {e.resultsReleasedAt ? <EyeOff /> : <Eye />} {e.resultsReleasedAt ? 'Hide results' : 'Release results'}
        </Button>
      )}
      {e.canManage && e.component && e.counts.submitted > 0 && (
        <Button variant="outline" onClick={() => setSendOpen(true)}>
          <FileSpreadsheet /> Send to score sheet
        </Button>
      )}
      <Button variant="outline" onClick={csv} loading={downloading}>
        <Download /> CSV
      </Button>
      {e.canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="More actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <Pencil /> Edit
            </DropdownMenuItem>
            {e.status === 'SCHEDULED' && !started && (
              <DropdownMenuItem onSelect={() => run('unpublish')}>
                <Undo2 /> Move back to draft
              </DropdownMenuItem>
            )}
            {e.status !== 'DRAFT' && e.phase !== 'ENDED' && (
              <DropdownMenuItem onSelect={() => setConfirm('close')}>
                <Square /> Close now
              </DropdownMenuItem>
            )}
            {!started && (
              <DropdownMenuItem className="text-danger" onSelect={() => setConfirm('delete')}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {editOpen && <SchedulePracticalTestDialog open={editOpen} onOpenChange={setEditOpen} item={e} started={started} />}
      {sendOpen && <SendScoresDialog base={practicalTestBase(e.id)} open={sendOpen} onOpenChange={setSendOpen} />}
      <ConfirmDialog
        open={confirm === 'close'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Close this practical test now?"
        description={e.counts.inProgress ? `${e.counts.inProgress} student${e.counts.inProgress === 1 ? ' is' : 's are'} still in the lab: what they have recorded is handed in and marked.` : 'Nobody can start it after this.'}
        confirmLabel="Close now"
        onConfirm={() => {
          setConfirm(null);
          run('close');
        }}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this practical test?"
        description="Nobody has started it. This can’t be undone."
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() => del.mutate(e.id, { onSuccess: () => navigate('/practical-tests') })}
      />
    </div>
  );
}
