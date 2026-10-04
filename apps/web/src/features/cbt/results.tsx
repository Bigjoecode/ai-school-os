import type { CbtItemAnalysisRow, CbtScorePreviewRow } from '@aischool/shared';
import { BarChart3, Check, Download, FileSpreadsheet, ListChecks } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { downloadResultsCsv, useCbtResults, useCbtScorePreview, useSendScores } from './api';
import { AttemptBadge, LETTERS, minutesLabel } from './ui';

export function ResultsPanel({ examId }: { examId: string }) {
  const q = useCbtResults(examId);
  const [sendOpen, setSendOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'score'>('score');
  const r = q.data;
  const rows = useMemo(() => {
    const sat = (r?.rows ?? []).filter((x) => x.status !== 'NOT_STARTED');
    return sortBy === 'name' ? sat : [...sat].sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1) || a.student.name.localeCompare(b.student.name));
  }, [r, sortBy]);
  const absent = (r?.rows ?? []).filter((x) => x.status === 'NOT_STARTED');

  if (q.error && !r) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!r) return <Skeleton className="h-80 rounded-2xl" />;
  if (!rows.length) {
    return (
      <Card>
        <EmptyState icon={BarChart3} title="No results yet" description="Scores and question analysis appear here once students hand in." />
      </Card>
    );
  }
  const download = async () => {
    setDownloading(true);
    try {
      await downloadResultsCsv(examId, r.exam.title);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDownloading(false);
    }
  };
  const s = r.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => void download()} loading={downloading}>
          <Download /> Download CSV
        </Button>
        {r.exam.canManage && r.exam.sendToScores && r.exam.component && (
          <Button variant="outline" onClick={() => setSendOpen(true)}>
            <FileSpreadsheet /> Send to score sheet
          </Button>
        )}
        {s.marked < s.sat && <span className="text-[12.5px] text-warning">{s.sat - s.marked} still have written answers to mark</span>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="Sat" value={`${s.sat}`} sub={absent.length ? `${absent.length} didn’t start` : 'Everyone sat'} />
        <Tile label="Average" value={s.average != null ? `${s.average}%` : '—'} />
        <Tile label="Highest" value={s.highest != null ? `${s.highest}%` : '—'} />
        <Tile label="Lowest" value={s.lowest != null ? `${s.lowest}%` : '—'} />
        <Tile label="Pass rate" value={s.passRate != null ? `${s.passRate}%` : '—'} sub={`${s.marked} fully marked`} />
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>Scores</CardTitle>
            <CardDescription>Out of {r.exam.paper.totalMarks}. “Left screen” counts times the student switched away from the exam.</CardDescription>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant={sortBy === 'score' ? 'secondary' : 'ghost'} onClick={() => setSortBy('score')}>
              By score
            </Button>
            <Button size="sm" variant={sortBy === 'name' ? 'secondary' : 'ghost'} onClick={() => setSortBy('name')}>
              By name
            </Button>
          </div>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="text-right">%</TableHead>
              <TableHead className="text-right">Time taken</TableHead>
              <TableHead className="text-right">Left screen</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((x) => (
              <TableRow key={x.student.id}>
                <TableCell>
                  <p className="font-medium">{x.student.name}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {x.student.admissionNumber}
                    {x.student.classArm ? ` · ${x.student.classArm}` : ''}
                  </p>
                </TableCell>
                <TableCell className="text-right tabular">{x.score != null ? `${x.score}/${x.total}` : x.objectiveScore != null ? <span className="text-muted-foreground">{x.objectiveScore}+ so far</span> : '—'}</TableCell>
                <TableCell className={cn('text-right font-medium tabular', x.percent == null ? 'text-muted-foreground' : x.percent >= 70 ? 'text-success' : x.percent >= 50 ? 'text-warning' : 'text-danger')}>{x.percent != null ? `${x.percent}%` : '—'}</TableCell>
                <TableCell className="text-right tabular">{minutesLabel(x.timeTakenSeconds)}</TableCell>
                <TableCell className={cn('text-right tabular', x.focusLosses >= 3 ? 'font-semibold text-danger' : x.focusLosses ? 'text-warning' : 'text-muted-foreground')}>{x.focusLosses}</TableCell>
                <TableCell>
                  <AttemptBadge status={x.status} written={r.exam.paper.hasWritten} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <section aria-labelledby="item-analysis">
        <h2 id="item-analysis" className="mb-1 flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
          <ListChecks className="size-4" /> Question analysis
        </h2>
        <p className="mb-3 text-[13px] text-muted-foreground">
          How each question went. Low scores show topics to reteach; a popular wrong option often shows a common misconception. Discrimination compares the top and bottom students (needs 10 or more).
        </p>
        <ol className="grid gap-3 lg:grid-cols-2">
          {r.items.map((i) => (
            <li key={i.questionId}>
              <ItemCard i={i} />
            </li>
          ))}
        </ol>
      </section>

      {sendOpen && <SendScoresDialog examId={examId} open={sendOpen} onOpenChange={setSendOpen} />}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold tracking-tight tabular">{value}</p>
      {sub && <p className="mt-0.5 text-[12px] text-muted-foreground">{sub}</p>}
    </Card>
  );
}

function ItemCard({ i }: { i: CbtItemAnalysisRow }) {
  const pct = i.percentCorrect;
  const tone = pct == null ? 'bg-muted' : pct >= 70 ? 'bg-success' : pct >= 40 ? 'bg-warning' : 'bg-danger';
  const objective = i.correctIndex != null;
  const max = Math.max(1, ...i.optionCounts);
  return (
    <Card className="h-full p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-medium text-muted-foreground">
          Q{i.number} · {i.topic} · {i.marks} mark{i.marks === 1 ? '' : 's'}
        </p>
        <span className={cn('shrink-0 font-display text-[15px] font-semibold tabular', pct == null ? 'text-muted-foreground' : pct >= 70 ? 'text-success' : pct >= 40 ? 'text-warning' : 'text-danger')}>{pct != null ? `${pct}%` : '—'}</span>
      </div>
      <p className="mt-1 line-clamp-3 text-[13.5px] font-medium">{i.stem}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${pct ?? 0}%` }} />
      </div>
      {objective ? (
        <ul className="mt-3 space-y-1">
          {i.options.map((o, oi) => {
            const n = i.optionCounts[oi] ?? 0;
            const key = oi === i.correctIndex;
            return (
              <li key={oi} className="grid grid-cols-[1.25rem_minmax(0,1fr)_5rem_2rem] items-center gap-2 text-[12.5px]">
                <span className={cn('font-semibold', key ? 'text-success' : 'text-muted-foreground')}>{LETTERS[oi]}</span>
                <span className={cn('truncate', key && 'font-medium text-success')} title={o}>
                  {o} {key && <Check className="inline size-3.5" aria-label="Correct answer" />}
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span className={cn('block h-full rounded-full', key ? 'bg-success' : 'bg-border-strong')} style={{ width: `${(n / max) * 100}%` }} />
                </span>
                <span className="text-right tabular text-muted-foreground">{n}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-[12.5px] text-muted-foreground">Written · average {i.averageMark ?? '—'} of {i.marks}</p>
      )}
      <p className="mt-2 flex flex-wrap gap-x-3 text-[11.5px] text-muted-foreground tabular">
        <span>
          {i.answered}/{i.attempts} answered
        </span>
        {i.discrimination != null && <span className={i.discrimination < 0.2 ? 'text-warning' : ''}>Discrimination {i.discrimination}</span>}
      </p>
    </Card>
  );
}

const STATUS_LABEL: Record<CbtScorePreviewRow['status'], string> = {
  NEW: 'New',
  SAME: 'Already there',
  CONFLICT: 'Different mark already entered',
  NOT_MARKED: 'Not fully marked',
  NOT_ALLOWED: 'Not your class',
  NO_CLASS: 'Not in a class',
};

function SendScoresDialog({ examId, open, onOpenChange }: { examId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const p = useCbtScorePreview(examId, open);
  const send = useSendScores(examId);
  const [overwrite, setOverwrite] = useState<Set<string>>(new Set());
  const rows = p.data?.rows ?? [];
  const by = (s: CbtScorePreviewRow['status']) => rows.filter((r) => r.status === s);
  const conflicts = by('CONFLICT');
  const fresh = by('NEW');
  const skipped = rows.filter((r) => r.status === 'NOT_MARKED' || r.status === 'NOT_ALLOWED' || r.status === 'NO_CLASS');
  const toWrite = fresh.length + overwrite.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <div className="mb-2 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand [&_svg]:size-5">
            <FileSpreadsheet />
          </div>
          <DialogTitle>Send to the score sheet</DialogTitle>
          <DialogDescription>
            {p.data
              ? `Each score is scaled to ${p.data.component.name} (out of ${p.data.component.maxScore}) for ${p.data.subject.name}, ${p.data.term.name}. Marks already on the sheet are only replaced where you tick them.`
              : 'Checking the score sheet…'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {p.error ? (
            <ErrorState error={p.error} onRetry={() => void p.refetch()} />
          ) : !p.data ? (
            <Skeleton className="h-40" />
          ) : (
            <>
              <div className="flex flex-wrap gap-2 text-[12.5px]">
                <Badge variant="success">{fresh.length} new</Badge>
                <Badge variant="secondary">{by('SAME').length} already there</Badge>
                <Badge variant={conflicts.length ? 'warning' : 'secondary'}>{conflicts.length} different</Badge>
                {skipped.length > 0 && <Badge variant="outline">{skipped.length} skipped</Badge>}
              </div>
              {conflicts.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[13px] font-medium">These students already have a different mark. Tick the ones to replace:</p>
                    <Button size="sm" variant="ghost" onClick={() => setOverwrite((s) => (s.size === conflicts.length ? new Set() : new Set(conflicts.map((c) => c.student.id))))}>
                      {overwrite.size === conflicts.length ? 'None' : 'All'}
                    </Button>
                  </div>
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {conflicts.map((c) => (
                      <li key={c.student.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-[13px]">
                          <Checkbox
                            checked={overwrite.has(c.student.id)}
                            onCheckedChange={(v) =>
                              setOverwrite((s) => {
                                const n = new Set(s);
                                if (v) n.add(c.student.id);
                                else n.delete(c.student.id);
                                return n;
                              })
                            }
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {c.student.name} <span className="text-muted-foreground">· {c.classArm?.name}</span>
                          </span>
                          <span className="shrink-0 tabular text-muted-foreground">
                            {c.existingScore} → <span className="font-medium text-foreground">{c.newScore}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {skipped.length > 0 && (
                <details className="rounded-xl border border-border px-3 py-2 text-[13px]">
                  <summary className="cursor-pointer font-medium">Skipped ({skipped.length})</summary>
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    {skipped.map((s) => (
                      <li key={s.student.id}>
                        {s.student.name} — {STATUS_LABEL[s.status]}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {!toWrite && !conflicts.length && <p className="text-[13px] text-muted-foreground">Nothing new to send: the score sheet already matches.</p>}
              <p className="text-[12px] text-muted-foreground">Students who didn’t sit are left as they are on the score sheet.</p>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => send.mutate([...overwrite], { onSuccess: () => onOpenChange(false) })} loading={send.isPending} disabled={!toWrite}>
            Send {toWrite || ''} mark{toWrite === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

