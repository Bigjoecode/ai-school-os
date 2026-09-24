import type { SchemeDetail, SchemeWeek } from '@aischool/shared';
import { BookOpen, CircleCheck, Globe2, MoreHorizontal, NotebookPen, Pencil, Presentation, RotateCw, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Page } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';
import { InlineTitle, RegenerateDialog } from '../planning/detail-bits';
import { termDates } from '../planning/pickers';
import {
  BackLink,
  BulletList,
  Chips,
  ContentStatusBadge,
  DetailSkeleton,
  FailedPanel,
  GeneratingPanel,
  isGenerating,
  SourceBadge,
} from '../planning/ui';
import { WeekSheet } from '../planning/week-sheet';
import { type PlanLessonDefaults, PlanLessonDialog } from '../lessons/lesson-dialogs';
import { useDeleteScheme, useRegenerateScheme, useScheme, useUpdateScheme, useUpdateSchemeWeek } from './api';

export default function SchemeDetailPage() {
  const { id = '' } = useParams();
  const query = useScheme(id);
  const s = query.data;

  if (query.isLoading) {
    return (
      <Page className="max-w-5xl">
        <DetailSkeleton />
      </Page>
    );
  }
  if (!s) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <Page className="max-w-5xl">
        <BackLink to="/schemes">Scheme of Work</BackLink>
        {notFound ? (
          <EmptyState icon={NotebookPen} title="Scheme not found" description="It may have been deleted." />
        ) : (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        )}
      </Page>
    );
  }
  return <SchemeView s={s} />;
}

function SchemeView({ s }: { s: SchemeDetail }) {
  const navigate = useNavigate();
  const canManage = useCan('curriculum.manage');
  const canAi = useCan('ai.use');
  const canPlan = useCan('lessons.manage') && canAi;
  const update = useUpdateScheme(s.id);
  const regenerate = useRegenerateScheme(s.id);
  const remove = useDeleteScheme();
  const updateWeek = useUpdateSchemeWeek(s.id);

  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [editing, setEditing] = useState<SchemeWeek | null>(null);
  const [planFor, setPlanFor] = useState<PlanLessonDefaults | null>(null);

  const generating = isGenerating(s.generation);
  const isDraft = s.status === 'DRAFT';
  const editable = canManage && s.status !== 'ARCHIVED' && !generating;
  const weeks = [...s.weeks].sort((a, b) => a.week - b.week);
  const totalLessons = weeks.reduce((n, w) => n + w.lessonCount, 0);

  const doRegenerate = (guidance?: string) => regenerate.mutate(guidance, { onSuccess: () => setRegenOpen(false) });

  return (
    <Page className="max-w-5xl">
      <div className="mb-6 space-y-3 sm:mb-8">
        <BackLink to="/schemes">Scheme of Work</BackLink>
        <div className="flex flex-wrap items-center gap-1.5">
          <ContentStatusBadge status={s.status} />
          <Badge variant="outline">
            {s.term.name} · {s.term.sessionName}
          </Badge>
          <SourceBadge source={s.source} />
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <InlineTitle value={s.title} editable={editable} pending={update.isPending} onSave={(title) => update.mutateAsync({ title })} />
            <p className="mt-1.5 text-[14px] text-muted-foreground">
              {s.subject.name} · {s.classLevel.name} · {termDates(s.term)} · {s.weekCount} weeks
              {totalLessons > 0 && ` · ${totalLessons} lesson plan${totalLessons === 1 ? '' : 's'}`}
            </p>
          </div>
          {canManage && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {isDraft && !generating && (
                <Button onClick={() => setPublishOpen(true)} disabled={weeks.length === 0}>
                  <CircleCheck /> Publish
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="More actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {s.status === 'PUBLISHED' && (
                    <DropdownMenuItem onSelect={() => update.mutate({ status: 'DRAFT' })}>
                      <Pencil /> Move back to draft
                    </DropdownMenuItem>
                  )}
                  {/* The API regenerates and deletes drafts only. */}
                  {canAi && s.status === 'DRAFT' && (
                    <DropdownMenuItem disabled={generating} onSelect={() => setRegenOpen(true)}>
                      <RotateCw /> Regenerate with AI
                    </DropdownMenuItem>
                  )}
                  {s.status !== 'PUBLISHED' && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => setDeleteOpen(true)}>
                        <Trash2 /> Delete scheme
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {s.curriculum ? (
          <Link
            to={`/curriculum/${s.curriculum.id}`}
            className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-[12.5px] text-muted-foreground shadow-xs transition-colors hover:border-border-strong hover:text-foreground"
          >
            <BookOpen className="size-3.5 shrink-0 text-brand" />
            <span className="truncate">
              Built from {s.subject.name} — {s.classLevel.name} v{s.curriculum.version}
            </span>
          </Link>
        ) : (
          <p className="inline-flex max-w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-1.5 text-[12.5px] text-muted-foreground">
            <Globe2 className="size-3.5 shrink-0" />
            <span className="truncate">No curriculum on record — planned from the national curriculum</span>
          </p>
        )}
      </div>

      {generating ? (
        <GeneratingPanel noun="scheme of work" state={s.generation} />
      ) : (
        <div className="space-y-4">
          {s.generation === 'FAILED' && (
            <FailedPanel
              noun="scheme of work"
              message={s.generationError}
              onRetry={canManage && canAi ? () => doRegenerate(s.guidance ?? undefined) : undefined}
              retrying={regenerate.isPending}
            />
          )}
          {weeks.length === 0 ? (
            s.generation !== 'FAILED' && (
              <Card>
                <EmptyState
                  icon={NotebookPen}
                  title="No weeks yet"
                  description="Regenerate this scheme with AI to plan the term."
                  action={
                    canManage && canAi ? (
                      <Button variant="ai" onClick={() => setRegenOpen(true)}>
                        <Sparkles /> Generate weeks
                      </Button>
                    ) : undefined
                  }
                />
              </Card>
            )
          ) : (
            <ol className="relative space-y-3" aria-label="Weeks">
              <span aria-hidden className="absolute bottom-6 left-[27px] top-6 hidden w-px bg-border sm:block" />
              {weeks.map((w) => (
                <WeekItem
                  key={w.id}
                  week={w}
                  editable={editable}
                  canPlan={canPlan}
                  onEdit={() => setEditing(w)}
                  onPlan={() =>
                    setPlanFor({ subjectId: s.subject.id, classLevelId: s.classLevel.id, schemeId: s.id, schemeWeekId: w.id })
                  }
                />
              ))}
            </ol>
          )}
        </div>
      )}

      <ConfirmDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        destructive={false}
        title="Publish this scheme of work?"
        description={`Teachers of ${s.subject.name} in ${s.classLevel.name} will see it as the plan for ${s.term.name}.`}
        confirmLabel="Publish"
        loading={update.isPending}
        onConfirm={() => update.mutate({ status: 'PUBLISHED' }, { onSuccess: () => setPublishOpen(false) })}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this scheme of work?"
        description="All of its weeks will be deleted. Lesson plans already written are kept but lose their link to the week."
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(s.id, {
            onSuccess: () => {
              setDeleteOpen(false);
              navigate('/schemes');
            },
          })
        }
      />
      <RegenerateDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        noun="scheme of work"
        pending={regenerate.isPending}
        defaultGuidance={s.guidance}
        onConfirm={doRegenerate}
      />
      <WeekSheet
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing ? `Week ${editing.week}${editing.startsOn ? ` · ${formatDate(editing.startsOn, { year: undefined })}` : ''}` : 'Edit week'}
        initial={editing ? { ...editing, assessment: editing.evaluation } : undefined}
        assessmentLabel="Evaluation"
        pending={updateWeek.isPending}
        onSubmit={({ termOrder: _t, week: _w, assessment, ...content }) =>
          updateWeek.mutateAsync({ weekId: editing!.id, ...content, evaluation: assessment })
        }
      />
      {canPlan && <PlanLessonDialog open={!!planFor} onOpenChange={(o) => !o && setPlanFor(null)} defaults={planFor ?? undefined} />}
    </Page>
  );
}

function WeekItem({
  week: w,
  editable,
  canPlan,
  onEdit,
  onPlan,
}: {
  week: SchemeWeek;
  editable: boolean;
  canPlan: boolean;
  onEdit: () => void;
  onPlan: () => void;
}) {
  const sections: [string, string[]][] = [
    ['Objectives', w.objectives],
    ['Activities', w.activities],
    ['Resources', w.resources],
    ['Evaluation', w.evaluation],
  ];
  return (
    <li className="relative flex gap-4">
      <div
        className="relative z-10 hidden w-14 shrink-0 flex-col items-center rounded-xl border border-border bg-card py-2 text-center shadow-xs sm:flex"
        aria-hidden
      >
        <span className="text-[9.5px] font-medium uppercase tracking-wider text-muted-foreground">Week</span>
        <span className="font-display text-lg font-semibold leading-tight tabular">{w.week}</span>
        {w.startsOn && <span className="text-[10.5px] text-muted-foreground">{formatDate(w.startsOn, { year: undefined })}</span>}
      </div>
      <Card className="min-w-0 flex-1">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:p-5">
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-[12px] font-medium text-muted-foreground">
              Week {w.week}
              {w.startsOn && ` · ${formatDate(w.startsOn, { year: undefined })}`}
            </p>
            <h3 className="font-display text-[15px] font-semibold leading-snug tracking-tight">{w.topic}</h3>
            <Chips items={w.subtopics} />
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {w.lessonCount > 0 && (
              <Badge variant="brand" className="gap-1">
                <Presentation /> {w.lessonCount} lesson{w.lessonCount === 1 ? '' : 's'}
              </Badge>
            )}
            {editable && (
              <Button size="icon-sm" variant="ghost" aria-label={`Edit week ${w.week}`} onClick={onEdit}>
                <Pencil />
              </Button>
            )}
            {canPlan && (
              <Button size="sm" variant="outline" onClick={onPlan} className="ai-border">
                <Sparkles className="text-ai-2" /> Plan a lesson
              </Button>
            )}
          </div>
        </div>
        <div className="grid gap-5 border-t border-border p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
          {sections.map(([label, items]) => (
            <div key={label} className="min-w-0">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
              <BulletList items={items} className="text-[13px]" empty="—" />
            </div>
          ))}
        </div>
      </Card>
    </li>
  );
}
