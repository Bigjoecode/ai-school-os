import { JAMB_LEVEL_LABELS, JAMB_LEVELS, JAMB_OWNERSHIPS, JAMB_STATUSES, OLEVEL_GRADES, OLEVEL_SUBJECTS, UTME_SUBJECTS, type JambCheckInput, type JambCheckResult, type JambCheckRow, type JambCourseRow, type JambLevel, type JambStatus } from '@aischool/shared';
import { Command } from 'cmdk';
import { Check, ChevronDown, ChevronsUpDown, GraduationCap, Info, Loader2, Plus, ShieldCheck, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { errorMessage } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { SectionTitle } from '../learning/components';
import { useJambCheck, useJambCourses, useJambInstitution } from './jamb-api';
import { JAMB_BASE, JambShell, NativeSelect, RequirementBlock, RequirementText, SourceNote, StatusBadge, statusInfo } from './jamb-ui';

const STORE = 'jamb-check-subjects';
interface Saved {
  utme: string[];
  olevel: { subject: string; grade: string }[];
}
function load(): Saved | null {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Saved | null;
    return v && Array.isArray(v.utme) ? v : null;
  } catch {
    return null;
  }
}
function save(v: Saved) {
  try {
    localStorage.setItem(STORE, JSON.stringify(v));
  } catch {
    /* private mode */
  }
}

export default function JambCheckPage() {
  const [params, setParams] = useSearchParams();
  const saved = useMemo(load, []);
  const [utme, setUtme] = useState<string[]>(saved?.utme?.length === 3 ? saved.utme : ['', '', '']);
  const [showOlevel, setShowOlevel] = useState(!!saved?.olevel?.length);
  const [olevel, setOlevel] = useState<{ subject: string; grade: string }[]>(saved?.olevel?.length ? saved.olevel : [{ subject: 'English Language', grade: '' }, { subject: 'Mathematics', grade: '' }]);
  const [course, setCourse] = useState<JambCourseRow | null>(null);
  const courseParam = Number(params.get('course')) || null;
  const institutionId = Number(params.get('institution')) || null;
  const inst = useJambInstitution(institutionId ?? NaN);
  const [filters, setFilters] = useState<{ state?: string; ownership?: string; type?: JambLevel }>({});
  const check = useJambCheck();
  const [shown, setShown] = useState<JambStatus | 'ALL'>('ALL');

  const ready = utme.every(Boolean) && new Set(utme).size === 3 && (!!course || !!courseParam || !!institutionId);
  const run = (f = filters) => {
    if (!ready) return;
    const grades = showOlevel ? olevel.filter((o) => o.subject && o.grade) : [];
    save({ utme, olevel: grades });
    const body: JambCheckInput = {
      utmeSubjects: utme,
      ...(grades.length ? { olevel: grades as JambCheckInput['olevel'] } : {}),
      ...(institutionId && !course ? { institutionId } : { courseId: course?.id ?? courseParam! }),
      ...f,
    };
    check.mutate(body, { onError: (e) => toast.error(errorMessage(e)) });
  };

  // A course chosen from a link (?course=…) runs as soon as the subjects are known.
  useEffect(() => {
    if ((courseParam || institutionId) && ready && !check.data && !check.isPending) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const target = course?.name ?? check.data?.course?.name ?? (institutionId ? inst.data?.name : null);
  const r = check.data;

  return (
    <JambShell title="Eligibility checker" description="Choose your UTME subjects and a course (or an institution) and see, institution by institution, whether your subjects fit JAMB’s requirements.">
      <div className="space-y-4">
        <Card className="space-y-4 p-4 sm:p-5">
          <div>
            <p className="mb-2 text-[13px] font-semibold">1. Your four UTME subjects</p>
            <div className="grid gap-2 sm:grid-cols-4">
              <div className="flex h-10 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 text-[13.5px]">
                <Check className="size-4 text-success" aria-hidden /> Use of English
              </div>
              {utme.map((s, i) => (
                <NativeSelect key={i} label={`UTME subject ${i + 2}`} value={s} onChange={(v) => setUtme((u) => u.map((x, j) => (j === i ? v : x)))}>
                  <option value="">Choose subject {i + 2}…</option>
                  {UTME_SUBJECTS.map((o) => (
                    <option key={o} value={o} disabled={utme.includes(o) && s !== o}>
                      {o}
                    </option>
                  ))}
                </NativeSelect>
              ))}
            </div>
            <p className="mt-1.5 text-[11.5px] text-muted-foreground">Use of English is compulsory for everyone.</p>
          </div>

          <div>
            <button type="button" onClick={() => setShowOlevel(!showOlevel)} aria-expanded={showOlevel} className="flex min-h-9 items-center gap-1.5 text-[13px] font-semibold">
              <ChevronDown className={cn('size-4 transition-transform', !showOlevel && '-rotate-90')} aria-hidden />
              2. Your O’level grades <span className="font-normal text-muted-foreground">(optional — WASSCE/NECO, real or expected)</span>
            </button>
            {showOlevel && (
              <div className="mt-2 space-y-2">
                {olevel.map((o, i) => (
                  <div key={i} className="flex gap-2">
                    <NativeSelect label={`O’level subject ${i + 1}`} value={o.subject} onChange={(v) => setOlevel((l) => l.map((x, j) => (j === i ? { ...x, subject: v } : x)))} className="flex-1">
                      <option value="">Subject…</option>
                      {OLEVEL_SUBJECTS.map((s) => (
                        <option key={s} value={s} disabled={olevel.some((x, j) => j !== i && x.subject === s)}>
                          {s}
                        </option>
                      ))}
                    </NativeSelect>
                    <NativeSelect label={`Grade for ${o.subject || `subject ${i + 1}`}`} value={o.grade} onChange={(v) => setOlevel((l) => l.map((x, j) => (j === i ? { ...x, grade: v } : x)))} className="w-24">
                      <option value="">Grade</option>
                      {OLEVEL_GRADES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </NativeSelect>
                    <Button variant="ghost" size="icon" aria-label="Remove subject" onClick={() => setOlevel((l) => l.filter((_, j) => j !== i))}>
                      <X />
                    </Button>
                  </div>
                ))}
                {olevel.length < 9 && (
                  <Button variant="outline" size="sm" onClick={() => setOlevel((l) => [...l, { subject: '', grade: '' }])}>
                    <Plus /> Add a subject
                  </Button>
                )}
                <p className="text-[11.5px] text-muted-foreground">Enter all your subjects: A1–C6 count as credits. We can’t check the number of sittings — most institutions accept at most two.</p>
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-[13px] font-semibold">3. {institutionId && !course ? 'Institution' : 'Course'}</p>
            {institutionId && !course ? (
              <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[13.5px]">
                <span className="min-w-0 flex-1 truncate">{inst.data?.name ?? 'Loading…'} — all its programmes</span>
                <Button variant="ghost" size="sm" onClick={() => setParams({}, { replace: true })}>
                  Choose a course instead
                </Button>
              </div>
            ) : (
              <JambCoursePicker value={course} fallbackName={!course && courseParam ? (r?.course?.name ?? `Course #${courseParam}`) : null} onChange={(c) => (setCourse(c), setParams({ course: String(c.id) }, { replace: true }))} />
            )}
          </div>

          <Button onClick={() => run()} disabled={!ready || check.isPending} className="w-full sm:w-auto">
            {check.isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Check my subjects
          </Button>
          {!ready && <p className="text-[12px] text-muted-foreground">Choose three different subjects and a course to check.</p>}
        </Card>

        {check.error && !r && <ErrorState error={check.error} onRetry={() => run()} />}
        {r && (
          <Results
            r={r}
            target={target ?? null}
            filters={filters}
            onFilters={(f) => {
              setFilters(f);
              run(f);
            }}
            shown={shown}
            onShown={setShown}
            pending={check.isPending}
          />
        )}
      </div>
    </JambShell>
  );
}

function Results({ r, target, filters, onFilters, shown, onShown, pending }: { r: JambCheckResult; target: string | null; filters: { state?: string; ownership?: string; type?: JambLevel }; onFilters: (f: { state?: string; ownership?: string; type?: JambLevel }) => void; shown: JambStatus | 'ALL'; onShown: (s: JambStatus | 'ALL') => void; pending: boolean }) {
  const [limit, setLimit] = useState(30);
  const rows = r.rows.filter((x) => shown === 'ALL' || x.status === shown);
  const states = useMemo(() => [...new Set(r.rows.map((x) => x.state).filter((s): s is string => !!s))].sort(), [r.rows]);
  return (
    <section className={cn('space-y-3', pending && 'opacity-70')}>
      <SectionTitle icon={ShieldCheck} title={target ? `Results for ${target}` : 'Results'} />
      <p className="text-[13px] text-muted-foreground">
        Your subjects: Use of English, {r.subjects.join(', ')}
        {r.olevelGiven ? ' · with your O’level grades' : ''}.
      </p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show results">
        <FilterChip on={shown === 'ALL'} onClick={() => onShown('ALL')} label={`All ${r.rows.length}`} />
        {JAMB_STATUSES.map((s) => (
          <FilterChip key={s} on={shown === s} onClick={() => onShown(s)} label={`${statusInfo(s).label} · ${r.summary[s]}`} tone={s} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <NativeSelect label="State" value={filters.state ?? ''} onChange={(v) => onFilters({ ...filters, state: v || undefined })}>
          <option value="">All states</option>
          {(filters.state ? [filters.state, ...states.filter((s) => s !== filters.state)] : states).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect label="Ownership" value={filters.ownership ?? ''} onChange={(v) => onFilters({ ...filters, ownership: v || undefined })}>
          <option value="">Any ownership</option>
          {JAMB_OWNERSHIPS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect label="Type" value={filters.type ?? ''} onChange={(v) => onFilters({ ...filters, type: (v || undefined) as JambLevel | undefined })} className="col-span-2 sm:col-span-1">
          <option value="">All types</option>
          {JAMB_LEVELS.map((t) => (
            <option key={t} value={t}>
              {JAMB_LEVEL_LABELS[t]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <p className="flex gap-1.5 rounded-xl bg-muted/60 p-3 text-[12.5px] text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        “Subjects match” means your subjects fit JAMB’s wording as written — it is not an offer of admission. You still need the O’level credits, a good UTME score and each institution’s own cut-off and screening. When we can’t be sure, we say “Check the wording” and show JAMB’s text.
      </p>
      {rows.length ? (
        <Card className="divide-y divide-border">
          {rows.slice(0, limit).map((x) => (
            <ResultRow key={x.programmeId} row={x} r={r} />
          ))}
        </Card>
      ) : (
        <Card className="p-5 text-[13px] text-muted-foreground">Nothing in this group.</Card>
      )}
      {rows.length > limit && (
        <Button variant="outline" onClick={() => setLimit(limit + 50)} className="w-full">
          Show more ({rows.length - limit} left)
        </Button>
      )}
      <SourceNote />
    </section>
  );
}

function FilterChip({ on, onClick, label, tone }: { on: boolean; onClick: () => void; label: string; tone?: JambStatus }) {
  const s = tone ? statusInfo(tone) : null;
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn('flex min-h-8 items-center gap-1 rounded-full border px-3 text-[12.5px] font-medium transition-colors', on ? 'border-brand bg-brand-soft text-brand' : 'border-border hover:bg-muted/60')}>
      {s && <s.icon className={cn('size-3.5', s.tone)} aria-hidden />}
      {label}
    </button>
  );
}

function ResultRow({ row: x, r }: { row: JambCheckRow; r: JambCheckResult }) {
  const [open, setOpen] = useState(false);
  const u = x.utme !== null ? r.verdicts[`u${x.utme}`] : undefined;
  const o = x.olevel !== null ? r.verdicts[`o${x.olevel}`] : undefined;
  const s = statusInfo(x.status);
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left">
        <s.icon className={cn('size-5 shrink-0', s.tone)} aria-label={s.label} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-medium leading-snug">{r.institution ? x.programmeName : x.institutionName}</span>
          <span className="block text-[11.5px] text-muted-foreground">{r.institution ? s.label : [x.abbreviation, x.ownership, x.state].filter(Boolean).join(' · ')}</span>
        </span>
        {x.mentioned && (
          <Badge variant="warning" className="hidden sm:inline-flex">
            Own rules
          </Badge>
        )}
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="space-y-3 px-4 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={x.status} />
            <Link to={`${JAMB_BASE}/institutions/${x.institutionId}`} className="text-[12.5px] font-medium text-brand hover:underline">
              Open institution
            </Link>
            {x.courseId !== null && r.institution && (
              <Link to={`${JAMB_BASE}/courses/${x.courseId}`} className="text-[12.5px] font-medium text-brand hover:underline">
                Open course
              </Link>
            )}
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            {u ? (
              <>
                <RequirementBlock label="UTME subjects — JAMB’s wording" text={r.texts[x.utme!]} have={u.have} missing={u.missing} />
                <Verdict status={u.status} notes={u.notes} reading={u.reading} />
              </>
            ) : (
              <p className="text-[13px] text-muted-foreground">JAMB’s brochure gives no UTME subjects for this programme — ask the institution.</p>
            )}
          </div>
          {o && (
            <div className="rounded-xl bg-muted/40 p-3">
              <RequirementBlock label="O’level — JAMB’s wording" text={r.texts[x.olevel!]} have={o.have} missing={o.missing} />
              <Verdict status={o.status} notes={o.notes} reading={o.reading} />
            </div>
          )}
          {x.mentioned && x.remarks !== null && (
            <div className="rounded-xl border border-warning/30 bg-warning-soft/40 p-3">
              <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-warning">{x.abbreviation} has its own rules — read the remarks</p>
              <RequirementText text={r.texts[x.remarks]} have={x.abbreviation ? [x.abbreviation] : []} className="text-[12.5px]" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Verdict({ status, notes, reading }: { status: JambStatus; notes: string[]; reading: string }) {
  const s = statusInfo(status);
  return (
    <div className="mt-2 space-y-0.5 border-t border-border pt-2 text-[12.5px]">
      {notes.map((n) => (
        <p key={n} className={cn('flex gap-1.5', s.tone)}>
          <s.icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{n}</span>
        </p>
      ))}
      <p className="text-[11.5px] text-muted-foreground">How we read it: {reading}</p>
    </div>
  );
}

/** Searchable JAMB course picker. */
function JambCoursePicker({ value, fallbackName, onChange }: { value: JambCourseRow | null; fallbackName: string | null; onChange: (c: JambCourseRow) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim(), 250);
  const q = useJambCourses({ q: debounced || undefined, page: 1 }, open);
  const label = value?.name ?? fallbackName;
  return (
    <Popover open={open} onOpenChange={(o) => (setOpen(o), o || setSearch(''))}>
      <PopoverTrigger asChild>
        <button type="button" aria-haspopup="listbox" aria-expanded={open} className="flex h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-card px-3 text-left text-sm shadow-xs hover:border-border-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15">
          <GraduationCap className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className={cn('min-w-0 flex-1 truncate', !label && 'text-muted-foreground/80')}>{label ?? 'Choose a course…'}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0">
        <Command shouldFilter={false} label="Courses">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Command.Input value={search} onValueChange={setSearch} placeholder="Search JAMB courses…" className="h-10 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground/70" />
            {q.isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
          </div>
          <Command.List className="scrollbar-thin max-h-72 overflow-y-auto p-1.5">
            {!q.isFetching && <Command.Empty className="px-3 py-6 text-center text-[13px] text-muted-foreground">No matching course.</Command.Empty>}
            {(q.data?.rows ?? []).map((c) => (
              <Command.Item key={c.id} value={String(c.id)} onSelect={() => (onChange(c), setOpen(false))} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] outline-none data-[selected=true]:bg-muted">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">{[c.level ? JAMB_LEVEL_LABELS[c.level] : null, c.faculty, `${c.institutionCount} institution${c.institutionCount === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</span>
                </span>
                <Check className={cn('size-4 text-brand', value?.id === c.id ? 'opacity-100' : 'opacity-0')} aria-hidden />
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
