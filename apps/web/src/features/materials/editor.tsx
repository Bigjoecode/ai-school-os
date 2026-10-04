import { type MaterialInput, type MaterialKind, type MaterialOptions, type MaterialRow, youtubeId } from '@aischool/shared';
import { Eye, FileUp, Link2, NotebookPen, PencilLine, UploadCloud } from 'lucide-react';
import { type DragEvent, type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Markdown } from '@/components/ai/markdown';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { FormError, Segmented } from '../operations/ui';
import { ATTACH_ACCEPT, kindOfMime, UploadRows, useUploads } from '../live/files';
import { useSaveMaterial } from './api';

export type EditorMode = 'upload' | 'link' | 'note';

/** What the editor opens with: a new upload / link / note, an existing material, or an AI draft to save as a note. */
export type EditorTarget = { mode: EditorMode; material?: MaterialRow; draft?: { title: string; body: string; from: MaterialRow } };

const MODE_COPY: Record<EditorMode, { title: string; icon: typeof FileUp }> = {
  upload: { title: 'Upload files', icon: UploadCloud },
  link: { title: 'Share a link or YouTube video', icon: Link2 },
  note: { title: 'Write a note', icon: NotebookPen },
};

const MAX_FILES = 10;

/** The kind a file becomes: pictures, videos, audio, PowerPoint as slides, everything else a document. */
function kindForFile(mime: string, name: string): MaterialKind {
  const k = kindOfMime(mime);
  if (k !== 'DOCUMENT') return k;
  return /\.pptx$/i.test(name) || mime.includes('presentationml') ? 'SLIDES' : 'DOCUMENT';
}

const stripExt = (name: string) => name.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_-]+/g, ' ').trim();

interface Targets {
  subjectId: string;
  classLevelIds: string[];
  classArmIds: string[];
  termId: string;
  topic: string;
}

export function MaterialEditor({ target, options, onClose }: { target: EditorTarget | null; options: MaterialOptions | undefined; onClose: () => void }) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">{target && options && <EditorForm key={target.material?.id ?? target.mode + (target.draft?.title ?? '')} target={target} options={options} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function EditorForm({ target, options, onClose }: { target: EditorTarget; options: MaterialOptions; onClose: () => void }) {
  const m = target.material;
  const src = m ?? target.draft?.from;
  const editing = !!m;
  const mode: EditorMode = m ? (m.kind === 'NOTE' ? 'note' : m.file ? 'upload' : 'link') : target.mode;
  const current = options.terms.find((t) => t.isCurrent);
  const [t, setT] = useState<Targets>({
    subjectId: src?.subject?.id ?? '',
    classLevelIds: src?.classLevels.map((l) => l.id) ?? [],
    classArmIds: src?.classArms.map((a) => a.id) ?? [],
    termId: src?.term?.id ?? (editing ? '' : (current?.id ?? '')),
    topic: src?.topic ?? '',
  });
  const [title, setTitle] = useState(m?.title ?? target.draft?.title ?? '');
  const [description, setDescription] = useState(m?.description ?? '');
  const [url, setUrl] = useState(m?.url ?? '');
  const [body, setBody] = useState(m?.body ?? target.draft?.body ?? '');
  const [published, setPublished] = useState(m?.published ?? true);
  const [notify, setNotify] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const uploads = useUploads(editing ? 1 : MAX_FILES);
  const save = useSaveMaterial();
  const Icon = editing ? PencilLine : MODE_COPY[mode].icon;

  const whole = !t.classLevelIds.length && !t.classArmIds.length;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (whole && !options.wholeSchool) errs.classes = 'Choose at least one class';
    if ((mode !== 'upload' || editing) && title.trim().length < 2) errs.title = 'Give it a title';
    if (mode === 'note' && !body.trim()) errs.body = 'Write the note';
    if (mode === 'link' && !/^https:\/\/\S+$/i.test(url.trim())) errs.url = 'Paste a full https:// link';
    if (mode === 'upload' && !editing && !uploads.done.length) errs.files = 'Add at least one file';
    if (mode === 'upload' && editing && !m?.file && !uploads.done.length) errs.files = 'Upload the file';
    if (uploads.busy) errs.files = 'Wait for the uploads to finish';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const base = {
      description: description.trim() || null,
      subjectId: t.subjectId || null,
      classLevelIds: t.classLevelIds,
      classArmIds: t.classArmIds,
      termId: t.termId || null,
      topic: t.topic.trim() || null,
      published,
      notify,
    };
    const bodies: (MaterialInput & { uploadKey?: string })[] = [];
    if (mode === 'note') bodies.push({ ...base, title: title.trim(), kind: 'NOTE', body });
    else if (mode === 'link') bodies.push({ ...base, title: title.trim(), kind: youtubeId(url.trim()) ? 'VIDEO' : (m?.kind ?? 'LINK'), url: url.trim() });
    else if (editing) {
      // The current file stays unless a new one was uploaded.
      const f = uploads.done[0];
      bodies.push({ ...base, title: title.trim(), kind: f ? kindForFile(f.mimeType, f.name) : m!.kind, fileId: f ? f.fileId : (m!.file?.id ?? null), url: f ? null : m!.url });
    } else {
      for (const f of uploads.done) bodies.push({ ...base, title: uploads.done.length === 1 && title.trim() ? title.trim() : stripExt(f.name).slice(0, 160) || f.name, kind: kindForFile(f.mimeType, f.name), fileId: f.fileId, uploadKey: f.key });
    }

    setSaving(true);
    try {
      // One material per file; files already saved leave the list, so a retry doesn't share them twice.
      for (const { uploadKey, ...b } of bodies) {
        await save.mutateAsync({ id: m?.id, body: b });
        if (uploadKey) uploads.remove(uploadKey);
      }
      toast.success(editing ? 'Saved' : bodies.length > 1 ? `${bodies.length} materials shared` : published ? 'Shared with the class' : 'Saved as a draft');
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.errors.length) setErrors(Object.fromEntries(err.errors.map((x) => [x.path, x.message])));
      else setErrors({ form: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const files = [...e.dataTransfer.files];
    if (files.length) uploads.add(files, uploads.items.length);
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <div className="mb-2 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand [&_svg]:size-5">
          <Icon />
        </div>
        <DialogTitle>{editing ? `Edit “${m!.title}”` : target.draft ? 'Save as a note' : MODE_COPY[mode].title}</DialogTitle>
        <DialogDescription>
          {mode === 'upload' && !editing
            ? 'PDFs, Word, PowerPoint and Excel files, pictures, short videos and audio. Each file becomes one material.'
            : mode === 'link'
              ? 'A YouTube video plays inside the app; other links open in the browser.'
              : mode === 'note'
                ? 'Write it in plain text. Use # for headings, - for bullet points and **bold** for key words.'
                : 'Change the details, or replace the file.'}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <FormError message={errors.form} />

        {mode === 'upload' && (
          <Field label={editing ? 'Replace the file' : 'Files'} error={errors.files ?? errors.fileId} optional={editing}>
            <DropZone onFiles={(files) => uploads.add(files, uploads.items.length)} onDrop={onDrop} multiple={!editing} />
            <UploadRows items={uploads.items} onRemove={uploads.remove} />
            {editing && m?.file && !uploads.items.length && <p className="text-[12px] text-muted-foreground">Current file: {m.file.name}</p>}
          </Field>
        )}

        {(mode !== 'upload' || editing || uploads.done.length <= 1) && (
          <Field label="Title" htmlFor="mat-title" error={errors.title} hint={mode === 'upload' && !editing ? 'Leave it empty to use the file name' : undefined}>
            <Input
              id="mat-title"
              value={title}
              placeholder={mode === 'upload' && uploads.done[0] ? stripExt(uploads.done[0].name) : 'e.g. Fractions: worked examples'}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              invalid={!!errors.title}
            />
          </Field>
        )}
        {mode === 'upload' && !editing && uploads.done.length > 1 && <p className="text-[12.5px] text-muted-foreground">Each file is titled with its name; you can rename them afterwards.</p>}

        {mode === 'link' && (
          <Field label="Link" htmlFor="mat-url" error={errors.url} hint={youtubeId(url) ? 'YouTube video: it will play inside the app.' : 'YouTube, Google Drive, a website…'}>
            <Input id="mat-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" invalid={!!errors.url} />
          </Field>
        )}

        {mode === 'note' && <NoteEditor value={body} onChange={setBody} error={errors.body} />}

        <Field label="Description" htmlFor="mat-desc" optional error={errors.description}>
          <Textarea id="mat-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} placeholder="What it covers, or what to do with it" />
        </Field>

        <TargetFields value={t} onChange={setT} options={options} error={errors.classes ?? errors.classArmIds ?? errors.classLevelIds} />

        <div className="grid gap-2">
          <ToggleRow label="Publish now" description="Students and parents see it straight away. Turn off to save a draft." checked={published} onChange={setPublished} />
          {published && (!editing || !m?.published) && <ToggleRow label="Tell the class" description="Students and their parents get a notification in the app." checked={notify} onChange={setNotify} />}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={saving} disabled={uploads.busy}>
          {editing ? 'Save' : published ? 'Share' : 'Save draft'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 px-4 py-3">
      <span>
        <span className="block text-[13.5px] font-medium">{label}</span>
        <span className="block text-[12px] text-muted-foreground">{description}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function DropZone({ onFiles, onDrop, multiple }: { onFiles: (files: File[]) => void; onDrop: (e: DragEvent) => void; multiple: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        onDrop(e);
      }}
      className={cn('flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors', over ? 'border-brand bg-brand-soft/40' : 'border-border bg-muted/30')}
    >
      <UploadCloud className="size-6 text-muted-foreground" aria-hidden />
      <p className="text-[13px] text-muted-foreground">
        <span className="hidden sm:inline">Drag files here, or </span>
        <Button type="button" variant="link" className="text-[13px]" onClick={() => input.current?.click()}>
          choose {multiple ? 'files' : 'a file'}
        </Button>
      </p>
      <p className="text-[11.5px] text-muted-foreground">Documents up to 10 MB · videos and audio up to 50 MB (use YouTube for longer videos)</p>
      <input
        ref={input}
        type="file"
        accept={ATTACH_ACCEPT}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}

/** A plain markdown editor with a preview, rendered the way students will see it. */
export function NoteEditor({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  return (
    <Field label="Note" htmlFor="mat-body" error={error}>
      <Segmented
        label="Note view"
        size="sm"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'write', label: <><PencilLine /> Write</> },
          { value: 'preview', label: <><Eye /> Preview</> },
        ]}
      />
      {tab === 'write' ? (
        <Textarea
          id="mat-body"
          rows={12}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={50_000}
          invalid={!!error}
          className="font-mono text-[13px]"
          placeholder={'# Fractions\n\nA fraction is part of a whole.\n\n- The top number is the numerator\n- The bottom number is the denominator\n\n**Remember:** you can only add fractions with the same denominator.'}
        />
      ) : (
        <div className="min-h-48 rounded-xl border border-border bg-card p-4">{value.trim() ? <Markdown text={value} /> : <p className="text-[13px] text-muted-foreground">Nothing to preview yet.</p>}</div>
      )}
    </Field>
  );
}

/** Subject, classes, term and topic. Teachers only see the classes they can share with. */
function TargetFields({ value: t, onChange, options, error }: { value: Targets; onChange: (t: Targets) => void; options: MaterialOptions; error?: string }) {
  const set = (p: Partial<Targets>) => onChange({ ...t, ...p });
  const allowedArm = useMemo(() => {
    if (options.manageAll) return () => true;
    const teaches = new Set(options.teaches.map((x) => `${x.classArmId}|${x.subjectId}`));
    const leads = new Set(options.leads);
    return (armId: string) => leads.has(armId) || (!!t.subjectId && teaches.has(`${armId}|${t.subjectId}`));
  }, [options, t.subjectId]);
  // Teachers: subjects they teach first (any subject is fine for a class they lead).
  const subjects = useMemo(() => {
    if (options.manageAll) return options.subjects;
    const mine = new Set(options.teaches.map((x) => x.subjectId));
    return options.leads.length ? options.subjects : options.subjects.filter((s) => mine.has(s.id));
  }, [options]);
  const levels = options.levels.map((l) => ({ ...l, arms: l.arms.filter((a) => allowedArm(a.id)), all: l.arms.length > 0 && l.arms.every((a) => allowedArm(a.id)) })).filter((l) => l.arms.length);

  // Drop classes that are no longer allowed when the subject changes.
  useEffect(() => {
    if (options.manageAll) return;
    const arms = t.classArmIds.filter((id) => allowedArm(id));
    const lv = t.classLevelIds.filter((id) => levels.find((l) => l.id === id)?.all);
    if (arms.length !== t.classArmIds.length || lv.length !== t.classLevelIds.length) onChange({ ...t, classArmIds: arms, classLevelIds: lv });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.subjectId]);

  const toggleLevel = (id: string, armIds: string[]) => {
    const on = t.classLevelIds.includes(id);
    set({ classLevelIds: on ? t.classLevelIds.filter((x) => x !== id) : [...t.classLevelIds, id], classArmIds: t.classArmIds.filter((a) => !armIds.includes(a)) });
  };
  const toggleArm = (id: string) => set({ classArmIds: t.classArmIds.includes(id) ? t.classArmIds.filter((x) => x !== id) : [...t.classArmIds, id] });
  const whole = !t.classLevelIds.length && !t.classArmIds.length;

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Subject" htmlFor="mat-subject" optional={options.manageAll || options.leads.length > 0}>
          <Select value={t.subjectId || NONE} onValueChange={(v) => set({ subjectId: v === NONE ? '' : v })}>
            <SelectTrigger id="mat-subject">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No particular subject</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Topic" htmlFor="mat-topic" optional>
          <Input id="mat-topic" value={t.topic} onChange={(e) => set({ topic: e.target.value })} maxLength={160} placeholder="e.g. Fractions" />
        </Field>
      </div>

      <Field label="Share with" error={error}>
        {levels.length === 0 ? (
          <p className="rounded-xl border border-border bg-muted/30 px-3 py-3 text-[13px] text-muted-foreground">
            {options.manageAll ? 'No classes have been set up yet.' : t.subjectId ? 'You don’t teach this subject in any class. Choose another subject.' : 'Choose the subject first to see the classes you teach it in.'}
          </p>
        ) : (
          <div className="grid gap-2 rounded-xl border border-border p-3">
            {options.wholeSchool && (
              <label className="flex items-center justify-between gap-3 border-b border-border pb-2 text-[13.5px] font-medium">
                Whole school
                <Switch checked={whole} onCheckedChange={(v) => v && set({ classLevelIds: [], classArmIds: [] })} disabled={whole} aria-label="Share with the whole school" />
              </label>
            )}
            {levels.map((l) => {
              const levelOn = t.classLevelIds.includes(l.id);
              return (
                <div key={l.id} className="flex flex-wrap items-center gap-1.5">
                  <span className="w-16 shrink-0 text-[12.5px] font-medium text-muted-foreground">{l.name}</span>
                  {l.all && (
                    <Chip on={levelOn} onClick={() => toggleLevel(l.id, l.arms.map((a) => a.id))}>
                      All
                    </Chip>
                  )}
                  {l.arms.map((a) => (
                    <Chip key={a.id} on={levelOn || t.classArmIds.includes(a.id)} disabled={levelOn} onClick={() => toggleArm(a.id)}>
                      {a.name || l.name}
                    </Chip>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </Field>

      <Field label="Term" htmlFor="mat-term" optional>
        <Select value={t.termId || NONE} onValueChange={(v) => set({ termId: v === NONE ? '' : v })}>
          <SelectTrigger id="mat-term">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Any term</SelectItem>
            {options.terms.map((x) => (
              <SelectItem key={x.id} value={x.id}>
                {x.name}, {x.sessionName}
                {x.isCurrent ? ' (current)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

function Chip({ on, disabled, onClick, children }: { on: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'min-h-8 rounded-full border px-3 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70',
        on ? 'border-brand bg-brand-soft text-brand' : 'border-border bg-card text-foreground hover:bg-muted/60',
      )}
    >
      {children}
    </button>
  );
}
