import { POST_CATEGORIES, POST_CATEGORY_LABELS, postSchema, type PostCategory, type WebsitePostRow } from '@aischool/shared';
import { ExternalLink, MoreHorizontal, Newspaper, Pencil, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { type Column, DataTable } from '@/components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { FormDialog, SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { formatDate } from '@/lib/format';
import { apiFieldErrors, dateInput, FormError } from '../operations/ui';
import { useSearchFlag } from '../planning/ui';
import { type PostInputBody, useDeletePost, usePosts, useSavePost, useWebsiteOverview } from './api';
import { AiDraftButton, ImageUpload, str } from './ui';

export default function WebsiteNewsTab() {
  const q = usePosts();
  const o = useWebsiteOverview();
  const [isNew, setNew] = useSearchFlag('new');
  const [editing, setEditing] = React.useState<WebsitePostRow | null>(null);
  const [deleting, setDeleting] = React.useState<WebsitePostRow | null>(null);
  const del = useDeletePost();
  const site = o.data?.publicUrl;
  const live = o.data?.settings.published;

  const columns: Column<WebsitePostRow>[] = [
    {
      key: 'title',
      header: 'Post',
      cell: (p) => (
        <div className="flex min-w-0 items-center gap-3">
          <div className="size-10 shrink-0 overflow-hidden rounded-lg bg-muted">{p.coverUrl ? <img src={p.coverUrl} alt="" className="size-full object-cover" /> : <Newspaper className="m-3 size-4 text-muted-foreground" />}</div>
          <div className="min-w-0">
            <p className="truncate font-medium">{p.title}</p>
            {p.excerpt && <p className="max-w-[460px] truncate text-[12.5px] text-muted-foreground">{p.excerpt}</p>}
          </div>
        </div>
      ),
    },
    { key: 'category', header: 'Category', cell: (p) => <Badge variant="outline">{POST_CATEGORY_LABELS[p.category]}</Badge>, headClassName: 'hidden lg:table-cell', className: 'hidden lg:table-cell' },
    {
      key: 'status',
      header: 'Status',
      cell: (p) =>
        p.status === 'PUBLISHED' ? (
          <Badge variant="success" dot>
            Published
          </Badge>
        ) : (
          <Badge variant="secondary" dot>
            Draft
          </Badge>
        ),
    },
    { key: 'date', header: 'Date', cell: (p) => <span className="whitespace-nowrap text-[13px] text-muted-foreground tabular">{p.status === 'PUBLISHED' ? formatDate(p.publishedAt) : `Edited ${formatDate(p.updatedAt)}`}</span> },
    { key: 'actions', header: <span className="sr-only">Actions</span>, cell: (p) => <RowMenu post={p} site={live ? site : undefined} onEdit={() => setEditing(p)} onDelete={() => setDeleting(p)} />, className: 'w-10 text-right' },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13.5px] text-muted-foreground">News, achievements and announcements for families. Posts appear on the News page and the latest three on the home page.</p>
        <Button onClick={() => setNew(true)}>
          <Plus /> New post
        </Button>
      </div>
      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={q.data}
          rowKey={(p) => p.id}
          loading={q.isLoading}
          error={q.error}
          onRetry={() => void q.refetch()}
          onRowClick={(p) => setEditing(p)}
          rowLabel={(p) => `Edit ${p.title}`}
          renderMobile={(p) => (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{p.title}</p>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                  {POST_CATEGORY_LABELS[p.category]} · {p.status === 'PUBLISHED' ? formatDate(p.publishedAt) : 'Draft'}
                </p>
              </div>
              {p.status === 'PUBLISHED' ? <Badge variant="success">Live</Badge> : <Badge variant="secondary">Draft</Badge>}
            </div>
          )}
          empty={{ icon: Newspaper, title: 'No news yet', description: 'Share achievements, events and announcements with families.', action: <Button onClick={() => setNew(true)}><Plus /> Write the first post</Button> }}
        />
      </Card>
      <PostDialog
        open={isNew || !!editing}
        post={editing}
        onOpenChange={(o) => {
          if (!o) {
            setNew(false);
            setEditing(null);
          }
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.title ?? ''}”?`}
        description="It disappears from the website straight away. This can’t be undone."
        confirmLabel="Delete post"
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </>
  );
}

function RowMenu({ post, site, onEdit, onDelete }: { post: WebsitePostRow; site?: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${post.title}`} onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil /> Edit
        </DropdownMenuItem>
        {site && post.status === 'PUBLISHED' && (
          <DropdownMenuItem asChild>
            <a href={`${site}/news/${post.slug}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink /> View on website
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onDelete} destructive>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const blank: PostInputBody = { title: '', excerpt: null, body: '', category: 'NEWS', coverUrl: null, status: 'DRAFT', publishedAt: null };

function PostDialog({ open, post, onOpenChange }: { open: boolean; post: WebsitePostRow | null; onOpenChange: (o: boolean) => void }) {
  const [v, setV] = React.useState<PostInputBody>(blank);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const save = useSavePost();
  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setV(post ? { title: post.title, excerpt: post.excerpt, body: post.body, category: post.category, coverUrl: post.coverUrl, status: post.status, publishedAt: post.status === 'PUBLISHED' ? post.publishedAt.slice(0, 10) : null } : blank);
  }, [open, post]);

  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    const parsed = postSchema.safeParse({ ...v, excerpt: v.excerpt || null, publishedAt: v.publishedAt || null });
    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const i of parsed.error.issues) map[String(i.path[0])] ??= i.path[0] === 'body' ? 'Write at least a couple of sentences' : i.path[0] === 'title' ? 'Give the post a title (3+ characters)' : i.message;
      setErrors(map);
      return;
    }
    save.mutate(
      { id: post?.id, body: parsed.data as PostInputBody },
      {
        onSuccess: (p) => {
          toast.success(p.status === 'PUBLISHED' ? 'Post published' : 'Draft saved');
          onOpenChange(false);
        },
        onError: (err) => setErrors(apiFieldErrors(err)),
      },
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={post ? 'Edit post' : 'New post'}
      description="Write in plain text. Use a blank line between paragraphs, “- ” for bullet points and **bold** for emphasis."
      icon={<Newspaper />}
      submitLabel={v.status === 'PUBLISHED' ? (post?.status === 'PUBLISHED' ? 'Save changes' : 'Publish') : 'Save draft'}
      pending={save.isPending}
      onSubmit={submit}
      size="xl"
    >
      <div className="grid gap-5">
        <div className="flex justify-end">
          <AiDraftButton kind="NEWS" label="Draft with AI" onApply={(d) => setV((x) => ({ ...x, title: str(d.title) || x.title, excerpt: str(d.excerpt) || x.excerpt, body: str(d.body) || x.body }))} />
        </div>
        <Field label="Title" htmlFor="p-title" error={errors.title}>
          <Input id="p-title" value={v.title} maxLength={160} onChange={(e) => setV((x) => ({ ...x, title: e.target.value }))} invalid={!!errors.title} />
        </Field>
        <Field label="Summary" htmlFor="p-excerpt" optional error={errors.excerpt} hint="One sentence shown on news cards.">
          <Input id="p-excerpt" value={v.excerpt ?? ''} maxLength={300} onChange={(e) => setV((x) => ({ ...x, excerpt: e.target.value }))} />
        </Field>
        <Field label="Story" htmlFor="p-body" error={errors.body}>
          <Textarea id="p-body" rows={12} value={v.body} onChange={(e) => setV((x) => ({ ...x, body: e.target.value }))} invalid={!!errors.body} className="h-auto font-[450]" />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Category" htmlFor="p-cat">
            <Select value={v.category} onValueChange={(category) => setV((x) => ({ ...x, category: category as PostCategory }))}>
              <SelectTrigger id="p-cat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POST_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {POST_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Date" htmlFor="p-date" optional hint="Defaults to today when published." error={errors.publishedAt}>
            <Input id="p-date" type="date" className={dateInput} value={v.publishedAt ?? ''} onChange={(e) => setV((x) => ({ ...x, publishedAt: e.target.value || null }))} />
          </Field>
        </div>
        <ImageUpload label="Cover photo" value={v.coverUrl} onChange={(coverUrl) => setV((x) => ({ ...x, coverUrl }))} />
        <SwitchRow label="Published" description={v.status === 'PUBLISHED' ? 'Visible on the website' : 'Only staff can see drafts'}>
          <Switch checked={v.status === 'PUBLISHED'} onCheckedChange={(on) => setV((x) => ({ ...x, status: on ? 'PUBLISHED' : 'DRAFT' }))} />
        </SwitchRow>
        <FormError message={errors.form} />
      </div>
    </FormDialog>
  );
}
