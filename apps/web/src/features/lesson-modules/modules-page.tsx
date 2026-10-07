import type { ModuleSummary } from '@aischool/shared';
import { BookOpenCheck, ClipboardCheck, Copy, Film, Library, NotebookPen, Plus, Presentation, Sparkles, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { useModuleAction, useModuleLibrary, useModuleOptions, useModules } from './api';
import { AiDraftDialog, CopyDialog, ModuleDialog } from './dialogs';

export const STATUS_BADGE = { DRAFT: <Badge variant="warning">Draft</Badge>, PUBLISHED: <Badge variant="success">Published</Badge>, ARCHIVED: <Badge variant="outline">Archived</Badge> } as const;

/** One module as a row: what's in it and how the class is getting on. */
export function ModuleCard({ m, actions }: { m: ModuleSummary; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <Link to={`/modules/${m.id}`} className="flex min-w-0 flex-1 items-start gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
          <BookOpenCheck className="size-5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="min-w-0 break-words text-[14px] font-medium">{m.title}</span>
            {!m.library && STATUS_BADGE[m.status]}
            {m.source === 'AI' && <Badge variant="ai">AI draft</Badge>}
          </span>
          <span className="block text-[12.5px] text-muted-foreground">
            {[m.class?.label ?? m.classLevel.name, m.subject.name, m.topic?.name, m.week ? `Week ${m.week}` : null].filter(Boolean).join(' · ')}
          </span>
          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-muted-foreground">
            <span>{m.stepCount} steps</span>
            {m.checkInCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <ClipboardCheck className="size-3" /> {m.checkInCount} check-in{m.checkInCount === 1 ? '' : 's'}
              </span>
            )}
            {m.videoQuizCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Film className="size-3" /> video quiz
              </span>
            )}
            {m.stats && m.stats.students > 0 && (
              <span className="inline-flex items-center gap-1">
                <Users className="size-3" /> {m.stats.completed}/{m.stats.students} finished{m.stats.averageScore !== null ? ` · avg ${m.stats.averageScore}%` : ''}
              </span>
            )}
            {m.stats && m.stats.sessions > 0 && (
              <span className="inline-flex items-center gap-1">
                <Presentation className="size-3" /> taught {m.stats.sessions}× {m.stats.lastSessionAt ? `(last ${formatDate(m.stats.lastSessionAt, { day: 'numeric', month: 'short' })})` : ''}
              </span>
            )}
            {m.library && m.createdBy && <span>Shared by {m.createdBy}</span>}
          </span>
        </span>
      </Link>
      {actions && <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">{actions}</div>}
    </div>
  );
}

/** Teachers' lesson modules by class and subject, and the school's content library. */
export default function ModulesPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'library' ? 'library' : 'mine';
  const options = useModuleOptions();
  const o = options.data;
  const classArmId = params.get('classArmId') ?? '';
  const subjectId = params.get('subjectId') ?? '';
  const cls = o?.classes.find((c) => c.classArmId === classArmId);
  const [newOpen, setNewOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [libNew, setLibNew] = useState(false);
  const patch = (next: Record<string, string | null>) =>
    setParams(
      (p) => {
        const q = new URLSearchParams(p);
        for (const [k, v] of Object.entries(next)) v ? q.set(k, v) : q.delete(k);
        return q;
      },
      { replace: true },
    );
  useEffect(() => {
    if (!o?.classes.length || tab !== 'mine') return;
    const c = o.classes.find((x) => x.classArmId === classArmId) ?? o.classes[0]!;
    const s = c.subjects.find((x) => x.id === subjectId) ?? c.subjects[0];
    if (c.classArmId !== classArmId || s?.id !== subjectId) patch({ classArmId: c.classArmId, subjectId: s?.id ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o, classArmId, subjectId, tab]);

  return (
    <Page>
      <PageHeader
        eyebrow="Academics"
        title="Lesson modules"
        description="Lesson units to teach in class from your workbook — notes, videos and materials with quick check-ins — which students can also work through at their own pace."
        actions={
          o && (
            <>
              <Button asChild variant="outline">
                <Link to={`/workbook${classArmId ? `?classArmId=${classArmId}&subjectId=${subjectId}` : ''}`}>
                  <NotebookPen /> Weekly workbook
                </Link>
              </Button>
              {o.canAi && o.classes.length > 0 && (
                <Button variant="ai" onClick={() => setAiOpen(true)}>
                  <Sparkles /> Draft with AI
                </Button>
              )}
              {o.classes.length > 0 && (
                <Button variant="brand" onClick={() => setNewOpen(true)}>
                  <Plus /> New module
                </Button>
              )}
            </>
          )
        }
      />
      <Tabs value={tab} onValueChange={(v) => patch({ tab: v === 'library' ? 'library' : null })}>
        <TabsList className="mb-4">
          <TabsTrigger value="mine">
            <BookOpenCheck /> My classes
          </TabsTrigger>
          <TabsTrigger value="library">
            <Library /> Content library
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {options.error && !o ? (
        <ErrorState error={options.error} onRetry={() => void options.refetch()} />
      ) : !o ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : tab === 'library' ? (
        <LibraryTab onNew={() => setLibNew(true)} />
      ) : !o.classes.length ? (
        <Card>
          <EmptyState icon={BookOpenCheck} title="No classes to show" description="Lesson modules are made for the classes and subjects you teach. Ask the school admin to assign you to your classes in Academic Setup." />
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <Select value={classArmId} onValueChange={(v) => patch({ classArmId: v })}>
              <SelectTrigger aria-label="Class" className="h-9 w-full sm:w-[180px]">
                <SelectValue placeholder="Class" />
              </SelectTrigger>
              <SelectContent>
                {o.classes.map((c) => (
                  <SelectItem key={c.classArmId} value={c.classArmId}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={subjectId} onValueChange={(v) => patch({ subjectId: v })}>
              <SelectTrigger aria-label="Subject" className="h-9 w-full sm:w-[220px]">
                <SelectValue placeholder="Subject" />
              </SelectTrigger>
              <SelectContent>
                {(cls?.subjects ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {cls && subjectId && <ClassList classArmId={classArmId} subjectId={subjectId} onNew={() => setNewOpen(true)} />}
        </>
      )}
      {o && (
        <>
          <ModuleDialog open={newOpen} onOpenChange={setNewOpen} options={o} defaults={{ classArmId, subjectId }} />
          <ModuleDialog open={libNew} onOpenChange={setLibNew} options={o} defaults={{ library: true }} />
          <AiDraftDialog open={aiOpen} onOpenChange={setAiOpen} options={o} defaults={{ classArmId, subjectId }} />
        </>
      )}
    </Page>
  );
}

function ClassList({ classArmId, subjectId, onNew }: { classArmId: string; subjectId: string; onNew: () => void }) {
  const q = useModules({ classArmId, subjectId });
  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-60 rounded-2xl" />;
  if (!q.data.length)
    return (
      <Card>
        <EmptyState
          icon={BookOpenCheck}
          title="No modules for this class yet"
          description="Create one, draft one with AI from this week’s topic, or copy a ready-made module from the content library."
          action={
            <Button variant="brand" onClick={onNew}>
              <Plus /> New module
            </Button>
          }
        />
      </Card>
    );
  return (
    <Card className="divide-y divide-border p-0">
      {q.data.map((m) => (
        <ModuleCard key={m.id} m={m} />
      ))}
    </Card>
  );
}

function LibraryTab({ onNew }: { onNew: () => void }) {
  const o = useModuleOptions().data!;
  const [subjectId, setSubject] = useState<string | undefined>();
  const [classLevelId, setLevel] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const q = useModuleLibrary({ subjectId, classLevelId, q: useDebounced(search) || undefined });
  const act = useModuleAction();
  const navigate = useNavigate();
  const [copying, setCopying] = useState<ModuleSummary | null>(null);
  const levels = useMemo(() => o.levels, [o]);
  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search the library" className="sm:w-64" label="Search the library" />
        <Select value={subjectId ?? NONE} onValueChange={(v) => setSubject(v === NONE ? undefined : v)}>
          <SelectTrigger aria-label="Subject" className="h-9 w-full sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All subjects</SelectItem>
            {o.subjects.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={classLevelId ?? NONE} onValueChange={(v) => setLevel(v === NONE ? undefined : v)}>
          <SelectTrigger aria-label="Class level" className="h-9 w-full sm:w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All classes</SelectItem>
            {levels.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {o.canLibrary && (
          <Button variant="outline" className="sm:ml-auto" onClick={onNew}>
            <Plus /> Add to the library
          </Button>
        )}
      </div>
      <p className="mb-3 text-[12.5px] text-muted-foreground">
        Modules the school’s academic leads and heads of department have shared for every teacher of a subject. Copy one into your class to teach it; shared study materials can be added to any module as a step.
      </p>
      {q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Skeleton className="h-60 rounded-2xl" />
      ) : !q.data.length ? (
        <Card>
          <EmptyState icon={Library} title="Nothing in the library yet" description={o.canLibrary ? 'Share a finished module from its page (“Share to library”), or add one here.' : 'When academic leads share modules for your subjects, they appear here.'} />
        </Card>
      ) : (
        <Card className="divide-y divide-border p-0">
          {q.data.map((m) => (
            <ModuleCard
              key={m.id}
              m={m}
              actions={
                <Button size="sm" variant="outline" onClick={() => setCopying(m)}>
                  <Copy /> Copy to my class
                </Button>
              }
            />
          ))}
        </Card>
      )}
      {copying && (
        <CopyDialog
          open={!!copying}
          onOpenChange={(v) => !v && setCopying(null)}
          options={o}
          subjectId={copying.subject.id}
          classLevelId={copying.classLevel.id}
          pending={act.isPending}
          onCopy={(classArmId) =>
            act.mutate(
              { id: copying.id, action: 'copy', body: { classArmId } },
              {
                onSuccess: (r) => {
                  toast.success('Copied into your class as a draft');
                  setCopying(null);
                  if (r && 'id' in r) navigate(`/modules/${r.id}`);
                },
                onError: (e) => toast.error(errorMessage(e)),
              },
            )
          }
        />
      )}
    </>
  );
}
