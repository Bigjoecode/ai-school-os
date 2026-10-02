import { KB_AUDIENCE_LABELS, KB_AUDIENCES, kbDocumentSchema, type KbAnswer, type KbAudience, type KbDocumentRow, type UploadedFile } from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FileText, FileUp, LibraryBig, Loader2, MoreHorizontal, Pencil, Plus, RotateCw, Search, Sparkles, Trash2, Type } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Markdown } from '@/components/ai/markdown';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { type Column, DataTable } from '@/components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError, refreshSession } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { formatNumber, formatRelative } from '@/lib/format';
import { queryClient } from '@/lib/query-client';
import { cn } from '@/lib/utils';
import { Segmented, apiFieldErrors, FormError, zodErrors } from '../operations/ui';

const KEY = ['knowledge', 'documents'] as const;
const after = () => void queryClient.invalidateQueries({ queryKey: KEY });

const useDocuments = () =>
  useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) => api.get<KbDocumentRow[]>('/knowledge/documents', undefined, signal),
    // Keep checking while anything is still being read and indexed.
    refetchInterval: (q) => (q.state.data?.some((d) => d.status === 'PROCESSING') ? 2500 : false),
  });

const MAX_BYTES = 10 * 1024 * 1024;
async function uploadDoc(file: File): Promise<UploadedFile> {
  if (file.size > MAX_BYTES) throw new ApiError(413, 'That file is larger than 10 MB.');
  if (!/\.(pdf|docx)$/i.test(file.name)) throw new ApiError(415, 'Upload a PDF or Word (.docx) document.');
  const send = () => {
    const form = new FormData();
    form.append('file', file);
    const token = useAuthStore.getState().accessToken;
    return fetch('/api/knowledge/upload', { method: 'POST', body: form, credentials: 'include', headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  };
  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && (await refreshSession())) res = await send();
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  if (!res.ok) {
    let message = 'Upload failed. Please try again.';
    try {
      const b = (await res.json()) as { message?: string | string[] };
      if (b.message) message = Array.isArray(b.message) ? b.message.join('. ') : b.message;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as UploadedFile;
}

const AUDIENCE_VARIANT: Record<KbAudience, BadgeProps['variant']> = { PUBLIC: 'info', PARENTS: 'brand', STAFF: 'secondary' };
function AudienceBadge({ audience }: { audience: KbAudience }) {
  return <Badge variant={AUDIENCE_VARIANT[audience]}>{KB_AUDIENCE_LABELS[audience]}</Badge>;
}

function StatusCell({ d }: { d: KbDocumentRow }) {
  if (d.status === 'PROCESSING')
    return (
      <Badge variant="warning">
        <Loader2 className="size-3 animate-spin" aria-hidden /> Reading…
      </Badge>
    );
  if (d.status === 'FAILED')
    return (
      <div className="max-w-[220px]">
        <Badge variant="danger">Failed</Badge>
        {d.error && <p className="mt-1 text-[11.5px] text-danger">{d.error}</p>}
      </div>
    );
  return <Badge variant="success" dot>Ready</Badge>;
}

const size = (chars: number) => (chars >= 1000 ? `${formatNumber(Math.round(chars / 100) / 10)}k chars` : `${formatNumber(chars)} chars`);

export default function KnowledgePage() {
  const q = useDocuments();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<KbDocumentRow | null>(null);
  const [deleting, setDeleting] = useState<KbDocumentRow | null>(null);
  const reprocess = useMutation({ mutationFn: (id: string) => api.post(`/knowledge/documents/${id}/reprocess`), onSuccess: after });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/knowledge/documents/${id}`), onSuccess: after });

  const menu = (d: KbDocumentRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${d.title}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={() => setEditing(d)}>
          <Pencil /> Rename or share
        </DropdownMenuItem>
        {d.filename && (
          <DropdownMenuItem disabled={d.status === 'PROCESSING'} onSelect={() => reprocess.mutate(d.id, { onSuccess: () => toast.success(`Reading “${d.title}” again`) })}>
            <RotateCw /> Read again
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => setDeleting(d)}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const columns: Column<KbDocumentRow>[] = [
    {
      key: 'title',
      header: 'Document',
      cell: (d) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">{d.filename ? <FileText className="size-4" /> : <Type className="size-4" />}</span>
          <div className="min-w-0">
            <p className="truncate font-medium">{d.title}</p>
            <p className="max-w-[260px] truncate text-[12px] text-muted-foreground">{d.filename ?? 'Pasted text'}</p>
          </div>
        </div>
      ),
    },
    { key: 'audience', header: 'Who it answers', cell: (d) => <AudienceBadge audience={d.audience} /> },
    { key: 'status', header: 'Status', cell: (d) => <StatusCell d={d} /> },
    {
      key: 'size',
      header: 'Size',
      className: 'tabular text-right',
      headClassName: 'text-right',
      cell: (d) => (
        <div>
          <p className="whitespace-nowrap">{d.chunks === 1 ? '1 passage' : `${formatNumber(d.chunks)} passages`}</p>
          <p className="whitespace-nowrap text-[11.5px] text-muted-foreground">{size(d.chars)}</p>
        </div>
      ),
    },
    {
      key: 'by',
      header: 'Updated',
      cell: (d) => (
        <div>
          <p className="whitespace-nowrap text-[12.5px]">{formatRelative(d.updatedAt)}</p>
          <p className="whitespace-nowrap text-[11.5px] text-muted-foreground">{d.uploadedBy ?? '—'}</p>
        </div>
      ),
    },
    { key: 'actions', header: <span className="sr-only">Actions</span>, className: 'w-10 text-right', cell: menu },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow="Website & AI"
        title="Knowledge base"
        description="Handbooks, policies, fee guides and FAQs. They power answers for parents and staff in the app and for the assistant on your public website — each document only answers the people you share it with."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus /> Add document
          </Button>
        }
      />
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_380px] [&>*]:min-w-0">
        <Card className="overflow-hidden">
          <DataTable
            columns={columns}
            rows={q.data}
            rowKey={(d) => d.id}
            loading={q.isLoading}
            error={q.error}
            onRetry={() => void q.refetch()}
            renderMobile={(d) => (
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{d.title}</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {d.filename ?? 'Pasted text'} · {d.chunks === 1 ? '1 passage' : `${formatNumber(d.chunks)} passages`} · {formatRelative(d.updatedAt)}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <AudienceBadge audience={d.audience} />
                    <StatusCell d={d} />
                  </div>
                </div>
                {menu(d)}
              </div>
            )}
            empty={{
              icon: LibraryBig,
              title: 'No documents yet',
              description: 'Upload your parent handbook, fees guide or admissions FAQ and the assistants will answer from it.',
              action: (
                <Button onClick={() => setAdding(true)}>
                  <Plus /> Add document
                </Button>
              ),
            }}
          />
        </Card>
        <AskBox ready={!!q.data?.some((d) => d.status === 'READY')} />
      </div>

      <AddDialog open={adding} onOpenChange={setAdding} />
      <EditDialog doc={editing} onOpenChange={(o) => !o && setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.title ?? ''}”?`}
        description="The assistants stop answering from it straight away. This can’t be undone."
        confirmLabel="Delete document"
        loading={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success('Document deleted');
              setDeleting(null);
            },
          })
        }
      />
    </Page>
  );
}

// ------------------------------------------------------------------ test a question

function AskBox({ ready }: { ready: boolean }) {
  const [question, setQuestion] = useState('');
  const ask = useMutation({ mutationFn: (question: string) => api.post<KbAnswer>('/knowledge/ask', { question }) });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim().length >= 3) ask.mutate(question.trim());
  };
  return (
    <Card className="h-fit">
      <CardContent className="space-y-3 p-5">
        <div>
          <p className="flex items-center gap-2 text-[14px] font-semibold">
            <Sparkles className="size-4 text-brand" aria-hidden /> Test a question
          </p>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">Ask what a parent might, and check the answer and where it came from. You see every document; parents only see theirs.</p>
        </div>
        <form onSubmit={submit} className="flex gap-2">
          <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="When does the next term start?" aria-label="Question" maxLength={500} />
          <Button type="submit" loading={ask.isPending} disabled={question.trim().length < 3} aria-label="Ask">
            <Search />
          </Button>
        </form>
        {!ready && !ask.data && <p className="text-[12px] text-muted-foreground">Add a document first — answers only come from ready documents.</p>}
        {ask.error && <FormError message={ask.error instanceof Error ? ask.error.message : 'Could not ask'} />}
        {ask.data && (
          <div className="space-y-3 border-t border-border pt-3">
            <div className="text-[13.5px] leading-relaxed [overflow-wrap:anywhere]">
              <Markdown text={ask.data.answer} />
            </div>
            {ask.data.sources.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">Sources</p>
                {ask.data.sources.map((s, i) => (
                  <div key={i} className="rounded-lg border border-border bg-muted/30 p-2.5">
                    <p className="text-[12.5px] font-medium">
                      [{i + 1}] {s.title}
                    </p>
                    <p className="mt-0.5 line-clamp-3 text-[12px] text-muted-foreground [overflow-wrap:anywhere]">{s.excerpt}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-warning">No document covers this yet — consider adding one.</p>
            )}
            {ask.data.model && <p className="text-[11px] text-muted-foreground">Answered by {ask.data.model}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ add / edit

function AudienceSelect({ value, onChange, id }: { value: KbAudience; onChange: (v: KbAudience) => void; id: string }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as KbAudience)}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {KB_AUDIENCES.map((a) => (
          <SelectItem key={a} value={a}>
            {KB_AUDIENCE_LABELS[a]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AddDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [mode, setMode] = useState<'file' | 'text'>('file');
  const [title, setTitle] = useState('');
  const [audience, setAudience] = useState<KbAudience>('PARENTS');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const create = useMutation({
    mutationFn: async () => {
      const fileId = mode === 'file' && file ? (await uploadDoc(file)).id : null;
      return api.post<KbDocumentRow>('/knowledge/documents', { title: title.trim(), audience, fileId, text: mode === 'text' ? text : null });
    },
    onSuccess: after,
  });
  useEffect(() => {
    if (!open) return;
    setTitle('');
    setFile(null);
    setText('');
    setErrors({});
  }, [open]);

  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    const parsed = kbDocumentSchema.safeParse({ title, audience, text: mode === 'text' ? text : null });
    const errs = parsed.success ? {} : zodErrors(parsed.error.issues);
    if (mode === 'file' && !file) errs.file = 'Choose a PDF or Word document';
    if (mode === 'text' && text.trim().length < 20) errs.text = 'Paste at least a few sentences';
    if (Object.keys(errs).length) return setErrors(errs);
    create.mutate(undefined, {
      onSuccess: () => {
        toast.success('Document added', { description: 'It’s being read now; answers can use it in a moment.' });
        onOpenChange(false);
      },
      onError: (err) => setErrors(apiFieldErrors(err)),
    });
  };

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Add a document" description="Upload a PDF or Word document, or paste text. It’s private to your school." icon={<FileUp />} submitLabel="Add document" pending={create.isPending} onSubmit={submit} size="lg">
      <div className="grid gap-4">
        <FormError message={errors.form} />
        <Segmented
          label="Source"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'file', label: 'Upload a file' },
            { value: 'text', label: 'Paste text' },
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" htmlFor="kb-title" error={errors.title}>
            <Input id="kb-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Parent handbook 2026/27" />
          </Field>
          <Field label="Who can get answers from it" htmlFor="kb-audience" error={errors.audience}>
            <AudienceSelect id="kb-audience" value={audience} onChange={setAudience} />
          </Field>
        </div>
        {mode === 'file' ? (
          <Field label="Document" error={errors.file} hint="PDF or Word (.docx), up to 10 MB. Scanned images without text can’t be read.">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={cn('flex w-full items-center gap-3 rounded-xl border border-dashed p-4 text-left transition-colors hover:border-border-strong', file ? 'border-brand bg-brand-soft/30' : 'border-border')}
            >
              <FileUp className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-medium">{file ? file.name : 'Choose a file'}</span>
                <span className="block text-[12px] text-muted-foreground">{file ? `${formatNumber(Math.round(file.size / 1024))} KB` : 'Click to browse'}</span>
              </span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !title) setTitle(f.name.replace(/\.(pdf|docx)$/i, '').replace(/[_-]+/g, ' '));
                e.target.value = '';
              }}
            />
          </Field>
        ) : (
          <Field label="Text" htmlFor="kb-text" error={errors.text} hint={`${formatNumber(text.length)} characters`}>
            <Textarea id="kb-text" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your FAQ, policy or guide here…" />
          </Field>
        )}
      </div>
    </FormDialog>
  );
}

function EditDialog({ doc, onOpenChange }: { doc: KbDocumentRow | null; onOpenChange: (o: boolean) => void }) {
  const [title, setTitle] = useState('');
  const [audience, setAudience] = useState<KbAudience>('PARENTS');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({ mutationFn: (body: { title: string; audience: KbAudience }) => api.put(`/knowledge/documents/${doc?.id}`, body), onSuccess: after });
  useEffect(() => {
    if (!doc) return;
    setTitle(doc.title);
    setAudience(doc.audience);
    setErrors({});
  }, [doc]);
  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    if (title.trim().length < 2) return setErrors({ title: 'Give it a title' });
    save.mutate({ title: title.trim(), audience }, { onSuccess: () => (toast.success('Saved'), onOpenChange(false)), onError: (err) => setErrors(apiFieldErrors(err)) });
  };
  return (
    <FormDialog open={!!doc} onOpenChange={onOpenChange} title="Rename or share" icon={<Pencil />} submitLabel="Save" pending={save.isPending} onSubmit={submit} size="sm">
      <div className="grid gap-4">
        <FormError message={errors.form} />
        <Field label="Title" htmlFor="kb-edit-title" error={errors.title}>
          <Input id="kb-edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Who can get answers from it" htmlFor="kb-edit-audience" hint="“Everyone” includes visitors to your public website.">
          <AudienceSelect id="kb-edit-audience" value={audience} onChange={setAudience} />
        </Field>
      </div>
    </FormDialog>
  );
}
