import type { HomeworkRow, SubmissionRow } from '@aischool/shared';
import { AlertTriangle, CheckCircle2, Clock, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { FileView, LinkRow } from './files';

type Mine = NonNullable<HomeworkRow['mine']>;

export const fmtScore = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Where a student's hand-in stands, for students, parents and teachers. */
export function HandInBadge({ mine, overdue, maxScore, className }: { mine: Pick<Mine, 'status' | 'late' | 'score'> | null | undefined; overdue?: boolean; maxScore: number | null; className?: string }) {
  if (!mine) {
    return overdue ? (
      <Badge variant="danger" className={cn('gap-1', className)}>
        <AlertTriangle /> Not handed in
      </Badge>
    ) : (
      <Badge variant="outline" className={className}>
        Not handed in yet
      </Badge>
    );
  }
  if (mine.status === 'GRADED') {
    return (
      <Badge variant="success" className={cn('gap-1', className)}>
        <CheckCircle2 /> Marked{mine.score != null && <span className="tabular">· {fmtScore(mine.score)}{maxScore != null ? `/${maxScore}` : ''}</span>}
      </Badge>
    );
  }
  if (mine.status === 'RETURNED') {
    return (
      <Badge variant="warning" className={cn('gap-1', className)}>
        <RotateCcw /> Returned to redo
      </Badge>
    );
  }
  return (
    <Badge variant={mine.late ? 'warning' : 'info'} className={cn('gap-1', className)}>
      <Clock /> {mine.late ? 'Handed in late' : 'Handed in'}
    </Badge>
  );
}

/** What a student handed in: their typed answer, files (photos and videos inline) and links. */
export function SubmissionContent({ s, className }: { s: Pick<SubmissionRow, 'text' | 'files' | 'links'>; className?: string }) {
  return (
    <div className={cn('grid gap-3', className)}>
      {s.text && <p className="whitespace-pre-wrap break-words rounded-xl border border-border bg-card px-3.5 py-3 text-[13.5px] leading-relaxed">{s.text}</p>}
      {s.files.length > 0 && (
        <ul className="grid gap-2" aria-label="Files handed in">
          {s.files.map((f) => (
            <li key={f.fileId} className="min-w-0">
              <FileView url={f.url} name={f.name} mimeType={f.mimeType} size={f.sizeBytes} />
            </li>
          ))}
        </ul>
      )}
      {s.links.length > 0 && (
        <ul className="grid gap-2" aria-label="Links handed in">
          {s.links.map((l, i) => (
            <li key={`${l}-${i}`} className="min-w-0">
              <LinkRow url={l} />
            </li>
          ))}
        </ul>
      )}
      {!s.text && !s.files.length && !s.links.length && <p className="text-[13px] text-muted-foreground">Nothing was attached.</p>}
    </div>
  );
}
