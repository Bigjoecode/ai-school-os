import { ordinal, type ReportCardRow } from '@aischool/shared';
import { Award, CheckCircle2, Circle, EyeOff, Send, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogBody } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Tip } from '@/components/ui/tooltip';
import { useCan } from '@/lib/auth-store';
import { qk, queryClient } from '@/lib/query-client';
import { cn } from '@/lib/utils';
import { useStructure } from '../academics/api';
import { invalidateReportCards, jobNumber, useAiJob, useGenerateRemarks, usePublishReports, useReportCards } from '../assessment/api';
import { AssessmentStatusBadge, fmtPct, JobProgressPanel, StatTile, useStoredState } from '../assessment/ui';
import { ArmSelect, currentTerm, TermSelect } from '../planning/pickers';
import { useSearchFlag } from '../planning/ui';

export default function ReportCardsPage() {
  const navigate = useNavigate();
  const canPublish = useCan('results.publish');
  const canAi = useCan('ai.use');
  const structure = useStructure();
  const [pick, setPick] = useStoredState<{ termId?: string; classArmId?: string }>('aischool.results.pick', {});
  const terms = structure.data?.sessions.flatMap((s) => s.terms) ?? [];
  const termId = pick.termId && terms.some((t) => t.id === pick.termId) ? pick.termId : currentTerm(structure.data)?.id;
  const classArmId = pick.classArmId;
  const ready = !!termId && !!classArmId;

  const list = useReportCards({ classArmId, termId });
  const rows = list.data;
  const publish = usePublishReports();
  const [confirm, setConfirm] = useState<'publish' | 'withdraw' | null>(null);
  const [remarksOpen, setRemarksOpen] = useSearchFlag('remarks');

  const [jobId, setJobId] = useState<string | undefined>();
  const job = useAiJob(jobId);
  const announced = useRef<string | null>(null);
  useEffect(() => {
    const j = job.data;
    if (!j || j.state === 'QUEUED' || j.state === 'RUNNING' || announced.current === j.id) return;
    announced.current = j.id;
    invalidateReportCards();
    if (j.state === 'DONE') toast.success(`${jobNumber(j, 'written')} remarks drafted`, { description: 'Open a report card to read and edit them.' });
    else toast.error('Drafting remarks failed', { description: j.error ?? undefined });
  }, [job.data]);

  const withResults = (rows ?? []).filter((r) => r.subjectsTaken > 0);
  const published = withResults.filter((r) => r.status === 'PUBLISHED').length;
  const remarked = withResults.filter((r) => r.hasTeacherRemark).length;
  const allPublished = withResults.length > 0 && published === withResults.length;

  const go = (r: ReportCardRow) => navigate(`/report-cards/${r.studentId}?termId=${termId}&classArmId=${classArmId}`);

  return (
    <Page>
      <PageHeader
        title="Report Cards"
        description="Review each learner’s termly report, add remarks and publish them to parents when you’re ready."
        actions={
          ready && (
            <>
              {canAi && (
                <Button variant="ai" onClick={() => setRemarksOpen(true)} disabled={!withResults.length}>
                  <Sparkles /> Draft remarks with AI
                </Button>
              )}
              {canPublish &&
                (allPublished ? (
                  <Button variant="outline" onClick={() => setConfirm('withdraw')}>
                    <EyeOff /> Withdraw
                  </Button>
                ) : (
                  <Button onClick={() => setConfirm('publish')} disabled={!withResults.length}>
                    <Send /> Publish
                  </Button>
                ))}
            </>
          )
        }
      />

      <Card className="mb-5 grid gap-3 p-3 sm:grid-cols-2">
        <TermSelect structure={structure.data} value={termId} onChange={(v) => setPick({ ...pick, termId: v })} aria-label="Term" />
        <ArmSelect structure={structure.data} value={classArmId} onChange={(v) => setPick({ ...pick, classArmId: v })} aria-label="Class" />
      </Card>

      {jobId && (
        <div className="mb-5">
          <JobProgressPanel
            job={job.data}
            noun="report card remarks"
            doneText={`${jobNumber(job.data, 'written')} of ${jobNumber(job.data, 'requested')} remarks drafted — marked “AI draft” on each card`}
            onDismiss={job.data && (job.data.state === 'DONE' || job.data.state === 'FAILED') ? () => setJobId(undefined) : undefined}
          />
        </div>
      )}

      {!ready ? (
        <Card>
          <EmptyState icon={Award} title="Pick a term and class" description="Choose a class to see its report cards for the term." />
        </Card>
      ) : (
        <>
          {rows && rows.length > 0 && (
            <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <StatTile label="Learners" value={rows.length} sub={`${withResults.length} with results`} />
              <StatTile label="Teacher remarks" value={`${remarked} / ${withResults.length}`} tone={remarked === withResults.length && remarked > 0 ? 'success' : undefined} />
              <StatTile label="Published" value={`${published} / ${withResults.length}`} tone={allPublished ? 'success' : undefined} />
              <StatTile
                label="Class average"
                value={fmtPct(withResults.length ? withResults.reduce((n, r) => n + (r.average ?? 0), 0) / Math.max(1, withResults.filter((r) => r.average != null).length) : null)}
              />
            </div>
          )}
          <Card className="overflow-hidden">
            <DataTable
              rows={rows}
              loading={list.isLoading}
              error={list.error}
              onRetry={() => void list.refetch()}
              rowKey={(r) => r.studentId}
              onRowClick={go}
              rowLabel={(r) => `Open ${r.name}'s report card`}
              empty={{ icon: Award, title: 'No learners in this class', description: 'Enrol learners into this class to produce report cards.' }}
              columns={[
                {
                  key: 'pos',
                  header: 'Pos.',
                  className: 'w-16 tabular font-semibold',
                  cell: (r) => (r.position ? ordinal(r.position) : <span className="text-muted-foreground">—</span>),
                },
                {
                  key: 'name',
                  header: 'Learner',
                  cell: (r) => (
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.name}</p>
                      <p className="text-[12px] tabular text-muted-foreground">{r.admissionNumber}</p>
                    </div>
                  ),
                },
                { key: 'avg', header: 'Average', className: 'tabular', cell: (r) => fmtPct(r.average) },
                { key: 'subjects', header: 'Subjects', className: 'tabular text-muted-foreground', cell: (r) => r.subjectsTaken },
                {
                  key: 'remarks',
                  header: 'Remarks',
                  cell: (r) => (
                    <div className="flex items-center gap-2">
                      <RemarkIcon done={r.hasTeacherRemark} label="Teacher" />
                      <RemarkIcon done={r.hasPrincipalRemark} label="Principal" />
                    </div>
                  ),
                },
                { key: 'status', header: 'Status', cell: (r) => (r.subjectsTaken ? <AssessmentStatusBadge status={r.status} /> : <span className="text-[12px] text-muted-foreground">No results</span>) },
              ]}
              renderMobile={(r) => (
                <div className="flex items-center gap-3">
                  <span className="w-9 shrink-0 text-center font-display text-[15px] font-semibold tabular">{r.position ? ordinal(r.position) : '—'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="text-[12px] text-muted-foreground tabular">
                      {fmtPct(r.average)} · {r.subjectsTaken} subjects
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RemarkIcon done={r.hasTeacherRemark} label="Teacher" />
                    <AssessmentStatusBadge status={r.status} />
                  </div>
                </div>
              )}
            />
          </Card>
        </>
      )}

      {ready && canAi && (
        <DraftRemarksDialog
          open={remarksOpen}
          onOpenChange={setRemarksOpen}
          classArmId={classArmId!}
          termId={termId!}
          existing={remarked}
          onStarted={(id) => {
            announced.current = null;
            setJobId(id);
          }}
        />
      )}
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        destructive={confirm === 'withdraw'}
        title={confirm === 'publish' ? `Publish ${withResults.length} report cards?` : 'Withdraw these report cards?'}
        description={
          confirm === 'publish'
            ? `Parents and learners will be able to see them. ${withResults.length - remarked > 0 ? `${withResults.length - remarked} still have no teacher’s remark.` : 'Every card has a teacher’s remark.'}`
            : 'They go back to draft and are hidden from parents until you publish again.'
        }
        confirmLabel={confirm === 'publish' ? 'Publish' : 'Withdraw'}
        loading={publish.isPending}
        onConfirm={() =>
          ready &&
          publish.mutate({ classArmId: classArmId!, termId: termId!, publish: confirm === 'publish' }, { onSuccess: () => setConfirm(null) })
        }
      />
    </Page>
  );
}

function RemarkIcon({ done, label }: { done: boolean; label: string }) {
  return (
    <Tip label={`${label}’s remark ${done ? 'written' : 'missing'}`}>
      <span className={cn('inline-flex items-center gap-1 text-[11.5px]', done ? 'text-success' : 'text-muted-foreground/60')} aria-label={`${label}’s remark ${done ? 'written' : 'missing'}`}>
        {done ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
        <span className="hidden xl:inline">{label}</span>
      </span>
    </Tip>
  );
}

function DraftRemarksDialog({
  open,
  onOpenChange,
  classArmId,
  termId,
  existing,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classArmId: string;
  termId: string;
  existing: number;
  onStarted: (jobId: string) => void;
}) {
  const generate = useGenerateRemarks();
  const [overwrite, setOverwrite] = useState(false);
  useEffect(() => {
    if (open) setOverwrite(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <div className="ai-border mb-2 grid size-10 place-items-center rounded-xl bg-card">
            <AiSparkle className="size-5" />
          </div>
          <DialogTitle>Draft teacher’s remarks with AI</DialogTitle>
          <DialogDescription>
            A warm, specific remark for each learner, written from their results this term. Every draft is marked “AI draft” and you can edit it on the card.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3">
            <Checkbox className="mt-0.5" checked={overwrite} onCheckedChange={(v) => setOverwrite(v === true)} />
            <span className="text-[13px]">
              <span className="font-medium">Also replace existing remarks</span>
              <span className="block text-muted-foreground">
                {existing > 0 ? `${existing} learners already have a remark — leave this off to keep them.` : 'No learner has a remark yet.'}
              </span>
            </span>
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="ai"
            loading={generate.isPending}
            onClick={() =>
              generate.mutate(
                { classArmId, termId, overwrite },
                {
                  onSuccess: (j) => {
                    queryClient.setQueryData(qk.aiJob(j.id), j);
                    onStarted(j.id);
                    onOpenChange(false);
                  },
                  onError: (err) => toast.error(err.message),
                },
              )
            }
          >
            {!generate.isPending && <Sparkles />} Draft remarks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
