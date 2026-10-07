import { HEALTH_BAND_LABELS, HEALTH_PARTS, HEALTH_WEIGHTS, type SuccessSummary, type SuccessWeek } from '@aischool/shared';
import { Link2, Printer } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Page } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatNumber } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { initialsFromName } from '@/lib/utils';
import { BackLink } from '../planning/ui';
import { money, pct, useSuccessSummary, useSuccessTrends, weekLabel } from './api';

const INK = '#1b2440';
const SOFT = '#4b556b';

/**
 * The one-page "Term impact report" a principal can print (or save as PDF)
 * for the proprietor or the PTA: the headline numbers, the learning story and
 * the assumptions behind the estimates.
 */
export default function SuccessReportPage() {
  const [params] = useSearchParams();
  const termId = params.get('termId') ?? undefined;
  const q = useSuccessSummary(termId);
  const t = useSuccessTrends(termId);
  useDocumentTitle(q.data ? `Term impact report · ${q.data.school.name}` : 'Term impact report');
  const back = `/success${termId ? `?termId=${termId}` : ''}`;

  if (q.error && !q.data) {
    return (
      <Page className="max-w-4xl">
        <BackLink to={back}>School success</BackLink>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Page>
    );
  }
  if (!q.data) {
    return (
      <Page className="max-w-4xl">
        <Skeleton className="h-[900px] rounded-2xl" />
      </Page>
    );
  }
  return (
    <Page className="max-w-4xl print:max-w-none print:p-0">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <BackLink to={back}>School success</BackLink>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(window.location.href)
                .then(() => toast.success('Link copied. Colleagues who can see School success can open it.'))
                .catch(() => toast.error('Could not copy the link'));
            }}
          >
            <Link2 /> Copy link
          </Button>
          <Button onClick={() => window.print()}>
            <Printer /> Print or save as PDF
          </Button>
        </div>
      </div>
      <Report s={q.data} weeks={t.data?.weeks} />
    </Page>
  );
}

function Report({ s, weeks }: { s: SuccessSummary; weeks?: SuccessWeek[] }) {
  const o = s.outcomes;
  const studentsShare = s.population.students ? s.adoption.studentsActive / s.population.students : null;
  const staffShare = s.population.staffWithAccounts ? s.adoption.staffActive / s.population.staffWithAccounts : null;
  const parentsShare = s.population.guardians ? s.adoption.parentsActive / s.population.guardians : null;

  const highlights = [
    o.recovered > 0 && `${formatNumber(o.recovered)} student topics moved from below 50% to 50% or more this term (${pct(o.recoveredShare)} of those that started low).`,
    o.averageGain != null && o.trackedPairs > 0 && `Where students were tracked more than once on a topic, mastery changed by ${o.averageGain > 0 ? '+' : ''}${o.averageGain} points on average (${formatNumber(o.trackedPairs)} student topics).`,
    s.adoption.homeworkSet > 0 && `Teachers set ${formatNumber(s.adoption.homeworkSet)} homework assignments; students handed in ${formatNumber(s.adoption.homeworkHandedIn)}.`,
    s.adoption.testsSat > 0 && `Students sat ${formatNumber(s.adoption.testsSat)} online tests, marked automatically.`,
    s.timeSaved.totalHours > 0 && `AI support saved teachers an estimated ${formatNumber(s.timeSaved.totalHours)} hours.`,
    s.parents.updatesSent > 0 && `Parents received ${formatNumber(s.parents.updatesSent)} weekly learning updates${s.parents.openRate != null ? `; ${pct(s.parents.openRate)} of those in the app were opened` : ''}.`,
    s.parents.onlinePayments > 0 &&
      `${formatNumber(s.parents.onlinePayments)} fee payments were made online${s.parents.onlinePaymentsKobo != null ? ` (${money(s.parents.onlinePaymentsKobo, s.currency)})` : ''}.`,
  ].filter(Boolean) as string[];

  const tiles: [string, string, string][] = [
    ['Health score', `${s.health.score}/100`, HEALTH_BAND_LABELS[s.health.band]],
    ['Students active', formatNumber(s.adoption.studentsActive), `${pct(studentsShare)} of ${formatNumber(s.population.students)} students`],
    ['Staff using it', formatNumber(s.adoption.staffActive), `${pct(staffShare)} of staff with accounts`],
    ['Parents active', formatNumber(s.adoption.parentsActive), `${pct(parentsShare)} of parents`],
    ['Topics recovered', formatNumber(o.recovered), o.startedBelow ? `of ${formatNumber(o.startedBelow)} that started below 50%` : 'needs repeat evidence'],
    ['Average mastery gain', o.averageGain == null ? '—' : `${o.averageGain > 0 ? '+' : ''}${o.averageGain} pts`, `${formatNumber(o.trackedPairs)} student topics`],
    ['Teacher hours saved', formatNumber(s.timeSaved.totalHours), 'estimate (see below)'],
    s.finance
      ? ['Fees collected', pct(s.finance.collectionRate), `${pct(s.finance.onlineShare)} of payments online`]
      : ['Fees paid online', formatNumber(s.parents.onlinePayments), 'payments this term'],
  ];

  return (
    <article className="print-a4 mx-auto w-full overflow-hidden rounded-2xl border border-border bg-white shadow-soft print:rounded-none print:border-0 print:shadow-none" style={{ color: INK }} aria-label="Term impact report">
      <div aria-hidden className="h-2 w-full bg-[#5b5bf6]" />
      <div className="px-5 py-6 sm:px-10 sm:py-8 print:px-10 print:py-6">
        <header className="flex items-center gap-4 border-b border-[#dfe3ec] pb-4">
          {s.school.logoUrl ? (
            <img src={s.school.logoUrl} alt="" className="size-14 shrink-0 object-contain" />
          ) : (
            <span className="grid size-14 shrink-0 place-items-center rounded-full border-2 border-[#5b5bf6] text-[18px] font-bold text-[#5b5bf6]">{initialsFromName(s.school.name)}</span>
          )}
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: SOFT }}>
              Term impact report
            </p>
            <h1 className="font-display text-[20px] font-semibold leading-tight sm:text-[24px]">{s.school.name}</h1>
            <p className="text-[12.5px]" style={{ color: SOFT }}>
              {s.term ? s.term.label : 'Last 12 weeks'} · {formatDate(s.range.from)} to {formatDate(s.range.to)}
            </p>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 print:grid-cols-4">
          {tiles.map(([label, value, sub]) => (
            <div key={label} className="rounded-xl bg-[#f3f5f9] px-3 py-2.5">
              <p className="text-[11px] font-medium" style={{ color: SOFT }}>
                {label}
              </p>
              <p className="font-display text-[20px] font-semibold leading-tight tabular">{value}</p>
              <p className="text-[10.5px] leading-snug" style={{ color: SOFT }}>
                {sub}
              </p>
            </div>
          ))}
        </section>

        <section className="mt-5 grid gap-5 sm:grid-cols-[1.3fr_1fr] print:grid-cols-[1.3fr_1fr]">
          <div>
            <h2 className="text-[13px] font-semibold">What changed this term</h2>
            {highlights.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-[12.5px] leading-snug">
                {highlights.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[12.5px]" style={{ color: SOFT }}>
                Not enough activity yet this term to report.
              </p>
            )}
          </div>
          <div>
            <h2 className="text-[13px] font-semibold">Students active each week</h2>
            {weeks ? <MiniBars weeks={weeks} /> : <div className="mt-2 h-24 rounded bg-[#f3f5f9]" />}
          </div>
        </section>

        <section className="mt-5 grid gap-5 sm:grid-cols-2 print:grid-cols-2">
          <div>
            <h2 className="text-[13px] font-semibold">Use of the platform</h2>
            <table className="mt-1.5 w-full text-[12px]">
              <tbody>
                {(
                  [
                    ['Attendance registers taken', s.adoption.registers],
                    ['Homework set / handed in / marked', `${formatNumber(s.adoption.homeworkSet)} / ${formatNumber(s.adoption.homeworkHandedIn)} / ${formatNumber(s.adoption.homeworkGraded)}`],
                    ['Online tests run / sat', `${formatNumber(s.adoption.testsRun)} / ${formatNumber(s.adoption.testsSat)}`],
                    ['Lesson plans written / vetted', `${formatNumber(s.adoption.lessonPlans)} / ${formatNumber(s.adoption.lessonPlansVetted)}`],
                    ['AI tutor conversations', s.adoption.tutorConversations],
                    ['Exam Academy practice sessions', o.practice.attempts],
                    ['Messages sent to families', s.adoption.messagesSent],
                    ['Report cards published', s.adoption.reportCardsPublished],
                  ] as [string, number | string][]
                ).map(([k, v]) => (
                  <tr key={k} className="border-b border-[#eef0f5] last:border-0">
                    <td className="py-1 pr-2" style={{ color: SOFT }}>
                      {k}
                    </td>
                    <td className="py-1 text-right font-medium tabular">{typeof v === 'number' ? formatNumber(v) : v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h2 className="text-[13px] font-semibold">Teacher time saved (estimate)</h2>
            <table className="mt-1.5 w-full text-[12px]">
              <tbody>
                {s.timeSaved.items.map((i) => (
                  <tr key={i.key} className="border-b border-[#eef0f5]">
                    <td className="py-1 pr-2" style={{ color: SOFT }}>
                      {formatNumber(i.count)} × {i.label} <span className="whitespace-nowrap">@ {i.minutesEach} min</span>
                    </td>
                    <td className="py-1 text-right font-medium tabular">{formatNumber(Math.round(i.minutes / 6) / 10)} h</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-1 pr-2 font-semibold">Total</td>
                  <td className="py-1 text-right font-semibold tabular">{formatNumber(s.timeSaved.totalHours)} h</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <footer className="mt-5 border-t border-[#dfe3ec] pt-3 text-[10px] leading-snug" style={{ color: SOFT }}>
          <p>
            <span className="font-semibold">How to read this.</span> Health score (0–100) ={' '}
            {HEALTH_PARTS.map((p, i) => `${i ? ' + ' : ''}${HEALTH_WEIGHTS[p.key]} × ${p.label.toLowerCase()}`).join('')}, each a share of the last {s.health.windowDays} days.
            Mastery gain compares each student's first and latest topic score this term where there are two or more pieces of evidence; it comes from practice, the AI
            tutor, quizzes, homework and online tests, not official results. Time saved is an estimate: the count of AI-assisted items times the minutes shown.
          </p>
          <p className="mt-1">Prepared {formatDate(s.generatedAt)} with AI School OS.</p>
        </footer>
      </div>
    </article>
  );
}

/** Students active per week as plain SVG bars (prints reliably, no chart library). */
function MiniBars({ weeks }: { weeks: SuccessWeek[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.studentsActive));
  const W = 300;
  const H = 80;
  const bw = W / weeks.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 16}`} className="mt-2 w-full max-w-[340px]" role="img" aria-label={`Students active each week: ${weeks.map((w) => `${weekLabel(w.week)} ${w.studentsActive}`).join(', ')}`}>
      {weeks.map((w, i) => {
        const h = Math.max(w.studentsActive ? 2 : 0, (w.studentsActive / max) * (H - 14));
        return (
          <g key={w.week}>
            <rect x={i * bw + 4} y={H - h} width={bw - 8} height={h} rx={3} fill="#5b5bf6" />
            <text x={i * bw + bw / 2} y={H - h - 3} textAnchor="middle" fontSize="8.5" fill={INK}>
              {w.studentsActive}
            </text>
            <text x={i * bw + bw / 2} y={H + 11} textAnchor="middle" fontSize="8" fill={SOFT}>
              {weekLabel(w.week)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
