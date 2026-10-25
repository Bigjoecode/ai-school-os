import { PRACTICAL_KIND_LABELS, type PracticalListItem, type PracticalStatus } from '@aischool/shared';
import { ArrowRight, Atom, CheckCircle2, ChevronRight, Cpu, FlaskConical, Globe2, Microscope, Palette, Search, Sprout, UtensilsCrossed, Wrench, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { scoreTone } from '../learning/components';
import { usePracticalSubject, usePracticalSubjects } from './api';

export const subjectPath = (subject: string) => `/learn/practicals/subjects/${encodeURIComponent(subject)}`;
export const lessonPath = (id: string) => `/learn/practicals/lesson/${encodeURIComponent(id)}`;

/** Practical categories, by subject (a subject not listed falls under Technical and trades). */
interface PracticalCategory {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  subjects: string[];
}
const CATEGORIES: PracticalCategory[] = [
  { id: 'sciences', title: 'Sciences', description: 'Experiments, specimens, readings and calculations in the laboratory.', icon: Atom, subjects: ['Physics', 'Chemistry', 'Biology', 'Health Education'] },
  { id: 'agriculture', title: 'Agriculture', description: 'Crops, soils, livestock, forestry and farm practice.', icon: Sprout, subjects: ['Agricultural Science', 'Animal Husbandry', 'Forestry', 'Fisheries'] },
  { id: 'geography', title: 'Geography and fieldwork', description: 'Map reading, weather, statistics and field surveys.', icon: Globe2, subjects: ['Geography'] },
  { id: 'home-economics', title: 'Home Economics', description: 'Food, catering, clothing, textiles and managing a home.', icon: UtensilsCrossed, subjects: ['Foods and Nutrition', 'Home Management', 'Catering Craft Practice', 'Textiles'] },
  { id: 'arts', title: 'Arts and Music', description: 'Studio work, crafts, performance and aural tests.', icon: Palette, subjects: ['Visual Art', 'Music', 'Ceramics', 'Basketry'] },
  { id: 'ict', title: 'ICT and Computing', description: 'Programs, spreadsheets, databases, networks and computer care.', icon: Cpu, subjects: ['Computer Studies', 'Data Processing', 'Information and Communication Technology'] },
  { id: 'technical', title: 'Technical and trades', description: 'Electrical, electronics, building, woodwork, auto and workshop skills.', icon: Wrench, subjects: [] },
];
const categoryOf = (subject: string) => CATEGORIES.find((c) => c.subjects.some((s) => s.toLowerCase() === subject.toLowerCase())) ?? CATEGORIES[CATEGORIES.length - 1]!;
export const categoryPath = (id: string) => `/learn/practicals/categories/${id}`;

/** Practical Academy: the practical categories (Sciences, Agriculture, Arts…) and the student's progress in each. */
export default function PracticalHubPage() {
  const q = usePracticalSubjects();
  const cats = useMemo(
    () =>
      CATEGORIES.map((c) => {
        const rows = (q.data ?? []).filter((s) => categoryOf(s.subject).id === c.id);
        return { ...c, rows, practicals: rows.reduce((t, s) => t + s.practicals, 0), labs: rows.reduce((t, s) => t + s.labs, 0), learned: rows.reduce((t, s) => t + s.learned, 0) };
      }).filter((c) => c.rows.length),
    [q.data],
  );
  return (
    <Page className="max-w-6xl">
      <PageHeader
        eyebrow="Exam Academy · WAEC"
        title="Practical Academy"
        description="Every WAEC practical, step by step: what to do, what you should see, how to calculate and what examiners look for — with virtual labs you can try again and again. Choose a category to begin."
      />
      {q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : cats.length === 0 ? (
        <EmptyState icon={FlaskConical} title="Practicals are on their way" description="Guided practical lessons appear here as they are added." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cats.map((c) => (
            <Link key={c.id} to={categoryPath(c.id)} className="group">
              <Card className="flex h-full flex-col gap-3 p-5 transition-all group-hover:-translate-y-0.5 group-hover:border-border-strong">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-[17px] font-semibold tracking-tight">{c.title}</p>
                    <p className="mt-0.5 text-[12.5px] text-muted-foreground">{c.description}</p>
                  </div>
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand [&_svg]:size-5">
                    <c.icon aria-hidden />
                  </span>
                </div>
                <p className="line-clamp-2 text-[12px] text-muted-foreground">{c.rows.map((s) => s.subject).join(' · ')}</p>
                <div className="mt-auto space-y-1.5">
                  <div className="flex items-center justify-between text-[12px]">
                    <span>
                      {c.practicals} practical{c.practicals === 1 ? '' : 's'}
                      {c.labs ? ` · ${c.labs} virtual lab${c.labs === 1 ? '' : 's'}` : ''}
                    </span>
                    <span className="tabular text-muted-foreground">{c.learned} learned</span>
                  </div>
                  <Progress value={c.practicals ? (100 * c.learned) / c.practicals : 0} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}

/** One category: every practical in its subjects, grouped by subject, with a subject filter and search. */
export function PracticalCategoryPage() {
  const { category = '' } = useParams();
  const c = CATEGORIES.find((x) => x.id === category);
  const q = usePracticalSubjects();
  const subjects = (q.data ?? []).filter((s) => c && categoryOf(s.subject).id === c.id);
  const [only, setOnly] = useState<string | null>(null);
  const [find, setFind] = useState('');
  const shown = only ? subjects.filter((s) => s.subject === only) : subjects;
  return (
    <Page className="max-w-5xl">
      <PageHeader
        eyebrow={
          <Link to="/learn/practicals" className="hover:underline">
            Practical Academy
          </Link>
        }
        title={c ? `${c.title} practicals` : 'Practicals'}
        description={c?.description}
      />
      {!c ? (
        <EmptyState icon={FlaskConical} title="Category not found" description="Go back to the Practical Academy and choose a category." />
      ) : q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a practical or topic" className="pl-9" aria-label="Find a practical" />
            </div>
            {subjects.length > 1 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by subject">
                {[null, ...subjects.map((s) => s.subject)].map((s) => (
                  <button
                    key={s ?? 'all'}
                    type="button"
                    onClick={() => setOnly(s)}
                    aria-pressed={only === s}
                    className={cn('rounded-full border px-3 py-1 text-[12.5px] transition-colors', only === s ? 'border-brand bg-brand text-white' : 'border-border bg-card hover:bg-muted')}
                  >
                    {s ?? 'All subjects'}
                  </button>
                ))}
              </div>
            )}
          </div>
          {shown.map((s) => (
            <CategorySubject key={s.subject} subject={s.subject} find={find} />
          ))}
        </div>
      )}
    </Page>
  );
}

/** A subject's practicals inside a category page. */
function CategorySubject({ subject, find }: { subject: string; find: string }) {
  const q = usePracticalSubject(subject);
  const f = find.trim().toLowerCase();
  const rows = (q.data?.practicals ?? []).filter((p) => !f || `${p.title} ${p.topic} ${p.parentTopic ?? ''}`.toLowerCase().includes(f));
  if (q.data && f && !rows.length) return null;
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-display text-[15px] font-semibold tracking-tight">{subject}</h2>
        <Link to={subjectPath(subject)} className="inline-flex items-center gap-0.5 text-[12.5px] text-brand hover:underline">
          By topic <ChevronRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      {q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : (
        <Card className="divide-y divide-border">
          {rows.map((p) => (
            <PracticalRow key={p.id} p={p} />
          ))}
        </Card>
      )}
    </section>
  );
}

/** One practical in a list: kind, virtual lab, skills and the student's status. */
function PracticalRow({ p, groupTopic }: { p: PracticalListItem; groupTopic?: string }) {
  return (
    <Link to={lessonPath(p.id)} className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/50">
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl [&_svg]:size-4', p.simulator ? 'bg-ai-2/10 text-ai-2' : 'bg-brand-soft text-brand')}>{p.simulator ? <Microscope aria-hidden /> : <FlaskConical aria-hidden />}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium">{p.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{PRACTICAL_KIND_LABELS[p.kind]}</Badge>
          {p.simulator && <Badge variant="ai">Virtual lab</Badge>}
          {p.skills.slice(0, 4).map((s) => (
            <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
              {s}
            </span>
          ))}
          {p.topic !== groupTopic && <span className="text-[11.5px] text-muted-foreground">{p.topic}</span>}
        </span>
        <span className="mt-1 block">
          <StatusBadges s={p.status} lab={!!p.simulator} />
        </span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

export function StatusBadges({ s, lab }: { s: PracticalStatus; lab: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {s.learned && (
        <Badge variant="success">
          <CheckCircle2 /> Learned
        </Badge>
      )}
      {s.practised > 0 && <Badge variant="info">Practised {s.practised}×</Badge>}
      {lab && s.best !== null && <span className={cn('text-[12px] font-semibold tabular', scoreTone(s.best))}>Best lab {s.best}%</span>}
    </span>
  );
}

/** One subject: its practicals grouped by syllabus topic, with kind and skills, and the student's status. */
export function PracticalSubjectPage() {
  const { subject = '' } = useParams();
  const q = usePracticalSubject(subject);
  const [find, setFind] = useState('');
  const groups = useMemo(() => {
    const rows = (q.data?.practicals ?? []).filter((p) => !find.trim() || `${p.title} ${p.topic} ${p.parentTopic ?? ''}`.toLowerCase().includes(find.trim().toLowerCase()));
    const by = new Map<string, PracticalListItem[]>();
    for (const p of rows) {
      const k = p.parentTopic ?? p.topic;
      by.set(k, [...(by.get(k) ?? []), p]);
    }
    return [...by];
  }, [q.data, find]);
  const d = q.data;
  return (
    <Page className="max-w-5xl">
      <PageHeader
        eyebrow={
          <span>
            <Link to="/learn/practicals" className="hover:underline">
              Practical Academy
            </Link>
            {' · '}
            <Link to={categoryPath(categoryOf(subject).id)} className="hover:underline">
              {categoryOf(subject).title}
            </Link>
          </span>
        }
        title={d ? `${d.subject} practicals` : 'Practicals'}
        description={d?.practicalPaper}
      />
      {q.error && !d ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a practical or topic" className="pl-9" aria-label="Find a practical" />
            </div>
            <p className="text-[12.5px] text-muted-foreground">
              {d.practicals.filter((p) => p.status.learned).length}/{d.practicals.length} learned · {d.practicalQuestions} WAEC practical question{d.practicalQuestions === 1 ? '' : 's'}
            </p>
          </div>
          {groups.map(([topic, rows]) => (
            <section key={topic}>
              <h2 className="mb-2 font-display text-[14px] font-semibold tracking-tight text-muted-foreground">{topic}</h2>
              <Card className="divide-y divide-border">
                {rows.map((p) => (
                  <PracticalRow key={p.id} p={p} groupTopic={topic} />
                ))}
              </Card>
            </section>
          ))}
          {!groups.length && <p className="text-[13px] text-muted-foreground">No practical matches “{find}”.</p>}
        </div>
      )}
    </Page>
  );
}
