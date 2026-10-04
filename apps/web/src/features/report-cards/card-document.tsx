import { ordinal, REPORT_COLUMNS, REPORT_STUDENT_FIELDS, type ReportCardView, type ReportColumn, type ReportStudentField, type ReportTemplateConfig } from '@aischool/shared';
import { Info } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { formatDate, formatMoney } from '@/lib/format';
import { cn, initialsFromName } from '@/lib/utils';
import { AssessmentStatusBadge, fmtPct, fmtScore } from '../assessment/ui';

/**
 * The printable report card, drawn from the school's layout (`v.template`).
 * Used by the real card page and, with sample data, by the layout editor's
 * live preview. Sizes use container queries so a scaled preview looks like
 * the printed sheet whatever the screen width.
 */

/** Short headings used when the school hasn't given its own. */
const COLUMN_HEADINGS: Record<ReportColumn, string> = {
  components: 'Scores',
  total: 'Total',
  percent: '%',
  grade: 'Grade',
  remark: 'Remark',
  subjectPosition: 'Pos.',
  classAverage: 'Class avg',
  highest: 'Highest',
  lowest: 'Lowest',
  cumulative: 'Cum. avg',
  teacherInitials: 'Initials',
};

export function columnHeading(cfg: ReportTemplateConfig, col: ReportColumn): string {
  return cfg.columnLabels[col]?.trim() || COLUMN_HEADINGS[col] || REPORT_COLUMNS[col];
}

type Sub = ReportCardView['subjects'][number];

interface Cell {
  key: string;
  head: ReactNode;
  align?: 'left' | 'center';
  render: (s: Sub) => ReactNode;
}

function tableCells(v: ReportCardView): Cell[] {
  const cfg = v.template;
  const out: Cell[] = [];
  for (const col of cfg.columns) {
    const head = columnHeading(cfg, col);
    switch (col) {
      case 'components':
        for (const c of v.components) {
          out.push({
            key: `c-${c.key}`,
            head: (
              <>
                {cfg.columnLabels[`component:${c.key}`]?.trim() || c.name}
                <span className="block font-normal normal-case opacity-80">/{c.maxScore}</span>
              </>
            ),
            render: (s) => <span className={cn(s.scores[c.key] == null && 'text-muted-foreground')}>{fmtScore(s.scores[c.key] ?? null)}</span>,
          });
        }
        break;
      case 'total':
        out.push({
          key: col,
          head,
          render: (s) =>
            s.total == null ? (
              '—'
            ) : (
              <span className="whitespace-nowrap">
                <span className="font-semibold">{fmtScore(s.total)}</span>
                <span className="text-muted-foreground">/{s.outOf}</span>
                {!s.complete && <span className="ml-1 text-[0.8em] font-medium text-warning">so far</span>}
              </span>
            ),
        });
        break;
      case 'percent':
        out.push({ key: col, head, render: (s) => fmtPct(s.percent) });
        break;
      case 'grade':
        out.push({
          key: col,
          head,
          render: (s) => {
            if (!s.grade) return '—';
            const band = v.gradingScale.find((b) => b.grade === s.grade);
            return <span className={cn('font-bold', band?.pass === false && 'text-danger')}>{s.grade}</span>;
          },
        });
        break;
      case 'remark':
        out.push({ key: col, head, align: 'left', render: (s) => <span className="text-muted-foreground">{s.remark ?? '—'}</span> });
        break;
      case 'subjectPosition':
        out.push({ key: col, head, render: (s) => (s.position ? ordinal(s.position) : '—') });
        break;
      case 'classAverage':
        out.push({ key: col, head, render: (s) => fmtPct(s.classAverage) });
        break;
      case 'highest':
        out.push({ key: col, head, render: (s) => fmtPct(s.highest, 0) });
        break;
      case 'lowest':
        out.push({ key: col, head, render: (s) => fmtPct(s.lowest, 0) });
        break;
      case 'cumulative':
        v.extra.termNames.forEach((name, i) =>
          out.push({ key: `cum-${i}`, head: name, render: (s) => fmtPct(s.cumulative?.terms[i] ?? null, 0) }),
        );
        out.push({ key: col, head, render: (s) => <span className="font-semibold">{fmtPct(s.cumulative?.average ?? null)}</span> });
        break;
      case 'teacherInitials':
        out.push({ key: col, head, render: () => <span className="inline-block w-10" /> });
        break;
    }
  }
  return out;
}

function fieldValue(f: ReportStudentField, v: ReportCardView): string {
  const s = v.summary;
  switch (f) {
    case 'admissionNumber':
      return v.student.admissionNumber;
    case 'class':
      return `${v.classArm.levelName} ${v.classArm.name}`;
    case 'term':
      return v.term.name;
    case 'session':
      return v.term.sessionName;
    case 'gender':
      return v.student.gender === 'FEMALE' ? 'Female' : 'Male';
    case 'age':
      return v.extra.age == null ? '—' : `${v.extra.age} years`;
    case 'classSize':
      return String(s.classSize);
    case 'position':
      return s.position ? `${ordinal(s.position)} of ${s.classSize}` : '—';
    case 'average':
      return fmtPct(s.average);
    case 'totalScore':
      return fmtScore(s.totalScore);
    case 'attendance': {
      const a = v.attendance;
      if (!a || !a.daysMarked) return '—';
      const rate = a.rate == null ? '' : ` (${Number.isInteger(a.rate) ? a.rate : a.rate.toFixed(1)}%)`;
      return `${a.present + a.late} of ${a.daysMarked} days${rate}`;
    }
    case 'nextTermBegins':
      return v.extra.nextTermBegins ? formatDate(v.extra.nextTermBegins) : '—';
    case 'feesOwed':
      return v.extra.feesOwed == null ? '—' : v.extra.feesOwed <= 0 ? 'Nil' : formatMoney(v.extra.feesOwed, v.extra.currency);
  }
}

export function ReportCardDocument({
  v,
  renderComment,
  preview,
  className,
}: {
  v: ReportCardView;
  /** Replaces the plain comment text (the card page passes editable boxes). */
  renderComment?: (kind: 'teacher' | 'principal', label: string) => ReactNode;
  /** Sample data in the layout editor: no status badge, no interim notice. */
  preview?: boolean;
  className?: string;
}) {
  const cfg = v.template;
  const cells = tableCells(v);
  const interim = !preview && v.subjects.some((s) => !s.complete);
  const traitSections = (
    [
      ['affective', cfg.affective, v.traits.affective],
      ['psychomotor', cfg.psychomotor, v.traits.psychomotor],
    ] as const
  ).filter(([, sec]) => sec.enabled && sec.traits.length > 0);

  const accentText = 'text-[var(--rc-accent)] dark:text-foreground print:text-[var(--rc-accent)]';
  const tint = 'bg-[color-mix(in_srgb,var(--rc-accent)_9%,transparent)]';

  return (
    <article
      style={{ '--rc-accent': cfg.accentColor } as CSSProperties}
      className={cn(
        '@container print-a4 mx-auto overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-soft print:rounded-none print:border-0 print:shadow-none',
        className,
      )}
    >
      <div aria-hidden className="h-1.5 w-full bg-[var(--rc-accent)]" />

      {/* ---------------------------------------------------- school header */}
      <header className="flex flex-col items-center gap-3 px-5 pt-5 pb-3 text-center @xl:flex-row @xl:gap-4 @xl:px-7 print:px-3 print:pt-2 print:pb-2">
        {cfg.header.showLogo &&
          (v.school.logoUrl ? (
            <img src={v.school.logoUrl} alt="" className="size-16 shrink-0 object-contain @xl:size-[72px] print:size-16" />
          ) : (
            <div
              className={cn('grid size-16 shrink-0 place-items-center rounded-full border-2 border-[var(--rc-accent)] font-display text-xl font-bold @xl:size-[72px] print:size-16', accentText)}
            >
              {initialsFromName(v.school.name)}
            </div>
          ))}
        <div className="min-w-0 flex-1">
          <h1 className={cn('font-display text-[20px] font-extrabold uppercase leading-tight tracking-tight @xl:text-[25px] print:text-[19px]', accentText)}>{v.school.name}</h1>
          {cfg.header.showMotto && v.school.motto && <p className="mt-0.5 text-[12.5px] italic text-muted-foreground print:text-[10px]">“{v.school.motto}”</p>}
          {cfg.header.showAddress && v.school.address && <p className="mt-0.5 text-[12px] text-muted-foreground print:text-[9.5px]">{v.school.address}</p>}
          {cfg.header.extraLine && <p className="mt-0.5 text-[12px] font-medium print:text-[9.5px]">{cfg.header.extraLine}</p>}
        </div>
        {cfg.header.showLogo && <div aria-hidden className="hidden w-[72px] shrink-0 @xl:block print:w-16" />}
      </header>

      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-[var(--rc-accent)] px-4 py-1.5 text-center text-white print:py-1">
        <p className="font-display text-[13px] font-bold uppercase tracking-[0.12em] @xl:text-[14px] print:text-[11px]">{cfg.header.title}</p>
        <p className="text-[12px] font-medium opacity-90 print:text-[10px]">
          {v.term.name} · {v.term.sessionName} session
        </p>
        {!preview && <AssessmentStatusBadge status={v.status} className="print:hidden" />}
      </div>

      {/* ---------------------------------------------------- learner */}
      <dl className="grid grid-cols-2 gap-px border-b border-border bg-border @xl:grid-cols-4">
        <InfoCell label="Name" value={v.student.name} className="col-span-2" strong />
        {cfg.studentFields.map((f) => (
          <InfoCell key={f} label={REPORT_STUDENT_FIELDS[f]} value={fieldValue(f, v)} />
        ))}
        {/* Fill the last row so the grid has no gaps. */}
        {Array.from({ length: 3 }, (_, i) => {
          const wide = i < (4 - ((cfg.studentFields.length + 2) % 4)) % 4;
          const narrow = i < cfg.studentFields.length % 2;
          if (!wide && !narrow) return null;
          return <div key={i} aria-hidden className={cn('bg-card', narrow ? 'block' : 'hidden', wide ? '@xl:block' : '@xl:hidden')} />;
        })}
      </dl>

      {interim && (
        <p className="flex items-start gap-2 border-b border-border bg-warning-soft/50 px-5 py-2 text-[12px] print:px-3 print:py-1 print:text-[9px]">
          <Info className="mt-0.5 size-3.5 shrink-0 text-warning print:hidden" />
          Interim report: some subjects have only been partly assessed. Scores marked “so far” are out of what has been assessed, and grades are based on that
          percentage.
        </p>
      )}

      {/* ---------------------------------------------------- subjects */}
      <div className="scrollbar-thin overflow-x-auto print-scroll-reset">
        <table className="w-full border-collapse text-[12.5px] print:text-[9.5px]">
          <thead>
            <tr className={cn('border-b border-border text-[10px] uppercase tracking-wide', tint, accentText)}>
              <th scope="col" className="px-3 py-2 text-left font-semibold @xl:pl-6 print:px-2 print:py-1">
                Subject
              </th>
              {cells.map((c) => (
                <th key={c.key} scope="col" className={cn('border-l border-border/70 px-1.5 py-2 align-bottom font-semibold leading-tight print:py-1 print:text-[7.5px]', c.align === 'left' ? 'text-left' : 'text-center')}>
                  {c.head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {v.subjects.length === 0 && (
              <tr>
                <td colSpan={cells.length + 1} className="px-6 py-8 text-center text-muted-foreground">
                  No marks entered for this learner yet.
                </td>
              </tr>
            )}
            {v.subjects.map((sub) => (
              <tr key={sub.subject.id} className="border-b border-border last:border-0 even:bg-muted/25">
                <th scope="row" className="whitespace-nowrap px-3 py-1.5 text-left font-medium @xl:pl-6 print:px-2 print:py-[3px]">
                  {sub.subject.name}
                </th>
                {cells.map((c) => (
                  <td key={c.key} className={cn('border-l border-border/70 px-1.5 py-1.5 tabular print:py-[3px]', c.align === 'left' ? 'text-left' : 'text-center')}>
                    {c.render(sub)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------------------------------------------------- traits */}
      {traitSections.length > 0 && (
        <div className={cn('grid gap-3 border-t border-border px-4 py-3 @xl:px-6 print:gap-2 print:px-3 print:py-2', traitSections.length > 1 && '@xl:grid-cols-2')}>
          {traitSections.map(([key, sec, ratings]) => (
            <TraitTable key={key} title={sec.title} traits={sec.traits} ratings={ratings} scale={cfg.ratingScale} tint={tint} accentText={accentText} />
          ))}
          <p className="text-[11px] text-muted-foreground @xl:col-span-2 print:text-[8px]">
            <span className="font-semibold uppercase tracking-wide">Rating key: </span>
            {cfg.ratingScale.map((r) => `${r.value} – ${r.label}`).join(' · ')}
          </p>
        </div>
      )}

      {/* ---------------------------------------------------- comments */}
      <div className="grid gap-3 border-t border-border px-4 py-4 @xl:grid-cols-2 @xl:px-6 print:gap-2 print:px-3 print:py-2">
        {(
          [
            ['teacher', cfg.comments.teacherLabel, v.teacherRemark],
            ['principal', cfg.comments.principalLabel, v.principalRemark],
          ] as const
        ).map(([kind, label, text]) =>
          renderComment ? (
            <div key={kind} className="min-w-0">
              {renderComment(kind, label)}
            </div>
          ) : (
            <section key={kind} className="print-avoid-break rounded-xl border border-border p-3 print:p-2">
              <h2 className={cn('mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider print:text-[8px]', accentText)}>{label}</h2>
              <p className={cn('whitespace-pre-line text-[13px] leading-relaxed print:text-[10px]', !text && 'italic text-muted-foreground')}>{text || '—'}</p>
              {kind === 'teacher' && v.classArm.classTeacher && <p className="mt-2 text-[11px] text-muted-foreground print:text-[8.5px]">{v.classArm.classTeacher}</p>}
            </section>
          ),
        )}
      </div>

      {/* ---------------------------------------------------- signatures */}
      {cfg.signatures.length > 0 && (
        <div className={cn('grid gap-x-6 gap-y-5 px-4 pt-5 pb-4 @xl:px-6 print:gap-x-4 print:px-3 print:pt-5 print:pb-2', cfg.signatures.length === 1 ? 'grid-cols-1 @xl:grid-cols-3' : 'grid-cols-2', cfg.signatures.length >= 3 && '@xl:grid-cols-4')}>
          {cfg.signatures.map((label, i) => (
            <div key={`${label}-${i}`} className="border-t border-dotted border-foreground/50 pt-1 text-center text-[11px] text-muted-foreground print:text-[8.5px]">
              {label}’s signature
            </div>
          ))}
        </div>
      )}

      {/* ---------------------------------------------------- grading key & footer */}
      {(cfg.showGradingKey || cfg.footerNote || !preview) && (
        <footer className="border-t border-border bg-muted/30 px-4 py-3 @xl:px-6 print:px-3 print:py-1.5">
          {cfg.showGradingKey && (
            <>
              <p className={cn('mb-1 text-[10px] font-semibold uppercase tracking-wider print:text-[7.5px]', accentText)}>Grading key</p>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] print:text-[8px]">
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
            </>
          )}
          {cfg.footerNote && <p className={cn('whitespace-pre-line text-[11.5px] font-medium print:text-[8.5px]', cfg.showGradingKey && 'mt-2 print:mt-1')}>{cfg.footerNote}</p>}
          {!preview && (
            <p className="mt-2 text-[11px] text-muted-foreground print:hidden">
              {v.status === 'PUBLISHED' && v.publishedAt ? `Published ${formatDate(v.publishedAt)}.` : 'Draft — not yet published to parents.'} Grades are on the
              percentage of each subject assessed.
            </p>
          )}
        </footer>
      )}
    </article>
  );
}

function InfoCell({ label, value, className, strong }: { label: string; value: string; className?: string; strong?: boolean }) {
  return (
    <div className={cn('min-w-0 bg-card px-3 py-1.5 @xl:px-4 print:px-2 print:py-[3px]', className)}>
      <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground print:text-[7.5px]">{label}</dt>
      <dd className={cn('truncate font-semibold print:text-[10px]', strong ? 'text-[14.5px] uppercase print:text-[11px]' : 'text-[13px]')}>{value}</dd>
    </div>
  );
}

function TraitTable({
  title,
  traits,
  ratings,
  scale,
  tint,
  accentText,
}: {
  title: string;
  traits: string[];
  ratings: Record<string, number | null>;
  scale: ReportTemplateConfig['ratingScale'];
  tint: string;
  accentText: string;
}) {
  // A tick under each value (the usual Nigerian layout) when the scale is short; otherwise one rating column.
  const ticks = scale.length <= 6;
  return (
    <section className="print-avoid-break min-w-0">
      <table className="w-full border-collapse border border-border text-[12px] print:text-[9px]">
        <caption className={cn('border border-b-0 border-border px-2 py-1 text-left text-[10.5px] font-semibold uppercase tracking-wider print:py-0.5 print:text-[8px]', tint, accentText)}>
          {title}
        </caption>
        <thead>
          <tr className="border-b border-border text-[10px] text-muted-foreground print:text-[7.5px]">
            <th scope="col" className="px-2 py-1 text-left font-medium">
              Trait
            </th>
            {ticks ? (
              scale.map((s) => (
                <th key={s.value} scope="col" title={s.label} className="w-7 border-l border-border px-1 py-1 text-center font-semibold tabular print:w-5">
                  {s.value}
                </th>
              ))
            ) : (
              <th scope="col" className="border-l border-border px-2 py-1 text-center font-medium">
                Rating
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {traits.map((t) => {
            const r = ratings[t] ?? null;
            return (
              <tr key={t} className="border-b border-border last:border-0">
                <th scope="row" className="px-2 py-[3px] text-left font-normal print:py-px">
                  {t}
                </th>
                {ticks ? (
                  scale.map((s) => (
                    <td key={s.value} className="border-l border-border text-center font-bold" aria-label={r === s.value ? `${s.value} – ${s.label}` : undefined}>
                      {r === s.value ? '✓' : ''}
                    </td>
                  ))
                ) : (
                  <td className="border-l border-border text-center tabular font-semibold">{r ?? ''}</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/** Forces the printed paper size for the card's layout (A4 or US Letter). */
export function PaperStyle({ paper }: { paper: ReportTemplateConfig['paper'] }) {
  return <style>{`@media print { @page { size: ${paper === 'LETTER' ? 'letter' : 'A4'} portrait; margin: 8mm 9mm; } }`}</style>;
}
