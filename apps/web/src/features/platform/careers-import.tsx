import { formatOlevel, type CourseImportRow } from '@aischool/shared';
import { AlertTriangle, BadgeCheck, Download, FileSpreadsheet, FileUp, Loader2, Sparkles, Square, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { extractBrochure, useBrochurePreview, useCsvPreview, useImportCourses, type BrochureText } from '../careers/api';

const TEMPLATE = [
  'course,faculty,utme subjects,olevel requirements,notes',
  '"Example Course","Example Faculty","Use of English; Subject A; Subject B; Subject C or Subject D","5 credits: English Language, Mathematics, Subject A; any 1 of Subject B/Subject C","Direct entry or special remarks"',
].join('\n');

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The rows to review before saving: parsed requirements, problems and whether the course exists already. */
function PreviewTable({ rows, onRemove }: { rows: CourseImportRow[]; onRemove?: (i: number) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-[12.5px]">
        <thead className="border-b border-border bg-muted/40 text-left text-[11.5px] text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Course</th>
            <th className="px-3 py-2 font-medium">UTME (with Use of English)</th>
            <th className="px-3 py-2 font-medium">O’level</th>
            <th className="px-3 py-2 font-medium">Checks</th>
            {onRemove && <th className="w-10" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => (
            <tr key={`${r.name}-${i}`} className={cn(r.errors.length > 0 && 'bg-danger-soft/40')}>
              <td className="px-3 py-2 align-top">
                <p className="font-medium">{r.name || '—'}</p>
                <p className="text-muted-foreground">{[r.line ? `line ${r.line}` : null, r.faculty].filter(Boolean).join(' · ')}</p>
                {r.existing !== 'NONE' && <Badge variant={r.existing === 'VERIFIED' ? 'success' : 'outline'}>{r.existing === 'VERIFIED' ? 'Exists · verified' : 'Exists · will update'}</Badge>}
              </td>
              <td className="px-3 py-2 align-top">{r.utmeSubjects.length ? r.utmeSubjects.map((u) => u.subjects.join(' or ')).join(' · ') : '—'}</td>
              <td className="px-3 py-2 align-top">{r.olevelRequirements ? formatOlevel(r.olevelRequirements) : '—'}</td>
              <td className="px-3 py-2 align-top">
                {r.errors.map((e) => (
                  <p key={e} className="text-danger">
                    {e}
                  </p>
                ))}
                {r.warnings.map((w) => (
                  <p key={w} className="text-muted-foreground">
                    {w}
                  </p>
                ))}
                {r.notes && <p className="mt-1 line-clamp-2 text-muted-foreground">Notes: {r.notes}</p>}
              </td>
              {onRemove && (
                <td className="px-1 py-2 align-top">
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove ${r.name}`} onClick={() => onRemove(i)}>
                    <Trash2 />
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const toSave = (rows: CourseImportRow[]) => rows.filter((r) => !r.errors.length).map((r) => ({ name: r.name, faculty: r.faculty, utmeSubjects: r.utmeSubjects, olevelRequirements: r.olevelRequirements, notes: r.notes }));

// ------------------------------------------------------------------ CSV

export function CsvImport({ onSaved }: { onSaved: () => void }) {
  const [csv, setCsv] = useState('');
  const [rows, setRows] = useState<CourseImportRow[] | null>(null);
  const [edition, setEdition] = useState('');
  const [verified, setVerified] = useState(false);
  const [keepVerified, setKeepVerified] = useState(true);
  const preview = useCsvPreview();
  const save = useImportCourses('csv');
  const fileRef = useRef<HTMLInputElement>(null);
  const good = rows?.filter((r) => !r.errors.length).length ?? 0;
  const bad = (rows?.length ?? 0) - good;

  const run = (text: string) =>
    preview.mutate(text, {
      onSuccess: (r) => setRows(r.rows),
      onError: (e) => toast.error(errorMessage(e)),
    });

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <h2 className="font-display text-[15px] font-semibold">Import course requirements from a spreadsheet</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          One row per course with the columns <b>course</b>, <b>faculty</b>, <b>utme subjects</b>, <b>olevel requirements</b> and <b>notes</b>. UTME: subjects separated by “;” (Use of English may be included or left out), alternatives with “or”. O’level: “5 credits: English Language, Mathematics, Biology; any 2 of Chemistry/Physics/Agricultural Science”. Existing courses (same name) get the new requirements.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => download('course-requirements-template.csv', TEMPLATE)}>
            <Download /> Template
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,.tsv,.txt"
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose a CSV file"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const t = await f.text();
              setCsv(t);
              run(t);
              e.target.value = '';
            }}
          />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <FileUp /> Choose CSV file
          </Button>
        </div>
        <Textarea className="mt-3 font-mono text-[12px]" rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="…or paste the CSV here (with the header row)" aria-label="CSV text" />
        <Button className="mt-3" onClick={() => run(csv)} disabled={!csv.trim()} loading={preview.isPending}>
          <FileSpreadsheet /> Preview
        </Button>
      </Card>
      {rows && (
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
            <p className="text-[13.5px] font-medium">
              {good} course{good === 1 ? '' : 's'} ready{bad ? `, ${bad} with problems (left out)` : ''}
            </p>
          </div>
          <PreviewTable rows={rows} onRemove={(i) => setRows(rows.filter((_, j) => j !== i))} />
          <div className="grid gap-3 border-t border-border p-4 sm:grid-cols-2">
            <Field label="Brochure edition" htmlFor="csv-ed" optional hint="e.g. 2026/2027">
              <Input id="csv-ed" value={edition} onChange={(e) => setEdition(e.target.value)} />
            </Field>
            <div className="grid content-start gap-2 text-[13px]">
              <label className="flex items-start gap-2">
                <Checkbox checked={verified} onCheckedChange={(v) => setVerified(v === true)} className="mt-0.5" />
                <span>
                  <b>I have checked these rows against the official JAMB brochure</b> — mark them verified so students see them.
                </span>
              </label>
              <label className="flex items-start gap-2">
                <Checkbox checked={keepVerified} onCheckedChange={(v) => setKeepVerified(v === true)} className="mt-0.5" />
                <span>Leave courses that are already verified unchanged</span>
              </label>
            </div>
            <Button
              className="justify-self-start"
              disabled={!good}
              loading={save.isPending}
              onClick={() =>
                save.mutate(
                  { rows: toSave(rows), source: 'JAMB_BROCHURE', sourceEdition: edition || null, verified, skipVerified: keepVerified },
                  {
                    onSuccess: (r) => {
                      toast.success(`${r.created} added, ${r.updated} updated${r.skipped ? `, ${r.skipped} verified left alone` : ''}`);
                      setRows(null);
                      setCsv('');
                      onSaved();
                    },
                    onError: (e) => toast.error(errorMessage(e)),
                  },
                )
              }
            >
              Save {good} course{good === 1 ? '' : 's'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ JAMB brochure (AI-assisted)

const PART = 12_000;
function parts(text: string): string[] {
  const out: string[] = [];
  let buf = '';
  for (const p of text.split(/\n\s*\n/)) {
    if (buf.length + p.length > PART && buf) {
      out.push(buf);
      buf = '';
    }
    buf += (buf ? '\n\n' : '') + p.slice(0, PART);
  }
  if (buf.trim()) out.push(buf);
  return out;
}

export function BrochureImport({ onSaved }: { onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [doc, setDoc] = useState<BrochureText | null>(null);
  const [edition, setEdition] = useState('');
  const [rows, setRows] = useState<CourseImportRow[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const stop = useRef(false);
  const preview = useBrochurePreview();
  const save = useImportCourses('brochure');

  const extract = async () => {
    if (!file) return;
    setExtracting(true);
    try {
      const d = await extractBrochure(file, Number(from) || undefined, Number(to) || undefined);
      setDoc(d);
      if (d.to && d.pages && d.to < d.pages) {
        setFrom(String(d.to + 1));
        setTo('');
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExtracting(false);
    }
  };

  const read = async () => {
    if (!doc) return;
    const ps = parts(doc.text);
    stop.current = false;
    setProgress({ done: 0, total: ps.length });
    let found = 0;
    for (const [i, p] of ps.entries()) {
      if (stop.current) break;
      try {
        const r = await preview.mutateAsync({ text: p, edition: edition || null });
        found += r.rows.length;
        setRows((prev) => {
          const by = new Map(prev.map((x) => [x.name.toLowerCase(), x]));
          for (const x of r.rows) by.set(x.name.toLowerCase(), x);
          return [...by.values()];
        });
      } catch (e) {
        toast.error(`Part ${i + 1}: ${errorMessage(e)}`);
        break;
      }
      setProgress({ done: i + 1, total: ps.length });
    }
    setProgress(null);
    toast.success(`Read ${found} course row${found === 1 ? '' : 's'} from pages ${doc.from ?? ''}–${doc.to ?? ''}`);
  };

  const good = rows.filter((r) => !r.errors.length).length;
  return (
    <div className="space-y-4">
      <Card className="flex gap-3 border-warning/30 bg-warning-soft/40 p-4 text-[13px]">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <p>
          AI reads the brochure text into rows to save you typing. Everything it reads is saved as <b>unverified</b> and stays hidden from students until a person opens each course, checks it against the brochure and switches on “Verified”. Courses already verified are never overwritten.
        </p>
      </Card>
      <Card className="p-4 sm:p-5">
        <h2 className="font-display text-[15px] font-semibold">1. Upload the JAMB brochure</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">A text PDF of the official UTME brochure. It is read 150 pages at a time: after each batch, the page range moves on so you can continue.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_100px_100px_auto] sm:items-end">
          <Field label="Brochure PDF" htmlFor="b-file">
            <Input id="b-file" type="file" accept=".pdf,application/pdf,.docx,.txt" onChange={(e) => (setFile(e.target.files?.[0] ?? null), setDoc(null), setFrom(''), setTo(''))} />
          </Field>
          <Field label="From page" htmlFor="b-from">
            <Input id="b-from" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, ''))} placeholder="1" />
          </Field>
          <Field label="To page" htmlFor="b-to">
            <Input id="b-to" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, ''))} placeholder="auto" />
          </Field>
          <Button onClick={() => void extract()} disabled={!file} loading={extracting}>
            <FileUp /> Read pages
          </Button>
        </div>
        {doc && (
          <p className="mt-3 text-[13px]">
            {doc.from ? `Pages ${doc.from}–${doc.to} of ${doc.pages}` : doc.filename}: {formatNumber(doc.chars)} characters of text, {parts(doc.text).length} part{parts(doc.text).length === 1 ? '' : 's'} for the AI.
          </p>
        )}
      </Card>
      {doc && (
        <Card className="p-4 sm:p-5">
          <h2 className="font-display text-[15px] font-semibold">2. Extract course requirements with AI</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-[200px_auto] sm:items-end">
            <Field label="Brochure edition" htmlFor="b-ed" hint="e.g. 2026/2027">
              <Input id="b-ed" value={edition} onChange={(e) => setEdition(e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <Button variant="ai" onClick={() => void read()} disabled={!!progress}>
                {progress ? <Loader2 className="animate-spin" /> : <Sparkles />} Extract from these pages
              </Button>
              {progress && (
                <Button variant="outline" onClick={() => (stop.current = true)}>
                  <Square /> Stop
                </Button>
              )}
            </div>
          </div>
          {progress && (
            <div className="mt-3">
              <Progress value={(100 * progress.done) / progress.total} label="AI extraction progress" />
              <p className="mt-1 text-[12px] text-muted-foreground">
                Part {Math.min(progress.done + 1, progress.total)} of {progress.total}…
              </p>
            </div>
          )}
        </Card>
      )}
      {rows.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
            <p className="min-w-0 flex-1 text-[13.5px] font-medium">
              3. Review {rows.length} course{rows.length === 1 ? '' : 's'} — remove anything wrong, then save as unverified
            </p>
            <Button variant="ghost" size="sm" onClick={() => setRows([])}>
              Clear
            </Button>
          </div>
          <PreviewTable rows={rows} onRemove={(i) => setRows(rows.filter((_, j) => j !== i))} />
          <div className="flex flex-wrap items-center gap-3 border-t border-border p-4">
            <Button
              disabled={!good || !!progress}
              loading={save.isPending}
              onClick={() =>
                save.mutate(
                  { rows: toSave(rows), source: 'JAMB_BROCHURE', sourceEdition: edition || null, verified: false, skipVerified: true },
                  {
                    onSuccess: (r) => {
                      toast.success(`${r.created} added, ${r.updated} updated (unverified)${r.skipped ? `, ${r.skipped} verified left alone` : ''}`);
                      setRows([]);
                      onSaved();
                    },
                    onError: (e) => toast.error(errorMessage(e)),
                  },
                )
              }
            >
              <BadgeCheck /> Save {good} as unverified
            </Button>
            <p className="text-[12px] text-muted-foreground">Next: open each course in “Courses & requirements”, check it against the brochure and switch on Verified.</p>
          </div>
        </Card>
      )}
    </div>
  );
}
