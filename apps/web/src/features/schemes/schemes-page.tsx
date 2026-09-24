import type { SchemeSummary } from '@aischool/shared';
import { NotebookPen, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { type Column, DataTable } from '@/components/ui/data-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCan } from '@/lib/auth-store';
import { formatRelative } from '@/lib/format';
import { useStructure } from '../academics/api';
import { currentTerm, LevelSelect, SubjectSelect, termOptions } from '../planning/pickers';
import { ContentStatusBadge, GenerationIndicator, useSearchFlag } from '../planning/ui';
import { useSchemes } from './api';
import { GenerateSchemeDialog } from './scheme-dialogs';

const ALL_TERMS = '__all__';

export default function SchemesPage() {
  const navigate = useNavigate();
  const canManage = useCan('curriculum.manage');
  const canAi = useCan('ai.use');
  const structure = useStructure();
  const [termId, setTermId] = useState<string | undefined>();
  const [classLevelId, setClassLevelId] = useState<string | undefined>();
  const [subjectId, setSubjectId] = useState<string | undefined>();
  const [generateOpen, setGenerateOpen] = useSearchFlag('new');

  // Default to the current term once the structure is known.
  useEffect(() => {
    if (termId === undefined && structure.data) setTermId(currentTerm(structure.data)?.id ?? ALL_TERMS);
  }, [structure.data, termId]);

  const effectiveTerm = termId === ALL_TERMS ? undefined : termId;
  const ready = termId !== undefined || (!structure.isLoading && !structure.data);
  const list = useSchemes({ termId: effectiveTerm, classLevelId, subjectId }, ready);
  const rows = list.data;
  const terms = termOptions(structure.data);
  const filtered = !!(classLevelId || subjectId);

  const columns: Column<SchemeSummary>[] = [
    {
      key: 'subject',
      header: 'Scheme',
      cell: (s) => (
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft font-mono text-[11px] font-semibold text-brand">
            {s.subject.code.slice(0, 4)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">
              {s.subject.name} · {s.classLevel.name}
            </p>
            <p className="truncate text-[12px] text-muted-foreground">{s.title}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'term',
      header: 'Term',
      cell: (s) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {s.term.name} · {s.term.sessionName}
        </span>
      ),
    },
    { key: 'weeks', header: 'Weeks', cell: (s) => <span className="tabular text-muted-foreground">{s.weekCount}</span> },
    {
      key: 'curriculum',
      header: 'Curriculum',
      cell: (s) =>
        s.curriculum ? (
          <span className="text-muted-foreground">v{s.curriculum.version}</span>
        ) : (
          <span className="text-[12.5px] text-muted-foreground/80">National</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (s) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <ContentStatusBadge status={s.status} />
          <GenerationIndicator state={s.generation} />
        </div>
      ),
    },
    {
      key: 'updated',
      header: 'Updated',
      headClassName: 'text-right',
      className: 'text-right text-[12.5px] text-muted-foreground whitespace-nowrap',
      cell: (s) => formatRelative(s.updatedAt),
    },
  ];

  const generateButton = canManage && canAi && (
    <Button variant="ai" onClick={() => setGenerateOpen(true)}>
      <Sparkles /> Generate scheme
    </Button>
  );

  return (
    <Page>
      <PageHeader
        title="Scheme of Work"
        description="Termly, week-by-week teaching plans with real dates — built from your curriculum."
        actions={generateButton}
      />
      <Card className="overflow-hidden">
        <div className="grid grid-cols-1 gap-3 border-b border-border p-4 sm:flex sm:flex-wrap sm:items-center">
          <Select value={termId ?? ''} onValueChange={setTermId} disabled={!structure.data}>
            <SelectTrigger className="sm:w-60" aria-label="Filter by term">
              <SelectValue placeholder="Loading terms…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TERMS}>All terms</SelectItem>
              {terms.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                  {t.isCurrent ? ' (current)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <LevelSelect
            structure={structure.data}
            value={classLevelId}
            onChange={setClassLevelId}
            allLabel="All classes"
            className="sm:w-44"
            aria-label="Filter by class level"
          />
          <SubjectSelect
            structure={structure.data}
            value={subjectId}
            onChange={setSubjectId}
            allLabel="All subjects"
            className="sm:w-52"
            aria-label="Filter by subject"
          />
          {rows && (
            <p className="text-[12.5px] text-muted-foreground sm:ml-auto">
              {rows.length} scheme{rows.length === 1 ? '' : 's'}
            </p>
          )}
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(s) => s.id}
          loading={list.isLoading || !ready}
          error={list.error}
          onRetry={() => void list.refetch()}
          onRowClick={(s) => navigate(`/schemes/${s.id}`)}
          rowLabel={(s) => `Open ${s.title}`}
          renderMobile={(s) => (
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft font-mono text-[11px] font-semibold text-brand">
                {s.subject.code.slice(0, 4)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">
                  {s.subject.name} · {s.classLevel.name}
                </p>
                <p className="truncate text-[12px] text-muted-foreground">
                  {s.term.name} · {s.weekCount} weeks
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <ContentStatusBadge status={s.status} />
                  <GenerationIndicator state={s.generation} />
                </div>
              </div>
            </div>
          )}
          empty={{
            icon: NotebookPen,
            title: filtered ? 'No schemes match' : 'No schemes of work for this term yet',
            description: filtered
              ? 'Try another class or subject.'
              : 'Pick a subject and class — AI plans the whole term, week by week, in a couple of minutes.',
            action: !filtered ? (generateButton || undefined) : undefined,
          }}
        />
      </Card>

      {canManage && canAi && (
        <GenerateSchemeDialog
          open={generateOpen}
          onOpenChange={setGenerateOpen}
          defaults={{ subjectId, classLevelId, termId: effectiveTerm }}
        />
      )}
    </Page>
  );
}
