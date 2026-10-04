import { MATERIAL_KIND_LABELS, MATERIAL_KINDS, type MaterialAiDraft, type MaterialKind, type MaterialListQuery, type MaterialRow } from '@aischool/shared';
import { ChevronDown, Copy, Eye, EyeOff, FolderOpen, Link2, ListChecks, MoreHorizontal, NotebookPen, Pencil, Plus, Trash2, UploadCloud } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Markdown } from '@/components/ai/markdown';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { SearchInput } from '@/components/ui/search-input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { Segmented } from '../operations/ui';
import { useDeleteMaterial, useMaterialAi, useMaterialOptions, useMaterials, usePublishMaterial } from './api';
import { type EditorMode, type EditorTarget, MaterialEditor } from './editor';
import { MaterialTile, MaterialViewer } from './viewer';

/** Kinds the AI can read: written notes, and PDFs / Word documents. */
function aiReadable(m: MaterialRow) {
  if (m.kind === 'NOTE') return true;
  return (m.kind === 'DOCUMENT' || m.kind === 'SLIDES') && !!m.file && (m.file.mimeType === 'application/pdf' || m.file.mimeType.includes('wordprocessingml'));
}

type AiState = { m: MaterialRow; kind: 'summary' | 'questions'; draft: MaterialAiDraft | null; error: string | null };

export default function MaterialsPage() {
  const options = useMaterialOptions();
  const [who, setWho] = useState<'all' | 'mine'>('all');
  const [search, setSearch] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [classArmId, setClassArmId] = useState('');
  const [kind, setKind] = useState<MaterialKind | ''>('');
  const [termId, setTermId] = useState('');
  const q = useDebounced(search.trim(), 300);
  const params: MaterialListQuery = { mine: who === 'mine' ? 'true' : undefined, q: q || undefined, subjectId: subjectId || undefined, classArmId: classArmId || undefined, kind: kind || undefined, termId: termId || undefined };
  const list = useMaterials(params);
  const filtered = !!(q || subjectId || classArmId || kind || termId || who === 'mine');

  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [open, setOpen] = useState<MaterialRow | null>(null);
  const [deleting, setDeleting] = useState<MaterialRow | null>(null);
  const [ai, setAi] = useState<AiState | null>(null);
  const del = useDeleteMaterial();
  const publish = usePublishMaterial();
  const aiRun = useMaterialAi();
  const o = options.data;

  const arms = useMemo(() => (o?.levels ?? []).flatMap((l) => l.arms.map((a) => ({ id: a.id, label: `${l.name} ${a.name}`.trim() }))), [o]);
  const add = (mode: EditorMode) => setEditor({ mode });

  const runAi = (m: MaterialRow, k: 'summary' | 'questions') => {
    setAi({ m, kind: k, draft: null, error: null });
    aiRun.mutate(
      { id: m.id, kind: k },
      {
        onSuccess: (draft) => setAi((cur) => (cur?.m.id === m.id && cur.kind === k ? { ...cur, draft } : cur)),
        onError: (e) => setAi((cur) => (cur?.m.id === m.id && cur.kind === k ? { ...cur, error: errorMessage(e) } : cur)),
      },
    );
  };

  const addMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={!o}>
          <Plus /> Add material <ChevronDown className="opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem onSelect={() => add('upload')}>
          <UploadCloud /> Upload files
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => add('link')}>
          <Link2 /> Link or YouTube video
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => add('note')}>
          <NotebookPen /> Write a note
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <Page className="max-w-6xl">
      <PageHeader
        title="Study materials"
        description="Notes, documents, slides, videos and links for your classes. Students and parents find them in their app, sorted by subject."
        actions={addMenu}
      />

      <div className="mb-4 grid gap-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Search titles, topics…" className="sm:max-w-xs sm:flex-1" />
          <Segmented
            label="Whose"
            value={who}
            onChange={setWho}
            options={[
              { value: 'all', label: 'All materials' },
              { value: 'mine', label: 'Mine' },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex [&>*]:min-w-0">
          <FilterSelect label="Subject" value={subjectId} onChange={setSubjectId} all="All subjects" items={(o?.subjects ?? []).map((s) => ({ value: s.id, label: s.name }))} />
          <FilterSelect label="Class" value={classArmId} onChange={setClassArmId} all="All classes" items={arms.map((a) => ({ value: a.id, label: a.label }))} />
          <FilterSelect label="Type" value={kind} onChange={(v) => setKind(v as MaterialKind | '')} all="All types" items={MATERIAL_KINDS.map((k) => ({ value: k, label: MATERIAL_KIND_LABELS[k] }))} />
          <FilterSelect label="Term" value={termId} onChange={setTermId} all="All terms" items={(o?.terms ?? []).map((t) => ({ value: t.id, label: `${t.name}, ${t.sessionName}` }))} />
        </div>
      </div>

      {list.error && !list.data ? (
        <Card>
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        </Card>
      ) : !list.data ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : list.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={FolderOpen}
            title={filtered ? 'Nothing matches' : 'No study materials yet'}
            description={filtered ? 'Try clearing the search or filters.' : 'Upload notes, slides, worksheets or short videos, share a YouTube link, or write a note. Your classes see them in their app.'}
            action={
              filtered ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch('');
                    setSubjectId('');
                    setClassArmId('');
                    setKind('');
                    setTermId('');
                    setWho('all');
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button onClick={() => add('upload')} disabled={!o}>
                  <UploadCloud /> Upload files
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          <p className="mb-2 text-[12.5px] text-muted-foreground" aria-live="polite">
            {list.data.length} {list.data.length === 1 ? 'material' : 'materials'}
          </p>
          <Card className="divide-y divide-border overflow-hidden">
            {list.data.map((m) => (
              <MaterialTile
                key={m.id}
                m={m}
                staff
                onOpen={() => setOpen(m)}
                actions={
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${m.title}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <DropdownMenuItem onSelect={() => setOpen(m)}>
                        <Eye /> Open
                      </DropdownMenuItem>
                      {o?.aiEnabled && aiReadable(m) && (
                        <>
                          <DropdownMenuItem onSelect={() => runAi(m, 'summary')}>
                            <AiSparkle animated={false} /> Summarise into revision notes
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => runAi(m, 'questions')}>
                            <ListChecks /> Make 5 practice questions
                          </DropdownMenuItem>
                        </>
                      )}
                      {m.canEdit && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => setEditor({ mode: 'note', material: m })}>
                            <Pencil /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => publish.mutate({ id: m.id, published: !m.published })}>
                            {m.published ? <EyeOff /> : <Eye />} {m.published ? 'Hide from students' : 'Publish'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setDeleting(m)} className="text-danger focus:text-danger">
                            <Trash2 /> Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                }
              />
            ))}
          </Card>
        </>
      )}

      <MaterialViewer
        m={open}
        onOpenChange={(v) => !v && setOpen(null)}
        footer={(m) =>
          o?.aiEnabled && aiReadable(m) ? (
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setOpen(null);
                  runAi(m, 'summary');
                }}
              >
                <AiSparkle animated={false} /> Summarise into revision notes
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setOpen(null);
                  runAi(m, 'questions');
                }}
              >
                <ListChecks /> Make 5 practice questions
              </Button>
            </div>
          ) : null
        }
      />
      <MaterialEditor target={editor} options={o} onClose={() => setEditor(null)} />
      <AiDialog
        state={ai}
        onClose={() => setAi(null)}
        onRetry={() => ai && runAi(ai.m, ai.kind)}
        onSave={(draft, from) => {
          setAi(null);
          setEditor({ mode: 'note', draft: { title: draft.title, body: draft.markdown, from } });
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Delete “${deleting?.title ?? ''}”?`}
        description="Students and parents will no longer see it. This can’t be undone."
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </Page>
  );
}

function FilterSelect({ label, value, onChange, all, items }: { label: string; value: string; onChange: (v: string) => void; all: string; items: { value: string; label: string }[] }) {
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
      <SelectTrigger className="h-9 sm:w-44" aria-label={`Filter by ${label.toLowerCase()}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{all}</SelectItem>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The AI's draft: review it, copy it, or save it as a new note for the same classes. */
function AiDialog({ state, onClose, onRetry, onSave }: { state: AiState | null; onClose: () => void; onRetry: () => void; onSave: (d: MaterialAiDraft, from: MaterialRow) => void }) {
  const title = state?.kind === 'questions' ? 'Practice questions' : 'Revision notes';
  return (
    <Dialog open={!!state} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg">
        {state && (
          <>
            <DialogHeader>
              <div className="mb-2 grid size-10 place-items-center rounded-xl bg-ai-gradient text-white [&_svg]:size-5">
                <AiSparkle />
              </div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>
                A draft from “{state.m.title}”. Check it before sharing: the AI can make mistakes.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              {state.error ? (
                <div className="space-y-3">
                  <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft/50 px-3.5 py-2.5 text-[13px] text-danger">
                    {state.error}
                  </p>
                  <Button variant="outline" size="sm" onClick={onRetry}>
                    Try again
                  </Button>
                </div>
              ) : !state.draft ? (
                <div className="space-y-2" aria-busy="true" aria-label="Writing…">
                  <p className="text-[13px] text-muted-foreground">Reading the material and writing {state.kind === 'questions' ? 'questions' : 'notes'}… this takes a few seconds.</p>
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-11/12" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="mb-3 text-[15px] font-semibold">{state.draft.title}</p>
                  <Markdown text={state.draft.markdown} />
                </div>
              )}
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              {state.draft && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(`${state.draft!.title}\n\n${state.draft!.markdown}`)
                        .then(() => toast.success('Copied'))
                        .catch(() => toast.error('Couldn’t copy'));
                    }}
                  >
                    <Copy /> Copy
                  </Button>
                  <Button onClick={() => onSave(state.draft!, state.m)}>
                    <NotebookPen /> Save as a note
                  </Button>
                </>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
