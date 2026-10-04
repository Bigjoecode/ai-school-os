import { type MaterialKind, type MaterialRow, type PortalChild } from '@aischool/shared';
import { FolderOpen, SearchX } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth-store';
import { cn, initialsFromName } from '@/lib/utils';
import { Segmented } from '../operations/ui';
import { lastChild, rememberChild, usePortalMe } from '../portal/api';
import { useLibrary } from './api';
import { MaterialTile, MaterialViewer } from './viewer';

type KindFilter = 'ALL' | 'NOTES' | 'DOCS' | 'VIDEO' | 'AUDIO' | 'IMAGE' | 'LINK';
const KIND_GROUPS: Record<Exclude<KindFilter, 'ALL'>, MaterialKind[]> = {
  NOTES: ['NOTE'],
  DOCS: ['DOCUMENT', 'SLIDES'],
  VIDEO: ['VIDEO'],
  AUDIO: ['AUDIO'],
  IMAGE: ['IMAGE'],
  LINK: ['LINK'],
};
const KIND_FILTER_LABELS: Record<KindFilter, string> = { ALL: 'All', NOTES: 'Notes', DOCS: 'Documents', VIDEO: 'Videos', AUDIO: 'Audio', IMAGE: 'Pictures', LINK: 'Links' };

/**
 * The student's (or a parent's child's) library: everything shared with
 * their class, their year group and the whole school, by subject and topic.
 */
export default function MaterialsLibraryPage() {
  const isParent = useCan('family.manage');
  const me = usePortalMe(isParent);
  const [params, setParams] = useSearchParams();
  const kids = me.data?.children ?? [];
  const asked = params.get('child');
  const childId = isParent ? (kids.find((c) => c.id === asked)?.id ?? kids.find((c) => c.id === lastChild())?.id ?? kids[0]?.id) : undefined;
  useEffect(() => {
    if (childId) rememberChild(childId);
  }, [childId]);

  const lib = useLibrary(childId, !isParent || !!childId);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<KindFilter>('ALL');
  const [open, setOpen] = useState<MaterialRow | null>(null);

  const sections = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const allowed = kind === 'ALL' ? null : new Set(KIND_GROUPS[kind]);
    return (lib.data?.sections ?? [])
      .map((s) => ({
        ...s,
        materials: s.materials.filter((m) => {
          if (allowed && !allowed.has(m.kind)) return false;
          if (!words.length) return true;
          const hay = `${m.title} ${m.description ?? ''} ${m.topic ?? ''} ${s.subject?.name ?? ''}`.toLowerCase();
          return words.every((w) => hay.includes(w));
        }),
      }))
      .filter((s) => s.materials.length);
  }, [lib.data, search, kind]);

  // Only offer the kinds there are.
  const kinds = useMemo(() => {
    const have = new Set((lib.data?.sections ?? []).flatMap((s) => s.materials.map((m) => m.kind)));
    return (Object.keys(KIND_FILTER_LABELS) as KindFilter[]).filter((k) => k === 'ALL' || KIND_GROUPS[k].some((x) => have.has(x)));
  }, [lib.data]);

  const child = lib.data?.student;
  const who = isParent && child ? child.firstName : null;

  return (
    <Page className="max-w-4xl">
      <PageHeader
        title="Study materials"
        description={who ? `Notes, documents and videos ${who}’s teachers have shared${child?.className ? ` with ${child.className}` : ''}.` : 'Notes, documents and videos your teachers have shared with your class.'}
      />
      {isParent && kids.length > 1 && childId && (
        <ChildSwitcher
          kids={kids}
          current={childId}
          onPick={(id) => {
            rememberChild(id);
            setParams({ child: id }, { replace: true });
          }}
        />
      )}

      {(me.error && isParent) || (lib.error && !lib.data) ? (
        <Card>
          <ErrorState error={me.error ?? lib.error} onRetry={() => void (me.error ? me.refetch() : lib.refetch())} />
        </Card>
      ) : isParent && me.data && kids.length === 0 ? (
        <Card>
          <EmptyState icon={FolderOpen} title="No children linked yet" description="Ask the school office to link your children to your account." />
        </Card>
      ) : !lib.data ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      ) : lib.data.total === 0 ? (
        <Card>
          <EmptyState icon={FolderOpen} title="Nothing shared yet" description={`When ${who ? `${who}’s` : 'your'} teachers share notes, slides or videos, they’ll appear here.`} />
        </Card>
      ) : (
        <>
          <div className="mb-4 grid gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Search materials…" />
            {kinds.length > 2 && <Segmented label="Type" size="sm" value={kind} onChange={setKind} options={kinds.map((k) => ({ value: k, label: KIND_FILTER_LABELS[k] }))} />}
          </div>
          {sections.length === 0 ? (
            <Card>
              <EmptyState
                icon={SearchX}
                title="Nothing matches"
                description="Try another word or type."
                action={
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch('');
                      setKind('ALL');
                    }}
                  >
                    Show everything
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="space-y-6">
              {sections.map((s) => (
                <section key={s.subject?.id ?? 'general'} aria-label={s.subject?.name ?? 'General'}>
                  <h2 className="mb-2 flex items-baseline gap-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {s.subject?.name ?? 'General'}
                    <span className="font-normal normal-case tracking-normal">· {s.materials.length}</span>
                  </h2>
                  <Card className="divide-y divide-border overflow-hidden">
                    {s.materials.map((m, i) => (
                      <Fragment key={m.id}>
                        {m.topic && m.topic !== s.materials[i - 1]?.topic && <p className="bg-muted/40 px-4 py-1.5 text-[12px] font-medium text-muted-foreground">{m.topic}</p>}
                        <MaterialTile m={m} onOpen={() => setOpen(m)} />
                      </Fragment>
                    ))}
                  </Card>
                </section>
              ))}
            </div>
          )}
        </>
      )}
      <MaterialViewer m={open} onOpenChange={(v) => !v && setOpen(null)} />
    </Page>
  );
}

function ChildSwitcher({ kids, current, onPick }: { kids: PortalChild[]; current: string; onPick: (id: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Choose a child" className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      {kids.map((c) => {
        const on = c.id === current;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(c.id)}
            className={cn(
              'flex min-h-11 shrink-0 items-center gap-2.5 rounded-full border py-1 pl-1 pr-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              on ? 'border-brand bg-brand-soft' : 'border-border bg-card hover:bg-muted/50',
            )}
          >
            <Avatar name={c.name} initials={initialsFromName(c.name)} src={c.photoUrl} size="sm" />
            <span className="min-w-0 leading-tight">
              <span className={cn('block max-w-36 truncate text-[13.5px] font-medium', on && 'text-brand')}>{c.firstName}</span>
              <span className="block max-w-36 truncate text-[11.5px] text-muted-foreground">{c.className ?? 'No class yet'}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
