import { type Channel, HOMEWORK_KIND_LABELS, HOMEWORK_KINDS, type HomeworkKind, type HomeworkRow, homeworkSchema, SUBMISSION_TYPE_LABELS, SUBMISSION_TYPES, type SubmissionType } from '@aischool/shared';
import { AlertTriangle, ArrowDown, ArrowUp, CalendarClock, ChevronDown, ClipboardList, Inbox, Link2, MoreHorizontal, Paperclip, Pencil, Plus, Send, Trash2, Video, X } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { armOptions, useStructure } from '../academics/api';
import { apiFieldErrors, dateInput, FormError, Segmented, zodErrors } from '../operations/ui';
import { useSearchFlag } from '../planning/ui';
import { type HomeworkParams, useDeleteHomework, useHomework, useHomeworkTopics, useSaveHomework } from './api';
import { ATTACH_ACCEPT, AttachmentList, hostOf, UploadRows, useUploads } from './files';
import { addDays, ChannelChooser, dayLabel, relativeDay, schoolToday, useSchoolTz } from './ui';

type Due = 'UPCOMING' | 'PAST' | 'ALL';
type Status = 'ALL' | 'PUBLISHED' | 'DRAFT';

export default function HomeworkPage() {
  const tz = useSchoolTz();
  const today = schoolToday(tz);
  const structure = useStructure();
  const arms = armOptions(structure.data);
  const subjects = [...(structure.data?.subjects ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const [classArmId, setClassArmId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [due, setDue] = useState<Due>('UPCOMING');
  const [status, setStatus] = useState<Status>('ALL');
  const [creating, setCreating] = useSearchFlag('new');
  const [editing, setEditing] = useState<HomeworkRow | null>(null);
  const [deleting, setDeleting] = useState<HomeworkRow | null>(null);
  const del = useDeleteHomework();

  const params: HomeworkParams = { classArmId: classArmId || undefined, subjectId: subjectId || undefined, due: due === 'ALL' ? undefined : due, status: status === 'ALL' ? undefined : status };
  const q = useHomework(params);
  const filtered = !!(classArmId || subjectId || status !== 'ALL');

  return (
    <Page className="max-w-6xl">
      <PageHeader
        title="Homework"
        description="Set homework for your classes. Students and parents see it in their portal, and parents can be told by message."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> Set homework
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="When"
            value={due}
            onChange={setDue}
            options={[
              { value: 'UPCOMING', label: 'Upcoming' },
              { value: 'PAST', label: 'Past' },
              { value: 'ALL', label: 'All' },
            ]}
          />
          <Segmented
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'ALL', label: 'Any status' },
              { value: 'PUBLISHED', label: 'Published' },
              { value: 'DRAFT', label: 'Drafts' },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex [&>*]:min-w-0">
          <Select value={classArmId || NONE} onValueChange={(v) => setClassArmId(v === NONE ? '' : v)}>
            <SelectTrigger className="h-9 sm:w-44" aria-label="Filter by class">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All classes</SelectItem>
              {arms.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={subjectId || NONE} onValueChange={(v) => setSubjectId(v === NONE ? '' : v)}>
            <SelectTrigger className="h-9 sm:w-44" aria-label="Filter by subject">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All subjects</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {q.error && !q.data ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : !q.data ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : q.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title={filtered ? 'No homework matches' : due === 'PAST' ? 'No past homework' : 'No homework set yet'}
            description={
              filtered
                ? 'Try clearing the filters.'
                : 'Set it by hand here, or let the AI write it from a live class — open a class you’ve taught and use “Set as homework” on its summary.'
            }
            action={
              filtered ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setClassArmId('');
                    setSubjectId('');
                    setStatus('ALL');
                  }}
                >
                  <X /> Clear filters
                </Button>
              ) : (
                <Button onClick={() => setCreating(true)}>
                  <Plus /> Set homework
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <ul className={cn('space-y-2 transition-opacity', q.isPlaceholderData && 'opacity-60')}>
          {q.data.map((h) => (
            <li key={h.id}>
              <HomeworkItem h={h} today={today} onEdit={() => setEditing(h)} onDelete={() => setDeleting(h)} />
            </li>
          ))}
        </ul>
      )}

      <HomeworkSheet open={creating || !!editing} onOpenChange={(o) => {
          if (o) return;
          setCreating(false);
          setEditing(null);
        }} homework={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Remove “${deleting?.title ?? ''}”?`}
        description={deleting?.status === 'PUBLISHED' ? 'Students and parents will no longer see it. Messages already sent can’t be called back.' : 'The draft is deleted.'}
        confirmLabel="Remove homework"
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </Page>
  );
}

function DueChip({ h, today }: { h: HomeworkRow; today: string }) {
  const due = h.dueDate.slice(0, 10);
  if (h.overdue && h.status === 'PUBLISHED') {
    return (
      <Badge variant="danger" className="gap-1">
        <AlertTriangle /> Was due {dayLabel(due, { day: 'numeric', month: 'short' })}
      </Badge>
    );
  }
  const soon = due <= addDays(today, 1);
  const rel = relativeDay(due, today);
  const label = due < today ? `Was due ${dayLabel(due)}` : rel === 'Today' || rel === 'Tomorrow' ? `Due ${rel.toLowerCase()}` : `Due ${dayLabel(due)}`;
  return (
    <Badge variant={soon && due >= today ? 'warning' : 'outline'} className="gap-1">
      <CalendarClock /> {label}
    </Badge>
  );
}

function HomeworkItem({ h, today, onEdit, onDelete }: { h: HomeworkRow; today: string; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const panelId = `hw-${h.id}`;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <span className={cn('mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl', h.source === 'AI' ? 'bg-ai-gradient text-white' : 'bg-muted text-muted-foreground')}>
          {h.source === 'AI' ? <AiSparkle className="size-4 [&_path]:fill-white" animated={false} /> : <ClipboardList className="size-4" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={panelId}
            className="flex w-full min-w-0 items-center gap-1.5 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0 truncate text-[14px] font-medium">{h.title}</span>
            <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
          </button>
          <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
            {h.classArm.name}
            {h.subject && ` · ${h.subject.name}`}
            {h.teacher && ` · ${h.teacher}`}
            {h.questions.length > 0 && ` · ${h.questions.length} ${h.questions.length === 1 ? 'question' : 'questions'}`}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {h.status === 'DRAFT' ? <Badge variant="secondary">Draft</Badge> : <Badge variant="success" dot>Published</Badge>}
            <DueChip h={h} today={today} />
            {h.kind !== 'QUESTIONS' && <Badge variant="brand">{KIND_SHORT[h.kind]}</Badge>}
            {h.maxScore != null && <Badge variant="outline">Out of {h.maxScore}</Badge>}
            {h.topic && (
              <Badge variant="outline" className="max-w-[16rem]" title="Marked work counts towards this topic’s mastery">
                <span className="truncate">Topic: {h.topic.name}</span>
              </Badge>
            )}
            {h.attachments.length > 0 && (
              <Badge variant="outline" className="gap-1">
                <Paperclip /> {h.attachments.length}
              </Badge>
            )}
            {h.status === 'PUBLISHED' && h.submissions && (
              <Link
                to={`/homework/${h.id}`}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium leading-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Hand-ins: ${h.submissions.submitted} of ${h.submissions.classSize} handed in, ${h.submissions.graded} marked`}
              >
                <Inbox className="size-3" aria-hidden />
                <span className="tabular">
                  {h.submissions.submitted}/{h.submissions.classSize}
                </span>
                handed in
                {h.submissions.submitted > h.submissions.graded && <span className="tabular text-warning">· {h.submissions.submitted - h.submissions.graded} to mark</span>}
              </Link>
            )}
            {h.source === 'AI' && h.liveClassId && (
              <Link
                to={`/live/${h.liveClassId}`}
                className="inline-flex items-center gap-1 rounded-full border border-ai-2/30 px-2 py-0.5 text-[11px] font-medium leading-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Video className="size-3" aria-hidden /> From a live class
              </Link>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${h.title}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {h.status === 'PUBLISHED' && (
              <DropdownMenuItem asChild>
                <Link to={`/homework/${h.id}`}>
                  <Inbox /> Hand-ins and marking
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> {h.status === 'DRAFT' ? 'Edit or publish' : 'Edit'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDelete} className="text-danger focus:text-danger">
              <Trash2 /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {open && (
        <div id={panelId} className="border-t border-border bg-muted/20 px-4 py-3.5 sm:pl-16">
          <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">{h.instructions}</p>
          {h.questions.length > 0 && (
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed marker:text-muted-foreground">
              {h.questions.map((q, i) => (
                <li key={i} className="break-words pl-1">
                  {q}
                </li>
              ))}
            </ol>
          )}
          <AttachmentList homeworkId={h.id} attachments={h.attachments} className="mt-3" />
          <div className="mt-3 flex flex-wrap gap-2">
            {h.status === 'PUBLISHED' && (
              <Button asChild size="sm">
                <Link to={`/homework/${h.id}`}>
                  <Inbox /> Hand-ins
                </Link>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil /> Edit
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ set / edit

interface Values {
  classArmId: string;
  subjectId: string;
  topicId: string;
  title: string;
  instructions: string;
  questions: string[];
  dueDate: string;
  publish: boolean;
  notify: Channel[];
  kind: HomeworkKind;
  submissionTypes: SubmissionType[];
  maxScore: string;
  markingGuide: string;
  allowLate: boolean;
  links: { url: string; name: string }[];
}

export const KIND_SHORT: Record<HomeworkKind, string> = { QUESTIONS: 'Questions', THEORY: 'Theory', PROJECT: 'Project', UPLOAD: 'Hand-in' };
const KIND_HINT: Record<HomeworkKind, string> = {
  QUESTIONS: 'Short questions to answer',
  THEORY: 'Longer written answers, typed or photographed',
  PROJECT: 'Make something; hand in photos, video or a write-up',
  UPLOAD: 'Hand in a worksheet, drawing, recording or file',
};
/** Sensible hand-in types for each kind of assignment. */
const KIND_TYPES: Record<HomeworkKind, SubmissionType[]> = {
  QUESTIONS: ['TEXT', 'IMAGE'],
  THEORY: ['TEXT', 'IMAGE'],
  PROJECT: ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'LINK'],
  UPLOAD: ['IMAGE', 'DOCUMENT'],
};

export function HomeworkSheet({ open, onOpenChange, homework }: { open: boolean; onOpenChange: (o: boolean) => void; homework?: HomeworkRow | null }) {
  const tz = useSchoolTz();
  const structure = useStructure(open);
  const save = useSaveHomework();
  const [v, setV] = useState<Values | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<Values>) => setV((p) => (p ? { ...p, ...patch } : p));
  const editing = !!homework;
  const published = homework?.status === 'PUBLISHED';
  const arms = useMemo(() => armOptions(structure.data), [structure.data]);
  const subjects = useMemo(() => [...(structure.data?.subjects ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [structure.data]);
  const topics = useHomeworkTopics(v?.classArmId ?? '', v?.subjectId ?? '');
  const topicOptions = useMemo(() => {
    const rows = topics.data ?? [];
    const kids = new Map<string | null, typeof rows>();
    for (const t of rows) kids.set(t.parentId, [...(kids.get(t.parentId) ?? []), t]);
    const known = new Set(rows.map((t) => t.id));
    // Topics, each followed by its sub-topics.
    const out: { id: string; label: string; sub: boolean }[] = [];
    for (const t of rows.filter((x) => !x.parentId || !known.has(x.parentId))) {
      out.push({ id: t.id, label: t.name, sub: false });
      for (const c of kids.get(t.id) ?? []) out.push({ id: c.id, label: c.name, sub: true });
    }
    return out;
  }, [topics.data]);
  const uploads = useUploads(10);
  const resetUploads = uploads.reset;
  const [linkUrl, setLinkUrl] = useState('');
  const [linkName, setLinkName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setV(null);
      return;
    }
    setErrors({});
    setLinkUrl('');
    setLinkName('');
    resetUploads(homework ? homework.attachments.filter((a) => a.type === 'FILE' && a.fileId).map((a) => ({ fileId: a.fileId!, name: a.name, mimeType: a.mimeType })) : []);
    setV(
      homework
        ? {
            classArmId: homework.classArm.id,
            subjectId: homework.subject?.id ?? '',
            topicId: homework.topic?.id ?? '',
            title: homework.title,
            instructions: homework.instructions,
            questions: homework.questions.length ? homework.questions : [''],
            dueDate: homework.dueDate.slice(0, 10),
            publish: homework.status === 'PUBLISHED',
            notify: ['IN_APP'],
            kind: homework.kind,
            submissionTypes: homework.submissionTypes.length ? homework.submissionTypes : KIND_TYPES[homework.kind],
            maxScore: homework.maxScore != null ? String(homework.maxScore) : '',
            markingGuide: homework.markingGuide ?? '',
            allowLate: homework.allowLate,
            links: homework.attachments.filter((a) => a.type === 'LINK').map((a) => ({ url: a.url, name: a.name })),
          }
        : {
            classArmId: '',
            subjectId: '',
            topicId: '',
            title: '',
            instructions: '',
            questions: [''],
            dueDate: addDays(schoolToday(tz), 2),
            publish: true,
            notify: ['IN_APP'],
            kind: 'QUESTIONS',
            submissionTypes: KIND_TYPES.QUESTIONS,
            maxScore: '',
            markingGuide: '',
            allowLate: true,
            links: [],
          },
    );
  }, [open, homework, tz, resetUploads]);


  const setKind = (kind: HomeworkKind) => set({ kind, submissionTypes: KIND_TYPES[kind] });
  const toggleType = (t: SubmissionType, on: boolean) => set({ submissionTypes: on ? SUBMISSION_TYPES.filter((x) => x === t || v!.submissionTypes.includes(x)) : v!.submissionTypes.filter((x) => x !== t) });
  const addLink = () => {
    const url = linkUrl.trim();
    if (!/^https?:\/\/\S+\.\S+/i.test(url)) {
      setErrors((e) => ({ ...e, link: 'Paste a full web address, starting with https://' }));
      return;
    }
    setErrors(({ link: _, ...e }) => e);
    set({ links: [...v!.links, { url, name: linkName.trim() || hostOf(url) }] });
    setLinkUrl('');
    setLinkName('');
  };
  const attachmentCount = (v?.links.length ?? 0) + uploads.items.length;

  const setQuestion = (i: number, text: string) => set({ questions: v!.questions.map((q, j) => (j === i ? text : q)) });
  const move = (i: number, by: number) => {
    const qs = [...v!.questions];
    const [x] = qs.splice(i, 1);
    qs.splice(i + by, 0, x!);
    set({ questions: qs });
  };

  const submit = (publish: boolean) => (e?: FormEvent) => {
    e?.preventDefault();
    if (!v) return;
    const input = {
      classArmId: v.classArmId,
      subjectId: v.subjectId || null,
      topicId: (v.subjectId && v.topicId) || null,
      title: v.title,
      instructions: v.instructions,
      questions: v.questions.map((q) => q.trim()).filter(Boolean),
      dueDate: v.dueDate,
      publish,
      notifyParents: publish && !published ? v.notify : [],
      kind: v.kind,
      submissionTypes: v.submissionTypes,
      maxScore: v.maxScore.trim() ? Number(v.maxScore) : null,
      markingGuide: v.markingGuide,
      allowLate: v.allowLate,
      attachments: [
        ...uploads.done.map((f) => ({ type: 'FILE' as const, fileId: f.fileId, url: '', name: f.name, mimeType: f.mimeType })),
        ...v.links.map((l) => ({ type: 'LINK' as const, fileId: null, url: l.url, name: l.name.slice(0, 200) })),
      ],
    };
    const parsed = homeworkSchema.safeParse(input);
    const errs = parsed.success ? {} : zodErrors(parsed.error.issues);
    if (!v.classArmId) errs.classArmId = 'Choose a class';
    if (!v.dueDate) errs.dueDate = 'Pick a due date';
    if (v.maxScore.trim() && !(Number.isInteger(Number(v.maxScore)) && Number(v.maxScore) >= 1 && Number(v.maxScore) <= 1000)) errs.maxScore = 'A whole number from 1 to 1000';
    if (!v.submissionTypes.length) errs.submissionTypes = 'Choose at least one way to hand in';
    if (uploads.busy) errs.form = 'Wait for the files to finish uploading';
    else if (uploads.items.some((x) => x.state === 'error')) errs.form = 'Remove the files that didn’t upload, or try them again';
    setErrors(errs);
    if (!parsed.success || Object.keys(errs).length) return;
    save.mutate({ id: homework?.id, input: parsed.data }, { onSuccess: () => onOpenChange(false), onError: (err) => setErrors(apiFieldErrors(err)) });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="font-display text-lg font-semibold tracking-tight">{editing ? 'Edit homework' : 'Set homework'}</SheetTitle>
          <SheetDescription className="text-[13px] text-muted-foreground">
            {published ? 'Changes show to students and parents straight away. Parents aren’t messaged again.' : 'Publish it now, or save a draft to finish later.'}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {!v ? (
            <Skeleton className="h-80 w-full" />
          ) : (
            <form id="hw-form" onSubmit={submit(v.publish)} noValidate className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                <Field label="Class" htmlFor="hw-arm" error={errors.classArmId} hint={editing ? 'The class can’t be changed.' : undefined}>
                  <Select value={v.classArmId || undefined} onValueChange={(classArmId) => set({ classArmId })} disabled={editing}>
                    <SelectTrigger id="hw-arm" invalid={!!errors.classArmId}>
                      <SelectValue placeholder={structure.isLoading ? 'Loading classes…' : 'Choose a class'} />
                    </SelectTrigger>
                    <SelectContent>
                      {arms.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Subject" htmlFor="hw-subject" optional>
                  <Select value={v.subjectId || NONE} onValueChange={(s) => set({ subjectId: s === NONE ? '' : s, topicId: '' })}>
                    <SelectTrigger id="hw-subject">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No subject</SelectItem>
                      {subjects.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              {v.classArmId && v.subjectId && (
                <Field
                  label="Syllabus topic"
                  htmlFor="hw-topic"
                  optional
                  error={errors.topicId}
                  hint={v.topicId ? (v.maxScore.trim() ? 'Marked work counts towards each student’s mastery of this topic.' : 'Give it marks too: work marked out of a total counts towards this topic.') : topics.data && !topicOptions.length ? 'No syllabus topics for this subject yet.' : 'Pick one so marked work counts towards topic mastery.'}
                >
                  <Select value={v.topicId || NONE} onValueChange={(t) => set({ topicId: t === NONE ? '' : t })} disabled={topics.isLoading || (!!topics.data && !topicOptions.length && !v.topicId)}>
                    <SelectTrigger id="hw-topic">
                      <SelectValue placeholder={topics.isLoading ? 'Loading topics…' : 'No topic'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No topic</SelectItem>
                      {v.topicId && homework?.topic && !topicOptions.some((t) => t.id === v.topicId) && <SelectItem value={homework.topic.id}>{homework.topic.name}</SelectItem>}
                      {topicOptions.map((t) => (
                        <SelectItem key={t.id} value={t.id} className={cn(t.sub && 'pl-6 text-muted-foreground')}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <fieldset className="grid gap-1.5">
                <legend className="mb-1.5 text-[13px] font-medium">Kind of assignment</legend>
                <div role="radiogroup" aria-label="Kind of assignment" className="grid grid-cols-2 gap-2 [&>*]:min-w-0">
                  {HOMEWORK_KINDS.map((k) => {
                    const on = v.kind === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setKind(k)}
                        className={cn(
                          'rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          on ? 'border-brand bg-brand-soft/60' : 'border-border hover:bg-muted/40',
                        )}
                      >
                        <span className={cn('block text-[13px] font-medium leading-snug', on && 'text-brand')}>{HOMEWORK_KIND_LABELS[k]}</span>
                        <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{KIND_HINT[k]}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <Field label="Title" htmlFor="hw-title" error={errors.title}>
                <Input id="hw-title" value={v.title} onChange={(e) => set({ title: e.target.value })} maxLength={160} placeholder="e.g. Simultaneous equations practice" invalid={!!errors.title} />
              </Field>
              <Field label="Instructions" htmlFor="hw-instr" error={errors.instructions}>
                <Textarea id="hw-instr" rows={3} value={v.instructions} onChange={(e) => set({ instructions: e.target.value })} maxLength={3000} placeholder="What to do, and how to hand it in" invalid={!!errors.instructions} />
              </Field>

              <fieldset className="grid gap-2">
                <legend className="mb-1.5 flex w-full items-center justify-between text-[13px] font-medium">
                  Questions <span className="text-[11px] font-normal text-muted-foreground">Optional · {v.questions.filter((q) => q.trim()).length}/30</span>
                </legend>
                <ol className="grid gap-2">
                  {v.questions.map((q, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-2.5 w-5 shrink-0 text-right text-[12px] font-semibold tabular text-muted-foreground">{i + 1}.</span>
                      <Textarea
                        rows={1}
                        value={q}
                        onChange={(e) => setQuestion(i, e.target.value)}
                        maxLength={1000}
                        aria-label={`Question ${i + 1}`}
                        className="min-h-10 min-w-0 flex-1 resize-y py-2"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey && i === v.questions.length - 1 && q.trim() && v.questions.length < 30) {
                            e.preventDefault();
                            set({ questions: [...v.questions, ''] });
                          }
                        }}
                      />
                      <div className="flex shrink-0 flex-col">
                        <Button type="button" variant="ghost" size="icon-sm" className="size-5" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move question ${i + 1} up`}>
                          <ArrowUp className="!size-3" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" className="size-5" disabled={i === v.questions.length - 1} onClick={() => move(i, 1)} aria-label={`Move question ${i + 1} down`}>
                          <ArrowDown className="!size-3" />
                        </Button>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => set({ questions: v.questions.length === 1 ? [''] : v.questions.filter((_, j) => j !== i) })}
                        aria-label={`Remove question ${i + 1}`}
                      >
                        <X />
                      </Button>
                    </li>
                  ))}
                </ol>
                {errors.questions && (
                  <p role="alert" className="text-[12px] font-medium text-danger">
                    {errors.questions}
                  </p>
                )}
                <Button type="button" variant="outline" size="sm" className="justify-self-start" disabled={v.questions.length >= 30} onClick={() => set({ questions: [...v.questions, ''] })}>
                  <Plus /> Add a question
                </Button>
              </fieldset>

              <fieldset className="grid gap-2">
                <legend className="mb-1.5 flex w-full items-center justify-between text-[13px] font-medium">
                  Attachments <span className="text-[11px] font-normal text-muted-foreground">Optional · {attachmentCount}/10</span>
                </legend>
                <p className="-mt-1 text-[12px] text-muted-foreground">Worksheets, pictures, short videos (up to 50 MB) or links to videos and readings.</p>
                <UploadRows items={uploads.items} onRemove={uploads.remove} />
                {v.links.length > 0 && (
                  <ul className="grid gap-1.5" aria-label="Links">
                    {v.links.map((l, i) => (
                      <li key={`${l.url}-${i}`} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
                        <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{l.name}</span>
                          <span className="block truncate text-[11.5px] text-muted-foreground">{l.url}</span>
                        </span>
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => set({ links: v.links.filter((_, j) => j !== i) })} aria-label={`Remove ${l.name}`}>
                          <X />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept={ATTACH_ACCEPT}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                  onChange={(e) => {
                    uploads.add(Array.from(e.target.files ?? []), attachmentCount);
                    e.target.value = '';
                  }}
                />
                <div className="grid gap-2 rounded-xl border border-dashed border-border p-2.5">
                  <Button type="button" variant="outline" size="sm" className="justify-self-start" disabled={attachmentCount >= 10} onClick={() => fileRef.current?.click()}>
                    <Paperclip /> Upload a file
                  </Button>
                  <div className="flex flex-col gap-2 sm:flex-row [&>*]:min-w-0">
                    <Input
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      placeholder="https://youtube.com/…"
                      inputMode="url"
                      aria-label="Link to add"
                      className="h-8 sm:flex-[3]"
                      invalid={!!errors.link}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addLink();
                        }
                      }}
                    />
                    <Input value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="Name (optional)" aria-label="Name for the link" maxLength={200} className="h-8 sm:flex-[2]" />
                    <Button type="button" variant="outline" size="sm" disabled={!linkUrl.trim() || attachmentCount >= 10} onClick={addLink}>
                      <Plus /> Add link
                    </Button>
                  </div>
                  {errors.link && (
                    <p role="alert" className="text-[12px] font-medium text-danger">
                      {errors.link}
                    </p>
                  )}
                </div>
              </fieldset>

              <fieldset className="grid gap-2">
                <legend className="mb-1.5 text-[13px] font-medium">How students can hand in</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SUBMISSION_TYPES.map((t) => (
                    <label key={t} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-[13px] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                      <Checkbox checked={v.submissionTypes.includes(t)} onCheckedChange={(c) => toggleType(t, c === true)} />
                      <span className="min-w-0">{SUBMISSION_TYPE_LABELS[t]}</span>
                    </label>
                  ))}
                </div>
                {errors.submissionTypes && (
                  <p role="alert" className="text-[12px] font-medium text-danger">
                    {errors.submissionTypes}
                  </p>
                )}
              </fieldset>

              <div className="grid grid-cols-2 gap-4 [&>*]:min-w-0">
                <Field label="Due" htmlFor="hw-due" error={errors.dueDate}>
                  <Input id="hw-due" type="date" value={v.dueDate} min={editing ? undefined : schoolToday(tz)} onChange={(e) => set({ dueDate: e.target.value })} className={dateInput} invalid={!!errors.dueDate} />
                </Field>
                <Field label="Marks" htmlFor="hw-max" optional error={errors.maxScore}>
                  <Input id="hw-max" type="number" inputMode="numeric" min={1} max={1000} step={1} value={v.maxScore} onChange={(e) => set({ maxScore: e.target.value })} placeholder="e.g. 20" invalid={!!errors.maxScore} className="tabular" />
                </Field>
              </div>

              <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-border px-3.5 py-3">
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium">Accept late work</span>
                  <span className="block text-[12px] text-muted-foreground">{v.allowLate ? 'Students can still hand in after the due date; it’s marked as late.' : 'Hand-ins close at the end of the due date.'}</span>
                </span>
                <Switch checked={v.allowLate} onCheckedChange={(allowLate) => set({ allowLate })} aria-label="Accept late work" className="mt-0.5" />
              </label>

              <Field
                label="Marking guide"
                htmlFor="hw-guide"
                optional
                error={errors.markingGuide}
                hint="Only teachers see this. AI uses it when suggesting marks."
              >
                <Textarea
                  id="hw-guide"
                  rows={3}
                  value={v.markingGuide}
                  onChange={(e) => set({ markingGuide: e.target.value })}
                  maxLength={5000}
                  placeholder="e.g. 5 marks: labelled diagram; 10 marks: correct equation and explanation; 5 marks: neatness"
                  invalid={!!errors.markingGuide}
                />
              </Field>

              {!published && (
                <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-3.5">
                  <Segmented
                    label="Publish or draft"
                    value={v.publish ? 'publish' : 'draft'}
                    onChange={(x) => set({ publish: x === 'publish' })}
                    options={[
                      { value: 'publish', label: 'Publish now' },
                      { value: 'draft', label: 'Save as draft' },
                    ]}
                    className="self-start"
                  />
                  {v.publish ? (
                    <div className="grid gap-1.5">
                      <Label>Tell parents</Label>
                      <ChannelChooser value={v.notify} onChange={(notify) => set({ notify })} label="Tell parents by" />
                    </div>
                  ) : (
                    <p className="text-[12.5px] text-muted-foreground">Only staff see drafts. Publish when you’re ready.</p>
                  )}
                </div>
              )}
              <FormError message={errors.form ?? errors.notifyParents} />
            </form>
          )}
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="hw-form" loading={save.isPending} disabled={!v || uploads.busy}>
            {!save.isPending && (v?.publish && !published ? <Send /> : null)}
            {published ? 'Save changes' : v?.publish ? 'Publish homework' : 'Save draft'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
