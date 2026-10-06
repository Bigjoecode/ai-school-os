import { CELL_BAND_LABELS, INSIGHT_SOURCE_LABELS, type ClassInsightsOptions, type ClassTopicDetail } from '@aischool/shared';
import { BookOpenCheck, ClipboardList, Layers, ListChecks, MessageCircleQuestion, NotebookPen, Presentation, Target, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/empty-state';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useHasFeature } from '@/lib/auth-store';
import { formatDate, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { GroupDialog, PracticeDialog, RemedialDialog } from './actions';
import { useClassStudent, useClassTopic } from './api';
import { BAND_SWATCH, ScoreBar, Trend } from './ui';

function Section({ icon: Icon, title, children, className }: { icon: typeof Users; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
        <Icon className="size-3.5 text-muted-foreground" aria-hidden /> {title}
      </h3>
      {children}
    </section>
  );
}

function Loading() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-20 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}

// ------------------------------------------------------------------ topic

export function TopicSheet({
  classArmId,
  subjectId,
  topicId,
  options,
  onClose,
  onStudent,
}: {
  classArmId: string;
  subjectId: string;
  topicId: string | null;
  options: ClassInsightsOptions;
  onClose: () => void;
  onStudent: (id: string) => void;
}) {
  const q = useClassTopic(classArmId, subjectId, topicId);
  const d = q.data && q.data.topic.id === topicId ? q.data : undefined;
  return (
    <Sheet open={!!topicId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="font-display text-lg font-semibold leading-tight">{d?.topic.name ?? 'Topic'}</SheetTitle>
          <SheetDescription className="text-[12.5px] text-muted-foreground">
            {d ? `${d.classLabel} · ${d.subject}${d.topic.parent ? ` · ${d.topic.parent}` : ''}` : 'Loading…'}
          </SheetDescription>
          {d && d.topic.exams.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {d.topic.exams.map((e) => (
                <Badge key={e} variant="outline">
                  {e}
                </Badge>
              ))}
            </div>
          )}
        </SheetHeader>
        <SheetBody>{q.error && !d ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !d ? <Loading /> : <TopicBody d={d} classArmId={classArmId} subjectId={subjectId} options={options} onStudent={onStudent} />}</SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function TopicBody({ d, classArmId, subjectId, options, onStudent }: { d: ClassTopicDetail; classArmId: string; subjectId: string; options: ClassInsightsOptions; onStudent: (id: string) => void }) {
  const hasAi = useHasFeature('ai');
  const hasHomework = useHasFeature('live_classes');
  const [dialog, setDialog] = useState<'remedial' | 'practice' | 'group' | null>(null);
  const [showAll, setShowAll] = useState(false);
  const canAi = options.canAi && hasAi;
  const total = d.classSize || 1;
  const askAi = `Which students in ${d.classLabel} are struggling with "${d.topic.name}" in ${d.subject}, and how should I re-teach it?`;
  const list = showAll ? d.students : d.struggling;

  return (
    <div className="space-y-6 pb-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-muted/60 px-2 py-2.5">
          <p className="text-[11px] font-medium text-muted-foreground">Class average</p>
          <p className="font-display text-xl font-semibold tabular">{d.average === null ? '–' : `${d.average}%`}</p>
        </div>
        <div className="rounded-xl bg-muted/60 px-2 py-2.5">
          <p className="text-[11px] font-medium text-muted-foreground">Below 50%</p>
          <p className="font-display text-xl font-semibold tabular text-danger">{d.struggling.length}</p>
        </div>
        <div className="rounded-xl bg-muted/60 px-2 py-2.5">
          <p className="text-[11px] font-medium text-muted-foreground">Assessed</p>
          <p className="font-display text-xl font-semibold tabular">
            {d.assessed}/{d.classSize}
          </p>
        </div>
      </div>

      <Section icon={Layers} title="Distribution">
        <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={d.distribution.map((x) => `${x.label}: ${x.count}`).join(', ')}>
          {d.distribution.map((x) => (x.count ? <span key={x.band} className={BAND_SWATCH[x.band]} style={{ width: `${(100 * x.count) / total}%` }} /> : null))}
        </div>
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px]">
          {d.distribution.map((x) => (
            <li key={x.band} className="flex items-center gap-1.5">
              <span className={cn('size-2.5 shrink-0 rounded-[3px]', BAND_SWATCH[x.band])} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{CELL_BAND_LABELS[x.band]}</span>
              <span className="tabular font-medium">{x.count}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section icon={Target} title="Next steps">
        <div className="grid gap-2 sm:grid-cols-2">
          {options.canLessons && canAi && (
            <Button variant="brand" className="justify-start" onClick={() => setDialog('remedial')}>
              <Presentation /> Generate remedial lesson
            </Button>
          )}
          {options.canHomework && hasHomework && (
            <Button variant="outline" className="justify-start" onClick={() => setDialog('practice')}>
              <ClipboardList /> Set practice homework
            </Button>
          )}
          <Button variant="outline" className="justify-start" onClick={() => setDialog('group')} disabled={!d.struggling.length}>
            <Users /> Group struggling students
          </Button>
          {canAi && (
            <Button asChild variant="outline" className="justify-start">
              <Link to={`/ai?agent=teacher&q=${encodeURIComponent(askAi)}`}>
                <MessageCircleQuestion /> Ask AI
              </Link>
            </Button>
          )}
        </div>
        {(d.lessons.length > 0 || d.homework.length > 0) && (
          <ul className="mt-3 space-y-1 text-[12.5px]">
            {d.lessons.map((l) => (
              <li key={l.id} className="flex items-center gap-2">
                <Presentation className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <Link to={`/lessons/${l.id}`} className="min-w-0 flex-1 truncate text-brand hover:underline">
                  {l.topic}
                </Link>
                <Badge variant="outline">{l.generation === 'QUEUED' || l.generation === 'RUNNING' ? 'Writing…' : l.reviewStatus === 'NOT_SUBMITTED' ? 'Draft' : l.reviewStatus.toLowerCase()}</Badge>
              </li>
            ))}
            {d.homework.map((h) => (
              <li key={h.id} className="flex items-center gap-2">
                <ClipboardList className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <Link to="/homework" className="min-w-0 flex-1 truncate text-brand hover:underline">
                  {h.title}
                </Link>
                <Badge variant="outline">
                  {h.status === 'DRAFT' ? 'Draft' : 'Set'} · due {formatDate(h.dueDate, { day: 'numeric', month: 'short' })}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section icon={Users} title={showAll ? 'Every student' : `Below 50% (${d.struggling.length})`}>
        {list.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {list.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => onStudent(s.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{s.name}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">
                      {s.attempts ? `${s.attempts} attempt${s.attempts === 1 ? '' : 's'} · ${formatRelative(s.lastEvidenceAt)}` : 'No evidence yet'}
                    </span>
                  </span>
                  <Trend value={s.trend} />
                  <ScoreBar score={s.score} className="w-28 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">{showAll ? 'No students in this class.' : 'Nobody is below 50% on this topic.'}</p>
        )}
        <Button variant="link" size="sm" className="mt-1" onClick={() => setShowAll((x) => !x)}>
          {showAll ? 'Show only students below 50%' : 'Show every student'}
        </Button>
      </Section>

      <Section icon={ListChecks} title="Where the evidence comes from">
        {d.sources.length ? (
          <ul className="space-y-1.5 text-[12.5px]">
            {d.sources.map((s) => (
              <li key={s.source} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{INSIGHT_SOURCE_LABELS[s.source] ?? s.label}</span>
                <span className="text-muted-foreground tabular">{s.count} piece{s.count === 1 ? '' : 's'}</span>
                <span className="w-24 text-right tabular">{s.percentCorrect === null ? '–' : `${s.percentCorrect}% correct`}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">No evidence logged on this topic yet.</p>
        )}
      </Section>

      {d.subSkills.length > 0 && (
        <Section icon={Layers} title="Sub-topics">
          <ul className="space-y-1.5">
            {d.subSkills.map((s) => (
              <li key={s.topicId} className="flex items-center gap-3 text-[12.5px]">
                <span className="min-w-0 flex-1 truncate" title={s.name}>
                  {s.name}
                </span>
                <span className="w-20 shrink-0 text-right text-[11.5px] text-muted-foreground tabular">{s.assessed ? `${s.struggling}/${s.assessed} low` : 'no evidence'}</span>
                <ScoreBar score={s.average} className="w-28 shrink-0" />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {d.topic.objectives.length > 0 && (
        <Section icon={BookOpenCheck} title="Syllabus objectives">
          <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-muted-foreground">
            {d.topic.objectives.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </Section>
      )}

      <RemedialDialog open={dialog === 'remedial'} onOpenChange={(o) => setDialog(o ? 'remedial' : null)} d={d} classArmId={classArmId} subjectId={subjectId} />
      <PracticeDialog open={dialog === 'practice'} onOpenChange={(o) => setDialog(o ? 'practice' : null)} d={d} classArmId={classArmId} subjectId={subjectId} canAi={canAi} />
      <GroupDialog open={dialog === 'group'} onOpenChange={(o) => setDialog(o ? 'group' : null)} d={d} />
    </div>
  );
}

// ------------------------------------------------------------------ student

export function StudentSheet({
  classArmId,
  subjectId,
  studentId,
  onClose,
  onTopic,
}: {
  classArmId: string;
  subjectId: string;
  studentId: string | null;
  onClose: () => void;
  onTopic: (id: string) => void;
}) {
  const q = useClassStudent(classArmId, subjectId, studentId);
  const d = q.data && q.data.student.id === studentId ? q.data : undefined;
  return (
    <Sheet open={!!studentId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="font-display text-lg font-semibold leading-tight">{d?.student.name ?? 'Student'}</SheetTitle>
          <SheetDescription className="text-[12.5px] text-muted-foreground">{d ? `${d.classLabel} · ${d.subject} · ${d.student.admissionNumber}` : 'Loading…'}</SheetDescription>
        </SheetHeader>
        <SheetBody>
          {q.error && !d ? (
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          ) : !d ? (
            <Loading />
          ) : (
            <div className="space-y-6 pb-4">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl bg-muted/60 px-2 py-2.5">
                  <p className="text-[11px] font-medium text-muted-foreground">Topic mastery</p>
                  <p className="font-display text-xl font-semibold tabular">{d.overall === null ? '–' : `${d.overall}%`}</p>
                </div>
                <div className="rounded-xl bg-muted/60 px-2 py-2.5">
                  <p className="text-[11px] font-medium text-muted-foreground">Official this term</p>
                  <p className="font-display text-xl font-semibold tabular">{d.officialPercent === null ? '–' : `${d.officialPercent}%`}</p>
                </div>
              </div>
              <Section icon={Layers} title="Topics">
                {d.topics.length ? (
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {d.topics.map((t) => (
                      <li key={t.topicId}>
                        <button type="button" onClick={() => onTopic(t.topicId)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px]" title={t.topic}>
                              {t.topic}
                            </span>
                            <span className="block truncate text-[11.5px] text-muted-foreground">
                              {t.parent ? `${t.parent} · ` : ''}
                              {t.attempts} attempt{t.attempts === 1 ? '' : 's'} · {formatRelative(t.lastEvidenceAt)}
                            </span>
                          </span>
                          <Trend value={t.trend} />
                          <ScoreBar score={t.score} className="w-28 shrink-0" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-muted-foreground">No topic evidence for this subject yet.</p>
                )}
              </Section>
              {d.recent.length > 0 && (
                <Section icon={NotebookPen} title="Recent evidence">
                  <ul className="space-y-1.5 text-[12.5px]">
                    {d.recent.map((e, i) => (
                      <li key={`${e.at}-${i}`} className="flex items-center gap-2">
                        <span className="w-16 shrink-0 text-muted-foreground tabular">{formatDate(e.at, { day: 'numeric', month: 'short' })}</span>
                        <span className="min-w-0 flex-1 truncate" title={e.topic}>
                          {e.topic}
                        </span>
                        <span className="hidden shrink-0 text-muted-foreground sm:inline">{INSIGHT_SOURCE_LABELS[e.source] ?? e.source}</span>
                        <span className="w-12 shrink-0 text-right tabular">
                          {Math.round(e.correct)}/{Math.round(e.total)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
