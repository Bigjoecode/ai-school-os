import type { ClassTopicDetail, HomeworkRow } from '@aischool/shared';
import { Copy, Printer, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api';
import { HomeworkSheet } from '../live/homework-page';
import { addDays, schoolToday, useSchoolTz } from '../live/ui';
import { usePracticeDraft, usePracticeHomework, useRemedialLesson } from './api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  d: ClassTopicDetail;
}

// ------------------------------------------------------------------ remedial lesson

export function RemedialDialog({ open, onOpenChange, d, classArmId, subjectId }: Props & { classArmId: string; subjectId: string }) {
  const navigate = useNavigate();
  const make = useRemedialLesson();
  const [date, setDate] = useState('');
  const [minutes, setMinutes] = useState('40');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (open) {
      setDate('');
      setMinutes('40');
      setNote('');
    }
  }, [open]);
  const submit = () =>
    make.mutate(
      { classArmId, subjectId, topicId: d.topic.id, date: date || undefined, durationMinutes: Number(minutes), note: note.trim() || undefined },
      {
        onSuccess: (r) => {
          toast.success('Remedial lesson is being written', { description: 'It opens as a draft for you to review and edit.' });
          onOpenChange(false);
          void navigate(`/lessons/${r.lessonId}`);
        },
        onError: (e) => toast.error(errorMessage(e, 'Couldn’t start the lesson plan')),
      },
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Remedial lesson: {d.topic.name}</DialogTitle>
          <DialogDescription>
            AI plans a re-teaching lesson for {d.classLabel} from what the class evidence shows: {d.struggling.length} of {d.assessed} assessed students are below 50%. It is saved as a draft lesson plan for you to review, edit and submit for vetting as usual.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" htmlFor="rl-date" optional>
              <Input id="rl-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Length" htmlFor="rl-minutes">
              <Select value={minutes} onValueChange={setMinutes}>
                <SelectTrigger id="rl-minutes">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['35', '40', '45', '60', '80'].map((m) => (
                    <SelectItem key={m} value={m}>
                      {m} minutes
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Anything else to cover" htmlFor="rl-note" optional hint="For example: “Many confuse the subject with the nearest noun.”">
            <Textarea id="rl-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={400} />
          </Field>
          <p className="text-[12px] text-muted-foreground">The plan includes support, core and stretch activities and 3–4 quick checks for understanding.</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="ai" onClick={submit} loading={make.isPending}>
            <Sparkles /> Generate lesson plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ practice homework

export function PracticeDialog({ open, onOpenChange, d, classArmId, subjectId, canAi }: Props & { classArmId: string; subjectId: string; canAi: boolean }) {
  const tz = useSchoolTz();
  const draft = usePracticeDraft();
  const save = usePracticeHomework();
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [questions, setQuestions] = useState<string[]>(['', '', '', '', '']);
  const [due, setDue] = useState('');
  const [review, setReview] = useState<HomeworkRow | null>(null);
  useEffect(() => {
    if (!open) return;
    setTitle(`Practice: ${d.topic.name}`.slice(0, 160));
    setInstructions(`Answer all five questions on ${d.topic.name}. Show your working.`);
    setQuestions(['', '', '', '', '']);
    setDue(addDays(schoolToday(tz), 3));
  }, [open, d.topic.name, tz]);

  const aiDraft = () =>
    draft.mutate(
      { classArmId, subjectId, topicId: d.topic.id },
      {
        onSuccess: (r) => {
          if (r.source !== 'AI') {
            toast.info('AI isn’t available just now. Write the questions yourself.');
            return;
          }
          setTitle(r.title);
          setInstructions(r.instructions);
          setQuestions([...r.questions, '', '', '', '', ''].slice(0, Math.max(5, r.questions.length)));
          toast.success('Five questions drafted. Check and edit them before saving.');
        },
        onError: (e) => toast.error(errorMessage(e, 'Couldn’t draft questions')),
      },
    );
  const filled = questions.map((q) => q.trim()).filter((q) => q.length >= 2);
  const submit = () =>
    save.mutate(
      { classArmId, subjectId, topicId: d.topic.id, title: title.trim(), instructions: instructions.trim(), questions: filled, dueDate: due },
      {
        onSuccess: (row) => {
          onOpenChange(false);
          if (row) setReview(row);
          else toast.success('Saved as a draft in Homework');
        },
        onError: (e) => toast.error(errorMessage(e, 'Couldn’t save the homework')),
      },
    );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Practice homework: {d.topic.name}</DialogTitle>
            <DialogDescription>Five short questions for {d.classLabel}, linked to the topic so marked work updates mastery. It is saved as a draft; you finish and publish it in the homework form.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            {canAi && (
              <Button variant="ai" size="sm" className="justify-self-start" onClick={aiDraft} loading={draft.isPending}>
                <Sparkles /> Draft 5 questions with AI
              </Button>
            )}
            <Field label="Title" htmlFor="ph-title">
              <Input id="ph-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
            </Field>
            <Field label="Instructions" htmlFor="ph-instructions">
              <Textarea id="ph-instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} maxLength={3000} />
            </Field>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-[13px] font-medium">Questions</legend>
              {questions.map((q, i) => (
                <Textarea
                  key={i}
                  value={q}
                  onChange={(e) => setQuestions((qs) => qs.map((x, j) => (j === i ? e.target.value : x)))}
                  rows={2}
                  maxLength={1000}
                  aria-label={`Question ${i + 1}`}
                  placeholder={`Question ${i + 1}`}
                />
              ))}
            </fieldset>
            <Field label="Due" htmlFor="ph-due" className="sm:max-w-[200px]">
              <Input id="ph-due" type="date" value={due} min={schoolToday(tz)} onChange={(e) => setDue(e.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={save.isPending} disabled={!filled.length || title.trim().length < 2 || instructions.trim().length < 2 || !due}>
              Save draft and review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <HomeworkSheet open={!!review} onOpenChange={(o) => !o && setReview(null)} homework={review} />
    </>
  );
}

// ------------------------------------------------------------------ support group

export function GroupDialog({ open, onOpenChange, d }: Props) {
  const lines = d.struggling.map((s, i) => `${i + 1}. ${s.name} (${s.admissionNumber}) – ${s.score}%`);
  const heading = `${d.classLabel} ${d.subject}: support group for ${d.topic.name}`;
  const text = `${heading}\n${lines.join('\n')}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('List copied');
    } catch {
      toast.error('Couldn’t copy. Select the list and copy it instead.');
    }
  };
  const print = () => {
    const w = window.open('', '_blank');
    if (!w) {
      toast.error('Allow pop-ups to print the list');
      return;
    }
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${esc(heading)}</title><style>body{font:14px/1.5 system-ui,sans-serif;margin:32px;color:#111}h1{font-size:18px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 8px;text-align:left}</style></head><body>` +
        `<h1>${esc(heading)}</h1><p>Students below 50% on this topic.</p><table><thead><tr><th>#</th><th>Name</th><th>Admission no.</th><th>Mastery</th><th>Notes</th></tr></thead><tbody>` +
        d.struggling.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td>${esc(s.admissionNumber)}</td><td>${s.score}%</td><td></td></tr>`).join('') +
        `</tbody></table></body></html>`,
    );
    w.document.close();
    w.focus();
    w.print();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Support group: {d.topic.name}</DialogTitle>
          <DialogDescription>
            {d.struggling.length} student{d.struggling.length === 1 ? '' : 's'} in {d.classLabel} below 50%, weakest first. Work with them as a small group while the rest of the class practises.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ol className="space-y-1 rounded-xl border border-border p-3 text-[13px]">
            {d.struggling.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="text-[12px] text-muted-foreground">{s.admissionNumber}</span>
                <span className="w-10 text-right font-medium text-danger tabular">{s.score}%</span>
              </li>
            ))}
          </ol>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={print}>
            <Printer /> Print
          </Button>
          <Button onClick={() => void copy()}>
            <Copy /> Copy list
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
