import type { ModuleResults } from '@aischool/shared';
import { ArrowLeft, Copy, Eye, EyeOff, Library, ListOrdered, MoreHorizontal, Pencil, Presentation, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorMessage } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { startSession, useModule, useModuleAction, useModuleOptions, useModuleResults } from './api';
import { CopyDialog, ModuleDialog } from './dialogs';
import { STATUS_BADGE } from './modules-page';
import { StepEditor } from './step-editor';

/** One module: its steps (editor), and how the class did (results and classroom sessions). */
export default function ModulePage() {
  const { id = '' } = useParams();
  const q = useModule(id);
  const options = useModuleOptions();
  const m = q.data;
  const o = options.data;
  const act = useModuleAction();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'steps' | 'results'>('steps');
  const [details, setDetails] = useState(false);
  const [copy, setCopy] = useState(false);
  const [del, setDel] = useState(false);
  const [starting, setStarting] = useState(false);

  const teach = () => {
    setStarting(true);
    startSession(id)
      .then((s) => navigate(`/present/${s.id}`))
      .catch((e: unknown) => toast.error(errorMessage(e)))
      .finally(() => setStarting(false));
  };
  const run = (action: 'publish' | 'library', body?: unknown, ok?: string) =>
    act.mutate(
      { id, action, body },
      {
        onSuccess: (r) => {
          if (ok) toast.success(ok);
          void q.refetch();
          if (action === 'library' && r && 'id' in r) navigate(`/modules/${r.id}`);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <Page className="max-w-5xl">
      <PageHeader
        eyebrow={
          <Link to={m?.library ? '/modules?tab=library' : `/modules${m?.class ? `?classArmId=${m.class.id}&subjectId=${m.subject.id}` : ''}`} className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" /> {m?.library ? 'Content library' : 'Lesson modules'}
          </Link>
        }
        title={m?.title ?? 'Lesson module'}
        description={m ? [m.class?.label ?? `${m.classLevel.name} (library)`, m.subject.name, m.topic?.name, m.week ? `Week ${m.week}` : null].filter(Boolean).join(' · ') : undefined}
        actions={
          m && (
            <>
              {!m.library && m.canEdit && (
                <Button variant="brand" onClick={teach} loading={starting} disabled={!m.steps.length}>
                  <Presentation /> Teach in class
                </Button>
              )}
              {m.canEdit && !m.library && (
                <Button variant="outline" onClick={() => run('publish', { published: m.status !== 'PUBLISHED', notify: true }, m.status === 'PUBLISHED' ? 'Hidden from students' : 'Published — students can work through it in My lessons')} loading={act.isPending}>
                  {m.status === 'PUBLISHED' ? <EyeOff /> : <Eye />} {m.status === 'PUBLISHED' ? 'Unpublish' : 'Publish to students'}
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="More">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {m.canEdit && (
                    <DropdownMenuItem onSelect={() => setDetails(true)}>
                      <Pencil /> Edit details
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => setCopy(true)}>
                    <Copy /> Copy to a class
                  </DropdownMenuItem>
                  {o?.canLibrary && !m.library && (
                    <DropdownMenuItem onSelect={() => run('library', undefined, 'Shared in the content library')}>
                      <Library /> Share to library
                    </DropdownMenuItem>
                  )}
                  {m.canEdit && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setDel(true)} className="text-danger">
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )
        }
      />
      {q.error && !m ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !m || !o ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
            {!m.library && STATUS_BADGE[m.status]}
            {m.library && <Badge variant="info">Content library</Badge>}
            {m.source === 'AI' && <Badge variant="ai">AI draft — review before publishing</Badge>}
            <span>{m.mustPass ? `Students must score ${m.passMark}% in each check-in to move on` : `Pass mark ${m.passMark}% (not required to move on)`}</span>
            {m.copiedFrom && <span>· Copied from “{m.copiedFrom}”</span>}
            {m.lessonPlan && (
              <Link to={`/lessons/${m.lessonPlan.id}`} className="text-brand hover:underline">
                · Lesson plan: {m.lessonPlan.topic}
              </Link>
            )}
          </div>
          {!m.library && (
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'steps' | 'results')}>
              <TabsList className="mb-4">
                <TabsTrigger value="steps">
                  <ListOrdered /> Steps
                </TabsTrigger>
                <TabsTrigger value="results">
                  <Users /> Results
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          {tab === 'steps' || m.library ? (
            m.canEdit ? (
              <StepEditor m={m} canAi={o.canAi} />
            ) : (
              <Card className="divide-y divide-border p-0">
                {m.steps.map((s, i) => (
                  <p key={s.id} className="p-3 text-[13.5px]">
                    {i + 1}. {s.title} <span className="text-muted-foreground">· {s.kind === 'CHECKIN' ? `check-in (${s.questions.length})` : s.kind.toLowerCase()}</span>
                  </p>
                ))}
              </Card>
            )
          ) : (
            <ResultsTab id={id} />
          )}
          <ModuleDialog open={details} onOpenChange={setDetails} options={o} module={m} />
          <CopyDialog
            open={copy}
            onOpenChange={setCopy}
            options={o}
            subjectId={m.subject.id}
            classLevelId={m.classLevel.id}
            pending={act.isPending}
            onCopy={(classArmId) =>
              act.mutate(
                { id, action: 'copy', body: { classArmId } },
                {
                  onSuccess: (r) => {
                    toast.success('Copied as a draft');
                    setCopy(false);
                    if (r && 'id' in r) navigate(`/modules/${r.id}`);
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          />
          <ConfirmDialog
            open={del}
            onOpenChange={setDel}
            title="Delete this module?"
            description="If it has been taught or answered, it is archived instead so the check-in evidence is kept."
            confirmLabel="Delete"
            destructive
            onConfirm={() =>
              act.mutate(
                { id, action: 'delete' },
                {
                  onSuccess: (r) => {
                    toast.success(r && 'archived' in r && r.archived ? 'Archived' : 'Deleted');
                    navigate('/modules');
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          />
        </>
      )}
    </Page>
  );
}

function cellTone(p: { percent: number; passed: boolean } | undefined) {
  if (!p) return 'text-muted-foreground';
  return p.passed ? 'bg-success-soft text-success' : p.percent >= 40 ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger';
}

function ResultsTab({ id }: { id: string }) {
  const q = useModuleResults(id);
  const r: ModuleResults | undefined = q.data;
  if (q.error && !r) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!r) return <Skeleton className="h-72 rounded-2xl" />;
  const done = r.students.filter((s) => s.status === 'COMPLETED').length;
  return (
    <div className="space-y-4">
      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
          <p className="font-display text-[15px] font-semibold">Students</p>
          <p className="text-[12.5px] text-muted-foreground">
            {done} of {r.students.length} finished · latest score in each check-in (tries)
          </p>
        </div>
        {!r.students.length ? (
          <EmptyState compact icon={Users} title="No students in this class" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Student</th>
                  <th className="px-3 py-2 font-medium">Progress</th>
                  {r.steps.map((s) => (
                    <th key={s.id} className="max-w-[140px] truncate px-3 py-2 font-medium" title={s.title}>
                      {s.kind === 'VIDEO' ? `🎬 ${s.title}` : s.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.students.map((s) => (
                  <tr key={s.studentId} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium">{s.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {s.status === 'COMPLETED' ? <Badge variant="success">Finished</Badge> : s.status === 'NOT_STARTED' ? 'Not started' : `${s.done}/${r.module.stepCount}`}
                    </td>
                    {r.steps.map((st) => {
                      const c = s.checkIns[st.id];
                      return (
                        <td key={st.id} className="px-3 py-2">
                          <span className={cn('inline-block rounded-md px-1.5 py-0.5 tabular', cellTone(c))}>{c ? `${c.percent}% (${c.tries})` : '–'}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card className="p-4">
        <p className="mb-2 font-display text-[15px] font-semibold">Taught in class</p>
        {!r.sessions.length ? (
          <p className="text-[13px] text-muted-foreground">Not taught in class yet. Use “Teach in class” to present it and run live check-ins.</p>
        ) : (
          <ul className="divide-y divide-border">
            {r.sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
                <span>
                  {formatDateTime(s.startedAt)}
                  {s.teacher ? ` · ${s.teacher}` : ''}
                </span>
                <span className="text-muted-foreground">
                  {s.status === 'LIVE' ? (
                    <Link to={`/present/${s.id}`} className="text-brand hover:underline">
                      Live now — open
                    </Link>
                  ) : (
                    `${s.participants} took part · ${s.checkIns} check-in${s.checkIns === 1 ? '' : 's'}${s.understoodPercent !== null ? ` · ${s.understoodPercent}% understood` : ''}${s.endedAt ? ` · ended ${formatDate(s.endedAt, { hour: 'numeric', minute: '2-digit' })}` : ''}`
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
