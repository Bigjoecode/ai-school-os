import { IMPORT_FIELDS, type ImportKind, type ImportPreview, type ImportResult, type ImportRowResult } from '@aischool/shared';
import { ArrowLeft, ArrowRight, CircleAlert, CircleCheck, Download, FileSpreadsheet, KeyRound, Plus, RotateCcw, ShieldAlert, Sparkles } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAssessmentSettings } from '@/features/assessment/api';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { importErrorMessage, saveTextFile } from './api';
import { KIND_META, type LoadedFile } from './meta';

export function InlineNote({ tone = 'info', title, children }: { tone?: 'danger' | 'warning' | 'success' | 'info'; title?: ReactNode; children: ReactNode }) {
  const Icon = tone === 'success' ? CircleCheck : tone === 'warning' ? ShieldAlert : CircleAlert;
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] leading-relaxed',
        tone === 'danger' && 'border-danger/25 bg-danger-soft',
        tone === 'warning' && 'border-warning/25 bg-warning-soft',
        tone === 'success' && 'border-success/25 bg-success-soft',
        tone === 'info' && 'border-info/20 bg-info-soft',
      )}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', tone === 'danger' && 'text-danger', tone === 'warning' && 'text-warning', tone === 'success' && 'text-success', tone === 'info' && 'text-info')} aria-hidden />
      <div className="min-w-0 text-foreground/90">
        {title && <p className="font-medium text-foreground">{title}</p>}
        {children}
      </div>
    </div>
  );
}

const STATUS: Record<ImportRowResult['status'], { label: string; done: string; variant: BadgeProps['variant']; order: number }> = {
  ERROR: { label: 'Error', done: 'Left out', variant: 'danger', order: 0 },
  CREATE: { label: 'Will add', done: 'Added', variant: 'success', order: 1 },
  UPDATE: { label: 'Will update', done: 'Updated', variant: 'info', order: 2 },
  SKIP: { label: 'Skipped', done: 'Skipped', variant: 'secondary', order: 3 },
};

type Filter = 'ALL' | ImportRowResult['status'];
const PAGE = 50;

function plural(n: number, [one, many]: [string, string]) {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}

/** "Adm No" → "Admission number"; score columns use the school's own component names. */
function useFieldLabels(kind: ImportKind) {
  const { components } = useAssessmentSettings();
  return useMemo(() => {
    const m = new Map<string, string>(IMPORT_FIELDS[kind].map((f) => [f.field, f.label]));
    for (const c of components) m.set(`score:${c.key}`, `${c.name} score`);
    return m;
  }, [kind, components]);
}

// ------------------------------------------------------------------ step 3: review

export function ImportReview({
  kind,
  file,
  preview,
  onBack,
  onCommit,
  committing,
  error,
}: {
  kind: ImportKind;
  file: LoadedFile;
  preview: ImportPreview;
  onBack: () => void;
  onCommit: () => void;
  committing: boolean;
  error: unknown;
}) {
  const t = preview.totals;
  const [filter, setFilter] = useState<Filter>(t.error ? 'ERROR' : 'ALL');
  const toWrite = t.create + t.update;
  const blocked = preview.missingRequired.length > 0;

  const tiles: { key: Filter; label: string; value: number; tone: string }[] = [
    { key: 'CREATE', label: 'Will add', value: t.create, tone: 'text-success' },
    { key: 'UPDATE', label: 'Will update', value: t.update, tone: 'text-info' },
    { key: 'SKIP', label: 'Skipped', value: t.skip, tone: 'text-muted-foreground' },
    { key: 'ERROR', label: 'Have errors', value: t.error, tone: 'text-danger' },
  ];

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="min-w-0 truncate text-[13.5px]">
            <span className="font-medium">{file.name}</span>
            <span className="text-muted-foreground"> · {plural(preview.rows.length, ['row', 'rows'])} checked</span>
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft /> Change file or options
        </Button>
      </div>

      {blocked && (
        <InlineNote tone="danger" title="Some required columns are missing">
          Your file needs {preview.missingRequired.length === 1 ? 'a column' : 'columns'} for <b>{preview.missingRequired.join(', ')}</b>. Add {preview.missingRequired.length === 1 ? 'it' : 'them'} to the header row (the first row) and upload the file again. The template shows the column names we look for.
        </InlineNote>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 [&>*]:min-w-0">
        {tiles.map((tile) => (
          <button
            key={tile.key}
            type="button"
            onClick={() => setFilter(filter === tile.key ? 'ALL' : tile.key)}
            aria-pressed={filter === tile.key}
            className={cn(
              'rounded-2xl border bg-card p-4 text-left shadow-soft transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              filter === tile.key ? 'border-foreground/30 ring-1 ring-foreground/20' : 'border-border hover:border-border-strong',
            )}
          >
            <p className="text-[12px] font-medium text-muted-foreground">{tile.label}</p>
            <p className={cn('mt-1 font-display text-[26px] font-semibold leading-none tracking-tight tabular-nums', tile.value ? tile.tone : 'text-muted-foreground/50')}>{formatNumber(tile.value)}</p>
          </button>
        ))}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px] [&>*]:min-w-0">
        <RowsCard rows={preview.rows} filter={filter} setFilter={setFilter} totals={t} kind={kind} />
        <div className="space-y-5">
          {preview.extras.length > 0 && (
            <Card className="p-5">
              <h3 className="flex items-center gap-2 text-[13px] font-semibold">
                <Sparkles className="size-4 text-brand" aria-hidden /> This import will also
              </h3>
              <ul className="mt-2.5 space-y-2">
                {preview.extras.map((x) => (
                  <li key={x} className="flex items-start gap-2 text-[13px] text-muted-foreground">
                    <Plus className="mt-0.5 size-3.5 shrink-0 text-foreground/60" aria-hidden />
                    <span className="min-w-0">{x}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <ColumnsCard kind={kind} columns={preview.columns} />
        </div>
      </div>

      {!!error && <InlineNote tone="danger">{importErrorMessage(error)}</InlineNote>}

      {/* Sticky action bar: always within reach on long files. */}
      <div className="sticky bottom-3 z-20">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card/95 p-3.5 shadow-pop backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <p className="min-w-0 text-[12.5px] leading-snug text-muted-foreground">
            {blocked ? (
              <span className="text-danger">Add the missing columns before importing.</span>
            ) : toWrite === 0 ? (
              'Nothing to add or update in this file.'
            ) : t.error ? (
              <>
                <span className="font-medium text-foreground">{plural(t.error, ['row has', 'rows have'])} errors and will be left out.</span> Fix them in your file and import it again later — rows already imported are skipped.
              </>
            ) : (
              <>Everything checks out. Nothing is saved until you import.</>
            )}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={onBack} className="flex-1 sm:flex-none">
              Back
            </Button>
            <Button onClick={onCommit} loading={committing} disabled={blocked || toWrite === 0} className="flex-1 sm:flex-none">
              Import {plural(toWrite, ['row', 'rows'])}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RowsCard({ rows, filter, setFilter, totals, kind }: { rows: ImportRowResult[]; filter: Filter; setFilter: (f: Filter) => void; totals: ImportPreview['totals']; kind: ImportKind }) {
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [filter]);
  const sorted = useMemo(() => [...rows].sort((a, b) => STATUS[a.status].order - STATUS[b.status].order || a.line - b.line), [rows]);
  const shown = filter === 'ALL' ? sorted : sorted.filter((r) => r.status === filter);
  const chips: { key: Filter; label: string; n: number }[] = [
    { key: 'ALL', label: 'All', n: rows.length },
    { key: 'ERROR', label: 'Errors', n: totals.error },
    { key: 'CREATE', label: 'Will add', n: totals.create },
    { key: 'UPDATE', label: 'Will update', n: totals.update },
    { key: 'SKIP', label: 'Skipped', n: totals.skip },
  ];
  const downloadErrors = () => {
    const esc = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = rows.filter((r) => r.status === 'ERROR').map((r) => [String(r.line), r.label, r.messages.join('; ')].map(esc).join(','));
    saveTextFile(`Line,Row,Problem\r\n${lines.join('\r\n')}\r\n`, `${kind.toLowerCase()}-import-errors.csv`);
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
        <div className="no-scrollbar -mx-1 flex max-w-full gap-1 overflow-x-auto px-1">
          {chips
            .filter((c) => c.key === 'ALL' || c.n > 0)
            .map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setFilter(c.key)}
                aria-pressed={filter === c.key}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors',
                  filter === c.key ? 'border-foreground/80 bg-foreground text-background' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {c.label}
                <span className="tabular-nums opacity-70">{formatNumber(c.n)}</span>
              </button>
            ))}
        </div>
        {totals.error > 0 && (
          <Button variant="ghost" size="sm" onClick={downloadErrors}>
            <Download /> Errors as CSV
          </Button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">No rows here.</p>
      ) : (
        <>
          {/* Desktop: a table. */}
          <div className="hidden md:block">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="w-16 px-5 py-2.5 font-medium">Line</th>
                  <th className="w-28 py-2.5 font-medium">Status</th>
                  <th className="w-[34%] py-2.5 pr-4 font-medium">Row</th>
                  <th className="py-2.5 pr-5 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, limit).map((r) => (
                  <tr key={r.line} className={cn('border-t border-border align-top', r.status === 'ERROR' && 'bg-danger-soft/30')}>
                    <td className="px-5 py-2.5 font-mono text-[12px] tabular-nums text-muted-foreground">{r.line}</td>
                    <td className="py-2.5">
                      <Badge variant={STATUS[r.status].variant} dot>
                        {STATUS[r.status].label}
                      </Badge>
                    </td>
                    <td className="break-words py-2.5 pr-4 text-[13px] font-medium">{r.label}</td>
                    <td className="py-2.5 pr-5 text-[12.5px] text-muted-foreground">
                      {r.messages.length ? (
                        <ul className="space-y-0.5">
                          {r.messages.map((m) => (
                            <li key={m} className={cn('break-words', r.status === 'ERROR' && 'text-foreground/85')}>
                              {m}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Phones: cards. */}
          <ul className="divide-y divide-border md:hidden">
            {shown.slice(0, limit).map((r) => (
              <li key={r.line} className={cn('px-4 py-3', r.status === 'ERROR' && 'bg-danger-soft/30')}>
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 break-words text-[13.5px] font-medium">{r.label}</p>
                  <Badge variant={STATUS[r.status].variant} dot className="shrink-0">
                    {STATUS[r.status].label}
                  </Badge>
                </div>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">Line {r.line}</p>
                {r.messages.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-[12.5px] text-muted-foreground">
                    {r.messages.map((m) => (
                      <li key={m} className="break-words">
                        {m}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          {shown.length > limit && (
            <div className="border-t border-border px-5 py-3 text-center">
              <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE * 4)}>
                Show more ({formatNumber(shown.length - limit)} left)
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function ColumnsCard({ kind, columns }: { kind: ImportKind; columns: ImportPreview['columns'] }) {
  const labels = useFieldLabels(kind);
  const ignored = columns.filter((c) => !c.field).length;
  return (
    <Card className="p-5">
      <h3 className="text-[13px] font-semibold">Columns in your file</h3>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        {columns.length - ignored} of {columns.length} recognised{ignored ? `; ${ignored} will be ignored` : ''}.
      </p>
      <ul className="mt-3 space-y-1.5">
        {columns.map((c, i) => (
          <li key={`${c.header}-${i}`} className={cn('flex min-w-0 items-center gap-2 text-[12.5px]', !c.field && 'opacity-55')}>
            <span className="min-w-0 max-w-[45%] truncate rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11.5px]" title={c.header}>
              {c.header || '(blank)'}
            </span>
            <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
            {c.field ? (
              <span className="min-w-0 truncate font-medium">{labels.get(c.field) ?? c.field}</span>
            ) : (
              <span className="italic text-muted-foreground">ignored</span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ------------------------------------------------------------------ step 4: done

const NEXT: Record<ImportKind, { to: string; label: string }[]> = {
  STUDENTS: [
    { to: '/students', label: 'View students' },
    { to: '/parents', label: 'View parents' },
  ],
  STAFF: [{ to: '/staff', label: 'View staff' }],
  RESULTS: [
    { to: '/results', label: 'Open results' },
    { to: '/report-cards', label: 'Report cards' },
  ],
};

export function ImportDone({ kind, result, onRestart }: { kind: ImportKind; result: ImportResult; onRestart: () => void }) {
  const t = result.totals;
  const noun = KIND_META[kind].noun;
  const [saved, setSaved] = useState(false);
  const logins = result.credentialsCsv ? result.credentialsCsv.trim().split(/\r?\n/).length - 1 : 0;
  const existing = result.credentialsCsv ? (result.credentialsCsv.match(/\(existing account/g) ?? []).length : 0;

  // Passwords exist only in this page's memory: warn before they're lost.
  useEffect(() => {
    if (!result.credentialsCsv || saved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [result.credentialsCsv, saved]);

  const download = () => {
    saveTextFile(result.credentialsCsv!, `login-details-${kind.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`);
    setSaved(true);
  };
  const restart = () => {
    if (result.credentialsCsv && !saved && !window.confirm('You haven’t downloaded the login details. They can’t be shown again. Start a new import anyway?')) return;
    onRestart();
  };

  const headline = kind === 'RESULTS' ? `Imported ${plural(t.create + t.update, ['result row', 'result rows'])}` : `Imported ${plural(t.create + t.update, noun)}`;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card className="overflow-hidden">
        <div className="flex flex-col items-center gap-3 px-6 pb-6 pt-8 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-success-soft text-success">
            <CircleCheck className="size-7" />
          </span>
          <div>
            <h2 className="font-display text-[22px] font-semibold tracking-tight">{headline}</h2>
            <p className="mt-1 text-[13.5px] text-muted-foreground">
              {[
                t.create && `${formatNumber(t.create)} added`,
                t.update && `${formatNumber(t.update)} updated`,
                t.skip && `${formatNumber(t.skip)} skipped`,
                t.error && `${formatNumber(t.error)} left out because of errors`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
        {result.extras.length > 0 && (
          <ul className="space-y-1.5 border-t border-border px-6 py-4 text-[13px] text-muted-foreground">
            {result.extras.map((x) => (
              <li key={x} className="flex items-start gap-2">
                <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                <span className="min-w-0">{x.replace(/^Up to /, '')}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {result.credentialsCsv && (
        <Card className={cn('border-warning/40 p-5 sm:p-6', saved && 'border-border')}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', saved ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')}>
              <KeyRound className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-[16px] font-semibold tracking-tight">{saved ? 'Login details downloaded' : `Download login details for ${plural(logins, ['person', 'people'])}`}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                <b className="font-medium text-foreground">Passwords are shown only this once</b> — we don’t keep a readable copy. Share each person’s details with them privately (one-to-one, or a printed slip), never in a group chat, and ask them to change the password after signing in.
                {existing > 0 && ` ${plural(existing, ['person', 'people'])} already had an account and keep their current password.`}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button onClick={download} variant={saved ? 'outline' : 'default'}>
                  <Download /> {saved ? 'Download again' : 'Download login details'}
                </Button>
                <span className="text-[12px] text-muted-foreground">CSV file · keep it somewhere safe, then delete it</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-5 sm:p-6">
        <h3 className="text-[13px] font-semibold">What next?</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {NEXT[kind].map((n) => (
            <Button key={n.to} asChild variant="outline" size="sm">
              <Link to={n.to}>
                {n.label} <ArrowRight />
              </Link>
            </Button>
          ))}
          <Button asChild variant="outline" size="sm">
            <Link to="/setup">
              Setup checklist <ArrowRight />
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={restart}>
            <RotateCcw /> Import another file
          </Button>
        </div>
      </Card>
    </div>
  );
}
