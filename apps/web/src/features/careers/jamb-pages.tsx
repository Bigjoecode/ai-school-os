import { JAMB_LEVEL_HINTS, JAMB_LEVEL_LABELS, JAMB_LEVELS, JAMB_LINKS, type JambLevel } from '@aischool/shared';
import { BookMarked, BookOpenText, Building2, ChevronDown, ExternalLink, Info, Layers, ListChecks, MessageCircleQuestion, Search, ShieldCheck, Target } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { SectionTitle } from '../learning/components';
import { useJambFaq, useJambOverview, useJambSubject, useJambSyllabus } from './jamb-api';
import { JAMB_BASE, JambShell, SourceNote } from './jamb-ui';

const nf = new Intl.NumberFormat('en-GB');

// ------------------------------------------------------------------ overview

export default function JambOverviewPage() {
  const q = useJambOverview();
  const d = q.data;
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  return (
    <JambShell title="JAMB & universities" description="JAMB’s official brochure in your pocket: every university, polytechnic and college of education, the courses they offer and what you need to get in.">
      {q.error && !d ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      ) : !d.installed ? (
        <Card className="p-5 text-[13.5px] text-muted-foreground">JAMB’s brochure is still being loaded. Please check back in a few minutes.</Card>
      ) : (
        <div className="space-y-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (search.trim()) navigate(`${JAMB_BASE}/programmes?q=${encodeURIComponent(search.trim())}`);
            }}
            className="flex gap-2"
          >
            <SearchInput value={search} onChange={setSearch} placeholder="Search a course, e.g. Nursing, Law, Computer Science" className="flex-1" />
            <Button type="submit" disabled={!search.trim()}>
              <Search /> <span className="hidden sm:inline">Search</span>
            </Button>
          </form>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {JAMB_LEVELS.map((t) => (
              <Link key={t} to={`${JAMB_BASE}/institutions?type=${t}`} className="min-w-0 rounded-2xl border border-border bg-card p-3 shadow-soft transition-colors hover:border-border-strong sm:p-4">
                <span className="block font-display text-2xl font-semibold tabular tracking-tight sm:text-3xl">{nf.format(d.byType[t])}</span>
                <span className="block truncate text-[12.5px] font-medium">{JAMB_LEVEL_LABELS[t]}</span>
                <span className="hidden text-[11.5px] text-muted-foreground sm:block">{JAMB_LEVEL_HINTS[t]}</span>
              </Link>
            ))}
          </div>
          <p className="text-[12.5px] text-muted-foreground">
            {nf.format(d.institutions)} institutions ({['Federal', 'State', 'Private'].map((o) => `${nf.format(d.byOwnership[o] ?? 0)} ${o.toLowerCase()}`).join(', ')}) · {nf.format(d.programmes)} programmes · {nf.format(d.courses)} courses
          </p>

          <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
            {[
              { to: `${JAMB_BASE}/institutions`, icon: Building2, title: 'Brochure by institution', hint: 'Pick a university, polytechnic or college and see every course it offers, with JAMB’s requirements.', tone: 'bg-brand-soft text-brand' },
              { to: `${JAMB_BASE}/programmes`, icon: Layers, title: 'Brochure by programme', hint: 'Browse by faculty — Sciences, Arts, Medicine, Law… — and see where each course is offered.', tone: 'bg-info-soft text-info' },
              { to: `${JAMB_BASE}/check`, icon: ShieldCheck, title: 'Eligibility checker', hint: 'Choose your four UTME subjects and see which institutions accept them for your course.', tone: 'bg-success-soft text-success' },
              { to: `${JAMB_BASE}/syllabus`, icon: BookOpenText, title: 'E-syllabus', hint: 'JAMB’s topics and objectives for every UTME subject, with the recommended textbooks.', tone: 'bg-warning-soft text-warning' },
            ].map((a) => (
              <Link key={a.to} to={a.to} className="flex gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:border-border-strong">
                <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5', a.tone)}>
                  <a.icon aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-[15px] font-semibold tracking-tight">{a.title}</span>
                  <span className="block text-[12.5px] text-muted-foreground">{a.hint}</span>
                </span>
              </Link>
            ))}
          </div>

          <Card className="p-4 sm:p-5">
            <SectionTitle icon={ListChecks} title="How to use the brochure" />
            <ol className="space-y-2 text-[13.5px]">
              {[
                'Find your course (by programme) or your dream school (by institution).',
                'Read the UTME subjects: you always write Use of English plus the three subjects the course asks for.',
                'Read the O’level requirements: usually five credits (A1–C6), including English Language and often Mathematics, at no more than two sittings.',
                'Read the remarks: some institutions add their own exceptions, named by their JAMB abbreviation.',
                'Use the eligibility checker to test your subjects — then confirm with your school counsellor before you register.',
              ].map((s, i) => (
                <li key={s} className="flex gap-2">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 flex gap-1.5 rounded-xl bg-muted/60 p-3 text-[12.5px] text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              JAMB does not publish cut-off marks in the brochure. Each institution sets its own every year (and many hold a post-UTME screening), so we never show a cut-off here.
            </p>
          </Card>

          <Card className="p-4 sm:p-5">
            <SectionTitle icon={ExternalLink} title="Official JAMB portals" />
            <ul className="grid gap-2 sm:grid-cols-3">
              {JAMB_LINKS.map((l) => (
                <li key={l.url}>
                  <a href={l.url} target="_blank" rel="noreferrer" className="flex min-h-11 flex-col rounded-xl border border-border p-3 transition-colors hover:bg-muted/60">
                    <span className="flex items-center gap-1 text-[13.5px] font-medium text-brand">
                      {l.label} <ExternalLink className="size-3" aria-hidden />
                    </span>
                    <span className="text-[12px] text-muted-foreground">{l.hint}</span>
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] text-muted-foreground">
              Questions about the CBT exam? Read <Link to={`${JAMB_BASE}/faq`} className="font-medium text-brand hover:underline">JAMB’s FAQ</Link>.
            </p>
          </Card>
          <SourceNote fetchedAt={d.fetchedAt} />
        </div>
      )}
    </JambShell>
  );
}

// ------------------------------------------------------------------ e-syllabus

export function JambSyllabusPage() {
  const q = useJambSyllabus();
  return (
    <JambShell title="JAMB e-syllabus" description="What JAMB expects you to know in each UTME subject: the topics, the objectives and the books JAMB recommends.">
      {q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {q.data.map((s) => (
              <Link key={s.key} to={`${JAMB_BASE}/syllabus/${encodeURIComponent(s.key)}`} className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-soft transition-colors hover:border-border-strong">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                  <BookOpenText className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium">{s.subject}</span>
                  <span className="block text-[12px] text-muted-foreground">
                    {s.topics} topic{s.topics === 1 ? '' : 's'}
                    {s.recommendedTexts ? ` · ${s.recommendedTexts} recommended book${s.recommendedTexts === 1 ? '' : 's'}` : ''}
                  </span>
                </span>
              </Link>
            ))}
          </div>
          <p className="mt-4 text-[11.5px] text-muted-foreground">From JAMB’s official UTME syllabus. The full syllabus is also on ibass.jamb.gov.ng.</p>
        </>
      )}
    </JambShell>
  );
}

export function JambSubjectPage() {
  const { subject = '' } = useParams();
  const q = useJambSubject(subject);
  const d = q.data;
  const student = useCan('learning.use');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const topics = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!d || !f) return d?.topics ?? [];
    return d.topics.filter((t) => [t.name, ...t.objectives, ...t.subtopics.map((s) => s.name)].some((x) => x.toLowerCase().includes(f)));
  }, [d, filter]);
  const toggle = (id: string) => setOpen((s) => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s.add(id))));
  return (
    <JambShell title={d?.subject ?? 'Syllabus'} description="JAMB’s UTME syllabus: topics and what you should be able to do." back={{ to: `${JAMB_BASE}/syllabus`, label: 'E-syllabus' }}>
      {q.error && !d ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : (
        <div className="space-y-4">
          {student && (
            <Card className="flex flex-col items-start gap-3 border-brand/20 bg-brand-soft/30 p-4 sm:flex-row sm:items-center">
              <Target className="size-5 shrink-0 text-brand" aria-hidden />
              <p className="min-w-0 flex-1 text-[13.5px]">Ready to test yourself? Practise JAMB-style questions in {d.subject}.</p>
              <Button asChild size="sm">
                <Link to="/learn/exams">Practise in Exam Academy</Link>
              </Button>
            </Card>
          )}
          {d.examFormat && <p className="text-[13px] text-muted-foreground">{d.examFormat}</p>}
          <Card className="p-4 sm:p-5">
            <SectionTitle icon={Layers} title={`Topics (${d.topics.length})`} />
            {d.topics.length > 6 && <SearchInput value={filter} onChange={setFilter} placeholder="Find a topic or objective" className="mb-3" />}
            <ul className="divide-y divide-border">
              {topics.map((t, i) => {
                const isOpen = open.has(t.id) || !!filter.trim();
                const has = t.objectives.length || t.subtopics.length || t.content;
                return (
                  <li key={t.id}>
                    <button type="button" onClick={() => toggle(t.id)} aria-expanded={isOpen} disabled={!has} className="flex min-h-11 w-full items-center gap-3 py-2 text-left">
                      <span className="w-6 shrink-0 text-[12px] tabular text-muted-foreground">{i + 1}.</span>
                      <span className="min-w-0 flex-1 text-[14px] font-medium">{t.name}</span>
                      {has ? <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} aria-hidden /> : null}
                    </button>
                    {isOpen && (
                      <div className="space-y-2 pb-3 pl-9 text-[13px]">
                        {t.content && <p className="whitespace-pre-line text-muted-foreground">{t.content}</p>}
                        {t.subtopics.length > 0 && (
                          <ul className="space-y-1.5">
                            {t.subtopics.map((s) => (
                              <li key={s.id}>
                                <p className="font-medium">{s.name}</p>
                                {s.objectives.length > 0 && (
                                  <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-muted-foreground">
                                    {s.objectives.map((o) => (
                                      <li key={o}>{o}</li>
                                    ))}
                                  </ul>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {t.objectives.length > 0 && (
                          <>
                            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Objectives — you should be able to</p>
                            <ul className="list-disc space-y-0.5 pl-5">
                              {t.objectives.map((o) => (
                                <li key={o}>{o}</li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {!topics.length && <p className="text-[13px] text-muted-foreground">No topics match.</p>}
          </Card>
          {d.recommendedTexts.length > 0 && (
            <Card className="p-4 sm:p-5">
              <SectionTitle icon={BookMarked} title="Recommended textbooks (JAMB)" />
              <ul className="list-disc space-y-1 pl-5 text-[13px]">
                {d.recommendedTexts.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </Card>
          )}
          {d.excluded && <p className="text-[12px] text-muted-foreground">{d.excluded}</p>}
        </div>
      )}
    </JambShell>
  );
}

// ------------------------------------------------------------------ FAQ

export function JambFaqPage() {
  const q = useJambFaq();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <JambShell title="UTME & CBT: your questions" description="JAMB’s own answers about the computer-based test, from the IBASS portal.">
      {q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : (
        <>
          <Card className="divide-y divide-border">
            {q.data.faq.map((f, i) => {
              const isOpen = open === i;
              return (
                <div key={f.q}>
                  <h3>
                    <button type="button" onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen} className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left">
                      <MessageCircleQuestion className="size-4 shrink-0 text-brand" aria-hidden />
                      <span className="min-w-0 flex-1 text-[14px] font-medium">{f.q}</span>
                      <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} aria-hidden />
                    </button>
                  </h3>
                  {isOpen && <p className="whitespace-pre-line px-4 pb-4 pl-11 text-[13.5px] text-muted-foreground">{f.a.replace(/\s*\(([a-z])\)\.?\s*/g, '\n($1) ').trim()}</p>}
                </div>
              );
            })}
          </Card>
          <p className="mt-3 text-[11.5px] text-muted-foreground">{q.data.source}. For anything else, JAMB’s support desk is support.jamb.gov.ng.</p>
        </>
      )}
    </JambShell>
  );
}

export const levelLabel = (t: JambLevel) => JAMB_LEVEL_LABELS[t];
