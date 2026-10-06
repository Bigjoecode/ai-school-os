import { JAMB_FACULTIES, JAMB_LEVEL_HINTS, JAMB_LEVEL_LABELS, JAMB_LEVELS, JAMB_OWNERSHIPS, type JambLevel, type JambRequirementGroup } from '@aischool/shared';
import {
  Atom,
  BookOpen,
  Briefcase,
  Building2,
  ChevronDown,
  ChevronRight,
  Cog,
  GraduationCap,
  HeartPulse,
  Landmark,
  Layers,
  type LucideIcon,
  MapPin,
  Palette,
  Scale,
  School,
  ShieldCheck,
  Sprout,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { SectionTitle } from '../learning/components';
import { useJambCourse, useJambCourses, useJambFaculties, useJambInstitution, useJambInstitutions, useJambOverview } from './jamb-api';
import { JAMB_BASE, JambShell, LevelBadge, NativeSelect, Pager, RequirementBlock, RequirementText, SourceNote } from './jamb-ui';

const nf = new Intl.NumberFormat('en-GB');
const isLevel = (v: string | null): v is JambLevel => !!v && (JAMB_LEVELS as readonly string[]).includes(v);

/** Filters kept in the URL, so Back and shared links work. */
function useParamState() {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? '';
  const set = (patch: Record<string, string | number | undefined>) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined || v === '' || (k === 'page' && v === 1)) n.delete(k);
          else n.set(k, String(v));
        }
        if (!('page' in patch)) n.delete('page');
        return n;
      },
      { replace: true },
    );
  return { get, set };
}

/** A search box that writes to the URL after a pause. */
function useSearchParam(get: (k: string) => string, set: (p: Record<string, string | undefined>) => void) {
  const [value, setValue] = useState(get('q'));
  const debounced = useDebounced(value.trim(), 300);
  useEffect(() => {
    if (debounced !== get('q')) set({ q: debounced || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  return [value, setValue] as const;
}

// ------------------------------------------------------------------ by institution

export function JambInstitutionsPage() {
  const { get, set } = useParamState();
  const [search, setSearch] = useSearchParam(get, set);
  const type = isLevel(get('type')) ? (get('type') as JambLevel) : undefined;
  const page = Number(get('page')) || 1;
  const filters = { type, ownership: get('ownership') || undefined, state: get('state') || undefined, q: get('q') || undefined, page };
  const q = useJambInstitutions(filters);
  const overview = useJambOverview();
  return (
    <JambShell title="Brochure by institution" description="Choose an institution to see every course it offers and JAMB’s requirements for each.">
      <div className="mb-3 flex gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1 no-scrollbar" role="tablist" aria-label="Type of institution">
        {[undefined, ...JAMB_LEVELS].map((t) => (
          <button
            key={t ?? 'all'}
            type="button"
            role="tab"
            aria-selected={type === t}
            onClick={() => set({ type: t })}
            className={cn('min-h-9 flex-1 shrink-0 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors', type === t ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground')}
          >
            {t ? JAMB_LEVEL_LABELS[t] : 'All'}
            {t && overview.data && <span className="ml-1 text-[11.5px] tabular text-muted-foreground">{nf.format(overview.data.byType[t])}</span>}
          </button>
        ))}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto]">
        <SearchInput value={search} onChange={setSearch} placeholder="Name or abbreviation (e.g. UNILAG, YABATECH)" className="col-span-2 sm:col-span-1" />
        <NativeSelect label="Ownership" value={get('ownership')} onChange={(v) => set({ ownership: v || undefined })}>
          <option value="">Federal, State & Private</option>
          {JAMB_OWNERSHIPS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect label="State" value={get('state')} onChange={(v) => set({ state: v || undefined })}>
          <option value="">All states</option>
          {(overview.data?.states ?? []).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </NativeSelect>
      </div>
      {q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <p className="mb-2 text-[12.5px] text-muted-foreground">
            {nf.format(q.data.total)} institution{q.data.total === 1 ? '' : 's'}
          </p>
          {q.data.rows.length ? (
            <Card className={cn('divide-y divide-border', q.isFetching && 'opacity-70')}>
              {q.data.rows.map((i) => (
                <Link key={i.id} to={`${JAMB_BASE}/institutions/${i.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                    {i.type === 'DEGREE' ? <Landmark className="size-4" aria-hidden /> : i.type === 'ND' ? <Cog className="size-4" aria-hidden /> : <School className="size-4" aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium leading-snug">{i.name}</span>
                    <span className="block text-[12px] text-muted-foreground">
                      {[i.abbreviation, i.ownership, i.state].filter(Boolean).join(' · ')} · {i.programmeCount} programme{i.programmeCount === 1 ? '' : 's'}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              ))}
            </Card>
          ) : (
            <Card>
              <EmptyState icon={Building2} title="No institutions match" description="Try another name, or clear a filter." compact />
            </Card>
          )}
          <Pager page={q.data.page} total={q.data.total} pageSize={q.data.pageSize} onPage={(p) => set({ page: p })} />
        </>
      )}
    </JambShell>
  );
}

export function JambInstitutionPage() {
  const id = Number(useParams().id);
  const q = useJambInstitution(id);
  const d = q.data;
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const programmes = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (d?.programmes ?? []).filter((p) => !f || p.name.toLowerCase().includes(f) || (p.department ?? '').toLowerCase().includes(f));
  }, [d, filter]);
  return (
    <JambShell title={d?.name ?? 'Institution'} description={d ? [d.abbreviation, d.category, d.state ? `${d.state} State` : null].filter(Boolean).join(' · ') : undefined} back={{ to: `${JAMB_BASE}/institutions`, label: 'Brochure by institution' }}>
      {q.error && !d ? (
        q.error instanceof ApiError && q.error.status === 404 ? (
          <Card>
            <EmptyState icon={Building2} title="Institution not found" description="It may not be in JAMB’s current brochure." />
          </Card>
        ) : (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        )
      ) : !d ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <LevelBadge type={d.type} />
            {d.ownership && <Badge variant="outline">{d.ownership}</Badge>}
            {d.specialization && <Badge variant="outline">{d.specialization}</Badge>}
            {d.modeOfStudy && <Badge variant="outline">{d.modeOfStudy}</Badge>}
            {d.accreditation && <Badge variant="outline">Accreditation: {d.accreditation}</Badge>}
          </div>
          {d.address && (
            <p className="flex gap-1.5 text-[13px] text-muted-foreground">
              <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {d.address}
            </p>
          )}
          <Card className="p-4 sm:p-5">
            <SectionTitle icon={GraduationCap} title={`Programmes (${d.programmes.length})`} action={<Link to={`${JAMB_BASE}/check?institution=${d.id}`} className="text-[12.5px] font-medium text-brand hover:underline">Check my subjects</Link>} />
            {d.programmes.length > 8 && <SearchInput value={filter} onChange={setFilter} placeholder="Find a programme" className="mb-3" />}
            {!d.programmes.length && <p className="text-[13px] text-muted-foreground">JAMB’s brochure lists no programmes for this institution yet.</p>}
            <ul className="divide-y divide-border">
              {programmes.map((p) => {
                const isOpen = open === p.id;
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => setOpen(isOpen ? null : p.id)} aria-expanded={isOpen} className="flex min-h-12 w-full items-center gap-3 py-2.5 text-left">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-medium leading-snug">{p.name}</span>
                        <span className="block text-[12px] text-muted-foreground">{[p.department, p.duration, p.status && p.status !== 'Approved' ? p.status : null].filter(Boolean).join(' · ') || ' '}</span>
                      </span>
                      {p.mentioned && (
                        <Badge variant="warning" className="hidden sm:inline-flex">
                          Own rules
                        </Badge>
                      )}
                      <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} aria-hidden />
                    </button>
                    {isOpen && (
                      <div className="mb-3 space-y-3 rounded-xl bg-muted/40 p-3">
                        <RequirementBlock label="UTME subjects (with Use of English)" text={p.utme !== null ? d.texts[p.utme] : null} />
                        <RequirementBlock label="O’level (SSCE) requirements" text={p.olevel !== null ? d.texts[p.olevel] : null} />
                        {p.directEntry !== null && <RequirementBlock label="Direct Entry" text={d.texts[p.directEntry]} />}
                        {p.remarks !== null && (
                          <details className="group" open={p.mentioned}>
                            <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-medium text-brand">
                              <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden /> Remarks and exceptions{p.mentioned && d.abbreviation ? ` (mentions ${d.abbreviation})` : ''}
                            </summary>
                            <RequirementText text={d.texts[p.remarks]} have={p.mentioned && d.abbreviation ? [d.abbreviation] : []} className="mt-1 text-[12.5px] text-muted-foreground" />
                          </details>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {p.courseId !== null && (
                            <Button asChild variant="outline" size="sm">
                              <Link to={`${JAMB_BASE}/courses/${p.courseId}`}>Where else is it offered?</Link>
                            </Button>
                          )}
                          {p.courseId !== null && (
                            <Button asChild variant="ghost" size="sm">
                              <Link to={`${JAMB_BASE}/check?course=${p.courseId}`}>
                                <ShieldCheck /> Check my subjects
                              </Link>
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
          <SourceNote />
        </div>
      )}
    </JambShell>
  );
}

// ------------------------------------------------------------------ by programme

const FACULTY_ICON: Record<string, LucideIcon> = {
  Sciences: Atom,
  Arts: Palette,
  'Social Sciences': Users,
  'Engineering & Technology': Cog,
  'Medicine & Health Sciences': HeartPulse,
  Law: Scale,
  Agriculture: Sprout,
  Education: BookOpen,
  'Administration & Management': Briefcase,
};

export function JambProgrammesPage() {
  const { get, set } = useParamState();
  const [search, setSearch] = useSearchParam(get, set);
  const level = isLevel(get('level')) ? (get('level') as JambLevel) : undefined;
  const faculty = get('faculty') || undefined;
  const qText = get('q') || undefined;
  const page = Number(get('page')) || 1;
  const listing = !!(level || faculty || qText);
  const faculties = useJambFaculties();
  const courses = useJambCourses({ level, faculty, q: qText, page }, listing);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of faculties.data ?? []) m.set(`${r.level}|${r.faculty ?? 'none'}`, r.courses);
    return m;
  }, [faculties.data]);
  const levelTotal = (l: JambLevel) => (faculties.data ?? []).filter((r) => r.level === l).reduce((n, r) => n + r.courses, 0);
  const title = qText ? `Courses matching “${qText}”` : faculty ? `${faculty === 'none' ? 'Other courses' : faculty}${level ? ` · ${JAMB_LEVEL_LABELS[level]}` : ''}` : level ? JAMB_LEVEL_HINTS[level] : 'Brochure by programme';

  return (
    <JambShell title="Brochure by programme" description="Browse courses the way JAMB’s brochure groups them, then open a course to see its requirements and every institution that offers it.">
      <SearchInput value={search} onChange={setSearch} placeholder="Search all courses (e.g. Nursing, Accountancy)" className="mb-4" />
      {!listing ? (
        faculties.error && !faculties.data ? (
          <ErrorState error={faculties.error} onRetry={() => void faculties.refetch()} />
        ) : !faculties.data ? (
          <div className="grid gap-2 sm:grid-cols-3">
            {Array.from({ length: 9 }, (_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            <section>
              <SectionTitle icon={Landmark} title="Degree courses by faculty" />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {JAMB_FACULTIES.map((f) => {
                  const Icon = FACULTY_ICON[f] ?? Layers;
                  return (
                    <Link key={f} to={`${JAMB_BASE}/programmes?level=DEGREE&faculty=${encodeURIComponent(f)}`} className="flex min-h-16 min-w-0 items-center gap-2.5 rounded-xl border border-border bg-card p-3 shadow-soft transition-colors hover:border-border-strong">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-medium leading-snug">{f}</span>
                        <span className="block text-[11.5px] text-muted-foreground">{counts.get(`DEGREE|${f}`) ?? 0} courses</span>
                      </span>
                    </Link>
                  );
                })}
                {(counts.get('DEGREE|none') ?? 0) > 0 && (
                  <Link to={`${JAMB_BASE}/programmes?level=DEGREE&faculty=none`} className="flex min-h-16 min-w-0 items-center gap-2.5 rounded-xl border border-dashed border-border p-3 transition-colors hover:border-border-strong">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <Layers className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium">Other degree courses</span>
                      <span className="block text-[11.5px] text-muted-foreground">{counts.get('DEGREE|none')} courses</span>
                    </span>
                  </Link>
                )}
              </div>
            </section>
            <section>
              <SectionTitle icon={Cog} title="Polytechnics and colleges of education" />
              <div className="grid gap-2 sm:grid-cols-2">
                {(['ND', 'NCE'] as const).map((l) => (
                  <Link key={l} to={`${JAMB_BASE}/programmes?level=${l}`} className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-soft transition-colors hover:border-border-strong">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-info-soft text-info">{l === 'ND' ? <Cog className="size-4" aria-hidden /> : <School className="size-4" aria-hidden />}</span>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium">{JAMB_LEVEL_HINTS[l]}</span>
                      <span className="block text-[11.5px] text-muted-foreground">{levelTotal(l)} courses</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        )
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Link to={`${JAMB_BASE}/programmes`} className="text-[12.5px] font-medium text-brand hover:underline">
              All faculties
            </Link>
            <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
            <h2 className="min-w-0 font-display text-[16px] font-semibold tracking-tight">{title}</h2>
          </div>
          {level && level !== 'DEGREE' && !qText && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              <FacultyChip label="All" on={!faculty} onClick={() => set({ faculty: undefined })} />
              {(faculties.data ?? [])
                .filter((r) => r.level === level)
                .map((r) => (
                  <FacultyChip key={r.faculty ?? 'none'} label={`${r.faculty ?? 'Other'} · ${r.courses}`} on={faculty === (r.faculty ?? 'none')} onClick={() => set({ faculty: r.faculty ?? 'none' })} />
                ))}
            </div>
          )}
          {courses.error && !courses.data ? (
            <ErrorState error={courses.error} onRetry={() => void courses.refetch()} />
          ) : !courses.data ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          ) : courses.data.rows.length ? (
            <>
              <Card className={cn('divide-y divide-border', courses.isFetching && 'opacity-70')}>
                {courses.data.rows.map((c) => (
                  <Link key={c.id} to={`${JAMB_BASE}/courses/${c.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium leading-snug">{c.name}</span>
                      <span className="block text-[12px] text-muted-foreground">{[c.faculty, c.level ? JAMB_LEVEL_LABELS[c.level] : null].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="shrink-0 text-right text-[12px] tabular text-muted-foreground">
                      {c.institutionCount}
                      <span className="block text-[10.5px]">institution{c.institutionCount === 1 ? '' : 's'}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                ))}
              </Card>
              <Pager page={courses.data.page} total={courses.data.total} pageSize={courses.data.pageSize} onPage={(p) => set({ page: p })} />
            </>
          ) : (
            <Card>
              <EmptyState icon={GraduationCap} title="No courses found" description="Try a shorter word, e.g. “Account” for Accountancy and Accounting." compact />
            </Card>
          )}
        </>
      )}
    </JambShell>
  );
}

function FacultyChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={cn('min-h-8 rounded-full border px-3 text-[12.5px] transition-colors', on ? 'border-brand bg-brand-soft text-brand' : 'border-border hover:bg-muted/60')}>
      {label}
    </button>
  );
}

// ------------------------------------------------------------------ a course across institutions

const SHOW = 12;
/** Requirement sets shown open; the rest (usually one or two institutions each) fold away. */
const OPEN_GROUPS = 3;

export function JambCoursePage() {
  const id = Number(useParams().id);
  const { get, set } = useParamState();
  const type = isLevel(get('type')) ? (get('type') as JambLevel) : undefined;
  const q = useJambCourse(id, { state: get('state') || undefined, ownership: get('ownership') || undefined, type });
  const d = q.data;
  const types = d ? [...new Set(d.groups.flatMap((g) => g.institutions.map((i) => i.type)))] : [];
  return (
    <JambShell title={d?.course.name ?? 'Course'} description={d ? [d.course.faculty, d.course.level ? JAMB_LEVEL_HINTS[d.course.level] : null].filter(Boolean).join(' · ') : undefined} back={{ to: `${JAMB_BASE}/programmes`, label: 'Brochure by programme' }}>
      {q.error && !d ? (
        q.error instanceof ApiError && q.error.status === 404 ? (
          <Card>
            <EmptyState icon={GraduationCap} title="Course not found" description="It may not be in JAMB’s current brochure." />
          </Card>
        ) : (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        )
      ) : !d ? (
        <div className="space-y-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-[13.5px]">
              Offered at <strong>{nf.format(d.total)}</strong> institution{d.total === 1 ? '' : 's'} in JAMB’s brochure{d.shown !== d.total ? ` (${nf.format(d.shown)} shown)` : ''}.
            </p>
            <Button asChild size="sm">
              <Link to={`${JAMB_BASE}/check?course=${d.course.id}`}>
                <ShieldCheck /> Check my subjects
              </Link>
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <NativeSelect label="State" value={get('state')} onChange={(v) => set({ state: v || undefined })}>
              <option value="">All states</option>
              {d.states.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect label="Ownership" value={get('ownership')} onChange={(v) => set({ ownership: v || undefined })}>
              <option value="">Any ownership</option>
              {JAMB_OWNERSHIPS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </NativeSelect>
            {(types.length > 1 || type) && (
              <NativeSelect label="Type" value={type ?? ''} onChange={(v) => set({ type: v || undefined })} className="col-span-2 sm:col-span-1">
                <option value="">All types</option>
                {JAMB_LEVELS.map((t) => (
                  <option key={t} value={t}>
                    {JAMB_LEVEL_LABELS[t]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </div>
          {d.groups.length === 0 && (
            <Card>
              <EmptyState icon={Building2} title="No institutions match these filters" compact />
            </Card>
          )}
          {d.groups.slice(0, OPEN_GROUPS).map((g, i) => (
            <RequirementGroupCard key={`${g.utme}-${g.olevel}-${g.directEntry}`} group={g} texts={d.texts} index={i} many={d.groups.length > 1} />
          ))}
          {d.groups.length > OPEN_GROUPS && (
            <Card className="p-4 sm:p-5">
              <SectionTitle icon={Layers} title={`Other requirement sets (${d.groups.length - OPEN_GROUPS})`} />
              <p className="mb-2 text-[12.5px] text-muted-foreground">These institutions word the requirements a little differently. Open one to read it.</p>
              <ul className="divide-y divide-border">
                {d.groups.slice(OPEN_GROUPS).map((g, i) => (
                  <li key={`${g.utme}-${g.olevel}-${g.directEntry}`}>
                    <details className="group">
                      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 py-2">
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
                        <span className="min-w-0 flex-1 text-[13px]">
                          <span className="block font-medium leading-snug">{g.institutions.slice(0, 3).map((x) => x.abbreviation ?? x.name).join(', ')}{g.institutions.length > 3 ? ` +${g.institutions.length - 3}` : ''}</span>
                          <span className="block text-[11.5px] text-muted-foreground">Set {i + OPEN_GROUPS + 1} · {g.institutions.length} institution{g.institutions.length === 1 ? '' : 's'}</span>
                        </span>
                      </summary>
                      <div className="pb-3">
                        <RequirementGroupCard group={g} texts={d.texts} index={i + OPEN_GROUPS} many flat />
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {d.remarks.length > 0 && (
            <Card className="p-4 sm:p-5">
              <SectionTitle icon={TriangleAlert} title="Exceptions and remarks" />
              <p className="mb-2 text-[12.5px] text-muted-foreground">Some institutions add their own conditions, named by their JAMB abbreviation. Institutions marked “Own rules” above are named here.</p>
              {d.remarks.map((r) => (
                <details key={r.text} className="group border-t border-border py-2 first-of-type:border-t-0">
                  <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-[13px] font-medium">
                    <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
                    Remarks for {r.institutions} institution{r.institutions === 1 ? '' : 's'}
                  </summary>
                  <RequirementText text={d.texts[r.text]} className="mt-1 text-[12.5px] text-muted-foreground" />
                </details>
              ))}
            </Card>
          )}
          {d.careers.length > 0 && (
            <Card className="p-4 sm:p-5">
              <SectionTitle icon={Briefcase} title="Careers it leads to" />
              <div className="flex flex-wrap gap-1.5">
                {d.careers.map((c) => (
                  <Link key={c.slug} to={`/careers/library/${c.slug}`} className="rounded-full border border-border px-2.5 py-1 text-[12.5px] hover:bg-muted/60">
                    {c.name}
                  </Link>
                ))}
              </div>
            </Card>
          )}
          <SourceNote />
        </div>
      )}
    </JambShell>
  );
}

function RequirementGroupCard({ group: g, texts, index, many, flat }: { group: JambRequirementGroup; texts: Record<number, string>; index: number; many: boolean; flat?: boolean }) {
  const [all, setAll] = useState(false);
  const list = all ? g.institutions : g.institutions.slice(0, SHOW);
  return (
    <Card className={cn('overflow-hidden', flat && 'border-0 shadow-none')}>
      <div className={cn('space-y-3 border-b border-border bg-muted/30', flat ? 'rounded-xl p-3' : 'p-4 sm:p-5')}>
        <p className="font-display text-[15px] font-semibold tracking-tight">{many ? `Requirements — set ${index + 1}` : 'Requirements'}</p>
        <RequirementBlock label="UTME subjects (with Use of English)" text={g.utme !== null ? texts[g.utme] : null} />
        <RequirementBlock label="O’level (SSCE) requirements" text={g.olevel !== null ? texts[g.olevel] : null} />
        {g.directEntry !== null && (
          <details className="group">
            <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-medium text-brand">
              <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden /> Direct Entry requirements
            </summary>
            <RequirementText text={texts[g.directEntry]} className="mt-1 text-[12.5px]" />
          </details>
        )}
      </div>
      <div className={flat ? 'pt-3' : 'p-4 sm:p-5'}>
        <p className="mb-2 text-[12.5px] font-semibold">Institutions offering it ({g.institutions.length})</p>
        <ul className="divide-y divide-border">
          {list.map((i) => (
            <li key={i.programmeId}>
              <Link to={`${JAMB_BASE}/institutions/${i.id}`} className="flex min-h-12 items-center gap-2 py-2 hover:underline-offset-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium leading-snug">{i.name}</span>
                  <span className="block text-[11.5px] text-muted-foreground">{[i.abbreviation, i.ownership, i.state, i.duration].filter(Boolean).join(' · ')}</span>
                </span>
                {i.mentioned && <Badge variant="warning">Own rules</Badge>}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        {g.institutions.length > SHOW && (
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAll(!all)}>
            {all ? 'Show fewer' : `Show all ${g.institutions.length}`}
          </Button>
        )}
      </div>
    </Card>
  );
}
