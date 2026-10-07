import type { Workbook } from '@aischool/shared';
import { BookOpenCheck, CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, Copy, FolderOpen, History, NotebookPen, Plus, Presentation, Sparkles, Target } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SectionTitle } from '../learning/components';
import { PlanLessonDialog } from '../lessons/lesson-dialogs';
import { startSession, useModuleAction, useModuleOptions, useWorkbook } from './api';
import { AiDraftDialog, ModuleDialog } from './dialogs';
import { ModuleCard } from './modules-page';

/**
 * The teacher's weekly workbook: for a class, subject and week of term, this
 * week's topic (scheme of work, else the syllabus order), the lesson plan,
 * the modules to teach (one click to draft one with AI), the study materials,
 * shared library modules and last week's check-in results.
 */
export default function WorkbookPage() {
  const [params, setParams] = useSearchParams();
  const options = useModuleOptions();
  const o = options.data;
  const classArmId = params.get('classArmId') ?? '';
  const subjectId = params.get('subjectId') ?? '';
  const weekParam = Number(params.get('week')) || undefined;
  const cls = o?.classes.find((c) => c.classArmId === classArmId);
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
    if (!o?.classes.length) return;
    const c = o.classes.find((x) => x.classArmId === classArmId) ?? o.classes[0]!;
    const s = c.subjects.find((x) => x.id === subjectId) ?? c.subjects[0];
    if (c.classArmId !== classArmId || s?.id !== subjectId) patch({ classArmId: c.classArmId, subjectId: s?.id ?? null, week: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o, classArmId, subjectId]);
  const q = useWorkbook(cls && subjectId ? { classArmId, subjectId, week: weekParam } : null);
  const w = q.data && q.data.class.id === classArmId && q.data.subject.id === subjectId ? q.data : undefined;

  return (
    <Page>
      <PageHeader
        eyebrow="Academics"
        title="Weekly workbook"
        description="Everything for this week’s lessons in one place: the topic, your lesson plan, the modules to teach in class, materials and how last week’s check-ins went."
        actions={
          <Button asChild variant="outline">
            <Link to="/modules">
              <BookOpenCheck /> All modules
            </Link>
          </Button>
        }
      />
      {options.error && !o ? (
        <ErrorState error={options.error} onRetry={() => void options.refetch()} />
      ) : !o ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : !o.classes.length ? (
        <Card>
          <EmptyState icon={NotebookPen} title="No classes to show" description="The workbook shows the classes and subjects you teach. Ask the school admin to assign you to your classes in Academic Setup." />
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Select value={classArmId} onValueChange={(v) => patch({ classArmId: v, week: null })}>
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
            <Select value={subjectId} onValueChange={(v) => patch({ subjectId: v, week: null })}>
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
            {w && w.weeks.length > 0 && (
              <div className="flex items-center gap-1 sm:ml-auto">
                <Button variant="outline" size="icon" aria-label="Previous week" disabled={w.week <= w.weeks[0]!.week} onClick={() => patch({ week: String(w.week - 1) })}>
                  <ChevronLeft />
                </Button>
                <Select value={String(w.week)} onValueChange={(v) => patch({ week: v })}>
                  <SelectTrigger aria-label="Week" className="h-9 w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {w.weeks.map((x) => (
                      <SelectItem key={x.week} value={String(x.week)}>
                        Week {x.week}
                        {x.week === w.currentWeek ? ' (this week)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" aria-label="Next week" disabled={w.week >= w.weeks[w.weeks.length - 1]!.week} onClick={() => patch({ week: String(w.week + 1) })}>
                  <ChevronRight />
                </Button>
              </div>
            )}
          </div>
          {q.error && !w ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !w ? <Skeleton className="h-96 rounded-2xl" /> : <WorkbookBody w={w} />}
        </>
      )}
    </Page>
  );
}

function WorkbookBody({ w }: { w: Workbook }) {
  const o = useModuleOptions().data!;
  const navigate = useNavigate();
  const act = useModuleAction();
  const [ai, setAi] = useState(false);
  const [blank, setBlank] = useState(false);
  const [plan, setPlan] = useState(false);
  const [teaching, setTeaching] = useState<string | null>(null);
  const weekInfo = w.weeks.find((x) => x.week === w.week);
  const defaults = { classArmId: w.class.id, classLevelId: w.class.classLevelId, subjectId: w.subject.id, topicId: w.plan?.topicId ?? null, topic: w.plan?.topicName ?? w.plan?.topic.split(' · ')[0] ?? null, week: w.week, termId: w.term?.id ?? null, schemeWeekId: w.plan?.schemeWeekId ?? null };
  const teach = (id: string) => {
    setTeaching(id);
    startSession(id)
      .then((s) => navigate(`/present/${s.id}`))
      .catch((e: unknown) => toast.error(errorMessage(e)))
      .finally(() => setTeaching(null));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] [&>*]:min-w-0">
      <div className="space-y-4">
        <Card className="p-4 sm:p-5">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
            <CalendarDays className="size-3.5" />
            <span>
              {w.term ? `${w.term.name} · ` : ''}Week {w.week}
              {weekInfo?.startsOn ? ` · from ${formatDate(weekInfo.startsOn, { day: 'numeric', month: 'short' })}` : ''}
            </span>
            {w.week === w.currentWeek && <Badge variant="brand">This week</Badge>}
            <Badge variant="outline">{w.source === 'SCHEME' ? 'From the scheme of work' : w.source === 'SYLLABUS' ? 'Suggested from the syllabus order' : 'No scheme yet'}</Badge>
          </div>
          {w.plan ? (
            <>
              <h2 className="font-display text-2xl font-semibold tracking-tight">{w.plan.topic}</h2>
              {w.plan.topicName && w.plan.topicName !== w.plan.topic && <p className="text-[13px] text-muted-foreground">Syllabus topic: {w.plan.topicName}</p>}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {w.plan.objectives.length > 0 && <Bullets icon={Target} title="Objectives" items={w.plan.objectives} />}
                {w.plan.subtopics.length > 0 && <Bullets icon={BookOpenCheck} title="Sub-topics" items={w.plan.subtopics} />}
                {w.plan.activities.length > 0 && <Bullets icon={Presentation} title="Activities" items={w.plan.activities} />}
                {w.plan.resources.length > 0 && <Bullets icon={FolderOpen} title="Resources" items={w.plan.resources} />}
              </div>
              {w.source === 'SYLLABUS' && <p className="mt-3 text-[12px] text-muted-foreground">No scheme of work for this term yet, so topics follow the syllabus order. Upload or generate a scheme to plan the term your way.</p>}
            </>
          ) : (
            <p className="text-[14px] text-muted-foreground">Nothing planned for this week. Add a scheme of work, or create a module on any topic.</p>
          )}
        </Card>

        <Card className="p-4 sm:p-5">
          <SectionTitle
            icon={BookOpenCheck}
            title="Modules to teach"
            action={
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setBlank(true)}>
                  <Plus /> New
                </Button>
                {o.canAi && (
                  <Button size="sm" variant="ai" onClick={() => setAi(true)}>
                    <Sparkles /> Create from topic
                  </Button>
                )}
              </div>
            }
          />
          {w.modules.length ? (
            <div className="-mx-4 divide-y divide-border sm:-mx-5">
              {w.modules.map((m) => (
                <ModuleCard
                  key={m.id}
                  m={m}
                  actions={
                    <Button size="sm" variant="brand" onClick={() => teach(m.id)} loading={teaching === m.id} disabled={!m.stepCount}>
                      <Presentation /> Teach
                    </Button>
                  }
                />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">No module for this week yet. “Create from topic” drafts the notes and a check-in for you to review, ready to teach on the projector.</p>
          )}
          {w.library.length > 0 && (
            <div className="mt-4 rounded-xl bg-muted/50 p-3">
              <p className="mb-2 text-[12.5px] font-medium">From the content library</p>
              <ul className="space-y-1.5">
                {w.library.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate">
                      {m.title}
                      {m.createdBy ? <span className="text-muted-foreground"> · {m.createdBy}</span> : null}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={act.isPending && act.variables?.id === m.id}
                      onClick={() =>
                        act.mutate(
                          { id: m.id, action: 'copy', body: { classArmId: w.class.id } },
                          { onSuccess: (r) => (toast.success('Copied into your class'), r && 'id' in r && navigate(`/modules/${r.id}`)), onError: (e) => toast.error(errorMessage(e)) },
                        )
                      }
                    >
                      <Copy /> Copy
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card className="p-4 sm:p-5">
          <SectionTitle
            icon={NotebookPen}
            title="Lesson plan"
            action={
              o.canLessons && (
                <Button size="sm" variant="outline" onClick={() => setPlan(true)}>
                  <Sparkles /> Plan a lesson
                </Button>
              )
            }
          />
          {w.lessonPlans.length ? (
            <ul className="space-y-1">
              {w.lessonPlans.map((l) => (
                <li key={l.id}>
                  <Link to={`/lessons/${l.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13.5px] hover:bg-muted">
                    <span className="min-w-0 flex-1 truncate">{l.topic}</span>
                    {l.generation === 'QUEUED' || l.generation === 'RUNNING' ? <Badge variant="ai">Writing…</Badge> : <Badge variant={l.reviewStatus === 'APPROVED' ? 'success' : 'outline'}>{l.reviewStatus === 'APPROVED' ? 'Approved' : l.status === 'DRAFT' ? 'Draft' : l.status.toLowerCase()}</Badge>}
                    {l.date && <span className="text-[12px] text-muted-foreground">{formatDate(l.date, { day: 'numeric', month: 'short' })}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">No lesson plan for this week’s topic yet.</p>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="p-4 sm:p-5">
          <SectionTitle icon={History} title={w.lastWeek ? `Last week (week ${w.lastWeek.week})` : 'Last week'} />
          {!w.lastWeek ? (
            <p className="text-[13px] text-muted-foreground">No check-ins last week.</p>
          ) : (
            <div className="space-y-3">
              {w.lastWeek.sessions.map((s) => (
                <div key={s.id} className="rounded-xl bg-muted/50 p-3 text-[13px]">
                  <p className="font-medium">{s.moduleTitle}</p>
                  <p className="text-muted-foreground">
                    Taught {formatDate(s.startedAt, { weekday: 'short', day: 'numeric', month: 'short' })} · {s.participants} took part
                    {s.understoodPercent !== null && (
                      <>
                        {' '}
                        · <span className={cn('font-medium', s.understoodPercent >= 70 ? 'text-success' : 'text-warning')}>{s.understoodPercent}% understood</span>
                      </>
                    )}
                  </p>
                </div>
              ))}
              {w.lastWeek.modules.map((m) => (
                <Link key={m.id} to={`/modules/${m.id}`} className="flex items-center gap-2 rounded-lg px-1 py-1 text-[13px] hover:bg-muted">
                  <ClipboardCheck className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{m.title}</span>
                  <span className="shrink-0 text-muted-foreground tabular">
                    {m.completed}/{m.students} done{m.averageScore !== null ? ` · ${m.averageScore}%` : ''}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-4 sm:p-5">
          <SectionTitle
            icon={FolderOpen}
            title="Study materials"
            action={
              <Button asChild size="sm" variant="ghost">
                <Link to="/materials">All</Link>
              </Button>
            }
          />
          {w.materials.length ? (
            <ul className="space-y-1 text-[13px]">
              {w.materials.map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <Badge variant="outline">{m.kind.toLowerCase()}</Badge>
                  <span className="min-w-0 truncate">{m.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">No shared materials on this topic yet. Add them to a module as steps from Study materials.</p>
          )}
        </Card>
      </div>

      <AiDraftDialog open={ai} onOpenChange={setAi} options={o} defaults={defaults} />
      <ModuleDialog open={blank} onOpenChange={setBlank} options={o} defaults={defaults} />
      <PlanLessonDialog open={plan} onOpenChange={setPlan} defaults={{ subjectId: w.subject.id, classArmId: w.class.id, classLevelId: w.class.classLevelId, schemeId: w.scheme?.id, schemeWeekId: w.plan?.schemeWeekId ?? undefined }} />
    </div>
  );
}

function Bullets({ icon: Icon, title, items }: { icon: typeof Target; title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
        <Icon className="size-3.5" /> {title}
      </p>
      <ul className="list-disc space-y-0.5 pl-5 text-[13.5px]">
        {items.slice(0, 8).map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}
