import { DEFAULT_REPORT_TEMPLATE, type TraitDomain, type TraitSheet } from '@aischool/shared';
import { Eraser, Lock, PaintBucket, Save, Star, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiError, errorMessage } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { useStructure } from '../academics/api';
import { useReportTemplates, useSaveTraitRatings, useTraitSheet } from '../assessment/api';
import { useStoredState } from '../assessment/ui';
import { ArmSelect, currentTerm, TermSelect } from '../planning/pickers';
import { BackLink } from '../planning/ui';

/**
 * Behaviour (affective) and skills (psychomotor) ratings for a class and term,
 * entered as a students × traits grid. Saves only the cells that changed.
 */
export default function TraitRatingsPage() {
  useDocumentTitle('Behaviour and skills ratings');
  const structure = useStructure();
  const [params, setParams] = useSearchParams();
  const [pick, setPick] = useStoredState<{ termId?: string; classArmId?: string }>('aischool.results.pick', {});
  const terms = structure.data?.sessions.flatMap((s) => s.terms) ?? [];
  const wantedTerm = params.get('termId') ?? pick.termId;
  const termId = wantedTerm && terms.some((t) => t.id === wantedTerm) ? wantedTerm : currentTerm(structure.data)?.id;
  const classArmId = params.get('classArmId') ?? pick.classArmId;
  const templates = useReportTemplates();
  const cfg = templates.data?.templates.find((t) => t.isDefault)?.config ?? templates.data?.standard ?? DEFAULT_REPORT_TEMPLATE;
  const [tab, setTab] = useState<TraitDomain>('AFFECTIVE');
  const [dirty, setDirty] = useState<Record<TraitDomain, number>>({ AFFECTIVE: 0, PSYCHOMOTOR: 0 });
  const canLayout = useCan('results.publish');

  const choose = (next: { termId?: string; classArmId?: string }) => {
    if ((dirty.AFFECTIVE || dirty.PSYCHOMOTOR) && !window.confirm('You have unsaved ratings. Leave them?')) return;
    const merged = { termId, classArmId, ...next };
    setPick(merged);
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(merged)) v ? p.set(k, v) : p.delete(k);
    setParams(p, { replace: true });
  };

  const ready = !!termId && !!classArmId;
  return (
    <Page className="max-w-6xl">
      <BackLink to="/report-cards">Report Cards</BackLink>
      <PageHeader
        title="Behaviour and skills ratings"
        description="Rate each learner on the traits printed on the report card. Tap a box to cycle through the ratings, or type a number."
        actions={
          canLayout && (
            <Button asChild variant="outline">
              <Link to="/report-cards/layout">Edit traits and scale</Link>
            </Button>
          )
        }
      />

      <Card className="mb-4 grid gap-3 p-3 sm:grid-cols-2">
        <TermSelect structure={structure.data} value={termId} onChange={(v) => choose({ termId: v })} aria-label="Term" />
        <ArmSelect structure={structure.data} value={classArmId} onChange={(v) => choose({ classArmId: v })} aria-label="Class" />
      </Card>

      {!ready ? (
        <Card>
          <EmptyState icon={Star} title="Pick a term and class" description="Choose the class whose learners you want to rate." />
        </Card>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as TraitDomain)}>
          <TabsList className="mb-3">
            {(['AFFECTIVE', 'PSYCHOMOTOR'] as const).map((d) => {
              const sec = d === 'AFFECTIVE' ? cfg.affective : cfg.psychomotor;
              return (
                <TabsTrigger key={d} value={d}>
                  {sec.title}
                  {dirty[d] > 0 && <span className="ml-1 rounded-full bg-warning-soft px-1.5 text-[11px] tabular text-warning">{dirty[d]}</span>}
                </TabsTrigger>
              );
            })}
          </TabsList>
          {(['AFFECTIVE', 'PSYCHOMOTOR'] as const).map((d) => (
            <TabsContent key={d} value={d} forceMount className="data-[state=inactive]:hidden">
              <TraitGrid
                classArmId={classArmId}
                termId={termId}
                domain={d}
                sectionOff={!(d === 'AFFECTIVE' ? cfg.affective : cfg.psychomotor).enabled}
                onDirty={(n) => setDirty((x) => (x[d] === n ? x : { ...x, [d]: n }))}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </Page>
  );
}

type Edits = Record<string, number | null>;
const cellKey = (studentId: string, trait: string) => `${studentId}|${trait}`;

function TraitGrid({
  classArmId,
  termId,
  domain,
  sectionOff,
  onDirty,
}: {
  classArmId: string;
  termId: string;
  domain: TraitDomain;
  sectionOff: boolean;
  onDirty: (n: number) => void;
}) {
  const sheet = useTraitSheet({ classArmId, termId, domain });
  const save = useSaveTraitRatings();
  const [edits, setEdits] = useState<Edits>({});
  const [forbidden, setForbidden] = useState<string | null>(null);
  const [active, setActive] = useState<[number, number]>([0, 0]);
  const gridRef = useRef<HTMLTableElement>(null);
  const data = sheet.data;

  // A different class or term starts clean.
  useEffect(() => {
    setEdits({});
    setForbidden(null);
    setActive([0, 0]);
  }, [classArmId, termId]);

  const original = (s: TraitSheet['students'][number], t: string) => s.ratings[t] ?? null;
  const value = (s: TraitSheet['students'][number], t: string) => {
    const k = cellKey(s.id, t);
    return k in edits ? edits[k] : original(s, t);
  };

  const changes = useMemo(() => {
    if (!data) return [];
    const out: { studentId: string; domain: TraitDomain; trait: string; rating: number | null }[] = [];
    for (const s of data.students) for (const t of data.traits) {
      const k = cellKey(s.id, t);
      if (k in edits && edits[k] !== original(s, t)) out.push({ studentId: s.id, domain, trait: t, rating: edits[k] });
    }
    return out;
  }, [data, edits, domain]);

  useEffect(() => onDirty(changes.length), [changes.length, onDirty]);
  useEffect(() => {
    if (!changes.length) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changes.length]);

  if (sheet.isLoading) return <Skeleton className="h-96 rounded-2xl" />;
  if (!data) return <ErrorState error={sheet.error} onRetry={() => void sheet.refetch()} />;
  if (!data.traits.length) {
    return (
      <Card>
        <EmptyState icon={Star} title="No traits in this section" description="Add the traits your card rates in the report card layout." />
      </Card>
    );
  }
  if (!data.students.length) {
    return (
      <Card>
        <EmptyState icon={Star} title="No learners in this class" description="Enrol learners into this class to rate them." />
      </Card>
    );
  }

  const scale = data.scale; // highest first
  const values = scale.map((s) => s.value);
  const labelOf = (v: number | null) => scale.find((s) => s.value === v)?.label;
  const setCell = (studentId: string, trait: string, v: number | null) => setEdits((e) => ({ ...e, [cellKey(studentId, trait)]: v }));
  const cycle = (v: number | null) => {
    if (v === null) return values[0];
    const i = values.indexOf(v);
    return i < 0 || i === values.length - 1 ? null : values[i + 1];
  };
  const fill = (trait: string, v: number | null, onlyEmpty: boolean) =>
    setEdits((e) => {
      const next = { ...e };
      for (const s of data.students) {
        const k = cellKey(s.id, trait);
        const cur = k in next ? next[k] : original(s, trait);
        if (!onlyEmpty || cur === null) next[k] = v;
      }
      return next;
    });

  const focusCell = (r: number, c: number) => {
    const rr = Math.max(0, Math.min(data.students.length - 1, r));
    const cc = Math.max(0, Math.min(data.traits.length - 1, c));
    setActive([rr, cc]);
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${rr}-${cc}"]`)?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, r: number, c: number) => {
    const s = data.students[r];
    const t = data.traits[c];
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (moves[e.key]) {
      e.preventDefault();
      focusCell(r + moves[e.key][0], c + moves[e.key][1]);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusCell(r, 0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusCell(r, data.traits.length - 1);
    } else if (/^[0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const v = Number(e.key);
      if (values.includes(v)) {
        e.preventDefault();
        setCell(s.id, t, v);
        focusCell(r + 1, c); // fast entry down a trait
      }
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      setCell(s.id, t, null);
    }
  };

  const submit = () => {
    setForbidden(null);
    save.mutate(
      { classArmId, termId, ratings: changes },
      {
        onSuccess: (r) => {
          setEdits({});
          toast.success(`${r.saved} rating${r.saved === 1 ? '' : 's'} saved`);
        },
        onError: (e) => {
          if (e instanceof ApiError && e.status === 403) setForbidden(e.message);
          else toast.error(errorMessage(e));
        },
      },
    );
  };

  const tone = (v: number | null) => {
    if (v === null) return 'border-dashed text-muted-foreground/50';
    const i = values.indexOf(v);
    const third = values.length / 3;
    return i < third ? 'border-success/30 bg-success-soft text-success' : i < 2 * third ? 'border-info/30 bg-info-soft text-info' : 'border-warning/30 bg-warning-soft text-warning';
  };

  return (
    <div className="space-y-3">
      {sectionOff && (
        <p className="rounded-lg bg-muted px-3 py-2 text-[13px] text-muted-foreground">This section is switched off in the report card layout, so these ratings won’t print.</p>
      )}
      {forbidden && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft/60 px-3 py-2 text-[13px] text-danger">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <span>
            {forbidden}. Your ratings haven’t been saved — ask the class teacher or principal to enter them.
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        <span className="font-medium text-foreground">Key:</span>
        {scale.map((s) => (
          <span key={s.value} className="tabular">
            <span className="font-semibold text-foreground">{s.value}</span> {s.label}
          </span>
        ))}
        <span className="hidden lg:inline">· Arrow keys move, type a number to rate and go down, Delete clears.</span>
      </div>

      <Card className="overflow-hidden">
        <div className="scrollbar-thin max-h-[calc(100dvh-14rem)] overflow-auto">
          <table ref={gridRef} role="grid" aria-label={`${domain === 'AFFECTIVE' ? 'Affective' : 'Psychomotor'} ratings`} className="w-full border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr>
                <th scope="col" className="sticky top-0 left-0 z-20 min-w-36 border-b border-border bg-card px-3 py-2 text-left align-bottom text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:min-w-52">
                  Learner
                </th>
                {data.traits.map((t) => (
                  <th key={t} scope="col" className="sticky top-0 z-10 border-b border-l border-border bg-card px-1 py-2 align-bottom">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          title={`${t} — fill or clear this column`}
                          className="mx-auto flex max-h-36 min-h-20 w-10 items-end justify-center rounded-md px-1 py-1 text-[12px] font-medium leading-tight hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="line-clamp-2 [writing-mode:vertical-rl] rotate-180 text-left">{t}</span>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuLabel>{t}</DropdownMenuLabel>
                        {scale.map((s) => (
                          <DropdownMenuItem key={s.value} onSelect={() => fill(t, s.value, true)}>
                            <PaintBucket /> Fill empty with {s.value} – {s.label}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        {scale.map((s) => (
                          <DropdownMenuItem key={`all-${s.value}`} onSelect={() => fill(t, s.value, false)}>
                            Set everyone to {s.value} – {s.label}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => fill(t, null, false)}>
                          <Eraser /> Clear column
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.students.map((s, r) => (
                <tr key={s.id} className="group">
                  <th scope="row" className="sticky left-0 z-10 border-b border-border bg-card px-3 py-1.5 text-left font-normal group-hover:bg-muted/40">
                    <span className="block max-w-40 truncate font-medium sm:max-w-60">{s.name}</span>
                    <span className="block text-[11px] tabular text-muted-foreground">{s.admissionNumber}</span>
                  </th>
                  {data.traits.map((t, c) => {
                    const v = value(s, t);
                    const changed = cellKey(s.id, t) in edits && edits[cellKey(s.id, t)] !== original(s, t);
                    const isActive = active[0] === r && active[1] === c;
                    return (
                      <td key={t} className="border-b border-l border-border p-1 text-center group-hover:bg-muted/40">
                        <button
                          type="button"
                          data-cell={`${r}-${c}`}
                          tabIndex={isActive ? 0 : -1}
                          aria-label={`${s.name}, ${t}: ${v === null ? 'not rated' : `${v} ${labelOf(v) ?? ''}`}`}
                          title={v === null ? 'Not rated — tap to rate' : `${v} – ${labelOf(v) ?? ''}`}
                          onFocus={() => setActive([r, c])}
                          onClick={() => setCell(s.id, t, cycle(v))}
                          onKeyDown={(e) => onKey(e, r, c)}
                          className={cn(
                            'relative mx-auto grid size-10 place-items-center rounded-lg border font-display text-[15px] font-semibold tabular transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            tone(v),
                          )}
                        >
                          {v ?? '·'}
                          {changed && <span aria-hidden className="absolute -top-1 -right-1 size-2 rounded-full bg-warning ring-2 ring-card" />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div
        className={cn(
          'z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 backdrop-blur',
          changes.length > 0 && 'sticky bottom-3 shadow-soft',
        )}
      >
        <span className="text-[13px] text-muted-foreground">
          {changes.length ? (
            <>
              <span className="font-semibold text-foreground tabular">{changes.length}</span> unsaved change{changes.length === 1 ? '' : 's'}
            </>
          ) : (
            'All ratings saved'
          )}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" disabled={!changes.length || save.isPending} onClick={() => setEdits({})}>
            <Undo2 /> Undo
          </Button>
          <Button size="sm" disabled={!changes.length} loading={save.isPending} onClick={submit}>
            {!save.isPending && <Save />} Save ratings
          </Button>
        </div>
      </div>
    </div>
  );
}
