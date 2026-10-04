import type { ReportCardView } from '@aischool/shared';
import { Award, CalendarCheck, Check, ChevronLeft, ChevronRight, LayoutTemplate, Pencil, Printer, Star, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Page } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { useDocumentTitle } from '@/lib/hooks';
import { useCan } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { useReportCard, useReportCards, useUpdateRemarks } from '../assessment/api';
import { AiBadge } from '../assessment/ui';
import { BackLink, DetailSkeleton } from '../planning/ui';
import { PaperStyle, ReportCardDocument } from './card-document';

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

  const canLayout = useCan('results.publish');

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
          {(canTeacher || canPublish) && (
            <Button asChild variant="outline">
              <Link to={`/report-cards/ratings?classArmId=${v.classArm.id}&termId=${termId}`}>
                <Star /> Rate traits
              </Link>
            </Button>
          )}
          {canLayout && (
            <Button asChild variant="ghost">
              <Link to="/report-cards/layout">
                <LayoutTemplate /> Layout
              </Link>
            </Button>
          )}
          <Button variant="outline" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
        </div>
      </div>

      <PaperStyle paper={v.template.paper} />
      {/* Its own wrapper so the sheet is a :last-child (no blank page after it). */}
      <div>
      <ReportCardDocument
        v={v}
        className="print:text-[10.5px]"
        renderComment={(kind, label) =>
          kind === 'teacher' ? (
            <RemarkBox
              title={label}
              who={v.classArm.classTeacher}
              value={v.teacherRemark}
              ai={v.remarkSource === 'AI' && !!v.teacherRemark}
              editable={canTeacher}
              studentId={v.student.id}
              termId={termId}
              field="teacherRemark"
            />
          ) : (
            <RemarkBox title={label} value={v.principalRemark} editable={canPublish} studentId={v.student.id} termId={termId} field="principalRemark" />
          )
        }
      />
      </div>

      <div className="mx-auto mt-4 overflow-hidden rounded-2xl border border-border bg-card print:hidden">
        <AttendanceStrip a={v.attendance} />
      </div>
    </Page>
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
    <section aria-labelledby="rc-attendance">
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
    <section className="print-avoid-break flex h-full flex-col rounded-xl border border-border p-3 print:p-2">
      <div className="mb-1.5 flex items-center gap-2">
        <h2 className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--rc-accent)] dark:text-foreground print:text-[8px] print:text-[var(--rc-accent)]">{title}</h2>
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
        <p className={cn('flex-1 whitespace-pre-line text-[13px] leading-relaxed print:text-[10px]', !value && 'italic text-muted-foreground')}>
          {value || (editable ? 'No remark yet — click the pencil to write one.' : 'No remark yet.')}
        </p>
      )}
      {who && <p className="mt-2 truncate text-[11px] text-muted-foreground print:mt-1 print:text-[8.5px]">{who}</p>}
    </section>
  );
}
