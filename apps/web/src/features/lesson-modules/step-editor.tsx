import { MODULE_STEP_LABELS, youtubeId, type ModuleDetail, type ModuleStepInput, type ModuleStepKind } from '@aischool/shared';
import { ArrowDown, ArrowUp, ChevronDown, ClipboardCheck, FileText, Film, Image as ImageIcon, Link2, NotebookText, Plus, Save, Trash2, Upload, FolderOpen } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatBytes, uploadPrivate } from '../live/files';
import { useMaterials } from '../materials/api';
import { useSaveSteps } from './api';
import { cleanQuestion, newId, QuestionsEditor, type DraftQ } from './question-editor';

interface DraftStep {
  key: string;
  id?: string;
  kind: ModuleStepKind;
  title: string;
  body: string;
  fileId: string | null;
  fileLabel: string | null;
  url: string;
  materialId: string | null;
  questions: DraftQ[];
  passMark: number | null;
}

const ICON: Record<ModuleStepKind, typeof NotebookText> = { NOTE: NotebookText, VIDEO: Film, IMAGE: ImageIcon, FILE: FileText, LINK: Link2, MATERIAL: FolderOpen, CHECKIN: ClipboardCheck };
const ADD_ORDER: ModuleStepKind[] = ['NOTE', 'VIDEO', 'IMAGE', 'FILE', 'LINK', 'MATERIAL', 'CHECKIN'];

const fromDetail = (m: ModuleDetail): DraftStep[] =>
  m.steps.map((s) => ({
    key: s.id,
    id: s.id,
    kind: s.kind,
    title: s.title,
    body: s.body ?? '',
    fileId: s.fileId,
    fileLabel: s.fileName,
    url: s.url ?? '',
    materialId: s.materialId,
    questions: s.questions,
    passMark: s.passMark,
  }));

const toInput = (s: DraftStep): ModuleStepInput => ({
  id: s.id,
  kind: s.kind,
  title: s.title.trim() || MODULE_STEP_LABELS[s.kind],
  body: s.body.trim() || null,
  fileId: s.fileId,
  url: s.url.trim() || null,
  materialId: s.materialId,
  // New questions get their ids on the server.
  questions: s.questions.map((q) => {
    const c = cleanQuestion(q);
    return { ...c, id: c.id.startsWith('new') ? undefined : c.id };
  }),
  passMark: s.passMark,
});

/** The module's steps, edited together and saved in one go. */
export function StepEditor({ m, canAi }: { m: ModuleDetail; canAi: boolean }) {
  const [steps, setSteps] = useState<DraftStep[]>(() => fromDetail(m));
  const [open, setOpen] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const save = useSaveSteps(m.id);
  const saved = useRef(m.updatedAt);
  // Reload when the module changes elsewhere (not while editing).
  useEffect(() => {
    if (!dirty && saved.current !== m.updatedAt) {
      setSteps(fromDetail(m));
      saved.current = m.updatedAt;
    }
  }, [m, dirty]);

  const change = (next: DraftStep[]) => {
    setSteps(next);
    setDirty(true);
  };
  const set = (i: number, s: DraftStep) => change(steps.map((x, j) => (j === i ? s : x)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...steps];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    change(next);
  };
  const add = (kind: ModuleStepKind) => {
    const key = newId();
    change([...steps, { key, kind, title: kind === 'CHECKIN' ? 'Check-in' : '', body: '', fileId: null, fileLabel: null, url: '', materialId: null, questions: [], passMark: null }]);
    setOpen(key);
  };
  const onSave = () =>
    save.mutate(
      { steps: steps.map(toInput) },
      {
        onSuccess: (r) => {
          saved.current = r.updatedAt;
          setSteps(fromDetail(r));
          setDirty(false);
          toast.success('Steps saved');
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  const ctx = { subjectId: m.subject.id, classLevelId: m.classLevel.id, classArmId: m.class?.id ?? null, topicId: m.topic?.id ?? null, topic: m.topic?.name ?? m.title, canAi };

  return (
    <div className="space-y-3">
      {!steps.length && (
        <Card className="p-6 text-center text-[13.5px] text-muted-foreground">
          No steps yet. Add notes, a video, pictures or study materials to teach from, then a short check-in (3 to 5 questions) to see who has understood.
        </Card>
      )}
      {steps.map((s, i) => {
        const Icon = ICON[s.kind];
        const isOpen = open === s.key;
        return (
          <Card key={s.key} className="p-0">
            <div className="flex items-center gap-2 p-3">
              <button type="button" onClick={() => setOpen(isOpen ? null : s.key)} className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-expanded={isOpen}>
                <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', s.kind === 'CHECKIN' ? 'bg-brand-soft text-brand' : 'bg-muted text-muted-foreground')}>
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium">
                    {i + 1}. {s.title || MODULE_STEP_LABELS[s.kind]}
                  </span>
                  <span className="block text-[12px] text-muted-foreground">
                    {MODULE_STEP_LABELS[s.kind]}
                    {s.kind === 'CHECKIN' ? ` · ${s.questions.length} question${s.questions.length === 1 ? '' : 's'}` : ''}
                    {s.kind === 'VIDEO' && s.questions.length ? ` · video quiz (${s.questions.length})` : ''}
                  </span>
                </span>
                <ChevronDown className={cn('ml-auto size-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
              </button>
              <Button variant="ghost" size="icon-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move step up">
                <ArrowUp />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label="Move step down">
                <ArrowDown />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => change(steps.filter((_, j) => j !== i))} aria-label="Remove step">
                <Trash2 />
              </Button>
            </div>
            {isOpen && (
              <div className="space-y-3 border-t border-border p-3 sm:p-4">
                <StepFields s={s} onChange={(x) => set(i, x)} subjectId={m.subject.id} ctx={ctx} passMark={m.passMark} />
              </div>
            )}
          </Card>
        );
      })}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-xl bg-background/95 px-1 py-2 backdrop-blur">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Plus /> Add a step
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {ADD_ORDER.map((k) => {
              const Icon = ICON[k];
              return (
                <DropdownMenuItem key={k} onSelect={() => add(k)}>
                  <Icon /> {k === 'VIDEO' ? 'Video (with quiz questions)' : MODULE_STEP_LABELS[k]}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="brand" onClick={onSave} loading={save.isPending} disabled={!dirty}>
          <Save /> Save steps
        </Button>
        {dirty && <Badge variant="warning">Unsaved changes</Badge>}
      </div>
    </div>
  );
}

function StepFields({ s, onChange, subjectId, ctx, passMark }: { s: DraftStep; onChange: (s: DraftStep) => void; subjectId: string; ctx: Parameters<typeof QuestionsEditor>[0]['context']; passMark: number }) {
  return (
    <>
      <Field label="Step title">
        <Input value={s.title} onChange={(e) => onChange({ ...s, title: e.target.value })} placeholder={MODULE_STEP_LABELS[s.kind]} maxLength={160} />
      </Field>
      {s.kind === 'VIDEO' && <VideoSource s={s} onChange={onChange} subjectId={subjectId} />}
      {(s.kind === 'IMAGE' || s.kind === 'FILE') && <Uploader s={s} onChange={onChange} accept={s.kind === 'IMAGE' ? 'image/*' : '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx'} />}
      {s.kind === 'LINK' && (
        <Field label="Link">
          <Input value={s.url} onChange={(e) => onChange({ ...s, url: e.target.value })} placeholder="https://" inputMode="url" />
        </Field>
      )}
      {s.kind === 'MATERIAL' && <MaterialPicker s={s} onChange={onChange} subjectId={subjectId} />}
      {s.kind !== 'CHECKIN' && (
        <Field label={s.kind === 'NOTE' ? 'Notes' : 'Notes (optional)'} hint="Simple formatting: ## heading, - bullet, **bold**.">
          <Textarea value={s.body} onChange={(e) => onChange({ ...s, body: e.target.value })} rows={s.kind === 'NOTE' ? 10 : 3} placeholder={s.kind === 'NOTE' ? 'What students should read and remember' : 'What to look out for'} />
        </Field>
      )}
      {s.kind === 'CHECKIN' && (
        <>
          <Field label="Pass mark" hint={`Leave as the module’s (${passMark}%) or set one for this check-in.`} className="max-w-[220px]">
            <Input type="number" min={1} max={100} value={s.passMark ?? ''} onChange={(e) => onChange({ ...s, passMark: e.target.value ? Math.min(100, Math.max(1, Number(e.target.value))) : null })} placeholder={`${passMark}`} />
          </Field>
          <p className="text-[12.5px] text-muted-foreground">3 to 5 quick questions work best: objective, true or false, or a one-word answer — all marked automatically.</p>
          <QuestionsEditor questions={s.questions} onChange={(questions) => onChange({ ...s, questions })} context={ctx} />
        </>
      )}
      {s.kind === 'VIDEO' && (
        <div className="space-y-2">
          <p className="text-[13px] font-medium">Questions in the video</p>
          <p className="text-[12.5px] text-muted-foreground">The video pauses at each time and waits for an answer before it plays on — in class and when students watch on their own.</p>
          <QuestionsEditor video questions={s.questions} onChange={(questions) => onChange({ ...s, questions })} context={ctx} />
        </div>
      )}
    </>
  );
}

function VideoSource({ s, onChange, subjectId }: { s: DraftStep; onChange: (s: DraftStep) => void; subjectId: string }) {
  const [mode, setMode] = useState<'link' | 'upload' | 'material'>(s.fileId ? 'upload' : s.materialId ? 'material' : 'link');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ['link', 'YouTube or link'],
            ['upload', 'Upload a video'],
            ['material', 'From study materials'],
          ] as const
        ).map(([k, label]) => (
          <Button
            key={k}
            type="button"
            size="sm"
            variant={mode === k ? 'secondary' : 'ghost'}
            onClick={() => {
              setMode(k);
              onChange({ ...s, fileId: k === 'upload' ? s.fileId : null, url: k === 'link' ? s.url : '', materialId: k === 'material' ? s.materialId : null });
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      {mode === 'link' && (
        <Field label="Video link" hint={s.url && youtubeId(s.url) ? 'YouTube video: it will pause at your questions.' : 'A YouTube link, or a direct link to an .mp4 file.'}>
          <Input value={s.url} onChange={(e) => onChange({ ...s, url: e.target.value })} placeholder="https://www.youtube.com/watch?v=…" inputMode="url" />
        </Field>
      )}
      {mode === 'upload' && <Uploader s={s} onChange={onChange} accept="video/*" />}
      {mode === 'material' && <MaterialPicker s={s} onChange={onChange} subjectId={subjectId} kind="VIDEO" />}
    </div>
  );
}

function Uploader({ s, onChange, accept }: { s: DraftStep; onChange: (s: DraftStep) => void; accept: string }) {
  const [pct, setPct] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border p-3">
      <input
        ref={input}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setPct(0);
          uploadPrivate(f, setPct)
            .then((u) => onChange({ ...s, fileId: u.id, fileLabel: `${f.name} · ${formatBytes(f.size)}`, title: s.title || f.name.replace(/\.[^.]+$/, '').slice(0, 160) }))
            .catch((err: unknown) => toast.error(errorMessage(err)))
            .finally(() => setPct(null));
        }}
      />
      <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()} loading={pct !== null}>
        <Upload /> {s.fileId ? 'Replace file' : 'Upload'}
      </Button>
      <span className="min-w-0 truncate text-[12.5px] text-muted-foreground">{pct !== null ? `Uploading… ${pct}%` : (s.fileLabel ?? (s.fileId ? 'File uploaded' : 'No file yet'))}</span>
    </div>
  );
}

function MaterialPicker({ s, onChange, subjectId, kind }: { s: DraftStep; onChange: (s: DraftStep) => void; subjectId: string; kind?: 'VIDEO' }) {
  const q = useMaterials({ subjectId, kind });
  const list = useMemo(() => (q.data ?? []).filter((x) => x.published), [q.data]);
  return (
    <Field label="Study material" hint="Shared materials from the school library and your colleagues for this subject.">
      <Select value={s.materialId ?? ''} onValueChange={(v) => onChange({ ...s, materialId: v, title: s.title || (list.find((x) => x.id === v)?.title ?? '') })}>
        <SelectTrigger>
          <SelectValue placeholder={q.isLoading ? 'Loading…' : list.length ? 'Choose a material' : 'No materials for this subject yet'} />
        </SelectTrigger>
        <SelectContent>
          {list.map((x) => (
            <SelectItem key={x.id} value={x.id}>
              {x.title}
              {x.topic ? ` — ${x.topic}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
