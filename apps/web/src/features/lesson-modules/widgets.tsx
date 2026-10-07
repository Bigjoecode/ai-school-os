import { BookOpenCheck, CheckCircle2, Presentation } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionTitle } from '../learning/components';
import { useChildModules, useClassModules, useEngagement } from './api';

/** Beside class insights: each module's completion and check-in average for the class. */
export function ClassModulesCard({ classArmId, subjectId }: { classArmId: string; subjectId: string }) {
  const q = useClassModules(classArmId, subjectId);
  const d = q.data;
  if (!d || (!d.modules.length && !d.sessionsThisTerm)) return null;
  return (
    <Card className="p-4 sm:p-5">
      <SectionTitle
        icon={BookOpenCheck}
        title="Lesson modules and check-ins"
        action={
          <Link to={`/modules?classArmId=${classArmId}&subjectId=${subjectId}`} className="text-[12.5px] text-brand hover:underline">
            All modules
          </Link>
        }
      />
      <p className="mb-3 text-[12.5px] text-muted-foreground">
        Taught in class {d.sessionsThisTerm} time{d.sessionsThisTerm === 1 ? '' : 's'} this term. Open a module for each student’s check-in scores.
      </p>
      <ul className="space-y-2">
        {d.modules.slice(0, 8).map((m) => {
          const s = m.stats;
          return (
            <li key={m.id}>
              <Link to={`/modules/${m.id}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-[13px] hover:bg-muted">
                <span className="min-w-0 flex-1 truncate">
                  {m.week ? <span className="text-muted-foreground">Wk {m.week} · </span> : null}
                  {m.title}
                </span>
                {m.status !== 'PUBLISHED' && <Badge variant="warning">Draft</Badge>}
                {s && s.students > 0 && (
                  <>
                    <Progress value={(100 * s.completed) / s.students} className="hidden h-1.5 w-20 sm:block" barClassName="bg-success" label={`${m.title} completion`} />
                    <span className="w-28 shrink-0 text-right text-[12px] text-muted-foreground tabular">
                      {s.completed}/{s.students} done{s.averageScore !== null ? ` · ${s.averageScore}%` : ''}
                    </span>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Success dashboard tile: "Classroom check-ins this week". */
export function ClassroomEngagementTile() {
  const q = useEngagement();
  const e = q.data;
  if (q.error) return null;
  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
        <Presentation className="size-5" aria-hidden />
      </span>
      {!e ? (
        <Skeleton className="h-10 flex-1 rounded-lg" />
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-medium text-muted-foreground">Classroom check-ins this week</p>
            <p className="font-display text-2xl font-semibold tabular">
              {e.sessions} lesson{e.sessions === 1 ? '' : 's'}{' '}
              <span className="text-[13px] font-normal text-muted-foreground">
                taught with check-ins · {e.classes} class{e.classes === 1 ? '' : 'es'} · {e.teachers} teacher{e.teachers === 1 ? '' : 's'}
              </span>
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-3 text-center text-[12px] sm:w-[360px]">
            <div className="rounded-lg bg-muted/60 p-2">
              <dt className="text-muted-foreground">Took part</dt>
              <dd className="font-display text-lg font-semibold tabular">{e.participants}</dd>
            </div>
            <div className="rounded-lg bg-muted/60 p-2">
              <dt className="text-muted-foreground">Understood</dt>
              <dd className="font-display text-lg font-semibold tabular">{e.understoodPercent === null ? '–' : `${e.understoodPercent}%`}</dd>
            </div>
            <div className="rounded-lg bg-muted/60 p-2">
              <dt className="text-muted-foreground">Self-paced done</dt>
              <dd className="font-display text-lg font-semibold tabular">{e.selfPacedCompletions}</dd>
            </div>
          </dl>
          <p className="text-[11.5px] text-muted-foreground sm:hidden">Last week: {e.previousWeekSessions} lessons.</p>
        </>
      )}
    </Card>
  );
}

/** On a parent's child page: the lesson modules set for the class and how far the child has got. */
export function ChildModulesCard({ childId, first }: { childId: string; first: string }) {
  const q = useChildModules(childId);
  const d = q.data;
  if (!d || !d.total) return null;
  return (
    <Card className="p-5">
      <SectionTitle icon={BookOpenCheck} title="Lesson modules" />
      <p className="mb-3 text-[13px] text-muted-foreground">
        {first} has finished {d.completed} of {d.total} lesson{d.total === 1 ? '' : 's'} set by the teachers.
      </p>
      <ul className="space-y-2">
        {d.modules.slice(0, 8).map((m) => (
          <li key={m.id} className="flex items-center gap-3 text-[13px]">
            {m.status === 'COMPLETED' ? <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Finished" /> : <BookOpenCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
            <span className="min-w-0 flex-1 truncate">
              {m.title} <span className="text-muted-foreground">· {m.subject.name}</span>
            </span>
            <span className="shrink-0 text-[12px] text-muted-foreground tabular">
              {m.status === 'COMPLETED' ? 'Finished' : m.status === 'NOT_STARTED' ? 'Not started' : `${m.done}/${m.stepCount} steps`}
              {m.lastScore !== null ? ` · ${m.lastScore}%` : ''}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
