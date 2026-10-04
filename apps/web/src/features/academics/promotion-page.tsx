import {
  PROMOTION_DECISION_LABELS,
  PROMOTION_DECISIONS,
  emptyPromotionCounts,
  type PromotionApplyResult,
  type PromotionCounts,
  type PromotionDecision,
  type PromotionLevel,
  type PromotionRow,
  type PromotionSheet,
  type SuggestedSession,
} from '@aischool/shared';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  GraduationCap,
  ListChecks,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
  Undo2,
  Users,
} from 'lucide-react';
import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input, inputClass } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, errorMessage } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useStructure } from './api';
import {
  useApplyPromotion,
  useClearPromotionDraft,
  useCreateNextSession,
  usePromotionSheet,
  useSavePromotionDraft,
  useSavePromotionSettings,
  useUndoPromotion,
} from './promotion-api';

type Edit = { decision: PromotionDecision; targetArmId: string | null; note: string | null };
type Row = PromotionRow & { dirty: boolean };
type Step = 1 | 2 | 3 | 4;

const STEPS: { step: Step; label: string }[] = [
  { step: 1, label: 'Session' },
  { step: 2, label: 'Review' },
  { step: 3, label: 'New session' },
  { step: 4, label: 'Apply' },
];

const DECISION_TONE: Record<PromotionDecision, 'success' | 'warning' | 'brand' | 'danger'> = {
  PROMOTED: 'success',
  REPEATED: 'warning',
  GRADUATED: 'brand',
  WITHDRAWN: 'danger',
};

const FILTERS = [
  { value: 'all', label: 'Everyone' },
  { value: 'REPEATED', label: 'Repeating' },
  { value: 'PROMOTED', label: 'Promoted' },
  { value: 'GRADUATED', label: 'Graduating' },
  { value: 'WITHDRAWN', label: 'Leaving' },
  { value: 'changed', label: 'Changed from suggestion' },
  { value: 'noresults', label: 'No results' },
] as const;
type Filter = (typeof FILTERS)[number]['value'];

const selectClass = cn(inputClass, 'h-9 py-1 pr-7 text-[13px]');
const LEAVES: PromotionDecision[] = ['GRADUATED', 'WITHDRAWN'];

export default function PromotionPage() {
  const { data: structure, isLoading: structureLoading, error: structureError, refetch: refetchStructure } = useStructure();
  const [params, setParams] = useSearchParams();
  const sessions = useMemo(() => [...(structure?.sessions ?? [])].sort((a, b) => b.startsOn.localeCompare(a.startsOn)), [structure]);
  const sessionId = params.get('session') ?? sessions.find((s) => s.isCurrent)?.id ?? sessions[0]?.id;
  const stepParam = Number(params.get('step'));
  const step: Step = stepParam >= 1 && stepParam <= 4 ? (stepParam as Step) : params.get('session') ? 2 : 1;
  const sheetQ = usePromotionSheet(step === 1 ? undefined : sessionId);
  const sheet = sheetQ.data;

  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [toSessionId, setToSessionId] = useState<string | null>(null);
  const [result, setResult] = useState<PromotionApplyResult | null>(null);
  useEffect(() => {
    setEdits({});
    setToSessionId(null);
    setResult(null);
  }, [sessionId]);

  const go = (next: Step, session?: string) => {
    const p = new URLSearchParams(params);
    p.set('step', String(next));
    if (session) p.set('session', session);
    setParams(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const rows: Row[] = useMemo(
    () => (sheet?.classes ?? []).flatMap((c) => c.students.map((s) => (edits[s.studentId] ? { ...s, ...edits[s.studentId]!, dirty: true } : { ...s, dirty: false }))),
    [sheet, edits],
  );
  const dirtyCount = Object.keys(edits).length;
  const applied = !!sheet?.applied;
  const target = sheet?.laterSessions.find((s) => s.id === toSessionId) ?? null;

  if (structureError && !structure) {
    return (
      <Page>
        <PageHeader title="End of session" />
        <ErrorState error={structureError} onRetry={() => void refetchStructure()} />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        eyebrow={
          <Link to="/academics" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Academic Setup
          </Link>
        }
        title="End of session"
        description="Promote students to their next class, keep back those who need to repeat, graduate final-year classes and roll over into the new session."
      />

      <Stepper step={step} onStep={(s) => (s === 1 || sessionId) && (!applied || s <= 2) && go(s)} applied={applied} />

      {structureLoading || !structure ? (
        <Skeleton className="mt-6 h-64 rounded-2xl" />
      ) : sessions.length === 0 ? (
        <Card className="mt-6">
          <EmptyState icon={CalendarDays} title="No sessions yet" description="Create your first academic session in Academic Setup first." action={<Button asChild><Link to="/academics">Open Academic Setup</Link></Button>} />
        </Card>
      ) : step === 1 ? (
        <ChooseSession sessions={sessions} selected={sessionId} onPick={(id) => go(2, id)} />
      ) : sheetQ.error && !sheet ? (
        <ErrorState className="mt-6" error={sheetQ.error} onRetry={() => void sheetQ.refetch()} />
      ) : !sheet ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      ) : result ? (
        <ResultView result={result} onBack={() => { setResult(null); go(2); }} />
      ) : step === 2 || applied ? (
        <ReviewStep sheet={sheet} rows={rows} edits={edits} setEdits={setEdits} dirtyCount={dirtyCount} onNext={() => go(3)} />
      ) : step === 3 ? (
        <NewSessionStep sheet={sheet} selected={toSessionId} onSelect={setToSessionId} onBack={() => go(2)} onNext={() => go(4)} />
      ) : (
        <ApplyStep
          sheet={sheet}
          rows={rows}
          target={target}
          onBack={() => go(3)}
          onChooseSession={() => go(3)}
          onApplied={(r) => {
            setEdits({});
            setResult(r);
          }}
        />
      )}
    </Page>
  );
}

// ------------------------------------------------------------------ stepper

function Stepper({ step, onStep, applied }: { step: Step; onStep: (s: Step) => void; applied: boolean }) {
  return (
    <ol className="mb-6 grid grid-cols-4 gap-1.5 sm:gap-3" aria-label="Steps">
      {STEPS.map((s) => {
        const active = s.step === step || (applied && s.step === 2 && step > 2);
        const done = s.step < step && !applied;
        const disabled = applied && s.step > 2;
        return (
          <li key={s.step}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onStep(s.step)}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex w-full flex-col items-start gap-1 rounded-xl border px-2.5 py-2 text-left transition-colors sm:flex-row sm:items-center sm:gap-2 sm:px-3',
                active ? 'border-brand/40 bg-brand-soft text-brand' : 'border-border bg-card text-muted-foreground hover:bg-muted/60',
                disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              <span
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold',
                  active ? 'bg-brand text-white' : done ? 'bg-success text-white' : 'bg-muted text-muted-foreground',
                )}
              >
                {done ? <CheckCircle2 className="size-3.5" /> : s.step}
              </span>
              <span className="truncate text-[12px] font-medium sm:text-[13px]">{s.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ------------------------------------------------------------------ step 1

function ChooseSession({
  sessions,
  selected,
  onPick,
}: {
  sessions: { id: string; name: string; startsOn: string; endsOn: string; isCurrent: boolean; terms: unknown[] }[];
  selected: string | undefined;
  onPick: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-3 text-[14px] text-muted-foreground">Which session is ending? Usually the current one, after third-term results are in.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sessions.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.id)}
            className={cn(
              'flex items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-xs transition-colors hover:border-brand/40 hover:bg-brand-soft/40',
              s.id === selected ? 'border-brand/50 ring-1 ring-brand/30' : 'border-border',
            )}
          >
            <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', s.isCurrent ? 'bg-brand text-white' : 'bg-muted text-muted-foreground')}>
              <CalendarDays className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 font-display text-[16px] font-semibold">
                {s.name} {s.isCurrent && <Badge variant="brand">Current</Badge>}
              </span>
              <span className="block text-[12.5px] text-muted-foreground">
                {formatDate(s.startsOn)} – {formatDate(s.endsOn)} · {s.terms.length} term{s.terms.length === 1 ? '' : 's'}
              </span>
            </span>
            <ArrowRight className="size-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ step 2

function nextArmFor(row: PromotionRow, levels: PromotionLevel[]): string | null {
  const level = levels.find((l) => l.arms.some((a) => a.id === row.armId));
  const arm = level?.arms.find((a) => a.id === row.armId);
  const next = level?.nextLevelId ? levels.find((l) => l.id === level.nextLevelId) : undefined;
  if (!next || !arm) return null;
  return (next.arms.find((a) => a.name.trim().toLowerCase() === arm.name.trim().toLowerCase()) ?? next.arms[0])?.id ?? null;
}

function countRows(rows: { decision: PromotionDecision }[]): PromotionCounts {
  const c = emptyPromotionCounts();
  for (const r of rows) c[r.decision]++;
  return c;
}

function ReviewStep({
  sheet,
  rows,
  edits,
  setEdits,
  dirtyCount,
  onNext,
}: {
  sheet: PromotionSheet;
  rows: Row[];
  edits: Record<string, Edit>;
  setEdits: Dispatch<SetStateAction<Record<string, Edit>>>;
  dirtyCount: number;
  onNext: () => void;
}) {
  const applied = sheet.applied;
  const [classId, setClassId] = useState<string>('all');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [undoOpen, setUndoOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const saveDraft = useSavePromotionDraft(sheet.session.id);
  const clearDraft = useClearPromotionDraft(sheet.session.id);
  const undo = useUndoPromotion(sheet.session.id);
  const counts = countRows(rows);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (classId !== 'all' && r.armId !== classId) return false;
      if (q && !r.name.toLowerCase().includes(q) && !r.admissionNumber.toLowerCase().includes(q)) return false;
      if (filter === 'changed') return r.decision !== r.suggestion || r.targetArmId !== r.suggestedArmId;
      if (filter === 'noresults') return r.average === null;
      if (filter !== 'all') return r.decision === filter;
      return true;
    });
  }, [rows, classId, filter, search]);

  const groups = useMemo(() => {
    const byArm = new Map<string, Row[]>();
    for (const r of visible) byArm.set(r.armId ?? 'none', [...(byArm.get(r.armId ?? 'none') ?? []), r]);
    return sheet.classes.filter((c) => byArm.has(c.arm.id)).map((c) => ({ arm: c.arm, rows: byArm.get(c.arm.id)! }));
  }, [visible, sheet.classes]);

  const setRow = (row: Row, patch: Partial<Edit>) => {
    setEdits((prev) => {
      const base: Edit = prev[row.studentId] ?? { decision: row.decision, targetArmId: row.targetArmId, note: row.note };
      const next = { ...base, ...patch };
      if (patch.decision) {
        if (LEAVES.includes(patch.decision)) next.targetArmId = null;
        else if (patch.decision === 'REPEATED') next.targetArmId = row.armId;
        else if (patch.decision === 'PROMOTED') next.targetArmId = row.suggestion === 'PROMOTED' ? row.suggestedArmId : nextArmFor(row, sheet.levels);
      }
      return { ...prev, [row.studentId]: next };
    });
  };

  const acceptSuggestions = () => {
    setEdits((prev) => {
      const next = { ...prev };
      for (const r of visible) next[r.studentId] = { decision: r.suggestion, targetArmId: r.suggestedArmId, note: r.note };
      return next;
    });
    toast.success(`Suggestions applied to ${visible.length} student${visible.length === 1 ? '' : 's'} — save the draft to keep them`);
  };

  const save = (then?: () => void) => {
    const decisions = Object.entries(edits).map(([studentId, e]) => ({ studentId, ...e }));
    if (!decisions.length) return then?.();
    saveDraft.mutate(decisions, {
      onSuccess: () => {
        setEdits({});
        toast.success('Draft saved');
        then?.();
      },
      onError: (e) => toast.error(errorMessage(e)),
    });
  };

  const missingClass = rows.filter((r) => !LEAVES.includes(r.decision) && !r.targetArmId).length;

  return (
    <div className="space-y-4">
      {applied ? (
        <Card className="border-success/30 bg-success-soft/40 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
              <div>
                <p className="font-semibold">
                  Promotion applied {applied.toSession ? `into ${applied.toSession.name}` : ''} on {formatDate(applied.appliedAt)}
                </p>
                <p className="text-[13px] text-muted-foreground">
                  {applied.counts.PROMOTED} promoted · {applied.counts.REPEATED} repeating · {applied.counts.GRADUATED} graduated · {applied.counts.WITHDRAWN} withdrawn
                </p>
                {!applied.undo.allowed && applied.undo.reason && <p className="mt-1 text-[12.5px] text-warning">{applied.undo.reason}</p>}
              </div>
            </div>
            <Button variant="outline" disabled={!applied.undo.allowed} onClick={() => setUndoOpen(true)}>
              <Undo2 /> Undo promotion
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {sheet.blockedReason && (
            <Card className="flex gap-3 border-danger/30 bg-danger-soft/40 p-4 text-[13px] text-danger">
              <AlertTriangle className="size-4 shrink-0" /> {sheet.blockedReason}
            </Card>
          )}
          {!sheet.session.isCurrent && !sheet.blockedReason && (
            <Card className="flex gap-3 border-warning/30 bg-warning-soft/40 p-4 text-[13px] text-warning">
              <AlertTriangle className="size-4 shrink-0" /> {sheet.session.name} is not the current session. The sheet lists students in their classes today, so make sure this is the session that is ending.
            </Card>
          )}
          <SettingsCard sheet={sheet} />
        </>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PROMOTION_DECISIONS.map((d) => (
          <Card key={d} className="p-3 sm:p-4">
            <p className="text-[12px] text-muted-foreground">{d === 'PROMOTED' ? 'Promoted' : d === 'REPEATED' ? 'Repeating' : d === 'GRADUATED' ? 'Graduating' : 'Leaving'}</p>
            <p className="font-display text-2xl font-semibold tabular">{counts[d]}</p>
          </Card>
        ))}
      </div>

      <Card className="p-3 sm:p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
            <select aria-label="Class" className={selectClass} value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="all">All classes ({rows.length})</option>
              {sheet.classes.map((c) => (
                <option key={c.arm.id} value={c.arm.id}>
                  {c.arm.label} ({c.students.length})
                </option>
              ))}
            </select>
            <select aria-label="Show" className={selectClass} value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <SearchInput value={search} onChange={setSearch} placeholder="Search students" />
          </div>
          {!applied && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={acceptSuggestions} disabled={!visible.length}>
                <Sparkles /> Accept suggestions{classId !== 'all' || filter !== 'all' || search ? ' (shown)' : ''}
              </Button>
              {sheet.draftSavedAt && (
                <Button variant="ghost" size="sm" onClick={() => setResetOpen(true)}>
                  <RotateCcw /> Reset
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title="No students in classes" description="Only active students who are in a class appear here." />
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState icon={ListChecks} title="Nobody matches" description="Try another class or filter." compact />
        </Card>
      ) : (
        groups.map((g) => <ClassBlock key={g.arm.id} label={g.arm.label} rows={g.rows} sheet={sheet} readOnly={!!applied} onChange={setRow} />)
      )}

      {!applied && (
        <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12.5px] text-muted-foreground">
              {dirtyCount ? `${dirtyCount} unsaved change${dirtyCount === 1 ? '' : 's'}` : sheet.draftSavedAt ? `Draft saved ${formatDate(sheet.draftSavedAt)}` : 'Showing suggestions — nothing saved yet'}
              {missingClass > 0 && <span className="text-warning"> · {missingClass} without a class to move to</span>}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => save()} disabled={!dirtyCount} loading={saveDraft.isPending}>
                <Save /> Save draft
              </Button>
              <Button onClick={() => save(onNext)} loading={saveDraft.isPending} disabled={!!sheet.blockedReason}>
                Next: new session <ArrowRight />
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={undoOpen}
        onOpenChange={setUndoOpen}
        title={`Undo the promotion for ${sheet.session.name}?`}
        description="Every student goes back to the class and status they had before. The new session and its terms stay; if it was made current, this session becomes current again."
        confirmLabel="Undo promotion"
        loading={undo.isPending}
        onConfirm={() =>
          undo.mutate(undefined, {
            onSuccess: (r) => {
              setUndoOpen(false);
              toast.success(`Restored ${r.restored} student${r.restored === 1 ? '' : 's'}${r.skipped ? ` (${r.skipped} changed since and left alone)` : ''}`);
            },
            onError: (e) => {
              setUndoOpen(false);
              toast.error(errorMessage(e));
            },
          })
        }
      />
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Discard saved decisions?"
        description="Everyone goes back to the suggested decision and class."
        confirmLabel="Discard"
        loading={clearDraft.isPending}
        onConfirm={() =>
          clearDraft.mutate(undefined, {
            onSuccess: () => {
              setEdits({});
              setResetOpen(false);
              toast.success('Back to suggestions');
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </div>
  );
}

function SettingsCard({ sheet }: { sheet: PromotionSheet }) {
  const save = useSavePromotionSettings();
  const [open, setOpen] = useState(false);
  const [passMark, setPassMark] = useState(String(sheet.settings.passMark));
  const graduatingNow = sheet.levels.filter((l) => l.graduates).map((l) => l.id);
  const [graduating, setGraduating] = useState<string[]>(graduatingNow);
  useEffect(() => {
    setPassMark(String(sheet.settings.passMark));
    setGraduating(sheet.levels.filter((l) => l.graduates).map((l) => l.id));
  }, [sheet.settings, sheet.levels]);
  const pm = Number(passMark);
  const valid = passMark !== '' && pm >= 0 && pm <= 100;

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Settings2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-[13px] text-muted-foreground">
            Suggestions use a <span className="font-medium text-foreground">{sheet.settings.passMark}%</span> pass mark on the session average (mean of the term averages).{' '}
            Graduating: <span className="font-medium text-foreground">{sheet.levels.filter((l) => l.graduates).map((l) => l.name).join(', ') || 'none'}</span>.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
          <Settings2 /> {open ? 'Close' : 'Change'}
        </Button>
      </div>
      {open && (
        <div className="mt-4 grid gap-4 border-t border-border pt-4 md:grid-cols-[180px_1fr]">
          <Field label="Pass mark (%)" htmlFor="pm" error={valid ? undefined : 'Between 0 and 100'}>
            <Input id="pm" type="number" min={0} max={100} value={passMark} onChange={(e) => setPassMark(e.target.value)} invalid={!valid} />
          </Field>
          <div>
            <p className="mb-2 text-[13px] font-medium">Classes that graduate at the end of the session</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {sheet.levels.map((l) => (
                <label key={l.id} className="flex items-center gap-2 text-[13px]">
                  <Checkbox checked={graduating.includes(l.id)} onCheckedChange={(c) => setGraduating((g) => (c ? [...g, l.id] : g.filter((x) => x !== l.id)))} />
                  {l.name}
                </label>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-muted-foreground">E.g. SS 3 in a secondary school, Primary 6 in a primary-only school, JSS 3 in a junior school. With none ticked, the highest class graduates.</p>
          </div>
          <div className="md:col-span-2">
            <Button
              size="sm"
              disabled={!valid}
              loading={save.isPending}
              onClick={() =>
                save.mutate(
                  { passMark: pm, graduatingLevelIds: graduating },
                  {
                    onSuccess: () => {
                      toast.success('Promotion settings saved');
                      setOpen(false);
                    },
                    onError: (e) => toast.error(errorMessage(e)),
                  },
                )
              }
            >
              Save settings
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function ArmSelect({ value, levels, onChange, disabled, id }: { value: string | null; levels: PromotionLevel[]; onChange: (id: string | null) => void; disabled?: boolean; id?: string }) {
  return (
    <select id={id} aria-label="Class next session" className={cn(selectClass, !value && 'text-warning')} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Choose a class…</option>
      {levels
        .filter((l) => l.arms.length)
        .map((l) => (
          <optgroup key={l.id} label={l.name}>
            {l.arms.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </optgroup>
        ))}
    </select>
  );
}

function DecisionSelect({ value, onChange, disabled }: { value: PromotionDecision; onChange: (d: PromotionDecision) => void; disabled?: boolean }) {
  return (
    <select aria-label="Decision" className={selectClass} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as PromotionDecision)}>
      {PROMOTION_DECISIONS.map((d) => (
        <option key={d} value={d}>
          {PROMOTION_DECISION_LABELS[d]}
        </option>
      ))}
    </select>
  );
}

function Average({ row, terms }: { row: PromotionRow; terms: { name: string }[] }) {
  const detail = row.termAverages.map((v, i) => `${terms[i]?.name ?? `Term ${i + 1}`}: ${v === null ? '—' : `${v}%`}`).join(' · ');
  return (
    <span title={detail}>
      <span className="font-semibold tabular">{row.average === null ? '—' : `${row.average}%`}</span>
      <span className="ml-1 text-[11.5px] text-muted-foreground">
        {row.termsWithResults}/{terms.length} term{terms.length === 1 ? '' : 's'}
      </span>
    </span>
  );
}

function ClassBlock({
  label,
  rows,
  sheet,
  readOnly,
  onChange,
}: {
  label: string;
  rows: Row[];
  sheet: PromotionSheet;
  readOnly: boolean;
  onChange: (row: Row, patch: Partial<Edit>) => void;
}) {
  const armLabel = (id: string | null) => sheet.levels.flatMap((l) => l.arms).find((a) => a.id === id)?.label ?? '—';
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="font-display font-semibold">{label}</p>
        <p className="text-[12px] text-muted-foreground">
          {rows.length} student{rows.length === 1 ? '' : 's'}
        </p>
      </div>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/40 text-left text-[12px] text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Student</th>
              <th className="px-3 py-2 font-medium">Session average</th>
              <th className="px-3 py-2 font-medium">Suggestion</th>
              <th className="w-36 px-3 py-2 font-medium">Decision</th>
              <th className="w-48 px-3 py-2 font-medium">Next session</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.studentId} className={cn(r.dirty && 'bg-brand-soft/30')}>
                <td className="px-4 py-2.5">
                  <p className="font-medium">{r.name}</p>
                  <p className="font-mono text-[11.5px] text-muted-foreground">
                    {r.admissionNumber}
                    {r.status !== 'ACTIVE' && <span className="ml-1.5 font-sans">· {r.status.toLowerCase()}</span>}
                  </p>
                </td>
                <td className="px-3 py-2.5">
                  <Average row={r} terms={sheet.session.terms} />
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant={DECISION_TONE[r.suggestion]}>{PROMOTION_DECISION_LABELS[r.suggestion]}</Badge>
                  <p className="mt-0.5 max-w-56 text-[11.5px] leading-tight text-muted-foreground">{r.reason}</p>
                </td>
                <td className="px-3 py-2.5">
                  {readOnly ? <Badge variant={DECISION_TONE[r.decision]}>{PROMOTION_DECISION_LABELS[r.decision]}</Badge> : <DecisionSelect value={r.decision} onChange={(d) => onChange(r, { decision: d })} />}
                </td>
                <td className="px-3 py-2.5">
                  {LEAVES.includes(r.decision) ? (
                    <span className="text-[12.5px] text-muted-foreground">{r.decision === 'GRADUATED' ? 'Leaves as a graduate' : 'Leaves the school'}</span>
                  ) : readOnly ? (
                    armLabel(r.targetArmId)
                  ) : (
                    <ArmSelect value={r.targetArmId} levels={sheet.levels} onChange={(id) => onChange(r, { targetArmId: id })} />
                  )}
                  {readOnly && r.note && <p className="text-[11.5px] text-muted-foreground">{r.note}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Phone cards */}
      <ul className="divide-y divide-border md:hidden">
        {rows.map((r) => (
          <li key={r.studentId} className={cn('space-y-2 p-4', r.dirty && 'bg-brand-soft/30')}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.name}</p>
                <p className="font-mono text-[11.5px] text-muted-foreground">{r.admissionNumber}</p>
              </div>
              <div className="text-right text-[13px]">
                <Average row={r} terms={sheet.session.terms} />
              </div>
            </div>
            <p className="text-[12px] text-muted-foreground">
              Suggested: <span className="font-medium text-foreground">{PROMOTION_DECISION_LABELS[r.suggestion]}</span> — {r.reason}
            </p>
            {readOnly ? (
              <p className="text-[13px]">
                <Badge variant={DECISION_TONE[r.decision]}>{PROMOTION_DECISION_LABELS[r.decision]}</Badge> {!LEAVES.includes(r.decision) && <span className="ml-1">→ {armLabel(r.targetArmId)}</span>}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <DecisionSelect value={r.decision} onChange={(d) => onChange(r, { decision: d })} />
                {LEAVES.includes(r.decision) ? (
                  <span className="self-center text-[12px] text-muted-foreground">{r.decision === 'GRADUATED' ? 'Leaves as a graduate' : 'Leaves the school'}</span>
                ) : (
                  <ArmSelect value={r.targetArmId} levels={sheet.levels} onChange={(id) => onChange(r, { targetArmId: id })} />
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ------------------------------------------------------------------ step 3

function NewSessionStep({
  sheet,
  selected,
  onSelect,
  onBack,
  onNext,
}: {
  sheet: PromotionSheet;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const later = sheet.laterSessions;
  const [mode, setMode] = useState<'existing' | 'new'>(later.length ? 'existing' : 'new');
  useEffect(() => {
    if (!selected && later.length === 1) onSelect(later[0]!.id);
  }, [later, selected, onSelect]);

  return (
    <div className="space-y-4">
      <Card className="p-4 text-[13px] text-muted-foreground">
        <p>
          Students move into the new session&apos;s first term. Classes, their subjects, subject teachers and class teachers carry over automatically — they aren&apos;t tied to a session. Timetables are
          per term: build the new term&apos;s timetable from the Timetable page once the session is current.
        </p>
      </Card>
      <div className="grid grid-cols-2 gap-2 sm:max-w-md">
        <Button variant={mode === 'existing' ? 'default' : 'outline'} onClick={() => setMode('existing')} disabled={!later.length}>
          Use an existing session
        </Button>
        <Button variant={mode === 'new' ? 'default' : 'outline'} onClick={() => setMode('new')}>
          <CalendarPlus /> Create a new one
        </Button>
      </div>

      {mode === 'existing' ? (
        later.length === 0 ? (
          <Card>
            <EmptyState icon={CalendarDays} title="No later session yet" description="Create the new session here." compact />
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {later.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s.id)}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-xs transition-colors hover:bg-muted/50',
                  selected === s.id ? 'border-brand/50 ring-1 ring-brand/30' : 'border-border',
                )}
              >
                <span className={cn('grid size-5 place-items-center rounded-full border', selected === s.id ? 'border-brand bg-brand text-white' : 'border-border-strong')}>
                  {selected === s.id && <CheckCircle2 className="size-3.5" />}
                </span>
                <span>
                  <span className="flex items-center gap-2 font-semibold">
                    {s.name} {s.isCurrent && <Badge variant="brand">Current</Badge>}
                  </span>
                  <span className="text-[12.5px] text-muted-foreground">
                    {formatDate(s.startsOn)} – {formatDate(s.endsOn)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )
      ) : (
        <CreateSessionForm
          fromSessionId={sheet.session.id}
          fromName={sheet.session.name}
          suggested={sheet.suggestedSession}
          onCreated={(id) => {
            onSelect(id);
            setMode('existing');
          }}
        />
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft /> Back to review
        </Button>
        <Button onClick={onNext} disabled={!selected}>
          Next: confirm <ArrowRight />
        </Button>
      </div>
    </div>
  );
}

function CreateSessionForm({ fromSessionId, fromName, suggested, onCreated }: { fromSessionId: string; fromName: string; suggested: SuggestedSession; onCreated: (id: string) => void }) {
  const create = useCreateNextSession();
  const canFinance = useCan('finance.manage');
  const [form, setForm] = useState(suggested);
  const [copyFees, setCopyFees] = useState(canFinance);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => setForm(suggested), [suggested]);
  const setTerm = (i: number, patch: Partial<SuggestedSession['terms'][number]>) => setForm((f) => ({ ...f, terms: f.terms.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));

  const submit = () => {
    setErrors({});
    create.mutate(
      { ...form, copyFeesFromSessionId: copyFees ? fromSessionId : null, makeCurrent: false },
      {
        onSuccess: (r) => {
          toast.success(`${r.session.name} created with ${r.terms.length} terms${r.feesCopied ? ` and ${r.feesCopied} fee items` : ''}`);
          onCreated(r.session.id);
        },
        onError: (e) => {
          const details = e instanceof ApiError ? e.errors : [];
          setErrors(Object.fromEntries(details.map((d) => [d.path, d.message])));
          toast.error(errorMessage(e));
        },
      },
    );
  };

  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Session name" htmlFor="ns-name" error={errors.name}>
          <Input id="ns-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} invalid={!!errors.name} />
        </Field>
        <Field label="Starts" htmlFor="ns-start" error={errors.startsOn}>
          <Input id="ns-start" type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} />
        </Field>
        <Field label="Ends" htmlFor="ns-end" error={errors.endsOn}>
          <Input id="ns-end" type="date" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} />
        </Field>
      </div>
      <div className="space-y-3">
        <p className="text-[13px] font-medium">Terms</p>
        {form.terms.map((t, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-3 sm:border-0 sm:p-0">
            <Field label={i === 0 ? 'Name' : undefined} error={errors[`terms.${i}.name`]}>
              <Input aria-label={`Term ${i + 1} name`} value={t.name} onChange={(e) => setTerm(i, { name: e.target.value })} />
            </Field>
            <Field label={i === 0 ? 'Starts' : undefined} error={errors[`terms.${i}.startsOn`]}>
              <Input aria-label={`Term ${i + 1} starts`} type="date" value={t.startsOn} onChange={(e) => setTerm(i, { startsOn: e.target.value })} />
            </Field>
            <Field label={i === 0 ? 'Ends' : undefined} error={errors[`terms.${i}.endsOn`]}>
              <Input aria-label={`Term ${i + 1} ends`} type="date" value={t.endsOn} onChange={(e) => setTerm(i, { endsOn: e.target.value })} />
            </Field>
          </div>
        ))}
        <p className="text-[12px] text-muted-foreground">Dates are suggested from {fromName}, a year on. Adjust them to your school calendar.</p>
      </div>
      {canFinance && (
        <label className="flex items-start gap-2 text-[13px]">
          <Checkbox className="mt-0.5" checked={copyFees} onCheckedChange={(c) => setCopyFees(!!c)} />
          <span>
            Copy the fee schedule from {fromName}, term by term
            <span className="block text-[12px] text-muted-foreground">You can change amounts afterwards in Fees.</span>
          </span>
        </label>
      )}
      <Button onClick={submit} loading={create.isPending}>
        <CalendarPlus /> Create {form.name || 'session'}
      </Button>
    </Card>
  );
}

// ------------------------------------------------------------------ step 4

function ApplyStep({
  sheet,
  rows,
  target,
  onBack,
  onChooseSession,
  onApplied,
}: {
  sheet: PromotionSheet;
  rows: Row[];
  target: PromotionSheet['laterSessions'][number] | null;
  onBack: () => void;
  onChooseSession: () => void;
  onApplied: (r: PromotionApplyResult) => void;
}) {
  const apply = useApplyPromotion(sheet.session.id);
  const canFinance = useCan('finance.manage');
  const [makeCurrent, setMakeCurrent] = useState(true);
  const [invoices, setInvoices] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const missing = rows.filter((r) => !LEAVES.includes(r.decision) && !r.targetArmId);
  const noResults = rows.filter((r) => r.average === null).length;

  const byLevel = useMemo(() => {
    const out = new Map<string, { name: string; order: number; counts: PromotionCounts }>();
    for (const r of rows) {
      const level = sheet.levels.find((l) => l.arms.some((a) => a.id === r.armId));
      const key = level?.id ?? 'none';
      const row = out.get(key) ?? { name: level?.name ?? 'Former class', order: level?.order ?? 1e6, counts: emptyPromotionCounts() };
      row.counts[r.decision]++;
      out.set(key, row);
    }
    return [...out.values()].sort((a, b) => a.order - b.order);
  }, [rows, sheet.levels]);
  const counts = countRows(rows);

  if (!target) {
    return (
      <Card>
        <EmptyState icon={CalendarPlus} title="Choose the new session first" action={<Button onClick={onChooseSession}>Choose session</Button>} />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <p className="font-display text-lg font-semibold">
          {sheet.session.name} <ArrowRight className="inline size-4" /> {target.name}
        </p>
        <p className="text-[13px] text-muted-foreground">
          {rows.length} students: {counts.PROMOTED} promoted, {counts.REPEATED} repeating, {counts.GRADUATED} graduating, {counts.WITHDRAWN} leaving.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-[13px]">
            <thead className="text-left text-[12px] text-muted-foreground">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Class</th>
                <th className="px-2 py-1.5 text-right font-medium">Promoted</th>
                <th className="px-2 py-1.5 text-right font-medium">Repeating</th>
                <th className="px-2 py-1.5 text-right font-medium">Graduating</th>
                <th className="px-2 py-1.5 text-right font-medium">Leaving</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {byLevel.map((l) => (
                <tr key={l.name}>
                  <td className="py-2 pr-3 font-medium">{l.name}</td>
                  {PROMOTION_DECISIONS.map((d) => (
                    <td key={d} className="px-2 py-2 text-right tabular">
                      {l.counts[d] || <span className="text-muted-foreground">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {missing.length > 0 && (
        <Card className="flex gap-3 border-danger/30 bg-danger-soft/40 p-4 text-[13px] text-danger">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            {missing.length} student{missing.length === 1 ? ' has' : 's have'} no class to move into ({missing.slice(0, 4).map((m) => m.name).join(', ')}
            {missing.length > 4 ? '…' : ''}). Go back and choose one — if the next class level has no classes, add one in Academic Setup first.
          </span>
        </Card>
      )}
      {noResults > 0 && (
        <Card className="flex gap-3 border-warning/30 bg-warning-soft/40 p-4 text-[13px] text-warning">
          <AlertTriangle className="size-4 shrink-0" /> {noResults} student{noResults === 1 ? ' has' : 's have'} no results this session and {noResults === 1 ? 'was' : 'were'} suggested for promotion. Check them before applying.
        </Card>
      )}

      <Card className="space-y-3 p-4 sm:p-5">
        {!target.isCurrent && (
          <label className="flex items-start gap-2 text-[13px]">
            <Checkbox className="mt-0.5" checked={makeCurrent} onCheckedChange={(c) => setMakeCurrent(!!c)} />
            <span>
              Make {target.name} the current session (and its first term the current term)
              <span className="block text-[12px] text-muted-foreground">Leave this off if the new session hasn&apos;t started yet; you can switch it in Academic Setup later.</span>
            </span>
          </label>
        )}
        {canFinance && (
          <label className="flex items-start gap-2 text-[13px]">
            <Checkbox className="mt-0.5" checked={invoices} onCheckedChange={(c) => setInvoices(!!c)} />
            <span>
              Issue first-term invoices for {target.name}
              <span className="block text-[12px] text-muted-foreground">From the first term&apos;s fee schedule, for every active student in a class. Invoices stop the promotion being undone until they are cancelled.</span>
            </span>
          </label>
        )}
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft /> Back
        </Button>
        <Button onClick={() => setConfirm(true)} disabled={missing.length > 0 || !!sheet.blockedReason}>
          <GraduationCap /> Apply promotion
        </Button>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        destructive={false}
        title={`Apply the promotion into ${target.name}?`}
        description={`${counts.PROMOTED + counts.REPEATED} students move to their new classes, ${counts.GRADUATED} graduate and ${counts.WITHDRAWN} leave. Graduates and leavers keep their records but leave their classes. You can undo this until anything is recorded in ${target.name}.`}
        confirmLabel="Apply promotion"
        loading={apply.isPending}
        onConfirm={() =>
          apply.mutate(
            {
              toSessionId: target.id,
              decisions: rows.map((r) => ({ studentId: r.studentId, decision: r.decision, targetArmId: r.targetArmId, note: r.note })),
              makeCurrent: !target.isCurrent && makeCurrent,
              generateInvoices: canFinance && invoices,
            },
            {
              onSuccess: (r) => {
                setConfirm(false);
                toast.success('Promotion applied');
                onApplied(r);
              },
              onError: (e) => {
                setConfirm(false);
                toast.error(errorMessage(e));
              },
            },
          )
        }
      />
    </div>
  );
}

function ResultView({ result, onBack }: { result: PromotionApplyResult; onBack: () => void }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-success-soft text-success">
          <CheckCircle2 className="size-5" />
        </span>
        <div>
          <p className="font-display text-xl font-semibold">Welcome to {result.toSession.name}</p>
          <p className="text-[13.5px] text-muted-foreground">
            {result.counts.PROMOTED} promoted · {result.counts.REPEATED} repeating · {result.counts.GRADUATED} graduated · {result.counts.WITHDRAWN} withdrawn
            {result.toSession.madeCurrent ? ` · ${result.toSession.name} is now the current session` : ''}
          </p>
        </div>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {result.byLevel.map((l) => (
          <li key={l.levelId} className="rounded-xl border border-border p-3 text-[13px]">
            <p className="font-medium">{l.levelName}</p>
            <p className="text-muted-foreground">
              {PROMOTION_DECISIONS.filter((d) => l.counts[d])
                .map((d) => `${l.counts[d]} ${d === 'PROMOTED' ? 'promoted' : d === 'REPEATED' ? 'repeating' : d === 'GRADUATED' ? 'graduated' : 'withdrawn'}`)
                .join(' · ')}
            </p>
          </li>
        ))}
      </ul>
      {result.invoices && (
        <p className="mt-4 text-[13px]">
          {result.invoices.skipped ? (
            <span className="text-warning">Invoices were not issued: {result.invoices.skipped}</span>
          ) : (
            `${result.invoices.created} first-term invoice${result.invoices.created === 1 ? '' : 's'} issued.`
          )}
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="outline" onClick={onBack}>
          View the promotion sheet
        </Button>
        <Button variant="outline" asChild>
          <Link to="/academics">Academic Setup</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/students">Students</Link>
        </Button>
      </div>
    </Card>
  );
}
