import { BOOK_CATEGORIES, BOOK_CATEGORY_LABELS, type BookCategory, type BookRow, type LibraryOverview, type LoanRow, type ReadingList } from '@aischool/shared';
import {
  AlertTriangle,
  BookCopy,
  BookOpen,
  BookPlus,
  BookUp,
  Coins,
  LayoutDashboard,
  Library,
  ListChecks,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Settings2,
  Sparkles,
  Trash2,
  Undo2,
  Users,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { type Column, DataTable, Pagination } from '@/components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCan } from '@/lib/auth-store';
import { useDebounced } from '@/lib/hooks';
import { cn, initialsFromName } from '@/lib/utils';
import { StatTile } from '../attendance/ui';
import { EmptyChart, money, monthLabel, schoolDate, useCurrency } from '../finance/ui';
import { useBooks, useDeleteBook, useFinePaid, useLibraryOverview, useLoans, useReadingList, useRenewLoan, type LoanStatusFilter } from './api';
import { BookDetailSheet, BookFormSheet, IssueBookDialog, LoanStatus, ReturnLoanDialog } from './library-dialogs';
import { OperationsSettingsSheet } from './settings-sheet';
import { plural, Segmented } from './ui';

type Tab = 'overview' | 'catalogue' | 'loans';
const TABS: Tab[] = ['overview', 'catalogue', 'loans'];
const PAGE_SIZE = 25;

export default function LibraryPage() {
  const canManage = useCan('library.manage');
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'overview';
  const overview = useLibraryOverview();
  const loanDays = overview.data?.settings.libraryLoanDays ?? 14;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [issue, setIssue] = useState<{ book: BookRow | null } | null>(params.get('issue') === '1' && canManage ? { book: null } : null);
  const [editing, setEditing] = useState<BookRow | 'new' | null>(params.get('new') === '1' && canManage ? 'new' : null);
  const [viewing, setViewing] = useState<BookRow | null>(null);
  // ⌘K deep links (?issue=1, ?new=1) also work when the page is already open.
  const issueFlag = params.get('issue') === '1';
  const newFlag = params.get('new') === '1';
  useEffect(() => {
    if (issueFlag && canManage) setIssue((s) => s ?? { book: null });
  }, [issueFlag, canManage]);
  useEffect(() => {
    if (newFlag && canManage) setEditing((s) => s ?? 'new');
  }, [newFlag, canManage]);

  const patch = (next: Record<string, string | undefined>) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(next)) {
          if (v) p.set(k, v);
          else p.delete(k);
        }
        return p;
      },
      { replace: true },
    );

  return (
    <Page>
      <PageHeader
        title="Library"
        description="The catalogue, who has what, and what’s overdue — with reading lists drawn from your own shelves."
        actions={
          <>
            <Button variant="outline" size="icon" aria-label="Library rules" onClick={() => setSettingsOpen(true)}>
              <Settings2 />
            </Button>
            {canManage && (
              <Button onClick={() => setIssue({ book: null })}>
                <BookUp /> Issue book
              </Button>
            )}
          </>
        }
      />
      <Tabs value={tab} onValueChange={(t) => patch({ tab: t === 'overview' ? undefined : t })}>
        <TabsList aria-label="Library sections">
          <TabsTrigger value="overview">
            <LayoutDashboard /> Overview
          </TabsTrigger>
          <TabsTrigger value="catalogue">
            <BookCopy /> Catalogue
          </TabsTrigger>
          <TabsTrigger value="loans">
            <ListChecks /> Loans
            {!!overview.data?.overdue && <span className="rounded-full bg-danger-soft px-1.5 text-[10.5px] font-semibold text-danger tabular">{overview.data.overdue}</span>}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab q={overview} onBook={setViewing} onFind={(title) => patch({ tab: 'catalogue', q: title })} onLoans={(status) => patch({ tab: 'loans', status })} />
        </TabsContent>
        <TabsContent value="catalogue">
          <CatalogueTab
            initialQ={params.get('q') ?? ''}
            onView={setViewing}
            onAdd={() => setEditing('new')}
            onEdit={setEditing}
            onIssue={(book) => setIssue({ book })}
          />
        </TabsContent>
        <TabsContent value="loans">
          <LoansTab status={LOAN_FILTERS.find((f) => f.value === params.get('status'))?.value ?? 'OUT'} onStatus={(s) => patch({ status: s === 'OUT' ? undefined : s })} />
        </TabsContent>
      </Tabs>

      {canManage && (
        <>
          <IssueBookDialog
            open={!!issue}
            onOpenChange={(o) => {
              if (!o) {
                setIssue(null);
                if (params.get('issue')) patch({ issue: undefined });
              }
            }}
            book={issue?.book ?? null}
            loanDays={loanDays}
          />
          <BookFormSheet
            open={!!editing}
            onOpenChange={(o) => {
              if (!o) {
                setEditing(null);
                if (params.get('new')) patch({ new: undefined });
              }
            }}
            book={editing === 'new' ? null : editing}
          />
        </>
      )}
      <BookDetailSheet
        book={viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        onEdit={(b) => {
          setViewing(null);
          setEditing(b);
        }}
        onIssue={(b) => {
          setViewing(null);
          setIssue({ book: b });
        }}
      />
      <OperationsSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} section="library" fallback={overview.data?.settings} />
    </Page>
  );
}

// ------------------------------------------------------------------ overview

function OverviewTab({
  q,
  onBook,
  onFind,
  onLoans,
}: {
  q: ReturnType<typeof useLibraryOverview>;
  onBook: (b: BookRow) => void;
  onFind: (title: string) => void;
  onLoans: (status: LoanStatusFilter) => void;
}) {
  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const o = q.data;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        <StatTile label="Titles" icon={<BookOpen />} loading={!o} value={o?.titles.toLocaleString() ?? '—'} sub={o ? `${plural(o.copies, 'copy', 'copies')} on the shelves` : undefined} />
        <button type="button" onClick={() => onLoans('OUT')} className="rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <StatTile label="On loan" icon={<BookUp />} loading={!o} value={o?.onLoan.toLocaleString() ?? '—'} sub={o ? `${plural(o.loansThisMonth, 'loan')} this month` : undefined} />
        </button>
        <button type="button" onClick={() => onLoans('OVERDUE')} className="rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <StatTile
            label="Overdue"
            icon={<AlertTriangle />}
            loading={!o}
            value={o?.overdue ?? '—'}
            tone={o && o.overdue > 0 ? 'danger' : undefined}
            sub={o ? (o.overdue ? <span className="font-medium text-danger">Chase these up →</span> : 'Everything’s on time') : undefined}
          />
        </button>
        <StatTile
          label="Fines outstanding"
          icon={<Coins />}
          loading={!o}
          value={o ? money(o.finesOutstandingKobo, o.currency) : '—'}
          tone={o && o.finesOutstandingKobo > 0 ? 'warning' : undefined}
          sub={o ? (o.settings.libraryFinePerDayKobo ? `${money(o.settings.libraryFinePerDayKobo, o.currency)} a day overdue` : 'Fines are switched off') : undefined}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-3 [&>*]:min-w-0">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Loans by month</CardTitle>
              <CardDescription>Books issued over the last six months</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              {!o ? <Skeleton className="h-full w-full rounded-xl" /> : o.loansByMonth.every((m) => m.loans === 0) ? <EmptyChart text="Loans will chart here once books start going out." /> : <LoansChart data={o.loansByMonth} />}
            </div>
          </CardContent>
        </Card>
        <CategoriesCard o={o} />
      </div>

      <ReadingListCard onBook={onBook} />

      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Popular this year</CardTitle>
              <CardDescription>Most borrowed titles</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {!o ? (
              <ListSkeleton />
            ) : o.popular.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-[13px] text-muted-foreground">No loans in the last year yet.</p>
            ) : (
              <ol className="space-y-1">
                {o.popular.map((b, i) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => onFind(b.title)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="w-5 shrink-0 text-center font-display text-[13px] font-semibold text-muted-foreground tabular">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium">{b.title}</span>
                        <span className="block truncate text-[12px] text-muted-foreground">{b.author}</span>
                      </span>
                      <span className="shrink-0 text-[12px] text-muted-foreground tabular">{plural(b.loans, 'loan')}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Top readers</CardTitle>
              <CardDescription>Most loans in the last year</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {!o ? (
              <ListSkeleton />
            ) : o.topReaders.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-[13px] text-muted-foreground">Readers appear here once books are borrowed.</p>
            ) : (
              <ol className="space-y-1">
                {o.topReaders.map((r) => (
                  <li key={`${r.borrower.kind}-${r.borrower.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2">
                    <Avatar name={r.borrower.name} initials={initialsFromName(r.borrower.name)} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{r.borrower.name}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {r.borrower.kind === 'STAFF' ? 'Staff' : 'Student'}
                        {r.borrower.detail && ` · ${r.borrower.detail}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-[12px] text-muted-foreground tabular">{plural(r.loans, 'book')}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2.5" aria-busy>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

function LoansChart({ data }: { data: LibraryOverview['loansByMonth'] }) {
  const rows = data.map((d) => ({ ...d, label: monthLabel(d.month) }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 8, right: 4, left: -12, bottom: 0 }} barCategoryGap="32%">
        <CartesianGrid vertical={false} strokeDasharray="3 4" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} interval={0} fontSize={11} />
        <YAxis tickLine={false} axisLine={false} tickMargin={6} width={40} allowDecimals={false} fontSize={11} />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.6, radius: 8 }}
          content={({ active, payload }) => {
            const row = active ? (payload?.[0]?.payload as { month: string; loans: number } | undefined) : undefined;
            if (!row) return null;
            return (
              <div className="rounded-xl border border-border bg-popover/95 px-3 py-2 text-[12px] shadow-pop backdrop-blur">
                <p className="font-medium">{monthLabel(row.month, true)}</p>
                <p className="text-muted-foreground">{plural(row.loans, 'loan')}</p>
              </div>
            );
          }}
        />
        <Bar dataKey="loans" fill="var(--chart-1)" radius={[6, 6, 2, 2]} maxBarSize={36} animationDuration={800} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function CategoriesCard({ o }: { o: LibraryOverview | undefined }) {
  const max = Math.max(1, ...(o?.byCategory.map((c) => c.copies) ?? [1]));
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>By category</CardTitle>
          <CardDescription>Copies on the shelves</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {!o ? (
          <ListSkeleton />
        ) : o.byCategory.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-[13px] text-muted-foreground">Add books to see the mix.</p>
        ) : (
          <ul className="space-y-3">
            {o.byCategory.map((c) => (
              <li key={c.category}>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="truncate font-medium">{BOOK_CATEGORY_LABELS[c.category]}</span>
                  <span className="shrink-0 text-[12px] text-muted-foreground tabular">
                    {plural(c.titles, 'title')} · {c.copies}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-chart-2" style={{ width: `${(c.copies / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ AI reading list

function ReadingListCard({ onBook }: { onBook: (b: BookRow) => void }) {
  const canAi = useCan('ai.use');
  const run = useReadingList();
  const [audience, setAudience] = useState('');
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState('8');
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<ReadingList | null>(null);
  if (!canAi) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (audience.trim().length < 3) {
      setError('Say who the list is for, e.g. “JSS 2 students who enjoy adventure stories”');
      return;
    }
    setError(undefined);
    run.mutate({ audience: audience.trim(), topic: topic.trim() || undefined, count: Number(count) }, { onSuccess: setResult });
  };

  return (
    <Card className="ai-border relative overflow-hidden border-transparent">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-ai-2/10 blur-3xl" />
      <div className="relative p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-ai-gradient shadow-[0_6px_20px_-6px_var(--ai-2)]">
            <AiSparkle className="size-5 [&_path]:fill-white" animated={run.isPending} />
          </div>
          <div className="min-w-0">
            <p className="font-display text-[15px] font-semibold tracking-tight">
              <span className="text-ai-gradient">Reading list</span>
            </p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">Picks only from books you actually have — never invented titles.</p>
          </div>
        </div>
        <form onSubmit={submit} noValidate className="mt-5 grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_7rem_auto] md:items-end">
          <Field label="Who is it for?" htmlFor="rl-aud" error={error}>
            <Input id="rl-aud" value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={200} placeholder="e.g. JSS 2 readers who love adventure" invalid={!!error} />
          </Field>
          <Field label="Topic or theme" htmlFor="rl-topic" optional>
            <Input id="rl-topic" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} placeholder="e.g. Nigerian history" />
          </Field>
          <Field label="Books" htmlFor="rl-count">
            <Select value={count} onValueChange={setCount}>
              <SelectTrigger id="rl-count">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[3, 5, 8, 10, 12, 15].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Button type="submit" variant={result ? 'outline' : 'ai'} loading={run.isPending}>
            {!run.isPending && (result ? <RefreshCw /> : <Sparkles />)} {result ? 'New list' : 'Suggest books'}
          </Button>
        </form>
        {run.isPending && !result && (
          <div className="mt-5 space-y-2.5" aria-live="polite" aria-busy>
            <p className="text-[12.5px] text-muted-foreground">Looking through the catalogue…</p>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-4/5" />
          </div>
        )}
        {result && (
          <div className={cn('mt-5 border-t border-border pt-5 transition-opacity', run.isPending && 'opacity-50')}>
            <p className="text-[13.5px] leading-relaxed">{result.intro}</p>
            {result.picks.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted-foreground">Nothing in the catalogue fits that well — try a broader audience or topic.</p>
            ) : (
              <ol className="mt-4 grid gap-2 md:grid-cols-2 [&>*]:min-w-0">
                {result.picks.map((p, i) => (
                  <li key={p.book.id}>
                    <button
                      type="button"
                      onClick={() => onBook(p.book)}
                      className="flex h-full w-full items-start gap-3 rounded-xl border border-border bg-card/70 p-3 text-left transition-colors hover:border-border-strong hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-soft font-display text-[12px] font-semibold text-brand tabular">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium">{p.book.title}</span>
                        <span className="block truncate text-[12px] text-muted-foreground">
                          {p.book.author} · {p.book.available > 0 ? `${p.book.available} on the shelf` : 'all copies out'}
                        </span>
                        <span className="mt-1 block text-[12.5px] leading-snug text-foreground/85">{p.why}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-4 text-[11.5px] text-muted-foreground">
              Generated by {result.provider} · {result.model}. Chosen from your catalogue only.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ catalogue

function Availability({ b }: { b: BookRow }) {
  const pct = b.copies ? (b.available / b.copies) * 100 : 0;
  return (
    <div className="min-w-[96px]">
      <p className={cn('text-[13px] tabular', b.available === 0 ? 'font-medium text-danger' : '')}>
        <span className="font-semibold">{b.available}</span>
        <span className="text-muted-foreground">/{b.copies} on shelf</span>
      </p>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full', b.available === 0 ? 'bg-danger' : pct < 34 ? 'bg-warning' : 'bg-success')} style={{ width: `${Math.max(pct, b.available ? 4 : 0)}%` }} />
      </div>
    </div>
  );
}

function CatalogueTab({
  initialQ,
  onView,
  onAdd,
  onEdit,
  onIssue,
}: {
  initialQ: string;
  onView: (b: BookRow) => void;
  onAdd: () => void;
  onEdit: (b: BookRow) => void;
  onIssue: (b: BookRow) => void;
}) {
  const canManage = useCan('library.manage');
  const [search, setSearch] = useState(initialQ);
  const [category, setCategory] = useState<BookCategory | undefined>();
  const [available, setAvailable] = useState<'all' | 'true' | 'false'>('all');
  const [page, setPage] = useState(1);
  const q = useDebounced(search.trim(), 300);
  const list = useBooks({ q: q || undefined, category, available: available === 'all' ? undefined : available, page, pageSize: PAGE_SIZE });
  const del = useDeleteBook();
  const [deleting, setDeleting] = useState<BookRow | null>(null);

  const actions = (b: BookRow) =>
    canManage && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${b.title}`} onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem disabled={b.available === 0} onSelect={() => onIssue(b)}>
            <BookUp /> Issue a copy
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onEdit(b)}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive disabled={b.onLoan > 0} onSelect={() => setDeleting(b)}>
            <Trash2 /> {b.onLoan > 0 ? 'On loan — can’t remove' : 'Remove'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

  const columns: Column<BookRow>[] = [
    {
      key: 'title',
      header: 'Title',
      cell: (b) => (
        <div className="min-w-0 max-w-[340px]">
          <p className="truncate font-medium">{b.title}</p>
          <p className="truncate text-[12px] text-muted-foreground">{b.author}</p>
        </div>
      ),
    },
    { key: 'category', header: 'Category', cell: (b) => <Badge variant="outline">{BOOK_CATEGORY_LABELS[b.category]}</Badge> },
    { key: 'level', header: 'Level', cell: (b) => <span className="text-[13px] text-muted-foreground">{b.level ?? '—'}</span>, headClassName: 'hidden lg:table-cell', className: 'hidden lg:table-cell' },
    { key: 'shelf', header: 'Shelf', cell: (b) => <span className="font-mono text-[12px] text-muted-foreground">{b.shelf ?? '—'}</span>, headClassName: 'hidden lg:table-cell', className: 'hidden lg:table-cell' },
    { key: 'available', header: 'Available', cell: (b) => <Availability b={b} /> },
    { key: 'borrowed', header: 'Borrowed', cell: (b) => <span className="text-[13px] text-muted-foreground tabular">{b.timesBorrowed}×</span>, headClassName: 'hidden xl:table-cell', className: 'hidden xl:table-cell' },
    { key: 'actions', header: <span className="sr-only">Actions</span>, cell: actions, className: 'w-10' },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center sm:px-5">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search title, author, ISBN or subject…" className="lg:max-w-sm lg:flex-1" />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center [&>*]:min-w-0">
          <Select value={category ?? NONE} onValueChange={(v) => { setCategory(v === NONE ? undefined : (v as BookCategory)); setPage(1); }}>
            <SelectTrigger aria-label="Category" className="sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All categories</SelectItem>
              {BOOK_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {BOOK_CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={available} onValueChange={(v) => { setAvailable(v as typeof available); setPage(1); }}>
            <SelectTrigger aria-label="Availability" className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any availability</SelectItem>
              <SelectItem value="true">On the shelf</SelectItem>
              <SelectItem value="false">All copies out</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {canManage && (
          <Button className="lg:ml-auto" onClick={onAdd}>
            <BookPlus /> Add book
          </Button>
        )}
      </div>
      <DataTable
        columns={columns}
        rows={list.data?.items}
        rowKey={(b) => b.id}
        loading={list.isLoading || list.isPlaceholderData}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={onView}
        rowLabel={(b) => `Open ${b.title}`}
        renderMobile={(b) => (
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{b.title}</p>
              <p className="truncate text-[12.5px] text-muted-foreground">
                {b.author} · {BOOK_CATEGORY_LABELS[b.category]}
              </p>
              <div className="mt-2 max-w-[180px]">
                <Availability b={b} />
              </div>
            </div>
          </div>
        )}
        empty={{
          icon: Library,
          title: q || category || available !== 'all' ? 'No books match' : 'The catalogue is empty',
          description: q || category || available !== 'all' ? 'Try a different search or filter.' : 'Add the books on your shelves to start lending.',
          action: canManage && !q && !category && available === 'all' && (
            <Button onClick={onAdd}>
              <BookPlus /> Add the first book
            </Button>
          ),
        }}
      />
      {list.data && list.data.total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={setPage} noun="titles" />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Remove “${deleting?.title ?? ''}”?`}
        description="It comes off the catalogue. Past loan records are removed with it."
        confirmLabel="Remove book"
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </Card>
  );
}

// ------------------------------------------------------------------ loans

const LOAN_FILTERS: { value: LoanStatusFilter; label: string }[] = [
  { value: 'OUT', label: 'Out now' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'RETURNED', label: 'Returned' },
  { value: 'ALL', label: 'All' },
];

function LoansTab({ status, onStatus }: { status: LoanStatusFilter; onStatus: (s: LoanStatusFilter) => void }) {
  const canManage = useCan('library.manage');
  const currency = useCurrency();
  const q = useLoans({ status });
  const renew = useRenewLoan();
  const finePaid = useFinePaid();
  const [returning, setReturning] = useState<LoanRow | null>(null);
  const [search, setSearch] = useState('');
  const rows = useMemo(() => {
    const t = search.trim().toLowerCase();
    return (q.data ?? []).filter((l) => !t || `${l.book.title} ${l.book.author} ${l.borrower.name} ${l.borrower.detail ?? ''}`.toLowerCase().includes(t));
  }, [q.data, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented label="Loan status" value={status} onChange={onStatus} options={LOAN_FILTERS} />
        <SearchInput value={search} onChange={setSearch} placeholder="Filter by book or borrower…" className="sm:w-72" />
      </div>
      {q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <div className="space-y-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[76px] rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={status === 'OVERDUE' ? Users : BookOpen}
            title={search ? 'No loans match' : status === 'OVERDUE' ? 'Nothing overdue' : status === 'OUT' ? 'No books out right now' : status === 'RETURNED' ? 'No returns yet' : 'No loans yet'}
            description={search ? 'Try a different name or title.' : status === 'OVERDUE' ? 'Every book out on loan is within its due date.' : 'Issued books show up here until they come back.'}
          />
        </Card>
      ) : (
        <Card className={cn('overflow-hidden transition-opacity', q.isPlaceholderData && 'opacity-60')}>
          <ul className="divide-y divide-border">
            {rows.map((l) => {
              const open = !l.returnedOn;
              return (
                <li key={l.id} className={cn('flex flex-col gap-3 px-4 py-3.5 sm:px-5 md:flex-row md:items-center', open && l.daysOverdue > 0 && 'bg-danger-soft/20')}>
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-muted/50 text-muted-foreground">
                      <BookOpen className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">{l.book.title}</p>
                      <p className="truncate text-[12.5px] text-muted-foreground">
                        {l.borrower.name}
                        <span className="text-muted-foreground/80">
                          {' '}
                          · {l.borrower.kind === 'STAFF' ? 'Staff' : l.borrower.detail ?? 'Student'}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                        Issued {schoolDate(l.issuedOn)} · due {schoolDate(l.dueOn)}
                        {open && l.daysOverdue > 0 && l.fineKobo > 0 && <span className="font-medium text-danger"> · {money(l.fineKobo, currency)} accrued</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-12 md:pl-0">
                    <LoanStatus l={l} currency={currency} />
                    {canManage && open && (
                      <>
                        {l.daysOverdue === 0 && (
                          <Button size="sm" variant="ghost" loading={renew.isPending && renew.variables === l.id} onClick={() => renew.mutate(l.id)}>
                            <RefreshCw /> Renew
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => setReturning(l)}>
                          <Undo2 /> Return
                        </Button>
                      </>
                    )}
                    {canManage && !open && l.fineKobo > 0 && !l.finePaid && (
                      <Button size="sm" variant="outline" loading={finePaid.isPending && finePaid.variables === l.id} onClick={() => finePaid.mutate(l.id)}>
                        <Coins /> Mark fine paid
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <ReturnLoanDialog loan={returning} onOpenChange={(o) => !o && setReturning(null)} currency={currency} />
    </div>
  );
}
