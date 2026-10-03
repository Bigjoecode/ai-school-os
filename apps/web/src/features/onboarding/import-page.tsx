import { IMPORT_FIELDS, type ImportKind, type ImportPreview, type ImportRequest, type ImportResult } from '@aischool/shared';
import {
  ArrowLeft,
  Check,
  Download,
  FileSpreadsheet,
  FileUp,
  Lightbulb,
  Lock,
  Upload,
  X,
} from 'lucide-react';
import { type DragEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useStructure } from '@/features/academics/api';
import { useAssessmentSettings } from '@/features/assessment/api';
import { useCan } from '@/lib/auth-store';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { downloadTemplate, importErrorMessage, useCommitImport, useImportKinds, usePreviewImport } from './api';
import { ImportDone, ImportReview, InlineNote } from './import-review';
import { KIND_META, type LoadedFile } from './meta';

const MAX_BYTES = 5 * 1024 * 1024;


export default function ImportPage() {
  const kinds = useImportKinds();
  const [params, setParams] = useSearchParams();
  const wanted = params.get('kind')?.toUpperCase() as ImportKind | undefined;
  const kind = wanted && kinds.includes(wanted) ? wanted : kinds[0];

  if (!kind) {
    return (
      <Page>
        <EmptyState icon={Lock} title="You can't import data" description="Importing students, staff or results needs a permission your roles don't have. Ask a school administrator." />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Import data"
        description="Bring in your existing records from a spreadsheet. You'll check a preview of every row before anything is saved."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/setup">
              <ArrowLeft /> Setup checklist
            </Link>
          </Button>
        }
      />
      {kinds.length > 1 && (
        <div role="tablist" aria-label="What to import" className="no-scrollbar mb-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-muted/60 p-1">
          {kinds.map((k) => {
            const Icon = KIND_META[k].icon;
            return (
              <button
                key={k}
                role="tab"
                type="button"
                aria-selected={k === kind}
                onClick={() => setParams({ kind: k }, { replace: true })}
                className={cn(
                  'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  k === kind ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {KIND_META[k].tab}
              </button>
            );
          })}
        </div>
      )}
      <ImportFlow key={kind} kind={kind} />
    </Page>
  );
}

// ------------------------------------------------------------------ flow

type Stage = 'prepare' | 'review' | 'done';

function ImportFlow({ kind }: { kind: ImportKind }) {
  const [stage, setStage] = useState<Stage>('prepare');
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [options, setOptions] = useState<ImportRequest['options']>({ updateExisting: false, createMissingArms: false, createLogins: false, overwriteScores: false });
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const previewM = usePreviewImport();
  const commitM = useCommitImport();
  const { data: structure } = useStructure();

  // Results go into the current term unless the user picks another.
  const terms = useMemo(
    () => (structure?.sessions ?? []).flatMap((s) => s.terms.map((t) => ({ id: t.id, label: `${s.name} · ${t.name}`, isCurrent: t.isCurrent && s.isCurrent, startsOn: t.startsOn }))).sort((a, b) => b.startsOn.localeCompare(a.startsOn)),
    [structure],
  );
  useEffect(() => {
    if (kind === 'RESULTS' && !options.termId && terms.length) setOptions((o) => ({ ...o, termId: (terms.find((t) => t.isCurrent) ?? terms[0])!.id }));
  }, [kind, terms, options.termId]);

  const req = (): ImportRequest | null => (file ? { kind, csv: file.text, options } : null);

  const runPreview = () => {
    const r = req();
    if (!r) return;
    commitM.reset();
    previewM.mutate(r, {
      onSuccess: (p) => {
        setPreview(p);
        setStage('review');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    });
  };
  const runCommit = () => {
    const r = req();
    if (!r) return;
    commitM.mutate(r, {
      onSuccess: (res) => {
        setResult(res);
        setStage('done');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    });
  };
  const restart = () => {
    setStage('prepare');
    setFile(null);
    setPreview(null);
    setResult(null);
    previewM.reset();
    commitM.reset();
  };

  const step = stage === 'done' ? 4 : stage === 'review' ? 3 : file ? 2 : 1;

  return (
    <div className="space-y-6">
      <Stepper step={step} />
      {stage === 'prepare' && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] [&>*]:min-w-0">
          <PrepareCard kind={kind} />
          <UploadCard
            kind={kind}
            file={file}
            setFile={(f) => {
              setFile(f);
              previewM.reset();
            }}
            options={options}
            setOptions={setOptions}
            terms={terms}
            onPreview={runPreview}
            pending={previewM.isPending}
            error={previewM.error}
          />
        </div>
      )}
      {stage === 'review' && preview && file && (
        <ImportReview
          kind={kind}
          file={file}
          preview={preview}
          onBack={() => {
            setStage('prepare');
            commitM.reset();
          }}
          onCommit={runCommit}
          committing={commitM.isPending}
          error={commitM.error}
        />
      )}
      {stage === 'done' && result && <ImportDone kind={kind} result={result} onRestart={restart} />}
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  const steps = ['Prepare', 'Upload', 'Review', 'Done'];
  return (
    <ol className="flex items-center gap-2 text-[12.5px]" aria-label="Import steps">
      {steps.map((s, i) => {
        const n = i + 1;
        const state = n < step ? 'done' : n === step ? 'current' : 'todo';
        return (
          <li key={s} className="flex min-w-0 items-center gap-2" aria-current={state === 'current' ? 'step' : undefined}>
            <span
              className={cn(
                'grid size-5 shrink-0 place-items-center rounded-full text-[10.5px] font-semibold',
                state === 'done' && 'bg-brand text-white',
                state === 'current' && 'bg-foreground text-background',
                state === 'todo' && 'border border-border-strong text-muted-foreground',
              )}
            >
              {state === 'done' ? <Check className="size-3" strokeWidth={3} /> : n}
            </span>
            <span className={cn('truncate font-medium', state === 'todo' ? 'text-muted-foreground' : 'text-foreground', state !== 'current' && 'hidden sm:inline')}>{s}</span>
            {n < steps.length && <span className="h-px w-4 shrink-0 bg-border sm:w-8" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

// ------------------------------------------------------------------ step 1: prepare

function PrepareCard({ kind }: { kind: ImportKind }) {
  const [busy, setBusy] = useState(false);
  const { components } = useAssessmentSettings();
  const fields = [
    ...IMPORT_FIELDS[kind].map((f) => ({ key: f.field, label: f.label, required: !!f.required, example: f.example, aliases: f.aliases })),
    ...(kind === 'RESULTS' ? components.map((c) => ({ key: c.key, label: c.name, required: false, example: `0–${c.maxScore}`, aliases: [] as string[] })) : []),
  ];
  const download = async () => {
    setBusy(true);
    try {
      await downloadTemplate(kind);
    } catch (e) {
      toast.error(importErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <div className="flex flex-col gap-3 p-5 pb-4 sm:p-6 sm:pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-[16px] font-semibold tracking-tight">1. Prepare your file</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{KIND_META[kind].intro}</p>
          </div>
        </div>
        <div>
          <Button variant="outline" size="sm" onClick={() => void download()} loading={busy}>
            <Download /> Download template
          </Button>
        </div>
      </div>
      <div className="border-t border-border px-5 py-4 sm:px-6">
        <p className="mb-2.5 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Columns we recognise</p>
        <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2 [&>*]:min-w-0">
          {fields.map((f) => (
            <li key={f.key} className="min-w-0" title={f.aliases.length ? `Also recognised: ${f.aliases.join(', ')}` : undefined}>
              <span className="flex items-center gap-1.5 text-[13px] font-medium">
                <span className="truncate">{f.label}</span>
                {f.required && (
                  <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                    Required
                  </Badge>
                )}
              </span>
              {f.example && <span className="block truncate font-mono text-[11.5px] text-muted-foreground">{f.example}</span>}
            </li>
          ))}
        </ul>
        {kind === 'RESULTS' && <p className="mt-3 text-[12px] text-muted-foreground">Include at least one score column. Leave a score blank to skip that part.</p>}
        <p className="mt-3 text-[12px] text-muted-foreground">Column order doesn’t matter, and common spellings like “Adm No”, “Surname” or “Sex” are understood.</p>
      </div>
      <div className="m-5 mt-0 flex items-start gap-2.5 rounded-xl bg-info-soft px-3.5 py-3 text-[12.5px] leading-relaxed sm:m-6 sm:mt-0">
        <Lightbulb className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
        <p className="text-foreground/85">
          <span className="font-medium text-foreground">Using Excel or Google Sheets?</span> Save the sheet as CSV first. In Excel: <b>File → Save as → CSV UTF-8</b>. In Google Sheets: <b>File → Download → Comma-separated values</b>.
        </p>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ step 2: upload

async function readCsv(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buf);
  // Plain "CSV" from older Excel is Windows-1252; fall back so names like "Adébáyọ̀" or "₦" survive.
  if (utf8.includes('�')) {
    try {
      return new TextDecoder('windows-1252').decode(buf);
    } catch {
      return utf8;
    }
  }
  return utf8.replace(/^﻿/, '');
}

function countRows(text: string) {
  return Math.max(0, text.split(/\r\n|\n|\r/).filter((l) => l.replace(/[,;\t\s"]/g, '').length > 0).length - 1);
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

interface UploadProps {
  kind: ImportKind;
  file: LoadedFile | null;
  setFile: (f: LoadedFile | null) => void;
  options: ImportRequest['options'];
  setOptions: (fn: (o: ImportRequest['options']) => ImportRequest['options']) => void;
  terms: { id: string; label: string; isCurrent: boolean }[];
  onPreview: () => void;
  pending: boolean;
  error: unknown;
}

function UploadCard({ kind, file, setFile, options, setOptions, terms, onPreview, pending, error }: UploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const canLogins = useCan('users.manage');

  const take = async (f: File | undefined) => {
    setFileError(null);
    if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (['xlsx', 'xls', 'xlsm', 'ods', 'numbers'].includes(ext)) {
      setFileError('That’s a spreadsheet file, not a CSV. Open it, choose File → Save as → CSV UTF-8, then upload the .csv file.');
      return;
    }
    if (!['csv', 'txt', 'tsv'].includes(ext) && !f.type.includes('csv') && !f.type.startsWith('text/')) {
      setFileError('Choose a .csv file.');
      return;
    }
    if (f.size > MAX_BYTES) {
      setFileError(`This file is ${formatBytes(f.size)}; the limit is 5 MB. Split it into smaller files (for example, one per class) and import them one after another.`);
      return;
    }
    if (f.size === 0) {
      setFileError('This file is empty.');
      return;
    }
    const text = await readCsv(f);
    const rows = countRows(text);
    if (rows === 0) {
      setFileError('This file has a header row but no rows under it.');
      return;
    }
    setFile({ name: f.name, size: f.size, text, rows });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    void take(e.dataTransfer.files[0]);
  };

  const opt = (key: keyof ImportRequest['options'], label: string, hint: ReactNode, disabled?: boolean) => (
    <div className={cn('flex items-start justify-between gap-4 py-3', disabled && 'opacity-60')}>
      <div className="min-w-0">
        <Label htmlFor={`opt-${key}`} className="text-[13px] font-medium leading-snug">
          {label}
        </Label>
        <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{hint}</p>
      </div>
      <Switch id={`opt-${key}`} checked={!!options[key]} disabled={disabled} onCheckedChange={(v) => setOptions((o) => ({ ...o, [key]: v }))} className="mt-0.5" />
    </div>
  );

  const loginsHint = (text: string) => (canLogins ? text : 'Needs the “manage users” permission — ask an administrator.');

  return (
    <Card>
      <div className="p-5 pb-4 sm:p-6 sm:pb-4">
        <h2 className="font-display text-[16px] font-semibold tracking-tight">2. Upload and choose options</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">Nothing is saved yet — next you’ll see exactly what will happen to each row.</p>
      </div>
      <div className="space-y-5 px-5 pb-5 sm:px-6 sm:pb-6">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt,.tsv,text/csv,text/plain"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            void take(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {file ? (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-success-soft text-success">
              <FileSpreadsheet className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium">{file.name}</p>
              <p className="text-[12px] text-muted-foreground">
                {formatBytes(file.size)} · about {formatNumber(file.rows)} row{file.rows === 1 ? '' : 's'}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
              Replace
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => setFile(null)} aria-label="Remove file">
              <X />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            className={cn(
              'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-9 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              drag ? 'border-brand bg-brand-soft/60' : 'border-border-strong bg-muted/30 hover:border-brand/50 hover:bg-muted/60',
            )}
          >
            <span className="grid size-11 place-items-center rounded-xl border border-border bg-card shadow-soft">
              <FileUp className="size-5 text-brand" />
            </span>
            <span className="text-[14px] font-medium">
              <span className="hidden sm:inline">Drop your CSV file here, or </span>
              <span className="text-brand">choose a file</span>
            </span>
            <span className="text-[12px] text-muted-foreground">.csv up to 5 MB · up to 5,000 rows at a time</span>
          </button>
        )}
        {fileError && <InlineNote tone="danger">{fileError}</InlineNote>}

        <div>
          <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Options</p>
          <div className="divide-y divide-border">
            {kind === 'STUDENTS' && (
              <>
                {opt('updateExisting', 'Update students already on record', 'Matched by admission number (or name and date of birth). When off, they’re skipped.')}
                {opt('createMissingArms', 'Create classes that don’t exist yet (e.g. JSS 1 C)', 'Only adds an arm to a level you already have, such as JSS 1.')}
                {opt('createLogins', 'Give parents with an email a portal login', loginsHint('You’ll download their passwords once, straight after the import.'), !canLogins)}
              </>
            )}
            {kind === 'STAFF' && (
              <>
                {opt('updateExisting', 'Update staff already on record', 'Matched by staff number or email. When off, they’re skipped.')}
                {opt('createLogins', 'Give staff with an email a login', loginsHint('Teachers get the Teacher role unless your “Portal role” column says otherwise.'), !canLogins)}
              </>
            )}
            {kind === 'RESULTS' && (
              <>
                <div className="grid gap-1.5 py-3">
                  <Label htmlFor="opt-term" className="text-[13px] font-medium">
                    Term these results are for
                  </Label>
                  {terms.length ? (
                    <Select value={options.termId} onValueChange={(v) => setOptions((o) => ({ ...o, termId: v }))}>
                      <SelectTrigger id="opt-term">
                        <SelectValue placeholder="Choose a term" />
                      </SelectTrigger>
                      <SelectContent>
                        {terms.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.label}
                            {t.isCurrent ? ' (current)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-[12.5px] text-muted-foreground">
                      No terms yet.{' '}
                      <Link to="/setup#year" className="font-medium text-brand hover:underline">
                        Set up the academic year
                      </Link>{' '}
                      first.
                    </p>
                  )}
                </div>
                {opt('overwriteScores', 'Replace scores already entered', 'When off, a student’s subject that already has scores for this term is skipped.')}
              </>
            )}
          </div>
        </div>

        {!!error && <InlineNote tone="danger">{importErrorMessage(error)}</InlineNote>}

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button onClick={onPreview} loading={pending} disabled={!file || (kind === 'RESULTS' && !options.termId)}>
            <Upload /> Check file
          </Button>
          <span className="text-[12px] text-muted-foreground">{file ? 'Shows a preview — nothing is saved yet.' : 'Choose a file to continue.'}</span>
        </div>
      </div>
    </Card>
  );
}

