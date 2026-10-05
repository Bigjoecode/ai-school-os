import { CAREER_FIELDS, INTEREST_TYPES, RIASEC, TRACK_LABELS, TRACKS } from '@aischool/shared';
import { SearchX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounced, useDocumentTitle } from '@/lib/hooks';
import { FilterSelect } from '../platform/ui';
import { useCareerHome, useCareerLibrary } from './api';
import { CareerCard, CareersTabs } from './ui';

const SUBJECTS = ['Mathematics', 'English Language', 'Biology', 'Chemistry', 'Physics', 'Further Mathematics', 'Agricultural Science', 'Economics', 'Financial Accounting', 'Commerce', 'Government', 'Literature in English', 'Christian Religious Studies', 'Islamic Studies', 'History', 'Geography', 'Visual Arts', 'Music', 'Computer Studies', 'Technical Drawing'];

export default function CareerLibraryPage() {
  useDocumentTitle('Career library');
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? undefined;
  const set = (k: string, v: string | undefined) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set(k, v);
        else n.delete(k);
        return n;
      },
      { replace: true },
    );
  const [search, setSearch] = useState(get('q') ?? '');
  const debounced = useDebounced(search.trim(), 300);
  useEffect(() => set('q', debounced || undefined), [debounced]); // eslint-disable-line react-hooks/exhaustive-deps
  const filters = { field: get('field'), track: get('track'), interest: get('interest'), subject: get('subject'), search: get('q') };
  const q = useCareerLibrary(filters);
  const home = useCareerHome();
  const saved = new Set(home.data?.plan.savedCareers ?? []);
  const fields = home.data?.fields.map((f) => f.field) ?? [...CAREER_FIELDS];
  const any = Object.values(filters).some(Boolean);

  return (
    <Page className="max-w-6xl">
      <PageHeader eyebrow="Careers" title="Career library" description="What people really do at work, the subjects that help and the routes in — from medicine to music, coding to cocoa farming." />
      <CareersTabs />
      <Card className="mb-4 p-3 sm:p-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <SearchInput value={search} onChange={setSearch} placeholder="Search careers…" label="Search careers" className="sm:col-span-2 lg:col-span-1" />
          <FilterSelect value={filters.field} onChange={(v) => set('field', v)} options={fields.map((f) => ({ value: f, label: f }))} label="Field" allLabel="All fields" className="sm:w-full" />
          <FilterSelect value={filters.track} onChange={(v) => set('track', v)} options={TRACKS.map((t) => ({ value: t, label: TRACK_LABELS[t] }))} label="Track" allLabel="Any track" className="sm:w-full" />
          <FilterSelect value={filters.interest} onChange={(v) => set('interest', v)} options={RIASEC.map((t) => ({ value: t, label: `${INTEREST_TYPES[t].name}s` }))} label="Interest type" allLabel="Any interest" className="sm:w-full" />
          <FilterSelect value={filters.subject} onChange={(v) => set('subject', v)} options={SUBJECTS.map((s) => ({ value: s, label: s }))} label="Subject" allLabel="Any subject" className="sm:w-full" />
        </div>
      </Card>
      {q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : q.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={SearchX}
            title={any ? 'No careers match' : 'The career library is being prepared'}
            description={any ? 'Try fewer filters or different words.' : 'Careers will appear here soon.'}
            action={
              any ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch('');
                    setParams(new URLSearchParams(), { replace: true });
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <p className="mb-2 text-[12.5px] text-muted-foreground" aria-live="polite">
            {q.data.length} career{q.data.length === 1 ? '' : 's'}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {q.data.map((c) => (
              <CareerCard key={c.id} career={c} saved={saved.has(c.slug)} />
            ))}
          </div>
        </>
      )}
    </Page>
  );
}
