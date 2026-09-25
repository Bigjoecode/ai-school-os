import { ordinal, type ReportCardView } from '@aischool/shared';
import { Award, CalendarCheck, Check, ChevronLeft, ChevronRight, Info, Pencil, Printer, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Page } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { cn, initialsFromName } from '@/lib/utils';
import { useReportCard, useReportCards, useUpdateRemarks } from '../assessment/api';
import { AiBadge, AssessmentStatusBadge, fmtPct, fmtScore } from '../assessment/ui';
import { BackLink, DetailSkeleton } from '../planning/ui';

export default function ReportCardPage() {
  const { studentId = '' } = useParams();
  const [params] = useSearchParams();
  const termId = params.get('termId') ?? undefined;
  const query = useReportCard(studentId, termId);
  const v = query.data;

  if (!termId) {
    return (
      <Page className="max-w-5xl">
        <BackLink to="/report-cards">Report Cards</BackLink>
        <EmptyState icon={Award} title="Pick a term" description="Open a report card from the class list." />
      </Page>
    );
  }
  if (query.isLoading) {
    return (
      <Page className="max-w-5xl">
        <DetailSkeleton />
      </Page>
    );
  }
  if (!v) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <Page className="max-w-5xl">
        <BackLink to="/report-cards">Report Cards</BackLink>
        {notFound ? (
          <EmptyState icon={Award} title="Report card not found" description="This learner may not be in a class for that term." />
        ) : (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        )}
      </Page>
    );
  }
  return <CardView v={v} termId={termId} />;
}

function CardView({ v, termId }: { v: ReportCardView; termId: string }) {
  useDocumentTitle(`${v.student.name} · Report card`);
  const navigate = useNavigate();
  // The server knows who teaches this class; it says which remarks you may edit.
  const canPublish = v.canEditPrincipalRemark;
  const canTeacher = v.canEditTeacherRemark;

  // Previous / next learner in the class (by position, as on the list).
  const list = useReportCards({ classArmId: v.classArm.id, termId });
  const rows = list.data ?? [];
  const idx = rows.findIndex((r) => r.studentId === v.student.id);
  const prev = idx > 0 ? rows[idx - 1] : undefined;
  const next = idx >= 0 && idx < rows.length - 1 ? rows[idx + 1] : undefined;
  const link = (id: string) => `/report-cards/${id}?termId=${termId}&classArmId=${v.classArm.id}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft' && prev) navigate(link(prev.studentId));
      if (e.key === 'ArrowRight' && next) navigate(link(next.studentId));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prev?.studentId, next?.studentId]);

  const interim = v.subjects.some((s) => !s.complete);
  const s = v.summary;

  return (
    <Page className="max-w-5xl print:max-w-none print:p-0">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <BackLink to="/report-cards">Report Cards</BackLink>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-card shadow-xs">
            <Button asChild={!!prev} variant="ghost" size="sm" className="rounded-r-none" disabled={!prev} aria-label="Previous learner">
              {prev ? (
                <Link to={link(prev.studentId)}>
                  <ChevronLeft /> <span className="hidden max-w-32 truncate sm:inline">{prev.name}</span>
                </Link>
              ) : (
                <span>
                  <ChevronLeft />
                </span>
              )}
            </Button>
            <span className="border-x border-border px-2.5 text-[12px] tabular text-muted-foreground">{idx >= 0 ? `${idx + 1} of ${rows.length}` : '—'}</span>
            <Button asChild={!!next} variant="ghost" size="sm" className="rounded-l-none" disabled={!next} aria-label="Next learner">
              {next ? (
                <Link to={link(next.studentId)}>
                  <span className="hidden max-w-32 truncate sm:inline">{next.name}</span> <ChevronRight />
                </Link>
              ) : (
                <span>
                  <ChevronRight />
                </span>
              )}
            </Button>
          </div>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
        </div>
      </div>

      <article className="print-a4 mx-auto overflow-hidden rounded-2xl border border-border bg-card shadow-soft print:rounded-none print:border-0 print:text-[10.5px] print:shadow-none">
        <div aria-hidden className="h-1.5 w-full bg-gradient-to-r from-brand via-ai-2 to-ai-3" />

        {/* ---------------------------------------------------- school header */}
        <header className="flex flex-col items-center gap-3 border-b border-border px-5 py-6 text-center sm:flex-row sm:text-left sm:px-8 print:flex-row print:px-4 print:py-3 print:text-left">
          {v.school.logoUrl ? (
            <img src={v.school.logoUrl} alt="" className="size-16 shrink-0 rounded-xl object-contain print:size-14" />
          ) : (
            <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-brand-soft font-display text-xl font-bold text-brand print:size-14">
              {initialsFromName(v.school.name)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[22px] font-bold uppercase leading-tight tracking-tight sm:text-[24px] print:text-[18px]">{v.school.name}</h1>
            {v.school.motto && <p className="mt-0.5 text-[13px] italic text-muted-foreground print:text-[10.5px]">“{v.school.motto}”</p>}
            {v.school.address && <p className="mt-0.5 text-[12px] text-muted-foreground print:text-[9.5px]">{v.school.address}</p>}
          </div>
          <div className="shrink-0 text-center sm:text-right print:text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Termly report</p>
            <p className="font-display text-[15px] font-semibold">
              {v.term.name} · {v.term.sessionName}
            </p>
            <AssessmentStatusBadge status={v.status} className="mt-1 print:hidden" />
          </div>
        </header>

        {/* ---------------------------------------------------- learner */}
        <dl className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-4 print:grid-cols-4">
          {(
            [
              ['Learner', v.student.name],
              ['Admission no.', v.student.admissionNumber],
              ['Class', `${v.classArm.levelName} ${v.classArm.name}`],
              ['Class teacher', v.classArm.classTeacher ?? '—'],
              ['Gender', v.student.gender === 'FEMALE' ? 'Female' : 'Male'],
              ['Term dates', `${formatDate(v.term.startsOn, { year: undefined })} – ${formatDate(v.term.endsOn)}`],
              ['Subjects', String(s.subjectsTaken)],
              ['Class size', String(s.classSize)],
            ] as const
          ).map(([k, val]) => (
            <div key={k} className="min-w-0 bg-card px-4 py-2.5 sm:px-5 print:px-3 print:py-1.5">
              <dt className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground print:text-[8.5px]">{k}</dt>
              <dd className="mt-0.5 truncate text-[13.5px] font-semibold print:text-[10.5px]">{val}</dd>
            </div>
          ))}
        </dl>

        {interim && (
          <p className="flex items-start gap-2 border-b border-border bg-warning-soft/50 px-5 py-2.5 text-[12.5px] sm:px-8 print:px-3 print:py-1.5 print:text-[9.5px]">
            <Info className="mt-0.5 size-3.5 shrink-0 text-warning" />
            Interim report: some subjects have only been partly assessed. Scores marked “so far” are out of what has been assessed, and grades are based on that
            percentage.
          </p>
        )}

        {/* ---------------------------------------------------- subjects */}
        <div className="scrollbar-thin overflow-x-auto print-scroll-reset">
          <table className="w-full border-collapse text-[12.5px] print:text-[9.5px]">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-[10.5px] uppercase tracking-wider text-muted-foreground print:text-[8px]">
                <th scope="col" className="px-4 py-2 text-left font-medium sm:pl-8 print:px-2">
                  Subject
                </th>
                {v.components.map((c) => (
                  <th key={c.key} scope="col" className="px-2 py-2 text-center font-medium">
                    {c.name}
                    <span className="block font-normal normal-case">/{c.maxScore}</span>
                  </th>
                ))}
                <th scope="col" className="px-2 py-2 text-center font-medium">
                  Total
                </th>
                <th scope="col" className="px-2 py-2 text-center font-medium">
                  Grade
                </th>
                <th scope="col" className="px-2 py-2 text-left font-medium">
                  Remark
                </th>
                <th scope="col" className="px-2 py-2 text-center font-medium">
                  Pos.
                </th>
                <th scope="col" className="px-2 py-2 text-center font-medium">
                  Class avg
                </th>
                <th scope="col" className="px-2 py-2 text-center font-medium sm:pr-8 print:px-2">
                  High / Low
                </th>
              </tr>
            </thead>
            <tbody>
              {v.subjects.length === 0 && (
                <tr>
                  <td colSpan={v.components.length + 7} className="px-8 py-8 text-center text-muted-foreground">
                    No marks entered for this learner yet.
                  </td>
                </tr>
              )}
              {v.subjects.map((sub) => {
                const band = v.gradingScale.find((b) => b.grade === sub.grade);
                return (
                  <tr key={sub.subject.id} className="border-b border-border last:border-0">
                    <th scope="row" className="px-4 py-2 text-left font-medium sm:pl-8 print:px-2 print:py-1">
                      {sub.subject.name}
                    </th>
                    {v.components.map((c) => (
                      <td key={c.key} className={cn('px-2 py-2 text-center tabular print:py-1', sub.scores[c.key] == null && 'text-muted-foreground')}>
                        {fmtScore(sub.scores[c.key] ?? null)}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-2 py-2 text-center tabular print:py-1">
                      {sub.total == null ? (
                        '—'
                      ) : (
                        <>
                          <span className="font-semibold">{fmtScore(sub.total)}</span>
                          <span className="text-muted-foreground">/{sub.outOf}</span>
                          {!sub.complete && <span className="ml-1 text-[10px] font-medium text-warning">so far</span>}
                        </>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center print:py-1">
                      {sub.grade ? (
                        <span
                          className={cn(
                            'inline-grid min-w-8 place-items-center rounded-md px-1.5 py-0.5 text-[12px] font-bold print:text-[9.5px]',
                            band?.pass === false ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success',
                          )}
                        >
                          {sub.grade}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-2 py-2 text-muted-foreground print:py-1">{sub.remark ?? '—'}</td>
                    <td className="px-2 py-2 text-center tabular print:py-1">{sub.position ? ordinal(sub.position) : '—'}</td>
                    <td className="px-2 py-2 text-center tabular text-muted-foreground print:py-1">{fmtPct(sub.classAverage)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-center tabular text-muted-foreground sm:pr-8 print:px-2 print:py-1">
                      {fmtPct(sub.highest, 0)} / {fmtPct(sub.lowest, 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ---------------------------------------------------- summary */}
        <div className="grid grid-cols-2 gap-px border-y border-border bg-border sm:grid-cols-4 print:grid-cols-4">
          <SummaryTile label="Total score" value={fmtScore(s.totalScore)} />
          <SummaryTile label="Average" value={fmtPct(s.average)} emphasis />
          <SummaryTile label="Position" value={s.position ? `${ordinal(s.position)} of ${s.classSize}` : '—'} emphasis />
          <SummaryTile label="Class average" value={fmtPct(s.classAverage)} />
        </div>

        {/* ---------------------------------------------------- attendance */}
        <AttendanceStrip a={v.attendance} />

        {/* ---------------------------------------------------- remarks */}
        <div className="grid gap-5 px-5 py-6 sm:px-8 md:grid-cols-2 print:grid-cols-2 print:gap-3 print:px-3 print:py-3">
          <RemarkBox
            title="Class teacher’s remark"
            who={v.classArm.classTeacher}
            value={v.teacherRemark}
            ai={v.remarkSource === 'AI' && !!v.teacherRemark}
            editable={canTeacher}
            studentId={v.student.id}
            termId={termId}
            field="teacherRemark"
          />
          <RemarkBox
            title="Principal’s remark"
            value={v.principalRemark}
            editable={canPublish}
            studentId={v.student.id}
            termId={termId}
            field="principalRemark"
          />
        </div>

        {/* ---------------------------------------------------- grading key */}
        <footer className="border-t border-border bg-muted/30 px-5 py-4 sm:px-8 print:px-3 print:py-2">
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground print:mb-1 print:text-[8px]">Grading key</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] print:text-[8.5px]">
            {[...v.gradingScale]
              .sort((a, b) => b.min - a.min)
              .map((b, i, arr) => (
                <span key={b.grade} className="tabular">
                  <span className={cn('font-bold', !b.pass && 'text-danger')}>{b.grade}</span>{' '}
                  <span className="text-muted-foreground">
                    {b.min}
                    {i === 0 ? '–100' : `–${arr[i - 1].min - 1}`} {b.remark}
                  </span>
                </span>
              ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground print:mt-1 print:text-[8.5px]">
            {v.status === 'PUBLISHED' && v.publishedAt ? `Published ${formatDate(v.publishedAt)}.` : 'Draft — not yet published to parents.'} Grades are on the
            percentage of each subject assessed.
          </p>
        </footer>
      </article>
    </Page>
  );
}

function SummaryTile({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="bg-card px-4 py-3 text-center sm:px-5 print:py-1.5">
      <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground print:text-[8px]">{label}</p>
      <p className={cn('mt-0.5 font-display font-semibold tabular', emphasis ? 'text-[20px] print:text-[14px]' : 'text-[16px] print:text-[12px]')}>{value}</p>
    </div>
  );
}

function AttendanceStrip({ a }: { a: ReportCardView['attendance'] | undefined }) {
  if (!a) return null;
  const tiles: [string, string, string?][] = [
    ['Days marked', String(a.daysMarked)],
    ['Present', String(a.present)],
    ['Late', String(a.late), a.late > 0 ? 'text-warning print:text-inherit' : undefined],
    ['Absent', String(a.absent), a.absent > 0 ? 'text-danger print:text-inherit' : undefined],
    ['Excused', String(a.excused)],
    ['Attendance', a.rate == null ? '—' : `${Number.isInteger(a.rate) ? a.rate : a.rate.toFixed(1)}%`],
  ];
  return (
    <section aria-labelledby="rc-attendance" className="print-avoid-break border-b border-border">
      <h2
        id="rc-attendance"
        className="flex items-center gap-1.5 bg-muted/50 px-4 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground sm:px-8 print:px-3 print:py-1 print:text-[8px]"
      >
        <CalendarCheck className="size-3 print:hidden" aria-hidden /> Attendance this term
      </h2>
      <dl className="grid grid-cols-3 gap-px bg-border sm:grid-cols-6 print:grid-cols-6">
        {tiles.map(([label, value, tone], i) => (
          <div key={label} className="bg-card px-3 py-2 text-center print:py-1">
            <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground print:text-[7.5px]">{label}</dt>
            <dd className={cn('mt-0.5 font-display font-semibold tabular', i === tiles.length - 1 ? 'text-[17px] print:text-[12px]' : 'text-[15px] print:text-[11px]', tone)}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function RemarkBox({
  title,
  who,
  value,
  ai,
  editable,
  studentId,
  termId,
  field,
}: {
  title: string;
  who?: string | null;
  value: string | null;
  ai?: boolean;
  editable: boolean;
  studentId: string;
  termId: string;
  field: 'teacherRemark' | 'principalRemark';
}) {
  const update = useUpdateRemarks(studentId, termId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);
  useEffect(() => setEditing(false), [studentId]);

  const save = () =>
    update.mutate({ [field]: draft.trim() }, { onSuccess: () => setEditing(false) });

  return (
    <section className="print-avoid-break flex flex-col rounded-xl border border-border p-4 print:p-2">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground print:text-[8.5px]">{title}</h2>
        {ai && (
          <span className="print:hidden">
            <AiBadge label="AI draft" />
          </span>
        )}
        {editable && !editing && (
          <Button size="icon-sm" variant="ghost" className="ml-auto -my-1 print:hidden" aria-label={`Edit ${title.toLowerCase()}`} onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
        )}
      </div>
      {editing ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Textarea
            aria-label={title}
            rows={4}
            maxLength={1000}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(false);
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
            }}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              <X /> Cancel
            </Button>
            <Button type="submit" size="sm" loading={update.isPending}>
              {!update.isPending && <Check />} Save
            </Button>
          </div>
        </form>
      ) : (
        <p className={cn('flex-1 whitespace-pre-line text-[13.5px] leading-relaxed print:text-[10px]', !value && 'italic text-muted-foreground')}>
          {value || (editable ? 'No remark yet — click the pencil to write one.' : 'No remark yet.')}
        </p>
      )}
      <div className="mt-4 flex items-end justify-between gap-4 text-[11px] text-muted-foreground print:mt-2 print:text-[8.5px]">
        <span className="truncate">{who ?? ''}</span>
        <span className="w-32 border-t border-dotted border-foreground/40 pt-1 text-center">Signature</span>
      </div>
    </section>
  );
}
