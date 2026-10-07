import { DEFAULT_PASS_MARK, type ModuleDetail, type ModuleOptions } from '@aischool/shared';
import { Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api';
import { useAiDraft, useModuleTopics, useSaveModule } from './api';

export interface ModuleDefaults {
  classArmId?: string;
  classLevelId?: string;
  subjectId?: string;
  topicId?: string | null;
  topic?: string | null;
  week?: number | null;
  termId?: string | null;
  schemeWeekId?: string | null;
  library?: boolean;
}

function TopicSelect({ subjectId, classLevelId, value, onChange }: { subjectId?: string; classLevelId?: string; value: string | null; onChange: (id: string | null, name: string | null) => void }) {
  const topics = useModuleTopics(subjectId, classLevelId);
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v, topics.data?.find((t) => t.id === v)?.name ?? null)}>
      <SelectTrigger aria-label="Syllabus topic">
        <SelectValue placeholder={topics.isLoading ? 'Loading topics…' : 'Choose the topic'} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No syllabus topic</SelectItem>
        {(topics.data ?? []).map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.parent ? `${t.parent} › ` : ''}
            {t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** New module, or a module's details (title, class, topic, week, pass rules). */
export function ModuleDialog({ open, onOpenChange, options, defaults, module }: { open: boolean; onOpenChange: (o: boolean) => void; options: ModuleOptions; defaults?: ModuleDefaults; module?: ModuleDetail }) {
  const navigate = useNavigate();
  const save = useSaveModule();
  const library = module ? module.library : !!defaults?.library;
  const init = () => ({
    title: module?.title ?? '',
    summary: module?.summary ?? '',
    classArmId: module?.class?.id ?? defaults?.classArmId ?? options.classes[0]?.classArmId ?? '',
    classLevelId: module?.classLevel.id ?? defaults?.classLevelId ?? options.levels[0]?.id ?? '',
    subjectId: module?.subject.id ?? defaults?.subjectId ?? '',
    topicId: module?.topic?.id ?? defaults?.topicId ?? null,
    topicName: module?.topic?.name ?? defaults?.topic ?? null,
    week: module?.week ?? defaults?.week ?? null,
    mustPass: module?.mustPass ?? true,
    passMark: module?.passMark ?? DEFAULT_PASS_MARK,
  });
  const [v, setV] = useState(init);
  useEffect(() => {
    if (open) setV(init());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const cls = options.classes.find((c) => c.classArmId === v.classArmId);
  const subjects = library ? options.subjects : (cls?.subjects ?? []);
  const levelId = library ? v.classLevelId : cls?.classLevelId;
  useEffect(() => {
    if (open && !subjects.some((s) => s.id === v.subjectId) && subjects[0]) setV((x) => ({ ...x, subjectId: subjects[0]!.id, topicId: null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, v.classArmId, v.classLevelId]);

  const submit = () =>
    save.mutate(
      {
        id: module?.id,
        body: {
          title: v.title,
          summary: v.summary || null,
          subjectId: v.subjectId,
          classArmId: library ? null : v.classArmId,
          classLevelId: library ? v.classLevelId : null,
          topicId: v.topicId,
          topicName: v.topicName,
          termId: module?.termId ?? defaults?.termId ?? options.currentTerm?.id ?? null,
          week: v.week,
          schemeWeekId: module?.schemeWeek?.id ?? defaults?.schemeWeekId ?? null,
          lessonPlanId: module?.lessonPlan?.id ?? null,
          mustPass: v.mustPass,
          passMark: v.passMark,
        },
      },
      {
        onSuccess: (m) => {
          onOpenChange(false);
          if (!module) navigate(`/modules/${m.id}`);
          else toast.success('Details saved');
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{module ? 'Module details' : library ? 'New library module' : 'New lesson module'}</DialogTitle>
          <DialogDescription>{library ? 'Library modules are shared with every teacher of the subject and class level, who copy them into their own classes.' : 'A lesson unit for one class: content steps to teach from and short check-ins.'}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Field label="Title">
            <Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="e.g. Fractions: adding and subtracting" maxLength={160} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {library ? (
              <Field label="Class level">
                <Select value={v.classLevelId} onValueChange={(x) => setV({ ...v, classLevelId: x, topicId: null })} disabled={!!module}>
                  <SelectTrigger>
                    <SelectValue placeholder="Class level" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.levels.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <Field label="Class">
                <Select value={v.classArmId} onValueChange={(x) => setV({ ...v, classArmId: x, topicId: null })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Class" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.classes.map((c) => (
                      <SelectItem key={c.classArmId} value={c.classArmId}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Field label="Subject">
              <Select value={v.subjectId} onValueChange={(x) => setV({ ...v, subjectId: x, topicId: null })}>
                <SelectTrigger>
                  <SelectValue placeholder="Subject" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field label="Syllabus topic" hint="Check-in results count towards this topic in each student’s mastery.">
              <TopicSelect subjectId={v.subjectId} classLevelId={levelId} value={v.topicId} onChange={(id, name) => setV({ ...v, topicId: id, topicName: name ?? v.topicName })} />
            </Field>
            <Field label="Week" optional>
              <Input type="number" min={1} max={20} value={v.week ?? ''} onChange={(e) => setV({ ...v, week: e.target.value ? Number(e.target.value) : null })} />
            </Field>
          </div>
          <Field label="Summary" optional>
            <Textarea value={v.summary} onChange={(e) => setV({ ...v, summary: e.target.value })} rows={2} placeholder="What students will learn" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[1fr_140px] sm:items-end">
            <label className="flex items-start gap-3 rounded-xl border border-border p-3">
              <Switch checked={v.mustPass} onCheckedChange={(c) => setV({ ...v, mustPass: c })} aria-label="Must pass to continue" />
              <span className="text-[13px]">
                <span className="block font-medium">Must pass to continue</span>
                <span className="text-muted-foreground">Students working on their own must reach the pass mark in each check-in to unlock the next step.</span>
              </span>
            </label>
            <Field label="Pass mark (%)">
              <Input type="number" min={1} max={100} value={v.passMark} onChange={(e) => setV({ ...v, passMark: Math.min(100, Math.max(1, Number(e.target.value) || DEFAULT_PASS_MARK)) })} />
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="brand" onClick={submit} loading={save.isPending} disabled={v.title.trim().length < 2 || !v.subjectId}>
            {module ? 'Save' : 'Create module'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One click: the AI drafts the module (notes and a check-in) for the teacher to review. */
export function AiDraftDialog({ open, onOpenChange, options, defaults }: { open: boolean; onOpenChange: (o: boolean) => void; options: ModuleOptions; defaults?: ModuleDefaults }) {
  const navigate = useNavigate();
  const draft = useAiDraft();
  const [classArmId, setArm] = useState('');
  const [subjectId, setSubject] = useState('');
  const [topicId, setTopicId] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  const [guidance, setGuidance] = useState('');
  useEffect(() => {
    if (!open) return;
    setArm(defaults?.classArmId ?? options.classes[0]?.classArmId ?? '');
    setSubject(defaults?.subjectId ?? '');
    setTopicId(defaults?.topicId ?? null);
    setTopic(defaults?.topic ?? '');
    setGuidance('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const cls = options.classes.find((c) => c.classArmId === classArmId);
  const subjects = useMemo(() => cls?.subjects ?? [], [cls]);
  useEffect(() => {
    if (open && !subjects.some((s) => s.id === subjectId) && subjects[0]) setSubject(subjects[0].id);
  }, [open, subjects, subjectId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Draft a module with AI</DialogTitle>
          <DialogDescription>The AI writes the lesson notes in three steps, adds the school’s study materials on the topic and drafts a check-in. You review and edit it before publishing.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Class">
              <Select value={classArmId} onValueChange={setArm}>
                <SelectTrigger>
                  <SelectValue placeholder="Class" />
                </SelectTrigger>
                <SelectContent>
                  {options.classes.map((c) => (
                    <SelectItem key={c.classArmId} value={c.classArmId}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Subject">
              <Select value={subjectId} onValueChange={(x) => (setSubject(x), setTopicId(null))}>
                <SelectTrigger>
                  <SelectValue placeholder="Subject" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Syllabus topic">
            <TopicSelect subjectId={subjectId} classLevelId={cls?.classLevelId} value={topicId} onChange={(id, name) => (setTopicId(id), name && setTopic(name))} />
          </Field>
          <Field label="Or type the topic" optional>
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Simple interest" maxLength={160} />
          </Field>
          <Field label="Anything to include?" optional>
            <Textarea value={guidance} onChange={(e) => setGuidance(e.target.value)} rows={2} placeholder="e.g. Use market examples; the class found percentages hard last week" maxLength={600} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="ai"
            loading={draft.isPending}
            disabled={!classArmId || !subjectId || (!topicId && topic.trim().length < 2 && !defaults?.schemeWeekId)}
            onClick={() =>
              draft.mutate(
                { classArmId, subjectId, topicId, topic: topic || null, schemeWeekId: defaults?.schemeWeekId ?? null, termId: defaults?.termId ?? null, week: defaults?.week ?? null, guidance: guidance || null },
                {
                  onSuccess: (m) => {
                    toast.success('Draft ready — check it before you publish');
                    onOpenChange(false);
                    navigate(`/modules/${m.id}`);
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          >
            {!draft.isPending && <Sparkles />} Draft module
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Copy a module (library or another class) into one of my classes. */
export function CopyDialog({ open, onOpenChange, options, subjectId, classLevelId, onCopy, pending }: { open: boolean; onOpenChange: (o: boolean) => void; options: ModuleOptions; subjectId: string; classLevelId: string; onCopy: (classArmId: string) => void; pending?: boolean }) {
  const classes = options.classes.filter((c) => c.subjects.some((s) => s.id === subjectId) && c.classLevelId === classLevelId);
  const [arm, setArm] = useState('');
  useEffect(() => {
    if (open) setArm(classes[0]?.classArmId ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Copy into my class</DialogTitle>
          <DialogDescription>You get your own draft copy to adjust before publishing.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {classes.length ? (
            <Select value={arm} onValueChange={setArm}>
              <SelectTrigger aria-label="Class">
                <SelectValue placeholder="Class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.classArmId} value={c.classArmId}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-[13px] text-muted-foreground">You don’t teach this subject in a class at this level.</p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="brand" disabled={!arm} loading={pending} onClick={() => onCopy(arm)}>
            Copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
