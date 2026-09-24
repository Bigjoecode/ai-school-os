import type { CurriculumSummary } from '@aischool/shared';
import { BookOpen, FilePlus2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { type Column, DataTable } from '@/components/ui/data-table';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCan } from '@/lib/auth-store';
import { formatRelative } from '@/lib/format';
import { useStructure } from '../academics/api';
import { LevelSelect, SubjectSelect } from '../planning/pickers';
import { ContentStatusBadge, GenerationIndicator, SourceBadge, useSearchFlag } from '../planning/ui';
import { useCurricula } from './api';
import { BlankCurriculumDialog, GenerateCurriculumDialog } from './curriculum-dialogs';

export default function CurriculumPage() {
  const navigate = useNavigate();
  const canManage = useCan('curriculum.manage');
  const canAi = useCan('ai.use');
  const [classLevelId, setClassLevelId] = useState<string | undefined>();
  const [subjectId, setSubjectId] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [generateOpen, setGenerateOpen] = useSearchFlag('new');
  const [blankOpen, setBlankOpen] = useState(false);

  const structure = useStructure();
  const list = useCurricula({ classLevelId, subjectId, status });
  const filtered = !!(classLevelId || subjectId || status);
  const rows = list.data;

  const columns: Column<CurriculumSummary>[] = [
    {
      key: 'subject',
      header: 'Curriculum',
      cell: (c) => (
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft font-mono text-[11px] font-semibold text-brand">
            {c.subject.code.slice(0, 4)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{c.subject.name}</p>
            <p className="truncate text-[12px] text-muted-foreground">{c.title}</p>
          </div>
        </div>
      ),
    },
    { key: 'class', header: 'Class', cell: (c) => c.classLevel.name },
    { key: 'version', header: 'Version', cell: (c) => <span className="tabular text-muted-foreground">v{c.version}</span> },
    { key: 'source', header: 'Source', cell: (c) => <SourceBadge source={c.source} /> },
    {
      key: 'units',
      header: 'Weeks',
      cell: (c) => <span className="tabular text-muted-foreground">{c.unitCount}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (c) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <ContentStatusBadge status={c.status} />
          <GenerationIndicator state={c.generation} />
        </div>
      ),
    },
    {
      key: 'updated',
      header: 'Updated',
      headClassName: 'text-right',
      className: 'text-right text-[12.5px] text-muted-foreground whitespace-nowrap',
      cell: (c) => formatRelative(c.updatedAt),
    },
  ];

  const generateButton = canManage && canAi && (
    <Button variant="ai" onClick={() => setGenerateOpen(true)}>
      <Sparkles /> Generate with AI
    </Button>
  );

  return (
    <Page>
      <PageHeader
        title="Curriculum"
        description="What every class learns in each subject, term by term and week by week."
        actions={
          canManage && (
            <>
              <Button variant="outline" onClick={() => setBlankOpen(true)}>
                <FilePlus2 /> Start blank
              </Button>
              {generateButton}
            </>
          )
        }
      />

      <Card className="overflow-hidden">
        <div className="grid grid-cols-1 gap-3 border-b border-border p-4 sm:flex sm:flex-wrap sm:items-center">
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
          <Select value={status ?? NONE} onValueChange={(v) => setStatus(v === NONE ? undefined : v)}>
            <SelectTrigger className="sm:w-40" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Draft & published</SelectItem>
              <SelectItem value="DRAFT">Drafts</SelectItem>
              <SelectItem value="PUBLISHED">Published</SelectItem>
              <SelectItem value="ARCHIVED">Archived</SelectItem>
            </SelectContent>
          </Select>
          {rows && (
            <p className="text-[12.5px] text-muted-foreground sm:ml-auto">
              {rows.length} curricul{rows.length === 1 ? 'um' : 'a'}
            </p>
          )}
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => void list.refetch()}
          onRowClick={(c) => navigate(`/curriculum/${c.id}`)}
          rowLabel={(c) => `Open ${c.title}`}
          renderMobile={(c) => (
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft font-mono text-[11px] font-semibold text-brand">
                {c.subject.code.slice(0, 4)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">
                  {c.subject.name} · {c.classLevel.name}
                </p>
                <p className="truncate text-[12px] text-muted-foreground">
                  v{c.version} · {c.unitCount} weeks · {c.source === 'AI' ? 'AI draft' : 'Manual'}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <ContentStatusBadge status={c.status} />
                  <GenerationIndicator state={c.generation} />
                </div>
              </div>
            </div>
          )}
          empty={{
            icon: BookOpen,
            title: filtered ? 'No curricula match' : 'No curricula yet',
            description: filtered
              ? 'Try another class, subject or status.'
              : 'No curricula yet — let AI draft one in about two minutes, or start from a blank page.',
            action: !filtered && canManage ? (generateButton || undefined) : undefined,
          }}
        />
      </Card>

      {canManage && (
        <>
          <GenerateCurriculumDialog
            open={generateOpen}
            onOpenChange={setGenerateOpen}
            defaults={{ subjectId, classLevelId }}
          />
          <BlankCurriculumDialog open={blankOpen} onOpenChange={setBlankOpen} defaults={{ subjectId, classLevelId }} />
        </>
      )}
    </Page>
  );
}
