import { HOMEWORK_KIND_LABELS, type HomeworkRow, type SubmissionRow, type SubmissionType } from '@aischool/shared';
import { AlertTriangle, ArrowLeft, Camera, CalendarClock, CheckCircle2, ChevronDown, ClipboardList, FileText, Film, Image as ImageIcon, Link2, Mic, Plus, RotateCcw, Send, Video, X } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { FormError } from '../operations/ui';
import { useAssignment, useSubmitHomework } from './api';
import { ACCEPT, AttachmentList, type FileKind, hostOf, kindOfFile, kindOfMime, UploadRows, useUploads } from './files';
import { fmtScore, HandInBadge, SubmissionContent } from './handin';
import { addDays, dayLabel, relativeDay, schoolToday, useSchoolTz } from './ui';

const MAX_FILES = 10;
const MAX_LINKS = 5;

const TYPE_WORDS: Record<SubmissionType, string> = { TEXT: 'a typed answer', IMAGE: 'photos', VIDEO: 'videos', AUDIO: 'audio recordings', DOCUMENT: 'documents (PDF, Word…)', LINK: 'links' };
const listOf = (list: string[], and = 'and') => (list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} ${and} ${list[list.length - 1]}`);

/** What a student may hand in. No list from the teacher means anything goes. */
function allowedTypes(h: HomeworkRow): Set<SubmissionType> {
  const set = new Set<SubmissionType>(h.submissionTypes.length ? h.submissionTypes : ['TEXT', 'IMAGE', 'DOCUMENT']);
  if (h.kind === 'QUESTIONS') set.add('TEXT');
  return set;
}

/** A student's assignment: the teacher's instructions and files, and handing in. */
export default function AssignmentPage() {
  const { id = '' } = useParams();
  const tz = useSchoolTz();
  const today = schoolToday(tz);
  const q = useAssignment(id);
  const d = q.data;
  const [editing, setEditing] = useState(false);
  const [showMine, setShowMine] = useState(false);

  const h = d?.homework;
  const sub = d?.submission ?? null;
  const closed = !!h && h.overdue && !h.allowLate;
  const canHandIn = !!h && sub?.status !== 'GRADED' && !closed;
  const formOpen = canHandIn && (!sub || sub.status === 'RETURNED' || editing);

  return (
    <Page className="max-w-3xl">
      <PageHeader
        eyebrow={
          <Link to="/learning" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" /> My learning
          </Link>
        }
        title={h?.title ?? 'Assignment'}
        description={h ? [h.subject?.name, h.teacher].filter(Boolean).join(' · ') || undefined : undefined}
      />
      {q.error && !d ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : !h || !d ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-5">
          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap gap-1.5">
              <DueBadge h={h} today={today} />
              {h.kind !== 'QUESTIONS' && <Badge variant="brand">{HOMEWORK_KIND_LABELS[h.kind]}</Badge>}
              {h.maxScore != null && <Badge variant="outline">Out of {h.maxScore}</Badge>}
              <HandInBadge mine={sub} overdue={h.overdue} maxScore={h.maxScore} />
            </div>
            <p className="mt-3 whitespace-pre-wrap break-words text-[14px] leading-relaxed">{h.instructions}</p>
            {h.questions.length > 0 && (
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[14px] leading-relaxed marker:text-muted-foreground">
                {h.questions.map((qq, i) => (
                  <li key={i} className="break-words pl-1">
                    {qq}
                  </li>
                ))}
              </ol>
            )}
            {h.attachments.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">From your teacher</p>
                <AttachmentList homeworkId={h.id} attachments={h.attachments} />
              </div>
            )}
          </Card>

          {sub?.status === 'GRADED' && (
            <Card className="border-success/30 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-success-soft text-success">
                  <CheckCircle2 className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-muted-foreground">Marked{sub.gradedAt ? ` ${dayLabel(sub.gradedAt.slice(0, 10), { day: 'numeric', month: 'short' })}` : ''}</p>
                  {sub.score != null ? (
                    <p className="font-display text-[26px] font-semibold leading-tight tabular">
                      {fmtScore(sub.score)}
                      {h.maxScore != null && <span className="text-[16px] text-muted-foreground"> / {h.maxScore}</span>}
                    </p>
                  ) : (
                    <p className="text-[14px] font-medium">Your teacher has looked at your work.</p>
                  )}
                </div>
              </div>
              {sub.feedback && <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-muted/40 px-3.5 py-3 text-[13.5px] leading-relaxed">{sub.feedback}</p>}
            </Card>
          )}

          {sub?.status === 'RETURNED' && (
            <Card className="border-warning/40 bg-warning-soft/20 p-4 sm:p-5">
              <p className="flex items-center gap-2 text-[14px] font-medium">
                <RotateCcw className="size-4 text-warning" aria-hidden /> Your teacher has asked you to redo this
              </p>
              {sub.feedback && <p className="mt-2 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">{sub.feedback}</p>}
              {closed && <p className="mt-2 text-[12.5px] text-muted-foreground">The deadline has passed, so it can’t be handed in again. Speak to your teacher.</p>}
            </Card>
          )}

          {sub && !formOpen && (
            <Card className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium">{sub.status === 'SUBMITTED' ? 'You’ve handed this in' : 'What you handed in'}</p>
                  <p className="text-[12.5px] text-muted-foreground">
                    {formatDateTime(sub.submittedAt)}
                    {sub.late && ' · late'}
                    {sub.status === 'SUBMITTED' && ' · waiting to be marked'}
                  </p>
                </div>
                {sub.status === 'SUBMITTED' && canHandIn && (
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                    Change it
                  </Button>
                )}
              </div>
              {sub.status === 'SUBMITTED' ? (
                <SubmissionContent s={sub} className="mt-3" />
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setShowMine((o) => !o)}
                    aria-expanded={showMine}
                    className="mt-2 inline-flex items-center gap-1 rounded text-[12.5px] font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {showMine ? 'Hide my work' : 'Show my work'}
                    <ChevronDown className={cn('size-3.5 transition-transform', showMine && 'rotate-180')} aria-hidden />
                  </button>
                  {showMine && <SubmissionContent s={sub} className="mt-3" />}
                </>
              )}
            </Card>
          )}

          {!sub && closed && (
            <Card className="border-danger/30 p-4 sm:p-5">
              <p className="flex items-center gap-2 text-[14px] font-medium">
                <AlertTriangle className="size-4 text-danger" aria-hidden /> Hand-ins have closed
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">The deadline has passed and this assignment doesn’t take late work. Speak to your teacher.</p>
            </Card>
          )}

          {formOpen && <HandInForm h={h} sub={sub} onDone={() => setEditing(false)} onCancel={sub?.status === 'SUBMITTED' ? () => setEditing(false) : undefined} />}
        </div>
      )}
    </Page>
  );
}

function DueBadge({ h, today }: { h: HomeworkRow; today: string }) {
  const due = h.dueDate.slice(0, 10);
  if (h.overdue) {
    return (
      <Badge variant="danger" className="gap-1">
        <AlertTriangle /> Was due {dayLabel(due, { day: 'numeric', month: 'short' })}
      </Badge>
    );
  }
  const rel = relativeDay(due, today);
  return (
    <Badge variant={due <= addDays(today, 1) ? 'warning' : 'outline'} className="gap-1">
      <CalendarClock /> Due {rel === 'Today' || rel === 'Tomorrow' ? rel.toLowerCase() : dayLabel(due, { weekday: 'long', day: 'numeric', month: 'short' })}
    </Badge>
  );
}

// ------------------------------------------------------------------ handing in

interface Picker {
  kind: FileKind;
  label: string;
  icon: typeof Camera;
  accept: string;
  capture?: 'environment' | 'user';
  multiple?: boolean;
}

const PICKERS: Picker[] = [
  { kind: 'IMAGE', label: 'Take a photo', icon: Camera, accept: 'image/*', capture: 'environment' },
  { kind: 'IMAGE', label: 'Upload photos', icon: ImageIcon, accept: ACCEPT.IMAGE, multiple: true },
  { kind: 'VIDEO', label: 'Record a video', icon: Video, accept: 'video/*', capture: 'environment' },
  { kind: 'VIDEO', label: 'Upload a video', icon: Film, accept: ACCEPT.VIDEO },
  { kind: 'AUDIO', label: 'Audio recording', icon: Mic, accept: `audio/*,${ACCEPT.AUDIO}` },
  { kind: 'DOCUMENT', label: 'Add a document', icon: FileText, accept: ACCEPT.DOCUMENT, multiple: true },
];

function PickButton({ p, disabled, onPick }: { p: Picker; disabled: boolean; onPick: (files: File[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const Icon = p.icon;
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={p.accept}
        capture={p.capture}
        multiple={p.multiple}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          onPick(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <Button type="button" variant="outline" className="h-auto min-h-11 justify-start whitespace-normal py-2 text-left" disabled={disabled} onClick={() => ref.current?.click()}>
        <Icon /> {p.label}
      </Button>
    </>
  );
}

function HandInForm({ h, sub, onDone, onCancel }: { h: HomeworkRow; sub: SubmissionRow | null; onDone: () => void; onCancel?: () => void }) {
  const allowed = allowedTypes(h);
  const submit = useSubmitHomework(h.id);
  const uploads = useUploads(MAX_FILES);
  const resetUploads = uploads.reset;
  const [text, setText] = useState(sub?.text ?? '');
  const [links, setLinks] = useState<string[]>(sub?.links ?? []);
  const [link, setLink] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    resetUploads((sub?.files ?? []).filter((f) => allowed.has(kindOfMime(f.mimeType))).map((f) => ({ fileId: f.fileId, name: f.name, mimeType: f.mimeType, size: f.sizeBytes })));
    // Seed once, from the hand-in being changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub?.id, resetUploads]);

  const pickers = PICKERS.filter((p) => allowed.has(p.kind));
  const onPick = (files: File[]) => {
    const ok = files.filter((f) => allowed.has(kindOfFile(f)));
    if (ok.length < files.length) toast.error(`This assignment only takes ${listOf([...allowed].filter((t) => t !== 'TEXT' && t !== 'LINK').map((t) => TYPE_WORDS[t]), 'or') || 'no files'}.`);
    uploads.add(ok, uploads.items.length);
  };

  const addLink = () => {
    const url = link.trim();
    if (!/^https?:\/\/\S+\.\S+/i.test(url)) {
      setErrors((e) => ({ ...e, link: 'Paste a full web address, starting with https://' }));
      return;
    }
    setErrors(({ link: _, ...e }) => e);
    setLinks((l) => [...l, url]);
    setLink('');
  };

  const send = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const body = { text: allowed.has('TEXT') ? text.trim() || null : null, fileIds: uploads.done.map((f) => f.fileId), links: allowed.has('LINK') ? links : [] };
    if (uploads.busy) errs.form = 'Wait for your files to finish uploading';
    else if (uploads.items.some((x) => x.state === 'error')) errs.form = 'Remove the files that didn’t upload, then try again';
    else if (!body.text && !body.fileIds.length && !body.links.length) errs.form = 'Add your answer, a file or a link before you hand in';
    if (link.trim() && !errs.form) errs.link = 'Press “Add link” first, or clear the box';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    submit.mutate(body, { onSuccess: onDone, onError: (err) => setErrors({ form: errorMessage(err) }) });
  };

  return (
    <Card className="p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
        <ClipboardList className="size-4 text-muted-foreground" aria-hidden /> {sub ? 'Hand in again' : 'Hand in your work'}
      </h2>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">
        You can send {listOf([...allowed].map((t) => TYPE_WORDS[t]))}.
        {h.overdue && ' It’s past the due date, so it will be marked as late.'}
      </p>
      <form onSubmit={send} noValidate className="mt-4 grid gap-4">
        {allowed.has('TEXT') && (
          <Field label="Your answer" htmlFor="hand-text" optional={allowed.size > 1}>
            <Textarea
              id="hand-text"
              rows={h.kind === 'THEORY' || h.questions.length > 2 ? 8 : 5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={20_000}
              placeholder={h.questions.length > 1 ? 'Number your answers: 1. … 2. …' : 'Type your answer here'}
            />
          </Field>
        )}

        {pickers.length > 0 && (
          <div className="grid gap-2">
            <p className="text-[13px] font-medium">
              Files <span className="text-[11px] font-normal text-muted-foreground">· {uploads.items.length}/{MAX_FILES} · videos and audio up to 50 MB</span>
            </p>
            <div className="grid grid-cols-2 gap-2 [&>*]:min-w-0">
              {pickers.map((p) => (
                <PickButton key={p.label} p={p} disabled={uploads.items.length >= MAX_FILES} onPick={onPick} />
              ))}
            </div>
            <UploadRows items={uploads.items} onRemove={uploads.remove} />
          </div>
        )}

        {allowed.has('LINK') && (
          <div className="grid gap-2">
            <p className="text-[13px] font-medium">
              Links <span className="text-[11px] font-normal text-muted-foreground">· YouTube, Google Drive and the like · {links.length}/{MAX_LINKS}</span>
            </p>
            {links.length > 0 && (
              <ul className="grid gap-1.5">
                {links.map((l, i) => (
                  <li key={`${l}-${i}`} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
                    <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{hostOf(l)}</span>
                      <span className="block truncate text-[11.5px] text-muted-foreground">{l}</span>
                    </span>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => setLinks((x) => x.filter((_, j) => j !== i))} aria-label={`Remove ${l}`}>
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 [&>*]:min-w-0">
              <Input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://…"
                inputMode="url"
                aria-label="Link to add"
                className="flex-1"
                invalid={!!errors.link}
                disabled={links.length >= MAX_LINKS}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addLink();
                  }
                }}
              />
              <Button type="button" variant="outline" className="shrink-0" disabled={!link.trim() || links.length >= MAX_LINKS} onClick={addLink}>
                <Plus /> Add link
              </Button>
            </div>
            {errors.link && (
              <p role="alert" className="text-[12px] font-medium text-danger">
                {errors.link}
              </p>
            )}
          </div>
        )}

        <FormError message={errors.form} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" size="lg" loading={submit.isPending} disabled={uploads.busy}>
            {!submit.isPending && <Send />} {uploads.busy ? 'Uploading…' : sub ? 'Hand in again' : 'Hand in'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
