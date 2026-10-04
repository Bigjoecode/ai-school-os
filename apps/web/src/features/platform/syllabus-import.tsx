import { EXAM_LABELS, EXAMS, syllabusSaveSchema, type ExamBody, type SyllabusImportPreview } from '@aischool/shared';
import { BookOpenText, ChevronDown, FileUp, Loader2, Plus, Scale, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { plural } from '../operations/ui';
import { useExtractSyllabus, usePreviewSyllabus, useSaveSyllabus } from './content-api';

type Level = SyllabusImportPreview['level'];
const LEVELS: Level[] = ['PRIMARY', 'JUNIOR', 'SENIOR'];
const LEVEL_LABEL: Record<Level, string> = { PRIMARY: 'Primary', JUNIOR: 'Junior secondary', SENIOR: 'Senior secondary' };
/** Characters per AI request on the server (long syllabi are read in parts). */
const PART = 24_000;
const MAX_TEXT = 400_000;

interface EditSub {
  key: number;
  name: string;
  objectives: string;
}
interface EditTopic {
  key: number;
  name: string;
  objectives: string;
  content: string;
  subtopics: EditSub[];
}

let seq = 0;
const nextKey = () => ++seq;
const lines = (s: string) =>
  s
    .split('\n')
    .map((x) => x.replace(/^[\s\-•*\d.()]+(?=\S)/, '').trim())
    .filter(Boolean)
    .map((x) => x.slice(0, 300))
    .slice(0, 40);

export function SyllabusImport({ subjects, onSaved }: { subjects: string[]; onSaved?: () => void }) {
  const [exam, setExam] = useState<ExamBody>('WAEC');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState<{ name: string; chars: number } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [review, setReview] = useState<{ exam: ExamBody; subject: string; level: Level; topics: EditTopic[]; model: string } | null>(null);
  const extract = useExtractSyllabus();
  const preview = usePreviewSyllabus();
  const fileRef = useRef<HTMLInputElement>(null);
  const elapsed = useElapsed(preview.isPending);
  const parts = Math.min(12, Math.max(1, Math.ceil(text.trim().length / PART)));

  const onFile = (f: File | undefined) => {
    if (!f) return;
    extract.mutate(f, {
      onSuccess: (r) => {
        setText(r.text);
        setFile({ name: r.filename, chars: r.chars });
        setErrors((e) => ({ ...e, text: '' }));
      },
    });
  };

  const read = () => {
    const errs: Record<string, string> = {};
    if (subject.trim().length < 2) errs.subject = 'Name the subject';
    if (text.trim().length < 200) errs.text = 'Upload the syllabus or paste at least a page of its text';
    if (text.length > MAX_TEXT) errs.text = `At most ${formatNumber(MAX_TEXT)} characters — remove the preamble or split the syllabus`;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    preview.mutate(
      { exam, subject: subject.trim(), text: text.trim() },
      {
        onSuccess: (p) =>
          setReview({
            exam: p.exam,
            subject: p.subject,
            level: p.level,
            model: p.model,
            topics: p.topics.map((t) => ({ key: nextKey(), name: t.name, objectives: t.objectives.join('\n'), content: t.content ?? '', subtopics: t.subtopics.map((s) => ({ key: nextKey(), name: s.name, objectives: s.objectives.join('\n') })) })),
          }),
      },
    );
  };

  if (review) {
    return (
      <SyllabusReview
        value={review}
        onChange={setReview}
        onBack={() => setReview(null)}
        onSaved={() => {
          setReview(null);
          setText('');
          setFile(null);
          preview.reset();
          onSaved?.();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-xl border border-info/30 bg-info-soft/50 p-3 text-[12.5px]">
        <Scale className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
        <p>
          <strong>Official syllabi are public documents</strong> — WAEC, NECO, JAMB and BECE publish them for candidates, so importing their topics is fine. <strong>Past questions are different:</strong> they are copyrighted and need a licence before they go in the bank.
        </p>
      </div>
      <Card className="p-4 sm:p-5">
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Exam" htmlFor="s-exam">
              <Select value={exam} onValueChange={(v) => setExam(v as ExamBody)}>
                <SelectTrigger id="s-exam">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXAMS.map((e) => (
                    <SelectItem key={e} value={e}>
                      {EXAM_LABELS[e]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Subject" htmlFor="s-subject" error={errors.subject}>
              <Input id="s-subject" list="s-subject-list" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Biology" />
              <datalist id="s-subject-list">
                {subjects.map((s) => (
                  <option key={s} value={s.replace(/(^|\s)\S/g, (c) => c.toUpperCase())} />
                ))}
              </datalist>
            </Field>
          </div>

          <div className="rounded-xl border border-dashed border-border p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                <FileUp className="size-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1 text-[13px]">
                {file ? (
                  <p className="truncate font-medium" title={file.name}>
                    {file.name}
                  </p>
                ) : (
                  <p className="font-medium">Upload the syllabus</p>
                )}
                <p className="text-[12px] text-muted-foreground">{file ? `${formatNumber(file.chars)} characters read — check and tidy the text below` : 'PDF (with a text layer), Word (.docx) or a text file, up to 25 MB. Nothing is stored.'}</p>
              </div>
              <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" className="sr-only" onChange={(e) => (onFile(e.target.files?.[0]), (e.target.value = ''))} />
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} loading={extract.isPending} className="w-full sm:w-auto">
                <Upload /> {file ? 'Choose another' : 'Choose file'}
              </Button>
            </div>
            {extract.error && <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{errorMessage(extract.error)}</p>}
          </div>

          <Field label="Syllabus text" htmlFor="s-text" error={errors.text} hint="Filled from the file, or paste it here. Trimming the preamble, aims and reading lists makes reading faster.">
            <Textarea id="s-text" rows={12} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-[12px]" placeholder="SECTION A: … Topics, contents, notes and objectives as printed in the syllabus" />
          </Field>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12px] tabular text-muted-foreground">
              {formatNumber(text.length)} characters{text.trim().length >= 200 ? ` · read in ${plural(parts, 'part')}` : ''}
            </p>
            <Button onClick={read} loading={preview.isPending} disabled={extract.isPending} className="w-full sm:w-auto">
              <Sparkles /> Read syllabus
            </Button>
          </div>
          {preview.isPending && (
            <div className="flex items-start gap-3 rounded-xl bg-ai-2/[0.06] p-3 text-[13px]" role="status" aria-live="polite">
              <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-ai-2" aria-hidden />
              <div className="min-w-0">
                <p className="font-medium">
                  Reading the {EXAM_LABELS[exam]} syllabus{parts > 1 ? ` in ${parts} parts` : ''}… <span className="tabular text-muted-foreground">{elapsed}s</span>
                </p>
                <p className="text-[12.5px] text-muted-foreground">Laying it out as topics, subtopics and objectives. Long syllabi can take a minute or two — keep this tab open.</p>
              </div>
            </div>
          )}
          {preview.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{errorMessage(preview.error)}</p>}
        </div>
      </Card>
    </div>
  );
}

function useElapsed(running: boolean) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!running) return setS(0);
    const start = Date.now();
    const t = setInterval(() => setS(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [running]);
  return s;
}

// ------------------------------------------------------------------ review

type Review = { exam: ExamBody; subject: string; level: Level; topics: EditTopic[]; model: string };

function SyllabusReview({ value, onChange, onBack, onSaved }: { value: Review; onChange: (r: Review) => void; onBack: () => void; onSaved: () => void }) {
  const save = useSaveSyllabus();
  const [problems, setProblems] = useState<string[]>([]);
  const [leaving, setLeaving] = useState(false);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const setTopics = (fn: (ts: EditTopic[]) => EditTopic[]) => onChange({ ...value, topics: fn(value.topics) });
  const patch = (key: number, p: Partial<EditTopic>) => setTopics((ts) => ts.map((t) => (t.key === key ? { ...t, ...p } : t)));
  const toggle = (key: number) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const subCount = value.topics.reduce((t, x) => t + x.subtopics.length, 0);
  const objCount = value.topics.reduce((t, x) => t + lines(x.objectives).length + x.subtopics.reduce((u, s) => u + lines(s.objectives).length, 0), 0);

  const submit = () => {
    const body = {
      exam: value.exam,
      subject: value.subject,
      level: value.level,
      topics: value.topics.map((t) => ({ name: t.name.trim(), objectives: lines(t.objectives), content: t.content.trim().slice(0, 3000) || null, subtopics: t.subtopics.map((s) => ({ name: s.name.trim(), objectives: lines(s.objectives) })) })),
    };
    const parsed = syllabusSaveSchema.safeParse(body);
    if (!parsed.success) {
      setProblems(
        parsed.error.issues.slice(0, 8).map((i) => {
          const [, ti, , si] = i.path as (string | number)[];
          const where = typeof ti === 'number' ? `Topic ${ti + 1}${typeof si === 'number' ? `, subtopic ${si + 1}` : ''}` : 'Syllabus';
          return `${where}: ${i.path.includes('name') ? 'name must be 2–120 characters' : i.message}`;
        }),
      );
      return;
    }
    setProblems([]);
    save.mutate(parsed.data, {
      onSuccess: (r) => {
        toast.success(`${EXAM_LABELS[value.exam]} ${value.subject} saved to the topic graph`, { description: `${plural(r.created, 'new topic')}, ${plural(r.updated, 'existing topic')} updated` });
        onSaved();
      },
      onError: (e) => setProblems([errorMessage(e)]),
    });
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="font-display text-[16px] font-semibold tracking-tight">
              {EXAM_LABELS[value.exam]} · {value.subject.replace(/(^|\s)\S/g, (c) => c.toUpperCase())}
            </p>
            <p className="text-[12.5px] text-muted-foreground">
              {plural(value.topics.length, 'topic')} · {plural(subCount, 'subtopic')} · {plural(objCount, 'objective')} — read by {value.model}. Check names against the syllabus, delete anything that isn’t a teachable topic, then save.
            </p>
          </div>
          <div className="w-full shrink-0 sm:w-48">
            <label htmlFor="r-level" className="mb-1 block text-[12px] font-medium text-muted-foreground">
              Level
            </label>
            <Select value={value.level} onValueChange={(v) => onChange({ ...value, level: v as Level })}>
              <SelectTrigger id="r-level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEVELS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {LEVEL_LABEL[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground">Topics that already exist for this subject and level keep their place and gain {value.exam} and any new objectives, so one graph serves every exam.</p>
      </Card>

      <ol className="space-y-2">
        {value.topics.map((t, i) => {
          const isOpen = open.has(t.key);
          const objs = lines(t.objectives).length;
          return (
            <li key={t.key}>
              <Card className="p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-right text-[12px] tabular text-muted-foreground">{i + 1}</span>
                  <Input aria-label={`Topic ${i + 1} name`} value={t.name} onChange={(e) => patch(t.key, { name: e.target.value })} className={cn('min-w-0 flex-1 font-medium', (t.name.trim().length < 2 || t.name.trim().length > 120) && 'border-danger')} />
                  <Button variant="ghost" size="icon-sm" aria-label={isOpen ? 'Hide details' : 'Show objectives and subtopics'} aria-expanded={isOpen} onClick={() => toggle(t.key)}>
                    <ChevronDown className={cn('transition-transform', isOpen && 'rotate-180')} />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete topic ${t.name}`} onClick={() => setTopics((ts) => ts.filter((x) => x.key !== t.key))}>
                    <Trash2 />
                  </Button>
                </div>
                <button type="button" onClick={() => toggle(t.key)} className="ml-8 mt-1 text-left text-[12px] text-muted-foreground hover:text-foreground">
                  {plural(objs, 'objective')} · {plural(t.subtopics.length, 'subtopic')}
                  {!isOpen && t.subtopics.length > 0 && <span className="[overflow-wrap:anywhere]"> — {t.subtopics.map((s) => s.name).join(', ')}</span>}
                </button>
                {isOpen && (
                  <div className="mt-3 grid gap-3 sm:ml-8">
                    <Field label="Objectives" htmlFor={`o-${t.key}`} hint="One per line." optional>
                      <Textarea id={`o-${t.key}`} rows={Math.min(8, Math.max(3, objs + 1))} value={t.objectives} onChange={(e) => patch(t.key, { objectives: e.target.value })} className="text-[13px]" />
                    </Field>
                    {t.content && (
                      <Field label="Content notes" htmlFor={`c-${t.key}`} optional>
                        <Textarea id={`c-${t.key}`} rows={3} value={t.content} onChange={(e) => patch(t.key, { content: e.target.value })} className="text-[13px]" />
                      </Field>
                    )}
                    <div>
                      <p className="mb-2 text-[13px] font-medium">Subtopics</p>
                      <ul className="space-y-2">
                        {t.subtopics.map((s, j) => (
                          <li key={s.key} className="rounded-xl border border-border p-2.5">
                            <div className="flex items-center gap-2">
                              <Input
                                aria-label={`Subtopic ${j + 1} name`}
                                value={s.name}
                                onChange={(e) => patch(t.key, { subtopics: t.subtopics.map((x) => (x.key === s.key ? { ...x, name: e.target.value } : x)) })}
                                className={cn('min-w-0 flex-1', (s.name.trim().length < 2 || s.name.trim().length > 120) && 'border-danger')}
                              />
                              <Button variant="ghost" size="icon-sm" aria-label={`Delete subtopic ${s.name}`} onClick={() => patch(t.key, { subtopics: t.subtopics.filter((x) => x.key !== s.key) })}>
                                <X />
                              </Button>
                            </div>
                            <Textarea
                              aria-label={`Objectives for ${s.name}, one per line`}
                              rows={2}
                              value={s.objectives}
                              placeholder="Objectives, one per line (optional)"
                              onChange={(e) => patch(t.key, { subtopics: t.subtopics.map((x) => (x.key === s.key ? { ...x, objectives: e.target.value } : x)) })}
                              className="mt-2 min-h-[60px] text-[12.5px]"
                            />
                          </li>
                        ))}
                      </ul>
                      {t.subtopics.length < 40 && (
                        <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => patch(t.key, { subtopics: [...t.subtopics, { key: nextKey(), name: '', objectives: '' }] })}>
                          <Plus /> Add subtopic
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ol>
      {value.topics.length < 200 && (
        <Button
          variant="outline"
          onClick={() => {
            const key = nextKey();
            setTopics((ts) => [...ts, { key, name: '', objectives: '', content: '', subtopics: [] }]);
            setOpen((s) => new Set(s).add(key));
          }}
        >
          <Plus /> Add topic
        </Button>
      )}

      {problems.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-danger/30 bg-danger-soft/40 p-3 text-[12.5px] text-danger">
          {problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-2 border-t border-border bg-background/90 px-4 py-3 backdrop-blur sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:rounded-2xl sm:border">
        <Button variant="outline" onClick={() => setLeaving(true)} className="w-full sm:w-auto">
          Back to the text
        </Button>
        <Button onClick={submit} loading={save.isPending} disabled={!value.topics.length} className="w-full sm:w-auto">
          <BookOpenText /> Save {plural(value.topics.length, 'topic')} to topic graph
        </Button>
      </div>
      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title="Discard this review?"
        description="Your edits to the topic list will be lost. The syllabus text stays, so you can read it again."
        confirmLabel="Discard"
        onConfirm={() => {
          setLeaving(false);
          onBack();
        }}
      />
    </div>
  );
}
