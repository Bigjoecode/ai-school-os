import {
  AI_PROVIDERS,
  AI_PROVIDER_LABELS,
  REASONING_EFFORTS,
  aiSettingsSchema,
  type AiProviderName,
  type AiProviderStatus,
  type AiSettings,
  type AiSettingsView,
  type AiTestResult,
  type ReasoningEffortSetting,
} from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  CircleAlert,
  KeyRound,
  Play,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ApiError, api, errorMessage } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { queryClient } from '@/lib/query-client';
import { cn } from '@/lib/utils';

// ------------------------------------------------------------------ data

const KEY = ['platform', 'ai-settings'] as const;
const SAVED_TOAST = 'ai-settings-saved';
const ENV_KEY: Record<AiProviderName, string> = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY' };
const TIERS = [
  { key: 'standard', label: 'Standard', hint: 'Everyday answers, tutoring, assistants' },
  { key: 'advanced', label: 'Advanced', hint: 'Deeper explanations, Pro, briefings' },
] as const;
type Tier = (typeof TIERS)[number]['key'];
const EXAMPLE_MODEL: Record<AiProviderName, string> = { anthropic: 'claude-haiku-4-5', openai: 'gpt-5.4-mini', gemini: 'gemini-2.5-flash' };
const EFFORT_LABEL: Record<ReasoningEffortSetting, string> = { auto: 'Auto', minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High' };

const useAiSettings = () => useQuery({ queryKey: KEY, queryFn: ({ signal }) => api.get<AiSettingsView>('/platform/ai-settings', undefined, signal) });

// ------------------------------------------------------------------ draft

interface PriceRow {
  id: string;
  model: string;
  input: string;
  output: string;
  cachedInput: string;
  cacheWrite: string;
}
interface Draft {
  order: AiProviderName[];
  models: AiSettings['models'];
  prices: PriceRow[];
  promptCaching: boolean;
}

let rowSeq = 0;
const newId = () => `row-${++rowSeq}`;
const numText = (n: number | null | undefined) => (n == null ? '' : String(n));

function toDraft(s: AiSettings): Draft {
  return {
    order: [...s.order],
    models: structuredClone(s.models),
    prices: Object.entries(s.prices).map(([model, p]) => ({
      id: newId(),
      model,
      input: numText(p.input),
      output: numText(p.output),
      cachedInput: numText(p.cachedInput),
      cacheWrite: numText(p.cacheWrite),
    })),
    promptCaching: s.promptCaching,
  };
}

function parseNum(raw: string): number | null | 'bad' {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : 'bad';
}

/** The draft as the settings the API takes, plus anything the schema can't phrase kindly. */
function fromDraft(d: Draft): { settings: AiSettings | null; issues: string[] } {
  const issues: string[] = [];
  const prices: Record<string, { input: number; output: number; cachedInput: number | null; cacheWrite: number | null }> = {};
  const seen = new Set<string>();
  for (const r of d.prices) {
    const model = r.model.trim();
    if (!model) {
      issues.push('Every price row needs a model name');
      continue;
    }
    if (seen.has(model)) issues.push(`${model} is priced twice`);
    seen.add(model);
    const input = parseNum(r.input);
    const output = parseNum(r.output);
    const cachedInput = parseNum(r.cachedInput);
    const cacheWrite = parseNum(r.cacheWrite);
    if (input === null || output === null) issues.push(`${model} needs an input and an output price`);
    if ([input, output, cachedInput, cacheWrite].includes('bad')) issues.push(`${model}: prices must be numbers`);
    prices[model] = {
      input: typeof input === 'number' ? input : 0,
      output: typeof output === 'number' ? output : 0,
      cachedInput: typeof cachedInput === 'number' ? cachedInput : null,
      cacheWrite: typeof cacheWrite === 'number' ? cacheWrite : null,
    };
  }
  if (!d.order.length) issues.push('Keep at least one provider in the fallback order');
  const parsed = aiSettingsSchema.safeParse({ order: d.order, models: d.models, prices, promptCaching: d.promptCaching });
  if (!parsed.success) {
    for (const i of parsed.error.issues) {
      const [head, key, field] = i.path.map(String);
      issues.push(
        head === 'prices'
          ? `${key}${field ? ` ${field}` : ''}: ${i.message}`
          : head === 'models'
            ? `${AI_PROVIDER_LABELS[key as AiProviderName] ?? key} ${field ?? ''} model: ${i.message}`
            : i.message,
      );
    }
  }
  return { settings: issues.length || !parsed.success ? null : parsed.data, issues: [...new Set(issues)] };
}

/** A stable fingerprint of settings so a reorder-and-back or a retyped price doesn't count as a change. */
function fingerprint(s: Pick<AiSettings, 'order' | 'models' | 'prices' | 'promptCaching'>): string {
  const models = AI_PROVIDERS.map((p) => {
    const m = s.models[p];
    return [p, m.standard.trim(), m.advanced.trim(), m.standardEffort, m.advancedEffort];
  });
  const prices = Object.keys(s.prices)
    .sort()
    .map((k) => [k, s.prices[k].input, s.prices[k].output, s.prices[k].cachedInput ?? null, s.prices[k].cacheWrite ?? null]);
  return JSON.stringify([s.order, models, prices, s.promptCaching]);
}

function draftFingerprint(d: Draft): string | null {
  const { settings } = fromDraft(d);
  return settings ? fingerprint(settings) : null;
}

function money(n: number, digits = 2) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, 2) })}`;
}
function tinyMoney(n: number) {
  if (n === 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(6).replace(/0+$/, '')}`;
  return money(n);
}
function short(n: number) {
  return Number(n.toFixed(4)).toString();
}

// ------------------------------------------------------------------ page

export default function AiModelsPage() {
  const q = useAiSettings();
  const view = q.data;
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [serverErrors, setServerErrors] = React.useState<string[]>([]);
  const [focusRow, setFocusRow] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (view && !draft) setDraft(toDraft(view.settings));
  }, [view, draft]);

  const result = React.useMemo(() => (draft ? fromDraft(draft) : null), [draft]);
  const dirty = !!view && !!draft && draftFingerprint(draft) !== fingerprint(view.settings);

  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = useMutation({
    mutationFn: (s: AiSettings) => api.put<AiSettingsView>('/platform/ai-settings', s),
    onSuccess: (v) => {
      queryClient.setQueryData(KEY, v);
      setDraft(toDraft(v.settings));
      setServerErrors([]);
      toast.success('AI settings saved', { id: SAVED_TOAST, description: 'New requests use them straight away.' });
    },
    onError: (e) => {
      const list = e instanceof ApiError && e.errors.length ? e.errors.map((x) => (x.path ? `${x.path}: ${x.message}` : x.message)) : [errorMessage(e)];
      setServerErrors(list);
      toast.error('Couldn’t save AI settings', { description: list[0] });
    },
  });

  const update = (fn: (d: Draft) => Draft) => {
    // The toast sits where the save bar's buttons appear, and it's stale once editing resumes.
    toast.dismiss(SAVED_TOAST);
    setServerErrors([]);
    setDraft((d) => (d ? fn(d) : d));
  };

  const addPrice = (model = '') => {
    const id = newId();
    update((d) => ({ ...d, prices: [...d.prices, { id, model, input: '', output: '', cachedInput: '', cacheWrite: '' }] }));
    setFocusRow(id);
  };

  return (
    <Page className="max-w-[1180px]">
      <PageHeader
        eyebrow="Platform"
        title="AI models"
        description="Features ask for Standard or Advanced. This page decides which model answers each, which provider is tried first, and the prices used for cost tracking."
      />
      {q.error && !view ? (
        <Card className="flex flex-col gap-4 border-danger/30 p-5 sm:flex-row sm:items-center sm:p-6">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-danger-soft text-danger">
            <XCircle className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[17px] font-semibold tracking-tight">AI settings couldn’t load</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{errorMessage(q.error)}</p>
          </div>
          <Button variant="outline" onClick={() => void q.refetch()} loading={q.isFetching}>
            Try again
          </Button>
        </Card>
      ) : !view || !draft || !result ? (
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-10 pb-4">
          <Intro />
          <ProvidersSection view={view} draft={draft} update={update} onAddPrice={addPrice} />
          <PricesSection view={view} draft={draft} update={update} onAddPrice={addPrice} focusRow={focusRow} onFocused={() => setFocusRow(null)} />
          <CachingSection value={draft.promptCaching} onChange={(v) => update((d) => ({ ...d, promptCaching: v }))} />

          {(dirty || serverErrors.length > 0) && (
            <SaveBar
              issues={serverErrors.length ? serverErrors : result.issues}
              server={serverErrors.length > 0}
              saving={save.isPending}
              canSave={!!result.settings}
              onDiscard={() => {
                setServerErrors([]);
                setDraft(toDraft(view.settings));
              }}
              onSave={() => result.settings && save.mutate(result.settings)}
            />
          )}
        </div>
      )}
    </Page>
  );
}

// ------------------------------------------------------------------ intro

function Intro() {
  return (
    <Card className="grid gap-px overflow-hidden bg-border p-0 sm:grid-cols-3">
      {TIERS.map((t) => (
        <div key={t.key} className="bg-card px-5 py-4">
          <p className="text-[12px] font-medium text-muted-foreground">Tier</p>
          <p className="mt-0.5 font-display text-[15px] font-semibold tracking-tight">{t.label}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{t.hint}</p>
        </div>
      ))}
      <div className="bg-card px-5 py-4">
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
          <KeyRound className="size-3.5" aria-hidden /> API keys
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          Set in the server’s environment as{' '}
          {AI_PROVIDERS.map((p, i) => (
            <React.Fragment key={p}>
              <code className="rounded bg-muted px-1 py-px font-mono text-[11.5px] text-foreground">{ENV_KEY[p]}</code>
              {i < AI_PROVIDERS.length - 2 ? ', ' : i === AI_PROVIDERS.length - 2 ? ' and ' : ''}
            </React.Fragment>
          ))}
          . Never shown or stored here.
        </p>
      </div>
    </Card>
  );
}

function SectionHeading({ id, title, description, actions }: { id: string; title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 id={id} className="font-display text-[17px] font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ providers

type Update = (fn: (d: Draft) => Draft) => void;

function ProvidersSection({ view, draft, update, onAddPrice }: { view: AiSettingsView; draft: Draft; update: Update; onAddPrice: (m: string) => void }) {
  const status = new Map(view.providers.map((p) => [p.provider, p]));
  const keySet = (p: AiProviderName) => status.get(p)?.keySet ?? false;
  const readyNow = (p: AiProviderName) => keySet(p) && !!draft.models[p].standard.trim() && !!draft.models[p].advanced.trim();
  const listed = [...draft.order, ...AI_PROVIDERS.filter((p) => !draft.order.includes(p))];
  const firstReady = draft.order.find(readyNow);

  const move = (p: AiProviderName, by: -1 | 1) =>
    update((d) => {
      const order = [...d.order];
      const i = order.indexOf(p);
      const j = i + by;
      if (i < 0 || j < 0 || j >= order.length) return d;
      [order[i], order[j]] = [order[j], order[i]];
      return { ...d, order };
    });
  const include = (p: AiProviderName, on: boolean) =>
    update((d) => ({ ...d, order: on ? [...d.order.filter((x) => x !== p), p] : d.order.filter((x) => x !== p) }));

  return (
    <section aria-labelledby="providers-h">
      <SectionHeading
        id="providers-h"
        title="Providers"
        description="Tried in this order: the first ready provider answers; if it fails, the next one takes over."
      />
      <ol className="mb-4 flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[13px]" aria-label="Fallback order">
        {draft.order.map((p, i) => (
          <li key={p} className="flex items-center gap-1.5">
            {i > 0 && <ArrowRight className="size-3.5 text-muted-foreground/60" aria-hidden />}
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
                readyNow(p) ? 'border-border bg-card text-foreground' : 'border-dashed border-border text-muted-foreground',
              )}
            >
              <span className="font-mono text-[11px] text-muted-foreground">{i + 1}</span>
              {AI_PROVIDER_LABELS[p]}
              {!readyNow(p) && <span className="text-[11.5px]">· skipped</span>}
            </span>
          </li>
        ))}
        {!firstReady && (
          <li className="ml-1 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-danger">
            <CircleAlert className="size-3.5" /> No provider in the order is ready, so AI features will fail
          </li>
        )}
      </ol>
      <div className="space-y-3">
        {listed.map((p) => {
          const pos = draft.order.indexOf(p);
          return (
            <ProviderCard
              key={p}
              provider={p}
              position={pos}
              count={draft.order.length}
              status={status.get(p)}
              saved={view.settings.models[p]}
              models={draft.models[p]}
              prices={draft.prices}
              ready={readyNow(p)}
              first={p === firstReady}
              onMove={(by) => move(p, by)}
              onInclude={(on) => include(p, on)}
              onChange={(m) => update((d) => ({ ...d, models: { ...d.models, [p]: { ...d.models[p], ...m } } }))}
              onAddPrice={onAddPrice}
            />
          );
        })}
      </div>
    </section>
  );
}

function StatusBadge({ keySet, ready }: { keySet: boolean; ready: boolean }) {
  if (ready)
    return (
      <Badge variant="success" dot>
        Ready
      </Badge>
    );
  if (keySet)
    return (
      <Badge variant="warning" dot>
        Key set, models missing
      </Badge>
    );
  return (
    <Badge variant="outline" dot>
      No API key
    </Badge>
  );
}

function ProviderCard({
  provider,
  position,
  count,
  status,
  saved,
  models,
  prices,
  ready,
  first,
  onMove,
  onInclude,
  onChange,
  onAddPrice,
}: {
  provider: AiProviderName;
  position: number;
  count: number;
  status: AiProviderStatus | undefined;
  saved: AiSettings['models'][AiProviderName];
  models: AiSettings['models'][AiProviderName];
  prices: PriceRow[];
  ready: boolean;
  first: boolean;
  onMove: (by: -1 | 1) => void;
  onInclude: (on: boolean) => void;
  onChange: (m: Partial<AiSettings['models'][AiProviderName]>) => void;
  onAddPrice: (m: string) => void;
}) {
  const inOrder = position >= 0;
  const keySet = status?.keySet ?? false;
  const label = AI_PROVIDER_LABELS[provider];
  const calls = status?.calls30d ?? 0;
  const failures = status?.failures30d ?? 0;
  return (
    <Card className={cn('min-w-0 overflow-hidden', !inOrder && 'bg-card/60')}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 sm:px-5">
        <div className="flex min-w-[min(100%,240px)] flex-1 items-center gap-3">
          <span
            className={cn(
              'grid size-7 shrink-0 place-items-center rounded-lg font-mono text-[12px] font-medium',
              inOrder ? 'bg-muted text-foreground' : 'border border-dashed border-border text-muted-foreground',
            )}
            aria-label={inOrder ? `Position ${position + 1}` : 'Not in the fallback order'}
          >
            {inOrder ? position + 1 : '–'}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={cn('font-display text-[15px] font-semibold tracking-tight', !inOrder && 'text-muted-foreground')}>{label}</h3>
              <StatusBadge keySet={keySet} ready={ready} />
              {first && (
                <Badge variant="brand">
                  <Zap /> Answers first
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground tabular">
              Last 30 days · {formatNumber(calls)} {calls === 1 ? 'call' : 'calls'} ·{' '}
              <span className={cn(failures > 0 && 'text-warning')}>
                {formatNumber(failures)} failed{calls > 0 && failures > 0 ? ` (${((failures / calls) * 100).toFixed(1)}%)` : ''}
              </span>{' '}
              · {money(status?.costUsd30d ?? 0)}
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {inOrder ? (
            <>
              <Button variant="ghost" size="icon-sm" disabled={position === 0} onClick={() => onMove(-1)} aria-label={`Move ${label} up`} title="Move up">
                <ArrowUp />
              </Button>
              <Button variant="ghost" size="icon-sm" disabled={position === count - 1} onClick={() => onMove(1)} aria-label={`Move ${label} down`} title="Move down">
                <ArrowDown />
              </Button>
              <Button variant="ghost" size="sm" disabled={count === 1} onClick={() => onInclude(false)} title="Never try this provider">
                Remove
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => onInclude(true)}>
              <Plus /> Add to order
            </Button>
          )}
        </div>
      </div>

      {!keySet && (
        <div className="mx-4 mb-1 flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[12.5px] text-muted-foreground sm:mx-5">
          <KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Set <code className="font-mono text-[11.5px] text-foreground">{ENV_KEY[provider]}</code> in the server environment and restart the API to use {label}. Until then it’s skipped.
          </span>
        </div>
      )}

      <div className="mt-3 grid gap-px border-t border-border bg-border md:grid-cols-2">
        {TIERS.map((t) => (
          <TierPanel
            key={t.key}
            provider={provider}
            tier={t.key}
            label={t.label}
            hint={t.hint}
            value={models[t.key]}
            effort={models[t.key === 'standard' ? 'standardEffort' : 'advancedEffort']}
            unsaved={models[t.key].trim() !== saved[t.key] || models[`${t.key}Effort`] !== saved[`${t.key}Effort`]}
            priced={!models[t.key].trim() || prices.some((r) => r.model.trim() === models[t.key].trim())}
            keySet={keySet}
            onValue={(v) => onChange({ [t.key]: v })}
            onEffort={(v) => onChange({ [`${t.key}Effort`]: v })}
            onAddPrice={() => onAddPrice(models[t.key].trim())}
          />
        ))}
      </div>
      {provider === 'openai' && (
        <p className="border-t border-border px-4 py-2.5 text-[12px] text-muted-foreground sm:px-5">
          Reasoning effort only applies to reasoning models such as GPT-5. Auto means low for Standard and medium for Advanced.
        </p>
      )}
    </Card>
  );
}

function TierPanel({
  provider,
  tier,
  label,
  hint,
  value,
  effort,
  unsaved,
  priced,
  keySet,
  onValue,
  onEffort,
  onAddPrice,
}: {
  provider: AiProviderName;
  tier: Tier;
  label: string;
  hint: string;
  value: string;
  effort: ReasoningEffortSetting;
  unsaved: boolean;
  priced: boolean;
  keySet: boolean;
  onValue: (v: string) => void;
  onEffort: (v: ReasoningEffortSetting) => void;
  onAddPrice: () => void;
}) {
  const id = `${provider}-${tier}`;
  const test = useMutation({
    mutationFn: () => api.post<AiTestResult>('/platform/ai-settings/test', { provider, tier }),
  });
  return (
    <div className="min-w-0 bg-card px-4 py-4 sm:px-5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium">
          {label}
        </label>
        <span className="truncate text-[12px] text-muted-foreground">{hint}</span>
      </div>
      <div className={cn('grid gap-2', provider === 'openai' && 'grid-cols-[minmax(0,1fr)_148px]')}>
        <Input
          id={id}
          value={value}
          onChange={(e) => onValue(e.target.value)}
          placeholder={`Model name, e.g. ${EXAMPLE_MODEL[provider]}`}
          spellCheck={false}
          autoComplete="off"
          className="h-9 font-mono text-[13px]"
        />
        {provider === 'openai' && (
          <Select value={effort} onValueChange={(v) => onEffort(v as ReasoningEffortSetting)}>
            <SelectTrigger className="h-9 text-[13px]" aria-label={`${label} reasoning effort`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REASONING_EFFORTS.map((e) => (
                <SelectItem key={e} value={e}>
                  {e === 'auto' ? `Auto (${tier === 'standard' ? 'low' : 'medium'})` : EFFORT_LABEL[e]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {provider === 'openai' && <p className="mt-1 text-right text-[11px] text-muted-foreground">Reasoning effort</p>}
      {!priced && (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[12px] text-warning">
          <CircleAlert className="size-3.5" aria-hidden /> No price, so its cost shows as $0.
          <button type="button" onClick={onAddPrice} className="font-medium text-brand hover:underline">
            Add price
          </button>
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => test.mutate()} loading={test.isPending} disabled={!value.trim() && keySet}>
          {!test.isPending && <Play />} Test {label}
        </Button>
        {unsaved && <span className="text-[12px] text-muted-foreground">Tests use the saved model. Save first.</span>}
      </div>
      {test.data && <TestResult r={test.data} onDismiss={() => test.reset()} />}
      {test.error && <TestResult r={null} error={errorMessage(test.error)} onDismiss={() => test.reset()} />}
    </div>
  );
}

function TestResult({ r, error, onDismiss }: { r: AiTestResult | null; error?: string; onDismiss: () => void }) {
  const failed = !r || !r.ok;
  return (
    <div
      role="status"
      className={cn('relative mt-3 rounded-xl border px-3.5 py-3 text-[12.5px]', failed ? 'border-danger/25 bg-danger-soft/50' : 'border-border bg-muted/40')}
    >
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Dismiss test result"
      >
        <X className="size-3.5" />
      </button>
      {failed ? (
        <div className="flex items-start gap-2 pr-5 text-danger">
          <XCircle className="mt-px size-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium">Test failed{r?.model ? ` · ${r.model}` : ''}</p>
            <p className="mt-0.5 text-foreground/80 [overflow-wrap:anywhere]">{r?.error ?? error}</p>
          </div>
        </div>
      ) : (
        <>
          <p className="pr-5 text-[13px] leading-relaxed text-foreground [overflow-wrap:anywhere]">“{r.reply.trim()}”</p>
          <dl className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground tabular">
            <Meta k="Model" v={<span className="font-mono">{r.model}</span>} />
            <Meta k="Latency" v={`${formatNumber(r.latencyMs)} ms`} />
            <Meta k="Tokens" v={`${formatNumber(r.inputTokens)} in · ${formatNumber(r.outputTokens)} out`} />
            <Meta k="Cost" v={tinyMoney(r.costUsd)} />
            <div className="flex items-center gap-1">
              <dt>Structured output</dt>
              <dd>
                {r.structuredOk == null ? (
                  <span className="text-muted-foreground">n/a</span>
                ) : r.structuredOk ? (
                  <Check className="size-3.5 text-success" aria-label="works" />
                ) : (
                  <X className="size-3.5 text-danger" aria-label="failed" />
                )}
              </dd>
            </div>
          </dl>
        </>
      )}
    </div>
  );
}

function Meta({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <dt>{k}</dt>
      <dd className="min-w-0 text-foreground [overflow-wrap:anywhere]">{v}</dd>
    </div>
  );
}

// ------------------------------------------------------------------ prices

const PRICE_GRID = 'sm:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))_32px]';

function PricesSection({
  view,
  draft,
  update,
  onAddPrice,
  focusRow,
  onFocused,
}: {
  view: AiSettingsView;
  draft: Draft;
  update: Update;
  onAddPrice: (m?: string) => void;
  focusRow: string | null;
  onFocused: () => void;
}) {
  const priced = new Set(draft.prices.map((r) => r.model.trim()));
  const missing = view.unpricedModels.filter((m) => !priced.has(m));
  const usedBy = new Map<string, string[]>();
  for (const p of AI_PROVIDERS)
    for (const t of TIERS) {
      const m = draft.models[p][t.key].trim();
      if (m) usedBy.set(m, [...(usedBy.get(m) ?? []), `${AI_PROVIDER_LABELS[p].split(' ')[0]} ${t.label}`]);
    }
  const setRow = (id: string, patch: Partial<PriceRow>) => update((d) => ({ ...d, prices: d.prices.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const removeRow = (id: string) => update((d) => ({ ...d, prices: d.prices.filter((r) => r.id !== id) }));

  return (
    <section aria-labelledby="prices-h">
      <SectionHeading
        id="prices-h"
        title="Prices"
        description={
          <>
            USD per million tokens, used to track what AI costs. Leave cached input blank for 10% of input and cache write blank for 125%. Prices change, so check each
            provider’s pricing page now and then.
          </>
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => onAddPrice()}>
            <Plus /> Add model
          </Button>
        }
      />
      {missing.length > 0 && (
        <div className="mb-3 rounded-xl border border-warning/30 bg-warning-soft/50 px-4 py-3">
          <p className="flex items-center gap-2 text-[13px] font-medium text-warning">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            {missing.length === 1 ? '1 model was' : `${missing.length} models were`} used in the last 30 days without a price, so {missing.length === 1 ? 'its' : 'their'} cost
            shows as $0
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {missing.map((m) => (
              <li key={m} className="flex items-center gap-1 rounded-lg border border-border bg-card py-0.5 pl-2.5 pr-0.5">
                <span className="font-mono text-[12px]">{m}</span>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-brand hover:text-brand" onClick={() => onAddPrice(m)}>
                  <Plus /> Add price
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Card className="min-w-0 overflow-hidden">
        <div className={cn('hidden gap-3 border-b border-border bg-muted/40 px-5 py-2.5 text-[11.5px] font-medium text-muted-foreground sm:grid', PRICE_GRID)}>
          <span>Model</span>
          <span className="text-right">Input</span>
          <span className="text-right">Output</span>
          <span className="text-right">Cached input</span>
          <span className="text-right">Cache write</span>
          <span className="sr-only">Remove</span>
        </div>
        {draft.prices.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">No prices yet. Every call will be costed at $0.</p>
        ) : (
          <ul className="divide-y divide-border">
            {draft.prices.map((r) => (
              <PriceRowView
                key={r.id}
                row={r}
                usedBy={usedBy.get(r.model.trim()) ?? []}
                flagged={view.unpricedModels.includes(r.model.trim())}
                duplicate={!!r.model.trim() && draft.prices.filter((x) => x.model.trim() === r.model.trim()).length > 1}
                autoFocus={focusRow === r.id}
                onFocused={onFocused}
                onChange={(patch) => setRow(r.id, patch)}
                onRemove={() => removeRow(r.id)}
              />
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

function PriceRowView({
  row,
  usedBy,
  flagged,
  duplicate,
  autoFocus,
  onFocused,
  onChange,
  onRemove,
}: {
  row: PriceRow;
  usedBy: string[];
  flagged: boolean;
  duplicate: boolean;
  autoFocus: boolean;
  onFocused: () => void;
  onChange: (p: Partial<PriceRow>) => void;
  onRemove: () => void;
}) {
  const modelRef = React.useRef<HTMLInputElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const liRef = React.useRef<HTMLLIElement>(null);
  React.useEffect(() => {
    if (!autoFocus) return;
    liRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    (row.model ? inputRef : modelRef).current?.focus({ preventScroll: true });
    onFocused();
  }, [autoFocus, row.model, onFocused]);

  const input = parseNum(row.input);
  const base = typeof input === 'number' ? input : null;
  const missingCore = !!row.model.trim() && (!row.input.trim() || !row.output.trim());
  return (
    <li ref={liRef} className={cn('grid grid-cols-2 gap-x-3 gap-y-2 px-4 py-3 sm:items-start sm:px-5', PRICE_GRID, flagged && 'bg-warning-soft/30')}>
      <div className="col-span-2 flex min-w-0 items-start gap-2 sm:col-span-1">
        <div className="min-w-0 flex-1">
          <Input
            ref={modelRef}
            value={row.model}
            onChange={(e) => onChange({ model: e.target.value })}
            placeholder="model-name"
            aria-label="Model"
            invalid={duplicate}
            spellCheck={false}
            autoComplete="off"
            className="h-9 font-mono text-[13px]"
          />
          {(usedBy.length > 0 || flagged || duplicate) && (
            <p className="mt-1 flex flex-wrap gap-x-2 text-[11.5px] text-muted-foreground">
              {duplicate && <span className="text-danger">Priced twice</span>}
              {flagged && <span className="text-warning">Used without a price</span>}
              {usedBy.length > 0 && <span>{usedBy.join(' · ')}</span>}
            </p>
          )}
        </div>
        <Button variant="ghost" size="icon-sm" className="mt-0.5 sm:hidden" onClick={onRemove} aria-label={`Remove ${row.model || 'row'}`}>
          <Trash2 />
        </Button>
      </div>
      <PriceInput label="Input" ref={inputRef} value={row.input} invalid={missingCore && !row.input.trim()} onChange={(v) => onChange({ input: v })} />
      <PriceInput label="Output" value={row.output} invalid={missingCore && !row.output.trim()} onChange={(v) => onChange({ output: v })} />
      <PriceInput
        label="Cached input"
        value={row.cachedInput}
        placeholder={base != null ? short(base * 0.1) : '10%'}
        onChange={(v) => onChange({ cachedInput: v })}
      />
      <PriceInput
        label="Cache write"
        value={row.cacheWrite}
        placeholder={base != null ? short(base * 1.25) : '125%'}
        onChange={(v) => onChange({ cacheWrite: v })}
      />
      <Button variant="ghost" size="icon-sm" className="mt-0.5 hidden text-muted-foreground hover:text-danger sm:inline-flex" onClick={onRemove} aria-label={`Remove ${row.model || 'row'}`}>
        <Trash2 />
      </Button>
    </li>
  );
}

const PriceInput = React.forwardRef<
  HTMLInputElement,
  { label: string; value: string; placeholder?: string; invalid?: boolean; onChange: (v: string) => void }
>(({ label, value, placeholder, invalid, onChange }, ref) => (
  <label className="block min-w-0">
    <span className="mb-1 block text-[11.5px] text-muted-foreground sm:sr-only">{label}</span>
    <span className="relative block">
      <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-[12px] text-muted-foreground">$</span>
      <Input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
        inputMode="decimal"
        placeholder={placeholder}
        invalid={invalid}
        aria-label={label}
        className="h-9 pl-5 text-right font-mono text-[13px] tabular placeholder:text-muted-foreground/50"
      />
    </span>
  </label>
));
PriceInput.displayName = 'PriceInput';

// ------------------------------------------------------------------ caching

function CachingSection({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <section>
      <Card className="flex items-start gap-4 px-5 py-4">
        <div className="min-w-0 flex-1">
          <label htmlFor="prompt-caching" className="font-display text-[15px] font-semibold tracking-tight">
            Prompt caching
          </label>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Reuses repeated instructions and conversation history so Claude bills them at the cached-input price. OpenAI caches on its own.
          </p>
        </div>
        <Switch id="prompt-caching" checked={value} onCheckedChange={onChange} className="mt-1" />
      </Card>
    </section>
  );
}

// ------------------------------------------------------------------ save bar

function SaveBar({
  issues,
  server,
  saving,
  canSave,
  onDiscard,
  onSave,
}: {
  issues: string[];
  server: boolean;
  saving: boolean;
  canSave: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <div
      className={cn(
        'glass sticky bottom-3 z-20 flex flex-col gap-3 rounded-2xl border px-4 py-3 shadow-pop sm:flex-row sm:items-center',
        issues.length ? 'border-danger/40' : 'border-brand/40',
      )}
    >
      <div className="min-w-0 flex-1 text-[13px]">
        {issues.length ? (
          <div className="flex items-start gap-1.5 text-danger">
            <AlertTriangle className="mt-px size-4 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="font-medium [overflow-wrap:anywhere]">
                {server ? 'The server refused these settings: ' : ''}
                {issues[0]}
              </p>
              {issues.length > 1 && <p className="text-[12px] opacity-80">and {issues.length - 1} more to fix</p>}
            </div>
          </div>
        ) : (
          <span className="inline-flex items-center gap-2 font-medium">
            <span className="size-2 rounded-full bg-brand" aria-hidden /> Unsaved changes to AI models
          </span>
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
          <RotateCcw /> Discard
        </Button>
        <Button size="sm" loading={saving} disabled={!canSave} onClick={onSave}>
          {!saving && <Save />} Save changes
        </Button>
      </div>
    </div>
  );
}
