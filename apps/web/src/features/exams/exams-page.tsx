import type { PaperSummary } from '@aischool/shared';
import { Clock, FileText, ListOrdered, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { useCan } from '@/lib/auth-store';
import { formatRelative } from '@/lib/format';
import { useStructure } from '../academics/api';
import { usePapers } from '../assessment/api';
import { AssessmentStatusBadge } from '../assessment/ui';
import { currentTerm, LevelSelect, SubjectSelect, TermSelect } from '../planning/pickers';
import { CardGridSkeleton, useSearchFlag } from '../planning/ui';
import { BuildPaperDialog } from './build-paper-dialog';

export default function ExamsPage() {
  const canManage = useCan('assessment.manage');
  const structure = useStructure();
  const [termId, setTermId] = useState<string | undefined>();
  const [subjectId, setSubjectId] = useState<string | undefined>();
  const [classLevelId, setClassLevelId] = useState<string | undefined>();
  const [buildOpen, setBuildOpen] = useSearchFlag('new');
  const [termTouched, setTermTouched] = useState(false);

  // Default to the current term once the structure arrives.
  useEffect(() => {
    if (!termTouched && !termId && structure.data) setTermId(currentTerm(structure.data)?.id);
  }, [structure.data, termId, termTouched]);

  const list = usePapers({ termId, subjectId, classLevelId });
  const rows = list.data;
  const filtered = !!(subjectId || classLevelId);

  const buildButton = canManage && (
    <Button onClick={() => setBuildOpen(true)}>
      <Plus /> Build a paper
    </Button>
  );

  return (
    <Page>
      <PageHeader
        title="Exams"
        description="Build printable exam and test papers from your approved question bank, with a marking scheme for every paper."
        actions={buildButton}
      />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:flex lg:justify-end">
        <TermSelect
          structure={structure.data}
          value={termId}
          onChange={(v) => {
            setTermTouched(true);
            setTermId(v);
          }}
          allLabel="All terms"
          className="lg:w-60"
          aria-label="Filter by term"
        />
        <SubjectSelect structure={structure.data} value={subjectId} onChange={setSubjectId} allLabel="All subjects" className="lg:w-48" aria-label="Filter by subject" />
        <LevelSelect structure={structure.data} value={classLevelId} onChange={setClassLevelId} allLabel="All classes" className="lg:w-40" aria-label="Filter by class" />
      </div>

      {list.isLoading ? (
        <CardGridSkeleton />
      ) : list.error && !rows ? (
        <Card>
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        </Card>
      ) : !rows || rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileText}
            title={filtered ? 'No papers match' : 'No exam papers this term yet'}
            description={
              filtered
                ? 'Try another subject, class or term.'
                : 'Pick a subject, class and assessment — we assemble a balanced paper from your approved questions in seconds.'
            }
            action={!filtered ? buildButton || undefined : undefined}
          />
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => (
            <li key={p.id}>
              <PaperCard p={p} />
            </li>
          ))}
        </ul>
      )}

      {canManage && <BuildPaperDialog open={buildOpen} onOpenChange={setBuildOpen} defaults={{ subjectId, classLevelId, termId }} />}
    </Page>
  );
}

function PaperCard({ p }: { p: PaperSummary }) {
  return (
    <Link
      to={`/exams/${p.id}`}
      className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="flex h-full flex-col p-5 transition-[border-color,box-shadow,transform] group-hover:-translate-y-0.5 group-hover:border-border-strong group-hover:shadow-pop">
        <div className="flex flex-wrap items-center gap-1.5">
          <AssessmentStatusBadge status={p.status} />
          {p.component && <Badge variant="brand">{p.component.name}</Badge>}
          <span className="ml-auto text-[11.5px] text-muted-foreground">{formatRelative(p.updatedAt)}</span>
        </div>
        <h3 className="mt-3 line-clamp-2 font-display text-[15.5px] font-semibold leading-snug tracking-tight">{p.title}</h3>
        <p className="mt-1 truncate text-[13px] text-muted-foreground">
          {p.subject.name} · {p.classLevel.name} · {p.term.name}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-4 text-[12.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 tabular">
            <ListOrdered className="size-3.5" /> {p.questionCount} questions
          </span>
          <span className="inline-flex items-center gap-1.5 tabular font-medium text-foreground">{p.totalMarks} marks</span>
          <span className="inline-flex items-center gap-1.5 tabular">
            <Clock className="size-3.5" /> {p.durationMinutes} min
          </span>
        </div>
      </Card>
    </Link>
  );
}
