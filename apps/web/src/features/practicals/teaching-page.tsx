import type { PracticalClassView } from '@aischool/shared';
import { ArrowLeft, BadgeCheck, BarChart3, ClipboardCheck, FlaskConical, ListChecks, PenLine, Users } from 'lucide-react';
import { Suspense, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SectionTitle, scoreTone } from '../learning/components';
import { useOverrideLab, usePracticalClass, useTeachingAttempt } from './api';
import { LabResult } from './result';
import { simulatorUi } from './simulators/registry';

const pct = (n: number | null) => (n === null ? '—' : `${n}%`);

/** Teachers: their classes' practical work — attempts, class averages per practical, skill gaps and rubric criteria. */
export default function PracticalTeachingPage() {
  const [params, setParams] = useSearchParams();
  const classArmId = params.get('class') ?? '';
  const subject = params.get('subject') ?? '';
  const q = usePracticalClass(classArmId, subject);
  const d = q.data;
  const patch = (p: { class?: string; subject?: string }) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(p)) v ? next.set(k, v) : next.delete(k);
    setParams(next, { replace: true });
  };
  const cls = d?.classes.find((c) => c.classArmId === d.classArmId);
  return (
    <Page className="max-w-6xl">
      <PageHeader eyebrow="Teaching" title="Practical work" description="Your students’ WAEC Practical Academy labs and practical questions: results by practical, skill gaps, and AI-assisted marks you can review." />
      {q.error && !d ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : !d.classes.length ? (
        <EmptyState icon={FlaskConical} title="No practical subjects to show" description="Practical work appears for the classes and subjects you teach that have WAEC practicals (sciences, agriculture and more)." />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={d.classArmId ?? ''} onValueChange={(v) => patch({ class: v, subject: '' })}>
              <SelectTrigger aria-label="Class" className="h-9 w-full sm:w-[200px]">
                <SelectValue placeholder="Class" />
              </SelectTrigger>
              <SelectContent>
                {d.classes.map((c) => (
                  <SelectItem key={c.classArmId} value={c.classArmId}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={d.subject ?? ''} onValueChange={(v) => patch({ class: d.classArmId ?? '', subject: v })}>
              <SelectTrigger aria-label="Subject" className="h-9 w-full sm:w-[220px]">
                <SelectValue placeholder="Subject" />
              </SelectTrigger>
              <SelectContent>
                {(cls?.subjects ?? []).map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ClassView d={d} />
        </div>
      )}
    </Page>
  );
}

function ClassView({ d }: { d: PracticalClassView }) {
  const labs = d.attempts.filter((a) => a.kind === 'LAB');
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card className="p-5">
          <SectionTitle icon={BarChart3} title="Skill gaps (lab averages)" />
          {d.skills.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No marked labs yet.</p>
          ) : (
            <ul className="space-y-2">
              {d.skills.map((s) => (
                <li key={s.skill} className="flex items-center gap-3 text-[13px]">
                  <span className="w-28 shrink-0 capitalize">{s.skill}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span className={cn('block h-full rounded-full', (s.average ?? 0) >= 70 ? 'bg-success' : (s.average ?? 0) >= 50 ? 'bg-warning' : 'bg-danger')} style={{ width: `${s.average ?? 0}%` }} />
                  </span>
                  <span className={cn('w-12 text-right font-semibold tabular', scoreTone(s.average))}>{pct(s.average)}</span>
                </li>
              ))}
            </ul>
          )}
          {d.criteria.length > 0 && (
            <>
              <p className="mb-2 mt-4 text-[12px] font-medium text-muted-foreground">Weakest marking criteria</p>
              <ul className="space-y-1 text-[13px]">
                {d.criteria.slice(0, 6).map((c) => (
                  <li key={`${c.simulatorId}-${c.id}`} className="flex justify-between gap-2">
                    <span>{c.label}</span>
                    <span className={cn('font-semibold tabular', scoreTone(c.average))}>
                      {pct(c.average)} <span className="font-normal text-muted-foreground">({c.attempts})</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
        <Card className="p-5">
          <SectionTitle icon={ClipboardCheck} title="By practical" />
          {d.practicals.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No lab attempts in this class yet.</p>
          ) : (
            <ul className="divide-y divide-border text-[13px]">
              {d.practicals.map((p) => (
                <li key={p.practicalId} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.title}</span>
                    <span className="text-[12px] text-muted-foreground">
                      {p.attempts} marked · {p.students} student{p.students === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span className={cn('font-display text-[15px] font-semibold tabular', scoreTone(p.average))}>{pct(p.average)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle icon={ListChecks} title={`Attempts (${labs.length} labs, ${d.attempts.length - labs.length} practical-question sets)`} />
        {d.attempts.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Nobody in this class has tried a practical yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {d.attempts.slice(0, 80).map((a) => {
              const inner = (
                <>
                  <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4', a.kind === 'LAB' ? 'bg-ai-2/10 text-ai-2' : 'bg-brand-soft text-brand')}>{a.kind === 'LAB' ? <FlaskConical aria-hidden /> : <PenLine aria-hidden />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{a.student}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {a.title} · {a.kind === 'LAB' ? (a.mode === 'EXAM' ? 'timed lab' : 'practice lab') : 'practical questions'} · {a.submittedAt ? formatRelative(a.submittedAt) : 'in progress'}
                    </span>
                  </span>
                  {a.reviewed && (
                    <Badge variant="success">
                      <BadgeCheck /> Reviewed
                    </Badge>
                  )}
                  <span className={cn('shrink-0 font-display text-[14px] font-semibold tabular', scoreTone(a.percent))}>{a.percent === null ? '—' : `${a.percent}%`}</span>
                </>
              );
              return (
                <li key={`${a.kind}-${a.id}`}>
                  {a.kind === 'LAB' && a.submittedAt ? (
                    <Link to={`/practical-work/attempts/${a.id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-muted/60">
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 py-2.5">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <SectionTitle icon={Users} title="Students" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-muted-foreground">
                <th className="py-1.5 font-medium">Student</th>
                <th className="py-1.5 text-right font-medium">Labs</th>
                <th className="py-1.5 text-right font-medium">Question sets</th>
                <th className="py-1.5 text-right font-medium">Lab average</th>
              </tr>
            </thead>
            <tbody>
              {d.students.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="py-2">{s.name}</td>
                  <td className="py-2 text-right tabular">{s.labs}</td>
                  <td className="py-2 text-right tabular">{s.questions}</td>
                  <td className={cn('py-2 text-right font-semibold tabular', scoreTone(s.average))}>{pct(s.average)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/** One student's lab for review: the marks, their recorded work, and an audited override with a note. */
export function PracticalReviewPage() {
  const { id = '' } = useParams();
  const q = useTeachingAttempt(id);
  const a = q.data;
  const override = useOverrideLab(id);
  const [score, setScore] = useState('');
  const [note, setNote] = useState('');
  const Sim = a ? simulatorUi(a.simulatorId).component : null;
  return (
    <Page className="max-w-6xl">
      {q.error && !a ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !a || !Sim ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <>
          <PageHeader
            eyebrow={
              <Link to="/practical-work" className="inline-flex items-center gap-1 hover:underline">
                <ArrowLeft className="size-3" aria-hidden /> Practical work
              </Link>
            }
            title={`${a.student}: ${a.title}`}
            description={`${a.subject} · ${a.mode === 'EXAM' ? 'timed practical' : 'practice lab'}${a.submittedAt ? ` · handed in ${formatRelative(a.submittedAt)}` : ' · not handed in yet'}`}
          />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start [&>*]:min-w-0">
            <div className="space-y-4">
              {a.result ? <LabResult a={a} teacher /> : <p className="text-[13px] text-muted-foreground">This lab hasn’t been handed in yet.</p>}
              {a.state && (
                <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
                  <h2 className="font-display text-[15px] font-semibold tracking-tight">The student’s lab record</h2>
                  <Sim seed={a.seed} mode={a.mode} state={a.state as never} onChange={() => undefined} readOnly startedAt={a.startedAt} practicalId={a.practicalId} />
                </Suspense>
              )}
            </div>
            {a.canOverride && a.result && (
              <Card className="p-4 lg:sticky lg:top-4">
                <SectionTitle icon={BadgeCheck} title="Review the mark" />
                <p className="mb-3 text-[12.5px] text-muted-foreground">
                  Marked {a.result.markedScore}/{a.result.maxScore}. Readings and calculations are marked exactly; criteria labelled AI-assisted were written answers. Your score replaces the marked one, the student sees “Reviewed by your teacher”, and the change is recorded in the audit log.
                </p>
                <div className="space-y-3">
                  <Field label={`Score (out of ${a.result.maxScore})`} htmlFor="ov-score">
                    <Input id="ov-score" inputMode="decimal" value={score} onChange={(e) => setScore(e.target.value)} placeholder={String(a.result.score)} />
                  </Field>
                  <Field label="Note to the student" htmlFor="ov-note">
                    <Textarea id="ov-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Your colour change was right: phenolphthalein goes colourless." />
                  </Field>
                  {override.error && <p className="text-[12.5px] text-danger">{errorMessage(override.error)}</p>}
                  {override.isSuccess && <p className="text-[12.5px] text-success">Saved.</p>}
                  <Button
                    className="w-full"
                    loading={override.isPending}
                    disabled={score.trim() === '' || Number.isNaN(Number(score)) || Number(score) < 0 || Number(score) > a.result.maxScore || note.trim().length < 3}
                    onClick={() => override.mutate({ score: Number(score), note: note.trim() })}
                  >
                    Save reviewed score
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </>
      )}
    </Page>
  );
}
