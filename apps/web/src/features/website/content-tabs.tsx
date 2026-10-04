import { DOWNLOAD_AUDIENCE_LABELS, DOWNLOAD_AUDIENCES, DOWNLOAD_CATEGORIES, DOWNLOAD_CATEGORY_LABELS, type DownloadAudience, type DownloadCategory } from '@aischool/shared';
import { Check, Download, EyeOff, FileText, Globe, Images, Lock, Pencil, Plus, Trash2, X } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { type Column, DataTable } from '@/components/ui/data-table';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FormDialog, SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { formatDate } from '@/lib/format';
import { useCan } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { useStructure } from '../academics/api';
import { apiFieldErrors, dateInput, FormError } from '../operations/ui';
import {
  type AlbumInputBody,
  type DownloadInputBody,
  type WebsiteAlbumRow,
  type WebsiteDownloadRow,
  UPLOAD_ACCEPT,
  useAddPhoto,
  useAlbums,
  useDeleteAlbum,
  useDeleteDownload,
  useDeletePhoto,
  useDownloads,
  useSaveAlbum,
  useSaveDownload,
  useUpdatePhoto,
} from './api';
import { FileUploadButton } from './ui';

// ------------------------------------------------------------------ gallery

export function WebsiteGalleryTab() {
  const q = useAlbums();
  const [selected, setSelected] = React.useState<string | null>(null);
  const [dialog, setDialog] = React.useState<{ album: WebsiteAlbumRow | null } | null>(null);
  const albums = q.data;
  const current = albums?.find((a) => a.id === selected) ?? albums?.[0] ?? null;

  if (q.error && !albums) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13.5px] text-muted-foreground">Photo albums for the Gallery page. The first photo becomes the album cover.</p>
        <Button onClick={() => setDialog({ album: null })}>
          <Plus /> New album
        </Button>
      </div>
      {!albums ? (
        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : albums.length === 0 ? (
        <Card>
          <EmptyState icon={Images} title="No albums yet" description="Create an album — sports day, prize-giving, a school trip — then upload photos into it." action={<Button onClick={() => setDialog({ album: null })}><Plus /> Create an album</Button>} />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[280px_1fr] [&>*]:min-w-0">
          <Card className="h-fit p-2">
            <ul className="space-y-0.5">
              {albums.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(a.id)}
                    aria-current={current?.id === a.id}
                    className={cn('flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors', current?.id === a.id ? 'bg-muted' : 'hover:bg-muted/50')}
                  >
                    <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground">{a.photos[0] ? <img src={a.photos[0].url} alt="" className="size-full object-cover" /> : <Images className="size-4" />}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">{a.title}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {a.photos.length} {a.photos.length === 1 ? 'photo' : 'photos'}
                        {a.date && ` · ${formatDate(a.date)}`}
                      </p>
                    </div>
                    {!a.published && <EyeOff className="size-3.5 shrink-0 text-muted-foreground" aria-label="Hidden" />}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          {current && <AlbumPanel album={current} onEdit={() => setDialog({ album: current })} />}
        </div>
      )}
      <AlbumDialog
        open={!!dialog}
        album={dialog?.album ?? null}
        onOpenChange={(o) => !o && setDialog(null)}
        onCreated={(id) => setSelected(id)}
      />
    </>
  );
}

function AlbumPanel({ album, onEdit }: { album: WebsiteAlbumRow; onEdit: () => void }) {
  const add = useAddPhoto();
  const del = useDeleteAlbum();
  const [confirm, setConfirm] = React.useState(false);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-display text-[15px] font-semibold tracking-tight">{album.title}</h2>
            {album.published ? <Badge variant="success">On the website</Badge> : <Badge variant="secondary">Hidden</Badge>}
          </div>
          {album.description && <p className="mt-0.5 text-[13px] text-muted-foreground">{album.description}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil /> Edit
          </Button>
          <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setConfirm(true)}>
            <Trash2 /> Delete
          </Button>
          <FileUploadButton accept={UPLOAD_ACCEPT.image} multiple variant="default" onUploaded={(f) => add.mutate({ albumId: album.id, url: f.url, caption: null }, { onSuccess: () => toast.success('Photo added') })}>
            Upload photos
          </FileUploadButton>
        </div>
      </div>
      {album.photos.length === 0 ? (
        <EmptyState compact icon={Images} title="No photos in this album" description="Upload JPG, PNG or WebP photos — up to 10 MB each. You can pick several at once." />
      ) : (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 xl:grid-cols-4">
          {album.photos.map((p, i) => (
            <PhotoTile key={p.id} photo={p} cover={i === 0} />
          ))}
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete “${album.title}”?`}
        description={`The album and its ${album.photos.length} ${album.photos.length === 1 ? 'photo' : 'photos'} are removed from the website.`}
        confirmLabel="Delete album"
        loading={del.isPending}
        onConfirm={() => del.mutate(album.id, { onSuccess: () => setConfirm(false) })}
      />
    </Card>
  );
}

function PhotoTile({ photo, cover }: { photo: WebsiteAlbumRow['photos'][number]; cover: boolean }) {
  const [caption, setCaption] = React.useState(photo.caption ?? '');
  React.useEffect(() => setCaption(photo.caption ?? ''), [photo.caption]);
  const update = useUpdatePhoto();
  const del = useDeletePhoto();
  const commit = () => {
    const next = caption.trim() || null;
    if (next === (photo.caption ?? null)) return;
    update.mutate({ id: photo.id, caption: next }, { onSuccess: () => toast.success('Caption saved') });
  };
  return (
    <figure className="group overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative aspect-square bg-muted">
        <img src={photo.url} alt={photo.caption ?? ''} loading="lazy" className="size-full object-cover" />
        {cover && <Badge className="absolute left-2 top-2 bg-black/60 text-white">Cover</Badge>}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Delete photo"
          loading={del.isPending}
          onClick={() => del.mutate(photo.id)}
          className="absolute right-2 top-2 bg-black/50 text-white opacity-100 hover:bg-danger hover:text-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        >
          {!del.isPending && <X />}
        </Button>
      </div>
      <figcaption className="relative p-1.5">
        <Input
          value={caption}
          placeholder="Add a caption"
          aria-label="Caption"
          maxLength={200}
          className="h-8 border-transparent bg-transparent px-2 text-[12.5px] shadow-none hover:border-border focus-visible:border-ring"
          onChange={(e) => setCaption(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
        {update.isSuccess && caption === (photo.caption ?? '') && <Check className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-success" aria-hidden />}
      </figcaption>
    </figure>
  );
}

function AlbumDialog({ open, album, onOpenChange, onCreated }: { open: boolean; album: WebsiteAlbumRow | null; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const [v, setV] = React.useState<AlbumInputBody>({ title: '', description: null, date: null, published: true });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const save = useSaveAlbum();
  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setV(album ? { title: album.title, description: album.description, date: album.date, published: album.published } : { title: '', description: null, date: null, published: true });
  }, [open, album]);
  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    if (v.title.trim().length < 2) {
      setErrors({ title: 'Give the album a name' });
      return;
    }
    save.mutate(
      { id: album?.id, body: { ...v, title: v.title.trim(), description: v.description?.trim() || null } },
      {
        onSuccess: (r) => {
          toast.success(album ? 'Album updated' : 'Album created — now upload some photos');
          if (!album) onCreated(r.id);
          onOpenChange(false);
        },
        onError: (err) => setErrors(apiFieldErrors(err)),
      },
    );
  };
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={album ? 'Edit album' : 'New album'} icon={<Images />} submitLabel={album ? 'Save' : 'Create album'} pending={save.isPending} onSubmit={submit}>
      <div className="grid gap-5">
        <Field label="Name" htmlFor="al-title" error={errors.title}>
          <Input id="al-title" value={v.title} maxLength={120} placeholder="e.g. Inter-house sports 2026" onChange={(e) => setV((x) => ({ ...x, title: e.target.value }))} invalid={!!errors.title} />
        </Field>
        <Field label="Description" htmlFor="al-desc" optional>
          <Textarea className="h-auto" id="al-desc" rows={2} maxLength={500} value={v.description ?? ''} onChange={(e) => setV((x) => ({ ...x, description: e.target.value }))} />
        </Field>
        <Field label="Date" htmlFor="al-date" optional error={errors.date}>
          <Input id="al-date" type="date" className={dateInput} value={v.date ?? ''} onChange={(e) => setV((x) => ({ ...x, date: e.target.value || null }))} />
        </Field>
        <SwitchRow label="Show on the website" description="Hidden albums stay here until you’re ready.">
          <Switch checked={v.published} onCheckedChange={(published) => setV((x) => ({ ...x, published }))} />
        </SwitchRow>
        <FormError message={errors.form} />
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ downloads

function fileSize(name: string) {
  return name.split('.').pop()?.toUpperCase() ?? 'FILE';
}

export function WebsiteDownloadsTab() {
  const q = useDownloads();
  const [dialog, setDialog] = React.useState<{ row: WebsiteDownloadRow | null } | null>(null);
  const [deleting, setDeleting] = React.useState<WebsiteDownloadRow | null>(null);
  const del = useDeleteDownload();
  const columns: Column<WebsiteDownloadRow>[] = [
    {
      key: 'title',
      header: 'Document',
      cell: (d) => (
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
            <FileText className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{d.title}</p>
            {d.description && <p className="max-w-[420px] truncate text-[12.5px] text-muted-foreground">{d.description}</p>}
          </div>
        </div>
      ),
    },
    { key: 'cat', header: 'Category', cell: (d) => <Badge variant="outline">{DOWNLOAD_CATEGORY_LABELS[d.category]}</Badge> },
    { key: 'audience', header: 'Who can see it', cell: (d) => <AudienceBadge d={d} />, headClassName: 'hidden md:table-cell', className: 'hidden md:table-cell' },
    { key: 'status', header: 'Status', cell: (d) => (d.published ? <Badge variant="success" dot>Published</Badge> : <Badge variant="secondary" dot>Hidden</Badge>), headClassName: 'hidden lg:table-cell', className: 'hidden lg:table-cell' },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      cell: (d) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button asChild variant="ghost" size="icon-sm" aria-label={`Open ${d.title}`}>
            <a href={d.fileUrl} target="_blank" rel="noopener noreferrer">
              <Download />
            </a>
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={`Delete ${d.title}`} onClick={() => setDeleting(d)}>
            <Trash2 />
          </Button>
        </div>
      ),
    },
  ];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13.5px] text-muted-foreground">Prospectus, forms, calendars and policies families can download. Public documents show on the website; the rest only in the parent and student portal. PDF, Word, Excel, PowerPoint or images, up to 10 MB.</p>
        <Button onClick={() => setDialog({ row: null })}>
          <Plus /> Add document
        </Button>
      </div>
      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={q.data}
          rowKey={(d) => d.id}
          loading={q.isLoading}
          error={q.error}
          onRetry={() => void q.refetch()}
          onRowClick={(d) => setDialog({ row: d })}
          rowLabel={(d) => `Edit ${d.title}`}
          renderMobile={(d) => (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{d.title}</p>
                <p className="text-[12.5px] text-muted-foreground">
                  {DOWNLOAD_CATEGORY_LABELS[d.category]}
                  {!d.published && ' · Hidden'}
                </p>
                <div className="mt-1">
                  <AudienceBadge d={d} />
                </div>
              </div>
              <Pencil className="size-4 shrink-0 text-muted-foreground" />
            </div>
          )}
          empty={{ icon: FileText, title: 'No documents yet', description: 'Upload your prospectus, admission forms or the school calendar.', action: <Button onClick={() => setDialog({ row: null })}><Plus /> Add a document</Button> }}
        />
      </Card>
      <DownloadDialog open={!!dialog} row={dialog?.row ?? null} onOpenChange={(o) => !o && setDialog(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Remove “${deleting?.title ?? ''}”?`}
        description="It disappears from the website and the parent and student portal."
        confirmLabel="Remove"
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </>
  );
}

function DownloadDialog({ open, row, onOpenChange }: { open: boolean; row: WebsiteDownloadRow | null; onOpenChange: (o: boolean) => void }) {
  const blank: DownloadInputBody = { title: '', description: null, category: 'FORMS', fileUrl: '', published: true, audience: 'PUBLIC', classLevelIds: [] };
  const [v, setV] = React.useState<DownloadInputBody>(blank);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const save = useSaveDownload();
  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setFileName(null);
    setV(
      row
        ? { title: row.title, description: row.description, category: row.category, fileUrl: row.fileUrl, published: row.published, audience: row.audience ?? 'PUBLIC', classLevelIds: row.classLevelIds ?? [] }
        : blank,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row]);
  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    const errs: Record<string, string> = {};
    if (!v.fileUrl) errs.fileUrl = 'Upload the file first';
    if (v.title.trim().length < 2) errs.title = 'Give the document a title';
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    save.mutate(
      { id: row?.id, body: { ...v, title: v.title.trim(), description: v.description?.trim() || null } },
      {
        onSuccess: () => {
          toast.success(row ? 'Document updated' : 'Document added');
          onOpenChange(false);
        },
        onError: (err) => setErrors(apiFieldErrors(err)),
      },
    );
  };
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={row ? 'Edit document' : 'Add a document'} icon={<FileText />} submitLabel={row ? 'Save' : 'Add document'} pending={save.isPending} onSubmit={submit}>
      <div className="grid gap-5">
        <Field label="File" htmlFor="dl-file" error={errors.fileUrl}>
          <div id="dl-file" className={cn('flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-3', errors.fileUrl ? 'border-danger' : 'border-border-strong')}>
            {v.fileUrl ? (
              <span className="inline-flex min-w-0 items-center gap-2 text-[13px]">
                <Badge variant="brand">{fileName ? fileSize(fileName) : 'File'}</Badge>
                <span className="truncate">{fileName ?? 'Uploaded file'}</span>
              </span>
            ) : (
              <span className="text-[13px] text-muted-foreground">No file yet</span>
            )}
            <div className="ml-auto">
              <FileUploadButton
                onUploaded={(f, file) => {
                  setV((x) => ({ ...x, fileUrl: f.url, title: x.title || file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') }));
                  setFileName(file.name);
                  setErrors(({ fileUrl: _f, ...rest }) => rest);
                }}
              >
                {v.fileUrl ? 'Replace file' : 'Upload file'}
              </FileUploadButton>
            </div>
          </div>
        </Field>
        <Field label="Title" htmlFor="dl-title" error={errors.title}>
          <Input id="dl-title" value={v.title} maxLength={160} onChange={(e) => setV((x) => ({ ...x, title: e.target.value }))} invalid={!!errors.title} />
        </Field>
        <Field label="Description" htmlFor="dl-desc" optional>
          <Input id="dl-desc" value={v.description ?? ''} maxLength={300} onChange={(e) => setV((x) => ({ ...x, description: e.target.value }))} />
        </Field>
        <Field label="Category" htmlFor="dl-cat">
          <Select value={v.category} onValueChange={(c) => setV((x) => ({ ...x, category: c as DownloadCategory }))}>
            <SelectTrigger id="dl-cat">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOWNLOAD_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {DOWNLOAD_CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          label="Who can see this"
          htmlFor="dl-audience"
          hint={
            v.audience === 'PUBLIC'
              ? 'Shown on the public website and in the parent and student portal.'
              : 'Only in the signed-in parent and student portal. It won’t appear on the public website.'
          }
        >
          <Select value={v.audience} onValueChange={(a) => setV((x) => ({ ...x, audience: a as DownloadAudience, classLevelIds: a === 'PUBLIC' ? [] : x.classLevelIds }))}>
            <SelectTrigger id="dl-audience">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOWNLOAD_AUDIENCES.map((a) => (
                <SelectItem key={a} value={a}>
                  {DOWNLOAD_AUDIENCE_LABELS[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {v.audience !== 'PUBLIC' && (
          <Field label="Only for these classes" optional hint={v.classLevelIds.length ? undefined : 'None picked: every class sees it.'}>
            <ClassLevelPicker value={v.classLevelIds} onChange={(classLevelIds) => setV((x) => ({ ...x, classLevelIds }))} />
          </Field>
        )}
        <SwitchRow label="Published" description={v.published ? 'Families can see and download it.' : 'Hidden from everyone until you publish it.'}>
          <Switch checked={v.published} onCheckedChange={(published) => setV((x) => ({ ...x, published }))} />
        </SwitchRow>
        <FormError message={errors.form} />
      </div>
    </FormDialog>
  );
}

const AUDIENCE_SHORT: Record<DownloadAudience, string> = {
  PUBLIC: 'Website & portal',
  FAMILIES: 'Portal: families',
  PARENTS: 'Portal: parents',
  STUDENTS: 'Portal: students',
};

function AudienceBadge({ d }: { d: WebsiteDownloadRow }) {
  const audience = d.audience ?? 'PUBLIC';
  const n = audience === 'PUBLIC' ? 0 : (d.classLevelIds?.length ?? 0);
  return (
    <Badge variant={audience === 'PUBLIC' ? 'info' : 'secondary'} title={DOWNLOAD_AUDIENCE_LABELS[audience]}>
      {audience === 'PUBLIC' ? <Globe /> : <Lock />}
      {AUDIENCE_SHORT[audience]}
      {n > 0 && ` · ${n} ${n === 1 ? 'class' : 'classes'}`}
    </Badge>
  );
}

/** Class levels as toggle chips; none picked means every class. */
function ClassLevelPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const s = useStructure();
  const canSee = useCan('academics.read');
  if (!canSee) return <p className="text-[12.5px] text-muted-foreground">{value.length ? `${value.length} classes picked.` : 'Every class.'} Ask someone with access to the class list to change this.</p>;
  if (s.isLoading) return <p className="text-[12.5px] text-muted-foreground">Loading classes…</p>;
  const levels = [...(s.data?.classLevels ?? [])].sort((a, b) => a.order - b.order);
  if (!levels.length) return <p className="text-[12.5px] text-muted-foreground">No classes set up yet, so every class sees it.</p>;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="flex flex-wrap gap-1.5 rounded-xl border border-border p-3" role="group" aria-label="Only for these classes">
      {levels.map((l) => {
        const on = value.includes(l.id);
        return (
          <button
            key={l.id}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(l.id)}
            className={cn(
              'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              on ? 'border-brand bg-brand text-brand-foreground' : 'border-border bg-card hover:bg-muted/50',
            )}
          >
            {on && <Check className="size-3.5" aria-hidden />}
            {l.name}
          </button>
        );
      })}
    </div>
  );
}
