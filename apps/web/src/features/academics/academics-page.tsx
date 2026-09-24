import type { AcademicStructure } from '@aischool/shared';
import { motion } from 'framer-motion';
import {
  BookOpen,
  Building2,
  CalendarDays,
  CheckCircle2,
  Layers,
  MapPin,
  Plus,
  Star,
  Trash2,
  UserRound,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tip } from '@/components/ui/tooltip';
import { useCan } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { BranchDialog, ClassArmDialog, ClassLevelDialog, SessionDialog, SubjectDialog, TermDialog } from './academic-dialogs';
import { type AcademicResource, useDeleteAcademic, useMakeCurrent, useStructure } from './api';

const TABS = ['sessions', 'classes', 'subjects', 'branches'] as const;
type Tab = (typeof TABS)[number];

type DeleteTarget = { resource: AcademicResource; id: string; label: string } | null;

export default function AcademicsPage() {
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? '') ? (tabParam as Tab) : 'sessions';
  const { data, isLoading, error, refetch } = useStructure();
  const canManage = useCan('academics.manage');
  const [dialog, setDialog] = useState<null | 'session' | 'term' | 'level' | 'arm' | 'subject' | 'branch'>(null);
  const [context, setContext] = useState<string | undefined>();
  const [toDelete, setToDelete] = useState<DeleteTarget>(null);

  const open = (d: NonNullable<typeof dialog>, ctx?: string) => {
    setContext(ctx);
    setDialog(d);
  };
  const close = (o: boolean) => !o && setDialog(null);

  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  };

  const primaryAction: Record<Tab, ReactNode> = {
    sessions: (
      <>
        {data && data.sessions.length > 0 && (
          <Button variant="outline" onClick={() => open('term')}>
            <Plus /> Add term
          </Button>
        )}
        <Button onClick={() => open('session')}>
          <Plus /> New session
        </Button>
      </>
    ),
    classes: (
      <>
        {data && data.classLevels.length > 0 && (
          <Button variant="outline" onClick={() => open('arm')}>
            <Plus /> Add arm
          </Button>
        )}
        <Button onClick={() => open('level')}>
          <Plus /> New class level
        </Button>
      </>
    ),
    subjects: (
      <Button onClick={() => open('subject')}>
        <Plus /> New subject
      </Button>
    ),
    branches: (
      <Button onClick={() => open('branch')}>
        <Plus /> New branch
      </Button>
    ),
  };

  return (
    <Page>
      <PageHeader
        title="Academic Setup"
        description="Sessions, terms, classes, subjects and branches — the backbone every other module builds on."
        actions={canManage ? primaryAction[tab] : undefined}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="sessions">
            <CalendarDays /> Sessions & Terms
          </TabsTrigger>
          <TabsTrigger value="classes">
            <Layers /> Classes
          </TabsTrigger>
          <TabsTrigger value="subjects">
            <BookOpen /> Subjects
          </TabsTrigger>
          <TabsTrigger value="branches">
            <Building2 /> Branches
          </TabsTrigger>
        </TabsList>

        {error && !data ? (
          <ErrorState error={error} onRetry={() => void refetch()} className="mt-6" />
        ) : isLoading || !data ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 rounded-2xl" />
            ))}
          </div>
        ) : (
          <>
            <TabsContent value="sessions">
              <SessionsTab data={data} canManage={canManage} onAddTerm={(id) => open('term', id)} onAdd={() => open('session')} onDelete={setToDelete} />
            </TabsContent>
            <TabsContent value="classes">
              <ClassesTab data={data} canManage={canManage} onAddArm={(id) => open('arm', id)} onAdd={() => open('level')} onDelete={setToDelete} />
            </TabsContent>
            <TabsContent value="subjects">
              <SubjectsTab data={data} canManage={canManage} onAdd={() => open('subject')} onDelete={setToDelete} />
            </TabsContent>
            <TabsContent value="branches">
              <BranchesTab data={data} canManage={canManage} onAdd={() => open('branch')} onDelete={setToDelete} />
            </TabsContent>
          </>
        )}
      </Tabs>

      {canManage && (
        <>
          <SessionDialog open={dialog === 'session'} onOpenChange={close} />
          <TermDialog open={dialog === 'term'} onOpenChange={close} structure={data} sessionId={context} />
          <ClassLevelDialog open={dialog === 'level'} onOpenChange={close} structure={data} />
          <ClassArmDialog open={dialog === 'arm'} onOpenChange={close} structure={data} levelId={context} />
          <SubjectDialog open={dialog === 'subject'} onOpenChange={close} />
          <BranchDialog open={dialog === 'branch'} onOpenChange={close} />
          <DeleteConfirm target={toDelete} onClose={() => setToDelete(null)} />
        </>
      )}
    </Page>
  );
}

function DeleteConfirm({ target, onClose }: { target: DeleteTarget; onClose: () => void }) {
  const del = useDeleteAcademic(target?.resource ?? 'subjects');
  return (
    <ConfirmDialog
      open={!!target}
      onOpenChange={(o) => !o && onClose()}
      title={`Delete ${target?.label ?? ''}?`}
      description="This can't be undone. Items still in use (for example a class with students) can't be deleted."
      confirmLabel="Delete"
      loading={del.isPending}
      onConfirm={() => target && del.mutate(target.id, { onSuccess: onClose })}
    />
  );
}

function DeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Tip label={`Delete ${label}`}>
      <Button variant="ghost" size="icon-sm" onClick={onClick} aria-label={`Delete ${label}`} className="text-muted-foreground hover:text-danger">
        <Trash2 />
      </Button>
    </Tip>
  );
}

function progressBetween(start: string, end: string): number {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const now = Date.now();
  if (now <= s) return 0;
  if (now >= e) return 100;
  return ((now - s) / (e - s)) * 100;
}

// ------------------------------------------------------------------ sessions
function SessionsTab({
  data,
  canManage,
  onAdd,
  onAddTerm,
  onDelete,
}: {
  data: AcademicStructure;
  canManage: boolean;
  onAdd: () => void;
  onAddTerm: (sessionId: string) => void;
  onDelete: (t: DeleteTarget) => void;
}) {
  const makeSessionCurrent = useMakeCurrent('sessions');
  const makeTermCurrent = useMakeCurrent('terms');
  if (data.sessions.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={CalendarDays}
          title="No sessions yet"
          description="Create your first academic session (e.g. 2026/2027), then add its terms."
          action={canManage && <Button onClick={onAdd}><Plus /> New session</Button>}
        />
      </Card>
    );
  }
  const sessions = [...data.sessions].sort((a, b) => b.startsOn.localeCompare(a.startsOn));
  return (
    <div className="space-y-4">
      {sessions.map((s, i) => (
        <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
          <Card className={cn('overflow-hidden', s.isCurrent && 'ring-1 ring-brand/30')}>
            <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className={cn('grid size-10 place-items-center rounded-xl', s.isCurrent ? 'bg-brand text-white' : 'bg-muted text-muted-foreground')}>
                  <CalendarDays className="size-5" />
                </span>
                <div>
                  <p className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
                    {s.name}
                    {s.isCurrent && <Badge variant="brand">Current</Badge>}
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    {formatDate(s.startsOn)} – {formatDate(s.endsOn)}
                  </p>
                </div>
              </div>
              {canManage && (
                <div className="flex items-center gap-1.5">
                  {!s.isCurrent && (
                    <Button variant="outline" size="sm" loading={makeSessionCurrent.isPending && makeSessionCurrent.variables === s.id} onClick={() => makeSessionCurrent.mutate(s.id)}>
                      <CheckCircle2 /> Make current
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => onAddTerm(s.id)}>
                    <Plus /> Term
                  </Button>
                  <DeleteButton label={s.name} onClick={() => onDelete({ resource: 'sessions', id: s.id, label: `session ${s.name}` })} />
                </div>
              )}
            </div>
            <div className="p-5">
              {s.isCurrent && (
                <div className="mb-5">
                  <div className="mb-1.5 flex justify-between text-[12px] text-muted-foreground">
                    <span>Session progress</span>
                    <span className="tabular">{Math.round(progressBetween(s.startsOn, s.endsOn))}%</span>
                  </div>
                  <Progress value={progressBetween(s.startsOn, s.endsOn)} label="Session progress" />
                </div>
              )}
              {s.terms.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">No terms yet.</p>
              ) : (
                <ol className="grid gap-3 md:grid-cols-3">
                  {[...s.terms]
                    .sort((a, b) => a.order - b.order)
                    .map((t) => {
                      const pct = progressBetween(t.startsOn, t.endsOn);
                      return (
                        <li
                          key={t.id}
                          className={cn(
                            'relative rounded-xl border p-4 transition-colors',
                            t.isCurrent ? 'border-brand/40 bg-brand-soft/40' : 'border-border bg-muted/20',
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Term {t.order}</p>
                              <p className="mt-0.5 font-medium">{t.name}</p>
                            </div>
                            {t.isCurrent ? (
                              <Badge variant="brand" dot>
                                Now
                              </Badge>
                            ) : (
                              canManage && (
                                <div className="flex">
                                  <Tip label="Make current term">
                                    <Button variant="ghost" size="icon-sm" aria-label={`Make ${t.name} current`} onClick={() => makeTermCurrent.mutate(t.id)}>
                                      <CheckCircle2 />
                                    </Button>
                                  </Tip>
                                  <DeleteButton label={t.name} onClick={() => onDelete({ resource: 'terms', id: t.id, label: t.name })} />
                                </div>
                              )
                            )}
                          </div>
                          <p className="mt-2 text-[12.5px] text-muted-foreground">
                            {formatDate(t.startsOn, { year: undefined })} – {formatDate(t.endsOn)}
                          </p>
                          <Progress value={pct} className="mt-3 h-1" barClassName={t.isCurrent ? 'bg-brand' : 'bg-muted-foreground/40'} label={`${t.name} progress`} />
                        </li>
                      );
                    })}
                </ol>
              )}
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ classes
function ClassesTab({
  data,
  canManage,
  onAdd,
  onAddArm,
  onDelete,
}: {
  data: AcademicStructure;
  canManage: boolean;
  onAdd: () => void;
  onAddArm: (levelId: string) => void;
  onDelete: (t: DeleteTarget) => void;
}) {
  if (data.classLevels.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Layers}
          title="No classes yet"
          description="Add class levels (e.g. JSS 1) and then arms within them (e.g. JSS 1 A)."
          action={canManage && <Button onClick={onAdd}><Plus /> New class level</Button>}
        />
      </Card>
    );
  }
  const levels = [...data.classLevels].sort((a, b) => a.order - b.order);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {levels.map((l, i) => {
        const total = l.arms.reduce((n, a) => n + a.studentCount, 0);
        const cap = l.arms.reduce((n, a) => n + (a.capacity ?? 0), 0);
        return (
          <motion.div key={l.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Card className="h-full p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-display text-[17px] font-semibold tracking-tight">
                    {l.name}
                    <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-normal text-muted-foreground">{l.code}</span>
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    {l.stage ? `${l.stage} · ` : ''}
                    {l.arms.length} arm{l.arms.length === 1 ? '' : 's'} · {total} student{total === 1 ? '' : 's'}
                    {cap > 0 && ` of ${cap}`}
                  </p>
                </div>
                {canManage && (
                  <div className="flex items-center">
                    <Button variant="ghost" size="sm" onClick={() => onAddArm(l.id)}>
                      <Plus /> Arm
                    </Button>
                    <DeleteButton label={l.name} onClick={() => onDelete({ resource: 'class-levels', id: l.id, label: l.name })} />
                  </div>
                )}
              </div>
              {l.arms.length === 0 ? (
                <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-center text-[13px] text-muted-foreground">No arms yet</p>
              ) : (
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {l.arms.map((a) => {
                    const pct = a.capacity ? (a.studentCount / a.capacity) * 100 : null;
                    return (
                      <li key={a.id} className="group rounded-xl border border-border bg-muted/20 p-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">
                            {l.name} {a.name}
                          </p>
                          <div className="flex items-center gap-1">
                            <span className={cn('text-[12px] tabular', pct != null && pct >= 90 ? 'font-semibold text-warning' : 'text-muted-foreground')}>
                              {a.studentCount}
                              {a.capacity != null && `/${a.capacity}`}
                            </span>
                            {canManage && (
                              <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                                <DeleteButton label={`${l.name} ${a.name}`} onClick={() => onDelete({ resource: 'class-arms', id: a.id, label: `${l.name} ${a.name}` })} />
                              </span>
                            )}
                          </div>
                        </div>
                        {pct != null && (
                          <Progress
                            value={pct}
                            className="mt-2 h-1"
                            barClassName={pct >= 100 ? 'bg-danger' : pct >= 90 ? 'bg-warning' : 'bg-chart-4'}
                            label={`${l.name} ${a.name} capacity`}
                          />
                        )}
                        <p className="mt-2 flex items-center gap-1.5 truncate text-[12px] text-muted-foreground">
                          <UserRound className="size-3.5 shrink-0" />
                          {a.classTeacher ? `${a.classTeacher.firstName} ${a.classTeacher.lastName}` : 'No class teacher'}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ subjects
function SubjectsTab({ data, canManage, onAdd, onDelete }: { data: AcademicStructure; canManage: boolean; onAdd: () => void; onDelete: (t: DeleteTarget) => void }) {
  if (data.subjects.length === 0) {
    return (
      <Card>
        <EmptyState icon={BookOpen} title="No subjects yet" description="Add the subjects your school teaches." action={canManage && <Button onClick={onAdd}><Plus /> New subject</Button>} />
      </Card>
    );
  }
  const subjects = [...data.subjects].sort((a, b) => Number(b.isCore) - Number(a.isCore) || a.name.localeCompare(b.name));
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {subjects.map((s, i) => (
        <motion.div key={s.id} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(i * 0.02, 0.3) }}>
          <Card className="group flex h-full items-start gap-3 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted font-mono text-[11px] font-semibold text-muted-foreground">
              {s.code.slice(0, 4)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{s.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {s.isCore && (
                  <Badge variant="brand">
                    <Star /> Core
                  </Badge>
                )}
                {s.category && <span className="text-[12px] text-muted-foreground">{s.category}</span>}
              </div>
            </div>
            {canManage && (
              <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <DeleteButton label={s.name} onClick={() => onDelete({ resource: 'subjects', id: s.id, label: s.name })} />
              </span>
            )}
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ branches
function BranchesTab({ data, canManage, onAdd, onDelete }: { data: AcademicStructure; canManage: boolean; onAdd: () => void; onDelete: (t: DeleteTarget) => void }) {
  if (data.branches.length === 0) {
    return (
      <Card>
        <EmptyState icon={Building2} title="No branches yet" description="Running more than one campus? Add each branch here." action={canManage && <Button onClick={onAdd}><Plus /> New branch</Button>} />
      </Card>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.branches.map((b) => (
        <Card key={b.id} className="flex items-start gap-3 p-5">
          <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', b.isMain ? 'bg-brand text-white' : 'bg-muted text-muted-foreground')}>
            <MapPin className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-medium">
              {b.name} {b.isMain && <Badge variant="brand">Main</Badge>}
            </p>
            <p className="font-mono text-[12px] text-muted-foreground">{b.code}</p>
          </div>
          {canManage && !b.isMain && <DeleteButton label={b.name} onClick={() => onDelete({ resource: 'branches', id: b.id, label: b.name })} />}
        </Card>
      ))}
    </div>
  );
}
