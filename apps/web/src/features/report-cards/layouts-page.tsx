import type { ReportTemplateConfig, ReportTemplateRow } from '@aischool/shared';
import { Check, Copy, FileImage, LayoutTemplate, MoreHorizontal, Pencil, Plus, ScanLine, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { useCan, useMe } from '@/lib/auth-store';
import { formatRelative } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { uploadPrivateFile, useAssessmentSettings, useDeleteReportTemplate, useReportTemplates, useSaveReportTemplate, useTemplateFromSample } from '../assessment/api';
import { BackLink } from '../planning/ui';
import { ReportCardDocument } from './card-document';
import { ScaledSheet } from './preview-frame';
import { sampleReportView } from './sample-view';

export default function LayoutsPage() {
  useDocumentTitle('Report card layout');
  const navigate = useNavigate();
  const canEdit = useCan('results.publish');
  const canAi = useCan('ai.use');
  const query = useReportTemplates();
  const save = useSaveReportTemplate();
  const remove = useDeleteReportTemplate();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleting, setDeleting] = useState<ReportTemplateRow | null>(null);

  const templates = query.data?.templates ?? [];
  const standard = query.data?.standard;
  const standardInUse = !templates.some((t) => t.isDefault);

  const use = (t: ReportTemplateRow) =>
    save.mutate(
      { id: t.id, input: { name: t.name, isDefault: true, config: t.config } },
      { onSuccess: () => toast.success(`Report cards now use “${t.name}”`), onError: (e) => toast.error(errorMessage(e)) },
    );

  return (
    <Page className="max-w-6xl">
      <BackLink to="/report-cards">Report Cards</BackLink>
      <PageHeader
        title="Report card layout"
        description="Make the printed report card look like your school’s own: the heading, the student details, the subject columns, behaviour and skills ratings and signatures."
        actions={
          canEdit && (
            <>
              {canAi && (
                <Button variant="ai" onClick={() => setUploadOpen(true)}>
                  <ScanLine /> Upload a sample card
                </Button>
              )}
              <Button variant="outline" onClick={() => navigate('/report-cards/layout/new')}>
                <Plus /> New layout
              </Button>
            </>
          )
        }
      />

      {query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-80 rounded-2xl" />
          ))}
        </div>
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <LayoutCard
              key={t.id}
              name={t.name}
              config={t.config}
              inUse={t.isDefault}
              meta={
                <>
                  Updated {formatRelative(t.updatedAt)}
                  {t.sampleFileId && (
                    <Badge variant="outline" className="ml-2">
                      <FileImage /> From a sample
                    </Badge>
                  )}
                </>
              }
              to={`/report-cards/layout/${t.id}`}
              actions={
                canEdit ? (
                  <>
                    {!t.isDefault && (
                      <Button size="sm" variant="outline" onClick={() => use(t)} loading={save.isPending && save.variables?.id === t.id}>
                        {!(save.isPending && save.variables?.id === t.id) && <Check />} Use this layout
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon-sm" variant="ghost" aria-label={`More actions for ${t.name}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => navigate(`/report-cards/layout/${t.id}`)}>
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => navigate(`/report-cards/layout/new?from=${t.id}`)}>
                          <Copy /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => setDeleting(t)}>
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                ) : null
              }
            />
          ))}
          {standard && (
            <LayoutCard
              name="Standard layout"
              config={standard}
              inUse={standardInUse}
              meta="The common Nigerian report sheet, used until you choose your own."
              to={canEdit ? '/report-cards/layout/new' : undefined}
              actions={
                canEdit ? (
                  <Button size="sm" variant="outline" onClick={() => navigate('/report-cards/layout/new')}>
                    <Copy /> {templates.length ? 'Start from this' : 'Customise'}
                  </Button>
                ) : null
              }
            />
          )}
        </div>
      )}

      {canEdit && canAi && <UploadSampleDialog open={uploadOpen} onOpenChange={setUploadOpen} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        description={deleting?.isDefault ? 'Report cards use this layout now. Once it’s deleted they go back to the standard layout until you choose another.' : 'This layout will be removed. Report cards are not affected.'}
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting, { onSuccess: () => setDeleting(null) })}
      />
    </Page>
  );
}

function LayoutCard({
  name,
  config,
  inUse,
  meta,
  to,
  actions,
}: {
  name: string;
  config: ReportTemplateConfig;
  inUse: boolean;
  meta: ReactNode;
  to?: string;
  actions: ReactNode;
}) {
  const view = usePreviewView(config);
  const thumb = (
    <div className="pointer-events-none border-b border-border bg-muted/40 p-3" aria-hidden>
      <ScaledSheet maxHeight={190} className="rounded-md shadow-xs">
        <ReportCardDocument v={view} preview className="rounded-none border-0 shadow-none" />
      </ScaledSheet>
    </div>
  );
  return (
    <Card className={cn('flex flex-col overflow-hidden', inUse && 'ring-2 ring-brand/60')}>
      {to ? (
        <Link to={to} tabIndex={-1} className="block transition-opacity hover:opacity-90">
          {thumb}
        </Link>
      ) : (
        thumb
      )}
      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="flex items-center gap-2">
          <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: config.accentColor }} />
          {to ? (
            <Link to={to} className="truncate font-display text-[15px] font-semibold hover:underline">
              {name}
            </Link>
          ) : (
            <span className="truncate font-display text-[15px] font-semibold">{name}</span>
          )}
          {inUse && (
            <Badge variant="success" className="ml-auto">
              <Check /> In use
            </Badge>
          )}
        </div>
        <p className="text-[12.5px] text-muted-foreground">{meta}</p>
        {actions && <div className="mt-auto flex items-center justify-end gap-2 pt-3">{actions}</div>}
      </div>
    </Card>
  );
}

/** Sample data for a preview, using the school's grading settings and name. */
export function usePreviewView(config: ReportTemplateConfig) {
  const me = useMe();
  const settings = useAssessmentSettings();
  const school = me?.tenant;
  return useMemo(
    () =>
      sampleReportView({
        config,
        components: settings.components,
        gradingScale: settings.gradingScale,
        school: { name: school?.name ?? 'Your school', motto: school?.motto ?? null, logoUrl: school?.logoUrl ?? null },
      }),
    [config, settings.components, settings.gradingScale, school?.name, school?.motto, school?.logoUrl],
  );
}

// ------------------------------------------------------------------ upload a sample

const READING_STEPS = [
  'Reading the heading and school details…',
  'Finding the student details…',
  'Matching the subject columns…',
  'Copying the behaviour and skills ratings…',
  'Checking the rating key and signatures…',
  'Almost there — building your layout…',
];

function UploadSampleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const fromSample = useTemplateFromSample();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('Our report card');
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'reading'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const thumb = useMemo(() => (file && file.type.startsWith('image/') ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (thumb && URL.revokeObjectURL(thumb)), [thumb]);

  useEffect(() => {
    if (open) {
      setFile(null);
      setName('Our report card');
      setPhase('idle');
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (phase !== 'reading') return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const busy = phase !== 'idle';

  const pick = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (!f.type.startsWith('image/') && f.type !== 'application/pdf') {
      setError('Choose a photo (JPG, PNG, WebP) or a PDF of the report card.');
      return;
    }
    setFile(f);
  };

  const start = async () => {
    if (!file) return;
    setError(null);
    try {
      setPhase('uploading');
      const saved = await uploadPrivateFile(file);
      setPhase('reading');
      const row = await fromSample.mutateAsync({ fileId: saved.id, name: name.trim().length >= 2 ? name.trim() : 'Our report card' });
      toast.success('Your card has been read', { description: 'Check the layout against your sample, adjust anything, then save.' });
      onOpenChange(false);
      navigate(`/report-cards/layout/${row.id}?sample=1`);
    } catch (e) {
      setError(errorMessage(e));
      setPhase('idle');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent size="md" hideClose={busy} onInteractOutside={(e) => busy && e.preventDefault()} onEscapeKeyDown={(e) => busy && e.preventDefault()}>
        <DialogHeader>
          <div className="ai-border mb-2 grid size-10 place-items-center rounded-xl bg-card">
            <ScanLine className="size-5 text-brand" />
          </div>
          <DialogTitle>Upload your current report card</DialogTitle>
          <DialogDescription>
            Take a clear photo (or upload a PDF) of a report card your school uses now. AI reads its heading, columns, ratings and signatures and drafts a matching layout
            for you to check.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {phase === 'reading' || phase === 'uploading' ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center" role="status" aria-live="polite">
              <div className="relative grid size-14 place-items-center">
                <span className="absolute inset-0 animate-spin rounded-full border-2 border-brand/20 border-t-brand" />
                <LayoutTemplate className="size-6 text-brand" />
              </div>
              <p className="font-medium">{phase === 'uploading' ? 'Uploading your card…' : READING_STEPS[Math.min(READING_STEPS.length - 1, Math.floor(elapsed / 5))]}</p>
              <p className="text-[12.5px] text-muted-foreground">
                {phase === 'uploading' ? 'This takes a moment on a slow connection.' : `This usually takes 10–30 seconds. ${elapsed > 0 ? `${elapsed}s` : ''}`}
              </p>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  pick(e.dataTransfer.files[0]);
                }}
                className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-5 text-center transition-colors hover:border-brand/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {thumb ? (
                  <img src={thumb} alt="Your sample report card" className="max-h-44 rounded-md object-contain shadow-xs" />
                ) : file ? (
                  <FileImage className="size-8 text-muted-foreground" />
                ) : (
                  <Upload className="size-8 text-muted-foreground" />
                )}
                <span className="text-[13.5px] font-medium">{file ? file.name : 'Choose a photo or PDF'}</span>
                <span className="text-[12px] text-muted-foreground">{file ? 'Tap to choose a different file' : 'JPG, PNG, WebP or PDF. Lay the card flat in good light.'}</span>
              </button>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
              <Field label="Name for this layout" htmlFor="sample-name">
                <Input id="sample-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
              </Field>
            </>
          )}
          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="ai" onClick={() => void start()} disabled={!file} loading={busy}>
            {!busy && <ScanLine />} Read my card
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
