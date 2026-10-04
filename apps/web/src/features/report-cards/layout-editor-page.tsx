import {
  REPORT_COLUMNS,
  REPORT_STUDENT_FIELDS,
  type ReportColumn,
  type ReportStudentField,
  type ReportTemplateConfig,
  type ReportTemplateRow,
} from '@aischool/shared';
import { AlertCircle, ArrowDown, ArrowUp, Check, Eye, FileImage, LayoutTemplate, Plus, Save, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Page } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, errorMessage, type FieldError } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { usePrivateFileUrl, useReportTemplates, useSaveReportTemplate } from '../assessment/api';
import { BackLink, DetailSkeleton } from '../planning/ui';
import { columnHeading, ReportCardDocument } from './card-document';
import { usePreviewView } from './layouts-page';
import { ScaledSheet } from './preview-frame';

interface Draft {
  name: string;
  isDefault: boolean;
  config: ReportTemplateConfig;
}

export default function LayoutEditorPage() {
  const { templateId = 'new' } = useParams();
  const [params] = useSearchParams();
  const from = params.get('from');
  const query = useReportTemplates();

  if (query.isLoading) {
    return (
      <Page className="max-w-7xl">
        <DetailSkeleton />
      </Page>
    );
  }
  if (!query.data) {
    return (
      <Page className="max-w-7xl">
        <BackLink to="/report-cards/layout">Report card layout</BackLink>
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </Page>
    );
  }
  const { templates, standard } = query.data;
  let row: ReportTemplateRow | undefined;
  let initial: Draft;
  if (templateId === 'new') {
    const base = from ? templates.find((t) => t.id === from) : undefined;
    initial = base
      ? { name: `Copy of ${base.name}`.slice(0, 80), isDefault: false, config: base.config }
      : { name: templates.length ? 'New layout' : 'Our report card', isDefault: templates.length === 0, config: standard };
  } else {
    row = templates.find((t) => t.id === templateId);
    if (!row) {
      return (
        <Page className="max-w-7xl">
          <BackLink to="/report-cards/layout">Report card layout</BackLink>
          <EmptyState icon={LayoutTemplate} title="Layout not found" description="It may have been deleted." />
        </Page>
      );
    }
    initial = { name: row.name, isDefault: row.isDefault, config: row.config };
  }
  // Remount when switching layouts (or after a new one is first saved).
  return <Editor key={row?.id ?? `new-${from ?? ''}`} row={row} initial={initial} firstLayout={templates.length === 0} />;
}

const PATH_LABELS: [string, string][] = [
  ['name', 'Layout name'],
  ['config.header.title', 'Report title'],
  ['config.header.extraLine', 'Extra line'],
  ['config.header', 'Header'],
  ['config.accentColor', 'Accent colour'],
  ['config.studentFields', 'Student details'],
  ['config.columnLabels', 'Column headings'],
  ['config.columns', 'Subject table columns'],
  ['config.affective', 'Affective section'],
  ['config.psychomotor', 'Psychomotor section'],
  ['config.ratingScale', 'Rating scale'],
  ['config.comments', 'Comment labels'],
  ['config.signatures', 'Signatures'],
  ['config.footerNote', 'Footer note'],
  ['config.paper', 'Paper size'],
];
const pathLabel = (p: string) => PATH_LABELS.find(([k]) => p === k || p.startsWith(`${k}.`))?.[1] ?? p;

const ACCENTS = ['#1e3a8a', '#0f766e', '#166534', '#7f1d1d', '#6b21a8', '#9a3412', '#0f172a'];

function Editor({ row, initial, firstLayout }: { row?: ReportTemplateRow; initial: Draft; firstLayout: boolean }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const canEdit = useCan('results.publish');
  const save = useSaveReportTemplate();
  const [saved, setSaved] = useState<Draft>(initial);
  const [draft, setDraft] = useState<Draft>(initial);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const cfg = draft.config;
  const dirty = !row || JSON.stringify(draft) !== JSON.stringify(saved);
  useDocumentTitle(`${draft.name || 'Layout'} · Report card layout`);

  const sample = usePrivateFileUrl(row?.sampleFileId);
  const [pane, setPane] = useState<'layout' | 'sample' | 'both'>(row?.sampleFileId && params.get('sample') ? 'both' : 'layout');

  const set = (patch: Partial<ReportTemplateConfig>) => setDraft((d) => ({ ...d, config: { ...d.config, ...patch } }));
  const view = usePreviewView(cfg);

  useEffect(() => {
    if (!dirty || !canEdit) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, canEdit]);

  const submit = () => {
    setErrors([]);
    save.mutate(
      { id: row?.id, input: draft },
      {
        onSuccess: (t) => {
          const next = { name: t.name, isDefault: t.isDefault, config: t.config };
          setSaved(next);
          setDraft(next);
          toast.success(t.isDefault ? 'Layout saved — report cards now use it' : 'Layout saved');
          if (!row) navigate(`/report-cards/layout/${t.id}`, { replace: true });
        },
        onError: (e) => {
          if (e instanceof ApiError && e.errors.length) setErrors(e.errors);
          else setErrors([{ path: '', message: errorMessage(e) }]);
          toast.error(e instanceof ApiError && e.errors.length ? 'Please fix the problems listed at the top' : errorMessage(e));
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
      },
    );
  };

  const preview = (
    <ScaledSheet>
      <ReportCardDocument v={view} preview className="shadow-none" />
    </ScaledSheet>
  );
  const sampleImg = row?.sampleFileId ? (
    sample.data ? (
      sample.data.type === 'application/pdf' ? (
        <iframe src={sample.data.url} title="Your sample report card" className="h-[70vh] w-full rounded-lg border border-border bg-card" />
      ) : (
        <a href={sample.data.url} target="_blank" rel="noreferrer" title="Open full size">
          <img src={sample.data.url} alt="Your sample report card" className="w-full rounded-lg border border-border bg-card object-contain" />
        </a>
      )
    ) : sample.error ? (
      <p className="rounded-lg border border-border p-4 text-[13px] text-muted-foreground">Couldn’t load your sample: {errorMessage(sample.error)}</p>
    ) : (
      <div className="h-80 animate-pulse rounded-lg bg-muted" />
    )
  ) : null;

  return (
    <Page className="max-w-[1500px]">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <BackLink to="/report-cards/layout">Report card layout</BackLink>
        <div className="flex flex-wrap items-center gap-2">
          <a href="#layout-preview" className="text-[13px] font-medium text-brand underline-offset-4 hover:underline lg:hidden">
            <Eye className="mr-1 inline size-4" /> Preview
          </a>
          {canEdit && (
            <>
              {row && dirty && (
                <Button variant="ghost" onClick={() => (setDraft(saved), setErrors([]))}>
                  <X /> Discard changes
                </Button>
              )}
              <Button onClick={submit} loading={save.isPending} disabled={!dirty}>
                {!save.isPending && <Save />} {row ? (dirty ? 'Save changes' : 'Saved') : 'Save layout'}
              </Button>
            </>
          )}
        </div>
      </div>

      {errors.length > 0 && (
        <div role="alert" className="mb-4 rounded-xl border border-danger/30 bg-danger-soft/60 p-3 text-[13px]">
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-danger">
            <AlertCircle className="size-4" /> This layout couldn’t be saved
          </p>
          <ul className="list-disc space-y-0.5 pl-6">
            {errors.map((e, i) => (
              <li key={i}>
                {e.path && <span className="font-medium">{pathLabel(e.path)}: </span>}
                {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* ------------------------------------------------------------ editor */}
        <fieldset disabled={!canEdit} className="min-w-0 space-y-4">
          {!canEdit && <p className="rounded-lg bg-muted px-3 py-2 text-[13px] text-muted-foreground">You can view this layout. Only staff who publish results can change it.</p>}
          <Section title="Layout">
            <Field label="Name" htmlFor="tpl-name" hint="Only staff see this name.">
              <Input id="tpl-name" value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            {row && saved.isDefault ? (
              <p className="flex items-center gap-2 rounded-lg border border-success/30 bg-success-soft/50 px-3 py-2 text-[13px]">
                <Check className="size-4 text-success" /> Report cards print with this layout. To switch, choose “Use this layout” on another one.
              </p>
            ) : (
              <ToggleRow
                label="Use this layout for all report cards"
                hint={firstLayout && !row ? 'Your first layout is used automatically.' : undefined}
                checked={draft.isDefault || (firstLayout && !row)}
                onChange={(v) => setDraft({ ...draft, isDefault: v })}
                disabled={firstLayout && !row}
              />
            )}
            <Field label="Paper">
              <Select value={cfg.paper} onValueChange={(v) => set({ paper: v as ReportTemplateConfig['paper'] })}>
                <SelectTrigger aria-label="Paper size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A4">A4</SelectItem>
                  <SelectItem value="LETTER">US Letter</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </Section>

          <Section title="Heading">
            <Field label="Report title" htmlFor="tpl-title" hint="e.g. “Terminal Report Sheet” or “Continuous Assessment Report”">
              <Input id="tpl-title" value={cfg.header.title} maxLength={80} onChange={(e) => set({ header: { ...cfg.header, title: e.target.value } })} />
            </Field>
            <Field label="Accent colour" htmlFor="tpl-accent">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="tpl-accent"
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(cfg.accentColor) ? cfg.accentColor : '#1e3a8a'}
                  onChange={(e) => set({ accentColor: e.target.value })}
                  className="h-9 w-12 cursor-pointer rounded-md border border-border bg-card p-1"
                />
                <Input aria-label="Accent colour (hex)" value={cfg.accentColor} maxLength={7} className="w-28 font-mono" onChange={(e) => set({ accentColor: e.target.value.trim() })} />
                <div className="flex gap-1.5">
                  {ACCENTS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Use ${c}`}
                      onClick={() => set({ accentColor: c })}
                      className={cn('size-6 rounded-full border-2 border-card ring-1 ring-border transition-transform hover:scale-110', cfg.accentColor.toLowerCase() === c && 'ring-2 ring-foreground')}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
            </Field>
            <div className="grid gap-2 sm:grid-cols-3">
              <ToggleRow label="School logo" checked={cfg.header.showLogo} onChange={(v) => set({ header: { ...cfg.header, showLogo: v } })} />
              <ToggleRow label="Motto" checked={cfg.header.showMotto} onChange={(v) => set({ header: { ...cfg.header, showMotto: v } })} />
              <ToggleRow label="Address" checked={cfg.header.showAddress} onChange={(v) => set({ header: { ...cfg.header, showAddress: v } })} />
            </div>
            <Field label="Extra line" htmlFor="tpl-extra" optional hint="Shown under the school name, e.g. “Approved by the Lagos State Ministry of Education”">
              <Input id="tpl-extra" value={cfg.header.extraLine ?? ''} maxLength={160} onChange={(e) => set({ header: { ...cfg.header, extraLine: e.target.value || null } })} />
            </Field>
          </Section>

          <Section title="Student details" description="Tick what your card shows and put it in order. The learner’s name always comes first.">
            <OrderedChecklist
              options={REPORT_STUDENT_FIELDS}
              selected={cfg.studentFields}
              max={14}
              onChange={(studentFields) => set({ studentFields: studentFields as ReportStudentField[] })}
            />
          </Section>

          <Section title="Subject table" description="The columns after the subject name, in order. Give any column your own heading.">
            <OrderedChecklist
              options={REPORT_COLUMNS}
              selected={cfg.columns}
              max={11}
              min={1}
              onChange={(columns) => set({ columns: columns as ReportColumn[] })}
              extra={(key) =>
                key === 'components' ? null : (
                  <Input
                    aria-label={`Heading for ${REPORT_COLUMNS[key as ReportColumn]}`}
                    placeholder={columnHeading({ ...cfg, columnLabels: {} }, key as ReportColumn)}
                    value={cfg.columnLabels[key] ?? ''}
                    maxLength={30}
                    className="h-8 w-full text-[13px] sm:w-36"
                    onChange={(e) => {
                      const columnLabels = { ...cfg.columnLabels };
                      if (e.target.value) columnLabels[key] = e.target.value;
                      else delete columnLabels[key];
                      set({ columnLabels });
                    }}
                  />
                )
              }
            />
            <p className="text-[12px] text-muted-foreground">
              “Assessment components” adds one column per CA and exam from your grading settings. “Term totals” adds a column for each term this session and the
              cumulative average.
            </p>
          </Section>

          {(['affective', 'psychomotor'] as const).map((key) => (
            <Section key={key} title={key === 'affective' ? 'Affective domain (behaviour)' : 'Psychomotor skills'}>
              <ToggleRow
                label="Show on the card"
                checked={cfg[key].enabled}
                onChange={(v) => set({ [key]: { ...cfg[key], enabled: v } } as Partial<ReportTemplateConfig>)}
              />
              {cfg[key].enabled && (
                <>
                  <Field label="Section title" htmlFor={`tpl-${key}-title`}>
                    <Input id={`tpl-${key}-title`} value={cfg[key].title} maxLength={60} onChange={(e) => set({ [key]: { ...cfg[key], title: e.target.value } } as Partial<ReportTemplateConfig>)} />
                  </Field>
                  <StringList
                    label="Traits"
                    items={cfg[key].traits}
                    max={20}
                    addLabel="Add a trait"
                    placeholder={key === 'affective' ? 'e.g. Punctuality' : 'e.g. Handwriting'}
                    onChange={(traits) => set({ [key]: { ...cfg[key], traits } } as Partial<ReportTemplateConfig>)}
                  />
                </>
              )}
            </Section>
          ))}

          <Section title="Rating scale" description="The key for the behaviour and skills ratings, highest first.">
            <div className="space-y-2">
              {cfg.ratingScale.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    aria-label={`Rating ${i + 1} value`}
                    value={Number.isNaN(r.value) ? '' : r.value}
                    className="w-20 tabular"
                    onChange={(e) => set({ ratingScale: cfg.ratingScale.map((x, j) => (j === i ? { ...x, value: e.target.value === '' ? NaN : Math.round(Number(e.target.value)) } : x)) })}
                  />
                  <Input
                    aria-label={`Rating ${i + 1} label`}
                    value={r.label}
                    maxLength={30}
                    onChange={(e) => set({ ratingScale: cfg.ratingScale.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove rating ${r.label}`}
                    disabled={cfg.ratingScale.length <= 2}
                    onClick={() => set({ ratingScale: cfg.ratingScale.filter((_, j) => j !== i) })}
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </div>
            {cfg.ratingScale.length < 10 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const low = Math.min(...cfg.ratingScale.map((x) => (Number.isNaN(x.value) ? 10 : x.value)));
                  set({ ratingScale: [...cfg.ratingScale, { value: Math.max(0, low - 1), label: '' }] });
                }}
              >
                <Plus /> Add a rating
              </Button>
            )}
          </Section>

          <Section title="Grading key and comments">
            <ToggleRow label="Print the grading key (A1 75–100 …)" checked={cfg.showGradingKey} onChange={(v) => set({ showGradingKey: v })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Teacher’s comment heading" htmlFor="tpl-tc">
                <Input id="tpl-tc" value={cfg.comments.teacherLabel} maxLength={60} onChange={(e) => set({ comments: { ...cfg.comments, teacherLabel: e.target.value } })} />
              </Field>
              <Field label="Principal’s comment heading" htmlFor="tpl-pc">
                <Input id="tpl-pc" value={cfg.comments.principalLabel} maxLength={60} onChange={(e) => set({ comments: { ...cfg.comments, principalLabel: e.target.value } })} />
              </Field>
            </div>
          </Section>

          <Section title="Signatures" description="Lines for signing at the bottom of the card (up to four).">
            <StringList label="Signed by" items={cfg.signatures} max={4} addLabel="Add a signature" placeholder="e.g. Parent/Guardian" onChange={(signatures) => set({ signatures })} />
          </Section>

          <Section title="Footer note">
            <Textarea
              aria-label="Footer note"
              rows={2}
              maxLength={300}
              placeholder="e.g. Fees for next term must be paid before resumption."
              value={cfg.footerNote ?? ''}
              onChange={(e) => set({ footerNote: e.target.value || null })}
            />
          </Section>
        </fieldset>

        {/* ------------------------------------------------------------ preview */}
        <div id="layout-preview" className="min-w-0 scroll-mt-4 lg:sticky lg:top-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="font-display text-[15px] font-semibold">Preview</h2>
            <Badge variant="outline">Sample learner</Badge>
            {row?.sampleFileId && (
              <div role="tablist" aria-label="Compare with your sample" className="ml-auto inline-flex rounded-lg border border-border bg-muted/60 p-0.5 text-[12.5px]">
                {(
                  [
                    ['layout', 'Our layout'],
                    ['sample', 'Your sample'],
                    ['both', 'Side by side'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={pane === k}
                    onClick={() => setPane(k)}
                    className={cn('rounded-md px-2.5 py-1 font-medium text-muted-foreground transition-colors', pane === k && 'bg-card text-foreground shadow-xs')}
                  >
                    {k === 'sample' && <FileImage className="mr-1 inline size-3.5" />}
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="scrollbar-thin rounded-2xl border border-border bg-muted/40 p-2 sm:p-4 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
            {pane === 'both' && sampleImg ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="min-w-0">{preview}</div>
                <div className="min-w-0">{sampleImg}</div>
              </div>
            ) : pane === 'sample' && sampleImg ? (
              sampleImg
            ) : (
              preview
            )}
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            The preview uses made-up marks with your school’s name and grading settings. {canEdit && dirty && <span className="font-medium text-warning">Not saved yet.</span>}
            {canEdit && !dirty && row && (
              <span className="inline-flex items-center gap-1 text-success">
                <Check className="size-3.5" /> Saved
              </span>
            )}
          </p>
        </div>
      </div>
    </Page>
  );
}

// ------------------------------------------------------------------ pieces

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="space-y-3 p-4 sm:p-5">
      <div>
        <h2 className="font-display text-[15px] font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{description}</p>}
      </div>
      {children}
    </Card>
  );
}

function ToggleRow({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
      <span className="min-w-0 text-[13px]">
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-[12px] text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}

/** Ticked options first, in their chosen order (with up/down), then the rest. */
function OrderedChecklist({
  options,
  selected,
  onChange,
  max,
  min = 0,
  extra,
}: {
  options: Record<string, string>;
  selected: string[];
  onChange: (next: string[]) => void;
  max: number;
  min?: number;
  extra?: (key: string) => ReactNode;
}) {
  const rest = Object.keys(options).filter((k) => !selected.includes(k));
  const move = (i: number, by: number) => {
    const next = [...selected];
    const [x] = next.splice(i, 1);
    next.splice(i + by, 0, x);
    onChange(next);
  };
  const rowCls = 'flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-1.5 sm:flex-nowrap';
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
      {selected.map((k, i) => (
        <li key={k} className={cn(rowCls, 'bg-card')}>
          <Checkbox
            checked
            aria-label={`Show ${options[k]}`}
            disabled={selected.length <= min}
            onCheckedChange={() => onChange(selected.filter((x) => x !== k))}
          />
          <span className="w-5 shrink-0 text-center text-[11px] tabular text-muted-foreground">{i + 1}</span>
          <span className="min-w-0 flex-1 text-[13px] font-medium">{options[k]}</span>
          {extra && <span className="order-last basis-full pl-12 sm:order-none sm:basis-auto sm:pl-0">{extra(k)}</span>}
          <span className="flex shrink-0">
            <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move ${options[k]} up`} disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUp />
            </Button>
            <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move ${options[k]} down`} disabled={i === selected.length - 1} onClick={() => move(i, 1)}>
              <ArrowDown />
            </Button>
          </span>
        </li>
      ))}
      {rest.map((k) => (
        <li key={k} className={cn(rowCls, 'bg-muted/30')}>
          <Checkbox checked={false} aria-label={`Show ${options[k]}`} disabled={selected.length >= max} onCheckedChange={() => onChange([...selected, k])} />
          <span className="w-5 shrink-0" />
          <span className="min-w-0 flex-1 text-[13px] text-muted-foreground">{options[k]}</span>
        </li>
      ))}
    </ul>
  );
}

function StringList({
  label,
  items,
  max,
  addLabel,
  placeholder,
  onChange,
}: {
  label: string;
  items: string[];
  max: number;
  addLabel: string;
  placeholder: string;
  onChange: (next: string[]) => void;
}) {
  const move = (i: number, by: number) => {
    const next = [...items];
    const [x] = next.splice(i, 1);
    next.splice(i + by, 0, x);
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium">
        {label} <span className="font-normal text-muted-foreground">({items.length} of {max})</span>
      </p>
      {items.map((t, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            aria-label={`${label} ${i + 1}`}
            value={t}
            maxLength={60}
            placeholder={placeholder}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (items.length < max) onChange([...items.slice(0, i + 1), '', ...items.slice(i + 1)]);
              }
            }}
          />
          <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move ${t || 'item'} up`} disabled={i === 0} onClick={() => move(i, -1)}>
            <ArrowUp />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move ${t || 'item'} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
            <ArrowDown />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${t || 'item'}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <X />
          </Button>
        </div>
      ))}
      {items.length < max && (
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...items, ''])}>
          <Plus /> {addLabel}
        </Button>
      )}
    </div>
  );
}
