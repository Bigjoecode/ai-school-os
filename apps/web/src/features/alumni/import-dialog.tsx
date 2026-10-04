import { ALUMNI_CSV_FIELDS, type AlumniImportResult } from '@aischool/shared';
import { Download, FileUp, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { saveTextFile } from '../onboarding/api';
import { useImportAlumni } from './api';

const TEMPLATE_FIELDS = ALUMNI_CSV_FIELDS.filter((f) => f.field !== 'name');
const EXAMPLE: Record<string, string> = {
  firstName: 'Chidinma',
  lastName: 'Okafor',
  graduationYear: '2016',
  finalClass: 'SS 3 B',
  email: 'chidinma@example.com',
  phone: '08031234567',
  currentInstitution: 'University of Nigeria Nsukka',
  course: 'Pharmacy',
  occupation: 'Pharmacist',
  employer: '',
  city: 'Enugu',
  country: 'Nigeria',
  consentToContact: 'Yes',
  notes: '',
};

/** CSV import: the file is checked first (nothing saved), then imported. */
export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const run = useImportAlumni();
  const input = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [preview, setPreview] = useState<AlumniImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCsv(null);
      setName('');
      setPreview(null);
      setError(null);
    }
  }, [open]);

  const choose = async (f: File | undefined) => {
    if (!f) return;
    setName(f.name);
    setPreview(null);
    setError(null);
    const text = await f.text();
    setCsv(text);
    run.mutate({ csv: text, dryRun: true }, { onSuccess: setPreview, onError: (e) => setError(errorMessage(e)) });
  };
  const commit = () => {
    if (!csv) return;
    run.mutate(
      { csv, dryRun: false },
      {
        onSuccess: (r) => {
          toast.success(`Imported: ${r.create} added, ${r.update} updated`);
          onOpenChange(false);
        },
        onError: (e) => setError(errorMessage(e)),
      },
    );
  };
  const template = () =>
    saveTextFile(`${TEMPLATE_FIELDS.map((f) => f.label).join(',')}\r\n${TEMPLATE_FIELDS.map((f) => EXAMPLE[f.field] ?? '').join(',')}\r\n`, 'alumni-template.csv');
  const total = preview ? preview.create + preview.update : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Import alumni from a spreadsheet</DialogTitle>
          <DialogDescription>Save your list as CSV. People already in the directory are matched by email, phone, or name and year, and only what the file has is filled in.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void choose(e.target.files?.[0])} />
            <Button variant="outline" onClick={() => input.current?.click()}>
              <FileUp /> {name ? 'Choose another file' : 'Choose CSV file'}
            </Button>
            <Button variant="ghost" onClick={template}>
              <Download /> Template
            </Button>
            {name && <span className="min-w-0 truncate text-[13px] text-muted-foreground">{name}</span>}
          </div>
          <p className="text-[12.5px] text-muted-foreground">
            Columns: {TEMPLATE_FIELDS.map((f) => f.label).join(', ')}. A single “Name” column works too (e.g. “OKAFOR Chidinma”).
          </p>
          {run.isPending && !preview && <p className="text-[13px] text-muted-foreground">Checking the file…</p>}
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft/50 p-3 text-[13px] text-danger">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {error}
            </p>
          )}
          {preview && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                {(
                  [
                    ['To add', preview.create, 'text-success'],
                    ['To update', preview.update, 'text-info'],
                    ['Problems', preview.errors.length, preview.errors.length ? 'text-warning' : ''],
                  ] as const
                ).map(([l, n, tone]) => (
                  <div key={l} className="rounded-xl border border-border p-3">
                    <p className={cn('font-display text-[24px] font-semibold tabular', tone)}>{n}</p>
                    <p className="text-[12px] text-muted-foreground">{l}</p>
                  </div>
                ))}
              </div>
              <p className="text-[12.5px] text-muted-foreground">
                Recognised columns: {preview.columns.filter((c) => c.field).map((c) => c.header).join(', ') || 'none'}
                {preview.columns.some((c) => !c.field) && <> · ignored: {preview.columns.filter((c) => !c.field).map((c) => c.header).join(', ')}</>}
              </p>
              {preview.errors.length > 0 && (
                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-warning/30 bg-warning-soft/40 p-3 text-[12.5px]">
                  {preview.errors.map((e, i) => (
                    <li key={i}>
                      <span className="font-mono text-muted-foreground">Line {e.line}:</span> {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={commit} disabled={!preview || total === 0} loading={run.isPending && !!preview}>
            Import {total || ''} record{total === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
