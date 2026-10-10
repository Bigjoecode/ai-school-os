import { type CensusCandidates, type CensusReport, type CensusTable } from '@aischool/shared';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Info, Printer, Settings2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth-store';
import { formatDate, formatDateTime, todayIso } from '@/lib/format';
import { cn } from '@/lib/utils';
import { downloadCsv, slug, tableRows, useCensusCandidates, useCensusReport } from './api';

const ALL = '__all__';
const WHOLE_SESSION = '__session__';

/**
 * Returns & census: ASC-style summary tables from the school's own records,
 * to help complete the state's Annual School Census form, plus exam
 * candidate working lists. Prints as one signed pack.
 */
export default function ReturnsPage() {
  const [params, setParams] = useSearchParams();
  const sessionId = params.get('session') ?? undefined;
  const termParam = params.get('term');
  const branchId = params.get('branch') ?? undefined;
  const q = useCensusReport({ sessionId, termId: termParam && termParam !== WHOLE_SESSION ? termParam : undefined, branchId });
  const r = q.data;
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k === 'session') next.delete('term');
    setParams(next, { replace: true });
  };

  if (q.error && !r) {
    return (
      <Page>
        <PageHeader title="Returns & census" />
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Page>
    );
  }

  const scope = r ? (r.branch ? r.branch.name : r.branches.length > 1 ? 'Whole school (all campuses)' : 'Whole school') : '';
  const period = r ? [r.term?.name, r.session?.name].filter(Boolean).join(', ') || 'No session set up' : '';

  return (
    <Page className="print:max-w-none print:p-0">
      <div className="print:hidden">
        <PageHeader
          title="Returns & census"
          description="Summary tables from your records for the state's Annual School Census (SUBEB / Ministry of Education) and working lists for WAEC, NECO and BECE registration."
          actions={
            <>
              <Button variant="outline" asChild>
                <Link to="/settings/returns">
                  <Settings2 /> Returns profile
                </Link>
              </Button>
              <Button variant="outline" disabled={!r} onClick={() => r && downloadAll(r)}>
                <FileSpreadsheet /> All tables (CSV)
              </Button>
              <Button disabled={!r} onClick={() => window.print()}>
                <Printer /> Print pack
              </Button>
            </>
          }
        />
      </div>

      <Disclaimer text={r?.disclaimer ?? "Prepared to help you complete your state's official form — check against your state's current template."} />

      {!r ? (
        <div className="mt-5 space-y-4">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3 print:hidden">
            <div className="space-y-1.5">
              <Label htmlFor="rt-session">Session</Label>
              <Select value={r.session?.id ?? ''} onValueChange={(v) => setParam('session', v)}>
                <SelectTrigger id="rt-session">
                  <SelectValue placeholder="No sessions" />
                </SelectTrigger>
                <SelectContent>
                  {r.sessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.isCurrent ? ' (current)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rt-term">Term (attendance and sick bay)</Label>
              <Select value={r.term?.id ?? WHOLE_SESSION} onValueChange={(v) => setParam('term', v)}>
                <SelectTrigger id="rt-term">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WHOLE_SESSION}>Whole session</SelectItem>
                  {(r.sessions.find((s) => s.id === r.session?.id)?.terms ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rt-branch">Campus</Label>
              <Select value={r.branch?.id ?? ALL} onValueChange={(v) => setParam('branch', v === ALL ? null : v)} disabled={r.branches.length < 2}>
                <SelectTrigger id="rt-branch">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Whole school (combined)</SelectItem>
                  {r.branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <QualityPanel r={r} />

          <article className={cn('mt-6 space-y-5', q.isFetching && 'opacity-70 transition-opacity')} aria-label="Census tables">
            <header className="hidden border-b border-border pb-3 print:block">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">School returns summary (ASC-style)</p>
              <h1 className="font-display text-xl font-semibold">{r.school.name}</h1>
              {r.school.address && <p className="text-[12px] text-muted-foreground">{r.school.address}</p>}
              <p className="text-[12px] text-muted-foreground">
                {scope} · {period} · prepared {formatDateTime(r.generatedAt)}
              </p>
            </header>
            <p className="text-[13px] text-muted-foreground print:hidden">
              Showing <span className="font-medium text-foreground">{scope}</span> · {period}
              {r.enrolmentBasis === 'PROMOTION_RECORDS' && ' · enrolment from end-of-session records'}
            </p>
            {r.sections.map((s) => (
              <Card key={s.key} className="break-inside-avoid print:border-0 print:shadow-none">
                <CardHeader>
                  <div>
                    <CardTitle>{s.title}</CardTitle>
                    <CardDescription>{s.description}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  {s.tables.map((t) => (
                    <CensusTableView key={t.key} t={t} filename={`${slug(r.school.name)}-${t.key}${r.branch ? `-${slug(r.branch.name)}` : ''}-${slug(period)}.csv`} />
                  ))}
                </CardContent>
              </Card>
            ))}
            <SignOff defaultName={r.profile?.headName ?? ''} />
          </article>

          <CandidatesCard branchId={r.branch?.id} levels={r.levels} />
        </>
      )}
    </Page>
  );
}

function Disclaimer({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-info/30 bg-info-soft px-4 py-3 text-[13px] text-foreground print:border-black/30 print:bg-transparent">
      <Info className="mt-0.5 size-4 shrink-0 text-info" />
      <p>{text}</p>
    </div>
  );
}

function CensusTableView({ t, filename }: { t: CensusTable; filename: string }) {
  return (
    <section className="break-inside-avoid">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold">{t.title}</h3>
          {t.note && <p className="text-[12.5px] text-muted-foreground">{t.note}</p>}
        </div>
        <Button size="sm" variant="ghost" className="shrink-0 print:hidden" onClick={() => downloadCsv(filename, tableRows(t))} aria-label={`Download ${t.title} as CSV`}>
          <Download /> CSV
        </Button>
      </div>
      <div className="print-scroll-reset overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-max border-collapse text-[13px]">
          <thead>
            <tr className="bg-muted/50">
              {t.columns.map((c, i) => (
                <th key={c} scope="col" className={cn('border-b border-border px-3 py-2 font-medium', i === 0 ? 'text-left' : 'text-right')}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.length === 0 && (
              <tr>
                <td colSpan={t.columns.length} className="px-3 py-3 text-center text-muted-foreground">
                  Nothing recorded
                </td>
              </tr>
            )}
            {t.rows.map((row, ri) => (
              <tr key={ri} className="border-b border-border last:border-0">
                {row.map((cell, ci) => (
                  <td key={ci} className={cn('px-3 py-1.5 tabular-nums', ci === 0 ? 'text-left' : 'text-right', cell === 'Not recorded' && 'text-muted-foreground')}>
                    {cell ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {t.totals && (
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                {t.totals.map((cell, ci) => (
                  <td key={ci} className={cn('px-3 py-1.5 tabular-nums', ci === 0 ? 'text-left' : 'text-right')}>
                    {cell ?? ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

function QualityPanel({ r }: { r: CensusReport }) {
  if (!r.quality.length) {
    return (
      <div className="mt-5 flex items-center gap-2 rounded-xl border border-success/30 bg-success-soft px-4 py-3 text-[13px] print:hidden">
        <CheckCircle2 className="size-4 text-success" /> No gaps found in the records these tables use.
      </div>
    );
  }
  return (
    <Card className="mt-5 print:hidden">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-warning" /> Data quality
          </CardTitle>
          <CardDescription>Fix these before you copy figures across: each gap makes a table less accurate.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {r.quality.map((i) => (
            <li key={i.key} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium">
                  {i.label} <Badge variant="warning">{i.count}</Badge>
                </p>
                {i.examples.length > 0 && (
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                    {i.key === 'profile' ? 'Missing: ' : 'For example: '}
                    {i.examples.join(', ')}
                    {i.key !== 'profile' && i.count > i.examples.length ? ` and ${i.count - i.examples.length} more` : ''}
                  </p>
                )}
              </div>
              <Button size="sm" variant="outline" asChild className="shrink-0">
                <Link to={i.fixTo}>Fix in {i.fixLabel}</Link>
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function SignOff({ defaultName }: { defaultName: string }) {
  const [name, setName] = useState(defaultName);
  const [role, setRole] = useState('Head teacher / Principal');
  const [date, setDate] = useState(todayIso());
  useEffect(() => setName(defaultName), [defaultName]);
  return (
    <Card className="break-inside-avoid print:border print:shadow-none">
      <CardHeader>
        <div>
          <CardTitle>Sign-off</CardTitle>
          <CardDescription>I confirm these figures were taken from the school's records and checked before submission.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="so-name">Name</Label>
          <Input id="so-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Head of school" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="so-role">Designation</Label>
          <Input id="so-role" value={role} onChange={(e) => setRole(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="so-date">Date</Label>
          <Input id="so-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <p className="text-[12.5px] text-muted-foreground">Signature and school stamp</p>
          <div className="mt-8 border-b border-dashed border-border-strong" />
        </div>
        <p className="self-end text-[12px] text-muted-foreground sm:col-span-2">{date ? `Dated ${formatDate(date)}` : ''}</p>
      </CardContent>
    </Card>
  );
}

const CANDIDATE_LEVEL = [/^s{1,2}s\s*3$/i, /^ss\s*iii$/i, /^jss\s*3$/i, /^primary\s*6$/i, /^basic\s*9$/i];

function CandidatesCard({ branchId, levels: allLevels }: { branchId?: string; levels: { id: string; name: string }[] }) {
  const canSee = useCan('students.read');
  const [levelId, setLevelId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const q = useCensusCandidates(open ? levelId : null, branchId);
  const data = q.data;
  const levels = allLevels;
  if (!canSee) return null;
  return (
    <Card className="mt-6 print:hidden">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4" /> Exam candidates: working lists
          </CardTitle>
          <CardDescription>
            Names, sex, date of birth and the subjects their class takes, for WAEC, NECO or BECE registration. Opening a list is recorded in the audit log.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!open ? (
          <LevelPicker
            levels={levels}
            onPick={(id) => {
              setLevelId(id);
              setOpen(true);
            }}
          />
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-1.5 sm:w-64">
                <Label htmlFor="cand-level">Class</Label>
                <Select value={levelId ?? ''} onValueChange={setLevelId}>
                  <SelectTrigger id="cand-level">
                    <SelectValue placeholder="Choose a class" />
                  </SelectTrigger>
                  <SelectContent>
                    {levels.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" disabled={!data?.candidates.length} onClick={() => data && downloadCandidates(data)} className="sm:ml-auto">
                <Download /> Download CSV
              </Button>
            </div>
            {data && <Disclaimer text={data.disclaimer} />}
            {q.isLoading ? (
              <Skeleton className="h-40 rounded-xl" />
            ) : q.error ? (
              <ErrorState error={q.error} onRetry={() => void q.refetch()} />
            ) : data ? (
              <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
                <table className="w-full min-w-max text-[13px]">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border text-left">
                      {['Adm. no.', 'Surname', 'First name', 'Middle name', 'Sex', 'Date of birth', 'Class', 'Subjects'].map((h) => (
                        <th key={h} className="px-3 py-2 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.candidates.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-3 py-4 text-center text-muted-foreground">
                          No active pupils in {data.classLevel.name}.
                        </td>
                      </tr>
                    )}
                    {data.candidates.map((c) => (
                      <tr key={c.admissionNumber} className="border-b border-border last:border-0">
                        <td className="px-3 py-1.5 font-mono text-[12px]">{c.admissionNumber}</td>
                        <td className="px-3 py-1.5">{c.lastName}</td>
                        <td className="px-3 py-1.5">{c.firstName}</td>
                        <td className="px-3 py-1.5">{c.middleName ?? ''}</td>
                        <td className="px-3 py-1.5">{c.sex}</td>
                        <td className={cn('px-3 py-1.5', !c.dateOfBirth && 'text-danger')}>{c.dateOfBirth ? formatDate(c.dateOfBirth) : 'Missing'}</td>
                        <td className="px-3 py-1.5">{c.classArm}</td>
                        <td className="max-w-[360px] truncate px-3 py-1.5" title={c.subjects.join(', ')}>
                          {c.subjects.length ? `${c.subjects.length}: ${c.subjects.join(', ')}` : <span className="text-danger">No subjects set for the class</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LevelPicker({ levels, onPick }: { levels: { id: string; name: string }[]; onPick: (id: string) => void }) {
  const suggested = useMemo(() => {
    for (const re of CANDIDATE_LEVEL) {
      const hit = levels.filter((l) => re.test(l.name.trim()));
      if (hit.length) return hit;
    }
    return [];
  }, [levels]);
  const [other, setOther] = useState('');
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      {suggested.map((l) => (
        <Button key={l.id} variant="outline" onClick={() => onPick(l.id)}>
          Open {l.name} list
        </Button>
      ))}
      {levels.length > 0 ? (
        <Select value={other} onValueChange={(v) => { setOther(v); onPick(v); }}>
          <SelectTrigger className="sm:w-56" aria-label="Another class">
            <SelectValue placeholder={suggested.length ? 'Another class…' : 'Choose a class…'} />
          </SelectTrigger>
          <SelectContent>
            {levels.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p className="text-[13px] text-muted-foreground">Set up classes in Academic setup first.</p>
      )}
    </div>
  );
}

function downloadAll(r: CensusReport) {
  const rows: unknown[][] = [
    [r.school.name],
    [`${r.branch ? r.branch.name : 'Whole school'} · ${[r.term?.name, r.session?.name].filter(Boolean).join(', ')}`],
    [r.disclaimer],
    [],
  ];
  for (const s of r.sections) {
    rows.push([s.title.toUpperCase()], [s.description]);
    for (const t of s.tables) {
      rows.push([t.title], ...tableRows(t), []);
    }
  }
  downloadCsv(`${slug(r.school.name)}-returns${r.branch ? `-${slug(r.branch.name)}` : ''}-${slug(r.session?.name ?? 'session')}.csv`, rows);
}

function downloadCandidates(d: CensusCandidates) {
  const rows: unknown[][] = [
    [d.disclaimer],
    ['Admission number', 'Surname', 'First name', 'Middle name', 'Sex', 'Date of birth (YYYY-MM-DD)', 'Class', 'Number of subjects', 'Subjects'],
    ...d.candidates.map((c) => [c.admissionNumber, c.lastName, c.firstName, c.middleName ?? '', c.sex, c.dateOfBirth ?? '', c.classArm, c.subjects.length, c.subjects.join('; ')]),
  ];
  downloadCsv(`candidates-${slug(d.classLevel.name)}-working-list.csv`, rows);
}
