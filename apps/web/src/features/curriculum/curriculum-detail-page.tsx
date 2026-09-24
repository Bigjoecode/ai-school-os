import type { CurriculumDetail, CurriculumUnit } from '@aischool/shared';
import {
  BookOpen,
  CalendarRange,
  ChevronDown,
  CircleCheck,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  Plus,
  RotateCw,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Page } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { FormDialog } from '@/components/ui/form-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useStructure } from '../academics/api';
import { InlineTitle, RegenerateDialog } from '../planning/detail-bits';
import { termByOrder } from '../planning/pickers';
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
import { GenerateSchemeDialog } from '../schemes/scheme-dialogs';
import {
  useAddUnit,
  useCurriculum,
  useDeleteCurriculum,
  useDeleteUnit,
  useRegenerateCurriculum,
  useUpdateCurriculum,
  useUpdateUnit,
} from './api';

const TERMS = [1, 2, 3] as const;

export default function CurriculumDetailPage() {
  const { id = '' } = useParams();
  const query = useCurriculum(id);
  const c = query.data;

  if (query.isLoading) {
    return (
      <Page className="max-w-5xl">
        <DetailSkeleton />
      </Page>
    );
  }
  if (!c) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <Page className="max-w-5xl">
        <BackLink to="/curriculum">Curriculum</BackLink>
        {notFound ? (
          <EmptyState icon={BookOpen} title="Curriculum not found" description="It may have been deleted." />
        ) : (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        )}
      </Page>
    );
  }
  return <CurriculumView c={c} />;
}

function CurriculumView({ c }: { c: CurriculumDetail }) {
  const navigate = useNavigate();
  const canManage = useCan('curriculum.manage');
  const canAi = useCan('ai.use');
  const structure = useStructure();
  const update = useUpdateCurriculum(c.id);
  const regenerate = useRegenerateCurriculum(c.id);
  const remove = useDeleteCurriculum();
  const addUnit = useAddUnit(c.id);
  const updateUnit = useUpdateUnit(c.id);
  const deleteUnit = useDeleteUnit(c.id);

  const [tab, setTab] = useState('1');
  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [overviewDraft, setOverviewDraft] = useState('');
  const [editing, setEditing] = useState<CurriculumUnit | null>(null);
  const [adding, setAdding] = useState<{ termOrder: number; week: number } | null>(null);
  const [removing, setRemoving] = useState<CurriculumUnit | null>(null);
  const [schemeTerm, setSchemeTerm] = useState<number | null>(null);

  const generating = isGenerating(c.generation);
  const isDraft = c.status === 'DRAFT';
  const editable = canManage && c.status !== 'ARCHIVED' && !generating;
  const byTerm = (t: number) => c.units.filter((u) => u.termOrder === t).sort((a, b) => a.week - b.week);

  const doRegenerate = (guidance?: string) =>
    regenerate.mutate(guidance, { onSuccess: () => setRegenOpen(false) });

  return (
    <Page className="max-w-5xl">
      <div className="mb-6 space-y-3 sm:mb-8">
        <BackLink to="/curriculum">Curriculum</BackLink>
        <div className="flex flex-wrap items-center gap-1.5">
          <ContentStatusBadge status={c.status} />
          <Badge variant="outline" className="tabular">
            Version {c.version}
          </Badge>
          <SourceBadge source={c.source} />
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <InlineTitle
              value={c.title}
              editable={editable}
              pending={update.isPending}
              onSave={(title) => update.mutateAsync({ title })}
            />
            <p className="mt-1.5 text-[14px] text-muted-foreground">
              {c.subject.name} · {c.classLevel.name} · {c.weeksPerTerm} weeks per term · updated {formatRelative(c.updatedAt)}
            </p>
          </div>
          {canManage && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {isDraft && !generating && (
                <Button onClick={() => setPublishOpen(true)} disabled={c.units.length === 0}>
                  <CircleCheck /> Publish
                </Button>
              )}
              {(isDraft || c.status === 'ARCHIVED') && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" aria-label="More actions">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isDraft && canAi && (
                      <DropdownMenuItem disabled={generating} onSelect={() => setRegenOpen(true)}>
                        <RotateCw /> Regenerate with AI
                      </DropdownMenuItem>
                    )}
                    {isDraft && canAi && <DropdownMenuSeparator />}
                    <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => setDeleteOpen(true)}>
                      <Trash2 /> Delete curriculum
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </div>
      </div>

      {generating ? (
        <GeneratingPanel noun="curriculum" state={c.generation} />
      ) : (
        <div className="space-y-6">
          {c.generation === 'FAILED' && (
            <FailedPanel
              noun="curriculum"
              message={c.generationError}
              onRetry={canManage && canAi && isDraft ? () => doRegenerate(c.guidance ?? undefined) : undefined}
              retrying={regenerate.isPending}
            />
          )}

          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
              {editable && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setOverviewDraft(c.overview ?? '');
                    setOverviewOpen(true);
                  }}
                >
                  <Pencil /> Edit
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {c.overview ? (
                <p className="whitespace-pre-line text-[14px] leading-relaxed text-foreground/90">{c.overview}</p>
              ) : (
                <p className="text-[13px] italic text-muted-foreground">No overview yet. Describe the aims of this curriculum for teachers and parents.</p>
              )}
            </CardContent>
          </Card>

          <Tabs value={tab} onValueChange={setTab}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <TabsList aria-label="Terms">
                {TERMS.map((t) => (
                  <TabsTrigger key={t} value={String(t)}>
                    Term {t}
                    <span className="rounded-full bg-muted px-1.5 text-[10.5px] tabular text-muted-foreground">{byTerm(t).length}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  {editable && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const t = Number(tab);
                        const last = byTerm(t).at(-1)?.week ?? 0;
                        setAdding({ termOrder: t, week: last + 1 });
                      }}
                    >
                      <Plus /> Add week
                    </Button>
                  )}
                  {canAi && c.units.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => setSchemeTerm(Number(tab))}>
                      <NotebookPen /> Create scheme of work
                    </Button>
                  )}
                </div>
              )}
            </div>
            {TERMS.map((t) => {
              const units = byTerm(t);
              return (
                <TabsContent key={t} value={String(t)}>
                  {units.length === 0 ? (
                    <Card>
                      <EmptyState
                        icon={CalendarRange}
                        compact
                        title={`Nothing planned for term ${t} yet`}
                        description={editable ? 'Add the first week, or regenerate the draft with AI.' : undefined}
                        action={
                          editable ? (
                            <Button size="sm" onClick={() => setAdding({ termOrder: t, week: 1 })}>
                              <Plus /> Add week 1
                            </Button>
                          ) : undefined
                        }
                      />
                    </Card>
                  ) : (
                    <ol className="relative space-y-3" aria-label={`Term ${t} weeks`}>
                      <span aria-hidden className="absolute bottom-6 left-[19px] top-6 w-px bg-border sm:left-[23px]" />
                      {units.map((u) => (
                        <UnitItem
                          key={u.id}
                          unit={u}
                          editable={editable}
                          onEdit={() => setEditing(u)}
                          onDelete={() => setRemoving(u)}
                        />
                      ))}
                    </ol>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        </div>
      )}

      {/* ------------------------------------------------------------ dialogs */}
      <ConfirmDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        destructive={false}
        title="Publish this curriculum?"
        description={`Teachers will use version ${c.version} for ${c.subject.name} — ${c.classLevel.name}. If another version is currently published for this subject and class, it will be archived.`}
        confirmLabel="Publish"
        loading={update.isPending}
        onConfirm={() => update.mutate({ status: 'PUBLISHED' }, { onSuccess: () => setPublishOpen(false) })}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this curriculum?"
        description="All of its weeks will be deleted. Schemes of work already built from it are kept."
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(c.id, {
            onSuccess: () => {
              setDeleteOpen(false);
              navigate('/curriculum');
            },
          })
        }
      />
      <RegenerateDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        noun="curriculum"
        pending={regenerate.isPending}
        defaultGuidance={c.guidance}
        onConfirm={doRegenerate}
      />
      <FormDialog
        open={overviewOpen}
        onOpenChange={setOverviewOpen}
        title="Edit overview"
        description="A short summary of the aims and approach of this curriculum."
        icon={<BookOpen />}
        submitLabel="Save overview"
        pending={update.isPending}
        onSubmit={(e) => {
          e?.preventDefault();
          update.mutate({ overview: overviewDraft.trim() }, { onSuccess: () => setOverviewOpen(false) });
        }}
      >
        <Textarea
          aria-label="Overview"
          rows={8}
          maxLength={4000}
          value={overviewDraft}
          onChange={(e) => setOverviewDraft(e.target.value)}
        />
      </FormDialog>
      <WeekSheet
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing ? `Term ${editing.termOrder} · Week ${editing.week}` : 'Edit week'}
        initial={editing ?? undefined}
        pending={updateUnit.isPending}
        onSubmit={({ termOrder: _t, week: _w, ...content }) => updateUnit.mutateAsync({ unitId: editing!.id, ...content })}
      />
      <WeekSheet
        open={!!adding}
        onOpenChange={(o) => !o && setAdding(null)}
        title="Add a week"
        withPosition
        initial={adding ?? undefined}
        submitLabel="Add week"
        pending={addUnit.isPending}
        onSubmit={async (values) => {
          await addUnit.mutateAsync(values);
          setTab(String(values.termOrder));
        }}
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={removing ? `Remove week ${removing.week}?` : 'Remove week?'}
        description={removing ? `“${removing.topic}” will be removed from term ${removing.termOrder}.` : undefined}
        confirmLabel="Remove"
        loading={deleteUnit.isPending}
        onConfirm={() => removing && deleteUnit.mutate(removing.id, { onSuccess: () => setRemoving(null) })}
      />
      {canManage && canAi && (
        <GenerateSchemeDialog
          open={schemeTerm !== null}
          onOpenChange={(o) => !o && setSchemeTerm(null)}
          defaults={{
            subjectId: c.subject.id,
            classLevelId: c.classLevel.id,
            termId: schemeTerm ? termByOrder(structure.data, schemeTerm)?.id : undefined,
          }}
        />
      )}
    </Page>
  );
}

function UnitItem({
  unit,
  editable,
  onEdit,
  onDelete,
}: {
  unit: CurriculumUnit;
  editable: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const detailsId = `unit-${unit.id}`;
  const sections: [string, string[]][] = [
    ['Objectives', unit.objectives],
    ['Activities', unit.activities],
    ['Resources', unit.resources],
    ['Assessment', unit.assessment],
  ];
  const detailCount = sections.reduce((n, [, items]) => n + items.length, 0);

  return (
    <li className="relative flex gap-3 sm:gap-4">
      <div
        className="relative z-10 grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-card text-center shadow-xs sm:size-12"
        aria-hidden
      >
        <div>
          <p className="text-[9px] font-medium uppercase leading-none tracking-wider text-muted-foreground">Wk</p>
          <p className="font-display text-[15px] font-semibold leading-tight tabular sm:text-base">{unit.week}</p>
        </div>
      </div>
      <Card className="min-w-0 flex-1">
        <div className="flex items-start gap-3 p-4 sm:p-5">
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-[11.5px] font-medium text-muted-foreground sm:hidden">Week {unit.week}</p>
            <h3 className="font-display text-[15px] font-semibold leading-snug tracking-tight">
              <span className="sr-only">Week {unit.week}: </span>
              {unit.topic}
            </h3>
            <Chips items={unit.subtopics} />
          </div>
          {editable && (
            <div className="flex shrink-0 gap-0.5">
              <Button size="icon-sm" variant="ghost" aria-label={`Edit week ${unit.week}`} onClick={onEdit}>
                <Pencil />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Remove week ${unit.week}`} onClick={onDelete}>
                <Trash2 />
              </Button>
            </div>
          )}
        </div>
        {detailCount > 0 && (
          <>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={detailsId}
              onClick={() => setOpen((o) => !o)}
              className="flex w-full items-center gap-1.5 border-t border-border px-4 py-2.5 text-left text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
            >
              <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
              {open ? 'Hide details' : 'Objectives, activities, resources & assessment'}
            </button>
            {open && (
              <div id={detailsId} className="grid gap-5 border-t border-border p-4 sm:grid-cols-2 sm:p-5">
                {sections.map(([label, items]) => (
                  <div key={label}>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                    <BulletList items={items} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Card>
    </li>
  );
}
